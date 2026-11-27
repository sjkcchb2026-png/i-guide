import React, { useState, useEffect, useMemo } from 'react';
import {
  Award,
  Printer,
  Download,
  CheckCircle2,
  Plus,
  Trash2,
  Users,
  Search,
  ChevronLeft,
  ChevronRight,
  Layers,
  Upload,
  Sparkles,
  FileText,
  UserCheck,
  Building2,
  GraduationCap,
  Calendar,
  Hash,
  CloudUpload,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, SchoolSettings, PersonnelProfile } from '../../types';
import { belongsToSchool, scopedDocId } from '../../utils/schoolTenant';
import { deepSanitizeFirestore } from '../../utils/sanitizeFirestore';
import {
  triggerSmartPrint,
  downloadStandalonePrintHtml,
  buildPrintableHtmlDocument,
} from '../../utils/oprPrintHelper';
import { syncDocumentToSchoolDrive } from '../../utils/schoolDriveArchive';
import SchoolLogo from '../SchoolLogo';
import { OFFICIAL_TEACHERS } from '../../constants/officialRoster';
import {
  SKAS_STANDARDS_DICTIONARY,
  SkasStandardGroupKey,
  getSkasGroup,
  resolveSkasSelection,
} from '../../data/skasStandards';
import { AISetiausahaDocument } from './types';

export type SijilTemplateId =
  | 'T1_KLASIK_DIRAJA'
  | 'T2_MODEN_KORPORAT'
  | 'T3_HARMONI_SJKC'
  | 'T4_FUTURISTIK_STEM'
  | 'T5_ZAMRUD_EMAS'
  | 'T6_MINIMALIS_PRESTIJ'
  | 'T7_TANPA_BINGKAI';

export type JenisSijilType =
  | 'SIJIL PENGHARGAAN'
  | 'SIJIL PENYERTAAN'
  | 'SIJIL PENCAPAIAN'
  | 'SIJIL PENGIKTIRAFAN';

export type KategoriPenerimaType = 'MURID' | 'GURU_AKP' | 'PIHAK_LUAR';

export interface SijilRecipientItem {
  id: string;
  name: string;
  identifier?: string; // No. MyKid / No. KP / Jawatan / Organisasi
  className?: string;
  awardOrRole?: string; // e.g. JOHAN, TOKOH MURID, PENCERAMAH JEMPUTAN
}

interface ModuleSijilProps {
  currentUser?: UserProfile | null;
  schoolSettings?: SchoolSettings | null;
  personnel?: PersonnelProfile[];
  effectiveSchoolCode: string;
  effectiveSchoolName: string;
  effectiveSchoolLogo?: string;
  selectedAcademicYear: string;
  principalName: string;
  onArchiveSuccess?: () => void;
}

const TEMPLATE_CATALOG: Array<{
  id: SijilTemplateId;
  code: string;
  name: string;
  nameZh: string;
  desc: string;
  badgeColor: string;
  previewBg: string;
  previewBorder: string;
}> = [
  {
    id: 'T1_KLASIK_DIRAJA',
    code: 'Template 1',
    name: 'Klasik Diraja Emas',
    nameZh: '皇家香槟金与深酒红古典雕花',
    desc: 'Bingkai arabesque emas & maroon diraja + mohor emas',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    previewBg: 'from-[#fdfbf7] via-[#fffdf9] to-[#f9f3e6]',
    previewBorder: 'border-[#7C1D26]',
  },
  {
    id: 'T2_MODEN_KORPORAT',
    code: 'Template 2',
    name: 'Moden Korporat Biru-Emas',
    nameZh: '深海蓝与流金现代几何双线框',
    desc: 'Geometri biru laut dalam & emas + reben lencana atas',
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    previewBg: 'from-[#f8fafc] via-white to-[#eff6ff]',
    previewBorder: 'border-[#0F294A]',
  },
  {
    id: 'T3_HARMONI_SJKC',
    code: 'Template 3',
    name: 'Harmoni Tradisi SJKC',
    nameZh: '华小红金中式回纹双语抬头',
    desc: 'Motif回纹 merah-emas + Dwibahasa (SJK(C) Chung Hua Balingian / 沐胶万年烟中华公学)',
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    previewBg: 'from-[#fffafa] via-white to-[#fef2f2]',
    previewBorder: 'border-[#991B1B]',
  },
  {
    id: 'T4_FUTURISTIK_STEM',
    code: 'Template 4',
    name: 'Futuristik Digital STEM',
    nameZh: '青蓝钴蓝与流金六边形科技线条',
    desc: 'Garisan heksagon siber biru-sian & emas untuk STEM / ICT / Inovasi',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    previewBg: 'from-[#f0fdfa] via-white to-[#eff6ff]',
    previewBorder: 'border-[#0284C7]',
  },
  {
    id: 'T5_ZAMRUD_EMAS',
    code: 'Template 5',
    name: 'Kontemporari Zamrud & Emas',
    nameZh: '深翡翠绿与哑光金现代叶脉边框',
    desc: 'Bingkai zamrud & daun emas untuk 3K / Alam Sekitar / Kehadiran Penuh / Kepimpinan',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    previewBg: 'from-[#f0fdf4] via-white to-[#ecfdf5]',
    previewBorder: 'border-[#064E3B]',
  },
  {
    id: 'T6_MINIMALIS_PRESTIJ',
    code: 'Template 6',
    name: 'Minimalis Galeri Prestij',
    nameZh: '极简大留白左侧深炭灰拉丝金绶带',
    desc: 'Jalur seni bina arang-emas di kiri + lencana emas kanan bawah',
    badgeColor: 'bg-slate-400/20 text-slate-200 border-slate-400/40',
    previewBg: 'from-white via-[#fafafa] to-[#f4f4f5]',
    previewBorder: 'border-[#1E293B]',
  },
  {
    id: 'T7_TANPA_BINGKAI',
    code: 'Mode 7',
    name: 'Cetakan Tanpa Bingkai (Kosong)',
    nameZh: '空白预印文凭纸套印模式',
    desc: 'Sembunyikan semua bingkai & corak latar — cetak teks & tandatangan sahaja',
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    previewBg: 'from-white to-white',
    previewBorder: 'border-dashed border-slate-400',
  },
];

const JENIS_SIJIL_OPTIONS: Array<{
  id: JenisSijilType;
  labelZh: string;
  introLine: string;
}> = [
  {
    id: 'SIJIL PENGHARGAAN',
    labelZh: '表扬 / 感谢状',
    introLine: 'Dengan sukacitanya merakamkan setinggi-tinggi penghargaan dan terima kasih kepada',
  },
  {
    id: 'SIJIL PENYERTAAN',
    labelZh: '参与证书',
    introLine: 'Dengan ini disahkan bahawa',
  },
  {
    id: 'SIJIL PENCAPAIAN',
    labelZh: '成就 / 获奖证书',
    introLine: 'Dengan sukacitanya mengucapkan setinggi-tinggi tahniah kepada',
  },
  {
    id: 'SIJIL PENGIKTIRAFAN',
    labelZh: '荣誉认可证书',
    introLine: 'Dengan penuh hormat dan sukacitanya menganugerahkan pengiktirafan ini kepada',
  },
];

const AWARD_PRESETS: string[] = [
  'JOHAN',
  'NAIB JOHAN',
  'TEMPAT KETIGA',
  'TEMPAT KEEMPAT',
  'TEMPAT KELIMA',
  'SAGUHATI',
  'EMAS (GOLD)',
  'PERAK (SILVER)',
  'GANGSA (BRONZE)',
  'TOKOH MURID CEMERLANG',
  'TOKOH KOKURIKULUM',
  'TOKOH SAHSIAH TERPUJI',
  'KEHADIRAN PENUH 100%',
  'KETUA PENGAWAS CEMERLANG',
  'PENGAWAS SEKOLAH BERDEDIKASI',
  'PENGAWAS PUSAT SUMBER (PSS)',
  'PEMBIMBING RAKAN SEBAYA (PRS)',
  'KETUA KELAS BERWIBAWA',
  'PENCAPAIAN CEMERLANG PBD / UASA',
];

const BULAN_MELAYU = [
  'Januari',
  'Februari',
  'Mac',
  'April',
  'Mei',
  'Jun',
  'Julai',
  'Ogos',
  'September',
  'Oktober',
  'November',
  'Disember',
];

export function formatTarikhMelayu(isoDate?: string | null): string {
  const clean = String(isoDate || '').trim();
  if (!clean) return '';
  const m = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return clean;
  const year = m[1];
  const monthIdx = parseInt(m[2], 10) - 1;
  const day = parseInt(m[3], 10);
  if (monthIdx < 0 || monthIdx > 11 || isNaN(day)) return clean;
  return `${day} ${BULAN_MELAYU[monthIdx]} ${year}`;
}

function normalizeStudentClassLabel(rawClass?: string, rawYearLevel?: string | number): string {
  const combined = `${rawClass || ''} ${rawYearLevel || ''}`.trim().toUpperCase();
  if (combined.includes('PRA') || combined === '0') return 'Prasekolah';
  if (/\b1\b|TAHUN\s*1|T1|1M|1B/.test(combined)) return 'Tahun 1';
  if (/\b2\b|TAHUN\s*2|T2|2M|2B/.test(combined)) return 'Tahun 2';
  if (/\b3\b|TAHUN\s*3|T3|3M|3B/.test(combined)) return 'Tahun 3';
  if (/\b4\b|TAHUN\s*4|T4|4M|4B/.test(combined)) return 'Tahun 4';
  if (/\b5\b|TAHUN\s*5|T5|5M|5B/.test(combined)) return 'Tahun 5';
  if (/\b6\b|TAHUN\s*6|T6|6M|6B/.test(combined)) return 'Tahun 6';
  return rawClass ? String(rawClass).trim() : 'Tahun 1';
}

function buildAutoCitationParagraph(params: {
  jenisSijil: JenisSijilType;
  kategori: KategoriPenerimaType;
  tema: string;
  academicYear: string;
}): string {
  const temaClean =
    params.tema.trim() || `PROGRAM KECEMERLANGAN SEKOLAH SESI AKADEMIK ${params.academicYear}`;

  switch (params.jenisSijil) {
    case 'SIJIL PENGHARGAAN':
      if (params.kategori === 'GURU_AKP') {
        return `atas khidmat bakti, komitmen cemerlang dan sumbangan profesional dalam menjayakan\n"${temaClean.toUpperCase()}"\nperingkat sekolah bagi Sesi Akademik ${params.academicYear}.`;
      }
      if (params.kategori === 'PIHAK_LUAR') {
        return `atas sumbangan ikhlas, kerjasama strategik dan sokongan padu dalam menjayakan\n"${temaClean.toUpperCase()}"\nSJK (C) Chung Hua Balingian bagi Sesi Akademik ${params.academicYear}.`;
      }
      return `atas komitmen, sahsiah terpuji dan sumbangan cemerlang dalam menjayakan\n"${temaClean.toUpperCase()}"\nbagi Sesi Akademik ${params.academicYear}.`;

    case 'SIJIL PENYERTAAN':
      return `telah menyertai dengan jayanya dan menunjukkan penglibatan aktif dalam\n"${temaClean.toUpperCase()}"\nyang telah diadakan pada Sesi Akademik ${params.academicYear}.`;

    case 'SIJIL PENCAPAIAN':
      return `atas kejayaan dan pencapaian cemerlang dalam\n"${temaClean.toUpperCase()}"\nbagi Sesi Akademik ${params.academicYear}.`;

    case 'SIJIL PENGIKTIRAFAN':
      return `sebagai tanda pengiktirafan rasmi pihak sekolah atas kecemerlangan, ketokohan dan dedikasi tinggi dalam\n"${temaClean.toUpperCase()}"\nbagi Sesi Akademik ${params.academicYear}.`;
  }
}

export const ModuleSijil: React.FC<ModuleSijilProps> = ({
  currentUser,
  schoolSettings,
  personnel = [],
  effectiveSchoolCode,
  effectiveSchoolName,
  effectiveSchoolLogo,
  selectedAcademicYear,
  principalName,
  onArchiveSuccess,
}) => {
  // -------------------- TOP BAR: TEMPLATE, ORIENTATION & SERIAL NO --------------------
  const [selectedTemplate, setSelectedTemplate] = useState<SijilTemplateId>('T1_KLASIK_DIRAJA');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [showSerialNumber, setShowSerialNumber] = useState<boolean>(true);
  const [serialPrefix, setSerialPrefix] = useState<string>(
    `${effectiveSchoolCode}/SIJIL/${selectedAcademicYear}/`
  );
  const [serialStartNum, setSerialStartNum] = useState<number>(1);
  const [schoolChineseName, setSchoolChineseName] = useState<string>('沐胶万年烟中华公学');

  // -------------------- LANGKAH 1: JENIS SIJIL --------------------
  const [jenisSijil, setJenisSijil] = useState<JenisSijilType>('SIJIL PENGHARGAAN');

  // -------------------- LANGKAH 2: KATEGORI PENERIMA --------------------
  const [kategoriPenerima, setKategoriPenerima] = useState<KategoriPenerimaType>('MURID');

  // -------------------- LANGKAH 3: PILIH NAMA PENERIMA --------------------
  const [studentsList, setStudentsList] = useState<
    Array<{
      id: string;
      name: string;
      icNumber: string;
      className: string;
    }>
  >([]);
  const [loadingStudents, setLoadingStudents] = useState<boolean>(false);
  const [studentClassFilter, setStudentClassFilter] = useState<string>('SEMUA');
  const [studentSearchQuery, setStudentSearchQuery] = useState<string>('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentAwardsMap, setStudentAwardsMap] = useState<Record<string, string>>({});

  // Guru / AKP state
  const [teacherSearchQuery, setTeacherSearchQuery] = useState<string>('');
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [teacherRolesMap, setTeacherRolesMap] = useState<Record<string, string>>({});

  // Pihak Luar state
  const [externalRecipients, setExternalRecipients] = useState<SijilRecipientItem[]>([
    {
      id: 'EXT_1',
      name: 'PERSATUAN IBU BAPA DAN GURU (PIBG)',
      identifier: 'SJK (C) Chung Hua Balingian',
      awardOrRole: 'RAKAN STRATEGIK SEKOLAH',
    },
  ]);
  const [extNewName, setExtNewName] = useState<string>('');
  const [extNewTitle, setExtNewTitle] = useState<string>('');
  const [extNewAward, setExtNewAward] = useState<string>('');
  const [extBulkText, setExtBulkText] = useState<string>('');
  const [showBulkExternalInput, setShowBulkExternalInput] = useState<boolean>(false);

  // -------------------- LANGKAH 4: TEMA / TUJUAN SIJIL --------------------
  const [temaSijil, setTemaSijil] = useState<string>(
    `PROGRAM KECEMERLANGAN & APRESIASI MURID SESI ${selectedAcademicYear}`
  );
  const [introText, setIntroText] = useState<string>(JENIS_SIJIL_OPTIONS[0].introLine);
  const [bodyCitationText, setBodyCitationText] = useState<string>(() =>
    buildAutoCitationParagraph({
      jenisSijil: 'SIJIL PENGHARGAAN',
      kategori: 'MURID',
      tema: `PROGRAM KECEMERLANGAN & APRESIASI MURID SESI ${selectedAcademicYear}`,
      academicYear: selectedAcademicYear,
    })
  );
  const [customMottoText, setCustomMottoText] = useState<string>(
    '“BERKHIDMAT UNTUK NEGARA”'
  );

  // -------------------- LANGKAH 5: TARIKH (TIDAK WAJIB / 选填) --------------------
  const [tarikhSijil, setTarikhSijil] = useState<string>('');

  // -------------------- LANGKAH 6: TANDATANGAN / PENGESAHAN --------------------
  const [isDualSignature, setIsDualSignature] = useState<boolean>(false);
  const [primarySignerName, setPrimarySignerName] = useState<string>(principalName);
  const [primarySignerTitle, setPrimarySignerTitle] = useState<string>('Guru Besar');
  const [primarySignaturePng, setPrimarySignaturePng] = useState<string>('');

  const [secondarySignerName, setSecondarySignerName] = useState<string>(
    'PENGERUSI LEMBAGA PENGURUS SEKOLAH'
  );
  const [secondarySignerTitle, setSecondarySignerTitle] = useState<string>(
    'Pengerusi LPS / YDP PIBG'
  );
  const [secondarySignaturePng, setSecondarySignaturePng] = useState<string>('');

  // -------------------- PREVIEW PAGINATION & DRIVE ARCHIVE --------------------
  const [previewIndex, setPreviewIndex] = useState<number>(0);
  const [statusNotice, setStatusNotice] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);

  const [enableDriveArchive, setEnableDriveArchive] = useState<boolean>(false);
  const [skasStandardGroup, setSkasStandardGroup] = useState<SkasStandardGroupKey>('Std 3.2');
  const [skasSubStandardCode, setSkasSubStandardCode] = useState<string>('3.2.5.1');
  const [skasSokonganList, setSkasSokonganList] = useState<
    Array<{ standardGroup: SkasStandardGroupKey; subStandardCode: string }>
  >([]);
  const [isArchivingDrive, setIsArchivingDrive] = useState<boolean>(false);

  // Keep serial prefix and principal name synced
  useEffect(() => {
    setSerialPrefix(`${effectiveSchoolCode}/SIJIL/${selectedAcademicYear}/`);
  }, [effectiveSchoolCode, selectedAcademicYear]);

  useEffect(() => {
    if (principalName && (!primarySignerName || primarySignerName === 'GURU BESAR')) {
      setPrimarySignerName(principalName);
    }
  }, [principalName]);

  // Update introLine & auto body citation when Jenis Sijil changes
  const handleSelectJenisSijil = (nextJenis: JenisSijilType) => {
    setJenisSijil(nextJenis);
    const matched = JENIS_SIJIL_OPTIONS.find((o) => o.id === nextJenis);
    if (matched) {
      setIntroText(matched.introLine);
    }
    setBodyCitationText(
      buildAutoCitationParagraph({
        jenisSijil: nextJenis,
        kategori: kategoriPenerima,
        tema: temaSijil,
        academicYear: selectedAcademicYear,
      })
    );
  };

  // Load students from `student_master` + fallback `students`
  useEffect(() => {
    let active = true;
    async function loadStudentMasterRoster() {
      setLoadingStudents(true);
      try {
        const [masterSnap, enrollSnap] = await Promise.all([
          getDocs(collection(db, 'student_master')).catch(() => null),
          getDocs(collection(db, 'students')).catch(() => null),
        ]);

        const combinedMap = new Map<
          string,
          { id: string; name: string; icNumber: string; className: string }
        >();

        if (masterSnap) {
          masterSnap.docs.forEach((d) => {
            const data: any = d.data();
            if (!belongsToSchool(data, effectiveSchoolCode)) return;
            const name = String(data.name || data.studentName || '')
              .trim()
              .toUpperCase();
            if (!name) return;
            const id = String(data.student_id || data.apdmId || d.id).trim();
            const ic = String(data.icNumber || data.noKp || data.myKid || '').trim();
            const cls = normalizeStudentClassLabel(
              data.currentClass || data.class || data.className,
              data.yearLevel || data.tahun
            );
            combinedMap.set(name, {
              id,
              name,
              icNumber: ic,
              className: cls,
            });
          });
        }

        if (enrollSnap) {
          enrollSnap.docs.forEach((d) => {
            const data: any = d.data();
            if (!belongsToSchool(data, effectiveSchoolCode)) return;
            const name = String(data.name || data.studentName || '')
              .trim()
              .toUpperCase();
            if (!name) return;
            const existing = combinedMap.get(name);
            const id = existing?.id || String(data.student_id || d.id).trim();
            const ic =
              existing?.icNumber ||
              String(data.icNumber || data.noKp || data.myKid || '').trim();
            const cls = normalizeStudentClassLabel(
              data.class || data.currentClass || existing?.className,
              data.yearLevel || data.tahun
            );
            combinedMap.set(name, {
              id,
              name,
              icNumber: ic,
              className: cls,
            });
          });
        }

        const sorted = Array.from(combinedMap.values()).sort((a, b) => {
          const cCmp = a.className.localeCompare(b.className);
          if (cCmp !== 0) return cCmp;
          return a.name.localeCompare(b.name);
        });

        if (!active) return;
        setStudentsList(sorted);
        if (sorted.length > 0 && selectedStudentIds.length === 0) {
          setSelectedStudentIds([sorted[0].id]);
        }
      } catch (err) {
        console.warn('Failed to load student_master for ModuleSijil:', err);
      } finally {
        if (active) setLoadingStudents(false);
      }
    }
    loadStudentMasterRoster();
    return () => {
      active = false;
    };
  }, [effectiveSchoolCode]);

  // Personnel / Teacher roster from `personnel` prop or `OFFICIAL_TEACHERS`
  const staffRoster = useMemo(() => {
    const map = new Map<string, { id: string; name: string; position: string }>();
    if (personnel.length > 0) {
      personnel.forEach((p) => {
        const nameUp = String(p.name || '').trim().toUpperCase();
        if (!nameUp) return;
        map.set(nameUp, {
          id: p.id || nameUp,
          name: nameUp,
          position: String((p as any).position || (p as any).role || 'Pegawai Perkhidmatan Pendidikan'),
        });
      });
    } else {
      OFFICIAL_TEACHERS.forEach((ot) => {
        const nameUp = String(ot.name || '').trim().toUpperCase();
        if (!nameUp || map.has(nameUp)) return;
        map.set(nameUp, {
          id: (ot as any).code || nameUp,
          name: nameUp,
          position: ot.position || 'Pegawai Perkhidmatan Pendidikan',
        });
      });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [personnel]);

  // Signer presets (Guru Besar & GPKs from personnel)
  const signerPresets = useMemo(() => {
    const list: Array<{ name: string; title: string }> = [
      { name: principalName, title: 'Guru Besar' },
    ];
    staffRoster.forEach((st) => {
      if (st.name === principalName) return;
      if (/PENOLONG KANAN|PK\s*1|PK\s*PENTADBIRAN|PK\s*HEM|PK\s*KOKURIKULUM|GURU BESAR/i.test(st.position)) {
        list.push({ name: st.name, title: st.position });
      }
    });
    return list;
  }, [principalName, staffRoster]);

  // Filtered students by class & search
  const filteredStudents = useMemo(() => {
    const q = studentSearchQuery.trim().toUpperCase();
    return studentsList.filter((s) => {
      if (studentClassFilter !== 'SEMUA' && s.className !== studentClassFilter) {
        return false;
      }
      if (!q) return true;
      return (
        s.name.includes(q) ||
        s.icNumber.toUpperCase().includes(q) ||
        s.className.toUpperCase().includes(q)
      );
    });
  }, [studentsList, studentClassFilter, studentSearchQuery]);

  // Filtered teachers by search
  const filteredStaff = useMemo(() => {
    const q = teacherSearchQuery.trim().toUpperCase();
    if (!q) return staffRoster;
    return staffRoster.filter(
      (t) => t.name.includes(q) || t.position.toUpperCase().includes(q)
    );
  }, [staffRoster, teacherSearchQuery]);

  // Active recipients list based on Kategori Penerima
  const activeRecipients: SijilRecipientItem[] = useMemo(() => {
    if (kategoriPenerima === 'MURID') {
      const selectedSet = new Set(selectedStudentIds);
      const picked = studentsList
        .filter((s) => selectedSet.has(s.id))
        .map((s) => ({
          id: s.id,
          name: s.name,
          identifier: s.icNumber ? `No. MyKid / KP: ${s.icNumber}` : '',
          className: s.className,
          awardOrRole: studentAwardsMap[s.id] || '',
        }));
      if (picked.length > 0) return picked;
      return [
        {
          id: 'SAMPLE_MURID',
          name: 'NAMA PENUH MURID',
          identifier: 'No. MyKid / KP: 150101-13-XXXX',
          className: 'Tahun 6',
          awardOrRole:
            jenisSijil === 'SIJIL PENCAPAIAN' || jenisSijil === 'SIJIL PENGIKTIRAFAN'
              ? 'JOHAN / TOKOH MURID'
              : '',
        },
      ];
    }

    if (kategoriPenerima === 'GURU_AKP') {
      const selectedSet = new Set(selectedTeacherIds);
      const picked = staffRoster
        .filter((t) => selectedSet.has(t.id))
        .map((t) => ({
          id: t.id,
          name: t.name,
          identifier: t.position,
          awardOrRole: teacherRolesMap[t.id] || '',
        }));
      if (picked.length > 0) return picked;
      return [
        {
          id: 'SAMPLE_GURU',
          name: (currentUser?.name || 'NAMA GURU / AKP').toUpperCase(),
          identifier: 'Pegawai Perkhidmatan Pendidikan',
          awardOrRole: '',
        },
      ];
    }

    // PIHAK_LUAR
    if (externalRecipients.length > 0) return externalRecipients;
    return [
      {
        id: 'SAMPLE_EXT',
        name: 'NAMA TETAMU KEHORMAT / AGENSI LUAR',
        identifier: 'Rakan Strategik Sekolah',
        awardOrRole: '',
      },
    ];
  }, [
    kategoriPenerima,
    selectedStudentIds,
    studentsList,
    studentAwardsMap,
    selectedTeacherIds,
    staffRoster,
    teacherRolesMap,
    externalRecipients,
    jenisSijil,
    currentUser,
  ]);

  // Keep previewIndex within bounds
  useEffect(() => {
    if (previewIndex >= activeRecipients.length) {
      setPreviewIndex(Math.max(0, activeRecipients.length - 1));
    }
  }, [activeRecipients.length, previewIndex]);

  // SKAS multi-standard resolution for optional Drive archiving
  const primarySkas = useMemo(
    () => resolveSkasSelection(skasStandardGroup, skasSubStandardCode),
    [skasStandardGroup, skasSubStandardCode]
  );

  const resolvedSokonganSkasList = useMemo(() => {
    const seen = new Set<string>([primarySkas.subStandardCode]);
    const list: ReturnType<typeof resolveSkasSelection>[] = [];
    skasSokonganList.forEach((s) => {
      const r = resolveSkasSelection(s.standardGroup, s.subStandardCode);
      if (!seen.has(r.subStandardCode) && list.length < 2) {
        seen.add(r.subStandardCode);
        list.push(r);
      }
    });
    return list;
  }, [skasSokonganList, primarySkas.subStandardCode]);

  const skasStandardsPayload = useMemo(
    () =>
      [primarySkas, ...resolvedSokonganSkasList].map((r) => ({
        standardGroup: r.standardGroup,
        subStandardCode: r.subStandardCode,
        subStandardTitle: r.subStandardTitle,
      })),
    [primarySkas, resolvedSokonganSkasList]
  );

  // Handle transparent signature PNG upload
  const handleSignatureUpload = (
    target: 'PRIMARY' | 'SECONDARY',
    file?: File | null
  ) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = String(ev.target?.result || '');
      if (!dataUrl) return;
      if (target === 'PRIMARY') {
        setPrimarySignaturePng(dataUrl);
      } else {
        setSecondarySignaturePng(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  // Add single external recipient
  const handleAddExternalRecipient = () => {
    if (!extNewName.trim()) return;
    const newItem: SijilRecipientItem = {
      id: `EXT_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: extNewName.trim().toUpperCase(),
      identifier: extNewTitle.trim(),
      awardOrRole: extNewAward.trim().toUpperCase(),
    };
    setExternalRecipients((prev) => [...prev, newItem]);
    setExtNewName('');
    setExtNewTitle('');
    setExtNewAward('');
  };

  // Bulk paste external recipients (Format: Nama | Jawatan/Agensi | Anugerah)
  const handleBulkAddExternal = () => {
    const lines = extBulkText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;
    const added: SijilRecipientItem[] = lines.map((line, i) => {
      const parts = line.split(/[|\t,;]/).map((p) => p.trim());
      return {
        id: `EXT_BULK_${Date.now()}_${i}`,
        name: (parts[0] || 'PENERIMA').toUpperCase(),
        identifier: parts[1] || '',
        awardOrRole: (parts[2] || '').toUpperCase(),
      };
    });
    setExternalRecipients((prev) => [...prev, ...added]);
    setExtBulkText('');
    setShowBulkExternalInput(false);
  };

  // Sync & Archive Certificates to Google Drive (SKAS v3.0) + AI Setiausaha Radar Evidens
  const handleArchiveSijilToDrive = async () => {
    setIsArchivingDrive(true);
    setStatusNotice(null);
    try {
      const nowIso = new Date().toISOString();
      const docId = scopedDocId(
        effectiveSchoolCode,
        `sijil_${selectedAcademicYear}_${Date.now()}`
      );
      const effectiveTarikh = tarikhSijil || nowIso.slice(0, 10);
      const recipientSummary = activeRecipients
        .map(
          (r, idx) =>
            `${idx + 1}. ${r.name}${r.className ? ` (${r.className})` : ''}${
              r.awardOrRole ? ` — ${r.awardOrRole}` : ''
            }`
        )
        .join('\n');

      const batchEl = document.getElementById('isepadu-sijil-batch-print-container');
      const htmlContent = batchEl
        ? buildPrintableHtmlDocument(
            batchEl.outerHTML,
            `${jenisSijil} - ${temaSijil}`,
            orientation,
            false
          )
        : undefined;

      const driveRes = await syncDocumentToSchoolDrive({
        schoolCode: effectiveSchoolCode,
        schoolName: effectiveSchoolName,
        schoolLogoUrl: effectiveSchoolLogo,
        academicYear: selectedAcademicYear,
        docKind: 'SIJIL',
        standardGroup: primarySkas.standardGroup,
        subStandardCode: primarySkas.subStandardCode,
        subStandardTitle: primarySkas.subStandardTitle,
        standards: skasStandardsPayload,
        driveTargetFolderPath: primarySkas.driveTargetFolderPath,
        skpmBucket: primarySkas.standardGroup,
        skpmCodeBadge: skasStandardsPayload.map((s) => s.subStandardCode).join(' + '),
        skpmStandard: primarySkas.standardFullTitle,
        skpmAspek: `SUB-STANDARD ${primarySkas.subStandardCode}: ${primarySkas.subStandardTitle.toUpperCase()}`,
        skpmStandardKualiti: primarySkas.kualitiStatement,
        programTitle: `${jenisSijil}: ${temaSijil.trim().toUpperCase()}`,
        tarikh: effectiveTarikh,
        sasaran: `${activeRecipients.length} Penerima (${kategoriPenerima})`,
        objektif: [`Penganugerahan ${jenisSijil} bagi ${temaSijil}`],
        pengisianAktiviti: [
          `Kategori Penerima: ${kategoriPenerima} (${activeRecipients.length} orang)`,
          `Senarai Penerima: ${activeRecipients.map((r) => r.name).join(', ')}`,
        ],
        preparedByName: (currentUser?.name || primarySignerName || 'SETIAUSAHA').toUpperCase(),
        preparedByTitle: 'Penyelaras Sijil Rasmi Sekolah',
        htmlContent,
      });

      const savedFolderPath =
        driveRes.folderPath || primarySkas.driveTargetFolderPath.join(' / ');
      const savedLinkedPaths =
        Array.isArray(driveRes.linkedPaths) && driveRes.linkedPaths.length > 0
          ? driveRes.linkedPaths
          : [primarySkas, ...resolvedSokonganSkasList].map((s) =>
              s.driveTargetFolderPath.join(' / ')
            );

      // Also save record to `ai_setiausaha_documents` so Radar Evidens SKPM counts this evidence
      const setiausahaDoc: AISetiausahaDocument = {
        id: docId,
        docKind: 'OPR', // Counted in Radar Evidens SKPM alongside OPR evidences
        sourceModule: 'PENJANA_SIJIL_RASMI',
        schoolCode: effectiveSchoolCode,
        academicYear: selectedAcademicYear,
        academicYears: [selectedAcademicYear],
        pillar:
          primarySkas.standardGroup === 'Std 3.2'
            ? 'KOKURIKULUM'
            : primarySkas.standardGroup === 'Std 3.3'
            ? 'HEM'
            : primarySkas.standardGroup === 'Std 3.1'
            ? 'KURIKULUM'
            : 'PENTADBIRAN',
        kodMySG: primarySkas.subStandardCode,
        jawatankuasaInduk: 'Penjana Sijil Rasmi Sekolah',
        jawatanRasmi: 'Setiausaha / Penyelaras Sijil',
        standardGroup: primarySkas.standardGroup,
        subStandardCode: primarySkas.subStandardCode,
        subStandardTitle: primarySkas.subStandardTitle,
        standards: skasStandardsPayload,
        secondarySkpmBucket: resolvedSokonganSkasList[0]?.standardGroup,
        additionalSkpmBuckets: resolvedSokonganSkasList.map((s) => s.standardGroup),
        driveTargetFolderPath: primarySkas.driveTargetFolderPath,
        linkedPaths: savedLinkedPaths,
        skpmBucket: primarySkas.standardGroup,
        skpmCodeBadge: skasStandardsPayload.map((s) => s.subStandardCode).join(' + '),
        skpmStandard: primarySkas.standardFullTitle,
        skpmAspek: `SUB-STANDARD ${primarySkas.subStandardCode}: ${primarySkas.subStandardTitle.toUpperCase()}`,
        skpmStandardKualiti: primarySkas.kualitiStatement,
        programTitle: `[${jenisSijil}] ${temaSijil.trim().toUpperCase()}`,
        tarikh: effectiveTarikh,
        sasaran: `${activeRecipients.length} Penerima (${kategoriPenerima})`,
        rawNotes: recipientSummary,
        objektif: [`Menganugerahkan ${jenisSijil} kepada ${activeRecipients.length} penerima.`],
        pengisianAktiviti: activeRecipients
          .slice(0, 12)
          .map(
            (r, idx) =>
              `${idx + 1}. ${r.name}${r.className ? ` (${r.className})` : ''}${
                r.awardOrRole ? ` — ${r.awardOrRole}` : ''
              }`
          ),
        impak: [
          `Mengiktiraf pencapaian, penglibatan dan sumbangan warga sekolah / rakan strategik (${primarySkas.subStandardCode}).`,
        ],
        refleksiDanTindakanSusulan: [
          `Sijil rasmi dijana melalui iSEPADU AI (${TEMPLATE_CATALOG.find((t) => t.id === selectedTemplate)?.name}).`,
        ],
        preparedByName: (currentUser?.name || primarySignerName || 'SETIAUSAHA').toUpperCase(),
        preparedByTitle: 'Penyelaras Sijil Rasmi Sekolah',
        folderUrl: driveRes.folderUrl || '',
        fileUrl: driveRes.fileUrl || '',
        folderPath: savedFolderPath,
        driveFolderUrl: driveRes.folderUrl || '',
        driveFileUrl: driveRes.fileUrl || '',
        driveFolderPath: savedFolderPath,
        driveSyncedAt: nowIso,
        createdBy: currentUser?.email || currentUser?.uid || 'guru',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await setDoc(
        doc(db, 'ai_setiausaha_documents', docId),
        deepSanitizeFirestore(setiausahaDoc),
        { merge: true }
      );

      onArchiveSuccess?.();

      if (driveRes.success) {
        setStatusNotice({
          type: 'success',
          text: `☁️ ${activeRecipients.length} keping ${jenisSijil} berjaya diarkibkan ke Google Drive Sekolah (${savedLinkedPaths.join(' | ')}) & dikemas kini dalam Radar Evidens SKAS!`,
        });
      } else {
        setStatusNotice({
          type: 'info',
          text: `Rekod Sijil telah disimpan ke Radar Evidens SKAS (${primarySkas.subStandardCode}). Status Drive: ${driveRes.error || 'Sila semak sambungan Webhook.'}`,
        });
      }
    } catch (err: any) {
      setStatusNotice({
        type: 'error',
        text: `Gagal mengarkibkan sijil: ${err?.message || 'Ralat rangkaian'}`,
      });
    } finally {
      setIsArchivingDrive(false);
    }
  };

  // Render pure CSS + SVG vector border & background decorations for each of the 7 templates
  const renderCertificateArtLayer = (templateId: SijilTemplateId) => {
    if (templateId === 'T7_TANPA_BINGKAI') {
      return null;
    }

    if (templateId === 'T1_KLASIK_DIRAJA') {
      return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Outer Maroon & Champagne Gold Double Border */}
          <div className="absolute inset-3 border-[3.5px] border-[#7C1D26] rounded-sm" />
          <div className="absolute inset-[18px] border-[1.5px] border-[#C59B27]" />
          <div className="absolute inset-[22px] border border-[#7C1D26]/40" />

          {/* 4 Corner Classical Filigree Scrollwork SVGs */}
          {[
            'top-3.5 left-3.5',
            'top-3.5 right-3.5 scale-x-[-1]',
            'bottom-3.5 left-3.5 scale-y-[-1]',
            'bottom-3.5 right-3.5 scale-x-[-1] scale-y-[-1]',
          ].map((pos, idx) => (
            <svg
              key={idx}
              viewBox="0 0 100 100"
              className={`absolute w-20 h-20 ${pos}`}
              fill="none"
            >
              <path
                d="M4 4 H55 C35 12 22 25 14 45 C10 25 18 12 4 4 Z"
                fill="#7C1D26"
              />
              <path
                d="M8 8 H72 M8 8 V72"
                stroke="#C59B27"
                strokeWidth="2.5"
              />
              <path
                d="M14 14 C34 14 44 26 32 38 C22 48 14 36 24 26 C30 20 38 26 34 33"
                stroke="#C59B27"
                strokeWidth="1.8"
                fill="none"
              />
              <circle cx="14" cy="14" r="3.5" fill="#C59B27" />
              <circle cx="48" cy="14" r="2" fill="#7C1D26" />
              <circle cx="14" cy="48" r="2" fill="#7C1D26" />
            </svg>
          ))}

          {/* Bottom Royal Gold Seal Watermark */}
          <svg
            viewBox="0 0 120 120"
            className="absolute bottom-6 left-1/2 -translate-x-1/2 w-20 h-20 opacity-20"
          >
            <polygon
              points="60,4 73,20 93,14 96,34 115,42 106,60 115,78 96,86 93,106 73,100 60,116 47,100 27,106 24,86 5,78 14,60 5,42 24,34 27,14 47,20"
              fill="#C59B27"
              stroke="#7C1D26"
              strokeWidth="2"
            />
            <circle cx="60" cy="60" r="36" fill="none" stroke="#7C1D26" strokeWidth="2.5" />
            <circle cx="60" cy="60" r="30" fill="none" stroke="#7C1D26" strokeWidth="1" strokeDasharray="3 3" />
          </svg>
        </div>
      );
    }

    if (templateId === 'T2_MODEN_KORPORAT') {
      return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Deep Navy & Liquid Gold Geometric Frame */}
          <div className="absolute inset-3.5 border-[3px] border-[#0F294A]" />
          <div className="absolute inset-[20px] border-[1.5px] border-[#D4AF37]" />

          {/* Top & Bottom Navy-Gold Geometric Corner Ribbons */}
          <svg viewBox="0 0 220 120" className="absolute top-0 left-0 w-44 h-24">
            <polygon points="0,0 190,0 130,18 18,75 0,105" fill="#0F294A" />
            <polygon points="0,0 145,0 95,12 12,55 0,75" fill="#D4AF37" opacity="0.85" />
            <polygon points="0,0 110,0 70,8 8,36 0,50" fill="#1E3A8A" />
          </svg>
          <svg viewBox="0 0 220 120" className="absolute top-0 right-0 w-44 h-24 scale-x-[-1]">
            <polygon points="0,0 190,0 130,18 18,75 0,105" fill="#0F294A" />
            <polygon points="0,0 145,0 95,12 12,55 0,75" fill="#D4AF37" opacity="0.85" />
          </svg>
          <svg viewBox="0 0 220 120" className="absolute bottom-0 left-0 w-40 h-20 scale-y-[-1]">
            <polygon points="0,0 160,0 110,15 15,65 0,90" fill="#0F294A" />
            <polygon points="0,0 120,0 80,10 10,45 0,65" fill="#D4AF37" opacity="0.85" />
          </svg>
          <svg viewBox="0 0 220 120" className="absolute bottom-0 right-0 w-40 h-20 scale-x-[-1] scale-y-[-1]">
            <polygon points="0,0 160,0 110,15 15,65 0,90" fill="#0F294A" />
            <polygon points="0,0 120,0 80,10 10,45 0,65" fill="#D4AF37" opacity="0.85" />
          </svg>
        </div>
      );
    }

    if (templateId === 'T3_HARMONI_SJKC') {
      return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Crimson Oriental Fretwork & Imperial Gold Frame */}
          <div className="absolute inset-3.5 border-[3px] border-[#991B1B]" />
          <div className="absolute inset-[19px] border-[1.5px] border-[#D97706]" />
          <div className="absolute inset-[23px] border border-[#991B1B]/30" />

          {/* 4 Chinese Huiwen (回纹) Fretwork Corners */}
          {[
            'top-3.5 left-3.5',
            'top-3.5 right-3.5 scale-x-[-1]',
            'bottom-3.5 left-3.5 scale-y-[-1]',
            'bottom-3.5 right-3.5 scale-x-[-1] scale-y-[-1]',
          ].map((pos, idx) => (
            <svg
              key={idx}
              viewBox="0 0 90 90"
              className={`absolute w-16 h-16 ${pos}`}
              fill="none"
            >
              <path
                d="M4 4 H54 V20 H20 V54 H4 Z"
                fill="#991B1B"
                opacity="0.12"
              />
              <path
                d="M4 4 H56 V16 H44 V10 H10 V44 H16 V56 H4 Z"
                stroke="#991B1B"
                strokeWidth="2.2"
                fill="none"
              />
              <path
                d="M16 16 H38 V28 H26 V22 H22 V26 H28 V38 H16 Z"
                stroke="#D97706"
                strokeWidth="1.8"
                fill="none"
              />
              <rect x="4" y="4" width="6" height="6" fill="#D97706" />
            </svg>
          ))}
        </div>
      );
    }

    if (templateId === 'T4_FUTURISTIK_STEM') {
      return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Cyan, Cobalt Blue & Gold Tech Circuit Border */}
          <div className="absolute inset-3.5 border-[2.5px] border-[#0284C7]" />
          <div className="absolute inset-[19px] border border-[#D4AF37]" />

          {/* Top-Left & Bottom-Right Futuristic Hexagon Nodes */}
          <svg viewBox="0 0 200 120" className="absolute top-3 left-3 w-48 h-28" fill="none">
            <polyline
              points="0,42 38,42 54,18 118,18"
              stroke="#0284C7"
              strokeWidth="2"
            />
            <polyline
              points="0,26 26,26 42,6 155,6"
              stroke="#D4AF37"
              strokeWidth="1.5"
            />
            <circle cx="118" cy="18" r="3.5" fill="#0284C7" />
            <circle cx="155" cy="6" r="3" fill="#D4AF37" />
            <polygon
              points="24,54 34,48 44,54 44,66 34,72 24,66"
              stroke="#0284C7"
              strokeWidth="1.8"
              fill="#E0F2FE"
            />
            <polygon
              points="46,42 54,37 62,42 62,51 54,56 46,51"
              stroke="#D4AF37"
              strokeWidth="1.5"
              fill="#FEF9C3"
            />
          </svg>

          <svg
            viewBox="0 0 200 120"
            className="absolute bottom-3 right-3 w-48 h-28 scale-x-[-1] scale-y-[-1]"
            fill="none"
          >
            <polyline
              points="0,42 38,42 54,18 118,18"
              stroke="#0284C7"
              strokeWidth="2"
            />
            <polyline
              points="0,26 26,26 42,6 155,6"
              stroke="#D4AF37"
              strokeWidth="1.5"
            />
            <circle cx="118" cy="18" r="3.5" fill="#0284C7" />
            <circle cx="155" cy="6" r="3" fill="#D4AF37" />
            <polygon
              points="24,54 34,48 44,54 44,66 34,72 24,66"
              stroke="#0284C7"
              strokeWidth="1.8"
              fill="#E0F2FE"
            />
          </svg>
        </div>
      );
    }

    if (templateId === 'T5_ZAMRUD_EMAS') {
      return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Deep Emerald & Matte Gold Botanical Double Frame */}
          <div className="absolute inset-3.5 border-[3px] border-[#064E3B]" />
          <div className="absolute inset-[19px] border-[1.5px] border-[#B48A18]" />

          {/* Botanical Leaf Vein Corner Accents */}
          {[
            'top-4 left-4',
            'top-4 right-4 scale-x-[-1]',
            'bottom-4 left-4 scale-y-[-1]',
            'bottom-4 right-4 scale-x-[-1] scale-y-[-1]',
          ].map((pos, idx) => (
            <svg
              key={idx}
              viewBox="0 0 90 90"
              className={`absolute w-16 h-16 ${pos}`}
              fill="none"
            >
              <path
                d="M6 52 C6 22 22 6 52 6"
                stroke="#064E3B"
                strokeWidth="2.2"
              />
              <path
                d="M14 60 C14 28 28 14 60 14"
                stroke="#B48A18"
                strokeWidth="1.5"
              />
              <path
                d="M16 16 C26 10 34 16 28 26 C20 32 12 24 16 16 Z"
                fill="#064E3B"
                opacity="0.85"
              />
              <path
                d="M34 10 C42 6 48 11 43 18 C37 22 31 16 34 10 Z"
                fill="#B48A18"
              />
              <path
                d="M10 34 C6 42 11 48 18 43 C22 37 16 31 10 34 Z"
                fill="#B48A18"
              />
            </svg>
          ))}
        </div>
      );
    }

    if (templateId === 'T6_MINIMALIS_PRESTIJ') {
      return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Left Architectural Charcoal & Brushed Gold Vertical Sash */}
          <div className="absolute top-0 bottom-0 left-0 w-7 bg-[#1E293B]" />
          <div className="absolute top-0 bottom-0 left-7 w-2 bg-gradient-to-b from-[#D4AF37] via-[#FDE047] to-[#B48A18]" />
          <div className="absolute top-5 bottom-5 left-11 right-5 border border-[#1E293B]/25" />

          {/* Bottom-Right Prestige Gold Medallion Seal */}
          <svg
            viewBox="0 0 100 100"
            className="absolute bottom-7 right-8 w-16 h-16 opacity-35"
          >
            <circle cx="50" cy="50" r="42" fill="none" stroke="#B48A18" strokeWidth="2.5" />
            <circle cx="50" cy="50" r="35" fill="none" stroke="#1E293B" strokeWidth="1.2" strokeDasharray="4 2" />
            <polygon
              points="50,20 57,38 76,38 61,49 66,68 50,57 34,68 39,49 24,38 43,38"
              fill="#D4AF37"
            />
          </svg>
        </div>
      );
    }

    return null;
  };

  // Render a single A4 Certificate sheet (used both in live preview and batch print container)
  const renderSingleCertificatePage = (
    recipient: SijilRecipientItem,
    index: number,
    isPrintBatch: boolean
  ) => {
    const serialNumber = `${serialPrefix}${String(serialStartNum + index).padStart(3, '0')}`;
    const formattedDate = formatTarikhMelayu(tarikhSijil);
    const isLandscape = orientation === 'landscape';
    const isSjkcBilingual = selectedTemplate === 'T3_HARMONI_SJKC';
    const isMinimalis = selectedTemplate === 'T6_MINIMALIS_PRESTIJ';
    const isBlankPaper = selectedTemplate === 'T7_TANPA_BINGKAI';

    // Theme accent colors per template
    const theme = (() => {
      switch (selectedTemplate) {
        case 'T1_KLASIK_DIRAJA':
          return {
            titleColor: 'text-[#7C1D26]',
            accentLine: 'bg-gradient-to-r from-transparent via-[#C59B27] to-transparent',
            recipientColor: 'text-[#1E293B]',
            awardBadge: 'bg-[#7C1D26] text-[#FDE047] border border-[#C59B27]',
          };
        case 'T2_MODEN_KORPORAT':
          return {
            titleColor: 'text-[#0F294A]',
            accentLine: 'bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent',
            recipientColor: 'text-[#0F294A]',
            awardBadge: 'bg-[#0F294A] text-[#FDE047] border border-[#D4AF37]',
          };
        case 'T3_HARMONI_SJKC':
          return {
            titleColor: 'text-[#991B1B]',
            accentLine: 'bg-gradient-to-r from-transparent via-[#D97706] to-transparent',
            recipientColor: 'text-[#7F1D1D]',
            awardBadge: 'bg-[#991B1B] text-[#FEF08A] border border-[#D97706]',
          };
        case 'T4_FUTURISTIK_STEM':
          return {
            titleColor: 'text-[#0369A1]',
            accentLine: 'bg-gradient-to-r from-transparent via-[#0284C7] to-transparent',
            recipientColor: 'text-[#0F172A]',
            awardBadge: 'bg-[#0284C7] text-white border border-[#D4AF37]',
          };
        case 'T5_ZAMRUD_EMAS':
          return {
            titleColor: 'text-[#064E3B]',
            accentLine: 'bg-gradient-to-r from-transparent via-[#B48A18] to-transparent',
            recipientColor: 'text-[#064E3B]',
            awardBadge: 'bg-[#064E3B] text-[#FDE047] border border-[#B48A18]',
          };
        case 'T6_MINIMALIS_PRESTIJ':
          return {
            titleColor: 'text-[#1E293B]',
            accentLine: 'bg-gradient-to-r from-[#D4AF37] via-[#1E293B]/40 to-transparent',
            recipientColor: 'text-[#0F172A]',
            awardBadge: 'bg-[#1E293B] text-[#FDE047] border border-[#D4AF37]',
          };
        default:
          return {
            titleColor: 'text-slate-900',
            accentLine: 'bg-slate-400',
            recipientColor: 'text-slate-950',
            awardBadge: 'bg-slate-900 text-white border border-slate-700',
          };
      }
    })();

    return (
      <div
        key={`${recipient.id}_${index}`}
        style={{
          width: isLandscape ? '277mm' : '198mm',
          height: isLandscape ? '190mm' : '285mm',
          maxHeight: isLandscape ? '190mm' : '285mm',
          pageBreakAfter:
            isPrintBatch && index < activeRecipients.length - 1 ? 'always' : 'avoid',
          breakAfter:
            isPrintBatch && index < activeRecipients.length - 1 ? 'page' : 'avoid',
          pageBreakInside: 'avoid',
          breakInside: 'avoid',
        }}
        className={`relative bg-white text-slate-900 mx-auto overflow-hidden box-border flex flex-col justify-between select-none ${
          isPrintBatch ? '' : 'shadow-2xl rounded-xl border border-slate-300'
        } ${
          isLandscape
            ? isMinimalis
              ? 'pl-16 pr-12 py-8'
              : 'px-14 py-8'
            : isMinimalis
            ? 'pl-16 pr-10 py-11'
            : 'px-12 py-11'
        }`}
      >
        {/* Vector Border & Ornament Art Layer */}
        {renderCertificateArtLayer(selectedTemplate)}

        {/* Top-Right Serial Number */}
        {showSerialNumber && (
          <div className="absolute top-6 right-8 z-10 text-right">
            <span className="text-[10px] font-mono font-bold tracking-wider text-slate-600 bg-white/80 px-2 py-0.5 rounded">
              No. Siri: {serialNumber}
            </span>
          </div>
        )}

        {/* 1. OFFICIAL SCHOOL HEADER */}
        <div
          className={`relative z-10 flex flex-col ${
            isMinimalis ? 'items-start text-left' : 'items-center text-center'
          } ${isLandscape ? 'space-y-1' : 'space-y-1.5'} pt-1`}
        >
          <SchoolLogo
            src={effectiveSchoolLogo}
            schoolCode={effectiveSchoolCode}
            className={`${
              isLandscape ? 'w-14 h-14' : 'w-16 h-16'
            } bg-white border-slate-200 shadow-sm mb-0.5`}
          />
          <div className="text-[10.5px] font-extrabold uppercase tracking-[0.22em] text-slate-600">
            KEMENTERIAN PENDIDIKAN MALAYSIA
          </div>
          <div className="text-sm sm:text-base font-black uppercase tracking-wider text-slate-900 leading-tight">
            {effectiveSchoolName}
          </div>
          {isSjkcBilingual && schoolChineseName && (
            <div className="text-base font-black tracking-[0.25em] text-[#991B1B] leading-tight">
              {schoolChineseName}
            </div>
          )}
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
            KOD SEKOLAH: {effectiveSchoolCode}
          </div>
        </div>

        {/* 2. CERTIFICATE TITLE & RECIPIENT CITATION BODY */}
        <div
          className={`relative z-10 flex-1 flex flex-col justify-center ${
            isMinimalis ? 'items-start text-left' : 'items-center text-center'
          } ${isLandscape ? 'my-2 space-y-2.5' : 'my-4 space-y-4'}`}
        >
          {/* Main Certificate Title */}
          <div className="w-full space-y-1.5">
            <h1
              style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
              className={`${
                isLandscape ? 'text-3xl' : 'text-4xl'
              } font-black uppercase tracking-[0.12em] ${theme.titleColor}`}
            >
              {jenisSijil}
            </h1>
            <div
              className={`h-[2px] ${
                isMinimalis ? 'w-48' : 'w-64 mx-auto'
              } ${theme.accentLine}`}
            />
          </div>

          {/* Intro Line */}
          <p className="text-xs sm:text-sm italic text-slate-700 font-medium max-w-xl">
            {introText}
          </p>

          {/* Recipient Name + MyKid/Jawatan + Class */}
          <div
            className={`w-full ${
              isMinimalis ? 'border-l-4 border-[#D4AF37] pl-4' : ''
            } py-1 space-y-1`}
          >
            <div
              className={`${
                isLandscape ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'
              } font-black uppercase tracking-wide ${theme.recipientColor} leading-snug`}
            >
              {recipient.name}
            </div>
            {(recipient.identifier || recipient.className) && (
              <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
                {[recipient.identifier, recipient.className].filter(Boolean).join('  •  ')}
              </div>
            )}
          </div>

          {/* Optional Award / Achievement / Role Highlight Pill */}
          {recipient.awardOrRole && (
            <div className="pt-0.5">
              <div
                className={`inline-block px-5 py-1.5 rounded-full text-xs sm:text-sm font-black uppercase tracking-widest shadow-sm ${
                  isBlankPaper
                    ? 'border-2 border-slate-900 text-slate-950'
                    : theme.awardBadge
                }`}
              >
                {recipient.awardOrRole}
              </div>
            </div>
          )}

          {/* Body Citation Text (Multiline preserved) */}
          <div className="max-w-2xl px-2 space-y-1">
            {bodyCitationText
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line, i) => {
                const isQuotedTheme =
                  line.startsWith('"') ||
                  line.startsWith('“') ||
                  line === temaSijil.trim().toUpperCase();
                return (
                  <p
                    key={i}
                    className={`${
                      isQuotedTheme
                        ? 'text-sm sm:text-base font-black uppercase tracking-wide text-slate-900 py-0.5'
                        : 'text-xs sm:text-[13px] font-medium text-slate-700 leading-relaxed'
                    }`}
                  >
                    {line}
                  </p>
                );
              })}
          </div>

          {/* Optional Date Line (Completely hidden if tarikhSijil is empty!) */}
          {formattedDate && (
            <div className="pt-1 text-xs font-bold text-slate-700 tracking-wide">
              Tarikh: <span className="font-black text-slate-900">{formattedDate}</span>
            </div>
          )}
        </div>

        {/* 3. MOTTO & SIGNATURE BLOCK */}
        <div className="relative z-10 w-full space-y-3 pb-1">
          {customMottoText.trim() && (
            <div
              className={`text-[10.5px] font-black uppercase tracking-[0.16em] text-slate-700 ${
                isMinimalis ? 'text-left' : 'text-center'
              }`}
            >
              {customMottoText}
            </div>
          )}

          {isDualSignature ? (
            <div className="grid grid-cols-2 gap-10 pt-3 px-4 items-end">
              {/* Left Signer: LPS / PIBG */}
              <div className="text-center flex flex-col items-center">
                <div className="h-12 flex items-end justify-center mb-1">
                  {secondarySignaturePng && (
                    <img
                      src={secondarySignaturePng}
                      alt="Tandatangan 2"
                      className="max-h-12 max-w-[150px] object-contain"
                    />
                  )}
                </div>
                <div className="w-52 border-b-[1.5px] border-slate-800 mb-1.5" />
                <div className="text-xs font-black uppercase text-slate-900">
                  ({secondarySignerName || 'PENGERUSI LPS / YDP PIBG'})
                </div>
                <div className="text-[10.5px] font-bold text-slate-600">
                  {secondarySignerTitle}
                </div>
                <div className="text-[10px] font-semibold text-slate-500">
                  {effectiveSchoolName}
                </div>
              </div>

              {/* Right Signer: Guru Besar */}
              <div className="text-center flex flex-col items-center">
                <div className="h-12 flex items-end justify-center mb-1">
                  {primarySignaturePng && (
                    <img
                      src={primarySignaturePng}
                      alt="Tandatangan 1"
                      className="max-h-12 max-w-[150px] object-contain"
                    />
                  )}
                </div>
                <div className="w-52 border-b-[1.5px] border-slate-800 mb-1.5" />
                <div className="text-xs font-black uppercase text-slate-900">
                  ({primarySignerName || principalName})
                </div>
                <div className="text-[10.5px] font-bold text-slate-600">
                  {primarySignerTitle}
                </div>
                <div className="text-[10px] font-semibold text-slate-500">
                  {effectiveSchoolName}
                </div>
              </div>
            </div>
          ) : (
            <div
              className={`flex flex-col ${
                isMinimalis ? 'items-end pr-6' : 'items-center'
              } pt-3`}
            >
              <div className="text-center flex flex-col items-center">
                <div className="h-12 flex items-end justify-center mb-1">
                  {primarySignaturePng && (
                    <img
                      src={primarySignaturePng}
                      alt="Tandatangan"
                      className="max-h-12 max-w-[160px] object-contain"
                    />
                  )}
                </div>
                <div className="w-56 border-b-[1.5px] border-slate-800 mb-1.5" />
                <div className="text-xs font-black uppercase text-slate-900">
                  ({primarySignerName || principalName})
                </div>
                <div className="text-[10.5px] font-bold text-slate-600">
                  {primarySignerTitle}
                </div>
                <div className="text-[10px] font-semibold text-slate-500">
                  {effectiveSchoolName}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const currentPreviewRecipient =
    activeRecipients[previewIndex] || activeRecipients[0];

  return (
    <div className="space-y-6">
      {/* ====================================================================
          SECTION I: 6 VECTOR CERTIFICATE TEMPLATES + 1 BLANK PRE-PRINTED MODE
         ==================================================================== */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <Award className="w-4 h-4" />
              <span>
                GALERI TEMPLAT SIJIL VEKTOR RASMI KPM (6 TEMPLAT HD + 1 MOD KERTAS PRA-CETAK)
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Dirender 100% menggunakan CSS + SVG Vektor tajam tanpa piksel kabur untuk cetakan A4 Portrait atau Landscape.
            </p>
          </div>

          {/* Orientation Toggle + Serial Number Toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl bg-slate-950 p-1 border border-slate-800">
              <button
                type="button"
                onClick={() => setOrientation('portrait')}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase transition cursor-pointer ${
                  orientation === 'portrait'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                📄 A4 Portrait (竖版)
              </button>
              <button
                type="button"
                onClick={() => setOrientation('landscape')}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase transition cursor-pointer ${
                  orientation === 'landscape'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                🖼️ A4 Landscape (横版)
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowSerialNumber((v) => !v)}
              className={`px-3 py-2 rounded-xl border text-[11px] font-black uppercase flex items-center gap-1.5 transition cursor-pointer ${
                showSerialNumber
                  ? 'bg-teal-950/90 border-teal-500/60 text-teal-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}
            >
              <Hash className="w-3.5 h-3.5" />
              <span>No. Siri Auto: {showSerialNumber ? 'AKTIF' : 'TUTUP'}</span>
            </button>
          </div>
        </div>

        {/* 7 Visual Template Thumbnail Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2.5">
          {TEMPLATE_CATALOG.map((tpl) => {
            const active = selectedTemplate === tpl.id;
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => setSelectedTemplate(tpl.id)}
                className={`text-left p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                  active
                    ? 'bg-slate-800/95 border-amber-400 ring-2 ring-amber-400/30 shadow-lg'
                    : 'bg-slate-950/90 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="space-y-1.5">
                  {/* Mini Visual Certificate Thumbnail */}
                  <div
                    className={`h-14 w-full rounded-lg bg-gradient-to-br ${tpl.previewBg} border-2 ${tpl.previewBorder} p-1.5 flex flex-col items-center justify-center relative overflow-hidden`}
                  >
                    <div className="w-3 h-3 rounded-full bg-slate-800/20 mb-0.5" />
                    <div className="w-12 h-1 rounded bg-slate-800/50 mb-0.5" />
                    <div className="w-8 h-0.5 rounded bg-amber-600/60" />
                    {active && (
                      <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${tpl.badgeColor}`}
                    >
                      {tpl.code}
                    </span>
                    {active && (
                      <span className="text-[9px] font-black text-amber-400">DIPILIH ✓</span>
                    )}
                  </div>

                  <div className="text-xs font-black text-white leading-snug">
                    {tpl.name}
                  </div>
                  <div className="text-[10px] font-bold text-amber-300/90 leading-tight">
                    {tpl.nameZh}
                  </div>
                </div>
                <div className="text-[9.5px] text-slate-400 leading-tight line-clamp-2">
                  {tpl.desc}
                </div>
              </button>
            );
          })}
        </div>

        {/* Serial Number Customization Bar + Bilingual Chinese School Title Input (when Template 3 is active) */}
        {(showSerialNumber || selectedTemplate === 'T3_HARMONI_SJKC') && (
          <div className="pt-2 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {showSerialNumber && (
              <>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Awalan No. Siri (Prefix)
                  </label>
                  <input
                    type="text"
                    value={serialPrefix}
                    onChange={(e) => setSerialPrefix(e.target.value.toUpperCase())}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-teal-300"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    No. Urutan Bermula Dari
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={serialStartNum}
                    onChange={(e) =>
                      setSerialStartNum(Math.max(1, parseInt(e.target.value, 10) || 1))
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-white"
                  />
                </div>
              </>
            )}
            {selectedTemplate === 'T3_HARMONI_SJKC' && (
              <div>
                <label className="block text-[10px] font-black uppercase text-rose-300 mb-1">
                  Tajuk Dwibahasa SJKC (华文校名抬头)
                </label>
                <input
                  type="text"
                  value={schoolChineseName}
                  onChange={(e) => setSchoolChineseName(e.target.value)}
                  className="w-full bg-slate-950 border border-rose-500/40 rounded-xl px-3 py-1.5 text-xs font-bold text-rose-200"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status Notice Banner */}
      {statusNotice && (
        <div
          className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-xs font-bold ${
            statusNotice.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-200'
              : statusNotice.type === 'error'
              ? 'bg-rose-950/80 border-rose-500/60 text-rose-200'
              : 'bg-indigo-950/80 border-indigo-500/60 text-indigo-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusNotice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusNotice(null)}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ====================================================================
          SECTION II: LEFT 6-STEP CONFIGURATOR + RIGHT WYSIWYG A4 LIVE PREVIEW
         ==================================================================== */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: 6-STEP CERTIFICATE BUILDER */}
        <div className="xl:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              <span>KONFIGURASI 6 LANGKAH PENJANA SIJIL RASMI</span>
            </h3>
            <span className="px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[10px] font-black">
              {activeRecipients.length} Sijil Dijana
            </span>
          </div>

          {/* ---------------- LANGKAH 1: JENIS SIJIL ---------------- */}
          <div className="space-y-2">
            <label className="block text-[11px] font-black uppercase tracking-wider text-teal-300">
              Langkah 1 — Jenis Sijil (4 Kategori Rasmi)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {JENIS_SIJIL_OPTIONS.map((opt) => {
                const active = jenisSijil === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectJenisSijil(opt.id)}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                      active
                        ? 'bg-teal-950 border-teal-400 text-white shadow'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-[11px] font-black uppercase text-white">
                      {opt.id}
                    </div>
                    <div className="text-[10px] text-teal-300 font-bold">
                      {opt.labelZh}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ---------------- LANGKAH 2: KATEGORI PENERIMA ---------------- */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <label className="block text-[11px] font-black uppercase tracking-wider text-teal-300">
              Langkah 2 — Kategori Penerima
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  id: 'MURID' as KategoriPenerimaType,
                  label: 'Murid',
                  sub: '学生名册',
                  icon: GraduationCap,
                },
                {
                  id: 'GURU_AKP' as KategoriPenerimaType,
                  label: 'Guru / AKP',
                  sub: '教职员名册',
                  icon: UserCheck,
                },
                {
                  id: 'PIHAK_LUAR' as KategoriPenerimaType,
                  label: 'Pihak Luar',
                  sub: '外部嘉宾/机构',
                  icon: Building2,
                },
              ].map((kat) => {
                const Icon = kat.icon;
                const active = kategoriPenerima === kat.id;
                return (
                  <button
                    key={kat.id}
                    type="button"
                    onClick={() => {
                      setKategoriPenerima(kat.id);
                      setPreviewIndex(0);
                      setBodyCitationText(
                        buildAutoCitationParagraph({
                          jenisSijil,
                          kategori: kat.id,
                          tema: temaSijil,
                          academicYear: selectedAcademicYear,
                        })
                      );
                    }}
                    className={`p-2.5 rounded-xl border text-center transition cursor-pointer flex flex-col items-center gap-1 ${
                      active
                        ? 'bg-indigo-950 border-indigo-400 text-white shadow'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <Icon className="w-4 h-4 text-amber-400" />
                    <div className="text-[11px] font-black">{kat.label}</div>
                    <div className="text-[9.5px] text-slate-400">{kat.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ---------------- LANGKAH 3: PILIH NAMA PENERIMA ---------------- */}
          <div className="space-y-2.5 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-black uppercase tracking-wider text-teal-300">
                Langkah 3 — Pilih Nama Penerima (Individu / Pukal)
              </label>
              <span className="text-[10px] font-bold text-amber-300">
                Dipilih: {activeRecipients.length} orang
              </span>
            </div>

            {/* CASE A: MURID (student_master) */}
            {kategoriPenerima === 'MURID' && (
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                {/* Class Filter Pills */}
                <div className="flex flex-wrap gap-1">
                  {[
                    'SEMUA',
                    'Prasekolah',
                    'Tahun 1',
                    'Tahun 2',
                    'Tahun 3',
                    'Tahun 4',
                    'Tahun 5',
                    'Tahun 6',
                  ].map((cls) => (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => setStudentClassFilter(cls)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition cursor-pointer ${
                        studentClassFilter === cls
                          ? 'bg-teal-500 text-slate-950'
                          : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {cls}
                    </button>
                  ))}
                </div>

                {/* Search + Select All / Clear */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={studentSearchQuery}
                      onChange={(e) => setStudentSearchQuery(e.target.value)}
                      placeholder="Cari nama murid atau No. MyKid..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedStudentIds(filteredStudents.map((s) => s.id))
                    }
                    className="px-2.5 py-1.5 rounded-xl bg-teal-950 border border-teal-600/50 text-teal-300 text-[10px] font-black cursor-pointer"
                  >
                    Pilih Semua ({filteredStudents.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedStudentIds([])}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-[10px] font-bold cursor-pointer"
                  >
                    Kosongkan
                  </button>
                </div>

                {/* Student Checklist with optional per-student Award selector */}
                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                  {loadingStudents ? (
                    <div className="text-xs text-slate-400 py-4 text-center">
                      Memuatkan data student_master...
                    </div>
                  ) : filteredStudents.length === 0 ? (
                    <div className="text-xs text-slate-400 py-4 text-center">
                      Tiada murid ditemui dalam kategori ini.
                    </div>
                  ) : (
                    filteredStudents.map((stu) => {
                      const isChecked = selectedStudentIds.includes(stu.id);
                      return (
                        <div
                          key={stu.id}
                          className={`p-2 rounded-xl border transition ${
                            isChecked
                              ? 'bg-teal-950/60 border-teal-500/60'
                              : 'bg-slate-900/70 border-slate-800/80'
                          }`}
                        >
                          <label className="flex items-center justify-between gap-2 cursor-pointer">
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setSelectedStudentIds((prev) =>
                                    prev.includes(stu.id)
                                      ? prev.filter((id) => id !== stu.id)
                                      : [...prev, stu.id]
                                  );
                                }}
                                className="rounded accent-teal-500"
                              />
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-white truncate">
                                  {stu.name}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {stu.className}
                                  {stu.icNumber ? ` • MyKid: ${stu.icNumber}` : ''}
                                </div>
                              </div>
                            </div>
                          </label>

                          {/* Per-Student Award / Pencapaian Input */}
                          {isChecked && (
                            <div className="mt-1.5 pl-5 flex items-center gap-1.5">
                              <input
                                type="text"
                                list="sijil-award-presets"
                                value={studentAwardsMap[stu.id] || ''}
                                onChange={(e) =>
                                  setStudentAwardsMap((prev) => ({
                                    ...prev,
                                    [stu.id]: e.target.value.toUpperCase(),
                                  }))
                                }
                                placeholder={
                                  jenisSijil === 'SIJIL PENCAPAIAN' ||
                                  jenisSijil === 'SIJIL PENGIKTIRAFAN'
                                    ? 'Pilih/Isi Pencapaian (cth: JOHAN / TOKOH MURID / 100%)'
                                    : 'Gelaran / Jawatan Tambahan (Pilihan)'
                                }
                                className="w-full bg-slate-950 border border-amber-500/40 rounded-lg px-2.5 py-1 text-[11px] font-bold text-amber-300"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
                <datalist id="sijil-award-presets">
                  {AWARD_PRESETS.map((aw) => (
                    <option key={aw} value={aw} />
                  ))}
                </datalist>
              </div>
            )}

            {/* CASE B: GURU / AKP (PersonnelProfile) */}
            {kategoriPenerima === 'GURU_AKP' && (
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={teacherSearchQuery}
                      onChange={(e) => setTeacherSearchQuery(e.target.value)}
                      placeholder="Cari nama guru atau AKP..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedTeacherIds(filteredStaff.map((t) => t.id))
                    }
                    className="px-2.5 py-1.5 rounded-xl bg-teal-950 border border-teal-600/50 text-teal-300 text-[10px] font-black cursor-pointer"
                  >
                    Pilih Semua ({filteredStaff.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTeacherIds([])}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-[10px] font-bold cursor-pointer"
                  >
                    Kosongkan
                  </button>
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                  {filteredStaff.map((st) => {
                    const isChecked = selectedTeacherIds.includes(st.id);
                    return (
                      <div
                        key={st.id}
                        className={`p-2 rounded-xl border transition ${
                          isChecked
                            ? 'bg-indigo-950/60 border-indigo-500/60'
                            : 'bg-slate-900/70 border-slate-800/80'
                        }`}
                      >
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setSelectedTeacherIds((prev) =>
                                prev.includes(st.id)
                                  ? prev.filter((id) => id !== st.id)
                                  : [...prev, st.id]
                              );
                            }}
                            className="rounded accent-indigo-500"
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white truncate">
                              {st.name}
                            </div>
                            <div className="text-[10px] text-indigo-300">
                              {st.position}
                            </div>
                          </div>
                        </label>
                        {isChecked && (
                          <div className="mt-1.5 pl-5">
                            <input
                              type="text"
                              value={teacherRolesMap[st.id] || ''}
                              onChange={(e) =>
                                setTeacherRolesMap((prev) => ({
                                  ...prev,
                                  [st.id]: e.target.value.toUpperCase(),
                                }))
                              }
                              placeholder="Peranan / Anugerah Khas (cth: PENYELARAS PROGRAM / GURU INOVATIF)"
                              className="w-full bg-slate-950 border border-amber-500/40 rounded-lg px-2.5 py-1 text-[11px] font-bold text-amber-300"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* CASE C: PIHAK LUAR */}
            {kategoriPenerima === 'PIHAK_LUAR' && (
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="grid grid-cols-1 gap-2">
                  <input
                    type="text"
                    value={extNewName}
                    onChange={(e) => setExtNewName(e.target.value.toUpperCase())}
                    placeholder="Nama Tetamu Kehormat / Penceramah / Agensi Luar..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-bold text-white uppercase"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={extNewTitle}
                      onChange={(e) => setExtNewTitle(e.target.value)}
                      placeholder="Jawatan / Organisasi (Pilihan)"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200"
                    />
                    <input
                      type="text"
                      value={extNewAward}
                      onChange={(e) => setExtNewAward(e.target.value.toUpperCase())}
                      placeholder="Peranan / Gelaran (cth: PERASMI)"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-amber-300 uppercase"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAddExternalRecipient}
                      className="flex-1 py-1.5 px-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah Penerima Luar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBulkExternalInput((v) => !v)}
                      className="py-1.5 px-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 text-[11px] font-bold cursor-pointer"
                    >
                      Tampal Pukal (Bulk)
                    </button>
                  </div>
                </div>

                {showBulkExternalInput && (
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-indigo-500/40 space-y-2">
                    <div className="text-[10px] font-bold text-indigo-300">
                      Tampal senarai penerima (1 baris 1 penerima, format: Nama | Jawatan/Agensi | Gelaran):
                    </div>
                    <textarea
                      rows={3}
                      value={extBulkText}
                      onChange={(e) => setExtBulkText(e.target.value)}
                      placeholder={`YB DATO' SRI ... | Ahli Parlimen | PERASMI MAJLIS\n BALAI BOMBA MUKAH | Jabatan Bomba | RAKAN STRATEGIK 3K`}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleBulkAddExternal}
                      className="w-full py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black cursor-pointer"
                    >
                      Masukkan Semua Baris
                    </button>
                  </div>
                )}

                {/* Current External Recipients List */}
                <div className="max-h-44 overflow-y-auto space-y-1.5">
                  {externalRecipients.map((item, idx) => (
                    <div
                      key={item.id}
                      className="p-2 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">
                          {idx + 1}. {item.name}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {[item.identifier, item.awardOrRole].filter(Boolean).join(' • ')}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setExternalRecipients((prev) =>
                            prev.filter((r) => r.id !== item.id)
                          )
                        }
                        className="text-rose-400 hover:text-rose-300 p-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ---------------- LANGKAH 4: TEMA / TUJUAN SIJIL ---------------- */}
          <div className="space-y-2.5 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-black uppercase tracking-wider text-teal-300">
                Langkah 4 — Tema / Tujuan Sijil &amp; Teks Rasmi
              </label>
              <button
                type="button"
                onClick={() =>
                  setBodyCitationText(
                    buildAutoCitationParagraph({
                      jenisSijil,
                      kategori: kategoriPenerima,
                      tema: temaSijil,
                      academicYear: selectedAcademicYear,
                    })
                  )
                }
                className="text-[10px] font-black text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
              >
                <Sparkles className="w-3 h-3" />
                <span>Jana Semula Ayat Rasmi</span>
              </button>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                Tajuk Program / Pertandingan / Tujuan Sijil
              </label>
              <input
                type="text"
                value={temaSijil}
                onChange={(e) => {
                  const nextTema = e.target.value.toUpperCase();
                  setTemaSijil(nextTema);
                  setBodyCitationText(
                    buildAutoCitationParagraph({
                      jenisSijil,
                      kategori: kategoriPenerima,
                      tema: nextTema,
                      academicYear: selectedAcademicYear,
                    })
                  );
                }}
                placeholder="cth: KEJOHANAN SUKAN TAHUNAN / PROGRAM NILAM / ANUGERAH SAHSIAH TERPUJI"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-black text-white uppercase"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                Ayat Pendahuluan (Boleh Disunting)
              </label>
              <input
                type="text"
                value={introText}
                onChange={(e) => setIntroText(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                Kandungan Penghargaan / Pengesahan Sijil (Boleh Disunting)
              </label>
              <textarea
                rows={3}
                value={bodyCitationText}
                onChange={(e) => setBodyCitationText(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white leading-relaxed"
              />
            </div>
          </div>

          {/* ---------------- LANGKAH 5: TARIKH (TIDAK WAJIB / 选填) ---------------- */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-black uppercase tracking-wider text-teal-300">
                Langkah 5 — Tarikh Sijil (Tidak Wajib / 选填)
              </label>
              {tarikhSijil && (
                <button
                  type="button"
                  onClick={() => setTarikhSijil('')}
                  className="text-[10px] font-bold text-rose-400 hover:text-rose-300 cursor-pointer"
                >
                  Kosongkan (Sembunyi Tarikh)
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
              <input
                type="date"
                value={tarikhSijil}
                onChange={(e) => setTarikhSijil(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
              />
              <div className="text-[10.5px] text-slate-400 leading-snug">
                {tarikhSijil ? (
                  <span>
                    Dicetak sebagai:{' '}
                    <strong className="text-emerald-300">
                      {formatTarikhMelayu(tarikhSijil)}
                    </strong>
                  </span>
                ) : (
                  <span className="text-amber-300/90">
                    ✓ Dibiarkan kosong: Baris tarikh disembunyikan sepenuhnya pada sijil.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ---------------- LANGKAH 6: TANDATANGAN / PENGESAHAN ---------------- */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-black uppercase tracking-wider text-teal-300">
                Langkah 6 — Tandatangan &amp; Pengesahan
              </label>
              <button
                type="button"
                onClick={() => setIsDualSignature((v) => !v)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase border transition cursor-pointer ${
                  isDualSignature
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                {isDualSignature ? '✓ 2 Tandatangan (LPS/PIBG + GB)' : '1 Tandatangan (Guru Besar)'}
              </button>
            </div>

            {/* Primary Signer (Guru Besar / Pentadbir) */}
            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-amber-300">
                  Penandatangan Utama (Guru Besar / Pentadbir)
                </span>
                <select
                  value=""
                  onChange={(e) => {
                    const idx = parseInt(e.target.value, 10);
                    const picked = signerPresets[idx];
                    if (picked) {
                      setPrimarySignerName(picked.name);
                      setPrimarySignerTitle(picked.title);
                    }
                  }}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-0.5 text-[10px] text-teal-300 font-bold"
                >
                  <option value="">Tukar Pentadbir...</option>
                  {signerPresets.map((sp, i) => (
                    <option key={i} value={i}>
                      {sp.name} ({sp.title})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={primarySignerName}
                  onChange={(e) => setPrimarySignerName(e.target.value.toUpperCase())}
                  placeholder="Nama Guru Besar"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-bold text-white uppercase"
                />
                <input
                  type="text"
                  value={primarySignerTitle}
                  onChange={(e) => setPrimarySignerTitle(e.target.value)}
                  placeholder="Jawatan (Guru Besar)"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200"
                />
              </div>

              {/* Optional Transparent PNG Signature Upload */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <label className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] font-bold text-teal-300 flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3 h-3" />
                  <span>Muat Naik PNG Tandatangan (Pilihan)</span>
                  <input
                    type="file"
                    accept="image/png,image/webp,image/jpeg"
                    onChange={(e) =>
                      handleSignatureUpload('PRIMARY', e.target.files?.[0])
                    }
                    className="hidden"
                  />
                </label>
                {primarySignaturePng && (
                  <button
                    type="button"
                    onClick={() => setPrimarySignaturePng('')}
                    className="text-[10px] font-bold text-rose-400 hover:text-rose-300 cursor-pointer"
                  >
                    Padam PNG
                  </button>
                )}
              </div>
            </div>

            {/* Secondary Signer (Pengerusi LPS / YDP PIBG) */}
            {isDualSignature && (
              <div className="p-3 rounded-2xl bg-slate-950 border border-amber-500/30 space-y-2">
                <div className="text-[10px] font-black uppercase text-amber-300">
                  Penandatangan Bersama (Sebelah Kiri: Pengerusi LPS / YDP PIBG)
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={secondarySignerName}
                    onChange={(e) => setSecondarySignerName(e.target.value.toUpperCase())}
                    placeholder="Nama Pengerusi LPS / YDP PIBG"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-bold text-white uppercase"
                  />
                  <input
                    type="text"
                    value={secondarySignerTitle}
                    onChange={(e) => setSecondarySignerTitle(e.target.value)}
                    placeholder="Jawatan (Pengerusi LPS / YDP PIBG)"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200"
                  />
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <label className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] font-bold text-amber-300 flex items-center gap-1.5 cursor-pointer">
                    <Upload className="w-3 h-3" />
                    <span>Muat Naik PNG Tandatangan Kedua</span>
                    <input
                      type="file"
                      accept="image/png,image/webp,image/jpeg"
                      onChange={(e) =>
                        handleSignatureUpload('SECONDARY', e.target.files?.[0])
                      }
                      className="hidden"
                    />
                  </label>
                  {secondarySignaturePng && (
                    <button
                      type="button"
                      onClick={() => setSecondarySignaturePng('')}
                      className="text-[10px] font-bold text-rose-400 hover:text-rose-300 cursor-pointer"
                    >
                      Padam PNG
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ---------------- OPTIONAL: ARKIB KE GOOGLE DRIVE (SKAS v3.0) ---------------- */}
          <div className="pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setEnableDriveArchive((v) => !v)}
              className="w-full p-3 rounded-2xl bg-slate-950 border border-indigo-500/40 flex items-center justify-between text-left cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <CloudUpload className="w-4 h-4 text-indigo-400" />
                <div>
                  <div className="text-[11px] font-black uppercase text-indigo-300">
                    Arkib ke Google Drive Sekolah (SKAS v3.0 — Pilihan)
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Tidak wajib untuk cetakan harian. Buka jika mahu simpan evidens ke Drive &amp; Radar SKAS.
                  </div>
                </div>
              </div>
              {enableDriveArchive ? (
                <ChevronUp className="w-4 h-4 text-indigo-300" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {enableDriveArchive && (
              <div className="mt-2.5 p-3.5 rounded-2xl bg-slate-950 border border-indigo-500/40 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-teal-300">
                    1. Standard SKAS Utama (docKind: &quot;SIJIL&quot;)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[9.5px] font-mono font-black">
                    {skasStandardsPayload.map((s) => s.subStandardCode).join(' + ')}
                  </span>
                </div>

                <select
                  value={skasStandardGroup}
                  onChange={(e) => {
                    const nextGrp = e.target.value as SkasStandardGroupKey;
                    setSkasStandardGroup(nextGrp);
                    setSkasSubStandardCode(getSkasGroup(nextGrp).defaultSubStandardCode);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-white"
                >
                  {SKAS_STANDARDS_DICTIONARY.map((g) => (
                    <option key={g.standardGroup} value={g.standardGroup}>
                      {g.dropdownGroupLabel}
                    </option>
                  ))}
                </select>

                <select
                  value={primarySkas.subStandardCode}
                  onChange={(e) => setSkasSubStandardCode(e.target.value)}
                  className="w-full bg-slate-900 border border-teal-500/50 rounded-xl px-3 py-1.5 text-xs font-bold text-teal-200"
                >
                  {getSkasGroup(skasStandardGroup).subStandards.map((sub) => (
                    <option key={sub.code} value={sub.code}>
                      {sub.dropdownLabel}
                    </option>
                  ))}
                </select>

                {/* Up to 2 Sokongan Standards */}
                {skasSokonganList.map((sok, idx) => {
                  const resSok = resolveSkasSelection(sok.standardGroup, sok.subStandardCode);
                  return (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-slate-900 border border-amber-500/30 space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase text-amber-300">
                          {idx + 2}. Standard Sokongan #{idx + 1} ([RUJUKAN] Drive)
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setSkasSokonganList((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-[10px] font-bold text-rose-400 cursor-pointer"
                        >
                          Padam
                        </button>
                      </div>
                      <select
                        value={resSok.standardGroup}
                        onChange={(e) => {
                          const nextGrp = e.target.value as SkasStandardGroupKey;
                          const defCode = getSkasGroup(nextGrp).defaultSubStandardCode;
                          setSkasSokonganList((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { standardGroup: nextGrp, subStandardCode: defCode }
                                : item
                            )
                          );
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] font-bold text-white"
                      >
                        {SKAS_STANDARDS_DICTIONARY.map((g) => (
                          <option key={g.standardGroup} value={g.standardGroup}>
                            {g.dropdownGroupLabel}
                          </option>
                        ))}
                      </select>
                      <select
                        value={resSok.subStandardCode}
                        onChange={(e) => {
                          const nextCode = e.target.value;
                          setSkasSokonganList((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, subStandardCode: nextCode } : item
                            )
                          );
                        }}
                        className="w-full bg-slate-950 border border-amber-500/40 rounded-lg px-2 py-1 text-[11px] font-bold text-amber-200"
                      >
                        {getSkasGroup(resSok.standardGroup).subStandards.map((sub) => (
                          <option key={sub.code} value={sub.code}>
                            {sub.dropdownLabel}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}

                {skasSokonganList.length < 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextGrp: SkasStandardGroupKey =
                        skasStandardGroup === 'Std 5' ? 'Std 2' : 'Std 5';
                      setSkasSokonganList((prev) => [
                        ...prev,
                        {
                          standardGroup: nextGrp,
                          subStandardCode: getSkasGroup(nextGrp).defaultSubStandardCode,
                        },
                      ]);
                    }}
                    className="w-full py-1.5 rounded-xl border border-dashed border-amber-500/40 text-amber-300 text-[10.5px] font-black cursor-pointer"
                  >
                    + Tambah Standard Sokongan ({skasSokonganList.length + 1}/2)
                  </button>
                )}

                <button
                  type="button"
                  disabled={isArchivingDrive}
                  onClick={handleArchiveSijilToDrive}
                  className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-black uppercase flex items-center justify-center gap-2 shadow cursor-pointer"
                >
                  <CloudUpload className="w-4 h-4" />
                  <span>
                    {isArchivingDrive
                      ? 'Menyegerak Sijil ke Google Drive Sekolah...'
                      : `Arkibkan ${activeRecipients.length} Sijil ke Google Drive & Radar SKAS`}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: LIVE WYSIWYG PREVIEW + BATCH PRINT BAR */}
        <div className="xl:col-span-7 space-y-4">
          {/* Action Toolbar & Pagination Controls */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
            {/* Pagination Left/Right */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={previewIndex <= 0}
                onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}
                className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-black text-amber-300">
                Sijil {previewIndex + 1} / {activeRecipients.length}
                <span className="text-slate-400 font-normal ml-2 hidden sm:inline">
                  ({currentPreviewRecipient?.name})
                </span>
              </div>
              <button
                type="button"
                disabled={previewIndex >= activeRecipients.length - 1}
                onClick={() =>
                  setPreviewIndex((i) => Math.min(activeRecipients.length - 1, i + 1))
                }
                className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Batch Print & Download Standalone HTML Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const res = triggerSmartPrint({
                    elementId: 'isepadu-sijil-batch-print-container',
                    title: `${jenisSijil}_${temaSijil}`,
                    orientation,
                    singlePage: activeRecipients.length === 1,
                    onNotice: (msg) => setStatusNotice({ type: 'info', text: msg }),
                  });
                  if (res.mode !== 'native') {
                    setStatusNotice({ type: 'info', text: res.message });
                  }
                }}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase flex items-center gap-1.5 shadow cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>
                  Cetak / Simpan PDF (Semua {activeRecipients.length} Sijil)
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const res = downloadStandalonePrintHtml({
                    elementId: 'isepadu-sijil-batch-print-container',
                    title: `${jenisSijil}_${temaSijil}`,
                    orientation,
                    singlePage: activeRecipients.length === 1,
                  });
                  setStatusNotice({ type: 'info', text: res.message });
                }}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Muat Turun Fail Cetakan</span>
              </button>
            </div>
          </div>

          {/* Live Single-Page Certificate Preview (Interactive Pagination) */}
          <div className="bg-slate-950/90 border border-slate-800 rounded-3xl p-4 sm:p-6 overflow-x-auto">
            {currentPreviewRecipient &&
              renderSingleCertificatePage(currentPreviewRecipient, previewIndex, false)}
          </div>

          {/* Hidden Batch Print Container containing ALL selected recipients (1 page per recipient via page-break-after: always) */}
          <div className="hidden">
            <div id="isepadu-sijil-batch-print-container">
              {activeRecipients.map((rec, idx) =>
                renderSingleCertificatePage(rec, idx, true)
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
