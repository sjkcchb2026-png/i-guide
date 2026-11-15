import {
  DayOfWeek,
  DAYS_OF_WEEK,
  ScheduleGrid,
  checkIntervalOverlap,
  getGradeDaySlots,
} from '../components/Timetable/types';
import {
  TeacherDirectoryEntry,
  isKP2027Year1Active,
  parseTeacherCodes,
} from './lampiranData';
import { PrasekolahTimetableDoc } from './prasekolahTimetable';

export type ReliefAssignmentMode =
  | 'TUKAR_WAKTU_KELAS_SAMA'
  | 'GANTI_BIASA'
  | 'GANTI_PRASEKOLAH';

export interface AbsenceSyncSourceRecord {
  id?: string;
  userId?: string;
  teacherId?: string;
  userName?: string;
  teacherName?: string;
  userEmail?: string;
  email?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  category?: string;
  reason?: string;
  perkara?: string;
  noRujukanLuar?: string;
}

export interface DetectedAbsentTeacher {
  teacherCode: string;
  teacherName: string;
  sources: string[];
  reasonSummary: string;
}

export interface RepaymentReturnSlotInfo {
  repaymentDate: string; // 'YYYY-MM-DD'
  repaymentDay: DayOfWeek;
  repaymentSlotId: string; // e.g. 'W3'
  repaymentSlotLabel: string; // e.g. 'W3'
  repaymentTimeLabel: string; // e.g. '08:15-08:45'
  startMinutes: number;
  endMinutes: number;
  substituteOriginalSubjectCode: string; // Subject Teacher B normally teaches at P2 (which Teacher B teaches today at P1)
  substituteOriginalSubjectName: string;
  absentTeacherReturnSubjectCode: string; // Subject Teacher A will teach at P2 on D_return
  absentTeacherReturnSubjectName: string;
}

export interface ReliefCandidateOption {
  code: string;
  name: string;
  num: number;
  baseDayLoad: number;
  assignedReliefLoadBefore: number;
  projectedDayLoad: number;
  assignedReliefCount: number;
  isWithinEightPeriodCap: boolean;
  isSameClassTeacher?: boolean;
  sameClassSubjects?: string[];
  reliefMode?: ReliefAssignmentMode;
  repaymentInfo?: RepaymentReturnSlotInfo;
}

export interface AutoReliefSlotItem {
  slotKey: string; // e.g. `T4_ISNIN_W1` or `PRA_ISNIN_PRA1`
  grade: number; // 1..6 for mainstream, 0 for Prasekolah
  classLabel: string; // 'Tahun 1'..'Tahun 6' or 'Prasekolah'
  day: DayOfWeek;
  slotId: string;
  slotLabel: string;
  timeLabel: string; // e.g. '07:30-08:00'
  startMinutes: number;
  endMinutes: number;
  periodLength: number;
  isYear1ShiftedMorning: boolean;
  isPKAR: boolean;
  isMembaca: boolean;
  isPrasekolah?: boolean;
  ppmName?: string;
  subjectCode: string;
  subjectName: string;
  absentTeacherCodes: string[];
  absentTeacherNames: string[];
  presentCoTeacherCodes: string[];
  recommendedSubstituteCode: string;
  assignedSubstituteCode: string;
  assignedSubstituteName?: string;
  reliefMode: ReliefAssignmentMode;
  reliefModeLabel: string;
  requiresRepayment: boolean;
  substituteTeachingSubjectCode?: string; // On absentDate, Teacher B teaches Teacher B's subject (for Tukar Waktu)
  substituteTeachingSubjectName?: string;
  repaymentDate?: string; // 'YYYY-MM-DD'
  repaymentDay?: DayOfWeek;
  repaymentSlotId?: string;
  repaymentSlotLabel?: string;
  repaymentTimeLabel?: string;
  repaymentSubjectCode?: string; // On Tarikh Pulang Balik, Teacher A teaches Teacher A's subject at P2
  repaymentSubjectName?: string;
  swapSummaryText?: string;
  whatsappNotificationText?: string;
  recommendedCandidates: ReliefCandidateOption[];
}

export interface AutoReliefPlan {
  dateStr: string;
  day: DayOfWeek;
  absentTeachers: DetectedAbsentTeacher[];
  slots: AutoReliefSlotItem[];
  teacherBaseDayLoads: Record<string, number>;
  teacherProjectedDayLoads: Record<string, number>;
  summary: {
    totalFlagged: number;
    totalAutoAssigned: number;
    unassignedCount: number;
    year1MorningAndPkarCount: number;
    sameClassSwapCount: number;
    standardOneWayCount: number;
    prasekolahReliefCount: number;
  };
}

interface BusyInterval {
  startMinutes: number;
  endMinutes: number;
  grade: number;
  slotId: string;
  subjectCode: string;
}

interface ClassWeeklyLessonSlot {
  grade: number;
  day: DayOfWeek;
  slotId: string;
  slotLabel: string;
  timeLabel: string;
  startMinutes: number;
  endMinutes: number;
  periodLength: number;
  subjectCode: string;
  subjectName: string;
  teacherCodes: string[];
}

/**
 * Safely maps 'YYYY-MM-DD' to DayOfWeek ('ISNIN'..'JUMAAT') without UTC off-by-one shift.
 * Returns null for Saturday (6) and Sunday (0) or invalid input.
 */
export function dateStrToDayOfWeek(dateStr: string): DayOfWeek | null {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) return null;
  const [y, m, d] = dateStr.trim().split('-').map((v) => parseInt(v, 10));
  const dt = new Date(y, m - 1, d);
  if (isNaN(dt.getTime())) return null;
  const jsDay = dt.getDay(); // 0=Sun, 1=Mon ... 5=Fri, 6=Sat
  if (jsDay >= 1 && jsDay <= 5) {
    return DAYS_OF_WEEK[jsDay - 1];
  }
  return null;
}

/**
 * Adds `daysToAdd` calendar days to `YYYY-MM-DD` and returns `YYYY-MM-DD`.
 */
export function addDaysToDateStr(dateStr: string, daysToAdd: number): string {
  const clean = (dateStr || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const [y, m, d] = clean.split('-').map((v) => parseInt(v, 10));
  const dt = new Date(y, m - 1, d + daysToAdd);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function isRecordActiveOnDate(rec: AbsenceSyncSourceRecord, targetDate: string): boolean {
  if (!targetDate) return false;
  if (rec.date && rec.date === targetDate) return true;
  if (rec.startDate && rec.endDate) {
    return targetDate >= rec.startDate && targetDate <= rec.endDate;
  }
  if (rec.startDate && !rec.endDate) {
    return targetDate === rec.startDate;
  }
  return false;
}

/**
 * Matches Kehadiran Staf absence records, Surat Masuk unavailability, and Relief Alerts
 * against the timetable teacher directory.
 */
export function detectAbsentTeachersForDate(params: {
  dateStr: string;
  teacherMapping: { list: TeacherDirectoryEntry[] };
  staffDirectory?: Array<{ id?: string; uid?: string; name?: string; email?: string; code?: string }>;
  absenceRecords?: AbsenceSyncSourceRecord[];
  unavailabilityRecords?: AbsenceSyncSourceRecord[];
  suratAlerts?: Array<{
    id?: string;
    startDate?: string;
    endDate?: string;
    absentTeacherIds?: string[];
    perkara?: string;
    noRujukanLuar?: string;
    status?: string;
  }>;
}): DetectedAbsentTeacher[] {
  const {
    dateStr,
    teacherMapping,
    staffDirectory = [],
    absenceRecords = [],
    unavailabilityRecords = [],
    suratAlerts = [],
  } = params;

  const detectedMap = new Map<
    string,
    { teacher: TeacherDirectoryEntry; sources: Set<string>; reasons: Set<string> }
  >();

  const resolveTeacherEntry = (identifiers: {
    id?: string;
    name?: string;
    email?: string;
    code?: string;
  }): TeacherDirectoryEntry | undefined => {
    const cleanCode = (identifiers.code || '').trim().toUpperCase();
    const cleanId = (identifiers.id || '').trim();
    const cleanEmail = (identifiers.email || '').trim().toLowerCase();
    const cleanName = (identifiers.name || '').replace(/\s+/g, ' ').trim().toUpperCase();

    if (cleanCode) {
      const byCode = teacherMapping.list.find((t) => t.code.toUpperCase() === cleanCode);
      if (byCode) return byCode;
    }

    if (cleanId) {
      const byId = teacherMapping.list.find((t) => t.id === cleanId);
      if (byId) return byId;

      const staffMatch = staffDirectory.find((s) => s.id === cleanId || s.uid === cleanId);
      if (staffMatch) {
        const staffEmail = (staffMatch.email || '').trim().toLowerCase();
        const staffName = (staffMatch.name || '').replace(/\s+/g, ' ').trim().toUpperCase();
        const staffCode = (staffMatch.code || '').trim().toUpperCase();
        const matchedFromStaff = teacherMapping.list.find(
          (t) =>
            (staffCode && t.code.toUpperCase() === staffCode) ||
            (staffName &&
              (t.name.toUpperCase() === staffName ||
                t.name.toUpperCase().includes(staffName) ||
                staffName.includes(t.name.toUpperCase())))
        );
        if (matchedFromStaff) return matchedFromStaff;
        if (staffEmail) {
          const emailMatch = staffDirectory.find(
            (s) => (s.email || '').toLowerCase() === staffEmail && s.name
          );
          if (emailMatch?.name) {
            const upperEName = emailMatch.name.toUpperCase();
            const byEName = teacherMapping.list.find(
              (t) => t.name.toUpperCase().includes(upperEName) || upperEName.includes(t.name.toUpperCase())
            );
            if (byEName) return byEName;
          }
        }
      }
    }

    if (cleanEmail) {
      const staffByEmail = staffDirectory.find((s) => (s.email || '').trim().toLowerCase() === cleanEmail);
      if (staffByEmail?.name) {
        const sName = staffByEmail.name.replace(/\s+/g, ' ').trim().toUpperCase();
        const match = teacherMapping.list.find(
          (t) => t.name.toUpperCase() === sName || t.name.toUpperCase().includes(sName) || sName.includes(t.name.toUpperCase())
        );
        if (match) return match;
      }
    }

    if (cleanName) {
      const directName = teacherMapping.list.find(
        (t) =>
          t.name.toUpperCase() === cleanName ||
          t.name.toUpperCase().includes(cleanName) ||
          cleanName.includes(t.name.toUpperCase())
      );
      if (directName) return directName;
    }

    return undefined;
  };

  const addDetected = (teacher: TeacherDirectoryEntry, source: string, reason?: string) => {
    const existing = detectedMap.get(teacher.code);
    if (existing) {
      existing.sources.add(source);
      if (reason) existing.reasons.add(reason);
    } else {
      detectedMap.set(teacher.code, {
        teacher,
        sources: new Set([source]),
        reasons: new Set(reason ? [reason] : []),
      });
    }
  };

  // 1. Kehadiran Staf absence_records
  absenceRecords.forEach((rec) => {
    if (!isRecordActiveOnDate(rec, dateStr)) return;
    const matched = resolveTeacherEntry({
      id: rec.userId || rec.teacherId,
      name: rec.userName || rec.teacherName,
      email: rec.userEmail || rec.email,
    });
    if (matched) {
      const reasonText = [rec.category, rec.reason].filter(Boolean).join(': ');
      addDetected(matched, 'Kehadiran Staf', reasonText || 'Tidak Hadir');
    }
  });

  // 2. staff_unavailability (Surat Masuk / Takwim)
  unavailabilityRecords.forEach((rec) => {
    if (!isRecordActiveOnDate(rec, dateStr)) return;
    const matched = resolveTeacherEntry({
      id: rec.teacherId || rec.userId,
      name: rec.teacherName || rec.userName,
      email: rec.email || rec.userEmail,
    });
    if (matched) {
      addDetected(matched, 'Surat Masuk', rec.perkara || rec.reason || 'Urusan Rasmi');
    }
  });

  // 3. Active relief_alerts_from_surat covering dateStr
  suratAlerts.forEach((alert) => {
    if (!isRecordActiveOnDate({ startDate: alert.startDate, endDate: alert.endDate }, dateStr)) {
      return;
    }
    (alert.absentTeacherIds || []).forEach((tid) => {
      const matched = resolveTeacherEntry({ id: tid, name: tid, code: tid });
      if (matched) {
        addDetected(matched, 'Relief Surat', alert.perkara || 'Surat Rasmi');
      }
    });
  });

  return Array.from(detectedMap.values())
    .sort((a, b) => a.teacher.num - b.teacher.num)
    .map((entry) => ({
      teacherCode: entry.teacher.code,
      teacherName: entry.teacher.name,
      sources: Array.from(entry.sources),
      reasonSummary: Array.from(entry.reasons).join(' · ') || 'Tidak Hadir',
    }));
}

/**
 * Extracts every teacher's clock-time busy intervals and base daily period workload on `day`.
 * Correctly accounts for:
 * - Co-teaching / composite cells (e.g. `NCY/VY`, `SW/MFA`)
 * - Tahun 1 shifted morning periods (07:30-09:30)
 * - Tahun 1 PKAR 09:30-09:45 (+0.5 waktu) auto-paired from Year 1 W4 teacher
 * - Tahun 1 Program Membaca 07:15-07:30 (+0.5 waktu) when assigned
 * - SELASA W1 PN (+1.0 waktu)
 * - Isolated Prasekolah timetable blocks (when `prasekolahTimetable` is provided, marks the assigned Guru Prasekolah busy during Prasekolah teaching blocks)
 */
export function computeTeacherDaySchedulesAndLoads(
  schedule: ScheduleGrid,
  academicYear: string,
  teacherMapping: { list: TeacherDirectoryEntry[] },
  day: DayOfWeek,
  prasekolahTimetable?: PrasekolahTimetableDoc | null
): {
  busyIntervalsByTeacher: Record<string, BusyInterval[]>;
  baseLoadsByTeacher: Record<string, number>;
} {
  const busyIntervalsByTeacher: Record<string, BusyInterval[]> = {};
  const baseLoadsByTeacher: Record<string, number> = {};

  teacherMapping.list.forEach((t) => {
    busyIntervalsByTeacher[t.code] = [];
    baseLoadsByTeacher[t.code] = 0;
  });

  const ensureTeacher = (code: string) => {
    if (!busyIntervalsByTeacher[code]) busyIntervalsByTeacher[code] = [];
    if (baseLoadsByTeacher[code] === undefined) baseLoadsByTeacher[code] = 0;
  };

  // SELASA W1 compulsory PN assembly (+1.0 period, 07:15-07:45)
  if (day === 'SELASA') {
    teacherMapping.list.forEach((t) => {
      busyIntervalsByTeacher[t.code].push({
        startMinutes: 435,
        endMinutes: 465,
        grade: 0,
        slotId: 'W1',
        subjectCode: 'PN',
      });
      baseLoadsByTeacher[t.code] += 1;
    });
  }

  const isT1Shifted = isKP2027Year1Active(academicYear);
  const seenTasmikLoadKeys = new Set<string>();

  [1, 2, 3, 4, 5, 6].forEach((grade) => {
    const gradeSlots = getGradeDaySlots(grade, day, academicYear);
    let recordedPkarToday = false;

    gradeSlots.forEach((gs) => {
      if (gs.isRecess) return;

      // Tahun 1 PKAR (09:30-09:45): resolve from PKAR cell or auto-pair from W4
      if (gs.slotId === 'PKAR') {
        if (!isT1Shifted || recordedPkarToday) return;
        const pkarCell = schedule[1]?.[day]?.['PKAR'];
        const w4Cell = schedule[1]?.[day]?.['W4'];
        const rawTeacher =
          pkarCell?.teacherCode?.trim() ||
          (w4Cell && w4Cell.subjectCode?.toUpperCase() !== 'PN' ? w4Cell.teacherCode?.trim() : '') ||
          '';
        const pkarTeachers = parseTeacherCodes(rawTeacher);
        if (pkarTeachers.length > 0) {
          recordedPkarToday = true;
          const pkarLen = pkarCell?.periodLength ?? 0.5;
          pkarTeachers.forEach((tc) => {
            ensureTeacher(tc);
            busyIntervalsByTeacher[tc].push({
              startMinutes: gs.startMinutes,
              endMinutes: gs.endMinutes,
              grade: 1,
              slotId: 'PKAR',
              subjectCode: 'PKAR',
            });
            baseLoadsByTeacher[tc] += pkarLen;
          });
        }
        return;
      }

      const cell = schedule[grade]?.[day]?.[gs.slotId];
      if (!cell || !cell.subjectCode) return;
      const upperSubj = cell.subjectCode.trim().toUpperCase();
      if (upperSubj === 'PN') return; // Handled globally above for SELASA W1

      const tCodes = parseTeacherCodes(cell.teacherCode);
      if (tCodes.length === 0) return;

      const isTasmikCell = gs.slotId === 'TASMIK' || upperSubj === 'TASMIK';
      const len = cell.periodLength ?? (gs.slotId === 'MEMBACA' ? 0.5 : 1);
      tCodes.forEach((tc) => {
        ensureTeacher(tc);
        busyIntervalsByTeacher[tc].push({
          startMinutes: gs.startMinutes,
          endMinutes: gs.endMinutes,
          grade,
          slotId: gs.slotId,
          subjectCode: upperSubj,
        });
        if (isTasmikCell) {
          const tKey = `${tc}__${gs.startMinutes}`;
          if (seenTasmikLoadKeys.has(tKey)) return;
          seenTasmikLoadKeys.add(tKey);
        }
        baseLoadsByTeacher[tc] += len;
      });
    });
  });

  // Include Prasekolah teaching blocks for the assigned Guru Prasekolah so they aren't double-booked
  // into mainstream classes while teaching Prasekolah
  if (prasekolahTimetable && prasekolahTimetable.blocks?.[day]) {
    const praBlocks = prasekolahTimetable.blocks[day] || [];
    praBlocks.forEach((block) => {
      if (block.isRecess || block.requiresRelief === false) return;
      const rawCode = (block.teacherCode || prasekolahTimetable.guruPrasekolahCode || '').trim();
      const tCodes = parseTeacherCodes(rawCode);
      tCodes.forEach((tc) => {
        ensureTeacher(tc);
        // Avoid duplicating busy interval if Guru Prasekolah is already in a mainstream co-teaching slot at the exact same minutes
        const alreadyBusy = busyIntervalsByTeacher[tc].some((b) =>
          checkIntervalOverlap(block.startMinutes, block.endMinutes, b.startMinutes, b.endMinutes)
        );
        if (!alreadyBusy) {
          busyIntervalsByTeacher[tc].push({
            startMinutes: block.startMinutes,
            endMinutes: block.endMinutes,
            grade: 0,
            slotId: block.slotCode || block.id,
            subjectCode: 'PRASEKOLAH',
          });
          baseLoadsByTeacher[tc] += block.periodEquivalent ?? 1;
        }
      });
    });
  }

  return { busyIntervalsByTeacher, baseLoadsByTeacher };
}

/**
 * Indexes all regular weekly teaching slots per class (Tahun 1..6) and builds a map of
 * which teachers teach each class (and which subjects/slots they teach in that class).
 */
function buildClassWeeklyIndex(
  schedule: ScheduleGrid,
  academicYear: string
): {
  teachersByGrade: Record<number, Map<string, Set<string>>>; // grade -> teacherCode -> Set<subjectCode (subjectName)>
  slotsByGradeAndDay: Record<number, Record<DayOfWeek, ClassWeeklyLessonSlot[]>>;
} {
  const teachersByGrade: Record<number, Map<string, Set<string>>> = {};
  const slotsByGradeAndDay: Record<number, Record<DayOfWeek, ClassWeeklyLessonSlot[]>> = {};

  [1, 2, 3, 4, 5, 6].forEach((grade) => {
    teachersByGrade[grade] = new Map();
    slotsByGradeAndDay[grade] = {
      ISNIN: [],
      SELASA: [],
      RABU: [],
      KHAMIS: [],
      JUMAAT: [],
    };

    DAYS_OF_WEEK.forEach((d) => {
      const gradeSlots = getGradeDaySlots(grade, d, academicYear);
      gradeSlots.forEach((gs) => {
        if (gs.isRecess || gs.slotId === 'PKAR' || gs.slotId === 'MEMBACA' || gs.slotId === 'TASMIK') {
          return;
        }
        const cell = schedule[grade]?.[d]?.[gs.slotId];
        if (!cell || !cell.subjectCode) return;
        const upperSubj = cell.subjectCode.trim().toUpperCase();
        if (upperSubj === 'PN' || upperSubj === 'PKAR' || upperSubj === 'TASMIK') return;

        const tCodes = parseTeacherCodes(cell.teacherCode);
        if (tCodes.length === 0) return;

        tCodes.forEach((tc) => {
          if (!teachersByGrade[grade].has(tc)) {
            teachersByGrade[grade].set(tc, new Set());
          }
          teachersByGrade[grade].get(tc)!.add(upperSubj);
        });

        slotsByGradeAndDay[grade][d].push({
          grade,
          day: d,
          slotId: gs.slotId,
          slotLabel: gs.label,
          timeLabel: `${gs.startTime}-${gs.endTime}`,
          startMinutes: gs.startMinutes,
          endMinutes: gs.endMinutes,
          periodLength: cell.periodLength ?? 1,
          subjectCode: upperSubj,
          subjectName: cell.subjectName || upperSubj,
          teacherCodes: tCodes,
        });
      });
    });
  });

  return { teachersByGrade, slotsByGradeAndDay };
}

/**
 * Generates an Auto-Relief (Guru Ganti Automatik) plan for a given date & absent teacher codes.
 * Enforces:
 * 1) Priority 1 — Same-Class Lesson Swap (`Tukar Waktu Kelas Sama & Tarikh Pulang Balik`):
 *    - Searches other teachers (`Teacher B`) who also teach the exact same Class `C` (`Tahun 1..6`).
 *    - Checks if `Teacher B` is present on `absentDate`, has zero clock-time overlap during `P1`, and daily periods <= 8.
 *    - Searches upcoming school days (`D_return > absentDate`, skipping weekends and `holidayDates`) where `Teacher B`
 *      teaches Class `C` at slot `P2`, and verifies `Teacher A` is present on `D_return` and free during `P2` (daily periods <= 8).
 *    - Creates a 2-Way Lesson Swap (`Tukar Waktu`) with editable `Tarikh Pulang Balik`.
 * 2) Priority 2 — Standard One-Way Relief (`Ganti Biasa - Tidak Perlu Pulang Balik`):
 *    - Fallback when no same-class teacher swap is available.
 * 3) Isolated Prasekolah Auto-Relief (`Ganti Prasekolah - Tidak Perlu Pulang Balik`):
 *    - When `Guru Prasekolah` is absent, loads Prasekolah blocks (`07:30-11:30`) and assigns available mainstream teachers
 *      with zero clock-time overlap and strictly NO lesson swap / NO payback date.
 */
export function generateAutoReliefPlan(params: {
  schedule: ScheduleGrid;
  academicYear: string;
  dateStr: string;
  dayOverride?: DayOfWeek;
  absentTeacherCodes: string[];
  teacherMapping: { list: TeacherDirectoryEntry[] };
  detectedAbsentTeachers?: DetectedAbsentTeacher[];
  manualOverrides?: Record<string, string>; // slotKey -> chosen substitute code
  repaymentDateOverrides?: Record<string, string>; // slotKey -> custom 'YYYY-MM-DD' Tarikh Pulang Balik
  prasekolahTimetable?: PrasekolahTimetableDoc | null;
  holidayDates?: string[]; // optional 'YYYY-MM-DD' school holiday dates to skip when finding D_return
  absenceRecords?: AbsenceSyncSourceRecord[];
  unavailabilityRecords?: AbsenceSyncSourceRecord[];
  suratAlerts?: Array<{
    id?: string;
    startDate?: string;
    endDate?: string;
    absentTeacherIds?: string[];
    perkara?: string;
    noRujukanLuar?: string;
    status?: string;
  }>;
}): AutoReliefPlan {
  const {
    schedule,
    academicYear,
    dateStr,
    dayOverride,
    absentTeacherCodes,
    teacherMapping: rawTeacherMapping,
    detectedAbsentTeachers = [],
    manualOverrides = {},
    repaymentDateOverrides = {},
    prasekolahTimetable = null,
    holidayDates = [],
    absenceRecords = [],
    unavailabilityRecords = [],
    suratAlerts = [],
  } = params;

  // Deduplicate teacherMapping.list by teacher code so no duplicate keys or candidates can ever occur
  const seenCodes = new Set<string>();
  const dedupedList: TeacherDirectoryEntry[] = [];
  (rawTeacherMapping?.list || []).forEach((t) => {
    const cleanCode = (t.code || '').trim().toUpperCase();
    if (!cleanCode || seenCodes.has(cleanCode)) return;
    seenCodes.add(cleanCode);
    dedupedList.push({
      ...t,
      code: cleanCode,
      num: dedupedList.length + 1,
    });
  });
  const teacherMapping = { list: dedupedList };

  const day: DayOfWeek = dayOverride || dateStrToDayOfWeek(dateStr) || 'ISNIN';
  const absentSet = new Set(absentTeacherCodes.map((c) => c.trim().toUpperCase()).filter(Boolean));
  const holidaySet = new Set(holidayDates.map((d) => d.trim()).filter(Boolean));
  const isT1Shifted = isKP2027Year1Active(academicYear);

  // Pre-compute schedules & loads for all 5 days of the week so D_return lookup is instantaneous
  const dayScheduleCache: Record<
    DayOfWeek,
    {
      busyIntervalsByTeacher: Record<string, BusyInterval[]>;
      baseLoadsByTeacher: Record<string, number>;
    }
  > = {
    ISNIN: computeTeacherDaySchedulesAndLoads(schedule, academicYear, teacherMapping, 'ISNIN', prasekolahTimetable),
    SELASA: computeTeacherDaySchedulesAndLoads(schedule, academicYear, teacherMapping, 'SELASA', prasekolahTimetable),
    RABU: computeTeacherDaySchedulesAndLoads(schedule, academicYear, teacherMapping, 'RABU', prasekolahTimetable),
    KHAMIS: computeTeacherDaySchedulesAndLoads(schedule, academicYear, teacherMapping, 'KHAMIS', prasekolahTimetable),
    JUMAAT: computeTeacherDaySchedulesAndLoads(schedule, academicYear, teacherMapping, 'JUMAAT', prasekolahTimetable),
  };

  const { busyIntervalsByTeacher, baseLoadsByTeacher } = dayScheduleCache[day];
  const { teachersByGrade, slotsByGradeAndDay } = buildClassWeeklyIndex(schedule, academicYear);

  // Cache of absent teacher codes on future dates D_return
  const futureAbsentCodesCache = new Map<string, Set<string>>();
  const getAbsentSetForFutureDate = (futureDateStr: string): Set<string> => {
    if (futureAbsentCodesCache.has(futureDateStr)) {
      return futureAbsentCodesCache.get(futureDateStr)!;
    }
    if (
      absenceRecords.length === 0 &&
      unavailabilityRecords.length === 0 &&
      suratAlerts.length === 0
    ) {
      const empty = new Set<string>();
      futureAbsentCodesCache.set(futureDateStr, empty);
      return empty;
    }
    const detected = detectAbsentTeachersForDate({
      dateStr: futureDateStr,
      teacherMapping,
      absenceRecords,
      unavailabilityRecords,
      suratAlerts,
    });
    const set = new Set(detected.map((d) => d.teacherCode.toUpperCase()));
    futureAbsentCodesCache.set(futureDateStr, set);
    return set;
  };

  interface RawFlaggedLesson {
    slotKey: string;
    grade: number; // 1..6 for mainstream, 0 for Prasekolah
    classLabel: string;
    day: DayOfWeek;
    slotId: string;
    slotLabel: string;
    timeLabel: string;
    startMinutes: number;
    endMinutes: number;
    periodLength: number;
    isYear1ShiftedMorning: boolean;
    isPKAR: boolean;
    isMembaca: boolean;
    isPrasekolah: boolean;
    ppmName?: string;
    subjectCode: string;
    subjectName: string;
    absentCodes: string[];
    presentCodes: string[];
  }

  const flaggedLessons: RawFlaggedLesson[] = [];

  if (absentSet.size > 0) {
    // 1. Mainstream Classes (Tahun 1 - Tahun 6)
    [1, 2, 3, 4, 5, 6].forEach((grade) => {
      const gradeSlots = getGradeDaySlots(grade, day, academicYear);
      let checkedPkar = false;

      gradeSlots.forEach((gs) => {
        if (gs.isRecess) return;

        // Special handling for Tahun 1 PKAR (09:30-09:45, +0.5 waktu)
        if (gs.slotId === 'PKAR') {
          if (!isT1Shifted || checkedPkar) return;
          checkedPkar = true;
          const pkarCell = schedule[1]?.[day]?.['PKAR'];
          const w4Cell = schedule[1]?.[day]?.['W4'];
          const rawTeacher =
            pkarCell?.teacherCode?.trim() ||
            (w4Cell && w4Cell.subjectCode?.toUpperCase() !== 'PN' ? w4Cell.teacherCode?.trim() : '') ||
            '';
          const teachers = parseTeacherCodes(rawTeacher);
          const absentHere = teachers.filter((tc) => absentSet.has(tc.toUpperCase()));
          if (absentHere.length > 0) {
            flaggedLessons.push({
              slotKey: `T1_${day}_PKAR`,
              grade: 1,
              classLabel: 'Tahun 1',
              day,
              slotId: 'PKAR',
              slotLabel: 'PKAR (T.1)',
              timeLabel: `${gs.startTime}-${gs.endTime}`,
              startMinutes: gs.startMinutes,
              endMinutes: gs.endMinutes,
              periodLength: pkarCell?.periodLength ?? 0.5,
              isYear1ShiftedMorning: false,
              isPKAR: true,
              isMembaca: false,
              isPrasekolah: false,
              subjectCode: 'PKAR',
              subjectName: 'PROGRAM PEMBENTUKAN KARAKTER (15m)',
              absentCodes: absentHere,
              presentCodes: teachers.filter((tc) => !absentSet.has(tc.toUpperCase())),
            });
          }
          return;
        }

        const cell = schedule[grade]?.[day]?.[gs.slotId];
        if (!cell || !cell.subjectCode) return;
        const upperSubj = cell.subjectCode.trim().toUpperCase();
        if (upperSubj === 'PN') return;

        const teachers = parseTeacherCodes(cell.teacherCode);
        const absentHere = teachers.filter((tc) => absentSet.has(tc.toUpperCase()));
        if (absentHere.length === 0) return;

        const isT1Morning =
          grade === 1 && isT1Shifted && ['W1', 'W2', 'W3', 'W4'].includes(gs.slotId);
        const len = cell.periodLength ?? (gs.slotId === 'MEMBACA' ? 0.5 : 1);

        flaggedLessons.push({
          slotKey: `T${grade}_${day}_${gs.slotId}`,
          grade,
          classLabel: `Tahun ${grade}`,
          day,
          slotId: gs.slotId,
          slotLabel: isT1Morning ? `${gs.label} (T.1)` : gs.label,
          timeLabel: `${gs.startTime}-${gs.endTime}`,
          startMinutes: gs.startMinutes,
          endMinutes: gs.endMinutes,
          periodLength: len,
          isYear1ShiftedMorning: isT1Morning,
          isPKAR: false,
          isMembaca: gs.slotId === 'MEMBACA',
          isPrasekolah: false,
          subjectCode: upperSubj,
          subjectName: cell.subjectName || upperSubj,
          absentCodes: absentHere,
          presentCodes: teachers.filter((tc) => !absentSet.has(tc.toUpperCase())),
        });
      });
    });

    // 2. Isolated Prasekolah Timetable Auto-Relief (One-Way Relief, No Payback)
    if (prasekolahTimetable && prasekolahTimetable.blocks?.[day]) {
      const praBlocks = prasekolahTimetable.blocks[day] || [];
      praBlocks.forEach((block, idx) => {
        if (block.isRecess || block.requiresRelief === false) return;
        const rawCode = (block.teacherCode || prasekolahTimetable.guruPrasekolahCode || '').trim();
        const teachers = parseTeacherCodes(rawCode);
        const absentHere = teachers.filter((tc) => absentSet.has(tc.toUpperCase()));
        if (absentHere.length === 0) return;

        const slotCode = block.slotCode || `PRA${idx + 1}`;
        flaggedLessons.push({
          slotKey: `PRA_${day}_${slotCode}`,
          grade: 0,
          classLabel: prasekolahTimetable.className || 'Prasekolah',
          day,
          slotId: slotCode,
          slotLabel: `${slotCode} (Prasekolah)`,
          timeLabel: `${block.startTime}-${block.endTime}`,
          startMinutes: block.startMinutes,
          endMinutes: block.endMinutes,
          periodLength: block.periodEquivalent ?? 1,
          isYear1ShiftedMorning: false,
          isPKAR: false,
          isMembaca: false,
          isPrasekolah: true,
          ppmName: block.ppmName || prasekolahTimetable.ppmName,
          subjectCode: 'PRASEKOLAH',
          subjectName: block.activityName
            ? `${block.activityName}${block.learningArea ? ` (${block.learningArea})` : ''}`
            : 'Aktiviti Pembelajaran Prasekolah',
          absentCodes: absentHere,
          presentCodes: teachers.filter((tc) => !absentSet.has(tc.toUpperCase())),
        });
      });
    }
  }

  // Sort chronologically by startMinutes, then mainstream (1..6) before Prasekolah (0) or by grade
  flaggedLessons.sort((a, b) => {
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
    return a.grade - b.grade;
  });

  // Track relief assignments iteratively so we never double-book a relief teacher on overlapping clock times
  const extraReliefIntervals: Record<string, BusyInterval[]> = {};
  const extraReliefLoad: Record<string, number> = {};
  const extraReliefCount: Record<string, number> = {};

  // Also track already-reserved payback return slots `(repaymentDate__grade__slotId)` and extra load on future date
  const usedRepaymentSlotKeys = new Set<string>();
  const futureExtraReturnLoad = new Map<string, number>(); // `${repaymentDate}__${teacherACode}` -> extra load

  teacherMapping.list.forEach((t) => {
    extraReliefIntervals[t.code] = [];
    extraReliefLoad[t.code] = 0;
    extraReliefCount[t.code] = 0;
  });

  const teacherNameMap = new Map(teacherMapping.list.map((t) => [t.code, t.name]));

  /**
   * Searches upcoming school days `D_return > absentDate` (or honors `customRepaymentDate` if provided)
   * where `substituteCode` (`Teacher B`) teaches `grade` (`Class C`) at slot `P2`, and verifies that
   * `absentCode` (`Teacher A`) is present on `D_return`, has zero clock-time overlap during `P2`,
   * and `Teacher A`'s projected daily load on `D_return` is <= 8.0.
   */
  const findRepaymentSlotForSwap = (paramsSwap: {
    grade: number;
    absentCode: string;
    absentSubjectCode: string;
    absentSubjectName: string;
    substituteCode: string;
    customRepaymentDate?: string;
    reserveIfFound?: boolean;
  }): RepaymentReturnSlotInfo | undefined => {
    const {
      grade,
      absentCode,
      absentSubjectCode,
      absentSubjectName,
      substituteCode,
      customRepaymentDate,
      reserveIfFound = false,
    } = paramsSwap;

    if (grade < 1 || grade > 6) return undefined;

    const tryCandidateDate = (candDateStr: string, relaxAbsentTeacherOverlap = false): RepaymentReturnSlotInfo | undefined => {
      const candDay = dateStrToDayOfWeek(candDateStr);
      if (!candDay) return undefined;
      if (holidaySet.has(candDateStr)) return undefined;

      const futureAbsentSet = getAbsentSetForFutureDate(candDateStr);
      if (
        !relaxAbsentTeacherOverlap &&
        (futureAbsentSet.has(absentCode.toUpperCase()) || futureAbsentSet.has(substituteCode.toUpperCase()))
      ) {
        return undefined;
      }

      const classDaySlots = slotsByGradeAndDay[grade]?.[candDay] || [];
      const dayCache = dayScheduleCache[candDay];
      const teacherABusy = dayCache.busyIntervalsByTeacher[absentCode] || [];
      const teacherABaseLoad = dayCache.baseLoadsByTeacher[absentCode] || 0;
      const teacherAExtraSoFar = futureExtraReturnLoad.get(`${candDateStr}__${absentCode}`) || 0;

      for (const p2 of classDaySlots) {
        // Teacher B must teach Class C at P2 (and not co-teaching with Teacher A already)
        const bTeachesP2 = p2.teacherCodes.some((c) => c.toUpperCase() === substituteCode.toUpperCase());
        const aAlreadyInP2 = p2.teacherCodes.some((c) => c.toUpperCase() === absentCode.toUpperCase());
        if (!bTeachesP2 || aAlreadyInP2) continue;

        const repayKey = `${candDateStr}__G${grade}__${p2.slotId}`;
        if (usedRepaymentSlotKeys.has(repayKey)) continue;

        if (!relaxAbsentTeacherOverlap) {
          // Verify Teacher A has zero clock-time overlap during P2 on D_return
          const hasOverlap = teacherABusy.some((b) =>
            checkIntervalOverlap(p2.startMinutes, p2.endMinutes, b.startMinutes, b.endMinutes)
          );
          if (hasOverlap) continue;

          // Verify Teacher A's daily load on D_return stays <= 8.0
          // Note: On D_return, if D_return is the same day of week as a day where Teacher A normally teaches,
          // Teacher A is taking P2 (+p2.periodLength).
          const projectedReturnLoad = teacherABaseLoad + teacherAExtraSoFar + p2.periodLength;
          if (projectedReturnLoad > 8.0 + 1e-6) continue;
        }

        if (reserveIfFound) {
          usedRepaymentSlotKeys.add(repayKey);
          futureExtraReturnLoad.set(
            `${candDateStr}__${absentCode}`,
            teacherAExtraSoFar + p2.periodLength
          );
        }

        return {
          repaymentDate: candDateStr,
          repaymentDay: candDay,
          repaymentSlotId: p2.slotId,
          repaymentSlotLabel: p2.slotLabel,
          repaymentTimeLabel: p2.timeLabel,
          startMinutes: p2.startMinutes,
          endMinutes: p2.endMinutes,
          substituteOriginalSubjectCode: p2.subjectCode,
          substituteOriginalSubjectName: p2.subjectName,
          absentTeacherReturnSubjectCode: absentSubjectCode,
          absentTeacherReturnSubjectName: absentSubjectName,
        };
      }

      return undefined;
    };

    // If user manually selected a custom Tarikh Pulang Balik date in the date picker:
    if (customRepaymentDate && /^\d{4}-\d{2}-\d{2}$/.test(customRepaymentDate.trim())) {
      const cleanCustom = customRepaymentDate.trim();
      const strictMatch = tryCandidateDate(cleanCustom, false);
      if (strictMatch) return strictMatch;
      const relaxedMatch = tryCandidateDate(cleanCustom, true);
      if (relaxedMatch) return relaxedMatch;

      // Even if Teacher B doesn't have a scheduled slot on that exact day, preserve the user's chosen date
      // and attach Teacher B's first weekly subject in Class C
      const customDay = dateStrToDayOfWeek(cleanCustom) || 'ISNIN';
      const bSubjects = Array.from(teachersByGrade[grade]?.get(substituteCode) || []);
      const bSubj = bSubjects[0] || absentSubjectCode;
      return {
        repaymentDate: cleanCustom,
        repaymentDay: customDay,
        repaymentSlotId: 'W-PILIHAN',
        repaymentSlotLabel: `Waktu Kelas (${customDay})`,
        repaymentTimeLabel: 'Mengikut Jadual Kelas',
        startMinutes: 450,
        endMinutes: 480,
        substituteOriginalSubjectCode: bSubj,
        substituteOriginalSubjectName: bSubj,
        absentTeacherReturnSubjectCode: absentSubjectCode,
        absentTeacherReturnSubjectName: absentSubjectName,
      };
    }

    // Search upcoming school days D_return > absentDate (up to 28 calendar days ahead)
    for (let offset = 1; offset <= 28; offset++) {
      const candDate = addDaysToDateStr(dateStr, offset);
      const matched = tryCandidateDate(candDate, false);
      if (matched) return matched;
    }

    return undefined;
  };

  const resultSlots: AutoReliefSlotItem[] = flaggedLessons.map((lesson) => {
    const primaryAbsentCode = lesson.absentCodes[0] || '';
    const primaryAbsentName = teacherNameMap.get(primaryAbsentCode) || primaryAbsentCode;
    const isSwappableMainstreamLesson =
      !lesson.isPrasekolah &&
      !lesson.isPKAR &&
      !lesson.isMembaca &&
      lesson.grade >= 1 &&
      lesson.grade <= 6 &&
      lesson.slotId !== 'TASMIK';

    const classTeachersMap = teachersByGrade[lesson.grade] || new Map<string, Set<string>>();
    const customRepayDate = repaymentDateOverrides[lesson.slotKey];

    const isTeacherFreeAtSlot = (tCode: string): boolean => {
      if (absentSet.has(tCode.toUpperCase())) return false;
      const regularBusy = busyIntervalsByTeacher[tCode] || [];
      for (const b of regularBusy) {
        if (checkIntervalOverlap(lesson.startMinutes, lesson.endMinutes, b.startMinutes, b.endMinutes)) {
          return false;
        }
      }
      const reliefBusy = extraReliefIntervals[tCode] || [];
      for (const r of reliefBusy) {
        if (checkIntervalOverlap(lesson.startMinutes, lesson.endMinutes, r.startMinutes, r.endMinutes)) {
          return false;
        }
      }
      return true;
    };

    const freeCandidates: ReliefCandidateOption[] = teacherMapping.list
      .filter((t) => isTeacherFreeAtSlot(t.code))
      .map((t) => {
        const base = Math.round((baseLoadsByTeacher[t.code] || 0) * 10) / 10;
        const relBefore = Math.round((extraReliefLoad[t.code] || 0) * 10) / 10;
        const projected = Math.round((base + relBefore + lesson.periodLength) * 10) / 10;
        const withinCap = projected <= 8.0 + 1e-6;

        const sameClassSubjSet = classTeachersMap.get(t.code);
        const isSameClassTeacher =
          isSwappableMainstreamLesson &&
          Boolean(sameClassSubjSet && sameClassSubjSet.size > 0) &&
          !lesson.absentCodes.some((ac) => ac.toUpperCase() === t.code.toUpperCase());

        let repaymentInfo: RepaymentReturnSlotInfo | undefined;
        if (isSameClassTeacher && withinCap && primaryAbsentCode) {
          repaymentInfo = findRepaymentSlotForSwap({
            grade: lesson.grade,
            absentCode: primaryAbsentCode,
            absentSubjectCode: lesson.subjectCode,
            absentSubjectName: lesson.subjectName,
            substituteCode: t.code,
            customRepaymentDate: customRepayDate,
            reserveIfFound: false,
          });
        }

        const candidateMode: ReliefAssignmentMode = lesson.isPrasekolah
          ? 'GANTI_PRASEKOLAH'
          : isSameClassTeacher && repaymentInfo
          ? 'TUKAR_WAKTU_KELAS_SAMA'
          : 'GANTI_BIASA';

        return {
          code: t.code,
          name: t.name,
          num: t.num,
          baseDayLoad: base,
          assignedReliefLoadBefore: relBefore,
          projectedDayLoad: projected,
          assignedReliefCount: extraReliefCount[t.code] || 0,
          isWithinEightPeriodCap: withinCap,
          isSameClassTeacher,
          sameClassSubjects: sameClassSubjSet ? Array.from(sameClassSubjSet) : [],
          reliefMode: candidateMode,
          repaymentInfo,
        };
      })
      .sort((a, b) => {
        // 1. Prefer staying within <= 8.0 daily cap
        if (a.isWithinEightPeriodCap !== b.isWithinEightPeriodCap) {
          return a.isWithinEightPeriodCap ? -1 : 1;
        }
        // 2. PRIORITY 1: For mainstream classes, prioritize Same-Class Lesson Swap (TUKAR_WAKTU_KELAS_SAMA)
        const aIsSwap = a.reliefMode === 'TUKAR_WAKTU_KELAS_SAMA';
        const bIsSwap = b.reliefMode === 'TUKAR_WAKTU_KELAS_SAMA';
        if (aIsSwap !== bIsSwap) {
          return aIsSwap ? -1 : 1;
        }
        // If both are Same-Class Swap candidates, prefer earliest repaymentDate, then lightest daily load
        if (aIsSwap && bIsSwap && a.repaymentInfo && b.repaymentInfo) {
          if (a.repaymentInfo.repaymentDate !== b.repaymentInfo.repaymentDate) {
            return a.repaymentInfo.repaymentDate.localeCompare(b.repaymentInfo.repaymentDate);
          }
        }
        // 3. Lightest current daily workload (base + relief so far) ascending
        const aCurrent = a.baseDayLoad + a.assignedReliefLoadBefore;
        const bCurrent = b.baseDayLoad + b.assignedReliefLoadBefore;
        if (Math.abs(aCurrent - bCurrent) > 1e-6) {
          return aCurrent - bCurrent;
        }
        // 4. Fewest relief periods assigned today ascending
        if (a.assignedReliefCount !== b.assignedReliefCount) {
          return a.assignedReliefCount - b.assignedReliefCount;
        }
        // 5. Deterministic tie-break by roster number
        return a.num - b.num;
      });

    const recommendedCode = freeCandidates[0]?.code || '';
    const overrideCode = manualOverrides[lesson.slotKey];
    const chosenCode =
      overrideCode && freeCandidates.some((c) => c.code === overrideCode)
        ? overrideCode
        : recommendedCode;

    const chosenCandidate = freeCandidates.find((c) => c.code === chosenCode);
    const chosenName = chosenCandidate?.name || teacherNameMap.get(chosenCode) || chosenCode;

    // Finalize reservation for the chosen candidate
    let finalRepaymentInfo: RepaymentReturnSlotInfo | undefined;
    let finalReliefMode: ReliefAssignmentMode = lesson.isPrasekolah
      ? 'GANTI_PRASEKOLAH'
      : 'GANTI_BIASA';

    if (chosenCode) {
      extraReliefIntervals[chosenCode] = extraReliefIntervals[chosenCode] || [];
      extraReliefIntervals[chosenCode].push({
        startMinutes: lesson.startMinutes,
        endMinutes: lesson.endMinutes,
        grade: lesson.grade,
        slotId: lesson.slotId,
        subjectCode: `GANTI:${lesson.subjectCode}`,
      });
      extraReliefLoad[chosenCode] = (extraReliefLoad[chosenCode] || 0) + lesson.periodLength;
      extraReliefCount[chosenCode] = (extraReliefCount[chosenCode] || 0) + 1;

      if (
        !lesson.isPrasekolah &&
        chosenCandidate?.isSameClassTeacher &&
        chosenCandidate.isWithinEightPeriodCap &&
        primaryAbsentCode
      ) {
        finalRepaymentInfo = findRepaymentSlotForSwap({
          grade: lesson.grade,
          absentCode: primaryAbsentCode,
          absentSubjectCode: lesson.subjectCode,
          absentSubjectName: lesson.subjectName,
          substituteCode: chosenCode,
          customRepaymentDate: customRepayDate,
          reserveIfFound: true,
        });
        if (finalRepaymentInfo) {
          finalReliefMode = 'TUKAR_WAKTU_KELAS_SAMA';
        }
      }
    }

    const reliefModeLabel =
      finalReliefMode === 'TUKAR_WAKTU_KELAS_SAMA'
        ? 'Tukar Waktu Kelas Sama'
        : finalReliefMode === 'GANTI_PRASEKOLAH'
        ? 'Ganti Prasekolah (Tidak Perlu Pulang Balik)'
        : 'Ganti Biasa (Tidak Perlu Pulang Balik)';

    const requiresRepayment = finalReliefMode === 'TUKAR_WAKTU_KELAS_SAMA';

    const substituteTeachingSubjectCode =
      finalReliefMode === 'TUKAR_WAKTU_KELAS_SAMA' && finalRepaymentInfo
        ? finalRepaymentInfo.substituteOriginalSubjectCode
        : lesson.subjectCode;

    const substituteTeachingSubjectName =
      finalReliefMode === 'TUKAR_WAKTU_KELAS_SAMA' && finalRepaymentInfo
        ? finalRepaymentInfo.substituteOriginalSubjectName
        : lesson.subjectName;

    const swapSummaryText =
      finalReliefMode === 'TUKAR_WAKTU_KELAS_SAMA' && finalRepaymentInfo
        ? `Hari Ini (${dateStr}, ${lesson.slotLabel} ${lesson.timeLabel}): ${chosenCode} masuk ${lesson.classLabel} ajar ${substituteTeachingSubjectCode} · Pulang Balik (${finalRepaymentInfo.repaymentDate} ${finalRepaymentInfo.repaymentDay}, ${finalRepaymentInfo.repaymentSlotLabel} ${finalRepaymentInfo.repaymentTimeLabel}): ${primaryAbsentCode} masuk ${lesson.classLabel} ajar ${lesson.subjectCode}`
        : finalReliefMode === 'GANTI_PRASEKOLAH'
        ? `Ganti Prasekolah Sehala (${lesson.timeLabel}) — Tidak Perlu Pulang Balik`
        : `Ganti Biasa Sehala (${lesson.timeLabel}) — Tidak Perlu Pulang Balik`;

    const whatsappNotificationText =
      finalReliefMode === 'TUKAR_WAKTU_KELAS_SAMA' && finalRepaymentInfo
        ? `*[TUKAR WAKTU KELAS SAMA — ${lesson.classLabel.toUpperCase()}]*\n` +
          `• Tarikh Semasa: ${dateStr} (${day}) | ${lesson.slotLabel} (${lesson.timeLabel})\n` +
          `• Guru Tidak Hadir: ${primaryAbsentName} (${primaryAbsentCode})\n` +
          `• Guru Masuk (Tukar Waktu): *${chosenName} (${chosenCode})* — Ajar Subjek *${substituteTeachingSubjectCode}*\n` +
          `• *Tarikh Pulang Balik*: *${finalRepaymentInfo.repaymentDate} (${finalRepaymentInfo.repaymentDay})* | ${finalRepaymentInfo.repaymentSlotLabel} (${finalRepaymentInfo.repaymentTimeLabel})\n` +
          `• Pulang Balik Oleh: *${primaryAbsentName} (${primaryAbsentCode})* masuk ${lesson.classLabel} ajar *${lesson.subjectCode}*`
        : finalReliefMode === 'GANTI_PRASEKOLAH'
        ? `*[GANTI PRASEKOLAH — TIDAK PERLU PULANG BALIK]*\n` +
          `• Tarikh: ${dateStr} (${day}) | ${lesson.slotLabel} (${lesson.timeLabel})\n` +
          `• Kelas: ${lesson.classLabel} | Aktiviti: ${lesson.subjectName}\n` +
          `• Guru Prasekolah Tidak Hadir: ${primaryAbsentName} (${primaryAbsentCode})\n` +
          `• Guru Ganti Ditugaskan: *${chosenName} (${chosenCode})*\n` +
          `• Status: *Ganti Prasekolah (Tidak Perlu Pulang Balik)*`
        : `*[GANTI BIASA — TIDAK PERLU PULANG BALIK]*\n` +
          `• Tarikh: ${dateStr} (${day}) | ${lesson.slotLabel} (${lesson.timeLabel})\n` +
          `• Kelas: ${lesson.classLabel} | Subjek: ${lesson.subjectCode} (${lesson.subjectName})\n` +
          `• Guru Tidak Hadir: ${primaryAbsentName} (${primaryAbsentCode})\n` +
          `• Guru Ganti Ditugaskan: *${chosenName} (${chosenCode})*\n` +
          `• Status: *Ganti Biasa (Tidak Perlu Pulang Balik)*`;

    return {
      slotKey: lesson.slotKey,
      grade: lesson.grade,
      classLabel: lesson.classLabel,
      day,
      slotId: lesson.slotId,
      slotLabel: lesson.slotLabel,
      timeLabel: lesson.timeLabel,
      startMinutes: lesson.startMinutes,
      endMinutes: lesson.endMinutes,
      periodLength: lesson.periodLength,
      isYear1ShiftedMorning: lesson.isYear1ShiftedMorning,
      isPKAR: lesson.isPKAR,
      isMembaca: lesson.isMembaca,
      isPrasekolah: lesson.isPrasekolah,
      ppmName: lesson.ppmName,
      subjectCode: lesson.subjectCode,
      subjectName: lesson.subjectName,
      absentTeacherCodes: lesson.absentCodes,
      absentTeacherNames: lesson.absentCodes.map((c) => teacherNameMap.get(c) || c),
      presentCoTeacherCodes: lesson.presentCodes,
      recommendedSubstituteCode: recommendedCode,
      assignedSubstituteCode: chosenCode,
      assignedSubstituteName: chosenName,
      reliefMode: finalReliefMode,
      reliefModeLabel,
      requiresRepayment,
      substituteTeachingSubjectCode,
      substituteTeachingSubjectName,
      repaymentDate: finalRepaymentInfo?.repaymentDate,
      repaymentDay: finalRepaymentInfo?.repaymentDay,
      repaymentSlotId: finalRepaymentInfo?.repaymentSlotId,
      repaymentSlotLabel: finalRepaymentInfo?.repaymentSlotLabel,
      repaymentTimeLabel: finalRepaymentInfo?.repaymentTimeLabel,
      repaymentSubjectCode: finalRepaymentInfo?.absentTeacherReturnSubjectCode,
      repaymentSubjectName: finalRepaymentInfo?.absentTeacherReturnSubjectName,
      swapSummaryText,
      whatsappNotificationText,
      recommendedCandidates: freeCandidates,
    };
  });

  const teacherProjectedDayLoads: Record<string, number> = {};
  teacherMapping.list.forEach((t) => {
    teacherProjectedDayLoads[t.code] =
      Math.round(((baseLoadsByTeacher[t.code] || 0) + (extraReliefLoad[t.code] || 0)) * 10) / 10;
  });

  // Build normalized absentTeachers array including manual toggles not in detectedAbsentTeachers
  const detectedByCode = new Map(detectedAbsentTeachers.map((d) => [d.teacherCode, d]));
  const finalAbsentList: DetectedAbsentTeacher[] = Array.from(absentSet).map((codeUpper) => {
    const tObj = teacherMapping.list.find((t) => t.code.toUpperCase() === codeUpper);
    const code = tObj?.code || codeUpper;
    const det = detectedByCode.get(code);
    if (det) return det;
    return {
      teacherCode: code,
      teacherName: tObj?.name || code,
      sources: ['Pilihan Manual'],
      reasonSummary: 'Ditanda Tidak Hadir',
    };
  });

  const totalAutoAssigned = resultSlots.filter((s) => Boolean(s.assignedSubstituteCode)).length;
  const year1MorningAndPkarCount = resultSlots.filter(
    (s) => s.isYear1ShiftedMorning || s.isPKAR || s.isMembaca
  ).length;
  const sameClassSwapCount = resultSlots.filter(
    (s) => s.reliefMode === 'TUKAR_WAKTU_KELAS_SAMA'
  ).length;
  const prasekolahReliefCount = resultSlots.filter(
    (s) => s.reliefMode === 'GANTI_PRASEKOLAH'
  ).length;
  const standardOneWayCount = resultSlots.filter(
    (s) => s.reliefMode === 'GANTI_BIASA'
  ).length;

  return {
    dateStr,
    day,
    absentTeachers: finalAbsentList,
    slots: resultSlots,
    teacherBaseDayLoads: baseLoadsByTeacher,
    teacherProjectedDayLoads,
    summary: {
      totalFlagged: resultSlots.length,
      totalAutoAssigned,
      unassignedCount: resultSlots.length - totalAutoAssigned,
      year1MorningAndPkarCount,
      sameClassSwapCount,
      standardOneWayCount,
      prasekolahReliefCount,
    },
  };
}

/**
 * Generates a formatted WhatsApp broadcast message for the entire day's Relief & Lesson Swap plan.
 */
export function buildFullDayWhatsAppReliefText(
  plan: AutoReliefPlan,
  schoolName = 'SJK (C) CHUNG HUA BALINGIAN'
): string {
  const lines: string[] = [
    `*📌 JADUAL GURU GANTI & TUKAR WAKTU (${schoolName.toUpperCase()})*`,
    `📅 Tarikh: *${plan.dateStr} (${plan.day})*`,
    `👥 Guru Tidak Hadir: ${
      plan.absentTeachers.map((t) => `${t.teacherName} (${t.teacherCode})`).join(', ') || 'Tiada'
    }`,
    `----------------------------------------`,
  ];

  plan.slots.forEach((slot, idx) => {
    const subCode = slot.assignedSubstituteCode || 'BELUM DITUGASKAN';
    const subName = slot.assignedSubstituteName || subCode;
    const absCode = slot.absentTeacherCodes.join('/');

    if (slot.reliefMode === 'TUKAR_WAKTU_KELAS_SAMA' && slot.repaymentDate) {
      lines.push(
        `*${idx + 1}. [${slot.classLabel}] ${slot.slotLabel} (${slot.timeLabel})* — 🔄 *TUKAR WAKTU KELAS SAMA*`
      );
      lines.push(
        `   • Hari Ini (${plan.dateStr}): *${subName} (${subCode})* masuk ajar *${slot.substituteTeachingSubjectCode || slot.subjectCode}* (Ganti ${absCode})`
      );
      lines.push(
        `   • *Tarikh Pulang Balik*: *${slot.repaymentDate} (${slot.repaymentDay || ''})* pada *${slot.repaymentSlotLabel} (${slot.repaymentTimeLabel})* — *${absCode}* masuk ajar *${slot.repaymentSubjectCode || slot.subjectCode}*`
      );
    } else if (slot.reliefMode === 'GANTI_PRASEKOLAH') {
      lines.push(
        `*${idx + 1}. [${slot.classLabel}] ${slot.slotLabel} (${slot.timeLabel})* — 🧸 *GANTI PRASEKOLAH (TIDAK PERLU PULANG BALIK)*`
      );
      lines.push(
        `   • Aktiviti: ${slot.subjectName}`
      );
      lines.push(
        `   • Guru Ganti: *${subName} (${subCode})* (Ganti ${absCode} — Tiada Pulang Balik)`
      );
    } else {
      lines.push(
        `*${idx + 1}. [${slot.classLabel}] ${slot.slotLabel} (${slot.timeLabel})* — ✅ *GANTI BIASA (TIDAK PERLU PULANG BALIK)*`
      );
      lines.push(
        `   • Subjek Asal: ${slot.subjectCode} (${absCode}) → Guru Ganti: *${subName} (${subCode})*`
      );
    }
  });

  lines.push(`----------------------------------------`);
  lines.push(
    `📊 Ringkasan: ${plan.summary.sameClassSwapCount} Tukar Waktu Kelas Sama | ${plan.summary.standardOneWayCount} Ganti Biasa | ${plan.summary.prasekolahReliefCount} Ganti Prasekolah`
  );

  return lines.join('\n');
}
