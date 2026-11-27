/**
 * iSEPADU AI — Academic Analysis Dashboard & Dialog Prestasi SSOT (Tahun 1 – Tahun 6)
 *
 * Features:
 * 1. Unified Panitia Subject Mapping:
 *    - Maps 'AM', 'ALAM MANUSIA', 'ALAM DAN MANUSIA', 'SN', 'SAINS' into Panitia Sains ("Sains (SN / AM)").
 *    - Aggregates Tahun 1–6 AM & SN records seamlessly for Keseluruhan & per-year views.
 *    - Counts AM properly in individual student all-subject mastery (Analisis Penguasaan Minimum Ikut Murid).
 * 2. Top-Level Dual Assessment Mode ("Analisis PBD" & "Analisis UASA") + Assessment Session Filter ("Penggal 1" | "Penggal 2" | "UASA") supporting Tahun 1 – Tahun 6.
 * 3. Two Core Sub-Tabs under each mode:
 *    - Sub-Tab 1: Analisis Mata Pelajaran Ikut Panitia (Keseluruhan Sekolah & Tahun 1 – Tahun 6 + Jadual Perbandingan Merentas Tahun T1–T6)
 *    - Sub-Tab 2: Analisis Penguasaan Minimum Ikut Murid (Jadual Rumusan Ikut Kelas & Tahun with Jumlah Tahun X & JUMLAH KESELURUHAN SEKOLAH + Interactive Senarai Murid Intervensi drilldown)
 * 4. Official Report Printing & Excel Export:
 *    - "Cetak Laporan Dialog Prestasi (A4)" with official school letterhead SJK (C) CHUNG HUA BALINGIAN (YCC3404) & Guru Besar sign-off.
 *    - "Eksport Excel (.xlsx)" with dedicated Panitia & Ikut Murid worksheets.
 * 5. Role-Scoped Detail Views (Analisis Subjek Saya / Kelas Saya / Panitia Saya) preserved in secondary expandable view.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useSchoolTenant } from '../../contexts/SchoolTenantContext';
import { belongsToSchool } from '../../utils/schoolTenant';
import {
  ACADEMIC_YEARS,
  DEFAULT_ACADEMIC_YEAR,
  DEFAULT_SCHOOL_CODE,
  DEFAULT_SCHOOL_NAME,
  SUBJECTS_BY_YEAR,
} from '../../constants';
import {
  useAcademicAccessControl,
  normalizePbdNameToSubjectCode,
  resolvePanitiaForSubject,
  OFFICIAL_PANITIA_CATALOG,
} from '../../utils/academicAccessControl';
import {
  getPbdSemanticColor,
  getUasaGrade,
  getUasaGradeInterpretation,
  getUasaSemanticColor,
  getNearMissStatus,
  getMismatchStatus,
  getInterventionPriority,
  ACADEMIC_COLOR_TOKENS,
  PBD_CHART_PALETTE,
  UASA_CHART_PALETTE,
  PbdLevel,
  UasaGrade,
  InterventionPriority,
} from '../../utils/academicVisualStandard';
import {
  PbdBadge,
  UasaBadge,
  ProgressIndicator,
  NearMissBadge,
  MismatchBadge,
  InterventionPriorityBadge,
} from './AcademicBadges';
import SchoolLogo from '../SchoolLogo';
import { triggerSmartPrint } from '../../utils/oprPrintHelper';
import { isPrasekolahStudentRecord } from '../../utils/prasekolahAssessmentHelper';
import { PrasekolahAnalysisPanel } from './PrasekolahAnalysisPanel';
import * as XLSX from 'xlsx';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  AlertTriangle,
  Search,
  Filter,
  ChevronRight,
  ChevronDown,
  Sparkles,
  BarChart3,
  Layers,
  BookOpen,
  GraduationCap,
  ShieldCheck,
  Lock,
  Calendar,
  Printer,
  Download,
  Users,
  CheckCircle2,
  FileSpreadsheet,
  Eye,
} from 'lucide-react';

export interface StudentAcademicRecord {
  studentId: string;
  rawStudentId?: string;
  name: string;
  yearLevel?: number;
  className: string;
  rawClassLabel?: string;
  subjectName: string;
  pbd: {
    tov?: number | string | null;
    oti1?: number | string | null;
    ar1?: number | string | null;
    oti2?: number | string | null;
    ar2?: number | string | null;
    etr?: number | string | null;
    latestTp?: number | string | null;
  };
  uasa: {
    previousMark?: number | null;
    previousGrade?: string | null;
    currentMark?: number | null;
    currentGrade?: string | null;
    targetGrade?: string | null;
    term1Mark?: number | string | null;
    term1Grade?: string | null;
    term2Mark?: number | string | null;
    term2Grade?: string | null;
    isTH?: boolean;
    term1TH?: boolean;
    term2TH?: boolean;
  };
}

interface AcademicAnalysisDashboardProps {
  records?: StudentAcademicRecord[];
  className?: string;
  subjectName?: string;
  yearGroup?: number;
  currentUser?: any;
  schoolCode?: string;
  initialMainMode?: MainAssessmentMode;
  onSelectStudent?: (studentId: string) => void;
}

export type MainAssessmentMode = 'PBD' | 'UASA' | 'PRASEKOLAH';
type AssessmentSessionFilter = 'PENGGAL_1' | 'PENGGAL_2' | 'UASA';
type CoreSubTab = 'PANITIA' | 'IKUT_MURID' | 'TERPERINCI';
type YearScopeFilter = 'ALL' | 1 | 2 | 3 | 4 | 5 | 6;
type RoleScopeTab = 'MY_SUBJECTS' | 'MY_CLASS' | 'MY_PANITIA';

// GPMP point values
// PBD: TP6 = 1, TP5 = 2, TP4 = 3, TP3 = 4, TP2 = 5, TP1 = 6 (lower GPMP = better mastery, consistent with KPM GPMP)
const PBD_TP_TO_GP_WEIGHT: Record<PbdLevel, number> = {
  6: 1,
  5: 2,
  4: 3,
  3: 4,
  2: 5,
  1: 6,
};

// UASA KPM Standard Grade Point: A=1, B=2, C=3, D=4, E=5, F=6
const UASA_GRADE_TO_GP_WEIGHT: Record<UasaGrade, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
};

function parseTpValue(val: unknown): PbdLevel | null {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(String(val).trim().toUpperCase().replace(/^TP/i, ''));
  if (num >= 1 && num <= 6) return num as PbdLevel;
  return null;
}

function resolveUasaGradeStrict(
  rawMark: number | string | null | undefined,
  rawGrade?: string | null
): { grade: UasaGrade | null; isTH: boolean; numericMark: number | null } {
  const markStr = rawMark !== null && rawMark !== undefined ? String(rawMark).trim().toUpperCase() : '';
  const gradeStr = rawGrade ? String(rawGrade).trim().toUpperCase() : '';

  if (markStr === 'TH' || gradeStr === 'TH' || markStr === 'TIDAK HADIR') {
    return { grade: null, isTH: true, numericMark: null };
  }

  const num =
    rawMark !== null && rawMark !== undefined && markStr !== '' && !isNaN(Number(markStr))
      ? Number(markStr)
      : null;

  if (num !== null && num >= 0 && num <= 100) {
    // Strict KPM UASA Grading Scale:
    // A: 82-100, B: 66-81, C: 50-65, D: 35-49, E: 20-34, F: 0-19
    let g: UasaGrade = 'F';
    if (num >= 82) g = 'A';
    else if (num >= 66) g = 'B';
    else if (num >= 50) g = 'C';
    else if (num >= 35) g = 'D';
    else if (num >= 20) g = 'E';
    else g = 'F';
    return { grade: g, isTH: false, numericMark: num };
  }

  if (['A', 'B', 'C', 'D', 'E', 'F'].includes(gradeStr)) {
    return { grade: gradeStr as UasaGrade, isTH: false, numericMark: num };
  }

  return { grade: null, isTH: false, numericMark: null };
}

function normalizeClassCode(yearLevel: number, rawClass?: string): string {
  const clean = String(rawClass || '').trim().toUpperCase();
  if (!clean || clean === 'UTAMA' || clean === `TAHUN ${yearLevel}` || clean === String(yearLevel)) {
    return `${yearLevel}M`;
  }
  if (/^[1-6][A-Z0-9]+$/.test(clean)) {
    return clean;
  }
  const match = clean.match(/TAHUN\s*([1-6])\s*([A-Z0-9]*)/i);
  if (match) {
    const yr = match[1];
    const suffix = match[2] ? match[2].toUpperCase() : 'M';
    return `${yr}${suffix}`;
  }
  return `${yearLevel}M`;
}

export interface PbdPanitiaRow {
  panitiaKey: string;
  panitiaTitle: string;
  displayLabel: string;
  shortCode: string;
  sortOrder: number;
  bilMurid: number;
  tpCounts: Record<PbdLevel, number>;
  tpPercents: Record<PbdLevel, number>;
  menguasaiCount: number; // TP3 - TP6
  menguasaiPercent: number;
  intervensiCount: number; // TP1 - TP2
  intervensiPercent: number;
  gpmp: string;
}

export interface UasaPanitiaRow {
  panitiaKey: string;
  panitiaTitle: string;
  displayLabel: string;
  shortCode: string;
  sortOrder: number;
  daftar: number;
  hadir: number;
  th: number;
  gradeCounts: Record<UasaGrade, number>;
  gradePercents: Record<UasaGrade, number>;
  lulusCount: number; // A - E
  lulusPercent: number;
  belumMenguasaiCount: number; // F
  belumMenguasaiPercent: number;
  gpmp: string;
}

export interface StudentSubjectEvalItem {
  subjectName: string;
  shortCode: string;
  panitiaLabel: string;
  tp?: PbdLevel | null;
  mark?: number | null;
  grade?: UasaGrade | null;
  isTH?: boolean;
  isBelowMinimum: boolean;
}

export interface StudentMinimumMasterySummary {
  studentId: string;
  name: string;
  yearLevel: number;
  classCode: string;
  classDisplay: string;
  totalSubjectsEvaluated: number;
  failedSubjectsCount: number; // TP1/TP2 in PBD, or Gred F in UASA
  allMastered: boolean;
  subjectEvals: StudentSubjectEvalItem[];
  failedSubjectDetails: StudentSubjectEvalItem[];
  studentGpsPointsSum: number;
  studentGpsSubjectsCount: number;
}

export interface ClassMinimumSummaryRow {
  rowKey: string;
  rowType: 'CLASS' | 'YEAR_SUBTOTAL' | 'SCHOOL_TOTAL';
  yearLevel?: number;
  label: string;
  jumlahMurid: number; // Calon Hadir in UASA, Jumlah Murid in PBD
  menguasaiSemuaCount: number;
  menguasaiSemuaPercent: number;
  failed1Count: number;
  failed1Percent: number;
  failed2Count: number;
  failed2Percent: number;
  failed3PlusCount: number;
  failed3PlusPercent: number;
  gps: string;
  studentsInRow: StudentMinimumMasterySummary[];
  interventionStudents: StudentMinimumMasterySummary[];
}

export default function AcademicAnalysisDashboard({
  records: propRecords = [],
  className: initialClassName = 'Tahun 1',
  subjectName: initialSubjectName = 'Bahasa Melayu',
  yearGroup: initialYearGroup = 1,
  currentUser,
  schoolCode: propSchoolCode,
  initialMainMode = 'PBD',
  onSelectStudent,
}: AcademicAnalysisDashboardProps) {
  const tenant = useSchoolTenant();
  const activeSchoolCode = propSchoolCode || tenant.schoolCode || DEFAULT_SCHOOL_CODE;
  const activeSchoolName = tenant.schoolName || DEFAULT_SCHOOL_NAME;
  const activeSchoolLogo = (tenant.schoolSettings as any)?.schoolLogo || (tenant.schoolSettings as any)?.logoUrl || '';
  const principalName =
    (tenant.schoolSettings as any)?.principalName ||
    (currentUser?.role === 'PRINCIPAL' ? currentUser?.name : '') ||
    'GURU BESAR';

  const [academicYear, setAcademicYear] = useState<string>(DEFAULT_ACADEMIC_YEAR);
  const accessProfile = useAcademicAccessControl(currentUser, academicYear, activeSchoolCode);
  const isOpenAccess2026 = String(academicYear).trim() === '2026';
  const isAcademicAdmin = accessProfile.isAcademicAdmin || isOpenAccess2026;
  const canViewMyClass = isAcademicAdmin || accessProfile.classTeacherOf.length > 0;
  const canViewMyPanitia = isAcademicAdmin || accessProfile.ketuaPanitiaSubjects.length > 0;

  // ============================================================================
  // NEW TOP-LEVEL DUAL MODE & SUB-TABS STATE
  // ============================================================================
  const [mainMode, setMainMode] = useState<MainAssessmentMode>(initialMainMode);
  const [sessionFilter, setSessionFilter] = useState<AssessmentSessionFilter>('PENGGAL_2');
  const [coreSubTab, setCoreSubTab] = useState<CoreSubTab>('PANITIA');
  const [yearScope, setYearScope] = useState<YearScopeFilter>('ALL');
  const [selectedInterventionRowKey, setSelectedInterventionRowKey] = useState<string>('SCHOOL_TOTAL');
  const [interventionBucketFilter, setInterventionBucketFilter] = useState<'ALL_INTERVENSI' | '1_SUBJEK' | '2_SUBJEK' | '3_PLUS_SUBJEK'>('ALL_INTERVENSI');
  const [printNotice, setPrintNotice] = useState<string | null>(null);

  useEffect(() => {
    if (initialMainMode) {
      setMainMode(initialMainMode);
    }
  }, [initialMainMode]);

  // Sync default sessionFilter when switching between PBD and UASA
  const handleSwitchMainMode = (mode: MainAssessmentMode) => {
    setMainMode(mode);
    if (mode === 'UASA' && sessionFilter === 'PENGGAL_1') {
      setSessionFilter('UASA');
    }
  };

  // Existing Role-Scoped state for Terperinci tab
  const [roleScopeTab, setRoleScopeTab] = useState<RoleScopeTab>('MY_SUBJECTS');
  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'pbd' | 'uasa'>('overview');
  const [studentFilter, setStudentFilter] = useState<
    'ALL' | 'CRITICAL' | 'NEAR_MISS' | 'MISMATCH' | 'EXCELLENT'
  >('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (roleScopeTab === 'MY_CLASS' && !canViewMyClass) {
      setRoleScopeTab('MY_SUBJECTS');
    } else if (roleScopeTab === 'MY_PANITIA' && !canViewMyPanitia) {
      setRoleScopeTab('MY_SUBJECTS');
    }
  }, [roleScopeTab, canViewMyClass, canViewMyPanitia]);

  // 1. Selectors for "Analisis Subjek Saya"
  const allowedSubjectAssignments = useMemo(() => {
    if (isAcademicAdmin) {
      const all: Array<{ yearLevel: number; className: string; subjectCode: string; subjectName: string }> = [];
      for (let y = 1; y <= 6; y++) {
        for (const s of SUBJECTS_BY_YEAR[y] || []) {
          all.push({
            yearLevel: y,
            className: `Tahun ${y}`,
            subjectCode: normalizePbdNameToSubjectCode(s),
            subjectName: s,
          });
        }
      }
      return all;
    }
    return accessProfile.teachingAssignments;
  }, [isAcademicAdmin, accessProfile.teachingAssignments]);

  const [selectedSubjYear, setSelectedSubjYear] = useState<number>(initialYearGroup || 1);
  const [selectedSubjName, setSelectedSubjName] = useState<string>(initialSubjectName || 'Bahasa Melayu');

  const availableSubjYears = useMemo(
    () => Array.from(new Set(allowedSubjectAssignments.map((a) => a.yearLevel))).sort((a, b) => a - b),
    [allowedSubjectAssignments]
  );

  const availableSubjNamesForYear = useMemo(
    () =>
      Array.from(
        new Set(
          allowedSubjectAssignments
            .filter((a) => a.yearLevel === selectedSubjYear)
            .map((a) => a.subjectName)
        )
      ),
    [allowedSubjectAssignments, selectedSubjYear]
  );

  useEffect(() => {
    if (availableSubjYears.length > 0 && !availableSubjYears.includes(selectedSubjYear)) {
      setSelectedSubjYear(availableSubjYears[0]);
    }
  }, [availableSubjYears, selectedSubjYear]);

  useEffect(() => {
    if (
      availableSubjNamesForYear.length > 0 &&
      !availableSubjNamesForYear.includes(selectedSubjName)
    ) {
      setSelectedSubjName(availableSubjNamesForYear[0]);
    } else if (availableSubjNamesForYear.length === 0) {
      setSelectedSubjName('');
    }
  }, [availableSubjNamesForYear, selectedSubjName]);

  // 2. Selector for "Analisis Kelas Saya (Semua Mata Pelajaran)"
  const allowedClassTeacherYears = useMemo(() => {
    if (isAcademicAdmin) return [1, 2, 3, 4, 5, 6];
    return accessProfile.classTeacherOf.map((c) => c.yearLevel);
  }, [isAcademicAdmin, accessProfile.classTeacherOf]);

  const [selectedMyClassYear, setSelectedMyClassYear] = useState<number>(
    allowedClassTeacherYears[0] || 1
  );
  const [selectedMyClassSubjectFilter, setSelectedMyClassSubjectFilter] = useState<string>('ALL');

  useEffect(() => {
    if (
      allowedClassTeacherYears.length > 0 &&
      !allowedClassTeacherYears.includes(selectedMyClassYear)
    ) {
      setSelectedMyClassYear(allowedClassTeacherYears[0]);
    }
  }, [allowedClassTeacherYears, selectedMyClassYear]);

  // 3. Selector for "Analisis Panitia (Semua Kelas)"
  const allowedPanitiaSubjects = useMemo(() => {
    if (isAcademicAdmin) {
      return Array.from(new Set(Object.values(SUBJECTS_BY_YEAR).flat()));
    }
    return accessProfile.ketuaPanitiaSubjectNames;
  }, [isAcademicAdmin, accessProfile.ketuaPanitiaSubjectNames]);

  const [selectedPanitiaSubject, setSelectedPanitiaSubject] = useState<string>(
    allowedPanitiaSubjects[0] || 'Bahasa Melayu'
  );
  const [selectedPanitiaYearFilter, setSelectedPanitiaYearFilter] = useState<number | 'ALL'>('ALL');

  useEffect(() => {
    if (
      allowedPanitiaSubjects.length > 0 &&
      !allowedPanitiaSubjects.includes(selectedPanitiaSubject)
    ) {
      setSelectedPanitiaSubject(allowedPanitiaSubjects[0]);
    }
  }, [allowedPanitiaSubjects, selectedPanitiaSubject]);

  // ============================================================================
  // LOAD REAL FIRESTORE STUDENTS + PBD + UASA RECORDS
  // ============================================================================
  const [firestoreRecords, setFirestoreRecords] = useState<StudentAcademicRecord[]>([]);
  const [enrolledStudentsMap, setEnrolledStudentsMap] = useState<
    Map<string, { id: string; name: string; year: number; classCode: string }>
  >(new Map());
  const [loadingFirestore, setLoadingFirestore] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    setLoadingFirestore(true);

    Promise.all([
      getDocs(query(collection(db, 'students'), where('academic_year', '==', academicYear))).catch(
        () => null
      ),
      getDocs(
        query(collection(db, 'pbd_results'), where('academic_year', '==', academicYear))
      ).catch(() => null),
      getDocs(
        query(collection(db, 'uasa_results'), where('academic_year', '==', academicYear))
      ).catch(() => null),
    ])
      .then(([studSnap, pbdSnap, uasaSnap]) => {
        if (!active) return;
        const studentsMap = new Map<
          string,
          { id: string; name: string; year: number; classCode: string }
        >();
        const prasekolahStudentIds = new Set<string>();

        if (studSnap) {
          studSnap.docs.forEach((d) => {
            const data = d.data();
            if (!belongsToSchool(data, activeSchoolCode)) return;
            const sid = String(data.student_id || d.id);
            // STRICT ISOLATION: Exclude Prasekolah (Year 0 / PRASEKOLAH) from Elementary PBD & UASA
            if (isPrasekolahStudentRecord(data)) {
              prasekolahStudentIds.add(sid);
              return;
            }
            const rawYr =
              data.year !== undefined && data.year !== null ? Number(data.year) : NaN;
            if (isNaN(rawYr) || rawYr < 1 || rawYr > 6) {
              prasekolahStudentIds.add(sid);
              return;
            }
            const yr = rawYr;
            const clsCode = normalizeClassCode(yr, data.class || data.className);
            studentsMap.set(sid, {
              id: sid,
              name: String(data.name || 'Murid'),
              year: yr,
              classCode: clsCode,
            });
          });
        }
        setEnrolledStudentsMap(studentsMap);

        const recordMap = new Map<string, StudentAcademicRecord>();
        const ensureRecord = (
          sid: string,
          yearNum: number,
          subj: string,
          rawClass?: string
        ): StudentAcademicRecord => {
          const key = `${sid}__${yearNum}__${subj}`;
          const existing = recordMap.get(key);
          if (existing) return existing;
          const st = studentsMap.get(sid);
          const resolvedYear = st?.year || yearNum || 1;
          const clsCode = st?.classCode || normalizeClassCode(resolvedYear, rawClass);
          const created: StudentAcademicRecord = {
            studentId: `${sid}_${subj}`,
            rawStudentId: sid,
            name: st?.name || sid,
            yearLevel: resolvedYear,
            className: `Tahun ${resolvedYear}`,
            rawClassLabel: clsCode,
            subjectName: subj,
            pbd: {},
            uasa: {},
          };
          recordMap.set(key, created);
          return created;
        };

        if (pbdSnap) {
          pbdSnap.docs.forEach((d) => {
            const data = d.data();
            if (!belongsToSchool(data, activeSchoolCode)) return;
            const sid = String(data.student_id || '');
            const subj = String(data.subject_id || data.subject || '');
            if (!sid || !subj) return;
            // STRICT ISOLATION: Exclude Prasekolah students & records
            if (isPrasekolahStudentRecord(data) || prasekolahStudentIds.has(sid)) return;
            const rawYr =
              data.year !== undefined && data.year !== null
                ? Number(data.year)
                : studentsMap.get(sid)?.year ?? NaN;
            if (isNaN(rawYr) || rawYr < 1 || rawYr > 6) return;
            const yr = rawYr;
            const rec = ensureRecord(sid, yr, subj, data.class || data.className);
            rec.pbd = {
              tov: data.tov ?? rec.pbd.tov,
              oti1: data.oti1 ?? rec.pbd.oti1,
              ar1: data.ar1 ?? rec.pbd.ar1,
              oti2: data.oti2 ?? rec.pbd.oti2,
              ar2: data.ar2 ?? rec.pbd.ar2,
              etr: data.etr ?? rec.pbd.etr,
              latestTp: data.ar2 ?? data.ar1 ?? data.tp ?? rec.pbd.latestTp,
            };
          });
        }

        if (uasaSnap) {
          uasaSnap.docs.forEach((d) => {
            const data = d.data();
            if (!belongsToSchool(data, activeSchoolCode)) return;
            const sid = String(data.student_id || '');
            const subj = String(data.subject_id || data.subject || '');
            if (!sid || !subj) return;
            // STRICT ISOLATION: Exclude Prasekolah students & records
            if (isPrasekolahStudentRecord(data) || prasekolahStudentIds.has(sid)) return;
            const rawYr =
              data.year !== undefined && data.year !== null
                ? Number(data.year)
                : studentsMap.get(sid)?.year ?? NaN;
            if (isNaN(rawYr) || rawYr < 1 || rawYr > 6) return;
            const yr = rawYr;
            const rec = ensureRecord(sid, yr, subj, data.class || data.className);
            const rawM = data.marks;
            const rawG = data.grade;
            const parsed = resolveUasaGradeStrict(rawM, rawG);
            const termNum = Number(data.term || 2);

            if (termNum === 1) {
              rec.uasa.term1Mark = parsed.isTH ? 'TH' : parsed.numericMark;
              rec.uasa.term1Grade = parsed.isTH ? 'TH' : parsed.grade;
              rec.uasa.term1TH = parsed.isTH;
              if (rec.uasa.currentMark === undefined && !rec.uasa.isTH) {
                rec.uasa.currentMark = parsed.numericMark;
                rec.uasa.currentGrade = parsed.grade;
                rec.uasa.isTH = parsed.isTH;
              } else {
                rec.uasa.previousMark = parsed.numericMark;
                rec.uasa.previousGrade = parsed.grade;
              }
            } else {
              rec.uasa.term2Mark = parsed.isTH ? 'TH' : parsed.numericMark;
              rec.uasa.term2Grade = parsed.isTH ? 'TH' : parsed.grade;
              rec.uasa.term2TH = parsed.isTH;
              if (rec.uasa.currentMark !== undefined && rec.uasa.previousMark === undefined) {
                rec.uasa.previousMark = rec.uasa.currentMark;
                rec.uasa.previousGrade = rec.uasa.currentGrade;
              }
              rec.uasa.currentMark = parsed.numericMark;
              rec.uasa.currentGrade = parsed.grade;
              rec.uasa.isTH = parsed.isTH;
            }
          });
        }

        setFirestoreRecords(Array.from(recordMap.values()));
        setLoadingFirestore(false);
      })
      .catch(() => {
        if (active) setLoadingFirestore(false);
      });

    return () => {
      active = false;
    };
  }, [academicYear, activeSchoolCode]);

  const allSourceRecords = useMemo(() => {
    const raw = propRecords.length > 0 ? propRecords : firestoreRecords;
    return raw.filter((r) => {
      if (isPrasekolahStudentRecord(r)) return false;
      const yr = Number(r.yearLevel ?? 1);
      return yr >= 1 && yr <= 6;
    });
  }, [propRecords, firestoreRecords]);

  // ============================================================================
  // HELPER: EXTRACT SESSION-SPECIFIC PBD TP & UASA MARK/GRADE FROM RECORD
  // ============================================================================
  const extractPbdTpForSession = (r: StudentAcademicRecord): PbdLevel | null => {
    if (sessionFilter === 'PENGGAL_1') {
      return parseTpValue(r.pbd.ar1 ?? r.pbd.oti1 ?? r.pbd.tov ?? r.pbd.latestTp);
    }
    if (sessionFilter === 'PENGGAL_2') {
      return parseTpValue(r.pbd.ar2 ?? r.pbd.oti2 ?? r.pbd.latestTp ?? r.pbd.ar1 ?? r.pbd.tov);
    }
    // 'UASA' / Akhir Tahun PBD
    return parseTpValue(r.pbd.latestTp ?? r.pbd.ar2 ?? r.pbd.etr ?? r.pbd.ar1 ?? r.pbd.tov);
  };

  const extractUasaForSession = (
    r: StudentAcademicRecord
  ): { grade: UasaGrade | null; isTH: boolean; numericMark: number | null; hasRecord: boolean } => {
    if (sessionFilter === 'PENGGAL_1') {
      if (r.uasa.term1Mark !== undefined || r.uasa.term1Grade !== undefined || r.uasa.term1TH) {
        const res = resolveUasaGradeStrict(r.uasa.term1Mark, r.uasa.term1Grade);
        return { ...res, hasRecord: res.isTH || res.grade !== null };
      }
      if (r.uasa.previousMark !== undefined || r.uasa.previousGrade !== undefined) {
        const res = resolveUasaGradeStrict(r.uasa.previousMark, r.uasa.previousGrade);
        return { ...res, hasRecord: res.isTH || res.grade !== null };
      }
    }
    if (sessionFilter === 'PENGGAL_2' || sessionFilter === 'UASA') {
      if (r.uasa.term2Mark !== undefined || r.uasa.term2Grade !== undefined || r.uasa.term2TH) {
        const res = resolveUasaGradeStrict(r.uasa.term2Mark, r.uasa.term2Grade);
        return { ...res, hasRecord: res.isTH || res.grade !== null };
      }
    }
    const fallback = resolveUasaGradeStrict(
      r.uasa.isTH ? 'TH' : r.uasa.currentMark,
      r.uasa.currentGrade
    );
    return { ...fallback, hasRecord: fallback.isTH || fallback.grade !== null };
  };

  // ============================================================================
  // SUB-TAB 1: ANALISIS MATA PELAJARAN IKUT PANITIA (KESELURUHAN & TAHUN 1-6)
  // ============================================================================
  const pbdPanitiaTableRows = useMemo<PbdPanitiaRow[]>(() => {
    const scopedRecords = allSourceRecords.filter((r) => {
      const rYear = r.yearLevel || Number(String(r.className).replace(/\D/g, '')) || 1;
      if (yearScope !== 'ALL' && rYear !== yearScope) return false;
      return true;
    });

    const buckets = new Map<
      string,
      {
        def: ReturnType<typeof resolvePanitiaForSubject>;
        tpCounts: Record<PbdLevel, number>;
        totalEvaluated: number;
        gpWeightedSum: number;
      }
    >();

    // Seed official Panitia list so Panitia Sains (Sains (SN / AM)) & core Panitias always appear cleanly
    OFFICIAL_PANITIA_CATALOG.forEach((cat) => {
      buckets.set(cat.panitiaKey, {
        def: {
          panitiaKey: cat.panitiaKey,
          panitiaTitle: cat.panitiaTitle,
          displayLabel: cat.displayLabel,
          shortCode: cat.shortCode,
          sortOrder: cat.sortOrder,
        },
        tpCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
        totalEvaluated: 0,
        gpWeightedSum: 0,
      });
    });

    scopedRecords.forEach((r) => {
      const tp = extractPbdTpForSession(r);
      if (!tp) return;
      const panitia = resolvePanitiaForSubject(r.subjectName);
      let entry = buckets.get(panitia.panitiaKey);
      if (!entry) {
        entry = {
          def: panitia,
          tpCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
          totalEvaluated: 0,
          gpWeightedSum: 0,
        };
        buckets.set(panitia.panitiaKey, entry);
      }
      entry.tpCounts[tp]++;
      entry.totalEvaluated++;
      entry.gpWeightedSum += PBD_TP_TO_GP_WEIGHT[tp];
    });

    return Array.from(buckets.values())
      .filter((b) => {
        // If filtering by Tahun 1-3, Sejarah & RBT may have 0 records unless recorded; keep all panitias that belong to that year or have data
        if (b.totalEvaluated > 0) return true;
        if (yearScope === 'ALL') return true;
        if (yearScope <= 3 && (b.def.shortCode === 'SEJ' || b.def.shortCode === 'RBT' || b.def.shortCode === 'MZ')) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.def.sortOrder - b.def.sortOrder)
      .map((b) => {
        const total = b.totalEvaluated;
        const pct = (n: number) => (total > 0 ? Number(((n / total) * 100).toFixed(1)) : 0);
        const menguasai = b.tpCounts[3] + b.tpCounts[4] + b.tpCounts[5] + b.tpCounts[6];
        const intervensi = b.tpCounts[1] + b.tpCounts[2];
        return {
          panitiaKey: b.def.panitiaKey,
          panitiaTitle: b.def.panitiaTitle,
          displayLabel: b.def.displayLabel,
          shortCode: b.def.shortCode,
          sortOrder: b.def.sortOrder,
          bilMurid: total,
          tpCounts: b.tpCounts,
          tpPercents: {
            1: pct(b.tpCounts[1]),
            2: pct(b.tpCounts[2]),
            3: pct(b.tpCounts[3]),
            4: pct(b.tpCounts[4]),
            5: pct(b.tpCounts[5]),
            6: pct(b.tpCounts[6]),
          },
          menguasaiCount: menguasai,
          menguasaiPercent: pct(menguasai),
          intervensiCount: intervensi,
          intervensiPercent: pct(intervensi),
          gpmp: total > 0 ? (b.gpWeightedSum / total).toFixed(2) : '-',
        };
      });
  }, [allSourceRecords, yearScope, sessionFilter]);

  const uasaPanitiaTableRows = useMemo<UasaPanitiaRow[]>(() => {
    const scopedRecords = allSourceRecords.filter((r) => {
      const rYear = r.yearLevel || Number(String(r.className).replace(/\D/g, '')) || 1;
      if (yearScope !== 'ALL' && rYear !== yearScope) return false;
      return true;
    });

    const buckets = new Map<
      string,
      {
        def: ReturnType<typeof resolvePanitiaForSubject>;
        daftar: number;
        hadir: number;
        th: number;
        gradeCounts: Record<UasaGrade, number>;
        gpWeightedSum: number;
      }
    >();

    OFFICIAL_PANITIA_CATALOG.forEach((cat) => {
      buckets.set(cat.panitiaKey, {
        def: {
          panitiaKey: cat.panitiaKey,
          panitiaTitle: cat.panitiaTitle,
          displayLabel: cat.displayLabel,
          shortCode: cat.shortCode,
          sortOrder: cat.sortOrder,
        },
        daftar: 0,
        hadir: 0,
        th: 0,
        gradeCounts: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 },
        gpWeightedSum: 0,
      });
    });

    scopedRecords.forEach((r) => {
      const uasaEval = extractUasaForSession(r);
      if (!uasaEval.hasRecord) return;
      const panitia = resolvePanitiaForSubject(r.subjectName);
      let entry = buckets.get(panitia.panitiaKey);
      if (!entry) {
        entry = {
          def: panitia,
          daftar: 0,
          hadir: 0,
          th: 0,
          gradeCounts: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 },
          gpWeightedSum: 0,
        };
        buckets.set(panitia.panitiaKey, entry);
      }
      entry.daftar++;
      if (uasaEval.isTH) {
        entry.th++;
      } else if (uasaEval.grade) {
        entry.hadir++;
        entry.gradeCounts[uasaEval.grade]++;
        entry.gpWeightedSum += UASA_GRADE_TO_GP_WEIGHT[uasaEval.grade];
      }
    });

    return Array.from(buckets.values())
      .filter((b) => {
        if (b.daftar > 0) return true;
        if (yearScope === 'ALL') return true;
        if (yearScope <= 3 && (b.def.shortCode === 'SEJ' || b.def.shortCode === 'RBT' || b.def.shortCode === 'MZ')) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.def.sortOrder - b.def.sortOrder)
      .map((b) => {
        const hadir = b.hadir;
        const pct = (n: number) => (hadir > 0 ? Number(((n / hadir) * 100).toFixed(1)) : 0);
        const lulus =
          b.gradeCounts.A + b.gradeCounts.B + b.gradeCounts.C + b.gradeCounts.D + b.gradeCounts.E;
        const gagal = b.gradeCounts.F;
        return {
          panitiaKey: b.def.panitiaKey,
          panitiaTitle: b.def.panitiaTitle,
          displayLabel: b.def.displayLabel,
          shortCode: b.def.shortCode,
          sortOrder: b.def.sortOrder,
          daftar: b.daftar,
          hadir,
          th: b.th,
          gradeCounts: b.gradeCounts,
          gradePercents: {
            A: pct(b.gradeCounts.A),
            B: pct(b.gradeCounts.B),
            C: pct(b.gradeCounts.C),
            D: pct(b.gradeCounts.D),
            E: pct(b.gradeCounts.E),
            F: pct(b.gradeCounts.F),
          },
          lulusCount: lulus,
          lulusPercent: pct(lulus),
          belumMenguasaiCount: gagal,
          belumMenguasaiPercent: pct(gagal),
          gpmp: hadir > 0 ? (b.gpWeightedSum / hadir).toFixed(2) : '-',
        };
      });
  }, [allSourceRecords, yearScope, sessionFilter]);

  // ============================================================================
  // JADUAL PERBANDINGAN MERENTAS TAHUN (T1 - T6) FOR EACH PANITIA
  // ============================================================================
  const crossYearPanitiaComparison = useMemo(() => {
    return OFFICIAL_PANITIA_CATALOG.map((cat) => {
      const yearStats: Record<
        number,
        { count: number; passPercent: number | null; gpmp: string }
      > = {};
      let schoolCount = 0;
      let schoolPass = 0;
      let schoolGpSum = 0;

      for (let yr = 1; yr <= 6; yr++) {
        const yrRecs = allSourceRecords.filter((r) => {
          const rYear = r.yearLevel || Number(String(r.className).replace(/\D/g, '')) || 1;
          if (rYear !== yr) return false;
          const pan = resolvePanitiaForSubject(r.subjectName);
          return pan.panitiaKey === cat.panitiaKey;
        });

        let evaluated = 0;
        let passed = 0;
        let gpSum = 0;

        yrRecs.forEach((r) => {
          if (mainMode === 'PBD') {
            const tp = extractPbdTpForSession(r);
            if (tp) {
              evaluated++;
              if (tp >= 3) passed++;
              gpSum += PBD_TP_TO_GP_WEIGHT[tp];
            }
          } else {
            const u = extractUasaForSession(r);
            if (u.hasRecord && !u.isTH && u.grade) {
              evaluated++;
              if (u.grade !== 'F') passed++;
              gpSum += UASA_GRADE_TO_GP_WEIGHT[u.grade];
            }
          }
        });

        schoolCount += evaluated;
        schoolPass += passed;
        schoolGpSum += gpSum;

        yearStats[yr] = {
          count: evaluated,
          passPercent: evaluated > 0 ? Number(((passed / evaluated) * 100).toFixed(1)) : null,
          gpmp: evaluated > 0 ? (gpSum / evaluated).toFixed(2) : '-',
        };
      }

      return {
        panitiaKey: cat.panitiaKey,
        panitiaTitle: cat.panitiaTitle,
        displayLabel: cat.displayLabel,
        shortCode: cat.shortCode,
        yearStats,
        overallCount: schoolCount,
        overallPassPercent:
          schoolCount > 0 ? Number(((schoolPass / schoolCount) * 100).toFixed(1)) : null,
        overallGpmp: schoolCount > 0 ? (schoolGpSum / schoolCount).toFixed(2) : '-',
      };
    });
  }, [allSourceRecords, mainMode, sessionFilter]);

  // ============================================================================
  // SUB-TAB 2: ANALISIS PENGUASAAN MINIMUM IKUT MURID (PER CLASS + PER YEAR + SCHOOL TOTAL)
  // ============================================================================
  const { classMinimumRows, studentMasteryList } = useMemo(() => {
    // Group all records by unique student (rawStudentId or name+year)
    const studentMap = new Map<
      string,
      {
        studentId: string;
        name: string;
        yearLevel: number;
        classCode: string;
        recordsBySubjKey: Map<string, StudentSubjectEvalItem>;
      }
    >();

    allSourceRecords.forEach((r) => {
      const rYear = r.yearLevel || Number(String(r.className).replace(/\D/g, '')) || 1;
      const rawSid =
        r.rawStudentId ||
        String(r.studentId || '').split('_')[0] ||
        `${r.name}_${rYear}`;
      const stInfo = enrolledStudentsMap.get(rawSid);
      const classCode =
        stInfo?.classCode ||
        normalizeClassCode(rYear, r.rawClassLabel || r.className);
      const panitia = resolvePanitiaForSubject(r.subjectName);
      const subjCode = normalizePbdNameToSubjectCode(r.subjectName) || panitia.shortCode;

      if (mainMode === 'PBD') {
        const tp = extractPbdTpForSession(r);
        if (!tp) return;
        let st = studentMap.get(rawSid);
        if (!st) {
          st = {
            studentId: rawSid,
            name: stInfo?.name || r.name,
            yearLevel: rYear,
            classCode,
            recordsBySubjKey: new Map(),
          };
          studentMap.set(rawSid, st);
        }
        // Note: AM ('AM' / 'Alam Manusia (AM)') has subjCode 'AM', distinct from 'SN' if both exist, so AM is counted properly in the student's evaluated subjects!
        st.recordsBySubjKey.set(subjCode, {
          subjectName: r.subjectName,
          shortCode: subjCode,
          panitiaLabel: panitia.displayLabel,
          tp,
          isBelowMinimum: tp <= 2, // TP1 or TP2
        });
      } else {
        const u = extractUasaForSession(r);
        if (!u.hasRecord || u.isTH || !u.grade) return;
        let st = studentMap.get(rawSid);
        if (!st) {
          st = {
            studentId: rawSid,
            name: stInfo?.name || r.name,
            yearLevel: rYear,
            classCode,
            recordsBySubjKey: new Map(),
          };
          studentMap.set(rawSid, st);
        }
        st.recordsBySubjKey.set(subjCode, {
          subjectName: r.subjectName,
          shortCode: subjCode,
          panitiaLabel: panitia.displayLabel,
          mark: u.numericMark,
          grade: u.grade,
          isTH: u.isTH,
          isBelowMinimum: u.grade === 'F', // Gred F (0-19)
        });
      }
    });

    const summaries: StudentMinimumMasterySummary[] = [];
    studentMap.forEach((st) => {
      const evals = Array.from(st.recordsBySubjKey.values());
      if (evals.length === 0) return;
      const failedList = evals.filter((e) => e.isBelowMinimum);
      let gpPoints = 0;
      let gpCount = 0;
      evals.forEach((e) => {
        if (mainMode === 'PBD' && e.tp) {
          gpPoints += PBD_TP_TO_GP_WEIGHT[e.tp];
          gpCount++;
        } else if (mainMode === 'UASA' && e.grade) {
          gpPoints += UASA_GRADE_TO_GP_WEIGHT[e.grade];
          gpCount++;
        }
      });

      summaries.push({
        studentId: st.studentId,
        name: st.name,
        yearLevel: st.yearLevel,
        classCode: st.classCode,
        classDisplay: `${st.classCode} (Tahun ${st.yearLevel})`,
        totalSubjectsEvaluated: evals.length,
        failedSubjectsCount: failedList.length,
        allMastered: failedList.length === 0,
        subjectEvals: evals,
        failedSubjectDetails: failedList,
        studentGpsPointsSum: gpPoints,
        studentGpsSubjectsCount: gpCount,
      });
    });

    summaries.sort((a, b) =>
      a.yearLevel !== b.yearLevel
        ? a.yearLevel - b.yearLevel
        : a.classCode !== b.classCode
        ? a.classCode.localeCompare(b.classCode)
        : a.name.localeCompare(b.name)
    );

    const buildRowFromStudents = (
      rowKey: string,
      rowType: 'CLASS' | 'YEAR_SUBTOTAL' | 'SCHOOL_TOTAL',
      label: string,
      list: StudentMinimumMasterySummary[],
      yearLevel?: number
    ): ClassMinimumSummaryRow => {
      const total = list.length;
      const pct = (n: number) => (total > 0 ? Number(((n / total) * 100).toFixed(1)) : 0);
      const menguasaiSemua = list.filter((s) => s.failedSubjectsCount === 0).length;
      const failed1 = list.filter((s) => s.failedSubjectsCount === 1).length;
      const failed2 = list.filter((s) => s.failedSubjectsCount === 2).length;
      const failed3Plus = list.filter((s) => s.failedSubjectsCount >= 3).length;

      let gpSum = 0;
      let gpSubjCount = 0;
      list.forEach((s) => {
        gpSum += s.studentGpsPointsSum;
        gpSubjCount += s.studentGpsSubjectsCount;
      });

      return {
        rowKey,
        rowType,
        yearLevel,
        label,
        jumlahMurid: total,
        menguasaiSemuaCount: menguasaiSemua,
        menguasaiSemuaPercent: pct(menguasaiSemua),
        failed1Count: failed1,
        failed1Percent: pct(failed1),
        failed2Count: failed2,
        failed2Percent: pct(failed2),
        failed3PlusCount: failed3Plus,
        failed3PlusPercent: pct(failed3Plus),
        gps: gpSubjCount > 0 ? (gpSum / gpSubjCount).toFixed(2) : '-',
        studentsInRow: list,
        interventionStudents: list.filter((s) => s.failedSubjectsCount > 0),
      };
    };

    const rows: ClassMinimumSummaryRow[] = [];
    for (let yr = 1; yr <= 6; yr++) {
      const yrStudents = summaries.filter((s) => s.yearLevel === yr);
      // Group by distinct classCode within this year (default to `${yr}M` if none)
      const classCodes = Array.from(new Set(yrStudents.map((s) => s.classCode))).sort();
      const effectiveClassCodes = classCodes.length > 0 ? classCodes : [`${yr}M`];

      effectiveClassCodes.forEach((clsCode) => {
        const clsStudents = yrStudents.filter((s) => s.classCode === clsCode);
        rows.push(
          buildRowFromStudents(
            `CLASS_${yr}_${clsCode}`,
            'CLASS',
            `${clsCode} (Tahun ${yr})`,
            clsStudents,
            yr
          )
        );
      });

      // Subtotal row for Tahun X
      rows.push(
        buildRowFromStudents(
          `YEAR_${yr}`,
          'YEAR_SUBTOTAL',
          `Jumlah Tahun ${yr}`,
          yrStudents,
          yr
        )
      );
    }

    // Grand total row for whole school
    rows.push(
      buildRowFromStudents(
        'SCHOOL_TOTAL',
        'SCHOOL_TOTAL',
        'JUMLAH KESELURUHAN SEKOLAH (TAHUN 1 – TAHUN 6)',
        summaries
      )
    );

    return { classMinimumRows: rows, studentMasteryList: summaries };
  }, [allSourceRecords, enrolledStudentsMap, mainMode, sessionFilter]);

  const activeInterventionRow = useMemo(() => {
    return (
      classMinimumRows.find((r) => r.rowKey === selectedInterventionRowKey) ||
      classMinimumRows.find((r) => r.rowKey === 'SCHOOL_TOTAL') ||
      null
    );
  }, [classMinimumRows, selectedInterventionRowKey]);

  const filteredInterventionStudents = useMemo(() => {
    if (!activeInterventionRow) return [];
    const base = activeInterventionRow.interventionStudents;
    if (interventionBucketFilter === '1_SUBJEK') {
      return base.filter((s) => s.failedSubjectsCount === 1);
    }
    if (interventionBucketFilter === '2_SUBJEK') {
      return base.filter((s) => s.failedSubjectsCount === 2);
    }
    if (interventionBucketFilter === '3_PLUS_SUBJEK') {
      return base.filter((s) => s.failedSubjectsCount >= 3);
    }
    return base;
  }, [activeInterventionRow, interventionBucketFilter]);

  // ============================================================================
  // EXCEL EXPORT (.xlsx) WITH DEDICATED WORKSHEETS (PANITIA + IKUT MURID + INTERVENSI)
  // ============================================================================
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    const sessionLabel =
      sessionFilter === 'PENGGAL_1'
        ? 'Penggal 1'
        : sessionFilter === 'PENGGAL_2'
        ? 'Penggal 2'
        : 'UASA Akhir Tahun';
    const yearScopeLabel = yearScope === 'ALL' ? 'Keseluruhan Sekolah (T1-T6)' : `Tahun ${yearScope}`;

    if (mainMode === 'PBD') {
      const panitiaSheetData = pbdPanitiaTableRows.map((row, idx) => ({
        Bil: idx + 1,
        'Panitia / Mata Pelajaran': `${row.panitiaTitle} — ${row.displayLabel}`,
        'Bil. Murid': row.bilMurid,
        'TP1 (Bil)': row.tpCounts[1],
        'TP1 (%)': `${row.tpPercents[1]}%`,
        'TP2 (Bil)': row.tpCounts[2],
        'TP2 (%)': `${row.tpPercents[2]}%`,
        'TP3 (Bil)': row.tpCounts[3],
        'TP3 (%)': `${row.tpPercents[3]}%`,
        'TP4 (Bil)': row.tpCounts[4],
        'TP4 (%)': `${row.tpPercents[4]}%`,
        'TP5 (Bil)': row.tpCounts[5],
        'TP5 (%)': `${row.tpPercents[5]}%`,
        'TP6 (Bil)': row.tpCounts[6],
        'TP6 (%)': `${row.tpPercents[6]}%`,
        'Menguasai Minimum TP3-TP6 (Bil)': row.menguasaiCount,
        'Menguasai Minimum TP3-TP6 (%)': `${row.menguasaiPercent}%`,
        'Intervensi TP1-TP2 (Bil)': row.intervensiCount,
        'Intervensi TP1-TP2 (%)': `${row.intervensiPercent}%`,
        GPMP: row.gpmp,
      }));
      const wsPanitia = XLSX.utils.json_to_sheet(panitiaSheetData);
      XLSX.utils.book_append_sheet(wb, wsPanitia, 'Analisis_Panitia_PBD');
    } else {
      const panitiaSheetData = uasaPanitiaTableRows.map((row, idx) => ({
        Bil: idx + 1,
        'Panitia / Mata Pelajaran': `${row.panitiaTitle} — ${row.displayLabel}`,
        Daftar: row.daftar,
        Hadir: row.hadir,
        TH: row.th,
        'Gred A (Bil)': row.gradeCounts.A,
        'Gred A (%)': `${row.gradePercents.A}%`,
        'Gred B (Bil)': row.gradeCounts.B,
        'Gred B (%)': `${row.gradePercents.B}%`,
        'Gred C (Bil)': row.gradeCounts.C,
        'Gred C (%)': `${row.gradePercents.C}%`,
        'Gred D (Bil)': row.gradeCounts.D,
        'Gred D (%)': `${row.gradePercents.D}%`,
        'Gred E (Bil)': row.gradeCounts.E,
        'Gred E (%)': `${row.gradePercents.E}%`,
        'Gred F (Bil)': row.gradeCounts.F,
        'Gred F (%)': `${row.gradePercents.F}%`,
        'Lulus Gred A-E (Bil)': row.lulusCount,
        'Lulus Gred A-E (%)': `${row.lulusPercent}%`,
        'Belum Menguasai Gred F (Bil)': row.belumMenguasaiCount,
        'Belum Menguasai Gred F (%)': `${row.belumMenguasaiPercent}%`,
        GPMP: row.gpmp,
      }));
      const wsPanitia = XLSX.utils.json_to_sheet(panitiaSheetData);
      XLSX.utils.book_append_sheet(wb, wsPanitia, 'Analisis_Panitia_UASA');
    }

    // Sheet 2: Cross-Year Comparison (T1-T6)
    const crossYearData = crossYearPanitiaComparison.map((row, idx) => ({
      Bil: idx + 1,
      'Panitia / Mata Pelajaran': `${row.panitiaTitle} (${row.displayLabel})`,
      'T1 (% / GPMP)': row.yearStats[1].passPercent !== null ? `${row.yearStats[1].passPercent}% (${row.yearStats[1].gpmp})` : '-',
      'T2 (% / GPMP)': row.yearStats[2].passPercent !== null ? `${row.yearStats[2].passPercent}% (${row.yearStats[2].gpmp})` : '-',
      'T3 (% / GPMP)': row.yearStats[3].passPercent !== null ? `${row.yearStats[3].passPercent}% (${row.yearStats[3].gpmp})` : '-',
      'T4 (% / GPMP)': row.yearStats[4].passPercent !== null ? `${row.yearStats[4].passPercent}% (${row.yearStats[4].gpmp})` : '-',
      'T5 (% / GPMP)': row.yearStats[5].passPercent !== null ? `${row.yearStats[5].passPercent}% (${row.yearStats[5].gpmp})` : '-',
      'T6 (% / GPMP)': row.yearStats[6].passPercent !== null ? `${row.yearStats[6].passPercent}% (${row.yearStats[6].gpmp})` : '-',
      'Keseluruhan (% / GPMP)':
        row.overallPassPercent !== null ? `${row.overallPassPercent}% (${row.overallGpmp})` : '-',
    }));
    const wsCrossYear = XLSX.utils.json_to_sheet(crossYearData);
    XLSX.utils.book_append_sheet(wb, wsCrossYear, 'Perbandingan_T1_T6');

    // Sheet 3: Analisis Penguasaan Minimum Ikut Murid (Kelas & Tahun)
    const ikutMuridSheetData = classMinimumRows.map((row) =>
      mainMode === 'PBD'
        ? {
            'Kelas / Tahun': row.label,
            'Jumlah Murid': row.jumlahMurid,
            'Menguasai Semua MP (Min TP3) (Bil)': row.menguasaiSemuaCount,
            'Menguasai Semua MP (Min TP3) (%)': `${row.menguasaiSemuaPercent}%`,
            '1 Subjek TP1/TP2 (Bil)': row.failed1Count,
            '1 Subjek TP1/TP2 (%)': `${row.failed1Percent}%`,
            '2 Subjek TP1/TP2 (Bil)': row.failed2Count,
            '2 Subjek TP1/TP2 (%)': `${row.failed2Percent}%`,
            '>=3 Subjek TP1/TP2 (Bil)': row.failed3PlusCount,
            '>=3 Subjek TP1/TP2 (%)': `${row.failed3PlusPercent}%`,
            'GPS / Purata GP': row.gps,
          }
        : {
            'Kelas / Tahun': row.label,
            'Calon Hadir': row.jumlahMurid,
            'Lulus Semua MP (Min Gred E / 0 Gred F) (Bil)': row.menguasaiSemuaCount,
            'Lulus Semua MP (Min Gred E / 0 Gred F) (%)': `${row.menguasaiSemuaPercent}%`,
            '1 Subjek Gred F (Bil)': row.failed1Count,
            '1 Subjek Gred F (%)': `${row.failed1Percent}%`,
            '2 Subjek Gred F (Bil)': row.failed2Count,
            '2 Subjek Gred F (%)': `${row.failed2Percent}%`,
            '>=3 Subjek Gred F (Bil)': row.failed3PlusCount,
            '>=3 Subjek Gred F (%)': `${row.failed3PlusPercent}%`,
            GPS: row.gps,
          }
    );
    const wsIkutMurid = XLSX.utils.json_to_sheet(ikutMuridSheetData);
    XLSX.utils.book_append_sheet(wb, wsIkutMurid, 'Analisis_Ikut_Murid');

    // Sheet 4: Senarai Murid Intervensi
    const intervensiData = studentMasteryList
      .filter((s) => s.failedSubjectsCount > 0)
      .map((s, idx) => ({
        Bil: idx + 1,
        'Nama Murid': s.name,
        Kelas: s.classDisplay,
        'Bil. Subjek Dinilai': s.totalSubjectsEvaluated,
        'Bil. Subjek Belum Menguasai': s.failedSubjectsCount,
        'Senarai Subjek Intervensi (Termasuk AM/SN)': s.failedSubjectDetails
          .map((f) =>
            mainMode === 'PBD'
              ? `${f.subjectName} (${f.shortCode}): TP${f.tp}`
              : `${f.subjectName} (${f.shortCode}): ${f.mark ?? '-'}% [${f.grade}]`
          )
          .join(' | '),
      }));
    const wsIntervensi = XLSX.utils.json_to_sheet(
      intervensiData.length > 0
        ? intervensiData
        : [{ Catatan: 'Semua murid telah mencapai penguasaan minimum dalam semua mata pelajaran.' }]
    );
    XLSX.utils.book_append_sheet(wb, wsIntervensi, 'Senarai_Murid_Intervensi');

    const safeFileName = `Laporan_Dialog_Prestasi_${mainMode}_${sessionLabel.replace(/\s+/g, '_')}_${yearScopeLabel.replace(/[^a-zA-Z0-9]/g, '_')}_Sesi_${academicYear}.xlsx`;
    XLSX.writeFile(wb, safeFileName);
  };

  // ============================================================================
  // PRINT DIALOG PRESTASI REPORT (A4)
  // ============================================================================
  const handlePrintDialogPrestasi = () => {
    const res = triggerSmartPrint({
      elementId: 'dialog-prestasi-print-area',
      title: `Laporan_Dialog_Prestasi_${mainMode}_Sesi_${academicYear}`,
      orientation: 'landscape',
      onNotice: (msg) => setPrintNotice(msg),
    });
    if (res.mode !== 'native') {
      setPrintNotice(res.message);
    }
  };

  // ============================================================================
  // EXISTING ROLE-SCOPED FILTERED RECORDS (FOR SUB-TAB 3: TERPERINCI)
  // ============================================================================
  const records = useMemo(() => {
    if (roleScopeTab === 'MY_SUBJECTS') {
      if (!selectedSubjName) return [];
      const selectedPan = resolvePanitiaForSubject(selectedSubjName);
      return allSourceRecords.filter((r) => {
        const rYear = r.yearLevel || Number(String(r.className).replace(/\D/g, '')) || 1;
        if (rYear !== selectedSubjYear) return false;
        if (r.subjectName === selectedSubjName) return true;
        // Also match if both belong to Panitia Sains and code matches
        if (
          selectedPan.panitiaKey === 'PANITIA_SAINS' &&
          resolvePanitiaForSubject(r.subjectName).panitiaKey === 'PANITIA_SAINS'
        ) {
          return true;
        }
        return false;
      });
    }

    if (roleScopeTab === 'MY_CLASS') {
      if (!canViewMyClass) return [];
      return allSourceRecords.filter((r) => {
        const rYear = r.yearLevel || Number(String(r.className).replace(/\D/g, '')) || 1;
        if (rYear !== selectedMyClassYear) return false;
        if (
          selectedMyClassSubjectFilter !== 'ALL' &&
          r.subjectName !== selectedMyClassSubjectFilter
        ) {
          return false;
        }
        return true;
      });
    }

    if (roleScopeTab === 'MY_PANITIA') {
      if (!canViewMyPanitia) return [];
      const targetPan = resolvePanitiaForSubject(selectedPanitiaSubject);
      return allSourceRecords.filter((r) => {
        const recPan = resolvePanitiaForSubject(r.subjectName);
        if (recPan.panitiaKey !== targetPan.panitiaKey && r.subjectName !== selectedPanitiaSubject) {
          return false;
        }
        const rYear = r.yearLevel || Number(String(r.className).replace(/\D/g, '')) || 1;
        if (selectedPanitiaYearFilter !== 'ALL' && rYear !== selectedPanitiaYearFilter) {
          return false;
        }
        return true;
      });
    }

    return [];
  }, [
    allSourceRecords,
    roleScopeTab,
    selectedSubjYear,
    selectedSubjName,
    canViewMyClass,
    selectedMyClassYear,
    selectedMyClassSubjectFilter,
    canViewMyPanitia,
    selectedPanitiaSubject,
    selectedPanitiaYearFilter,
  ]);

  // Compute Overall Performance Metrics for currently active scope
  const metrics = useMemo(() => {
    let meetingTargetCount = 0;
    let belowTargetCount = 0;
    let nearMissCount = 0;
    let mismatchCount = 0;

    const pbdCounts: Record<`TP${PbdLevel}`, number> = {
      TP1: 0,
      TP2: 0,
      TP3: 0,
      TP4: 0,
      TP5: 0,
      TP6: 0,
    };

    const uasaCounts: Record<UasaGrade, number> = {
      A: 0,
      B: 0,
      C: 0,
      D: 0,
      E: 0,
      F: 0,
    };

    const priorityCounts: Record<InterventionPriority, number> = {
      CRITICAL: 0,
      HIGH: 0,
      WATCH: 0,
      'ON TRACK': 0,
      EXCELLENT: 0,
    };

    records.forEach((r) => {
      const latestTp = extractPbdTpForSession(r);
      const targetTp = r.pbd.etr || 4;
      const tovTp = r.pbd.tov;

      if (latestTp) {
        pbdCounts[`TP${latestTp}`]++;
        if (latestTp >= 3) {
          meetingTargetCount++;
        } else {
          belowTargetCount++;
        }
      }

      const uEval = extractUasaForSession(r);
      if (uEval.grade) {
        uasaCounts[uEval.grade]++;
      }

      const pbdNearMiss = getNearMissStatus(latestTp, targetTp);
      const uasaNearMiss = getNearMissStatus(uEval.numericMark, undefined, {
        targetGrade: r.uasa.targetGrade as any,
      });
      if (pbdNearMiss.isNearMiss || uasaNearMiss.isNearMiss) {
        nearMissCount++;
      }

      const pbdMismatch = getMismatchStatus(latestTp, targetTp);
      const uasaMismatch = getMismatchStatus(uEval.numericMark, r.uasa.targetGrade);
      if (pbdMismatch.isMismatch || uasaMismatch.isMismatch) {
        mismatchCount++;
      }

      const priority = getInterventionPriority(
        latestTp || uEval.numericMark,
        targetTp || r.uasa.targetGrade,
        tovTp || r.uasa.previousMark
      );
      priorityCounts[priority.priority]++;
    });

    const totalStudents = records.length || 1;
    const meetingTargetPercent = Math.round((meetingTargetCount / totalStudents) * 100);
    const belowTargetPercent = Math.round((belowTargetCount / totalStudents) * 100);

    return {
      total: records.length,
      meetingTargetCount,
      meetingTargetPercent,
      belowTargetCount,
      belowTargetPercent,
      nearMissCount,
      mismatchCount,
      pbdCounts,
      uasaCounts,
      priorityCounts,
    };
  }, [records, sessionFilter]);

  const pbdChartData = useMemo(() => {
    return ([1, 2, 3, 4, 5, 6] as PbdLevel[]).map((lvl) => ({
      name: `TP${lvl}`,
      count: metrics.pbdCounts[`TP${lvl}`],
      fill: PBD_CHART_PALETTE[`TP${lvl}`],
    }));
  }, [metrics.pbdCounts]);

  const uasaChartData = useMemo(() => {
    return (['A', 'B', 'C', 'D', 'E', 'F'] as UasaGrade[]).map((g) => ({
      name: `Gred ${g}`,
      grade: g,
      count: metrics.uasaCounts[g],
      fill: UASA_CHART_PALETTE[g],
    }));
  }, [metrics.uasaCounts]);

  const filteredStudents = useMemo(() => {
    return records.filter((r) => {
      const matchesSearch = r.name.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      const latestTp = extractPbdTpForSession(r);
      const targetTp = r.pbd.etr || 4;
      const pbdNearMiss = getNearMissStatus(latestTp, targetTp);
      const uasaNearMiss = getNearMissStatus(r.uasa.currentMark, undefined, {
        targetGrade: r.uasa.targetGrade as any,
      });
      const isNearMiss = pbdNearMiss.isNearMiss || uasaNearMiss.isNearMiss;

      const pbdMismatch = getMismatchStatus(latestTp, targetTp);
      const uasaMismatch = getMismatchStatus(r.uasa.currentMark, r.uasa.targetGrade);
      const isMismatch = pbdMismatch.isMismatch || uasaMismatch.isMismatch;

      const priority = getInterventionPriority(
        latestTp || r.uasa.currentMark,
        targetTp,
        r.pbd.tov
      );

      if (studentFilter === 'CRITICAL') return priority.priority === 'CRITICAL';
      if (studentFilter === 'NEAR_MISS') return isNearMiss;
      if (studentFilter === 'MISMATCH') return isMismatch;
      if (studentFilter === 'EXCELLENT') return priority.priority === 'EXCELLENT';
      return true;
    });
  }, [records, searchQuery, studentFilter, sessionFilter]);

  const sessionDisplayLabel =
    sessionFilter === 'PENGGAL_1'
      ? 'Pentaksiran Penggal 1 (AR1 / Pertengahan Tahun)'
      : sessionFilter === 'PENGGAL_2'
      ? 'Pentaksiran Penggal 2 (AR2 / Semasa)'
      : 'Ujian Akhir Sesi Akademik (UASA / Akhir Tahun)';

  const yearScopeDisplayLabel =
    yearScope === 'ALL'
      ? 'Keseluruhan Sekolah (Tahun 1 – Tahun 6)'
      : `Tahun ${yearScope}`;

  return (
    <div className="space-y-6">
      {/* ====================================================================
          1. TOP HEADER: MAIN MODE (ANALISIS PBD vs ANALISIS UASA), SESSION FILTER,
             CORE SUB-TABS (IKUT PANITIA vs IKUT MURID) & PRINT/EXCEL ACTIONS
         ==================================================================== */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-5 print:hidden">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-black uppercase flex items-center gap-1">
                <ShieldCheck size={12} />
                DIALOG PRESTASI AKADEMIK KPM • TAHUN 1 – TAHUN 6
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 text-[10px] font-black uppercase">
                Panitia Sains = Sains (SN / AM) Bersepadu
              </span>
              {accessProfile.roleBadges.map((b, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-black uppercase"
                >
                  {b}
                </span>
              ))}
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <BarChart3 className="text-blue-600" size={24} />
              Sistem Analisis Penilaian PBD &amp; UASA ({activeSchoolName} • {activeSchoolCode})
            </h2>
            <p className="text-xs text-slate-500">
              Mod Aktif: <strong className="text-blue-700">Analisis {mainMode}</strong> &bull;{' '}
              <strong className="text-slate-800">{sessionDisplayLabel}</strong> &bull;{' '}
              <strong className="text-emerald-700">{yearScopeDisplayLabel}</strong> &bull;{' '}
              {loadingFirestore
                ? 'Memuatkan data Firestore...'
                : `${allSourceRecords.length} Rekod Subjek Murid`}
            </p>
          </div>

          {/* Right Controls: Academic Year + Print Dialog Prestasi (A4) + Export Excel (.xlsx) */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-2 rounded-2xl border border-slate-200">
              <Calendar size={14} className="text-blue-600" />
              <span className="text-[11px] font-black uppercase text-slate-500">Sesi:</span>
              <select
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="bg-transparent text-xs font-black text-slate-900 outline-none cursor-pointer"
              >
                {ACADEMIC_YEARS.map((yr) => (
                  <option key={yr} value={yr}>
                    Sesi {yr}
                  </option>
                ))}
              </select>
            </div>

            {mainMode !== 'PRASEKOLAH' && (
              <>
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wide flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                >
                  <FileSpreadsheet size={15} />
                  <span>Eksport Excel (.xlsx)</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintDialogPrestasi}
                  className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase tracking-wide flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                >
                  <Printer size={15} />
                  <span>Cetak Laporan Dialog Prestasi (A4)</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Row 2: Main Mode Switcher (Analisis PBD vs Analisis UASA vs Analisis Prasekolah) + Session Filter */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Main Mode Toggle */}
            <div className="inline-flex flex-wrap bg-slate-100 p-1.5 rounded-2xl border border-slate-200 gap-1">
              <button
                type="button"
                onClick={() => handleSwitchMainMode('PBD')}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide flex items-center gap-2 transition cursor-pointer ${
                  mainMode === 'PBD'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BookOpen size={15} />
                <span>Analisis PBD (TP1 – TP6)</span>
              </button>
              <button
                type="button"
                onClick={() => handleSwitchMainMode('UASA')}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide flex items-center gap-2 transition cursor-pointer ${
                  mainMode === 'UASA'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <GraduationCap size={15} />
                <span>Analisis UASA (Gred A – F)</span>
              </button>
              <button
                type="button"
                onClick={() => handleSwitchMainMode('PRASEKOLAH')}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide flex items-center gap-2 transition cursor-pointer ${
                  mainMode === 'PRASEKOLAH'
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles size={15} />
                <span>Analisis Prasekolah (Inspirasi)</span>
              </button>
            </div>

            {/* Session Filter: Penggal 1 / Penggal 2 / UASA (for Elementary PBD & UASA) */}
            {mainMode !== 'PRASEKOLAH' && (
              <div className="inline-flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 gap-1">
                <span className="text-[10px] font-black uppercase text-slate-500 px-2.5">
                  Fasa Penilaian:
                </span>
                {(
                  [
                    { id: 'PENGGAL_1', label: 'Penggal 1' },
                    { id: 'PENGGAL_2', label: 'Penggal 2' },
                    { id: 'UASA', label: 'UASA / Akhir Tahun' },
                  ] as { id: AssessmentSessionFilter; label: string }[]
                ).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSessionFilter(s.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                      sessionFilter === s.id
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Core Sub-Tab Switcher (Page 1: Ikut Panitia, Page 2: Ikut Murid, Page 3: Terperinci) */}
          {mainMode !== 'PRASEKOLAH' && (
            <div className="inline-flex flex-wrap bg-slate-100 p-1.5 rounded-2xl border border-slate-200 gap-1">
              <button
                type="button"
                onClick={() => setCoreSubTab('PANITIA')}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition cursor-pointer ${
                  coreSubTab === 'PANITIA'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers size={14} />
                <span>1. Analisis Mata Pelajaran Ikut Panitia</span>
              </button>
              <button
                type="button"
                onClick={() => setCoreSubTab('IKUT_MURID')}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition cursor-pointer ${
                  coreSubTab === 'IKUT_MURID'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users size={14} />
                <span>2. Analisis Penguasaan Minimum Ikut Murid</span>
              </button>
              <button
                type="button"
                onClick={() => setCoreSubTab('TERPERINCI')}
                className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition cursor-pointer ${
                  coreSubTab === 'TERPERINCI'
                    ? 'bg-slate-800 text-white shadow'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Eye size={14} />
                <span>Rekod &amp; Kad Murid (RBAC)</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {printNotice && (
        <div className="print:hidden p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-bold flex items-center justify-between">
          <span>{printNotice}</span>
          <button
            type="button"
            onClick={() => setPrintNotice(null)}
            className="text-indigo-600 hover:text-indigo-900 font-black px-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ====================================================================
          INDEPENDENT PRASEKOLAH INSPIRASI ANALYSIS PANEL
         ==================================================================== */}
      {mainMode === 'PRASEKOLAH' ? (
        <PrasekolahAnalysisPanel
          academicYear={academicYear}
          schoolCode={activeSchoolCode}
          schoolName={activeSchoolName}
          schoolLogo={activeSchoolLogo}
          principalName={principalName}
        />
      ) : (
        <>
          {/* ====================================================================
              PRINTABLE DIALOG PRESTASI CONTAINER (USED BY BOTH LIVE UI & A4 PRINT)
             ==================================================================== */}
          <div id="dialog-prestasi-print-area" className="space-y-6">
        {/* Official School Letterhead (Always visible in Print, and compact banner in UI) */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <SchoolLogo
                src={activeSchoolLogo}
                schoolCode={activeSchoolCode}
                className="w-16 h-16 bg-white border-slate-300 shrink-0"
              />
              <div>
                <div className="text-lg font-black uppercase tracking-wide text-slate-900">
                  {activeSchoolName} ({activeSchoolCode})
                </div>
                <div className="text-xs font-bold text-slate-700 uppercase">
                  LAPORAN DIALOG PRESTASI AKADEMIK &mdash; ANALISIS {mainMode} ({sessionDisplayLabel})
                </div>
                <div className="text-[11px] text-slate-500 font-semibold">
                  Sesi Persekolahan {academicYear} &bull; Skop:{' '}
                  {coreSubTab === 'PANITIA'
                    ? `Analisis Mata Pelajaran Ikut Panitia (${yearScopeDisplayLabel})`
                    : 'Analisis Penguasaan Minimum Ikut Murid (Tahun 1 – Tahun 6)'}
                </div>
              </div>
            </div>
            <div className="border-2 border-slate-900 px-3.5 py-1.5 text-center shrink-0 self-start sm:self-center">
              <div className="text-[10px] font-black uppercase text-slate-900">
                DOKUMEN DIALOG PRESTASI
              </div>
              <div className="text-[11px] font-black text-blue-700">
                SESI {academicYear} &bull; {mainMode}
              </div>
            </div>
          </div>

          {/* ================================================================
              SUB-TAB 1: ANALISIS MATA PELAJARAN IKUT PANITIA (KESELURUHAN & TAHUN 1 - 6)
             ================================================================ */}
          {coreSubTab === 'PANITIA' && (
            <div className="pt-5 space-y-6">
              {/* Year Scope Filter Bar: Keseluruhan Sekolah, Tahun 1 .. Tahun 6 */}
              <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-black uppercase text-slate-500 mr-1">
                    Skop Tahun:
                  </span>
                  {(
                    [
                      { value: 'ALL', label: 'Keseluruhan Sekolah (T1–T6)' },
                      { value: 1, label: 'Tahun 1' },
                      { value: 2, label: 'Tahun 2' },
                      { value: 3, label: 'Tahun 3' },
                      { value: 4, label: 'Tahun 4' },
                      { value: 5, label: 'Tahun 5' },
                      { value: 6, label: 'Tahun 6' },
                    ] as { value: YearScopeFilter; label: string }[]
                  ).map((btn) => (
                    <button
                      key={String(btn.value)}
                      type="button"
                      onClick={() => setYearScope(btn.value)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                        yearScope === btn.value
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] font-bold text-teal-800 bg-teal-50 border border-teal-200 px-3 py-1 rounded-xl">
                  💡 Rekod AM / Alam Manusia (Tahap 1) &amp; SN / Sains disatukan di bawah{' '}
                  <strong>Panitia Sains — Sains (SN / AM)</strong>
                </span>
              </div>

              {/* TABLE 1A: PBD PANITIA TABLE */}
              {mainMode === 'PBD' ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black uppercase text-slate-900">
                      Jadual 1: Analisis Pencapaian PBD Mengikut Panitia Mata Pelajaran &mdash;{' '}
                      <span className="text-blue-700">{yearScopeDisplayLabel}</span>
                    </h3>
                    <span className="text-[11px] font-bold text-slate-500">
                      Tahap Penguasaan Minimum: Sekurang-kurangnya TP3 (TP3 – TP6)
                    </span>
                  </div>

                  <div className="overflow-x-auto border border-slate-300 rounded-2xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-900 text-white font-black uppercase text-[10px] border-b border-slate-300">
                          <th className="py-3 px-2.5 text-center border-r border-slate-700 w-10">
                            Bil
                          </th>
                          <th className="py-3 px-3 border-r border-slate-700 min-w-[200px]">
                            Panitia / Mata Pelajaran
                          </th>
                          <th className="py-3 px-2.5 text-center border-r border-slate-700">
                            Bil. Murid
                          </th>
                          <th className="py-3 px-2.5 text-center border-r border-slate-700 bg-rose-950/90 text-rose-200">
                            TP1
                            <div className="text-[9px] font-normal">(Bil / %)</div>
                          </th>
                          <th className="py-3 px-2.5 text-center border-r border-slate-700 bg-rose-950/90 text-rose-200">
                            TP2
                            <div className="text-[9px] font-normal">(Bil / %)</div>
                          </th>
                          <th className="py-3 px-2.5 text-center border-r border-slate-700 bg-amber-950/80 text-amber-200">
                            TP3
                            <div className="text-[9px] font-normal">(Bil / %)</div>
                          </th>
                          <th className="py-3 px-2.5 text-center border-r border-slate-700 bg-emerald-950/80 text-emerald-200">
                            TP4
                            <div className="text-[9px] font-normal">(Bil / %)</div>
                          </th>
                          <th className="py-3 px-2.5 text-center border-r border-slate-700 bg-emerald-950/80 text-emerald-200">
                            TP5
                            <div className="text-[9px] font-normal">(Bil / %)</div>
                          </th>
                          <th className="py-3 px-2.5 text-center border-r border-slate-700 bg-emerald-950/80 text-emerald-200">
                            TP6
                            <div className="text-[9px] font-normal">(Bil / %)</div>
                          </th>
                          <th className="py-3 px-3 text-center border-r border-slate-700 bg-emerald-800 text-white">
                            Menguasai Minimum
                            <div className="text-[9px] font-bold">TP3 – TP6 (Bil &amp; %)</div>
                          </th>
                          <th className="py-3 px-3 text-center border-r border-slate-700 bg-rose-800 text-white">
                            Intervensi
                            <div className="text-[9px] font-bold">TP1 – TP2 (Bil &amp; %)</div>
                          </th>
                          <th className="py-3 px-2.5 text-center bg-slate-800 text-amber-300">
                            GPMP
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {pbdPanitiaTableRows.map((row, idx) => (
                          <tr
                            key={row.panitiaKey}
                            className={`hover:bg-blue-50/40 ${
                              row.panitiaKey === 'PANITIA_SAINS' ? 'bg-teal-50/30' : ''
                            }`}
                          >
                            <td className="py-2.5 px-2.5 text-center font-mono font-bold text-slate-600 border-r border-slate-200">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3 border-r border-slate-200">
                              <div className="font-black text-slate-900">{row.displayLabel}</div>
                              <div className="text-[10px] font-bold text-slate-500">
                                {row.panitiaTitle}
                              </div>
                            </td>
                            <td className="py-2.5 px-2.5 text-center font-mono font-black text-slate-900 border-r border-slate-200">
                              {row.bilMurid}
                            </td>
                            {([1, 2, 3, 4, 5, 6] as PbdLevel[]).map((lvl) => (
                              <td
                                key={lvl}
                                className={`py-2.5 px-2 text-center font-mono border-r border-slate-200 ${
                                  lvl <= 2
                                    ? 'bg-rose-50/40 text-rose-800'
                                    : lvl === 3
                                    ? 'bg-amber-50/40 text-amber-900'
                                    : 'bg-emerald-50/30 text-emerald-900'
                                }`}
                              >
                                <div className="font-black">{row.tpCounts[lvl]}</div>
                                <div className="text-[10px] text-slate-500">
                                  ({row.tpPercents[lvl]}%)
                                </div>
                              </td>
                            ))}
                            <td className="py-2.5 px-3 text-center font-mono bg-emerald-50/70 border-r border-slate-200">
                              <span className="font-black text-emerald-900">
                                {row.menguasaiCount}
                              </span>{' '}
                              <span className="text-[10px] font-bold text-emerald-700">
                                ({row.menguasaiPercent}%)
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono bg-rose-50/70 border-r border-slate-200">
                              <span className="font-black text-rose-800">
                                {row.intervensiCount}
                              </span>{' '}
                              <span className="text-[10px] font-bold text-rose-600">
                                ({row.intervensiPercent}%)
                              </span>
                            </td>
                            <td className="py-2.5 px-2.5 text-center font-mono font-black text-indigo-900 bg-slate-50">
                              {row.gpmp}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* TABLE 1B: UASA PANITIA TABLE */
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-black uppercase text-slate-900">
                      Jadual 1: Analisis Keputusan UASA Mengikut Panitia Mata Pelajaran &mdash;{' '}
                      <span className="text-indigo-700">{yearScopeDisplayLabel}</span>
                    </h3>
                    <span className="text-[11px] font-bold text-slate-500">
                      Skala KPM: A (82–100) • B (66–81) • C (50–65) • D (35–49) • E (20–34) • F (0–19)
                    </span>
                  </div>

                  <div className="overflow-x-auto border border-slate-300 rounded-2xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-900 text-white font-black uppercase text-[10px] border-b border-slate-300">
                          <th className="py-3 px-2 text-center border-r border-slate-700 w-9">
                            Bil
                          </th>
                          <th className="py-3 px-3 border-r border-slate-700 min-w-[190px]">
                            Panitia / Mata Pelajaran
                          </th>
                          <th className="py-3 px-2 text-center border-r border-slate-700">
                            Daftar
                          </th>
                          <th className="py-3 px-2 text-center border-r border-slate-700">
                            Hadir
                          </th>
                          <th className="py-3 px-2 text-center border-r border-slate-700">
                            TH
                          </th>
                          {(['A', 'B', 'C', 'D', 'E', 'F'] as UasaGrade[]).map((g) => (
                            <th
                              key={g}
                              className={`py-3 px-2 text-center border-r border-slate-700 ${
                                g === 'F'
                                  ? 'bg-rose-950/90 text-rose-200'
                                  : g === 'A' || g === 'B'
                                  ? 'bg-emerald-950/80 text-emerald-200'
                                  : 'bg-slate-800 text-slate-200'
                              }`}
                            >
                              Gred {g}
                              <div className="text-[9px] font-normal">(Bil / %)</div>
                            </th>
                          ))}
                          <th className="py-3 px-2.5 text-center border-r border-slate-700 bg-emerald-800 text-white">
                            Lulus Gred A–E
                            <div className="text-[9px] font-bold">(Bil &amp; %)</div>
                          </th>
                          <th className="py-3 px-2.5 text-center border-r border-slate-700 bg-rose-800 text-white">
                            Belum Menguasai Gred F
                            <div className="text-[9px] font-bold">(Bil &amp; %)</div>
                          </th>
                          <th className="py-3 px-2.5 text-center bg-slate-800 text-amber-300">
                            GPMP
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {uasaPanitiaTableRows.map((row, idx) => (
                          <tr
                            key={row.panitiaKey}
                            className={`hover:bg-indigo-50/40 ${
                              row.panitiaKey === 'PANITIA_SAINS' ? 'bg-teal-50/30' : ''
                            }`}
                          >
                            <td className="py-2.5 px-2 text-center font-mono font-bold text-slate-600 border-r border-slate-200">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3 border-r border-slate-200">
                              <div className="font-black text-slate-900">{row.displayLabel}</div>
                              <div className="text-[10px] font-bold text-slate-500">
                                {row.panitiaTitle}
                              </div>
                            </td>
                            <td className="py-2.5 px-2 text-center font-mono font-bold text-slate-700 border-r border-slate-200">
                              {row.daftar}
                            </td>
                            <td className="py-2.5 px-2 text-center font-mono font-black text-slate-900 border-r border-slate-200">
                              {row.hadir}
                            </td>
                            <td className="py-2.5 px-2 text-center font-mono text-slate-500 border-r border-slate-200">
                              {row.th}
                            </td>
                            {(['A', 'B', 'C', 'D', 'E', 'F'] as UasaGrade[]).map((g) => (
                              <td
                                key={g}
                                className={`py-2.5 px-2 text-center font-mono border-r border-slate-200 ${
                                  g === 'F'
                                    ? 'bg-rose-50/50 text-rose-800'
                                    : g === 'A' || g === 'B'
                                    ? 'bg-emerald-50/30 text-emerald-900'
                                    : 'text-slate-800'
                                }`}
                              >
                                <div className="font-black">{row.gradeCounts[g]}</div>
                                <div className="text-[10px] text-slate-500">
                                  ({row.gradePercents[g]}%)
                                </div>
                              </td>
                            ))}
                            <td className="py-2.5 px-2.5 text-center font-mono bg-emerald-50/70 border-r border-slate-200">
                              <span className="font-black text-emerald-900">
                                {row.lulusCount}
                              </span>{' '}
                              <span className="text-[10px] font-bold text-emerald-700">
                                ({row.lulusPercent}%)
                              </span>
                            </td>
                            <td className="py-2.5 px-2.5 text-center font-mono bg-rose-50/70 border-r border-slate-200">
                              <span className="font-black text-rose-800">
                                {row.belumMenguasaiCount}
                              </span>{' '}
                              <span className="text-[10px] font-bold text-rose-600">
                                ({row.belumMenguasaiPercent}%)
                              </span>
                            </td>
                            <td className="py-2.5 px-2.5 text-center font-mono font-black text-indigo-900 bg-slate-50">
                              {row.gpmp}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TABLE 2: JADUAL PERBANDINGAN MERENTAS TAHUN (T1 – T6) */}
              <div className="space-y-2 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-black uppercase text-slate-900">
                    Jadual Perbandingan Merentas Tahun (T1 – T6) Mengikut Panitia ({mainMode})
                  </h3>
                  <span className="text-[11px] font-bold text-slate-500">
                    Perbandingan {mainMode === 'PBD' ? '% Menguasai (TP3–TP6)' : '% Lulus (Gred A–E)'} &amp; GPMP dari Tahun 1 hingga Tahun 6
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-300 rounded-2xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-900 font-black uppercase text-[10px] border-b border-slate-300">
                        <th className="py-2.5 px-2.5 text-center border-r border-slate-300 w-10">
                          Bil
                        </th>
                        <th className="py-2.5 px-3 border-r border-slate-300 min-w-[190px]">
                          Panitia / Mata Pelajaran
                        </th>
                        {[1, 2, 3, 4, 5, 6].map((yr) => (
                          <th
                            key={yr}
                            className="py-2.5 px-2.5 text-center border-r border-slate-300"
                          >
                            Tahun {yr}
                            <div className="text-[9px] font-normal text-slate-500">
                              ({mainMode === 'PBD' ? '% Menguasai' : '% Lulus'} • GPMP)
                            </div>
                          </th>
                        ))}
                        <th className="py-2.5 px-3 text-center bg-blue-50 text-blue-950">
                          Keseluruhan (T1–T6)
                          <div className="text-[9px] font-bold text-blue-700">
                            ({mainMode === 'PBD' ? '% Menguasai' : '% Lulus'} • GPMP)
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {crossYearPanitiaComparison.map((row, idx) => (
                        <tr
                          key={row.panitiaKey}
                          className={`hover:bg-slate-50 ${
                            row.panitiaKey === 'PANITIA_SAINS' ? 'bg-teal-50/30' : ''
                          }`}
                        >
                          <td className="py-2 px-2.5 text-center font-mono font-bold text-slate-500 border-r border-slate-200">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200">
                            <div className="font-black text-slate-900">{row.displayLabel}</div>
                            <div className="text-[10px] text-slate-500">{row.panitiaTitle}</div>
                          </td>
                          {[1, 2, 3, 4, 5, 6].map((yr) => {
                            const st = row.yearStats[yr];
                            return (
                              <td
                                key={yr}
                                onClick={() => setYearScope(yr as YearScopeFilter)}
                                title={`Klik untuk tapis Tahun ${yr}`}
                                className="py-2 px-2.5 text-center font-mono border-r border-slate-200 cursor-pointer hover:bg-blue-50/60"
                              >
                                {st.passPercent !== null ? (
                                  <>
                                    <div className="font-black text-slate-900">
                                      {st.passPercent}%
                                    </div>
                                    <div className="text-[10px] text-indigo-700 font-bold">
                                      GP: {st.gpmp}
                                    </div>
                                  </>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="py-2 px-3 text-center font-mono bg-blue-50/50">
                            {row.overallPassPercent !== null ? (
                              <>
                                <div className="font-black text-blue-950">
                                  {row.overallPassPercent}%
                                </div>
                                <div className="text-[10px] font-bold text-blue-700">
                                  GPMP: {row.overallGpmp}
                                </div>
                              </>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              SUB-TAB 2: ANALISIS PENGUASAAN MINIMUM IKUT MURID
              (PER CLASS + PER YEAR SUBTOTAL + SCHOOL GRAND TOTAL + INTERVENSI LIST)
             ================================================================ */}
          {coreSubTab === 'IKUT_MURID' && (
            <div className="pt-5 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-black uppercase text-slate-900">
                    Jadual Rumusan Penguasaan Minimum Ikut Murid (Setiap Kelas, Jumlah Tahun &amp; Keseluruhan Sekolah) &mdash;{' '}
                    <span className="text-emerald-700">Analisis {mainMode}</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Subjek Alam Manusia (AM) diambil kira sepenuhnya dalam jumlah mata pelajaran yang dinilai bagi setiap murid. Klik mana-mana baris kelas atau angka intervensi untuk melihat senarai nama murid dan subjek belum menguasai di bawah.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-300 rounded-2xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    {mainMode === 'PBD' ? (
                      <tr className="bg-slate-900 text-white font-black uppercase text-[10px] border-b border-slate-300">
                        <th className="py-3 px-4 border-r border-slate-700">Kelas / Tahun</th>
                        <th className="py-3 px-3 text-center border-r border-slate-700">
                          Jumlah Murid
                        </th>
                        <th className="py-3 px-3 text-center border-r border-slate-700 bg-emerald-800 text-white">
                          Menguasai Semua Mata Pelajaran
                          <div className="text-[9px] font-bold">
                            (Sekurang-kurangnya TP3 &mdash; Bil &amp; %)
                          </div>
                        </th>
                        <th className="py-3 px-3 text-center border-r border-slate-700 bg-amber-900/90 text-amber-100">
                          1 Subjek TP1/TP2
                          <div className="text-[9px] font-normal">(Bil &amp; %)</div>
                        </th>
                        <th className="py-3 px-3 text-center border-r border-slate-700 bg-rose-900/90 text-rose-100">
                          2 Subjek TP1/TP2
                          <div className="text-[9px] font-normal">(Bil &amp; %)</div>
                        </th>
                        <th className="py-3 px-3 text-center border-r border-slate-700 bg-rose-950 text-rose-200">
                          &ge;3 Subjek TP1/TP2
                          <div className="text-[9px] font-normal">(Bil &amp; %)</div>
                        </th>
                        <th className="py-3 px-3 text-center bg-slate-800 text-amber-300">
                          GPS (PBD)
                        </th>
                      </tr>
                    ) : (
                      <tr className="bg-slate-900 text-white font-black uppercase text-[10px] border-b border-slate-300">
                        <th className="py-3 px-4 border-r border-slate-700">Kelas / Tahun</th>
                        <th className="py-3 px-3 text-center border-r border-slate-700">
                          Calon Hadir
                        </th>
                        <th className="py-3 px-3 text-center border-r border-slate-700 bg-emerald-800 text-white">
                          Lulus Semua Mata Pelajaran
                          <div className="text-[9px] font-bold">
                            (Sekurang-kurangnya Gred E / 0 Gred F &mdash; Bil &amp; %)
                          </div>
                        </th>
                        <th className="py-3 px-3 text-center border-r border-slate-700 bg-amber-900/90 text-amber-100">
                          1 Subjek Gred F
                          <div className="text-[9px] font-normal">(Bil &amp; %)</div>
                        </th>
                        <th className="py-3 px-3 text-center border-r border-slate-700 bg-rose-900/90 text-rose-100">
                          2 Subjek Gred F
                          <div className="text-[9px] font-normal">(Bil &amp; %)</div>
                        </th>
                        <th className="py-3 px-3 text-center border-r border-slate-700 bg-rose-950 text-rose-200">
                          &ge;3 Subjek Gred F
                          <div className="text-[9px] font-normal">(Bil &amp; %)</div>
                        </th>
                        <th className="py-3 px-3 text-center bg-slate-800 text-amber-300">
                          GPS (Gred Purata Sekolah/Kelas)
                        </th>
                      </tr>
                    )}
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {classMinimumRows.map((row) => {
                      const isSelected = selectedInterventionRowKey === row.rowKey;
                      const isSubtotal = row.rowType === 'YEAR_SUBTOTAL';
                      const isGrandTotal = row.rowType === 'SCHOOL_TOTAL';
                      return (
                        <tr
                          key={row.rowKey}
                          onClick={() => {
                            setSelectedInterventionRowKey(row.rowKey);
                            setInterventionBucketFilter('ALL_INTERVENSI');
                          }}
                          className={`cursor-pointer transition ${
                            isGrandTotal
                              ? 'bg-slate-900 text-white font-black'
                              : isSubtotal
                              ? 'bg-slate-100 font-black text-slate-900'
                              : isSelected
                              ? 'bg-blue-50 font-bold text-slate-900 ring-1 ring-inset ring-blue-400'
                              : 'hover:bg-slate-50 text-slate-800'
                          }`}
                        >
                          <td className="py-2.5 px-4 border-r border-slate-200/80 flex items-center justify-between gap-2">
                            <span>{row.label}</span>
                            {row.interventionStudents.length > 0 && !isGrandTotal && (
                              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-black print:hidden">
                                {row.interventionStudents.length} Intervensi
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-black border-r border-slate-200/80">
                            {row.jumlahMurid}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-center font-mono border-r border-slate-200/80 ${
                              isGrandTotal
                                ? 'bg-emerald-950 text-emerald-300'
                                : 'bg-emerald-50/60 text-emerald-900'
                            }`}
                          >
                            <span className="font-black">{row.menguasaiSemuaCount}</span>{' '}
                            <span className="text-[10px] opacity-80">
                              ({row.menguasaiSemuaPercent}%)
                            </span>
                          </td>
                          <td
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedInterventionRowKey(row.rowKey);
                              setInterventionBucketFilter('1_SUBJEK');
                            }}
                            className={`py-2.5 px-3 text-center font-mono border-r border-slate-200/80 ${
                              isGrandTotal
                                ? 'text-amber-300'
                                : 'hover:bg-amber-100/70 text-amber-900'
                            }`}
                          >
                            <span className="font-black">{row.failed1Count}</span>{' '}
                            <span className="text-[10px] opacity-80">
                              ({row.failed1Percent}%)
                            </span>
                          </td>
                          <td
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedInterventionRowKey(row.rowKey);
                              setInterventionBucketFilter('2_SUBJEK');
                            }}
                            className={`py-2.5 px-3 text-center font-mono border-r border-slate-200/80 ${
                              isGrandTotal
                                ? 'text-rose-300'
                                : 'hover:bg-rose-100/70 text-rose-800'
                            }`}
                          >
                            <span className="font-black">{row.failed2Count}</span>{' '}
                            <span className="text-[10px] opacity-80">
                              ({row.failed2Percent}%)
                            </span>
                          </td>
                          <td
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedInterventionRowKey(row.rowKey);
                              setInterventionBucketFilter('3_PLUS_SUBJEK');
                            }}
                            className={`py-2.5 px-3 text-center font-mono border-r border-slate-200/80 ${
                              isGrandTotal
                                ? 'text-rose-400'
                                : 'hover:bg-rose-200/70 text-rose-900'
                            }`}
                          >
                            <span className="font-black">{row.failed3PlusCount}</span>{' '}
                            <span className="text-[10px] opacity-80">
                              ({row.failed3PlusPercent}%)
                            </span>
                          </td>
                          <td
                            className={`py-2.5 px-3 text-center font-mono font-black ${
                              isGrandTotal ? 'text-amber-300' : 'text-indigo-900 bg-slate-50/70'
                            }`}
                          >
                            {row.gps}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* SENARAI MURID INTERVENSI (DRILLDOWN PANEL FOR DIALOG PRESTASI) */}
              {activeInterventionRow && (
                <div className="bg-rose-50/50 border-2 border-rose-200 rounded-2xl p-5 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-rose-200 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-black uppercase">
                          SENARAI MURID INTERVENSI DIALOG PRESTASI
                        </span>
                        <span className="text-xs font-black text-rose-950 uppercase">
                          {activeInterventionRow.label}
                        </span>
                      </div>
                      <p className="text-xs text-rose-800 mt-1">
                        Senarai murid yang belum mencapai tahap penguasaan minimum dalam semua mata pelajaran (
                        {mainMode === 'PBD' ? 'mempunyai subjek TP1 / TP2' : 'mempunyai subjek Gred F'}
                        ), termasuk subjek Alam Manusia (AM).
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 print:hidden">
                      {(
                        [
                          { id: 'ALL_INTERVENSI', label: `Semua Intervensi (${activeInterventionRow.interventionStudents.length})` },
                          { id: '1_SUBJEK', label: `1 Subjek (${activeInterventionRow.failed1Count})` },
                          { id: '2_SUBJEK', label: `2 Subjek (${activeInterventionRow.failed2Count})` },
                          { id: '3_PLUS_SUBJEK', label: `≥3 Subjek (${activeInterventionRow.failed3PlusCount})` },
                        ] as const
                      ).map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setInterventionBucketFilter(b.id)}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-black transition cursor-pointer ${
                            interventionBucketFilter === b.id
                              ? 'bg-rose-700 text-white shadow-sm'
                              : 'bg-white text-rose-800 border border-rose-200 hover:bg-rose-100'
                          }`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredInterventionStudents.length === 0 ? (
                    <div className="bg-white border border-emerald-200 rounded-xl p-4 text-xs font-bold text-emerald-800 flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <span>
                        Tiada murid dalam kategori intervensi ini bagi{' '}
                        <strong>{activeInterventionRow.label}</strong>. Semua murid berkaitan telah menguasai tahap minimum!
                      </span>
                    </div>
                  ) : (
                    <div className="overflow-x-auto bg-white border border-rose-200 rounded-xl">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-rose-100/80 text-rose-950 font-black uppercase text-[10px] border-b border-rose-200">
                            <th className="py-2.5 px-3 text-center w-10">Bil</th>
                            <th className="py-2.5 px-4">Nama Murid</th>
                            <th className="py-2.5 px-3 text-center">Kelas</th>
                            <th className="py-2.5 px-3 text-center">
                              Bil. Subjek Dinilai
                            </th>
                            <th className="py-2.5 px-3 text-center">
                              Bil. Subjek Belum Menguasai
                            </th>
                            <th className="py-2.5 px-4">
                              Perincian Subjek Belum Menguasai (Termasuk AM / SN) &amp; Tahap / Markah
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-rose-100">
                          {filteredInterventionStudents.map((st, idx) => (
                            <tr
                              key={st.studentId}
                              onClick={() => onSelectStudent?.(st.studentId)}
                              className="hover:bg-rose-50/40"
                            >
                              <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-500">
                                {idx + 1}
                              </td>
                              <td className="py-2.5 px-4 font-black text-slate-900 uppercase">
                                {st.name}
                              </td>
                              <td className="py-2.5 px-3 text-center font-bold text-slate-700">
                                {st.classDisplay}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-600">
                                {st.totalSubjectsEvaluated}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 font-black text-[11px]">
                                  {st.failedSubjectsCount} Subjek
                                </span>
                              </td>
                              <td className="py-2.5 px-4">
                                <div className="flex flex-wrap gap-1.5">
                                  {st.failedSubjectDetails.map((f, fIdx) => (
                                    <span
                                      key={fIdx}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-300 text-rose-900 text-[11px] font-black"
                                    >
                                      <span>
                                        {f.subjectName} ({f.shortCode}):
                                      </span>
                                      {mainMode === 'PBD' ? (
                                        <span className="px-1.5 py-0.2 rounded bg-rose-600 text-white text-[10px]">
                                          TP{f.tp}
                                        </span>
                                      ) : (
                                        <span className="px-1.5 py-0.2 rounded bg-rose-600 text-white text-[10px]">
                                          {f.mark !== null && f.mark !== undefined
                                            ? `${f.mark}% [${f.grade}]`
                                            : `Gred ${f.grade}`}
                                        </span>
                                      )}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Official Footer Sign-off for Dialog Prestasi Report (A4 Print & Verification) */}
          {(coreSubTab === 'PANITIA' || coreSubTab === 'IKUT_MURID') && (
            <div className="mt-8 pt-6 border-t-2 border-slate-300 grid grid-cols-1 sm:grid-cols-2 gap-8 text-xs text-slate-800">
              <div>
                <div className="font-bold">Disediakan oleh:</div>
                <div className="h-12" />
                <div className="border-b border-slate-900 w-60" />
                <div className="font-black uppercase mt-1">
                  ({accessProfile.teacherName || currentUser?.name || 'PENYELARAS PBD & UASA'})
                </div>
                <div className="text-[11px] text-slate-600">
                  Setiausaha Peperiksaan / Penyelaras Dialog Prestasi, {activeSchoolName}
                </div>
              </div>

              <div className="sm:text-right flex flex-col sm:items-end">
                <div className="font-bold">Disahkan oleh:</div>
                <div className="h-12" />
                <div className="border-b border-slate-900 w-60" />
                <div className="font-black uppercase mt-1">({principalName})</div>
                <div className="text-[11px] text-slate-600">
                  Guru Besar, {activeSchoolName} ({activeSchoolCode})
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ====================================================================
          SUB-TAB 3: REKOD & KAD ANALISIS MURID TERPERINCI (RBAC SCOPED)
         ==================================================================== */}
      {coreSubTab === 'TERPERINCI' && (
        <div className="space-y-6 print:hidden">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap bg-slate-100 p-1 rounded-2xl border border-slate-200 gap-1">
                <button
                  type="button"
                  onClick={() => setRoleScopeTab('MY_SUBJECTS')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
                    roleScopeTab === 'MY_SUBJECTS'
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <BookOpen size={14} />
                  <span>Analisis Subjek Saya</span>
                </button>

                {canViewMyClass && (
                  <button
                    type="button"
                    onClick={() => setRoleScopeTab('MY_CLASS')}
                    className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
                      roleScopeTab === 'MY_CLASS'
                        ? 'bg-emerald-600 text-white shadow'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <GraduationCap size={14} />
                    <span>Analisis Kelas Saya</span>
                  </button>
                )}

                {canViewMyPanitia && (
                  <button
                    type="button"
                    onClick={() => setRoleScopeTab('MY_PANITIA')}
                    className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
                      roleScopeTab === 'MY_PANITIA'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Layers size={14} />
                    <span>Analisis Panitia Saya</span>
                  </button>
                )}
              </div>

              <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase transition-all cursor-pointer ${
                    activeTab === 'overview'
                      ? 'bg-white shadow text-slate-900'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Carta Taburan
                </button>
                <button
                  onClick={() => setActiveTab('students')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase transition-all cursor-pointer ${
                    activeTab === 'students'
                      ? 'bg-white shadow text-slate-900'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Kad Analisis Murid ({records.length})
                </button>
                <button
                  onClick={() => setActiveTab('pbd')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase transition-all cursor-pointer ${
                    activeTab === 'pbd'
                      ? 'bg-white shadow text-slate-900'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Matriks PBD
                </button>
                <button
                  onClick={() => setActiveTab('uasa')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase transition-all cursor-pointer ${
                    activeTab === 'uasa'
                      ? 'bg-white shadow text-slate-900'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Senarai UASA
                </button>
              </div>
            </div>

            {/* Scope Filter Controls */}
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
              {roleScopeTab === 'MY_SUBJECTS' && (
                <>
                  {allowedSubjectAssignments.length === 0 ? (
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3.5 py-2 rounded-xl">
                      <Lock size={14} />
                      <span>Tiada agihan mengajar direkodkan untuk sesi ini</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase text-slate-500">Tahun:</span>
                        <select
                          value={selectedSubjYear}
                          onChange={(e) => setSelectedSubjYear(Number(e.target.value))}
                          className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-black text-slate-900"
                        >
                          {availableSubjYears.map((yr) => (
                            <option key={yr} value={yr}>
                              Tahun {yr}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase text-slate-500">
                          Mata Pelajaran Diajar:
                        </span>
                        <select
                          value={selectedSubjName}
                          onChange={(e) => setSelectedSubjName(e.target.value)}
                          className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-black text-blue-700"
                        >
                          {availableSubjNamesForYear.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </>
              )}

              {roleScopeTab === 'MY_CLASS' && canViewMyClass && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase text-emerald-700">
                      Kelas Saya:
                    </span>
                    <select
                      value={selectedMyClassYear}
                      onChange={(e) => setSelectedMyClassYear(Number(e.target.value))}
                      className="px-3 py-1.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-black text-emerald-900"
                    >
                      {allowedClassTeacherYears.map((yr) => (
                        <option key={yr} value={yr}>
                          Tahun {yr}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase text-slate-500">
                      Tapis Subjek:
                    </span>
                    <select
                      value={selectedMyClassSubjectFilter}
                      onChange={(e) => setSelectedMyClassSubjectFilter(e.target.value)}
                      className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-black text-slate-900"
                    >
                      <option value="ALL">Semua Mata Pelajaran (Tahun {selectedMyClassYear})</option>
                      {(SUBJECTS_BY_YEAR[selectedMyClassYear] || []).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {roleScopeTab === 'MY_PANITIA' && canViewMyPanitia && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase text-indigo-700">
                      Subjek Panitia:
                    </span>
                    <select
                      value={selectedPanitiaSubject}
                      onChange={(e) => setSelectedPanitiaSubject(e.target.value)}
                      className="px-3 py-1.5 bg-indigo-50 border border-indigo-300 rounded-xl text-xs font-black text-indigo-900"
                    >
                      {allowedPanitiaSubjects.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase text-slate-500">
                      Tapis Tahun:
                    </span>
                    <select
                      value={selectedPanitiaYearFilter}
                      onChange={(e) =>
                        setSelectedPanitiaYearFilter(
                          e.target.value === 'ALL' ? 'ALL' : Number(e.target.value)
                        )
                      }
                      className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-black text-slate-900"
                    >
                      <option value="ALL">Semua Kelas (Tahun 1 – Tahun 6)</option>
                      {[1, 2, 3, 4, 5, 6].map((yr) => (
                        <option key={yr} value={yr}>
                          Tahun {yr}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* VIEW: OVERVIEW CHARTS */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* PBD Distribution Panel */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-black uppercase text-slate-900 tracking-tight">
                      Taburan PBD (Tahap Penguasaan 1–6)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Merujuk piawaian visual rasmi KPM: TP1–2 Merah, TP3 Jingga, TP4–6 Hijau
                    </p>
                  </div>
                  <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-[10px] font-mono font-bold text-slate-600">
                    {metrics.total} Rekod
                  </span>
                </div>

                <div className="space-y-2">
                  {([1, 2, 3, 4, 5, 6] as PbdLevel[]).map((lvl) => {
                    const count = metrics.pbdCounts[`TP${lvl}`];
                    const percent = Math.round((count / (metrics.total || 1)) * 100);
                    const colorToken = getPbdSemanticColor(lvl);
                    const style = ACADEMIC_COLOR_TOKENS[colorToken];

                    return (
                      <div key={lvl} className="flex items-center gap-3">
                        <div className="w-14">
                          <PbdBadge tp={lvl} size="sm" />
                        </div>
                        <div className="flex-1 bg-slate-100 h-4 rounded-full overflow-hidden p-0.5 border border-slate-200">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${style.tailwind.bg}`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <div className="w-16 text-right">
                          <span className="text-xs font-black text-slate-800">{count}</span>
                          <span className="text-[10px] font-mono text-slate-400 ml-1">
                            ({percent}%)
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="h-48 w-full pt-4 border-t border-slate-100">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pbdChartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {pbdChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* UASA Distribution Panel */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-black uppercase text-slate-900 tracking-tight">
                      Taburan Gred UASA (A–F)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Skala KPM: A (82–100), B (66–81), C (50–65), D (35–49), E (20–34), F (0–19)
                    </p>
                  </div>
                  <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-[10px] font-mono font-bold text-slate-600">
                    {metrics.total} Rekod
                  </span>
                </div>

                <div className="space-y-2">
                  {(['A', 'B', 'C', 'D', 'E', 'F'] as UasaGrade[]).map((g) => {
                    const count = metrics.uasaCounts[g];
                    const percent = Math.round((count / (metrics.total || 1)) * 100);
                    const colorToken = getUasaSemanticColor(g);
                    const style = ACADEMIC_COLOR_TOKENS[colorToken];

                    return (
                      <div key={g} className="flex items-center gap-3">
                        <div className="w-14">
                          <UasaBadge grade={g} size="sm" showMark={false} />
                        </div>
                        <div className="flex-1 bg-slate-100 h-4 rounded-full overflow-hidden p-0.5 border border-slate-200">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${style.tailwind.bg}`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <div className="w-16 text-right">
                          <span className="text-xs font-black text-slate-800">{count}</span>
                          <span className="text-[10px] font-mono text-slate-400 ml-1">
                            ({percent}%)
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="h-48 w-full pt-4 border-t border-slate-100">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={uasaChartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {uasaChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: STUDENT CARDS */}
          {activeTab === 'students' && (
            <div className="space-y-6">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black uppercase text-slate-400 mr-2 flex items-center gap-1">
                    <Filter size={14} /> Tapis:
                  </span>
                  <button
                    onClick={() => setStudentFilter('ALL')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      studentFilter === 'ALL'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Semua ({records.length})
                  </button>
                  <button
                    onClick={() => setStudentFilter('CRITICAL')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      studentFilter === 'CRITICAL'
                        ? 'bg-rose-600 text-white'
                        : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                    }`}
                  >
                    Kritikal ({metrics.priorityCounts.CRITICAL})
                  </button>
                  <button
                    onClick={() => setStudentFilter('NEAR_MISS')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      studentFilter === 'NEAR_MISS'
                        ? 'bg-yellow-500 text-white'
                        : 'bg-yellow-50 text-yellow-800 hover:bg-yellow-100'
                    }`}
                  >
                    Near Miss ({metrics.nearMissCount})
                  </button>
                  <button
                    onClick={() => setStudentFilter('MISMATCH')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      studentFilter === 'MISMATCH'
                        ? 'bg-rose-600 text-white'
                        : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
                    }`}
                  >
                    Mismatch ({metrics.mismatchCount})
                  </button>
                  <button
                    onClick={() => setStudentFilter('EXCELLENT')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      studentFilter === 'EXCELLENT'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    }`}
                  >
                    Cemerlang ({metrics.priorityCounts.EXCELLENT})
                  </button>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nama murid..."
                    className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 w-64"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredStudents.map((student) => {
                  const latestTp = extractPbdTpForSession(student);
                  const targetTp = student.pbd.etr || 4;
                  const tovTp = student.pbd.tov;

                  const nearMiss = getNearMissStatus(latestTp, targetTp);
                  const mismatch = getMismatchStatus(latestTp, targetTp);
                  const priority = getInterventionPriority(
                    latestTp || student.uasa.currentMark,
                    targetTp || student.uasa.targetGrade,
                    tovTp || student.uasa.previousMark
                  );

                  return (
                    <div
                      key={student.studentId}
                      onClick={() => onSelectStudent?.(student.studentId)}
                      className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-all space-y-4"
                    >
                      <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                        <div>
                          <h4 className="font-black text-sm text-slate-900 uppercase">
                            {student.name}
                          </h4>
                          <span className="text-[10px] text-slate-400 font-bold uppercase">
                            {student.className} • {student.subjectName}
                          </span>
                        </div>
                        <InterventionPriorityBadge priority={priority.priority} size="sm" />
                      </div>

                      <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-black uppercase text-slate-500 text-[10px]">
                            PBD Prestasi
                          </span>
                          <ProgressIndicator previous={tovTp} current={latestTp} showLabel />
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-slate-400">TOV:</span>
                            <PbdBadge tp={tovTp} size="sm" />
                          </div>
                          <ChevronRight size={12} className="text-slate-300" />
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-slate-400">Terkini:</span>
                            <PbdBadge tp={latestTp} size="sm" />
                          </div>
                          <ChevronRight size={12} className="text-slate-300" />
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-slate-400">Sasaran:</span>
                            <PbdBadge tp={targetTp} size="sm" />
                          </div>
                        </div>
                      </div>

                      {student.uasa.currentMark !== undefined &&
                        student.uasa.currentMark !== null && (
                          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-black uppercase text-slate-500 text-[10px]">
                                UASA Peperiksaan
                              </span>
                              <ProgressIndicator
                                previous={student.uasa.previousMark}
                                current={student.uasa.currentMark}
                                showLabel
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] font-bold text-slate-400">Lalu:</span>
                                <span className="text-xs font-mono font-bold text-slate-700">
                                  {student.uasa.previousMark || '-'}
                                </span>
                              </div>
                              <ChevronRight size={12} className="text-slate-300" />
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-slate-400">Semasa:</span>
                                <UasaBadge
                                  mark={student.uasa.currentMark}
                                  grade={student.uasa.currentGrade}
                                  size="sm"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                      <div className="flex flex-wrap gap-2 pt-1">
                        {nearMiss.isNearMiss && (
                          <NearMissBadge current={latestTp} target={targetTp} />
                        )}
                        {mismatch.isMismatch && (
                          <MismatchBadge actual={latestTp} target={targetTp} />
                        )}
                      </div>

                      <div className="text-[11px] text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <span className="font-bold text-slate-800 block text-[10px] uppercase mb-0.5">
                          Cadangan Tindakan:
                        </span>
                        <p className="leading-snug text-slate-500">{priority.actionSummaryMs}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW: PBD DETAILS */}
          {activeTab === 'pbd' && (
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-black uppercase text-slate-900 tracking-tight">
                  Taburan &amp; Rekod Terperinci Pentaksiran Bilik Darjah (PBD)
                </h3>
                <p className="text-xs text-slate-400">
                  Lajur Progression Matrix: TOV &rarr; OTI1 &rarr; AR1 &rarr; OTI2 &rarr; AR2 &rarr; ETR
                </p>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-[500px] overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-slate-100 z-10 border-b border-slate-200">
                    <tr className="text-slate-500 text-[10px] font-black uppercase tracking-wider">
                      <th className="px-4 py-3">Bil</th>
                      <th className="px-6 py-3">Nama Murid</th>
                      <th className="px-4 py-3">Kelas &amp; Subjek</th>
                      <th className="px-4 py-3 text-center">TOV</th>
                      <th className="px-4 py-3 text-center">OTI1</th>
                      <th className="px-4 py-3 text-center">AR1</th>
                      <th className="px-4 py-3 text-center">OTI2</th>
                      <th className="px-4 py-3 text-center">AR2</th>
                      <th className="px-4 py-3 text-center">ETR</th>
                      <th className="px-4 py-3 text-center">Kemajuan</th>
                      <th className="px-6 py-3">Status / Intervensi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {records.map((r, idx) => {
                      const latestTp = extractPbdTpForSession(r);
                      const targetTp = r.pbd.etr || 4;
                      const priority = getInterventionPriority(latestTp, targetTp, r.pbd.tov);

                      return (
                        <tr key={r.studentId} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-mono text-slate-400 text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="px-6 py-3 font-bold text-slate-900 uppercase">{r.name}</td>
                          <td className="px-4 py-3 text-[11px] font-semibold text-slate-600">
                            {r.className} • {r.subjectName}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <PbdBadge tp={r.pbd.tov} size="sm" />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <PbdBadge tp={r.pbd.oti1} size="sm" />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <PbdBadge tp={r.pbd.ar1} size="sm" />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <PbdBadge tp={r.pbd.oti2} size="sm" />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <PbdBadge tp={r.pbd.ar2} size="sm" />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <PbdBadge tp={r.pbd.etr} size="sm" />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <ProgressIndicator previous={r.pbd.tov} current={latestTp} />
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-2">
                              <InterventionPriorityBadge priority={priority.priority} size="sm" />
                              <NearMissBadge current={latestTp} target={targetTp} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* VIEW: UASA DETAILS */}
          {activeTab === 'uasa' && (
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-black uppercase text-slate-900 tracking-tight">
                  Keputusan &amp; Analisis Gred Ujian Akhir Sesi Akademik (UASA)
                </h3>
                <p className="text-xs text-slate-400">
                  Gred dikira automatik daripada markah mengikut skala rasmi KPM
                </p>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-[500px] overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-slate-100 z-10 border-b border-slate-200">
                    <tr className="text-slate-500 text-[10px] font-black uppercase tracking-wider">
                      <th className="px-4 py-3">Bil</th>
                      <th className="px-6 py-3">Nama Murid</th>
                      <th className="px-4 py-3">Kelas &amp; Subjek</th>
                      <th className="px-6 py-3 text-center">Markah Lalu</th>
                      <th className="px-6 py-3 text-center">Markah Semasa [Gred]</th>
                      <th className="px-6 py-3">Tafsiran KPM</th>
                      <th className="px-4 py-3 text-center">Perubahan</th>
                      <th className="px-6 py-3">Status Intervensi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {records.map((r, idx) => {
                      const uEval = extractUasaForSession(r);
                      const currentMark = uEval.numericMark;
                      const grade = uEval.grade || getUasaGrade(currentMark);
                      const interpretation = getUasaGradeInterpretation(grade);
                      const nearMiss = getNearMissStatus(currentMark, undefined, {
                        targetGrade: r.uasa.targetGrade as any,
                      });

                      return (
                        <tr key={r.studentId} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-mono text-slate-400 text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="px-6 py-3 font-bold text-slate-900 uppercase">{r.name}</td>
                          <td className="px-4 py-3 text-[11px] font-semibold text-slate-600">
                            {r.className} • {r.subjectName}
                          </td>
                          <td className="px-6 py-3 text-center font-mono font-bold text-slate-600">
                            {r.uasa.previousMark !== undefined && r.uasa.previousMark !== null
                              ? r.uasa.previousMark
                              : '-'}
                          </td>
                          <td className="px-6 py-3 text-center">
                            {uEval.isTH ? (
                              <span className="px-2.5 py-1 rounded-lg bg-slate-200 text-slate-700 font-black text-xs">
                                TH
                              </span>
                            ) : (
                              <UasaBadge mark={currentMark} grade={grade} size="sm" />
                            )}
                          </td>
                          <td className="px-6 py-3 font-bold text-slate-700 uppercase text-[11px]">
                            {uEval.isTH ? 'TIDAK HADIR' : interpretation}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <ProgressIndicator
                              previous={r.uasa.previousMark}
                              current={currentMark}
                            />
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-2">
                              {nearMiss.isNearMiss ? (
                                <NearMissBadge current={currentMark} target={r.uasa.targetGrade} />
                              ) : (
                                <span className="text-[11px] font-medium text-slate-500">
                                  {currentMark !== null &&
                                  currentMark !== undefined &&
                                  currentMark >= 20
                                    ? 'Lulus Minimum'
                                    : 'Intervensi Gred F'}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
}
