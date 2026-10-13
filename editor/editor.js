// ============================================================================
// BWD — Modo Creador Inteligente Controller (editor.js)
// Motor de edición visual interactiva en tiempo real y exportación fiel
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  const cloneFrame = document.getElementById('cloneFrame');
  const pageOriginEl = document.getElementById('pageOrigin');
  const changesCounterEl = document.getElementById('changesCounter');
  const activeToolHintEl = document.getElementById('activeToolHint');
  const toastNotification = document.getElementById('toastNotification');
  const toastMessage = document.getElementById('toastMessage');

  const toolEditBtn = document.getElementById('toolEdit');
  const toolDeleteBtn = document.getElementById('toolDelete');
  const toolRedactBtn = document.getElementById('toolRedact');
  const btnAutoRedact = document.getElementById('btnAutoRedact');
  const btnUndo = document.getElementById('btnUndo');
  const btnReset = document.getElementById('btnReset');

  const btnEditorPdf = document.getElementById('btnEditorPdf');
  const btnEditorDocx = document.getElementById('btnEditorDocx');
  const btnEditorPng = document.getElementById('btnEditorPng');

  const exportModal = document.getElementById('exportModal');
  const exportModalTitle = document.getElementById('exportModalTitle');
  const exportModalStatus = document.getElementById('exportModalStatus');
  const exportProgressBar = document.getElementById('exportProgressBar');

  let activeTool = 'edit'; // 'edit' | 'delete' | 'redact'
  let changesCount = 0;
  const undoStack = [];
  let originalHtmlBackup = '';
  let cloneData = null;

  // --------------------------------------------------------------------------
  // 1. Cargar datos del clon desde storage
  // --------------------------------------------------------------------------
  try {
    const res = await browser.storage.local.get('bwd_clone_data');
    cloneData = res.bwd_clone_data;

    if (!cloneData || !cloneData.html) {
      showToast("No se encontraron datos del clon. Abre una página y selecciona 'Creador Inteligente'.");
      pageOriginEl.textContent = 'Sin datos';
      return;
    }

    originalHtmlBackup = cloneData.html;
    pageOriginEl.textContent = cloneData.url || 'Página Web';
    document.title = `Creador Inteligente — ${cloneData.title || 'Documento'}`;

    renderClone(cloneData);

  } catch (err) {
    console.error("Error al cargar datos del clon:", err);
    showToast("Error al inicializar el editor.");
  }

  // --------------------------------------------------------------------------
  // 2. Renderizar el HTML en el iframe sin scripts invasivos
  // --------------------------------------------------------------------------
  function renderClone(data) {
    let cleanHtml = data.html;

    // Neutralizar scripts para evitar redirecciones o bloqueos
    cleanHtml = cleanHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // Inyectar base URI si no existe
    if (!/<base\b/i.test(cleanHtml)) {
      cleanHtml = cleanHtml.replace(/<head([^>]*)>/i, `<head$1><base href="${data.baseURI || data.url}">`);
    }

    // Estilos del editor inyectados dentro del iframe
    const editorInjectedStyles = `
      <style id="bwd-editor-internal-css">
        /* Estilos interactivos para el Modo Creador */
        body[data-bwd-tool="edit"] [contenteditable="true"]:focus {
          outline: 2px solid #3b82f6 !important;
          outline-offset: 2px !important;
          background-color: rgba(59, 130, 246, 0.08) !important;
          border-radius: 3px !important;
        }

        body[data-bwd-tool="delete"] *:hover {
          outline: 2px dashed #ef4444 !important;
          outline-offset: 1px !important;
          cursor: not-allowed !important;
          background-color: rgba(239, 68, 68, 0.1) !important;
        }

        body[data-bwd-tool="redact"] *:hover {
          outline: 2px dashed #8b5cf6 !important;
          outline-offset: 1px !important;
          cursor: crosshair !important;
          background-color: rgba(139, 92, 246, 0.12) !important;
        }

        .bwd-redacted-box {
          background-color: #0f172a !important;
          color: transparent !important;
          user-select: none !important;
          border-radius: 3px !important;
          filter: grayscale(100%) !important;
        }

        /* Eliminar placeholders grises de fondo (LN y otros sitios) */
        .ln-placeholder, [class*="placeholder"], [class*="--placeholder"] {
          background-image: none !important;
          background-color: transparent !important;
        }
      </style>
    `;

    cleanHtml = cleanHtml.replace(/<\/head>/i, `${editorInjectedStyles}</head>`);

    const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
    frameDoc.open();
    frameDoc.write(cleanHtml);
    frameDoc.close();

    cloneFrame.onload = () => {
      initFrameEvents();
      setTool(activeTool);
      // Descargar e incrustar imágenes reales en segundo plano
      inlineAllImages(frameDoc).catch(() => {});
    };
  }

  // --------------------------------------------------------------------------
  // 3. Manejo de Herramientas y Eventos en el Iframe
  // --------------------------------------------------------------------------
  function initFrameEvents() {
    const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
    if (!frameDoc || !frameDoc.body) return;

    frameDoc.body.setAttribute('data-bwd-tool', activeTool);

    // 1. Desenrollar cualquier etiqueta <picture> para que el DOM e html2canvas rendericen el <img> estándar
    frameDoc.querySelectorAll('picture').forEach(pic => {
      const img = pic.querySelector('img');
      if (img) {
        pic.replaceWith(img);
      }
    });

    // 2. Asegurar que las imágenes en el DOM del iframe tengan su URL absoluta real
    frameDoc.querySelectorAll('img').forEach(img => {
      const candidates = [
        img.getAttribute('data-src'),
        img.getAttribute('data-original'),
        img.getAttribute('data-lazy-src'),
        img.getAttribute('data-url'),
        img.getAttribute('data-retina'),
        img.currentSrc,
        img.getAttribute('src')
      ];

      let realSrc = '';
      for (const c of candidates) {
        if (c && typeof c === 'string' && !c.includes('data:image/svg') && !c.includes('placeholder')) {
          realSrc = c;
          break;
        }
      }

      if (realSrc && !realSrc.startsWith('data:image/jpeg') && !realSrc.startsWith('data:image/png')) {
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
      img.removeAttribute('loading');
      img.setAttribute('loading', 'eager');
    });

    // Desactivar navegación al hacer clic en enlaces
    frameDoc.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (link) {
        e.preventDefault();
      }
    }, true);

    // Evento de clic sobre elementos según la herramienta activa
    frameDoc.addEventListener('click', (e) => {
      const target = e.target;
      if (!target || target === frameDoc.body || target === frameDoc.documentElement) return;

      if (activeTool === 'delete') {
        e.preventDefault();
        e.stopPropagation();

        // Guardar para deshacer
        const parent = target.parentNode;
        const nextSibling = target.nextSibling;
        undoStack.push({
          type: 'delete',
          element: target,
          parent: parent,
          nextSibling: nextSibling
        });

        target.remove();
        incrementChanges();
        showToast("Elemento eliminado");

      } else if (activeTool === 'redact') {
        e.preventDefault();
        e.stopPropagation();

        const origBg = target.style.backgroundColor;
        const origColor = target.style.color;
        const hadClass = target.classList.contains('bwd-redacted-box');

        undoStack.push({
          type: 'redact',
          element: target,
          origBg,
          origColor,
          hadClass
        });

        target.classList.add('bwd-redacted-box');
        target.style.backgroundColor = '#0f172a';
        target.style.color = 'transparent';
        target.style.borderRadius = '3px';

        incrementChanges();
        showToast("Dato confidencial censurado");
      }
    }, true);

    // En modo editar texto: habilitar contenteditable al enfocar o hacer doble clic
    frameDoc.addEventListener('dblclick', (e) => {
      if (activeTool === 'edit' && e.target && e.target.isContentEditable !== true) {
        enableTextEditing(e.target);
      }
    }, true);

    frameDoc.addEventListener('focusin', (e) => {
      if (activeTool === 'edit' && e.target) {
        enableTextEditing(e.target);
      }
    }, true);

    frameDoc.addEventListener('input', () => {
      incrementChanges();
    }, true);
  }

  function enableTextEditing(element) {
    if (!element || element.tagName === 'BODY' || element.tagName === 'HTML') return;
    if (element.children.length === 0 || Array.from(element.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 0)) {
      if (!element.isContentEditable) {
        const oldText = element.innerText;
        element.contentEditable = "true";
        element.focus();

        element.addEventListener('blur', function onBlur() {
          element.removeEventListener('blur', onBlur);
          if (element.innerText !== oldText) {
            undoStack.push({
              type: 'text',
              element: element,
              oldText: oldText,
              newText: element.innerText
            });
          }
        }, { once: true });
      }
    }
  }

  function setTool(tool) {
    activeTool = tool;

    // Actualizar botones de UI
    toolEditBtn.classList.toggle('is-active', tool === 'edit');
    toolDeleteBtn.classList.toggle('is-active', tool === 'delete');
    toolRedactBtn.classList.toggle('is-active', tool === 'redact');

    // Actualizar atributo en iframe
    const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
    if (frameDoc && frameDoc.body) {
      frameDoc.body.setAttribute('data-bwd-tool', tool);

      // Si es edit, habilitar contenteditable en elementos de texto principales
      if (tool === 'edit') {
        frameDoc.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, a, td, th, li, button, label').forEach(el => {
          el.contentEditable = "true";
        });
        activeToolHintEl.textContent = "Modo Editar Texto activo: Haz clic directamente en cualquier texto o título para reescribirlo.";
      } else {
        frameDoc.querySelectorAll('[contenteditable="true"]').forEach(el => {
          el.removeAttribute('contenteditable');
        });

        if (tool === 'delete') {
          activeToolHintEl.textContent = "Modo Eliminar Elemento: Haz clic sobre cualquier bloque, avatar o anuncio para borrarlo de la página.";
        } else if (tool === 'redact') {
          activeToolHintEl.textContent = "Modo Censurar Datos: Haz clic sobre nombres, números o datos privados para cubrirlos con una barra de confidencialidad.";
        }
      }
    }
  }

  function incrementChanges() {
    changesCount++;
    changesCounterEl.textContent = `${changesCount} cambio${changesCount === 1 ? '' : 's'} realizado${changesCount === 1 ? '' : 's'}`;
  }

  // --------------------------------------------------------------------------
  // 4. Auto-Censura Inteligente de Perfil
  // --------------------------------------------------------------------------
  btnAutoRedact.addEventListener('click', () => {
    const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
    if (!frameDoc) return;

    let redactedCount = 0;

    // Detectar selectores comunes de avatar, perfil, nombres y balances
    const sensitiveSelectors = [
      '[class*="avatar"]', '[class*="profile-pic"]', '[class*="profile-image"]',
      '[class*="user-name"]', '[class*="username"]', '[class*="user_name"]',
      '[id*="avatar"]', '[id*="profile"]', '[aria-label*="perfil" i]',
      '[aria-label*="profile" i]', '[class*="balance"]', '[class*="account-number"]'
    ];

    sensitiveSelectors.forEach(sel => {
      frameDoc.querySelectorAll(sel).forEach(el => {
        if (!el.classList.contains('bwd-redacted-box') && el.tagName !== 'BODY') {
          el.classList.add('bwd-redacted-box');
          el.style.backgroundColor = '#0f172a';
          el.style.color = 'transparent';
          el.style.borderRadius = '3px';
          redactedCount++;
        }
      });
    });

    if (redactedCount > 0) {
      incrementChanges();
      showToast(`¡Se censuraron ${redactedCount} elementos de perfil automáticamente!`);
    } else {
      showToast("No se detectaron perfiles obvios. Usa 'Censurar Datos' para seleccionar manualmente.");
    }
  });

  // --------------------------------------------------------------------------
  // 5. Deshacer y Restablecer
  // --------------------------------------------------------------------------
  btnUndo.addEventListener('click', () => {
    if (undoStack.length === 0) {
      showToast("No hay más acciones para deshacer.");
      return;
    }

    const lastAction = undoStack.pop();

    if (lastAction.type === 'delete') {
      if (lastAction.parent) {
        lastAction.parent.insertBefore(lastAction.element, lastAction.nextSibling);
        showToast("Elemento restaurado");
      }
    } else if (lastAction.type === 'redact') {
      lastAction.element.classList.remove('bwd-redacted-box');
      lastAction.element.style.backgroundColor = lastAction.origBg || '';
      lastAction.element.style.color = lastAction.origColor || '';
      showToast("Censura deshecha");
    } else if (lastAction.type === 'text') {
      lastAction.element.innerText = lastAction.oldText;
      showToast("Texto restaurado");
    }
  });

  btnReset.addEventListener('click', () => {
    if (confirm("¿Deseas restablecer todos los cambios al diseño original del clon?")) {
      renderClone(cloneData);
      changesCount = 0;
      changesCounterEl.textContent = '0 cambios realizados';
      undoStack.length = 0;
      showToast("Página restablecida al clon inicial.");
    }
  });

  // Atajo de teclado Ctrl+Z para deshacer
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      btnUndo.click();
    }
  });

  // Listeners de barra de herramientas
  toolEditBtn.addEventListener('click', () => setTool('edit'));
  toolDeleteBtn.addEventListener('click', () => setTool('delete'));
  toolRedactBtn.addEventListener('click', () => setTool('redact'));

  // --------------------------------------------------------  // --------------------------------------------------------------------------
  // --------------------------------------------------------------------------
  // 6. Inliner Universal de Imágenes Reales (Bypass de CORS y Eliminación de Cajas Grises)
  // --------------------------------------------------------------------------

  async function inlineAllImages(doc, onProgress = () => {}) {
    if (!doc) return;

    // 1. Eliminar background de placeholders (LN u otros portales)
    let placeholderStyle = doc.getElementById('bwd-no-placeholder-style');
    if (!placeholderStyle) {
      placeholderStyle = doc.createElement('style');
      placeholderStyle.id = 'bwd-no-placeholder-style';
      placeholderStyle.textContent = `
        .ln-placeholder, [class*="placeholder"], [class*="--placeholder"] {
          background-image: none !important;
          background-color: transparent !important;
        }
      `;
      (doc.head || doc.body).appendChild(placeholderStyle);
    }

    // 2. Desenrollar cualquier etiqueta <picture> restante en el iframe
    doc.querySelectorAll('picture').forEach(pic => {
      const img = pic.querySelector('img');
      if (img) pic.replaceWith(img);
    });

    const images = Array.from(doc.querySelectorAll('img'));
    if (!images.length) return;

    let processed = 0;
    const total = images.length;

    await Promise.all(images.map(async (img) => {
      try {
        // Si YA es una imagen bitmap real en base64 (jpeg, png, webp), no re-descargar
        if (img.src && (img.src.startsWith('data:image/jpeg') || img.src.startsWith('data:image/png') || img.src.startsWith('data:image/webp'))) {
          return;
        }

        let targetUrl = '';
        const candidates = [
          img.getAttribute('data-src'),
          img.getAttribute('data-original'),
          img.getAttribute('data-lazy-src'),
          img.getAttribute('data-url'),
          img.getAttribute('data-retina'),
          img.getAttribute('srcset'),
          img.getAttribute('data-srcset'),
          img.getAttribute('src'),
          img.currentSrc
        ];

        for (const c of candidates) {
          if (c && typeof c === 'string' && !c.includes('data:image/svg') && !c.includes('placeholder')) {
            const first = c.trim().split(/\s*,\s*|\s+/)[0];
            if (first && !first.includes('data:image/svg')) {
              targetUrl = first;
              break;
            }
          }
        }

        if (!targetUrl && img.src && !img.src.includes('data:image/svg')) {
          targetUrl = img.src;
        }

        if (!targetUrl) return;

        // Convertir a URL absoluta contra la baseURI o URL del documento clonado
        let absUrl = targetUrl;
        try {
          absUrl = new URL(targetUrl, doc.baseURI || cloneData?.baseURI || cloneData?.url || window.location.href).href;
        } catch (_) {}

        if (!absUrl.startsWith('http')) return;

        // Descargar usando fetch privilegiado de la extensión (sin bloqueo CORS)
        const resp = await fetch(absUrl);
        if (resp.ok) {
          const blob = await resp.blob();
          await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              if (reader.result && reader.result.startsWith('data:image/')) {
                img.setAttribute('src', reader.result);
                img.src = reader.result;
                img.removeAttribute('srcset');
                img.removeAttribute('data-src');
                img.removeAttribute('data-original');
                img.removeAttribute('data-lazy-src');
                img.removeAttribute('data-srcset');
                img.removeAttribute('loading');
                img.setAttribute('loading', 'eager');
              }
              resolve();
            };
            reader.onerror = resolve;
            reader.readAsDataURL(blob);
          });
        }
      } catch (_) {
        // Silencioso por imagen si falla la red en un asset individual
      } finally {
        processed++;
        if (total > 0 && (processed % 2 === 0 || processed === total)) {
          onProgress(`Descargando e incrustando imágenes (${processed}/${total})...`, 15 + Math.round((processed / total) * 20));
        }
      }
    }));

    // Esperar a que todas las imágenes del iframe se decodifiquen antes de renderizar canvas
    await Promise.all(images.map(img => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise(res => {
        img.onload = res;
        img.onerror = res;
        setTimeout(res, 2000);
      });
    }));
  }

  // Detección automática del color de fondo y tema de la página clonada
  function detectPageTheme(doc) {
    let bgColor = '#ffffff';
    let isDark = false;
    let bgR = 255, bgG = 255, bgB = 255;
    try {
      const body = doc.body;
      const docEl = doc.documentElement;
      const bodyStyle = window.getComputedStyle(body);
      const docStyle = window.getComputedStyle(docEl);

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
    } catch (_) {}

    return { bgColor, isDark, bgR, bgG, bgB };
  }

  async function captureEditorCanvas(onProgress = () => {}) {
    const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;

    // Desactivar temporalmente cursores de edición y cajas de foco
    frameDoc.querySelectorAll('[contenteditable="true"]').forEach(el => el.removeAttribute('contenteditable'));

    onProgress("Descargando e incrustando imágenes reales...", 15);

    // 1. Descargar todas las imágenes vía fetch con permisos de extensión y convertirlas a data URLs
    await inlineAllImages(frameDoc, (msg, pct) => onProgress(msg, pct));

    // 2. Breve espera para que el DOM del iframe actualice la vista con las nuevas data URLs
    await new Promise(r => setTimeout(r, 300));

    // 3. Reseteo absoluto de scroll: Evita que desplazamientos del usuario recorten la parte superior
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
    frameDoc.querySelectorAll('*').forEach(el => {
      if (el.scrollTop) el.scrollTop = 0;
      if (el.scrollLeft) el.scrollLeft = 0;
    });

    // 4. Medir dimensiones reales completas del documento sin recortes
    const body = frameDoc.body;
    const docEl = frameDoc.documentElement;
    const fullWidth = Math.max(
      body ? body.scrollWidth : 0,
      body ? body.offsetWidth : 0,
      docEl ? docEl.clientWidth : 0,
      docEl ? docEl.scrollWidth : 0,
      docEl ? docEl.offsetWidth : 0,
      win ? win.innerWidth : 1200
    );
    const fullHeight = Math.max(
      body ? body.scrollHeight : 0,
      body ? body.offsetHeight : 0,
      docEl ? docEl.clientHeight : 0,
      docEl ? docEl.scrollHeight : 0,
      docEl ? docEl.offsetHeight : 0,
      win ? win.innerHeight : 800
    );

    // Escala adaptativa para alta definición sin exceder el límite de GPU
    let scale = 2;
    if (fullHeight > 10000) {
      scale = 1.35;
    } else if (fullHeight > 5000) {
      scale = 1.5;
    }
    if (fullHeight * scale > 28000) {
      scale = Math.max(1, 28000 / fullHeight);
    }

    const { bgColor } = detectPageTheme(frameDoc);

    onProgress("Compilando vista de alta definición sin recortes...", 40);

    let canvas;
    try {
      canvas = await window.html2canvas(docEl || body, {
        useCORS: true,
        scale: scale,
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
          if (clonedDoc.defaultView) {
            clonedDoc.defaultView.scrollTo(0, 0);
          }
          if (clonedDoc.documentElement) {
            clonedDoc.documentElement.scrollTop = 0;
            clonedDoc.documentElement.style.overflow = 'visible';
            clonedDoc.documentElement.style.height = 'auto';
          }
          if (clonedDoc.body) {
            clonedDoc.body.scrollTop = 0;
            clonedDoc.body.style.overflow = 'visible';
            clonedDoc.body.style.height = 'auto';
          }

          // Inyectar regla global para suprimir barras de desplazamiento en la captura
          const styleEl = clonedDoc.createElement('style');
          styleEl.textContent = `
            *, *::before, *::after {
              scrollbar-width: none !important;
              -ms-overflow-style: none !important;
            }
            *::-webkit-scrollbar,
            html::-webkit-scrollbar,
            body::-webkit-scrollbar {
              display: none !important;
              width: 0px !important;
              height: 0px !important;
              background: transparent !important;
            }
            *::-webkit-scrollbar-thumb,
            *::-webkit-scrollbar-track {
              display: none !important;
              background: transparent !important;
            }
            html, body {
              scrollbar-width: none !important;
              overflow-x: hidden !important;
            }
          `;
          if (clonedDoc.head) clonedDoc.head.appendChild(styleEl);

          clonedDoc.querySelectorAll('*').forEach(el => {
            if (el.scrollTop) el.scrollTop = 0;
            if (el.scrollLeft) el.scrollLeft = 0;

            try {
              if (clonedDoc.defaultView) {
                const s = clonedDoc.defaultView.getComputedStyle(el);
                if (s && s.position === 'sticky') {
                  el.style.setProperty('position', 'static', 'important');
                }
                if (s && (s.overflowX === 'scroll' || s.overflowX === 'auto')) {
                  el.style.setProperty('scrollbar-width', 'none', 'important');
                }
              }
            } catch (_) {}
          });
          clonedDoc.querySelectorAll('input, textarea').forEach(inp => {
            if (inp.value) inp.setAttribute('value', inp.value);
          });
        }
      });
    } finally {
      // Restaurar el scroll del usuario para que su navegación no sufra saltos
      if (win) win.scrollTo(prevScrollX, prevScrollY);
    }

    return canvas;
  }

  // Motor de rebanado unificado A4 con compresión JPEG 0.90
  function sliceCanvasForA4(canvas, onProgress = () => {}) {
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    // Relación de aspecto A4 estándar: Ancho útil 194mm, Alto útil 281mm -> Ratio = 281 / 194 ≈ 1.4484
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
        dataUrl: pageCanvas.toDataURL('image/jpeg', 0.90),
        width: canvasWidth,
        height: canvasHeight,
        isSingleScreen: true
      }];
    }

    const slices = [];
    let currentY = 0;
    let pageIndex = 0;
    const totalPages = Math.ceil(canvasHeight / sliceHeightPx);

    while (currentY < canvasHeight) {
      const currentSliceH = Math.min(sliceHeightPx, canvasHeight - currentY);
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvasWidth;
      pageCanvas.height = currentSliceH;

      const pctx = pageCanvas.getContext('2d');
      pctx.fillStyle = '#ffffff';
      pctx.fillRect(0, 0, canvasWidth, currentSliceH);
      pctx.drawImage(canvas, 0, currentY, canvasWidth, currentSliceH, 0, 0, canvasWidth, currentSliceH);

      slices.push({
        dataUrl: pageCanvas.toDataURL('image/jpeg', 0.90),
        width: canvasWidth,
        height: currentSliceH,
        sliceHeightPx,
        isSingleScreen: false
      });

      currentY += sliceHeightPx;
      pageIndex++;
      onProgress(pageIndex, totalPages);
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

  function extractEditorTextBlocks(frameDoc) {
    const textBlocks = [];
    if (!frameDoc || !frameDoc.body) return textBlocks;

    const win = cloneFrame.contentWindow || window;
    const walker = frameDoc.createTreeWalker(frameDoc.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.textContent || !node.textContent.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest('.bwd-redacted-box') || parent.classList.contains('bwd-redacted-box')) {
          return NodeFilter.FILTER_REJECT;
        }
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
      const raw = tNode.textContent;
      const clean = raw.replace(/\s+/g, ' ');
      if (!clean.trim()) continue;

      const parent = tNode.parentElement;
      const style = win.getComputedStyle(parent);
      const fSize = parseFloat(style.fontSize) || 14;

      try {
        range.selectNodeContents(tNode);
        const rects = range.getClientRects();
        if (rects && rects.length > 0) {
          const r = rects[0];
          if (r.width > 2 && r.height > 2) {
            textBlocks.push({
              text: clean.trim(),
              x: Math.round(r.left + sX),
              y: Math.round(r.top + sY),
              width: Math.round(r.width),
              height: Math.round(r.height),
              fontSize: Math.round(fSize)
            });
          }
        } else {
          const bRect = parent.getBoundingClientRect();
          if (bRect.width > 2 && bRect.height > 2) {
            textBlocks.push({
              text: clean.trim(),
              x: Math.round(bRect.left + sX),
              y: Math.round(bRect.top + sY),
              width: Math.round(bRect.width),
              height: Math.round(bRect.height),
              fontSize: Math.round(fSize)
            });
          }
        }
      } catch (_) {}
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
      if (el.closest('.bwd-redacted-box') || el.classList.contains('bwd-redacted-box')) return;
      const s = win.getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return;

      if (el.closest('table') && el.tagName.toLowerCase() !== 'table') return;
      if (el.closest('ul, ol') && !['ul', 'ol'].includes(el.tagName.toLowerCase())) return;

      const tag = el.tagName.toLowerCase();

      if (tag.startsWith('h')) {
        const level = parseInt(tag[1], 10) || 1;
        const text = el.textContent.trim();
        if (text) structuredItems.push({ type: 'heading', level, text });
      } else if (tag === 'p') {
        const text = el.textContent.trim();
        if (text) structuredItems.push({ type: 'paragraph', text });
      } else if (tag === 'blockquote') {
        const text = el.textContent.trim();
        if (text) structuredItems.push({ type: 'quote', text });
      } else if (tag === 'ul' || tag === 'ol') {
        const liTexts = [];
        el.querySelectorAll(':scope > li, li').forEach(li => {
          if (li.closest('.bwd-redacted-box')) return;
          const t = li.textContent.trim();
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
            if (td.closest('.bwd-redacted-box')) return;
            cells.push({
              text: td.textContent.trim(),
              isHeader: td.tagName.toLowerCase() === 'th'
            });
          });
          if (cells.length > 0) rows.push(cells);
        });
        if (rows.length > 0) structuredItems.push({ type: 'table', rows });
      } else if (tag === 'pre') {
        const text = el.textContent.trim();
        if (text) structuredItems.push({ type: 'code', text });
      }
    });

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

  // A. Descargar PDF Fiel
  btnEditorPdf.addEventListener('click', async () => {
    try {
      showExportModal("Generando PDF Fiel con tus ediciones...", "Iniciando captura sin distorsión...", 15);

      const canvas = await captureEditorCanvas((msg, pct) => showExportModal("Generando PDF Fiel...", msg, pct));

      showExportModal("Compilando archivo PDF...", "Generando página continua sin saltos...", 70);

      const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
      const { isDark, bgR, bgG, bgB, bgColor } = detectPageTheme(frameDoc);

      const { jsPDF } = window.jspdf;
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;

      const isLandscape = canvasWidth > canvasHeight;
      const orientation = isLandscape ? 'landscape' : 'portrait';

      // Exportar en 1 sola página completa con las dimensiones reales del contenido (sin saltos)
      const pdf = new jsPDF({
        orientation: orientation,
        unit: 'px',
        format: [canvasWidth, canvasHeight],
        hotfixes: ['px_scaling'],
        compress: true
      });

      // Si la página original es tema oscuro, pintar el fondo para evitar bordes o transparencias desentonadas
      if (isDark) {
        pdf.setFillColor(bgR, bgG, bgB);
        pdf.rect(0, 0, canvasWidth, canvasHeight, 'F');
      }

      showExportModal("Compilando archivo PDF...", "Aplicando compresión optimizada...", 85);

      // Preparar canvas con fondo limpio para preservar nitidez y evitar fondos negros en JPEG
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = canvasWidth;
      exportCanvas.height = canvasHeight;
      const ectx = exportCanvas.getContext('2d');
      ectx.fillStyle = bgColor || (isDark ? `rgb(${bgR},${bgG},${bgB})` : '#ffffff');
      ectx.fillRect(0, 0, canvasWidth, canvasHeight);
      ectx.drawImage(canvas, 0, 0);

      const imgData = exportCanvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(imgData, 'JPEG', 0, 0, canvasWidth, canvasHeight, undefined, 'FAST');

      // Incrustar capa de texto nativo invisible (ISO 32000-1 modo '3 Tr')
      // Permite selección de texto con ratón, copiar y buscar (Ctrl+F) como OCR nativo de alta precisión
      const textBlocks = extractEditorTextBlocks(frameDoc);
      if (textBlocks && textBlocks.length > 0) {
        showExportModal("Compilando archivo PDF...", "Incrustando capa de texto seleccionable (OCR)...", 90);
        const docEl = frameDoc.documentElement;
        const bEl = frameDoc.body;
        const fullW = Math.max(
          bEl ? bEl.scrollWidth : 0,
          docEl ? docEl.scrollWidth : 0,
          docEl ? docEl.clientWidth : 0,
          1
        );
        const fullH = Math.max(
          bEl ? bEl.scrollHeight : 0,
          docEl ? docEl.scrollHeight : 0,
          docEl ? docEl.clientHeight : 0,
          1
        );
        const scaleX = canvasWidth / fullW;
        const scaleY = canvasHeight / fullH;

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
          } catch (_) {}
        }
      }

      showExportModal("Compilando archivo PDF...", "Guardando documento...", 95);

      const filename = sanitizeName(cloneData ? cloneData.title : 'documento_editado', 'pdf');
      pdf.save(filename);

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

  // B. Exportar a Word (.docx nativo OpenXML con fidelidad 1:1 idéntica al PDF)
  btnEditorDocx.addEventListener('click', async () => {
    try {
      showExportModal("Generando documento Word (.docx)...", "Iniciando captura sin distorsión...", 15);

      const canvas = await captureEditorCanvas((msg, pct) => showExportModal("Generando documento Word...", msg, pct));

      showExportModal("Compilando documento Word...", "Rebanando páginas en proporción A4...", 65);

      const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
      const structuredItems = extractEditorStructuredItems(frameDoc);

      const title = (cloneData && cloneData.title) ? cloneData.title : 'Documento Web Editado';
      const isLandscape = canvas.width >= canvas.height && (canvas.height <= canvas.width * 0.8);

      const slices = sliceCanvasForA4(canvas, (current, total) => {
        const pct = Math.min(92, 65 + Math.round((current / total) * 25));
        showExportModal("Compilando documento Word...", `Generando página ${current} de ${total}...`, pct);
      });

      showExportModal("Empaquetando documento Word...", "Generando paquete OpenXML (.docx)...", 94);
      const docxUint8 = buildDocx(slices, isLandscape, structuredItems);

      const blob = new Blob([docxUint8], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      const filename = sanitizeName(title, 'docx');

      triggerDownloadBlob(blob, filename);

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
      showExportModal("Generando imagen PNG HD...", "Iniciando renderizado fiel...", 30);

      const canvas = await captureEditorCanvas((msg, pct) => showExportModal("Generando imagen PNG HD...", msg, pct));

      const filename = sanitizeName(cloneData ? cloneData.title : 'captura_editada', 'png');

      await new Promise((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) {
            triggerDownloadBlob(blob, filename);
          } else {
            const dataUrl = canvas.toDataURL('image/png');
            triggerDownloadUrl(dataUrl, filename);
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

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------
  function canvasHeight(c) {
    return c.height || 1;
  }

  function sanitizeName(name, ext) {
    const clean = (name || 'documento')
      .toLowerCase()
      .replace(/[^\w\s-]/gi, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 50);
    return `${clean}_editado.${ext}`;
  }

  function triggerDownloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    triggerDownloadUrl(url, filename);
  }

  function triggerDownloadUrl(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
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
    toastMessage.textContent = msg;
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
