/**
 * iSEPADU AI — Auto-Scheduling Engine for 2027 Dual-Track Timetable
 * Implements strict KPM pedagogical constraints, minute-level collision detection,
 * absolute hard cap of <= 8.0 periods/day per teacher, max 2 days > 7.0 periods/week,
 * PJ Period 1 priority & 1-day gap (Tahun 2-6), and 80-attempt stochastic balancing solver.
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
  getGradeDaySlots,
} from './types';
import {
  MAX_TEACHER_DAILY_PERIODS,
  getTeacherPersonalDailyCap,
  getTeacherMinDailyTarget,
  isPJConsecutiveDayViolated,
  getMaxSubjectsPerDay,
  getMaxDailyPeriodsForSubject,
  isMajorLanguageSubject,
  countDistinctSubjectsOnDay,
  decomposeSubjectCompactly,
  decomposeSubjectBlocks,
  canAddSubjectToClassDay,
  canClassAcceptSubjectOnDay,
  canSafelyAssignBlockToDay,
  hasThreeConsecutiveSameSubject,
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
      return true;
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

export function getSubjectBlockDistribution(
  subjectCode: string,
  totalPeriods: number,
  classLevel: number = 4
): number[] {
  if (totalPeriods <= 0) return [];
  return decomposeSubjectCompactly(subjectCode, totalPeriods, classLevel);
}

/**
 * Auto-pairs PKAR (0.5 period) ONLY for Year 1 (Tahun 1) to the teacher in the pre-recess period (W4, 09:00 - 09:30).
 * PKAR is 09:30 - 09:45, followed by Recess at 09:45.
 */
export function autoPairPKARInGrid(grid: ScheduleGrid, academicYear: string = '2027'): void {
  const isKP2027Year1 = !academicYear || parseInt(academicYear, 10) >= 2027;
  if (!isKP2027Year1) {
    [1, 2, 3, 4, 5, 6].forEach((g) => {
      DAYS_OF_WEEK.forEach((d) => {
        if (grid[g]?.[d]?.['PKAR']) {
          delete grid[g][d]['PKAR'];
        }
      });
    });
    return;
  }
  const grade = 1;
  DAYS_OF_WEEK.forEach((day) => {
    const preRecessSlot = 'W4';
    const preRecessCell = grid[grade]?.[day]?.[preRecessSlot];
    const pkarSlot = getGradeDaySlots(grade, day, academicYear).find((s) => s.slotId === 'PKAR');
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

export function createEmptyScheduleGrid(academicYear: string = '2027'): ScheduleGrid {
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
      const slots = getGradeDaySlots(grade, day, academicYear);
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

export function detectScheduleClashes(grid: ScheduleGrid, academicYear: string = '2027'): TimetableClash[] {
  const clashes: TimetableClash[] = [];

  DAYS_OF_WEEK.forEach((day) => {
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
      const slots = getGradeDaySlots(grade, day, academicYear);
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

    for (let i = 0; i < dayAssignments.length; i++) {
      for (let j = i + 1; j < dayAssignments.length; j++) {
        const a = dayAssignments[i];
        const b = dayAssignments[j];

        if (a.subjectCode === 'PN' || b.subjectCode === 'PN') continue;
        if (
          (a.subjectCode === 'TASMIK' || a.subjectCode === 'TAS' || a.slotId === 'TASMIK') &&
          (b.subjectCode === 'TASMIK' || b.subjectCode === 'TAS' || b.slotId === 'TASMIK')
        ) {
          continue;
        }
        if (a.slotId === 'MEMBACA' || b.slotId === 'MEMBACA') continue;
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

// --------------------------------------------------------------------------
// 3. WORKLOAD & PJ POST-GENERATION AUDIT ENGINE
// --------------------------------------------------------------------------
export interface TeacherWorkloadSummary {
  teacherCode: string;
  daily: Record<DayOfWeek, number>;
  weeklyTotal: number;
  maxDaily: number;
  minDaily: number;
  daysOver7: number;
  daysOver8: number;
}

export interface ScheduleAuditReport {
  teachers: Record<string, TeacherWorkloadSummary>;
  teachersOver8: number;
  teachersExceedingOver7Limit: number;
  totalDaysOver7: number;
  pjConsecutiveViolations: number;
  pjSlotViolations: number;
  pjW2Count: number;
  pmPaiBlockViolations: number;
  pmPaiCrossRecessCount: number;
  tahap1SubjectExcessDays: number;
  tahap1Over5Days: number;
  tahap2SubjectCapViolations: number;
  subjectDailyPeriodCapViolations: number;
  fragmentedSubjectViolations: number;
  totalDistinctSubjectDays: number;
  middleGaps: number;
  spreadPenalty: number;
  isValidWorkload: boolean;
  violations: string[];
}

export function auditScheduleWorkload(
  grid: ScheduleGrid,
  extraTeachers: string[] = [],
  academicYear: string = '2027'
): ScheduleAuditReport {
  const teacherSet = new Set<string>(extraTeachers.filter(Boolean));

  // Discover all teacher codes present in the grid
  [1, 2, 3, 4, 5, 6].forEach((g) => {
    DAYS_OF_WEEK.forEach((d) => {
      const daySlots = grid[g]?.[d];
      if (!daySlots) return;
      Object.values(daySlots).forEach((cell) => {
        if (cell?.teacherCode) {
          cell.teacherCode
            .split('/')
            .map((t) => t.trim())
            .filter(Boolean)
            .forEach((t) => teacherSet.add(t));
        }
      });
    });
  });

  const dailyMap: Record<string, Record<DayOfWeek, number>> = {};
  teacherSet.forEach((t) => {
    // SELASA W1 PN (+1.0) applies to all active teachers
    dailyMap[t] = { ISNIN: 0, SELASA: 1, RABU: 0, KHAMIS: 0, JUMAAT: 0 };
  });

  let pjConsecutiveViolations = 0;
  let pjSlotViolations = 0;
  let pjW2Count = 0;
  let tahap1SubjectExcessDays = 0;
  let tahap1Over5Days = 0;
  let tahap2SubjectCapViolations = 0;
  let subjectDailyPeriodCapViolations = 0;
  let fragmentedSubjectViolations = 0;
  let totalDistinctSubjectDays = 0;
  const violations: string[] = [];

  const compactDoubleSubjects = new Set(['PSV', 'RBT', 'SEJ']);
  const gradeSubjectTotal = new Map<string, number>();
  const gradeSubjectDaySet = new Map<string, Set<DayOfWeek>>();

  [1, 2, 3, 4, 5, 6].forEach((grade) => {
    const pjDays: string[] = [];

    DAYS_OF_WEEK.forEach((day) => {
      const slots = getGradeDaySlots(grade, day, academicYear);
      let pjCountToday = 0;
      const regularSlots = slots.filter(
        (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
      );
      const daySubPositions = new Map<string, number[]>();

      slots.forEach((s) => {
        if (s.isRecess) return;
        const cell = grid[grade]?.[day]?.[s.slotId];
        if (!cell) return;

        if (cell.subjectCode?.toUpperCase() === 'PJ') {
          pjCountToday++;
          if (s.slotId !== 'W1' && s.slotId !== 'W2') {
            pjSlotViolations++;
            violations.push(`PJ T.${grade} ${day} berada pada ${s.slotId} (hanya W1/W2 dibenarkan)`);
          }
          if (s.slotId === 'W2') {
            pjW2Count++;
          }
        }

        const regIdx = regularSlots.findIndex((rs) => rs.slotId === s.slotId);
        if (regIdx !== -1 && cell.subjectCode) {
          const sCode = cell.subjectCode.toUpperCase();
          if (sCode !== 'PN' && sCode !== 'MEMBACA' && sCode !== 'TASMIK' && !sCode.startsWith('PKAR')) {
            const arr = daySubPositions.get(sCode) || [];
            arr.push(regIdx);
            daySubPositions.set(sCode, arr);

            const gKey = `${grade}_${sCode}`;
            gradeSubjectTotal.set(gKey, (gradeSubjectTotal.get(gKey) || 0) + 1);
            const dSet = gradeSubjectDaySet.get(gKey) || new Set<DayOfWeek>();
            dSet.add(day);
            gradeSubjectDaySet.set(gKey, dSet);
          }
        }

        if (cell.subjectCode === 'PN') return; // Already counted on SELASA (+1)
        if (!cell.teacherCode || !cell.teacherCode.trim()) return;

        const len = cell.periodLength ?? (s.slotId === 'PKAR' || s.slotId === 'MEMBACA' ? 0.5 : 1);
        const tList = cell.teacherCode.split('/').map((c) => c.trim()).filter(Boolean);
        tList.forEach((t) => {
          if (!dailyMap[t]) {
            dailyMap[t] = { ISNIN: 0, SELASA: 1, RABU: 0, KHAMIS: 0, JUMAAT: 0 };
          }
          dailyMap[t][day] += len;
        });
      });

      const distinctCount = daySubPositions.size;
      totalDistinctSubjectDays += distinctCount;
      const maxSubjectsAllowed = getMaxSubjectsPerDay(grade);
      if (grade <= 3) {
        if (distinctCount > maxSubjectsAllowed) {
          tahap1SubjectExcessDays++;
          if (distinctCount > 5) {
            tahap1Over5Days++;
            violations.push(`T.${grade} ${day} mempunyai ${distinctCount} subjek berbeza (Tahap 1 sasaran ≤ 4, mutlak ≤ 5)`);
          }
        }
      } else {
        if (distinctCount > maxSubjectsAllowed) {
          tahap2SubjectCapViolations++;
          violations.push(`T.${grade} ${day} mempunyai ${distinctCount} subjek berbeza (Tahap 2 maksimum 6)`);
        }
      }

      daySubPositions.forEach((positions, sCode) => {
        const maxDaily = getMaxDailyPeriodsForSubject(sCode);
        if (positions.length > maxDaily) {
          subjectDailyPeriodCapViolations++;
          violations.push(`T.${grade} ${day} ${sCode} mempunyai ${positions.length} waktu (had maksimum ${maxDaily})`);
        }
        if (positions.length === 3) {
          // Enforce strict 2+1 SEPARATED (never 1+1+1 scattered AND never 3 consecutive periods in a row!)
          const sorted = [...positions].sort((a, b) => a - b);
          const hasAdjacentPair = sorted[1] - sorted[0] === 1 || sorted[2] - sorted[1] === 1;
          const hasThreeConsec = hasThreeConsecutiveSameSubject(sorted, []);
          if (!hasAdjacentPair) {
            fragmentedSubjectViolations++;
            violations.push(`T.${grade} ${day} ${sCode} berpecah 1+1+1 tanpa连堂`);
          } else if (hasThreeConsec) {
            fragmentedSubjectViolations++;
            violations.push(`T.${grade} ${day} ${sCode} berbaris 3 waktu berturutan (mesti 2+1 terpisah)`);
          }
        } else if (positions.length === 2) {
          const sorted = [...positions].sort((a, b) => a - b);
          if (sorted[1] - sorted[0] !== 1) {
            fragmentedSubjectViolations++;
            violations.push(`T.${grade} ${day} ${sCode} berpecah 1+1 tidak berturutan`);
          }
        }
      });

      if (pjCountToday > 0) {
        if (pjCountToday > 1) {
          pjSlotViolations++;
          violations.push(`PJ T.${grade} ${day} mempunyai ${pjCountToday} waktu (maksimum 1/hari)`);
        }
        pjDays.push(day);
      }
    });

    // Check 2-period PSV/RBT/SEJ never split across 2 different days
    compactDoubleSubjects.forEach((sub) => {
      const gKey = `${grade}_${sub}`;
      const tot = gradeSubjectTotal.get(gKey) || 0;
      const daysUsed = gradeSubjectDaySet.get(gKey)?.size || 0;
      if (tot === 2 && daysUsed > 1) {
        fragmentedSubjectViolations++;
        violations.push(`T.${grade} ${sub} (2w) dipecah kepada ${daysUsed} hari (mesti 1 hari berkembar [2])`);
      }
    });

    // Check Tahun 2-6 strict 1-day gap between PJ days
    if (grade >= 2 && pjDays.length >= 2 && pjDays.length <= 3) {
      const idxs = pjDays.map((d) => DAYS_OF_WEEK.indexOf(d as DayOfWeek)).sort((a, b) => a - b);
      for (let i = 1; i < idxs.length; i++) {
        if (idxs[i] - idxs[i - 1] < 2) {
          pjConsecutiveViolations++;
          violations.push(
            `PJ T.${grade} berturut-turut pada ${DAYS_OF_WEEK[idxs[i - 1]]} & ${DAYS_OF_WEEK[idxs[i]]} (mesti selang ≥ 1 hari)`
          );
        }
      }
    }
  });

  const teachersSummary: Record<string, TeacherWorkloadSummary> = {};
  let teachersOver8 = 0;
  let teachersExceedingOver7Limit = 0;
  let totalDaysOver7 = 0;
  let spreadPenalty = 0;

  teacherSet.forEach((t) => {
    const dMap = dailyMap[t];
    const loads = DAYS_OF_WEEK.map((d) => dMap[d]);
    const weeklyTotal = loads.reduce((sum, v) => sum + v, 0);
    const maxDaily = Math.max(...loads);
    const minDaily = Math.min(...loads);
    const daysOver8 = loads.filter((v) => v > 8.0 + 1e-6).length;
    const daysOver7 = loads.filter((v) => v > 7.0 + 1e-6).length;

    if (daysOver8 > 0) {
      teachersOver8 += daysOver8;
      DAYS_OF_WEEK.forEach((d) => {
        if (dMap[d] > 8.0 + 1e-6) {
          violations.push(`Guru [${t}] melebihi had mutlak 8 waktu pada ${d}: ${dMap[d]} waktu`);
        }
      });
    }

    const maxAllowedOver7 = weeklyTotal <= 36 ? 1 : Math.min(5, Math.ceil(weeklyTotal - 35));
    if (daysOver7 > maxAllowedOver7) {
      teachersExceedingOver7Limit++;
      violations.push(
        `Guru [${t}] (${weeklyTotal}w) mempunyai ${daysOver7} hari melebihi 7 waktu (maksimum dibenarkan: ${maxAllowedOver7} hari)`
      );
    }

    totalDaysOver7 += daysOver7;

    if (weeklyTotal >= 15) {
      const range = maxDaily - minDaily;
      const mean = weeklyTotal / 5;
      const variance = loads.reduce((acc, v) => acc + (v - mean) * (v - mean), 0);
      const minTarget = getTeacherMinDailyTarget(weeklyTotal);
      let lowPenalty = 0;
      if (minTarget > 0) {
        loads.forEach((v) => {
          if (v < minTarget) {
            lowPenalty += (minTarget - v) * 50_000;
          }
        });
      }
      const rangeSpike = weeklyTotal >= 25 && range > 2.5 ? (range - 2.5) * 8_000 : 0;
      const maxRangeViolation = weeklyTotal >= 25 && range > 3.0 + 1e-6 ? 250_000 + (range - 3.0) * 30_000 : 0;
      const fridayLowPenalty = weeklyTotal >= 25 && dMap['JUMAAT'] < Math.floor(weeklyTotal / 5) - 1 ? 5_000 : 0;

      spreadPenalty += range * range * 60 + variance * 25 + lowPenalty + rangeSpike + maxRangeViolation + fridayLowPenalty;
    }

    teachersSummary[t] = {
      teacherCode: t,
      daily: dMap,
      weeklyTotal,
      maxDaily,
      minDaily,
      daysOver7,
      daysOver8,
    };
  });

  // Verify strict PM/PAI consecutive double-period block integrity ([2,2,1] / [2,2] / [2,1] on separate days)
  let pmPaiBlockViolations = 0;
  let pmPaiCrossRecessCount = 0;
  for (let g = 1; g <= 6; g++) {
    const dayBlockSizes: number[] = [];
    for (const d of DAYS_OF_WEEK) {
      const regularSlots = getGradeDaySlots(g, d, academicYear).filter(
        (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
      );
      const pmIndices: number[] = [];
      regularSlots.forEach((s, idx) => {
        const c = grid[g]?.[d]?.[s.slotId];
        if (c && (c.subjectCode === 'PM/PAI' || c.subjectCode === 'PM' || c.subjectCode === 'PAI')) {
          pmIndices.push(idx);
        }
      });
      if (pmIndices.length > 0) {
        // Must be contiguous if 2 periods (or more), and max 1 block per day
        let isContiguous = true;
        for (let i = 1; i < pmIndices.length; i++) {
          if (pmIndices[i] !== pmIndices[i - 1] + 1) {
            isContiguous = false;
            break;
          }
        }
        if (!isContiguous || pmIndices.length > 2) {
          pmPaiBlockViolations++;
          violations.push(`PM/PAI T.${g} ${d} tidak berturutan / melebihi 2 waktu sehari`);
        } else if (pmIndices.length === 2) {
          const s1 = regularSlots[pmIndices[0]];
          const s2 = regularSlots[pmIndices[1]];
          if (s1.endMinutes <= 585 && s2.startMinutes >= 615) {
            pmPaiCrossRecessCount++;
          }
        }
        dayBlockSizes.push(pmIndices.length);
      }
    }
    const totalPmPai = dayBlockSizes.reduce((a, b) => a + b, 0);
    if (totalPmPai > 0) {
      const expected = [...decomposeSubjectCompactly('PM/PAI', totalPmPai, g)].sort((a, b) => b - a);
      const actual = [...dayBlockSizes].sort((a, b) => b - a);
      if (expected.length !== actual.length || expected.some((v, i) => v !== actual[i])) {
        pmPaiBlockViolations++;
        violations.push(`PM/PAI T.${g} terpecah: [${actual.join('+')}] berbanding [${expected.join('+')}]`);
      }
    }
  }

  let middleGaps = 0;
  for (let g = 1; g <= 6; g++) {
    for (const d of DAYS_OF_WEEK) {
      const slots = getGradeDaySlots(g, d, academicYear);
      const mSlots = slots.filter((s) => !s.isRecess && s.endMinutes <= 600 && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA');
      const aSlots = slots.filter((s) => !s.isRecess && s.startMinutes >= 615 && s.slotId !== 'PKAR' && s.slotId !== 'TASMIK');
      const anyAfter = aSlots.some((s) => grid[g]?.[d]?.[s.slotId] !== null);
      for (let i = 0; i < mSlots.length; i++) {
        if (grid[g]?.[d]?.[mSlots[i].slotId] === null) {
          if (mSlots.slice(i + 1).some((s) => grid[g]?.[d]?.[s.slotId] !== null) || anyAfter) {
            middleGaps++;
          }
        }
      }
      for (let i = 0; i < aSlots.length; i++) {
        if (grid[g]?.[d]?.[aSlots[i].slotId] === null) {
          if (aSlots.slice(i + 1).some((s) => grid[g]?.[d]?.[s.slotId] !== null)) {
            middleGaps++;
          }
        }
      }
    }
  }

  const isValidWorkload =
    teachersOver8 === 0 &&
    teachersExceedingOver7Limit === 0 &&
    pjConsecutiveViolations === 0 &&
    pjSlotViolations === 0 &&
    pmPaiBlockViolations === 0 &&
    tahap2SubjectCapViolations === 0 &&
    subjectDailyPeriodCapViolations === 0 &&
    fragmentedSubjectViolations === 0;

  return {
    teachers: teachersSummary,
    teachersOver8,
    teachersExceedingOver7Limit,
    totalDaysOver7,
    pjConsecutiveViolations,
    pjSlotViolations,
    pjW2Count,
    pmPaiBlockViolations,
    pmPaiCrossRecessCount,
    tahap1SubjectExcessDays,
    tahap1Over5Days,
    tahap2SubjectCapViolations,
    subjectDailyPeriodCapViolations,
    fragmentedSubjectViolations,
    totalDistinctSubjectDays,
    middleGaps,
    spreadPenalty,
    isValidWorkload,
    violations,
  };
}

interface BlockToSchedule {
  id: string;
  grade: number;
  subjectCode: string;
  subjectName: string;
  teacherCode: string;
  secondaryTeacherCode?: string;
  length: number; // 1, 2, or 3
  priority: number; // Lower = higher priority (Most-Constrained First)
  isMorningOnly?: boolean;
  allowUnmergedSingle?: boolean;
}

// Fast deterministic LCG PRNG for reproducible yet diverse 80-attempt exploration
function createSeededRng(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Single trial attempt with strict daily workload caps, PJ rules, zero-collision & zero-gap compaction
 */
function runSingleScheduleAttempt(
  cleanMatrix: SubjectAllocationRow[],
  classTeachers: Record<number, string>,
  academicYear: string,
  attemptSeed: number
): {
  grid: ScheduleGrid;
  clashes: TimetableClash[];
  unplaced: string[];
  audit: ScheduleAuditReport;
} {
  const rng = createSeededRng(attemptSeed + 137);
  const isKP2027Year1 = !academicYear || parseInt(academicYear, 10) >= 2027;
  const grid = createEmptyScheduleGrid(academicYear);
  const unplacedBlocks: string[] = [];
  const unplacedBlockItems: BlockToSchedule[] = [];

  // Gather all active teachers & compute their weekly expected periods (including Tuesday PN +1.0)
  const allTeacherCodesSet = new Set<string>();
  Object.values(classTeachers).forEach((c) => {
    if (c && c.trim()) allTeacherCodesSet.add(c.trim());
  });

  const teacherTotalWorkload = new Map<string, number>();
  cleanMatrix.forEach((r) => {
    const code = r.subjectCode.toUpperCase();
    const skipLoad = code === 'PN' || code === 'TASMIK' || code.startsWith('PKAR') || code === 'MEMBACA';
    [1, 2, 3, 4, 5, 6].forEach((g) => {
      const p = Number(r.periods[g] || 0);
      const t1 = r.teachers[g]?.trim();
      const t2 = r.secondaryTeachers?.[g]?.trim();
      if (t1) {
        allTeacherCodesSet.add(t1);
        if (!skipLoad && p > 0) {
          teacherTotalWorkload.set(t1, (teacherTotalWorkload.get(t1) || 0) + p);
        }
      }
      if (t2) {
        allTeacherCodesSet.add(t2);
        if (!skipLoad && p > 0) {
          teacherTotalWorkload.set(t2, (teacherTotalWorkload.get(t2) || 0) + p);
        }
      }
    });
  });

  // Account for +1.0 PN period on SELASA in weekly totals for every teacher
  allTeacherCodesSet.forEach((t) => {
    teacherTotalWorkload.set(t, (teacherTotalWorkload.get(t) || 0) + 1);
  });

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

  // Track teacher regular daily periods (PN +1 on SELASA initialized upfront!)
  const teacherDayLoads = new Map<string, number>();
  const incTeacherDay = (teacherCode: string, day: string, amount: number = 1) => {
    const key = `${teacherCode}_${day}`;
    teacherDayLoads.set(key, (teacherDayLoads.get(key) || 0) + amount);
  };
  const decTeacherDay = (teacherCode: string, day: string, amount: number = 1) => {
    const key = `${teacherCode}_${day}`;
    teacherDayLoads.set(key, Math.max(0, (teacherDayLoads.get(key) || 0) - amount));
  };

  // CRITICAL PLUG #1: Pre-count Tuesday (SELASA) Perhimpunan (PN = +1.0 period) for ALL teachers BEFORE scheduling!
  allTeacherCodesSet.forEach((t) => {
    incTeacherDay(t, 'SELASA', 1);
  });

  // Effective daily load = scheduled regular lessons (incl. SELASA PN +1) + auto PKAR (+0.5 if teaching Year 1 W4 on that day)
  const getEffectiveTeacherDayLoad = (t: string, day: DayOfWeek): number => {
    let load = teacherDayLoads.get(`${t}_${day}`) || 0;
    const y1w4 = grid[1]?.[day]?.['W4'];
    if (y1w4 && y1w4.teacherCode) {
      const w4Teachers = y1w4.teacherCode.split('/').map((x) => x.trim());
      if (w4Teachers.includes(t)) {
        load += 0.5;
      }
    }
    return load;
  };

  // Strict hard-cap & workload check (NO tier bypasses 8.0 or >1 day >7.0!)
  const isSlotFreeForTeacher = (
    teacherCode: string,
    day: DayOfWeek,
    slots: SlotTimeInfo[],
    subjectCode: string,
    grade: number,
    options?: {
      dailyCapOverride?: number;
      enforceBreaks?: boolean;
      allowSingleDayOver7?: boolean;
    }
  ): boolean => {
    if (!teacherCode) return true;
    const teachers = teacherCode.split('/').map((t) => t.trim()).filter(Boolean);
    const extraPkarCost =
      isKP2027Year1 && grade === 1 && slots.some((s) => s.slotId === 'W4') && subjectCode !== 'PKAR' ? 0.5 : 0;

    for (const t of teachers) {
      const intervals = teacherIntervals.get(t) || [];

      // HARD CONSTRAINT: Absolute Zero Clock Overlap
      for (const s of slots) {
        if (isTeacherBusyInTimeRange(intervals, day, s.startMinutes, s.endMinutes, subjectCode)) {
          return false;
        }
      }

      const curLoad = getEffectiveTeacherDayLoad(t, day);
      const blockCost = slots.length + extraPkarCost;
      const projectedLoad = curLoad + blockCost;

      // ABSOLUTE HARD CAP: NEVER > 8.0 periods/day
      if (projectedLoad > MAX_TEACHER_DAILY_PERIODS + 1e-6) {
        return false;
      }

      // Target daily cap override (e.g., personalCap or <= 7)
      if (options?.dailyCapOverride !== undefined && projectedLoad > options.dailyCapOverride + 1e-6) {
        return false;
      }

      // AT MOST ONE DAY > 7.0 periods/week (for teachers <= 36w; never >= 2 days of 8 periods)
      if (projectedLoad > 7.0 + 1e-6) {
        if (!options?.allowSingleDayOver7) {
          return false;
        }
        const weeklyTotal = teacherTotalWorkload.get(t) || 0;
        const maxOver7 = weeklyTotal <= 36 ? 1 : Math.min(5, Math.ceil(weeklyTotal - 35));
        const otherDaysOver7 = DAYS_OF_WEEK.filter(
          (d) => d !== day && getEffectiveTeacherDayLoad(t, d) > 7.0 + 1e-6
        ).length;
        if (otherDaysOver7 >= maxOver7) {
          return false;
        }
      }

      // Teacher rest break check (when requested)
      if (options?.enforceBreaks) {
        const pnMorning = day === 'SELASA' ? 1 : 0;
        const curMorning = intervals.filter((i) => i.day === day && i.endMinutes <= 585).length + pnMorning;
        const newMorning = slots.filter((s) => s.endMinutes <= 585).length;
        if (curMorning + newMorning > 4) {
          return false;
        }

        // Afternoon break on days with >1 afternoon slot
        const totalAfternoonInGrade = day === 'JUMAAT' ? (grade >= 4 ? 3 : 2) : (day === 'ISNIN' || day === 'SELASA' ? 6 : 5);
        if (totalAfternoonInGrade > 2) {
          const curAfter = intervals.filter((i) => i.day === day && i.startMinutes >= 615).length;
          const newAfter = slots.filter((s) => s.startMinutes >= 615).length;
          if (curAfter + newAfter >= totalAfternoonInGrade) {
            return false;
          }
        }
      }
    }

    return true;
  };

  // Book slots cleanly
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
  // STEP 1: MANDATORY LOCKED SLOTS (SELASA W1 PN & Year 1 MEMBACA)
  // --------------------------------------------------------------------------
  [1, 2, 3, 4, 5, 6].forEach((grade) => {
    const s = getGradeDaySlots(grade, 'SELASA', academicYear).find((sl) => sl.slotId === 'W1');
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

  if (isKP2027Year1) {
    DAYS_OF_WEEK.forEach((day) => {
      const s = getGradeDaySlots(1, day, academicYear).find((sl) => sl.slotId === 'MEMBACA');
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
  }

  // --------------------------------------------------------------------------
  // STEP 2: BUILD PRIORITY QUEUE OF ALL SUBJECT BLOCKS
  // --------------------------------------------------------------------------
  const blocks: BlockToSchedule[] = [];

  [1, 2, 3, 4, 5, 6].forEach((grade) => {
    // 1. PJ (Period 1 priority, Period 2 overflow, T2-6 min 1-day gap) — immediately after PN
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
          priority: 1,
          isMorningOnly: true,
        });
      }
    }

    // 2. Parallel PM / PAI blocks (Top priority immediately after PN & PJ; strict [2,2,1] / [2,2] / [2,1])
    const pmRow = cleanMatrix.find((r) => r.subjectCode.toUpperCase() === 'PM');
    const paiRow = cleanMatrix.find((r) => r.subjectCode.toUpperCase() === 'PAI');
    const pmPeriods = Number(pmRow?.periods[grade] || 0);
    const paiPeriods = Number(paiRow?.periods[grade] || 0);
    const pmTeacher = pmRow?.teachers[grade] || '';
    const paiTeacher = paiRow?.teachers[grade] || '';

    if (pmPeriods > 0 && paiPeriods > 0) {
      const totalP = Math.max(pmPeriods, paiPeriods);
      const combinedTeacher = [pmTeacher, paiTeacher].map((t) => t.trim()).filter(Boolean).join('/');
      const bLengths = decomposeSubjectCompactly('PM/PAI', totalP, grade);
      bLengths.forEach((len, bIdx) => {
        blocks.push({
          id: `pm_pai_${grade}_${bIdx}`,
          grade,
          subjectCode: 'PM/PAI',
          subjectName: 'PENDIDIKAN MORAL / ISLAM',
          teacherCode: combinedTeacher,
          length: len,
          priority: 2,
        });
      });
    }

    // 3. AM Co-Teaching (Year 1 / Year 2 KP2027)
    const amRow = cleanMatrix.find((r) => r.subjectCode.toUpperCase() === 'AM');
    const amPeriods = Number(amRow?.periods[grade] || 0);
    if (amPeriods > 0) {
      const t1 = amRow?.teachers[grade] || '';
      const t2 = amRow?.secondaryTeachers?.[grade] || '';
      const combined = t2 ? `${t1}/${t2}` : t1;
      const amSub = decomposeSubjectCompactly('AM', amPeriods, grade);
      amSub.forEach((len, idx) => {
        blocks.push({
          id: `am_${grade}_${idx}`,
          grade,
          subjectCode: 'AM',
          subjectName: 'ALAM DAN MANUSIA (CO-TEACHING)',
          teacherCode: combined,
          ...(t2 ? { secondaryTeacherCode: t2 } : {}),
          length: len,
          priority: 3,
        });
      });
    }

    // 4. Core academic subjects & KP2027 modules (excluding special handled ones)
    const handledCodes = new Set(['PN', 'PM', 'PAI', 'PJ', 'AM', 'TASMIK', 'MEMBACA']);
    cleanMatrix.forEach((row) => {
      const code = row.subjectCode.toUpperCase();
      if (handledCodes.has(code) || code.startsWith('PKAR')) return;
      const pCount = Number(row.periods[grade] || 0);
      if (pCount <= 0) return;

      const teacher = row.teachers[grade] || '';
      const isMinorSingleSubject = code === 'PK' || code === 'MZ';

      // In Tahap 2, schedule 10p BC as [2, 1, 2, 1, 2, 2] (4 days: two 2+1 separated days and two 2-period days — NEVER 3 consecutive!)
      const subBlocks =
        grade >= 4 && code === 'BC' && pCount === 10
          ? [2, 1, 2, 1, 2, 2]
          : decomposeSubjectCompactly(code, pCount, grade);
      subBlocks.forEach((len, bIdx) => {
        // Priority 4: Core multi-day [2]/[3] blocks (BC, BM, BI, MT, SN) — ensures shared MT/BC/BM teachers get clean slots
        // Priority 5: 2-period elective blocks (PSV, RBT, SEJ)
        // Priority 6: [1] blocks of languages / MT / SN
        // Priority 7: 1-period PK / MZ (placed last so they never fragment 2-slot pairs!)
        const isElectiveDouble = ['PSV', 'RBT', 'SEJ'].includes(code);
        const pri =
          len >= 2
            ? code === 'BC' && pCount === 12
              ? 3.5
              : isElectiveDouble
              ? 5
              : 4
            : isMinorSingleSubject
            ? 7
            : 6;
        blocks.push({
          id: `${code.toLowerCase()}_${grade}_${bIdx}`,
          grade,
          subjectCode: code,
          subjectName: row.subjectName,
          teacherCode: teacher,
          length: len,
          priority: pri,
        });
      });
    });
  });

  // Tie-break noise per block so consecutive attempts find genuinely different layouts
  const blockJitter = new Map<string, number>();
  blocks.forEach((b) => blockJitter.set(b.id, rng()));

  const getMaxTeacherWeeklyLoad = (tCode: string) => {
    if (!tCode) return 0;
    const parts = tCode.split('/').map((x) => x.trim()).filter(Boolean);
    return Math.max(0, ...parts.map((p) => teacherTotalWorkload.get(p) || 0));
  };

  blocks.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    // Within same priority (e.g. PM/PAI priority 2, AM priority 3): lock [2] before [1]
    if (a.length !== b.length) {
      return b.length - a.length;
    }
    const loadA = getMaxTeacherWeeklyLoad(a.teacherCode);
    const loadB = getMaxTeacherWeeklyLoad(b.teacherCode);
    if (attemptSeed % 3 === 0) {
      // Pure heaviest-teacher-first with slight jitter
      if (Math.abs(loadB - loadA) > 2) return loadB - loadA;
    } else {
      if (loadB !== loadA) return loadB - loadA;
    }
    return (blockJitter.get(a.id) || 0) - (blockJitter.get(b.id) || 0);
  });

  const getSubjectWeeklyTotal = (grade: number, subjectCode: string): number => {
    const code = subjectCode.toUpperCase();
    if (code === 'PM/PAI') {
      const pmP = Number(cleanMatrix.find((r) => r.subjectCode.toUpperCase() === 'PM')?.periods[grade] || 0);
      const paiP = Number(cleanMatrix.find((r) => r.subjectCode.toUpperCase() === 'PAI')?.periods[grade] || 0);
      return Math.max(pmP, paiP);
    }
    return Number(cleanMatrix.find((r) => r.subjectCode.toUpperCase() === code)?.periods[grade] || 0);
  };

  // Full regular day inspection helper for distinct-subject caps & contiguous-slot checks
  const getGradeDayRegularInfo = (
    grade: number,
    day: DayOfWeek,
    subjectCode: string,
    excludeSlotIds?: Set<string>
  ) => {
    const regularSlots = getGradeDaySlots(grade, day, academicYear).filter(
      (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
    );
    const lessonsList: Array<{ subjectCode: string }> = [];
    const existingPositions: number[] = [];
    const targetCode = subjectCode.trim().toUpperCase();

    regularSlots.forEach((s, idx) => {
      if (excludeSlotIds?.has(s.slotId)) return;
      const c = grid[grade]?.[day]?.[s.slotId];
      if (!c || !c.subjectCode) return;
      lessonsList.push({ subjectCode: c.subjectCode });
      if (c.subjectCode.trim().toUpperCase() === targetCode) {
        existingPositions.push(idx);
      }
    });

    const distinctCount = countDistinctSubjectsOnDay(lessonsList);
    return { regularSlots, lessonsList, existingPositions, distinctCount };
  };

  // Helper: Sort candidate days — merge major language [1] into existing [2] day FIRST, else stay under maxSubjects & balance teacher loads!
  const sortCandidateDaysForBlock = (
    candidateDays: DayOfWeek[],
    block: BlockToSchedule,
    maxSubjectsAllowed?: number
  ): DayOfWeek[] => {
    const teachers = block.teacherCode.split('/').map((t) => t.trim()).filter(Boolean);
    const maxWeekly = Math.max(0, ...teachers.map((t) => teacherTotalWorkload.get(t) || 0));
    const isMajorSingle = block.length === 1 && isMajorLanguageSubject(block.subjectCode);
    const capSubjects = maxSubjectsAllowed ?? getMaxSubjectsPerDay(block.grade);

    // Precompute tiny jitter per day for variety across attempts
    const dayNoise: Record<string, number> = {};
    candidateDays.forEach((d) => {
      dayNoise[d] = (rng() - 0.5) * (maxWeekly >= 25 ? 0.35 : 0.8);
    });

    return [...candidateDays].sort((dayA, dayB) => {
      const infoA = getGradeDayRegularInfo(block.grade, dayA, block.subjectCode);
      const infoB = getGradeDayRegularInfo(block.grade, dayB, block.subjectCode);
      const cntA = infoA.existingPositions.length;
      const cntB = infoB.existingPositions.length;

      if (isMajorSingle) {
        // 优先并入当天已有连堂 [2] 的三大语文科日子 (构成 2+1=3 绝不浪费新科目名额)
        const mergeScoreA = cntA === 2 ? 0 : cntA === 0 ? 1 : 2;
        const mergeScoreB = cntB === 2 ? 0 : cntB === 0 ? 1 : 2;
        if (mergeScoreA !== mergeScoreB) return mergeScoreA - mergeScoreB;
      } else {
        const subRankA = cntA > 0 ? 1 : 0;
        const subRankB = cntB > 0 ? 1 : 0;
        if (subRankA !== subRankB) return subRankA - subRankB;
      }

      // Prefer days still strictly under maxSubjects when opening a new subject on that day
      if (cntA === 0 && cntB === 0) {
        const overA = infoA.distinctCount >= capSubjects ? 1 : 0;
        const overB = infoB.distinctCount >= capSubjects ? 1 : 0;
        if (overA !== overB) return overA - overB;
      }

      const loadA = teachers.length > 0 ? Math.max(...teachers.map((t) => getEffectiveTeacherDayLoad(t, dayA))) : 0;
      const loadB = teachers.length > 0 ? Math.max(...teachers.map((t) => getEffectiveTeacherDayLoad(t, dayB))) : 0;

      // Parity alignment for odd-length blocks ([1] non-merge or [3]) AND even [2]-blocks!
      let parityBiasA = 0;
      let parityBiasB = 0;
      const getSessionEmptyStats = (d: DayOfWeek): Array<{ totalEmpty: number; runs: number[] }> => {
        const allReg = getGradeDaySlots(block.grade, d, academicYear).filter(
          (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
        );
        const stats: Array<{ totalEmpty: number; runs: number[] }> = [];
        for (const sess of [allReg.filter((s) => s.endMinutes <= 585), allReg.filter((s) => s.startMinutes >= 615)]) {
          let totalEmpty = 0;
          const runs: number[] = [];
          let run = 0;
          for (const sl of sess) {
            if (grid[block.grade][d][sl.slotId] === null) {
              totalEmpty++;
              run++;
            } else {
              if (run > 0) runs.push(run);
              run = 0;
            }
          }
          if (run > 0) runs.push(run);
          stats.push({ totalEmpty, runs });
        }
        return stats;
      };
      if (block.length % 2 === 1) {
        const scoreOdd = (d: DayOfWeek) => {
          const stats = getSessionEmptyStats(d);
          // Only give [3]-block bonus if a session has a contiguous 3-run (e.g., W3-5 after W2 PJ) or odd-sized remainder >= 3
          if (block.length === 3) {
            if (stats.some((st) => st.runs.some((r) => r === 3))) return -10.0;
            if (stats.some((st) => st.totalEmpty % 2 === 1 && st.runs.some((r) => r >= 3))) return -5.0;
            return 0;
          }
          return stats.some((st) => st.runs.some((r) => r >= block.length && r % 2 === 1))
            ? -4.0
            : 0;
        };
        parityBiasA = scoreOdd(dayA);
        parityBiasB = scoreOdd(dayB);
      } else if (block.length === 2) {
        const scoreEven = (d: DayOfWeek) => {
          const stats = getSessionEmptyStats(d);
          return stats.some((st) => st.totalEmpty % 2 === 0 && st.runs.some((r) => r >= 2 && r % 2 === 0)) ? -2.5 : 0;
        };
        parityBiasA = scoreEven(dayA);
        parityBiasB = scoreEven(dayB);
      }

      // Prioritize Friday when Friday is light / close to lowest day load
      const friBiasA = dayA === 'JUMAAT' && maxWeekly >= 24 ? -0.45 : 0;
      const friBiasB = dayB === 'JUMAAT' && maxWeekly >= 24 ? -0.45 : 0;

      // Gentle tie-breaker toward fewer distinct subjects on that day
      const subjTieA = cntA === 0 ? infoA.distinctCount * 0.15 : 0;
      const subjTieB = cntB === 0 ? infoB.distinctCount * 0.15 : 0;

      return (loadA + parityBiasA + friBiasA + subjTieA + dayNoise[dayA]) - (loadB + parityBiasB + friBiasB + subjTieB + dayNoise[dayB]);
    });
  };

  // Helper: Check PJ day constraints
  const getScheduledPJDaysForGrade = (grade: number): DayOfWeek[] => {
    return DAYS_OF_WEEK.filter((d) =>
      Object.values(grid[grade]?.[d] || {}).some((c) => c && c.subjectCode.toUpperCase() === 'PJ')
    );
  };

  const canPlacePJOnDay = (grade: number, day: DayOfWeek, strictYear1Gap: boolean): boolean => {
    const existingPjDays = getScheduledPJDaysForGrade(grade);
    if (existingPjDays.includes(day)) return false;
    if (grade >= 2 || strictYear1Gap) {
      return !isPJConsecutiveDayViolated(Math.max(2, grade), existingPjDays, day);
    }
    return true;
  };

  // --------------------------------------------------------------------------
  // STEP 3: SCHEDULE ALL BLOCKS WITH STRICT DAILY CAPS & COMPACT SUBJECT GROUPING
  // --------------------------------------------------------------------------
  let adjustedForW2Pj = false;
  for (let bIndex = 0; bIndex < blocks.length; bIndex++) {
    // Once all Priority 1 PJ blocks finish, compensate zero-slack 50-slot classes that received PJ at W2:
    // Every W2 PJ isolates W1 / forces 2 extra odd blocks in that morning session (+2 odd parity needed),
    // so converting ONE [2]-block of BI (or BC/BM if needed) into two [1] blocks at Priority 6 keeps
    // PSV/RBT/SEJ/MT/SN/PM-PAI 100% intact doubles with 0 fragmentation & <= 6 subjects/day!
    if (!adjustedForW2Pj && blocks[bIndex].priority > 1) {
      adjustedForW2Pj = true;
      let addedSplit = false;
      [4, 5, 6].forEach((grade) => {
        const w2PjCount = DAYS_OF_WEEK.filter((d) => grid[grade]?.[d]?.['W2']?.subjectCode === 'PJ').length;
        if (w2PjCount <= 0) return;
        const totalAcademicP = blocks
          .slice(bIndex)
          .filter((bk) => bk.grade === grade)
          .reduce((acc, bk) => acc + bk.length, 0) +
          DAYS_OF_WEEK.filter((d) => grid[grade]?.[d]?.['W1']?.subjectCode === 'PJ' || grid[grade]?.[d]?.['W2']?.subjectCode === 'PJ').length;
        // Also add PN (1) => 49 academic + 1 PN = 50 slots
        if (totalAcademicP < 48) return;

        for (let k = 0; k < w2PjCount; k++) {
          let splitIdx = -1;
          for (const prefSub of ['BI', 'BC', 'BM']) {
            splitIdx = blocks.findIndex(
              (bk, idx) => idx >= bIndex && bk.grade === grade && bk.subjectCode === prefSub && bk.length === 2
            );
            if (splitIdx !== -1) break;
          }
          if (splitIdx !== -1) {
            const orig = blocks[splitIdx];
            blocks.splice(
              splitIdx,
              1,
              { ...orig, id: `${orig.id}_w2a`, length: 1, priority: 8, allowUnmergedSingle: true },
              { ...orig, id: `${orig.id}_w2b`, length: 1, priority: 8, allowUnmergedSingle: true }
            );
            addedSplit = true;
          }
        }
      });
      if (addedSplit) {
        const tail = blocks.slice(bIndex).sort((a, b) => a.priority - b.priority);
        blocks.splice(bIndex, tail.length, ...tail);
      }
    }

    const block = blocks[bIndex];
    let placed = false;

    const teachers = block.teacherCode.split('/').map((t) => t.trim()).filter(Boolean);
    const maxTeacherWeekly = Math.max(0, ...teachers.map((t) => teacherTotalWorkload.get(t) || 0));
    const personalCap = Math.min(7, getTeacherPersonalDailyCap(maxTeacherWeekly));
    const baseMaxSubjects = getMaxSubjectsPerDay(block.grade);

    // Special dedicated PJ loop: Strictly Period 1 (W1) first across all valid days -> Period 2 (W2) overflow
    if (block.subjectCode === 'PJ') {
      const pjCapStages = [
        { cap: Math.min(7, Math.max(4, personalCap)), allowOver7: false, strictY1Gap: true, maxSubjects: baseMaxSubjects },
        { cap: 7, allowOver7: false, strictY1Gap: true, maxSubjects: baseMaxSubjects },
        { cap: 7, allowOver7: false, strictY1Gap: false, maxSubjects: baseMaxSubjects },
        { cap: 8, allowOver7: true, strictY1Gap: false, maxSubjects: baseMaxSubjects },
        { cap: 8, allowOver7: true, strictY1Gap: false, maxSubjects: baseMaxSubjects + 1 },
      ];

      for (const stage of pjCapStages) {
        if (placed) break;
        const daysOrdered = sortCandidateDaysForBlock([...DAYS_OF_WEEK], block, stage.maxSubjects);

        // Pass 1: Check W1 across ALL valid candidate days FIRST!
        // Pass 2: Check W2 across ALL valid candidate days ONLY if W1 could not take it!
        for (const targetSlotId of ['W1', 'W2'] as const) {
          if (placed) break;

          for (const day of daysOrdered) {
            if (!canPlacePJOnDay(block.grade, day, stage.strictY1Gap)) continue;

            const info = getGradeDayRegularInfo(block.grade, day, 'PJ');
            if (
              !canAddSubjectToClassDay(info.lessonsList, 'PJ', 1, block.grade, {
                maxSubjectsOverride: stage.maxSubjects,
              })
            ) {
              continue;
            }

            const allSlots = getGradeDaySlots(block.grade, day, academicYear);
            const targetSlot = allSlots.find((s) => s.slotId === targetSlotId);
            if (!targetSlot) continue;
            if (grid[block.grade][day][targetSlot.slotId] !== null) continue;

            if (
              isSlotFreeForTeacher(block.teacherCode, day, [targetSlot], 'PJ', block.grade, {
                dailyCapOverride: stage.cap,
                enforceBreaks: stage.cap <= 7,
                allowSingleDayOver7: stage.allowOver7,
              })
            ) {
              bookSlots(block.grade, day, [targetSlot], {
                subjectId: block.id,
                subjectCode: 'PJ',
                subjectName: block.subjectName,
                teacherCode: block.teacherCode,
              });
              placed = true;
              break;
            }
          }
        }
      }
    } else {
      // Non-PJ Subjects: Two-Step Daily Cap Preference + Compact Distinct Subject Cap (4 for T1-3, 6 for T4-6)
      // Stages 1-6 strictly enforce baseMaxSubjects (4 for Tahap 1, 6 for Tahap 2) with Day-Capacity Feasibility check;
      // Stages 7-8 allow +1 distinct subject overflow ONLY when mathematically needed so ZERO academic slots are left empty!
      const overflowMaxSubjects = baseMaxSubjects + 1;
      const stage1Cap = Math.max(personalCap, block.length >= 3 ? Math.min(7, block.length + 1) : personalCap);
      const capStages = [
        { dailyCap: stage1Cap, enforceBreaks: true, allowCrossRecess: false, allowOver7: false, strictY1P4: true, maxSubjects: baseMaxSubjects, preferMergeOnly: true, checkFeasible: true },
        { dailyCap: 7, enforceBreaks: true, allowCrossRecess: false, allowOver7: false, strictY1P4: true, maxSubjects: baseMaxSubjects, preferMergeOnly: true, checkFeasible: true },
        { dailyCap: 7, enforceBreaks: false, allowCrossRecess: false, allowOver7: false, strictY1P4: false, maxSubjects: baseMaxSubjects, preferMergeOnly: false, checkFeasible: true },
        { dailyCap: 8, enforceBreaks: false, allowCrossRecess: false, allowOver7: true, strictY1P4: false, maxSubjects: baseMaxSubjects, preferMergeOnly: false, checkFeasible: false },
        { dailyCap: 7, enforceBreaks: false, allowCrossRecess: true, allowOver7: false, strictY1P4: false, maxSubjects: baseMaxSubjects, preferMergeOnly: false, checkFeasible: false },
        { dailyCap: 8, enforceBreaks: false, allowCrossRecess: true, allowOver7: true, strictY1P4: false, maxSubjects: baseMaxSubjects, preferMergeOnly: false, checkFeasible: false },
        { dailyCap: 7, enforceBreaks: true, allowCrossRecess: false, allowOver7: false, strictY1P4: true, maxSubjects: overflowMaxSubjects, preferMergeOnly: false, checkFeasible: false },
        { dailyCap: 8, enforceBreaks: false, allowCrossRecess: true, allowOver7: true, strictY1P4: false, maxSubjects: overflowMaxSubjects, preferMergeOnly: false, checkFeasible: false },
      ];

      const isMajorSingleBlock = block.length === 1 && isMajorLanguageSubject(block.subjectCode) && !block.allowUnmergedSingle;
      const remainingSubjectPeriodsInGrade = new Map<string, number>();
      for (let ri = bIndex; ri < blocks.length; ri++) {
        const rb = blocks[ri];
        if (rb.grade !== block.grade) continue;
        const rc = rb.subjectCode.toUpperCase();
        remainingSubjectPeriodsInGrade.set(rc, (remainingSubjectPeriodsInGrade.get(rc) || 0) + rb.length);
      }

      for (const stage of capStages) {
        if (placed) break;
        const daysOrder = sortCandidateDaysForBlock([...DAYS_OF_WEEK], block, stage.maxSubjects);

        for (const day of daysOrder) {
          if (placed) break;

          const dayInfo = getGradeDayRegularInfo(block.grade, day, block.subjectCode);

          // 三大语文科单节 [1] 在优先阶段仅允许并入已有连续 [2] 的日子 (构成 2+1=3 分离，绝不 3 连堂)
          if (
            stage.preferMergeOnly &&
            isMajorSingleBlock &&
            dayInfo.existingPositions.length === 0 &&
            DAYS_OF_WEEK.some((d) => getGradeDayRegularInfo(block.grade, d, block.subjectCode).existingPositions.length === 2)
          ) {
            continue;
          }

          const w1EmptyWithW2Pj =
            stage.strictY1P4 &&
            block.length >= 2 &&
            grid[block.grade]?.[day]?.['W1'] === null &&
            grid[block.grade]?.[day]?.['W2']?.subjectCode === 'PJ';
          const effectiveStageMaxSubjects = w1EmptyWithW2Pj
            ? Math.max(1, stage.maxSubjects - 1)
            : stage.maxSubjects;

          if (
            !canAddSubjectToClassDay(dayInfo.lessonsList, block.subjectCode, block.length, block.grade, {
              maxSubjectsOverride: effectiveStageMaxSubjects,
              existingPeriodPositions: dayInfo.existingPositions,
            })
          ) {
            continue;
          }

          const allSlots = getGradeDaySlots(block.grade, day, academicYear);
          const candidateSlots = allSlots.filter(
            (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
          );

          if (
            stage.checkFeasible &&
            !canSafelyAssignBlockToDay({
              dayMaxPeriods: candidateSlots.length,
              currentDayLessons: dayInfo.lessonsList,
              candidateSubjectCode: block.subjectCode,
              blockLength: block.length,
              classLevel: block.grade,
              maxSubjectsOverride: effectiveStageMaxSubjects,
              remainingSubjectPeriodsInWeek: remainingSubjectPeriodsInGrade,
            })
          ) {
            continue;
          }

          const validSlots = block.isMorningOnly
            ? candidateSlots.filter((s) => s.endMinutes <= 585)
            : candidateSlots;

          const numCandidates = validSlots.length - block.length + 1;
          if (numCandidates <= 0) continue;

          // Score & order slot indices: prefer non-cross-recess and avoid splitting an even empty run into isolated 1-slot holes!
          const slotIndices = Array.from({ length: numCandidates }, (_, i) => i);
          if (block.length >= 2) {
            slotIndices.sort((i1, i2) => {
              const sg1 = validSlots.slice(i1, i1 + block.length);
              const sg2 = validSlots.slice(i2, i2 + block.length);
              const cross1 = sg1[0].endMinutes <= 585 && sg1[sg1.length - 1].startMinutes >= 615 ? 1 : 0;
              const cross2 = sg2[0].endMinutes <= 585 && sg2[sg2.length - 1].startMinutes >= 615 ? 1 : 0;
              if (cross1 !== cross2) return cross1 - cross2;

              // Count odd-slot islands created BEFORE sIdx or AFTER sIdx+length within the same session (morning/afternoon)
              const islandScore = (startIdx: number) => {
                const sFirst = validSlots[startIdx];
                const isMorn = sFirst.endMinutes <= 585;
                let leftEmpty = 0;
                for (let k = startIdx - 1; k >= 0; k--) {
                  if ((validSlots[k].endMinutes <= 585) !== isMorn) break;
                  if (grid[block.grade][day][validSlots[k].slotId] !== null) break;
                  leftEmpty++;
                }
                let rightEmpty = 0;
                for (let k = startIdx + block.length; k < validSlots.length; k++) {
                  if ((validSlots[k].endMinutes <= 585) !== isMorn) break;
                  if (grid[block.grade][day][validSlots[k].slotId] !== null) break;
                  rightEmpty++;
                }
                const contiguousRunLen = leftEmpty + block.length + rightEmpty;
                // Strongly avoid leaving a standalone 1-slot hole on an edge when touching another side leaves 0 holes
                let penalty = 0;
                if (block.length % 2 === 1 && contiguousRunLen % 2 === 0) penalty += 6; // e.g., [3]-block prefers odd run (3 or 5) over cutting an even run (4)!
                if (block.length === 2 && (leftEmpty + rightEmpty) % 2 === 1) penalty += 3; // [2]-block prefers even empty run (2/4/6) over stranding 1 hole in an odd run (3/5)
                if (leftEmpty === 1 && rightEmpty > 0) penalty += 3;
                if (rightEmpty === 1 && leftEmpty > 0) penalty += 3;
                if (leftEmpty % 2 === 1 && rightEmpty % 2 === 1) penalty += 4;
                if (leftEmpty === 0 || rightEmpty === 0) penalty -= 1; // pack snugly against start/end/existing block
                return penalty;
              };

              const pen1 = islandScore(i1);
              const pen2 = islandScore(i2);
              if (pen1 !== pen2) return pen1 - pen2;

              return ((i1 + attemptSeed + bIndex) % numCandidates) - ((i2 + attemptSeed + bIndex) % numCandidates);
            });
          } else if (dayInfo.existingPositions.length === 2) {
            // For 3-period language day (2 + 1 separated): NEVER place adjacent to existing [2]; prefer opposite side of Recess!
            const existingFirstSlot = dayInfo.regularSlots[dayInfo.existingPositions[0]];
            const existingIsMorning = existingFirstSlot ? existingFirstSlot.endMinutes <= 585 : true;
            slotIndices.sort((i1, i2) => {
              const opp1 = (validSlots[i1].endMinutes <= 585) !== existingIsMorning ? 0 : 1;
              const opp2 = (validSlots[i2].endMinutes <= 585) !== existingIsMorning ? 0 : 1;
              if (opp1 !== opp2) return opp1 - opp2;
              return ((i1 + attemptSeed + bIndex) % numCandidates) - ((i2 + attemptSeed + bIndex) % numCandidates);
            });
          } else if (dayInfo.existingPositions.length === 1) {
            // 1 + 1 pair: merge right next to existing single slot of the same subject
            slotIndices.sort((i1, i2) => {
              const adj1 = Math.abs(dayInfo.existingPositions[0] - i1) === 1 ? 1 : 0;
              const adj2 = Math.abs(dayInfo.existingPositions[0] - i2) === 1 ? 1 : 0;
              if (adj1 !== adj2) return adj2 - adj1;
              return ((i1 + attemptSeed + bIndex) % numCandidates) - ((i2 + attemptSeed + bIndex) % numCandidates);
            });
          } else {
            // For standalone single blocks: place snugly against an edge of a contiguous empty run so [2]-runs don't get chopped into 1-slot holes!
            slotIndices.sort((i1, i2) => {
              const singleHolePen = (idx: number) => {
                const sFirst = validSlots[idx];
                const isMorn = sFirst.endMinutes <= 585;
                let leftEmpty = 0;
                for (let k = idx - 1; k >= 0; k--) {
                  if ((validSlots[k].endMinutes <= 585) !== isMorn) break;
                  if (grid[block.grade][day][validSlots[k].slotId] !== null) break;
                  leftEmpty++;
                }
                let rightEmpty = 0;
                for (let k = idx + 1; k < validSlots.length; k++) {
                  if ((validSlots[k].endMinutes <= 585) !== isMorn) break;
                  if (grid[block.grade][day][validSlots[k].slotId] !== null) break;
                  rightEmpty++;
                }
                const contiguousRunLen = leftEmpty + 1 + rightEmpty;
                let pen = 0;
                if (contiguousRunLen % 2 === 0) pen += 6; // strongly avoid chopping an even contiguous run into an odd remainder!
                if (leftEmpty > 0 && rightEmpty > 0) pen += 4; // never cut through middle of an empty run
                if (leftEmpty % 2 === 1 && rightEmpty % 2 === 1) pen += 4;
                if (leftEmpty === 1 || rightEmpty === 1) pen += 2;
                const hasW2PjDay = grid[block.grade]?.[day]?.['W2']?.subjectCode === 'PJ';
                if (hasW2PjDay && sFirst.slotId === 'W1') {
                  if (block.subjectCode === 'PK' || block.subjectCode === 'MZ') pen -= 25;
                  else if (block.allowUnmergedSingle) pen += 25;
                }
                return pen;
              };
              const p1 = singleHolePen(i1);
              const p2 = singleHolePen(i2);
              if (p1 !== p2) return p1 - p2;
              return ((i1 + attemptSeed * 3 + bIndex) % numCandidates) - ((i2 + attemptSeed * 3 + bIndex) % numCandidates);
            });
          }

          for (const sIdx of slotIndices) {
            const slotGroup = validSlots.slice(sIdx, sIdx + block.length);
            if (!slotGroup.every((s) => grid[block.grade][day][s.slotId] === null)) continue;

            if (!stage.allowCrossRecess && block.length >= 2) {
              const s1 = slotGroup[0];
              const sEnd = slotGroup[slotGroup.length - 1];
              if (s1.endMinutes <= 585 && sEnd.startMinutes >= 615) continue;
            }

            // In Stage 1 (strictest pass), odd-length blocks ([3] or standalone [1]) strictly avoid chopping an EVEN-length contiguous empty run!
            if (stage.preferMergeOnly && (block.length === 3 || (block.length === 1 && !isMajorSingleBlock))) {
              const isMornSlot = slotGroup[0].endMinutes <= 585;
              let runLen = block.length;
              for (let k = sIdx - 1; k >= 0; k--) {
                if ((validSlots[k].endMinutes <= 585) !== isMornSlot) break;
                if (grid[block.grade][day][validSlots[k].slotId] !== null) break;
                runLen++;
              }
              for (let k = sIdx + block.length; k < validSlots.length; k++) {
                if ((validSlots[k].endMinutes <= 585) !== isMornSlot) break;
                if (grid[block.grade][day][validSlots[k].slotId] !== null) break;
                runLen++;
              }
              if (runLen % 2 === 0) continue;
            }

            const candidatePositions = slotGroup.map((sg) =>
              dayInfo.regularSlots.findIndex((rs) => rs.slotId === sg.slotId)
            );
            if (
              !canAddSubjectToClassDay(dayInfo.lessonsList, block.subjectCode, block.length, block.grade, {
                maxSubjectsOverride: stage.maxSubjects,
                existingPeriodPositions: dayInfo.existingPositions,
                candidatePeriodPositions: candidatePositions,
              })
            ) {
              continue;
            }

            if (
              !isSlotFreeForTeacher(block.teacherCode, day, slotGroup, block.subjectCode, block.grade, {
                dailyCapOverride: stage.dailyCap,
                enforceBreaks: stage.enforceBreaks,
                allowSingleDayOver7: stage.allowOver7,
              })
            ) {
              continue;
            }

            // Year 1 Period 4 (W4) anti-repetition check (KP2027 Tahun 1 only)
            if (isKP2027Year1 && block.grade === 1 && slotGroup.some((s) => s.slotId === 'W4')) {
              const existingYear1W4 = DAYS_OF_WEEK.map((d) => {
                const cell = grid[1]?.[d]?.['W4'];
                return cell ? { day: d, subjectCode: cell.subjectCode, teacherId: cell.teacherCode } : null;
              }).filter(Boolean) as Array<{ day: string; subjectCode: string; teacherId: string }>;

              if (
                !canAssignYear1Period4(
                  1,
                  4,
                  block.subjectCode,
                  block.teacherCode,
                  existingYear1W4,
                  stage.strictY1P4
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

            placed = true;
            break;
          }
        }
      }
    }

    // Tier 2.5: Generalized Same-Day Slide-Open for [2]-blocks (unites any two empty slots separated by intact blocks)
    if (!placed && block.length === 2 && block.subjectCode !== 'PJ') {
      const daysOrder = sortCandidateDaysForBlock([...DAYS_OF_WEEK], block, baseMaxSubjects);
      for (const day of daysOrder) {
        if (placed) break;
        const dayInfo = getGradeDayRegularInfo(block.grade, day, block.subjectCode);
        if (
          !canAddSubjectToClassDay(dayInfo.lessonsList, block.subjectCode, block.length, block.grade, {
            maxSubjectsOverride: baseMaxSubjects + 1,
            existingPeriodPositions: dayInfo.existingPositions,
          })
        ) {
          continue;
        }

        const allSlots = getGradeDaySlots(block.grade, day, academicYear).filter(
          (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
        );
        const sessions = block.isMorningOnly
          ? [allSlots.filter((s) => s.endMinutes <= 585)]
          : [allSlots.filter((s) => s.endMinutes <= 585), allSlots.filter((s) => s.startMinutes >= 615), allSlots];

        for (const sess of sessions) {
          if (placed) break;
          // Find any empty e1 and empty e2 > e1+1 with all slots strictly between e1..e2 occupied & safely shiftable together
          for (let e1 = 0; e1 < sess.length; e1++) {
            if (placed) break;
            if (grid[block.grade][day][sess[e1].slotId] !== null) continue;
            for (let e2 = e1 + 2; e2 < sess.length; e2++) {
              if (placed) break;
              if (grid[block.grade][day][sess[e2].slotId] !== null) continue;
              const unitSlots = sess.slice(e1 + 1, e2);
              if (unitSlots.some((s) => grid[block.grade][day][s.slotId] === null)) continue;
              const uCells = unitSlots.map((s) => grid[block.grade][day][s.slotId]!);
              if (uCells.some((c) => c.isLocked || c.subjectCode === 'PJ')) continue;
              // Ensure outer neighbors don't merge/split an identical consecutive run across e1 or e2
              const leftNeighbor = e1 > 0 ? grid[block.grade][day][sess[e1 - 1].slotId] : null;
              const rightNeighbor = e2 + 1 < sess.length ? grid[block.grade][day][sess[e2 + 1].slotId] : null;
              if (leftNeighbor && leftNeighbor.subjectCode === uCells[0].subjectCode) continue;
              if (rightNeighbor && rightNeighbor.subjectCode === uCells[uCells.length - 1].subjectCode) continue;

              // Try BOTH directions: shift unit LEFT into [e1..e2-2] (pair at [e2-1, e2]) OR shift RIGHT into [e1+2..e2] (pair at [e1, e1+1])
              const attempts = [
                { destUnitSlots: sess.slice(e1, e2 - 1), targetPair: sess.slice(e2 - 1, e2 + 1) },
                { destUnitSlots: sess.slice(e1 + 2, e2 + 1), targetPair: sess.slice(e1, e1 + 2) },
              ];

              for (const att of attempts) {
                const { destUnitSlots, targetPair } = att;
                if (isKP2027Year1 && block.grade === 1 && (destUnitSlots.some((s) => s.slotId === 'W4') || targetPair.some((s) => s.slotId === 'W4'))) {
                  continue;
                }
                // Check cross-recess integrity for any shifted PM/PAI double block
                const breaksPmCrossRecess = uCells.some((c, idx) => {
                  if (c.subjectCode !== 'PM/PAI') return false;
                  const destS = destUnitSlots[idx];
                  const hasNextSame = idx + 1 < uCells.length && uCells[idx + 1].subjectCode === 'PM/PAI';
                  return hasNextSame && destS.endMinutes <= 585 && destUnitSlots[idx + 1].startMinutes >= 615;
                });
                if (breaksPmCrossRecess) continue;

                unbookSlots(block.grade, day, unitSlots);
                const canShift = unitSlots.every((_us, idx) =>
                  isSlotFreeForTeacher(uCells[idx].teacherCode, day, [destUnitSlots[idx]], uCells[idx].subjectCode, block.grade, {
                    dailyCapOverride: 8,
                    enforceBreaks: false,
                    allowSingleDayOver7: true,
                  })
                );
                if (!canShift) {
                  unitSlots.forEach((s, idx) => bookSlots(block.grade, day, [s], uCells[idx]));
                  continue;
                }
                destUnitSlots.forEach((s, idx) => bookSlots(block.grade, day, [s], uCells[idx]));

                const newPos = targetPair.map((sg) => dayInfo.regularSlots.findIndex((rs) => rs.slotId === sg.slotId));
                const newInfo = getGradeDayRegularInfo(block.grade, day, block.subjectCode);
                if (
                  canAddSubjectToClassDay(newInfo.lessonsList, block.subjectCode, 2, block.grade, {
                    maxSubjectsOverride: baseMaxSubjects + 1,
                    existingPeriodPositions: newInfo.existingPositions,
                    candidatePeriodPositions: newPos,
                  }) &&
                  isSlotFreeForTeacher(block.teacherCode, day, targetPair, block.subjectCode, block.grade, {
                    dailyCapOverride: 8,
                    enforceBreaks: false,
                    allowSingleDayOver7: true,
                  })
                ) {
                  bookSlots(block.grade, day, targetPair, {
                    subjectId: block.id,
                    subjectCode: block.subjectCode,
                    subjectName: block.subjectName,
                    teacherCode: block.teacherCode,
                    ...(block.secondaryTeacherCode
                      ? { secondaryTeacherCode: block.secondaryTeacherCode, isCoTeaching: true }
                      : {}),
                  });
                  placed = true;
                  break;
                } else {
                  unbookSlots(block.grade, day, destUnitSlots);
                  unitSlots.forEach((s, idx) => bookSlots(block.grade, day, [s], uCells[idx]));
                }
              }
            }
          }
        }
      }
    }

    // Tier 3: Safe Slot Swap within class (STRICTLY preserves <= 8.0, max 1 day > 7.0, compact subject caps & PJ rules!)
    if (!placed) {
      const swapMaxSubjects = baseMaxSubjects + 1;
      const daysOrder = sortCandidateDaysForBlock([...DAYS_OF_WEEK], block, swapMaxSubjects);

      for (const day of daysOrder) {
        if (placed) break;
        if (block.subjectCode === 'PJ' && !canPlacePJOnDay(block.grade, day, false)) continue;

        const allSlots = getGradeDaySlots(block.grade, day, academicYear);
        const candidateSlots = allSlots.filter(
          (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
        );
        let validSlots = candidateSlots;
        if (block.subjectCode === 'PJ') {
          validSlots = [
            candidateSlots.find((s) => s.slotId === 'W1'),
            candidateSlots.find((s) => s.slotId === 'W2'),
          ].filter(Boolean) as SlotTimeInfo[];
        } else if (block.isMorningOnly) {
          validSlots = candidateSlots.filter((s) => s.endMinutes <= 585);
        }

        for (let sIdx = 0; sIdx <= validSlots.length - block.length; sIdx++) {
          const slotGroup = validSlots.slice(sIdx, sIdx + block.length);
          const cells = slotGroup.map((s) => grid[block.grade][day][s.slotId]);
          if (cells.some((c) => !c || c.isLocked || c.subjectCode === 'PM/PAI' || c.subjectCode.toUpperCase() === block.subjectCode.toUpperCase())) continue;

          // Never evict half of an existing consecutive [2]/[3] block (prevents breaking SEJ/MT/PSV/RBT/languages!)
          const evictsPartOfDouble = slotGroup.some((sg, i) => {
            const c = cells[i];
            if (!c) return false;
            const rIdx = candidateSlots.findIndex((cs) => cs.slotId === sg.slotId);
            const prevOut =
              rIdx > 0 &&
              !slotGroup.some((x) => x.slotId === candidateSlots[rIdx - 1].slotId) &&
              grid[block.grade][day][candidateSlots[rIdx - 1].slotId]?.subjectCode === c.subjectCode;
            const nextOut =
              rIdx + 1 < candidateSlots.length &&
              !slotGroup.some((x) => x.slotId === candidateSlots[rIdx + 1].slotId) &&
              grid[block.grade][day][candidateSlots[rIdx + 1].slotId]?.subjectCode === c.subjectCode;
            return prevOut || nextOut;
          });
          if (evictsPartOfDouble) continue;

          if (block.subjectCode === 'PM/PAI' && block.length === 2) {
            const s1 = slotGroup[0];
            const sEnd = slotGroup[slotGroup.length - 1];
            if (s1.endMinutes <= 585 && sEnd.startMinutes >= 615) continue;
          }

          unbookSlots(block.grade, day, slotGroup);

          const excludeSet = new Set(slotGroup.map((sg) => sg.slotId));
          const dayInfo = getGradeDayRegularInfo(block.grade, day, block.subjectCode, excludeSet);
          const candPos = slotGroup.map((sg) => dayInfo.regularSlots.findIndex((rs) => rs.slotId === sg.slotId));

          const t3Y1W4Ok =
            !(isKP2027Year1 && block.grade === 1 && slotGroup.some((s) => s.slotId === 'W4')) ||
            canAssignYear1Period4(
              1,
              4,
              block.subjectCode,
              block.teacherCode,
              DAYS_OF_WEEK.filter((d) => d !== day)
                .map((d) => {
                  const cw4 = grid[1]?.[d]?.['W4'];
                  return cw4 ? { day: d, subjectCode: cw4.subjectCode, teacherId: cw4.teacherCode } : null;
                })
                .filter(Boolean) as Array<{ day: string; subjectCode: string; teacherId: string }>,
              false
            );

          if (
            !t3Y1W4Ok ||
            !canAddSubjectToClassDay(dayInfo.lessonsList, block.subjectCode, block.length, block.grade, {
              maxSubjectsOverride: swapMaxSubjects,
              existingPeriodPositions: dayInfo.existingPositions,
              candidatePeriodPositions: candPos,
            }) ||
            !isSlotFreeForTeacher(block.teacherCode, day, slotGroup, block.subjectCode, block.grade, {
              dailyCapOverride: 8,
              enforceBreaks: false,
              allowSingleDayOver7: true,
            })
          ) {
            slotGroup.forEach((s, idx) => {
              if (cells[idx]) bookSlots(block.grade, day, [s], cells[idx]!);
            });
            continue;
          }

          let allEvictedMoved = true;
          const movedCells: Array<{ day: DayOfWeek; slot: SlotTimeInfo; cell: TimetableCell }> = [];

          // If both evicted cells belong to the same consecutive [2]-block, move them INTACT as a [2]-block onto altDay!
          if (slotGroup.length === 2 && cells[0]!.subjectCode === cells[1]!.subjectCode) {
            let pairMoved = false;
            const pairCell = cells[0]!;
            const altDaysSorted = sortCandidateDaysForBlock(
              DAYS_OF_WEEK.filter((d) => d !== day),
              { ...block, teacherCode: pairCell.teacherCode, subjectCode: pairCell.subjectCode, length: 2 },
              swapMaxSubjects
            );

            for (const altDay of altDaysSorted) {
              if (pairMoved) break;
              const altSlots = getGradeDaySlots(block.grade, altDay, academicYear).filter(
                (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
              );
              const altInfo = getGradeDayRegularInfo(block.grade, altDay, pairCell.subjectCode);
              for (let j = 0; j < altSlots.length - 1; j++) {
                const pairAlt = [altSlots[j], altSlots[j + 1]];
                if (pairAlt.some((s) => grid[block.grade][altDay][s.slotId] !== null)) continue;
                if (pairAlt[0].endMinutes <= 585 && pairAlt[1].startMinutes >= 615) continue;
                const pairPos = pairAlt.map((sg) => altInfo.regularSlots.findIndex((rs) => rs.slotId === sg.slotId));

                const pairY1W4Ok =
                  !(isKP2027Year1 && block.grade === 1 && pairAlt.some((s) => s.slotId === 'W4')) ||
                  canAssignYear1Period4(
                    1,
                    4,
                    pairCell.subjectCode,
                    pairCell.teacherCode,
                    DAYS_OF_WEEK.filter((d) => d !== altDay)
                      .map((d) => {
                        if (d === day && slotGroup.some((s) => s.slotId === 'W4')) {
                          return { day: d, subjectCode: block.subjectCode, teacherId: block.teacherCode };
                        }
                        const cw4 = grid[1]?.[d]?.['W4'];
                        return cw4 ? { day: d, subjectCode: cw4.subjectCode, teacherId: cw4.teacherCode } : null;
                      })
                      .filter(Boolean) as Array<{ day: string; subjectCode: string; teacherId: string }>,
                    false
                  );

                if (
                  pairY1W4Ok &&
                  canAddSubjectToClassDay(altInfo.lessonsList, pairCell.subjectCode, 2, block.grade, {
                    maxSubjectsOverride: swapMaxSubjects,
                    existingPeriodPositions: altInfo.existingPositions,
                    candidatePeriodPositions: pairPos,
                  }) &&
                  isSlotFreeForTeacher(pairCell.teacherCode, altDay, pairAlt, pairCell.subjectCode, block.grade, {
                    dailyCapOverride: 8,
                    enforceBreaks: false,
                    allowSingleDayOver7: true,
                  })
                ) {
                  bookSlots(block.grade, altDay, [pairAlt[0]], cells[0]!);
                  bookSlots(block.grade, altDay, [pairAlt[1]], cells[1]!);
                  movedCells.push({ day: altDay, slot: pairAlt[0], cell: cells[0]! });
                  movedCells.push({ day: altDay, slot: pairAlt[1], cell: cells[1]! });
                  pairMoved = true;
                  break;
                }
              }
            }
            allEvictedMoved = pairMoved;
          } else {
            for (let i = 0; i < slotGroup.length; i++) {
              const evictedCell = cells[i]!;
              let evictedPlaced = false;

              const altDaysSorted = sortCandidateDaysForBlock(
                DAYS_OF_WEEK.filter((d) => d !== day),
                { ...block, teacherCode: evictedCell.teacherCode, subjectCode: evictedCell.subjectCode, length: 1 },
                swapMaxSubjects
              );

              for (const altDay of altDaysSorted) {
                if (evictedPlaced) break;
                if (evictedCell.subjectCode === 'PJ' && !canPlacePJOnDay(block.grade, altDay, false)) continue;

                const altSlots = getGradeDaySlots(block.grade, altDay, academicYear).filter(
                  (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
                );
                const filteredAltSlots =
                  evictedCell.subjectCode === 'PJ'
                    ? ([altSlots.find((s) => s.slotId === 'W1'), altSlots.find((s) => s.slotId === 'W2')].filter(Boolean) as SlotTimeInfo[])
                    : altSlots;

                const altInfo = getGradeDayRegularInfo(block.grade, altDay, evictedCell.subjectCode);

                for (const altS of filteredAltSlots) {
                  if (grid[block.grade][altDay][altS.slotId] !== null) continue;
                  const altPos = altInfo.regularSlots.findIndex((rs) => rs.slotId === altS.slotId);

                  const altSY1W4Ok =
                    !(isKP2027Year1 && block.grade === 1 && altS.slotId === 'W4') ||
                    canAssignYear1Period4(
                      1,
                      4,
                      evictedCell.subjectCode,
                      evictedCell.teacherCode,
                      DAYS_OF_WEEK.filter((d) => d !== altDay)
                        .map((d) => {
                          if (d === day && slotGroup.some((s) => s.slotId === 'W4')) {
                            return { day: d, subjectCode: block.subjectCode, teacherId: block.teacherCode };
                          }
                          const cw4 = grid[1]?.[d]?.['W4'];
                          return cw4 ? { day: d, subjectCode: cw4.subjectCode, teacherId: cw4.teacherCode } : null;
                        })
                        .filter(Boolean) as Array<{ day: string; subjectCode: string; teacherId: string }>,
                      false
                    );

                  if (
                    altSY1W4Ok &&
                    canAddSubjectToClassDay(altInfo.lessonsList, evictedCell.subjectCode, 1, block.grade, {
                      maxSubjectsOverride: swapMaxSubjects,
                      existingPeriodPositions: altInfo.existingPositions,
                      candidatePeriodPositions: [altPos],
                    }) &&
                    isSlotFreeForTeacher(evictedCell.teacherCode, altDay, [altS], evictedCell.subjectCode, block.grade, {
                      dailyCapOverride: 8,
                      enforceBreaks: false,
                      allowSingleDayOver7: true,
                    })
                  ) {
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
          }

          if (allEvictedMoved) {
            const afterInfo = getGradeDayRegularInfo(block.grade, day, block.subjectCode);
            if (
              !canAddSubjectToClassDay(afterInfo.lessonsList, block.subjectCode, block.length, block.grade, {
                maxSubjectsOverride: swapMaxSubjects,
                existingPeriodPositions: afterInfo.existingPositions,
                candidatePeriodPositions: candPos,
              })
            ) {
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
            placed = true;
            break;
          } else {
            movedCells.forEach((m) => unbookSlots(block.grade, m.day, [m.slot]));
            slotGroup.forEach((s, idx) => {
              if (cells[idx]) bookSlots(block.grade, day, [s], cells[idx]!);
            });
          }
        }
      }
    }

    // Tier 4: Split unplaced double/triple blocks — STRICTLY protect PM/PAI, PSV/RBT/SEJ 2w, MT, SN, AM, and 8p BM from unsolvable splits!
    const totalWeeklySub = getSubjectWeeklyTotal(block.grade, block.subjectCode);
    const upperSub = block.subjectCode.toUpperCase();
    const isProtectedDouble =
      upperSub === 'PM/PAI' ||
      upperSub === 'PM' ||
      upperSub === 'PAI' ||
      upperSub === 'AM' ||
      upperSub === 'MT' ||
      upperSub === 'SN' ||
      (upperSub === 'BM' && totalWeeklySub <= 8) ||
      (['PSV', 'RBT', 'SEJ'].includes(upperSub) && totalWeeklySub === 2);
    if (!placed && block.length === 3 && !isProtectedDouble) {
      blocks.splice(
        bIndex + 1,
        0,
        { ...block, id: `${block.id}_split2`, length: 2, priority: block.priority },
        { ...block, id: `${block.id}_split1`, length: 1, priority: block.priority }
      );
      placed = true;
    } else if (!placed && block.length === 2 && !isProtectedDouble) {
      blocks.splice(
        bIndex + 1,
        0,
        { ...block, id: `${block.id}_split1`, length: 1, priority: block.priority },
        { ...block, id: `${block.id}_split2`, length: 1, priority: block.priority }
      );
      placed = true;
    }

    // Step 3.5: 1-Hop Augmenting Swap for unplaced single blocks (STRICTLY enforcing <= 8.0, max 1 day > 7.0, compact subject caps & PJ rules)
    if (!placed && block.length === 1) {
      const hopMaxSubjects = baseMaxSubjects + 1;
      const targetDaysSorted = sortCandidateDaysForBlock([...DAYS_OF_WEEK], block, hopMaxSubjects);

      for (const targetDay of targetDaysSorted) {
        if (placed) break;
        const targetAllSlots = getGradeDaySlots(block.grade, targetDay, academicYear).filter(
          (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
        );

        for (const emptySlot of targetAllSlots) {
          if (placed) break;
          if (grid[block.grade][targetDay][emptySlot.slotId] !== null) continue;

          if (
            block.subjectCode === 'PJ' &&
            ((emptySlot.slotId !== 'W1' && emptySlot.slotId !== 'W2') || !canPlacePJOnDay(block.grade, targetDay, false))
          ) {
            // Skip direct PJ placement if slot/day violates PJ rule
          } else {
            const tInfo = getGradeDayRegularInfo(block.grade, targetDay, block.subjectCode);
            const tPos = tInfo.regularSlots.findIndex((rs) => rs.slotId === emptySlot.slotId);
            const w4AllowedDirect =
              !(isKP2027Year1 && block.grade === 1 && emptySlot.slotId === 'W4') ||
              canAssignYear1Period4(
                1,
                4,
                block.subjectCode,
                block.teacherCode,
                DAYS_OF_WEEK.filter((d) => d !== targetDay)
                  .map((d) => {
                    const c = grid[1]?.[d]?.['W4'];
                    return c ? { day: d, subjectCode: c.subjectCode, teacherId: c.teacherCode } : null;
                  })
                  .filter(Boolean) as Array<{ day: string; subjectCode: string; teacherId: string }>,
                false
              );

            if (
              w4AllowedDirect &&
              canAddSubjectToClassDay(tInfo.lessonsList, block.subjectCode, block.length, block.grade, {
                maxSubjectsOverride: hopMaxSubjects,
                existingPeriodPositions: tInfo.existingPositions,
                candidatePeriodPositions: [tPos],
              }) &&
              isSlotFreeForTeacher(block.teacherCode, targetDay, [emptySlot], block.subjectCode, block.grade, {
                dailyCapOverride: 8,
                enforceBreaks: false,
                allowSingleDayOver7: true,
              })
            ) {
              bookSlots(block.grade, targetDay, [emptySlot], {
                subjectId: block.id,
                subjectCode: block.subjectCode,
                subjectName: block.subjectName,
                teacherCode: block.teacherCode,
                ...(block.secondaryTeacherCode
                  ? { secondaryTeacherCode: block.secondaryTeacherCode, isCoTeaching: true }
                  : {}),
              });
              placed = true;
              break;
            }
          }

          // Same-Day Session Slide for [1]-block: shift adjacent intact blocks into emptySlot so block's teacher can use the vacated clock time!
          if (block.subjectCode !== 'PJ') {
            const tInfoSlide = getGradeDayRegularInfo(block.grade, targetDay, block.subjectCode);
            const sessList = [
              targetAllSlots.filter((s) => s.endMinutes <= 585),
              targetAllSlots.filter((s) => s.startMinutes >= 615),
            ];
            for (const sess of sessList) {
              if (placed) break;
              const eIdx = sess.findIndex((s) => s.slotId === emptySlot.slotId);
              if (eIdx < 0) continue;
              for (let k = 0; k < sess.length; k++) {
                if (placed) break;
                if (k === eIdx) continue;
                const moveSlots = k < eIdx ? sess.slice(k, eIdx) : sess.slice(eIdx + 1, k + 1);
                const destSlots = k < eIdx ? sess.slice(k + 1, eIdx + 1) : sess.slice(eIdx, k);
                if (moveSlots.some((s) => grid[block.grade][targetDay][s.slotId] === null)) continue;
                const mCells = moveSlots.map((s) => grid[block.grade][targetDay][s.slotId]!);
                if (mCells.some((c) => c.isLocked || c.subjectCode === 'PJ')) continue;
                if (k < eIdx && k > 0 && grid[block.grade][targetDay][sess[k - 1].slotId]?.subjectCode === mCells[0].subjectCode) continue;
                if (k > eIdx && k + 1 < sess.length && grid[block.grade][targetDay][sess[k + 1].slotId]?.subjectCode === mCells[mCells.length - 1].subjectCode) continue;
                if (isKP2027Year1 && block.grade === 1 && (moveSlots.some((s) => s.slotId === 'W4') || destSlots.some((s) => s.slotId === 'W4') || sess[k].slotId === 'W4')) {
                  continue;
                }
                const targetSlotForBlock = sess[k];
                const tPosSlide = tInfoSlide.regularSlots.findIndex((rs) => rs.slotId === targetSlotForBlock.slotId);
                if (
                  !canAddSubjectToClassDay(tInfoSlide.lessonsList, block.subjectCode, 1, block.grade, {
                    maxSubjectsOverride: hopMaxSubjects,
                    existingPeriodPositions: tInfoSlide.existingPositions,
                    candidatePeriodPositions: [tPosSlide],
                  })
                ) {
                  continue;
                }

                unbookSlots(block.grade, targetDay, moveSlots);
                const canShiftAll = mCells.every((mc, idx) =>
                  isSlotFreeForTeacher(mc.teacherCode, targetDay, [destSlots[idx]], mc.subjectCode, block.grade, {
                    dailyCapOverride: 8,
                    enforceBreaks: false,
                    allowSingleDayOver7: true,
                  })
                );
                if (!canShiftAll) {
                  moveSlots.forEach((s, idx) => bookSlots(block.grade, targetDay, [s], mCells[idx]));
                  continue;
                }
                destSlots.forEach((s, idx) => bookSlots(block.grade, targetDay, [s], mCells[idx]));
                if (
                  isSlotFreeForTeacher(block.teacherCode, targetDay, [targetSlotForBlock], block.subjectCode, block.grade, {
                    dailyCapOverride: 8,
                    enforceBreaks: false,
                    allowSingleDayOver7: true,
                  })
                ) {
                  bookSlots(block.grade, targetDay, [targetSlotForBlock], {
                    subjectId: block.id,
                    subjectCode: block.subjectCode,
                    subjectName: block.subjectName,
                    teacherCode: block.teacherCode,
                    ...(block.secondaryTeacherCode
                      ? { secondaryTeacherCode: block.secondaryTeacherCode, isCoTeaching: true }
                      : {}),
                  });
                  placed = true;
                  break;
                } else {
                  unbookSlots(block.grade, targetDay, destSlots);
                  moveSlots.forEach((s, idx) => bookSlots(block.grade, targetDay, [s], mCells[idx]));
                }
              }
            }
            if (placed) break;
          }

          // 1-Hop Swap: move existing candCell -> emptySlot, place block -> candSlot
          for (const candDay of DAYS_OF_WEEK) {
            if (placed) break;

            const candSlots = getGradeDaySlots(block.grade, candDay, academicYear).filter(
              (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
            );

            for (const candSlot of candSlots) {
              const candCell = grid[block.grade][candDay][candSlot.slotId];
              if (!candCell || candCell.isLocked || candCell.subjectCode === 'PM/PAI' || candCell.subjectCode.toUpperCase() === block.subjectCode.toUpperCase()) continue;

              // Never split an existing consecutive double/triple block when 1-hop swapping
              const candRegIdx = candSlots.findIndex((s) => s.slotId === candSlot.slotId);
              const candHasAdjSame =
                (candRegIdx > 0 && grid[block.grade][candDay][candSlots[candRegIdx - 1].slotId]?.subjectCode === candCell.subjectCode) ||
                (candRegIdx + 1 < candSlots.length && grid[block.grade][candDay][candSlots[candRegIdx + 1].slotId]?.subjectCode === candCell.subjectCode);
              if (candHasAdjSame) continue;

              // Guard block PJ restrictions at candSlot
              if (block.subjectCode === 'PJ') {
                if (candSlot.slotId !== 'W1' && candSlot.slotId !== 'W2') continue;
                if (!canPlacePJOnDay(block.grade, candDay, false)) continue;
              }

              // Guard candCell PJ restrictions at emptySlot
              if (candCell.subjectCode === 'PJ') {
                if (emptySlot.slotId !== 'W1' && emptySlot.slotId !== 'W2') continue;
                if (candDay !== targetDay) {
                  const otherPjDays = getScheduledPJDaysForGrade(block.grade).filter((d) => d !== candDay);
                  if (otherPjDays.includes(targetDay)) continue;
                  if (block.grade >= 2 && isPJConsecutiveDayViolated(block.grade, otherPjDays, targetDay)) continue;
                }
              }

              if (candDay !== targetDay) {
                const targetCandInfo = getGradeDayRegularInfo(block.grade, targetDay, candCell.subjectCode, new Set([emptySlot.slotId]));
                const emptyPos = targetCandInfo.regularSlots.findIndex((rs) => rs.slotId === emptySlot.slotId);
                if (
                  !canAddSubjectToClassDay(targetCandInfo.lessonsList, candCell.subjectCode, 1, block.grade, {
                    maxSubjectsOverride: hopMaxSubjects,
                    existingPeriodPositions: targetCandInfo.existingPositions,
                    candidatePeriodPositions: [emptyPos],
                  })
                ) {
                  continue;
                }
              }

              // Guard KP2027 Year 1 W4 anti-repetition during 1-hop swaps
              if (isKP2027Year1 && block.grade === 1) {
                if (emptySlot.slotId === 'W4') {
                  const y1w4Excl = DAYS_OF_WEEK.filter((d) => d !== targetDay && !(candSlot.slotId === 'W4' && d === candDay))
                    .map((d) => {
                      const c = grid[1]?.[d]?.['W4'];
                      return c ? { day: d, subjectCode: c.subjectCode, teacherId: c.teacherCode } : null;
                    })
                    .filter(Boolean) as Array<{ day: string; subjectCode: string; teacherId: string }>;
                  if (!canAssignYear1Period4(1, 4, candCell.subjectCode, candCell.teacherCode, y1w4Excl, false)) {
                    continue;
                  }
                }
                if (candSlot.slotId === 'W4') {
                  const y1w4ExclCand = DAYS_OF_WEEK.filter((d) => d !== candDay)
                    .map((d) => {
                      if (d === targetDay && emptySlot.slotId === 'W4') {
                        return { day: d, subjectCode: candCell.subjectCode, teacherId: candCell.teacherCode };
                      }
                      const c = grid[1]?.[d]?.['W4'];
                      return c ? { day: d, subjectCode: c.subjectCode, teacherId: c.teacherCode } : null;
                    })
                    .filter(Boolean) as Array<{ day: string; subjectCode: string; teacherId: string }>;
                  if (!canAssignYear1Period4(1, 4, block.subjectCode, block.teacherCode, y1w4ExclCand, false)) {
                    continue;
                  }
                }
              }

              // Unbook candCell first so same-day move sees accurate loads without double counting candCell
              unbookSlots(block.grade, candDay, [candSlot]);

              const candCanMove = isSlotFreeForTeacher(
                candCell.teacherCode,
                targetDay,
                [emptySlot],
                candCell.subjectCode,
                block.grade,
                { dailyCapOverride: 8, enforceBreaks: false, allowSingleDayOver7: true }
              );

              if (!candCanMove) {
                bookSlots(block.grade, candDay, [candSlot], candCell);
                continue;
              }

              bookSlots(block.grade, targetDay, [emptySlot], candCell);

              const candAfterInfo = getGradeDayRegularInfo(block.grade, candDay, block.subjectCode, new Set([candSlot.slotId]));
              const candPos = candAfterInfo.regularSlots.findIndex((rs) => rs.slotId === candSlot.slotId);

              if (
                canAddSubjectToClassDay(candAfterInfo.lessonsList, block.subjectCode, block.length, block.grade, {
                  maxSubjectsOverride: hopMaxSubjects,
                  existingPeriodPositions: candAfterInfo.existingPositions,
                  candidatePeriodPositions: [candPos],
                }) &&
                isSlotFreeForTeacher(block.teacherCode, candDay, [candSlot], block.subjectCode, block.grade, {
                  dailyCapOverride: 8,
                  enforceBreaks: false,
                  allowSingleDayOver7: true,
                })
              ) {
                bookSlots(block.grade, candDay, [candSlot], {
                  subjectId: block.id,
                  subjectCode: block.subjectCode,
                  subjectName: block.subjectName,
                  teacherCode: block.teacherCode,
                  ...(block.secondaryTeacherCode
                    ? { secondaryTeacherCode: block.secondaryTeacherCode, isCoTeaching: true }
                    : {}),
                });
                placed = true;
                break;
              } else {
                unbookSlots(block.grade, targetDay, [emptySlot]);
                bookSlots(block.grade, candDay, [candSlot], candCell);
              }
            }
          }
        }
      }

      // Step 3.5B-0: Teacher-conflict unblock in `otherG` on `targetDay` for any empty slot
      if (!placed && block.teacherCode) {
        const blockTeachers = block.teacherCode.split('/').map((t) => t.trim()).filter(Boolean);
        if (blockTeachers.length === 1) {
          const bt = blockTeachers[0];
          for (const targetDay of targetDaysSorted) {
            if (placed) break;
            if (block.subjectCode === 'PJ' && !canPlacePJOnDay(block.grade, targetDay, false)) continue;
            const targetAllSlots = getGradeDaySlots(block.grade, targetDay, academicYear).filter(
              (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
            );
            const tInfo = getGradeDayRegularInfo(block.grade, targetDay, block.subjectCode);
            for (const emptySlot of targetAllSlots) {
              if (placed) break;
              if (grid[block.grade][targetDay][emptySlot.slotId] !== null) continue;
              if (block.subjectCode === 'PJ' && emptySlot.slotId !== 'W1' && emptySlot.slotId !== 'W2') continue;
              const tPos = tInfo.regularSlots.findIndex((rs) => rs.slotId === emptySlot.slotId);
              const w4Ok =
                !(isKP2027Year1 && block.grade === 1 && emptySlot.slotId === 'W4') ||
                canAssignYear1Period4(
                  1,
                  4,
                  block.subjectCode,
                  block.teacherCode,
                  DAYS_OF_WEEK.filter((d) => d !== targetDay)
                    .map((d) => {
                      const c = grid[1]?.[d]?.['W4'];
                      return c ? { day: d, subjectCode: c.subjectCode, teacherId: c.teacherCode } : null;
                    })
                    .filter(Boolean) as Array<{ day: string; subjectCode: string; teacherId: string }>,
                  false
                );
              if (
                !w4Ok ||
                !canAddSubjectToClassDay(tInfo.lessonsList, block.subjectCode, 1, block.grade, {
                  maxSubjectsOverride: hopMaxSubjects,
                  existingPeriodPositions: tInfo.existingPositions,
                  candidatePeriodPositions: [tPos],
                })
              ) {
                continue;
              }
              // Check daily cap/over7 first (without clock overlap)
              const addedPkar = isKP2027Year1 && block.grade === 1 && emptySlot.slotId === 'W4' ? 0.5 : 0;
              const newLoad = getEffectiveTeacherDayLoad(bt, targetDay) + 1 + addedPkar;
              if (newLoad > MAX_TEACHER_DAILY_PERIODS + 1e-6) continue;
              if (newLoad > 7.0 + 1e-6) {
                const wt = teacherTotalWorkload.get(bt) || 0;
                const maxO7 = wt <= 36 ? 1 : Math.min(5, Math.ceil(wt - 35));
                const otherO7 = DAYS_OF_WEEK.filter((d) => d !== targetDay && getEffectiveTeacherDayLoad(bt, d) > 7.0 + 1e-6).length;
                if (otherO7 >= maxO7) continue;
              }

              // Find exact single conflict in `otherG` on `targetDay`
              const conflicts: Array<{ og: number; cSlot: SlotTimeInfo; cCell: TimetableCell }> = [];
              for (let og = 1; og <= 6; og++) {
                if (og === block.grade) continue;
                const ogSlots = getGradeDaySlots(og, targetDay, academicYear).filter(
                  (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
                );
                for (const ogs of ogSlots) {
                  const ogc = grid[og][targetDay][ogs.slotId];
                  if (!ogc || !ogc.teacherCode.split('/').map((x) => x.trim()).includes(bt)) continue;
                  if (Math.max(ogs.startMinutes, emptySlot.startMinutes) < Math.min(ogs.endMinutes, emptySlot.endMinutes)) {
                    conflicts.push({ og, cSlot: ogs, cCell: ogc });
                  }
                }
              }
              if (conflicts.length !== 1) continue;
              const { og, cSlot, cCell } = conflicts[0];
              if (cCell.isLocked || cCell.subjectCode === 'PJ' || cCell.subjectCode === 'PM/PAI') continue;
              if (isKP2027Year1 && og === 1 && cSlot.slotId === 'W4') continue;
              const ogSlots = getGradeDaySlots(og, targetDay, academicYear).filter(
                (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
              );
              const cIdx = ogSlots.findIndex((s) => s.slotId === cSlot.slotId);
              const cAdj =
                (cIdx > 0 && grid[og][targetDay][ogSlots[cIdx - 1].slotId]?.subjectCode === cCell.subjectCode) ||
                (cIdx >= 0 && cIdx + 1 < ogSlots.length && grid[og][targetDay][ogSlots[cIdx + 1].slotId]?.subjectCode === cCell.subjectCode);
              if (cAdj) continue;

              for (let pIdx = 0; pIdx < ogSlots.length; pIdx++) {
                if (pIdx === cIdx) continue;
                const pSlot = ogSlots[pIdx];
                const pCell = grid[og][targetDay][pSlot.slotId];
                if (!pCell || pCell.isLocked || pCell.subjectCode === 'PJ' || pCell.subjectCode === 'PM/PAI' || pCell.subjectCode === cCell.subjectCode) continue;
                if (isKP2027Year1 && og === 1 && pSlot.slotId === 'W4') continue;
                const pAdj =
                  (pIdx > 0 && grid[og][targetDay][ogSlots[pIdx - 1].slotId]?.subjectCode === pCell.subjectCode) ||
                  (pIdx + 1 < ogSlots.length && grid[og][targetDay][ogSlots[pIdx + 1].slotId]?.subjectCode === pCell.subjectCode);
                if (pAdj) continue;

                unbookSlots(og, targetDay, [cSlot, pSlot]);
                const okC = isSlotFreeForTeacher(cCell.teacherCode, targetDay, [pSlot], cCell.subjectCode, og, {
                  dailyCapOverride: 8,
                  enforceBreaks: false,
                  allowSingleDayOver7: true,
                });
                const okP =
                  okC &&
                  isSlotFreeForTeacher(pCell.teacherCode, targetDay, [cSlot], pCell.subjectCode, og, {
                    dailyCapOverride: 8,
                    enforceBreaks: false,
                    allowSingleDayOver7: true,
                  });
                if (!okC || !okP) {
                  bookSlots(og, targetDay, [cSlot], cCell);
                  bookSlots(og, targetDay, [pSlot], pCell);
                  continue;
                }
                bookSlots(og, targetDay, [pSlot], cCell);
                bookSlots(og, targetDay, [cSlot], pCell);

                if (
                  isSlotFreeForTeacher(block.teacherCode, targetDay, [emptySlot], block.subjectCode, block.grade, {
                    dailyCapOverride: 8,
                    enforceBreaks: false,
                    allowSingleDayOver7: true,
                  })
                ) {
                  bookSlots(block.grade, targetDay, [emptySlot], {
                    subjectId: block.id,
                    subjectCode: block.subjectCode,
                    subjectName: block.subjectName,
                    teacherCode: block.teacherCode,
                    ...(block.secondaryTeacherCode
                      ? { secondaryTeacherCode: block.secondaryTeacherCode, isCoTeaching: true }
                      : {}),
                  });
                  placed = true;
                  break;
                }

                unbookSlots(og, targetDay, [cSlot, pSlot]);
                bookSlots(og, targetDay, [cSlot], cCell);
                bookSlots(og, targetDay, [pSlot], pCell);
              }
            }
          }
        }
      }
    }

    // Step 3.5B-1: For unplaced [1]-block in full classes, swap an intact [2]-block on targetDay with a [2]-block of block.subjectCode on otherDay so block drops adjacent into targetDay's empty slot!
    if (!placed && block.length === 1 && block.subjectCode !== 'PJ' && block.subjectCode !== 'PM/PAI') {
      const hopMaxSub = baseMaxSubjects + 1;
      for (const targetDay of DAYS_OF_WEEK) {
        if (placed) break;
        const tAll = getGradeDaySlots(block.grade, targetDay, academicYear).filter(
          (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
        );
        const emptySlots = tAll.filter((s) => grid[block.grade][targetDay][s.slotId] === null);
        if (emptySlots.length === 0) continue;

        for (let dIdx = 0; dIdx < tAll.length - 1 && !placed; dIdx++) {
          const d1 = tAll[dIdx];
          const d2 = tAll[dIdx + 1];
          if (d1.endMinutes <= 585 && d2.startMinutes >= 615) continue;
          const dc1 = grid[block.grade][targetDay][d1.slotId];
          const dc2 = grid[block.grade][targetDay][d2.slotId];
          if (!dc1 || !dc2 || dc1.isLocked || dc2.isLocked || dc1.subjectCode !== dc2.subjectCode || dc1.subjectCode === 'PM/PAI' || dc1.subjectCode === block.subjectCode) continue;
          if (dIdx > 0 && grid[block.grade][targetDay][tAll[dIdx - 1].slotId]?.subjectCode === dc1.subjectCode) continue;
          if (dIdx + 2 < tAll.length && grid[block.grade][targetDay][tAll[dIdx + 2].slotId]?.subjectCode === dc1.subjectCode) continue;
          if (isKP2027Year1 && block.grade === 1 && (d1.slotId === 'W4' || d2.slotId === 'W4')) continue;

          // Check if any emptySlot is adjacent to [d1, d2] in the same session
          const adjEmpty = emptySlots.find((es) => {
            const eIdx = tAll.findIndex((s) => s.slotId === es.slotId);
            const sameSessionLeft = eIdx + 1 === dIdx && !(es.endMinutes <= 585 && d1.startMinutes >= 615);
            const sameSessionRight = eIdx === dIdx + 2 && !(d2.endMinutes <= 585 && es.startMinutes >= 615);
            return sameSessionLeft || sameSessionRight;
          });
          if (!adjEmpty) continue;

          for (const otherDay of DAYS_OF_WEEK) {
            if (otherDay === targetDay || placed) continue;
            const oAll = getGradeDaySlots(block.grade, otherDay, academicYear).filter(
              (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
            );
            for (let oIdx = 0; oIdx < oAll.length - 1 && !placed; oIdx++) {
              const o1 = oAll[oIdx];
              const o2 = oAll[oIdx + 1];
              if (o1.endMinutes <= 585 && o2.startMinutes >= 615) continue;
              const oc1 = grid[block.grade][otherDay][o1.slotId];
              const oc2 = grid[block.grade][otherDay][o2.slotId];
              if (!oc1 || !oc2 || oc1.isLocked || oc2.isLocked || oc1.subjectCode !== block.subjectCode || oc2.subjectCode !== block.subjectCode) continue;
              if (oIdx > 0 && grid[block.grade][otherDay][oAll[oIdx - 1].slotId]?.subjectCode === oc1.subjectCode) continue;
              if (oIdx + 2 < oAll.length && grid[block.grade][otherDay][oAll[oIdx + 2].slotId]?.subjectCode === oc1.subjectCode) continue;
              if (isKP2027Year1 && block.grade === 1 && (o1.slotId === 'W4' || o2.slotId === 'W4')) continue;

              unbookSlots(block.grade, targetDay, [d1, d2]);
              unbookSlots(block.grade, otherDay, [o1, o2]);

              const tInfoAfter = getGradeDayRegularInfo(block.grade, targetDay, block.subjectCode);
              const oInfoAfter = getGradeDayRegularInfo(block.grade, otherDay, dc1.subjectCode);
              const tPos = [d1, d2].map((s) => tInfoAfter.regularSlots.findIndex((rs) => rs.slotId === s.slotId));
              const oPos = [o1, o2].map((s) => oInfoAfter.regularSlots.findIndex((rs) => rs.slotId === s.slotId));

              const swapOk =
                canAddSubjectToClassDay(tInfoAfter.lessonsList, oc1.subjectCode, 2, block.grade, {
                  maxSubjectsOverride: hopMaxSub,
                  existingPeriodPositions: tInfoAfter.existingPositions,
                  candidatePeriodPositions: tPos,
                }) &&
                canAddSubjectToClassDay(oInfoAfter.lessonsList, dc1.subjectCode, 2, block.grade, {
                  maxSubjectsOverride: hopMaxSub,
                  existingPeriodPositions: oInfoAfter.existingPositions,
                  candidatePeriodPositions: oPos,
                }) &&
                isSlotFreeForTeacher(oc1.teacherCode, targetDay, [d1, d2], oc1.subjectCode, block.grade, {
                  dailyCapOverride: 8,
                  enforceBreaks: false,
                  allowSingleDayOver7: true,
                }) &&
                isSlotFreeForTeacher(dc1.teacherCode, otherDay, [o1, o2], dc1.subjectCode, block.grade, {
                  dailyCapOverride: 8,
                  enforceBreaks: false,
                  allowSingleDayOver7: true,
                });

              if (!swapOk) {
                bookSlots(block.grade, targetDay, [d1], dc1);
                bookSlots(block.grade, targetDay, [d2], dc2);
                bookSlots(block.grade, otherDay, [o1], oc1);
                bookSlots(block.grade, otherDay, [o2], oc2);
                continue;
              }

              bookSlots(block.grade, targetDay, [d1], oc1);
              bookSlots(block.grade, targetDay, [d2], oc2);
              bookSlots(block.grade, otherDay, [o1], dc1);
              bookSlots(block.grade, otherDay, [o2], dc2);

              const tInfoBlock = getGradeDayRegularInfo(block.grade, targetDay, block.subjectCode);
              const adjPos = tInfoBlock.regularSlots.findIndex((rs) => rs.slotId === adjEmpty.slotId);
              if (
                canAddSubjectToClassDay(tInfoBlock.lessonsList, block.subjectCode, 1, block.grade, {
                  maxSubjectsOverride: hopMaxSub,
                  existingPeriodPositions: tInfoBlock.existingPositions,
                  candidatePeriodPositions: [adjPos],
                }) &&
                isSlotFreeForTeacher(block.teacherCode, targetDay, [adjEmpty], block.subjectCode, block.grade, {
                  dailyCapOverride: 8,
                  enforceBreaks: false,
                  allowSingleDayOver7: true,
                })
              ) {
                bookSlots(block.grade, targetDay, [adjEmpty], {
                  subjectId: block.id,
                  subjectCode: block.subjectCode,
                  subjectName: block.subjectName,
                  teacherCode: block.teacherCode,
                  ...(block.secondaryTeacherCode
                    ? { secondaryTeacherCode: block.secondaryTeacherCode, isCoTeaching: true }
                    : {}),
                });
                placed = true;
                break;
              } else {
                unbookSlots(block.grade, targetDay, [d1, d2]);
                unbookSlots(block.grade, otherDay, [o1, o2]);
                bookSlots(block.grade, targetDay, [d1], dc1);
                bookSlots(block.grade, targetDay, [d2], dc2);
                bookSlots(block.grade, otherDay, [o1], oc1);
                bookSlots(block.grade, otherDay, [o2], oc2);
              }
            }
          }
        }
      }
    }

    // Step 3.5B-2: For unplaced [2]-block (e.g. RBT/PSV/SEJ), relocate a single [1]-block next to an empty slot on dayB onto an empty slot on dayA to open a contiguous [2]-slot!
    if (!placed && block.length === 2 && block.subjectCode !== 'PJ' && block.subjectCode !== 'PM/PAI') {
      const hopMaxSub = baseMaxSubjects + 1;
      for (const dayB of DAYS_OF_WEEK) {
        if (placed) break;
        const bSlots = getGradeDaySlots(block.grade, dayB, academicYear).filter(
          (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
        );
        for (let i = 0; i < bSlots.length - 1 && !placed; i++) {
          const s1 = bSlots[i];
          const s2 = bSlots[i + 1];
          if (s1.endMinutes <= 585 && s2.startMinutes >= 615) continue;
          if (block.isMorningOnly && s2.startMinutes >= 615) continue;
          const c1 = grid[block.grade][dayB][s1.slotId];
          const c2 = grid[block.grade][dayB][s2.slotId];
          // Need exactly 1 empty + 1 movable standalone [1]-block!
          if ((c1 === null) === (c2 === null)) continue;
          const occSlot = c1 !== null ? s1 : s2;
          const occIdx = c1 !== null ? i : i + 1;
          const occCell = (c1 !== null ? c1 : c2)!;
          if (occCell.isLocked || occCell.subjectCode === 'PJ' || occCell.subjectCode === 'PM/PAI') continue;
          const adjSame =
            (occIdx > 0 && grid[block.grade][dayB][bSlots[occIdx - 1].slotId]?.subjectCode === occCell.subjectCode) ||
            (occIdx + 1 < bSlots.length && grid[block.grade][dayB][bSlots[occIdx + 1].slotId]?.subjectCode === occCell.subjectCode);
          if (adjSame) continue;
          if (isKP2027Year1 && block.grade === 1 && (s1.slotId === 'W4' || s2.slotId === 'W4')) continue;

          for (const dayA of DAYS_OF_WEEK) {
            if (dayA === dayB || placed) continue;
            const aSlots = getGradeDaySlots(block.grade, dayA, academicYear).filter(
              (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
            );
            for (const destA of aSlots) {
              if (grid[block.grade][dayA][destA.slotId] !== null) continue;
              if (isKP2027Year1 && block.grade === 1 && destA.slotId === 'W4') continue;
              const aInfo = getGradeDayRegularInfo(block.grade, dayA, occCell.subjectCode);
              const aPos = aInfo.regularSlots.findIndex((rs) => rs.slotId === destA.slotId);
              if (
                !canAddSubjectToClassDay(aInfo.lessonsList, occCell.subjectCode, 1, block.grade, {
                  maxSubjectsOverride: hopMaxSub,
                  existingPeriodPositions: aInfo.existingPositions,
                  candidatePeriodPositions: [aPos],
                }) ||
                !isSlotFreeForTeacher(occCell.teacherCode, dayA, [destA], occCell.subjectCode, block.grade, {
                  dailyCapOverride: 8,
                  enforceBreaks: false,
                  allowSingleDayOver7: true,
                })
              ) {
                continue;
              }

              unbookSlots(block.grade, dayB, [occSlot]);
              bookSlots(block.grade, dayA, [destA], occCell);

              const bInfo = getGradeDayRegularInfo(block.grade, dayB, block.subjectCode);
              const bPos = [s1, s2].map((sg) => bInfo.regularSlots.findIndex((rs) => rs.slotId === sg.slotId));
              if (
                canAddSubjectToClassDay(bInfo.lessonsList, block.subjectCode, 2, block.grade, {
                  maxSubjectsOverride: hopMaxSub,
                  existingPeriodPositions: bInfo.existingPositions,
                  candidatePeriodPositions: bPos,
                }) &&
                isSlotFreeForTeacher(block.teacherCode, dayB, [s1, s2], block.subjectCode, block.grade, {
                  dailyCapOverride: 8,
                  enforceBreaks: false,
                  allowSingleDayOver7: true,
                })
              ) {
                bookSlots(block.grade, dayB, [s1, s2], {
                  subjectId: block.id,
                  subjectCode: block.subjectCode,
                  subjectName: block.subjectName,
                  teacherCode: block.teacherCode,
                  ...(block.secondaryTeacherCode
                    ? { secondaryTeacherCode: block.secondaryTeacherCode, isCoTeaching: true }
                    : {}),
                });
                placed = true;
                break;
              } else {
                unbookSlots(block.grade, dayA, [destA]);
                bookSlots(block.grade, dayB, [occSlot], occCell);
              }
            }
          }
        }
      }
    }

    if (!placed) {
      unplacedBlocks.push(`T.${block.grade} ${block.subjectCode} (${block.length} waktu)`);
      unplacedBlockItems.push(block);
    }
  }

  // --------------------------------------------------------------------------
  // STEP 5: GUARANTEED ZERO-GAP COMPACTION (STRICTLY enforcing daily caps <= 8.0, compact subjects & PJ rules!)
  // --------------------------------------------------------------------------
  const canMove = (
    cell: TimetableCell,
    fromDay: DayOfWeek,
    fromSlot: SlotTimeInfo,
    toDay: DayOfWeek,
    toSlot: SlotTimeInfo,
    grade: number,
    relaxY1W4Subject: boolean = false
  ): boolean => {
    // PJ is strictly Period 1 or Period 2 only
    if (cell.subjectCode === 'PJ') {
      if (toSlot.slotId !== 'W1' && toSlot.slotId !== 'W2') return false;
      if (fromDay !== toDay) {
        const remainingPjDays = getScheduledPJDaysForGrade(grade).filter((d) => d !== fromDay);
        if (remainingPjDays.includes(toDay)) return false;
        if (grade >= 2 && isPJConsecutiveDayViolated(grade, remainingPjDays, toDay)) return false;
      }
    }

    // Never break ANY consecutive [2]/[3] block during gap compaction (same-day or cross-day!)
    const regSlots = getGradeDaySlots(grade, fromDay, academicYear).filter(
      (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
    );
    const fromIdx = regSlots.findIndex((s) => s.slotId === fromSlot.slotId);
    const hasAdjNeighbor =
      (fromIdx > 0 && grid[grade][fromDay][regSlots[fromIdx - 1].slotId]?.subjectCode === cell.subjectCode) ||
      (fromIdx >= 0 && fromIdx + 1 < regSlots.length && grid[grade][fromDay][regSlots[fromIdx + 1].slotId]?.subjectCode === cell.subjectCode);
    if (hasAdjNeighbor) return false;

    // Never stack duplicate teachers/subjects into Year 1 W4 (pre-PKAR) during gap compaction (KP2027 only)
    if (isKP2027Year1 && grade === 1 && toSlot.slotId === 'W4' && fromSlot.slotId !== 'W4') {
      const existingY1W4 = DAYS_OF_WEEK.filter((d) => d !== toDay)
        .map((d) => {
          const c = grid[1]?.[d]?.['W4'];
          return c ? { day: d, subjectCode: c.subjectCode, teacherId: c.teacherCode } : null;
        })
        .filter(Boolean) as Array<{ day: string; subjectCode: string; teacherId: string }>;
      if (relaxY1W4Subject) {
        const normT = (cell.teacherCode || '').trim();
        const sameT = existingY1W4.filter((x) => x.teacherId.trim() === normT).length;
        const distinctT = new Set([...existingY1W4.map((x) => x.teacherId.trim()), normT].filter(Boolean)).size;
        if (sameT >= 2 || (existingY1W4.length === 4 && distinctT < 4)) {
          return false;
        }
      } else if (!canAssignYear1Period4(1, 4, cell.subjectCode, cell.teacherCode, existingY1W4, false)) {
        return false;
      }
    }

    // Compact subject cap when moving across days + NEVER create 3 consecutive periods on target day (even same-day moves!)
    {
      const excludeIds = fromDay === toDay ? new Set([fromSlot.slotId, toSlot.slotId]) : new Set([toSlot.slotId]);
      const toInfo = getGradeDayRegularInfo(grade, toDay, cell.subjectCode, excludeIds);
      const toPos = toInfo.regularSlots.findIndex((rs) => rs.slotId === toSlot.slotId);
      if (hasThreeConsecutiveSameSubject(toInfo.existingPositions, [toPos])) {
        return false;
      }
      if (fromDay !== toDay) {
        const maxSubCap = getMaxSubjectsPerDay(grade) + 1;
        if (
          !canAddSubjectToClassDay(toInfo.lessonsList, cell.subjectCode, 1, grade, {
            maxSubjectsOverride: maxSubCap,
            existingPeriodPositions: toInfo.existingPositions,
            candidatePeriodPositions: [toPos],
          })
        ) {
          return false;
        }
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

      // Simulate exact teacher daily load after move (including PKAR +0.5 changes on Year 1 W4!)
      const addedPkarTo = grade === 1 && toSlot.slotId === 'W4' ? 0.5 : 0;
      const lostPkarFrom = grade === 1 && fromSlot.slotId === 'W4' ? 0.5 : 0;

      if (fromDay !== toDay) {
        const newToLoad = getEffectiveTeacherDayLoad(t, toDay) + 1 + addedPkarTo;
        if (newToLoad > MAX_TEACHER_DAILY_PERIODS + 1e-6) {
          return false;
        }
        if (newToLoad > 7.0 + 1e-6) {
          const weeklyT = teacherTotalWorkload.get(t) || 0;
          const maxOver7 = weeklyT <= 36 ? 1 : Math.min(5, Math.ceil(weeklyT - 35));
          const newFromLoad = Math.max(0, getEffectiveTeacherDayLoad(t, fromDay) - 1 - lostPkarFrom);
          const otherDaysOver7 = DAYS_OF_WEEK.filter((d) => {
            if (d === toDay) return false;
            if (d === fromDay) return newFromLoad > 7.0 + 1e-6;
            return getEffectiveTeacherDayLoad(t, d) > 7.0 + 1e-6;
          }).length;
          if (otherDaysOver7 >= maxOver7) {
            return false;
          }
        }
      } else {
        // Same-day move: check if entering Year 1 W4 adds +0.5 PKAR!
        if (addedPkarTo > 0 && lostPkarFrom === 0) {
          const newLoad = getEffectiveTeacherDayLoad(t, toDay) + addedPkarTo;
          if (newLoad > MAX_TEACHER_DAILY_PERIODS + 1e-6) {
            return false;
          }
          if (newLoad > 7.0 + 1e-6) {
            const weeklyT = teacherTotalWorkload.get(t) || 0;
            const maxOver7 = weeklyT <= 36 ? 1 : Math.min(5, Math.ceil(weeklyT - 35));
            const otherDaysOver7 = DAYS_OF_WEEK.filter(
              (d) => d !== toDay && getEffectiveTeacherDayLoad(t, d) > 7.0 + 1e-6
            ).length;
            if (otherDaysOver7 >= maxOver7) {
              return false;
            }
          }
        }
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
      if (fromDay !== toDay) {
        decTeacherDay(t, fromDay, 1);
        incTeacherDay(t, toDay, 1);
      }
    });
    grid[grade][toDay][toSlot.slotId] = cell;
    grid[grade][fromDay][fromSlot.slotId] = null;
  };

  const findGaps = () => {
    const gaps: Array<{ grade: number; day: DayOfWeek; slot: SlotTimeInfo; session: 'morning' | 'afternoon' }> = [];
    for (let g = 1; g <= 6; g++) {
      for (const day of DAYS_OF_WEEK) {
        const slots = getGradeDaySlots(g, day, academicYear);
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

  const runStep5Compaction = () => {
  for (let pass = 0; pass < 80; pass++) {
    const gaps = findGaps();
    if (gaps.length === 0) break;

    let anyMoved = false;
    for (const gap of gaps) {
      const { grade, day, slot, session } = gap;
      const slots = getGradeDaySlots(grade, day, academicYear);
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

      // Strategy 1B: Slide ANY contiguous [2+] period block (length 2 or 3) immediately following the gap 1 slot left into the gap!
      if (sIdx >= 0 && sIdx + 2 < pool.length) {
        const sNext1 = pool[sIdx + 1];
        const c1 = grid[grade][day][sNext1.slotId];
        const isNotCrossRecess = !(slot.endMinutes <= 585 && sNext1.startMinutes >= 615);
        if (c1 && !c1.isLocked && c1.subjectCode !== 'PJ' && isNotCrossRecess) {
          // Collect maximal contiguous run of same-subject block inside the SAME session (do not cross recess inside block!)
          const runSlots: SlotTimeInfo[] = [sNext1];
          const s1IsMorn = sNext1.endMinutes <= 585;
          for (let r = sIdx + 2; r < pool.length; r++) {
            const sr = pool[r];
            if ((sr.endMinutes <= 585) !== s1IsMorn) break;
            const cr = grid[grade][day][sr.slotId];
            if (!cr || cr.isLocked || cr.subjectCode !== c1.subjectCode) break;
            runSlots.push(sr);
          }

          if (runSlots.length >= 2) {
            // Never slide left if doing so would touch the same subject immediately left of `slot` and form 3 consecutive!
            const leftOfSlotSameSub =
              sIdx > 0 &&
              (pool[sIdx - 1].endMinutes <= 585) === (slot.endMinutes <= 585) &&
              grid[grade][day][pool[sIdx - 1].slotId]?.subjectCode === c1.subjectCode;
            if (leftOfSlotSameSub) continue;

            const p4Ok =
              !(isKP2027Year1 && grade === 1 && slot.slotId === 'W4') ||
              canAssignYear1Period4(
                1,
                4,
                c1.subjectCode,
                c1.teacherCode,
                DAYS_OF_WEEK.filter((d) => d !== day)
                  .map((d) => {
                    const cellW4 = grid[1]?.[d]?.['W4'];
                    return cellW4 ? { day: d, subjectCode: cellW4.subjectCode, teacherId: cellW4.teacherCode } : null;
                  })
                  .filter(Boolean) as Array<{ day: string; subjectCode: string; teacherId: string }>,
                false
              );

            // Check teacher availability at the newly occupied front slot (`slot`) when tail slot (`runSlots[last]`) is vacated
            const tailRunSlot = runSlots[runSlots.length - 1];
            const tailRunCell = grid[grade][day][tailRunSlot.slotId]!;
            unbookSlots(grade, day, [tailRunSlot]);
            const freeAtGap = isSlotFreeForTeacher(c1.teacherCode, day, [slot], c1.subjectCode, grade, {
              dailyCapOverride: 8,
              enforceBreaks: false,
              allowSingleDayOver7: true,
            });
            bookSlots(grade, day, [tailRunSlot], tailRunCell);

            if (p4Ok && freeAtGap) {
              let destSlot = slot;
              for (const srcSlot of runSlots) {
                executeMove(grade, day, srcSlot, day, destSlot);
                destSlot = srcSlot;
              }
              anyMoved = true;
              break;
            }
          }
        }
      }
      if (anyMoved) break;

      // Strategy 1C: Same-day 2-step swap across a middle gap (e.g. [BC(1), EMPTY, SN(1)] -> [SN(1), BC(1), EMPTY])
      if (sIdx > 0 && sIdx + 1 < pool.length) {
        for (let lIdx = 0; lIdx < sIdx; lIdx++) {
          if (anyMoved) break;
          const sLeft = pool[lIdx];
          const cLeft = grid[grade][day][sLeft.slotId];
          if (!cLeft || cLeft.isLocked || cLeft.subjectCode === 'PJ' || cLeft.subjectCode === 'PM/PAI') continue;
          if (!canMove(cLeft, day, sLeft, day, slot, grade)) continue;

          for (let rIdx = sIdx + 1; rIdx < pool.length; rIdx++) {
            const sRight = pool[rIdx];
            const cRight = grid[grade][day][sRight.slotId];
            if (!cRight || cRight.isLocked || cRight.subjectCode === 'PJ' || cRight.subjectCode === 'PM/PAI') continue;
            if (!canMove(cRight, day, sRight, day, sLeft, grade)) continue;

            executeMove(grade, day, sLeft, day, slot);
            if (canMove(cRight, day, sRight, day, sLeft, grade)) {
              executeMove(grade, day, sRight, day, sLeft);
              anyMoved = true;
              break;
            } else {
              executeMove(grade, day, slot, day, sLeft);
            }
          }
        }
      }
      if (anyMoved) break;

      // Strategy 1D: Reorder all intact subject runs within the same session (morning/afternoon) packed from start -> eliminates any intra-session gap!
      const sessSlots = session === 'morning' ? mSlots : aSlots;
      let startUnlockedIdx = 0;
      for (let i = 0; i < sessSlots.length; i++) {
        const c = grid[grade][day][sessSlots[i].slotId];
        if (c && (c.isLocked || c.subjectCode === 'PJ')) {
          startUnlockedIdx = i + 1;
        }
      }
      const unlockedSess = sessSlots.slice(startUnlockedIdx);
      const gapInUnlockedIdx = unlockedSess.findIndex((s) => s.slotId === slot.slotId);
      const hasOccAfterGapInUnlocked =
        gapInUnlockedIdx >= 0 && unlockedSess.slice(gapInUnlockedIdx + 1).some((s) => grid[grade][day][s.slotId] !== null);
      if (gapInUnlockedIdx >= 0 && hasOccAfterGapInUnlocked && unlockedSess.length >= 3) {
        const runs: Array<{ slots: SlotTimeInfo[]; cells: TimetableCell[]; subjectCode: string; teacherCode: string }> = [];
        let uIdx = 0;
        while (uIdx < unlockedSess.length) {
          const cs = unlockedSess[uIdx];
          const cc = grid[grade][day][cs.slotId];
          if (!cc) {
            uIdx++;
            continue;
          }
          const rSlots: SlotTimeInfo[] = [cs];
          const rCells: TimetableCell[] = [cc];
          while (uIdx + 1 < unlockedSess.length) {
            const nextS = unlockedSess[uIdx + 1];
            const nextC = grid[grade][day][nextS.slotId];
            if (!nextC || nextC.subjectCode !== cc.subjectCode || nextC.isLocked) break;
            rSlots.push(nextS);
            rCells.push(nextC);
            uIdx++;
          }
          if (rSlots.length === 3) {
            runs.push({ slots: rSlots.slice(0, 2), cells: rCells.slice(0, 2), subjectCode: cc.subjectCode, teacherCode: cc.teacherCode });
            runs.push({ slots: rSlots.slice(2, 3), cells: rCells.slice(2, 3), subjectCode: cc.subjectCode, teacherCode: cc.teacherCode });
          } else {
            runs.push({ slots: rSlots, cells: rCells, subjectCode: cc.subjectCode, teacherCode: cc.teacherCode });
          }
          uIdx++;
        }

        const totalOccLen = runs.reduce((acc, r) => acc + r.slots.length, 0);
        if (runs.length >= 2 && runs.length <= 5 && totalOccLen < unlockedSess.length) {
          const allOccSlots = runs.flatMap((r) => r.slots);
          const allOccCells = runs.flatMap((r) => r.cells);
          unbookSlots(grade, day, allOccSlots);

          const otherDaysY1W4 =
            isKP2027Year1 && grade === 1
              ? (DAYS_OF_WEEK.filter((d) => d !== day)
                  .map((d) => {
                    const cw4 = grid[1]?.[d]?.['W4'];
                    return cw4 ? { day: d, subjectCode: cw4.subjectCode, teacherId: cw4.teacherCode } : null;
                  })
                  .filter(Boolean) as Array<{ day: string; subjectCode: string; teacherId: string }>)
              : [];

          const distinctRunSubs = Array.from(new Set(runs.map((r) => r.subjectCode)));
          const leftBoundarySub = startUnlockedIdx > 0 ? grid[grade][day][sessSlots[startUnlockedIdx - 1].slotId]?.subjectCode : undefined;
          const tryPermute = (usedMask: number, offset: number, prevSub?: string): boolean => {
            if (usedMask === (1 << runs.length) - 1) {
              return !distinctRunSubs.some((sc) =>
                hasThreeConsecutiveSameSubject(getGradeDayRegularInfo(grade, day, sc).existingPositions, [])
              );
            }
            for (let ri = 0; ri < runs.length; ri++) {
              if (usedMask & (1 << ri)) continue;
              const run = runs[ri];
              if ((offset === 0 ? leftBoundarySub : prevSub) === run.subjectCode) continue;
              const destSlots = unlockedSess.slice(offset, offset + run.slots.length);
              if (destSlots.length !== run.slots.length) continue;

              const w4Ok =
                !(isKP2027Year1 && grade === 1 && destSlots.some((s) => s.slotId === 'W4')) ||
                canAssignYear1Period4(1, 4, run.subjectCode, run.teacherCode, otherDaysY1W4, false);

              if (
                w4Ok &&
                isSlotFreeForTeacher(run.teacherCode, day, destSlots, run.subjectCode, grade, {
                  dailyCapOverride: 8,
                  enforceBreaks: false,
                  allowSingleDayOver7: true,
                })
              ) {
                destSlots.forEach((ds, idx) => bookSlots(grade, day, [ds], run.cells[idx]));
                if (tryPermute(usedMask | (1 << ri), offset + run.slots.length, run.subjectCode)) {
                  return true;
                }
                unbookSlots(grade, day, destSlots);
              }
            }
            return false;
          };

          if (tryPermute(0, 0)) {
            anyMoved = true;
            break;
          } else {
            allOccSlots.forEach((s, idx) => bookSlots(grade, day, [s], allOccCells[idx]));
            // Strategy 1D-Unblock: if a teacher of one of `runs` has a standalone [1]-block conflict in `otherG` on `day` blocking a target slot in `unlockedSess.slice(0, totalOccLen)`, swap that [1]-block in `otherG` and retry `tryPermute`!
            const packedTargetSlots = unlockedSess.slice(0, totalOccLen);
            const runTeachers = Array.from(new Set(runs.flatMap((r) => r.teacherCode.split('/').map((x) => x.trim()).filter(Boolean))));
            for (const rt of runTeachers) {
              if (anyMoved) break;
              const blockers: Array<{ otherG: number; cSlot: SlotTimeInfo; cCell: TimetableCell }> = [];
              for (let og = 1; og <= 6 && blockers.length < 3; og++) {
                if (og === grade) continue;
                const ogSlots = getGradeDaySlots(og, day, academicYear).filter(
                  (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
                );
                for (let oi = 0; oi < ogSlots.length; oi++) {
                  const ogs = ogSlots[oi];
                  const ogc = grid[og][day][ogs.slotId];
                  if (!ogc || ogc.isLocked || ogc.subjectCode === 'PJ' || ogc.subjectCode === 'PM/PAI') continue;
                  if (isKP2027Year1 && og === 1 && ogs.slotId === 'W4') continue;
                  if (!ogc.teacherCode.split('/').map((x) => x.trim()).includes(rt)) continue;
                  const adjSame =
                    (oi > 0 && grid[og][day][ogSlots[oi - 1].slotId]?.subjectCode === ogc.subjectCode) ||
                    (oi + 1 < ogSlots.length && grid[og][day][ogSlots[oi + 1].slotId]?.subjectCode === ogc.subjectCode);
                  if (adjSame) continue;
                  if (packedTargetSlots.some((ps) => Math.max(ps.startMinutes, ogs.startMinutes) < Math.min(ps.endMinutes, ogs.endMinutes))) {
                    blockers.push({ otherG: og, cSlot: ogs, cCell: ogc });
                  }
                }
              }
              for (const blk of blockers) {
                if (anyMoved) break;
                const ogSlots = getGradeDaySlots(blk.otherG, day, academicYear).filter(
                  (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
                );
                for (let pi = 0; pi < ogSlots.length; pi++) {
                  const pSlot = ogSlots[pi];
                  if (pSlot.slotId === blk.cSlot.slotId) continue;
                  const pCell = grid[blk.otherG][day][pSlot.slotId];
                  if (!pCell || pCell.isLocked || pCell.subjectCode === 'PJ' || pCell.subjectCode === 'PM/PAI' || pCell.subjectCode === blk.cCell.subjectCode) continue;
                  if (isKP2027Year1 && blk.otherG === 1 && pSlot.slotId === 'W4') continue;
                  const pAdj =
                    (pi > 0 && grid[blk.otherG][day][ogSlots[pi - 1].slotId]?.subjectCode === pCell.subjectCode) ||
                    (pi + 1 < ogSlots.length && grid[blk.otherG][day][ogSlots[pi + 1].slotId]?.subjectCode === pCell.subjectCode);
                  if (pAdj) continue;

                  unbookSlots(blk.otherG, day, [blk.cSlot, pSlot]);
                  const ok1 = isSlotFreeForTeacher(blk.cCell.teacherCode, day, [pSlot], blk.cCell.subjectCode, blk.otherG, {
                    dailyCapOverride: 8,
                    enforceBreaks: false,
                    allowSingleDayOver7: true,
                  });
                  const ok2 =
                    ok1 &&
                    isSlotFreeForTeacher(pCell.teacherCode, day, [blk.cSlot], pCell.subjectCode, blk.otherG, {
                      dailyCapOverride: 8,
                      enforceBreaks: false,
                      allowSingleDayOver7: true,
                    });
                  if (!ok1 || !ok2) {
                    bookSlots(blk.otherG, day, [blk.cSlot], blk.cCell);
                    bookSlots(blk.otherG, day, [pSlot], pCell);
                    continue;
                  }
                  bookSlots(blk.otherG, day, [pSlot], blk.cCell);
                  bookSlots(blk.otherG, day, [blk.cSlot], pCell);

                  unbookSlots(grade, day, allOccSlots);
                  if (tryPermute(0, 0)) {
                    anyMoved = true;
                    break;
                  }
                  allOccSlots.forEach((s, idx) => bookSlots(grade, day, [s], allOccCells[idx]));
                  unbookSlots(blk.otherG, day, [blk.cSlot, pSlot]);
                  bookSlots(blk.otherG, day, [blk.cSlot], blk.cCell);
                  bookSlots(blk.otherG, day, [pSlot], pCell);
                }
              }
            }
          }
        }
      }
      if (anyMoved) break;

      // Strategy 1E: Same-day Cross-Recess Session Balance Swap (morning runs permutation + afternoon full permutation & same-subject coalescing!)
      if (session === 'morning') {
        const mEndEmptyCount = (() => {
          let cnt = 0;
          for (let i = mSlots.length - 1; i >= 0; i--) {
            if (grid[grade][day][mSlots[i].slotId] !== null) break;
            cnt++;
          }
          return cnt;
        })();
        if (mEndEmptyCount >= 1) {
          // Find contiguous morning unlocked run immediately preceding the trailing empty slots
          const mLastOccIdx = mSlots.length - 1 - mEndEmptyCount;
          if (mLastOccIdx >= 0) {
            const mTailCell = grid[grade][day][mSlots[mLastOccIdx].slotId];
            if (mTailCell && !mTailCell.isLocked && mTailCell.subjectCode !== 'PJ') {
              let mRunStart = mLastOccIdx;
              while (mRunStart - 1 >= 0) {
                const pc = grid[grade][day][mSlots[mRunStart - 1].slotId];
                if (!pc || pc.isLocked || pc.subjectCode !== mTailCell.subjectCode) break;
                mRunStart--;
              }
              const mRunSlots = mSlots.slice(mRunStart, mLastOccIdx + 1);
              const mRunCells = mRunSlots.map((s) => grid[grade][day][s.slotId]!);
              const neededInMorning = mRunSlots.length + mEndEmptyCount;
              const targetMornSlots = mSlots.slice(mRunStart, mSlots.length);

              // Collect ALL intact afternoon runs (preserving each block cleanly)
              const allAfterRuns: Array<{ slots: SlotTimeInfo[]; cells: TimetableCell[]; subjectCode: string; teacherCode: string }> = [];
              let aIdx = 0;
              while (aIdx < aSlots.length) {
                const ac = grid[grade][day][aSlots[aIdx].slotId];
                if (!ac) {
                  aIdx++;
                  continue;
                }
                const rS: SlotTimeInfo[] = [aSlots[aIdx]];
                const rC: TimetableCell[] = [ac];
                while (aIdx + 1 < aSlots.length) {
                  const nc = grid[grade][day][aSlots[aIdx + 1].slotId];
                  if (!nc || nc.subjectCode !== ac.subjectCode || nc.isLocked) break;
                  rS.push(aSlots[aIdx + 1]);
                  rC.push(nc);
                  aIdx++;
                }
                allAfterRuns.push({ slots: rS, cells: rC, subjectCode: ac.subjectCode, teacherCode: ac.teacherCode });
                aIdx++;
              }

              const aLockedAny = allAfterRuns.some((r) => r.cells.some((c) => c.isLocked));
              const totalAfterSlotsOccupied = allAfterRuns.reduce((acc, r) => acc + r.cells.length, 0);
              if (!aLockedAny && allAfterRuns.length <= 5) {
                const aAllOccSlots = allAfterRuns.flatMap((r) => r.slots);
                const aAllOccCells = allAfterRuns.flatMap((r) => r.cells);

                for (let rIdx = 0; rIdx < allAfterRuns.length && !anyMoved; rIdx++) {
                  const ar = allAfterRuns[rIdx];
                  if (ar.slots.length !== neededInMorning) continue;
                  // Check Y1 W4 rule if moving ar into W4
                  if (isKP2027Year1 && grade === 1 && targetMornSlots.some((s) => s.slotId === 'W4') && !mRunSlots.some((s) => s.slotId === 'W4')) {
                    const y1w4Other = DAYS_OF_WEEK.filter((d) => d !== day)
                      .map((d) => {
                        const c = grid[1]?.[d]?.['W4'];
                        return c ? { day: d, subjectCode: c.subjectCode, teacherId: c.teacherCode } : null;
                      })
                      .filter(Boolean) as Array<{ day: string; subjectCode: string; teacherId: string }>;
                    if (!canAssignYear1Period4(1, 4, ar.subjectCode, ar.cells[0].teacherCode, y1w4Other, false)) continue;
                  }

                  const tryCommit1E = (): boolean => {
                    targetMornSlots.forEach((s, idx) => bookSlots(grade, day, [s], ar.cells[idx]));

                    // Build new afternoon runs: coalesce mRunCells into a matching same-subject run if total <= 3 (or 2 for non-major), else add as separate run!
                    const baseAfterRuns = allAfterRuns.filter((_, idx) => idx !== rIdx);
                    const newAfterRuns = baseAfterRuns.map((r) => ({ ...r, cells: [...r.cells] }));
                    const mergeTarget = newAfterRuns.find(
                      (r) =>
                        r.subjectCode === mTailCell.subjectCode &&
                        r.cells.length + mRunCells.length <= Math.min(2, getMaxDailyPeriodsForSubject(mTailCell.subjectCode))
                    );
                    if (mergeTarget) {
                      mergeTarget.cells.push(...mRunCells);
                    } else {
                      newAfterRuns.push({
                        slots: [],
                        cells: [...mRunCells],
                        subjectCode: mTailCell.subjectCode,
                        teacherCode: mTailCell.teacherCode,
                      });
                    }

                    if (newAfterRuns.length <= 5 && totalAfterSlotsOccupied - ar.cells.length + mRunCells.length <= aSlots.length) {
                      const tryAfterPermMorn = (usedMask: number, offset: number, prevSub?: string): boolean => {
                        if (usedMask === (1 << newAfterRuns.length) - 1) return true;
                        for (let ri = 0; ri < newAfterRuns.length; ri++) {
                          if (usedMask & (1 << ri)) continue;
                          const run = newAfterRuns[ri];
                          if (prevSub && prevSub === run.subjectCode) continue;
                          if (offset === 0 && ar.subjectCode === run.subjectCode) continue;
                          const destSlots = aSlots.slice(offset, offset + run.cells.length);
                          if (destSlots.length !== run.cells.length) continue;
                          if (
                            isSlotFreeForTeacher(run.teacherCode, day, destSlots, run.subjectCode, grade, {
                              dailyCapOverride: 8,
                              enforceBreaks: false,
                              allowSingleDayOver7: true,
                            })
                          ) {
                            destSlots.forEach((ds, idx) => bookSlots(grade, day, [ds], run.cells[idx]));
                            if (tryAfterPermMorn(usedMask | (1 << ri), offset + run.cells.length, run.subjectCode)) return true;
                            unbookSlots(grade, day, destSlots);
                          }
                        }
                        return false;
                      };

                      if (tryAfterPermMorn(0, 0)) {
                        return true;
                      }
                    }

                    unbookSlots(grade, day, targetMornSlots);
                    return false;
                  };

                  unbookSlots(grade, day, [...mRunSlots, ...aAllOccSlots]);
                  const arFitsMorn = isSlotFreeForTeacher(ar.cells[0].teacherCode, day, targetMornSlots, ar.subjectCode, grade, {
                    dailyCapOverride: 8,
                    enforceBreaks: false,
                    allowSingleDayOver7: true,
                  });

                  if (arFitsMorn && tryCommit1E()) {
                    anyMoved = true;
                    break;
                  }

                  // Strategy 1E-Unblock: if arFitsMorn failed due to clock overlap with an unlocked same-length run in another grade on `day`, swap it inside `otherG` on `day`!
                  if (!arFitsMorn) {
                    const arTeachers = ar.cells[0].teacherCode.split('/').map((x) => x.trim()).filter(Boolean);
                    for (let og = 1; og <= 6 && !anyMoved; og++) {
                      if (og === grade) continue;
                      const ogReg = getGradeDaySlots(og, day, academicYear).filter(
                        (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
                      );
                      const ogRuns: Array<{ slots: SlotTimeInfo[]; cells: TimetableCell[]; subjectCode: string; teacherCode: string }> = [];
                      let oi = 0;
                      while (oi < ogReg.length) {
                        const oc = grid[og][day][ogReg[oi].slotId];
                        if (!oc) { oi++; continue; }
                        const rS: SlotTimeInfo[] = [ogReg[oi]];
                        const rC: TimetableCell[] = [oc];
                        while (oi + 1 < ogReg.length) {
                          const nc = grid[og][day][ogReg[oi + 1].slotId];
                          if (!nc || nc.subjectCode !== oc.subjectCode || nc.isLocked) break;
                          if (ogReg[oi].endMinutes <= 585 && ogReg[oi + 1].startMinutes >= 615) break;
                          rS.push(ogReg[oi + 1]);
                          rC.push(nc);
                          oi++;
                        }
                        if (!rC.some((c) => c.isLocked) && oc.subjectCode !== 'PJ' && oc.subjectCode !== 'PM/PAI') {
                          ogRuns.push({ slots: rS, cells: rC, subjectCode: oc.subjectCode, teacherCode: oc.teacherCode });
                        }
                        oi++;
                      }

                      const blockingRuns = ogRuns.filter(
                        (r) =>
                          r.slots.length === neededInMorning &&
                          !(isKP2027Year1 && og === 1 && r.slots.some((s) => s.slotId === 'W4')) &&
                          r.teacherCode.split('/').map((x) => x.trim()).some((t) => arTeachers.includes(t)) &&
                          r.slots.some((rs) => targetMornSlots.some((ts) => Math.max(rs.startMinutes, ts.startMinutes) < Math.min(rs.endMinutes, ts.endMinutes)))
                      );
                      if (blockingRuns.length !== 1) continue;
                      const blk = blockingRuns[0];

                      for (const pRun of ogRuns) {
                        if (anyMoved) break;
                        if (pRun === blk || pRun.slots.length !== blk.slots.length || pRun.subjectCode === blk.subjectCode) continue;
                        if (isKP2027Year1 && og === 1 && pRun.slots.some((s) => s.slotId === 'W4')) continue;

                        unbookSlots(og, day, [...blk.slots, ...pRun.slots]);
                        const blkOk = isSlotFreeForTeacher(blk.teacherCode, day, pRun.slots, blk.subjectCode, og, {
                          dailyCapOverride: 8,
                          enforceBreaks: false,
                          allowSingleDayOver7: true,
                        });
                        const pOk =
                          blkOk &&
                          isSlotFreeForTeacher(pRun.teacherCode, day, blk.slots, pRun.subjectCode, og, {
                            dailyCapOverride: 8,
                            enforceBreaks: false,
                            allowSingleDayOver7: true,
                          });
                        if (!blkOk || !pOk) {
                          blk.slots.forEach((s, idx) => bookSlots(og, day, [s], blk.cells[idx]));
                          pRun.slots.forEach((s, idx) => bookSlots(og, day, [s], pRun.cells[idx]));
                          continue;
                        }
                        pRun.slots.forEach((s, idx) => bookSlots(og, day, [s], blk.cells[idx]));
                        blk.slots.forEach((s, idx) => bookSlots(og, day, [s], pRun.cells[idx]));

                        const arFitsAfterUnblock = isSlotFreeForTeacher(ar.cells[0].teacherCode, day, targetMornSlots, ar.subjectCode, grade, {
                          dailyCapOverride: 8,
                          enforceBreaks: false,
                          allowSingleDayOver7: true,
                        });
                        if (arFitsAfterUnblock && tryCommit1E()) {
                          anyMoved = true;
                          break;
                        }

                        unbookSlots(og, day, [...blk.slots, ...pRun.slots]);
                        blk.slots.forEach((s, idx) => bookSlots(og, day, [s], blk.cells[idx]));
                        pRun.slots.forEach((s, idx) => bookSlots(og, day, [s], pRun.cells[idx]));
                      }
                    }
                  }

                  if (anyMoved) break;
                  mRunSlots.forEach((s, idx) => bookSlots(grade, day, [s], mRunCells[idx]));
                  aAllOccSlots.forEach((s, idx) => bookSlots(grade, day, [s], aAllOccCells[idx]));
                }
              }

          // Strategy 1F: Shift morning-tail [2]-run (or swap with an afternoon [2]-run) right onto `gap` (opening `mRunStart` before `gap`),
          // then immediately pull ANY otherDay tail [1]-lesson into the newly opened `mRunStart` slot!
          if (!anyMoved && mEndEmptyCount === 1) {
            const shiftedMornSlots = mSlots.slice(mRunStart + 1, mSlots.length);
            const openedSlot = mSlots[mRunStart];
            if (shiftedMornSlots.length === mRunSlots.length) {
              const candRuns: Array<{ runSlots: SlotTimeInfo[]; runCells: TimetableCell[]; isMornRun: boolean }> = [
                { runSlots: mRunSlots, runCells: mRunCells, isMornRun: true },
                ...allAfterRuns
                  .filter((r) => !r.cells.some((c) => c.isLocked) && r.cells.length === mRunSlots.length)
                  .map((r) => ({ runSlots: r.slots, runCells: r.cells, isMornRun: false })),
              ];

              const y1w4Other1F =
                isKP2027Year1 && grade === 1
                  ? (DAYS_OF_WEEK.filter((d) => d !== day)
                      .map((d) => {
                        const c = grid[1]?.[d]?.['W4'];
                        return c ? { day: d, subjectCode: c.subjectCode, teacherId: c.teacherCode } : null;
                      })
                      .filter(Boolean) as Array<{ day: string; subjectCode: string; teacherId: string }>)
                  : [];

              for (const cand of candRuns) {
                if (anyMoved) break;
                const candSub = cand.runCells[0].subjectCode;
                const candTeacher = cand.runCells[0].teacherCode;
                if (
                  isKP2027Year1 &&
                  grade === 1 &&
                  shiftedMornSlots.some((s) => s.slotId === 'W4') &&
                  !canAssignYear1Period4(1, 4, candSub, candTeacher, y1w4Other1F, false)
                ) {
                  continue;
                }

                // Do not place cand adjacent across Recess to same subject (avoid W3-W4-W5 3-consecutive)
                const afterFirstCell = grid[grade][day][aSlots[0]?.slotId];
                if (afterFirstCell && afterFirstCell.subjectCode === candSub && shiftedMornSlots[shiftedMornSlots.length - 1].slotId === mSlots[mSlots.length - 1].slotId) {
                  continue;
                }

                if (cand.isMornRun) {
                  unbookSlots(grade, day, mRunSlots);
                  if (
                    isSlotFreeForTeacher(candTeacher, day, shiftedMornSlots, candSub, grade, {
                      dailyCapOverride: 8,
                      enforceBreaks: false,
                      allowSingleDayOver7: true,
                    })
                  ) {
                    shiftedMornSlots.forEach((s, idx) => bookSlots(grade, day, [s], mRunCells[idx]));
                    for (const otherDay of DAYS_OF_WEEK) {
                      if (otherDay === day || anyMoved) continue;
                      const oSlots = getGradeDaySlots(grade, otherDay, academicYear).filter(
                        (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
                      );
                      for (let k = oSlots.length - 1; k >= 0; k--) {
                        const src = oSlots[k];
                        const sCell = grid[grade][otherDay][src.slotId];
                        if (sCell && !sCell.isLocked) {
                          const isTail = oSlots.slice(k + 1).every((s) => grid[grade][otherDay][s.slotId] === null);
                          if (isTail && canMove(sCell, otherDay, src, day, openedSlot, grade)) {
                            executeMove(grade, otherDay, src, day, openedSlot);
                            anyMoved = true;
                            break;
                          }
                        }
                      }
                    }
                    if (!anyMoved) {
                      unbookSlots(grade, day, shiftedMornSlots);
                      mRunSlots.forEach((s, idx) => bookSlots(grade, day, [s], mRunCells[idx]));
                    }
                  } else {
                    mRunSlots.forEach((s, idx) => bookSlots(grade, day, [s], mRunCells[idx]));
                  }
                } else {
                  unbookSlots(grade, day, [...mRunSlots, ...cand.runSlots]);
                  const okMorn = isSlotFreeForTeacher(candTeacher, day, shiftedMornSlots, candSub, grade, {
                    dailyCapOverride: 8,
                    enforceBreaks: false,
                    allowSingleDayOver7: true,
                  });
                  const okAfter =
                    okMorn &&
                    isSlotFreeForTeacher(mTailCell.teacherCode, day, cand.runSlots, mTailCell.subjectCode, grade, {
                      dailyCapOverride: 8,
                      enforceBreaks: false,
                      allowSingleDayOver7: true,
                    });
                  if (okMorn && okAfter) {
                    shiftedMornSlots.forEach((s, idx) => bookSlots(grade, day, [s], cand.runCells[idx]));
                    cand.runSlots.forEach((s, idx) => bookSlots(grade, day, [s], mRunCells[idx]));

                    for (const otherDay of DAYS_OF_WEEK) {
                      if (otherDay === day || anyMoved) continue;
                      const oSlots = getGradeDaySlots(grade, otherDay, academicYear).filter(
                        (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
                      );
                      for (let k = oSlots.length - 1; k >= 0; k--) {
                        const src = oSlots[k];
                        const sCell = grid[grade][otherDay][src.slotId];
                        if (sCell && !sCell.isLocked) {
                          const isTail = oSlots.slice(k + 1).every((s) => grid[grade][otherDay][s.slotId] === null);
                          if (isTail && canMove(sCell, otherDay, src, day, openedSlot, grade)) {
                            executeMove(grade, otherDay, src, day, openedSlot);
                            anyMoved = true;
                            break;
                          }
                        }
                      }
                    }

                    if (!anyMoved) {
                      unbookSlots(grade, day, [...shiftedMornSlots, ...cand.runSlots]);
                      mRunSlots.forEach((s, idx) => bookSlots(grade, day, [s], mRunCells[idx]));
                      cand.runSlots.forEach((s, idx) => bookSlots(grade, day, [s], cand.runCells[idx]));
                    }
                  } else {
                    mRunSlots.forEach((s, idx) => bookSlots(grade, day, [s], mRunCells[idx]));
                    cand.runSlots.forEach((s, idx) => bookSlots(grade, day, [s], cand.runCells[idx]));
                  }
                }
              }
            }
          }
        }
      }
    }
  } else if (session === 'afternoon') {
        // Swap an intact unlocked afternoon run with an intact unlocked morning run of the SAME length, then pack afternoon from start!
        const aUnlockedRuns: Array<{ slots: SlotTimeInfo[]; cells: TimetableCell[]; subjectCode: string; teacherCode: string }> = [];
        let ai = 0;
        while (ai < aSlots.length) {
          const ac = grid[grade][day][aSlots[ai].slotId];
          if (!ac) { ai++; continue; }
          const rS: SlotTimeInfo[] = [aSlots[ai]];
          const rC: TimetableCell[] = [ac];
          while (ai + 1 < aSlots.length) {
            const nc = grid[grade][day][aSlots[ai + 1].slotId];
            if (!nc || nc.subjectCode !== ac.subjectCode || nc.isLocked) break;
            rS.push(aSlots[ai + 1]);
            rC.push(nc);
            ai++;
          }
          if (!rC.some((c) => c.isLocked) && rC[0].subjectCode !== 'PJ') {
            aUnlockedRuns.push({ slots: rS, cells: rC, subjectCode: ac.subjectCode, teacherCode: ac.teacherCode });
          }
          ai++;
        }

        const mRuns: Array<{ slots: SlotTimeInfo[]; cells: TimetableCell[]; subjectCode: string; teacherCode: string }> = [];
        let mi = 0;
        while (mi < mSlots.length) {
          const mc = grid[grade][day][mSlots[mi].slotId];
          if (!mc) { mi++; continue; }
          const rS: SlotTimeInfo[] = [mSlots[mi]];
          const rC: TimetableCell[] = [mc];
          while (mi + 1 < mSlots.length) {
            const nc = grid[grade][day][mSlots[mi + 1].slotId];
            if (!nc || nc.subjectCode !== mc.subjectCode || nc.isLocked) break;
            rS.push(mSlots[mi + 1]);
            rC.push(nc);
            mi++;
          }
          if (!rC.some((c) => c.isLocked) && rC[0].subjectCode !== 'PJ') {
            mRuns.push({ slots: rS, cells: rC, subjectCode: mc.subjectCode, teacherCode: mc.teacherCode });
          }
          mi++;
        }

        if (aUnlockedRuns.length >= 2 && aUnlockedRuns.length <= 4 && !aSlots.some((s) => grid[grade][day][s.slotId]?.isLocked)) {
          const aTotalSlots = aUnlockedRuns.flatMap((r) => r.slots);
          const aTotalCells = aUnlockedRuns.flatMap((r) => r.cells);
          const otherDaysY1W4 =
            isKP2027Year1 && grade === 1
              ? (DAYS_OF_WEEK.filter((d) => d !== day)
                  .map((d) => {
                    const cw4 = grid[1]?.[d]?.['W4'];
                    return cw4 ? { day: d, subjectCode: cw4.subjectCode, teacherId: cw4.teacherCode } : null;
                  })
                  .filter(Boolean) as Array<{ day: string; subjectCode: string; teacherId: string }>)
              : [];

          for (let aIdx = 0; aIdx < aUnlockedRuns.length && !anyMoved; aIdx++) {
            const ar = aUnlockedRuns[aIdx];
            for (let mIdx = 0; mIdx < mRuns.length && !anyMoved; mIdx++) {
              const mr = mRuns[mIdx];
              if (mr.slots.length !== ar.slots.length) continue;

              // Guard Y1 W4 if either run involves W4
              if (
                isKP2027Year1 &&
                grade === 1 &&
                mr.slots.some((s) => s.slotId === 'W4') &&
                !canAssignYear1Period4(1, 4, ar.subjectCode, ar.teacherCode, otherDaysY1W4, false)
              ) {
                continue;
              }

              // Unbook all morning mr + all afternoon runs
              unbookSlots(grade, day, [...mr.slots, ...aTotalSlots]);

              // Put ar into mr.slots
              const arFitsMorn = isSlotFreeForTeacher(ar.teacherCode, day, mr.slots, ar.subjectCode, grade, {
                dailyCapOverride: 8,
                enforceBreaks: false,
                allowSingleDayOver7: true,
              });
              if (!arFitsMorn) {
                mr.slots.forEach((s, idx) => bookSlots(grade, day, [s], mr.cells[idx]));
                aTotalSlots.forEach((s, idx) => bookSlots(grade, day, [s], aTotalCells[idx]));
                continue;
              }
              mr.slots.forEach((s, idx) => bookSlots(grade, day, [s], ar.cells[idx]));

              const newAfterRuns = aUnlockedRuns.map((r, idx) => (idx === aIdx ? { ...mr, slots: mr.slots } : r));
              // Pack newAfterRuns contiguously from index 0 of aSlots via permutation
              const tryAfterPerm = (usedMask: number, offset: number): boolean => {
                if (usedMask === (1 << newAfterRuns.length) - 1) return true;
                for (let ri = 0; ri < newAfterRuns.length; ri++) {
                  if (usedMask & (1 << ri)) continue;
                  const run = newAfterRuns[ri];
                  const destSlots = aSlots.slice(offset, offset + run.cells.length);
                  if (destSlots.length !== run.cells.length) continue;
                  if (
                    isSlotFreeForTeacher(run.teacherCode, day, destSlots, run.subjectCode, grade, {
                      dailyCapOverride: 8,
                      enforceBreaks: false,
                      allowSingleDayOver7: true,
                    })
                  ) {
                    destSlots.forEach((ds, idx) => bookSlots(grade, day, [ds], run.cells[idx]));
                    if (tryAfterPerm(usedMask | (1 << ri), offset + run.cells.length)) return true;
                    unbookSlots(grade, day, destSlots);
                  }
                }
                return false;
              };

              if (tryAfterPerm(0, 0)) {
                anyMoved = true;
                break;
              } else {
                unbookSlots(grade, day, mr.slots);
                mr.slots.forEach((s, idx) => bookSlots(grade, day, [s], mr.cells[idx]));
                aTotalSlots.forEach((s, idx) => bookSlots(grade, day, [s], aTotalCells[idx]));
              }
            }
          }
        }
      }
      if (anyMoved) break;

      // Strategy 2: Pull tail lesson from other days
      for (const otherDay of DAYS_OF_WEEK) {
        if (otherDay === day) continue;
        const otherSlots = getGradeDaySlots(grade, otherDay, academicYear).filter(
          (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
        );
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

      // Strategy 2C: If Year 1 W4 is the gap and another day's tail [1]-block matches a W4 subject on some `dayW4`,
      // rotate unlocked morning runs on `dayW4` so W4 changes subject cleanly, then move the tail into `gap`!
      if (isKP2027Year1 && grade === 1 && slot.slotId === 'W4') {
        for (const dayW4 of DAYS_OF_WEEK) {
          if (dayW4 === day || anyMoved) continue;
          const w4Cell = grid[1]?.[dayW4]?.['W4'];
          if (!w4Cell || w4Cell.isLocked || w4Cell.subjectCode === 'PJ') continue;
          const dW4Morn = getGradeDaySlots(1, dayW4, academicYear).filter(
            (s) => !s.isRecess && s.endMinutes <= 585 && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA'
          );
          if (dW4Morn.some((s) => !grid[1][dayW4][s.slotId])) continue;
          // Collect contiguous unlocked runs in dayW4 morning (after any locked/PJ run)
          const dW4Runs: Array<{ slots: SlotTimeInfo[]; cells: TimetableCell[]; subjectCode: string; teacherCode: string }> = [];
          let startIdx = 0;
          for (let i = 0; i < dW4Morn.length; i++) {
            const mc = grid[1][dayW4][dW4Morn[i].slotId];
            if (mc && (mc.isLocked || mc.subjectCode === 'PJ')) startIdx = i + 1;
          }
          const rotSlots = dW4Morn.slice(startIdx);
          let ri = 0;
          while (ri < rotSlots.length) {
            const mc = grid[1][dayW4][rotSlots[ri].slotId]!;
            const rs: SlotTimeInfo[] = [rotSlots[ri]];
            const rc: TimetableCell[] = [mc];
            while (ri + 1 < rotSlots.length) {
              const nc = grid[1][dayW4][rotSlots[ri + 1].slotId];
              if (!nc || nc.subjectCode !== mc.subjectCode) break;
              rs.push(rotSlots[ri + 1]);
              rc.push(nc);
              ri++;
            }
            dW4Runs.push({ slots: rs, cells: rc, subjectCode: mc.subjectCode, teacherCode: mc.teacherCode });
            ri++;
          }
          if (dW4Runs.length >= 2 && rotSlots.some((s) => s.slotId === 'W4')) {
            const origSlots = dW4Runs.flatMap((r) => r.slots);
            const origCells = dW4Runs.flatMap((r) => r.cells);
            for (const candRun of dW4Runs) {
              if (anyMoved) break;
              if (candRun.subjectCode === w4Cell.subjectCode) continue;
              const y1w4Other = DAYS_OF_WEEK.filter((d) => d !== dayW4 && d !== day)
                .map((d) => {
                  const c = grid[1]?.[d]?.['W4'];
                  return c ? { day: d, subjectCode: c.subjectCode, teacherId: c.teacherCode } : null;
                })
                .filter(Boolean) as Array<{ day: string; subjectCode: string; teacherId: string }>;
              if (!canAssignYear1Period4(1, 4, candRun.subjectCode, candRun.teacherCode, y1w4Other, false)) continue;

              // Place candRun at tail of rotSlots (so candRun lands on W4!) and other runs before it
              const otherRuns = dW4Runs.filter((r) => r !== candRun);
              const arranged = [...otherRuns, candRun];
              const destFlatSlots: SlotTimeInfo[] = [];
              let offset = 0;
              arranged.forEach((r) => {
                destFlatSlots.push(...rotSlots.slice(offset, offset + r.cells.length));
                offset += r.cells.length;
              });

              unbookSlots(1, dayW4, origSlots);
              let allFree = true;
              offset = 0;
              for (const r of arranged) {
                const ds = rotSlots.slice(offset, offset + r.cells.length);
                if (
                  !isSlotFreeForTeacher(r.teacherCode, dayW4, ds, r.subjectCode, 1, {
                    dailyCapOverride: 8,
                    enforceBreaks: false,
                    allowSingleDayOver7: true,
                  })
                ) {
                  allFree = false;
                  break;
                }
                offset += r.cells.length;
              }
              if (!allFree) {
                origSlots.forEach((s, idx) => bookSlots(1, dayW4, [s], origCells[idx]));
                continue;
              }
              offset = 0;
              arranged.forEach((r) => {
                const ds = rotSlots.slice(offset, offset + r.cells.length);
                ds.forEach((s, idx) => bookSlots(1, dayW4, [s], r.cells[idx]));
                offset += r.cells.length;
              });

              // Verify we didn't create 3-consecutive anywhere in dayW4 (including across Recess into W5)
              const creates3C = arranged.some((r) =>
                hasThreeConsecutiveSameSubject(getGradeDayRegularInfo(1, dayW4, r.subjectCode).existingPositions, [])
              );
              if (!creates3C) {
                for (const otherDay of DAYS_OF_WEEK) {
                  if (otherDay === day || anyMoved) continue;
                  const oSlots = getGradeDaySlots(1, otherDay, academicYear).filter(
                    (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
                  );
                  for (let k = oSlots.length - 1; k >= 0; k--) {
                    const src = oSlots[k];
                    const cell = grid[1][otherDay][src.slotId];
                    if (cell && !cell.isLocked) {
                      const isTail = oSlots.slice(k + 1).every((s) => grid[1][otherDay][s.slotId] === null);
                      if (isTail && canMove(cell, otherDay, src, day, slot, 1)) {
                        executeMove(1, otherDay, src, day, slot);
                        anyMoved = true;
                        break;
                      }
                    }
                  }
                }
              }
              if (!anyMoved) {
                unbookSlots(1, dayW4, origSlots);
                origSlots.forEach((s, idx) => bookSlots(1, dayW4, [s], origCells[idx]));
              }
            }
          }

          // Also try swapping the W4-ending unlocked morning run on `dayW4` with an equal-length unlocked afternoon run on `dayW4`
          if (!anyMoved && dW4Runs.length >= 1) {
            const w4Run = dW4Runs[dW4Runs.length - 1];
            const dW4After = getGradeDaySlots(1, dayW4, academicYear).filter(
              (s) => !s.isRecess && s.startMinutes >= 615 && s.slotId !== 'PKAR' && s.slotId !== 'TASMIK'
            );
            const afterRuns: Array<{ slots: SlotTimeInfo[]; cells: TimetableCell[]; subjectCode: string; teacherCode: string }> = [];
            let ai = 0;
            while (ai < dW4After.length) {
              const ac = grid[1][dayW4][dW4After[ai].slotId];
              if (!ac) { ai++; continue; }
              const rS: SlotTimeInfo[] = [dW4After[ai]];
              const rC: TimetableCell[] = [ac];
              while (ai + 1 < dW4After.length) {
                const nc = grid[1][dayW4][dW4After[ai + 1].slotId];
                if (!nc || nc.subjectCode !== ac.subjectCode || nc.isLocked) break;
                rS.push(dW4After[ai + 1]);
                rC.push(nc);
                ai++;
              }
              if (!rC.some((c) => c.isLocked) && ac.subjectCode !== 'PJ') {
                afterRuns.push({ slots: rS, cells: rC, subjectCode: ac.subjectCode, teacherCode: ac.teacherCode });
              }
              ai++;
            }

            const y1w4Other = DAYS_OF_WEEK.filter((d) => d !== dayW4 && d !== day)
              .map((d) => {
                const c = grid[1]?.[d]?.['W4'];
                return c ? { day: d, subjectCode: c.subjectCode, teacherId: c.teacherCode } : null;
              })
              .filter(Boolean) as Array<{ day: string; subjectCode: string; teacherId: string }>;

            for (const aRun of afterRuns) {
              if (anyMoved) break;
              if (aRun.slots.length !== w4Run.slots.length || aRun.subjectCode === w4Run.subjectCode) continue;
              if (!canAssignYear1Period4(1, 4, aRun.subjectCode, aRun.teacherCode, y1w4Other, false)) continue;

              unbookSlots(1, dayW4, [...w4Run.slots, ...aRun.slots]);
              const okW4 = isSlotFreeForTeacher(aRun.teacherCode, dayW4, w4Run.slots, aRun.subjectCode, 1, {
                dailyCapOverride: 8,
                enforceBreaks: false,
                allowSingleDayOver7: true,
              });
              const okA =
                okW4 &&
                isSlotFreeForTeacher(w4Run.teacherCode, dayW4, aRun.slots, w4Run.subjectCode, 1, {
                  dailyCapOverride: 8,
                  enforceBreaks: false,
                  allowSingleDayOver7: true,
                });
              if (okW4 && okA) {
                w4Run.slots.forEach((s, idx) => bookSlots(1, dayW4, [s], aRun.cells[idx]));
                aRun.slots.forEach((s, idx) => bookSlots(1, dayW4, [s], w4Run.cells[idx]));

                const creates3CAfter = [aRun.subjectCode, w4Run.subjectCode].some((sc) =>
                  hasThreeConsecutiveSameSubject(getGradeDayRegularInfo(1, dayW4, sc).existingPositions, [])
                );
                if (!creates3CAfter) {
                  for (const otherDay of DAYS_OF_WEEK) {
                    if (otherDay === day || anyMoved) continue;
                    const oSlots = getGradeDaySlots(1, otherDay, academicYear).filter(
                      (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
                    );
                    for (let k = oSlots.length - 1; k >= 0; k--) {
                      const src = oSlots[k];
                      const cell = grid[1][otherDay][src.slotId];
                      if (cell && !cell.isLocked) {
                        const isTail = oSlots.slice(k + 1).every((s) => grid[1][otherDay][s.slotId] === null);
                        if (isTail && canMove(cell, otherDay, src, day, slot, 1)) {
                          executeMove(1, otherDay, src, day, slot);
                          anyMoved = true;
                          break;
                        }
                      }
                    }
                  }
                }
                if (!anyMoved) {
                  unbookSlots(1, dayW4, [...w4Run.slots, ...aRun.slots]);
                  w4Run.slots.forEach((s, idx) => bookSlots(1, dayW4, [s], w4Run.cells[idx]));
                  aRun.slots.forEach((s, idx) => bookSlots(1, dayW4, [s], aRun.cells[idx]));
                }
              } else {
                w4Run.slots.forEach((s, idx) => bookSlots(1, dayW4, [s], w4Run.cells[idx]));
                aRun.slots.forEach((s, idx) => bookSlots(1, dayW4, [s], aRun.cells[idx]));
              }
            }
          }
        }
      }
      if (anyMoved) break;

      // Strategy 2B: Pull a standalone [1] from an earlier slot on otherDay if its afternoon tail [2]/[3] can slide left cleanly!
      for (const otherDay of DAYS_OF_WEEK) {
        if (otherDay === day) continue;
        const oAll = getGradeDaySlots(grade, otherDay, academicYear).filter(
          (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
        );
        const oAftern = oAll.filter((s) => s.startMinutes >= 615);
        for (let k = 0; k < oAftern.length; k++) {
          const src = oAftern[k];
          const cell = grid[grade][otherDay][src.slotId];
          if (!cell || cell.isLocked) continue;
          const tailAfter = oAftern.slice(k + 1);
          const occupiedTail = tailAfter.filter((s) => grid[grade][otherDay][s.slotId] !== null);
          if (occupiedTail.length === 0) continue;
          const contiguousAfter: SlotTimeInfo[] = [];
          for (let r = k + 1; r < oAftern.length; r++) {
            const cNext = grid[grade][otherDay][oAftern[r].slotId];
            if (!cNext) break;
            contiguousAfter.push(oAftern[r]);
          }
          if (contiguousAfter.length !== occupiedTail.length || contiguousAfter.some((s) => grid[grade][otherDay][s.slotId]?.isLocked || grid[grade][otherDay][s.slotId]?.subjectCode === 'PJ')) {
            continue;
          }
          if (!canMove(cell, otherDay, src, day, slot, grade)) continue;

          // Check if contiguousAfter can shift 1 slot left safely
          const afterCells = contiguousAfter.map((s) => grid[grade][otherDay][s.slotId]!);
          const destAfter = [src, ...contiguousAfter.slice(0, -1)];
          unbookSlots(grade, otherDay, contiguousAfter);
          const shiftOk = afterCells.every((ac, idx) =>
            isSlotFreeForTeacher(ac.teacherCode, otherDay, [destAfter[idx]], ac.subjectCode, grade, {
              dailyCapOverride: 8,
              enforceBreaks: false,
              allowSingleDayOver7: true,
            })
          );
          contiguousAfter.forEach((s, idx) => bookSlots(grade, otherDay, [s], afterCells[idx]));
          if (shiftOk) {
            executeMove(grade, otherDay, src, day, slot);
            for (let idx = 0; idx < contiguousAfter.length; idx++) {
              executeMove(grade, otherDay, contiguousAfter[idx], otherDay, destAfter[idx]);
            }
            anyMoved = true;
            break;
          }
        }
        if (anyMoved) break;
      }
      if (anyMoved) break;

      // Strategy 3: 2-way swap with tail of another day
      for (const otherDay of DAYS_OF_WEEK) {
        const allDaySlots = getGradeDaySlots(grade, otherDay, academicYear).filter(
          (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
        );
        for (const candSlot of allDaySlots) {
          const candCell = grid[grade][otherDay][candSlot.slotId];
          if (!candCell || candCell.isLocked) continue;
          if (canMove(candCell, otherDay, candSlot, day, slot, grade)) {
            for (const thirdDay of DAYS_OF_WEEK) {
              const thirdSlots = getGradeDaySlots(grade, thirdDay, academicYear).filter(
                (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
              );
              for (let t = thirdSlots.length - 1; t >= 0; t--) {
                const tailSlot = thirdSlots[t];
                const tailCell = grid[grade][thirdDay][tailSlot.slotId];
                if (!tailCell || tailCell.isLocked) continue;
                const isTail = thirdSlots.slice(t + 1).every((s) => grid[grade][thirdDay][s.slotId] === null);
                if (!isTail) continue;

                // Execute first step provisionally and check second step accurately!
                executeMove(grade, otherDay, candSlot, day, slot);
                if (canMove(tailCell, thirdDay, tailSlot, otherDay, candSlot, grade)) {
                  executeMove(grade, thirdDay, tailSlot, otherDay, candSlot);
                  anyMoved = true;
                  break;
                } else {
                  // Revert provisional move
                  executeMove(grade, day, slot, otherDay, candSlot);
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

      // Strategy 3C: Swap a [2]-block on `day` with a [2]-block on `otherDay` to unblock a tail [1] into `gap`!
      const dayAllReg = getGradeDaySlots(grade, day, academicYear).filter(
        (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
      );
      for (let dIdx = 0; dIdx < dayAllReg.length - 1; dIdx++) {
        if (anyMoved) break;
        const d1 = dayAllReg[dIdx];
        const d2 = dayAllReg[dIdx + 1];
        if (d1.endMinutes <= 585 && d2.startMinutes >= 615) continue;
        const dc1 = grid[grade][day][d1.slotId];
        const dc2 = grid[grade][day][d2.slotId];
        if (!dc1 || !dc2 || dc1.isLocked || dc2.isLocked || dc1.subjectCode !== dc2.subjectCode || dc1.subjectCode === 'PM/PAI') continue;
        if (dIdx > 0 && grid[grade][day][dayAllReg[dIdx - 1].slotId]?.subjectCode === dc1.subjectCode) continue;
        if (dIdx + 2 < dayAllReg.length && grid[grade][day][dayAllReg[dIdx + 2].slotId]?.subjectCode === dc1.subjectCode) continue;
        if (isKP2027Year1 && grade === 1 && (d1.slotId === 'W4' || d2.slotId === 'W4')) continue;

        for (const otherDay of DAYS_OF_WEEK) {
          if (otherDay === day || anyMoved) continue;
          const oReg = getGradeDaySlots(grade, otherDay, academicYear).filter(
            (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
          );
          for (let oIdx = 0; oIdx < oReg.length - 1; oIdx++) {
            if (anyMoved) break;
            const o1 = oReg[oIdx];
            const o2 = oReg[oIdx + 1];
            if (o1.endMinutes <= 585 && o2.startMinutes >= 615) continue;
            const oc1 = grid[grade][otherDay][o1.slotId];
            const oc2 = grid[grade][otherDay][o2.slotId];
            if (!oc1 || !oc2 || oc1.isLocked || oc2.isLocked || oc1.subjectCode !== oc2.subjectCode || oc1.subjectCode === 'PM/PAI') continue;
            if (oc1.subjectCode === dc1.subjectCode) continue;
            if (oIdx > 0 && grid[grade][otherDay][oReg[oIdx - 1].slotId]?.subjectCode === oc1.subjectCode) continue;
            if (oIdx + 2 < oReg.length && grid[grade][otherDay][oReg[oIdx + 2].slotId]?.subjectCode === oc1.subjectCode) continue;
            if (isKP2027Year1 && grade === 1 && (o1.slotId === 'W4' || o2.slotId === 'W4')) continue;

            unbookSlots(grade, day, [d1, d2]);
            unbookSlots(grade, otherDay, [o1, o2]);

            const maxSubD = Math.max(getMaxSubjectsPerDay(grade), getGradeDayRegularInfo(grade, day, oc1.subjectCode).distinctCount);
            const maxSubO = Math.max(getMaxSubjectsPerDay(grade), getGradeDayRegularInfo(grade, otherDay, dc1.subjectCode).distinctCount);
            const infoD = getGradeDayRegularInfo(grade, day, oc1.subjectCode);
            const infoO = getGradeDayRegularInfo(grade, otherDay, dc1.subjectCode);
            const posD = [d1, d2].map((sg) => infoD.regularSlots.findIndex((rs) => rs.slotId === sg.slotId));
            const posO = [o1, o2].map((sg) => infoO.regularSlots.findIndex((rs) => rs.slotId === sg.slotId));

            const okSwap =
              canAddSubjectToClassDay(infoD.lessonsList, oc1.subjectCode, 2, grade, {
                maxSubjectsOverride: maxSubD,
                existingPeriodPositions: infoD.existingPositions,
                candidatePeriodPositions: posD,
              }) &&
              canAddSubjectToClassDay(infoO.lessonsList, dc1.subjectCode, 2, grade, {
                maxSubjectsOverride: maxSubO,
                existingPeriodPositions: infoO.existingPositions,
                candidatePeriodPositions: posO,
              }) &&
              isSlotFreeForTeacher(oc1.teacherCode, day, [d1, d2], oc1.subjectCode, grade, {
                dailyCapOverride: 8,
                enforceBreaks: false,
                allowSingleDayOver7: true,
              }) &&
              isSlotFreeForTeacher(dc1.teacherCode, otherDay, [o1, o2], dc1.subjectCode, grade, {
                dailyCapOverride: 8,
                enforceBreaks: false,
                allowSingleDayOver7: true,
              });

            if (!okSwap) {
              bookSlots(grade, day, [d1], dc1);
              bookSlots(grade, day, [d2], dc2);
              bookSlots(grade, otherDay, [o1], oc1);
              bookSlots(grade, otherDay, [o2], oc2);
              continue;
            }

            bookSlots(grade, day, [d1], oc1);
            bookSlots(grade, day, [d2], oc2);
            bookSlots(grade, otherDay, [o1], dc1);
            bookSlots(grade, otherDay, [o2], dc2);

            for (const thirdDay of DAYS_OF_WEEK) {
              if (anyMoved) break;
              const tSlots = getGradeDaySlots(grade, thirdDay, academicYear).filter(
                (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
              );
              for (let t = tSlots.length - 1; t >= 0; t--) {
                const tSlot = tSlots[t];
                const tCell = grid[grade][thirdDay][tSlot.slotId];
                if (tCell && !tCell.isLocked) {
                  const isTail = tSlots.slice(t + 1).every((s) => grid[grade][thirdDay][s.slotId] === null);
                  if (isTail && canMove(tCell, thirdDay, tSlot, day, slot, grade)) {
                    executeMove(grade, thirdDay, tSlot, day, slot);
                    anyMoved = true;
                    break;
                  }
                }
              }
            }

            if (!anyMoved) {
              unbookSlots(grade, day, [d1, d2]);
              unbookSlots(grade, otherDay, [o1, o2]);
              bookSlots(grade, day, [d1], dc1);
              bookSlots(grade, day, [d2], dc2);
              bookSlots(grade, otherDay, [o1], oc1);
              bookSlots(grade, otherDay, [o2], oc2);
            }
          }
        }
      }
      if (anyMoved) break;
      // Strategy 3D: Cross-day [2]-block swap followed immediately by re-packing `session` on `day` from index 0 (eliminates stubborn afternoon/morning holes like [MZ(1), ., ., BM(2)]!)
      {
        const targetSessSlots = session === 'morning' ? mSlots : aSlots;
        const gapIdx3D = targetSessSlots.findIndex((s) => s.slotId === slot.slotId);
        const hasOccAfterGap3D =
          gapIdx3D >= 0 && targetSessSlots.slice(gapIdx3D + 1).some((s) => grid[grade][day][s.slotId] !== null);
        const dayRunsSess: Array<{ slots: SlotTimeInfo[]; cells: TimetableCell[]; subjectCode: string; teacherCode: string }> = [];
        let si = 0;
        while (hasOccAfterGap3D && si < targetSessSlots.length) {
          const sc = grid[grade][day][targetSessSlots[si].slotId];
          if (!sc) { si++; continue; }
          const rS: SlotTimeInfo[] = [targetSessSlots[si]];
          const rC: TimetableCell[] = [sc];
          while (si + 1 < targetSessSlots.length) {
            const nc = grid[grade][day][targetSessSlots[si + 1].slotId];
            if (!nc || nc.subjectCode !== sc.subjectCode || nc.isLocked) break;
            rS.push(targetSessSlots[si + 1]);
            rC.push(nc);
            si++;
          }
          dayRunsSess.push({ slots: rS, cells: rC, subjectCode: sc.subjectCode, teacherCode: sc.teacherCode });
          si++;
        }

        if (
          hasOccAfterGap3D &&
          dayRunsSess.length >= 2 &&
          dayRunsSess.length <= 4 &&
          !targetSessSlots.some((s) => grid[grade][day][s.slotId]?.isLocked || grid[grade][day][s.slotId]?.subjectCode === 'PJ')
        ) {
          const sessOccSlots = dayRunsSess.flatMap((r) => r.slots);
          const sessOccCells = dayRunsSess.flatMap((r) => r.cells);
          for (let rIdx = 0; rIdx < dayRunsSess.length && !anyMoved; rIdx++) {
            const dr = dayRunsSess[rIdx];
            if (dr.slots.length !== 2 || dr.subjectCode === 'PM/PAI') continue;
            if (isKP2027Year1 && grade === 1 && dr.slots.some((s) => s.slotId === 'W4')) continue;

            for (const otherDay of DAYS_OF_WEEK) {
              if (otherDay === day || anyMoved) continue;
              const oReg = getGradeDaySlots(grade, otherDay, academicYear).filter(
                (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
              );
              for (let oIdx = 0; oIdx < oReg.length - 1 && !anyMoved; oIdx++) {
                const o1 = oReg[oIdx];
                const o2 = oReg[oIdx + 1];
                if (o1.endMinutes <= 585 && o2.startMinutes >= 615) continue;
                const oc1 = grid[grade][otherDay][o1.slotId];
                const oc2 = grid[grade][otherDay][o2.slotId];
                if (!oc1 || !oc2 || oc1.isLocked || oc2.isLocked || oc1.subjectCode !== oc2.subjectCode || oc1.subjectCode === 'PM/PAI' || oc1.subjectCode === dr.subjectCode) continue;
                if (oIdx > 0 && grid[grade][otherDay][oReg[oIdx - 1].slotId]?.subjectCode === oc1.subjectCode) continue;
                if (oIdx + 2 < oReg.length && grid[grade][otherDay][oReg[oIdx + 2].slotId]?.subjectCode === oc1.subjectCode) continue;
                if (isKP2027Year1 && grade === 1 && (o1.slotId === 'W4' || o2.slotId === 'W4')) continue;

                unbookSlots(grade, day, sessOccSlots);
                unbookSlots(grade, otherDay, [o1, o2]);

                const maxSubD = Math.max(getMaxSubjectsPerDay(grade), getGradeDayRegularInfo(grade, day, oc1.subjectCode).distinctCount);
                const maxSubO = Math.max(getMaxSubjectsPerDay(grade), getGradeDayRegularInfo(grade, otherDay, dr.subjectCode).distinctCount);
                const infoD = getGradeDayRegularInfo(grade, day, oc1.subjectCode);
                const infoO = getGradeDayRegularInfo(grade, otherDay, dr.subjectCode);
                const posO = [o1, o2].map((sg) => infoO.regularSlots.findIndex((rs) => rs.slotId === sg.slotId));

                const okIntoO =
                  canAddSubjectToClassDay(infoO.lessonsList, dr.subjectCode, 2, grade, {
                    maxSubjectsOverride: maxSubO,
                    existingPeriodPositions: infoO.existingPositions,
                    candidatePeriodPositions: posO,
                  }) &&
                  isSlotFreeForTeacher(dr.teacherCode, otherDay, [o1, o2], dr.subjectCode, grade, {
                    dailyCapOverride: 8,
                    enforceBreaks: false,
                    allowSingleDayOver7: true,
                  });

                // Notice dr's subject is temporarily removed only inside session; infoD includes the other session on `day`!
                const okSubD = canAddSubjectToClassDay(infoD.lessonsList, oc1.subjectCode, 2, grade, {
                  maxSubjectsOverride: maxSubD,
                  existingPeriodPositions: infoD.existingPositions,
                });

                if (okIntoO && okSubD) {
                  bookSlots(grade, otherDay, [o1], dr.cells[0]);
                  bookSlots(grade, otherDay, [o2], dr.cells[1]);

                  const packedRuns = dayRunsSess.map((r, idx) =>
                    idx === rIdx ? { cells: [oc1, oc2], subjectCode: oc1.subjectCode, teacherCode: oc1.teacherCode } : r
                  );
                  const tryPack3D = (usedMask: number, offset: number, prevSub?: string): boolean => {
                    if (usedMask === (1 << packedRuns.length) - 1) return true;
                    for (let pi = 0; pi < packedRuns.length; pi++) {
                      if (usedMask & (1 << pi)) continue;
                      const run = packedRuns[pi];
                      if (prevSub && prevSub === run.subjectCode) continue;
                      const destSlots = targetSessSlots.slice(offset, offset + run.cells.length);
                      if (destSlots.length !== run.cells.length) continue;
                      const w4Guard =
                        !(isKP2027Year1 && grade === 1 && destSlots.some((s) => s.slotId === 'W4')) ||
                        canAssignYear1Period4(
                          1,
                          4,
                          run.subjectCode,
                          run.teacherCode,
                          DAYS_OF_WEEK.filter((d) => d !== day)
                            .map((d) => {
                              const cw4 = grid[1]?.[d]?.['W4'];
                              return cw4 ? { day: d, subjectCode: cw4.subjectCode, teacherId: cw4.teacherCode } : null;
                            })
                            .filter(Boolean) as Array<{ day: string; subjectCode: string; teacherId: string }>,
                          false
                        );
                      if (
                        w4Guard &&
                        isSlotFreeForTeacher(run.teacherCode, day, destSlots, run.subjectCode, grade, {
                          dailyCapOverride: 8,
                          enforceBreaks: false,
                          allowSingleDayOver7: true,
                        })
                      ) {
                        destSlots.forEach((ds, idx) => bookSlots(grade, day, [ds], run.cells[idx]));
                        if (tryPack3D(usedMask | (1 << pi), offset + run.cells.length, run.subjectCode)) return true;
                        unbookSlots(grade, day, destSlots);
                      }
                    }
                    return false;
                  };

                  if (tryPack3D(0, 0)) {
                    anyMoved = true;
                    break;
                  }
                  unbookSlots(grade, otherDay, [o1, o2]);
                }

                sessOccSlots.forEach((s, idx) => bookSlots(grade, day, [s], sessOccCells[idx]));
                bookSlots(grade, otherDay, [o1], oc1);
                bookSlots(grade, otherDay, [o2], oc2);
              }
            }
          }
        }
      }
      if (anyMoved) break;

      // Strategy 4: Unblock teacher conflict at (grade, day, slot) by swapping a blocking [1]-block in another grade on the same day,
      // then pulling a tail [1]-block from another day OR same-day later tail (into `gap`)!
      for (const otherDay of DAYS_OF_WEEK) {
        if (anyMoved) break;
        const oAll = getGradeDaySlots(grade, otherDay, academicYear).filter(
          (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
        );
        const slotIdxOnDay = otherDay === day ? oAll.findIndex((s) => s.slotId === slot.slotId) : -1;
        for (let k = oAll.length - 1; k >= 0; k--) {
          if (anyMoved) break;
          if (otherDay === day && k <= slotIdxOnDay) continue;
          const src = oAll[k];
          const srcCell = grid[grade][otherDay][src.slotId];
          if (!srcCell || srcCell.isLocked || srcCell.subjectCode === 'PJ' || srcCell.subjectCode === 'PM/PAI') continue;

          // Only consider moving `src` if slots after `src` on `otherDay` are either all empty OR all in afternoon and shiftable 1 left!
          const afterInDay = oAll.slice(k + 1);
          const occupiedAfter = afterInDay.filter((s) => grid[grade][otherDay][s.slotId] !== null);
          const isTail = occupiedAfter.length === 0;
          const sameAfterSess = src.startMinutes >= 615 && occupiedAfter.length > 0;
          let contiguousAfter: SlotTimeInfo[] = [];
          if (sameAfterSess) {
            for (let r = k + 1; r < oAll.length; r++) {
              if (!grid[grade][otherDay][oAll[r].slotId]) break;
              contiguousAfter.push(oAll[r]);
            }
            if (
              contiguousAfter.length !== occupiedAfter.length ||
              contiguousAfter.some((s) => grid[grade][otherDay][s.slotId]?.isLocked || grid[grade][otherDay][s.slotId]?.subjectCode === 'PJ')
            ) {
              continue;
            }
          } else if (!isTail) {
            continue;
          }

          // Don't split a [2]/[3] block on `otherDay`
          const srcHasAdj =
            (k > 0 && grid[grade][otherDay][oAll[k - 1].slotId]?.subjectCode === srcCell.subjectCode) ||
            (k + 1 < oAll.length && grid[grade][otherDay][oAll[k + 1].slotId]?.subjectCode === srcCell.subjectCode);
          if (srcHasAdj) continue;

          // Check class-side rules on (grade, day, slot) and Y1 W4 rule + daily cap/over7 limit for `srcCell`
          if (isKP2027Year1 && grade === 1 && slot.slotId === 'W4') {
            const y1w4 = DAYS_OF_WEEK.filter((d) => d !== day)
              .map((d) => {
                const c = grid[1]?.[d]?.['W4'];
                return c ? { day: d, subjectCode: c.subjectCode, teacherId: c.teacherCode } : null;
              })
              .filter(Boolean) as Array<{ day: string; subjectCode: string; teacherId: string }>;
            if (!canAssignYear1Period4(1, 4, srcCell.subjectCode, srcCell.teacherCode, y1w4, false)) continue;
          }

          const toInfo4 = getGradeDayRegularInfo(grade, day, srcCell.subjectCode, new Set([slot.slotId]));
          const toPos4 = toInfo4.regularSlots.findIndex((rs) => rs.slotId === slot.slotId);
          const maxSub4 = getMaxSubjectsPerDay(grade) + (grade <= 3 ? 1 : 0);
          if (
            !canAddSubjectToClassDay(toInfo4.lessonsList, srcCell.subjectCode, 1, grade, {
              maxSubjectsOverride: maxSub4,
              existingPeriodPositions: toInfo4.existingPositions,
              candidatePeriodPositions: [toPos4],
            })
          ) {
            continue;
          }

          const srcTeachers = srcCell.teacherCode.split('/').map((t) => t.trim()).filter(Boolean);
          if (srcTeachers.length !== 1) continue;
          const srcT = srcTeachers[0];

          // Find exact clock conflict for `srcT` in another grade on `day` overlapping `slot`
          const conflicts: Array<{ otherG: number; conflictSlot: SlotTimeInfo; conflictCell: TimetableCell }> = [];
          for (let og = 1; og <= 6; og++) {
            if (og === grade) continue;
            const ogSlots = getGradeDaySlots(og, day, academicYear).filter(
              (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
            );
            for (const ogs of ogSlots) {
              const ogc = grid[og][day][ogs.slotId];
              if (!ogc || !ogc.teacherCode) continue;
              const oTs = ogc.teacherCode.split('/').map((t) => t.trim());
              if (!oTs.includes(srcT)) continue;
              if (Math.max(ogs.startMinutes, slot.startMinutes) < Math.min(ogs.endMinutes, slot.endMinutes)) {
                conflicts.push({ otherG: og, conflictSlot: ogs, conflictCell: ogc });
              }
            }
          }
          if (conflicts.length !== 1) continue;
          const { otherG, conflictSlot, conflictCell } = conflicts[0];
          if (conflictCell.isLocked || conflictCell.subjectCode === 'PJ' || conflictCell.subjectCode === 'PM/PAI') continue;
          if (isKP2027Year1 && otherG === 1 && conflictSlot.slotId === 'W4') continue;

          // Ensure conflictCell is a standalone [1]-block in otherG on `day`
          const ogRegSlots = getGradeDaySlots(otherG, day, academicYear).filter(
            (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
          );
          const cIdx = ogRegSlots.findIndex((s) => s.slotId === conflictSlot.slotId);
          const cHasAdj =
            (cIdx > 0 && grid[otherG][day][ogRegSlots[cIdx - 1].slotId]?.subjectCode === conflictCell.subjectCode) ||
            (cIdx >= 0 && cIdx + 1 < ogRegSlots.length && grid[otherG][day][ogRegSlots[cIdx + 1].slotId]?.subjectCode === conflictCell.subjectCode);
          if (cHasAdj) continue;

          // Try swapping conflictCell with another standalone [1]-block `partnerSlot` on `(otherG, day)`!
          for (let pIdx = 0; pIdx < ogRegSlots.length; pIdx++) {
            if (pIdx === cIdx) continue;
            const partnerSlot = ogRegSlots[pIdx];
            const partnerCell = grid[otherG][day][partnerSlot.slotId];
            if (!partnerCell || partnerCell.isLocked || partnerCell.subjectCode === 'PJ' || partnerCell.subjectCode === 'PM/PAI') continue;
            if (isKP2027Year1 && otherG === 1 && partnerSlot.slotId === 'W4') continue;
            if (partnerCell.subjectCode === conflictCell.subjectCode) continue;
            const pHasAdj =
              (pIdx > 0 && grid[otherG][day][ogRegSlots[pIdx - 1].slotId]?.subjectCode === partnerCell.subjectCode) ||
              (pIdx + 1 < ogRegSlots.length && grid[otherG][day][ogRegSlots[pIdx + 1].slotId]?.subjectCode === partnerCell.subjectCode);
            if (pHasAdj) continue;

            // Execute provisional swap in `otherG` on `day` (same day = 0 load change for both teachers; just check clock free)
            unbookSlots(otherG, day, [conflictSlot, partnerSlot]);
            const cOk = isSlotFreeForTeacher(conflictCell.teacherCode, day, [partnerSlot], conflictCell.subjectCode, otherG, {
              dailyCapOverride: 8,
              enforceBreaks: false,
              allowSingleDayOver7: true,
            });
            const pOk =
              cOk &&
              isSlotFreeForTeacher(partnerCell.teacherCode, day, [conflictSlot], partnerCell.subjectCode, otherG, {
                dailyCapOverride: 8,
                enforceBreaks: false,
                allowSingleDayOver7: true,
              });

            if (!cOk || !pOk) {
              bookSlots(otherG, day, [conflictSlot], conflictCell);
              bookSlots(otherG, day, [partnerSlot], partnerCell);
              continue;
            }
            bookSlots(otherG, day, [partnerSlot], conflictCell);
            bookSlots(otherG, day, [conflictSlot], partnerCell);

            // Now test moving `srcCell` from `(grade, otherDay, src)` to `(grade, day, slot)` (+ shifting `contiguousAfter` if needed)
            let canCompleteMove = canMove(srcCell, otherDay, src, day, slot, grade);
            if (canCompleteMove && sameAfterSess && contiguousAfter.length > 0) {
              const afterCells = contiguousAfter.map((s) => grid[grade][otherDay][s.slotId]!);
              const destAfter = [src, ...contiguousAfter.slice(0, -1)];
              unbookSlots(grade, otherDay, contiguousAfter);
              canCompleteMove = afterCells.every((ac, idx) =>
                isSlotFreeForTeacher(ac.teacherCode, otherDay, [destAfter[idx]], ac.subjectCode, grade, {
                  dailyCapOverride: 8,
                  enforceBreaks: false,
                  allowSingleDayOver7: true,
                })
              );
              contiguousAfter.forEach((s, idx) => bookSlots(grade, otherDay, [s], afterCells[idx]));
              if (canCompleteMove) {
                executeMove(grade, otherDay, src, day, slot);
                for (let idx = 0; idx < contiguousAfter.length; idx++) {
                  executeMove(grade, otherDay, contiguousAfter[idx], otherDay, destAfter[idx]);
                }
                anyMoved = true;
                break;
              }
            } else if (canCompleteMove && isTail) {
              executeMove(grade, otherDay, src, day, slot);
              anyMoved = true;
              break;
            }

            // Revert `otherG` swap if couldn't complete move
            unbookSlots(otherG, day, [conflictSlot, partnerSlot]);
            bookSlots(otherG, day, [conflictSlot], conflictCell);
            bookSlots(otherG, day, [partnerSlot], partnerCell);
          }
        }
      }
      if (anyMoved) break;

      // Strategy 5: Last-resort clean gap elimination (preserves 0 fragmentation & all daily caps!):
      // 5A: Detach the 3rd period of ANY [3]-period major language block on `otherDay` (at tail OR sliding subsequent same-session slots left by 1) into `gap`
      for (const otherDay of DAYS_OF_WEEK) {
        if (otherDay === day || anyMoved) continue;
        const oAll = getGradeDaySlots(grade, otherDay, academicYear).filter(
          (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
        );
        for (let rStart = 0; rStart + 2 < oAll.length && !anyMoved; rStart++) {
          const s0 = oAll[rStart];
          const s1 = oAll[rStart + 1];
          const s2 = oAll[rStart + 2];
          const c0 = grid[grade][otherDay][s0.slotId];
          const c1 = grid[grade][otherDay][s1.slotId];
          const c2 = grid[grade][otherDay][s2.slotId];
          if (
            !c0 ||
            !c1 ||
            !c2 ||
            c2.isLocked ||
            !isMajorLanguageSubject(c2.subjectCode) ||
            c0.subjectCode !== c2.subjectCode ||
            c1.subjectCode !== c2.subjectCode
          ) {
            continue;
          }
          // Check if slots after rStart+2 are all empty OR contiguous unlocked same-session blocks shiftable 1 slot left!
          const s2IsMorn = s2.endMinutes <= 585;
          const afterOcc: SlotTimeInfo[] = [];
          let validShiftChain = true;
          let seenEmptyAfter = false;
          for (let k = rStart + 3; k < oAll.length; k++) {
            const sk = oAll[k];
            const ck = grid[grade][otherDay][sk.slotId];
            if (!ck) {
              seenEmptyAfter = true;
              continue;
            }
            if (seenEmptyAfter || (sk.endMinutes <= 585) !== s2IsMorn || ck.isLocked || ck.subjectCode === 'PJ') {
              validShiftChain = false;
              break;
            }
            if (isKP2027Year1 && grade === 1 && (sk.slotId === 'W4' || oAll[k - 1].slotId === 'W4')) {
              validShiftChain = false;
              break;
            }
            afterOcc.push(sk);
          }
          if (!validShiftChain) continue;

          const y1w4Ok =
            !(isKP2027Year1 && grade === 1 && slot.slotId === 'W4') ||
            canAssignYear1Period4(
              1,
              4,
              c2.subjectCode,
              c2.teacherCode,
              DAYS_OF_WEEK.filter((d) => d !== day)
                .map((d) => {
                  const cw4 = grid[1]?.[d]?.['W4'];
                  return cw4 ? { day: d, subjectCode: cw4.subjectCode, teacherId: cw4.teacherCode } : null;
                })
                .filter(Boolean) as Array<{ day: string; subjectCode: string; teacherId: string }>,
              false
            );
          const maxSub5 = getMaxSubjectsPerDay(grade) + (grade <= 3 ? 1 : 0);
          const toInfo5 = getGradeDayRegularInfo(grade, day, c2.subjectCode, new Set([slot.slotId]));
          const toPos5 = toInfo5.regularSlots.findIndex((rs) => rs.slotId === slot.slotId);
          const subjOk = canAddSubjectToClassDay(toInfo5.lessonsList, c2.subjectCode, 1, grade, {
            maxSubjectsOverride: maxSub5,
            existingPeriodPositions: toInfo5.existingPositions,
            candidatePeriodPositions: [toPos5],
          });
          if (!y1w4Ok || !subjOk) continue;

          // Verify shifting `afterOcc` left by 1 slot on `otherDay` works
          const destShiftSlots = afterOcc.map((_, idx) => oAll[rStart + 2 + idx]);
          const afterCells = afterOcc.map((s) => grid[grade][otherDay][s.slotId]!);
          unbookSlots(grade, otherDay, [s2, ...afterOcc]);

          let shiftOk = true;
          for (let idx = 0; idx < afterOcc.length; idx++) {
            const ac = afterCells[idx];
            const ds = destShiftSlots[idx];
            if (
              !isSlotFreeForTeacher(ac.teacherCode, otherDay, [ds], ac.subjectCode, grade, {
                dailyCapOverride: 8,
                enforceBreaks: false,
                allowSingleDayOver7: true,
              })
            ) {
              shiftOk = false;
              break;
            }
            bookSlots(grade, otherDay, [ds], ac);
          }

          if (shiftOk) {
            const tList = c2.teacherCode.split('/').map((t) => t.trim()).filter(Boolean);
            const tFree = tList.every((t) => {
              const addedPkar = isKP2027Year1 && grade === 1 && slot.slotId === 'W4' ? 0.5 : 0;
              const newLoad = getEffectiveTeacherDayLoad(t, day) + 1 + addedPkar;
              if (newLoad > MAX_TEACHER_DAILY_PERIODS + 1e-6) return false;
              if (newLoad > 7.0 + 1e-6) {
                const weeklyT = teacherTotalWorkload.get(t) || 0;
                const maxOver7 = weeklyT <= 36 ? 1 : Math.min(5, Math.ceil(weeklyT - 35));
                const otherOver7 = DAYS_OF_WEEK.filter((d) => d !== day && getEffectiveTeacherDayLoad(t, d) > 7.0 + 1e-6).length;
                if (otherOver7 >= maxOver7) return false;
              }
              const intervals = teacherIntervals.get(t) || [];
              return !isTeacherBusyInTimeRange(intervals, day, slot.startMinutes, slot.endMinutes, c2.subjectCode);
            });

            if (tFree) {
              bookSlots(grade, day, [slot], c2);
              anyMoved = true;
              break;
            }
          }

          // Revert `otherDay` shift
          unbookSlots(grade, otherDay, destShiftSlots);
          bookSlots(grade, otherDay, [s2], c2);
          afterOcc.forEach((s, idx) => bookSlots(grade, otherDay, [s], afterCells[idx]));
        }
      }
      if (anyMoved) break;

      // 5B: Push a morning standalone [1]-block adjacent to `gap` onto an empty trailing slot of another day, then promote an afternoon [2]-block into [prev, gap]!
      if (session === 'morning' && sIdx >= 1) {
        const prevSlot = mSlots[sIdx - 1];
        const prevCell = grid[grade][day][prevSlot.slotId];
        if (prevCell && !prevCell.isLocked && prevCell.subjectCode !== 'PJ' && prevCell.subjectCode !== 'PM/PAI') {
          const mPrevAdj = sIdx - 2 >= 0 && grid[grade][day][mSlots[sIdx - 2].slotId]?.subjectCode === prevCell.subjectCode;
          if (!mPrevAdj && sIdx === mSlots.length - 1) {
            for (const otherDay of DAYS_OF_WEEK) {
              if (otherDay === day || anyMoved) continue;
              const oSlots = getGradeDaySlots(grade, otherDay, academicYear).filter(
                (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
              );
              let lastOccIdxO = -1;
              for (let oi = oSlots.length - 1; oi >= 0; oi--) {
                if (grid[grade][otherDay][oSlots[oi].slotId] !== null) {
                  lastOccIdxO = oi;
                  break;
                }
              }
              if (lastOccIdxO < 0 || lastOccIdxO + 1 >= oSlots.length) continue;
              const oLastEmpty = oSlots[lastOccIdxO + 1];
              if (!canMove(prevCell, day, prevSlot, otherDay, oLastEmpty, grade)) continue;

              // Temporarily move prevCell -> oLastEmpty, leaving [prevSlot, slot] = 2 contiguous empty morning slots!
              executeMove(grade, day, prevSlot, otherDay, oLastEmpty);

              // Find an afternoon [2]-block on `day` to promote into [prevSlot, slot] + compact afternoon left
              const aUnlocked: Array<{ slots: SlotTimeInfo[]; cells: TimetableCell[] }> = [];
              let ai = 0;
              while (ai < aSlots.length) {
                const ac = grid[grade][day][aSlots[ai].slotId];
                if (!ac) { ai++; continue; }
                const rs: SlotTimeInfo[] = [aSlots[ai]];
                const rc: TimetableCell[] = [ac];
                while (ai + 1 < aSlots.length) {
                  const nc = grid[grade][day][aSlots[ai + 1].slotId];
                  if (!nc || nc.subjectCode !== ac.subjectCode || nc.isLocked) break;
                  rs.push(aSlots[ai + 1]);
                  rc.push(nc);
                  ai++;
                }
                aUnlocked.push({ slots: rs, cells: rc });
                ai++;
              }

              for (let rIdx = 0; rIdx < aUnlocked.length && !anyMoved; rIdx++) {
                const ar = aUnlocked[rIdx];
                if (ar.slots.length !== 2 || ar.cells.some((c) => c.isLocked)) continue;
                if (
                  isKP2027Year1 &&
                  grade === 1 &&
                  slot.slotId === 'W4' &&
                  !canAssignYear1Period4(
                    1,
                    4,
                    ar.cells[0].subjectCode,
                    ar.cells[0].teacherCode,
                    DAYS_OF_WEEK.filter((d) => d !== day)
                      .map((d) => {
                        const c = grid[1]?.[d]?.['W4'];
                        return c ? { day: d, subjectCode: c.subjectCode, teacherId: c.teacherCode } : null;
                      })
                      .filter(Boolean) as Array<{ day: string; subjectCode: string; teacherId: string }>,
                    false
                  )
                ) {
                  continue;
                }
                const remRuns = aUnlocked.filter((_, idx) => idx !== rIdx);
                const remSlots = remRuns.flatMap((r) => r.slots);
                const remCells = remRuns.flatMap((r) => r.cells);
                unbookSlots(grade, day, [...ar.slots, ...remSlots]);

                const arFitsMorn = isSlotFreeForTeacher(ar.cells[0].teacherCode, day, [prevSlot, slot], ar.cells[0].subjectCode, grade, {
                  dailyCapOverride: 8,
                  enforceBreaks: false,
                  allowSingleDayOver7: true,
                });
                if (arFitsMorn) {
                  [prevSlot, slot].forEach((ds, idx) => bookSlots(grade, day, [ds], ar.cells[idx]));
                  let off = 0;
                  let remOk = true;
                  const packedSlots: SlotTimeInfo[] = [];
                  for (const rr of remRuns) {
                    const dss = aSlots.slice(off, off + rr.cells.length);
                    if (
                      dss.length !== rr.cells.length ||
                      !isSlotFreeForTeacher(rr.cells[0].teacherCode, day, dss, rr.cells[0].subjectCode, grade, {
                        dailyCapOverride: 8,
                        enforceBreaks: false,
                        allowSingleDayOver7: true,
                      })
                    ) {
                      remOk = false;
                      break;
                    }
                    dss.forEach((ds, idx) => {
                      bookSlots(grade, day, [ds], rr.cells[idx]);
                      packedSlots.push(ds);
                    });
                    off += rr.cells.length;
                  }
                  if (remOk) {
                    anyMoved = true;
                    break;
                  }
                  unbookSlots(grade, day, [prevSlot, slot, ...packedSlots]);
                }
                ar.slots.forEach((s, idx) => bookSlots(grade, day, [s], ar.cells[idx]));
                remSlots.forEach((s, idx) => bookSlots(grade, day, [s], remCells[idx]));
              }

              if (!anyMoved) {
                executeMove(grade, otherDay, oLastEmpty, day, prevSlot);
              }
            }
          }

          // 5C: Swap an afternoon [2]-block on `day` with an `otherDay` [2]-block `ob`, promote `ob` into [prevSlot, slot] (e.g. brings AM/PM or free teacher onto Y1 SELASA W4 or T2/T3 ISNIN W4-5!), and pack prevCell cleanly into afternoon!
          if (!anyMoved && !mPrevAdj && sIdx === mSlots.length - 1) {
            const aRuns5C: Array<{ slots: SlotTimeInfo[]; cells: TimetableCell[]; subjectCode: string; teacherCode: string }> = [];
            let ai = 0;
            while (ai < aSlots.length) {
              const ac = grid[grade][day][aSlots[ai].slotId];
              if (!ac) { ai++; continue; }
              const rs: SlotTimeInfo[] = [aSlots[ai]];
              const rc: TimetableCell[] = [ac];
              while (ai + 1 < aSlots.length) {
                const nc = grid[grade][day][aSlots[ai + 1].slotId];
                if (!nc || nc.subjectCode !== ac.subjectCode || nc.isLocked) break;
                rs.push(aSlots[ai + 1]);
                rc.push(nc);
                ai++;
              }
              aRuns5C.push({ slots: rs, cells: rc, subjectCode: ac.subjectCode, teacherCode: ac.teacherCode });
              ai++;
            }

            if (!aRuns5C.some((r) => r.cells.some((c) => c.isLocked)) && aRuns5C.length <= 4) {
              const allASlots = aRuns5C.flatMap((r) => r.slots);
              const allACells = aRuns5C.flatMap((r) => r.cells);
              const y1w4Other =
                isKP2027Year1 && grade === 1
                  ? (DAYS_OF_WEEK.filter((d) => d !== day)
                      .map((d) => {
                        const c = grid[1]?.[d]?.['W4'];
                        return c ? { day: d, subjectCode: c.subjectCode, teacherId: c.teacherCode } : null;
                      })
                      .filter(Boolean) as Array<{ day: string; subjectCode: string; teacherId: string }>)
                  : [];

              for (let rIdx = 0; rIdx < aRuns5C.length && !anyMoved; rIdx++) {
                const ar = aRuns5C[rIdx];
                if (ar.slots.length !== 2 || ar.subjectCode === 'PM/PAI') continue;

                for (const otherDay of DAYS_OF_WEEK) {
                  if (otherDay === day || anyMoved) continue;
                  const oReg = getGradeDaySlots(grade, otherDay, academicYear).filter(
                    (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
                  );
                  for (let oIdx = 0; oIdx < oReg.length - 1 && !anyMoved; oIdx++) {
                    const o1 = oReg[oIdx];
                    const o2 = oReg[oIdx + 1];
                    if (o1.endMinutes <= 585 && o2.startMinutes >= 615) continue;
                    const oc1 = grid[grade][otherDay][o1.slotId];
                    const oc2 = grid[grade][otherDay][o2.slotId];
                    if (!oc1 || !oc2 || oc1.isLocked || oc2.isLocked || oc1.subjectCode !== oc2.subjectCode || oc1.subjectCode === 'PM/PAI' || oc1.subjectCode === ar.subjectCode) continue;
                    if (oIdx > 0 && grid[grade][otherDay][oReg[oIdx - 1].slotId]?.subjectCode === oc1.subjectCode) continue;
                    if (oIdx + 2 < oReg.length && grid[grade][otherDay][oReg[oIdx + 2].slotId]?.subjectCode === oc1.subjectCode) continue;
                    if (isKP2027Year1 && grade === 1 && (o1.slotId === 'W4' || o2.slotId === 'W4')) continue;
                    if (
                      isKP2027Year1 &&
                      grade === 1 &&
                      slot.slotId === 'W4' &&
                      !canAssignYear1Period4(1, 4, oc1.subjectCode, oc1.teacherCode, y1w4Other, false)
                    ) {
                      continue;
                    }

                    unbookSlots(grade, day, [prevSlot, ...allASlots]);
                    unbookSlots(grade, otherDay, [o1, o2]);

                    const maxSubO = Math.max(getMaxSubjectsPerDay(grade), getGradeDayRegularInfo(grade, otherDay, ar.subjectCode).distinctCount);
                    const infoO = getGradeDayRegularInfo(grade, otherDay, ar.subjectCode);
                    const posO = [o1, o2].map((sg) => infoO.regularSlots.findIndex((rs) => rs.slotId === sg.slotId));
                    const okIntoO =
                      canAddSubjectToClassDay(infoO.lessonsList, ar.subjectCode, 2, grade, {
                        maxSubjectsOverride: maxSubO,
                        existingPeriodPositions: infoO.existingPositions,
                        candidatePeriodPositions: posO,
                      }) &&
                      isSlotFreeForTeacher(ar.teacherCode, otherDay, [o1, o2], ar.subjectCode, grade, {
                        dailyCapOverride: 8,
                        enforceBreaks: false,
                        allowSingleDayOver7: true,
                      });

                    const maxSubD = Math.max(getMaxSubjectsPerDay(grade), getGradeDayRegularInfo(grade, day, oc1.subjectCode).distinctCount);
                    const infoD = getGradeDayRegularInfo(grade, day, oc1.subjectCode);
                    const posD = [prevSlot, slot].map((sg) => infoD.regularSlots.findIndex((rs) => rs.slotId === sg.slotId));
                    const okIntoMorn =
                      okIntoO &&
                      canAddSubjectToClassDay(infoD.lessonsList, oc1.subjectCode, 2, grade, {
                        maxSubjectsOverride: maxSubD,
                        existingPeriodPositions: infoD.existingPositions,
                        candidatePeriodPositions: posD,
                      }) &&
                      isSlotFreeForTeacher(oc1.teacherCode, day, [prevSlot, slot], oc1.subjectCode, grade, {
                        dailyCapOverride: 8,
                        enforceBreaks: false,
                        allowSingleDayOver7: true,
                      });

                    if (okIntoO && okIntoMorn) {
                      bookSlots(grade, otherDay, [o1], ar.cells[0]);
                      bookSlots(grade, otherDay, [o2], ar.cells[1]);
                      bookSlots(grade, day, [prevSlot], oc1);
                      bookSlots(grade, day, [slot], oc2);

                      const remRuns = aRuns5C
                        .filter((_, idx) => idx !== rIdx)
                        .map((r) => ({ ...r, cells: [...r.cells] }));
                      const mergeTgt = remRuns.find(
                        (r) =>
                          r.subjectCode === prevCell.subjectCode &&
                          r.cells.length + 1 <= Math.min(2, getMaxDailyPeriodsForSubject(prevCell.subjectCode))
                      );
                      if (mergeTgt) {
                        mergeTgt.cells.push(prevCell);
                      } else {
                        remRuns.push({ slots: [], cells: [prevCell], subjectCode: prevCell.subjectCode, teacherCode: prevCell.teacherCode });
                      }

                      const tryPack5C = (usedMask: number, offset: number, prevSub?: string): boolean => {
                        if (usedMask === (1 << remRuns.length) - 1) return true;
                        for (let ri = 0; ri < remRuns.length; ri++) {
                          if (usedMask & (1 << ri)) continue;
                          const run = remRuns[ri];
                          if (prevSub && prevSub === run.subjectCode) continue;
                          const ds = aSlots.slice(offset, offset + run.cells.length);
                          if (ds.length !== run.cells.length) continue;
                          if (
                            isSlotFreeForTeacher(run.teacherCode, day, ds, run.subjectCode, grade, {
                              dailyCapOverride: 8,
                              enforceBreaks: false,
                              allowSingleDayOver7: true,
                            })
                          ) {
                            ds.forEach((dslot, idx) => bookSlots(grade, day, [dslot], run.cells[idx]));
                            if (tryPack5C(usedMask | (1 << ri), offset + run.cells.length, run.subjectCode)) return true;
                            unbookSlots(grade, day, ds);
                          }
                        }
                        return false;
                      };

                      if (remRuns.length <= 4 && tryPack5C(0, 0)) {
                        anyMoved = true;
                        break;
                      }
                      unbookSlots(grade, otherDay, [o1, o2]);
                      unbookSlots(grade, day, [prevSlot, slot]);
                    }

                    bookSlots(grade, day, [prevSlot], prevCell);
                    allASlots.forEach((s, idx) => bookSlots(grade, day, [s], allACells[idx]));
                    bookSlots(grade, otherDay, [o1], oc1);
                    bookSlots(grade, otherDay, [o2], oc2);
                  }
                }
              }
            }
          }
        }
      }
      // 5D: Pre-PJ W1 empty slot repair — swaps a standalone [1]-block from another day into W1 and places a standalone unlocked [1]-block from `day` into its vacated slot!
      if (!anyMoved && session === 'morning' && sIdx === 0) {
        const dayAll = getGradeDaySlots(grade, day, academicYear).filter(
          (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
        );
        const daySingles: Array<{ slot: SlotTimeInfo; cell: TimetableCell }> = [];
        for (let di = 1; di < dayAll.length; di++) {
          const ds = dayAll[di];
          const dc = grid[grade][day][ds.slotId];
          if (!dc || dc.isLocked || dc.subjectCode === 'PJ' || dc.subjectCode === 'PM/PAI') continue;
          if (isKP2027Year1 && grade === 1 && ds.slotId === 'W4') continue;
          const adj =
            (di > 0 && grid[grade][day][dayAll[di - 1].slotId]?.subjectCode === dc.subjectCode) ||
            (di + 1 < dayAll.length && grid[grade][day][dayAll[di + 1].slotId]?.subjectCode === dc.subjectCode);
          if (!adj) {
            daySingles.push({ slot: ds, cell: dc });
          }
        }

        const maxSub5D = getMaxSubjectsPerDay(grade) + (grade <= 3 ? 1 : 0);
        for (const otherDay of DAYS_OF_WEEK) {
          if (otherDay === day || anyMoved) continue;
          const oAll = getGradeDaySlots(grade, otherDay, academicYear).filter(
            (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
          );
          for (let oi = 0; oi < oAll.length && !anyMoved; oi++) {
            const oSlot = oAll[oi];
            const oCell = grid[grade][otherDay][oSlot.slotId];
            if (!oCell || oCell.isLocked || oCell.subjectCode === 'PJ' || oCell.subjectCode === 'PM/PAI') continue;
            if (isKP2027Year1 && grade === 1 && oSlot.slotId === 'W4') continue;
            const oAdj =
              (oi > 0 && grid[grade][otherDay][oAll[oi - 1].slotId]?.subjectCode === oCell.subjectCode) ||
              (oi + 1 < oAll.length && grid[grade][otherDay][oAll[oi + 1].slotId]?.subjectCode === oCell.subjectCode);
            if (oAdj) continue;

            for (const mItem of daySingles) {
              if (mItem.cell.subjectCode === oCell.subjectCode) continue;
              unbookSlots(grade, day, [mItem.slot]);
              unbookSlots(grade, otherDay, [oSlot]);

              const infoDay = getGradeDayRegularInfo(grade, day, oCell.subjectCode);
              const posDay = infoDay.regularSlots.findIndex((rs) => rs.slotId === slot.slotId);
              const okSubDay = canAddSubjectToClassDay(infoDay.lessonsList, oCell.subjectCode, 1, grade, {
                maxSubjectsOverride: Math.max(maxSub5D, infoDay.distinctCount),
                existingPeriodPositions: infoDay.existingPositions,
                candidatePeriodPositions: [posDay],
              });

              const infoOther = getGradeDayRegularInfo(grade, otherDay, mItem.cell.subjectCode);
              const posOther = infoOther.regularSlots.findIndex((rs) => rs.slotId === oSlot.slotId);
              const okSubOther = canAddSubjectToClassDay(infoOther.lessonsList, mItem.cell.subjectCode, 1, grade, {
                maxSubjectsOverride: Math.max(maxSub5D, infoOther.distinctCount),
                existingPeriodPositions: infoOther.existingPositions,
                candidatePeriodPositions: [posOther],
              });

              const okT1 =
                okSubDay &&
                okSubOther &&
                isSlotFreeForTeacher(oCell.teacherCode, day, [slot], oCell.subjectCode, grade, {
                  dailyCapOverride: 8,
                  enforceBreaks: false,
                  allowSingleDayOver7: true,
                });
              const okT2 =
                okT1 &&
                isSlotFreeForTeacher(mItem.cell.teacherCode, otherDay, [oSlot], mItem.cell.subjectCode, grade, {
                  dailyCapOverride: 8,
                  enforceBreaks: false,
                  allowSingleDayOver7: true,
                });

              if (okT1 && okT2) {
                bookSlots(grade, day, [slot], oCell);
                bookSlots(grade, otherDay, [oSlot], mItem.cell);
                anyMoved = true;
                break;
              }

              bookSlots(grade, day, [mItem.slot], mItem.cell);
              bookSlots(grade, otherDay, [oSlot], oCell);
            }
          }
        }
      }
      if (anyMoved) break;

      // 5E: Morning run shift-right into trailing morning gap (W4/W5), freeing `mRunStart` to pull a [1]-block from `otherDay` or afternoon!
      if (!anyMoved && session === 'morning' && sIdx === mSlots.length - 1 && sIdx >= 1) {
        const prevCell = grid[grade][day][mSlots[sIdx - 1].slotId];
        if (prevCell && !prevCell.isLocked && prevCell.subjectCode !== 'PJ' && prevCell.subjectCode !== 'PM/PAI') {
          let mStart = sIdx - 1;
          while (mStart - 1 >= 0) {
            const pc = grid[grade][day][mSlots[mStart - 1].slotId];
            if (!pc || pc.isLocked || pc.subjectCode !== prevCell.subjectCode) break;
            mStart--;
          }
          const mRunSlots = mSlots.slice(mStart, sIdx);
          const mRunDest = mSlots.slice(mStart + 1, sIdx + 1);
          const mRunCells = mRunSlots.map((s) => grid[grade][day][s.slotId]!);
          const vacatedFrontSlot = mSlots[mStart];
          const y1w4ShiftOk =
            !(isKP2027Year1 && grade === 1 && slot.slotId === 'W4') ||
            canAssignYear1Period4(
              1,
              4,
              prevCell.subjectCode,
              prevCell.teacherCode,
              DAYS_OF_WEEK.filter((d) => d !== day)
                .map((d) => {
                  const c = grid[1]?.[d]?.['W4'];
                  return c ? { day: d, subjectCode: c.subjectCode, teacherId: c.teacherCode } : null;
                })
                .filter(Boolean) as Array<{ day: string; subjectCode: string; teacherId: string }>,
              false
            );

          if (y1w4ShiftOk && mRunSlots.length >= 1 && mRunSlots.length <= 2) {
            unbookSlots(grade, day, mRunSlots);
            const destFitsShift = isSlotFreeForTeacher(prevCell.teacherCode, day, mRunDest, prevCell.subjectCode, grade, {
              dailyCapOverride: 8,
              enforceBreaks: false,
              allowSingleDayOver7: true,
            });
            if (destFitsShift) {
              mRunDest.forEach((ds, idx) => bookSlots(grade, day, [ds], mRunCells[idx]));

              // Try (a) pulling any tail [1]-block from otherDay into `vacatedFrontSlot`
              for (const otherDay of DAYS_OF_WEEK) {
                if (otherDay === day || anyMoved) continue;
                const oAll = getGradeDaySlots(grade, otherDay, academicYear).filter(
                  (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
                );
                let lastIdxO = oAll.length - 1;
                while (lastIdxO >= 0 && grid[grade][otherDay][oAll[lastIdxO].slotId] === null) lastIdxO--;
                if (lastIdxO >= 0) {
                  const oTailSlot = oAll[lastIdxO];
                  const oTailCell = grid[grade][otherDay][oTailSlot.slotId]!;
                  if (!oTailCell.isLocked && canMove(oTailCell, otherDay, oTailSlot, day, vacatedFrontSlot, grade)) {
                    executeMove(grade, otherDay, oTailSlot, day, vacatedFrontSlot);
                    anyMoved = true;
                    break;
                  }
                }
              }

              // Try (b) pulling any standalone [1]-block from same-day afternoon (shifting later afternoon blocks left)
              if (!anyMoved) {
                for (let ai = 0; ai < aSlots.length && !anyMoved; ai++) {
                  const aS = aSlots[ai];
                  const aC = grid[grade][day][aS.slotId];
                  if (!aC || aC.isLocked || aC.subjectCode === 'PJ' || aC.subjectCode === 'PM/PAI') continue;
                  const aAdj =
                    (ai > 0 && grid[grade][day][aSlots[ai - 1].slotId]?.subjectCode === aC.subjectCode) ||
                    (ai + 1 < aSlots.length && grid[grade][day][aSlots[ai + 1].slotId]?.subjectCode === aC.subjectCode);
                  if (aAdj) continue;
                  const restAfterSlots: SlotTimeInfo[] = [];
                  for (let ri = ai + 1; ri < aSlots.length; ri++) {
                    const rc = grid[grade][day][aSlots[ri].slotId];
                    if (rc) restAfterSlots.push(aSlots[ri]);
                    else break;
                  }
                  const hasNonContig = aSlots.slice(ai + 1 + restAfterSlots.length).some((s) => grid[grade][day][s.slotId] !== null);
                  if (hasNonContig || restAfterSlots.some((s) => grid[grade][day][s.slotId]?.isLocked)) continue;

                  if (!canMove(aC, day, aS, day, vacatedFrontSlot, grade)) continue;
                  const restCells = restAfterSlots.map((s) => grid[grade][day][s.slotId]!);
                  const destRest = restAfterSlots.map((_, idx) => aSlots[ai + idx]);
                  unbookSlots(grade, day, restAfterSlots);
                  const restOk = restCells.every((rc, idx) =>
                    isSlotFreeForTeacher(rc.teacherCode, day, [destRest[idx]], rc.subjectCode, grade, {
                      dailyCapOverride: 8,
                      enforceBreaks: false,
                      allowSingleDayOver7: true,
                    })
                  );
                  if (restOk) {
                    executeMove(grade, day, aS, day, vacatedFrontSlot);
                    destRest.forEach((ds, idx) => bookSlots(grade, day, [ds], restCells[idx]));
                    anyMoved = true;
                    break;
                  }
                  restAfterSlots.forEach((s, idx) => bookSlots(grade, day, [s], restCells[idx]));
                }
              }

              // Try (c) detaching 1 period of a same-day afternoon [3]-period major language block (preserving intact [2]) into `vacatedFrontSlot`, shifting later afternoon slots 1 left
              if (!anyMoved && vacatedFrontSlot.slotId !== 'W4') {
                for (let ai = 0; ai + 2 < aSlots.length && !anyMoved; ai++) {
                  const s0 = aSlots[ai];
                  const s1 = aSlots[ai + 1];
                  const s2 = aSlots[ai + 2];
                  const c0 = grid[grade][day][s0.slotId];
                  const c1 = grid[grade][day][s1.slotId];
                  const c2 = grid[grade][day][s2.slotId];
                  if (
                    !c0 ||
                    !c1 ||
                    !c2 ||
                    c0.isLocked ||
                    c1.isLocked ||
                    c2.isLocked ||
                    !isMajorLanguageSubject(c0.subjectCode) ||
                    c1.subjectCode !== c0.subjectCode ||
                    c2.subjectCode !== c0.subjectCode
                  ) {
                    continue;
                  }

                  for (const detachIdx of [ai + 2, ai]) {
                    if (anyMoved) break;
                    const dSlot = aSlots[detachIdx];
                    const dCell = grid[grade][day][dSlot.slotId]!;
                    const restAfterSlots: SlotTimeInfo[] = [];
                    for (let ri = detachIdx + 1; ri < aSlots.length; ri++) {
                      const rc = grid[grade][day][aSlots[ri].slotId];
                      if (rc) restAfterSlots.push(aSlots[ri]);
                      else break;
                    }
                    const hasNonContig = aSlots
                      .slice(detachIdx + 1 + restAfterSlots.length)
                      .some((s) => grid[grade][day][s.slotId] !== null);
                    if (
                      hasNonContig ||
                      restAfterSlots.some((s) => {
                        const rc = grid[grade][day][s.slotId];
                        return rc?.isLocked || rc?.subjectCode === 'PJ';
                      })
                    ) {
                      continue;
                    }

                    const restCells = restAfterSlots.map((s) => grid[grade][day][s.slotId]!);
                    const destRest = restAfterSlots.map((_, idx) => aSlots[detachIdx + idx]);
                    unbookSlots(grade, day, [dSlot, ...restAfterSlots]);

                    const tryComplete5EC = (): boolean => {
                      const dFitsFront = isSlotFreeForTeacher(
                        dCell.teacherCode,
                        day,
                        [vacatedFrontSlot],
                        dCell.subjectCode,
                        grade,
                        { dailyCapOverride: 8, enforceBreaks: false, allowSingleDayOver7: true }
                      );
                      if (!dFitsFront) return false;
                      bookSlots(grade, day, [vacatedFrontSlot], dCell);
                      const bookedShift: SlotTimeInfo[] = [];
                      let shiftOk = true;
                      for (let rIdx = 0; rIdx < restCells.length; rIdx++) {
                        const rc = restCells[rIdx];
                        const ds = destRest[rIdx];
                        if (
                          !isSlotFreeForTeacher(rc.teacherCode, day, [ds], rc.subjectCode, grade, {
                            dailyCapOverride: 8,
                            enforceBreaks: false,
                            allowSingleDayOver7: true,
                          })
                        ) {
                          shiftOk = false;
                          break;
                        }
                        bookSlots(grade, day, [ds], rc);
                        bookedShift.push(ds);
                      }
                      if (shiftOk) return true;
                      unbookSlots(grade, day, [vacatedFrontSlot, ...bookedShift]);
                      return false;
                    };

                    let placedAll = tryComplete5EC();
                    if (!placedAll && dCell.teacherCode) {
                      // Check if `dCell` had a single cross-grade standalone unlocked [1]-block conflict on `day` at `vacatedFrontSlot`
                      const dTeachers = dCell.teacherCode.split('/').map((t) => t.trim()).filter(Boolean);
                      const confList: Array<{ otherG: number; cSlot: SlotTimeInfo; cCell: TimetableCell }> = [];
                      for (let og = 1; og <= 6; og++) {
                        if (og === grade) continue;
                        const ogAll = getGradeDaySlots(og, day, academicYear).filter(
                          (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
                        );
                        for (let oi = 0; oi < ogAll.length; oi++) {
                          const os = ogAll[oi];
                          if (!(os.startMinutes < vacatedFrontSlot.endMinutes && os.endMinutes > vacatedFrontSlot.startMinutes)) continue;
                          const oc = grid[og][day][os.slotId];
                          if (!oc) continue;
                          const oTs = oc.teacherCode.split('/').map((t) => t.trim()).filter(Boolean);
                          if (oTs.some((t) => dTeachers.includes(t))) {
                            confList.push({ otherG: og, cSlot: os, cCell: oc });
                          }
                        }
                      }

                      if (confList.length === 1) {
                        const { otherG, cSlot, cCell } = confList[0];
                        const ogAllDay = getGradeDaySlots(otherG, day, academicYear).filter(
                          (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
                        );
                        const ci = ogAllDay.findIndex((s) => s.slotId === cSlot.slotId);
                        const cAdj =
                          (ci > 0 && grid[otherG][day][ogAllDay[ci - 1].slotId]?.subjectCode === cCell.subjectCode) ||
                          (ci + 1 < ogAllDay.length && grid[otherG][day][ogAllDay[ci + 1].slotId]?.subjectCode === cCell.subjectCode);
                        if (
                          !cCell.isLocked &&
                          !cAdj &&
                          cCell.subjectCode !== 'PJ' &&
                          cCell.subjectCode !== 'PM/PAI' &&
                          !(isKP2027Year1 && otherG === 1 && cSlot.slotId === 'W4')
                        ) {
                          for (const oDay of DAYS_OF_WEEK) {
                            if (oDay === day || placedAll) continue;
                            const oAllO = getGradeDaySlots(otherG, oDay, academicYear).filter(
                              (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
                            );
                            for (let oi = 0; oi < oAllO.length && !placedAll; oi++) {
                              const os = oAllO[oi];
                              if (isKP2027Year1 && otherG === 1 && os.slotId === 'W4') continue;
                              const oc = grid[otherG][oDay][os.slotId];
                              if (!oc || oc.isLocked || oc.subjectCode === 'PJ' || oc.subjectCode === 'PM/PAI' || oc.subjectCode === cCell.subjectCode) continue;
                              const oAdj =
                                (oi > 0 && grid[otherG][oDay][oAllO[oi - 1].slotId]?.subjectCode === oc.subjectCode) ||
                                (oi + 1 < oAllO.length && grid[otherG][oDay][oAllO[oi + 1].slotId]?.subjectCode === oc.subjectCode);
                              if (oAdj) continue;

                              const infoDayO = getGradeDayRegularInfo(otherG, day, oc.subjectCode, new Set([cSlot.slotId]));
                              const posDayO = infoDayO.regularSlots.findIndex((rs) => rs.slotId === cSlot.slotId);
                              const okSubDayO = canAddSubjectToClassDay(infoDayO.lessonsList, oc.subjectCode, 1, otherG, {
                                maxSubjectsOverride: Math.max(getMaxSubjectsPerDay(otherG), infoDayO.distinctCount),
                                existingPeriodPositions: infoDayO.existingPositions,
                                candidatePeriodPositions: [posDayO],
                              });
                              const infoOtherO = getGradeDayRegularInfo(otherG, oDay, cCell.subjectCode, new Set([os.slotId]));
                              const posOtherO = infoOtherO.regularSlots.findIndex((rs) => rs.slotId === os.slotId);
                              const okSubOtherO = canAddSubjectToClassDay(infoOtherO.lessonsList, cCell.subjectCode, 1, otherG, {
                                maxSubjectsOverride: Math.max(getMaxSubjectsPerDay(otherG), infoOtherO.distinctCount),
                                existingPeriodPositions: infoOtherO.existingPositions,
                                candidatePeriodPositions: [posOtherO],
                              });
                              if (!okSubDayO || !okSubOtherO) continue;

                              unbookSlots(otherG, day, [cSlot]);
                              unbookSlots(otherG, oDay, [os]);
                              const okSwapOg =
                                isSlotFreeForTeacher(oc.teacherCode, day, [cSlot], oc.subjectCode, otherG, {
                                  dailyCapOverride: 8,
                                  enforceBreaks: false,
                                  allowSingleDayOver7: true,
                                }) &&
                                isSlotFreeForTeacher(cCell.teacherCode, oDay, [os], cCell.subjectCode, otherG, {
                                  dailyCapOverride: 8,
                                  enforceBreaks: false,
                                  allowSingleDayOver7: true,
                                });
                              if (okSwapOg) {
                                bookSlots(otherG, day, [cSlot], oc);
                                bookSlots(otherG, oDay, [os], cCell);
                                if (tryComplete5EC()) {
                                  placedAll = true;
                                  break;
                                }
                                unbookSlots(otherG, day, [cSlot]);
                                unbookSlots(otherG, oDay, [os]);
                              }
                              bookSlots(otherG, day, [cSlot], cCell);
                              bookSlots(otherG, oDay, [os], oc);
                            }
                          }
                        }
                      }
                    }

                    if (placedAll) {
                      anyMoved = true;
                    } else {
                      bookSlots(grade, day, [dSlot], dCell);
                      restAfterSlots.forEach((s, idx) => bookSlots(grade, day, [s], restCells[idx]));
                    }
                  }
                }
              }

              if (!anyMoved) {
                unbookSlots(grade, day, mRunDest);
                mRunSlots.forEach((s, idx) => bookSlots(grade, day, [s], mRunCells[idx]));
              }
            } else {
              mRunSlots.forEach((s, idx) => bookSlots(grade, day, [s], mRunCells[idx]));
            }
          }
        }
      }
      if (anyMoved) break;

      // 5F: Cross-day [2]-block swap when morning ends with [mRun(1), gap] -> brings an `otherDay` [2]-block cleanly into [mRun, gap], coalescing mRun into afternoon!
      if (!anyMoved && session === 'morning' && sIdx === mSlots.length - 1 && sIdx >= 1) {
        const mPrevSlot = mSlots[sIdx - 1];
        const mPrevCell = grid[grade][day][mPrevSlot.slotId];
        const mPrevAdj =
          sIdx - 2 >= 0 && grid[grade][day][mSlots[sIdx - 2].slotId]?.subjectCode === mPrevCell?.subjectCode;
        if (mPrevCell && !mPrevCell.isLocked && !mPrevAdj && mPrevCell.subjectCode !== 'PJ' && mPrevCell.subjectCode !== 'PM/PAI') {
          const aRuns5F: Array<{ slots: SlotTimeInfo[]; cells: TimetableCell[]; subjectCode: string; teacherCode: string }> = [];
          let ai = 0;
          while (ai < aSlots.length) {
            const ac = grid[grade][day][aSlots[ai].slotId];
            if (!ac) { ai++; continue; }
            const rs: SlotTimeInfo[] = [aSlots[ai]];
            const rc: TimetableCell[] = [ac];
            while (ai + 1 < aSlots.length) {
              const nc = grid[grade][day][aSlots[ai + 1].slotId];
              if (!nc || nc.subjectCode !== ac.subjectCode || nc.isLocked) break;
              rs.push(aSlots[ai + 1]);
              rc.push(nc);
              ai++;
            }
            aRuns5F.push({ slots: rs, cells: rc, subjectCode: ac.subjectCode, teacherCode: ac.teacherCode });
            ai++;
          }

          if (!aRuns5F.some((r) => r.cells.some((c) => c.isLocked)) && aRuns5F.length <= 4) {
            const allASlots = aRuns5F.flatMap((r) => r.slots);
            const allACells = aRuns5F.flatMap((r) => r.cells);
            const y1w4OtherD =
              isKP2027Year1 && grade === 1
                ? (DAYS_OF_WEEK.filter((d) => d !== day)
                    .map((d) => {
                      const c = grid[1]?.[d]?.['W4'];
                      return c ? { day: d, subjectCode: c.subjectCode, teacherId: c.teacherCode } : null;
                    })
                    .filter(Boolean) as Array<{ day: string; subjectCode: string; teacherId: string }>)
                : [];

            for (let rIdx = 0; rIdx < aRuns5F.length && !anyMoved; rIdx++) {
              const ar = aRuns5F[rIdx];
              if (ar.slots.length !== 2 || ar.subjectCode === 'PM/PAI') continue;

              for (const otherDay of DAYS_OF_WEEK) {
                if (otherDay === day || anyMoved) continue;
                const oReg = getGradeDaySlots(grade, otherDay, academicYear).filter(
                  (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
                );
                for (let oIdx = 0; oIdx < oReg.length - 1 && !anyMoved; oIdx++) {
                  const o1 = oReg[oIdx];
                  const o2 = oReg[oIdx + 1];
                  if (o1.endMinutes <= 585 && o2.startMinutes >= 615) continue;
                  const oc1 = grid[grade][otherDay][o1.slotId];
                  const oc2 = grid[grade][otherDay][o2.slotId];
                  if (!oc1 || !oc2 || oc1.isLocked || oc2.isLocked || oc1.subjectCode !== oc2.subjectCode || oc1.subjectCode === 'PM/PAI' || oc1.subjectCode === ar.subjectCode) continue;
                  if (oIdx > 0 && grid[grade][otherDay][oReg[oIdx - 1].slotId]?.subjectCode === oc1.subjectCode) continue;
                  if (oIdx + 2 < oReg.length && grid[grade][otherDay][oReg[oIdx + 2].slotId]?.subjectCode === oc1.subjectCode) continue;

                  // Allow swapping EVEN if [o1, o2] includes otherDay W4 (ar replaces otherDay W4 if valid, freeing ob for day W4!)
                  const oHasW4 = isKP2027Year1 && grade === 1 && (o1.slotId === 'W4' || o2.slotId === 'W4');
                  if (oHasW4) {
                    const y1w4ExclO = DAYS_OF_WEEK.filter((d) => d !== otherDay && d !== day)
                      .map((d) => {
                        const c = grid[1]?.[d]?.['W4'];
                        return c ? { day: d, subjectCode: c.subjectCode, teacherId: c.teacherCode } : null;
                      })
                      .filter(Boolean) as Array<{ day: string; subjectCode: string; teacherId: string }>;
                    if (!canAssignYear1Period4(1, 4, ar.subjectCode, ar.teacherCode, y1w4ExclO, false)) continue;
                  }
                  if (isKP2027Year1 && grade === 1 && slot.slotId === 'W4') {
                    const w4ForD = y1w4OtherD.map((item) =>
                      item.day === otherDay && oHasW4 ? { day: otherDay, subjectCode: ar.subjectCode, teacherId: ar.teacherCode } : item
                    );
                    if (!canAssignYear1Period4(1, 4, oc1.subjectCode, oc1.teacherCode, w4ForD, false)) continue;
                  }

                  unbookSlots(grade, day, [mPrevSlot, ...allASlots]);
                  unbookSlots(grade, otherDay, [o1, o2]);

                  const maxSubO = Math.max(getMaxSubjectsPerDay(grade), getGradeDayRegularInfo(grade, otherDay, ar.subjectCode).distinctCount);
                  const infoO = getGradeDayRegularInfo(grade, otherDay, ar.subjectCode);
                  const posO = [o1, o2].map((sg) => infoO.regularSlots.findIndex((rs) => rs.slotId === sg.slotId));
                  const okIntoO =
                    canAddSubjectToClassDay(infoO.lessonsList, ar.subjectCode, 2, grade, {
                      maxSubjectsOverride: maxSubO,
                      existingPeriodPositions: infoO.existingPositions,
                      candidatePeriodPositions: posO,
                    }) &&
                    isSlotFreeForTeacher(ar.teacherCode, otherDay, [o1, o2], ar.subjectCode, grade, {
                      dailyCapOverride: 8,
                      enforceBreaks: false,
                      allowSingleDayOver7: true,
                    });

                  const maxSubD = Math.max(getMaxSubjectsPerDay(grade), getGradeDayRegularInfo(grade, day, oc1.subjectCode).distinctCount);
                  const infoD = getGradeDayRegularInfo(grade, day, oc1.subjectCode);
                  const posD = [mPrevSlot, slot].map((sg) => infoD.regularSlots.findIndex((rs) => rs.slotId === sg.slotId));
                  const okIntoMorn =
                    okIntoO &&
                    canAddSubjectToClassDay(infoD.lessonsList, oc1.subjectCode, 2, grade, {
                      maxSubjectsOverride: maxSubD,
                      existingPeriodPositions: infoD.existingPositions,
                      candidatePeriodPositions: posD,
                    }) &&
                    isSlotFreeForTeacher(oc1.teacherCode, day, [mPrevSlot, slot], oc1.subjectCode, grade, {
                      dailyCapOverride: 8,
                      enforceBreaks: false,
                      allowSingleDayOver7: true,
                    });

                  if (okIntoO && okIntoMorn) {
                    bookSlots(grade, otherDay, [o1], ar.cells[0]);
                    bookSlots(grade, otherDay, [o2], ar.cells[1]);
                    bookSlots(grade, day, [mPrevSlot], oc1);
                    bookSlots(grade, day, [slot], oc2);

                    const remRuns = aRuns5F
                      .filter((_, idx) => idx !== rIdx)
                      .map((r) => ({ ...r, cells: [...r.cells] }));
                    const mergeTgt = remRuns.find(
                      (r) =>
                        r.subjectCode === mPrevCell.subjectCode &&
                        r.cells.length + 1 <= Math.min(2, getMaxDailyPeriodsForSubject(mPrevCell.subjectCode))
                    );
                    if (mergeTgt) {
                      mergeTgt.cells.push(mPrevCell);
                    } else {
                      remRuns.push({ slots: [], cells: [mPrevCell], subjectCode: mPrevCell.subjectCode, teacherCode: mPrevCell.teacherCode });
                    }

                    const tryPack5F = (usedMask: number, offset: number, prevSub?: string): boolean => {
                      if (usedMask === (1 << remRuns.length) - 1) return true;
                      for (let ri = 0; ri < remRuns.length; ri++) {
                        if (usedMask & (1 << ri)) continue;
                        const run = remRuns[ri];
                        if (prevSub && prevSub === run.subjectCode) continue;
                        const ds = aSlots.slice(offset, offset + run.cells.length);
                        if (ds.length !== run.cells.length) continue;
                        if (
                          isSlotFreeForTeacher(run.teacherCode, day, ds, run.subjectCode, grade, {
                            dailyCapOverride: 8,
                            enforceBreaks: false,
                            allowSingleDayOver7: true,
                          })
                        ) {
                          ds.forEach((dslot, idx) => bookSlots(grade, day, [dslot], run.cells[idx]));
                          if (tryPack5F(usedMask | (1 << ri), offset + run.cells.length, run.subjectCode)) return true;
                          unbookSlots(grade, day, ds);
                        }
                      }
                      return false;
                    };

                    if (remRuns.length <= 4 && tryPack5F(0, 0)) {
                      anyMoved = true;
                      break;
                    }
                    unbookSlots(grade, otherDay, [o1, o2]);
                    unbookSlots(grade, day, [mPrevSlot, slot]);
                  }

                  bookSlots(grade, day, [mPrevSlot], mPrevCell);
                  allASlots.forEach((s, idx) => bookSlots(grade, day, [s], allACells[idx]));
                  bookSlots(grade, otherDay, [o1], oc1);
                  bookSlots(grade, otherDay, [o2], oc2);
                }
              }
            }
          }
        }
      }
      if (anyMoved) break;

      // 5G: Year 1 W4 PKAR diversity deadlock breaker — provisionally swaps `otherDay W4` (intact [2] or [1], allowing PM/PAI) on `otherDay` to unlock a subject/teacher for `(grade=1, day, W4)`, then packs `day` or cross-day swaps cleanly with zero gaps!
      if (!anyMoved && isKP2027Year1 && grade === 1 && session === 'morning' && slot.slotId === 'W4') {
        for (const otherDay of DAYS_OF_WEEK) {
          if (otherDay === day || anyMoved) continue;
          const oReg = getGradeDaySlots(grade, otherDay, academicYear).filter(
            (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
          );
          const oW4Idx = oReg.findIndex((s) => s.slotId === 'W4');
          if (oW4Idx < 0) continue;
          const oW4Slot = oReg[oW4Idx];
          const oW4Cell = grid[grade][otherDay][oW4Slot.slotId];
          if (!oW4Cell || oW4Cell.isLocked || oW4Cell.subjectCode === 'PJ') continue;

          const oW3Slot = oW4Idx > 0 ? oReg[oW4Idx - 1] : null;
          const oW3Cell = oW3Slot ? grid[grade][otherDay][oW3Slot.slotId] : null;
          const oW2Cell = oW4Idx > 1 ? grid[grade][otherDay][oReg[oW4Idx - 2].slotId] : null;
          const isW4Double =
            !!oW3Slot &&
            !!oW3Cell &&
            !oW3Cell.isLocked &&
            oW3Cell.subjectCode === oW4Cell.subjectCode &&
            (!oW2Cell || oW2Cell.subjectCode !== oW4Cell.subjectCode || isMajorLanguageSubject(oW4Cell.subjectCode));
          const isW4Single = !oW3Cell || oW3Cell.subjectCode !== oW4Cell.subjectCode;

          const oSwapCandidates: Array<{ w4Slots: SlotTimeInfo[]; w4Cells: TimetableCell[]; altSlots: SlotTimeInfo[]; altCells: TimetableCell[] }> = [];
          if (isW4Double && oW3Slot && oW3Cell) {
            for (let ai = 0; ai < oReg.length - 1; ai++) {
              const a1 = oReg[ai];
              const a2 = oReg[ai + 1];
              if (a1.endMinutes <= 585 && a2.startMinutes >= 615) continue;
              if (a1.slotId === 'W4' || a2.slotId === 'W4' || a2.slotId === oW3Slot.slotId) continue;
              const ac1 = grid[grade][otherDay][a1.slotId];
              const ac2 = grid[grade][otherDay][a2.slotId];
              if (!ac1 || !ac2 || ac1.isLocked || ac2.isLocked || ac1.subjectCode !== ac2.subjectCode) continue;
              if (ac1.subjectCode === oW4Cell.subjectCode || ac1.subjectCode === 'PJ') continue;
              if (ai > 0 && grid[grade][otherDay][oReg[ai - 1].slotId]?.subjectCode === ac1.subjectCode) continue;
              if (ai + 2 < oReg.length && grid[grade][otherDay][oReg[ai + 2].slotId]?.subjectCode === ac1.subjectCode) continue;
              oSwapCandidates.push({
                w4Slots: [oW3Slot, oW4Slot],
                w4Cells: [oW3Cell, oW4Cell],
                altSlots: [a1, a2],
                altCells: [ac1, ac2],
              });
            }
          }
          if (isW4Single && oW4Cell.subjectCode !== 'PM/PAI') {
            for (let ai = 0; ai < oReg.length; ai++) {
              const a1 = oReg[ai];
              if (a1.slotId === 'W4') continue;
              const ac1 = grid[grade][otherDay][a1.slotId];
              if (!ac1 || ac1.isLocked || ac1.subjectCode === oW4Cell.subjectCode || ac1.subjectCode === 'PJ' || ac1.subjectCode === 'PM/PAI') continue;
              const aAdj =
                (ai > 0 && grid[grade][otherDay][oReg[ai - 1].slotId]?.subjectCode === ac1.subjectCode) ||
                (ai + 1 < oReg.length && grid[grade][otherDay][oReg[ai + 1].slotId]?.subjectCode === ac1.subjectCode);
              if (aAdj) continue;
              oSwapCandidates.push({
                w4Slots: [oW4Slot],
                w4Cells: [oW4Cell],
                altSlots: [a1],
                altCells: [ac1],
              });
            }
          }

          const y1w4ExclBoth = DAYS_OF_WEEK.filter((d) => d !== day && d !== otherDay)
            .map((d) => {
              const cw4 = grid[1]?.[d]?.['W4'];
              return cw4 ? { day: d, subjectCode: cw4.subjectCode, teacherId: cw4.teacherCode } : null;
            })
            .filter(Boolean) as Array<{ day: string; subjectCode: string; teacherId: string }>;

          for (const cand of oSwapCandidates) {
            if (anyMoved) break;
            if (!canAssignYear1Period4(1, 4, cand.altCells[0].subjectCode, cand.altCells[0].teacherCode, y1w4ExclBoth, false)) {
              continue;
            }
            unbookSlots(grade, otherDay, cand.w4Slots);
            unbookSlots(grade, otherDay, cand.altSlots);

            const okW4Swap =
              isSlotFreeForTeacher(cand.altCells[0].teacherCode, otherDay, cand.w4Slots, cand.altCells[0].subjectCode, grade, {
                dailyCapOverride: 8,
                enforceBreaks: false,
                allowSingleDayOver7: true,
              }) &&
              isSlotFreeForTeacher(cand.w4Cells[0].teacherCode, otherDay, cand.altSlots, cand.w4Cells[0].subjectCode, grade, {
                dailyCapOverride: 8,
                enforceBreaks: false,
                allowSingleDayOver7: true,
              });

            if (!okW4Swap) {
              cand.w4Slots.forEach((s, idx) => bookSlots(grade, otherDay, [s], cand.w4Cells[idx]));
              cand.altSlots.forEach((s, idx) => bookSlots(grade, otherDay, [s], cand.altCells[idx]));
              continue;
            }

            cand.w4Slots.forEach((s, idx) => bookSlots(grade, otherDay, [s], cand.altCells[idx]));
            cand.altSlots.forEach((s, idx) => bookSlots(grade, otherDay, [s], cand.w4Cells[idx]));

            const y1w4UpdatedForDay = DAYS_OF_WEEK.filter((d) => d !== day)
              .map((d) => {
                const cw4 = grid[1]?.[d]?.['W4'];
                return cw4 ? { day: d, subjectCode: cw4.subjectCode, teacherId: cw4.teacherCode } : null;
              })
              .filter(Boolean) as Array<{ day: string; subjectCode: string; teacherId: string }>;

            // Mechanism A: Intra-day re-pack of `day` (non-PJ unlocked slots cleanly packed into mSlots[flex] + aSlots[0..])
            const fixedM = new Set(
              mSlots
                .filter((s) => {
                  const c = grid[1][day][s.slotId];
                  return c !== null && (c.isLocked || c.subjectCode === 'PJ');
                })
                .map((s) => s.slotId)
            );
            const flexMSlots = mSlots.filter((s) => !fixedM.has(s.slotId));
            const flexASlots = aSlots.filter((s) => {
              const c = grid[1][day][s.slotId];
              return c === null || (!c.isLocked && c.subjectCode !== 'PJ');
            });

            if (!anyMoved && flexMSlots.length >= 1 && flexMSlots[flexMSlots.length - 1].slotId === 'W4') {
              const dayAll = [...mSlots, ...aSlots];
              const origFlexSlots: SlotTimeInfo[] = [];
              const origFlexCells: TimetableCell[] = [];
              const rawRuns: Array<{ cells: TimetableCell[]; subjectCode: string; teacherCode: string }> = [];
              let di = 0;
              while (di < dayAll.length) {
                const sc = grid[1][day][dayAll[di].slotId];
                if (!sc || sc.isLocked || sc.subjectCode === 'PJ') {
                  di++;
                  continue;
                }
                const runC: TimetableCell[] = [sc];
                const runS: SlotTimeInfo[] = [dayAll[di]];
                while (di + 1 < dayAll.length) {
                  const nSlot = dayAll[di + 1];
                  if (dayAll[di].endMinutes <= 585 && nSlot.startMinutes >= 615) break;
                  const nc = grid[1][day][nSlot.slotId];
                  if (!nc || nc.isLocked || nc.subjectCode !== sc.subjectCode) break;
                  runC.push(nc);
                  runS.push(nSlot);
                  di++;
                }
                origFlexSlots.push(...runS);
                origFlexCells.push(...runC);
                if (runC.length === 3) {
                  rawRuns.push({ cells: runC.slice(0, 2), subjectCode: sc.subjectCode, teacherCode: sc.teacherCode });
                  rawRuns.push({ cells: runC.slice(2, 3), subjectCode: sc.subjectCode, teacherCode: sc.teacherCode });
                } else {
                  rawRuns.push({ cells: runC, subjectCode: sc.subjectCode, teacherCode: sc.teacherCode });
                }
                di++;
              }

              const totalToPack = origFlexCells.length;
              const targetAfterLen = totalToPack - flexMSlots.length;
              if (
                rawRuns.length <= 6 &&
                targetAfterLen >= 0 &&
                targetAfterLen <= flexASlots.length &&
                !flexASlots.some((s) => {
                  const c = grid[1][day][s.slotId];
                  return c !== null && (c.isLocked || c.subjectCode === 'PJ');
                })
              ) {
                const destFlexSlots = [...flexMSlots, ...flexASlots.slice(0, targetAfterLen)];
                unbookSlots(1, day, origFlexSlots);

                const tryRepackDay = (usedMask: number, offset: number): boolean => {
                  if (usedMask === (1 << rawRuns.length) - 1) return true;
                  for (let ri = 0; ri < rawRuns.length; ri++) {
                    if (usedMask & (1 << ri)) continue;
                    const run = rawRuns[ri];
                    const ds = destFlexSlots.slice(offset, offset + run.cells.length);
                    if (ds.length !== run.cells.length) continue;
                    // Never split a [2]-block across recess!
                    const crossesRecess = ds.length === 2 && ds[0].endMinutes <= 585 && ds[1].startMinutes >= 615;
                    if (crossesRecess) continue;
                    if (
                      ds.some((s) => s.slotId === 'W4') &&
                      !canAssignYear1Period4(1, 4, run.subjectCode, run.teacherCode, y1w4UpdatedForDay, false)
                    ) {
                      continue;
                    }
                    if (
                      isSlotFreeForTeacher(run.teacherCode, day, ds, run.subjectCode, 1, {
                        dailyCapOverride: 8,
                        enforceBreaks: false,
                        allowSingleDayOver7: true,
                      })
                    ) {
                      ds.forEach((dslot, idx) => bookSlots(1, day, [dslot], run.cells[idx]));
                      if (tryRepackDay(usedMask | (1 << ri), offset + run.cells.length)) return true;
                      unbookSlots(1, day, ds);
                    }
                  }
                  return false;
                };

                if (tryRepackDay(0, 0)) {
                  anyMoved = true;
                } else {
                  origFlexSlots.forEach((s, idx) => bookSlots(1, day, [s], origFlexCells[idx]));
                }
              }
            }

            // Mechanism B: 5F cross-day [2]-block swap when morning ends with [mPrevSlot(1), W4] -> brings ob from thirdDay (preferring otherDay!) into [mPrevSlot, W4]
            if (!anyMoved && sIdx >= 1) {
              const mPrevSlot = mSlots[sIdx - 1];
              const mPrevCell = grid[1][day][mPrevSlot.slotId];
              const mPrevAdj =
                sIdx - 2 >= 0 && grid[1][day][mSlots[sIdx - 2].slotId]?.subjectCode === mPrevCell?.subjectCode;
              if (mPrevCell && !mPrevCell.isLocked && !mPrevAdj && mPrevCell.subjectCode !== 'PJ' && mPrevCell.subjectCode !== 'PM/PAI') {
                const aRuns5G: Array<{ slots: SlotTimeInfo[]; cells: TimetableCell[]; subjectCode: string; teacherCode: string }> = [];
                let ai = 0;
                while (ai < aSlots.length) {
                  const ac = grid[1][day][aSlots[ai].slotId];
                  if (!ac) { ai++; continue; }
                  const rs: SlotTimeInfo[] = [aSlots[ai]];
                  const rc: TimetableCell[] = [ac];
                  while (ai + 1 < aSlots.length) {
                    const nc = grid[1][day][aSlots[ai + 1].slotId];
                    if (!nc || nc.subjectCode !== ac.subjectCode || nc.isLocked) break;
                    rs.push(aSlots[ai + 1]);
                    rc.push(nc);
                    ai++;
                  }
                  aRuns5G.push({ slots: rs, cells: rc, subjectCode: ac.subjectCode, teacherCode: ac.teacherCode });
                  ai++;
                }

                if (!aRuns5G.some((r) => r.cells.some((c) => c.isLocked)) && aRuns5G.length <= 4) {
                  const allASlots = aRuns5G.flatMap((r) => r.slots);
                  const allACells = aRuns5G.flatMap((r) => r.cells);
                  const thirdDaysOrdered = [otherDay, ...DAYS_OF_WEEK.filter((d) => d !== day && d !== otherDay)];

                  for (let rIdx = 0; rIdx < aRuns5G.length && !anyMoved; rIdx++) {
                    const ar = aRuns5G[rIdx];
                    if (ar.slots.length !== 2 || ar.subjectCode === 'PM/PAI') continue;

                    for (const tDay of thirdDaysOrdered) {
                      if (anyMoved) break;
                      const tReg = getGradeDaySlots(1, tDay, academicYear).filter(
                        (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
                      );
                      for (let tIdx = 0; tIdx < tReg.length - 1 && !anyMoved; tIdx++) {
                        const o1 = tReg[tIdx];
                        const o2 = tReg[tIdx + 1];
                        if (o1.endMinutes <= 585 && o2.startMinutes >= 615) continue;
                        if (o1.slotId === 'W4' || o2.slotId === 'W4') continue;
                        const oc1 = grid[1][tDay][o1.slotId];
                        const oc2 = grid[1][tDay][o2.slotId];
                        if (!oc1 || !oc2 || oc1.isLocked || oc2.isLocked || oc1.subjectCode !== oc2.subjectCode || oc1.subjectCode === 'PM/PAI' || oc1.subjectCode === ar.subjectCode) continue;
                        if (tIdx > 0 && grid[1][tDay][tReg[tIdx - 1].slotId]?.subjectCode === oc1.subjectCode) continue;
                        if (tIdx + 2 < tReg.length && grid[1][tDay][tReg[tIdx + 2].slotId]?.subjectCode === oc1.subjectCode) continue;
                        if (!canAssignYear1Period4(1, 4, oc1.subjectCode, oc1.teacherCode, y1w4UpdatedForDay, false)) continue;

                        unbookSlots(1, day, [mPrevSlot, ...allASlots]);
                        unbookSlots(1, tDay, [o1, o2]);

                        const maxSubO = Math.max(getMaxSubjectsPerDay(1), getGradeDayRegularInfo(1, tDay, ar.subjectCode).distinctCount);
                        const infoO = getGradeDayRegularInfo(1, tDay, ar.subjectCode);
                        const posO = [o1, o2].map((sg) => infoO.regularSlots.findIndex((rs) => rs.slotId === sg.slotId));
                        const okIntoO =
                          canAddSubjectToClassDay(infoO.lessonsList, ar.subjectCode, 2, 1, {
                            maxSubjectsOverride: maxSubO,
                            existingPeriodPositions: infoO.existingPositions,
                            candidatePeriodPositions: posO,
                          }) &&
                          isSlotFreeForTeacher(ar.teacherCode, tDay, [o1, o2], ar.subjectCode, 1, {
                            dailyCapOverride: 8,
                            enforceBreaks: false,
                            allowSingleDayOver7: true,
                          });

                        const maxSubD = Math.max(getMaxSubjectsPerDay(1), getGradeDayRegularInfo(1, day, oc1.subjectCode).distinctCount);
                        const infoD = getGradeDayRegularInfo(1, day, oc1.subjectCode);
                        const posD = [mPrevSlot, slot].map((sg) => infoD.regularSlots.findIndex((rs) => rs.slotId === sg.slotId));
                        const okIntoMorn =
                          okIntoO &&
                          canAddSubjectToClassDay(infoD.lessonsList, oc1.subjectCode, 2, 1, {
                            maxSubjectsOverride: maxSubD,
                            existingPeriodPositions: infoD.existingPositions,
                            candidatePeriodPositions: posD,
                          }) &&
                          isSlotFreeForTeacher(oc1.teacherCode, day, [mPrevSlot, slot], oc1.subjectCode, 1, {
                            dailyCapOverride: 8,
                            enforceBreaks: false,
                            allowSingleDayOver7: true,
                          });

                        if (okIntoO && okIntoMorn) {
                          bookSlots(1, tDay, [o1], ar.cells[0]);
                          bookSlots(1, tDay, [o2], ar.cells[1]);
                          bookSlots(1, day, [mPrevSlot], oc1);
                          bookSlots(1, day, [slot], oc2);

                          const remRuns = aRuns5G
                            .filter((_, idx) => idx !== rIdx)
                            .map((r) => ({ ...r, cells: [...r.cells] }));
                          const mergeTgt = remRuns.find(
                            (r) =>
                              r.subjectCode === mPrevCell.subjectCode &&
                              r.cells.length + 1 <= Math.min(2, getMaxDailyPeriodsForSubject(mPrevCell.subjectCode))
                          );
                          if (mergeTgt) {
                            mergeTgt.cells.push(mPrevCell);
                          } else {
                            remRuns.push({ slots: [], cells: [mPrevCell], subjectCode: mPrevCell.subjectCode, teacherCode: mPrevCell.teacherCode });
                          }

                          const tryPack5G = (usedMask: number, offset: number, prevSub?: string): boolean => {
                            if (usedMask === (1 << remRuns.length) - 1) return true;
                            for (let ri = 0; ri < remRuns.length; ri++) {
                              if (usedMask & (1 << ri)) continue;
                              const run = remRuns[ri];
                              if (prevSub && prevSub === run.subjectCode) continue;
                              const ds = aSlots.slice(offset, offset + run.cells.length);
                              if (ds.length !== run.cells.length) continue;
                              if (
                                isSlotFreeForTeacher(run.teacherCode, day, ds, run.subjectCode, 1, {
                                  dailyCapOverride: 8,
                                  enforceBreaks: false,
                                  allowSingleDayOver7: true,
                                })
                              ) {
                                ds.forEach((dslot, idx) => bookSlots(1, day, [dslot], run.cells[idx]));
                                if (tryPack5G(usedMask | (1 << ri), offset + run.cells.length, run.subjectCode)) return true;
                                unbookSlots(1, day, ds);
                              }
                            }
                            return false;
                          };

                          if (remRuns.length <= 4 && tryPack5G(0, 0)) {
                            anyMoved = true;
                            break;
                          }
                          unbookSlots(1, tDay, [o1, o2]);
                          unbookSlots(1, day, [mPrevSlot, slot]);
                        }

                        bookSlots(1, day, [mPrevSlot], mPrevCell);
                        allASlots.forEach((s, idx) => bookSlots(1, day, [s], allACells[idx]));
                        bookSlots(1, tDay, [o1], oc1);
                        bookSlots(1, tDay, [o2], oc2);
                      }
                    }
                  }
                }
              }
            }

            if (!anyMoved) {
              unbookSlots(grade, otherDay, cand.w4Slots);
              unbookSlots(grade, otherDay, cand.altSlots);
              cand.w4Slots.forEach((s, idx) => bookSlots(grade, otherDay, [s], cand.w4Cells[idx]));
              cand.altSlots.forEach((s, idx) => bookSlots(grade, otherDay, [s], cand.altCells[idx]));
            }
          }
        }
      }
      if (anyMoved) break;
    }
    if (!anyMoved) break;
  }
  };
  runStep5Compaction();

  // --------------------------------------------------------------------------
  // STEP 6: DAILY WORKLOAD REBALANCE SWAP (Smooths heavy-day vs light-day spikes)
  // Swaps two occupied regular slots across days within the same grade (zero gaps, zero clashes)
  // --------------------------------------------------------------------------
  for (let rebalanceIter = 0; rebalanceIter < 40; rebalanceIter++) {
    let swapped = false;
    const unbalanced = Array.from(allTeacherCodesSet)
      .map((t) => {
        const loads = DAYS_OF_WEEK.map((d) => ({ day: d, load: getEffectiveTeacherDayLoad(t, d) }));
        const maxVal = Math.max(...loads.map((x) => x.load));
        const minVal = Math.min(...loads.map((x) => x.load));
        const weekly = loads.reduce((a, b) => a + b.load, 0);
        const minTarget = getTeacherMinDailyTarget(weekly);
        const belowTarget = minTarget > 0 && minVal < minTarget ? 1 : 0;
        return { t, loads, maxVal, minVal, range: maxVal - minVal, belowTarget };
      })
      .filter((x) => x.range >= 2.5 || x.maxVal > 7.0 || x.belowTarget > 0)
      .sort((a, b) => (b.belowTarget - a.belowTarget) || (b.range - a.range));

    if (unbalanced.length === 0) break;

    for (const item of unbalanced) {
      if (swapped) break;
      const targetT = item.t;
      const highDays = item.loads
        .filter((x) => x.load >= item.minVal + 2.0 || x.load > 7.0)
        .sort((a, b) => b.load - a.load)
        .map((x) => x.day);
      const lowDays = item.loads
        .filter((x) => x.load <= item.maxVal - 1.5)
        .sort((a, b) => a.load - b.load)
        .map((x) => x.day);

      for (const highDay of highDays) {
        if (swapped) break;
        const highDayLoad = item.loads.find((x) => x.day === highDay)?.load ?? 0;
        for (const lowDay of lowDays) {
          if (swapped || lowDay === highDay) break;
          const lowDayLoad = item.loads.find((x) => x.day === lowDay)?.load ?? 0;
          if (highDayLoad - lowDayLoad < 1.5) continue;

          for (let grade = 1; grade <= 6 && !swapped; grade++) {
            const highSlots = getGradeDaySlots(grade, highDay, academicYear).filter(
              (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
            );
            const lowSlots = getGradeDaySlots(grade, lowDay, academicYear).filter(
              (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
            );

            // Helper scoring involved teachers identically to auditScheduleWorkload
            const scoreInvolvedTeachers = (teacherCodes: string[]): number =>
              teacherCodes.reduce((acc, tc) => {
                const arr = DAYS_OF_WEEK.map((d) => getEffectiveTeacherDayLoad(tc, d));
                const mx = Math.max(...arr);
                const mn = Math.min(...arr);
                const sum = arr.reduce((a, b) => a + b, 0);
                const mean = sum / 5;
                const variance = arr.reduce((a, x) => a + (x - mean) * (x - mean), 0);
                const mt = getTeacherMinDailyTarget(sum);
                const lowPen = mt > 0 ? arr.reduce((p, x) => p + (x < mt ? (mt - x) * 50_000 : 0), 0) : 0;
                const rangeSpike = sum >= 25 && mx - mn > 2.5 ? (mx - mn - 2.5) * 8_000 : 0;
                const rangePen = sum >= 25 && mx - mn > 3.0 + 1e-6 ? 250_000 + (mx - mn - 3.0) * 30_000 : 0;
                const fridayPen = sum >= 25 && arr[4] < Math.floor(sum / 5) - 1 ? 5_000 : 0;
                const over7Pen = arr.filter((x) => x > 7.0 + 1e-6).length * 6_000;
                return acc + variance * 25 + (mx - mn) * (mx - mn) * 60 + lowPen + rangeSpike + rangePen + fridayPen + over7Pen;
              }, 0);

            // Pass A: Swap standalone [1]-blocks across highDay <-> lowDay
            for (const sHigh of highSlots) {
              if (swapped) break;
              const cellHigh = grid[grade]?.[highDay]?.[sHigh.slotId];
              if (!cellHigh || cellHigh.isLocked || cellHigh.subjectCode === 'PJ') continue;
              const highTeachers = cellHigh.teacherCode.split('/').map((x) => x.trim()).filter(Boolean);
              if (!highTeachers.includes(targetT)) continue;

              for (const sLow of lowSlots) {
                const cellLow = grid[grade]?.[lowDay]?.[sLow.slotId];
                if (!cellLow || cellLow.isLocked || cellLow.subjectCode === 'PJ') continue;
                const lowTeachers = cellLow.teacherCode.split('/').map((x) => x.trim()).filter(Boolean);
                if (lowTeachers.some((lt) => highTeachers.includes(lt))) continue;

                // Keep Year 1 W4 PKAR diversity clean
                if (isKP2027Year1 && grade === 1 && (sLow.slotId === 'W4' || sHigh.slotId === 'W4')) {
                  continue;
                }

                // Never break a [2]-block into 1+1, but allow detaching an outer endpoint of a same-session [3]-block (preserving intact [2])
                const isOuterEndOfTriple = (slotsArr: SlotTimeInfo[], dDay: DayOfWeek, idx: number, subCode: string): boolean => {
                  const sPrev = idx > 0 ? grid[grade][dDay][slotsArr[idx - 1].slotId]?.subjectCode === subCode : false;
                  const sNext = idx + 1 < slotsArr.length ? grid[grade][dDay][slotsArr[idx + 1].slotId]?.subjectCode === subCode : false;
                  if (!sPrev && !sNext) return true;
                  const sameSess = (a: SlotTimeInfo, b: SlotTimeInfo) => (a.endMinutes <= 585) === (b.endMinutes <= 585);
                  if (
                    sPrev &&
                    !sNext &&
                    idx >= 2 &&
                    sameSess(slotsArr[idx - 2], slotsArr[idx]) &&
                    grid[grade][dDay][slotsArr[idx - 2].slotId]?.subjectCode === subCode &&
                    !grid[grade][dDay][slotsArr[idx - 1].slotId]?.isLocked &&
                    !grid[grade][dDay][slotsArr[idx - 2].slotId]?.isLocked
                  ) {
                    return true;
                  }
                  if (
                    sNext &&
                    !sPrev &&
                    idx + 2 < slotsArr.length &&
                    sameSess(slotsArr[idx], slotsArr[idx + 2]) &&
                    grid[grade][dDay][slotsArr[idx + 2].slotId]?.subjectCode === subCode &&
                    !grid[grade][dDay][slotsArr[idx + 1].slotId]?.isLocked &&
                    !grid[grade][dDay][slotsArr[idx + 2].slotId]?.isLocked
                  ) {
                    return true;
                  }
                  return false;
                };

                const highIdx = highSlots.findIndex((s) => s.slotId === sHigh.slotId);
                if (!isOuterEndOfTriple(highSlots, highDay, highIdx, cellHigh.subjectCode)) continue;

                const lowIdx = lowSlots.findIndex((s) => s.slotId === sLow.slotId);
                if (!isOuterEndOfTriple(lowSlots, lowDay, lowIdx, cellLow.subjectCode)) continue;
                if (cellLow.subjectCode === cellHigh.subjectCode) continue;

                // Protect [2]-blocks of PM/PAI: only swap a standalone [1] PM/PAI onto a day with 0 existing PM/PAI!
                if (cellHigh.subjectCode === 'PM/PAI') {
                  const hAdjacentPm =
                    (highIdx > 0 && grid[grade][highDay][highSlots[highIdx - 1].slotId]?.subjectCode === 'PM/PAI') ||
                    (highIdx + 1 < highSlots.length && grid[grade][highDay][highSlots[highIdx + 1].slotId]?.subjectCode === 'PM/PAI');
                  if (hAdjacentPm || lowSlots.some((s) => grid[grade]?.[lowDay]?.[s.slotId]?.subjectCode === 'PM/PAI')) {
                    continue;
                  }
                }
                if (cellLow.subjectCode === 'PM/PAI') {
                  const lAdjacentPm =
                    (lowIdx > 0 && grid[grade][lowDay][lowSlots[lowIdx - 1].slotId]?.subjectCode === 'PM/PAI') ||
                    (lowIdx + 1 < lowSlots.length && grid[grade][lowDay][lowSlots[lowIdx + 1].slotId]?.subjectCode === 'PM/PAI');
                  if (lAdjacentPm || highSlots.some((s) => grid[grade]?.[highDay]?.[s.slotId]?.subjectCode === 'PM/PAI')) {
                    continue;
                  }
                }

                // Verify class subject daily cap & compact subject ceiling remain valid on both days
                const allowT1Five = grade <= 3 && (item.belowTarget > 0 || item.range > 3.0 + 1e-6);
                const baseCapA = getMaxSubjectsPerDay(grade) + (allowT1Five ? 1 : 0);
                const highInfoAfter = getGradeDayRegularInfo(grade, highDay, cellLow.subjectCode, new Set([sHigh.slotId]));
                const highPos = highInfoAfter.regularSlots.findIndex((rs) => rs.slotId === sHigh.slotId);
                const highCurrentMaxSub = grade <= 3 ? Math.min(5, Math.max(baseCapA, highInfoAfter.distinctCount)) : Math.max(baseCapA, highInfoAfter.distinctCount);
                if (
                  !canAddSubjectToClassDay(highInfoAfter.lessonsList, cellLow.subjectCode, 1, grade, {
                    maxSubjectsOverride: highCurrentMaxSub,
                    existingPeriodPositions: highInfoAfter.existingPositions,
                    candidatePeriodPositions: [highPos],
                  })
                ) {
                  continue;
                }

                const lowInfoAfter = getGradeDayRegularInfo(grade, lowDay, cellHigh.subjectCode, new Set([sLow.slotId]));
                const lowPos = lowInfoAfter.regularSlots.findIndex((rs) => rs.slotId === sLow.slotId);
                const lowCurrentMaxSub = grade <= 3 ? Math.min(5, Math.max(baseCapA, lowInfoAfter.distinctCount)) : Math.max(baseCapA, lowInfoAfter.distinctCount);
                if (
                  !canAddSubjectToClassDay(lowInfoAfter.lessonsList, cellHigh.subjectCode, 1, grade, {
                    maxSubjectsOverride: lowCurrentMaxSub,
                    existingPeriodPositions: lowInfoAfter.existingPositions,
                    candidatePeriodPositions: [lowPos],
                  })
                ) {
                  continue;
                }

                unbookSlots(grade, highDay, [sHigh]);
                unbookSlots(grade, lowDay, [sLow]);

                const highFitsOnLow = isSlotFreeForTeacher(
                  cellHigh.teacherCode,
                  lowDay,
                  [sLow],
                  cellHigh.subjectCode,
                  grade,
                  { dailyCapOverride: 8, enforceBreaks: false, allowSingleDayOver7: true }
                );
                const lowFitsOnHigh =
                  highFitsOnLow &&
                  isSlotFreeForTeacher(
                    cellLow.teacherCode,
                    highDay,
                    [sHigh],
                    cellLow.subjectCode,
                    grade,
                    { dailyCapOverride: 8, enforceBreaks: false, allowSingleDayOver7: true }
                  );

                if (highFitsOnLow && lowFitsOnHigh) {
                  const involved = Array.from(new Set([...highTeachers, ...lowTeachers]));
                  bookSlots(grade, lowDay, [sLow], cellHigh);
                  bookSlots(grade, highDay, [sHigh], cellLow);
                  const afterScore = scoreInvolvedTeachers(involved);

                  unbookSlots(grade, lowDay, [sLow]);
                  unbookSlots(grade, highDay, [sHigh]);
                  bookSlots(grade, highDay, [sHigh], cellHigh);
                  bookSlots(grade, lowDay, [sLow], cellLow);
                  const beforeScore = scoreInvolvedTeachers(involved);

                  if (afterScore + 0.1 < beforeScore) {
                    unbookSlots(grade, highDay, [sHigh]);
                    unbookSlots(grade, lowDay, [sLow]);
                    bookSlots(grade, lowDay, [sLow], cellHigh);
                    bookSlots(grade, highDay, [sHigh], cellLow);
                    swapped = true;
                    break;
                  }
                } else {
                  bookSlots(grade, highDay, [sHigh], cellHigh);
                  bookSlots(grade, lowDay, [sLow], cellLow);
                }
              }
            }

            // Pass B: Swap intact same-session [2]-blocks across highDay <-> lowDay (including intact PM/PAI [2]-blocks!)
            for (let hi = 0; hi < highSlots.length - 1 && !swapped; hi++) {
              const hs1 = highSlots[hi];
              const hs2 = highSlots[hi + 1];
              if (hs1.endMinutes <= 585 && hs2.startMinutes >= 615) continue;
              if (isKP2027Year1 && grade === 1 && (hs1.slotId === 'W4' || hs2.slotId === 'W4')) continue;
              const hc1 = grid[grade]?.[highDay]?.[hs1.slotId];
              const hc2 = grid[grade]?.[highDay]?.[hs2.slotId];
              if (!hc1 || !hc2 || hc1.isLocked || hc2.isLocked || hc1.subjectCode !== hc2.subjectCode || hc1.subjectCode === 'PJ') {
                continue;
              }
              if (hi > 0 && grid[grade][highDay][highSlots[hi - 1].slotId]?.subjectCode === hc1.subjectCode) continue;
              if (hi + 2 < highSlots.length && grid[grade][highDay][highSlots[hi + 2].slotId]?.subjectCode === hc1.subjectCode) continue;
              const highTeachers = hc1.teacherCode.split('/').map((x) => x.trim()).filter(Boolean);
              if (!highTeachers.includes(targetT)) continue;

              for (let li = 0; li < lowSlots.length - 1 && !swapped; li++) {
                const ls1 = lowSlots[li];
                const ls2 = lowSlots[li + 1];
                if (ls1.endMinutes <= 585 && ls2.startMinutes >= 615) continue;
                if (isKP2027Year1 && grade === 1 && (ls1.slotId === 'W4' || ls2.slotId === 'W4')) continue;
                const lc1 = grid[grade]?.[lowDay]?.[ls1.slotId];
                const lc2 = grid[grade]?.[lowDay]?.[ls2.slotId];
                if (!lc1 || !lc2 || lc1.isLocked || lc2.isLocked || lc1.subjectCode !== lc2.subjectCode || lc1.subjectCode === 'PJ') {
                  continue;
                }
                if (lc1.subjectCode === hc1.subjectCode) continue;
                if (li > 0 && grid[grade][lowDay][lowSlots[li - 1].slotId]?.subjectCode === lc1.subjectCode) continue;
                if (li + 2 < lowSlots.length && grid[grade][lowDay][lowSlots[li + 2].slotId]?.subjectCode === lc1.subjectCode) continue;
                const lowTeachers = lc1.teacherCode.split('/').map((x) => x.trim()).filter(Boolean);
                if (lowTeachers.some((lt) => highTeachers.includes(lt))) continue;

                // If swapping a PM/PAI [2]-block, ensure destination day has 0 existing PM/PAI so [2,2,1]/[2,2]/[2,1] integrity holds strictly
                if (
                  hc1.subjectCode === 'PM/PAI' &&
                  lowSlots.some((s) => grid[grade]?.[lowDay]?.[s.slotId]?.subjectCode === 'PM/PAI')
                ) {
                  continue;
                }
                if (
                  lc1.subjectCode === 'PM/PAI' &&
                  highSlots.some((s) => grid[grade]?.[highDay]?.[s.slotId]?.subjectCode === 'PM/PAI')
                ) {
                  continue;
                }

                const allowT1FiveB = grade <= 3 && (item.belowTarget > 0 || item.range > 3.0 + 1e-6);
                const baseCapB = getMaxSubjectsPerDay(grade) + (allowT1FiveB ? 1 : 0);
                const highInfoAfter = getGradeDayRegularInfo(grade, highDay, lc1.subjectCode, new Set([hs1.slotId, hs2.slotId]));
                const highPos = [hs1, hs2].map((sg) => highInfoAfter.regularSlots.findIndex((rs) => rs.slotId === sg.slotId));
                const highCurrentMaxSub = grade <= 3 ? Math.min(5, Math.max(baseCapB, highInfoAfter.distinctCount)) : Math.max(baseCapB, highInfoAfter.distinctCount);
                if (
                  !canAddSubjectToClassDay(highInfoAfter.lessonsList, lc1.subjectCode, 2, grade, {
                    maxSubjectsOverride: highCurrentMaxSub,
                    existingPeriodPositions: highInfoAfter.existingPositions,
                    candidatePeriodPositions: highPos,
                  })
                ) {
                  continue;
                }

                const lowInfoAfter = getGradeDayRegularInfo(grade, lowDay, hc1.subjectCode, new Set([ls1.slotId, ls2.slotId]));
                const lowPos = [ls1, ls2].map((sg) => lowInfoAfter.regularSlots.findIndex((rs) => rs.slotId === sg.slotId));
                const lowCurrentMaxSub = grade <= 3 ? Math.min(5, Math.max(baseCapB, lowInfoAfter.distinctCount)) : Math.max(baseCapB, lowInfoAfter.distinctCount);
                if (
                  !canAddSubjectToClassDay(lowInfoAfter.lessonsList, hc1.subjectCode, 2, grade, {
                    maxSubjectsOverride: lowCurrentMaxSub,
                    existingPeriodPositions: lowInfoAfter.existingPositions,
                    candidatePeriodPositions: lowPos,
                  })
                ) {
                  continue;
                }

                unbookSlots(grade, highDay, [hs1, hs2]);
                unbookSlots(grade, lowDay, [ls1, ls2]);

                const highFitsOnLow = isSlotFreeForTeacher(
                  hc1.teacherCode,
                  lowDay,
                  [ls1, ls2],
                  hc1.subjectCode,
                  grade,
                  { dailyCapOverride: 8, enforceBreaks: false, allowSingleDayOver7: true }
                );
                const lowFitsOnHigh = isSlotFreeForTeacher(
                  lc1.teacherCode,
                  highDay,
                  [hs1, hs2],
                  lc1.subjectCode,
                  grade,
                  { dailyCapOverride: 8, enforceBreaks: false, allowSingleDayOver7: true }
                );

                // Helper: if 1 of the two directions fails ONLY due to a single grade's session time-overlap on that day,
                // try sliding that other grade's session runs on that day cleanly to clear the time window!
                let slideRollback: (() => void) | null = null;
                if (highFitsOnLow !== lowFitsOnHigh) {
                  const fixDay = highFitsOnLow ? highDay : lowDay;
                  const fixSlots = highFitsOnLow ? [hs1, hs2] : [ls1, ls2];
                  const fixTeacherCode = highFitsOnLow ? lc1.teacherCode : hc1.teacherCode;
                  const fixSubjectCode = highFitsOnLow ? lc1.subjectCode : hc1.subjectCode;
                  const fixTeachers = fixTeacherCode.split('/').map((t) => t.trim()).filter(Boolean);
                  const minStart = Math.min(...fixSlots.map((s) => s.startMinutes));
                  const maxEnd = Math.max(...fixSlots.map((s) => s.endMinutes));

                  const blockingGrades = new Set<number>();
                  for (let og = 1; og <= 6; og++) {
                    if (og === grade) continue;
                    const ogSlots = getGradeDaySlots(og, fixDay, academicYear);
                    for (const s of ogSlots) {
                      if (s.isRecess) continue;
                      if (!(s.startMinutes < maxEnd && s.endMinutes > minStart)) continue;
                      const oc = grid[og][fixDay][s.slotId];
                      if (!oc) continue;
                      const oTs = oc.teacherCode.split('/').map((t) => t.trim()).filter(Boolean);
                      if (oTs.some((t) => fixTeachers.includes(t))) {
                        blockingGrades.add(og);
                      }
                    }
                  }

                  if (blockingGrades.size === 1) {
                    const og = Array.from(blockingGrades)[0];
                    const ogAll = getGradeDaySlots(og, fixDay, academicYear).filter(
                      (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
                    );
                    const isFixMorn = maxEnd <= 585;
                    const ogSess = ogAll.filter((s) => (isFixMorn ? s.endMinutes <= 585 : s.startMinutes >= 615));
                    const ogRuns: Array<{ slots: SlotTimeInfo[]; cells: TimetableCell[]; subjectCode: string; teacherCode: string }> = [];
                    let oi = 0;
                    while (oi < ogSess.length) {
                      const oc = grid[og][fixDay][ogSess[oi].slotId];
                      if (!oc) { oi++; continue; }
                      const rs: SlotTimeInfo[] = [ogSess[oi]];
                      const rc: TimetableCell[] = [oc];
                      while (oi + 1 < ogSess.length) {
                        const nc = grid[og][fixDay][ogSess[oi + 1].slotId];
                        if (!nc || nc.subjectCode !== oc.subjectCode) break;
                        rs.push(ogSess[oi + 1]);
                        rc.push(nc);
                        oi++;
                      }
                      ogRuns.push({ slots: rs, cells: rc, subjectCode: oc.subjectCode, teacherCode: oc.teacherCode });
                      oi++;
                    }

                    const hasLockedOrPj = ogRuns.some((r) =>
                      r.cells.some((c) => c.isLocked || c.subjectCode === 'PJ' || c.subjectCode === 'PM/PAI') ||
                      (isKP2027Year1 && og === 1 && r.slots.some((s) => s.slotId === 'W4'))
                    );
                    if (!hasLockedOrPj && ogRuns.length >= 2 && ogRuns.length <= 4) {
                      const origOgSlots = ogRuns.flatMap((r) => r.slots);
                      const origOgCells = ogRuns.flatMap((r) => r.cells);
                      const destRange = ogSess.slice(0, origOgSlots.length);
                      if (origOgSlots.length === destRange.length) {
                        unbookSlots(og, fixDay, origOgSlots);
                        const trySlideOg = (usedMask: number, offset: number): boolean => {
                          if (usedMask === (1 << ogRuns.length) - 1) {
                            return isSlotFreeForTeacher(fixTeacherCode, fixDay, fixSlots, fixSubjectCode, grade, {
                              dailyCapOverride: 8,
                              enforceBreaks: false,
                              allowSingleDayOver7: true,
                            });
                          }
                          for (let ri = 0; ri < ogRuns.length; ri++) {
                            if (usedMask & (1 << ri)) continue;
                            const run = ogRuns[ri];
                            const ds = destRange.slice(offset, offset + run.cells.length);
                            if (
                              isSlotFreeForTeacher(run.teacherCode, fixDay, ds, run.subjectCode, og, {
                                dailyCapOverride: 8,
                                enforceBreaks: false,
                                allowSingleDayOver7: true,
                              })
                            ) {
                              ds.forEach((dslot, idx) => bookSlots(og, fixDay, [dslot], run.cells[idx]));
                              if (trySlideOg(usedMask | (1 << ri), offset + run.cells.length)) return true;
                              unbookSlots(og, fixDay, ds);
                            }
                          }
                          return false;
                        };

                        if (trySlideOg(0, 0)) {
                          slideRollback = () => {
                            unbookSlots(og, fixDay, destRange);
                            origOgSlots.forEach((s, idx) => bookSlots(og, fixDay, [s], origOgCells[idx]));
                          };
                        } else {
                          origOgSlots.forEach((s, idx) => bookSlots(og, fixDay, [s], origOgCells[idx]));
                        }
                      }
                    }
                  }
                }

                if ((highFitsOnLow && lowFitsOnHigh) || slideRollback !== null) {
                  const involved = Array.from(new Set([...highTeachers, ...lowTeachers]));
                  bookSlots(grade, lowDay, [ls1], hc1);
                  bookSlots(grade, lowDay, [ls2], hc2);
                  bookSlots(grade, highDay, [hs1], lc1);
                  bookSlots(grade, highDay, [hs2], lc2);
                  const afterScore = scoreInvolvedTeachers(involved);

                  unbookSlots(grade, lowDay, [ls1, ls2]);
                  unbookSlots(grade, highDay, [hs1, hs2]);
                  bookSlots(grade, highDay, [hs1], hc1);
                  bookSlots(grade, highDay, [hs2], hc2);
                  bookSlots(grade, lowDay, [ls1], lc1);
                  bookSlots(grade, lowDay, [ls2], lc2);
                  const beforeScore = scoreInvolvedTeachers(involved);

                  if (afterScore + 0.1 < beforeScore) {
                    unbookSlots(grade, highDay, [hs1, hs2]);
                    unbookSlots(grade, lowDay, [ls1, ls2]);
                    bookSlots(grade, lowDay, [ls1], hc1);
                    bookSlots(grade, lowDay, [ls2], hc2);
                    bookSlots(grade, highDay, [hs1], lc1);
                    bookSlots(grade, highDay, [hs2], lc2);
                    swapped = true;
                    break;
                  } else if (slideRollback) {
                    slideRollback();
                  }
                } else {
                  bookSlots(grade, highDay, [hs1], hc1);
                  bookSlots(grade, highDay, [hs2], hc2);
                  bookSlots(grade, lowDay, [ls1], lc1);
                  bookSlots(grade, lowDay, [ls2], lc2);
                }
              }
            }
          }
        }
      }
    }
    if (!swapped) break;
  }

  // --------------------------------------------------------------------------
  // STEP 5.5: MANDATORY POST-COMPACTION & INTRA-CLASS SWAP REPAIR PASS (ZERO BLANK GUARANTEE)
  // Retries direct placement -> 1-hop intra-class swap (P -> E, unplaced -> P), then re-compacts gaps!
  // --------------------------------------------------------------------------
  if (unplacedBlockItems.length > 0) {
    // Expand any residual multi-period unplaced items into singles only at this last-resort stage
    const expandedItems: Array<{ block: BlockToSchedule; origLabel: string }> = [];
    for (const b of unplacedBlockItems) {
      const origLabel = `T.${b.grade} ${b.subjectCode} (${b.length} waktu)`;
      if (b.length === 1) {
        expandedItems.push({ block: b, origLabel });
      } else {
        for (let k = 0; k < b.length; k++) {
          expandedItems.push({ block: { ...b, id: `${b.id}_r${k}`, length: 1 }, origLabel });
        }
      }
    }

    let recoveredAny = false;
    const stillUnplacedLabels: string[] = [];

    const checkY1W4ForCandidate = (grade: number, slotId: string, day: DayOfWeek, sub: string, tCode: string): boolean => {
      if (!(isKP2027Year1 && grade === 1 && slotId === 'W4')) return true;
      const existingY1W4 = DAYS_OF_WEEK.filter((d) => d !== day)
        .map((d) => {
          const c = grid[1]?.[d]?.['W4'];
          return c ? { day: d, subjectCode: c.subjectCode, teacherId: c.teacherCode } : null;
        })
        .filter(Boolean) as Array<{ day: string; subjectCode: string; teacherId: string }>;
      return canAssignYear1Period4(1, 4, sub, tCode, existingY1W4, false);
    };

    for (const { block } of expandedItems) {
      let uPlaced = false;
      const baseMaxU = getMaxSubjectsPerDay(block.grade);

      // Pass A: Direct placement into any empty slot (strict +1 -> +2 -> relaxed 12)
      for (const maxSubU of [baseMaxU + 1, baseMaxU + 2, 12]) {
        if (uPlaced) break;
        const uDays = sortCandidateDaysForBlock([...DAYS_OF_WEEK], block, maxSubU);
        for (const tDay of uDays) {
          if (uPlaced) break;
          if (block.subjectCode === 'PJ' && !canPlacePJOnDay(block.grade, tDay, false)) continue;
          const tSlots = getGradeDaySlots(block.grade, tDay, academicYear).filter(
            (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
          );
          const tInfo = getGradeDayRegularInfo(block.grade, tDay, block.subjectCode);
          for (const eSlot of tSlots) {
            if (grid[block.grade][tDay][eSlot.slotId] !== null) continue;
            if (block.subjectCode === 'PJ' && eSlot.slotId !== 'W1' && eSlot.slotId !== 'W2') continue;
            const tPos = tInfo.regularSlots.findIndex((rs) => rs.slotId === eSlot.slotId);
            if (
              checkY1W4ForCandidate(block.grade, eSlot.slotId, tDay, block.subjectCode, block.teacherCode) &&
              canAddSubjectToClassDay(tInfo.lessonsList, block.subjectCode, 1, block.grade, {
                maxSubjectsOverride: maxSubU,
                existingPeriodPositions: tInfo.existingPositions,
                candidatePeriodPositions: [tPos],
              }) &&
              isSlotFreeForTeacher(block.teacherCode, tDay, [eSlot], block.subjectCode, block.grade, {
                dailyCapOverride: 8,
                enforceBreaks: false,
                allowSingleDayOver7: true,
              })
            ) {
              bookSlots(block.grade, tDay, [eSlot], {
                subjectId: block.id,
                subjectCode: block.subjectCode,
                subjectName: block.subjectName,
                teacherCode: block.teacherCode,
                ...(block.secondaryTeacherCode
                  ? { secondaryTeacherCode: block.secondaryTeacherCode, isCoTeaching: true }
                  : {}),
              });
              uPlaced = true;
              recoveredAny = true;
              break;
            }
          }
        }
      }

      // Pass B: Mandatory Intra-Class 1-Hop Swap Repair (P -> eSlot, unplaced -> P)
      if (!uPlaced) {
        const emptyTargets: Array<{ tDay: DayOfWeek; eSlot: SlotTimeInfo }> = [];
        for (const tDay of DAYS_OF_WEEK) {
          const tSlots = getGradeDaySlots(block.grade, tDay, academicYear).filter(
            (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
          );
          for (const eSlot of tSlots) {
            if (grid[block.grade][tDay][eSlot.slotId] === null) {
              emptyTargets.push({ tDay, eSlot });
            }
          }
        }

        for (const maxSubU of [baseMaxU + 1, baseMaxU + 2, 12]) {
          if (uPlaced) break;
          for (const { tDay, eSlot } of emptyTargets) {
            if (uPlaced) break;
            for (const pDay of DAYS_OF_WEEK) {
              if (uPlaced) break;
              const pSlots = getGradeDaySlots(block.grade, pDay, academicYear).filter(
                (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
              );
              for (let pi = 0; pi < pSlots.length && !uPlaced; pi++) {
                const pSlot = pSlots[pi];
                const pCell = grid[block.grade][pDay][pSlot.slotId];
                if (!pCell || pCell.isLocked || pCell.subjectCode === 'PJ' || pCell.subjectCode === 'PM/PAI') continue;
                if (pCell.subjectCode.toUpperCase() === block.subjectCode.toUpperCase()) continue;
                if (block.subjectCode === 'PJ') {
                  if (pSlot.slotId !== 'W1' && pSlot.slotId !== 'W2') continue;
                  if (!canPlacePJOnDay(block.grade, pDay, false)) continue;
                }
                // Protect intact doubles during non-emergency pass
                const pAdj =
                  (pi > 0 && grid[block.grade][pDay][pSlots[pi - 1].slotId]?.subjectCode === pCell.subjectCode) ||
                  (pi + 1 < pSlots.length && grid[block.grade][pDay][pSlots[pi + 1].slotId]?.subjectCode === pCell.subjectCode);
                if (pAdj && pDay !== tDay && maxSubU < 12) continue;

                unbookSlots(block.grade, pDay, [pSlot]);

                const eInfo = getGradeDayRegularInfo(block.grade, tDay, pCell.subjectCode, new Set([eSlot.slotId]));
                const ePos = eInfo.regularSlots.findIndex((rs) => rs.slotId === eSlot.slotId);
                const canMoveExistingToE =
                  checkY1W4ForCandidate(block.grade, eSlot.slotId, tDay, pCell.subjectCode, pCell.teacherCode) &&
                  canAddSubjectToClassDay(eInfo.lessonsList, pCell.subjectCode, 1, block.grade, {
                    maxSubjectsOverride: maxSubU,
                    existingPeriodPositions: eInfo.existingPositions,
                    candidatePeriodPositions: [ePos],
                  }) &&
                  isSlotFreeForTeacher(pCell.teacherCode, tDay, [eSlot], pCell.subjectCode, block.grade, {
                    dailyCapOverride: 8,
                    enforceBreaks: false,
                    allowSingleDayOver7: true,
                  });

                if (canMoveExistingToE) {
                  bookSlots(block.grade, tDay, [eSlot], pCell);

                  const pInfo = getGradeDayRegularInfo(block.grade, pDay, block.subjectCode, new Set([pSlot.slotId]));
                  const pPos = pInfo.regularSlots.findIndex((rs) => rs.slotId === pSlot.slotId);
                  if (
                    checkY1W4ForCandidate(block.grade, pSlot.slotId, pDay, block.subjectCode, block.teacherCode) &&
                    canAddSubjectToClassDay(pInfo.lessonsList, block.subjectCode, 1, block.grade, {
                      maxSubjectsOverride: maxSubU,
                      existingPeriodPositions: pInfo.existingPositions,
                      candidatePeriodPositions: [pPos],
                    }) &&
                    isSlotFreeForTeacher(block.teacherCode, pDay, [pSlot], block.subjectCode, block.grade, {
                      dailyCapOverride: 8,
                      enforceBreaks: false,
                      allowSingleDayOver7: true,
                    })
                  ) {
                    bookSlots(block.grade, pDay, [pSlot], {
                      subjectId: block.id,
                      subjectCode: block.subjectCode,
                      subjectName: block.subjectName,
                      teacherCode: block.teacherCode,
                      ...(block.secondaryTeacherCode
                        ? { secondaryTeacherCode: block.secondaryTeacherCode, isCoTeaching: true }
                        : {}),
                    });
                    uPlaced = true;
                    recoveredAny = true;
                    break;
                  }

                  unbookSlots(block.grade, tDay, [eSlot]);
                }

                bookSlots(block.grade, pDay, [pSlot], pCell);
              }
            }
          }
        }
      }

      if (!uPlaced) {
        stillUnplacedLabels.push(`T.${block.grade} ${block.subjectCode} (${block.length} waktu)`);
      }
    }

    unplacedBlocks.length = 0;
    unplacedBlocks.push(...stillUnplacedLabels);

    if (recoveredAny) {
      runStep5Compaction();
    }
  }

  // Final Zero-Gap Safety Net for Tahun 1 W4: if all strict compaction passes left an isolated W4 middle gap,
  // fill it via: (1) tail [1], (2) interior afternoon [1] + left-shift, or (3) 2-step P->gap + tail/interior->P,
  // while preserving >= 4 distinct Y1 W4 teachers & zero 3-consecutive!
  const y1W4RemainingGaps = findGaps().filter((g) => g.grade === 1 && g.slot.slotId === 'W4');
  if (y1W4RemainingGaps.length > 0) {
    let fixedY1Gap = false;
    const pullInteriorSingleFromDay = (srcDay: DayOfWeek, dstDay: DayOfWeek, dstSlot: SlotTimeInfo, relaxY1: boolean): boolean => {
      const oSlots = getGradeDaySlots(1, srcDay, academicYear).filter(
        (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
      );
      const oAftern = oSlots.filter((s) => s.startMinutes >= 615);
      const dstIdx = srcDay === dstDay ? oAftern.findIndex((s) => s.slotId === dstSlot.slotId) : -1;
      for (let k = oAftern.length - 1; k > dstIdx; k--) {
        const src = oAftern[k];
        const cell = grid[1][srcDay][src.slotId];
        if (!cell || cell.isLocked) continue;
        const tailAfter = oAftern.slice(k + 1);
        const occupiedTail = tailAfter.filter((s) => grid[1][srcDay][s.slotId] !== null);
        if (occupiedTail.length === 0) {
          if (canMove(cell, srcDay, src, dstDay, dstSlot, 1, relaxY1)) {
            executeMove(1, srcDay, src, dstDay, dstSlot);
            return true;
          }
          continue;
        }
        const contiguousAfter: SlotTimeInfo[] = [];
        for (let r = k + 1; r < oAftern.length; r++) {
          if (!grid[1][srcDay][oAftern[r].slotId]) break;
          contiguousAfter.push(oAftern[r]);
        }
        if (
          contiguousAfter.length !== occupiedTail.length ||
          contiguousAfter.some((s) => grid[1][srcDay][s.slotId]?.isLocked || grid[1][srcDay][s.slotId]?.subjectCode === 'PJ')
        ) {
          continue;
        }
        if (!canMove(cell, srcDay, src, dstDay, dstSlot, 1, relaxY1)) continue;
        const afterCells = contiguousAfter.map((s) => grid[1][srcDay][s.slotId]!);
        const destAfter = [src, ...contiguousAfter.slice(0, -1)];
        unbookSlots(1, srcDay, contiguousAfter);
        const shiftOk = afterCells.every((ac, idx) =>
          isSlotFreeForTeacher(ac.teacherCode, srcDay, [destAfter[idx]], ac.subjectCode, 1, {
            dailyCapOverride: 8,
            enforceBreaks: false,
            allowSingleDayOver7: true,
          })
        );
        contiguousAfter.forEach((s, idx) => bookSlots(1, srcDay, [s], afterCells[idx]));
        if (shiftOk) {
          executeMove(1, srcDay, src, dstDay, dstSlot);
          for (let idx = 0; idx < contiguousAfter.length; idx++) {
            executeMove(1, srcDay, contiguousAfter[idx], srcDay, destAfter[idx]);
          }
          return true;
        }
      }
      return false;
    };

    for (const gap of y1W4RemainingGaps) {
      let movedGap = false;
      // 1) Direct tail or afternoon interior [1] pull (with relaxY1W4Subject=true)
      for (const otherDay of DAYS_OF_WEEK) {
        if (pullInteriorSingleFromDay(otherDay, gap.day, gap.slot, true)) {
          movedGap = true;
          fixedY1Gap = true;
          break;
        }
      }
      // 2) 2-step chain: move an interior/other [1] P -> gap, then refill P via tail or afternoon interior [1] + left-shift!
      if (!movedGap) {
        for (const midDay of DAYS_OF_WEEK) {
          if (movedGap) break;
          const midSlots = getGradeDaySlots(1, midDay, academicYear).filter(
            (s) => !s.isRecess && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK'
          );
          for (const midSlot of midSlots) {
            if (midDay === gap.day && midSlot.slotId === gap.slot.slotId) continue;
            if (isKP2027Year1 && midSlot.slotId === 'W4') continue;
            const midCell = grid[1][midDay][midSlot.slotId];
            if (!midCell || midCell.isLocked) continue;
            if (!canMove(midCell, midDay, midSlot, gap.day, gap.slot, 1, true)) continue;

            executeMove(1, midDay, midSlot, gap.day, gap.slot);
            let refilled = false;
            for (const thirdDay of DAYS_OF_WEEK) {
              if (pullInteriorSingleFromDay(thirdDay, midDay, midSlot, true)) {
                refilled = true;
                break;
              }
            }
            if (refilled) {
              movedGap = true;
              fixedY1Gap = true;
              break;
            }
            executeMove(1, gap.day, gap.slot, midDay, midSlot);
          }
        }
      }
    }
    if (fixedY1Gap) {
      runStep5Compaction();
    }
  }

  // Finalize Year 1 auto-PKAR pairing
  autoPairPKARInGrid(grid, academicYear);

  const clashes = detectScheduleClashes(grid, academicYear);
  const audit = auditScheduleWorkload(grid, Array.from(allTeacherCodesSet), academicYear);

  return { grid, clashes, unplaced: unplacedBlocks, audit };
}

/**
 * Computes candidate score (HIGHER = BETTER)
 */
function scoreCandidateAttempt(
  res: { grid: ScheduleGrid; clashes: TimetableClash[]; unplaced: string[]; audit: ScheduleAuditReport },
  prevSig: string
): number {
  const { clashes, unplaced, audit } = res;
  let score = 0;

  // Hard validity gates
  if (clashes.length === 0) score += 5_000_000;
  else score -= clashes.length * 3_000_000;

  if (unplaced.length === 0) score += 8_000_000;
  else score -= unplaced.length * 3_000_000;

  if (audit.teachersOver8 === 0) score += 5_000_000;
  else score -= audit.teachersOver8 * 500_000;

  if (audit.teachersExceedingOver7Limit === 0) score += 3_000_000;
  else score -= audit.teachersExceedingOver7Limit * 300_000;

  if (audit.pjConsecutiveViolations === 0 && audit.pjSlotViolations === 0) score += 2_000_000;
  else score -= (audit.pjConsecutiveViolations + audit.pjSlotViolations) * 200_000;

  if (audit.pmPaiBlockViolations === 0) score += 2_500_000;
  else score -= audit.pmPaiBlockViolations * 400_000;
  score -= audit.pmPaiCrossRecessCount * 5_000;

  if (audit.tahap2SubjectCapViolations === 0) score += 2_000_000;
  else score -= audit.tahap2SubjectCapViolations * 400_000;

  if (audit.subjectDailyPeriodCapViolations === 0) score += 2_000_000;
  else score -= audit.subjectDailyPeriodCapViolations * 400_000;

  if (audit.fragmentedSubjectViolations === 0) score += 2_000_000;
  else score -= audit.fragmentedSubjectViolations * 400_000;

  // Compact Tahap 1 daily distinct subjects (hard ceiling <= 5/day, target <= 4/day)
  if (audit.tahap1Over5Days === 0) score += 2_000_000;
  else score -= audit.tahap1Over5Days * 500_000;
  score -= audit.tahap1SubjectExcessDays * 12_000;
  score -= audit.totalDistinctSubjectDays * 1_200;

  if (audit.middleGaps === 0) score += 1_500_000;
  else score -= audit.middleGaps * 250_000;

  // Prefer fewer days > 7.0 across school while focusing on overall daily balance
  score -= audit.totalDaysOver7 * 8_000;

  // Minimize daily spread variance & low-load days (keeps distribution as even as possible)
  score -= audit.spreadPenalty;

  // Prefer PJ on Period 1 (W1) vs Period 2 (W2)
  score -= audit.pjW2Count * 80;

  // Enforce Year 1 W4 (pre-PKAR) rotation fairness (>= 4 distinct teachers across Mon-Fri)
  const y1W4Teachers = DAYS_OF_WEEK.map((d) => res.grid[1]?.[d]?.['W4']?.teacherCode?.trim() || '').filter(Boolean);
  if (y1W4Teachers.length === 5) {
    const distinctY1W4 = new Set(y1W4Teachers).size;
    if (distinctY1W4 >= 4) score += 20_000;
    else score -= (4 - distinctY1W4) * 15_000;
  }

  // Encourage >30% variation from previous schedule signature when one exists
  if (prevSig) {
    const currSig = computeScheduleSignature(res.grid);
    const prevSet = new Set(prevSig.split('|').filter(Boolean));
    const currArr = currSig.split('|').filter(Boolean);
    if (prevSet.size > 0 && currArr.length > 0) {
      let overlap = 0;
      for (const e of currArr) {
        if (prevSet.has(e)) overlap++;
      }
      const ratio = overlap / Math.max(prevSet.size, currArr.length);
      if (ratio <= 0.7) {
        score += 3_000;
      }
    }
  }

  return score;
}

/**
 * Multi-attempt stochastic solver (MAX_ATTEMPTS = 80)
 * Evaluates up to 80 seeds and picks the schedule that strictly satisfies <= 8 periods/day,
 * <= 2 days > 7.0 periods/week, PJ rules, compact subject grouping, 0 clashes, 0 gaps, and optimal daily balance.
 */
export const MAX_ATTEMPTS = 80;
let autoVariationCounter = 0;

export function generateAutoSchedule(
  matrixData: SubjectAllocationRow[],
  classTeachers: Record<number, string> = {},
  academicYear: string = '2027',
  variationSeed?: number
): { grid: ScheduleGrid; clashes: TimetableClash[]; unplaced: string[] } {
  const effectiveVariationSeed = variationSeed !== undefined ? variationSeed : autoVariationCounter++;
  const cleanMatrix: SubjectAllocationRow[] = JSON.parse(JSON.stringify(matrixData));
  const prevSig = getPreviousScheduleSignature();

  let bestCandidate: {
    grid: ScheduleGrid;
    clashes: TimetableClash[];
    unplaced: string[];
    audit: ScheduleAuditReport;
    score: number;
  } | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const seed = effectiveVariationSeed * 9973 + attempt * 613;
    const candidate = runSingleScheduleAttempt(cleanMatrix, classTeachers, academicYear, seed);
    const score = scoreCandidateAttempt(candidate, prevSig);

    // Zero unplaced and zero clashes strictly outrank candidates with any unplaced periods
    const candidateCleanCount = candidate.unplaced.length === 0 ? 1 : 0;
    const bestCleanCount = bestCandidate && bestCandidate.unplaced.length === 0 ? 1 : 0;
    if (
      !bestCandidate ||
      candidateCleanCount > bestCleanCount ||
      (candidateCleanCount === bestCleanCount &&
        (candidate.unplaced.length < bestCandidate.unplaced.length ||
          (candidate.unplaced.length === bestCandidate.unplaced.length && score > bestCandidate.score)))
    ) {
      bestCandidate = { ...candidate, score };
    }

    // Early exit ONLY if we've explored >= 12 varied attempts AND found an ultra-clean compact & balanced solution
    const distinctY1W4 = new Set(
      DAYS_OF_WEEK.map((d) => candidate.grid[1]?.[d]?.['W4']?.teacherCode?.trim() || '').filter(Boolean)
    ).size;
    if (
      attempt >= 12 &&
      candidate.unplaced.length === 0 &&
      candidate.clashes.length === 0 &&
      candidate.audit.isValidWorkload &&
      candidate.audit.pmPaiBlockViolations === 0 &&
      candidate.audit.pmPaiCrossRecessCount === 0 &&
      candidate.audit.tahap2SubjectCapViolations === 0 &&
      candidate.audit.subjectDailyPeriodCapViolations === 0 &&
      candidate.audit.fragmentedSubjectViolations === 0 &&
      candidate.audit.tahap1Over5Days === 0 &&
      candidate.audit.tahap1SubjectExcessDays <= 4 &&
      candidate.audit.middleGaps === 0 &&
      candidate.audit.totalDaysOver7 === 0 &&
      candidate.audit.spreadPenalty < 1500 &&
      distinctY1W4 >= 4
    ) {
      if (!prevSig || score >= 32_800_000) {
        break;
      }
    }
  }

  const chosen = bestCandidate!;
  const sanitizedGrid: ScheduleGrid = JSON.parse(JSON.stringify(chosen.grid));

  return {
    grid: sanitizedGrid,
    clashes: chosen.clashes,
    unplaced: chosen.unplaced,
  };
}
