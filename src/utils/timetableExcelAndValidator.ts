import ExcelJS from 'exceljs';
import {
  DayOfWeek,
  DAYS_OF_WEEK,
  ScheduleGrid,
  TimetableCell,
  getGradeDaySlots,
} from '../components/Timetable/types';
import { SubjectAllocationRow } from '../components/Timetable/SchoolTimetableMatrix';
import {
  SUBJECT_FULL_NAMES,
  TeacherDirectoryEntry,
  parseTeacherCodes,
} from './lampiranData';

/**
 * Standard School Bell Timings (SKAS 3.1.3.1):
 * Waktu 1–5: 07:10 – 09:40 (30m each: 07:10-07:40, 07:40-08:10, 08:10-08:40, 08:40-09:10, 09:10-09:40)
 * Rehat: 09:40 – 10:10
 * Waktu 6–10: 10:10 – 12:40 (30m each: 10:10-10:40, 10:40-11:10, 11:10-11:40, 11:40-12:10, 12:10-12:40)
 * Waktu 11 (Klinik): 12:40 – 13:10
 */
export const STANDARD_BELL_TIMINGS: Array<{
  slotId: string;
  periodNum?: number;
  label: string;
  timeRange: string;
  isRecess?: boolean;
  isKlinik?: boolean;
}> = [
  { slotId: 'W1', periodNum: 1, label: 'Waktu 1', timeRange: '07:10 - 07:40' },
  { slotId: 'W2', periodNum: 2, label: 'Waktu 2', timeRange: '07:40 - 08:10' },
  { slotId: 'W3', periodNum: 3, label: 'Waktu 3', timeRange: '08:10 - 08:40' },
  { slotId: 'W4', periodNum: 4, label: 'Waktu 4', timeRange: '08:40 - 09:10' },
  { slotId: 'W5', periodNum: 5, label: 'Waktu 5', timeRange: '09:10 - 09:40' },
  { slotId: 'REHAT', label: 'REHAT', timeRange: '09:40 - 10:10', isRecess: true },
  { slotId: 'W6', periodNum: 6, label: 'Waktu 6', timeRange: '10:10 - 10:40' },
  { slotId: 'W7', periodNum: 7, label: 'Waktu 7', timeRange: '10:40 - 11:10' },
  { slotId: 'W8', periodNum: 8, label: 'Waktu 8', timeRange: '11:10 - 11:40' },
  { slotId: 'W9', periodNum: 9, label: 'Waktu 9', timeRange: '11:40 - 12:10' },
  { slotId: 'W10', periodNum: 10, label: 'Waktu 10', timeRange: '12:10 - 12:40' },
  { slotId: 'W11', periodNum: 11, label: 'Waktu 11 (Klinik)', timeRange: '12:40 - 13:10', isKlinik: true },
];

export interface ConsecutiveValidationIssue {
  id: string;
  type: 'SN_AM_DISTRIBUTION' | 'SN_AM_SPLIT_REHAT' | 'BC_TRIPLE_SPLIT' | 'CONSECUTIVE_5_FATIGUE';
  severity: 'ERROR' | 'WARNING';
  grade?: number;
  day?: DayOfWeek;
  teacherCode?: string;
  teacherName?: string;
  subjectCode?: string;
  halfSession?: 'PAGI_W1_W5' | 'TENGAH_HARI_W6_W10';
  slotIds: string[];
  title: string;
  message: string;
}

export interface ConsecutiveFatigueAuditResult {
  snAmIssues: ConsecutiveValidationIssue[];
  bcIssues: ConsecutiveValidationIssue[];
  consecutiveFiveWarnings: ConsecutiveValidationIssue[];
  allIssues: ConsecutiveValidationIssue[];
  consecutiveFiveCellKeys: Set<string>; // `${grade}_${day}_${slotId}`
  consecutiveFiveTeachersByDay: Record<
    DayOfWeek,
    Array<{
      teacherCode: string;
      teacherName: string;
      session: 'Waktu 1–5 (07:10–09:40)' | 'Waktu 6–10 (10:10–12:40)';
      slots: Array<{ slotId: string; grade: number; subjectCode: string }>;
    }>
  >;
  isSnAmCompliant: boolean;
  isBcCompliant: boolean;
  isFatigueFree: boolean;
}

const PRE_REHAT_SLOTS = ['W1', 'W2', 'W3', 'W4', 'W5'];
const POST_REHAT_SLOTS = ['W6', 'W7', 'W8', 'W9', 'W10'];

function slotToLogicalPeriodIndex(grade: number, slotId: string, academicYear: string): number | null {
  const isKP2027T1 = grade === 1 && (!academicYear || parseInt(academicYear, 10) >= 2027);
  const upper = (slotId || '').trim().toUpperCase();
  if (upper === 'W1') return 1;
  if (upper === 'W2') return 2;
  if (upper === 'W3') return 3;
  if (upper === 'W4') return 4;
  if (upper === 'W5') return isKP2027T1 ? 6 : 5;
  if (upper === 'PKAR') return isKP2027T1 ? 5 : null;
  if (upper === 'W6') return isKP2027T1 ? 7 : 6;
  if (upper === 'W7') return isKP2027T1 ? 8 : 7;
  if (upper === 'W8') return isKP2027T1 ? 9 : 8;
  if (upper === 'W9') return isKP2027T1 ? 10 : 9;
  if (upper === 'W10') return isKP2027T1 ? 11 : 10;
  if (upper === 'W11') return 11;
  return null;
}

/**
 * Groups sorted slot indices (1..5 pre-rehat, 6..10 post-rehat) into contiguous blocks
 * within the same half-day (never merging across Rehat between 5 and 6).
 */
function groupIntoHalfDayBlocks(
  entries: Array<{ slotId: string; periodNum: number }>
): Array<{
  half: 'PRE_REHAT' | 'POST_REHAT' | 'KLINIK';
  isContiguous: boolean;
  periodNums: number[];
  slotIds: string[];
}> {
  const pre = entries
    .filter((e) => e.periodNum >= 1 && e.periodNum <= 5)
    .sort((a, b) => a.periodNum - b.periodNum);
  const post = entries
    .filter((e) => e.periodNum >= 6 && e.periodNum <= 10)
    .sort((a, b) => a.periodNum - b.periodNum);
  const klinik = entries
    .filter((e) => e.periodNum === 11)
    .sort((a, b) => a.periodNum - b.periodNum);

  const result: Array<{
    half: 'PRE_REHAT' | 'POST_REHAT' | 'KLINIK';
    isContiguous: boolean;
    periodNums: number[];
    slotIds: string[];
  }> = [];

  const checkContiguous = (nums: number[]): boolean => {
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] - nums[i - 1] !== 1) return false;
    }
    return true;
  };

  if (pre.length > 0) {
    result.push({
      half: 'PRE_REHAT',
      isContiguous: checkContiguous(pre.map((p) => p.periodNum)),
      periodNums: pre.map((p) => p.periodNum),
      slotIds: pre.map((p) => p.slotId),
    });
  }
  if (post.length > 0) {
    result.push({
      half: 'POST_REHAT',
      isContiguous: checkContiguous(post.map((p) => p.periodNum)),
      periodNums: post.map((p) => p.periodNum),
      slotIds: post.map((p) => p.slotId),
    });
  }
  if (klinik.length > 0) {
    result.push({
      half: 'KLINIK',
      isContiguous: true,
      periodNums: klinik.map((p) => p.periodNum),
      slotIds: klinik.map((p) => p.slotId),
    });
  }

  return result;
}

/**
 * Runs the SKAS 3.1.3.1 Consecutive & Anti-Fatigue Validator on the Master Timetable:
 * 1) Science (SN / AM): When a class has 5 weekly periods of SN or AM, checks if it is distributed
 *    as 2 periods + 3 periods, and verifies that any 3-period block is strictly contiguous within
 *    the same half-day (never split across Rehat 09:40-10:10).
 * 2) Bahasa Cina (BC): Verifies that all 3-period BC combinations are contiguous and not split across Rehat.
 * 3) Consecutive 5 Periods Warning: Highlights any teacher who teaches 5 consecutive periods in
 *    Waktu 1–5 (07:10–09:40) or Waktu 6–10 (10:10–12:40) in the official timetable (Note: temporary relief does not trigger this block).
 */
export function validateScheduleConsecutiveAndFatigue(
  schedule: ScheduleGrid,
  academicYear: string,
  teacherList: TeacherDirectoryEntry[] = []
): ConsecutiveFatigueAuditResult {
  const snAmIssues: ConsecutiveValidationIssue[] = [];
  const bcIssues: ConsecutiveValidationIssue[] = [];
  const consecutiveFiveWarnings: ConsecutiveValidationIssue[] = [];
  const consecutiveFiveCellKeys = new Set<string>();
  const teacherNameMap = new Map(teacherList.map((t) => [t.code.toUpperCase(), t.name]));

  const consecutiveFiveTeachersByDay: ConsecutiveFatigueAuditResult['consecutiveFiveTeachersByDay'] = {
    ISNIN: [],
    SELASA: [],
    RABU: [],
    KHAMIS: [],
    JUMAAT: [],
  };

  // ---------------------------------------------------------------------------
  // 1 & 2. Check SN / AM and BC per Class (Tahun 1 – Tahun 6)
  // ---------------------------------------------------------------------------
  [1, 2, 3, 4, 5, 6].forEach((grade) => {
    (['SN', 'AM'] as const).forEach((targetSubj) => {
      const dayEntries: Array<{
        day: DayOfWeek;
        slots: Array<{ slotId: string; periodNum: number }>;
      }> = [];
      let totalWeeklyCount = 0;

      DAYS_OF_WEEK.forEach((day) => {
        const gradeSlots = getGradeDaySlots(grade, day, academicYear);
        const matched: Array<{ slotId: string; periodNum: number }> = [];
        gradeSlots.forEach((gs) => {
          if (gs.isRecess) return;
          const cell = schedule[grade]?.[day]?.[gs.slotId];
          if (!cell || !cell.subjectCode) return;
          const sCode = cell.subjectCode.trim().toUpperCase();
          if (sCode === targetSubj) {
            const pNum = slotToLogicalPeriodIndex(grade, gs.slotId, academicYear);
            if (pNum !== null && pNum >= 1 && pNum <= 10) {
              matched.push({ slotId: gs.slotId, periodNum: pNum });
              totalWeeklyCount++;
            }
          }
        });
        if (matched.length > 0) {
          dayEntries.push({ day, slots: matched });
        }
      });

      if (totalWeeklyCount === 0) return;

      // Check each day's SN/AM block for contiguity and Rehat crossing
      dayEntries.forEach(({ day, slots }) => {
        const halfBlocks = groupIntoHalfDayBlocks(slots);
        if (slots.length === 3) {
          if (halfBlocks.length > 1) {
            snAmIssues.push({
              id: `sn_rehat_${grade}_${day}_${targetSubj}`,
              type: 'SN_AM_SPLIT_REHAT',
              severity: 'ERROR',
              grade,
              day,
              subjectCode: targetSubj,
              slotIds: slots.map((s) => s.slotId),
              title: `${targetSubj} Tahun ${grade} (${day}) Terputus Merentasi Rehat`,
              message: `Blok 3 waktu ${targetSubj} bagi Tahun ${grade} pada hari ${day} (${slots
                .map((s) => s.slotId)
                .join(', ')}) terpisah merentasi waktu Rehat (09:40–10:10). 3 waktu ${targetSubj} mesti berturutan dalam separuh hari yang sama.`,
            });
          } else if (!halfBlocks[0]?.isContiguous) {
            snAmIssues.push({
              id: `sn_noncontig_${grade}_${day}_${targetSubj}`,
              type: 'SN_AM_SPLIT_REHAT',
              severity: 'ERROR',
              grade,
              day,
              subjectCode: targetSubj,
              slotIds: slots.map((s) => s.slotId),
              title: `${targetSubj} Tahun ${grade} (${day}) Tidak Berturutan`,
              message: `3 waktu ${targetSubj} bagi Tahun ${grade} pada hari ${day} (${slots
                .map((s) => s.slotId)
                .join(', ')}) tidak disusun berturutan.`,
            });
          }
        } else if (slots.length === 2) {
          if (halfBlocks.length > 1 || !halfBlocks[0]?.isContiguous) {
            snAmIssues.push({
              id: `sn_double_split_${grade}_${day}_${targetSubj}`,
              type: 'SN_AM_SPLIT_REHAT',
              severity: 'WARNING',
              grade,
              day,
              subjectCode: targetSubj,
              slotIds: slots.map((s) => s.slotId),
              title: `${targetSubj} Tahun ${grade} (${day}) 2 Waktu Terpisah`,
              message: `2 waktu ${targetSubj} bagi Tahun ${grade} pada hari ${day} (${slots
                .map((s) => s.slotId)
                .join(', ')}) terpisah atau merentasi Rehat.`,
            });
          }
        }
      });

      // If total weekly SN/AM periods == 5, verify 2 + 3 distribution
      if (totalWeeklyCount === 5) {
        const counts = dayEntries.map((d) => d.slots.length).sort((a, b) => a - b);
        const isTwoPlusThree = counts.length === 2 && counts[0] === 2 && counts[1] === 3;
        if (!isTwoPlusThree) {
          snAmIssues.push({
            id: `sn_dist_${grade}_${targetSubj}`,
            type: 'SN_AM_DISTRIBUTION',
            severity: 'WARNING',
            grade,
            subjectCode: targetSubj,
            slotIds: dayEntries.flatMap((d) => d.slots.map((s) => s.slotId)),
            title: `Taburan ${targetSubj} Tahun ${grade} Bukan 2+3 Waktu`,
            message: `${targetSubj} Tahun ${grade} mempunyai 5 waktu seminggu dengan taburan [${dayEntries
              .map((d) => `${d.day}:${d.slots.length}w`)
              .join(', ')}]. Disyorkan taburan 2 waktu + 3 waktu (3 waktu berturutan tanpa merentasi Rehat).`,
          });
        }
      }
    });

    // Check Bahasa Cina (BC) 3-period combinations
    DAYS_OF_WEEK.forEach((day) => {
      const gradeSlots = getGradeDaySlots(grade, day, academicYear);
      const bcSlots: Array<{ slotId: string; periodNum: number }> = [];
      gradeSlots.forEach((gs) => {
        if (gs.isRecess) return;
        const cell = schedule[grade]?.[day]?.[gs.slotId];
        if (!cell || !cell.subjectCode) return;
        if (cell.subjectCode.trim().toUpperCase() === 'BC') {
          const pNum = slotToLogicalPeriodIndex(grade, gs.slotId, academicYear);
          if (pNum !== null && pNum >= 1 && pNum <= 10) {
            bcSlots.push({ slotId: gs.slotId, periodNum: pNum });
          }
        }
      });

      if (bcSlots.length === 3) {
        const halfBlocks = groupIntoHalfDayBlocks(bcSlots);
        if (halfBlocks.length > 1) {
          bcIssues.push({
            id: `bc_rehat_${grade}_${day}`,
            type: 'BC_TRIPLE_SPLIT',
            severity: 'ERROR',
            grade,
            day,
            subjectCode: 'BC',
            slotIds: bcSlots.map((s) => s.slotId),
            title: `Bahasa Cina (BC) Tahun ${grade} (${day}) Terpisah Merentasi Rehat`,
            message: `Kombinasi 3 waktu BC bagi Tahun ${grade} pada hari ${day} (${bcSlots
              .map((s) => s.slotId)
              .join(', ')}) terpecah merentasi waktu Rehat (09:40–10:10). Semua blok 3 waktu BC mesti disusun berturutan tanpa merentasi Rehat.`,
          });
        } else if (!halfBlocks[0]?.isContiguous) {
          bcIssues.push({
            id: `bc_noncontig_${grade}_${day}`,
            type: 'BC_TRIPLE_SPLIT',
            severity: 'WARNING',
            grade,
            day,
            subjectCode: 'BC',
            slotIds: bcSlots.map((s) => s.slotId),
            title: `Bahasa Cina (BC) Tahun ${grade} (${day}) 3 Waktu Tidak Berturutan`,
            message: `Kombinasi 3 waktu BC bagi Tahun ${grade} pada hari ${day} (${bcSlots
              .map((s) => s.slotId)
              .join(', ')}) tidak disusun berturutan dalam sesi yang sama.`,
          });
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Consecutive 5 Periods Anti-Fatigue Warning (W1–W5 or W6–W10 full block)
  // ---------------------------------------------------------------------------
  DAYS_OF_WEEK.forEach((day) => {
    // Map teacherCode -> periodIndex (1..10) -> Array<{ grade, slotId, subjectCode }>
    const teacherDayPeriods = new Map<
      string,
      Map<number, Array<{ grade: number; slotId: string; subjectCode: string }>>
    >();

    const recordTeacherPeriod = (
      tCode: string,
      periodNum: number,
      grade: number,
      slotId: string,
      subjectCode: string
    ) => {
      const clean = tCode.trim().toUpperCase();
      if (!clean || clean === '-') return;
      if (!teacherDayPeriods.has(clean)) {
        teacherDayPeriods.set(clean, new Map());
      }
      const pMap = teacherDayPeriods.get(clean)!;
      if (!pMap.has(periodNum)) {
        pMap.set(periodNum, []);
      }
      pMap.get(periodNum)!.push({ grade, slotId, subjectCode });
    };

    [1, 2, 3, 4, 5, 6].forEach((grade) => {
      const gradeSlots = getGradeDaySlots(grade, day, academicYear);
      gradeSlots.forEach((gs) => {
        if (gs.isRecess || gs.slotId === 'MEMBACA' || gs.slotId === 'TASMIK') return;
        const cell = schedule[grade]?.[day]?.[gs.slotId];
        if (!cell || !cell.subjectCode) return;
        const upperSubj = cell.subjectCode.trim().toUpperCase();
        if (upperSubj === 'PN' || upperSubj === 'TASMIK') return;

        const pNum = slotToLogicalPeriodIndex(grade, gs.slotId, academicYear);
        if (!pNum || pNum < 1 || pNum > 10) return;

        const codes = [
          ...parseTeacherCodes(cell.teacherCode),
          ...parseTeacherCodes(cell.secondaryTeacherCode),
        ];
        codes.forEach((tc) => recordTeacherPeriod(tc, pNum, grade, gs.slotId, upperSubj));
      });
    });

    teacherDayPeriods.forEach((pMap, teacherCode) => {
      const tName = teacherNameMap.get(teacherCode) || teacherCode;

      // Check Pre-Rehat W1..W5 (Periods 1..5)
      const hasAllPreRehat = [1, 2, 3, 4, 5].every((p) => (pMap.get(p)?.length || 0) > 0);
      if (hasAllPreRehat) {
        const preSlots = [1, 2, 3, 4, 5].flatMap((p) => pMap.get(p) || []);
        preSlots.forEach((s) => {
          consecutiveFiveCellKeys.add(`${s.grade}_${day}_${s.slotId}`);
        });
        consecutiveFiveTeachersByDay[day].push({
          teacherCode,
          teacherName: tName,
          session: 'Waktu 1–5 (07:10–09:40)',
          slots: preSlots,
        });
        consecutiveFiveWarnings.push({
          id: `fatigue_pre_${teacherCode}_${day}`,
          type: 'CONSECUTIVE_5_FATIGUE',
          severity: 'WARNING',
          day,
          teacherCode,
          teacherName: tName,
          halfSession: 'PAGI_W1_W5',
          slotIds: PRE_REHAT_SLOTS,
          title: `Amaran 5 Waktu Berturut-turut: ${teacherCode} (${tName}) — ${day} (Waktu 1–5)`,
          message: `Guru [${teacherCode}] ${tName} mengajar 5 waktu penuh berturut-turut pada Waktu 1–5 (07:10–09:40) hari ${day}: ${preSlots
            .map((s) => `T.${s.grade} ${s.slotId}(${s.subjectCode})`)
            .join(' → ')}.`,
        });
      }

      // Check Post-Rehat W6..W10 (Periods 6..10)
      const hasAllPostRehat = [6, 7, 8, 9, 10].every((p) => (pMap.get(p)?.length || 0) > 0);
      if (hasAllPostRehat) {
        const postSlots = [6, 7, 8, 9, 10].flatMap((p) => pMap.get(p) || []);
        postSlots.forEach((s) => {
          consecutiveFiveCellKeys.add(`${s.grade}_${day}_${s.slotId}`);
        });
        consecutiveFiveTeachersByDay[day].push({
          teacherCode,
          teacherName: tName,
          session: 'Waktu 6–10 (10:10–12:40)',
          slots: postSlots,
        });
        consecutiveFiveWarnings.push({
          id: `fatigue_post_${teacherCode}_${day}`,
          type: 'CONSECUTIVE_5_FATIGUE',
          severity: 'WARNING',
          day,
          teacherCode,
          teacherName: tName,
          halfSession: 'TENGAH_HARI_W6_W10',
          slotIds: POST_REHAT_SLOTS,
          title: `Amaran 5 Waktu Berturut-turut: ${teacherCode} (${tName}) — ${day} (Waktu 6–10)`,
          message: `Guru [${teacherCode}] ${tName} mengajar 5 waktu penuh berturut-turut pada Waktu 6–10 (10:10–12:40) hari ${day}: ${postSlots
            .map((s) => `T.${s.grade} ${s.slotId}(${s.subjectCode})`)
            .join(' → ')}.`,
        });
      }
    });
  });

  const allIssues = [...snAmIssues, ...bcIssues, ...consecutiveFiveWarnings];

  return {
    snAmIssues,
    bcIssues,
    consecutiveFiveWarnings,
    allIssues,
    consecutiveFiveCellKeys,
    consecutiveFiveTeachersByDay,
    isSnAmCompliant: snAmIssues.length === 0,
    isBcCompliant: bcIssues.length === 0,
    isFatigueFree: consecutiveFiveWarnings.length === 0,
  };
}

// ============================================================================
// EXCEL TIMETABLE IMPORTER (Jadual Waktu Induk .xlsx)
// ============================================================================
export interface ExcelTimetableImportResult {
  schedule: ScheduleGrid;
  classTeachers: Record<number, string>;
  importedCellsCount: number;
  detectedDays: DayOfWeek[];
  warnings: string[];
}

function extractCellRawText(val: ExcelJS.CellValue): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
    return String(val).trim();
  }
  if (typeof val === 'object') {
    if ('richText' in val && Array.isArray(val.richText)) {
      return val.richText.map((rt) => rt.text || '').join('').trim();
    }
    if ('result' in val && val.result !== undefined && val.result !== null) {
      return String(val.result).trim();
    }
    if ('text' in val && typeof (val as any).text === 'string') {
      return (val as any).text.trim();
    }
  }
  return '';
}

function parseDayFromText(text: string): DayOfWeek | null {
  const upper = text.toUpperCase();
  for (const d of DAYS_OF_WEEK) {
    if (upper.includes(d)) return d;
  }
  if (upper.includes('MONDAY') || upper.includes('星期一') || upper.includes('周一')) return 'ISNIN';
  if (upper.includes('TUESDAY') || upper.includes('星期二') || upper.includes('周二')) return 'SELASA';
  if (upper.includes('WEDNESDAY') || upper.includes('星期三') || upper.includes('周三')) return 'RABU';
  if (upper.includes('THURSDAY') || upper.includes('星期四') || upper.includes('周四')) return 'KHAMIS';
  if (upper.includes('FRIDAY') || upper.includes('星期五') || upper.includes('周五')) return 'JUMAAT';
  return null;
}

function parseGradeFromRowLabel(text: string): number | null {
  const clean = text.replace(/\s+/g, ' ').trim().toUpperCase();
  if (!clean) return null;
  const m =
    clean.match(/\b(?:TAHUN|THN|DARJAH|YEAR|T\.?)\s*([1-6])\b/) ||
    clean.match(/^([1-6])\s*(?:MERAH|BIRU|KUNING|HIJAU|CEMERLANG|BESTARI|INSPIRASI|[A-Z])?$/);
  if (m) {
    const g = parseInt(m[1], 10);
    if (g >= 1 && g <= 6) return g;
  }
  if (clean.includes('一年级')) return 1;
  if (clean.includes('二年级')) return 2;
  if (clean.includes('三年级')) return 3;
  if (clean.includes('四年级')) return 4;
  if (clean.includes('五年级')) return 5;
  if (clean.includes('六年级')) return 6;
  return null;
}

/**
 * Maps an Excel column header string (e.g. "W1 07:10-07:40", "Waktu 6 10:10-10:40", "W11 Klinik 12:40-13:10", "Rehat 09:40-10:10")
 * into our canonical slot column token ('MEMBACA', 'W1'..'W11', 'PKAR', 'REHAT', 'TASMIK').
 */
function classifyHeaderSlotColumn(rawHeader: string): string | null {
  const upper = rawHeader.replace(/\s+/g, ' ').trim().toUpperCase();
  if (!upper) return null;

  if (upper.includes('REHAT') || upper.includes('休息') || upper.includes('09:40 - 10:10') || upper.includes('09:40-10:10') || upper.includes('09:45 - 10:15')) {
    return 'REHAT';
  }
  if (upper.includes('MEMBACA') || upper.includes('PROG. PAGI') || upper.includes('PROGRAM PAGI')) {
    return 'MEMBACA';
  }
  if (upper.includes('PKAR') && !upper.includes('W5')) {
    return 'PKAR';
  }
  if (upper.includes('KLINIK') || /\bW(?:AKTU)?\s*11\b/.test(upper) || upper.includes('12:40') || upper.includes('12.40')) {
    return 'W11';
  }
  if (upper.includes('TASMIK') && !/\bW(?:AKTU)?\s*\d+\b/.test(upper)) {
    return 'TASMIK';
  }

  // Explicit W1..W11 or Waktu 1..11
  const wMatch = upper.match(/\bW(?:AKTU)?\s*(11|10|[1-9])\b/);
  if (wMatch) {
    return `W${wMatch[1]}`;
  }

  // Clock time matching fallback for school Excel sheets using 07:10-09:40 / 10:10-12:40 / 12:40-13:10
  if (upper.includes('07:10') || upper.includes('7:10') || upper.includes('07.10') || upper.includes('07:15')) return 'W1';
  if (upper.includes('07:40') || upper.includes('7:40') || upper.includes('07.40') || upper.includes('07:45')) return 'W2';
  if (upper.includes('08:10') || upper.includes('8:10') || upper.includes('08.10') || upper.includes('08:15')) return 'W3';
  if (upper.includes('08:40') || upper.includes('8:40') || upper.includes('08.40') || upper.includes('08:45')) return 'W4';
  if (upper.includes('09:10') || upper.includes('9:10') || upper.includes('09.10') || upper.includes('09:15')) return 'W5';
  if (upper.includes('10:10') || upper.includes('10.10') || upper.includes('10:15')) return 'W6';
  if (upper.includes('10:40') || upper.includes('10.40') || upper.includes('10:45')) return 'W7';
  if (upper.includes('11:10') || upper.includes('11.10') || upper.includes('11:15')) return 'W8';
  if (upper.includes('11:40') || upper.includes('11.40') || upper.includes('11:45')) return 'W9';
  if (upper.includes('12:10') || upper.includes('12.10') || upper.includes('12:15')) return 'W10';

  // Pure period number "1".."11"
  if (/^(11|10|[1-9])$/.test(upper)) {
    return `W${upper}`;
  }

  return null;
}

const KNOWN_SUBJECT_CODES = new Set([
  'PN',
  'BC',
  'BM',
  'BI',
  'MT',
  'SN',
  'AM',
  'SEJ',
  'RBT',
  'PSV',
  'MZ',
  'PJ',
  'PK',
  'PM',
  'PAI',
  'PM/PAI',
  'PKAR',
  'MEMBACA',
  'TASMIK',
  'KLINIK',
  'KLIBM',
  'KLIBI',
  'KLIBC',
  'KLIMT',
  'PBM',
  'PMT',
]);

/**
 * Parses a timetable cell string from Excel (e.g. "BC\nLSC", "SN (NCY)", "PM/PAI\nKL / MFA", "KLINIK (VY)")
 */
function parseTimetableCellContent(
  rawText: string,
  grade: number,
  colSlotKey: string,
  matrixData: SubjectAllocationRow[],
  teacherList: TeacherDirectoryEntry[]
): TimetableCell | null {
  const cleaned = rawText.replace(/\r/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === '—' || cleaned.toUpperCase() === 'REHAT') {
    return null;
  }

  const lines = cleaned
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  let subjectToken = '';
  let teacherToken = '';
  let hasPemulihan = false;
  let pemulihanTeacherCode = '';

  if (lines.length >= 2) {
    subjectToken = lines[0].toUpperCase();
    teacherToken = lines[1].toUpperCase();
    if (lines[2]) {
      const l3 = lines[2].toUpperCase();
      if (l3.includes('PBM') || l3.includes('PMT')) {
        hasPemulihan = true;
        const m = l3.match(/\(([A-Z0-9]+)\)/);
        if (m) pemulihanTeacherCode = m[1];
      }
    }
  } else {
    const single = lines[0];
    // Try "SUBJ (TEACHER)" or "SUBJ - TEACHER" or "SUBJ TEACHER"
    const parenMatch = single.match(/^([A-Za-z/]+)\s*\(([^)]+)\)$/);
    if (parenMatch) {
      subjectToken = parenMatch[1].trim().toUpperCase();
      teacherToken = parenMatch[2].trim().toUpperCase();
    } else {
      const parts = single.split(/[\s-]+/).filter(Boolean);
      subjectToken = (parts[0] || '').toUpperCase();
      teacherToken = parts.slice(1).join('').toUpperCase();
    }
  }

  if (!subjectToken) return null;

  // Normalize Chinese or full Malay names to subject code if needed
  if (subjectToken.includes('PERHIMPUNAN') || subjectToken === 'PER') subjectToken = 'PN';
  if (subjectToken.includes('KLINIK') && !KNOWN_SUBJECT_CODES.has(subjectToken)) {
    subjectToken = 'KLINIK';
  }
  if (subjectToken === 'SAINS') subjectToken = 'SN';
  if (subjectToken === 'MATEMATIK' || subjectToken === 'MATH') subjectToken = 'MT';
  if (subjectToken === 'SEJARAH') subjectToken = 'SEJ';
  if (subjectToken === 'MUZIK') subjectToken = 'MZ';

  // Resolve teacher code (handle numeric index "1", "2" or short code "TYM", "NCY / VY")
  const resolveSingleTeacher = (tok: string): string => {
    const t = tok.replace(/[[\]()]/g, '').trim().toUpperCase();
    if (!t || t === '-') return '';
    if (/^\d+$/.test(t)) {
      const num = parseInt(t, 10);
      const byNum = teacherList.find((tr) => tr.num === num);
      if (byNum) return byNum.code;
    }
    const byCode = teacherList.find((tr) => tr.code.toUpperCase() === t);
    if (byCode) return byCode.code;
    const byName = teacherList.find((tr) => tr.name.toUpperCase().includes(t));
    if (byName) return byName.code;
    return t;
  };

  let resolvedTeacherCode = '';
  if (teacherToken) {
    const tParts = teacherToken
      .split('/')
      .map((p) => resolveSingleTeacher(p))
      .filter(Boolean);
    resolvedTeacherCode = tParts.join('/');
  }

  // Fallback to matrixData teacher assignment if Excel cell only had Subject Code
  const matchedMatrixRow = matrixData.find(
    (r) => r.subjectCode.trim().toUpperCase() === subjectToken
  );
  if (!resolvedTeacherCode && matchedMatrixRow && subjectToken !== 'PN') {
    const t1 = matchedMatrixRow.teachers?.[grade]?.trim() || '';
    const t2 = matchedMatrixRow.secondaryTeachers?.[grade]?.trim() || '';
    resolvedTeacherCode = [t1, t2].filter(Boolean).join('/');
  }

  const subjectName =
    matchedMatrixRow?.subjectName ||
    SUBJECT_FULL_NAMES[subjectToken] ||
    (colSlotKey === 'W11' && subjectToken === 'KLINIK' ? 'WAKTU 11 KLINIK (12:40-13:10)' : subjectToken);

  return {
    subjectId: matchedMatrixRow?.id || subjectToken.toLowerCase(),
    subjectCode: subjectToken,
    subjectName,
    teacherCode: subjectToken === 'PN' ? '' : resolvedTeacherCode,
    periodLength: colSlotKey === 'PKAR' || colSlotKey === 'MEMBACA' ? 0.5 : 1,
    ...(hasPemulihan ? { isPemulihan: true } : {}),
    ...(pemulihanTeacherCode ? { pemulihanTeacherCode } : {}),
  };
}

/**
 * Imports a school timetable Excel file (.xlsx) into ScheduleGrid.
 * Supports:
 * - Standard iSEPADU Master Timetable ("Jadual Induk")
 * - School Excel Timetables with Waktu 1–5 (07:10–09:40), Rehat (09:40–10:10), Waktu 6–10 (10:10–12:40), Waktu 11 Klinik (12:40–13:10)
 * - Individual Class Timetable sheets ("Lampiran A - Tahun 1..6" or "Tahun 1..6")
 */
export async function importTimetableFromExcelFile(params: {
  fileBuffer: ArrayBuffer;
  academicYear: string;
  currentSchedule: ScheduleGrid;
  currentClassTeachers: Record<number, string>;
  matrixData: SubjectAllocationRow[];
  teacherList: TeacherDirectoryEntry[];
}): Promise<ExcelTimetableImportResult> {
  const {
    fileBuffer,
    academicYear,
    currentSchedule,
    currentClassTeachers,
    matrixData,
    teacherList,
  } = params;

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(fileBuffer);

  const nextSchedule: ScheduleGrid = JSON.parse(JSON.stringify(currentSchedule || {}));
  [1, 2, 3, 4, 5, 6].forEach((g) => {
    if (!nextSchedule[g]) {
      nextSchedule[g] = { ISNIN: {}, SELASA: {}, RABU: {}, KHAMIS: {}, JUMAAT: {} };
    }
    DAYS_OF_WEEK.forEach((d) => {
      if (!nextSchedule[g][d]) nextSchedule[g][d] = {};
    });
  });

  const nextClassTeachers: Record<number, string> = { ...currentClassTeachers };
  let importedCellsCount = 0;
  const detectedDaysSet = new Set<DayOfWeek>();
  const warnings: string[] = [];

  const isKP2027T1 = !academicYear || parseInt(academicYear, 10) >= 2027;

  const mapColumnSlotToGradeSlotId = (
    grade: number,
    colSlot: string,
    day: DayOfWeek
  ): string | null => {
    if (colSlot === 'REHAT') return null;
    if (colSlot === 'MEMBACA') return grade === 1 && isKP2027T1 ? 'MEMBACA' : null;
    if (colSlot === 'PKAR') return grade === 1 && isKP2027T1 ? 'PKAR' : null;
    if (colSlot === 'W1' || colSlot === 'W2' || colSlot === 'W3' || colSlot === 'W4') return colSlot;
    if (colSlot === 'W5') return grade === 1 && isKP2027T1 ? 'PKAR' : 'W5';
    if (colSlot === 'W6') return grade === 1 && isKP2027T1 ? 'W5' : 'W6';
    if (colSlot === 'W7') return grade === 1 && isKP2027T1 ? 'W6' : 'W7';
    if (colSlot === 'W8') return grade === 1 && isKP2027T1 ? 'W7' : 'W8';
    if (colSlot === 'W9') return grade === 1 && isKP2027T1 ? 'W8' : 'W9';
    if (colSlot === 'W10') return grade === 1 && isKP2027T1 ? 'W9' : 'W10';
    if (colSlot === 'W11') {
      if (day === 'RABU' || day === 'KHAMIS') return 'TASMIK';
      return grade === 1 && isKP2027T1 ? 'W10' : 'W11';
    }
    if (colSlot === 'TASMIK') return 'TASMIK';
    return colSlot;
  };

  wb.eachSheet((ws) => {
    const sheetTitleUpper = (ws.name || '').toUpperCase();
    // Skip teacher Lampiran B sheets
    if (sheetTitleUpper.includes('LAMPIRAN B') || sheetTitleUpper.startsWith('GURU ')) {
      return;
    }

    let currentDay: DayOfWeek | null = null;
    let activeColumnSlotMap = new Map<number, string>(); // colIndex -> canonical slot token
    let guruKelasColIndex: number | null = null;

    // Check if this sheet is a single-class sheet (e.g. "Tahun 1", "Lampiran A - Tahun 3")
    const sheetGradeMatch = parseGradeFromRowLabel(ws.name || '');

    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const rowTexts: string[] = [];
      for (let c = 1; c <= Math.min(25, ws.columnCount || 20); c++) {
        rowTexts.push(extractCellRawText(row.getCell(c).value));
      }

      const nonEmpty = rowTexts.filter(Boolean);
      if (nonEmpty.length === 0) continue;

      const joinedRowUpper = nonEmpty.join(' | ').toUpperCase();

      // 1. Detect Day Banner Row (e.g., "HARI : ISNIN")
      if (
        joinedRowUpper.includes('HARI') ||
        (nonEmpty.length <= 3 && parseDayFromText(joinedRowUpper) && !joinedRowUpper.includes('W1'))
      ) {
        const foundDay = parseDayFromText(joinedRowUpper);
        if (foundDay) {
          currentDay = foundDay;
          detectedDaysSet.add(foundDay);
          continue;
        }
      }

      // 2. Detect Slot Header Row (contains W1, W2, Waktu 1, 07:10, Rehat, etc.)
      const candidateColMap = new Map<number, string>();
      let candidateGuruKelasCol: number | null = null;
      rowTexts.forEach((txt, idx) => {
        const colNum = idx + 1;
        const u = txt.toUpperCase();
        if (u.includes('GURU KELAS') || u.includes('班主任')) {
          candidateGuruKelasCol = colNum;
          return;
        }
        const slotKey = classifyHeaderSlotColumn(txt);
        if (slotKey) {
          candidateColMap.set(colNum, slotKey);
        }
      });

      if (candidateColMap.size >= 4) {
        activeColumnSlotMap = candidateColMap;
        guruKelasColIndex = candidateGuruKelasCol;
        continue;
      }

      // 3. Parse Data Rows
      if (activeColumnSlotMap.size >= 4) {
        const firstColText = rowTexts[0] || '';
        const secondColText = rowTexts[1] || '';

        // Format A: Master Sheet (Row = Tahun 1..6 under currentDay)
        const rowGrade =
          parseGradeFromRowLabel(firstColText) || parseGradeFromRowLabel(secondColText);
        if (rowGrade && currentDay) {
          if (guruKelasColIndex && rowTexts[guruKelasColIndex - 1]) {
            const gk = rowTexts[guruKelasColIndex - 1].trim();
            if (gk && gk !== '-') nextClassTeachers[rowGrade] = gk;
          }

          activeColumnSlotMap.forEach((colSlot, colNum) => {
            if (colSlot === 'REHAT') return;
            const targetSlotId = mapColumnSlotToGradeSlotId(rowGrade, colSlot, currentDay!);
            if (!targetSlotId) return;
            const rawCellText = rowTexts[colNum - 1] || '';
            const parsedCell = parseTimetableCellContent(
              rawCellText,
              rowGrade,
              colSlot,
              matrixData,
              teacherList
            );
            nextSchedule[rowGrade][currentDay!][targetSlotId] = parsedCell;
            if (parsedCell) importedCellsCount++;
          });
          continue;
        }

        // Format B: Class Sheet (Row = Day ISNIN..JUMAAT for sheetGradeMatch)
        const rowDay = parseDayFromText(firstColText);
        if (rowDay && sheetGradeMatch) {
          detectedDaysSet.add(rowDay);
          activeColumnSlotMap.forEach((colSlot, colNum) => {
            if (colSlot === 'REHAT') return;
            const targetSlotId = mapColumnSlotToGradeSlotId(sheetGradeMatch, colSlot, rowDay);
            if (!targetSlotId) return;
            const rawCellText = rowTexts[colNum - 1] || '';
            const parsedCell = parseTimetableCellContent(
              rawCellText,
              sheetGradeMatch,
              colSlot,
              matrixData,
              teacherList
            );
            nextSchedule[sheetGradeMatch][rowDay][targetSlotId] = parsedCell;
            if (parsedCell) importedCellsCount++;
          });
        }
      }
    }
  });

  if (importedCellsCount === 0) {
    warnings.push(
      'Tiada petak subjek dikesan. Pastikan fail Excel mempunyai lajur Waktu 1–11 (07:10–13:10) dan baris Tahun 1–6 atau Hari Isnin–Jumaat.'
    );
  }

  return {
    schedule: nextSchedule,
    classTeachers: nextClassTeachers,
    importedCellsCount,
    detectedDays: Array.from(detectedDaysSet),
    warnings,
  };
}

/**
 * Generates and downloads a ready-to-fill School Excel Timetable Template (.xlsx)
 * structured with Waktu 1–5 (07:10–09:40), Rehat (09:40–10:10), Waktu 6–10 (10:10–12:40), and Waktu 11 Klinik (12:40–13:10).
 */
export async function downloadStandardBellExcelTemplate(params: {
  schedule: ScheduleGrid;
  academicYear: string;
  schoolName: string;
  schoolCode: string;
  classTeachers: Record<number, string>;
}): Promise<void> {
  const { schedule, academicYear, schoolName, schoolCode, classTeachers } = params;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Jadual Induk SKAS 3.1.3.1', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const headers = [
    'KELAS',
    'GURU KELAS',
    'W1\n07:10 - 07:40',
    'W2\n07:40 - 08:10',
    'W3\n08:10 - 08:40',
    'W4\n08:40 - 09:10',
    'W5\n09:10 - 09:40',
    'REHAT\n09:40 - 10:10',
    'W6\n10:10 - 10:40',
    'W7\n10:40 - 11:10',
    'W8\n11:10 - 11:40',
    'W9\n11:40 - 12:10',
    'W10\n12:10 - 12:40',
    'W11 (Klinik)\n12:40 - 13:10',
  ];

  ws.columns = headers.map((_, idx) => ({
    width: idx === 0 ? 13 : idx === 1 ? 22 : idx === 7 ? 12 : 15,
  }));

  ws.mergeCells(1, 1, 1, headers.length);
  const title = ws.getCell(1, 1);
  title.value = `JADUAL WAKTU INDUK SEKOLAH (${schoolName} - ${schoolCode}) — SESI ${academicYear}`;
  title.font = { bold: true, size: 13 };
  title.alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(2, 1, 2, headers.length);
  const sub = ws.getCell(2, 1);
  sub.value =
    'Waktu 1–5 (07:10–09:40) | Rehat (09:40–10:10) | Waktu 6–10 (10:10–12:40) | Waktu 11 Klinik (12:40–13:10)';
  sub.font = { bold: true, size: 10, color: { argb: 'FF1E3A8A' } };
  sub.alignment = { horizontal: 'center', vertical: 'middle' };

  let rowCursor = 4;
  const isKP2027T1 = !academicYear || parseInt(academicYear, 10) >= 2027;

  const slotCols = ['W1', 'W2', 'W3', 'W4', 'W5', 'REHAT', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11'];

  DAYS_OF_WEEK.forEach((day) => {
    ws.mergeCells(rowCursor, 1, rowCursor, headers.length);
    const dayCell = ws.getCell(rowCursor, 1);
    dayCell.value = `HARI : ${day}`;
    dayCell.font = { bold: true, size: 11, color: { argb: 'FF800020' } };
    dayCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF99' } };
    rowCursor++;

    const hdrRow = ws.getRow(rowCursor);
    hdrRow.height = 32;
    headers.forEach((h, i) => {
      const c = ws.getCell(rowCursor, i + 1);
      c.value = h;
      c.font = { bold: true, size: 8.5 };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: i === 7 ? 'FFB8CCE4' : i === 13 ? 'FFFEF08A' : 'FFCCFFCC' },
      };
    });
    rowCursor++;

    [1, 2, 3, 4, 5, 6].forEach((grade) => {
      const r = ws.getRow(rowCursor);
      r.height = 28;
      ws.getCell(rowCursor, 1).value = `Tahun ${grade}`;
      ws.getCell(rowCursor, 1).font = { bold: true, size: 9 };
      ws.getCell(rowCursor, 2).value = classTeachers[grade] || '-';
      ws.getCell(rowCursor, 2).font = { size: 9 };

      slotCols.forEach((sc, sIdx) => {
        const cell = ws.getCell(rowCursor, sIdx + 3);
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        if (sc === 'REHAT') {
          cell.value = 'REHAT';
          cell.font = { bold: true, size: 8 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
          return;
        }
        const mappedSlotId =
          grade === 1 && isKP2027T1
            ? sc === 'W5'
              ? 'PKAR'
              : sc === 'W6'
              ? 'W5'
              : sc === 'W7'
              ? 'W6'
              : sc === 'W8'
              ? 'W7'
              : sc === 'W9'
              ? 'W8'
              : sc === 'W10'
              ? 'W9'
              : sc === 'W11'
              ? 'W10'
              : sc
            : sc;
        const item = schedule[grade]?.[day]?.[mappedSlotId];
        if (item && item.subjectCode) {
          cell.value = item.teacherCode
            ? `${item.subjectCode}\n${item.teacherCode}`
            : item.subjectCode;
          cell.font = { bold: true, size: 8.5 };
        } else {
          cell.value = '-';
        }
      });

      rowCursor++;
    });

    rowCursor++;
  });

  const buffer = await wb.xlsx.writeBuffer();
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer);
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Jadual_Waktu_Induk_${schoolCode}_${academicYear}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
