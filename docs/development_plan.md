Chronologischer Entwicklungsplan: BIM Plattform

Dieser Plan leitet den AI Agent Schritt für Schritt. Er ist in Phasen unterteilt, um Komplexität zu reduzieren.

Phase 1: Projekt-Skelett & Infrastruktur

Ziel: Ein laufendes SvelteKit Frontend und ein FastAPI Backend, die miteinander kommunizieren können.

Setup Frontend:

npm create svelte@latest (Skeleton Project, TypeScript).

Installiere Skeleton UI & Tailwind.

Installiere @thatopen/components, @thatopen/ui, three.

Setup Backend:

Python Environment setup.

Installiere fastapi, uvicorn, pydantic, supabase.

Erstelle Hello-World Endpoint.

Setup Database:

Erstelle Supabase Projekt.

Tabelle projects (id, user_id, name, status).

Bucket bim-files.

Verbindung:

Erstelle einen Svelte Store für den Auth-Token.

Schreibe einen API-Wrapper im Frontend, der Anfragen an localhost:8000 (FastAPI) sendet.

Potenzielle Komplikationen: CORS Fehler zwischen Port 5173 (Svelte) und 8000 (FastAPI).
Best Practice: CORS Middleware in FastAPI strikt konfigurieren.

**Status: Abgeschlossen**

---

Phase 2: Der "Dumme" Viewer (MVP)

Ziel: Eine IFC Datei lokal laden und anzeigen (ohne Backend).

Viewer Komponente:

Erstelle src/lib/components/BimViewer.svelte.

Implementiere onMount Initialisierung von OBC.Components.

Lade @thatopen/ui Web Components.

Lade-Logik:

Implementiere IfcLoader mit WASM Config (nutze unpkg oder kopiere WASM nach /static).

Füge einen simplen HTML <input type="file"> hinzu.

Lade das File in den Viewer.

Navigation:

Kamera-Steuerung (OrbitControls).

Grid einschalten.

Potenzielle Komplikationen: window is not defined (SSR). WASM 404 Fehler.
Best Practice: onMount nutzen. WASM Pfade absolut definieren.

**Status: Abgeschlossen**

---

Phase 3: Der "Smarte" Viewer (Tools & UI)

Ziel: Properties anzeigen, Schneiden, Messen.

Properties Panel:

Implementiere OBCF.Highlighter.

Erstelle eine Svelte Sidebar, die auf Selection-Events reagiert.

Zeige IFC-Attribute an.

Werkzeugleiste:

Nutze <bim-toolbar> von ThatOpen.

Verknüpfe Buttons mit clipper.create() und dimensions.create().

Struktur-Baum:

Implementiere OBC.Classifier.

Baue einen rekursiven Svelte-Tree (<TreeItem>) basierend auf der Klassifizierung.

Best Practice: State Management! Wenn im Viewer etwas selektiert wird, update einen Svelte Store $selectedElement, damit die UI (Sidebar) reaktiv updated.

**Status: Abgeschlossen**

---

Phase 4: Marktplatz & Persistenz

Ziel: Dateien hochladen, speichern und wieder abrufen.

Upload Flow:

User lädt Datei hoch -> Upload zu Supabase Storage.

Eintrag in DB projects erstellen.

Dashboard:

Seite /dashboard: Liste aller Projekte aus Supabase.

Klick auf Projekt -> Navigation zu /viewer/[projectId].

Remote Loading:

Der Viewer lädt beim Start nicht mehr lokal, sondern zieht die URL aus Supabase und streamt das File.

**Status: Abgeschlossen**

---

Phase 5: Simulation (Backend Integration)

Ziel: Python berechnet etwas auf Basis der IFC Datei.

Trigger: Button "Simulation starten" im Viewer.

Backend Logic:

FastAPI Endpunkt /analyze/{file_id}.

Python lädt Datei von Supabase.

Nutze ifcopenshell um z.B. alle Wände zu zählen oder Volumen zu berechnen.

Schreibe Ergebnis in DB.

Result Display:

Frontend pollt Status oder nutzt Supabase Realtime.

Zeige Simulationsergebnis im Dashboard an.

Abschluss-Checkliste für den Agent

[ ] Laufen Frontend und Backend parallel ohne Fehler?

[ ] Funktioniert der Viewer auch nach einem Page-Reload (Memory Leaks)?

[ ] Sind die WASM Files korrekt gecached?

[ ] Ist die UI responsive (Skeleton UI)?