/**
 * ============================================================================
 * Webs-Docs — Motor Compartido ZIP / OpenXML (.docx) y Rebanado A4 Inteligente
 * Módulo único usado por popup/ y editor/ (shared/zip-docx.js)
 * ============================================================================
 */
(function (global) {
  'use strict';

  const BwdShared = global.BwdShared || (global.BwdShared = {});

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

  async function compressZipInstance(zip) {
    if (typeof CompressionStream === 'undefined') {
      return zip.build();
    }

    try {
      const textEncoder = new TextEncoder();
      const localParts = [];
      const cdParts = [];
      let offset = 0;

      for (const f of zip.files) {
        const nameBytes = textEncoder.encode(f.path);
        const isAlreadyCompressedMedia = /\.(jpe?g|png)$/i.test(f.path);
        let compBytes = f.bytes;
        let method = 0;

        if (!isAlreadyCompressedMedia && f.bytes.length > 96) {
          try {
            const cs = new CompressionStream('deflate-raw');
            const writer = cs.writable.getWriter();
            writer.write(f.bytes);
            writer.close();
            const buf = await new Response(cs.readable).arrayBuffer();
            const deflated = new Uint8Array(buf);
            if (deflated.length > 0 && deflated.length < f.bytes.length) {
              compBytes = deflated;
              method = 8;
            }
          } catch (_) {}
        }

        const localH = new Uint8Array(30 + nameBytes.length);
        const lView = new DataView(localH.buffer);
        lView.setUint32(0, 0x04034b50, true);
        lView.setUint16(4, 20, true);
        lView.setUint16(6, 0, true);
        lView.setUint16(8, method, true);
        lView.setUint16(10, 0, true);
        lView.setUint16(12, 0, true);
        lView.setUint32(14, f.crc, true);
        lView.setUint32(18, compBytes.length, true);
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
        cView.setUint16(10, method, true);
        cView.setUint16(12, 0, true);
        cView.setUint16(14, 0, true);
        cView.setUint32(16, f.crc, true);
        cView.setUint32(20, compBytes.length, true);
        cView.setUint32(24, f.bytes.length, true);
        cView.setUint16(28, nameBytes.length, true);
        cView.setUint16(30, 0, true);
        cView.setUint16(32, 0, true);
        cView.setUint16(34, 0, true);
        cView.setUint16(36, 0, true);
        cView.setUint32(38, 0, true);
        cView.setUint32(42, offset, true);
        cdH.set(nameBytes, 46);

        localParts.push(localH, compBytes);
        cdParts.push(cdH);
        offset += localH.length + compBytes.length;
      }

      const cdOffset = offset;
      let cdSize = 0;
      for (const cd of cdParts) cdSize += cd.length;

      const eocd = new Uint8Array(22);
      const eView = new DataView(eocd.buffer);
      eView.setUint32(0, 0x06054b50, true);
      eView.setUint16(4, 0, true);
      eView.setUint16(6, 0, true);
      eView.setUint16(8, zip.files.length, true);
      eView.setUint16(10, zip.files.length, true);
      eView.setUint32(12, cdSize, true);
      eView.setUint32(16, cdOffset, true);
      eView.setUint16(20, 0, true);

      const out = new Uint8Array(offset + cdSize + 22);
      let cur = 0;
      for (const part of [...localParts, ...cdParts, eocd]) {
        out.set(part, cur);
        cur += part.length;
      }
      return out;
    } catch (_) {
      return zip.build();
    }
  }

  async function fetchImageForWordMedia(imgUrl) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(imgUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const blob = await res.blob();
      const bmpUrl = URL.createObjectURL(blob);
      try {
        const im = new Image();
        await new Promise((resolve, reject) => {
          im.onload = resolve;
          im.onerror = reject;
          im.src = bmpUrl;
        });
        if (im.naturalWidth < 60 || im.naturalHeight < 40) return null;
        const maxDim = 1400;
        const scale = Math.min(1, maxDim / Math.max(im.naturalWidth, im.naturalHeight));
        const w = Math.max(1, Math.round(im.naturalWidth * scale));
        const h = Math.max(1, Math.round(im.naturalHeight * scale));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const cctx = c.getContext('2d');
        cctx.fillStyle = '#ffffff';
        cctx.fillRect(0, 0, w, h);
        cctx.drawImage(im, 0, 0, w, h);
        const jpegBlob = await BwdShared.canvasToBlob(c, 'image/jpeg', 0.88);
        const bytes = new Uint8Array(await jpegBlob.arrayBuffer());
        return { bytes, width: w, height: h, ext: 'jpeg' };
      } finally {
        URL.revokeObjectURL(bmpUrl);
      }
    } catch (_) {
      return null;
    }
  }

  function decodeSliceBytes(slice) {
    if (slice.bytes) return slice.bytes;
    if (!slice.dataUrl) return new Uint8Array(0);
    const b64 = slice.dataUrl.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function buildDocx(slices = [], isLandscape = false, structuredItems = []) {
    const esc = BwdShared.escapeXml;
    const zip = new SimpleZip();
    let relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n`;
    let bodyXml = '';

    const maxW = isLandscape ? 10234800 : 7102800;
    const maxH = isLandscape ? 7102800 : 10234800;

    slices.forEach((slice, idx) => {
      const rId = `rId${idx + 1}`;
      const imgName = `image${idx + 1}.jpeg`;
      zip.addFile(`word/media/${imgName}`, decodeSliceBytes(slice));
      relsXml += `  <Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imgName}"/>\n`;

      const scale = Math.min(maxW / slice.width, maxH / slice.height);
      const widthEmu = Math.round(slice.width * scale);
      const heightEmu = Math.round(slice.height * scale);
      const pageBreakXml = idx > 0 ? '<w:pageBreakBefore/>' : '';

      bodyXml += `
      <w:p>
        <w:pPr>${pageBreakXml}<w:jc w:val="center"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>
        <w:r>
          <w:drawing>
            <wp:inline distT="0" distB="0" distL="0" distR="0">
              <wp:extent cx="${widthEmu}" cy="${heightEmu}"/>
              <wp:effectExtent l="0" t="0" r="0" b="0"/>
              <wp:docPr id="${idx + 1}" name="Página ${idx + 1}"/>
              <wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>
              <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
                <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                    <pic:nvPicPr><pic:cNvPr id="${idx + 1}" name="${imgName}"/><pic:cNvPicPr/></pic:nvPicPr>
                    <pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
                    <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
                  </pic:pic>
                </a:graphicData>
              </a:graphic>
            </wp:inline>
          </w:drawing>
        </w:r>
      </w:p>`;
    });

    relsXml += `</Relationships>`;

    if (structuredItems && structuredItems.length > 0) {
      const breakIfVisual = slices.length > 0 ? '<w:pageBreakBefore/>' : '';
      bodyXml += `<w:p><w:pPr>${breakIfVisual}<w:spacing w:before="240" w:after="140"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="2563EB"/></w:rPr><w:t xml:space="preserve">Contenido y Texto Editable del Documento</w:t></w:r></w:p>`;

      structuredItems.forEach(item => {
        if (item.type === 'heading') {
          const sz = item.level === 1 ? '34' : item.level === 2 ? '28' : '24';
          const color = item.level === 1 ? '0F172A' : item.level === 2 ? '1E293B' : '334155';
          const spBefore = item.level === 1 ? '260' : '200';
          bodyXml += `<w:p><w:pPr><w:spacing w:before="${spBefore}" w:after="100"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="${sz}"/><w:color w:val="${color}"/></w:rPr><w:t xml:space="preserve">${esc(item.text)}</w:t></w:r></w:p>`;
        } else if (item.type === 'paragraph') {
          bodyXml += `<w:p><w:pPr><w:spacing w:before="60" w:after="120" w:line="276" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:sz w:val="22"/><w:color w:val="334155"/></w:rPr><w:t xml:space="preserve">${esc(item.text)}</w:t></w:r></w:p>`;
        } else if (item.type === 'quote') {
          bodyXml += `<w:p><w:pPr><w:spacing w:before="120" w:after="120"/><w:ind w:left="400"/></w:pPr><w:r><w:rPr><w:i/><w:sz w:val="22"/><w:color w:val="64748B"/></w:rPr><w:t xml:space="preserve">${esc(item.text)}</w:t></w:r></w:p>`;
        } else if (item.type === 'list') {
          (item.items || []).forEach((liText, liIdx) => {
            const bullet = item.isOrdered ? `${liIdx + 1}. ` : '•  ';
            bodyXml += `<w:p><w:pPr><w:spacing w:before="40" w:after="40"/><w:ind w:left="360"/></w:pPr><w:r><w:rPr><w:sz w:val="22"/><w:color w:val="334155"/></w:rPr><w:t xml:space="preserve">${esc(bullet + liText)}</w:t></w:r></w:p>`;
          });
        } else if (item.type === 'table') {
          bodyXml += `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/></w:tblBorders></w:tblPr>`;
          (item.rows || []).forEach(row => {
            bodyXml += `<w:tr>`;
            row.forEach(cell => {
              const isH = cell.isHeader;
              bodyXml += `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/><w:tcMar><w:top w:w="120"/><w:bottom w:w="120"/><w:left w:w="160"/><w:right w:w="160"/></w:tcMar>${isH ? '<w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>' : ''}</w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:rPr>${isH ? '<w:b/>' : ''}<w:sz w:val="20"/><w:color w:val="${isH ? '0F172A' : '334155'}"/></w:rPr><w:t xml:space="preserve">${esc(cell.text)}</w:t></w:r></w:p></w:tc>`;
            });
            bodyXml += `</w:tr>`;
          });
          bodyXml += `</w:tbl>`;
        } else if (item.type === 'code') {
          bodyXml += `<w:p><w:pPr><w:spacing w:before="80" w:after="80"/><w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="20"/><w:color w:val="0F172A"/></w:rPr><w:t xml:space="preserve">${esc(item.text)}</w:t></w:r></w:p>`;
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

  async function buildRichEditableDocx(structuredItems = [], docMeta = {}, visualSlices = []) {
    const esc = BwdShared.escapeXml;
    const zip = new SimpleZip();
    let relIdx = 1;
    const nextRelId = () => `rId${relIdx++}`;
    const hyperlinkRels = new Map();
    let relsEntries = '';
    let bodyXml = '';
    let docPrId = 1;

    const ensureHyperlinkRel = (url) => {
      if (!url) return null;
      if (hyperlinkRels.has(url)) return hyperlinkRels.get(url);
      const rId = nextRelId();
      hyperlinkRels.set(url, rId);
      relsEntries += `  <Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(url)}" TargetMode="External"/>\n`;
      return rId;
    };

    const renderRunsXml = (runs, fallbackText, baseSz = '22', baseColor = '1E293B', forceBold = false, forceItalic = false) => {
      const list = (Array.isArray(runs) && runs.length > 0) ? runs : [{ text: fallbackText || '' }];
      let xml = '';
      list.forEach(r => {
        if (!r || !r.text) return;
        const isB = Boolean(forceBold || r.bold);
        const isI = Boolean(forceItalic || r.italic);
        const linkId = r.href ? ensureHyperlinkRel(r.href) : null;
        const colorVal = linkId ? '0284C7' : baseColor;
        const uXml = linkId ? '<w:u w:val="single"/>' : '';

        const parts = String(r.text).split('\n');
        let innerRun = `<w:r><w:rPr>${isB ? '<w:b/>' : ''}${isI ? '<w:i/>' : ''}${uXml}<w:sz w:val="${baseSz}"/><w:szCs w:val="${baseSz}"/><w:color w:val="${colorVal}"/></w:rPr>`;
        parts.forEach((seg, sIdx) => {
          if (sIdx > 0) innerRun += '<w:br/>';
          innerRun += `<w:t xml:space="preserve">${esc(seg)}</w:t>`;
        });
        innerRun += `</w:r>`;

        xml += linkId ? `<w:hyperlink r:id="${linkId}">${innerRun}</w:hyperlink>` : innerRun;
      });
      return xml;
    };

    const maxVisualW = 6858000;
    const maxVisualH = 9874000;
    visualSlices.forEach((slice, sIdx) => {
      const rId = nextRelId();
      const imgName = `visual_page_${sIdx + 1}.jpeg`;
      zip.addFile(`word/media/${imgName}`, decodeSliceBytes(slice));
      relsEntries += `  <Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imgName}"/>\n`;

      const sc = Math.min(maxVisualW / slice.width, maxVisualH / slice.height);
      const cx = Math.round(slice.width * sc);
      const cy = Math.round(slice.height * sc);
      const idNum = docPrId++;

      bodyXml += `<w:p><w:pPr>${sIdx > 0 ? '<w:pageBreakBefore/>' : ''}<w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${idNum}" name="Vista ${sIdx + 1}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${idNum}" name="${imgName}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
    });

    if (structuredItems.length > 0 || visualSlices.length === 0) {
      const hasH1 = structuredItems.some(it => it.type === 'heading' && it.level === 1);
      if (visualSlices.length > 0) {
        bodyXml += `<w:p><w:pPr><w:pageBreakBefore/><w:spacing w:before="200" w:after="160"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="30"/><w:color w:val="0284C7"/></w:rPr><w:t xml:space="preserve">Versión 100% Editable del Documento</w:t></w:r></w:p>`;
      } else if (docMeta.title && !hasH1) {
        bodyXml += `<w:p><w:pPr><w:spacing w:before="80" w:after="140"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="0F172A"/></w:rPr><w:t xml:space="preserve">${esc(docMeta.title)}</w:t></w:r></w:p>`;
      }
      if (docMeta.url && visualSlices.length === 0) {
        const srcLinkId = ensureHyperlinkRel(docMeta.url);
        bodyXml += `<w:p><w:pPr><w:spacing w:before="0" w:after="200"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="6" w:color="E2E8F0"/></w:pBdr></w:pPr><w:r><w:rPr><w:sz w:val="18"/><w:color w:val="64748B"/></w:rPr><w:t xml:space="preserve">Fuente original: </w:t></w:r>${srcLinkId ? `<w:hyperlink r:id="${srcLinkId}"><w:r><w:rPr><w:u w:val="single"/><w:sz w:val="18"/><w:color w:val="0284C7"/></w:rPr><w:t xml:space="preserve">${esc(docMeta.url)}</w:t></w:r></w:hyperlink>` : ''}</w:p>`;
      }
    }

    let embeddedArticlePhotos = 0;
    const maxContentEmuW = 5943600;

    for (const item of structuredItems) {
      if (item.type === 'heading') {
        const sz = item.level === 1 ? '36' : item.level === 2 ? '28' : item.level === 3 ? '25' : '23';
        const color = item.level === 1 ? '0F172A' : '1E293B';
        const spBefore = item.level === 1 ? '260' : '200';
        bodyXml += `<w:p><w:pPr><w:keepNext/><w:spacing w:before="${spBefore}" w:after="100"/></w:pPr>${renderRunsXml(item.runs, item.text, sz, color, true, false)}</w:p>`;
      } else if (item.type === 'paragraph') {
        bodyXml += `<w:p><w:pPr><w:spacing w:before="60" w:after="140" w:line="288" w:lineRule="auto"/></w:pPr>${renderRunsXml(item.runs, item.text, '22', '1E293B', false, false)}</w:p>`;
      } else if (item.type === 'quote') {
        bodyXml += `<w:p><w:pPr><w:spacing w:before="140" w:after="140"/><w:ind w:left="420"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="12" w:color="38BDF8"/></w:pBdr></w:pPr>${renderRunsXml(item.runs, item.text, '22', '475569', false, true)}</w:p>`;
      } else if (item.type === 'list') {
        const richList = item.richItems || (item.items || []).map(t => ({ text: t, runs: [{ text: t }] }));
        richList.forEach((liObj, idx) => {
          const prefix = item.isOrdered ? `${idx + 1}. ` : '•  ';
          bodyXml += `<w:p><w:pPr><w:spacing w:before="40" w:after="60" w:line="268" w:lineRule="auto"/><w:ind w:left="420" w:hanging="220"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="22"/><w:color w:val="0284C7"/></w:rPr><w:t xml:space="preserve">${esc(prefix)}</w:t></w:r>${renderRunsXml(liObj.runs, liObj.text, '22', '1E293B', false, false)}</w:p>`;
        });
      } else if (item.type === 'table') {
        bodyXml += `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/></w:tblBorders></w:tblPr>`;
        (item.rows || []).forEach(row => {
          bodyXml += `<w:tr>`;
          row.forEach(cell => {
            const isH = Boolean(cell.isHeader);
            bodyXml += `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/><w:tcMar><w:top w:w="120"/><w:bottom w:w="120"/><w:left w:w="160"/><w:right w:w="160"/></w:tcMar>${isH ? '<w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>' : ''}</w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="20"/></w:pPr><w:r><w:rPr>${isH ? '<w:b/>' : ''}<w:sz w:val="20"/><w:color w:val="${isH ? '0F172A' : '334155'}"/></w:rPr><w:t xml:space="preserve">${esc(cell.text)}</w:t></w:r></w:p></w:tc>`;
          });
          bodyXml += `</w:tr>`;
        });
        bodyXml += `</w:tbl><w:p><w:pPr><w:spacing w:before="40" w:after="80"/></w:pPr></w:p>`;
      } else if (item.type === 'code') {
        const codeLines = String(item.text || '').split('\n');
        let codeRuns = '';
        codeLines.forEach((ln, lIdx) => {
          if (lIdx > 0) codeRuns += '<w:br/>';
          codeRuns += `<w:t xml:space="preserve">${esc(ln)}</w:t>`;
        });
        bodyXml += `<w:p><w:pPr><w:spacing w:before="100" w:after="120"/><w:ind w:left="200" w:right="200"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="19"/><w:color w:val="0F172A"/></w:rPr>${codeRuns}</w:r></w:p>`;
      } else if (item.type === 'image' && item.src && embeddedArticlePhotos < 24) {
        const media = await fetchImageForWordMedia(item.src);
        if (media) {
          embeddedArticlePhotos++;
          const rId = nextRelId();
          const imgName = `article_img_${embeddedArticlePhotos}.jpeg`;
          zip.addFile(`word/media/${imgName}`, media.bytes);
          relsEntries += `  <Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imgName}"/>\n`;

          const rawEmuW = media.width * 9525;
          const rawEmuH = media.height * 9525;
          const sc = Math.min(1, maxContentEmuW / Math.max(1, rawEmuW), 7200000 / Math.max(1, rawEmuH));
          const cx = Math.round(rawEmuW * sc);
          const cy = Math.round(rawEmuH * sc);
          const idNum = docPrId++;

          bodyXml += `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="140" w:after="${item.caption ? '40' : '140'}"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${idNum}" name="Imagen ${embeddedArticlePhotos}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${idNum}" name="${imgName}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
          if (item.caption) {
            bodyXml += `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="160"/></w:pPr><w:r><w:rPr><w:i/><w:sz w:val="18"/><w:color w:val="64748B"/></w:rPr><w:t xml:space="preserve">${esc(item.caption)}</w:t></w:r></w:p>`;
          }
        }
      }
    }

    const marginTwips = visualSlices.length > 0 ? 540 : 1134;
    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838" w:orient="portrait"/>
      <w:pgMar w:top="${marginTwips}" w:right="${marginTwips}" w:bottom="${marginTwips}" w:left="${marginTwips}" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

    const fullRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n${relsEntries}</Relationships>`;

    zip.addFile('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

    zip.addFile('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

    zip.addFile('word/_rels/document.xml.rels', fullRelsXml);
    zip.addFile('word/document.xml', docXml);
    return await compressZipInstance(zip);
  }

  function findSafeCutRow(ctx, width, idealCutY, minCutY, totalHeight, avoidZones = []) {
    if (idealCutY >= totalHeight) return totalHeight;

    let adjustedIdeal = idealCutY;
    if (Array.isArray(avoidZones) && avoidZones.length > 0) {
      for (const z of avoidZones) {
        if (z && z.top < adjustedIdeal && z.bottom > adjustedIdeal) {
          const candidateAbove = Math.floor(z.top - 10);
          if (candidateAbove >= minCutY) {
            adjustedIdeal = candidateAbove;
          }
        }
      }
    }

    const searchStart = Math.max(minCutY, adjustedIdeal - Math.round(width * 0.34));
    const bandHeight = adjustedIdeal - searchStart;
    if (bandHeight <= 8) return adjustedIdeal;

    try {
      const sampleStepX = Math.max(2, Math.floor(width / 160));
      const imgData = ctx.getImageData(0, searchStart, width, bandHeight).data;
      let bestRowOffset = bandHeight - 1;
      let lowestVariance = Infinity;

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

        if (diffSum <= 22) return searchStart + ry;
        if (diffSum < lowestVariance) {
          lowestVariance = diffSum;
          bestRowOffset = ry;
        }
      }
      return searchStart + bestRowOffset;
    } catch (_) {
      return adjustedIdeal;
    }
  }

  function sliceCanvasForA4(canvas, onProgress = () => {}, bgFill = '#ffffff', jpegQuality = 0.92, avoidZones = []) {
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const sliceHeightPx = Math.floor(canvasWidth * (281 / 194));
    const isSingleScreen = (canvasHeight <= (canvasWidth * 1.45));

    if (isSingleScreen) {
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvasWidth;
      pageCanvas.height = canvasHeight;
      const pctx = pageCanvas.getContext('2d');
      pctx.fillStyle = bgFill;
      pctx.fillRect(0, 0, canvasWidth, canvasHeight);
      pctx.drawImage(canvas, 0, 0);

      return [{
        dataUrl: pageCanvas.toDataURL('image/jpeg', jpegQuality),
        width: canvasWidth,
        height: canvasHeight,
        offsetY: 0,
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
        const minCut = currentY + Math.floor(sliceHeightPx * 0.45);
        nextCutY = findSafeCutRow(srcCtx, canvasWidth, idealCut, minCut, canvasHeight, avoidZones);
      }

      const currentSliceH = Math.max(1, nextCutY - currentY);
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvasWidth;
      pageCanvas.height = currentSliceH;

      const pctx = pageCanvas.getContext('2d');
      pctx.fillStyle = bgFill;
      pctx.fillRect(0, 0, canvasWidth, currentSliceH);
      pctx.drawImage(canvas, 0, currentY, canvasWidth, currentSliceH, 0, 0, canvasWidth, currentSliceH);

      slices.push({
        dataUrl: pageCanvas.toDataURL('image/jpeg', jpegQuality),
        width: canvasWidth,
        height: currentSliceH,
        offsetY: currentY,
        sliceHeightPx,
        isSingleScreen: false
      });

      currentY = nextCutY;
      pageIndex++;
      onProgress(pageIndex, Math.max(pageIndex, estTotalPages));
    }

    return slices;
  }

  Object.assign(BwdShared, {
    crc32,
    SimpleZip,
    compressZipInstance,
    fetchImageForWordMedia,
    buildDocx,
    buildRichEditableDocx,
    findSafeCutRow,
    sliceCanvasForA4
  });
})(window);
