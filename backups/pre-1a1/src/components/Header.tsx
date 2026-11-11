import React, { useState, useEffect } from 'react';
import { UserProfile, SchoolSettings } from '../types';
import { auth, db, firebaseConfig } from '../firebase';
import { signOut } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import { 
  School, 
  User, 
  LogOut, 
  Database, 
  ShieldCheck, 
  Clock, 
  X,
  Laptop,
  Smartphone,
  WifiOff,
  RefreshCw,
  Download
} from 'lucide-react';
import { InstallAppModal } from './InstallAppModal';

interface HeaderProps {
  currentUser: UserProfile | null;
  schoolSettings: SchoolSettings | null;
  activeView: 'staff' | 'principal';
  setActiveView: (view: 'staff' | 'principal') => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  schoolSettings,
  activeView,
  setActiveView,
}) => {
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [connStatus, setConnStatus] = useState<'connected' | 'offline' | 'checking'>('checking');

  // Dynamic real-time connection status check
  useEffect(() => {
    let isMounted = true;

    const verifyConnection = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (isMounted) setConnStatus('offline');
        return;
      }
      try {
        await getDocFromServer(doc(db, 'school_settings', 'general'));
        if (isMounted) setConnStatus('connected');
      } catch (err: any) {
        if (!isMounted) return;
        if (err.message && (err.message.includes('offline') || err.message.includes('unavailable') || err.message.includes('network'))) {
          setConnStatus('offline');
        } else {
          // If server responded (even if permission denied or doc not found), connection is alive
          setConnStatus('connected');
        }
      }
    };

    verifyConnection();
    const interval = setInterval(verifyConnection, 20000);

    const onOnline = () => {
      setConnStatus('checking');
      verifyConnection();
    };
    const onOffline = () => setConnStatus('offline');

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const isPrincipal = currentUser?.role === 'PRINCIPAL';

  return (
    <header className="bg-slate-900 text-white shadow-md border-b border-slate-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          
          {/* School Name & System Title */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-blue-600 flex items-center justify-center shadow-inner shrink-0">
              <School className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base sm:text-lg text-white leading-tight">
                  {schoolSettings?.schoolName || 'Sistem Kehadiran Sekolah'}
                </h1>
                {schoolSettings?.schoolCode && (
                  <span className="hidden sm:inline-block px-2 py-0.5 text-xs bg-blue-900/60 text-blue-200 border border-blue-700/50 rounded font-mono">
                    {schoolSettings.schoolCode}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                学校出勤网页系统 <span className="text-slate-500">|</span> Sistem Kehadiran Guru & AKP
              </p>
            </div>
          </div>

          {/* Right Action & Profile Area */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            
            {/* Dynamic Firebase Live Cloud Status Pill */}
            <button
              onClick={() => setShowConfigModal(true)}
              title="查看 Firebase 云端数据库连接"
              className={`hidden md:flex items-center space-x-1.5 px-2.5 py-1 text-xs rounded-full border transition ${
                connStatus === 'connected'
                  ? 'bg-emerald-950/70 border-emerald-600/40 text-emerald-300 hover:bg-emerald-900/60'
                  : connStatus === 'offline'
                  ? 'bg-rose-950/70 border-rose-600/40 text-rose-300 hover:bg-rose-900/60'
                  : 'bg-amber-950/70 border-amber-600/40 text-amber-300 hover:bg-amber-900/60'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  connStatus === 'connected'
                    ? 'bg-emerald-400 animate-pulse'
                    : connStatus === 'offline'
                    ? 'bg-rose-500'
                    : 'bg-amber-400 animate-ping'
                }`}
              ></span>
              {connStatus === 'offline' ? (
                <WifiOff className="w-3.5 h-3.5" />
              ) : (
                <Database className="w-3.5 h-3.5" />
              )}
              <span>
                {connStatus === 'connected'
                  ? 'Cloud Firestore 已连接'
                  : connStatus === 'offline'
                  ? '云端连接中断 (Offline)'
                  : '检测连接中...'}
              </span>
            </button>

            {/* Install PWA Mobile App Button */}
            <button
              onClick={() => setShowInstallModal(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 hover:text-white rounded-xl text-xs font-medium transition shadow-sm"
              title="安装手机 App (Android / iPhone / APK)"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">安装手机 App</span>
              <span className="sm:hidden">安装</span>
            </button>

            {/* View Switcher for Principal */}
            {isPrincipal && (
              <div className="flex items-center bg-slate-800 p-1 rounded-lg border border-slate-700">
                <button
                  onClick={() => setActiveView('staff')}
                  className={`flex items-center space-x-1 px-2.5 py-1 text-xs rounded-md font-medium transition ${
                    activeView === 'staff'
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="切换到员工打卡界面"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>打卡界面</span>
                </button>
                <button
                  onClick={() => setActiveView('principal')}
                  className={`flex items-center space-x-1 px-2.5 py-1 text-xs rounded-md font-medium transition ${
                    activeView === 'principal'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="进入校长全校管理控制台"
                >
                  <Laptop className="w-3.5 h-3.5" />
                  <span>校长管理台</span>
                </button>
              </div>
            )}

            {/* User Profile Info */}
            {currentUser && (
              <div className="flex items-center space-x-2 pl-2 border-l border-slate-700">
                <div className="text-right hidden sm:block">
                  <div className="text-sm font-medium text-slate-100 flex items-center justify-end gap-1.5">
                    <span>{currentUser.name}</span>
                    {currentUser.role === 'PRINCIPAL' ? (
                      <span className="px-1.5 py-0.5 text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded font-semibold">
                        校长 / Guru Besar
                      </span>
                    ) : currentUser.category === 'GURU' ? (
                      <span className="px-1.5 py-0.5 text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded font-semibold">
                        GURU
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded font-semibold">
                        AKP
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 font-mono">
                    {currentUser.email}
                    {currentUser.hasClerkAccess && (
                      <span className="ml-1 text-[10px] text-purple-300 font-sans">
                        (含书记假期权限)
                      </span>
                    )}
                  </div>
                </div>

                {/* Logout Button */}
                <button
                  onClick={handleLogout}
                  className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
                  title="登出系统 / Log Keluar"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            )}

          </div>

        </div>
      </div>

      {/* Firebase Cloud Connection Details Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 text-slate-100 shadow-2xl relative">
            <button
              onClick={() => setShowConfigModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Firebase 云端服务连接状态</h3>
                <p className="text-xs text-slate-400">Status Sambungan Cloud Firestore & Auth</p>
              </div>
            </div>

            <div className="space-y-3 text-sm bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs">
              <div>
                <span className="text-slate-500">Firebase Project:</span>
                <span className="text-emerald-400 ml-2">{firebaseConfig.projectId}</span>
              </div>
              <div>
                <span className="text-slate-500">Firestore Database ID:</span>
                <span className="text-blue-400 ml-2">{firebaseConfig.firestoreDatabaseId}</span>
              </div>
              <div>
                <span className="text-slate-500">Auth Domain:</span>
                <span className="text-slate-300 ml-2">{firebaseConfig.authDomain}</span>
              </div>
              <div>
                <span className="text-slate-500">Security Rules:</span>
                <span className="text-emerald-400 ml-2">已部署 (Role-based ABAC Zero-Trust)</span>
              </div>
              <div>
                <span className="text-slate-500">存储机制:</span>
                <span className="text-slate-300 ml-2">真实 Cloud Firestore（非 LocalStorage/假数据）</span>
              </div>
            </div>

            <div className="mt-4 p-3 bg-blue-950/40 border border-blue-800/40 rounded-xl text-xs text-blue-300">
              <p className="font-semibold mb-1">系统特性说明：</p>
              <ul className="list-disc pl-4 space-y-1 text-slate-300">
                <li>每位员工均有独立账号，密码最少6位。</li>
                <li>DELIMa email 仅作为系统登录名，使用独立系统密码。</li>
                <li>禁止公开注册，所有员工账号由校长统一后台建立或批量导入。</li>
                <li>员工仅可查询自己打卡记录；经纬度与定位精度仅限校长查阅。</li>
              </ul>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowConfigModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm transition"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile App Install Guidance Modal */}
      <InstallAppModal
        isOpen={showInstallModal}
        onClose={() => setShowInstallModal(false)}
      />
    </header>
  );
};
