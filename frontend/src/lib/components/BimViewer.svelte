<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import * as THREE from 'three';
    import { TransformControls } from 'three-stdlib';
    import * as OBC from '@thatopen/components';
    import * as OBCF from '@thatopen/components-front';
    import { browser } from '$app/environment';
    import { post } from '$lib/services/api';
    import type { MarketplaceItem } from './Marketplace.svelte';
    
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
let lastLoadedUrl: string | null = null;
let loadToken = 0;
let pendingLoad: { url: string; token: number } | null = null;
let isProcessingLoad = false;
    
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
  if (!modelUrl || !loader || !engineInitialized) return;
  if (modelUrl === lastLoadedUrl) return;
  enqueueModelLoad(modelUrl);
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

function enqueueModelLoad(url: string) {
  const token = ++loadToken;
  pendingLoad = { url, token };
  if (isProcessingLoad) return;
  isProcessingLoad = true;
  (async () => {
    while (pendingLoad) {
      const next = pendingLoad;
      pendingLoad = null;
      try {
        await loadModelFromUrl(next.url, next.token);
        lastLoadedUrl = next.url;
      } catch (err) {
        console.error('Model load failed:', err);
        loadingText = `Fehler beim Laden: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`;
      }
    }
  })().finally(() => {
    isProcessingLoad = false;
  });
}
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
      // Initialize FragmentsManager with worker URL (required for performance)
      // Use local worker to avoid CORS issues
      if (fragments && typeof (fragments as any).init === 'function') {
        try {
          // Use local worker URL to avoid CORS errors
          const workerUrl = new URL('/workers/worker.mjs', window.location.origin).href;
          (fragments as any).init(workerUrl);
          console.log('FragmentsManager initialized with local worker:', workerUrl);
          
          // Setup camera controls listener for fragment updates
          if (world.camera.controls) {
            world.camera.controls.addEventListener("rest", () => {
              if (fragments && (fragments as any).core) {
                (fragments as any).core.update(true);
              }
            });
          }
          
          // Ensure fragments model uses camera and is added to scene
          if (fragments.list && fragments.list.onItemSet) {
            fragments.list.onItemSet.add(({ value: model }: any) => {
              if (model && model.useCamera && world.camera) {
                model.useCamera(world.camera.three);
              }
              if (model && model.object && world.scene) {
                world.scene.three.add(model.object);
              }
              if (fragments && (fragments as any).core) {
                (fragments as any).core.update(true);
              }
            });
          }
        } catch (fragInitError) {
          console.warn('FragmentsManager init with worker failed, falling back to single-threaded mode:', fragInitError);
          try {
            // Fallback to single-threaded mode (no worker)
            (fragments as any).init();
            console.log('FragmentsManager initialized in single-threaded mode (no worker)');
            
            // Setup camera controls listener for fragment updates
            if (world.camera.controls) {
              world.camera.controls.addEventListener("rest", () => {
                if (fragments && (fragments as any).core) {
                  (fragments as any).core.update(true);
                }
              });
            }
            
            // Ensure fragments model uses camera and is added to scene
            if (fragments.list && fragments.list.onItemSet) {
              fragments.list.onItemSet.add(({ value: model }: any) => {
                if (model && model.useCamera && world.camera) {
                  model.useCamera(world.camera.three);
                }
                if (model && model.object && world.scene) {
                  world.scene.three.add(model.object);
                }
                if (fragments && (fragments as any).core) {
                  (fragments as any).core.update(true);
                }
              });
            }
          } catch (fallbackError) {
            console.error('FragmentsManager init failed completely:', fallbackError);
          }
        }
      }
      
    
    loader = components.get(OBC.IfcLoader);
    
    // Use local WASM files to ensure version consistency
    // This resolves "callbacks.shift is not a function" errors caused by version mismatches
    const wasmPath = "/wasm/";
    
    // Setup loader (this initializes WebAssembly)
    // WASM configuration is passed directly in setup() call according to ThatOpen Components API
    console.log('Setting up IFC loader...');
    const setupStartTime = performance.now();
    
    try {
      // Configure WASM path directly in setup() call
      // setup() should wait until WASM is fully loaded
      console.log('Calling loader.setup() with config:', {
        autoSetWasm: false,
        wasm: { path: wasmPath, absolute: true }
      });
      
      const setupPromise = loader.setup({
        autoSetWasm: false,
        wasm: {
          path: wasmPath,
          absolute: true,
        },
      });
      
      // Add timeout to detect if setup() hangs
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Loader setup timeout after 10 seconds'));
        }, 10000);
      });
      
      await Promise.race([setupPromise, timeoutPromise]);
      
      const setupDuration = ((performance.now() - setupStartTime) / 1000).toFixed(2);
      console.log(`✅ IFC loader setup complete in ${setupDuration}s`);
      
      // Verify loader is ready after setup
      // Check both loader.webIfc (direct property) and loader.settings.webIfc
      const webIfc = loader.webIfc || loader.settings?.webIfc;
      if (!loader || !loader.settings || !webIfc) {
        throw new Error('Loader ist nach Setup nicht korrekt initialisiert - webIfc nicht verfügbar');
      }
      
      console.log('✅ Loader initialized', {
        hasWebIfc: !!webIfc,
        webIfcType: webIfc?.constructor?.name,
        hasSettings: !!loader.settings
      });
      
      // Optional: Check if WASM file is accessible (for debugging)
      try {
        const wasmUrl = `${wasmPath}web-ifc.wasm`;
        const wasmCheck = await fetch(wasmUrl, { method: 'HEAD' });
        if (!wasmCheck.ok) {
          console.warn(`⚠️ WASM file may not be accessible at ${wasmUrl} (Status: ${wasmCheck.status})`);
        } else {
          console.log(`✅ WASM file is accessible at ${wasmUrl}`);
        }
      } catch (wasmCheckError) {
        console.warn('⚠️ Could not verify WASM file accessibility:', wasmCheckError);
      }
      
    } catch (setupError) {
      console.error('❌ Loader setup failed:', setupError);
      console.error('Setup error details:', {
        error: setupError,
        message: setupError instanceof Error ? setupError.message : String(setupError),
        stack: setupError instanceof Error ? setupError.stack : undefined,
        wasmPath,
        loaderExists: !!loader,
        hasSettings: !!loader?.settings
      });
      
      // Provide helpful error message
      let errorMessage = 'IFC Loader Setup fehlgeschlagen';
      if (setupError instanceof Error) {
        errorMessage += `: ${setupError.message}`;
        
        // Check if it's a WASM-related error
        if (setupError.message.toLowerCase().includes('wasm') || 
            setupError.message.toLowerCase().includes('webassembly') ||
            setupError.message.toLowerCase().includes('timeout')) {
          errorMessage += '\n\nMögliche Ursachen:';
          errorMessage += '\n- WASM-Dateien sind nicht unter /wasm/ erreichbar';
          errorMessage += '\n- Falscher WASM-Pfad konfiguriert';
          errorMessage += '\n- Browser unterstützt kein WebAssembly';
          errorMessage += '\n- Setup() hängt und resolved nicht';
        }
      } else {
        errorMessage += ': Unbekannter Fehler';
      }
      
      throw new Error(errorMessage);
    }
      
      // Configure web-ifc settings using loader.webIfc (direct property, not settings.webIfc)
      // Use type assertion since these properties exist at runtime but may not be in type definitions
      const webIfc = loader.webIfc as any;
      webIfc.COORDINATE_TO_ORIGIN = true;
      // OPTIMIZE_PROFILES can be very slow for complex files - disable if performance is an issue
      webIfc.OPTIMIZE_PROFILES = false;
      
      // Performance optimizations
      webIfc.MEMORY_LIMIT = 2 * 1024 * 1024 * 1024; // 2GB memory limit
      // CIRCLE_SEGMENTS properties missing in type definition
      webIfc.CIRCLE_SEGMENTS_LOW = 8;
      webIfc.CIRCLE_SEGMENTS_MEDIUM = 12;
      webIfc.CIRCLE_SEGMENTS_HIGH = 16;
      
      // Additional performance settings
      webIfc.USE_FAST_BOOLS = true;
      
      // Additional optimizations for large/complex files (only if supported by web-ifc version)
      // These settings may not be available in all web-ifc versions, so we check first
      try {
        // Increase tape size for larger files (if supported)
        if (typeof webIfc.TAPE_SIZE !== 'undefined') {
          webIfc.TAPE_SIZE = 67108864; // 64MB tape size
        }
        // Enable memory manager if available
        if (typeof webIfc.MEMORY_MANAGER !== 'undefined') {
          webIfc.MEMORY_MANAGER = true;
        }
        // Reduce logging overhead in production
        if (typeof webIfc.LOG_LEVEL !== 'undefined') {
          webIfc.LOG_LEVEL = 0; // 0 = no logging
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
        coordinateToOrigin: webIfc.COORDINATE_TO_ORIGIN
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

    /**
     * Unified IFC model loading function
     * Handles loading IFC data from Uint8Array and adding to scene
     * Follows ThatOpen Components best practices
     */
    async function loadIFCModel(data: Uint8Array, source: string, modelName?: string): Promise<any> {
      // Validate loader is ready
      if (!loader || !engineInitialized) {
        throw new Error('Engine ist noch nicht initialisiert. Bitte warten Sie einen Moment.');
      }

      if (!loader || !loader.webIfc) {
        throw new Error('Loader ist nicht korrekt initialisiert. Bitte laden Sie die Seite neu.');
      }

      // Validate data
      if (!data || data.length === 0) {
        throw new Error('IFC-Daten sind leer');
      }

      // Ensure data is Uint8Array
      let dataToLoad = data;
      if (!(dataToLoad instanceof Uint8Array)) {
        console.warn('Data is not Uint8Array, converting...');
        dataToLoad = new Uint8Array(dataToLoad);
      }

      // Validate IFC file header
      const header = String.fromCharCode(...dataToLoad.slice(0, Math.min(100, dataToLoad.length)));
      console.log('IFC file header check:', {
        headerPreview: header.substring(0, 50),
        startsWithISO: header.startsWith('ISO-10303-21'),
        startsWithHEADER: header.startsWith('HEADER'),
        firstBytes: Array.from(dataToLoad.slice(0, 20))
      });
      
      if (!header.startsWith('ISO-10303-21') && !header.startsWith('HEADER')) {
        console.warn('⚠️ File might not be a valid IFC file (header check failed)', {
          headerPreview: header.substring(0, 100)
        });
      }

      // Calculate timeout based on file size
      const fileSizeMB = dataToLoad.length / 1024 / 1024;
      let timeoutMs: number;
      if (fileSizeMB < 1) {
        timeoutMs = 30000; // 30s for small files
      } else if (fileSizeMB < 10) {
        timeoutMs = 60000; // 60s for medium files
      } else {
        timeoutMs = 120000; // 120s for large files
      }

      // Detailed loader state check
      const loaderState = {
        loaderExists: !!loader,
        loaderType: loader?.constructor?.name,
        hasSettings: !!loader?.settings,
        hasWebIfc: !!loader?.webIfc,
        wasmPath: loader?.settings?.wasm?.path,
        coordinateToOrigin: (loader?.webIfc as any)?.COORDINATE_TO_ORIGIN,
        webIfcType: loader?.webIfc?.constructor?.name
      };

      console.log('🔍 Starting IFC loader with detailed state...', {
        source,
        dataSize: `${fileSizeMB.toFixed(2)} MB`,
        dataLength: dataToLoad.length,
        timeout: `${timeoutMs / 1000}s`,
        engineInitialized,
        loaderState,
        fragmentsManager: {
          exists: !!fragments,
          type: fragments?.constructor?.name
        }
      });

      // Additional validation: Check if web-ifc is properly initialized
      if (!loader?.webIfc) {
        throw new Error('web-ifc is not initialized. Loader setup may have failed.');
      }

      // Log web-ifc internal state if available - CRITICAL DIAGNOSTICS
      // Use loader.webIfc (direct property) for consistency
      try {
        const webIfc = loader.webIfc;
        
        // Verify webIfc type consistency
        const webIfcType = webIfc?.constructor?.name;
        console.log('🔍 web-ifc type check:', {
          type: webIfcType,
          expected: 'IfcAPI2',
          isCorrect: webIfcType === 'IfcAPI2' || webIfcType === 'IfcAPI',
          usingDirectProperty: true
        });
        
        // Check if WASM is actually loaded
        const wasmLoaded = !!(webIfc as any).wasm || !!(webIfc as any).Module || !!(webIfc as any).HEAP8;
        
        // Get all available properties/methods
        const webIfcKeys = Object.keys(webIfc || {}).slice(0, 20);
        const webIfcPrototypeKeys = Object.getOwnPropertyNames(Object.getPrototypeOf(webIfc || {})).slice(0, 20);
        
        // Check for common web-ifc API patterns
        const apiChecks = {
          hasOpen: typeof (webIfc as any).Open === 'function',
          hasClose: typeof (webIfc as any).Close === 'function',
          hasLoadModel: typeof (webIfc as any).LoadModel === 'function',
          hasOpenModel: typeof (webIfc as any).OpenModel === 'function',
          hasCloseModel: typeof (webIfc as any).CloseModel === 'function',
          hasGetLine: typeof (webIfc as any).GetLine === 'function',
          hasGetLineIDWithType: typeof (webIfc as any).GetLineIDWithType === 'function',
          hasWasm: wasmLoaded,
          hasModule: !!(webIfc as any).Module,
          hasHEAP8: !!(webIfc as any).HEAP8,
          hasHEAP32: !!(webIfc as any).HEAP32,
          memoryLimit: (webIfc as any).MEMORY_LIMIT,
          coordinateToOrigin: (webIfc as any).COORDINATE_TO_ORIGIN,
          type: webIfcType,
          keys: webIfcKeys,
          prototypeKeys: webIfcPrototypeKeys
        };
        
        console.log('🔍 web-ifc detailed state:', apiChecks);
        
        // CRITICAL: Check if WASM is actually loaded
        if (!wasmLoaded && !apiChecks.hasOpen && !apiChecks.hasOpenModel) {
          console.error('❌ CRITICAL: web-ifc WASM appears to NOT be loaded!', {
            webIfcType: webIfcType,
            hasWasm: wasmLoaded,
            availableKeys: webIfcKeys,
            wasmPath: loader.settings.wasm?.path,
            note: 'Using loader.webIfc (direct property) - should be IfcAPI2 type'
          });
          
          // Try to check if WASM file exists
          fetch(loader.settings.wasm?.path + 'web-ifc.wasm', { method: 'HEAD' })
            .then(res => {
              console.log('🔍 WASM file check:', {
                exists: res.ok,
                status: res.status,
                url: loader.settings.wasm?.path + 'web-ifc.wasm'
              });
            })
            .catch(err => {
              console.error('❌ WASM file check failed:', err);
            });
        } else {
          console.log('✅ web-ifc is properly initialized with WASM functions available');
        }
        
        // Check if loader has internal web-ifc reference
        const loaderInternal = (loader as any);
        console.log('🔍 Loader internal state:', {
          hasWebIfc: !!loaderInternal.webIfc,
          hasIfcAPI: !!loaderInternal.ifcAPI,
          loaderMethods: Object.getOwnPropertyNames(loaderInternal).filter(k => typeof loaderInternal[k] === 'function').slice(0, 10)
        });
        
      } catch (e) {
        console.error('❌ Could not inspect web-ifc state:', e);
      }

      // Create abort controller for timeout
      const controller = new AbortController();
      
      // Create loading promise
      const loadPromise = new Promise<any>(async (resolve, reject) => {
        try {
          const startTime = performance.now();
          
          // Progress tracking with more details
          const progressInterval = setInterval(() => {
            const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
            const memoryUsage = (performance as any).memory ? {
              used: `${((performance as any).memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
              total: `${((performance as any).memory.totalJSHeapSize / 1024 / 1024).toFixed(2)} MB`
            } : 'N/A';
            
            console.log(`⏳ Loader processing... ${elapsed}s elapsed`, {
              aborted: controller.signal.aborted,
              memoryUsage,
              dataSize: `${fileSizeMB.toFixed(2)} MB`,
              loaderState: loader?.constructor?.name
            });
          }, 2000);

          try {
            // FINAL CHECK before calling load - verify web-ifc is actually ready
            const webIfcReady = loader.webIfc;
            const hasWasm = !!(webIfcReady as any).wasm || !!(webIfcReady as any).Module || !!(webIfcReady as any).HEAP8;
            const hasAnyFunction = typeof (webIfcReady as any).Open === 'function' || 
                                   typeof (webIfcReady as any).OpenModel === 'function' ||
                                   typeof (webIfcReady as any).GetLine === 'function';
            
            console.log('🚀 Calling loader.load()...', {
              dataLength: dataToLoad.length,
              dataType: dataToLoad.constructor.name,
              loaderType: loader.constructor.name,
              timestamp: new Date().toISOString(),
              webIfcReady: {
                exists: !!webIfcReady,
                hasWasm: hasWasm,
                hasAnyFunction: hasAnyFunction,
                type: webIfcReady?.constructor?.name
              }
            });
            
            // WARNING if web-ifc doesn't seem ready
            if (!hasWasm && !hasAnyFunction) {
              console.error('⚠️ WARNING: web-ifc may not be fully initialized before load() call!', {
                webIfcType: webIfcReady?.constructor?.name,
                hasWasm: hasWasm,
                hasAnyFunction: hasAnyFunction
              });
            }
            
            // Load model using ThatOpen Components
            // API: load(data: Uint8Array, coordinate: boolean, name: string, config?: object)
            const loadStartTime = performance.now();
            console.log('⏱️ Starting loader.load() at:', new Date().toISOString());
            
            // Wrap in try-catch to catch any synchronous errors
            let model;
            try {
              model = await loader.load(
                dataToLoad,
                true, // coordinate: true (default)
                modelName || "model", // name for the fragments model
                {
                  processData: {
                    progressCallback: (progress) => {
                      // Optional: log progress if needed
                      if (progress % 10 === 0) {
                        console.log(`IFC loading progress: ${progress}%`);
                      }
                    }
                  }
                }
              );
            } catch (syncError) {
              console.error('❌ Synchronous error in loader.load():', syncError);
              throw syncError;
            }
            const loadDuration = ((performance.now() - loadStartTime) / 1000).toFixed(2);
            
            console.log(`✅ loader.load() completed in ${loadDuration}s`, {
              modelType: model?.constructor?.name,
              modelUuid: (model as any)?.uuid,
              hasGeometry: !!(model as any)?.geometry
            });
            
            clearInterval(progressInterval);
            
            if (controller.signal.aborted) {
              reject(new Error('Load was aborted'));
              return;
            }

            if (!model) {
              throw new Error('Loader returned null/undefined model');
            }

            const duration = ((performance.now() - startTime) / 1000).toFixed(2);
            console.log(`Loader completed in ${duration} seconds`, {
              modelType: model?.constructor?.name,
              modelUuid: (model as any)?.uuid
            });

            resolve(model);
          } catch (loadErr) {
            clearInterval(progressInterval);
            const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
            
            // Enhanced error logging
            const errorDetails: any = {
              error: loadErr,
              message: loadErr instanceof Error ? loadErr.message : String(loadErr),
              elapsedTime: `${elapsed}s`,
              dataSize: `${fileSizeMB.toFixed(2)} MB`,
              dataLength: dataToLoad.length,
              loaderType: loader?.constructor?.name,
              aborted: controller.signal.aborted
            };
            
            // Add stack trace if available
            if (loadErr instanceof Error && loadErr.stack) {
              errorDetails.stack = loadErr.stack;
            }
            
            // Check if it's a WebAssembly error
            if (loadErr instanceof Error) {
              const errorMsg = loadErr.message.toLowerCase();
              if (errorMsg.includes('wasm') || errorMsg.includes('webassembly')) {
                errorDetails.errorType = 'WebAssembly Error';
                console.error('❌ WebAssembly-related error detected:', errorDetails);
              } else if (errorMsg.includes('memory') || errorMsg.includes('out of memory')) {
                errorDetails.errorType = 'Memory Error';
                console.error('❌ Memory error detected:', errorDetails);
              } else {
                console.error('❌ Loader.load() error:', errorDetails);
              }
            } else {
              console.error('❌ Loader.load() error (non-Error object):', errorDetails);
            }
            
            reject(loadErr);
          }
        } catch (error) {
          console.error('Load promise error:', error);
          reject(error);
        }
      });

      // Create timeout promise with detailed error
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeoutId = setTimeout(() => {
          console.error('⏰ Loader timeout triggered!', {
            timeout: `${timeoutMs / 1000}s`,
            dataSize: `${fileSizeMB.toFixed(2)} MB`,
            source,
            loaderState: {
              type: loader?.constructor?.name,
              hasSettings: !!loader?.settings,
              hasWebIfc: !!loader?.settings?.webIfc
            },
            timestamp: new Date().toISOString()
          });
          
          controller.abort();
          
          // Provide more helpful error message based on file size
          let errorMessage = `Loader timeout: Das Laden hat zu lange gedauert (${timeoutMs / 1000}s).`;
          if (fileSizeMB < 1) {
            errorMessage += ' Diese kleine Datei sollte normalerweise schnell laden. Möglicherweise ist die Datei korrupt oder das Format nicht unterstützt.';
          } else {
            errorMessage += ' Bitte versuchen Sie eine kleinere Datei oder laden Sie die Seite neu.';
          }
          
          reject(new Error(errorMessage));
        }, timeoutMs);
        // Cleanup timeout if load completes first
        loadPromise.finally(() => clearTimeout(timeoutId));
      });

      // Race between load and timeout
      const model = await Promise.race([loadPromise, timeoutPromise]);

      // Set model name
      if (modelName) {
        (model as any).name = modelName;
      }

      // Clear previous models
      clearPreviousModels();

      // loader.load() returns a FragmentsGroup (t6 type)
      // According to ThatOpen API, we need to use model.object for the THREE.Object3D
      // and register it with the FragmentsManager
      const modelObject = (model as any).object || model;
      
      // Ensure model is registered with FragmentsManager and uses camera
      if (model && typeof (model as any).useCamera === 'function' && world.camera) {
        (model as any).useCamera(world.camera.three);
      }
      
      // Add model.object to scene (not model directly)
      if (modelObject && modelObject instanceof THREE.Object3D) {
        world.scene.three.add(modelObject);
        models.push(model);
        console.log('Model added to scene via model.object');
      } else {
        // Fallback: try adding model directly if object property doesn't exist
        world.scene.three.add(model as any);
        models.push(model);
        console.log('Model added to scene directly (fallback)');
      }
      
      // Update fragments core after adding model
      if (fragments && (fragments as any).core) {
        (fragments as any).core.update(true);
      }

      // Apply transformations and build tree
      loadingText = "Berechne Position...";
      applyGlobalShift(modelObject);

      loadingText = "Erstelle Struktur...";
      await updateTree(model);

      loadingText = "Passe Ansicht an...";
      fitModel();

      return model;
    }

    /**
     * Clear previous models from scene
     */
    function clearPreviousModels() {
      // @ts-ignore - groups property missing in FragmentsManager type definition
      if (fragments?.groups?.size) {
        // @ts-ignore
        for (const group of fragments.groups.values()) {
          world.scene.three.remove(group);
        }
        // @ts-ignore
        fragments.groups.clear?.();
        // @ts-ignore
        fragments.list?.clear?.();
        treeData = [];
        models = [];
        globalYShift = null;
        // Re-init fragments manager if available
        if (typeof (fragments as any).init === 'function') {
          try { (fragments as any).init(); } catch {}
        }
      }
    }

    /**
     * Extract file path from Supabase storage URL
     */
    function extractFilePathFromUrl(url: string): string {
      const storagePrefix = '/storage/v1/object/public/bim-files/';
      const prefixIndex = url.indexOf(storagePrefix);
      if (prefixIndex !== -1) {
        return url.substring(prefixIndex + storagePrefix.length);
      }
      // Fallback: extract filename and assume public/ prefix
      const fileName = url.split('/').pop() || '';
      return `public/${fileName}`;
    }
  
async function loadModelFromUrl(url: string, token?: number) {
      isLoading = true;
      loadingText = "Lade Modell von URL...";
      try {
        console.log('Loading model from URL:', url);
        let response = await fetch(url);
        
        // If public URL fails (400/403), try to get a signed URL from backend
        if (!response.ok && (response.status === 400 || response.status === 403)) {
          console.log('Public URL failed, requesting signed download URL...');
          const filePath = extractFilePathFromUrl(url);
          
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
        
        // Create Uint8Array from buffer
        const data = new Uint8Array(buffer);
        
        // Abort if a newer load was requested
        if (token && token !== loadToken) {
          console.log('Stale model load discarded', { url });
          return;
        }

        loadingText = "Lade IFC Modell...";
        
        // Extract model name from URL
        const fileName = url.split('/').pop() || "Modell";
        
        // Use unified loader function
        await loadIFCModel(data, `URL: ${url}`, fileName);
        
        loadingText = "Modell geladen!";
        console.log('Model successfully loaded from URL');
      } catch (err) {
        console.error('Error loading model from URL:', err);
        loadingText = `Fehler beim Laden: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`;
        throw err;
      } finally {
        if (!token || token === loadToken) {
          isLoading = false;
        }
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

          // Load the model from the uploaded file buffer
          const buffer = await file.arrayBuffer();
          const data = new Uint8Array(buffer);
          
          loadingText = `Lade IFC Modell ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)...`;
          
          // Use unified loader function
          await loadIFCModel(data, `File upload: ${file.name}`, file.name);
          
          atLeastOneSuccess = true;
          loadingText = `Modell geladen!`;

        } catch (err) {
          console.error('Upload/Processing Error:', err);
          console.error('Error details:', {
            name: err instanceof Error ? err.name : 'Unknown',
            message: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined
          });
          const errorMsg = err instanceof Error ? err.message : 'Unbekannter Fehler';
          loadingText = `Fehler beim Hochladen/Verarbeiten von ${file.name}: ${errorMsg}`;
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
      // Handle FragmentsGroup: use model.object if available
      const targetObject = (model && (model as any).object) ? (model as any).object : model;
      
      // Ensure targetObject is a THREE.Object3D
      if (!targetObject || typeof targetObject.updateMatrixWorld !== 'function') {
        console.warn('applyGlobalShift: model does not have updateMatrixWorld method', {
          modelType: model?.constructor?.name,
          hasObject: !!(model as any)?.object,
          objectType: (model as any)?.object?.constructor?.name
        });
        return;
      }
      
      targetObject.updateMatrixWorld(true);
      const bbox = new THREE.Box3().setFromObject(targetObject);
      const minY = bbox.min.y;
  
      if (Number.isFinite(minY)) {
          if (globalYShift === null) {
              globalYShift = -minY;
              console.log(`Globaler Shift gesetzt: ${globalYShift}`);
          }
          if (globalYShift !== 0) {
              targetObject.position.y += globalYShift;
              targetObject.updateMatrixWorld(true);
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
  
    async function toggleVisibility(item: TreeItem) {
      if (item.type === 'category' && item.categoryId) {
          const isVisible = !item.visible;
          // Toggle Logic in Tree Data
          item.visible = isVisible;
          // Trigger reactivity by creating a new array
          treeData = [...treeData];
  
          // Apply to Fragments
          // classifier.find() returns a Promise, so we need to await it
          const found = await classifier.find({ entities: [item.categoryId] });
          for (const fragID in found) {
              const fragment = fragments.list.get(fragID);
              if (fragment) {
                  const ids = found[fragID];
                  // Use setVisible (correct API) instead of setVisibility
                  if (typeof (fragment as any).setVisible === 'function') {
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