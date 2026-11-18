import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { scopedDocId } from './schoolTenant';
import { buildPrintableHtmlDocument } from './oprPrintHelper';

export const DEFAULT_SCHOOL_DRIVE_WEBHOOK_URL =
  'https://script.google.com/macros/s/AKfycbxS7_W-tZinbOYu7TxU6rhTT6UkYNsS0marUn6cxkMkQkuy3O6z0SuXi3k5W7-VWnoktw/exec';

export const DEFAULT_SCHOOL_DRIVE_SECRET_TOKEN = 'YCC3404_SKPM_2026_SECURE';

export const DEFAULT_SCHOOL_DRIVE_ACCOUNT_EMAIL = 'ycc3404@moe.edu.my';

export interface SyncSchoolDriveParams {
  schoolCode?: string;
  schoolName?: string;
  schoolLogoUrl?: string;
  academicYear: string;
  docKind: 'OPR' | 'MEMO' | 'MINIT' | 'SURAT_LANTIKAN' | 'PERTANDINGAN_OPR' | 'PING_TEST' | string;
  targetFolderName?: string;
  skpmBucket?: string;
  skpmCodeBadge?: string;
  skpmStandard?: string;
  skpmAspek?: string;
  skpmStandardKualiti?: string;
  pillar?: string;
  kodMySG?: string;
  jawatankuasaInduk?: string;
  programTitle: string;
  tarikh: string;
  masa?: string;
  tempat?: string;
  sasaran?: string;
  peringkat?: string;
  pencapaian?: string;
  objektif?: string[];
  pengisianAktiviti?: string[];
  impak?: string[];
  refleksiDanTindakanSusulan?: string[];
  preparedByName?: string;
  preparedByTitle?: string;
  htmlContent?: string;
  elementId?: string;
  photos?: string[];
  webhookUrlOverride?: string;
  secretTokenOverride?: string;
}

export interface SyncSchoolDriveResult {
  success: boolean;
  folderUrl?: string;
  fileUrl?: string;
  folderPath?: string;
  targetFolderName?: string;
  message?: string;
  error?: string;
}

const escapeHtml = (str?: string | null): string =>
  String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Deterministic SKAS / SKPM Kualiti@Sekolah Google Drive Folder Classifier.
 * Evaluates docKind first, then skpmBucket / skpmCodeBadge / skpmStandard / pillar in strict priority order.
 */
export function resolveTargetDriveFolderName(params: {
  docKind?: string;
  skpmBucket?: string;
  skpmCodeBadge?: string;
  skpmStandard?: string;
  pillar?: string;
}): string {
  const kind = String(params.docKind || '')
    .trim()
    .toUpperCase();

  if (kind === 'MEMO' || kind === 'MINIT' || kind === 'SURAT_LANTIKAN') {
    return 'Memo, Minit Mesyuarat & Surat Lantikan MySG';
  }

  const combined = [
    params.skpmBucket || '',
    params.skpmCodeBadge || '',
    params.skpmStandard || '',
    params.pillar || '',
  ]
    .join(' | ')
    .toUpperCase();

  // 1. Matches 3.2 or KOKURIKULUM -> 'Standard 3.2 - Pengurusan Kokurikulum'
  if (
    /\b3\.2(\.\d+)*\b/.test(combined) ||
    /STD[\s_]*3[\s_.]*2/.test(combined) ||
    combined.includes('KOKURIKULUM')
  ) {
    return 'Standard 3.2 - Pengurusan Kokurikulum';
  }

  // 2. Matches 3.3 or HEM -> 'Standard 3.3 - Pengurusan Hal Ehwal Murid'
  if (
    /\b3\.3(\.\d+)*\b/.test(combined) ||
    /STD[\s_]*3[\s_.]*3/.test(combined) ||
    /\bHEM\b/.test(combined) ||
    combined.includes('HAL EHWAL MURID')
  ) {
    return 'Standard 3.3 - Pengurusan Hal Ehwal Murid';
  }

  // 3. Matches 3.1 or KURIKULUM -> 'Standard 3.1 - Pengurusan Kurikulum'
  if (
    /\b3\.1(\.\d+)*\b/.test(combined) ||
    /STD[\s_]*3[\s_.]*1/.test(combined) ||
    combined.includes('KURIKULUM')
  ) {
    return 'Standard 3.1 - Pengurusan Kurikulum';
  }

  // 4. Matches Std 1 / 1.1 / 1.2 / 1.3 -> 'Standard 1 - Kepemimpinan'
  if (
    /\bSTD[\s_]*1\b/.test(combined) ||
    /\bSTANDARD[\s_]*1\b/.test(combined) ||
    /\b1\.[123](\.\d+)*\b/.test(combined) ||
    combined.includes('KEPIMPINAN') ||
    combined.includes('KEPEMIMPINAN')
  ) {
    return 'Standard 1 - Kepemimpinan';
  }

  // 5. Matches Std 2 / 2.1–2.7 -> 'Standard 2 - Pengurusan Organisasi'
  if (
    /\bSTD[\s_]*2\b/.test(combined) ||
    /\bSTANDARD[\s_]*2\b/.test(combined) ||
    /\b2\.[1-7](\.\d+)*\b/.test(combined) ||
    combined.includes('ORGANISASI')
  ) {
    return 'Standard 2 - Pengurusan Organisasi';
  }

  // 6. Matches Std 4 / Std 5 -> 'Standard 4 & 5 - PdPc & Pencapaian Sekolah'
  if (
    /\bSTD[\s_]*[45]\b/.test(combined) ||
    /\bSTANDARD[\s_]*[45]\b/.test(combined) ||
    /\b[45]\.[1-9](\.\d+)*\b/.test(combined) ||
    combined.includes('PDPC') ||
    combined.includes('PENCAPAIAN') ||
    combined.includes('KEMENJADIAN')
  ) {
    return 'Standard 4 & 5 - PdPc & Pencapaian Sekolah';
  }

  return 'Standard 3.1 - Pengurusan Kurikulum';
}

export function resolveCanonicalSkpmBucket(targetFolderName: string, explicitBucket?: string): string {
  const trimmed = String(explicitBucket || '').trim();
  if (trimmed) return trimmed;

  switch (targetFolderName) {
    case 'Memo, Minit Mesyuarat & Surat Lantikan MySG':
      return 'Memo, Minit & Lantikan';
    case 'Standard 3.2 - Pengurusan Kokurikulum':
      return 'Std 3.2';
    case 'Standard 3.3 - Pengurusan Hal Ehwal Murid':
      return 'Std 3.3';
    case 'Standard 3.1 - Pengurusan Kurikulum':
      return 'Std 3.1';
    case 'Standard 1 - Kepemimpinan':
      return 'Std 1';
    case 'Standard 2 - Pengurusan Organisasi':
      return 'Std 2';
    case 'Standard 4 & 5 - PdPc & Pencapaian Sekolah':
      return 'Std 4 & 5';
    default:
      return 'Std 3.1';
  }
}

export async function resolveSchoolDriveCredentials(schoolCode?: string): Promise<{
  webhookUrl: string;
  secretToken: string;
  accountEmail: string;
}> {
  const code = (schoolCode || 'YCC3404').trim().toUpperCase();
  try {
    const configDocId = scopedDocId(code, 'default');
    const snap = await getDoc(doc(db, 'school_config', configDocId));
    if (snap.exists()) {
      const data = snap.data() as any;
      return {
        webhookUrl:
          String(data?.schoolDriveWebhookUrl || '').trim() || DEFAULT_SCHOOL_DRIVE_WEBHOOK_URL,
        secretToken:
          String(data?.schoolDriveSecretToken || '').trim() || DEFAULT_SCHOOL_DRIVE_SECRET_TOKEN,
        accountEmail:
          String(data?.schoolDriveAccountEmail || '').trim() || DEFAULT_SCHOOL_DRIVE_ACCOUNT_EMAIL,
      };
    }
  } catch (err) {
    console.warn('Fallback to default School Drive credentials:', err);
  }
  return {
    webhookUrl: DEFAULT_SCHOOL_DRIVE_WEBHOOK_URL,
    secretToken: DEFAULT_SCHOOL_DRIVE_SECRET_TOKEN,
    accountEmail: DEFAULT_SCHOOL_DRIVE_ACCOUNT_EMAIL,
  };
}

/**
 * Self-contained 1-Page A4 Portrait HTML generator for OPR reports sent to Google Drive Apps Script.
 * Uses pure inline CSS (no external Tailwind dependency) and strict 196mm x 282mm bounds so
 * Google Apps Script `getAs(MimeType.PDF)` always produces a crisp 1-Page PDF.
 */
export function buildSinglePageOprDriveHtml(params: SyncSchoolDriveParams & {
  targetFolderName?: string;
}): string {
  const schoolCode = (params.schoolCode || 'YCC3404').toUpperCase();
  const schoolName = (
    params.schoolName ||
    (schoolCode === 'YCC3404' ? 'SJK (C) CHUNG HUA BALINGIAN' : `SEKOLAH ${schoolCode}`)
  ).toUpperCase();
  const academicYear = params.academicYear || '2026';
  const skpmBadge = params.skpmCodeBadge || 'SKPM Kualiti@Sekolah';
  const skpmStandard =
    params.skpmStandard ||
    params.targetFolderName ||
    'STANDARD 3.1: PENGURUSAN KURIKULUM';
  const skpmAspek =
    params.skpmAspek ||
    (params.jawatankuasaInduk
      ? `EVIDENS PELAKSANAAN: ${params.jawatankuasaInduk.toUpperCase()}`
      : 'ASPEK PENGURUSAN & PELAKSANAAN PROGRAM SEKOLAH');
  const skpmKualiti =
    params.skpmStandardKualiti ||
    'Program dan aktiviti diurus secara sistematik, profesional dan terancang.';

  const objektifList =
    params.objektif && params.objektif.length > 0
      ? params.objektif.slice(0, 4)
      : ['Memperkasakan kualiti pengurusan dan kemenjadian murid mengikut piawaian KPM.'];
  const pengisianList =
    params.pengisianAktiviti && params.pengisianAktiviti.length > 0
      ? params.pengisianAktiviti.slice(0, 5)
      : [`Pelaksanaan "${params.programTitle}" berjalan lancar mengikut ketetapan jawatankuasa.`];
  const impakList =
    params.impak && params.impak.length > 0
      ? params.impak.slice(0, 4)
      : ['Meningkatkan penglibatan aktif dan pencapaian sasaran SKPM Kualiti@Sekolah.'];
  const refleksiList =
    params.refleksiDanTindakanSusulan && params.refleksiDanTindakanSusulan.length > 0
      ? params.refleksiDanTindakanSusulan.slice(0, 4)
      : ['Program mencapai objektif yang ditetapkan dan diteruskan secara berkala.'];

  const photos = Array.isArray(params.photos) ? params.photos.slice(0, 3) : [];
  const photoCirclesHtml = [0, 1, 2]
    .map((idx) => {
      const src = photos[idx];
      const marginTop = idx > 0 ? '-10px' : '0';
      if (src && typeof src === 'string' && src.trim().length > 0) {
        return `
          <div style="width:130px;height:130px;border-radius:50%;border:3px solid #0D3B42;box-shadow:0 0 0 2px #D4AF37;overflow:hidden;background:#f1f5f9;margin:${marginTop} auto 0 auto;">
            <img src="${src}" alt="Foto ${idx + 1}" style="width:100%;height:100%;object-fit:cover;display:block;" />
          </div>
        `;
      }
      return `
        <div style="width:130px;height:130px;border-radius:50%;border:3px solid #0D3B42;box-shadow:0 0 0 2px #D4AF37;overflow:hidden;background:#f8fafc;margin:${marginTop} auto 0 auto;display:table;">
          <div style="display:table-cell;vertical-align:middle;text-align:center;color:#94a3b8;font-size:10px;font-weight:bold;">
            Foto ${idx + 1}
          </div>
        </div>
      `;
    })
    .join('');

  const renderBullets = (items: string[]) =>
    items
      .filter(Boolean)
      .map(
        (line) =>
          `<li style="margin-bottom:2px;line-height:1.32;">${escapeHtml(line)}</li>`
      )
      .join('');

  const preparedByName = (params.preparedByName || 'SETIAUSAHA / PENYELARAS').toUpperCase();
  const preparedByTitle =
    params.preparedByTitle || params.jawatankuasaInduk || 'Penyelaras Program';

  return `<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(params.programTitle)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 6mm;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #0f172a;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  </style>
</head>
<body>
  <div style="width:196mm;height:282mm;max-height:282mm;margin:0 auto;overflow:hidden;box-sizing:border-box;border:1.5px solid #cbd5e1;border-radius:12px;background:#ffffff;page-break-after:avoid;page-break-inside:avoid;">
    <!-- 1. TOP DARK-TEAL SKPM BANNER -->
    <div style="background:#0D3B42;color:#ffffff;padding:10px 16px;border-bottom:4px solid #D4AF37;">
      <table style="width:100%;border-collapse:collapse;border-bottom:1px solid #115e59;padding-bottom:4px;margin-bottom:4px;">
        <tr>
          <td style="font-size:10px;font-weight:900;letter-spacing:1px;color:#FDE047;text-transform:uppercase;padding-bottom:4px;">
            SKPM KUALITI@SEKOLAH ${escapeHtml(academicYear)}
          </td>
          <td style="text-align:right;font-size:9.5px;font-weight:bold;color:#ccfbf1;text-transform:uppercase;padding-bottom:4px;">
            ${params.kodMySG ? `<span>${escapeHtml(params.kodMySG)} &bull; </span>` : ''}
            <span style="background:#134e4a;color:#FDE047;border:1px solid #D4AF37;padding:2px 6px;border-radius:4px;">
              ${escapeHtml(skpmBadge)}
            </span>
          </td>
        </tr>
      </table>
      <div style="font-size:10.5px;font-weight:900;text-transform:uppercase;color:#ffffff;line-height:1.25;">
        ${escapeHtml(skpmStandard)}
      </div>
      <div style="font-size:9.5px;font-weight:bold;text-transform:uppercase;color:#ccfbf1;line-height:1.25;margin-top:1px;">
        ${escapeHtml(skpmAspek)}
      </div>
      <div style="font-size:9.5px;font-style:italic;color:#FDE047;line-height:1.25;margin-top:2px;">
        Standard Kualiti: &ldquo;${escapeHtml(skpmKualiti)}&rdquo;
      </div>
    </div>

    <!-- 2. CENTERED SCHOOL CREST + ONE PAGE REPORT + TITLE -->
    <div style="padding:10px 16px 8px 16px;border-bottom:1.5px solid #e2e8f0;background:#f8fafc;text-align:center;">
      ${
        params.schoolLogoUrl
          ? `<img src="${params.schoolLogoUrl}" alt="Logo" style="width:46px;height:46px;object-fit:contain;margin:0 auto 3px auto;display:block;" />`
          : ''
      }
      <div style="font-size:11.5px;font-weight:900;text-transform:uppercase;color:#0D3B42;letter-spacing:0.4px;">
        ${escapeHtml(schoolName)} (${escapeHtml(schoolCode)})
      </div>
      <div style="font-size:22px;font-weight:900;color:#0D3B42;letter-spacing:-0.3px;line-height:1.05;margin-top:2px;">
        ONE PAGE REPORT
      </div>
      <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;color:#B48A18;margin-top:2px;">
        EVIDENS PENGURUSAN BERKUALITI &bull; ${escapeHtml(
          (params.jawatankuasaInduk || params.targetFolderName || 'SKPM KUALITI@SEKOLAH').toUpperCase()
        )}
      </div>
      <div style="margin-top:6px;padding:5px 12px;border-radius:8px;background:#f0fdfa;border:1px solid #99f6e4;">
        <div style="font-size:12px;font-weight:900;text-transform:uppercase;color:#0D3B42;">
          ${escapeHtml(params.programTitle)}
        </div>
      </div>
    </div>

    <!-- 3. TWO-COLUMN BODY: 3 CIRCULAR PHOTOS ON LEFT + 4 RUBRIC SECTIONS ON RIGHT -->
    <table style="width:100%;border-collapse:collapse;padding:10px 14px;">
      <tr>
        <td style="width:34%;vertical-align:top;text-align:center;padding:10px 8px 10px 12px;">
          ${photoCirclesHtml}
        </td>
        <td style="width:66%;vertical-align:top;padding:10px 14px 10px 8px;font-size:10px;color:#1e293b;">
          <div style="margin-bottom:7px;">
            <div style="font-size:10.5px;font-weight:900;text-transform:uppercase;color:#0D3B42;border-bottom:1.5px solid #D4AF37;padding-bottom:1px;margin-bottom:3px;">
              1. Objektif:
            </div>
            <ul style="margin:0;padding-left:15px;">
              ${renderBullets(objektifList)}
            </ul>
          </div>

          <div style="margin-bottom:7px;">
            <div style="font-size:10.5px;font-weight:900;text-transform:uppercase;color:#0D3B42;border-bottom:1.5px solid #D4AF37;padding-bottom:1px;margin-bottom:3px;">
              2. Pengisian Aktiviti:
            </div>
            <ul style="margin:0;padding-left:15px;">
              ${renderBullets(pengisianList)}
            </ul>
          </div>

          <div style="margin-bottom:7px;">
            <div style="font-size:10.5px;font-weight:900;text-transform:uppercase;color:#0D3B42;border-bottom:1.5px solid #D4AF37;padding-bottom:1px;margin-bottom:3px;">
              3. Impak &amp; Kemenjadian:
            </div>
            <ul style="margin:0;padding-left:15px;">
              ${renderBullets(impakList)}
            </ul>
          </div>

          <div style="margin-bottom:8px;">
            <div style="font-size:10.5px;font-weight:900;text-transform:uppercase;color:#0D3B42;border-bottom:1.5px solid #D4AF37;padding-bottom:1px;margin-bottom:3px;">
              4. Refleksi &amp; Tindakan Susulan:
            </div>
            <ul style="margin:0;padding-left:15px;">
              ${renderBullets(refleksiList)}
            </ul>
          </div>

          <!-- Metadata Box -->
          <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:6px 10px;font-size:9.5px;margin-bottom:8px;">
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="width:50%;padding:1.5px 4px 1.5px 0;">
                  <strong>Tarikh:</strong> ${escapeHtml(params.tarikh)}
                </td>
                <td style="width:50%;padding:1.5px 0 1.5px 4px;">
                  <strong>Masa:</strong> ${escapeHtml(params.masa || '08:00 pagi – 12:00 tengah hari')}
                </td>
              </tr>
              <tr>
                <td style="width:50%;padding:1.5px 4px 1.5px 0;">
                  <strong>Tempat:</strong> ${escapeHtml(params.tempat || schoolName)}
                </td>
                <td style="width:50%;padding:1.5px 0 1.5px 4px;">
                  <strong>Sasaran:</strong> ${escapeHtml(params.sasaran || params.peringkat || 'Semua Warga Sekolah')}
                </td>
              </tr>
              ${
                params.pencapaian
                  ? `<tr><td colspan="2" style="padding-top:2px;"><strong>Pencapaian:</strong> ${escapeHtml(params.pencapaian)}</td></tr>`
                  : ''
              }
            </table>
          </div>

          <!-- Disediakan Oleh Pill -->
          <div style="text-align:right;">
            <span style="display:inline-block;padding:4px 12px;border-radius:999px;background:#0D3B42;color:#ffffff;font-size:9.5px;font-weight:bold;border:1px solid #D4AF37;">
              Disediakan oleh: <strong style="color:#FDE047;">${escapeHtml(preparedByName)}</strong> (${escapeHtml(preparedByTitle)})
            </span>
          </div>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
}

export function buildFallbackDriveHtml(params: {
  schoolCode?: string;
  academicYear: string;
  docKind: string;
  targetFolderName?: string;
  skpmBucket?: string;
  skpmCodeBadge?: string;
  skpmStandard?: string;
  pillar?: string;
  programTitle: string;
  tarikh: string;
  summaryLines?: string[];
}): string {
  const folderName =
    params.targetFolderName ||
    resolveTargetDriveFolderName({
      docKind: params.docKind,
      skpmBucket: params.skpmBucket,
      skpmCodeBadge: params.skpmCodeBadge,
      skpmStandard: params.skpmStandard,
      pillar: params.pillar,
    });

  if (String(params.docKind || '').toUpperCase() === 'OPR') {
    return buildSinglePageOprDriveHtml({
      ...params,
      targetFolderName: folderName,
      pengisianAktiviti: params.summaryLines,
    });
  }

  const linesHtml = (params.summaryLines || [])
    .filter(Boolean)
    .map((line) => `<li style="margin-bottom:4px;">${line}</li>`)
    .join('');

  const body = `
    <div style="font-family: Arial, sans-serif; padding: 24px; max-width: 210mm; margin: 0 auto; color: #0f172a;">
      <div style="border-bottom: 3px solid #0f766e; padding-bottom: 12px; margin-bottom: 16px;">
        <div style="font-size: 11px; font-weight: bold; color: #0f766e; text-transform: uppercase;">
          ARKIB DOKUMEN RASMI SKPM KUALITI@SEKOLAH • ${params.schoolCode || 'YCC3404'} • SESI ${params.academicYear}
        </div>
        <h1 style="font-size: 18px; margin: 6px 0 4px 0; text-transform: uppercase;">${params.programTitle}</h1>
        <div style="font-size: 12px; color: #334155;">
          Jenis Dokumen: <strong>${params.docKind}</strong> | Tarikh: <strong>${params.tarikh}</strong>
          | Folder Drive: <strong>${folderName}</strong>
          ${params.skpmBucket ? ` | SKPM Bucket: <strong>${params.skpmBucket}</strong>` : ''}
          ${params.skpmCodeBadge ? ` | Kod SKPM: <strong>${params.skpmCodeBadge}</strong>` : ''}
        </div>
      </div>
      ${
        linesHtml
          ? `<div style="font-size: 13px; line-height: 1.5;"><ul>${linesHtml}</ul></div>`
          : `<p style="font-size: 13px;">Dokumen rasmi sekolah telah disegerakkan ke Google Drive Rasmi Sekolah (${folderName}).</p>`
      }
    </div>
  `;
  return buildPrintableHtmlDocument(body, params.programTitle || 'Dokumen_Rasmi_Sekolah', 'portrait', false);
}

export async function syncDocumentToSchoolDrive(
  params: SyncSchoolDriveParams
): Promise<SyncSchoolDriveResult> {
  try {
    const creds = await resolveSchoolDriveCredentials(params.schoolCode);
    const webhookUrl = (params.webhookUrlOverride || creds.webhookUrl || DEFAULT_SCHOOL_DRIVE_WEBHOOK_URL).trim();
    const secretToken = (params.secretTokenOverride || creds.secretToken || DEFAULT_SCHOOL_DRIVE_SECRET_TOKEN).trim();

    const targetFolderName =
      params.targetFolderName?.trim() ||
      resolveTargetDriveFolderName({
        docKind: params.docKind,
        skpmBucket: params.skpmBucket,
        skpmCodeBadge: params.skpmCodeBadge,
        skpmStandard: params.skpmStandard,
        pillar: params.pillar,
      });

    const resolvedSkpmBucket = resolveCanonicalSkpmBucket(targetFolderName, params.skpmBucket);
    const isOpr = String(params.docKind || '').toUpperCase() === 'OPR';

    let finalHtml = '';
    if (isOpr) {
      // Always build a self-contained inline-CSS 1-Page A4 HTML for OPR PDF conversion in Google Drive
      finalHtml = buildSinglePageOprDriveHtml({
        ...params,
        targetFolderName,
        skpmBucket: resolvedSkpmBucket,
      });
    } else {
      finalHtml = params.htmlContent || '';
      if (!finalHtml && params.elementId && typeof document !== 'undefined') {
        const el = document.getElementById(params.elementId);
        if (el) {
          finalHtml = buildPrintableHtmlDocument(
            el.outerHTML,
            params.programTitle || 'Dokumen_Rasmi_Sekolah',
            'portrait',
            false
          );
        }
      }
      if (!finalHtml) {
        finalHtml = buildFallbackDriveHtml({
          schoolCode: params.schoolCode,
          academicYear: params.academicYear,
          docKind: params.docKind,
          targetFolderName,
          skpmBucket: resolvedSkpmBucket,
          skpmCodeBadge: params.skpmCodeBadge,
          skpmStandard: params.skpmStandard,
          pillar: params.pillar,
          programTitle: params.programTitle,
          tarikh: params.tarikh,
        });
      }
    }

    const payload = {
      token: secretToken,
      schoolCode: params.schoolCode || 'YCC3404',
      academicYear: params.academicYear || '2026',
      docKind: params.docKind || 'OPR',
      targetFolderName,
      skpmBucket: resolvedSkpmBucket,
      skpmCodeBadge: params.skpmCodeBadge || 'SKPM',
      skpmStandard: params.skpmStandard || targetFolderName,
      pillar: params.pillar || '',
      programTitle: params.programTitle || 'DOKUMEN RASMI SEKOLAH',
      tarikh: params.tarikh || new Date().toISOString().split('T')[0],
      htmlContent: finalHtml,
      photos: Array.isArray(params.photos)
        ? params.photos.filter((p) => typeof p === 'string' && p.trim().length > 0)
        : [],
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
    });

    const rawText = await response.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }

    if (parsed && typeof parsed === 'object') {
      if (parsed.success || parsed.folderUrl || parsed.fileUrl) {
        return {
          success: true,
          folderUrl: parsed.folderUrl || parsed.url || '',
          fileUrl: parsed.fileUrl || parsed.pdfUrl || parsed.docUrl || parsed.folderUrl || '',
          folderPath: parsed.folderPath || targetFolderName,
          targetFolderName,
          message: parsed.message || `Berjaya disegerakkan ke Google Drive Rasmi Sekolah (${targetFolderName}).`,
        };
      }
      return {
        success: false,
        targetFolderName,
        error: parsed.error || parsed.message || 'Gagal menyegerakkan dokumen ke Google Drive Sekolah.',
      };
    }

    if (response.ok) {
      return {
        success: true,
        folderPath: targetFolderName,
        targetFolderName,
        message: `Permintaan dihantar ke Google Drive Rasmi Sekolah (${targetFolderName}).`,
      };
    }

    return {
      success: false,
      targetFolderName,
      error: `Ralat sambungan Drive (${response.status})`,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Gagal menghubungi Webhook Google Drive Sekolah.',
    };
  }
}

export async function testSchoolDriveConnection(options?: {
  schoolCode?: string;
  academicYear?: string;
  webhookUrl?: string;
  secretToken?: string;
}): Promise<SyncSchoolDriveResult> {
  return syncDocumentToSchoolDrive({
    schoolCode: options?.schoolCode || 'YCC3404',
    academicYear: options?.academicYear || '2026',
    docKind: 'OPR',
    skpmBucket: 'Std 1',
    skpmCodeBadge: '1.1.1 — UJIAN SAMBUNGAN',
    skpmStandard: 'STANDARD 1: KEPEMIMPINAN',
    pillar: 'PENTADBIRAN',
    programTitle: 'UJIAN SAMBUNGAN GOOGLE DRIVE RASMI SEKOLAH (iSEPADU AI)',
    tarikh: new Date().toISOString().split('T')[0],
    webhookUrlOverride: options?.webhookUrl,
    secretTokenOverride: options?.secretToken,
    photos: [],
  });
}
