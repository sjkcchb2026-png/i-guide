import { AttendanceRecord, StaffCategory } from '../types';
import { MALAYSIA_TIMEZONE } from './date';

export interface EarlyLeaveCheckResult {
  isEarly: boolean;
  reasonRequired: boolean;
  thresholdTimeStr?: string;
  ruleDescription?: string;
  isWeekend?: boolean;
}

/**
 * Helper to get current day-of-week and time in Malaysia (Asia/Kuala_Lumpur)
 */
export function getMalaysiaDateTimeParts(date: Date = new Date()): {
  dayName: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  dayZh: string;
  hour: number;
  minute: number;
  totalMinutes: number;
  timeStr: string;
  isWeekend: boolean;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MALAYSIA_TIMEZONE,
    weekday: 'long',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date);

  let weekday = '';
  let hourStr = '0';
  let minStr = '0';

  parts.forEach((p) => {
    if (p.type === 'weekday') weekday = p.value.toLowerCase();
    if (p.type === 'hour') hourStr = p.value;
    if (p.type === 'minute') minStr = p.value;
  });

  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minStr, 10);
  const totalMinutes = hour * 60 + minute;
  const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

  const dayMap: Record<string, string> = {
    monday: '星期一',
    tuesday: '星期二',
    wednesday: '星期三',
    thursday: '星期四',
    friday: '星期五',
    saturday: '星期六',
    sunday: '星期日',
  };

  const dayName = (weekday as any) || 'monday';
  const isWeekend = dayName === 'saturday' || dayName === 'sunday';

  return {
    dayName,
    dayZh: dayMap[dayName] || weekday,
    hour,
    minute,
    totalMinutes,
    timeStr,
    isWeekend,
  };
}

/**
 * Guru 提前离校检查（遵守学校最新规定）：
 * 星期一、二：13:00 前离校须填写理由
 * 星期三、四：12:30 前离校须填写理由
 * 星期五：11:30 前离校须填写理由
 * 星期六、日：豁免
 */
export function checkGuruEarlyLeave(now: Date = new Date()): EarlyLeaveCheckResult {
  const { dayName, dayZh, totalMinutes, timeStr, isWeekend } = getMalaysiaDateTimeParts(now);

  if (isWeekend) {
    return {
      isEarly: false,
      reasonRequired: false,
      isWeekend: true,
      ruleDescription: `${dayZh}（周末打卡）豁免提前离校检查。`,
    };
  }

  let thresholdMinutes = 0;
  let thresholdTimeStr = '';

  if (dayName === 'monday' || dayName === 'tuesday') {
    thresholdMinutes = 13 * 60; // 13:00
    thresholdTimeStr = '13:00';
  } else if (dayName === 'wednesday' || dayName === 'thursday') {
    thresholdMinutes = 12 * 60 + 30; // 12:30
    thresholdTimeStr = '12:30';
  } else if (dayName === 'friday') {
    thresholdMinutes = 11 * 60 + 30; // 11:30
    thresholdTimeStr = '11:30';
  }

  if (thresholdMinutes > 0 && totalMinutes < thresholdMinutes) {
    return {
      isEarly: true,
      reasonRequired: true,
      thresholdTimeStr,
      ruleDescription: `${dayZh}教师规定在校时间至 ${thresholdTimeStr}。当前时间为 ${timeStr}，属于提前离校，须填写理由。`,
    };
  }

  return {
    isEarly: false,
    reasonRequired: false,
    thresholdTimeStr,
    ruleDescription: '已达到规定离校时间。',
  };
}

/**
 * Extract millisecond timestamp safely from Firestore Timestamp, Date, or object
 */
export function getTimestampMs(ts: any): number | null {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (ts._seconds) return ts._seconds * 1000;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') {
    const parsed = new Date(ts).getTime();
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * AKP 提前离校检查（遵守学校最新规定）：
 * AKP 合计两组工时，并扣除每天1小时休息；已通过午休打卡排除的时间不会重复扣除。
 * 净工时不足7小时仍须填写理由，周末豁免。
 */
export function checkAkpEarlyLeave(
  currentSlot: number,
  slot1Record?: AttendanceRecord | null,
  activeCheckInTime?: any,
  now: Date = new Date()
): EarlyLeaveCheckResult {
  const { dayZh, isWeekend } = getMalaysiaDateTimeParts(now);

  // 周末豁免
  if (isWeekend) {
    return {
      isEarly: false,
      reasonRequired: false,
      isWeekend: true,
      ruleDescription: `${dayZh}（周末打卡）豁免工时不足检查。`,
    };
  }

  const nowMs = now.getTime();
  let s1Minutes = 0;
  let s2Minutes = 0;
  let lunchGapMinutes = 0;

  if (currentSlot === 1) {
    // Currently checking out slot 1
    const s1InMs = getTimestampMs(slot1Record?.checkInTime) || getTimestampMs(activeCheckInTime) || nowMs;
    s1Minutes = Math.max(0, Math.floor((nowMs - s1InMs) / 60000));
  } else {
    // Currently checking out slot 2
    if (slot1Record) {
      const s1InMs = getTimestampMs(slot1Record.checkInTime) || 0;
      const s1OutMs = getTimestampMs(slot1Record.checkOutTime) || s1InMs;
      s1Minutes = Math.max(0, Math.floor((s1OutMs - s1InMs) / 60000));

      const s2InMs = getTimestampMs(activeCheckInTime) || nowMs;
      s2Minutes = Math.max(0, Math.floor((nowMs - s2InMs) / 60000));

      if (s2InMs > s1OutMs) {
        lunchGapMinutes = Math.floor((s2InMs - s1OutMs) / 60000);
      }
    } else {
      const s2InMs = getTimestampMs(activeCheckInTime) || nowMs;
      s2Minutes = Math.max(0, Math.floor((nowMs - s2InMs) / 60000));
    }
  }

  const rawTotalMinutes = s1Minutes + s2Minutes;
  // 已通过午休打卡排除的时间不会重复扣除；总休息时间扣除上限为 60 分钟 (1小时)
  const remainingDeduction = Math.max(0, 60 - lunchGapMinutes);
  const netWorkMinutes = Math.max(0, rawTotalMinutes - remainingDeduction);

  const REQUIRED_MINUTES = 7 * 60; // 7 hours = 420 minutes

  if (netWorkMinutes < REQUIRED_MINUTES) {
    const netHours = Math.floor(netWorkMinutes / 60);
    const netMins = Math.round(netWorkMinutes % 60);

    return {
      isEarly: true,
      reasonRequired: true,
      thresholdTimeStr: '7小时',
      ruleDescription: `AKP 规定每日净工时为 7 小时（已扣除 1 小时休息）。当前今日累计净工时约为 ${netHours}小时 ${netMins}分钟，未满 7 小时，离校须填写理由。`,
    };
  }

  return {
    isEarly: false,
    reasonRequired: false,
    ruleDescription: '今日净工时已达到 7 小时标准。',
  };
}

/**
 * 计算教职员今日在校总时长与净时长（供报表与表格使用）
 */
export function calculateDailyWorkTime(
  category: StaffCategory | 'PRINCIPAL' | string,
  slot1?: AttendanceRecord | null,
  slot2?: AttendanceRecord | null
): { totalMinutes: number; netMinutes: number; displayText: string; isShortHours: boolean } {
  const s1InMs = getTimestampMs(slot1?.checkInTime);
  const s1OutMs = getTimestampMs(slot1?.checkOutTime);
  const s2InMs = getTimestampMs(slot2?.checkInTime);
  const s2OutMs = getTimestampMs(slot2?.checkOutTime);

  const s1Mins = s1InMs && s1OutMs ? Math.max(0, Math.floor((s1OutMs - s1InMs) / 60000)) : 0;
  const s2Mins = s2InMs && s2OutMs ? Math.max(0, Math.floor((s2OutMs - s2InMs) / 60000)) : 0;
  const rawTotalMinutes = s1Mins + s2Mins;

  if (rawTotalMinutes === 0 && !s1OutMs && !s2OutMs) {
    return {
      totalMinutes: 0,
      netMinutes: 0,
      displayText: '-',
      isShortHours: false,
    };
  }

  if (category === 'AKP') {
    let lunchGapMins = 0;
    if (s1OutMs && s2InMs && s2InMs > s1OutMs) {
      lunchGapMins = Math.floor((s2InMs - s1OutMs) / 60000);
    }
    const remainingDeduction = Math.max(0, 60 - lunchGapMins);
    const netMinutes = Math.max(0, rawTotalMinutes - remainingDeduction);

    const hours = Math.floor(netMinutes / 60);
    const mins = Math.round(netMinutes % 60);
    const isShortHours = netMinutes < 420;

    return {
      totalMinutes: rawTotalMinutes,
      netMinutes,
      displayText: hours > 0 ? `${hours}小时 ${mins}分 (${hours}j ${mins}m)` : `${mins}分 (${mins}m)`,
      isShortHours,
    };
  } else {
    // GURU & PRINCIPAL
    const hours = Math.floor(rawTotalMinutes / 60);
    const mins = rawTotalMinutes % 60;

    return {
      totalMinutes: rawTotalMinutes,
      netMinutes: rawTotalMinutes,
      displayText: hours > 0 ? `${hours}小时 ${mins}分 (${hours}j ${mins}m)` : `${mins}分 (${mins}m)`,
      isShortHours: false,
    };
  }
}
