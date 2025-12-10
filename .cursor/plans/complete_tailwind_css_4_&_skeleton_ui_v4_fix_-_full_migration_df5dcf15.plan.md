---
name: Complete Tailwind CSS 4 & Skeleton UI v4 Fix - Full Migration
overview: Vollständige Migration zu Tailwind CSS 4 mit Vite-Plugin (wie in der offiziellen Dokumentation empfohlen) und Behebung aller Skeleton UI Kompatibilitätsprobleme. Entfernung der PostCSS-Konfiguration und Neukonfiguration aller betroffenen Dateien.
todos:
  - id: install-vite-plugin
    content: "Installiere @tailwindcss/vite Plugin: npm install -D @tailwindcss/vite"
    status: completed
  - id: update-vite-config
    content: "Aktualisiere vite.config.ts: Füge tailwindcss() Plugin hinzu"
    status: completed
    dependencies:
      - install-vite-plugin
  - id: update-css-import
    content: "Aktualisiere app.postcss: Ändere @tailwind Direktiven zu @import 'tailwindcss'"
    status: completed
  - id: remove-postcss-config
    content: Lösche postcss.config.js (nicht mehr benötigt)
    status: completed
    dependencies:
      - update-vite-config
  - id: clean-cache
    content: "Lösche Build-Cache: .svelte-kit und node_modules/.vite"
    status: completed
    dependencies:
      - remove-postcss-config
  - id: test-dev-server
    content: "Teste Dev-Server: npm run dev und überprüfe auf Fehler"
    status: completed
    dependencies:
      - clean-cache
---

# Complete Tailwind CSS 4 & Skeleton UI v4 Fix - Full Migration

## Problem-Analyse

Es gibt mehrere zusammenhängende Probleme:

1. **PostCSS-Konfiguration**: Funktioniert, aber nicht optimal für Tailwind CSS 4
2. **Hauptproblem**: Skeleton UI verwendet `@variant md` in CSS, aber Tailwind CSS 4 erkennt diese Variante nicht
3. **Empfohlene Lösung**: Migration zu `@tailwindcss/vite` Plugin (offizielle Empfehlung für SvelteKit)

## Lösung: Vollständige Migration zu Tailwind CSS 4 Vite-Plugin

### 1. Installiere @tailwindcss/vite Plugin

**Datei:** [frontend/package.json](frontend/package.json)

Installiere das offizielle Vite-Plugin:

```bash
npm install -D @tailwindcss/vite
```

### 2. Aktualisiere Vite-Konfiguration

**Datei:** [frontend/vite.config.ts](frontend/vite.config.ts)

**Aktuell:**

```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()]
});
```

**Korrigiert:**

```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()]
});
```

### 3. Aktualisiere CSS-Import

**Datei:** [frontend/src/app.postcss](frontend/src/app.postcss)

**Aktuell:**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Korrigiert:**

```css
@import "tailwindcss";
```

### 4. Entferne PostCSS-Konfiguration

**Datei:** [frontend/postcss.config.js](frontend/postcss.config.js)

**Aktion:** Datei löschen (nicht mehr benötigt mit Vite-Plugin)

### 5. Überprüfe Tailwind-Konfiguration

**Datei:** [frontend/tailwind.config.js](frontend/tailwind.config.js)

Die aktuelle Konfiguration sollte funktionieren, aber wir müssen sicherstellen, dass sie mit dem Vite-Plugin kompatibel ist.

### 6. Überprüfe Skeleton UI Imports

**Datei:** [frontend/src/routes/+layout.svelte](frontend/src/routes/+layout.svelte)

Die Imports sind bereits korrekt (`@skeletonlabs/skeleton`).

## Zusammenfassung der Änderungen

- **1 neue Abhängigkeit:** `@tailwindcss/vite`
- **1 Datei aktualisiert:** `vite.config.ts`
- **1 Datei aktualisiert:** `app.postcss` (CSS-Syntax ändern)
- **1 Datei gelöscht:** `postcss.config.js`
- **0 weitere Änderungen nötig** (Skeleton Imports bereits korrekt)

## Erwartetes Ergebnis

Nach der Migration sollte:

1. Der Dev-Server ohne Fehler starten
2. Alle CSS-Varianten (inkl. `md`) korrekt funktionieren
3. Skeleton UI Styles korrekt geladen werden
4. Keine PostCSS-Fehler mehr auftreten
5. Bessere Performance durch Vite-Plugin

## Zusätzliche Schritte nach Migration

1. Cache löschen: `.svelte-kit` und `node_modules/.vite`
2. Dev-Server neu starten
3. Überprüfen, dass alle Styles korrekt angewendet werden