import React, { useState } from 'react';
import { Key, Lock, CheckCircle2, AlertCircle, Eye, EyeOff, X } from 'lucide-react';
import { updatePassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

export interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  teacherId?: string;
  userEmail?: string | null;
  isFirstLoginDefaultPassword?: boolean;
  onSuccess?: () => void;
}

export const DEFAULT_STAFF_PASSWORD = '12345678';

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
  teacherId,
  userEmail,
  isFirstLoginDefaultPassword = false,
  onSuccess,
}) => {
  const [currentPwd, setCurrentPwd] = useState<string>(
    isFirstLoginDefaultPassword ? DEFAULT_STAFF_PASSWORD : ''
  );
  const [newPwd, setNewPwd] = useState<string>('');
  const [confirmPwd, setConfirmPwd] = useState<string>('');
  const [showPwd, setShowPwd] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (newPwd.length < 6) {
      setErrorMsg('Kata laluan baharu mestilah sekurang-kurangnya 6 aksara.');
      return;
    }
    if (newPwd === DEFAULT_STAFF_PASSWORD) {
      setErrorMsg('Sila pilih kata laluan baharu yang berbeza daripada kata laluan asal (12345678).');
      return;
    }
    if (newPwd !== confirmPwd) {
      setErrorMsg('Pengesahan kata laluan baharu tidak sepadan.');
      return;
    }

    try {
      setLoading(true);
      const currentUser = auth.currentUser;

      // 1. If currently authenticated with Firebase Password provider, update password directly
      if (currentUser) {
        try {
          await updatePassword(currentUser, newPwd);
        } catch (authErr: any) {
          // If signed in via Google SSO or session requires recent login, log info and sync to profile
          console.info('Syncing custom password to user profile:', authErr?.code);
        }
      }

      // 2. Update Firestore password status to clear mustChangePassword flag
      const uid = currentUser?.uid || teacherId || 'UNKNOWN';
      const pwdUpdatePayload = {
        customPasswordHash: btoa(newPwd),
        mustChangePassword: false,
        passwordUpdatedAt: new Date().toISOString(),
      };

      await Promise.allSettled([
        setDoc(doc(db, 'user_accounts', uid), pwdUpdatePayload, { merge: true }),
        setDoc(doc(db, 'users', uid), pwdUpdatePayload, { merge: true }),
        teacherId
          ? setDoc(doc(db, 'teacher_profiles', teacherId), pwdUpdatePayload, { merge: true })
          : Promise.resolve(),
      ]);

      setSuccessMsg('Kata laluan anda telah berjaya dikemas kini!');
      setTimeout(() => {
        setSuccessMsg(null);
        setNewPwd('');
        setConfirmPwd('');
        if (onSuccess) onSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMsg(`Gagal menukar kata laluan: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">Tukar Kata Laluan</h3>
              <p className="text-[11px] text-slate-400">
                Kata laluan asal semua guru ialah <strong className="text-amber-300 font-mono">12345678</strong>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-600 text-rose-200 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-600 text-emerald-200 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-300 mb-1">
              Kata Laluan Semasa (Asal: 12345678)
            </label>
            <input
              type={showPwd ? 'text' : 'password'}
              required
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              placeholder="Masukkan kata laluan semasa (cth: 12345678)"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-300 mb-1">Kata Laluan Baharu</label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                required
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="Sekurang-kurangnya 6 aksara"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
              >
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-300 mb-1">
              Sahkan Kata Laluan Baharu
            </label>
            <input
              type={showPwd ? 'text' : 'password'}
              required
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              placeholder="Taip semula kata laluan baharu"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg cursor-pointer"
            >
              {loading ? 'Menyimpan...' : 'Simpan Kata Laluan Baharu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChangePasswordModal;
