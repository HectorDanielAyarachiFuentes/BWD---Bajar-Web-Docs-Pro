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

  // Referencias del Panel Izquierdo de Previsualización y Mapa de Cambios en Vivo
  const livePreviewSidebar = document.getElementById('livePreviewSidebar');
  const btnToggleLiveSidebar = document.getElementById('btnToggleLiveSidebar');
  const btnCollapseSidebar = document.getElementById('btnCollapseSidebar');
  const btnToggleGhostBoxes = document.getElementById('btnToggleGhostBoxes');
  const minimapHeightBadge = document.getElementById('minimapHeightBadge');
  const minimapContainer = document.getElementById('minimapContainer');
  const minimapStage = document.getElementById('minimapStage');
  const livePreviewFrame = document.getElementById('livePreviewFrame');
  const minimapMarkersLayer = document.getElementById('minimapMarkersLayer');
  const minimapLens = document.getElementById('minimapLens');
  const changesFeedStats = document.getElementById('changesFeedStats');
  const liveChangesFeed = document.getElementById('liveChangesFeed');

  let showGhostBoxes = true;
  let minimapScale = 0.18;
  let previewSyncTimer = null;
  let previewFrameReady = false;
  let isDraggingMinimap = false;

  function describeElementShort(el) {
    if (!el || !el.tagName) return 'bloque';
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id.slice(0, 18)}` : '';
    const cls = (!id && typeof el.className === 'string' && el.className.trim())
      ? '.' + el.className.trim().split(/\s+/).filter(c => !c.startsWith('bwd-')).slice(0, 2).join('.')
      : '';
    return `${tag}${id || cls}`.slice(0, 32);
  }

  function extractElementSnippet(el) {
    if (!el) return '';
    if (el.tagName === 'IMG') {
      const alt = (el.getAttribute('alt') || '').trim();
      return alt ? `🖼️ "${alt.slice(0, 42)}"` : '🖼️ Imagen / Fotografía';
    }
    const rawText = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (rawText) {
      return `"${rawText.slice(0, 52)}${rawText.length > 52 ? '…' : ''}"`;
    }
    const innerImg = el.querySelector && el.querySelector('img');
    if (innerImg) return '🖼️ Contenedor multimedia / foto';
    return 'Bloque visual de maquetación';
  }

  function captureElementDocGeometry(el) {
    if (!el || !el.getBoundingClientRect) return { docX: 0, docY: 0, docW: 200, docH: 40 };
    const win = cloneFrame.contentWindow || window;
    const sX = win.scrollX || win.pageXOffset || 0;
    const sY = win.scrollY || win.pageYOffset || 0;
    const r = el.getBoundingClientRect();
    return {
      docX: Math.max(0, Math.round(r.left + sX)),
      docY: Math.max(0, Math.round(r.top + sY)),
      docW: Math.max(24, Math.round(r.width || 120)),
      docH: Math.max(16, Math.round(r.height || 32))
    };
  }

  function ensureActionMeta(action) {
    if (!action || action.meta) return;
    if (action.type === 'text' && action.element) {
      const geo = captureElementDocGeometry(action.element);
      const tmp = document.createElement('div');
      tmp.innerHTML = action.newHtml || '';
      const txt = (tmp.textContent || '').replace(/\s+/g, ' ').trim();
      action.meta = {
        kind: 'edit',
        badge: 'EDITADO',
        target: describeElementShort(action.element),
        snippet: txt ? `✏️ "${txt.slice(0, 48)}${txt.length > 48 ? '…' : ''}"` : 'Texto modificado',
        ...geo
      };
    } else if (action.type === 'image_edit' && action.element) {
      const geo = captureElementDocGeometry(action.element);
      action.meta = {
        kind: 'edit',
        badge: 'IMAGEN',
        target: describeElementShort(action.element),
        snippet: '🖼️ Imagen reemplazada o ajustada',
        ...geo
      };
    } else if (action.type === 'redact' && action.record && action.record.element) {
      const el = action.record.element;
      const geo = captureElementDocGeometry(el);
      action.meta = {
        kind: 'redact',
        badge: 'CENSURA',
        target: describeElementShort(el),
        snippet: action.record.isImage ? '🔒 Imagen / avatar censurado' : '🔒 Dato confidencial oculto',
        ...geo
      };
    } else if (action.type === 'batch_redact') {
      const total = (action.records ? action.records.length : 0) + (action.wrappedSpans ? action.wrappedSpans.length : 0);
      const firstEl = (action.records && action.records[0] && action.records[0].element) || (action.wrappedSpans && action.wrappedSpans[0]);
      const geo = firstEl ? captureElementDocGeometry(firstEl) : { docX: 0, docY: 80, docW: 300, docH: 40 };
      action.meta = {
        kind: 'redact',
        badge: 'AUTO-CENSURA',
        target: `${total} datos`,
        snippet: `🔒 ${total} emails, montos o perfiles protegidos`,
        ...geo
      };
    } else if (action.type === 'batch_delete') {
      const count = action.items ? action.items.length : 1;
      const firstGeo = (action.ghostRects && action.ghostRects[0]) || { docX: 0, docY: 0, docW: 400, docH: 80 };
      action.meta = {
        kind: 'clean',
        badge: 'LIMPIEZA',
        target: `${count} bloques`,
        snippet: `✨ ${count} anuncios, banners o barras quitados`,
        ...firstGeo
      };
    } else if (action.type === 'full_reorganize') {
      action.meta = {
        kind: 'clean',
        badge: 'LECTURA',
        target: 'article',
        snippet: '📖 Reacomodado editorial Readability',
        docX: 0, docY: 0, docW: 800, docH: 120
      };
    }
  }

  function syncMinimapLens() {
    if (!livePreviewSidebar || livePreviewSidebar.classList.contains('is-collapsed')) return;
    const frameDoc = cloneFrame.contentDocument || (cloneFrame.contentWindow && cloneFrame.contentWindow.document);
    const win = cloneFrame.contentWindow;
    if (!frameDoc || !frameDoc.body || !win || !minimapLens || !minimapStage) return;

    const docH = Math.max(
      frameDoc.body.scrollHeight || 0,
      frameDoc.documentElement ? frameDoc.documentElement.scrollHeight : 0,
      win.innerHeight || 600
    );
    const stageH = Math.max(160, Math.round(docH * minimapScale));
    const scrollY = Math.max(0, win.scrollY || win.pageYOffset || 0);
    const viewH = win.innerHeight || 600;

    const lensTop = Math.min(stageH - 14, Math.max(0, Math.round(scrollY * minimapScale)));
    const lensH = Math.max(18, Math.min(stageH - lensTop, Math.round(viewH * minimapScale)));

    minimapLens.style.top = `${lensTop}px`;
    minimapLens.style.height = `${lensH}px`;

    // Mantener la lente visible dentro del contenedor del minimapa al scrollear un diario largo
    if (minimapContainer && !isDraggingMinimap) {
      const cScroll = minimapContainer.scrollTop;
      const cHeight = minimapContainer.clientHeight;
      if (lensTop < cScroll + 12) {
        minimapContainer.scrollTop = Math.max(0, lensTop - 16);
      } else if (lensTop + lensH > cScroll + cHeight - 12) {
        minimapContainer.scrollTop = Math.max(0, lensTop + lensH - cHeight + 16);
      }
    }
  }

  function renderLiveChangesFeedAndMarkers() {
    if (!minimapMarkersLayer || !liveChangesFeed) return;
    minimapMarkersLayer.textContent = '';

    let delCount = 0, editCount = 0, redCount = 0;

    undoStack.forEach((act, idx) => {
      ensureActionMeta(act);
      const m = act.meta || {};
      if (act.type === 'delete') delCount++;
      else if (act.type === 'batch_delete') delCount += (act.items ? act.items.length : 1);
      else if (act.type === 'text' || act.type === 'image_edit') editCount++;
      else if (act.type === 'redact') redCount++;
      else if (act.type === 'batch_redact') redCount += ((act.records ? act.records.length : 0) + (act.wrappedSpans ? act.wrappedSpans.length : 0));

      // Dibujar cajas fantasma de elementos borrados sobre el mapa
      if (showGhostBoxes && act.type === 'delete' && m.docH) {
        const ghost = document.createElement('div');
        ghost.className = 'minimap-ghost-box';
        ghost.dataset.actionIdx = String(idx);
        ghost.style.left = `${Math.max(0, Math.round((m.docX || 0) * minimapScale))}px`;
        ghost.style.top = `${Math.max(0, Math.round((m.docY || 0) * minimapScale))}px`;
        ghost.style.width = `${Math.max(16, Math.min(234, Math.round((m.docW || 160) * minimapScale)))}px`;
        ghost.style.height = `${Math.max(6, Math.round((m.docH || 30) * minimapScale))}px`;
        minimapMarkersLayer.appendChild(ghost);
      } else if (showGhostBoxes && act.type === 'batch_delete' && Array.isArray(act.ghostRects)) {
        act.ghostRects.slice(0, 24).forEach(gr => {
          const ghost = document.createElement('div');
          ghost.className = 'minimap-ghost-box';
          ghost.dataset.actionIdx = String(idx);
          ghost.style.left = `${Math.max(0, Math.round(gr.docX * minimapScale))}px`;
          ghost.style.top = `${Math.max(0, Math.round(gr.docY * minimapScale))}px`;
          ghost.style.width = `${Math.max(14, Math.min(234, Math.round(gr.docW * minimapScale)))}px`;
          ghost.style.height = `${Math.max(5, Math.round(gr.docH * minimapScale))}px`;
          minimapMarkersLayer.appendChild(ghost);
        });
      } else if (m.kind === 'edit' || m.kind === 'redact') {
        const pin = document.createElement('div');
        pin.className = `minimap-pin ${m.kind === 'redact' ? 'pin-redact' : 'pin-edit'}`;
        pin.style.top = `${Math.max(0, Math.round((m.docY || 0) * minimapScale))}px`;
        minimapMarkersLayer.appendChild(pin);
      }
    });

    if (changesFeedStats) {
      const parts = [];
      if (delCount > 0) parts.push(`🗑️ ${delCount}`);
      if (editCount > 0) parts.push(`✏️ ${editCount}`);
      if (redCount > 0) parts.push(`🔒 ${redCount}`);
      changesFeedStats.textContent = parts.length > 0 ? parts.join(' · ') : 'Intacto';
    }

    liveChangesFeed.textContent = '';
    if (undoStack.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'changes-empty-state';
      emptyLi.textContent = 'Borra anuncios, edita titulares o censura datos: aquí verás cada cambio en tiempo real y podrás restaurar bloques sueltos con 1 clic.';
      liveChangesFeed.appendChild(emptyLi);
      return;
    }

    // Mostrar del más reciente al más antiguo con salto directo y botón de restauración individual
    for (let i = undoStack.length - 1; i >= 0; i--) {
      const act = undoStack[i];
      const m = act.meta || {};
      const li = document.createElement('li');
      li.className = 'change-feed-card';

      const mainDiv = document.createElement('div');
      mainDiv.className = 'change-card-main';

      const topRow = document.createElement('div');
      topRow.className = 'change-card-top';

      const pill = document.createElement('span');
      const kindClass = (act.type === 'delete') ? 'kind-delete'
        : (m.kind === 'redact') ? 'kind-redact'
          : (m.kind === 'clean') ? 'kind-clean' : 'kind-edit';
      pill.className = `change-kind-pill ${kindClass}`;
      pill.textContent = m.badge || 'CAMBIO';

      const tagSpan = document.createElement('span');
      tagSpan.className = 'change-target-tag';
      tagSpan.textContent = m.target || 'elemento';

      topRow.appendChild(pill);
      topRow.appendChild(tagSpan);

      const snippetSpan = document.createElement('div');
      snippetSpan.className = 'change-snippet';
      snippetSpan.textContent = m.snippet || '';

      mainDiv.appendChild(topRow);
      mainDiv.appendChild(snippetSpan);

      const restoreBtn = document.createElement('button');
      restoreBtn.type = 'button';
      restoreBtn.className = 'change-restore-btn';
      restoreBtn.textContent = '↺';
      restoreBtn.title = 'Restaurar únicamente este cambio sin perder los demás';
      restoreBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        restoreSingleActionAtIndex(i);
      });

      li.addEventListener('mouseenter', () => {
        minimapMarkersLayer.querySelectorAll(`[data-action-idx="${i}"]`).forEach(g => g.classList.add('is-highlighted'));
      });
      li.addEventListener('mouseleave', () => {
        minimapMarkersLayer.querySelectorAll(`[data-action-idx="${i}"]`).forEach(g => g.classList.remove('is-highlighted'));
      });
      li.addEventListener('click', () => {
        const win = cloneFrame.contentWindow;
        if (win && typeof m.docY === 'number') {
          win.scrollTo({ top: Math.max(0, m.docY - 120), behavior: 'smooth' });
        }
      });

      li.appendChild(mainDiv);
      li.appendChild(restoreBtn);
      liveChangesFeed.appendChild(li);
    }
  }

  function restoreSingleActionAtIndex(idx) {
    if (idx < 0 || idx >= undoStack.length) return;
    commitActiveTextEdit();
    closeImagePopover();
    clearInspectorHover();

    const [action] = undoStack.splice(idx, 1);
    const delta = applyHistoryAction(action, 'undo');
    redoStack.push(action);
    changesCount = Math.max(0, changesCount - delta);
    updateHistoryUI();
    scheduleLivePreviewSync(action.type === 'full_reorganize');
  }

  function syncLivePreview(fullRebuild = false) {
    if (!livePreviewFrame || !minimapStage || !livePreviewSidebar) return;
    if (livePreviewSidebar.classList.contains('is-collapsed')) return;

    const frameDoc = cloneFrame.contentDocument || (cloneFrame.contentWindow && cloneFrame.contentWindow.document);
    if (!frameDoc || !frameDoc.body || !frameDoc.documentElement) return;

    const prevDoc = livePreviewFrame.contentDocument || (livePreviewFrame.contentWindow && livePreviewFrame.contentWindow.document);
    if (!prevDoc) return;

    try {
      if (fullRebuild || !previewFrameReady || !prevDoc.body) {
        const clonedRoot = frameDoc.documentElement.cloneNode(true);
        const internalStyle = clonedRoot.querySelector('#bwd-editor-internal-css');
        if (internalStyle) internalStyle.remove();

        // Mantener solo el estilo limpio de censura dentro de la miniatura en vivo
        const previewCleanCss = document.createElement('style');
        previewCleanCss.textContent = `
          html, body { scrollbar-width: none !important; overflow: hidden !important; pointer-events: none !important; }
          *::-webkit-scrollbar { display: none !important; }
          .bwd-redacted-box { background-color: #0f172a !important; color: transparent !important; border-radius: 3px !important; }
          .bwd-redacted-box * { color: transparent !important; opacity: 0 !important; }
          .bwd-redacted-blur { filter: blur(8px) !important; }
          .bwd-redacted-mask { font-family: ui-monospace, monospace !important; }
        `;
        const head = clonedRoot.querySelector('head') || clonedRoot;
        head.appendChild(previewCleanCss);

        clonedRoot.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
        clonedRoot.querySelectorAll('[data-bwd-hovered]').forEach(el => el.removeAttribute('data-bwd-hovered'));
        const b = clonedRoot.querySelector('body');
        if (b) b.removeAttribute('data-bwd-tool');

        prevDoc.open();
        prevDoc.write('<!DOCTYPE html>\n' + clonedRoot.outerHTML);
        prevDoc.close();
        previewFrameReady = true;
      } else {
        // Actualización incremental instantánea (~2ms) de estilos dinámicos y cuerpo
        const readStyle = frameDoc.getElementById('bwd-readability-internal-styles');
        let prevReadStyle = prevDoc.getElementById('bwd-readability-internal-styles');
        if (readStyle) {
          if (!prevReadStyle) {
            prevReadStyle = prevDoc.createElement('style');
            prevReadStyle.id = 'bwd-readability-internal-styles';
            (prevDoc.head || prevDoc.documentElement).appendChild(prevReadStyle);
          }
          prevReadStyle.textContent = readStyle.textContent;
        } else if (prevReadStyle) {
          prevReadStyle.remove();
        }

        const cleanBody = frameDoc.body.cloneNode(true);
        cleanBody.removeAttribute('data-bwd-tool');
        cleanBody.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
        cleanBody.querySelectorAll('[data-bwd-hovered]').forEach(el => el.removeAttribute('data-bwd-hovered'));
        prevDoc.body.className = cleanBody.className;
        prevDoc.body.style.cssText = cleanBody.style.cssText;
        prevDoc.body.replaceChildren(...Array.from(cleanBody.childNodes));
      }

      const win = cloneFrame.contentWindow || window;
      const docW = Math.max(frameDoc.documentElement.clientWidth || win.innerWidth || 1200, 360);
      const docH = Math.max(
        frameDoc.body.scrollHeight || 0,
        frameDoc.documentElement.scrollHeight || 0,
        win.innerHeight || 600
      );

      const stageW = 236;
      minimapScale = stageW / docW;
      const scaledH = Math.max(160, Math.round(docH * minimapScale));

      minimapStage.style.height = `${scaledH}px`;
      livePreviewFrame.style.width = `${docW}px`;
      livePreviewFrame.style.height = `${docH}px`;
      livePreviewFrame.style.transform = `scale(${minimapScale})`;

      if (minimapHeightBadge) {
        minimapHeightBadge.textContent = `${Math.round(docH).toLocaleString()} px`;
      }

      syncMinimapLens();
      renderLiveChangesFeedAndMarkers();
    } catch (e) {
      console.debug("Aviso en syncLivePreview:", e);
    }
  }

  function scheduleLivePreviewSync(fullRebuild = false) {
    if (previewSyncTimer) clearTimeout(previewSyncTimer);
    previewSyncTimer = setTimeout(() => {
      syncLivePreview(fullRebuild);
    }, fullRebuild ? 40 : 90);
  }

  // Navegación interactiva (clic o arrastre) sobre el minimapa para diarios largos
  function jumpFromMinimapEvent(e) {
    if (!minimapStage) return;
    const win = cloneFrame.contentWindow;
    if (!win) return;
    const rect = minimapStage.getBoundingClientRect();
    const clickY = Math.max(0, e.clientY - rect.top);
    const targetDocY = (clickY / Math.max(0.02, minimapScale)) - ((win.innerHeight || 600) / 2);
    win.scrollTo({ top: Math.max(0, Math.round(targetDocY)), behavior: 'instant' });
    syncMinimapLens();
  }

  if (minimapStage) {
    minimapStage.addEventListener('mousedown', (e) => {
      isDraggingMinimap = true;
      jumpFromMinimapEvent(e);
    });
    window.addEventListener('mousemove', (e) => {
      if (isDraggingMinimap) jumpFromMinimapEvent(e);
    });
    window.addEventListener('mouseup', () => {
      isDraggingMinimap = false;
    });
  }

  function toggleLiveSidebar(forceState) {
    if (!livePreviewSidebar) return;
    const willCollapse = typeof forceState === 'boolean' ? !forceState : !livePreviewSidebar.classList.contains('is-collapsed');
    livePreviewSidebar.classList.toggle('is-collapsed', willCollapse);
    if (btnToggleLiveSidebar) btnToggleLiveSidebar.classList.toggle('is-active', !willCollapse);
    if (!willCollapse) scheduleLivePreviewSync(true);
  }

  if (btnToggleLiveSidebar) btnToggleLiveSidebar.addEventListener('click', () => toggleLiveSidebar());
  if (btnCollapseSidebar) btnCollapseSidebar.addEventListener('click', () => toggleLiveSidebar(false));

  if (btnToggleGhostBoxes) {
    btnToggleGhostBoxes.addEventListener('click', () => {
      showGhostBoxes = !showGhostBoxes;
      btnToggleGhostBoxes.classList.toggle('is-active', showGhostBoxes);
      renderLiveChangesFeedAndMarkers();
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pickBestSrcsetUrl(srcsetStr) {
    if (!srcsetStr || typeof srcsetStr !== 'string') return '';
    const regex = /(\S+)(?:\s+(\d+(?:\.\d+)?)([wx]))?(?:\s*,\s*|$)/g;
    let bestUrl = '';
    let bestScore = -1;
    let match;
    while ((match = regex.exec(srcsetStr.trim())) !== null) {
      if (!match[1]) break;
      const url = match[1].replace(/,+$/, '');
      if (!url || url.includes('data:image/svg') || url.includes('placeholder')) continue;
      const val = match[2] ? parseFloat(match[2]) : 1;
      const unit = match[3] || 'x';
      const score = unit === 'w' ? val : val * 1000;
      if (score >= bestScore) {
        bestScore = score;
        bestUrl = url;
      }
    }
    return bestUrl;
  }

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

    previewFrameReady = false;
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
  // 4. Auto-Limpieza Inteligente y Auto-Censura de Perfil
  // --------------------------------------------------------------------------
  function cleanPageDom(frameDoc) {
    if (!frameDoc || !frameDoc.body) return 0;

    commitActiveTextEdit();
    clearInspectorHover();

    const adAndClutterSelectors = [
      // A. Publicidades internacionales y redes de anuncios verificadas
      'ins.adsbygoogle',
      'iframe[id*="google_ads"]',
      'iframe[src*="doubleclick"]',
      'iframe[src*="adnxs"]',
      'iframe[src*="adsystem"]',
      'iframe[src*="google.com/swg"]',
      'iframe[src*="serviceiframe"]',
      'iframe[id*="serviceiframe"]',
      'div[id*="google_ads"]',
      'div[id*="div-gpt-ad"]',
      'div[id*="ad-container"]',
      'div[class*="ad-container"]',
      'div[class*="advertisement"]',
      'div[class*="ad-box"]',
      'div[class*="ad-wrapper"]',
      'div[class*="ad-slot"]',
      'div[class*="ads-area"]',
      'div[class*="banner-ad"]',
      'div[class*="dfp-ad"]',
      'div[class*="taboola"]',
      'div[id*="taboola"]',
      'div[class*="outbrain"]',
      'div[id*="outbrain"]',
      'div[class*="teads"]',
      'div[id*="teads"]',
      '[data-ad-slot]',
      '[data-ad-unit]',
      '[data-ad-name]',
      '[data-ad-type]',
      '[data-google-query-id]',
      '.ln-placeholder',
      '[class*="placeholder-ad"]',

      // B. Prensa en español (sin falsos positivos de subcadenas como "temas" -> "sistemas" o "live" -> "delivery")
      '[class*="caja-comercial"]',
      '[class*="banner-comercial"]',
      '[class*="comercial-"]',
      '[class*="--comercial"]',
      '[class*="publicidad"]',
      '[id*="publicidad"]',
      '[class*="patrocinado"]',
      '[id*="patrocinado"]',
      '[class*="modulo-ad"]',
      '[class*="item-comercial"]',
      '[class*="LN10_"]',
      '[id*="LN10_"]',
      '[class*="publi-box"]',
      '[class*="modulo-publicidad"]',
      '[class*="banner-publicidad"]',
      '[class*="modulo-banners"]',
      '[class*="banner-top"]',
      '[class*="banner-middle"]',
      '[class*="banner-bottom"]',
      '[class*="banner-sidebar"]',
      '[class*="te-puede-interesar"]',
      '[class*="mas-leidas"]',
      '[class*="mas-vistas"]',
      '[class*="articulos-relacionados"]',
      '[class*="bloque-relacionadas"]',
      '[aria-label*="publicidad" i]',
      '[aria-label*="anuncio" i]',

      // C. Banners de Cookies, GDPR y Consentimiento
      '#onetrust-consent-sdk',
      '#onetrust-banner-sdk',
      '#cookie-banner',
      '.cookie-banner',
      '.cookie-notice',
      '.cookie-law-info-bar',
      '[class*="cookie-consent"]',
      '[id*="cookie-consent"]',
      '[class*="cookie-modal"]',
      '[aria-label*="cookie" i]',
      '.modal-backdrop',

      // D. Popups de Suscripción, Newsletter y Paywalls
      '.swg-dialog',
      '[class*="swg-"]',
      '[id*="swg-"]',
      '[class*="newsletter-modal"]',
      '[class*="subscription-modal"]',
      '[class*="newsletter-popup"]',
      '[class*="popup-subscribe"]',
      '[class*="paywall-banner"]',
      '[class*="paywall"]',
      '[class*="suscripcion-banner"]',
      '[class*="banner-suscripcion"]',
      '[class*="hacete-socio"]',
      '[class*="btn-socio"]',
      '#disqus_thread',
      '[class*="facebook-comments"]',
      '[class*="social-share-fixed"]',
      '[class*="sticky-share"]',
      '[class*="share-bar-fixed"]',
      '[class*="barra-compartir"]',
      '[class*="floating-player"]',
      '[class*="flying-ad"]',
      '[class*="banner-flotante"]'
    ];

    const protectedTags = new Set([
      'HTML', 'HEAD', 'BODY', 'MAIN', 'ARTICLE', 'H1', 'H2', 'H3'
    ]);

    const itemsToRemove = [];
    const seen = new Set();

    adAndClutterSelectors.forEach(sel => {
      try {
        frameDoc.querySelectorAll(sel).forEach(el => {
          if (seen.has(el) || protectedTags.has(el.tagName)) return;

          // Proteger bloques con contenido editorial real o imágenes legítimas del artículo
          const textLen = el.innerText ? el.innerText.trim().length : 0;
          const pCount = el.querySelectorAll('p').length;
          if ((pCount >= 3 && textLen > 450) || el.querySelector('article, main, h1')) {
            return;
          }

          let ancestorIsRemoved = false;
          let p = el.parentElement;
          while (p && p !== frameDoc.body) {
            if (seen.has(p)) {
              ancestorIsRemoved = true;
              break;
            }
            p = p.parentElement;
          }
          if (ancestorIsRemoved) return;

          seen.add(el);
          itemsToRemove.push(el);
        });
      } catch (_) { }
    });

    // Sidebars secundarias fuera del artículo principal (respetando callouts <aside> dentro de documentación)
    try {
      frameDoc.querySelectorAll('aside, [role="complementary"]').forEach(el => {
        if (seen.has(el)) return;
        if (el.closest('article') && (el.innerText || '').trim().length < 600 && !el.querySelector('[class*="ad"], [class*="publi"], [class*="relac"]')) {
          return;
        }
        const pCount = el.querySelectorAll('p').length;
        if (pCount > 5) return;
        seen.add(el);
        itemsToRemove.push(el);
      });
    } catch (_) { }

    // Barras flotantes/fijas invasivas al pie o sobre el contenido
    const win = cloneFrame.contentWindow || window;
    try {
      frameDoc.querySelectorAll('div, section, footer, aside').forEach(el => {
        if (seen.has(el) || protectedTags.has(el.tagName)) return;
        try {
          const style = win.getComputedStyle(el);
          if (style.position === 'fixed') {
            const rect = el.getBoundingClientRect();
            if (rect.bottom >= (win.innerHeight - 90) && rect.height > 0 && rect.height < 320) {
              const textLen = el.innerText ? el.innerText.trim().length : 0;
              if (textLen < 350) {
                seen.add(el);
                itemsToRemove.push(el);
              }
            }
          }
        } catch (_) { }
      });
    } catch (_) { }

    // Detección de cabeceras duplicadas usando coordenadas absolutas del documento (independiente del scroll)
    try {
      const scrollY = win.scrollY || win.pageYOffset || 0;
      const headerCandidates = Array.from(frameDoc.querySelectorAll('header, nav, [class*="header"], [id*="header"]'));
      const navBars = headerCandidates.filter(el => {
        if (!el || seen.has(el)) return false;
        const rect = el.getBoundingClientRect();
        const docTop = rect.top + scrollY;
        return docTop <= 280 && rect.height > 24 && rect.height < 260;
      });

      if (navBars.length > 1) {
        for (let i = 0; i < navBars.length; i++) {
          for (let j = i + 1; j < navBars.length; j++) {
            const barA = navBars[i];
            const barB = navBars[j];
            if (barA.contains(barB) || barB.contains(barA)) continue;

            const linksA = Array.from(barA.querySelectorAll('a')).map(a => a.href || a.textContent.trim()).filter(Boolean);
            const linksB = Array.from(barB.querySelectorAll('a')).map(a => a.href || a.textContent.trim()).filter(Boolean);

            if (linksA.length >= 2 && linksB.length >= 2) {
              const common = linksA.filter(l => linksB.includes(l));
              const overlap = common.length / Math.min(linksA.length, linksB.length);
              if (overlap >= 0.5) {
                // Conservar el <header> principal con h1/logo más grande y suprimir la copia secundaria/sticky
                const aHasMainBrand = barA.tagName === 'HEADER' || Boolean(barA.querySelector('h1'));
                const bHasMainBrand = barB.tagName === 'HEADER' || Boolean(barB.querySelector('h1'));
                const targetToRemove = (!aHasMainBrand && bHasMainBrand) ? barA : barB;
                if (!seen.has(targetToRemove)) {
                  seen.add(targetToRemove);
                  itemsToRemove.push(targetToRemove);
                }
              }
            }
          }
        }
      }
    } catch (_) { }

    const batchItems = [];
    const styleFixes = [];
    const ghostRects = [];

    itemsToRemove.forEach(el => {
      const parent = el.parentNode;
      const nextSibling = el.nextSibling;
      if (parent) {
        const geo = captureElementDocGeometry(el);
        if (geo.docW >= 20 && geo.docH >= 14) {
          ghostRects.push(geo);
        }
        batchItems.push({ element: el, parent, nextSibling });
        el.remove();
        // Si el wrapper padre era un hueco reservado para anuncio y quedó completamente vacío, colapsar su min-height
        if (
          parent.nodeType === 1 &&
          parent !== frameDoc.body &&
          !parent.textContent.trim() &&
          !parent.querySelector('img, svg, video, iframe, canvas, input')
        ) {
          styleFixes.push({ el: parent, cssText: parent.style.cssText });
          parent.style.minHeight = '0px';
          parent.style.height = 'auto';
          parent.style.margin = '0px';
          parent.style.padding = '0px';
        }
      }
    });

    // Desbloquear scroll en html/body si un modal de cookies/suscripción lo había dejado bloqueado (overflow: hidden)
    [frameDoc.documentElement, frameDoc.body].forEach(rootEl => {
      if (!rootEl) return;
      try {
        const cs = win.getComputedStyle(rootEl);
        if (cs.overflow === 'hidden' || cs.overflowY === 'hidden' || rootEl.classList.contains('modal-open')) {
          styleFixes.push({ el: rootEl, cssText: rootEl.style.cssText });
          rootEl.style.setProperty('overflow', 'visible', 'important');
          rootEl.style.setProperty('overflow-y', 'auto', 'important');
          rootEl.style.setProperty('position', 'static', 'important');
        }
      } catch (_) { }
    });

    if (batchItems.length > 0 || styleFixes.length > 0) {
      const count = Math.max(1, batchItems.length);
      pushHistoryAction({
        type: 'batch_delete',
        items: batchItems,
        styleFixes,
        ghostRects
      }, count);
      return count;
    }
    return 0;
  }

  if (btnAutoClean) {
    btnAutoClean.addEventListener('click', () => {
      const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
      if (!frameDoc || !frameDoc.body) return;

      const count = cleanPageDom(frameDoc);
      if (count > 0) {
        showToast(`¡Auto-Limpieza lista! Se eliminaron ${count} bloques molestos y se liberó el scroll.`);
      } else {
        showToast("¡La página ya está limpia! No se detectaron anuncios o bloqueos.");
      }
    });
  }

  // --------------------------------------------------------------------------
  // Reacomodación Inteligente con Motor Mozilla Readability (Reversible y Personalizable)
  // --------------------------------------------------------------------------
  function applyReaderAppearance(frameDoc) {
    if (!frameDoc) return;
    let styleEl = frameDoc.getElementById('bwd-readability-internal-styles');
    if (!styleEl) {
      styleEl = frameDoc.createElement('style');
      styleEl.id = 'bwd-readability-internal-styles';
      (frameDoc.head || frameDoc.documentElement).appendChild(styleEl);
    }

    const palettes = {
      light: { bg: '#ffffff', text: '#334155', heading: '#0f172a', muted: '#64748b', border: '#e2e8f0', badgeBg: 'rgba(56, 189, 248, 0.12)', badgeText: '#0284c7' },
      sepia: { bg: '#fbf6ec', text: '#3d3122', heading: '#231b10', muted: '#78664e', border: '#e6dac6', badgeBg: 'rgba(180, 83, 9, 0.12)', badgeText: '#92400e' },
      dark: { bg: '#0b0e17', text: '#cbd5e1', heading: '#f8fafc', muted: '#94a3b8', border: '#1e293b', badgeBg: 'rgba(56, 189, 248, 0.16)', badgeText: '#38bdf8' }
    };
    const p = palettes[readerTheme] || palettes.light;

    styleEl.textContent = `
      html, body {
        background-color: ${p.bg} !important;
        color: ${p.text} !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .bwd-readability-container {
        max-width: 820px !important;
        margin: 28px auto 56px !important;
        padding: 0 28px !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif !important;
        color: ${p.text} !important;
        line-height: 1.78 !important;
      }
      .bwd-readability-header {
        margin-bottom: 28px !important;
        border-bottom: 1px solid ${p.border} !important;
        padding-bottom: 20px !important;
      }
      .bwd-readability-site {
        display: inline-block !important;
        padding: 3px 10px !important;
        border-radius: 6px !important;
        background: ${p.badgeBg} !important;
        color: ${p.badgeText} !important;
        font-size: 11.5px !important;
        font-weight: 700 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.05em !important;
        margin-bottom: 14px !important;
      }
      .bwd-readability-title {
        font-size: ${Math.round(readerFontSize * 1.75)}px !important;
        font-weight: 800 !important;
        line-height: 1.24 !important;
        color: ${p.heading} !important;
        margin: 0 0 14px 0 !important;
        letter-spacing: -0.02em !important;
      }
      .bwd-readability-byline {
        font-size: 14px !important;
        color: ${p.muted} !important;
        margin-bottom: 12px !important;
        font-weight: 500 !important;
      }
      .bwd-readability-container p,
      .bwd-readability-container li {
        font-size: ${readerFontSize}px !important;
        line-height: 1.8 !important;
        margin: 0 0 20px 0 !important;
        color: ${p.text} !important;
      }
      .bwd-readability-container img {
        max-width: 100% !important;
        height: auto !important;
        border-radius: 8px !important;
        margin: 20px auto !important;
        display: block !important;
      }
      .bwd-readability-container figure {
        margin: 28px 0 !important;
        text-align: center !important;
      }
      .bwd-readability-container figcaption,
      .bwd-readability-container .caption,
      .bwd-readability-container .epigrafe {
        font-size: 13px !important;
        color: ${p.muted} !important;
        margin-top: 8px !important;
        text-align: center !important;
        font-style: italic !important;
        display: block !important;
      }
      .bwd-readability-container blockquote {
        border-left: 4px solid #38bdf8 !important;
        padding-left: 18px !important;
        margin: 26px 0 !important;
        font-style: italic !important;
        color: ${p.heading} !important;
      }
      .bwd-readability-container h2, .bwd-readability-container h3 {
        color: ${p.heading} !important;
        margin-top: 34px !important;
        margin-bottom: 14px !important;
        font-weight: 700 !important;
      }
    `;
    return styleEl;
  }

  function normalizeUrlForCompare(urlStr, baseHref) {
    if (!urlStr) return '';
    const decoded = String(urlStr).replace(/&amp;/g, '&').trim();
    if (decoded.startsWith('data:')) return decoded.slice(0, 120);
    try {
      const u = new URL(decoded, baseHref);
      return (u.origin + u.pathname).toLowerCase();
    } catch (_) {
      return decoded.split('?')[0].toLowerCase();
    }
  }

  async function reorganizeWithReadability(frameDoc) {
    if (!frameDoc || !frameDoc.body) return;

    commitActiveTextEdit();
    closeImagePopover();
    clearInspectorHover();

    // Si ya está en modo Readability y la última acción fue full_reorganize, permitir volver con 1 clic
    if (isReadabilityMode) {
      if (undoStack.length > 0 && undoStack[undoStack.length - 1].type === 'full_reorganize') {
        btnUndo.click();
        return;
      }
      showToast("El documento ya está en formato de lectura editorial.");
      return;
    }

    if (!window.Readability) {
      showToast("El motor Mozilla Readability no está disponible.", true);
      return;
    }

    try {
      showExportModal("Reacomodando con Mozilla Readability...", "Analizando estructura semántica y preservando censuras...", 25);

      const baseHref = frameDoc.baseURI || (cloneData && (cloneData.baseURI || cloneData.url)) || window.location.href;

      // 1. Extraer con precisión la imagen principal de portada (Lead Image)
      let leadImage = null;
      const leadSelectors = [
        '.article-main-media-image',
        '[class*="main-media"]',
        '[class*="lead-image"]',
        '[class*="lead-media"]',
        '[class*="featured-image"]',
        '[class*="featured-media"]',
        '[class*="foto-principal"]',
        '[class*="imagen-principal"]',
        '[class*="portada"]',
        'article figure',
        'main figure'
      ];

      for (const sel of leadSelectors) {
        const container = frameDoc.querySelector(sel);
        if (container) {
          const img = container.querySelector('img') || (container.tagName === 'IMG' ? container : null);
          if (img && !img.closest('[data-bwd-redacted]')) {
            const candidates = [
              img.currentSrc,
              img.getAttribute('src'),
              img.getAttribute('data-src'),
              img.getAttribute('data-original')
            ];
            let realSrc = '';
            for (const c of candidates) {
              if (c && typeof c === 'string' && !c.includes('data:image/svg') && !c.includes('placeholder')) {
                realSrc = c;
                break;
              }
            }
            if (realSrc && !realSrc.includes('avatar') && !realSrc.includes('logo') && !realSrc.includes('icon')) {
              try { if (!realSrc.startsWith('data:')) realSrc = new URL(realSrc, baseHref).href; } catch (_) { }
              const captionEl = container.querySelector('[class*="caption"], [class*="epigrafe"], figcaption, [class*="source"], [class*="credito"]');
              const caption = captionEl ? captionEl.textContent.trim() : (img.getAttribute('alt') || '');
              leadImage = { src: realSrc, caption };
              break;
            }
          }
        }
      }

      if (!leadImage) {
        const allImgs = Array.from(frameDoc.querySelectorAll('article img, main img, img'));
        for (const img of allImgs) {
          if (img.closest('header, nav, footer, aside, .sidebar, [data-bwd-redacted]')) continue;
          const realSrc = img.currentSrc || img.getAttribute('src') || '';
          if (realSrc && !realSrc.includes('data:image/svg') && !realSrc.includes('placeholder') && !realSrc.includes('avatar') && !realSrc.includes('logo')) {
            const w = img.naturalWidth || img.clientWidth || 0;
            if (w >= 180 || img.closest('article, main')) {
              let resolved = realSrc;
              try { if (!resolved.startsWith('data:')) resolved = new URL(resolved, baseHref).href; } catch (_) { }
              const parentFig = img.closest('figure, div');
              const cap = parentFig ? parentFig.querySelector('figcaption, [class*="caption"], [class*="epigrafe"]') : null;
              leadImage = { src: resolved, caption: cap ? cap.textContent.trim() : (img.getAttribute('alt') || '') };
              break;
            }
          }
        }
      }

      const docClone = frameDoc.cloneNode(true);
      normalizeFrameMedia(docClone);

      docClone.querySelectorAll('div[class*="media"], div[class*="image"], div[class*="foto"], div[class*="photo"], div[class*="figure"]').forEach(container => {
        const img = container.querySelector('img');
        if (img) {
          const fig = docClone.createElement('figure');
          fig.className = 'bwd-preserved-figure';
          while (container.firstChild) {
            fig.appendChild(container.firstChild);
          }
          container.replaceWith(fig);
        }
      });

      // Preservar explícitamente las clases de censura para que Readability jamás descubra datos ocultos
      const reader = new window.Readability(docClone, {
        charThreshold: 20,
        keepClasses: true,
        classesToPreserve: [
          'bwd-preserved-figure',
          'bwd-redacted-box',
          'bwd-redacted-blur',
          'bwd-redacted-mask',
          'caption', 'epigrafe', 'source', 'credito', 'bajada', 'copete'
        ]
      });

      const article = reader.parse();

      if (!article || !article.content) {
        hideExportModal();
        showToast("No se detectó un artículo estándar en esta página. Puedes usar 'Auto-Limpiar'.");
        return;
      }

      showExportModal("Reacomodando artículo...", "Estructurando maquetación editorial con fotos y censuras...", 75);

      const savedNodes = Array.from(frameDoc.body.childNodes).map(n => n.cloneNode(true));
      const styleEl = applyReaderAppearance(frameDoc);

      let leadImageHtml = '';
      if (leadImage && leadImage.src) {
        const leadKey = normalizeUrlForCompare(leadImage.src, baseHref);
        const tempCheck = document.createElement('div');
        tempCheck.innerHTML = article.content;
        const alreadyPresent = Array.from(tempCheck.querySelectorAll('img')).some(im => {
          return normalizeUrlForCompare(im.getAttribute('src') || '', baseHref) === leadKey;
        });

        if (!alreadyPresent) {
          leadImageHtml = `
            <figure class="bwd-readability-lead-figure">
              <img src="${escapeHtml(leadImage.src)}" alt="${escapeHtml(article.title || '')}">
              ${leadImage.caption ? `<figcaption>${escapeHtml(leadImage.caption)}</figcaption>` : ''}
            </figure>
          `;
        }
      }

      const siteTitle = article.siteName || (cloneData && cloneData.title ? cloneData.title.split('-')[0].trim() : 'Artículo Web');
      const authorByline = article.byline ? `<div class="bwd-readability-byline">${escapeHtml(article.byline)}</div>` : '';

      const cleanArticleHtml = `
        <article class="bwd-readability-container">
          <header class="bwd-readability-header">
            <span class="bwd-readability-site">${escapeHtml(siteTitle)}</span>
            <h1 class="bwd-readability-title">${escapeHtml(article.title || '')}</h1>
            ${authorByline}
          </header>
          ${leadImageHtml}
          <div class="bwd-readability-body">
            ${article.content}
          </div>
        </article>
      `;

      const parser = new DOMParser();
      const parsedDoc = parser.parseFromString(cleanArticleHtml, 'text/html');
      const articleNode = parsedDoc.body.firstElementChild;
      if (articleNode) {
        // Restaurar atributos data-bwd-redacted en cualquier nodo censurado preservado por clase
        articleNode.querySelectorAll('.bwd-redacted-box').forEach(el => el.setAttribute('data-bwd-redacted', 'solid'));
        articleNode.querySelectorAll('.bwd-redacted-blur').forEach(el => el.setAttribute('data-bwd-redacted', 'blur'));
        articleNode.querySelectorAll('.bwd-redacted-mask').forEach(el => el.setAttribute('data-bwd-redacted', 'mask'));
        frameDoc.body.replaceChildren(articleNode);
      }

      normalizeFrameMedia(frameDoc);
      const reorganizedNodes = Array.from(frameDoc.body.childNodes).map(n => n.cloneNode(true));

      isReadabilityMode = true;
      if (btnReorganize) btnReorganize.classList.add('is-active');
      if (readerControlsGroup) readerControlsGroup.style.display = 'inline-flex';

      pushHistoryAction({
        type: 'full_reorganize',
        origNodes: savedNodes,
        newNodes: reorganizedNodes,
        styleEl
      }, 1);

      setTool(activeTool);
      await inlineAllImages(frameDoc).catch(() => { });

      hideExportModal();
      showToast("¡Artículo reacomodado preservando fotos, epígrafes y censuras!");

    } catch (err) {
      console.error("Error al reacomodar con Readability:", err);
      hideExportModal();
      showToast(`Error al reacomodar: ${err.message || err}`, true);
    }
  }

  if (btnReorganize) {
    btnReorganize.addEventListener('click', () => {
      const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
      if (!frameDoc || !frameDoc.body) return;
      reorganizeWithReadability(frameDoc);
    });
  }

  // --------------------------------------------------------------------------
  // Auto-Censura Inteligente (Regex PII + Avatares/Perfiles + Undo/Redo Completo)
  // --------------------------------------------------------------------------
  function autoRedactSensitiveData(frameDoc) {
    if (!frameDoc || !frameDoc.body) return 0;

    commitActiveTextEdit();
    closeImagePopover();
    clearInspectorHover();

    const records = [];
    const wrappedSpans = [];

    // 1. Escáner de elementos compactos de perfil, avatares y cuentas (con límite estricto de dimensiones)
    const sensitiveSelectors = [
      'img[class*="avatar" i]',
      'img[alt*="avatar" i]',
      'img[class*="profile" i]',
      'img[id*="avatar" i]',
      '[class*="profile-pic" i]',
      '[class*="profile-image" i]',
      '[class*="user-name" i]',
      '[class*="username" i]',
      '[class*="user_name" i]',
      '[class*="account-number" i]',
      '[class*="card-number" i]',
      '[class*="cbu" i]',
      '[class*="iban" i]',
      'a[href^="mailto:"]',
      'a[href^="tel:"]'
    ];

    sensitiveSelectors.forEach(sel => {
      try {
        frameDoc.querySelectorAll(sel).forEach(el => {
          if (!el || el.tagName === 'BODY' || el.tagName === 'HTML') return;
          if (el.hasAttribute('data-bwd-redacted') || el.closest('[data-bwd-redacted]')) return;

          const rect = el.getBoundingClientRect();
          const blockChildren = el.querySelectorAll('p, section, article, table, ul, ol').length;
          // Evitar falsos positivos sobre contenedores de página completos
          if (rect.width > 520 || rect.height > 260 || blockChildren > 1) return;
          if (rect.width === 0 && rect.height === 0) return;

          const rec = applyElementRedaction(el, redactStyle);
          if (rec) records.push(rec);
        });
      } catch (_) { }
    });

    // 2. Escáner Regex PII sobre nodos de texto (Emails, Montos/Balances, Tarjetas/Cuentas, Teléfonos)
    const piiCombinedRegex = /(\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:US\$|AR\$|MX\$|CLP\$|R\$|S\/|\$|€|£|USD|EUR|ARS|MXN|CLP|COP|PEN|BRL|USDT)\s?\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?\b|\b\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})\s?(?:USD|EUR|ARS|MXN|USDT)\b|\b(?:\d[ -]?){13,22}\b|(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\b\d{2,4}[\s.-])\d{3,4}[\s.-]\d{4}\b)/gi;

    const textNodes = [];
    const walker = frameDoc.createTreeWalker(frameDoc.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || node.nodeValue.trim().length < 4) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = p.tagName.toLowerCase();
        if (['script', 'style', 'noscript', 'textarea', 'svg', 'code', 'pre'].includes(tag)) return NodeFilter.FILTER_REJECT;
        if (p.hasAttribute('data-bwd-redacted') || p.closest('[data-bwd-redacted]')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let tn;
    while ((tn = walker.nextNode())) textNodes.push(tn);

    textNodes.forEach(node => {
      const text = node.nodeValue;
      piiCombinedRegex.lastIndex = 0;
      if (!piiCombinedRegex.test(text)) return;

      piiCombinedRegex.lastIndex = 0;
      const frag = frameDoc.createDocumentFragment();
      let lastIdx = 0;
      let match;
      let matchedAny = false;

      while ((match = piiCombinedRegex.exec(text)) !== null) {
        const rawMatch = match[0];
        // Evitar falsos positivos en secuencias numéricas que parezcan fechas/IDs cortos sin formato
        const digitsOnly = rawMatch.replace(/\D/g, '');
        if (/^[\d\s-]+$/.test(rawMatch) && digitsOnly.length < 10) continue;

        matchedAny = true;
        if (match.index > lastIdx) {
          frag.appendChild(frameDoc.createTextNode(text.slice(lastIdx, match.index)));
        }

        const span = frameDoc.createElement('span');
        span.setAttribute('data-bwd-auto-span', 'true');
        span.setAttribute('data-bwd-redacted', redactStyle);
        span.setAttribute('data-bwd-orig-text', rawMatch);

        if (redactStyle === 'mask') {
          span.textContent = maskTextPreserveSpaces(rawMatch);
          span.className = 'bwd-redacted-mask';
        } else if (redactStyle === 'blur') {
          span.textContent = rawMatch;
          span.className = 'bwd-redacted-blur';
        } else {
          span.textContent = rawMatch;
          span.className = 'bwd-redacted-box';
          span.style.backgroundColor = '#0f172a';
          span.style.color = 'transparent';
          span.style.borderRadius = '3px';
        }

        frag.appendChild(span);
        wrappedSpans.push(span);
        lastIdx = match.index + rawMatch.length;
      }

      if (matchedAny) {
        if (lastIdx < text.length) {
          frag.appendChild(frameDoc.createTextNode(text.slice(lastIdx)));
        }
        if (node.parentNode) {
          node.parentNode.replaceChild(frag, node);
        }
      }
    });

    const totalRedacted = records.length + wrappedSpans.length;
    if (totalRedacted > 0) {
      pushHistoryAction({
        type: 'batch_redact',
        records,
        wrappedSpans
      }, totalRedacted);
    }
    return totalRedacted;
  }

  btnAutoRedact.addEventListener('click', () => {
    const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
    if (!frameDoc) return;

    const redactedCount = autoRedactSensitiveData(frameDoc);
    if (redactedCount > 0) {
      showToast(`¡Auto-Censura completada! Se protegieron ${redactedCount} datos privados (emails, montos, cuentas o perfiles).`);
    } else {
      showToast("No se detectaron emails, montos ni perfiles adicionales. Usa 'Censurar' para selección manual.");
    }
  });

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
  // 6. Inliner Universal de Imágenes Reales (Bypass de CORS y Eliminación de Cajas Grises)
  // --------------------------------------------------------------------------

  async function inlineAllImages(doc, onProgress = () => { }) {
    if (!doc) return;

    const baseHref = doc.baseURI || cloneData?.baseURI || cloneData?.url || window.location.href;

    doc.querySelectorAll('picture').forEach(pic => {
      const img = pic.querySelector('img');
      if (img) pic.replaceWith(img);
    });

    const images = Array.from(doc.querySelectorAll('img'));
    const bgElements = Array.from(doc.querySelectorAll('[style*="url("]'));
    const total = images.length + bgElements.length;
    if (!total) return;

    let processed = 0;

    async function fetchAsDataUrl(rawUrl) {
      if (!rawUrl || rawUrl.startsWith('data:')) return rawUrl;
      let absUrl = rawUrl;
      try { absUrl = new URL(rawUrl, baseHref).href; } catch (_) { }
      if (!absUrl.startsWith('http')) return '';
      const resp = await fetch(absUrl);
      if (!resp.ok) return '';
      const blob = await resp.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(typeof reader.result === 'string' && reader.result.startsWith('data:image/') ? reader.result : '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(blob);
      });
    }

    await Promise.all([
      ...images.map(async (img) => {
        try {
          if (img.hasAttribute('data-bwd-redacted')) return;
          const currentSrcAttr = img.getAttribute('src') || '';
          if (currentSrcAttr.startsWith('data:image/jpeg') || currentSrcAttr.startsWith('data:image/png') || currentSrcAttr.startsWith('data:image/webp')) {
            return;
          }

          const srcsetBest = pickBestSrcsetUrl(img.getAttribute('srcset') || img.getAttribute('data-srcset') || '');
          const nonSrcsetCandidates = [
            img.getAttribute('data-src'),
            img.getAttribute('data-original'),
            img.getAttribute('data-lazy-src'),
            img.getAttribute('data-url'),
            img.getAttribute('data-retina'),
            srcsetBest,
            currentSrcAttr,
            img.currentSrc
          ];

          let targetUrl = '';
          for (const c of nonSrcsetCandidates) {
            if (c && typeof c === 'string' && !c.includes('data:image/svg') && !c.includes('placeholder')) {
              targetUrl = c.trim();
              break;
            }
          }
          if (!targetUrl) return;

          const dataUrl = await fetchAsDataUrl(targetUrl);
          if (dataUrl) {
            img.setAttribute('src', dataUrl);
            img.src = dataUrl;
            img.removeAttribute('srcset');
            img.removeAttribute('data-src');
            img.removeAttribute('data-original');
            img.removeAttribute('data-lazy-src');
            img.removeAttribute('data-srcset');
            img.setAttribute('loading', 'eager');
          }
        } catch (_) {
        } finally {
          processed++;
          if (total > 0 && (processed % 2 === 0 || processed === total)) {
            onProgress(`Descargando e incrustando recursos (${processed}/${total})...`, 15 + Math.round((processed / total) * 20));
          }
        }
      }),
      ...bgElements.map(async (el) => {
        try {
          if (el.hasAttribute('data-bwd-redacted')) return;
          const bg = el.style.backgroundImage || '';
          const match = bg.match(/url\((['"]?)(.*?)\1\)/i);
          if (match && match[2] && !match[2].startsWith('data:')) {
            const dataUrl = await fetchAsDataUrl(match[2]);
            if (dataUrl) {
              el.style.backgroundImage = bg.replace(match[0], `url("${dataUrl}")`);
            }
          }
        } catch (_) {
        } finally {
          processed++;
        }
      })
    ]);

    await Promise.all(images.map(img => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise(res => {
        img.onload = res;
        img.onerror = res;
        setTimeout(res, 1800);
      });
    }));

    if (!isExporting) {
      scheduleLivePreviewSync(true);
    }
  }

  function detectPageTheme(doc) {
    let bgColor = '#ffffff';
    let isDark = false;
    let bgR = 255, bgG = 255, bgB = 255;
    try {
      const win = doc.defaultView || window;
      const body = doc.body;
      const docEl = doc.documentElement;
      const bodyStyle = win.getComputedStyle(body);
      const docStyle = win.getComputedStyle(docEl);

      let rawBg = bodyStyle.backgroundColor;
      if (!rawBg || rawBg === 'transparent' || rawBg === 'rgba(0, 0, 0, 0)') {
        rawBg = docStyle.backgroundColor;
      }

      if (rawBg && rawBg !== 'transparent' && rawBg !== 'rgba(0, 0, 0, 0)') {
        bgColor = rawBg;
        const rgbMatch = rawBg.match(/\d+/g);
        if (rgbMatch && rgbMatch.length >= 3) {
          bgR = parseInt(rgbMatch[0], 10);
          bgG = parseInt(rgbMatch[1], 10);
          bgB = parseInt(rgbMatch[2], 10);
          const lum = (0.299 * bgR + 0.587 * bgG + 0.114 * bgB);
          isDark = lum < 128;
        }
      }
    } catch (_) { }

    return { bgColor, isDark, bgR, bgG, bgB };
  }

  // Motor Nativo de Captura del Compositor Firefox sobre el Iframe (Cero HUD, cero hover, cero barra de scroll)
  async function captureIframeViaNativeCompositor(frameDoc, onProgress = () => { }) {
    const win = cloneFrame.contentWindow;
    if (!win || typeof browser === 'undefined' || !browser.tabs || !browser.tabs.captureVisibleTab) {
      return null;
    }

    const prevModalDisplay = exportModal ? exportModal.style.display : 'none';
    const prevToastDisplay = toastNotification ? toastNotification.style.display : 'none';
    const prevPointerEvents = cloneFrame.style.pointerEvents || '';
    const prevScrollX = win.scrollX || win.pageXOffset || 0;
    const prevScrollY = win.scrollY || win.pageYOffset || 0;

    // Suprimir barras de scroll, transiciones CSS y hovers sin alterar el flujo de maquetación inicial
    const tempRestores = [];
    const trackedEls = new Set();
    const recordStyle = (el, prop) => {
      const key = `${prop}`;
      if (!el.__bwd_cap_saved) el.__bwd_cap_saved = new Set();
      if (!el.__bwd_cap_saved.has(key)) {
        el.__bwd_cap_saved.add(key);
        tempRestores.push({ el, prop, val: el.style.getPropertyValue(prop) });
      }
    };

    const tempStyle = frameDoc.createElement('style');
    tempStyle.id = 'bwd-native-capture-temp';
    tempStyle.textContent = `
      :root, html, body, *, *::before, *::after {
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
        scroll-behavior: auto !important;
        transition: none !important;
        animation: none !important;
      }
      *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
      *, *:hover { outline: none !important; }
    `;
    (frameDoc.head || frameDoc.documentElement).appendChild(tempStyle);

    frameDoc.querySelectorAll('[data-bwd-hovered]').forEach(el => el.removeAttribute('data-bwd-hovered'));

    try {
      // Activar blindaje global manteniendo intacto el ancho exacto del iframe (cero reflow de columnas/titulares)
      clearInspectorHover();
      document.body.classList.add('is-capturing-native');
      cloneFrame.style.pointerEvents = 'none';
      if (frameDoc.body) {
        frameDoc.body.removeAttribute('data-bwd-tool');
        frameDoc.body.setAttribute('data-bwd-exporting', 'true');
      }
      if (exportModal) exportModal.style.display = 'none';
      if (toastNotification) toastNotification.style.display = 'none';

      win.scrollTo(0, 0);
      if (frameDoc.documentElement) frameDoc.documentElement.scrollTop = 0;
      if (frameDoc.body) frameDoc.body.scrollTop = 0;

      // Esperar 2 frames reales del compositor en scrollY = 0
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise(r => setTimeout(r, 90));

      const frameRect = cloneFrame.getBoundingClientRect();
      if (frameRect.width < 100 || frameRect.height < 100) return null;

      const innerClientW = (frameDoc.documentElement && frameDoc.documentElement.clientWidth > 80)
        ? Math.min(frameRect.width, frameDoc.documentElement.clientWidth)
        : frameRect.width;

      const viewportH = win.innerHeight || Math.round(frameRect.height);

      // En Slice 0 (scrollY = 0): desacoplar únicamente cabeceras/banners fixed que estén tapando el <h1> y ocultar barras flotantes inferiores
      const mainHeading = frameDoc.querySelector('article h1, main h1, h1');
      const h1Rect = mainHeading ? mainHeading.getBoundingClientRect() : null;

      frameDoc.querySelectorAll('*').forEach(el => {
        if (!el || ['HTML', 'BODY', 'MAIN', 'ARTICLE'].includes(el.tagName)) return;
        try {
          const s = win.getComputedStyle(el);
          if (s.backgroundAttachment === 'fixed') {
            recordStyle(el, 'background-attachment');
            el.style.setProperty('background-attachment', 'scroll', 'important');
          }
          if (s.position === 'fixed') {
            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0 || rect.height > viewportH * 0.75) return;

            const topPx = parseFloat(s.top);
            const overlapsH1 = Boolean(
              h1Rect &&
              h1Rect.height > 10 &&
              rect.bottom > (h1Rect.top + 4) &&
              rect.top < (h1Rect.bottom + 64) &&
              !el.contains(mainHeading)
            );

            if (rect.top > viewportH * 0.45) {
              // Widgets flotantes inferiores, barras de cookies/chat al pie: ocultar desde el corte 0
              recordStyle(el, 'visibility');
              recordStyle(el, 'opacity');
              el.style.setProperty('visibility', 'hidden', 'important');
              el.style.setProperty('opacity', '0', 'important');
              trackedEls.add(el);
            } else if (overlapsH1 || (!Number.isNaN(topPx) && topPx > 24 && rect.top < 380)) {
              // Cabecera o banner fixed pegado a mitad de pantalla tapando el título principal: devolver a flujo normal
              recordStyle(el, 'position');
              recordStyle(el, 'top');
              recordStyle(el, 'width');
              recordStyle(el, 'transform');
              const isNav = el.tagName === 'HEADER' || el.tagName === 'NAV' || /header|navbar/i.test(`${el.id} ${el.className}`);
              el.style.setProperty('position', isNav ? 'relative' : 'static', 'important');
              el.style.setProperty('top', 'auto', 'important');
              if (isNav) el.style.setProperty('width', '100%', 'important');
              el.style.setProperty('transform', 'none', 'important');
            }
          }
        } catch (_) { }
      });

      await new Promise(r => requestAnimationFrame(r));

      const measureTotalH = () => Math.min(
        Math.max(
          frameDoc.body ? frameDoc.body.scrollHeight : 0,
          frameDoc.documentElement ? frameDoc.documentElement.scrollHeight : 0,
          viewportH
        ),
        26000
      );

      let totalH = measureTotalH();
      const slices = [];
      let currentY = 0;
      let maxScrollY = Math.max(0, totalH - viewportH);
      let prevActualY = -1;

      const hideFixedAndStickyForScrollSlices = () => {
        frameDoc.querySelectorAll('*').forEach(el => {
          if (!el || ['HTML', 'BODY', 'MAIN', 'ARTICLE'].includes(el.tagName)) return;
          if (trackedEls.has(el)) return;
          try {
            const s = win.getComputedStyle(el);
            if (s.position === 'fixed' || s.position === 'sticky') {
              const r = el.getBoundingClientRect();
              const isOverlayWrapper = !el.querySelector('article, main, h1, p') && (el.innerText || '').trim().length < 260;
              if (r.height < viewportH * 0.78 || isOverlayWrapper) {
                recordStyle(el, 'visibility');
                recordStyle(el, 'opacity');
                recordStyle(el, 'border-color');
                recordStyle(el, 'box-shadow');
                el.style.setProperty('visibility', 'hidden', 'important');
                el.style.setProperty('opacity', '0', 'important');
                el.style.setProperty('border-color', 'transparent', 'important');
                el.style.setProperty('box-shadow', 'none', 'important');
                trackedEls.add(el);
              }
            }
          } catch (_) { }
        });
      };

      // Paso con solapamiento interior múltiplo de 8px: garantiza enteros exactos en DPI 100%/125%/150%/200% y descarta bordes de ventana
      const overlapCss = Math.min(96, Math.max(32, Math.floor(viewportH * 0.2)));
      const stepCss = Math.max(64, Math.floor((viewportH - overlapCss) / 8) * 8);

      while (currentY <= maxScrollY) {
        const targetY = Math.min(currentY, maxScrollY);
        win.scrollTo(0, targetY);
        if (frameDoc.documentElement) frameDoc.documentElement.scrollTop = targetY;
        if (frameDoc.body) frameDoc.body.scrollTop = targetY;

        if (slices.length >= 1) {
          hideFixedAndStickyForScrollSlices();
        }

        await new Promise(r => requestAnimationFrame(() => setTimeout(r, 130)));

        const actualY = Math.max(
          win.scrollY || 0,
          frameDoc.documentElement ? frameDoc.documentElement.scrollTop : 0,
          frameDoc.body ? frameDoc.body.scrollTop : 0
        );

        if (currentY > 0 && actualY <= prevActualY + 0.5) break;

        if (slices.length >= 1) {
          hideFixedAndStickyForScrollSlices();
          await new Promise(r => requestAnimationFrame(r));
        }

        const shotUrl = await browser.tabs.captureVisibleTab(null, { format: 'png' });
        slices.push({ url: shotUrl, actualScrollY: actualY });
        prevActualY = actualY;

        totalH = measureTotalH();
        maxScrollY = Math.max(0, totalH - viewportH);

        if (currentY >= maxScrollY || actualY >= maxScrollY - 1) break;
        currentY = actualY + stepCss;
        if (currentY > maxScrollY && prevActualY < maxScrollY - 1) currentY = maxScrollY;
      }

      if (slices.length === 0) return null;

      const loadImg = (src) => new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = src;
      });

      const firstImg = await loadImg(slices[0].url);
      const dprX = firstImg.width / Math.max(1, window.innerWidth);
      const dprY = firstImg.height / Math.max(1, window.innerHeight);

      // Recorte interior limpio excluyendo bordes del contenedor y filas sub-píxel de los extremos superior/inferior
      const cropX = Math.max(0, Math.ceil(frameRect.left * dprX));
      const cropY = Math.max(0, Math.ceil(frameRect.top * dprY) + 1);
      const cropW = Math.max(1, Math.min(firstImg.width - cropX, Math.floor(innerClientW * dprX)));
      const cropH = Math.max(1, Math.min(firstImg.height - cropY, Math.floor(frameRect.height * dprY) - 2));

      const lastScroll = slices[slices.length - 1].actualScrollY;
      const masterHeight = slices.length === 1
        ? Math.max(1, Math.min(cropH, Math.round(totalH * dprY)))
        : Math.max(1, Math.round(lastScroll * dprY) + cropH);

      const masterCanvas = document.createElement('canvas');
      masterCanvas.width = cropW;
      masterCanvas.height = masterHeight;
      const ctx = masterCanvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;

      // Recortar margen inferior de cada corte no-final para jamás usar ni la fila 0 ni la fila final en ninguna costura
      const bottomTrimPx = slices.length > 1
        ? Math.min(Math.floor(cropH * 0.14), Math.max(10, Math.round(28 * dprY)))
        : 0;

      const firstDrawH = Math.max(1, Math.min(masterHeight, cropH - bottomTrimPx));
      ctx.drawImage(firstImg, cropX, cropY, cropW, firstDrawH, 0, 0, cropW, firstDrawH);
      let paintedDocPx = firstDrawH;

      for (let i = 1; i < slices.length; i++) {
        const img = await loadImg(slices[i].url);
        const isLastSlice = (i === slices.length - 1);
        const sliceStartDocPx = Math.round(slices[i].actualScrollY * dprY);
        const usableLocalEnd = isLastSlice ? cropH : Math.max(1, cropH - bottomTrimPx);

        const localStartY = Math.max(0, paintedDocPx - sliceStartDocPx);
        const drawH = Math.min(usableLocalEnd - localStartY, masterHeight - paintedDocPx);

        if (drawH > 0) {
          const sy = cropY + localStartY;
          const dy = paintedDocPx;
          ctx.drawImage(img, cropX, sy, cropW, drawH, 0, dy, cropW, drawH);
          paintedDocPx += drawH;
        }
      }

      if (paintedDocPx > 0 && paintedDocPx < masterCanvas.height) {
        const trimmed = document.createElement('canvas');
        trimmed.width = cropW;
        trimmed.height = paintedDocPx;
        trimmed.getContext('2d').drawImage(masterCanvas, 0, 0, cropW, paintedDocPx, 0, 0, cropW, paintedDocPx);
        return trimmed;
      }

      return masterCanvas;
    } catch (e) {
      console.warn("Motor nativo no disponible en este contexto, aplicando fallback html2canvas:", e);
      return null;
    } finally {
      tempStyle.remove();
      for (let i = tempRestores.length - 1; i >= 0; i--) {
        const item = tempRestores[i];
        try {
          if (item.el && item.el.__bwd_cap_saved) delete item.el.__bwd_cap_saved;
          if (item.val) item.el.style.setProperty(item.prop, item.val);
          else item.el.style.removeProperty(item.prop);
        } catch (_) { }
      }
      if (frameDoc.body) {
        frameDoc.body.removeAttribute('data-bwd-exporting');
        frameDoc.body.setAttribute('data-bwd-tool', activeTool);
      }
      cloneFrame.style.pointerEvents = prevPointerEvents;
      document.body.classList.remove('is-capturing-native');
      win.scrollTo(prevScrollX, prevScrollY);
      if (exportModal) exportModal.style.display = prevModalDisplay;
      if (toastNotification) toastNotification.style.display = prevToastDisplay;
    }
  }

  async function captureEditorCanvas(onProgress = () => { }) {
    isExporting = true;
    commitActiveTextEdit();
    closeImagePopover();
    clearInspectorHover();

    const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
    frameDoc.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
    frameDoc.querySelectorAll('[data-bwd-hovered]').forEach(el => el.removeAttribute('data-bwd-hovered'));
    if (frameDoc.body) {
      frameDoc.body.removeAttribute('data-bwd-tool');
      frameDoc.body.setAttribute('data-bwd-exporting', 'true');
    }

    try {
      if (frameDoc.fonts) {
        try {
          await Promise.race([
            frameDoc.fonts.ready,
            new Promise(r => setTimeout(r, 1500))
          ]);
        } catch (_) { }
      }

      onProgress("Incrustando imágenes y fondos de alta definición...", 15);
      await inlineAllImages(frameDoc, (msg, pct) => onProgress(msg, pct));
      await new Promise(r => setTimeout(r, 180));

      const useNative = !optNativeCapture || optNativeCapture.checked;
      if (useNative && zoomLevel === 1) {
        onProgress("Capturando con motor visual nativo de Firefox...", 45);
        const nativeCanvas = await captureIframeViaNativeCompositor(frameDoc, onProgress);
        if (nativeCanvas && nativeCanvas.width > 50 && nativeCanvas.height > 50) {
          return nativeCanvas;
        }
      }

      const win = cloneFrame.contentWindow;
      const prevScrollX = win ? (win.scrollX || win.pageXOffset || 0) : 0;
      const prevScrollY = win ? (win.scrollY || win.pageYOffset || 0) : 0;

      if (win) win.scrollTo(0, 0);
      if (frameDoc.documentElement) {
        frameDoc.documentElement.scrollTop = 0;
        frameDoc.documentElement.scrollLeft = 0;
      }
      if (frameDoc.body) {
        frameDoc.body.scrollTop = 0;
        frameDoc.body.scrollLeft = 0;
      }

      const body = frameDoc.body;
      const docEl = frameDoc.documentElement;
      const fullWidth = Math.max(
        body ? body.scrollWidth : 0,
        body ? body.offsetWidth : 0,
        docEl ? docEl.clientWidth : 0,
        docEl ? docEl.scrollWidth : 0,
        win ? win.innerWidth : 1200
      );
      const fullHeight = Math.max(
        body ? body.scrollHeight : 0,
        body ? body.offsetHeight : 0,
        docEl ? docEl.clientHeight : 0,
        docEl ? docEl.scrollHeight : 0,
        win ? win.innerHeight : 800
      );

      let scale = 2;
      if (fullHeight * scale > 28000) {
        scale = Math.max(1, 28000 / fullHeight);
      }

      const { bgColor } = detectPageTheme(frameDoc);
      onProgress("Compilando vista de alta definición sin recortes...", 50);

      try {
        return await window.html2canvas(docEl || body, {
          useCORS: true,
          scale,
          scrollX: 0,
          scrollY: 0,
          x: 0,
          y: 0,
          width: fullWidth,
          height: fullHeight,
          windowWidth: fullWidth,
          windowHeight: fullHeight,
          backgroundColor: bgColor,
          logging: false,
          onclone: (clonedDoc) => {
            if (clonedDoc.defaultView) clonedDoc.defaultView.scrollTo(0, 0);
            if (clonedDoc.documentElement) {
              clonedDoc.documentElement.scrollTop = 0;
              clonedDoc.documentElement.style.overflow = 'visible';
              clonedDoc.documentElement.style.height = 'auto';
            }
            if (clonedDoc.body) {
              clonedDoc.body.scrollTop = 0;
              clonedDoc.body.style.overflow = 'visible';
              clonedDoc.body.style.height = 'auto';
              clonedDoc.body.removeAttribute('data-bwd-tool');
            }

            const internalEditorCss = clonedDoc.querySelector('#bwd-editor-internal-css');
            if (internalEditorCss) internalEditorCss.remove();

            const baseHref = frameDoc.baseURI || cloneData?.baseURI || cloneData?.url || window.location.href;
            if (!clonedDoc.querySelector('base') && clonedDoc.head) {
              const baseTag = clonedDoc.createElement('base');
              baseTag.href = baseHref;
              clonedDoc.head.insertBefore(baseTag, clonedDoc.head.firstChild);
            }

            frameDoc.querySelectorAll('link[rel="stylesheet"], style').forEach(st => {
              if (st.id === 'bwd-editor-internal-css') return;
              if (!st.id || !clonedDoc.getElementById(st.id)) {
                try { clonedDoc.head.appendChild(st.cloneNode(true)); } catch (_) { }
              }
            });

            const styleEl = clonedDoc.createElement('style');
            styleEl.id = 'bwd-scrollbars-clean';
            styleEl.textContent = `
              *, *::before, *::after { scrollbar-width: none !important; -ms-overflow-style: none !important; outline: none !important; }
              *::-webkit-scrollbar { display: none !important; width: 0px !important; height: 0px !important; }
              html, body { overflow-x: hidden !important; }
              .bwd-redacted-box { background-color: #0f172a !important; color: transparent !important; border-radius: 3px !important; border: 1px solid rgba(148,163,184,0.32) !important; }
              .bwd-redacted-box * { color: transparent !important; opacity: 0 !important; }
              .bwd-redacted-blur { filter: blur(8px) !important; }
              .bwd-redacted-mask { font-family: ui-monospace, monospace !important; }
            `;
            if (clonedDoc.head) clonedDoc.head.appendChild(styleEl);

            clonedDoc.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
            clonedDoc.querySelectorAll('[data-bwd-hovered]').forEach(el => el.removeAttribute('data-bwd-hovered'));
            clonedDoc.querySelectorAll('*').forEach(el => {
              try {
                if (clonedDoc.defaultView && !['HTML', 'BODY', 'MAIN', 'ARTICLE'].includes(el.tagName)) {
                  const s = clonedDoc.defaultView.getComputedStyle(el);
                  if (s && s.position === 'sticky') {
                    el.style.setProperty('position', 'static', 'important');
                  } else if (s && s.position === 'fixed') {
                    const topVal = parseFloat(s.top);
                    if (el.tagName === 'HEADER' || el.tagName === 'NAV' || (Number.isFinite(topVal) && topVal <= 280)) {
                      el.style.setProperty('position', 'relative', 'important');
                      el.style.setProperty('top', 'auto', 'important');
                      el.style.setProperty('width', '100%', 'important');
                    } else {
                      el.style.setProperty('display', 'none', 'important');
                    }
                  }
                }
              } catch (_) { }
            });
          }
        });
      } finally {
        if (win) win.scrollTo(prevScrollX, prevScrollY);
      }
    } finally {
      isExporting = false;
      document.body.classList.remove('is-capturing-native');
      if (frameDoc && frameDoc.body) {
        frameDoc.body.removeAttribute('data-bwd-exporting');
        frameDoc.body.setAttribute('data-bwd-tool', activeTool);
      }
    }
  }

  // Motor de rebanado A4 inteligente con detección de renglones vacíos (evita partir letras o fotos a la mitad)
  function findSafeCutRow(ctx, width, idealCutY, minCutY, totalHeight) {
    if (idealCutY >= totalHeight) return totalHeight;
    const searchStart = Math.max(minCutY, idealCutY - Math.round(width * 0.08));
    const bandHeight = idealCutY - searchStart;
    if (bandHeight <= 8) return idealCutY;

    try {
      const sampleStepX = Math.max(2, Math.floor(width / 160));
      const imgData = ctx.getImageData(0, searchStart, width, bandHeight).data;
      let bestRowOffset = bandHeight - 1;
      let lowestVariance = Infinity;

      // Recorrer desde abajo (más cerca de idealCutY) hacia arriba buscando una fila uniforme sin bordes de texto
      for (let ry = bandHeight - 1; ry >= 0; ry--) {
        let diffSum = 0;
        const rowBase = ry * width * 4;
        let prevR = imgData[rowBase];
        let prevG = imgData[rowBase + 1];
        let prevB = imgData[rowBase + 2];

        for (let x = sampleStepX; x < width; x += sampleStepX) {
          const idx = rowBase + x * 4;
          const r = imgData[idx];
          const g = imgData[idx + 1];
          const b = imgData[idx + 2];
          diffSum += Math.abs(r - prevR) + Math.abs(g - prevG) + Math.abs(b - prevB);
          prevR = r; prevG = g; prevB = b;
        }

        // Si la fila es casi completamente uniforme (espacio entre párrafos/líneas), elegirla de inmediato
        if (diffSum <= 18) {
          return searchStart + ry;
        }
        if (diffSum < lowestVariance) {
          lowestVariance = diffSum;
          bestRowOffset = ry;
        }
      }

      return searchStart + bestRowOffset;
    } catch (_) {
      return idealCutY;
    }
  }

  function sliceCanvasForA4(canvas, onProgress = () => { }) {
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    const sliceHeightPx = Math.floor(canvasWidth * (281 / 194));
    const isSingleScreen = (canvasHeight <= (canvasWidth * 1.45));

    if (isSingleScreen) {
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvasWidth;
      pageCanvas.height = canvasHeight;
      const pctx = pageCanvas.getContext('2d');
      pctx.fillStyle = '#ffffff';
      pctx.fillRect(0, 0, canvasWidth, canvasHeight);
      pctx.drawImage(canvas, 0, 0);

      return [{
        dataUrl: pageCanvas.toDataURL('image/jpeg', 0.92),
        width: canvasWidth,
        height: canvasHeight,
        isSingleScreen: true
      }];
    }

    const srcCtx = canvas.getContext('2d');
    const slices = [];
    let currentY = 0;
    let pageIndex = 0;
    const estTotalPages = Math.max(1, Math.ceil(canvasHeight / sliceHeightPx));

    while (currentY < canvasHeight) {
      const remaining = canvasHeight - currentY;
      let nextCutY;
      if (remaining <= sliceHeightPx) {
        nextCutY = canvasHeight;
      } else {
        const idealCut = currentY + sliceHeightPx;
        const minCut = currentY + Math.floor(sliceHeightPx * 0.65);
        nextCutY = findSafeCutRow(srcCtx, canvasWidth, idealCut, minCut, canvasHeight);
      }

      const currentSliceH = Math.max(1, nextCutY - currentY);
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvasWidth;
      pageCanvas.height = currentSliceH;

      const pctx = pageCanvas.getContext('2d');
      pctx.fillStyle = '#ffffff';
      pctx.fillRect(0, 0, canvasWidth, currentSliceH);
      pctx.drawImage(canvas, 0, currentY, canvasWidth, currentSliceH, 0, 0, canvasWidth, currentSliceH);

      slices.push({
        dataUrl: pageCanvas.toDataURL('image/jpeg', 0.92),
        width: canvasWidth,
        height: currentSliceH,
        sliceHeightPx,
        isSingleScreen: false
      });

      currentY = nextCutY;
      pageIndex++;
      onProgress(pageIndex, Math.max(pageIndex, estTotalPages));
    }

    return slices;
  }

  // Motor OpenXML / DOCX Nativo de Alta Fidelidad
  function makeCrcTable() {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c;
    }
    return table;
  }
  const _crcTable = makeCrcTable();

  function crc32(uint8Array) {
    let crc = 0 ^ (-1);
    for (let i = 0; i < uint8Array.length; i++) {
      crc = (crc >>> 8) ^ _crcTable[(crc ^ uint8Array[i]) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
  }

  class SimpleZip {
    constructor() {
      this.files = [];
    }
    addFile(path, data) {
      let bytes;
      if (typeof data === 'string') {
        bytes = new TextEncoder().encode(data);
      } else if (data instanceof Uint8Array) {
        bytes = data;
      } else if (data instanceof ArrayBuffer) {
        bytes = new Uint8Array(data);
      } else {
        bytes = new Uint8Array(data);
      }
      this.files.push({ path, bytes, crc: crc32(bytes) });
    }
    build() {
      const textEncoder = new TextEncoder();
      const localHeaders = [];
      const cdHeaders = [];
      let offset = 0;

      for (const f of this.files) {
        const nameBytes = textEncoder.encode(f.path);
        const localH = new Uint8Array(30 + nameBytes.length);
        const lView = new DataView(localH.buffer);
        lView.setUint32(0, 0x04034b50, true);
        lView.setUint16(4, 20, true);
        lView.setUint16(6, 0, true);
        lView.setUint16(8, 0, true);
        lView.setUint16(10, 0, true);
        lView.setUint16(12, 0, true);
        lView.setUint32(14, f.crc, true);
        lView.setUint32(18, f.bytes.length, true);
        lView.setUint32(22, f.bytes.length, true);
        lView.setUint16(26, nameBytes.length, true);
        lView.setUint16(28, 0, true);
        localH.set(nameBytes, 30);

        const cdH = new Uint8Array(46 + nameBytes.length);
        const cView = new DataView(cdH.buffer);
        cView.setUint32(0, 0x02014b50, true);
        cView.setUint16(4, 20, true);
        cView.setUint16(6, 20, true);
        cView.setUint16(8, 0, true);
        cView.setUint16(10, 0, true);
        cView.setUint16(12, 0, true);
        cView.setUint16(14, 0, true);
        cView.setUint32(16, f.crc, true);
        cView.setUint32(20, f.bytes.length, true);
        cView.setUint32(24, f.bytes.length, true);
        cView.setUint16(28, nameBytes.length, true);
        cView.setUint16(30, 0, true);
        cView.setUint16(32, 0, true);
        cView.setUint16(34, 0, true);
        cView.setUint16(36, 0, true);
        cView.setUint32(38, 0, true);
        cView.setUint32(42, offset, true);
        cdH.set(nameBytes, 46);

        localHeaders.push(localH, f.bytes);
        cdHeaders.push(cdH);
        offset += localH.length + f.bytes.length;
      }

      const cdOffset = offset;
      let cdSize = 0;
      for (const cd of cdHeaders) cdSize += cd.length;

      const eocd = new Uint8Array(22);
      const eView = new DataView(eocd.buffer);
      eView.setUint32(0, 0x06054b50, true);
      eView.setUint16(4, 0, true);
      eView.setUint16(6, 0, true);
      eView.setUint16(8, this.files.length, true);
      eView.setUint16(10, this.files.length, true);
      eView.setUint32(12, cdSize, true);
      eView.setUint32(16, cdOffset, true);
      eView.setUint16(20, 0, true);

      const totalSize = offset + cdSize + 22;
      const finalZip = new Uint8Array(totalSize);
      let cur = 0;
      for (const part of [...localHeaders, ...cdHeaders, eocd]) {
        finalZip.set(part, cur);
        cur += part.length;
      }

      return finalZip;
    }
  }

  function escapeXml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  function isNodeRedacted(el) {
    if (!el || !el.closest) return false;
    return Boolean(
      el.hasAttribute('data-bwd-redacted') ||
      el.classList.contains('bwd-redacted-box') ||
      el.classList.contains('bwd-redacted-blur') ||
      el.classList.contains('bwd-redacted-mask') ||
      el.closest('[data-bwd-redacted], .bwd-redacted-box, .bwd-redacted-blur, .bwd-redacted-mask')
    );
  }

  function extractCleanRedactedText(el) {
    if (!el) return '';
    if (isNodeRedacted(el)) return '';
    const clone = el.cloneNode(true);
    clone.querySelectorAll('[data-bwd-redacted], .bwd-redacted-box, .bwd-redacted-blur, .bwd-redacted-mask').forEach(red => {
      red.textContent = '[CENSURADO]';
    });
    return (clone.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function extractEditorTextBlocks(frameDoc) {
    const textBlocks = [];
    if (!frameDoc || !frameDoc.body) return textBlocks;

    const win = cloneFrame.contentWindow || window;
    const walker = frameDoc.createTreeWalker(frameDoc.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.textContent || !node.textContent.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (isNodeRedacted(parent)) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName.toLowerCase();
        if (['script', 'style', 'noscript', 'svg', 'canvas', 'template'].includes(tag)) {
          return NodeFilter.FILTER_REJECT;
        }
        const s = win.getComputedStyle(parent);
        if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const range = frameDoc.createRange();
    let tNode;
    const sX = win.scrollX || win.pageXOffset || 0;
    const sY = win.scrollY || win.pageYOffset || 0;

    while ((tNode = walker.nextNode())) {
      const clean = tNode.textContent.replace(/\s+/g, ' ').trim();
      if (!clean) continue;

      const parent = tNode.parentElement;
      const style = win.getComputedStyle(parent);
      const fSize = parseFloat(style.fontSize) || 14;

      try {
        range.selectNodeContents(tNode);
        const rawRects = Array.from(range.getClientRects()).filter(r => r.width > 2 && r.height > 2);
        if (rawRects.length === 1) {
          const r = rawRects[0];
          textBlocks.push({
            text: clean,
            x: Math.round(r.left + sX),
            y: Math.round(r.top + sY),
            width: Math.round(r.width),
            height: Math.round(r.height),
            fontSize: Math.round(fSize)
          });
        } else if (rawRects.length > 1) {
          const totalRectW = rawRects.reduce((acc, r) => acc + r.width, 0) || 1;
          const words = clean.split(' ');
          let wordIdx = 0;

          rawRects.forEach((r, idx) => {
            if (wordIdx >= words.length) return;
            let chunkWords;
            if (idx === rawRects.length - 1) {
              chunkWords = words.slice(wordIdx);
              wordIdx = words.length;
            } else {
              const targetCount = Math.max(1, Math.round((r.width / totalRectW) * words.length));
              chunkWords = words.slice(wordIdx, wordIdx + targetCount);
              wordIdx += targetCount;
            }
            const lineText = chunkWords.join(' ').trim();
            if (lineText) {
              textBlocks.push({
                text: lineText,
                x: Math.round(r.left + sX),
                y: Math.round(r.top + sY),
                width: Math.round(r.width),
                height: Math.round(r.height),
                fontSize: Math.round(fSize)
              });
            }
          });
        }
      } catch (_) { }
    }
    return textBlocks;
  }

  function extractEditorStructuredItems(frameDoc) {
    const structuredItems = [];
    if (!frameDoc || !frameDoc.body) return structuredItems;

    const win = cloneFrame.contentWindow || window;
    const selectors = 'h1, h2, h3, h4, h5, h6, p, blockquote, ul, ol, table, pre';
    const elements = frameDoc.querySelectorAll(selectors);

    elements.forEach(el => {
      if (isNodeRedacted(el)) return;
      const s = win.getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return;

      if (el.closest('table') && el.tagName.toLowerCase() !== 'table') return;
      if (el.closest('ul, ol') && !['ul', 'ol'].includes(el.tagName.toLowerCase())) return;

      const tag = el.tagName.toLowerCase();

      if (tag.startsWith('h')) {
        const level = parseInt(tag[1], 10) || 1;
        const text = extractCleanRedactedText(el);
        if (text) structuredItems.push({ type: 'heading', level, text });
      } else if (tag === 'p') {
        const text = extractCleanRedactedText(el);
        if (text) structuredItems.push({ type: 'paragraph', text });
      } else if (tag === 'blockquote') {
        const text = extractCleanRedactedText(el);
        if (text) structuredItems.push({ type: 'quote', text });
      } else if (tag === 'ul' || tag === 'ol') {
        const liTexts = [];
        el.querySelectorAll(':scope > li').forEach(li => {
          if (isNodeRedacted(li)) return;
          const t = extractCleanRedactedText(li);
          if (t) liTexts.push(t);
        });
        if (liTexts.length > 0) {
          structuredItems.push({ type: 'list', isOrdered: tag === 'ol', items: liTexts });
        }
      } else if (tag === 'table') {
        const rows = [];
        el.querySelectorAll('tr').forEach(tr => {
          const cells = [];
          tr.querySelectorAll('th, td').forEach(td => {
            const cellText = isNodeRedacted(td) ? '[CENSURADO]' : extractCleanRedactedText(td);
            cells.push({
              text: cellText,
              isHeader: td.tagName.toLowerCase() === 'th'
            });
          });
          if (cells.length > 0) rows.push(cells);
        });
        if (rows.length > 0) structuredItems.push({ type: 'table', rows });
      } else if (tag === 'pre') {
        const text = extractCleanRedactedText(el);
        if (text) structuredItems.push({ type: 'code', text });
      }
    });

    if (structuredItems.length < 2) {
      frameDoc.body.querySelectorAll('div, section, article').forEach(div => {
        if (isNodeRedacted(div)) return;
        if (div.querySelector('div, p, table, ul, ol, h1, h2, h3, h4')) return;
        const t = extractCleanRedactedText(div);
        if (t && t.length >= 12) {
          structuredItems.push({ type: 'paragraph', text: t });
        }
      });
    }

    return structuredItems;
  }

  function buildDocx(slices, isLandscape = false, structuredItems = []) {
    const zip = new SimpleZip();

    let relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n`;
    let bodyXml = '';

    const maxW = isLandscape ? 10234800 : 7102800;
    const maxH = isLandscape ? 7102800 : 10234800;

    slices.forEach((slice, idx) => {
      const rId = `rId${idx + 1}`;
      const imgName = `image${idx + 1}.jpeg`;

      let imgBytes = slice.bytes;
      if (!imgBytes && slice.dataUrl) {
        const b64 = slice.dataUrl.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
        const binary = atob(b64);
        imgBytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          imgBytes[i] = binary.charCodeAt(i);
        }
      }

      zip.addFile(`word/media/${imgName}`, imgBytes);

      relsXml += `  <Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imgName}"/>\n`;

      const scale = Math.min(maxW / slice.width, maxH / slice.height);
      const widthEmu = Math.round(slice.width * scale);
      const heightEmu = Math.round(slice.height * scale);

      const pageBreakXml = idx > 0 ? '<w:pageBreakBefore/>' : '';

      bodyXml += `
      <w:p>
        <w:pPr>
          ${pageBreakXml}
          <w:jc w:val="center"/>
          <w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>
        </w:pPr>
        <w:r>
          <w:drawing>
            <wp:inline distT="0" distB="0" distL="0" distR="0">
              <wp:extent cx="${widthEmu}" cy="${heightEmu}"/>
              <wp:effectExtent l="0" t="0" r="0" b="0"/>
              <wp:docPr id="${idx + 1}" name="Página ${idx + 1}"/>
              <wp:cNvGraphicFramePr>
                <a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>
              </wp:cNvGraphicFramePr>
              <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
                <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                    <pic:nvPicPr>
                      <pic:cNvPr id="${idx + 1}" name="${imgName}"/>
                      <pic:cNvPicPr/>
                    </pic:nvPicPr>
                    <pic:blipFill>
                      <a:blip r:embed="${rId}"/>
                      <a:stretch><a:fillRect/></a:stretch>
                    </pic:blipFill>
                    <pic:spPr>
                      <a:xfrm>
                        <a:off x="0" y="0"/>
                        <a:ext cx="${widthEmu}" cy="${heightEmu}"/>
                      </a:xfrm>
                      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                    </pic:spPr>
                  </pic:pic>
                </a:graphicData>
              </a:graphicData>
            </wp:inline>
          </w:drawing>
        </w:r>
      </w:p>`;
    });

    relsXml += `</Relationships>`;

    // Incrustar sección de texto editable y estructurado (OCR / DOM Nativo)
    if (structuredItems && structuredItems.length > 0) {
      if (slices && slices.length > 0) {
        bodyXml += `
      <w:p>
        <w:pPr>
          <w:pageBreakBefore/>
          <w:spacing w:before="240" w:after="140"/>
        </w:pPr>
        <w:r>
          <w:rPr>
            <w:b/>
            <w:sz w:val="32"/>
            <w:color w:val="2563EB"/>
          </w:rPr>
          <w:t xml:space="preserve">Contenido y Texto Editable del Documento</w:t>
        </w:r>
      </w:p>`;
      }

      structuredItems.forEach(item => {
        if (item.type === 'heading') {
          const sz = item.level === 1 ? '34' : item.level === 2 ? '28' : '24';
          const color = item.level === 1 ? '0F172A' : item.level === 2 ? '1E293B' : '334155';
          const spBefore = item.level === 1 ? '260' : '200';
          bodyXml += `
          <w:p>
            <w:pPr>
              <w:spacing w:before="${spBefore}" w:after="100"/>
            </w:pPr>
            <w:r>
              <w:rPr>
                <w:b/>
                <w:sz w:val="${sz}"/>
                <w:color w:val="${color}"/>
              </w:rPr>
              <w:t xml:space="preserve">${escapeXml(item.text)}</w:t>
            </w:r>
          </w:p>`;
        } else if (item.type === 'paragraph') {
          bodyXml += `
          <w:p>
            <w:pPr>
              <w:spacing w:before="60" w:after="120" w:line="276" w:lineRule="auto"/>
            </w:pPr>
            <w:r>
              <w:rPr>
                <w:sz w:val="22"/>
                <w:color w:val="334155"/>
              </w:rPr>
              <w:t xml:space="preserve">${escapeXml(item.text)}</w:t>
            </w:r>
          </w:p>`;
        } else if (item.type === 'quote') {
          bodyXml += `
          <w:p>
            <w:pPr>
              <w:spacing w:before="120" w:after="120"/>
              <w:ind w:left="400"/>
            </w:pPr>
            <w:r>
              <w:rPr>
                <w:i/>
                <w:sz w:val="22"/>
                <w:color w:val="64748B"/>
              </w:rPr>
              <w:t xml:space="preserve">${escapeXml(item.text)}</w:t>
            </w:r>
          </w:p>`;
        } else if (item.type === 'list') {
          (item.items || []).forEach((liText, liIdx) => {
            const bullet = item.isOrdered ? `${liIdx + 1}. ` : '•  ';
            bodyXml += `
            <w:p>
              <w:pPr>
                <w:spacing w:before="40" w:after="40"/>
                <w:ind w:left="360"/>
              </w:pPr>
              <w:r>
                <w:rPr>
                  <w:sz w:val="22"/>
                  <w:color w:val="334155"/>
                </w:rPr>
                <w:t xml:space="preserve">${escapeXml(bullet + liText)}</w:t>
              </w:r>
            </w:p>`;
          });
        } else if (item.type === 'table') {
          bodyXml += `
          <w:tbl>
            <w:tblPr>
              <w:tblW w:w="0" w:type="auto"/>
              <w:tblBorders>
                <w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
                <w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
                <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
                <w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
                <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
                <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
              </w:tblBorders>
            </w:tblPr>`;
          (item.rows || []).forEach(row => {
            bodyXml += `<w:tr>`;
            row.forEach(cell => {
              const isH = cell.isHeader;
              bodyXml += `
              <w:tc>
                <w:tcPr>
                  <w:tcW w:w="0" w:type="auto"/>
                  <w:tcMar><w:top w:w="120"/><w:bottom w:w="120"/><w:left w:w="160"/><w:right w:w="160"/></w:tcMar>
                  ${isH ? '<w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>' : ''}
                </w:tcPr>
                <w:p>
                  <w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>
                  <w:r>
                    <w:rPr>
                      ${isH ? '<w:b/>' : ''}
                      <w:sz w:val="20"/>
                      <w:color w:val="${isH ? '0F172A' : '334155'}"/>
                    </w:rPr>
                    <w:t xml:space="preserve">${escapeXml(cell.text)}</w:t>
                  </w:r>
                </w:p>
              </w:tc>`;
            });
            bodyXml += `</w:tr>`;
          });
          bodyXml += `</w:tbl>`;
        } else if (item.type === 'code') {
          bodyXml += `
          <w:p>
            <w:pPr>
              <w:spacing w:before="80" w:after="80"/>
              <w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/>
            </w:pPr>
            <w:r>
              <w:rPr>
                <w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>
                <w:sz w:val="20"/>
                <w:color w:val="0F172A"/>
              </w:rPr>
              <w:t xml:space="preserve">${escapeXml(item.text)}</w:t>
            </w:r>
          </w:p>`;
        }
      });
    }

    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="${isLandscape ? 16838 : 11906}" w:h="${isLandscape ? 11906 : 16838}" w:orient="${isLandscape ? 'landscape' : 'portrait'}"/>
      <w:pgMar w:top="360" w:right="360" w:bottom="360" w:left="360" w:header="0" w:footer="0" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

    zip.addFile('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

    zip.addFile('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

    zip.addFile('word/_rels/document.xml.rels', relsXml);
    zip.addFile('word/document.xml', docXml);

    return zip.build();
  }

  // A. Descargar PDF Fiel (1 Página Continua o A4 Paginado + OCR Multi-línea + Carpeta PDFs/)
  btnEditorPdf.addEventListener('click', async () => {
    try {
      showExportModal("Generando PDF Fiel con tus ediciones...", "Iniciando captura sin distorsión...", 15);

      const canvas = await captureEditorCanvas((msg, pct) => showExportModal("Generando PDF Fiel...", msg, pct));
      const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
      const { isDark, bgR, bgG, bgB, bgColor } = detectPageTheme(frameDoc);
      const { jsPDF } = window.jspdf;

      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const effectiveMode = pdfPageMode === 'a4' ? 'a4' : 'continuous';

      let pdf;
      if (effectiveMode === 'a4') {
        showExportModal("Compilando PDF A4 Paginado...", "Dividiendo páginas sin cortar renglones...", 72);
        const a4Slices = sliceCanvasForA4(canvas);
        pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
        const pageW = 210;
        const pageH = 297;
        const margin = 8;
        const usableW = pageW - margin * 2;
        const usableH = pageH - margin * 2;

        a4Slices.forEach((sl, idx) => {
          if (idx > 0) pdf.addPage('a4', 'portrait');
          const ratio = Math.min(usableW / sl.width, usableH / sl.height);
          const drawW = sl.width * ratio;
          const drawH = sl.height * ratio;
          const offsetX = (pageW - drawW) / 2;
          pdf.addImage(sl.dataUrl, 'JPEG', offsetX, margin, drawW, drawH, undefined, 'FAST');
        });
      } else {
        showExportModal("Compilando archivo PDF...", "Generando página continua sin bordes ni saltos...", 75);
        // Mantener 1 sola página continua de borde a borde; escalar únicamente la unidad lógica si supera 14000pt (conservando 100% de píxeles HD)
        const unitScale = canvasHeight > 14000 ? (14000 / canvasHeight) : 1;
        const pdfW = Math.max(1, Math.round(canvasWidth * unitScale));
        const pdfH = Math.max(1, Math.round(canvasHeight * unitScale));
        const isLandscape = pdfW > pdfH;

        pdf = new jsPDF({
          orientation: isLandscape ? 'landscape' : 'portrait',
          unit: 'px',
          format: [pdfW, pdfH],
          hotfixes: ['px_scaling'],
          compress: true
        });

        if (isDark) {
          pdf.setFillColor(bgR, bgG, bgB);
          pdf.rect(0, 0, pdfW, pdfH, 'F');
        }

        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = canvasWidth;
        exportCanvas.height = canvasHeight;
        const ectx = exportCanvas.getContext('2d');
        ectx.fillStyle = bgColor || (isDark ? `rgb(${bgR},${bgG},${bgB})` : '#ffffff');
        ectx.fillRect(0, 0, canvasWidth, canvasHeight);
        ectx.drawImage(canvas, 0, 0);

        const imgData = exportCanvas.toDataURL('image/jpeg', 0.94);
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH, undefined, 'FAST');

        const textBlocks = extractEditorTextBlocks(frameDoc);
        if (textBlocks && textBlocks.length > 0) {
          showExportModal("Compilando archivo PDF...", "Incrustando capa de texto seleccionable multi-línea...", 90);
          const docEl = frameDoc.documentElement;
          const bEl = frameDoc.body;
          const fullW = Math.max(bEl ? bEl.scrollWidth : 0, docEl ? docEl.scrollWidth : 0, docEl ? docEl.clientWidth : 0, 1);
          const fullH = Math.max(bEl ? bEl.scrollHeight : 0, docEl ? docEl.scrollHeight : 0, docEl ? docEl.clientHeight : 0, 1);
          const scaleX = pdfW / fullW;
          const scaleY = pdfH / fullH;

          for (const tb of textBlocks) {
            if (!tb.text) continue;
            const posX = Math.round(tb.x * scaleX);
            const posY = Math.round(tb.y * scaleY);
            const fSize = Math.max(6, Math.min(72, Math.round(tb.fontSize * scaleY)));
            try {
              pdf.setFontSize(fSize);
              pdf.text(tb.text, posX, posY, {
                baseline: 'top',
                renderingMode: 'invisible'
              });
            } catch (_) { }
          }
        }
      }

      showExportModal("Compilando archivo PDF...", "Guardando en carpeta PDFs...", 96);
      // Enlaces cliqueables reales solo en modo continuo (paridad con el panel Exportar)
      if (effectiveMode !== 'a4') {
        try {
          const fWin = cloneFrame.contentWindow || window;
          const dEl = frameDoc.documentElement;
          const bdy = frameDoc.body;
          const pageSize = pdf.internal.pageSize;
          const pW = pageSize.getWidth();
          const pH = pageSize.getHeight();
          const linkFullW = Math.max(bdy ? bdy.scrollWidth : 0, dEl ? dEl.scrollWidth : 0, dEl ? dEl.clientWidth : 0, 1);
          const linkFullH = Math.max(bdy ? bdy.scrollHeight : 0, dEl ? dEl.scrollHeight : 0, dEl ? dEl.clientHeight : 0, 1);
          const lsX = pW / linkFullW;
          const lsY = pH / linkFullH;
          const scX = fWin.scrollX || 0;
          const scY = fWin.scrollY || 0;
          const linkBase = frameDoc.baseURI || (cloneData && (cloneData.baseURI || cloneData.url)) || '';
          frameDoc.querySelectorAll('a[href]').forEach(a => {
            if (isNodeRedacted(a)) return;
            const raw = (a.getAttribute('href') || '').trim();
            if (!raw || raw.startsWith('#') || raw.startsWith('javascript:')) return;
            let abs = '';
            try { abs = new URL(raw, linkBase).href; } catch (_) { return; }
            if (!/^https?:|^mailto:/i.test(abs)) return;
            Array.from(a.getClientRects()).forEach(r => {
              if (r.width < 4 || r.height < 4) return;
              try {
                pdf.link((r.left + scX) * lsX, (r.top + scY) * lsY, Math.max(2, r.width * lsX), Math.max(2, r.height * lsY), { url: abs });
              } catch (_) {}
            });
          });
        } catch (_) {}
      }
      const filename = sanitizeName(cloneData ? cloneData.title : 'documento_editado', 'pdf');
      const pdfBlob = pdf.output('blob');
      await triggerDownloadBlob(pdfBlob, filename);

      hideExportModal();
      showToast(`¡PDF descargado con éxito! (${filename})`);
      setTool(activeTool);

    } catch (err) {
      console.error("Error al exportar PDF:", err);
      hideExportModal();
      showToast(`Error al exportar el PDF: ${err.message || err}`, true);
      setTool(activeTool);
    }
  });

  // B. Exportar a Word (.docx con modos Híbrido, Solo Editable o Solo Visual + corte inteligente sin fugas)
  btnEditorDocx.addEventListener('click', async () => {
    try {
      commitActiveTextEdit();
      closeImagePopover();
      clearInspectorHover();

      const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
      const title = (cloneData && cloneData.title) ? cloneData.title : 'Documento Web Editado';
      let slices = [];
      let isLandscape = false;

      if (docxExportMode !== 'editable') {
        showExportModal("Generando documento Word (.docx)...", "Iniciando captura de alta fidelidad...", 18);
        const canvas = await captureEditorCanvas((msg, pct) => showExportModal("Generando documento Word...", msg, pct));
        isLandscape = canvas.width >= canvas.height && (canvas.height <= canvas.width * 0.8);

        showExportModal("Compilando documento Word...", "Dividiendo páginas sin cortar renglones...", 68);
        slices = sliceCanvasForA4(canvas, (current, total) => {
          const pct = Math.min(90, 68 + Math.round((current / total) * 20));
          showExportModal("Compilando documento Word...", `Generando página ${current} de ${total}...`, pct);
        });
      } else {
        showExportModal("Generando Word Editable...", "Extrayendo estructura semántica limpia...", 55);
      }

      const structuredItems = docxExportMode === 'visual' ? [] : extractEditorStructuredItems(frameDoc);
      if (docxExportMode === 'editable' && structuredItems.length === 0) {
        structuredItems.push({ type: 'paragraph', text: extractCleanRedactedText(frameDoc.body) || title });
      }

      showExportModal("Empaquetando documento Word...", "Generando paquete OpenXML (.docx)...", 94);
      const docxUint8 = buildDocx(slices, isLandscape, structuredItems);

      const blob = new Blob([docxUint8], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      const filename = sanitizeName(title, 'docx');

      await triggerDownloadBlob(blob, filename);

      hideExportModal();
      showToast(`¡Documento Word (.docx) guardado con éxito! (${filename})`);
      setTool(activeTool);

    } catch (err) {
      console.error("Error al exportar Word (.docx):", err);
      hideExportModal();
      showToast(`Error al exportar a Word: ${err.message || err}`, true);
      setTool(activeTool);
    }
  });

  // C. Descargar PNG HD
  btnEditorPng.addEventListener('click', async () => {
    try {
      showExportModal("Generando imagen PNG HD...", "Iniciando renderizado fiel...", 25);

      const canvas = await captureEditorCanvas((msg, pct) => showExportModal("Generando imagen PNG HD...", msg, pct));
      const filename = sanitizeName(cloneData ? cloneData.title : 'captura_editada', 'png');

      await new Promise((resolve) => {
        canvas.toBlob(async (blob) => {
          if (blob) {
            await triggerDownloadBlob(blob, filename);
          } else {
            const dataUrl = canvas.toDataURL('image/png');
            await triggerDownloadUrl(dataUrl, filename);
          }
          resolve();
        }, 'image/png');
      });

      hideExportModal();
      showToast(`¡Captura PNG guardada! (${filename})`);
      setTool(activeTool);

    } catch (err) {
      console.error("Error al exportar PNG:", err);
      hideExportModal();
      showToast(`Error al exportar captura PNG: ${err.message || err}`, true);
      setTool(activeTool);
    }
  });

  // D. Descargar HTML Editado (100% Offline real con CSS incrustado + Purgado de secretos censurados)
  if (btnEditorHtml) {
    btnEditorHtml.addEventListener('click', async () => {
      try {
        commitActiveTextEdit();
        closeImagePopover();
        clearInspectorHover();

        showExportModal("Generando HTML 100% Offline...", "Incrustando imágenes en el documento...", 20);

        const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
        if (!frameDoc || !frameDoc.documentElement) {
          throw new Error("No se pudo acceder al contenido del documento.");
        }

        await inlineAllImages(frameDoc, (msg, pct) => showExportModal("Generando HTML Offline...", msg, pct));

        showExportModal("Generando HTML Offline...", "Incrustando hojas de estilo externas y purgando censuras...", 65);

        const clonedDoc = frameDoc.documentElement.cloneNode(true);
        const baseHref = (cloneData && (cloneData.baseURI || cloneData.url)) || frameDoc.baseURI || window.location.href;

        // 1. Descargar e incrustar hojas de estilo externas (<link rel="stylesheet">) para lectura sin internet
        const styleLinks = Array.from(clonedDoc.querySelectorAll('link[rel="stylesheet"]'));
        await Promise.all(styleLinks.map(async (linkEl) => {
          const href = linkEl.getAttribute('href');
          if (!href) return;
          try {
            const absCssUrl = new URL(href, baseHref).href;
            if (!absCssUrl.startsWith('http')) return;
            const resp = await fetch(absCssUrl);
            if (!resp.ok) return;
            let cssText = await resp.text();
            cssText = cssText.replace(/url\((['"]?)(?!data:|http|#)([^)'"]+)\1\)/gi, (_, q, relPath) => {
              try { return `url("${new URL(relPath, absCssUrl).href}")`; } catch (__) { return `url("${relPath}")`; }
            });
            const inlineStyle = frameDoc.createElement('style');
            inlineStyle.textContent = cssText;
            linkEl.replaceWith(inlineStyle);
          } catch (_) { }
        }));

        // 2. Remover atributos y CSS internos exclusivos del editor
        clonedDoc.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
        clonedDoc.querySelectorAll('[data-bwd-hovered]').forEach(el => el.removeAttribute('data-bwd-hovered'));
        clonedDoc.removeAttribute('data-bwd-tool');
        const bodyEl = clonedDoc.querySelector('body');
        if (bodyEl) bodyEl.removeAttribute('data-bwd-tool');

        const internalCss = clonedDoc.querySelector('#bwd-editor-internal-css');
        if (internalCss) internalCss.remove();

        // 3. PURGA CRÍTICA DE PRIVACIDAD: Sobrescribir el texto real y atributos sensibles dentro de nodos censurados
        clonedDoc.querySelectorAll('[data-bwd-redacted], .bwd-redacted-box, .bwd-redacted-blur, .bwd-redacted-mask').forEach(redEl => {
          redEl.removeAttribute('data-bwd-orig-text');
          redEl.removeAttribute('title');
          redEl.removeAttribute('aria-label');
          if (redEl.tagName === 'A') redEl.removeAttribute('href');
          if (redEl.tagName === 'IMG') {
            redEl.setAttribute('alt', 'censurado');
          } else {
            const len = Math.max(6, Math.min(24, (redEl.textContent || '').trim().length || 8));
            const mode = redEl.getAttribute('data-bwd-redacted') || (redEl.classList.contains('bwd-redacted-mask') ? 'mask' : 'solid');
            redEl.textContent = mode === 'mask' ? '•'.repeat(len) : '█'.repeat(len);
          }
        });

        // 4. Inyectar estilo limpio de censura para el archivo exportado
        const censorStyle = frameDoc.createElement('style');
        censorStyle.id = 'bwd-censor-style';
        censorStyle.textContent = `
          .bwd-redacted-box { background-color: #0f172a !important; color: transparent !important; user-select: none !important; border-radius: 3px !important; border: 1px solid rgba(148,163,184,0.32) !important; }
          .bwd-redacted-blur { filter: blur(8px) !important; user-select: none !important; }
          .bwd-redacted-mask { font-family: ui-monospace, monospace !important; user-select: none !important; }
        `;
        const headEl = clonedDoc.querySelector('head') || clonedDoc;
        headEl.appendChild(censorStyle);

        // 5. Convertir enlaces relativos a absolutos (respetando anclas # locales) y retirar <base>
        clonedDoc.querySelectorAll('a[href]').forEach(a => {
          const h = a.getAttribute('href') || '';
          if (h && !h.startsWith('#') && !h.startsWith('javascript:') && !h.startsWith('mailto:') && !h.startsWith('tel:')) {
            try { a.setAttribute('href', new URL(h, baseHref).href); } catch (_) { }
          }
        });
        clonedDoc.querySelectorAll('base').forEach(b => b.remove());

        showExportModal("Generando HTML Offline...", "Empaquetando archivo final...", 90);

        const finalHtml = '<!DOCTYPE html>\n' + clonedDoc.outerHTML;
        const blob = new Blob([finalHtml], { type: 'text/html;charset=utf-8' });
        const filename = sanitizeName(cloneData ? cloneData.title : 'documento_editado', 'html');

        await triggerDownloadBlob(blob, filename);

        hideExportModal();
        showToast(`¡HTML offline guardado con éxito! (${filename})`);
        setTool(activeTool);

      } catch (err) {
        console.error("Error al exportar HTML:", err);
        hideExportModal();
        showToast(`Error al exportar HTML: ${err.message || err}`, true);
        setTool(activeTool);
      }
    });
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------
  function canvasHeight(c) {
    return c.height || 1;
  }

  function sanitizeName(name, ext) {
    const clean = (name || 'documento')
      .normalize('NFC')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 55);
    return `${clean || 'documento'}_editado.${ext}`;
  }

  function getOrganizedPath(filename) {
    if (!filename) return filename;
    if (filename.includes('/') || filename.includes('\\')) return filename;
    const ext = (filename.split('.').pop() || '').toLowerCase();
    let folder = '';
    switch (ext) {
      case 'pdf': folder = 'PDFs'; break;
      case 'doc': case 'docx': case 'rtf': case 'odt': case 'txt': folder = 'Documentos'; break;
      case 'png': case 'jpg': case 'jpeg': case 'webp': case 'svg': folder = 'Imágenes'; break;
      case 'html': case 'htm': case 'json': case 'xml': folder = 'Código'; break;
      case 'zip': case 'rar': case '7z': case 'tar': case 'gz': folder = 'Comprimidos'; break;
      default: folder = '';
    }
    return folder ? `${folder}/${filename}` : filename;
  }

  async function triggerDownloadBlob(blob, filename) {
    const targetFilename = getOrganizedPath(filename);
    const api = typeof browser !== 'undefined' ? browser : chrome;
    const url = URL.createObjectURL(blob);

    if (api && api.downloads && api.downloads.download) {
      try {
        await api.downloads.download({
          url: url,
          filename: targetFilename,
          saveAs: false
        });
        setTimeout(() => URL.revokeObjectURL(url), 15000);
        return;
      } catch (e) {
        console.warn("Error en api.downloads, usando fallback a <a>:", e);
      }
    }
    triggerDownloadUrl(url, targetFilename);
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  async function triggerDownloadUrl(url, filename) {
    const targetFilename = getOrganizedPath(filename);
    const api = typeof browser !== 'undefined' ? browser : chrome;
    if (api && api.downloads && api.downloads.download && !url.startsWith('blob:')) {
      try {
        await api.downloads.download({
          url: url,
          filename: targetFilename,
          saveAs: false
        });
        return;
      } catch (e) {
        console.warn("Error en api.downloads, usando fallback a <a>:", e);
      }
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = targetFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

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
