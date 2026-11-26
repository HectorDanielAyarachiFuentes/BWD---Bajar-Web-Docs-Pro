/**
 * ============================================================================
 * Webs-Docs — Motor de Captura y Exportación del Creador (editor-exports.js)
 * Encapsula inliner de medios, captura nativa sin costuras y PDF/Word/PNG/HTML.
 * Depende de shared/dom-utils.js, shared/zip-docx.js y shared/capture-stitch.js.
 * ============================================================================
 */
(function (global) {
  'use strict';

  function createEditorExportController(ctx) {
    const {
      cloneFrame,
      optNativeCapture,
      exportModal,
      toastNotification,
      btnEditorPdf,
      btnEditorDocx,
      btnEditorPng,
      btnEditorHtml,
      getCloneData,
      getActiveTool,
      getZoomLevel,
      getPdfPageMode,
      getDocxExportMode,
      getIsExporting,
      setIsExporting,
      commitActiveTextEdit,
      closeImagePopover,
      clearInspectorHover,
      scheduleLivePreviewSync,
      showExportModal,
      hideExportModal,
      showToast,
      setTool
    } = ctx;

    const {
      pickBestSrcsetUrl,
      detectPageTheme,
      sanitizeFilename,
      triggerDownload,
      sliceCanvasForA4,
      buildDocx,
      computeScrollStep,
      stitchCapturedSlices
    } = global.BwdShared;

    const sanitizeEditorName = (name, ext) => sanitizeFilename(name || 'documento', ext, '_editado');

    // ------------------------------------------------------------------------
    // 1. Inliner Universal de Imágenes Reales (Bypass CORS)
    // ------------------------------------------------------------------------
    async function inlineAllImages(doc, onProgress = () => {}) {
      if (!doc || !doc.body) return;
      const cloneData = getCloneData();
      const baseHref = doc.baseURI || (cloneData && (cloneData.baseURI || cloneData.url)) || window.location.href;
      const images = Array.from(doc.querySelectorAll('img'));
      const bgElements = Array.from(doc.querySelectorAll('[style*="background"]'));
      let processed = 0;
      const total = images.length + bgElements.length;

      async function fetchAsDataUrl(rawUrl) {
        if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) return null;
        let absUrl = rawUrl;
        try { absUrl = new URL(rawUrl, baseHref).href; } catch (_) {}
        if (!absUrl.startsWith('http')) return null;

        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 5000);
          const resp = await fetch(absUrl, { signal: controller.signal });
          clearTimeout(timer);
          if (!resp.ok) return null;
          const blob = await resp.blob();
          return await global.BwdShared.blobToDataUrl(blob);
        } catch (_) {
          return null;
        }
      }

      await Promise.all([
        ...images.map(async (img) => {
          try {
            if (img.hasAttribute('data-bwd-redacted')) return;
            const currentSrcAttr = img.getAttribute('src') || '';
            if (currentSrcAttr.startsWith('data:image/') && !currentSrcAttr.includes('data:image/svg')) return;

            const srcsetBest = pickBestSrcsetUrl(img.getAttribute('srcset') || img.getAttribute('data-srcset') || '');
            const cands = [
              img.getAttribute('data-src'), img.getAttribute('data-original'),
              img.getAttribute('data-lazy-src'), img.getAttribute('data-url'),
              img.getAttribute('data-retina'), srcsetBest, img.currentSrc, currentSrcAttr
            ];
            const targetUrl = cands.find(c => c && typeof c === 'string' && !c.includes('data:image/svg') && !c.includes('placeholder')) || '';
            if (!targetUrl) return;

            const dataUrl = await fetchAsDataUrl(targetUrl.trim());
            if (dataUrl) {
              img.setAttribute('src', dataUrl);
              img.src = dataUrl;
              ['srcset', 'data-src', 'data-original', 'data-lazy-src', 'data-srcset'].forEach(a => img.removeAttribute(a));
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
              if (dataUrl) el.style.backgroundImage = bg.replace(match[0], `url("${dataUrl}")`);
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

      if (!getIsExporting()) scheduleLivePreviewSync(true);
    }

    // ------------------------------------------------------------------------
    // 2. Motor Nativo Firefox sobre Iframe (Costura Interior Compartida)
    // ------------------------------------------------------------------------
    async function captureIframeViaNativeCompositor(frameDoc, onProgress = () => {}) {
      const win = cloneFrame.contentWindow;
      if (!win || typeof browser === 'undefined' || !browser.tabs || !browser.tabs.captureVisibleTab) return null;

      const prevModalDisplay = exportModal ? exportModal.style.display : 'none';
      const prevToastDisplay = toastNotification ? toastNotification.style.display : 'none';
      const prevPointerEvents = cloneFrame.style.pointerEvents || '';
      const prevScrollX = win.scrollX || win.pageXOffset || 0;
      const prevScrollY = win.scrollY || win.pageYOffset || 0;

      const tempRestores = [];
      const trackedEls = new Set();
      const recordStyle = (el, prop) => {
        if (!el.__bwd_cap_saved) el.__bwd_cap_saved = new Set();
        if (!el.__bwd_cap_saved.has(prop)) {
          el.__bwd_cap_saved.add(prop);
          tempRestores.push({ el, prop, val: el.style.getPropertyValue(prop) });
        }
      };

      const tempStyle = frameDoc.createElement('style');
      tempStyle.id = 'bwd-native-capture-temp';
      tempStyle.textContent = `
        :root, html, body, *, *::before, *::after {
          scrollbar-width: none !important; -ms-overflow-style: none !important;
          scroll-behavior: auto !important; transition: none !important; animation: none !important;
        }
        *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
        *, *:hover { outline: none !important; }
      `;
      (frameDoc.head || frameDoc.documentElement).appendChild(tempStyle);
      frameDoc.querySelectorAll('[data-bwd-hovered]').forEach(el => el.removeAttribute('data-bwd-hovered'));

      try {
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

        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        await new Promise(r => setTimeout(r, 90));

        const frameRect = cloneFrame.getBoundingClientRect();
        if (frameRect.width < 100 || frameRect.height < 100) return null;

        const innerClientW = (frameDoc.documentElement && frameDoc.documentElement.clientWidth > 80)
          ? Math.min(frameRect.width, frameDoc.documentElement.clientWidth)
          : frameRect.width;
        const viewportH = win.innerHeight || Math.round(frameRect.height);

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
              const overlapsH1 = Boolean(h1Rect && h1Rect.height > 10 && rect.bottom > (h1Rect.top + 4) && rect.top < (h1Rect.bottom + 64) && !el.contains(mainHeading));
              if (rect.top > viewportH * 0.45) {
                recordStyle(el, 'visibility'); recordStyle(el, 'opacity');
                el.style.setProperty('visibility', 'hidden', 'important');
                el.style.setProperty('opacity', '0', 'important');
                trackedEls.add(el);
              } else if (overlapsH1 || (!Number.isNaN(topPx) && topPx > 24 && rect.top < 380)) {
                recordStyle(el, 'position'); recordStyle(el, 'top'); recordStyle(el, 'width'); recordStyle(el, 'transform');
                const isNav = el.tagName === 'HEADER' || el.tagName === 'NAV' || /header|navbar/i.test(`${el.id} ${el.className}`);
                el.style.setProperty('position', isNav ? 'relative' : 'static', 'important');
                el.style.setProperty('top', 'auto', 'important');
                if (isNav) el.style.setProperty('width', '100%', 'important');
                el.style.setProperty('transform', 'none', 'important');
              }
            }
          } catch (_) {}
        });

        await new Promise(r => requestAnimationFrame(r));

        const measureTotalH = () => Math.min(Math.max(frameDoc.body ? frameDoc.body.scrollHeight : 0, frameDoc.documentElement ? frameDoc.documentElement.scrollHeight : 0, viewportH), 26000);
        let totalH = measureTotalH();
        const slices = [];
        let currentY = 0;
        let maxScrollY = Math.max(0, totalH - viewportH);
        let prevActualY = -1;

        const hideFixedAndStickyForScrollSlices = () => {
          frameDoc.querySelectorAll('*').forEach(el => {
            if (!el || ['HTML', 'BODY', 'MAIN', 'ARTICLE'].includes(el.tagName) || trackedEls.has(el)) return;
            try {
              const s = win.getComputedStyle(el);
              if (s.position === 'fixed' || s.position === 'sticky') {
                const r = el.getBoundingClientRect();
                const isOverlayWrapper = !el.querySelector('article, main, h1, p') && (el.innerText || '').trim().length < 260;
                if (r.height < viewportH * 0.78 || isOverlayWrapper) {
                  recordStyle(el, 'visibility'); recordStyle(el, 'opacity');
                  recordStyle(el, 'border-color'); recordStyle(el, 'box-shadow');
                  el.style.setProperty('visibility', 'hidden', 'important');
                  el.style.setProperty('opacity', '0', 'important');
                  el.style.setProperty('border-color', 'transparent', 'important');
                  el.style.setProperty('box-shadow', 'none', 'important');
                  trackedEls.add(el);
                }
              }
            } catch (_) {}
          });
        };

        const { stepCss } = computeScrollStep(viewportH);

        while (currentY <= maxScrollY) {
          const targetY = Math.min(currentY, maxScrollY);
          win.scrollTo(0, targetY);
          if (frameDoc.documentElement) frameDoc.documentElement.scrollTop = targetY;
          if (frameDoc.body) frameDoc.body.scrollTop = targetY;

          if (slices.length >= 1) hideFixedAndStickyForScrollSlices();
          await new Promise(r => requestAnimationFrame(() => setTimeout(r, 130)));

          const actualY = Math.max(win.scrollY || 0, frameDoc.documentElement ? frameDoc.documentElement.scrollTop : 0, frameDoc.body ? frameDoc.body.scrollTop : 0);
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

        const firstImg = await global.BwdShared.loadImageElement(slices[0].url);
        const dprX = firstImg.width / Math.max(1, window.innerWidth);
        const dprY = firstImg.height / Math.max(1, window.innerHeight);

        const cropX = Math.max(0, Math.ceil(frameRect.left * dprX));
        const cropY = Math.max(0, Math.ceil(frameRect.top * dprY) + 1);
        const cropW = Math.max(1, Math.min(firstImg.width - cropX, Math.floor(innerClientW * dprX)));
        const cropH = Math.max(1, Math.min(firstImg.height - cropY, Math.floor(frameRect.height * dprY) - 2));

        return await stitchCapturedSlices(slices, { cropX, cropY, cropW, cropH, dprY, totalH });
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
          } catch (_) {}
        }
        if (frameDoc.body) {
          frameDoc.body.removeAttribute('data-bwd-exporting');
          frameDoc.body.setAttribute('data-bwd-tool', getActiveTool());
        }
        cloneFrame.style.pointerEvents = prevPointerEvents;
        document.body.classList.remove('is-capturing-native');
        win.scrollTo(prevScrollX, prevScrollY);
        if (exportModal) exportModal.style.display = prevModalDisplay;
        if (toastNotification) toastNotification.style.display = prevToastDisplay;
      }
    }

    async function captureEditorCanvas(onProgress = () => {}) {
      setIsExporting(true);
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
          try { await Promise.race([frameDoc.fonts.ready, new Promise(r => setTimeout(r, 1500))]); } catch (_) {}
        }

        onProgress("Incrustando imágenes y fondos de alta definición...", 15);
        await inlineAllImages(frameDoc, (msg, pct) => onProgress(msg, pct));
        await new Promise(r => setTimeout(r, 180));

        const useNative = !optNativeCapture || optNativeCapture.checked;
        if (useNative && getZoomLevel() === 1) {
          onProgress("Capturando con motor visual nativo de Firefox...", 45);
          const nativeCanvas = await captureIframeViaNativeCompositor(frameDoc, onProgress);
          if (nativeCanvas && nativeCanvas.width > 50 && nativeCanvas.height > 50) return nativeCanvas;
        }

        const win = cloneFrame.contentWindow;
        const prevScrollX = win ? (win.scrollX || win.pageXOffset || 0) : 0;
        const prevScrollY = win ? (win.scrollY || win.pageYOffset || 0) : 0;
        if (win) win.scrollTo(0, 0);
        if (frameDoc.documentElement) { frameDoc.documentElement.scrollTop = 0; frameDoc.documentElement.scrollLeft = 0; }
        if (frameDoc.body) { frameDoc.body.scrollTop = 0; frameDoc.body.scrollLeft = 0; }

        const body = frameDoc.body, docEl = frameDoc.documentElement;
        const fullWidth = Math.max(body ? body.scrollWidth : 0, body ? body.offsetWidth : 0, docEl ? docEl.clientWidth : 0, docEl ? docEl.scrollWidth : 0, win ? win.innerWidth : 1200);
        const fullHeight = Math.max(body ? body.scrollHeight : 0, body ? body.offsetHeight : 0, docEl ? docEl.clientHeight : 0, docEl ? docEl.scrollHeight : 0, win ? win.innerHeight : 800);

        let scale = 2;
        if (fullHeight * scale > 28000) scale = Math.max(1, 28000 / fullHeight);

        const { bgColor } = detectPageTheme(frameDoc);
        const cloneData = getCloneData();
        onProgress("Compilando vista de alta definición sin recortes...", 50);

        try {
          return await window.html2canvas(docEl || body, {
            useCORS: true, scale, scrollX: 0, scrollY: 0, x: 0, y: 0,
            width: fullWidth, height: fullHeight, windowWidth: fullWidth, windowHeight: fullHeight,
            backgroundColor: bgColor, logging: false,
            onclone: (clonedDoc) => {
              if (clonedDoc.defaultView) clonedDoc.defaultView.scrollTo(0, 0);
              if (clonedDoc.documentElement) { clonedDoc.documentElement.scrollTop = 0; clonedDoc.documentElement.style.overflow = 'visible'; clonedDoc.documentElement.style.height = 'auto'; }
              if (clonedDoc.body) { clonedDoc.body.scrollTop = 0; clonedDoc.body.style.overflow = 'visible'; clonedDoc.body.style.height = 'auto'; clonedDoc.body.removeAttribute('data-bwd-tool'); }
              const internalEditorCss = clonedDoc.querySelector('#bwd-editor-internal-css');
              if (internalEditorCss) internalEditorCss.remove();

              const baseHref = frameDoc.baseURI || (cloneData && (cloneData.baseURI || cloneData.url)) || window.location.href;
              if (!clonedDoc.querySelector('base') && clonedDoc.head) {
                const baseTag = clonedDoc.createElement('base');
                baseTag.href = baseHref;
                clonedDoc.head.insertBefore(baseTag, clonedDoc.head.firstChild);
              }
              frameDoc.querySelectorAll('link[rel="stylesheet"], style').forEach(st => {
                if (st.id === 'bwd-editor-internal-css') return;
                if (!st.id || !clonedDoc.getElementById(st.id)) {
                  try { clonedDoc.head.appendChild(st.cloneNode(true)); } catch (_) {}
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
                } catch (_) {}
              });
            }
          });
        } finally {
          if (win) win.scrollTo(prevScrollX, prevScrollY);
        }
      } finally {
        setIsExporting(false);
        document.body.classList.remove('is-capturing-native');
        if (frameDoc && frameDoc.body) {
          frameDoc.body.removeAttribute('data-bwd-exporting');
          frameDoc.body.setAttribute('data-bwd-tool', getActiveTool());
        }
      }
    }

    // ------------------------------------------------------------------------
    // 3. Extractores Seguros (Respetando Censuras)
    // ------------------------------------------------------------------------
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
      if (!el || isNodeRedacted(el)) return '';
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
          if (!parent || isNodeRedacted(parent)) return NodeFilter.FILTER_REJECT;
          if (['script', 'style', 'noscript', 'svg', 'canvas', 'template'].includes(parent.tagName.toLowerCase())) return NodeFilter.FILTER_REJECT;
          const s = win.getComputedStyle(parent);
          if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return NodeFilter.FILTER_REJECT;
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
        const fSize = parseFloat(win.getComputedStyle(tNode.parentElement).fontSize) || 14;
        try {
          range.selectNodeContents(tNode);
          const rawRects = Array.from(range.getClientRects()).filter(r => r.width > 2 && r.height > 2);
          if (rawRects.length === 1) {
            const r = rawRects[0];
            textBlocks.push({ text: clean, x: Math.round(r.left + sX), y: Math.round(r.top + sY), width: Math.round(r.width), height: Math.round(r.height), fontSize: Math.round(fSize) });
          } else if (rawRects.length > 1) {
            const totalRectW = rawRects.reduce((acc, r) => acc + r.width, 0) || 1;
            const words = clean.split(' ');
            let wordIdx = 0;
            rawRects.forEach((r, idx) => {
              if (wordIdx >= words.length) return;
              const cnt = idx === rawRects.length - 1 ? words.length - wordIdx : Math.max(1, Math.round((r.width / totalRectW) * words.length));
              const lineText = words.slice(wordIdx, wordIdx + cnt).join(' ').trim();
              wordIdx += cnt;
              if (lineText) textBlocks.push({ text: lineText, x: Math.round(r.left + sX), y: Math.round(r.top + sY), width: Math.round(r.width), height: Math.round(r.height), fontSize: Math.round(fSize) });
            });
          }
        } catch (_) {}
      }
      return textBlocks;
    }

    function extractEditorStructuredItems(frameDoc) {
      const structuredItems = [];
      if (!frameDoc || !frameDoc.body) return structuredItems;
      const win = cloneFrame.contentWindow || window;

      frameDoc.querySelectorAll('h1, h2, h3, h4, h5, h6, p, blockquote, ul, ol, table, pre').forEach(el => {
        if (isNodeRedacted(el)) return;
        const s = win.getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return;
        const tag = el.tagName.toLowerCase();
        if (el.closest('table') && tag !== 'table') return;
        if (el.closest('ul, ol') && !['ul', 'ol'].includes(tag)) return;

        if (tag.startsWith('h')) {
          const text = extractCleanRedactedText(el);
          if (text) structuredItems.push({ type: 'heading', level: parseInt(tag[1], 10) || 1, text });
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
          if (liTexts.length > 0) structuredItems.push({ type: 'list', isOrdered: tag === 'ol', items: liTexts });
        } else if (tag === 'table') {
          const rows = [];
          el.querySelectorAll('tr').forEach(tr => {
            const cells = [];
            tr.querySelectorAll('th, td').forEach(td => {
              cells.push({ text: isNodeRedacted(td) ? '[CENSURADO]' : extractCleanRedactedText(td), isHeader: td.tagName.toLowerCase() === 'th' });
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
          if (isNodeRedacted(div) || div.querySelector('div, p, table, ul, ol, h1, h2, h3, h4')) return;
          const t = extractCleanRedactedText(div);
          if (t && t.length >= 12) structuredItems.push({ type: 'paragraph', text: t });
        });
      }
      return structuredItems;
    }

    function collectAvoidCutZones(frameDoc, canvasHeight) {
      const zones = [];
      try {
        const win = cloneFrame.contentWindow || window;
        const sY = win.scrollY || win.pageYOffset || 0;
        const docH = Math.max(frameDoc.body ? frameDoc.body.scrollHeight : 0, frameDoc.documentElement ? frameDoc.documentElement.scrollHeight : 0, 1);
        const scaleY = canvasHeight / docH;
        frameDoc.querySelectorAll('img, video, figure, iframe, picture, [class*="video"], [class*="player"]').forEach(el => {
          const s = win.getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return;
          const r = el.getBoundingClientRect();
          if (r.width >= 100 && r.height >= 70 && r.height <= 1600) {
            zones.push({ top: Math.max(0, Math.round((r.top + sY) * scaleY)), bottom: Math.round((r.bottom + sY) * scaleY) });
          }
        });
      } catch (_) {}
      return zones;
    }

    // ------------------------------------------------------------------------
    // 4. Botones de Exportación del Modo Creador (PDF, Word, PNG, HTML Offline)
    // ------------------------------------------------------------------------
    if (btnEditorPdf) {
      btnEditorPdf.addEventListener('click', async () => {
        try {
          showExportModal("Generando PDF Fiel con tus ediciones...", "Iniciando captura sin distorsión...", 15);
          const canvas = await captureEditorCanvas((msg, pct) => showExportModal("Generando PDF Fiel...", msg, pct));
          const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
          const { isDark, bgR, bgG, bgB, bgColor } = detectPageTheme(frameDoc);
          const { jsPDF } = window.jspdf;
          const cloneData = getCloneData();

          const canvasWidth = canvas.width;
          const canvasHeight = canvas.height;
          const effectiveMode = getPdfPageMode() === 'a4' ? 'a4' : 'continuous';

          let pdf;
          if (effectiveMode === 'a4') {
            showExportModal("Compilando PDF A4 Paginado...", "Dividiendo páginas respetando imágenes y renglones...", 72);
            const avoidZones = collectAvoidCutZones(frameDoc, canvasHeight);
            const a4Slices = sliceCanvasForA4(canvas, () => {}, isDark ? `rgb(${bgR},${bgG},${bgB})` : '#ffffff', 0.92, avoidZones);
            pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
            const pageW = 210, pageH = 297, margin = 8, usableW = pageW - margin * 2, usableH = pageH - margin * 2;

            a4Slices.forEach((sl, idx) => {
              if (idx > 0) pdf.addPage('a4', 'portrait');
              if (isDark) { pdf.setFillColor(bgR, bgG, bgB); pdf.rect(0, 0, pageW, pageH, 'F'); }
              const ratio = Math.min(usableW / sl.width, usableH / sl.height);
              const drawW = sl.width * ratio, drawH = sl.height * ratio;
              pdf.addImage(sl.dataUrl, 'JPEG', (pageW - drawW) / 2, margin, drawW, drawH, undefined, 'FAST');
            });
          } else {
            showExportModal("Compilando archivo PDF...", "Generando página continua sin bordes ni saltos...", 75);
            const unitScale = canvasHeight > 14000 ? (14000 / canvasHeight) : 1;
            const pdfW = Math.max(1, Math.round(canvasWidth * unitScale));
            const pdfH = Math.max(1, Math.round(canvasHeight * unitScale));
            pdf = new jsPDF({ orientation: pdfW > pdfH ? 'landscape' : 'portrait', unit: 'px', format: [pdfW, pdfH], hotfixes: ['px_scaling'], compress: true });

            if (isDark) { pdf.setFillColor(bgR, bgG, bgB); pdf.rect(0, 0, pdfW, pdfH, 'F'); }
            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = canvasWidth; exportCanvas.height = canvasHeight;
            const ectx = exportCanvas.getContext('2d');
            ectx.fillStyle = bgColor || (isDark ? `rgb(${bgR},${bgG},${bgB})` : '#ffffff');
            ectx.fillRect(0, 0, canvasWidth, canvasHeight);
            ectx.drawImage(canvas, 0, 0);
            pdf.addImage(exportCanvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, pdfW, pdfH, undefined, 'FAST');

            const docEl = frameDoc.documentElement, bEl = frameDoc.body;
            const fullW = Math.max(bEl ? bEl.scrollWidth : 0, docEl ? docEl.scrollWidth : 0, docEl ? docEl.clientWidth : 0, 1);
            const fullH = Math.max(bEl ? bEl.scrollHeight : 0, docEl ? docEl.scrollHeight : 0, docEl ? docEl.clientHeight : 0, 1);
            const scaleX = pdfW / fullW, scaleY = pdfH / fullH;

            const textBlocks = extractEditorTextBlocks(frameDoc);
            if (textBlocks.length > 0) {
              showExportModal("Compilando archivo PDF...", "Incrustando capa de texto seleccionable y enlaces...", 90);
              for (const tb of textBlocks) {
                if (!tb.text) continue;
                try {
                  pdf.setFontSize(Math.max(6, Math.min(72, Math.round(tb.fontSize * scaleY))));
                  pdf.text(tb.text, Math.round(tb.x * scaleX), Math.round(tb.y * scaleY), { baseline: 'top', renderingMode: 'invisible' });
                } catch (_) {}
              }
            }

            try {
              const fWin = cloneFrame.contentWindow || window;
              const scX = fWin.scrollX || 0, scY = fWin.scrollY || 0;
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
                  try { pdf.link((r.left + scX) * scaleX, (r.top + scY) * scaleY, Math.max(2, r.width * scaleX), Math.max(2, r.height * scaleY), { url: abs }); } catch (_) {}
                });
              });
            } catch (_) {}
          }

          showExportModal("Compilando archivo PDF...", "Guardando en carpeta PDFs...", 96);
          const filename = sanitizeEditorName(cloneData ? cloneData.title : 'documento', 'pdf');
          await triggerDownload(pdf.output('blob'), filename);
          hideExportModal();
          showToast(`¡PDF descargado con éxito! (${filename})`);
          setTool(getActiveTool());
        } catch (err) {
          console.error("Error al exportar PDF:", err);
          hideExportModal();
          showToast(`Error al exportar el PDF: ${err.message || err}`, true);
          setTool(getActiveTool());
        }
      });
    }

    if (btnEditorDocx) {
      btnEditorDocx.addEventListener('click', async () => {
        try {
          commitActiveTextEdit();
          closeImagePopover();
          clearInspectorHover();

          const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
          const cloneData = getCloneData();
          const title = (cloneData && cloneData.title) ? cloneData.title : 'Documento Web Editado';
          const docxExportMode = getDocxExportMode();
          let slices = [];
          let isLandscape = false;

          if (docxExportMode !== 'editable') {
            showExportModal("Generando documento Word (.docx)...", "Iniciando captura de alta fidelidad...", 18);
            const canvas = await captureEditorCanvas((msg, pct) => showExportModal("Generando documento Word...", msg, pct));
            isLandscape = canvas.width >= canvas.height && (canvas.height <= canvas.width * 0.8);
            showExportModal("Compilando documento Word...", "Dividiendo páginas sin cortar fotos ni renglones...", 68);
            const avoidZones = collectAvoidCutZones(frameDoc, canvas.height);
            slices = sliceCanvasForA4(canvas, (current, total) => {
              showExportModal("Compilando documento Word...", `Generando página ${current} de ${total}...`, Math.min(90, 68 + Math.round((current / Math.max(1, total)) * 20)));
            }, '#ffffff', 0.92, avoidZones);
          } else {
            showExportModal("Generando Word Editable...", "Extrayendo estructura semántica limpia...", 55);
          }

          const structuredItems = docxExportMode === 'visual' ? [] : extractEditorStructuredItems(frameDoc);
          if (docxExportMode === 'editable' && structuredItems.length === 0) {
            structuredItems.push({ type: 'paragraph', text: extractCleanRedactedText(frameDoc.body) || title });
          }

          showExportModal("Empaquetando documento Word...", "Generando paquete OpenXML (.docx)...", 94);
          const docxUint8 = buildDocx(slices, isLandscape, structuredItems);
          const blob = new Blob([docxUint8], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
          const filename = sanitizeEditorName(title, 'docx');
          await triggerDownload(blob, filename);

          hideExportModal();
          showToast(`¡Documento Word (.docx) guardado con éxito! (${filename})`);
          setTool(getActiveTool());
        } catch (err) {
          console.error("Error al exportar Word (.docx):", err);
          hideExportModal();
          showToast(`Error al exportar a Word: ${err.message || err}`, true);
          setTool(getActiveTool());
        }
      });
    }

    if (btnEditorPng) {
      btnEditorPng.addEventListener('click', async () => {
        try {
          showExportModal("Generando imagen PNG HD...", "Iniciando renderizado fiel...", 25);
          const canvas = await captureEditorCanvas((msg, pct) => showExportModal("Generando imagen PNG HD...", msg, pct));
          const cloneData = getCloneData();
          const filename = sanitizeEditorName(cloneData ? cloneData.title : 'captura', 'png');
          const blob = await global.BwdShared.canvasToBlob(canvas, 'image/png');
          await triggerDownload(blob, filename);

          hideExportModal();
          showToast(`¡Captura PNG guardada! (${filename})`);
          setTool(getActiveTool());
        } catch (err) {
          console.error("Error al exportar PNG:", err);
          hideExportModal();
          showToast(`Error al exportar captura PNG: ${err.message || err}`, true);
          setTool(getActiveTool());
        }
      });
    }

    if (btnEditorHtml) {
      btnEditorHtml.addEventListener('click', async () => {
        try {
          commitActiveTextEdit();
          closeImagePopover();
          clearInspectorHover();

          showExportModal("Generando HTML 100% Offline...", "Incrustando imágenes en el documento...", 20);
          const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
          if (!frameDoc || !frameDoc.documentElement) throw new Error("No se pudo acceder al contenido del documento.");

          await inlineAllImages(frameDoc, (msg, pct) => showExportModal("Generando HTML Offline...", msg, pct));
          showExportModal("Generando HTML Offline...", "Incrustando hojas de estilo externas y purgando censuras...", 65);

          const clonedDoc = frameDoc.documentElement.cloneNode(true);
          const cloneData = getCloneData();
          const baseHref = (cloneData && (cloneData.baseURI || cloneData.url)) || frameDoc.baseURI || window.location.href;

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
            } catch (_) {}
          }));

          clonedDoc.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
          clonedDoc.querySelectorAll('[data-bwd-hovered]').forEach(el => el.removeAttribute('data-bwd-hovered'));
          clonedDoc.removeAttribute('data-bwd-tool');
          const bodyEl = clonedDoc.querySelector('body');
          if (bodyEl) bodyEl.removeAttribute('data-bwd-tool');
          const internalCss = clonedDoc.querySelector('#bwd-editor-internal-css');
          if (internalCss) internalCss.remove();

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

          const censorStyle = frameDoc.createElement('style');
          censorStyle.id = 'bwd-censor-style';
          censorStyle.textContent = `
            html, body { height: auto !important; max-height: none !important; overflow-y: visible !important; }
            *, *::before, *::after { page-break-before: auto !important; page-break-after: auto !important; break-before: auto !important; break-after: auto !important; }
            img, figure, video, iframe, table { break-inside: avoid !important; page-break-inside: avoid !important; }
            .bwd-redacted-box { background-color: #0f172a !important; color: transparent !important; user-select: none !important; border-radius: 3px !important; border: 1px solid rgba(148,163,184,0.32) !important; }
            .bwd-redacted-blur { filter: blur(8px) !important; user-select: none !important; }
            .bwd-redacted-mask { font-family: ui-monospace, monospace !important; user-select: none !important; }
          `;
          (clonedDoc.querySelector('head') || clonedDoc).appendChild(censorStyle);

          clonedDoc.querySelectorAll('a[href]').forEach(a => {
            const h = a.getAttribute('href') || '';
            if (h && !h.startsWith('#') && !h.startsWith('javascript:') && !h.startsWith('mailto:') && !h.startsWith('tel:')) {
              try { a.setAttribute('href', new URL(h, baseHref).href); } catch (_) {}
            }
          });
          clonedDoc.querySelectorAll('base').forEach(b => b.remove());

          showExportModal("Generando HTML Offline...", "Empaquetando archivo final...", 90);
          const blob = new Blob(['<!DOCTYPE html>\n' + clonedDoc.outerHTML], { type: 'text/html;charset=utf-8' });
          const filename = sanitizeEditorName(cloneData ? cloneData.title : 'documento', 'html');
          await triggerDownload(blob, filename);

          hideExportModal();
          showToast(`¡HTML offline guardado con éxito! (${filename})`);
          setTool(getActiveTool());
        } catch (err) {
          console.error("Error al exportar HTML:", err);
          hideExportModal();
          showToast(`Error al exportar HTML: ${err.message || err}`, true);
          setTool(getActiveTool());
        }
      });
    }

    return {
      inlineAllImages,
      captureIframeViaNativeCompositor,
      captureEditorCanvas,
      isNodeRedacted,
      extractCleanRedactedText,
      extractEditorTextBlocks,
      extractEditorStructuredItems
    };
  }

  global.createEditorExportController = createEditorExportController;
})(window);
