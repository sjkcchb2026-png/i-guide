export type StaffCategory = 'GURU' | 'AKP' | 'PRINCIPAL';

export type UserRole = 'PRINCIPAL' | 'GURU' | 'AKP' | 'CLERK' | 'subject_teacher' | 'class_teacher' | 'head_department' | 'admin' | 'student' | 'secretary' | 'principal' | 'visitor';

export interface SchoolSettings {
  schoolName: string;
  schoolCode?: string;
  schoolLogo?: string;
  principalEmail: string;
  principalUid: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  category?: StaffCategory;
  role: UserRole;
  hasClerkAccess?: boolean; // 书记假期管理权限 (Kuasa Kerani Cuti)
  active?: boolean;
  year_assigned?: number;
  class_assigned?: string;
  subject_assigned?: string;
  academic_year?: string;
  ic?: string;
  phone?: string;
  grade?: string;
  position?: string;
  staffFileNo?: string;
  personnelId?: string;
  isPreRegistered?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

// Attendance Record visible to staff and reports (coordinates strictly excluded)
export interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  category: StaffCategory;
  date: string; // YYYY-MM-DD Malaysia Time (UTC+8)
  slot: number; // 1 or 2
  status: 'IN' | 'COMPLETED';
  checkInTime: any;
  checkOutTime?: any;
  earlyCheckOutReason?: string;
  isEarlyCheckOut?: boolean;
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
}

// Sensitive GPS coordinates & accuracy isolated in separate collection readable only by Principal
export interface AttendanceGeo {
  recordId: string;
  userId: string;
  date: string;
  slot: number;
  checkInLat: number;
  checkInLng: number;
  checkInAccuracy: number;
  checkOutLat?: number;
  checkOutLng?: number;
  checkOutAccuracy?: number;
  updatedAt?: any;
}

export interface LocationResult {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export interface UserAttendanceState {
  activeSessionId?: string | null;
  activeSessionDate?: string | null;
  activeSessionSlot?: number | null;
  lastDate?: string;
  todaySlotCount?: number;
  currentStatus: 'IN' | 'OUT';
}

export type AbsenceCategoryType = 
  | 'KURSUS'          // 课程 / 培训 (公务)
  | 'MESYUARAT'       // 官方会议 (公务)
  | 'PERTANDINGAN'    // 带队比赛 / 赛事指导 (公务)
  | 'URUSAN_RASMI'    // 公务外出
  | 'BENGKEL'         // 工作坊 (公务)
  | 'TAKLIMAT'        // 简报会 (公务)
  | 'CRK'             // 特假 (Cuti Rehat Khas)
  | 'CUTI_SAKIT'      // 病假 (MC)
  | 'CUTI_BARAH'      // 重病假 / 癌症假 (Cuti Barah / Penyakit Berat)
  | 'CUTI_BERSALIN'   // 产假 / 陪产假
  | 'CUTI_HAJI'       // 朝觐假
  | 'CUTI_KUARANTIN'  // 隔离假
  | 'CUTI_LAIN'       // 其他批准事假
  | 'PERLU_PENGESAHAN'; // 待核实（未打卡且未申报）

export interface StaffAbsenceRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  date: string; // YYYY-MM-DD
  startDate?: string;
  endDate?: string;
  category: AbsenceCategoryType;
  reason: string;
  isOfficialDuty: boolean; // true for KURSUS, MESYUARAT, PERTANDINGAN, URUSAN_RASMI, BENGKEL, TAKLIMAT
  approvedBy?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface SchoolCalendarDay {
  date: string; // YYYY-MM-DD
  name: string; // e.g. "Hari Malaysia", "Cuti Pertengahan Penggal 2"
  isSchoolDay: boolean; // false = holiday/weekend; true = official special duty day
  type: 'PUBLIC_HOLIDAY' | 'SCHOOL_HOLIDAY' | 'WEEKEND' | 'SPECIAL_DUTY';
}

export interface DailyAttendanceStatusInfo {
  date: string;
  dayZh: string;
  dayMs: string;
  isWeekend: boolean;
  isHoliday: boolean;
  isExpectedDutyDay: boolean;
  isFutureDay: boolean;
  holidayName?: string;
  hasPunched: boolean;
  firstCheckInTimeStr?: string;
  firstCheckOutTimeStr?: string;
  secondCheckInTimeStr?: string;
  secondCheckOutTimeStr?: string;
  isLate: boolean;
  isEarliest: boolean;
  absenceCategory?: AbsenceCategoryType;
  absenceReason?: string;
  statusLabel: string;
  statusBadgeClass: string;
  notes?: string;
}

export interface EarliestRecordItem {
  date: string;
  timeStr: string;
  timestampMs: number;
}

export interface MonthlyAnalysisStaffMetric {
  user: UserProfile;
  effectiveCategory: 'GURU' | 'AKP'; // Principal / PK are strictly GURU
  expectedDays: number;              // 应到校天数
  actualAttendedDays: number;        // 实际到校天数 (每天最多计1次，不超100%)
  attendanceRate: number | null;     // 出席率 (0-100)
  attendanceRateStr: string;         // e.g. "95.00%" or "不适用"
  attendanceRatioStr: string;        // e.g. "(19/20天)"
  lateDays: number;                  // 迟到天数 (每天最多1次，取首轮)
  lateRate: number | null;           // 迟到率 = 迟到天数 / 实际到校天数
  lateRateStr: string;               // e.g. "5.26%" or "不适用"
  lateRatioStr: string;              // e.g. "(1/19天)"
  isEverLate: boolean;               // 是否曾迟到 (迟到天数 > 0)
  earliestCount: number;             // 成为同类别当天最早到校者的天数
  earliestRate: number | null;       // 最早到校比例 = earliestCount / expectedDays
  earliestRateStr: string;           // e.g. "20.00%" or "不适用"
  earliestRatioStr: string;          // e.g. "(4/20天)"
  earliestRecords: EarliestRecordItem[];
  earliestBestTimeStr: string;       // 最早打卡实际时间，如 "06:28:15"
  officialDutyDays: number;          // 公务/培训天数 (KURSUS, URUSAN_RASMI, etc.)
  personalLeaveDays: number;         // 个人请假天数 (CRK, Cuti Sakit, etc.)
  unverifiedDays: number;            // 待核实天数 (未打卡且未申报)
  extraWeekendDays: number;          // 非应到校日的额外到校天数 (周末打卡单列)
  reasonBreakdown: Record<string, number>;
  dailyMap: Record<string, DailyAttendanceStatusInfo>;
  tenureNote?: string;               // 任职期待确认提示 (若中途加入或历史信息不完整)
}

export interface MonthlyAnalysisOverall {
  monthStr: string;                  // YYYY-MM
  monthLabelZh: string;              // "2026年10月"
  monthLabelMs: string;              // "Oktober 2026"
  isFutureMonth: boolean;            // 未来月份
  daysEvaluatedCount: number;        // 当月已评估天数 (截至今日或全月)
  totalExpectedPersonDays: number;   // 总应到校人日
  totalActualAttendedPersonDays: number; // 总实际到校人日
  overallAttendanceRate: number | null;  // 综合出席率 (总实际 / 总应到)
  overallAttendanceRateStr: string;
  overallAttendanceRatioStr: string;
  totalLatePersonDays: number;       // 总迟到人次
  overallLateRate: number | null;    // 综合迟到率 (总迟到 / 总实际到校)
  overallLateRateStr: string;
  overallLateRatioStr: string;
  totalStaffCount: number;           // 当月应到校人员总数
  everLateStaffCount: number;        // 至少迟到一次的人数
  everLateStaffRate: number | null;  // 曾迟到人员比例
  everLateStaffRateStr: string;
  everLateStaffRatioStr: string;
  totalOfficialDutyPersonDays: number; // 总公务/培训人日
  totalPersonalLeavePersonDays: number; // 总个人请假人日
  totalUnverifiedPersonDays: number;    // 总待核实人日
  totalExtraWeekendPersonDays: number;  // 总非应到校日额外到校人日
  totalDeclaredAbsencePersonDays: number; // 已申报未到校总人日
  reasonSummary: Array<{
    code: string;
    labelZh: string;
    labelMs: string;
    isOfficial: boolean;
    days: number;
    rateOverExpectedStr: string;     // 该原因天数 / 应到校天数
    rateOverExpectedRatio: string;
    shareOverDeclaredStr: string;    // 该原因天数 / 已申报未到校总天数
    shareOverDeclaredRatio: string;
  }>;
  staffMetrics: MonthlyAnalysisStaffMetric[];
  rankingAttendanceHighest: Array<{ rank: number; isTie: boolean; staff: MonthlyAnalysisStaffMetric }>;
  rankingAttendanceLowest: Array<{ rank: number; isTie: boolean; staff: MonthlyAnalysisStaffMetric }>;
  rankingLate: Array<{ rank: number; isTie: boolean; staff: MonthlyAnalysisStaffMetric }>;
  rankingEarliest: Array<{ rank: number; isTie: boolean; staff: MonthlyAnalysisStaffMetric }>;
}

// Re-export canonical SSOT & Academic types
export type {
  Role,
  Student,
  Subject,
  UasaResult,
  PbdResult,
  SchoolConfig,
  AcademicYearConfig,
  PersonnelProfile,
  ClassConfig,
  SubjectAllocation,
  StudentMaster,
  GovernanceAssignment,
  AuditTrailEntry,
  ImportSession,
  RollbackRecord,
  GuruImportRow,
  GuruImportPreviewResponse,
  GuardianInfo,
  ResidentialAddress,
  WelfareInfo,
  ApdmStudentImportRow,
  ApdmStudentImportPreviewResponse,
} from './types/isepadu';

export * from './types/kokurikulum';
export * from './types/auth';
export * from './utils/academicVisualStandard';

