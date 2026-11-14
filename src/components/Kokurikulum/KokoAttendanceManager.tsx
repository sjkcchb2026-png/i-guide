import React, { useState, useEffect, useMemo } from 'react';
import { 
  Check, Plus, Trash2, Edit3, CheckCircle2, RefreshCw,
  Calendar, Users, FileText, ChevronRight, ArrowRight,
  Sparkles, CheckSquare, XSquare, AlertCircle
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { 
  collection, addDoc, doc, deleteDoc, updateDoc, onSnapshot 
} from 'firebase/firestore';
import { Student, UserProfile } from '../../types';
import { KokoGroup, KokoMembership, KokoAttendanceSession } from '../../types/kokurikulum';
import { useSchoolTenant } from '../../contexts/SchoolTenantContext';
import { belongsToSchool } from '../../utils/schoolTenant';

interface Props {
  profile: UserProfile;
  role: 'pentadbir' | 'guru' | 'laporan';
  onNavigateToReport?: (prefill: {
    groupId: string;
    groupName: string;
    category: 'uniform' | 'club' | 'sport';
    date: string;
    meetingNumber: number;
    present: number;
    absent: number;
    total: number;
    percentage: number;
  }) => void;
}

export default function KokoAttendanceManager({ profile, role, onNavigateToReport }: Props) {
  const { schoolCode: activeSchoolCode } = useSchoolTenant();
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<'uniform' | 'club' | 'sport'>('uniform');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  
  const [groups, setGroups] = useState<KokoGroup[]>([]);
  const [memberships, setMemberships] = useState<KokoMembership[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<KokoAttendanceSession[]>([]);

  // Add Session Modal
  const [showAddSessionModal, setShowAddSessionModal] = useState(false);
  const [newSessionDate, setNewSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [newMeetingNumber, setNewMeetingNumber] = useState<number>(1);

  // Success alert / report jump prompt
  const [recentlySavedSession, setRecentlySavedSession] = useState<KokoAttendanceSession | null>(null);

  const canEdit = role === 'pentadbir' || role === 'guru';

  // Live Firestore synchronization
  useEffect(() => {
    setLoading(true);
    const unsubs: (() => void)[] = [];

    unsubs.push(
      onSnapshot(collection(db, 'koko_groups'), (snap) => {
        const list = snap.docs
          .filter(d => belongsToSchool(d.data(), activeSchoolCode))
          .map(d => ({ id: d.id, ...d.data() } as KokoGroup));
        setGroups(list);
      })
    );

    unsubs.push(
      onSnapshot(collection(db, 'koko_memberships'), (snap) => {
        const list = snap.docs
          .filter(d => belongsToSchool(d.data(), activeSchoolCode))
          .map(d => ({ id: d.id, ...d.data() } as KokoMembership));
        setMemberships(list);
      })
    );

    unsubs.push(
      onSnapshot(collection(db, 'students'), (snap) => {
        const list = snap.docs
          .filter(d => belongsToSchool(d.data(), activeSchoolCode))
          .map(d => ({ id: d.id, ...d.data() } as Student));
        setStudents(list);
      })
    );

    unsubs.push(
      onSnapshot(collection(db, 'koko_attendance'), (snap) => {
        const list = snap.docs
          .filter(d => belongsToSchool(d.data(), activeSchoolCode))
          .map(d => ({ id: d.id, ...d.data() } as KokoAttendanceSession));
        setSessions(list);
        setLoading(false);
      })
    );

    return () => unsubs.forEach(u => u());
  }, [activeSchoolCode]);

  const categoryGroups = useMemo(() => {
    return groups.filter(g => g.category === selectedCategory);
  }, [groups, selectedCategory]);

  useEffect(() => {
    if (categoryGroups.length > 0) {
      const exists = categoryGroups.some(g => g.id === selectedGroupId || g.name === selectedGroupId);
      if (!exists) {
        setSelectedGroupId(categoryGroups[0].id || categoryGroups[0].name);
      }
    } else {
      setSelectedGroupId('');
    }
  }, [categoryGroups, selectedGroupId]);

  const currentGroup = useMemo(() => {
    return groups.find(g => g.id === selectedGroupId || g.name === selectedGroupId);
  }, [groups, selectedGroupId]);

  // Current enrolled students for selected group
  const groupStudents = useMemo(() => {
    if (!currentGroup) return [];
    const members = memberships.filter(m => {
      if (currentGroup.category === 'uniform') {
        return m.uniform?.toLowerCase().trim() === currentGroup.name.toLowerCase().trim();
      }
      if (currentGroup.category === 'club') {
        return m.club?.toLowerCase().trim() === currentGroup.name.toLowerCase().trim();
      }
      if (currentGroup.category === 'sport') {
        return m.sport?.toLowerCase().trim() === currentGroup.name.toLowerCase().trim();
      }
      return false;
    });

    return members.map(m => {
      const stDetail = students.find(s => s.id === m.student_id || s.student_id === m.student_id);
      return {
        student_id: m.student_id,
        name: m.name || stDetail?.name || 'Murid',
        class: m.class || stDetail?.class || '-',
        gender: m.gender || stDetail?.gender || 'L'
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [memberships, currentGroup, students]);

  // Attendance sessions for current group, sorted by meeting number or date
  const currentGroupSessions = useMemo(() => {
    if (!currentGroup) return [];
    const idKey = currentGroup.id || currentGroup.name;
    return sessions
      .filter(s => s.groupId === idKey || s.groupId === currentGroup.name)
      .sort((a, b) => {
        const numA = a.meetingNumber || 0;
        const numB = b.meetingNumber || 0;
        if (numA !== numB) return numA - numB;
        return a.date.localeCompare(b.date);
      });
  }, [sessions, currentGroup]);

  // Next meeting number suggestion
  useEffect(() => {
    if (currentGroupSessions.length > 0) {
      const maxNum = Math.max(...currentGroupSessions.map(s => s.meetingNumber || 0));
      setNewMeetingNumber(Math.min(maxNum + 1, 12));
    } else {
      setNewMeetingNumber(1);
    }
  }, [currentGroupSessions]);

  // Create session
  const handleCreateSession = async () => {
    if (!currentGroup || !newSessionDate) return;
    const groupId = currentGroup.id || currentGroup.name;

    // Default attendance: everyone '1' (Hadir) by default for speed
    const defaultAttendance: Record<string, '1' | '0' | 'x'> = {};
    groupStudents.forEach(st => {
      defaultAttendance[st.student_id] = '1';
    });

    try {
      const docRef = await addDoc(collection(db, 'koko_attendance'), {
        groupId,
        category: currentGroup.category,
        date: newSessionDate,
        meetingNumber: Number(newMeetingNumber),
        academicYear: '2026',
        attendance: defaultAttendance,
        schoolCode: activeSchoolCode,
        createdBy: profile.name,
        createdAt: new Date().toISOString()
      });

      setShowAddSessionModal(false);
      setRecentlySavedSession({
        id: docRef.id,
        groupId,
        category: currentGroup.category,
        date: newSessionDate,
        meetingNumber: Number(newMeetingNumber),
        academicYear: '2026',
        attendance: defaultAttendance
      });
    } catch (err) {
      console.error('Error creating attendance session:', err);
    }
  };

  // Toggle single student status: '1' -> '0' -> 'x' -> '1'
  const handleToggleCell = async (session: KokoAttendanceSession, studentId: string) => {
    if (!canEdit || !session.id) return;
    const currentStatus = session.attendance?.[studentId] || '1';
    let nextStatus: '1' | '0' | 'x' = '1';
    if (currentStatus === '1') nextStatus = '0';
    else if (currentStatus === '0') nextStatus = 'x';
    else nextStatus = '1';

    const updated = {
      ...session.attendance,
      [studentId]: nextStatus
    };

    try {
      await updateDoc(doc(db, 'koko_attendance', session.id), {
        attendance: updated,
        updatedAt: new Date().toISOString()
      });
      setRecentlySavedSession({ ...session, attendance: updated });
    } catch (err) {
      console.error('Error updating cell:', err);
    }
  };

  // Mark all present
  const handleMarkAllPresent = async (session: KokoAttendanceSession) => {
    if (!canEdit || !session.id) return;
    const updated: Record<string, '1' | '0' | 'x'> = {};
    groupStudents.forEach(st => {
      updated[st.student_id] = '1';
    });

    try {
      await updateDoc(doc(db, 'koko_attendance', session.id), {
        attendance: updated,
        updatedAt: new Date().toISOString()
      });
      setRecentlySavedSession({ ...session, attendance: updated });
    } catch (err) {
      console.error('Error marking all present:', err);
    }
  };

  // Delete session
  const handleDeleteSession = async (sessionId: string) => {
    if (!canEdit) return;
    if (!window.confirm('Adakah anda pasti ingin memadamkan rekod perjumpaan ini?')) return;
    try {
      await deleteDoc(doc(db, 'koko_attendance', sessionId));
      if (recentlySavedSession?.id === sessionId) {
        setRecentlySavedSession(null);
      }
    } catch (err) {
      console.error('Error deleting session:', err);
    }
  };

  // Calculate session stats
  const getSessionStats = (session: KokoAttendanceSession) => {
    let present = 0;
    let absent = 0;
    let excused = 0;

    groupStudents.forEach(st => {
      const status = session.attendance?.[st.student_id] || '0';
      if (status === '1') present++;
      else if (status === '0') absent++;
      else if (status === 'x') excused++;
    });

    const total = present + absent;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
    return { present, absent, excused, total, percentage };
  };

  // Trigger report shortcut
  const handleTriggerReport = (session: KokoAttendanceSession) => {
    if (!currentGroup || !onNavigateToReport) return;
    const stats = getSessionStats(session);
    onNavigateToReport({
      groupId: currentGroup.id || currentGroup.name,
      groupName: currentGroup.name,
      category: currentGroup.category,
      date: session.date,
      meetingNumber: session.meetingNumber || 1,
      present: stats.present,
      absent: stats.absent,
      total: stats.total,
      percentage: stats.percentage
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-600/20 text-emerald-400 rounded-2xl border border-emerald-500/30">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Kehadiran Kokurikulum (12 Perjumpaan KPM)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Perekodan kehadiran mingguan dan penghubung automatik ke Laporan Perjumpaan
              </p>
            </div>
          </div>
        </div>

        {/* Category Switcher */}
        <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-800 shrink-0">
          <button
            onClick={() => setSelectedCategory('uniform')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              selectedCategory === 'uniform'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Unit Beruniform
          </button>
          <button
            onClick={() => setSelectedCategory('club')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              selectedCategory === 'club'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Kelab & Persatuan
          </button>
          <button
            onClick={() => setSelectedCategory('sport')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              selectedCategory === 'sport'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Sukan & Permainan
          </button>
        </div>
      </div>

      {/* Unit Selector Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-400 mr-1 uppercase tracking-wider">Unit:</span>
          {categoryGroups.map(g => {
            const isSelected = g.id === selectedGroupId || g.name === selectedGroupId;
            return (
              <button
                key={g.id || g.name}
                onClick={() => setSelectedGroupId(g.id || g.name)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-white text-slate-950 shadow-md font-black'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <span>{g.name}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-blue-600" />}
              </button>
            );
          })}
        </div>

        {canEdit && currentGroup && (
          <button
            onClick={() => setShowAddSessionModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Sesi Perjumpaan (1-12)</span>
          </button>
        )}
      </div>

      {/* Recently Saved Banner with "Terus Jana Laporan Perjumpaan" Shortcut */}
      {recentlySavedSession && currentGroup && (
        <div className="bg-gradient-to-r from-blue-950/90 to-indigo-950/90 border border-blue-500/50 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 text-white rounded-xl">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">
                Kehadiran <span className="text-blue-300 font-black">Perjumpaan {recentlySavedSession.meetingNumber}</span> ({recentlySavedSession.date}) Disimpan!
              </p>
              <p className="text-[11px] text-slate-300">
                Data kehadiran siap disegerakkan. Anda boleh menjana laporan KPM secara automatik sekarang.
              </p>
            </div>
          </div>

          <button
            onClick={() => handleTriggerReport(recentlySavedSession)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition shadow-lg shrink-0 cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            <span>Terus Jana Laporan Perjumpaan</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Attendance Matrix */}
      {currentGroup && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Matriks Kehadiran:</span>
                <span className="text-blue-400">{currentGroup.name}</span>
                <span className="text-xs font-normal text-slate-400">({groupStudents.length} Ahli)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Petunjuk: <span className="text-emerald-400 font-bold">1 = Hadir</span> | <span className="text-rose-400 font-bold">0 = Tidak Hadir</span> | <span className="text-amber-400 font-bold">x = Bersebab / Pelepasan</span>. Klik petak untuk bertukar.
              </p>
            </div>

            <div className="text-xs text-slate-400 font-mono">
              Jumlah Sesi: <span className="text-white font-bold">{currentGroupSessions.length} / 12</span>
            </div>
          </div>

          {/* Matrix Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-950 text-slate-400 text-[10px] font-black uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-3 text-center border-r border-slate-800 w-12 sticky left-0 bg-slate-950 z-10">Bil</th>
                  <th className="py-3 px-4 border-r border-slate-800 min-w-[180px] sticky left-12 bg-slate-950 z-10">Nama Murid</th>
                  <th className="py-3 px-3 text-center border-r border-slate-800 w-16">Kelas</th>
                  
                  {/* Dynamic Sessions Columns */}
                  {currentGroupSessions.map((session) => (
                    <th key={session.id} className="py-2 px-2 text-center border-r border-slate-800 min-w-[100px]">
                      <div className="flex flex-col items-center">
                        <span className="text-blue-400 font-black">P{session.meetingNumber || '-'}</span>
                        <span className="text-[9px] text-slate-500 font-mono">{session.date.slice(5)}</span>
                        
                        {canEdit && (
                          <div className="flex items-center gap-1 mt-1">
                            <button
                              onClick={() => handleMarkAllPresent(session)}
                              title="Tanda Semua Hadir"
                              className="p-1 hover:bg-slate-800 rounded text-emerald-400"
                            >
                              <CheckSquare className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleTriggerReport(session)}
                              title="Terus Jana Laporan Perjumpaan"
                              className="p-1 hover:bg-blue-900 rounded text-blue-400"
                            >
                              <FileText className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleDeleteSession(session.id!)}
                              title="Padam Sesi"
                              className="p-1 hover:bg-slate-800 rounded text-rose-400"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </th>
                  ))}

                  <th className="py-3 px-3 text-center bg-slate-950 font-black text-slate-200 w-20">
                    % Hadir
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {groupStudents.map((st, idx) => {
                  let attendedCount = 0;
                  let totalCount = 0;

                  return (
                    <tr key={st.student_id} className="hover:bg-slate-800/30 transition">
                      <td className="py-2.5 px-3 text-center font-mono text-slate-500 border-r border-slate-800/60 sticky left-0 bg-slate-900 z-10">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-4 font-bold text-white border-r border-slate-800/60 truncate max-w-[200px] sticky left-12 bg-slate-900 z-10">
                        {st.name}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-400 border-r border-slate-800/60">
                        {st.class}
                      </td>

                      {/* Status Cells */}
                      {currentGroupSessions.map((session) => {
                        const status = session.attendance?.[st.student_id] || '0';
                        if (status === '1') {
                          attendedCount++;
                          totalCount++;
                        } else if (status === '0') {
                          totalCount++;
                        }

                        return (
                          <td 
                            key={session.id} 
                            onClick={() => handleToggleCell(session, st.student_id)}
                            className="py-2 px-2 text-center border-r border-slate-800/60 cursor-pointer select-none transition hover:bg-slate-700/40"
                          >
                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-black ${
                              status === '1'
                                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-600/60'
                                : status === '0'
                                ? 'bg-rose-950/80 text-rose-300 border border-rose-600/60'
                                : 'bg-amber-950/80 text-amber-300 border border-amber-600/60'
                            }`}>
                              {status === '1' ? '1' : status === '0' ? '0' : 'x'}
                            </span>
                          </td>
                        );
                      })}

                      {/* Percentage */}
                      <td className="py-2.5 px-3 text-center font-black font-mono">
                        {totalCount > 0 ? (
                          <span className={Math.round((attendedCount / totalCount) * 100) >= 80 ? 'text-emerald-400' : 'text-amber-400'}>
                            {Math.round((attendedCount / totalCount) * 100)}%
                          </span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {groupStudents.length === 0 && (
                  <tr>
                    <td colSpan={currentGroupSessions.length + 4} className="py-8 text-center text-slate-500 italic">
                      Tiada ahli berdaftar dalam unit ini. Sila daftarkan murid di tab Jawatankuasa & Ahli.
                    </td>
                  </tr>
                )}
              </tbody>

              {/* Summary Footer */}
              {currentGroupSessions.length > 0 && (
                <tfoot className="bg-slate-950 border-t-2 border-slate-700 font-bold text-[11px] text-slate-300">
                  <tr>
                    <td colSpan={3} className="py-3 px-4 text-right uppercase tracking-wider font-black sticky left-0 bg-slate-950 z-10">
                      Peratus Kehadiran Sesi:
                    </td>
                    {currentGroupSessions.map((session) => {
                      const stats = getSessionStats(session);
                      return (
                        <td key={session.id} className="py-3 px-2 text-center border-r border-slate-800 font-mono">
                          <div className="font-black text-emerald-400">{stats.percentage}%</div>
                          <div className="text-[9px] text-slate-500">{stats.present}/{stats.total}</div>
                        </td>
                      );
                    })}
                    <td className="py-3 px-3 text-center bg-slate-950 font-mono">
                      -
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD SESSION ================= */}
      {showAddSessionModal && currentGroup && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">Tambah Sesi Perjumpaan Baru</h3>
              <button onClick={() => setShowAddSessionModal(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase">Unit</label>
              <div className="text-xs font-bold text-white mt-1">{currentGroup.name}</div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase">Bilangan Perjumpaan (1 - 12)</label>
              <select
                value={newMeetingNumber}
                onChange={e => setNewMeetingNumber(Number(e.target.value))}
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(num => (
                  <option key={num} value={num}>Perjumpaan {num}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase">Tarikh Perjumpaan</label>
              <input
                type="date"
                value={newSessionDate}
                onChange={e => setNewSessionDate(e.target.value)}
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddSessionModal(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl"
              >
                Batal
              </button>
              <button
                onClick={handleCreateSession}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl"
              >
                Buka Perekodan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
