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
} from 'lucide-react';
import {
  triggerSmartPrint,
  downloadStandalonePrintHtml,
} from '../../utils/oprPrintHelper';
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
import { deepSanitizeFirestore } from '../../utils/sanitizeFirestore';
import SchoolLogo from '../SchoolLogo';

export interface MaklumanOPRPrefill {
  maklumanTaskId?: string;
  openOprId?: string;
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

  // Form Fields
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

  // SKPM Standard 3.2 & Standard 5 Auto-Detection + Manual Override
  const [skpmManualOverride, setSkpmManualOverride] = useState<boolean>(false);
  const [skpmStandardCode, setSkpmStandardCode] = useState<SKPMKokoStandardCode>('3.2.5.1');
  const [linkedMaklumanTaskId, setLinkedMaklumanTaskId] = useState<string>('');

  // Teacher Role Separation
  const [jurulatih, setJurulatih] = useState<string[]>([]);
  const [guruPengiring, setGuruPengiring] = useState<string[]>([]);

  // Student Participation & Zero-Student Rule
  const [isZeroStudent, setIsZeroStudent] = useState<boolean>(false);
  const [participantCount, setParticipantCount] = useState<number>(1);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentSearch, setStudentSearch] = useState('');

  // Conditional Fields for 'pertandingan'
  const [pencapaian, setPencapaian] = useState<KokoPencapaianTier>('Penyertaan');
  const [pengiktirafan, setPengiktirafan] = useState<KokoPengiktirafanType[]>(['Sijil', 'PAJSK']);

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

  // Search & Filter for list
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLevel, setFilterLevel] = useState<string>('semua');
  const [filterJenis, setFilterJenis] = useState<string>('semua');
  const [filterSkpm, setFilterSkpm] = useState<string>('semua');

  const canEdit = role === 'pentadbir' || role === 'guru';

  // Auto-resolve SKPM Standard whenever form classification changes (unless overridden)
  const resolvedSkpmSpec = useMemo(
    () =>
      autoResolveKokoSKPM({
        category,
        jenis,
        level,
        programName,
        unit,
        manualCode: skpmManualOverride ? skpmStandardCode : undefined,
      }),
    [category, jenis, level, programName, unit, skpmManualOverride, skpmStandardCode]
  );

  useEffect(() => {
    if (!skpmManualOverride) {
      setSkpmStandardCode(resolvedSkpmSpec.code);
    }
  }, [resolvedSkpmSpec.code, skpmManualOverride]);

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

    // Teachers
    async function loadTeachers() {
      try {
        const pSnap = await getDocs(collection(db, 'personnel'));
        const scopedP = pSnap.docs.filter((d) => belongsToSchool(d.data(), activeSchoolCode));
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
  }, [activeSchoolCode]);

  // Handle navigation prefill from Paparan Makluman (either open existing OPR or prefill create form)
  useEffect(() => {
    if (!prefill) return;
    if (prefill.openOprId) {
      const existing = activities.find((a) => a.id === prefill.openOprId);
      if (existing) {
        setSelectedPrintActivity(existing);
        setViewMode('print-opr');
        if (onClearPrefill) onClearPrefill();
        return;
      }
    }
    if (prefill.maklumanTaskId || prefill.programName) {
      setEditingId(null);
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
      setPencapaian('Penyertaan');
      setPengiktirafan(['Sijil', 'PAJSK']);
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
          (act.venue || '').toLowerCase().includes(searchQuery.toLowerCase());
        if (!matchSearch) return false;
        if (filterLevel !== 'semua' && act.level !== filterLevel) return false;
        if (filterJenis !== 'semua' && act.jenis !== filterJenis) return false;
        if (filterSkpm !== 'semua' && resolved.code !== filterSkpm) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [activities, searchQuery, filterLevel, filterJenis, filterSkpm]);

  // Open Form for Create
  const handleOpenCreate = () => {
    setEditingId(null);
    setBanner(null);
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
    setSkpmStandardCode('3.2.5.1');
    setLinkedMaklumanTaskId('');
    setJurulatih([profile.name.toUpperCase()]);
    setGuruPengiring([]);
    setIsZeroStudent(false);
    setParticipantCount(1);
    setSelectedStudentIds([]);
    setPencapaian('Penyertaan');
    setPengiktirafan(['Sijil', 'PAJSK']);
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

  // Open Form for Edit
  const handleOpenEdit = (act: KokoActivity) => {
    setBanner(null);
    setEditingId(act.id || null);
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
    if (act.skpmStandardCode) {
      setSkpmManualOverride(true);
      setSkpmStandardCode(getKokoSKPMOption(act.skpmStandardCode).code);
    } else {
      setSkpmManualOverride(false);
    }
    setLinkedMaklumanTaskId(act.linkedMaklumanTaskId || '');
    setJurulatih(act.jurulatih || []);
    setGuruPengiring(act.guruPengiring || []);
    setIsZeroStudent(act.participantCount === 0);
    setParticipantCount(act.participantCount || 0);
    setSelectedStudentIds(act.studentIds || []);
    setPencapaian((act.pencapaian as KokoPencapaianTier) || 'Penyertaan');
    setPengiktirafan((act.pengiktirafan as KokoPengiktirafanType[]) || ['Sijil']);
    setObjective1(act.objective1 || '');
    setReflection(act.reflection || '');
    setImpact(act.impact || '');
    setKekuatan(act.kekuatan || '');
    setKelemahanCadangan(act.kelemahanCadangan || '');
    setTindakanSusulan(act.tindakanSusulan || '');
    setImages(act.images || []);
    setViewMode('form');
  };

  // Open Print OPR
  const handleOpenPrintOpr = (act: KokoActivity) => {
    setSelectedPrintActivity(act);
    setViewMode('print-opr');
  };

  // Handle Save + AI Setiausaha Sync + Paparan Makluman Auto-Complete
  const handleSaveActivity = async () => {
    if (!programName.trim()) {
      setBanner({ type: 'error', text: 'Sila masukkan Nama Program / Pertandingan.' });
      return;
    }

    setSaving(true);
    setBanner(null);

    const effectiveCount = isZeroStudent
      ? 0
      : Math.max(participantCount, selectedStudentIds.length);
    const selectedStudentNames = isZeroStudent
      ? []
      : students.filter((s) => selectedStudentIds.includes(s.id || '')).map((s) => s.name);

    const skpm = resolvedSkpmSpec;
    const yearStr = date ? date.slice(0, 4) : '2026';

    const payload = deepSanitizeFirestore({
      schoolCode: activeSchoolCode,
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
      skpmStandardCode: skpm.code,
      skpmStandardTitle: skpm.standardTitle,
      skpmAspekTitle: skpm.aspekTitle,
      skpmKualitiStatement: skpm.kualitiStatement,
      skpmStandard5Code: skpm.standard5Code || (jenis === 'pertandingan' ? '5.2 & 5.4' : '5.2'),
      skpmStandard5Label:
        skpm.standard5Label ||
        'STANDARD 5 (Aspek 5.2) : Kemenjadian Murid dalam Kokurikulum',
      linkedMaklumanTaskId: linkedMaklumanTaskId || '',
      jurulatih,
      guruPengiring,
      participantCount: effectiveCount,
      studentIds: isZeroStudent ? [] : selectedStudentIds,
      studentNames: selectedStudentNames,
      objective1,
      reflection,
      impact,
      kekuatan,
      kelemahanCadangan,
      tindakanSusulan,
      images,
      createdBy: profile.name,
      academicYear: yearStr || '2026',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...(jenis === 'pertandingan'
        ? {
            pencapaian,
            pengiktirafan,
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
      }

      // Sync to AI Setiausaha Hub (`ai_setiausaha_documents`) under Standard 3.2 (+ dual-link Standard 5)
      if (savedActivityId) {
        const setiausahaDocId = scopedDocId(activeSchoolCode, `koko_opr_${savedActivityId}`);
        const pengisianList: string[] = [
          `Penganjur: ${payload.organizer}${payload.unit ? ` · Unit: ${payload.unit}` : ''} (Peringkat: ${payload.level})`,
          ...(jenis === 'pertandingan'
            ? [
                `Pencapaian Rasmi: ${pencapaian} (${pengiktirafan.join(', ') || 'Sijil'})`,
                selectedStudentNames.length > 0
                  ? `Peserta / Atlet (${effectiveCount} Orang): ${selectedStudentNames.join(', ')}`
                  : `Bilangan Peserta: ${effectiveCount} orang murid`,
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
        ];

        const refleksiList = [
          reflection ? `Refleksi: ${reflection}` : '',
          kekuatan ? `Kekuatan: ${kekuatan}` : '',
          kelemahanCadangan ? `Penambahbaikan: ${kelemahanCadangan}` : '',
          tindakanSusulan ? `Tindakan Susulan: ${tindakanSusulan}` : '',
        ].filter(Boolean);

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
          skpmBucket: 'Std 3.2',
          secondarySkpmBucket:
            skpm.standard5Code || jenis === 'pertandingan' ? 'Std 5' : undefined,
          skpmCodeBadge: skpm.standard5Code
            ? `${skpm.code} + Std ${skpm.standard5Code}`
            : skpm.code,
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
          objektif: [objective1].filter(Boolean),
          pengisianAktiviti: pengisianList,
          impak: [impact, payload.skpmStandard5Label].filter(Boolean) as string[],
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

      // Auto-complete linked Paparan Makluman PERTANDINGAN / AKTIVITI task
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

      setViewMode('list');
      setBanner({
        type: 'success',
        text: `OPR "${payload.programName}" (${skpm.code}${
          skpm.standard5Code ? ` & Std ${skpm.standard5Code}` : ''
        }) disimpan & disegerakkan ke AI Setiausaha!`,
      });
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
    if (!selectedPrintActivity) return getKokoSKPMOption('3.2.4.1');
    const base = autoResolveKokoSKPM({
      category: selectedPrintActivity.category,
      jenis: selectedPrintActivity.jenis,
      level: selectedPrintActivity.level,
      programName: selectedPrintActivity.programName,
      unit: selectedPrintActivity.unit,
      manualCode: selectedPrintActivity.skpmStandardCode,
    });
    return {
      ...base,
      standardTitle: selectedPrintActivity.skpmStandardTitle || base.standardTitle,
      aspekTitle: selectedPrintActivity.skpmAspekTitle || base.aspekTitle,
      kualitiStatement:
        selectedPrintActivity.skpmKualitiStatement || base.kualitiStatement,
      standard5Code: selectedPrintActivity.skpmStandard5Code || base.standard5Code,
      standard5Label: selectedPrintActivity.skpmStandard5Label || base.standard5Label,
    };
  }, [selectedPrintActivity]);

  return (
    <div className="space-y-6">
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
                Auto-pemetaan SKPM Kualiti@Sekolah Standard 3.2 (Aspek 3.2.1–3.2.7) &amp; Standard 5 (5.2 / 5.4) · Disegerak dengan AI Setiausaha &amp; Makluman
              </p>
            </div>
          </div>
        </div>

        {canEdit && viewMode === 'list' && (
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition shadow-lg shadow-amber-600/30 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Cipta Laporan OPR Baru</span>
          </button>
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
          {/* Search & Filters */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama program, penganjur, atau tempat..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
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

              return (
                <div
                  key={act.id}
                  className="bg-slate-900 border border-slate-800 hover:border-teal-600/60 rounded-3xl p-5 shadow-lg flex flex-col justify-between transition-all space-y-4"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
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
                      </div>

                      <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-slate-800 text-slate-300 border border-slate-700 shrink-0">
                        {act.level}
                      </span>
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

                      {act.jenis === 'pertandingan' && act.pencapaian && (
                        <div className="text-amber-400 font-bold flex items-center gap-1 mt-1">
                          <Award className="w-3.5 h-3.5" />
                          <span>Pencapaian: {act.pencapaian}</span>
                        </div>
                      )}
                    </div>

                    {/* Teacher involvement tags */}
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

                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                    <button
                      onClick={() => handleOpenPrintOpr(act)}
                      className="flex items-center gap-1 text-xs font-bold text-teal-400 hover:text-teal-300 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Lihat Poster OPR</span>
                    </button>

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

      {/* ================= VIEW 2: FORM (CREATE / EDIT) ================= */}
      {viewMode === 'form' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-bold text-white">
                {editingId ? 'Kemaskini Laporan OPR (SKPM 3.2 & 5)' : 'Daftar Laporan OPR Baharu'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Auto-pautan kepada SKPM Kualiti@Sekolah &amp; penyegerakan arkib AI Setiausaha
              </p>
            </div>
            <div className="text-xs font-mono font-bold text-teal-300">
              Kod SKAS: {resolvedSkpmSpec.code}
              {resolvedSkpmSpec.standard5Code ? ` · Std ${resolvedSkpmSpec.standard5Code}` : ''}
            </div>
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
                <span className="text-[10px] opacity-80">(Perlu Pencapaian &amp; Hadiah)</span>
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                  Tarikh Program:
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                  Masa Pelaksanaan:
                </label>
                <input
                  type="text"
                  value={masa}
                  onChange={(e) => setMasa(e.target.value)}
                  placeholder="08:00 pagi – 12:30 tengah hari"
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-amber-500"
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

          {/* 2B. Auto-Resolved SKPM Kualiti@Sekolah Standard 3.2 & Standard 5 Card */}
          <div className="p-5 bg-teal-950/30 border border-teal-700/50 rounded-2xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-teal-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Pemetaan Automatik SKPM Kualiti@Sekolah (SKAS Std 3.2 &amp; Std 5)
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Dipilih secara automatik mengikut kategori, jenis &amp; peringkat program (boleh ditukar manual).
                </p>
              </div>
              {skpmManualOverride && (
                <button
                  type="button"
                  onClick={() => setSkpmManualOverride(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-teal-300 flex items-center gap-1 cursor-pointer self-start"
                >
                  <RefreshCw className="w-3 h-3" /> Guna Auto-Kesan
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
              <div className="lg:col-span-5">
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  Aspek Standard Kualiti (3.2.1.1 – 3.2.7.1):
                </label>
                <select
                  value={resolvedSkpmSpec.code}
                  onChange={(e) => {
                    setSkpmManualOverride(true);
                    setSkpmStandardCode(e.target.value as SKPMKokoStandardCode);
                  }}
                  className="w-full bg-slate-950 border border-teal-700/70 rounded-xl px-3 py-2 text-xs font-bold text-teal-200 outline-none"
                >
                  {SKPM_KOKO_STANDARD_OPTIONS.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.shortTitle}
                    </option>
                  ))}
                </select>
              </div>
              <div className="lg:col-span-7 bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-1 text-[11px]">
                <div className="font-black text-white">
                  {resolvedSkpmSpec.standardTitle} · {resolvedSkpmSpec.aspekTitle}
                </div>
                <div className="italic text-amber-300">{resolvedSkpmSpec.kualitiStatement}</div>
                {resolvedSkpmSpec.standard5Label && (
                  <div className="text-purple-300 font-bold">
                    Dual-Link KPI: {resolvedSkpmSpec.standard5Label}
                  </div>
                )}
              </div>
            </div>

            {pendingMaklumanTasks.length > 0 && (
              <div className="pt-2 border-t border-teal-800/40">
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  Pautkan ke Tugasan Paparan Makluman (Auto-tanda Selesai apabila OPR disimpan):
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

          {/* 3. Conditional: Pertandingan Pencapaian & Pengiktirafan */}
          {jenis === 'pertandingan' && (
            <div className="p-5 bg-amber-950/30 border border-amber-600/40 rounded-2xl space-y-4">
              <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Award className="w-4 h-4" />
                Maklumat Pencapaian &amp; Pengiktirafan Rasmi (Standard 5.4)
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                    Pencapaian:
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
            </div>
          )}

          {/* 4. Teacher Roles Separation: Jurulatih vs Guru Pengiring */}
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

          {/* 5. Student Participation & Zero-Student Rule */}
          <div className="p-5 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-emerald-400" />
                Penyertaan Murid
              </span>

              <label className="flex items-center gap-2 cursor-pointer bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
                <input
                  type="checkbox"
                  checked={isZeroStudent}
                  onChange={(e) => setIsZeroStudent(e.target.checked)}
                  className="rounded border-slate-700 text-blue-600 focus:ring-0"
                />
                <span className="text-xs font-bold text-amber-300">
                  Zero-Student Rule (0 Murid: Mesyuarat / Kursus Guru / Pengurusan Sahaja)
                </span>
              </label>
            </div>

            {!isZeroStudent ? (
              <div className="space-y-3">
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
                      className="mt-1 w-28 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white font-mono font-bold"
                    />
                  </div>
                  <div className="text-xs text-slate-400 mt-5">
                    Dipilih:{' '}
                    <span className="text-white font-bold">
                      {selectedStudentIds.length} orang murid
                    </span>
                  </div>
                </div>

                {/* Quick Student Selector */}
                <div className="space-y-2">
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Tapis senarai murid untuk ditandakan..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white outline-none"
                  />
                  <div className="max-h-40 overflow-y-auto border border-slate-800 rounded-xl p-2 bg-slate-900/60 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1">
                    {students
                      .filter((s) =>
                        (s.name || '').toLowerCase().includes(studentSearch.toLowerCase())
                      )
                      .slice(0, 30)
                      .map((st) => {
                        const isSelected = selectedStudentIds.includes(st.id || '');
                        return (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => {
                              if (isSelected)
                                setSelectedStudentIds((prev) => prev.filter((id) => id !== st.id));
                              else setSelectedStudentIds((prev) => [...prev, st.id || '']);
                            }}
                            className={`text-left px-2 py-1 rounded text-[11px] truncate flex items-center justify-between cursor-pointer ${
                              isSelected
                                ? 'bg-emerald-950 text-emerald-300 font-bold'
                                : 'text-slate-400 hover:bg-slate-800'
                            }`}
                          >
                            <span className="truncate">
                              {st.name} ({st.class || '-'})
                            </span>
                            {isSelected && (
                              <Check className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                            )}
                          </button>
                        );
                      })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-amber-950/20 border border-amber-700/40 rounded-xl text-xs text-amber-300">
                ✓ Mod Zero-Student aktif. Rekod akan disimpan dengan 0 bilangan murid terlibat.
              </div>
            )}
          </div>

          {/* 6. OPR Narrative Details */}
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

          {/* 7. Image Upload / Pasting (Up to 3 circular + 1 bonus images for OPR card) */}
          <div className="p-5 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-blue-400" />
                Gambar Dokumentasi Poster OPR (3 Bingkai Bulat Utama, Maks 4):
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

          {/* Form Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSaveActivity}
              disabled={saving}
              className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider transition shadow-lg shadow-amber-600/30 flex items-center gap-2 cursor-pointer"
            >
              {saving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>{saving ? 'Menyimpan...' : 'Simpan Laporan OPR'}</span>
            </button>
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
                onClick={() => {
                  const res = downloadStandalonePrintHtml({
                    elementId: 'koko-skas-opr-poster',
                    title: selectedPrintActivity.programName || 'OPR_Kokurikulum',
                    orientation: 'portrait',
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
                <span>Cetak Poster OPR (A4)</span>
              </button>
            </div>
          </div>

          {/* EXACT SKPM KUALITI@SEKOLAH OPR POSTER LAYOUT */}
          <div
            id="koko-skas-opr-poster"
            className="print-portrait-sheet bg-white text-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 max-w-[794px] mx-auto flex flex-col print:m-0 print:border-none print:shadow-none print:overflow-visible"
          >
            {/* 1. TOP DARK-TEAL BANNER (#0D3B42) WITH GOLD BOTTOM BORDER */}
            <div className="bg-[#0D3B42] text-white px-6 py-4 border-b-4 border-[#D4AF37] print-color-exact">
              <div className="flex items-center justify-between gap-4 border-b border-teal-700/70 pb-2 mb-2">
                <span className="text-xs font-black uppercase tracking-widest text-[#FDE047]">
                  SKPM Kualiti@Sekolah {(selectedPrintActivity.date || '2026').slice(0, 4)}
                </span>
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-teal-100">
                  <span>Kod: {printSkpm.code}</span>
                  {printSkpm.standard5Code && (
                    <span className="px-2 py-0.5 rounded bg-teal-900/90 text-[#FDE047] border border-[#D4AF37]/60">
                      Std {printSkpm.standard5Code}
                    </span>
                  )}
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="text-xs font-black uppercase tracking-wide text-white">
                  {printSkpm.standardTitle}
                </div>
                <div className="text-[11px] font-extrabold uppercase tracking-wide text-teal-100">
                  {printSkpm.aspekTitle}
                </div>
                <p className="text-[11px] italic text-[#FDE047] leading-snug pt-0.5">
                  {printSkpm.kualitiStatement}
                </p>
              </div>
            </div>

            {/* 2. CENTERED SCHOOL CREST + SCHOOL NAME + GIANT TEAL "ONE PAGE REPORT" + PROGRAM TITLE */}
            <div className="px-6 pt-5 pb-4 border-b-2 border-slate-200 bg-slate-50/70 text-center space-y-2">
              <div className="flex flex-col items-center justify-center gap-1.5">
                <SchoolLogo
                  src={effectiveSchoolLogo}
                  schoolCode={activeSchoolCode}
                  className="w-16 h-16 bg-white border-slate-300 shadow-sm"
                />
                <div className="text-sm font-black uppercase tracking-wide text-[#0D3B42]">
                  {effectiveSchoolName}
                </div>
                <div className="text-3xl font-black tracking-tight text-[#0D3B42] leading-none pt-0.5">
                  ONE PAGE REPORT
                </div>
                <div className="text-[10px] font-extrabold uppercase tracking-widest text-[#B48A18]">
                  {selectedPrintActivity.jenis === 'pertandingan'
                    ? 'LAPORAN PERTANDINGAN & PENCAPAIAN KOKURIKULUM'
                    : 'LAPORAN AKTIVITI & PROGRAM KOKURIKULUM'}
                </div>
              </div>

              <div className="mt-2 py-2 px-4 rounded-xl bg-[#0D3B42]/5 border border-[#0D3B42]/20">
                <h2 className="text-sm font-black uppercase tracking-wide text-[#0D3B42]">
                  {selectedPrintActivity.programName}
                </h2>
              </div>
            </div>

            {/* 3. TWO-COLUMN BODY: LEFT 3 CIRCULAR OVERLAPPING PHOTOS + RIGHT STRUCTURED CONTENT */}
            <div className="p-6 grid grid-cols-12 gap-5 flex-1 items-start">
              {/* LEFT COLUMN (4 cols): 3 CIRCULAR OVERLAPPING / STACKED PHOTO FRAMES */}
              <div className="col-span-4 flex flex-col items-center justify-start pt-1">
                {[0, 1, 2].map((idx) => {
                  const src = selectedPrintActivity.images?.[idx];
                  return (
                    <div
                      key={idx}
                      className={`w-40 h-40 rounded-full border-4 border-[#0D3B42] ring-2 ring-[#D4AF37] overflow-hidden bg-slate-100 flex items-center justify-center shadow-lg print-color-exact ${
                        idx > 0 ? '-mt-4' : ''
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
                          <ImageIcon className="w-6 h-6 mx-auto mb-1 opacity-40" />
                          <span className="text-[10px] font-bold block">Gambar {idx + 1}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* RIGHT COLUMN (8 cols): OBJEKTIF, PENGISIAN, REFLEKSI, IMPAK, METADATA & PREPARED BY PILL */}
              <div className="col-span-8 space-y-3 text-[11px] leading-relaxed">
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

                {/* 5. Metadata Strip (Tarikh, Masa, Tempat, Peringkat, Pencapaian) */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-[10px]">
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
  );
}
