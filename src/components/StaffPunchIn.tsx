import React, { useState, useEffect } from 'react';
import { UserProfile, AttendanceRecord, UserAttendanceState, StaffAbsenceRecord, AbsenceCategoryType } from '../types';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  limit,
  doc,
  setDoc,
  deleteDoc
} from 'firebase/firestore';
import { 
  getTodayDateString, 
  getCurrentMalaysiaTimeString,
  formatTimeFromTimestamp, 
  formatDisplayDate, 
  calculateDuration 
} from '../utils/date';
import { getCurrentGPSPosition, GeolocationError } from '../utils/geo';
import { EarlyCheckoutModal } from './EarlyCheckoutModal';
import { checkGuruEarlyLeave, checkAkpEarlyLeave, validateLeaveSubmission } from '../utils/checkoutRules';
import { ABSENCE_REASON_MAP } from '../utils/monthlyAnalysis';
import { deepSanitizeFirestore } from '../utils/sanitizeFirestore';
import { 
  LogIn, 
  LogOut, 
  Clock, 
  Calendar, 
  AlertTriangle, 
  CheckCircle, 
  History, 
  ShieldCheck, 
  Compass,
  Check,
  Info,
  Briefcase,
  FileText,
  Send,
  Trash2,
  Tag,
  CalendarCheck
} from 'lucide-react';

interface StaffPunchInProps {
  currentUser: UserProfile;
}

function getDatesInRange(startDateStr: string, endDateStr: string): string[] {
  const dates: string[] = [];
  const start = new Date(`${startDateStr}T00:00:00Z`);
  const end = new Date(`${endDateStr}T00:00:00Z`);
  
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return [startDateStr];
  }
  
  const current = new Date(start);
  while (current <= end) {
    const y = current.getUTCFullYear();
    const m = String(current.getUTCMonth() + 1).padStart(2, '0');
    const d = String(current.getUTCDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    current.setUTCDate(current.getUTCDate() + 1);
    if (dates.length > 90) break; // safety guard
  }
  return dates;
}

export const StaffPunchIn: React.FC<StaffPunchInProps> = ({ currentUser }) => {
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDateDisplay, setCurrentDateDisplay] = useState<string>('');
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
  const [historyRecords, setHistoryRecords] = useState<AttendanceRecord[]>([]);
  const [attendanceState, setAttendanceState] = useState<UserAttendanceState | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    title: string;
    message: string;
  } | null>(null);

  // Absence / Official duty declaration state
  const todayStr = getTodayDateString();
  const [myAbsenceRecords, setMyAbsenceRecords] = useState<StaffAbsenceRecord[]>([]);
  const [absenceCategory, setAbsenceCategory] = useState<AbsenceCategoryType>('MESYUARAT');
  const [absenceStartDate, setAbsenceStartDate] = useState<string>(todayStr);
  const [absenceEndDate, setAbsenceEndDate] = useState<string>(todayStr);
  const [absenceReason, setAbsenceReason] = useState<string>('');
  const [isSubmittingAbsence, setIsSubmittingAbsence] = useState<boolean>(false);
  const [deletingAbsenceId, setDeletingAbsenceId] = useState<string | null>(null);
  const [absenceFeedback, setAbsenceFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Early checkout modal states
  const [showEarlyCheckoutModal, setShowEarlyCheckoutModal] = useState<boolean>(false);
  const [earlyRuleDescription, setEarlyRuleDescription] = useState<string>('');

  // Real-time clock update every second strictly formatted in Asia/Kuala_Lumpur
  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(getCurrentMalaysiaTimeString());
      setCurrentDateDisplay(formatDisplayDate(getTodayDateString()));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // 1. Authoritative subscription to user_attendance_state (Direct state tracking)
  useEffect(() => {
    if (!currentUser?.uid) return;

    const unsubscribe = onSnapshot(
      doc(db, 'user_attendance_state', currentUser.uid),
      (docSnap) => {
        if (docSnap.exists()) {
          setAttendanceState(docSnap.data() as UserAttendanceState);
        } else {
          setAttendanceState({ currentStatus: 'OUT', activeSessionId: null });
        }
      },
      (error) => {
        console.warn('user_attendance_state subscription notice:', error);
      }
    );

    return () => unsubscribe();
  }, [currentUser?.uid]);

  // 2. Subscribe to user's today attendance records
  useEffect(() => {
    if (!currentUser?.uid) return;

    const q = query(
      collection(db, 'attendance'),
      where('userId', '==', currentUser.uid),
      where('date', '==', todayStr)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const records: AttendanceRecord[] = [];
        snapshot.forEach((docSnap) => {
          records.push(docSnap.data() as AttendanceRecord);
        });
        records.sort((a, b) => a.slot - b.slot);
        setTodayRecords(records);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'attendance');
      }
    );

    return () => unsubscribe();
  }, [currentUser?.uid, todayStr]);

  // 3. Subscribe to user's recent history (for history view only)
  useEffect(() => {
    if (!currentUser?.uid) return;

    const qHistory = query(
      collection(db, 'attendance'),
      where('userId', '==', currentUser.uid),
      orderBy('date', 'desc'),
      limit(14)
    );

    const unsubscribe = onSnapshot(
      qHistory,
      (snapshot) => {
        const list: AttendanceRecord[] = [];
        snapshot.forEach((docSnap) => {
          list.push(docSnap.data() as AttendanceRecord);
        });
        setHistoryRecords(list);
      },
      (error) => {
        console.warn('History subscription notice:', error);
      }
    );

    return () => unsubscribe();
  }, [currentUser?.uid]);

  // 3b. Subscribe to user's absence and official duty records
  useEffect(() => {
    if (!currentUser?.uid) return;

    const qAbsence = query(
      collection(db, 'absence_records'),
      where('userId', '==', currentUser.uid),
      orderBy('date', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(
      qAbsence,
      (snapshot) => {
        const list: StaffAbsenceRecord[] = [];
        snapshot.forEach((docSnap) => {
          list.push(docSnap.data() as StaffAbsenceRecord);
        });
        setMyAbsenceRecords(list);
      },
      (error) => {
        console.warn('myAbsenceRecords subscription notice:', error);
      }
    );

    return () => unsubscribe();
  }, [currentUser?.uid]);

  // 4. Authoritative slot & unclosed state computation directly from user_attendance_state
  const isCrossDayUnclosed = 
    attendanceState?.currentStatus === 'IN' &&
    !!attendanceState.activeSessionId &&
    !!attendanceState.activeSessionDate &&
    attendanceState.activeSessionDate !== todayStr;

  const slot1 = todayRecords.find((r) => r.slot === 1);
  const slot2 = todayRecords.find((r) => r.slot === 2);
  const unclosedCrossDaySession = isCrossDayUnclosed
    ? {
        date: attendanceState!.activeSessionDate!,
        slot: attendanceState!.activeSessionSlot || 1,
      }
    : null;

  let activeSessionText = '未打卡 / Belum Masuk';
  let canCheckIn = false;
  let canCheckOut = false;
  let currentTargetSlot = 1;
  let isCompletedToday = false;

  if (isCrossDayUnclosed) {
    // Cross-day unclosed session detected directly from user_attendance_state!
    canCheckIn = false;
    canCheckOut = true;
    currentTargetSlot = attendanceState?.activeSessionSlot || 1;
    activeSessionText = `跨日离校待办：您于 ${attendanceState?.activeSessionDate} 第 ${currentTargetSlot} 轮尚未 Check Out。请先真实 Check Out！`;
  } else if (attendanceState?.currentStatus === 'IN') {
    // Active session in progress today
    canCheckIn = false;
    canCheckOut = true;
    currentTargetSlot = attendanceState.activeSessionSlot || 1;
    activeSessionText = `第 ${currentTargetSlot} 轮进行中 (Sesi ${currentTargetSlot} Sedang Bertugas)`;
  } else {
    // OUT status: calculate remaining slots for today
    let slotCountToday = 0;
    if (attendanceState?.lastDate === todayStr && typeof attendanceState.todaySlotCount === 'number') {
      slotCountToday = attendanceState.todaySlotCount;
    } else {
      slotCountToday = todayRecords.filter((r) => r.status === 'COMPLETED').length;
    }

    if (slotCountToday >= 2) {
      canCheckIn = false;
      canCheckOut = false;
      isCompletedToday = true;
      activeSessionText = '今日两组打卡已全数完成 (Maksimum 2 Sesi Selesai)';
    } else if (slotCountToday === 1) {
      canCheckIn = true;
      canCheckOut = false;
      currentTargetSlot = 2;
      activeSessionText = '第一轮已完成，可进行第二轮打卡 (Sesi 2)';
    } else {
      canCheckIn = true;
      canCheckOut = false;
      currentTargetSlot = 1;
      activeSessionText = '准备打卡第一轮 (Sesi 1)';
    }
  }

  // Handle Check In via Secure Server Endpoint
  const handleCheckIn = async () => {
    if (!canCheckIn || isProcessing) return;
    setFeedback(null);
    setIsProcessing(true);

    try {
      // 1. Get high-precision GPS position (Strict verification)
      const location = await getCurrentGPSPosition();

      // 2. Obtain caller ID token
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error('用户登录凭证已失效，请重新登录。');
      }

      // 3. Post to authoritative backend (Enforces server UTC+8 time, mutex, max 2 slots)
      const res = await fetch('/api/attendance/punch-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '打卡未成功');
      }

      // 4. Show success ONLY after backend confirms
      setFeedback({
        type: 'success',
        title: `Check In 成功！(Berjaya)`,
        message: `第 ${data.slot || currentTargetSlot} 轮上班已登记。伺服器时间与 GPS 校验已保存。\n(Sesi ${data.slot || currentTargetSlot} bermula pada masa pelayan UTC+8.)`,
      });
    } catch (err: any) {
      console.error('Check In error:', err);
      setFeedback({
        type: 'error',
        title: 'Check In 失败！(Gagal)',
        message: err instanceof GeolocationError 
          ? err.message 
          : `打卡未成功：${err.message || '无法连接至云端服务器，请稍候再试。'}\n(Kehadiran belum direkodkan. Sila cuba lagi.)`,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Check Out Click with Rules Verification (Guru and AKP)
  const handleCheckOutClick = () => {
    if (!canCheckOut || isProcessing) return;

    // Check early leave rules
    const isGuru = currentUser.category === 'GURU' || currentUser.role === 'PRINCIPAL';
    if (isGuru) {
      const check = checkGuruEarlyLeave(new Date());
      if (check.reasonRequired) {
        setEarlyRuleDescription(check.ruleDescription || '教师提前离校须登记理由。');
        setShowEarlyCheckoutModal(true);
        return;
      }
    } else if (currentUser.category === 'AKP') {
      const activeRecord = todayRecords.find((r) => r.status === 'IN');
      const check = checkAkpEarlyLeave(currentTargetSlot, slot1, activeRecord?.checkInTime, new Date());
      if (check.reasonRequired) {
        setEarlyRuleDescription(check.ruleDescription || 'AKP 净工时不足 7 小时须登记理由。');
        setShowEarlyCheckoutModal(true);
        return;
      }
    }

    // Direct check-out if no reason required
    handleCheckOut();
  };

  // Handle Check Out via Secure Server Endpoint
  const handleCheckOut = async (earlyReason?: string) => {
    if (!canCheckOut || isProcessing) return;
    setFeedback(null);
    setIsProcessing(true);

    try {
      // 1. Get high-precision GPS position
      const location = await getCurrentGPSPosition();

      // 2. Obtain caller ID token
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error('用户登录凭证已失效，请重新登录。');
      }

      // 3. Post to authoritative backend
      const res = await fetch('/api/attendance/punch-out', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          earlyCheckOutReason: earlyReason || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Check Out 失败');
      }

      // 4. Show success
      setFeedback({
        type: 'success',
        title: `Check Out 成功！(Berjaya)`,
        message: earlyReason 
          ? `离校已成功登记（已记录理由：${earlyReason}）。辛苦了！\n(Sesi tamat. Alasan telah direkodkan.)`
          : `离校已成功登记。辛苦了！\n(Sesi tamat. Rekod telah disimpan pada masa pelayan.)`,
      });
    } catch (err: any) {
      console.error('Check Out error:', err);
      setFeedback({
        type: 'error',
        title: 'Check Out 失败！(Gagal)',
        message: err instanceof GeolocationError 
          ? err.message 
          : `打卡未成功：${err.message || '数据保存失败，请检查网络后再试。'}\n(Kehadiran belum direkodkan.)`,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Absence category selection handler
  const handleCategoryChange = (newCat: AbsenceCategoryType) => {
    setAbsenceCategory(newCat);
    setAbsenceFeedback(null);
    if (newCat === 'CUTI_SAKIT') {
      setAbsenceStartDate(todayStr);
      setAbsenceEndDate(todayStr);
    }
  };

  // Quick tag filler
  const applyQuickTag = (cat: AbsenceCategoryType, reasonText: string) => {
    setAbsenceCategory(cat);
    setAbsenceReason(reasonText);
    setAbsenceFeedback(null);
    if (cat === 'CUTI_SAKIT') {
      setAbsenceStartDate(todayStr);
      setAbsenceEndDate(todayStr);
    }
  };

  // Submit absence / official duty declaration
  const handleSubmitAbsence = async (e: React.FormEvent) => {
    e.preventDefault();
    setAbsenceFeedback(null);

    if (!currentUser?.uid) return;
    if (!absenceStartDate) {
      setAbsenceFeedback({ type: 'error', message: '请选择开始日期 (Sila pilih tarikh mula).' });
      return;
    }
    if (!absenceReason.trim()) {
      setAbsenceFeedback({ type: 'error', message: '请填写详细事由或批假文号 (Sila nyatakan sebab / rujukan).' });
      return;
    }

    const effectiveEndDate = !absenceEndDate || absenceEndDate < absenceStartDate ? absenceStartDate : absenceEndDate;

    // Strict validation rule check
    const validation = validateLeaveSubmission(absenceCategory, absenceStartDate);
    if (!validation.isValid) {
      setAbsenceFeedback({
        type: 'error',
        message: validation.errorMessage || 'Ralat: Tarikh tidak sah bagi kategori ini.',
      });
      return;
    }

    if (absenceCategory === 'CUTI_SAKIT' && effectiveEndDate !== todayStr) {
      setAbsenceFeedback({
        type: 'error',
        message: 'Ralat: Cuti Sakit (MC) hanya dibenarkan isi pada hari berkenaan sahaja (hari ini).',
      });
      return;
    }

    const dateList = getDatesInRange(absenceStartDate, effectiveEndDate);
    const isOfficial = ['KURSUS', 'MESYUARAT', 'PERTANDINGAN', 'URUSAN_RASMI', 'BENGKEL', 'TAKLIMAT'].includes(absenceCategory);

    try {
      setIsSubmittingAbsence(true);

      for (const d of dateList) {
        const recordId = `${currentUser.uid}_${d}`;
        await setDoc(doc(db, 'absence_records', recordId), deepSanitizeFirestore({
          id: recordId,
          userId: currentUser.uid,
          userName: currentUser.name,
          userEmail: currentUser.email,
          date: d,
          startDate: absenceStartDate,
          endDate: effectiveEndDate,
          category: absenceCategory,
          reason: absenceReason.trim(),
          isOfficialDuty: isOfficial,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));
      }

      setAbsenceFeedback({
        type: 'success',
        message: `已成功登记 ${dateList.length} 天的【${ABSENCE_REASON_MAP[absenceCategory]?.labelZh || absenceCategory}】！数据已同步至月报与总览。`,
      });

      setAbsenceReason('');
    } catch (err: any) {
      console.error('Failed to submit absence:', err);
      setAbsenceFeedback({
        type: 'error',
        message: `登记失败：${err.message || '网络异常或权限受限'}`,
      });
    } finally {
      setIsSubmittingAbsence(false);
    }
  };

  // Delete own absence declaration
  const handleDeleteMyAbsence = async (rec: StaffAbsenceRecord) => {
    if (!window.confirm(`确定要撤销于 ${rec.date} 的【${ABSENCE_REASON_MAP[rec.category]?.labelZh || rec.category}】申报吗？`)) {
      return;
    }
    try {
      setDeletingAbsenceId(rec.id);
      await deleteDoc(doc(db, 'absence_records', rec.id));
      setAbsenceFeedback({
        type: 'success',
        message: `已成功撤销 ${rec.date} 的申报。`,
      });
    } catch (err: any) {
      console.error('Delete absence failed:', err);
      setAbsenceFeedback({
        type: 'error',
        message: `撤销失败：${err.message || '权限不足'}`,
      });
    } finally {
      setDeletingAbsenceId(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      
      {/* Welcome & Live Time Card */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700/80 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute -right-16 -top-16 w-56 h-56 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 mb-1">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                currentUser.category === 'GURU'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}>
                {currentUser.category === 'GURU' ? '教师 / GURU' : '职员 / AKP'}
              </span>
              <span className="text-xs text-slate-400">ID: {currentUser.email.split('@')[0]}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {currentUser.name} 老师/同仁
            </h2>
            <div className="flex items-center text-xs text-slate-300 mt-1 space-x-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-400" />
              <span>{currentDateDisplay || todayStr}</span>
            </div>
          </div>

          {/* Big Live Digital Clock */}
          <div className="bg-slate-950/70 border border-slate-700/60 rounded-2xl px-5 py-3 text-center sm:text-right shrink-0">
            <div className="text-3xl sm:text-4xl font-mono font-bold text-white tracking-wider">
              {currentTime || '--:--:--'}
            </div>
            <div className="text-[11px] text-emerald-400 font-medium flex items-center justify-center sm:justify-end gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              <span>马来西亚标准时间 (Waktu Piawai Malaysia)</span>
            </div>
          </div>
        </div>

        {/* Status Banner */}
        <div className="mt-5 pt-4 border-t border-slate-700/60 flex items-center justify-between text-xs sm:text-sm">
          <div className="flex items-center space-x-2 text-slate-300">
            <span className="text-slate-400">当前状态:</span>
            <span className="font-medium text-blue-300">{activeSessionText}</span>
          </div>
          <div className="flex items-center space-x-1 text-slate-400 text-xs">
            <Compass className="w-3.5 h-3.5 text-indigo-400" />
            <span>GPS 经纬度即时验证</span>
          </div>
        </div>
      </div>

      {/* Feedback Message Alert */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-sm flex items-start space-x-3 shadow-lg transition-all animate-in fade-in slide-in-from-top-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-700 text-emerald-100'
              : 'bg-rose-950/80 border-rose-700 text-rose-100'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <h4 className="font-semibold text-base">{feedback.title}</h4>
            <p className="mt-1 text-xs sm:text-sm whitespace-pre-line leading-relaxed opacity-90">
              {feedback.message}
            </p>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs opacity-60 hover:opacity-100 p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Cross-day unclosed session reminder banner */}
      {unclosedCrossDaySession && (
        <div className="p-4 bg-amber-950/80 border border-amber-600/60 rounded-2xl text-xs sm:text-sm text-amber-200 flex items-start space-x-3 shadow-lg">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold text-white text-sm">存在跨日未离校记录 (Sesi Semalam Belum Check Out)</h4>
            <p className="leading-relaxed opacity-90">
              您于 <span className="font-mono font-bold text-white">{unclosedCrossDaySession.date}</span>（第 <span className="font-bold text-white">{unclosedCrossDaySession.slot}</span> 轮）尚未 Check Out。系统严守真实考勤原则，不会自动补填或虚构离校时间。请点击右侧 <span className="font-bold text-amber-300">Check Out</span> 记录当前的实际离校时间与位置，完成后方可开始今日打卡。
            </p>
          </div>
        </div>
      )}

      {/* Main Touch Buttons (Check In / Check Out) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-200">
            今日考勤打卡操作 (Tindakan Kehadiran Hari Ini)
          </h3>
          <span className="text-xs text-slate-400">每日最多两组 (Maksimum 2 Sesi)</span>
        </div>

        {/* Buttons Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          
          {/* Check In Button */}
          <button
            type="button"
            onClick={handleCheckIn}
            disabled={!canCheckIn || isProcessing}
            className={`w-full py-5 px-6 rounded-2xl font-bold text-lg flex flex-col items-center justify-center space-y-1.5 transition-all shadow-lg select-none ${
              canCheckIn && !isProcessing
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-900/40 active:scale-[0.98] cursor-pointer'
                : 'bg-slate-800/80 text-slate-500 border border-slate-800 cursor-not-allowed opacity-60'
            }`}
          >
            <div className="flex items-center space-x-2">
              <LogIn className="w-6 h-6" />
              <span>Check In</span>
            </div>
            <span className="text-xs font-normal opacity-90">
              {currentTargetSlot === 1
                ? '开始第一轮 (Sesi 1)'
                : currentTargetSlot === 2 && !slot2
                ? '开始第二轮 (Sesi 2)'
                : '到校打卡'}
            </span>
          </button>

          {/* Check Out Button */}
          <button
            type="button"
            onClick={handleCheckOutClick}
            disabled={!canCheckOut || isProcessing}
            className={`w-full py-5 px-6 rounded-2xl font-bold text-lg flex flex-col items-center justify-center space-y-1.5 transition-all shadow-lg select-none ${
              canCheckOut && !isProcessing
                ? 'bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white shadow-rose-900/40 active:scale-[0.98] cursor-pointer'
                : 'bg-slate-800/80 text-slate-500 border border-slate-800 cursor-not-allowed opacity-60'
            }`}
          >
            <div className="flex items-center space-x-2">
              <LogOut className="w-6 h-6" />
              <span>Check Out</span>
            </div>
            <span className="text-xs font-normal opacity-90">
              {unclosedCrossDaySession
                ? `跨日离校 (${unclosedCrossDaySession.date} Sesi ${unclosedCrossDaySession.slot})`
                : slot1?.status === 'IN'
                ? '结束第一轮 (Tamat Sesi 1)'
                : slot2?.status === 'IN'
                ? '结束第二轮 (Tamat Sesi 2)'
                : '离校打卡'}
            </span>
          </button>

        </div>

        {/* In-Progress Loading Indicator */}
        {isProcessing && (
          <div className="py-3 px-4 bg-blue-950/40 border border-blue-800/50 rounded-xl flex items-center justify-center space-x-2.5 text-xs text-blue-200">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
            <span>正在取得高精度 GPS 卫星定位与伺服器时间，请保持手机平稳...</span>
          </div>
        )}

        {/* Rule reminder note - Updated according to school regulations */}
        <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl text-xs text-slate-400 space-y-2">
          <p className="flex items-center gap-1.5 text-slate-200 font-semibold text-xs">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
            <span>离校打卡核验守则 (Peraturan Waktu Balik & Jam Kerja)</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-2.5 space-y-1">
              <span className="text-blue-300 font-bold block">教师 (Guru) 离校规定时间：</span>
              <ul className="space-y-0.5 text-slate-400 list-disc pl-3.5">
                <li>星期一、二：<span className="text-white font-mono font-medium">13:00</span> 前离校须填理由</li>
                <li>星期三、四：<span className="text-white font-mono font-medium">12:30</span> 前离校须填理由</li>
                <li>星期五：<span className="text-white font-mono font-medium">11:30</span> 前离校须填理由</li>
                <li>星期六、日：<span className="text-emerald-400 font-medium">周末豁免</span>检查</li>
              </ul>
            </div>
            <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-2.5 space-y-1">
              <span className="text-emerald-300 font-bold block">实行组职员 (AKP) 工时规定：</span>
              <ul className="space-y-0.5 text-slate-400 list-disc pl-3.5">
                <li>合计两组工时，并扣除每日 1 小时休息</li>
                <li>已通过午休打卡排除的时间不会重复扣除</li>
                <li>净工时不足 <span className="text-white font-mono font-medium">7小时</span> 仍须填写理由</li>
                <li>星期六、日：<span className="text-emerald-400 font-medium">周末豁免</span>检查</li>
              </ul>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 pl-1">
            * Guru 和 AKP 每天都允许两组 Check In + Check Out（Sesi 1 与 Sesi 2），报告分别记录。
          </p>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* EMBEDDED LEAVE & OFFICIAL DUTY CARD (PERMOHONAN TUGAS RASMI & CUTI)      */}
      {/* Guru, Guru Besar, and AKP direct self-service declaration                */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border border-indigo-900/40 rounded-3xl p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <Briefcase className="w-4 h-4" />
              </span>
              <span>公务外出与假期申报 / Permohonan Tugas Rasmi & Cuti</span>
            </h3>
            <p className="text-xs text-slate-400">
              全员适用（Guru、Guru Besar 与 AKP）。无论是培训、开会、公务外出还是病假/事假，均可在此登记并即时核算至月报。
            </p>
          </div>
          <span className="self-start sm:self-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 whitespace-nowrap">
            统一数据中心 (SSOT)
          </span>
        </div>

        {/* Absence Feedback Notification */}
        {absenceFeedback && (
          <div
            className={`p-3.5 rounded-2xl border text-xs sm:text-sm flex items-center justify-between shadow-lg transition-all ${
              absenceFeedback.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-700 text-emerald-100'
                : 'bg-rose-950/80 border-rose-700 text-rose-100'
            }`}
          >
            <div className="flex items-center space-x-2">
              {absenceFeedback.type === 'success' ? (
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{absenceFeedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setAbsenceFeedback(null)}
              className="text-slate-400 hover:text-white text-xs px-2 py-0.5"
            >
              ✕
            </button>
          </div>
        )}

        {/* Declaration Form */}
        <form onSubmit={handleSubmitAbsence} className="space-y-4">
          
          {/* Row 1: Category & Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* Category Select */}
            <div>
              <label className="block text-[11px] font-medium text-slate-300 mb-1.5">
                申报类别 (Kategori)：
              </label>
              <select
                value={absenceCategory}
                onChange={(e) => handleCategoryChange(e.target.value as AbsenceCategoryType)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium cursor-pointer"
              >
                <optgroup label="公务外出 / Tugas Luar Rasmi (可提前申报)">
                  <option value="MESYUARAT">官方会议 (Mesyuarat Rasmi)</option>
                  <option value="PERTANDINGAN">带队比赛 (Membawa Pasukan Pertandingan)</option>
                  <option value="KURSUS">培训课程 (Kursus Latihan)</option>
                  <option value="URUSAN_RASMI">公务外出 (Urusan Rasmi)</option>
                  <option value="BENGKEL">工作坊/研讨 (Bengkel / Seminar)</option>
                  <option value="TAKLIMAT">官方简报会 (Taklimat Rasmi)</option>
                </optgroup>
                <optgroup label="个人假期 / Cuti Peribadi">
                  <option value="CUTI_SAKIT">病假 (Cuti Sakit / MC - 仅限当天)</option>
                  <option value="CRK">特别事假 (Cuti Rehat Khas)</option>
                  <option value="CUTI_BARAH">重病假 (Cuti Barah / Penyakit Berat)</option>
                  <option value="CUTI_BERSALIN">产假/陪产假 (Cuti Bersalin)</option>
                  <option value="CUTI_HAJI">朝觐假 (Cuti Haji / Umrah)</option>
                  <option value="CUTI_KUARANTIN">隔离假 (Cuti Kuarantin)</option>
                  <option value="CUTI_LAIN">其他批准假期 (Cuti Lain)</option>
                </optgroup>
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-[11px] font-medium text-slate-300 mb-1.5">
                开始日期 (Tarikh Mula)：
              </label>
              <input
                type="date"
                value={absenceStartDate}
                min={absenceCategory === 'CUTI_SAKIT' ? todayStr : undefined}
                max={absenceCategory === 'CUTI_SAKIT' ? todayStr : undefined}
                onChange={(e) => {
                  setAbsenceStartDate(e.target.value);
                  if (absenceCategory === 'CUTI_SAKIT' || !absenceEndDate || absenceEndDate < e.target.value) {
                    setAbsenceEndDate(e.target.value);
                  }
                }}
                disabled={absenceCategory === 'CUTI_SAKIT'}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono disabled:opacity-75 disabled:cursor-not-allowed"
              />
            </div>

            {/* End Date (Multi-Day Range) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-medium text-slate-300">
                  结束日期 (Tarikh Tamat)：
                </label>
                {absenceCategory !== 'CUTI_SAKIT' && absenceEndDate && absenceEndDate > absenceStartDate && (
                  <span className="text-[10px] text-indigo-400 font-medium">
                    共 {getDatesInRange(absenceStartDate, absenceEndDate).length} 天
                  </span>
                )}
              </div>
              <input
                type="date"
                value={absenceEndDate}
                min={absenceCategory === 'CUTI_SAKIT' ? todayStr : absenceStartDate}
                max={absenceCategory === 'CUTI_SAKIT' ? todayStr : undefined}
                onChange={(e) => setAbsenceEndDate(e.target.value)}
                disabled={absenceCategory === 'CUTI_SAKIT'}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono disabled:opacity-75 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Strict MC Validation Warning */}
          {absenceCategory === 'CUTI_SAKIT' && (
            <div className="p-3 bg-rose-950/60 border border-rose-800/60 rounded-xl flex items-center space-x-2.5 text-xs text-rose-200">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                <strong>病假填报合规守则：</strong> 根据学校考勤规程，病假 (MC) 仅限<strong>当天 ({todayStr})</strong> 录入，日期已被自动锁定。
              </span>
            </div>
          )}

          {/* Quick Select Tags */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
              <Tag className="w-3 h-3 text-indigo-400" />
              <span>常用快捷标签 (Klik Tag Pantas)：</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {[
                { label: '带队比赛 (Membawa Pasukan)', cat: 'PERTANDINGAN' as AbsenceCategoryType, text: '带队指导学生参加校外比赛 (Membawa Pasukan Pertandingan)' },
                { label: '出席县教育局会议 (Mesyuarat PPD)', cat: 'MESYUARAT' as AbsenceCategoryType, text: '出席县教育局官方会议 (Mesyuarat Rasmi PPD)' },
                { label: '参加课程 (Kursus KPM)', cat: 'KURSUS' as AbsenceCategoryType, text: '参加教育部/州教育厅培训课程 (Kursus Latihan KPM)' },
                { label: '公干外出 (Urusan Rasmi)', cat: 'URUSAN_RASMI' as AbsenceCategoryType, text: '公干外出处理官方校务 (Urusan Rasmi)' },
                { label: '诊所病假单 (MC Klinik)', cat: 'CUTI_SAKIT' as AbsenceCategoryType, text: '诊所病假单 (Sijil Cuti Sakit MC Klinik)' },
                { label: '特别事假 (CRK)', cat: 'CRK' as AbsenceCategoryType, text: '特别事假 (Cuti Rehat Khas)' },
                { label: '研讨工作坊 (Bengkel)', cat: 'BENGKEL' as AbsenceCategoryType, text: '参加教学研讨工作坊 (Bengkel / Seminar)' },
              ].map((tag, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => applyQuickTag(tag.cat, tag.text)}
                  className="px-2.5 py-1 rounded-lg text-[11px] bg-slate-950 hover:bg-indigo-950 text-slate-300 hover:text-indigo-200 border border-slate-800 hover:border-indigo-600/50 transition cursor-pointer select-none"
                >
                  + {tag.label}
                </button>
              ))}
            </div>
          </div>

          {/* Detailed Reason */}
          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1.5">
              详细事由说明 / 批假文号 (Sebab / Catatan / No. Rujukan)：
            </label>
            <input
              type="text"
              value={absenceReason}
              onChange={(e) => setAbsenceReason(e.target.value)}
              placeholder="例如：出席县教育局华小校长例会 / 附诊所病假单编号"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Submit Action */}
          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={isSubmittingAbsence}
              className={`py-2.5 px-5 rounded-xl font-bold text-xs flex items-center space-x-2 transition shadow-lg ${
                isSubmittingAbsence
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white shadow-indigo-900/30 cursor-pointer active:scale-95'
              }`}
            >
              {isSubmittingAbsence ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                  <span>正在提交登记...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>提交申报 (Hantar Permohonan)</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Self-Service Declarations List */}
        <div className="border-t border-slate-800/80 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <CalendarCheck className="w-3.5 h-3.5 text-indigo-400" />
              <span>我的申报记录 (Rekod Permohonan Saya)</span>
            </h4>
            <span className="text-[11px] text-slate-500">
              共 {myAbsenceRecords.length} 项记录
            </span>
          </div>

          {myAbsenceRecords.length === 0 ? (
            <div className="text-center py-6 bg-slate-950/40 border border-slate-800/60 rounded-2xl text-slate-500 text-xs">
              暂无已申报记录 (Tiada rekod permohonan lagi)
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 uppercase font-medium border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-3">日期 (Tarikh)</th>
                    <th className="py-2 px-3">类别 (Kategori)</th>
                    <th className="py-2 px-3">性质</th>
                    <th className="py-2 px-3">事由说明 (Sebab / Catatan)</th>
                    <th className="py-2 px-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 font-sans">
                  {myAbsenceRecords.map((rec) => {
                    const meta = ABSENCE_REASON_MAP[rec.category];
                    return (
                      <tr key={rec.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-2.5 px-3 font-mono font-medium text-slate-200 whitespace-nowrap">
                          {rec.date}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${meta?.color || 'bg-slate-800 text-slate-300 border-slate-700'}`}>
                            {meta?.labelZh || rec.category}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-[11px]">
                          {rec.isOfficialDuty ? (
                            <span className="text-indigo-400 font-medium">公务 (Rasmi)</span>
                          ) : (
                            <span className="text-amber-400 font-medium">个人假 (Cuti)</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-300 max-w-xs truncate" title={rec.reason}>
                          {rec.reason || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleDeleteMyAbsence(rec)}
                            disabled={deletingAbsenceId === rec.id}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                            title="撤销此项记录 (Batalkan rekod)"
                          >
                            {deletingAbsenceId === rec.id ? (
                              <div className="w-3.5 h-3.5 border-2 border-rose-400 border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Today's 2 Sessions Details Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
        <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-400" />
          <span>今日打卡明细 (Rekod Kehadiran Hari Ini)</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          
          {/* Slot 1 Box */}
          <div className={`p-4 rounded-2xl border ${
            slot1 
              ? slot1.status === 'COMPLETED' 
                ? 'bg-slate-950/90 border-emerald-600/40' 
                : 'bg-slate-950/90 border-blue-600/50 ring-1 ring-blue-500/20'
              : 'bg-slate-950/40 border-slate-800/80 text-slate-500'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-sm text-slate-200">第一轮 (Sesi 1)</span>
              {slot1 ? (
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                  slot1.status === 'COMPLETED'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-blue-500/20 text-blue-300 border border-blue-500/30 animate-pulse'
                }`}>
                  {slot1.status === 'COMPLETED' ? '已完成 Selesai' : '进行中 Bertugas'}
                </span>
              ) : (
                <span className="text-[11px] text-slate-500">未记录 Belum Rekod</span>
              )}
            </div>

            <div className="space-y-1.5 text-xs text-slate-300 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">Check In:</span>
                <span className="text-slate-200">{formatTimeFromTimestamp(slot1?.checkInTime)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Check Out:</span>
                <span className="text-slate-200">{formatTimeFromTimestamp(slot1?.checkOutTime)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-800 text-[11px]">
                <span className="text-slate-500">工作时长:</span>
                <span className="text-indigo-300">{calculateDuration(slot1?.checkInTime, slot1?.checkOutTime)}</span>
              </div>
            </div>
          </div>

          {/* Slot 2 Box */}
          <div className={`p-4 rounded-2xl border ${
            slot2 
              ? slot2.status === 'COMPLETED' 
                ? 'bg-slate-950/90 border-emerald-600/40' 
                : 'bg-slate-950/90 border-blue-600/50 ring-1 ring-blue-500/20'
              : 'bg-slate-950/40 border-slate-800/80 text-slate-500'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-sm text-slate-200">第二轮 (Sesi 2)</span>
              {slot2 ? (
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                  slot2.status === 'COMPLETED'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-blue-500/20 text-blue-300 border border-blue-500/30 animate-pulse'
                }`}>
                  {slot2.status === 'COMPLETED' ? '已完成 Selesai' : '进行中 Bertugas'}
                </span>
              ) : (
                <span className="text-[11px] text-slate-500">未记录 (可选)</span>
              )}
            </div>

            <div className="space-y-1.5 text-xs text-slate-300 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">Check In:</span>
                <span className="text-slate-200">{formatTimeFromTimestamp(slot2?.checkInTime)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Check Out:</span>
                <span className="text-slate-200">{formatTimeFromTimestamp(slot2?.checkOutTime)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-800 text-[11px]">
                <span className="text-slate-500">工作时长:</span>
                <span className="text-indigo-300">{calculateDuration(slot2?.checkInTime, slot2?.checkOutTime)}</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Staff Personal Attendance History (员工只能查询自己的记录) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <History className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-slate-200">
              个人出勤历史记录 (Rekod Kehadiran Sendiri)
            </h3>
          </div>
          <span className="text-xs text-slate-500">只显示本人出勤记录</span>
        </div>

        {historyRecords.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-xs">
            暂无历史打卡记录 (Tiada rekod kehadiran lagi)
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase font-medium border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">日期 (Tarikh)</th>
                  <th className="py-2.5 px-3">轮次 (Sesi)</th>
                  <th className="py-2.5 px-3">Check In</th>
                  <th className="py-2.5 px-3">Check Out</th>
                  <th className="py-2.5 px-3">在校时长</th>
                  <th className="py-2.5 px-3">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {historyRecords.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-2.5 px-3 font-medium text-slate-200">{item.date}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px]">
                        Sesi {item.slot}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-emerald-400">
                      {formatTimeFromTimestamp(item.checkInTime)}
                    </td>
                    <td className="py-2.5 px-3 text-amber-400">
                      {formatTimeFromTimestamp(item.checkOutTime)}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-300">
                      {calculateDuration(item.checkInTime, item.checkOutTime)}
                    </td>
                    <td className="py-2.5 px-3 font-sans">
                      {item.status === 'COMPLETED' ? (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <Check className="w-3 h-3" /> 已完成
                        </span>
                      ) : (
                        <span className="text-blue-400">进行中</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Early Checkout Reason Modal */}
      <EarlyCheckoutModal
        isOpen={showEarlyCheckoutModal}
        ruleDescription={earlyRuleDescription}
        category={currentUser.category || 'GURU'}
        slot={currentTargetSlot}
        isProcessing={isProcessing}
        onConfirm={(reason) => {
          setShowEarlyCheckoutModal(false);
          handleCheckOut(reason);
        }}
        onClose={() => setShowEarlyCheckoutModal(false)}
      />

    </div>
  );
};
