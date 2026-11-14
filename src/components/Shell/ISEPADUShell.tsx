import React, { useState, useEffect } from 'react';
import { UserProfile, SchoolSettings } from '../../types';
import { db, auth } from '../../firebase';
import { collection, getDocs, query } from 'firebase/firestore';
import {
  belongsToSchool,
  DEFAULT_SCHOOL_NAME,
  DEFAULT_SCHOOL_SLOGAN,
  isLegacyDefaultSchool,
  resolveRecordSchoolCode,
} from '../../utils/schoolTenant';
import { 
  LayoutDashboard, 
  BookOpen, 
  Clock, 
  Database, 
  LogOut, 
  Users, 
  GraduationCap, 
  Award, 
  ArrowRight, 
  ShieldCheck, 
  ChevronRight,
  School,
  CheckCircle2,
  FileSpreadsheet,
  AlertTriangle,
  BarChart3,
  Trophy,
  Bell,
  Camera,
  Mail,
  Key
} from 'lucide-react';

import SchoolLogo from '../SchoolLogo';
import { SchoolLogoModal } from '../SchoolLogoModal';
import { ChangePasswordModal } from '../ChangePasswordModal';
import SubjectTeacherView from '../Teacher/SubjectTeacherView';
import AcademicAnalysisDashboard from '../Academic/AcademicAnalysisDashboard';
import MasterDataDashboard from '../Dashboard/MasterDataDashboard';
import KokurikulumSystem from '../Kokurikulum/KokurikulumSystem';
import { StaffPunchIn } from '../StaffPunchIn';
import { PrincipalDashboard } from '../PrincipalDashboard';
import { TimetableSystem } from '../Timetable/TimetableSystem';
import { AcademicOPRManager } from '../Academic/AcademicOPRManager';
import { PaparanMaklumanView } from '../Dashboard/PaparanMaklumanView';
import { SuratMasukManagerView } from '../SuratMasukManagerView';
import { ReliefSchedulingView } from '../ReliefSchedulingView';

export type Workspace = 'dashboard' | 'makluman' | 'surat-masuk' | 'academic' | 'kokurikulum' | 'attendance' | 'master-data';
export type AcademicTab = 'pbd' | 'uasa' | 'analysis' | 'timetable' | 'relief' | 'opr';

interface ISEPADUShellProps {
  currentUser: UserProfile;
  schoolSettings: SchoolSettings | null;
  onUpdateSchoolSettings: (updated: SchoolSettings) => void;
  onLogout: () => Promise<void>;
}

export const ISEPADUShell: React.FC<ISEPADUShellProps> = ({
  currentUser,
  schoolSettings,
  onUpdateSchoolSettings,
  onLogout,
}) => {
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace>('dashboard');
  const [academicTab, setAcademicTab] = useState<AcademicTab>('pbd');
  const [principalAttendanceView, setPrincipalAttendanceView] = useState<'punch' | 'management'>('management');
  const [isLogoModalOpen, setIsLogoModalOpen] = useState<boolean>(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState<boolean>(
    (currentUser as any).mustChangePassword === true
  );

  // Dashboard counts
  const [personnelCount, setPersonnelCount] = useState<number>(0);
  const [activeAccountCount, setActiveAccountCount] = useState<number>(0);
  const [studentCount, setStudentCount] = useState<number>(0);
  const [pbdCount, setPbdCount] = useState<number>(0);
  const [uasaCount, setUasaCount] = useState<number>(0);
  const [loadingStats, setLoadingStats] = useState<boolean>(true);

  const isPrincipal = currentUser.role === 'PRINCIPAL';
  const isAkp = currentUser.category === 'AKP';
  const isGuru = currentUser.category === 'GURU' || isPrincipal;
  const activeSchoolCode = resolveRecordSchoolCode(currentUser);
  const displaySchoolName =
    schoolSettings?.schoolName || (isLegacyDefaultSchool(activeSchoolCode) ? DEFAULT_SCHOOL_NAME : activeSchoolCode);
  const displaySchoolCode = schoolSettings?.schoolCode || activeSchoolCode;
  const displaySlogan = schoolSettings?.slogan || DEFAULT_SCHOOL_SLOGAN;
  const displayLogo = schoolSettings?.schoolLogo || schoolSettings?.logoUrl || '';

  useEffect(() => {
    let isMounted = true;
    async function loadStats() {
      try {
        // 1. Fetch Authoritative Core Personnel count via Core API scoped to schoolCode
        let coreCount = 0;
        try {
          const idToken = await auth.currentUser?.getIdToken();
          const coreRes = await fetch(`/api/core/personnel?schoolCode=${encodeURIComponent(activeSchoolCode)}`, {
            headers: { Authorization: `Bearer ${idToken || ''}` }
          });
          if (coreRes.ok) {
            const coreData = await coreRes.json();
            if (Array.isArray(coreData.personnel)) {
              coreCount = coreData.count ?? coreData.personnel.length;
            }
          }
        } catch {
          // If Core API is unreachable, keep 0
        }

        // 2. Fetch Attendance users and academic collections filtered strictly by activeSchoolCode
        const [usersSnap, studentsSnap, pbdSnap, uasaSnap] = await Promise.all([
          getDocs(query(collection(db, 'users'))).catch(() => null),
          getDocs(query(collection(db, 'students'))).catch(() => null),
          getDocs(query(collection(db, 'pbd_results'))).catch(() => null),
          getDocs(query(collection(db, 'uasa_results'))).catch(() => null),
        ]);
        const countScoped = (snap: any) =>
          snap && snap.docs
            ? snap.docs.filter((d: any) => belongsToSchool(d.data(), activeSchoolCode)).length
            : 0;
        if (isMounted) {
          setPersonnelCount(coreCount);
          setActiveAccountCount(countScoped(usersSnap));
          setStudentCount(countScoped(studentsSnap));
          setPbdCount(countScoped(pbdSnap));
          setUasaCount(countScoped(uasaSnap));
          setLoadingStats(false);
        }
      } catch (err) {
        console.warn('Dashboard stats hydration:', err);
        if (isMounted) setLoadingStats(false);
      }
    }
    loadStats();
    return () => {
      isMounted = false;
    };
  }, [activeSchoolCode]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* ================= TOP NAVIGATION BAR ================= */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">
            {/* Branding */}
            <div className="flex items-center space-x-3">
              <div
                className="relative group cursor-pointer"
                onClick={() => {
                  if (isPrincipal) {
                    setIsLogoModalOpen(true);
                  } else {
                    setActiveWorkspace('dashboard');
                  }
                }}
                title={isPrincipal ? 'Klik untuk Tukar Logo Sekolah (Upload / URL)' : 'Kembali ke Dashboard'}
              >
                <SchoolLogo className="w-10 h-10 sm:w-11 sm:h-11" src={displayLogo} schoolCode={displaySchoolCode} />
                {isPrincipal && (
                  <div className="absolute inset-0 bg-black/60 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                    <Camera className="w-4 h-4 text-white" />
                  </div>
                )}
              </div>
              <div className="cursor-pointer" onClick={() => setActiveWorkspace('dashboard')}>
                <div className="flex items-center gap-2">
                  <span className="font-black text-lg sm:text-xl tracking-tight text-white flex items-center gap-1.5">
                    iSEPADU <span className="text-blue-500 font-extrabold">AI</span>
                  </span>
                  <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] bg-blue-950 text-blue-300 border border-blue-800/80 rounded-md font-mono font-bold">
                    {displaySchoolCode}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-medium">
                  {displaySchoolName}
                  <span className="text-slate-600 mx-1.5 hidden md:inline">|</span>
                  <span className="hidden md:inline text-slate-500">{displaySlogan}</span>
                </p>
              </div>
            </div>

            {/* Navigation Workspace Links */}
            <nav className="hidden md:flex items-center space-x-1 lg:space-x-2">
              <button
                onClick={() => setActiveWorkspace('dashboard')}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeWorkspace === 'dashboard'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Dashboard</span>
              </button>

              {/* Makluman & Tugasan WhatsApp (Semua Warga Sekolah) */}
              <button
                onClick={() => setActiveWorkspace('makluman')}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeWorkspace === 'makluman'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                }`}
              >
                <Bell className="w-4 h-4 text-indigo-400" />
                <span>Makluman</span>
              </button>

              {/* Surat Masuk (PO / Pembantu Operasi & Semua Pentadbir) */}
              <button
                onClick={() => setActiveWorkspace('surat-masuk')}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeWorkspace === 'surat-masuk'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                }`}
              >
                <Mail className="w-4 h-4 text-blue-400" />
                <span>Surat Masuk (PO)</span>
              </button>

              {/* Akademik (Guru & Principal only) */}
              {isGuru && !isAkp && (
                <button
                  onClick={() => setActiveWorkspace('academic')}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeWorkspace === 'academic'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Akademik</span>
                </button>
              )}

              {/* Kokurikulum (Guru & Principal) */}
              {isGuru && !isAkp && (
                <button
                  onClick={() => setActiveWorkspace('kokurikulum')}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeWorkspace === 'kokurikulum'
                      ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                  }`}
                >
                  <Trophy className="w-4 h-4" />
                  <span>Kokurikulum</span>
                </button>
              )}

              {/* Kehadiran Staf (All Roles) */}
              <button
                onClick={() => setActiveWorkspace('attendance')}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeWorkspace === 'attendance'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>Kehadiran Staf</span>
              </button>

              {/* Master Data (Guru Besar / Admin only) */}
              {isPrincipal && (
                <button
                  onClick={() => setActiveWorkspace('master-data')}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeWorkspace === 'master-data'
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                  }`}
                >
                  <Database className="w-4 h-4" />
                  <span>Master Data</span>
                </button>
              )}
            </nav>

            {/* Profile & Logout */}
            <div className="flex items-center space-x-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-white truncate max-w-[160px]">{currentUser.name}</p>
                <div className="flex items-center justify-end gap-1.5 mt-0.5">
                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider border ${
                    isPrincipal
                      ? 'bg-indigo-950 text-indigo-300 border-indigo-700/60'
                      : isAkp
                      ? 'bg-amber-950 text-amber-300 border-amber-700/60'
                      : 'bg-emerald-950 text-emerald-300 border-emerald-700/60'
                  }`}>
                    {currentUser.role === 'PRINCIPAL' ? 'GURU BESAR' : currentUser.category || 'GURU'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsPasswordModalOpen(true)}
                title="Tukar Kata Laluan (Kata Laluan Asal: 12345678)"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-indigo-300 border border-slate-700/60 text-xs font-bold transition cursor-pointer"
              >
                <Key className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden md:inline">Tukar Kata Laluan</span>
              </button>

              <button
                onClick={onLogout}
                title="Log Keluar"
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-rose-400 transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mobile Navigation bar */}
          <div className="flex md:hidden border-t border-slate-800 py-2 space-x-1 overflow-x-auto">
            <button
              onClick={() => setActiveWorkspace('dashboard')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 ${
                activeWorkspace === 'dashboard' ? 'bg-blue-600 text-white' : 'text-slate-400'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveWorkspace('makluman')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 flex items-center gap-1 ${
                activeWorkspace === 'makluman' ? 'bg-indigo-600 text-white' : 'text-slate-400'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Makluman</span>
            </button>
            {isGuru && !isAkp && (
              <button
                onClick={() => setActiveWorkspace('academic')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 ${
                  activeWorkspace === 'academic' ? 'bg-blue-600 text-white' : 'text-slate-400'
                }`}
              >
                Akademik
              </button>
            )}
            {isGuru && !isAkp && (
              <button
                onClick={() => setActiveWorkspace('kokurikulum')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 ${
                  activeWorkspace === 'kokurikulum' ? 'bg-amber-600 text-white' : 'text-slate-400'
                }`}
              >
                Kokurikulum
              </button>
            )}
            <button
              onClick={() => setActiveWorkspace('attendance')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 ${
                activeWorkspace === 'attendance' ? 'bg-blue-600 text-white' : 'text-slate-400'
              }`}
            >
              Kehadiran
            </button>
            {isPrincipal && (
              <button
                onClick={() => setActiveWorkspace('master-data')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 ${
                  activeWorkspace === 'master-data' ? 'bg-indigo-600 text-white' : 'text-slate-400'
                }`}
              >
                Master Data
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ================= WORKSPACE BODY ================= */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        
        {/* ---------------- 1. DASHBOARD WORKSPACE ---------------- */}
        {activeWorkspace === 'dashboard' && (
          <div className="space-y-8 animate-fade-in">
            {/* Hero Welcome Card */}
            <div className="bg-gradient-to-r from-blue-950/70 via-slate-900 to-indigo-950/60 border border-slate-800 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-2xl">
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      Sesi Akademik 2026 Aktif
                    </span>
                    <span className="px-2.5 py-1 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-full text-[10px] font-black uppercase tracking-wider">
                      OPEN_TEACHERS Mode
                    </span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                    Selamat Kembali, {currentUser.name}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400 max-w-2xl mt-1">
                    Portal pengurusan teras {displaySchoolName}. Akses terus modul pentaksiran PBD, UASA, rekod kehadiran staf dan integriti data sekolah.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {isGuru && !isAkp && (
                    <button
                      onClick={() => { setActiveWorkspace('academic'); setAcademicTab('pbd'); }}
                      className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-blue-600/30 flex items-center gap-1.5"
                    >
                      <BookOpen className="w-4 h-4" /> Masuk PBD
                    </button>
                  )}
                  <button
                    onClick={() => setActiveWorkspace('attendance')}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold uppercase tracking-wider transition border border-slate-700 flex items-center gap-1.5"
                  >
                    <Clock className="w-4 h-4" /> Kehadiran Staf
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Metrics Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Warga Guru & AKP</span>
                  <Users className="w-4 h-4 text-blue-400" />
                </div>
                <div className="text-2xl font-black text-white">
                  {loadingStats ? '...' : personnelCount}
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Profil Master iSEPADU Core</p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Akaun Sistem Aktif</span>
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-2xl font-black text-white">
                  {loadingStats ? '...' : activeAccountCount}
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Log Masuk Kehadiran Disahkan</p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Murid Berdaftar</span>
                  <GraduationCap className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-black text-white">
                  {loadingStats ? '...' : studentCount}
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Tahun 1 hingga Tahun 6</p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Rekod PBD</span>
                  <Award className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-black text-white">
                  {loadingStats ? '...' : pbdCount}
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Tahap Penguasaan Disimpan</p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm col-span-2 lg:col-span-1">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Rekod UASA</span>
                  <BarChart3 className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="text-2xl font-black text-white">
                  {loadingStats ? '...' : uasaCount}
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Pentaksiran Sumatif</p>
              </div>
            </div>

            {/* Quick Access Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* PBD Entry Card */}
              {isGuru && !isAkp ? (
                <div 
                  onClick={() => { setActiveWorkspace('academic'); setAcademicTab('pbd'); }}
                  className="bg-slate-900/90 border border-slate-800 hover:border-blue-500/50 rounded-3xl p-6 transition-all cursor-pointer group shadow-lg flex flex-col justify-between"
                >
                  <div>
                    <div className="w-12 h-12 rounded-2xl bg-blue-600/20 text-blue-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <BookOpen className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">
                      PBD (Pentaksiran Bilik Darjah)
                    </h3>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                      Pemasukan Tahap Penguasaan TP1–TP6 (atau TP1–TP3 mengikut konfigurasi skala versi). Disimpan secara automatik dengan sokongan penjejakan TOV, OTI, AR, dan ETR.
                    </p>
                  </div>
                  <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-bold text-blue-400">
                    <span>Buka PBD</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              ) : null}

              {/* UASA Entry Card */}
              {isGuru && !isAkp ? (
                <div 
                  onClick={() => { setActiveWorkspace('academic'); setAcademicTab('uasa'); }}
                  className="bg-slate-900/90 border border-slate-800 hover:border-blue-500/50 rounded-3xl p-6 transition-all cursor-pointer group shadow-lg flex flex-col justify-between"
                >
                  <div>
                    <div className="w-12 h-12 rounded-2xl bg-amber-600/20 text-amber-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Award className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-bold text-white group-hover:text-amber-400 transition-colors">
                      UASA (Pentaksiran Sumatif)
                    </h3>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                      Pemasukan skor markah & penentuan gred rasmi KPM (A Cemerlang, B Kepujian, C Baik, D Memuaskan, E Tahap Minimum, F Belum Mencapai).
                    </p>
                  </div>
                  <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-bold text-amber-400">
                    <span>Buka UASA</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              ) : null}

              {/* Kokurikulum Card */}
              {isGuru && !isAkp ? (
                <div 
                  onClick={() => setActiveWorkspace('kokurikulum')}
                  className="bg-slate-900/90 border border-slate-800 hover:border-amber-500/50 rounded-3xl p-6 transition-all cursor-pointer group shadow-lg flex flex-col justify-between"
                >
                  <div>
                    <div className="w-12 h-12 rounded-2xl bg-amber-600/20 text-amber-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Trophy className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-bold text-white group-hover:text-amber-400 transition-colors">
                      Pengurusan Kokurikulum (KPM)
                    </h3>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                      Jawatankuasa unit beruniform, persatuan, sukan, perekodan 12 siri perjumpaan, Smart OPR dengan pemisahan jurulatih & pengiring, serta analisis interaktif.
                    </p>
                  </div>
                  <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-bold text-amber-400">
                    <span>Buka Kokurikulum</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              ) : null}

              {/* Makluman & Tugasan WhatsApp Card (Semua Warga Sekolah) */}
              <div 
                onClick={() => setActiveWorkspace('makluman')}
                className="bg-slate-900/90 border border-slate-800 hover:border-indigo-500/50 rounded-3xl p-6 transition-all cursor-pointer group shadow-lg flex flex-col justify-between"
              >
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Bell className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white group-hover:text-indigo-400 transition-colors">
                    Makluman & Tugasan Pintar
                  </h3>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    Peringatan tarikh akhir, semakan status tugasan, pautan WhatsApp pantas satu-klik, radar pemantauan tertunggak Guru Besar & evidens skor PBPPP.
                  </p>
                </div>
                <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-bold text-indigo-400">
                  <span>Buka Makluman</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>

              {/* Kehadiran Staf Card */}
              <div 
                onClick={() => setActiveWorkspace('attendance')}
                className="bg-slate-900/90 border border-slate-800 hover:border-emerald-500/50 rounded-3xl p-6 transition-all cursor-pointer group shadow-lg flex flex-col justify-between"
              >
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Clock className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors">
                    Kehadiran Staf (Guru & AKP)
                  </h3>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    Sistem punch in/out dengan pengesahan GPS berpagar geofence, rekod dua sesi sehari, dan laporan kehadiran bulanan sekolah.
                  </p>
                </div>
                <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-bold text-emerald-400">
                  <span>Buka Kehadiran</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>

              {/* Master Data Card (Principal Only) */}
              {isPrincipal && (
                <div 
                  onClick={() => setActiveWorkspace('master-data')}
                  className="bg-slate-900/90 border border-slate-800 hover:border-indigo-500/50 rounded-3xl p-6 transition-all cursor-pointer group shadow-lg flex flex-col justify-between"
                >
                  <div>
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <FileSpreadsheet className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-bold text-white group-hover:text-indigo-400 transition-colors">
                      Master Data & Import Guru
                    </h3>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                      Import senarai guru rasmi dari Google Sheets sekolah, pengurusan data induk personel, struktur kelas, dan rekod integriti data.
                    </p>
                  </div>
                  <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-bold text-indigo-400">
                    <span>Buka Master Data</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              )}
            </div>

            {/* Academic Visual Standard Summary Reference */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-400" />
                Standard Visual Pentaksiran & Skala Versi Terkawal (KPM Reference)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800/60">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block mb-2">Standard Warna PBD (TP1–TP6)</span>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-2 py-1 bg-red-950 border border-red-700/60 text-red-300 rounded font-bold">TP1 / TP2 (Intervensi Pantas)</span>
                    <span className="px-2 py-1 bg-amber-950 border border-amber-700/60 text-amber-300 rounded font-bold">TP3 (Pengukuhan)</span>
                    <span className="px-2 py-1 bg-emerald-950 border border-emerald-700/60 text-emerald-300 rounded font-bold">TP4 / TP5 / TP6 (Mencapai Tahap)</span>
                  </div>
                </div>
                <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800/60">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block mb-2">Gred Rasmi UASA</span>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-2 py-1 bg-emerald-950 border border-emerald-700/60 text-emerald-300 rounded font-bold">A (82–100) / B (66–81)</span>
                    <span className="px-2 py-1 bg-yellow-950 border border-yellow-700/60 text-yellow-300 rounded font-bold">C (50–65)</span>
                    <span className="px-2 py-1 bg-orange-950 border border-orange-700/60 text-orange-300 rounded font-bold">D (35–49)</span>
                    <span className="px-2 py-1 bg-red-950 border border-red-700/60 text-red-300 rounded font-bold">E (20–34) / F (0–19)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ---------------- MAKLUMAN & TUGASAN WHATSAPP WORKSPACE ---------------- */}
        {activeWorkspace === 'makluman' && (
          <div className="animate-fade-in">
            <PaparanMaklumanView
              currentTeacher={currentUser}
              schoolProfile={schoolSettings}
              isPrincipalOrAdmin={isPrincipal}
            />
          </div>
        )}

        {/* ---------------- SURAT MASUK (PEMBANTU OPERASI) WORKSPACE ---------------- */}
        {activeWorkspace === 'surat-masuk' && (
          <div className="animate-fade-in">
            <SuratMasukManagerView
              currentUid={currentUser.uid}
              currentUserName={currentUser.name}
              schoolProfile={schoolSettings}
              onNavigateToRelief={() => {
                setActiveWorkspace('academic');
                setAcademicTab('relief');
              }}
            />
          </div>
        )}

        {/* ---------------- 2. AKADEMIK WORKSPACE ---------------- */}
        {activeWorkspace === 'academic' && (
          <div className="space-y-6 animate-fade-in">
            {/* Academic Subtabs Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-3">
              <div className="flex items-center space-x-2 flex-wrap gap-y-2">
                <button
                  onClick={() => setAcademicTab('pbd')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    academicTab === 'pbd'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  PBD (Tahap Penguasaan)
                </button>
                <button
                  onClick={() => setAcademicTab('uasa')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    academicTab === 'uasa'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  UASA (Sumatif)
                </button>
                <button
                  onClick={() => setAcademicTab('analysis')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    academicTab === 'analysis'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  Analisis Prestasi
                </button>
                <button
                  onClick={() => setAcademicTab('timetable')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    academicTab === 'timetable'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  Jadual Waktu (Matriks Agihan)
                </button>
                <button
                  onClick={() => setAcademicTab('relief')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    academicTab === 'relief'
                      ? 'bg-amber-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Jadual Ganti (Relief)</span>
                </button>
                <button
                  onClick={() => setAcademicTab('opr')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    academicTab === 'opr'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <span>Laporan OPR (Aktiviti & PLC)</span>
                </button>
              </div>

              <span className="text-[11px] font-mono font-bold text-emerald-400 px-3 py-1 bg-emerald-950/60 border border-emerald-800/60 rounded-lg">
                Mode: OPEN_TEACHERS
              </span>
            </div>

            {/* Academic Workspace Content */}
            {academicTab === 'pbd' && (
              <SubjectTeacherView profile={currentUser} initialAssessmentType="PBD" />
            )}

            {academicTab === 'uasa' && (
              <SubjectTeacherView profile={currentUser} initialAssessmentType="UASA" />
            )}

            {academicTab === 'analysis' && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6">
                <AcademicAnalysisDashboard records={[]} />
              </div>
            )}

            {academicTab === 'timetable' && (
              <div className="animate-fade-in">
                <TimetableSystem 
                  activeAcademicYear="2027" 
                  initialTab={isPrincipal ? 'AGIHAN' : 'JG1_50'}
                  schoolCode={displaySchoolCode}
                  schoolName={displaySchoolName}
                />
              </div>
            )}

            {academicTab === 'relief' && (
              <div className="animate-fade-in">
                <ReliefSchedulingView
                  currentUser={currentUser}
                  schoolSettings={schoolSettings}
                  onNavigateToSuratMasuk={() => setActiveWorkspace('surat-masuk')}
                />
              </div>
            )}

            {academicTab === 'opr' && (
              <div className="animate-fade-in">
                <AcademicOPRManager 
                  currentUser={currentUser} 
                  schoolSettings={schoolSettings} 
                />
              </div>
            )}
          </div>
        )}

        {/* ---------------- KOKURIKULUM WORKSPACE ---------------- */}
        {activeWorkspace === 'kokurikulum' && (
          <div className="animate-fade-in">
            <KokurikulumSystem
              currentUser={currentUser}
              profile={currentUser}
              role={isPrincipal ? 'pentadbir' : 'guru'}
              schoolSettings={schoolSettings}
            />
          </div>
        )}

        {/* ---------------- 3. KEHADIRAN STAF WORKSPACE ---------------- */}
        {activeWorkspace === 'attendance' && (
          <div className="space-y-6 animate-fade-in">
            {/* Principal view switcher if role is Principal */}
            {isPrincipal && (
              <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-2xl p-3">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setPrincipalAttendanceView('punch')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      principalAttendanceView === 'punch'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    Kad Perekodan (Punch In / Out)
                  </button>
                  <button
                    onClick={() => setPrincipalAttendanceView('management')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      principalAttendanceView === 'management'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    Kawalan & Laporan Guru Besar
                  </button>
                </div>
                <span className="text-xs text-slate-400 hidden sm:inline">
                  Pengesahan GPS Berpagar (Aktif)
                </span>
              </div>
            )}

            {/* Attendance Content: Render StaffPunchIn or Principal Dashboard */}
            {isPrincipal && principalAttendanceView === 'management' ? (
              <PrincipalDashboard
                currentUser={currentUser}
                schoolSettings={schoolSettings}
                onUpdateSchoolSettings={onUpdateSchoolSettings}
              />
            ) : (
              <StaffPunchIn currentUser={currentUser} />
            )}
          </div>
        )}

        {/* ---------------- 4. MASTER DATA WORKSPACE ---------------- */}
        {activeWorkspace === 'master-data' && (
          <div className="animate-fade-in">
            {isPrincipal ? (
              <MasterDataDashboard
                schoolCode={displaySchoolCode}
                schoolSettings={schoolSettings}
                currentUser={currentUser}
                onUpdateSchoolSettings={onUpdateSchoolSettings}
              />
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center max-w-md mx-auto my-12 shadow-2xl">
                <AlertTriangle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-white mb-2">Akses Terhad / Ditolak</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Ruang kerja Master Data dikhaskan untuk Guru Besar dan Pentadbir Sistem sahaja bagi memelihara integriti rekod induk sekolah.
                </p>
                <button
                  onClick={() => setActiveWorkspace('dashboard')}
                  className="mt-6 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold uppercase transition"
                >
                  Kembali ke Dashboard
                </button>
              </div>
            )}
          </div>
        )}

      </main>

      {/* ================= FOOTER ================= */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500">
        <p>
          iSEPADU AI &copy; {new Date().getFullYear()} · {displaySchoolName} ({displaySchoolCode})
          {' · '}{displaySlogan}
        </p>
      </footer>

      {/* School Logo Upload & URL Extraction Modal */}
      <SchoolLogoModal
        isOpen={isLogoModalOpen}
        onClose={() => setIsLogoModalOpen(false)}
        currentLogoUrl={displayLogo}
        schoolCode={displaySchoolCode}
        onLogoUpdated={(newLogo) => {
          if (onUpdateSchoolSettings) {
            onUpdateSchoolSettings({
              ...(schoolSettings || {
                schoolName: displaySchoolName,
                schoolCode: displaySchoolCode,
                principalEmail: currentUser.email,
                principalUid: currentUser.uid,
              }),
              schoolLogo: newLogo,
              logoUrl: newLogo,
            });
          }
        }}
      />

      {/* Self-Service Change Password Modal */}
      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        teacherId={currentUser.uid}
        userEmail={currentUser.email}
        isFirstLoginDefaultPassword={(currentUser as any).mustChangePassword === true}
        onSuccess={() => {
          (currentUser as any).mustChangePassword = false;
        }}
      />
    </div>
  );
};

export default ISEPADUShell;
