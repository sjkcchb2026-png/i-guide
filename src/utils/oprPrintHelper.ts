/**
 * Smart Print & Standalone HTML Export Helper for iSEPADU AI
 * Safe inside sandboxed iframes (avoids window.open / window.alert).
 * Prints the target element cleanly on A4 pages via a temporary print style + hidden iframe or native print,
 * and allows downloading a self-contained printable .html file.
 */

export interface SmartPrintOptions {
  elementId: string;
  title?: string;
  orientation?: 'portrait' | 'landscape';
}

export interface SmartPrintResult {
  mode: 'native' | 'iframe' | 'download' | 'error';
  message: string;
}

function buildPrintableHtmlDocument(
  innerHtml: string,
  title: string,
  orientation: 'portrait' | 'landscape' = 'portrait'
): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const resolvedHtml = origin
    ? innerHtml.replace(/src="\/assets\//g, `src="${origin}/assets/`)
    : innerHtml;

  // Collect existing stylesheet links and inline styles from the current document
  let headStyles = '';
  if (typeof document !== 'undefined') {
    const styleNodes = document.querySelectorAll('style, link[rel="stylesheet"]');
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
      margin: 10mm;
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
  </style>
</head>
<body>
  ${resolvedHtml}
  <script>
    window.addEventListener('load', function() {
      setTimeout(function() {
        try { window.focus(); window.print(); } catch (e) {}
      }, 350);
    });
  </script>
</body>
</html>`;
}

export function triggerSmartPrint(options: SmartPrintOptions): SmartPrintResult {
  const { elementId, title = 'Dokumen_Rasmi_Sekolah', orientation = 'portrait' } = options;
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
    // Print via hidden iframe so only the target A4 document is printed with exact styles
    const existingIframe = document.getElementById('isepadu-smart-print-iframe');
    if (existingIframe && existingIframe.parentNode) {
      existingIframe.parentNode.removeChild(existingIframe);
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'isepadu-smart-print-iframe';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    const htmlDoc = buildPrintableHtmlDocument(target.outerHTML, title, orientation);
    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(htmlDoc);
      doc.close();
      return {
        mode: 'native',
        message: 'Dialog cetakan dibuka.',
      };
    }

    window.print();
    return { mode: 'native', message: 'Dialog cetakan dibuka.' };
  } catch (err) {
    return downloadStandalonePrintHtml(options);
  }
}

export function downloadStandalonePrintHtml(options: SmartPrintOptions): SmartPrintResult {
  const { elementId, title = 'Dokumen_Rasmi_Sekolah', orientation = 'portrait' } = options;
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
    const htmlDoc = buildPrintableHtmlDocument(target.outerHTML, title, orientation);
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
      message: `Fail cetakan "${safeName || 'Dokumen_Cetakan'}.html" berjaya dimuat turun. Buka fail tersebut untuk cetak terus ke PDF/kertas A4.`,
    };
  } catch (err: any) {
    return {
      mode: 'error',
      message: `Gagal menjana fail cetakan: ${err?.message || 'Ralat tidak diketahui'}`,
    };
  }
}
