import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail,
  setPersistence,
  inMemoryPersistence
} from 'firebase/auth';
import { auth } from '../firebase';
import { SchoolSettings } from '../types';
import { 
  School, 
  Lock, 
  Mail, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  Sparkles,
  Info,
  Key,
  Smartphone,
  RefreshCw
} from 'lucide-react';
import { InstallAppModal } from './InstallAppModal';
import { SchoolLogo } from './SchoolLogo';

interface LoginViewProps {
  schoolSettings: SchoolSettings | null;
  onLoginSuccess: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  schoolSettings,
  onLoginSuccess,
}) => {
  const [isSetupMode, setIsSetupMode] = useState(!schoolSettings);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resetStatus, setResetStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [sendingReset, setSendingReset] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);

  // Automatically switch to standard login if school settings are loaded
  React.useEffect(() => {
    if (schoolSettings) {
      setIsSetupMode(false);
      if (schoolSettings.principalEmail && !email) {
        setEmail(schoolSettings.principalEmail);
      }
    }
  }, [schoolSettings]);

  // Initial Principal Setup state (strictly blank by default, never prefilled)
  const [setupToken, setSetupToken] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [schoolCode, setSchoolCode] = useState('');
  const [principalName, setPrincipalName] = useState('');
  const [principalEmail, setPrincipalEmail] = useState('');
  const [principalPassword, setPrincipalPassword] = useState('');

  // Handle Self-Service Password Reset
  const handleResetPassword = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Sila masukkan alamat e-mel DELIMa anda di ruangan e-mel terlebih dahulu.');
      return;
    }
    setSendingReset(true);
    setResetStatus(null);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setResetStatus({
        type: 'success',
        message: `Pautan tetapan semula kata laluan telah berjaya dihantar ke e-mel: ${cleanEmail}. Sila semak peti masuk atau folder Spam/Junk anda.`,
      });
      setErrorMsg(null);
    } catch (err: any) {
      console.error('Reset password error:', err);
      let errMsg = 'Gagal menghantar pautan tetapan semula.';
      if (err.code === 'auth/user-not-found') {
        errMsg = 'Akaun e-mel ini belum didaftarkan di dalam sistem. Sila hubungi Guru Besar.';
      } else if (err.code === 'auth/invalid-email') {
        errMsg = 'Format alamat e-mel tidak sah.';
      }
      setResetStatus({
        type: 'error',
        message: `${errMsg} (${err.code || err.message})`,
      });
    } finally {
      setSendingReset(false);
    }
  };

  // Handle Standard Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setResetStatus(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setErrorMsg('请输入您的 DELIMa 或工作邮箱 (Sila masukkan emel anda)');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMsg('密码最少需 6 位字符 (Kata laluan sekurang-kurangnya 6 aksara)');
      return;
    }

    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, cleanEmail, password);
      onLoginSuccess();
    } catch (err: any) {
      console.error('Sign in error:', err);

      // Auto-recover from IndexedDB FILE_ERROR_NO_SPACE / transaction aborted errors
      const isStorageQuotaError =
        err?.code === 'auth/internal-error' ||
        String(err?.message || '').toLowerCase().includes('transaction was aborted') ||
        String(err?.message || '').toLowerCase().includes('file_error_no_space') ||
        String(err?.message || '').toLowerCase().includes('indexeddb');

      if (isStorageQuotaError) {
        try {
          console.warn('Recovering from storage error using inMemoryPersistence...');
          await setPersistence(auth, inMemoryPersistence);
          await signInWithEmailAndPassword(auth, cleanEmail, password);
          onLoginSuccess();
          return;
        } catch (retryErr: any) {
          console.error('Retry sign in error:', retryErr);
          err = retryErr;
        }
      }

      let msg = '登录失败，请检查账号与密码。';
      if (err.code === 'auth/operation-not-allowed') {
        msg = '⚠️ Firebase 控制台尚未启用【电子邮件/密码】登录方式！\n\n请前往 Firebase 控制台：\nAuthentication ➜ Sign-in method ➜ 点击「Email/Password」➜ 切换为「启用 (Enable)」并保存。\n保存后即可直接在此输入邮箱与密码登录。';
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        msg = '⚠️ E-mel atau kata laluan tidak sah (auth/invalid-credential).\n\n💡 Petunjuk Sistem:\n1. Semua akaun guru & staf sekolah disediakan dengan kata laluan asal piawai: 12345678.\n2. Sila klik butang "Isi Kata Laluan Asal (12345678)" di bawah untuk mencuba semula.\n3. Jika anda telah menukar kata laluan dan terlupa, klik "Hantar Pautan Reset Kata Laluan ke E-mel".';
      } else if (err.code === 'auth/wrong-password') {
        msg = '密码错误，请输入本系统独立密码（Kata laluan asal piawai: 12345678）。\n(Kata laluan salah. Sila masukkan kata laluan sistem ini.)';
      } else if (err.code === 'auth/too-many-requests') {
        msg = '登录尝试次数过多，请稍候再试。\n(Terlalu banyak percubaan log masuk. Sila cuba sebentar lagi.)';
      } else if (err.code === 'auth/network-request-failed') {
        msg = '网络连接失败，请检查网络连接。\n(Gagal menyambung ke pelayan. Sila periksa internet.)';
      } else if (err.code === 'auth/internal-error') {
        msg = 'Pelayar anda mengalami masalah storan sementara (IndexedDB). Sila segarkan semula halaman (Refresh) atau gunakan mod inkognito.';
      }
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  // Handle Initial Principal & School Setup (Atomic backend execution, safe once-only)
  const handlePrincipalSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!setupToken.trim()) {
      setErrorMsg('请输入一次性服务器设立密钥 (SETUP_TOKEN)');
      return;
    }
    if (!schoolName.trim()) {
      setErrorMsg('请填写学校全称 (Sila masukkan nama sekolah)');
      return;
    }
    if (!principalEmail.trim() || !principalEmail.includes('@')) {
      setErrorMsg('请填写有效的校长邮箱 (Sila masukkan emel Pengetua)');
      return;
    }
    if (principalPassword.length < 6) {
      setErrorMsg('密码最少需 6 位 (Kata laluan sekurang-kurangnya 6 aksara)');
      return;
    }

    try {
      setLoading(true);
      const cleanEmail = principalEmail.trim().toLowerCase();

      // Secure backend call: Atomic single-time setup with SETUP_TOKEN
      const res = await fetch('/api/setup/init-school', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setupToken: setupToken.trim(),
          schoolName: schoolName.trim(),
          schoolCode: schoolCode.trim().toUpperCase(),
          principalName: principalName.trim() || '校长',
          principalEmail: cleanEmail,
          principalPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '设立学校时发生错误');
      }

      // Automatically sign in with the new Principal credentials
      try {
        await signInWithEmailAndPassword(auth, cleanEmail, principalPassword);
        onLoginSuccess();
      } catch (loginErr: any) {
        if (
          loginErr?.code === 'auth/internal-error' ||
          String(loginErr?.message || '').toLowerCase().includes('transaction was aborted') ||
          String(loginErr?.message || '').toLowerCase().includes('file_error_no_space') ||
          String(loginErr?.message || '').toLowerCase().includes('indexeddb')
        ) {
          try {
            await setPersistence(auth, inMemoryPersistence);
            await signInWithEmailAndPassword(auth, cleanEmail, principalPassword);
            onLoginSuccess();
            return;
          } catch (retryLoginErr) {
            console.error('Retry setup login error:', retryLoginErr);
          }
        }
        if (loginErr.code === 'auth/operation-not-allowed' || loginErr.message?.includes('PASSWORD_LOGIN_DISABLED') || loginErr.code === 'auth/configuration-not-found') {
          setErrorMsg('学校档案已成功保存入库！检测到 Firebase 控制台尚未开启【电子邮件/密码】登录提供商。请在 Firebase 控制台 Authentication > Sign-in method 启用 Email/Password 即可登录。');
          setIsSetupMode(false);
          setEmail(cleanEmail);
          return;
        }
        throw loginErr;
      }
    } catch (err: any) {
      console.error('Setup error:', err);
      setErrorMsg(`初始化设立失败: ${err.message || '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <div className="max-w-md w-full">
        
        {/* Top Branding Card */}
        <div className="text-center mb-6">
          <SchoolLogo className="w-16 h-16 mx-auto mb-3" src={schoolSettings?.schoolLogo} />
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {schoolSettings?.schoolName || 'Sistem Kehadiran Sekolah'}
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            学校出勤网页系统 <span className="text-slate-600">|</span> Pengesahan Lokasi GPS & Masa Sebenar
          </p>
        </div>

        {/* Main Form Container */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
          
          {/* Status badge when school settings already configured */}
          {schoolSettings ? (
            <div className="mb-6 p-3 bg-emerald-950/40 border border-emerald-800/40 rounded-xl text-center text-xs text-emerald-300 flex items-center justify-center space-x-2 shadow-inner">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>学校档案已就绪：<strong className="text-white font-semibold">{schoolSettings.schoolName}</strong> ({schoolSettings.schoolCode})</span>
            </div>
          ) : (
            <div className="flex bg-slate-950 p-1 rounded-xl mb-6 border border-slate-800 text-xs font-medium">
              <button
                type="button"
                onClick={() => { setIsSetupMode(false); setErrorMsg(null); }}
                className={`flex-1 py-2 rounded-lg transition ${
                  !isSetupMode ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                教职员登录 (Log Masuk)
              </button>
              <button
                type="button"
                onClick={() => { setIsSetupMode(true); setErrorMsg(null); }}
                className={`flex-1 py-2 rounded-lg transition flex items-center justify-center space-x-1 ${
                  isSetupMode ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>校长初始配置 (Persediaan)</span>
              </button>
            </div>
          )}

          {/* Error Message Alert */}
          {errorMsg && (
            <div className="mb-5 p-3.5 bg-rose-950/60 border border-rose-800/50 rounded-xl text-rose-200 text-xs sm:text-sm flex items-start space-x-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="whitespace-pre-line leading-relaxed">{errorMsg}</div>
            </div>
          )}

          {!isSetupMode ? (
            /* --- Standard Login Form --- */
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  DELIMa 邮箱 / 登录账号 (Emel DELIMa)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="contoh: g-12345678@moe-dl.edu.my"
                    required
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>系统登录密码 (Kata Laluan)</span>
                  <span className="text-[11px] text-slate-500 font-normal">最少6位字符</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Kata Laluan Piawai: 12345678"
                    required
                    minLength={6}
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Helper buttons: Auto-fill default password & Forgot password */}
                <div className="mt-2 flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setPassword('12345678');
                      setErrorMsg(null);
                    }}
                    className="inline-flex items-center space-x-1 text-emerald-400 hover:text-emerald-300 font-medium py-1 px-2 rounded-lg bg-emerald-950/40 border border-emerald-800/40 hover:bg-emerald-900/40 transition"
                  >
                    <Key className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Isi Kata Laluan Asal: <strong>12345678</strong></span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={sendingReset}
                    className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition disabled:opacity-50"
                  >
                    {sendingReset ? 'Menghantar...' : 'Lupa kata laluan?'}
                  </button>
                </div>
              </div>

              {/* Password Reset Feedback Alert */}
              {resetStatus && (
                <div className={`p-3 rounded-xl border text-xs flex items-start space-x-2 ${
                  resetStatus.type === 'success' 
                    ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-200' 
                    : 'bg-rose-950/60 border-rose-800/60 text-rose-200'
                }`}>
                  {resetStatus.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <span className="leading-relaxed">{resetStatus.message}</span>
                </div>
              )}

              {/* DELIMa Policy Reminder */}
              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <div className="flex items-center text-amber-300/90 font-medium space-x-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  <span>Peringatan Kata Laluan Piawai</span>
                </div>
                <p>
                  Kata laluan asal piawai bagi semua akaun guru dan staf ialah: <strong className="text-amber-200">12345678</strong>.
                </p>
                <p className="text-slate-500">
                  Selepas log masuk, anda boleh menukar kata laluan peribadi bila-bila masa melalui menu 🔑 Tukar Kata Laluan.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium text-sm rounded-xl shadow-lg shadow-blue-900/30 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>正在验证中...</span>
                  </>
                ) : (
                  <>
                    <span>登录出勤系统 / Log Masuk</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            /* --- Initial Principal Setup Form --- */
            <form onSubmit={handlePrincipalSetup} className="space-y-4">
              <div className="p-3 bg-indigo-950/40 border border-indigo-800/40 rounded-xl text-xs text-indigo-300 mb-2">
                <div className="font-semibold mb-1 flex items-center space-x-1">
                  <ShieldCheck className="w-4 h-4 text-indigo-400" />
                  <span>校长首次启用与学校配置</span>
                </div>
                <p className="text-slate-300">
                  首次使用请设定学校名称与校长管理密码。保存后系统将永久锁定，用于全校出勤记录及报表抬头发放。
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-amber-300">
                    <Key className="w-3.5 h-3.5" />
                    <span>一次性初始化设立密钥 (SETUP_TOKEN) *</span>
                  </span>
                  <span className="text-[11px] text-slate-500 font-normal">环境变量配置</span>
                </label>
                <input
                  type="password"
                  value={setupToken}
                  onChange={(e) => setSetupToken(e.target.value)}
                  placeholder="请输入服务器配置的一次性安全密钥"
                  required
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  仅持有服务器一次性设立密钥的校长方可执行此唯一一次初始化。
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  学校全称 (Nama Rasmi Sekolah) *
                </label>
                <input
                  type="text"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="例如：国民型华文小学 / Sekolah Jenis Kebangsaan"
                  required
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    学校编号 (Kod Sekolah)
                  </label>
                  <input
                    type="text"
                    value={schoolCode}
                    onChange={(e) => setSchoolCode(e.target.value)}
                    placeholder="例: JBC1001"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    校长姓名 (Nama Guru Besar)
                  </label>
                  <input
                    type="text"
                    value={principalName}
                    onChange={(e) => setPrincipalName(e.target.value)}
                    placeholder="例: 陈校长 / Guru Besar"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  校长登录邮箱 (Emel Pengetua) *
                </label>
                <input
                  type="email"
                  value={principalEmail}
                  onChange={(e) => setPrincipalEmail(e.target.value)}
                  placeholder="例如：pengetua@school.edu.my"
                  required
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  校长管理员密码 (Kata Laluan Pentadbir) *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={principalPassword}
                    onChange={(e) => setPrincipalPassword(e.target.value)}
                    placeholder="最少6位字符"
                    required
                    minLength={6}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium text-sm rounded-xl shadow-lg shadow-indigo-900/30 transition disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>正在创建学校与校长账号...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>确认设立并进入系统 / Simpan & Mulakan</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Footer note */}
          {!isSetupMode && !schoolSettings && (
            <div className="mt-5 text-center">
              <button
                onClick={() => setIsSetupMode(true)}
                className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-4"
              >
                首次使用？点击进行校长初始设立 (Persediaan Pengetua)
              </button>
            </div>
          )}

          {/* Mobile App Install Guidance Button */}
          <div className="mt-5 pt-4 border-t border-slate-800 text-center">
            <button
              type="button"
              onClick={() => setShowInstallModal(true)}
              className="inline-flex items-center space-x-2 text-xs text-blue-400 hover:text-blue-300 font-medium transition py-1.5 px-3 rounded-xl hover:bg-slate-800/80"
            >
              <Smartphone className="w-4 h-4 text-blue-400" />
              <span>📱 如何安装至 Android 或 iPhone 手机桌面 (App)？</span>
            </button>
          </div>

        </div>

        {/* Security and Cloud Verification Footer */}
        <div className="mt-6 text-center text-xs text-slate-500 flex items-center justify-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Firebase Cloud Authentication & Security Rules ABAC Enforced</span>
        </div>

        {/* Mobile App Install Guidance Modal */}
        <InstallAppModal
          isOpen={showInstallModal}
          onClose={() => setShowInstallModal(false)}
        />
      </div>
    </div>
  );
};
