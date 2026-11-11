/**
 * iSEPADU AI — Timetable Scheduling Engine
 * Supports:
 * 1. PJ Strict Max 1 Period/Day (Triplets: 1,3,5 / 1,2,4 / 1,3,4 for 3 periods; Pairs for 2 periods)
 * 2. Parallel Binding for Pendidikan Moral (PM) & Pendidikan Agama Islam (PAI) (Waktu Serentak PM / PAI)
 * 3. Program Tasmik (TASMIK) 2 periods/week strictly post-school on Wednesday, Thursday, Friday (1+1)
 * 4. KPM Curriculum Workload & Clash Prevention
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
  teacherId: string;
  effectiveWeeklyPeriods: number;
}

// --------------------------------------------------------------------------
// 1. 识别 PM / PAI 绑定科目 与 Program Tasmik (TASMIK)
// --------------------------------------------------------------------------
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

// --------------------------------------------------------------------------
// 2. STEP 1: 排体育课 PJ（每天严格限 1 节，3节按 1,3,5 / 1,2,4 / 1,3,4；2节隔天）
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

// 每个交易日在上午下课前可排 PJ 的节次（避开周一第1节周会，每日严禁排超过1节）
export const getMorningPJCandidates = (day: string): number[] => {
  if (day === 'ISNIN') {
    return [2, 3, 4]; // 周一第1节为周会 (Perhimpunan)
  }
  return [1, 2, 3, 4];
};

export const getDailyMaxPeriods = (day: string): number => {
  if (day === 'JUMAAT') return 8;
  return 10;
};

export const isAdjacentPeriod = (p1: number, p2: number): boolean => {
  return p2 === p1 + 1;
};

// --------------------------------------------------------------------------
// STEP 5: SCHEDULE PROGRAM TASMIK (2 PERIODS/WEEK -> PICK 2 DAYS FROM WED, THU, FRI)
// 1 period per day (1 + 1), strictly placed in the first post-dismissal slot
// --------------------------------------------------------------------------
export const tasmikCandidateDays = ['RABU', 'KHAMIS', 'JUMAAT'] as const;

// 根据年级与年份获取拜三、拜四、拜五放学后的紧接节次
export const getPostDismissalSlotForTasmik = (
  day: 'RABU' | 'KHAMIS' | 'JUMAAT' | string,
  yearLevelStr: string,
  acadYearStr: string
): number => {
  const gradeNum = parseInt(yearLevelStr.replace(/\D/g, ''), 10) || 1;
  const yr = parseInt(acadYearStr, 10) || 2027;
  const isKP2027 = yr >= 2027 && gradeNum <= yr - 2026;

  if (day === 'JUMAAT') {
    // 星期五正课 8 节结束，放学后紧接第 9 节
    return 9;
  }
  // 星期三、星期四：KP2027 低年级正课 9 节结束 -> 放学后为第 10 节；KSSR 正课 10 节结束 -> 放学后为第 11 节
  return isKP2027 && gradeNum <= 2 ? 10 : 11;
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

  const incTeacherDayCount = (teacherId: string, day: string) => {
    const key = `${teacherId}_${day}`;
    teacherDayPeriodCounts.set(key, (teacherDayPeriodCounts.get(key) || 0) + 1);
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
  const normalizedAssignments = assignments.map((a) => ({
    ...a,
    canonicalSubjectCode: a.canonicalSubjectCode?.toUpperCase() || '',
  }));

  // Separate assignments
  const academicAndPjAssignments = normalizedAssignments.filter(
    (a) => !isTasmikSubject(a.canonicalSubjectCode, a.subjectName)
  );

  // --------------------------------------------------------------------------
  // STEP 0: Lock Perhimpunan (PN) - Monday Period 1 for all classes
  // --------------------------------------------------------------------------
  nonPrasekolahClasses.forEach((cls) => {
    const cKey = `${cls.classId}_ISNIN_1`;
    classSlotOccupied.add(cKey);
    recordSubjectPeriod(cls.classId, 'PN', 'ISNIN', 1);

    lessons.push({
      id: `pn_${cls.classId}_ISNIN_P1`,
      day: 'ISNIN',
      periodNumber: 1,
      classId: cls.classId,
      className: cls.className,
      subjectCode: 'PN',
      subjectName: 'Perhimpunan Rasmi',
      teacherId: 'GURU_BERTUGAS',
      teacherName: 'Guru Bertugas Mingguan',
      countsAsClassPeriod: true,
      countsAsTeacherPeriod: false,
    });
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

            if (
              existingPjOnDay.length === 0 && // 严格保证当天只有 1 节 PJ
              !classSlotOccupied.has(cKey) &&
              !teacherSlotOccupied.has(tKey)
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
        const maxP = getDailyMaxPeriods(day);
        const remaining = required - scheduled;
        const blockLen = remaining >= 2 ? 2 : 1;

        for (let p = 1; p <= maxP - blockLen + 1; p++) {
          if (blockLen === 2 && !isAdjacentPeriod(p, p + 1)) continue;

          const periodsToBook = blockLen === 2 ? [p, p + 1] : [p];
          const canBookAll = periodsToBook.every((per) => {
            const cKey = `${cls.classId}_${day}_${per}`;
            const pmTKey = `${pmAsg.teacherId}_${day}_${per}`;
            const paiTKey = `${paiAsg.teacherId}_${day}_${per}`;
            return (
              !classSlotOccupied.has(cKey) &&
              !teacherSlotOccupied.has(pmTKey) &&
              !teacherSlotOccupied.has(paiTKey)
            );
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
  // STEP 3: SCHEDULE REMAINING CORE ACADEMIC SUBJECTS (BC, BM, BI, MT, SN, etc.)
  // --------------------------------------------------------------------------
  const remainingAssignments = academicAndPjAssignments.filter((a) => {
    const isPj = isPJSubject(a.canonicalSubjectCode, a.subjectName);
    const isPmOrPai = isPairedMoralIslam(a.canonicalSubjectCode);
    return !isPj && !isPmOrPai;
  });

  // Sort by workload (highest periods first)
  remainingAssignments.sort((a, b) => b.effectiveWeeklyPeriods - a.effectiveWeeklyPeriods);

  remainingAssignments.forEach((asg) => {
    const required = asg.effectiveWeeklyPeriods;
    let scheduled = scheduledPerAssignment.get(asg.assignmentId) || 0;
    const teacherObj = teacherMap.get(asg.teacherId);

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

    blocks.forEach((blockLen) => {
      let placed = false;

      for (const day of DAYS_OF_WEEK) {
        if (placed) break;
        const maxP = getDailyMaxPeriods(day);

        // Try consecutive periods
        for (let p = 1; p <= maxP - blockLen + 1; p++) {
          const periodsToBook = blockLen === 2 ? [p, p + 1] : [p];

          const canBook = periodsToBook.every((per) => {
            const cKey = `${asg.classId}_${day}_${per}`;
            const tKey = `${asg.teacherId}_${day}_${per}`;
            return !classSlotOccupied.has(cKey) && !teacherSlotOccupied.has(tKey);
          });

          if (canBook) {
            periodsToBook.forEach((per) => {
              classSlotOccupied.add(`${asg.classId}_${day}_${per}`);
              teacherSlotOccupied.add(`${asg.teacherId}_${day}_${per}`);
              incTeacherDayCount(asg.teacherId, day);
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

            scheduled += blockLen;
            placed = true;
            break;
          }
        }
      }
    });

    scheduledPerAssignment.set(asg.assignmentId, scheduled);
  });

  // --------------------------------------------------------------------------
  // STEP 5: SCHEDULE PROGRAM TASMIK (2 PERIODS/WEEK -> PICK 2 DAYS FROM WED, THU, FRI)
  // 1 period per day (1 + 1), strictly placed in the first post-dismissal slot
  // --------------------------------------------------------------------------
  const tasmikAssignments = normalizedAssignments.filter((a) =>
    isTasmikSubject(a.canonicalSubjectCode, a.subjectName)
  );

  tasmikAssignments.forEach((tAsg) => {
    const required = tAsg.effectiveWeeklyPeriods || 2; // 每周 2 节 (拆成 2 天: 1 + 1)
    const clsObj = nonPrasekolahClasses.find((c) => c.classId === tAsg.classId);
    const yearLevelStr = clsObj?.yearLevel || tAsg.className || '1';
    const teacherObj = teacherMap.get(tAsg.teacherId);

    let scheduled = 0;
    const usedDaysForClass = new Set<string>();

    // 优先从 (拜三+拜四)、(拜三+拜五)、(拜四+拜五) 组合中选出老师无冲突的 2 天（每天只排 1 节）
    for (const [day1, day2] of tasmikDayPairs) {
      const p1 = getPostDismissalSlotForTasmik(day1, yearLevelStr, academicYear);
      const p2 = getPostDismissalSlotForTasmik(day2, yearLevelStr, academicYear);

      const tKey1 = `${tAsg.teacherId}_${day1}_${p1}`;
      const tKey2 = `${tAsg.teacherId}_${day2}_${p2}`;

      if (!teacherSlotOccupied.has(tKey1) && !teacherSlotOccupied.has(tKey2)) {
        [
          { day: day1, period: p1 },
          { day: day2, period: p2 },
        ].forEach(({ day, period }) => {
          teacherSlotOccupied.add(`${tAsg.teacherId}_${day}_${period}`);
          incTeacherDayCount(tAsg.teacherId, day);
          usedDaysForClass.add(day);
          scheduled++;

          lessons.push({
            id: `tasmik_${tAsg.classId}_${day}_P${period}`,
            day,
            periodNumber: period,
            classId: tAsg.classId,
            className: tAsg.className,
            subjectCode: 'TASMIK',
            subjectName: 'Program Tasmik (Selepas Sekolah)',
            teacherId: tAsg.teacherId,
            teacherName: teacherObj?.fullName || tAsg.teacherId,
            countsAsClassPeriod: false, // 放学后时段，不占正课节数
            countsAsTeacherPeriod: true, // 计入 Ustaz / Ustazah 节数
          });
        });
        break;
      }
    }

    // 若同一位 Ustaz 教多个班级导致上述第 1 顺位已被占，仍在拜三、拜四、拜五中选择任意 2 个不同天（每天 1 节）
    if (scheduled < required) {
      for (const day of tasmikCandidateDays) {
        if (scheduled >= required) break;
        if (usedDaysForClass.has(day)) continue; // 严格保证同一班一天最多 1 节 Tasmik

        const baseP = getPostDismissalSlotForTasmik(day, yearLevelStr, academicYear);
        // 优先排紧接放学的第一节；若该老师同天已带另一班 Tasmik（或合班），自动匹配可用放学槽
        for (const p of [baseP, baseP + 1]) {
          const tKey = `${tAsg.teacherId}_${day}_${p}`;
          if (!teacherSlotOccupied.has(tKey)) {
            teacherSlotOccupied.add(tKey);
            incTeacherDayCount(tAsg.teacherId, day);
            usedDaysForClass.add(day);
            scheduled++;

            lessons.push({
              id: `tasmik_${tAsg.classId}_${day}_P${p}`,
              day,
              periodNumber: p,
              classId: tAsg.classId,
              className: tAsg.className,
              subjectCode: 'TASMIK',
              subjectName: 'Program Tasmik (Selepas Sekolah)',
              teacherId: tAsg.teacherId,
              teacherName: teacherObj?.fullName || tAsg.teacherId,
              countsAsClassPeriod: false,
              countsAsTeacherPeriod: true,
            });
            break;
          }
        }
      }
    }

    scheduledPerAssignment.set(tAsg.assignmentId, scheduled);
  });

  let unplacedCount = 0;
  normalizedAssignments.forEach((asg) => {
    const req = asg.effectiveWeeklyPeriods;
    const sch = scheduledPerAssignment.get(asg.assignmentId) || 0;
    if (sch < req) {
      unplacedCount += req - sch;
    }
  });

  return { lessons, scheduledPerAssignment, unplacedCount };
}

export default runTimetableEngine;
