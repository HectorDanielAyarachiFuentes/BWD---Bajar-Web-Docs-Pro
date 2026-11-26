/**
 * ============================================================================
 * BWD — Executive Edition Controller
 * Basado en las soluciones de repositorios de referencia en GitHub:
 * - PDF Fiel: Firefox Native Engine (browser.tabs.saveAsPDF) con preservación
 *   de colores y fondos, vector real, cero problemas de CORS/taint.
 * - PNG Completo: Algoritmo de scrolling + captureVisibleTab (estilo GoFullPage)
 * - Word: Extractor semántico limpio (.doc enriquecido con metadatos)
 * ============================================================================
 */

// DOM Elements
const statusEl = document.getElementById('status');
const statusTextEl = document.getElementById('statusText');
const progressSection = document.getElementById('progressSection');
const progressLabel = document.getElementById('progressLabel');
const progressPercent = document.getElementById('progressPercent');
const progressBar = document.getElementById('progressBar');
const tabHostEl = document.getElementById('tabHost');

const btnPdfVisual = document.getElementById('btnPdfVisual');
const btnDocx = document.getElementById('btnDocx');
const btnPngFull = document.getElementById('btnPngFull');
const btnHtmlWeb = document.getElementById('btnHtmlWeb');
const btnLaunchEditor = document.getElementById('btnLaunchEditor');

const tabNavExport = document.getElementById('tabNavExport');
const tabNavEditor = document.getElementById('tabNavEditor');
const panelExport = document.getElementById('panelExport');
const panelEditor = document.getElementById('panelEditor');

const cleanDomCheckbox = document.getElementById('cleanDom');
const expandScrollCheckbox = document.getElementById('expandScroll');
const highQualityCheckbox = document.getElementById('highQuality');
const cleanCloneCheckboxEl = document.getElementById('cleanCloneDom');

const btnCopyPngClipboard = document.getElementById('btnCopyPngClipboard');
const pdfSummaryTextEl = document.getElementById('pdfSummaryText');
const docxSummaryTextEl = document.getElementById('docxSummaryText');
const pngSummaryTextEl = document.getElementById('pngSummaryText');
const htmlSummaryTextEl = document.getElementById('htmlSummaryText');

const exportState = {
  pdfMode: 'continuous', // 'continuous' | 'a4' | 'vector'
  docxMode: 'rich',      // 'rich' | 'visual' | 'hybrid'
  pngMode: 'full',       // 'full' | 'visible'
  htmlMode: 'offline'    // 'offline' | 'light'
};

const MODE_SUMMARIES = {
  pdfMode: {
    continuous: 'Continuo sin cortes, enlaces activos y texto seleccionable.',
    a4: 'Paginado A4 inteligente sin partir renglones, con links y OCR.',
    vector: 'Motor vectorial nativo puro de Firefox (saveAsPDF).'
  },
  docxMode: {
    rich: 'Word .docx editable con fotos integradas, tablas y links.',
    visual: 'Copia visual A4 de alta fidelidad sin partir renglones.',
    hybrid: 'Copia visual A4 + contenido editable estructurado.'
  },
  pngMode: {
    full: 'Captura continua ultra nítida sin límite de memoria.',
    visible: 'Captura instantánea nítida solo del área visible.'
  },
  htmlMode: {
    offline: 'Archivo único 100% offline con estilos e imágenes incrustadas.',
    light: 'HTML limpio liviano sin alterar la pestaña abierta.'
  }
};

const actionButtons = [btnPdfVisual, btnDocx, btnPngFull, btnHtmlWeb, btnLaunchEditor];

// ----------------------------------------------------------------------------
// 1. Estados y Progreso
// ----------------------------------------------------------------------------

function setProgress(percent, label, state = 'busy') {
  if (progressSection) {
    progressSection.style.display = 'block';
  }
  if (progressBar) {
    progressBar.style.width = `${percent}%`;
  }
  if (progressPercent) {
    progressPercent.textContent = `${percent}%`;
  }
  if (progressLabel) {
    progressLabel.textContent = label;
  }
  if (statusTextEl) {
    if (label && label.includes('(') && label.endsWith(')')) {
      const match = label.match(/^(.*?)\s*\((.*?)\)$/);
      if (match) {
        statusTextEl.textContent = '';
        const titleSpan = document.createElement('span');
        titleSpan.className = 'status-title';
        titleSpan.textContent = match[1];
        const pillSpan = document.createElement('span');
        pillSpan.className = 'status-file-pill';
        pillSpan.textContent = match[2];
        statusTextEl.appendChild(titleSpan);
        statusTextEl.appendChild(pillSpan);
      } else {
        statusTextEl.textContent = label;
      }
    } else {
      statusTextEl.textContent = label;
    }
  }

  if (statusEl) {
    statusEl.className = 'status-indicator';
    if (state === 'busy') {
      statusEl.classList.add('is-busy');
    } else if (state === 'success') {
      statusEl.classList.add('is-success');
      setTimeout(() => {
        if (progressSection) progressSection.style.display = 'none';
        if (progressBar) progressBar.style.width = '0%';
      }, 4000);
    } else if (state === 'error') {
      statusEl.classList.add('is-error');
    }
  }
}

function setBusy(isBusy) {
  actionButtons.forEach(btn => {
    if (btn) {
      if (isBusy) {
        btn.classList.add('is-disabled');
        btn.disabled = true;
      } else {
        btn.classList.remove('is-disabled');
        btn.disabled = false;
      }
    }
  });
}

// Utilidades y motor de captura delegados a shared/dom-utils.js y popup/popup-capture.js
const {
  getOrganizedPath,
  sanitizeFilename,
  blobToDataUrl,
  canvasToBlob,
  triggerDownload,
  formatErrorMessage
} = window.BwdShared;

async function applyPageBackground(tab) {
  const bgEl = document.getElementById('pagePreviewBg');
  if (!bgEl || !tab) return;

  try {
    let dataUrl = null;
    try {
      dataUrl = await captureTabImage(tab, 'jpeg');
    } catch (_) {
      try {
        dataUrl = await captureTabImage(tab, 'png');
      } catch (err2) {
        console.warn("Captura de fondo no disponible:", err2);
      }
    }

    if (dataUrl) {
      bgEl.style.backgroundImage = `url("${dataUrl}")`;
      bgEl.classList.add('is-loaded');

      // 🧠 Motor Dinámico Inteligente de Luminosidad
      // Calibra los filtros y opacidades de cristal según si la web es clara u oscura
      detectAndApplyPageTone(dataUrl);
    }
  } catch (err) {
    console.debug("applyPageBackground aviso:", err);
  }
}

function detectAndApplyPageTone(dataUrl) {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 16, 16);
        const imgData = ctx.getImageData(0, 0, 16, 16).data;
        let sumLum = 0;
        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          // Rec. 709 perceived luminance
          const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          sumLum += lum;
        }
        const avgLum = sumLum / (imgData.length / 4);
        const tone = avgLum >= 0.48 ? 'light' : 'dark';
        document.body.setAttribute('data-page-tone', tone);
      } catch (e) {
        document.body.setAttribute('data-page-tone', 'light');
      }
    };
    img.src = dataUrl;
  } catch (_) {
    document.body.setAttribute('data-page-tone', 'light');
  }
}

async function initTabDetection() {
  try {
    const tab = await getActiveTab();
    if (tab.url) {
      const urlObj = new URL(tab.url);
      if (['about:', 'chrome:', 'moz-extension:', 'addons.mozilla.org'].some(p => tab.url.startsWith(p))) {
        tabHostEl.textContent = 'Página interna (restringida)';
        statusTextEl.textContent = 'Las páginas internas del sistema no permiten exportación';
      } else {
        tabHostEl.textContent = urlObj.hostname || tab.title || 'Página web activa';
        applyPageBackground(tab);
      }
    }
  } catch (e) {
    tabHostEl.textContent = 'Pestaña activa';
  }
}

// ----------------------------------------------------------------------------
// 3. Motor de captura en popup/popup-capture.js (executeInPage, captureFullPageCanvas)
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// 4. Exportar PDF Fiel (3 Modos: 1 Sola Página Continua | A4 Inteligente | Vector Firefox)
// ----------------------------------------------------------------------------

btnPdfVisual.addEventListener('click', async () => {
  try {
    setBusy(true);
    const clean = cleanDomCheckbox ? cleanDomCheckbox.checked : true;
    const expand = expandScrollCheckbox ? expandScrollCheckbox.checked : true;
    const highQuality = highQualityCheckbox ? highQualityCheckbox.checked : true;
    const tab = await getActiveTab();
    let targetPdfMode = exportState.pdfMode || 'continuous';

    // Modo Vector Nativo de Firefox (saveAsPDF sin cortar videos/fotos; respaldo continuo de 1 página entera)
    if (targetPdfMode === 'vector') {
      if (typeof browser !== 'undefined' && browser.tabs && typeof browser.tabs.saveAsPDF === 'function') {
        setProgress(35, "Preparando motor vectorial puro de Firefox...", 'busy');
        await executeInPage((shouldClean) => {
          window._bwdVecRestores = [];
          const st = document.createElement('style');
          st.id = 'bwd-vector-print-guard';
          st.textContent = `
            @media print {
              img, figure, video, iframe, picture, blockquote, tr {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }
            }
          `;
          (document.head || document.documentElement).appendChild(st);
          if (shouldClean) {
            const sels = ['ins.adsbygoogle', 'div[id*="div-gpt-ad"]', '#onetrust-consent-sdk', '.cookie-banner', '.ln-placeholder', '.swg-dialog'];
            sels.forEach(sel => {
              document.querySelectorAll(sel).forEach(el => {
                window._bwdVecRestores.push({ el, val: el.style.getPropertyValue('display') });
                el.style.setProperty('display', 'none', 'important');
              });
            });
          }
        }, [clean]).catch(() => {});
        try {
          const status = await browser.tabs.saveAsPDF({
            marginTop: 0,
            marginBottom: 0,
            marginLeft: 0,
            marginRight: 0,
            showBackgroundColors: true,
            showBackgroundImages: true,
            shrinkToFit: true
          });
          if (status === 'saved' || status === 'replaced') {
            setProgress(100, "¡PDF vectorial nativo guardado con éxito!", 'success');
          } else {
            setProgress(100, "Diálogo de PDF vectorial finalizado.", 'success');
          }
          setBusy(false);
          return;
        } catch (vecErr) {
          console.warn("saveAsPDF no disponible en esta plataforma, usando modo 1 Página continua sin cortes:", vecErr);
          targetPdfMode = 'continuous';
        } finally {
          await executeInPage(() => {
            const st = document.getElementById('bwd-vector-print-guard');
            if (st) st.remove();
            (window._bwdVecRestores || []).forEach(r => {
              if (r.val) r.el.style.setProperty('display', r.val);
              else r.el.style.removeProperty('display');
            });
            delete window._bwdVecRestores;
          }).catch(() => {});
        }
      } else {
        targetPdfMode = 'continuous';
      }
    }

    setProgress(18, "Preparando página para exportación PDF fiel...", 'busy');

    const { canvas, metrics, pageTheme, textBlocks, linkBlocks, avoidCutZones } = await captureFullPageCanvas({
      clean,
      expand,
      highQuality,
      onProgress: (pct, msg) => setProgress(pct, msg, 'busy')
    });

    const { jsPDF } = window.jspdf;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const bgHex = (pageTheme && pageTheme.isDark)
      ? `rgb(${pageTheme.bgR}, ${pageTheme.bgG}, ${pageTheme.bgB})`
      : '#ffffff';
    const jpgQuality = highQuality ? 0.95 : 0.86;

    const cssW = Math.max(1, metrics.viewportWidth || 1200);
    const cssH = Math.max(1, metrics.height || (canvasHeight / (canvasWidth / cssW)));

    if (targetPdfMode === 'a4') {
      setProgress(84, "Paginando en hojas A4 respetando imágenes y videos...", 'busy');
      const scaleCssToCanvasX = canvasWidth / cssW;
      const scaleCssToCanvasY = canvasHeight / cssH;
      const scaledAvoidZones = (avoidCutZones || []).map(z => ({
        top: Math.round(z.top * scaleCssToCanvasY),
        bottom: Math.round(z.bottom * scaleCssToCanvasY)
      }));

      const a4Slices = sliceCanvasForA4(canvas, (cur, tot) => {
        setProgress(84 + Math.round((cur / Math.max(1, tot)) * 8), `Maquetando hoja A4 ${cur} de ${tot}...`, 'busy');
      }, bgHex, jpgQuality, scaledAvoidZones);

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      const pageW = 210;
      const pageH = 297;
      const margin = 8;
      const usableW = pageW - margin * 2;
      const usableH = pageH - margin * 2;

      a4Slices.forEach((sl, idx) => {
        if (idx > 0) pdf.addPage('a4', 'portrait');
        if (pageTheme && pageTheme.isDark) {
          pdf.setFillColor(pageTheme.bgR, pageTheme.bgG, pageTheme.bgB);
          pdf.rect(0, 0, pageW, pageH, 'F');
        }
        const ratio = Math.min(usableW / sl.width, usableH / sl.height);
        const drawW = sl.width * ratio;
        const drawH = sl.height * ratio;
        const offsetX = margin + (usableW - drawW) / 2;
        const offsetY = margin;

        pdf.addImage(sl.dataUrl, 'JPEG', offsetX, offsetY, drawW, drawH, undefined, 'FAST');

        const sliceStartCanvasY = sl.offsetY || 0;
        const sliceEndCanvasY = sliceStartCanvasY + sl.height;

        // Capa de texto OCR seleccionable por página A4
        if (textBlocks && textBlocks.length > 0) {
          for (const tb of textBlocks) {
            const cy = tb.y * scaleCssToCanvasY;
            if (cy < sliceStartCanvasY || cy >= sliceEndCanvasY) continue;
            const txMm = offsetX + (tb.x * scaleCssToCanvasX) * ratio;
            const tyMm = offsetY + (cy - sliceStartCanvasY) * ratio;
            const fPt = Math.max(5, Math.min(48, (tb.fontSize * scaleCssToCanvasY * ratio) * 2.83));
            try {
              pdf.setFontSize(fPt);
              pdf.text(tb.text, txMm, tyMm, { baseline: 'top', renderingMode: 'invisible' });
            } catch (_) {}
          }
        }

        // Enlaces cliqueables activos por página A4
        if (linkBlocks && linkBlocks.length > 0) {
          for (const lb of linkBlocks) {
            const cy = lb.y * scaleCssToCanvasY;
            if (cy < sliceStartCanvasY || cy >= sliceEndCanvasY) continue;
            const lxMm = offsetX + (lb.x * scaleCssToCanvasX) * ratio;
            const lyMm = offsetY + (cy - sliceStartCanvasY) * ratio;
            const lwMm = Math.max(2, (lb.width * scaleCssToCanvasX) * ratio);
            const lhMm = Math.max(2, (lb.height * scaleCssToCanvasY) * ratio);
            try { pdf.link(lxMm, lyMm, lwMm, lhMm, { url: lb.url }); } catch (_) {}
          }
        }
      });

      const filename = sanitizeFilename(metrics.title || tab.title, 'pdf');
      setProgress(96, "Descargando PDF A4 inteligente...", 'busy');
      await triggerDownload(pdf.output('blob'), filename);
      setProgress(100, `¡PDF A4 descargado con éxito! (${filename})`, 'success');
      setBusy(false);
      return;
    }

    // Modo 1 Sola Página Continua (borde a borde, escalando unidades lógicas si > 14000px para máxima compatibilidad Acrobat)
    setProgress(85, "Compilando PDF continuo en 1 sola página con links activos...", 'busy');

    const unitScale = canvasHeight > 14000 ? (14000 / canvasHeight) : 1;
    const pdfW = Math.max(10, Math.round(canvasWidth * unitScale));
    const pdfH = Math.max(10, Math.round(canvasHeight * unitScale));
    const orientation = pdfW > pdfH ? 'landscape' : 'portrait';

    const pdf = new jsPDF({
      orientation,
      unit: 'px',
      format: [pdfW, pdfH],
      hotfixes: ['px_scaling'],
      compress: true
    });

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvasWidth;
    exportCanvas.height = canvasHeight;
    const ectx = exportCanvas.getContext('2d');
    ectx.fillStyle = bgHex;
    ectx.fillRect(0, 0, canvasWidth, canvasHeight);
    ectx.drawImage(canvas, 0, 0);

    const imgData = exportCanvas.toDataURL('image/jpeg', jpgQuality);
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH, undefined, 'FAST');

    const scaleX = pdfW / cssW;
    const scaleY = pdfH / cssH;

    // Capa de texto nativo invisible multi-línea (Ctrl+F + copiar texto exacto)
    if (textBlocks && textBlocks.length > 0) {
      setProgress(90, "Incrustando texto seleccionable (OCR) y enlaces activos...", 'busy');
      for (const tb of textBlocks) {
        if (!tb.text) continue;
        const posX = Math.round(tb.x * scaleX);
        const posY = Math.round(tb.y * scaleY);
        const fSize = Math.max(5, Math.min(72, Math.round(tb.fontSize * scaleY)));
        try {
          pdf.setFontSize(fSize);
          pdf.text(tb.text, posX, posY, {
            baseline: 'top',
            renderingMode: 'invisible'
          });
        } catch (_) {}
      }
    }

    // Capa de hipervínculos reales cliqueables
    if (linkBlocks && linkBlocks.length > 0) {
      for (const lb of linkBlocks) {
        if (!lb.url) continue;
        const lx = Math.max(0, lb.x * scaleX);
        const ly = Math.max(0, lb.y * scaleY);
        const lw = Math.max(2, lb.width * scaleX);
        const lh = Math.max(2, lb.height * scaleY);
        try {
          pdf.link(lx, ly, lw, lh, { url: lb.url });
        } catch (_) {}
      }
    }

    const filename = sanitizeFilename(metrics.title || tab.title, 'pdf');
    setProgress(95, "Descargando documento PDF fiel...", 'busy');
    const pdfBlob = pdf.output('blob');
    await triggerDownload(pdfBlob, filename);

    setProgress(100, `¡PDF fiel descargado con éxito! (${filename})`, 'success');
    setBusy(false);

  } catch (err) {
    console.error("Error al exportar PDF:", err);
    setProgress(0, `Error: ${formatErrorMessage(err)}`, 'error');
    setBusy(false);
  }
});

// ----------------------------------------------------------------------------
// Motor ZIP / OpenXML (.docx) y corte A4 inteligente delegados a shared/zip-docx.js
const {
  SimpleZip,
  crc32,
  escapeXml,
  compressZipInstance,
  fetchImageForWordMedia,
  buildDocx,
  buildRichEditableDocx,
  findSafeCutRow: findSafeCutRowPopup,
  sliceCanvasForA4
} = window.BwdShared;

// ----------------------------------------------------------------------------
// 5. Exportar a Word (.docx Nativo OpenXML: Editable | Visual A4 | Híbrido)
// ----------------------------------------------------------------------------

btnDocx.addEventListener('click', async () => {
  try {
    setBusy(true);
    const clean = cleanDomCheckbox ? cleanDomCheckbox.checked : true;
    const expand = expandScrollCheckbox ? expandScrollCheckbox.checked : true;
    const highQuality = highQualityCheckbox ? highQualityCheckbox.checked : true;
    const docxMode = exportState.docxMode || 'rich';
    const tab = await getActiveTab();

    // Modo Editable Puro: extracción semántica ultrarrápida con fotos, tablas y links reales sin rebanar screenshots pesados
    if (docxMode === 'rich') {
      setProgress(25, "Extrayendo texto estructurado, tablas, enlaces e imágenes...", 'busy');
      const { metrics, structuredItems } = await captureFullPageCanvas({
        clean,
        expand,
        highQuality: false,
        visibleOnly: true,
        onProgress: (pct, msg) => setProgress(Math.min(60, pct), msg, 'busy')
      });

      const title = (metrics && metrics.title) || tab.title || 'Documento Web';
      setProgress(72, "Incrustando fotografías y maquetando Word editable (.docx)...", 'busy');
      const docxUint8 = await buildRichEditableDocx(structuredItems, {
        title,
        url: (metrics && metrics.url) || tab.url
      }, []);

      const blob = new Blob([docxUint8], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      const filename = sanitizeFilename(title, 'docx');

      setProgress(95, "Descargando documento Word editable...", 'busy');
      await triggerDownload(blob, filename);
      setProgress(100, `¡Word editable (.docx) descargado con éxito! (${filename})`, 'success');
      setBusy(false);
      return;
    }

    // Modos Visual A4 e Híbrido
    setProgress(20, "Capturando página completa para Word (.docx)...", 'busy');
    const { canvas, metrics, pageTheme, structuredItems, avoidCutZones } = await captureFullPageCanvas({
      clean,
      expand,
      highQuality,
      onProgress: (pct, msg) => setProgress(pct, msg, 'busy')
    });

    const title = (metrics && metrics.title) || tab.title || 'Documento Web';
    const bgHex = (pageTheme && pageTheme.isDark)
      ? `rgb(${pageTheme.bgR}, ${pageTheme.bgG}, ${pageTheme.bgB})`
      : '#ffffff';
    const cssH = Math.max(1, (metrics && metrics.height) || canvas.height);
    const scaleCssToCanvasY = canvas.height / cssH;
    const scaledAvoidZones = (avoidCutZones || []).map(z => ({
      top: Math.round(z.top * scaleCssToCanvasY),
      bottom: Math.round(z.bottom * scaleCssToCanvasY)
    }));

    setProgress(76, "Rebanando hojas A4 respetando fotos y videos...", 'busy');
    const slices = sliceCanvasForA4(canvas, (current, total) => {
      const pct = Math.min(90, 76 + Math.round((current / Math.max(1, total)) * 14));
      setProgress(pct, `Generando lámina Word ${current} de ${total}...`, 'busy');
    }, bgHex, highQuality ? 0.92 : 0.85, scaledAvoidZones);

    setProgress(92, "Comprimiendo paquete OpenXML (.docx)...", 'busy');
    let docxUint8;
    if (docxMode === 'visual') {
      docxUint8 = await buildRichEditableDocx([], { title, url: tab.url }, slices);
    } else {
      docxUint8 = await buildRichEditableDocx(structuredItems, { title, url: tab.url }, slices);
    }

    const blob = new Blob([docxUint8], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
    const filename = sanitizeFilename(title, 'docx');

    setProgress(96, "Descargando documento Word fiel...", 'busy');
    await triggerDownload(blob, filename);

    setProgress(100, `¡Documento Word (.docx) descargado con éxito! (${filename})`, 'success');
    setBusy(false);

  } catch (err) {
    console.error("Error al exportar Word (.docx):", err);
    setProgress(0, `Error: ${formatErrorMessage(err)}`, 'error');
    setBusy(false);
  }
});

// ----------------------------------------------------------------------------
// 5.a Captura PNG HD (Completa | Solo Visible | Copiar directo al Portapapeles)
// ----------------------------------------------------------------------------

async function runPngCaptureBlob() {
  const clean = cleanDomCheckbox ? cleanDomCheckbox.checked : true;
  const expand = expandScrollCheckbox ? expandScrollCheckbox.checked : true;
  const highQuality = highQualityCheckbox ? highQualityCheckbox.checked : true;
  const visibleOnly = exportState.pngMode === 'visible';
  const tab = await getActiveTab();

  const { canvas, metrics } = await captureFullPageCanvas({
    clean,
    expand,
    highQuality,
    visibleOnly,
    onProgress: (pct, msg) => setProgress(pct, msg, 'busy')
  });

  setProgress(90, "Codificando imagen PNG sin compresión con pérdida...", 'busy');
  const pngBlob = await canvasToBlob(canvas, 'image/png');
  return { pngBlob, title: (metrics && metrics.title) || tab.title || 'captura_web' };
}

btnPngFull.addEventListener('click', async () => {
  try {
    setBusy(true);
    setProgress(15, exportState.pngMode === 'visible' ? "Capturando área visible HD..." : "Iniciando captura continua HD...", 'busy');

    const { pngBlob, title } = await runPngCaptureBlob();
    const filename = sanitizeFilename(title, 'png');
    await triggerDownload(pngBlob, filename);

    setProgress(100, `¡Captura PNG HD guardada con éxito! (${filename})`, 'success');
    setBusy(false);

  } catch (err) {
    console.error("Error en captura PNG:", err);
    setProgress(0, `Error: ${formatErrorMessage(err)}`, 'error');
    setBusy(false);
  }
});

if (btnCopyPngClipboard) {
  const handleClipboardCopy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (btnPngFull && btnPngFull.disabled) return;
    try {
      setBusy(true);
      setProgress(20, "Capturando imagen PNG para el portapapeles...", 'busy');
      const { pngBlob } = await runPngCaptureBlob();

      if (navigator.clipboard && typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
        setProgress(100, "¡Imagen PNG copiada al portapapeles! Usa Ctrl+V para pegarla.", 'success');
      } else {
        throw new Error("El portapapeles de imágenes no está habilitado en este navegador.");
      }
      setBusy(false);
    } catch (err) {
      console.error("Error al copiar PNG al portapapeles:", err);
      setProgress(0, `Error: ${formatErrorMessage(err)}`, 'error');
      setBusy(false);
    }
  };

  btnCopyPngClipboard.addEventListener('click', handleClipboardCopy);
  btnCopyPngClipboard.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') handleClipboardCopy(e);
  });
}

// ----------------------------------------------------------------------------
// 5.b Descargar HTML Web (100% Sin Mutar Pestaña: SingleFile Offline | Ligero)
// ----------------------------------------------------------------------------

async function fetchResourceAsDataUrlPopup(urlStr, timeoutMs = 4500) {
  if (!urlStr || urlStr.startsWith('data:') || urlStr.startsWith('blob:')) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(urlStr, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size > 8 * 1024 * 1024) return null; // Proteger memoria ante archivos gigantes (>8MB)
    return await blobToDataUrl(blob);
  } catch (_) {
    return null;
  }
}

async function fetchAndInlineCssTextPopup(cssUrl) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(cssUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    let cssText = await res.text();
    // Reescribir url(...) relativas dentro del CSS a URLs absolutas del servidor original
    cssText = cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, quote, rawPath) => {
      const trimmed = (rawPath || '').trim();
      if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('#')) return full;
      try {
        const abs = new URL(trimmed, cssUrl).href;
        return `url("${abs}")`;
      } catch (_) {
        return full;
      }
    });
    return cssText;
  } catch (_) {
    return null;
  }
}

if (btnHtmlWeb) {
  btnHtmlWeb.addEventListener('click', async () => {
    try {
      setBusy(true);
      const clean = cleanDomCheckbox ? cleanDomCheckbox.checked : true;
      const isOfflineMode = (exportState.htmlMode || 'offline') === 'offline';
      const tab = await getActiveTab();

      setProgress(15, "Cargando toda la página de principio a fin (imágenes y secciones)...", 'busy');

      // 0. Recorrer la página para despertar secciones/imágenes lazy y asentar cabeceras en scrollY = 0 antes de clonar
      const htmlOrigScroll = await executeInPage(async () => {
        const prevX = window.scrollX || window.pageXOffset || 0;
        const prevY = window.scrollY || window.pageYOffset || 0;

        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        window.dispatchEvent(new Event('scroll'));
        await new Promise(r => requestAnimationFrame(() => setTimeout(r, 120)));

        const topNodes = Array.from(document.querySelectorAll('header, nav, [class*="header"], [class*="sticky"], [class*="banner"]')).slice(0, 40);
        window._bwdHtmlTopSnap = topNodes.map(el => ({
          el,
          className: typeof el.className === 'string' ? el.className : null,
          cssText: el.style ? el.style.cssText : ''
        }));

        const totalH = Math.min(
          Math.max(document.body ? document.body.scrollHeight : 0, document.documentElement ? document.documentElement.scrollHeight : 0),
          24000
        );
        const step = Math.max(400, window.innerHeight || 800);
        for (let y = 0; y < totalH; y += step) {
          window.scrollTo({ top: y, left: 0, behavior: 'instant' });
          await new Promise(r => setTimeout(r, 40));
        }

        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        window.dispatchEvent(new Event('scroll'));
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        await new Promise(r => setTimeout(r, 160));

        return { x: prevX, y: prevY };
      });

      setProgress(28, "Clonando estructura completa sin cortes ni alterar la pestaña...", 'busy');

      // Extracción 100% sobre un clon en memoria: la pestaña viva del usuario queda completamente intacta
      let pageData;
      try {
        pageData = await executeInPage((cleanParam) => {
          function pickBestSrcset(srcsetStr) {
            if (!srcsetStr || typeof srcsetStr !== 'string') return '';
            const regex = /(\S+)(?:\s+(\d+(?:\.\d+)?)([wx]))?(?:\s*,\s*|$)/g;
            let bestUrl = '';
            let bestScore = -1;
            let m;
            while ((m = regex.exec(srcsetStr.trim())) !== null) {
              if (!m[1]) break;
              const url = m[1].replace(/,+$/, '');
              if (!url || url.includes('data:image/svg') || url.includes('placeholder')) continue;
              const val = m[2] ? parseFloat(m[2]) : 1;
              const score = (m[3] || 'x') === 'w' ? val : val * 1000;
              if (score >= bestScore) { bestScore = score; bestUrl = url; }
            }
            return bestUrl;
          }

          const baseHref = document.baseURI || window.location.href;
          const allLiveEls = Array.from(document.documentElement.querySelectorAll('*'));
          const cloneRoot = document.documentElement.cloneNode(true);
          const allCloneEls = Array.from(cloneRoot.querySelectorAll('*'));

          if (Array.isArray(window._bwdHtmlTopSnap)) {
            window._bwdHtmlTopSnap.forEach(snap => {
              const idx = allLiveEls.indexOf(snap.el);
              if (idx >= 0 && allCloneEls[idx]) {
                if (snap.className !== null) allCloneEls[idx].className = snap.className;
                allCloneEls[idx].style.cssText = snap.cssText || '';
              }
            });
            delete window._bwdHtmlTopSnap;
          }

          // 1. Sincronizar estado vivo de inputs, textareas y selects hacia el clon
          const liveInputs = document.querySelectorAll('input, textarea, select');
          const cloneInputs = cloneRoot.querySelectorAll('input, textarea, select');
          liveInputs.forEach((liveEl, i) => {
            const cloneEl = cloneInputs[i];
            if (!cloneEl) return;
            const tag = liveEl.tagName.toLowerCase();
            if (tag === 'input') {
              const type = (liveEl.getAttribute('type') || 'text').toLowerCase();
              if (type === 'checkbox' || type === 'radio') {
                if (liveEl.checked) cloneEl.setAttribute('checked', 'checked');
                else cloneEl.removeAttribute('checked');
              } else if (type !== 'password') {
                cloneEl.setAttribute('value', liveEl.value || '');
              }
            } else if (tag === 'textarea') {
              cloneEl.textContent = liveEl.value || '';
            } else if (tag === 'select') {
              const lOpts = liveEl.querySelectorAll('option');
              const cOpts = cloneEl.querySelectorAll('option');
              lOpts.forEach((o, idx) => {
                if (!cOpts[idx]) return;
                if (o.selected) cOpts[idx].setAttribute('selected', 'selected');
                else cOpts[idx].removeAttribute('selected');
              });
            }
          });

          // 2. Convertir <canvas> vivos en imágenes PNG estáticas sobre el clon
          const liveCanvases = document.querySelectorAll('canvas');
          const cloneCanvases = cloneRoot.querySelectorAll('canvas');
          liveCanvases.forEach((lc, i) => {
            const cc = cloneCanvases[i];
            if (!cc || lc.width === 0 || lc.height === 0) return;
            try {
              const dUrl = lc.toDataURL('image/png');
              if (dUrl && dUrl.startsWith('data:image/png')) {
                const img = document.createElement('img');
                img.setAttribute('src', dUrl);
                if (lc.className) img.className = lc.className;
                cc.replaceWith(img);
              }
            } catch (_) {}
          });

          // 3. Capturar reglas dinámicas CSS-in-JS y adoptedStyleSheets
          let dynamicCss = '';
          try {
            Array.from(document.styleSheets).forEach(sheet => {
              try {
                const owner = sheet.ownerNode;
                if (owner && owner.tagName === 'STYLE' && (!owner.textContent || !owner.textContent.trim())) {
                  const rules = Array.from(sheet.cssRules || []).map(r => r.cssText).join('\n');
                  if (rules) dynamicCss += rules + '\n';
                }
              } catch (_) {}
            });
            if (document.adoptedStyleSheets) {
              Array.from(document.adoptedStyleSheets).forEach(sheet => {
                try {
                  const rules = Array.from(sheet.cssRules || []).map(r => r.cssText).join('\n');
                  if (rules) dynamicCss += rules + '\n';
                } catch (_) {}
              });
            }
          } catch (_) {}

          if (dynamicCss) {
            const st = document.createElement('style');
            st.setAttribute('data-bwd-css-in-js', 'true');
            st.textContent = dynamicCss;
            (cloneRoot.querySelector('head') || cloneRoot).appendChild(st);
          }

          // 4. Resolver imágenes y <picture> únicamente sobre cloneRoot
          const liveImgs = document.querySelectorAll('img');
          const cloneImgs = cloneRoot.querySelectorAll('img');
          liveImgs.forEach((lImg, idx) => {
            const cImg = cloneImgs[idx];
            if (!cImg) return;
            const bestSet = pickBestSrcset(lImg.getAttribute('srcset') || lImg.getAttribute('data-srcset') || '');
            const cands = [lImg.currentSrc, bestSet, lImg.getAttribute('data-src'), lImg.getAttribute('data-original'), lImg.getAttribute('data-lazy-src'), lImg.getAttribute('src')];
            let chosen = '';
            for (const c of cands) {
              if (c && typeof c === 'string' && !c.includes('data:image/svg') && !c.includes('placeholder')) {
                chosen = c.trim();
                break;
              }
            }
            if (!chosen && lImg.getAttribute('src')) chosen = lImg.getAttribute('src').trim();
            if (chosen && !chosen.startsWith('data:')) {
              try { chosen = new URL(chosen, baseHref).href; } catch (_) {}
            }
            if (chosen) cImg.setAttribute('src', chosen);
            cImg.removeAttribute('srcset');
            cImg.removeAttribute('data-srcset');
            cImg.removeAttribute('data-src');
            cImg.removeAttribute('loading');
          });

          cloneRoot.querySelectorAll('picture').forEach(pic => {
            const im = pic.querySelector('img');
            if (im) pic.replaceWith(im);
          });

          // 5. Limpiar scripts, noscripts, atributos on* y anuncios/cookies
          cloneRoot.querySelectorAll('script, noscript').forEach(s => s.remove());
          cloneRoot.querySelectorAll('*').forEach(el => {
            for (const attr of Array.from(el.attributes)) {
              if (attr.name.toLowerCase().startsWith('on')) el.removeAttribute(attr.name);
            }
          });

          if (cleanParam) {
            const cleanSels = [
              'ins.adsbygoogle', 'iframe[id*="google_ads"]', 'iframe[src*="doubleclick"]',
              'div[id*="google_ads"]', 'div[id*="div-gpt-ad"]', 'div[class*="taboola"]',
              'div[class*="outbrain"]', '.ln-placeholder', '#onetrust-consent-sdk',
              '#cookie-banner', '.cookie-banner', '[class*="cookie-consent"]',
              '.swg-dialog', '.modal-backdrop'
            ];
            cleanSels.forEach(sel => {
              try {
                cloneRoot.querySelectorAll(sel).forEach(el => {
                  if (!['HTML', 'HEAD', 'BODY', 'MAIN', 'ARTICLE', 'HEADER'].includes(el.tagName) && !el.querySelector('article, main, h1')) {
                    el.remove();
                  }
                });
              } catch (_) {}
            });
          }

          return {
            html: cloneRoot.outerHTML,
            title: document.title || 'pagina_web',
            baseHref
          };
        }, [clean]);
      } finally {
        if (htmlOrigScroll) {
          await executeInPage((pos) => {
            delete window._bwdHtmlTopSnap;
            window.scrollTo({ top: pos.y, left: pos.x, behavior: 'instant' });
          }, [htmlOrigScroll]).catch(() => {});
        }
      }

      const parser = new DOMParser();
      const doc = parser.parseFromString('<!DOCTYPE html>\n' + (pageData.html || ''), 'text/html');
      const baseHref = pageData.baseHref || tab.url || '';

      // Garantizar visualización continua entera sin recortes de altura ni saltos forzados
      if (doc.head) {
        const contStyle = doc.createElement('style');
        contStyle.id = 'bwd-continuous-html';
        contStyle.textContent = `
          html, body { height: auto !important; max-height: none !important; overflow-y: visible !important; }
          *, *::before, *::after { page-break-before: auto !important; page-break-after: auto !important; break-before: auto !important; break-after: auto !important; }
          img, figure, video, iframe, table { break-inside: avoid !important; page-break-inside: avoid !important; }
        `;
        doc.head.appendChild(contStyle);
      }

      if (isOfflineMode) {
        const styleLinks = Array.from(doc.querySelectorAll('link[rel~="stylesheet"][href]'));
        if (styleLinks.length > 0) {
          setProgress(42, `Incrustando ${styleLinks.length} hojas de estilo CSS...`, 'busy');
          await Promise.all(styleLinks.map(async (lnk) => {
            try {
              const absCssUrl = new URL(lnk.getAttribute('href'), baseHref).href;
              const cssText = await fetchAndInlineCssTextPopup(absCssUrl);
              if (cssText !== null) {
                const st = doc.createElement('style');
                const media = lnk.getAttribute('media');
                if (media) st.setAttribute('media', media);
                st.textContent = cssText;
                lnk.replaceWith(st);
              } else {
                lnk.setAttribute('href', absCssUrl);
              }
            } catch (_) {}
          }));
        }

        const imgs = Array.from(doc.querySelectorAll('img[src]')).filter(im => {
          const s = im.getAttribute('src') || '';
          return s && !s.startsWith('data:');
        });

        if (imgs.length > 0) {
          let doneImgs = 0;
          const totalImgs = Math.min(imgs.length, 200);
          const targetImgs = imgs.slice(0, totalImgs);
          const concurrency = 6;
          for (let i = 0; i < targetImgs.length; i += concurrency) {
            const batch = targetImgs.slice(i, i + concurrency);
            await Promise.all(batch.map(async (im) => {
              try {
                const absImg = new URL(im.getAttribute('src'), baseHref).href;
                const dUrl = await fetchResourceAsDataUrlPopup(absImg);
                im.setAttribute('src', dUrl || absImg);
              } catch (_) {}
              doneImgs++;
            }));
            const pct = Math.min(86, 52 + Math.round((doneImgs / Math.max(1, totalImgs)) * 34));
            setProgress(pct, `Incrustando imágenes offline (${doneImgs}/${totalImgs})...`, 'busy');
          }
        }

        // También incrustar fondos inline background-image: url(...)
        const bgEls = Array.from(doc.querySelectorAll('[style*="background"]')).slice(0, 40);
        await Promise.all(bgEls.map(async (el) => {
          try {
            const bg = el.style.backgroundImage || '';
            const m = bg.match(/url\(\s*(['"]?)([^'")]+)\1\s*\)/i);
            if (m && m[2] && !m[2].startsWith('data:')) {
              const absBg = new URL(m[2], baseHref).href;
              const dUrl = await fetchResourceAsDataUrlPopup(absBg);
              if (dUrl) el.style.backgroundImage = bg.replace(m[0], `url("${dUrl}")`);
            }
          } catch (_) {}
        }));

        doc.querySelectorAll('a[href]').forEach(a => {
          const raw = (a.getAttribute('href') || '').trim();
          if (!raw || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('javascript:')) return;
          try {
            a.setAttribute('href', new URL(raw, baseHref).href);
          } catch (_) {}
        });
        doc.querySelectorAll('base').forEach(b => b.remove());
      } else {
        if (baseHref && !doc.querySelector('base') && doc.head) {
          const baseEl = doc.createElement('base');
          baseEl.setAttribute('href', baseHref);
          doc.head.insertBefore(baseEl, doc.head.firstChild);
        }
      }

      if (doc.head && !doc.querySelector('meta[charset]')) {
        const meta = doc.createElement('meta');
        meta.setAttribute('charset', 'UTF-8');
        doc.head.insertBefore(meta, doc.head.firstChild);
      }

      setProgress(90, "Empaquetando archivo HTML independiente...", 'busy');
      const finalHtml = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
      const blob = new Blob([finalHtml], { type: 'text/html;charset=utf-8' });
      const filename = sanitizeFilename(pageData.title || tab.title, 'html');

      await triggerDownload(blob, filename);

      setProgress(100, `¡HTML ${isOfflineMode ? 'Offline' : 'Ligero'} descargado con éxito! (${filename})`, 'success');
      setBusy(false);

    } catch (err) {
      console.error("Error al exportar HTML:", err);
      setProgress(0, `Error: ${formatErrorMessage(err)}`, 'error');
      setBusy(false);
    }
  });
}

// ----------------------------------------------------------------------------
// 6. Tooltips e Inicialización
// ----------------------------------------------------------------------------

function initTooltips() {
  // Tooltips desactivados según preferencia del usuario
}

// ----------------------------------------------------------------------------
// 7. Navegación de Pestañas y Lanzador de Modo Creador
// ----------------------------------------------------------------------------

function initTabs() {
  if (!tabNavExport || !tabNavEditor) return;

  tabNavExport.addEventListener('click', () => {
    tabNavExport.classList.add('is-active');
    tabNavEditor.classList.remove('is-active');
    if (panelExport) panelExport.style.display = 'block';
    if (panelEditor) panelEditor.style.display = 'none';
  });

  tabNavEditor.addEventListener('click', () => {
    tabNavEditor.classList.add('is-active');
    tabNavExport.classList.remove('is-active');
    if (panelExport) panelExport.style.display = 'none';
    if (panelEditor) panelEditor.style.display = 'block';
  });
}

function initEditorLauncher() {
  if (!btnLaunchEditor) return;

  btnLaunchEditor.addEventListener('click', async () => {
    try {
      setBusy(true);
      setProgress(15, "Precargando elementos e imágenes originales...", 'busy');

      const tab = await getActiveTab();

      // 1. Asentar en scrollY = 0, activar recursos lazy y volver a scrollY = 0 antes de clonar para no congelar cabeceras flotantes sobre el <h1>
      const origUserScroll = await executeInPage(async () => {
        const prevX = window.scrollX || window.pageXOffset || 0;
        const prevY = window.scrollY || window.pageYOffset || 0;

        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
        window.dispatchEvent(new Event('scroll'));
        await new Promise(r => requestAnimationFrame(() => setTimeout(r, 150)));

        // Guardar estado limpio de cabeceras superiores en scrollY = 0 antes de recorrer la página
        const topNodes = Array.from(document.querySelectorAll('header, nav, [class*="header"], [class*="sticky"], [class*="banner"]')).slice(0, 40);
        window._bwdCleanTopSnapshot = topNodes.map(el => ({
          el,
          className: typeof el.className === 'string' ? el.className : null,
          cssText: el.style ? el.style.cssText : ''
        }));

        const totalH = Math.min(document.body ? document.body.scrollHeight : 0, 16000);
        const step = window.innerHeight || 800;
        for (let y = 0; y < totalH; y += step) {
          window.scrollTo({ top: y, left: 0, behavior: 'instant' });
          await new Promise(r => setTimeout(r, 45));
        }

        // Regresar al tope absoluto y esperar que los listeners del diario desacoplen barras fixed/sticky
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
        window.dispatchEvent(new Event('scroll'));
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        await new Promise(r => setTimeout(r, 200));

        return { x: prevX, y: prevY };
      });

      setProgress(40, "Clonando DOM, formularios y estilos sin alterar la pestaña...", 'busy');

      const cleanCloneCheckbox = document.getElementById('cleanCloneDom');
      const clean = cleanCloneCheckbox ? cleanCloneCheckbox.checked : false;

      let cloneData;
      try {
        cloneData = await executeInPage((shouldClean) => {
        // Parsear srcset eligiendo la mayor resolución sin romper URLs con comas internas (Cloudinary/Cloudflare)
        function pickBestSrcsetUrl(srcsetStr) {
          if (!srcsetStr || typeof srcsetStr !== 'string') return '';
          const regex = /(\S+)(?:\s+(\d+(?:\.\d+)?)([wx]))?(?:\s*,\s*|$)/g;
          let bestUrl = '';
          let bestScore = -1;
          let match;
          while ((match = regex.exec(srcsetStr.trim())) !== null) {
            if (!match[1]) break;
            let url = match[1].replace(/,+$/, '');
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

        const baseHref = document.baseURI || window.location.href;
        // Clonar PRIMERO en scrollY = 0 para jamás mutar el DOM vivo que el usuario tiene abierto
        const allLiveEls = Array.from(document.documentElement.querySelectorAll('*'));
        const cloneRoot = document.documentElement.cloneNode(true);
        const allCloneEls = Array.from(cloneRoot.querySelectorAll('*'));

        // Restaurar sobre el clon el estado limpio de cabeceras en scrollY = 0 si algún script dejó clases/estilos fixed pegados
        if (Array.isArray(window._bwdCleanTopSnapshot)) {
          window._bwdCleanTopSnapshot.forEach(snap => {
            const idx = allLiveEls.indexOf(snap.el);
            if (idx >= 0 && allCloneEls[idx]) {
              if (snap.className !== null) allCloneEls[idx].className = snap.className;
              allCloneEls[idx].style.cssText = snap.cssText || '';
            }
          });
          delete window._bwdCleanTopSnapshot;
        }

        try {
          // A. Sincronizar estado vivo de formularios (<input>, <textarea>, <select>) hacia el clon
          const liveInputs = document.querySelectorAll('input, textarea, select');
          const cloneInputs = cloneRoot.querySelectorAll('input, textarea, select');
          liveInputs.forEach((liveEl, i) => {
            const cloneEl = cloneInputs[i];
            if (!cloneEl) return;
            const tag = liveEl.tagName.toLowerCase();
            if (tag === 'input') {
              const type = (liveEl.getAttribute('type') || 'text').toLowerCase();
              if (type === 'checkbox' || type === 'radio') {
                if (liveEl.checked) cloneEl.setAttribute('checked', 'checked');
                else cloneEl.removeAttribute('checked');
              } else if (type !== 'password') {
                cloneEl.setAttribute('value', liveEl.value || '');
              }
            } else if (tag === 'textarea') {
              cloneEl.textContent = liveEl.value || '';
            } else if (tag === 'select') {
              const liveOpts = liveEl.querySelectorAll('option');
              const cloneOpts = cloneEl.querySelectorAll('option');
              liveOpts.forEach((opt, idx) => {
                if (!cloneOpts[idx]) return;
                if (opt.selected) cloneOpts[idx].setAttribute('selected', 'selected');
                else cloneOpts[idx].removeAttribute('selected');
              });
            }
          });

          // B. Convertir <canvas> dinámicos (gráficos, charts, firmas) en imágenes PNG fieles dentro del clon
          const liveCanvases = document.querySelectorAll('canvas');
          const cloneCanvases = cloneRoot.querySelectorAll('canvas');
          liveCanvases.forEach((liveCanvas, i) => {
            const cloneCanvas = cloneCanvases[i];
            if (!cloneCanvas || liveCanvas.width === 0 || liveCanvas.height === 0) return;
            try {
              const dataUrl = liveCanvas.toDataURL('image/png');
              if (dataUrl && dataUrl.startsWith('data:image/png')) {
                const img = document.createElement('img');
                img.setAttribute('src', dataUrl);
                if (liveCanvas.className) img.className = liveCanvas.className;
                const rect = liveCanvas.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                  img.style.width = `${Math.round(rect.width)}px`;
                  img.style.height = `${Math.round(rect.height)}px`;
                }
                cloneCanvas.replaceWith(img);
              }
            } catch (_) {}
          });

          // C. Capturar hojas CSS-in-JS (styled-components / Emotion / adoptedStyleSheets) que están vacías en HTML
          let dynamicCssText = '';
          try {
            Array.from(document.styleSheets).forEach(sheet => {
              try {
                const owner = sheet.ownerNode;
                if (owner && owner.tagName === 'STYLE' && (!owner.textContent || !owner.textContent.trim())) {
                  const rules = Array.from(sheet.cssRules || []).map(r => r.cssText).join('\n');
                  if (rules) dynamicCssText += rules + '\n';
                }
              } catch (_) {}
            });
            if (document.adoptedStyleSheets && document.adoptedStyleSheets.length > 0) {
              Array.from(document.adoptedStyleSheets).forEach(sheet => {
                try {
                  const rules = Array.from(sheet.cssRules || []).map(r => r.cssText).join('\n');
                  if (rules) dynamicCssText += rules + '\n';
                } catch (_) {}
              });
            }
          } catch (_) {}

          if (dynamicCssText) {
            const dynStyle = document.createElement('style');
            dynStyle.setAttribute('data-bwd-css-in-js', 'true');
            dynStyle.textContent = dynamicCssText;
            const cloneHead = cloneRoot.querySelector('head') || cloneRoot;
            cloneHead.appendChild(dynStyle);
          }

          // D. Resolver imágenes reales sobre cloneRoot usando las lecturas en memoria de las imágenes vivas (sin tocar la página)
          const liveImgs = document.querySelectorAll('img');
          const cloneImgs = cloneRoot.querySelectorAll('img');
          liveImgs.forEach((liveImg, idx) => {
            const cloneImg = cloneImgs[idx];
            if (!cloneImg) return;

            const srcsetBest = pickBestSrcsetUrl(
              liveImg.getAttribute('srcset') ||
              liveImg.getAttribute('data-srcset') ||
              (liveImg.closest('picture') ? Array.from(liveImg.closest('picture').querySelectorAll('source')).map(s => s.getAttribute('srcset') || s.getAttribute('data-srcset') || '').join(', ') : '')
            );

            const candidates = [
              liveImg.currentSrc,
              srcsetBest,
              liveImg.getAttribute('data-src'),
              liveImg.getAttribute('data-original'),
              liveImg.getAttribute('data-lazy-src'),
              liveImg.getAttribute('data-url'),
              liveImg.getAttribute('data-retina'),
              liveImg.getAttribute('src')
            ];

            let realSrc = '';
            for (const c of candidates) {
              if (c && typeof c === 'string' && !c.includes('data:image/svg') && !c.includes('placeholder')) {
                realSrc = c.trim();
                break;
              }
            }
            if (!realSrc && liveImg.getAttribute('src')) {
              realSrc = liveImg.getAttribute('src').trim();
            }

            let absUrl = realSrc;
            if (realSrc && !realSrc.startsWith('data:')) {
              try {
                absUrl = new URL(realSrc, baseHref).href;
              } catch (_) {}
            }

            if (absUrl) {
              cloneImg.setAttribute('src', absUrl);
            }

            // Si está cargada y es mismo origen, preservar PNG (con canal alfa/transparencia) o JPEG según corresponda
            if (
              liveImg.complete &&
              liveImg.naturalWidth > 0 &&
              liveImg.naturalHeight > 0 &&
              liveImg.naturalWidth <= 2400 &&
              absUrl &&
              !absUrl.startsWith('data:image/svg') &&
              !/\.svg(?:$|\?)/i.test(absUrl)
            ) {
              try {
                const canvas = document.createElement('canvas');
                canvas.width = liveImg.naturalWidth;
                canvas.height = liveImg.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(liveImg, 0, 0);
                const isJpegSource = /\.(?:jpe?g)(?:$|\?)/i.test(absUrl);
                const mime = isJpegSource ? 'image/jpeg' : 'image/png';
                const dataUrl = isJpegSource ? canvas.toDataURL(mime, 0.90) : canvas.toDataURL(mime);
                if (dataUrl && dataUrl.startsWith('data:image/')) {
                  cloneImg.setAttribute('src', dataUrl);
                }
              } catch (_) {
                // Si tiene CORS, el inliner privilegiado del editor la descargará intacta
              }
            }

            cloneImg.removeAttribute('data-src');
            cloneImg.removeAttribute('data-original');
            cloneImg.removeAttribute('data-lazy-src');
            cloneImg.removeAttribute('data-srcset');
            cloneImg.removeAttribute('data-url');
            cloneImg.removeAttribute('srcset');
            cloneImg.setAttribute('loading', 'eager');
          });

          // Desenrollar <picture> únicamente en cloneRoot
          cloneRoot.querySelectorAll('picture').forEach(pic => {
            const img = pic.querySelector('img');
            if (img) pic.replaceWith(img);
          });
        } catch (_) {}

        // A. Neutralizar scripts y noscripts completamente para evitar bloqueos y recargas
        cloneRoot.querySelectorAll('script, noscript').forEach(s => s.remove());

        // B. Neutralizar autoplay en videos y audios para evitar advertencias de permisos y consumo
        cloneRoot.querySelectorAll('video, audio').forEach(media => {
          media.removeAttribute('autoplay');
          media.removeAttribute('loop');
          media.setAttribute('muted', '');
        });

        // C. Neutralizar iframes invasivos de tracking, videos publicitarios y paywall (Google SwG, serviceiframe, etc.)
        cloneRoot.querySelectorAll('iframe').forEach(ifr => {
          const src = (ifr.getAttribute('src') || '').toLowerCase();
          const id = (ifr.getAttribute('id') || '').toLowerCase();
          if (
            id.includes('serviceiframe') ||
            src.includes('google.com/swg') ||
            src.includes('doubleclick') ||
            src.includes('google_ads') ||
            src.includes('taboola') ||
            src.includes('outbrain') ||
            src.includes('adnxs') ||
            src.includes('adsystem') ||
            src.includes('dailymotion') ||
            src.includes('chartbeat') ||
            src.includes('adzone') ||
            src.includes('streamtheworld') ||
            src.includes('imasdk')
          ) {
            ifr.remove();
          }
        });

        // D. Eliminar inline handlers (onload, onerror, etc.) en el DOM clonado sin usar regex destructivo
        cloneRoot.querySelectorAll('*').forEach(el => {
          for (const attr of Array.from(el.attributes)) {
            if (attr.name.toLowerCase().startsWith('on')) {
              el.removeAttribute(attr.name);
            }
          }
        });

        // E. Solo si el usuario activó explícitamente pre-limpieza en el panel Creador
        if (shouldClean) {
          const adSelectors = [
            'ins.adsbygoogle',
            'iframe[id*="google_ads"]',
            'div[id*="google_ads"]',
            'div[id*="div-gpt-ad"]',
            'div[class*="taboola"]',
            'div[class*="outbrain"]',
            'div[class*="advertisement"]',
            'div[class*="ad-box"]',
            'div[class*="ad-container"]',
            'div[class*="banner-ad"]',
            'div[class*="dfp-ad"]',
            'div[class*="teads"]',
            '[data-ad-slot]',
            '[data-ad-unit]',
            '#onetrust-consent-sdk',
            '#onetrust-banner-sdk',
            '#cookie-banner',
            '[class*="cookie-consent"]',
            '.swg-dialog',
            '[class*="newsletter-modal"]',
            '#disqus_thread'
          ];
          adSelectors.forEach(sel => {
            try {
              cloneRoot.querySelectorAll(sel).forEach(el => {
                if (!['HTML', 'HEAD', 'BODY', 'MAIN', 'ARTICLE'].includes(el.tagName)) {
                  el.remove();
                }
              });
            } catch (_) {}
          });
        }

        return {
          html: '<!DOCTYPE html>\n' + cloneRoot.outerHTML,
          title: document.title || 'Página Web',
          url: window.location.href,
          baseURI: baseHref,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          createdAt: Date.now()
        };
      }, [clean]);
      } finally {
        if (origUserScroll) {
          await executeInPage((pos) => {
            delete window._bwdCleanTopSnapshot;
            window.scrollTo({ top: pos.y, left: pos.x, behavior: 'instant' });
          }, [origUserScroll]).catch(() => {});
        }
      }

      if (!cloneData || !cloneData.html) {
        throw new Error("No se pudo extraer el HTML de la página activa.");
      }

      setProgress(65, "Guardando sesión aislada en almacenamiento...", 'busy');

      // Limpiar sesiones antiguas (> 2 horas) para proteger cuota de browser.storage.local
      try {
        const allStored = await browser.storage.local.get(null);
        const now = Date.now();
        const keysToRemove = Object.keys(allStored).filter(k => {
          if (!k.startsWith('bwd_clone_session_')) return false;
          const item = allStored[k];
          return !item || !item.createdAt || (now - item.createdAt > 2 * 60 * 60 * 1000);
        });
        if (keysToRemove.length > 0) {
          await browser.storage.local.remove(keysToRemove);
        }
      } catch (_) {}

      const sessionId = `bwd_clone_session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await browser.storage.local.set({
        [sessionId]: cloneData,
        bwd_clone_data: cloneData
      });

      setProgress(85, "Abriendo Modo Creador Inteligente...", 'busy');
      await browser.tabs.create({
        url: browser.runtime.getURL(`editor/editor.html?id=${encodeURIComponent(sessionId)}`)
      });

      setProgress(100, "¡Modo Creador Inteligente iniciado!", 'success');
      setBusy(false);

      setTimeout(() => {
        window.close();
      }, 400);

    } catch (err) {
      console.error("Error al abrir Modo Creador:", err);
      setProgress(0, `Error: ${formatErrorMessage(err)}`, 'error');
      setBusy(false);
    }
  });
}

function initSpotlightCards() {
  const cards = document.querySelectorAll('.action-row, .pro-spotlight-card');
  cards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    });
  });
}

function initSettingsCollapsible() {
  const collapsible = document.getElementById('settingsCollapsible');
  const trigger = document.getElementById('btnToggleSettings');
  if (!collapsible || !trigger) return;

  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    collapsible.classList.toggle('is-open');
  });
}

function applySubModeVisualState() {
  const bindGroupState = (groupId, attrName, currentVal, summaryEl, summaryMap) => {
    const group = document.getElementById(groupId);
    if (group) {
      group.querySelectorAll(`[${attrName}]`).forEach(pill => {
        const val = pill.getAttribute(attrName);
        pill.classList.toggle('is-active', val === currentVal);
      });
    }
    if (summaryEl && summaryMap && summaryMap[currentVal]) {
      summaryEl.textContent = summaryMap[currentVal];
    }
  };

  bindGroupState('popupPdfModeGroup', 'data-pdf-mode', exportState.pdfMode, pdfSummaryTextEl, MODE_SUMMARIES.pdfMode);
  bindGroupState('popupDocxModeGroup', 'data-docx-mode', exportState.docxMode, docxSummaryTextEl, MODE_SUMMARIES.docxMode);
  bindGroupState('popupPngModeGroup', 'data-png-mode', exportState.pngMode, pngSummaryTextEl, MODE_SUMMARIES.pngMode);
  bindGroupState('popupHtmlModeGroup', 'data-html-mode', exportState.htmlMode, htmlSummaryTextEl, MODE_SUMMARIES.htmlMode);
}

async function saveExportPrefs() {
  try {
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.set({
        bwd_export_prefs: {
          cleanDom: cleanDomCheckbox ? cleanDomCheckbox.checked : true,
          expandScroll: expandScrollCheckbox ? expandScrollCheckbox.checked : true,
          highQuality: highQualityCheckbox ? highQualityCheckbox.checked : true,
          cleanCloneDom: cleanCloneCheckboxEl ? cleanCloneCheckboxEl.checked : false,
          pdfMode: exportState.pdfMode,
          docxMode: exportState.docxMode,
          pngMode: exportState.pngMode,
          htmlMode: exportState.htmlMode
        }
      });
    }
  } catch (_) {}
}

async function initExportSubModesAndPrefs() {
  try {
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      const stored = await browser.storage.local.get('bwd_export_prefs');
      const prefs = stored && stored.bwd_export_prefs;
      if (prefs && typeof prefs === 'object') {
        if (cleanDomCheckbox && typeof prefs.cleanDom === 'boolean') cleanDomCheckbox.checked = prefs.cleanDom;
        if (expandScrollCheckbox && typeof prefs.expandScroll === 'boolean') expandScrollCheckbox.checked = prefs.expandScroll;
        if (highQualityCheckbox && typeof prefs.highQuality === 'boolean') highQualityCheckbox.checked = prefs.highQuality;
        if (cleanCloneCheckboxEl && typeof prefs.cleanCloneDom === 'boolean') cleanCloneCheckboxEl.checked = prefs.cleanCloneDom;
        if (prefs.pdfMode && MODE_SUMMARIES.pdfMode[prefs.pdfMode]) exportState.pdfMode = prefs.pdfMode;
        if (prefs.docxMode && MODE_SUMMARIES.docxMode[prefs.docxMode]) exportState.docxMode = prefs.docxMode;
        if (prefs.pngMode && MODE_SUMMARIES.pngMode[prefs.pngMode]) exportState.pngMode = prefs.pngMode;
        if (prefs.htmlMode && MODE_SUMMARIES.htmlMode[prefs.htmlMode]) exportState.htmlMode = prefs.htmlMode;
      }
    }
  } catch (_) {}

  applySubModeVisualState();

  const wireGroup = (groupId, attrName, stateKey) => {
    const group = document.getElementById(groupId);
    if (!group) return;
    group.querySelectorAll(`[${attrName}]`).forEach(pill => {
      const activatePill = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const val = pill.getAttribute(attrName);
        if (!val) return;
        exportState[stateKey] = val;
        applySubModeVisualState();
        saveExportPrefs();
      };
      pill.addEventListener('click', activatePill);
      pill.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') activatePill(e);
      });
    });
  };

  wireGroup('popupPdfModeGroup', 'data-pdf-mode', 'pdfMode');
  wireGroup('popupDocxModeGroup', 'data-docx-mode', 'docxMode');
  wireGroup('popupPngModeGroup', 'data-png-mode', 'pngMode');
  wireGroup('popupHtmlModeGroup', 'data-html-mode', 'htmlMode');

  [cleanDomCheckbox, expandScrollCheckbox, highQualityCheckbox, cleanCloneCheckboxEl].forEach(chk => {
    if (chk) chk.addEventListener('change', () => saveExportPrefs());
  });
}

async function initLivePageBackground() {
  try {
    const tab = await getActiveTab();
    if (tab) {
      await applyPageBackground(tab);
    }
  } catch (_) {}
}

document.addEventListener('DOMContentLoaded', () => {
  initTabDetection();
  initExportSubModesAndPrefs();
  initTooltips();
  initTabs();
  initEditorLauncher();
  initSpotlightCards();
  initSettingsCollapsible();
});
