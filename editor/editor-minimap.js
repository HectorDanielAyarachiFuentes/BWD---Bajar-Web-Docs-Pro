/**
 * ============================================================================
 * Webs-Docs — Controlador del Panel Izquierdo en Tiempo Real (editor-minimap.js)
 * Minimapa en vivo, lente radar, cajas fantasma de borrados y bitácora interactiva.
 * ============================================================================
 */
(function (global) {
  'use strict';

  function createEditorMinimapController(ctx) {
    const {
      cloneFrame,
      undoStack,
      redoStack,
      getChangesCount,
      setChangesCount,
      commitActiveTextEdit,
      closeImagePopover,
      clearInspectorHover,
      applyHistoryAction,
      updateHistoryUI
    } = ctx;

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
          kind: 'edit', badge: 'EDITADO',
          target: describeElementShort(action.element),
          snippet: txt ? `✏️ "${txt.slice(0, 48)}${txt.length > 48 ? '…' : ''}"` : 'Texto modificado',
          ...geo
        };
      } else if (action.type === 'image_edit' && action.element) {
        const geo = captureElementDocGeometry(action.element);
        action.meta = { kind: 'edit', badge: 'IMAGEN', target: describeElementShort(action.element), snippet: '🖼️ Imagen reemplazada o ajustada', ...geo };
      } else if (action.type === 'redact' && action.record && action.record.element) {
        const el = action.record.element;
        const geo = captureElementDocGeometry(el);
        action.meta = {
          kind: 'redact', badge: 'CENSURA',
          target: describeElementShort(el),
          snippet: action.record.isImage ? '🔒 Imagen / avatar censurado' : '🔒 Dato confidencial oculto',
          ...geo
        };
      } else if (action.type === 'batch_redact') {
        const total = (action.records ? action.records.length : 0) + (action.wrappedSpans ? action.wrappedSpans.length : 0);
        const firstEl = (action.records && action.records[0] && action.records[0].element) || (action.wrappedSpans && action.wrappedSpans[0]);
        const geo = firstEl ? captureElementDocGeometry(firstEl) : { docX: 0, docY: 80, docW: 300, docH: 40 };
        action.meta = { kind: 'redact', badge: 'AUTO-CENSURA', target: `${total} datos`, snippet: `🔒 ${total} emails, montos o perfiles protegidos`, ...geo };
      } else if (action.type === 'batch_delete') {
        const count = action.items ? action.items.length : 1;
        const firstGeo = (action.ghostRects && action.ghostRects[0]) || { docX: 0, docY: 0, docW: 400, docH: 80 };
        action.meta = { kind: 'clean', badge: 'LIMPIEZA', target: `${count} bloques`, snippet: `✨ ${count} anuncios, banners o barras quitados`, ...firstGeo };
      } else if (action.type === 'full_reorganize') {
        action.meta = { kind: 'clean', badge: 'LECTURA', target: 'article', snippet: '📖 Reacomodado editorial Readability', docX: 0, docY: 0, docW: 800, docH: 120 };
      }
    }

    function syncMinimapLens() {
      if (!livePreviewSidebar || livePreviewSidebar.classList.contains('is-collapsed')) return;
      const frameDoc = cloneFrame.contentDocument || (cloneFrame.contentWindow && cloneFrame.contentWindow.document);
      const win = cloneFrame.contentWindow;
      if (!frameDoc || !frameDoc.body || !win || !minimapLens || !minimapStage) return;

      const docH = Math.max(frameDoc.body.scrollHeight || 0, frameDoc.documentElement ? frameDoc.documentElement.scrollHeight : 0, win.innerHeight || 600);
      const stageH = Math.max(160, Math.round(docH * minimapScale));
      const scrollY = Math.max(0, win.scrollY || win.pageYOffset || 0);
      const viewH = win.innerHeight || 600;

      const lensTop = Math.min(stageH - 14, Math.max(0, Math.round(scrollY * minimapScale)));
      const lensH = Math.max(18, Math.min(stageH - lensTop, Math.round(viewH * minimapScale)));

      minimapLens.style.top = `${lensTop}px`;
      minimapLens.style.height = `${lensH}px`;

      if (minimapContainer && !isDraggingMinimap) {
        const cScroll = minimapContainer.scrollTop;
        const cHeight = minimapContainer.clientHeight;
        if (lensTop < cScroll + 12) minimapContainer.scrollTop = Math.max(0, lensTop - 16);
        else if (lensTop + lensH > cScroll + cHeight - 12) minimapContainer.scrollTop = Math.max(0, lensTop + lensH - cHeight + 16);
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
      setChangesCount(Math.max(0, getChangesCount() - delta));
      updateHistoryUI();
      scheduleLivePreviewSync(action.type === 'full_reorganize');
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
          if (win && typeof m.docY === 'number') win.scrollTo({ top: Math.max(0, m.docY - 120), behavior: 'smooth' });
        });

        li.appendChild(mainDiv);
        li.appendChild(restoreBtn);
        liveChangesFeed.appendChild(li);
      }
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

          const previewCleanCss = document.createElement('style');
          previewCleanCss.textContent = `
            html, body { scrollbar-width: none !important; overflow: hidden !important; pointer-events: none !important; }
            *::-webkit-scrollbar { display: none !important; }
            .bwd-redacted-box { background-color: #0f172a !important; color: transparent !important; border-radius: 3px !important; }
            .bwd-redacted-box * { color: transparent !important; opacity: 0 !important; }
            .bwd-redacted-blur { filter: blur(8px) !important; }
            .bwd-redacted-mask { font-family: ui-monospace, monospace !important; }
          `;
          (clonedRoot.querySelector('head') || clonedRoot).appendChild(previewCleanCss);

          clonedRoot.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
          clonedRoot.querySelectorAll('[data-bwd-hovered]').forEach(el => el.removeAttribute('data-bwd-hovered'));
          const b = clonedRoot.querySelector('body');
          if (b) b.removeAttribute('data-bwd-tool');

          prevDoc.open();
          prevDoc.write('<!DOCTYPE html>\n' + clonedRoot.outerHTML);
          prevDoc.close();
          previewFrameReady = true;
        } else {
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
        const docH = Math.max(frameDoc.body.scrollHeight || 0, frameDoc.documentElement.scrollHeight || 0, win.innerHeight || 600);

        minimapScale = 236 / docW;
        minimapStage.style.height = `${Math.max(160, Math.round(docH * minimapScale))}px`;
        livePreviewFrame.style.width = `${docW}px`;
        livePreviewFrame.style.height = `${docH}px`;
        livePreviewFrame.style.transform = `scale(${minimapScale})`;

        if (minimapHeightBadge) minimapHeightBadge.textContent = `${Math.round(docH).toLocaleString()} px`;

        syncMinimapLens();
        renderLiveChangesFeedAndMarkers();
      } catch (e) {
        console.debug("Aviso en syncLivePreview:", e);
      }
    }

    function scheduleLivePreviewSync(fullRebuild = false) {
      if (previewSyncTimer) clearTimeout(previewSyncTimer);
      previewSyncTimer = setTimeout(() => syncLivePreview(fullRebuild), fullRebuild ? 40 : 90);
    }

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
      minimapStage.addEventListener('mousedown', (e) => { isDraggingMinimap = true; jumpFromMinimapEvent(e); });
      window.addEventListener('mousemove', (e) => { if (isDraggingMinimap) jumpFromMinimapEvent(e); });
      window.addEventListener('mouseup', () => { isDraggingMinimap = false; });
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

    return {
      describeElementShort,
      extractElementSnippet,
      captureElementDocGeometry,
      ensureActionMeta,
      syncMinimapLens,
      renderLiveChangesFeedAndMarkers,
      restoreSingleActionAtIndex,
      syncLivePreview,
      scheduleLivePreviewSync,
      toggleLiveSidebar,
      resetPreviewReady: () => { previewFrameReady = false; }
    };
  }

  global.createEditorMinimapController = createEditorMinimapController;
})(window);
