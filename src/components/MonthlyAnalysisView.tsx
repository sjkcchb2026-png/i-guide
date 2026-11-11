import React, { useState, useMemo } from 'react';
import {
  UserProfile,
  SchoolSettings,
  AttendanceRecord,
  StaffAbsenceRecord,
  SchoolCalendarDay
} from '../types';
import {
  calculateMonthlyAnalysis,
  generateMonthlyAnalysisCSV,
  ABSENCE_REASON_MAP
} from '../utils/monthlyAnalysis';
import { PrintMonthlyAnalysisReport } from './PrintMonthlyAnalysisReport';
import { CalendarAbsenceModal } from './CalendarAbsenceModal';
import {
  Calendar,
  Users,
  Clock,
  Award,
  AlertTriangle,
  Printer,
  Download,
  Search,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Briefcase,
  UserCheck,
  Zap,
  Info
} from 'lucide-react';

interface MonthlyAnalysisViewProps {
  currentUser: UserProfile;
  schoolSettings: SchoolSettings | null;
  staffList: UserProfile[];
  attendanceRecords: AttendanceRecord[];
  customCalendarDays: SchoolCalendarDay[];
  absenceRecords: StaffAbsenceRecord[];
}

export const MonthlyAnalysisView: React.FC<MonthlyAnalysisViewProps> = ({
  currentUser,
  schoolSettings,
  staffList,
  attendanceRecords,
  customCalendarDays,
  absenceRecords,
}) => {
  // Current month string in Malaysia (YYYY-MM)
  const defaultMonthStr = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    return `${y}-${m}`;
  }, []);

  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonthStr);
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'GURU' | 'AKP'>('ALL');
  const [selectedUserId, setSelectedUserId] = useState<string>('ALL');
  const [expandedStaffUid, setExpandedStaffUid] = useState<string | null>(null);

  // Modals state
  const [showPrintReport, setShowPrintReport] = useState<boolean>(false);
  const [showCalendarModal, setShowCalendarModal] = useState<boolean>(false);

  // Month navigation helpers
  const handlePrevMonth = () => {
    const [yStr, mStr] = selectedMonth.split('-');
    let y = parseInt(yStr, 10);
    let m = parseInt(mStr, 10) - 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    setSelectedMonth(`${y}-${m.toString().padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [yStr, mStr] = selectedMonth.split('-');
    let y = parseInt(yStr, 10);
    let m = parseInt(mStr, 10) + 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    setSelectedMonth(`${y}-${m.toString().padStart(2, '0')}`);
  };

  // Run Monthly Analysis calculation
  const overall = useMemo(() => {
    return calculateMonthlyAnalysis({
      monthStr: selectedMonth,
      staffList,
      attendanceRecords,
      customCalendarDays,
      absenceRecords,
      filterCategory: selectedCategory,
      filterUserId: selectedUserId,
    });
  }, [selectedMonth, staffList, attendanceRecords, customCalendarDays, absenceRecords, selectedCategory, selectedUserId]);

  // CSV Export
  const handleExportCSV = () => {
    const csvData = generateMonthlyAnalysisCSV(overall);
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Analisis_Kehadiran_${overall.monthStr}_${selectedCategory}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Selected single staff for day-by-day detail
  const singleStaffDetail = useMemo(() => {
    if (selectedUserId !== 'ALL') {
      return overall.staffMetrics.find((s) => s.user.uid === selectedUserId) || null;
    }
    if (expandedStaffUid) {
      return overall.staffMetrics.find((s) => s.user.uid === expandedStaffUid) || null;
    }
    return null;
  }, [selectedUserId, expandedStaffUid, overall.staffMetrics]);

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Control Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                月度出勤综合分析 (Analisis Kehadiran Bulanan)
              </span>
              <span className="text-xs text-slate-400">仅校长特权查看</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white mt-1">
              {overall.monthLabelZh} ({overall.monthLabelMs}) 出勤统计
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Guru 07:00 / AKP 08:00 迟到界限核验、同分并列排名、未到校原因占比及标准报告列印
            </p>
          </div>

          {/* Month Selector & Controls */}
          <div className="flex flex-wrap items-center gap-2">
            
            {/* Month Picker with Prev/Next */}
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-2xl p-1">
              <button
                onClick={handlePrevMonth}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
                title="上个月"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => {
                  if (e.target.value) setSelectedMonth(e.target.value);
                }}
                className="bg-transparent text-xs text-white font-mono px-2 py-1 focus:outline-none cursor-pointer"
              />
              <button
                onClick={handleNextMonth}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
                title="下个月"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Calendar & Leave Management Button */}
            <button
              onClick={() => setShowCalendarModal(true)}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition"
              title="配置校历假期与登记教职员请假/公务培训"
            >
              <Calendar className="w-4 h-4 text-indigo-400" />
              <span>校历与请假申报</span>
            </button>

            {/* CSV Download */}
            <button
              onClick={handleExportCSV}
              className="px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-medium flex items-center gap-1.5 transition"
              title="导出带 BOM 的 UTF-8 CSV 试算表"
            >
              <Download className="w-4 h-4" />
              <span>导出 CSV</span>
            </button>

            {/* Print Monthly Report */}
            <button
              onClick={() => setShowPrintReport(true)}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 shadow-lg shadow-blue-900/30 transition"
            >
              <Printer className="w-4 h-4" />
              <span>打印分析报告</span>
            </button>

          </div>

        </div>

        {/* Filter Controls: Category Tabs & Staff Select */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-6 pt-5 border-t border-slate-800">
          
          {/* Category Tabs */}
          <div className="flex items-center space-x-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setSelectedCategory('ALL')}
              className={`px-3 py-1.5 rounded-lg transition font-medium ${
                selectedCategory === 'ALL'
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              全部教职员 ({staffList.length})
            </button>
            <button
              onClick={() => setSelectedCategory('GURU')}
              className={`px-3 py-1.5 rounded-lg transition font-medium ${
                selectedCategory === 'GURU'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              教师组 GURU (含校长/副校长)
            </button>
            <button
              onClick={() => setSelectedCategory('AKP')}
              className={`px-3 py-1.5 rounded-lg transition font-medium ${
                selectedCategory === 'AKP'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              实行组 AKP
            </button>
          </div>

          {/* Staff Filter Dropdown */}
          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-400">查看个别人员：</span>
            <select
              value={selectedUserId}
              onChange={(e) => {
                setSelectedUserId(e.target.value);
                setExpandedStaffUid(e.target.value !== 'ALL' ? e.target.value : null);
              }}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
            >
              <option value="ALL">全员总体汇总 (Semua)</option>
              {staffList.map((s) => (
                <option key={s.uid} value={s.uid}>
                  {s.name} ({s.role === 'PRINCIPAL' ? 'Guru Besar (校长)' : s.category === 'GURU' ? 'Guru (教师)' : 'AKP (职员)'})
                </option>
              ))}
            </select>
          </div>

        </div>

      </div>

      {/* Future Month Notice */}
      {overall.isFutureMonth && (
        <div className="bg-amber-950/40 border border-amber-500/40 rounded-2xl p-4 text-xs text-amber-200 flex items-center gap-2.5">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <span>选定月份属于未来月份，系统暂无统计数据 (Tiada Data Statistik untuk Bulan Masa Hadapan)。</span>
        </div>
      )}

      {/* Unverified Days Notice */}
      {overall.totalUnverifiedPersonDays > 0 && (
        <div className="bg-blue-950/40 border border-blue-500/30 rounded-2xl p-4 text-xs text-blue-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-400 shrink-0" />
            <span>
              当月存在 <strong>{overall.totalUnverifiedPersonDays} 人日</strong> 应到校日未打卡且未申报原因，已列为<strong>「待核实 (Perlu Pengesahan)」</strong>，不自动认定为旷职。
            </span>
          </div>
          <button
            onClick={() => setShowCalendarModal(true)}
            className="text-[11px] text-indigo-300 hover:text-white underline ml-2"
          >
            补录申报
          </button>
        </div>
      )}

      {/* Key Metric Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        {/* 1. Expected Days */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow">
          <span className="text-xs text-slate-400 block mb-1">应到校总人日 (Sepatutnya)</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-white font-mono">{overall.totalExpectedPersonDays}</span>
            <span className="text-[11px] text-slate-400">{overall.totalStaffCount} 位人员</span>
          </div>
          <span className="text-[10px] text-slate-500 block mt-1">已排除周末与公休假</span>
        </div>

        {/* 2. Attendance Rate */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow">
          <span className="text-xs text-slate-400 block mb-1">综合出席率 (Kadar Kehadiran)</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-blue-400 font-mono">{overall.overallAttendanceRateStr}</span>
            <span className="text-[11px] text-blue-300 font-mono">{overall.overallAttendanceRatioStr}</span>
          </div>
          <span className="text-[10px] text-slate-500 block mt-1">实际到校 {overall.totalActualAttendedPersonDays} 人日</span>
        </div>

        {/* 3. Ever Late Rate */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow">
          <span className="text-xs text-slate-400 block mb-1">曾迟到人员比例 (Pernah Lewat)</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-amber-400 font-mono">{overall.everLateStaffRateStr}</span>
            <span className="text-[11px] text-amber-300 font-mono">{overall.everLateStaffRatioStr}</span>
          </div>
          <span className="text-[10px] text-slate-500 block mt-1">至少迟到 1 次之人员数</span>
        </div>

        {/* 4. Lateness Rate */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow">
          <span className="text-xs text-slate-400 block mb-1">综合迟到率 (Kadar Lewat)</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-rose-400 font-mono">{overall.overallLateRateStr}</span>
            <span className="text-[11px] text-rose-300 font-mono">{overall.overallLateRatioStr}</span>
          </div>
          <span className="text-[10px] text-slate-500 block mt-1">迟到人次: {overall.totalLatePersonDays}</span>
        </div>

      </div>

      {/* Secondary Metrics: Duties, Leaves, Extra Days */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-slate-400 block text-[11px]">公务与培训人日</span>
            <span className="font-bold text-indigo-300 text-sm">{overall.totalOfficialDutyPersonDays} 人日</span>
          </div>
          <Briefcase className="w-4 h-4 text-indigo-400" />
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-slate-400 block text-[11px]">个人批准请假人日</span>
            <span className="font-bold text-amber-300 text-sm">{overall.totalPersonalLeavePersonDays} 人日</span>
          </div>
          <UserCheck className="w-4 h-4 text-amber-400" />
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-slate-400 block text-[11px]">待核实缺勤人日</span>
            <span className="font-bold text-slate-300 text-sm">{overall.totalUnverifiedPersonDays} 人日</span>
          </div>
          <HelpCircle className="w-4 h-4 text-slate-400" />
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-slate-400 block text-[11px]">周末/额外到校人日</span>
            <span className="font-bold text-cyan-300 text-sm">{overall.totalExtraWeekendPersonDays} 人日</span>
          </div>
          <Zap className="w-4 h-4 text-cyan-400" />
        </div>
      </div>

      {/* Two Columns: Reason Breakdown Meter & Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left: Absence Reason Breakdown */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-white">未到校原因占比分析 (Pecahan Sebab)</h3>
              <p className="text-[11px] text-slate-400">应到校占比与已申报未到校总天数占比分析</p>
            </div>
            <span className="text-xs font-mono text-purple-400 font-semibold">
              已申报: {overall.totalDeclaredAbsencePersonDays} 人日
            </span>
          </div>

          <div className="space-y-3">
            {overall.reasonSummary.map((item) => (
              <div key={item.code} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-slate-200">{item.labelZh}</span>
                    {item.isOfficial && (
                      <span className="text-[9px] bg-blue-500/20 text-blue-300 px-1 py-0.2 rounded border border-blue-500/30">
                        公务培训
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[11px] space-x-2 text-slate-400">
                    <span className="font-bold text-white">{item.days} 天</span>
                    <span>应到率: {item.rateOverExpectedStr}</span>
                    <span className="text-purple-300">占比: {item.shareOverDeclaredStr}</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className={`h-full transition-all duration-500 ${
                      item.isOfficial
                        ? 'bg-blue-500'
                        : item.code === 'PERLU_PENGESAHAN'
                        ? 'bg-slate-600'
                        : 'bg-amber-500'
                    }`}
                    style={{
                      width: `${
                        overall.totalExpectedPersonDays > 0
                          ? Math.min(100, (item.days / overall.totalExpectedPersonDays) * 100)
                          : 0
                      }%`,
                    }}
                  ></div>
                </div>
              </div>
            ))}

            {overall.reasonSummary.length === 0 && (
              <div className="py-8 text-center text-xs text-slate-500">
                当月全员全勤或暂无未到校申报记录。
              </div>
            )}
          </div>
        </div>

        {/* Right: Honor Roll & Rankings (Tie Rank Supported) */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
          <div>
            <h3 className="text-sm font-bold text-white">月度榜单与荣誉排行 (同分并列)</h3>
            <p className="text-[11px] text-slate-400">出席率排名、迟到率榜单与最早到校先锋</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            
            {/* Top Attendance */}
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-blue-300">
                <Award className="w-4 h-4 text-blue-400" />
                <span>最高出席率 (Tertinggi)</span>
              </div>
              <div className="space-y-1.5">
                {overall.rankingAttendanceHighest.slice(0, 4).map((entry, idx) => (
                  <div key={idx} className="flex items-center justify-between py-0.5 border-b border-slate-800/50">
                    <span className="truncate pr-1">
                      <strong className="text-purple-400 font-mono mr-1">#{entry.rank}</strong>
                      {entry.staff.user.name}
                    </span>
                    <span className="font-mono font-bold text-blue-400 shrink-0">
                      {entry.staff.attendanceRateStr}
                    </span>
                  </div>
                ))}
                {overall.rankingAttendanceHighest.length === 0 && (
                  <span className="text-slate-500 text-[11px]">暂无数据</span>
                )}
              </div>
            </div>

            {/* Earliest Arrival */}
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-emerald-300">
                <Clock className="w-4 h-4 text-emerald-400" />
                <span>最早到校先锋 (Terawal)</span>
              </div>
              <div className="space-y-1.5">
                {overall.rankingEarliest.slice(0, 4).map((entry, idx) => (
                  <div key={idx} className="flex items-center justify-between py-0.5 border-b border-slate-800/50">
                    <span className="truncate pr-1">
                      <strong className="text-emerald-400 font-mono mr-1">#{entry.rank}</strong>
                      {entry.staff.user.name}
                    </span>
                    <span className="font-mono text-emerald-400 text-[11px] shrink-0 font-bold">
                      {entry.staff.earliestCount}次 ({entry.staff.earliestBestTimeStr})
                    </span>
                  </div>
                ))}
                {overall.rankingEarliest.length === 0 && (
                  <span className="text-slate-500 text-[11px]">当月暂无打卡数据</span>
                )}
              </div>
            </div>

            {/* Lateness Ranking */}
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3.5 space-y-2 sm:col-span-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-rose-300">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>迟到人员明细榜 (Senarai Lewat)</span>
                </div>
                <span className="text-[10px] text-slate-500">Guru &gt;07:00 / AKP &gt;08:00</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {overall.rankingLate.map((entry, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1 px-2 rounded bg-slate-900 border border-slate-800/80">
                    <span className="truncate">
                      <strong className="text-rose-400 font-mono mr-1">#{entry.rank}</strong>
                      {entry.staff.user.name} ({entry.staff.effectiveCategory})
                    </span>
                    <span className="font-mono text-rose-400 font-bold ml-1">
                      {entry.staff.lateDays}次 ({entry.staff.lateRateStr})
                    </span>
                  </div>
                ))}
                {overall.rankingLate.length === 0 && (
                  <div className="col-span-2 py-2 text-center text-emerald-400 text-[11px]">
                    ✓ 当月全员准时到校，无任何迟到记录！
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Full Monthly Staff Metrics Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">全校教职员月度出勤指标总表</h3>
            <p className="text-[11px] text-slate-400">点击教职员姓名或右侧按钮可查看全月逐日打卡明细日历</p>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            共 {overall.staffMetrics.length} 位人员
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
              <tr>
                <th className="py-3 px-3 text-center w-8">Bil</th>
                <th className="py-3 px-4">教职员姓名</th>
                <th className="py-3 px-3 text-center">类别</th>
                <th className="py-3 px-3 text-center">应到天数</th>
                <th className="py-3 px-3 text-center">实到天数</th>
                <th className="py-3 px-3 text-center">出席率 (%)</th>
                <th className="py-3 px-3 text-center">迟到天数</th>
                <th className="py-3 px-3 text-center">迟到率 (%)</th>
                <th className="py-3 px-3 text-center">最早到校 (次/率)</th>
                <th className="py-3 px-3 text-center">公务培训</th>
                <th className="py-3 px-3 text-center">请假</th>
                <th className="py-3 px-3 text-center">待核实</th>
                <th className="py-3 px-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono">
              {overall.staffMetrics.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-8 text-center text-slate-500 font-sans text-xs">
                    暂无符合条件的教职员数据
                  </td>
                </tr>
              ) : (
                overall.staffMetrics.map((m, idx) => (
                  <tr
                    key={m.user.uid}
                    className={`hover:bg-slate-800/40 transition ${
                      expandedStaffUid === m.user.uid ? 'bg-slate-800/60' : ''
                    }`}
                  >
                    <td className="py-3 px-3 text-center text-slate-500">{idx + 1}</td>
                    
                    {/* Name */}
                    <td className="py-3 px-4 font-sans">
                      <div className="font-semibold text-white text-sm">{m.user.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{m.user.email}</div>
                      {m.tenureNote && (
                        <span className="text-[10px] text-amber-400 font-sans block mt-0.5">
                          {m.tenureNote}
                        </span>
                      )}
                    </td>

                    {/* Category */}
                    <td className="py-3 px-3 text-center font-sans">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        m.user.role === 'PRINCIPAL'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : m.effectiveCategory === 'GURU'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}>
                        {m.user.role === 'PRINCIPAL' ? 'GURU BESAR' : m.effectiveCategory}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-center font-bold text-white">{m.expectedDays}</td>
                    
                    <td className="py-3 px-3 text-center font-bold text-blue-400">{m.actualAttendedDays}</td>
                    
                    {/* Attendance Rate */}
                    <td className="py-3 px-3 text-center">
                      <span className="font-bold text-white block">{m.attendanceRateStr}</span>
                      <span className="text-[10px] text-slate-500 font-sans">{m.attendanceRatioStr}</span>
                    </td>

                    {/* Late Days */}
                    <td className="py-3 px-3 text-center">
                      {m.lateDays > 0 ? (
                        <span className="text-rose-400 font-bold">{m.lateDays}天</span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>

                    {/* Late Rate */}
                    <td className="py-3 px-3 text-center">
                      <span className={m.lateDays > 0 ? 'text-rose-400 font-bold' : 'text-slate-500'}>
                        {m.lateRateStr}
                      </span>
                      {m.lateDays > 0 && (
                        <span className="text-[10px] text-slate-500 font-sans block">{m.lateRatioStr}</span>
                      )}
                    </td>

                    {/* Earliest Rate */}
                    <td className="py-3 px-3 text-center">
                      {m.earliestCount > 0 ? (
                        <div>
                          <span className="font-bold text-emerald-400">{m.earliestCount}次</span>
                          <span className="text-[10px] text-slate-400 block font-sans">{m.earliestRateStr}</span>
                          <span className="text-[9px] text-emerald-300/80 block">最早 {m.earliestBestTimeStr}</span>
                        </div>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-center text-indigo-300">{m.officialDutyDays || '-'}</td>
                    
                    <td className="py-3 px-3 text-center text-amber-300">{m.personalLeaveDays || '-'}</td>
                    
                    <td className="py-3 px-3 text-center">
                      {m.unverifiedDays > 0 ? (
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 text-[10px] font-sans">
                          {m.unverifiedDays}天待核
                        </span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-center font-sans">
                      <button
                        onClick={() => setExpandedStaffUid(expandedStaffUid === m.user.uid ? null : m.user.uid)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs transition"
                      >
                        {expandedStaffUid === m.user.uid ? '收起' : '逐日明细'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Individual Day-by-Day Calendar Breakdown (When expanded) */}
      {singleStaffDetail && (
        <div className="bg-slate-900 border border-purple-500/40 rounded-3xl p-6 shadow-2xl space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <span className="text-xs text-purple-400 font-semibold uppercase tracking-wider block">
                个人全月逐日出勤流水账 (Rekod Harian Individu)
              </span>
              <h3 className="text-lg font-bold text-white mt-0.5">
                {singleStaffDetail.user.name} ({singleStaffDetail.effectiveCategory}) - {overall.monthLabelZh}
              </h3>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="px-3 py-1 rounded-xl bg-blue-500/20 text-blue-300 border border-blue-500/30">
                出席率: {singleStaffDetail.attendanceRateStr} {singleStaffDetail.attendanceRatioStr}
              </span>
              <span className="px-3 py-1 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30">
                迟到率: {singleStaffDetail.lateRateStr} {singleStaffDetail.lateRatioStr}
              </span>
              <button
                onClick={() => setExpandedStaffUid(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto border border-slate-800 rounded-2xl">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] sticky top-0 font-medium">
                <tr>
                  <th className="py-2.5 px-3">日期</th>
                  <th className="py-2.5 px-3">星期</th>
                  <th className="py-2.5 px-3">第一轮 (Sesi 1)</th>
                  <th className="py-2.5 px-3">第二轮 (Sesi 2)</th>
                  <th className="py-2.5 px-3">出勤状态判定</th>
                  <th className="py-2.5 px-3">最早到校</th>
                  <th className="py-2.5 px-3">备注 / 事由</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {Object.values(singleStaffDetail.dailyMap).map((d) => (
                  <tr
                    key={d.date}
                    className={`hover:bg-slate-800/40 ${
                      d.isWeekend ? 'bg-slate-950/40 text-slate-500' : ''
                    }`}
                  >
                    <td className="py-2 px-3 font-bold text-slate-200">{d.date}</td>
                    <td className="py-2 px-3 text-[11px] font-sans">{d.dayZh}</td>
                    
                    {/* Sesi 1 */}
                    <td className="py-2 px-3">
                      {d.firstCheckInTimeStr ? (
                        <span>
                          <strong className={d.isLate ? 'text-rose-400' : 'text-emerald-400'}>
                            {d.firstCheckInTimeStr}
                          </strong>
                          {d.firstCheckOutTimeStr && (
                            <span className="text-slate-500 text-[10px] ml-1">
                              ~ {d.firstCheckOutTimeStr}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>

                    {/* Sesi 2 */}
                    <td className="py-2 px-3">
                      {d.secondCheckInTimeStr ? (
                        <span>
                          <strong className="text-slate-300">{d.secondCheckInTimeStr}</strong>
                          {d.secondCheckOutTimeStr && (
                            <span className="text-slate-500 text-[10px] ml-1">
                              ~ {d.secondCheckOutTimeStr}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>

                    {/* Status badge */}
                    <td className="py-2 px-3 font-sans">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${d.statusBadgeClass}`}>
                        {d.statusLabel}
                      </span>
                    </td>

                    {/* Earliest */}
                    <td className="py-2 px-3">
                      {d.isEarliest ? (
                        <span className="text-emerald-400 font-sans font-bold text-[10px] flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> 同组最早
                        </span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>

                    {/* Notes */}
                    <td className="py-2 px-3 text-[11px] font-sans text-slate-400">
                      {d.absenceReason || d.holidayName || (d.isLate ? `迟到打卡（规定 ${singleStaffDetail.effectiveCategory === 'GURU' ? '07:00:00' : '08:00:00'} 前）` : '-')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Printable Report Modal */}
      {showPrintReport && (
        <PrintMonthlyAnalysisReport
          schoolSettings={schoolSettings}
          overall={overall}
          filterCategory={selectedCategory}
          onClose={() => setShowPrintReport(false)}
        />
      )}

      {/* Calendar & Absence Management Modal */}
      {showCalendarModal && (
        <CalendarAbsenceModal
          isOpen={showCalendarModal}
          onClose={() => setShowCalendarModal(false)}
          staffList={staffList}
          currentMonthStr={selectedMonth}
          calendarDays={customCalendarDays}
          absenceRecords={absenceRecords}
        />
      )}

    </div>
  );
};
