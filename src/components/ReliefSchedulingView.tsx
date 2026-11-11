import React, { useState, useEffect, useMemo } from 'react';
import {
  Bell,
  Clock,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  UserCheck,
  Users,
  Search,
  Printer,
  ChevronRight,
  Sparkles,
  ArrowRight,
  Mail,
  ShieldCheck,
  FileSpreadsheet,
  X,
  Send
} from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  setDoc,
  getDocs
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { UserProfile, SchoolSettings } from '../types';
import { BilikGuruReliefView } from './Timetable/BilikGuruReliefView';
import { ScheduleGrid, getGradeDaySlots } from './Timetable/types';
import { createEmptyScheduleGrid } from './Timetable/autoScheduler';

export interface ReliefAlertRecord {
  id: string;
  suratId?: string;
  perkara: string;
  noRujukanLuar: string;
  startDate: string;
  endDate: string;
  absentTeacherIds: string[];
  affectedClasses: Array<{
    teacherId: string;
    classId: string;
    className: string;
    subjectCode: string;
    subjectName: string;
    weeklyPeriods: number;
  }>;
  status: 'PERLU_JADUAL_GANTI' | 'SELESAI_DIJADUAL';
  createdAt: string;
}

export interface ReliefPeriodAssignment {
  slotId: string;
  timeLabel: string;
  grade: number;
  className: string;
  subjectCode: string;
  absentTeacherName: string;
  substituteTeacherId: string;
  substituteTeacherName: string;
}

interface ReliefSchedulingViewProps {
  currentUser?: UserProfile | null;
  schoolSettings?: SchoolSettings | null;
  onNavigateToSuratMasuk?: () => void;
}

export const ReliefSchedulingView: React.FC<ReliefSchedulingViewProps> = ({
  currentUser,
  schoolSettings,
  onNavigateToSuratMasuk,
}) => {
  const [alerts, setAlerts] = useState<ReliefAlertRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedAlert, setSelectedAlert] = useState<ReliefAlertRecord | null>(null);
  const [activeTab, setActiveTab] = useState<'ALERTS' | 'BGURU_MONITOR' | 'HISTORY'>('ALERTS');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });

  // Teachers directory
  const [teacherList, setTeacherList] = useState<Array<{ id: string; name: string; email: string; code: string; phone?: string }>>([]);
  const [scheduleGrid, setScheduleGrid] = useState<ScheduleGrid>(createEmptyScheduleGrid());

  // Modal for Scheduling
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState<boolean>(false);
  const [activeAlertForSchedule, setActiveAlertForSchedule] = useState<ReliefAlertRecord | null>(null);
  const [slotAssignments, setSlotAssignments] = useState<Record<string, string>>({}); // key: classId_period -> substituteTeacherId
  const [submittingSchedule, setSubmittingSchedule] = useState<boolean>(false);

  // Print slip state
  const [printSlipData, setPrintSlipData] = useState<{
    date: string;
    absentTeacher: string;
    reason: string;
    letterRef: string;
    assignments: Array<{
      period: string;
      className: string;
      subject: string;
      substituteName: string;
    }>;
  } | null>(null);

  // 1. Subscribe to relief_alerts_from_surat
  useEffect(() => {
    const q = query(collection(db, 'relief_alerts_from_surat'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ReliefAlertRecord[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...(d.data() as Omit<ReliefAlertRecord, 'id'>) });
        });
        setAlerts(list);
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to relief_alerts_from_surat:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // 2. Fetch Teachers and Timetable Schedule from Firestore
  useEffect(() => {
    let isMounted = true;
    async function loadDirectoryAndSchedule() {
      try {
        const [usersSnap, personnelSnap, timetableSnap] = await Promise.all([
          getDocs(collection(db, 'users')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'personnel')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'school_timetables')).catch(() => ({ docs: [] })),
        ]);

        const map = new Map<string, { id: string; name: string; email: string; code: string; phone?: string }>();
        personnelSnap.docs.forEach((d, idx) => {
          const data = d.data();
          const cleanName = data.name || data.fullName || d.id;
          const code = cleanName.slice(0, 3).toUpperCase();
          map.set(d.id, {
            id: d.id,
            name: cleanName,
            email: data.email || '',
            code,
            phone: data.phone || data.mobilePhone || '',
          });
        });

        usersSnap.docs.forEach((d) => {
          const data = d.data();
          if (!map.has(d.id)) {
            const cleanName = data.name || d.id;
            map.set(d.id, {
              id: d.id,
              name: cleanName,
              email: data.email || '',
              code: cleanName.slice(0, 3).toUpperCase(),
              phone: data.phone || '',
            });
          }
        });

        // Load timetable schedule if exists
        let loadedSchedule: ScheduleGrid = createEmptyScheduleGrid();
        if (timetableSnap.docs.length > 0) {
          const tDoc = timetableSnap.docs[0];
          const tData = tDoc.data();
          if (tData && 'schedule' in tData && tData.schedule) {
            loadedSchedule = tData.schedule as ScheduleGrid;
          }
        }

        if (isMounted) {
          setTeacherList(Array.from(map.values()));
          setScheduleGrid(loadedSchedule);
        }
      } catch (err) {
        console.warn('Load teachers/schedule error in ReliefSchedulingView:', err);
      }
    }

    loadDirectoryAndSchedule();
    return () => {
      isMounted = false;
    };
  }, []);

  const pendingAlerts = useMemo(() => {
    return alerts.filter((a) => a.status === 'PERLU_JADUAL_GANTI');
  }, [alerts]);

  const teacherMappingList = useMemo(() => {
    return {
      list: teacherList.map((t, i) => ({
        id: t.id,
        num: i + 1,
        code: t.code,
        name: t.name,
      })),
    };
  }, [teacherList]);

  // Handle opening 1-Click scheduling modal
  const handleOpenScheduleModal = (alertItem: ReliefAlertRecord) => {
    setActiveAlertForSchedule(alertItem);
    setSelectedAlert(alertItem);
    // Pre-populate with first available teacher
    const initialMap: Record<string, string> = {};
    alertItem.affectedClasses.forEach((cls, i) => {
      const otherTeachers = teacherList.filter(
        (t) => !alertItem.absentTeacherIds.includes(t.id) && !alertItem.absentTeacherIds.includes(t.name)
      );
      if (otherTeachers.length > 0) {
        // distribute among available teachers
        const candidate = otherTeachers[i % otherTeachers.length];
        initialMap[`${cls.classId}_${cls.subjectCode}`] = candidate.id;
      }
    });
    setSlotAssignments(initialMap);
    setIsScheduleModalOpen(true);
  };

  // Save 1-Click scheduled relief
  const handleSaveReliefSchedule = async () => {
    if (!activeAlertForSchedule) return;
    try {
      setSubmittingSchedule(true);
      const scheduleId = `relief_sched_${Date.now()}`;

      const assignments = activeAlertForSchedule.affectedClasses.map((cls, idx) => {
        const assignedTId = slotAssignments[`${cls.classId}_${cls.subjectCode}`];
        const teacherObj = teacherList.find((t) => t.id === assignedTId);
        return {
          period: `Waktu ${idx + 1} (07:45 - 08:45)`,
          classId: cls.classId,
          className: cls.className,
          subjectCode: cls.subjectCode,
          subjectName: cls.subjectName,
          substituteTeacherId: assignedTId || '',
          substituteName: teacherObj?.name || 'GURU GANTI',
        };
      });

      // 1. Save record into relief_schedules
      await setDoc(doc(db, 'relief_schedules', scheduleId), {
        id: scheduleId,
        alertId: activeAlertForSchedule.id,
        suratId: activeAlertForSchedule.suratId || '',
        perkara: activeAlertForSchedule.perkara,
        noRujukanLuar: activeAlertForSchedule.noRujukanLuar,
        date: activeAlertForSchedule.startDate,
        absentTeacherIds: activeAlertForSchedule.absentTeacherIds,
        assignments,
        scheduledByUid: currentUser?.uid || auth.currentUser?.uid || 'system',
        scheduledByName: currentUser?.name || auth.currentUser?.displayName || 'Pentadbir Jadual Ganti',
        createdAt: new Date().toISOString(),
      });

      // 2. Update status in relief_alerts_from_surat
      await updateDoc(doc(db, 'relief_alerts_from_surat', activeAlertForSchedule.id), {
        status: 'SELESAI_DIJADUAL',
        reliefScheduleId: scheduleId,
        updatedAt: new Date().toISOString(),
      });

      // Prepare print slip data
      const absentNames = activeAlertForSchedule.absentTeacherIds
        .map((id) => teacherList.find((t) => t.id === id)?.name || id)
        .join(', ');

      setPrintSlipData({
        date: activeAlertForSchedule.startDate,
        absentTeacher: absentNames,
        reason: activeAlertForSchedule.perkara,
        letterRef: activeAlertForSchedule.noRujukanLuar,
        assignments: assignments.map((a) => ({
          period: a.period,
          className: a.className,
          subject: `${a.subjectCode} - ${a.subjectName}`,
          substituteName: a.substituteName,
        })),
      });

      setIsScheduleModalOpen(false);
      setActiveAlertForSchedule(null);
    } catch (err: any) {
      console.error('Error saving relief schedule:', err);
      alert(`Gagal menyimpan jadual ganti: ${err.message}`);
    } finally {
      setSubmittingSchedule(false);
    }
  };

  const getAbsentTeacherNames = (ids: string[]) => {
    return ids
      .map((id) => teacherList.find((t) => t.id === id)?.name || id)
      .join(', ');
  };

  return (
    <div className="flex-1 flex flex-col gap-6 max-w-7xl w-full mx-auto font-sans">
      {/* ================= TOP PROMINENT LIVE ALERT BANNER ================= */}
      {pendingAlerts.length > 0 && (
        <div className="bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/80 border-2 border-amber-500/50 rounded-3xl p-5 sm:p-6 shadow-2xl relative overflow-hidden print:hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
            <div className="flex items-start gap-3.5">
              <div className="p-3 bg-amber-500/20 border border-amber-500/40 rounded-2xl text-amber-300 animate-pulse shrink-0">
                <Bell className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500 text-black">
                    Live Alert Dari Surat Masuk (PO)
                  </span>
                  <span className="text-xs text-amber-200 font-mono font-bold">
                    {pendingAlerts.length} Guru Tidak Hadir Perlu Jadual Ganti
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-white mt-1">
                  Permintaan Jadual Ganti Automatik (Relief) Dikesan
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Pembantu Operasi (PO) telah mendaftarkan surat rasmi berkaitan mesyuarat/kursus luar. Klik butang 1-Klik di bawah untuk menetapkan guru ganti bagi kelas terjejas.
                </p>
              </div>
            </div>

            {onNavigateToSuratMasuk && (
              <button
                type="button"
                onClick={onNavigateToSuratMasuk}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-2xl text-xs font-bold flex items-center gap-2 border border-slate-700 transition cursor-pointer self-start md:self-auto"
              >
                <Mail className="w-3.5 h-3.5 text-blue-400" />
                <span>Lihat Daftar Surat Masuk</span>
              </button>
            )}
          </div>

          {/* Cards for each pending alert */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendingAlerts.map((alertItem) => {
              const absentNames = getAbsentTeacherNames(alertItem.absentTeacherIds);
              return (
                <div
                  key={alertItem.id}
                  className="bg-slate-950/80 border border-amber-500/30 rounded-2xl p-4 flex flex-col justify-between space-y-3 hover:border-amber-400/60 transition"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="text-amber-300 font-bold">
                        📅 {alertItem.startDate === alertItem.endDate ? alertItem.startDate : `${alertItem.startDate} hingga ${alertItem.endDate}`}
                      </span>
                      <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
                        Perlu Relief
                      </span>
                    </div>

                    <div className="font-extrabold text-white text-xs line-clamp-2">
                      {alertItem.perkara}
                    </div>

                    <div className="text-[11px] text-slate-300">
                      <span className="text-slate-400 font-medium">Guru Terlibat: </span>
                      <span className="font-bold text-amber-200">{absentNames || 'Guru Akademik'}</span>
                    </div>

                    <div className="text-[10px] font-mono text-slate-400">
                      Ruj: {alertItem.noRujukanLuar}
                    </div>

                    {/* Affected classes pill */}
                    <div className="pt-1 flex flex-wrap gap-1">
                      {alertItem.affectedClasses.length > 0 ? (
                        alertItem.affectedClasses.map((cls, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800/60 text-[10px] font-bold"
                          >
                            {cls.className} ({cls.subjectCode})
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-slate-500 italic">
                          (Semua jadual kelas hari tersebut)
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenScheduleModal(alertItem)}
                    className="w-full py-2 px-3 bg-amber-500 hover:bg-amber-400 text-black font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 transition cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Jadualkan Guru Ganti (1-Klik)</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= HEADER CONTROL BAR ================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Pengurusan Waktu Lapang & Guru Ganti
            </span>
            <span className="text-xs text-slate-400">Penyegerakan Automatik Surat Masuk</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white mt-1 flex items-center gap-2.5">
            <Clock className="w-6 h-6 text-emerald-400" />
            <span>Jadual Ganti (Relief Scheduling) & BGuru</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Mengenal pasti guru yang tiada kelas pada waktu tertentu dan mengagihkan waktu guru ganti dengan pantas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('ALERTS')}
              className={`px-3.5 py-1.5 rounded-xl transition cursor-pointer ${
                activeTab === 'ALERTS'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Semua Permintaan ({alerts.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('BGURU_MONITOR')}
              className={`px-3.5 py-1.5 rounded-xl transition cursor-pointer ${
                activeTab === 'BGURU_MONITOR'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-emerald-300'
              }`}
            >
              Semakan Waktu Lapang (BGuru)
            </button>
          </div>

          {onNavigateToSuratMasuk && (
            <button
              type="button"
              onClick={onNavigateToSuratMasuk}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl text-xs font-bold transition cursor-pointer"
            >
              <Mail className="w-4 h-4 text-blue-400" />
              <span>Daftar Surat Masuk</span>
            </button>
          )}
        </div>
      </div>

      {/* ================= TAB 1: ALL RELIEF ALERTS TABLE ================= */}
      {activeTab === 'ALERTS' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4 print:hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Senarai Permintaan Jadual Ganti Mengikut Surat Masuk
              </h3>
              <p className="text-xs text-slate-400">
                Penyelarasan automatik sebaik sahaja Pembantu Operasi merekodkan surat rasmi.
              </p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Cari perkara / guru..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400 font-mono">
              Memuatkan senarai permintaan guru ganti...
            </div>
          ) : alerts.length === 0 ? (
            <div className="py-12 text-center space-y-2 text-slate-400 text-xs">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
              <p className="font-bold text-slate-300">Tiada permintaan guru ganti aktif pada masa ini.</p>
              <p>Apabila PO merekodkan surat masuk dengan tanda "Perlu Hadir", ia akan dipaparkan di sini secara automatik.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                    <th className="py-3 px-3 w-12 text-center">Bil.</th>
                    <th className="py-3 px-3 w-28">Tarikh</th>
                    <th className="py-3 px-4">Perkara / No. Rujukan</th>
                    <th className="py-3 px-4 w-48">Guru Bertugas Luar</th>
                    <th className="py-3 px-4">Kelas & Mata Pelajaran Terjejas</th>
                    <th className="py-3 px-3 w-28 text-center">Status</th>
                    <th className="py-3 px-3 w-32 text-right">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {alerts
                    .filter((a) => {
                      if (!searchQuery.trim()) return true;
                      const q = searchQuery.toLowerCase();
                      return (
                        a.perkara.toLowerCase().includes(q) ||
                        a.noRujukanLuar.toLowerCase().includes(q) ||
                        getAbsentTeacherNames(a.absentTeacherIds).toLowerCase().includes(q)
                      );
                    })
                    .map((item, index) => {
                      const isPending = item.status === 'PERLU_JADUAL_GANTI';
                      const absentNames = getAbsentTeacherNames(item.absentTeacherIds);
                      return (
                        <tr key={item.id} className="hover:bg-slate-800/40 align-top">
                          <td className="py-3.5 px-3 text-center font-mono font-bold text-slate-400">
                            {index + 1}.
                          </td>
                          <td className="py-3.5 px-3 font-mono font-bold text-slate-200">
                            {item.startDate}
                          </td>
                          <td className="py-3.5 px-4 space-y-1">
                            <div className="font-extrabold text-white leading-snug">
                              {item.perkara}
                            </div>
                            <div className="text-[11px] font-mono text-indigo-300">
                              {item.noRujukanLuar}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-200">
                            {absentNames || '-'}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex flex-wrap gap-1">
                              {item.affectedClasses.length > 0 ? (
                                item.affectedClasses.map((cls, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800 text-[10px] font-mono font-bold"
                                  >
                                    {cls.className} ({cls.subjectCode})
                                  </span>
                                ))
                              ) : (
                                <span className="text-slate-500 italic text-[11px]">
                                  Jadual harian umum
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-3 text-center">
                            {isPending ? (
                              <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-extrabold uppercase">
                                Belum Dijadual
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-extrabold uppercase">
                                Selesai Dijadual
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-3 text-right">
                            {isPending ? (
                              <button
                                type="button"
                                onClick={() => handleOpenScheduleModal(item)}
                                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold inline-flex items-center gap-1 transition cursor-pointer"
                              >
                                <Sparkles className="w-3 h-3" />
                                <span>Jadualkan</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedAlert(item);
                                  // Open view / slip
                                  setPrintSlipData({
                                    date: item.startDate,
                                    absentTeacher: absentNames,
                                    reason: item.perkara,
                                    letterRef: item.noRujukanLuar,
                                    assignments: item.affectedClasses.map((c, i) => ({
                                      period: `Waktu ${i + 1}`,
                                      className: c.className,
                                      subject: `${c.subjectCode} - ${c.subjectName}`,
                                      substituteName: 'Guru Bertugas',
                                    })),
                                  });
                                }}
                                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold inline-flex items-center gap-1 transition cursor-pointer"
                              >
                                <Printer className="w-3 h-3" />
                                <span>Slip Ganti</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 2: BILIK GURU LIVE RELIEF MONITOR ================= */}
      {activeTab === 'BGURU_MONITOR' && (
        <div className="space-y-4">
          <BilikGuruReliefView
            schedule={scheduleGrid}
            academicYear="2027"
            teacherMapping={teacherMappingList}
            displayMode="CODE"
          />
        </div>
      )}

      {/* ================= MODAL: 1-CLICK GURU GANTI SCHEDULING ================= */}
      {isScheduleModalOpen && activeAlertForSchedule && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 print:hidden">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 space-y-5 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  <span>Jadualkan Guru Ganti (1-Klik Auto)</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Tetapkan guru ganti bagi kelas terjejas akibat ketiadaan guru menghadiri mesyuarat/kursus rasmi.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsScheduleModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs">
              <div className="font-bold text-amber-300">
                📌 {activeAlertForSchedule.perkara}
              </div>
              <div className="text-slate-400">
                <span>Tarikh: </span>
                <strong className="text-white">{activeAlertForSchedule.startDate}</strong>
                <span className="mx-2">|</span>
                <span>Ruj. Surat: </span>
                <strong className="text-white">{activeAlertForSchedule.noRujukanLuar}</strong>
              </div>
              <div className="text-slate-400">
                <span>Guru Tidak Hadir: </span>
                <strong className="text-rose-300">
                  {getAbsentTeacherNames(activeAlertForSchedule.absentTeacherIds)}
                </strong>
              </div>
            </div>

            {/* List of affected classes & substitute selector */}
            <div className="space-y-3">
              <div className="font-bold text-white text-xs uppercase tracking-wider flex items-center justify-between">
                <span>Senarai Kelas & Penugasan Guru Ganti</span>
                <span className="text-[11px] text-emerald-400">
                  ✔ Dicadangkan secara automatik daripada guru yang berkelapangan
                </span>
              </div>

              <div className="space-y-2">
                {activeAlertForSchedule.affectedClasses.map((cls, idx) => {
                  const key = `${cls.classId}_${cls.subjectCode}`;
                  const currentAssigned = slotAssignments[key] || '';
                  const otherTeachers = teacherList.filter(
                    (t) =>
                      !activeAlertForSchedule.absentTeacherIds.includes(t.id) &&
                      !activeAlertForSchedule.absentTeacherIds.includes(t.name)
                  );

                  return (
                    <div
                      key={key}
                      className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">
                            {cls.className}
                          </span>
                          <span className="px-2 py-0.5 bg-blue-950 text-blue-300 border border-blue-800/60 rounded font-mono text-[10px] font-bold">
                            {cls.subjectCode} - {cls.subjectName}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Waktu {idx + 1} (Agihan Mingguan: {cls.weeklyPeriods} waktu)
                        </div>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-64">
                        <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                        <select
                          value={currentAssigned}
                          onChange={(e) =>
                            setSlotAssignments((prev) => ({
                              ...prev,
                              [key]: e.target.value,
                            }))
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white font-bold"
                        >
                          {otherTeachers.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsScheduleModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={submittingSchedule}
                onClick={handleSaveReliefSchedule}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {submittingSchedule ? 'Menyimpan Jadual Ganti...' : 'Sahkan & Jana Slip Guru Ganti'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL / PRINT VIEW: SLIP GURU GANTI ================= */}
      {printSlipData && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto print:p-0 print:border-none print:bg-white print:max-w-none">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 print:hidden">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Printer className="w-5 h-5 text-emerald-400" />
                <span>Slip Penugasan Guru Ganti (KPM)</span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak Slip</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintSlipData(null)}
                  className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Slip Paper Sheet (Word/Print format) */}
            <div className="bg-white text-black p-6 rounded-xl border border-black text-xs font-sans space-y-4">
              <div className="text-center border-b border-black pb-3">
                <div className="font-bold text-sm uppercase">
                  {schoolSettings?.schoolName || 'SJK(C) CHUNG HUA BALINGIAN'}
                </div>
                <div className="text-[11px] font-bold text-slate-800 uppercase mt-0.5">
                  SLIP GURU GANTI (JADUAL RELIEF)
                </div>
                <div className="text-[10px] text-slate-600 mt-0.5">
                  Tarikh: <strong>{printSlipData.date}</strong> | Ruj. Surat: <strong>{printSlipData.letterRef}</strong>
                </div>
              </div>

              <div className="text-[11px] space-y-1">
                <div>
                  Guru Tidak Hadir: <strong>{printSlipData.absentTeacher}</strong>
                </div>
                <div>
                  Sebab: <strong>{printSlipData.reason}</strong>
                </div>
              </div>

              <table className="w-full border-collapse border border-black text-[11px]">
                <thead>
                  <tr className="border-b border-black font-bold text-center bg-slate-100">
                    <th className="border border-black py-1.5 px-2">Waktu / Masa</th>
                    <th className="border border-black py-1.5 px-2">Kelas</th>
                    <th className="border border-black py-1.5 px-2">Mata Pelajaran</th>
                    <th className="border border-black py-1.5 px-2">Guru Ganti Ditugaskan</th>
                    <th className="border border-black py-1.5 px-2 w-20">T.Tangan</th>
                  </tr>
                </thead>
                <tbody>
                  {printSlipData.assignments.map((item, i) => (
                    <tr key={i}>
                      <td className="border border-black py-2 px-2 text-center font-bold">
                        {item.period}
                      </td>
                      <td className="border border-black py-2 px-2 text-center font-bold">
                        {item.className}
                      </td>
                      <td className="border border-black py-2 px-2">
                        {item.subject}
                      </td>
                      <td className="border border-black py-2 px-2 font-bold text-center">
                        {item.substituteName}
                      </td>
                      <td className="border border-black py-2 px-2 text-center">
                        &nbsp;
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-between items-end pt-6 text-[10px]">
                <div>
                  Disediakan oleh:<br /><br /><br />
                  ____________________________<br />
                  (Penyelaras Jadual Waktu / PO)
                </div>
                <div>
                  Disahkan oleh:<br /><br /><br />
                  ____________________________<br />
                  (Guru Besar / PK Pentadbiran)
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
