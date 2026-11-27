/**
 * Smart Print & Standalone HTML Export Helper for iSEPADU AI
 * Uses a main-document @media print portal (#isepadu-print-portal) with 1-Page A4 Auto-Fit
 * and automatic 600ms sandbox detection fallback so printing works 100% reliably
 * in both live browsers and sandboxed iframe previews.
 */

export interface SmartPrintOptions {
  elementId: string;
  title?: string;
  orientation?: 'portrait' | 'landscape';
  singlePage?: boolean;
  onNotice?: (message: string) => void;
}

export interface SmartPrintResult {
  mode: 'native' | 'iframe' | 'download' | 'error';
  message: string;
}

export function buildPrintableHtmlDocument(
  innerHtml: string,
  title: string,
  orientation: 'portrait' | 'landscape' = 'portrait',
  singlePage: boolean = false
): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const resolvedHtml = origin
    ? innerHtml.replace(/src="\/assets\//g, `src="${origin}/assets/`)
    : innerHtml;

  // Collect existing stylesheet links and inline styles from the current document
  let headStyles = '';
  if (typeof document !== 'undefined') {
    const styleNodes = document.querySelectorAll(
      'style:not(#isepadu-print-style), link[rel="stylesheet"]'
    );
    styleNodes.forEach((node) => {
      if (node.tagName.toLowerCase() === 'link') {
        const href = (node as HTMLLinkElement).href;
        if (href) {
          headStyles += `<link rel="stylesheet" href="${href}" />\n`;
        }
      } else {
        headStyles += `<style>${node.innerHTML}</style>\n`;
      }
    });
  }

  const pageMargin = singlePage ? '6mm' : '10mm';

  const singlePageStyles = singlePage
    ? `
    html, body {
      width: 210mm;
      min-height: 284mm;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
    }
    .opr-single-page-viewport {
      width: 198mm;
      min-height: 284mm;
      height: 284mm;
      max-height: 284mm;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden !important;
      box-sizing: border-box;
      page-break-after: avoid !important;
      page-break-inside: avoid !important;
      break-after: avoid !important;
      break-inside: avoid !important;
      position: relative;
      background: #ffffff;
    }
    .opr-single-page-content {
      width: 198mm;
      min-height: 284mm;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-sizing: border-box;
      transform-origin: top left;
    }
    .opr-single-page-content > * {
      width: 198mm !important;
      max-width: 198mm !important;
      min-height: 284mm !important;
      height: 100% !important;
      margin: 0 auto !important;
      box-shadow: none !important;
      border: none !important;
      border-radius: 0 !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: space-between !important;
      box-sizing: border-box !important;
    }
    `
    : '';

  const bodyMarkup = singlePage
    ? `<div id="opr-single-page-viewport" class="opr-single-page-viewport"><div id="opr-single-page-content" class="opr-single-page-content">${resolvedHtml}</div></div>`
    : resolvedHtml;

  const autoFitScript = singlePage
    ? `
      try {
        var viewport = document.getElementById('opr-single-page-viewport');
        var content = document.getElementById('opr-single-page-content');
        if (viewport && content) {
          var maxH = viewport.clientHeight || 1073;
          var actualH = content.scrollHeight;
          if (actualH > maxH + 4) {
            var scale = Math.max(0.75, (maxH - 2) / actualH);
            content.style.zoom = scale.toFixed(4);
            content.style.transform = 'scale(' + scale.toFixed(4) + ')';
            content.style.width = (100 / scale).toFixed(2) + '%';
          }
        }
      } catch (err) {}
    `
    : '';

  return `<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <base href="${origin}/" />
  ${headStyles}
  <style>
    @page {
      size: A4 ${orientation};
      margin: ${pageMargin};
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff !important;
      color: #000000 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .print-page-break {
      page-break-after: always;
      break-after: page;
    }
    .print-page-break:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    @media print {
      .print\\:hidden {
        display: none !important;
      }
    }
    ${singlePageStyles}
  </style>
</head>
<body>
  ${bodyMarkup}
  <script>
    window.addEventListener('load', function() {
      setTimeout(function() {
        ${autoFitScript}
        setTimeout(function() {
          try { window.focus(); window.print(); } catch (e) {}
        }, 120);
      }, 250);
    });
  </script>
</body>
</html>`;
}

function cleanupPrintPortal(): void {
  if (typeof document === 'undefined') return;
  const existingPortal = document.getElementById('isepadu-print-portal');
  if (existingPortal && existingPortal.parentNode) {
    existingPortal.parentNode.removeChild(existingPortal);
  }
  const existingStyle = document.getElementById('isepadu-print-style');
  if (existingStyle && existingStyle.parentNode) {
    existingStyle.parentNode.removeChild(existingStyle);
  }
}

export function triggerSmartPrint(options: SmartPrintOptions): SmartPrintResult {
  const {
    elementId,
    title = 'Dokumen_Rasmi_Sekolah',
    orientation = 'portrait',
    singlePage = false,
    onNotice,
  } = options;

  if (typeof document === 'undefined' || typeof window === 'undefined') {
    const errMsg = 'Persekitaran pelayar tidak tersedia.';
    onNotice?.(errMsg);
    return { mode: 'error', message: errMsg };
  }

  const target = document.getElementById(elementId);
  if (!target) {
    const errMsg = `Elemen cetakan (#${elementId}) tidak ditemui pada halaman.`;
    onNotice?.(errMsg);
    return { mode: 'error', message: errMsg };
  }

  try {
    cleanupPrintPortal();

    const pageMargin = singlePage ? '6mm' : '10mm';
    const portalWidth = orientation === 'portrait' ? '198mm' : '277mm';

    // 1. Inject main-document @media print style sheet
    const styleEl = document.createElement('style');
    styleEl.id = 'isepadu-print-style';
    styleEl.innerHTML = `
      @page {
        size: A4 ${orientation};
        margin: ${pageMargin};
      }
      @media screen {
        #isepadu-print-portal {
          position: fixed;
          left: -9999px;
          top: 0;
          width: ${portalWidth};
          min-height: ${singlePage ? '284mm' : 'auto'};
          background: #ffffff;
          color: #000000;
          z-index: -1;
          pointer-events: none;
        }
      }
      @media print {
        html, body {
          background: #ffffff !important;
          color: #000000 !important;
          margin: 0 !important;
          padding: 0 !important;
          ${
            singlePage
              ? 'width: 210mm !important; min-height: 284mm !important; overflow: hidden !important;'
              : ''
          }
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body > *:not(#isepadu-print-portal) {
          display: none !important;
        }
        #isepadu-print-portal {
          display: flex !important;
          flex-direction: column !important;
          justify-content: space-between !important;
          position: static !important;
          left: auto !important;
          top: auto !important;
          width: ${singlePage ? '198mm' : '100%'} !important;
          ${
            singlePage
              ? 'min-height: 284mm !important; height: 284mm !important; max-height: 284mm !important; overflow: hidden !important; page-break-after: avoid !important; page-break-inside: avoid !important; break-after: avoid !important; break-inside: avoid !important;'
              : ''
          }
          margin: 0 auto !important;
          background: #ffffff !important;
          color: #000000 !important;
          box-sizing: border-box !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        #isepadu-print-portal .print\\:hidden {
          display: none !important;
        }
      }
    `;
    document.head.appendChild(styleEl);

    // 2. Clone target into #isepadu-print-portal
    const portalEl = document.createElement('div');
    portalEl.id = 'isepadu-print-portal';
    const clone = target.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    clone.style.width = singlePage ? '198mm' : '100%';
    clone.style.maxWidth = singlePage ? '198mm' : '100%';
    if (singlePage) {
      clone.style.minHeight = '284mm';
      clone.style.height = '284mm';
      clone.style.border = 'none';
      clone.style.borderRadius = '0';
      clone.style.display = 'flex';
      clone.style.flexDirection = 'column';
      clone.style.justifyContent = 'space-between';
      clone.style.boxSizing = 'border-box';
    }
    clone.style.margin = '0 auto';
    clone.style.boxShadow = 'none';
    portalEl.appendChild(clone);
    document.body.appendChild(portalEl);

    // 3. 1-Page A4 Auto-Fit Measurement (singlePage === true)
    if (singlePage) {
      const scrollH = portalEl.scrollHeight || clone.scrollHeight;
      if (scrollH > 1076) {
        const scale = Math.max(0.75, 1072 / scrollH);
        (clone.style as any).zoom = scale.toFixed(4);
        clone.style.transformOrigin = 'top left';
      }
    }

    // 4. Detect Sandboxed window.print() Suppression & Trigger Immediate Fallback
    let printDialogConfirmed = false;
    let cleaned = false;

    const mql =
      typeof window.matchMedia === 'function' ? window.matchMedia('print') : null;

    const markPrintActive = () => {
      printDialogConfirmed = true;
    };

    const handleMqlChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        printDialogConfirmed = true;
      } else if (printDialogConfirmed) {
        finalizeCleanup();
      }
    };

    const finalizeCleanup = () => {
      if (cleaned) return;
      cleaned = true;
      window.removeEventListener('beforeprint', markPrintActive);
      window.removeEventListener('afterprint', finalizeCleanup);
      if (mql && typeof mql.removeEventListener === 'function') {
        mql.removeEventListener('change', handleMqlChange);
      }
      cleanupPrintPortal();
    };

    window.addEventListener('beforeprint', markPrintActive);
    window.addEventListener('afterprint', finalizeCleanup);
    if (mql) {
      if (mql.matches) printDialogConfirmed = true;
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', handleMqlChange);
      }
    }

    const prevTitle = document.title;
    if (title) {
      document.title = title;
    }

    const startTime = Date.now();
    window.focus();
    window.print();
    const elapsedSyncMs = Date.now() - startTime;

    if (title) {
      setTimeout(() => {
        document.title = prevTitle;
      }, 1200);
    }

    // If window.print() blocked synchronously for >250ms, the native print dialog opened
    if (elapsedSyncMs > 250) {
      printDialogConfirmed = true;
    }

    const isSandboxedFrame = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();

    setTimeout(() => {
      if (mql?.matches) {
        printDialogConfirmed = true;
      }
      if (isSandboxedFrame && !printDialogConfirmed) {
        finalizeCleanup();
        const dlRes = downloadStandalonePrintHtml(options);
        onNotice?.(dlRes.message);
      }
    }, 600);

    // Safety cleanup after 20s in case afterprint isn't emitted on mobile browsers
    setTimeout(() => {
      finalizeCleanup();
    }, 20000);

    return {
      mode: 'native',
      message: singlePage
        ? 'Dialog cetakan 1 Muka Surat (A4) dibuka.'
        : 'Dialog cetakan A4 dibuka.',
    };
  } catch (err) {
    cleanupPrintPortal();
    const dlRes = downloadStandalonePrintHtml(options);
    onNotice?.(dlRes.message);
    return dlRes;
  }
}

export function downloadStandalonePrintHtml(options: SmartPrintOptions): SmartPrintResult {
  const {
    elementId,
    title = 'Dokumen_Rasmi_Sekolah',
    orientation = 'portrait',
    singlePage = false,
  } = options;
  if (typeof document === 'undefined') {
    return { mode: 'error', message: 'Persekitaran pelayar tidak tersedia.' };
  }

  const target = document.getElementById(elementId);
  if (!target) {
    return {
      mode: 'error',
      message: `Elemen cetakan (#${elementId}) tidak ditemui pada halaman.`,
    };
  }

  try {
    const htmlDoc = buildPrintableHtmlDocument(target.outerHTML, title, orientation, singlePage);
    const blob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const safeName = title
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName || 'Dokumen_Cetakan'}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    return {
      mode: 'download',
      message: `Fail cetakan A4 "${safeName || 'Dokumen_Cetakan'}.html" telah dimuat turun secara automatik. Buka fail tersebut untuk Cetak / Simpan sebagai PDF (1 Muka Surat A4).`,
    };
  } catch (err: any) {
    return {
      mode: 'error',
      message: `Gagal menjana fail cetakan: ${err?.message || 'Ralat tidak diketahui'}`,
    };
  }
}
