---
name: Investigate IFC Loading Pipeline
overview: ""
todos:
  - id: copy-wasm
    content: Copy web-ifc wasm files into static/wasm
    status: completed
  - id: script-wasm
    content: Add copy-wasm script to package.json and wire into dev/build
    status: completed
    dependencies:
      - copy-wasm
  - id: verify-wasm
    content: Restart, hard-reload, verify wasm 200 and load IFC
    status: completed
    dependencies:
      - script-wasm
---

# Fix IFC Load by Serving WASM

## Goal

Ensure web-ifc WASM binaries are actually served from `/wasm/` so `loader.load()` no longer hangs.

## Plan

1) Copy WASM assets into `static/wasm`

- Copy `node_modules/web-ifc/web-ifc.wasm` and `web-ifc-mt.wasm` to `frontend/static/wasm/`.

2) Automate copy in package scripts

- Add `copy-wasm` script (mkdir + cp) and run it in `dev`/`build` scripts (or keep as separate command if preferred).

3) Verify and test

- Restart dev server, hard-reload; in Network tab confirm `web-ifc.wasm` returns 200 (Content-Type application/wasm) from `/wasm/`.
- Load a small IFC (e.g., Building-Hvac.ifc) and confirm loader completes.