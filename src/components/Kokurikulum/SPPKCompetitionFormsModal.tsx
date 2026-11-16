import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Car,
  ClipboardList,
  Download,
  Edit3,
  HeartPulse,
  MessageSquare,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  GuardianInfo,
  PersonnelProfile,
  ResidentialAddress,
  SchoolSettings,
  Student,
  StudentMaster,
  UserProfile,
} from '../../types';
import { KokoActivity } from '../../types/kokurikulum';
import { useSchoolTenant } from '../../contexts/SchoolTenantContext';
import {
  belongsToSchool,
  isLegacyDefaultSchool,
  normalizeActiveSchoolCode,
} from '../../utils/schoolTenant';
import {
  downloadStandalonePrintHtml,
  triggerSmartPrint,
} from '../../utils/oprPrintHelper';
import SchoolLogo from '../SchoolLogo';

export interface SPPKInitialData {
  programName?: string;
  organizer?: string;
  date?: string;
  endDate?: string;
  masa?: string;
  venue?: string;
  level?: string;
  unit?: string;
  guruPengiring?: string[];
  studentIds?: string[];
  studentNames?: string[];
}

interface SPPKCompetitionFormsModalProps {
  isOpen: boolean;
  onClose: () => void;
  schoolCode?: string;
  schoolName?: string;
  schoolLogo?: string;
  schoolSettings?: SchoolSettings | null;
  currentUser?: UserProfile | null;
  initialData?: SPPKInitialData | null;
}

interface UnifiedStudentRecord {
  id: string;
  apdmId?: string;
  name: string;
  icNumber: string;
  birthDate: string;
  age: string;
  gender: 'LELAKI' | 'PEREMPUAN' | '';
  className: string;
  yearLevel: string;
  guardian1Name: string;
  guardian1Ic: string;
  guardian1Occupation: string;
  guardian1Relation: string;
  guardian1Mobile: string;
  guardian1Office: string;
  guardian2Name: string;
  guardian2Mobile: string;
  fullAddress: string;
}

interface StudentHealthFlags {
  asthma: boolean;
  asthmaNote: string;
  allergy: boolean;
  allergyNote: string;
  heart: boolean;
  heartNote: string;
  seizure: boolean;
  seizureNote: string;
  diabetes: boolean;
  diabetesNote: string;
  other: boolean;
  otherNote: string;
  postIllness: string;
  postTreatment: string;
}

interface StudentEditableOverride {
  name: string;
  icNumber: string;
  birthDate: string;
  age: string;
  gender: string;
  className: string;
  guardian1Name: string;
  guardian1Ic: string;
  guardian1Occupation: string;
  guardian1Relation: string;
  guardian1Mobile: string;
  guardian1Office: string;
  guardian2Name: string;
  guardian2Mobile: string;
  fullAddress: string;
  health: StudentHealthFlags;
}

interface UnifiedTeacherRecord {
  id: string;
  name: string;
  ic: string;
  position: string;
  grade: string;
  phone: string;
  vehicleModel: string;
  vehiclePlateNo: string;
  licenseClass: string;
}

type PreviewTab = 'ALL' | 'SPPK1' | 'SPPK2' | 'SPPK3' | 'KENDERAAN';

const DEFAULT_HEALTH_FLAGS: StudentHealthFlags = {
  asthma: false,
  asthmaNote: '',
  allergy: false,
  allergyNote: '',
  heart: false,
  heartNote: '',
  seizure: false,
  seizureNote: '',
  diabetes: false,
  diabetesNote: '',
  other: false,
  otherNote: '',
  postIllness: '',
  postTreatment: '',
};

function cleanString(val: unknown): string {
  return String(val ?? '').trim();
}

function normalizeKey(val: unknown): string {
  return String(val ?? '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDigits(val: unknown): string {
  return String(val ?? '').replace(/\D+/g, '');
}

function formatAddress(addr?: ResidentialAddress | string | null): string {
  if (!addr) return '';
  if (typeof addr === 'string') return addr.trim();
  const parts = [
    addr.address1,
    addr.address2,
    [addr.postcode, addr.city].filter(Boolean).join(' '),
    addr.state,
  ]
    .map((p) => cleanString(p))
    .filter(Boolean);
  return parts.join(', ');
}

function deriveBirthDetailsFromIc(icRaw: string, refYear: number): {
  birthDate: string;
  age: string;
  gender: 'LELAKI' | 'PEREMPUAN' | '';
} {
  const digits = normalizeDigits(icRaw);
  if (digits.length < 6) return { birthDate: '', age: '', gender: '' };
  const yy = parseInt(digits.slice(0, 2), 10);
  const mm = digits.slice(2, 4);
  const dd = digits.slice(4, 6);
  const monthNum = parseInt(mm, 10);
  const dayNum = parseInt(dd, 10);
  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
    return { birthDate: '', age: '', gender: '' };
  }
  const currentTwoDigit = refYear % 100;
  const fullYear = yy <= currentTwoDigit + 2 ? 2000 + yy : 1900 + yy;
  const ageVal = refYear - fullYear;
  let gender: 'LELAKI' | 'PEREMPUAN' | '' = '';
  if (digits.length === 12) {
    const lastDigit = parseInt(digits[11], 10);
    if (!Number.isNaN(lastDigit)) {
      gender = lastDigit % 2 === 1 ? 'LELAKI' : 'PEREMPUAN';
    }
  }
  return {
    birthDate: `${dd}/${mm}/${fullYear}`,
    age: ageVal > 0 && ageVal < 25 ? `${ageVal} Tahun` : '',
    gender,
  };
}

function formatMalayDate(dateStr?: string): string {
  if (!dateStr) return '....................';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
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
  const mIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  return `${day} ${months[mIdx] || parts[1]} ${parts[0]}`;
}

function formatGenderLabel(g?: string): 'LELAKI' | 'PEREMPUAN' | '' {
  const u = normalizeKey(g);
  if (!u) return '';
  if (u === 'L' || u === 'LELAKI' || u === 'M' || u === 'MALE') return 'LELAKI';
  if (u === 'P' || u === 'PEREMPUAN' || u === 'F' || u === 'FEMALE') return 'PEREMPUAN';
  return '';
}

function formatWhatsAppPhone(phoneRaw?: string): string {
  const digits = normalizeDigits(phoneRaw);
  if (!digits || digits.length < 8) return '';
  if (digits.startsWith('60')) return digits;
  if (digits.startsWith('0')) return `6${digits}`;
  return `60${digits}`;
}

function getVehicleStorageKey(schoolCode: string, teacherName: string): string {
  return `isepadu_sppk_vehicle_${schoolCode}_${normalizeKey(teacherName)}`;
}

export const SPPKCompetitionFormsModal: React.FC<SPPKCompetitionFormsModalProps> = ({
  isOpen,
  onClose,
  schoolCode: propSchoolCode,
  schoolName: propSchoolName,
  schoolLogo: propSchoolLogo,
  schoolSettings: propSchoolSettings,
  currentUser,
  initialData,
}) => {
  const tenant = useSchoolTenant();
  const activeSchoolCode = normalizeActiveSchoolCode(propSchoolCode || tenant.schoolCode);
  const schoolSettingsExtra = propSchoolSettings as
    | (SchoolSettings & {
        academicYear?: string;
        address?: string;
        phone?: string;
      })
    | null
    | undefined;
  const academicYearNum =
    parseInt(
      cleanString(
        currentUser?.academic_year ||
          schoolSettingsExtra?.academicYear ||
          new Date().getFullYear()
      ),
      10
    ) || new Date().getFullYear();

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);

  // Loaded SSOT Collections
  const [allStudents, setAllStudents] = useState<UnifiedStudentRecord[]>([]);
  const [allTeachers, setAllTeachers] = useState<UnifiedTeacherRecord[]>([]);
  const [kokoActivities, setKokoActivities] = useState<KokoActivity[]>([]);
  const [fetchedSchoolMeta, setFetchedSchoolMeta] = useState<{
    name?: string;
    logo?: string;
    address?: string;
    phone?: string;
    email?: string;
    guruBesarName?: string;
  }>({});

  // Editable Code Labels
  const [sppk1Label, setSppk1Label] = useState('BORANG SPPK 1');
  const [sppk2Label, setSppk2Label] = useState('BORANG SPPK 2');
  const [sppk3Label, setSppk3Label] = useState('BORANG SPPK 3');

  // Competition Metadata
  const [selectedActivityId, setSelectedActivityId] = useState('');
  const [programName, setProgramName] = useState('');
  const [organizer, setOrganizer] = useState('PPD / JPN / KPM');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [masa, setMasa] = useState('07:30 pagi – 02:00 petang');
  const [venue, setVenue] = useState('');
  const [level, setLevel] = useState('Daerah / Bahagian');
  const [guruBesarName, setGuruBesarName] = useState('');

  // Teacher / Vehicle State
  const [selectedTeacherName, setSelectedTeacherName] = useState('');
  const [teacherIc, setTeacherIc] = useState('');
  const [teacherPosition, setTeacherPosition] = useState('Guru Pengiring / PPP');
  const [teacherGrade, setTeacherGrade] = useState('DG41');
  const [teacherPhone, setTeacherPhone] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehiclePlateNo, setVehiclePlateNo] = useState('');
  const [licenseClass, setLicenseClass] = useState('D');

  // Student Multi-Select & Per-Student Overrides
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentOverrides, setStudentOverrides] = useState<Record<string, StudentEditableOverride>>({});
  const [studentSearch, setStudentSearch] = useState('');
  const [classFilter, setClassFilter] = useState('SEMUA');
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);

  // Preview Tab & Panel Collapse
  const [previewTab, setPreviewTab] = useState<PreviewTab>('ALL');
  const [showEditorPanel, setShowEditorPanel] = useState(true);

  const effectiveSchoolName =
    propSchoolName ||
    propSchoolSettings?.schoolName ||
    fetchedSchoolMeta.name ||
    tenant.schoolName ||
    'SJK(C) CHUNG HUA BINTULU';
  const effectiveSchoolLogo =
    propSchoolLogo ||
    propSchoolSettings?.schoolLogo ||
    propSchoolSettings?.logoUrl ||
    fetchedSchoolMeta.logo ||
    tenant.schoolLogo;
  const effectiveSchoolAddress =
    schoolSettingsExtra?.address || fetchedSchoolMeta.address || '';
  const effectiveSchoolPhone =
    schoolSettingsExtra?.phone || fetchedSchoolMeta.phone || '';

  // Load Firestore SSOT when modal opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const loadSSOT = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [masterSnap, studentsSnap, personnelSnap, usersSnap, kokoSnap] =
          await Promise.all([
            getDocs(collection(db, 'student_master')).catch(() => null),
            getDocs(collection(db, 'students')).catch(() => null),
            getDocs(collection(db, 'personnel')).catch(() => null),
            getDocs(collection(db, 'users')).catch(() => null),
            getDocs(collection(db, 'koko_activities')).catch(() => null),
          ]);

        // Also fetch school settings metadata (Guru Besar name, address, phone)
        try {
          const schoolRef = isLegacyDefaultSchool(activeSchoolCode)
            ? doc(db, 'school_settings', 'general')
            : doc(db, 'schools', activeSchoolCode);
          const sSnap = await getDoc(schoolRef);
          if (!cancelled && sSnap.exists()) {
            const sd = sSnap.data() as any;
            setFetchedSchoolMeta({
              name: sd.schoolName || sd.name || '',
              logo: sd.logoUrl || sd.schoolLogo || '',
              address: sd.address || '',
              phone: sd.phone || '',
              email: sd.email || '',
              guruBesarName: sd.principalName || sd.guruBesarName || '',
            });
          }
        } catch {
          // Optional fallback
        }

        if (cancelled) return;

        // 1. Merge student_master and students into UnifiedStudentRecord[]
        const masterList: StudentMaster[] = masterSnap
          ? masterSnap.docs
              .filter((d) => belongsToSchool(d.data(), activeSchoolCode))
              .map((d) => ({ ...(d.data() as StudentMaster), student_id: d.id }))
          : [];

        const activeStudents: Student[] = studentsSnap
          ? studentsSnap.docs
              .filter((d) => belongsToSchool(d.data(), activeSchoolCode))
              .map((d) => ({ ...(d.data() as Student), id: d.id }))
          : [];

        const masterByApdm = new Map<string, StudentMaster>();
        const masterByIc = new Map<string, StudentMaster>();
        const masterByName = new Map<string, StudentMaster>();

        masterList.forEach((m) => {
          if (m.apdmId) masterByApdm.set(normalizeKey(m.apdmId), m);
          if (m.student_id) masterByApdm.set(normalizeKey(m.student_id), m);
          const icDig = normalizeDigits(m.icNumber);
          if (icDig) masterByIc.set(icDig, m);
          if (m.name) masterByName.set(normalizeKey(m.name), m);
        });

        const mergedMap = new Map<string, UnifiedStudentRecord>();

        const buildRecord = (
          id: string,
          act?: Student | null,
          mast?: StudentMaster | null
        ): UnifiedStudentRecord => {
          const ic =
            cleanString(mast?.icNumber) ||
            cleanString(act?.icNumber) ||
            cleanString((act as any)?.noKp) ||
            cleanString(mast?.maskedIc);
          const derived = deriveBirthDetailsFromIc(ic, academicYearNum);
          const actAny = act as (Student & Record<string, any>) | null | undefined;
          const g1: GuardianInfo | undefined = mast?.guardian1 || actAny?.guardian1;
          const g2: GuardianInfo | undefined = mast?.guardian2 || actAny?.guardian2;
          const addr = mast?.address || actAny?.address;

          const birthDateRaw = cleanString(mast?.birthDate) || cleanString(act?.birthDate);
          let ageStr = '';
          if (mast?.age && Number(mast.age) > 0) {
            ageStr = `${mast.age} Tahun`;
          } else if (mast?.birthYear && Number(mast.birthYear) > 1990) {
            ageStr = `${academicYearNum - Number(mast.birthYear)} Tahun`;
          } else {
            ageStr = derived.age;
          }

          const className =
            cleanString(actAny?.currentClass) ||
            cleanString(act?.class) ||
            cleanString(mast?.currentClass) ||
            '';

          const yearVal =
            actAny?.currentYear ||
            mast?.currentYear ||
            (className.match(/^([1-6])\s/)?.[1] ? Number(className.match(/^([1-6])\s/)?.[1]) : 0);

          return {
            id,
            apdmId: cleanString(mast?.apdmId || act?.apdmId || ''),
            name: cleanString(mast?.name || act?.name),
            icNumber: ic,
            birthDate: birthDateRaw || derived.birthDate,
            age: ageStr,
            gender:
              formatGenderLabel(mast?.gender || act?.gender) || derived.gender,
            className,
            yearLevel: yearVal ? `Tahun ${yearVal}` : className,
            guardian1Name:
              cleanString(g1?.name) ||
              cleanString((act as any)?.parentName) ||
              cleanString((act as any)?.guardianName),
            guardian1Ic: cleanString(g1?.icNumber),
            guardian1Occupation: cleanString(g1?.occupation),
            guardian1Relation: cleanString(g1?.relation) || 'Ibu / Bapa / Penjaga',
            guardian1Mobile:
              cleanString(g1?.mobilePhone) ||
              cleanString((act as any)?.parentPhone) ||
              cleanString((act as any)?.phone) ||
              cleanString(mast?.phone),
            guardian1Office: cleanString(g1?.officePhone),
            guardian2Name: cleanString(g2?.name),
            guardian2Mobile: cleanString(g2?.mobilePhone),
            fullAddress: formatAddress(addr),
          };
        };

        // First index active students enriched with master
        activeStudents.forEach((s) => {
          const mast =
            (s.apdmId && masterByApdm.get(normalizeKey(s.apdmId))) ||
            masterByApdm.get(normalizeKey(s.id)) ||
            (s.icNumber && masterByIc.get(normalizeDigits(s.icNumber))) ||
            masterByName.get(normalizeKey(s.name)) ||
            null;
          const rec = buildRecord(s.id, s, mast);
          if (rec.name) mergedMap.set(normalizeKey(rec.name) + '::' + normalizeDigits(rec.icNumber), rec);
        });

        // Add any remaining student_master entries not already in active students
        masterList.forEach((m) => {
          const key = normalizeKey(m.name) + '::' + normalizeDigits(m.icNumber);
          if (!mergedMap.has(key) && m.name) {
            mergedMap.set(key, buildRecord(m.student_id, null, m));
          }
        });

        const studentList = Array.from(mergedMap.values()).sort((a, b) =>
          a.className.localeCompare(b.className) || a.name.localeCompare(b.name)
        );
        setAllStudents(studentList);

        // 2. Build Teachers list from personnel + users
        const teacherMap = new Map<string, UnifiedTeacherRecord>();
        let detectedGbName = '';

        const upsertTeacher = (raw: any, docId: string) => {
          const name = cleanString(raw.name || raw.fullName || raw.displayName);
          if (!name) return;
          const k = normalizeKey(name);
          const roleUpper = normalizeKey(raw.role || raw.jawatan || raw.position);
          if (
            !detectedGbName &&
            (roleUpper.includes('GURU_BESAR') ||
              roleUpper.includes('GURU BESAR') ||
              roleUpper === 'PRINCIPAL')
          ) {
            detectedGbName = name;
          }

          const existing = teacherMap.get(k);
          const pos =
            cleanString(raw.position) ||
            cleanString(raw.jawatan) ||
            existing?.position ||
            'Guru Penolong / PPP';
          const grade =
            cleanString(raw.grade) ||
            cleanString(raw.gred) ||
            existing?.grade ||
            'DG41';
          const ic =
            cleanString(raw.ic) ||
            cleanString(raw.nric) ||
            cleanString(raw.noKP) ||
            cleanString(raw.icNumber) ||
            existing?.ic ||
            '';
          const phone =
            cleanString(raw.phone) ||
            cleanString(raw.noTel) ||
            cleanString(raw.mobilePhone) ||
            existing?.phone ||
            '';

          let savedVehicle: {
            vehicleModel?: string;
            vehiclePlateNo?: string;
            licenseClass?: string;
          } = {};
          try {
            const rawLocal = localStorage.getItem(
              getVehicleStorageKey(activeSchoolCode, name)
            );
            if (rawLocal) savedVehicle = JSON.parse(rawLocal);
          } catch {
            // ignore storage parse issue
          }

          teacherMap.set(k, {
            id: existing?.id || docId,
            name,
            ic,
            position: pos,
            grade,
            phone,
            vehicleModel:
              cleanString(raw.vehicleModel) ||
              savedVehicle.vehicleModel ||
              existing?.vehicleModel ||
              '',
            vehiclePlateNo:
              cleanString(raw.vehiclePlateNo) ||
              savedVehicle.vehiclePlateNo ||
              existing?.vehiclePlateNo ||
              '',
            licenseClass:
              cleanString(raw.licenseClass) ||
              savedVehicle.licenseClass ||
              existing?.licenseClass ||
              'D',
          });
        };

        if (personnelSnap) {
          personnelSnap.docs
            .filter((d) => belongsToSchool(d.data(), activeSchoolCode))
            .forEach((d) => upsertTeacher(d.data() as PersonnelProfile, d.id));
        }
        if (usersSnap) {
          usersSnap.docs
            .filter((d) => belongsToSchool(d.data(), activeSchoolCode))
            .forEach((d) => {
              const u = d.data();
              if (u.status === 'INACTIVE' || u.isActive === false) return;
              upsertTeacher(u, d.id);
            });
        }

        const teacherList = Array.from(teacherMap.values()).sort((a, b) =>
          a.name.localeCompare(b.name)
        );
        setAllTeachers(teacherList);
        if (detectedGbName) {
          setGuruBesarName((prev) => prev || detectedGbName);
        }

        // 3. Load koko_activities for quick competition dropdown
        if (kokoSnap) {
          const acts = kokoSnap.docs
            .filter((d) => belongsToSchool(d.data(), activeSchoolCode))
            .map((d) => ({ id: d.id, ...d.data() } as KokoActivity))
            .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
          setKokoActivities(acts);
        }

        // 4. Hydrate initialData selection
        if (initialData) {
          if (initialData.programName) setProgramName(initialData.programName);
          if (initialData.organizer) setOrganizer(initialData.organizer);
          if (initialData.date) setDate(initialData.date);
          if (initialData.endDate) setEndDate(initialData.endDate);
          if (initialData.masa) setMasa(initialData.masa);
          if (initialData.venue) setVenue(initialData.venue);
          if (initialData.level) setLevel(initialData.level);

          // Pre-select Guru Pengiring
          const desiredTeacherName =
            initialData.guruPengiring?.[0] || currentUser?.name || teacherList[0]?.name || '';
          if (desiredTeacherName) {
            const matchedT =
              teacherList.find((t) => normalizeKey(t.name) === normalizeKey(desiredTeacherName)) ||
              teacherList.find((t) =>
                normalizeKey(t.name).includes(normalizeKey(desiredTeacherName))
              );
            if (matchedT) {
              setSelectedTeacherName(matchedT.name);
              setTeacherIc(matchedT.ic);
              setTeacherPosition(matchedT.position);
              setTeacherGrade(matchedT.grade);
              setTeacherPhone(matchedT.phone);
              setVehicleModel(matchedT.vehicleModel);
              setVehiclePlateNo(matchedT.vehiclePlateNo);
              setLicenseClass(matchedT.licenseClass || 'D');
            } else {
              setSelectedTeacherName(desiredTeacherName);
            }
          }

          // Pre-select participating students
          const preIds = new Set<string>();
          if (initialData.studentIds && initialData.studentIds.length > 0) {
            initialData.studentIds.forEach((sid) => {
              const found = studentList.find(
                (st) => st.id === sid || st.apdmId === sid
              );
              if (found) preIds.add(found.id);
            });
          }
          if (initialData.studentNames && initialData.studentNames.length > 0) {
            initialData.studentNames.forEach((sn) => {
              const nKey = normalizeKey(sn);
              const found = studentList.find((st) => normalizeKey(st.name) === nKey);
              if (found) preIds.add(found.id);
            });
          }
          setSelectedStudentIds(Array.from(preIds));
        } else if (currentUser?.name) {
          const matchedT = teacherList.find(
            (t) => normalizeKey(t.name) === normalizeKey(currentUser.name)
          );
          if (matchedT) {
            setSelectedTeacherName(matchedT.name);
            setTeacherIc(matchedT.ic);
            setTeacherPosition(matchedT.position);
            setTeacherGrade(matchedT.grade);
            setTeacherPhone(matchedT.phone);
            setVehicleModel(matchedT.vehicleModel);
            setVehiclePlateNo(matchedT.vehiclePlateNo);
            setLicenseClass(matchedT.licenseClass || 'D');
          } else {
            setSelectedTeacherName(currentUser.name);
          }
        }
      } catch (err: any) {
        setLoadError(err?.message || 'Gagal memuatkan data APDM Murid & Profil Guru.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadSSOT();
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeSchoolCode, academicYearNum, initialData, currentUser?.academic_year, currentUser?.name, schoolSettingsExtra?.academicYear]);

  // Apply selected teacher details when dropdown changes
  const handleSelectTeacher = (name: string) => {
    setSelectedTeacherName(name);
    const t = allTeachers.find((x) => x.name === name);
    if (t) {
      setTeacherIc(t.ic);
      setTeacherPosition(t.position);
      setTeacherGrade(t.grade);
      setTeacherPhone(t.phone);
      setVehicleModel(t.vehicleModel);
      setVehiclePlateNo(t.vehiclePlateNo);
      setLicenseClass(t.licenseClass || 'D');
    }
  };

  // Persist vehicle details convenience cache per school + teacher in localStorage
  useEffect(() => {
    if (!selectedTeacherName) return;
    try {
      localStorage.setItem(
        getVehicleStorageKey(activeSchoolCode, selectedTeacherName),
        JSON.stringify({
          vehicleModel,
          vehiclePlateNo,
          licenseClass,
        })
      );
    } catch {
      // ignore storage quota errors
    }
  }, [activeSchoolCode, selectedTeacherName, vehicleModel, vehiclePlateNo, licenseClass]);

  // Quick-fill from existing KokoActivity dropdown
  const handleSelectKokoActivity = (actId: string) => {
    setSelectedActivityId(actId);
    const act = kokoActivities.find((a) => a.id === actId);
    if (!act) return;
    setProgramName(act.programName || '');
    setOrganizer(act.organizer || 'PPD / JPN / KPM');
    setDate(act.date || new Date().toISOString().split('T')[0]);
    setEndDate(act.endDate || '');
    setMasa(act.masa || '07:30 pagi – 02:00 petang');
    setVenue(act.venue || '');
    setLevel(act.level || 'Daerah / Bahagian');

    const teacherChoice = act.guruPengiring?.[0] || act.jurulatih?.[0];
    if (teacherChoice) {
      const matched =
        allTeachers.find((t) => normalizeKey(t.name) === normalizeKey(teacherChoice)) ||
        allTeachers.find((t) => normalizeKey(t.name).includes(normalizeKey(teacherChoice)));
      if (matched) handleSelectTeacher(matched.name);
      else setSelectedTeacherName(teacherChoice);
    }

    const nextIds = new Set<string>();
    (act.studentIds || []).forEach((sid) => {
      const found = allStudents.find((s) => s.id === sid || s.apdmId === sid);
      if (found) nextIds.add(found.id);
    });
    (act.studentNames || []).forEach((sn) => {
      const found = allStudents.find((s) => normalizeKey(s.name) === normalizeKey(sn));
      if (found) nextIds.add(found.id);
    });
    if (nextIds.size > 0) setSelectedStudentIds(Array.from(nextIds));
  };

  const uniqueClasses = useMemo(() => {
    const set = new Set<string>();
    allStudents.forEach((s) => {
      if (s.className) set.add(s.className);
    });
    return Array.from(set).sort();
  }, [allStudents]);

  const filteredStudents = useMemo(() => {
    const q = normalizeKey(studentSearch);
    return allStudents.filter((s) => {
      if (classFilter !== 'SEMUA' && s.className !== classFilter) return false;
      if (!q) return true;
      return (
        normalizeKey(s.name).includes(q) ||
        normalizeKey(s.className).includes(q) ||
        cleanString(s.icNumber).includes(q)
      );
    });
  }, [allStudents, studentSearch, classFilter]);

  const toggleStudent = (id: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectedStudentsResolved = useMemo(() => {
    return selectedStudentIds
      .map((id) => {
        const base = allStudents.find((s) => s.id === id);
        if (!base) return null;
        const ov = studentOverrides[id];
        return {
          id: base.id,
          name: ov?.name ?? base.name,
          icNumber: ov?.icNumber ?? base.icNumber,
          birthDate: ov?.birthDate ?? base.birthDate,
          age: ov?.age ?? base.age,
          gender: ov?.gender ?? base.gender,
          className: ov?.className ?? base.className,
          guardian1Name: ov?.guardian1Name ?? base.guardian1Name,
          guardian1Ic: ov?.guardian1Ic ?? base.guardian1Ic,
          guardian1Occupation: ov?.guardian1Occupation ?? base.guardian1Occupation,
          guardian1Relation: ov?.guardian1Relation ?? base.guardian1Relation,
          guardian1Mobile: ov?.guardian1Mobile ?? base.guardian1Mobile,
          guardian1Office: ov?.guardian1Office ?? base.guardian1Office,
          guardian2Name: ov?.guardian2Name ?? base.guardian2Name,
          guardian2Mobile: ov?.guardian2Mobile ?? base.guardian2Mobile,
          fullAddress: ov?.fullAddress ?? base.fullAddress,
          health: ov?.health ?? DEFAULT_HEALTH_FLAGS,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
  }, [selectedStudentIds, allStudents, studentOverrides]);

  const updateStudentOverride = (
    studentId: string,
    patch: Partial<StudentEditableOverride>
  ) => {
    const base = allStudents.find((s) => s.id === studentId);
    if (!base) return;
    setStudentOverrides((prev) => {
      const current: StudentEditableOverride = prev[studentId] || {
        name: base.name,
        icNumber: base.icNumber,
        birthDate: base.birthDate,
        age: base.age,
        gender: base.gender,
        className: base.className,
        guardian1Name: base.guardian1Name,
        guardian1Ic: base.guardian1Ic,
        guardian1Occupation: base.guardian1Occupation,
        guardian1Relation: base.guardian1Relation,
        guardian1Mobile: base.guardian1Mobile,
        guardian1Office: base.guardian1Office,
        guardian2Name: base.guardian2Name,
        guardian2Mobile: base.guardian2Mobile,
        fullAddress: base.fullAddress,
        health: { ...DEFAULT_HEALTH_FLAGS },
      };
      return {
        ...prev,
        [studentId]: { ...current, ...patch },
      };
    });
  };

  const updateStudentHealth = (
    studentId: string,
    patch: Partial<StudentHealthFlags>
  ) => {
    const base = allStudents.find((s) => s.id === studentId);
    if (!base) return;
    const current = studentOverrides[studentId]?.health || DEFAULT_HEALTH_FLAGS;
    updateStudentOverride(studentId, {
      health: { ...current, ...patch },
    });
  };

  const formattedDateRange = useMemo(() => {
    if (!date) return '....................';
    if (endDate && endDate !== date) {
      return `${formatMalayDate(date)} hingga ${formatMalayDate(endDate)}`;
    }
    return formatMalayDate(date);
  }, [date, endDate]);

  const buildWhatsAppParentUrl = (st: (typeof selectedStudentsResolved)[number]) => {
    const phone = formatWhatsAppPhone(st.guardian1Mobile || st.guardian2Mobile);
    if (!phone) return '';
    const guardianDisplay = st.guardian1Name || 'Tuan/Puan';
    const msg = [
      `Salam sejahtera ${guardianDisplay},`,
      ``,
      `Makluman daripada pihak *${effectiveSchoolName}*:`,
      `Anak jagaan tuan/puan, *${st.name}* (${st.className || 'Murid'}), telah dipilih untuk menyertai:`,
      `🏆 *${programName || 'Pertandingan / Aktiviti Sekolah'}*`,
      `📅 Tarikh: ${formattedDateRange}`,
      `⏰ Masa: ${masa || '-'}`,
      `📍 Tempat: ${venue || '-'}`,
      `👩‍🏫 Guru Pengiring: ${selectedTeacherName || '-'} (${teacherPhone || '-'})`,
      ``,
      `Mohon kerjasama tuan/puan untuk melengkapkan dan menandatangani *${sppk1Label}* (Kebenaran Ibu Bapa) dan *${sppk2Label}* (Perakuan Kesihatan) serta mengembalikannya kepada Guru Pengiring sebelum tarikh program.`,
      ``,
      `Sekian, terima kasih.`,
    ].join('\n');
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  };

  const handlePrintAll = () => {
    const res = triggerSmartPrint({
      elementId: 'sppk-batch-print-sheet',
      title: `Pakej_SPPK_${programName || 'Pertandingan'}`,
      orientation: 'portrait',
    });
    if (res.mode !== 'native') {
      setBanner({
        type: res.mode === 'error' ? 'error' : 'info',
        text: res.message,
      });
    }
  };

  const handleDownloadHtml = () => {
    const res = downloadStandalonePrintHtml({
      elementId: 'sppk-batch-print-sheet',
      title: `Pakej_SPPK_${programName || 'Pertandingan'}`,
      orientation: 'portrait',
    });
    setBanner({
      type: res.mode === 'error' ? 'error' : 'info',
      text: res.message,
    });
  };

  if (!isOpen) return null;

  const showSppk1 = previewTab === 'ALL' || previewTab === 'SPPK1';
  const showSppk2 = previewTab === 'ALL' || previewTab === 'SPPK2';
  const showSppk3 = previewTab === 'ALL' || previewTab === 'SPPK3';
  const showKenderaan = previewTab === 'KENDERAAN';

  const totalPrintedPages =
    (showSppk1 ? selectedStudentsResolved.length : 0) +
    (showSppk2 ? selectedStudentsResolved.length : 0) +
    (showSppk3 ? selectedStudentsResolved.length : 0) +
    (showKenderaan ? 1 : 0);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm overflow-y-auto p-3 sm:p-6 print:static print:bg-white print:p-0 print:overflow-visible">
      <div className="max-w-7xl mx-auto space-y-4 print:max-w-none print:space-y-0">
        {/* TOP MODAL CONTROL BAR */}
        <div className="print:hidden bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4 sticky top-2 z-20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-teal-600/20 text-teal-300 border border-teal-500/40 rounded-2xl shrink-0">
              <ClipboardList className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                  Penjana Pakej Borang SPPK 1, SPPK 2 &amp; SPPK 3 (Auto-APDM)
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {selectedStudentsResolved.length} Murid · {totalPrintedPages} Helaian A4
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Auto-isi maklumat Murid, Ibu Bapa/Penjaga, Alamat (APDM) &amp; Guru Pengiring/Kenderaan (Profil Guru)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowEditorPanel((v) => !v)}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5 text-amber-400" />
              <span>{showEditorPanel ? 'Sembunyi Panel Data' : 'Ubahsuai Data & Pilihan'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadHtml}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-700/60 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Muat Turun (.html)</span>
            </button>

            <button
              type="button"
              onClick={handlePrintAll}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-lg cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>🖨️ Cetak Semua Borang (A4)</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white transition cursor-pointer"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* STATUS / BANNER */}
        {banner && (
          <div
            className={`print:hidden p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between gap-3 ${
              banner.type === 'error'
                ? 'bg-rose-950/70 border-rose-700 text-rose-200'
                : banner.type === 'success'
                ? 'bg-emerald-950/70 border-emerald-700 text-emerald-200'
                : 'bg-blue-950/70 border-blue-700 text-blue-200'
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

        {loadError && (
          <div className="print:hidden p-3.5 rounded-2xl bg-rose-950/70 border border-rose-700 text-xs font-bold text-rose-200">
            {loadError}
          </div>
        )}

        {/* COLLAPSIBLE CONFIGURATION & INLINE DATA HYDRATION PANEL */}
        {showEditorPanel && (
          <div className="print:hidden bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-6 shadow-xl">
            {loading && (
              <div className="flex items-center gap-2 text-xs text-teal-300 font-bold">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Menyegerak data APDM Murid (`student_master`), Waris &amp; Profil Guru...</span>
              </div>
            )}

            {/* SECTION 1: COMPETITION & FORM LABEL CONFIG */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-7 space-y-3 bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                  <h3 className="text-xs font-black uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                    <Award className="w-4 h-4" />
                    <span>1. Maklumat Pertandingan / Program</span>
                  </h3>
                  {kokoActivities.length > 0 && (
                    <select
                      value={selectedActivityId}
                      onChange={(e) => handleSelectKokoActivity(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-[11px] text-teal-300 font-bold outline-none max-w-xs"
                    >
                      <option value="">-- Import Pantas dari Rekod OPR --</option>
                      {kokoActivities.map((act) => (
                        <option key={act.id} value={act.id}>
                          [{act.date}] {act.programName}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-bold text-slate-400">
                      Nama Pertandingan / Aktiviti:
                    </label>
                    <input
                      type="text"
                      value={programName}
                      onChange={(e) => setProgramName(e.target.value)}
                      placeholder="cth: Pertandingan Bercerita Bahasa Melayu Peringkat Daerah"
                      className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold outline-none focus:border-teal-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400">Penganjur:</label>
                    <input
                      type="text"
                      value={organizer}
                      onChange={(e) => setOrganizer(e.target.value)}
                      className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400">Peringkat:</label>
                    <input
                      type="text"
                      value={level}
                      onChange={(e) => setLevel(e.target.value)}
                      className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400">Tarikh Pergi:</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400">
                      Tarikh Balik (Jika Berlainan):
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400">Masa:</label>
                    <input
                      type="text"
                      value={masa}
                      onChange={(e) => setMasa(e.target.value)}
                      className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400">Tempat Pertandingan:</label>
                    <input
                      type="text"
                      value={venue}
                      onChange={(e) => setVenue(e.target.value)}
                      placeholder="cth: Dewan Suarah Bintulu / SK ..."
                      className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none"
                    />
                  </div>
                </div>

                {/* Editable Top-Right SPPK Code Labels */}
                <div className="pt-2 border-t border-slate-800 grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <label className="text-slate-400 font-bold">Label Kod 1:</label>
                    <input
                      type="text"
                      value={sppk1Label}
                      onChange={(e) => setSppk1Label(e.target.value)}
                      className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-teal-300 font-mono font-bold outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 font-bold">Label Kod 2:</label>
                    <input
                      type="text"
                      value={sppk2Label}
                      onChange={(e) => setSppk2Label(e.target.value)}
                      className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-teal-300 font-mono font-bold outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 font-bold">Label Kod 3:</label>
                    <input
                      type="text"
                      value={sppk3Label}
                      onChange={(e) => setSppk3Label(e.target.value)}
                      className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-teal-300 font-mono font-bold outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: GURU PENGIRING & VEHICLE DETAILS */}
              <div className="lg:col-span-5 space-y-3 bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <h3 className="text-xs font-black uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                    <Car className="w-4 h-4" />
                    <span>2. Guru Pengiring &amp; Kenderaan (SPPK 3)</span>
                  </h3>
                  <span className="text-[10px] text-emerald-400 font-bold">Auto-Profil Guru</span>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div>
                    <label className="text-[11px] font-bold text-slate-400">
                      Pilih Guru Pengiring (Dari Master Data):
                    </label>
                    <select
                      value={selectedTeacherName}
                      onChange={(e) => handleSelectTeacher(e.target.value)}
                      className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold outline-none focus:border-indigo-500"
                    >
                      <option value="">-- Pilih Guru Pengiring --</option>
                      {allTeachers.map((t) => (
                        <option key={t.id + t.name} value={t.name}>
                          {t.name} {t.ic ? `(${t.ic})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] font-bold text-slate-400">No. Kad Pengenalan:</label>
                      <input
                        type="text"
                        value={teacherIc}
                        onChange={(e) => setTeacherIc(e.target.value)}
                        placeholder="cth: 900101-13-xxxx"
                        className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-white font-mono outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-400">No. Telefon:</label>
                      <input
                        type="text"
                        value={teacherPhone}
                        onChange={(e) => setTeacherPhone(e.target.value)}
                        placeholder="01x-xxxxxxx"
                        className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-white font-mono outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-400">Jawatan:</label>
                      <input
                        type="text"
                        value={teacherPosition}
                        onChange={(e) => setTeacherPosition(e.target.value)}
                        className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-400">Gred:</label>
                      <input
                        type="text"
                        value={teacherGrade}
                        onChange={(e) => setTeacherGrade(e.target.value)}
                        className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-white font-mono outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-amber-300">
                        Jenis / Model Kenderaan:
                      </label>
                      <input
                        type="text"
                        value={vehicleModel}
                        onChange={(e) => setVehicleModel(e.target.value)}
                        placeholder="cth: Perodua Myvi / Toyota Vios"
                        className="mt-1 w-full bg-slate-900 border border-amber-700/60 rounded-xl px-3 py-1.5 text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-amber-300">
                        No. Pendaftaran Kenderaan:
                      </label>
                      <input
                        type="text"
                        value={vehiclePlateNo}
                        onChange={(e) => setVehiclePlateNo(e.target.value.toUpperCase())}
                        placeholder="cth: QAA 1234 B"
                        className="mt-1 w-full bg-slate-900 border border-amber-700/60 rounded-xl px-3 py-1.5 text-white font-mono uppercase outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-400">
                        Kelas Lesen Memandu:
                      </label>
                      <input
                        type="text"
                        value={licenseClass}
                        onChange={(e) => setLicenseClass(e.target.value.toUpperCase())}
                        placeholder="cth: D / DA"
                        className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-white font-mono outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-400">
                        Nama Guru Besar (Pelulus):
                      </label>
                      <input
                        type="text"
                        value={guruBesarName}
                        onChange={(e) => setGuruBesarName(e.target.value)}
                        placeholder="Nama Guru Besar"
                        className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-white outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 3: STUDENT PICKER & INLINE PARENT/HEALTH EDITOR */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left: Searchable Student Multi-Select */}
              <div className="lg:col-span-5 bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                    <Users className="w-4 h-4" />
                    <span>3. Pilih Peserta Murid ({selectedStudentIds.length} Dipilih)</span>
                  </h3>
                  {selectedStudentIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedStudentIds([])}
                      className="text-[10px] font-bold text-rose-400 hover:underline cursor-pointer"
                    >
                      Kosongkan
                    </button>
                  )}
                </div>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      placeholder="Cari nama murid / No. KP..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white outline-none"
                    />
                  </div>
                  <select
                    value={classFilter}
                    onChange={(e) => setClassFilter(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 outline-none"
                  >
                    <option value="SEMUA">Semua Kelas</option>
                    {uniqueClasses.map((cls) => (
                      <option key={cls} value={cls}>
                        {cls}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/80 border border-slate-800 rounded-xl bg-slate-900/60">
                  {filteredStudents.slice(0, 120).map((st) => {
                    const checked = selectedStudentIds.includes(st.id);
                    const hasGuardian = Boolean(st.guardian1Name);
                    return (
                      <label
                        key={st.id}
                        className={`flex items-center justify-between gap-2 px-3 py-2 text-xs cursor-pointer transition ${
                          checked ? 'bg-teal-950/50 text-white' : 'hover:bg-slate-800/60 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleStudent(st.id)}
                            className="rounded accent-teal-500 shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="font-bold truncate">{st.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono truncate">
                              {st.className || '-'} · {st.icNumber || 'Tiada No. KP'}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                            hasGuardian
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {hasGuardian ? 'APDM Lengkap' : 'Semak Waris'}
                        </span>
                      </label>
                    );
                  })}
                  {filteredStudents.length === 0 && (
                    <div className="p-4 text-center text-xs text-slate-500">
                      Tiada murid ditemui dalam rekod sekolah.
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Selected Students Quick Editor + Health Conditions + WhatsApp Parent */}
              <div className="lg:col-span-7 bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-teal-300 flex items-center gap-1.5">
                    <HeartPulse className="w-4 h-4" />
                    <span>4. Semakan Waris, Kesihatan (SPPK 2) &amp; WhatsApp Ibu Bapa</span>
                  </h3>
                  <span className="text-[10px] text-slate-400">Klik nama murid untuk ubahsuai butiran</span>
                </div>

                {selectedStudentsResolved.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                    Pilih sekurang-kurangnya seorang murid di sebelah kiri untuk menjana Borang SPPK 1, SPPK 2 &amp; senarai peserta SPPK 3.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {selectedStudentsResolved.map((st, idx) => {
                      const isExpanded = editingStudentId === st.id;
                      const waUrl = buildWhatsAppParentUrl(st);
                      return (
                        <div
                          key={st.id}
                          className="border border-slate-800 rounded-xl bg-slate-900/80 overflow-hidden"
                        >
                          <div className="p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => setEditingStudentId(isExpanded ? null : st.id)}
                              className="text-left flex-1 min-w-0 cursor-pointer"
                            >
                              <div className="font-bold text-white truncate">
                                {idx + 1}. {st.name}{' '}
                                <span className="text-teal-300 font-mono text-[11px]">
                                  ({st.className || '-'})
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400 truncate">
                                Waris: {st.guardian1Name || 'Belum diisi'} · Tel:{' '}
                                {st.guardian1Mobile || st.guardian2Mobile || 'Tiada'}
                              </div>
                            </button>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => setEditingStudentId(isExpanded ? null : st.id)}
                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <Edit3 className="w-3 h-3 text-amber-400" />
                                <span>{isExpanded ? 'Tutup' : 'Edit & Kesihatan'}</span>
                              </button>

                              {waUrl ? (
                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold flex items-center gap-1"
                                  title="Hantar Peringatan WhatsApp kepada Ibu Bapa/Penjaga"
                                >
                                  <MessageSquare className="w-3 h-3" />
                                  <span>WhatsApp Waris</span>
                                </a>
                              ) : (
                                <span className="px-2 py-1 rounded-lg bg-slate-800/70 text-slate-500 text-[10px]">
                                  Tiada No. WA
                                </span>
                              )}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="p-3 border-t border-slate-800 bg-slate-950/70 space-y-3 text-[11px]">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div>
                                  <label className="text-slate-400 font-bold">Nama Murid:</label>
                                  <input
                                    type="text"
                                    value={st.name}
                                    onChange={(e) =>
                                      updateStudentOverride(st.id, { name: e.target.value })
                                    }
                                    className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white"
                                  />
                                </div>
                                <div>
                                  <label className="text-slate-400 font-bold">No. KP / MyKid:</label>
                                  <input
                                    type="text"
                                    value={st.icNumber}
                                    onChange={(e) =>
                                      updateStudentOverride(st.id, { icNumber: e.target.value })
                                    }
                                    className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono"
                                  />
                                </div>
                                <div>
                                  <label className="text-slate-400 font-bold">Tahun / Kelas:</label>
                                  <input
                                    type="text"
                                    value={st.className}
                                    onChange={(e) =>
                                      updateStudentOverride(st.id, { className: e.target.value })
                                    }
                                    className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white"
                                  />
                                </div>
                                <div>
                                  <label className="text-slate-400 font-bold">Nama Penjaga 1:</label>
                                  <input
                                    type="text"
                                    value={st.guardian1Name}
                                    onChange={(e) =>
                                      updateStudentOverride(st.id, { guardian1Name: e.target.value })
                                    }
                                    className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white"
                                  />
                                </div>
                                <div>
                                  <label className="text-slate-400 font-bold">No. KP Penjaga 1:</label>
                                  <input
                                    type="text"
                                    value={st.guardian1Ic}
                                    onChange={(e) =>
                                      updateStudentOverride(st.id, { guardian1Ic: e.target.value })
                                    }
                                    className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono"
                                  />
                                </div>
                                <div>
                                  <label className="text-slate-400 font-bold">No. Tel Penjaga 1:</label>
                                  <input
                                    type="text"
                                    value={st.guardian1Mobile}
                                    onChange={(e) =>
                                      updateStudentOverride(st.id, {
                                        guardian1Mobile: e.target.value,
                                      })
                                    }
                                    className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono"
                                  />
                                </div>
                                <div>
                                  <label className="text-slate-400 font-bold">Nama Penjaga 2:</label>
                                  <input
                                    type="text"
                                    value={st.guardian2Name}
                                    onChange={(e) =>
                                      updateStudentOverride(st.id, { guardian2Name: e.target.value })
                                    }
                                    className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white"
                                  />
                                </div>
                                <div>
                                  <label className="text-slate-400 font-bold">No. Tel Penjaga 2:</label>
                                  <input
                                    type="text"
                                    value={st.guardian2Mobile}
                                    onChange={(e) =>
                                      updateStudentOverride(st.id, {
                                        guardian2Mobile: e.target.value,
                                      })
                                    }
                                    className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono"
                                  />
                                </div>
                                <div>
                                  <label className="text-slate-400 font-bold">Hubungan:</label>
                                  <input
                                    type="text"
                                    value={st.guardian1Relation}
                                    onChange={(e) =>
                                      updateStudentOverride(st.id, {
                                        guardian1Relation: e.target.value,
                                      })
                                    }
                                    className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white"
                                  />
                                </div>
                                <div>
                                  <label className="text-slate-400 font-bold">Pekerjaan Penjaga 1:</label>
                                  <input
                                    type="text"
                                    value={st.guardian1Occupation}
                                    onChange={(e) =>
                                      updateStudentOverride(st.id, {
                                        guardian1Occupation: e.target.value,
                                      })
                                    }
                                    className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white"
                                  />
                                </div>
                                <div className="sm:col-span-2">
                                  <label className="text-slate-400 font-bold">Alamat Kediaman:</label>
                                  <input
                                    type="text"
                                    value={st.fullAddress}
                                    onChange={(e) =>
                                      updateStudentOverride(st.id, { fullAddress: e.target.value })
                                    }
                                    className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white"
                                  />
                                </div>
                              </div>

                              {/* Health Conditions (SPPK 2 & SPPK 3) */}
                              <div className="pt-2 border-t border-slate-800 space-y-1.5">
                                <div className="font-bold text-teal-300">
                                  Sejarah Perubatan Murid (SPPK 2 — Tandakan jika PERNAH/MASIH):
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {(
                                    [
                                      ['asthma', 'asthmaNote', 'Asma / Lelah'],
                                      ['allergy', 'allergyNote', 'Alahan (Ubat / Makanan)'],
                                      ['heart', 'heartNote', 'Masalah Jantung'],
                                      ['seizure', 'seizureNote', 'Sawan / Epilepsi'],
                                      ['diabetes', 'diabetesNote', 'Diabetes / Kronik'],
                                      ['other', 'otherNote', 'Kecederaan / Lain-lain'],
                                    ] as const
                                  ).map(([flagKey, noteKey, label]) => (
                                    <div
                                      key={flagKey}
                                      className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1"
                                    >
                                      <label className="flex items-center gap-1.5 cursor-pointer shrink-0 text-slate-200">
                                        <input
                                          type="checkbox"
                                          checked={st.health[flagKey]}
                                          onChange={(e) =>
                                            updateStudentHealth(st.id, {
                                              [flagKey]: e.target.checked,
                                            })
                                          }
                                          className="accent-rose-500"
                                        />
                                        <span>{label}</span>
                                      </label>
                                      <input
                                        type="text"
                                        value={st.health[noteKey]}
                                        onChange={(e) =>
                                          updateStudentHealth(st.id, {
                                            [noteKey]: e.target.value,
                                          })
                                        }
                                        placeholder="Catatan..."
                                        className="flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-white"
                                      />
                                    </div>
                                  ))}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                  <div>
                                    <label className="text-[10px] text-slate-400 font-bold">
                                      SPPK 3 — Jenis Sakit / Kecederaan (jika ada):
                                    </label>
                                    <input
                                      type="text"
                                      value={st.health.postIllness}
                                      onChange={(e) =>
                                        updateStudentHealth(st.id, {
                                          postIllness: e.target.value,
                                        })
                                      }
                                      placeholder="Kosongkan jika tiada (automatik diisi teks standard)"
                                      className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[10px] text-white"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-slate-400 font-bold">
                                      SPPK 3 — Jenis Rawatan / Tindakan:
                                    </label>
                                    <input
                                      type="text"
                                      value={st.health.postTreatment}
                                      onChange={(e) =>
                                        updateStudentHealth(st.id, {
                                          postTreatment: e.target.value,
                                        })
                                      }
                                      placeholder="Kosongkan jika tiada rawatan diperlukan"
                                      className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[10px] text-white"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PREVIEW TABS */}
        <div className="print:hidden flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['ALL', `Semua (3×${selectedStudentsResolved.length} Helaian JPN Sarawak)`],
                ['SPPK1', `${sppk1Label} (${selectedStudentsResolved.length})`],
                ['SPPK2', `${sppk2Label} (${selectedStudentsResolved.length})`],
                ['SPPK3', `${sppk3Label} (${selectedStudentsResolved.length})`],
                ['KENDERAAN', 'Kenderaan & Senarai Peserta (1)'],
              ] as [PreviewTab, string][]
            ).map(([tabKey, tabLabel]) => (
              <button
                key={tabKey}
                type="button"
                onClick={() => setPreviewTab(tabKey)}
                className={`px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
                  previewTab === tabKey
                    ? 'bg-teal-600 text-white shadow'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {tabLabel}
              </button>
            ))}
          </div>

          <div className="text-[11px] text-slate-400 font-bold px-2 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Format Rasmi JPN Sarawak (SPPK 1, 2 &amp; 3)</span>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* PRINTABLE A4 BATCH DOCUMENT AREA (JPN SARAWAK SPPK 1, 2 & 3)          */}
        {/* ===================================================================== */}
        <div
          id="sppk-batch-print-sheet"
          className="space-y-6 print:space-y-0 print-portrait-sheet"
        >
          {selectedStudentsResolved.map((st, idx) => (
            <React.Fragment key={`student_pack_${st.id}_${idx}`}>
              {/* ---------------- BORANG SPPK 1 (7-ROW DECLARATION + CAP SEKOLAH) ---------------- */}
              {showSppk1 && (
                <div className="print-portrait-page bg-white text-black max-w-[794px] mx-auto rounded-2xl shadow-2xl border border-slate-300 p-7 sm:p-9 text-[11px] leading-snug print:rounded-none print:shadow-none print:border-none print:p-4">
                  {/* JPN Sarawak Header */}
                  <div className="flex items-start justify-between gap-3 border-b-2 border-black pb-2.5 mb-3">
                    <div className="flex items-center gap-3">
                      {/* Jata Negara / KPM Official Emblem SVG */}
                      <div className="w-12 h-12 flex items-center justify-center shrink-0 border border-slate-300 rounded-lg p-1 bg-white">
                        <svg viewBox="0 0 64 64" className="w-full h-full" aria-label="Jata Negara">
                          <circle cx="32" cy="18" r="7" fill="#FACC15" stroke="#0F172A" strokeWidth="1.5" />
                          <path d="M18 26 L46 26 L43 46 L32 54 L21 46 Z" fill="#0F172A" stroke="#FACC15" strokeWidth="2" />
                          <path d="M23 30 L41 30 L39 44 L32 49 L25 44 Z" fill="#DC2626" />
                          <rect x="28" y="31" width="8" height="14" fill="#FFFFFF" />
                          <path d="M10 48 Q32 58 54 48" fill="none" stroke="#FACC15" strokeWidth="3" />
                        </svg>
                      </div>
                      <SchoolLogo
                        src={effectiveSchoolLogo}
                        schoolCode={activeSchoolCode}
                        className="w-11 h-11 bg-white border-slate-300 shrink-0"
                      />
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-wider leading-tight">
                          KEMENTERIAN PENDIDIKAN MALAYSIA
                        </div>
                        <div className="text-[11px] font-black uppercase tracking-wide text-slate-800 leading-tight">
                          JABATAN PENDIDIKAN NEGERI SARAWAK
                        </div>
                        <div className="text-[10px] font-bold uppercase text-slate-700 mt-0.5">
                          {effectiveSchoolName} ({activeSchoolCode})
                        </div>
                      </div>
                    </div>
                    <div className="border-2 border-black px-3 py-1 text-xs font-black uppercase tracking-wider shrink-0">
                      {sppk1Label}
                    </div>
                  </div>

                  <div className="text-center mb-3">
                    <h1 className="text-xs font-black uppercase underline underline-offset-4 tracking-wide">
                      BORANG KEBENARAN IBU BAPA / PENJAGA MENYERTAI PROGRAM / AKTIVITI
                    </h1>
                  </div>

                  {/* Exact 7-Row Bordered Declaration Box */}
                  <table className="w-full border-collapse border-2 border-black text-[11px] mb-4">
                    <tbody>
                      <tr>
                        <td className="border border-black px-2.5 py-1.5 font-bold bg-slate-100 w-44">
                          1. Nama Program / Pertandingan
                        </td>
                        <td className="border border-black px-2.5 py-1.5 font-bold uppercase" colSpan={3}>
                          {programName || '-'}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-black px-2.5 py-1.5 font-bold bg-slate-100">
                          2. Penganjur &amp; Peringkat
                        </td>
                        <td className="border border-black px-2.5 py-1.5" colSpan={3}>
                          {organizer || '-'} · Peringkat: <strong>{level || '-'}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-black px-2.5 py-1.5 font-bold bg-slate-100">
                          3. Tarikh &amp; Masa
                        </td>
                        <td className="border border-black px-2.5 py-1.5">
                          {formattedDateRange}
                        </td>
                        <td className="border border-black px-2.5 py-1.5 font-bold bg-slate-100 w-24">
                          Masa
                        </td>
                        <td className="border border-black px-2.5 py-1.5">{masa || '-'}</td>
                      </tr>
                      <tr>
                        <td className="border border-black px-2.5 py-1.5 font-bold bg-slate-100">
                          4. Tempat &amp; Guru Pengiring
                        </td>
                        <td className="border border-black px-2.5 py-1.5" colSpan={3}>
                          <strong>Tempat:</strong> {venue || '-'} · <strong>Guru Pengiring:</strong>{' '}
                          {selectedTeacherName || '-'} ({teacherPhone || '-'})
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-black px-2.5 py-1.5 font-bold bg-slate-100">
                          5. Maklumat Murid
                        </td>
                        <td className="border border-black px-2.5 py-1.5" colSpan={3}>
                          <div>
                            <strong>Nama:</strong> <span className="uppercase">{st.name}</span> ·{' '}
                            <strong>Tahun/Kelas:</strong> {st.className || '-'}
                          </div>
                          <div>
                            <strong>No. KP / MyKid:</strong> <span className="font-mono">{st.icNumber || '-'}</span> ·{' '}
                            <strong>Tarikh Lahir:</strong> {st.birthDate || '-'} ({st.age || '-'}) ·{' '}
                            <strong>Jantina:</strong> {st.gender || '-'}
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-black px-2.5 py-1.5 font-bold bg-slate-100">
                          6. Maklumat Ibu Bapa / Penjaga
                        </td>
                        <td className="border border-black px-2.5 py-1.5" colSpan={3}>
                          <div>
                            <strong>Nama:</strong> <span className="uppercase">{st.guardian1Name || '........................................'}</span>{' '}
                            ({st.guardian1Relation || 'Penjaga'}) · <strong>No. KP:</strong>{' '}
                            <span className="font-mono">{st.guardian1Ic || '....................'}</span>
                          </div>
                          <div>
                            <strong>Pekerjaan:</strong> {st.guardian1Occupation || '....................'} ·{' '}
                            <strong>Tel Bimbit:</strong> <span className="font-mono">{st.guardian1Mobile || '-'}</span>
                            {st.guardian1Office ? ` / Pej: ${st.guardian1Office}` : ''}
                          </div>
                          <div>
                            <strong>Alamat:</strong> {st.fullAddress || '................................................................'}
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-black px-2.5 py-2 font-bold bg-slate-100 align-top">
                          7. Akuan Kebenaran &amp; Keizinan Rawatan
                        </td>
                        <td className="border border-black px-2.5 py-2 text-justify space-y-1.5 text-[10.5px]" colSpan={3}>
                          <p>
                            Saya seperti nama dan maklumat di atas dengan ini <strong>MEMBENARKAN</strong> anak / jagaan saya menyertai program/pertandingan tersebut. Saya sedia maklum bahawa pihak sekolah dan Jabatan Pendidikan Negeri Sarawak akan mengambil segala langkah keselamatan yang sewajarnya.
                          </p>
                          <p>
                            Saya juga memberi kebenaran kepada pihak sekolah / Guru Pengiring untuk mendapatkan rawatan kecemasan / pembedahan bagi anak / jagaan saya sekiranya berlaku kecemasan dan saya tidak dapat dihubungi dengan serta-merta.
                          </p>
                          <div className="grid grid-cols-2 gap-6 pt-4">
                            <div>
                              <div className="h-8 border-b border-black" />
                              <div className="mt-1 font-bold">Tandatangan Ibu Bapa / Penjaga</div>
                              <div>Nama: {st.guardian1Name || '....................................'}</div>
                            </div>
                            <div className="pt-5 space-y-1">
                              <div><strong>No. KP:</strong> {st.guardian1Ic || '............................'}</div>
                              <div><strong>Tarikh:</strong> ....................................</div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Bottom Pengesahan Pihak Sekolah + Double-Circle Cap Sekolah */}
                  <div className="border border-black p-3 flex items-center justify-between gap-6">
                    <div className="flex-1 space-y-3 text-[10.5px]">
                      <div className="font-black uppercase underline underline-offset-2">
                        PENGESAHAN PIHAK SEKOLAH
                      </div>
                      <p>
                        Adalah disahkan bahawa murid di atas adalah murid berdaftar di{' '}
                        <strong>{effectiveSchoolName}</strong> dan mendapat kelulusan pihak sekolah untuk menyertai program di atas.
                      </p>
                      <div className="grid grid-cols-2 gap-6 pt-3">
                        <div>
                          <div className="h-8 border-b border-black" />
                          <div className="font-bold mt-1">Tandatangan Guru Besar / PK</div>
                          <div>Nama: {guruBesarName || '....................................'}</div>
                        </div>
                        <div className="pt-6">
                          <div><strong>Tarikh:</strong> ....................................</div>
                        </div>
                      </div>
                    </div>

                    {/* Double-Circle Cap Sekolah */}
                    <div className="w-28 h-28 rounded-full border-2 border-dashed border-slate-700 flex items-center justify-center p-1 shrink-0">
                      <div className="w-full h-full rounded-full border border-slate-700 flex flex-col items-center justify-center text-center px-1.5">
                        <span className="text-[7px] font-black uppercase leading-tight">
                          CAP RASMI SEKOLAH
                        </span>
                        <span className="text-[7px] font-bold uppercase text-slate-600 leading-tight mt-0.5 line-clamp-2">
                          {effectiveSchoolName}
                        </span>
                        <span className="text-[8px] font-mono font-black mt-0.5">
                          {activeSchoolCode}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ---------------- BORANG SPPK 2 (JPN SARAWAK: SEBELUM PROGRAM + 6x6 SEJARAH PERUBATAN) ---------------- */}
              {showSppk2 && (
                <div className="print-portrait-page bg-white text-black max-w-[794px] mx-auto rounded-2xl shadow-2xl border border-slate-300 p-7 sm:p-9 text-[11px] leading-snug print:rounded-none print:shadow-none print:border-none print:p-4">
                  {/* JPN Sarawak Header */}
                  <div className="flex items-start justify-between gap-3 border-b-2 border-black pb-2.5 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 flex items-center justify-center shrink-0 border border-slate-300 rounded-lg p-1 bg-white">
                        <svg viewBox="0 0 64 64" className="w-full h-full" aria-label="Jata Negara">
                          <circle cx="32" cy="18" r="7" fill="#FACC15" stroke="#0F172A" strokeWidth="1.5" />
                          <path d="M18 26 L46 26 L43 46 L32 54 L21 46 Z" fill="#0F172A" stroke="#FACC15" strokeWidth="2" />
                          <path d="M23 30 L41 30 L39 44 L32 49 L25 44 Z" fill="#DC2626" />
                          <rect x="28" y="31" width="8" height="14" fill="#FFFFFF" />
                          <path d="M10 48 Q32 58 54 48" fill="none" stroke="#FACC15" strokeWidth="3" />
                        </svg>
                      </div>
                      <SchoolLogo
                        src={effectiveSchoolLogo}
                        schoolCode={activeSchoolCode}
                        className="w-10 h-10 bg-white border-slate-300 shrink-0"
                      />
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-wider leading-tight">
                          KEMENTERIAN PENDIDIKAN MALAYSIA · JABATAN PENDIDIKAN NEGERI SARAWAK
                        </div>
                        <div className="text-[10px] font-bold uppercase text-slate-700">
                          {effectiveSchoolName} ({activeSchoolCode})
                        </div>
                      </div>
                    </div>
                    <div className="border-2 border-black px-3 py-1 text-xs font-black uppercase tracking-wider shrink-0">
                      {sppk2Label}
                    </div>
                  </div>

                  <div className="text-center mb-3">
                    <h1 className="text-xs font-black uppercase underline underline-offset-4">
                      BORANG DEKLARASI PESERTA SEBELUM PROGRAM
                    </h1>
                  </div>

                  {/* Maklumat Peserta & Program */}
                  <table className="w-full border-collapse border border-black mb-3 text-[10.5px]">
                    <tbody>
                      <tr>
                        <td className="border border-black px-2 py-1 font-bold bg-slate-100 w-36">
                          Nama Peserta
                        </td>
                        <td className="border border-black px-2 py-1 font-bold uppercase" colSpan={3}>
                          {st.name}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-black px-2 py-1 font-bold bg-slate-100">
                          No. KP / MyKid
                        </td>
                        <td className="border border-black px-2 py-1 font-mono">{st.icNumber || '-'}</td>
                        <td className="border border-black px-2 py-1 font-bold bg-slate-100 w-28">
                          Tahun / Kelas
                        </td>
                        <td className="border border-black px-2 py-1 font-bold">{st.className || '-'}</td>
                      </tr>
                      <tr>
                        <td className="border border-black px-2 py-1 font-bold bg-slate-100">
                          Tarikh Lahir / Jantina
                        </td>
                        <td className="border border-black px-2 py-1">
                          {st.birthDate || '-'} {st.age ? `(${st.age})` : ''} · {st.gender || '-'}
                        </td>
                        <td className="border border-black px-2 py-1 font-bold bg-slate-100">
                          Nama Program
                        </td>
                        <td className="border border-black px-2 py-1 font-bold uppercase">{programName || '-'}</td>
                      </tr>
                      <tr>
                        <td className="border border-black px-2 py-1 font-bold bg-slate-100">
                          Tarikh / Tempat
                        </td>
                        <td className="border border-black px-2 py-1" colSpan={3}>
                          {formattedDateRange} · {venue || '-'}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-black px-2 py-1 font-bold bg-slate-100">
                          Waris Kecemasan
                        </td>
                        <td className="border border-black px-2 py-1" colSpan={3}>
                          <strong>1.</strong> {st.guardian1Name || '-'} ({st.guardian1Relation || 'Penjaga'}) · Tel:{' '}
                          <span className="font-mono">{st.guardian1Mobile || '-'}</span>
                          {st.guardian2Name ? `  |  2. ${st.guardian2Name} (${st.guardian2Mobile || '-'})` : ''}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Exact 6-row x 6-column SEJARAH PERUBATAN Table */}
                  <div className="mb-3">
                    <div className="font-black uppercase bg-slate-200 px-2 py-1 border border-black border-b-0 text-[10.5px]">
                      SEJARAH PERUBATAN (TANDAKAN [✓] PADA RUANGAN BERKENAAN)
                    </div>
                    <table className="w-full border-collapse border border-black text-[10px]">
                      <thead>
                        <tr className="bg-slate-100">
                          <th className="border border-black px-1.5 py-1.5 text-center w-8">Bil</th>
                          <th className="border border-black px-2 py-1.5 text-left">
                            Jenis Penyakit / Sejarah Perubatan
                          </th>
                          <th className="border border-black px-1.5 py-1.5 text-center w-24">
                            Pernah Menghidap (Ya / Tidak)
                          </th>
                          <th className="border border-black px-1.5 py-1.5 text-center w-24">
                            Masih Menghidap (Ya / Tidak)
                          </th>
                          <th className="border border-black px-1.5 py-1.5 text-center w-20">
                            Tahun / Tempoh
                          </th>
                          <th className="border border-black px-2 py-1.5 text-left w-36">
                            Catatan / Ubat-ubatan
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(
                          [
                            ['1', 'Asma / Lelah / Masalah Pernafasan', st.health.asthma, st.health.asthmaNote],
                            ['2', 'Alahan (Ubat-ubatan / Makanan / Lain-lain)', st.health.allergy, st.health.allergyNote],
                            ['3', 'Masalah Jantung / Tekanan Darah Tinggi', st.health.heart, st.health.heartNote],
                            ['4', 'Sawan / Epilepsi / Kerap Pengsan', st.health.seizure, st.health.seizureNote],
                            ['5', 'Kencing Manis (Diabetes) / Penyakit Kronik', st.health.diabetes, st.health.diabetesNote],
                            ['6', 'Kecederaan Fizikal / Pembedahan Terkini', st.health.other, st.health.otherNote],
                          ] as [string, string, boolean, string][]
                        ).map(([no, title, hasCond, note]) => (
                          <tr key={no}>
                            <td className="border border-black px-1.5 py-2 text-center font-bold">{no}</td>
                            <td className="border border-black px-2 py-2">{title}</td>
                            <td className="border border-black px-1.5 py-2 text-center font-bold">
                              {hasCond ? '[✓] Ya  [ ] Tidak' : '[ ] Ya  [✓] Tidak'}
                            </td>
                            <td className="border border-black px-1.5 py-2 text-center font-bold">
                              {hasCond ? '[✓] Ya  [ ] Tidak' : '[ ] Ya  [✓] Tidak'}
                            </td>
                            <td className="border border-black px-1.5 py-2 text-center">
                              {hasCond ? 'Aktif' : '-'}
                            </td>
                            <td className="border border-black px-2 py-2">{note || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pengesahan Kesihatan Sebelum Program */}
                  <div className="border border-black p-3 space-y-3 text-[10.5px]">
                    <p className="text-justify">
                      Saya mengesahkan bahawa anak / jagaan saya berada dalam keadaan sihat secara fizikal dan mental sebelum menyertai program ini dan segala deklarasi sejarah perubatan di atas adalah benar.
                    </p>
                    <div className="grid grid-cols-2 gap-8 pt-2">
                      <div>
                        <div className="h-9 border-b border-black" />
                        <div className="mt-1 font-bold">Tandatangan Ibu Bapa / Penjaga</div>
                        <div>Nama: {st.guardian1Name || '........................................'}</div>
                      </div>
                      <div className="space-y-1 pt-3">
                        <div><strong>No. KP:</strong> {st.guardian1Ic || '........................................'}</div>
                        <div><strong>Tarikh:</strong> ........................................</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ---------------- BORANG SPPK 3 (JPN SARAWAK: SELEPAS PROGRAM — 2-COL SAKIT/RAWATAN) ---------------- */}
              {showSppk3 && (
                <div className="print-portrait-page bg-white text-black max-w-[794px] mx-auto rounded-2xl shadow-2xl border border-slate-300 p-7 sm:p-9 text-[11px] leading-snug print:rounded-none print:shadow-none print:border-none print:p-4">
                  {/* JPN Sarawak Header */}
                  <div className="flex items-start justify-between gap-3 border-b-2 border-black pb-2.5 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 flex items-center justify-center shrink-0 border border-slate-300 rounded-lg p-1 bg-white">
                        <svg viewBox="0 0 64 64" className="w-full h-full" aria-label="Jata Negara">
                          <circle cx="32" cy="18" r="7" fill="#FACC15" stroke="#0F172A" strokeWidth="1.5" />
                          <path d="M18 26 L46 26 L43 46 L32 54 L21 46 Z" fill="#0F172A" stroke="#FACC15" strokeWidth="2" />
                          <path d="M23 30 L41 30 L39 44 L32 49 L25 44 Z" fill="#DC2626" />
                          <rect x="28" y="31" width="8" height="14" fill="#FFFFFF" />
                          <path d="M10 48 Q32 58 54 48" fill="none" stroke="#FACC15" strokeWidth="3" />
                        </svg>
                      </div>
                      <SchoolLogo
                        src={effectiveSchoolLogo}
                        schoolCode={activeSchoolCode}
                        className="w-10 h-10 bg-white border-slate-300 shrink-0"
                      />
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-wider leading-tight">
                          KEMENTERIAN PENDIDIKAN MALAYSIA · JABATAN PENDIDIKAN NEGERI SARAWAK
                        </div>
                        <div className="text-[10px] font-bold uppercase text-slate-700">
                          {effectiveSchoolName} ({activeSchoolCode})
                        </div>
                      </div>
                    </div>
                    <div className="border-2 border-black px-3 py-1 text-xs font-black uppercase tracking-wider shrink-0">
                      {sppk3Label}
                    </div>
                  </div>

                  <div className="text-center mb-4">
                    <h1 className="text-xs font-black uppercase underline underline-offset-4">
                      BORANG DEKLARASI PESERTA SELEPAS PROGRAM
                    </h1>
                  </div>

                  <table className="w-full border-collapse border border-black mb-4 text-[10.5px]">
                    <tbody>
                      <tr>
                        <td className="border border-black px-2.5 py-1.5 font-bold bg-slate-100 w-40">
                          Nama Peserta
                        </td>
                        <td className="border border-black px-2.5 py-1.5 font-bold uppercase" colSpan={3}>
                          {st.name}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-black px-2.5 py-1.5 font-bold bg-slate-100">
                          No. KP / MyKid
                        </td>
                        <td className="border border-black px-2.5 py-1.5 font-mono">{st.icNumber || '-'}</td>
                        <td className="border border-black px-2.5 py-1.5 font-bold bg-slate-100 w-28">
                          Tahun / Kelas
                        </td>
                        <td className="border border-black px-2.5 py-1.5 font-bold">{st.className || '-'}</td>
                      </tr>
                      <tr>
                        <td className="border border-black px-2.5 py-1.5 font-bold bg-slate-100">
                          Nama Program
                        </td>
                        <td className="border border-black px-2.5 py-1.5 font-bold uppercase" colSpan={3}>
                          {programName || '-'}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-black px-2.5 py-1.5 font-bold bg-slate-100">
                          Tarikh &amp; Tempat
                        </td>
                        <td className="border border-black px-2.5 py-1.5" colSpan={3}>
                          {formattedDateRange} · {venue || '-'}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-black px-2.5 py-1.5 font-bold bg-slate-100">
                          Guru Pengiring
                        </td>
                        <td className="border border-black px-2.5 py-1.5" colSpan={3}>
                          {selectedTeacherName || '-'} ({teacherPhone || '-'})
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Exact 2-Column JENIS SAKIT / KECEDERAAN | JENIS RAWATAN Table */}
                  <div className="mb-4">
                    <div className="font-black uppercase bg-slate-200 px-2.5 py-1.5 border border-black border-b-0 text-[10.5px]">
                      REKOD KESIHATAN / KECEDERAAN PESERTA SEMASA &amp; SELEPAS PROGRAM
                    </div>
                    <table className="w-full border-collapse border-2 border-black text-[11px]">
                      <thead>
                        <tr className="bg-slate-100">
                          <th className="border border-black px-3 py-2 text-left w-1/2 font-black uppercase">
                            JENIS SAKIT / KECEDERAAN
                          </th>
                          <th className="border border-black px-3 py-2 text-left w-1/2 font-black uppercase">
                            JENIS RAWATAN / TINDAKAN YANG DIBERIKAN
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="border border-black px-3 py-4 align-top h-24">
                            {st.health.postIllness || 'Tiada sakit / kecederaan dilaporkan sepanjang program.'}
                          </td>
                          <td className="border border-black px-3 py-4 align-top h-24">
                            {st.health.postTreatment || 'Tiada rawatan diperlukan. Murid berada dalam keadaan sihat.'}
                          </td>
                        </tr>
                        <tr>
                          <td className="border border-black px-3 py-4 align-top h-16 text-slate-400">
                            &nbsp;
                          </td>
                          <td className="border border-black px-3 py-4 align-top h-16 text-slate-400">
                            &nbsp;
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Status Pengakuan Selepas Program */}
                  <div className="border border-black p-3 space-y-4 text-[10.5px]">
                    <div className="font-bold">
                      Status Kesihatan Peserta Selepas Tamat Program:{' '}
                      <span className="ml-2">[ &nbsp; ] SIHAT &amp; SELAMAT</span>
                      <span className="ml-4">[ &nbsp; ] MEMERLUKAN PEMANTAUAN / RAWATAN LANJUT</span>
                    </div>
                    <div className="grid grid-cols-2 gap-8 pt-2">
                      <div>
                        <div className="h-10 border-b border-black" />
                        <div className="mt-1 font-bold">Tandatangan Guru Pengiring</div>
                        <div>Nama: {selectedTeacherName || '........................................'}</div>
                        <div>Tarikh &amp; Masa: ........................................</div>
                      </div>
                      <div>
                        <div className="h-10 border-b border-black" />
                        <div className="mt-1 font-bold">Tandatangan Ibu Bapa / Penjaga (Terima Murid)</div>
                        <div>Nama: {st.guardian1Name || '........................................'}</div>
                        <div>Tarikh &amp; Masa: ........................................</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </React.Fragment>
          ))}

          {/* ---------------- BONUS TAB: LAMPIRAN KENDERAAN & SENARAI RASMI PESERTA ---------------- */}
          {showKenderaan && (
            <div className="print-portrait-page bg-white text-black max-w-[794px] mx-auto rounded-2xl shadow-2xl border border-slate-300 p-8 sm:p-10 text-[11px] leading-snug print:rounded-none print:shadow-none print:border-none print:p-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 border-b-2 border-black pb-2.5 mb-3">
                <div className="flex items-center gap-3">
                  <SchoolLogo
                    src={effectiveSchoolLogo}
                    schoolCode={activeSchoolCode}
                    className="w-12 h-12 bg-white border-slate-300 shrink-0"
                  />
                  <div>
                    <div className="text-sm font-black uppercase">{effectiveSchoolName}</div>
                    <div className="text-[10px] text-slate-700 font-semibold">
                      Kod Sekolah: {activeSchoolCode}
                      {effectiveSchoolAddress ? ` · ${effectiveSchoolAddress}` : ''}
                    </div>
                  </div>
                </div>
                <div className="border-2 border-black px-3 py-1 text-xs font-black uppercase tracking-wider shrink-0">
                  {sppk3Label}
                </div>
              </div>

              <div className="text-center mb-3">
                <h1 className="text-sm font-black uppercase underline underline-offset-4">
                  BORANG KEBENARAN MENGGUNAKAN KENDERAAN SENDIRI GURU PENGIRING &amp; SENARAI RASMI PESERTA
                </h1>
              </div>

              {/* Seksyen A: Teacher & Vehicle */}
              <div className="mb-3">
                <div className="font-black uppercase bg-slate-200 px-2 py-1 border border-black border-b-0">
                  A. MAKLUMAT GURU PENGIRING &amp; KENDERAAN
                </div>
                <table className="w-full border-collapse border border-black">
                  <tbody>
                    <tr>
                      <td className="border border-black px-2 py-1 font-bold w-44 bg-slate-50">
                        Nama Guru Pengiring
                      </td>
                      <td className="border border-black px-2 py-1 font-bold uppercase" colSpan={3}>
                        {selectedTeacherName || '-'}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-black px-2 py-1 font-bold bg-slate-50">
                        No. Kad Pengenalan
                      </td>
                      <td className="border border-black px-2 py-1 font-mono">
                        {teacherIc || '-'}
                      </td>
                      <td className="border border-black px-2 py-1 font-bold w-32 bg-slate-50">
                        No. Telefon Bimbit
                      </td>
                      <td className="border border-black px-2 py-1 font-mono">
                        {teacherPhone || '-'}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-black px-2 py-1 font-bold bg-slate-50">
                        Jawatan / Gred
                      </td>
                      <td className="border border-black px-2 py-1">
                        {teacherPosition || 'PPP'} ({teacherGrade || '-'})
                      </td>
                      <td className="border border-black px-2 py-1 font-bold bg-slate-50">
                        Kelas Lesen Memandu
                      </td>
                      <td className="border border-black px-2 py-1 font-mono font-bold">
                        {licenseClass || 'D'}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-black px-2 py-1 font-bold bg-slate-50">
                        Jenis / Model Kenderaan
                      </td>
                      <td className="border border-black px-2 py-1 uppercase">
                        {vehicleModel || '....................................'}
                      </td>
                      <td className="border border-black px-2 py-1 font-bold bg-slate-50">
                        No. Pendaftaran
                      </td>
                      <td className="border border-black px-2 py-1 font-mono font-black uppercase">
                        {vehiclePlateNo || '....................'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Seksyen B: Competition & Journey */}
              <div className="mb-3">
                <div className="font-black uppercase bg-slate-200 px-2 py-1 border border-black border-b-0">
                  B. MAKLUMAT PERTANDINGAN &amp; PERJALANAN
                </div>
                <table className="w-full border-collapse border border-black">
                  <tbody>
                    <tr>
                      <td className="border border-black px-2 py-1 font-bold w-44 bg-slate-50">
                        Nama Pertandingan / Program
                      </td>
                      <td className="border border-black px-2 py-1 font-bold uppercase" colSpan={3}>
                        {programName || '-'}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-black px-2 py-1 font-bold bg-slate-50">
                        Tarikh Pergi &amp; Balik
                      </td>
                      <td className="border border-black px-2 py-1">{formattedDateRange}</td>
                      <td className="border border-black px-2 py-1 font-bold w-32 bg-slate-50">
                        Masa
                      </td>
                      <td className="border border-black px-2 py-1">{masa || '-'}</td>
                    </tr>
                    <tr>
                      <td className="border border-black px-2 py-1 font-bold bg-slate-50">
                        Tempat Pertandingan
                      </td>
                      <td className="border border-black px-2 py-1">{venue || '-'}</td>
                      <td className="border border-black px-2 py-1 font-bold bg-slate-50">
                        Penganjur
                      </td>
                      <td className="border border-black px-2 py-1">
                        {organizer || '-'} ({level || '-'})
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Seksyen C: Master Table of Participating Students */}
              <div className="mb-4">
                <div className="font-black uppercase bg-slate-200 px-2 py-1 border border-black border-b-0">
                  C. SENARAI RASMI PESERTA MURID YANG DIIRINGI ({selectedStudentsResolved.length} ORANG)
                </div>
                <table className="w-full border-collapse border border-black text-[10px]">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-black px-1.5 py-1 text-center w-8">Bil</th>
                      <th className="border border-black px-2 py-1 text-left">Nama Murid</th>
                      <th className="border border-black px-2 py-1 text-left w-28">No. KP / MyKid</th>
                      <th className="border border-black px-2 py-1 text-center w-20">Tahun</th>
                      <th className="border border-black px-2 py-1 text-left">
                        Nama Ibu Bapa / Penjaga
                      </th>
                      <th className="border border-black px-2 py-1 text-left w-28">
                        No. Tel Kecemasan
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedStudentsResolved.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="border border-black px-3 py-4 text-center text-slate-500 italic"
                        >
                          Tiada murid dipilih lagi. Sila pilih peserta pada panel di atas.
                        </td>
                      </tr>
                    ) : (
                      selectedStudentsResolved.map((st, idx) => (
                        <tr key={`row_${st.id}_${idx}`}>
                          <td className="border border-black px-1.5 py-1 text-center font-bold">
                            {idx + 1}
                          </td>
                          <td className="border border-black px-2 py-1 font-bold uppercase">
                            {st.name}
                          </td>
                          <td className="border border-black px-2 py-1 font-mono">
                            {st.icNumber || '-'}
                          </td>
                          <td className="border border-black px-2 py-1 text-center">
                            {st.className || '-'}
                          </td>
                          <td className="border border-black px-2 py-1 uppercase">
                            {st.guardian1Name || st.guardian2Name || '-'}
                          </td>
                          <td className="border border-black px-2 py-1 font-mono">
                            {st.guardian1Mobile || st.guardian2Mobile || '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Seksyen D: Teacher Declaration & Guru Besar Approval */}
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-black p-3 space-y-3">
                  <div className="font-black uppercase text-[10px] border-b border-black pb-1">
                    D1. PERAKUAN GURU PENGIRING
                  </div>
                  <p className="text-[10px] text-justify">
                    Saya mengaku bahawa kenderaan di atas berada dalam keadaan baik dan selamat digunakan, mempunyai lesen memandu, cukai jalan serta perlindungan insurans yang sah untuk membawa murid di atas ke destinasi yang dinyatakan.
                  </p>
                  <div className="pt-4">
                    <div className="h-8 border-b border-black" />
                    <div className="mt-1 text-[10px]">
                      <strong>Tandatangan Guru Pengiring</strong>
                      <div>Nama: {selectedTeacherName || '........................................'}</div>
                      <div>Tarikh: ........................................</div>
                    </div>
                  </div>
                </div>

                <div className="border border-black p-3 space-y-3">
                  <div className="font-black uppercase text-[10px] border-b border-black pb-1">
                    D2. KELULUSAN GURU BESAR
                  </div>
                  <div className="text-[10px] space-y-1">
                    <div className="font-bold">Permohonan ini adalah:</div>
                    <div className="flex items-center gap-4 font-bold pt-0.5">
                      <span>[ &nbsp; ] DILULUSKAN</span>
                      <span>[ &nbsp; ] TIDAK DILULUSKAN</span>
                    </div>
                  </div>
                  <div className="pt-5">
                    <div className="h-8 border-b border-black" />
                    <div className="mt-1 text-[10px]">
                      <strong>Tandatangan &amp; Cap Rasmi Guru Besar</strong>
                      <div>Nama: {guruBesarName || '........................................'}</div>
                      <div>Tarikh: ........................................</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Fallback when 0 students selected */}
          {!showKenderaan && selectedStudentsResolved.length === 0 && (
            <div className="print:hidden max-w-[794px] mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-xs text-slate-400">
              Sila pilih sekurang-kurangnya seorang murid pada bahagian <strong>3. Pilih Peserta Murid</strong> di atas untuk memaparkan Borang SPPK 1, 2 &amp; 3 JPN Sarawak.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SPPKCompetitionFormsModal;
