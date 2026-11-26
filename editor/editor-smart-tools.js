/**
 * ============================================================================
 * Webs-Docs — Herramientas Inteligentes del Creador (editor-smart-tools.js)
 * Encapsula Auto-Limpiar, Reacomodar (Mozilla Readability) y Auto-Censura PII.
 * ============================================================================
 */
(function (global) {
  'use strict';

  function createEditorSmartToolsController(ctx) {
    const {
      cloneFrame,
      btnAutoClean,
      btnReorganize,
      btnAutoRedact,
      btnUndo,
      readerControlsGroup,
      undoStack,
      getCloneData,
      getActiveTool,
      getRedactStyle,
      getIsReadabilityMode,
      setIsReadabilityMode,
      getReaderTheme,
      getReaderFontSize,
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
    } = ctx;

    const escapeHtml = global.BwdShared.escapeHtml;

    // ------------------------------------------------------------------------
    // 1. Auto-Limpieza Inteligente (Sin falsos positivos y desbloqueo de scroll)
    // ------------------------------------------------------------------------
    function cleanPageDom(frameDoc) {
      if (!frameDoc || !frameDoc.body) return 0;

      commitActiveTextEdit();
      clearInspectorHover();

      const adAndClutterSelectors = [
        'ins.adsbygoogle', 'iframe[id*="google_ads"]', 'iframe[src*="doubleclick"]',
        'iframe[src*="adnxs"]', 'iframe[src*="adsystem"]', 'iframe[src*="google.com/swg"]',
        'iframe[src*="serviceiframe"]', 'iframe[id*="serviceiframe"]', 'div[id*="google_ads"]',
        'div[id*="div-gpt-ad"]', 'div[id*="ad-container"]', 'div[class*="ad-container"]',
        'div[class*="advertisement"]', 'div[class*="ad-box"]', 'div[class*="ad-wrapper"]',
        'div[class*="ad-slot"]', 'div[class*="ads-area"]', 'div[class*="banner-ad"]',
        'div[class*="dfp-ad"]', 'div[class*="taboola"]', 'div[id*="taboola"]',
        'div[class*="outbrain"]', 'div[id*="outbrain"]', 'div[class*="teads"]',
        'div[id*="teads"]', '[data-ad-slot]', '[data-ad-unit]', '[data-ad-name]',
        '[data-ad-type]', '[data-google-query-id]', '.ln-placeholder', '[class*="placeholder-ad"]',
        '[class*="caja-comercial"]', '[class*="banner-comercial"]', '[class*="comercial-"]',
        '[class*="--comercial"]', '[class*="publicidad"]', '[id*="publicidad"]',
        '[class*="patrocinado"]', '[id*="patrocinado"]', '[class*="modulo-ad"]',
        '[class*="item-comercial"]', '[class*="LN10_"]', '[id*="LN10_"]',
        '[class*="publi-box"]', '[class*="modulo-publicidad"]', '[class*="banner-publicidad"]',
        '[class*="modulo-banners"]', '[class*="banner-top"]', '[class*="banner-middle"]',
        '[class*="banner-bottom"]', '[class*="banner-sidebar"]', '[class*="te-puede-interesar"]',
        '[class*="mas-leidas"]', '[class*="mas-vistas"]', '[class*="articulos-relacionados"]',
        '[class*="bloque-relacionadas"]', '[aria-label*="publicidad" i]', '[aria-label*="anuncio" i]',
        '#onetrust-consent-sdk', '#onetrust-banner-sdk', '#cookie-banner', '.cookie-banner',
        '.cookie-notice', '.cookie-law-info-bar', '[class*="cookie-consent"]',
        '[id*="cookie-consent"]', '[class*="cookie-modal"]', '[aria-label*="cookie" i]',
        '.modal-backdrop', '.swg-dialog', '[class*="swg-"]', '[id*="swg-"]',
        '[class*="newsletter-modal"]', '[class*="subscription-modal"]', '[class*="newsletter-popup"]',
        '[class*="popup-subscribe"]', '[class*="paywall-banner"]', '[class*="paywall"]',
        '[class*="suscripcion-banner"]', '[class*="banner-suscripcion"]', '[class*="hacete-socio"]',
        '[class*="btn-socio"]', '#disqus_thread', '[class*="facebook-comments"]',
        '[class*="social-share-fixed"]', '[class*="sticky-share"]', '[class*="share-bar-fixed"]',
        '[class*="barra-compartir"]', '[class*="floating-player"]', '[class*="flying-ad"]',
        '[class*="banner-flotante"]'
      ];

      const protectedTags = new Set(['HTML', 'HEAD', 'BODY', 'MAIN', 'ARTICLE', 'H1', 'H2', 'H3']);
      const itemsToRemove = [];
      const seen = new Set();

      adAndClutterSelectors.forEach(sel => {
        try {
          frameDoc.querySelectorAll(sel).forEach(el => {
            if (seen.has(el) || protectedTags.has(el.tagName)) return;
            const textLen = el.innerText ? el.innerText.trim().length : 0;
            const pCount = el.querySelectorAll('p').length;
            if ((pCount >= 3 && textLen > 450) || el.querySelector('article, main, h1')) return;

            let p = el.parentElement;
            while (p && p !== frameDoc.body) {
              if (seen.has(p)) return;
              p = p.parentElement;
            }
            seen.add(el);
            itemsToRemove.push(el);
          });
        } catch (_) {}
      });

      try {
        frameDoc.querySelectorAll('aside, [role="complementary"]').forEach(el => {
          if (seen.has(el)) return;
          if (el.closest('article') && (el.innerText || '').trim().length < 600 && !el.querySelector('[class*="ad"], [class*="publi"], [class*="relac"]')) return;
          if (el.querySelectorAll('p').length > 5) return;
          seen.add(el);
          itemsToRemove.push(el);
        });
      } catch (_) {}

      const win = cloneFrame.contentWindow || window;
      try {
        frameDoc.querySelectorAll('div, section, footer, aside').forEach(el => {
          if (seen.has(el) || protectedTags.has(el.tagName)) return;
          try {
            const style = win.getComputedStyle(el);
            if (style.position === 'fixed') {
              const rect = el.getBoundingClientRect();
              if (rect.bottom >= (win.innerHeight - 90) && rect.height > 0 && rect.height < 320) {
                if ((el.innerText ? el.innerText.trim().length : 0) < 350) {
                  seen.add(el);
                  itemsToRemove.push(el);
                }
              }
            }
          } catch (_) {}
        });
      } catch (_) {}

      // Detección de cabeceras duplicadas en coordenadas absolutas del documento
      try {
        const scrollY = win.scrollY || win.pageYOffset || 0;
        const navBars = Array.from(frameDoc.querySelectorAll('header, nav, [class*="header"], [id*="header"]')).filter(el => {
          if (!el || seen.has(el)) return false;
          const rect = el.getBoundingClientRect();
          return (rect.top + scrollY) <= 280 && rect.height > 24 && rect.height < 260;
        });

        for (let i = 0; i < navBars.length; i++) {
          for (let j = i + 1; j < navBars.length; j++) {
            const barA = navBars[i], barB = navBars[j];
            if (barA.contains(barB) || barB.contains(barA)) continue;
            const linksA = Array.from(barA.querySelectorAll('a')).map(a => a.href || a.textContent.trim()).filter(Boolean);
            const linksB = Array.from(barB.querySelectorAll('a')).map(a => a.href || a.textContent.trim()).filter(Boolean);
            if (linksA.length >= 2 && linksB.length >= 2) {
              const overlap = linksA.filter(l => linksB.includes(l)).length / Math.min(linksA.length, linksB.length);
              if (overlap >= 0.5) {
                const aMain = barA.tagName === 'HEADER' || Boolean(barA.querySelector('h1'));
                const bMain = barB.tagName === 'HEADER' || Boolean(barB.querySelector('h1'));
                const targetToRemove = (!aMain && bMain) ? barA : barB;
                if (!seen.has(targetToRemove)) {
                  seen.add(targetToRemove);
                  itemsToRemove.push(targetToRemove);
                }
              }
            }
          }
        }
      } catch (_) {}

      const batchItems = [];
      const styleFixes = [];
      const ghostRects = [];

      itemsToRemove.forEach(el => {
        const parent = el.parentNode;
        const nextSibling = el.nextSibling;
        if (parent) {
          const geo = captureElementDocGeometry(el);
          if (geo.docW >= 20 && geo.docH >= 14) ghostRects.push(geo);
          batchItems.push({ element: el, parent, nextSibling });
          el.remove();
          if (parent.nodeType === 1 && parent !== frameDoc.body && !parent.textContent.trim() && !parent.querySelector('img, svg, video, iframe, canvas, input')) {
            styleFixes.push({ el: parent, cssText: parent.style.cssText });
            parent.style.minHeight = '0px';
            parent.style.height = 'auto';
            parent.style.margin = '0px';
            parent.style.padding = '0px';
          }
        }
      });

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
        } catch (_) {}
      });

      if (batchItems.length > 0 || styleFixes.length > 0) {
        const count = Math.max(1, batchItems.length);
        pushHistoryAction({ type: 'batch_delete', items: batchItems, styleFixes, ghostRects }, count);
        return count;
      }
      return 0;
    }

    if (btnAutoClean) {
      btnAutoClean.addEventListener('click', () => {
        const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
        if (!frameDoc || !frameDoc.body) return;
        const count = cleanPageDom(frameDoc);
        showToast(count > 0
          ? `¡Auto-Limpieza lista! Se eliminaron ${count} bloques molestos y se liberó el scroll.`
          : "¡La página ya está limpia! No se detectaron anuncios o bloqueos.");
      });
    }

    // ------------------------------------------------------------------------
    // 2. Reacomodación Editorial con Mozilla Readability
    // ------------------------------------------------------------------------
    function applyReaderAppearance(frameDoc) {
      if (!frameDoc) return null;
      let styleEl = frameDoc.getElementById('bwd-readability-internal-styles');
      if (!styleEl) {
        styleEl = frameDoc.createElement('style');
        styleEl.id = 'bwd-readability-internal-styles';
        (frameDoc.head || frameDoc.documentElement).appendChild(styleEl);
      }

      const palettes = {
        light: { bg: '#ffffff', text: '#334155', heading: '#0f172a', muted: '#64748b', border: '#e2e8f0', badgeBg: 'rgba(56, 189, 248, 0.12)', badgeText: '#0284c7' },
        sepia: { bg: '#fbf6ec', text: '#3d3122', heading: '#231b10', muted: '#78664e', border: '#e6dac6', badgeBg: 'rgba(180, 83, 9, 0.12)', badgeText: '#92400e' },
        dark:  { bg: '#0b0e17', text: '#cbd5e1', heading: '#f8fafc', muted: '#94a3b8', border: '#1e293b', badgeBg: 'rgba(56, 189, 248, 0.16)', badgeText: '#38bdf8' }
      };
      const p = palettes[getReaderTheme()] || palettes.light;
      const fs = getReaderFontSize();

      styleEl.textContent = `
        html, body { background-color: ${p.bg} !important; color: ${p.text} !important; margin: 0 !important; padding: 0 !important; }
        .bwd-readability-container { max-width: 820px !important; margin: 28px auto 56px !important; padding: 0 28px !important; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif !important; color: ${p.text} !important; line-height: 1.78 !important; }
        .bwd-readability-header { margin-bottom: 28px !important; border-bottom: 1px solid ${p.border} !important; padding-bottom: 20px !important; }
        .bwd-readability-site { display: inline-block !important; padding: 3px 10px !important; border-radius: 6px !important; background: ${p.badgeBg} !important; color: ${p.badgeText} !important; font-size: 11.5px !important; font-weight: 700 !important; text-transform: uppercase !important; letter-spacing: 0.05em !important; margin-bottom: 14px !important; }
        .bwd-readability-title { font-size: ${Math.round(fs * 1.75)}px !important; font-weight: 800 !important; line-height: 1.24 !important; color: ${p.heading} !important; margin: 0 0 14px 0 !important; letter-spacing: -0.02em !important; }
        .bwd-readability-byline { font-size: 14px !important; color: ${p.muted} !important; margin-bottom: 12px !important; font-weight: 500 !important; }
        .bwd-readability-container p, .bwd-readability-container li { font-size: ${fs}px !important; line-height: 1.8 !important; margin: 0 0 20px 0 !important; color: ${p.text} !important; }
        .bwd-readability-container img { max-width: 100% !important; height: auto !important; border-radius: 8px !important; margin: 20px auto !important; display: block !important; }
        .bwd-readability-container figure { margin: 28px 0 !important; text-align: center !important; }
        .bwd-readability-container figcaption, .bwd-readability-container .caption, .bwd-readability-container .epigrafe { font-size: 13px !important; color: ${p.muted} !important; margin-top: 8px !important; text-align: center !important; font-style: italic !important; display: block !important; }
        .bwd-readability-container blockquote { border-left: 4px solid #38bdf8 !important; padding-left: 18px !important; margin: 26px 0 !important; font-style: italic !important; color: ${p.heading} !important; }
        .bwd-readability-container h2, .bwd-readability-container h3 { color: ${p.heading} !important; margin-top: 34px !important; margin-bottom: 14px !important; font-weight: 700 !important; }
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

      if (getIsReadabilityMode()) {
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
        const cloneData = getCloneData();
        const baseHref = frameDoc.baseURI || (cloneData && (cloneData.baseURI || cloneData.url)) || window.location.href;

        let leadImage = null;
        const leadSelectors = [
          '.article-main-media-image', '[class*="main-media"]', '[class*="lead-image"]',
          '[class*="lead-media"]', '[class*="featured-image"]', '[class*="featured-media"]',
          '[class*="foto-principal"]', '[class*="imagen-principal"]', '[class*="portada"]',
          'article figure', 'main figure'
        ];

        for (const sel of leadSelectors) {
          const container = frameDoc.querySelector(sel);
          if (!container) continue;
          const img = container.querySelector('img') || (container.tagName === 'IMG' ? container : null);
          if (!img || img.closest('[data-bwd-redacted]')) continue;
          const cands = [img.currentSrc, img.getAttribute('src'), img.getAttribute('data-src'), img.getAttribute('data-original')];
          const realSrc = cands.find(c => c && typeof c === 'string' && !c.includes('data:image/svg') && !c.includes('placeholder')) || '';
          if (realSrc && !realSrc.includes('avatar') && !realSrc.includes('logo') && !realSrc.includes('icon')) {
            let resolved = realSrc;
            try { if (!resolved.startsWith('data:')) resolved = new URL(resolved, baseHref).href; } catch (_) {}
            const capEl = container.querySelector('[class*="caption"], [class*="epigrafe"], figcaption, [class*="source"], [class*="credito"]');
            leadImage = { src: resolved, caption: capEl ? capEl.textContent.trim() : (img.getAttribute('alt') || '') };
            break;
          }
        }

        if (!leadImage) {
          for (const img of Array.from(frameDoc.querySelectorAll('article img, main img, img'))) {
            if (img.closest('header, nav, footer, aside, .sidebar, [data-bwd-redacted]')) continue;
            const realSrc = img.currentSrc || img.getAttribute('src') || '';
            if (realSrc && !realSrc.includes('data:image/svg') && !realSrc.includes('placeholder') && !realSrc.includes('avatar') && !realSrc.includes('logo')) {
              const w = img.naturalWidth || img.clientWidth || 0;
              if (w >= 180 || img.closest('article, main')) {
                let resolved = realSrc;
                try { if (!resolved.startsWith('data:')) resolved = new URL(resolved, baseHref).href; } catch (_) {}
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
            while (container.firstChild) fig.appendChild(container.firstChild);
            container.replaceWith(fig);
          }
        });

        const reader = new window.Readability(docClone, {
          charThreshold: 20,
          keepClasses: true,
          classesToPreserve: ['bwd-preserved-figure', 'bwd-redacted-box', 'bwd-redacted-blur', 'bwd-redacted-mask', 'caption', 'epigrafe', 'source', 'credito', 'bajada', 'copete']
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
          const alreadyPresent = Array.from(tempCheck.querySelectorAll('img')).some(im => normalizeUrlForCompare(im.getAttribute('src') || '', baseHref) === leadKey);
          if (!alreadyPresent) {
            leadImageHtml = `<figure class="bwd-readability-lead-figure"><img src="${escapeHtml(leadImage.src)}" alt="${escapeHtml(article.title || '')}">${leadImage.caption ? `<figcaption>${escapeHtml(leadImage.caption)}</figcaption>` : ''}</figure>`;
          }
        }

        const siteTitle = article.siteName || (cloneData && cloneData.title ? cloneData.title.split('-')[0].trim() : 'Artículo Web');
        const authorByline = article.byline ? `<div class="bwd-readability-byline">${escapeHtml(article.byline)}</div>` : '';
        const cleanArticleHtml = `<article class="bwd-readability-container"><header class="bwd-readability-header"><span class="bwd-readability-site">${escapeHtml(siteTitle)}</span><h1 class="bwd-readability-title">${escapeHtml(article.title || '')}</h1>${authorByline}</header>${leadImageHtml}<div class="bwd-readability-body">${article.content}</div></article>`;

        const parsedDoc = new DOMParser().parseFromString(cleanArticleHtml, 'text/html');
        const articleNode = parsedDoc.body.firstElementChild;
        if (articleNode) {
          articleNode.querySelectorAll('.bwd-redacted-box').forEach(el => el.setAttribute('data-bwd-redacted', 'solid'));
          articleNode.querySelectorAll('.bwd-redacted-blur').forEach(el => el.setAttribute('data-bwd-redacted', 'blur'));
          articleNode.querySelectorAll('.bwd-redacted-mask').forEach(el => el.setAttribute('data-bwd-redacted', 'mask'));
          frameDoc.body.replaceChildren(articleNode);
        }

        normalizeFrameMedia(frameDoc);
        const reorganizedNodes = Array.from(frameDoc.body.childNodes).map(n => n.cloneNode(true));

        setIsReadabilityMode(true);
        if (btnReorganize) btnReorganize.classList.add('is-active');
        if (readerControlsGroup) readerControlsGroup.style.display = 'inline-flex';

        pushHistoryAction({ type: 'full_reorganize', origNodes: savedNodes, newNodes: reorganizedNodes, styleEl }, 1);
        setTool(getActiveTool());
        await inlineAllImages(frameDoc).catch(() => {});

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
        if (frameDoc && frameDoc.body) reorganizeWithReadability(frameDoc);
      });
    }

    // ------------------------------------------------------------------------
    // 3. Auto-Censura Inteligente (Regex PII + Avatares/Perfiles)
    // ------------------------------------------------------------------------
    function autoRedactSensitiveData(frameDoc) {
      if (!frameDoc || !frameDoc.body) return 0;

      commitActiveTextEdit();
      closeImagePopover();
      clearInspectorHover();

      const redactStyle = getRedactStyle();
      const records = [];
      const wrappedSpans = [];

      const sensitiveSelectors = [
        'img[class*="avatar" i]', 'img[alt*="avatar" i]', 'img[class*="profile" i]',
        'img[id*="avatar" i]', '[class*="profile-pic" i]', '[class*="profile-image" i]',
        '[class*="user-name" i]', '[class*="username" i]', '[class*="user_name" i]',
        '[class*="account-number" i]', '[class*="card-number" i]', '[class*="cbu" i]',
        '[class*="iban" i]', 'a[href^="mailto:"]', 'a[href^="tel:"]'
      ];

      sensitiveSelectors.forEach(sel => {
        try {
          frameDoc.querySelectorAll(sel).forEach(el => {
            if (!el || el.tagName === 'BODY' || el.tagName === 'HTML') return;
            if (el.hasAttribute('data-bwd-redacted') || el.closest('[data-bwd-redacted]')) return;
            const rect = el.getBoundingClientRect();
            const blockChildren = el.querySelectorAll('p, section, article, table, ul, ol').length;
            if (rect.width > 520 || rect.height > 260 || blockChildren > 1) return;
            if (rect.width === 0 && rect.height === 0) return;
            const rec = applyElementRedaction(el, redactStyle);
            if (rec) records.push(rec);
          });
        } catch (_) {}
      });

      const piiCombinedRegex = /(\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:US\$|AR\$|MX\$|CLP\$|R\$|S\/|\$|€|£|USD|EUR|ARS|MXN|CLP|COP|PEN|BRL|USDT)\s?\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?\b|\b\d{1,3}(?:[.,\d]{3})+(?:[.,]\d{2})\s?(?:USD|EUR|ARS|MXN|USDT)\b|\b(?:\d[ -]?){13,22}\b|(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\b\d{2,4}[\s.-])\d{3,4}[\s.-]\d{4}\b)/gi;

      const textNodes = [];
      const walker = frameDoc.createTreeWalker(frameDoc.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue || node.nodeValue.trim().length < 4) return NodeFilter.FILTER_REJECT;
          const p = node.parentElement;
          if (!p) return NodeFilter.FILTER_REJECT;
          if (['script', 'style', 'noscript', 'textarea', 'svg', 'code', 'pre'].includes(p.tagName.toLowerCase())) return NodeFilter.FILTER_REJECT;
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
          const digitsOnly = rawMatch.replace(/\D/g, '');
          if (/^[\d\s-]+$/.test(rawMatch) && digitsOnly.length < 10) continue;

          matchedAny = true;
          if (match.index > lastIdx) frag.appendChild(frameDoc.createTextNode(text.slice(lastIdx, match.index)));

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
          if (lastIdx < text.length) frag.appendChild(frameDoc.createTextNode(text.slice(lastIdx)));
          if (node.parentNode) node.parentNode.replaceChild(frag, node);
        }
      });

      const totalRedacted = records.length + wrappedSpans.length;
      if (totalRedacted > 0) {
        pushHistoryAction({ type: 'batch_redact', records, wrappedSpans }, totalRedacted);
      }
      return totalRedacted;
    }

    if (btnAutoRedact) {
      btnAutoRedact.addEventListener('click', () => {
        const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
        if (!frameDoc) return;
        const redactedCount = autoRedactSensitiveData(frameDoc);
        showToast(redactedCount > 0
          ? `¡Auto-Censura completada! Se protegieron ${redactedCount} datos privados (emails, montos, cuentas o perfiles).`
          : "No se detectaron emails, montos ni perfiles adicionales. Usa 'Censurar' para selección manual.");
      });
    }

    return {
      cleanPageDom,
      applyReaderAppearance,
      reorganizeWithReadability,
      autoRedactSensitiveData
    };
  }

  global.createEditorSmartToolsController = createEditorSmartToolsController;
})(window);
