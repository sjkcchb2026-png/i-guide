import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { UserCheck, Briefcase, CheckCircle2, Shield } from 'lucide-react';

export type StaffMainCategory = 'GURU' | 'AKP';
export type GuruSubRole = 'GB' | 'PKP' | 'PKHEM' | 'PKKK' | 'GURU';
export type AkpSubRole = 'PT' | 'PO' | 'PPM';
export type StaffSubRole = GuruSubRole | AkpSubRole;

export interface StaffRoleCellProps {
  userId: string;
  currentCategory?: string; // 'GURU' | 'AKP'
  currentSubRole?: string;  // 'GB' | 'PKP' | 'PKHEM' | 'PKKK' | 'GURU' | 'PT' | 'PO' | 'PPM'
  onUpdated?: (category: StaffMainCategory, subRole: StaffSubRole) => void;
  // Backwards compatibility props:
  currentRole?: string;
  userEmail?: string;
  userName?: string;
  onRoleUpdated?: (newRole: 'GURU' | 'AKP') => void;
}

export const GURU_SUBROLE_META: Record<GuruSubRole, { label: string; fullTitle: string; title: string; activeClass: string }> = {
  GB: {
    label: 'GB',
    fullTitle: 'Guru Besar',
    title: 'Guru Besar (HR01 - Melihat semua makluman Pentadbiran, Kurikulum, HEM & KK)',
    activeClass: 'bg-amber-500 text-slate-950 font-black shadow-md border-amber-400',
  },
  PKP: {
    label: 'PKP',
    fullTitle: 'Penolong Kanan Pentadbiran',
    title: 'PK Pentadbiran (HR02 - Melihat semua makluman Pentadbiran & Kurikulum)',
    activeClass: 'bg-indigo-600 text-white font-black shadow-md border-indigo-400',
  },
  PKHEM: {
    label: 'PKHEM',
    fullTitle: 'Penolong Kanan Hal Ehwal Murid',
    title: 'PK Hal Ehwal Murid (HR03 - Melihat semua makluman HEM)',
    activeClass: 'bg-emerald-600 text-white font-black shadow-md border-emerald-400',
  },
  PKKK: {
    label: 'PKKK',
    fullTitle: 'Penolong Kanan Kokurikulum',
    title: 'PK Kokurikulum (HR04 - Melihat semua makluman Kokurikulum)',
    activeClass: 'bg-orange-500 text-white font-black shadow-md border-orange-400',
  },
  GURU: {
    label: 'GURU',
    fullTitle: 'Guru Akademik Biasa',
    title: 'Guru Biasa (Melihat makluman umum & tugasan yang ditugaskan)',
    activeClass: 'bg-blue-600 text-white font-bold shadow-md border-blue-400',
  },
};

export const AKP_SUBROLE_META: Record<AkpSubRole, { label: string; fullTitle: string; title: string; activeClass: string }> = {
  PT: {
    label: 'PT',
    fullTitle: 'Pembantu Tadbir',
    title: 'Pembantu Tadbir (N19/N22/N29 - Pengurusan Pentadbiran/Kewangan/HR)',
    activeClass: 'bg-teal-500 text-slate-950 font-bold shadow-md border-teal-400',
  },
  PO: {
    label: 'PO',
    fullTitle: 'Pembantu Operasi',
    title: 'Pembantu Operasi (N11/N14 - Pengurusan Surat Masuk & Operasi Am)',
    activeClass: 'bg-cyan-500 text-slate-950 font-bold shadow-md border-cyan-400',
  },
  PPM: {
    label: 'PPM',
    fullTitle: 'Pembantu Pengurusan Murid',
    title: 'Pembantu Pengurusan Murid (N19/N22 - Prasekolah/Pendidikan Khas)',
    activeClass: 'bg-purple-600 text-white font-bold shadow-md border-purple-400',
  },
};

const GURU_SUBROLES: GuruSubRole[] = ['GB', 'PKP', 'PKHEM', 'PKKK', 'GURU'];
const AKP_SUBROLES: AkpSubRole[] = ['PT', 'PO', 'PPM'];

export const StaffRoleCell: React.FC<StaffRoleCellProps> = ({
  userId,
  currentCategory,
  currentSubRole,
  onUpdated,
  currentRole,
  userEmail,
  userName,
  onRoleUpdated,
}) => {
  // Infer initial category
  const initialCategory: StaffMainCategory =
    currentCategory === 'AKP' || currentRole === 'AKP' ? 'AKP' : 'GURU';

  // Infer initial subRole
  const inferSubRole = (): StaffSubRole => {
    if (currentSubRole) {
      if (initialCategory === 'AKP' && AKP_SUBROLES.includes(currentSubRole as AkpSubRole)) {
        return currentSubRole as AkpSubRole;
      }
      if (initialCategory === 'GURU' && GURU_SUBROLES.includes(currentSubRole as GuruSubRole)) {
        return currentSubRole as GuruSubRole;
      }
    }
    if (currentRole === 'PRINCIPAL') return 'GB';
    return initialCategory === 'AKP' ? 'PO' : 'GURU';
  };

  const [category, setCategory] = useState<StaffMainCategory>(initialCategory);
  const [subRole, setSubRole] = useState<StaffSubRole>(inferSubRole);
  const [updating, setUpdating] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  useEffect(() => {
    const cat: StaffMainCategory =
      currentCategory === 'AKP' || currentRole === 'AKP' ? 'AKP' : 'GURU';
    setCategory(cat);

    if (currentSubRole) {
      setSubRole(currentSubRole as StaffSubRole);
    } else if (currentRole === 'PRINCIPAL') {
      setSubRole('GB');
    } else {
      setSubRole(cat === 'AKP' ? 'PO' : 'GURU');
    }
  }, [currentCategory, currentSubRole, currentRole]);

  const saveRoleSelection = async (newCategory: StaffMainCategory, newSubRole: StaffSubRole) => {
    if (updating) return;
    try {
      setUpdating(true);

      const isGuru = newCategory === 'GURU';
      const posTitle = isGuru
        ? GURU_SUBROLE_META[newSubRole as GuruSubRole]?.fullTitle || 'Guru'
        : AKP_SUBROLE_META[newSubRole as AkpSubRole]?.fullTitle || 'Staf AKP';

      const rolePayload: Record<string, any> = {
        category: newCategory,
        subRole: newSubRole,
        primaryRoleCode: newSubRole,
        position: posTitle,
        updatedAt: new Date().toISOString(),
      };

      if (isGuru) {
        rolePayload.leadershipRole = newSubRole === 'GURU' ? null : newSubRole;
        rolePayload.akpRole = null;
        rolePayload.role = newSubRole === 'GB' ? 'PRINCIPAL' : 'TEACHER';
      } else {
        rolePayload.akpRole = newSubRole;
        rolePayload.leadershipRole = null;
        rolePayload.role = 'AKP';
      }

      // 1. Try server endpoint first for audit logging
      let serverUpdated = false;
      try {
        const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
        if (idToken) {
          const res = await fetch('/api/admin/update-staff-category', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              userId,
              userEmail,
              userName,
              category: newCategory,
              subRole: newSubRole,
              position: posTitle,
            }),
          });
          if (res.ok) {
            serverUpdated = true;
          }
        }
      } catch (_) {
        // Fall back to direct Firestore sync
      }

      // 2. Direct Firestore update to users, personnel, teacher_profiles
      if (!serverUpdated && userId) {
        // Update users only if doc exists OR we have valid name/email (never create nameless ghost docs)
        try {
          const userRef = doc(db, 'users', userId);
          const existingSnap = await getDoc(userRef).catch(() => null);
          if (existingSnap && existingSnap.exists()) {
            await updateDoc(userRef, rolePayload).catch(() => setDoc(userRef, rolePayload, { merge: true }));
          } else if (userName || userEmail) {
            await setDoc(
              userRef,
              {
                ...rolePayload,
                ...(userName ? { name: userName.trim().toUpperCase() } : {}),
                ...(userEmail ? { email: userEmail.toLowerCase().trim() } : {}),
                active: true,
              },
              { merge: true }
            );
          }
        } catch (e) {
          console.warn('Update users error:', e);
        }

        // Update personnel
        try {
          const pRef = doc(db, 'personnel', userId);
          const pExisting = await getDoc(pRef).catch(() => null);
          if (pExisting && pExisting.exists()) {
            await updateDoc(pRef, rolePayload);
          } else if (userEmail) {
            const pQuery = query(
              collection(db, 'personnel'),
              where('email', '==', userEmail.toLowerCase().trim())
            );
            const pSnap = await getDocs(pQuery);
            for (const pDoc of pSnap.docs) {
              await setDoc(doc(db, 'personnel', pDoc.id), rolePayload, { merge: true });
            }
          }
        } catch (_) {}

        // Update teacher_profiles only if doc exists
        try {
          const tpRef = doc(db, 'teacher_profiles', userId);
          const tpExisting = await getDoc(tpRef).catch(() => null);
          if (tpExisting && tpExisting.exists()) {
            await updateDoc(tpRef, rolePayload);
          }
        } catch (_) {}
      }

      setCategory(newCategory);
      setSubRole(newSubRole);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);

      if (onUpdated) onUpdated(newCategory, newSubRole);
      if (onRoleUpdated) onRoleUpdated(newCategory);
    } catch (err: any) {
      console.error('Failed to update staff role:', err);
    } finally {
      setUpdating(false);
    }
  };

  const handleCategoryChange = (newCat: StaffMainCategory) => {
    if (newCat === category) return;
    const defaultSub: StaffSubRole = newCat === 'AKP' ? 'PO' : 'GURU';
    saveRoleSelection(newCat, defaultSub);
  };

  const handleSubRoleChange = (newSub: StaffSubRole) => {
    if (newSub === subRole) return;
    saveRoleSelection(category, newSub);
  };

  return (
    <div className="flex flex-col gap-1.5 font-sans min-w-[210px]">
      {/* 1. Main Category Switcher (GURU vs AKP) */}
      <div className="flex items-center gap-1.5">
        <div className="inline-flex bg-slate-950/90 p-0.5 rounded-lg border border-slate-800 text-[10px] font-bold">
          <button
            type="button"
            disabled={updating}
            onClick={() => handleCategoryChange('GURU')}
            className={`px-2 py-0.5 rounded transition-all flex items-center gap-1 cursor-pointer ${
              category === 'GURU'
                ? 'bg-blue-600 text-white shadow-sm border border-blue-400/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
            title="Guru Akademik (Akan muncul dalam Jadual Waktu & Agihan Mengajar)"
          >
            <UserCheck className="w-2.5 h-2.5" />
            <span>GURU</span>
          </button>

          <button
            type="button"
            disabled={updating}
            onClick={() => handleCategoryChange('AKP')}
            className={`px-2 py-0.5 rounded transition-all flex items-center gap-1 cursor-pointer ${
              category === 'AKP'
                ? 'bg-teal-600 text-white shadow-sm border border-teal-400/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
            title="Anggota Kumpulan Pelaksana (Staf Pejabat/Makmal/Kebersihan - Dikecualikan dari Jadual Waktu)"
          >
            <Briefcase className="w-2.5 h-2.5" />
            <span>AKP</span>
          </button>
        </div>

        {updating && (
          <span className="w-2.5 h-2.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></span>
        )}
        {saveSuccess && (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
        )}
      </div>

      {/* 2. Refined SubRole Badges (8 fine-grained roles) */}
      <div className="flex flex-wrap items-center gap-1">
        {category === 'GURU' ? (
          GURU_SUBROLES.map((r) => {
            const meta = GURU_SUBROLE_META[r];
            const isSelected = subRole === r;
            return (
              <button
                key={r}
                type="button"
                disabled={updating}
                onClick={() => handleSubRoleChange(r)}
                title={meta.title}
                className={`text-[9.5px] px-1.5 py-0.5 rounded transition-all cursor-pointer border ${
                  isSelected
                    ? `${meta.activeClass} ring-1 ring-white/20`
                    : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800 hover:border-slate-700'
                }`}
              >
                {meta.label}
              </button>
            );
          })
        ) : (
          AKP_SUBROLES.map((r) => {
            const meta = AKP_SUBROLE_META[r];
            const isSelected = subRole === r;
            return (
              <button
                key={r}
                type="button"
                disabled={updating}
                onClick={() => handleSubRoleChange(r)}
                title={meta.title}
                className={`text-[9.5px] px-1.5 py-0.5 rounded transition-all cursor-pointer border ${
                  isSelected
                    ? `${meta.activeClass} ring-1 ring-white/20`
                    : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800 hover:border-slate-700'
                }`}
              >
                {meta.label}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default StaffRoleCell;
