
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

  // [1A-1 AUTO-PURGE EXCISED]: Auto-purge logic permanently removed to prevent deletion of real students.

  const [userClaims, setUserClaims] = useState<{
    personnelId?: string;
    schoolId?: string;
    isPrincipal?: boolean;
    isSystemAdmin?: boolean;
    claimsVersion?: number;
  }>({});
  const [govAssignments, setGovAssignments] = useState<any>(null);
  const [authWarning, setAuthWarning] = useState<string | null>(null);
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapSuccess, setBootstrapSuccess] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        let claimsData: any = {};
        try {
          const tokenResult = await currentUser.getIdTokenResult(true);
          claimsData = tokenResult.claims || {};
          setUserClaims({
            personnelId: claimsData.personnelId,
            schoolId: claimsData.schoolId,
            isPrincipal: claimsData.isPrincipal === true,
            isSystemAdmin: claimsData.isSystemAdmin === true,
            claimsVersion: claimsData.claimsVersion,
          });

          // Fetch server-verified claims & assignments
          const token = await currentUser.getIdToken();
          const res = await fetch('/api/auth/claims', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.claims) {
              setUserClaims(data.claims);
            }
            if (data?.governanceAssignments) {
              setGovAssignments(data.governanceAssignments);
            }
          }
        } catch (claimsErr) {
          console.warn("Could not fetch claims:", claimsErr);
        }

        const docRef = doc(db, 'users', currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setProfile(docSnap.data() as UserProfile);
        } else {
          // Try to auto-match registered student email
          let autoMatched = false;
          if (currentUser.email) {
            try {
              const qS = query(collection(db, 'students'), where('email', '==', currentUser.email.toLowerCase().trim()));
              const snapshotS = await getDocs(qS);
              if (!snapshotS.empty) {
                const matchedStudent = snapshotS.docs[0].data();
                const newProfile: UserProfile = {
                  uid: currentUser.uid,
                  name: matchedStudent.name,
                  email: currentUser.email.toLowerCase().trim(),
                  role: 'student',
                  class_assigned: matchedStudent.class,
                  year_assigned: Number(matchedStudent.year),
                  academic_year: matchedStudent.academic_year || '2026'
                };
                await setDoc(doc(db, 'users', currentUser.uid), newProfile);
                setProfile(newProfile);
                setShowRoleSelection(false);
                autoMatched = true;
                console.log(`Auto-matched logged-in user ${currentUser.email} as student: ${matchedStudent.name}`);
              }
            } catch (errMatch) {
              console.error("Gagal melakukan padanan emel automatik murid:", errMatch);
            }
          }
          
          if (!autoMatched) {
            if (claimsData.isSystemAdmin) {
              const newProfile: UserProfile = {
                uid: currentUser.uid,
                name: currentUser.displayName || 'PENTADBIR SISTEM',
                email: currentUser.email || '',
                role: 'admin'
              };
              await setDoc(doc(db, 'users', currentUser.uid), newProfile);
              setProfile(newProfile);
              setShowRoleSelection(false);
            } else if (claimsData.isPrincipal) {
              const newProfile: UserProfile = {
                uid: currentUser.uid,
                name: currentUser.displayName || 'GURU BESAR',
                email: currentUser.email || '',
                role: 'principal'
              };
              await setDoc(doc(db, 'users', currentUser.uid), newProfile);
              setProfile(newProfile);
              setShowRoleSelection(false);
            } else {
              setProfile(null); 
              setShowRoleSelection(true);
            }
          }
        }
      } else {
        setProfile(null);
        setUserClaims({});
        setGovAssignments(null);
        setShowRoleSelection(false);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // [1A-2 HARDENED]: Excision of legacy client-side admin/visitor passwords.
  // Role switching is strictly enforced via server-verified claims & governance assignments.

  const handleSelectWorkspace = async (targetRole: Role) => {
    if (!user) return;
    setAuthWarning(null);

    // Enforce server-verified access checks
    if (targetRole === 'admin') {
      if (userClaims.isSystemAdmin !== true) {
        setAuthWarning('Akses Ditolak: Peranan Pentadbir Sistem memerlukan pengesahan Claims Pelayan (isSystemAdmin: true).');
        return;
      }
    } else if (targetRole === 'principal') {
      if (userClaims.isPrincipal !== true) {
        setAuthWarning('Akses Ditolak: Peranan Guru Besar / Pengetua memerlukan pengesahan rasmi (isPrincipal: true).');
        return;
      }
    } else if (targetRole === 'secretary') {
      const allowed = userClaims.isSystemAdmin || userClaims.isPrincipal || govAssignments?.isSecretary;
      if (!allowed) {
        setAuthWarning('Akses Ditolak: Anda belum dilantik sebagai Setiausaha Peperiksaan dalam takwim pentadbiran sekolah.');
        return;
      }
    } else if (targetRole === 'class_teacher') {
      const allowed = userClaims.isPrincipal || (govAssignments?.classAssigned && govAssignments.classAssigned.length > 0);
      if (!allowed && !userClaims.isSystemAdmin) {
        setAuthWarning('Akses Ditolak: Tiada kelas rasmi diperuntukkan untuk akaun anda dalam penetapan sekolah.');
        return;
      }
    } else if (targetRole === 'head_department') {
      const allowed = userClaims.isPrincipal || (govAssignments?.panitiaAssigned && govAssignments.panitiaAssigned.length > 0);
      if (!allowed && !userClaims.isSystemAdmin) {
        setAuthWarning('Akses Ditolak: Tiada portfolio Ketua Panitia diperuntukkan untuk akaun anda.');
        return;
      }
    }

    const nameToUse = customTeacherName || user.displayName || 'Guru SJK(C) Chung Hua Balingian';
    const newProfile: UserProfile = {
      uid: user.uid,
      name: nameToUse.toUpperCase(),
      email: user.email || 'staff@chbalingian.edu.my',
      role: targetRole,
    };
    await setDoc(doc(db, 'users', user.uid), newProfile, { merge: true });
    setProfile(newProfile);
    setShowRoleSelection(false);
  };

  const handleBootstrapFirstAdmin = async () => {
    if (!user) return;
    setBootstrapLoading(true);
    setAuthWarning(null);
    setBootstrapSuccess(null);
    try {
      const token = await user.getIdToken(true);
      const res = await fetch('/api/auth/bootstrap-first-admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isExternalOperator: false })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal memulakan pentadbir pertama.');
      }
      setBootstrapSuccess('Tahniah! Akaun anda telah berjaya disahkan sebagai Pentadbir Sistem Pertama (First System Admin).');
      await user.getIdToken(true);
      const tokenResult = await user.getIdTokenResult(true);
      setUserClaims(tokenResult.claims as any);
      const updatedProfile: UserProfile = {
        uid: user.uid,
        name: (user.displayName || 'PENTADBIR SISTEM').toUpperCase(),
        email: user.email || '',
        role: 'admin'
      };
      setProfile(updatedProfile);
      setShowRoleSelection(false);
    } catch (err: any) {
      setAuthWarning(err.message);
    } finally {
      setBootstrapLoading(false);
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
              <button 
                onClick={async () => {
                  setLoginLoading(true);
                  try {
                    const credentials = await signInAnonymously(auth);
                    const visitorUid = credentials.user.uid;
                    const newProfile: UserProfile = {
                      uid: visitorUid,
                      name: 'PELAWAT LUAR / PIBG',
                      email: 'visitor@chbalingian.edu.my',
                      role: 'visitor',
                      academic_year: '2026'
                    };
                    await setDoc(doc(db, 'users', visitorUid), newProfile);
                    setProfile(newProfile);
                  } catch (err) {
                    console.error("Gagal log masuk pelawat:", err);
                  } finally {
                    setLoginLoading(false);
                  }
                }}
                disabled={loginLoading}
                className="w-full py-4.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-black rounded-2xl transition-all duration-300 flex items-center justify-center gap-2 active:scale-95 uppercase tracking-[0.2em] text-[10px] border border-indigo-100"
              >
                🚪 Portal Pelawat Kokurikulum (Akses Bacaan Sahaja)
              </button>
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

  // Authorized Workspace Switcher (Sub-Phase 1A-2)
  if (user && (!profile || showRoleSelection)) {
    const isSysAdmin = userClaims.isSystemAdmin === true;
    const isPrincipal = userClaims.isPrincipal === true;
    const isSec = isSysAdmin || isPrincipal || !!govAssignments?.isSecretary;
    const isClassTeacher = isSysAdmin || isPrincipal || (govAssignments?.classAssigned && govAssignments.classAssigned.length > 0);
    const isPanitia = isSysAdmin || isPrincipal || (govAssignments?.panitiaAssigned && govAssignments.panitiaAssigned.length > 0);

    const workspaces: {
      role: Role;
      label: string;
      desc: string;
      category: 'PENTADBIRAN' | 'AKADEMIK' | 'PELAWAT';
      authorized: boolean;
      authReason: string;
    }[] = [
      {
        role: 'admin',
        label: 'Pentadbir Sistem Utama (System Admin)',
        desc: 'Pengurusan keselamatan, peranan guru, pemindahan kuasa & utiliti teknikal.',
        category: 'PENTADBIRAN',
        authorized: isSysAdmin,
        authReason: isSysAdmin ? 'Disahkan oleh Custom Claims (isSystemAdmin: true)' : 'Memerlukan kebenaran rasmi System Administrator.',
      },
      {
        role: 'principal',
        label: 'Guru Besar / Pengetua (Principal)',
        desc: 'Pemantauan pengurusan strategik sekolah, takwim eksekutif & penyeliaan keseluruhan.',
        category: 'PENTADBIRAN',
        authorized: isPrincipal,
        authReason: isPrincipal ? 'Disahkan oleh Custom Claims (isPrincipal: true)' : 'Memerlukan pelantikan rasmi Guru Besar.',
      },
      {
        role: 'secretary',
        label: 'Setiausaha Peperiksaan',
        desc: 'Penyelarasan SAPS/UASA, analisis am gred peperiksaan & pelaporan rasmi.',
        category: 'PENTADBIRAN',
        authorized: isSec,
        authReason: isSec ? 'Disahkan melalui portfolio tadbir urus / pentadbir' : 'Memerlukan lantikan Setiausaha Peperiksaan.',
      },
      {
        role: 'head_department',
        label: 'Ketua Panitia Mata Pelajaran',
        desc: 'Pengurusan kurikulum panitia, analisis mata pelajaran & intervensi subjek.',
        category: 'AKADEMIK',
        authorized: isPanitia,
        authReason: isPanitia ? 'Disahkan melalui agihan portfolio panitia' : 'Memerlukan lantikan Ketua Panitia.',
      },
      {
        role: 'class_teacher',
        label: 'Guru Kelas / Utama',
        desc: 'Pengurusan rekod kelas, ulasan sahsiah & slip pelaporan murid.',
        category: 'AKADEMIK',
        authorized: isClassTeacher,
        authReason: isClassTeacher ? 'Disahkan melalui agihan guru kelas' : 'Memerlukan agihan rasmi guru kelas.',
      },
      {
        role: 'subject_teacher',
        label: 'Guru Mata Pelajaran',
        desc: 'Pemasukan markah PBD, gred peperiksaan UASA dan modul pembelajaran bilik darjah.',
        category: 'AKADEMIK',
        authorized: !user.isAnonymous,
        authReason: !user.isAnonymous ? 'Disahkan untuk semua akaun warga guru sekolah' : 'Sila log masuk dengan Google/DELIMa.',
      },
      {
        role: 'visitor',
        label: 'Ruang Pelawat / Tetamu',
        desc: 'Akses paparan sahaja untuk aktiviti awam dan pameran sekolah.',
        category: 'PELAWAT',
        authorized: true,
        authReason: 'Akses terbuka (Baca sahaja)',
      },
    ];

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 p-6 py-12 overflow-y-auto relative font-sans text-white">
        <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20">
          <div className="absolute top-[20%] left-[25%] w-[40%] h-[40%] bg-blue-500 rounded-full blur-[120px]" />
          <div className="absolute bottom-[20%] right-[25%] w-[40%] h-[40%] bg-indigo-500 rounded-full blur-[120px]" />
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="w-full max-w-4xl bg-slate-950/85 border border-slate-800 rounded-[44px] shadow-2xl p-8 lg:p-12 relative z-10 backdrop-blur-md"
        >
          <div className="text-center mb-8">
            <SchoolLogo className="w-20 h-20 mx-auto mb-4 bg-white/5 p-1 rounded-2xl" />
            <span className="text-[10px] font-mono font-black text-blue-400 tracking-[0.25em] uppercase block mb-1">
              {DEFAULT_SCHOOL_NAME} ({userClaims.schoolId || DEFAULT_SCHOOL_CODE})
            </span>
            <h2 className="text-3xl font-black italic uppercase tracking-tighter text-white mb-2">
              Pusat Pertukaran Ruang Kerja Berautoriti
            </h2>
            <p className="text-slate-400 text-xs font-medium max-w-xl mx-auto">
              Sistem iSEPADU AI menguatkuasakan kawalan capaian berasaskan Token Claims Pelayan dan rekod tadbir urus rasmi (MASUK SEKALI, GUNA BERKALI-KALI).
            </p>
          </div>

          {/* User Claims & Verification Identity Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 mb-8 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <div>
              <span className="text-[9px] font-mono font-black text-slate-400 uppercase tracking-wider block">ID Pengguna Rasmi</span>
              <span className="text-xs font-black text-white block truncate" title={user.email || user.uid}>
                {user.email || 'Akaun Tetamu Tanpa E-mel'}
              </span>
              <span className="text-[9px] text-blue-400 font-mono block mt-1">
                Personnel ID: {userClaims.personnelId || 'Belum Dipadankan'}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
                isSysAdmin 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                  : 'bg-slate-800 text-slate-500 border-slate-700'
              }`}>
                {isSysAdmin ? '✔ Pentadbir Sistem' : '✖ Bukan Admin'}
              </span>

              <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
                isPrincipal 
                  ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' 
                  : 'bg-slate-800 text-slate-500 border-slate-700'
              }`}>
                {isPrincipal ? '✔ Guru Besar' : '✖ Bukan Guru Besar'}
              </span>
            </div>

            <div>
              <span className="text-[9px] font-mono font-black text-slate-400 uppercase tracking-wider block mb-1">Nama Penuh Laporan</span>
              <input
                type="text"
                value={customTeacherName}
                onChange={e => setCustomTeacherName(e.target.value)}
                placeholder="Nama rasmi untuk cetakan..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-bold outline-none focus:border-blue-500/50 uppercase"
              />
            </div>
          </div>

          {/* Warning / Error Message */}
          {authWarning && (
            <div className="mb-6 p-4 bg-rose-950/60 border border-rose-800/80 rounded-2xl text-rose-300 text-xs font-bold flex items-center gap-3">
              <AlertCircle size={18} className="shrink-0 text-rose-400" />
              <span>{authWarning}</span>
            </div>
          )}

          {bootstrapSuccess && (
            <div className="mb-6 p-4 bg-emerald-950/60 border border-emerald-800/80 rounded-2xl text-emerald-300 text-xs font-bold flex items-center gap-3">
              <Shield size={18} className="shrink-0 text-emerald-400" />
              <span>{bootstrapSuccess}</span>
            </div>
          )}

          {/* First Admin Bootstrap Section for unbootstrapped setups */}
          {!isSysAdmin && user.email && (
            <div className="mb-8 p-6 bg-blue-950/30 border border-blue-900/60 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <span className="text-xs font-black text-blue-300 uppercase tracking-wider block mb-1">
                  Penyediaan Pentadbir Pertama (First Admin Bootstrap)
                </span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Jika sekolah ini belum mempunyai Pentadbir Sistem berdaftar, anda boleh mengesahkan diri sebagai Pentadbir Pertama melalui sambungan pelayan selamat.
                </p>
              </div>
              <button
                type="button"
                onClick={handleBootstrapFirstAdmin}
                disabled={bootstrapLoading}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shrink-0 shadow-lg shadow-blue-500/20 disabled:opacity-50 cursor-pointer"
              >
                {bootstrapLoading ? 'Mengesahkan...' : 'Sahkan Pentadbir Pertama'}
              </button>
            </div>
          )}

          {/* Workspaces List */}
          <div className="space-y-4">
            <span className="text-[10px] font-mono font-black text-blue-400 tracking-[0.2em] block uppercase mb-2">
              PILIH RUANG KERJA BERAUTORITI
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[45vh] overflow-y-auto pr-1">
              {workspaces.map(ws => (
                <div
                  key={ws.role}
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                    ws.authorized 
                      ? 'bg-slate-900/70 hover:bg-slate-900 border-slate-800 hover:border-blue-500/50 cursor-pointer' 
                      : 'bg-slate-950/60 border-slate-900 opacity-60'
                  }`}
                  onClick={() => {
                    if (ws.authorized) {
                      handleSelectWorkspace(ws.role);
                    } else {
                      setAuthWarning(`Akses Ditolak: ${ws.label} memerlukan kelayakan rasmi. ${ws.authReason}`);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-black text-white block uppercase tracking-tight">{ws.label}</span>
                      <span className="text-[10.5px] text-slate-400 block mt-0.5 leading-relaxed">{ws.desc}</span>
                    </div>
                    <span className={`text-[8.5px] font-black uppercase px-2 py-0.5 rounded-full shrink-0 border ${
                      ws.authorized 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`}>
                      {ws.authorized ? 'AUTORISASI SAH' : 'DISEKAT'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-[9.5px]">
                    <span className="text-slate-500 font-medium truncate max-w-[240px]">{ws.authReason}</span>
                    <span className={`font-black uppercase tracking-wider ${ws.authorized ? 'text-blue-400' : 'text-slate-600'}`}>
                      {ws.authorized ? 'Masuk ➔' : 'Perlu Kebenaran'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-800/80 flex items-center justify-between">
            {profile && (
              <button 
                onClick={() => setShowRoleSelection(false)} 
                className="text-slate-400 hover:text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                Kembali ke Ruang Semasa ({profile.role})
              </button>
            )}
            <button 
              onClick={handleLogout} 
              className="text-slate-500 hover:text-red-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 cursor-pointer transition-colors ml-auto"
            >
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


