---
name: Fix ThatOpen Components API Compliance
overview: Das Problem ist, dass wir inkonsistent `loader.webIfc` (direkte Property) vs. `loader.settings.webIfc` verwenden. Beim Setup ist `loader.webIfc` korrekt initialisiert (`IfcAPI2`), aber beim Laden verwenden wir `loader.settings.webIfc`, was ein anderes Objekt ist (`Object` ohne WASM-Funktionen). Laut API sollte `loader.webIfc` (direkte Property) verwendet werden.
todos:
  - id: replace-settings-webifc
    content: Ersetze alle loader.settings.webIfc Zugriffe durch loader.webIfc (direkte Property)
    status: completed
  - id: verify-webifc-consistency
    content: Verifiziere, dass loader.webIfc konsistent IfcAPI2 Typ ist beim Setup UND beim Laden
    status: completed
    dependencies:
      - replace-settings-webifc
  - id: test-load-operation
    content: Teste IFC-Datei-Laden - sollte jetzt erfolgreich sein mit korrekten WASM-Funktionen
    status: completed
    dependencies:
      - verify-webifc-consistency
---

# Fix ThatOpen Components API Compliance

## Problem Analysis

Die Logs zeigen:

- **Beim Setup**: `webIfcType: 'IfcAPI2'` ✅ (korrekt, über `loader.webIfc`)
- **Beim Laden**: `webIfcType: 'Object'`, `hasWasm: false` ❌ (falsch, über `loader.settings.webIfc`)

**Root Cause**: Inkonsistente Verwendung von `webIfc`:

- Setup verwendet: `loader.webIfc || loader.settings?.webIfc` (findet `loader.webIfc`)
- Laden verwendet: `loader.settings.webIfc` (findet falsches Objekt)

Laut [ThatOpen Components API](https://docs.thatopen.com/api/@thatopen/components/classes/IfcLoader#webIfc) ist `loader.webIfc` die direkte Property vom Typ `IfcAPI`, die verwendet werden sollte.

## Solution

### 1. Konsistente Verwendung von `loader.webIfc`

- **Ändere alle Zugriffe** von `loader.settings.webIfc` zu `loader.webIfc`
- `loader.webIfc` ist die direkte Property und enthält die initialisierte `IfcAPI` Instanz
- `loader.settings.webIfc` ist möglicherweise eine andere Referenz oder ein Wrapper

### 2. Korrigiere alle Stellen im Code

**Dateien zu ändern:**

- `frontend/src/lib/components/BimViewer.svelte`:
- Zeile 204: Bereits korrekt (`loader.webIfc || loader.settings?.webIfc`)
- Zeile 228: `loader.settings.webIfc.COORDINATE_TO_ORIGIN` → `loader.webIfc.COORDINATE_TO_ORIGIN`
- Zeile 395: `loader.settings.webIfc` → `loader.webIfc`
- Zeile 442: `loader.settings.webIfc` → `loader.webIfc`
- Zeile 444: `loader.settings.webIfc.COORDINATE_TO_ORIGIN` → `loader.webIfc.COORDINATE_TO_ORIGIN`
- Zeile 462: `loader.settings.webIfc` → `loader.webIfc`
- Zeile 468: `loader.settings.webIfc` → `loader.webIfc`
- Zeile 509: `loader.settings.wasm?.path` → bleibt (korrekt für WASM-Pfad)
- Zeile 560: `loader.settings.webIfc` → `loader.webIfc`
- Alle anderen Stellen, die `loader.settings.webIfc` verwenden

### 3. Verifizierung nach Änderungen

- Nach Setup: `loader.webIfc` sollte `IfcAPI2` sein
- Beim Laden: `loader.webIfc` sollte immer noch `IfcAPI2` sein (nicht `Object`)
- WASM-Funktionen sollten verfügbar sein: `OpenModel`, `GetLine`, etc.

### 4. Zusätzliche Compliance-Checks

- Prüfe, ob `loader.load()` korrekt mit 3-4 Argumenten aufgerufen wird ✅ (bereits behoben)
- Prüfe, ob `classifier.find()` awaited wird ✅ (bereits behoben)
- Prüfe, ob `setVisible` statt `setVisibility` verwendet wird ✅ (bereits behoben)

## Implementation Details

### Erwartetes Verhalten nach Fix

- `loader.webIfc` ist konsistent `IfcAPI2` Typ
- WASM-Funktionen sind beim Laden verfügbar
- `loader.load()` kann erfolgreich ausgeführt werden
- Keine "WASM appears to NOT be loaded" Fehler mehr

## Testing

1. Starte Dev-Server neu
2. Öffne Viewer-Seite
3. Prüfe Console: `webIfcType` sollte beim Setup UND beim Laden `IfcAPI2` sein
4. Lade IFC-Datei - sollte erfolgreich sein
5. Prüfe, ob Modell im Viewer angezeigt wird