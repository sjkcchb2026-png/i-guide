/**
 * iSEPADU AI — Academic Analysis Dashboard & Role-Based Access Control (RBAC)
 * Implements role-scoped analysis tabs:
 *   1. Analisis Subjek Saya (All teachers: scoped to teachingAssignments)
 *   2. Analisis Kelas Saya (Semua Mata Pelajaran) (Guru Kelas / Academic Admin)
 *   3. Analisis Panitia (Semua Kelas Tahun 1–6) (Ketua Panitia / Academic Admin)
 */

import React, { useState, useMemo, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useSchoolTenant } from '../../contexts/SchoolTenantContext';
import { belongsToSchool } from '../../utils/schoolTenant';
import { ACADEMIC_YEARS, DEFAULT_ACADEMIC_YEAR, SUBJECTS_BY_YEAR } from '../../constants';
import {
  useAcademicAccessControl,
  normalizePbdNameToSubjectCode,
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
  Sparkles,
  BarChart3,
  Layers,
  BookOpen,
  GraduationCap,
  ShieldCheck,
  Lock,
  Calendar,
} from 'lucide-react';

export interface StudentAcademicRecord {
  studentId: string;
  name: string;
  yearLevel?: number;
  className: string;
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
  };
}

interface AcademicAnalysisDashboardProps {
  records?: StudentAcademicRecord[];
  className?: string;
  subjectName?: string;
  yearGroup?: number;
  currentUser?: any;
  schoolCode?: string;
  onSelectStudent?: (studentId: string) => void;
}

type RoleScopeTab = 'MY_SUBJECTS' | 'MY_CLASS' | 'MY_PANITIA';

export default function AcademicAnalysisDashboard({
  records: propRecords = [],
  className: initialClassName = 'Tahun 1',
  subjectName: initialSubjectName = 'Bahasa Melayu',
  yearGroup: initialYearGroup = 1,
  currentUser,
  schoolCode: propSchoolCode,
  onSelectStudent,
}: AcademicAnalysisDashboardProps) {
  const tenant = useSchoolTenant();
  const activeSchoolCode = propSchoolCode || tenant.schoolCode;

  const [academicYear, setAcademicYear] = useState<string>(DEFAULT_ACADEMIC_YEAR);
  const accessProfile = useAcademicAccessControl(currentUser, academicYear, activeSchoolCode);
  const isAcademicAdmin = accessProfile.isAcademicAdmin;
  const canViewMyClass = isAcademicAdmin || accessProfile.classTeacherOf.length > 0;
  const canViewMyPanitia = isAcademicAdmin || accessProfile.ketuaPanitiaSubjects.length > 0;

  const [roleScopeTab, setRoleScopeTab] = useState<RoleScopeTab>('MY_SUBJECTS');
  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'pbd' | 'uasa'>('overview');
  const [studentFilter, setStudentFilter] = useState<
    'ALL' | 'CRITICAL' | 'NEAR_MISS' | 'MISMATCH' | 'EXCELLENT'
  >('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Ensure roleScopeTab stays valid if user's role changes
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
      return Array.from(
        new Set(Object.values(SUBJECTS_BY_YEAR).flat())
      );
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

  // Load real Firestore students + PBD + UASA records for the selected academicYear
  const [firestoreRecords, setFirestoreRecords] = useState<StudentAcademicRecord[]>([]);
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
        const studentsMap = new Map<string, { id: string; name: string; year: number }>();
        if (studSnap) {
          studSnap.docs.forEach((d) => {
            const data = d.data();
            if (!belongsToSchool(data, activeSchoolCode)) return;
            const sid = String(data.student_id || d.id);
            studentsMap.set(sid, {
              id: sid,
              name: String(data.name || 'Murid'),
              year: Number(data.year || 1),
            });
          });
        }

        const recordMap = new Map<string, StudentAcademicRecord>();
        const ensureRecord = (sid: string, yearNum: number, subj: string): StudentAcademicRecord => {
          const key = `${sid}__${yearNum}__${subj}`;
          const existing = recordMap.get(key);
          if (existing) return existing;
          const st = studentsMap.get(sid);
          const created: StudentAcademicRecord = {
            studentId: `${sid}_${subj}`,
            name: st?.name || sid,
            yearLevel: yearNum,
            className: `Tahun ${yearNum}`,
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
            const subj = String(data.subject_id || '');
            const yr = Number(data.year || studentsMap.get(sid)?.year || 1);
            if (!sid || !subj) return;
            const rec = ensureRecord(sid, yr, subj);
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
            const subj = String(data.subject_id || '');
            const yr = Number(data.year || studentsMap.get(sid)?.year || 1);
            if (!sid || !subj) return;
            const rec = ensureRecord(sid, yr, subj);
            const numMark =
              data.marks !== undefined && data.marks !== null && !isNaN(Number(data.marks))
                ? Number(data.marks)
                : null;
            if (Number(data.term) === 1 && rec.uasa.currentMark !== undefined) {
              rec.uasa.previousMark = numMark;
              rec.uasa.previousGrade = data.grade || null;
            } else {
              rec.uasa.currentMark = numMark;
              rec.uasa.currentGrade = data.grade || null;
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
    return propRecords.length > 0 ? propRecords : firestoreRecords;
  }, [propRecords, firestoreRecords]);

  // Role-Scoped Filtered Records
  const records = useMemo(() => {
    if (roleScopeTab === 'MY_SUBJECTS') {
      if (!selectedSubjName) return [];
      return allSourceRecords.filter((r) => {
        const rYear = r.yearLevel || Number(String(r.className).replace(/\D/g, '')) || 1;
        return rYear === selectedSubjYear && r.subjectName === selectedSubjName;
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
      return allSourceRecords.filter((r) => {
        if (r.subjectName !== selectedPanitiaSubject) return false;
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

  // Multi-Subject Summary for "Analisis Kelas Saya (Semua Mata Pelajaran)"
  const myClassSubjectSummary = useMemo(() => {
    if (roleScopeTab !== 'MY_CLASS') return [];
    const subjectsInYear = SUBJECTS_BY_YEAR[selectedMyClassYear] || [];
    return subjectsInYear.map((subj) => {
      const subjRecs = allSourceRecords.filter((r) => {
        const rYear = r.yearLevel || Number(String(r.className).replace(/\D/g, '')) || 1;
        return rYear === selectedMyClassYear && r.subjectName === subj;
      });
      let tpSum = 0;
      let tpCount = 0;
      let passTpCount = 0;
      let markSum = 0;
      let markCount = 0;
      let criticalCount = 0;

      subjRecs.forEach((r) => {
        const latestTp = r.pbd.latestTp || r.pbd.ar2 || r.pbd.ar1;
        const numTp = Number(String(latestTp || '').replace(/^TP/i, ''));
        if (numTp >= 1 && numTp <= 6) {
          tpSum += numTp;
          tpCount++;
          if (numTp >= 4) passTpCount++;
        }
        if (typeof r.uasa.currentMark === 'number') {
          markSum += r.uasa.currentMark;
          markCount++;
        }
        const prio = getInterventionPriority(
          latestTp || r.uasa.currentMark,
          r.pbd.etr || 4,
          r.pbd.tov
        );
        if (prio.priority === 'CRITICAL') criticalCount++;
      });

      return {
        subjectName: subj,
        subjectCode: normalizePbdNameToSubjectCode(subj),
        totalRecorded: subjRecs.length,
        avgTp: tpCount > 0 ? (tpSum / tpCount).toFixed(2) : '-',
        passTpPercent: tpCount > 0 ? Math.round((passTpCount / tpCount) * 100) : 0,
        avgUasaMark: markCount > 0 ? Math.round(markSum / markCount) : null,
        criticalCount,
      };
    });
  }, [roleScopeTab, selectedMyClassYear, allSourceRecords]);

  // Cross-Class Summary for "Analisis Panitia (Semua Kelas Tahun 1–6)"
  const panitiaCrossClassSummary = useMemo(() => {
    if (roleScopeTab !== 'MY_PANITIA') return [];
    return [1, 2, 3, 4, 5, 6]
      .filter((yr) => (SUBJECTS_BY_YEAR[yr] || []).includes(selectedPanitiaSubject))
      .map((yr) => {
        const yrRecs = allSourceRecords.filter((r) => {
          const rYear = r.yearLevel || Number(String(r.className).replace(/\D/g, '')) || 1;
          return rYear === yr && r.subjectName === selectedPanitiaSubject;
        });
        let tpSum = 0;
        let tpCount = 0;
        let passTpCount = 0;
        let markSum = 0;
        let markCount = 0;
        let criticalCount = 0;

        yrRecs.forEach((r) => {
          const latestTp = r.pbd.latestTp || r.pbd.ar2 || r.pbd.ar1;
          const numTp = Number(String(latestTp || '').replace(/^TP/i, ''));
          if (numTp >= 1 && numTp <= 6) {
            tpSum += numTp;
            tpCount++;
            if (numTp >= 4) passTpCount++;
          }
          if (typeof r.uasa.currentMark === 'number') {
            markSum += r.uasa.currentMark;
            markCount++;
          }
          const prio = getInterventionPriority(
            latestTp || r.uasa.currentMark,
            r.pbd.etr || 4,
            r.pbd.tov
          );
          if (prio.priority === 'CRITICAL') criticalCount++;
        });

        return {
          yearLevel: yr,
          className: `Tahun ${yr}`,
          totalRecorded: yrRecs.length,
          avgTp: tpCount > 0 ? (tpSum / tpCount).toFixed(2) : '-',
          passTpPercent: tpCount > 0 ? Math.round((passTpCount / tpCount) * 100) : 0,
          avgUasaMark: markCount > 0 ? Math.round(markSum / markCount) : null,
          criticalCount,
        };
      });
  }, [roleScopeTab, selectedPanitiaSubject, allSourceRecords]);

  // 1. Compute Overall Performance Metrics for currently active scope
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
      const latestTp = r.pbd.latestTp || r.pbd.ar2 || r.pbd.ar1;
      const targetTp = r.pbd.etr || 4;
      const tovTp = r.pbd.tov;

      if (latestTp) {
        const num = Number(String(latestTp).replace(/^TP/i, ''));
        if (num >= 1 && num <= 6) {
          pbdCounts[`TP${num as PbdLevel}`]++;
          if (num >= 4) {
            meetingTargetCount++;
          } else {
            belowTargetCount++;
          }
        }
      }

      const currentUasa = r.uasa.currentMark;
      const grade = r.uasa.currentGrade || getUasaGrade(currentUasa);
      if (grade && grade in uasaCounts) {
        uasaCounts[grade as UasaGrade]++;
      }

      const pbdNearMiss = getNearMissStatus(latestTp, targetTp);
      const uasaNearMiss = getNearMissStatus(currentUasa, undefined, {
        targetGrade: r.uasa.targetGrade as any,
      });
      if (pbdNearMiss.isNearMiss || uasaNearMiss.isNearMiss) {
        nearMissCount++;
      }

      const pbdMismatch = getMismatchStatus(latestTp, targetTp);
      const uasaMismatch = getMismatchStatus(r.uasa.currentMark, r.uasa.targetGrade);
      if (pbdMismatch.isMismatch || uasaMismatch.isMismatch) {
        mismatchCount++;
      }

      const priority = getInterventionPriority(
        latestTp || currentUasa,
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
  }, [records]);

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

      const latestTp = r.pbd.latestTp || r.pbd.ar2 || r.pbd.ar1;
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
  }, [records, searchQuery, studentFilter]);

  const activeScopeLabel =
    roleScopeTab === 'MY_SUBJECTS'
      ? `Tahun ${selectedSubjYear} • ${selectedSubjName || 'Tiada Subjek'}`
      : roleScopeTab === 'MY_CLASS'
      ? `Kelas Saya: Tahun ${selectedMyClassYear} (${
          selectedMyClassSubjectFilter === 'ALL'
            ? 'Semua Mata Pelajaran'
            : selectedMyClassSubjectFilter
        })`
      : `Panitia: ${selectedPanitiaSubject} (${
          selectedPanitiaYearFilter === 'ALL'
            ? 'Semua Kelas Tahun 1–6'
            : `Tahun ${selectedPanitiaYearFilter}`
        })`;

  return (
    <div className="space-y-6">
      {/* RBAC Role-Scoped Navigation Banner */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-black uppercase flex items-center gap-1">
                <ShieldCheck size={12} />
                Mode: KAWALAN AKSES PERANAN (RBAC)
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
            <h2 className="text-2xl font-black text-slate-900 tracking-tight mt-1 flex items-center gap-2">
              <BarChart3 className="text-blue-600" size={24} />
              Papan Pemuka Analisis Akademik & Intervensi SSOT
            </h2>
            <p className="text-xs text-slate-500">
              Skop Aktif: <strong className="text-slate-800">{activeScopeLabel}</strong> •{' '}
              {loadingFirestore ? 'Memuatkan rekod...' : `${metrics.total} Rekod Penilaian`}
            </p>
          </div>

          {/* Sesi Akademik + Role-Scoped Analysis Mode Tabs */}
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
                  <span>Analisis Kelas Saya (Semua Mata Pelajaran)</span>
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
                  <span>Analisis Panitia (Semua Kelas)</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Scope Filter Controls for the Selected Role Tab */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {roleScopeTab === 'MY_SUBJECTS' && (
            <div className="flex flex-wrap items-center gap-3">
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
            </div>
          )}

          {roleScopeTab === 'MY_CLASS' && canViewMyClass && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase text-emerald-700">
                  Kelas Saya (Guru Kelas):
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
                <span className="text-xs font-black uppercase text-slate-500">Tapis Subjek:</span>
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
            </div>
          )}

          {roleScopeTab === 'MY_PANITIA' && canViewMyPanitia && (
            <div className="flex flex-wrap items-center gap-3">
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
                <span className="text-xs font-black uppercase text-slate-500">Tapis Kelas:</span>
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
            </div>
          )}

          {/* View Detail Sub-Tab Switcher */}
          <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 self-start md:self-auto">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase transition-all ${
                activeTab === 'overview'
                  ? 'bg-white shadow text-slate-900'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Ringkasan
            </button>
            <button
              onClick={() => setActiveTab('students')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase transition-all ${
                activeTab === 'students'
                  ? 'bg-white shadow text-slate-900'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Kad Analisis Murid ({records.length})
            </button>
            <button
              onClick={() => setActiveTab('pbd')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase transition-all ${
                activeTab === 'pbd'
                  ? 'bg-white shadow text-slate-900'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Jadual PBD
            </button>
            <button
              onClick={() => setActiveTab('uasa')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase transition-all ${
                activeTab === 'uasa'
                  ? 'bg-white shadow text-slate-900'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Jadual UASA
            </button>
          </div>
        </div>
      </div>

      {/* ROLE TAB 2 SPECIAL MATRIX: ANALISIS KELAS SAYA (SEMUA MATA PELAJARAN) */}
      {roleScopeTab === 'MY_CLASS' && canViewMyClass && (
        <div className="bg-white p-6 rounded-3xl border border-emerald-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-base font-black uppercase text-emerald-950 tracking-tight">
                Rumusan Prestasi Semua Mata Pelajaran — Tahun {selectedMyClassYear} (Akses Guru Kelas · Baca Sahaja)
              </h3>
              <p className="text-xs text-slate-500">
                Gambaran menyeluruh penguasaan PBD, markah purata UASA, dan bilangan murid kritikal bagi setiap subjek di kelas anda.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-emerald-50/80 text-emerald-950 font-black uppercase text-[10px] border-b border-emerald-200">
                  <th className="py-3 px-4">Mata Pelajaran</th>
                  <th className="py-3 px-4 text-center">Bil. Rekod</th>
                  <th className="py-3 px-4 text-center">Purata TP (PBD)</th>
                  <th className="py-3 px-4 text-center">% Menguasai (TP4–TP6)</th>
                  <th className="py-3 px-4 text-center">Purata Markah UASA</th>
                  <th className="py-3 px-4 text-center">Intervensi Kritikal</th>
                  <th className="py-3 px-4 text-right">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {myClassSubjectSummary.map((row) => (
                  <tr key={row.subjectName} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-black text-slate-900">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] mr-2">
                        {row.subjectCode}
                      </span>
                      {row.subjectName}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-600">
                      {row.totalRecorded}
                    </td>
                    <td className="py-3 px-4 text-center font-black text-blue-700">
                      {row.avgTp}
                    </td>
                    <td className="py-3 px-4 text-center font-black text-emerald-700">
                      {row.passTpPercent}%
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">
                      {row.avgUasaMark !== null ? `${row.avgUasaMark}%` : '-'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {row.criticalCount > 0 ? (
                        <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-black text-[10px]">
                          {row.criticalCount} Kritikal
                        </span>
                      ) : (
                        <span className="text-emerald-600 font-bold text-[11px]">Tiada</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedMyClassSubjectFilter(row.subjectName)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-[11px] cursor-pointer"
                      >
                        Fokus Subjek
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ROLE TAB 3 SPECIAL MATRIX: ANALISIS PANITIA (SEMUA KELAS TAHUN 1-6) */}
      {roleScopeTab === 'MY_PANITIA' && canViewMyPanitia && (
        <div className="bg-white p-6 rounded-3xl border border-indigo-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-base font-black uppercase text-indigo-950 tracking-tight">
                Perbandingan Merentas Tahun 1 – Tahun 6: Panitia {selectedPanitiaSubject}
              </h3>
              <p className="text-xs text-slate-500">
                Analisis Ketua Panitia merentasi semua aliran kelas Tahun 1 hingga Tahun 6 bagi subjek {selectedPanitiaSubject}.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-indigo-50/80 text-indigo-950 font-black uppercase text-[10px] border-b border-indigo-200">
                  <th className="py-3 px-4">Tahun / Kelas</th>
                  <th className="py-3 px-4 text-center">Bil. Rekod Murid</th>
                  <th className="py-3 px-4 text-center">Purata TP (PBD)</th>
                  <th className="py-3 px-4 text-center">% Menguasai (TP4–TP6)</th>
                  <th className="py-3 px-4 text-center">Purata Markah UASA</th>
                  <th className="py-3 px-4 text-center">Intervensi Kritikal</th>
                  <th className="py-3 px-4 text-right">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {panitiaCrossClassSummary.map((row) => (
                  <tr key={row.yearLevel} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-black text-slate-900">{row.className}</td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-600">
                      {row.totalRecorded}
                    </td>
                    <td className="py-3 px-4 text-center font-black text-blue-700">
                      {row.avgTp}
                    </td>
                    <td className="py-3 px-4 text-center font-black text-emerald-700">
                      {row.passTpPercent}%
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">
                      {row.avgUasaMark !== null ? `${row.avgUasaMark}%` : '-'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {row.criticalCount > 0 ? (
                        <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-black text-[10px]">
                          {row.criticalCount} Kritikal
                        </span>
                      ) : (
                        <span className="text-emerald-600 font-bold text-[11px]">Tiada</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedPanitiaYearFilter(row.yearLevel)}
                        className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold text-[11px] cursor-pointer"
                      >
                        Lihat Kelas
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 13: OVERALL CLASS PERFORMANCE STATS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-3xl">
          <span className="block text-[10px] font-black uppercase tracking-wider text-emerald-800">
            Mencapai Sasaran (TP4–TP6 / A–C)
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-black text-emerald-900">
              {metrics.meetingTargetPercent}%
            </span>
            <span className="text-xs font-bold text-emerald-700">
              ({metrics.meetingTargetCount} rekod)
            </span>
          </div>
          <span className="block text-[10px] text-emerald-600 mt-1 font-medium">
            Melepasi tahap minimum
          </span>
        </div>

        <div className="bg-rose-50 border border-rose-200 p-5 rounded-3xl">
          <span className="block text-[10px] font-black uppercase tracking-wider text-rose-800">
            Bawah Sasaran (TP1–TP3 / D–F)
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-black text-rose-600">{metrics.belowTargetPercent}%</span>
            <span className="text-xs font-bold text-rose-700">
              ({metrics.belowTargetCount} rekod)
            </span>
          </div>
          <span className="block text-[10px] text-rose-600 mt-1 font-medium">
            Memerlukan intervensi / pengukuhan
          </span>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 p-5 rounded-3xl">
          <span className="block text-[10px] font-black uppercase tracking-wider text-yellow-800 flex items-center gap-1.5">
            <Sparkles size={12} className="text-yellow-600" />
            Near Miss (Lonjakan)
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-black text-yellow-900">{metrics.nearMissCount}</span>
            <span className="text-xs font-bold text-yellow-700">rekod</span>
          </div>
          <span className="block text-[10px] text-yellow-700 mt-1 font-medium">
            1 tahap / 1–3 markah ke sasaran
          </span>
        </div>

        <div className="bg-rose-50/60 border border-rose-200 p-5 rounded-3xl">
          <span className="block text-[10px] font-black uppercase tracking-wider text-rose-800 flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-rose-600" />
            Mismatch (Jurang Ketara)
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-black text-rose-700">{metrics.mismatchCount}</span>
            <span className="text-xs font-bold text-rose-700">rekod</span>
          </div>
          <span className="block text-[10px] text-rose-700 mt-1 font-medium">
            ≥2 gred / tahap di bawah sasaran
          </span>
        </div>

        <div className="bg-slate-900 text-white p-5 rounded-3xl border border-slate-800">
          <span className="block text-[10px] font-black uppercase tracking-wider text-rose-400">
            Keutamaan: Kritikal
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-black text-rose-400">
              {metrics.priorityCounts.CRITICAL}
            </span>
            <span className="text-xs font-bold text-slate-400">kes</span>
          </div>
          <span className="block text-[10px] text-slate-400 mt-1">Tindakan segera wajib</span>
        </div>
      </div>

      {/* VIEW: OVERVIEW (DISTRIBUTION SUMMARY & VISUAL CHARTS) */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
                    Gred automatik: A–B Hijau, C Kuning, D Jingga, E–F Merah
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
        </div>
      )}

      {/* SECTION 14: STUDENT ANALYSIS PANEL & CARD DRILLDOWN */}
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
              const latestTp = student.pbd.latestTp || student.pbd.ar2 || student.pbd.ar1;
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
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black uppercase text-slate-900 tracking-tight">
                Taburan & Rekod Terperinci Pentaksiran Bilik Darjah (PBD)
              </h3>
              <p className="text-xs text-slate-400">
                Lajur Progression Matrix: TOV → OTI1 → AR1 → OTI2 → AR2 → ETR
              </p>
            </div>
          </div>

          <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-[500px] overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-100 z-10 border-b border-slate-200">
                <tr className="text-slate-500 text-[10px] font-black uppercase tracking-wider">
                  <th className="px-4 py-3">Bil</th>
                  <th className="px-6 py-3">Nama Murid</th>
                  <th className="px-4 py-3">Kelas & Subjek</th>
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
                  const latestTp = r.pbd.latestTp || r.pbd.ar2 || r.pbd.ar1;
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
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black uppercase text-slate-900 tracking-tight">
                Keputusan & Analisis Gred Ujian Akhir Sesi Akademik (UASA)
              </h3>
              <p className="text-xs text-slate-400">
                Gred dikira automatik daripada markah mengikut skala rasmi KPM
              </p>
            </div>
          </div>

          <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-[500px] overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-100 z-10 border-b border-slate-200">
                <tr className="text-slate-500 text-[10px] font-black uppercase tracking-wider">
                  <th className="px-4 py-3">Bil</th>
                  <th className="px-6 py-3">Nama Murid</th>
                  <th className="px-4 py-3">Kelas & Subjek</th>
                  <th className="px-6 py-3 text-center">Markah Lalu</th>
                  <th className="px-6 py-3 text-center">Markah Semasa [Gred]</th>
                  <th className="px-6 py-3">Tafsiran KPM</th>
                  <th className="px-4 py-3 text-center">Perubahan</th>
                  <th className="px-6 py-3">Status Intervensi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {records.map((r, idx) => {
                  const currentMark = r.uasa.currentMark;
                  const grade = r.uasa.currentGrade || getUasaGrade(currentMark);
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
                        <UasaBadge mark={currentMark} grade={grade} size="sm" />
                      </td>
                      <td className="px-6 py-3 font-bold text-slate-700 uppercase text-[11px]">
                        {interpretation}
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
                              currentMark >= 50
                                ? 'Memuaskan'
                                : 'Perlu Bimbingan'}
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
  );
}
