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

    // Resolver imágenes perezosas en el string HTML para que no queden como placeholders vacíos
    cleanHtml = cleanHtml.replace(/<img\b([^>]*?)>/gi, (match, attrs) => {
      let newAttrs = attrs;
      const dataSrcMatch = attrs.match(/\bdata-src=["']([^"']+)["']/i);
      if (dataSrcMatch && dataSrcMatch[1]) {
        if (/\bsrc=["'][^"']*["']/i.test(newAttrs)) {
          newAttrs = newAttrs.replace(/\bsrc=["'][^"']*["']/i, `src="${dataSrcMatch[1]}"`);
        } else {
          newAttrs += ` src="${dataSrcMatch[1]}"`;
        }
      }
      const dataSrcsetMatch = attrs.match(/\bdata-srcset=["']([^"']+)["']/i);
      if (dataSrcsetMatch && dataSrcsetMatch[1]) {
        if (/\bsrcset=["'][^"']*["']/i.test(newAttrs)) {
          newAttrs = newAttrs.replace(/\bsrcset=["'][^"']*["']/i, `srcset="${dataSrcsetMatch[1]}"`);
        } else {
          newAttrs += ` srcset="${dataSrcsetMatch[1]}"`;
        }
      }
      newAttrs = newAttrs.replace(/\bloading=["']lazy["']/gi, 'loading="eager"');
      return `<img ${newAttrs}>`;
    });

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

    // Asegurar que las imágenes en el DOM del iframe tengan su URL real cargada
    frameDoc.querySelectorAll('img').forEach(img => {
      const dataSrc = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-src') || img.getAttribute('data-url');
      if (dataSrc && (!img.src || img.src.includes('placeholder') || img.src.startsWith('data:') || img.src.includes('svg'))) {
        img.src = dataSrc;
      }
      const dataSrcset = img.getAttribute('data-srcset');
      if (dataSrcset) {
        img.srcset = dataSrcset;
      }
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

    const images = Array.from(doc.querySelectorAll('img'));
    if (!images.length) return;

    let processed = 0;
    const total = images.length;

    await Promise.all(images.map(async (img) => {
      try {
        let targetUrl = '';

        // Si la imagen está en un <picture>, buscar primero en los <source>
        const parentPic = img.closest('picture');
        if (parentPic) {
          const sources = parentPic.querySelectorAll('source');
          for (const s of sources) {
            const srcset = s.getAttribute('srcset') || s.getAttribute('data-srcset');
            if (srcset) {
              const first = srcset.trim().split(/\s*,\s*|\s+/)[0];
              if (first && first.startsWith('http')) {
                targetUrl = first;
                break;
              }
            }
          }
        }

        if (!targetUrl) {
          const candidates = [
            img.currentSrc,
            img.getAttribute('src'),
            img.getAttribute('data-src'),
            img.getAttribute('data-original'),
            img.getAttribute('data-lazy-src'),
            img.getAttribute('data-url'),
            img.srcset ? img.srcset.trim().split(/\s*,\s*|\s+/)[0] : '',
            img.getAttribute('data-srcset') ? img.getAttribute('data-srcset').trim().split(/\s*,\s*|\s+/)[0] : ''
          ];
          targetUrl = candidates.find(c => c && typeof c === 'string' && c.startsWith('http') && !c.includes('placeholder') && !c.includes('data:image/svg'));
        }

        if (!targetUrl && img.src && img.src.startsWith('http')) {
          targetUrl = img.src;
        }

        // Si ya es un data URL válido de imagen, no necesitamos convertir
        if (img.src && img.src.startsWith('data:image') && !img.src.includes('placeholder')) {
          return;
        }

        if (targetUrl && targetUrl.startsWith('http')) {
          const resp = await fetch(targetUrl);
          if (resp.ok) {
            const blob = await resp.blob();
            await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                if (reader.result && reader.result.startsWith('data:image')) {
                  img.src = reader.result;
                  img.removeAttribute('srcset');
                  img.removeAttribute('data-src');
                  img.removeAttribute('data-srcset');
                  img.removeAttribute('loading');
                  img.setAttribute('loading', 'eager');

                  // Limpiar los <source> del <picture> para que el navegador use forzosamente img.src con data URL
                  if (parentPic) {
                    parentPic.querySelectorAll('source').forEach(s => s.remove());
                  }
                }
                resolve();
              };
              reader.onerror = resolve;
              reader.readAsDataURL(blob);
            });
          }
        }
      } catch (_) {
        // Fallback no bloqueante si falla una imagen individual
      } finally {
        processed++;
        if (total > 0 && processed % 4 === 0) {
          onProgress(`Descargando imágenes reales (${processed}/${total})...`, 15 + Math.round((processed / total) * 20));
        }
      }
    }));
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

    const targetEl = frameDoc.documentElement || frameDoc.body;
    const docHeight = Math.max(targetEl.scrollHeight, targetEl.offsetHeight, 1000);

    // Escala inteligente adaptativa:
    // Evita superar el límite de GPU de Firefox (32,767px) y reduce el peso drásticamente
    let scale = 2;
    if (docHeight > 10000) {
      scale = 1.35;
    } else if (docHeight > 5000) {
      scale = 1.5;
    }
    if (docHeight * scale > 28000) {
      scale = Math.max(1, 28000 / docHeight);
    }

    onProgress("Compilando vista de alta definición...", 40);

    return await window.html2canvas(targetEl, {
      useCORS: true,
      scale: scale,
      backgroundColor: '#ffffff',
      logging: false
    });
  }

  // Motor de rebanado unificado A4 con compresión JPEG 0.85 (Reduce 560MB a 5-8MB)
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
        dataUrl: pageCanvas.toDataURL('image/jpeg', 0.85),
        canvasWidth,
        canvasHeight,
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
        dataUrl: pageCanvas.toDataURL('image/jpeg', 0.85),
        canvasWidth,
        canvasHeight: currentSliceH,
        sliceHeightPx,
        isSingleScreen: false
      });

      currentY += sliceHeightPx;
      pageIndex++;
      onProgress(pageIndex, totalPages);
    }

    return slices;
  }

  // A. Descargar PDF Fiel
  btnEditorPdf.addEventListener('click', async () => {
    try {
      showExportModal("Generando PDF Fiel con tus ediciones...", "Iniciando captura sin distorsión...", 15);

      const canvas = await captureEditorCanvas((msg, pct) => showExportModal("Generando PDF Fiel...", msg, pct));

      showExportModal("Compilando archivo PDF...", "Aplicando compresión optimizada...", 65);

      const { jsPDF } = window.jspdf;
      const isLandscape = canvas.width >= canvas.height && (canvas.height <= canvas.width * 0.8);
      const orientation = isLandscape ? 'landscape' : 'portrait';
      const pageW = isLandscape ? 297 : 210;
      const pageH = isLandscape ? 210 : 297;
      const margin = 8;
      const usableW = pageW - (margin * 2);
      const usableH = pageH - (margin * 2);

      const pdf = new jsPDF({
        orientation: orientation,
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      const slices = sliceCanvasForA4(canvas, (current, total) => {
        const pct = Math.min(95, 65 + Math.round((current / total) * 25));
        showExportModal("Compilando archivo PDF...", `Paginando hoja ${current} de ${total}...`, pct);
      });

      slices.forEach((slice, idx) => {
        if (idx > 0) {
          pdf.addPage('a4', orientation);
        }

        if (slice.isSingleScreen) {
          const scale = Math.min(usableW / slice.canvasWidth, usableH / slice.canvasHeight);
          const renderW = slice.canvasWidth * scale;
          const renderH = slice.canvasHeight * scale;
          const posX = margin + (usableW - renderW) / 2;
          const posY = margin + (usableH - renderH) / 2;
          pdf.addImage(slice.dataUrl, 'JPEG', posX, posY, renderW, renderH, undefined, 'FAST');
        } else {
          const scale = usableW / slice.canvasWidth;
          const renderH = slice.canvasHeight * scale;
          pdf.addImage(slice.dataUrl, 'JPEG', margin, margin, usableW, renderH, undefined, 'FAST');
        }
      });

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

  // B. Exportar a Word (.doc fiel exactamente igual al PDF / web)
  btnEditorDocx.addEventListener('click', async () => {
    try {
      showExportModal("Generando documento Word (.doc)...", "Iniciando captura sin distorsión...", 15);

      const canvas = await captureEditorCanvas((msg, pct) => showExportModal("Generando documento Word...", msg, pct));

      showExportModal("Compilando documento Word...", "Generando páginas idénticas al PDF...", 65);

      const title = (cloneData && cloneData.title) ? cloneData.title : 'Documento Web Editado';

      const slices = sliceCanvasForA4(canvas, (current, total) => {
        const pct = Math.min(95, 65 + Math.round((current / total) * 25));
        showExportModal("Compilando documento Word...", `Generando página ${current} de ${total}...`, pct);
      });

      const pageImagesHtml = slices.map((slice, idx) => `
        <div class="bwd-word-page" style="${idx > 0 ? 'page-break-before: always; mso-break-type: page-break;' : ''} margin: 0; padding: 0; text-align: center;">
          <img src="${slice.dataUrl}" alt="Página ${idx + 1}" style="width: 7.6in; max-width: 100%; height: auto; display: block; margin: 0 auto;" />
        </div>
      `);

      const wordHtmlDoc = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
          <meta charset='utf-8'>
          <title>${title}</title>
          <!--[if gte mso 9]>
          <xml>
            <w:WordDocument>
              <w:View>Print</w:View>
              <w:Zoom>100</w:Zoom>
              <w:DoNotOptimizeForBrowser/>
            </w:WordDocument>
          </xml>
          <![endif]-->
          <style>
            @page WordSection1 {
              size: 210mm 297mm;
              margin: 8mm 8mm 8mm 8mm;
              mso-page-orientation: portrait;
              mso-header-margin: 0;
              mso-footer-margin: 0;
            }
            div.WordSection1 {
              page: WordSection1;
            }
            body {
              margin: 0;
              padding: 0;
              background-color: #ffffff;
            }
          </style>
        </head>
        <body>
          <div class="WordSection1">
            ${pageImagesHtml.join('\n')}
          </div>
        </body>
        </html>
      `;

      const blob = new Blob(['\ufeff' + wordHtmlDoc], { type: 'application/msword;charset=utf-8' });
      const filename = sanitizeName(title, 'doc');

      const downloadUrl = URL.createObjectURL(blob);
      triggerDownloadUrl(downloadUrl, filename);
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

      hideExportModal();
      showToast(`¡Documento Word (.doc) guardado fielmente! (${filename})`);
      setTool(activeTool);

    } catch (err) {
      console.error("Error al exportar Word:", err);
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

      const dataUrl = canvas.toDataURL('image/png');
      const filename = sanitizeName(cloneData ? cloneData.title : 'captura_editada', 'png');

      triggerDownloadUrl(dataUrl, filename);
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
