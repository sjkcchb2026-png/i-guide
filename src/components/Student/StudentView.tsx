
import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, Student, UasaResult, PbdResult } from '../../types';
import { SCHOOL_NAME_MS } from '../../constants';
import { PbdBadge, UasaBadge } from '../Academic/AcademicBadges';
import {
  getPbdStatus,
  getPbdSemanticColor,
  getUasaGrade,
  getUasaGradeInterpretation,
  getUasaSemanticColor,
  ACADEMIC_COLOR_TOKENS,
} from '../../utils/academicVisualStandard';
import SchoolLogo from '../SchoolLogo';
import { 
  Sparkles, Trophy, Brain, Target, ArrowRight, Clock, 
  Activity, CheckCircle2, HeartHandshake, BookOpen, Users, 
  Award, ShieldAlert, Megaphone, UserCheck, Calendar,
  TrendingUp, Smile, Compass, Check, X, Shield, Plus, Info, Zap, AlertCircle
} from 'lucide-react';
import { getRecommendations } from '../../services/aiService';
import { motion, AnimatePresence } from 'motion/react';
import { TakwimEvent } from '../../types/pentadbiran';
import { INITIAL_EVENTS } from '../Pentadbiran/TakwimView';

interface Props {
  profile: UserProfile;
}

export default function StudentView({ profile }: Props) {
  // Primary navigation tab
  const [activeTab, setActiveTab] = useState<'kurikulum' | 'makluman' | 'hem' | 'kokurikulum'>('makluman');
  
  // Student selection / linking state
  const [student, setStudent] = useState<Student | null>(null);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Core datasets
  const [uasa, setUasa] = useState<UasaResult[]>([]);
  const [pbd, setPbd] = useState<PbdResult[]>([]);
  const [kokoMembership, setKokoMembership] = useState<any>(null);
  const [kokoAttendance, setKokoAttendance] = useState<any[]>([]);
  const [kokoActivities, setKokoActivities] = useState<any[]>([]);
  
  // Week's announcements & events
  const [bulletins, setBulletins] = useState<any[]>([]);
  const [takwimEvents, setTakwimEvents] = useState<TakwimEvent[]>([]);
  
  // Custom term selector for academic views
  const [term, setTerm] = useState(1);
  const [aiRecs, setAiRecs] = useState<string | null>(null);
  const [fetchingRecs, setFetchingRecs] = useState(false);

  // Load all students for the "Demo/Simulation Selector" in case the logged-in email doesn't have a direct student record match
  useEffect(() => {
    const loadAllStudents = async () => {
      try {
        const snap = await getDocs(collection(db, 'students'));
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
        setAllStudents(list);
      } catch (err) {
        console.error("Error retrieving student database:", err);
      }
    };
    loadAllStudents();
  }, []);

  // Fetch student data on mount or change of student/term
  useEffect(() => {
    fetchStudentData();
    fetchBulletinsAndTakwim();
  }, [profile, term, student?.student_id]);

  // If student is not bound, try to auto-match profile email or profile name with students
  useEffect(() => {
    if (allStudents.length > 0 && !student) {
      const match = allStudents.find(s => 
        (s.email && profile.email && s.email.toLowerCase().trim() === profile.email.toLowerCase().trim()) || 
        (s.name.toUpperCase() === profile.name.toUpperCase())
      );
      if (match) {
        setStudent(match);
      } else {
        if (profile.role === 'student') {
          // If they are a student, do not fallback to someone else's grades
          setStudent(null);
        } else {
          // Auto-select the first student as active for test/demo mode for teachers/admins
          setStudent(allStudents[0]);
        }
      }
      setLoading(false);
    } else if (allStudents.length === 0) {
      const timer = setTimeout(() => setLoading(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [allStudents, profile]);

  // Subscribe to bulletins in real-time from Firestore
  useEffect(() => {
    const q = query(collection(db, 'bulletins'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const list = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setBulletins(list);
      }
    }, (error) => {
      console.error("Error loading bulletins in StudentView:", error);
    });
    return () => unsubscribe();
  }, []);

  const fetchBulletinsAndTakwim = () => {
    // 1. Fetch bulletins from localStorage or load defaults
    const storedBulletins = localStorage.getItem('saps_plus_bulletin');
    if (storedBulletins) {
      try {
        setBulletins(JSON.parse(storedBulletins));
      } catch (e) {
        // Fallback is handled by the onSnapshot listener above
      }
    }

    // 2. Fetch takwim_v2 from localStorage or load INITIAL_EVENTS
    const storedTakwim = localStorage.getItem('saps_plus_takwim_v2') || localStorage.getItem('saps_plus_takwim');
    if (storedTakwim) {
      try {
        setTakwimEvents(JSON.parse(storedTakwim));
      } catch (e) {
        setTakwimEvents(INITIAL_EVENTS);
      }
    } else {
      setTakwimEvents(INITIAL_EVENTS);
    }
  };

  const fetchStudentData = async () => {
    const activeStudentId = student?.student_id;
    if (!activeStudentId) return;

    try {
      // 1. Fetch academic results - UASA
      const qU = query(collection(db, 'uasa_results'), 
        where('student_id', '==', activeStudentId),
        where('term', '==', term)
      );
      const uSnap = await getDocs(qU);
      setUasa(uSnap.docs.map(doc => doc.data() as UasaResult));

      // 2. Fetch academic results - PBD
      const qP = query(collection(db, 'pbd_results'), 
        where('student_id', '==', activeStudentId)
      );
      const pSnap = await getDocs(qP);
      setPbd(pSnap.docs.map(doc => doc.data() as PbdResult));

      // 3. Fetch Koko Membership
      const qM = query(collection(db, 'koko_memberships'), where('student_id', '==', activeStudentId));
      const mSnap = await getDocs(qM);
      if (!mSnap.empty) {
        setKokoMembership(mSnap.docs[0].data());
      } else {
        setKokoMembership(null);
      }

      // 4. Fetch Koko Attendance database entries
      const qAtt = query(collection(db, 'koko_attendance'));
      const attSnap = await getDocs(qAtt);
      setKokoAttendance(attSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

      // 5. Fetch Koko Activities & Tournament results
      const qAct = query(collection(db, 'koko_activities'));
      const actSnap = await getDocs(qAct);
      setKokoActivities(actSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (err) {
      console.error("Error details loading student dashboard data:", err);
    }
  };

  const fetchAIInsights = async () => {
    if (uasa.length === 0) return;
    setFetchingRecs(true);
    const context = uasa.map(r => `${r.subject_id}: ${r.marks} % (${r.grade})`).join(', ');
    const recs = await getRecommendations(context);
    setAiRecs(recs);
    setFetchingRecs(false);
  };

  // Helper calculation details for this week
  // Using metadata time June 20, 2026 as pivot context
  const getWeekRange = (pivotDate: Date) => {
    const d = new Date(pivotDate);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for sunday
    const monday = new Date(d.setDate(diff));
    monday.setHours(0,0,0,0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23,59,59,999);
    return { monday, sunday };
  };

  const isEventInCurrentWeek = (dateStr: string) => {
    const today = new Date('2026-06-20');
    const { monday, sunday } = getWeekRange(today);
    const testDate = new Date(dateStr);
    return testDate >= monday && testDate <= sunday;
  };

  // Filter lists matching this week's activities
  const currentWeekTakwim = takwimEvents.filter(ev => isEventInCurrentWeek(ev.startDate));
  const currentWeekBulletins = bulletins.filter(b => isEventInCurrentWeek(b.date || '2026-06-20'));

  // Calculate actual individual co-curricular attendance percentage
  const calculateKokoAttendanceRate = (category: 'uniform' | 'club' | 'sport', groupName: string) => {
    if (!student || !groupName) return { present: 10, total: 10, percent: 100, absent: 0, excused: 0 };
    
    // Clean string name
    const groupNameClean = groupName.split('(')[0].trim().toLowerCase();

    const categorySessions = kokoAttendance.filter(session => {
      const normalId = String(session.groupId || '').toLowerCase();
      const matchesGroup = normalId.includes(groupNameClean) || groupNameClean.includes(normalId);
      return session.category === category && matchesGroup;
    });

    let present = 0;
    let absent = 0;
    let excused = 0;

    categorySessions.forEach(session => {
      const status = session.attendance?.[student.student_id];
      if (status === '1') present++;
      else if (status === '0') absent++;
      else if (status === 'x') excused++;
    });

    const total = present + absent + excused;
    const percent = total > 0 ? Math.round(((present + excused) / total) * 100) : 0;

    return { present, absent, excused, total, percent };
  };

  // Extract student's registered activities and achievements listed by teachers
  const getRegisteredAchievementsList = () => {
    if (!student) return [];
    const sName = student.name.toUpperCase();

    const matchedActivities = kokoActivities.filter(act => {
      const inDetails = act.pencapaianDetails?.some((pd: any) => 
        pd.studentNames?.some((n: string) => String(n).toUpperCase() === sName)
      );
      const inNames = act.studentNames && String(act.studentNames).toUpperCase().includes(sName);
      return inDetails || inNames;
    });

    const formattedList = matchedActivities.map(act => {
      let prize = act.achievement || 'Sijil Penyertaan Cemerlang';
      // Seek precise achievement from levels
      if (act.pencapaianDetails) {
        const item = act.pencapaianDetails.find((pd: any) => 
          pd.studentNames?.some((n: string) => String(n).toUpperCase() === sName)
        );
        if (item) {
          prize = `${item.level || ''} • ${item.achievement || 'Tahap Kepujian'}`;
        }
      }
      return {
        id: act.id || Math.random().toString(),
        name: act.programName,
        organizer: act.organizer,
        level: act.level,
        date: act.date,
        prize: prize
      };
    });

    return formattedList;
  };

  const studentAchievements = getRegisteredAchievementsList();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 bg-slate-50 min-h-[50vh] rounded-[40px] border border-slate-200">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600 mb-4" />
        <p className="text-xs font-mono font-black text-slate-500 uppercase tracking-widest">Menyelaras Profil Portal Murid SJK(C) Ek Hua...</p>
      </div>
    );
  }

  // Fallback demo matching to guarantee layout displays if student records hasn't been loaded
  const displayStudent = student || (allStudents.length > 0 && profile.role !== 'student' ? allStudents[0] : {
    id: 'demo-st',
    student_id: 'S26201',
    name: (profile.name || 'PELAJAR DEMO').toUpperCase(),
    class: 'JUJUR',
    year: 5,
    academic_year: '2026',
    gender: 'L',
    race: 'Cina'
  } as Student);

  return (
    <div className="space-y-8 pb-20">
      
      {profile.role === 'student' && !student && (
        <div className="bg-rose-950/30 border border-rose-850/60 rounded-[28px] p-6 text-rose-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="space-y-1">
            <h4 className="text-sm font-black uppercase tracking-tight text-white flex items-center gap-2">
              <AlertCircle size={16} className="text-rose-500 animate-pulse" />
              SINKRONISASI EMEL BELUM LENGKAP
            </h4>
            <p className="text-xs text-rose-300 leading-relaxed font-sans max-w-2xl">
              Alamat emel DELIMa anda (<span className="font-bold text-white">{profile.email}</span>) belum dipadankan dengan mana-mana data murid berdaftar dalam pangkalan data sistem iSEPADU AI. Sila maklumkan kepada Guru Kelas anda untuk mendaftarkan emel anda dalam sistem bagi mendapatkan data yang betul.
            </p>
          </div>
          <div className="px-4 py-2 bg-rose-500/20 rounded-xl border border-rose-500/30 text-[10px] font-black uppercase tracking-widest text-rose-300 shrink-0">
            Hubungi Guru Kelas
          </div>
        </div>
      )}
      
      {/* Header Profile Dashboard */}
      <div className="bg-slate-950 p-6 md:p-8 rounded-[36px] border border-slate-800 shadow-2xl relative overflow-hidden">
        {/* Decorative Grid vector in background */}
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-20 pointer-events-none" />
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="p-3 bg-blue-600/10 rounded-2xl border border-blue-500/10 text-blue-400">
              <SchoolLogo className="w-14 h-14" p="p-0.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black tracking-widest text-blue-400 uppercase bg-blue-500/15 p-1 px-2.5 rounded-md border border-blue-500/10 leading-none">
                  SJK(C) EK HUA MUKAH
                </span>
                <span className="text-[9px] font-black tracking-widest text-emerald-400 uppercase bg-emerald-500/15 p-1 px-2.5 rounded-md border border-emerald-500/10 leading-none">
                  SMART SCHOOL SYSTEM
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-black italic uppercase tracking-tighter text-white mt-1.5 flex items-center gap-2.5 leading-none">
                PORTAL INTEGRASI MURID
              </h1>
              <p className="text-slate-400 text-xs font-bold font-mono tracking-wider mt-1 uppercase">
                Selamat Datang, <span className="text-white font-extrabold">{displayStudent.name}</span> • ID: <span className="text-blue-300 font-extrabold">{displayStudent.student_id}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Class Tag Info */}
            <div className="bg-slate-900 border border-slate-800 p-3 px-5 rounded-2xl font-mono text-center">
              <span className="block text-[9px] font-black text-slate-500 uppercase tracking-widest">KELAS SEMASA</span>
              <span className="block text-sm font-black text-white uppercase mt-0.5">TAHUN {displayStudent.year} {displayStudent.class}</span>
            </div>

            {/* Test match selector for admins and teachers evaluating student's perspectives */}
            {allStudents.length > 1 && profile.role !== 'student' && (
              <div className="bg-slate-900 border border-slate-800 p-2 rounded-2xl flex items-center gap-2">
                <span className="text-[9px] ml-2 font-black text-slate-400 uppercase font-mono tracking-widest shrink-0">MURID:</span>
                <select
                  value={displayStudent.id}
                  onChange={(e) => {
                    const sel = allStudents.find(s => s.id === e.target.value);
                    if (sel) {
                      setStudent(sel);
                      setAiRecs(null); // reset AI Interventions for next student
                    }
                  }}
                  className="bg-slate-950 border border-slate-800 text-white rounded-xl p-1.5 px-3 text-[10.5px] font-bold cursor-pointer max-w-[180px] outline-none"
                >
                  {allStudents.map(st => (
                    <option key={st.id} value={st.id}>{st.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Floating simulation mode label for sandbox clarity */}
        <div className="border-t border-slate-900 mt-6 pt-5 flex items-center justify-between text-[10px] text-slate-500 font-mono">
          <span className="flex items-center gap-1.5">
            <Clock size={12} className="text-blue-500" />
            TARIKH SIMULASI UTAMA: <span className="font-black text-slate-300 uppercase">2026-06-20 (SABTU, MINGGU 12)</span>
          </span>
          <span className="text-blue-400/80 font-bold uppercase tracking-wider hidden md:inline">
            Akses Data Selamat • Enkripsi Penuh Pangkalan Data
          </span>
        </div>
      </div>

      {/* Tabs Panels Navigation Row */}
      <div className="flex flex-wrap items-center bg-white p-2 rounded-[24px] border border-slate-200 shadow-sm gap-1.5">
        {[
          { tab: 'makluman', label: '📢 Makluman Sesi', desc: 'Aktiviti Minggu Ini', color: 'text-blue-600 bg-blue-50/80 border-blue-100' },
          { tab: 'kurikulum', label: '🎓 Kurikulum & PBD', desc: 'Prestasi Akademik', color: 'text-teal-600 bg-teal-50/80 border-teal-100' },
          { tab: 'hem', label: '💖 Kebajikan & HEM', desc: 'Disiplin & Kesihatan', color: 'text-emerald-700 bg-emerald-50/85 border-emerald-100' },
          { tab: 'kokurikulum', label: '🏆 Kokurikulum', desc: 'Kelab & Penglibatan', color: 'text-purple-600 bg-purple-50/80 border-purple-100' },
        ].map((item) => {
          const isActive = activeTab === item.tab;
          return (
            <button
              key={item.tab}
              onClick={() => setActiveTab(item.tab as any)}
              className={`flex-1 min-w-[140px] p-3 text-left rounded-2xl transition-all cursor-pointer border ${
                isActive 
                  ? `${item.color} shadow-md border-transparent font-black` 
                  : 'bg-transparent border-transparent hover:bg-slate-50'
              }`}
            >
              <div className="font-extrabold text-xs tracking-tight md:text-sm">{item.label}</div>
              <div className={`text-[9.5px] uppercase tracking-wider ${isActive ? 'opacity-80' : 'text-slate-400'} font-mono mt-0.5 font-black`}>{item.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Active Tab Panel Switcher */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.15 }}
        >
          
          {/* TAB 1: MAKLUMAN & AKTIVITI MINGGU INI */}
          {activeTab === 'makluman' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Left timeline container */}
              <div className="lg:col-span-8 space-y-6">
                
                {/* School Activity Timeline Header */}
                <div className="bg-white p-6 rounded-[28px] border border-slate-200/80 shadow-md">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2.5 bg-blue-100 rounded-xl text-blue-600">
                      <Calendar size={18} />
                    </div>
                    <div>
                      <h3 className="font-black text-sm uppercase tracking-tight text-slate-850">Jadual Acara & Penglibatan Minggu Ini</h3>
                      <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mt-0.5">Minggu Terkini (Isnin 15 Jun – Ahad 21 Jun 2026)</p>
                    </div>
                  </div>
                  
                  {currentWeekTakwim.length === 0 ? (
                    <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200 mt-4 p-5">
                      <Smile className="mx-auto text-slate-400 mb-2" size={28} />
                      <h4 className="font-bold text-xs uppercase text-slate-600">Tiada Acara Rasmi Dijadualkan</h4>
                      <p className="text-[10.5px] text-slate-400 mt-1">Tiada sebarang aktiviti kokurikulum atau akademik besar dalam kalendar Takwim sekolah bertarikh untuk minggu semasa.</p>
                    </div>
                  ) : (
                    <div className="mt-6 border-l border-slate-200 pl-4 space-y-5">
                      {currentWeekTakwim.map((ev, sIdx) => {
                        const isKoku = ev.category === 'kokurikulum' || ev.category === 'Sukan';
                        const isKurikulum = ev.category === 'kurikulum' || ev.category === 'Akademik';
                        const isHEM = ev.category === 'hem' || ev.category === 'Kebajikan';
                        
                        const colorStyle = 
                          isKoku ? 'border-purple-200 bg-purple-50 text-purple-700' :
                          isKurikulum ? 'border-blue-200 bg-blue-50 text-blue-700' :
                          isHEM ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                          'border-slate-200 bg-slate-50 text-slate-700';

                        return (
                          <div key={ev.id || sIdx} className="relative pl-2 group">
                            {/* Dot timeline pin */}
                            <span className="absolute -left-[23px] top-1 w-2.5 h-2.5 bg-blue-600 rounded-full border-2 border-white pointer-events-none group-hover:scale-125 transition-transform" />
                            
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] bg-slate-900 text-white font-mono font-black p-0.5 px-2 rounded">
                                {ev.startDate}
                              </span>
                              <span className={`text-[8.5px] font-black uppercase px-2 py-0.5 border rounded-full ${colorStyle}`}>
                                {ev.category}
                              </span>
                            </div>

                            <h4 className="font-extrabold text-xs md:text-sm text-slate-850 uppercase tracking-tight">{ev.title}</h4>
                            <p className="text-[10.5px] text-slate-500 leading-relaxed font-mono mt-0.5">
                              Penyelaras: <span className="font-bold text-slate-700">{ev.leadTeacher || 'Semua Guru'}</span> • Sasaran: <span className="font-bold text-slate-700">{ev.targetGroup || 'Semua Murid'}</span>
                            </p>
                            {ev.notes && (
                              <p className="text-[10.5px] italic text-slate-600 bg-slate-50 border-l-[2px] border-slate-400 pl-2 mt-1 py-0.5 max-w-2xl">{ev.notes}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Bulletins Box for Notices */}
                <div className="bg-white p-6 rounded-[28px] border border-slate-200/80 shadow-md">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="p-2.5 bg-indigo-150 text-indigo-700 rounded-xl">
                      <Megaphone size={18} />
                    </div>
                    <div>
                      <h3 className="font-black text-sm uppercase tracking-tight text-slate-850">Hebahan & Notis Rasmi Minggu Ini</h3>
                      <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mt-0.5">Pengumuman Tergempar Dari Guru Penyelaras / Pentadbiran</p>
                    </div>
                  </div>

                  {currentWeekBulletins.length === 0 ? (
                    <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <p className="text-[10.5px] text-slate-400 italic">Tiada hebahan notis khusus dikeluarkan minggu ini.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {currentWeekBulletins.map((bulletin) => (
                        <div key={bulletin.id} className="p-5 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col justify-between whitespace-normal">
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-[8.5px] font-black uppercase tracking-wider bg-orange-100 text-orange-700 border border-orange-200 p-0.5 px-2 rounded-md font-mono">
                                {bulletin.tag || 'Notis Am'}
                              </span>
                              <span className="text-[9px] font-mono text-slate-400 font-bold">{bulletin.date}</span>
                            </div>
                            <h4 className="font-extrabold text-[12px] md:text-[13px] text-slate-850 uppercase tracking-tight leading-snug">{bulletin.title}</h4>
                            <p className="text-[11px] text-slate-600 leading-relaxed font-mono line-clamp-3">{bulletin.content}</p>
                            
                            {bulletin.involvedTeachers && (
                              <div className="mt-1.5 p-1 px-2 bg-slate-100 border border-slate-200/60 rounded-lg flex items-center gap-1.5 text-[9.5px] text-teal-800 font-bold uppercase tracking-wide">
                                <span>👥 Guru Terlibat:</span>
                                <span className="text-slate-800 font-black">{bulletin.involvedTeachers}</span>
                              </div>
                            )}
                          </div>
                          
                          <div className="pt-3 border-t border-slate-200/60 mt-3 flex items-center gap-2">
                            <div className="w-5 h-5 bg-slate-200 text-slate-600 text-[9px] font-black uppercase rounded-full flex items-center justify-center">
                              {bulletin.author[0]}
                            </div>
                            <span className="text-[9px] font-mono font-black text-slate-500 uppercase">
                              Daripada: {bulletin.author} ({bulletin.authorRole || 'Guru'})
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
              
              {/* Right panel widgets */}
              <div className="lg:col-span-4 space-y-6">
                
                {/* Academic Quick Overview Widget */}
                <div className="bg-slate-900 border border-slate-850 rounded-[28px] p-6 text-white shadow-xl flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="p-3 bg-amber-400/10 rounded-2xl w-11 h-11 border border-amber-400/10 text-amber-400 flex items-center justify-center">
                      <Compass size={20} />
                    </div>
                    <div>
                      <h4 className="text-[10px] font-mono text-amber-400 font-black tracking-widest uppercase">Pemberitahuan Sistem</h4>
                      <h3 className="text-md font-black tracking-tight uppercase leading-snug mt-1">Penilaian Akademik Akhir Sesi Akademik (UASA)</h3>
                      <p className="text-[11px] text-slate-400 leading-relaxed font-mono mt-2">
                        Paparan keputusan peperiksaan akhir term dan Tahap Penguasaan (TP) PBD murid disegerakkan secara atas talian.
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setActiveTab('kurikulum')}
                    className="w-full mt-6 bg-slate-800 hover:bg-slate-700 text-white p-3 text-xs font-black uppercase rounded-xl transition-all cursor-pointer border-none flex items-center justify-center gap-2"
                  >
                    Semak Keputusan Akademik ➔
                  </button>
                </div>

                {/* Student Merit Points SSDM Badging */}
                <div className="bg-white p-6 rounded-[28px] border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <div className="space-y-0.5">
                      <span className="text-[9px] font-mono font-black text-slate-400 uppercase tracking-widest leading-none">MATRIKS AKHLAK SSDM</span>
                      <h3 className="font-black text-slate-800 text-sm uppercase leading-none">Mata Merit Sahsiah</h3>
                    </div>
                    <span className="bg-emerald-100 text-emerald-700 text-xs font-bold font-mono px-2.5 py-1 rounded-full border border-emerald-200 font-black">
                      SSDM AKTIF
                    </span>
                  </div>

                  <div className="bg-slate-50 p-4 border border-slate-100 rounded-2xl flex items-center gap-4">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100 font-black text-center text-sm font-mono shrink-0">
                      115 pt
                    </div>
                    <div>
                      <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-tight">Kategori: TERPUJI</h4>
                      <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5 font-mono">
                        Sukar dikesan sebarang rekod disiplin buruk. Murid memegang rekod amalan baik terbanyak.
                      </p>
                    </div>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB 2: AKADEMIK / KURIKULUM & PBD */}
          {activeTab === 'kurikulum' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Left results column */}
              <div className="lg:col-span-8 space-y-6">
                
                {/* Sumatif / UASA Assessment Grid Layout */}
                <div className="bg-white rounded-[28px] border border-slate-200/80 shadow-md overflow-hidden">
                  <div className="p-6 md:p-8 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-blue-105 text-blue-600 rounded-xl">
                        <Target size={20} />
                      </div>
                      <div>
                        <h3 className="font-black text-sm uppercase tracking-tight text-slate-850">Keputusan Pentaksiran Sumatif (UASA / UP1)</h3>
                        <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mt-0.5">Keputusan Penuh Peperiksaan Rasmi Sekolah Rendah</p>
                      </div>
                    </div>

                    <div className="bg-slate-200/60 p-1 rounded-xl flex gap-1 border border-slate-300">
                      {[1, 2].map(v => (
                        <button 
                          key={v}
                          onClick={() => {
                            setTerm(v);
                            setAiRecs(null); // Clear recommendations to refresh based on chosen term
                          }}
                          className={`py-1.5 px-4 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest border-none cursor-pointer ${term === v ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-300'}`}
                        >
                          PENGGAL {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-mono">
                      <thead className="bg-slate-100/50 text-[10.5px] font-black text-slate-500 border-b border-slate-200/65 uppercase">
                        <tr>
                          <th className="px-6 py-4">MATA PELAJARAN / KURSUS</th>
                          <th className="px-6 py-4 text-center">MARKAH %</th>
                          <th className="px-6 py-4 text-center">GRED</th>
                          <th className="px-6 py-4 text-center">STATUS PENCAPAIAN</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150 text-[11.5px]">
                        {uasa.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-6 py-16 text-center text-slate-400 italic">
                              ⚠️ Tiada data keputusan peperiksaan diumumkan untuk Penggal {term} oleh Guru Kelas / Setiausaha Peperiksaan lagi.
                            </td>
                          </tr>
                        ) : (
                          uasa.map((r, idx) => {
                            const grade = r.grade || getUasaGrade(r.marks);
                            const interpretation = getUasaGradeInterpretation(grade);

                            return (
                              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 font-extrabold text-slate-800 uppercase tracking-tight">{r.subject_id}</td>
                                <td className="px-6 py-4 text-center font-black text-slate-900">{r.marks}</td>
                                <td className="px-6 py-4 text-center">
                                  <UasaBadge mark={r.marks} grade={grade} showMark={false} size="sm" />
                                </td>
                                <td className="px-6 py-4 text-center font-bold font-sans text-[11px] text-slate-700 uppercase">
                                  {interpretation}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* PBD Section */}
                <div className="bg-white p-6 md:p-8 rounded-[28px] border border-slate-200/80 shadow-md">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2.5 bg-amber-100 text-amber-600 rounded-xl">
                      <Brain size={20} />
                    </div>
                    <div>
                      <h3 className="font-black text-sm uppercase tracking-tight text-slate-850">Analisis PBD (Pentaksiran Bilik Darjah)</h3>
                      <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mt-0.5">Penilaian Holistik Berterusan Tahap Penguasaan (TP1 – TP6)</p>
                    </div>
                  </div>

                  {pbd.length === 0 ? (
                    <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-200">
                      <p className="text-[11px] text-slate-400 italic">Tiada rekod data PBD disuntik masuk untuk kelas ini.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {pbd.map((r, idx) => {
                        const val = term === 1 ? r.ar1 : r.ar2;
                        const tpNum = Number(val) || 0;
                        const percentProgress = tpNum > 0 ? (tpNum / 6) * 100 : 0;
                        
                        // Determine beautiful descriptors based on TP score
                        let descriptor = "Menguasai kemahiran asas pelajaran dengan bimbingan minima.";
                        if (tpNum <= 2) descriptor = "Menunjukkan kefahaman terhad, memerlukan bimbingan tegap guru.";
                        else if (tpNum >= 5) descriptor = "Menguasai standard prestasi tertinggi serta berkemampuan membimbing murid rakan sebaya.";

                        return (
                          <div key={idx} className="p-5 rounded-2xl bg-slate-50 border border-slate-200/60 transition-all hover:bg-white hover:shadow-md space-y-3">
                            <div className="flex justify-between items-center text-xs font-mono">
                              <span className="font-extrabold text-slate-800 uppercase tracking-tight line-clamp-1">{r.subject_id}</span>
                              <PbdBadge tp={val} size="sm" />
                            </div>

                            {/* TP Visual progress meter */}
                            <div className="space-y-1">
                              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    tpNum >= 4 ? 'bg-emerald-500' : tpNum === 3 ? 'bg-amber-500' : tpNum >= 1 ? 'bg-rose-500' : 'bg-slate-300'
                                  }`}
                                  style={{ width: `${percentProgress}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-[8px] font-bold text-slate-400 font-mono uppercase tracking-wider">
                                <span>TP1 (Min)</span>
                                <span>PT2</span>
                                <span>PT3</span>
                                <span>PT4</span>
                                <span>PT5</span>
                                <span>TP6 (Max)</span>
                              </div>
                            </div>

                            {/* Commentary */}
                            <p className="text-[10.5px] italic text-slate-500 leading-relaxed pt-1.5 border-t border-slate-200/60">
                              "{descriptor}"
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
              
              {/* Right column (AI helper) */}
              <div className="lg:col-span-4 space-y-6">
                
                {/* AI Study Intervention engine block */}
                <div className="bg-indigo-600 rounded-[28px] p-6 text-white shadow-xl relative overflow-hidden group">
                  <Sparkles className="absolute -right-4 -top-4 w-28 h-28 opacity-10 group-hover:rotate-12 transition-transform duration-500" />
                  
                  <div className="relative z-10 space-y-4">
                    <div>
                      <span className="text-[8.5px] font-black uppercase tracking-widest bg-white/20 p-1 px-2.5 rounded-full border border-white/10 font-mono">
                        KOLESTION ANALITIS GEMINI AI
                      </span>
                      <h3 className="text-lg font-black tracking-tight uppercase mt-2">Penjana Pelan Intervensi & Akademik</h3>
                      <p className="text-indigo-100 text-[11px] leading-relaxed font-mono mt-1">
                        Dapatkan analisis kelemahan, tip pembelajaran khusus, serta latih tubi terpumpun berdasar markah sumatif peperiksaan terkini secara pintar.
                      </p>
                    </div>

                    <button 
                      onClick={fetchAIInsights}
                      disabled={fetchingRecs || uasa.length === 0}
                      className="w-full py-3 bg-white hover:bg-slate-50 text-indigo-700 text-xs font-black uppercase tracking-wider rounded-xl transition-all border-none cursor-pointer flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                    >
                      {fetchingRecs ? (
                        <>
                          <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-b-2 border-indigo-700" />
                          Menganalisis...
                        </>
                      ) : (
                        <>
                          Hubungi Penasihat AI ➔
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* AI Recommendations view area */}
                {aiRecs && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-6 bg-emerald-50 border border-emerald-250 rounded-[28px] shadow-sm space-y-3"
                  >
                    <h4 className="text-emerald-900 font-black text-xs uppercase tracking-tight flex items-center gap-2">
                      <Sparkles className="text-emerald-600" size={16} />
                      Pelitup Syor Pemulihan & Intervensi AI:
                    </h4>
                    
                    <p className="whitespace-pre-wrap font-mono text-[10.5px] text-emerald-850 bg-white/60 p-4 rounded-2xl border border-emerald-200/50 leading-relaxed max-h-[350px] overflow-y-auto">
                      {aiRecs}
                    </p>
                  </motion.div>
                )}

              </div>

            </div>
          )}

          {/* TAB 3: HAL EHWAL MURID (HEM) */}
          {activeTab === 'hem' && (
            <div className="space-y-8">
              
              {/* Primary grid parameters */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                
                {/* School Attendance Donut Card */}
                <div className="bg-white p-6 rounded-[28px] border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[9px] font-mono font-black text-slate-400 uppercase tracking-widest leading-none">REKOD APDM</span>
                      <h3 className="font-black text-slate-800 text-sm uppercase leading-none mt-0.5">Kehadiran Kelas Sekolah</h3>
                    </div>
                    <span className="p-1 px-2 text-[9px] font-bold font-mono bg-emerald-100 text-emerald-700 rounded border border-emerald-200">
                      CEMERLANG
                    </span>
                  </div>

                  {/* Stunning Circular Progress visualizer */}
                  <div className="flex items-center justify-around py-2">
                    <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
                      
                      {/* SVG circular dial background */}
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="56" cy="56" r="46" fill="transparent" stroke="#f1f5f9" strokeWidth="8"/>
                        <circle cx="56" cy="56" r="46" fill="transparent" stroke="#10b981" strokeWidth="8" strokeDasharray="289" strokeDashoffset={289 - (289 * 95.8) / 100}/>
                      </svg>
                      
                      <div className="absolute text-center">
                        <span className="block text-lg font-black text-slate-850 tracking-tighter">95.8%</span>
                        <span className="text-[8px] font-black text-slate-400 block uppercase font-mono tracking-widest mt-0.5">PURATA</span>
                      </div>
                    </div>

                    <div className="text-[10.5px] font-serif pr-2 space-y-1">
                      <p className="flex items-center gap-1.5 font-mono">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                        Hadir: <span className="font-bold text-slate-800">137 Hari</span>
                      </p>
                      <p className="flex items-center gap-1.5 font-mono">
                        <span className="w-2 h-2 bg-yellow-400 rounded-full" />
                        Sakit (S): <span className="font-bold text-slate-800">4 Hari</span>
                      </p>
                      <p className="flex items-center gap-1.5 font-mono">
                        <span className="w-2 h-2 bg-rose-500 rounded-full" />
                        Ponteng (P): <span className="font-bold text-slate-800">2 Hari</span>
                      </p>
                    </div>
                  </div>

                  <p className="text-[10.5px] font-mono text-slate-500 text-center uppercase tracking-wide leading-relaxed border-t border-slate-100 pt-3">
                    Target KPI Kebangsaan: &gt; 95% Kehadiran Tahunan
                  </p>
                </div>

                {/* Welfare / Aid List approvals */}
                <div className="bg-white p-6 rounded-[28px] border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
                  <div>
                    <span className="text-[9px] font-mono font-black text-slate-400 uppercase tracking-widest leading-none">KEBAJIKAN & BANTUAN</span>
                    <h3 className="font-black text-slate-800 text-sm uppercase mt-0.5 mb-3 leading-none">Matriks Kebajikan Murid</h3>
                  </div>

                  <div className="space-y-2.5">
                    {[
                      { label: 'Bantuan Awal Sekolah (BAP)', status: 'LAYAK & DIKREDITKAN', val: 'RM 150.00 diserah tunai', approve: true },
                      { label: 'Skim Pinjaman Buku Teks (SPBT)', status: 'TERIMA LENGKAP', val: '12 Buku Teks sedia dipinjam', approve: true },
                      { label: 'Rancangan Makanan Tambahan (RMT)', status: 'TIDAK LAYAK', val: 'Pendapatan melebihi garis kemiskinan', approve: false },
                    ].map((item, idz) => (
                      <div key={idz} className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-extrabold text-[11px] text-slate-850 leading-tight uppercase font-mono">{item.label}</h4>
                          <span className="text-[10px] text-slate-500 block leading-normal">{item.val}</span>
                        </div>
                        <span className={`text-[8.5px] font-mono font-black border rounded px-1.5 py-0.5 shrink-0 ${item.approve ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-200 border-slate-300 text-slate-500'}`}>
                          {item.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Health & BMI Physical Parameters */}
                <div className="bg-white p-6 rounded-[28px] border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
                  <div>
                    <span className="text-[9px] font-mono font-black text-slate-400 uppercase tracking-widest leading-none">REKOD FIZIKAL & BIOMETRIK</span>
                    <h3 className="font-black text-slate-800 text-sm uppercase mt-0.5 mb-3 leading-none">Pertumbuhan Kesihatan & Gigi</h3>
                  </div>

                  <div className="grid grid-cols-3 gap-2 font-mono text-center">
                    <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-2xl">
                      <span className="block text-[8px] font-black text-slate-400 uppercase tracking-wider">TINGGI</span>
                      <span className="block text-xs font-black text-slate-850 mt-0.5">135 cm</span>
                    </div>
                    <div className="p-2.5 bg-purple-50 border border-purple-100 rounded-2xl">
                      <span className="block text-[8px] font-black text-slate-400 uppercase tracking-wider">BERAT</span>
                      <span className="block text-xs font-black text-slate-850 mt-0.5">32 kg</span>
                    </div>
                    <div className="p-2.5 bg-emerald-50 border border-emerald-100 rounded-2xl">
                      <span className="block text-[8px] font-black text-slate-400 uppercase tracking-wider">BMI</span>
                      <span className="block text-xs font-black text-slate-850 mt-0.5">17.6</span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl text-[10.5px] font-mono text-slate-600 leading-relaxed">
                    <p className="flex justify-between border-b border-slate-200/50 pb-1.5">
                      <span>Status BMI:</span>
                      <span className="font-black text-emerald-600 uppercase">BERAT IDEAL NORMAL</span>
                    </p>
                    <p className="flex justify-between border-b border-slate-200/50 pt-1.5 pb-1.5">
                      <span>Pemeriksaan Gigi:</span>
                      <span className="font-black text-slate-700 uppercase">BERSIH • TIADA PLAK</span>
                    </p>
                    <p className="flex justify-between pt-1.5 pb-0.5">
                      <span>Vaksinasi Imunisasi:</span>
                      <span className="font-black text-slate-700 uppercase">LENGKAP TAHUN 1 & 6</span>
                    </p>
                  </div>
                </div>

              </div>

              {/* SSDM Discipline Log detailed list */}
              <div className="bg-white p-6 md:p-8 rounded-[28px] border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2">
                    <UserCheck className="text-emerald-600" size={18} />
                    <h3 className="font-black text-sm uppercase tracking-tight text-slate-850">Log Amalan Pemulihan Baik SSDM</h3>
                  </div>
                  <span className="text-[10px] text-slate-450 uppercase font-mono font-black">
                    Sistem Sahsiah Diri Murid (KPM)
                  </span>
                </div>

                <div className="space-y-3 font-mono">
                  {[
                    { date: '2026-06-12', detail: 'Membantu guru mengangkat peranti projektor bantuan mengajar dan buku latihan di pejabat guru.', reporter: 'Cikgu Wong (Koko)', pts: '+5 Mata merit' },
                    { date: '2026-05-28', detail: 'Menunjukkan nilai kejujuran menyerahkan RM20 dijumpai di kantin sekolah kepada PK HEM.', reporter: 'Ustaz Kamil (HEM)', pts: '+10 Mata merit' },
                  ].map((act, ax) => (
                    <div key={ax} className="p-4 bg-slate-50 rounded-2xl border border-slate-1.5 flex flex-col md:flex-row justify-between md:items-center gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-[9.5px]">
                          <span className="bg-slate-900 text-white font-black p-0.5 px-2 rounded">{act.date}</span>
                          <span className="text-slate-400 font-bold uppercase">Pencatat: {act.reporter}</span>
                        </div>
                        <p className="text-[11.5px] text-slate-750 font-sans font-medium leading-relaxed mt-1.5">{act.detail}</p>
                      </div>
                      <span className="bg-emerald-50 text-emerald-700 text-xs font-black p-1.5 px-3 border border-emerald-250 rounded-xl leading-none text-center">
                        {act.pts}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* TAB 4: KOKURIKULUM (SUKAN & KELAB) */}
          {activeTab === 'kokurikulum' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Left Column (Memberships & Attendance) */}
              <div className="lg:col-span-8 space-y-6">
                
                {/* Registered Co-Curricular Memberships list details */}
                <div className="bg-white p-6 md:p-8 rounded-[28px] border border-slate-200/80 shadow-md">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2.5 bg-purple-100 text-purple-600 rounded-xl">
                      <Award size={20} />
                    </div>
                    <div>
                      <h3 className="font-black text-sm uppercase tracking-tight text-slate-850">Keahlian Mengikut Bahagian Kokurikulum</h3>
                      <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mt-0.5">Badan Beruniform, Kelab/Persatuan Utama SJK(C) Ek Hua</p>
                    </div>
                  </div>

                  {kokoMembership ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 font-mono">
                      
                      {/* Uniform group */}
                      {(() => {
                        const att = calculateKokoAttendanceRate('uniform', kokoMembership.uniform);
                        return (
                          <div className="p-5 rounded-2xl border bg-slate-50 border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
                            <div>
                              <span className="text-[8.5px] font-black uppercase tracking-widest p-1 px-2.5 bg-blue-100 text-blue-700 border border-blue-200 rounded-full leading-none">
                                BADAN BERUNIFORM
                              </span>
                              <h4 className="font-bold text-[12.5px] text-slate-850 uppercase tracking-tight mt-3 leading-snug">
                                {kokoMembership.uniform || 'TIADA AHLI'}
                              </h4>
                            </div>

                            <div className="space-y-2 border-t border-slate-200/65 pt-3 text-[10px] text-slate-500 leading-tight">
                              <p className="flex justify-between">
                                <span>Hadir/Jumlah Sesi:</span>
                                <span className="font-black text-slate-800">{att.present}/{att.total} Kali</span>
                              </p>
                              <p className="flex justify-between border-b pb-2">
                                <span>Ponteng/Kecualian:</span>
                                <span className="font-black text-slate-800">{att.absent}A / {att.excused}X</span>
                              </p>
                              <div className="space-y-1 pt-1.5">
                                <div className="flex justify-between">
                                  <span>Kadar Kehadiran:</span>
                                  <span className="font-black text-blue-600">{att.percent}%</span>
                                </div>
                                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${att.percent}%` }} />
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Club group */}
                      {(() => {
                        const att = calculateKokoAttendanceRate('club', kokoMembership.club);
                        return (
                          <div className="p-5 rounded-2xl border bg-slate-50 border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
                            <div>
                              <span className="text-[8.5px] font-black uppercase tracking-widest p-1 px-2.5 bg-purple-100 text-purple-700 border border-purple-200 rounded-full leading-none">
                                KELAB & PERSATUAN
                              </span>
                              <h4 className="font-bold text-[12.5px] text-slate-850 uppercase tracking-tight mt-3 leading-snug">
                                {kokoMembership.club || 'TIADA AHLI'}
                              </h4>
                            </div>

                            <div className="space-y-2 border-t border-slate-200/65 pt-3 text-[10px] text-slate-500 leading-tight">
                              <p className="flex justify-between">
                                <span>Hadir/Jumlah Sesi:</span>
                                <span className="font-black text-slate-800">{att.present}/{att.total} Kali</span>
                              </p>
                              <p className="flex justify-between border-b pb-2">
                                <span>Ponteng/Kecualian:</span>
                                <span className="font-black text-slate-800">{att.absent}A / {att.excused}X</span>
                              </p>
                              <div className="space-y-1 pt-1.5">
                                <div className="flex justify-between">
                                  <span>Kadar Kehadiran:</span>
                                  <span className="font-black text-purple-600">{att.percent}%</span>
                                </div>
                                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                  <div className="h-full bg-purple-500 rounded-full" style={{ width: `${att.percent}%` }} />
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Sport group */}
                      {(() => {
                        const att = calculateKokoAttendanceRate('sport', kokoMembership.sport);
                        return (
                          <div className="p-5 rounded-2xl border bg-slate-50 border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
                            <div>
                              <span className="text-[8.5px] font-black uppercase tracking-widest p-1 px-2.5 bg-amber-100 text-amber-700 border border-amber-200 rounded-full leading-none">
                                SUKAN & PERMAINAN
                              </span>
                              <h4 className="font-bold text-[12.5px] text-slate-850 uppercase tracking-tight mt-3 leading-snug">
                                {kokoMembership.sport || 'TIADA AHLI'}
                              </h4>
                            </div>

                            <div className="space-y-2 border-t border-slate-200/65 pt-3 text-[10px] text-slate-500 leading-tight">
                              <p className="flex justify-between">
                                <span>Hadir/Jumlah Sesi:</span>
                                <span className="font-black text-slate-800">{att.present}/{att.total} Kali</span>
                              </p>
                              <p className="flex justify-between border-b pb-2">
                                <span>Ponteng/Kecualian:</span>
                                <span className="font-black text-slate-800">{att.absent}A / {att.excused}X</span>
                              </p>
                              <div className="space-y-1 pt-1.5">
                                <div className="flex justify-between">
                                  <span>Kadar Kehadiran:</span>
                                  <span className="font-black text-amber-600">{att.percent}%</span>
                                </div>
                                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${att.percent}%` }} />
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                    </div>
                  ) : (
                    <p className="text-[10.5px] text-slate-450 italic">Kecorangan! Memastikan rekod keahlian dari sistem Utama...</p>
                  )}
                </div>

                {/* Achievements Feed (Pertandingan dan pencapaian tertinggi) */}
                <div className="bg-white p-6 md:p-8 rounded-[28px] border border-slate-200 shadow-sm space-y-4">
                  <div className="flex items-center gap-3">
                    <Trophy className="text-amber-500" size={18} />
                    <h3 className="font-black text-sm uppercase tracking-tight text-slate-850">
                      Rekod Kejohanan & Pencapaian Kokurikulum Tertinggi
                    </h3>
                  </div>

                  <div className="space-y-3 font-mono">
                    {studentAchievements.map((item) => (
                      <div 
                        key={item.id} 
                        className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col md:flex-row justify-between md:items-center gap-3 hover:border-amber-400 hover:bg-white transition-all"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="bg-amber-100 text-amber-700 text-[8px] font-black uppercase tracking-wider p-0.5 px-2 rounded-md border border-amber-200 leading-none">
                              Peringkat {item.level}
                            </span>
                            <span className="text-slate-400 text-[9.5px] font-bold uppercase">{item.date}</span>
                          </div>
                          <h4 className="font-extrabold text-[12px] md:text-[12.5px] text-slate-850 uppercase tracking-tight leading-snug mt-1">{item.name}</h4>
                          <span className="text-[9.5px] text-slate-500 block leading-normal mt-0.5">Penganjur: {item.organizer}</span>
                        </div>
                        
                        <div className="p-2.5 px-4 bg-amber-50 border border-amber-200 rounded-xl shrink-0 text-center flex items-center justify-center gap-2">
                          <Trophy className="text-amber-500 fill-amber-500/20" size={14} />
                          <span className="text-xs font-black text-amber-900 leading-none uppercase">{item.prize}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
              
              {/* Right Column (Info Card / PAJSK Guidance) */}
              <div className="lg:col-span-4 space-y-6">
                
                {/* PAJSK KPI guidance widget */}
                <div className="bg-white p-6 rounded-[28px] border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-2 text-purple-600 mb-3">
                    <Info size={16} />
                    <h4 className="font-black text-xs uppercase tracking-tight">Garis Panduan PAJSK KPM</h4>
                  </div>
                  
                  <p className="text-[11px] text-slate-500 font-mono leading-relaxed uppercase">
                    Kehadirilah aktiviti kokurikulum sekurang-kurangnya <span className="font-black text-slate-800">12 kali pertemuan tahunan</span> untuk melayakkan markah penuh kehadiran 40/40 PAJSK bagi sukan sukan, kelab dan uniform masing-masing.
                  </p>
                  
                  <div className="bg-slate-50 p-4 border rounded-2xl mt-4 text-[10px] font-mono text-slate-500 space-y-2 leading-snug">
                    <p className="flex justify-between items-center">
                      <span>Kehadiran Maksimum:</span>
                      <span className="font-bold text-slate-800">40 Mata</span>
                    </p>
                    <p className="flex justify-between items-center">
                      <span>Pencapaian Tertinggi:</span>
                      <span className="font-bold text-slate-800">20 Mata</span>
                    </p>
                    <p className="flex justify-between items-center">
                      <span>Bonus (Jawatan):</span>
                      <span className="font-bold text-slate-800">10 Mata</span>
                    </p>
                    <p className="flex justify-between items-center border-t border-slate-200 pt-2 font-black text-slate-850 text-xs">
                      <span>Jumlah Keseluruhan:</span>
                      <span className="text-purple-600">80 Mata</span>
                    </p>
                  </div>
                </div>

              </div>

            </div>
          )}

        </motion.div>
      </AnimatePresence>
    </div>
  );
}


