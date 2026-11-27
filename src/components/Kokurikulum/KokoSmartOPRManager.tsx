import React, { useState, useEffect, useMemo } from 'react';
import {
  Trophy,
  Plus,
  Trash2,
  Edit3,
  Save,
  Printer,
  Search,
  Sparkles,
  Image as ImageIcon,
  X,
  Check,
  Shield,
  Award,
  Users,
  FileText,
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  RefreshCw,
  Download,
  ClipboardList,
  Coins,
  HeartHandshake,
  Eye,
  EyeOff,
  CheckSquare,
} from 'lucide-react';
import {
  triggerSmartPrint,
  downloadStandalonePrintHtml,
} from '../../utils/oprPrintHelper';
import {
  syncDocumentToSchoolDrive,
  buildFallbackDriveHtml,
} from '../../utils/schoolDriveArchive';
import { db } from '../../lib/firebase';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  addDoc,
  updateDoc,
} from 'firebase/firestore';
import { Student, UserProfile, SchoolSettings } from '../../types';
import {
  KokoActivity,
  KokoScopeLevel,
  KokoPencapaianTier,
  KokoPengiktirafanType,
  SUMBANGAN_KATEGORI_OPTIONS,
  isSumbanganCommunityLinked,
  computeTotalPerbelanjaan,
} from '../../types/kokurikulum';
import { useSchoolTenant } from '../../contexts/SchoolTenantContext';
import { belongsToSchool, scopedDocId } from '../../utils/schoolTenant';
import {
  MYSG_OPR_KOAKADEMIK_OPTIONS,
  MySGJawatankuasaItem,
} from '../../utils/mysgJawatankuasaCatalog';
import {
  SKPM_KOKO_STANDARD_OPTIONS,
  SKPMKokoStandardCode,
  autoResolveKokoSKPM,
  getKokoSKPMOption,
} from '../../utils/skpmCatalog';
import {
  SKAS_STANDARDS_DICTIONARY,
  SkasStandardGroupKey,
  getSkasGroup,
  resolveSkasSelection,
} from '../../data/skasStandards';
import { deepSanitizeFirestore } from '../../utils/sanitizeFirestore';
import SchoolLogo from '../SchoolLogo';
import SPPKCompetitionFormsModal, { SPPKInitialData } from './SPPKCompetitionFormsModal';
import KokoAnnualSumbanganReport from './KokoAnnualSumbanganReport';

export interface MaklumanOPRPrefill {
  maklumanTaskId?: string;
  openOprId?: string;
  openEditId?: string;
  programName?: string;
  date?: string;
  venue?: string;
  jenis?: 'pertandingan' | 'aktiviti';
  category?: KokoActivity['category'];
}

interface Props {
  profile: UserProfile;
  role: 'pentadbir' | 'guru' | 'laporan';
  schoolSettings?: SchoolSettings | null;
  prefill?: MaklumanOPRPrefill | null;
  onClearPrefill?: () => void;
}

const SCOPE_LEVELS: KokoScopeLevel[] = [
  'Sekolah',
  'Daerah/Zon',
  'Bahagian',
  'Negeri',
  'Kebangsaan',
  'Antarabangsa',
];

const PENCAPAIAN_TIERS: KokoPencapaianTier[] = [
  'Johan',
  'Naib Johan',
  'Ketiga',
  'Keempat',
  'Kelima',
  'Saguhati',
  'Penyertaan',
];

const PENGIKTIRAFAN_TYPES: KokoPengiktirafanType[] = [
  'Sijil',
  'Pingat',
  'Trofi',
  'PAJSK',
];

interface PendingMaklumanOption {
  id: string;
  title: string;
  dueDate: string;
  location?: string;
  category: string;
  completions?: Record<string, any>;
}

function formatMalayDate(dateStr?: string): string {
  if (!dateStr) return '-';
  const months = [
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
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  return `${day} ${months[monthIdx] || parts[1]} ${year}`;
}

export default function KokoSmartOPRManager({
  profile,
  role,
  schoolSettings,
  prefill,
  onClearPrefill,
}: Props) {
  const {
    schoolCode: activeSchoolCode,
    schoolName: tenantSchoolName,
    isLegacySchool,
  } = useSchoolTenant();

  const effectiveSchoolName = schoolSettings?.schoolName || tenantSchoolName;
  const effectiveSchoolLogo = schoolSettings?.schoolLogo || schoolSettings?.logoUrl;

  const [activities, setActivities] = useState<KokoActivity[]>([]);
  const [teachers, setTeachers] = useState<string[]>([]);
  const [staffDirectory, setStaffDirectory] = useState<
    Array<{ uid: string; name: string; email?: string }>
  >([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [pendingMaklumanTasks, setPendingMaklumanTasks] = useState<PendingMaklumanOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(
    null
  );
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // View mode: 'list' | 'form' | 'print-opr'
  const [viewMode, setViewMode] = useState<'list' | 'form' | 'print-opr'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedPrintActivity, setSelectedPrintActivity] = useState<KokoActivity | null>(null);
  const [sppkModalData, setSppkModalData] = useState<SPPKInitialData | null>(null);
  const [showAnnualFinancialReport, setShowAnnualFinancialReport] = useState<boolean>(false);
  const [phase2FocusMode, setPhase2FocusMode] = useState<boolean>(false);
  const phase2SectionRef = React.useRef<HTMLDivElement | null>(null);

  // Form Fields
  const [status, setStatus] = useState<'DRAF_PRA_PERTANDINGAN' | 'SELESAI'>('SELESAI');
  const [dutyRegisteredToRelief, setDutyRegisteredToRelief] = useState<boolean>(false);
  const [jenis, setJenis] = useState<'pertandingan' | 'aktiviti'>('pertandingan');
  const [programName, setProgramName] = useState('');
  const [organizer, setOrganizer] = useState('PPD / JPN / KPM / Sekolah');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [masa, setMasa] = useState('08:00 pagi – 12:30 tengah hari');
  const [venue, setVenue] = useState('');
  const [level, setLevel] = useState<KokoScopeLevel>('Daerah/Zon');
  const [category, setCategory] = useState<KokoActivity['category']>('sport');
  const [unit, setUnit] = useState('');
  const [koakademikCoordinators, setKoakademikCoordinators] = useState<Record<string, string>>({});

  // SKPM Standard 1 - Standard 5 Auto-Detection + 2-Level Cascading Manual Selection
  const [skpmManualOverride, setSkpmManualOverride] = useState<boolean>(false);
  const [skasStandardGroup, setSkasStandardGroup] = useState<SkasStandardGroupKey>('Std 3.2');
  const [skpmStandardCode, setSkpmStandardCode] = useState<string>('3.2.5.1');
  const [linkedMaklumanTaskId, setLinkedMaklumanTaskId] = useState<string>('');

  // Teacher Role Separation
  const [jurulatih, setJurulatih] = useState<string[]>([]);
  const [guruPengiring, setGuruPengiring] = useState<string[]>([]);

  // Student Participation & Zero-Student Rule
  const [isZeroStudent, setIsZeroStudent] = useState<boolean>(false);
  const [participantCount, setParticipantCount] = useState<number>(1);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [classFilter, setClassFilter] = useState<string>('SEMUA');

  // Conditional Fields for 'pertandingan'
  const [pencapaian, setPencapaian] = useState<KokoPencapaianTier>('Penyertaan');
  const [pengiktirafan, setPengiktirafan] = useState<KokoPengiktirafanType[]>(['Sijil', 'PAJSK']);
  const [pencapaianDetails, setPencapaianDetails] = useState<
    Array<{
      studentId?: string;
      studentName: string;
      level: string;
      achievement: string;
      prize?: string;
    }>
  >([]);
  const [bulkPencapaian, setBulkPencapaian] = useState<KokoPencapaianTier>('Penyertaan');

  // Financial Tracking: Sumbangan / Penaja & Perbelanjaan
  const [kategoriSumbangan, setKategoriSumbangan] = useState<string>('Tiada Kos (RM 0.00)');
  const [kategoriSumbanganList, setKategoriSumbanganList] = useState<string[]>([]);
  const [namaPenyumbang, setNamaPenyumbang] = useState<string>('');
  const [jumlahSumbanganRM, setJumlahSumbanganRM] = useState<number>(0);
  const [kosMakanMinum, setKosMakanMinum] = useState<number>(0);
  const [kosPengangkutan, setKosPengangkutan] = useState<number>(0);
  const [kosYuranBahan, setKosYuranBahan] = useState<number>(0);
  const [kosLain, setKosLain] = useState<number>(0);
  const [paparAmaunPadaOPR, setPaparAmaunPadaOPR] = useState<boolean>(true);
  const [noBaucarResit, setNoBaucarResit] = useState<string>('');

  // OPR Documentation
  const [objective1, setObjective1] = useState('');
  const [reflection, setReflection] = useState('');
  const [impact, setImpact] = useState('');
  const [kekuatan, setKekuatan] = useState('');
  const [kelemahanCadangan, setKelemahanCadangan] = useState('');
  const [tindakanSusulan, setTindakanSusulan] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncingDriveActId, setSyncingDriveActId] = useState<string | null>(null);

  const handleSyncActivityToDrive = async (
    act: KokoActivity,
    elementId?: string,
    silentSuccessPrefix?: string
  ) => {
    if (!act.id) return;
    setSyncingDriveActId(act.id);
    try {
      const skpm = autoResolveKokoSKPM({
        category: act.category,
        jenis: act.jenis,
        level: act.level,
        programName: act.programName,
        unit: act.unit,
        manualCode: act.subStandardCode || act.skpmStandardCode,
      });
      const resolvedSkas = resolveSkasSelection(
        act.standardGroup || 'Std 3.2',
        act.subStandardCode || act.skpmStandardCode || skpm.code,
        'KOKURIKULUM'
      );

      const summaryLines = [
        act.objective1 ? `Objektif: ${act.objective1}` : '',
        `Peringkat: ${act.level} | Pencapaian: ${act.pencapaian || 'Penyertaan'}`,
        act.jurulatih?.length ? `Jurulatih: ${act.jurulatih.join(', ')}` : '',
        act.guruPengiring?.length ? `Guru Pengiring: ${act.guruPengiring.join(', ')}` : '',
        act.impact ? `Impak: ${act.impact}` : '',
        act.reflection ? `Refleksi: ${act.reflection}` : '',
      ].filter(Boolean);

      const kokoStandardsList: Array<{
        standardGroup: string;
        subStandardCode: string;
        subStandardTitle: string;
      }> = Array.isArray(act.standards) && act.standards.length > 0
        ? act.standards.slice(0, 3)
        : (() => {
            const list = [
              {
                standardGroup: resolvedSkas.standardGroup,
                subStandardCode: resolvedSkas.subStandardCode,
                subStandardTitle: resolvedSkas.subStandardTitle,
              },
            ];
            if ((act.skpmStandard5Code || act.jenis === 'pertandingan') && resolvedSkas.subStandardCode !== '5.2') {
              const std5 = resolveSkasSelection('Std 5', '5.2', 'KOKURIKULUM');
              list.push({
                standardGroup: std5.standardGroup,
                subStandardCode: std5.subStandardCode,
                subStandardTitle: std5.subStandardTitle,
              });
            }
            if (act.skpmAspek271Linked && resolvedSkas.subStandardCode !== '2.7.1') {
              const std271 = resolveSkasSelection('Std 2', '2.7.1', 'PENTADBIRAN');
              list.push({
                standardGroup: std271.standardGroup,
                subStandardCode: std271.subStandardCode,
                subStandardTitle: std271.subStandardTitle,
              });
            }
            return list.slice(0, 3);
          })();

      const fallbackHtml = buildFallbackDriveHtml({
        schoolCode: activeSchoolCode,
        academicYear: act.academicYear || '2026',
        docKind: 'OPR',
        standardGroup: resolvedSkas.standardGroup,
        subStandardCode: resolvedSkas.subStandardCode,
        subStandardTitle: resolvedSkas.subStandardTitle,
        standards: kokoStandardsList,
        driveTargetFolderPath:
          act.driveTargetFolderPath && act.driveTargetFolderPath.length > 0
            ? act.driveTargetFolderPath
            : resolvedSkas.driveTargetFolderPath,
        skpmBucket: resolvedSkas.standardGroup,
        skpmCodeBadge:
          kokoStandardsList.length > 1
            ? kokoStandardsList.map((s) => s.subStandardCode).join(' + ')
            : `${resolvedSkas.subStandardCode} — ${resolvedSkas.subStandardTitle}`,
        skpmStandard: resolvedSkas.standardFullTitle,
        pillar: 'KOKURIKULUM',
        programTitle: act.programName,
        tarikh: act.date,
        summaryLines,
      });

      const res = await syncDocumentToSchoolDrive({
        schoolCode: activeSchoolCode,
        schoolName: effectiveSchoolName,
        schoolLogoUrl: effectiveSchoolLogo,
        academicYear: act.academicYear || '2026',
        docKind: 'OPR',
        standardGroup: resolvedSkas.standardGroup,
        subStandardCode: resolvedSkas.subStandardCode,
        subStandardTitle: resolvedSkas.subStandardTitle,
        standards: kokoStandardsList,
        driveTargetFolderPath:
          act.driveTargetFolderPath && act.driveTargetFolderPath.length > 0
            ? act.driveTargetFolderPath
            : resolvedSkas.driveTargetFolderPath,
        skpmBucket: resolvedSkas.standardGroup,
        skpmCodeBadge:
          kokoStandardsList.length > 1
            ? kokoStandardsList.map((s) => s.subStandardCode).join(' + ')
            : `${resolvedSkas.subStandardCode} — ${resolvedSkas.subStandardTitle}`,
        skpmStandard: resolvedSkas.standardFullTitle,
        skpmAspek: `SUB-STANDARD ${resolvedSkas.subStandardCode}: ${resolvedSkas.subStandardTitle.toUpperCase()}`,
        skpmStandardKualiti: resolvedSkas.kualitiStatement || skpm.kualitiStatement,
        pillar: 'KOKURIKULUM',
        kodMySG: resolvedSkas.subStandardCode,
        jawatankuasaInduk: act.unit || 'Pengurusan Kokurikulum & Koakademik',
        programTitle: act.programName,
        tarikh: act.date,
        masa: act.masa || '08:00 pagi – 12:30 tengah hari',
        tempat: act.venue || effectiveSchoolName,
        sasaran:
          act.participantCount === 0
            ? 'Guru & Pengurusan Sekolah'
            : `${act.participantCount || 0} Orang Murid (${act.level})`,
        peringkat: act.level,
        pencapaian: act.jenis === 'pertandingan' ? act.pencapaian : undefined,
        objektif: [
          act.objective1 ||
            'Memperkasakan bakat, disiplin dan penglibatan aktif murid mengikut piawaian kokurikulum KPM.',
        ],
        pengisianAktiviti: summaryLines,
        impak: [
          act.impact ||
            'Meningkatkan kemenjadian murid serta menyumbang kepada skor kecemerlangan kokurikulum sekolah.',
          skpm.standard5Label || '',
        ].filter(Boolean),
        refleksiDanTindakanSusulan: [
          act.reflection || '',
          act.kekuatan ? `Kekuatan: ${act.kekuatan}` : '',
          act.tindakanSusulan || act.kelemahanCadangan
            ? `Tindakan Susulan: ${act.tindakanSusulan || act.kelemahanCadangan}`
            : '',
        ].filter(Boolean),
        preparedByName: (
          (act.jurulatih && act.jurulatih[0]) ||
          act.createdBy ||
          profile.name ||
          'GURU PENASIHAT'
        ).toUpperCase(),
        preparedByTitle:
          act.category === 'KOAKADEMIK'
            ? `Penyelaras ${act.unit || 'Koakademik'}`
            : act.unit
            ? `Jurulatih / Penyelaras ${act.unit}`
            : 'Jurulatih / Guru Penasihat',
        elementId,
        htmlContent: elementId ? undefined : fallbackHtml,
        photos: act.images || [],
      });

      if (res.success) {
        const nowIso = new Date().toISOString();
        const savedFolderPath =
          res.folderPath ||
          (
            res.driveTargetFolderPath ||
            act.driveTargetFolderPath ||
            resolvedSkas.driveTargetFolderPath
          ).join(' / ');
        const savedFileUrl = res.fileUrl || res.folderUrl || '';
        const savedFolderUrl = res.folderUrl || res.fileUrl || '';
        const savedLinkedPaths =
          Array.isArray(res.linkedPaths) && res.linkedPaths.length > 0
            ? res.linkedPaths
            : [savedFolderPath];
        const drivePatch = deepSanitizeFirestore({
          standardGroup: resolvedSkas.standardGroup,
          subStandardCode: resolvedSkas.subStandardCode,
          subStandardTitle: resolvedSkas.subStandardTitle,
          standards: res.standards || kokoStandardsList,
          linkedPaths: savedLinkedPaths,
          folderUrl: savedFolderUrl,
          fileUrl: savedFileUrl,
          folderPath: savedFolderPath,
          driveFolderUrl: savedFolderUrl,
          driveFileUrl: savedFileUrl,
          driveFolderPath: savedFolderPath,
          driveTargetFolderPath:
            res.driveTargetFolderPath ||
            act.driveTargetFolderPath ||
            resolvedSkas.driveTargetFolderPath,
          driveSyncedAt: nowIso,
          updatedAt: nowIso,
        });
        await setDoc(doc(db, 'koko_activities', act.id), drivePatch, { merge: true });
        const setiausahaDocId = scopedDocId(activeSchoolCode, `koko_opr_${act.id}`);
        await setDoc(doc(db, 'ai_setiausaha_documents', setiausahaDocId), drivePatch, {
          merge: true,
        }).catch(() => null);

        setSelectedPrintActivity((prev) =>
          prev && prev.id === act.id
            ? {
                ...prev,
                standardGroup: resolvedSkas.standardGroup,
                subStandardCode: resolvedSkas.subStandardCode,
                subStandardTitle: resolvedSkas.subStandardTitle,
                folderUrl: savedFolderUrl,
                fileUrl: savedFileUrl,
                folderPath: savedFolderPath,
                driveFolderUrl: savedFolderUrl,
                driveFileUrl: savedFileUrl,
                driveFolderPath: savedFolderPath,
                driveSyncedAt: nowIso,
              }
            : prev
        );

        setBanner({
          type: 'success',
          text: silentSuccessPrefix
            ? `${silentSuccessPrefix} & disegerakkan ke Google Drive Rasmi Sekolah (${savedFolderPath})!`
            : `☁️ OPR "${act.programName}" berjaya dihantar ke Google Drive Rasmi Sekolah (${savedFolderPath})!`,
        });
      } else if (!silentSuccessPrefix) {
        setBanner({
          type: 'info',
          text: `Status Drive Sekolah: ${res.error || 'Sila semak sambungan Webhook Google Drive Sekolah.'}`,
        });
      }
    } catch (err: any) {
      if (!silentSuccessPrefix) {
        setBanner({
          type: 'error',
          text: `Gagal menghantar ke Google Drive Sekolah: ${err?.message || 'Ralat rangkaian'}`,
        });
      }
    } finally {
      setSyncingDriveActId(null);
    }
  };

  // Search & Filter for list
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLevel, setFilterLevel] = useState<string>('semua');
  const [filterJenis, setFilterJenis] = useState<string>('semua');
  const [filterSkpm, setFilterSkpm] = useState<string>('semua');
  const [filterStatus, setFilterStatus] = useState<string>('semua');

  const canEdit = role === 'pentadbir' || role === 'guru';

  // Auto-resolve SKPM Standard whenever form classification changes (unless overridden)
  const resolvedSkpmSpec = useMemo(() => {
    const base = autoResolveKokoSKPM({
      category,
      jenis,
      level,
      programName,
      unit,
      manualCode: skpmManualOverride ? skpmStandardCode : undefined,
    });
    const skas = resolveSkasSelection(
      skpmManualOverride ? skasStandardGroup : 'Std 3.2',
      skpmManualOverride ? skpmStandardCode : base.code,
      'KOKURIKULUM'
    );
    return {
      ...base,
      code: skas.subStandardCode as SKPMKokoStandardCode,
      standardGroup: skas.standardGroup,
      subStandardCode: skas.subStandardCode,
      subStandardTitle: skas.subStandardTitle,
      dropdownLabel: skas.dropdownLabel,
      standardTitle: skas.standardFullTitle,
      aspekTitle: `ASPEK / TUMS ${skas.subStandardCode}: ${skas.subStandardTitle.toUpperCase()}`,
      kualitiStatement: skas.kualitiStatement,
      suggestedEvidens: skas.suggestedEvidens,
      driveTargetFolderPath: skas.driveTargetFolderPath,
    };
  }, [
    category,
    jenis,
    level,
    programName,
    unit,
    skpmManualOverride,
    skasStandardGroup,
    skpmStandardCode,
  ]);

  useEffect(() => {
    if (!skpmManualOverride) {
      setSkasStandardGroup(resolvedSkpmSpec.standardGroup);
      setSkpmStandardCode(resolvedSkpmSpec.subStandardCode);
    }
  }, [resolvedSkpmSpec.standardGroup, resolvedSkpmSpec.subStandardCode, skpmManualOverride]);

  // Load Firestore Data
  useEffect(() => {
    setLoading(true);
    const unsubs: (() => void)[] = [];

    // koko_activities
    unsubs.push(
      onSnapshot(collection(db, 'koko_activities'), (snap) => {
        const list = snap.docs
          .filter((d) => belongsToSchool(d.data(), activeSchoolCode))
          .map((d) => {
            const raw = d.data();
            const legacyJurulatih: string[] = Array.isArray(raw.jurulatih)
              ? raw.jurulatih
              : raw.teacherName
              ? [raw.teacherName]
              : raw.namaJurulatih
              ? [raw.namaJurulatih]
              : [];

            const legacyGuruPengiring: string[] = Array.isArray(raw.guruPengiring)
              ? raw.guruPengiring
              : [];

            return {
              id: d.id,
              ...raw,
              jurulatih: legacyJurulatih,
              guruPengiring: legacyGuruPengiring,
            } as KokoActivity;
          });
        setActivities(list);
        setLoading(false);
      })
    );

    // Students
    unsubs.push(
      onSnapshot(collection(db, 'students'), (snap) => {
        setStudents(
          snap.docs
            .filter((d) => belongsToSchool(d.data(), activeSchoolCode))
            .map((d) => ({ id: d.id, ...d.data() } as Student))
        );
      })
    );

    // Pending PERTANDINGAN / AKTIVITI tasks in Paparan Makluman
    unsubs.push(
      onSnapshot(collection(db, 'makluman_tasks'), (snap) => {
        const tasks = snap.docs
          .filter((d) => belongsToSchool(d.data(), activeSchoolCode))
          .map((d) => ({ id: d.id, ...d.data() } as PendingMaklumanOption))
          .filter(
            (t) =>
              t.category === 'PERTANDINGAN' ||
              t.category === 'AKTIVITI' ||
              (t as any).domain === 'KOKURIKULUM'
          )
          .sort((a, b) => String(b.dueDate || '').localeCompare(String(a.dueDate || '')));
        setPendingMaklumanTasks(tasks);
      })
    );

    // Teachers + Staff UID Directory (for Relief / Absence Official Duty sync)
    async function loadTeachers() {
      try {
        const dirMap = new Map<string, { uid: string; name: string; email?: string }>();
        if (profile?.uid && profile?.name) {
          dirMap.set(profile.name.toUpperCase().trim(), {
            uid: profile.uid,
            name: profile.name.toUpperCase().trim(),
            email: profile.email,
          });
        }

        const pSnap = await getDocs(collection(db, 'personnel'));
        const scopedP = pSnap.docs.filter((d) => belongsToSchool(d.data(), activeSchoolCode));
        scopedP.forEach((d) => {
          const data = d.data() as any;
          const nm = String(data.name || data.nama || '').toUpperCase().trim();
          const uid = String(data.uid || data.userId || '').trim();
          if (nm && uid) {
            dirMap.set(nm, { uid, name: nm, email: data.email });
          }
        });

        try {
          const uSnap = await getDocs(collection(db, 'users'));
          uSnap.docs
            .filter((d) => belongsToSchool(d.data(), activeSchoolCode))
            .forEach((d) => {
              const data = d.data() as any;
              const nm = String(data.name || '').toUpperCase().trim();
              if (nm) {
                dirMap.set(nm, { uid: d.id, name: nm, email: data.email });
              }
            });
        } catch {
          // Non-admin teacher accounts cannot list users; fallback to personnel & current profile
        }

        setStaffDirectory(Array.from(dirMap.values()));

        if (scopedP.length > 0) {
          setTeachers(
            scopedP
              .map((d) => (d.data().name || d.data().nama || '').toUpperCase())
              .filter(Boolean)
          );
        } else {
          const tSnap = await getDocs(collection(db, 'teachers'));
          setTeachers(
            tSnap.docs
              .filter((d) => belongsToSchool(d.data(), activeSchoolCode))
              .map((d) => (d.data().name || '').toUpperCase())
              .filter(Boolean)
          );
        }
      } catch (err) {
        console.warn('Teacher load error:', err);
      }
    }
    loadTeachers();

    async function loadMySGKoakademik() {
      try {
        const gSnap = await getDocs(collection(db, 'school_governance'));
        const docs = gSnap.docs.filter((d) => {
          const data = d.data() as any;
          return belongsToSchool(data, activeSchoolCode) && data.type === 'MYSG_JAWATANKUASA_V5';
        });
        const latest = docs[docs.length - 1]?.data();
        if (latest && Array.isArray(latest.items)) {
          const map: Record<string, string> = {};
          (latest.items as MySGJawatankuasaItem[]).forEach((item) => {
            if (item.kodMySG.includes('KOAKADEMIK') && item.assignedTeacherName) {
              map[item.kodMySG] = item.assignedTeacherName.toUpperCase();
            }
          });
          setKoakademikCoordinators(map);
        }
      } catch (err) {
        console.warn('Could not load MySG Koakademik coordinators:', err);
      }
    }
    loadMySGKoakademik();

    return () => unsubs.forEach((u) => u());
  }, [activeSchoolCode, profile?.uid, profile?.name, profile?.email]);

  // Handle navigation prefill from Paparan Makluman (either open existing OPR, edit Phase 2 draft, or prefill create form)
  useEffect(() => {
    if (!prefill) return;
    if (prefill.openEditId) {
      const existing = activities.find((a) => a.id === prefill.openEditId);
      if (existing) {
        handleOpenEdit(existing, { focusPhase2: true });
        if (onClearPrefill) onClearPrefill();
        return;
      }
    }
    if (prefill.openOprId) {
      const existing = activities.find((a) => a.id === prefill.openOprId);
      if (existing) {
        if (existing.status === 'DRAF_PRA_PERTANDINGAN') {
          handleOpenEdit(existing, { focusPhase2: true });
        } else {
          setSelectedPrintActivity(existing);
          setViewMode('print-opr');
        }
        if (onClearPrefill) onClearPrefill();
        return;
      }
    }
    if (prefill.maklumanTaskId || prefill.programName) {
      setEditingId(null);
      setPhase2FocusMode(false);
      setStatus('DRAF_PRA_PERTANDINGAN');
      setDutyRegisteredToRelief(false);
      setJenis(prefill.jenis || 'pertandingan');
      setProgramName(prefill.programName || '');
      setOrganizer(isLegacySchool ? 'PPD Mukah / JPN Sarawak / Sekolah' : 'PPD / JPN / Sekolah');
      setDate(prefill.date || new Date().toISOString().split('T')[0]);
      setEndDate('');
      setMasa('08:00 pagi – 12:30 tengah hari');
      setVenue(prefill.venue || `Dewan / Padang ${effectiveSchoolName}`);
      setLevel(
        (prefill.programName || '').toUpperCase().includes('SEKOLAH') ? 'Sekolah' : 'Daerah/Zon'
      );
      setCategory(prefill.category || 'sport');
      setUnit('');
      setLinkedMaklumanTaskId(prefill.maklumanTaskId || '');
      setSkpmManualOverride(false);
      setJurulatih([profile.name.toUpperCase()]);
      setGuruPengiring([]);
      setIsZeroStudent(false);
      setParticipantCount(1);
      setSelectedStudentIds([]);
      setClassFilter('SEMUA');
      setPencapaian('Penyertaan');
      setPengiktirafan(['Sijil', 'PAJSK']);
      setPencapaianDetails([]);
      setKategoriSumbangan('Tiada Kos (RM 0.00)');
      setKategoriSumbanganList([]);
      setNamaPenyumbang('');
      setJumlahSumbanganRM(0);
      setKosMakanMinum(0);
      setKosPengangkutan(0);
      setKosYuranBahan(0);
      setKosLain(0);
      setPaparAmaunPadaOPR(true);
      setNoBaucarResit('');
      setObjective1(
        'Mendedahkan murid kepada pertandingan kokurikulum dan mencungkil bakat baharu.'
      );
      setReflection(
        'Semua peserta mempamerkan disiplin dan semangat kesukanan yang tinggi sepanjang program.'
      );
      setImpact('Meningkatkan kemahiran kepimpinan, keyakinan diri, dan nilai kerjasama murid.');
      setKekuatan(
        'Kerjasama erat antara jurulatih, guru pengiring, dan sokongan pihak pengurusan sekolah.'
      );
      setKelemahanCadangan(
        'Latihan amali perlu dipertingkatkan lebih awal sebelum tarikh kejohanan.'
      );
      setTindakanSusulan(
        'Mengadakan sesi pasca-nilai bersama peserta dan merangka jadual latihan berjadual.'
      );
      setImages([]);
      setViewMode('form');
      if (onClearPrefill) onClearPrefill();
    }
  }, [prefill, activities, onClearPrefill, isLegacySchool, effectiveSchoolName, profile.name]);

  // Sync per-student pencapaianDetails cleanly whenever selectedStudentIds changes
  useEffect(() => {
    if (isZeroStudent) return;
    const selected = students.filter((s) => selectedStudentIds.includes(s.id || ''));
    setPencapaianDetails((prev) => {
      const prevMap = new Map(prev.map((p) => [p.studentId || p.studentName, p]));
      return selected.map((st) => {
        const existing = prevMap.get(st.id || '') || prevMap.get(st.name);
        return (
          existing || {
            studentId: st.id,
            studentName: st.name,
            level,
            achievement: pencapaian || 'Penyertaan',
            prize: '',
          }
        );
      });
    });
    if (selected.length > 0) {
      setParticipantCount((prev) => Math.max(prev, selected.length));
    }
  }, [selectedStudentIds, students, isZeroStudent, level, pencapaian]);

  // Unique student classes for filter dropdown
  const availableClasses = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      const cls = String(s.class || (s as any).currentClass || '').trim();
      if (cls) set.add(cls);
    });
    return Array.from(set).sort();
  }, [students]);

  const filteredSelectableStudents = useMemo(() => {
    return students
      .filter((s) => {
        const cls = String(s.class || (s as any).currentClass || '').trim();
        if (classFilter !== 'SEMUA' && cls !== classFilter) return false;
        if (studentSearch.trim()) {
          const q = studentSearch.toLowerCase();
          return (
            (s.name || '').toLowerCase().includes(q) ||
            cls.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [students, classFilter, studentSearch]);

  // Computed Total Perbelanjaan
  const totalPerbelanjaanRM = useMemo(
    () =>
      computeTotalPerbelanjaan({
        kosMakanMinum,
        kosPengangkutan,
        kosYuranBahan,
        kosLain,
      }),
    [kosMakanMinum, kosPengangkutan, kosYuranBahan, kosLain]
  );

  const isCommunitySumbanganActive = useMemo(
    () =>
      isSumbanganCommunityLinked(
        kategoriSumbangan,
        kategoriSumbanganList,
        Math.max(jumlahSumbanganRM, totalPerbelanjaanRM)
      ),
    [kategoriSumbangan, kategoriSumbanganList, jumlahSumbanganRM, totalPerbelanjaanRM]
  );

  // Financial Summary Totals for List View Bar
  const financialTotals = useMemo(() => {
    let lps = 0;
    let pibg = 0;
    let yb = 0;
    let komuniti = 0;
    let totalBelanja = 0;
    let totalSumbangan = 0;
    let drafCount = 0;

    activities.forEach((act) => {
      if (act.status === 'DRAF_PRA_PERTANDINGAN') drafCount++;
      const exp =
        act.jumlahPerbelanjaanRM !== undefined
          ? Number(act.jumlahPerbelanjaanRM) || 0
          : computeTotalPerbelanjaan({
              kosMakanMinum: act.kosMakanMinum,
              kosPengangkutan: act.kosPengangkutan,
              kosYuranBahan: act.kosYuranBahan,
              kosLain: act.kosLain,
            });
      const sumAmt =
        act.jumlahSumbanganRM !== undefined && act.jumlahSumbanganRM !== null
          ? Number(act.jumlahSumbanganRM) || 0
          : exp;

      totalBelanja += exp;
      totalSumbangan += sumAmt;

      const combinedCat = [act.kategoriSumbangan || '', ...(act.kategoriSumbanganList || [])]
        .join(' ')
        .toUpperCase();
      const val = sumAmt || exp;
      if (combinedCat.includes('LPS') || combinedCat.includes('LEMBAGA PENGURUS')) {
        lps += val;
      } else if (combinedCat.includes('PIBG')) {
        pibg += val;
      } else if (combinedCat.includes('YB') || combinedCat.includes('WAKIL RAKYAT')) {
        yb += val;
      } else if (
        combinedCat.includes('IBU BAPA') ||
        combinedCat.includes('SWASTA') ||
        combinedCat.includes('NGO') ||
        combinedCat.includes('KOMUNITI')
      ) {
        komuniti += val;
      }
    });

    return {
      lps,
      pibg,
      yb,
      komuniti,
      totalBelanja,
      totalSumbangan,
      drafCount,
    };
  }, [activities]);

  // Filtered Activities
  const filteredActivities = useMemo(() => {
    return activities
      .filter((act) => {
        const resolved = autoResolveKokoSKPM({
          category: act.category,
          jenis: act.jenis,
          level: act.level,
          programName: act.programName,
          unit: act.unit,
          manualCode: act.skpmStandardCode,
        });
        const matchSearch =
          act.programName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          act.organizer.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (act.venue || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (act.namaPenyumbang || '').toLowerCase().includes(searchQuery.toLowerCase());
        if (!matchSearch) return false;
        if (filterLevel !== 'semua' && act.level !== filterLevel) return false;
        if (filterJenis !== 'semua' && act.jenis !== filterJenis) return false;
        if (filterSkpm !== 'semua' && resolved.code !== filterSkpm) return false;
        if (filterStatus === 'DRAF_PRA_PERTANDINGAN' && act.status !== 'DRAF_PRA_PERTANDINGAN') {
          return false;
        }
        if (filterStatus === 'SELESAI' && act.status === 'DRAF_PRA_PERTANDINGAN') {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (
          a.status === 'DRAF_PRA_PERTANDINGAN' &&
          b.status !== 'DRAF_PRA_PERTANDINGAN'
        ) {
          return -1;
        }
        if (
          b.status === 'DRAF_PRA_PERTANDINGAN' &&
          a.status !== 'DRAF_PRA_PERTANDINGAN'
        ) {
          return 1;
        }
        return b.date.localeCompare(a.date);
      });
  }, [activities, searchQuery, filterLevel, filterJenis, filterSkpm, filterStatus]);

  // Open Form for Create
  const handleOpenCreate = () => {
    setEditingId(null);
    setBanner(null);
    setPhase2FocusMode(false);
    setStatus('DRAF_PRA_PERTANDINGAN');
    setDutyRegisteredToRelief(false);
    setJenis('pertandingan');
    setProgramName('');
    setOrganizer(isLegacySchool ? 'PPD Mukah / JPN Sarawak / KPM' : 'PPD / JPN / KPM');
    setDate(new Date().toISOString().split('T')[0]);
    setEndDate('');
    setMasa('08:00 pagi – 12:30 tengah hari');
    setVenue(`Dewan / Padang ${effectiveSchoolName}`);
    setLevel('Daerah/Zon');
    setCategory('sport');
    setUnit('');
    setSkpmManualOverride(false);
    setSkasStandardGroup('Std 3.2');
    setSkpmStandardCode('3.2.5.1');
    setLinkedMaklumanTaskId('');
    setJurulatih([profile.name.toUpperCase()]);
    setGuruPengiring([]);
    setIsZeroStudent(false);
    setParticipantCount(1);
    setSelectedStudentIds([]);
    setClassFilter('SEMUA');
    setPencapaian('Penyertaan');
    setPengiktirafan(['Sijil', 'PAJSK']);
    setPencapaianDetails([]);
    setKategoriSumbangan('Tiada Kos (RM 0.00)');
    setKategoriSumbanganList([]);
    setNamaPenyumbang('');
    setJumlahSumbanganRM(0);
    setKosMakanMinum(0);
    setKosPengangkutan(0);
    setKosYuranBahan(0);
    setKosLain(0);
    setPaparAmaunPadaOPR(true);
    setNoBaucarResit('');
    setObjective1(
      'Mendedahkan murid kepada pertandingan kokurikulum dan mencungkil bakat baharu.'
    );
    setReflection(
      'Semua peserta mempamerkan disiplin dan semangat kesukanan yang tinggi sepanjang program.'
    );
    setImpact('Meningkatkan kemahiran kepimpinan, keyakinan diri, dan nilai kerjasama murid.');
    setKekuatan(
      'Kerjasama erat antara jurulatih, guru pengiring, dan sokongan pihak pengurusan sekolah.'
    );
    setKelemahanCadangan(
      'Latihan amali perlu dipertingkatkan lebih awal sebelum tarikh kejohanan.'
    );
    setTindakanSusulan(
      'Mengadakan sesi pasca-nilai bersama peserta dan merangka jadual latihan berjadual.'
    );
    setImages([]);
    setViewMode('form');
  };

  // Open Form for Edit (supports focusPhase2 for 1-click Post-Competition Completion)
  const handleOpenEdit = (act: KokoActivity, opts?: { focusPhase2?: boolean }) => {
    setBanner(null);
    setEditingId(act.id || null);
    setPhase2FocusMode(Boolean(opts?.focusPhase2));
    setStatus(act.status || 'SELESAI');
    setDutyRegisteredToRelief(Boolean(act.dutyRegisteredToRelief));
    setJenis(act.jenis || 'pertandingan');
    setProgramName(act.programName);
    setOrganizer(act.organizer);
    setDate(act.date);
    setEndDate(act.endDate || '');
    setMasa(act.masa || '08:00 pagi – 12:30 tengah hari');
    setVenue(act.venue);
    setLevel(act.level);
    setCategory(act.category as KokoActivity['category']);
    setUnit(act.unit || '');
    if (act.subStandardCode || act.skpmStandardCode) {
      const resolved = resolveSkasSelection(
        act.standardGroup || 'Std 3.2',
        act.subStandardCode || act.skpmStandardCode,
        'KOKURIKULUM'
      );
      setSkpmManualOverride(true);
      setSkasStandardGroup(resolved.standardGroup);
      setSkpmStandardCode(resolved.subStandardCode);
    } else {
      setSkpmManualOverride(false);
      setSkasStandardGroup('Std 3.2');
    }
    setLinkedMaklumanTaskId(act.linkedMaklumanTaskId || '');
    setJurulatih(act.jurulatih || []);
    setGuruPengiring(act.guruPengiring || []);
    setIsZeroStudent(act.participantCount === 0);
    setParticipantCount(act.participantCount || 0);
    setSelectedStudentIds(act.studentIds || []);
    setClassFilter('SEMUA');
    setPencapaian((act.pencapaian as KokoPencapaianTier) || 'Penyertaan');
    setPengiktirafan((act.pengiktirafan as KokoPengiktirafanType[]) || ['Sijil']);
    setPencapaianDetails(act.pencapaianDetails || []);
    setKategoriSumbangan(act.kategoriSumbangan || 'Tiada Kos (RM 0.00)');
    setKategoriSumbanganList(act.kategoriSumbanganList || []);
    setNamaPenyumbang(act.namaPenyumbang || '');
    setJumlahSumbanganRM(Number(act.jumlahSumbanganRM) || 0);
    setKosMakanMinum(Number(act.kosMakanMinum) || 0);
    setKosPengangkutan(Number(act.kosPengangkutan) || 0);
    setKosYuranBahan(Number(act.kosYuranBahan) || 0);
    setKosLain(Number(act.kosLain) || 0);
    setPaparAmaunPadaOPR(act.paparAmaunPadaOPR !== false);
    setNoBaucarResit(act.noBaucarResit || '');
    setObjective1(act.objective1 || '');
    setReflection(act.reflection || '');
    setImpact(act.impact || '');
    setKekuatan(act.kekuatan || '');
    setKelemahanCadangan(act.kelemahanCadangan || '');
    setTindakanSusulan(act.tindakanSusulan || '');
    setImages(act.images || []);
    setViewMode('form');

    if (opts?.focusPhase2) {
      setTimeout(() => {
        phase2SectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    }
  };

  // Open Print OPR
  const handleOpenPrintOpr = (act: KokoActivity) => {
    setSelectedPrintActivity(act);
    setViewMode('print-opr');
  };

  // Helper: Register Guru Pengiring Official Duty in `absence_records` for Jadual Guru Ganti
  const registerGuruPengiringReliefDuty = async (
    chaperones: string[],
    startDateStr: string,
    endDateStr: string,
    progTitle: string,
    loc: string
  ): Promise<number> => {
    if (!startDateStr || chaperones.length === 0) return 0;

    // Build inclusive date list (capped at 7 days)
    const dates: string[] = [];
    const startMs = new Date(`${startDateStr}T00:00:00`).getTime();
    const endMs = endDateStr
      ? new Date(`${endDateStr}T00:00:00`).getTime()
      : startMs;
    const totalDays = Math.min(
      7,
      Math.max(1, Math.round((Math.max(endMs, startMs) - startMs) / 86400000) + 1)
    );
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startMs + i * 86400000);
      dates.push(d.toISOString().slice(0, 10));
    }

    let registeredCount = 0;
    for (const rawName of chaperones) {
      const normName = rawName.toUpperCase().trim();
      const matched =
        staffDirectory.find((s) => s.name === normName) ||
        staffDirectory.find(
          (s) => s.name.includes(normName) || normName.includes(s.name)
        );
      if (!matched?.uid) continue;

      for (const dt of dates) {
        const recordId = `${matched.uid}_${dt}`;
        try {
          await setDoc(
            doc(db, 'absence_records', recordId),
            deepSanitizeFirestore({
              id: recordId,
              schoolCode: activeSchoolCode,
              userId: matched.uid,
              userName: matched.name,
              userEmail: matched.email || '',
              date: dt,
              category: 'PERTANDINGAN',
              reason: `Tugas Rasmi Guru Pengiring: ${progTitle}${loc ? ` (${loc})` : ''}`,
              isOfficialDuty: true,
              updatedAt: new Date(),
              createdAt: new Date(),
            }),
            { merge: true }
          );
          registeredCount++;
        } catch (err) {
          console.warn(`Skipped relief sync for ${matched.name} (${dt}):`, err);
        }
      }
    }
    return registeredCount;
  };

  // Core Save Handler (Phase 1 Draft or Phase 2 Completed OPR)
  const handleSaveActivity = async (
    targetStatus: 'DRAF_PRA_PERTANDINGAN' | 'SELESAI' = 'SELESAI',
    options?: { openPrint?: boolean; openSppk?: boolean }
  ) => {
    if (!programName.trim()) {
      setBanner({ type: 'error', text: 'Sila masukkan Nama Program / Pertandingan.' });
      return;
    }

    setSaving(true);
    setBanner(null);

    const effectiveCount = isZeroStudent
      ? 0
      : Math.max(participantCount, selectedStudentIds.length);
    const selectedStudentsObjs = isZeroStudent
      ? []
      : students.filter((s) => selectedStudentIds.includes(s.id || ''));
    const selectedStudentNames = selectedStudentsObjs.map((s) => s.name);

    const skpm = resolvedSkpmSpec;
    const yearStr = date ? date.slice(0, 4) : '2026';
    const nowIso = new Date().toISOString();

    const safeKategoriList =
      kategoriSumbanganList.length > 0
        ? kategoriSumbanganList
        : kategoriSumbangan
        ? [kategoriSumbangan]
        : [];
    const computedBelanja = computeTotalPerbelanjaan({
      kosMakanMinum,
      kosPengangkutan,
      kosYuranBahan,
      kosLain,
    });
    const linked271 = isSumbanganCommunityLinked(
      kategoriSumbangan,
      safeKategoriList,
      Math.max(jumlahSumbanganRM, computedBelanja)
    );

    const effectiveObjective =
      objective1.trim() ||
      'Mendedahkan murid kepada pertandingan kokurikulum dan mencungkil bakat serta kepimpinan murid.';
    const effectiveImpact =
      impact.trim() ||
      'Meningkatkan kemahiran kepimpinan, keyakinan diri, dan nilai kerjasama murid.';

    const savedKokoStandards: Array<{
      standardGroup: string;
      subStandardCode: string;
      subStandardTitle: string;
    }> = [
      {
        standardGroup: skpm.standardGroup,
        subStandardCode: skpm.subStandardCode,
        subStandardTitle: skpm.subStandardTitle,
      },
    ];
    if ((skpm.standard5Code || jenis === 'pertandingan') && skpm.subStandardCode !== '5.2') {
      const std5 = resolveSkasSelection('Std 5', '5.2', 'KOKURIKULUM');
      savedKokoStandards.push({
        standardGroup: std5.standardGroup,
        subStandardCode: std5.subStandardCode,
        subStandardTitle: std5.subStandardTitle,
      });
    }
    if (linked271 && skpm.subStandardCode !== '2.7.1') {
      const std271 = resolveSkasSelection('Std 2', '2.7.1', 'PENTADBIRAN');
      savedKokoStandards.push({
        standardGroup: std271.standardGroup,
        subStandardCode: std271.subStandardCode,
        subStandardTitle: std271.subStandardTitle,
      });
    }

    const payload = deepSanitizeFirestore({
      schoolCode: activeSchoolCode,
      status: targetStatus,
      ...(targetStatus === 'DRAF_PRA_PERTANDINGAN' || options?.openSppk
        ? { sppkGeneratedAt: nowIso }
        : {}),
      dutyRegisteredToRelief,
      jenis,
      programName: programName.trim(),
      organizer: organizer.trim(),
      date,
      endDate: endDate || date,
      masa: masa.trim() || '08:00 pagi – 12:30 tengah hari',
      venue: venue.trim(),
      level,
      category,
      unit,
      standardGroup: skpm.standardGroup,
      subStandardCode: skpm.subStandardCode,
      subStandardTitle: skpm.subStandardTitle,
      standards: savedKokoStandards.slice(0, 3),
      driveTargetFolderPath: skpm.driveTargetFolderPath,
      skpmStandardCode: skpm.subStandardCode,
      skpmStandardTitle: skpm.standardTitle,
      skpmAspekTitle: skpm.aspekTitle,
      skpmKualitiStatement: skpm.kualitiStatement,
      skpmStandard5Code: skpm.standard5Code || (jenis === 'pertandingan' ? '5.2 & 5.4' : '5.2'),
      skpmStandard5Label:
        skpm.standard5Label ||
        'STANDARD 5 (Aspek 5.2) : Kemenjadian Murid dalam Kokurikulum',
      skpmAspek271Linked: linked271,
      skpmAspek271Label: linked271
        ? 'STANDARD 2 (Aspek 2.7.1 / A9) : Permuafakatan Strategik & Sumbangan Komuniti'
        : '',
      linkedMaklumanTaskId: linkedMaklumanTaskId || '',
      jurulatih,
      guruPengiring,
      participantCount: effectiveCount,
      studentIds: isZeroStudent ? [] : selectedStudentIds,
      studentNames: selectedStudentNames,
      kategoriSumbangan,
      kategoriSumbanganList: safeKategoriList,
      namaPenyumbang: namaPenyumbang.trim(),
      jumlahSumbanganRM: Number(jumlahSumbanganRM) || 0,
      kosMakanMinum: Number(kosMakanMinum) || 0,
      kosPengangkutan: Number(kosPengangkutan) || 0,
      kosYuranBahan: Number(kosYuranBahan) || 0,
      kosLain: Number(kosLain) || 0,
      jumlahPerbelanjaanRM: computedBelanja,
      paparAmaunPadaOPR,
      noBaucarResit: noBaucarResit.trim(),
      objective1: effectiveObjective,
      reflection,
      impact: effectiveImpact,
      kekuatan,
      kelemahanCadangan,
      tindakanSusulan,
      images,
      createdBy: profile.name,
      academicYear: yearStr || '2026',
      createdAt: nowIso,
      updatedAt: nowIso,
      ...(jenis === 'pertandingan'
        ? {
            pencapaian,
            pengiktirafan,
            pencapaianDetails: isZeroStudent ? [] : pencapaianDetails,
          }
        : {}),
    }) as KokoActivity & { schoolCode?: string };

    try {
      let savedActivityId = editingId;
      if (editingId) {
        await setDoc(doc(db, 'koko_activities', editingId), payload, { merge: true });
      } else {
        const ref = await addDoc(collection(db, 'koko_activities'), payload);
        savedActivityId = ref.id;
        setEditingId(ref.id);
      }

      // Optional: Register Guru Pengiring official duty into Jadual Guru Ganti (`absence_records`)
      let reliefSyncCount = 0;
      if (dutyRegisteredToRelief) {
        const targetChaperones =
          guruPengiring.length > 0 ? guruPengiring : jurulatih;
        reliefSyncCount = await registerGuruPengiringReliefDuty(
          targetChaperones,
          date,
          endDate || date,
          payload.programName,
          payload.venue
        );
      }

      // Sync to AI Setiausaha Hub (`ai_setiausaha_documents`) under Standard 3.2 (+ Std 5 + Std 2 / A9 when Sumbangan is community-linked)
      if (savedActivityId) {
        const setiausahaDocId = scopedDocId(activeSchoolCode, `koko_opr_${savedActivityId}`);
        const individualSummaryLines =
          jenis === 'pertandingan' && pencapaianDetails.length > 0
            ? pencapaianDetails.map(
                (pd) =>
                  `${pd.studentName}: ${pd.achievement}${pd.prize ? ` (${pd.prize})` : ''}`
              )
            : [];

        const pengisianList: string[] = [
          `Penganjur: ${payload.organizer}${payload.unit ? ` · Unit: ${payload.unit}` : ''} (Peringkat: ${payload.level})`,
          ...(jenis === 'pertandingan'
            ? [
                `Pencapaian Rasmi: ${pencapaian} (${pengiktirafan.join(', ') || 'Sijil'})`,
                ...(individualSummaryLines.length > 0
                  ? [`Keputusan Peserta: ${individualSummaryLines.join(' | ')}`]
                  : selectedStudentNames.length > 0
                  ? [`Peserta / Atlet (${effectiveCount} Orang): ${selectedStudentNames.join(', ')}`]
                  : [`Bilangan Peserta: ${effectiveCount} orang murid`]),
              ]
            : [
                effectiveCount === 0
                  ? 'Penyertaan: Program Pengurusan / Bengkel Guru (Zero-Student Rule)'
                  : `Bilangan Murid Terlibat: ${effectiveCount} orang murid${
                      selectedStudentNames.length > 0
                        ? ` (${selectedStudentNames.slice(0, 8).join(', ')}${
                            selectedStudentNames.length > 8 ? '...' : ''
                          })`
                        : ''
                    }`,
              ]),
          ...(jurulatih.length > 0 ? [`Jurulatih / Penyelaras: ${jurulatih.join(', ')}`] : []),
          ...(guruPengiring.length > 0 ? [`Guru Pengiring: ${guruPengiring.join(', ')}`] : []),
          ...(kategoriSumbangan && !/TIADA KOS/i.test(kategoriSumbangan)
            ? [
                `Sumber Kewangan / Sumbangan: ${kategoriSumbangan}${
                  namaPenyumbang ? ` — ${namaPenyumbang}` : ''
                }${
                  paparAmaunPadaOPR && (computedBelanja > 0 || jumlahSumbanganRM > 0)
                    ? ` (Perbelanjaan: RM ${computedBelanja.toFixed(2)})`
                    : ''
                }`,
              ]
            : []),
        ];

        const refleksiList = [
          reflection ? `Refleksi: ${reflection}` : '',
          kekuatan ? `Kekuatan: ${kekuatan}` : '',
          kelemahanCadangan ? `Penambahbaikan: ${kelemahanCadangan}` : '',
          tindakanSusulan ? `Tindakan Susulan: ${tindakanSusulan}` : '',
        ].filter(Boolean);

        const additionalBuckets: string[] = [];
        if (linked271) {
          additionalBuckets.push('Std 2');
        }

        const badgeParts: string[] = [skpm.code];
        if (skpm.standard5Code) badgeParts.push(`Std ${skpm.standard5Code}`);
        if (linked271) badgeParts.push('2.7.1 / A9');

        const setiausahaPayload = deepSanitizeFirestore({
          id: setiausahaDocId,
          docKind: 'OPR',
          sourceModule: 'KOKURIKULUM_OPR',
          sourceActivityId: savedActivityId,
          schoolCode: activeSchoolCode,
          academicYear: payload.academicYear,
          pillar: 'KOKURIKULUM',
          kodMySG: skpm.code,
          jawatankuasaInduk: unit || 'Pengurusan Kokurikulum & Koakademik',
          jawatanRasmi:
            category === 'KOAKADEMIK'
              ? `Penyelaras ${unit || 'Koakademik'}`
              : 'Jurulatih / Guru Penasihat Kokurikulum',
          standardGroup: skpm.standardGroup,
          subStandardCode: skpm.subStandardCode,
          subStandardTitle: skpm.subStandardTitle,
          standards: savedKokoStandards.slice(0, 3),
          driveTargetFolderPath: skpm.driveTargetFolderPath,
          skpmBucket: skpm.standardGroup,
          secondarySkpmBucket:
            skpm.standard5Code || jenis === 'pertandingan' ? 'Std 5' : undefined,
          additionalSkpmBuckets: additionalBuckets,
          skpmAspek271Linked: linked271,
          skpmCodeBadge: badgeParts.join(' + '),
          skpmStandard: skpm.standardTitle,
          skpmAspek: skpm.aspekTitle,
          skpmStandardKualiti: skpm.kualitiStatement,
          programTitle: payload.programName.toUpperCase(),
          tarikh: payload.date,
          masa: payload.masa,
          tempat: payload.venue,
          sasaran:
            effectiveCount === 0
              ? 'Guru & Pengurusan Sekolah'
              : `${effectiveCount} Orang Murid (${level})`,
          peringkat: level,
          pencapaian: jenis === 'pertandingan' ? pencapaian : undefined,
          rawNotes: '',
          objektif: [effectiveObjective].filter(Boolean),
          pengisianAktiviti: pengisianList,
          impak: [
            effectiveImpact,
            payload.skpmStandard5Label,
            linked271 ? payload.skpmAspek271Label : '',
          ].filter(Boolean) as string[],
          refleksiDanTindakanSusulan: refleksiList,
          photos: (images || []).slice(0, 3),
          preparedByName: (jurulatih[0] || profile.name || '').toUpperCase(),
          preparedByTitle:
            category === 'KOAKADEMIK'
              ? `Penyelaras ${unit || 'Koakademik'}`
              : 'Jurulatih / Guru Penasihat',
          createdBy: profile.email || profile.uid,
          createdAt: payload.createdAt,
          updatedAt: payload.updatedAt,
        });

        await setDoc(
          doc(db, 'ai_setiausaha_documents', setiausahaDocId),
          setiausahaPayload,
          { merge: true }
        );
      }

      // Auto-complete linked Paparan Makluman task ONLY when finalizing Phase 2 (SELESAI)
      if (targetStatus === 'SELESAI') {
        const normProg = programName.trim().toUpperCase();
        const targetMakluman =
          pendingMaklumanTasks.find((t) => t.id === linkedMaklumanTaskId) ||
          pendingMaklumanTasks.find((t) => {
            const tTitle = String(t.title || '').toUpperCase();
            return (
              tTitle === normProg ||
              (normProg.length >= 6 && (tTitle.includes(normProg) || normProg.includes(tTitle)))
            );
          });

        if (targetMakluman && savedActivityId) {
          try {
            const todayStr = new Date().toISOString().slice(0, 10);
            const due = targetMakluman.dueDate || todayStr;
            const isLate = todayStr > due;
            const daysLate = isLate
              ? Math.max(
                  0,
                  Math.round(
                    (new Date(`${todayStr}T00:00:00`).getTime() -
                      new Date(`${due}T00:00:00`).getTime()) /
                      86400000
                  )
                )
              : 0;
            const actorKey =
              (profile as any).teacherId || profile.uid || (profile as any).id || 'ADMIN';
            const updatedCompletions = {
              ...(targetMakluman.completions || {}),
              [actorKey]: {
                completed: true,
                completedAt: new Date().toISOString(),
                completedDateStr: todayStr,
                isLate,
                daysLate,
              },
            };
            await updateDoc(doc(db, 'makluman_tasks', targetMakluman.id), {
              completions: updatedCompletions,
              linkedOprId: savedActivityId,
              linkedOprSkpmCode: skpm.code,
            });
          } catch (mErr) {
            console.warn('Could not auto-mark Makluman task completed:', mErr);
          }
        }
      }

      const savedRecord: KokoActivity = {
        ...payload,
        id: savedActivityId || undefined,
      };

      if (options?.openSppk) {
        setStatus('DRAF_PRA_PERTANDINGAN');
        setSppkModalData({
          programName: payload.programName,
          organizer: payload.organizer,
          date: payload.date,
          endDate: payload.endDate,
          masa: payload.masa,
          venue: payload.venue,
          level: payload.level,
          unit: payload.unit,
          guruPengiring:
            guruPengiring.length > 0 ? guruPengiring : jurulatih,
          studentIds: isZeroStudent ? [] : selectedStudentIds,
          studentNames: selectedStudentNames,
        });
        setBanner({
          type: 'success',
          text: `Fasa 1 Pra-Pertandingan "${payload.programName}" (${selectedStudentNames.length} murid) disimpan sebagai Draf OPR${
            reliefSyncCount > 0
              ? ` & ${reliefSyncCount} rekod Tugas Rasmi Guru Pengiring dihantar ke Jadual Guru Ganti`
              : ''
          }! Sila cetak Borang SPPK 1, 2 & 3.`,
        });
      } else if (options?.openPrint) {
        setSelectedPrintActivity(savedRecord);
        setViewMode('print-opr');
        setBanner({
          type: 'success',
          text: `OPR "${payload.programName}" disahkan SELESAI (${skpm.code}${
            linked271 ? ' + SKPM 2.7.1/A9' : ''
          }) & disegerakkan ke AI Setiausaha! Menyegerak ke Google Drive Sekolah...`,
        });
        if (targetStatus === 'SELESAI') {
          setTimeout(() => {
            void handleSyncActivityToDrive(
              savedRecord,
              'koko-skas-opr-poster',
              `OPR "${payload.programName}" (${skpm.code}) disimpan`
            );
          }, 250);
        }
      } else {
        setViewMode('list');
        setBanner({
          type: 'success',
          text:
            targetStatus === 'DRAF_PRA_PERTANDINGAN'
              ? `Draf Pra-Pertandingan "${payload.programName}" disimpan.`
              : `OPR "${payload.programName}" (${skpm.code}${
                  skpm.standard5Code ? ` & Std ${skpm.standard5Code}` : ''
                }${linked271 ? ' + Std 2.7.1/A9' : ''}) disimpan & disegerakkan ke AI Setiausaha!`,
        });
        if (targetStatus === 'SELESAI') {
          void handleSyncActivityToDrive(
            savedRecord,
            undefined,
            `OPR "${payload.programName}" (${skpm.code}) disimpan`
          );
        }
      }
    } catch (err) {
      console.error('Error saving activity OPR:', err);
      setBanner({ type: 'error', text: 'Ralat menyimpan rekod: ' + String(err) });
    } finally {
      setSaving(false);
    }
  };

  // Delete
  const handleDeleteActivity = async (id: string) => {
    if (!canEdit) return;
    try {
      await deleteDoc(doc(db, 'koko_activities', id));
      try {
        const setiausahaDocId = scopedDocId(activeSchoolCode, `koko_opr_${id}`);
        await deleteDoc(doc(db, 'ai_setiausaha_documents', setiausahaDocId));
      } catch {
        // Ignore if mirror doc didn't exist
      }
      setConfirmDeleteId(null);
      setBanner({ type: 'info', text: 'Laporan OPR dipadam.' });
    } catch (err) {
      console.error('Error deleting activity:', err);
      setBanner({ type: 'error', text: 'Gagal memadam rekod OPR: ' + String(err) });
    }
  };

  // Image Upload or URL paste
  const handleAddImage = () => {
    if (!newImageUrl.trim()) return;
    if (images.length >= 4) {
      setBanner({ type: 'error', text: 'Maksimum 4 keping gambar bagi One-Page Report (OPR).' });
      return;
    }
    setImages((prev) => [...prev, newImageUrl.trim()]);
    setNewImageUrl('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (images.length >= 4) {
      setBanner({ type: 'error', text: 'Maksimum 4 keping gambar bagi format OPR.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result) {
        setImages((prev) => [...prev, String(reader.result)]);
      }
    };
    reader.readAsDataURL(file);
  };

  // Resolve SKPM metadata for currently viewed print poster (supports legacy records cleanly)
  const printSkpm = useMemo(() => {
    if (!selectedPrintActivity) {
      const def = resolveSkasSelection('Std 3.2', '3.2.4.1', 'KOKURIKULUM');
      return {
        ...getKokoSKPMOption('3.2.4.1'),
        standardGroup: def.standardGroup,
        subStandardCode: def.subStandardCode,
        subStandardTitle: def.subStandardTitle,
        driveTargetFolderPath: def.driveTargetFolderPath,
      };
    }
    const base = autoResolveKokoSKPM({
      category: selectedPrintActivity.category,
      jenis: selectedPrintActivity.jenis,
      level: selectedPrintActivity.level,
      programName: selectedPrintActivity.programName,
      unit: selectedPrintActivity.unit,
      manualCode:
        selectedPrintActivity.subStandardCode || selectedPrintActivity.skpmStandardCode,
    });
    const skas = resolveSkasSelection(
      selectedPrintActivity.standardGroup || 'Std 3.2',
      selectedPrintActivity.subStandardCode ||
        selectedPrintActivity.skpmStandardCode ||
        base.code,
      'KOKURIKULUM'
    );
    return {
      ...base,
      code: skas.subStandardCode as SKPMKokoStandardCode,
      standardGroup: skas.standardGroup,
      subStandardCode: skas.subStandardCode,
      subStandardTitle: skas.subStandardTitle,
      driveTargetFolderPath:
        selectedPrintActivity.driveTargetFolderPath &&
        selectedPrintActivity.driveTargetFolderPath.length > 0
          ? selectedPrintActivity.driveTargetFolderPath
          : skas.driveTargetFolderPath,
      standardTitle: selectedPrintActivity.skpmStandardTitle || skas.standardFullTitle,
      aspekTitle:
        selectedPrintActivity.skpmAspekTitle ||
        `ASPEK / TUMS ${skas.subStandardCode}: ${skas.subStandardTitle.toUpperCase()}`,
      kualitiStatement:
        selectedPrintActivity.skpmKualitiStatement || skas.kualitiStatement,
      standard5Code: selectedPrintActivity.skpmStandard5Code || base.standard5Code,
      standard5Label: selectedPrintActivity.skpmStandard5Label || base.standard5Label,
    };
  }, [selectedPrintActivity]);

  return (
    <div className="space-y-6">
      <div className={sppkModalData || showAnnualFinancialReport ? 'print:hidden space-y-6' : 'space-y-6'}>
      {/* Top Banner (hidden during print) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 print:hidden">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-600/20 text-amber-400 rounded-2xl border border-amber-500/30">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Laporan Pertandingan &amp; Aktiviti (Smart OPR SKPM)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Aliran Kerja 2 Fasa: Pra-Pertandingan (SPPK 1-3 + Guru Ganti) → Pasca-Pertandingan (Keputusan, Sumbangan 2.7.1/A9 &amp; OPR SKAS)
              </p>
            </div>
          </div>
        </div>

        {viewMode === 'list' && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAnnualFinancialReport(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer"
            >
              <Coins className="w-4 h-4" />
              <span>Laporan Tahunan Sumbangan</span>
            </button>

            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={() => setSppkModalData({})}
                  className="flex items-center gap-2 px-4 py-2.5 bg-teal-600/20 hover:bg-teal-600 text-teal-300 hover:text-white border border-teal-500/40 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer"
                >
                  <ClipboardList className="w-4 h-4" />
                  <span>Borang SPPK 1-3</span>
                </button>
                <button
                  onClick={handleOpenCreate}
                  className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition shadow-lg shadow-amber-600/30 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Cipta Pertandingan / OPR</span>
                </button>
              </>
            )}
          </div>
        )}

        {viewMode !== 'list' && (
          <button
            onClick={() => setViewMode('list')}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            <span>← Kembali ke Senarai</span>
          </button>
        )}
      </div>

      {banner && (
        <div
          className={`print:hidden p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between gap-3 ${
            banner.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-700 text-emerald-200'
              : banner.type === 'error'
              ? 'bg-rose-950/60 border-rose-700 text-rose-200'
              : 'bg-blue-950/60 border-blue-700 text-blue-200'
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="p-1 rounded-lg hover:bg-white/10 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ================= VIEW 1: LIST OF ACTIVITIES ================= */}
      {viewMode === 'list' && (
        <div className="space-y-4">
          {/* Compact Financial Summary Bar (Sumbangan & Perbelanjaan) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 flex-1">
              <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Sumbangan LPS</div>
                <div className="text-sm font-black font-mono text-amber-300 mt-0.5">
                  RM {financialTotals.lps.toLocaleString('en-MY', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Sumbangan PIBG</div>
                <div className="text-sm font-black font-mono text-emerald-300 mt-0.5">
                  RM {financialTotals.pibg.toLocaleString('en-MY', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Sumbangan YB</div>
                <div className="text-sm font-black font-mono text-sky-300 mt-0.5">
                  RM {financialTotals.yb.toLocaleString('en-MY', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Komuniti / Swasta</div>
                <div className="text-sm font-black font-mono text-purple-300 mt-0.5">
                  RM {financialTotals.komuniti.toLocaleString('en-MY', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="bg-emerald-950/40 border border-emerald-700/50 rounded-xl px-3 py-2 col-span-2 sm:col-span-1">
                <div className="text-[10px] font-bold text-emerald-300 uppercase">Jumlah Belanja</div>
                <div className="text-sm font-black font-mono text-white mt-0.5">
                  RM {financialTotals.totalBelanja.toLocaleString('en-MY', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {financialTotals.drafCount > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setFilterStatus((prev) =>
                      prev === 'DRAF_PRA_PERTANDINGAN' ? 'semua' : 'DRAF_PRA_PERTANDINGAN'
                    )
                  }
                  className="px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-black cursor-pointer"
                >
                  🟡 {financialTotals.drafCount} Draf Pra-Pertandingan
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowAnnualFinancialReport(true)}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5 shadow cursor-pointer"
              >
                <HeartHandshake className="w-4 h-4" />
                <span>Penyata Penaja &amp; Eksport</span>
              </button>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama program, penganjur, tempat atau penyumbang..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-amber-300 font-bold outline-none"
              >
                <option value="semua">Semua Status</option>
                <option value="DRAF_PRA_PERTANDINGAN">🟡 Pra-Pertandingan (Draf SPPK)</option>
                <option value="SELESAI">🟢 Selesai (OPR Lengkap)</option>
              </select>

              <select
                value={filterJenis}
                onChange={(e) => setFilterJenis(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none"
              >
                <option value="semua">Semua Jenis</option>
                <option value="pertandingan">Pertandingan Sahaja</option>
                <option value="aktiviti">Aktiviti Sahaja</option>
              </select>

              <select
                value={filterLevel}
                onChange={(e) => setFilterLevel(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none"
              >
                <option value="semua">Semua Peringkat</option>
                {SCOPE_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>

              <select
                value={filterSkpm}
                onChange={(e) => setFilterSkpm(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-teal-300 font-bold outline-none"
              >
                <option value="semua">Semua Kod SKPM (3.2.1–3.2.7)</option>
                {SKPM_KOKO_STANDARD_OPTIONS.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.shortTitle}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredActivities.map((act) => {
              const cardSkpm = autoResolveKokoSKPM({
                category: act.category,
                jenis: act.jenis,
                level: act.level,
                programName: act.programName,
                unit: act.unit,
                manualCode: act.skpmStandardCode,
              });
              const std5 = act.skpmStandard5Code || cardSkpm.standard5Code;
              const isDraftPhase1 = act.status === 'DRAF_PRA_PERTANDINGAN';
              const cardExpense =
                act.jumlahPerbelanjaanRM !== undefined
                  ? Number(act.jumlahPerbelanjaanRM) || 0
                  : computeTotalPerbelanjaan({
                      kosMakanMinum: act.kosMakanMinum,
                      kosPengangkutan: act.kosPengangkutan,
                      kosYuranBahan: act.kosYuranBahan,
                      kosLain: act.kosLain,
                    });
              const has271 =
                act.skpmAspek271Linked ||
                isSumbanganCommunityLinked(
                  act.kategoriSumbangan,
                  act.kategoriSumbanganList,
                  Math.max(Number(act.jumlahSumbanganRM) || 0, cardExpense)
                );

              return (
                <div
                  key={act.id}
                  className={`bg-slate-900 border rounded-3xl p-5 shadow-lg flex flex-col justify-between transition-all space-y-4 ${
                    isDraftPhase1
                      ? 'border-amber-500/60 ring-1 ring-amber-500/20'
                      : 'border-slate-800 hover:border-teal-600/60'
                  }`}
                >
                  <div>
                    {/* Status Phase Badge Row */}
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      {isDraftPhase1 ? (
                        <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/50">
                          🟡 PRA-PERTANDINGAN (DRAF SPPK)
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">
                          🟢 SELESAI (OPR &amp; PAJSK)
                        </span>
                      )}

                      <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-slate-800 text-slate-300 border border-slate-700 shrink-0">
                        {act.level}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap mb-2">
                      <span
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                          act.jenis === 'pertandingan'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800/80'
                            : 'bg-blue-950 text-blue-300 border border-blue-800/80'
                        }`}
                      >
                        {act.jenis === 'pertandingan' ? 'Pertandingan' : 'Aktiviti'}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-teal-950 text-teal-300 border border-teal-700/70">
                        SKPM {cardSkpm.code}
                      </span>
                      {std5 && (
                        <span className="px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold bg-purple-950 text-purple-300 border border-purple-700/60">
                          Std {std5}
                        </span>
                      )}
                      {has271 && (
                        <span className="px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/70">
                          2.7.1 / A9
                        </span>
                      )}
                    </div>

                    {act.unit && (
                      <div className="text-[10px] font-bold text-indigo-300 mb-1 truncate">
                        {act.unit}
                      </div>
                    )}

                    <h3 className="text-sm font-black text-white line-clamp-2 leading-snug">
                      {act.programName}
                    </h3>

                    <div className="text-[11px] text-slate-400 mt-2 space-y-1">
                      <div className="flex items-center gap-1.5 font-mono">
                        <span>{act.date}</span>
                        <span>·</span>
                        <span className="truncate">{act.venue || 'Sekolah'}</span>
                      </div>

                      {!isDraftPhase1 && act.jenis === 'pertandingan' && act.pencapaian && (
                        <div className="text-amber-400 font-bold flex items-center gap-1 mt-1">
                          <Award className="w-3.5 h-3.5" />
                          <span>Pencapaian: {act.pencapaian}</span>
                        </div>
                      )}

                      {(act.namaPenyumbang || cardExpense > 0 || (act.kategoriSumbangan && !/TIADA KOS/i.test(act.kategoriSumbangan))) && (
                        <div className="text-emerald-300 font-semibold flex items-center gap-1 mt-1 truncate">
                          <HeartHandshake className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">
                            {act.namaPenyumbang || act.kategoriSumbangan}
                            {cardExpense > 0 ? ` · RM ${cardExpense.toFixed(2)}` : ''}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Teacher & Student involvement tags */}
                    <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-1.5 text-[10px]">
                      {act.jurulatih && act.jurulatih.length > 0 && (
                        <div className="flex items-center gap-1 text-slate-300">
                          <span className="font-bold text-amber-400">Jurulatih:</span>
                          <span className="truncate">{act.jurulatih.join(', ')}</span>
                        </div>
                      )}

                      {act.guruPengiring && act.guruPengiring.length > 0 && (
                        <div className="flex items-center gap-1 text-slate-400">
                          <span className="font-bold text-indigo-400">Pengiring:</span>
                          <span className="truncate">{act.guruPengiring.join(', ')}</span>
                        </div>
                      )}

                      <div className="text-slate-400">
                        <span className="font-bold text-slate-300">Penyertaan Murid:</span>{' '}
                        {act.participantCount === 0 ? (
                          <span className="text-slate-500 italic">0 (Bengkel / Program Staf)</span>
                        ) : (
                          <span className="font-mono text-white font-bold">
                            {act.participantCount} orang
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800 space-y-2.5">
                    {isDraftPhase1 && canEdit && (
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(act, { focusPhase2: true })}
                        className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5 shadow cursor-pointer transition"
                      >
                        <Trophy className="w-3.5 h-3.5" />
                        <span>Kemas Kini Keputusan, Sumbangan &amp; Jana OPR</span>
                      </button>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5">
                      {(act.driveFileUrl || act.driveFolderUrl) && (
                        <a
                          href={act.driveFileUrl || act.driveFolderUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded-lg bg-emerald-950/90 hover:bg-emerald-900 text-emerald-300 border border-emerald-600/60 text-[10px] font-black inline-flex items-center gap-1 transition"
                        >
                          <span>📂 Buka di Google Drive Sekolah</span>
                        </a>
                      )}
                      {act.id && (
                        <button
                          type="button"
                          disabled={syncingDriveActId === act.id}
                          onClick={() => void handleSyncActivityToDrive(act)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer transition disabled:opacity-50"
                        >
                          <span>
                            {syncingDriveActId === act.id
                              ? '⏳ Menyegerak...'
                              : '☁️ Hantar ke Drive Sekolah'}
                          </span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <button
                          onClick={() => handleOpenPrintOpr(act)}
                          className="flex items-center gap-1 text-xs font-bold text-teal-400 hover:text-teal-300 cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Poster OPR</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setSppkModalData({
                              programName: act.programName,
                              organizer: act.organizer,
                              date: act.date,
                              endDate: act.endDate,
                              masa: act.masa,
                              venue: act.venue,
                              level: act.level,
                              unit: act.unit,
                              guruPengiring:
                                act.guruPengiring && act.guruPengiring.length > 0
                                  ? act.guruPengiring
                                  : act.jurulatih,
                              studentIds: act.studentIds,
                              studentNames: act.studentNames,
                            })
                          }
                          className="flex items-center gap-1 text-[11px] font-bold text-indigo-300 hover:text-indigo-200 cursor-pointer"
                          title="Jana Pakej Borang SPPK 1, SPPK 2 & SPPK 3"
                        >
                          <ClipboardList className="w-3.5 h-3.5" />
                          <span>SPPK 1-3</span>
                        </button>
                      </div>

                      {canEdit && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenEdit(act)}
                            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white cursor-pointer"
                            title="Edit"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {confirmDeleteId === act.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteActivity(act.id!)}
                                className="px-2 py-1 rounded bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                              >
                                Padam
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-1.5 py-1 rounded bg-slate-800 text-slate-300 text-[10px] cursor-pointer"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(act.id!)}
                              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-rose-400 cursor-pointer"
                              title="Padam"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {!loading && filteredActivities.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500 italic">
                Tiada laporan aktiviti atau pertandingan ditemui.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= VIEW 2: FORM (2-PHASE COMPETITION & OPR WORKFLOW) ================= */}
      {viewMode === 'form' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-white">
                  {editingId
                    ? 'Kemaskini Laporan Pertandingan & OPR (SKPM 3.2, 5 & 2.7.1)'
                    : 'Daftar Pertandingan / OPR Baharu (Aliran 2 Fasa)'}
                </h3>
                <span
                  className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase border ${
                    status === 'DRAF_PRA_PERTANDINGAN'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  }`}
                >
                  {status === 'DRAF_PRA_PERTANDINGAN'
                    ? '🟡 Fasa 1: Draf Pra-Pertandingan'
                    : '🟢 Fasa 2: OPR Selesai'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Fasa 1: Daftar sekali → Cetak SPPK 1-3 &amp; Guru Ganti · Fasa 2: Isi Keputusan, Sumbangan &amp; Cetak OPR SKAS
              </p>
            </div>
            <div className="text-xs font-mono font-bold text-teal-300">
              Kod SKAS: {resolvedSkpmSpec.code}
              {resolvedSkpmSpec.standard5Code ? ` · Std ${resolvedSkpmSpec.standard5Code}` : ''}
              {isCommunitySumbanganActive ? ' · Std 2 (2.7.1/A9)' : ''}
            </div>
          </div>

          {phase2FocusMode && (
            <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/50 text-xs text-amber-200 flex items-center justify-between gap-3">
              <div>
                <strong>Mod Lengkapkan Pasca-Pertandingan (Fasa 2):</strong> Semak/isikan{' '}
                <strong>Keputusan Murid</strong>, <strong>Maklumat Sumbangan / Perbelanjaan</strong>{' '}
                dan <strong>Gambar Dokumentasi</strong> di bawah, kemudian klik{' '}
                <strong>“✅ Sahkan &amp; Cetak OPR (SKAS)”</strong>.
              </div>
              <button
                type="button"
                onClick={() =>
                  phase2SectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
                className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-black text-[11px] shrink-0 cursor-pointer"
              >
                Lompat ke Fasa 2 ↓
              </button>
            </div>
          )}

          {/* FASA 1 HEADER */}
          <div className="px-4 py-2 rounded-xl bg-indigo-950/40 border border-indigo-700/40 flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-indigo-300">
              FASA 1 — PRA-PERTANDINGAN (MAKLUMAT ASAS, GURU &amp; PESERTA MURID)
            </span>
            <span className="text-[11px] text-slate-400">
              Untuk Jana Borang SPPK 1, 2 &amp; 3
            </span>
          </div>

          {/* 1. Type Selector: Pertandingan vs Aktiviti */}
          <div>
            <label className="text-xs font-black text-slate-300 uppercase tracking-wider block mb-2">
              Jenis Laporan:
            </label>
            <div className="grid grid-cols-2 gap-4 max-w-md">
              <button
                type="button"
                onClick={() => setJenis('pertandingan')}
                className={`p-3.5 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                  jenis === 'pertandingan'
                    ? 'bg-amber-600 border-amber-500 text-white shadow-lg shadow-amber-600/30 font-black'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <Trophy className="w-5 h-5" />
                <span className="text-xs">Pertandingan</span>
                <span className="text-[10px] opacity-80">(SPPK + Pencapaian &amp; Sumbangan)</span>
              </button>

              <button
                type="button"
                onClick={() => setJenis('aktiviti')}
                className={`p-3.5 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                  jenis === 'aktiviti'
                    ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/30 font-black'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <Sparkles className="w-5 h-5" />
                <span className="text-xs">Aktiviti / Program</span>
                <span className="text-[10px] opacity-80">(Kem, Bengkel, Sambutan, PAJSK)</span>
              </button>
            </div>
          </div>

          {/* 2. Core Event Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                Nama Program / Pertandingan:
              </label>
              <input
                type="text"
                value={programName}
                onChange={(e) => setProgramName(e.target.value)}
                placeholder="cth: Pertandingan Badminton Peringkat Sekolah / Kejohanan MSSD 2026"
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white font-bold outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                Penganjur:
              </label>
              <input
                type="text"
                value={organizer}
                onChange={(e) => setOrganizer(e.target.value)}
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                Tempat / Lokasi:
              </label>
              <input
                type="text"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                Peringkat / Tahap:
              </label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as KokoScopeLevel)}
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-amber-500"
              >
                {SCOPE_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                  Tarikh Mula:
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2.5 text-xs text-white outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                  Tarikh Tamat:
                </label>
                <input
                  type="date"
                  value={endDate}
                  min={date}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2.5 text-xs text-white outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                  Masa:
                </label>
                <input
                  type="text"
                  value={masa}
                  onChange={(e) => setMasa(e.target.value)}
                  placeholder="08:00 pagi – 12:30 tengah hari"
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2.5 text-xs text-white outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                Kategori Bidang (MySG / Kokurikulum):
              </label>
              <select
                value={category}
                onChange={(e) => {
                  const nextCat = e.target.value as KokoActivity['category'];
                  setCategory(nextCat);
                  if (nextCat === 'KOAKADEMIK' && !unit.startsWith('Koakademik')) {
                    const first = MYSG_OPR_KOAKADEMIK_OPTIONS[0];
                    setUnit(first.unit);
                    const coord = koakademikCoordinators[first.code];
                    if (coord && !jurulatih.includes(coord)) {
                      setJurulatih([coord]);
                    }
                  }
                }}
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white font-bold outline-none focus:border-amber-500"
              >
                <option value="sport">Sukan &amp; Permainan (1M1S / Sekolah · Std 3.2.4.1)</option>
                <option value="KOAKADEMIK">
                  Koakademik MySG (BC / BM / BI / STEM / Kesenian · Std 3.2.5.1)
                </option>
                <option value="club">Kelab &amp; Persatuan (Std 3.2.2.1)</option>
                <option value="uniform">Badan Beruniform (Std 3.2.3.1)</option>
                <option value="SUKAN_UNTUK_SEMUA">
                  Sukan Untuk Semua (Merentas Desa / Sukantara / Olahraga · Std 3.2.6.1)
                </option>
                <option value="PENTAKSIRAN_PAJSK">
                  Pentaksiran Kokurikulum (PAJSK / SEGAK · Std 3.2.7.1)
                </option>
                <option value="KOKURIKULUM">
                  Ketetapan Kokurikulum (Mesyuarat Induk / Pendaftaran / Apresiasi · Std 3.2.1.1)
                </option>
              </select>
            </div>

            <div>
              <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                {category === 'KOAKADEMIK'
                  ? 'Penyelaras Koakademik MySG (Std 3.2.5.1):'
                  : 'Unit / Kelab / Pasukan:'}
              </label>
              {category === 'KOAKADEMIK' ? (
                <select
                  value={unit}
                  onChange={(e) => {
                    const nextUnit = e.target.value;
                    setUnit(nextUnit);
                    const matched = MYSG_OPR_KOAKADEMIK_OPTIONS.find((o) => o.unit === nextUnit);
                    if (matched && koakademikCoordinators[matched.code]) {
                      const coord = koakademikCoordinators[matched.code];
                      setJurulatih((prev) => (prev.includes(coord) ? prev : [coord, ...prev]));
                    }
                  }}
                  className="mt-1 w-full bg-slate-950 border border-indigo-700/60 rounded-xl px-3.5 py-2.5 text-xs text-indigo-200 font-bold outline-none focus:border-indigo-500"
                >
                  {MYSG_OPR_KOAKADEMIK_OPTIONS.map((opt) => {
                    const coord = koakademikCoordinators[opt.code];
                    return (
                      <option key={opt.code} value={opt.unit}>
                        {opt.unit}
                        {coord ? ` (${coord})` : ''}
                      </option>
                    );
                  })}
                </select>
              ) : (
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="cth: Kelab Badminton / Pengakap / Kelab STEM"
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-amber-500"
                />
              )}
            </div>
          </div>

          {/* 2B. 2-Level Cascading SKAS Standard & Sub-Standard Dropdowns + Suggested Evidens Reference Bar */}
          <div className="p-5 bg-teal-950/30 border border-teal-700/50 rounded-2xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-teal-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Pemetaan Standard &amp; Sub-Standard SKPM Kualiti@Sekolah (SKAS 2026 &amp; Google Drive)
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Dipilih secara automatik ke Standard 3.2 mengikut kategori/jenis program, atau boleh ditukar kepada mana-mana Std 1 – Std 5.
                </p>
              </div>
              {skpmManualOverride && (
                <button
                  type="button"
                  onClick={() => setSkpmManualOverride(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-teal-300 flex items-center gap-1 cursor-pointer self-start"
                >
                  <RefreshCw className="w-3 h-3" /> Guna Auto-Kesan (Std 3.2)
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
              <div className="lg:col-span-5">
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  1. Standard Utama (Std 1 – Std 5):
                </label>
                <select
                  value={resolvedSkpmSpec.standardGroup}
                  onChange={(e) => {
                    const nextGroup = e.target.value as SkasStandardGroupKey;
                    setSkpmManualOverride(true);
                    setSkasStandardGroup(nextGroup);
                    const grpObj = getSkasGroup(nextGroup);
                    setSkpmStandardCode(grpObj.defaultSubStandardCode);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none"
                >
                  {SKAS_STANDARDS_DICTIONARY.map((g) => (
                    <option key={g.standardGroup} value={g.standardGroup}>
                      {g.dropdownGroupLabel}
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-7">
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  2. Sub-Standard / TUMS (Format: [Kod] — [Nama BM]（[中文说明]）):
                </label>
                <select
                  value={resolvedSkpmSpec.subStandardCode}
                  onChange={(e) => {
                    setSkpmManualOverride(true);
                    setSkpmStandardCode(e.target.value);
                  }}
                  className="w-full bg-slate-950 border border-teal-700/70 rounded-xl px-3 py-2 text-xs font-bold text-teal-200 outline-none"
                >
                  {getSkasGroup(resolvedSkpmSpec.standardGroup).subStandards.map((sub) => (
                    <option key={sub.code} value={sub.code}>
                      {sub.dropdownLabel}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Light Evidens Reference & Google Drive Folder Path Bar */}
            <div className="bg-slate-950/90 border border-teal-800/60 rounded-xl p-3 space-y-1.5 text-[11px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-black text-white">
                  {resolvedSkpmSpec.standardTitle} &bull; {resolvedSkpmSpec.aspekTitle}
                </div>
                <span className="px-2 py-0.5 rounded bg-teal-500/15 text-teal-300 border border-teal-500/30 font-mono text-[10px]">
                  📁 {resolvedSkpmSpec.driveTargetFolderPath.join(' / ')}
                </span>
              </div>
              <div className="italic text-amber-300">&ldquo;{resolvedSkpmSpec.kualitiStatement}&rdquo;</div>
              <div className="pt-1 border-t border-slate-800/80">
                <div className="text-[10px] font-black uppercase text-teal-300 mb-0.5">
                  💡 Senarai Semak Cadangan Evidens ({resolvedSkpmSpec.subStandardCode}):
                </div>
                <ul className="list-disc pl-4 space-y-0.5 text-[10.5px] text-slate-300">
                  {resolvedSkpmSpec.suggestedEvidens.map((ev, idx) => (
                    <li key={idx}>{ev}</li>
                  ))}
                </ul>
              </div>
              {resolvedSkpmSpec.standard5Label && (
                <div className="text-purple-300 font-bold pt-0.5">
                  Dual-Link KPI: {resolvedSkpmSpec.standard5Label}
                </div>
              )}
            </div>

            {pendingMaklumanTasks.length > 0 && (
              <div className="pt-2 border-t border-teal-800/40">
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  Pautkan ke Tugasan Paparan Makluman (Auto-tanda Selesai apabila OPR disahkan Fasa 2):
                </label>
                <select
                  value={linkedMaklumanTaskId}
                  onChange={(e) => setLinkedMaklumanTaskId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none"
                >
                  <option value="">-- Auto-padan mengikut Tajuk Program / Pilihan Manual --</option>
                  {pendingMaklumanTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      [{t.category}] {t.title} ({t.dueDate})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* 3. Teacher Roles Separation: Jurulatih vs Guru Pengiring */}
          <div className="p-5 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-4">
            <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-indigo-400" />
              Guru Yang Terlibat (Pemisahan Jurulatih &amp; Guru Pengiring)
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Jurulatih Multi-Select */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-amber-400 uppercase">
                  Jurulatih / Penyelaras ({jurulatih.length}):
                </label>
                <div className="max-h-36 overflow-y-auto border border-slate-800 rounded-xl p-2 bg-slate-900/60 space-y-1">
                  {teachers.map((tName) => {
                    const isSelected = jurulatih.includes(tName);
                    return (
                      <button
                        key={tName}
                        type="button"
                        onClick={() => {
                          if (isSelected) setJurulatih((prev) => prev.filter((t) => t !== tName));
                          else setJurulatih((prev) => [...prev, tName]);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                          isSelected
                            ? 'bg-amber-950 text-amber-300 border border-amber-700/60'
                            : 'text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        <span className="truncate">{tName}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-amber-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Guru Pengiring Multi-Select */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-indigo-400 uppercase">
                  Guru Pengiring / Chaperone ({guruPengiring.length}):
                </label>
                <div className="max-h-36 overflow-y-auto border border-slate-800 rounded-xl p-2 bg-slate-900/60 space-y-1">
                  {teachers.map((tName) => {
                    const isSelected = guruPengiring.includes(tName);
                    return (
                      <button
                        key={tName}
                        type="button"
                        onClick={() => {
                          if (isSelected)
                            setGuruPengiring((prev) => prev.filter((t) => t !== tName));
                          else setGuruPengiring((prev) => [...prev, tName]);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-950 text-indigo-300 border border-indigo-700/60'
                            : 'text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        <span className="truncate">{tName}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* 4. Multi-Student Selector + Class Filter + Phase 1 Batch SPPK Save */}
          <div className="p-5 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-emerald-400" />
                Penyertaan Murid Berkelompok (Auto-APDM → SPPK 1, 2, 3 &amp; OPR)
              </span>

              <label className="flex items-center gap-2 cursor-pointer bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
                <input
                  type="checkbox"
                  checked={isZeroStudent}
                  onChange={(e) => setIsZeroStudent(e.target.checked)}
                  className="rounded border-slate-700 text-blue-600 focus:ring-0"
                />
                <span className="text-xs font-bold text-amber-300">
                  Zero-Student Rule (0 Murid: Mesyuarat / Kursus Guru Sahaja)
                </span>
              </label>
            </div>

            {!isZeroStudent ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 uppercase">
                        Bilangan Murid Terlibat:
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={participantCount}
                        onChange={(e) => setParticipantCount(Math.max(1, Number(e.target.value)))}
                        className="mt-1 w-28 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white font-mono font-bold block"
                      />
                    </div>
                    <div className="text-xs text-slate-400 pt-4">
                      Dipilih:{' '}
                      <span className="text-emerald-300 font-black">
                        {selectedStudentIds.length} orang murid
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const filteredIds = filteredSelectableStudents
                          .map((s) => s.id || '')
                          .filter(Boolean);
                        setSelectedStudentIds((prev) =>
                          Array.from(new Set([...prev, ...filteredIds]))
                        );
                      }}
                      className="px-3 py-1.5 rounded-xl bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                      <span>Pilih Semua Ditapis ({filteredSelectableStudents.length})</span>
                    </button>
                    {selectedStudentIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedStudentIds([])}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold cursor-pointer"
                      >
                        Kosongkan
                      </button>
                    )}
                  </div>
                </div>

                {/* Search + Class Filter */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Cari nama murid..."
                    className="sm:col-span-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                  />
                  <select
                    value={classFilter}
                    onChange={(e) => setClassFilter(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-emerald-300 font-bold outline-none"
                  >
                    <option value="SEMUA">Semua Kelas ({students.length} Murid)</option>
                    {availableClasses.map((cls) => (
                      <option key={cls} value={cls}>
                        Kelas: {cls}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="max-h-56 overflow-y-auto border border-slate-800 rounded-xl p-2 bg-slate-900/60 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5">
                  {filteredSelectableStudents.map((st) => {
                    const isSelected = selectedStudentIds.includes(st.id || '');
                    const cls = String(st.class || (st as any).currentClass || '-');
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => {
                          if (isSelected)
                            setSelectedStudentIds((prev) => prev.filter((id) => id !== st.id));
                          else setSelectedStudentIds((prev) => [...prev, st.id || '']);
                        }}
                        className={`text-left px-2.5 py-1.5 rounded-lg text-[11px] truncate flex items-center justify-between cursor-pointer border transition ${
                          isSelected
                            ? 'bg-emerald-950 text-emerald-200 border-emerald-600/60 font-bold'
                            : 'text-slate-400 border-transparent hover:bg-slate-800'
                        }`}
                      >
                        <span className="truncate">
                          {st.name} ({cls})
                        </span>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-1" />
                        )}
                      </button>
                    );
                  })}
                  {filteredSelectableStudents.length === 0 && (
                    <div className="col-span-full py-4 text-center text-xs text-slate-500 italic">
                      Tiada murid sepadan dengan penapis kelas/nama.
                    </div>
                  )}
                </div>

                {/* FASA 1 BATCH ACTION BOX: SAVE DRAFT + RELIEF DUTY + OPEN SPPK 1-2-3 */}
                <div className="mt-3 p-4 rounded-2xl bg-indigo-950/35 border border-indigo-500/40 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <label className="flex items-start sm:items-center gap-2.5 cursor-pointer text-xs text-indigo-100">
                    <input
                      type="checkbox"
                      checked={dutyRegisteredToRelief}
                      onChange={(e) => setDutyRegisteredToRelief(e.target.checked)}
                      className="mt-0.5 sm:mt-0 rounded border-indigo-500 accent-indigo-500"
                    />
                    <span>
                      <strong className="text-white">
                        Daftar Tugas Rasmi Guru Pengiring &amp; Hantar ke Jadual Guru Ganti
                      </strong>
                      <span className="block text-[10px] text-indigo-300">
                        Menulis rekod `PERTANDINGAN` (`isOfficialDuty: true`) untuk guru pengiring terpilih ke `absence_records`
                      </span>
                    </span>
                  </label>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      handleSaveActivity('DRAF_PRA_PERTANDINGAN', { openSppk: true })
                    }
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 cursor-pointer shrink-0"
                  >
                    <ClipboardList className="w-4 h-4" />
                    <span>
                      📋 Simpan Pra-Pertandingan &amp; Cetak Borang SPPK 1, 2, 3 (
                      {selectedStudentIds.length} Murid)
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-amber-950/20 border border-amber-700/40 rounded-xl text-xs text-amber-300">
                ✓ Mod Zero-Student aktif. Rekod akan disimpan dengan 0 bilangan murid terlibat.
              </div>
            )}
          </div>

          {/* ===================================================================== */}
          {/* FASA 2 — PASCA-PERTANDINGAN (KEPUTUSAN, SUMBANGAN & OPR SKAS)         */}
          {/* ===================================================================== */}
          <div
            ref={phase2SectionRef}
            className="pt-2 space-y-5 border-t-2 border-dashed border-amber-500/40"
          >
            <div className="px-4 py-2 rounded-xl bg-amber-950/40 border border-amber-600/40 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                FASA 2 — PASCA-PERTANDINGAN (KEPUTUSAN MURID, SUMBANGAN PENAJA &amp; POSTER OPR)
              </span>
              <span className="text-[11px] text-amber-200/80">
                Lengkapkan selepas tamat pertandingan
              </span>
            </div>

            {/* BLOK A: Pertandingan Pencapaian (Team + Per-Student) */}
            {jenis === 'pertandingan' && (
              <div className="p-5 bg-amber-950/25 border border-amber-600/40 rounded-2xl space-y-4">
                <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Award className="w-4 h-4" />
                  Blok A — Keputusan &amp; Pencapaian Rasmi Murid (Standard 5.4)
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                      Pencapaian Keseluruhan Pasukan / Sekolah:
                    </label>
                    <select
                      value={pencapaian}
                      onChange={(e) => setPencapaian(e.target.value as KokoPencapaianTier)}
                      className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-amber-300 font-bold outline-none"
                    >
                      {PENCAPAIAN_TIERS.map((tier) => (
                        <option key={tier} value={tier}>
                          {tier}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-black text-slate-300 uppercase tracking-wider block mb-1">
                      Bentuk Pengiktirafan:
                    </label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {PENGIKTIRAFAN_TYPES.map((type) => {
                        const isSelected = pengiktirafan.includes(type);
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => {
                              if (isSelected)
                                setPengiktirafan((prev) => prev.filter((t) => t !== type));
                              else setPengiktirafan((prev) => [...prev, type]);
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 border cursor-pointer ${
                              isSelected
                                ? 'bg-amber-600 text-white border-amber-500'
                                : 'bg-slate-950 text-slate-400 border-slate-800'
                            }`}
                          >
                            <span>{type}</span>
                            {isSelected && <Check className="w-3.5 h-3.5" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Per-Student Pencapaian Quick-Fill */}
                {!isZeroStudent && pencapaianDetails.length > 0 && (
                  <div className="pt-3 border-t border-amber-700/30 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-amber-200">
                        Keputusan Individu Setiap Peserta ({pencapaianDetails.length} Murid):
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 font-bold">
                          Tetapkan Semua:
                        </span>
                        <select
                          value={bulkPencapaian}
                          onChange={(e) =>
                            setBulkPencapaian(e.target.value as KokoPencapaianTier)
                          }
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-amber-300 font-bold"
                        >
                          {PENCAPAIAN_TIERS.map((tier) => (
                            <option key={tier} value={tier}>
                              {tier}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            setPencapaianDetails((prev) =>
                              prev.map((row) => ({ ...row, achievement: bulkPencapaian }))
                            )
                          }
                          className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold cursor-pointer"
                        >
                          Guna Untuk Semua
                        </button>
                      </div>
                    </div>

                    <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                      {pencapaianDetails.map((row, idx) => (
                        <div
                          key={`${row.studentId || row.studentName}_${idx}`}
                          className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs"
                        >
                          <div className="sm:col-span-5 font-bold text-white truncate">
                            {idx + 1}. {row.studentName}
                          </div>
                          <div className="sm:col-span-3">
                            <select
                              value={row.achievement}
                              onChange={(e) =>
                                setPencapaianDetails((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, achievement: e.target.value } : item
                                  )
                                )
                              }
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-amber-300 font-bold"
                            >
                              {PENCAPAIAN_TIERS.map((tier) => (
                                <option key={tier} value={tier}>
                                  {tier}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="sm:col-span-4">
                            <input
                              type="text"
                              value={row.prize || ''}
                              onChange={(e) =>
                                setPencapaianDetails((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, prize: e.target.value } : item
                                  )
                                )
                              }
                              placeholder="Acara / Catatan (cth: Perseorangan L12)"
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-200"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* BLOK B: Maklumat Sumbangan / Tajaan & Perbelanjaan Pertandingan */}
            <div className="p-5 bg-emerald-950/20 border border-emerald-700/40 rounded-2xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                  <HeartHandshake className="w-4 h-4" />
                  Blok B — Maklumat Sumbangan / Tajaan &amp; Perbelanjaan Pertandingan
                </span>
                {isCommunitySumbanganActive && (
                  <span className="px-2.5 py-1 rounded-xl bg-emerald-500/20 border border-emerald-500/50 text-[10px] font-black text-emerald-200">
                    ✓ Auto-Pautan SKPM Standard 2 (Aspek 2.7.1 / A9: Sumbangan Komuniti)
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                    Kategori Sumbangan / Sumber Dana Utama:
                  </label>
                  <select
                    value={kategoriSumbangan}
                    onChange={(e) => {
                      const val = e.target.value;
                      setKategoriSumbangan(val);
                      if (/TIADA KOS/i.test(val)) {
                        setKategoriSumbanganList([]);
                        setJumlahSumbanganRM(0);
                        setKosMakanMinum(0);
                        setKosPengangkutan(0);
                        setKosYuranBahan(0);
                        setKosLain(0);
                      }
                    }}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-emerald-200 font-bold outline-none focus:border-emerald-500"
                  >
                    {SUMBANGAN_KATEGORI_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                    Nama Penyumbang / Penaja (Untuk Laporan Penghargaan):
                  </label>
                  <input
                    type="text"
                    value={namaPenyumbang}
                    onChange={(e) => setNamaPenyumbang(e.target.value)}
                    placeholder="cth: PIBG Sekolah / Lembaga Pengurus Sekolah / YB Dato' ..."
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-emerald-500"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {[
                      'Lembaga Pengurus Sekolah (LPS)',
                      'PIBG Sekolah',
                      'YB Wakil Rakyat',
                      'Persatuan Ibu Bapa & Komuniti',
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setNamaPenyumbang(preset)}
                        className="px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-emerald-950 border border-slate-700 text-[10px] text-slate-300 hover:text-emerald-200 cursor-pointer"
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Multi-source Sumbangan chips */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1.5">
                  Sumber Tambahan (jika ditaja lebih daripada 1 pihak):
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {SUMBANGAN_KATEGORI_OPTIONS.filter((o) => !/TIADA KOS/i.test(o)).map((opt) => {
                    const checked = kategoriSumbanganList.includes(opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() =>
                          setKategoriSumbanganList((prev) =>
                            checked ? prev.filter((x) => x !== opt) : [...prev, opt]
                          )
                        }
                        className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border transition cursor-pointer ${
                          checked
                            ? 'bg-emerald-600 text-white border-emerald-500'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        {checked ? '✓ ' : ''}
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Financial Amounts & Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div>
                  <label className="text-[10px] font-black text-emerald-300 uppercase block">
                    Jumlah Sumbangan (RM)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={jumlahSumbanganRM}
                    onChange={(e) => setJumlahSumbanganRM(Math.max(0, Number(e.target.value) || 0))}
                    className="mt-1 w-full bg-slate-950 border border-emerald-700/60 rounded-xl px-3 py-2 text-xs text-white font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block">
                    Makan &amp; Minum (RM)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={kosMakanMinum}
                    onChange={(e) => setKosMakanMinum(Math.max(0, Number(e.target.value) || 0))}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block">
                    Pengangkutan (RM)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={kosPengangkutan}
                    onChange={(e) => setKosPengangkutan(Math.max(0, Number(e.target.value) || 0))}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block">
                    Yuran / Bahan (RM)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={kosYuranBahan}
                    onChange={(e) => setKosYuranBahan(Math.max(0, Number(e.target.value) || 0))}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block">
                    Kos Lain-lain (RM)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={kosLain}
                    onChange={(e) => setKosLain(Math.max(0, Number(e.target.value) || 0))}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block">
                    No. Baucar / Resit
                  </label>
                  <input
                    type="text"
                    value={noBaucarResit}
                    onChange={(e) => setNoBaucarResit(e.target.value)}
                    placeholder="cth: PIBG-2026/08"
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-emerald-800/40">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-300">
                    Jumlah Perbelanjaan Sebenar:
                  </span>
                  <span className="px-3 py-1 rounded-xl bg-emerald-950 border border-emerald-600/60 text-sm font-black font-mono text-emerald-300">
                    RM {totalPerbelanjaanRM.toFixed(2)}
                  </span>
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-200 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl">
                  <input
                    type="checkbox"
                    checked={paparAmaunPadaOPR}
                    onChange={(e) => setPaparAmaunPadaOPR(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  {paparAmaunPadaOPR ? (
                    <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span className="font-bold">
                    Papar Amaun (RM) pada Poster OPR
                  </span>
                  <span className="text-[10px] text-slate-400">
                    (Nyahaktif untuk pos Facebook awam)
                  </span>
                </label>
              </div>
            </div>

            {/* BLOK C: OPR Narrative Details & 3 Photos */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                  Objektif Program:
                </label>
                <textarea
                  rows={2}
                  value={objective1}
                  onChange={(e) => setObjective1(e.target.value)}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                    Refleksi / Ringkasan Aktiviti:
                  </label>
                  <textarea
                    rows={3}
                    value={reflection}
                    onChange={(e) => setReflection(e.target.value)}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                    Impak Kepada Murid/Sekolah (Standard 5):
                  </label>
                  <textarea
                    rows={3}
                    value={impact}
                    onChange={(e) => setImpact(e.target.value)}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                    Kekuatan Program:
                  </label>
                  <textarea
                    rows={2}
                    value={kekuatan}
                    onChange={(e) => setKekuatan(e.target.value)}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                    Kelemahan &amp; Tindakan Susulan:
                  </label>
                  <textarea
                    rows={2}
                    value={tindakanSusulan || kelemahanCadangan}
                    onChange={(e) => {
                      setTindakanSusulan(e.target.value);
                      setKelemahanCadangan(e.target.value);
                    }}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Image Upload / Pasting (Up to 3 circular + 1 bonus images for OPR card) */}
            <div className="p-5 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-blue-400" />
                  Blok C — Muat Naik Gambar Pertandingan (3 Bingkai Bulat OPR, Maks 4):
                </label>
                <span className="text-[11px] text-slate-400 font-mono">{images.length} / 4</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {images.map((img, idx) => (
                  <div
                    key={idx}
                    className="relative aspect-video rounded-xl overflow-hidden border border-slate-800 group bg-slate-900"
                  >
                    <img src={img} alt={`Gambar ${idx + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute top-1 right-1 p-1 bg-black/70 hover:bg-rose-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                {images.length < 4 && (
                  <label className="aspect-video rounded-xl border-2 border-dashed border-slate-800 hover:border-slate-700 flex flex-col items-center justify-center cursor-pointer text-slate-500 hover:text-slate-300 transition">
                    <Plus className="w-5 h-5 mb-1" />
                    <span className="text-[10px] font-bold">Muat Naik Gambar</span>
                    <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                  </label>
                )}
              </div>

              {images.length < 4 && (
                <div className="flex gap-2 pt-2">
                  <input
                    type="text"
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    placeholder="Atau tampal URL gambar..."
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddImage}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl cursor-pointer"
                  >
                    Tambah URL
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Form Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() =>
                setSppkModalData({
                  programName,
                  organizer,
                  date,
                  endDate,
                  masa,
                  venue,
                  level,
                  unit,
                  guruPengiring:
                    guruPengiring.length > 0 ? guruPengiring : jurulatih,
                  studentIds: selectedStudentIds,
                })
              }
              className="px-4 py-2.5 bg-teal-600/20 hover:bg-teal-600 text-teal-300 hover:text-white border border-teal-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <ClipboardList className="w-4 h-4" />
              <span>Pratonton Borang SPPK 1, 2 &amp; 3</span>
            </button>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleSaveActivity('DRAF_PRA_PERTANDINGAN')}
                disabled={saving}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-bold cursor-pointer"
              >
                Simpan Draf
              </button>
              <button
                type="button"
                onClick={() => handleSaveActivity('SELESAI', { openPrint: true })}
                disabled={saving}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider transition shadow-lg shadow-emerald-600/30 flex items-center gap-2 cursor-pointer"
              >
                {saving ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>{saving ? 'Menyimpan...' : '✅ Sahkan & Cetak OPR (SKAS)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= VIEW 3: SKPM KUALITI@SEKOLAH ONE-PAGE REPORT (OPR) POSTER ================= */}
      {viewMode === 'print-opr' && selectedPrintActivity && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold cursor-pointer"
            >
              ← Kembali
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setSppkModalData({
                    programName: selectedPrintActivity.programName,
                    organizer: selectedPrintActivity.organizer,
                    date: selectedPrintActivity.date,
                    endDate: selectedPrintActivity.endDate,
                    masa: selectedPrintActivity.masa,
                    venue: selectedPrintActivity.venue,
                    level: selectedPrintActivity.level,
                    unit: selectedPrintActivity.unit,
                    guruPengiring:
                      selectedPrintActivity.guruPengiring &&
                      selectedPrintActivity.guruPengiring.length > 0
                        ? selectedPrintActivity.guruPengiring
                        : selectedPrintActivity.jurulatih,
                    studentIds: selectedPrintActivity.studentIds,
                    studentNames: selectedPrintActivity.studentNames,
                  })
                }
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600/25 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500/50 rounded-xl text-xs font-bold cursor-pointer"
              >
                <ClipboardList className="w-4 h-4" />
                <span>Borang SPPK 1, 2 &amp; 3</span>
              </button>

              {(selectedPrintActivity.driveFileUrl || selectedPrintActivity.driveFolderUrl) && (
                <a
                  href={selectedPrintActivity.driveFileUrl || selectedPrintActivity.driveFolderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/60 rounded-xl text-xs font-black transition"
                >
                  <span>📂 Buka di Google Drive Sekolah</span>
                </a>
              )}

              <button
                type="button"
                disabled={syncingDriveActId === selectedPrintActivity.id}
                onClick={() =>
                  void handleSyncActivityToDrive(selectedPrintActivity, 'koko-skas-opr-poster')
                }
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/50 rounded-xl text-xs font-black cursor-pointer disabled:opacity-50"
              >
                <span>
                  {syncingDriveActId === selectedPrintActivity.id
                    ? '⏳ Menyegerak Drive...'
                    : '☁️ Hantar ke Drive Sekolah'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const res = downloadStandalonePrintHtml({
                    elementId: 'koko-skas-opr-poster',
                    title: selectedPrintActivity.programName || 'OPR_Kokurikulum',
                    orientation: 'portrait',
                    singlePage: true,
                  });
                  setBanner({
                    type: res.mode === 'error' ? 'error' : 'info',
                    text: res.message,
                  });
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-700/60 rounded-xl text-xs font-bold cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Muat Turun Fail Cetak (.html)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const res = triggerSmartPrint({
                    elementId: 'koko-skas-opr-poster',
                    title: selectedPrintActivity.programName || 'OPR_Kokurikulum',
                    orientation: 'portrait',
                    singlePage: true,
                    onNotice: (msg) => setBanner({ type: 'info', text: msg }),
                  });
                  if (res.mode !== 'native') {
                    setBanner({
                      type: res.mode === 'error' ? 'error' : 'info',
                      text: res.message,
                    });
                  }
                }}
                className="flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black uppercase shadow cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Poster OPR (1 Muka Surat A4)</span>
              </button>
            </div>
          </div>

          {/* EXACT SKPM KUALITI@SEKOLAH 1-PAGE OPR POSTER LAYOUT */}
          <div
            id="koko-skas-opr-poster"
            className="print-portrait-sheet bg-white text-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 max-w-[794px] print:w-[198mm] print:h-[285mm] print:max-h-[285mm] print:overflow-hidden mx-auto flex flex-col justify-between print:m-0 print:border-none print:shadow-none"
          >
            {/* 1. TOP DARK-TEAL BANNER (#0D3B42) WITH GOLD BOTTOM BORDER */}
            <div className="bg-[#0D3B42] text-white px-5 py-3 border-b-4 border-[#D4AF37] print-color-exact">
              <div className="flex items-center justify-between gap-4 border-b border-teal-700/70 pb-1.5 mb-1.5">
                <span className="text-[11px] font-black uppercase tracking-widest text-[#FDE047]">
                  SKPM Kualiti@Sekolah {(selectedPrintActivity.date || '2026').slice(0, 4)} &bull; {printSkpm.standardGroup}
                </span>
                <div className="flex items-center gap-2 flex-wrap text-[10px] font-bold uppercase tracking-wider text-teal-100">
                  <span>Sub-Standard: {printSkpm.subStandardCode}</span>
                  {printSkpm.standard5Code && (
                    <span className="px-2 py-0.5 rounded bg-teal-900/90 text-[#FDE047] border border-[#D4AF37]/60">
                      Std {printSkpm.standard5Code}
                    </span>
                  )}
                  {(selectedPrintActivity.skpmAspek271Linked ||
                    isSumbanganCommunityLinked(
                      selectedPrintActivity.kategoriSumbangan,
                      selectedPrintActivity.kategoriSumbanganList,
                      Math.max(
                        Number(selectedPrintActivity.jumlahSumbanganRM) || 0,
                        Number(selectedPrintActivity.jumlahPerbelanjaanRM) || 0
                      )
                    )) && (
                    <span className="px-2 py-0.5 rounded bg-emerald-900/90 text-[#FDE047] border border-[#D4AF37]/60">
                      + Std 2 (2.7.1 / A9)
                    </span>
                  )}
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="text-[11px] font-black uppercase tracking-wide text-white leading-tight">
                  {printSkpm.standardTitle}
                </div>
                <div className="text-[10px] font-extrabold uppercase tracking-wide text-teal-100 leading-tight">
                  {printSkpm.aspekTitle}
                </div>
                <p className="text-[10px] italic text-[#FDE047] leading-snug pt-0.5">
                  {printSkpm.kualitiStatement}
                </p>
              </div>
            </div>

            {/* 2. CENTERED SCHOOL CREST + SCHOOL NAME + GIANT TEAL "ONE PAGE REPORT" + PROGRAM TITLE */}
            <div className="px-5 pt-3 pb-2.5 border-b-2 border-slate-200 bg-slate-50/70 text-center space-y-1.5">
              <div className="flex flex-col items-center justify-center gap-1">
                <SchoolLogo
                  src={effectiveSchoolLogo}
                  schoolCode={activeSchoolCode}
                  className="w-14 h-14 bg-white border-slate-300 shadow-sm"
                />
                <div className="text-xs font-black uppercase tracking-wide text-[#0D3B42]">
                  {effectiveSchoolName}
                </div>
                <div className="text-2xl font-black tracking-tight text-[#0D3B42] leading-none">
                  ONE PAGE REPORT
                </div>
                <div className="text-[9.5px] font-extrabold uppercase tracking-widest text-[#B48A18]">
                  {selectedPrintActivity.jenis === 'pertandingan'
                    ? 'LAPORAN PERTANDINGAN & PENCAPAIAN KOKURIKULUM'
                    : 'LAPORAN AKTIVITI & PROGRAM KOKURIKULUM'}
                </div>
              </div>

              <div className="mt-1.5 py-1.5 px-4 rounded-xl bg-[#0D3B42]/5 border border-[#0D3B42]/20">
                <h2 className="text-xs font-black uppercase tracking-wide text-[#0D3B42]">
                  {selectedPrintActivity.programName}
                </h2>
              </div>
            </div>

            {/* 3. TWO-COLUMN BODY: LEFT 3 CIRCULAR OVERLAPPING PHOTOS + RIGHT STRUCTURED CONTENT */}
            <div className="p-4 grid grid-cols-12 gap-4 flex-1 items-start">
              {/* LEFT COLUMN (4 cols): 3 CIRCULAR OVERLAPPING / STACKED PHOTO FRAMES */}
              <div className="col-span-4 flex flex-col items-center justify-start pt-0.5">
                {[0, 1, 2].map((idx) => {
                  const src = selectedPrintActivity.images?.[idx];
                  return (
                    <div
                      key={idx}
                      className={`w-36 h-36 rounded-full border-4 border-[#0D3B42] ring-2 ring-[#D4AF37] overflow-hidden bg-slate-100 flex items-center justify-center shadow-lg print-color-exact ${
                        idx > 0 ? '-mt-3' : ''
                      }`}
                    >
                      {src ? (
                        <img
                          src={src}
                          alt={`Dokumentasi ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-center px-3 text-slate-400">
                          <ImageIcon className="w-5 h-5 mx-auto mb-1 opacity-40" />
                          <span className="text-[10px] font-bold block">Gambar {idx + 1}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* RIGHT COLUMN (8 cols): OBJEKTIF, PENGISIAN, REFLEKSI, IMPAK, METADATA & PREPARED BY PILL */}
              <div className="col-span-8 space-y-2 text-[10.5px] leading-snug">
                {/* 1. Objektif */}
                <div>
                  <h4 className="text-xs font-black uppercase text-[#0D3B42] border-b border-[#D4AF37] pb-0.5 mb-1">
                    Objektif:
                  </h4>
                  <p className="text-slate-800 font-medium">
                    {selectedPrintActivity.objective1 ||
                      'Memperkasakan bakat, disiplin dan penglibatan aktif murid mengikut piawaian kokurikulum KPM.'}
                  </p>
                </div>

                {/* 2. Pengisian Aktiviti (incl. competition achievement & student list if Pertandingan) */}
                <div>
                  <h4 className="text-xs font-black uppercase text-[#0D3B42] border-b border-[#D4AF37] pb-0.5 mb-1">
                    Pengisian Aktiviti:
                  </h4>
                  <ul className="list-disc pl-4 space-y-0.5 text-slate-800 font-medium">
                    <li>
                      Program dianjurkan oleh <strong>{selectedPrintActivity.organizer}</strong>
                      {selectedPrintActivity.unit ? ` (Unit: ${selectedPrintActivity.unit})` : ''}{' '}
                      pada peringkat <strong>{selectedPrintActivity.level}</strong>.
                    </li>
                    {selectedPrintActivity.jenis === 'pertandingan' && (
                      <li>
                        <strong>Pencapaian Rasmi:</strong>{' '}
                        <span className="text-[#0D3B42] font-black">
                          {selectedPrintActivity.pencapaian || 'Penyertaan'}
                        </span>
                        {selectedPrintActivity.pengiktirafan &&
                        selectedPrintActivity.pengiktirafan.length > 0
                          ? ` · Pengiktirafan: ${selectedPrintActivity.pengiktirafan.join(', ')}`
                          : ''}
                      </li>
                    )}
                    <li>
                      <strong>Penyertaan Murid:</strong>{' '}
                      {selectedPrintActivity.participantCount === 0
                        ? '0 Murid (Program Pengurusan / Staf Sahaja)'
                        : `${selectedPrintActivity.participantCount} orang murid${
                            selectedPrintActivity.studentNames &&
                            selectedPrintActivity.studentNames.length > 0
                              ? ` — ${selectedPrintActivity.studentNames.join(', ')}`
                              : ''
                          }`}
                    </li>
                    {selectedPrintActivity.pencapaianDetails &&
                      selectedPrintActivity.pencapaianDetails.length > 0 && (
                        <li>
                          <strong>Keputusan Peserta:</strong>{' '}
                          {selectedPrintActivity.pencapaianDetails
                            .map(
                              (pd) =>
                                `${pd.studentName} (${pd.achievement}${
                                  pd.prize ? ` — ${pd.prize}` : ''
                                })`
                            )
                            .join('; ')}
                        </li>
                      )}
                    {selectedPrintActivity.guruPengiring &&
                      selectedPrintActivity.guruPengiring.length > 0 && (
                        <li>
                          <strong>Guru Pengiring:</strong>{' '}
                          {selectedPrintActivity.guruPengiring.join(', ')}
                        </li>
                      )}
                  </ul>
                </div>

                {/* 3. Refleksi dan Tindakan Susulan */}
                <div>
                  <h4 className="text-xs font-black uppercase text-[#0D3B42] border-b border-[#D4AF37] pb-0.5 mb-1">
                    Refleksi dan Tindakan Susulan:
                  </h4>
                  <ul className="list-disc pl-4 space-y-0.5 text-slate-800 font-medium">
                    {selectedPrintActivity.reflection && (
                      <li>{selectedPrintActivity.reflection}</li>
                    )}
                    {selectedPrintActivity.kekuatan && (
                      <li>
                        <strong>Kekuatan:</strong> {selectedPrintActivity.kekuatan}
                      </li>
                    )}
                    {(selectedPrintActivity.tindakanSusulan ||
                      selectedPrintActivity.kelemahanCadangan) && (
                      <li>
                        <strong>Tindakan Susulan:</strong>{' '}
                        {selectedPrintActivity.tindakanSusulan ||
                          selectedPrintActivity.kelemahanCadangan}
                      </li>
                    )}
                  </ul>
                </div>

                {/* 4. Impak */}
                <div>
                  <h4 className="text-xs font-black uppercase text-[#0D3B42] border-b border-[#D4AF37] pb-0.5 mb-1">
                    Impak:
                  </h4>
                  <p className="text-slate-800 font-medium">
                    {selectedPrintActivity.impact ||
                      'Meningkatkan kemenjadian murid serta menyumbang kepada skor kecemerlangan kokurikulum sekolah.'}
                  </p>
                  {printSkpm.standard5Label && (
                    <p className="text-[10px] font-bold text-[#0D3B42] mt-0.5">
                      Penjajaran KPI: {printSkpm.standard5Label}
                    </p>
                  )}
                </div>

                {/* 5. Metadata Strip (Tarikh, Masa, Tempat, Peringkat, Pencapaian, Sumbangan & Perbelanjaan) */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-[10px] space-y-1.5">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[#0D3B42] shrink-0" />
                      <span>
                        <strong>Tarikh:</strong> {formatMalayDate(selectedPrintActivity.date)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#0D3B42] shrink-0" />
                      <span>
                        <strong>Masa:</strong>{' '}
                        {selectedPrintActivity.masa || '08:00 pagi – 12:30 tengah hari'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#0D3B42] shrink-0" />
                      <span>
                        <strong>Tempat:</strong> {selectedPrintActivity.venue || effectiveSchoolName}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Trophy className="w-3.5 h-3.5 text-[#0D3B42] shrink-0" />
                      <span>
                        <strong>Peringkat:</strong> {selectedPrintActivity.level}
                        {selectedPrintActivity.jenis === 'pertandingan' &&
                        selectedPrintActivity.pencapaian
                          ? ` · ${selectedPrintActivity.pencapaian}`
                          : ''}
                      </span>
                    </div>
                  </div>

                  {/* Sumber Kewangan / Sumbangan & Perbelanjaan */}
                  {(selectedPrintActivity.kategoriSumbangan ||
                    selectedPrintActivity.namaPenyumbang ||
                    (selectedPrintActivity.jumlahPerbelanjaanRM || 0) > 0) && (() => {
                    const m = Number(selectedPrintActivity.kosMakanMinum) || 0;
                    const p = Number(selectedPrintActivity.kosPengangkutan) || 0;
                    const y = Number(selectedPrintActivity.kosYuranBahan) || 0;
                    const l = Number(selectedPrintActivity.kosLain) || 0;
                    const expTotal =
                      selectedPrintActivity.jumlahPerbelanjaanRM !== undefined
                        ? Number(selectedPrintActivity.jumlahPerbelanjaanRM) || 0
                        : computeTotalPerbelanjaan({
                            kosMakanMinum: m,
                            kosPengangkutan: p,
                            kosYuranBahan: y,
                            kosLain: l,
                          });
                    const showRM = selectedPrintActivity.paparAmaunPadaOPR !== false;
                    return (
                      <div className="pt-1.5 border-t border-slate-200 space-y-0.5 text-slate-800">
                        <div>
                          <strong>Sumber Kewangan / Sumbangan:</strong>{' '}
                          {selectedPrintActivity.kategoriSumbangan || 'Sumbangan Sekolah'}
                          {selectedPrintActivity.namaPenyumbang
                            ? ` — ${selectedPrintActivity.namaPenyumbang}`
                            : ''}
                        </div>
                        {showRM &&
                          (expTotal > 0 || (selectedPrintActivity.jumlahSumbanganRM || 0) > 0) && (
                            <div>
                              <strong>Jumlah Perbelanjaan:</strong>{' '}
                              <span className="font-bold text-[#0D3B42]">
                                RM {expTotal.toFixed(2)}
                              </span>{' '}
                              <span className="text-slate-600">
                                (Makan &amp; Minum: RM {m.toFixed(2)} | Pengangkutan: RM{' '}
                                {p.toFixed(2)} | Yuran/Bahan: RM {y.toFixed(2)}
                                {l > 0 ? ` | Lain-lain: RM ${l.toFixed(2)}` : ''})
                              </span>
                            </div>
                          )}
                      </div>
                    );
                  })()}
                </div>

                {/* 6. Bottom Teal Pill: Disediakan oleh */}
                <div className="pt-1 flex justify-end">
                  <div className="inline-block px-4 py-1.5 rounded-full bg-[#0D3B42] text-white text-[10px] font-bold border border-[#D4AF37] print-color-exact">
                    Disediakan oleh:{' '}
                    <span className="font-black text-[#FDE047]">
                      {(
                        (selectedPrintActivity.jurulatih &&
                          selectedPrintActivity.jurulatih[0]) ||
                        selectedPrintActivity.createdBy ||
                        profile.name
                      ).toUpperCase()}
                    </span>{' '}
                    (
                    {selectedPrintActivity.category === 'KOAKADEMIK'
                      ? `Penyelaras ${selectedPrintActivity.unit || 'Koakademik'}`
                      : selectedPrintActivity.unit
                      ? `Jurulatih / Penyelaras ${selectedPrintActivity.unit}`
                      : 'Jurulatih / Guru Penasihat'}
                    )
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>

      <SPPKCompetitionFormsModal
        isOpen={Boolean(sppkModalData)}
        onClose={() => setSppkModalData(null)}
        schoolCode={activeSchoolCode}
        schoolName={effectiveSchoolName}
        schoolLogo={effectiveSchoolLogo}
        schoolSettings={schoolSettings}
        currentUser={profile}
        initialData={sppkModalData}
      />

      {showAnnualFinancialReport && (
        <KokoAnnualSumbanganReport
          isModal
          activities={activities}
          schoolSettings={schoolSettings}
          preparedByName={profile.name}
          onClose={() => setShowAnnualFinancialReport(false)}
        />
      )}
    </div>
  );
}
