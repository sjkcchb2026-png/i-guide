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
  academicYear: string;
  docKind: 'OPR' | 'MEMO' | 'MINIT' | 'SURAT_LANTIKAN' | 'PERTANDINGAN_OPR' | 'PING_TEST' | string;
  skpmBucket?: string;
  skpmCodeBadge?: string;
  programTitle: string;
  tarikh: string;
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
  message?: string;
  error?: string;
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

export function buildFallbackDriveHtml(params: {
  schoolCode?: string;
  academicYear: string;
  docKind: string;
  skpmBucket?: string;
  skpmCodeBadge?: string;
  programTitle: string;
  tarikh: string;
  summaryLines?: string[];
}): string {
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
          ${params.skpmBucket ? ` | Folder SKPM: <strong>${params.skpmBucket}</strong>` : ''}
          ${params.skpmCodeBadge ? ` | Kod SKPM: <strong>${params.skpmCodeBadge}</strong>` : ''}
        </div>
      </div>
      ${
        linesHtml
          ? `<div style="font-size: 13px; line-height: 1.5;"><ul>${linesHtml}</ul></div>`
          : `<p style="font-size: 13px;">Dokumen rasmi sekolah telah disegerakkan ke Google Drive Rasmi Sekolah.</p>`
      }
    </div>
  `;
  return buildPrintableHtmlDocument(body, params.programTitle || 'Dokumen_Rasmi_Sekolah', 'portrait');
}

export async function syncDocumentToSchoolDrive(
  params: SyncSchoolDriveParams
): Promise<SyncSchoolDriveResult> {
  try {
    const creds = await resolveSchoolDriveCredentials(params.schoolCode);
    const webhookUrl = (params.webhookUrlOverride || creds.webhookUrl || DEFAULT_SCHOOL_DRIVE_WEBHOOK_URL).trim();
    const secretToken = (params.secretTokenOverride || creds.secretToken || DEFAULT_SCHOOL_DRIVE_SECRET_TOKEN).trim();

    let finalHtml = params.htmlContent || '';
    if (!finalHtml && params.elementId && typeof document !== 'undefined') {
      const el = document.getElementById(params.elementId);
      if (el) {
        finalHtml = buildPrintableHtmlDocument(
          el.outerHTML,
          params.programTitle || 'Dokumen_Rasmi_Sekolah',
          'portrait'
        );
      }
    }
    if (!finalHtml) {
      finalHtml = buildFallbackDriveHtml({
        schoolCode: params.schoolCode,
        academicYear: params.academicYear,
        docKind: params.docKind,
        skpmBucket: params.skpmBucket,
        skpmCodeBadge: params.skpmCodeBadge,
        programTitle: params.programTitle,
        tarikh: params.tarikh,
      });
    }

    const payload = {
      token: secretToken,
      schoolCode: params.schoolCode || 'YCC3404',
      academicYear: params.academicYear || '2026',
      docKind: params.docKind || 'OPR',
      skpmBucket: params.skpmBucket || 'STD_3_1_KURIKULUM',
      skpmCodeBadge: params.skpmCodeBadge || 'SKPM',
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
          folderPath: parsed.folderPath || '',
          message: parsed.message || 'Berjaya disegerakkan ke Google Drive Rasmi Sekolah.',
        };
      }
      return {
        success: false,
        error: parsed.error || parsed.message || 'Gagal menyegerakkan dokumen ke Google Drive Sekolah.',
      };
    }

    if (response.ok) {
      return {
        success: true,
        message: 'Permintaan dihantar ke Google Drive Rasmi Sekolah.',
      };
    }

    return {
      success: false,
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
    skpmBucket: 'STD_1_KEPIMPINAN',
    skpmCodeBadge: 'UJIAN-SAMBUNGAN',
    programTitle: 'UJIAN SAMBUNGAN GOOGLE DRIVE RASMI SEKOLAH (iSEPADU AI)',
    tarikh: new Date().toISOString().split('T')[0],
    webhookUrlOverride: options?.webhookUrl,
    secretTokenOverride: options?.secretToken,
    photos: [],
  });
}
