import {
  UserProfile,
  AttendanceRecord,
  StaffAbsenceRecord,
  SchoolCalendarDay,
  MonthlyAnalysisStaffMetric,
  MonthlyAnalysisOverall,
  DailyAttendanceStatusInfo,
  EarliestRecordItem,
  AbsenceCategoryType
} from '../types';
import { MALAYSIA_TIMEZONE } from './date';

/**
 * Standard public holidays in Sarawak, Malaysia (SJK(C) Chung Hua Balingian)
 * Used as fallback reference when custom takwim calendar is not uploaded.
 */
export const DEFAULT_SARAWAK_HOLIDAYS_2026: Record<string, string> = {
  '2026-01-01': 'Tahun Baharu 2026 (元旦新年)',
  '2026-02-17': 'Tahun Baharu Cina Hari Pertama (农历正月初一)',
  '2026-02-18': 'Tahun Baharu Cina Hari Kedua (农历正月初二)',
  '2026-03-20': 'Hari Raya Aidilfitri Hari Pertama (开斋节首日)',
  '2026-03-21': 'Hari Raya Aidilfitri Hari Kedua (开斋节次日)',
  '2026-04-03': 'Good Friday (耶稣受难节 - 砂拉越公休)',
  '2026-05-01': 'Hari Pekerja (劳动节)',
  '2026-05-27': 'Hari Raya Haji (哈芝节)',
  '2026-05-31': 'Hari Wesak (卫塞节)',
  '2026-06-01': 'Hari Gawai Dayak Hari Pertama (达雅节首日 - 砂拉越公休)',
  '2026-06-02': 'Hari Gawai Dayak Hari Kedua (达雅节次日 - 砂拉越公休)',
  '2026-06-08': 'Hari Keputeraan YDP Agong (国家元首诞辰)',
  '2026-06-16': 'Awal Muharram (回历新年)',
  '2026-07-22': 'Hari Kemerdekaan Sarawak (砂拉越独立日 - 砂拉越公休)',
  '2026-08-25': 'Maulidur Rasul (先知穆罕默德诞辰)',
  '2026-08-31': 'Hari Kebangsaan (马来西亚国庆日)',
  '2026-09-16': 'Hari Malaysia (马来西亚日)',
  '2026-10-10': 'Hari Jadi Yang di-Pertua Negeri Sarawak (砂拉越州元首华诞)',
  '2026-11-08': 'Hari Deepavali (屠妖节)',
  '2026-12-25': 'Hari Krismas (圣诞节)',
};

/**
 * Reason metadata dictionary
 */
export const ABSENCE_REASON_MAP: Record<string, { labelZh: string; labelMs: string; isOfficial: boolean; color: string }> = {
  MESYUARAT: { labelZh: '官方会议 (Mesyuarat)', labelMs: 'Mesyuarat Rasmi', isOfficial: true, color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  PERTANDINGAN: { labelZh: '带队比赛 (Pertandingan)', labelMs: 'Membawa Pasukan Pertandingan', isOfficial: true, color: 'bg-sky-500/20 text-sky-300 border-sky-500/30' },
  KURSUS: { labelZh: '培训课程 (Kursus)', labelMs: 'Kursus Latihan', isOfficial: true, color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
  URUSAN_RASMI: { labelZh: '公务外出 (Urusan Rasmi)', labelMs: 'Urusan Rasmi', isOfficial: true, color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  BENGKEL: { labelZh: '工作坊/研讨 (Bengkel)', labelMs: 'Bengkel / Seminar', isOfficial: true, color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  TAKLIMAT: { labelZh: '官方简报会 (Taklimat)', labelMs: 'Taklimat Rasmi', isOfficial: true, color: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
  CRK: { labelZh: '特别事假 (CRK)', labelMs: 'Cuti Rehat Khas', isOfficial: false, color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  CUTI_SAKIT: { labelZh: '病假 (Cuti Sakit / MC)', labelMs: 'Cuti Sakit (Sijil Sakit)', isOfficial: false, color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
  CUTI_BARAH: { labelZh: '重病假 (Cuti Barah/Berat)', labelMs: 'Cuti Barah / Penyakit Berat', isOfficial: false, color: 'bg-red-500/20 text-red-300 border-red-500/30' },
  CUTI_BERSALIN: { labelZh: '产假/陪产假 (Bersalin)', labelMs: 'Cuti Bersalin / Paterniti', isOfficial: false, color: 'bg-pink-500/20 text-pink-300 border-pink-500/30' },
  CUTI_HAJI: { labelZh: '朝觐假 (Cuti Haji/Umrah)', labelMs: 'Cuti Haji / Umrah', isOfficial: false, color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  CUTI_KUARANTIN: { labelZh: '隔离假 (Kuarantin)', labelMs: 'Cuti Kuarantin', isOfficial: false, color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  CUTI_LAIN: { labelZh: '其他批准假期 (Cuti Lain)', labelMs: 'Cuti Lain Yang Diluluskan', isOfficial: false, color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  PERLU_PENGESAHAN: { labelZh: '待核实 (未打卡/未申报)', labelMs: 'Perlu Pengesahan (Tiada Rekod)', isOfficial: false, color: 'bg-slate-700/60 text-slate-300 border-slate-600' },
};

/**
 * 确定人员在统计分析中的有效分类：
 * 校长 (PRINCIPAL) 与副校长 (PK) 属于教师类别 (GURU)，绝不要因管理角色而被归类为 AKP！
 */
export function getEffectiveStaffCategory(user: UserProfile): 'GURU' | 'AKP' {
  if (user.role === 'PRINCIPAL' || user.category === 'PRINCIPAL') {
    return 'GURU';
  }
  if (user.category === 'GURU') {
    return 'GURU';
  }
  const email = (user.email || '').toLowerCase().trim();
  if (email.endsWith('@moe-dl.edu.my') || user.name.toUpperCase().includes('GURU BESAR') || user.name.toUpperCase().includes('PK ')) {
    return 'GURU';
  }
  return 'AKP';
}

/**
 * 迟到标准精确判定（基于 Asia/Kuala_Lumpur 与服务器保存的时间戳）：
 * - GURU：每天 07:00:00 之后首次 Check In 算迟到；刚好 07:00:00 算准时。
 * - AKP：每天 08:00:00 之后首次 Check In 算迟到；刚好 08:00:00 算准时。
 */
export function evaluateLateness(
  timestamp: any,
  effectiveCategory: 'GURU' | 'AKP'
): {
  isLate: boolean;
  timeStr: string;
  hour: number;
  minute: number;
  second: number;
  totalSeconds: number;
  timestampMs: number;
} {
  let date: Date;
  let timestampMs = 0;

  if (timestamp && typeof timestamp.toDate === 'function') {
    date = timestamp.toDate();
    timestampMs = date.getTime();
  } else if (timestamp && timestamp._seconds) {
    timestampMs = timestamp._seconds * 1000 + Math.floor((timestamp._nanoseconds || 0) / 1000000);
    date = new Date(timestampMs);
  } else if (timestamp instanceof Date) {
    date = timestamp;
    timestampMs = date.getTime();
  } else if (typeof timestamp === 'number') {
    timestampMs = timestamp;
    date = new Date(timestampMs);
  } else if (typeof timestamp === 'string') {
    timestampMs = new Date(timestamp).getTime();
    date = new Date(timestampMs);
  } else {
    return {
      isLate: false,
      timeStr: '--:--',
      hour: 0,
      minute: 0,
      second: 0,
      totalSeconds: 0,
      timestampMs: 0,
    };
  }

  // Format parts in Malaysia timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: MALAYSIA_TIMEZONE,
    hour12: false,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });

  const parts = formatter.formatToParts(date);
  let hour = 0;
  let minute = 0;
  let second = 0;

  parts.forEach((p) => {
    if (p.type === 'hour') hour = parseInt(p.value, 10);
    if (p.type === 'minute') minute = parseInt(p.value, 10);
    if (p.type === 'second') second = parseInt(p.value, 10);
  });

  const totalSeconds = hour * 3600 + minute * 60 + second;
  const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`;

  let isLate = false;
  if (effectiveCategory === 'GURU') {
    // 07:00:00 = 7 * 3600 = 25200 seconds. 刚好 07:00:00 算准时，07:00:01 迟到
    isLate = totalSeconds > 25200;
  } else {
    // 08:00:00 = 8 * 3600 = 28800 seconds. 刚好 08:00:00 算准时，08:00:01 迟到
    isLate = totalSeconds > 28800;
  }

  return {
    isLate,
    timeStr,
    hour,
    minute,
    second,
    totalSeconds,
    timestampMs,
  };
}

/**
 * 格式化百分比：分子、分母与两位小数
 * 分母为 0 时显示“不适用 (N/A)”
 */
export function formatRateWithRatio(
  numerator: number,
  denominator: number,
  unit: string = '天'
): { rate: number | null; rateStr: string; ratioStr: string } {
  if (denominator <= 0) {
    return {
      rate: null,
      rateStr: '不适用',
      ratioStr: `(0/0${unit})`,
    };
  }
  const rateVal = Math.min(100, Math.max(0, (numerator / denominator) * 100));
  return {
    rate: rateVal,
    rateStr: `${rateVal.toFixed(2)}%`,
    ratioStr: `(${numerator}/${denominator}${unit})`,
  };
}

/**
 * 并列排名算法（Dense / Standard Tie Ranking）：
 * 成绩相同者同分并列，下一名次顺延（如 1, 1, 3, 4）
 */
export function computeTieRankings<T>(
  list: T[],
  getValue: (item: T) => number | null,
  sortOrder: 'desc' | 'asc'
): Array<{ rank: number; isTie: boolean; staff: T }> {
  // Only rank items with non-null values
  const valid = list
    .map((staff) => ({ staff, val: getValue(staff) }))
    .filter((entry): entry is { staff: T; val: number } => entry.val !== null);

  valid.sort((a, b) => (sortOrder === 'desc' ? b.val - a.val : a.val - b.val));

  const result: Array<{ rank: number; isTie: boolean; staff: T }> = [];

  for (let i = 0; i < valid.length; i++) {
    const currentVal = valid[i].val;
    let rank = 1;
    let isTie = false;

    // Check previous items for tie
    for (let j = 0; j < i; j++) {
      if (Math.abs(valid[j].val - currentVal) < 0.00001) {
        rank = result[j].rank;
        isTie = true;
        result[j].isTie = true;
        break;
      }
    }

    if (!isTie) {
      rank = i + 1;
    }

    // Check if next item ties
    if (i + 1 < valid.length && Math.abs(valid[i + 1].val - currentVal) < 0.00001) {
      isTie = true;
    }

    result.push({
      rank,
      isTie,
      staff: valid[i].staff,
    });
  }

  return result;
}

/**
 * 核心月度出勤计算引擎 (Authoritative Monthly Analysis Engine)
 */
export function calculateMonthlyAnalysis({
  monthStr, // YYYY-MM
  staffList,
  attendanceRecords,
  customCalendarDays = [],
  absenceRecords = [],
  filterCategory = 'ALL', // 'ALL' | 'GURU' | 'AKP'
  filterUserId = 'ALL',
}: {
  monthStr: string;
  staffList: UserProfile[];
  attendanceRecords: AttendanceRecord[];
  customCalendarDays?: SchoolCalendarDay[];
  absenceRecords?: StaffAbsenceRecord[];
  filterCategory?: 'ALL' | 'GURU' | 'AKP';
  filterUserId?: string;
}): MonthlyAnalysisOverall {
  const [yearStr, monthNumStr] = monthStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthNumStr, 10);

  const monthNamesZh = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
  const monthNamesMs = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];

  const monthLabelZh = `${year}年${monthNamesZh[month - 1] || `${month}月`}`;
  const monthLabelMs = `${monthNamesMs[month - 1] || ''} ${year}`;

  // Current date in Malaysia timezone
  const now = new Date();
  const currentTodayFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: MALAYSIA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const currentTodayStr = currentTodayFormatter.format(now); // YYYY-MM-DD
  const currentYearMonth = currentTodayStr.slice(0, 7);

  const isFutureMonth = monthStr > currentYearMonth;
  const isCurrentMonth = monthStr === currentYearMonth;

  // Days in selected month
  const totalDaysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  // Determine evaluated dates in this month
  const datesInMonth: Array<{
    dateStr: string;
    dayNum: number;
    dayOfWeek: number; // 0 = Sun, 1 = Mon ... 6 = Sat
    dayZh: string;
    dayMs: string;
    isWeekend: boolean;
    isHoliday: boolean;
    holidayName?: string;
    isFutureDay: boolean;
    isExpectedDutyDay: boolean;
  }> = [];

  const dayNamesZh = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const dayNamesMs = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];

  // Calendar lookup map
  const calendarMap = new Map<string, SchoolCalendarDay>();
  customCalendarDays.forEach((c) => calendarMap.set(c.date, c));

  let evaluatedDaysCount = 0;

  for (let d = 1; d <= totalDaysInMonth; d++) {
    const dayStr = d.toString().padStart(2, '0');
    const dateStr = `${yearStr}-${monthNumStr}-${dayStr}`;
    const dateObj = new Date(Date.UTC(year, month - 1, d, 12, 0, 0));
    const dayOfWeek = dateObj.getUTCDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Check holiday from custom calendar or Sarawak standard holidays
    let isHoliday = false;
    let holidayName: string | undefined = undefined;

    if (calendarMap.has(dateStr)) {
      const cal = calendarMap.get(dateStr)!;
      if (!cal.isSchoolDay) {
        isHoliday = true;
        holidayName = cal.name;
      }
    } else if (DEFAULT_SARAWAK_HOLIDAYS_2026[dateStr]) {
      isHoliday = true;
      holidayName = DEFAULT_SARAWAK_HOLIDAYS_2026[dateStr];
    }

    // Future day check: "当前月份只统计至今天，未来月份显示暂无统计"
    const isFutureDay = isFutureMonth || (isCurrentMonth && dateStr > currentTodayStr);
    const isExpectedDutyDay = !isWeekend && !isHoliday && !isFutureDay;

    if (!isFutureDay) {
      evaluatedDaysCount++;
    }

    datesInMonth.push({
      dateStr,
      dayNum: d,
      dayOfWeek,
      dayZh: dayNamesZh[dayOfWeek],
      dayMs: dayNamesMs[dayOfWeek],
      isWeekend,
      isHoliday,
      holidayName,
      isFutureDay,
      isExpectedDutyDay,
    });
  }

  // Pre-index attendance records by (userId -> date -> AttendanceRecord[])
  const attendanceByUserAndDate = new Map<string, Map<string, AttendanceRecord[]>>();
  attendanceRecords.forEach((rec) => {
    if (!rec.userId || !rec.date) return;
    if (!attendanceByUserAndDate.has(rec.userId)) {
      attendanceByUserAndDate.set(rec.userId, new Map());
    }
    const userDateMap = attendanceByUserAndDate.get(rec.userId)!;
    const list = userDateMap.get(rec.date) || [];
    list.push(rec);
    userDateMap.set(rec.date, list);
  });

  // Pre-index absence records by (userId -> date -> StaffAbsenceRecord)
  const absenceByUserAndDate = new Map<string, Map<string, StaffAbsenceRecord>>();
  absenceRecords.forEach((abs) => {
    if (!abs.userId || !abs.date) return;
    if (!absenceByUserAndDate.has(abs.userId)) {
      absenceByUserAndDate.set(abs.userId, new Map());
    }
    absenceByUserAndDate.get(abs.userId)!.set(abs.date, abs);
  });

  // Filter staff list according to category and selection
  const candidateStaff = staffList.filter((staff) => {
    const effectiveCat = getEffectiveStaffCategory(staff);
    if (filterCategory === 'GURU' && effectiveCat !== 'GURU') return false;
    if (filterCategory === 'AKP' && effectiveCat !== 'AKP') return false;
    if (filterUserId !== 'ALL' && staff.uid !== filterUserId) return false;
    return true;
  });

  // Step 1: Compute daily check-in info for all staff to determine daily earliest check-in per category
  // Map of dateStr -> category ('GURU' | 'AKP') -> minTimestampMs & array of staffUids
  const earliestByDateAndCat = new Map<string, {
    GURU: { minMs: number; staffUids: string[]; timeStr: string };
    AKP: { minMs: number; staffUids: string[]; timeStr: string };
  }>();

  datesInMonth.forEach(({ dateStr, isFutureDay }) => {
    if (isFutureDay) return;
    earliestByDateAndCat.set(dateStr, {
      GURU: { minMs: Infinity, staffUids: [], timeStr: '' },
      AKP: { minMs: Infinity, staffUids: [], timeStr: '' },
    });
  });

  // Scan attendance records on each date for all staff in candidate/full pool to find true earliest
  staffList.forEach((staff) => {
    const effectiveCat = getEffectiveStaffCategory(staff);
    const userDates = attendanceByUserAndDate.get(staff.uid);
    if (!userDates) return;

    datesInMonth.forEach(({ dateStr, isFutureDay }) => {
      if (isFutureDay) return;
      const dayRecords = userDates.get(dateStr);
      if (!dayRecords || dayRecords.length === 0) return;

      // Take first punch of the day
      const firstPunch = dayRecords.slice().sort((a, b) => (a.slot || 1) - (b.slot || 1))[0];
      if (!firstPunch?.checkInTime) return;

      const evalResult = evaluateLateness(firstPunch.checkInTime, effectiveCat);
      if (evalResult.timestampMs <= 0) return;

      const dayEarliest = earliestByDateAndCat.get(dateStr)?.[effectiveCat];
      if (!dayEarliest) return;

      if (evalResult.timestampMs < dayEarliest.minMs) {
        dayEarliest.minMs = evalResult.timestampMs;
        dayEarliest.staffUids = [staff.uid];
        dayEarliest.timeStr = evalResult.timeStr;
      } else if (evalResult.timestampMs === dayEarliest.minMs) {
        // "同时间并列，同时显示次数及实际时间"
        if (!dayEarliest.staffUids.includes(staff.uid)) {
          dayEarliest.staffUids.push(staff.uid);
        }
      }
    });
  });

  // Step 2: Compute Metrics for each candidate staff member
  const staffMetrics: MonthlyAnalysisStaffMetric[] = candidateStaff.map((staff) => {
    const effectiveCategory = getEffectiveStaffCategory(staff);
    const userDates = attendanceByUserAndDate.get(staff.uid) || new Map<string, AttendanceRecord[]>();
    const userAbsences = absenceByUserAndDate.get(staff.uid) || new Map<string, StaffAbsenceRecord>();

    let expectedDays = 0;
    let actualAttendedDays = 0;
    let lateDays = 0;
    let earliestCount = 0;
    let officialDutyDays = 0;
    let personalLeaveDays = 0;
    let unverifiedDays = 0;
    let extraWeekendDays = 0;

    const earliestRecords: EarliestRecordItem[] = [];
    const reasonBreakdown: Record<string, number> = {};
    const dailyMap: Record<string, DailyAttendanceStatusInfo> = {};

    // Tenure check: check if staff was registered after the start of this month
    let tenureNote: string | undefined = undefined;
    if (staff.createdAt) {
      let createdDateStr = '';
      if (typeof staff.createdAt.toDate === 'function') {
        createdDateStr = currentTodayFormatter.format(staff.createdAt.toDate());
      } else if (staff.createdAt._seconds) {
        createdDateStr = currentTodayFormatter.format(new Date(staff.createdAt._seconds * 1000));
      }
      if (createdDateStr && createdDateStr.slice(0, 7) > monthStr) {
        tenureNote = `该人员于 ${createdDateStr} 创建账号，早于入职期资料待确认`;
      }
    }
    if (!staff.active) {
      tenureNote = tenureNote ? `${tenureNote}；当前账号已停用但保留历史任期` : '当前账号已停用，出勤按该月实际在任记录统计';
    }

    datesInMonth.forEach((dayInfo) => {
      const { dateStr, dayZh, dayMs, isWeekend, isHoliday, holidayName, isFutureDay, isExpectedDutyDay } = dayInfo;

      if (isExpectedDutyDay) {
        expectedDays++;
      }

      const dayRecords = userDates.get(dateStr) || [];
      const hasPunched = dayRecords.length > 0;
      const sortedRecords = dayRecords.slice().sort((a, b) => (a.slot || 1) - (b.slot || 1));
      const slot1Rec = sortedRecords.find((r) => r.slot === 1) || sortedRecords[0];
      const slot2Rec = sortedRecords.find((r) => r.slot === 2);

      let isLate = false;
      let firstCheckInTimeStr: string | undefined = undefined;
      let firstCheckOutTimeStr: string | undefined = undefined;
      let secondCheckInTimeStr: string | undefined = undefined;
      let secondCheckOutTimeStr: string | undefined = undefined;
      let isEarliest = false;

      if (hasPunched && slot1Rec?.checkInTime) {
        const evalRes = evaluateLateness(slot1Rec.checkInTime, effectiveCategory);
        firstCheckInTimeStr = evalRes.timeStr;
        isLate = evalRes.isLate;

        if (slot1Rec.checkOutTime) {
          firstCheckOutTimeStr = evaluateLateness(slot1Rec.checkOutTime, effectiveCategory).timeStr;
        }
        if (slot2Rec?.checkInTime) {
          secondCheckInTimeStr = evaluateLateness(slot2Rec.checkInTime, effectiveCategory).timeStr;
        }
        if (slot2Rec?.checkOutTime) {
          secondCheckOutTimeStr = evaluateLateness(slot2Rec.checkOutTime, effectiveCategory).timeStr;
        }

        // Check if earliest on this day
        const dayEarliest = earliestByDateAndCat.get(dateStr)?.[effectiveCategory];
        if (dayEarliest && dayEarliest.staffUids.includes(staff.uid)) {
          isEarliest = true;
          earliestCount++;
          earliestRecords.push({
            date: dateStr,
            timeStr: evalRes.timeStr,
            timestampMs: evalRes.timestampMs,
          });
        }

        if (isExpectedDutyDay) {
          // Regular expected duty day attended
          actualAttendedDays++;
          if (isLate) {
            lateDays++;
          }
        } else if (!isFutureDay) {
          // Weekend or holiday punch: "非应到校日的额外到校单列，不能令出席率超过100%"
          extraWeekendDays++;
        }
      }

      // Check absence declarations if not punched on expected duty day
      let absenceCat: AbsenceCategoryType | undefined = undefined;
      let absenceReasonText: string | undefined = undefined;

      if (!hasPunched && isExpectedDutyDay) {
        const decl = userAbsences.get(dateStr);
        if (decl) {
          absenceCat = decl.category;
          absenceReasonText = decl.reason;
          if (decl.isOfficialDuty) {
            officialDutyDays++;
          } else {
            personalLeaveDays++;
          }
          reasonBreakdown[decl.category] = (reasonBreakdown[decl.category] || 0) + 1;
        } else {
          // "没有打卡也没有未到校申报的应到校日，列为待核实，不自动认定旷职"
          absenceCat = 'PERLU_PENGESAHAN';
          absenceReasonText = '待核实 (未打卡且未申报)';
          unverifiedDays++;
          reasonBreakdown['PERLU_PENGESAHAN'] = (reasonBreakdown['PERLU_PENGESAHAN'] || 0) + 1;
        }
      }

      // Status label and badge
      let statusLabel = '';
      let statusBadgeClass = '';

      if (isFutureDay) {
        statusLabel = '未来日期';
        statusBadgeClass = 'bg-slate-800 text-slate-500';
      } else if (hasPunched) {
        if (isWeekend || isHoliday) {
          statusLabel = '额外到校 (周末/公休)';
          statusBadgeClass = 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30';
        } else if (isLate) {
          statusLabel = '出席 (迟到)';
          statusBadgeClass = 'bg-rose-500/20 text-rose-300 border border-rose-500/30';
        } else {
          statusLabel = '准时出席';
          statusBadgeClass = 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
        }
      } else if (isHoliday) {
        statusLabel = holidayName || '学校公休假';
        statusBadgeClass = 'bg-slate-800/80 text-amber-300 border border-amber-500/30';
      } else if (isWeekend) {
        statusLabel = '周末休息';
        statusBadgeClass = 'bg-slate-900 text-slate-500';
      } else if (absenceCat) {
        const meta = ABSENCE_REASON_MAP[absenceCat] || ABSENCE_REASON_MAP['PERLU_PENGESAHAN'];
        statusLabel = meta.labelZh;
        statusBadgeClass = `${meta.color} border`;
      }

      dailyMap[dateStr] = {
        date: dateStr,
        dayZh,
        dayMs,
        isWeekend,
        isHoliday,
        isExpectedDutyDay,
        isFutureDay,
        holidayName,
        hasPunched,
        firstCheckInTimeStr,
        firstCheckOutTimeStr,
        secondCheckInTimeStr,
        secondCheckOutTimeStr,
        isLate,
        isEarliest,
        absenceCategory: absenceCat,
        absenceReason: absenceReasonText,
        statusLabel,
        statusBadgeClass,
      };
    });

    // Best earliest time
    let earliestBestTimeStr = '-';
    if (earliestRecords.length > 0) {
      const sorted = earliestRecords.slice().sort((a, b) => a.timestampMs - b.timestampMs);
      earliestBestTimeStr = sorted[0].timeStr;
    }

    // Attendance rate
    const attFormatted = formatRateWithRatio(actualAttendedDays, expectedDays, '天');
    // Late rate (denominator is actualAttendedDays)
    const lateFormatted = formatRateWithRatio(lateDays, actualAttendedDays, '天');
    // Earliest rate
    const earlyFormatted = formatRateWithRatio(earliestCount, expectedDays, '天');

    return {
      user: staff,
      effectiveCategory,
      expectedDays,
      actualAttendedDays,
      attendanceRate: attFormatted.rate,
      attendanceRateStr: attFormatted.rateStr,
      attendanceRatioStr: attFormatted.ratioStr,
      lateDays,
      lateRate: lateFormatted.rate,
      lateRateStr: lateFormatted.rateStr,
      lateRatioStr: lateFormatted.ratioStr,
      isEverLate: lateDays > 0,
      earliestCount,
      earliestRate: earlyFormatted.rate,
      earliestRateStr: earlyFormatted.rateStr,
      earliestRatioStr: earlyFormatted.ratioStr,
      earliestRecords,
      earliestBestTimeStr,
      officialDutyDays,
      personalLeaveDays,
      unverifiedDays,
      extraWeekendDays,
      reasonBreakdown,
      dailyMap,
      tenureNote,
    };
  });

  // Step 3: Compute Overall Statistics
  // "全校百分比用总人日计算，不能直接平均个人百分比"
  let totalExpectedPersonDays = 0;
  let totalActualAttendedPersonDays = 0;
  let totalLatePersonDays = 0;
  let totalOfficialDutyPersonDays = 0;
  let totalPersonalLeavePersonDays = 0;
  let totalUnverifiedPersonDays = 0;
  let totalExtraWeekendPersonDays = 0;
  let everLateStaffCount = 0;

  const reasonAggregated: Record<string, number> = {};

  staffMetrics.forEach((m) => {
    totalExpectedPersonDays += m.expectedDays;
    totalActualAttendedPersonDays += m.actualAttendedDays;
    totalLatePersonDays += m.lateDays;
    totalOfficialDutyPersonDays += m.officialDutyDays;
    totalPersonalLeavePersonDays += m.personalLeaveDays;
    totalUnverifiedPersonDays += m.unverifiedDays;
    totalExtraWeekendPersonDays += m.extraWeekendDays;

    if (m.isEverLate) {
      everLateStaffCount++;
    }

    Object.entries(m.reasonBreakdown).forEach(([k, count]) => {
      reasonAggregated[k] = (reasonAggregated[k] || 0) + count;
    });
  });

  const totalStaffCount = staffMetrics.length;

  const overallAttFormatted = formatRateWithRatio(totalActualAttendedPersonDays, totalExpectedPersonDays, '人日');
  const overallLateFormatted = formatRateWithRatio(totalLatePersonDays, totalActualAttendedPersonDays, '人日');
  const everLateFormatted = formatRateWithRatio(everLateStaffCount, totalStaffCount, '人');

  // Total declared absence days = official duty + personal leaves (excluding unverified)
  let totalDeclaredAbsencePersonDays = 0;
  Object.entries(reasonAggregated).forEach(([k, days]) => {
    if (k !== 'PERLU_PENGESAHAN') {
      totalDeclaredAbsencePersonDays += days;
    }
  });

  // Build reason summary table
  const reasonCodes = Object.keys(ABSENCE_REASON_MAP);
  const reasonSummary = reasonCodes
    .map((code) => {
      const meta = ABSENCE_REASON_MAP[code];
      const days = reasonAggregated[code] || 0;
      const rateOverExpected = formatRateWithRatio(days, totalExpectedPersonDays, '人日');
      const shareOverDeclared = code !== 'PERLU_PENGESAHAN'
        ? formatRateWithRatio(days, totalDeclaredAbsencePersonDays, '人日')
        : { rate: null, rateStr: '不适用 (未申报)', ratioStr: '-' };

      return {
        code,
        labelZh: meta.labelZh,
        labelMs: meta.labelMs,
        isOfficial: meta.isOfficial,
        days,
        rateOverExpectedStr: rateOverExpected.rateStr,
        rateOverExpectedRatio: rateOverExpected.ratioStr,
        shareOverDeclaredStr: shareOverDeclared.rateStr,
        shareOverDeclaredRatio: shareOverDeclared.ratioStr,
      };
    })
    .filter((r) => r.days > 0 || r.code === 'MESYUARAT' || r.code === 'PERTANDINGAN' || r.code === 'KURSUS' || r.code === 'CRK' || r.code === 'CUTI_SAKIT' || r.code === 'CUTI_BARAH' || r.code === 'PERLU_PENGESAHAN');

  // Step 4: Compute Rankings (Highest & Lowest Attendance, Lateness, Earliest Arrival)
  // "最高及最低出席率排名，同分并列"
  const rankingAttendanceHighest = computeTieRankings(
    staffMetrics,
    (s) => s.attendanceRate,
    'desc'
  );

  const rankingAttendanceLowest = computeTieRankings(
    staffMetrics,
    (s) => s.attendanceRate,
    'asc'
  );

  // Lateness ranking: highest lateness rate first
  const rankingLate = computeTieRankings(
    staffMetrics.filter((s) => s.lateDays > 0),
    (s) => s.lateRate,
    'desc'
  );

  // Earliest Arrival ranking: highest earliest arrival count/rate first
  const rankingEarliest = computeTieRankings(
    staffMetrics.filter((s) => s.earliestCount > 0),
    (s) => s.earliestCount,
    'desc'
  );

  return {
    monthStr,
    monthLabelZh,
    monthLabelMs,
    isFutureMonth,
    daysEvaluatedCount: evaluatedDaysCount,
    totalExpectedPersonDays,
    totalActualAttendedPersonDays,
    overallAttendanceRate: overallAttFormatted.rate,
    overallAttendanceRateStr: overallAttFormatted.rateStr,
    overallAttendanceRatioStr: overallAttFormatted.ratioStr,
    totalLatePersonDays,
    overallLateRate: overallLateFormatted.rate,
    overallLateRateStr: overallLateFormatted.rateStr,
    overallLateRatioStr: overallLateFormatted.ratioStr,
    totalStaffCount,
    everLateStaffCount,
    everLateStaffRate: everLateFormatted.rate,
    everLateStaffRateStr: everLateFormatted.rateStr,
    everLateStaffRatioStr: everLateFormatted.ratioStr,
    totalOfficialDutyPersonDays,
    totalPersonalLeavePersonDays,
    totalUnverifiedPersonDays,
    totalExtraWeekendPersonDays,
    totalDeclaredAbsencePersonDays,
    reasonSummary,
    staffMetrics,
    rankingAttendanceHighest,
    rankingAttendanceLowest,
    rankingLate,
    rankingEarliest,
  };
}

/**
 * Generate CSV with UTF-8 BOM for monthly analysis export
 */
export function generateMonthlyAnalysisCSV(overall: MonthlyAnalysisOverall): string {
  const BOM = '\uFEFF';
  const headers = [
    'Bil',
    'Nama Staf / 姓名',
    'Emel DELIMa / 邮箱',
    'Kategori / 类别',
    'Hari Sepatutnya Hadir / 应到校天数',
    'Hari Hadir Sebenar / 实际到校天数',
    'Kadar Kehadiran (%) / 出席率',
    'Hari Lewat / 迟到天数',
    'Kadar Lewat (%) / 迟到率',
    'Kekerapan Terawal Hadir / 最早到校天数',
    'Kadar Terawal Hadir (%) / 最早到校比例',
    'Catatan Masa Terawal / 最早打卡时间',
    'Tugas Rasmi & Kursus / 公务培训天数',
    'Cuti Diluluskan / 请假天数',
    'Perlu Pengesahan / 待核实天数',
    'Hadir Hujung Minggu / 额外周末到校天数',
    'Catatan / 备注',
  ];

  const rows = overall.staffMetrics.map((m, idx) => [
    idx + 1,
    `"${m.user.name.replace(/"/g, '""')}"`,
    `"${m.user.email}"`,
    m.effectiveCategory,
    m.expectedDays,
    m.actualAttendedDays,
    m.attendanceRateStr,
    m.lateDays,
    m.lateRateStr,
    m.earliestCount,
    m.earliestRateStr,
    m.earliestBestTimeStr,
    m.officialDutyDays,
    m.personalLeaveDays,
    m.unverifiedDays,
    m.extraWeekendDays,
    `"${(m.tenureNote || '').replace(/"/g, '""')}"`,
  ]);

  const summaryRows = [
    [],
    ['--- RINGKASAN KESELURUHAN / 全校总体分析 ---'],
    ['Bulan / 月份', `"${overall.monthLabelZh} (${overall.monthLabelMs})"`],
    ['Jumlah Staf / 当月总人数', overall.totalStaffCount],
    ['Jumlah Hari Bertugas / 总应到校人日', overall.totalExpectedPersonDays],
    ['Jumlah Hari Hadir / 总实际到校人日', overall.totalActualAttendedPersonDays],
    ['Kadar Kehadiran Purata / 综合出席率', overall.overallAttendanceRateStr, overall.overallAttendanceRatioStr],
    ['Bilangan Staf Pernah Lewat / 曾迟到人员人数', `${overall.everLateStaffCount} orang`, overall.everLateStaffRateStr],
    ['Jumlah Hari Lewat / 总迟到人次', overall.totalLatePersonDays, overall.overallLateRateStr],
    ['Tugas Rasmi & Kursus / 总公务培训人日', overall.totalOfficialDutyPersonDays],
    ['Cuti Peribadi / 总请假人日', overall.totalPersonalLeavePersonDays],
    ['Perlu Pengesahan / 总待核实人日', overall.totalUnverifiedPersonDays],
    ['Hadir Hujung Minggu / 总额外周末到校人日', overall.totalExtraWeekendPersonDays],
  ];

  const csvContent = [
    headers.join(','),
    ...rows.map((r) => r.join(',')),
    ...summaryRows.map((r) => r.join(',')),
  ].join('\r\n');

  return BOM + csvContent;
}
