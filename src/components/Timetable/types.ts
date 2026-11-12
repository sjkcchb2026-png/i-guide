/**
 * iSEPADU AI — Timetable & Scheduling System Types
 * Unified Single Source of Truth for 2027 Dual-Track Timetable
 */

export type DayOfWeek = 'ISNIN' | 'SELASA' | 'RABU' | 'KHAMIS' | 'JUMAAT';
export const DAYS_OF_WEEK: DayOfWeek[] = ['ISNIN', 'SELASA', 'RABU', 'KHAMIS', 'JUMAAT'];

export interface SlotTimeInfo {
  slotId: string;       // e.g. 'W1', 'W2', 'PKAR', 'REHAT'
  label: string;        // e.g. 'Waktu 1', 'PKAR (15m)', 'REHAT'
  startTime: string;    // '07:30'
  endTime: string;      // '08:00'
  startMinutes: number; // minutes from 00:00 (e.g. 7*60 + 30 = 450)
  endMinutes: number;   // minutes from 00:00 (e.g. 8*60 = 480)
  isRecess?: boolean;
  isSpecialLocked?: boolean; // e.g. PKAR or Perhimpunan
}

export interface TimetableCell {
  subjectId: string;    // e.g. 'bc', 'bm', 'pn', 'pkar', etc.
  subjectCode: string;  // e.g. 'BC', 'BM', 'PN', 'PKAR'
  subjectName: string;  // e.g. 'BAHASA CINA'
  teacherCode: string;  // e.g. 'GB' or '1' or 'NCY/VY'
  secondaryTeacherCode?: string; // Guru 2 (Guru Bersama / Co-Teacher)
  isCoTeaching?: boolean; // Flagged for team teaching
  teacherName?: string; // e.g. 'GURU BESAR'
  periodLength?: number;// 1 (30m) or 0.5 (15m for PKAR) or 2 (60m)
  isLocked?: boolean;   // Monday W1 PN or daily 09:30 PKAR
  hasClash?: boolean;   // flagged if teacher double-booked across grades
  clashDetails?: string;
}

// Full timetable store: [grade: 1-6][day: DayOfWeek][slotId: string] => TimetableCell
export type ScheduleGrid = Record<number, Record<DayOfWeek, Record<string, TimetableCell | null>>>;

export interface TimetableClash {
  teacherCode: string;
  day: DayOfWeek;
  gradeA: number;
  slotA: string;
  timeA: string;
  gradeB: number;
  slotB: string;
  timeB: string;
  message: string;
}

/**
 * Returns slot timing list for a given grade on a specific day
 */
export function getGradeDaySlots(grade: number, day: DayOfWeek): SlotTimeInfo[] {
  const isT1 = grade === 1;
  const isFriday = day === 'JUMAAT';

  if (isT1) {
    // T1 KP2027 Schedule (07:30 to 12:45 Mon-Thu, to 12:15 Fri)
    const morningSlots: SlotTimeInfo[] = [
      { slotId: 'W1', label: 'W1', startTime: '07:30', endTime: '08:00', startMinutes: 450, endMinutes: 480 },
      { slotId: 'W2', label: 'W2', startTime: '08:00', endTime: '08:30', startMinutes: 480, endMinutes: 510 },
      { slotId: 'W3', label: 'W3', startTime: '08:30', endTime: '09:00', startMinutes: 510, endMinutes: 540 },
      { slotId: 'W4', label: 'W4', startTime: '09:00', endTime: '09:30', startMinutes: 540, endMinutes: 570 },
      { slotId: 'PKAR', label: 'PKAR', startTime: '09:30', endTime: '09:45', startMinutes: 570, endMinutes: 585, isSpecialLocked: true },
      { slotId: 'REHAT', label: 'REHAT', startTime: '09:45', endTime: '10:15', startMinutes: 585, endMinutes: 615, isRecess: true },
      { slotId: 'W5', label: 'W5', startTime: '10:15', endTime: '10:45', startMinutes: 615, endMinutes: 645 },
      { slotId: 'W6', label: 'W6', startTime: '10:45', endTime: '11:15', startMinutes: 645, endMinutes: 675 },
      { slotId: 'W7', label: 'W7', startTime: '11:15', endTime: '11:45', startMinutes: 675, endMinutes: 705 },
      { slotId: 'W8', label: 'W8', startTime: '11:45', endTime: '12:15', startMinutes: 705, endMinutes: 735 },
    ];

    if (!isFriday) {
      morningSlots.push({
        slotId: 'W9', label: 'W9', startTime: '12:15', endTime: '12:45', startMinutes: 735, endMinutes: 765
      });
    }

    return morningSlots;
  } else {
    // T2-T6 KSSR Semakan Schedule (07:15 to 13:15 Mon/Tue, 12:45 Wed/Thu, 12:15 Fri)
    const slots: SlotTimeInfo[] = [
      { slotId: 'W1', label: 'W1', startTime: '07:15', endTime: '07:45', startMinutes: 435, endMinutes: 465 },
      { slotId: 'W2', label: 'W2', startTime: '07:45', endTime: '08:15', startMinutes: 465, endMinutes: 495 },
      { slotId: 'W3', label: 'W3', startTime: '08:15', endTime: '08:45', startMinutes: 495, endMinutes: 525 },
      { slotId: 'W4', label: 'W4', startTime: '08:45', endTime: '09:15', startMinutes: 525, endMinutes: 555 },
      { slotId: 'W5', label: 'W5', startTime: '09:15', endTime: '09:45', startMinutes: 555, endMinutes: 585 },
      { slotId: 'REHAT', label: 'REHAT', startTime: '09:45', endTime: '10:15', startMinutes: 585, endMinutes: 615, isRecess: true },
      { slotId: 'W6', label: 'W6', startTime: '10:15', endTime: '10:45', startMinutes: 615, endMinutes: 645 },
      { slotId: 'W7', label: 'W7', startTime: '10:45', endTime: '11:15', startMinutes: 645, endMinutes: 675 },
      { slotId: 'W8', label: 'W8', startTime: '11:15', endTime: '11:45', startMinutes: 675, endMinutes: 705 },
    ];

    if (isFriday) {
      // Friday ends at W8 (12:15)
      return slots;
    }

    // Mon-Thu includes W9 (11:45 - 12:15) and W10 (12:15 - 12:45)
    slots.push(
      { slotId: 'W9', label: 'W9', startTime: '11:45', endTime: '12:15', startMinutes: 705, endMinutes: 735 },
      { slotId: 'W10', label: 'W10', startTime: '12:15', endTime: '12:45', startMinutes: 735, endMinutes: 765 }
    );

    // Mon & Tue include W11 (12:45 - 13:15)
    if (day === 'ISNIN' || day === 'SELASA') {
      slots.push({
        slotId: 'W11', label: 'W11', startTime: '12:45', endTime: '13:15', startMinutes: 765, endMinutes: 795
      });
    }

    return slots;
  }
}

/**
 * Checks whether two time intervals overlap in real minutes
 */
export function checkIntervalOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}
