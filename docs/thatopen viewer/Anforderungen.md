Projektdefinition: BIM Marketplace & Simulation Platform ("Cohesion")

1. Vision & Zielsetzung

Entwicklung einer hochperformanten, webbasierten Plattform für die Bauindustrie (AEC), die drei Kernbereiche vereint:

BIM Viewer: Hochleistungsfähige Anzeige von IFC-Modellen im Browser.

Marketplace: Upload, Verwaltung und Austausch von BIM-Modellen.

Simulation: Serverseitige Analyse und Berechnung (Statik, Energie, etc.) von Modellen.

2. Technologie-Stack (Final)

Aufgrund von Kompatibilitätsproblemen (React vs. Web Components) und Versionierungskonflikten (Tailwind v3 vs. v4) wurde folgender Stack als optimal definiert:

Frontend

Framework: SvelteKit (TypeScript).

Grund: Native Unterstützung für Web Components (notwendig für ThatOpen UI), hohe Performance, kein Virtual DOM Overhead.

UI Library: Shadcn-Svelte (mit Tailwind CSS).

Grund: Enterprise-Look, volle Kontrolle über den Code, Headless Basis (Bits UI), kompatibel mit modernen Build-Tools.

BIM Engine: @thatopen/components & @thatopen/components-front.

Versionierung: Strikte Synchronisierung von web-ifc (WASM) und den Components Paketen (aktuell getestet: Core 2.x mit web-ifc 0.0.56).

Backend (Simulation & Logic)

Framework: FastAPI (Python).

Grund: Industriestandard für Simulationen (ifcopenshell, numpy, scipy), asynchrone Verarbeitung.

Kommunikation: REST API (JSON) zum Frontend.

Infrastruktur & Daten

Datenbank & Auth: Supabase (PostgreSQL).

Storage: Supabase Storage (S3 kompatibel) für IFC-Dateien.

3. Kern-Feature: Der BIM Viewer

Der Viewer ist das Herzstück. Folgende spezifische Logiken wurden implementiert und müssen beibehalten werden:

A. Lade-Logik & WASM

WASM Pfad: Absolute Pfade zu web-ifc.wasm (via CDN oder lokalem Static Asset), konfiguriert vor dem Setup des Loaders.

Fragments: IFC-Dateien werden direkt in Fragmente konvertiert (IfcLoader), um große Modelle performant darzustellen.

B. Georeferenzierung & "Global Shift" (Kritisch)

Um das Problem "Modell schwebt im Weltraum" vs. "Modell steckt im Boden" zu lösen:

Einstellung: COORDINATE_TO_ORIGIN = true im Loader aktivieren (verhindert Zittern bei großen Koordinaten).

Global Shift Logik:

Beim Laden des ersten Modells wird dessen tiefster Punkt (boundingBox.min.y) ermittelt.

Dieser Wert wird als globalYShift (negierter Wert) gespeichert.

Das erste und alle nachfolgenden Modelle (z.B. Architektur + Gelände) werden um diesen fixen Wert angehoben.

Ergebnis: Modelle behalten ihre korrekte relative Position zueinander, stehen aber visuell auf dem Grid (Y=0).

C. Tools & Interaktion

Die Werkzeuge müssen exklusiv geschaltet werden (State Management):

Highlighter (Auswahl): Zeigt Properties an. Muss deaktiviert werden, wenn Messen/Schneiden aktiv ist.

Clipper (Schnitt): Erzeugt Schnittebenen per Doppelklick.

Dimensions (Messen): Misst Abstände per Snapping auf Vertices.

Reset: Funktion zum Löschen aller Schnittebenen und Messungen.

D. Strukturbaum (Spatial Tree)

Versuch 1: Klassifizierung nach räumlicher Struktur (bySpatialStructure -> Projekt/Site/Building/Storey).

Fallback: Da reine Fachmodelle (z.B. Statik) oft keine Geschosse haben, muss der Code Fehler abfangen (try/catch) und automatisch auf eine Klassifizierung nach Entitäten (byEntity -> Wände, Stützen) zurückfallen.

Navigation: Klick im Baum isoliert/zoomt auf die Elemente. "Auge"-Icon schaltet Sichtbarkeit.

4. Plattform-Features

Marketplace / Dashboard

Upload: Drag & Drop von IFC Dateien. Upload direkt zu Supabase Storage (via Signed URLs), um den App-Server zu entlasten.

Projekt-Liste: Anzeige der hochgeladenen Modelle mit Metadaten.

Access Control: Row Level Security (RLS) in Supabase stellt sicher, dass User nur ihre eigenen Modelle sehen.

4.1. Marketplace als Komponenten-Bibliothek (NEU)

Der Marketplace dient als Repository für **atomare BIM-Komponenten** (nicht nur vollständige Modelle).

**Datenstruktur:**
- **Fragment (.frag)**: Leichtgewichtige 3D-Darstellung für den Viewer (optimiert für schnelles Laden).
- **Metadaten (JSON in DB)**:
  - `ifc_type`: IFC-Entitätstyp (z.B. `IfcWindow`, `IfcBoiler`, `IfcWallStandardCase`).
  - `properties`: Visuelle Beschreibungen, Herstellerdaten, Texturen.
  - **`physics`**: Kritisch für EnergyPlus (U-Wert, Wärmekapazität, Transmissionsgrad, etc.).
- **Storage**:
  - `.frag` Dateien in Supabase Storage (`/fragments` Bucket).
  - Metadaten in Supabase Database (`marketplace_items` Tabelle).

**Workflow:**
1. Admin/User lädt Komponente hoch (IFC -> Fragment Konvertierung im Backend).
2. Komponente wird im Marketplace katalogisiert mit allen Eigenschaften.
3. User durchsucht Marketplace (Filter nach IFC-Typ, Hersteller, etc.).
4. Drag & Drop in den Viewer zum Platzieren.

4.2. Viewer als "Assembler" (NEU)

Der Viewer wird von einem passiven "Viewer" zu einem aktiven "Authoring Tool" erweitert.

**Workflow:**
1. User öffnet Marketplace-Sidebar.
2. Drag & Drop: Item wird in 3D-View gezogen.
3. Application lädt `.frag` + Metadaten herunter.
4. **Instantiation**: Komponente wird in der Szene platziert.
5. **Manipulation**: User verwendet Gizmos (Move/Rotate/Scale) zur Positionierung.
6. **State Management**: 
   - `SceneModel` Array: `[{ itemId: "uuid", position: [x,y,z], rotation: [x,y,z], scale: [x,y,z], properties: {...} }]`
   - Dieses `SceneModel` wird an das Backend gesendet (nicht eine rohe IFC-Datei).

**Technische Anforderungen:**
- Fragment Loader: Integration von `@thatopen/fragments` Loader für `.frag` Dateien.
- Transform Controls: Three.js TransformControls für Move/Rotate/Scale.
- Snapping: Optionales Grid-Snapping für präzise Platzierung.

Simulation

Workflow: User startet Simulation im Viewer -> Request an FastAPI -> Python lädt IFC -> Berechnung -> Ergebnis zurück an DB.

Status: Polling oder Realtime-Updates im Frontend über den Fortschritt der Simulation.

4.3. Simulation Pipeline (ERWEITERT)

**Input:** `SceneModel` (JSON) vom Frontend (nicht mehr rohe IFC-Datei).

**Prozess (FastAPI + ifcopenshell/Python):**

1. **Rekonstruktion**: Erstelle in-memory IFC-Modell aus JSON-Definitionen.
   - Mappe `ifc_type` auf `ifcopenshell` Entity-Erstellung.
   - Wende Geometrie an (Bounding Box oder parametrische Dimensionen basierend auf Fragment-Metadaten).

2. **EnergyPlus Konvertierung:**
   - Mappe `IfcWall` -> EnergyPlus `BuildingSurface:Detailed`.
   - Mappe `IfcWindow` -> EnergyPlus `FenestrationSurface:Detailed`.
   - **Physics Injection**: Wende `physics` Metadaten aus Marketplace-Item auf EnergyPlus `Material` Definitionen an.
   - Exportiere `.epJSON` oder `.idf`.

**Validierung:**
- Sicherstellen, dass Elemente `ifc_dictionary` Typen entsprechen.
- EnergyPlus-Kompatibilität prüfen (geschlossene Volumen, korrekte Normalen, etc.).

5. Entwicklungs-Roadmap (Zusammenfassung)

Phase 1 (Infrastruktur): Setup SvelteKit + Shadcn + FastAPI + Supabase. Verbindung herstellen.

Phase 2 (Viewer MVP): Integration des Viewers als Svelte-Komponente mit Shadcn UI (Sidebars, Floating Panels). Implementierung der "Global Shift" Logik.

Phase 3 (Tools): Properties Panel (Daten auslesen), Clipping, Measurement.

Phase 4 (Backend Connect): Dateiupload zu Supabase, Laden der URL im Viewer.

Phase 5 (Simulation): Python-Skripte für Modell-Analyse anbinden.

Phase 6 (Marketplace): Komponenten-Bibliothek mit Fragment-Support, Drag & Drop Integration.

Phase 7 (Authoring): Viewer erweitern um Transform Controls, SceneModel State Management.

Phase 8 (EnergyPlus Export): Backend SceneModel -> IFC -> EnergyPlus Konvertierung.

6. Known Issues & Best Practices

Tailwind: Keine Mischung von v3 und v4. Shadcn nutzt aktuell Standard-Tailwind, was stabil ist.

SSR (Server Side Rendering): Alle Three.js/ThatOpen Logik muss in onMount oder if (browser) gekapselt werden, da der Server kein window oder canvas hat.

Memory Leaks: components.dispose() muss zwingend im onDestroy Lifecycle von Svelte aufgerufen werden, um den WebGL Context zu bereinigen.

Raycaster: Muss in Version 2.x explizit für die aktive Welt registriert werden (raycasters.get(world)), sonst funktionieren Klicks nicht.

7. IFC Dictionary & EnergyPlus Kompatibilität

**IFC Typen:**
- Alle Marketplace-Items müssen einem gültigen IFC-Typ entsprechen (z.B. `IfcWall`, `IfcWindow`, `IfcDoor`, `IfcSlab`, etc.).
- Die Typen werden aus dem IFC Dictionary übernommen (IFC4 Standard).

**EnergyPlus Mapping:**
- `IfcWall` / `IfcWallStandardCase` -> `BuildingSurface:Detailed` (mit Material-Eigenschaften).
- `IfcWindow` / `IfcDoor` -> `FenestrationSurface:Detailed`.
- `IfcSlab` / `IfcRoof` -> `BuildingSurface:Detailed` (mit entsprechender Surface Type).
- `IfcSpace` -> `Zone` (für thermische Zonen).

**Physics Properties (Kritisch):**
Jedes Marketplace-Item muss folgende physikalische Eigenschaften enthalten:
- `thermal_conductivity` (W/m·K): Wärmeleitfähigkeit.
- `specific_heat` (J/kg·K): Spezifische Wärmekapazität.
- `density` (kg/m³): Dichte.
- `thickness` (m): Materialdicke (für mehrschichtige Bauteile).
- `u_value` (W/m²·K): U-Wert (optional, kann aus anderen Werten berechnet werden).

Diese Werte werden direkt in EnergyPlus Material-Definitionen übernommen.