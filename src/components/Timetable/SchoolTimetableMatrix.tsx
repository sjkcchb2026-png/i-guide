import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { PersonnelProfile } from '../../types';
import { isTeacherForTimetable } from '../../utils/checkoutRules';
import { OFFICIAL_TEACHERS, generateTeacherShortCode } from '../../constants/officialRoster';
import {
  getDefaultClassTeachers,
  hasAnyTeacherAssigned,
  hydrateMatrixTeachers,
} from '../../constants/defaultCurriculumMatrix';
import { useSchoolTenant } from '../../contexts/SchoolTenantContext';
import {
  belongsToSchool,
  isLegacyDefaultSchool,
  normalizeActiveSchoolCode,
  scopedDocId,
} from '../../utils/schoolTenant';
import { 
  Users, 
  Save, 
  CheckCircle2, 
  ToggleLeft, 
  ToggleRight, 
  AlertTriangle,
  Layers,
  GraduationCap,
  RotateCcw
} from 'lucide-react';

export interface SubjectAllocationRow {
  id: string;
  category: 'COMMON' | 'KP2027_ONLY' | 'KSSR_LEGACY';
  subjectName: string;
  subjectCode: string;
  periods: Record<number, number>; // grade (1-6) -> periods (preset by curriculum, editable)
  teachers: Record<number, string>; // grade (1-6) -> teacher code (Guru Utama)
  secondaryTeachers?: Record<number, string>; // grade (1-6) -> co-teacher code (Guru Bersama / Co-Teacher)
}

interface SchoolTimetableMatrixProps {
  activeAcademicYear?: string;
  schoolCode?: string;
  onMatrixSaved?: (rows: SubjectAllocationRow[], classTeachers: Record<number, string>, year: string) => void;
}

export const SchoolTimetableMatrix: React.FC<SchoolTimetableMatrixProps> = ({
  activeAcademicYear = '2027',
  schoolCode: propSchoolCode,
  onMatrixSaved,
}) => {
  const tenant = useSchoolTenant();
  const activeSchoolCode = normalizeActiveSchoolCode(propSchoolCode || tenant.schoolCode);
  const isLegacySchool = isLegacyDefaultSchool(activeSchoolCode);

  const [selectedYear, setSelectedYear] = useState<string>(activeAcademicYear);
  const [displayMode, setDisplayMode] = useState<'NUMBER' | 'CODE'>('CODE');
  const [personnelList, setPersonnelList] = useState<PersonnelProfile[]>([]);
  const [, setLoading] = useState<boolean>(true);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Sync with prop if parent changes
  useEffect(() => {
    if (activeAcademicYear) {
      setSelectedYear(activeAcademicYear);
    }
  }, [activeAcademicYear]);

  // 级任老师 (T1 - T6) 默认采用正式级任名册 (hanya untuk sekolah legasi YCC3404)
  const [classTeachers, setClassTeachers] = useState<Record<number, string>>(() =>
    getDefaultClassTeachers(isLegacySchool)
  );

  // 判断某一年级在选定年份是否已采用 KP2027
  // 2027: T1 | 2028: T1-T2 | 2029: T1-T3 | 2030: T1-T4 | 2031: T1-T5 | 2032+: T1-T6
  const isGradeKP2027 = (yearStr: string, grade: number): boolean => {
    const yr = parseInt(yearStr, 10) || 2027;
    if (yr < 2027) return false;
    const maxKP2027Grade = yr - 2026; // 2027->1, 2028->2, 2029->3...
    return grade <= maxKP2027Grade;
  };

  // 生成严格符合 KP2027 / KSSR 逐年推进规则的预设科目表（节数与默认教师自动预填且不锁死）
  const buildPresetRows = (yearStr: string): SubjectAllocationRow[] => {
    const kp = (g: number) => isGradeKP2027(yearStr, g);
    const emptyTeachers = () => ({ 1: '', 2: '', 3: '', 4: '', 5: '', 6: '' });

    const baseRows: SubjectAllocationRow[] = [
      // ================= 1. 共同核心科目 (KP2027 & KSSR Semakan 共有) =================
      {
        id: 'pn',
        category: 'COMMON',
        subjectName: 'PERHIMPUNAN',
        subjectCode: 'PN',
        periods: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 },
        teachers: emptyTeachers(),
      },
      {
        id: 'bc',
        category: 'COMMON',
        subjectName: 'BAHASA CINA',
        subjectCode: 'BC',
        // KPM 5 Nov 2026 文告：KP2027 Tahap I (T1 & T2) 华文保留 12 节；KP2027 T3-T4 为 9 节，T5-T6 为 7 节（或按学校需要微调）
        periods: {
          1: 12,
          2: 12,
          3: kp(3) ? 9 : 12,
          4: kp(4) ? 9 : 10,
          5: kp(5) ? 7 : 10,
          6: kp(6) ? 7 : 10,
        },
        teachers: emptyTeachers(),
      },
      {
        id: 'bm',
        category: 'COMMON',
        subjectName: 'BAHASA MELAYU',
        subjectCode: 'BM',
        periods: {
          1: 10,
          2: 10,
          3: kp(3) ? 9 : 10,
          4: kp(4) ? 9 : 8,
          5: kp(5) ? 7 : 8,
          6: kp(6) ? 7 : 8,
        },
        teachers: emptyTeachers(),
      },
      {
        id: 'bi',
        category: 'COMMON',
        subjectName: 'BAHASA INGGERIS',
        subjectCode: 'BI',
        // KP2027: T1-T4 为 4 节，T5-T6 为 3 节；旧课表: T1-T3 为 5 节，T4-T6 为 6 节
        periods: {
          1: kp(1) ? 4 : 5,
          2: kp(2) ? 4 : 5,
          3: kp(3) ? 4 : 5,
          4: kp(4) ? 4 : 6,
          5: kp(5) ? 3 : 6,
          6: kp(6) ? 3 : 6,
        },
        teachers: emptyTeachers(),
      },
      {
        id: 'mt',
        category: 'COMMON',
        subjectName: 'MATEMATIK',
        subjectCode: 'MT',
        // KP2027: T1-T2 为 7 节，T3-T6 为 6 节；旧课表: T1-T6 皆为 6 节
        periods: {
          1: kp(1) ? 7 : 6,
          2: kp(2) ? 7 : 6,
          3: 6,
          4: 6,
          5: 6,
          6: 6,
        },
        teachers: emptyTeachers(),
      },
      {
        id: 'pm',
        category: 'COMMON',
        subjectName: 'PENDIDIKAN MORAL',
        subjectCode: 'PM',
        // KP2027: T1-T6 皆为 4 节；旧课表: T1-T3 为 4 节，T4-T6 为 5 节
        periods: {
          1: 4,
          2: 4,
          3: 4,
          4: kp(4) ? 4 : 5,
          5: kp(5) ? 4 : 5,
          6: kp(6) ? 4 : 5,
        },
        teachers: emptyTeachers(),
      },
      {
        id: 'pai',
        category: 'COMMON',
        subjectName: 'PENDIDIKAN ISLAM',
        subjectCode: 'PAI',
        // Waktu Serentak selaras dengan PM (T1-T3: 4节, T4-T6: 5节 / KP2027: 4节)
        periods: {
          1: 4,
          2: 4,
          3: 4,
          4: kp(4) ? 4 : 5,
          5: kp(5) ? 4 : 5,
          6: kp(6) ? 4 : 5,
        },
        teachers: emptyTeachers(),
      },
      {
        id: 'tasmik',
        category: 'COMMON',
        subjectName: 'PROGRAM TASMIK (SELEPAS SEKOLAH)',
        subjectCode: 'TASMIK',
        // Program Tasmik 2 waktu seminggu (Selepas sekolah - Rabu, Khamis, Jumaat)
        periods: {
          1: 2,
          2: 2,
          3: 2,
          4: 2,
          5: 2,
          6: 2,
        },
        teachers: emptyTeachers(),
      },
      {
        id: 'pj',
        category: 'COMMON',
        subjectName: 'PENDIDIKAN JASMANI',
        subjectCode: 'PJ',
        // KP2027: T1-T2 独立 PJ 3 节；T3-T6 为 PJPK 4 节；旧课表: PJ 2 节
        periods: {
          1: kp(1) ? 3 : 2,
          2: kp(2) ? 3 : 2,
          3: kp(3) ? 4 : 2,
          4: kp(4) ? 4 : 2,
          5: kp(5) ? 4 : 2,
          6: kp(6) ? 4 : 2,
        },
        teachers: emptyTeachers(),
      },

      // ================= 2. KP2027 专属新设科目 (未进入 KP2027 的年级自动为 0) =================
      {
        id: 'am',
        category: 'KP2027_ONLY',
        subjectName: 'ALAM DAN MANUSIA: PEMBELAJARAN BERSEPADU',
        subjectCode: 'AM',
        // KP2027 Tahap I (T1 & T2) 专属 3 节 (双师协同教学 Co-Teaching)
        periods: {
          1: kp(1) ? 3 : 0,
          2: kp(2) ? 3 : 0,
          3: 0, 4: 0, 5: 0, 6: 0,
        },
        teachers: emptyTeachers(),
        secondaryTeachers: emptyTeachers(),
      },
      {
        id: 'pkar_1',
        category: 'KP2027_ONLY',
        subjectName: 'PROGRAM PEMBENTUKAN KARAKTER (ISNIN)',
        subjectCode: 'PKAR_1',
        periods: { 1: kp(1) ? 0.5 : 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
        teachers: emptyTeachers(),
      },
      {
        id: 'pkar_2',
        category: 'KP2027_ONLY',
        subjectName: 'PROGRAM PEMBENTUKAN KARAKTER (SELASA)',
        subjectCode: 'PKAR_2',
        periods: { 1: kp(1) ? 0.5 : 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
        teachers: emptyTeachers(),
      },
      {
        id: 'pkar_3',
        category: 'KP2027_ONLY',
        subjectName: 'PROGRAM PEMBENTUKAN KARAKTER (RABU)',
        subjectCode: 'PKAR_3',
        periods: { 1: kp(1) ? 0.5 : 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
        teachers: emptyTeachers(),
      },
      {
        id: 'pkar_4',
        category: 'KP2027_ONLY',
        subjectName: 'PROGRAM PEMBENTUKAN KARAKTER (KHAMIS)',
        subjectCode: 'PKAR_4',
        periods: { 1: kp(1) ? 0.5 : 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
        teachers: emptyTeachers(),
      },
      {
        id: 'pkar_5',
        category: 'KP2027_ONLY',
        subjectName: 'PROGRAM PEMBENTUKAN KARAKTER (JUMAAT)',
        subjectCode: 'PKAR_5',
        periods: { 1: kp(1) ? 0.5 : 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
        teachers: emptyTeachers(),
      },
      {
        id: 'esd',
        category: 'KP2027_ONLY',
        subjectName: 'EKSPLORASI SENI DAN DUNIA (TAHAP II)',
        subjectCode: 'ESD',
        periods: {
          1: 0, 2: 0,
          3: kp(3) ? 3 : 0,
          4: kp(4) ? 3 : 0,
          5: 0, 6: 0,
        },
        teachers: emptyTeachers(),
      },
      {
        id: 'est',
        category: 'KP2027_ONLY',
        subjectName: 'EKSPLORASI SAINS DAN TEKNOLOGI (TAHAP II)',
        subjectCode: 'EST',
        periods: {
          1: 0, 2: 0,
          3: kp(3) ? 3 : 0,
          4: kp(4) ? 3 : 0,
          5: 0, 6: 0,
        },
        teachers: emptyTeachers(),
      },
      {
        id: 'td',
        category: 'KP2027_ONLY',
        subjectName: 'TEKNOLOGI DAN DIGITAL (TAHAP III)',
        subjectCode: 'TD',
        periods: {
          1: 0, 2: 0, 3: 0, 4: 0,
          5: kp(5) ? 2 : 0,
          6: kp(6) ? 2 : 0,
        },
        teachers: emptyTeachers(),
      },

      // ================= 3. KSSR SEMAKAN 旧课表科目 (已升入 KP2027 Tahap I 的年级严格清零) =================
      {
        id: 'sn',
        category: 'KSSR_LEGACY',
        subjectName: 'SAINS',
        subjectCode: 'SN',
        // T1-T4 进入 KP2027 后由 AM / EST 取代；T5-T6 在 KP2027 中保留 Sains 4 节
        periods: {
          1: kp(1) ? 0 : 3,
          2: kp(2) ? 0 : 3,
          3: kp(3) ? 0 : 3,
          4: kp(4) ? 0 : 4,
          5: 4,
          6: 4,
        },
        teachers: emptyTeachers(),
      },
      {
        id: 'pk',
        category: 'KSSR_LEGACY',
        subjectName: 'PENDIDIKAN KESIHATAN',
        subjectCode: 'PK',
        periods: {
          1: kp(1) ? 0 : 1,
          2: kp(2) ? 0 : 1,
          3: kp(3) ? 0 : 1,
          4: kp(4) ? 0 : 1,
          5: kp(5) ? 0 : 1,
          6: kp(6) ? 0 : 1,
        },
        teachers: emptyTeachers(),
      },
      {
        id: 'psv',
        category: 'KSSR_LEGACY',
        subjectName: 'PENDIDIKAN SENI VISUAL',
        subjectCode: 'PSV',
        // KP2027 Tahap III (T5 & T6) 恢复 PSV 2 节
        periods: {
          1: kp(1) ? 0 : 2,
          2: kp(2) ? 0 : 2,
          3: kp(3) ? 0 : 2,
          4: kp(4) ? 0 : 2,
          5: 2,
          6: 2,
        },
        teachers: emptyTeachers(),
      },
      {
        id: 'mz',
        category: 'KSSR_LEGACY',
        subjectName: 'PENDIDIKAN MUZIK',
        subjectCode: 'MZ',
        // KP2027 Tahap III (T5 & T6) 为 2 节；旧课表为 1 节
        periods: {
          1: kp(1) ? 0 : 1,
          2: kp(2) ? 0 : 1,
          3: kp(3) ? 0 : 1,
          4: kp(4) ? 0 : 1,
          5: kp(5) ? 2 : 1,
          6: kp(6) ? 2 : 1,
        },
        teachers: emptyTeachers(),
      },
      {
        id: 'rbt',
        category: 'KSSR_LEGACY',
        subjectName: 'REKA BENTUK & TEKNOLOGI',
        subjectCode: 'RBT',
        periods: {
          1: 0, 2: 0, 3: 0,
          4: kp(4) ? 0 : 2,
          5: kp(5) ? 0 : 2,
          6: kp(6) ? 0 : 2,
        },
        teachers: emptyTeachers(),
      },
      {
        id: 'sej',
        category: 'KSSR_LEGACY',
        subjectName: 'SEJARAH',
        subjectCode: 'SEJ',
        // KP2027 仅 Tahap III (T5 & T6) 有 Sejarah 2 节；旧课表 T4-T6 有 2 节
        periods: {
          1: 0, 2: 0, 3: 0,
          4: kp(4) ? 0 : 2,
          5: 2,
          6: 2,
        },
        teachers: emptyTeachers(),
      },
      {
        id: 'klibm',
        category: 'KSSR_LEGACY',
        subjectName: 'KLINIK BM',
        subjectCode: 'KLIBM',
        periods: {
          1: kp(1) ? 0 : 1,
          2: kp(2) ? 0 : 1,
          3: 0, 4: 0, 5: 0, 6: 0,
        },
        teachers: emptyTeachers(),
      },
      {
        id: 'klibi',
        category: 'KSSR_LEGACY',
        subjectName: 'KLINIK BI',
        subjectCode: 'KLIBI',
        periods: {
          1: kp(1) ? 0 : 1,
          2: kp(2) ? 0 : 1,
          3: kp(3) ? 0 : 1,
          4: 0, 5: 0, 6: 0,
        },
        teachers: emptyTeachers(),
      },
      {
        id: 'klibc',
        category: 'KSSR_LEGACY',
        subjectName: 'KLINIK BC',
        subjectCode: 'KLIBC',
        periods: {
          1: kp(1) ? 0 : 1,
          2: kp(2) ? 0 : 1,
          3: kp(3) ? 0 : 1,
          4: 0, 5: 0, 6: 0,
        },
        teachers: emptyTeachers(),
      },
      {
        id: 'klimt',
        category: 'KSSR_LEGACY',
        subjectName: 'KLINIK MT',
        subjectCode: 'KLIMT',
        periods: {
          1: 0, 2: 0,
          3: kp(3) ? 0 : 1,
          4: 0, 5: 0, 6: 0,
        },
        teachers: emptyTeachers(),
      },
    ];
    return hydrateMatrixTeachers(baseRows, yearStr, isLegacySchool);
  };

  const presetRows = useMemo(() => buildPresetRows(selectedYear), [selectedYear, isLegacySchool]);
  const [matrixData, setMatrixData] = useState<SubjectAllocationRow[]>(presetRows);

  // 纯动态从 Firestore 读取 Master Data 教师名册（绝不使用任何硬编码假名册）
  useEffect(() => {
    let isMounted = true;
    async function fetchMasterDataAndSavedMatrix() {
      try {
        setLoading(true);
        const pSnap = await getDocs(collection(db, 'personnel')).catch(() => null);
        const teachers: PersonnelProfile[] = [];
        if (pSnap && !pSnap.empty) {
          pSnap.forEach((d) => {
            const data = d.data();
            if (belongsToSchool(data, activeSchoolCode) && isTeacherForTimetable(data)) {
              teachers.push({ id: d.id, ...data } as PersonnelProfile);
            }
          });
        }

        // 融合官方名册（仅限 legasi YCC3404）
        if (isLegacySchool) {
          OFFICIAL_TEACHERS.forEach((ot) => {
            const exists = teachers.some(
              (p) =>
                (p.email && p.email.toLowerCase().trim() === ot.email.toLowerCase().trim()) ||
                (p.name && (p.name.toUpperCase().includes(ot.name.toUpperCase()) || ot.name.toUpperCase().includes(p.name.toUpperCase())))
            );
            if (!exists) {
              teachers.push(ot as any);
            }
          });
        }

        if (isMounted) setPersonnelList(teachers);

        const matrixDocRef = doc(db, 'school_timetables', scopedDocId(activeSchoolCode, `matrix_${selectedYear}`));
        const matrixDocSnap = await getDoc(matrixDocRef);
        if (matrixDocSnap.exists()) {
          const data = matrixDocSnap.data();
          if (data.matrixData && Array.isArray(data.matrixData) && isMounted) {
            let rows: SubjectAllocationRow[] = data.matrixData;
            const hasLegacyPkar = rows.some((r) => r.subjectCode.toUpperCase() === 'PKAR');
            const hasSplitPkar = rows.some((r) => r.subjectCode.toUpperCase().startsWith('PKAR_'));
            if (hasLegacyPkar && !hasSplitPkar) {
              const legacyRow = rows.find((r) => r.subjectCode.toUpperCase() === 'PKAR');
              const preset = buildPresetRows(selectedYear);
              const pkarPresetRows = preset.filter((r) => r.subjectCode.toUpperCase().startsWith('PKAR_'));
              if (legacyRow?.teachers) {
                pkarPresetRows.forEach((pr) => {
                  pr.teachers = { ...legacyRow.teachers };
                });
              }
              const idx = rows.findIndex((r) => r.subjectCode.toUpperCase() === 'PKAR');
              rows = [
                ...rows.slice(0, idx),
                ...pkarPresetRows,
                ...rows.slice(idx + 1),
              ];
            }
            if (!hasAnyTeacherAssigned(rows) && isLegacySchool) {
              rows = hydrateMatrixTeachers(rows, selectedYear, true);
            }
            setMatrixData(rows);
          } else if (isMounted) {
            setMatrixData(buildPresetRows(selectedYear));
          }
          if (data.classTeachers && Object.values(data.classTeachers).filter(Boolean).length > 0 && isMounted) {
            setClassTeachers(data.classTeachers);
          } else if (isMounted) {
            setClassTeachers(getDefaultClassTeachers(isLegacySchool));
          }
        } else if (isMounted) {
          setMatrixData(buildPresetRows(selectedYear));
          setClassTeachers(getDefaultClassTeachers(isLegacySchool));
        }
      } catch (err) {
        console.warn('Could not load Master Data matrix:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    const unsub = onAuthStateChanged(auth, (user) => {
      if (user && isMounted) {
        fetchMasterDataAndSavedMatrix();
      } else if (!user && isMounted) {
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, [selectedYear, activeSchoolCode, isLegacySchool]);

  // 动态生成教师 编号 (1..50) 与 缩写代号 (Kod Singkatan)
  const dynamicTeacherMapping = useMemo(() => {
    const sourceList: PersonnelProfile[] = [...personnelList];

    // 确保包含全部 14 位官方教师（仅限 YCC3404）
    if (isLegacySchool) {
      OFFICIAL_TEACHERS.forEach((ot) => {
        const exists = sourceList.some(
          (p) =>
            (p.email && p.email.toLowerCase().trim() === ot.email.toLowerCase().trim()) ||
            (p.name && (p.name.toUpperCase().includes(ot.name.toUpperCase()) || ot.name.toUpperCase().includes(p.name.toUpperCase())))
        );
        if (!exists) {
          sourceList.push({
            id: ot.id,
            name: ot.name,
            email: ot.email,
            category: ot.category,
            role: ot.role,
            position: ot.position,
          } as any);
        }
      });
    }

    const list = sourceList.slice(0, 50).map((t, idx) => {
      const num = idx + 1;
      let cleanName = (t.name || '').replace(/\s+/g, ' ').trim();
      if (isLegacySchool) {
        if (cleanName.toUpperCase().includes('FAHIM') && cleanName.toUpperCase().includes('AMAR')) {
          cleanName = 'MUHAMMAD FAHIM AMAR';
        } else if (cleanName.toUpperCase().includes('STEPHANIE') && cleanName.toUpperCase().includes('WONG')) {
          cleanName = 'STEPHANIE WONG ENG HEE';
        }
      }

      // 生成代号：4个词的名字只取前2个字母缩写（例如 Stephanie Wong Eng Hee -> SW）
      const code = (t as any).code || generateTeacherShortCode(cleanName);

      return {
        id: t.id,
        num,
        code,
        name: cleanName,
      };
    });

    return { list };
  }, [personnelList, isLegacySchool]);

  // 修改各科节数（完全不锁死）
  const handlePeriodChange = (rowId: string, grade: number, val: number) => {
    setMatrixData((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? { ...r, periods: { ...r.periods, [grade]: isNaN(val) ? 0 : val } }
          : r
      )
    );
  };

  // 修改任课老师 (Guru 1 / Guru Utama)
  const handleTeacherChange = (rowId: string, grade: number, teacherCode: string) => {
    setMatrixData((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? { ...r, teachers: { ...r.teachers, [grade]: teacherCode } }
          : r
      )
    );
  };

  // 修改协同教学副老师 (Guru 2 / Guru Bersama / Co-Teacher)
  const handleSecondaryTeacherChange = (rowId: string, grade: number, teacherCode: string) => {
    setMatrixData((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? { ...r, secondaryTeachers: { ...(r.secondaryTeachers || {}), [grade]: teacherCode } }
          : r
      )
    );
  };

  // 一键重置为当前学年的 KP2027 / KSSR 官方预设节数
  const handleResetToOfficialPreset = () => {
    setMatrixData(buildPresetRows(selectedYear));
  };

  // 计算每个年级（T1 - T6）的每周总节数（如 2027年 T1 = 46.5 节，T2-T6 = 50 节）
  // PAI 与 PM 为同节绑定（Waktu Serentak），不重复累加班级正课节数；TASMIK 为放学后时段
  const gradeTotalPeriods = useMemo(() => {
    const totals: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    matrixData.forEach((row) => {
      const code = (row.subjectCode || '').toUpperCase();
      if (code === 'PAI' || code === 'TASMIK') return;

      [1, 2, 3, 4, 5, 6].forEach((g) => {
        totals[g] += Number(row.periods[g] || 0);
      });
    });
    return totals;
  }, [matrixData]);

  // 实时累加每位真实教师的总节数（包含 PN 周会全员在职教师 +1 节，AM 协同教学双师，以及所有执教科目）
  const teacherWorkloads = useMemo(() => {
    const loads: Record<string, number> = {};
    // 规则 1: 全员教师参与周二周会 (PN Period 1)，所有在职教师自动 +1 节工作量
    dynamicTeacherMapping.list.forEach((t) => {
      loads[t.code] = 1;
    });

    matrixData.forEach((row) => {
      const code = (row.subjectCode || '').toUpperCase();
      // PN 周会已通过上述统一计入全员教师，避免重复累加
      if (code === 'PN') return;

      [1, 2, 3, 4, 5, 6].forEach((grade) => {
        const tCode = row.teachers[grade];
        const pCount = Number(row.periods[grade] || 0);
        if (tCode && pCount > 0) {
          loads[tCode] = (loads[tCode] || 0) + pCount;
        }

        // 协同教学 Co-Teacher (Guru 2 / Bersama) 同样计入全额执教节数 (+3 节)
        const secCode = row.secondaryTeachers?.[grade];
        if (secCode && pCount > 0) {
          loads[secCode] = (loads[secCode] || 0) + pCount;
        }
      });
    });
    return loads;
  }, [matrixData, dynamicTeacherMapping.list]);

  // 按工作量由重至轻排序教师列表（Heaviest-Workload Teacher First）
  const sortedTeachersByWorkload = useMemo(() => {
    return [...dynamicTeacherMapping.list].sort((a, b) => {
      const loadA = teacherWorkloads[a.code] || 0;
      const loadB = teacherWorkloads[b.code] || 0;
      if (loadB !== loadA) {
        return loadB - loadA; // Heaviest-Workload Teacher First!
      }
      return a.num - b.num;
    });
  }, [dynamicTeacherMapping.list, teacherWorkloads]);

  const grandTotalPeriods = useMemo(() => {
    return Object.values(gradeTotalPeriods).reduce((a, b) => a + b, 0);
  }, [gradeTotalPeriods]);

  const handleSaveAllocations = async () => {
    try {
      setSaveStatus('Menyimpan ke pangkalan data...');
      const targetDoc = doc(db, 'school_timetables', scopedDocId(activeSchoolCode, `matrix_${selectedYear}`));
      const payload = JSON.parse(
        JSON.stringify({
          schoolCode: activeSchoolCode,
          academicYear: selectedYear,
          matrixData,
          classTeachers,
          updatedAt: new Date().toISOString(),
        })
      );
      await setDoc(targetDoc, payload, { merge: true });
      onMatrixSaved?.(matrixData, classTeachers, selectedYear);

      setSaveStatus('Tersimpan dengan jayanya!');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err: any) {
      console.error('Save error:', err);
      setSaveStatus(`Ralat: ${err.message}`);
    }
  };

  const [dragOverCellKey, setDragOverCellKey] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* 顶部控制栏 */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30">
              Pentadbiran & Master Data
            </span>
            <span className="text-xs text-slate-400">Enjin Transisi KP2027 Mengikut Kohort</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
            Matriks Agihan Mengajar (Sesi {selectedYear})
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Jadual Waktu Akademik Penuh (Isnin–Selasa 11 waktu, Rabu–Khamis 10 waktu, Jumaat 7 waktu [T1–T3] / 8 waktu [T4–T6]):{' '}
            <strong className="text-emerald-400">T1: 49 waktu (+2.5 PKAR) | T2–T3: 49 waktu | T4–T6: 50 waktu</strong>. Slot Tasmik adalah pascawaktu sekolah (100% manual).
          </p>
        </div>

        {/* 年份切换、显示模式切换与保存按钮 */}
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-white outline-none focus:border-blue-500 cursor-pointer"
          >
            {['2026', '2027', '2028', '2029', '2030', '2031', '2032'].map((yr) => (
              <option key={yr} value={yr}>
                Sesi {yr}
              </option>
            ))}
          </select>

          <button
            onClick={() => setDisplayMode(displayMode === 'CODE' ? 'NUMBER' : 'CODE')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 transition cursor-pointer"
          >
            {displayMode === 'CODE' ? (
              <ToggleRight className="w-4 h-4 text-emerald-400" />
            ) : (
              <ToggleLeft className="w-4 h-4 text-blue-400" />
            )}
            <span>{displayMode === 'CODE' ? 'Mod Kod Singkatan' : 'Mod Nombor (1, 2, 3...)'}</span>
          </button>

          <button
            onClick={handleResetToOfficialPreset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 border border-slate-700 transition cursor-pointer"
            title="Set semula waktu mengikut ketetapan rasmi KP2027 / KSSR Semakan"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Pratetap KP2027</span>
          </button>

          <button
            onClick={handleSaveAllocations}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-blue-600/30 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Simpan Agihan</span>
          </button>
        </div>
      </div>

      {saveStatus && (
        <div
          className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
            saveStatus.includes('Ralat')
              ? 'bg-rose-950/80 border-rose-700 text-rose-200'
              : 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>{saveStatus}</span>
        </div>
      )}

      {/* 主工作区 */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* 左侧：配课矩阵 (3列宽) */}
        <div className="xl:col-span-3 bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl overflow-hidden">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-400" />
                <span>Jadual Agihan Mengajar Mengikut Tahun & Subjek</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                * Boleh tarik (Drag & Drop) kod guru dari panel kanan terus ke dalam petak guru
              </p>
            </div>
            <span className="text-[11px] text-slate-400">
              * Petak waktu adalah pratetap KP2027/KSSR tetapi tidak dikunci
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-300 font-black text-[11px] uppercase border-b border-slate-800 text-center">
                  <th className="py-3 px-3 text-left w-52">Mata Pelajaran</th>
                  <th className="py-3 px-2 w-14">Kod</th>
                  {[1, 2, 3, 4, 5, 6].map((g) => {
                    const isKP = isGradeKP2027(selectedYear, g);
                    return (
                      <th
                        key={g}
                        colSpan={2}
                        className={`py-3 px-2 border-l border-slate-800 ${
                          isKP ? 'bg-emerald-950/50 text-emerald-300' : 'bg-slate-950 text-amber-300'
                        }`}
                      >
                        <div>T.{g}</div>
                        <div className="text-[9px] font-bold tracking-wider opacity-90">
                          {isKP ? 'KP2027' : 'KSSR SEMAKAN'}
                        </div>
                      </th>
                    );
                  })}
                </tr>
                <tr className="bg-slate-950/80 text-[10px] text-slate-400 uppercase border-b border-slate-800 text-center font-bold">
                  <th className="py-1.5 px-3"></th>
                  <th className="py-1.5 px-2"></th>
                  {[1, 2, 3, 4, 5, 6].map((g) => (
                    <React.Fragment key={g}>
                      <th className="py-1.5 px-1 border-l border-slate-800 w-12 text-slate-300">T.{g}</th>
                      <th className="py-1.5 px-2 w-20 text-indigo-300">GURU</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {matrixData
                  .filter((row) => {
                    // 隐藏全校 1-6 年级节数都为 0 的未启用过渡科目（保持表格清爽）
                    const hasAnyActivePeriod = [1, 2, 3, 4, 5, 6].some((g) => (row.periods[g] || 0) > 0);
                    return hasAnyActivePeriod || row.category !== 'KP2027_ONLY';
                  })
                  .map((row) => (
                    <tr
                      key={row.id}
                      className={`hover:bg-slate-800/40 transition ${
                        row.category === 'KP2027_ONLY' ? 'bg-emerald-950/15' : ''
                      }`}
                    >
                      <td className="py-2 px-3 font-sans font-bold text-slate-200 text-xs flex items-center gap-1.5">
                        <span>{row.subjectName}</span>
                        {row.category === 'KP2027_ONLY' && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            KP2027
                          </span>
                        )}
                      </td>

                      <td className="py-2 px-2 text-center text-slate-400 font-bold text-[11px]">
                        {row.subjectCode}
                      </td>

                      {[1, 2, 3, 4, 5, 6].map((grade) => {
                        const currentPeriod = row.periods[grade] ?? 0;
                        const currentTeacher = row.teachers[grade] || '';
                        const isAssigned = currentPeriod > 0;
                        const cellKey = `${row.id}_${grade}`;

                        const isPkarNonT1 = row.subjectCode.startsWith('PKAR') && grade !== 1;

                        return (
                          <React.Fragment key={grade}>
                            {/* 节数输入框（预设但完全不锁死；PKAR 仅限一年级） */}
                            <td className="py-1.5 px-1 text-center border-l border-slate-800/80">
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                max="30"
                                disabled={isPkarNonT1}
                                value={isPkarNonT1 ? '' : (currentPeriod || '')}
                                onChange={(e) =>
                                  handlePeriodChange(row.id, grade, parseFloat(e.target.value))
                                }
                                placeholder="-"
                                className={`w-11 text-center py-1 bg-slate-950 border rounded-lg text-xs font-bold outline-none transition ${
                                  isPkarNonT1
                                    ? 'border-transparent text-slate-700 cursor-not-allowed'
                                    : isAssigned
                                    ? 'border-slate-700 text-white focus:border-blue-500'
                                    : 'border-transparent text-slate-600 focus:border-slate-700'
                                }`}
                              />
                            </td>

                            {/* 教师选择下拉框（普通科目单一选择；AM 协同教学提供 Guru 1 与 Guru 2 双师选择；支持 Drag-and-Drop） */}
                            <td
                              className={`py-1.5 px-1 text-center transition ${
                                dragOverCellKey === cellKey ? 'bg-blue-900/40 ring-2 ring-blue-400 rounded-lg' : ''
                              }`}
                              onDragOver={(e) => {
                                if (isAssigned && row.subjectCode !== 'AM' && !row.subjectCode.startsWith('PKAR')) {
                                  e.preventDefault();
                                  e.dataTransfer.dropEffect = 'copy';
                                  setDragOverCellKey(cellKey);
                                }
                              }}
                              onDragLeave={() => {
                                if (dragOverCellKey === cellKey) {
                                  setDragOverCellKey(null);
                                }
                              }}
                              onDrop={(e) => {
                                if (isAssigned && row.subjectCode !== 'AM' && !row.subjectCode.startsWith('PKAR')) {
                                  e.preventDefault();
                                  setDragOverCellKey(null);
                                  const code = e.dataTransfer.getData('application/teacher-code') || e.dataTransfer.getData('text/plain');
                                  if (code) {
                                    handleTeacherChange(row.id, grade, code.trim());
                                  }
                                }
                              }}
                            >
                              {row.subjectCode === 'AM' && isAssigned ? (
                                <div className="flex flex-col gap-1 w-full min-w-[110px]">
                                  {/* Guru 1 (Guru Utama) */}
                                  <div
                                    className={`flex items-center gap-1 rounded transition p-0.5 ${
                                      dragOverCellKey === `${cellKey}_g1` ? 'bg-blue-900/60 ring-2 ring-blue-400' : ''
                                    }`}
                                    onDragOver={(e) => {
                                      e.preventDefault();
                                      e.dataTransfer.dropEffect = 'copy';
                                      setDragOverCellKey(`${cellKey}_g1`);
                                    }}
                                    onDragLeave={() => {
                                      if (dragOverCellKey === `${cellKey}_g1`) setDragOverCellKey(null);
                                    }}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      setDragOverCellKey(null);
                                      const code = e.dataTransfer.getData('application/teacher-code') || e.dataTransfer.getData('text/plain');
                                      if (code) handleTeacherChange(row.id, grade, code.trim());
                                    }}
                                  >
                                    <span className="text-[9px] font-black px-1 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 shrink-0" title="Guru 1 (Guru Utama)">
                                      G1
                                    </span>
                                    <select
                                      value={currentTeacher}
                                      onChange={(e) => handleTeacherChange(row.id, grade, e.target.value)}
                                      className="w-full py-0.5 px-1 rounded text-[10px] font-bold outline-none bg-blue-950/70 border border-blue-600/40 text-blue-200 cursor-pointer"
                                      title="Guru 1 (Guru Utama)"
                                    >
                                      <option value="">- G1 -</option>
                                      {dynamicTeacherMapping.list.map((t) => (
                                        <option key={t.id} value={t.code}>
                                          {displayMode === 'CODE' ? t.code : String(t.num)} ({t.code})
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  {/* Guru 2 (Guru Bersama / Co-Teacher) */}
                                  <div
                                    className={`flex items-center gap-1 rounded transition p-0.5 ${
                                      dragOverCellKey === `${cellKey}_g2` ? 'bg-purple-900/60 ring-2 ring-purple-400' : ''
                                    }`}
                                    onDragOver={(e) => {
                                      e.preventDefault();
                                      e.dataTransfer.dropEffect = 'copy';
                                      setDragOverCellKey(`${cellKey}_g2`);
                                    }}
                                    onDragLeave={() => {
                                      if (dragOverCellKey === `${cellKey}_g2`) setDragOverCellKey(null);
                                    }}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      setDragOverCellKey(null);
                                      const code = e.dataTransfer.getData('application/teacher-code') || e.dataTransfer.getData('text/plain');
                                      if (code) handleSecondaryTeacherChange(row.id, grade, code.trim());
                                    }}
                                  >
                                    <span className="text-[9px] font-black px-1 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0" title="Guru 2 (Guru Bersama / Co-Teacher)">
                                      G2
                                    </span>
                                    <select
                                      value={row.secondaryTeachers?.[grade] || ''}
                                      onChange={(e) => handleSecondaryTeacherChange(row.id, grade, e.target.value)}
                                      className="w-full py-0.5 px-1 rounded text-[10px] font-bold outline-none bg-purple-950/70 border border-purple-600/40 text-purple-200 cursor-pointer"
                                      title="Guru 2 (Guru Bersama / Co-Teacher)"
                                    >
                                      <option value="">- G2 (Co) -</option>
                                      {dynamicTeacherMapping.list.map((t) => (
                                        <option key={t.id} value={t.code}>
                                          {displayMode === 'CODE' ? t.code : String(t.num)} ({t.code})
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              ) : row.subjectCode.startsWith('PKAR') ? (
                                <div
                                  className={`w-full py-1 px-1 rounded-lg text-[10px] font-bold text-center ${
                                    grade === 1 && isAssigned
                                      ? 'bg-emerald-950/70 border border-emerald-600/40 text-emerald-300'
                                      : 'text-slate-600'
                                  }`}
                                  title={grade === 1 ? 'Program Pembentukan Karakter: Automatik dipasangkan kepada guru mengajar sebelum waktu rehat (+0.5 waktu)' : 'PKAR hanya untuk Tahun 1 (T2–T6 tiada PKAR)'}
                                >
                                  {grade === 1 && isAssigned ? 'Auto: Sebelum Rehat' : '-'}
                                </div>
                              ) : (
                                <select
                                  value={currentTeacher}
                                  onChange={(e) => handleTeacherChange(row.id, grade, e.target.value)}
                                  disabled={!isAssigned}
                                  className={`w-full py-1 px-1 rounded-lg text-[11px] font-bold outline-none transition cursor-pointer text-center ${
                                    !isAssigned
                                      ? 'bg-transparent text-transparent border-transparent cursor-default'
                                      : currentTeacher
                                      ? 'bg-blue-950/60 border border-blue-600/40 text-blue-200'
                                      : 'bg-slate-950 border border-slate-800 text-slate-500'
                                  }`}
                                >
                                  <option value="">-</option>
                                  {dynamicTeacherMapping.list.map((t) => {
                                    const cellDisplay = displayMode === 'CODE' ? t.code : String(t.num);
                                    return (
                                      <option key={t.id} value={t.code}>
                                        {cellDisplay}
                                      </option>
                                    );
                                  })}
                                </select>
                              )}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
              {/* 底部各年级总节数汇总行 (Jumlah Waktu Seminggu) */}
              <tfoot>
                <tr className="bg-slate-950 border-t-2 border-slate-700 font-mono font-black text-xs text-center">
                  <td className="py-3 px-3 text-left font-sans text-white uppercase">
                    JUMLAH WAKTU SEMINGGU
                  </td>
                  <td className="py-3 px-2 text-slate-500">-</td>
                  {[1, 2, 3, 4, 5, 6].map((g) => (
                    <td
                      key={g}
                      colSpan={2}
                      className={`py-3 px-2 border-l border-slate-800 ${
                        isGradeKP2027(selectedYear, g) ? 'text-emerald-400' : 'text-amber-300'
                      }`}
                    >
                      <div className="font-mono text-sm">
                        {gradeTotalPeriods[g]} Waktu {g === 1 ? ' (+2.5 PKAR)' : ''}
                      </div>
                      <div className="text-[10px] font-sans text-slate-300 font-bold mt-0.5">
                        Sasaran: {g === 1 ? '45 (+2.5 PKAR)' : g <= 3 ? '49' : '50'} Waktu
                      </div>
                      <div className="text-[9px] font-sans text-slate-500 font-normal">
                        (Tasmik: Slot Khas Pascawaktu)
                      </div>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* 右侧：Master Data 教师负荷表 + 级任老师指派 */}
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div>
                <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-indigo-400" />
                  <span>Daftar Guru (Master Data)</span>
                </h3>
                <span className="text-[10px] text-indigo-300 font-sans block mt-0.5">
                  Beban Terberat Dahulu · Tarik (Drag) Kod Guru
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                Jumlah: <strong className="text-white">{grandTotalPeriods}</strong>
              </span>
            </div>

            {dynamicTeacherMapping.list.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 space-y-2">
                <AlertTriangle className="w-6 h-6 text-amber-500/60 mx-auto" />
                <p>Tiada rekod guru dalam Master Data.</p>
                <p className="text-[10px] text-slate-600">
                  Sistem dikosongkan tanpa nama palsu. Sila import senarai guru di tab Profil Guru / Import Pintar.
                </p>
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto space-y-1.5 pr-1">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase font-bold sticky top-0">
                    <tr>
                      <th className="p-2 w-8">No</th>
                      <th className="p-2 w-14">Guru</th>
                      <th className="p-2">Nama Penuh</th>
                      <th className="p-2 text-right w-24">Waktu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {sortedTeachersByWorkload.map((t) => {
                      const workload = teacherWorkloads[t.code] || 0;
                      const estMaxDaily = Math.min(8, Math.ceil(workload / 5));
                      const isOver40 = workload > 40;
                      const isOver35 = workload > 35 && workload <= 40;
                      const isHeavyBalanced = workload > 30 && workload <= 35;
                      const isOptimal = workload >= 22 && workload <= 30;

                      return (
                        <tr
                          key={t.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', t.code);
                            e.dataTransfer.setData('application/teacher-code', t.code);
                            e.dataTransfer.effectAllowed = 'copyMove';
                          }}
                          className="hover:bg-slate-800/50 cursor-grab active:cursor-grabbing transition group"
                          title={
                            isOver40
                              ? `${t.code}: >40w Melebihi Had 8w/hari!`
                              : isOver35
                              ? `${t.code}: >35w Perlu >7w/hari`
                              : 'Tarik kod guru ini ke dalam petak jadual untuk menetapkan guru'
                          }
                        >
                          <td className="p-2 font-bold text-slate-400">{t.num}</td>
                          <td className="p-2 font-black text-indigo-300">
                            <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 border border-indigo-500/30 group-hover:bg-indigo-500/30 transition">
                              {t.code}
                            </span>
                          </td>
                          <td
                            className="p-2 font-sans truncate max-w-[110px] text-slate-200 text-[11px]"
                            title={t.name}
                          >
                            {t.name}
                          </td>
                          <td className="p-2 text-right">
                            <div className="inline-flex flex-col items-end gap-0.5">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  isOver40
                                    ? 'bg-rose-950 text-rose-300 border border-rose-700'
                                    : isOver35
                                    ? 'bg-amber-950 text-amber-300 border border-amber-700'
                                    : isHeavyBalanced
                                    ? 'bg-sky-950 text-sky-300 border border-sky-700'
                                    : isOptimal
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {workload}w · Max {estMaxDaily}w/h
                              </span>
                              {isOver40 && (
                                <span className="text-[9px] font-sans font-bold text-rose-400">
                                  &gt;40w: Melebihi Had 8w/hari!
                                </span>
                              )}
                              {isOver35 && (
                                <span className="text-[9px] font-sans font-bold text-amber-400">
                                  &gt;35w: Perlu &gt;7w/hari
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
            )}
          </div>

          {/* 级任老师设定看板 */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
            <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-800 pb-2">
              <GraduationCap className="w-4 h-4 text-emerald-400" />
              <span>Penetapan Guru Kelas</span>
            </h3>

            <div className="space-y-2 text-xs">
              {[1, 2, 3, 4, 5, 6].map((g) => (
                <div key={g} className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-300 w-20 text-xs font-mono">
                    T.{g} (Tahun {g}):
                  </span>
                  <select
                    value={classTeachers[g] || ''}
                    onChange={(e) =>
                      setClassTeachers((prev) => ({ ...prev, [g]: e.target.value }))
                    }
                    className="flex-1 py-1.5 px-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-sans outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="">-- Belum Ditetapkan --</option>
                    {dynamicTeacherMapping.list.map((t) => (
                      <option key={t.id} value={t.code}>
                        [{t.num}] {t.code} - {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SchoolTimetableMatrix;
