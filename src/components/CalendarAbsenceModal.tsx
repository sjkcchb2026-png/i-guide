import React, { useState } from 'react';
import { UserProfile, SchoolCalendarDay, StaffAbsenceRecord, AbsenceCategoryType } from '../types';
import { db } from '../firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { ABSENCE_REASON_MAP, DEFAULT_SARAWAK_HOLIDAYS_2026 } from '../utils/monthlyAnalysis';
import { validateLeaveSubmission } from '../utils/checkoutRules';
import { deepSanitizeFirestore } from '../utils/sanitizeFirestore';
import { Calendar, UserX, Plus, Trash2, X, AlertCircle, CheckCircle, ShieldCheck } from 'lucide-react';

interface CalendarAbsenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffList: UserProfile[];
  currentMonthStr: string; // YYYY-MM
  calendarDays: SchoolCalendarDay[];
  absenceRecords: StaffAbsenceRecord[];
  onRefreshData?: () => void;
}

export const CalendarAbsenceModal: React.FC<CalendarAbsenceModalProps> = ({
  isOpen,
  onClose,
  staffList,
  currentMonthStr,
  calendarDays,
  absenceRecords,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'absence' | 'calendar'>('absence');

  // Absence Form state
  const [selectedStaffUid, setSelectedStaffUid] = useState<string>(staffList[0]?.uid || '');
  const [absenceDate, setAbsenceDate] = useState<string>(`${currentMonthStr}-01`);
  const [absenceCategory, setAbsenceCategory] = useState<AbsenceCategoryType>('KURSUS');
  const [absenceReason, setAbsenceReason] = useState<string>('');
  const [isSubmittingAbsence, setIsSubmittingAbsence] = useState<boolean>(false);

  // Calendar Form state
  const [holidayDate, setHolidayDate] = useState<string>(`${currentMonthStr}-01`);
  const [holidayName, setHolidayName] = useState<string>('');
  const [holidayType, setHolidayType] = useState<'PUBLIC_HOLIDAY' | 'SCHOOL_HOLIDAY' | 'SPECIAL_DUTY'>('SCHOOL_HOLIDAY');
  const [isSubmittingHoliday, setIsSubmittingHoliday] = useState<boolean>(false);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (!isOpen) return null;

  // Handle Add Absence Record
  const handleAddAbsence = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const staff = staffList.find((s) => s.uid === selectedStaffUid);
    if (!staff || !absenceDate || !absenceReason.trim()) {
      setFeedback({ type: 'error', message: '请完整选择教职员、日期并输入事由。' });
      return;
    }

    // 严谨校验填报时间合规性（病假必须当天填写，公务与特殊长假允许提前或补填）
    const validation = validateLeaveSubmission(absenceCategory, absenceDate);
    if (!validation.isValid) {
      setFeedback({
        type: 'error',
        message: validation.errorMessage || 'Ralat: Tarikh yang dipilih tidak sah bagi kategori ini.',
      });
      return;
    }

    try {
      setIsSubmittingAbsence(true);
      const isOfficial = ['KURSUS', 'MESYUARAT', 'PERTANDINGAN', 'URUSAN_RASMI', 'BENGKEL', 'TAKLIMAT'].includes(absenceCategory);
      const recordId = `${staff.uid}_${absenceDate}`;

      await setDoc(doc(db, 'absence_records', recordId), deepSanitizeFirestore({
        id: recordId,
        userId: staff.uid,
        userName: staff.name,
        userEmail: staff.email,
        date: absenceDate,
        category: absenceCategory,
        reason: absenceReason.trim(),
        isOfficialDuty: isOfficial,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      setFeedback({
        type: 'success',
        message: `已成功登记 ${staff.name} 于 ${absenceDate} 的 ${ABSENCE_REASON_MAP[absenceCategory]?.labelZh || absenceCategory} 记录！`,
      });
      setAbsenceReason('');
    } catch (err: any) {
      console.error('Failed to add absence record:', err);
      setFeedback({ type: 'error', message: `登记失败：${err.message || '权限不足或网络异常'}` });
    } finally {
      setIsSubmittingAbsence(false);
    }
  };

  // Handle Delete Absence Record
  const handleDeleteAbsence = async (id: string, name: string, date: string) => {
    if (!confirm(`确定要移除 ${name} 于 ${date} 的未到校记录吗？`)) return;
    try {
      await deleteDoc(doc(db, 'absence_records', id));
      setFeedback({ type: 'success', message: `已移除 ${name} 于 ${date} 的记录。` });
    } catch (err: any) {
      console.error('Delete absence failed:', err);
      setFeedback({ type: 'error', message: `移除失败：${err.message}` });
    }
  };

  // Handle Add School Calendar Holiday
  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!holidayDate || !holidayName.trim()) {
      setFeedback({ type: 'error', message: '请完整选择日期并输入假期/活动名称。' });
      return;
    }

    try {
      setIsSubmittingHoliday(true);
      const calId = `cal_${holidayDate}`;
      await setDoc(doc(db, 'school_calendar', calId), deepSanitizeFirestore({
        date: holidayDate,
        name: holidayName.trim(),
        isSchoolDay: holidayType === 'SPECIAL_DUTY',
        type: holidayType,
      }));

      setFeedback({
        type: 'success',
        message: `已成功保存校历设置：${holidayDate} - ${holidayName}！`,
      });
      setHolidayName('');
    } catch (err: any) {
      console.error('Failed to add calendar holiday:', err);
      setFeedback({ type: 'error', message: `保存失败：${err.message}` });
    } finally {
      setIsSubmittingHoliday(false);
    }
  };

  // Handle Delete Calendar Holiday
  const handleDeleteHoliday = async (date: string, name: string) => {
    if (!confirm(`确定要移除 ${date} (${name}) 的校历日历设定吗？`)) return;
    try {
      await deleteDoc(doc(db, 'school_calendar', `cal_${date}`));
      setFeedback({ type: 'success', message: `已移除 ${date} 的校历设定。` });
    } catch (err: any) {
      console.error('Delete calendar failed:', err);
      setFeedback({ type: 'error', message: `移除失败：${err.message}` });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-7 max-w-3xl w-full text-white shadow-2xl relative my-8">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">学校校历与未到校申报管理</h3>
            <p className="text-xs text-slate-400">Takwim Cuti Sekolah & Rekod Ketidakhadiran Staf</p>
          </div>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-slate-800 mb-6 space-x-4 text-xs font-semibold">
          <button
            onClick={() => { setActiveSubTab('absence'); setFeedback(null); }}
            className={`pb-2.5 transition flex items-center gap-1.5 ${
              activeSubTab === 'absence'
                ? 'border-b-2 border-indigo-500 text-indigo-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserX className="w-4 h-4" />
            <span>教职员请假 / 公务培训登记 ({absenceRecords.length})</span>
          </button>
          <button
            onClick={() => { setActiveSubTab('calendar'); setFeedback(null); }}
            className={`pb-2.5 transition flex items-center gap-1.5 ${
              activeSubTab === 'calendar'
                ? 'border-b-2 border-indigo-500 text-indigo-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>学校行事历与特假设定 ({calendarDays.length})</span>
          </button>
        </div>

        {/* Feedback alert */}
        {feedback && (
          <div className={`p-3 rounded-xl border text-xs mb-4 flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
              : 'bg-rose-950/80 border-rose-700 text-rose-200'
          }`}>
            <span>{feedback.message}</span>
            <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">✕</button>
          </div>
        )}

        {/* ================= TAB 1: ABSENCE REGISTRATION ================= */}
        {activeSubTab === 'absence' && (
          <div className="space-y-6">
            
            {/* Form */}
            <form onSubmit={handleAddAbsence} className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-4">
              <div className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                <span>登记教职员未到校申报 (公务培训 / 批准假期)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Staff Selection */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">选择教职员：</label>
                  <select
                    value={selectedStaffUid}
                    onChange={(e) => setSelectedStaffUid(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    {staffList.map((s) => (
                      <option key={s.uid} value={s.uid}>
                        {s.name} ({s.role === 'PRINCIPAL' ? 'Guru Besar (校长)' : s.category === 'GURU' ? 'Guru (教师)' : 'AKP (职员)'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">日期 (Tarikh)：</label>
                  <input
                    type="date"
                    value={absenceDate}
                    onChange={(e) => setAbsenceDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">事由类型 (Kategori)：</label>
                  <select
                    value={absenceCategory}
                    onChange={(e) => setAbsenceCategory(e.target.value as AbsenceCategoryType)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <optgroup label="公务 / 培训 (不混入个人请假率)">
                      <option value="MESYUARAT">官方会议 (MESYUARAT RASMI)</option>
                      <option value="PERTANDINGAN">带队比赛 (MEMBAWA PASUKAN PERTANDINGAN)</option>
                      <option value="KURSUS">培训课程 (KURSUS)</option>
                      <option value="URUSAN_RASMI">公务外出 (URUSAN RASMI)</option>
                      <option value="BENGKEL">工作坊/研讨 (BENGKEL)</option>
                      <option value="TAKLIMAT">官方简报 (TAKLIMAT)</option>
                    </optgroup>
                    <optgroup label="个人批准假期 (列入应到分母核算请假率)">
                      <option value="CRK">特别事假 (CRK)</option>
                      <option value="CUTI_SAKIT">病假 (CUTI SAKIT / MC - 当天填报)</option>
                      <option value="CUTI_BARAH">重病假 (CUTI BARAH / BERAT)</option>
                      <option value="CUTI_BERSALIN">产假/陪产假 (CUTI BERSALIN)</option>
                      <option value="CUTI_HAJI">朝觐假 (CUTI HAJI)</option>
                      <option value="CUTI_KUARANTIN">隔离假 (CUTI KUARANTIN)</option>
                      <option value="CUTI_LAIN">其他批准事假 (CUTI LAIN)</option>
                    </optgroup>
                  </select>
                </div>
              </div>

              {/* Detail Reason */}
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  详细说明 / 批假文号 (Keterangan / Rujukan)：
                </label>
                <input
                  type="text"
                  value={absenceReason}
                  onChange={(e) => setAbsenceReason(e.target.value)}
                  placeholder="例如：参加县教育局华文科工作坊 (Bengkel PPD) / 诊所病假单"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmittingAbsence}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{isSubmittingAbsence ? '保存中...' : '提交登记'}</span>
                </button>
              </div>
            </form>

            {/* List */}
            <div>
              <div className="text-xs font-bold text-slate-300 mb-2">已登记之申报记录列表：</div>
              <div className="max-h-60 overflow-y-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3">日期</th>
                      <th className="py-2.5 px-3">姓名</th>
                      <th className="py-2.5 px-3">类别</th>
                      <th className="py-2.5 px-3">说明</th>
                      <th className="py-2.5 px-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {absenceRecords.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-500 text-xs">
                          暂无任何未到校申报记录。应到校日未打卡者将自动列入“待核实 (Perlu Pengesahan)”。
                        </td>
                      </tr>
                    ) : (
                      absenceRecords.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-mono text-slate-200">{item.date}</td>
                          <td className="py-2 px-3 font-medium text-white">{item.userName}</td>
                          <td className="py-2 px-3">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                              ABSENCE_REASON_MAP[item.category]?.color || 'bg-slate-800 text-slate-300'
                            }`}>
                              {ABSENCE_REASON_MAP[item.category]?.labelZh || item.category}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-[11px] text-slate-400">{item.reason}</td>
                          <td className="py-2 px-3 text-right">
                            <button
                              onClick={() => handleDeleteAbsence(item.id, item.userName, item.date)}
                              className="p-1 text-slate-500 hover:text-rose-400 rounded transition"
                              title="移除记录"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* ================= TAB 2: CALENDAR HOLIDAYS ================= */}
        {activeSubTab === 'calendar' && (
          <div className="space-y-6">
            
            {/* Form */}
            <form onSubmit={handleAddHoliday} className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-4">
              <div className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                <span>添加学校特假 / 行事历调整 (Takwim & Cuti Peristiwa)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Date */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">特假日期 (Tarikh)：</label>
                  <input
                    type="date"
                    value={holidayDate}
                    onChange={(e) => setHolidayDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                {/* Holiday Name */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">假期/活动名称：</label>
                  <input
                    type="text"
                    value={holidayName}
                    onChange={(e) => setHolidayName(e.target.value)}
                    placeholder="例如：学校运动会特假 / Cuti Peristiwa"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Type */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">类别：</label>
                  <select
                    value={holidayType}
                    onChange={(e) => setHolidayType(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="SCHOOL_HOLIDAY">学校假期 (无需到校)</option>
                    <option value="PUBLIC_HOLIDAY">公共假期 (无需到校)</option>
                    <option value="SPECIAL_DUTY">特别执勤日 (周末须到校执勤)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmittingHoliday}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{isSubmittingHoliday ? '保存中...' : '保存校历'}</span>
                </button>
              </div>
            </form>

            {/* List */}
            <div>
              <div className="text-xs font-bold text-slate-300 mb-2">已自定义之校历假期：</div>
              <div className="max-h-60 overflow-y-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3">日期</th>
                      <th className="py-2.5 px-3">名称</th>
                      <th className="py-2.5 px-3">性质</th>
                      <th className="py-2.5 px-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {calendarDays.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-slate-500 text-xs">
                          暂无自定义校历记录。系统默认自动采用砂拉越法定公休假与周一至五上课日。
                        </td>
                      </tr>
                    ) : (
                      calendarDays.map((cal) => (
                        <tr key={cal.date} className="hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-mono text-slate-200">{cal.date}</td>
                          <td className="py-2 px-3 font-medium text-white">{cal.name}</td>
                          <td className="py-2 px-3 text-[11px]">
                            {cal.isSchoolDay ? (
                              <span className="text-amber-400">特别执勤日</span>
                            ) : (
                              <span className="text-emerald-400">学校公休日</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              onClick={() => handleDeleteHoliday(cal.date, cal.name)}
                              className="p-1 text-slate-500 hover:text-rose-400 rounded transition"
                              title="移除设定"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Default Holidays Reference Accordion */}
            <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-3 text-[11px] text-slate-400 space-y-1">
              <span className="font-semibold text-slate-300 block">系统内置砂拉越 2026 年标准公共假期（自动排除应到校日）：</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[10px]">
                {Object.entries(DEFAULT_SARAWAK_HOLIDAYS_2026).slice(0, 10).map(([d, name]) => (
                  <div key={d} className="flex justify-between font-mono">
                    <span className="text-slate-400">{d}</span>
                    <span className="text-slate-300 truncate ml-2">{name}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
};
