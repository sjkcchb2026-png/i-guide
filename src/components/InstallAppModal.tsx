import React, { useState, useEffect } from 'react';
import { 
  Download, 
  Smartphone, 
  Apple, 
  Share2, 
  PlusSquare, 
  CheckCircle, 
  X, 
  HelpCircle,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Layers
} from 'lucide-react';

interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstallAppModal: React.FC<InstallAppModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'install' | 'apple' | 'apk'>('install');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [installSuccess, setInstallSuccess] = useState<boolean>(false);

  useEffect(() => {
    // Check standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
    }

    // Capture Chrome/Android install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallSuccess(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      // In case prompt is not directly available, guide to browser menu
      setActiveTab('install');
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallSuccess(true);
      setDeferredPrompt(null);
    }
  };

  const appUrl = window.location.href;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">
                手机 App 安装与下载指南
              </h3>
              <p className="text-xs text-slate-400">
                Pemasangan Aplikasi Android & Apple iOS
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 p-1.5 gap-1 text-xs font-medium">
          <button
            onClick={() => setActiveTab('install')}
            className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center space-x-1.5 transition ${
              activeTab === 'install' 
                ? 'bg-blue-600 text-white shadow' 
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Android (一键安装)</span>
          </button>
          <button
            onClick={() => setActiveTab('apple')}
            className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center space-x-1.5 transition ${
              activeTab === 'apple' 
                ? 'bg-indigo-600 text-white shadow' 
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Apple className="w-3.5 h-3.5" />
            <span>iPhone / iPad (苹果)</span>
          </button>
          <button
            onClick={() => setActiveTab('apk')}
            className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center space-x-1.5 transition ${
              activeTab === 'apk' 
                ? 'bg-slate-800 text-white shadow' 
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>APK 文件包说明</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-sm text-slate-300">

          {/* TAB 1: Android PWA (One click install) */}
          {activeTab === 'install' && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-950/40 border border-blue-800/40 rounded-2xl flex items-start space-x-3">
                <Sparkles className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed text-blue-200">
                  <p className="font-semibold text-white mb-1">推荐首选：官方 Progressive Web App (PWA)</p>
                  无需从 Play 商店下载臃肿安装包，直接安装至手机主屏幕，具备独立桌面图标、秒级全屏启动、自动同步最新功能！
                </div>
              </div>

              {isInstalled ? (
                <div className="p-4 bg-emerald-950/40 border border-emerald-800/40 rounded-2xl text-center space-y-2">
                  <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto" />
                  <p className="text-white font-medium text-sm">当前已在独立 App 模式下运行！</p>
                  <p className="text-xs text-slate-400">您可直接在手机主屏幕桌面通过 App 图标启动。</p>
                </div>
              ) : deferredPrompt ? (
                <div className="space-y-2">
                  <button
                    onClick={handleInstallClick}
                    className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-2xl shadow-lg shadow-blue-900/30 flex items-center justify-center space-x-2 transition"
                  >
                    <Download className="w-5 h-5" />
                    <span>立即一键安装到手机主屏幕</span>
                  </button>
                  <p className="text-center text-xs text-slate-400">点击后手机系统将自动提示添加应用图标</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-xs text-slate-300 font-medium">如果在手机浏览器中未弹出自动安装按钮：</div>
                  <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside bg-slate-950 p-4 rounded-2xl border border-slate-800">
                    <li>在手机使用 <strong>Chrome</strong> 或 <strong>Edge</strong> 浏览器打开本考勤网址。</li>
                    <li>点击右上角的 <strong>三点菜单 (⋮)</strong>。</li>
                    <li>在菜单中找到并点击 <strong>「安装应用」</strong> 或 <strong>「添加到主屏幕」</strong>。</li>
                    <li>确认添加后，手机桌面便会生成考勤系统的独立 App 图标！</li>
                  </ol>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Apple iOS (Safari instructions) */}
          {activeTab === 'apple' && (
            <div className="space-y-4">
              <div className="p-4 bg-indigo-950/40 border border-indigo-800/40 rounded-2xl flex items-start space-x-3">
                <Apple className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed text-indigo-200">
                  <p className="font-semibold text-white mb-1">苹果设备（iPhone / iPad）安装方法</p>
                  iOS 采用苹果官方标准免审核直接安装方式，只需通过 Safari 浏览器添加至桌面，即可获得全屏的原生 App 体验！
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-start space-x-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <div className="w-6 h-6 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">1</div>
                  <div className="text-xs">
                    <p className="text-white font-medium mb-0.5">在 iPhone 默认 Safari 浏览器中打开考勤网址</p>
                    <p className="text-slate-400">注：微信内部或第三方浏览器不支持添加主屏幕，需在 Safari 中开启。</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <div className="w-6 h-6 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">2</div>
                  <div className="text-xs">
                    <p className="text-white font-medium mb-0.5 flex items-center gap-1.5">
                      点击底部导航栏中间的 <strong>「分享」</strong> 图标 <Share2 className="w-3.5 h-3.5 text-blue-400" />
                    </p>
                    <p className="text-slate-400">向上轻滑分享菜单选项。</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <div className="w-6 h-6 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">3</div>
                  <div className="text-xs">
                    <p className="text-white font-medium mb-0.5 flex items-center gap-1.5">
                      选择 <strong>「添加到主屏幕」 (Add to Home Screen)</strong> <PlusSquare className="w-3.5 h-3.5 text-emerald-400" />
                    </p>
                    <p className="text-slate-400">点击右上角的「添加」确认完成。</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: APK Package & Store Explanation */}
          {activeTab === 'apk' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
                <div className="flex items-center space-x-2 text-white font-semibold text-xs">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>为什么推荐 PWA 而不是手动发 APK 安装包？</span>
                </div>
                <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
                  <p>
                    1. <strong>免去频繁换包更新</strong>：使用 APK 包时，若日后修改打卡时间、GPS 规则或假期，全校老师必须重新下载并覆盖安装；而 PWA 网页应用每次打开即自动更新，校长无维护负担。
                  </p>
                  <p>
                    2. <strong>跨平台通用</strong>：Apple iPhone <strong>不接受下载 .apk 文件</strong>（iOS 机制严禁随意安装外部文件包，需每年 $99 开发者证书）；PWA 是唯一能让 Android 与 iPhone 均可一键安装到手机桌面的官方标准。
                  </p>
                </div>
              </div>

              <div className="p-4 bg-blue-950/30 border border-blue-900/40 rounded-2xl space-y-2">
                <div className="text-xs font-semibold text-blue-300">如果您需要将此系统打包为独立 .apk 安装包：</div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  本系统已经预置了完整的 Web App Manifest 与 PWA 移动配置，您可以通过微软官方免费开源的 <strong>PWABuilder</strong> 一键导出专属 Android APK：
                </p>
                <div className="pt-2">
                  <a
                    href={`https://www.pwabuilder.com/?url=${encodeURIComponent(appUrl)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium transition"
                  >
                    <span>前往 PWABuilder 一键打包 APK</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            SJK (C) CHUNG HUA BALINGIAN
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-xl transition"
          >
            关闭
          </button>
        </div>

      </div>
    </div>
  );
};
