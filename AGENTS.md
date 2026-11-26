# Webs-Docs — Directivas del Agente (Fuente Única Compacta)

## 1. Límites de Seguridad
- Prohibido modificar o exponer `.env*`, `.git/`, credenciales o ejecutar comandos destructivos (`rm -rf`, `git reset --hard`, `git push --force`).
- Edición atómica y quirúrgica; conservar firmas existentes salvo autorización explícita.

## 2. Arquitectura Modular y Ahorro de Tokens
- **PROHIBIDO leer o buscar dentro de `libs/` (~172k tokens) o `package-lock.json` (~183k tokens).**
- Mapa directo de archivos (ir directo al módulo relevante sin explorar el repo):
  - `shared/dom-utils.js` — nombres de archivo, descargas, `escapeXml/Html`, `pickBestSrcsetUrl`, tema.
  - `shared/zip-docx.js` — `SimpleZip`, compresión DEFLATE, `.docx` visual/editable, corte inteligente A4 (`findSafeCutRow`, `sliceCanvasForA4`).
  - `shared/capture-stitch.js` — paso múltiplo de 8px y costura interior sin líneas blancas.
  - `popup/popup-capture.js` — `executeInPage`, `captureTabImage`, `captureFullPageCanvas` + Watchdog.
  - `popup/popup.js` — UI del popup, sub-modos, preferencias, exportadores PDF/Word/PNG/HTML y lanzador de Modo Creador.
  - `editor/editor-minimap.js` — panel izquierdo en tiempo real, cajas fantasma y restauración individual.
  - `editor/editor-smart-tools.js` — `Auto-Limpiar`, `Reacomodar` (Readability) y `Auto-Censura` PII.
  - `editor/editor-exports.js` — inliner de imágenes, compositor nativo Firefox y exportadores del Creador.
  - `editor/editor.js` — núcleo del Modo Creador, herramientas interactivas e historial Undo/Redo.
  - `scripts/build-zip.ps1` — empaquetar versión con `npm run zip` (o `-Version X.Y.Z`).

## 3. OmniRoute (Ahorro de Modelos)
- **Modelo Ligero (Flash / Haiku):** CSS, HTML, textos, versiones, `npm run zip` y fixes locales.
- **Modelo Avanzado (Pro / Sonnet / Opus):** bugs complejos de captura/compositor o arquitectura.

## 4. Auditoría GitNexus (Selectiva — Cero Desperdicio)
- **Obligatorio** (`impact` antes + `detect_changes` al cerrar) solo al modificar `shared/*`, cambiar firmas de funciones o refactorizar arquitectura.
- **Exento** para ajustes de CSS, HTML, textos, versiones o scripts de empaquetado (`scripts/build-zip.ps1`).
- Nunca ignorar riesgo `HIGH`/`CRITICAL` ni asumir `UNKNOWN` como seguro.

## 5. Frontend Embellecedor
- Usar la suite de `Fronted embellecedor/`: Obsidian `#050508`, tarjetas spotlight/glass (`ui-pro-max`), grilla 4/8pt y contraste AA/AAA (`impecable`), listas/barras/badges (`skill-ul`).
