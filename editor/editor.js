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
    };
  }

  // --------------------------------------------------------------------------
  // 3. Manejo de Herramientas y Eventos en el Iframe
  // --------------------------------------------------------------------------
  function initFrameEvents() {
    const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
    if (!frameDoc || !frameDoc.body) return;

    frameDoc.body.setAttribute('data-bwd-tool', activeTool);

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

  // --------------------------------------------------------------------------
  // 6. Motores de Exportación Directa desde el Editor
  // --------------------------------------------------------------------------

  // A. Descargar PDF Fiel
  btnEditorPdf.addEventListener('click', async () => {
    try {
      showExportModal("Generando PDF Fiel con tus ediciones...", "Procesando resolución...", 30);

      const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
      const targetEl = frameDoc.documentElement;

      // Desactivar temporalmente cursores de edición
      frameDoc.querySelectorAll('[contenteditable="true"]').forEach(el => el.removeAttribute('contenteditable'));

      showExportModal("Renderizando vista con fidelidad visual exacta...", "Compilando canvas...", 60);

      const canvas = await window.html2canvas(targetEl, {
        useCORS: true,
        allowTaint: true,
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false
      });

      showExportModal("Compilando archivo PDF...", "Aplicando márgenes ejecutivos...", 85);

      const { jsPDF } = window.jspdf;
      const isLandscape = canvas.width >= canvasHeight(canvas);
      const orientation = isLandscape ? 'landscape' : 'portrait';
      const pageW = isLandscape ? 297 : 210;
      const pageH = isLandscape ? 210 : 297;
      const margin = 8;
      const usableW = pageW - (margin * 2);
      const usableH = pageH - (margin * 2);

      const pdf = new jsPDF({
        orientation: orientation,
        unit: 'mm',
        format: 'a4'
      });

      const scale = Math.min(usableW / canvas.width, usableH / canvas.height);
      const renderW = canvas.width * scale;
      const renderH = canvas.height * scale;
      const posX = margin + (usableW - renderW) / 2;
      const posY = margin + (usableH - renderH) / 2;

      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', posX, posY, renderW, renderH);

      const filename = sanitizeName(cloneData ? cloneData.title : 'documento_editado', 'pdf');
      pdf.save(filename);

      hideExportModal();
      showToast(`¡PDF descargado con éxito! (${filename})`);

      // Restaurar modo activo
      setTool(activeTool);

    } catch (err) {
      console.error("Error al exportar PDF:", err);
      hideExportModal();
      showToast("Error al exportar el PDF.");
      setTool(activeTool);
    }
  });

  // B. Exportar a Word (.doc enriquecido / editable)
  btnEditorDocx.addEventListener('click', async () => {
    try {
      showExportModal("Generando documento Word (.doc)...", "Extrayendo contenido estructurado...", 40);

      const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
      const targetEl = frameDoc.body;

      // Capturar vista en miniatura
      const canvas = await window.html2canvas(targetEl, {
        scale: 1.5,
        backgroundColor: '#ffffff',
        logging: false
      });

      const visualSnapshotUrl = canvas.toDataURL('image/png');
      const rawBase64 = visualSnapshotUrl.replace(/^data:image\/[a-z]+;base64,/, '');
      const chunkedBase64 = (rawBase64.match(/.{1,76}/g) || [rawBase64]).join('\r\n');

      const title = (cloneData && cloneData.title) ? cloneData.title : 'Documento Web Editado';
      const today = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

      // Extraer bloques de texto editados
      const blocks = [];
      targetEl.querySelectorAll('h1, h2, h3, h4, p, table, ul, ol').forEach(el => {
        const tag = el.tagName.toLowerCase();
        const text = el.innerText ? el.innerText.trim() : '';
        if (!text && tag !== 'table') return;

        if (tag.startsWith('h')) {
          blocks.push(`<${tag} style="color: #0f172a; margin-top: 14pt; margin-bottom: 4pt; font-weight: bold;">${text}</${tag}>`);
        } else if (tag === 'p') {
          blocks.push(`<p style="margin: 0 0 8pt 0; line-height: 1.45; color: #334155;">${text}</p>`);
        } else if (tag === 'table') {
          blocks.push(el.outerHTML);
        }
      });

      const wordHtmlContent = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
          <meta charset='utf-8'>
          <title>${title}</title>
          <style>
            @page Section1 { size: 8.27in 11.69in; margin: 0.6in; }
            div.Section1 { page: Section1; }
            body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1e293b; }
            h1 { font-size: 20pt; color: #0f172a; margin-bottom: 6pt; }
            .card { background-color: #f8fafc; border-left: 3.5pt solid #2563eb; padding: 8pt 12pt; margin-bottom: 12pt; }
            img.cover { width: 6.8in; max-width: 6.8in; height: auto; border: 1pt solid #cbd5e1; display: block; margin: 0 auto; }
          </style>
        </head>
        <body>
          <div class="Section1">
            <h1>${title}</h1>
            <div class="card">
              <div><strong>Origen:</strong> ${cloneData ? cloneData.url : 'Web'}</div>
              <div><strong>Fecha:</strong> ${today} — Editado con BWD Creador Inteligente</div>
            </div>
            <div style="text-align: center; margin-bottom: 14pt;">
              <div style="font-weight: bold; color: #2563eb; font-size: 8.5pt; text-transform: uppercase; margin-bottom: 4pt;">Vista Visual Editada</div>
              <img class="cover" src="snapshot_cover.png" alt="Vista editada" />
            </div>
            <div style="page-break-before: always; margin-top: 14pt;">
              <h2 style="color: #1e40af; border-bottom: 2pt solid #2563eb; padding-bottom: 4pt;">Contenido Editado</h2>
              ${blocks.join('\n')}
            </div>
          </div>
        </body>
        </html>
      `;

      const boundary = '----=_NextPart_01D9_BWD_OFFICE';
      const mhtmlPayload = [
        'MIME-Version: 1.0',
        `Content-Type: multipart/related; boundary="${boundary}"; type="text/html"`,
        '',
        `--${boundary}`,
        'Content-Type: text/html; charset="utf-8"',
        'Content-Location: http://document/page.html',
        '',
        wordHtmlContent,
        '',
        `--${boundary}`,
        'Content-Type: image/png',
        'Content-Transfer-Encoding: base64',
        'Content-Location: snapshot_cover.png',
        '',
        chunkedBase64,
        '',
        `--${boundary}--`
      ].join('\r\n');

      const blob = new Blob([mhtmlPayload], { type: 'application/msword;charset=utf-8' });
      const filename = sanitizeName(title, 'doc');

      triggerDownloadBlob(blob, filename);
      hideExportModal();
      showToast(`¡Documento Word guardado! (${filename})`);

    } catch (err) {
      console.error("Error al exportar Word:", err);
      hideExportModal();
      showToast("Error al exportar a Word.");
    }
  });

  // C. Descargar PNG HD
  btnEditorPng.addEventListener('click', async () => {
    try {
      showExportModal("Generando imagen PNG HD...", "Renderizando página completa...", 50);

      const frameDoc = cloneFrame.contentDocument || cloneFrame.contentWindow.document;
      const targetEl = frameDoc.documentElement;

      frameDoc.querySelectorAll('[contenteditable="true"]').forEach(el => el.removeAttribute('contenteditable'));

      const canvas = await window.html2canvas(targetEl, {
        useCORS: true,
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false
      });

      const dataUrl = canvas.toDataURL('image/png');
      const filename = sanitizeName(cloneData ? cloneData.title : 'captura_editada', 'png');

      triggerDownloadUrl(dataUrl, filename);
      hideExportModal();
      showToast(`¡Captura PNG guardada! (${filename})`);

      setTool(activeTool);

    } catch (err) {
      console.error("Error al exportar PNG:", err);
      hideExportModal();
      showToast("Error al exportar captura PNG.");
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

  function showToast(msg) {
    toastMessage.textContent = msg;
    toastNotification.style.display = 'flex';
    clearTimeout(toastNotification._timer);
    toastNotification._timer = setTimeout(() => {
      toastNotification.style.display = 'none';
    }, 2800);
  }
});
