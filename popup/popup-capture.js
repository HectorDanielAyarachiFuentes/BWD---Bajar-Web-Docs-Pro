/**
 * ============================================================================
 * Webs-Docs — Motor de Captura de Pestaña Activa (popup/popup-capture.js)
 * Encapsula getActiveTab, executeInPage, captureTabImage y captureFullPageCanvas.
 * Depende de shared/dom-utils.js y shared/capture-stitch.js.
 * ============================================================================
 */

async function getActiveTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tabs || tabs.length === 0 || !tabs[0] || !tabs[0].id) {
    throw new Error("No hay pestaña activa disponible.");
  }
  return tabs[0];
}

async function captureTabImage(tab, format = 'jpeg') {
  if (tab && typeof tab.windowId === 'number') {
    try {
      const res = await browser.tabs.captureVisibleTab(tab.windowId, { format });
      if (res) return res;
    } catch (e) {
      console.warn("captureVisibleTab(windowId) no respondió, intentando fallback:", e);
    }
  }

  try {
    const res = await browser.tabs.captureVisibleTab(null, { format });
    if (res) return res;
  } catch (e) {
    console.warn("captureVisibleTab(null) falló:", e);
  }

  try {
    const res = await browser.tabs.captureVisibleTab();
    if (res) return res;
  } catch (e) {
    console.warn("captureVisibleTab() sin parámetros falló:", e);
  }

  if (typeof browser.tabs.captureTab === 'function' && tab && tab.id) {
    try {
      const res = await browser.tabs.captureTab(tab.id, { format });
      if (res) return res;
    } catch (e) {
      console.warn("browser.tabs.captureTab() falló:", e);
    }
  }

  throw new Error("No fue posible capturar la pantalla. Verifica que la pestaña sea una página web accesible.");
}

async function executeInPage(func, args = []) {
  const tab = await getActiveTab();
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func,
      args
    });
    if (results && results.length > 0) {
      const first = results[0];
      if (first.error) {
        const msg = first.error.message || BwdShared.formatErrorMessage(first.error);
        throw new Error(msg);
      }
      return first.result;
    }
    return null;
  } catch (err) {
    throw new Error(BwdShared.formatErrorMessage(err));
  }
}

async function captureFullPageCanvas({
  clean = false,
  expand = false,
  highQuality = undefined,
  visibleOnly = false,
  onProgress = () => {}
} = {}) {
  const tab = await getActiveTab();
  const hqEl = document.getElementById('highQuality');
  const useHighQuality = highQuality !== undefined
    ? Boolean(highQuality)
    : (hqEl ? hqEl.checked : true);

  // 0. Registrar posición original del usuario e instalar Watchdog auto-reparable en la pestaña
  const initialScroll = await executeInPage(() => {
    const origX = window.scrollX || window.pageXOffset || 0;
    const origY = window.scrollY || window.pageYOffset || 0;

    if (typeof window._bwdCleanupNow === 'function') {
      try { window._bwdCleanupNow(); } catch (_) {}
    }

    window._bwdOrigScroll = { x: origX, y: origY };
    window._bwdRestores = [];
    window._bwdLastBeat = Date.now();

    window._bwdRecordStyle = function (el, prop) {
      if (!el || !el.style) return;
      if (!el.__bwdSavedProps) el.__bwdSavedProps = {};
      if (!(prop in el.__bwdSavedProps)) {
        el.__bwdSavedProps[prop] = el.style.getPropertyValue(prop);
        window._bwdRestores.push({
          type: 'style-prop',
          el,
          prop,
          val: el.__bwdSavedProps[prop]
        });
      }
    };

    window._bwdCleanupNow = function () {
      try {
        if (window._bwdWatchdogId) {
          clearInterval(window._bwdWatchdogId);
          delete window._bwdWatchdogId;
        }
        const noScrollStyle = document.getElementById('bwd-no-scrollbars');
        if (noScrollStyle) noScrollStyle.remove();

        if (Array.isArray(window._bwdRestores)) {
          for (let i = window._bwdRestores.length - 1; i >= 0; i--) {
            const item = window._bwdRestores[i];
            try {
              if (item.type === 'style-tag') {
                const st = document.getElementById(item.id);
                if (st) st.remove();
              } else if (item.type === 'style-prop' && item.el && item.el.style) {
                if (item.el.__bwdSavedProps) delete item.el.__bwdSavedProps;
                if (item.val) item.el.style.setProperty(item.prop, item.val);
                else item.el.style.removeProperty(item.prop);
              }
            } catch (_) {}
          }
        }
        delete window._bwdRestores;
        delete window._bwdRecordStyle;

        if (window._bwdOrigScroll) {
          window.scrollTo({ top: window._bwdOrigScroll.y, left: window._bwdOrigScroll.x, behavior: 'instant' });
          delete window._bwdOrigScroll;
        }
      } catch (_) {}
    };

    window._bwdWatchdogId = setInterval(() => {
      if (!window._bwdLastBeat || (Date.now() - window._bwdLastBeat > 2600)) {
        if (typeof window._bwdCleanupNow === 'function') window._bwdCleanupNow();
      }
    }, 850);

    return { x: origX, y: origY };
  });

  try {
    // 1. Pre-activar imágenes lazy y volver a scrollY = 0 dejando asentar el JS del sitio
    if (!visibleOnly) {
      onProgress(25, "Activando imágenes diferidas y estabilizando cabeceras...");
      await executeInPage(async () => {
        window._bwdLastBeat = Date.now();
        const docH = Math.min(
          Math.max(
            document.body ? document.body.scrollHeight : 0,
            document.documentElement ? document.documentElement.scrollHeight : 0
          ),
          22000
        );
        const step = Math.max(400, window.innerHeight || 800);
        if (docH > step * 1.25) {
          for (let y = 0; y < docH; y += step * 1.5) {
            window._bwdLastBeat = Date.now();
            window.scrollTo({ top: y, left: 0, behavior: 'instant' });
            await new Promise(r => setTimeout(r, 35));
          }
        }
        window._bwdLastBeat = Date.now();
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
        window.dispatchEvent(new Event('scroll'));
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        await new Promise(r => setTimeout(r, 200));
        window._bwdLastBeat = Date.now();
      });
    }

    // 2. Preparar estilos limpios en el origen sin deformar cabeceras sticky/fixed del corte 0
    await executeInPage((opts) => {
      window._bwdLastBeat = Date.now();
      const rec = window._bwdRecordStyle;

      const styleEl = document.createElement('style');
      styleEl.id = 'bwd-no-scrollbars';
      styleEl.textContent = `
        html, body, :root, *, *::before, *::after {
          scrollbar-width: none !important;
          -ms-overflow-style: none !important;
          scroll-behavior: auto !important;
          transition: none !important;
          animation: none !important;
        }
        *::-webkit-scrollbar, html::-webkit-scrollbar, body::-webkit-scrollbar {
          display: none !important; width: 0px !important; height: 0px !important; background: transparent !important;
        }
      `;
      (document.head || document.documentElement).appendChild(styleEl);
      window._bwdRestores.push({ type: 'style-tag', id: 'bwd-no-scrollbars' });

      if (!opts.visibleOnly) {
        [document.documentElement, document.body].forEach(rootEl => {
          if (!rootEl) return;
          try {
            const cs = window.getComputedStyle(rootEl);
            if (cs.overflow === 'hidden' || cs.overflowY === 'hidden') {
              rec(rootEl, 'overflow');
              rec(rootEl, 'overflow-y');
              rootEl.style.setProperty('overflow', 'visible', 'important');
              rootEl.style.setProperty('overflow-y', 'visible', 'important');
            }
          } catch (_) {}
        });
      }

      if (opts.clean) {
        const inlineAdSelectors = [
          'ins.adsbygoogle', 'iframe[id*="google_ads"]', 'iframe[src*="doubleclick"]',
          'div[id*="google_ads"]', 'div[id*="div-gpt-ad"]', 'div[class*="ad-container"]',
          'div[class*="ad-slot"]', 'div[class*="ad-box"]', 'div[class*="advertisement"]',
          'div[class*="taboola"]', 'div[class*="outbrain"]', '[data-ad-slot]', '[data-ad-unit]',
          '.ln-placeholder', '[class*="caja-comercial"]', '#onetrust-consent-sdk',
          '#onetrust-banner-sdk', '#cookie-banner', '.cookie-banner', '[class*="cookie-consent"]',
          '.swg-dialog', '.modal-backdrop', '.chat-widget', '[aria-label*="cookie" i]'
        ];
        inlineAdSelectors.forEach(sel => {
          try {
            document.querySelectorAll(sel).forEach(el => {
              if (!el || ['HTML', 'BODY', 'MAIN', 'ARTICLE', 'HEADER'].includes(el.tagName)) return;
              if (el.querySelector && el.querySelector('article, main, h1')) return;
              rec(el, 'display');
              el.style.setProperty('display', 'none', 'important');
              const p = el.parentElement;
              if (p && p !== document.body && !p.textContent.trim() && !p.querySelector('img, svg, video, canvas')) {
                rec(p, 'min-height'); rec(p, 'height'); rec(p, 'padding');
                p.style.setProperty('min-height', '0px', 'important');
                p.style.setProperty('height', 'auto', 'important');
                p.style.setProperty('padding', '0px', 'important');
              }
            });
          } catch (_) {}
        });

        document.querySelectorAll('div, aside, section, dialog').forEach(el => {
          try {
            if (el.querySelector('article, main, h1')) return;
            const s = window.getComputedStyle(el);
            const idCls = `${el.id || ''} ${typeof el.className === 'string' ? el.className : ''}`.toLowerCase();
            if ((s.position === 'fixed' || parseInt(s.zIndex, 10) > 999) && /(cookie|consent|gdpr|paywall|subscribe-bar|newsletter-modal|chat-widget)/i.test(idCls)) {
              rec(el, 'display');
              el.style.setProperty('display', 'none', 'important');
            }
          } catch (_) {}
        });
      }

      if (opts.expand && !opts.visibleOnly) {
        const vW = window.innerWidth || 1200;
        const vH = window.innerHeight || 800;
        document.querySelectorAll('*').forEach(el => {
          try {
            if (['HTML', 'BODY'].includes(el.tagName)) return;
            const s = window.getComputedStyle(el);
            if (s.overflowY === 'scroll' || s.overflowY === 'auto') {
              if (el.scrollHeight > el.clientHeight + 24 && el.scrollHeight < 30000) {
                rec(el, 'overflow-y'); rec(el, 'overflow'); rec(el, 'max-height'); rec(el, 'height');
                el.style.setProperty('overflow-y', 'visible', 'important');
                el.style.setProperty('overflow', 'visible', 'important');
                el.style.setProperty('max-height', 'none', 'important');
                el.style.setProperty('height', 'auto', 'important');

                const r = el.getBoundingClientRect();
                if (r.width >= vW * 0.45 && el.clientHeight >= vH * 0.45) {
                  let anc = el.parentElement;
                  while (anc && anc !== document.documentElement) {
                    const as = window.getComputedStyle(anc);
                    if (as.overflow === 'hidden' || as.overflowY === 'hidden' || as.height !== 'auto') {
                      rec(anc, 'overflow'); rec(anc, 'overflow-y'); rec(anc, 'height'); rec(anc, 'max-height');
                      anc.style.setProperty('overflow', 'visible', 'important');
                      anc.style.setProperty('overflow-y', 'visible', 'important');
                      anc.style.setProperty('height', 'auto', 'important');
                      anc.style.setProperty('max-height', 'none', 'important');
                    }
                    anc = anc.parentElement;
                  }
                }
              }
            }
          } catch (_) {}
        });
      }

      const vH = window.innerHeight || 800;
      const mainH1 = document.querySelector('article h1, main h1, h1');
      const h1Rect = (!opts.visibleOnly && mainH1) ? mainH1.getBoundingClientRect() : null;

      document.querySelectorAll('*').forEach(el => {
        if (!el || ['HTML', 'BODY', 'MAIN', 'ARTICLE'].includes(el.tagName)) return;
        try {
          const s = window.getComputedStyle(el);
          if (s.backgroundAttachment === 'fixed') {
            rec(el, 'background-attachment');
            el.style.setProperty('background-attachment', 'scroll', 'important');
          }
          if (s.overflowX === 'scroll' || s.overflowX === 'auto') {
            rec(el, 'scrollbar-width');
            el.style.setProperty('scrollbar-width', 'none', 'important');
          }
          if (!opts.visibleOnly && s.position === 'fixed') {
            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0 || rect.height > vH * 0.75) return;
            const topPx = parseFloat(s.top);
            const overlapsH1 = Boolean(
              h1Rect && h1Rect.height > 10 &&
              rect.bottom > (h1Rect.top + 4) && rect.top < (h1Rect.bottom + 64) &&
              !el.contains(mainH1)
            );

            if (rect.top > vH * 0.45) {
              rec(el, 'visibility'); rec(el, 'opacity');
              el.style.setProperty('visibility', 'hidden', 'important');
              el.style.setProperty('opacity', '0', 'important');
            } else if (overlapsH1 || (!Number.isNaN(topPx) && topPx > 24 && rect.top < 380)) {
              rec(el, 'position'); rec(el, 'top'); rec(el, 'width'); rec(el, 'transform');
              const isNav = el.tagName === 'HEADER' || el.tagName === 'NAV' || /header|navbar/i.test(`${el.id} ${el.className}`);
              el.style.setProperty('position', isNav ? 'relative' : 'static', 'important');
              el.style.setProperty('top', 'auto', 'important');
              if (isNav) el.style.setProperty('width', '100%', 'important');
              el.style.setProperty('transform', 'none', 'important');
            }
          }
        } catch (_) {}
      });
    }, [{ clean, expand, visibleOnly }]);

    // 3. Medir geometría, tema, OCR multi-línea, links, semántica Word y zonas indivisibles
    const pageData = await executeInPage((opts) => {
      window._bwdLastBeat = Date.now();
      if (!opts.visibleOnly) {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
      }

      const vH = window.innerHeight || 800;
      const vW = window.innerWidth || 1200;
      const docEl = document.documentElement;
      const body = document.body;
      const baseHref = document.baseURI || window.location.href;

      const scrollH = Math.max(
        body ? body.scrollHeight : 0, body ? body.offsetHeight : 0,
        docEl ? docEl.clientHeight : 0, docEl ? docEl.scrollHeight : 0, docEl ? docEl.offsetHeight : 0
      );
      const scrollW = Math.max(vW, docEl ? docEl.clientWidth : 0);

      let bgColor = '#ffffff', isDark = false, bgR = 255, bgG = 255, bgB = 255;
      try {
        let rawBg = body ? window.getComputedStyle(body).backgroundColor : '';
        if (!rawBg || rawBg === 'transparent' || rawBg === 'rgba(0, 0, 0, 0)') {
          rawBg = docEl ? window.getComputedStyle(docEl).backgroundColor : '';
        }
        if (rawBg && rawBg !== 'transparent' && rawBg !== 'rgba(0, 0, 0, 0)') {
          bgColor = rawBg;
          const m = rawBg.match(/\d+/g);
          if (m && m.length >= 3) {
            bgR = parseInt(m[0], 10); bgG = parseInt(m[1], 10); bgB = parseInt(m[2], 10);
            isDark = (0.299 * bgR + 0.587 * bgG + 0.114 * bgB) < 128;
          }
        }
      } catch (_) {}

      const sX = window.scrollX || window.pageXOffset || 0;
      const sY = window.scrollY || window.pageYOffset || 0;

      const textBlocks = [];
      try {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            if (!node.textContent || !node.textContent.trim()) return NodeFilter.FILTER_REJECT;
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            if (['script', 'style', 'noscript', 'svg', 'canvas', 'template'].includes(parent.tagName.toLowerCase())) return NodeFilter.FILTER_REJECT;
            const s = window.getComputedStyle(parent);
            if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
        });
        const range = document.createRange();
        let tNode;
        while ((tNode = walker.nextNode())) {
          const cleanText = tNode.textContent.replace(/\s+/g, ' ').trim();
          if (!cleanText) continue;
          const fSize = parseFloat(window.getComputedStyle(tNode.parentElement).fontSize) || 14;
          try {
            range.selectNodeContents(tNode);
            const rawRects = Array.from(range.getClientRects()).filter(r => r.width > 2 && r.height > 2);
            if (rawRects.length === 1) {
              const r = rawRects[0];
              textBlocks.push({ text: cleanText, x: Math.round(r.left + sX), y: Math.round(r.top + sY), width: Math.round(r.width), height: Math.round(r.height), fontSize: Math.round(fSize) });
            } else if (rawRects.length > 1) {
              const totalRectW = rawRects.reduce((acc, r) => acc + r.width, 0) || 1;
              const words = cleanText.split(' ');
              let wordIdx = 0;
              rawRects.forEach((r, idx) => {
                if (wordIdx >= words.length) return;
                const cnt = idx === rawRects.length - 1 ? words.length - wordIdx : Math.max(1, Math.round((r.width / totalRectW) * words.length));
                const lineStr = words.slice(wordIdx, wordIdx + cnt).join(' ').trim();
                wordIdx += cnt;
                if (lineStr) {
                  textBlocks.push({ text: lineStr, x: Math.round(r.left + sX), y: Math.round(r.top + sY), width: Math.round(r.width), height: Math.round(r.height), fontSize: Math.round(fSize) });
                }
              });
            }
          } catch (_) {}
        }
      } catch (_) {}

      const linkBlocks = [];
      try {
        document.querySelectorAll('a[href]').forEach(a => {
          const rawHref = a.getAttribute('href') || '';
          if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) return;
          let absHref = '';
          try { absHref = new URL(rawHref, baseHref).href; } catch (_) {}
          if (!absHref || !/^https?:|^mailto:/i.test(absHref)) return;
          const s = window.getComputedStyle(a);
          if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return;
          Array.from(a.getClientRects()).filter(r => r.width > 4 && r.height > 4).forEach(r => {
            linkBlocks.push({ url: absHref, x: Math.round(r.left + sX), y: Math.round(r.top + sY), width: Math.round(r.width), height: Math.round(r.height) });
          });
        });
      } catch (_) {}

      function extractRuns(rootNode) {
        const runs = [];
        function walk(node, state) {
          if (!node) return;
          if (node.nodeType === 3) {
            const txt = node.nodeValue.replace(/\s+/g, ' ');
            if (txt) runs.push({ text: txt, bold: state.bold, italic: state.italic, href: state.href });
            return;
          }
          if (node.nodeType !== 1) return;
          const tag = node.tagName.toLowerCase();
          if (['script', 'style', 'noscript', 'svg', 'button'].includes(tag)) return;
          if (tag === 'br') { runs.push({ text: '\n', bold: false, italic: false, href: null }); return; }
          const cs = window.getComputedStyle(node);
          if (cs.display === 'none' || cs.visibility === 'hidden') return;
          const nextState = {
            bold: state.bold || tag === 'b' || tag === 'strong' || parseInt(cs.fontWeight, 10) >= 600,
            italic: state.italic || tag === 'i' || tag === 'em' || cs.fontStyle === 'italic',
            href: state.href
          };
          if (tag === 'a' && node.getAttribute('href')) {
            try {
              const resolved = new URL(node.getAttribute('href'), baseHref).href;
              if (/^https?:|^mailto:/i.test(resolved)) nextState.href = resolved;
            } catch (_) {}
          }
          Array.from(node.childNodes).forEach(ch => walk(ch, nextState));
        }
        walk(rootNode, { bold: false, italic: false, href: null });
        return runs;
      }

      const structuredItems = [];
      const seenImages = new Set();
      try {
        const rootScope = document.querySelector('article, main, [role="main"]') || document.body;
        rootScope.querySelectorAll('h1, h2, h3, h4, h5, h6, p, blockquote, ul, ol, table, pre, figure, img').forEach(el => {
          const s = window.getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return;
          if (el.closest('nav, footer, header:not(article header)')) return;
          const tag = el.tagName.toLowerCase();
          if (el.closest('table') && tag !== 'table') return;
          if (el.closest('ul, ol') && !['ul', 'ol'].includes(tag)) return;
          if (tag === 'img' && el.closest('figure')) return;

          if (tag.startsWith('h') && tag.length === 2) {
            const text = el.textContent.replace(/\s+/g, ' ').trim();
            if (text) structuredItems.push({ type: 'heading', level: parseInt(tag[1], 10) || 1, text, runs: extractRuns(el) });
          } else if (tag === 'p') {
            const text = el.textContent.replace(/\s+/g, ' ').trim();
            if (text) structuredItems.push({ type: 'paragraph', text, runs: extractRuns(el) });
          } else if (tag === 'blockquote') {
            const text = el.textContent.replace(/\s+/g, ' ').trim();
            if (text) structuredItems.push({ type: 'quote', text, runs: extractRuns(el) });
          } else if (tag === 'ul' || tag === 'ol') {
            const liItems = [];
            el.querySelectorAll(':scope > li').forEach(li => {
              const t = li.textContent.replace(/\s+/g, ' ').trim();
              if (t) liItems.push({ text: t, runs: extractRuns(li) });
            });
            if (liItems.length > 0) structuredItems.push({ type: 'list', isOrdered: tag === 'ol', items: liItems.map(x => x.text), richItems: liItems });
          } else if (tag === 'table') {
            const rows = [];
            el.querySelectorAll('tr').forEach(tr => {
              const cells = [];
              tr.querySelectorAll(':scope > th, :scope > td').forEach(td => {
                cells.push({ text: td.textContent.replace(/\s+/g, ' ').trim(), isHeader: td.tagName.toLowerCase() === 'th' });
              });
              if (cells.length > 0) rows.push(cells);
            });
            if (rows.length > 0) structuredItems.push({ type: 'table', rows });
          } else if (tag === 'pre') {
            const text = el.textContent.trim();
            if (text) structuredItems.push({ type: 'code', text });
          } else if (tag === 'figure' || tag === 'img') {
            const img = tag === 'img' ? el : el.querySelector('img');
            if (!img) return;
            const srcCand = img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src') || '';
            if (!srcCand || srcCand.includes('data:image/svg') || /avatar|logo|icon|pixel|spacer/i.test(srcCand)) return;
            const w = img.naturalWidth || img.clientWidth || 0;
            const h = img.naturalHeight || img.clientHeight || 0;
            if (w < 120 || h < 70) return;
            let absImg = srcCand;
            try { if (!absImg.startsWith('data:')) absImg = new URL(absImg, baseHref).href; } catch (_) {}
            if (seenImages.has(absImg)) return;
            seenImages.add(absImg);
            const capEl = tag === 'figure' ? el.querySelector('figcaption, [class*="caption"], [class*="epigrafe"]') : null;
            const caption = capEl ? capEl.textContent.replace(/\s+/g, ' ').trim() : (img.getAttribute('alt') || '');
            structuredItems.push({ type: 'image', src: absImg, width: w, height: h, caption });
          }
        });

        if (structuredItems.filter(it => it.type === 'paragraph').length === 0) {
          document.querySelectorAll('main div, article div, body div').forEach(div => {
            if (div.children.length > 2) return;
            const s = window.getComputedStyle(div);
            if (s.display === 'none' || s.visibility === 'hidden') return;
            const directText = Array.from(div.childNodes).filter(n => n.nodeType === 3).map(n => n.nodeValue.trim()).join(' ').trim();
            if (directText.length >= 45) structuredItems.push({ type: 'paragraph', text: directText, runs: [{ text: directText }] });
          });
        }
      } catch (_) {}

      const avoidCutZones = [];
      try {
        document.querySelectorAll('img, video, figure, iframe, picture, [class*="video"], [class*="player"]').forEach(el => {
          const s = window.getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return;
          const r = el.getBoundingClientRect();
          if (r.width >= 100 && r.height >= 70 && r.height <= 1600) {
            avoidCutZones.push({ top: Math.max(0, Math.round(r.top + sY)), bottom: Math.round(r.bottom + sY) });
          }
        });
      } catch (_) {}

      return {
        metrics: { title: document.title || 'documento_web', url: window.location.href, width: scrollW, height: scrollH, viewportHeight: vH, viewportWidth: vW, dpr: window.devicePixelRatio || 1 },
        pageTheme: { bgColor, isDark, bgR, bgG, bgB },
        textBlocks,
        linkBlocks,
        structuredItems,
        avoidCutZones
      };
    }, [{ visibleOnly }]);

    if (!pageData || !pageData.metrics) throw new Error("No se pudo obtener las métricas de la página.");

    const { metrics, pageTheme = { bgColor: '#ffffff', isDark: false, bgR: 255, bgG: 255, bgB: 255 } } = pageData;
    const textBlocks = pageData.textBlocks || [];
    const linkBlocks = pageData.linkBlocks || [];
    const structuredItems = pageData.structuredItems || [];
    const avoidCutZones = pageData.avoidCutZones || [];

    const viewportH = metrics.viewportHeight;
    const viewportW = metrics.viewportWidth;
    let totalHeight = Math.min(metrics.height, 28000);
    const isSingleScreen = visibleOnly || (totalHeight <= (viewportH + 20));

    const applyOutputScaling = (rawCanvas, cssWidth, cssHeight) => {
      const nativeScale = rawCanvas.width / Math.max(1, cssWidth);
      let desiredScale = useHighQuality ? Math.max(nativeScale, 1.5) : 1;
      if (useHighQuality && nativeScale < 2 && cssHeight * 2 <= 24000) desiredScale = 2;
      if (cssHeight * desiredScale > 26000) desiredScale = Math.max(0.75, 26000 / cssHeight);
      if (Math.abs(desiredScale - nativeScale) < 0.08) return rawCanvas;

      const scaled = document.createElement('canvas');
      scaled.width = Math.max(1, Math.round(cssWidth * desiredScale));
      scaled.height = Math.max(1, Math.round(cssHeight * desiredScale));
      const sctx = scaled.getContext('2d');
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(rawCanvas, 0, 0, scaled.width, scaled.height);
      return scaled;
    };

    if (isSingleScreen) {
      onProgress(70, visibleOnly ? "Capturando área visible en alta nitidez..." : "Capturando diseño de pantalla completa...");
      await executeInPage(() => { window._bwdLastBeat = Date.now(); });
      const img = await BwdShared.loadImageElement(await captureTabImage(tab, 'png'));
      const singleCanvas = document.createElement('canvas');
      singleCanvas.width = img.width;
      singleCanvas.height = img.height;
      singleCanvas.getContext('2d').drawImage(img, 0, 0);

      return {
        canvas: applyOutputScaling(singleCanvas, viewportW, viewportH),
        isSingleScreen: true,
        metrics: { ...metrics, height: visibleOnly ? viewportH : metrics.height },
        pageTheme, textBlocks, linkBlocks, structuredItems, avoidCutZones
      };
    }

    // 4. Captura multi-slice con solapamiento interior múltiplo de 8px
    onProgress(50, "Capturando secciones continuas sin costuras ni cabeceras repetidas...");
    const slices = [];
    let currentY = 0;
    let maxScrollY = Math.max(0, totalHeight - viewportH);
    let previousScrollY = -1;
    const { stepCss } = BwdShared.computeScrollStep(viewportH);

    while (currentY <= maxScrollY) {
      const targetScrollY = Math.min(currentY, maxScrollY);
      const isScrollSlice = slices.length >= 1;

      const stepInfo = await executeInPage(async (y, hideStickyHeaders) => {
        window._bwdLastBeat = Date.now();
        window.scrollTo({ top: y, left: 0, behavior: 'instant' });
        if (document.documentElement) document.documentElement.scrollTop = y;
        if (document.body) document.body.scrollTop = y;

        await new Promise(r => requestAnimationFrame(() => setTimeout(r, 150)));
        window._bwdLastBeat = Date.now();

        if (hideStickyHeaders && typeof window._bwdRecordStyle === 'function') {
          const vH = window.innerHeight || 800;
          document.querySelectorAll('*').forEach(el => {
            if (!el || ['HTML', 'BODY', 'MAIN', 'ARTICLE'].includes(el.tagName)) return;
            try {
              const s = window.getComputedStyle(el);
              if (s.position === 'fixed' || s.position === 'sticky') {
                const r = el.getBoundingClientRect();
                const isOverlayWrapper = !el.querySelector('article, main, h1, p') && (el.innerText || '').trim().length < 260;
                if ((r.height < vH * 0.78 || isOverlayWrapper) && s.visibility !== 'hidden') {
                  window._bwdRecordStyle(el, 'visibility');
                  window._bwdRecordStyle(el, 'opacity');
                  window._bwdRecordStyle(el, 'border-color');
                  window._bwdRecordStyle(el, 'box-shadow');
                  el.style.setProperty('visibility', 'hidden', 'important');
                  el.style.setProperty('opacity', '0', 'important');
                  el.style.setProperty('border-color', 'transparent', 'important');
                  el.style.setProperty('box-shadow', 'none', 'important');
                }
              }
            } catch (_) {}
          });
          await new Promise(r => requestAnimationFrame(r));
        }

        const actualY = Math.max(window.scrollY || 0, window.pageYOffset || 0, document.documentElement ? document.documentElement.scrollTop : 0, document.body ? document.body.scrollTop : 0);
        const liveH = Math.min(Math.max(document.body ? document.body.scrollHeight : 0, document.documentElement ? document.documentElement.scrollHeight : 0), 28000);
        return { actualY, liveH };
      }, [targetScrollY, isScrollSlice]);

      const actualScrollY = stepInfo ? stepInfo.actualY : targetScrollY;
      if (stepInfo && stepInfo.liveH > totalHeight) {
        totalHeight = stepInfo.liveH;
        maxScrollY = Math.max(0, totalHeight - viewportH);
      }
      if (currentY > 0 && actualScrollY <= previousScrollY + 0.5) break;

      const sliceUrl = await captureTabImage(tab, 'png');
      slices.push({ url: sliceUrl, actualScrollY });

      const pct = Math.min(74, 50 + Math.round((actualScrollY / Math.max(1, maxScrollY)) * 24));
      onProgress(pct, `Capturando sección ${slices.length}...`);

      previousScrollY = actualScrollY;
      if (currentY >= maxScrollY || actualScrollY >= maxScrollY - 1) break;
      currentY = actualScrollY + stepCss;
      if (currentY > maxScrollY && previousScrollY < maxScrollY - 1) currentY = maxScrollY;
    }

    if (slices.length === 1) {
      const img = await BwdShared.loadImageElement(slices[0].url);
      const singleCanvas = document.createElement('canvas');
      singleCanvas.width = img.width;
      singleCanvas.height = img.height;
      singleCanvas.getContext('2d').drawImage(img, 0, 0);
      return { canvas: applyOutputScaling(singleCanvas, viewportW, viewportH), isSingleScreen: true, metrics, pageTheme, textBlocks, linkBlocks, structuredItems, avoidCutZones };
    }

    onProgress(78, "Ensamblando documento continuo sin líneas ni costuras...");
    const firstImg = await BwdShared.loadImageElement(slices[0].url);
    const dprY = firstImg.height / Math.max(1, viewportH);
    const totalCssH = slices[slices.length - 1].actualScrollY + viewportH;

    const rawStitched = await BwdShared.stitchCapturedSlices(slices, {
      cropX: 0,
      cropY: 0,
      cropW: firstImg.width,
      cropH: Math.max(1, firstImg.height - 2),
      dprY
    });

    const finalCanvas = applyOutputScaling(rawStitched, viewportW, totalCssH);
    metrics.height = totalCssH;

    return {
      canvas: finalCanvas,
      isSingleScreen: false,
      metrics, pageTheme, textBlocks, linkBlocks, structuredItems, avoidCutZones
    };
  } finally {
    try {
      await executeInPage((orig) => {
        if (typeof window._bwdCleanupNow === 'function') window._bwdCleanupNow();
        else if (orig) window.scrollTo({ top: orig.y, left: orig.x, behavior: 'instant' });
      }, [initialScroll]);
    } catch (_) {}
  }
}
