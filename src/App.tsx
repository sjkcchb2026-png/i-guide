/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, collection, query, where, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { deepSanitizeFirestore } from './utils/sanitizeFirestore';
import { UserProfile, SchoolSettings, SchoolProfile, UserRole, StaffCategory } from './types';
import { Header } from './components/Header';
import { LoginView } from './components/LoginView';
import { SchoolOnboardingView } from './components/SchoolOnboardingView';
import { ISEPADUShell } from './components/Shell/ISEPADUShell';
import { SchoolTenantProvider } from './contexts/SchoolTenantContext';
import {
  DEFAULT_SCHOOL_CODE,
  DEFAULT_SCHOOL_NAME,
  DEFAULT_SCHOOL_SLOGAN,
  isLegacyDefaultSchool,
  normalizeActiveSchoolCode,
  resolveRecordSchoolCode,
  scopedDocId,
  setRuntimeActiveSchoolCode,
} from './utils/schoolTenant';
import { School, Loader2, UserX, LogOut } from 'lucide-react';

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [schoolProfile, setSchoolProfile] = useState<SchoolProfile | null>(null);
  const [schoolSettings, setSchoolSettings] = useState<SchoolSettings | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [accessDeniedReason, setAccessDeniedReason] = useState<'DEACTIVATED' | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean>(false);
  const [activeView, setActiveView] = useState<'staff' | 'principal'>('staff');

  const activeSchoolCode = currentUserProfile
    ? resolveRecordSchoolCode(currentUserProfile)
    : '';

  // Keep runtime schoolCode synced for deep helper functions
  useEffect(() => {
    setRuntimeActiveSchoolCode(activeSchoolCode || DEFAULT_SCHOOL_CODE);
  }, [activeSchoolCode]);

  // 1. Subscribe to the logged-in user's school profile (schools/{schoolCode}) & scoped school_settings
  useEffect(() => {
    // Before login, fetch neutral/legacy header info optionally so login screen isn't empty
    if (!currentUserProfile) {
      fetch('/api/school-info')
        .then((res) => res.json())
        .then((info) => {
          if (info?.initialized) {
            setSchoolSettings((prev) => prev || ({
              schoolName: info.schoolName,
              schoolCode: info.schoolCode,
              schoolLogo: info.schoolLogo || info.logoUrl || '',
              slogan: info.slogan || DEFAULT_SCHOOL_SLOGAN,
              principalEmail: info.principalEmail || '',
              principalUid: '',
            } as SchoolSettings));
          }
        })
        .catch(() => {});
      return;
    }

    const code = normalizeActiveSchoolCode(activeSchoolCode);
    const settingsDocId = scopedDocId(code, 'general');

    // Hydrate via server API immediately
    fetch(`/api/school-info?schoolCode=${encodeURIComponent(code)}`)
      .then((res) => res.json())
      .then((info) => {
        if (info?.schoolName) {
          setSchoolSettings((prev) => ({
            ...(prev || { principalEmail: '', principalUid: '' }),
            schoolCode: code,
            schoolName: info.schoolName,
            schoolLogo: info.schoolLogo || info.logoUrl || prev?.schoolLogo || '',
            logoUrl: info.logoUrl || info.schoolLogo || prev?.logoUrl || '',
            slogan: info.slogan || prev?.slogan || DEFAULT_SCHOOL_SLOGAN,
            adminEmails: info.adminEmails || prev?.adminEmails || [],
            principalEmail: info.principalEmail || prev?.principalEmail || '',
            principalUid: prev?.principalUid || '',
          }));
        }
      })
      .catch((err) => console.warn('Scoped school info fetch:', err));

    const unsubSchool = onSnapshot(
      doc(db, 'schools', code),
      (snap) => {
        if (snap.exists()) {
          const sp = snap.data() as SchoolProfile;
          setSchoolProfile(sp);
          setSchoolSettings((prev) => ({
            ...(prev || { principalEmail: '', principalUid: '' }),
            schoolCode: sp.schoolCode || code,
            schoolName: sp.schoolName || prev?.schoolName || (isLegacyDefaultSchool(code) ? DEFAULT_SCHOOL_NAME : code),
            schoolLogo: sp.logoUrl || prev?.schoolLogo || '',
            logoUrl: sp.logoUrl || '',
            slogan: sp.slogan || prev?.slogan || DEFAULT_SCHOOL_SLOGAN,
            adminEmails: sp.adminEmails || prev?.adminEmails || [],
            principalEmail: sp.principalEmail || prev?.principalEmail || '',
            principalUid: sp.principalUid || prev?.principalUid || '',
          }));
        }
      },
      (err) => console.warn('schools/{code} subscription:', err)
    );

    const unsubSettings = onSnapshot(
      doc(db, 'school_settings', settingsDocId),
      (docSnap) => {
        if (docSnap.exists()) {
          const s = docSnap.data() as SchoolSettings;
          setSchoolSettings((prev) => ({
            ...s,
            schoolCode: s.schoolCode || prev?.schoolCode || code,
            schoolName: prev?.schoolName && schoolProfile?.schoolName ? schoolProfile.schoolName : s.schoolName,
            schoolLogo: schoolProfile?.logoUrl || s.schoolLogo || s.logoUrl || prev?.schoolLogo || '',
            slogan: schoolProfile?.slogan || s.slogan || prev?.slogan || DEFAULT_SCHOOL_SLOGAN,
            adminEmails: schoolProfile?.adminEmails || s.adminEmails || prev?.adminEmails || [],
          }));
        } else if (isLegacyDefaultSchool(code)) {
          setSchoolSettings((prev) => prev || ({
            schoolCode: DEFAULT_SCHOOL_CODE,
            schoolName: DEFAULT_SCHOOL_NAME,
            slogan: DEFAULT_SCHOOL_SLOGAN,
            principalEmail: '',
            principalUid: '',
          }));
        }
      },
      (error) => console.warn('School settings subscription:', error)
    );

    return () => {
      unsubSchool();
      unsubSettings();
    };
  }, [currentUserProfile?.uid, activeSchoolCode]);

  // 2. Listen to Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAccessDeniedReason(null);
      setNeedsOnboarding(false);

      if (!user) {
        setCurrentUserProfile(null);
        setSchoolProfile(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const userEmail = (user.email || '').toLowerCase().trim();
        const isDesignatedAdmin = userEmail === 'sjkcchb2026@gmail.com' || userEmail === 'sean3919531@gmail.com';
        const adminDocRef = doc(db, 'admins', user.uid);
        const adminSnap = await getDoc(adminDocRef).catch(() => null);
        const isLegacySuperAdmin = (adminSnap && adminSnap.exists()) || isDesignatedAdmin;

        if (isDesignatedAdmin && (!adminSnap || !adminSnap.exists())) {
          await setDoc(adminDocRef, {
            uid: user.uid,
            email: userEmail,
            role: 'SYSTEM_ADMIN',
            name: user.displayName || 'Pentadbir Sistem',
            createdAt: serverTimestamp(),
          }, { merge: true }).catch(() => {});
        }

        // Fetch existing user profile from /users/{uid}
        const userDocRef = doc(db, 'users', user.uid);
        let resolvedUserSnap = await getDoc(userDocRef);

        // If /users/{uid} doesn't exist yet, try email auto-link for pre-registered users/personnel/teachers/YCC3404 roster
        if (!resolvedUserSnap.exists() && userEmail) {
          // Stage A: Query pre-registered `users` collection by email (keeps its schoolCode, or YCC3404 if legacy)
          try {
            const qUsers = query(collection(db, 'users'), where('email', '==', userEmail));
            const querySnap = await getDocs(qUsers);
            if (!querySnap.empty) {
              const matchedDoc = querySnap.docs[0];
              const preData = matchedDoc.data() as UserProfile;
              const matchedSchoolCode = resolveRecordSchoolCode(preData);
              const linkedProfile = deepSanitizeFirestore({
                ...preData,
                uid: user.uid,
                schoolCode: matchedSchoolCode,
                isPreRegistered: false,
                active: preData.active !== false,
                updatedAt: serverTimestamp(),
              });
              await setDoc(userDocRef, linkedProfile, { merge: true });
              if (matchedDoc.id !== user.uid) {
                await setDoc(matchedDoc.ref, { uid: user.uid, schoolCode: matchedSchoolCode, isPreRegistered: false, active: true }, { merge: true }).catch(() => {});
              }
              resolvedUserSnap = await getDoc(userDocRef);
            }
          } catch (syncErr) {
            console.warn('Stage A users email lookup:', syncErr);
          }

          // Stage B: Check `personnel` Master Data by email
          if (!resolvedUserSnap.exists()) {
            try {
              const qPersonnel = query(collection(db, 'personnel'), where('email', '==', userEmail));
              const pSnap = await getDocs(qPersonnel);
              if (!pSnap.empty) {
                const pDoc = pSnap.docs[0];
                const pData: any = pDoc.data();
                const matchedSchoolCode = resolveRecordSchoolCode(pData);
                const posUpper = String(pData.position || pData.jawatan || '').toUpperCase();
                const isPrincipalUser = posUpper.includes('GURU BESAR') || posUpper === 'GB' || pData.leadershipRole === 'GURU_BESAR';
                const catUpper = String(pData.category || '').toUpperCase();
                const isAkpUser = catUpper === 'AKP' || posUpper.includes('PKA') || posUpper.includes('PPM') || posUpper.includes('PT') || posUpper.includes('PEMBANTU') || posUpper.includes('KERANI') || posUpper.includes('OPERASI');
                const resolvedRole: UserRole = isPrincipalUser ? 'PRINCIPAL' : (isAkpUser ? 'AKP' : 'GURU');
                const resolvedCat: StaffCategory = isPrincipalUser ? 'PRINCIPAL' : (isAkpUser ? 'AKP' : 'GURU');

                const linkedProfile = deepSanitizeFirestore({
                  uid: user.uid,
                  name: pData.name || pData.nama || user.displayName || userEmail.split('@')[0],
                  email: userEmail,
                  schoolCode: matchedSchoolCode,
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

          // Stage C: Check `teachers` collection by email
          if (!resolvedUserSnap.exists()) {
            try {
              const qTeachers = query(collection(db, 'teachers'), where('email', '==', userEmail));
              const tSnap = await getDocs(qTeachers);
              if (!tSnap.empty) {
                const tDoc = tSnap.docs[0];
                const tData: any = tDoc.data();
                const matchedSchoolCode = resolveRecordSchoolCode(tData);
                const linkedProfile = deepSanitizeFirestore({
                  uid: user.uid,
                  name: tData.name || user.displayName || userEmail.split('@')[0],
                  email: userEmail,
                  schoolCode: matchedSchoolCode,
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

          // Stage D: Check if email is listed in any registered school's adminEmails
          if (!resolvedUserSnap.exists()) {
            try {
              const qSchools = query(collection(db, 'schools'), where('adminEmails', 'array-contains', userEmail));
              const sSnap = await getDocs(qSchools);
              if (!sSnap.empty) {
                const sp = sSnap.docs[0].data() as SchoolProfile;
                const matchedSchoolCode = normalizeActiveSchoolCode(sp.schoolCode || sSnap.docs[0].id);
                const linkedProfile = deepSanitizeFirestore({
                  uid: user.uid,
                  name: user.displayName || userEmail.split('@')[0] || 'Guru Besar',
                  email: userEmail,
                  schoolCode: matchedSchoolCode,
                  category: 'PRINCIPAL',
                  role: 'PRINCIPAL',
                  hasClerkAccess: true,
                  active: true,
                  isPreRegistered: false,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
                await setDoc(userDocRef, linkedProfile, { merge: true });
                resolvedUserSnap = await getDoc(userDocRef);
              }
            } catch (sErr) {
              console.warn('Stage D schools adminEmails lookup:', sErr);
            }
          }

          // Stage E: Fallback to YCC3404 official staff roster ONLY for YCC3404 accounts
          if (!resolvedUserSnap.exists()) {
            try {
              const idToken = await user.getIdToken();
              const res = await fetch('/api/auth/resolve-staff-profile', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ email: userEmail, schoolCode: DEFAULT_SCHOOL_CODE }),
              });
              if (res.ok) {
                const data = await res.json();
                if (data.profile) {
                  const linkedProfile = deepSanitizeFirestore({
                    ...data.profile,
                    uid: user.uid,
                    schoolCode: DEFAULT_SCHOOL_CODE,
                    isPreRegistered: false,
                    active: true,
                    updatedAt: serverTimestamp(),
                  });
                  await setDoc(userDocRef, linkedProfile, { merge: true });
                  resolvedUserSnap = await getDoc(userDocRef);
                }
              }
            } catch (apiErr) {
              console.warn('Stage E YCC3404 resolver error:', apiErr);
            }
          }
        }

        if (resolvedUserSnap.exists()) {
          const profile = resolvedUserSnap.data() as UserProfile;
          const resolvedCode = resolveRecordSchoolCode(profile);
          if (!profile.schoolCode) {
            profile.schoolCode = resolvedCode;
            await setDoc(userDocRef, { schoolCode: resolvedCode }, { merge: true }).catch(() => {});
          }

          // Preserve legacy superAdmin principal elevation ONLY for YCC3404 or school's own principal
          if (isLegacySuperAdmin && isLegacyDefaultSchool(resolvedCode)) {
            profile.role = 'PRINCIPAL';
            profile.category = 'PRINCIPAL';
            profile.hasClerkAccess = true;
          }

          if (profile.active === false) {
            setAccessDeniedReason('DEACTIVATED');
            setCurrentUserProfile(null);
          } else {
            setCurrentUserProfile(profile);
            setActiveView(
              profile.role === 'PRINCIPAL' || profile.category === 'PRINCIPAL' || profile.role === 'admin'
                ? 'principal'
                : 'staff'
            );
          }
        } else if (isLegacySuperAdmin) {
          // Legacy YCC3404 designated admin without a /users doc yet
          const fallbackProfile: UserProfile = {
            uid: user.uid,
            name: user.displayName || 'Guru Besar / Pentadbir',
            email: user.email || '',
            schoolCode: DEFAULT_SCHOOL_CODE,
            category: 'PRINCIPAL',
            role: 'PRINCIPAL',
            hasClerkAccess: true,
            active: true,
          };
          await setDoc(userDocRef, deepSanitizeFirestore(fallbackProfile), { merge: true }).catch(() => {});
          setCurrentUserProfile(fallbackProfile);
          setActiveView('principal');
        } else {
          // Unlinked authenticated user -> launch Multi-School Onboarding flow!
          setNeedsOnboarding(true);
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
      setNeedsOnboarding(false);
      setCurrentUserProfile(null);
      setSchoolProfile(null);
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
          <span>Menyambung ke Portal iSEPADU AI...</span>
        </div>
      </div>
    );
  }

  // Deactivated Screen
  if (firebaseUser && accessDeniedReason === 'DEACTIVATED') {
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
              <UserX className="w-8 h-8" />
            </div>

            <h3 className="text-xl font-bold text-white mb-2">
              账号已被停用 (Akaun Dinyahaktifkan)
            </h3>

            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed mb-6">
              Akaun kakitangan anda ({firebaseUser.email}) telah dinyahaktifkan oleh pihak pentadbir sekolah. Sila hubungi Guru Besar atau Pentadbir sekolah anda untuk pengaktifan semula.
            </p>

            <button
              onClick={handleLogout}
              className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-xl transition flex items-center justify-center space-x-2"
            >
              <LogOut className="w-4 h-4" />
              <span>Log Keluar</span>
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Multi-School Onboarding (authenticated user without an assigned school profile yet)
  if (firebaseUser && needsOnboarding && !currentUserProfile) {
    return (
      <SchoolOnboardingView
        firebaseUser={firebaseUser}
        onCompleted={(profile, sp) => {
          setNeedsOnboarding(false);
          setCurrentUserProfile(profile);
          if (sp) {
            setSchoolProfile(sp);
            setSchoolSettings({
              schoolCode: sp.schoolCode,
              schoolName: sp.schoolName,
              schoolLogo: sp.logoUrl || '',
              logoUrl: sp.logoUrl || '',
              slogan: sp.slogan || DEFAULT_SCHOOL_SLOGAN,
              adminEmails: sp.adminEmails || [],
              principalEmail: sp.principalEmail || profile.email || '',
              principalUid: sp.principalUid || profile.uid,
            });
          }
        }}
        onLogout={handleLogout}
      />
    );
  }

  // Not logged in -> LoginView
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
    <SchoolTenantProvider
      schoolCode={activeSchoolCode}
      schoolSettings={schoolSettings}
      schoolProfile={schoolProfile}
    >
      <ISEPADUShell
        currentUser={currentUserProfile}
        schoolSettings={schoolSettings}
        onUpdateSchoolSettings={(updated) => {
          setSchoolSettings(updated);
          if (updated) {
            setSchoolProfile((prev) => ({
              ...(prev || { schoolCode: normalizeActiveSchoolCode(activeSchoolCode), schoolName: updated.schoolName }),
              schoolCode: normalizeActiveSchoolCode(updated.schoolCode || activeSchoolCode),
              schoolName: updated.schoolName,
              logoUrl: updated.schoolLogo || updated.logoUrl || prev?.logoUrl || '',
              slogan: updated.slogan || prev?.slogan || DEFAULT_SCHOOL_SLOGAN,
              adminEmails: updated.adminEmails || prev?.adminEmails || [],
            }));
          }
        }}
        onLogout={handleLogout}
      />
    </SchoolTenantProvider>
  );
}
