// ============================================================================
// BWD — Modo Creador Inteligente Controller (editor.js)
// Motor de edición visual interactiva en tiempo real y exportación fiel
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  const cloneFrame = document.getElementById('cloneFrame');
  const pageOriginEl = document.getElementById('pageOrigin');
  const changesCounterEl = document.getElementById('changesCounter');
  const activeToolHintEl = document.getElementById('activeToolHint');
  const activeModeBadge = document.getElementById('activeModeBadge');
  const toastNotification = document.getElementById('toastNotification');
  const toastMessage = document.getElementById('toastMessage');

  const toolEditBtn = document.getElementById('toolEdit');
  const toolDeleteBtn = document.getElementById('toolDelete');
  const toolRedactBtn = document.getElementById('toolRedact');
  const toolCursorBtn = document.getElementById('toolCursor');
  const btnAutoClean = document.getElementById('btnAutoClean');
  const btnReorganize = document.getElementById('btnReorganize');
  const btnAutoRedact = document.getElementById('btnAutoRedact');
  const btnUndo = document.getElementById('btnUndo');
  const btnRedo = document.getElementById('btnRedo');
  const btnReset = document.getElementById('btnReset');

  const redactStyleGroup = document.getElementById('redactStyleGroup');
  const readerControlsGroup = document.getElementById('readerControlsGroup');
  const btnReaderFontDown = document.getElementById('btnReaderFontDown');
  const btnReaderFontUp = document.getElementById('btnReaderFontUp');

  const workspaceViewportWrap = document.getElementById('workspaceViewportWrap');
  const btnZoomOut = document.getElementById('btnZoomOut');
  const btnZoomIn = document.getElementById('btnZoomIn');
  const btnZoomReset = document.getElementById('btnZoomReset');

  const inspectorHud = document.getElementById('inspectorHud');
  const inspectorTagLabel = document.getElementById('inspectorTagLabel');
  const btnSelectParent = document.getElementById('btnSelectParent');

  const textFormatBar = document.getElementById('textFormatBar');
  const btnFinishTextEdit = document.getElementById('btnFinishTextEdit');

  const imageEditPopover = document.getElementById('imageEditPopover');
  const imgSrcInput = document.getElementById('imgSrcInput');
  const btnApplyImgSrc = document.getElementById('btnApplyImgSrc');
  const btnUploadLocalImg = document.getElementById('btnUploadLocalImg');
  const localImgFileInput = document.getElementById('localImgFileInput');
  const btnRedactImg = document.getElementById('btnRedactImg');
  const btnDeleteImg = document.getElementById('btnDeleteImg');
  const btnCloseImgPopover = document.getElementById('btnCloseImgPopover');

  const exportDropdownWrap = document.getElementById('exportDropdownWrap');
  const btnExportMenu = document.getElementById('btnExportMenu');
  const exportMenuDropdown = document.getElementById('exportMenuDropdown');
  const optNativeCapture = document.getElementById('optNativeCapture');
  const pdfPageModeGroup = document.getElementById('pdfPageModeGroup');
  const docxExportModeGroup = document.getElementById('docxExportModeGroup');

  const btnEditorPdf = document.getElementById('btnEditorPdf');
  const btnEditorDocx = document.getElementById('btnEditorDocx');
  const btnEditorPng = document.getElementById('btnEditorPng');
  const btnEditorHtml = document.getElementById('btnEditorHtml');

  const exportModal = document.getElementById('exportModal');
  const exportModalTitle = document.getElementById('exportModalTitle');
  const exportModalStatus = document.getElementById('exportModalStatus');
  const exportProgressBar = document.getElementById('exportProgressBar');

  let activeTool = 'edit'; // 'edit' | 'delete' | 'redact' | 'cursor'
  let redactStyle = 'solid'; // 'solid' | 'blur' | 'mask'
  let pdfPageMode = 'continuous'; // 'continuous' | 'a4'
  let docxExportMode = 'hybrid'; // 'hybrid' | 'editable' | 'visual'
  let zoomLevel = 1;
  let viewportPreset = '100%';
  let isReadabilityMode = false;
  let readerTheme = 'light';
  let readerFontSize = 18;

  let changesCount = 0;
  const undoStack = [];
  const redoStack = [];
  let originalHtmlBackup = '';
  let cloneData = null;

  let hoveredInspectorEl = null;
  let activeEditingEl = null;
  let activeEditingOldHtml = '';
  let activeImageEl = null;
  let isExporting = false;

  const { escapeHtml, pickBestSrcsetUrl } = window.BwdShared;

  // Inicializar controladores modulares (editor-minimap.js, editor-exports.js, editor-smart-tools.js)
  const minimapCtrl = window.createEditorMinimapController({
    cloneFrame,
    undoStack,
    redoStack,
    getChangesCount: () => changesCount,
    setChangesCount: (v) => { changesCount = v; },
    commitActiveTextEdit,
    closeImagePopover,
    clearInspectorHover,
    applyHistoryAction,
    updateHistoryUI
  });

  const {
    describeElementShort,
    extractElementSnippet,
    captureElementDocGeometry,
    ensureActionMeta,
    syncMinimapLens,
    renderLiveChangesFeedAndMarkers,
    scheduleLivePreviewSync
  } = minimapCtrl;

  const exportCtrl = window.createEditorExportController({
    cloneFrame,
    optNativeCapture,
    exportModal,
    toastNotification,
    btnEditorPdf,
    btnEditorDocx,
    btnEditorPng,
    btnEditorHtml,
    getCloneData: () => cloneData,
    getActiveTool: () => activeTool,
    getZoomLevel: () => zoomLevel,
    getPdfPageMode: () => pdfPageMode,
    getDocxExportMode: () => docxExportMode,
    getIsExporting: () => isExporting,
    setIsExporting: (v) => { isExporting = v; },
    commitActiveTextEdit,
    closeImagePopover,
    clearInspectorHover,
    scheduleLivePreviewSync,
    showExportModal,
    hideExportModal,
    showToast,
    setTool
  });
  const { inlineAllImages } = exportCtrl;

  const smartCtrl = window.createEditorSmartToolsController({
    cloneFrame,
    btnAutoClean,
    btnReorganize,
    btnAutoRedact,
    btnUndo,
    readerControlsGroup,
    undoStack,
    getCloneData: () => cloneData,
    getActiveTool: () => activeTool,
    getRedactStyle: () => redactStyle,
    getIsReadabilityMode: () => isReadabilityMode,
    setIsReadabilityMode: (v) => { isReadabilityMode = v; },
    getReaderTheme: () => readerTheme,
    getReaderFontSize: () => readerFontSize,
    commitActiveTextEdit,
    closeImagePopover,
    clearInspectorHover,
    captureElementDocGeometry,
    normalizeFrameMedia,
    applyElementRedaction,
    maskTextPreserveSpaces,
    pushHistoryAction,
    setTool,
    inlineAllImages,
    showExportModal,
    hideExportModal,
    showToast
  });
  const { applyReaderAppearance } = smartCtrl;

  function updateHistoryUI() {
    changesCounterEl.textContent = `${changesCount} cambio${changesCount === 1 ? '' : 's'}`;
    if (btnUndo) btnUndo.disabled = undoStack.length === 0;
    if (btnRedo) btnRedo.disabled = redoStack.length === 0;
    if (btnReset) btnReset.disabled = (undoStack.length === 0 && changesCount === 0);
    renderLiveChangesFeedAndMarkers();
  }

  function pushHistoryAction(action, deltaChanges = 1) {
    ensureActionMeta(action);
    undoStack.push(action);
    redoStack.length = 0;
    changesCount = Math.max(0, changesCount + deltaChanges);
    updateHistoryUI();
    scheduleLivePreviewSync(action.type === 'full_reorganize');
  }

  // --------------------------------------------------------------------------
  // 1. Cargar datos del clon desde storage (Sesión Aislada ?id=... o fallback)
  // --------------------------------------------------------------------------
  try {
    const params = new URLSearchParams(window.location.search);
    const sessionKey = params.get('id');
    const keysToFetch = sessionKey ? [sessionKey, 'bwd_clone_data'] : ['bwd_clone_data'];
    const res = await browser.storage.local.get(keysToFetch);
    cloneData = (sessionKey && res[sessionKey]) ? res[sessionKey] : res.bwd_clone_data;

    if (!cloneData || !cloneData.html) {
      showToast("No se encontraron datos del clon. Abre una página y selecciona 'Modo Creador'.", true);
      pageOriginEl.textContent = 'Sin datos';
      return;
    }

    originalHtmlBackup = cloneData.html;
    pageOriginEl.textContent = cloneData.url || 'Página Web';
    document.title = `Creador Inteligente — ${cloneData.title || 'Documento'}`;

    renderClone(cloneData);
    updateHistoryUI();

  } catch (err) {
    console.error("Error al cargar datos del clon:", err);
    showToast("Error al inicializar el editor.", true);
  }

  // --------------------------------------------------------------------------
  // 2. Renderizar el HTML en el iframe sin scripts invasivos ni alterar tipografía
  // --------------------------------------------------------------------------
  function renderClone(data) {
    let cleanHtml = data.html || '';

    isReadabilityMode = false;
    if (btnReorganize) btnReorganize.classList.remove('is-active');
    if (readerControlsGroup) readerControlsGroup.style.display = 'none';

    // 1. Asegurar DOCTYPE estándar para evitar MODO QUIRKS
    cleanHtml = cleanHtml.trim().replace(/^(\s*<!--[\s\S]*?-->\s*)+/i, '');
    if (!/^\s*<!DOCTYPE\s+html/i.test(cleanHtml)) {
      cleanHtml = '<!DOCTYPE html>\n' + cleanHtml;
    }

    // 2. Neutralizar scripts y noscripts para evitar redirecciones, tracking o bloqueos
    cleanHtml = cleanHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    cleanHtml = cleanHtml.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '');

    // 3. Eliminar iframes invasivos de paywall, trackers y redes de anuncios
    cleanHtml = cleanHtml.replace(/<iframe\b[^>]*(?:google\.com\/swg|serviceiframe|doubleclick|google_ads|taboola|outbrain|adnxs|adsystem|dailymotion|chartbeat|adzone|streamtheworld|imasdk)[^>]*>[\s\S]*?<\/iframe>/gi, '');
    cleanHtml = cleanHtml.replace(/<iframe\b[^>]*id=["'][^"']*serviceiframe[^"']*["'][^>]*>[\s\S]*?<\/iframe>/gi, '');

    // 4. Neutralizar autoplay de videos y audios
    cleanHtml = cleanHtml.replace(/\bautoplay\b/gi, 'data-bwd-no-autoplay');

    // 5. Inyectar base URI si no existe
    if (!/<base\b/i.test(cleanHtml)) {
      cleanHtml = cleanHtml.replace(/<head([^>]*)>/i, `<head$1><base href="${escapeHtml(data.baseURI || data.url)}">`);
    }

    // Estilos del editor inyectados dentro del iframe (sin pisar tracking/tipografía original y sin *:hover apilado)
    const editorInjectedStyles = `
      <style id="bwd-editor-internal-css">
        /* 1. Modo Editar: Hover para texto e imágenes */
        body[data-bwd-tool="edit"] h1:hover,
        body[data-bwd-tool="edit"] h2:hover,
        body[data-bwd-tool="edit"] h3:hover,
        body[data-bwd-tool="edit"] h4:hover,
        body[data-bwd-tool="edit"] h5:hover,
        body[data-bwd-tool="edit"] h6:hover,
        body[data-bwd-tool="edit"] p:hover,
        body[data-bwd-tool="edit"] span:hover,
        body[data-bwd-tool="edit"] a:hover,
        body[data-bwd-tool="edit"] li:hover,
        body[data-bwd-tool="edit"] td:hover,
        body[data-bwd-tool="edit"] th:hover,
        body[data-bwd-tool="edit"] dt:hover,
        body[data-bwd-tool="edit"] dd:hover,
        body[data-bwd-tool="edit"] button:hover,
        body[data-bwd-tool="edit"] label:hover,
        body[data-bwd-tool="edit"] figcaption:hover,
        body[data-bwd-tool="edit"] blockquote:hover,
        body[data-bwd-tool="edit"] [class*="title"]:hover,
        body[data-bwd-tool="edit"] [class*="text"]:hover,
        body[data-bwd-tool="edit"] [class*="epigrafe"]:hover,
        body[data-bwd-tool="edit"] [class*="bajada"]:hover,
        body[data-bwd-tool="edit"] [class*="author"]:hover {
          outline: 1.5px dashed rgba(56, 189, 248, 0.55) !important;
          outline-offset: 2px !important;
          cursor: text !important;
        }

        body[data-bwd-tool="edit"] img:hover {
          outline: 2px solid #38bdf8 !important;
          outline-offset: 2px !important;
          cursor: pointer !important;
          box-shadow: 0 0 16px rgba(56, 189, 248, 0.35) !important;
        }

        body[data-bwd-tool="edit"] [contenteditable="true"] {
          outline: 2px solid #38bdf8 !important;
          outline-offset: 3px !important;
          background-color: rgba(56, 189, 248, 0.06) !important;
          box-shadow: 0 0 14px rgba(56, 189, 248, 0.28) !important;
          border-radius: 4px !important;
          cursor: text !important;
        }

        /* 2. Inspector de un Único Nodo (Eliminar / Censurar) — Cero bordes padres apilados */
        [data-bwd-hovered="delete"] {
          outline: 2px dashed #f43f5e !important;
          outline-offset: 2px !important;
          cursor: pointer !important;
          background-color: rgba(244, 63, 94, 0.14) !important;
          box-shadow: 0 0 14px rgba(244, 63, 94, 0.28) !important;
        }

        [data-bwd-hovered="redact"] {
          outline: 2px dashed #a855f7 !important;
          outline-offset: 2px !important;
          cursor: crosshair !important;
          background-color: rgba(168, 85, 247, 0.16) !important;
          box-shadow: 0 0 14px rgba(168, 85, 247, 0.28) !important;
        }

        /* 3. Estilos de Censura Blindados (visibles en fondos claros y oscuros, ocultando hijos) */
        .bwd-redacted-box {
          background-color: #0f172a !important;
          background-image: none !important;
          color: transparent !important;
          -webkit-text-fill-color: transparent !important;
          text-shadow: none !important;
          user-select: none !important;
          border-radius: 3px !important;
          border: 1px solid rgba(148, 163, 184, 0.32) !important;
          box-decoration-break: clone;
        }
        .bwd-redacted-box * {
          color: transparent !important;
          -webkit-text-fill-color: transparent !important;
          text-shadow: none !important;
          background-image: none !important;
          opacity: 0 !important;
        }

        .bwd-redacted-blur {
          filter: blur(8px) !important;
          user-select: none !important;
          pointer-events: auto !important;
        }

        .bwd-redacted-mask {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
          letter-spacing: 0.05em !important;
          user-select: none !important;
        }

        .ln-placeholder {
          background-image: none !important;
          background-color: transparent !important;
        }

        /* Supresión total de bordes/hovers interactivos durante la exportación */
        body[data-bwd-exporting="true"] *,
        body[data-bwd-exporting="true"] *:hover {
          outline: none !important;
        }
      </style>
    `;

    if (/<\/head>/i.test(cleanHtml)) {
      cleanHtml = cleanHtml.replace(/<\/head>/i, `${editorInjectedStyles}</head>`);
    } else {
      cleanHtml = editorInjectedStyles + cleanHtml;
    }

    minimapCtrl.resetPreviewReady();
    const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
    frameDoc.open();
    frameDoc.write(cleanHtml);
    frameDoc.close();

    function stabilizeClonedTopLayout(doc) {
      if (!doc || !doc.body) return;
      const win = doc.defaultView || cloneFrame.contentWindow || window;
      try {
        win.scrollTo(0, 0);
        if (doc.documentElement) doc.documentElement.scrollTop = 0;
        if (doc.body) doc.body.scrollTop = 0;

        const mainHeading = doc.querySelector('article h1, main h1, h1');
        const h1Rect = mainHeading ? mainHeading.getBoundingClientRect() : null;
        const vH = win.innerHeight || 800;

        doc.querySelectorAll('header, nav, div, section, aside').forEach(el => {
          if (!el || el === doc.body || el === doc.documentElement) return;
          if (el.hasAttribute('data-bwd-redacted')) return;
          try {
            const s = win.getComputedStyle(el);
            if (s.position !== 'fixed') return;

            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0 || rect.height > vH * 0.72) return;

            const idCls = `${el.id || ''} ${typeof el.className === 'string' ? el.className : ''}`.toLowerCase();
            const isAdBanner = /(ln-placeholder|publicidad|ad-container|ad-slot|ad-box|div-gpt-ad|google_ads|sticky-ad|top-banner|caja-)/i.test(idCls) || el.hasAttribute('data-ad-slot');
            const topPx = parseFloat(s.top);
            const overlapsHeading = Boolean(
              h1Rect &&
              h1Rect.height > 10 &&
              rect.bottom > (h1Rect.top + 4) &&
              rect.top < (h1Rect.bottom + 64)
            );

            if (isAdBanner && rect.top < 360) {
              el.style.setProperty('position', 'static', 'important');
              el.style.setProperty('top', 'auto', 'important');
              el.style.setProperty('transform', 'none', 'important');
            } else if (
              (el.tagName === 'HEADER' || el.tagName === 'NAV' || idCls.includes('header') || idCls.includes('navbar')) &&
              ((!Number.isNaN(topPx) && topPx > 18) || overlapsHeading)
            ) {
              // Cabecera desplazada por JS durante scroll (ej. top: 241px sobre el titular en diarios): devolver a su flujo superior
              el.style.setProperty('position', 'relative', 'important');
              el.style.setProperty('top', 'auto', 'important');
              el.style.setProperty('left', 'auto', 'important');
              el.style.setProperty('right', 'auto', 'important');
              el.style.setProperty('width', '100%', 'important');
              el.style.setProperty('transform', 'none', 'important');
            } else if (overlapsHeading && rect.top < 360 && !el.contains(mainHeading)) {
              el.style.setProperty('position', 'static', 'important');
              el.style.setProperty('top', 'auto', 'important');
              el.style.setProperty('transform', 'none', 'important');
            }
          } catch (_) { }
        });
      } catch (_) { }
    }

    function activateFrame() {
      const doc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
      if (!doc || !doc.body) return;
      if (doc.__bwd_activated) return;
      doc.__bwd_activated = true;
      initFrameEvents();
      stabilizeClonedTopLayout(doc);
      setTool(activeTool);
      scheduleLivePreviewSync(true);
      inlineAllImages(doc).then(() => {
        stabilizeClonedTopLayout(doc);
        if (!isExporting) scheduleLivePreviewSync(true);
      }).catch(() => { });
    }

    activateFrame();
    if (frameDoc.readyState === 'loading') {
      frameDoc.addEventListener('DOMContentLoaded', activateFrame, { once: true });
    }
    setTimeout(activateFrame, 50);
    setTimeout(activateFrame, 250);
  }

  // --------------------------------------------------------------------------
  // Helpers de Inspector, Edición de Imagen y Censura Irreversible/Reversible
  // --------------------------------------------------------------------------
  function clearInspectorHover() {
    if (hoveredInspectorEl) {
      try { hoveredInspectorEl.removeAttribute('data-bwd-hovered'); } catch (_) { }
      hoveredInspectorEl = null;
    }
    if (inspectorHud) inspectorHud.style.display = 'none';
  }

  function formatElementLabel(el) {
    if (!el || !el.tagName) return 'elemento';
    const tag = el.tagName.toLowerCase();
    const cls = (typeof el.className === 'string' && el.className.trim())
      ? '.' + el.className.trim().split(/\s+/).filter(c => !c.startsWith('bwd-')).slice(0, 2).join('.')
      : '';
    const id = el.id ? `#${el.id}` : '';
    const rect = el.getBoundingClientRect();
    const dims = `${Math.round(rect.width)}×${Math.round(rect.height)}`;
    return `${tag}${id || cls} · ${dims}`;
  }

  function resolveInspectableTarget(rawTarget, frameDoc) {
    if (!rawTarget || rawTarget === frameDoc.body || rawTarget === frameDoc.documentElement) return null;
    if (rawTarget.namespaceURI === 'http://www.w3.org/2000/svg' && rawTarget.tagName.toLowerCase() !== 'svg') {
      return rawTarget.closest('svg') || rawTarget;
    }
    return rawTarget;
  }

  function setInspectorHover(el) {
    if (isExporting) {
      clearInspectorHover();
      return;
    }
    const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
    if (!el || !frameDoc || el === frameDoc.body || el === frameDoc.documentElement) {
      clearInspectorHover();
      return;
    }
    if (hoveredInspectorEl && hoveredInspectorEl !== el) {
      try { hoveredInspectorEl.removeAttribute('data-bwd-hovered'); } catch (_) { }
    }
    hoveredInspectorEl = el;
    el.setAttribute('data-bwd-hovered', activeTool === 'delete' ? 'delete' : 'redact');
    if (inspectorHud && inspectorTagLabel) {
      inspectorTagLabel.textContent = formatElementLabel(el);
      inspectorHud.style.display = 'flex';
      if (btnSelectParent) {
        const hasValidParent = el.parentElement && el.parentElement !== frameDoc.body && el.parentElement !== frameDoc.documentElement;
        btnSelectParent.disabled = !hasValidParent;
      }
    }
  }

  function generateRedactedImageDataUrl(img, mode) {
    const w = Math.max(24, Math.min(1200, img.naturalWidth || img.clientWidth || 160));
    const h = Math.max(24, Math.min(1200, img.naturalHeight || img.clientHeight || 160));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    if (mode === 'blur') {
      try {
        const smallW = Math.max(6, Math.round(w / 18));
        const smallH = Math.max(6, Math.round(h / 18));
        const temp = document.createElement('canvas');
        temp.width = smallW;
        temp.height = smallH;
        const tctx = temp.getContext('2d');
        tctx.drawImage(img, 0, 0, smallW, smallH);
        ctx.imageSmoothingEnabled = true;
        ctx.filter = 'blur(6px)';
        ctx.drawImage(temp, 0, 0, smallW, smallH, 0, 0, w, h);
        const url = canvas.toDataURL('image/png');
        if (url && url.startsWith('data:image/')) return url;
      } catch (_) { }
    }

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = Math.max(2, Math.round(Math.min(w, h) * 0.03));
    ctx.strokeRect(1, 1, w - 2, h - 2);
    return canvas.toDataURL('image/png');
  }

  function maskTextPreserveSpaces(text) {
    return String(text || '').replace(/[^\s]/g, '•');
  }

  function applyElementRedaction(target, mode = redactStyle) {
    if (!target || target.tagName === 'BODY' || target.tagName === 'HTML') return null;
    target.removeAttribute('data-bwd-hovered');

    const record = {
      element: target,
      mode,
      origClassName: target.className,
      origCssText: target.style.cssText,
      origDataRedacted: target.getAttribute('data-bwd-redacted'),
      isImage: target.tagName === 'IMG',
      origSrc: target.tagName === 'IMG' ? target.getAttribute('src') : null,
      origSrcset: target.tagName === 'IMG' ? target.getAttribute('srcset') : null,
      origHtml: null,
      newSrc: null,
      newHtml: null
    };

    target.classList.remove('bwd-redacted-box', 'bwd-redacted-blur', 'bwd-redacted-mask');
    target.setAttribute('data-bwd-redacted', mode);

    if (record.isImage) {
      const rect = target.getBoundingClientRect();
      if (rect.width > 0 && !target.style.width) target.style.width = `${Math.round(rect.width)}px`;
      if (rect.height > 0 && !target.style.height) target.style.height = `${Math.round(rect.height)}px`;
      record.newSrc = generateRedactedImageDataUrl(target, mode);
      target.removeAttribute('srcset');
      target.setAttribute('src', record.newSrc);
      target.style.borderRadius = '4px';
    } else if (mode === 'mask') {
      record.origHtml = target.innerHTML;
      const walker = target.ownerDocument.createTreeWalker(target, NodeFilter.SHOW_TEXT, null);
      const nodes = [];
      let n;
      while ((n = walker.nextNode())) nodes.push(n);
      nodes.forEach(tn => {
        if (tn.nodeValue && tn.nodeValue.trim()) {
          tn.nodeValue = maskTextPreserveSpaces(tn.nodeValue);
        }
      });
      record.newHtml = target.innerHTML;
      target.classList.add('bwd-redacted-mask');
    } else if (mode === 'blur') {
      target.classList.add('bwd-redacted-blur');
    } else {
      target.classList.add('bwd-redacted-box');
      target.style.backgroundColor = '#0f172a';
      target.style.color = 'transparent';
      target.style.borderRadius = '3px';
    }

    return record;
  }

  function revertRedactionRecord(rec) {
    if (!rec || !rec.element) return;
    const el = rec.element;
    if (rec.isImage) {
      if (rec.origSrc !== null) el.setAttribute('src', rec.origSrc);
      if (rec.origSrcset) el.setAttribute('srcset', rec.origSrcset);
    } else if (rec.origHtml !== null) {
      el.innerHTML = rec.origHtml;
    }
    el.className = rec.origClassName;
    el.style.cssText = rec.origCssText;
    if (rec.origDataRedacted) el.setAttribute('data-bwd-redacted', rec.origDataRedacted);
    else el.removeAttribute('data-bwd-redacted');
  }

  function reapplyRedactionRecord(rec) {
    if (!rec || !rec.element) return;
    const el = rec.element;
    el.classList.remove('bwd-redacted-box', 'bwd-redacted-blur', 'bwd-redacted-mask');
    el.setAttribute('data-bwd-redacted', rec.mode);
    if (rec.isImage && rec.newSrc) {
      el.removeAttribute('srcset');
      el.setAttribute('src', rec.newSrc);
    } else if (rec.mode === 'mask' && rec.newHtml !== null) {
      el.innerHTML = rec.newHtml;
      el.classList.add('bwd-redacted-mask');
    } else if (rec.mode === 'blur') {
      el.classList.add('bwd-redacted-blur');
    } else {
      el.classList.add('bwd-redacted-box');
      el.style.backgroundColor = '#0f172a';
      el.style.color = 'transparent';
      el.style.borderRadius = '3px';
    }
  }

  function commitActiveTextEdit() {
    if (!activeEditingEl) return;
    const el = activeEditingEl;
    const oldHtml = activeEditingOldHtml;
    activeEditingEl = null;
    activeEditingOldHtml = '';
    try { el.removeAttribute('contenteditable'); } catch (_) { }
    if (textFormatBar) textFormatBar.style.display = 'none';

    const newHtml = el.innerHTML;
    if (newHtml !== oldHtml) {
      pushHistoryAction({
        type: 'text',
        element: el,
        oldHtml,
        newHtml
      }, 1);
    }
  }

  function closeImagePopover() {
    activeImageEl = null;
    if (imageEditPopover) imageEditPopover.style.display = 'none';
  }

  function openImagePopover(imgEl) {
    if (!imgEl) return;
    commitActiveTextEdit();
    activeImageEl = imgEl;
    if (imgSrcInput) {
      const s = imgEl.getAttribute('src') || '';
      imgSrcInput.value = s.startsWith('data:') ? '' : s;
      imgSrcInput.placeholder = s.startsWith('data:') ? 'Imagen incrustada (pega URL o sube local)...' : 'Pegar nueva URL de imagen...';
    }
    if (imageEditPopover) imageEditPopover.style.display = 'block';
  }

  function normalizeFrameMedia(frameDoc) {
    if (!frameDoc || !frameDoc.body) return;

    frameDoc.querySelectorAll('picture').forEach(pic => {
      const img = pic.querySelector('img');
      if (img) {
        const srcFromPic = pickBestSrcsetUrl(
          Array.from(pic.querySelectorAll('source')).map(s => s.getAttribute('srcset') || s.getAttribute('data-srcset') || '').join(', ')
        );
        if (srcFromPic && (!img.getAttribute('src') || img.getAttribute('src').includes('data:image/svg'))) {
          img.setAttribute('src', srcFromPic);
        }
        pic.replaceWith(img);
      }
    });

    frameDoc.querySelectorAll('img').forEach(img => {
      const srcsetBest = pickBestSrcsetUrl(img.getAttribute('srcset') || img.getAttribute('data-srcset') || '');
      const candidates = [
        img.getAttribute('data-src'),
        img.getAttribute('data-original'),
        img.getAttribute('data-lazy-src'),
        img.getAttribute('data-url'),
        img.getAttribute('data-retina'),
        srcsetBest,
        img.currentSrc,
        img.getAttribute('src')
      ];

      let realSrc = '';
      for (const c of candidates) {
        if (c && typeof c === 'string' && !c.includes('data:image/svg') && !c.includes('placeholder')) {
          realSrc = c.trim();
          break;
        }
      }

      if (realSrc && !realSrc.startsWith('data:')) {
        try {
          const absUrl = new URL(realSrc, frameDoc.baseURI || cloneData?.baseURI || cloneData?.url || window.location.href).href;
          img.setAttribute('src', absUrl);
          img.src = absUrl;
        } catch (_) {
          img.setAttribute('src', realSrc);
        }
      }

      img.removeAttribute('data-src');
      img.removeAttribute('data-original');
      img.removeAttribute('data-lazy-src');
      img.removeAttribute('data-srcset');
      img.removeAttribute('data-url');
      img.removeAttribute('srcset');
      img.setAttribute('loading', 'eager');
    });
  }

  // --------------------------------------------------------------------------
  // 3. Manejo de Herramientas y Eventos en el Iframe (Sin duplicación de listeners)
  // --------------------------------------------------------------------------
  function initFrameEvents() {
    const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
    if (!frameDoc || !frameDoc.body) return;

    frameDoc.body.setAttribute('data-bwd-tool', activeTool);
    normalizeFrameMedia(frameDoc);

    // Prevenir acumulación de listeners al usar Reacomodar o Deshacer
    if (frameDoc.__bwd_events_bound) return;
    frameDoc.__bwd_events_bound = true;

    frameDoc.addEventListener('click', (e) => {
      const link = e.target && e.target.closest ? e.target.closest('a') : null;
      if (link) {
        e.preventDefault();
      }
    }, true);

    frameDoc.addEventListener('mouseover', (e) => {
      if (isExporting || (activeTool !== 'delete' && activeTool !== 'redact')) return;
      const target = resolveInspectableTarget(e.target, frameDoc);
      if (target) setInspectorHover(target);
    }, true);

    frameDoc.addEventListener('mouseleave', () => {
      clearInspectorHover();
    });

    const frameWin = cloneFrame.contentWindow;
    if (frameWin) {
      frameWin.addEventListener('scroll', () => {
        if (!isExporting) syncMinimapLens();
      }, { passive: true });
    }

    frameDoc.addEventListener('input', () => {
      if (!isExporting) scheduleLivePreviewSync(false);
    }, true);

    frameDoc.addEventListener('wheel', (e) => {
      if (isExporting) return;
      if ((activeTool === 'delete' || activeTool === 'redact') && e.altKey && hoveredInspectorEl) {
        e.preventDefault();
        if (e.deltaY < 0 && hoveredInspectorEl.parentElement && hoveredInspectorEl.parentElement !== frameDoc.body) {
          setInspectorHover(hoveredInspectorEl.parentElement);
        } else if (e.deltaY > 0 && hoveredInspectorEl.firstElementChild) {
          setInspectorHover(hoveredInspectorEl.firstElementChild);
        }
      }
    }, { passive: false });

    frameDoc.addEventListener('click', (e) => {
      if (isExporting) return;
      if (exportDropdownWrap && exportDropdownWrap.classList.contains('is-open')) {
        exportDropdownWrap.classList.remove('is-open');
        if (btnExportMenu) btnExportMenu.setAttribute('aria-expanded', 'false');
      }

      if (activeTool === 'cursor') return;

      const rawTarget = e.target;
      if (!rawTarget || rawTarget === frameDoc.body || rawTarget === frameDoc.documentElement) return;

      if (activeTool === 'delete') {
        e.preventDefault();
        e.stopPropagation();

        const target = hoveredInspectorEl || resolveInspectableTarget(rawTarget, frameDoc);
        if (!target || target === frameDoc.body || target === frameDoc.documentElement) return;

        const docH = Math.max(frameDoc.body.scrollHeight, 1);
        const rect = target.getBoundingClientRect();
        if ((target.tagName === 'MAIN' || rect.height > docH * 0.85) && docH > 600) {
          if (!confirm("Este contenedor abarca casi toda la página. ¿Seguro que deseas eliminarlo?")) {
            return;
          }
        }

        // Capturar geometría y resumen ANTES de borrar del DOM para el mapa de borrados en vivo
        const geo = captureElementDocGeometry(target);
        const delMeta = {
          kind: 'delete',
          badge: 'BORRADO',
          target: describeElementShort(target),
          snippet: extractElementSnippet(target),
          ...geo
        };

        clearInspectorHover();
        target.removeAttribute('data-bwd-hovered');

        const parent = target.parentNode;
        const nextSibling = target.nextSibling;
        if (parent) {
          target.remove();
          pushHistoryAction({
            type: 'delete',
            element: target,
            parent,
            nextSibling,
            meta: delMeta
          }, 1);
          showToast("Elemento eliminado");
        }

      } else if (activeTool === 'redact') {
        e.preventDefault();
        e.stopPropagation();

        const target = hoveredInspectorEl || resolveInspectableTarget(rawTarget, frameDoc);
        if (!target) return;

        clearInspectorHover();
        const rec = applyElementRedaction(target, redactStyle);
        if (rec) {
          pushHistoryAction({
            type: 'redact',
            record: rec
          }, 1);
          showToast("Dato confidencial censurado");
        }

      } else if (activeTool === 'edit') {
        if (rawTarget.tagName === 'IMG') {
          e.preventDefault();
          e.stopPropagation();
          openImagePopover(rawTarget);
          return;
        }
        closeImagePopover();
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(rawTarget.tagName)) return;
        enableTextEditing(rawTarget);
      }
    }, true);

    frameDoc.addEventListener('dblclick', (e) => {
      if (activeTool === 'edit' && e.target && e.target.tagName !== 'IMG' && e.target.isContentEditable !== true) {
        enableTextEditing(e.target);
      }
    }, true);

    frameDoc.addEventListener('keydown', (e) => {
      handleGlobalShortcuts(e, true);
    });
  }

  function enableTextEditing(element) {
    if (!element || element.tagName === 'BODY' || element.tagName === 'HTML' || element.tagName === 'IMG') return;
    if (element.closest && element.closest('svg')) return;

    let target = element.closest('h1, h2, h3, h4, h5, h6, p, span, a, td, th, dt, dd, li, button, label, figcaption, blockquote') || element;
    // Si el elemento seleccionado es un <a> envolviendo toda una tarjeta grande con bloques e imágenes, editar el nodo hijo directo
    if (target.tagName === 'A' && target.querySelector('img, h1, h2, h3, h4, p, div')) {
      target = element;
    }

    if (activeEditingEl && activeEditingEl !== target) {
      commitActiveTextEdit();
    }

    if (target && !target.isContentEditable) {
      activeEditingEl = target;
      activeEditingOldHtml = target.innerHTML;
      target.contentEditable = "true";
      target.focus();
      if (textFormatBar) textFormatBar.style.display = 'flex';

      const onPaste = (ev) => {
        if (ev.clipboardData) {
          ev.preventDefault();
          const plain = ev.clipboardData.getData('text/plain');
          const frameDoc = target.ownerDocument;
          if (frameDoc && frameDoc.execCommand) {
            frameDoc.execCommand('insertText', false, plain);
          }
        }
      };
      target.addEventListener('paste', onPaste);

      target.addEventListener('blur', function onBlur(ev) {
        // Si el clic fue dentro de la barra flotante de formato, mantener edición activa
        if (ev && ev.relatedTarget && textFormatBar && textFormatBar.contains(ev.relatedTarget)) {
          setTimeout(() => {
            if (activeEditingEl === target) target.focus();
          }, 0);
          return;
        }
        target.removeEventListener('blur', onBlur);
        target.removeEventListener('paste', onPaste);
        if (activeEditingEl === target) {
          commitActiveTextEdit();
        }
      });
    }
  }

  function setTool(tool) {
    commitActiveTextEdit();
    closeImagePopover();
    clearInspectorHover();
    activeTool = tool;

    toolEditBtn.classList.toggle('is-active', tool === 'edit');
    toolDeleteBtn.classList.toggle('is-active', tool === 'delete');
    toolRedactBtn.classList.toggle('is-active', tool === 'redact');
    if (toolCursorBtn) toolCursorBtn.classList.toggle('is-active', tool === 'cursor');

    if (redactStyleGroup) {
      redactStyleGroup.style.display = tool === 'redact' ? 'inline-flex' : 'none';
    }

    if (activeModeBadge) {
      if (tool === 'edit') {
        activeModeBadge.textContent = "MODO EDITAR";
        activeModeBadge.className = "guide-mode-tag tag-edit";
      } else if (tool === 'delete') {
        activeModeBadge.textContent = "MODO ELIMINAR";
        activeModeBadge.className = "guide-mode-tag tag-delete";
      } else if (tool === 'redact') {
        activeModeBadge.textContent = "MODO CENSURAR";
        activeModeBadge.className = "guide-mode-tag tag-redact";
      } else if (tool === 'cursor') {
        activeModeBadge.textContent = "MODO CURSOR";
        activeModeBadge.className = "guide-mode-tag tag-cursor";
      }
    }

    const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
    if (frameDoc && frameDoc.body) {
      frameDoc.body.setAttribute('data-bwd-tool', tool);
      frameDoc.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));

      if (tool === 'edit') {
        activeToolHintEl.textContent = "Haz clic en un texto para editarlo con formato o en una imagen para reemplazarla.";
      } else if (tool === 'delete') {
        activeToolHintEl.textContent = "Apunta al bloque exacto (Alt+Rueda o '↑ Padre' para subir de nivel) y haz clic para eliminarlo.";
      } else if (tool === 'redact') {
        activeToolHintEl.textContent = "Oculta textos, montos o fotos de forma segura antes de exportar.";
      } else if (tool === 'cursor') {
        activeToolHintEl.textContent = "Navegación y selección libre activas sin alterar elementos.";
      }
    }
  }

  function incrementChanges() {
    changesCount++;
    updateHistoryUI();
  }

  // --------------------------------------------------------------------------
  // 4. Auto-Limpieza, Reacomodar (Readability) y Auto-Censura delegados a editor/editor-smart-tools.js
  // --------------------------------------------------------------------------

  // --------------------------------------------------------------------------
  // 5. Historial Completo: Deshacer (Undo), Rehacer (Redo) y Restablecer
  // --------------------------------------------------------------------------
  function applyHistoryAction(action, direction) {
    const isUndo = direction === 'undo';
    const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;

    if (action.type === 'delete') {
      if (isUndo) {
        if (action.parent) action.parent.insertBefore(action.element, action.nextSibling);
        showToast("Elemento restaurado");
      } else {
        action.element.remove();
        showToast("Eliminación rehecha");
      }
      return 1;

    } else if (action.type === 'batch_delete') {
      const count = Math.max(1, action.items.length);
      if (isUndo) {
        for (let i = action.items.length - 1; i >= 0; i--) {
          const item = action.items[i];
          if (item.parent) item.parent.insertBefore(item.element, item.nextSibling);
        }
        (action.styleFixes || []).forEach(sf => {
          if (sf.el) sf.el.style.cssText = sf.cssText || '';
        });
        showToast(`¡Se restauraron ${count} elementos!`);
      } else {
        action.items.forEach(item => item.element.remove());
        showToast(`¡Limpieza rehecha (${count} elementos)!`);
      }
      return count;

    } else if (action.type === 'redact') {
      if (isUndo) {
        revertRedactionRecord(action.record);
        showToast("Censura deshecha");
      } else {
        reapplyRedactionRecord(action.record);
        showToast("Censura rehecha");
      }
      return 1;

    } else if (action.type === 'batch_redact') {
      const count = (action.records ? action.records.length : 0) + (action.wrappedSpans ? action.wrappedSpans.length : 0);
      if (isUndo) {
        (action.records || []).forEach(rec => revertRedactionRecord(rec));
        (action.wrappedSpans || []).forEach(sp => {
          if (sp && sp.parentNode) {
            const origText = sp.getAttribute('data-bwd-orig-text') || sp.textContent;
            const textNode = frameDoc.createTextNode(origText);
            sp.__bwd_text_placeholder = textNode;
            sp.replaceWith(textNode);
          }
        });
        showToast(`Auto-Censura deshecha (${count} datos restaurados)`);
      } else {
        (action.records || []).forEach(rec => reapplyRedactionRecord(rec));
        (action.wrappedSpans || []).forEach(sp => {
          const tn = sp.__bwd_text_placeholder;
          if (tn && tn.parentNode) {
            tn.replaceWith(sp);
          }
        });
        showToast(`Auto-Censura rehecha (${count} datos)`);
      }
      return Math.max(1, count);

    } else if (action.type === 'text') {
      if (action.element) {
        action.element.innerHTML = isUndo ? action.oldHtml : action.newHtml;
        showToast(isUndo ? "Edición de texto deshecha" : "Edición de texto rehecha");
      }
      return 1;

    } else if (action.type === 'image_edit') {
      if (action.element) {
        const srcVal = isUndo ? action.oldSrc : action.newSrc;
        const wVal = isUndo ? action.oldWidth : action.newWidth;
        if (srcVal !== undefined && srcVal !== null) action.element.setAttribute('src', srcVal);
        action.element.style.width = wVal || '';
        if (wVal) action.element.style.height = 'auto';
        showToast(isUndo ? "Imagen restaurada" : "Cambio de imagen rehecho");
      }
      return 1;

    } else if (action.type === 'full_reorganize') {
      if (frameDoc && frameDoc.body) {
        if (isUndo) {
          if (action.styleEl && action.styleEl.parentNode) action.styleEl.remove();
          frameDoc.body.replaceChildren(...action.origNodes.map(n => n.cloneNode(true)));
          isReadabilityMode = false;
          if (btnReorganize) btnReorganize.classList.remove('is-active');
          if (readerControlsGroup) readerControlsGroup.style.display = 'none';
          showToast("Diseño web original restaurado.");
        } else {
          applyReaderAppearance(frameDoc);
          frameDoc.body.replaceChildren(...action.newNodes.map(n => n.cloneNode(true)));
          isReadabilityMode = true;
          if (btnReorganize) btnReorganize.classList.add('is-active');
          if (readerControlsGroup) readerControlsGroup.style.display = 'inline-flex';
          showToast("Modo lectura editorial rehecho.");
        }
        setTool(activeTool);
      }
      return 1;
    }

    return 1;
  }

  btnUndo.addEventListener('click', () => {
    commitActiveTextEdit();
    closeImagePopover();
    clearInspectorHover();

    if (undoStack.length === 0) {
      showToast("No hay acciones para deshacer.");
      return;
    }
    const action = undoStack.pop();
    const delta = applyHistoryAction(action, 'undo');
    redoStack.push(action);
    changesCount = Math.max(0, changesCount - delta);
    updateHistoryUI();
    scheduleLivePreviewSync(action.type === 'full_reorganize');
  });

  if (btnRedo) {
    btnRedo.addEventListener('click', () => {
      commitActiveTextEdit();
      closeImagePopover();
      clearInspectorHover();

      if (redoStack.length === 0) {
        showToast("No hay acciones para rehacer.");
        return;
      }
      const action = redoStack.pop();
      const delta = applyHistoryAction(action, 'redo');
      undoStack.push(action);
      changesCount += delta;
      updateHistoryUI();
      scheduleLivePreviewSync(action.type === 'full_reorganize');
    });
  }

  btnReset.addEventListener('click', () => {
    commitActiveTextEdit();
    closeImagePopover();
    clearInspectorHover();

    if (confirm("¿Deseas restablecer todos los cambios al diseño original del clon?")) {
      renderClone(cloneData);
      changesCount = 0;
      undoStack.length = 0;
      redoStack.length = 0;
      updateHistoryUI();
      scheduleLivePreviewSync(true);
      showToast("Página restablecida al clon original intacto.");
    }
  });

  function handleGlobalShortcuts(e, fromIframe = false) {
    if (e.key === 'Escape') {
      if (activeEditingEl) {
        e.preventDefault();
        commitActiveTextEdit();
        return;
      }
      if (activeImageEl) {
        e.preventDefault();
        closeImagePopover();
        return;
      }
      if (exportDropdownWrap && exportDropdownWrap.classList.contains('is-open')) {
        exportDropdownWrap.classList.remove('is-open');
        if (btnExportMenu) btnExportMenu.setAttribute('aria-expanded', 'false');
      }
      return;
    }

    // Subir/bajar bloque en el inspector con Flechas ↑ / ↓
    if ((activeTool === 'delete' || activeTool === 'redact') && hoveredInspectorEl && !activeEditingEl) {
      const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
      if (e.key === 'ArrowUp' && hoveredInspectorEl.parentElement && hoveredInspectorEl.parentElement !== frameDoc.body) {
        e.preventDefault();
        setInspectorHover(hoveredInspectorEl.parentElement);
        return;
      }
      if (e.key === 'ArrowDown' && hoveredInspectorEl.firstElementChild) {
        e.preventDefault();
        setInspectorHover(hoveredInspectorEl.firstElementChild);
        return;
      }
    }

    // No interceptar Ctrl+Z mientras se escribe activamente dentro de contentEditable o un input
    if (fromIframe && activeEditingEl) return;
    if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

    const key = (e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === 'z') {
      e.preventDefault();
      btnUndo.click();
    } else if ((e.ctrlKey || e.metaKey) && (key === 'y' || (e.shiftKey && key === 'z'))) {
      e.preventDefault();
      if (btnRedo) btnRedo.click();
    }
  }

  window.addEventListener('keydown', (e) => handleGlobalShortcuts(e, false));

  // Listeners de barra de herramientas, Inspector, Formato de Texto, Imagen, Lectura, Zoom y Modos de Exportación
  toolEditBtn.addEventListener('click', () => setTool('edit'));
  toolDeleteBtn.addEventListener('click', () => setTool('delete'));
  toolRedactBtn.addEventListener('click', () => setTool('redact'));
  if (toolCursorBtn) toolCursorBtn.addEventListener('click', () => setTool('cursor'));

  if (btnSelectParent) {
    btnSelectParent.addEventListener('click', () => {
      const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
      if (hoveredInspectorEl && hoveredInspectorEl.parentElement && hoveredInspectorEl.parentElement !== frameDoc.body) {
        setInspectorHover(hoveredInspectorEl.parentElement);
      }
    });
  }

  // Selector de estilo de censura (Barra / Blur / ••••)
  if (redactStyleGroup) {
    redactStyleGroup.querySelectorAll('[data-redact-style]').forEach(btn => {
      btn.addEventListener('click', () => {
        redactStyle = btn.getAttribute('data-redact-style') || 'solid';
        redactStyleGroup.querySelectorAll('[data-redact-style]').forEach(b => b.classList.toggle('is-active', b === btn));
      });
    });
  }

  // Controles de apariencia de Readability (Tema Claro/Sepia/Oscuro + Fuente A-/A+)
  if (readerControlsGroup) {
    readerControlsGroup.querySelectorAll('[data-reader-theme]').forEach(btn => {
      btn.addEventListener('click', () => {
        readerTheme = btn.getAttribute('data-reader-theme') || 'light';
        readerControlsGroup.querySelectorAll('[data-reader-theme]').forEach(b => b.classList.toggle('is-active', b === btn));
        const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
        if (frameDoc && isReadabilityMode) applyReaderAppearance(frameDoc);
      });
    });
  }
  if (btnReaderFontDown) {
    btnReaderFontDown.addEventListener('click', () => {
      readerFontSize = Math.max(14, readerFontSize - 2);
      const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
      if (frameDoc && isReadabilityMode) applyReaderAppearance(frameDoc);
    });
  }
  if (btnReaderFontUp) {
    btnReaderFontUp.addEventListener('click', () => {
      readerFontSize = Math.min(26, readerFontSize + 2);
      const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
      if (frameDoc && isReadabilityMode) applyReaderAppearance(frameDoc);
    });
  }

  // Barra flotante de formato de texto
  if (textFormatBar) {
    textFormatBar.querySelectorAll('[data-fmt-cmd]').forEach(btn => {
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => {
        const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
        const cmd = btn.getAttribute('data-fmt-cmd');
        if (frameDoc && activeEditingEl && cmd) {
          frameDoc.execCommand(cmd, false, null);
        }
      });
    });

    textFormatBar.querySelectorAll('[data-fmt-size]').forEach(btn => {
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => {
        if (!activeEditingEl) return;
        const win = cloneFrame.contentWindow || window;
        const delta = parseInt(btn.getAttribute('data-fmt-size'), 10) || 0;
        const current = parseFloat(win.getComputedStyle(activeEditingEl).fontSize) || 16;
        activeEditingEl.style.fontSize = `${Math.max(10, Math.min(72, Math.round(current + delta)))}px`;
      });
    });

    textFormatBar.querySelectorAll('[data-fmt-color]').forEach(btn => {
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => {
        if (!activeEditingEl) return;
        const color = btn.getAttribute('data-fmt-color');
        const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
        const sel = frameDoc.getSelection ? frameDoc.getSelection() : null;
        if (sel && !sel.isCollapsed && frameDoc.execCommand) {
          frameDoc.execCommand('foreColor', false, color);
        } else {
          activeEditingEl.style.color = color;
        }
      });
    });
  }
  if (btnFinishTextEdit) {
    btnFinishTextEdit.addEventListener('click', () => commitActiveTextEdit());
  }

  // Popover de Edición de Imagen
  if (btnCloseImgPopover) btnCloseImgPopover.addEventListener('click', closeImagePopover);

  if (btnApplyImgSrc) {
    btnApplyImgSrc.addEventListener('click', () => {
      if (!activeImageEl || !imgSrcInput) return;
      const newUrl = imgSrcInput.value.trim();
      if (!newUrl) return;
      const oldSrc = activeImageEl.getAttribute('src');
      const oldWidth = activeImageEl.style.width || '';
      activeImageEl.removeAttribute('srcset');
      activeImageEl.setAttribute('src', newUrl);
      pushHistoryAction({
        type: 'image_edit',
        element: activeImageEl,
        oldSrc,
        newSrc: newUrl,
        oldWidth,
        newWidth: oldWidth
      }, 1);
      closeImagePopover();
      showToast("Imagen actualizada");
    });
  }

  if (btnUploadLocalImg && localImgFileInput) {
    btnUploadLocalImg.addEventListener('click', () => localImgFileInput.click());
    localImgFileInput.addEventListener('change', () => {
      const file = localImgFileInput.files && localImgFileInput.files[0];
      if (!file || !activeImageEl) return;
      const targetImg = activeImageEl;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string' && reader.result.startsWith('data:image/')) {
          const oldSrc = targetImg.getAttribute('src');
          const oldWidth = targetImg.style.width || '';
          targetImg.removeAttribute('srcset');
          targetImg.setAttribute('src', reader.result);
          pushHistoryAction({
            type: 'image_edit',
            element: targetImg,
            oldSrc,
            newSrc: reader.result,
            oldWidth,
            newWidth: oldWidth
          }, 1);
          closeImagePopover();
          showToast("Imagen local incrustada");
        }
      };
      reader.readAsDataURL(file);
      localImgFileInput.value = '';
    });
  }

  if (imageEditPopover) {
    imageEditPopover.querySelectorAll('[data-img-width]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!activeImageEl) return;
        const w = btn.getAttribute('data-img-width');
        const oldSrc = activeImageEl.getAttribute('src');
        const oldWidth = activeImageEl.style.width || '';
        const newWidth = w === 'auto' ? '' : w;
        activeImageEl.style.width = newWidth;
        activeImageEl.style.height = 'auto';
        pushHistoryAction({
          type: 'image_edit',
          element: activeImageEl,
          oldSrc,
          newSrc: oldSrc,
          oldWidth,
          newWidth
        }, 1);
        showToast(`Tamaño de imagen ajustado (${w})`);
      });
    });
  }

  if (btnRedactImg) {
    btnRedactImg.addEventListener('click', () => {
      if (!activeImageEl) return;
      const target = activeImageEl;
      closeImagePopover();
      const rec = applyElementRedaction(target, redactStyle);
      if (rec) {
        pushHistoryAction({ type: 'redact', record: rec }, 1);
        showToast("Imagen censurada");
      }
    });
  }

  if (btnDeleteImg) {
    btnDeleteImg.addEventListener('click', () => {
      if (!activeImageEl || !activeImageEl.parentNode) return;
      const target = activeImageEl;
      const parent = target.parentNode;
      const nextSibling = target.nextSibling;
      const delMeta = {
        kind: 'delete',
        badge: 'BORRADO',
        target: describeElementShort(target),
        snippet: extractElementSnippet(target),
        ...captureElementDocGeometry(target)
      };
      closeImagePopover();
      target.remove();
      pushHistoryAction({ type: 'delete', element: target, parent, nextSibling, meta: delMeta }, 1);
      showToast("Imagen eliminada");
    });
  }

  // Controles de Vista (Ancho Web/A4/Móvil + Zoom)
  function applyWorkspaceTransform() {
    if (!workspaceViewportWrap) return;
    workspaceViewportWrap.style.width = viewportPreset;
    workspaceViewportWrap.classList.toggle('is-framed', viewportPreset !== '100%');
    workspaceViewportWrap.style.transform = zoomLevel === 1 ? 'none' : `scale(${zoomLevel})`;
    if (btnZoomReset) btnZoomReset.textContent = `${Math.round(zoomLevel * 100)}%`;
  }

  document.querySelectorAll('[data-viewport]').forEach(btn => {
    btn.addEventListener('click', () => {
      viewportPreset = btn.getAttribute('data-viewport') || '100%';
      document.querySelectorAll('[data-viewport]').forEach(b => b.classList.toggle('is-active', b === btn));
      applyWorkspaceTransform();
      setTimeout(() => scheduleLivePreviewSync(false), 260);
    });
  });

  if (btnZoomOut) {
    btnZoomOut.addEventListener('click', () => {
      zoomLevel = Math.max(0.5, Math.round((zoomLevel - 0.1) * 10) / 10);
      applyWorkspaceTransform();
    });
  }
  if (btnZoomIn) {
    btnZoomIn.addEventListener('click', () => {
      zoomLevel = Math.min(1.5, Math.round((zoomLevel + 0.1) * 10) / 10);
      applyWorkspaceTransform();
    });
  }
  if (btnZoomReset) {
    btnZoomReset.addEventListener('click', () => {
      zoomLevel = 1;
      applyWorkspaceTransform();
    });
  }

  // Selectores de modo en menú de descarga
  if (pdfPageModeGroup) {
    pdfPageModeGroup.querySelectorAll('[data-pdf-mode]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        pdfPageMode = btn.getAttribute('data-pdf-mode') || 'continuous';
        pdfPageModeGroup.querySelectorAll('[data-pdf-mode]').forEach(b => b.classList.toggle('is-active', b === btn));
      });
    });
  }
  if (docxExportModeGroup) {
    docxExportModeGroup.querySelectorAll('[data-docx-mode]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        docxExportMode = btn.getAttribute('data-docx-mode') || 'hybrid';
        docxExportModeGroup.querySelectorAll('[data-docx-mode]').forEach(b => b.classList.toggle('is-active', b === btn));
      });
    });
  }

  // --------------------------------------------------------------------------
  // Menú Flotante Minimalista de Exportación
  // --------------------------------------------------------------------------
  if (btnExportMenu && exportDropdownWrap) {
    btnExportMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = exportDropdownWrap.classList.toggle('is-open');
      btnExportMenu.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    document.addEventListener('click', (e) => {
      if (!exportDropdownWrap.contains(e.target)) {
        exportDropdownWrap.classList.remove('is-open');
        btnExportMenu.setAttribute('aria-expanded', 'false');
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && exportDropdownWrap.classList.contains('is-open')) {
        exportDropdownWrap.classList.remove('is-open');
        btnExportMenu.setAttribute('aria-expanded', 'false');
      }
    });

    [btnEditorPdf, btnEditorDocx, btnEditorPng, btnEditorHtml].forEach(btn => {
      if (btn) {
        btn.addEventListener('click', () => {
          exportDropdownWrap.classList.remove('is-open');
          btnExportMenu.setAttribute('aria-expanded', 'false');
        });
      }
    });
  }

  // --------------------------------------------------------  // --------------------------------------------------------------------------
  // --------------------------------------------------------------------------
  // 6. Captura, Inliner, OpenXML y Exportadores delegados a editor/editor-exports.js y shared/*
  // --------------------------------------------------------------------------

  function showExportModal(title, status, pct) {
    exportModalTitle.textContent = title;
    exportModalStatus.textContent = status;
    exportProgressBar.style.width = `${pct}%`;
    exportModal.style.display = 'flex';
  }

  function hideExportModal() {
    exportModal.style.display = 'none';
  }

  function showToast(msg, isError = false) {
    toastNotification.classList.toggle('is-error', Boolean(isError));
    if (msg && msg.includes('(') && msg.endsWith(')')) {
      const match = msg.match(/^(.*?)\s*\((.*?)\)$/);
      if (match) {
        toastMessage.textContent = '';
        const msgSpan = document.createElement('span');
        msgSpan.style.fontWeight = '600';
        msgSpan.textContent = match[1];
        const fileSpan = document.createElement('span');
        fileSpan.style.display = 'inline-block';
        fileSpan.style.marginLeft = '6px';
        fileSpan.style.opacity = '0.85';
        fileSpan.style.fontSize = '11px';
        fileSpan.style.background = 'rgba(255,255,255,0.08)';
        fileSpan.style.padding = '1px 6px';
        fileSpan.style.borderRadius = '4px';
        fileSpan.style.fontFamily = 'ui-monospace, monospace';
        fileSpan.textContent = match[2];
        toastMessage.appendChild(msgSpan);
        toastMessage.appendChild(fileSpan);
      } else {
        toastMessage.textContent = msg;
      }
    } else {
      toastMessage.textContent = msg;
    }
    const toastIcon = toastNotification.querySelector('.toast-icon');
    if (toastIcon) {
      toastIcon.textContent = isError ? '✕' : '✓';
    }
    if (isError) {
      toastNotification.style.borderColor = 'rgba(239, 68, 68, 0.6)';
      toastNotification.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 0 15px rgba(239, 68, 68, 0.3)';
    } else {
      toastNotification.style.borderColor = 'rgba(56, 189, 248, 0.4)';
      toastNotification.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 0 15px rgba(56, 189, 248, 0.2)';
    }
    toastNotification.style.display = 'flex';
    clearTimeout(toastNotification._timer);
    toastNotification._timer = setTimeout(() => {
      toastNotification.style.display = 'none';
    }, isError ? 4500 : 2800);
  }
});
