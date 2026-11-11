/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, collection, query, where, getDocs, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { deepSanitizeFirestore } from './utils/sanitizeFirestore';
import { UserProfile, SchoolSettings, UserRole, StaffCategory } from './types';
import { Header } from './components/Header';
import { LoginView } from './components/LoginView';
import { StaffPunchIn } from './components/StaffPunchIn';
import { PrincipalDashboard } from './components/PrincipalDashboard';
import { ISEPADUShell } from './components/Shell/ISEPADUShell';
import { SuratMasukManagerView } from './components/SuratMasukManagerView';
import { ReliefSchedulingView } from './components/ReliefSchedulingView';
import { School, Loader2, ShieldAlert, UserX, LogOut } from 'lucide-react';

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [schoolSettings, setSchoolSettings] = useState<SchoolSettings | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [accessDeniedReason, setAccessDeniedReason] = useState<'NOT_REGISTERED' | 'DEACTIVATED' | null>(null);
  const [activeView, setActiveView] = useState<'staff' | 'principal'>('staff');

  // 1. Listen for School Settings changes
  useEffect(() => {
    // Initial fetch via server API to ensure immediate state hydration
    fetch('/api/school-info')
      .then((res) => res.json())
      .then((info) => {
        if (info?.initialized) {
          setSchoolSettings((prev) => prev || ({
            schoolName: info.schoolName,
            schoolCode: info.schoolCode,
            principalEmail: info.principalEmail,
          } as SchoolSettings));
        }
      })
      .catch((err) => console.warn('School info fetch:', err));

    const unsub = onSnapshot(doc(db, 'school_settings', 'general'), (docSnap) => {
      if (docSnap.exists()) {
        setSchoolSettings(docSnap.data() as SchoolSettings);
      } else {
        setSchoolSettings(null);
      }
    }, (error) => {
      console.warn('School settings subscription:', error);
    });

    return () => unsub();
  }, []);

  // 2. Listen to Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAccessDeniedReason(null);

      if (!user) {
        setCurrentUserProfile(null);
        setLoading(false);
        return;
      }

      try {
        // 1. Check if user is registered Admin in /admins/{uid}
        const adminDocRef = doc(db, 'admins', user.uid);
        const adminSnap = await getDoc(adminDocRef);
        const isAdmin = adminSnap.exists();

        // 2. Fetch user profile from /users/{uid}
        const userDocRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userDocRef);

        let resolvedUserSnap = userSnap;

        // 3. If user document does not exist by auth UID, resolve by email across users, personnel, teachers & backend roster
        if (!resolvedUserSnap.exists() && user.email) {
          const cleanEmail = user.email.toLowerCase().trim();

          // Stage A: Query `users` collection by email
          try {
            const qUsers = query(collection(db, 'users'), where('email', '==', cleanEmail));
            const querySnap = await getDocs(qUsers);
            if (!querySnap.empty) {
              const matchedDoc = querySnap.docs[0];
              const preData = matchedDoc.data() as UserProfile;
              const linkedProfile = deepSanitizeFirestore({
                ...preData,
                uid: user.uid,
                isPreRegistered: false,
                active: preData.active !== false,
                updatedAt: serverTimestamp(),
              });
              await setDoc(userDocRef, linkedProfile, { merge: true });
              if (matchedDoc.id !== user.uid) {
                await setDoc(matchedDoc.ref, { uid: user.uid, isPreRegistered: false, active: true }, { merge: true }).catch(() => {});
              }
              resolvedUserSnap = await getDoc(userDocRef);
            }
          } catch (syncErr) {
            console.warn('Stage A users email lookup:', syncErr);
          }

          // Stage B: If not in users, check `personnel` Master Data by email
          if (!resolvedUserSnap.exists()) {
            try {
              const qPersonnel = query(collection(db, 'personnel'), where('email', '==', cleanEmail));
              const pSnap = await getDocs(qPersonnel);
              if (!pSnap.empty) {
                const pDoc = pSnap.docs[0];
                const pData: any = pDoc.data();
                const posUpper = String(pData.position || pData.jawatan || '').toUpperCase();
                const isPrincipalUser = posUpper.includes('GURU BESAR') || posUpper === 'GB' || pData.leadershipRole === 'GURU_BESAR' || cleanEmail === schoolSettings?.principalEmail?.toLowerCase().trim();
                const catUpper = String(pData.category || '').toUpperCase();
                const isAkpUser = catUpper === 'AKP' || posUpper.includes('PKA') || posUpper.includes('PPM') || posUpper.includes('PT') || posUpper.includes('PEMBANTU') || posUpper.includes('KERANI') || posUpper.includes('OPERASI');
                const resolvedRole: UserRole = isPrincipalUser ? 'PRINCIPAL' : (isAkpUser ? 'AKP' : 'GURU');
                const resolvedCat: StaffCategory = isPrincipalUser ? 'PRINCIPAL' : (isAkpUser ? 'AKP' : 'GURU');

                const linkedProfile = deepSanitizeFirestore({
                  uid: user.uid,
                  name: pData.name || pData.nama || user.displayName || cleanEmail.split('@')[0],
                  email: cleanEmail,
                  category: resolvedCat,
                  role: resolvedRole,
                  ic: pData.ic || '',
                  phone: pData.phone || pData.noTel || '',
                  grade: pData.grade || pData.gred || '',
                  position: pData.position || pData.jawatan || '',
                  staffFileNo: pData.staffFileNo || pData.noFail || '',
                  personnelId: pDoc.id,
                  active: true,
                  isPreRegistered: false,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
                await setDoc(userDocRef, linkedProfile, { merge: true });
                resolvedUserSnap = await getDoc(userDocRef);
              }
            } catch (pErr) {
              console.warn('Stage B personnel email lookup:', pErr);
            }
          }

          // Stage C: If not in personnel, check `teachers` collection by email
          if (!resolvedUserSnap.exists()) {
            try {
              const qTeachers = query(collection(db, 'teachers'), where('email', '==', cleanEmail));
              const tSnap = await getDocs(qTeachers);
              if (!tSnap.empty) {
                const tDoc = tSnap.docs[0];
                const tData: any = tDoc.data();
                const linkedProfile = deepSanitizeFirestore({
                  uid: user.uid,
                  name: tData.name || user.displayName || cleanEmail.split('@')[0],
                  email: cleanEmail,
                  category: 'GURU',
                  role: 'GURU',
                  ic: tData.ic || '',
                  personnelId: tDoc.id,
                  active: true,
                  isPreRegistered: false,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
                await setDoc(userDocRef, linkedProfile, { merge: true });
                resolvedUserSnap = await getDoc(userDocRef);
              }
            } catch (tErr) {
              console.warn('Stage C teachers email lookup:', tErr);
            }
          }

          // Stage D: Fallback to server resolver endpoint (checks authoritative school staff roster)
          if (!resolvedUserSnap.exists()) {
            try {
              const idToken = await user.getIdToken();
              const res = await fetch('/api/auth/resolve-staff-profile', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ email: cleanEmail }),
              });
              if (res.ok) {
                const data = await res.json();
                if (data.profile) {
                  const linkedProfile = deepSanitizeFirestore({
                    ...data.profile,
                    uid: user.uid,
                    isPreRegistered: false,
                    active: true,
                    updatedAt: serverTimestamp(),
                  });
                  await setDoc(userDocRef, linkedProfile, { merge: true });
                  resolvedUserSnap = await getDoc(userDocRef);
                }
              }
            } catch (apiErr) {
              console.warn('Stage D server resolver error:', apiErr);
            }
          }
        }

        if (isAdmin) {
          // Principal profile
          let profile: UserProfile;
          if (resolvedUserSnap.exists()) {
            profile = resolvedUserSnap.data() as UserProfile;
            profile.role = 'PRINCIPAL';
            profile.category = 'PRINCIPAL';
          } else {
            profile = {
              uid: user.uid,
              name: user.displayName || '校长 / Guru Besar',
              email: user.email || '',
              category: 'PRINCIPAL',
              role: 'PRINCIPAL',
              hasClerkAccess: true,
              active: true,
            };
          }
          setCurrentUserProfile(profile);
          setActiveView('principal');
        } else if (resolvedUserSnap.exists()) {
          const profile = resolvedUserSnap.data() as UserProfile;

          // Check if active
          if (profile.active === false) {
            setAccessDeniedReason('DEACTIVATED');
            setCurrentUserProfile(null);
          } else {
            // Valid active staff member
            setCurrentUserProfile(profile);
            setActiveView('staff');
          }
        } else {
          // Account exists in Firebase Auth but has NO authorized record in /users created by Principal or Master Data!
          setAccessDeniedReason('NOT_REGISTERED');
          setCurrentUserProfile(null);
        }
      } catch (err) {
        console.error('Error loading user profile:', err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setAccessDeniedReason(null);
      setCurrentUserProfile(null);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300">
        <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-4 animate-pulse">
          <School className="w-6 h-6" />
        </div>
        <div className="flex items-center space-x-2 text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
          <span>正在连接云端出勤系统 (Sistem Kehadiran)...</span>
        </div>
      </div>
    );
  }

  // Access Denied Screen (Unregistered or Deactivated)
  if (firebaseUser && accessDeniedReason) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <Header
          currentUser={null}
          schoolSettings={schoolSettings}
          activeView={activeView}
          setActiveView={setActiveView}
        />
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-rose-950/60 border border-rose-800/60 text-rose-400 flex items-center justify-center mx-auto mb-4">
              {accessDeniedReason === 'DEACTIVATED' ? (
                <UserX className="w-8 h-8" />
              ) : (
                <ShieldAlert className="w-8 h-8" />
              )}
            </div>

            <h3 className="text-xl font-bold text-white mb-2">
              {accessDeniedReason === 'DEACTIVATED'
                ? '账号已被停用 (Akaun Dinyahaktifkan)'
                : '未获校方授权建档 (Akaun Belum Disahkan)'}
            </h3>

            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed mb-6">
              {accessDeniedReason === 'DEACTIVATED' ? (
                <>
                  您的教职员账号（{firebaseUser.email}）已被校长暂时停用，目前无法进行打卡或查阅出勤。如需恢复打卡权限，请联系校方管理员。
                </>
              ) : (
                <>
                  当前登录账号（{firebaseUser.email}）尚未由校长在出勤系统后台建立档案。本系统禁止自行公开注册，请联系校长开通账号后方可打卡。
                </>
              )}
            </p>

            <button
              onClick={handleLogout}
              className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-xl transition flex items-center justify-center space-x-2"
            >
              <LogOut className="w-4 h-4" />
              <span>退出登录 / Log Keluar</span>
            </button>
          </div>
        </main>
      </div>
    );
  }

  // If not logged in, display Login and Initial Setup view
  if (!firebaseUser || !currentUserProfile) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <Header
          currentUser={null}
          schoolSettings={schoolSettings}
          activeView={activeView}
          setActiveView={setActiveView}
        />
        <main className="flex-1">
          <LoginView
            schoolSettings={schoolSettings}
            onLoginSuccess={() => {}}
          />
        </main>
      </div>
    );
  }

  return (
    <ISEPADUShell
      currentUser={currentUserProfile}
      schoolSettings={schoolSettings}
      onUpdateSchoolSettings={(updated) => setSchoolSettings(updated)}
      onLogout={handleLogout}
    />
  );
}
