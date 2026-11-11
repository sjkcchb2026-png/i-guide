import React, { useState, useEffect, useMemo } from 'react';
import { UserProfile, SchoolSettings, AttendanceRecord, AttendanceGeo, StaffCategory, SchoolCalendarDay, StaffAbsenceRecord } from '../types';
import { auth, db } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot 
} from 'firebase/firestore';
import { getTodayDateString, formatTimeFromTimestamp, calculateDuration } from '../utils/date';
import { calculateDailyWorkTime } from '../utils/checkoutRules';
import { formatCoordinates, getGoogleMapsUrl } from '../utils/geo';
import { BatchAccountModal } from './BatchAccountModal';
import { PrintReportView } from './PrintReportView';
import { MonthlyAnalysisView } from './MonthlyAnalysisView';
import { StaffRoleCell } from './Dashboard/StaffRoleCell';
import { 
  Users, 
  UserPlus, 
  Calendar, 
  Search, 
  Printer, 
  Settings, 
  MapPin, 
  ExternalLink, 
  ShieldCheck, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Trash2, 
  Copy,
  School,
  X,
  BarChart3,
  RefreshCw
} from 'lucide-react';

interface PrincipalDashboardProps {
  currentUser: UserProfile;
  schoolSettings: SchoolSettings | null;
  onUpdateSchoolSettings: (updated: SchoolSettings) => void;
}

export const PrincipalDashboard: React.FC<PrincipalDashboardProps> = ({
  currentUser,
  schoolSettings,
  onUpdateSchoolSettings,
}) => {
  const [activeTab, setActiveTab] = useState<'attendance' | 'analysis' | 'staff' | 'settings'>('attendance');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());
  
  // Data lists
  const [staffList, setStaffList] = useState<UserProfile[]>([]);
  const [allAttendanceRecords, setAllAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [calendarDays, setCalendarDays] = useState<SchoolCalendarDay[]>([]);
  const [absenceRecords, setAbsenceRecords] = useState<StaffAbsenceRecord[]>([]);
  const [unavailabilityList, setUnavailabilityList] = useState<any[]>([]);
  const [attendanceGeoMap, setAttendanceGeoMap] = useState<Map<string, AttendanceGeo>>(new Map());
  const [loadingStaff, setLoadingStaff] = useState<boolean>(true);

  // Filter attendance records for current selected date
  const attendanceRecords = useMemo(() => {
    return allAttendanceRecords.filter((r) => r.date === selectedDate);
  }, [allAttendanceRecords, selectedDate]);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'GURU' | 'AKP'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN' | 'COMPLETED' | 'ABSENT'>('ALL');

  // Modals state
  const [showBatchModal, setShowBatchModal] = useState<boolean>(false);
  const [showPrintView, setShowPrintView] = useState<boolean>(false);
  const [showSingleUserModal, setShowSingleUserModal] = useState<boolean>(false);
  const [temporaryCreatedAccount, setTemporaryCreatedAccount] = useState<{ name: string; email: string; password: string } | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Single User Form state
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('12345678');
  const [newHasClerk, setNewHasClerk] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [syncingPersonnel, setSyncingPersonnel] = useState(false);

  // School Settings form
  const [editingSchoolName, setEditingSchoolName] = useState(schoolSettings?.schoolName || '');
  const [editingSchoolCode, setEditingSchoolCode] = useState(schoolSettings?.schoolCode || '');
  const [savingSettings, setSavingSettings] = useState(false);

  // 1. Subscribe to Staff List (/users)
  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const users: UserProfile[] = [];
        snapshot.forEach((d) => {
          users.push(d.data() as UserProfile);
        });
        users.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
        setStaffList(users);
        setLoadingStaff(false);
      },
      (error) => {
        console.error('Error fetching staff list:', error);
        setLoadingStaff(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // 2. Subscribe to All Attendance Records (Used for both daily attendance & monthly analysis)
  useEffect(() => {
    const q = query(collection(db, 'attendance'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: AttendanceRecord[] = [];
        snapshot.forEach((d) => {
          list.push(d.data() as AttendanceRecord);
        });
        setAllAttendanceRecords(list);
      },
      (error) => {
        console.error('Error fetching attendance:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // 3. Subscribe to School Calendar Days
  useEffect(() => {
    const q = query(collection(db, 'school_calendar'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: SchoolCalendarDay[] = [];
        snapshot.forEach((d) => {
          list.push(d.data() as SchoolCalendarDay);
        });
        setCalendarDays(list);
      },
      (error) => {
        console.warn('Calendar query notice:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // 4. Subscribe to Absence & Leave Records
  useEffect(() => {
    const q = query(collection(db, 'absence_records'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: StaffAbsenceRecord[] = [];
        snapshot.forEach((d) => {
          list.push(d.data() as StaffAbsenceRecord);
        });
        setAbsenceRecords(list);
      },
      (error) => {
        console.warn('Absence records query notice:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // 5. Subscribe to Staff Unavailability from Surat Masuk (Kursus / Urusan Rasmi)
  useEffect(() => {
    const qUnavail = query(collection(db, 'staff_unavailability'));
    const unsub = onSnapshot(
      qUnavail,
      (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() });
        });
        setUnavailabilityList(list);
      },
      (error) => {
        console.warn('Staff unavailability subscription notice:', error);
      }
    );
    return () => unsub();
  }, []);

  // 3. Subscribe to Isolated AttendanceGeo Records (Readable only by Principal)
  useEffect(() => {
    if (!selectedDate) return;
    const qGeo = query(
      collection(db, 'attendance_geo'),
      where('date', '==', selectedDate)
    );

    const unsubscribe = onSnapshot(
      qGeo,
      (snapshot) => {
        const gMap = new Map<string, AttendanceGeo>();
        snapshot.forEach((d) => {
          gMap.set(d.id, d.data() as AttendanceGeo);
        });
        setAttendanceGeoMap(gMap);
      },
      (error) => {
        console.warn('Geo records query notice:', error);
      }
    );

    return () => unsubscribe();
  }, [selectedDate]);

  // Group attendance records by userId
  const attendanceMap = new Map<string, AttendanceRecord[]>();
  attendanceRecords.forEach((rec) => {
    const arr = attendanceMap.get(rec.userId) || [];
    arr.push(rec);
    attendanceMap.set(rec.userId, arr);
  });

  // Calculate stats - including all school personnel (Principal / Guru Besar, Guru, AKP)
  const totalGuru = staffList.filter((s) => s.category === 'GURU' || s.role === 'PRINCIPAL').length;
  const totalAkp = staffList.filter((s) => s.category === 'AKP').length;
  const totalStaffCount = staffList.length;

  let presentCount = 0;
  let inSessionCount = 0;
  let completedCount = 0;

  staffList.forEach((staff) => {
    const records = attendanceMap.get(staff.uid) || [];
    const slot1 = records.find((r) => r.slot === 1);
    const slot2 = records.find((r) => r.slot === 2);
    if (slot1) {
      presentCount++;
      const currentActive = (slot2 && slot2.status === 'IN') || (slot1 && slot1.status === 'IN');
      if (currentActive) {
        inSessionCount++;
      } else {
        completedCount++;
      }
    }
  });

  const presentPercent = totalStaffCount > 0 ? ((presentCount / totalStaffCount) * 100).toFixed(0) : '0';

  const getAutoCategory = (email: string): StaffCategory => {
    return email.trim().toLowerCase().endsWith('@moe-dl.edu.my') ? 'GURU' : 'AKP';
  };

  // Single Staff Creation via Trusted Server Endpoint (No initialPassword stored in Firestore)
  const handleCreateSingleStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionFeedback(null);

    const cleanEmail = newEmail.trim().toLowerCase();
    if (!newName.trim() || !cleanEmail) {
      setActionFeedback({ type: 'error', message: '请完整填写员工姓名与邮箱。' });
      return;
    }
    if (newPassword.length < 6) {
      setActionFeedback({ type: 'error', message: '密码最少需 6 位字符。' });
      return;
    }

    try {
      setCreatingUser(true);
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('未检测到有效的管理员会话，请重新登录。');

      const res = await fetch('/api/staff/create-single', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          name: newName.trim(),
          email: cleanEmail,
          password: newPassword,
          hasClerkAccess: newHasClerk,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '开通账号失败');
      }

      // Display in temporary card for principal to distribute immediately
      setTemporaryCreatedAccount({
        name: newName.trim(),
        email: cleanEmail,
        password: newPassword,
      });

      setActionFeedback({
        type: 'success',
        message: `成功建立员工账号：${newName}！初始密码已生成，并未储存在云端，请立即复制分发。`,
      });

      setNewName('');
      setNewEmail('');
      setNewPassword('12345678');
      setNewHasClerk(false);
      setShowSingleUserModal(false);
    } catch (err: any) {
      console.error('Failed to create staff account:', err);
      setActionFeedback({ type: 'error', message: err.message || '开通失败' });
    } finally {
      setCreatingUser(false);
    }
  };

  // Toggle user active status
  const handleToggleUserActive = async (user: UserProfile) => {
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('未检测到管理员凭证');
      const res = await fetch('/api/staff/update-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          targetUid: user.uid,
          active: !user.active,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '更新失败');

      setActionFeedback({
        type: 'success',
        message: `已${user.active ? '停用' : '启用'}员工账号：${user.name}`,
      });
    } catch (err: any) {
      console.error('Failed to update user status:', err);
      setActionFeedback({ type: 'error', message: `更新员工状态失败: ${err.message}` });
    }
  };

  // Toggle Clerk authority
  const handleToggleClerkAccess = async (user: UserProfile) => {
    try {
      const nextAccess = !user.hasClerkAccess;
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('未检测到管理员凭证');
      const res = await fetch('/api/staff/update-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          targetUid: user.uid,
          hasClerkAccess: nextAccess,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '授权失败');

      setActionFeedback({
        type: 'success',
        message: `已${nextAccess ? '授予' : '收回'} ${user.name} 的书记假期管理权限。`,
      });
    } catch (err: any) {
      console.error('Failed to update clerk access:', err);
      setActionFeedback({ type: 'error', message: `授权操作失败: ${err.message}` });
    }
  };

  // Delete staff profile
  const handleDeleteStaff = async (user: UserProfile) => {
    if (!window.confirm(`确定要从系统中移除员工档案 “${user.name} (${user.email})” 吗？`)) {
      return;
    }
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('未检测到管理员凭证');
      const res = await fetch('/api/staff/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ targetUid: user.uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '删除失败');

      setActionFeedback({ type: 'success', message: `已移除员工档案：${user.name}` });
    } catch (err: any) {
      console.error('Failed to delete staff:', err);
      setActionFeedback({ type: 'error', message: `删除失败: ${err.message}` });
    }
  };

  // Sync Personnel to Attendance Users from Master Data
  const handleSyncPersonnelToUsers = async () => {
    setSyncingPersonnel(true);
    setActionFeedback(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('未检测到管理员凭证');
      const res = await fetch('/api/admin/sync-personnel-to-users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Penyelarasan gagal');
      setActionFeedback({
        type: 'success',
        message: data.message || `Berjaya menyelaraskan ${data.syncedCount || 0} rekod personel ke Kehadiran Staf.`,
      });
    } catch (err: any) {
      console.error('Failed to sync personnel to users:', err);
      setActionFeedback({ type: 'error', message: `Penyelarasan gagal: ${err.message}` });
    } finally {
      setSyncingPersonnel(false);
    }
  };

  // Save School Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchoolName.trim()) return;

    try {
      setSavingSettings(true);
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('未检测到管理员凭证');
      const res = await fetch('/api/school-settings/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          schoolName: editingSchoolName.trim(),
          schoolCode: editingSchoolCode.trim().toUpperCase(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存学校设定失败');

      onUpdateSchoolSettings({
        schoolName: editingSchoolName.trim(),
        schoolCode: editingSchoolCode.trim().toUpperCase(),
        principalEmail: currentUser.email,
        principalUid: currentUser.uid,
      });

      setActionFeedback({ type: 'success', message: '学校信息与报表抬头已成功更新！' });
    } catch (err: any) {
      console.error('Failed to update school settings:', err);
      setActionFeedback({ type: 'error', message: `保存学校设定失败: ${err.message}` });
    } finally {
      setSavingSettings(false);
    }
  };

  // Filtered staff list for table - includes all staff and principal
  const filteredStaff = staffList.filter((staff) => {
    if (categoryFilter === 'GURU' && staff.category !== 'GURU' && staff.role !== 'PRINCIPAL') {
      return false;
    }
    if (categoryFilter === 'AKP' && staff.category !== 'AKP') {
      return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = staff.name.toLowerCase().includes(q);
      const matchEmail = staff.email.toLowerCase().includes(q);
      if (!matchName && !matchEmail) return false;
    }

    if (statusFilter !== 'ALL') {
      const records = attendanceMap.get(staff.uid) || [];
      const slot1 = records.find((r) => r.slot === 1);
      const slot2 = records.find((r) => r.slot === 2);
      const isPresent = !!slot1;
      const isIn = (slot2 && slot2.status === 'IN') || (slot1 && slot1.status === 'IN');
      const isCompleted = slot1 && !isIn;

      if (statusFilter === 'IN' && !isIn) return false;
      if (statusFilter === 'COMPLETED' && !isCompleted) return false;
      if (statusFilter === 'ABSENT' && isPresent) return false;
    }

    return true;
  }).sort((a, b) => {
    if (a.role === 'PRINCIPAL' && b.role !== 'PRINCIPAL') return -1;
    if (b.role === 'PRINCIPAL' && a.role !== 'PRINCIPAL') return 1;
    return a.name.localeCompare(b.name, 'zh');
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              校长管理控制台 / Konsol Guru Besar
            </span>
            <span className="text-xs text-slate-400">电脑与管理专用端</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white mt-1">
            {schoolSettings?.schoolName || 'Sistem Kehadiran Sekolah'}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            全校出勤监控、独立受保护 GPS 经纬度核验、后端鉴权开号与正式报表打印
          </p>
        </div>

        {/* Quick Tabs Navigation */}
        <div className="flex flex-wrap items-center bg-slate-950 p-1.5 rounded-2xl border border-slate-800 text-xs font-medium self-start md:self-auto gap-1">
          <button
            onClick={() => setActiveTab('attendance')}
            className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-xl transition ${
              activeTab === 'attendance'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>全校出勤监控</span>
          </button>
          <button
            onClick={() => setActiveTab('analysis')}
            className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-xl transition ${
              activeTab === 'analysis'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>月度出勤分析 (Analisis)</span>
          </button>
          <button
            onClick={() => setActiveTab('staff')}
            className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-xl transition ${
              activeTab === 'staff'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>员工账号管理</span>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-xl transition ${
              activeTab === 'settings'
                ? 'bg-slate-800 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>学校设定</span>
          </button>
        </div>
      </div>

      {/* Action Notification Alert */}
      {actionFeedback && (
        <div
          className={`p-3.5 rounded-2xl border text-xs sm:text-sm flex items-center justify-between shadow-lg ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
              : 'bg-rose-950/80 border-rose-700 text-rose-200'
          }`}
        >
          <div className="flex items-center space-x-2">
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{actionFeedback.message}</span>
          </div>
          <button
            onClick={() => setActionFeedback(null)}
            className="text-xs opacity-60 hover:opacity-100 ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Temporary Password Credential Banner (Shown right after creation, NOT stored in Firestore) */}
      {temporaryCreatedAccount && (
        <div className="p-4 bg-indigo-950/70 border border-indigo-700/60 rounded-2xl text-xs sm:text-sm text-indigo-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-lg">
          <div className="space-y-1">
            <div className="font-semibold text-white flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              <span>新员工账号已生成 (密码未储存在数据库，仅在此临时提供复制)</span>
            </div>
            <div className="font-mono text-xs text-indigo-200">
              姓名: <span className="text-white font-bold">{temporaryCreatedAccount.name}</span> | 
              账号: <span className="text-white font-bold">{temporaryCreatedAccount.email}</span> | 
              初始密码: <span className="text-amber-300 font-bold bg-indigo-900/80 px-1.5 py-0.5 rounded">{temporaryCreatedAccount.password}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  `姓名: ${temporaryCreatedAccount.name}\n登录账号: ${temporaryCreatedAccount.email}\n系统初始密码: ${temporaryCreatedAccount.password}\n请及时登录本校出勤系统并妥善保管密码。`
                );
                alert('已复制该员工的登录凭据！');
              }}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium flex items-center gap-1 shadow"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>复制凭证条</span>
            </button>
            <button
              onClick={() => setTemporaryCreatedAccount(null)}
              className="p-1.5 text-indigo-300 hover:text-white rounded-lg hover:bg-indigo-900"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ================= TAB 1: ATTENDANCE MONITORING ================= */}
      {activeTab === 'attendance' && (
        <div className="space-y-6">
          
          {/* Key Metrics Overview */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow">
              <span className="text-xs text-slate-400 block mb-1">全校教职员总数</span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-white font-mono">{totalStaffCount}</span>
                <span className="text-[11px] text-slate-400">
                  教师 {totalGuru} | AKP {totalAkp}
                </span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow">
              <span className="text-xs text-slate-400 block mb-1">今日到校打卡人数</span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-emerald-400 font-mono">{presentCount}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold font-mono">
                  {presentPercent}% 到校
                </span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow">
              <span className="text-xs text-slate-400 block mb-1">目前在校执勤 (Bertugas)</span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-blue-400 font-mono">{inSessionCount}</span>
                <span className="text-xs text-blue-300 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                  正在校
                </span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow">
              <span className="text-xs text-slate-400 block mb-1">已打卡离校 (Telah Keluar)</span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-slate-300 font-mono">{completedCount}</span>
                <span className="text-xs text-slate-500">今日已完成</span>
              </div>
            </div>

          </div>

          {/* Filter Bar & Print Action */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            
            <div className="flex flex-wrap items-center gap-2">
              
              <div className="flex items-center space-x-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent text-white text-xs font-mono focus:outline-none"
                />
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="搜索员工姓名或 DELIMa..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-44 sm:w-56"
                />
              </div>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none"
              >
                <option value="ALL">全部职位 (Semua)</option>
                <option value="GURU">教师 (GURU)</option>
                <option value="AKP">实行组职员 (AKP)</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none"
              >
                <option value="ALL">全部考勤状态</option>
                <option value="IN">仅在校中 (Bertugas)</option>
                <option value="COMPLETED">仅已退卡离校 (Selesai)</option>
                <option value="ABSENT">今日未打卡 (Belum Masuk)</option>
              </select>

            </div>

            <button
              onClick={() => setShowPrintView(true)}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition shadow shadow-blue-900/30 shrink-0"
            >
              <Printer className="w-4 h-4" />
              <span>打印出勤报告 (Cetak Laporan)</span>
            </button>

          </div>

          {/* Attendance Table with Isolated GPS verification for Principal */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  全校教职员考勤与受保护 GPS 经纬度 ({selectedDate})
                </h3>
                <p className="text-[11px] text-slate-400">
                  校长专用特权：从受保护的独立资料库查看 GPS 经纬度、定位精度（米）及在 Google Maps 上查看实地定位
                </p>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                符合条件: {filteredStaff.length} 位
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 uppercase font-medium border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">教职员姓名</th>
                    <th className="py-3 px-3">类别</th>
                    <th className="py-3 px-4">第一轮 (Sesi 1)</th>
                    <th className="py-3 px-4">第二轮 (Sesi 2)</th>
                    <th className="py-3 px-3">总在校时长</th>
                    <th className="py-3 px-4 text-center">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  {filteredStaff.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 font-sans text-xs">
                        没有符合筛选条件的教职员记录
                      </td>
                    </tr>
                  ) : (
                    filteredStaff.map((staff) => {
                      const records = attendanceMap.get(staff.uid) || [];
                      const slot1 = records.find((r) => r.slot === 1);
                      const slot2 = records.find((r) => r.slot === 2);
                      const isPresent = !!slot1;
                      const isCurrentlyIn = (slot2 && slot2.status === 'IN') || (slot1 && slot1.status === 'IN');

                      // Look up isolated GPS coordinates
                      const slot1Geo = slot1 ? attendanceGeoMap.get(slot1.id) : undefined;
                      const slot2Geo = slot2 ? attendanceGeoMap.get(slot2.id) : undefined;

                      // Look up unavailability (Kursus / Urusan Rasmi from Surat Masuk)
                      const unavail = unavailabilityList.find((u) => {
                        const matchStaff =
                          u.teacherId === staff.uid ||
                          (staff.email && u.teacherId === staff.email) ||
                          (staff.name && u.teacherId === staff.name);
                        const matchDate =
                          u.startDate &&
                          u.endDate &&
                          u.startDate <= selectedDate &&
                          selectedDate <= u.endDate;
                        return matchStaff && matchDate && u.status !== 'CANCELLED';
                      });

                      return (
                        <tr key={staff.uid} className="hover:bg-slate-800/50 transition">
                          
                          {/* Staff Name & Email */}
                          <td className="py-3 px-4 font-sans">
                            <div className="font-semibold text-white text-sm">{staff.name}</div>
                            <div className="text-[11px] text-slate-400 font-mono">{staff.email}</div>
                          </td>

                          {/* Category Badge */}
                          <td className="py-3 px-3 font-sans">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              staff.role === 'PRINCIPAL'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : staff.category === 'GURU'
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            }`}>
                              {staff.role === 'PRINCIPAL' ? 'GURU BESAR' : staff.category}
                            </span>
                          </td>

                          {/* Sesi 1 Details with GPS from isolated attendance_geo */}
                          <td className="py-3 px-4">
                            {slot1 ? (
                              <div className="space-y-1 text-[11px]">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-emerald-400 font-medium">In:</span>
                                  <span>{formatTimeFromTimestamp(slot1.checkInTime)}</span>
                                  {slot1Geo && typeof slot1Geo.checkInLat === 'number' && typeof slot1Geo.checkInLng === 'number' && (
                                    <a
                                      href={getGoogleMapsUrl(slot1Geo.checkInLat, slot1Geo.checkInLng)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center text-[10px] text-indigo-400 hover:text-indigo-300 bg-indigo-950/60 px-1.5 py-0.2 rounded border border-indigo-800/40 ml-1"
                                      title={`GPS: ${formatCoordinates(slot1Geo.checkInLat, slot1Geo.checkInLng, slot1Geo.checkInAccuracy)}`}
                                    >
                                      <MapPin className="w-2.5 h-2.5 mr-0.5" />
                                      <span>±{slot1Geo.checkInAccuracy}m</span>
                                      <ExternalLink className="w-2 h-2 ml-0.5 opacity-70" />
                                    </a>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-amber-400 font-medium">Out:</span>
                                  <span>{formatTimeFromTimestamp(slot1.checkOutTime)}</span>
                                  {slot1Geo && typeof slot1Geo.checkOutLat === 'number' && typeof slot1Geo.checkOutLng === 'number' && (
                                    <a
                                      href={getGoogleMapsUrl(slot1Geo.checkOutLat, slot1Geo.checkOutLng)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center text-[10px] text-indigo-400 hover:text-indigo-300 bg-indigo-950/60 px-1.5 py-0.2 rounded border border-indigo-800/40 ml-1"
                                      title={`GPS: ${formatCoordinates(slot1Geo.checkOutLat, slot1Geo.checkOutLng, slot1Geo.checkOutAccuracy)}`}
                                    >
                                      <MapPin className="w-2.5 h-2.5 mr-0.5" />
                                      <span>±{slot1Geo.checkOutAccuracy}m</span>
                                      <ExternalLink className="w-2 h-2 ml-0.5 opacity-70" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-600 text-xs">-</span>
                            )}
                          </td>

                          {/* Sesi 2 Details with GPS */}
                          <td className="py-3 px-4">
                            {slot2 ? (
                              <div className="space-y-1 text-[11px]">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-emerald-400 font-medium">In:</span>
                                  <span>{formatTimeFromTimestamp(slot2.checkInTime)}</span>
                                  {slot2Geo && typeof slot2Geo.checkInLat === 'number' && typeof slot2Geo.checkInLng === 'number' && (
                                    <a
                                      href={getGoogleMapsUrl(slot2Geo.checkInLat, slot2Geo.checkInLng)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center text-[10px] text-indigo-400 hover:text-indigo-300 bg-indigo-950/60 px-1.5 py-0.2 rounded border border-indigo-800/40 ml-1"
                                      title={`GPS: ${formatCoordinates(slot2Geo.checkInLat, slot2Geo.checkInLng, slot2Geo.checkInAccuracy)}`}
                                    >
                                      <MapPin className="w-2.5 h-2.5 mr-0.5" />
                                      <span>±{slot2Geo.checkInAccuracy}m</span>
                                      <ExternalLink className="w-2 h-2 ml-0.5 opacity-70" />
                                    </a>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-amber-400 font-medium">Out:</span>
                                  <span>{formatTimeFromTimestamp(slot2.checkOutTime)}</span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-600 text-xs">-</span>
                            )}
                          </td>

                          {/* Total Duration */}
                          <td className="py-3 px-3 font-sans text-xs text-slate-300">
                            {slot1 ? (
                              <div>
                                <span className={calculateDailyWorkTime(staff.category || 'GURU', slot1, slot2).isShortHours ? 'text-amber-400 font-semibold' : ''}>
                                  {calculateDailyWorkTime(staff.category || 'GURU', slot1, slot2).displayText}
                                </span>
                                {(slot1.earlyCheckOutReason || slot2?.earlyCheckOutReason) && (
                                  <div className="text-[10px] text-amber-300 font-normal mt-0.5 max-w-[150px] truncate" title={`理由: ${slot1.earlyCheckOutReason || ''} ${slot2?.earlyCheckOutReason || ''}`}>
                                    理由: {slot1.earlyCheckOutReason || slot2?.earlyCheckOutReason}
                                  </div>
                                )}
                              </div>
                            ) : '-'}
                          </td>

                          {/* Attendance Status */}
                          <td className="py-3 px-4 text-center font-sans">
                            {isCurrentlyIn ? (
                              <span className="px-2 py-1 rounded-full text-[11px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                                在校执勤
                              </span>
                            ) : isPresent ? (
                              <span className="px-2 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                今日已完成
                              </span>
                            ) : unavail ? (
                              <span
                                className="px-2 py-1 rounded-full text-[10px] font-extrabold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 inline-flex items-center gap-1"
                                title={`Tugasan Luar: ${unavail.reasonText || ''}`}
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                                <span>Tidak Hadir Bersebab ({unavail.reasonCode === 'KURSUS' ? 'Kursus' : 'Urusan Rasmi'})</span>
                              </span>
                            ) : (
                              <span className="px-2 py-1 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-500">
                                未到校打卡
                              </span>
                            )}
                          </td>

                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB: MONTHLY ANALYSIS (ANALISIS KEHADIRAN) ================= */}
      {activeTab === 'analysis' && (
        <MonthlyAnalysisView
          currentUser={currentUser}
          schoolSettings={schoolSettings}
          staffList={staffList}
          attendanceRecords={allAttendanceRecords}
          customCalendarDays={calendarDays}
          absenceRecords={absenceRecords}
        />
      )}

      {/* ================= TAB 2: STAFF MANAGEMENT ================= */}
      {activeTab === 'staff' && (
        <div className="space-y-6">
          
          {/* Top Actions & Info */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white">员工独立账号管理 (Pengurusan Akaun Staf)</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xl">
                依照规定：只有校长可建立账号，支持单笔与批量建立。经由后端验证开通，禁止公开注册，密码不储存在数据库中。
              </p>
            </div>
            
            <div className="flex items-center space-x-2 shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSyncPersonnelToUsers}
                disabled={syncingPersonnel}
                className="px-3.5 py-2 bg-indigo-600/90 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 transition shadow shadow-indigo-950/40 cursor-pointer"
                title="Selaraskan data guru & AKP terkini dari Master Personnel ke senarai staf kehadiran"
              >
                <RefreshCw className={`w-4 h-4 ${syncingPersonnel ? 'animate-spin' : ''}`} />
                <span>{syncingPersonnel ? 'Menyelaras...' : 'Selaras dari Master Data'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowSingleUserModal(true)}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 transition border border-slate-700 cursor-pointer"
              >
                <UserPlus className="w-4 h-4 text-blue-400" />
                <span>新增单笔员工</span>
              </button>
              
              <button
                type="button"
                onClick={() => setShowBatchModal(true)}
                className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 transition shadow shadow-indigo-900/30 cursor-pointer"
              >
                <Users className="w-4 h-4" />
                <span>批量建立账号 (Pukal)</span>
              </button>
            </div>
          </div>

          {/* Staff Accounts Table (Without initialPassword column) */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">
                目前全校共开通 {staffList.length} 个账号（含校长）
              </span>
              <div className="text-[11px] text-slate-400 flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-400"></span> GURU (以 @moe-dl.edu.my 结尾)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span> AKP (其他邮箱)
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 uppercase font-medium border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">姓名 (Nama)</th>
                    <th className="py-3 px-4">登录账号 (Email DELIMa)</th>
                    <th className="py-3 px-3">自动分类</th>
                    <th className="py-3 px-3">书记假期权限</th>
                    <th className="py-3 px-3 text-center">账号状态</th>
                    <th className="py-3 px-4 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  {staffList.map((staff) => (
                    <tr key={staff.uid} className="hover:bg-slate-800/40 transition">
                      
                      {/* Name */}
                      <td className="py-3 px-4 font-sans">
                        <div className="font-semibold text-white">{staff.name}</div>
                        {staff.role === 'PRINCIPAL' && (
                          <span className="text-[10px] text-amber-400 font-mono">校方最高管理员</span>
                        )}
                      </td>

                      {/* Email */}
                      <td className="py-3 px-4 text-slate-300">{staff.email}</td>

                      {/* Category */}
                      <td className="py-3 px-3 font-sans">
                        {staff.role === 'PRINCIPAL' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            GURU BESAR
                          </span>
                        ) : (
                          <StaffRoleCell
                            userId={staff.uid}
                            currentCategory={staff.category || 'GURU'}
                            currentSubRole={(staff as any).subRole || (staff as any).primaryRoleCode}
                            currentRole={staff.category || 'GURU'}
                            userEmail={staff.email || ''}
                            onUpdated={(newCat, newSub) => {
                              setStaffList((prev) =>
                                prev.map((s) => (s.uid === staff.uid ? { ...s, category: newCat, subRole: newSub } : s))
                              );
                            }}
                            onRoleUpdated={(newRole) => {
                              setStaffList((prev) =>
                                prev.map((s) => (s.uid === staff.uid ? { ...s, category: newRole } : s))
                              );
                            }}
                          />
                        )}
                      </td>

                      {/* Clerk Holiday Auth */}
                      <td className="py-3 px-3 font-sans">
                        {staff.role === 'PRINCIPAL' ? (
                          <span className="text-slate-500 text-[11px]">-</span>
                        ) : staff.hasClerkAccess ? (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold">
                            已授权书记权限
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px]">普通职员</span>
                        )}
                      </td>

                      {/* Active Status */}
                      <td className="py-3 px-3 text-center font-sans">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          staff.active
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-rose-500/10 text-rose-400'
                        }`}>
                          {staff.active ? '正常启用' : '已停用'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right font-sans">
                        {staff.role !== 'PRINCIPAL' && (
                          <div className="flex items-center justify-end space-x-2">
                            {/* Toggle Clerk Auth */}
                            <button
                              onClick={() => handleToggleClerkAccess(staff)}
                              className={`p-1.5 rounded-lg text-xs transition ${
                                staff.hasClerkAccess
                                  ? 'bg-purple-950 text-purple-300 border border-purple-800'
                                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
                              }`}
                              title={staff.hasClerkAccess ? '收回书记假期权限' : '授权书记假期权限'}
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                            </button>

                            {/* Toggle Active */}
                            <button
                              onClick={() => handleToggleUserActive(staff)}
                              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] transition"
                            >
                              {staff.active ? '停用' : '启用'}
                            </button>

                            {/* Delete User Doc */}
                            <button
                              onClick={() => handleDeleteStaff(staff)}
                              className="p-1.5 text-slate-500 hover:text-rose-400 rounded hover:bg-slate-800 transition"
                              title="删除档案"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ================= TAB 3: SCHOOL SETTINGS ================= */}
      {activeTab === 'settings' && (
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl">
            
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <School className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">学校信息与报表抬头设定</h3>
                <p className="text-xs text-slate-400">
                  保存后的学校名称将即时同步用于打卡系统页面、全校出勤记录及正式打印报表抬头
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  学校官方名称 (Nama Rasmi Sekolah) *
                </label>
                <input
                  type="text"
                  value={editingSchoolName}
                  onChange={(e) => setEditingSchoolName(e.target.value)}
                  placeholder="例如：国民型华文小学 / Sekolah Jenis Kebangsaan"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  学校编号 (Kod Sekolah)
                </label>
                <input
                  type="text"
                  value={editingSchoolCode}
                  onChange={(e) => setEditingSchoolCode(e.target.value)}
                  placeholder="例: JBC1001"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase"
                />
              </div>

              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-1">
                <div>
                  <span className="text-slate-500">校长管理员账号:</span>
                  <span className="text-slate-300 ml-2 font-mono">{currentUser.email}</span>
                </div>
                <div>
                  <span className="text-slate-500">权限级别:</span>
                  <span className="text-amber-400 ml-2 font-medium">校长 / Guru Besar (全校最高权限)</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={savingSettings}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition shadow-lg shadow-blue-900/30 flex items-center justify-center space-x-2"
              >
                {savingSettings ? (
                  <span>正在保存...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>保存学校设定 / Simpan Tetapan</span>
                  </>
                )}
              </button>
            </form>

          </div>
        </div>
      )}

      {/* Single Staff Creation Modal (No initialPassword in Firestore) */}
      {showSingleUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 text-slate-100 shadow-2xl relative">
            <h3 className="text-lg font-bold text-white mb-1">新增单笔员工 (Daftar Staf)</h3>
            <p className="text-xs text-slate-400 mb-4">
              经由受保护后台开通账号，开通后初始密码将临时显示供您复制分发
            </p>

            <form onSubmit={handleCreateSingleStaff} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  员工全名 (Nama Penuh) *
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="例: 李明志 / Ahmad bin Ali"
                  required
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center justify-between">
                  <span>DELIMa / 登录邮箱 (Emel) *</span>
                  <span className="text-[11px] text-blue-400 font-normal">
                    {newEmail ? `预判类别: ${getAutoCategory(newEmail)}` : ''}
                  </span>
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="contoh: g-12345678@moe-dl.edu.my"
                  required
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  以 @moe-dl.edu.my 结尾归类为 GURU，其他归类为 AKP。
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  系统独立密码 (Kata Laluan) * (最少6位)
                </label>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="最少6位字母或数字"
                  required
                  minLength={6}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="clerkCheck"
                  checked={newHasClerk}
                  onChange={(e) => setNewHasClerk(e.target.checked)}
                  className="w-4 h-4 rounded text-purple-600 bg-slate-950 border-slate-800"
                />
                <label htmlFor="clerkCheck" className="text-xs text-slate-300 select-none cursor-pointer">
                  授权书记假期管理权限 (Kuasa Kerani Cuti)
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSingleUserModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creatingUser}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5"
                >
                  {creatingUser ? (
                    <span>正在开通...</span>
                  ) : (
                    <span>立即开通账号</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Account Modal */}
      <BatchAccountModal
        isOpen={showBatchModal}
        onClose={() => setShowBatchModal(false)}
        onSuccess={() => {
          setActionFeedback({ type: 'success', message: '批量员工账号开通完成！初始密码仅在弹窗临时显示，未储存于数据库。' });
        }}
      />

      {/* Printable Report View (Excludes coordinates) */}
      {showPrintView && (
        <PrintReportView
          schoolSettings={schoolSettings}
          selectedDate={selectedDate}
          allStaff={staffList}
          attendanceMap={attendanceMap}
          unavailabilityList={unavailabilityList}
          onClose={() => setShowPrintView(false)}
        />
      )}

    </div>
  );
};
