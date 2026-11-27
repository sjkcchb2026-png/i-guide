import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Check,
  Plus,
  Save,
  Printer,
  Sparkles,
  Users,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  CloudUpload,
  CheckSquare,
  Square,
  Wand2,
  Layers,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { db } from '../../lib/firebase';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  onSnapshot,
} from 'firebase/firestore';
import { Student, UserProfile, SchoolSettings } from '../../types';
import {
  KokoGroup,
  KokoMembership,
  KokoMeetingReport,
  KokoAttendanceSession,
  KPM_12_MEETING_TEMPLATES,
  CIRI_KBAT_KOKO_OPTIONS,
  NILAI_TERAS_SIVIK_OPTIONS,
  SUB_NILAI_SIVIK_OPTIONS,
  PIKEBM_ACTIVITY_OPTIONS,
} from '../../types/kokurikulum';
import { useSchoolTenant } from '../../contexts/SchoolTenantContext';
import { belongsToSchool, scopedDocId } from '../../utils/schoolTenant';
import { resolveSkasSelection } from '../../data/skasStandards';
import { deepSanitizeFirestore } from '../../utils/sanitizeFirestore';
import { buildPrintableHtmlDocument } from '../../utils/oprPrintHelper';
import { syncDocumentToSchoolDrive } from '../../utils/schoolDriveArchive';

const DEFAULT_SCHOOL_TEACHERS = [
  'BONG CHEN',
  'LAU HIONG ING',
  'CHUA SIEW HONG',
  'WONG SIEW LING',
  'TING SIEW MEI',
  'NGU SIEW HUA',
  'TANG YII LING',
  'LEE MING WEI',
  'LIM JIA YI',
  'TAN WEI LUN',
];

function openPrintableHtmlWindow(fullDocHtml: string, docTitle: string = 'Laporan_Perjumpaan_Kokurikulum') {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const frameDoc = iframe.contentWindow?.document;
    if (frameDoc) {
      frameDoc.open();
      frameDoc.write(fullDocHtml);
      frameDoc.close();
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          // Fallback to download standalone HTML if sandbox blocks print
          const blob = new Blob([fullDocHtml], { type: 'text/html;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${docTitle.replace(/[^a-zA-Z0-9_-]+/g, '_')}.html`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        }
        setTimeout(() => {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        }, 15000);
      }, 450);
    }
  } catch {
    const blob = new Blob([fullDocHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${docTitle.replace(/[^a-zA-Z0-9_-]+/g, '_')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

interface Props {
  profile: UserProfile;
  role: 'pentadbir' | 'guru' | 'laporan';
  schoolSettings?: SchoolSettings | null;
  prefill?: {
    groupId: string;
    groupName: string;
    category: 'uniform' | 'club' | 'sport';
    date: string;
    meetingNumber: number;
    present: number;
    absent: number;
    total: number;
    percentage: number;
  } | null;
  onClearPrefill?: () => void;
}

const DEFAULT_UNITS_BY_CATEGORY: Record<'uniform' | 'club' | 'sport', string[]> = {
  uniform: [
    'TKRS',
    'Pengakap Kanak-Kanak',
    'Bulan Sabit Merah Malaysia (BSMM)',
  ],
  club: [
    'Kelab PAJS',
    'Kelab PALS (Pecinta Alam)',
    'Kelab STEM & Robotik',
    'Kelab Bahasa & Budaya',
    'Kelab SPBT & Perpustakaan',
    'Kelab Seni Kreatif',
  ],
  sport: [
    'Bola Tampar',
    'Bola Keranjang',
    'Badminton',
    'Olahraga & Merentas Desa',
    'Catur & Permainan Tradisional',
    'Wushu',
  ],
};

const CATEGORY_FORM_LABELS: Record<'uniform' | 'club' | 'sport', string> = {
  uniform: 'Pasukan Badan Beruniform',
  club: 'Kelab dan Persatuan',
  sport: 'Sukan dan Permainan',
};

const CATEGORY_SKAS_SUB_CODE: Record<'uniform' | 'club' | 'sport', '3.2.3.1' | '3.2.2.1' | '3.2.4.1'> = {
  uniform: '3.2.3.1',
  club: '3.2.2.1',
  sport: '3.2.4.1',
};

const MALAY_DAYS = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];

function formatDateToMalayTarikhHari(isoDate: string): {
  formattedDate: string;
  hariLabel: string;
  tarikhHariDisplay: string;
} {
  if (!isoDate) {
    return { formattedDate: '', hariLabel: 'Rabu', tarikhHariDisplay: '' };
  }
  const parts = isoDate.split('-');
  if (parts.length !== 3) {
    return { formattedDate: isoDate, hariLabel: 'Rabu', tarikhHariDisplay: isoDate };
  }
  const [y, m, d] = parts.map(Number);
  const dt = new Date(y, m - 1, d);
  const hariLabel = MALAY_DAYS[dt.getDay()] || 'Rabu';
  const formattedDate = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  return {
    formattedDate,
    hariLabel,
    tarikhHariDisplay: `${formattedDate} (${hariLabel})`,
  };
}

const escapeHtml = (str?: string | null): string =>
  String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Builds the 1:1 physical school form HTML for a single Laporan Aktiviti Perjumpaan sheet
 */
function buildSingleMeetingOfficialFormHtml(
  report: KokoMeetingReport,
  withPageBreak = false
): string {
  const cat = report.category || 'club';
  const { tarikhHariDisplay } = formatDateToMalayTarikhHari(report.date);
  const effectiveTarikhHari = report.tarikhHariDisplay || tarikhHariDisplay || report.date;
  const effectiveMasa = report.masaDisplay || '3.00 p.m. - 5.00 p.m.';
  const effectiveButiran =
    report.butiranAktiviti ||
    report.ringkasanAktiviti ||
    report.tajukAktiviti ||
    '-';

  const presentCount = report.attendanceStats?.present ?? 0;
  const totalCount = report.attendanceStats?.total ?? 0;
  const kehadiranMuridStr = `${presentCount}/${totalCount}`;

  const guruList =
    Array.isArray(report.guruPenasihatHadir) && report.guruPenasihatHadir.length > 0
      ? report.guruPenasihatHadir
      : [report.disediakanOleh || 'Guru Penasihat'];

  const guruNumberedHtml = guruList
    .map(
      (g, i) =>
        `<div style="margin-bottom:2px;"><strong>${i + 1}.</strong> ${escapeHtml(g)}</div>`
    )
    .join('');

  const subtitleHtml = (['uniform', 'club', 'sport'] as const)
    .map((c) => {
      const label = CATEGORY_FORM_LABELS[c];
      if (c === cat) {
        return `<span style="font-weight:900;text-decoration:underline;">${escapeHtml(label)}</span>`;
      }
      return `<span style="color:#64748b;text-decoration:line-through;">${escapeHtml(label)}</span>`;
    })
    .join(' / ');

  const nilaiTeras = report.amalanSivik?.nilaiTeras || 'Kasih Sayang';
  const subNilai = report.amalanSivik?.subNilai || 'Kelestarian Alam';
  const aktivitiSivik =
    report.amalanSivik?.aktiviti ||
    'Menjaga kebersihan kawasan aktiviti dan memupuk kerjasama sepasukan.';

  const setiausahaMurid = report.setiausahaMurid || '___________________________';
  const guruPenyemakAtas =
    report.guruPenasihatPenyemak ||
    report.disediakanOleh ||
    guruList[0] ||
    '___________________________';

  const disediakanGuru =
    report.disediakanOleh || guruList[0] || '___________________________';
  const disemakPkKk = report.disemakOlehPkKk || 'LING CHING HUI';
  const disahkanGb = report.disahkanOlehGb || report.disahkanOleh || 'TEO YANG MING';

  return `
    <div style="font-family:'Times New Roman',Times,serif;color:#000;background:#fff;padding:8mm 10mm;max-width:210mm;margin:0 auto;box-sizing:border-box;${
      withPageBreak ? 'page-break-after:always;' : ''
    }">
      <!-- Top Title & Subtitle -->
      <div style="text-align:center;margin-bottom:10px;">
        <div style="font-size:18px;font-weight:bold;letter-spacing:0.3px;">
          Laporan Aktiviti Perjumpaan
        </div>
        <div style="font-size:13.5px;margin-top:3px;">
          ${subtitleHtml}
        </div>
      </div>

      <!-- Upper Section Table (Maklumat Perjumpaan) -->
      <table style="width:100%;border-collapse:collapse;border:1.5px solid #000;font-size:12.5px;">
        <tbody>
          <tr>
            <td style="border:1px solid #000;padding:6px 8px;width:36%;font-weight:bold;vertical-align:top;">
              Nama ${escapeHtml(CATEGORY_FORM_LABELS[cat])}
            </td>
            <td style="border:1px solid #000;padding:6px 8px;width:64%;font-weight:bold;">
              ${escapeHtml(report.groupName)}
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #000;padding:6px 8px;font-weight:bold;">
              Bilangan Perjumpaan
            </td>
            <td style="border:1px solid #000;padding:6px 8px;font-weight:bold;">
              ${escapeHtml(String(report.meetingNumber))}
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #000;padding:6px 8px;font-weight:bold;">
              Tarikh / Hari
            </td>
            <td style="border:1px solid #000;padding:6px 8px;">
              ${escapeHtml(effectiveTarikhHari)}
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #000;padding:6px 8px;font-weight:bold;">
              Masa
            </td>
            <td style="border:1px solid #000;padding:6px 8px;">
              ${escapeHtml(effectiveMasa)}
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #000;padding:6px 8px;font-weight:bold;">
              Tempat
            </td>
            <td style="border:1px solid #000;padding:6px 8px;">
              ${escapeHtml(report.venue)}
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #000;padding:6px 8px;font-weight:bold;">
              Kehadiran Murid
            </td>
            <td style="border:1px solid #000;padding:6px 8px;font-weight:bold;">
              ${escapeHtml(kehadiranMuridStr)}
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #000;padding:6px 8px;font-weight:bold;vertical-align:top;">
              Kehadiran Guru
            </td>
            <td style="border:1px solid #000;padding:6px 8px;">
              ${guruNumberedHtml}
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #000;padding:6px 8px;font-weight:bold;vertical-align:top;">
              Butiran Aktiviti
            </td>
            <td style="border:1px solid #000;padding:6px 8px;white-space:pre-line;line-height:1.45;min-height:65px;">
              ${escapeHtml(effectiveButiran)}
            </td>
          </tr>
          <!-- Upper Dual Sign-Off Row: Setiausaha (Murid) & Guru Penasihat -->
          <tr>
            <td colspan="2" style="border:1px solid #000;padding:0;">
              <table style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="width:50%;border-right:1px solid #000;padding:8px 10px;vertical-align:top;">
                    <div style="font-weight:bold;margin-bottom:24px;">Disediakan Oleh:</div>
                    <div style="border-bottom:1px dotted #000;width:85%;margin-bottom:4px;"></div>
                    <div style="font-weight:bold;font-size:12px;">(${escapeHtml(setiausahaMurid)})</div>
                    <div style="font-size:11.5px;">Setiausaha (Murid)</div>
                  </td>
                  <td style="width:50%;padding:8px 10px;vertical-align:top;">
                    <div style="font-weight:bold;margin-bottom:24px;">Disemak Oleh:</div>
                    <div style="border-bottom:1px dotted #000;width:85%;margin-bottom:4px;"></div>
                    <div style="font-weight:bold;font-size:12px;">(${escapeHtml(guruPenyemakAtas)})</div>
                    <div style="font-size:11.5px;">Guru Penasihat</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Divider Section Header: Laporan Pemantauan Guru Penasihat -->
      <div style="background:#f1f5f9;border-left:1.5px solid #000;border-right:1.5px solid #000;border-bottom:1.5px solid #000;padding:6px 8px;text-align:center;font-weight:bold;font-size:13.5px;">
        Laporan Pemantauan Guru Penasihat
      </div>

      <!-- Lower Section Table -->
      <table style="width:100%;border-collapse:collapse;border-left:1.5px solid #000;border-right:1.5px solid #000;border-bottom:1.5px solid #000;font-size:12.5px;">
        <tbody>
          <tr>
            <td style="border:1px solid #000;padding:6px 8px;width:36%;font-weight:bold;vertical-align:top;">
              Ciri KBAT Dalam Kokurikulum
            </td>
            <td style="border:1px solid #000;padding:6px 8px;width:64%;">
              ${escapeHtml(report.ciriKbat || 'Aplikasi pengetahuan, kemahiran dan nilai')}
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #000;padding:6px 8px;font-weight:bold;vertical-align:middle;">
              Amalan Sivik Dalam Kokurikulum
            </td>
            <td style="border:1px solid #000;padding:0;">
              <table style="width:100%;border-collapse:collapse;font-size:12px;">
                <tr>
                  <td style="border-bottom:1px solid #000;border-right:1px solid #000;padding:5px 8px;width:28%;font-weight:bold;">
                    Nilai teras
                  </td>
                  <td style="border-bottom:1px solid #000;padding:5px 8px;">
                    ${escapeHtml(nilaiTeras)}
                  </td>
                </tr>
                <tr>
                  <td style="border-bottom:1px solid #000;border-right:1px solid #000;padding:5px 8px;font-weight:bold;">
                    Sub nilai
                  </td>
                  <td style="border-bottom:1px solid #000;padding:5px 8px;">
                    ${escapeHtml(subNilai)}
                  </td>
                </tr>
                <tr>
                  <td style="border-right:1px solid #000;padding:5px 8px;font-weight:bold;">
                    Aktiviti
                  </td>
                  <td style="padding:5px 8px;">
                    ${escapeHtml(aktivitiSivik)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #000;padding:6px 8px;font-weight:bold;vertical-align:top;">
              Sisipan Aktiviti PIKeBM
            </td>
            <td style="border:1px solid #000;padding:6px 8px;">
              ${escapeHtml(report.sisipanPikebm || 'Tiada')}
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #000;padding:6px 8px;font-weight:bold;vertical-align:top;">
              Refleksi<br/>
              <span style="font-size:11px;font-weight:normal;">(Kekuatan, Kelemahan, Penambahbaikan)</span>
            </td>
            <td style="border:1px solid #000;padding:6px 8px;white-space:pre-line;line-height:1.45;">
              ${escapeHtml(report.refleksiImpak || '-')}
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Bottom 3-Row Official Sign-Off Table: Guru Penasihat -> PK KK -> GB / Pengetua -->
      <table style="width:100%;border-collapse:collapse;border-left:1.5px solid #000;border-right:1.5px solid #000;border-bottom:1.5px solid #000;font-size:12px;margin-top:0;">
        <tbody>
          <tr>
            <td style="border:1px solid #000;padding:8px 8px;width:24%;font-weight:bold;vertical-align:middle;">
              Disediakan Oleh<br/>
              <span style="font-size:11px;font-weight:normal;">(Guru Penasihat)</span>
            </td>
            <td style="border:1px solid #000;padding:8px 10px;width:50%;vertical-align:bottom;">
              <div style="height:22px;"></div>
              <div style="border-bottom:1px dotted #000;width:85%;margin-bottom:3px;"></div>
              <div style="font-weight:bold;">(${escapeHtml(disediakanGuru)})</div>
            </td>
            <td style="border:1px solid #000;padding:8px 8px;width:26%;vertical-align:bottom;">
              <div>Tarikh: ${escapeHtml(effectiveTarikhHari.split(' ')[0] || report.date)}</div>
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #000;padding:8px 8px;font-weight:bold;vertical-align:middle;">
              Disemak Oleh<br/>
              <span style="font-size:11px;font-weight:normal;">(PK KK)</span>
            </td>
            <td style="border:1px solid #000;padding:8px 10px;vertical-align:bottom;">
              <div style="height:22px;"></div>
              <div style="border-bottom:1px dotted #000;width:85%;margin-bottom:3px;"></div>
              <div style="font-weight:bold;">(${escapeHtml(disemakPkKk)})</div>
            </td>
            <td style="border:1px solid #000;padding:8px 8px;vertical-align:bottom;">
              <div>Tarikh:</div>
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #000;padding:8px 8px;font-weight:bold;vertical-align:middle;">
              Disahkan Oleh<br/>
              <span style="font-size:11px;font-weight:normal;">(GB / Pengetua)</span>
            </td>
            <td style="border:1px solid #000;padding:8px 10px;vertical-align:bottom;">
              <div style="height:22px;"></div>
              <div style="border-bottom:1px dotted #000;width:85%;margin-bottom:3px;"></div>
              <div style="font-weight:bold;">(${escapeHtml(disahkanGb)})</div>
            </td>
            <td style="border:1px solid #000;padding:8px 8px;vertical-align:bottom;">
              <div>Tarikh:</div>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Tiny SKAS Evidence Footer -->
      <div style="margin-top:6px;display:flex;justify-content:space-between;font-size:9.5px;color:#475569;font-family:Arial,sans-serif;">
        <span>SKPM Kualiti@Sekolah (SKAS): Std 3.2 → ${escapeHtml(report.subStandardCode || CATEGORY_SKAS_SUB_CODE[cat])} (${escapeHtml(CATEGORY_FORM_LABELS[cat])})</span>
        <span>Kehadiran PAJSK: ${escapeHtml(kehadiranMuridStr)} (${report.attendanceStats?.percentage ?? 0}%)</span>
      </div>
    </div>
  `;
}

export default function KokoMeetingReportManager({
  profile,
  role,
  schoolSettings,
  prefill,
  onClearPrefill,
}: Props) {
  const { schoolCode: activeSchoolCode, schoolName: tenantSchoolName } = useSchoolTenant();
  const [selectedCategory, setSelectedCategory] = useState<'uniform' | 'club' | 'sport'>('club');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [customUnitName, setCustomUnitName] = useState<string>('');
  const [showAddUnitInput, setShowAddUnitInput] = useState(false);
  const [selectedMeetingNumber, setSelectedMeetingNumber] = useState<number>(1);

  const [groups, setGroups] = useState<KokoGroup[]>([]);
  const [memberships, setMemberships] = useState<KokoMembership[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [committees, setCommittees] = useState<Record<string, any>>({});
  const [teachers, setTeachers] = useState<string[]>([]);
  const [reports, setReports] = useState<KokoMeetingReport[]>([]);
  const [attendanceSessions, setAttendanceSessions] = useState<KokoAttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{
    ok: boolean;
    message: string;
    fileUrl?: string;
    folderUrl?: string;
  } | null>(null);

  // Upper Section Form States (Maklumat Perjumpaan)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [masaDisplay, setMasaDisplay] = useState('3.00 p.m. - 5.00 p.m.');
  const [venue, setVenue] = useState('Kelas Tahun 4 / Dewan Sekolah');
  const [tajukAktiviti, setTajukAktiviti] = useState('');
  const [butiranAktiviti, setButiranAktiviti] = useState('');
  const [presentStudentIds, setPresentStudentIds] = useState<string[]>([]);
  const [showAllSchoolStudentsFallback, setShowAllSchoolStudentsFallback] = useState(false);
  const [guruHadir, setGuruHadir] = useState<string[]>([]);
  const [customTeacherInput, setCustomTeacherInput] = useState('');
  const [setiausahaMurid, setSetiausahaMurid] = useState('');
  const [guruPenasihatPenyemak, setGuruPenasihatPenyemak] = useState(profile.name || '');

  // Lower Section Form States (Laporan Pemantauan Guru Penasihat)
  const [ciriKbat, setCiriKbat] = useState(CIRI_KBAT_KOKO_OPTIONS[0]);
  const [nilaiTeras, setNilaiTeras] = useState(NILAI_TERAS_SIVIK_OPTIONS[0]);
  const [subNilai, setSubNilai] = useState(SUB_NILAI_SIVIK_OPTIONS['Kasih Sayang'][0]);
  const [aktivitiSivik, setAktivitiSivik] = useState(
    'Menjaga kebersihan kawasan aktiviti dan memelihara kelestarian alam sekitar.'
  );
  const [sisipanPikebm, setSisipanPikebm] = useState('Bisik-bisik');
  const [refleksiImpak, setRefleksiImpak] = useState('');

  // Bottom 3-Tier Sign-Off States
  const [disediakanOleh, setDisediakanOleh] = useState(profile.name || '');
  const [disemakOlehPkKk, setDisemakOlehPkKk] = useState('LING CHING HUI');
  const [disahkanOlehGb, setDisahkanOlehGb] = useState('TEO YANG MING');

  const canEdit = role === 'pentadbir' || role === 'guru';

  // Load Firestore data
  useEffect(() => {
    setLoading(true);
    const unsubs: (() => void)[] = [];

    unsubs.push(
      onSnapshot(collection(db, 'koko_groups'), (snap) => {
        setGroups(
          snap.docs
            .filter((d) => belongsToSchool(d.data(), activeSchoolCode))
            .map((d) => ({ id: d.id, ...d.data() } as KokoGroup))
        );
      })
    );

    unsubs.push(
      onSnapshot(collection(db, 'koko_memberships'), (snap) => {
        setMemberships(
          snap.docs
            .filter((d) => belongsToSchool(d.data(), activeSchoolCode))
            .map((d) => ({ id: d.id, ...d.data() } as KokoMembership))
        );
      })
    );

    unsubs.push(
      onSnapshot(collection(db, 'students'), (snap) => {
        setStudents(
          snap.docs
            .filter((d) => belongsToSchool(d.data(), activeSchoolCode))
            .map((d) => ({ id: d.id, ...d.data() } as Student))
        );
      })
    );

    unsubs.push(
      onSnapshot(collection(db, 'koko_committees'), (snap) => {
        const map: Record<string, any> = {};
        snap.docs
          .filter((d) => belongsToSchool(d.data(), activeSchoolCode))
          .forEach((d) => {
            map[d.id] = d.data();
          });
        setCommittees(map);
      })
    );

    unsubs.push(
      onSnapshot(collection(db, 'koko_meeting_reports'), (snap) => {
        setReports(
          snap.docs
            .filter((d) => belongsToSchool(d.data(), activeSchoolCode))
            .map((d) => ({ id: d.id, ...d.data() } as KokoMeetingReport))
        );
      })
    );

    unsubs.push(
      onSnapshot(collection(db, 'koko_attendance'), (snap) => {
        setAttendanceSessions(
          snap.docs
            .filter((d) => belongsToSchool(d.data(), activeSchoolCode))
            .map((d) => ({ id: d.id, ...d.data() } as KokoAttendanceSession))
        );
        setLoading(false);
      })
    );

    async function loadTeachersAndLeaders() {
      try {
        const snap = await getDocs(collection(db, 'personnel'));
        const scopedPersonnel = snap.docs
          .filter((d) => belongsToSchool(d.data(), activeSchoolCode))
          .map((d) => d.data() as Record<string, any>);

        if (scopedPersonnel.length > 0) {
          const names = scopedPersonnel
            .filter((p) => p.category !== 'AKP')
            .map((p) => String(p.name || p.nama || '').toUpperCase().trim())
            .filter(Boolean);
          setTeachers(Array.from(new Set(names)));

          const pkKk = scopedPersonnel.find(
            (p) =>
              /PKKK|KOKURIKULUM|PK KK/i.test(String(p.position || '')) ||
              /PKKK|KOKURIKULUM/i.test(String(p.leadershipRole || ''))
          );
          if (pkKk?.name) setDisemakOlehPkKk(String(pkKk.name).toUpperCase());

          const gb = scopedPersonnel.find(
            (p) =>
              /GURU BESAR|^GB$|PENGETUA/i.test(String(p.position || '')) ||
              /PRINCIPAL|GURU BESAR/i.test(String(p.leadershipRole || ''))
          );
          if (gb?.name) setDisahkanOlehGb(String(gb.name).toUpperCase());
        } else {
          setTeachers(DEFAULT_SCHOOL_TEACHERS);
        }
      } catch {
        setTeachers(DEFAULT_SCHOOL_TEACHERS);
      }
    }
    loadTeachersAndLeaders();

    return () => unsubs.forEach((u) => u());
  }, [activeSchoolCode]);

  // Combine Firestore groups with default units so Kelab PAJS, Kelab PALS, TKRS, etc. are always available
  const categoryGroups = useMemo(() => {
    const dbGroups = groups.filter((g) => g.category === selectedCategory);
    const seenNames = new Set(dbGroups.map((g) => g.name.toLowerCase().trim()));
    const combined: KokoGroup[] = [...dbGroups];

    DEFAULT_UNITS_BY_CATEGORY[selectedCategory].forEach((defaultName) => {
      if (!seenNames.has(defaultName.toLowerCase().trim())) {
        seenNames.add(defaultName.toLowerCase().trim());
        combined.push({
          id: defaultName,
          name: defaultName,
          category: selectedCategory,
        });
      }
    });
    return combined;
  }, [groups, selectedCategory]);

  useEffect(() => {
    if (categoryGroups.length > 0) {
      const exists = categoryGroups.some(
        (g) => g.id === selectedGroupId || g.name === selectedGroupId
      );
      if (!exists) {
        setSelectedGroupId(categoryGroups[0].id || categoryGroups[0].name);
      }
    }
  }, [categoryGroups, selectedGroupId]);

  const currentGroup = useMemo(() => {
    return (
      categoryGroups.find((g) => g.id === selectedGroupId || g.name === selectedGroupId) ||
      categoryGroups[0]
    );
  }, [categoryGroups, selectedGroupId]);

  // Automatic SKAS Standard 3.2 mapping based on unit category:
  // Badan Beruniform -> Std 3.2 / 3.2.3.1
  // Kelab & Persatuan -> Std 3.2 / 3.2.2.1
  // Sukan & Permainan -> Std 3.2 / 3.2.4.1
  const activeSkasMapping = useMemo(() => {
    const cat = currentGroup?.category || selectedCategory;
    const subCode = CATEGORY_SKAS_SUB_CODE[cat];
    return resolveSkasSelection('Std 3.2', subCode, 'KOKURIKULUM');
  }, [currentGroup?.category, selectedCategory]);

  // Committee data for current unit (to auto-prefill Guru Penasihat & Setiausaha Murid)
  const currentCommittee = useMemo(() => {
    if (!currentGroup) return null;
    const idKey = currentGroup.id || currentGroup.name;
    const scopedId = scopedDocId(activeSchoolCode, idKey);
    const scopedName = scopedDocId(activeSchoolCode, currentGroup.name);
    return (
      committees[scopedId] ||
      committees[idKey] ||
      committees[scopedName] ||
      committees[currentGroup.name] ||
      null
    );
  }, [committees, currentGroup, activeSchoolCode]);

  // Students enrolled in the selected unit (exclude Prasekolah students automatically)
  const unitStudents = useMemo(() => {
    if (!currentGroup) return [];
    const unitNameNorm = currentGroup.name.toLowerCase().trim();

    const matchedMembers = memberships.filter((m) => {
      if (currentGroup.category === 'uniform') {
        const u = (m.uniform || m.groupName || '').toLowerCase().trim();
        return u === unitNameNorm || (unitNameNorm.includes('pajs') && u.includes('pals'));
      }
      if (currentGroup.category === 'club') {
        const c = (m.club || m.groupName || '').toLowerCase().trim();
        return (
          c === unitNameNorm ||
          (unitNameNorm.includes('pajs') && (c.includes('pajs') || c.includes('pals'))) ||
          (unitNameNorm.includes('pals') && (c.includes('pals') || c.includes('pajs')))
        );
      }
      if (currentGroup.category === 'sport') {
        const s = (m.sport || m.groupName || '').toLowerCase().trim();
        return s === unitNameNorm;
      }
      return false;
    });

    const elementaryStudents = students.filter((s) => {
      const cls = String(s.class || (s as any).class_id || '').toUpperCase();
      return !cls.includes('PRA');
    });

    if (matchedMembers.length > 0 && !showAllSchoolStudentsFallback) {
      return matchedMembers
        .map((m) => {
          const stDetail = elementaryStudents.find(
            (s) => s.id === m.student_id || s.student_id === m.student_id
          );
          return {
            student_id: m.student_id,
            name: (m.name || stDetail?.name || 'Murid').toUpperCase(),
            class: m.class || stDetail?.class || (stDetail as any)?.class_id || '-',
            position: m.position || '',
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    // Fallback: Year 4 - Year 6 students (or all elementary students if none in T4-T6)
    const upperPrimary = elementaryStudents.filter((s) => {
      const yr = Number(s.year || 0);
      const cls = String(s.class || (s as any).class_id || '');
      return yr >= 4 || /[456]/.test(cls);
    });
    const sourceList = upperPrimary.length > 0 ? upperPrimary : elementaryStudents;

    return sourceList
      .map((s) => ({
        student_id: s.student_id || s.id || s.name,
        name: (s.name || 'Murid').toUpperCase(),
        class: s.class || (s as any).class_id || '-',
        position: '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [currentGroup, memberships, students, showAllSchoolStudentsFallback]);

  // All recorded reports for the current unit
  const unitReports = useMemo(() => {
    if (!currentGroup) return [];
    const targetId = currentGroup.id || currentGroup.name;
    return reports
      .filter(
        (r) =>
          r.groupId === targetId ||
          r.groupName?.toLowerCase().trim() === currentGroup.name.toLowerCase().trim()
      )
      .sort((a, b) => Number(a.meetingNumber) - Number(b.meetingNumber));
  }, [reports, currentGroup]);

  // Auto-calculate next meeting number when unit changes (if not prefilled)
  useEffect(() => {
    if (!currentGroup || prefill) return;
    if (unitReports.length === 0) {
      setSelectedMeetingNumber(1);
    } else {
      const recordedNums = new Set(unitReports.map((r) => Number(r.meetingNumber)));
      let nextNum = 1;
      for (let i = 1; i <= 12; i++) {
        if (!recordedNums.has(i)) {
          nextNum = i;
          break;
        }
      }
      setSelectedMeetingNumber(nextNum);
    }
  }, [currentGroup?.name]);

  // Handle incoming prefill from Attendance module shortcut
  useEffect(() => {
    if (prefill) {
      setSelectedCategory(prefill.category);
      setSelectedGroupId(prefill.groupId);
      setSelectedMeetingNumber(prefill.meetingNumber);
      setDate(prefill.date);
      if (onClearPrefill) onClearPrefill();
    }
  }, [prefill, onClearPrefill]);

  // Populate form when unit or meetingNumber changes
  useEffect(() => {
    if (!currentGroup) return;
    const targetGroupId = currentGroup.id || currentGroup.name;
    const existing = unitReports.find(
      (r) => Number(r.meetingNumber) === Number(selectedMeetingNumber)
    );
    const template = KPM_12_MEETING_TEMPLATES.find(
      (t) => t.meetingNumber === Number(selectedMeetingNumber)
    );

    // Check matching attendance session in koko_attendance
    const matchingSession = attendanceSessions.find(
      (s) =>
        (s.groupId === targetGroupId ||
          s.groupId?.toLowerCase().trim() === currentGroup.name.toLowerCase().trim()) &&
        Number(s.meetingNumber) === Number(selectedMeetingNumber)
    );

    if (existing) {
      setDate(existing.date || new Date().toISOString().split('T')[0]);
      setMasaDisplay(existing.masaDisplay || '3.00 p.m. - 5.00 p.m.');
      setVenue(existing.venue || 'Kelas Tahun 4 / Dewan Sekolah');
      setTajukAktiviti(existing.tajukAktiviti || existing.meetingTitle || '');
      setButiranAktiviti(
        existing.butiranAktiviti ||
          existing.ringkasanAktiviti ||
          template?.defaultSummary ||
          ''
      );
      setGuruHadir(
        Array.isArray(existing.guruPenasihatHadir) && existing.guruPenasihatHadir.length > 0
          ? existing.guruPenasihatHadir
          : [profile.name.toUpperCase()]
      );
      setSetiausahaMurid(
        existing.setiausahaMurid || currentCommittee?.setiausaha?.name || ''
      );
      setGuruPenasihatPenyemak(
        existing.guruPenasihatPenyemak ||
          existing.disediakanOleh ||
          profile.name.toUpperCase()
      );
      setCiriKbat(existing.ciriKbat || CIRI_KBAT_KOKO_OPTIONS[0]);
      setNilaiTeras(existing.amalanSivik?.nilaiTeras || NILAI_TERAS_SIVIK_OPTIONS[0]);
      setSubNilai(existing.amalanSivik?.subNilai || 'Kelestarian Alam');
      setAktivitiSivik(
        existing.amalanSivik?.aktiviti ||
          'Menjaga kebersihan kawasan aktiviti dan memelihara kelestarian alam sekitar.'
      );
      setSisipanPikebm(existing.sisipanPikebm || 'Bisik-bisik');
      setRefleksiImpak(existing.refleksiImpak || template?.defaultReflection || '');
      setDisediakanOleh(existing.disediakanOleh || profile.name.toUpperCase());
      if (existing.disemakOlehPkKk) setDisemakOlehPkKk(existing.disemakOlehPkKk);
      if (existing.disahkanOlehGb || existing.disahkanOleh) {
        setDisahkanOlehGb(existing.disahkanOlehGb || existing.disahkanOleh || 'TEO YANG MING');
      }

      if (Array.isArray(existing.presentStudentIds) && existing.presentStudentIds.length > 0) {
        setPresentStudentIds(existing.presentStudentIds);
      } else if (matchingSession?.attendance) {
        const presentIds = Object.entries(matchingSession.attendance)
          .filter(([, status]) => status === '1')
          .map(([id]) => id);
        setPresentStudentIds(presentIds);
      } else {
        setPresentStudentIds(unitStudents.map((s) => s.student_id));
      }
    } else {
      // Default values for a new meeting report
      const defaultTitle = template
        ? `Perjumpaan ${template.meetingNumber}: ${template.title}`
        : `Perjumpaan ${selectedMeetingNumber}`;
      const defaultButiran = template
        ? `1. ${template.title}\n2. ${template.defaultSummary}`
        : '1. Mengambil kehadiran murid dan guru penasihat.\n2. Penerangan objektif dan pelaksanaan aktiviti mingguan.\n3. Rumusan dan kebersihan tempat aktiviti.';

      setMasaDisplay('3.00 p.m. - 5.00 p.m.');
      setVenue(
        selectedCategory === 'sport'
          ? 'Padang Sekolah / Gelanggang'
          : 'Kelas Tahun 4 / Dewan Sekolah'
      );
      setTajukAktiviti(defaultTitle);
      setButiranAktiviti(defaultButiran);

      // Default advisors from committee or current teacher
      const committeeAdvisors: string[] = [];
      if (currentCommittee?.ketuaGuruPenasihat) {
        committeeAdvisors.push(String(currentCommittee.ketuaGuruPenasihat).toUpperCase());
      }
      if (Array.isArray(currentCommittee?.guruPenasihat)) {
        currentCommittee.guruPenasihat.forEach((g: any) => {
          const gName = typeof g === 'string' ? g : g?.name;
          if (gName) committeeAdvisors.push(String(gName).toUpperCase());
        });
      }
      const initialAdvisors =
        committeeAdvisors.length > 0
          ? Array.from(new Set(committeeAdvisors))
          : [profile.name.toUpperCase()];
      setGuruHadir(initialAdvisors);
      setGuruPenasihatPenyemak(initialAdvisors[0] || profile.name.toUpperCase());
      setDisediakanOleh(initialAdvisors[0] || profile.name.toUpperCase());

      // Auto-detect student secretary from committee or unit members
      const suName =
        currentCommittee?.setiausaha?.name ||
        unitStudents.find((s) => /SETIAUSAHA/i.test(String(s.position || '')))?.name ||
        unitStudents[0]?.name ||
        '';
      setSetiausahaMurid(suName);

      setCiriKbat(CIRI_KBAT_KOKO_OPTIONS[0]);
      setNilaiTeras('Kasih Sayang');
      setSubNilai('Kelestarian Alam');
      setAktivitiSivik(
        'Menjaga kebersihan kawasan aktiviti dan memelihara kelestarian alam sekitar.'
      );
      setSisipanPikebm('Bisik-bisik');

      if (matchingSession?.attendance) {
        setDate(matchingSession.date || new Date().toISOString().split('T')[0]);
        const presentIds = Object.entries(matchingSession.attendance)
          .filter(([, status]) => status === '1')
          .map(([id]) => id);
        setPresentStudentIds(presentIds);
      } else {
        // Default Semua Hadir
        setPresentStudentIds(unitStudents.map((s) => s.student_id));
      }

      const totalSt = unitStudents.length;
      const presSt = matchingSession?.attendance
        ? Object.values(matchingSession.attendance).filter((v) => v === '1').length
        : totalSt;
      setRefleksiImpak(
        `Kekuatan: Kehadiran murid mencapai ${presSt}/${totalSt} orang dan semua ahli memberikan kerjasama yang aktif sepanjang aktiviti ${currentGroup.name}.\nKelemahan: Sebilangan kecil murid masih memerlukan bimbingan tambahan dalam penguasaan kemahiran amali.\nPenambahbaikan: Guru penasihat akan memperbanyakkan latihan berkumpulan dan bimbingan rakan sebaya pada perjumpaan akan datang.`
      );
    }
  }, [
    currentGroup?.name,
    selectedMeetingNumber,
    unitReports.length,
    unitStudents.length,
    currentCommittee,
  ]);

  // Live Attendance Statistics
  const attendanceStats = useMemo(() => {
    const total = unitStudents.length;
    if (total === 0) {
      return { present: 0, absent: 0, total: 0, percentage: 100 };
    }
    const validPresentCount = unitStudents.filter((s) =>
      presentStudentIds.includes(s.student_id)
    ).length;
    const absent = Math.max(0, total - validPresentCount);
    const percentage = Math.round((validPresentCount / total) * 100);
    return {
      present: validPresentCount,
      absent,
      total,
      percentage,
    };
  }, [unitStudents, presentStudentIds]);

  const handleMarkAllStudentsPresent = () => {
    setPresentStudentIds(unitStudents.map((s) => s.student_id));
  };

  const handleToggleStudentPresence = (studentId: string) => {
    setPresentStudentIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  };

  // Auto-generate structured Malay reflection draft (Kekuatan, Kelemahan, Penambahbaikan)
  const handleGenerateReflectionDraft = () => {
    const { present, total, percentage } = attendanceStats;
    const unitName = currentGroup?.name || 'unit kokurikulum';
    const cleanButiran = (butiranAktiviti || tajukAktiviti || 'aktiviti mingguan')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 140);

    const kekuatanText =
      percentage === 100
        ? `Kekuatan: Kehadiran murid adalah penuh ${present}/${total} (100%). Semua ahli menunjukkan minat, disiplin dan kerjasama yang sangat baik semasa melaksanakan aktiviti (${cleanButiran}).`
        : `Kekuatan: Seramai ${present}/${total} (${percentage}%) orang murid hadir dan melibatkan diri secara aktif serta bersemangat dalam aktiviti ${unitName} (${cleanButiran}).`;

    const kelemahanText =
      percentage < 100
        ? `Kelemahan: Seramai ${total - present} orang murid tidak dapat hadir dan sebilangan murid memerlukan masa tambahan untuk menguasai kemahiran yang ditetapkan.`
        : `Kelemahan: Pengurusan masa antara sesi penerangan teori dan latihan amali kumpulan boleh diperkemaskan lagi.`;

    const penambahbaikanText = `Penambahbaikan: Guru penasihat dan AJK murid akan menyediakan bimbingan berfokus serta aktiviti amali yang lebih interaktif pada perjumpaan seterusnya.`;

    setRefleksiImpak(`${kekuatanText}\n${kelemahanText}\n${penambahbaikanText}`);
  };

  const handleToggleTeacher = (tName: string) => {
    const clean = tName.trim().toUpperCase();
    if (!clean) return;
    setGuruHadir((prev) =>
      prev.includes(clean) ? prev.filter((t) => t !== clean) : [...prev, clean]
    );
  };

  const handleAddCustomTeacher = () => {
    const clean = customTeacherInput.trim().toUpperCase();
    if (!clean) return;
    if (!guruHadir.includes(clean)) {
      setGuruHadir((prev) => [...prev, clean]);
    }
    if (!teachers.includes(clean)) {
      setTeachers((prev) => [...prev, clean]);
    }
    setCustomTeacherInput('');
  };

  const handleAddCustomUnit = async () => {
    const clean = customUnitName.trim();
    if (!clean) return;
    const groupDocId = scopedDocId(
      activeSchoolCode,
      `${selectedCategory}_${clean.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`
    );
    try {
      await setDoc(
        doc(db, 'koko_groups', groupDocId),
        {
          id: groupDocId,
          schoolCode: activeSchoolCode,
          name: clean,
          category: selectedCategory,
        },
        { merge: true }
      );
      setSelectedGroupId(groupDocId);
      setCustomUnitName('');
      setShowAddUnitInput(false);
    } catch (err) {
      console.error('Failed to add custom unit:', err);
    }
  };

  // Build current KokoMeetingReport object for live preview, print & saving
  const currentDraftReport = useMemo<KokoMeetingReport>(() => {
    const targetGroupId = currentGroup?.id || currentGroup?.name || 'unit';
    const targetGroupName = currentGroup?.name || 'Unit Kokurikulum';
    const cat = currentGroup?.category || selectedCategory;
    const { hariLabel, tarikhHariDisplay } = formatDateToMalayTarikhHari(date);
    const absentIds = unitStudents
      .map((s) => s.student_id)
      .filter((id) => !presentStudentIds.includes(id));

    return {
      schoolCode: activeSchoolCode,
      meetingNumber: selectedMeetingNumber,
      meetingTitle: tajukAktiviti || `Perjumpaan ${selectedMeetingNumber}`,
      category: cat,
      categoryLabel: CATEGORY_FORM_LABELS[cat],
      groupId: targetGroupId,
      groupName: targetGroupName,
      date,
      hariLabel,
      tarikhHariDisplay,
      masaDisplay: masaDisplay || '3.00 p.m. - 5.00 p.m.',
      venue,
      presentStudentIds,
      absentStudentIds: absentIds,
      attendanceStats: {
        present: attendanceStats.present,
        absent: attendanceStats.absent,
        total: attendanceStats.total,
        percentage: attendanceStats.percentage,
      },
      guruPenasihatHadir: guruHadir,
      setiausahaMurid,
      guruPenasihatPenyemak,
      tajukAktiviti: tajukAktiviti || `Perjumpaan ${selectedMeetingNumber}`,
      butiranAktiviti,
      objektif: [butiranAktiviti],
      ringkasanAktiviti: butiranAktiviti,
      ciriKbat,
      amalanSivik: {
        nilaiTeras,
        subNilai,
        aktiviti: aktivitiSivik,
      },
      sisipanPikebm,
      refleksiImpak,
      disediakanOleh,
      jawatanPenyedia: 'Guru Penasihat',
      disemakOlehPkKk,
      disahkanOleh: disahkanOlehGb,
      disahkanOlehGb,
      standardGroup: 'Std 3.2',
      subStandardCode: activeSkasMapping.subStandardCode,
      subStandardTitle: activeSkasMapping.subStandardTitle,
      skpmStandardCode: activeSkasMapping.subStandardCode,
      skpmStandardTitle: activeSkasMapping.standardFullTitle,
      skpmAspekTitle: `Sub-Standard ${activeSkasMapping.subStandardCode}: ${activeSkasMapping.subStandardTitle}`,
      skpmKualitiStatement: activeSkasMapping.kualitiStatement,
      academicYear: '2026',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }, [
    activeSchoolCode,
    selectedMeetingNumber,
    tajukAktiviti,
    currentGroup,
    selectedCategory,
    date,
    masaDisplay,
    venue,
    unitStudents,
    presentStudentIds,
    attendanceStats,
    guruHadir,
    setiausahaMurid,
    guruPenasihatPenyemak,
    butiranAktiviti,
    ciriKbat,
    nilaiTeras,
    subNilai,
    aktivitiSivik,
    sisipanPikebm,
    refleksiImpak,
    disediakanOleh,
    disemakOlehPkKk,
    disahkanOlehGb,
    activeSkasMapping,
  ]);

  // Save report + Sync PAJSK Attendance (`koko_attendance`) + Sync Google Drive (`LAPORAN_PERJUMPAAN`) + Light up Radar Evidens (`ai_setiausaha_documents`)
  const handleSaveAndArchiveReport = async () => {
    if (!currentGroup) return;
    setSaving(true);
    setSaveFeedback(null);

    const targetGroupId = currentGroup.id || currentGroup.name;
    const cleanGroupKey = targetGroupId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const reportDocId = scopedDocId(
      activeSchoolCode,
      `${cleanGroupKey}_p${selectedMeetingNumber}`
    );
    const attendanceDocId = scopedDocId(
      activeSchoolCode,
      `att_${cleanGroupKey}_p${selectedMeetingNumber}`
    );

    try {
      // 1. Sync student roll-call into `koko_attendance` so PAJSK attendance statistics accumulate automatically
      const attendanceMap: Record<string, '1' | '0' | 'x'> = {};
      unitStudents.forEach((st) => {
        attendanceMap[st.student_id] = presentStudentIds.includes(st.student_id) ? '1' : '0';
      });

      const matchingExistingSession = attendanceSessions.find(
        (s) =>
          (s.groupId === targetGroupId ||
            s.groupId?.toLowerCase().trim() === currentGroup.name.toLowerCase().trim()) &&
          Number(s.meetingNumber) === Number(selectedMeetingNumber)
      );
      const targetAttendanceDocId = matchingExistingSession?.id || attendanceDocId;

      await setDoc(
        doc(db, 'koko_attendance', targetAttendanceDocId),
        deepSanitizeFirestore({
          id: targetAttendanceDocId,
          schoolCode: activeSchoolCode,
          groupId: targetGroupId,
          category: currentGroup.category,
          date,
          meetingNumber: Number(selectedMeetingNumber),
          academicYear: '2026',
          attendance: attendanceMap,
          meetingReportId: reportDocId,
          updatedAt: new Date().toISOString(),
          createdBy: profile.name,
        }),
        { merge: true }
      );

      // 2. Archive A4 1:1 Form HTML to Google Drive via Webhook (`docKind: "LAPORAN_PERJUMPAAN"`)
      const singleFormHtmlBody = buildSingleMeetingOfficialFormHtml(currentDraftReport, false);
      const printableHtmlDoc = buildPrintableHtmlDocument(
        singleFormHtmlBody,
        `Laporan_Perjumpaan_P${selectedMeetingNumber}_${currentGroup.name}`,
        'portrait',
        false
      );

      const programTitle = `LAPORAN AKTIVITI PERJUMPAAN P${selectedMeetingNumber} — ${currentGroup.name.toUpperCase()}`;

      const driveRes = await syncDocumentToSchoolDrive({
        schoolCode: activeSchoolCode,
        schoolName: schoolSettings?.schoolName || tenantSchoolName,
        academicYear: '2026',
        docKind: 'LAPORAN_PERJUMPAAN',
        standardGroup: 'Std 3.2',
        subStandardCode: activeSkasMapping.subStandardCode,
        subStandardTitle: `${activeSkasMapping.subStandardCode} - ${activeSkasMapping.subStandardTitle}`,
        standards: [
          {
            standardGroup: 'Std 3.2',
            subStandardCode: activeSkasMapping.subStandardCode,
            subStandardTitle: `${activeSkasMapping.subStandardCode} - ${activeSkasMapping.subStandardTitle}`,
          },
        ],
        driveTargetFolderPath: activeSkasMapping.driveTargetFolderPath,
        skpmBucket: 'Std 3.2',
        skpmCodeBadge: activeSkasMapping.subStandardCode,
        skpmStandard: activeSkasMapping.standardFullTitle,
        skpmAspek: `Sub-Standard ${activeSkasMapping.subStandardCode}: ${activeSkasMapping.subStandardTitle}`,
        skpmStandardKualiti: activeSkasMapping.kualitiStatement,
        pillar: 'KOKURIKULUM',
        kodMySG: activeSkasMapping.subStandardCode,
        jawatankuasaInduk: currentGroup.name,
        programTitle,
        tarikh: date,
        masa: masaDisplay,
        tempat: venue,
        sasaran: `Kehadiran Murid: ${attendanceStats.present}/${attendanceStats.total} (${attendanceStats.percentage}%)`,
        objektif: [butiranAktiviti],
        pengisianAktiviti: [
          `Unit: ${currentGroup.name} (${CATEGORY_FORM_LABELS[currentGroup.category]})`,
          `Bilangan Perjumpaan: ${selectedMeetingNumber} / 12`,
          `Kehadiran Murid (PAJSK): ${attendanceStats.present}/${attendanceStats.total}`,
          `Kehadiran Guru: ${guruHadir.map((g, i) => `${i + 1}. ${g}`).join(', ')}`,
          `Butiran Aktiviti: ${butiranAktiviti}`,
          `Ciri KBAT: ${ciriKbat}`,
          `Amalan Sivik: ${nilaiTeras} (${subNilai}) — ${aktivitiSivik}`,
          `Sisipan PIKeBM: ${sisipanPikebm}`,
        ],
        impak: [refleksiImpak],
        refleksiDanTindakanSusulan: [refleksiImpak],
        preparedByName: disediakanOleh,
        preparedByTitle: 'Guru Penasihat',
        htmlContent: printableHtmlDoc,
      });

      const savedFolderPath =
        driveRes.folderPath || activeSkasMapping.driveTargetFolderPath.join(' / ');

      // 3. Save `koko_meeting_reports` document
      const reportPayload: KokoMeetingReport = deepSanitizeFirestore({
        ...currentDraftReport,
        id: reportDocId,
        attendanceSessionId: targetAttendanceDocId,
        driveSynced: driveRes.success,
        driveFileUrl: driveRes.fileUrl || '',
        driveFolderUrl: driveRes.folderUrl || '',
        driveFolderPath: savedFolderPath,
      });

      await setDoc(doc(db, 'koko_meeting_reports', reportDocId), reportPayload, {
        merge: true,
      });

      // 4. Save to `ai_setiausaha_documents` so Radar Evidens SKAS lights up 3.2.2.1 / 3.2.3.1 / 3.2.4.1
      const setiausahaDocId = scopedDocId(activeSchoolCode, `koko_meeting_${reportDocId}`);
      const setiausahaPayload = deepSanitizeFirestore({
        id: setiausahaDocId,
        docKind: 'OPR',
        originalDocKind: 'LAPORAN_PERJUMPAAN',
        sourceModule: 'LAPORAN_PERJUMPAAN_MINGGUAN',
        sourceActivityId: reportDocId,
        schoolCode: activeSchoolCode,
        academicYear: '2026',
        academicYears: ['2026'],
        pillar: 'KOKURIKULUM',
        kodMySG: activeSkasMapping.subStandardCode,
        jawatankuasaInduk: currentGroup.name,
        jawatanRasmi: 'Guru Penasihat',
        standardGroup: 'Std 3.2',
        subStandardCode: activeSkasMapping.subStandardCode,
        subStandardTitle: activeSkasMapping.subStandardTitle,
        standards: [
          {
            standardGroup: 'Std 3.2',
            subStandardCode: activeSkasMapping.subStandardCode,
            subStandardTitle: `${activeSkasMapping.subStandardCode} - ${activeSkasMapping.subStandardTitle}`,
          },
        ],
        driveTargetFolderPath: activeSkasMapping.driveTargetFolderPath,
        linkedPaths: [savedFolderPath],
        skpmBucket: 'Std 3.2',
        secondarySkpmBucket: 'Std 5',
        skpmCodeBadge: `${activeSkasMapping.subStandardCode} (P${selectedMeetingNumber})`,
        skpmStandard: activeSkasMapping.standardFullTitle,
        skpmAspek: `Sub-Standard ${activeSkasMapping.subStandardCode}: ${activeSkasMapping.subStandardTitle}`,
        skpmStandardKualiti: activeSkasMapping.kualitiStatement,
        programTitle,
        tarikh: date,
        masa: masaDisplay,
        tempat: venue,
        sasaran: `Ahli ${currentGroup.name} (${attendanceStats.present}/${attendanceStats.total} Hadir · ${attendanceStats.percentage}%)`,
        rawNotes: butiranAktiviti,
        objektif: [
          `Perjumpaan Mingguan Bil. ${selectedMeetingNumber}/12 — ${CATEGORY_FORM_LABELS[currentGroup.category]}`,
        ],
        pengisianAktiviti: [
          `Butiran Aktiviti: ${butiranAktiviti}`,
          `Ciri KBAT: ${ciriKbat}`,
          `Amalan Sivik: ${nilaiTeras} (${subNilai}) — ${aktivitiSivik}`,
          `Sisipan PIKeBM: ${sisipanPikebm}`,
        ],
        impak: [refleksiImpak],
        refleksiDanTindakanSusulan: [refleksiImpak],
        photos: [],
        preparedByName: (disediakanOleh || profile.name || '').toUpperCase(),
        preparedByTitle: 'Guru Penasihat',
        folderUrl: driveRes.folderUrl || '',
        fileUrl: driveRes.fileUrl || '',
        folderPath: savedFolderPath,
        driveFolderUrl: driveRes.folderUrl || '',
        driveFileUrl: driveRes.fileUrl || '',
        driveFolderPath: savedFolderPath,
        driveSyncedAt: new Date().toISOString(),
        createdBy: profile.email || profile.uid,
        createdAt: reportPayload.createdAt,
        updatedAt: new Date().toISOString(),
      });

      await setDoc(doc(db, 'ai_setiausaha_documents', setiausahaDocId), setiausahaPayload, {
        merge: true,
      });

      setSaveFeedback({
        ok: true,
        message: driveRes.success
          ? `Laporan Perjumpaan Bil. ${selectedMeetingNumber} (${currentGroup.name}) berjaya disimpan, kehadiran PAJSK (${attendanceStats.present}/${attendanceStats.total}) dikemas kini & diarkibkan ke Google Drive (${activeSkasMapping.subStandardCode})!`
          : `Laporan Perjumpaan Bil. ${selectedMeetingNumber} & kehadiran PAJSK (${attendanceStats.present}/${attendanceStats.total}) berjaya disimpan ke Radar Evidens SKAS (${activeSkasMapping.subStandardCode}).`,
        fileUrl: driveRes.fileUrl,
        folderUrl: driveRes.folderUrl,
      });
    } catch (err: any) {
      console.error('Error saving meeting report:', err);
      setSaveFeedback({
        ok: false,
        message: err?.message || 'Ralat semasa menyimpan Laporan Aktiviti Perjumpaan.',
      });
    } finally {
      setSaving(false);
    }
  };

  // Print Single Meeting Report (1:1 Official A4 Portrait Form)
  const handlePrintSingleReport = () => {
    const htmlBody = buildSingleMeetingOfficialFormHtml(currentDraftReport, false);
    const fullDoc = buildPrintableHtmlDocument(
      htmlBody,
      `Laporan_Perjumpaan_P${selectedMeetingNumber}_${currentDraftReport.groupName}`,
      'portrait',
      true
    );
    openPrintableHtmlWindow(fullDoc);
  };

  // Print All Meetings 1–12 for the Selected Unit (Batch A4 Portrait)
  const handlePrintAllUnitReports = () => {
    if (!currentGroup) return;
    const reportsByNum = new Map<number, KokoMeetingReport>();
    unitReports.forEach((r) => reportsByNum.set(Number(r.meetingNumber), r));
    // Include current draft report for the active meeting number
    reportsByNum.set(Number(selectedMeetingNumber), currentDraftReport);

    const sortedList = Array.from(reportsByNum.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, rep]) => rep);

    const combinedHtmlBody = sortedList
      .map((rep, idx) =>
        buildSingleMeetingOfficialFormHtml(rep, idx < sortedList.length - 1)
      )
      .join('\n');

    const fullDoc = buildPrintableHtmlDocument(
      combinedHtmlBody,
      `Laporan_Aktiviti_Perjumpaan_1_Hingga_12_${currentGroup.name}`,
      'portrait',
      true
    );
    openPrintableHtmlWindow(fullDoc);
  };

  return (
    <div className="space-y-6">
      {/* ================= 1. TOP HEADER & SKAS 3.2 AUTO-MAPPING BANNER ================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5 print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 bg-indigo-600/20 text-indigo-400 rounded-2xl border border-indigo-500/30 shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-md bg-teal-500/15 border border-teal-500/30 text-teal-300 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  SKAS {activeSkasMapping.standardGroup} → {activeSkasMapping.subStandardCode}
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-[10px] font-bold">
                  1:1 Borang Rasmi Sekolah · Segerak Kehadiran PAJSK &amp; Google Drive
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-1">
                Laporan Aktiviti Perjumpaan Mingguan (Perjumpaan 1 – 12)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Pemetaan automatik: <strong>Pasukan Badan Beruniform → 3.2.3.1</strong> ·{' '}
                <strong>Kelab dan Persatuan → 3.2.2.1</strong> ·{' '}
                <strong>Sukan dan Permainan → 3.2.4.1</strong>
              </p>
            </div>
          </div>

          {/* Category Switcher */}
          <div className="flex flex-wrap bg-slate-950 p-1.5 rounded-2xl border border-slate-800 shrink-0 gap-1">
            {(['uniform', 'club', 'sport'] as const).map((cat) => {
              const isSelected = selectedCategory === cat;
              const subCode = CATEGORY_SKAS_SUB_CODE[cat];
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? cat === 'uniform'
                        ? 'bg-blue-600 text-white shadow-md'
                        : cat === 'club'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'bg-amber-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>{CATEGORY_FORM_LABELS[cat]}</span>
                  <span className="px-1.5 py-0.2 rounded bg-black/25 text-[10px] font-mono">
                    {subCode}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Unit Selector & Auto-Mapped SKAS Folder Pill */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-black text-slate-400 uppercase tracking-wider mr-1">
              Pilih Unit ({CATEGORY_FORM_LABELS[selectedCategory]}):
            </span>
            {categoryGroups.map((g) => {
              const isSelected =
                g.id === selectedGroupId || g.name === selectedGroupId;
              return (
                <button
                  key={g.id || g.name}
                  type="button"
                  onClick={() => setSelectedGroupId(g.id || g.name)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-white text-slate-950 shadow-md font-black'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <span>{g.name}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                </button>
              );
            })}

            {!showAddUnitInput ? (
              <button
                type="button"
                onClick={() => setShowAddUnitInput(true)}
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-slate-800/70 hover:bg-slate-800 text-indigo-300 border border-indigo-500/30 flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Unit Baru</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={customUnitName}
                  onChange={(e) => setCustomUnitName(e.target.value)}
                  placeholder="Contoh: Kelab PAJS"
                  className="bg-slate-950 border border-indigo-500/50 rounded-xl px-2.5 py-1 text-xs text-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddCustomUnit}
                  className="px-2.5 py-1 rounded-xl bg-indigo-600 text-white text-xs font-bold cursor-pointer"
                >
                  Tambah
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddUnitInput(false)}
                  className="text-xs text-slate-400 hover:text-white px-1 cursor-pointer"
                >
                  Batal
                </button>
              </div>
            )}
          </div>

          <div className="px-3.5 py-2 rounded-xl bg-teal-950/50 border border-teal-500/30 text-[11px] text-teal-200 flex items-center gap-2 shrink-0">
            <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
            <div>
              <span className="font-black text-amber-300">
                {activeSkasMapping.standardGroup} / {activeSkasMapping.subStandardCode}
              </span>{' '}
              — {activeSkasMapping.subStandardTitle}
            </div>
          </div>
        </div>

        {/* 12 Meetings Stepper Grid (Bilangan Perjumpaan 1 - 12) */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              Bilangan Perjumpaan (1 Hingga 12) — {currentGroup?.name}:
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">
                Siap Rekod:{' '}
                <strong className="text-emerald-400 font-mono">
                  {unitReports.length} / 12
                </strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  const recordedNums = new Set(
                    unitReports.map((r) => Number(r.meetingNumber))
                  );
                  for (let i = 1; i <= 12; i++) {
                    if (!recordedNums.has(i)) {
                      setSelectedMeetingNumber(i);
                      return;
                    }
                  }
                }}
                className="px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 text-[11px] font-bold cursor-pointer"
              >
                Auto Pilih Perjumpaan Seterusnya
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-12 gap-2">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((num) => {
              const isSelected = selectedMeetingNumber === num;
              const existingRep = unitReports.find(
                (r) => Number(r.meetingNumber) === num
              );
              return (
                <button
                  key={num}
                  type="button"
                  onClick={() => setSelectedMeetingNumber(num)}
                  className={`p-2 rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-600/30 font-black'
                      : existingRep
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/60'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span className="text-xs font-black">Bil. {num}</span>
                  <span className="text-[9px] mt-0.5 truncate w-full text-center">
                    {existingRep ? '✓ Siap' : 'Draf'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ================= 2. MAIN WORKSPACE: FORM INPUT (LEFT) + 1:1 A4 PREVIEW (RIGHT) ================= */}
      {currentGroup && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: FORM INPUTS & STUDENT ROLL-CALL */}
          <div className="xl:col-span-6 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6 print:hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400">
                  Borang Input Guru Penasihat
                </span>
                <h3 className="text-base font-black text-white">
                  {currentGroup.name} — Perjumpaan Bil. {selectedMeetingNumber}
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintSingleReport}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Cetak Laporan Ini</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintAllUnitReports}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Cetak Semua (1–12)</span>
                </button>

                {canEdit && (
                  <button
                    type="button"
                    onClick={handleSaveAndArchiveReport}
                    disabled={saving}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-teal-600 hover:from-indigo-500 hover:to-teal-500 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-lg shadow-indigo-600/25 cursor-pointer"
                  >
                    {saving ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CloudUpload className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {saving
                        ? 'Menyimpan & Arkib...'
                        : `Simpan & Arkib Drive (${activeSkasMapping.subStandardCode})`}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {saveFeedback && (
              <div
                className={`p-3.5 rounded-2xl border text-xs font-bold flex flex-wrap items-center justify-between gap-2 ${
                  saveFeedback.ok
                    ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-200'
                    : 'bg-rose-950/70 border-rose-500/40 text-rose-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {saveFeedback.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>{saveFeedback.message}</span>
                </div>
                <div className="flex items-center gap-2">
                  {saveFeedback.fileUrl && (
                    <a
                      href={saveFeedback.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/30 text-[11px] flex items-center gap-1"
                    >
                      <span>Buka PDF Drive</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {saveFeedback.folderUrl && (
                    <a
                      href={saveFeedback.folderUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-teal-500/20 border border-teal-400/40 text-teal-200 hover:bg-teal-500/30 text-[11px] flex items-center gap-1"
                    >
                      <span>Folder {activeSkasMapping.subStandardCode}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* ================= BAHAGIAN ATAS: MAKLUMAT PERJUMPAAN ================= */}
            <div className="space-y-4">
              <div className="text-xs font-black uppercase tracking-wider text-teal-300 border-b border-slate-800 pb-1.5">
                Bahagian 1: Maklumat Perjumpaan &amp; Kehadiran Murid (PAJSK)
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-400 block mb-1">
                    Tarikh Perjumpaan (Auto Hari)
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-indigo-500"
                  />
                  <div className="text-[10px] text-indigo-300 mt-1 font-semibold">
                    Paparan: {formatDateToMalayTarikhHari(date).tarikhHariDisplay}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 block mb-1">
                    Masa (Default: 3.00 p.m. - 5.00 p.m.)
                  </label>
                  <input
                    type="text"
                    value={masaDisplay}
                    onChange={(e) => setMasaDisplay(e.target.value)}
                    placeholder="3.00 p.m. - 5.00 p.m."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-indigo-500"
                  />
                  <div className="flex flex-wrap gap-1 mt-1">
                    {['3.00 p.m. - 5.00 p.m.', '2.00 p.m. - 4.00 p.m.', '1.30 p.m. - 3.30 p.m.'].map(
                      (mPreset) => (
                        <button
                          key={mPreset}
                          type="button"
                          onClick={() => setMasaDisplay(mPreset)}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                        >
                          {mPreset}
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 block mb-1">
                    Tempat
                  </label>
                  <input
                    type="text"
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                    placeholder="Kelas / Dewan / Padang"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-indigo-500"
                  />
                  <div className="flex flex-wrap gap-1 mt-1">
                    {['Kelas Tahun 4', 'Dewan Sekolah', 'Padang Sekolah'].map((vPreset) => (
                      <button
                        key={vPreset}
                        type="button"
                        onClick={() => setVenue(vPreset)}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                      >
                        {vPreset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* STUDENT ROLL-CALL & AUTO PAJSK ATTENDANCE */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-black text-white">
                      Senarai Kehadiran Murid:{' '}
                      <span className="text-emerald-400 font-mono text-sm">
                        {attendanceStats.present}/{attendanceStats.total}
                      </span>{' '}
                      <span className="text-[11px] text-slate-400">
                        ({attendanceStats.percentage}% · Auto-Segerak PAJSK)
                      </span>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleMarkAllStudentsPresent}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black flex items-center gap-1 cursor-pointer shadow"
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                      <span>Semua Hadir ({unitStudents.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setShowAllSchoolStudentsFallback((prev) => !prev)
                      }
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold cursor-pointer"
                      title="Tukar paparan antara ahli berdaftar unit atau semua murid Tahun 4-6"
                    >
                      {showAllSchoolStudentsFallback ? 'Ahli Unit Sahaja' : 'Semua Murid T4–T6'}
                    </button>
                  </div>
                </div>

                {unitStudents.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">
                    Tiada murid ditemui dalam senarai unit ini.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                    {unitStudents.map((st, idx) => {
                      const isPresent = presentStudentIds.includes(st.student_id);
                      return (
                        <button
                          key={`${st.student_id}_${idx}`}
                          type="button"
                          onClick={() => handleToggleStudentPresence(st.student_id)}
                          className={`px-2.5 py-1.5 rounded-xl border text-left text-xs flex items-center justify-between gap-2 transition-all cursor-pointer ${
                            isPresent
                              ? 'bg-emerald-950/35 border-emerald-500/40 text-emerald-200'
                              : 'bg-rose-950/30 border-rose-500/30 text-rose-300 opacity-75'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {isPresent ? (
                              <CheckSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            ) : (
                              <Square className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                            )}
                            <span className="font-bold truncate">
                              {idx + 1}. {st.name}
                            </span>
                          </div>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-900 text-slate-400 shrink-0">
                            {st.class}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* KEHADIRAN GURU PENASIHAT (NUMBERED 1., 2., 3.) */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-white">
                    Kehadiran Guru Penasihat ({guruHadir.length} Orang — Auto Nombor 1, 2, 3):
                  </label>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {teachers.map((tName) => {
                    const idxInSelected = guruHadir.indexOf(tName);
                    const isChecked = idxInSelected !== -1;
                    return (
                      <button
                        key={tName}
                        type="button"
                        onClick={() => handleToggleTeacher(tName)}
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition border flex items-center gap-1.5 cursor-pointer ${
                          isChecked
                            ? 'bg-indigo-600 text-white border-indigo-400 shadow'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        {isChecked && (
                          <span className="px-1.5 py-0.2 rounded-full bg-black/30 text-[10px] font-black">
                            {idxInSelected + 1}.
                          </span>
                        )}
                        <span>{tName}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={customTeacherInput}
                    onChange={(e) => setCustomTeacherInput(e.target.value)}
                    placeholder="Tambah nama guru lain..."
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomTeacher}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
                  >
                    + Tambah Guru
                  </button>
                </div>
              </div>

              {/* BUTIRAN AKTIVITI */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-black text-slate-200">
                    Butiran Aktiviti:
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const tpl = KPM_12_MEETING_TEMPLATES.find(
                        (t) => t.meetingNumber === Number(selectedMeetingNumber)
                      );
                      if (tpl) {
                        setButiranAktiviti(
                          `1. ${tpl.title}\n2. ${tpl.defaultSummary}\n3. ${tpl.defaultObjectives.join(' ')}`
                        );
                      }
                    }}
                    className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Muat Templat KPM P{selectedMeetingNumber}</span>
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={butiranAktiviti}
                  onChange={(e) => setButiranAktiviti(e.target.value)}
                  placeholder="1. Mengambil kehadiran murid...\n2. Penerangan dan latihan amali..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white leading-relaxed focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* SETIAUSAHA (MURID) & GURU PENASIHAT (DISEMAK OLEH - ATAS) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-400 block mb-1">
                    Disediakan Oleh: Setiausaha (Murid)
                  </label>
                  <div className="space-y-1.5">
                    <select
                      value={
                        unitStudents.some((s) => s.name === setiausahaMurid)
                          ? setiausahaMurid
                          : '__CUSTOM__'
                      }
                      onChange={(e) => {
                        if (e.target.value !== '__CUSTOM__') {
                          setSetiausahaMurid(e.target.value);
                        }
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-bold focus:outline-none"
                    >
                      <option value="__CUSTOM__">-- Pilih Murid / Taip Manual --</option>
                      {unitStudents.map((st, idx) => (
                        <option key={`${st.student_id}_su_${idx}`} value={st.name}>
                          {st.name} ({st.class})
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={setiausahaMurid}
                      onChange={(e) => setSetiausahaMurid(e.target.value)}
                      placeholder="Nama Setiausaha Murid..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white font-bold focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 block mb-1">
                    Disemak Oleh: Guru Penasihat (Bahagian Atas)
                  </label>
                  <div className="space-y-1.5">
                    <select
                      value={
                        teachers.includes(guruPenasihatPenyemak)
                          ? guruPenasihatPenyemak
                          : '__CUSTOM__'
                      }
                      onChange={(e) => {
                        if (e.target.value !== '__CUSTOM__') {
                          setGuruPenasihatPenyemak(e.target.value);
                          setDisediakanOleh(e.target.value);
                        }
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-bold focus:outline-none"
                    >
                      <option value="__CUSTOM__">-- Pilih Guru Penasihat --</option>
                      {(guruHadir.length > 0 ? guruHadir : teachers).map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={guruPenasihatPenyemak}
                      onChange={(e) => setGuruPenasihatPenyemak(e.target.value)}
                      placeholder="Nama Guru Penasihat..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white font-bold focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ================= BAHAGIAN BAWAH: LAPORAN PEMANTAUAN GURU PENASIHAT ================= */}
            <div className="space-y-4 pt-3 border-t border-slate-800">
              <div className="text-xs font-black uppercase tracking-wider text-amber-300 border-b border-slate-800 pb-1.5">
                Bahagian 2: Laporan Pemantauan Guru Penasihat (KBAT · Sivik · PIKeBM · Refleksi)
              </div>

              {/* 1. Ciri KBAT Dalam Kokurikulum */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-300 block">
                  Ciri KBAT Dalam Kokurikulum:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={
                      CIRI_KBAT_KOKO_OPTIONS.includes(ciriKbat) ? ciriKbat : '__CUSTOM__'
                    }
                    onChange={(e) => {
                      if (e.target.value !== '__CUSTOM__') {
                        setCiriKbat(e.target.value);
                      }
                    }}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-indigo-300 font-bold focus:outline-none"
                  >
                    {CIRI_KBAT_KOKO_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                    <option value="__CUSTOM__">-- Input Manual / Lain-lain --</option>
                  </select>
                  <input
                    type="text"
                    value={ciriKbat}
                    onChange={(e) => setCiriKbat(e.target.value)}
                    placeholder="Taip ciri KBAT..."
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* 2. Amalan Sivik Dalam Kokurikulum (Nilai Teras, Sub Nilai, Aktiviti) */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="text-xs font-black text-white">
                  Amalan Sivik Dalam Kokurikulum:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                      Nilai Teras
                    </label>
                    <select
                      value={nilaiTeras}
                      onChange={(e) => {
                        const nextNilai = e.target.value;
                        setNilaiTeras(nextNilai);
                        const defaultSubs = SUB_NILAI_SIVIK_OPTIONS[nextNilai] || [];
                        if (defaultSubs[0]) setSubNilai(defaultSubs[0]);
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-emerald-300 font-bold focus:outline-none"
                    >
                      {NILAI_TERAS_SIVIK_OPTIONS.map((nt) => (
                        <option key={nt} value={nt}>
                          {nt}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                      Sub Nilai (Pilih atau Taip)
                    </label>
                    <div className="flex gap-1.5">
                      <select
                        value={
                          (SUB_NILAI_SIVIK_OPTIONS[nilaiTeras] || []).includes(subNilai)
                            ? subNilai
                            : '__CUSTOM__'
                        }
                        onChange={(e) => {
                          if (e.target.value !== '__CUSTOM__') {
                            setSubNilai(e.target.value);
                          }
                        }}
                        className="w-1/2 bg-slate-900 border border-slate-800 rounded-xl px-2 py-2 text-xs text-slate-200 font-bold focus:outline-none"
                      >
                        {(SUB_NILAI_SIVIK_OPTIONS[nilaiTeras] || []).map((sn) => (
                          <option key={sn} value={sn}>
                            {sn}
                          </option>
                        ))}
                        <option value="__CUSTOM__">Manual</option>
                      </select>
                      <input
                        type="text"
                        value={subNilai}
                        onChange={(e) => setSubNilai(e.target.value)}
                        placeholder="Contoh: Kelestarian Alam"
                        className="w-1/2 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                    Aktiviti Amalan Sivik
                  </label>
                  <input
                    type="text"
                    value={aktivitiSivik}
                    onChange={(e) => setAktivitiSivik(e.target.value)}
                    placeholder="Contoh: Menjaga kebersihan kawasan aktiviti dan kelestarian alam sekitar"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* 3. Sisipan Aktiviti PIKeBM */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-300 block">
                  Sisipan Aktiviti PIKeBM:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={
                      PIKEBM_ACTIVITY_OPTIONS.includes(sisipanPikebm)
                        ? sisipanPikebm
                        : '__CUSTOM__'
                    }
                    onChange={(e) => {
                      if (e.target.value !== '__CUSTOM__') {
                        setSisipanPikebm(e.target.value);
                      }
                    }}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-amber-300 font-bold focus:outline-none"
                  >
                    {PIKEBM_ACTIVITY_OPTIONS.map((pk) => (
                      <option key={pk} value={pk}>
                        {pk}
                      </option>
                    ))}
                    <option value="__CUSTOM__">-- Input Manual --</option>
                  </select>
                  <input
                    type="text"
                    value={sisipanPikebm}
                    onChange={(e) => setSisipanPikebm(e.target.value)}
                    placeholder="Taip aktiviti PIKeBM..."
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* 4. Refleksi (Kekuatan, Kelemahan, Penambahbaikan) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-300">
                    Refleksi (Kekuatan, Kelemahan, Penambahbaikan):
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateReflectionDraft}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-[11px] font-black flex items-center gap-1 cursor-pointer"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>Jana Draf Refleksi</span>
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={refleksiImpak}
                  onChange={(e) => setRefleksiImpak(e.target.value)}
                  placeholder="Kekuatan: ...\nKelemahan: ...\nPenambahbaikan: ..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white leading-relaxed focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* 5. Tiga Baris Pengesahan Bawah (Guru Penasihat, PK KK, GB/Pengetua) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                    1. Disediakan Oleh (Guru Penasihat)
                  </label>
                  <input
                    type="text"
                    value={disediakanOleh}
                    onChange={(e) => setDisediakanOleh(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white font-bold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                    2. Disemak Oleh (PK KK)
                  </label>
                  <input
                    type="text"
                    value={disemakOlehPkKk}
                    onChange={(e) => setDisemakOlehPkKk(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white font-bold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                    3. Disahkan Oleh (GB / Pengetua)
                  </label>
                  <input
                    type="text"
                    value={disahkanOlehGb}
                    onChange={(e) => setDisahkanOlehGb(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white font-bold focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: 1:1 LIVE WYSIWYG A4 PHYSICAL FORM PREVIEW */}
          <div className="xl:col-span-6 space-y-3">
            <div className="flex items-center justify-between px-2 print:hidden">
              <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Printer className="w-4 h-4 text-indigo-400" />
                Pratonton 1:1 Borang Fizikal Sekolah (A4 Portrait)
              </span>
              <span className="text-[11px] text-slate-400">
                SKAS: <strong className="text-teal-300">{activeSkasMapping.subStandardCode}</strong>
              </span>
            </div>

            <div className="bg-white text-black rounded-2xl shadow-2xl border border-slate-300 overflow-x-auto p-2 sm:p-4">
              <div
                dangerouslySetInnerHTML={{
                  __html: buildSingleMeetingOfficialFormHtml(currentDraftReport, false),
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
