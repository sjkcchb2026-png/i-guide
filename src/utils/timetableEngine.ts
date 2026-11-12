/**
 * iSEPADU AI — Timetable Scheduling Engine
 * Supports:
 * 1. 周会 (PN) 全员参与，所有在职教师自动 +1 节工作量 (RABU Period 1)
 * 2. 教师休息空档与单日 8 节上限校验 (canTeacherTakeSlot)
 * 3. PEMULIHAN (辅导课) 2+1+1 分布与“优先抽连堂第2节”算法
 * 4. TASMIK 跨班合班 (GABUNG KELAS) 冲突白名单 (isTimetableConflict)
 * 5. PJ Strict Max 1 Period/Day (Triplets: 1,3,5 / 1,2,4 / 1,3,4 for 3 periods; Pairs for 2 periods)
 * 6. Parallel Binding for Pendidikan Moral (PM) & Pendidikan Agama Islam (PAI) (Waktu Serentak PM / PAI)
 * 7. Program Tasmik (TASMIK) 2 periods/week strictly post-school on Wednesday, Thursday, Friday (1+1)
 * 8. KPM Curriculum Workload & Clash Prevention
 */

export const DAYS_OF_WEEK = ['ISNIN', 'SELASA', 'RABU', 'KHAMIS', 'JUMAAT'] as const;
export type DayOfWeek = typeof DAYS_OF_WEEK[number];

export interface TimetableLesson {
  id: string;
  day: string;
  periodNumber: number;
  classId: string;
  className: string;
  subjectCode: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  countsAsClassPeriod: boolean;
  countsAsTeacherPeriod: boolean;
  parentTimetableSlotId?: string;
  isPN?: boolean;
  isPemulihan?: boolean;
  fractionalPeriod?: number;
  isManualSlot?: boolean;
  isAutoPKAR?: boolean;
  linkedPreRecessLessonId?: string;
  timeSlotLabel?: string;
}

export interface ClassProfile {
  classId: string;
  className: string;
  yearLevel?: string;
  grade?: number;
  isPrasekolah?: boolean;
}

export interface TeacherProfile {
  teacherId: string;
  fullName: string;
  code?: string;
  shortName?: string;
  weeklyWorkload?: number;
  [key: string]: any;
}

export interface SubjectAssignment {
  assignmentId: string;
  classId: string;
  className: string;
  canonicalSubjectCode: string;
  subjectName: string;
  teacherId: string; // Guru 1 (Guru Utama)
  secondaryTeacherId?: string; // Guru 2 (Guru Bersama / Co-Teacher)
  coTeacherId?: string;
  isTeamTeaching?: boolean;
  effectiveWeeklyPeriods: number;
  assignmentType?: 'PBM' | 'PMT' | string;
  isPemulihan?: boolean;
}

// --------------------------------------------------------------------------
// 1. 科目特征识别辅助函数
// --------------------------------------------------------------------------
export function isAMSubject(code?: string, name?: string): boolean {
  const c = (code || '').trim().toUpperCase();
  const n = (name || '').trim().toUpperCase();
  return c === 'AM' || n.includes('ALAM DAN MANUSIA');
}

export function isPairedMoralIslam(code?: string): 'PM' | 'PAI' | null {
  const c = (code || '').trim().toUpperCase();
  if (c === 'PM' || c === 'MORAL') return 'PM';
  if (c === 'PAI' || c === 'PI' || c === 'AGAMA') return 'PAI';
  return null;
}

export function isTasmikSubject(code?: string, name?: string): boolean {
  const c = (code || '').trim().toUpperCase();
  const n = (name || '').trim().toUpperCase();
  return c === 'TAS' || c === 'TASMIK' || n.includes('TASMIK');
}

export function isPJSubject(code?: string, name?: string): boolean {
  const c = (code || '').trim().toUpperCase();
  const n = (name || '').trim().toUpperCase();
  return c === 'PJ' || n.includes('JASMANI');
}

export function isPemulihanSubject(code?: string, name?: string): boolean {
  const c = (code || '').trim().toUpperCase();
  const n = (name || '').trim().toUpperCase();
  return (
    c === 'PBM' ||
    c === 'PMT' ||
    c === 'PEMULIHAN' ||
    c.startsWith('PEM') ||
    n.includes('PEMULIHAN')
  );
}

export function isPKARSubject(code?: string, name?: string): boolean {
  const c = (code || '').trim().toUpperCase();
  const n = (name || '').trim().toUpperCase();
  return c.startsWith('PKAR') || n.includes('PEMBENTUKAN KARAKTER');
}

// --------------------------------------------------------------------------
// 1A. 每日正课节数配置与特色项目配置 (KP2027 & KSSR)
// --------------------------------------------------------------------------
// 1. 根据星期与年级 (level: 1~6) 动态返回正课节数与放学后 Tasmik 专属格位置
export function getDayPeriodConfig(day: string, classLevel: number = 2) {
  const isT1 = classLevel === 1;
  const isUpperPrimary = classLevel >= 4; // 四年级至六年级 (Tahun 4 - 6)

  switch (day.toUpperCase()) {
    case 'ISNIN':
    case 'SELASA':
      return {
        teachingPeriods: isT1 ? 10 : 11,
        preRecessPeriod: isT1 ? 4 : 5,
        tasmikManualPeriod: isT1 ? 11 : 12,
      };
    case 'RABU':
    case 'KHAMIS':
      return {
        teachingPeriods: isT1 ? 9 : 10,
        preRecessPeriod: isT1 ? 4 : 5,
        tasmikManualPeriod: isT1 ? 10 : 11,
      };
    case 'JUMAAT':
      return {
        // 星期五：一年级 7 节课，二至三年级 7 节课，四至六年级 8 节课
        teachingPeriods: isUpperPrimary ? 8 : 7,
        preRecessPeriod: isT1 ? 4 : 5,
        tasmikManualPeriod: isT1 ? 8 : (isUpperPrimary ? 9 : 8),
      };
    default:
      return {
        teachingPeriods: isT1 ? 9 : 10,
        preRecessPeriod: isT1 ? 4 : 5,
        tasmikManualPeriod: isT1 ? 10 : 11,
      };
  }
}

// 2. 识别班级所属年级 (Tahun 1 ~ Tahun 6)
export function resolveClassLevel(cls: { level?: number; className?: string; classId?: string; grade?: number; yearLevel?: string }): number {
  if (typeof cls.level === 'number' && cls.level >= 1 && cls.level <= 6) {
    return cls.level;
  }
  if (typeof cls.grade === 'number' && cls.grade >= 1 && cls.grade <= 6) {
    return cls.grade;
  }
  const raw = `${cls.className || ''} ${cls.classId || ''} ${cls.yearLevel || ''}`.toUpperCase();
  const match = raw.match(/(?:TAHUN|T\.?|YEAR|DARJAH|\b)([1-6])\b/);
  return match ? parseInt(match[1], 10) : 1;
}

// 3. 一年级 07:15 - 07:30 Program Membaca 固定留空（供后续手动点击指派老师）
export function seedYear1ProgramMembaca(classes: any[], days: string[], lessons: any[]) {
  const year1Classes = classes.filter((c) => resolveClassLevel(c) === 1);
  year1Classes.forEach((cls) => {
    days.forEach((day) => {
      // 避免重复生成
      if (lessons.some((l) => l.day === day && l.classId === cls.classId && (l.periodNumber === 0 || l.subjectCode === 'MEMBACA'))) {
        return;
      }
      lessons.push({
        id: `membaca_${cls.classId}_${day}`,
        day,
        periodNumber: 0, // 07:15 - 07:30 晨读独立格
        timeSlotLabel: '07:15 - 07:30',
        classId: cls.classId,
        className: cls.className,
        subjectCode: 'MEMBACA',
        subjectName: 'Program Membaca',
        teacherId: '', // 默认放空，由管理员手动点击指派
        teacherName: 'Klik untuk pilih guru',
        isManualSlot: true,
        countsAsClassPeriod: false,
        countsAsTeacherPeriod: false,
      });
    });
  });
}

// 4. 放学后专属 TASMIK 槽位（Slot Khas Tasmik）100% 手动指派（预设放空，严禁自动排入）
// 星期一/二: 第 12 节 (13:45-14:15), 星期三/四: 第 11 节 (13:15-13:45), 星期五: 一至三年级第 8 节 (11:45-12:15) / 四至六年级第 9 节 (12:15-12:45)
export function seedManualTasmikSlots(classes: any[], days: string[], lessons: any[]) {
  classes.forEach((cls) => {
    const classLevel = resolveClassLevel(cls);
    days.forEach((day) => {
      const { tasmikManualPeriod } = getDayPeriodConfig(day, classLevel);
      if (
        lessons.some(
          (l) =>
            l.day === day &&
            l.classId === cls.classId &&
            (l.periodNumber === tasmikManualPeriod || l.id === `manual_tasmik_${cls.classId}_${day}_P${tasmikManualPeriod}`)
        )
      ) {
        return;
      }

      const timeSlotLabel =
        day === 'JUMAAT'
          ? classLevel >= 4
            ? '12:15 - 12:45'
            : '11:45 - 12:15'
          : day === 'ISNIN' || day === 'SELASA'
          ? '13:15 - 13:45'
          : '12:45 - 13:15';

      lessons.push({
        id: `manual_tasmik_${cls.classId}_${day}_P${tasmikManualPeriod}`,
        day,
        periodNumber: tasmikManualPeriod,
        timeSlotLabel,
        classId: cls.classId,
        className: cls.className,
        subjectCode: 'TASMIK',
        subjectName: 'Slot Khas Tasmik (Selepas Sekolah)',
        teacherId: '', // 100% 手动点击指派，严禁系统自动预占
        teacherName: 'Klik untuk pilih Ustaz/Ustazah',
        isManualSlot: true,
        countsAsClassPeriod: false, // 放学后时段，不计入班级正课节数
        countsAsTeacherPeriod: false, // 待手动指派后计入执教教师工作量
      });
    });
  });
}

// 5. 自动将每日 PKAR (0.5 节) 绑定给“下课前那一节”的进班老师，并自动计入 +0.5 节工作量
export function autoPairPKARWithPreRecessTeacher(
  lessons: any[],
  days: string[],
  incTeacherWorkload: (teacherId: string, day: string, delta: number) => void
) {
  // 先清除旧的自动 PKAR 记录，确保拖拽调课后也能实时重新绑定
  const filteredLessons = lessons.filter((l) => !l.isAutoPKAR);

  days.forEach((day) => {
    const { preRecessPeriod } = getDayPeriodConfig(day);

    // 找出所有一年级班级在当天下课前那一节的正课 (PKAR 只有一年级。二到六年级没有。)
    // 一年级下课前最后一节正课是第 4 节 (09:00 - 09:30)，紧接 09:30 - 09:45 PKAR，09:45 下课
    const isYear1Lesson = (l: any) =>
      l.classLevel === 1 ||
      (typeof l.className === 'string' && (l.className.includes('1') || l.className.toUpperCase().includes('TAHUN 1'))) ||
      (typeof l.classId === 'string' && l.classId.includes('1'));

    const preRecessLessons = filteredLessons.filter(
      (l) =>
        l.day === day &&
        isYear1Lesson(l) &&
        (l.periodNumber === 4 || l.periodNumber === preRecessPeriod) &&
        !l.isPemulihan &&
        l.countsAsClassPeriod
    );

    // 每个一年级班级仅绑定一次第 4 节教师
    const pairedClasses = new Set<string>();
    preRecessLessons
      .sort((a, b) => (a.periodNumber === 4 ? -1 : 1))
      .forEach((preLesson) => {
        if (pairedClasses.has(preLesson.classId)) return;
        if (!preLesson.teacherId || preLesson.teacherId.startsWith('ALL_TEACHERS')) return;

        pairedClasses.add(preLesson.classId);

        // 自动为该班生成绑定下课前老师的 PKAR (0.5 节)
        filteredLessons.push({
          id: `pkar_${preLesson.classId}_${day}`,
          day,
          periodNumber: 4.5, // 09:30 - 09:45 (下课前 15 分钟)
          classId: preLesson.classId,
          className: preLesson.className,
          subjectCode: 'PKAR',
          subjectName: 'Program Pembentukan Karakter (15 Min)',
          teacherId: preLesson.teacherId,
          teacherName: preLesson.teacherName,
          isAutoPKAR: true,
          linkedPreRecessLessonId: preLesson.id,
          fractionalPeriod: 0.5,
          countsAsClassPeriod: true,
          countsAsTeacherPeriod: true, // 自动计入该老师 +0.5 节工作量
        });

        // 累加该老师当天的排课节数 (+0.5)
        incTeacherWorkload(preLesson.teacherId, day, 0.5);
      });
  });

  return filteredLessons;
}

// --------------------------------------------------------------------------
// 1B. 真实时钟重叠检测器与连堂课寻优评分函数
// --------------------------------------------------------------------------
export interface TimeInterval {
  day: string;
  startMinutes: number; // 例如 11:45 = 11 * 60 + 45 = 705
  endMinutes: number;   // 例如 12:15 = 12 * 60 + 15 = 735
  classId: string;
  subjectCode: string;
}

export function isTeacherBusyInTimeRange(
  teacherIntervals: TimeInterval[],
  day: string,
  targetStartMin: number,
  targetEndMin: number,
  candidateSubjectCode: string
): boolean {
  for (const interval of teacherIntervals) {
    if (interval.day !== day) continue;

    // 判断两个时间段是否存在重叠: max(start1, start2) < min(end1, end2)
    const hasOverlap =
      Math.max(interval.startMinutes, targetStartMin) <
      Math.min(interval.endMinutes, targetEndMin);

    if (hasOverlap) {
      // 特例豁免：如果是放学后的 TASMIK，允许同一位宗教老师跨班合班 (Gabung Kelas)
      if ((interval.subjectCode === 'TASMIK' || interval.subjectCode === 'TAS') && 
          (candidateSubjectCode === 'TASMIK' || candidateSubjectCode === 'TAS')) {
        continue;
      }
      return true; // 存在时间重叠，严禁排入！
    }
  }
  return false;
}

// 连堂课寻优评分函数：优先不跨下课，迫不得已时允许跨下课 (P5 -> Rehat -> P6)
export function scoreDoubleSlotCandidate(
  p1: number,
  p2: number,
  recessAfterPeriod: number = 5
): number {
  const crossesRecess = p1 === recessAfterPeriod && p2 === recessAfterPeriod + 1;
  // 不跨下课得 100 分（优先采用）；跨下课扣 60 分（得 40 分，仅在无其他空位时作为次选保底）
  return crossesRecess ? 40 : 100;
}

// --------------------------------------------------------------------------
// 2. 体育课 PJ 候选配置
// --------------------------------------------------------------------------
export const validPJ3DayTriplets: Array<[string, string, string]> = [
  ['ISNIN', 'RABU', 'JUMAAT'],   // 星期 1, 3, 5
  ['ISNIN', 'SELASA', 'KHAMIS'], // 星期 1, 2, 4
  ['ISNIN', 'RABU', 'KHAMIS'],   // 星期 1, 3, 4
];

export const validPJ2DayPairs: Array<[string, string]> = [
  ['ISNIN', 'RABU'],             // 星期 1, 3
  ['SELASA', 'KHAMIS'],          // 星期 2, 4
  ['RABU', 'JUMAAT'],            // 星期 3, 5
  ['ISNIN', 'KHAMIS'],           // 星期 1, 4
  ['SELASA', 'JUMAAT'],          // 星期 2, 5
];

// 每个交易日在上午下课前可排 PJ 的节次（周二第1节固定为 PN 周会，PJ 严格排入第2节；其他日期严格限制在第1节或第2节，优先第1节）
export const getMorningPJCandidates = (day: string): number[] => {
  if (day === 'SELASA') {
    return [2]; // 周二第 1 节固定为 PN 周会，PJ 严格排入第 2 节
  }
  return [1, 2]; // 严格限制在第 1 节或第 2 节（优先第 1 节，有冲突时使用第 2 节）
};

export const getDailyMaxPeriods = (day: string, classLevel: number = 1): number => {
  return getDayPeriodConfig(day, classLevel).teachingPeriods;
};

export const isAdjacentPeriod = (p1: number, p2: number): boolean => {
  return p2 === p1 + 1;
};

// --------------------------------------------------------------------------
// 3. 教师休息空档与单日 8 节上限校验函数
// --------------------------------------------------------------------------
export function canTeacherTakeSlot(
  teacherId: string,
  day: string,
  targetPeriod: number,
  currentTeacherLessonsOnDay: number[], // 当天已排入的节次列表
  currentTeacherWorkloadDay: number = 0 // 包含 0.5 节 PKAR 的实际工作量
): boolean {
  // 规则 2A: 一天最多 8 节课 (含 0.5 节 PKAR)
  if (currentTeacherLessonsOnDay.length >= 8 || currentTeacherWorkloadDay + 1 > 8) {
    return false;
  }

  const { preRecessPeriod, teachingPeriods } = getDayPeriodConfig(day);
  const simulatedPeriods = [...currentTeacherLessonsOnDay, targetPeriod];
  const morningPeriods = simulatedPeriods.filter((p) => p <= preRecessPeriod);
  const afternoonPeriods = simulatedPeriods.filter((p) => p > preRecessPeriod && p <= teachingPeriods);

  // 规则 2B: 下课前 (第 1 ~ preRecessPeriod 节) 至少留出 1 节空档
  if (morningPeriods.length >= preRecessPeriod) {
    return false;
  }

  // 规则 2C: 下课后 (第 preRecessPeriod+1 节及以后) 至少留出 1 节空档
  const totalAfternoonSlots = teachingPeriods - preRecessPeriod;
  if (totalAfternoonSlots > 1 && afternoonPeriods.length >= totalAfternoonSlots) {
    return false;
  }

  return true;
}

// --------------------------------------------------------------------------
// 4. TASMIK 跨班合班 (GABUNG KELAS) 与 协同教学 (CO-TEACHING) 冲突白名单
// --------------------------------------------------------------------------
export function isTimetableConflict(
  existingLesson: any,
  newLessonCandidate: any
): boolean {
  // 如果是同一个老师，且科目都是 TASMIK（例如同时带 一年级 和 二年级 Tasmik）
  if (
    existingLesson.teacherId === newLessonCandidate.teacherId &&
    (existingLesson.subjectCode === 'TASMIK' || existingLesson.subjectCode === 'TAS') &&
    (newLessonCandidate.subjectCode === 'TASMIK' || newLessonCandidate.subjectCode === 'TAS') &&
    existingLesson.day === newLessonCandidate.day &&
    existingLesson.periodNumber === newLessonCandidate.periodNumber
  ) {
    // 判定为合法合班（Kelas Gabungan），豁免冲突！
    return false;
  }

  // 协同教学 (Co-Teaching: AM / PM/PAI) 豁免自身关联的同一槽位
  if (
    existingLesson.day === newLessonCandidate.day &&
    existingLesson.periodNumber === newLessonCandidate.periodNumber &&
    ((existingLesson.id && existingLesson.id === newLessonCandidate.parentTimetableSlotId) ||
      (newLessonCandidate.id && newLessonCandidate.id === existingLesson.parentTimetableSlotId))
  ) {
    return false;
  }

  // 时钟区间重叠校验：若包含真实 startMinutes / endMinutes，按真实时钟判定
  if (
    existingLesson.teacherId === newLessonCandidate.teacherId &&
    existingLesson.day === newLessonCandidate.day
  ) {
    if (existingLesson.startMinutes !== undefined && newLessonCandidate.startMinutes !== undefined) {
      return (
        Math.max(existingLesson.startMinutes, newLessonCandidate.startMinutes) <
        Math.min(existingLesson.endMinutes, newLessonCandidate.endMinutes)
      );
    }
    return existingLesson.periodNumber === newLessonCandidate.periodNumber;
  }

  return false;
}

// --------------------------------------------------------------------------
// 5. PROGRAM TASMIK 放学后节次与候选组合
// --------------------------------------------------------------------------
export const tasmikCandidateDays = ['RABU', 'KHAMIS', 'JUMAAT'] as const;

export const getPostDismissalSlotForTasmik = (
  day: 'RABU' | 'KHAMIS' | 'JUMAAT' | string,
  yearLevelStr?: string | number,
  _acadYearStr?: string
): number => {
  let level = 1;
  if (typeof yearLevelStr === 'number') {
    level = yearLevelStr;
  } else if (typeof yearLevelStr === 'string') {
    level = resolveClassLevel({ yearLevel: yearLevelStr });
  }
  return getDayPeriodConfig(day, level).tasmikManualPeriod;
};

export const tasmikDayPairs: Array<['RABU' | 'KHAMIS' | 'JUMAAT', 'RABU' | 'KHAMIS' | 'JUMAAT']> = [
  ['RABU', 'KHAMIS'],   // 拜三 + 拜四
  ['RABU', 'JUMAAT'],   // 拜三 + 拜五
  ['KHAMIS', 'JUMAAT'], // 拜四 + 拜五
];

export interface EngineResult {
  lessons: TimetableLesson[];
  scheduledPerAssignment: Map<string, number>;
  unplacedCount: number;
}

/**
 * Master Timetable Generation Engine
 */
export function runTimetableEngine(params: {
  classes: ClassProfile[];
  teachers: TeacherProfile[];
  assignments: SubjectAssignment[];
  academicYear?: string;
}): EngineResult {
  const { classes, teachers, assignments, academicYear = '2027' } = params;

  const lessons: TimetableLesson[] = [];
  const scheduledPerAssignment = new Map<string, number>();

  const classSlotOccupied = new Set<string>();
  const teacherSlotOccupied = new Set<string>();
  const teacherDayPeriodCounts = new Map<string, number>();
  const teacherDayPeriodsMap = new Map<string, number[]>(); // `${teacherId}_${day}` -> array of periods

  const incTeacherDayCount = (teacherId: string, day: string, delta: number = 1) => {
    const key = `${teacherId}_${day}`;
    teacherDayPeriodCounts.set(key, (teacherDayPeriodCounts.get(key) || 0) + delta);
  };

  const getTeacherPeriodsOnDay = (teacherId: string, day: string): number[] => {
    return teacherDayPeriodsMap.get(`${teacherId}_${day}`) || [];
  };

  const addTeacherPeriodOnDay = (teacherId: string, day: string, period: number) => {
    const key = `${teacherId}_${day}`;
    const list = teacherDayPeriodsMap.get(key) || [];
    if (!list.includes(period)) {
      list.push(period);
      list.sort((a, b) => a - b);
      teacherDayPeriodsMap.set(key, list);
    }
  };

  const subjectPeriodsMap = new Map<string, number[]>(); // `${classId}_${subjectCode}_${day}` -> periods[]

  const recordSubjectPeriod = (classId: string, subjectCode: string, day: string, period: number) => {
    const key = `${classId}_${subjectCode.toUpperCase()}_${day}`;
    const list = subjectPeriodsMap.get(key) || [];
    list.push(period);
    subjectPeriodsMap.set(key, list);
  };

  const getSubjectPeriodsOnDay = (classId: string, subjectCode: string, day: string): number[] => {
    const key = `${classId}_${subjectCode.toUpperCase()}_${day}`;
    return subjectPeriodsMap.get(key) || [];
  };

  const teacherMap = new Map<string, TeacherProfile>();
  teachers.forEach((t) => teacherMap.set(t.teacherId, t));

  const nonPrasekolahClasses = classes.filter((c) => !c.isPrasekolah);
  const normalizedAssignments: SubjectAssignment[] = assignments.map((a) => ({
    ...a,
    canonicalSubjectCode: a.canonicalSubjectCode?.toUpperCase() || '',
  }));

  // 分离常规排课、辅导课、Tasmik 课与 0.5 节 PKAR 课
  const pkarAssignments = normalizedAssignments.filter(
    (a) => isPKARSubject(a.canonicalSubjectCode, a.subjectName)
  );

  const pemulihanAssignmentsList = normalizedAssignments.filter(
    (a) => isPemulihanSubject(a.canonicalSubjectCode, a.subjectName) || a.isPemulihan
  );

  const tasmikAssignments = normalizedAssignments.filter((a) =>
    isTasmikSubject(a.canonicalSubjectCode, a.subjectName)
  );

  const academicAndPjAssignments = normalizedAssignments.filter(
    (a) =>
      !isTasmikSubject(a.canonicalSubjectCode, a.subjectName) &&
      !isPemulihanSubject(a.canonicalSubjectCode, a.subjectName) &&
      !isPKARSubject(a.canonicalSubjectCode, a.subjectName) &&
      !isAMSubject(a.canonicalSubjectCode, a.subjectName) &&
      !a.isPemulihan
  );

  // --------------------------------------------------------------------------
  // 1. 周会 (PN) 全员参与，所有在职教师自动 +1 节工作量 (SELASA Period 1)
  // --------------------------------------------------------------------------
  const assemblyDay = 'SELASA';
  nonPrasekolahClasses.forEach((cls) => {
    const classKey = `${cls.classId}_${assemblyDay}_1`;
    classSlotOccupied.add(classKey);
    recordSubjectPeriod(cls.classId, 'PN', assemblyDay, 1);

    // 登记班级周会节次
    lessons.push({
      id: `pn_${cls.classId}_${assemblyDay}_P1`,
      day: assemblyDay,
      periodNumber: 1,
      classId: cls.classId,
      className: cls.className,
      subjectCode: 'PN',
      subjectName: 'Perhimpunan Rasmi',
      teacherId: `ALL_TEACHERS_${cls.classId}`,
      teacherName: 'Semua Guru & Murid Terlibat',
      isPN: true,
      countsAsClassPeriod: true,
      countsAsTeacherPeriod: false,
    });
  });

  // 为全校所有在职老师在周二第 1 节锁定槽位，并计入真实教学工作量 (+1)
  teachers.forEach((t) => {
    teacherSlotOccupied.add(`${t.teacherId}_${assemblyDay}_1`);
    incTeacherDayCount(t.teacherId, assemblyDay, 1); // 老师工作量计入 1 节
    addTeacherPeriodOnDay(t.teacherId, assemblyDay, 1);

    lessons.push({
      id: `pn_workload_${t.teacherId}_${assemblyDay}_P1`,
      day: assemblyDay,
      periodNumber: 1,
      classId: 'ALL_CLASSES',
      className: 'Perhimpunan',
      subjectCode: 'PN',
      subjectName: 'Perhimpunan Rasmi',
      teacherId: t.teacherId,
      teacherName: t.fullName,
      isPN: true,
      countsAsClassPeriod: false,
      countsAsTeacherPeriod: true, // 核心更新：计入教师每周节数
    });
  });

  // --------------------------------------------------------------------------
  // STEP 0B: 一年级 07:15 - 07:30 PROGRAM MEMBACA 固定留空（供后续手动指派老师）
  // --------------------------------------------------------------------------
  seedYear1ProgramMembaca(nonPrasekolahClasses, DAYS_OF_WEEK as any, lessons);

  // --------------------------------------------------------------------------
  // STEP 0C: 放学后 SLOT KHAS TASMIK 固定留空（100% 手动指派，严禁系统自动预占）
  // --------------------------------------------------------------------------
  seedManualTasmikSlots(nonPrasekolahClasses, DAYS_OF_WEEK as any, lessons);

  // 标记 PKAR 课目由自动对齐算法绑定，不需手动选师
  pkarAssignments.forEach((asg) => {
    scheduledPerAssignment.set(asg.assignmentId, 1);
  });

  // --------------------------------------------------------------------------
  // STEP 1: SCHEDULE PJ (Strict Max 1 period/day, morning slots)
  // --------------------------------------------------------------------------
  nonPrasekolahClasses.forEach((cls) => {
    const classPjAssignments = academicAndPjAssignments.filter(
      (a) => a.classId === cls.classId && isPJSubject(a.canonicalSubjectCode, a.subjectName)
    );

    classPjAssignments.forEach((asg) => {
      const requiredPeriods = asg.effectiveWeeklyPeriods; // KP2027 T1 = 3, KSSR T2-T6 = 2
      let scheduled = scheduledPerAssignment.get(asg.assignmentId) || 0;
      if (scheduled >= requiredPeriods) return;

      const dayPatterns: string[][] =
        requiredPeriods >= 3 ? validPJ3DayTriplets : validPJ2DayPairs;

      for (const pattern of dayPatterns) {
        if (scheduled >= requiredPeriods) break;

        // 为 pattern 中的每一天寻找 1 个可用上午节次（每天仅 1 节）
        const chosenSlots: { day: string; period: number }[] = [];

        for (const day of pattern) {
          const pCandidates = getMorningPJCandidates(day);
          let foundPeriod: number | null = null;

          for (const p of pCandidates) {
            const cKey = `${cls.classId}_${day}_${p}`;
            const tKey = `${asg.teacherId}_${day}_${p}`;
            const existingPjOnDay = getSubjectPeriodsOnDay(cls.classId, asg.canonicalSubjectCode, day);
            const teacherLessonsOnDay = getTeacherPeriodsOnDay(asg.teacherId, day);

            if (
              existingPjOnDay.length === 0 && // 严格保证当天只有 1 节 PJ
              !classSlotOccupied.has(cKey) &&
              !teacherSlotOccupied.has(tKey) &&
              canTeacherTakeSlot(asg.teacherId, day, p, teacherLessonsOnDay)
            ) {
              foundPeriod = p;
              break;
            }
          }

          if (foundPeriod !== null) {
            chosenSlots.push({ day, period: foundPeriod });
          }
        }

        // 若该组星期组合（如 1,3,5 或 1,2,4 或 1,3,4）全部找到空位，立即锁定！
        if (chosenSlots.length === pattern.length) {
          const teacherObj = teacherMap.get(asg.teacherId);
          chosenSlots.forEach(({ day, period }) => {
            classSlotOccupied.add(`${cls.classId}_${day}_${period}`);
            teacherSlotOccupied.add(`${asg.teacherId}_${day}_${period}`);
            incTeacherDayCount(asg.teacherId, day);
            addTeacherPeriodOnDay(asg.teacherId, day, period);
            recordSubjectPeriod(cls.classId, asg.canonicalSubjectCode, day, period);

            lessons.push({
              id: `pj_${cls.classId}_${day}_P${period}`,
              day,
              periodNumber: period,
              classId: cls.classId,
              className: cls.className,
              subjectCode: 'PJ',
              subjectName: asg.subjectName || 'Pendidikan Jasmani',
              teacherId: asg.teacherId,
              teacherName: teacherObj?.fullName || asg.teacherId,
              countsAsClassPeriod: true,
              countsAsTeacherPeriod: true,
            });
          });

          scheduled += chosenSlots.length;
          scheduledPerAssignment.set(asg.assignmentId, scheduled);
          break;
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // STEP 2A: PM 与 PAI 同节绑定排课 (Waktu Serentak PM / PAI)
  // --------------------------------------------------------------------------
  nonPrasekolahClasses.forEach((cls) => {
    const pmAsg = academicAndPjAssignments.find(
      (a) => a.classId === cls.classId && isPairedMoralIslam(a.canonicalSubjectCode) === 'PM'
    );
    const paiAsg = academicAndPjAssignments.find(
      (a) => a.classId === cls.classId && isPairedMoralIslam(a.canonicalSubjectCode) === 'PAI'
    );

    // 如果该班同时配有 PM 与 PAI，将它们锁定在完全相同的节次（2+2 或 2+2+1）
    if (pmAsg && paiAsg) {
      const required = Math.max(pmAsg.effectiveWeeklyPeriods, paiAsg.effectiveWeeklyPeriods);
      let scheduled = 0;

      for (const day of DAYS_OF_WEEK) {
        if (scheduled >= required) break;
        const maxP = getDailyMaxPeriods(day, resolveClassLevel(cls));
        const remaining = required - scheduled;
        const blockLen = remaining >= 2 ? 2 : 1;

        for (let p = 1; p <= maxP - blockLen + 1; p++) {
          if (blockLen === 2 && !isAdjacentPeriod(p, p + 1)) continue;

          const periodsToBook = blockLen === 2 ? [p, p + 1] : [p];
          const canBookAll = periodsToBook.every((per, idx) => {
            const cKey = `${cls.classId}_${day}_${per}`;
            const pmTKey = `${pmAsg.teacherId}_${day}_${per}`;
            const paiTKey = `${paiAsg.teacherId}_${day}_${per}`;

            if (classSlotOccupied.has(cKey) || teacherSlotOccupied.has(pmTKey) || teacherSlotOccupied.has(paiTKey)) {
              return false;
            }

            const pmDayPeriods = getTeacherPeriodsOnDay(pmAsg.teacherId, day);
            const paiDayPeriods = getTeacherPeriodsOnDay(paiAsg.teacherId, day);

            const pmCan = canTeacherTakeSlot(
              pmAsg.teacherId,
              day,
              per,
              idx === 0 ? pmDayPeriods : [...pmDayPeriods, periodsToBook[0]]
            );
            const paiCan = canTeacherTakeSlot(
              paiAsg.teacherId,
              day,
              per,
              idx === 0 ? paiDayPeriods : [...paiDayPeriods, periodsToBook[0]]
            );

            return pmCan && paiCan;
          });

          if (canBookAll) {
            const pmTeacher = teacherMap.get(pmAsg.teacherId);
            const paiTeacher = teacherMap.get(paiAsg.teacherId);

            periodsToBook.forEach((per) => {
              classSlotOccupied.add(`${cls.classId}_${day}_${per}`);
              teacherSlotOccupied.add(`${pmAsg.teacherId}_${day}_${per}`);
              teacherSlotOccupied.add(`${paiAsg.teacherId}_${day}_${per}`);
              incTeacherDayCount(pmAsg.teacherId, day);
              incTeacherDayCount(paiAsg.teacherId, day);
              addTeacherPeriodOnDay(pmAsg.teacherId, day, per);
              addTeacherPeriodOnDay(paiAsg.teacherId, day, per);
              recordSubjectPeriod(cls.classId, 'PM', day, per);
              recordSubjectPeriod(cls.classId, 'PAI', day, per);

              // 主记录：PM（计入班级节数 + 计入 PM 老师节数，课表显示 PM/PAI）
              const pmLessonId = `lesson_${cls.classId}_PM_${day}_P${per}`;
              lessons.push({
                id: pmLessonId,
                day,
                periodNumber: per,
                classId: cls.classId,
                className: cls.className,
                subjectCode: 'PM/PAI',
                subjectName: 'Pendidikan Moral / Pendidikan Islam',
                teacherId: pmAsg.teacherId,
                teacherName: `${pmTeacher?.fullName || pmAsg.teacherId} / ${paiTeacher?.fullName || paiAsg.teacherId}`,
                countsAsClassPeriod: true,
                countsAsTeacherPeriod: true,
              });

              // 并行记录：PAI（不重复计入班级节数，但计入 PAI 宗教老师节数）
              lessons.push({
                id: `parallel_${cls.classId}_PAI_${day}_P${per}`,
                day,
                periodNumber: per,
                classId: cls.classId,
                className: cls.className,
                subjectCode: 'PAI',
                subjectName: 'Pendidikan Agama Islam',
                teacherId: paiAsg.teacherId,
                teacherName: paiTeacher?.fullName || paiAsg.teacherId,
                parentTimetableSlotId: pmLessonId,
                countsAsClassPeriod: false,
                countsAsTeacherPeriod: true,
              });
            });

            scheduled += periodsToBook.length;
            break;
          }
        }
      }

      scheduledPerAssignment.set(pmAsg.assignmentId, scheduled);
      scheduledPerAssignment.set(paiAsg.assignmentId, scheduled);
    }
  });

  // --------------------------------------------------------------------------
  // STEP 2B: SCHEDULE ALAM DAN MANUSIA (AM) WITH CO-TEACHING (2 TEACHERS SIMULTANEOUSLY)
  // --------------------------------------------------------------------------
  nonPrasekolahClasses.forEach((cls) => {
    const classAmAssignments = normalizedAssignments.filter(
      (a) => a.classId === cls.classId && isAMSubject(a.canonicalSubjectCode, a.subjectName)
    );

    classAmAssignments.forEach((asg) => {
      const teacherId1 = asg.teacherId;
      const teacherId2 = (asg as any).secondaryTeacherId || (asg as any).coTeacherId;
      const required = asg.effectiveWeeklyPeriods || 3;
      let scheduled = scheduledPerAssignment.get(asg.assignmentId) || 0;

      if (scheduled >= required) return;

      const t1 = teacherMap.get(teacherId1);
      const t2 = teacherId2 ? teacherMap.get(teacherId2) : null;
      const combinedTeacherName = t2
        ? `${t1?.fullName || teacherId1} / ${t2.fullName || teacherId2}`
        : (t1?.fullName || teacherId1);

      for (const day of DAYS_OF_WEEK) {
        if (scheduled >= required) break;
        const maxP = getDailyMaxPeriods(day, resolveClassLevel(cls));

        for (let p = 1; p <= maxP; p++) {
          if (scheduled >= required) break;

          const cKey = `${cls.classId}_${day}_${p}`;
          const t1Key = `${teacherId1}_${day}_${p}`;
          const t2Key = teacherId2 ? `${teacherId2}_${day}_${p}` : null;

          // 必须班级有空，且老师 1 和老师 2 都有空
          const classFree = !classSlotOccupied.has(cKey);
          const t1Free = !teacherSlotOccupied.has(t1Key);
          const t2Free = t2Key ? !teacherSlotOccupied.has(t2Key) : true;

          // 检查两位老师当天是否未满 8 节且符合休息规则
          const t1Lessons = getTeacherPeriodsOnDay(teacherId1, day);
          const t2Lessons = teacherId2 ? getTeacherPeriodsOnDay(teacherId2, day) : [];
          const t1Valid = canTeacherTakeSlot(teacherId1, day, p, t1Lessons);
          const t2Valid = teacherId2 ? canTeacherTakeSlot(teacherId2, day, p, t2Lessons) : true;

          if (classFree && t1Free && t2Free && t1Valid && t2Valid) {
            // 1. 锁定班级与两位老师的时段
            classSlotOccupied.add(cKey);
            teacherSlotOccupied.add(t1Key);
            incTeacherDayCount(teacherId1, day);
            addTeacherPeriodOnDay(teacherId1, day, p);

            if (t2Key && teacherId2) {
              teacherSlotOccupied.add(t2Key);
              incTeacherDayCount(teacherId2, day);
              addTeacherPeriodOnDay(teacherId2, day, p);
            }

            recordSubjectPeriod(cls.classId, 'AM', day, p);
            scheduled++;

            const lessonId = `am_${cls.classId}_${day}_P${p}`;

            // 班级课表条目（显示两位老师名字）
            lessons.push({
              id: lessonId,
              day,
              periodNumber: p,
              classId: cls.classId,
              className: cls.className,
              subjectCode: 'AM',
              subjectName: 'Alam dan Manusia',
              teacherId: teacherId1,
              teacherName: combinedTeacherName,
              countsAsClassPeriod: true,
              countsAsTeacherPeriod: true, // 计入老师 1 节数
            });

            // 老师 2 专属条目（计入老师 2 个人课表与执教节数）
            if (teacherId2 && t2) {
              lessons.push({
                id: `co_am_${cls.classId}_${day}_P${p}`,
                day,
                periodNumber: p,
                classId: cls.classId,
                className: cls.className,
                subjectCode: 'AM',
                subjectName: 'Alam dan Manusia (Co-Teaching)',
                teacherId: teacherId2,
                teacherName: t2.fullName,
                parentTimetableSlotId: lessonId,
                countsAsClassPeriod: false, // 班级不重复计节
                countsAsTeacherPeriod: true, // 计入老师 2 节数
              });
            }
          }
        }
      }

      scheduledPerAssignment.set(asg.assignmentId, scheduled);
    });
  });

  // --------------------------------------------------------------------------
  // STEP 3: SCHEDULE REMAINING CORE ACADEMIC SUBJECTS (BC, BM, BI, MT, SN, etc.)
  // --------------------------------------------------------------------------
  const remainingAssignments = academicAndPjAssignments.filter((a) => {
    const isPj = isPJSubject(a.canonicalSubjectCode, a.subjectName);
    const isPmOrPai = isPairedMoralIslam(a.canonicalSubjectCode);
    return !isPj && !isPmOrPai;
  });

  // 1. Calculate global teacher workload across all assignments to implement "Heaviest-Workload Teacher First"
  const teacherTotalWorkload = new Map<string, number>();
  normalizedAssignments.forEach((a) => {
    const w = a.effectiveWeeklyPeriods || 0;
    if (a.teacherId) {
      teacherTotalWorkload.set(a.teacherId, (teacherTotalWorkload.get(a.teacherId) || 0) + w);
    }
    const secT = (a as any).secondaryTeacherId || (a as any).coTeacherId;
    if (secT) {
      teacherTotalWorkload.set(secT, (teacherTotalWorkload.get(secT) || 0) + w);
    }
  });

  // Sort globally by Heaviest-Workload Teacher First, then by assignment periods
  remainingAssignments.sort((a, b) => {
    const tLoadA = teacherTotalWorkload.get(a.teacherId) || 0;
    const tLoadB = teacherTotalWorkload.get(b.teacherId) || 0;
    if (tLoadB !== tLoadA) {
      return tLoadB - tLoadA; // Heaviest-Workload Teacher First!
    }
    return b.effectiveWeeklyPeriods - a.effectiveWeeklyPeriods;
  });

  remainingAssignments.forEach((asg) => {
    const required = asg.effectiveWeeklyPeriods;
    let scheduled = scheduledPerAssignment.get(asg.assignmentId) || 0;
    const teacherObj = teacherMap.get(asg.teacherId);
    const clsObj = nonPrasekolahClasses.find((c) => c.classId === asg.classId);
    const classLevel = resolveClassLevel(clsObj || { className: asg.className });

    // Distribute into 2-period and 1-period blocks
    const blocks: number[] = [];
    let rem = required - scheduled;
    while (rem > 0) {
      if (rem >= 2) {
        blocks.push(2);
        rem -= 2;
      } else {
        blocks.push(1);
        rem -= 1;
      }
    }

    // Track days used for this assignment to spread across the week (1 block per day)
    const usedDaysForSubject = new Set<string>();

    blocks.forEach((blockLen) => {
      let placed = false;

      // 优先选择该班本科目尚未排课的星期几，实现周内均匀分布
      const dayCandidates = [
        ...DAYS_OF_WEEK.filter((d) => !usedDaysForSubject.has(d)),
        ...DAYS_OF_WEEK.filter((d) => usedDaysForSubject.has(d)),
      ];

      // 阶段 1: 严格满足 teacher rest breaks 和 daily max 8 节
      // 阶段 2: 若严格空档无法排下，适度放宽空档以保证不缺课
      for (const strictBreaks of [true, false]) {
        if (placed) break;

        for (const day of dayCandidates) {
          if (placed) break;
          const maxP = getDailyMaxPeriods(day, classLevel);

          for (let p = 1; p <= maxP - blockLen + 1; p++) {
            const periodsToBook = blockLen === 2 ? [p, p + 1] : [p];

            const canBook = periodsToBook.every((per, idx) => {
              const cKey = `${asg.classId}_${day}_${per}`;
              const tKey = `${asg.teacherId}_${day}_${per}`;
              if (classSlotOccupied.has(cKey) || teacherSlotOccupied.has(tKey)) {
                return false;
              }
              if (!strictBreaks) return true;
              const current = getTeacherPeriodsOnDay(asg.teacherId, day);
              return canTeacherTakeSlot(
                asg.teacherId,
                day,
                per,
                idx === 0 ? current : [...current, periodsToBook[0]]
              );
            });

            if (canBook) {
              periodsToBook.forEach((per) => {
                classSlotOccupied.add(`${asg.classId}_${day}_${per}`);
                teacherSlotOccupied.add(`${asg.teacherId}_${day}_${per}`);
                incTeacherDayCount(asg.teacherId, day);
                addTeacherPeriodOnDay(asg.teacherId, day, per);
                recordSubjectPeriod(asg.classId, asg.canonicalSubjectCode, day, per);

                lessons.push({
                  id: `lesson_${asg.classId}_${asg.canonicalSubjectCode}_${day}_P${per}`,
                  day,
                  periodNumber: per,
                  classId: asg.classId,
                  className: asg.className,
                  subjectCode: asg.canonicalSubjectCode,
                  subjectName: asg.subjectName,
                  teacherId: asg.teacherId,
                  teacherName: teacherObj?.fullName || asg.teacherId,
                  countsAsClassPeriod: true,
                  countsAsTeacherPeriod: true,
                });
              });

              usedDaysForSubject.add(day);
              scheduled += blockLen;
              placed = true;
              break;
            }
          }
        }
      }
    });

    scheduledPerAssignment.set(asg.assignmentId, scheduled);
  });

  // --------------------------------------------------------------------------
  // 3. PEMULIHAN (辅导课) 2+1+1 分布与“优先抽连堂第2节”算法
  // --------------------------------------------------------------------------
  pemulihanAssignmentsList.forEach((pAsg) => {
    const required = pAsg.effectiveWeeklyPeriods || 4; // 通常是 4 节
    const parentCode = (
      pAsg.assignmentType === 'PBM' ||
      pAsg.canonicalSubjectCode === 'PBM' ||
      pAsg.subjectName?.toUpperCase().includes('BM') ||
      pAsg.subjectName?.toUpperCase().includes('MELAYU')
    ) ? 'BM' : 'MT';

    // 找出该班所有的数学/马来文正课
    const parentLessons = lessons
      .filter(
        (l) =>
          !l.isPemulihan &&
          !l.isPN &&
          l.classId === pAsg.classId &&
          (l.subjectCode.toUpperCase() === parentCode || l.subjectCode.toUpperCase().startsWith(parentCode))
      )
      .sort((a, b) => DAYS_OF_WEEK.indexOf(a.day as any) - DAYS_OF_WEEK.indexOf(b.day as any) || a.periodNumber - b.periodNumber);

    // 识别某节课是否为连堂课的“第二节”
    const isSecondOfDoubleBlock = (lesson: any) =>
      parentLessons.some(
        (other) =>
          other.day === lesson.day &&
          other.periodNumber === lesson.periodNumber - 1 &&
          isAdjacentPeriod(other.periodNumber, lesson.periodNumber)
      );

    const selectedSlots: any[] = [];
    const dayAllocationCount = new Map<string, number>();

    // 若辅导为 4 节：严格采用 2 + 1 + 1 结构（1个连堂日 + 2个单节课日，避免 2 + 2）
    if (required === 4) {
      // 步骤 A: 优先寻找 1 个合适的连堂组合 (2 节)
      for (const l1 of parentLessons) {
        if (selectedSlots.length >= 2) break;
        const l2 = parentLessons.find(
          (cand) => cand.day === l1.day && cand.periodNumber === l1.periodNumber + 1 && isAdjacentPeriod(l1.periodNumber, cand.periodNumber)
        );
        if (l2) {
          const tKey1 = `${pAsg.teacherId}_${l1.day}_${l1.periodNumber}`;
          const tKey2 = `${pAsg.teacherId}_${l2.day}_${l2.periodNumber}`;
          if (!teacherSlotOccupied.has(tKey1) && !teacherSlotOccupied.has(tKey2)) {
            selectedSlots.push(l1, l2);
            dayAllocationCount.set(l1.day, 2);
            break;
          }
        }
      }

      // 步骤 B: 寻找剩余的 2 个单节，严格跨另外 2 个不同天，且若是连堂必须抽“第二节”
      for (const l of parentLessons) {
        if (selectedSlots.length >= 4) break;
        if (dayAllocationCount.has(l.day)) continue; // 严防 2+2，已排过的天不再排

        // 核心法则：如果这天是连堂，优先抽第二节，避免打乱科任老师导课
        const isFirstOfDouble = parentLessons.some(
          (cand) => cand.day === l.day && cand.periodNumber === l.periodNumber + 1 && isAdjacentPeriod(l.periodNumber, cand.periodNumber)
        );
        if (isFirstOfDouble && !isSecondOfDoubleBlock(l)) {
          continue; // 跳过第 1 节，留给第 2 节去抽
        }

        const tKey = `${pAsg.teacherId}_${l.day}_${l.periodNumber}`;
        if (!teacherSlotOccupied.has(tKey)) {
          selectedSlots.push(l);
          dayAllocationCount.set(l.day, 1);
        }
      }
    }

    // 若非 4 节或尚未集齐：弹性填充剩余节数
    if (selectedSlots.length < required) {
      for (const l of parentLessons) {
        if (selectedSlots.length >= required) break;
        if (selectedSlots.some((s) => s.id === l.id)) continue;
        const tKey = `${pAsg.teacherId}_${l.day}_${l.periodNumber}`;
        if (!teacherSlotOccupied.has(tKey)) {
          selectedSlots.push(l);
        }
      }
    }

    // 落地生成辅导排课记录
    selectedSlots.forEach((parent) => {
      teacherSlotOccupied.add(`${pAsg.teacherId}_${parent.day}_${parent.periodNumber}`);
      incTeacherDayCount(pAsg.teacherId, parent.day);
      addTeacherPeriodOnDay(pAsg.teacherId, parent.day, parent.periodNumber);

      lessons.push({
        id: `pemulihan_${pAsg.classId}_${parentCode}_${parent.day}_P${parent.periodNumber}`,
        day: parent.day,
        periodNumber: parent.periodNumber,
        classId: pAsg.classId,
        className: pAsg.className,
        subjectCode: pAsg.canonicalSubjectCode,
        subjectName: pAsg.subjectName || `Pemulihan ${parentCode}`,
        teacherId: pAsg.teacherId,
        teacherName: teacherMap.get(pAsg.teacherId)?.fullName || pAsg.teacherId,
        isPemulihan: true,
        parentTimetableSlotId: parent.id,
        countsAsClassPeriod: false, // 不占班级总节数
        countsAsTeacherPeriod: true, // 计入辅导老师节数
      });
    });

    scheduledPerAssignment.set(pAsg.assignmentId, selectedSlots.length);
  });

  // --------------------------------------------------------------------------
  // 4. PROGRAM TASMIK (100% MANUAL ARRANGEMENT — EXCLUDED FROM AUTO-SCHEDULING)
  // TASMIK is completely excluded from automated placement; Slot Khas Tasmik is seeded
  // post-school for manual click-assignment by Principal / PKP.
  // --------------------------------------------------------------------------
  tasmikAssignments.forEach((tAsg) => {
    scheduledPerAssignment.set(tAsg.assignmentId, 0);
  });

  // --------------------------------------------------------------------------
  // STEP 5: 自动将每日 PKAR (0.5 节) 绑定给“下课前那一节”的进班老师，并计入 +0.5 节工作量
  // --------------------------------------------------------------------------
  const finalLessons = autoPairPKARWithPreRecessTeacher(
    lessons,
    DAYS_OF_WEEK as any,
    (teacherId, day, delta) => incTeacherDayCount(teacherId, day, delta)
  );

  let unplacedCount = 0;
  normalizedAssignments.forEach((asg) => {
    // Exclude manual TASMIK and auto PKAR from unplacedCount
    if (isTasmikSubject(asg.canonicalSubjectCode, asg.subjectName) || isPKARSubject(asg.canonicalSubjectCode, asg.subjectName)) {
      return;
    }
    const req = asg.effectiveWeeklyPeriods;
    const sch = scheduledPerAssignment.get(asg.assignmentId) || 0;
    if (sch < req) {
      unplacedCount += req - sch;
    }
  });

  return { lessons: finalLessons, scheduledPerAssignment, unplacedCount };
}

export default runTimetableEngine;
