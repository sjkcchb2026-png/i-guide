export interface SmartPrintOptions {
  elementId: string;
  title: string;
  orientation?: 'portrait' | 'landscape';
}

export interface SmartPrintResult {
  mode: 'native' | 'downloaded' | 'error';
  message: string;
}

function collectDocumentStyles(): string {
  const chunks: string[] = [];

  try {
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const rules = sheet.cssRules;
        if (rules && rules.length > 0) {
          const cssText = Array.from(rules)
            .map((r) => r.cssText)
            .join('\n');
          chunks.push(cssText);
          continue;
        }
      } catch {
        // Cross-origin stylesheet fallback below
      }
      if (sheet.href) {
        chunks.push(`@import url("${sheet.href}");`);
      }
    }
  } catch {
    // Ignore stylesheet inspection errors
  }

  return chunks.join('\n');
}

function buildStandaloneHtml(
  element: HTMLElement,
  title: string,
  orientation: 'portrait' | 'landscape'
): string {
  const styles = collectDocumentStyles();
  const safeTitle = title
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<!doctype html>
<html lang="ms">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <style>
    ${styles}
    @page {
      size: A4 ${orientation};
      margin: 8mm;
    }
    html, body {
      background: #ffffff !important;
      color: #0f172a !important;
      margin: 0;
      padding: 16px;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .print\\:hidden {
      display: none !important;
    }
    .print-toolbar {
      max-width: 794px;
      margin: 0 auto 14px auto;
      padding: 10px 14px;
      background: #0d3b42;
      color: #ffffff;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-size: 12px;
      border-bottom: 3px solid #d4af37;
    }
    .print-toolbar button {
      background: #f59e0b;
      color: #0f172a;
      border: none;
      border-radius: 8px;
      padding: 8px 14px;
      font-weight: 800;
      font-size: 12px;
      cursor: pointer;
    }
    @media print {
      html, body {
        padding: 0 !important;
        margin: 0 !important;
        background: #ffffff !important;
      }
      .print-toolbar {
        display: none !important;
      }
      .print-portrait-sheet {
        width: 100% !important;
        max-width: none !important;
        margin: 0 !important;
        box-shadow: none !important;
        border: none !important;
      }
      .print-portrait-page {
        page-break-after: always;
        break-after: page;
        box-shadow: none !important;
        border: none !important;
        margin: 0 !important;
        max-width: none !important;
        width: 100% !important;
      }
      .print-portrait-page:last-child {
        page-break-after: auto;
        break-after: auto;
      }
    }
  </style>
</head>
<body>
  <div class="print-toolbar">
    <span><strong>${safeTitle}</strong> — Paparan Cetak A4 Rasmi</span>
    <button type="button" onclick="window.print()">Cetak / Simpan PDF</button>
  </div>
  ${element.outerHTML}
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () {
        try { window.print(); } catch (e) {}
      }, 250);
    });
  </script>
</body>
</html>`;
}

export function downloadStandalonePrintHtml(options: SmartPrintOptions): SmartPrintResult {
  const { elementId, title, orientation = 'portrait' } = options;
  const el = document.getElementById(elementId);
  if (!el) {
    return {
      mode: 'error',
      message: 'Paparan poster OPR tidak ditemui untuk dicetak. Sila buka pratonton OPR terlebih dahulu.',
    };
  }

  const html = buildStandaloneHtml(el, title, orientation);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const safeFile =
    title
      .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'OPR_SKPM';

  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFile}_A4_Cetak.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);

  return {
    mode: 'downloaded',
    message:
      'Fail A4 siap-cetak (.html) telah dimuat turun. Buka fail tersebut di pelayar dan tekan Ctrl+P / Save as PDF.',
  };
}

export function triggerSmartPrint(options: SmartPrintOptions): SmartPrintResult {
  const { elementId, title, orientation = 'portrait' } = options;

  let beforePrintFired = false;
  const onBeforePrint = () => {
    beforePrintFired = true;
  };
  window.addEventListener('beforeprint', onBeforePrint);

  try {
    window.print();
  } catch {
    // Blocked by sandboxed iframe or browser policy
  } finally {
    window.removeEventListener('beforeprint', onBeforePrint);
  }

  if (beforePrintFired) {
    return {
      mode: 'native',
      message: 'Dialog cetakan pelayar dibuka.',
    };
  }

  // Fallback when running inside sandboxed preview iframe (where window.print() is silently ignored)
  const dlResult = downloadStandalonePrintHtml({ elementId, title, orientation });
  if (dlResult.mode === 'downloaded') {
    return {
      mode: 'downloaded',
      message:
        'Pratonton iframe menyekat dialog cetak terus, jadi fail OPR A4 siap-cetak (.html) telah dimuat turun secara automatik — buka fail tersebut untuk cetak / simpan PDF (atau buka aplikasi dalam tab penuh).',
    };
  }
  return dlResult;
}
