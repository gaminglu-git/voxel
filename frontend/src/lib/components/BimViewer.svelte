<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import * as THREE from 'three';
    import { TransformControls } from 'three-stdlib';
    import * as OBC from '@thatopen/components';
    import * as OBCF from '@thatopen/components-front';
    import { browser } from '$app/environment';
    import { post } from '$lib/services/api';
    import type { MarketplaceItem } from './Marketplace.svelte';
    
    // Import web-ifc directly to configure WASM path before ThatOpen Components loads it
    // This prevents version mismatches that cause "callbacks.shift() is not a function" errors
    let webIfc: any = null;
    
    // FragmentLoader import - CommonJS module workaround
    // Will be loaded dynamically in browser only when needed
    let FragmentLoader: any = null;
  
    // --- Props ---
    let { modelUrl = null, analysisResult = null, onSceneModelUpdate } = $props<{
      modelUrl?: string | null;
      analysisResult?: { wall_count: number } | null;
      onSceneModelUpdate?: (event: { sceneModel: SceneModelItem[] }) => void;
    }>();
  
    // --- UI State ---
    let container: HTMLDivElement;
    let isLoading = $state(true);
    let loadingText = $state("Initialisiere Engine...");
    let engineInitialized = $state(false);
    
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
    
    let treeData = $state<TreeItem[]>([]);
    let properties = $state<Record<string, any> | null>(null);
    let activeTool = $state<'select' | 'measure' | 'clip'>('select');
    
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
    let globalYShift = $state<number | null>(null);
    let models = $state<any[]>([]);
    
    // SceneModel State (for Marketplace items)
    export type SceneModelItem = {
      itemId: string;
      instanceId: string; // Unique ID for this instance in the scene
      position: [number, number, number];
      rotation: [number, number, number];
      scale: [number, number, number];
      properties: Record<string, any>;
    };
    
    let sceneModel = $state<SceneModelItem[]>([]);
    let fragmentLoader: any = null;
    let transformControls: TransformControls | null = null;
    let selectedInstance: THREE.Object3D | null = null;
  
    $effect(() => {
      if (modelUrl && loader && engineInitialized) {
        loadModelFromUrl(modelUrl);
      }
    });
  
    onMount(async () => {
      if (!browser) return;
      await initEngine();
    });
  
    onDestroy(() => {
      if (container) {
        container.removeEventListener('dragover', handleDragOver);
        container.removeEventListener('drop', handleDrop);
      }
      if (transformControls) {
        world.scene.three.remove(transformControls);
        transformControls.dispose();
      }
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
      // Initialize FragmentsManager if needed
      if (fragments && typeof (fragments as any).init === 'function') {
        try {
          (fragments as any).init();
          console.log('FragmentsManager initialized');
        } catch (fragInitError) {
          console.warn('FragmentsManager init failed (may not be required):', fragInitError);
        }
      }
      
    
    loader = components.get(OBC.IfcLoader);
    
    // Use local WASM files to ensure version consistency
    // This resolves "callbacks.shift is not a function" errors caused by version mismatches
    let wasmPath = "/wasm/";
    
    // Set WASM path in loader settings
    loader.settings.wasm = {
        path: wasmPath,
        absolute: true
    };
    
    // DISABLE automatic WASM path detection to prevent overriding our local path
    // This is critical because ThatOpen Components fetches its package.json and sets WASM to the peerDependency version
    loader.settings.autoSetWasm = false;

    // Configure web-ifc manually if needed
    try {
      const webIfcModule = await import('web-ifc');
      webIfc = webIfcModule;
      
      if (webIfc && typeof webIfc.SetWasmPath === 'function') {
        webIfc.SetWasmPath(wasmPath);
      }
    } catch (e) {
      console.warn('Could not configure web-ifc directly:', e);
    }
    
    console.log('WASM configuration:', {
      path: loader.settings.wasm?.path,
      absolute: loader.settings.wasm?.absolute,
      expected: wasmPath
    });
    
    // Setup loader (this initializes WebAssembly)
    console.log('Setting up IFC loader...');
    const setupStartTime = performance.now();
    try {
      // Pass config to setup to ensure autoSetWasm is disabled
      await loader.setup({ autoSetWasm: false });
      const setupDuration = ((performance.now() - setupStartTime) / 1000).toFixed(2);
      console.log(`IFC loader setup complete in ${setupDuration}s`);
        
        // Verify WASM path AFTER setup (to catch any overrides)
        const actualPath = loader.settings.wasm?.path;
        console.log('WASM configuration (after setup):', {
          path: actualPath,
          absolute: loader.settings.wasm?.absolute,
          expected: wasmPath,
          matches: actualPath === wasmPath
        });
        
        // Verify WASM path after setup - should match our configured version (0.0.72)
        if (actualPath && actualPath !== wasmPath) {
          console.warn('WASM path was changed during setup:', {
            expected: wasmPath,
            actual: actualPath,
            note: 'This may cause issues if versions are incompatible'
          });
          // Update our reference to match what ThatOpen Components actually loaded
          wasmPath = actualPath;
        } else {
          console.log('✅ WASM version matches expected version:', wasmPath);
        }
      } catch (setupError) {
        console.error('Loader setup failed:', setupError);
        throw new Error(`IFC Loader Setup fehlgeschlagen: ${setupError instanceof Error ? setupError.message : 'Unbekannter Fehler'}`);
      }
      
      // Verify loader is ready after setup
      if (!loader || !loader.settings || !loader.settings.webIfc) {
        throw new Error('Loader ist nach Setup nicht korrekt initialisiert');
      }
      
      loader.settings.webIfc.COORDINATE_TO_ORIGIN = true;
      // OPTIMIZE_PROFILES can be very slow for complex files - disable if performance is an issue
      // @ts-ignore - OPTIMIZE_PROFILES missing in type definition but present in web-ifc
      loader.settings.webIfc.OPTIMIZE_PROFILES = false;
      
      // Performance optimizations
      loader.settings.webIfc.MEMORY_LIMIT = 2 * 1024 * 1024 * 1024; // 2GB memory limit
      // @ts-ignore - CIRCLE_SEGMENTS properties missing in type definition
      loader.settings.webIfc.CIRCLE_SEGMENTS_LOW = 8;
      // @ts-ignore
      loader.settings.webIfc.CIRCLE_SEGMENTS_MEDIUM = 12;
      // @ts-ignore
      loader.settings.webIfc.CIRCLE_SEGMENTS_HIGH = 16;
      
      // Additional performance settings
      // @ts-ignore - USE_FAST_BOOLS missing in type definition
      loader.settings.webIfc.USE_FAST_BOOLS = true;
      
      // Additional optimizations for large/complex files (only if supported by web-ifc version)
      // These settings may not be available in all web-ifc versions, so we check first
      try {
        // Increase tape size for larger files (if supported)
        if (typeof loader.settings.webIfc.TAPE_SIZE !== 'undefined') {
          loader.settings.webIfc.TAPE_SIZE = 67108864; // 64MB tape size
        }
        // Enable memory manager if available
        // @ts-ignore
        if (typeof loader.settings.webIfc.MEMORY_MANAGER !== 'undefined') {
          // @ts-ignore
          loader.settings.webIfc.MEMORY_MANAGER = true;
        }
        // Reduce logging overhead in production
        // @ts-ignore
        if (typeof loader.settings.webIfc.LOG_LEVEL !== 'undefined') {
          // @ts-ignore
          loader.settings.webIfc.LOG_LEVEL = 0; // 0 = no logging
        }
      } catch (e) {
        // Settings not available in this web-ifc version, continue with defaults
        console.debug('Some web-ifc performance settings not available:', e);
      }
      
      // Verify loader is ready
      if (!loader || !loader.settings) {
        throw new Error('IFC Loader konnte nicht initialisiert werden');
      }
      console.log('Loader configured and ready', {
        wasmPath: loader.settings.wasm?.path,
        coordinateToOrigin: loader.settings.webIfc.COORDINATE_TO_ORIGIN
      });
  
      // Tools
      highlighter = components.get(OBCF.Highlighter);
      highlighter.setup({ world });
      
      clipper = components.get(OBC.Clipper);
      clipper.enabled = false;
  
      dimensions = components.get(OBCF.LengthMeasurement);
      dimensions.world = world;
      dimensions.enabled = false;
      // @ts-ignore - snapDistance missing in type definition
      dimensions.snapDistance = 1;
  
      // Classifier must be created AFTER FragmentsManager is initialized
      // The Classifier accesses fragments.list which requires initialization
      classifier = components.get(OBC.Classifier);
      
      // Fragment Loader for Marketplace items
      // Load dynamically only in browser when needed
      if (browser && FragmentLoader === null) {
        try {
          const fragmentsModule = await import('@thatopen/fragments');
          FragmentLoader = (fragmentsModule as any).FragmentLoader || (fragmentsModule as any).default?.FragmentLoader;
          if (FragmentLoader) {
            fragmentLoader = new FragmentLoader();
          }
        } catch (err) {
          console.warn('FragmentLoader not available, using placeholder geometry:', err);
        }
      }
      
      // Transform Controls for positioning marketplace items
      // Wait for renderer to be fully initialized
      if (world.renderer && world.renderer.three && world.renderer.three.domElement) {
        transformControls = new TransformControls(world.camera.three, world.renderer.three.domElement);
        // @ts-ignore - dragging-changed event not in type definition
        transformControls.addEventListener('dragging-changed', (event: any) => {
          if (world.camera.controls) {
            (world.camera.controls as any).enabled = !event.value;
          }
        });
        // @ts-ignore - change event not in type definition
        transformControls.addEventListener('change', () => {
          if (selectedInstance && transformControls) {
            updateSceneModelFromInstance(selectedInstance);
          }
        });
        // TransformControls extends Object3D and should be added to the scene
        world.scene.three.add(transformControls);
      } else {
        console.warn('TransformControls could not be initialized - renderer not ready');
      }
  
      // Events
      highlighter.events.select.onHighlight.add((fragmentIdMap) => {
          updateProperties(fragmentIdMap);
      });
      
      highlighter.events.select.onClear.add(() => {
          properties = null;
      });
      
      // Drag & Drop handlers
      if (container) {
        container.addEventListener('dragover', handleDragOver);
        container.addEventListener('drop', handleDrop);
      }
      
      isLoading = false;
      engineInitialized = true;
    }
  
    async function loadModelFromUrl(url: string) {
      isLoading = true;
      loadingText = "Lade Modell von URL...";
      try {
        console.log('Loading model from URL:', url);
        let response = await fetch(url);
        
        // If public URL fails (400/403), try to get a signed URL from backend
        if (!response.ok && (response.status === 400 || response.status === 403)) {
          console.log('Public URL failed, requesting signed download URL...');
          // Extract file_path from URL - remove the Supabase storage URL prefix
          // URL format: https://xxx.supabase.co/storage/v1/object/public/bim-files/public/filename.ifc
          // We need: public/filename.ifc
          let filePath = url;
          const storagePrefix = '/storage/v1/object/public/bim-files/';
          const prefixIndex = url.indexOf(storagePrefix);
          if (prefixIndex !== -1) {
            filePath = url.substring(prefixIndex + storagePrefix.length);
          } else {
            // Fallback: just get filename
            filePath = `public/${url.split('/').pop() || ''}`;
          }
          
          loadingText = "Fordere Download-URL an...";
          
          try {
            // Extract just the filename for the download-url endpoint
            const fileName = filePath.replace('public/', '');
            const downloadUrlResponse = await post('files/download-url', {
              name: fileName,
              content_type: 'application/octet-stream'
            });
            
            if (downloadUrlResponse.signed_url) {
              console.log('Using signed download URL');
              url = downloadUrlResponse.signed_url;
              loadingText = "Lade Modell von gesicherter URL...";
              response = await fetch(url);
            }
          } catch (downloadUrlError) {
            console.error('Failed to get signed download URL:', downloadUrlError);
            // Continue with original error
          }
        }
        
        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          console.error('Failed to load model:', {
            status: response.status,
            statusText: response.statusText,
            url: url,
            errorBody: errorText
          });
          throw new Error(`Fehler beim Herunterladen der Datei: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`);
        }
        
        loadingText = "Lade Dateidaten...";
        console.log('Downloading file data...');
        const buffer = await response.arrayBuffer();
        console.log(`File downloaded: ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
        
        // Verify buffer is valid
        if (!buffer || buffer.byteLength === 0) {
          throw new Error('Downloaded file is empty');
        }
        
        // Create a fresh Uint8Array from the buffer
        const data = new Uint8Array(buffer);
        console.log('Data array created:', {
          length: data.length,
          byteLength: data.byteLength,
          firstBytes: Array.from(data.slice(0, 20))
        });
        
        // Clear existing models before loading a new one
        // @ts-ignore - groups property missing in FragmentsManager type definition
        if (fragments && fragments.groups && fragments.groups.size > 0) {
            console.log('Clearing existing models...');
            fragments.dispose();
            treeData = [];
            models = [];
            globalYShift = null;
        }

        // Ensure loader is ready
        if (!loader || !engineInitialized) {
          throw new Error('Engine ist noch nicht initialisiert. Bitte warten Sie einen Moment.');
        }

        loadingText = "Lade IFC Modell (dies kann einige Minuten dauern)...";
        console.log('Starting IFC loader...', { 
          dataSize: data.length, 
          loaderReady: !!loader,
          engineInitialized,
          loaderSettings: loader?.settings
        });

        // Check if loader is properly initialized
        if (!loader || !loader.settings) {
          throw new Error('Loader ist nicht korrekt initialisiert. Bitte laden Sie die Seite neu.');
        }

        // Set a timeout to show we're still working and catch hangs
        const loadingTimeout = setTimeout(() => {
          if (isLoading) {
            loadingText = `Lädt immer noch... Das kann bei großen IFC-Dateien einige Minuten dauern.`;
            console.log('Loader still running after 5 seconds...', {
              dataLength: data.length,
              loaderState: loader
            });
          }
        }, 5000); // After 5 seconds

        // Add another timeout for 30 seconds to show more detailed message
        const longLoadingTimeout = setTimeout(() => {
          if (isLoading) {
            loadingText = `Lädt... Dies kann bei komplexen IFC-Dateien bis zu 2 Minuten dauern.`;
            console.warn('Loader taking longer than expected (30+ seconds)', {
              dataSize: `${(data.length / 1024 / 1024).toFixed(2)} MB`
            });
          }
        }, 30000); // After 30 seconds

        // Create a wrapper promise to add logging
        // Also ensure data is in the correct format
        const loadPromise = new Promise(async (resolve, reject) => {
          try {
            console.log('Calling loader.load()...', {
              dataType: data.constructor.name,
              dataLength: data.length,
              dataByteLength: data.byteLength,
              loaderType: loader.constructor.name,
              loaderReady: !!loader,
              hasLoaderSettings: !!loader?.settings
            });
            
            // Ensure data is a proper Uint8Array
            let dataToLoad = data;
            if (!(dataToLoad instanceof Uint8Array)) {
              console.warn('Data is not Uint8Array, converting...');
              dataToLoad = new Uint8Array(dataToLoad);
            }
            
            // Log IFC file header to verify it's a valid IFC file
            const header = String.fromCharCode(...dataToLoad.slice(0, Math.min(100, dataToLoad.length)));
            console.log('IFC file header preview:', header.substring(0, 100));
            if (!header.startsWith('ISO-10303-21') && !header.startsWith('HEADER')) {
              console.warn('File might not be a valid IFC file (header check)');
            }
            
            const startTime = performance.now();
            
            // Add a progress check every 2 seconds
            let progressCheckInterval: ReturnType<typeof setInterval> | null = null;
            let lastProgressTime = startTime;
            
            progressCheckInterval = setInterval(() => {
              const currentTime = performance.now();
              const elapsed = ((currentTime - startTime) / 1000).toFixed(1);
              console.log(`Loader still processing... ${elapsed}s elapsed`);
              lastProgressTime = currentTime;
            }, 2000);
            
            try {
              const model = await loader.load(dataToLoad);
              if (progressCheckInterval) clearInterval(progressCheckInterval);
              
              const endTime = performance.now();
              const duration = ((endTime - startTime) / 1000).toFixed(2);
              
              console.log(`Loader completed in ${duration} seconds`, {
                model: model,
                modelType: model?.constructor?.name,
                // @ts-ignore - geometry property missing in FragmentsModel type definition
                hasGeometry: !!model?.geometry,
                modelKeys: model ? Object.keys(model).slice(0, 10) : []
              });
              
              resolve(model);
            } catch (loadErr) {
              if (progressCheckInterval) clearInterval(progressCheckInterval);
              throw loadErr;
            }
          } catch (error) {
            console.error('Loader.load() threw an error:', error);
            console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
            reject(error);
          }
        });
        
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('Loader timeout: Das Laden hat zu lange gedauert. Bitte versuchen Sie eine kleinere Datei oder laden Sie die Seite neu.'));
          }, 120000); // 120 second timeout (2 minutes for larger files)
        });

        try {
          const model = await Promise.race([loadPromise, timeoutPromise]) as any;
          clearTimeout(loadingTimeout);
          clearTimeout(longLoadingTimeout);
          console.log('IFC model loaded successfully', model);
          
          const fileName = url.split('/').pop() || "Modell";
          model.name = fileName;

          loadingText = "Füge Modell zur Szene hinzu...";
          world.scene.three.add(model);
          models.push(model);
          
          loadingText = "Berechne Position...";
          applyGlobalShift(model);
          
          loadingText = "Erstelle Struktur...";
          await updateTree(model);

          loadingText = "Passe Ansicht an...";
          fitModel();
          
          loadingText = "Modell geladen!";
          console.log('Model successfully added to scene');
        } catch (loadError) {
          clearTimeout(loadingTimeout);
          clearTimeout(longLoadingTimeout);
          console.error('Loader error details:', {
            error: loadError,
            message: loadError instanceof Error ? loadError.message : String(loadError),
            stack: loadError instanceof Error ? loadError.stack : undefined,
            dataSize: data.length,
            loaderState: {
              initialized: !!loader,
              settings: loader?.settings
            }
          });
          throw loadError;
        }

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
      let atLeastOneSuccess = false;
      
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

          loadingText = `Erstelle Projekt-Eintrag...`;
          
          // 3. Create project record in database
          const file_path = `public/${file.name}`;
          try {
            const projectData = {
              name: file.name.replace('.ifc', ''), // Remove extension for cleaner name
              description: `IFC Model: ${file.name}`,
              file_path: file_path,
              file_name: file.name,
              file_size: file.size,
              file_type: file.type || 'application/octet-stream',
              owner_type: "user" // Default to user-owned, can be changed later
            };
            
            await post('projects', projectData);
            console.log('Project created successfully');
          } catch (projectError) {
            console.warn('Failed to create project record (file uploaded but no DB entry):', projectError);
            // Continue anyway - file is uploaded, just missing DB entry
          }

          loadingText = `Verarbeite ${file.name}...`;

          // 3. (For now) Load the model from the uploaded file buffer to keep viewer working
          // In the future, we'll load it from a Supabase URL
          const buffer = await file.arrayBuffer();
          const data = new Uint8Array(buffer);
          
          loadingText = `Lade IFC Modell ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)...`;
          
          // Ensure loader is ready and properly initialized
          if (!loader || !engineInitialized) {
            throw new Error('Engine ist noch nicht initialisiert. Bitte warten Sie einen Moment.');
          }
          
          // Double-check loader is ready
          if (!loader.settings || !loader.settings.webIfc) {
            throw new Error('Loader ist nicht korrekt konfiguriert. Bitte laden Sie die Seite neu.');
          }
          
          // Clear existing models before loading a new one
          // @ts-ignore - groups property missing in FragmentsManager type definition
          if (fragments && fragments.groups && fragments.groups.size > 0) {
            console.log('Clearing existing models before loading new file...');
            fragments.dispose();
            treeData = [];
            models = [];
            globalYShift = null;
          }
          
          // Load the IFC model - this can take a while for large files
          // The loader uses WebAssembly which may take time for large files
          console.log(`Starting to load IFC file: ${file.name}, size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
          console.log('Loader state:', { 
            loader: !!loader, 
            settings: !!loader?.settings,
            webIfc: !!loader?.settings?.webIfc,
            wasmPath: loader?.settings?.wasm?.path,
            coordinateToOrigin: loader?.settings?.webIfc?.COORDINATE_TO_ORIGIN
          });
          
          // Set a timeout to show we're still working and catch hangs
          const loadingTimeout = setTimeout(() => {
            if (isLoading) {
              loadingText = `Lädt immer noch... Das kann bei großen IFC-Dateien einige Minuten dauern.`;
            }
          }, 5000); // After 5 seconds
          
          // Add another timeout for 30 seconds to show more detailed message
          const longLoadingTimeout = setTimeout(() => {
            if (isLoading) {
              loadingText = `Lädt... Dies kann bei komplexen IFC-Dateien bis zu 2 Minuten dauern.`;
              console.warn('Loader taking longer than expected (30+ seconds)', {
                dataSize: `${(file.size / 1024 / 1024).toFixed(2)} MB`
              });
            }
          }, 30000); // After 30 seconds
          
          // Create a wrapper promise to add logging and progress tracking
          const loadPromise = new Promise(async (resolve, reject) => {
            try {
              console.log('Calling loader.load()...', {
                fileName: file.name,
                dataType: data.constructor.name,
                dataLength: data.length,
                dataByteLength: data.byteLength,
                loaderType: loader.constructor.name,
                loaderReady: !!loader,
                hasLoaderSettings: !!loader?.settings
              });
              
              // Ensure data is a proper Uint8Array
              let dataToLoad = data;
              if (!(dataToLoad instanceof Uint8Array)) {
                console.warn('Data is not Uint8Array, converting...');
                dataToLoad = new Uint8Array(dataToLoad);
              }
              
              // Log IFC file header to verify it's a valid IFC file
              const header = String.fromCharCode(...dataToLoad.slice(0, Math.min(100, dataToLoad.length)));
              console.log('IFC file header preview:', header.substring(0, 100));
              if (!header.startsWith('ISO-10303-21') && !header.startsWith('HEADER')) {
                console.warn('File might not be a valid IFC file (header check)');
              }
              
              const startTime = performance.now();
              
              // Add a progress check every 2 seconds
              let progressCheckInterval: ReturnType<typeof setInterval> | null = null;
              
              progressCheckInterval = setInterval(() => {
                const currentTime = performance.now();
                const elapsed = ((currentTime - startTime) / 1000).toFixed(1);
                console.log(`Loader still processing... ${elapsed}s elapsed`);
              }, 2000);
              
              try {
                // For bSDD sample files, loading should be fast - add extra validation
                console.log('Starting loader.load() call...', {
                  dataSize: `${(dataToLoad.length / 1024 / 1024).toFixed(2)} MB`,
                  loaderReady: !!loader,
                  hasSettings: !!loader?.settings,
                  wasmPath: loader?.settings?.wasm?.path,
                  webIfcReady: !!loader?.settings?.webIfc
                });
                
                // Add a warning if loading takes too long for small files
                const loadStartTime = performance.now();
                const smallFileThreshold = 1 * 1024 * 1024; // 1MB
                if (dataToLoad.length < smallFileThreshold) {
                  console.log(`Small file detected (${(dataToLoad.length / 1024).toFixed(2)} KB), should load quickly...`);
                }
                
                const model = await loader.load(dataToLoad);
                
                if (progressCheckInterval) clearInterval(progressCheckInterval);
                
                const endTime = performance.now();
                const duration = ((endTime - startTime) / 1000).toFixed(2);
                
                // Validate model was loaded correctly
                if (!model) {
                  throw new Error('Loader returned null/undefined model');
                }
                
                console.log(`Loader completed in ${duration} seconds`, {
                  model: model,
                  modelType: model?.constructor?.name,
                  // @ts-ignore - geometry property missing in FragmentsModel type definition
                  hasGeometry: !!model?.geometry,
                  modelKeys: model ? Object.keys(model).slice(0, 10) : [],
                  // @ts-ignore - uuid property missing in FragmentsModel type definition
                  modelUuid: model?.uuid
                });
                
                resolve(model);
              } catch (loadErr) {
                if (progressCheckInterval) clearInterval(progressCheckInterval);
                
                // Enhanced error logging for debugging
                console.error('Loader.load() error:', {
                  error: loadErr,
                  message: loadErr instanceof Error ? loadErr.message : String(loadErr),
                  stack: loadErr instanceof Error ? loadErr.stack : undefined,
                  dataSize: `${(dataToLoad.length / 1024 / 1024).toFixed(2)} MB`,
                  elapsedTime: `${((performance.now() - startTime) / 1000).toFixed(2)}s`
                });
                
                throw loadErr;
              }
            } catch (error) {
              console.error('Loader.load() threw an error:', error);
              console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
              reject(error);
            }
          });
          
          // Create a timeout promise to detect if loader hangs
          // Increased to 120 seconds to match URL loading timeout
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error('Loader timeout: Das Laden hat zu lange gedauert. Bitte versuchen Sie eine kleinere Datei oder laden Sie die Seite neu.'));
            }, 120000); // 120 second timeout (2 minutes for larger files)
          });
          
          try {
            const model = await Promise.race([loadPromise, timeoutPromise]) as any;
            clearTimeout(loadingTimeout);
            clearTimeout(longLoadingTimeout);
            console.log('IFC model loaded successfully', model);
          model.name = file.name;
          
          loadingText = `Füge Modell zur Szene hinzu...`;
          world.scene.three.add(model);
          models.push(model);
          
          loadingText = `Berechne Position...`;
          applyGlobalShift(model);
          
          loadingText = `Erstelle Struktur...`;
          await updateTree(model);
          
            atLeastOneSuccess = true;
            loadingText = `Modell geladen!`;
          } catch (loadError) {
            clearTimeout(loadingTimeout);
            clearTimeout(longLoadingTimeout);
            console.error('Loader error details:', {
              error: loadError,
              message: loadError instanceof Error ? loadError.message : String(loadError),
              stack: loadError instanceof Error ? loadError.stack : undefined
            });
            throw loadError;
          }

        } catch (err) {
          console.error('Upload/Processing Error:', err);
          console.error('Error details:', {
            name: err instanceof Error ? err.name : 'Unknown',
            message: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined
          });
          const errorMsg = err instanceof Error ? err.message : 'Unbekannter Fehler';
          alert(`Fehler beim Hochladen/Verarbeiten von ${file.name}: ${errorMsg}`);
          // Reset loading state on error
          isLoading = false;
        }
      }
      
      // Reset loading and fit model after all files are processed
      isLoading = false;
      if (atLeastOneSuccess) {
        fitModel();
      }
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
      // @ts-ignore - bySpatialStructure missing in Classifier type definition
      try { await classifier.bySpatialStructure(model); } catch {}
      // Entity Klassifizierung (Fallback)
      // @ts-ignore - byEntity missing in Classifier type definition
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
      // @ts-ignore - entities property missing in Classifier list type
      const classification = classifier.list.entities;
      if (classification && classification.map) {
          const entries = classification.map instanceof Map 
              ? Array.from(classification.map.entries()) 
              : Object.entries(classification.map);
  
          // Sortieren
          entries.sort((a: any, b: any) => a[0].localeCompare(b[0]));
  
          for (const [category, ids] of entries as any) {
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
      // @ts-ignore - groups property missing in FragmentsManager type definition
      if (!fragments || !fragments.groups) return;
      const bbox = new THREE.Box3();
      // @ts-ignore - groups property missing in FragmentsManager type definition
      for (const group of fragments.groups.values()) {
          group.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(group);
          if (!box.isEmpty()) bbox.union(box);
      }
      if (!bbox.isEmpty() && world.camera.controls) {
          world.camera.controls.fitToBox(bbox, true);
      }
    }
  
    async function updateProperties(fragmentIdMap: any) {
      const fid = Object.keys(fragmentIdMap)[0];
      if (!fid) return;
      const ids = fragmentIdMap[fid];
      const eid = [...ids][0];
      
      const fragment = fragments.list.get(fid);
      if (!fragment) return;
      
      // @ts-ignore - group property missing in Fragment type definition
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
          // Trigger reactivity by creating a new array
          treeData = [...treeData];
  
          // Apply to Fragments
          const found = classifier.find({ entities: [item.categoryId] });
          for (const fragID in found) {
              const fragment = fragments.list.get(fragID);
              if (fragment) {
                  const ids = found[fragID];
                  // @ts-ignore - setVisibility missing in Fragment type definition, likely setVisible
                  if (typeof fragment.setVisibility === 'function') {
                    fragment.setVisibility(isVisible, ids);
                  } else if (typeof (fragment as any).setVisible === 'function') {
                    (fragment as any).setVisible(isVisible, ids);
                  }
              }
          }
      }
    }
    
    // --- Marketplace & Fragment Loading ---
    
    async function loadFragmentFromMarketplace(item: MarketplaceItem, position: [number, number, number] = [0, 0, 0]): Promise<THREE.Group | null> {
      if (!fragmentLoader || !world) return null;
      
      try {
        isLoading = true;
        loadingText = `Lade ${item.name}...`;
        
        // For now, create a placeholder geometry since we don't have actual .frag files yet
        // In production, this would load the .frag file from the URL
        const group = createPlaceholderGeometry(item, position);
        
        // Add to scene
        world.scene.three.add(group);
        
        // Create SceneModel entry
        const instanceId = `instance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const sceneItem: SceneModelItem = {
          itemId: item.id,
          instanceId,
          position: [group.position.x, group.position.y, group.position.z],
          rotation: [group.rotation.x, group.rotation.y, group.rotation.z],
          scale: [group.scale.x, group.scale.y, group.scale.z],
          properties: {
            name: item.name,
            ifc_type: item.ifc_type,
            physics: item.physics,
            ...item.properties
          }
        };
        
        // Store reference on the group
        (group.userData as any).sceneItem = sceneItem;
        (group.userData as any).marketplaceItem = item;
        
        sceneModel = [...sceneModel, sceneItem];
        notifySceneModelUpdate();
        
        // Make it selectable
        // @ts-ignore - click event not in Object3DEventMap
        group.addEventListener('click', () => selectInstance(group));
        
        return group;
      } catch (err) {
        console.error('Error loading fragment:', err);
        alert(`Fehler beim Laden des Fragments: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`);
        return null;
      } finally {
        isLoading = false;
      }
    }
    
    function createPlaceholderGeometry(item: MarketplaceItem, position: [number, number, number]): THREE.Group {
      const group = new THREE.Group();
      group.position.set(position[0], position[1], position[2]);
      
      // Create a box based on properties or default size
      const width = item.properties?.width || 1.0;
      const height = item.properties?.height || 2.0;
      const depth = item.properties?.depth || 0.1;
      
      const geometry = new THREE.BoxGeometry(width, height, depth);
      const material = new THREE.MeshStandardMaterial({
        color: item.properties?.color || 0x888888,
        metalness: 0.1,
        roughness: 0.8
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      // Shift up by half height so pivot is at the bottom center of the object
      mesh.position.y = height / 2;
      
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      
      // Add wireframe for better visibility
      const edges = new THREE.EdgesGeometry(geometry);
      const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
      // Also shift wireframe
      line.position.y = height / 2; 
      mesh.add(line);
      
      group.add(mesh);
      
      // Add label (optional, for debugging)
      group.name = item.name;
      
      return group;
    }
    
    function selectInstance(instance: THREE.Object3D) {
      if (!transformControls) return;
      
      selectedInstance = instance;
      transformControls.attach(instance);
      transformControls.setMode('translate'); // Default to translate mode
    }
    
    function deselectInstance() {
      if (transformControls) {
        transformControls.detach();
      }
      selectedInstance = null;
    }
    
    function updateSceneModelFromInstance(instance: THREE.Object3D) {
      const sceneItem = (instance.userData as any).sceneItem as SceneModelItem;
      if (!sceneItem) return;
      
      sceneItem.position = [instance.position.x, instance.position.y, instance.position.z];
      sceneItem.rotation = [instance.rotation.x, instance.rotation.y, instance.rotation.z];
      sceneItem.scale = [instance.scale.x, instance.scale.y, instance.scale.z];
      
      // Update the sceneModel array
      const index = sceneModel.findIndex(item => item.instanceId === sceneItem.instanceId);
      if (index !== -1) {
        sceneModel[index] = { ...sceneItem };
        sceneModel = [...sceneModel]; // Trigger reactivity
        notifySceneModelUpdate();
      }
    }
    
    function notifySceneModelUpdate() {
      onSceneModelUpdate?.({ sceneModel: [...sceneModel] });
    }
    
    function handleDragOver(e: DragEvent) {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    }
    
    async function handleDrop(e: DragEvent) {
      e.preventDefault();
      e.stopPropagation();
      
      if (!e.dataTransfer) return;
      
      try {
        const itemData = e.dataTransfer.getData('application/json');
        if (!itemData) return;
        
        const item: MarketplaceItem = JSON.parse(itemData);
        
        // Calculate drop position in 3D space using Raycasting
        let position: [number, number, number] = [0, 0, 0];
        
        if (container && world && world.camera) {
            const rect = container.getBoundingClientRect();
            // Normalized Device Coordinates (NDC)
            const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(new THREE.Vector2(x, y), world.camera.three);

            // Intersect with all objects in the scene
            // Note: In a real app, you might want to filter this list (e.g. only IFC models)
            const intersects = raycaster.intersectObjects(world.scene.three.children, true);
            
            // Filter intersects to exclude TransformControls and the object itself being dragged (if it existed)
            // For now, just take the first hit that isn't a helper
            const hit = intersects.find(i => i.object.type === 'Mesh' || i.object.type === 'InstancedMesh');
            
            if (hit) {
                position = [hit.point.x, hit.point.y, hit.point.z];
            } else {
                // Fallback: Intersect with a virtual ground plane at y=0
                const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
                const target = new THREE.Vector3();
                const intersection = raycaster.ray.intersectPlane(plane, target);
                if (intersection) {
                    position = [target.x, target.y, target.z];
                }
            }
        }
        
        await loadFragmentFromMarketplace(item, position);
      } catch (err) {
        console.error('Error handling drop:', err);
      }
    }
    
    // Export function to get current scene model
    export function getSceneModel(): SceneModelItem[] {
      return [...sceneModel];
    }
  </script>
  
  <svelte:window onkeydown={onKeyDown} />
  
  <div class="flex h-full w-full bg-[#1e1e1e] text-[#e0e0e0] font-sans overflow-hidden">
      
      <!-- LEFT SIDEBAR: Structure -->
      <div class="w-[300px] flex flex-col border-r border-[#3e3e42] bg-[#252526]">
          <div class="p-3 text-xs font-bold uppercase tracking-widest text-[#858585] border-b border-[#3e3e42] flex justify-between">
              Modell Struktur
              <button class="hover:text-white" onclick={() => treeData = []}>Clear</button>
          </div>
          
          <div class="flex-1 overflow-y-auto p-1">
              {#if treeData.length === 0}
                  <div class="p-5 text-center text-xs italic text-[#858585]">Kein Modell geladen</div>
              {/if}
  
              {#each treeData as model (model.id)}
                  <div class="mb-1">
                      <!-- Model Header -->
                      <div class="flex items-center p-1 px-2 rounded cursor-pointer hover:bg-white/5 text-[#bcf166]">
                          <span class="material-icons-round text-sm mr-2">domain</span>
                          <span class="text-xs font-bold truncate">{model.name}</span>
                      </div>
                      
                      <!-- Categories -->
                      {#if model.children}
                          <div class="pl-4">
                              {#each model.children as cat (cat.id)}
                                  <div class="flex items-center p-1 px-2 rounded cursor-pointer hover:bg-white/5 text-xs group" 
                                       class:opacity-50={!cat.visible}
                                       role="button"
                                       tabindex="0"
                                       onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleVisibility(cat); } }}
                                       onclick={() => toggleVisibility(cat)}>
                                      <span class="material-icons-round text-sm mr-2 text-[#858585]">category</span>
                                      <span class="flex-1">{cat.name} <span class="text-[#858585]">({cat.count})</span></span>
                                      <!-- Visibility Toggle -->
                                      <button class="opacity-0 group-hover:opacity-100 hover:text-white" onclick={(e) => { e.stopPropagation(); toggleVisibility(cat); }}>
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
                  <input type="file" accept=".ifc" multiple class="hidden" onchange={handleFileUpload}>
              </label>
          </div>
      </div>
  
      <!-- CENTER: Viewport -->
      <div class="flex-1 relative bg-gradient-to-b from-[#2a2a2a] to-[#111]">
          <!-- 3D Canvas -->
          <div bind:this={container} 
               class="w-full h-full outline-none cursor-crosshair"
               ondblclick={onCanvasDblClick}
               role="application">
          </div>
  
          <!-- Toolbar -->
          <div class="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1 p-1 bg-[#252526]/90 backdrop-blur border border-[#3e3e42] rounded-lg shadow-xl z-10 max-w-[calc(100vw-600px)] overflow-x-auto">
              <button class="w-10 h-10 flex flex-col items-center justify-center rounded hover:bg-white/10 transition {activeTool === 'select' ? 'text-[#bcf166] bg-[#bcf166]/10' : 'text-[#858585]'}"
                      onclick={() => setTool('select')} title="Auswahl">
                  <span class="material-icons-round">mouse</span>
              </button>
              <button class="w-10 h-10 flex flex-col items-center justify-center rounded hover:bg-white/10 transition {activeTool === 'measure' ? 'text-[#bcf166] bg-[#bcf166]/10' : 'text-[#858585]'}"
                      onclick={() => setTool('measure')} title="Messen">
                  <span class="material-icons-round">straighten</span>
              </button>
              <button class="w-10 h-10 flex flex-col items-center justify-center rounded hover:bg-white/10 transition {activeTool === 'clip' ? 'text-[#bcf166] bg-[#bcf166]/10' : 'text-[#858585]'}"
                      onclick={() => setTool('clip')} title="Schnitt">
                  <span class="material-icons-round">content_cut</span>
              </button>
              <div class="w-px bg-[#3e3e42] mx-1"></div>
              <button class="w-10 h-10 flex flex-col items-center justify-center rounded hover:bg-white/10 text-[#858585]"
                      onclick={fitModel} title="Zoom Alles">
                  <span class="material-icons-round">fit_screen</span>
              </button>
              <div class="w-px bg-[#3e3e42] mx-1"></div>
              <button class="w-10 h-10 flex flex-col items-center justify-center rounded hover:bg-white/10 text-[#858585]"
                      onclick={deselectInstance} title="Auswahl aufheben">
                  <span class="material-icons-round">close</span>
              </button>
          </div>
  
          <!-- Analysis Result -->
          {#if analysisResult}
            <div class="absolute top-4 right-4 p-3 bg-black/70 rounded-lg text-sm text-white shadow-lg">
              <h3 class="font-bold text-[#bcf166] mb-2">Analyseergebnis</h3>
              <p>Anzahl der Wände: <span class="font-mono">{analysisResult.wall_count}</span></p>
            </div>
          {/if}
  
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
          
          <!-- Scene Model Counter -->
          {#if sceneModel.length > 0}
              <div class="absolute top-4 right-4 p-2 bg-[#bcf166]/20 border border-[#bcf166]/50 rounded text-xs text-[#bcf166] pointer-events-none">
                  {sceneModel.length} Element{sceneModel.length === 1 ? '' : 'e'} platziert
              </div>
          {/if}
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
                  {#each Object.entries(properties) as [key, value] (key)}
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