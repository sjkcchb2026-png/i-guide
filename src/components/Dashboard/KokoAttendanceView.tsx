
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Check, Plus, Trash2, Edit3, CheckCircle2, RefreshCw,
  Trophy, Calendar, TrendingUp, Users, Award, Info, Sparkles
} from 'lucide-react';
import { db, auth } from '../../lib/firebase';
import { 
  collection, addDoc, doc, deleteDoc, updateDoc, onSnapshot
} from 'firebase/firestore';
import { Student, UserProfile } from '../../types';
import { StudentProfileModal } from '../Student/StudentProfileModal';
import { useSchoolTenant } from '../../contexts/SchoolTenantContext';
import { belongsToSchool } from '../../utils/schoolTenant';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface Props {
  profile: UserProfile;
  role: 'pentadbir' | 'guru' | 'laporan';
}

interface KokoGroup {
  id?: string;
  name: string;
  category: 'uniform' | 'club' | 'sport';
}

interface KokoMembership {
  id?: string;
  student_id: string;
  name: string;
  class: string;
  gender: string;
  uniform: string;
  club: string;
  sport: string;
  academic_year: string;
}

interface KokoAttendanceSession {
  id?: string;
  groupId: string;          // matching the group name or id
  category: 'uniform' | 'club' | 'sport';
  date: string;             // YYYY-MM-DD
  academicYear: string;
  attendance: {
    [studentId: string]: '1' | '0' | 'x'; // '1'=Hadir, '0'=Tidak Hadir, 'x'=Kecualian
  };
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;
}

export default function KokoAttendanceView({ profile, role }: Props) {
  const { schoolCode: activeSchoolCode, schoolName: tenantSchoolName } = useSchoolTenant();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [profileStudentId, setProfileStudentId] = useState<string | null>(null);
  const [groups, setGroups] = useState<KokoGroup[]>([]);
  const [memberships, setMemberships] = useState<KokoMembership[]>([]);
  const [attendanceSessions, setAttendanceSessions] = useState<KokoAttendanceSession[]>([]);
  
  // Selection states
  const [selectedCategory, setSelectedCategory] = useState<'uniform' | 'club' | 'sport'>('uniform');
  const [selectedGroupId, setSelectedGroupId] = useState<string>(''); // matches group.id or name
  
  // Modals / forms
  const [showAddDateModal, setShowAddDateModal] = useState(false);
  const [newMeetingDate, setNewMeetingDate] = useState('');
  
  const [editingSession, setEditingSession] = useState<any>(null); // To edit a session date
  const [showEditDateModal, setShowEditDateModal] = useState(false);
  const [editMeetingDateVal, setEditMeetingDateVal] = useState('');

  // Save state tracking
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [confirmDeleteMeetingId, setConfirmDeleteMeetingId] = useState<string | null>(null);

  const academicYear = profile.academic_year || '2026';
  const canEdit = role === 'pentadbir' || role === 'guru';

  // Load static data and synchronize attendance live
  useEffect(() => {
    let unsubStudents: any;
    let unsubGroups: any;
    let unsubMemberships: any;
    let unsubAttendance: any;

    try {
      setLoading(true);

      // Subscribe to students
      unsubStudents = onSnapshot(collection(db, 'students'), (snap) => {
        const list = snap.docs
          .filter(d => belongsToSchool(d.data(), activeSchoolCode))
          .map(d => ({ id: d.id, ...d.data() } as Student));
        setStudents(list);
      }, (err) => handleFirestoreError(err, OperationType.GET, 'students'));

      // Subscribe to groups
      unsubGroups = onSnapshot(collection(db, 'koko_groups'), (snap) => {
        const list = snap.docs
          .filter(d => belongsToSchool(d.data(), activeSchoolCode))
          .map(d => ({ id: d.id, ...d.data() } as KokoGroup));
        setGroups(list);
      }, (err) => handleFirestoreError(err, OperationType.GET, 'koko_groups'));

      // Subscribe to memberships
      unsubMemberships = onSnapshot(collection(db, 'koko_memberships'), (snap) => {
        const list = snap.docs
          .filter(d => belongsToSchool(d.data(), activeSchoolCode))
          .map(d => ({ id: d.id, ...d.data() } as KokoMembership));
        setMemberships(list);
      }, (err) => handleFirestoreError(err, OperationType.GET, 'koko_memberships'));

      // Subscribe to attendance sessions
      unsubAttendance = onSnapshot(collection(db, 'koko_attendance'), (snap) => {
        const list = snap.docs
          .filter(d => belongsToSchool(d.data(), activeSchoolCode))
          .map(d => ({ id: d.id, ...d.data() } as KokoAttendanceSession));
        setAttendanceSessions(list);
        setLoading(false);
      }, (err) => handleFirestoreError(err, OperationType.GET, 'koko_attendance'));

    } catch (err) {
      console.error("Error launching sync listeners:", err);
      setLoading(false);
    }

    return () => {
      if (unsubStudents) unsubStudents();
      if (unsubGroups) unsubGroups();
      if (unsubMemberships) unsubMemberships();
      if (unsubAttendance) unsubAttendance();
    };
  }, [activeSchoolCode]);

  // Filter groups based on selected category
  const filteredGroups = groups.filter(g => g.category === selectedCategory);

  // Set default group when category changes
  useEffect(() => {
    if (filteredGroups.length > 0) {
      // Find matches for the current category or pick first
      const firstGroup = filteredGroups[0];
      setSelectedGroupId(firstGroup.id || firstGroup.name);
    } else {
      setSelectedGroupId('');
    }
  }, [selectedCategory, groups]);

  // Find current group object
  const currentGroupObj = groups.find(g => g.id === selectedGroupId || g.name === selectedGroupId);
  const currentGroupName = currentGroupObj ? currentGroupObj.name : '';

  // Filter students assigned to the current selected group
  const groupStudents = students.filter(student => {
    // Look up membership record
    const m = memberships.find(x => x.student_id === student.student_id);
    if (!m) return false;
    
    if (selectedCategory === 'uniform') {
      return m.uniform === currentGroupName && m.uniform !== '';
    } else if (selectedCategory === 'club') {
      return m.club === currentGroupName && m.club !== '';
    } else if (selectedCategory === 'sport') {
      return m.sport === currentGroupName && m.sport !== '';
    }
    return false;
  }).sort((a, b) => a.name.localeCompare(b.name));

  // Gather and sort attendance sessions for the current selected group
  const currentGroupSessions = attendanceSessions
    .filter(s => (s.groupId === selectedGroupId || s.groupId === currentGroupName) && s.category === selectedCategory && s.academicYear === academicYear)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Format Date for table headings (e.g. 2026-01-26 -> "26-Jan")
  const formatDateHeading = (dateStr: string) => {
    try {
      const parts = dateStr.split('-');
      if (parts.length !== 3) return dateStr;
      const day = parseInt(parts[2], 10);
      const months = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogos', 'Sept', 'Okt', 'Nov', 'Dis'];
      const monthIdx = parseInt(parts[1], 10) - 1;
      return `${day}-${months[monthIdx] || parts[1]}`;
    } catch {
      return dateStr;
    }
  };

  // Add a new meeting date
  const handleAddMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMeetingDate) return;

    // Check if date already exists
    const dateExists = currentGroupSessions.some(s => s.date === newMeetingDate);
    if (dateExists) {
      alert("Tarikh perjumpaan ini telah wujud dalam sistem!");
      return;
    }

    setIsSaving(true);
    try {
      // Initialize attendance map for all active members as '1' (Present) by default
      const defaultAttendanceMap: Record<string, '1' | '0' | 'x'> = {};
      groupStudents.forEach(st => {
        defaultAttendanceMap[st.student_id] = '1';
      });

      const payload: KokoAttendanceSession & { schoolCode?: string } = {
        groupId: selectedGroupId || currentGroupName,
        category: selectedCategory,
        date: newMeetingDate,
        academicYear,
        attendance: defaultAttendanceMap,
        schoolCode: activeSchoolCode,
        createdAt: new Date().toISOString(),
        createdBy: profile.uid
      };

      await addDoc(collection(db, 'koko_attendance'), payload);
      
      setShowAddDateModal(false);
      setNewMeetingDate('');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Error creating attendance session:", err);
      handleFirestoreError(err, OperationType.CREATE, 'koko_attendance');
    } finally {
      setIsSaving(false);
    }
  };

  // Trigger editing of an existing meeting's date
  const openEditDateModal = (session: KokoAttendanceSession) => {
    setEditingSession(session);
    setEditMeetingDateVal(session.date);
    setShowEditDateModal(true);
  };

  // Save the updated date
  const handleUpdateMeetingDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSession || !editMeetingDateVal) return;

    setIsSaving(true);
    try {
      const docRef = doc(db, 'koko_attendance', editingSession.id!);
      await updateDoc(docRef, {
        date: editMeetingDateVal,
        updatedAt: new Date().toISOString()
      });
      setShowEditDateModal(false);
      setEditingSession(null);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Error updating meeting date:", err);
      handleFirestoreError(err, OperationType.UPDATE, `koko_attendance/${editingSession.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete a meeting session
  const handleDeleteMeeting = async (sessionId: string) => {
    setIsSaving(true);
    try {
      await deleteDoc(doc(db, 'koko_attendance', sessionId));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Error deleting attendance session:", err);
      handleFirestoreError(err, OperationType.DELETE, `koko_attendance/${sessionId}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle local cell status (1 -> 0 -> x)
  const handleCellToggle = async (session: KokoAttendanceSession, studentId: string, currentStatus: '1' | '0' | 'x') => {
    if (!canEdit) return;

    let nextStatus: '1' | '0' | 'x' = '1';
    if (currentStatus === '1') nextStatus = '0';
    else if (currentStatus === '0') nextStatus = 'x';
    else nextStatus = '1';

    const updatedAttendance = {
      ...session.attendance,
      [studentId]: nextStatus
    };

    try {
      const docRef = doc(db, 'koko_attendance', session.id!);
      await updateDoc(docRef, {
        attendance: updatedAttendance,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Error updating attendance cell:", err);
      handleFirestoreError(err, OperationType.UPDATE, `koko_attendance/${session.id}`);
    }
  };

  // Mark all students present for a specific session code
  const handleMarkAllPresent = async (session: KokoAttendanceSession) => {
    if (!canEdit) return;
    
    const updatedAttendance: Record<string, '1' | '0' | 'x'> = {};
    groupStudents.forEach(st => {
      updatedAttendance[st.student_id] = '1';
    });

    try {
      const docRef = doc(db, 'koko_attendance', session.id!);
      await updateDoc(docRef, {
        attendance: updatedAttendance,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Error marking all present:", err);
      handleFirestoreError(err, OperationType.UPDATE, `koko_attendance/${session.id}`);
    }
  };

  // Calculations for Student row
  const getStudentStats = (studentId: string) => {
    let attended = 0;
    let absent = 0;
    let excused = 0;

    currentGroupSessions.forEach(session => {
      const status = session.attendance?.[studentId] || '0';
      if (status === '1') attended++;
      else if (status === '0') absent++;
      else if (status === 'x') excused++;
    });

    const possible = attended + absent; // Excused counts out of the percentage
    const percentage = possible > 0 ? (attended / possible) * 100 : 100.0;

    return {
      attended,
      absent,
      excused,
      possible,
      percentage
    };
  };

  // Daily Stats calculations (Columns)
  const getSessionDailyStats = (session: KokoAttendanceSession) => {
    let presentCount = 0;
    let totalCount = 0;

    groupStudents.forEach(st => {
      const status = session.attendance?.[st.student_id] || '0';
      if (status === '1') {
        presentCount++;
        totalCount++;
      } else if (status === '0') {
        totalCount++;
      }
      // 'x' is excluded from both present and possible harian
    });

    const percent = totalCount > 0 ? (presentCount / totalCount) * 100 : 0;
    return {
      presentCount,
      totalCount,
      percent
    };
  };

  // Cumulative percentage at column D
  const getCumulativeStatsAtSession = (sessionIndex: number) => {
    let totalPresent = 0;
    let totalPossible = 0;

    for (let i = 0; i <= sessionIndex; i++) {
      const sess = currentGroupSessions[i];
      groupStudents.forEach(st => {
        const val = sess.attendance?.[st.student_id] || '0';
        if (val === '1') {
          totalPresent++;
          totalPossible++;
        } else if (val === '0') {
          totalPossible++;
        }
      });
    }

    return totalPossible > 0 ? (totalPresent / totalPossible) * 100 : 100.0;
  };

  // Overall Group Stats for PBPPP Metrics
  const totalMeetingsCount = currentGroupSessions.length;
  
  // Calculate total possible vs total present across all sessions
  let totalPresences = 0;
  let totalPossibles = 0;
  let studentsReaching12Meetings = 0;
  let studentsPassMark = 0; // Students with >= 80% attendance average

  groupStudents.forEach(st => {
    const stats = getStudentStats(st.student_id);
    totalPresences += stats.attended;
    totalPossibles += stats.possible;
    
    if (stats.attended >= 12) {
      studentsReaching12Meetings++;
    }
    if (stats.percentage >= 80) {
      studentsPassMark++;
    }
  });

  const overallAveragePercentage = totalPossibles > 0 
    ? (totalPresences / totalPossibles) * 100 
    : 100.0;

  // Render Status Badge for individual student averages
  const getStatusBadge = (percentage: number) => {
    if (percentage >= 90) {
      return <span className="bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase px-2 py-1 rounded-md border border-emerald-100">Cemerlang</span>;
    } else if (percentage >= 80) {
      return <span className="bg-blue-50 text-blue-700 text-[9px] font-black uppercase px-2 py-1 rounded-md border border-blue-100">Baik</span>;
    } else if (percentage >= 50) {
      return <span className="bg-amber-50 text-amber-700 text-[9px] font-black uppercase px-2 py-1 rounded-md border border-amber-100">Memuaskan</span>;
    } else {
      return <span className="bg-rose-50 text-rose-700 text-[9px] font-black uppercase px-2 py-1 rounded-md border border-rose-100">Mahu Usaha</span>;
    }
  };

  return (
    <div className="space-y-10" id="attendance-root">
      {/* Category selector pill / buttons */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xl shadow-slate-100/50 flex flex-col gap-6 print:hidden">
        <div className="flex flex-wrap items-center gap-2 pb-5 border-b border-slate-100">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-2">PILIH KATEGORI KOKU:</span>
          {(['uniform', 'club', 'sport'] as const).map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm ${
                selectedCategory === cat
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                  : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200 hover:text-slate-800'
              }`}
            >
              {cat === 'uniform' ? '🛡️ Badan Beruniform' : cat === 'club' ? '📚 Kelab/Persatuan' : '🏀 Sukan/Permainan'}
            </button>
          ))}
        </div>

        <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <span className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-[10px]">🔎</span>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">Kumpulan Kokurikulum:</label>
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wide h-11 focus:ring-2 focus:ring-blue-500 outline-none w-full sm:w-64 cursor-pointer"
            >
              {filteredGroups.length === 0 ? (
                <option value="">-- Tiada Kumpulan --</option>
              ) : (
                filteredGroups.map(g => (
                  <option key={g.id || g.name} value={g.id || g.name}>{g.name.toUpperCase()}</option>
                ))
              )}
            </select>
          </div>

          <div className="flex gap-2.5 w-full md:w-auto justify-end">
            {canEdit && selectedGroupId && (
              <button
                type="button"
                onClick={() => {
                  setNewMeetingDate(new Date().toISOString().substring(0, 10));
                  setShowAddDateModal(true);
                }}
                className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all shadow-md shadow-blue-600/10 w-full sm:w-auto"
              >
                <Plus size={14} /> Tarikh Baru
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="px-5 py-3 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition whitespace-nowrap shadow-md shadow-slate-900/10 w-full sm:w-auto"
            >
              🖨️ Cetak Senarai
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white p-20 text-center rounded-[32px] border border-slate-100 flex flex-col items-center justify-center gap-4">
          <RefreshCw size={36} className="animate-spin text-blue-500" />
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Memuat Turun Keperincian Kehadiran...</p>
        </div>
      ) : !selectedGroupId ? (
        <div className="bg-white p-16 text-center rounded-[32px] border border-slate-200 text-slate-400 italic">
          💡 Sila daftar atau pilih kumpulan kokurikulum terlebih dahulu di menu "Pengurusan Aktiviti Kokurikulum" untuk mengesan kehadiran.
        </div>
      ) : (
        <div className="space-y-10">
          
          {/* PBPPP Performance Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 print:hidden">
            {/* Purata Kehadiran Card */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-md shadow-slate-100/40 flex flex-col justify-between hover:border-blue-400/50 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-300 relative overflow-hidden group">
              <div className="absolute top-0 right-0 h-24 w-24 bg-blue-50 rounded-bl-full -mr-8 -mt-8 -z-0 opacity-40 group-hover:scale-110 transition-transform duration-300" />
              <div className="z-10">
                <div className="flex justify-between items-start mb-3">
                  <span className="text-[9px] font-black uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100/60 inline-block">Keberhasilan PBPPP</span>
                  <Trophy size={16} className="text-blue-500" />
                </div>
                <h4 className="text-3xl font-black italic tracking-tighter text-slate-900 font-sans leading-none mt-2">
                  {overallAveragePercentage.toFixed(2)}%
                </h4>
                <p className="text-[10px] text-slate-500 font-extrabold uppercase mt-1.5 tracking-wider">Purata Kehadiran Kumpulan</p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 text-[9px] text-slate-400 font-bold leading-relaxed z-10 flex items-center gap-1">
                <Info size={10} className="text-blue-400 flex-shrink-0" />
                <span>Berdasarkan {totalMeetingsCount} sesi berdaftar aktif.</span>
              </div>
            </div>

            {/* Total Meetings Card */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-md shadow-slate-100/40 flex flex-col justify-between hover:border-amber-400/50 hover:shadow-lg hover:shadow-amber-500/5 transition-all duration-300 relative overflow-hidden group">
              <div className="absolute top-0 right-0 h-24 w-24 bg-amber-50 rounded-bl-full -mr-8 -mt-8 -z-0 opacity-40 group-hover:scale-110 transition-transform duration-300" />
              <div className="z-10">
                <div className="flex justify-between items-start mb-3">
                  <span className="text-[9px] font-black uppercase tracking-wider text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-100/60 inline-block">Sasaran 12 Kali</span>
                  <Calendar size={16} className="text-amber-500" />
                </div>
                <h4 className="text-3xl font-black italic tracking-tighter text-slate-900 font-sans leading-none mt-2">
                  {totalMeetingsCount} / 12
                </h4>
                <p className="text-[10px] text-slate-500 font-extrabold uppercase mt-1.5 tracking-wider">Perjumpaan Setahun</p>
              </div>
              {/* Progress Indicator */}
              <div className="mt-5 pt-3 border-t border-slate-100 z-10">
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-amber-400 to-amber-500 h-1.5 transition-all duration-500"
                    style={{ width: `${Math.min((totalMeetingsCount / 12) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-[9px] text-amber-600 font-black uppercase mt-1.5 tracking-wider flex items-center gap-1">
                  {totalMeetingsCount >= 12 ? '🟢 Sasaran Tercapai!' : `Kurang ${12 - totalMeetingsCount} kali lagi`}
                </p>
              </div>
            </div>

            {/* Students reaching 12 times */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-md shadow-slate-100/40 flex flex-col justify-between hover:border-emerald-400/50 hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-300 relative overflow-hidden group">
              <div className="absolute top-0 right-0 h-24 w-24 bg-emerald-50 rounded-bl-full -mr-8 -mt-8 -z-0 opacity-40 group-hover:scale-110 transition-transform duration-300" />
              <div className="z-10">
                <div className="flex justify-between items-start mb-3">
                  <span className="text-[9px] font-black uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100/60 inline-block">Sasaran Individu</span>
                  <Users size={16} className="text-emerald-500" />
                </div>
                <h4 className="text-3xl font-black italic tracking-tighter text-slate-900 font-sans leading-none mt-2">
                  {groupStudents.length > 0 ? ((studentsReaching12Meetings / groupStudents.length) * 100).toFixed(1) : '0.0'}%
                </h4>
                <p className="text-[10px] text-slate-500 font-extrabold uppercase mt-1.5 tracking-wider">Ahli Hadir ≥ 12 kali</p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 text-[9px] text-emerald-600 font-black tracking-wider uppercase z-10 flex items-center gap-1">
                <Sparkles size={10} className="text-emerald-500" />
                <span>{studentsReaching12Meetings} / {groupStudents.length} murid capai target.</span>
              </div>
            </div>

            {/* Pass Mark Card */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-md shadow-slate-100/40 flex flex-col justify-between hover:border-indigo-400/50 hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-300 relative overflow-hidden group">
              <div className="absolute top-0 right-0 h-24 w-24 bg-indigo-50 rounded-bl-full -mr-8 -mt-8 -z-0 opacity-40 group-hover:scale-110 transition-transform duration-300" />
              <div className="z-10">
                <div className="flex justify-between items-start mb-3">
                  <span className="text-[9px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100/60 inline-block">Kadar Kejayaan</span>
                  <TrendingUp size={16} className="text-indigo-500" />
                </div>
                <h4 className="text-3xl font-black italic tracking-tighter text-slate-900 font-sans leading-none mt-2">
                  {groupStudents.length > 0 ? ((studentsPassMark / groupStudents.length) * 100).toFixed(1) : '0.0'}%
                </h4>
                <p className="text-[10px] text-slate-500 font-extrabold uppercase mt-1.5 tracking-wider">Kadar Kehadiran ≥ 80%</p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 text-[9px] text-indigo-600 font-black tracking-wider uppercase z-10 flex items-center gap-1">
                <Award size={10} className="text-indigo-500" />
                <span>{studentsPassMark} / {groupStudents.length} ahli kekal cemerlang.</span>
              </div>
            </div>
          </div>

          {/* Main Matrix Table */}
          <div className="bg-white rounded-[32px] border border-slate-200 shadow-xl shadow-slate-100/50 overflow-hidden">
            {/* Print Header */}
            <div className="hidden print:block p-8 border-b border-slate-300 text-center relative">
              <div className="absolute right-4 top-4 border border-slate-300 rounded-lg p-2 font-mono text-[9px] uppercase font-black">
                TS25
              </div>
              <h2 className="text-xl font-bold tracking-tight uppercase">{tenantSchoolName}</h2>
              <p className="text-xs font-black uppercase tracking-widest mt-1 text-slate-500">LAPORAN REKOD KEHADIRAN AKTIVITI KOKURIKULUM</p>
              <div className="mt-4 grid grid-cols-3 text-left border-y border-dashed border-slate-300 py-3 text-[10px] font-bold">
                <div>KATEGORI: <span className="font-black uppercase">{selectedCategory === 'uniform' ? 'Badan Beruniform' : selectedCategory === 'club' ? 'Kelab/Persatuan' : 'Sukan/Permainan'}</span></div>
                <div>KUMPULAN: <span className="font-black uppercase">{currentGroupName}</span></div>
                <div>SESI AKADEMIK: <span className="font-black uppercase">{academicYear}</span></div>
              </div>
            </div>

            {/* Table Control and Instruction Head */}
            <div className="p-6 bg-slate-50 border-b border-slate-150 flex flex-col sm:flex-row gap-4 justify-between items-center print:hidden">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-pulse" />
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">MATRIKS KEHADIRAN AHLI: {currentGroupName.toUpperCase()}</h3>
              </div>
              
              <div className="flex flex-wrap items-center gap-4 text-[10px] text-slate-500 font-bold uppercase">
                <span className="flex items-center gap-1.5"><span className="w-6 h-6 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center text-[10px] font-black">✓</span> Hadir</span>
                <span className="flex items-center gap-1.5"><span className="w-6 h-6 rounded-lg bg-rose-50 border border-rose-200 text-rose-550 flex items-center justify-center text-[9px] font-black">✕</span> Tidak Hadir</span>
                <span className="flex items-center gap-1.5"><span className="w-6 h-6 rounded-lg bg-slate-100 border border-slate-200 text-slate-400 flex items-center justify-center text-[10px] font-black">-</span> Kecualian</span>
                {canEdit && <span className="text-blue-600 ml-2 select-none">💡 Klik sel berulang kali untuk menukar status</span>}
              </div>
            </div>

            {groupStudents.length === 0 ? (
              <div className="p-16 text-center text-slate-400 italic">
                ⚠️ Tiada murid berdaftar dalam kumpulan ini. Pasangkan ahli di tab "Pengurusan Aktiviti Kokurikulum" terlebih dahulu.
              </div>
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left border-collapse table-fixed min-w-[900px]">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-200">
                      <th className="w-12 py-4 px-4 text-[10px] font-black uppercase tracking-wider text-slate-400 text-center">BIL</th>
                      <th className="w-56 py-4 px-4 text-[10px] font-black uppercase tracking-wider text-slate-400">NAMA MURID</th>
                      <th className="w-20 py-4 px-4 text-[10px] font-black uppercase tracking-wider text-slate-400 text-center">KELAS</th>
                      <th className="w-24 py-4 px-4 text-[10px] font-black uppercase tracking-wider text-slate-400 text-center">JANTINA</th>
                      
                      {/* Meeting dates header columns */}
                      {currentGroupSessions.map((session, idx) => (
                        <th key={session.id} className="w-24 py-4 px-2 text-[10px] text-slate-700 text-center relative group hover:bg-slate-100/40">
                          <div className="font-extrabold uppercase font-mono whitespace-nowrap">{formatDateHeading(session.date)}</div>
                          
                           {/* Teacher Action buttons above date */}
                          {canEdit && (
                            <div className="absolute -top-1 left-0 right-0 justify-center gap-1 hidden group-hover:flex bg-slate-200 rounded-t py-1 animate-fadeIn print:hidden shadow-sm z-10 w-24 mx-auto">
                              {confirmDeleteMeetingId === session.id ? (
                                <div className="flex items-center gap-1 bg-red-50 px-1 py-0.5 rounded">
                                  <button
                                    type="button"
                                    onClick={() => session.id && handleDeleteMeeting(session.id)}
                                    className="bg-rose-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase"
                                  >
                                    Ya
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteMeetingId(null)}
                                    className="bg-slate-300 text-slate-800 text-[8px] font-black px-1.5 py-0.5 rounded uppercase"
                                  >
                                    X
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    title="Ubah Tarikh"
                                    onClick={() => openEditDateModal(session)}
                                    className="text-blue-600 hover:text-blue-800 p-0.5 rounded transition"
                                  >
                                    <Edit3 size={10} />
                                  </button>
                                  <button
                                    type="button"
                                    title="Sahkan Semua Hadir"
                                    onClick={() => handleMarkAllPresent(session)}
                                    className="text-emerald-600 hover:text-emerald-800 p-0.5 rounded transition"
                                  >
                                    <Check size={10} />
                                  </button>
                                  <button
                                    type="button"
                                    title="Padam Perjumpaan"
                                    onClick={() => setConfirmDeleteMeetingId(session.id!)}
                                    className="text-rose-600 hover:text-rose-800 p-0.5 rounded transition"
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </th>
                      ))}

                      {/* Rightmost student calculations header */}
                      <th className="w-24 py-4 px-3 text-[10px] font-black uppercase tracking-wider text-slate-400 text-center bg-slate-50/50">HADIR / TOTAL</th>
                      <th className="w-20 py-4 px-3 text-[10px] font-black uppercase tracking-wider text-slate-400 text-center bg-slate-50/50">% HADIR</th>
                      <th className="w-24 py-4 px-3 text-[10px] font-black uppercase tracking-wider text-slate-400 text-center bg-slate-50/50">PRESTASI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupStudents.map((st, sIdx) => {
                      const stats = getStudentStats(st.student_id);

                      return (
                        <tr 
                          key={st.student_id} 
                          className="border-b border-slate-100 hover:bg-slate-50/40 transition-colors"
                        >
                          {/* Bil */}
                          <td className="py-3 px-4 text-center font-mono text-[11px] font-black text-slate-400">{sIdx + 1}</td>
                          
                          {/* Student Name */}
                          <td className="py-3 px-4 text-xs font-bold text-slate-800 uppercase truncate" title={st.name}>
                            <button
                              type="button"
                              onClick={() => setProfileStudentId(st.student_id)}
                              className="text-left font-bold text-slate-800 hover:text-blue-600 hover:underline uppercase transition-colors cursor-pointer flex items-center gap-1.5"
                              title="Klik untuk buka Profil Lengkap Murid & Maklumat Kecemasan"
                            >
                              <span className="truncate">{st.name}</span>
                              <span className="text-[10px] text-blue-500 font-normal">📋</span>
                            </button>
                          </td>
                          
                          {/* Class */}
                          <td className="py-3 px-4 text-center text-xs font-extrabold text-slate-500 font-mono">
                            {st.class}
                          </td>
                          
                          {/* Gender */}
                          <td className="py-3 px-4 text-center text-xs font-semibold text-slate-400 uppercase">
                            {String(st.gender).toUpperCase().startsWith('P') ? 'PEREMPUAN' : 'LELAKI'}
                          </td>

                          {/* Meeting Cells */}
                          {currentGroupSessions.map(session => {
                            const status = session.attendance?.[st.student_id] || '0';
                            
                            return (
                              <td 
                                key={session.id} 
                                className="py-2.5 px-2 text-center"
                              >
                                <button
                                  type="button"
                                  disabled={!canEdit}
                                  onClick={() => handleCellToggle(session, st.student_id, status)}
                                  className={`w-11 h-9 rounded-xl text-xs font-black transition-all flex items-center justify-center mx-auto border cursor-pointer ${
                                    status === '1' 
                                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm shadow-emerald-100/40 hover:bg-emerald-100/80'
                                      : status === '0'
                                      ? 'bg-rose-50 border-rose-200 text-rose-700 shadow-sm shadow-rose-100/40 hover:bg-rose-100/80'
                                      : 'bg-slate-100 border-slate-200/60 text-slate-500 hover:bg-slate-200/50'
                                  } disabled:cursor-default disabled:hover:scale-100 hover:scale-105 active:scale-95`}
                                  title={status === '1' ? 'Hadir' : status === '0' ? 'Tidak Hadir' : 'Kecualian'}
                                >
                                  {status === '1' ? (
                                    <span className="text-emerald-600 font-black text-xs">✓</span>
                                  ) : status === '0' ? (
                                    <span className="text-rose-500 font-extrabold text-[10px]">✕</span>
                                  ) : (
                                    <span className="text-slate-400 font-semibold text-xs">-</span>
                                  )}
                                </button>
                              </td>
                            );
                          })}

                          {/* Attendance Total Stats */}
                          <td className="py-3 px-3 text-center text-[10px] font-black text-slate-700 bg-slate-50/20 font-mono">
                            {stats.attended} / {stats.possible}
                          </td>

                          {/* Percentage */}
                          <td className="py-3 px-3 text-center text-[10px] font-black text-blue-600 bg-slate-50/20 font-mono">
                            {stats.percentage.toFixed(1)}%
                          </td>

                          {/* Target Status */}
                          <td className="py-3 px-3 text-center bg-slate-50/20">
                            {getStatusBadge(stats.percentage)}
                          </td>
                        </tr>
                      );
                    })}

                    {/* DAILY PRESENT STATS ROW */}
                    <tr className="bg-slate-50/40 border-t-2 border-slate-200">
                      <td colSpan={4} className="py-3 px-4 text-right text-[10px] font-black uppercase text-slate-500">
                        KEHADIRAN MURID HARIAN:
                      </td>
                      {currentGroupSessions.map(session => {
                        const daily = getSessionDailyStats(session);
                        return (
                          <td key={session.id} className="py-3 px-2 text-center font-mono text-[10px] font-black text-slate-700">
                            {daily.presentCount}
                          </td>
                        );
                      })}
                      <td colSpan={3} className="bg-slate-50/50"></td>
                    </tr>

                    {/* DAILY PERCENTAGE ROW */}
                    <tr className="bg-slate-50/40 border-b border-slate-200">
                      <td colSpan={4} className="py-3 px-4 text-right text-[10px] font-black uppercase text-slate-500">
                        PERATUS KEHADIRAN MURID HARIAN:
                      </td>
                      {currentGroupSessions.map(session => {
                        const daily = getSessionDailyStats(session);
                        return (
                          <td key={session.id} className="py-3 px-2 text-center font-mono text-[10px] font-black text-blue-600">
                            {daily.percent.toFixed(2)}%
                          </td>
                        );
                      })}
                      <td colSpan={3} className="bg-slate-50/50"></td>
                    </tr>

                    {/* CUMULATIVE AVERAGE ROW */}
                    <tr className="bg-slate-100/50">
                      <td colSpan={4} className="py-3.5 px-4 text-right text-[10px] font-black uppercase text-orange-950">
                        PERATUS KEHADIRAN MURID KESELURUHAN (CUMULATIVE):
                      </td>
                      {currentGroupSessions.map((session, sIdx) => {
                        const cumulativePercent = getCumulativeStatsAtSession(sIdx);
                        return (
                          <td key={session.id} className="py-3.5 px-2 text-center font-mono text-[10px] font-black text-orange-600">
                            {cumulativePercent.toFixed(2)}%
                          </td>
                        );
                      })}
                      <td colSpan={3} className="bg-slate-100/50"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Date modal */}
      {showAddDateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[32px] p-8 w-full max-w-sm shadow-2xl border border-slate-100"
          >
            <h3 className="text-xl font-black italic uppercase tracking-tighter text-slate-800 mb-2 flex items-center gap-2">
              <span>📅</span> Daftar Perjumpaan Baru
            </h3>
            <p className="text-[10px] text-slate-400 mb-6 font-black uppercase tracking-wider leading-relaxed">
              Sila pilih tarikh untuk perjumpaan kokurikulum ahli kumpulan **{currentGroupName}**.
            </p>

            <form onSubmit={handleAddMeeting} className="space-y-5">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Tarikh Perjumpaan:</label>
                <input 
                  type="date"
                  required
                  value={newMeetingDate}
                  onChange={(e) => setNewMeetingDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500 uppercase tracking-widest text-center"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setShowAddDateModal(false)}
                  className="flex-1 py-4 bg-slate-100 text-slate-500 text-xs font-black uppercase tracking-wider rounded-2xl hover:bg-slate-200 transition-all font-bold"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-4 bg-blue-600 text-white text-xs font-black uppercase tracking-wider rounded-2xl hover:bg-blue-700 transition-all font-bold shadow-lg shadow-blue-600/10 disabled:opacity-50"
                >
                  {isSaving ? 'Menyimpan...' : 'Daftar'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Edit Date modal */}
      {showEditDateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[32px] p-8 w-full max-w-sm shadow-2xl border border-slate-100"
          >
            <h3 className="text-xl font-black italic uppercase tracking-tighter text-slate-800 mb-2 flex items-center gap-2">
              <span>📅</span> Ubah Tarikh Perjumpaan
            </h3>
            <p className="text-[10px] text-slate-400 mb-6 font-black uppercase tracking-wider leading-relaxed">
              Ubah tarikh perjumpaan bagi kumpulan **{currentGroupName}**.
            </p>

            <form onSubmit={handleUpdateMeetingDate} className="space-y-5">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Tarikh Perjumpaan:</label>
                <input 
                  type="date"
                  required
                  value={editMeetingDateVal}
                  onChange={(e) => setEditMeetingDateVal(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500 uppercase tracking-widest text-center"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => {
                    setShowEditDateModal(false);
                    setEditingSession(null);
                  }}
                  className="flex-1 py-4 bg-slate-100 text-slate-500 text-xs font-black uppercase tracking-wider rounded-2xl hover:bg-slate-200 transition-all font-bold"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-4 bg-indigo-600 text-white text-xs font-black uppercase tracking-wider rounded-2xl hover:bg-indigo-700 transition-all font-bold shadow-lg shadow-indigo-600/10 disabled:opacity-50"
                >
                  {isSaving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Floating Alert / Toast */}
      <AnimatePresence>
        {saveSuccess && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 right-6 bg-slate-900 border border-slate-800 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 z-50 print:hidden"
          >
            <CheckCircle2 className="text-emerald-500" size={18} />
            <span className="text-xs font-black uppercase tracking-wider">Rekod Berjaya Dikemas Kini!</span>
          </motion.div>
        )}
      </AnimatePresence>

      <StudentProfileModal
        studentId={profileStudentId}
        isOpen={!!profileStudentId}
        onClose={() => setProfileStudentId(null)}
      />
    </div>
  );
}


