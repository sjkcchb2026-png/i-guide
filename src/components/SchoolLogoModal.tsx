import React, { useState } from 'react';
import {
  UploadCloud,
  Link,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  X,
  Sparkles,
  School,
  ExternalLink
} from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import SchoolLogo from './SchoolLogo';
import { useSchoolTenant } from '../contexts/SchoolTenantContext';
import { normalizeActiveSchoolCode, scopedDocId } from '../utils/schoolTenant';

interface SchoolLogoModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLogoUrl?: string;
  schoolCode?: string;
  onLogoUpdated?: (newLogo: string) => void;
}

export const SchoolLogoModal: React.FC<SchoolLogoModalProps> = ({
  isOpen,
  onClose,
  currentLogoUrl = '',
  schoolCode: propSchoolCode,
  onLogoUpdated,
}) => {
  const tenant = useSchoolTenant();
  const activeCode = normalizeActiveSchoolCode(propSchoolCode || tenant.schoolCode);
  const [activeTab, setActiveTab] = useState<'upload' | 'url'>('upload');
  const [previewLogo, setPreviewLogo] = useState<string>(currentLogoUrl);
  const [urlInput, setUrlInput] = useState<string>('');
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [imageMeta, setImageMeta] = useState<{ width: number; height: number; sizeKb: number } | null>(null);

  if (!isOpen) return null;

  // 1. Process uploaded file & compress via HTML5 canvas (keeps base64 < 150KB)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setStatusMessage({ text: 'Sila pilih fail imej yang sah (PNG, JPG, SVG, WebP).', type: 'error' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 320;
        let width = img.width;
        let height = img.height;

        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/png', 0.95);
          const sizeKb = Math.round((compressedDataUrl.length * 3) / 4 / 1024);

          setPreviewLogo(compressedDataUrl);
          setImageMeta({ width, height, sizeKb });
          setStatusMessage({
            text: `Imej berjaya dimuat naik & dimampatkan (${width}x${height}px · ${sizeKb} KB).`,
            type: 'success',
          });
        }
      };
      img.onerror = () => {
        setStatusMessage({ text: 'Gagal memproses fail imej yang dimuat naik.', type: 'error' });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // 2. Extract logo from URL (via backend proxy with client-side fallback)
  const handleExtractFromUrl = async () => {
    const cleanUrl = urlInput.trim();
    if (!cleanUrl || !cleanUrl.startsWith('http')) {
      setStatusMessage({ text: 'Sila masukkan pautan URL yang sah (bermula dengan http:// atau https://).', type: 'error' });
      return;
    }

    setIsExtracting(true);
    setStatusMessage({ text: 'Mengekstrak imej logo daripada URL...', type: 'info' });

    try {
      // First attempt: Call backend extractor
      const res = await fetch('/api/extract-logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.logoUrl) {
          setPreviewLogo(data.logoUrl);
          const sizeKb = data.sizeBytes ? Math.round(data.sizeBytes / 1024) : 0;
          setImageMeta(sizeKb > 0 ? { width: 0, height: 0, sizeKb } : null);
          setStatusMessage({
            text: `Logo berjaya diekstrak (${data.type === 'direct_image' ? 'Imej Terus' : 'Dari Laman Web'})!`,
            type: 'success',
          });
          return;
        }
      }

      // Fallback: Direct image test on client side
      const testImg = new Image();
      testImg.onload = () => {
        setPreviewLogo(cleanUrl);
        setStatusMessage({ text: 'Pautan imej disahkan sah dan sedia disimpan!', type: 'success' });
      };
      testImg.onerror = () => {
        setStatusMessage({
          text: 'Tidak dapat memuatkan imej daripada URL tersebut. Sila pastikan pautan terus kepada fail imej.',
          type: 'error',
        });
      };
      testImg.src = cleanUrl;
    } catch (err: any) {
      console.warn('Backend extract error, falling back to direct URL:', err);
      setPreviewLogo(cleanUrl);
      setStatusMessage({ text: 'Pautan URL ditetapkan (pralihat langsung).', type: 'info' });
    } finally {
      setIsExtracting(false);
    }
  };

  // 3. Save Logo to Firestore (schools/{code}, scoped school_settings and school_config)
  const handleSaveLogo = async () => {
    setIsSaving(true);
    try {
      const finalLogo = previewLogo.trim();
      const nowIso = new Date().toISOString();

      await setDoc(
        doc(db, 'schools', activeCode),
        {
          schoolCode: activeCode,
          logoUrl: finalLogo,
          updatedAt: nowIso,
        },
        { merge: true }
      );

      await setDoc(
        doc(db, 'school_settings', scopedDocId(activeCode, 'general')),
        {
          schoolCode: activeCode,
          schoolLogo: finalLogo,
          logoUrl: finalLogo,
          updatedAt: nowIso,
        },
        { merge: true }
      );

      try {
        await setDoc(
          doc(db, 'school_config', scopedDocId(activeCode, 'default')),
          {
            schoolCode: activeCode,
            schoolLogo: finalLogo,
            updatedAt: nowIso,
          },
          { merge: true }
        );
      } catch (e) {
        // Safe ignore
      }

      // 2. Call backend proxy endpoint
      try {
        const idToken = await auth.currentUser?.getIdToken().catch(() => null);
        await fetch('/api/update-school-logo', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify({ schoolLogo: finalLogo, schoolCode: activeCode }),
        });
      } catch (e) {
        // Safe ignore
      }

      // 3. Update namespaced localStorage cache for instant zero-latency load
      if (typeof window !== 'undefined') {
        const storageKey = `isepadu_school_logo_${activeCode}`;
        if (finalLogo) {
          localStorage.setItem(storageKey, finalLogo);
        } else {
          localStorage.removeItem(storageKey);
        }
      }

      if (onLogoUpdated) onLogoUpdated(finalLogo);
      setStatusMessage({ text: 'Logo sekolah berjaya disimpan & dikemaskini!', type: 'success' });
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      console.error('Failed to save logo:', err);
      setStatusMessage({ text: `Gagal menyimpan logo: ${err.message}`, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // 4. Reset to Default iSEPADU Badge
  const handleResetToDefault = () => {
    setPreviewLogo('');
    setImageMeta(null);
    setUrlInput('');
    setStatusMessage({ text: 'Logo disetkan kepada lambang lencana rasmi laluan.', type: 'info' });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 space-y-5 shadow-2xl my-auto animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
              <School className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">
                Pengurusan Logo Sekolah
              </h3>
              <p className="text-xs text-slate-400">
                Pilih muat naik fail imej tempatan atau ekstrak logo melalui pautan URL.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'upload'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            <span>Muat Naik Fail (Upload)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('url')}
            className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'url'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Link className="w-4 h-4" />
            <span>Ekstrak Melalui URL</span>
          </button>
        </div>

        {/* Tab 1: Upload */}
        {activeTab === 'upload' && (
          <div className="space-y-3">
            <label className="flex flex-col items-center justify-center p-6 bg-slate-950/70 hover:bg-slate-950 border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-2xl cursor-pointer transition text-center group">
              <div className="w-12 h-12 rounded-2xl bg-blue-600/10 text-blue-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                <UploadCloud className="w-6 h-6" />
              </div>
              <span className="text-xs font-extrabold text-white mb-1">
                Pilih atau Seret Fail Logo ke Sini
              </span>
              <span className="text-[11px] text-slate-400">
                Menyokong PNG, JPG, SVG, WebP (Dimampatkan automatik &lt; 150 KB)
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        )}

        {/* Tab 2: Extract URL */}
        {activeTab === 'url' && (
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-300">
              Pautan URL Logo atau Laman Web Sekolah
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://contoh.edu.my/logo.png atau laman sesawang sekolah"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleExtractFromUrl()}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
              />
              <button
                type="button"
                disabled={isExtracting || !urlInput.trim()}
                onClick={handleExtractFromUrl}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow"
              >
                {isExtracting ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>Ekstrak</span>
              </button>
            </div>
            <p className="text-[10px] text-slate-500">
              Enjin iSEPADU secara pintar mengekstrak imej terus atau tag <code>og:image</code>, lambang lencana, dan favicon daripada laman web.
            </p>
          </div>
        )}

        {/* Status Message */}
        {statusMessage && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                : statusMessage.type === 'error'
                ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                : 'bg-indigo-950/40 border-indigo-500/40 text-indigo-300'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : statusMessage.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            ) : (
              <Sparkles className="w-4 h-4 shrink-0 text-indigo-400" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Live Preview Box */}
        <div className="bg-slate-950/80 rounded-2xl border border-slate-800 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
              <span>Pralihat Logo Sekolah</span>
            </span>
            {previewLogo && (
              <button
                type="button"
                onClick={handleResetToDefault}
                className="text-[11px] font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Gunakan Logo Lalai</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Dark background preview */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col items-center justify-center text-center">
              <span className="text-[10px] text-slate-500 uppercase font-bold mb-2">Tema Gelap (Navigasi)</span>
              <div className="w-20 h-20 flex items-center justify-center p-1">
                <SchoolLogo src={previewLogo} schoolCode={activeCode} className="w-16 h-16" />
              </div>
            </div>

            {/* Light background preview */}
            <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center text-center">
              <span className="text-[10px] text-slate-500 uppercase font-bold mb-2">Tema Cerah (Cetak/Laporan)</span>
              <div className="w-20 h-20 flex items-center justify-center p-1">
                <SchoolLogo src={previewLogo} schoolCode={activeCode} className="w-16 h-16" />
              </div>
            </div>
          </div>

          {imageMeta && (
            <div className="text-[10px] font-mono text-slate-400 text-center">
              Dimensi: {imageMeta.width}x{imageMeta.height}px • Saiz Simpanan: {imageMeta.sizeKb} KB
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSaveLogo}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-blue-600/30"
          >
            {isSaving ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>Menyimpan...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Simpan Tetapan Logo</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SchoolLogoModal;
