import React from 'react';
import { SchoolSettings } from '../types';
import { MonthlyAnalysisOverall } from '../types';
import { Printer, X } from 'lucide-react';
import { useSchoolTenant } from '../contexts/SchoolTenantContext';

interface PrintMonthlyAnalysisReportProps {
  schoolSettings: SchoolSettings | null;
  overall: MonthlyAnalysisOverall;
  filterCategory: 'ALL' | 'GURU' | 'AKP';
  onClose: () => void;
}

export const PrintMonthlyAnalysisReport: React.FC<PrintMonthlyAnalysisReportProps> = ({
  schoolSettings,
  overall,
  filterCategory,
  onClose,
}) => {
  const tenant = useSchoolTenant();
  const activeSchoolName = schoolSettings?.schoolName || tenant.schoolName;
  const activeSchoolCode = schoolSettings?.schoolCode || tenant.schoolCode;
  const handlePrint = () => {
    window.print();
  };

  const categoryTitle = 
    filterCategory === 'GURU'
      ? 'Kategori: Guru & Pentadbir (教师组 / 含校长与副校长)'
      : filterCategory === 'AKP'
      ? 'Kategori: Anggota Kumpulan Pelaksana - AKP (实行组职员)'
      : 'Kategori: Keseluruhan Guru & AKP (全体教职员)';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-start p-4 sm:p-6 overflow-y-auto">
      
      {/* Top Floating Controls (Hidden on Print) */}
      <div className="w-full max-w-5xl flex items-center justify-between bg-slate-900 border border-slate-700 p-3 rounded-2xl shadow-xl mb-4 print:hidden">
        <div className="text-xs text-slate-300">
          <span className="font-semibold text-white">月度出勤分析打印预览 (Pratonton Cetakan Analisis Kehadiran)</span>
          <span className="text-slate-500 ml-2">| 适用标准 A4 纵向/横向打印</span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handlePrint}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 transition shadow"
          >
            <Printer className="w-4 h-4" />
            <span>列印月报表 / Cetak</span>
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Printable Sheet (Standard White Paper A4 Format) */}
      <div className="w-full max-w-5xl bg-white text-slate-900 rounded-xl p-8 sm:p-12 shadow-2xl print:shadow-none print:p-0 print:m-0 print:max-w-none print:w-full font-sans text-xs">
        
        {/* School Header */}
        <div className="text-center border-b-2 border-slate-900 pb-4 mb-6">
          <h2 className="text-xl sm:text-2xl font-bold uppercase tracking-wider text-slate-900 font-serif">
            {activeSchoolName}
          </h2>
          {activeSchoolCode && (
            <p className="text-xs text-slate-600 font-mono mt-0.5">
              KOD SEKOLAH: {activeSchoolCode}
            </p>
          )}
          <h3 className="text-base sm:text-lg font-bold mt-2 text-slate-900 uppercase tracking-wide">
            LAPORAN ANALISIS KEHADIRAN BULANAN GURU & AKP
          </h3>
          <p className="text-sm font-semibold text-slate-700 mt-0.5">
            教职员月度出勤综合分析统计报告
          </p>
          <div className="flex items-center justify-center gap-4 text-xs text-slate-600 mt-2">
            <span>BULAN / 月份: <strong className="text-slate-900">{overall.monthLabelZh} ({overall.monthLabelMs})</strong></span>
            <span>|</span>
            <span>{categoryTitle}</span>
          </div>
        </div>

        {/* Future Month Notice */}
        {overall.isFutureMonth && (
          <div className="p-4 bg-amber-50 border border-amber-300 text-amber-800 rounded-lg text-center font-medium mb-6">
            提示：选定月份属于未来月份，暂无统计数据 (Tiada Data Statistik untuk Bulan Masa Hadapan)。
          </div>
        )}

        {/* Key Summary Metrics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 border border-slate-400 rounded-lg p-3 mb-6 bg-slate-50 text-center">
          <div className="p-2 border-r border-slate-300">
            <span className="text-[10px] text-slate-500 block">教职员人数 (Jumlah Staf)</span>
            <span className="text-base font-bold text-slate-900 font-mono">{overall.totalStaffCount} 位</span>
            <span className="text-[10px] text-slate-500 block mt-0.5">应到 {overall.totalExpectedPersonDays} 人日</span>
          </div>

          <div className="p-2 border-r border-slate-300">
            <span className="text-[10px] text-slate-500 block">综合出席率 (Kadar Kehadiran)</span>
            <span className="text-base font-bold text-blue-700 font-mono">{overall.overallAttendanceRateStr}</span>
            <span className="text-[10px] text-slate-600 font-mono block mt-0.5">{overall.overallAttendanceRatioStr}</span>
          </div>

          <div className="p-2 border-r border-slate-300">
            <span className="text-[10px] text-slate-500 block">曾迟到人员 (Staf Pernah Lewat)</span>
            <span className="text-base font-bold text-amber-700 font-mono">
              {overall.everLateStaffCount} 位 ({overall.everLateStaffRateStr})
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">{overall.everLateStaffRatioStr}</span>
          </div>

          <div className="p-2">
            <span className="text-[10px] text-slate-500 block">综合迟到率 (Kadar Lewat)</span>
            <span className="text-base font-bold text-rose-700 font-mono">{overall.overallLateRateStr}</span>
            <span className="text-[10px] text-slate-600 font-mono block mt-0.5">{overall.overallLateRatioStr}</span>
          </div>
        </div>

        {/* Detailed Attendance Table (Strictly NO GPS Coordinates, NO Accuracy, NO Jawatan/Role) */}
        <div className="mb-6">
          <h4 className="font-bold text-slate-900 mb-2 uppercase text-[11px] tracking-wider border-l-3 border-blue-600 pl-2">
            1. Jadual Analisis Kehadiran Terperinci Mengikut Staf / 教职员月度出勤分析明细
          </h4>
          <table className="w-full text-left text-[10px] border-collapse border border-slate-400">
            <thead>
              <tr className="bg-slate-200 text-slate-800 uppercase font-semibold border-b border-slate-400 text-center">
                <th className="p-1.5 border border-slate-400 w-6">Bil</th>
                <th className="p-1.5 border border-slate-400 text-left">Nama Guru / Staf</th>
                <th className="p-1.5 border border-slate-400 w-12">Kategori</th>
                <th className="p-1.5 border border-slate-400 w-12">应到 (Hari)</th>
                <th className="p-1.5 border border-slate-400 w-12">实到 (Hadir)</th>
                <th className="p-1.5 border border-slate-400 w-16">出席率 (%)</th>
                <th className="p-1.5 border border-slate-400 w-12">迟到 (Hari)</th>
                <th className="p-1.5 border border-slate-400 w-16">迟到率 (%)</th>
                <th className="p-1.5 border border-slate-400 w-16">最早到校</th>
                <th className="p-1.5 border border-slate-400 w-12">公务/培训</th>
                <th className="p-1.5 border border-slate-400 w-12">请假</th>
                <th className="p-1.5 border border-slate-400 w-14">待核实</th>
                <th className="p-1.5 border border-slate-400 text-left">Catatan / 备注</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300">
              {overall.staffMetrics.length === 0 ? (
                <tr>
                  <td colSpan={13} className="p-4 text-center text-slate-500">
                    暂无符合条件的教职员数据
                  </td>
                </tr>
              ) : (
                overall.staffMetrics.map((m, idx) => (
                  <tr key={m.user.uid} className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                    <td className="p-1.5 border border-slate-300 text-center font-mono">{idx + 1}</td>
                    <td className="p-1.5 border border-slate-300 font-medium">
                      <div className="font-bold text-slate-900">{m.user.name}</div>
                      <div className="text-[9px] text-slate-500 font-mono">{m.user.email}</div>
                    </td>
                    <td className="p-1.5 border border-slate-300 text-center font-semibold">
                      <span className={`px-1 py-0.5 rounded text-[9px] ${
                        m.user.role === 'PRINCIPAL'
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : m.effectiveCategory === 'GURU'
                          ? 'bg-blue-100 text-blue-900'
                          : 'bg-emerald-100 text-emerald-900'
                      }`}>
                        {m.user.role === 'PRINCIPAL' ? 'GURU BESAR' : m.effectiveCategory}
                      </span>
                    </td>
                    <td className="p-1.5 border border-slate-300 text-center font-mono">{m.expectedDays}</td>
                    <td className="p-1.5 border border-slate-300 text-center font-mono font-bold text-blue-800">
                      {m.actualAttendedDays}
                    </td>
                    <td className="p-1.5 border border-slate-300 text-center font-mono font-bold">
                      {m.attendanceRateStr}
                    </td>
                    <td className="p-1.5 border border-slate-300 text-center font-mono text-rose-700">
                      {m.lateDays > 0 ? `${m.lateDays}次` : '-'}
                    </td>
                    <td className="p-1.5 border border-slate-300 text-center font-mono">
                      {m.lateRateStr}
                    </td>
                    <td className="p-1.5 border border-slate-300 text-center font-mono">
                      {m.earliestCount > 0 ? (
                        <div>
                          <span className="font-bold text-emerald-700">{m.earliestCount}次</span>
                          <span className="text-[8px] text-slate-500 block">{m.earliestBestTimeStr}</span>
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="p-1.5 border border-slate-300 text-center font-mono">
                      {m.officialDutyDays > 0 ? `${m.officialDutyDays}天` : '-'}
                    </td>
                    <td className="p-1.5 border border-slate-300 text-center font-mono">
                      {m.personalLeaveDays > 0 ? `${m.personalLeaveDays}天` : '-'}
                    </td>
                    <td className="p-1.5 border border-slate-300 text-center font-mono">
                      {m.unverifiedDays > 0 ? (
                        <span className="text-amber-700 font-semibold">{m.unverifiedDays}天</span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="p-1.5 border border-slate-300 text-[9px] text-slate-600">
                      {m.tenureNote || (m.extraWeekendDays > 0 ? `周末到校${m.extraWeekendDays}天` : '-')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Reason Breakdown & Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <h4 className="font-bold text-slate-900 mb-2 uppercase text-[11px] tracking-wider border-l-3 border-purple-600 pl-2">
              2. Pecahan Sebab Ketidakhadiran / 未到校原因占比分析
            </h4>
            <table className="w-full text-left text-[10px] border-collapse border border-slate-400">
              <thead>
                <tr className="bg-slate-200 text-slate-800 uppercase font-semibold text-center border-b border-slate-400">
                  <th className="p-1.5 border border-slate-400 text-left">Sebab / 原因</th>
                  <th className="p-1.5 border border-slate-400 w-12">Hari / 天数</th>
                  <th className="p-1.5 border border-slate-400 w-18">Kadar (应到占比)</th>
                  <th className="p-1.5 border border-slate-400 w-20">Pecahan (申报占比)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300">
                {overall.reasonSummary.map((r) => (
                  <tr key={r.code}>
                    <td className="p-1.5 border border-slate-300">
                      <span className="font-medium">{r.labelZh}</span>
                      {r.isOfficial && (
                        <span className="ml-1 text-[8px] bg-blue-100 text-blue-800 px-1 py-0.2 rounded font-semibold">
                          公务培训
                        </span>
                      )}
                    </td>
                    <td className="p-1.5 border border-slate-300 text-center font-mono font-bold">{r.days}</td>
                    <td className="p-1.5 border border-slate-300 text-center font-mono">{r.rateOverExpectedStr}</td>
                    <td className="p-1.5 border border-slate-300 text-center font-mono">{r.shareOverDeclaredStr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Leaderboard & Honor Roll */}
          <div>
            <h4 className="font-bold text-slate-900 mb-2 uppercase text-[11px] tracking-wider border-l-3 border-emerald-600 pl-2">
              3. Kedudukan & Pengiktirafan / 出席率与最早到校排行榜
            </h4>
            <div className="space-y-2 text-[10px]">
              {/* Highest Attendance */}
              <div className="border border-slate-300 rounded p-2 bg-slate-50">
                <span className="font-bold text-slate-800 block mb-1">
                  ★ 最高出席率 (Kedudukan Kehadiran Tertinggi，同分并列)：
                </span>
                <div className="space-y-0.5">
                  {overall.rankingAttendanceHighest.slice(0, 3).map((item, i) => (
                    <div key={i} className="flex justify-between font-mono">
                      <span>#{item.rank} {item.staff.user.name} ({item.staff.effectiveCategory})</span>
                      <span className="font-bold text-blue-700">{item.staff.attendanceRateStr} {item.staff.attendanceRatioStr}</span>
                    </div>
                  ))}
                  {overall.rankingAttendanceHighest.length === 0 && <span className="text-slate-500">暂无数据</span>}
                </div>
              </div>

              {/* Earliest Arrival */}
              <div className="border border-slate-300 rounded p-2 bg-slate-50">
                <span className="font-bold text-slate-800 block mb-1">
                  ★ 最早到校先锋 (Kekerapan Terawal Hadir，同时间并列)：
                </span>
                <div className="space-y-0.5">
                  {overall.rankingEarliest.slice(0, 3).map((item, i) => (
                    <div key={i} className="flex justify-between font-mono">
                      <span>#{item.rank} {item.staff.user.name} ({item.staff.effectiveCategory})</span>
                      <span className="font-bold text-emerald-700">{item.staff.earliestCount}次 ({item.staff.earliestBestTimeStr})</span>
                    </div>
                  ))}
                  {overall.rankingEarliest.length === 0 && <span className="text-slate-500">当月暂无最早记录</span>}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Verification & Data Disclaimer */}
        <div className="p-2.5 bg-slate-100 border border-slate-300 rounded text-[9px] text-slate-600 mb-6 space-y-1">
          <p className="font-bold text-slate-700">统计口径与说明 (Nota Metodologi Analisis):</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>迟到标准：教师 (Guru，含校长与副校长) 每天 07:00:00 之后首次打卡计迟到；实行组职员 (AKP) 08:00:00 之后计迟到。刚好截止时间算准时。每天最多计一次出席与一次迟到。</li>
            <li>出席率分母为原定应到校日（排除周末与公休假）；已批准个人假期仍列入应到校日分母以客观反映请假率。全校百分比用总人日计算，不直接平均个人百分比。</li>
            <li>未打卡且未申报原因之应到校日标注为“待核实”，不自动认定为旷职。非应到校日额外到校单列，不令出席率超过100%。</li>
          </ul>
        </div>

        {/* Official Signature Section: STRICTLY PRINCIPAL ONLY */}
        <div className="flex justify-end mt-8 pt-4 border-t border-slate-300 text-xs text-slate-800">
          <div className="w-64 text-center">
            <p className="font-semibold text-slate-900">Disahkan Oleh (核准人 / 校长 Guru Besar):</p>
            <div className="mt-16 border-b border-slate-600 w-full mx-auto"></div>
            <p className="mt-1 text-[11px] font-bold text-slate-900">
              {tenant.isLegacySchool && schoolSettings?.principalEmail ? 'TEO YANG MING' : 'Guru Besar'}
            </p>
            <p className="text-[10px] text-slate-600">Guru Besar, {activeSchoolName}</p>
            <p className="text-[10px] text-slate-500 font-mono mt-0.5">Tarikh / 日期: {overall.monthStr}-30</p>
            <p className="text-[10px] text-slate-500 mt-1">Cop Rasmi Sekolah (校印):</p>
          </div>
        </div>

        {/* Footer Audit Notice */}
        <div className="mt-8 text-[9px] text-slate-400 text-center border-t border-slate-200 pt-2 font-mono">
          Rekod dijana secara rasmi oleh Modul Analisis Kehadiran Sistem Sekolah berasaskan Google Cloud Firestore & Waktu Piawai Malaysia (UTC+8).
        </div>

      </div>

    </div>
  );
};
