import React, { useState, useRef } from 'react';
import { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { SchoolProfile, StaffCategory, UserProfile, UserRole } from '../types';
import { deepSanitizeFirestore } from '../utils/sanitizeFirestore';
import {
  belongsToSchool,
  DEFAULT_SCHOOL_CODE,
  DEFAULT_SCHOOL_NAME,
  DEFAULT_SCHOOL_SLOGAN,
  isLegacyDefaultSchool,
  isValidSchoolCode,
  sanitizeSchoolCodeInput,
  scopedDocId,
} from '../utils/schoolTenant';
import {
  Building2,
  UserPlus,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Upload,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

interface SchoolOnboardingViewProps {
  firebaseUser: User;
  onCompleted: (profile: UserProfile, schoolProfile: SchoolProfile | null) => void;
  onLogout: () => void;
}

export const SchoolOnboardingView: React.FC<SchoolOnboardingViewProps> = ({
  firebaseUser,
  onCompleted,
  onLogout,
}) => {
  const [mode, setMode] = useState<'join' | 'register'>('register');
  const [joinCode, setJoinCode] = useState('');
  const [regCode, setRegCode] = useState('');
  const [regSchoolName, setRegSchoolName] = useState('');
  const [regAdminName, setRegAdminName] = useState(firebaseUser.displayName || '');
  const [regSlogan, setRegSlogan] = useState(DEFAULT_SCHOOL_SLOGAN);
  const [regLogoUrl, setRegLogoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cleanEmail = (firebaseUser.email || '').toLowerCase().trim();

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Sila pilih fail imej yang sah (PNG, JPG, WebP, atau SVG).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 256;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          setRegLogoUrl(canvas.toDataURL('image/png', 0.9));
        } else {
          setRegLogoUrl(dataUrl);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleRegisterNewSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const code = sanitizeSchoolCodeInput(regCode);
    const name = regSchoolName.trim();
    const slogan = regSlogan.trim() || DEFAULT_SCHOOL_SLOGAN;
    const adminName = regAdminName.trim() || firebaseUser.displayName || cleanEmail.split('@')[0] || 'Guru Besar';

    if (!isValidSchoolCode(code)) {
      setErrorMsg('Kod Sekolah tidak sah. Gunakan 3–20 aksara huruf dan nombor sahaja (cth: YCC1234, SKK001).');
      return;
    }
    if (isLegacyDefaultSchool(code)) {
      setErrorMsg(`Kod Sekolah ${DEFAULT_SCHOOL_CODE} telah didaftarkan oleh ${DEFAULT_SCHOOL_NAME}. Sila gunakan Kod Sekolah anda sendiri.`);
      return;
    }
    if (!name || name.length < 3) {
      setErrorMsg('Sila masukkan Nama Rasmi Sekolah sekurang-kurangnya 3 aksara.');
      return;
    }

    setLoading(true);
    try {
      const schoolRef = doc(db, 'schools', code);
      const existingSchool = await getDoc(schoolRef);
      if (existingSchool.exists()) {
        setErrorMsg(`Kod Sekolah ${code} telah wujud dalam sistem. Jika anda pentadbir atau staf sekolah tersebut, sila pilih tab "Sertai Sekolah Sedia Ada".`);
        setLoading(false);
        return;
      }

      const schoolProfile: SchoolProfile = {
        schoolCode: code,
        schoolName: name,
        logoUrl: regLogoUrl.trim(),
        slogan,
        adminEmails: cleanEmail ? [cleanEmail] : [],
        principalEmail: cleanEmail,
        principalUid: firebaseUser.uid,
        schoolType: 'SJKC',
        schoolCategory: 'SKM',
        hasPreschool: false,
        hasPPKI: false,
        academicSession: String(new Date().getFullYear()),
        createdByUid: firebaseUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(schoolRef, deepSanitizeFirestore(schoolProfile));

      const settingsId = scopedDocId(code, 'general');
      await setDoc(
        doc(db, 'school_settings', settingsId),
        deepSanitizeFirestore({
          schoolCode: code,
          schoolName: name,
          schoolLogo: regLogoUrl.trim(),
          logoUrl: regLogoUrl.trim(),
          slogan,
          adminEmails: cleanEmail ? [cleanEmail] : [],
          principalEmail: cleanEmail,
          principalUid: firebaseUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );

      const configId = scopedDocId(code, 'default');
      await setDoc(
        doc(db, 'school_config', configId),
        deepSanitizeFirestore({
          id: configId,
          schoolCode: code,
          schoolName: name,
          schoolType: 'SJKC',
          schoolCategory: 'SKM',
          hasPreschool: false,
          hasPPKI: false,
          academicSession: String(new Date().getFullYear()),
          defaultLanguages: ['BC', 'BM', 'BI'],
          schoolLogo: regLogoUrl.trim(),
          slogan,
          adminEmails: cleanEmail ? [cleanEmail] : [],
          updatedAt: serverTimestamp(),
        })
      );

      const userProfile: UserProfile = {
        uid: firebaseUser.uid,
        name: adminName,
        email: cleanEmail,
        schoolCode: code,
        category: 'PRINCIPAL',
        role: 'PRINCIPAL',
        hasClerkAccess: true,
        active: true,
        isPreRegistered: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'users', firebaseUser.uid), deepSanitizeFirestore(userProfile), { merge: true });
      onCompleted(userProfile, schoolProfile);
    } catch (err: any) {
      console.error('Register new school error:', err);
      setErrorMsg(err?.message || 'Gagal mendaftarkan sekolah baharu. Sila cuba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinExistingSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const code = sanitizeSchoolCodeInput(joinCode);
    if (!isValidSchoolCode(code)) {
      setErrorMsg('Sila masukkan Kod Sekolah yang sah (cth: YCC3404 atau ABC1234).');
      return;
    }

    setLoading(true);
    try {
      const schoolRef = doc(db, 'schools', code);
      const schoolSnap = await getDoc(schoolRef);
      let resolvedSchoolProfile: SchoolProfile | null = schoolSnap.exists()
        ? (schoolSnap.data() as SchoolProfile)
        : null;

      if (!resolvedSchoolProfile && isLegacyDefaultSchool(code)) {
        const legacySettings = await getDoc(doc(db, 'school_settings', 'general')).catch(() => null);
        const sData: any = legacySettings?.exists() ? legacySettings.data() : {};
        resolvedSchoolProfile = {
          schoolCode: DEFAULT_SCHOOL_CODE,
          schoolName: sData?.schoolName || DEFAULT_SCHOOL_NAME,
          logoUrl: sData?.schoolLogo || sData?.logoUrl || '',
          slogan: sData?.slogan || DEFAULT_SCHOOL_SLOGAN,
          adminEmails: Array.isArray(sData?.adminEmails)
            ? sData.adminEmails
            : sData?.principalEmail
              ? [String(sData.principalEmail).toLowerCase().trim()]
              : [],
          principalEmail: sData?.principalEmail || '',
        };
      }

      if (!resolvedSchoolProfile) {
        setErrorMsg(`Kod Sekolah "${code}" belum didaftarkan lagi. Anda boleh beralih ke tab "Daftar Sekolah Baharu" untuk mendaftarkannya.`);
        setLoading(false);
        return;
      }

      let matchedProfile: UserProfile | null = null;
      const userDocRef = doc(db, 'users', firebaseUser.uid);

      // 1. Check school adminEmails / principalEmail
      const adminList = (resolvedSchoolProfile.adminEmails || []).map((em) => String(em).toLowerCase().trim());
      const principalEmail = (resolvedSchoolProfile.principalEmail || '').toLowerCase().trim();
      if (cleanEmail && (adminList.includes(cleanEmail) || (principalEmail && principalEmail === cleanEmail))) {
        matchedProfile = {
          uid: firebaseUser.uid,
          name: firebaseUser.displayName || cleanEmail.split('@')[0] || 'Guru Besar',
          email: cleanEmail,
          schoolCode: code,
          category: 'PRINCIPAL',
          role: 'PRINCIPAL',
          hasClerkAccess: true,
          active: true,
          isPreRegistered: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
      }

      // 2. Check pre-registered users under this schoolCode
      if (!matchedProfile && cleanEmail) {
        const qUsers = query(collection(db, 'users'), where('email', '==', cleanEmail));
        const uSnap = await getDocs(qUsers);
        const matchedDoc = uSnap.docs.find((d) => belongsToSchool(d.data() as any, code));
        if (matchedDoc) {
          const preData = matchedDoc.data() as UserProfile;
          if (preData.active === false) {
            setErrorMsg('Akaun anda di sekolah ini telah dinyahaktifkan oleh pentadbir sekolah.');
            setLoading(false);
            return;
          }
          matchedProfile = {
            ...preData,
            uid: firebaseUser.uid,
            schoolCode: code,
            isPreRegistered: false,
            active: true,
            updatedAt: serverTimestamp(),
          };
          if (matchedDoc.id !== firebaseUser.uid) {
            await setDoc(matchedDoc.ref, { uid: firebaseUser.uid, schoolCode: code, isPreRegistered: false, active: true }, { merge: true }).catch(() => {});
          }
        }
      }

      // 3. Check personnel under this schoolCode
      if (!matchedProfile && cleanEmail) {
        const qPersonnel = query(collection(db, 'personnel'), where('email', '==', cleanEmail));
        const pSnap = await getDocs(qPersonnel);
        const pDoc = pSnap.docs.find((d) => belongsToSchool(d.data() as any, code));
        if (pDoc) {
          const pData: any = pDoc.data();
          const posUpper = String(pData.position || pData.jawatan || '').toUpperCase();
          const isPrincipalUser = posUpper.includes('GURU BESAR') || posUpper === 'GB' || pData.leadershipRole === 'GURU_BESAR';
          const catUpper = String(pData.category || '').toUpperCase();
          const isAkpUser =
            catUpper === 'AKP' ||
            posUpper.includes('PKA') ||
            posUpper.includes('PPM') ||
            posUpper.includes('PT') ||
            posUpper.includes('PEMBANTU') ||
            posUpper.includes('KERANI') ||
            posUpper.includes('OPERASI');
          const resolvedRole: UserRole = isPrincipalUser ? 'PRINCIPAL' : isAkpUser ? 'AKP' : 'GURU';
          const resolvedCat: StaffCategory = isPrincipalUser ? 'PRINCIPAL' : isAkpUser ? 'AKP' : 'GURU';

          matchedProfile = {
            uid: firebaseUser.uid,
            name: pData.name || pData.nama || firebaseUser.displayName || cleanEmail.split('@')[0],
            email: cleanEmail,
            schoolCode: code,
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
          };
        }
      }

      // 4. Check teachers under this schoolCode
      if (!matchedProfile && cleanEmail) {
        const qTeachers = query(collection(db, 'teachers'), where('email', '==', cleanEmail));
        const tSnap = await getDocs(qTeachers);
        const tDoc = tSnap.docs.find((d) => belongsToSchool(d.data() as any, code));
        if (tDoc) {
          const tData: any = tDoc.data();
          matchedProfile = {
            uid: firebaseUser.uid,
            name: tData.name || firebaseUser.displayName || cleanEmail.split('@')[0],
            email: cleanEmail,
            schoolCode: code,
            category: 'GURU',
            role: 'GURU',
            ic: tData.ic || '',
            personnelId: tDoc.id,
            active: true,
            isPreRegistered: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
        }
      }

      // 5. Legacy YCC3404 official staff roster fallback (STRICTLY YCC3404 ONLY)
      if (!matchedProfile && cleanEmail && isLegacyDefaultSchool(code)) {
        try {
          const idToken = await firebaseUser.getIdToken();
          const res = await fetch('/api/auth/resolve-staff-profile', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ email: cleanEmail, schoolCode: DEFAULT_SCHOOL_CODE }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.profile) {
              matchedProfile = {
                ...data.profile,
                uid: firebaseUser.uid,
                schoolCode: DEFAULT_SCHOOL_CODE,
                isPreRegistered: false,
                active: true,
                updatedAt: serverTimestamp(),
              };
            }
          }
        } catch (apiErr) {
          console.warn('YCC3404 resolver fallback error:', apiErr);
        }
      }

      if (!matchedProfile) {
        setErrorMsg(
          `E-mel anda (${cleanEmail}) belum didaftarkan di bawah sekolah ${code} (${resolvedSchoolProfile.schoolName}). Sila hubungi Guru Besar atau Pentadbir sekolah tersebut untuk mendaftarkan e-mel anda dalam Master Data Kakitangan atau Senarai Admin Sekolah.`
        );
        setLoading(false);
        return;
      }

      await setDoc(userDocRef, deepSanitizeFirestore(matchedProfile), { merge: true });
      onCompleted(matchedProfile, resolvedSchoolProfile);
    } catch (err: any) {
      console.error('Join school error:', err);
      setErrorMsg(err?.message || 'Gagal menyertai sekolah. Sila cuba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Persediaan Sekolah Berbilang Penyewa</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">
              Pilih atau Daftar Sekolah Anda
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Akaun log masuk: <strong className="text-slate-200">{cleanEmail}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Log Keluar</span>
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-2xl border border-slate-800 mb-6">
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setErrorMsg(null);
            }}
            className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-2 ${
              mode === 'register'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Daftar Sekolah Baharu</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('join');
              setErrorMsg(null);
            }}
            className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-2 ${
              mode === 'join'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Sertai Sekolah Sedia Ada</span>
          </button>
        </div>

        {errorMsg && (
          <div className="mb-5 p-3.5 bg-rose-950/60 border border-rose-800/60 rounded-xl text-rose-200 text-xs sm:text-sm flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {mode === 'register' ? (
          <form onSubmit={handleRegisterNewSchool} className="space-y-4">
            <div className="p-3.5 bg-indigo-950/30 border border-indigo-800/40 rounded-xl text-xs text-indigo-200 leading-relaxed">
              Setiap sekolah mempunyai ruang data tersendiri yang terasing sepenuhnya mengikut <strong>Kod Sekolah</strong>. Anda akan didaftarkan sebagai <strong>Guru Besar / Admin</strong> bagi sekolah baharu ini.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Kod Sekolah *
                </label>
                <input
                  type="text"
                  value={regCode}
                  onChange={(e) => setRegCode(e.target.value.toUpperCase())}
                  placeholder="cth: YCC1234 / SKB001"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Nama Anda (Guru Besar / Admin)
                </label>
                <input
                  type="text"
                  value={regAdminName}
                  onChange={(e) => setRegAdminName(e.target.value)}
                  placeholder="Nama penuh pentadbir"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Nama Rasmi Sekolah *
              </label>
              <input
                type="text"
                value={regSchoolName}
                onChange={(e) => setRegSchoolName(e.target.value)}
                placeholder="cth: SJK (C) CHUNG HUA SIBU"
                required
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Slogan / Subtajuk Sekolah
              </label>
              <input
                type="text"
                value={regSlogan}
                onChange={(e) => setRegSlogan(e.target.value)}
                placeholder={DEFAULT_SCHOOL_SLOGAN}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Logo / Lencana Sekolah (Pilihan)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={regLogoUrl}
                  onChange={(e) => setRegLogoUrl(e.target.value)}
                  placeholder="Tampal URL imej atau muat naik logo..."
                  className="flex-1 px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-medium text-slate-200 flex items-center gap-1.5 shrink-0 transition"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Muat Naik</span>
                </button>
              </div>
              {regLogoUrl && (
                <div className="mt-2.5 flex items-center gap-3 p-2 bg-slate-950 rounded-xl border border-slate-800">
                  <img
                    src={regLogoUrl}
                    alt="Pratonton Logo"
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-lg object-contain bg-white p-0.5"
                    onError={() => setRegLogoUrl('')}
                  />
                  <span className="text-xs text-slate-400">Pratonton logo sekolah sedia untuk disimpan.</span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-indigo-900/30 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyediakan Ruang Sekolah...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Daftar Sekolah & Masuk ke Sistem</span>
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoinExistingSchool} className="space-y-4">
            <div className="p-3.5 bg-blue-950/30 border border-blue-800/40 rounded-xl text-xs text-blue-200 leading-relaxed">
              Masukkan <strong>Kod Sekolah</strong> anda untuk memadankan akaun <strong>{cleanEmail}</strong> dengan rekod kakitangan atau pentadbir sekolah tersebut.
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Kod Sekolah *
              </label>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="cth: YCC3404 atau Kod Sekolah anda"
                required
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-blue-900/30 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Mengesahkan Keahlian Sekolah...</span>
                </>
              ) : (
                <>
                  <span>Sahkan & Sertai Sekolah</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Data setiap sekolah diasingkan sepenuhnya mengikut Kod Sekolah</span>
        </div>
      </div>
    </div>
  );
};
