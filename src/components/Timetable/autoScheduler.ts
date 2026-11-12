/**
 * iSEPADU AI — Auto-Scheduling Engine for 2027 Dual-Track Timetable
 * Implements strict KPM pedagogical constraints, minute-level collision detection,
 * hard zero-collision guarantees, and 4-tier constraint relaxation.
 */

import { SubjectAllocationRow } from './SchoolTimetableMatrix';
import { 
  DayOfWeek, 
  DAYS_OF_WEEK, 
  ScheduleGrid, 
  SlotTimeInfo, 
  TimetableCell, 
  TimetableClash, 
  checkIntervalOverlap, 
  getGradeDaySlots 
} from './types';
import {
  decomposeSubjectBlocks,
  canClassAcceptSubjectOnDay,
  getMaxDailyPeriodsForSubject,
  canAssignYear1Period4,
  computeScheduleSignature,
  isSignificantlyDifferentFromPrevious,
  getPreviousScheduleSignature,
  setPreviousScheduleSignature,
  resetScheduleSignature,
} from '../../utils/timetableEngine';

export {
  computeScheduleSignature,
  isSignificantlyDifferentFromPrevious,
  getPreviousScheduleSignature,
  setPreviousScheduleSignature,
  resetScheduleSignature,
};

// --------------------------------------------------------------------------
// 1. 真实时钟重叠检测器：彻底杜绝 T.1 (W8 11:45-12:15) 与 T.6 (W9 11:45-12:15) 错位撞课
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
      if (
        (interval.subjectCode === 'TASMIK' || interval.subjectCode === 'TAS') &&
        (candidateSubjectCode === 'TASMIK' || candidateSubjectCode === 'TAS')
      ) {
        continue;
      }
      return true; // 存在时间重叠，严禁排入！
    }
  }
  return false;
}

// --------------------------------------------------------------------------
// 2. 连堂课寻优评分函数：优先不跨下课，迫不得已时允许跨下课 (P5 -> Rehat -> P6)
// --------------------------------------------------------------------------
export function scoreDoubleSlotCandidate(
  p1: number,
  p2: number,
  recessAfterPeriod: number = 5
): number {
  const crossesRecess = p1 === recessAfterPeriod && p2 === recessAfterPeriod + 1;
  // 不跨下课得 100 分（优先采用）；跨下课扣 60 分（得 40 分，仅在无其他空位时作为次选保底）
  return crossesRecess ? 40 : 100;
}

export interface SubjectDayRequirement {
  rowId: string;
  subjectCode: string;
  subjectName: string;
  teacherCode: string;
  teacherName?: string;
  grade: number;
  blockLengths: number[];
}

/**
 * Decomposes a subject's weekly period count into blocks according to KPM distribution rules
 */
export function getSubjectBlockDistribution(subjectCode: string, totalPeriods: number): number[] {
  if (totalPeriods <= 0) return [];
  return decomposeSubjectBlocks(subjectCode, totalPeriods);
}

/**
 * Auto-pairs PKAR (0.5 period) ONLY for Year 1 (Tahun 1) to the teacher in the pre-recess period (W4, 09:00 - 09:30).
 * PKAR is 09:30 - 09:45, followed by Recess at 09:45.
 * Years 2 to 6 do NOT have PKAR (starts 07:15, W1-W5, recess at 09:45).
 */
export function autoPairPKARInGrid(grid: ScheduleGrid): void {
  // PKAR 只有一年级。二到六年级没有。
  const grade = 1;
  DAYS_OF_WEEK.forEach((day) => {
    // 一年级下课前最后一节正课是 W4 (09:00 - 09:30)，接 09:30 - 09:45 PKAR，09:45 下课
    const preRecessSlot = 'W4';
    const preRecessCell = grid[grade]?.[day]?.[preRecessSlot];

    const pkarSlot = getGradeDaySlots(grade, day).find((s) => s.slotId === 'PKAR');
    if (pkarSlot) {
      if (!grid[grade]) grid[grade] = {} as any;
      if (!grid[grade][day]) grid[grade][day] = {};

      if (preRecessCell && preRecessCell.teacherCode && preRecessCell.teacherCode.trim() !== '') {
        grid[grade][day]['PKAR'] = {
          subjectId: 'pkar',
          subjectCode: 'PKAR',
          subjectName: 'Program Pembentukan Karakter (15 Min)',
          teacherCode: preRecessCell.teacherCode,
          teacherName: preRecessCell.teacherName,
          periodLength: 0.5,
          isLocked: true,
          isAutoPKAR: true,
        };
      } else {
        grid[grade][day]['PKAR'] = {
          subjectId: 'pkar',
          subjectCode: 'PKAR',
          subjectName: 'Program Pembentukan Karakter (15 Min)',
          teacherCode: '',
          teacherName: '',
          periodLength: 0.5,
          isLocked: true,
          isAutoPKAR: true,
        };
      }
    }
  });

  // 严格确保二到六年级完全没有 PKAR 记录
  [2, 3, 4, 5, 6].forEach((g) => {
    DAYS_OF_WEEK.forEach((d) => {
      if (grid[g]?.[d]?.['PKAR']) {
        delete grid[g][d]['PKAR'];
      }
    });
  });
}

/**
 * Initializes an empty ScheduleGrid for grades 1 to 6
 */
export function createEmptyScheduleGrid(): ScheduleGrid {
  const grid: ScheduleGrid = {};
  [1, 2, 3, 4, 5, 6].forEach((grade) => {
    grid[grade] = {
      ISNIN: {},
      SELASA: {},
      RABU: {},
      KHAMIS: {},
      JUMAAT: {},
    };
    DAYS_OF_WEEK.forEach((day) => {
      const slots = getGradeDaySlots(grade, day);
      slots.forEach((s) => {
        if (s.slotId === 'MEMBACA' && grade === 1) {
          grid[grade][day][s.slotId] = {
            subjectId: 'membaca',
            subjectCode: 'MEMBACA',
            subjectName: 'Program Membaca',
            teacherCode: '',
            teacherName: 'Klik untuk pilih guru',
            periodLength: 0.5,
            isLocked: false,
            isManualSlot: true,
          };
        } else if (s.slotId === 'TASMIK') {
          // Dedicated post-school manual slot left empty by default
          grid[grade][day][s.slotId] = {
            subjectId: `manual_tasmik_${grade}_${day}`,
            subjectCode: 'TASMIK',
            subjectName: 'Slot Khas Tasmik (Selepas Sekolah)',
            teacherCode: '',
            teacherName: 'Klik untuk pilih Ustaz/Ustazah',
            periodLength: 1,
            isLocked: false,
            isManualSlot: true,
          };
        } else {
          grid[grade][day][s.slotId] = null;
        }
      });
    });
  });
  return grid;
}


/**
 * Scans the schedule grid and detects any teacher minute-overlap clashes
 */
export function detectScheduleClashes(grid: ScheduleGrid): TimetableClash[] {
  const clashes: TimetableClash[] = [];

  DAYS_OF_WEEK.forEach((day) => {
    // Collect all assignments on this day with exact start and end minute
    const dayAssignments: Array<{
      teacherCode: string;
      subjectCode: string;
      grade: number;
      slotId: string;
      startMin: number;
      endMin: number;
      timeStr: string;
    }> = [];

    [1, 2, 3, 4, 5, 6].forEach((grade) => {
      const slots = getGradeDaySlots(grade, day);
      slots.forEach((s) => {
        if (s.isRecess) return;
        const cell = grid[grade]?.[day]?.[s.slotId];
        if (cell && cell.teacherCode && cell.teacherCode.trim() !== '') {
          dayAssignments.push({
            teacherCode: cell.teacherCode.trim(),
            subjectCode: cell.subjectCode || '',
            grade,
            slotId: s.slotId,
            startMin: s.startMinutes,
            endMin: s.endMinutes,
            timeStr: `${s.startTime}-${s.endTime}`,
          });
        }
      });
    });

    // Check all pairs for same teacher overlapping in clock time
    for (let i = 0; i < dayAssignments.length; i++) {
      for (let j = i + 1; j < dayAssignments.length; j++) {
        const a = dayAssignments[i];
        const b = dayAssignments[j];

        // Whitelist: PN is intentionally concurrent for all classes
        if (a.subjectCode === 'PN' || b.subjectCode === 'PN') continue;

        // Whitelist: TASMIK (Gabung Kelas) is intentionally concurrent after school
        if (
          (a.subjectCode === 'TASMIK' || a.subjectCode === 'TAS' || a.slotId === 'TASMIK') &&
          (b.subjectCode === 'TASMIK' || b.subjectCode === 'TAS' || b.slotId === 'TASMIK')
        ) {
          continue;
        }

        // Whitelist: MEMBACA (Year 1 independent morning slot)
        if (a.slotId === 'MEMBACA' || b.slotId === 'MEMBACA') continue;

        // If it's the exact same grade and slot, continue (not a cross-grade collision)
        if (a.grade === b.grade && a.slotId === b.slotId) continue;

        const aTeachers = a.teacherCode.split('/').map((c) => c.trim()).filter(Boolean);
        const bTeachers = b.teacherCode.split('/').map((c) => c.trim()).filter(Boolean);

        const overlappingTeacher = aTeachers.find((at) => bTeachers.includes(at));

        if (overlappingTeacher && a.grade !== b.grade) {
          if (checkIntervalOverlap(a.startMin, a.endMin, b.startMin, b.endMin)) {
            clashes.push({
              teacherCode: overlappingTeacher,
              day,
              gradeA: a.grade,
              slotA: a.slotId,
              timeA: a.timeStr,
              gradeB: b.grade,
              slotB: b.slotId,
              timeB: b.timeStr,
              message: `Guru [${overlappingTeacher}] bertembung pada hari ${day}: T.${a.grade} (${a.slotId} ${a.timeStr}) & T.${b.grade} (${b.slotId} ${b.timeStr})`,
            });
          }
        }
      }
    }
  });

  return clashes;
}

interface BlockToSchedule {
  id: string;
  grade: number;
  subjectCode: string;
  subjectName: string;
  teacherCode: string;
  secondaryTeacherCode?: string;
  length: number; // 1 or 2
  priority: number; // Lower = higher priority (Most-Constrained First)
  isMorningOnly?: boolean;
}

/**
 * High-performance 4-Tier Zero-Collision Auto-Scheduler Engine
 */
export function generateAutoSchedule(
  matrixData: SubjectAllocationRow[],
  classTeachers: Record<number, string> = {},
  academicYear: string = '2027',
  variationSeed: number = 0
): { grid: ScheduleGrid; clashes: TimetableClash[]; unplaced: string[] } {
  const grid = createEmptyScheduleGrid();
  const unplacedBlocks: string[] = [];

  // Deep clone matrixData
  const cleanMatrix: SubjectAllocationRow[] = JSON.parse(JSON.stringify(matrixData));

  // Helper to check KP2027 grade
  const isKP = (g: number) => {
    const yr = parseInt(academicYear, 10) || 2027;
    if (yr < 2027) return false;
    return g <= yr - 2026;
  };

  // Track teacher clock-time intervals: teacherCode -> TimeInterval[]
  const teacherIntervals = new Map<string, TimeInterval[]>();
  const addTeacherInterval = (teacherCode: string, interval: TimeInterval) => {
    const list = teacherIntervals.get(teacherCode) || [];
    list.push(interval);
    teacherIntervals.set(teacherCode, list);
  };
  const removeTeacherInterval = (teacherCode: string, interval: TimeInterval) => {
    const list = teacherIntervals.get(teacherCode) || [];
    const idx = list.findIndex(
      (i) =>
        i.day === interval.day &&
        i.startMinutes === interval.startMinutes &&
        i.endMinutes === interval.endMinutes &&
        i.classId === interval.classId
    );
    if (idx !== -1) list.splice(idx, 1);
  };

  // Track teacher daily period count: `${teacherCode}_${day}` -> number
  const teacherDayLoads = new Map<string, number>();
  const incTeacherDay = (teacherCode: string, day: string, amount: number = 1) => {
    const key = `${teacherCode}_${day}`;
    teacherDayLoads.set(key, (teacherDayLoads.get(key) || 0) + amount);
  };
  const decTeacherDay = (teacherCode: string, day: string, amount: number = 1) => {
    const key = `${teacherCode}_${day}`;
    teacherDayLoads.set(key, Math.max(0, (teacherDayLoads.get(key) || 0) - amount));
  };
  const getTeacherDayLoad = (teacherCode: string, day: string): number => {
    return teacherDayLoads.get(`${teacherCode}_${day}`) || 0;
  };

  // Helper: check if candidate slots are 100% collision-free in clock time
  const isSlotFreeForTeacher = (
    teacherCode: string,
    day: DayOfWeek,
    slots: SlotTimeInfo[],
    subjectCode: string,
    tier: number
  ): boolean => {
    if (!teacherCode) return true;
    const teachers = teacherCode.split('/').map((t) => t.trim()).filter(Boolean);

    for (const t of teachers) {
      const intervals = teacherIntervals.get(t) || [];

      // HARD CONSTRAINT: Absolute Zero Clock Overlap
      for (const s of slots) {
        if (isTeacherBusyInTimeRange(intervals, day, s.startMinutes, s.endMinutes, subjectCode)) {
          return false;
        }
      }

      // Check daily load caps
      const curLoad = getTeacherDayLoad(t, day);
      const maxCap = tier <= 2 ? 8 : (day === 'JUMAAT' ? 8 : 10);
      if (curLoad + slots.length > maxCap) {
        return false;
      }

      // Tier 1: enforce morning rest break (<= 4 periods before recess)
      if (tier === 1) {
        const curMorning = intervals.filter((i) => i.day === day && i.endMinutes <= 585).length;
        const newMorning = slots.filter((s) => s.endMinutes <= 585).length;
        if (curMorning + newMorning > 4) {
          return false;
        }
      }
    }
    return true;
  };

  // Book slots
  const bookSlots = (
    grade: number,
    day: DayOfWeek,
    slots: SlotTimeInfo[],
    cellData: Omit<TimetableCell, 'periodLength'>
  ) => {
    const teachers = cellData.teacherCode.split('/').map((t) => t.trim()).filter(Boolean);

    slots.forEach((s) => {
      grid[grade][day][s.slotId] = {
        ...cellData,
        periodLength: s.slotId === 'PKAR' ? 0.5 : 1,
      };

      teachers.forEach((t) => {
        addTeacherInterval(t, {
          day,
          startMinutes: s.startMinutes,
          endMinutes: s.endMinutes,
          classId: `T${grade}`,
          subjectCode: cellData.subjectCode,
        });
        incTeacherDay(t, day, s.slotId === 'PKAR' ? 0.5 : 1);
      });
    });
  };

  // Unbook slots (used for safe slot swapping)
  const unbookSlots = (grade: number, day: DayOfWeek, slots: SlotTimeInfo[]) => {
    slots.forEach((s) => {
      const cell = grid[grade][day][s.slotId];
      if (!cell) return;
      const teachers = cell.teacherCode.split('/').map((t) => t.trim()).filter(Boolean);
      teachers.forEach((t) => {
        removeTeacherInterval(t, {
          day,
          startMinutes: s.startMinutes,
          endMinutes: s.endMinutes,
          classId: `T${grade}`,
          subjectCode: cell.subjectCode,
        });
        decTeacherDay(t, day, s.slotId === 'PKAR' ? 0.5 : 1);
      });
      grid[grade][day][s.slotId] = null;
    });
  };

  // --------------------------------------------------------------------------
  // STEP 1: PLACE MANDATORY LOCKED SLOTS
  // (a) Perhimpunan (PN): Fixed on Tuesday (SELASA) W1 for all grades 1 to 6
  // (PN 不要放老师名字: teacherCode is explicitly empty)
  // --------------------------------------------------------------------------
  [1, 2, 3, 4, 5, 6].forEach((grade) => {
    const s = getGradeDaySlots(grade, 'SELASA').find((sl) => sl.slotId === 'W1');
    if (s) {
      bookSlots(grade, 'SELASA', [s], {
        subjectId: 'pn',
        subjectCode: 'PN',
        subjectName: 'PERHIMPUNAN RASMI',
        teacherCode: '',
        isLocked: true,
      });
    }
  });

  // (b) Year 1 Program Membaca (07:15 - 07:30): Fixed empty slot for manual assignment
  DAYS_OF_WEEK.forEach((day) => {
    const s = getGradeDaySlots(1, day).find((sl) => sl.slotId === 'MEMBACA');
    if (s) {
      grid[1][day]['MEMBACA'] = {
        subjectId: 'membaca',
        subjectCode: 'MEMBACA',
        subjectName: 'Program Membaca',
        teacherCode: '',
        teacherName: 'Klik untuk pilih guru',
        periodLength: 0.5,
        isLocked: false,
        isManualSlot: true,
      };
    }
  });

  // --------------------------------------------------------------------------
  // STEP 2: BUILD PRIORITY QUEUE OF ALL SUBJECT BLOCKS (Most-Constrained First)
  // --------------------------------------------------------------------------
  const blocks: BlockToSchedule[] = [];

  [1, 2, 3, 4, 5, 6].forEach((grade) => {
    // 1. Parallel PM / PAI blocks (Ustaz MFA teaches all 6 classes; top priority)
    const pmRow = cleanMatrix.find((r) => r.subjectCode.toUpperCase() === 'PM');
    const paiRow = cleanMatrix.find((r) => r.subjectCode.toUpperCase() === 'PAI');
    const pmPeriods = Number(pmRow?.periods[grade] || 0);
    const paiPeriods = Number(paiRow?.periods[grade] || 0);
    const pmTeacher = pmRow?.teachers[grade] || '';
    const paiTeacher = paiRow?.teachers[grade] || '';

    if (pmPeriods > 0 && paiPeriods > 0) {
      const totalP = Math.max(pmPeriods, paiPeriods);
      const combinedTeacher = `${pmTeacher}/${paiTeacher}`;
      const bLengths = totalP === 5 ? [2, 2, 1] : totalP === 4 ? [2, 2] : [totalP];
      bLengths.forEach((len, bIdx) => {
        blocks.push({
          id: `pm_pai_${grade}_${bIdx}`,
          grade,
          subjectCode: 'PM/PAI',
          subjectName: 'PENDIDIKAN MORAL / ISLAM',
          teacherCode: combinedTeacher,
          length: len,
          priority: 1, // Highest priority: MFA single bottleneck
        });
      });
    }

    // 2. PJ (Morning slots only, W1 or W2, max 1 period/day; strictly highest morning priority)
    const pjRow = cleanMatrix.find((r) => r.subjectCode.toUpperCase() === 'PJ');
    const pjPeriods = Number(pjRow?.periods[grade] || 0);
    if (pjPeriods > 0) {
      const t = pjRow?.teachers[grade] || '';
      for (let i = 0; i < pjPeriods; i++) {
        blocks.push({
          id: `pj_${grade}_${i}`,
          grade,
          subjectCode: 'PJ',
          subjectName: 'PENDIDIKAN JASMANI',
          teacherCode: t,
          length: 1,
          priority: 2,
          isMorningOnly: true,
        });
      }
    }

    // 3. Year 1 AM Co-Teaching (Guru 1 & Guru 2 simultaneous)
    if (grade === 1) {
      const amRow = cleanMatrix.find((r) => r.subjectCode.toUpperCase() === 'AM');
      const amPeriods = Number(amRow?.periods[1] || 0);
      if (amPeriods > 0) {
        const t1 = amRow?.teachers[1] || 'NCY';
        const t2 = amRow?.secondaryTeachers?.[1] || 'VY';
        blocks.push({
          id: 'am_1_2p',
          grade: 1,
          subjectCode: 'AM',
          subjectName: 'ALAM DAN MANUSIA (CO-TEACHING)',
          teacherCode: `${t1}/${t2}`,
          secondaryTeacherCode: t2,
          length: 2,
          priority: 3,
        });
        blocks.push({
          id: 'am_1_1p',
          grade: 1,
          subjectCode: 'AM',
          subjectName: 'ALAM DAN MANUSIA (CO-TEACHING)',
          teacherCode: `${t1}/${t2}`,
          secondaryTeacherCode: t2,
          length: 1,
          priority: 3,
        });
      }
    }

    // 4. Core subjects: BI, BC, BM, MT, SN, SEJ, RBT
    const otherCodes = ['BC', 'BM', 'BI', 'MT', 'SN', 'SEJ', 'RBT'];
    otherCodes.forEach((code) => {
      const row = cleanMatrix.find((r) => r.subjectCode.toUpperCase() === code);
      if (!row) return;
      const pCount = Number(row.periods[grade] || 0);
      if (pCount <= 0) return;

      const teacher = row.teachers[grade] || '';
      const isBottleneck =
        teacher === 'DT' ||
        teacher === 'LSC' ||
        teacher === 'LCI' ||
        teacher === 'NCY' ||
        teacher === 'VY';

      // Heavy language subjects (BC 12/10, BM 10) require slots on every single day (5 days/week)
      const isHeavyLanguage = (code === 'BC' || code === 'BM') && pCount >= 10;
      const basePri = isHeavyLanguage ? 4 : pCount >= 6 ? 5 : isBottleneck ? 6 : 7;

      const subBlocks = decomposeSubjectBlocks(code, pCount);
      subBlocks.forEach((len, bIdx) => {
        blocks.push({
          id: `${code.toLowerCase()}_${grade}_${bIdx}`,
          grade,
          subjectCode: code,
          subjectName: row.subjectName,
          teacherCode: teacher,
          length: len,
          priority: basePri,
        });
      });
    });

    // 5. PK (Pendidikan Kesihatan)
    const pkRow = cleanMatrix.find((r) => r.subjectCode.toUpperCase() === 'PK');
    const pkPeriods = Number(pkRow?.periods[grade] || 0);
    if (pkPeriods > 0) {
      blocks.push({
        id: `pk_${grade}`,
        grade,
        subjectCode: 'PK',
        subjectName: 'PENDIDIKAN KESIHATAN',
        teacherCode: pkRow?.teachers[grade] || '',
        length: 1,
        priority: 6,
      });
    }

    // 6. MZ (Muzik)
    const mzRow = cleanMatrix.find((r) => r.subjectCode.toUpperCase() === 'MZ');
    const mzPeriods = Number(mzRow?.periods[grade] || 0);
    if (mzPeriods > 0) {
      blocks.push({
        id: `mz_${grade}`,
        grade,
        subjectCode: 'MZ',
        subjectName: 'PENDIDIKAN MUZIK',
        teacherCode: mzRow?.teachers[grade] || '',
        length: 1,
        priority: 6,
      });
    }

    // 7. PSV (Seni Visual)
    const psvRow = cleanMatrix.find((r) => r.subjectCode.toUpperCase() === 'PSV');
    const psvPeriods = Number(psvRow?.periods[grade] || 0);
    if (psvPeriods > 0) {
      blocks.push({
        id: `psv_${grade}`,
        grade,
        subjectCode: 'PSV',
        subjectName: 'PENDIDIKAN SENI VISUAL',
        teacherCode: psvRow?.teachers[grade] || '',
        length: psvPeriods,
        priority: 6,
      });
    }
  });

  // 1. Calculate global teacher workloads from matrix to enforce Heaviest-Workload Teacher First
  const teacherTotalWorkload = new Map<string, number>();
  cleanMatrix.forEach((r) => {
    [1, 2, 3, 4, 5, 6].forEach((g) => {
      const p = Number(r.periods[g] || 0);
      const t1 = r.teachers[g];
      if (t1 && p > 0) {
        teacherTotalWorkload.set(t1, (teacherTotalWorkload.get(t1) || 0) + p);
      }
      const t2 = r.secondaryTeachers?.[g];
      if (t2 && p > 0) {
        teacherTotalWorkload.set(t2, (teacherTotalWorkload.get(t2) || 0) + p);
      }
    });
  });

  // Sort queue by priority first (constrained subjects like PM/PAI, AM, PJ), then Heaviest-Workload Teacher First, then double blocks first
  blocks.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    const loadA = teacherTotalWorkload.get(a.teacherCode) || 0;
    const loadB = teacherTotalWorkload.get(b.teacherCode) || 0;
    if (loadB !== loadA) {
      return loadB - loadA; // Heaviest-Workload Teacher First!
    }
    return b.length - a.length;
  });

  // Track subject day frequency to ensure healthy distribution
  const gradeSubjectDays = new Map<string, number>();
  const incGradeSubjectDay = (grade: number, subjectCode: string, day: DayOfWeek) => {
    const key = `${grade}_${subjectCode.toUpperCase()}_${day}`;
    gradeSubjectDays.set(key, (gradeSubjectDays.get(key) || 0) + 1);
  };
  const getGradeSubjectDayCount = (grade: number, subjectCode: string, day: DayOfWeek): number => {
    const key = `${grade}_${subjectCode.toUpperCase()}_${day}`;
    return gradeSubjectDays.get(key) || 0;
  };

  // --------------------------------------------------------------------------
  // STEP 3: SCHEDULE ALL BLOCKS USING 4-TIER STRATEGY
  // --------------------------------------------------------------------------
  for (let bIndex = 0; bIndex < blocks.length; bIndex++) {
    const block = blocks[bIndex];
    let placed = false;

    // Day ordering: prefer days with fewer blocks of this subject to spread evenly across the week
    const daysOrder = [...DAYS_OF_WEEK].sort((a, b) => {
      const aCount = getGradeSubjectDayCount(block.grade, block.subjectCode, a);
      const bCount = getGradeSubjectDayCount(block.grade, block.subjectCode, b);
      return aCount - bCount;
    });

    for (let tier = 1; tier <= 4; tier++) {
      if (placed) break;

      for (const day of daysOrder) {
        if (placed) break;

        // Hard gatekeeper: strictly enforce daily cap (forbid > 2 periods/day for <=10w, forbid > 3 periods/day for 11/12w)
        const existingClassDayLessons = Object.entries(grid[block.grade][day])
          .filter(([_, cell]) => cell && cell.subjectCode.toUpperCase() === block.subjectCode.toUpperCase())
          .map(([_, cell]) => ({ subjectCode: cell!.subjectCode }));

        const totalWeeklyForSubject = Number(
          cleanMatrix.find((r) => r.subjectCode.toUpperCase() === block.subjectCode.toUpperCase())?.periods[block.grade] || 0
        );

        if (!canClassAcceptSubjectOnDay(existingClassDayLessons, block.subjectCode, totalWeeklyForSubject, block.length)) {
          continue;
        }

        const allSlots = getGradeDaySlots(block.grade, day);
        const candidateSlots = allSlots.filter((s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK');
        let validSlots = candidateSlots;
        if (block.subjectCode === 'PJ') {
          // PJ: Strictly Period 1 or Period 2 only (prefer Period 1; use Period 2 if P1 has a collision or on Tuesday where P1 is PN)
          validSlots = block.grade === 1 ? [candidateSlots.find(s => s.slotId === "W2"), candidateSlots.find(s => s.slotId === "W1")].filter(Boolean) as any : candidateSlots.filter((s) => s.slotId === "W1" || s.slotId === "W2");
        } else if (block.isMorningOnly) {
          validSlots = candidateSlots.filter((s) => s.endMinutes <= 585);
        }

        const numCandidates = validSlots.length - block.length + 1;
        if (numCandidates <= 0) continue;
        const slotIndices = Array.from({ length: numCandidates }, (_, i) => i);
        if (variationSeed !== 0 && block.priority >= 5) {
          const shift = (variationSeed * 3 + bIndex) % numCandidates;
          slotIndices.push(...slotIndices.splice(0, shift));
        }

        for (const sIdx of slotIndices) {
          const slotGroup = validSlots.slice(sIdx, sIdx + block.length);
          const allFreeInGrade = slotGroup.every((s) => grid[block.grade][day][s.slotId] === null);
          if (!allFreeInGrade) continue;

          // In Tier 1: do not cross recess
          if (tier === 1 && block.length >= 2) {
            const s1 = slotGroup[0];
            const sEnd = slotGroup[slotGroup.length - 1];
            if (s1.endMinutes <= 585 && sEnd.startMinutes >= 615) {
              continue;
            }
          }

          // Strict non-collision check!
          if (!isSlotFreeForTeacher(block.teacherCode, day, slotGroup, block.subjectCode, tier)) {
            continue;
          }

          // Year 1 Period 4 (W4) teacher anti-repetition check (spread PKAR +0.5 workload across different teachers)
          if (block.grade === 1 && slotGroup.some((s) => s.slotId === 'W4')) {
            const existingYear1W4 = DAYS_OF_WEEK.map((d) => {
              const cell = grid[1]?.[d]?.['W4'];
              return cell
                ? { day: d, subjectCode: cell.subjectCode, teacherId: cell.teacherCode }
                : null;
            }).filter(Boolean) as Array<{ day: string; subjectCode: string; teacherId: string }>;

            const isStrict = tier <= 2;
            if (
              !canAssignYear1Period4(
                1,
                4,
                block.subjectCode,
                block.teacherCode,
                existingYear1W4,
                isStrict
              )
            ) {
              continue;
            }
          }

          bookSlots(block.grade, day, slotGroup, {
            subjectId: block.id,
            subjectCode: block.subjectCode,
            subjectName: block.subjectName,
            teacherCode: block.teacherCode,
            ...(block.secondaryTeacherCode
              ? { secondaryTeacherCode: block.secondaryTeacherCode, isCoTeaching: true }
              : {}),
          });

          incGradeSubjectDay(block.grade, block.subjectCode, day);
          placed = true;
          break;
        }
      }
    }

    // Tier 3: Safe Slot Swap within class if not placed yet
    if (!placed) {
      for (const day of daysOrder) {
        if (placed) break;
        const allSlots = getGradeDaySlots(block.grade, day);
        const candidateSlots = allSlots.filter((s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK');
        let validSlots = candidateSlots;
        if (block.subjectCode === 'PJ') {
          validSlots = candidateSlots.filter((s) => s.slotId === 'W1' || s.slotId === 'W2');
        } else if (block.isMorningOnly) {
          validSlots = candidateSlots.filter((s) => s.endMinutes <= 585);
        }

        for (let sIdx = 0; sIdx <= validSlots.length - block.length; sIdx++) {
          const slotGroup = validSlots.slice(sIdx, sIdx + block.length);
          const cells = slotGroup.map((s) => grid[block.grade][day][s.slotId]);
          // Strict: never evict locked cells, empty cells, or cells of the same subject!
          if (cells.some((c) => !c || c.isLocked || c.subjectCode.toUpperCase() === block.subjectCode.toUpperCase())) continue;

          // Temporarily unbook current cells
          unbookSlots(block.grade, day, slotGroup);

          const currentClassDayLessons = Object.entries(grid[block.grade][day])
            .filter(([sId, cell]) => !slotGroup.some((sg) => sg.slotId === sId) && cell && cell.subjectCode.toUpperCase() === block.subjectCode.toUpperCase())
            .map(([_, cell]) => ({ subjectCode: cell!.subjectCode }));
          const totalWeeklyForSubject = Number(
            cleanMatrix.find((r) => r.subjectCode.toUpperCase() === block.subjectCode.toUpperCase())?.periods[block.grade] || 0
          );
          if (!canClassAcceptSubjectOnDay(currentClassDayLessons, block.subjectCode, totalWeeklyForSubject, block.length)) {
            // Re-book back
            slotGroup.forEach((s, idx) => {
              if (cells[idx]) bookSlots(block.grade, day, [s], cells[idx]!);
            });
            continue;
          }

          const teacherCanTakeHere = isSlotFreeForTeacher(
            block.teacherCode,
            day,
            slotGroup,
            block.subjectCode,
            4
          );
          if (!teacherCanTakeHere) {
            // Re-book back
            slotGroup.forEach((s, idx) => {
              if (cells[idx]) bookSlots(block.grade, day, [s], cells[idx]!);
            });
            continue;
          }

          // Try moving evicted cells to other free slots on OTHER days
          let allEvictedMoved = true;
          const movedCells: Array<{ day: DayOfWeek; slot: SlotTimeInfo; cell: TimetableCell }> = [];

          for (let i = 0; i < slotGroup.length; i++) {
            const evictedCell = cells[i]!;
            let evictedPlaced = false;

            for (const altDay of DAYS_OF_WEEK) {
              if (evictedPlaced) break;
              if (altDay === day) continue; // Evicted cell MUST move to a different day!

              const altSlots = getGradeDaySlots(block.grade, altDay).filter(
                (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
              );
              for (const altS of altSlots) {
                if (grid[block.grade][altDay][altS.slotId] !== null) continue;

                // PJ morning restriction
                if (evictedCell.subjectCode === 'PJ' && altS.slotId !== 'W1' && altS.slotId !== 'W2') continue;

                const currentAltLessons = Object.entries(grid[block.grade][altDay])
                  .filter(([_, cell]) => cell && cell.subjectCode.toUpperCase() === evictedCell.subjectCode.toUpperCase())
                  .map(([_, cell]) => ({ subjectCode: cell!.subjectCode }));
                const totalWeeklyEvicted = Number(
                  cleanMatrix.find((r) => r.subjectCode.toUpperCase() === evictedCell.subjectCode.toUpperCase())?.periods[block.grade] || 0
                );
                if (!canClassAcceptSubjectOnDay(currentAltLessons, evictedCell.subjectCode, totalWeeklyEvicted, 1)) {
                  continue;
                }

                if (isSlotFreeForTeacher(evictedCell.teacherCode, altDay, [altS], evictedCell.subjectCode, 4)) {
                  bookSlots(block.grade, altDay, [altS], evictedCell);
                  movedCells.push({ day: altDay, slot: altS, cell: evictedCell });
                  evictedPlaced = true;
                  break;
                }
              }
            }

            if (!evictedPlaced) {
              allEvictedMoved = false;
              break;
            }
          }

          // Final verification before committing: ensure target day still complies with daily caps
          if (allEvictedMoved) {
            const remainingOnDay = Object.entries(grid[block.grade][day])
              .filter(([_, cell]) => cell && cell.subjectCode.toUpperCase() === block.subjectCode.toUpperCase())
              .map(([_, cell]) => ({ subjectCode: cell!.subjectCode }));

            if (!canClassAcceptSubjectOnDay(remainingOnDay, block.subjectCode, totalWeeklyForSubject, block.length)) {
              allEvictedMoved = false;
            }
          }

          if (allEvictedMoved) {
            bookSlots(block.grade, day, slotGroup, {
              subjectId: block.id,
              subjectCode: block.subjectCode,
              subjectName: block.subjectName,
              teacherCode: block.teacherCode,
              ...(block.secondaryTeacherCode
                ? { secondaryTeacherCode: block.secondaryTeacherCode, isCoTeaching: true }
                : {}),
            });
            incGradeSubjectDay(block.grade, block.subjectCode, day);
            placed = true;
            break;
          } else {
            // Rollback moved cells
            movedCells.forEach((m) => unbookSlots(block.grade, m.day, [m.slot]));
            slotGroup.forEach((s, idx) => {
              if (cells[idx]) bookSlots(block.grade, day, [s], cells[idx]!);
            });
          }
        }
      }
    }

    // Tier 4: If still not placed and length > 1, split
    if (!placed && block.length === 3) {
      blocks.splice(
        bIndex + 1,
        0,
        { ...block, id: `${block.id}_split2`, length: 2, priority: block.priority },
        { ...block, id: `${block.id}_split1`, length: 1, priority: block.priority }
      );
      placed = true;
    } else if (!placed && block.length === 2) {
      blocks.splice(
        bIndex + 1,
        0,
        { ...block, id: `${block.id}_split1`, length: 1, priority: block.priority },
        { ...block, id: `${block.id}_split2`, length: 1, priority: block.priority }
      );
      placed = true;
    }

    if (!placed) {
      // Step 3.5: 1-Hop Augmenting Swap for unplaced blocks
      for (const targetDay of DAYS_OF_WEEK) {
        if (placed) break;
        const targetAllSlots = getGradeDaySlots(block.grade, targetDay).filter(
          (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
        );

        for (const emptySlot of targetAllSlots) {
          if (placed) break;
          if (grid[block.grade][targetDay][emptySlot.slotId] !== null) continue;

          // Check if block can directly fit in emptySlot
          const targetDayLessons = Object.entries(grid[block.grade][targetDay])
            .filter(([_, cell]) => cell && cell.subjectCode.toUpperCase() === block.subjectCode.toUpperCase())
            .map(([_, cell]) => ({ subjectCode: cell!.subjectCode }));
          const totalWeeklyForSubject = Number(
            cleanMatrix.find((r) => r.subjectCode.toUpperCase() === block.subjectCode.toUpperCase())?.periods[block.grade] || 0
          );

          if (canClassAcceptSubjectOnDay(targetDayLessons, block.subjectCode, totalWeeklyForSubject, block.length) &&
              isSlotFreeForTeacher(block.teacherCode, targetDay, [emptySlot], block.subjectCode, 4)) {
            bookSlots(block.grade, targetDay, [emptySlot], {
              subjectId: block.id,
              subjectCode: block.subjectCode,
              subjectName: block.subjectName,
              teacherCode: block.teacherCode,
            });
            incGradeSubjectDay(block.grade, block.subjectCode, targetDay);
            placed = true;
            break;
          }

          // 1-Hop Swap: find an existing lesson candCell in this grade that can move to emptySlot,
          // freeing candSlot for block!
          for (const candDay of DAYS_OF_WEEK) {
            if (placed) break;
            const candSlots = getGradeDaySlots(block.grade, candDay).filter(
              (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
            );

            for (const candSlot of candSlots) {
              const candCell = grid[block.grade][candDay][candSlot.slotId];
              if (!candCell || candCell.isLocked || candCell.subjectCode.toUpperCase() === block.subjectCode.toUpperCase()) continue;

              const targetDayCandLessons = Object.entries(grid[block.grade][targetDay])
                .filter(([sId, cell]) => sId !== emptySlot.slotId && cell && cell.subjectCode.toUpperCase() === candCell.subjectCode.toUpperCase())
                .map(([_, cell]) => ({ subjectCode: cell!.subjectCode }));
              const totalWeeklyCand = Number(
                cleanMatrix.find((r) => r.subjectCode.toUpperCase() === candCell.subjectCode.toUpperCase())?.periods[block.grade] || 0
              );

              if (candDay !== targetDay && !canClassAcceptSubjectOnDay(targetDayCandLessons, candCell.subjectCode, totalWeeklyCand, 1)) {
                continue;
              }
              if (candCell.subjectCode === 'PJ' && emptySlot.slotId !== 'W1' && emptySlot.slotId !== 'W2') {
                continue;
              }
              if (!isSlotFreeForTeacher(candCell.teacherCode, targetDay, [emptySlot], candCell.subjectCode, 4)) {
                continue;
              }

              // Temporarily move candCell to emptySlot
              unbookSlots(block.grade, candDay, [candSlot]);
              bookSlots(block.grade, targetDay, [emptySlot], candCell);

              // Check if block can now take candSlot on candDay
              const candDayLessonsAfterMove = Object.entries(grid[block.grade][candDay])
                .filter(([sId, cell]) => sId !== candSlot.slotId && cell && cell.subjectCode.toUpperCase() === block.subjectCode.toUpperCase())
                .map(([_, cell]) => ({ subjectCode: cell!.subjectCode }));

              if (canClassAcceptSubjectOnDay(candDayLessonsAfterMove, block.subjectCode, totalWeeklyForSubject, block.length) &&
                  isSlotFreeForTeacher(block.teacherCode, candDay, [candSlot], block.subjectCode, 4)) {
                bookSlots(block.grade, candDay, [candSlot], {
                  subjectId: block.id,
                  subjectCode: block.subjectCode,
                  subjectName: block.subjectName,
                  teacherCode: block.teacherCode,
                });
                incGradeSubjectDay(block.grade, block.subjectCode, candDay);
                placed = true;
                break;
              } else {
                // Rollback move
                unbookSlots(block.grade, targetDay, [emptySlot]);
                bookSlots(block.grade, candDay, [candSlot], candCell);
              }
            }
          }
        }
      }
    }

    if (!placed) {
      unplacedBlocks.push(`T.${block.grade} ${block.subjectCode} (${block.length} waktu)`);
    }
  }

  // --------------------------------------------------------------------------
  // STEP 4: PROGRAM TASMIK (100% MANUAL POST-DISMISSAL ARRANGEMENT)
  // Completely excluded from automated scheduling; Slot Khas Tasmik is seeded
  // empty for manual click-assignment by Principal/PKP.
  // --------------------------------------------------------------------------

  // --------------------------------------------------------------------------
  // STEP 5: GUARANTEED ZERO-GAP COMPACTION (不允许中间有空节)
  // Ensures all classes have contiguous lessons from Period 1 with zero internal holes
  // --------------------------------------------------------------------------
  const canMove = (
    cell: TimetableCell,
    fromDay: DayOfWeek,
    fromSlot: SlotTimeInfo,
    toDay: DayOfWeek,
    toSlot: SlotTimeInfo,
    grade: number
  ): boolean => {
    // PJ is strictly Period 1 or Period 2 only
    if (cell.subjectCode === 'PJ' && toSlot.slotId !== 'W1' && toSlot.slotId !== 'W2') {
      return false;
    }

    // Strictly enforce daily subject cap when moving across different days
    if (fromDay !== toDay) {
      const existingLessonsOnToDay = Object.entries(grid[grade][toDay])
        .filter(([sId, c]) => sId !== toSlot.slotId && c && c.subjectCode.toUpperCase() === cell.subjectCode.toUpperCase())
        .map(([_, c]) => ({ subjectCode: c!.subjectCode }));

      const totalWeekly = Number(
        cleanMatrix.find((r) => r.subjectCode.toUpperCase() === cell.subjectCode.toUpperCase())?.periods[grade] || 0
      );

      if (!canClassAcceptSubjectOnDay(existingLessonsOnToDay, cell.subjectCode, totalWeekly, 1)) {
        return false;
      }
    }

    if (!cell.teacherCode) return true;
    const tList = cell.teacherCode.split('/').map((t) => t.trim()).filter(Boolean);
    for (const t of tList) {
      const intervals = (teacherIntervals.get(t) || []).filter(
        (i) =>
          !(
            i.day === fromDay &&
            i.startMinutes === fromSlot.startMinutes &&
            i.endMinutes === fromSlot.endMinutes &&
            i.classId === `T${grade}`
          )
      );
      if (isTeacherBusyInTimeRange(intervals, toDay, toSlot.startMinutes, toSlot.endMinutes, cell.subjectCode)) {
        return false;
      }
    }
    return true;
  };

  const executeMove = (
    grade: number,
    fromDay: DayOfWeek,
    fromSlot: SlotTimeInfo,
    toDay: DayOfWeek,
    toSlot: SlotTimeInfo
  ) => {
    const cell = grid[grade][fromDay][fromSlot.slotId]!;
    const tList = cell.teacherCode.split('/').map((t) => t.trim()).filter(Boolean);
    tList.forEach((t) => {
      removeTeacherInterval(t, {
        day: fromDay,
        startMinutes: fromSlot.startMinutes,
        endMinutes: fromSlot.endMinutes,
        classId: `T${grade}`,
        subjectCode: cell.subjectCode,
      });
      addTeacherInterval(t, {
        day: toDay,
        startMinutes: toSlot.startMinutes,
        endMinutes: toSlot.endMinutes,
        classId: `T${grade}`,
        subjectCode: cell.subjectCode,
      });
    });
    grid[grade][toDay][toSlot.slotId] = cell;
    grid[grade][fromDay][fromSlot.slotId] = null;
  };

  const findGaps = () => {
    const gaps: Array<{ grade: number; day: DayOfWeek; slot: SlotTimeInfo; session: 'morning' | 'afternoon' }> = [];
    for (let g = 1; g <= 6; g++) {
      for (const day of DAYS_OF_WEEK) {
        const slots = getGradeDaySlots(g, day);
        const mSlots = slots.filter((s) => !s.isRecess && s.endMinutes <= 585 && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA');
        const aSlots = slots.filter((s) => !s.isRecess && s.startMinutes >= 615 && s.slotId !== 'PKAR' && s.slotId !== 'TASMIK');
        const anyAfternoon = aSlots.some((s) => grid[g][day][s.slotId] !== null);

        for (let i = 0; i < mSlots.length; i++) {
          if (!grid[g][day][mSlots[i].slotId]) {
            const hasLaterMorning = mSlots.slice(i + 1).some((s) => grid[g][day][s.slotId] !== null);
            if (hasLaterMorning || anyAfternoon) {
              gaps.push({ grade: g, day, slot: mSlots[i], session: 'morning' });
            }
          }
        }
        for (let i = 0; i < aSlots.length; i++) {
          if (!grid[g][day][aSlots[i].slotId]) {
            if (aSlots.slice(i + 1).some((s) => grid[g][day][s.slotId] !== null)) {
              gaps.push({ grade: g, day, slot: aSlots[i], session: 'afternoon' });
            }
          }
        }
      }
    }
    return gaps;
  };

  for (let pass = 0; pass < 50; pass++) {
    const gaps = findGaps();
    if (gaps.length === 0) break;

    let anyMoved = false;
    for (const gap of gaps) {
      const { grade, day, slot, session } = gap;
      const slots = getGradeDaySlots(grade, day);
      const mSlots = slots.filter((s) => !s.isRecess && s.endMinutes <= 585 && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA');
      const aSlots = slots.filter((s) => !s.isRecess && s.startMinutes >= 615 && s.slotId !== 'PKAR' && s.slotId !== 'TASMIK');

      // Strategy 1: Shift later lesson from same day into gap
      const pool = session === 'morning' ? [...mSlots, ...aSlots] : [...aSlots];
      const sIdx = pool.findIndex((s) => s.slotId === slot.slotId);
      for (let j = sIdx + 1; j < pool.length; j++) {
        const src = pool[j];
        const cell = grid[grade][day][src.slotId];
        if (cell && !cell.isLocked && canMove(cell, day, src, day, slot, grade)) {
          executeMove(grade, day, src, day, slot);
          anyMoved = true;
          break;
        }
      }
      if (anyMoved) break;

      // Strategy 2: Pull tail lesson from other days
      for (const otherDay of DAYS_OF_WEEK) {
        if (otherDay === day) continue;
        const otherSlots = getGradeDaySlots(grade, otherDay).filter((s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK');
        for (let k = otherSlots.length - 1; k >= 0; k--) {
          const src = otherSlots[k];
          const cell = grid[grade][otherDay][src.slotId];
          if (cell && !cell.isLocked) {
            const isTail = otherSlots.slice(k + 1).every((s) => grid[grade][otherDay][s.slotId] === null);
            if (isTail && canMove(cell, otherDay, src, day, slot, grade)) {
              executeMove(grade, otherDay, src, day, slot);
              anyMoved = true;
              break;
            }
          }
        }
        if (anyMoved) break;
      }
      if (anyMoved) break;

      // Strategy 3: 2-way swap with tail of another day
      for (const otherDay of DAYS_OF_WEEK) {
        const allDaySlots = getGradeDaySlots(grade, otherDay).filter((s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK');
        for (const candSlot of allDaySlots) {
          const candCell = grid[grade][otherDay][candSlot.slotId];
          if (!candCell || candCell.isLocked) continue;
          if (canMove(candCell, otherDay, candSlot, day, slot, grade)) {
            for (const thirdDay of DAYS_OF_WEEK) {
              const thirdSlots = getGradeDaySlots(grade, thirdDay).filter((s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK');
              for (let t = thirdSlots.length - 1; t >= 0; t--) {
                const tailSlot = thirdSlots[t];
                const tailCell = grid[grade][thirdDay][tailSlot.slotId];
                if (!tailCell || tailCell.isLocked) continue;
                const isTail = thirdSlots.slice(t + 1).every((s) => grid[grade][thirdDay][s.slotId] === null);
                if (isTail && canMove(tailCell, thirdDay, tailSlot, otherDay, candSlot, grade)) {
                  executeMove(grade, otherDay, candSlot, day, slot);
                  executeMove(grade, thirdDay, tailSlot, otherDay, candSlot);
                  anyMoved = true;
                  break;
                }
              }
              if (anyMoved) break;
            }
          }
          if (anyMoved) break;
        }
        if (anyMoved) break;
      }
      if (anyMoved) break;
    }
    if (!anyMoved) break;
  }

  // 自动将每日 PKAR (0.5 节) 绑定给“下课前那一节”的进班老师
  autoPairPKARInGrid(grid);

  const clashes = detectScheduleClashes(grid);

  // Deep sanitize grid to ensure 100% compatibility with Firestore setDoc
  const sanitizedGrid: ScheduleGrid = JSON.parse(JSON.stringify(grid));

  return { grid: sanitizedGrid, clashes, unplaced: unplacedBlocks };
}
