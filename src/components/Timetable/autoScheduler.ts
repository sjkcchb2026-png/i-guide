/**
 * iSEPADU AI — Auto-Scheduling Engine for 2027 Dual-Track Timetable
 * Implements strict KPM pedagogical constraints, block splitting, day-pairing,
 * and minute-level collision detection.
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

export interface SubjectDayRequirement {
  rowId: string;
  subjectCode: string;
  subjectName: string;
  teacherCode: string;
  teacherName?: string;
  grade: number;
  blockLengths: number[]; // e.g. [2, 2, 2, 2, 2] for 10 periods
}

/**
 * Decomposes a subject's weekly period count into blocks according to KPM distribution rules
 */
export function getSubjectBlockDistribution(subjectCode: string, totalPeriods: number): number[] {
  if (totalPeriods <= 0) return [];

  // Special rule for PJ in KP2027 (3 periods -> 3 separate 1-period days: 1 + 1 + 1)
  if (subjectCode.toUpperCase() === 'PJ' && totalPeriods === 3) {
    return [1, 1, 1];
  }

  switch (totalPeriods) {
    case 1:
      return [1];
    case 2:
      return [2];
    case 3:
      return [2, 1];
    case 4:
      return [2, 2];
    case 5:
      return [2, 2, 1];
    case 6:
      return [2, 2, 2];
    case 7:
      return [2, 2, 2, 1];
    case 8:
      return [2, 2, 2, 2];
    case 9:
      return [2, 2, 2, 2, 1];
    case 10:
      return [2, 2, 2, 2, 2];
    case 11:
      return [3, 2, 2, 2, 2]; // (2+1) + 2 + 2 + 2 + 2
    case 12:
      return [2, 3, 2, 3, 2]; // 2 + (2+1) + 2 + (2+1) + 2
    default: {
      // General fallback if custom period count
      const blocks: number[] = [];
      let rem = totalPeriods;
      while (rem > 0) {
        if (rem >= 2) {
          blocks.push(2);
          rem -= 2;
        } else {
          blocks.push(1);
          rem -= 1;
        }
      }
      return blocks;
    }
  }
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
        grid[grade][day][s.slotId] = null;
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

    // Check all pairs for same teacher overlapping
    for (let i = 0; i < dayAssignments.length; i++) {
      for (let j = i + 1; j < dayAssignments.length; j++) {
        const a = dayAssignments[i];
        const b = dayAssignments[j];
        // Whitelist: PN and TASMIK (Gabung Kelas) are intentionally concurrent
        if (a.subjectCode === 'PN' || b.subjectCode === 'PN') continue;
        if ((a.subjectCode === 'TASMIK' || a.subjectCode === 'TAS') && (b.subjectCode === 'TASMIK' || b.subjectCode === 'TAS')) continue;

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

/**
 * High-performance heuristic Auto-Scheduler engine
 */
export function generateAutoSchedule(
  matrixData: SubjectAllocationRow[],
  classTeachers: Record<number, string> = {},
  academicYear: string = '2027'
): { grid: ScheduleGrid; clashes: TimetableClash[]; unplaced: string[] } {
  const grid = createEmptyScheduleGrid();
  const unplaced: string[] = [];

  // Deep clone matrixData to prevent mutating shared references across calls
  const cleanMatrix: SubjectAllocationRow[] = JSON.parse(JSON.stringify(matrixData));

  // Helper to check if a grade uses KP2027
  const isKP = (g: number) => {
    const yr = parseInt(academicYear, 10) || 2027;
    if (yr < 2027) return false;
    return g <= yr - 2026;
  };

  // 1. PLACE MANDATORY LOCKED SLOTS
  // (a) Perhimpunan (PN): Tuesday (SELASA) W1 for all grades 1 to 6
  [1, 2, 3, 4, 5, 6].forEach((grade) => {
    const pnRow = cleanMatrix.find((r) => r.subjectCode.toUpperCase() === 'PN');
    const teacher = pnRow?.teachers[grade] || classTeachers[grade] || '';
    grid[grade]['SELASA']['W1'] = {
      subjectId: 'pn',
      subjectCode: 'PN',
      subjectName: 'PERHIMPUNAN',
      teacherCode: teacher,
      isLocked: true,
      periodLength: 1,
    };
  });

  // (b) Program Pembentukan Karakter (PKAR): Daily 09:30-09:45 for KP2027 classes (PKAR_1 to PKAR_5)
  [1, 2, 3, 4, 5, 6].forEach((grade) => {
    if (isKP(grade)) {
      const dayCodes: Record<DayOfWeek, string> = {
        'ISNIN': 'PKAR_1',
        'SELASA': 'PKAR_2',
        'RABU': 'PKAR_3',
        'KHAMIS': 'PKAR_4',
        'JUMAAT': 'PKAR_5',
      };

      DAYS_OF_WEEK.forEach((day) => {
        const subCode = dayCodes[day];
        const dayRow = cleanMatrix.find((r) => r.subjectCode.toUpperCase() === subCode);
        const legacyRow = cleanMatrix.find((r) => r.subjectCode.toUpperCase() === 'PKAR');
        const teacher = dayRow?.teachers[grade] || legacyRow?.teachers[grade] || classTeachers[grade] || '';

        grid[grade][day]['PKAR'] = {
          subjectId: subCode.toLowerCase(),
          subjectCode: subCode,
          subjectName: `PROGRAM PEMBENTUKAN KARAKTER (${day})`,
          teacherCode: teacher,
          isLocked: true,
          periodLength: 0.5,
        };
      });
    }
  });

  // 2. PREPARE REQUIREMENTS TO SCHEDULE PER GRADE
  // Sort subjects by priority: paired subjects first (PSV+MZ, PJ+PK), then high period subjects (BC, BM, MT)
  [1, 2, 3, 4, 5, 6].forEach((grade) => {
    const subjectList: Array<{
      row: SubjectAllocationRow;
      periods: number;
      teacherCode: string;
      secondaryTeacherCode?: string;
      blocks: number[];
    }> = [];

    cleanMatrix.forEach((row) => {
      // PN and PKAR already scheduled
      if (row.subjectCode.toUpperCase() === 'PN' || row.subjectCode.toUpperCase().startsWith('PKAR')) {
        return;
      }

      const pCount = Number(row.periods[grade] || 0);
      if (pCount > 0) {
        const blocks = getSubjectBlockDistribution(row.subjectCode, pCount);
        const t1 = row.teachers[grade] || '';
        const t2 = row.secondaryTeachers?.[grade] || '';
        const isAm = row.subjectCode.toUpperCase() === 'AM';
        const combinedCode = isAm && t2 ? `${t1}/${t2}` : t1;

        subjectList.push({
          row,
          periods: pCount,
          teacherCode: combinedCode,
          secondaryTeacherCode: t2,
          blocks,
        });
      }
    });

    // Check paired subjects for this grade
    const mzIndex = subjectList.findIndex((s) => s.row.subjectCode.toUpperCase() === 'MZ');
    const psvIndex = subjectList.findIndex((s) => s.row.subjectCode.toUpperCase() === 'PSV');
    const pjIndex = subjectList.findIndex((s) => s.row.subjectCode.toUpperCase() === 'PJ');
    const pkIndex = subjectList.findIndex((s) => s.row.subjectCode.toUpperCase() === 'PK');

    // Rule: Parallel Binding for PM & PAI (Waktu Serentak PM / PAI)
    const pmSub = subjectList.find((s) => s.row.subjectCode.toUpperCase() === 'PM');
    const paiSub = subjectList.find((s) => s.row.subjectCode.toUpperCase() === 'PAI');
    if (pmSub && paiSub) {
      // Merge into parallel PM/PAI block
      pmSub.row.subjectCode = 'PM/PAI';
      pmSub.row.subjectName = 'PENDIDIKAN MORAL / ISLAM';
      if (paiSub.teacherCode && pmSub.teacherCode !== paiSub.teacherCode) {
        pmSub.teacherCode = `${pmSub.teacherCode}/${paiSub.teacherCode}`;
      }
      // Remove separate PAI so it does not take double slots in class grid
      const paiIndex = subjectList.findIndex((s) => s.row.subjectCode.toUpperCase() === 'PAI');
      if (paiIndex !== -1) {
        subjectList.splice(paiIndex, 1);
      }
    }

    // Identify days assigned for paired subjects
    // Rule: MZ and PSV must be on the same day
    let pairedArtDay: DayOfWeek = 'RABU';
    // Rule: PK must be on the same day as one of the PJ sessions
    let pairedPjPkDay: DayOfWeek = 'KHAMIS';

    // Place blocks for each subject across the 5 days
    subjectList.forEach((sub) => {
      const code = sub.row.subjectCode.toUpperCase();
      const blocks = sub.blocks; // e.g. [2, 2, 2, 2, 2]

      // Decide target days for this subject's blocks
      let targetDays: DayOfWeek[] = [];

      if (code === 'MZ' || code === 'PSV') {
        targetDays = [pairedArtDay];
      } else if (code === 'PK') {
        targetDays = [pairedPjPkDay];
      } else if (code === 'PJ') {
        if (blocks.length >= 3) {
          // Triplet pattern: ISNIN, RABU, JUMAAT (1, 3, 5) or ISNIN, SELASA, KHAMIS (1, 2, 4)
          targetDays = ['ISNIN', 'RABU', 'JUMAAT'];
        } else {
          targetDays = [pairedPjPkDay];
        }
      } else if (code === 'AM') {
        targetDays = ['ISNIN', 'RABU', 'KHAMIS'];
      } else if (code === 'TASMIK' || code === 'TAS') {
        // Tasmik 2 periods: Pick 2 days from Wednesday, Thursday, Friday
        targetDays = ['RABU', 'KHAMIS'];
      } else if (code === 'PM/PAI' || code === 'PM' || code === 'PAI') {
        targetDays = ['ISNIN', 'SELASA', 'KHAMIS', 'JUMAAT'];
      } else if (blocks.length === 5) {
        targetDays = ['ISNIN', 'SELASA', 'RABU', 'KHAMIS', 'JUMAAT'];
      } else if (blocks.length === 4) {
        targetDays = ['ISNIN', 'SELASA', 'RABU', 'KHAMIS'];
      } else if (blocks.length === 3) {
        targetDays = ['ISNIN', 'RABU', 'JUMAAT'];
      } else if (blocks.length === 2) {
        targetDays = ['SELASA', 'KHAMIS'];
      } else {
        targetDays = ['RABU'];
      }

      // Schedule each block into target day
      blocks.forEach((blockLen, bIdx) => {
        const day = targetDays[bIdx % targetDays.length];
        const slots = getGradeDaySlots(grade, day).filter((s) => !s.isRecess && s.slotId !== 'PKAR');

        // Find consecutive empty slots in this day with no teacher collision
        let placed = false;

        // Try slot indices from start to end
        for (let sIdx = 0; sIdx <= slots.length - blockLen; sIdx++) {
          const candidateSlots = slots.slice(sIdx, sIdx + blockLen);

          // 1. Check if all candidate slots are free
          const allFree = candidateSlots.every((s) => grid[grade][day][s.slotId] === null);
          if (!allFree) continue;

          // 2. Check teacher collision across all grades for all candidate slots
          const teacher = sub.teacherCode;
          let teacherHasCollision = false;

          const currentTeachers = teacher.split('/').map((c) => c.trim()).filter(Boolean);

          if (currentTeachers.length > 0) {
            for (const cand of candidateSlots) {
              // Check against existing assignments in other grades
              for (const otherGrade of [1, 2, 3, 4, 5, 6]) {
                if (otherGrade === grade) continue;
                const otherSlots = getGradeDaySlots(otherGrade, day);
                for (const os of otherSlots) {
                  if (os.isRecess) continue;
                  const otherCell = grid[otherGrade][day][os.slotId];
                  if (otherCell && otherCell.teacherCode) {
                    const otherTeachers = otherCell.teacherCode.split('/').map((c) => c.trim()).filter(Boolean);

                    // TASMIK is a combined class (gabung kelas) across grades after school
                    if (
                      (code === 'TASMIK' || code === 'TAS') &&
                      (otherCell.subjectCode.toUpperCase() === 'TASMIK' || otherCell.subjectCode.toUpperCase() === 'TAS')
                    ) {
                      continue;
                    }

                    const sharesTeacher = currentTeachers.some((ct) => otherTeachers.includes(ct));
                    if (sharesTeacher) {
                      if (checkIntervalOverlap(cand.startMinutes, cand.endMinutes, os.startMinutes, os.endMinutes)) {
                        teacherHasCollision = true;
                        break;
                      }
                    }
                  }
                }
                if (teacherHasCollision) break;
              }
              if (teacherHasCollision) break;
            }
          }

          if (teacherHasCollision) continue;

          // 3. Place block in these candidate slots
          candidateSlots.forEach((cs) => {
            const isAm = sub.row.subjectCode.toUpperCase() === 'AM';
            grid[grade][day][cs.slotId] = {
              subjectId: sub.row.id,
              subjectCode: sub.row.subjectCode,
              subjectName: isAm && sub.secondaryTeacherCode ? 'ALAM DAN MANUSIA (CO-TEACHING)' : sub.row.subjectName,
              teacherCode: sub.teacherCode,
              secondaryTeacherCode: sub.secondaryTeacherCode,
              isCoTeaching: isAm && Boolean(sub.secondaryTeacherCode),
              periodLength: 1,
            };
          });

          placed = true;
          break;
        }

        if (!placed) {
          // Fallback: search any slot in any available day
          for (const altDay of DAYS_OF_WEEK) {
            const altSlots = getGradeDaySlots(grade, altDay).filter((s) => !s.isRecess && s.slotId !== 'PKAR');
            for (let sIdx = 0; sIdx <= altSlots.length - blockLen; sIdx++) {
              const candidateSlots = altSlots.slice(sIdx, sIdx + blockLen);
              const allFree = candidateSlots.every((s) => grid[grade][altDay][s.slotId] === null);
              if (!allFree) continue;

              candidateSlots.forEach((cs) => {
                const isAm = sub.row.subjectCode.toUpperCase() === 'AM';
                grid[grade][altDay][cs.slotId] = {
                  subjectId: sub.row.id,
                  subjectCode: sub.row.subjectCode,
                  subjectName: isAm && sub.secondaryTeacherCode ? 'ALAM DAN MANUSIA (CO-TEACHING)' : sub.row.subjectName,
                  teacherCode: sub.teacherCode,
                  secondaryTeacherCode: sub.secondaryTeacherCode,
                  isCoTeaching: isAm && Boolean(sub.secondaryTeacherCode),
                  periodLength: 1,
                };
              });

              placed = true;
              break;
            }
            if (placed) break;
          }
        }

        if (!placed) {
          unplaced.push(`T.${grade} ${sub.row.subjectCode} (${blockLen} waktu)`);
        }
      });
    });
  });

  const clashes = detectScheduleClashes(grid);

  return { grid, clashes, unplaced };
}
