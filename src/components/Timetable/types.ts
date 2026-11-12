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
  isPemulihan?: boolean; // Flagged if Pemulihan (PBM / PMT) attaches to mainstream BM/MT
  pemulihanTeacherCode?: string;
  isManualSlot?: boolean;
  isAutoPKAR?: boolean;
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
 * Mon/Tue: 11 teaching periods (W1-W5, REHAT, W6-W11) + 1 Tasmik manual slot
 * Wed/Thu: 10 teaching periods (W1-W5, REHAT, W6-W10) + 1 Tasmik manual slot
 * Friday: 7 teaching periods (W1-W4, REHAT, W5-W7) + 1 Tasmik manual slot
 * Year 1 (Tahun 1): Includes dedicated 07:15 - 07:30 Program Membaca morning slot
 * PKAR: 15-minute slot immediately before Recess (auto-paired to pre-recess teacher)
 */
export function getGradeDaySlots(grade: number, day: DayOfWeek): SlotTimeInfo[] {
  const isT1 = grade === 1;
  const isFriday = day === 'JUMAAT';
  const isMonTue = day === 'ISNIN' || day === 'SELASA';

  const slots: SlotTimeInfo[] = [];

  // Year 1 (Tahun 1) dedicated 07:15 - 07:30 Program Membaca
  if (isT1) {
    slots.push({
      slotId: 'MEMBACA',
      label: 'Membaca',
      startTime: '07:15',
      endTime: '07:30',
      startMinutes: 435,
      endMinutes: 450,
      isSpecialLocked: true,
    });
  }

  if (isFriday) {
    // JUMAAT: Pre-recess 5 periods (W1 to W5), PKAR, REHAT
    // T1 - T3: 7 regular teaching periods (W1 to W7) + TASMIK (W8, 11:45-12:15)
    // T4 - T6: 8 regular teaching periods (W1 to W8) + TASMIK (W9, 12:15-12:45)
    const isUpperPrimary = grade >= 4;
    slots.push(
      { slotId: 'W1', label: 'W1', startTime: '07:30', endTime: '08:00', startMinutes: 450, endMinutes: 480 },
      { slotId: 'W2', label: 'W2', startTime: '08:00', endTime: '08:30', startMinutes: 480, endMinutes: 510 },
      { slotId: 'W3', label: 'W3', startTime: '08:30', endTime: '09:00', startMinutes: 510, endMinutes: 540 },
      { slotId: 'W4', label: 'W4', startTime: '09:00', endTime: '09:30', startMinutes: 540, endMinutes: 570 },
      { slotId: 'W5', label: 'W5', startTime: '09:30', endTime: '10:00', startMinutes: 570, endMinutes: 600 },
      { slotId: 'PKAR', label: 'PKAR', startTime: '10:00', endTime: '10:15', startMinutes: 600, endMinutes: 615, isSpecialLocked: true },
      { slotId: 'REHAT', label: 'REHAT', startTime: '10:15', endTime: '10:45', startMinutes: 615, endMinutes: 645, isRecess: true },
      { slotId: 'W6', label: 'W6', startTime: '10:45', endTime: '11:15', startMinutes: 645, endMinutes: 675 },
      { slotId: 'W7', label: 'W7', startTime: '11:15', endTime: '11:45', startMinutes: 675, endMinutes: 705 }
    );

    if (isUpperPrimary) {
      slots.push(
        { slotId: 'W8', label: 'W8', startTime: '11:45', endTime: '12:15', startMinutes: 705, endMinutes: 735 },
        { slotId: 'TASMIK', label: 'TASMIK', startTime: '12:15', endTime: '12:45', startMinutes: 735, endMinutes: 765, isSpecialLocked: true }
      );
    } else {
      slots.push(
        { slotId: 'TASMIK', label: 'TASMIK', startTime: '11:45', endTime: '12:15', startMinutes: 705, endMinutes: 735, isSpecialLocked: true }
      );
    }
  } else {
    // ISNIN - KHAMIS: Pre-recess 5 periods (W1 to W5)
    slots.push(
      { slotId: 'W1', label: 'W1', startTime: '07:30', endTime: '08:00', startMinutes: 450, endMinutes: 480 },
      { slotId: 'W2', label: 'W2', startTime: '08:00', endTime: '08:30', startMinutes: 480, endMinutes: 510 },
      { slotId: 'W3', label: 'W3', startTime: '08:30', endTime: '09:00', startMinutes: 510, endMinutes: 540 },
      { slotId: 'W4', label: 'W4', startTime: '09:00', endTime: '09:30', startMinutes: 540, endMinutes: 570 },
      { slotId: 'W5', label: 'W5', startTime: '09:30', endTime: '10:00', startMinutes: 570, endMinutes: 600 },
      { slotId: 'PKAR', label: 'PKAR', startTime: '10:00', endTime: '10:15', startMinutes: 600, endMinutes: 615, isSpecialLocked: true },
      { slotId: 'REHAT', label: 'REHAT', startTime: '10:15', endTime: '10:45', startMinutes: 615, endMinutes: 645, isRecess: true },
      { slotId: 'W6', label: 'W6', startTime: '10:45', endTime: '11:15', startMinutes: 645, endMinutes: 675 },
      { slotId: 'W7', label: 'W7', startTime: '11:15', endTime: '11:45', startMinutes: 675, endMinutes: 705 },
      { slotId: 'W8', label: 'W8', startTime: '11:45', endTime: '12:15', startMinutes: 705, endMinutes: 735 },
      { slotId: 'W9', label: 'W9', startTime: '12:15', endTime: '12:45', startMinutes: 735, endMinutes: 765 },
      { slotId: 'W10', label: 'W10', startTime: '12:45', endTime: '13:15', startMinutes: 765, endMinutes: 795 }
    );

    if (isMonTue) {
      // Mon/Tue: 11 teaching periods (W1 to W11) + Tasmik (W12)
      slots.push(
        { slotId: 'W11', label: 'W11', startTime: '13:15', endTime: '13:45', startMinutes: 795, endMinutes: 825 },
        { slotId: 'TASMIK', label: 'TASMIK', startTime: '13:45', endTime: '14:15', startMinutes: 825, endMinutes: 855, isSpecialLocked: true }
      );
    } else {
      // Wed/Thu: 10 teaching periods (W1 to W10) + Tasmik (W11)
      slots.push(
        { slotId: 'TASMIK', label: 'TASMIK', startTime: '13:15', endTime: '13:45', startMinutes: 795, endMinutes: 825, isSpecialLocked: true }
      );
    }
  }

  return slots;
}

/**
 * Checks whether two time intervals overlap in real minutes
 */
export function checkIntervalOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}
