<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import * as THREE from 'three';
    import * as OBC from '@thatopen/components';
    import * as OBCF from '@thatopen/components-front';
    import { browser } from '$app/environment';
    import { post } from '$lib/services/api';
  
    // --- Props ---
    export let modelUrl: string | null = null;
  
    // --- UI State ---
    let container: HTMLDivElement;
    let isLoading = true;
    let loadingText = "Initialisiere Engine...";
    
    // Tree View State
    type TreeItem = {
      id: string;
      name: string;
      type: 'model' | 'category';
      count?: number;
      children?: TreeItem[];
      isOpen?: boolean;
      visible?: boolean;
      modelId?: string; // Reference to model UUID
      categoryId?: string; // Reference to IFC Category
    };
    
    let treeData: TreeItem[] = [];
    let properties: Record<string, any> | null = null;
    let activeTool: 'select' | 'measure' | 'clip' = 'select';
    
    // --- Engine State ---
    let components: OBC.Components;
    let world: OBC.SimpleWorld<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>;
    let loader: OBC.IfcLoader;
    let fragments: OBC.FragmentsManager;
    let highlighter: OBCF.Highlighter;
    let clipper: OBC.Clipper;
    let dimensions: OBCF.LengthMeasurement;
    let classifier: OBC.Classifier;
    
    // Global Alignment
    let globalYShift: number | null = null;
    let models: any[] = [];
  
    $: if (modelUrl && loader) {
      loadModelFromUrl(modelUrl);
    }
  
    onMount(async () => {
      if (!browser) return;
      await initEngine();
    });
  
    onDestroy(() => {
      if (components) components.dispose();
    });
  
    async function initEngine() {
      components = new OBC.Components();
      const worlds = components.get(OBC.Worlds);
      world = worlds.create();
  
      // Szene, Renderer, Kamera
      world.scene = new OBC.SimpleScene(components);
      world.renderer = new OBC.SimpleRenderer(components, container);
      world.camera = new OBC.OrthoPerspectiveCamera(components);
  
      components.init();
      
      // Setup Scene
      world.scene.setup();
      world.scene.three.background = null; // Transparenz für CSS Hintergrund
      
      // Lighting
      const ambient = new THREE.AmbientLight(0xffffff, 0.6);
      const dir = new THREE.DirectionalLight(0xffffff, 1.2);
      dir.position.set(20, 50, 20);
      const fill = new THREE.DirectionalLight(0xbcf166, 0.3);
      fill.position.set(-10, 10, -10);
      world.scene.three.add(ambient, dir, fill);
  
      // Grid
      const grids = components.get(OBC.Grids);
      grids.create(world);
  
      // Loader Config
      fragments = components.get(OBC.FragmentsManager);
      loader = components.get(OBC.IfcLoader);
      
      await loader.setup();
      loader.settings.wasm = {
          path: "https://unpkg.com/web-ifc@0.0.56/",
          absolute: true
      };
      loader.settings.webIfc.COORDINATE_TO_ORIGIN = true;
      loader.settings.webIfc.OPTIMIZE_PROFILES = true;
  
      // Tools
      highlighter = components.get(OBCF.Highlighter);
      highlighter.setup({ world });
      
      clipper = components.get(OBC.Clipper);
      clipper.enabled = false;
  
      dimensions = components.get(OBCF.LengthMeasurement);
      dimensions.world = world;
      dimensions.enabled = false;
      dimensions.snapDistance = 1;
  
      classifier = components.get(OBC.Classifier);
  
      // Events
      highlighter.events.select.onHighlight.add((fragmentIdMap) => {
          updateProperties(fragmentIdMap);
      });
      
      highlighter.events.select.onClear.add(() => {
          properties = null;
      });
  
      isLoading = false;
    }
  
    async function loadModelFromUrl(url: string) {
      isLoading = true;
      loadingText = "Lade Modell von URL...";
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Fehler beim Herunterladen der Datei: ${response.statusText}`);
        }
        const buffer = await response.arrayBuffer();
        const data = new Uint8Array(buffer);
        
        // Clear existing models before loading a new one
        if (fragments.groups.size > 0) {
            fragments.dispose();
            treeData = [];
            models = [];
            globalYShift = null;
        }

        const model = await loader.load(data);
        const fileName = url.split('/').pop() || "Modell";
        model.name = fileName;

        world.scene.three.add(model);
        models.push(model);
        
        applyGlobalShift(model);
        await updateTree(model);

        fitModel();

      } catch (err) {
        console.error(err);
        alert(`Fehler beim Laden des Modells von URL: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`);
      } finally {
        isLoading = false;
      }
    }
  
    // --- Logic ---
  
    async function handleFileUpload(e: Event) {
      const target = e.target as HTMLInputElement;
      if (!target.files?.length) return;
      
      isLoading = true;
      
      for (const file of target.files) {
        loadingText = `Fordere Upload-URL für ${file.name} an...`;
        try {
          // 1. Get signed URL from our backend
          const response = await post('files/upload-url', {
            name: file.name,
            content_type: file.type,
          });

          const { signed_url } = response;
          
          if (!signed_url) {
            throw new Error('Keine gültige Upload-URL erhalten.');
          }

          loadingText = `Lade ${file.name} hoch...`;

          // 2. Upload file directly to Supabase Storage
          const uploadResponse = await fetch(signed_url, {
            method: 'PUT',
            headers: {
              'Content-Type': file.type,
            },
            body: file,
          });

          if (!uploadResponse.ok) {
            const errorBody = await uploadResponse.text();
            console.error('Supabase upload error:', errorBody);
            throw new Error(`Fehler beim Hochladen zu Supabase: ${uploadResponse.statusText}`);
          }

          loadingText = `Verarbeite ${file.name}...`;

          // 3. (For now) Load the model from the uploaded file buffer to keep viewer working
          // In the future, we'll load it from a Supabase URL
          const buffer = await file.arrayBuffer();
          const data = new Uint8Array(buffer);
          const model = await loader.load(data);
          model.name = file.name;
          world.scene.three.add(model);
          models.push(model);
          
          applyGlobalShift(model);
          await updateTree(model);

        } catch (err) {
          console.error(err);
          alert(`Fehler beim Hochladen von ${file.name}: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`);
        }
      }
      
      fitModel();
      isLoading = false;
      target.value = ''; // Reset
    }
  
    function applyGlobalShift(model: any) {
      model.updateMatrixWorld(true);
      const bbox = new THREE.Box3().setFromObject(model);
      const minY = bbox.min.y;
  
      if (Number.isFinite(minY)) {
          if (globalYShift === null) {
              globalYShift = -minY;
              console.log(`Globaler Shift gesetzt: ${globalYShift}`);
          }
          if (globalYShift !== 0) {
              model.position.y += globalYShift;
              model.updateMatrixWorld(true);
          }
      }
    }
  
    async function updateTree(model: any) {
      // Spatial Klassifizierung (falls vorhanden)
      try { await classifier.bySpatialStructure(model); } catch {}
      // Entity Klassifizierung (Fallback)
      try { await classifier.byEntity(model); } catch {}
  
      // Wir erstellen den Baum-Knoten für das Modell
      const modelNode: TreeItem = {
          id: model.uuid,
          name: model.name,
          type: 'model',
          isOpen: true,
          children: []
      };
  
      // Kategorien auslesen (Sichere Iteration über das Classifier Objekt/Map)
      const classification = classifier.list.entities;
      if (classification && classification.map) {
          const entries = classification.map instanceof Map 
              ? Array.from(classification.map.entries()) 
              : Object.entries(classification.map);
  
          // Sortieren
          entries.sort((a, b) => a[0].localeCompare(b[0]));
  
          for (const [category, ids] of entries) {
              let count = 0;
              const idValues = ids instanceof Map ? ids.values() : Object.values(ids);
              for(const expressIDs of idValues) {
                   count += (expressIDs instanceof Set) ? expressIDs.size : Object.keys(expressIDs).length;
              }
              
              if (count === 0) continue;
  
              let cleanName = category.replace('IFC', '');
              cleanName = cleanName.charAt(0) + cleanName.slice(1).toLowerCase();
  
              modelNode.children?.push({
                  id: `${model.uuid}-${category}`,
                  name: cleanName,
                  type: 'category',
                  count: count,
                  visible: true,
                  categoryId: category
              });
          }
      }
  
      // Reactivity Update: Neues Array zuweisen
      treeData = [...treeData, modelNode];
    }
  
    function fitModel() {
      const bbox = new THREE.Box3();
      for (const group of fragments.groups.values()) {
          group.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(group);
          if (!box.isEmpty()) bbox.union(box);
      }
      if (!bbox.isEmpty()) world.camera.controls.fitToBox(bbox, true);
    }
  
    async function updateProperties(fragmentIdMap: any) {
      const fid = Object.keys(fragmentIdMap)[0];
      if (!fid) return;
      const ids = fragmentIdMap[fid];
      const eid = [...ids][0];
      
      const fragment = fragments.list.get(fid);
      if (!fragment) return;
      
      const model = fragment.group;
      const props = await model.getProperties(eid);
      
      // Einfaches Objekt für die UI erstellen
      if (props) {
          const cleanProps: Record<string, any> = {};
          for (const key in props) {
              const val = props[key];
              if (val && val.value !== undefined && key !== "Name" && key !== "GlobalId") {
                  cleanProps[key] = val.value;
              }
          }
          properties = {
              Name: props.Name?.value || "Unbenannt",
              ID: eid,
              ...cleanProps
          };
      }
    }
  
    // --- Tools Logic ---
    function setTool(tool: 'select' | 'measure' | 'clip') {
      activeTool = tool;
      
      // Reset
      clipper.enabled = false;
      dimensions.enabled = false;
      highlighter.enabled = false;
      highlighter.clear('select');
      
      // Remove listeners (brute force clear on container for Svelte simplicity)
      // In Svelte better: conditional logic inside the event handler
      
      if (tool === 'select') {
          highlighter.enabled = true;
      } else if (tool === 'clip') {
          clipper.enabled = true;
          highlighter.enabled = true; // Selection helps clipping
      } else if (tool === 'measure') {
          dimensions.enabled = true;
      }
    }
  
    function onCanvasDblClick() {
      if (activeTool === 'clip') clipper.create(world);
      if (activeTool === 'measure') dimensions.create();
    }
  
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Delete' || e.code === 'Backspace') {
          if (activeTool === 'clip') clipper.delete(world);
          if (activeTool === 'measure') dimensions.delete();
      }
      if (e.code === 'Escape') setTool('select');
    }
  
    function toggleVisibility(item: TreeItem) {
      if (item.type === 'category' && item.categoryId) {
          const isVisible = !item.visible;
          // Toggle Logic in Tree Data
          item.visible = isVisible;
          treeData = treeData; // Trigger reactivity
  
          // Apply to Fragments
          const found = classifier.find({ entities: [item.categoryId] });
          for (const fragID in found) {
              const fragment = fragments.list.get(fragID);
              if (fragment) {
                  const ids = found[fragID];
                  fragment.setVisibility(isVisible, ids);
              }
          }
      }
    }
  </script>
  
  <svelte:window on:keydown={onKeyDown} />
  
  <div class="flex h-screen w-full bg-[#1e1e1e] text-[#e0e0e0] font-sans overflow-hidden">
      
      <!-- LEFT SIDEBAR: Structure -->
      <div class="w-[300px] flex flex-col border-r border-[#3e3e42] bg-[#252526]">
          <div class="p-3 text-xs font-bold uppercase tracking-widest text-[#858585] border-b border-[#3e3e42] flex justify-between">
              Modell Struktur
              <button class="hover:text-white" on:click={() => treeData = []}>Clear</button>
          </div>
          
          <div class="flex-1 overflow-y-auto p-1">
              {#if treeData.length === 0}
                  <div class="p-5 text-center text-xs italic text-[#858585]">Kein Modell geladen</div>
              {/if}
  
              {#each treeData as model}
                  <div class="mb-1">
                      <!-- Model Header -->
                      <div class="flex items-center p-1 px-2 rounded cursor-pointer hover:bg-white/5 text-[#bcf166]">
                          <span class="material-icons-round text-sm mr-2">domain</span>
                          <span class="text-xs font-bold truncate">{model.name}</span>
                      </div>
                      
                      <!-- Categories -->
                      {#if model.children}
                          <div class="pl-4">
                              {#each model.children as cat}
                                  <!-- svelte-ignore a11y-click-events-have-key-events -->
                                  <div class="flex items-center p-1 px-2 rounded cursor-pointer hover:bg-white/5 text-xs group" 
                                       class:opacity-50={!cat.visible}>
                                      <span class="material-icons-round text-sm mr-2 text-[#858585]">category</span>
                                      <span class="flex-1">{cat.name} <span class="text-[#858585]">({cat.count})</span></span>
                                      <!-- Visibility Toggle -->
                                      <button class="opacity-0 group-hover:opacity-100 hover:text-white" on:click|stopPropagation={() => toggleVisibility(cat)}>
                                          <span class="material-icons-round text-sm">
                                              {cat.visible ? 'visibility' : 'visibility_off'}
                                          </span>
                                      </button>
                                  </div>
                              {/each}
                          </div>
                      {/if}
                  </div>
              {/each}
          </div>
  
          <!-- Upload Area -->
          <div class="p-3 border-t border-[#3e3e42] bg-[#2a2a2b]">
              <label class="flex items-center justify-center w-full bg-[#bcf166] hover:bg-[#a3d655] text-black font-bold py-2 rounded text-xs cursor-pointer transition gap-2">
                  <span class="material-icons-round text-sm">upload_file</span>
                  IFC Öffnen
                  <input type="file" accept=".ifc" multiple class="hidden" on:change={handleFileUpload}>
              </label>
          </div>
      </div>
  
      <!-- CENTER: Viewport -->
      <div class="flex-1 relative bg-gradient-to-b from-[#2a2a2a] to-[#111]">
          <!-- 3D Canvas -->
          <div bind:this={container} 
               class="w-full h-full outline-none cursor-crosshair"
               on:dblclick={onCanvasDblClick}
               role="application">
          </div>
  
          <!-- Toolbar -->
          <div class="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1 p-1 bg-[#252526]/90 backdrop-blur border border-[#3e3e42] rounded-lg shadow-xl z-10">
              <button class="w-10 h-10 flex flex-col items-center justify-center rounded hover:bg-white/10 transition {activeTool === 'select' ? 'text-[#bcf166] bg-[#bcf166]/10' : 'text-[#858585]'}"
                      on:click={() => setTool('select')} title="Auswahl">
                  <span class="material-icons-round">mouse</span>
              </button>
              <button class="w-10 h-10 flex flex-col items-center justify-center rounded hover:bg-white/10 transition {activeTool === 'measure' ? 'text-[#bcf166] bg-[#bcf166]/10' : 'text-[#858585]'}"
                      on:click={() => setTool('measure')} title="Messen">
                  <span class="material-icons-round">straighten</span>
              </button>
              <button class="w-10 h-10 flex flex-col items-center justify-center rounded hover:bg-white/10 transition {activeTool === 'clip' ? 'text-[#bcf166] bg-[#bcf166]/10' : 'text-[#858585]'}"
                      on:click={() => setTool('clip')} title="Schnitt">
                  <span class="material-icons-round">content_cut</span>
              </button>
              <div class="w-px bg-[#3e3e42] mx-1"></div>
              <button class="w-10 h-10 flex flex-col items-center justify-center rounded hover:bg-white/10 text-[#858585]"
                      on:click={fitModel} title="Zoom Alles">
                  <span class="material-icons-round">fit_screen</span>
              </button>
          </div>
  
          <!-- Loader -->
          {#if isLoading}
              <div class="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-50">
                  <div class="w-10 h-10 border-4 border-[#333] border-t-[#bcf166] rounded-full animate-spin mb-4"></div>
                  <div class="text-white text-sm font-bold">{loadingText}</div>
              </div>
          {/if}
          
          <!-- Help Hint -->
          <div class="absolute top-4 left-4 p-2 bg-black/50 rounded text-[10px] text-[#858585] pointer-events-none">
              LMT: Drehen | RMT: Pan | Scroll: Zoom<br>
              Doppelklick: Aktion (Messen/Schnitt)
          </div>
      </div>
  
      <!-- RIGHT SIDEBAR: Properties -->
      <div class="w-[300px] flex flex-col border-l border-[#3e3e42] bg-[#252526]">
          <div class="p-3 text-xs font-bold uppercase tracking-widest text-[#858585] border-b border-[#3e3e42]">
              Eigenschaften
          </div>
          <div class="flex-1 overflow-y-auto">
              {#if properties}
                  <div class="p-4 bg-[#333] border-b border-[#444] mb-2">
                      <div class="text-[#bcf166] text-xs font-bold uppercase">Entity</div>
                      <div class="text-white font-bold text-lg break-words">{properties.Name}</div>
                      <div class="text-[#858585] text-xs mt-1">ID: {properties.ID}</div>
                  </div>
                  {#each Object.entries(properties) as [key, value]}
                      {#if key !== 'Name' && key !== 'ID'}
                          <div class="grid grid-cols-[120px_1fr] gap-2 px-4 py-2 border-b border-[#333] text-xs">
                              <div class="text-[#858585] font-medium truncate" title={key}>{key}</div>
                              <div class="text-[#e0e0e0] break-words">{value}</div>
                          </div>
                      {/if}
                  {/each}
              {:else}
                  <div class="p-5 text-center text-xs italic text-[#858585]">Wähle ein Element aus</div>
              {/if}
          </div>
      </div>
  </div>