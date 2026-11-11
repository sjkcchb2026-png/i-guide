
import React, { useState, useEffect } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, signOut, signInAnonymously } from 'firebase/auth';
import { googleProvider } from './lib/firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { Role, UserProfile } from './types';
import { LayoutDashboard, GraduationCap, BookOpen, Users, LogOut, Settings, BarChart3, AlertCircle, Home, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CLASSES, SCHOOL_NAME_MS } from './constants';
import SchoolLogo from './components/SchoolLogo';
import LandingView from './components/Landing/LandingView';
import EscosStartPortal from './components/Landing/EscosStartPortal';

// Views
import SubjectTeacherView from './components/Teacher/SubjectTeacherView';
import ClassTeacherView from './components/Teacher/ClassTeacherView';
import AssessmentSecretaryView from './components/Teacher/AssessmentSecretaryView';
import HeadOfDeptView from './components/Dashboard/HeadOfDeptView';
import AdminDashboard from './components/Dashboard/AdminDashboard';
import StudentView from './components/Student/StudentView';
import KokurikulumSystem from './components/Dashboard/KokurikulumSystem';
import IntegratedActivitySystem from './components/Dashboard/IntegratedActivitySystem';
import PentadbiranSystem from './components/Pentadbiran/PentadbiranSystem';
import PrincipalDashboard from './components/Dashboard/PrincipalDashboard';
import DailySchoolExperience from './components/Dashboard/DailySchoolExperience';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dsx');
  const [showRoleSelection, setShowRoleSelection] = useState(false);
  const [selectedModule, setSelectedModule] = useState<'prasekolah' | 'kurikulum' | 'hem' | 'kokurikulum' | 'laporan_aktiviti' | 'pentadbiran' | null>(null);
  const [showEscosStart, setShowEscosStart] = useState(true);
  const [selectedRoleCategory, setSelectedRoleCategory] = useState<'pentadbir' | 'guru' | 'student' | null>(null);
  const [customTeacherName, setCustomTeacherName] = useState('');

  // Sync teacher name when user signs in
  useEffect(() => {
    if (user && !customTeacherName) {
      setCustomTeacherName(user.displayName || '');
    }
  }, [user]);

  // Background cleanup: Purge unwanted simulation students and their co-curricular memberships / results
  useEffect(() => {
    if (!user) return; // Only execute when user is authenticated to have correct security permissions

    const purgeUnusedSampleStudents = async () => {
      try {
        const { collection, getDocs, deleteDoc } = await import('firebase/firestore');
        const studentsSnap = await getDocs(collection(db, 'students'));
        const deletePromises: Promise<any>[] = [];
        const deletedStudentIds: string[] = [];

        studentsSnap.docs.forEach(d => {
          const data = d.data();
          const name = String(data.name || '').toLowerCase();
          const studentId = String(data.student_id || '').trim();

          const isTestId = ['S001', 'S002', 'S26201', 'demo-st', 'demo_st'].includes(studentId.toLowerCase()) || studentId.toLowerCase().includes('test');
          const isTestName = name.includes('muthu') || 
                             name.includes('siti nurhaliza') || 
                             name.includes('ahmad faiz') || 
                             name.includes('tan ah kau') ||
                             name.includes('trial') ||
                             name.includes('demo') ||
                             name.includes('percubaan');

          if (isTestId || isTestName) {
            // Delete student record
            deletePromises.push(deleteDoc(d.ref));
            if (studentId) {
              deletedStudentIds.push(studentId);
            }
          }
        });

        if (deletePromises.length > 0) {
          await Promise.all(deletePromises);
          console.log(`Successfully purged ${deletePromises.length} trial/demo students.`);
        }

        // Cascade delete trial entries in academic scores and co-curricular memberships
        const extraDeletes: Promise<any>[] = [];
        if (deletedStudentIds.length > 0) {
          const academicCollections = ['uasa_results', 'pbd_results', 'koko_memberships'];
          for (const collName of academicCollections) {
            const collSnap = await getDocs(collection(db, collName));
            collSnap.docs.forEach(docDoc => {
              const itemData = docDoc.data();
              const itemStudentId = String(itemData.student_id || '').trim();
              if (deletedStudentIds.includes(itemStudentId) || !itemStudentId || itemStudentId.toLowerCase().includes('demo')) {
                extraDeletes.push(deleteDoc(docDoc.ref));
              }
            });
          }
        }

        // Clean orphaned or mockup memberships where names contain trial items
        const membershipsSnap = await getDocs(collection(db, 'koko_memberships'));
        membershipsSnap.docs.forEach(mDoc => {
          const mData = mDoc.data();
          const mName = String(mData.name || '').toLowerCase();
          const mSId = String(mData.student_id || '').trim();
          const isMock = mName.includes('muthu') || 
                         mName.includes('siti nurhaliza') || 
                         mName.includes('ahmad faiz') || 
                         mName.includes('tan ah kau') ||
                         ['s001', 's002', 's26201', 'demo-st', 'demo_st'].includes(mSId.toLowerCase());
          if (isMock) {
            extraDeletes.push(deleteDoc(mDoc.ref));
          }
        });

        if (extraDeletes.length > 0) {
          await Promise.all(extraDeletes);
          console.log(`Cascade deleted ${extraDeletes.length} academic and co-curricular records assigned to trial students.`);
        }
      } catch (err) {
        console.error("Failed to automatically purge sample students:", err);
      }
    };

    purgeUnusedSampleStudents();
  }, [user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setProfile(docSnap.data() as UserProfile);
        } else {
          // Try to auto-match registered student email
          let autoMatched = false;
          if (user.email) {
            try {
              const qS = query(collection(db, 'students'), where('email', '==', user.email.toLowerCase().trim()));
              const snapshotS = await getDocs(qS);
              if (!snapshotS.empty) {
                const matchedStudent = snapshotS.docs[0].data();
                const newProfile: UserProfile = {
                  uid: user.uid,
                  name: matchedStudent.name,
                  email: user.email.toLowerCase().trim(),
                  role: 'student',
                  class_assigned: matchedStudent.class,
                  year_assigned: Number(matchedStudent.year),
                  academic_year: matchedStudent.academic_year || '2026'
                };
                await setDoc(doc(db, 'users', user.uid), newProfile);
                setProfile(newProfile);
                setShowRoleSelection(false);
                autoMatched = true;
                console.log(`Auto-matched logged-in user ${user.email} as student: ${matchedStudent.name}`);
              }
            } catch (errMatch) {
              console.error("Gagal melakukan padanan emel automatik murid:", errMatch);
            }
          }
          
          if (!autoMatched) {
            setProfile(null); 
            setShowRoleSelection(true);
          }
        }
      } else {
        setProfile(null);
        setShowRoleSelection(false);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const [showAdminPass, setShowAdminPass] = useState(false);
  const [adminPassInput, setAdminPassInput] = useState('');
  const [adminError, setAdminError] = useState('');

  const [showVisitorPass, setShowVisitorPass] = useState(false);
  const [visitorPassInput, setVisitorPassInput] = useState('');
  const [visitorError, setVisitorError] = useState('');

  const handleVisitorAuth = async () => {
    if (visitorPassInput === '<REDACTED_HARDCODED_CREDENTIAL>' || visitorPassInput === '<REDACTED_HARDCODED_CREDENTIAL>') {
      setLoginLoading(true);
      setVisitorError('');
      try {
        const credentials = await signInAnonymously(auth);
        const visitorUid = credentials.user.uid;
        
        const newProfile: UserProfile = {
          uid: visitorUid,
          name: 'PELAWAT LUAR / PIBG',
          email: 'visitor@ekhua.edu.my',
          role: 'visitor',
          academic_year: '2026'
        };
        await setDoc(doc(db, 'users', visitorUid), newProfile);
        setProfile(newProfile);
        setShowVisitorPass(false);
        setShowRoleSelection(false);
      } catch (err: any) {
        console.error("Gagal log masuk pelawat:", err);
        setVisitorError('Sistem gagal memproses sesi pelawat.');
      } finally {
        setLoginLoading(false);
      }
    } else {
      setVisitorError('Kata laluan pelawat salah. Sila hubungi pihak sekolah.');
    }
  };

  const handleCreateProfile = async (selectedRole: Role, enteredName?: string) => {
    if (!user) return;
    
    if (selectedRole === 'admin') {
      setShowAdminPass(true);
      return;
    }

    const nameToUse = enteredName || customTeacherName || user.displayName || 'Guru SJK(C) Ek Hua';
    const newProfile: UserProfile = {
      uid: user.uid,
      name: nameToUse.toUpperCase(),
      email: user.email || 'guest@ekhua.edu.my',
      role: selectedRole
    };
    await setDoc(doc(db, 'users', user.uid), newProfile);
    setProfile(newProfile);
    setShowRoleSelection(false);
  };

  const handleAdminAuth = async () => {
    if (adminPassInput === '<REDACTED_HARDCODED_CREDENTIAL>') {
      const nameToUse = customTeacherName || user.displayName || 'Pentadbir SJK(C) Ek Hua';
      const newProfile: UserProfile = {
        uid: user.uid,
        name: nameToUse.toUpperCase(),
        email: user.email || 'guest@ekhua.edu.my',
        role: 'admin'
      };
      await setDoc(doc(db, 'users', user.uid), newProfile);
      setProfile(newProfile);
      setShowAdminPass(false);
      setShowRoleSelection(false);
    } else {
      setAdminError('Kata laluan salah. Sila cuba lagi.');
    }
  };

  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (loginLoading) return;
    setLoginLoading(true);
    setLoginError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Login error:", error);
      if (error.code === 'auth/popup-blocked') {
        setLoginError('Sila benarkan tetingkap timbul (pop-up) dalam penyemak imbas anda untuk log masuk.');
      } else if (error.code === 'auth/cancelled-popup-request') {
        // Ignore this as it's usually harmless
      } else {
        setLoginError('Log masuk gagal. Sila cuba lagi.');
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    if (loginLoading) return;
    setLoginLoading(true);
    setLoginError(null);
    try {
      await signInAnonymously(auth);
    } catch (error: any) {
      console.error("Guest login error:", error);
      setLoginError('Log masuk tanpa e-mel gagal. Sila cuba lagi.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
    </div>
  );

  // If no module is selected, show the Escos Start Portal first
  if (showEscosStart && !selectedModule) {
    return (
      <EscosStartPortal 
        onEnter={() => setShowEscosStart(false)} 
        profile={profile} 
        user={user} 
        onLogin={handleLogin} 
        onLogout={handleLogout} 
      />
    );
  }

  // If no module is selected, show the Landing Screen
  if (!selectedModule) {
    return <LandingView onSelectModule={setSelectedModule} onBackToHome={() => setShowEscosStart(true)} />;
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 font-sans p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-lg p-10 bg-white rounded-[40px] shadow-2xl border border-slate-100 text-center"
        >
          <div className="mb-10 relative">
             <div className="absolute -top-10 -left-10 w-32 h-32 bg-blue-600 opacity-5 rounded-full blur-2xl"></div>
             <SchoolLogo className="w-32 h-32 mx-auto relative z-10" p="p-4" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">{SCHOOL_NAME_MS}</h1>
          <p className="text-slate-500 mt-2 text-sm font-medium uppercase tracking-[0.2em] mb-12">Digital Management Portal — {selectedModule}</p>
          
          <button 
            onClick={handleLogin}
            disabled={loginLoading}
            className={`group w-full py-6 px-12 bg-slate-900 hover:bg-black text-white font-black rounded-3xl transition-all duration-300 flex items-center justify-center gap-6 shadow-2xl shadow-slate-200 active:scale-95 uppercase tracking-[0.3em] text-xs ${loginLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {loginLoading ? (
              <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <img src="https://www.google.com/favicon.ico" className="w-6 h-6 bg-white rounded-full p-1" alt="Google" />
            )}
            {loginLoading ? 'Menyambung...' : 'Log Masuk DELIMa'}
          </button>

          <div className="relative flex py-4 items-center">
            <div className="flex-grow border-t border-slate-100"></div>
            <span className="flex-shrink mx-4 text-slate-400 text-[9px] font-black uppercase tracking-widest">ATAU</span>
            <div className="flex-grow border-t border-slate-100"></div>
          </div>

          <button 
            onClick={handleGuestLogin}
            disabled={loginLoading}
            className="w-full py-4.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-black rounded-2xl transition-all duration-300 flex items-center justify-center gap-2 active:scale-95 uppercase tracking-[0.2em] text-[10px] border border-slate-200"
          >
            Log Masuk Cepat (Tanpa E-mel / Tetamu)
          </button>

          {selectedModule === 'kokurikulum' && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              {!showVisitorPass ? (
                <button 
                  onClick={() => setShowVisitorPass(true)}
                  className="w-full py-4.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-black rounded-2xl transition-all duration-300 flex items-center justify-center gap-2 active:scale-95 uppercase tracking-[0.2em] text-[10px] border border-indigo-100"
                >
                  🚪 Portal Pelawat Kokurikulum (Sila Masuk Password)
                </button>
              ) : (
                <div className="bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100 space-y-3 text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">Kebenaran Akses Pelawat</span>
                    <button 
                      onClick={() => {
                        setShowVisitorPass(false);
                        setVisitorPassInput('');
                        setVisitorError('');
                      }}
                      className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      Batal
                    </button>
                  </div>
                  <input 
                    type="password"
                    value={visitorPassInput}
                    onChange={e => setVisitorPassInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleVisitorAuth(); }}
                    placeholder="Masukkan Kata Laluan Pelawat"
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs outline-none focus:ring-2 focus:ring-indigo-500 font-bold uppercase tracking-widest text-center"
                  />
                  {visitorError && (
                    <p className="text-[9px] text-rose-600 font-black uppercase tracking-wider">{visitorError}</p>
                  )}
                  <button 
                    onClick={handleVisitorAuth}
                    disabled={loginLoading}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-[10px] uppercase tracking-widest transition-all"
                  >
                    Sahkan & Masuk Laporan
                  </button>
                </div>
              )}
            </div>
          )}
          
          {loginError && (
            <div className="mt-8 p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-3 animate-bounce">
              <AlertCircle size={16} />
              {loginError}
            </div>
          )}

          <button 
            onClick={() => setSelectedModule(null)}
            className="mt-12 text-slate-400 hover:text-slate-900 transition-colors text-[10px] font-black uppercase tracking-[0.4em] flex items-center justify-center gap-2 mx-auto"
          >
            <Home size={14} />
            Kembali ke Laman Utama
          </button>
        </motion.div>
      </div>
    );
  }

  // Handle module-specific logic after login
  if (selectedModule === 'kokurikulum' && profile) {
    return <KokurikulumSystem profile={profile} onHome={() => setSelectedModule(null)} />;
  }

  if (selectedModule === 'laporan_aktiviti' && profile) {
    return <IntegratedActivitySystem profile={profile} onHome={() => setSelectedModule(null)} />;
  }

  if (selectedModule === 'pentadbiran' && profile) {
    return <PentadbiranSystem profile={profile} onHome={() => setSelectedModule(null)} />;
  }

  if (selectedModule !== 'kurikulum') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-16 rounded-[50px] shadow-2xl border border-slate-100 max-w-xl"
        >
          <div className="w-24 h-24 bg-blue-50 text-blue-600 rounded-[32px] flex items-center justify-center mx-auto mb-10 shadow-lg shadow-blue-50">
            <LayoutDashboard size={48} />
          </div>
          <h2 className="text-4xl font-black italic uppercase tracking-tighter text-slate-900 mb-6">{selectedModule}</h2>
          <p className="text-slate-500 font-medium mb-12 leading-relaxed">Halaman ini sedang dalam pembangunan. Sila kembali tidak lama lagi untuk melihat kemas kini sistem.</p>
          <button 
            onClick={() => setSelectedModule(null)}
            className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black uppercase text-xs tracking-[0.4em] hover:bg-black transition-all shadow-2xl shadow-slate-200"
          >
            Portal Utama
          </button>
        </motion.div>
      </div>
    );
  }

  // Role Selection Screen for New Users or when switching role
  if (user && (!profile || showRoleSelection)) {
    const categories = [
      { id: 'pentadbir', label: 'PENTADBIR GURU', desc: 'Sistem, sekolah, GPK & Setiausaha', icon: <Shield size={22} className="text-indigo-500" /> },
      { id: 'guru', label: 'GURU AKADEMIK', desc: 'Ketua Panitia, Guru Kelas & Mata Pelajaran', icon: <BookOpen size={22} className="text-blue-500" /> },
      { id: 'student', label: 'MURID / WARIS', desc: 'Pelajar SJK(C) Ek Hua Mukah', icon: <Users size={22} className="text-amber-500" /> },
    ];

    const subRoles: Record<string, { id: Role; label: string; desc: string }[]> = {
      pentadbir: [
        { id: 'admin', label: 'Pentadbir Sistem Utama (Sistem)', desc: 'Pengurusan am sistem, kebenaran guru, pendaftaran & utiliti.' },
        { id: 'secretary', label: 'Setiausaha Peperiksaan', desc: 'Import data SAPS, analisis am prestasi akademik dan cetakan.' },
        { id: 'principal', label: 'Guru Besar (Penyelaras)', desc: 'Pemantauan program strategik, paparan takwin, dan penghantaran amaran / peringatan guru.' }
      ],
      guru: [
        { id: 'head_department', label: 'Ketua Panitia', desc: 'Analisis mata pelajaran khusus, ulasan pencapaian & intervensi subjek.' },
        { id: 'class_teacher', label: 'Guru Kelas / Kelas Utama', desc: 'Pengurusan profil kelas, rekod ulasan rumusan, cetakan slip pelaporan.' },
        { id: 'subject_teacher', label: 'Guru Mata Pelajaran', desc: 'Pemasukan TP PBD akademik, markah peperiksaan UASA dan tindakan intervensi.' }
      ],
      student: [
        { id: 'student', label: 'Murid Sekolah', desc: 'Menyemak keputusan pelaporan peribadi, status sahsiah & markah kokurikulum.' }
      ]
    };

    const handleSelectRole = (roleId: Role) => {
      handleCreateProfile(roleId, customTeacherName);
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 p-6 py-12 overflow-y-auto relative font-sans text-white">
        {/* Ambient effect */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20">
          <div className="absolute top-[20%] left-[25%] w-[40%] h-[40%] bg-blue-500 rounded-full blur-[120px]" />
          <div className="absolute bottom-[20%] right-[25%] w-[40%] h-[40%] bg-indigo-500 rounded-full blur-[120px]" />
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="w-full max-w-3xl bg-slate-950/75 border border-slate-800 rounded-[44px] shadow-2xl p-8 lg:p-12 relative z-10 backdrop-blur-md"
        >
          <div className="text-center mb-10">
            <SchoolLogo className="w-20 h-20 mx-auto mb-6 bg-white/5 p-1 rounded-2xl" />
            <h2 className="text-3xl font-black italic uppercase tracking-tighter text-white mb-2">Penetapan Peranan & Jawatan</h2>
            <p className="text-slate-400 text-sm font-medium">Sistem iSEPADU AI mengesahkan akaun DELIMa dan memadankan kebenaran akses anda.</p>
          </div>

          {/* Locked Identity Info Card */}
          <div className="bg-slate-900/80 border border-slate-800/80 rounded-3xl p-6 lg:p-8 mb-8 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="space-y-1">
              <span className="text-[10px] font-mono font-black text-blue-400 tracking-wider block uppercase">Akaun Pengguna</span>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full animate-pulse shrink-0 ${user.isAnonymous ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                <span className="text-sm font-black text-slate-200 tracking-tight block truncate text-slate-200" title={user.email || 'Sesi Tanpa E-mel'}>
                  {user.email || 'SESI TANPA E-MEL (TETAMU)'}
                </span>
              </div>
              <span className="text-[9px] text-slate-500 font-bold uppercase block mt-1">
                {user.isAnonymous ? 'Menggunakan akses masuk ringkas' : 'Sertifikasi Domain Google Sekolah'}
              </span>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-mono font-black text-blue-400 tracking-wider block uppercase">Nama Penuh Pengguna</span>
              <input
                type="text"
                required
                value={customTeacherName}
                onChange={e => setCustomTeacherName(e.target.value)}
                placeholder="Sila masukkan nama rasmi untuk laporan..."
                className="w-full bg-slate-950 border border-slate-800/80 rounded-xl p-3 text-xs text-white font-bold placeholder:text-slate-600 outline-none focus:border-blue-500/50 transition-colors uppercase"
              />
            </div>
          </div>

          {/* Category Selection View */}
          <div className="space-y-6">
            <div>
              <span className="text-[10px] font-mono font-black text-blue-400 tracking-[0.2em] block uppercase mb-3">LANGKAH 1: Pilih Kategori Stans / Jawatan Utama</span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {categories.map(cat => {
                  const isActive = selectedRoleCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedRoleCategory(cat.id as any)}
                      className={`p-5 text-left rounded-3xl border transition-all relative flex flex-col gap-2 cursor-pointer ${
                        isActive
                        ? 'bg-blue-600/10 border-blue-500/50 shadow-lg shadow-blue-500/5'
                        : 'bg-slate-900/40 border-slate-850 hover:border-slate-800'
                      }`}
                    >
                      {cat.icon}
                      <span className={`block text-xs font-black uppercase mt-1 ${isActive ? 'text-blue-400' : 'text-slate-300'}`}>{cat.label}</span>
                      <span className="block text-[10px] text-slate-500 font-medium leading-relaxed">{cat.desc}</span>
                      {isActive && <span className="absolute top-4 right-4 text-xs font-black text-blue-400 font-mono">✔ SELECTED</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sub roles selector based on active category */}
            <AnimatePresence mode="wait">
              {selectedRoleCategory && (
                <motion.div
                  key={selectedRoleCategory}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-3"
                >
                  <span className="text-[10px] font-mono font-black text-blue-400 tracking-[0.2em] block uppercase mt-4">LANGKAH 2: Daftar Tugas / Bidang Kuasa Khusus</span>
                  
                  <div className="grid grid-cols-1 gap-3 max-h-[25vh] overflow-y-auto pr-1">
                    {subRoles[selectedRoleCategory].map(role => (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => handleSelectRole(role.id)}
                        disabled={!customTeacherName.trim()}
                        className={`group p-4 px-6 text-left border rounded-2xl transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer ${
                          !customTeacherName.trim() 
                          ? 'opacity-50 cursor-not-allowed border-slate-800 bg-slate-900/10' 
                          : 'bg-slate-900/50 hover:bg-slate-900 border-slate-850 hover:border-blue-500/40'
                        }`}
                      >
                        <div>
                          <span className="block text-xs font-black text-white group-hover:text-blue-400 uppercase tracking-tight">{role.label}</span>
                          <span className="block text-[10.5px] text-slate-400 leading-normal mt-0.5">{role.desc}</span>
                        </div>
                        <span className="text-[10px] font-black text-blue-500 uppercase tracking-wider block shrink-0">
                          {!customTeacherName.trim() ? "Isi Nama Terlebih Dahulu" : "Daftar Tugas ➔"}
                        </span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Admin authorization dialog triggers */}
          <AnimatePresence>
            {showAdminPass && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 text-xs"
              >
                <motion.div 
                  initial={{ scale: 0.9, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  className="bg-slate-900 border border-slate-800 rounded-3xl p-8 w-full max-w-sm shadow-2xl text-slate-300"
                >
                  <h3 className="text-sm font-black text-white mb-2 uppercase tracking-wider">Pengesahan Pentadbir Utama</h3>
                  <p className="text-[10px] text-slate-400 mb-6 leading-relaxed">Sila masukkan kata laluan khas keselamatan pentadbiran untuk mengesahkan peranan ini.</p>
                  <input 
                    type="password" 
                    value={adminPassInput}
                    onChange={(e) => {
                      setAdminPassInput(e.target.value);
                      setAdminError('');
                    }}
                    placeholder="KATA LALUAN KESELAMATAN"
                    className="w-full border border-slate-800 bg-slate-950 text-white rounded-xl p-3 mb-2 uppercase font-mono tracking-widest text-center"
                  />
                  {adminError && <p className="text-[10px] text-rose-400 mb-4 font-bold text-center uppercase">{adminError}</p>}
                  
                  <div className="flex gap-2 pt-4">
                    <button 
                      onClick={() => {
                        setShowAdminPass(false);
                        setAdminPassInput('');
                        setAdminError('');
                      }}
                      className="flex-1 py-3 text-slate-400 font-bold uppercase tracking-widest hover:text-white rounded-xl transition-colors"
                    >
                      Batal
                    </button>
                    <button 
                      onClick={handleAdminAuth}
                      className="flex-1 py-3 bg-blue-600 text-white font-black uppercase tracking-widest rounded-xl hover:bg-blue-500 transition-colors shadow-lg shadow-blue-500/15"
                    >
                      Sahkan Unit
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-10 pt-8 border-t border-slate-800/80 flex justify-center">
            <button onClick={handleLogout} className="text-slate-500 hover:text-red-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 cursor-pointer transition-colors">
              <LogOut size={14} /> Batal Sesi & Log Keluar
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const renderContent = () => {
    if (!profile) return null;
    
    switch (profile.role) {
      case 'subject_teacher': return <SubjectTeacherView profile={profile} />;
      case 'class_teacher': return <ClassTeacherView profile={profile} />;
      case 'secretary': return <AssessmentSecretaryView />;
      case 'head_department': return <HeadOfDeptView profile={profile} />;
      case 'admin': return <AdminDashboard profile={profile} />;
      case 'student': return <StudentView profile={profile} />;
      case 'principal': return <PrincipalDashboard profile={profile} />;
      case 'visitor': return <KokurikulumSystem profile={profile} onHome={() => setSelectedModule(null)} />;
      default: return <div>Unauthorized Role</div>;
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col hidden lg:flex">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <SchoolLogo className="w-10 h-10" />
            <div className="flex flex-col">
              <span className="font-black text-sm tracking-tight leading-none">{SCHOOL_NAME_MS}</span>
            </div>
          </div>
          
          <nav className="space-y-1">
            <button 
              onClick={() => setSelectedModule(null)}
              className="w-full flex items-center gap-3 px-3 py-3 mb-4 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-lg shadow-slate-200 group"
            >
              <Home size={18} className="group-hover:scale-110 transition-transform" />
              Portal Utama
            </button>
            <div className="h-px bg-slate-100 my-4"></div>
            <NavItem active={activeTab === 'dsx'} onClick={() => setActiveTab('dsx')} icon={<Home size={20} />} label="Pusat Kawalan (DSX)" />
            <NavItem active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={20} />} label="Urusan Peranan" />
            <NavItem active={false} onClick={() => { setShowRoleSelection(true); setActiveTab('dsx'); }} icon={<Users size={20} />} label="Tukar Peranan" />
            {profile?.role === 'admin' && <NavItem active={activeTab === 'users'} onClick={() => setActiveTab('users')} icon={<Users size={20} />} label="User Management" />}
          </nav>
        </div>
        
        <div className="mt-auto p-6 border-t border-slate-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
              <span className="text-slate-600 font-bold uppercase">{profile?.name?.charAt(0) || profile?.email?.charAt(0) || 'U'}</span>
            </div>
            <div className="overflow-hidden">
              <p className="font-medium text-sm truncate">{profile?.name}</p>
              <p className="text-xs text-slate-500 capitalize">{profile?.role.replace('_', ' ')}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-2 text-slate-500 hover:text-red-600 font-medium text-sm transition-colors py-2"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Header */}
        <header className="lg:hidden bg-white border-b border-slate-200 p-4 flex items-center justify-between sticky top-0 z-50">
          <div className="flex items-center gap-2">
            <SchoolLogo className="w-8 h-8" />
            <div className="flex flex-col">
              <span className="font-black text-xs leading-none">{SCHOOL_NAME_MS}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSelectedModule(null)}
              className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-all"
              title="Portal Utama"
            >
              <Home size={18} />
            </button>
            <button 
              onClick={() => { setShowRoleSelection(true); setActiveTab('dsx'); }} 
              className="px-2 py-1 bg-slate-100 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"
            >
              Tukar Peranan
            </button>
            <button onClick={handleLogout} className="text-slate-400 hover:text-red-500 transition-colors">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="max-w-7xl mx-auto">
             <AnimatePresence mode="wait">
                <motion.div 
                  key={activeTab + (profile?.role || '')}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {activeTab === 'dsx' && profile && (
                    <DailySchoolExperience 
                      profile={profile} 
                      onNavigateModule={(mod) => {
                        if (mod === 'akademik') {
                          setActiveTab('dashboard');
                        } else {
                          setSelectedModule(mod as any);
                        }
                      }} 
                      onSwitchRole={(r) => {
                        setProfile(prev => prev ? { ...prev, role: r } : null);
                      }}
                    />
                  )}
                  {activeTab === 'dashboard' ? renderContent() : null}
                  {activeTab === 'users' && <UserManagementView />}
                </motion.div>
             </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}

function NavItem({ active, icon, label, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
        active 
        ? 'bg-blue-50 text-blue-700' 
        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// Sub-views placeholders (I will implement them in separate files for organization)
function UserManagementView() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">User Management</h2>
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
        User role assignment and management dashboard.
      </div>
    </div>
  );
}


