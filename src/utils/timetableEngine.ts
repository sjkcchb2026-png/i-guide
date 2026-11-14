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
export function getDayPeriodConfig(day: string, classLevel: number = 2, academicYear: string = '2027') {
  const isKP2027Year1 = !academicYear || parseInt(academicYear, 10) >= 2027;
  const isT1 = classLevel === 1 && isKP2027Year1;
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

// 每日正课全额开放排课，放学后额外附加 1 个 Tasmik 手动点击格
export function getDayScheduleBounds(day: string, classLevel: number, academicYear: string = '2027') {
  const cfg = getDayPeriodConfig(day, classLevel, academicYear);
  return {
    maxAutoPeriod: cfg.teachingPeriods,
    preRecessPeriod: cfg.preRecessPeriod,
    manualTasmikSlot: cfg.tasmikManualPeriod,
  };
}

// 自动排课队列彻底过滤掉 TASMIK 与 Program Membaca（留作纯手动编排）
export function filterAutoSchedulableAssignments(assignments: any[]) {
  return assignments.filter((asg) => {
    const code = String(asg.canonicalSubjectCode || asg.subjectCode || '').toUpperCase();
    // TASMIK、MEMBACA、以及自动跟随下课前老师的 PKAR 均不进入常规抢格队列
    return code !== 'TASMIK' && code !== 'MEMBACA' && !code.startsWith('PKAR');
  });
}

const MAJOR_LANGUAGES = new Set(['BC', 'BM', 'BI']);
const EXCLUDED_DAILY_SUBJECT_CODES = new Set(['PN', 'MEMBACA', 'PKAR', 'TASMIK', 'TAS']);

// 1. 按低年级 (Tahap 1: 最多4科) 与高年级 (Tahap 2: 最多6科) 返回每日科目数上限
export function getMaxSubjectsPerDay(classLevel: number): number {
  return classLevel <= 3 ? 4 : 6;
}

// 2. 仅允许华/巫/英 (BC, BM, BI) 单日最多排 3 节，其余科目严格限制 <= 2 节
export function getMaxDailyPeriodsForSubject(subjectCode: string): number;
export function getMaxDailyPeriodsForSubject(weeklyPeriods: number, subjectCode: string): number;
export function getMaxDailyPeriodsForSubject(arg1: string | number, arg2?: string): number {
  const rawCode = typeof arg1 === 'string' ? arg1 : (arg2 || '');
  const code = rawCode.trim().toUpperCase();
  if (MAJOR_LANGUAGES.has(code)) return 3;
  if (['PJ', 'PK', 'MZ', 'PN'].includes(code)) return 1;
  return 2; // MT, SN, PM, PAI, PM/PAI, PSV, RBT, SEJ, AM 等单日最多 2 节
}

export function isMajorLanguageSubject(subjectCode: string): boolean {
  return MAJOR_LANGUAGES.has((subjectCode || '').trim().toUpperCase());
}

export function countDistinctSubjectsOnDay(currentClassDayLessons: any[]): number {
  const distinct = new Set<string>();
  currentClassDayLessons.forEach((l) => {
    if (!l || l.isPemulihan || !l.subjectCode) return;
    const c = String(l.subjectCode).trim().toUpperCase();
    if (!c || EXCLUDED_DAILY_SUBJECT_CODES.has(c) || c.startsWith('PKAR')) return;
    distinct.add(c);
  });
  return distinct.size;
}

// 3. 反碎片化拆分器：让科目高度集中，绝不拆散
export function decomposeSubjectCompactly(
  subjectCode: string,
  weeklyPeriods: number,
  classLevel: number = 4
): number[] {
  const code = subjectCode.trim().toUpperCase();
  const p = Math.round(weeklyPeriods);
  if (p <= 0) return [];

  // 体育 (PJ)：拆为独立单节 (二至六年级强制隔天)
  if (code === 'PJ') return Array(p).fill(1);

  // 美术 (PSV)、工艺 (RBT)、历史 (SEJ) 2节：强制连堂，绝不拆散
  if (['PSV', 'RBT', 'SEJ'].includes(code) && p === 2) return [2];

  // PM / PAI 严格禁止拆散为单节（5节=[2,2,1]，4节=[2,2]，3节=[2,1]），减少教师每天 RPH 数量
  if (code === 'PM' || code === 'PAI' || code === 'PM/PAI') {
    switch (p) {
      case 5: return [2, 2, 1];
      case 4: return [2, 2];
      case 3: return [2, 1];
      case 2: return [2];
      case 1: return [1];
      default: {
        const blocks: number[] = [];
        let rem = p;
        while (rem >= 2) {
          blocks.push(2);
          rem -= 2;
        }
        if (rem === 1) blocks.push(1);
        return blocks;
      }
    }
  }

  // 三大语文科 (BC, BM, BI)：允许单日 3 节（即 2连堂 + 1单堂）以压缩天数
  if (MAJOR_LANGUAGES.has(code)) {
    if (p === 12) return [2, 1, 2, 1, 2, 2, 2]; // 分布 5 天，每天 2~3 节 (3+3+2+2+2)
    if (p === 11) return [2, 1, 2, 1, 2, 1, 2]; // 4 天排完 (3+3+3+2)
    if (p === 10) return classLevel <= 3 ? [2, 1, 2, 1, 2, 2] : [2, 2, 2, 2, 2]; // Tahap 1 压缩到4天 (3+3+2+2)
    if (p === 9)  return [2, 1, 2, 2, 2];       // 4 天排完 (3+2+2+2)
    if (p === 8)  return [2, 2, 2, 2];          // 4 天排完 (2+2+2+2)
    if (p === 7)  return [2, 1, 2, 2];          // 3 天排完 (3+2+2)
    if (p === 6)  return [2, 2, 2];             // 3 天排完 (2+2+2)
    if (p === 5)  return classLevel <= 3 ? [2, 1, 2] : [2, 2, 1]; // Tahap 1 压缩到2天 (3+2)
    if (p === 4)  return [2, 2];                // 2 天排完
    if (p === 3)  return [2, 1];                // 2 天排完
    if (p === 2)  return [2];
    if (p === 1)  return [1];
  }

  // 其他一般科目 (MT, SN, AM, PSV 等)：单日最多 2 节，绝不出现 1+1 拆散
  const blocks: number[] = [];
  let rem = p;
  while (rem >= 2) {
    blocks.push(2);
    rem -= 2;
  }
  if (rem === 1) blocks.push(1);
  return blocks;
}

// 统一对外兼容接口
export function decomposeSubjectBlocks(
  subjectCode: string,
  weeklyPeriods: number,
  classLevel: number = 4
): number[] {
  return decomposeSubjectCompactly(subjectCode, weeklyPeriods, classLevel);
}

// --------------------------------------------------------------------------
// 3A. 禁止同科 3 连堂 (BC/BM/BI 必须 2+1 分离) 与单日容量可行性死锁预防
// --------------------------------------------------------------------------
export function hasThreeConsecutiveSameSubject(
  existingPeriodPositions: number[],
  candidatePeriodPositions: number[] = []
): boolean {
  const combined = Array.from(new Set([...existingPeriodPositions, ...candidatePeriodPositions])).sort((a, b) => a - b);
  if (combined.length < 3) return false;
  for (let i = 0; i <= combined.length - 3; i++) {
    if (combined[i + 1] === combined[i] + 1 && combined[i + 2] === combined[i + 1] + 1) {
      return true;
    }
  }
  return false;
}

export interface SafeDayAssignParams {
  dayMaxPeriods: number;
  currentDayLessons: Array<{ subjectCode?: string; isPemulihan?: boolean; countsAsClassPeriod?: boolean }>;
  candidateSubjectCode: string;
  blockLength: number;
  classLevel: number;
  maxSubjectsOverride?: number;
  remainingSubjectPeriodsInWeek?: Map<string, number> | Record<string, number>;
}

/**
 * Fix A (Day-Capacity Feasibility Check):
 * Never place more than two 1-period single lessons on the same day in Tahap 1
 * unless the remaining periods of that day can be 100% filled by already-present subjects on that day.
 * Also prevents subject-cap deadlocks where maxSubjects is reached before day capacity can be filled.
 */
export function canSafelyAssignBlockToDay(params: SafeDayAssignParams): boolean {
  const {
    dayMaxPeriods,
    currentDayLessons,
    candidateSubjectCode,
    blockLength,
    classLevel,
    maxSubjectsOverride,
    remainingSubjectPeriodsInWeek,
  } = params;

  const code = candidateSubjectCode.trim().toUpperCase();
  if (EXCLUDED_DAILY_SUBJECT_CODES.has(code) || code.startsWith('PKAR')) {
    return true;
  }

  const counts = new Map<string, number>();
  let occupiedPeriods = 0;

  currentDayLessons.forEach((l) => {
    if (!l || l.isPemulihan || !l.subjectCode) return;
    if (l.countsAsClassPeriod === false) return;
    const c = String(l.subjectCode).trim().toUpperCase();
    if (!c) return;
    occupiedPeriods++;
    if (!EXCLUDED_DAILY_SUBJECT_CODES.has(c) && !c.startsWith('PKAR')) {
      counts.set(c, (counts.get(c) || 0) + 1);
    }
  });

  const prevCount = counts.get(code) || 0;
  counts.set(code, prevCount + blockLength);
  const occupiedAfter = occupiedPeriods + blockLength;
  const remainingEmpty = Math.max(0, dayMaxPeriods - occupiedAfter);
  if (remainingEmpty === 0) return true;

  const maxSubjects = maxSubjectsOverride ?? getMaxSubjectsPerDay(classLevel);
  const distinctAfter = counts.size;

  const getRemQuota = (sCode: string): number => {
    if (!remainingSubjectPeriodsInWeek) return 99;
    if (remainingSubjectPeriodsInWeek instanceof Map) {
      return remainingSubjectPeriodsInWeek.get(sCode) ?? 0;
    }
    return remainingSubjectPeriodsInWeek[sCode] ?? 0;
  };

  let fillableByExisting = 0;
  let singlePeriodSubjectCount = 0;
  counts.forEach((cnt, sCode) => {
    if (cnt === 1) singlePeriodSubjectCount++;
    const dailyCap = getMaxDailyPeriodsForSubject(sCode);
    const roomInDay = Math.max(0, dailyCap - cnt);
    const roomInWeek = remainingSubjectPeriodsInWeek
      ? Math.max(0, getRemQuota(sCode) - (sCode === code ? blockLength : 0))
      : roomInDay;
    fillableByExisting += Math.min(roomInDay, roomInWeek);
  });

  // Tahap 1 guard: avoid > 2 isolated single-period lessons unless existing subjects on day can fill remaining slots
  if (classLevel <= 3 && blockLength === 1 && prevCount === 0 && singlePeriodSubjectCount > 2) {
    if (fillableByExisting < remainingEmpty) {
      return false;
    }
  }

  // If maxSubjects cap is already filled, existing subjects MUST be able to fill remaining empty slots
  if (distinctAfter >= maxSubjects && fillableByExisting < remainingEmpty) {
    return false;
  }

  // General bound: each unadded subject up to maxSubjects can add at most 3 periods (BC/BM/BI max)
  const remainingSubjectSlots = Math.max(0, maxSubjects - distinctAfter);
  if (fillableByExisting + remainingSubjectSlots * 3 < remainingEmpty) {
    return false;
  }

  return true;
}

// 4. 排课前防碎片化与每日科目数检验函数 (严禁同科 3 连堂，3 节语文课必须 2+1 分离)
export function canAddSubjectToClassDay(
  currentClassDayLessons: any[],
  subjectCode: string,
  periodsToAdd: number,
  classLevel: number,
  options?: {
    maxSubjectsOverride?: number;
    candidatePeriodPositions?: number[];
    existingPeriodPositions?: number[];
  }
): boolean {
  const code = subjectCode.trim().toUpperCase();
  if (EXCLUDED_DAILY_SUBJECT_CODES.has(code) || code.startsWith('PKAR')) {
    return true;
  }

  // 绝不允许一次性排入连续 3 节同科目（3 节必须为 2 连堂 + 1 分离）
  if (periodsToAdd >= 3) {
    return false;
  }

  // 统计当天的纯学术科目种类数 (排除 PN, MEMBACA, PKAR, TASMIK)
  const existingSubjects = new Set<string>();
  let existingCountForThisSub = 0;

  currentClassDayLessons.forEach((l) => {
    if (!l || l.isPemulihan || !l.subjectCode) return;
    const c = String(l.subjectCode).trim().toUpperCase();
    if (!c || EXCLUDED_DAILY_SUBJECT_CODES.has(c) || c.startsWith('PKAR')) return;
    existingSubjects.add(c);
    if (c === code) existingCountForThisSub++;
  });

  // 规则 1: 若当天还没有这门课，检查科目总数是否超过低年级(4)/高年级(6)上限
  const maxSubjects = options?.maxSubjectsOverride ?? getMaxSubjectsPerDay(classLevel);
  if (existingCountForThisSub === 0 && existingSubjects.size >= maxSubjects) {
    return false;
  }

  // 规则 2: 检查该科目的单日节数上限 (BC/BM/BI 最多 3 节，其余最多 2 节，PJ/PK/MZ 最多 1 节)
  const maxDaily = getMaxDailyPeriodsForSubject(code);
  if (existingCountForThisSub + periodsToAdd > maxDaily) {
    return false;
  }

  // 规则 3: 防碎片化 + 严禁 3 连堂 (BC/BM/BI 3节必须 2+1 分离)
  if (existingCountForThisSub > 0) {
    if (existingCountForThisSub === 1 && periodsToAdd === 1) {
      if (options?.existingPeriodPositions && options?.candidatePeriodPositions) {
        const exPos = options.existingPeriodPositions[0];
        const candPos = options.candidatePeriodPositions[0];
        if (Math.abs(exPos - candPos) !== 1) {
          return false;
        }
      } else if (!MAJOR_LANGUAGES.has(code)) {
        return false;
      }
    }

    if (
      options?.existingPeriodPositions &&
      options?.candidatePeriodPositions &&
      options.existingPeriodPositions.length > 0 &&
      options.candidatePeriodPositions.length > 0
    ) {
      if (hasThreeConsecutiveSameSubject(options.existingPeriodPositions, options.candidatePeriodPositions)) {
        return false;
      }
      if (existingCountForThisSub + periodsToAdd === 3) {
        const combined = Array.from(
          new Set([...options.existingPeriodPositions, ...options.candidatePeriodPositions])
        ).sort((a, b) => a - b);
        const hasAdjacentPair =
          combined.length === 3 &&
          (combined[1] - combined[0] === 1 || combined[2] - combined[1] === 1);
        if (!hasAdjacentPair) {
          return false; // 绝不允许 1+1+1 完全打散
        }
      }
    } else if (existingCountForThisSub === 2 && periodsToAdd === 1) {
      if (options?.existingPeriodPositions && options.existingPeriodPositions.length === 2) {
        const sorted = [...options.existingPeriodPositions].sort((a, b) => a - b);
        if (sorted[1] - sorted[0] !== 1) {
          return false; // 现有 2 节不是连堂，绝不加第 3 节构成 1+1+1
        }
      }
    }
  }

  return true;
}

// 全局硬性守门员：在所有排课层级强制拦截超标与碎片化排课
export function canClassAcceptSubjectOnDay(
  currentClassDayLessons: any[], // 该班当天已排的所有课
  subjectCode: string,
  _weeklyPeriodsForThisSubject: number,
  periodsToAdd: number, // 本次准备排入的节数 (1, 2, 或 3)
  classLevel: number = 4,
  options?: {
    maxSubjectsOverride?: number;
    candidatePeriodPositions?: number[];
    existingPeriodPositions?: number[];
  }
): boolean {
  return canAddSubjectToClassDay(
    currentClassDayLessons,
    subjectCode,
    periodsToAdd,
    classLevel,
    options
  );
}

// --------------------------------------------------------------------------
// 一年级第 4 节 (紧邻 PKAR 0.5节) 防重复科任老师校验：每天换不同科目与老师，分摊负担
// --------------------------------------------------------------------------
export function canAssignYear1Period4(
  classLevel: number,
  targetPeriod: number,
  subjectCode: string,
  teacherId: string,
  existingYear1Period4Lessons: Array<{ day: string; subjectCode: string; teacherId: string }>,
  strictMode: boolean = true
): boolean {
  // 仅针对一年级 (Tahun 1) 的第 4 节 (PKAR 前置绑定节次)
  if (classLevel !== 1 || targetPeriod !== 4) return true;

  const normalizedTeacherId = (teacherId || '').trim();
  const sameSubjectCount = existingYear1Period4Lessons.filter(
    (l) => l.subjectCode === subjectCode
  ).length;
  const sameTeacherCount = normalizedTeacherId
    ? existingYear1Period4Lessons.filter(
        (l) => (l.teacherId || '').trim() === normalizedTeacherId
      ).length
    : 0;

  if (strictMode) {
    // 严格模式：周一至周五每天的第 4 节必须是完全不同的科目和不同的老师（每人最多带 1 次 PKAR +0.5）
    return sameSubjectCount === 0 && sameTeacherCount === 0;
  } else {
    // 次选模式：即使某位老师教两门课，一周内最多也只能排入一年级第 4 节不超过 2 次
    return sameSubjectCount === 0 && sameTeacherCount < 2;
  }
}

// --------------------------------------------------------------------------
// 星期五放学后手动排 Tasmik 时刻配置：
// 一至三年级星期五 11:15 - 11:45 (第 8 节, 与高年级第 8 节时刻同步) 放学后手动排 Tasmik
// 四至六年级星期五 11:45 - 12:15 (第 9 节) 放学后手动排 Tasmik
// --------------------------------------------------------------------------
export function getFridayTasmikSlotMeta(classLevel: number) {
  const isTahap2 = classLevel >= 4;
  if (!isTahap2) {
    // 一至三年级 (Tahap 1): 第 8 节, 11:15 - 11:45 (与高年级第 8 节时刻同步)
    return {
      periodNumber: 8,
      timeLabel: '11:15 - 11:45',
      startMinutes: 675,
      endMinutes: 705,
      isManualTasmik: true,
    };
  } else {
    // 四至六年级 (Tahap 2): 第 9 节, 11:45 - 12:15
    return {
      periodNumber: 9,
      timeLabel: '11:45 - 12:15',
      startMinutes: 705,
      endMinutes: 735,
      isManualTasmik: true,
    };
  }
}

// --------------------------------------------------------------------------
// 排课指纹对比与动态多样性生成
// --------------------------------------------------------------------------
let previousScheduleSignature: string = '';

export function getPreviousScheduleSignature(): string {
  return previousScheduleSignature;
}

export function setPreviousScheduleSignature(sig: string): void {
  previousScheduleSignature = sig;
}

export function resetScheduleSignature(): void {
  previousScheduleSignature = '';
}

export function computeScheduleSignature(lessonsOrGrid: any): string {
  if (Array.isArray(lessonsOrGrid)) {
    return lessonsOrGrid
      .filter((l) => l && l.countsAsClassPeriod && l.subjectCode && l.subjectCode.toUpperCase() !== 'PN')
      .map((l) => `${l.classId}_${l.day}_P${l.periodNumber}:${l.subjectCode}`)
      .sort()
      .join('|');
  }

  // If a ScheduleGrid object is provided
  if (lessonsOrGrid && typeof lessonsOrGrid === 'object') {
    const tokens: string[] = [];
    [1, 2, 3, 4, 5, 6].forEach((g) => {
      DAYS_OF_WEEK.forEach((d) => {
        const daySlots = (lessonsOrGrid as any)[g]?.[d];
        if (daySlots) {
          Object.entries(daySlots).forEach(([slotId, cell]: [string, any]) => {
            if (cell && cell.subjectCode && cell.subjectCode.toUpperCase() !== 'PN' && slotId !== 'PKAR' && slotId !== 'MEMBACA' && slotId !== 'TASMIK') {
              tokens.push(`T${g}_${d}_${slotId}:${cell.subjectCode}`);
            }
          });
        }
      });
    });
    return tokens.sort().join('|');
  }

  return '';
}

export function isSignificantlyDifferentFromPrevious(lessonsOrGrid: any): boolean {
  const currentSig = computeScheduleSignature(lessonsOrGrid);
  if (!previousScheduleSignature) {
    previousScheduleSignature = currentSig;
    return true; // 首次生成直接视为有效
  }

  const prevEntries = new Set(previousScheduleSignature.split('|').filter(Boolean));
  const currEntries = currentSig.split('|').filter(Boolean);

  if (currEntries.length === 0 || prevEntries.size === 0) {
    previousScheduleSignature = currentSig;
    return true;
  }

  // 计算相同槽位科目重合数
  let identicalCount = 0;
  for (const entry of currEntries) {
    if (prevEntries.has(entry)) {
      identicalCount++;
    }
  }

  const similarityRatio = identicalCount / Math.max(currEntries.length, prevEntries.size);
  // 要求至少 30% 差异（即相似度 <= 70%）
  const isDifferent = similarityRatio <= 0.7;
  previousScheduleSignature = currentSig;
  return isDifferent;
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
      const { tasmikManualPeriod: defaultPeriod } = getDayPeriodConfig(day, classLevel);
      const fridayMeta = getFridayTasmikSlotMeta(classLevel);
      const tasmikManualPeriod = day === 'JUMAAT' ? fridayMeta.periodNumber : defaultPeriod;

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
          ? fridayMeta.timeLabel
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
  incTeacherWorkload: (teacherId: string, day: string, delta: number) => void,
  academicYear: string = '2027'
) {
  // 先清除旧的自动 PKAR 记录，确保拖拽调课后也能实时重新绑定
  const filteredLessons = lessons.filter((l) => !l.isAutoPKAR);
  const isKP2027Year1 = !academicYear || parseInt(academicYear, 10) >= 2027;
  if (!isKP2027Year1) {
    return filteredLessons;
  }

  days.forEach((day) => {
    const { preRecessPeriod } = getDayPeriodConfig(day, 1, academicYear);

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
        l.periodNumber === preRecessPeriod &&
        !l.isPemulihan &&
        l.countsAsClassPeriod
    );

    // 每个一年级班级仅绑定一次第 4 节教师
    const pairedClasses = new Set<string>();
    preRecessLessons.forEach((preLesson) => {
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
// 2. 体育课 PJ 候选配置与隔天规则
// --------------------------------------------------------------------------
export const validPJ3DayTriplets: Array<[string, string, string]> = [
  ['ISNIN', 'RABU', 'JUMAAT'],   // 星期 1, 3, 5 (Strict 1-day gap between every PJ!)
  ['ISNIN', 'SELASA', 'KHAMIS'], // Fallback for Year 1 only
  ['ISNIN', 'RABU', 'KHAMIS'],   // Fallback for Year 1 only
];

export const validPJ2DayPairs: Array<[string, string]> = [
  ['ISNIN', 'RABU'],             // 星期 1, 3
  ['SELASA', 'KHAMIS'],          // 星期 2, 4
  ['RABU', 'JUMAAT'],            // 星期 3, 5
  ['ISNIN', 'KHAMIS'],           // 星期 1, 4
  ['SELASA', 'JUMAAT'],          // 星期 2, 5
  ['ISNIN', 'JUMAAT'],           // 星期 1, 5
];

// 检查体育课是否违反“至少隔 1 天”规则（2~6年级严格强制；1年级豁免相邻限制但仍限每天最多1节）
export function isPJConsecutiveDayViolated(
  grade: number,
  scheduledPjDays: string[],
  candidateDay: string
): boolean {
  if (scheduledPjDays.includes(candidateDay)) return true; // Max 1 PJ per day
  if (grade >= 2) {
    const candIdx = DAYS_OF_WEEK.indexOf(candidateDay as DayOfWeek);
    if (candIdx === -1) return false;
    for (const existingDay of scheduledPjDays) {
      const existingIdx = DAYS_OF_WEEK.indexOf(existingDay as DayOfWeek);
      if (existingIdx !== -1 && Math.abs(existingIdx - candIdx) < 2) {
        return true;
      }
    }
  }
  return false;
}

// 每个上课日在上午下课前可排 PJ 的节次（严格优先第1节，仅在冲突或周二周会时顺延第2节）
export const getMorningPJCandidates = (day: string): number[] => {
  if (day === 'SELASA') {
    return [2]; // 周二第 1 节固定为 PN 周会，PJ 严格排入第 2 节
  }
  return [1, 2]; // 严格优先第 1 节，仅在第 1 节冲突时退居第 2 节
};

export const MAX_ATTEMPTS = 80;

export function getDayIndex(day: string): number {
  return DAYS_OF_WEEK.indexOf(day as DayOfWeek);
}

export function canClassPlacePJOnDay(
  scheduledPjDays: string[],
  candidateDay: string,
  grade: number
): boolean {
  return !isPJConsecutiveDayViolated(grade, scheduledPjDays, candidateDay);
}

export const getDailyMaxPeriods = (day: string, classLevel: number = 1, academicYear: string = '2027'): number => {
  return getDayPeriodConfig(day, classLevel, academicYear).teachingPeriods;
};

export const isAdjacentPeriod = (p1: number, p2: number): boolean => {
  return p2 === p1 + 1;
};

// --------------------------------------------------------------------------
// 3. 教师休息空档、动态个人日上限与单日绝对 8 节上限校验函数
// --------------------------------------------------------------------------
export const MAX_TEACHER_DAILY_PERIODS = 8;

export function getTeacherPersonalDailyCap(weeklyTotal: number): number {
  if (weeklyTotal <= 0) return 7;
  return Math.min(MAX_TEACHER_DAILY_PERIODS, Math.ceil(weeklyTotal / 5));
}

export function getTeacherMinDailyTarget(weeklyTotal: number): number {
  if (weeklyTotal < 25) return 0;
  return Math.max(4, Math.floor(weeklyTotal / 5) - 1);
}

export function canTeacherTakeLoadOnDay(params: {
  day: string;
  addedLoad: number;
  getLoadOnDay: (day: string) => number;
  maxAllowedDailyLoad?: number;
  maxDaysOver7?: number;
}): boolean {
  const {
    day,
    addedLoad,
    getLoadOnDay,
    maxAllowedDailyLoad = MAX_TEACHER_DAILY_PERIODS,
    maxDaysOver7 = 1,
  } = params;
  const effectiveCap = Math.min(MAX_TEACHER_DAILY_PERIODS, maxAllowedDailyLoad);
  const projected = getLoadOnDay(day) + addedLoad;
  if (projected > effectiveCap + 1e-6) return false;
  if (projected > 7.0 + 1e-6) {
    const otherDaysOver7 = DAYS_OF_WEEK.filter((d) => d !== day && getLoadOnDay(d) > 7.0 + 1e-6).length;
    if (otherDaysOver7 >= maxDaysOver7) return false;
  }
  return true;
}

export function canTeacherTakeSlot(
  teacherId: string,
  day: string,
  targetPeriod: number,
  currentTeacherLessonsOnDay: number[], // 当天已排入的节次列表
  currentTeacherWorkloadDay: number = 0, // 包含周二 PN (+1.0) 与 0.5 节 PKAR 的实际工作量
  options?: {
    dailyCap?: number;
    maxAllowedDailyLoad?: number;
    strictBreaks?: boolean;
    additionalWorkload?: number;
    addedWorkload?: number;
    classLevel?: number;
    academicYear?: string;
    otherDaysAbove7Count?: number;
    maxDaysOver7?: number;
  }
): boolean {
  const periodCost = options?.additionalWorkload ?? options?.addedWorkload ?? 1;
  const requestedCap = options?.dailyCap ?? options?.maxAllowedDailyLoad ?? MAX_TEACHER_DAILY_PERIODS;
  const effectiveCap = Math.min(MAX_TEACHER_DAILY_PERIODS, requestedCap);

  // 规则 2A: 绝对硬上限 — 任何情况下单日绝不允许超过 8.0 节 (含 PN 与 0.5 PKAR)
  if (
    currentTeacherLessonsOnDay.length >= MAX_TEACHER_DAILY_PERIODS ||
    currentTeacherWorkloadDay + periodCost > MAX_TEACHER_DAILY_PERIODS + 1e-6
  ) {
    return false;
  }

  // 动态/目标个人每日上限校验
  if (currentTeacherWorkloadDay + periodCost > effectiveCap + 1e-6) {
    return false;
  }

  if (
    options?.otherDaysAbove7Count !== undefined &&
    currentTeacherWorkloadDay + periodCost > 7.0 + 1e-6 &&
    options.otherDaysAbove7Count >= (options.maxDaysOver7 ?? 1)
  ) {
    return false;
  }

  if (options?.strictBreaks === false) {
    return true;
  }

  const { preRecessPeriod, teachingPeriods } = getDayPeriodConfig(
    day,
    options?.classLevel ?? 2,
    options?.academicYear ?? '2027'
  );
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

export interface RepairEmptyClassSlotsParams {
  classes: ClassProfile[];
  assignments: SubjectAssignment[];
  lessons: TimetableLesson[];
  scheduledPerAssignment: Map<string, number>;
  teacherMap: Map<string, TeacherProfile>;
  classSlotOccupied: Set<string>;
  teacherSlotOccupied: Set<string>;
  incTeacherDayCount: (teacherId: string, day: string, delta?: number) => void;
  addTeacherPeriodOnDay: (teacherId: string, day: string, period: number) => void;
  removeTeacherPeriodOnDay?: (teacherId: string, day: string, period: number) => void;
  getTeacherDayLoad: (teacherId: string, day: string) => number;
  recordSubjectPeriod: (classId: string, subjectCode: string, day: string, period: number) => void;
  unrecordSubjectPeriod?: (classId: string, subjectCode: string, day: string, period: number) => void;
  getSubjectPeriodsOnDay: (classId: string, subjectCode: string, day: string) => number[];
  canTeacherTakeBlockOnDay: (
    teacherId: string,
    day: string,
    periodsToBook: number[],
    classLevel: number,
    strictBreaks: boolean,
    dailyCapOverride?: number,
    allowSingleDayOver7?: boolean
  ) => boolean;
  academicYear?: string;
}

/**
 * Mandatory Intra-Class Swap Repair Pass (Kempe-Chain Repair)
 * Eliminates empty trailing/middle slots and unplaced academic periods without breaking
 * PN, PJ (W1/W2 + 1-day gap), daily workload <= 8.0, or "no 3 consecutive same subject".
 */
export function repairEmptyClassSlots(ctx: RepairEmptyClassSlotsParams): number {
  const {
    classes,
    assignments,
    lessons,
    scheduledPerAssignment,
    teacherMap,
    classSlotOccupied,
    teacherSlotOccupied,
    incTeacherDayCount,
    addTeacherPeriodOnDay,
    removeTeacherPeriodOnDay,
    recordSubjectPeriod,
    unrecordSubjectPeriod,
    getSubjectPeriodsOnDay,
    canTeacherTakeBlockOnDay,
    academicYear = '2027',
  } = ctx;
  const isKP2027Year1 = !academicYear || parseInt(academicYear, 10) >= 2027;

  let repairedPeriods = 0;

  const unplaceLesson = (lesson: TimetableLesson) => {
    const idx = lessons.findIndex((l) => l.id === lesson.id);
    if (idx !== -1) lessons.splice(idx, 1);
    classSlotOccupied.delete(`${lesson.classId}_${lesson.day}_${lesson.periodNumber}`);
    teacherSlotOccupied.delete(`${lesson.teacherId}_${lesson.day}_${lesson.periodNumber}`);
    incTeacherDayCount(lesson.teacherId, lesson.day, -1);
    removeTeacherPeriodOnDay?.(lesson.teacherId, lesson.day, lesson.periodNumber);
    unrecordSubjectPeriod?.(lesson.classId, lesson.subjectCode, lesson.day, lesson.periodNumber);
  };

  const placeLessonObj = (
    classId: string,
    className: string,
    subjectCode: string,
    subjectName: string,
    teacherId: string,
    teacherName: string,
    day: string,
    period: number,
    customId?: string
  ): TimetableLesson => {
    classSlotOccupied.add(`${classId}_${day}_${period}`);
    teacherSlotOccupied.add(`${teacherId}_${day}_${period}`);
    incTeacherDayCount(teacherId, day, 1);
    addTeacherPeriodOnDay(teacherId, day, period);
    recordSubjectPeriod(classId, subjectCode, day, period);
    const obj: TimetableLesson = {
      id: customId || `lesson_${classId}_${subjectCode}_${day}_P${period}`,
      day,
      periodNumber: period,
      classId,
      className,
      subjectCode,
      subjectName,
      teacherId,
      teacherName,
      countsAsClassPeriod: true,
      countsAsTeacherPeriod: true,
    };
    lessons.push(obj);
    return obj;
  };

  const getClassDayLessons = (classId: string, day: string) =>
    lessons.filter((l) => l.classId === classId && l.day === day && !l.isPemulihan && l.countsAsClassPeriod);

  const isPjValidAt = (classId: string, classLevel: number, day: string, period: number): boolean => {
    if (period !== 1 && period !== 2) return false;
    if (day === 'SELASA' && period === 1) return false;
    const pjDays = DAYS_OF_WEEK.filter((d) => getSubjectPeriodsOnDay(classId, 'PJ', d).length > 0);
    return !isPJConsecutiveDayViolated(classLevel, pjDays, day);
  };

  const getEmptySlotsForClass = (classId: string, classLevel: number): Array<{ day: string; period: number }> => {
    const empties: Array<{ day: string; period: number }> = [];
    for (const d of DAYS_OF_WEEK) {
      const maxP = getDailyMaxPeriods(d, classLevel, academicYear);
      for (let p = 1; p <= maxP; p++) {
        if (!classSlotOccupied.has(`${classId}_${d}_${p}`)) {
          empties.push({ day: d, period: p });
        }
      }
    }
    return empties;
  };

  const canPlaceCandidateAt = (
    classId: string,
    classLevel: number,
    subjectCode: string,
    teacherId: string,
    day: string,
    period: number,
    maxSubjectsOverride: number,
    strictY1P4: boolean
  ): boolean => {
    if (classSlotOccupied.has(`${classId}_${day}_${period}`)) return false;
    if (teacherSlotOccupied.has(`${teacherId}_${day}_${period}`)) return false;
    if (isPJSubject(subjectCode) && !isPjValidAt(classId, classLevel, day, period)) return false;

    const dayLessons = getClassDayLessons(classId, day);
    const existingSubPeriods = getSubjectPeriodsOnDay(classId, subjectCode, day);

    if (
      !canAddSubjectToClassDay(dayLessons, subjectCode, 1, classLevel, {
        maxSubjectsOverride,
        existingPeriodPositions: existingSubPeriods,
        candidatePeriodPositions: [period],
      })
    ) {
      return false;
    }

    if (isKP2027Year1 && classLevel === 1 && period === 4) {
      const existingY1P4 = lessons
        .filter((l) => resolveClassLevel(l) === 1 && l.periodNumber === 4 && l.countsAsClassPeriod && !l.isPemulihan)
        .map((l) => ({ day: l.day, subjectCode: l.subjectCode, teacherId: l.teacherId }));
      if (!canAssignYear1Period4(1, 4, subjectCode, teacherId, existingY1P4, strictY1P4)) {
        return false;
      }
    }

    return canTeacherTakeBlockOnDay(teacherId, day, [period], classLevel, false, MAX_TEACHER_DAILY_PERIODS, true);
  };

  // Repair each unplaced assignment period-by-period
  for (const asg of assignments) {
    if (
      isTasmikSubject(asg.canonicalSubjectCode, asg.subjectName) ||
      isPKARSubject(asg.canonicalSubjectCode, asg.subjectName) ||
      isPemulihanSubject(asg.canonicalSubjectCode, asg.subjectName) ||
      asg.isPemulihan ||
      isAMSubject(asg.canonicalSubjectCode, asg.subjectName) ||
      isPairedMoralIslam(asg.canonicalSubjectCode)
    ) {
      continue;
    }

    const required = asg.effectiveWeeklyPeriods || 0;
    let scheduled = scheduledPerAssignment.get(asg.assignmentId) || 0;
    if (scheduled >= required) continue;

    const clsObj = classes.find((c) => c.classId === asg.classId);
    const classLevel = resolveClassLevel(clsObj || { className: asg.className });
    const baseMaxSubjects = getMaxSubjectsPerDay(classLevel);
    const teacherName = teacherMap.get(asg.teacherId)?.fullName || asg.teacherId;

    while (scheduled < required) {
      const emptySlots = getEmptySlotsForClass(asg.classId, classLevel);
      if (emptySlots.length === 0) break;

      let placedOne = false;

      // Pass 1: Direct placement (strict cap -> overflow +1 -> +2 -> relaxed non-adjacent emergency)
      for (const maxSubCap of [baseMaxSubjects, baseMaxSubjects + 1, baseMaxSubjects + 2, 12]) {
        if (placedOne) break;
        for (const e of emptySlots) {
          if (
            canPlaceCandidateAt(
              asg.classId,
              classLevel,
              asg.canonicalSubjectCode,
              asg.teacherId,
              e.day,
              e.period,
              maxSubCap,
              false
            )
          ) {
            placeLessonObj(
              asg.classId,
              asg.className,
              asg.canonicalSubjectCode,
              asg.subjectName,
              asg.teacherId,
              teacherName,
              e.day,
              e.period
            );
            scheduled++;
            repairedPeriods++;
            placedOne = true;
            break;
          }
        }
      }
      if (placedOne) continue;

      // Pass 2: Mandatory Intra-Class 1-Hop Kempe Swap Repair (P -> E, unplaced -> P)
      const classLessons = lessons.filter(
        (l) =>
          l.classId === asg.classId &&
          l.countsAsClassPeriod &&
          !l.isPemulihan &&
          !l.isPN &&
          !l.isAutoPKAR &&
          !l.isManualSlot &&
          l.subjectCode.toUpperCase() !== 'PN' &&
          l.subjectCode.toUpperCase() !== 'PJ' &&
          l.subjectCode.toUpperCase() !== 'PM/PAI'
      );

      // Prefer moving standalone [1] lessons first so intact [2]-blocks stay whole; fallback to outer endpoints
      classLessons.sort((a, b) => {
        const cntA = getSubjectPeriodsOnDay(a.classId, a.subjectCode, a.day).length;
        const cntB = getSubjectPeriodsOnDay(b.classId, b.subjectCode, b.day).length;
        return cntA - cntB;
      });

      for (const maxSubCap of [baseMaxSubjects + 1, baseMaxSubjects + 2, 12]) {
        if (placedOne) break;
        for (const e of emptySlots) {
          if (placedOne) break;
          for (const existingL of classLessons) {
            if (placedOne) break;
            if (existingL.subjectCode.toUpperCase() === asg.canonicalSubjectCode.toUpperCase()) continue;

            // Avoid breaking an intact [2]-block into 1+1 across days unless necessary
            const existingDayPeriods = getSubjectPeriodsOnDay(existingL.classId, existingL.subjectCode, existingL.day);
            if (existingDayPeriods.length >= 2 && existingL.day !== e.day) {
              // Moving 1 out of 3 (2+1) is ok ONLY if we remove the isolated period, NOT half of the [2]
              const isAdj = existingDayPeriods.some((p) => Math.abs(p - existingL.periodNumber) === 1);
              if (isAdj && maxSubCap < 12) continue;
            }

            const pDay = existingL.day;
            const pPeriod = existingL.periodNumber;

            // Unbook existingL from P
            unplaceLesson(existingL);

            const canMoveExistingToE = canPlaceCandidateAt(
              asg.classId,
              classLevel,
              existingL.subjectCode,
              existingL.teacherId,
              e.day,
              e.period,
              maxSubCap,
              false
            );

            if (canMoveExistingToE) {
              const movedL = placeLessonObj(
                existingL.classId,
                existingL.className,
                existingL.subjectCode,
                existingL.subjectName,
                existingL.teacherId,
                existingL.teacherName,
                e.day,
                e.period,
                existingL.id
              );

              const canPlaceAsgAtP = canPlaceCandidateAt(
                asg.classId,
                classLevel,
                asg.canonicalSubjectCode,
                asg.teacherId,
                pDay,
                pPeriod,
                maxSubCap,
                false
              );

              if (canPlaceAsgAtP) {
                placeLessonObj(
                  asg.classId,
                  asg.className,
                  asg.canonicalSubjectCode,
                  asg.subjectName,
                  asg.teacherId,
                  teacherName,
                  pDay,
                  pPeriod
                );
                scheduled++;
                repairedPeriods++;
                placedOne = true;
                break;
              }

              unplaceLesson(movedL);
            }

            // Rollback existingL to P
            placeLessonObj(
              existingL.classId,
              existingL.className,
              existingL.subjectCode,
              existingL.subjectName,
              existingL.teacherId,
              existingL.teacherName,
              pDay,
              pPeriod,
              existingL.id
            );
          }
        }
      }
      if (placedOne) continue;

      // Pass 3: 2-Hop Intra-Class Kempe Chain (P2 -> E, P1 -> P2, unplaced -> P1)
      for (const e of emptySlots) {
        if (placedOne) break;
        for (const l1 of classLessons) {
          if (placedOne) break;
          if (l1.subjectCode.toUpperCase() === asg.canonicalSubjectCode.toUpperCase()) continue;
          const p1Day = l1.day;
          const p1Per = l1.periodNumber;
          if (teacherSlotOccupied.has(`${asg.teacherId}_${p1Day}_${p1Per}`)) continue;

          for (const l2 of classLessons) {
            if (l2.id === l1.id || l2.subjectCode.toUpperCase() === l1.subjectCode.toUpperCase()) continue;
            const p2Day = l2.day;
            const p2Per = l2.periodNumber;

            unplaceLesson(l2);
            const okL2ToE = canPlaceCandidateAt(asg.classId, classLevel, l2.subjectCode, l2.teacherId, e.day, e.period, 12, false);
            if (!okL2ToE) {
              placeLessonObj(l2.classId, l2.className, l2.subjectCode, l2.subjectName, l2.teacherId, l2.teacherName, p2Day, p2Per, l2.id);
              continue;
            }
            const movedL2 = placeLessonObj(l2.classId, l2.className, l2.subjectCode, l2.subjectName, l2.teacherId, l2.teacherName, e.day, e.period, l2.id);

            unplaceLesson(l1);
            const okL1ToP2 = canPlaceCandidateAt(asg.classId, classLevel, l1.subjectCode, l1.teacherId, p2Day, p2Per, 12, false);
            if (!okL1ToP2) {
              placeLessonObj(l1.classId, l1.className, l1.subjectCode, l1.subjectName, l1.teacherId, l1.teacherName, p1Day, p1Per, l1.id);
              unplaceLesson(movedL2);
              placeLessonObj(l2.classId, l2.className, l2.subjectCode, l2.subjectName, l2.teacherId, l2.teacherName, p2Day, p2Per, l2.id);
              continue;
            }
            const movedL1 = placeLessonObj(l1.classId, l1.className, l1.subjectCode, l1.subjectName, l1.teacherId, l1.teacherName, p2Day, p2Per, l1.id);

            if (canPlaceCandidateAt(asg.classId, classLevel, asg.canonicalSubjectCode, asg.teacherId, p1Day, p1Per, 12, false)) {
              placeLessonObj(
                asg.classId,
                asg.className,
                asg.canonicalSubjectCode,
                asg.subjectName,
                asg.teacherId,
                teacherName,
                p1Day,
                p1Per
              );
              scheduled++;
              repairedPeriods++;
              placedOne = true;
              break;
            }

            unplaceLesson(movedL1);
            placeLessonObj(l1.classId, l1.className, l1.subjectCode, l1.subjectName, l1.teacherId, l1.teacherName, p1Day, p1Per, l1.id);
            unplaceLesson(movedL2);
            placeLessonObj(l2.classId, l2.className, l2.subjectCode, l2.subjectName, l2.teacherId, l2.teacherName, p2Day, p2Per, l2.id);
          }
        }
      }
      if (placedOne) continue;

      // Pass 4: Cross-Class Single-Blocker Swap on an empty slot E
      for (const e of emptySlots) {
        if (placedOne) break;
        if (isPJSubject(asg.canonicalSubjectCode) && !isPjValidAt(asg.classId, classLevel, e.day, e.period)) continue;
        const blocking = lessons.find(
          (l) =>
            l.day === e.day &&
            l.periodNumber === e.period &&
            l.teacherId === asg.teacherId &&
            l.countsAsClassPeriod &&
            !l.isPemulihan &&
            !l.isPN &&
            l.subjectCode.toUpperCase() !== 'PJ' &&
            l.subjectCode.toUpperCase() !== 'PM/PAI'
        );
        if (!blocking) continue;
        const bCls = classes.find((c) => c.classId === blocking.classId);
        const bLevel = resolveClassLevel(bCls || { className: blocking.className });
        const partnerLessons = lessons.filter(
          (l) =>
            l.classId === blocking.classId &&
            l.day === e.day &&
            l.periodNumber !== e.period &&
            l.countsAsClassPeriod &&
            !l.isPemulihan &&
            !l.isPN &&
            !l.isAutoPKAR &&
            l.subjectCode.toUpperCase() !== 'PJ' &&
            l.subjectCode.toUpperCase() !== 'PM/PAI' &&
            l.subjectCode.toUpperCase() !== blocking.subjectCode.toUpperCase()
        );
        for (const partner of partnerLessons) {
          if (placedOne) break;
          unplaceLesson(blocking);
          unplaceLesson(partner);
          const okB = canPlaceCandidateAt(blocking.classId, bLevel, blocking.subjectCode, blocking.teacherId, e.day, partner.periodNumber, 12, false);
          const okP = okB && canPlaceCandidateAt(partner.classId, bLevel, partner.subjectCode, partner.teacherId, e.day, e.period, 12, false);
          if (okB && okP) {
            const mB = placeLessonObj(blocking.classId, blocking.className, blocking.subjectCode, blocking.subjectName, blocking.teacherId, blocking.teacherName, e.day, partner.periodNumber, blocking.id);
            const mP = placeLessonObj(partner.classId, partner.className, partner.subjectCode, partner.subjectName, partner.teacherId, partner.teacherName, e.day, e.period, partner.id);
            if (canPlaceCandidateAt(asg.classId, classLevel, asg.canonicalSubjectCode, asg.teacherId, e.day, e.period, 12, false)) {
              placeLessonObj(
                asg.classId,
                asg.className,
                asg.canonicalSubjectCode,
                asg.subjectName,
                asg.teacherId,
                teacherName,
                e.day,
                e.period
              );
              scheduled++;
              repairedPeriods++;
              placedOne = true;
              break;
            }
            unplaceLesson(mB);
            unplaceLesson(mP);
          }
          placeLessonObj(blocking.classId, blocking.className, blocking.subjectCode, blocking.subjectName, blocking.teacherId, blocking.teacherName, e.day, e.period, blocking.id);
          placeLessonObj(partner.classId, partner.className, partner.subjectCode, partner.subjectName, partner.teacherId, partner.teacherName, e.day, partner.periodNumber, partner.id);
        }
      }

      if (!placedOne) break;
    }

    scheduledPerAssignment.set(asg.assignmentId, scheduled);
  }

  return repairedPeriods;
}

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
    teacherDayPeriodCounts.set(key, Math.max(0, (teacherDayPeriodCounts.get(key) || 0) + delta));
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

  const removeTeacherPeriodOnDay = (teacherId: string, day: string, period: number) => {
    const key = `${teacherId}_${day}`;
    const list = teacherDayPeriodsMap.get(key);
    if (!list) return;
    teacherDayPeriodsMap.set(
      key,
      list.filter((p) => p !== period)
    );
  };

  const subjectPeriodsMap = new Map<string, number[]>(); // `${classId}_${subjectCode}_${day}` -> periods[]

  const recordSubjectPeriod = (classId: string, subjectCode: string, day: string, period: number) => {
    const key = `${classId}_${subjectCode.toUpperCase()}_${day}`;
    const list = subjectPeriodsMap.get(key) || [];
    list.push(period);
    subjectPeriodsMap.set(key, list);
  };

  const unrecordSubjectPeriod = (classId: string, subjectCode: string, day: string, period: number) => {
    const key = `${classId}_${subjectCode.toUpperCase()}_${day}`;
    const list = subjectPeriodsMap.get(key);
    if (!list) return;
    const idx = list.indexOf(period);
    if (idx !== -1) list.splice(idx, 1);
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
  const isKP2027Year1 = !academicYear || parseInt(academicYear, 10) >= 2027;
  if (isKP2027Year1) {
    seedYear1ProgramMembaca(nonPrasekolahClasses, DAYS_OF_WEEK as any, lessons);
  }

  // --------------------------------------------------------------------------
  // STEP 0C: 放学后 SLOT KHAS TASMIK 固定留空（100% 手动指派，严禁系统自动预占）
  // --------------------------------------------------------------------------
  seedManualTasmikSlots(nonPrasekolahClasses, DAYS_OF_WEEK as any, lessons);

  // 标记 PKAR 课目由自动对齐算法绑定，不需手动选师
  pkarAssignments.forEach((asg) => {
    scheduledPerAssignment.set(asg.assignmentId, 1);
  });

  // 预先计算每位教师每周总负荷（包含周二周会 PN +1.0 节）
  const teacherWeeklyTotals = new Map<string, number>();
  teachers.forEach((t) => teacherWeeklyTotals.set(t.teacherId, 1));
  normalizedAssignments.forEach((a) => {
    if (isTasmikSubject(a.canonicalSubjectCode, a.subjectName) || isPKARSubject(a.canonicalSubjectCode, a.subjectName)) return;
    const w = a.effectiveWeeklyPeriods || 0;
    if (a.teacherId) {
      teacherWeeklyTotals.set(a.teacherId, (teacherWeeklyTotals.get(a.teacherId) || 1) + w);
    }
    const secT = (a as any).secondaryTeacherId || (a as any).coTeacherId;
    if (secT) {
      teacherWeeklyTotals.set(secT, (teacherWeeklyTotals.get(secT) || 1) + w);
    }
  });

  const getTeacherDayLoad = (teacherId: string, day: string): number => {
    let base = teacherDayPeriodCounts.get(`${teacherId}_${day}`) || 0;
    if (isKP2027Year1) {
      const hasY1P4 = lessons.some(
        (l) =>
          !l.isPemulihan &&
          l.countsAsClassPeriod &&
          resolveClassLevel(l) === 1 &&
          l.day === day &&
          l.periodNumber === 4 &&
          l.teacherId === teacherId
      );
      if (hasY1P4) base += 0.5;
    }
    return base;
  };

  const countOtherDaysOver7 = (teacherId: string, excludeDay: string): number => {
    return DAYS_OF_WEEK.filter((d) => d !== excludeDay && getTeacherDayLoad(teacherId, d) > 7.0 + 1e-6).length;
  };

  // 多节课块精确负荷与休息空档守门员（覆盖连堂 +2、一年级第4节 +0.5 PKAR、单日绝对 <= 8.0、每周最多1天 >7.0）
  const canTeacherTakeBlockOnDay = (
    teacherId: string,
    day: string,
    periodsToBook: number[],
    classLevel: number,
    strictBreaks: boolean,
    dailyCapOverride: number = MAX_TEACHER_DAILY_PERIODS,
    allowSingleDayOver7: boolean = true
  ): boolean => {
    if (!teacherId) return true;
    const curWorkload = getTeacherDayLoad(teacherId, day);
    const pkarBonus = isKP2027Year1 && classLevel === 1 && periodsToBook.includes(4) ? 0.5 : 0;
    const totalBlockCost = periodsToBook.length + pkarBonus;
    const projectedLoad = curWorkload + totalBlockCost;

    // 绝对硬上限：任何老师单日绝不能超过 8.0 节
    if (projectedLoad > MAX_TEACHER_DAILY_PERIODS + 1e-6) {
      return false;
    }
    if (projectedLoad > dailyCapOverride + 1e-6) {
      return false;
    }

    // 仅允许每周最多 1 天超过 7.0 节（<=36节常规教师优先 <=7，必要时最多1天达8节）
    if (projectedLoad > 7.0 + 1e-6) {
      if (!allowSingleDayOver7) return false;
      const weeklyTotal = teacherWeeklyTotals.get(teacherId) || 0;
      const maxOver7Days = weeklyTotal <= 36 ? 1 : Math.min(5, Math.ceil(weeklyTotal - 35));
      if (countOtherDaysOver7(teacherId, day) >= maxOver7Days) {
        return false;
      }
    }

    const basePeriods = getTeacherPeriodsOnDay(teacherId, day);
    for (let idx = 0; idx < periodsToBook.length; idx++) {
      const per = periodsToBook[idx];
      const stepCost = 1 + (idx === 0 ? pkarBonus : 0);
      const ok = canTeacherTakeSlot(
        teacherId,
        day,
        per,
        [...basePeriods, ...periodsToBook.slice(0, idx)],
        curWorkload + idx + (idx > 0 ? pkarBonus : 0),
        {
          dailyCap: Math.max(dailyCapOverride, projectedLoad),
          strictBreaks,
          additionalWorkload: stepCost,
          classLevel,
          academicYear,
        }
      );
      if (!ok) return false;
    }
    return true;
  };

  // 按教师当日负载升序排列候选天（优先填满最轻的一天，负载相同时优先星期五）
  const sortDaysLeastLoadedFirst = (dayList: string[], teacherIds: string[]): string[] => {
    return [...dayList].sort((a, b) => {
      const loadA = Math.max(0, ...teacherIds.map((id) => getTeacherDayLoad(id, a)));
      const loadB = Math.max(0, ...teacherIds.map((id) => getTeacherDayLoad(id, b)));
      if (Math.abs(loadA - loadB) > 0.25) {
        return loadA - loadB;
      }
      if (a === 'JUMAAT' && b !== 'JUMAAT') return -1;
      if (b === 'JUMAAT' && a !== 'JUMAAT') return 1;
      return loadA - loadB;
    });
  };

  // --------------------------------------------------------------------------
  // STEP 1: SCHEDULE PJ (Strict Max 1/day, Period 1 First Priority -> Period 2 Overflow, T2-6 1-day gap)
  // --------------------------------------------------------------------------
  nonPrasekolahClasses.forEach((cls) => {
    const classLevel = resolveClassLevel(cls);
    const classPjAssignments = academicAndPjAssignments.filter(
      (a) => a.classId === cls.classId && isPJSubject(a.canonicalSubjectCode, a.subjectName)
    );

    classPjAssignments.forEach((asg) => {
      const requiredPeriods = asg.effectiveWeeklyPeriods;
      let scheduled = scheduledPerAssignment.get(asg.assignmentId) || 0;
      if (scheduled >= requiredPeriods) return;

      const dayPatterns: string[][] =
        requiredPeriods >= 3
          ? validPJ3DayTriplets.filter((pat) => {
              if (classLevel >= 2) {
                const indices = pat.map((d) => DAYS_OF_WEEK.indexOf(d as DayOfWeek)).sort((a, b) => a - b);
                return indices[1] - indices[0] >= 2 && indices[2] - indices[1] >= 2;
              }
              return true;
            })
          : validPJ2DayPairs;

      // Pass 1: 严格优先第 1 节 (SELASA除外，因第1节为 PN)；Pass 2: 若第1节冲突，允许使用第 2 节
      for (const pattern of dayPatterns) {
        if (scheduled >= requiredPeriods) break;

        const chosenSlots: { day: string; period: number }[] = [];
        for (const day of pattern) {
          const pCandidates = getMorningPJCandidates(day); // [1, 2] except SELASA [2]
          let foundPeriod: number | null = null;

          for (const p of pCandidates) {
            const cKey = `${cls.classId}_${day}_${p}`;
            const tKey = `${asg.teacherId}_${day}_${p}`;
            const existingPjOnDay = getSubjectPeriodsOnDay(cls.classId, asg.canonicalSubjectCode, day);

            if (
              existingPjOnDay.length === 0 &&
              !classSlotOccupied.has(cKey) &&
              !teacherSlotOccupied.has(tKey) &&
              canTeacherTakeBlockOnDay(asg.teacherId, day, [p], classLevel, true, 7, false)
            ) {
              foundPeriod = p;
              break;
            }
          }

          if (foundPeriod !== null) {
            chosenSlots.push({ day, period: foundPeriod });
          }
        }

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

      // 逐节兜底排入（严格遵守 Period 1 优先、T2-6 隔天规则、以及 <= 8 节硬上限）
      while (scheduled < requiredPeriods) {
        const scheduledPjDays = DAYS_OF_WEEK.filter(
          (d) => getSubjectPeriodsOnDay(cls.classId, asg.canonicalSubjectCode, d).length > 0
        );
        const validDays = sortDaysLeastLoadedFirst(
          DAYS_OF_WEEK.filter((d) => !isPJConsecutiveDayViolated(classLevel, scheduledPjDays, d)),
          [asg.teacherId]
        );
        let placedSingle = false;

        // Pass 1: all validDays Period 1 first; Pass 2: Period 2 overflow
        for (const targetPeriod of [1, 2]) {
          if (placedSingle) break;
          for (const day of validDays) {
            if (day === 'SELASA' && targetPeriod === 1) continue;
            const cKey = `${cls.classId}_${day}_${targetPeriod}`;
            const tKey = `${asg.teacherId}_${day}_${targetPeriod}`;
            if (
              !classSlotOccupied.has(cKey) &&
              !teacherSlotOccupied.has(tKey) &&
              canTeacherTakeBlockOnDay(asg.teacherId, day, [targetPeriod], classLevel, false, 8, true)
            ) {
              const teacherObj = teacherMap.get(asg.teacherId);
              classSlotOccupied.add(cKey);
              teacherSlotOccupied.add(tKey);
              incTeacherDayCount(asg.teacherId, day);
              addTeacherPeriodOnDay(asg.teacherId, day, targetPeriod);
              recordSubjectPeriod(cls.classId, asg.canonicalSubjectCode, day, targetPeriod);
              lessons.push({
                id: `pj_${cls.classId}_${day}_P${targetPeriod}`,
                day,
                periodNumber: targetPeriod,
                classId: cls.classId,
                className: cls.className,
                subjectCode: 'PJ',
                subjectName: asg.subjectName || 'Pendidikan Jasmani',
                teacherId: asg.teacherId,
                teacherName: teacherObj?.fullName || asg.teacherId,
                countsAsClassPeriod: true,
                countsAsTeacherPeriod: true,
              });
              scheduled += 1;
              scheduledPerAssignment.set(asg.assignmentId, scheduled);
              placedSingle = true;
              break;
            }
          }
        }
        if (!placedSingle) break;
      }
    });
  });

  // --------------------------------------------------------------------------
  // STEP 2A: PM 与 PAI 同节绑定排课 (Waktu Serentak PM / PAI) — 严格 2+2+1 / 2+2 / 2+1 连续双节
  // --------------------------------------------------------------------------
  nonPrasekolahClasses.forEach((cls) => {
    const classLevel = resolveClassLevel(cls);
    const pmAsg = academicAndPjAssignments.find(
      (a) => a.classId === cls.classId && isPairedMoralIslam(a.canonicalSubjectCode) === 'PM'
    );
    const paiAsg = academicAndPjAssignments.find(
      (a) => a.classId === cls.classId && isPairedMoralIslam(a.canonicalSubjectCode) === 'PAI'
    );

    // 如果该班同时配有 PM 与 PAI，将它们锁定在完全相同的节次（严格 5->[2,2,1], 4->[2,2], 3->[2,1]，分布于不同天数）
    if (pmAsg && paiAsg) {
      const required = Math.max(pmAsg.effectiveWeeklyPeriods, paiAsg.effectiveWeeklyPeriods);
      const targetBlocks = decomposeSubjectCompactly('PM', required, classLevel);
      const recessAfter = isKP2027Year1 && classLevel === 1 ? 4 : 5;
      let scheduled = 0;

      for (const blockLen of targetBlocks) {
        let blockPlaced = false;

        for (const strictPhase of [true, false]) {
          if (blockPlaced) break;
          const sortedDays = sortDaysLeastLoadedFirst([...DAYS_OF_WEEK], [pmAsg.teacherId, paiAsg.teacherId]);

          for (const day of sortedDays) {
            if (blockPlaced) break;
            // 严格保证每天最多只排 1 组 PM/PAI 课块（例如 [2,2,1] 必须落在 3 个不同上课日）
            if (getSubjectPeriodsOnDay(cls.classId, 'PM', day).length > 0) continue;

            const maxP = getDailyMaxPeriods(day, classLevel, academicYear);
            const candidateStarts: number[] = [];
            for (let p = 1; p <= maxP - blockLen + 1; p++) {
              if (blockLen === 2 && !isAdjacentPeriod(p, p + 1)) continue;
              candidateStarts.push(p);
            }

            // 优先选择不跨下课的连堂槽位 ([1,2], [2,3], [3,4], [6,7], [7,8], [8,9])
            if (blockLen === 2) {
              candidateStarts.sort((pA, pB) => {
                const sA = scoreDoubleSlotCandidate(pA, pA + 1, recessAfter);
                const sB = scoreDoubleSlotCandidate(pB, pB + 1, recessAfter);
                return sB - sA || pA - pB;
              });
            }

            for (const p of candidateStarts) {
              if (blockLen === 2 && strictPhase && scoreDoubleSlotCandidate(p, p + 1, recessAfter) < 100) {
                continue; // 严格阶段绝不跨下课
              }

              const periodsToBook = blockLen === 2 ? [p, p + 1] : [p];
              const slotsFree = periodsToBook.every((per) => {
                const cKey = `${cls.classId}_${day}_${per}`;
                const pmTKey = `${pmAsg.teacherId}_${day}_${per}`;
                const paiTKey = `${paiAsg.teacherId}_${day}_${per}`;
                return !classSlotOccupied.has(cKey) && !teacherSlotOccupied.has(pmTKey) && !teacherSlotOccupied.has(paiTKey);
              });
              if (!slotsFree) continue;

              const capLimit = strictPhase ? 7 : 8;
              const allowOver7 = !strictPhase;
              const pmCan = canTeacherTakeBlockOnDay(pmAsg.teacherId, day, periodsToBook, classLevel, strictPhase, capLimit, allowOver7);
              const paiCan = canTeacherTakeBlockOnDay(paiAsg.teacherId, day, periodsToBook, classLevel, strictPhase, capLimit, allowOver7);

              if (pmCan && paiCan) {
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
                blockPlaced = true;
                break;
              }
            }
          }
        }
      }

      scheduledPerAssignment.set(pmAsg.assignmentId, scheduled);
      scheduledPerAssignment.set(paiAsg.assignmentId, scheduled);
    }
  });

  // --------------------------------------------------------------------------
  // STEP 2B: SCHEDULE ALAM DAN MANUSIA (AM) WITH CO-TEACHING (2 TEACHERS SIMULTANEOUSLY, [2,1] / [2,2] 集中连堂)
  // --------------------------------------------------------------------------
  nonPrasekolahClasses.forEach((cls) => {
    const classLevel = resolveClassLevel(cls);
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

      const teacherIds = teacherId2 ? [teacherId1, teacherId2] : [teacherId1];
      const amBlocks = decomposeSubjectCompactly('AM', required - scheduled, classLevel).sort((a, b) => b - a);
      const recessAfter = isKP2027Year1 && classLevel === 1 ? 4 : 5;

      for (const blockLen of amBlocks) {
        let blockPlaced = false;
        for (const strictPhase of [true, false]) {
          if (blockPlaced) break;
          const sortedDays = sortDaysLeastLoadedFirst([...DAYS_OF_WEEK], teacherIds);

          for (const day of sortedDays) {
            if (blockPlaced) break;
            if (getSubjectPeriodsOnDay(cls.classId, 'AM', day).length > 0) continue;

            const maxP = getDailyMaxPeriods(day, classLevel, academicYear);
            const candidateStarts: number[] = [];
            for (let p = 1; p <= maxP - blockLen + 1; p++) {
              candidateStarts.push(p);
            }
            if (blockLen === 2) {
              candidateStarts.sort((pA, pB) => {
                const sA = scoreDoubleSlotCandidate(pA, pA + 1, recessAfter);
                const sB = scoreDoubleSlotCandidate(pB, pB + 1, recessAfter);
                return sB - sA || pA - pB;
              });
            }

            for (const p of candidateStarts) {
              if (blockLen === 2 && strictPhase && scoreDoubleSlotCandidate(p, p + 1, recessAfter) < 100) {
                continue;
              }
              const periodsToBook = blockLen === 2 ? [p, p + 1] : [p];
              const slotsFree = periodsToBook.every((per) => {
                const cKey = `${cls.classId}_${day}_${per}`;
                const t1Key = `${teacherId1}_${day}_${per}`;
                const t2Key = teacherId2 ? `${teacherId2}_${day}_${per}` : null;
                return !classSlotOccupied.has(cKey) && !teacherSlotOccupied.has(t1Key) && (!t2Key || !teacherSlotOccupied.has(t2Key));
              });
              if (!slotsFree) continue;

              const capLimit = strictPhase ? 7 : 8;
              const allowOver7 = !strictPhase;
              const t1Valid = canTeacherTakeBlockOnDay(teacherId1, day, periodsToBook, classLevel, strictPhase, capLimit, allowOver7);
              const t2Valid = teacherId2
                ? canTeacherTakeBlockOnDay(teacherId2, day, periodsToBook, classLevel, strictPhase, capLimit, allowOver7)
                : true;

              if (t1Valid && t2Valid) {
                periodsToBook.forEach((per) => {
                  classSlotOccupied.add(`${cls.classId}_${day}_${per}`);
                  teacherSlotOccupied.add(`${teacherId1}_${day}_${per}`);
                  incTeacherDayCount(teacherId1, day);
                  addTeacherPeriodOnDay(teacherId1, day, per);

                  if (teacherId2) {
                    teacherSlotOccupied.add(`${teacherId2}_${day}_${per}`);
                    incTeacherDayCount(teacherId2, day);
                    addTeacherPeriodOnDay(teacherId2, day, per);
                  }

                  recordSubjectPeriod(cls.classId, 'AM', day, per);
                  const lessonId = `am_${cls.classId}_${day}_P${per}`;

                  lessons.push({
                    id: lessonId,
                    day,
                    periodNumber: per,
                    classId: cls.classId,
                    className: cls.className,
                    subjectCode: 'AM',
                    subjectName: 'Alam dan Manusia',
                    teacherId: teacherId1,
                    teacherName: combinedTeacherName,
                    countsAsClassPeriod: true,
                    countsAsTeacherPeriod: true,
                  });

                  if (teacherId2 && t2) {
                    lessons.push({
                      id: `co_am_${cls.classId}_${day}_P${per}`,
                      day,
                      periodNumber: per,
                      classId: cls.classId,
                      className: cls.className,
                      subjectCode: 'AM',
                      subjectName: 'Alam dan Manusia (Co-Teaching)',
                      teacherId: teacherId2,
                      teacherName: t2.fullName,
                      parentTimetableSlotId: lessonId,
                      countsAsClassPeriod: false,
                      countsAsTeacherPeriod: true,
                    });
                  }
                });

                scheduled += periodsToBook.length;
                blockPlaced = true;
                break;
              }
            }
          }
        }
      }

      scheduledPerAssignment.set(asg.assignmentId, scheduled);
    });
  });

  // --------------------------------------------------------------------------
  // STEP 3: SCHEDULE REMAINING CORE ACADEMIC SUBJECTS (BC, BM, BI, MT, SN, etc.)
  // Global Priority: All [2] blocks (Heaviest Teacher First) BEFORE [1] blocks
  // Enforces Day-Capacity Feasibility Check, 2+1 Separated Languages (NO 3 consecutive),
  // Soft Daily Subject Cap fallback, and Intra-Class Swap Repair (Zero Blank Guarantee).
  // --------------------------------------------------------------------------
  const remainingAssignments = academicAndPjAssignments.filter((a) => {
    const isPj = isPJSubject(a.canonicalSubjectCode, a.subjectName);
    const isPmOrPai = isPairedMoralIslam(a.canonicalSubjectCode);
    return !isPj && !isPmOrPai;
  });

  // Track unscheduled weekly periods per (classId, subjectCode) for canSafelyAssignBlockToDay
  const remainingByClassMap = new Map<string, Map<string, number>>();
  remainingAssignments.forEach((asg) => {
    const rem = Math.max(0, (asg.effectiveWeeklyPeriods || 0) - (scheduledPerAssignment.get(asg.assignmentId) || 0));
    if (rem <= 0) return;
    const cMap = remainingByClassMap.get(asg.classId) || new Map<string, number>();
    const codeU = asg.canonicalSubjectCode.toUpperCase();
    cMap.set(codeU, (cMap.get(codeU) || 0) + rem);
    remainingByClassMap.set(asg.classId, cMap);
  });

  interface EngineBlockItem {
    asg: SubjectAssignment;
    blockLen: number;
    classLevel: number;
    teacherWeeklyLoad: number;
    priorityTier: number; // 1 = [2] core, 2 = [2] elective, 3 = [1] core/merge, 4 = [1] PK/MZ
  }

  const engineBlockQueue: EngineBlockItem[] = [];
  remainingAssignments.forEach((asg) => {
    const required = asg.effectiveWeeklyPeriods;
    const scheduled = scheduledPerAssignment.get(asg.assignmentId) || 0;
    const clsObj = nonPrasekolahClasses.find((c) => c.classId === asg.classId);
    const classLevel = resolveClassLevel(clsObj || { className: asg.className });
    const tWeekly = teacherWeeklyTotals.get(asg.teacherId) || 0;
    const codeU = asg.canonicalSubjectCode.toUpperCase();
    const isElectiveDouble = ['PSV', 'RBT', 'SEJ'].includes(codeU);
    const isMinorSingle = ['PK', 'MZ'].includes(codeU);

    const blocks = decomposeSubjectCompactly(asg.canonicalSubjectCode, required - scheduled, classLevel).sort((a, b) => b - a);
    blocks.forEach((blockLen) => {
      const priorityTier =
        blockLen >= 2 ? (isElectiveDouble ? 2 : 1) : isMinorSingle ? 4 : 3;
      engineBlockQueue.push({
        asg,
        blockLen,
        classLevel,
        teacherWeeklyLoad: tWeekly,
        priorityTier,
      });
    });
  });

  engineBlockQueue.sort((a, b) => {
    if (a.priorityTier !== b.priorityTier) return a.priorityTier - b.priorityTier;
    if (b.blockLen !== a.blockLen) return b.blockLen - a.blockLen;
    if (b.teacherWeeklyLoad !== a.teacherWeeklyLoad) return b.teacherWeeklyLoad - a.teacherWeeklyLoad;
    return b.asg.effectiveWeeklyPeriods - a.asg.effectiveWeeklyPeriods;
  });

  const bookEngineBlock = (asg: SubjectAssignment, day: string, periodsToBook: number[]) => {
    const teacherObj = teacherMap.get(asg.teacherId);
    const codeU = asg.canonicalSubjectCode.toUpperCase();
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

    scheduledPerAssignment.set(asg.assignmentId, (scheduledPerAssignment.get(asg.assignmentId) || 0) + periodsToBook.length);
    const cMap = remainingByClassMap.get(asg.classId);
    if (cMap) {
      cMap.set(codeU, Math.max(0, (cMap.get(codeU) || 0) - periodsToBook.length));
    }
  };

  engineBlockQueue.forEach((item) => {
    const { asg, blockLen, classLevel } = item;
    const personalCap = getTeacherPersonalDailyCap(teacherWeeklyTotals.get(asg.teacherId) || 0);
    const baseMaxSubjects = getMaxSubjectsPerDay(classLevel);
    const isMajorLang = isMajorLanguageSubject(asg.canonicalSubjectCode);
    const recessAfter = isKP2027Year1 && classLevel === 1 ? 4 : 5;
    const classRemMap = remainingByClassMap.get(asg.classId);

    // Fix B: Strict 4/6-subject preference in tiers 1-4 (with Day-Capacity Feasibility check),
    // automatically relaxing to +1/+2 subjects in tiers 5-7 so zero slots are left blank!
    const capTiers: Array<{ cap: number; strictBreaks: boolean; allowOver7: boolean; maxSubjects: number; checkFeasible: boolean }> = [
      { cap: Math.min(7, personalCap), strictBreaks: true, allowOver7: false, maxSubjects: baseMaxSubjects, checkFeasible: true },
      { cap: 7, strictBreaks: true, allowOver7: false, maxSubjects: baseMaxSubjects, checkFeasible: true },
      { cap: 7, strictBreaks: false, allowOver7: false, maxSubjects: baseMaxSubjects, checkFeasible: true },
      { cap: MAX_TEACHER_DAILY_PERIODS, strictBreaks: false, allowOver7: true, maxSubjects: baseMaxSubjects, checkFeasible: false },
      { cap: 7, strictBreaks: true, allowOver7: false, maxSubjects: baseMaxSubjects + 1, checkFeasible: false },
      { cap: MAX_TEACHER_DAILY_PERIODS, strictBreaks: false, allowOver7: true, maxSubjects: baseMaxSubjects + 1, checkFeasible: false },
      { cap: MAX_TEACHER_DAILY_PERIODS, strictBreaks: false, allowOver7: true, maxSubjects: baseMaxSubjects + 2, checkFeasible: false },
    ];

    let placed = false;

    const existingDoubleDays = isMajorLang && blockLen === 1
      ? sortDaysLeastLoadedFirst(
          DAYS_OF_WEEK.filter((d) => getSubjectPeriodsOnDay(asg.classId, asg.canonicalSubjectCode, d).length === 2),
          [asg.teacherId]
        )
      : [];
    const unusedDays = sortDaysLeastLoadedFirst(
      DAYS_OF_WEEK.filter((d) => getSubjectPeriodsOnDay(asg.classId, asg.canonicalSubjectCode, d).length === 0),
      [asg.teacherId]
    );
    const otherUsedDays = sortDaysLeastLoadedFirst(
      DAYS_OF_WEEK.filter((d) => {
        const cnt = getSubjectPeriodsOnDay(asg.classId, asg.canonicalSubjectCode, d).length;
        return cnt > 0 && !(isMajorLang && blockLen === 1 && cnt === 2);
      }),
      [asg.teacherId]
    );
    const dayCandidates = [...existingDoubleDays, ...unusedDays, ...otherUsedDays];

    for (const tierCfg of capTiers) {
      if (placed) break;

      for (const day of dayCandidates) {
        if (placed) break;

        const currentClassDayLessons = lessons.filter(
          (l) => l.classId === asg.classId && l.day === day && !l.isPemulihan && l.countsAsClassPeriod
        );
        const existingSubPeriods = getSubjectPeriodsOnDay(asg.classId, asg.canonicalSubjectCode, day);

        if (
          !canAddSubjectToClassDay(currentClassDayLessons, asg.canonicalSubjectCode, blockLen, classLevel, {
            maxSubjectsOverride: tierCfg.maxSubjects,
            existingPeriodPositions: existingSubPeriods,
          })
        ) {
          continue;
        }

        const maxP = getDailyMaxPeriods(day, classLevel, academicYear);

        if (
          tierCfg.checkFeasible &&
          !canSafelyAssignBlockToDay({
            dayMaxPeriods: maxP,
            currentDayLessons: currentClassDayLessons,
            candidateSubjectCode: asg.canonicalSubjectCode,
            blockLength: blockLen,
            classLevel,
            maxSubjectsOverride: tierCfg.maxSubjects,
            remainingSubjectPeriodsInWeek: classRemMap,
          })
        ) {
          continue;
        }

        const candidateStarts = Array.from({ length: Math.max(0, maxP - blockLen + 1) }, (_, idx) => idx + 1);

        // Slot ordering:
        // - [2]: prefer same side of recess AND avoid stranding 1-slot orphan holes
        // - [1] on a day with existing [2]: place on OPPOSITE side of recess (2+1 separated), NEVER 3 consecutive!
        if (blockLen === 2) {
          candidateStarts.sort((pA, pB) => {
            const sA = scoreDoubleSlotCandidate(pA, pA + 1, recessAfter);
            const sB = scoreDoubleSlotCandidate(pB, pB + 1, recessAfter);
            if (sA !== sB) return sB - sA;

            const orphanPen = (p: number) => {
              const isM = p <= recessAfter;
              const lo = isM ? 1 : recessAfter + 1;
              const hi = isM ? recessAfter : maxP;
              let leftE = 0;
              for (let k = p - 1; k >= lo; k--) {
                if (classSlotOccupied.has(`${asg.classId}_${day}_${k}`)) break;
                leftE++;
              }
              let rightE = 0;
              for (let k = p + 2; k <= hi; k++) {
                if (classSlotOccupied.has(`${asg.classId}_${day}_${k}`)) break;
                rightE++;
              }
              let pen = 0;
              if ((leftE + rightE) % 2 === 1) pen += 3;
              if (leftE === 1 && rightE > 0) pen += 3;
              if (rightE === 1 && leftE > 0) pen += 3;
              if (leftE === 0 || rightE === 0) pen -= 1;
              return pen;
            };
            const opA = orphanPen(pA);
            const opB = orphanPen(pB);
            if (opA !== opB) return opA - opB;
            return pA - pB;
          });
        } else if (blockLen === 1 && existingSubPeriods.length === 2) {
          const exIsMorning = existingSubPeriods[0] <= recessAfter;
          candidateStarts.sort((pA, pB) => {
            const sideA = (pA <= recessAfter) !== exIsMorning ? 0 : 1;
            const sideB = (pB <= recessAfter) !== exIsMorning ? 0 : 1;
            if (sideA !== sideB) return sideA - sideB;
            return pA - pB;
          });
        } else if (blockLen === 1 && existingSubPeriods.length === 1) {
          candidateStarts.sort((pA, pB) => {
            const adjA = Math.abs(existingSubPeriods[0] - pA) === 1 ? 1 : 0;
            const adjB = Math.abs(existingSubPeriods[0] - pB) === 1 ? 1 : 0;
            return adjB - adjA || pA - pB;
          });
        }

        for (const p of candidateStarts) {
          const periodsToBook = Array.from({ length: blockLen }, (_, i) => p + i);

          if (
            !canAddSubjectToClassDay(currentClassDayLessons, asg.canonicalSubjectCode, blockLen, classLevel, {
              maxSubjectsOverride: tierCfg.maxSubjects,
              existingPeriodPositions: existingSubPeriods,
              candidatePeriodPositions: periodsToBook,
            })
          ) {
            continue;
          }

          // 一年级第 4 节 (紧邻 PKAR 0.5节) 防重复科任老师校验
          if (isKP2027Year1 && classLevel === 1 && periodsToBook.includes(4)) {
            const existingYear1P4Lessons = lessons
              .filter(
                (l) =>
                  resolveClassLevel(l) === 1 &&
                  l.periodNumber === 4 &&
                  l.countsAsClassPeriod &&
                  !l.isPemulihan
              )
              .map((l) => ({ day: l.day, subjectCode: l.subjectCode, teacherId: l.teacherId }));

            if (
              !canAssignYear1Period4(
                classLevel,
                4,
                asg.canonicalSubjectCode,
                asg.teacherId,
                existingYear1P4Lessons,
                tierCfg.strictBreaks
              )
            ) {
              continue;
            }
          }

          const slotsFree = periodsToBook.every((per) => {
            const cKey = `${asg.classId}_${day}_${per}`;
            const tKey = `${asg.teacherId}_${day}_${per}`;
            return !classSlotOccupied.has(cKey) && !teacherSlotOccupied.has(tKey);
          });
          if (!slotsFree) continue;

          // 严格执行教师单日 <= 8.0 节绝对硬上限（含连堂 +2、周二 PN +1、PKAR +0.5）与个人每日上限
          const teacherCanTake = canTeacherTakeBlockOnDay(
            asg.teacherId,
            day,
            periodsToBook,
            classLevel,
            tierCfg.strictBreaks,
            tierCfg.cap,
            tierCfg.allowOver7
          );

          if (teacherCanTake) {
            bookEngineBlock(asg, day, periodsToBook);
            placed = true;
            break;
          }
        }
      }
    }

    // Same-Class [2]-Block Evict-and-Slide fallback if a double block couldn't find 2 adjacent slots directly
    if (!placed && blockLen === 2) {
      for (const day of dayCandidates) {
        if (placed) break;
        const maxP = getDailyMaxPeriods(day, classLevel, academicYear);
        const currentDayLessons = lessons.filter(
          (l) => l.classId === asg.classId && l.day === day && !l.isPemulihan && l.countsAsClassPeriod
        );
        const exSub = getSubjectPeriodsOnDay(asg.classId, asg.canonicalSubjectCode, day);
        if (
          !canAddSubjectToClassDay(currentDayLessons, asg.canonicalSubjectCode, 2, classLevel, {
            maxSubjectsOverride: baseMaxSubjects + 2,
            existingPeriodPositions: exSub,
          })
        ) {
          continue;
        }

        // Look for (p, p+1) where one slot is empty and the other has an unlocked single lesson movable to another slot
        for (let p = 1; p < maxP && !placed; p++) {
          if (p === recessAfter) continue; // keep double within same session
          const k1 = `${asg.classId}_${day}_${p}`;
          const k2 = `${asg.classId}_${day}_${p + 1}`;
          const occ1 = classSlotOccupied.has(k1);
          const occ2 = classSlotOccupied.has(k2);
          if (occ1 === occ2) continue; // need exactly 1 occupied and 1 empty

          const occP = occ1 ? p : p + 1;
          const occL = lessons.find(
            (l) =>
              l.classId === asg.classId &&
              l.day === day &&
              l.periodNumber === occP &&
              l.countsAsClassPeriod &&
              !l.isPemulihan &&
              !l.isPN &&
              l.subjectCode.toUpperCase() !== 'PJ' &&
              l.subjectCode.toUpperCase() !== 'PM/PAI'
          );
          if (!occL) continue;
          const occSubPeriods = getSubjectPeriodsOnDay(asg.classId, occL.subjectCode, day);
          if (occSubPeriods.length >= 2) continue;

          // Unbook occL temporarily, move to an empty slot on another day or same day
          const occIdx = lessons.findIndex((l) => l.id === occL.id);
          if (occIdx !== -1) lessons.splice(occIdx, 1);
          classSlotOccupied.delete(`${occL.classId}_${day}_${occP}`);
          teacherSlotOccupied.delete(`${occL.teacherId}_${day}_${occP}`);
          incTeacherDayCount(occL.teacherId, day, -1);
          removeTeacherPeriodOnDay(occL.teacherId, day, occP);
          unrecordSubjectPeriod(occL.classId, occL.subjectCode, day, occP);

          const periodsToBook = [p, p + 1];
          const dayLessonsAfter = lessons.filter(
            (l) => l.classId === asg.classId && l.day === day && !l.isPemulihan && l.countsAsClassPeriod
          );
          const canPlaceDoubleHere =
            canAddSubjectToClassDay(dayLessonsAfter, asg.canonicalSubjectCode, 2, classLevel, {
              maxSubjectsOverride: baseMaxSubjects + 2,
              existingPeriodPositions: getSubjectPeriodsOnDay(asg.classId, asg.canonicalSubjectCode, day),
              candidatePeriodPositions: periodsToBook,
            }) &&
            periodsToBook.every((per) => !teacherSlotOccupied.has(`${asg.teacherId}_${day}_${per}`)) &&
            canTeacherTakeBlockOnDay(asg.teacherId, day, periodsToBook, classLevel, false, MAX_TEACHER_DAILY_PERIODS, true);

          let movedOcc = false;
          if (canPlaceDoubleHere) {
              for (const altDay of DAYS_OF_WEEK) {
              if (movedOcc) break;
              const altMax = getDailyMaxPeriods(altDay, classLevel, academicYear);
              for (let altP = 1; altP <= altMax && !movedOcc; altP++) {
                if (altDay === day && (altP === p || altP === p + 1)) continue;
                if (classSlotOccupied.has(`${asg.classId}_${altDay}_${altP}`)) continue;
                if (teacherSlotOccupied.has(`${occL.teacherId}_${altDay}_${altP}`)) continue;
                const altDayLessons = lessons.filter(
                  (l) => l.classId === asg.classId && l.day === altDay && !l.isPemulihan && l.countsAsClassPeriod
                );
                if (
                  canAddSubjectToClassDay(altDayLessons, occL.subjectCode, 1, classLevel, {
                    maxSubjectsOverride: baseMaxSubjects + 2,
                    existingPeriodPositions: getSubjectPeriodsOnDay(asg.classId, occL.subjectCode, altDay),
                    candidatePeriodPositions: [altP],
                  }) &&
                  canTeacherTakeBlockOnDay(occL.teacherId, altDay, [altP], classLevel, false, MAX_TEACHER_DAILY_PERIODS, true)
                ) {
                  classSlotOccupied.add(`${occL.classId}_${altDay}_${altP}`);
                  teacherSlotOccupied.add(`${occL.teacherId}_${altDay}_${altP}`);
                  incTeacherDayCount(occL.teacherId, altDay, 1);
                  addTeacherPeriodOnDay(occL.teacherId, altDay, altP);
                  recordSubjectPeriod(occL.classId, occL.subjectCode, altDay, altP);
                  lessons.push({ ...occL, day: altDay, periodNumber: altP });
                  bookEngineBlock(asg, day, periodsToBook);
                  movedOcc = true;
                  placed = true;
                }
              }
            }
          }

          if (!movedOcc) {
            classSlotOccupied.add(`${occL.classId}_${day}_${occP}`);
            teacherSlotOccupied.add(`${occL.teacherId}_${day}_${occP}`);
            incTeacherDayCount(occL.teacherId, day, 1);
            addTeacherPeriodOnDay(occL.teacherId, day, occP);
            recordSubjectPeriod(occL.classId, occL.subjectCode, day, occP);
            lessons.push(occL);
          }
        }
      }
    }
  });

  // --------------------------------------------------------------------------
  // STEP 3B: MANDATORY INTRA-CLASS SWAP REPAIR PASS (ZERO BLANK GUARANTEE)
  // --------------------------------------------------------------------------
  repairEmptyClassSlots({
    classes: nonPrasekolahClasses,
    assignments: normalizedAssignments,
    lessons,
    scheduledPerAssignment,
    teacherMap,
    classSlotOccupied,
    teacherSlotOccupied,
    incTeacherDayCount,
    addTeacherPeriodOnDay,
    removeTeacherPeriodOnDay,
    getTeacherDayLoad,
    recordSubjectPeriod,
    unrecordSubjectPeriod,
    getSubjectPeriodsOnDay,
    canTeacherTakeBlockOnDay,
    academicYear,
  });

  // --------------------------------------------------------------------------
  // 3. PEMULIHAN (辅导课) 2+1+1 分布与“优先抽连堂第2节”算法 (同步受限于每日 <= 8 节硬上限)
  // --------------------------------------------------------------------------
  pemulihanAssignmentsList.forEach((pAsg) => {
    const required = pAsg.effectiveWeeklyPeriods || 4;
    const parentCode = (
      pAsg.assignmentType === 'PBM' ||
      pAsg.canonicalSubjectCode === 'PBM' ||
      pAsg.subjectName?.toUpperCase().includes('BM') ||
      pAsg.subjectName?.toUpperCase().includes('MELAYU')
    ) ? 'BM' : 'MT';

    const parentLessons = lessons
      .filter(
        (l) =>
          !l.isPemulihan &&
          !l.isPN &&
          l.classId === pAsg.classId &&
          (l.subjectCode.toUpperCase() === parentCode || l.subjectCode.toUpperCase().startsWith(parentCode))
      )
      .sort((a, b) => DAYS_OF_WEEK.indexOf(a.day as any) - DAYS_OF_WEEK.indexOf(b.day as any) || a.periodNumber - b.periodNumber);

    const isSecondOfDoubleBlock = (lesson: any) =>
      parentLessons.some(
        (other) =>
          other.day === lesson.day &&
          other.periodNumber === lesson.periodNumber - 1 &&
          isAdjacentPeriod(other.periodNumber, lesson.periodNumber)
      );

    const selectedSlots: any[] = [];
    const dayAllocationCount = new Map<string, number>();

    const canPemTeacherAddOnDay = (day: string, countToAdd: number) => {
      const curLoad = getTeacherDayLoad(pAsg.teacherId, day) + (dayAllocationCount.get(day) || 0);
      return curLoad + countToAdd <= MAX_TEACHER_DAILY_PERIODS + 1e-6;
    };

    if (required === 4) {
      for (const l1 of parentLessons) {
        if (selectedSlots.length >= 2) break;
        const l2 = parentLessons.find(
          (cand) => cand.day === l1.day && cand.periodNumber === l1.periodNumber + 1 && isAdjacentPeriod(l1.periodNumber, cand.periodNumber)
        );
        if (l2) {
          const tKey1 = `${pAsg.teacherId}_${l1.day}_${l1.periodNumber}`;
          const tKey2 = `${pAsg.teacherId}_${l2.day}_${l2.periodNumber}`;
          if (!teacherSlotOccupied.has(tKey1) && !teacherSlotOccupied.has(tKey2) && canPemTeacherAddOnDay(l1.day, 2)) {
            selectedSlots.push(l1, l2);
            dayAllocationCount.set(l1.day, 2);
            break;
          }
        }
      }

      for (const l of parentLessons) {
        if (selectedSlots.length >= 4) break;
        if (dayAllocationCount.has(l.day)) continue;

        const isFirstOfDouble = parentLessons.some(
          (cand) => cand.day === l.day && cand.periodNumber === l.periodNumber + 1 && isAdjacentPeriod(l.periodNumber, cand.periodNumber)
        );
        if (isFirstOfDouble && !isSecondOfDoubleBlock(l)) {
          continue;
        }

        const tKey = `${pAsg.teacherId}_${l.day}_${l.periodNumber}`;
        if (!teacherSlotOccupied.has(tKey) && canPemTeacherAddOnDay(l.day, 1)) {
          selectedSlots.push(l);
          dayAllocationCount.set(l.day, 1);
        }
      }
    }

    if (selectedSlots.length < required) {
      for (const l of parentLessons) {
        if (selectedSlots.length >= required) break;
        if (selectedSlots.some((s) => s.id === l.id)) continue;
        const tKey = `${pAsg.teacherId}_${l.day}_${l.periodNumber}`;
        if (!teacherSlotOccupied.has(tKey) && canPemTeacherAddOnDay(l.day, 1)) {
          selectedSlots.push(l);
          dayAllocationCount.set(l.day, (dayAllocationCount.get(l.day) || 0) + 1);
        }
      }
    }

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
        countsAsClassPeriod: false,
        countsAsTeacherPeriod: true,
      });
    });

    scheduledPerAssignment.set(pAsg.assignmentId, selectedSlots.length);
  });

  tasmikAssignments.forEach((tAsg) => {
    scheduledPerAssignment.set(tAsg.assignmentId, 0);
  });

  // --------------------------------------------------------------------------
  // STEP 5: 自动将每日 PKAR (0.5 节) 绑定给“下课前那一节”的进班老师，并计入 +0.5 节工作量
  // --------------------------------------------------------------------------
  const finalLessons = autoPairPKARWithPreRecessTeacher(
    lessons,
    DAYS_OF_WEEK as any,
    (teacherId, day, delta) => incTeacherDayCount(teacherId, day, delta),
    academicYear
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
