/**
 * iSEPADU AI — Unscheduled Lessons Audit & Real-Time Drag-and-Drop Collision Radar
 * Compares curriculum matrix allocation against the active ScheduleGrid,
 * surfaces missing periods in a sticky Holding Dock, and computes minute-level
 * collision & <= 8.0 daily workload radar status for every target cell.
 */

import { SubjectAllocationRow } from './SchoolTimetableMatrix';
import {
  DayOfWeek,
  DAYS_OF_WEEK,
  ScheduleGrid,
  TimetableCell,
  checkIntervalOverlap,
  getGradeDaySlots,
} from './types';
import { auditScheduleWorkload, autoPairPKARInGrid } from './autoScheduler';

export interface UnscheduledLessonCard {
  id: string;
  grade: number;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  teacherCode: string;
  secondaryTeacherCode?: string;
  isCoTeaching?: boolean;
  unitIndex: number;
  totalMissing: number;
}

export interface DragLessonCandidate {
  grade: number;
  subjectId?: string;
  subjectCode: string;
  subjectName?: string;
  teacherCode: string;
  secondaryTeacherCode?: string;
  isCoTeaching?: boolean;
  fromSlot?: {
    grade: number;
    day: DayOfWeek;
    slotId: string;
  };
  dockCardId?: string;
}

export interface SlotRadarStatus {
  valid: boolean;
  differentGrade?: boolean;
  locked?: boolean;
  hasTeacherClash: boolean;
  workloadExceeded: boolean;
  clashLabel?: string;
  reason?: string;
}

interface ExpectedSubjectSpec {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  expected: number;
  teacherCode: string;
  secondaryTeacherCode?: string;
  isCoTeaching?: boolean;
}

/**
 * Audits `matrixData` against `schedule` across Tahun 1..6 and emits
 * individual 1-period `UnscheduledLessonCard` items for every missing regular period.
 */
export function computeUnscheduledLessons(
  matrixData: SubjectAllocationRow[],
  schedule: ScheduleGrid,
  academicYear: string = '2027'
): UnscheduledLessonCard[] {
  const cards: UnscheduledLessonCard[] = [];
  if (!Array.isArray(matrixData) || matrixData.length === 0) return cards;

  const pmRow = matrixData.find((r) => (r.subjectCode || '').toUpperCase() === 'PM');
  const paiRow = matrixData.find((r) => (r.subjectCode || '').toUpperCase() === 'PAI');
  const amRow = matrixData.find((r) => (r.subjectCode || '').toUpperCase() === 'AM');
  const handledCodes = new Set(['PN', 'PM', 'PAI', 'AM', 'TASMIK', 'TAS', 'MEMBACA']);

  for (let grade = 1; grade <= 6; grade++) {
    const expectedList: ExpectedSubjectSpec[] = [];

    // 1. PM / PAI (combined if both > 0, else individual)
    const pmPeriods = Number(pmRow?.periods?.[grade] || 0);
    const paiPeriods = Number(paiRow?.periods?.[grade] || 0);
    const pmTeacher = (pmRow?.teachers?.[grade] || '').trim();
    const paiTeacher = (paiRow?.teachers?.[grade] || '').trim();

    if (pmPeriods > 0 && paiPeriods > 0) {
      expectedList.push({
        subjectId: 'pm_pai',
        subjectCode: 'PM/PAI',
        subjectName: 'PENDIDIKAN MORAL / ISLAM',
        expected: Math.max(pmPeriods, paiPeriods),
        teacherCode: [pmTeacher, paiTeacher].filter(Boolean).join('/'),
      });
    } else if (pmPeriods > 0) {
      expectedList.push({
        subjectId: pmRow?.id || 'pm',
        subjectCode: 'PM',
        subjectName: pmRow?.subjectName || 'PENDIDIKAN MORAL',
        expected: pmPeriods,
        teacherCode: pmTeacher,
      });
    } else if (paiPeriods > 0) {
      expectedList.push({
        subjectId: paiRow?.id || 'pai',
        subjectCode: 'PAI',
        subjectName: paiRow?.subjectName || 'PENDIDIKAN ISLAM',
        expected: paiPeriods,
        teacherCode: paiTeacher,
      });
    }

    // 2. AM Co-Teaching
    const amPeriods = Number(amRow?.periods?.[grade] || 0);
    if (amPeriods > 0) {
      const t1 = (amRow?.teachers?.[grade] || '').trim();
      const t2 = (amRow?.secondaryTeachers?.[grade] || '').trim();
      expectedList.push({
        subjectId: amRow?.id || 'am',
        subjectCode: 'AM',
        subjectName: amRow?.subjectName || 'ALAM DAN MANUSIA',
        expected: amPeriods,
        teacherCode: [t1, t2].filter(Boolean).join('/'),
        secondaryTeacherCode: t2 || undefined,
        isCoTeaching: Boolean(t2),
      });
    }

    // 3. All remaining regular subjects
    for (const row of matrixData) {
      const code = (row.subjectCode || '').toUpperCase().trim();
      if (!code || handledCodes.has(code) || code.startsWith('PKAR')) continue;
      const count = Number(row.periods?.[grade] || 0);
      if (count <= 0) continue;

      const t1 = (row.teachers?.[grade] || '').trim();
      const t2 = (row.secondaryTeachers?.[grade] || '').trim();
      expectedList.push({
        subjectId: row.id || code.toLowerCase(),
        subjectCode: code,
        subjectName: row.subjectName || code,
        expected: count,
        teacherCode: [t1, t2].filter(Boolean).join('/'),
        secondaryTeacherCode: t2 || undefined,
        isCoTeaching: Boolean(t2),
      });
    }

    // Count actually scheduled regular slots for this grade
    const scheduledCounts = new Map<string, number>();
    for (const day of DAYS_OF_WEEK) {
      const slots = getGradeDaySlots(grade, day, academicYear);
      for (const s of slots) {
        if (s.isRecess || s.slotId === 'PKAR' || s.slotId === 'MEMBACA' || s.slotId === 'TASMIK') {
          continue;
        }
        const cell = schedule[grade]?.[day]?.[s.slotId];
        if (!cell || !cell.subjectCode) continue;
        const code = cell.subjectCode.toUpperCase().trim();
        if (!code || code === 'PN' || code === 'MEMBACA' || code === 'TASMIK' || code.startsWith('PKAR')) {
          continue;
        }
        scheduledCounts.set(code, (scheduledCounts.get(code) || 0) + 1);
      }
    }

    // Emit missing cards
    for (const spec of expectedList) {
      const actual = scheduledCounts.get(spec.subjectCode) || 0;
      const missing = Math.max(0, spec.expected - actual);
      for (let i = 1; i <= missing; i++) {
        cards.push({
          id: `dock_g${grade}_${spec.subjectCode}_${i}`,
          grade,
          subjectId: spec.subjectId,
          subjectCode: spec.subjectCode,
          subjectName: spec.subjectName,
          teacherCode: spec.teacherCode,
          secondaryTeacherCode: spec.secondaryTeacherCode,
          isCoTeaching: spec.isCoTeaching,
          unitIndex: i,
          totalMissing: missing,
        });
      }
    }
  }

  return cards;
}

/**
 * Creates a shallow-cloned ScheduleGrid where only the specified days are cloned cleanly
 * for fast drag-hover simulation.
 */
function cloneGridForDays(grid: ScheduleGrid, days: DayOfWeek[]): ScheduleGrid {
  const daySet = new Set<DayOfWeek>(days);
  const copy: ScheduleGrid = {};
  for (let g = 1; g <= 6; g++) {
    copy[g] = {} as any;
    for (const d of DAYS_OF_WEEK) {
      if (daySet.has(d)) {
        copy[g][d] = { ...(grid[g]?.[d] || {}) };
      } else {
        copy[g][d] = grid[g]?.[d] || {};
      }
    }
  }
  return copy;
}

function findMinuteLevelClash(
  grid: ScheduleGrid,
  grade: number,
  day: DayOfWeek,
  slotId: string,
  subjectCode: string,
  teacherCode: string,
  academicYear: string
): string | null {
  const sCode = (subjectCode || '').toUpperCase();
  if (sCode === 'PN' || slotId === 'MEMBACA') return null;

  const teachers = (teacherCode || '')
    .split('/')
    .map((c) => c.trim())
    .filter(Boolean);
  if (teachers.length === 0) return null;

  const targetSlot = getGradeDaySlots(grade, day, academicYear).find((s) => s.slotId === slotId);
  if (!targetSlot || targetSlot.isRecess) return null;

  for (let otherGrade = 1; otherGrade <= 6; otherGrade++) {
    if (otherGrade === grade) continue;
    const otherSlots = getGradeDaySlots(otherGrade, day, academicYear);
    for (const os of otherSlots) {
      if (os.isRecess || os.slotId === 'MEMBACA') continue;
      const otherCell = grid[otherGrade]?.[day]?.[os.slotId];
      if (!otherCell || !otherCell.teacherCode) continue;

      const otherSub = (otherCell.subjectCode || '').toUpperCase();
      if (otherSub === 'PN') continue;
      if (
        (slotId === 'TASMIK' || sCode === 'TASMIK') &&
        (os.slotId === 'TASMIK' || otherSub === 'TASMIK')
      ) {
        continue;
      }

      if (!checkIntervalOverlap(targetSlot.startMinutes, targetSlot.endMinutes, os.startMinutes, os.endMinutes)) {
        continue;
      }

      const otherTeachers = otherCell.teacherCode
        .split('/')
        .map((c) => c.trim())
        .filter(Boolean);
      const clashTeacher = teachers.find((t) => otherTeachers.includes(t));
      if (clashTeacher) {
        return `Bertembung (${clashTeacher}): Tahun ${otherGrade} ${otherCell.subjectCode} (${os.startTime}-${os.endTime})`;
      }
    }
  }

  return null;
}

/**
 * Evaluates whether dropping `candidate` into `(targetGrade, targetDay, targetSlotId)`
 * is collision-free and respects the absolute 8.0 periods/day teacher hard cap (incl. PKAR +0.5).
 */
export function evaluateSlotDropRadar(
  grid: ScheduleGrid,
  candidate: DragLessonCandidate,
  targetGrade: number,
  targetDay: DayOfWeek,
  targetSlotId: string,
  academicYear: string = '2027',
  extraTeachers: string[] = []
): SlotRadarStatus {
  if (
    targetSlotId === 'REHAT' ||
    targetSlotId === 'PKAR' ||
    (targetDay === 'SELASA' && targetSlotId === 'W1')
  ) {
    return {
      valid: false,
      locked: true,
      hasTeacherClash: false,
      workloadExceeded: false,
      reason: 'Slot dikunci (REHAT / PN / PKAR)',
    };
  }

  // Holding dock cards belong strictly to their class level
  if (!candidate.fromSlot && candidate.grade !== targetGrade) {
    return {
      valid: false,
      differentGrade: true,
      hasTeacherClash: false,
      workloadExceeded: false,
      reason: `Subjek ini diperuntukkan bagi Tahun ${candidate.grade}`,
    };
  }

  const targetSlot = getGradeDaySlots(targetGrade, targetDay, academicYear).find(
    (s) => s.slotId === targetSlotId
  );
  if (!targetSlot || targetSlot.isRecess) {
    return {
      valid: false,
      locked: true,
      hasTeacherClash: false,
      workloadExceeded: false,
      reason: 'Slot tidak aktif bagi kelas ini',
    };
  }

  if (targetSlotId === 'MEMBACA' && targetGrade !== 1) {
    return {
      valid: false,
      locked: true,
      hasTeacherClash: false,
      workloadExceeded: false,
      reason: 'Program Membaca hanya untuk Tahun 1',
    };
  }

  // Same slot noop
  if (
    candidate.fromSlot &&
    candidate.fromSlot.grade === targetGrade &&
    candidate.fromSlot.day === targetDay &&
    candidate.fromSlot.slotId === targetSlotId
  ) {
    return {
      valid: true,
      hasTeacherClash: false,
      workloadExceeded: false,
    };
  }

  const affectedDays: DayOfWeek[] = candidate.fromSlot
    ? Array.from(new Set([candidate.fromSlot.day, targetDay]))
    : [targetDay];
  const simGrid = cloneGridForDays(grid, affectedDays);

  const existingTargetCell = simGrid[targetGrade]?.[targetDay]?.[targetSlotId] || null;
  let movedCell: TimetableCell;

  if (candidate.fromSlot) {
    const srcCell = simGrid[candidate.fromSlot.grade]?.[candidate.fromSlot.day]?.[candidate.fromSlot.slotId];
    movedCell = srcCell
      ? { ...srcCell }
      : {
          subjectId: candidate.subjectId || candidate.subjectCode.toLowerCase(),
          subjectCode: candidate.subjectCode,
          subjectName: candidate.subjectName || candidate.subjectCode,
          teacherCode: candidate.teacherCode,
          secondaryTeacherCode: candidate.secondaryTeacherCode,
          isCoTeaching: candidate.isCoTeaching,
          periodLength: targetSlotId === 'MEMBACA' ? 0.5 : 1,
        };
    simGrid[candidate.fromSlot.grade][candidate.fromSlot.day][candidate.fromSlot.slotId] = existingTargetCell;
  } else {
    movedCell = {
      subjectId: candidate.subjectId || candidate.subjectCode.toLowerCase(),
      subjectCode: candidate.subjectCode,
      subjectName: candidate.subjectName || candidate.subjectCode,
      teacherCode: candidate.teacherCode,
      secondaryTeacherCode: candidate.secondaryTeacherCode,
      isCoTeaching: candidate.isCoTeaching,
      periodLength: targetSlotId === 'MEMBACA' ? 0.5 : 1,
      isManualSlot: targetSlotId === 'TASMIK' || targetSlotId === 'MEMBACA',
    };
  }

  simGrid[targetGrade][targetDay][targetSlotId] = movedCell;
  autoPairPKARInGrid(simGrid, academicYear);

  // 1. Check minute-level clash at destination
  const targetClash = findMinuteLevelClash(
    simGrid,
    targetGrade,
    targetDay,
    targetSlotId,
    movedCell.subjectCode,
    movedCell.teacherCode,
    academicYear
  );
  if (targetClash) {
    return {
      valid: false,
      hasTeacherClash: true,
      workloadExceeded: false,
      clashLabel: targetClash,
      reason: targetClash,
    };
  }

  // 2. If grid->grid swap displaced existingTargetCell back to fromSlot, check clash at fromSlot too
  if (candidate.fromSlot && existingTargetCell) {
    const srcClash = findMinuteLevelClash(
      simGrid,
      candidate.fromSlot.grade,
      candidate.fromSlot.day,
      candidate.fromSlot.slotId,
      existingTargetCell.subjectCode,
      existingTargetCell.teacherCode,
      academicYear
    );
    if (srcClash) {
      return {
        valid: false,
        hasTeacherClash: true,
        workloadExceeded: false,
        clashLabel: `Tukar ganti bertembung: ${srcClash}`,
        reason: `Tukar ganti bertembung: ${srcClash}`,
      };
    }
  }

  // 3. Check <= 8.0 daily hard cap for affected teachers (incl. Year 1 W4 +0.5 PKAR)
  const affectedTeachers = new Set<string>(extraTeachers);
  [movedCell.teacherCode, existingTargetCell?.teacherCode]
    .filter(Boolean)
    .forEach((tc) =>
      String(tc)
        .split('/')
        .map((c) => c.trim())
        .filter(Boolean)
        .forEach((c) => affectedTeachers.add(c))
    );

  const report = auditScheduleWorkload(simGrid, Array.from(affectedTeachers), academicYear);
  for (const tCode of affectedTeachers) {
    const summary = report.teachers[tCode];
    if (!summary) continue;
    for (const d of affectedDays) {
      const load = summary.daily[d] || 0;
      if (load > 8.0 + 1e-6) {
        const msg = `Had 8w/hari dilanggar: Guru [${tCode}] = ${load}w pada ${d}`;
        return {
          valid: false,
          hasTeacherClash: false,
          workloadExceeded: true,
          clashLabel: msg,
          reason: msg,
        };
      }
    }
  }

  return {
    valid: true,
    hasTeacherClash: false,
    workloadExceeded: false,
  };
}
