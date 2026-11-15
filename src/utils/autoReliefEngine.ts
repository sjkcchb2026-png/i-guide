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

export interface ReliefCandidateOption {
  code: string;
  name: string;
  num: number;
  baseDayLoad: number;
  assignedReliefLoadBefore: number;
  projectedDayLoad: number;
  assignedReliefCount: number;
  isWithinEightPeriodCap: boolean;
}

export interface AutoReliefSlotItem {
  slotKey: string; // e.g. `T1_ISNIN_W1`
  grade: number;
  classLabel: string;
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
  subjectCode: string;
  subjectName: string;
  absentTeacherCodes: string[];
  absentTeacherNames: string[];
  presentCoTeacherCodes: string[];
  recommendedSubstituteCode: string;
  assignedSubstituteCode: string;
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
  };
}

interface BusyInterval {
  startMinutes: number;
  endMinutes: number;
  grade: number;
  slotId: string;
  subjectCode: string;
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
 */
export function computeTeacherDaySchedulesAndLoads(
  schedule: ScheduleGrid,
  academicYear: string,
  teacherMapping: { list: TeacherDirectoryEntry[] },
  day: DayOfWeek
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

  return { busyIntervalsByTeacher, baseLoadsByTeacher };
}

/**
 * Generates an Auto-Relief (Guru Ganti Automatik) plan for a given date & absent teacher codes.
 * Enforces:
 * - Zero real-clock-time interval overlap (comparing Tahun 1 shifted 07:30-09:30 & PKAR 09:30-09:45 accurately against Tahun 2-6 07:15-09:45)
 * - No double-booking of a substitute teacher onto two overlapping relief slots
 * - Lightest daily workload priority (base load + already-assigned relief load ascending)
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
}): AutoReliefPlan {
  const {
    schedule,
    academicYear,
    dateStr,
    dayOverride,
    absentTeacherCodes,
    teacherMapping,
    detectedAbsentTeachers = [],
    manualOverrides = {},
  } = params;

  const day: DayOfWeek = dayOverride || dateStrToDayOfWeek(dateStr) || 'ISNIN';
  const absentSet = new Set(absentTeacherCodes.map((c) => c.trim().toUpperCase()).filter(Boolean));
  const isT1Shifted = isKP2027Year1Active(academicYear);

  const { busyIntervalsByTeacher, baseLoadsByTeacher } = computeTeacherDaySchedulesAndLoads(
    schedule,
    academicYear,
    teacherMapping,
    day
  );

  // Collect all lessons belonging to absent teachers on `day`
  interface RawFlaggedLesson {
    slotKey: string;
    grade: number;
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
    subjectCode: string;
    subjectName: string;
    absentCodes: string[];
    presentCodes: string[];
  }

  const flaggedLessons: RawFlaggedLesson[] = [];

  if (absentSet.size > 0) {
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
          subjectCode: upperSubj,
          subjectName: cell.subjectName || upperSubj,
          absentCodes: absentHere,
          presentCodes: teachers.filter((tc) => !absentSet.has(tc.toUpperCase())),
        });
      });
    });
  }

  // Sort chronologically by startMinutes, then grade
  flaggedLessons.sort((a, b) => {
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
    return a.grade - b.grade;
  });

  // Track relief assignments iteratively so we never double-book a relief teacher on overlapping clock times
  const extraReliefIntervals: Record<string, BusyInterval[]> = {};
  const extraReliefLoad: Record<string, number> = {};
  const extraReliefCount: Record<string, number> = {};

  teacherMapping.list.forEach((t) => {
    extraReliefIntervals[t.code] = [];
    extraReliefLoad[t.code] = 0;
    extraReliefCount[t.code] = 0;
  });

  const teacherNameMap = new Map(teacherMapping.list.map((t) => [t.code, t.name]));

  // First honor any explicit manual overrides for busy reservation? No — process sequentially in chronological order,
  // checking eligibility for all candidates at each slot while honoring manualOverride if valid.
  const resultSlots: AutoReliefSlotItem[] = flaggedLessons.map((lesson) => {
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
        return {
          code: t.code,
          name: t.name,
          num: t.num,
          baseDayLoad: base,
          assignedReliefLoadBefore: relBefore,
          projectedDayLoad: projected,
          assignedReliefCount: extraReliefCount[t.code] || 0,
          isWithinEightPeriodCap: projected <= 8.0 + 1e-6,
        };
      })
      .sort((a, b) => {
        // 1. Prefer staying within <= 8.0 daily cap
        if (a.isWithinEightPeriodCap !== b.isWithinEightPeriodCap) {
          return a.isWithinEightPeriodCap ? -1 : 1;
        }
        // 2. Lightest current daily workload (base + relief so far) ascending
        const aCurrent = a.baseDayLoad + a.assignedReliefLoadBefore;
        const bCurrent = b.baseDayLoad + b.assignedReliefLoadBefore;
        if (Math.abs(aCurrent - bCurrent) > 1e-6) {
          return aCurrent - bCurrent;
        }
        // 3. Fewest relief periods assigned today ascending
        if (a.assignedReliefCount !== b.assignedReliefCount) {
          return a.assignedReliefCount - b.assignedReliefCount;
        }
        // 4. Deterministic tie-break by roster number
        return a.num - b.num;
      });

    const recommendedCode = freeCandidates[0]?.code || '';
    const overrideCode = manualOverrides[lesson.slotKey];
    const chosenCode =
      overrideCode && freeCandidates.some((c) => c.code === overrideCode)
        ? overrideCode
        : recommendedCode;

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
    }

    return {
      slotKey: lesson.slotKey,
      grade: lesson.grade,
      classLabel: `Tahun ${lesson.grade}`,
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
      subjectCode: lesson.subjectCode,
      subjectName: lesson.subjectName,
      absentTeacherCodes: lesson.absentCodes,
      absentTeacherNames: lesson.absentCodes.map((c) => teacherNameMap.get(c) || c),
      presentCoTeacherCodes: lesson.presentCodes,
      recommendedSubstituteCode: recommendedCode,
      assignedSubstituteCode: chosenCode,
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
    },
  };
}
