<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ThatOpen Professional BIM v8 (Final Fix)</title>
    
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet">

    <style>
        :root {
            --bg-dark: #1e1e1e;
            --bg-panel: #252526;
            --bg-header: #333333;
            --accent: #bcf166;
            --text-main: #e0e0e0;
            --text-muted: #858585;
            --border: #3e3e42;
        }

        body, html { margin: 0; padding: 0; overflow: hidden; height: 100%; font-family: 'Inter', sans-serif; background: var(--bg-dark); color: var(--text-main); }
        
        #app-layout {
            display: grid;
            grid-template-columns: 300px 1fr 300px;
            grid-template-rows: 40px 1fr 60px;
            height: 100vh;
            width: 100vw;
        }

        #header {
            grid-column: 1 / -1;
            background: var(--bg-header);
            border-bottom: 1px solid var(--border);
            display: flex; align-items: center; padding: 0 16px;
            font-size: 12px; font-weight: 600; letter-spacing: 0.5px;
        }

        .sidebar {
            background: var(--bg-panel);
            border-right: 1px solid var(--border);
            display: flex; flex-direction: column;
            overflow: hidden;
        }
        .sidebar-right {
            border-right: none;
            border-left: 1px solid var(--border);
        }

        .panel-header {
            padding: 12px; background: var(--bg-panel);
            border-bottom: 1px solid var(--border);
            font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); font-weight: 700;
            display: flex; justify-content: space-between; align-items: center;
        }

        #viewport {
            position: relative;
            background: radial-gradient(circle at center, #2a2a2a 0%, #111 100%);
            overflow: hidden;
        }
        #viewer-container { width: 100%; height: 100%; outline: none; }

        .tree-item {
            padding: 4px 8px; cursor: pointer; display: flex; align-items: center;
            font-size: 12px; color: var(--text-main); border-radius: 4px; margin: 1px 4px; user-select: none;
        }
        .tree-item:hover { background: rgba(255,255,255,0.05); }
        .tree-item.active { background: rgba(188, 241, 102, 0.15); color: var(--accent); }
        .tree-icon { font-size: 14px; margin-right: 6px; color: var(--text-muted); }
        .tree-toggle { font-size: 12px; margin-right: 4px; color: var(--text-muted); cursor: pointer; width: 16px; text-align: center; }
        .tree-children { padding-left: 16px; display: none; }
        .tree-children.open { display: block; }
        .eye-icon { font-size: 14px; margin-left: auto; color: var(--text-muted); cursor: pointer; transition: color 0.2s; }
        .eye-icon:hover { color: white; }
        .eye-icon.off { color: #666; text-decoration: line-through; }

        #toolbar {
            position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
            background: rgba(37, 37, 38, 0.95); backdrop-filter: blur(4px);
            border: 1px solid var(--border);
            border-radius: 8px; padding: 4px; display: flex; gap: 4px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10;
        }
        .tool-btn {
            width: 40px; height: 40px; border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center;
            color: var(--text-muted); cursor: pointer; transition: all 0.2s; position: relative;
        }
        .tool-btn:hover { background: rgba(255,255,255,0.1); color: white; }
        .tool-btn.active { background: rgba(188, 241, 102, 0.2); color: var(--accent); }
        .tool-btn span { font-size: 20px; }
        
        .tool-btn:hover::after {
            content: attr(title);
            position: absolute; top: -30px; left: 50%; transform: translateX(-50%);
            background: #222; color: white; padding: 4px 8px; border-radius: 4px;
            font-size: 10px; white-space: nowrap; pointer-events: none;
        }

        .prop-row { display: grid; grid-template-columns: 120px 1fr; gap: 8px; padding: 6px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 12px; }
        .prop-label { color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
        .prop-value { color: var(--text-main); word-break: break-word; }

        #loader {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.8); z-index: 100; display: flex; flex-direction: column; justify-content: center; align-items: center;
            transition: opacity 0.3s; pointer-events: none; opacity: 0;
        }
        #loader.visible { pointer-events: all; opacity: 1; }
        .spinner { width: 40px; height: 40px; border: 3px solid #333; border-top: 3px solid var(--accent); border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        
        .empty-msg { padding: 20px; text-align: center; color: var(--text-muted); font-size: 12px; font-style: italic; }

        #help-box {
            position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.6); 
            padding: 8px; border-radius: 4px; font-size: 10px; color: #aaa; pointer-events: none;
        }
        
        .toast {
            position: fixed; top: 80px; left: 50%; transform: translateX(-50%);
            background: rgba(188, 241, 102, 0.9); color: #111; padding: 12px 24px;
            border-radius: 12px; font-weight: 600; z-index: 200;
            box-shadow: 0 10px 25px rgba(0,0,0,0.3); backdrop-filter: blur(4px);
            animation: slideDown 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            border: 1px solid rgba(255,255,255,0.4);
        }
        @keyframes slideDown { from { transform: translate(-50%, -40px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }

        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: var(--bg-dark); }
        ::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }
    </style>

    <script type="importmap">
    {
        "imports": {
            "three": "https://esm.sh/three@0.160.0",
            "@thatopen/components": "https://esm.sh/@thatopen/components@2.2.1?deps=three@0.160.0,web-ifc@0.0.56",
            "@thatopen/components-front": "https://esm.sh/@thatopen/components-front@2.2.1?deps=three@0.160.0,web-ifc@0.0.56",
            "web-ifc": "https://esm.sh/web-ifc@0.0.56"
        }
    }
    </script>
</head>
<body>

    <div id="app-layout">
        <!-- HEADER -->
        <div id="header">
            <span class="text-[#bcf166] material-icons-round mr-2">layers</span>
            THATOPEN <span class="text-gray-500 mx-2">|</span> PROFESSIONAL VIEWER
            <span class="ml-auto text-xs text-gray-500" id="version-tag">v2.2.1 (Fix)</span>
        </div>

        <!-- LEFT SIDEBAR -->
        <div class="sidebar">
            <div class="panel-header">Modell Struktur</div>
            <div id="tree-root" class="flex-1 overflow-y-auto p-1">
                <div class="empty-msg">Kein Modell geladen</div>
            </div>
            <div class="p-3 border-t border-[#3e3e42] bg-[#2a2a2b]">
                <button id="btn-upload" class="w-full bg-[#bcf166] hover:bg-[#a3d655] text-black font-bold py-2 rounded text-xs transition flex items-center justify-center gap-2">
                    <span class="material-icons-round text-sm">upload_file</span>
                    IFC Öffnen
                </button>
                <input type="file" id="file-input" accept=".ifc" class="hidden" multiple>
            </div>
        </div>

        <!-- CENTER -->
        <div id="viewport">
            <div id="viewer-container"></div>
            <div id="help-box">
                LMT: Drehen | RMT: Pan | Scroll: Zoom <br>
                Doppelklick: Aktion (je nach Tool) <br>
                Entf: Löschen
            </div>
            <div id="toolbar">
                <div class="tool-btn" id="btn-select" title="Auswahl">
                    <span class="material-icons-round">mouse</span>
                </div>
                <div class="tool-btn" id="btn-measure" title="Messen">
                    <span class="material-icons-round">straighten</span>
                </div>
                <div class="tool-btn" id="btn-clip" title="Schnitt">
                    <span class="material-icons-round">content_cut</span>
                </div>
                <div class="tool-btn" id="btn-delete-all" title="Reset">
                    <span class="material-icons-round">delete_sweep</span>
                </div>
                <div class="w-px bg-gray-600 mx-1"></div>
                <div class="tool-btn" id="btn-fit" title="Zoom Alles">
                    <span class="material-icons-round">fit_screen</span>
                </div>
                <div class="tool-btn" id="btn-demo" title="Demo Laden">
                    <span class="material-icons-round">domain</span>
                </div>
            </div>
            <div id="loader">
                <div class="spinner mb-4"></div>
                <div class="text-white text-sm font-bold tracking-wide" id="loader-text">Wird geladen...</div>
            </div>
        </div>

        <!-- RIGHT SIDEBAR -->
        <div class="sidebar sidebar-right">
            <div class="panel-header">Eigenschaften</div>
            <div id="props-container" class="flex-1 overflow-y-auto">
                <div class="empty-msg">Wähle ein Element aus</div>
            </div>
        </div>
    </div>

    <script type="module">
        import * as THREE from 'three';
        import * as OBC from '@thatopen/components';
        import * as OBCF from '@thatopen/components-front';

        // Globale App Logik (Fix: toggleNode und collapseAll hinzugefügt)
        window.app = {
            components: null, world: null, loader: null,
            highlighter: null, clipper: null, dimensions: null, 
            fragments: null, models: [],
            globalYShift: null, activeTool: 'select',

            // Diese Funktionen wurden wiederhergestellt
            toggleNode: (id) => {
                const childDiv = document.getElementById(`children-${id}`);
                const icon = document.getElementById(`icon-${id}`);
                if(childDiv) {
                    const isOpen = childDiv.classList.contains('open');
                    if(isOpen) {
                        childDiv.classList.remove('open');
                        icon.innerText = 'arrow_right';
                    } else {
                        childDiv.classList.add('open');
                        icon.innerText = 'arrow_drop_down';
                    }
                }
            },

            collapseAll: () => {
                document.querySelectorAll('.tree-children').forEach(c => c.classList.remove('open'));
                document.querySelectorAll('.tree-toggle').forEach(i => i.innerText = 'arrow_right');
            }
        };

        const ui = {
            loader: document.getElementById('loader'),
            loaderText: document.getElementById('loader-text'),
            tree: document.getElementById('tree-root'),
            props: document.getElementById('props-container'),
            fileInput: document.getElementById('file-input'),
            btnUpload: document.getElementById('btn-upload'),
            btnDemo: document.getElementById('btn-demo'),
            btnClip: document.getElementById('btn-clip'),
            btnMeasure: document.getElementById('btn-measure'),
            btnDeleteAll: document.getElementById('btn-delete-all'),
            btnFit: document.getElementById('btn-fit'),
            btnSelect: document.getElementById('btn-select'),
            toolBtns: document.querySelectorAll('.tool-btn')
        };

        function showToast(msg) {
            const t = document.createElement('div');
            t.className = 'toast';
            t.innerText = msg;
            document.body.appendChild(t);
            setTimeout(() => t.remove(), 4000);
        }

        async function init() {
            ui.loader.classList.add('visible');
            
            const container = document.getElementById('viewer-container');
            app.components = new OBC.Components();
            const worlds = app.components.get(OBC.Worlds);
            app.world = worlds.create();
            
            app.world.scene = new OBC.SimpleScene(app.components);
            app.world.renderer = new OBC.SimpleRenderer(app.components, container);
            app.world.camera = new OBC.OrthoPerspectiveCamera(app.components);
            
            app.components.init();
            app.world.scene.setup();
            
            app.world.scene.three.background = new THREE.Color('#222'); 

            // Licht Setup
            const ambient = new THREE.AmbientLight(0xffffff, 0.8);
            app.world.scene.three.add(ambient);
            const dir = new THREE.DirectionalLight(0xffffff, 1.5);
            dir.position.set(50, 100, 50);
            app.world.scene.three.add(dir);

            // Grid
            const grids = app.components.get(OBC.Grids);
            grids.create(app.world);
            
            // Raycaster FIX (WICHTIG für Tool-Erkennung!)
            const raycasters = app.components.get(OBC.Raycasters);
            raycasters.get(app.world); // Aktiviert Raycasting für diese Welt

            // Loader Setup
            app.fragments = app.components.get(OBC.FragmentsManager);
            app.loader = app.components.get(OBC.IfcLoader);
            await app.loader.setup();
            app.loader.settings.wasm = { path: "https://unpkg.com/web-ifc@0.0.56/", absolute: true };
            app.loader.settings.webIfc.COORDINATE_TO_ORIGIN = true;
            app.loader.settings.webIfc.OPTIMIZE_PROFILES = true;

            // Tools Setup
            app.highlighter = app.components.get(OBCF.Highlighter);
            app.highlighter.setup({ world: app.world });
            
            app.clipper = app.components.get(OBC.Clipper);
            app.clipper.enabled = false;

            app.dimensions = app.components.get(OBCF.LengthMeasurement);
            app.dimensions.world = app.world;
            app.dimensions.enabled = false;
            app.dimensions.snapDistance = 1;

            app.classifier = app.components.get(OBC.Classifier);

            setupEvents();
            ui.loader.classList.remove('visible');
        }

        function setActiveTool(tool) {
            app.activeTool = tool;
            ui.toolBtns.forEach(b => b.classList.remove('active'));
            
            // Reset Tools
            app.clipper.enabled = false;
            app.dimensions.enabled = false;
            app.highlighter.enabled = false;
            app.highlighter.clear('select');
            
            const container = document.getElementById('viewer-container');
            container.ondblclick = null; 

            if (tool === 'select') {
                ui.btnSelect.classList.add('active');
                app.highlighter.enabled = true;
            } 
            else if (tool === 'clip') {
                ui.btnClip.classList.add('active');
                app.clipper.enabled = true;
                // Highlighting anlassen, damit man sieht, was man schneidet
                app.highlighter.enabled = true; 
                container.ondblclick = () => {
                    const created = app.clipper.create(app.world);
                    if (!created) showToast("Kein Objekt getroffen");
                };
                showToast("Doppelklick zum Schneiden");
            } 
            else if (tool === 'measure') {
                ui.btnMeasure.classList.add('active');
                app.dimensions.enabled = true;
                container.ondblclick = () => {
                    const created = app.dimensions.create();
                    if (!created) showToast("Kein Objekt getroffen");
                };
                showToast("Doppelklick für Messung");
            }
        }

        function setupEvents() {
            app.highlighter.events.select.onHighlight.add((fragmentIdMap) => showProperties(fragmentIdMap));
            app.highlighter.events.select.onClear.add(() => ui.props.innerHTML = '<div class="empty-msg">Wähle ein Element aus</div>');

            window.onkeydown = (e) => {
                if (e.code === 'Delete' || e.code === 'Backspace') {
                    if (app.activeTool === 'clip') app.clipper.delete(app.world);
                    if (app.activeTool === 'measure') app.dimensions.delete();
                }
                if (e.code === 'Escape') setActiveTool('select');
            };

            ui.btnSelect.onclick = () => setActiveTool('select');
            ui.btnClip.onclick = () => setActiveTool('clip');
            ui.btnMeasure.onclick = () => setActiveTool('measure');
            ui.btnDeleteAll.onclick = () => { app.clipper.deleteAll(); app.dimensions.deleteAll(); };

            ui.btnUpload.onclick = () => ui.fileInput.click();
            ui.fileInput.onchange = async (e) => {
                const files = e.target.files;
                if(!files || files.length === 0) return;
                ui.loader.classList.add('visible');
                ui.loaderText.innerText = "Lade Modelle...";
                await loadFiles(files);
                ui.loader.classList.remove('visible');
                e.target.value = '';
            };

            ui.btnDemo.onclick = async () => {
                ui.loader.classList.add('visible');
                ui.loaderText.innerText = "Lade Demo...";
                try {
                    const res = await fetch('https://raw.githubusercontent.com/IFCjs/test-files/main/files/small.ifc');
                    const buffer = await res.arrayBuffer();
                    const blob = new Blob([buffer]);
                    const file = new File([blob], "Demo Haus.ifc");
                    await loadFiles([file]);
                } catch(e) { console.error(e); }
                ui.loader.classList.remove('visible');
            };

            ui.btnFit.onclick = fitModel;
            setActiveTool('select'); 
        }

        async function loadFiles(files) {
            for(let file of files) {
                const buffer = await file.arrayBuffer();
                const data = new Uint8Array(buffer);
                try {
                    const model = await app.loader.load(data);
                    model.name = file.name;
                    app.world.scene.three.add(model);
                    app.models.push(model);

                    // --- BESSERE BODEN-BERECHNUNG ---
                    // Wir erzwingen ein Update der Matrix
                    model.updateMatrixWorld(true);
                    
                    // Wir berechnen die Bounding Box aus den tatsächlichen Geometrien der Kinder (Fragmente)
                    // Das ist genauer als model.boundingBox bei InstancedMesh Groups
                    const bbox = new THREE.Box3();
                    model.children.forEach(child => {
                        const box = new THREE.Box3().setFromObject(child);
                        bbox.union(box);
                    });
                    
                    const minY = bbox.min.y;

                    // Wenn dies das erste Modell ist und der Wert valide ist
                    if (app.globalYShift === null && Number.isFinite(minY)) {
                        // Wenn der tiefste Punkt bei -5 liegt, heben wir um +5 an
                        app.globalYShift = -minY;
                        console.log(`Boden erkannt bei Y=${minY}, Shift=${app.globalYShift}`);
                    }

                    // Shift anwenden (nur wenn signifikant)
                    if (app.globalYShift !== null && Math.abs(app.globalYShift) > 0.01) {
                        model.position.y += app.globalYShift;
                        model.updateMatrixWorld(true);
                        showToast(`Modell ausgerichtet (+${app.globalYShift.toFixed(2)}m)`);
                    }
                    
                    await updateTree(model);

                } catch(e) { console.error(e); alert(`Fehler: ${e.message}`); }
            }
            fitModel();
        }

        async function fitModel() {
            const bbox = new THREE.Box3();
            for(const group of app.fragments.groups.values()) {
                group.updateMatrixWorld(true);
                const box = new THREE.Box3().setFromObject(group);
                if(!box.isEmpty()) bbox.union(box);
            }
            
            if(!bbox.isEmpty()) {
                app.world.camera.controls.fitToBox(bbox, true);
            } else {
                app.world.camera.controls.setLookAt(10, 10, 10, 0, 0, 0);
            }
        }

        async function updateTree(model) {
            if(app.models.length === 1) ui.tree.innerHTML = "";
            
            try { await app.classifier.bySpatialStructure(model); } catch (e) { }
            try { await app.classifier.byEntity(model); } catch (e) { }

            const rootId = `model-${model.uuid}`;
            const rootHTML = `
                <div class="tree-item active" onclick="app.toggleNode('${rootId}')">
                    <span class="material-icons-round tree-toggle" id="icon-${rootId}">arrow_drop_down</span>
                    <span class="material-icons-round tree-icon text-[#bcf166]">domain</span>
                    <span>${model.name}</span>
                </div>
                <div class="tree-children open" id="children-${rootId}"></div>
            `;
            
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = rootHTML;
            while (tempDiv.firstChild) ui.tree.appendChild(tempDiv.firstChild);
            const container = document.getElementById(`children-${rootId}`);

            // Defensive Access
            let classification;
            try { classification = app.classifier.list.entities; } catch(e) {}
            
            if (classification && classification.map) {
                const entries = classification.map instanceof Map 
                    ? Array.from(classification.map.entries()) 
                    : Object.entries(classification.map);

                entries.sort((a, b) => a[0].localeCompare(b[0]));

                for(const [category, ids] of entries) {
                    let count = 0;
                    const idValues = ids instanceof Map ? ids.values() : Object.values(ids);
                    for(const expressIDs of idValues) {
                        count += (expressIDs instanceof Set) ? expressIDs.size : Object.keys(expressIDs).length;
                    }
                    if(count === 0) continue;

                    let cleanName = category.replace('IFC', '');
                    cleanName = cleanName.charAt(0) + cleanName.slice(1).toLowerCase();
                    const toggleId = `vis-${category}-${model.uuid}`;
                    
                    const catHTML = `
                        <div class="tree-item">
                            <span class="material-icons-round tree-icon">category</span>
                            <span class="flex-1">${cleanName} <span class="text-gray-500 text-xs">(${count})</span></span>
                            <span id="${toggleId}" class="material-icons-round eye-icon" onclick="event.stopPropagation(); toggleVisibility('${category}', '${toggleId}')">visibility</span>
                        </div>
                    `;
                    container.innerHTML += catHTML;
                }
            } else {
                // FALLBACK LISTE WENN KEINE KLASSIFIZIERUNG
                container.innerHTML = `<div class="empty-msg text-gray-400">${model.children.length} Fragmente geladen</div>`;
            }
        }

        window.toggleVisibility = (category, iconId) => {
            const icon = document.getElementById(iconId);
            const isVisible = !icon.classList.contains('off');
            const found = app.classifier.find({ entities: [category] });
            for (const fragID in found) {
                const fragment = app.fragments.list.get(fragID);
                if (fragment) {
                    const ids = found[fragID];
                    fragment.setVisibility(!isVisible, ids);
                }
            }
            if (isVisible) {
                icon.classList.add('off');
                icon.innerText = 'visibility_off';
            } else {
                icon.classList.remove('off');
                icon.innerText = 'visibility';
            }
        };

        async function showProperties(fragmentIdMap) {
            ui.props.innerHTML = '<div class="spinner w-6 h-6 border-2 mx-auto mt-4"></div>';
            try {
                const fid = Object.keys(fragmentIdMap)[0];
                if(!fid) throw new Error("No ID");
                const ids = fragmentIdMap[fid];
                const eid = [...ids][0];
                const fragment = app.fragments.list.get(fid);
                const model = fragment.group;
                
                const props = await model.getProperties(eid);

                if(props) {
                    let html = `
                        <div class="p-3 bg-[#333] border-b border-[#444] mb-2">
                            <div class="text-[#bcf166] text-xs font-bold uppercase tracking-wide">Entity</div>
                            <div class="text-white font-bold text-lg">${props.Name?.value || "Unbenannt"}</div>
                            <div class="text-gray-500 text-xs mt-1">ID: ${eid}</div>
                        </div>
                    `;
                    for(let key in props) {
                        const val = props[key];
                        if(!val || val.value === undefined) continue;
                        if(key === "Name" || key === "GlobalId") continue;
                        html += `<div class="prop-row"><div class="prop-label">${key}</div><div class="prop-value">${val.value}</div></div>`;
                    }
                    ui.props.innerHTML = html;
                } else ui.props.innerHTML = '<div class="empty-msg">Keine Daten</div>';
            } catch(e) {
                ui.props.innerHTML = `<div class="empty-msg text-red-400">${e.message}</div>`;
            }
        }

        window.addEventListener('resize', () => {
            app.world.renderer.resize();
            app.world.camera.updateAspect();
        });

        init();
    </script>
</body>
</html>