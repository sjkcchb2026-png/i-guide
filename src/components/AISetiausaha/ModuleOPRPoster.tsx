import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Clock,
  Edit3,
  FileText,
  Image as ImageIcon,
  MapPin,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
  Download,
} from 'lucide-react';
import { auth } from '../../firebase';
import SchoolLogo from '../SchoolLogo';
import { MySGJawatankuasaItem } from '../../utils/mysgJawatankuasaCatalog';
import { resolveSKPMForMySGItem, SKPM_RADAR_BUCKETS, SKPMRadarBucket } from '../../utils/skpmCatalog';
import {
  triggerSmartPrint,
  downloadStandalonePrintHtml,
} from '../../utils/oprPrintHelper';
import { OPRPosterDocument } from './types';

interface ModuleOPRPosterProps {
  schoolCode: string;
  schoolName: string;
  schoolLogo?: string;
  academicYear: string;
  currentUserName: string;
  selectedItem: MySGJawatankuasaItem;
  savedDocs: OPRPosterDocument[];
  onSaveDoc: (doc: Partial<OPRPosterDocument> & { docKind: 'OPR' }) => Promise<OPRPosterDocument | null>;
  onDeleteDoc: (id: string) => Promise<void>;
}

function compressPosterPhoto(dataUrl: string, maxDim = 720, quality = 0.74): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w >= h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } else {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export const ModuleOPRPoster: React.FC<ModuleOPRPosterProps> = ({
  schoolCode,
  schoolName,
  schoolLogo,
  academicYear,
  currentUserName,
  selectedItem,
  savedDocs,
  onSaveDoc,
  onDeleteDoc,
}) => {
  const skpmMeta = useMemo(() => resolveSKPMForMySGItem(selectedItem), [selectedItem]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [radarFilter, setRadarFilter] = useState<'ALL' | SKPMRadarBucket>('ALL');

  // Auto-mapped SKPM & Program Fields
  const [skpmBucket, setSkpmBucket] = useState<SKPMRadarBucket>(skpmMeta.bucket);
  const [skpmStandard, setSkpmStandard] = useState(
    `${skpmMeta.standardCode}: ${skpmMeta.standardTitle}`
  );
  const [skpmAspek, setSkpmAspek] = useState(`${skpmMeta.aspekCode}: ${skpmMeta.aspekTitle}`);
  const [skpmStandardKualiti, setSkpmStandardKualiti] = useState(skpmMeta.standardKualitiStatement);

  const [programTitle, setProgramTitle] = useState('');
  const [tarikh, setTarikh] = useState(new Date().toISOString().slice(0, 10));
  const [masa, setMasa] = useState('08:00 pagi – 10:30 pagi');
  const [tempat, setTempat] = useState(`Dewan / Bilik Darjah ${schoolName}`);
  const [sasaran, setSasaran] = useState('Semua Murid & Guru Berkaitan');
  const [rawNotes, setRawNotes] = useState('');

  const [objektif, setObjektif] = useState<string[]>([
    'Meningkatkan penguasaan dan kemahiran murid mengikut ketetapan kurikulum / kokurikulum sekolah.',
    'Memupuk penglibatan aktif serta keyakinan diri peserta melalui aktiviti berstruktur.',
    'Menghasilkan dokumentasi evidens berkualiti ke arah pematuhan Skor 4 SKPM Kualiti@Sekolah.',
  ]);
  const [pengisianAktiviti, setPengisianAktiviti] = useState<string[]>([
    'Pendaftaran peserta dan taklimat pelaksanaan program oleh penyelaras.',
    'Pelaksanaan aktiviti utama secara berkumpulan dan bimbingan berfokus oleh guru.',
    'Sesi perkongsian hasil tugasan dan penilaian pencapaian murid.',
    'Rumusan program serta penyampaian pengiktirafan kepada peserta.',
  ]);
  const [impak, setImpak] = useState<string[]>([
    'Murid menunjukkan peningkatan minat, keyakinan dan kefahaman terhadap topik/kemahiran yang dilaksanakan.',
    'Kerjasama berpasukan dalam kalangan guru dan murid dapat diperkukuh secara holistik.',
    'Evidens pelaksanaan direkodkan dengan lengkap untuk penilaian SKPM.',
  ]);
  const [refleksiDanTindakanSusulan, setRefleksiDanTindakanSusulan] = useState<string[]>([
    'Kekuatan: Pengurusan masa dan penyelarasan tugas berjalan lancar mengikut jadual yang ditetapkan.',
    'Tindakan Susulan (Skor 4 SKPM): Mengadakan sesi pemantauan berfokus dan menambah baik bahan bimbingan bagi kumpulan sasaran seterusnya.',
  ]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [preparedByName, setPreparedByName] = useState(
    selectedItem.assignedTeacherName || currentUserName
  );
  const [preparedByTitle, setPreparedByTitle] = useState(selectedItem.jawatanRasmi);

  const [aiGenerating, setAiGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sync SKPM & Coordinator defaults whenever user picks a different committee in the 2-level selector (unless currently editing a saved doc)
  useEffect(() => {
    if (editingId) return;
    setSkpmBucket(skpmMeta.bucket);
    setSkpmStandard(`${skpmMeta.standardCode}: ${skpmMeta.standardTitle}`);
    setSkpmAspek(`${skpmMeta.aspekCode}: ${skpmMeta.aspekTitle}`);
    setSkpmStandardKualiti(skpmMeta.standardKualitiStatement);
    setPreparedByName((selectedItem.assignedTeacherName || currentUserName).toUpperCase());
    setPreparedByTitle(selectedItem.jawatanRasmi);
  }, [selectedItem, skpmMeta, currentUserName, editingId]);

  // Radar Evidens SKPM counts (supports dual-bucket Standard 3.2 + Standard 5 OPRs)
  const radarCounts = useMemo(() => {
    const counts: Record<SKPMRadarBucket, number> = {
      'Std 1': 0,
      'Std 2': 0,
      'Std 3.1': 0,
      'Std 3.2': 0,
      'Std 3.3': 0,
      'Std 4': 0,
      'Std 5': 0,
    };
    savedDocs.forEach((d) => {
      if (d.skpmBucket && counts[d.skpmBucket] !== undefined) {
        counts[d.skpmBucket] += 1;
      }
      if (
        d.secondarySkpmBucket &&
        d.secondarySkpmBucket !== d.skpmBucket &&
        counts[d.secondarySkpmBucket] !== undefined
      ) {
        counts[d.secondarySkpmBucket] += 1;
      }
    });
    return counts;
  }, [savedDocs]);

  const filteredSavedDocs = useMemo(() => {
    if (radarFilter === 'ALL') return savedDocs;
    return savedDocs.filter(
      (d) => d.skpmBucket === radarFilter || d.secondarySkpmBucket === radarFilter
    );
  }, [savedDocs, radarFilter]);

  const handlePhotoSlotUpload = (slotIdx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (reader.result) {
        const compressed = await compressPosterPhoto(String(reader.result));
        setPhotos((prev) => {
          const next = [...prev];
          next[slotIdx] = compressed;
          return next.slice(0, 3);
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateAIDraft = async () => {
    if (!programTitle.trim() && !rawNotes.trim()) {
      setBanner({
        type: 'error',
        text: 'Sila masukkan Tajuk Program atau Catatan Kata Kunci (BM / 中文) terlebih dahulu.',
      });
      return;
    }
    setAiGenerating(true);
    setBanner(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/ai/setiausaha', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken || ''}`,
        },
        body: JSON.stringify({
          action: 'OPR_DRAFT',
          payload: {
            notes: rawNotes,
            programTitle: programTitle || `Program ${selectedItem.jawatanRasmi}`,
            committeeName: `${selectedItem.jawatankuasaInduk} (${selectedItem.jawatanRasmi})`,
            pillar: selectedItem.pillar,
            skpmStandard,
            skpmAspek,
            skpmStandardKualiti,
            sasaran,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menjana draf AI');
      const d = data.draft || {};
      if (Array.isArray(d.objektif) && d.objektif.length > 0) setObjektif(d.objektif);
      if (Array.isArray(d.pengisianAktiviti) && d.pengisianAktiviti.length > 0)
        setPengisianAktiviti(d.pengisianAktiviti);
      if (Array.isArray(d.impak) && d.impak.length > 0) setImpak(d.impak);
      if (Array.isArray(d.refleksiDanTindakanSusulan) && d.refleksiDanTindakanSusulan.length > 0)
        setRefleksiDanTindakanSusulan(d.refleksiDanTindakanSusulan);

      setBanner({
        type: 'success',
        text:
          data.source === 'gemini'
            ? 'Draf OPR Pintar berjaya dijana oleh Gemini AI mengikut rubrik Skor 4 SKPM.'
            : 'Draf OPR berstruktur SKPM berjaya dijana untuk semakan anda.',
      });
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Gagal menjana draf OPR.' });
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSavePoster = async () => {
    if (!programTitle.trim()) {
      setBanner({ type: 'error', text: 'Sila isi Tajuk Program sebelum menyimpan OPR.' });
      return;
    }
    setSaving(true);
    setBanner(null);
    const saved = await onSaveDoc({
      id: editingId || undefined,
      docKind: 'OPR',
      academicYear,
      pillar: selectedItem.pillar,
      kodMySG: selectedItem.kodMySG,
      jawatankuasaInduk: selectedItem.jawatankuasaInduk,
      jawatanRasmi: selectedItem.jawatanRasmi,
      skpmBucket,
      skpmStandard,
      skpmAspek,
      skpmStandardKualiti,
      programTitle: programTitle.trim().toUpperCase(),
      tarikh,
      masa,
      tempat,
      sasaran,
      rawNotes,
      objektif: objektif.filter((s) => s.trim()),
      pengisianAktiviti: pengisianAktiviti.filter((s) => s.trim()),
      impak: impak.filter((s) => s.trim()),
      refleksiDanTindakanSusulan: refleksiDanTindakanSusulan.filter((s) => s.trim()),
      photos: photos.filter(Boolean),
      preparedByName: preparedByName.trim().toUpperCase(),
      preparedByTitle: preparedByTitle.trim(),
    });
    setSaving(false);
    if (saved) {
      setEditingId(saved.id);
      setBanner({ type: 'success', text: `Poster OPR "${saved.programTitle}" telah disimpan ke arkib sekolah.` });
    }
  };

  const handleLoadDoc = (doc: OPRPosterDocument) => {
    setEditingId(doc.id);
    setSkpmBucket(doc.skpmBucket || 'Std 3.1');
    setSkpmStandard(doc.skpmStandard);
    setSkpmAspek(doc.skpmAspek);
    setSkpmStandardKualiti(doc.skpmStandardKualiti);
    setProgramTitle(doc.programTitle);
    setTarikh(doc.tarikh);
    setMasa(doc.masa);
    setTempat(doc.tempat);
    setSasaran(doc.sasaran);
    setRawNotes(doc.rawNotes || '');
    setObjektif(doc.objektif?.length ? doc.objektif : ['']);
    setPengisianAktiviti(doc.pengisianAktiviti?.length ? doc.pengisianAktiviti : ['']);
    setImpak(doc.impak?.length ? doc.impak : ['']);
    setRefleksiDanTindakanSusulan(
      doc.refleksiDanTindakanSusulan?.length ? doc.refleksiDanTindakanSusulan : ['']
    );
    setPhotos(doc.photos || []);
    setPreparedByName(doc.preparedByName);
    setPreparedByTitle(doc.preparedByTitle);
    setBanner({ type: 'success', text: `Rekod "${doc.programTitle}" dimuatkan untuk semakan / cetakan.` });
  };

  const handleResetNew = () => {
    setEditingId(null);
    setProgramTitle('');
    setRawNotes('');
    setPhotos([]);
    setSkpmBucket(skpmMeta.bucket);
    setSkpmStandard(`${skpmMeta.standardCode}: ${skpmMeta.standardTitle}`);
    setSkpmAspek(`${skpmMeta.aspekCode}: ${skpmMeta.aspekTitle}`);
    setSkpmStandardKualiti(skpmMeta.standardKualitiStatement);
    setPreparedByName((selectedItem.assignedTeacherName || currentUserName).toUpperCase());
    setPreparedByTitle(selectedItem.jawatanRasmi);
  };

  const yearShort = (academicYear || '2026').slice(0, 4);

  return (
    <div className="space-y-6">
      {/* RADAR EVIDENS SKPM COUNTER */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-400">
              Radar Evidens SKPM Kualiti@Sekolah ({savedDocs.length} Laporan Disimpan)
            </h3>
            <p className="text-[11px] text-slate-400">
              Klik Standard di bawah untuk menapis arkib OPR bagi audit PGB / PK.
            </p>
          </div>
          {editingId && (
            <button
              type="button"
              onClick={handleResetNew}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 flex items-center gap-1.5 self-start cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Cipta Poster OPR Baharu
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setRadarFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
              radarFilter === 'ALL'
                ? 'bg-teal-600 border-teal-500 text-white'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            Semua ({savedDocs.length})
          </button>
          {SKPM_RADAR_BUCKETS.map((b) => (
            <button
              key={b.bucket}
              type="button"
              onClick={() => setRadarFilter(b.bucket)}
              title={b.fullLabel}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                radarFilter === b.bucket
                  ? 'bg-teal-600 border-teal-500 text-white'
                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              {b.shortLabel} ({radarCounts[b.bucket]})
            </button>
          ))}
        </div>
      </div>

      {/* MAIN SPLIT WORKSPACE: EDITOR (LEFT) + A4 POSTER PREVIEW (RIGHT) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start print:block">
        {/* LEFT PANEL: BILINGUAL INPUT + AI DRAFTER + FIELDS (HIDDEN ON PRINT) */}
        <div className="xl:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5 print:hidden">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h4 className="text-sm font-black uppercase text-white">Editor OPR Pintar SKPM</h4>
              <p className="text-[11px] text-slate-400">
                Pemetaan automatik: <strong className="text-teal-300">{selectedItem.kodMySG}</strong> →{' '}
                <strong className="text-amber-300">{skpmBucket}</strong>
              </p>
            </div>
            <button
              type="button"
              onClick={handleSavePoster}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase cursor-pointer disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>{saving ? 'Menyimpan...' : 'Simpan OPR'}</span>
            </button>
          </div>

          {banner && (
            <div
              className={`p-3 rounded-xl text-xs font-bold border ${
                banner.type === 'success'
                  ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300'
                  : 'bg-rose-950/60 border-rose-700 text-rose-300'
              }`}
            >
              {banner.text}
            </div>
          )}

          {/* Program Title & Metadata */}
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-black uppercase text-slate-300 block mb-1">
                Tajuk Program / Aktiviti (Huruf Besar pada Poster):
              </label>
              <input
                type="text"
                value={programTitle}
                onChange={(e) => setProgramTitle(e.target.value)}
                placeholder="cth: BENGKEL PEMANTAPAN LITERASI TAHUN 1 (PitS) FASA 1"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-teal-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">Tarikh:</label>
                <input
                  type="date"
                  value={tarikh}
                  onChange={(e) => setTarikh(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">Masa:</label>
                <input
                  type="text"
                  value={masa}
                  onChange={(e) => setMasa(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">Tempat:</label>
                <input
                  type="text"
                  value={tempat}
                  onChange={(e) => setTempat(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">Sasaran:</label>
                <input
                  type="text"
                  value={sasaran}
                  onChange={(e) => setSasaran(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>
            </div>
          </div>

          {/* Bilingual AI Auto-Drafting Box */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-teal-700/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-teal-300 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" />
                Catatan Ringkas (中文 / BM Kata Kunci)
              </span>
              <span className="text-[10px] font-bold text-slate-400">Auto -&gt; BM Rasmi Skor 4 SKPM</span>
            </div>
            <textarea
              rows={3}
              value={rawNotes}
              onChange={(e) => setRawNotes(e.target.value)}
              placeholder="Contoh: 一年级学生参与华文识字闯关游戏，提升阅读兴趣，老师分组指导，下次需要提前准备更多图卡。"
              className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 outline-none focus:border-teal-500"
            />
            <button
              type="button"
              onClick={handleGenerateAIDraft}
              disabled={aiGenerating}
              className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
            >
              {aiGenerating ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 text-amber-300" />
              )}
              <span>
                {aiGenerating
                  ? 'Sedang Menjana Draf SKPM...'
                  : 'Jana Draf OPR Pintar (Skor 4 SKPM)'}
              </span>
            </button>
          </div>

          {/* Editable Structured Points */}
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-black uppercase text-teal-300 block mb-1">
                1. Objektif (1 baris = 1 poin bernombor):
              </label>
              <textarea
                rows={3}
                value={objektif.join('\n')}
                onChange={(e) => setObjektif(e.target.value.split('\n'))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-black uppercase text-teal-300 block mb-1">
                2. Pengisian Aktiviti (1 baris = 1 poin):
              </label>
              <textarea
                rows={4}
                value={pengisianAktiviti.join('\n')}
                onChange={(e) => setPengisianAktiviti(e.target.value.split('\n'))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-black uppercase text-teal-300 block mb-1">
                3. Impak (1 baris = 1 poin):
              </label>
              <textarea
                rows={3}
                value={impak.join('\n')}
                onChange={(e) => setImpak(e.target.value.split('\n'))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-black uppercase text-teal-300 block mb-1">
                4. Refleksi &amp; Tindakan Susulan (Skor 4 SKPM):
              </label>
              <textarea
                rows={3}
                value={refleksiDanTindakanSusulan.join('\n')}
                onChange={(e) => setRefleksiDanTindakanSusulan(e.target.value.split('\n'))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 outline-none"
              />
            </div>
          </div>

          {/* 3 Circular Photos Upload */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <label className="text-[11px] font-black uppercase text-slate-300 flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-teal-400" />
              3 Gambar Aktiviti (Bingkai Bulat Poster):
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((slotIdx) => {
                const imgSrc = photos[slotIdx];
                return (
                  <div
                    key={slotIdx}
                    className="relative aspect-square rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center overflow-hidden group"
                  >
                    {imgSrc ? (
                      <>
                        <img src={imgSrc} alt={`Foto ${slotIdx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() =>
                            setPhotos((prev) => prev.filter((_, idx) => idx !== slotIdx))
                          }
                          className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-black/75 text-white hover:bg-rose-600 transition"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer text-slate-500 hover:text-teal-300 p-2 text-center">
                        <Upload className="w-4 h-4 mb-1" />
                        <span className="text-[10px] font-bold">Foto {slotIdx + 1}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handlePhotoSlotUpload(slotIdx, e)}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Prepared By & SKPM Override */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
            <div>
              <label className="text-[11px] font-bold text-slate-400 block mb-1">Disediakan Oleh (Nama):</label>
              <input
                type="text"
                value={preparedByName}
                onChange={(e) => setPreparedByName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-400 block mb-1">Jawatan Rasmi MySG:</label>
              <input
                type="text"
                value={preparedByTitle}
                onChange={(e) => setPreparedByTitle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
              />
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: EXACT VISUAL A4 POSTER PREVIEW */}
        <div className="xl:col-span-7 space-y-3 print:w-full">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-2.5 print:hidden">
            <span className="text-xs font-bold text-slate-300">
              Pratonton Poster A4 Potret (SKPM Kualiti@Sekolah)
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const res = downloadStandalonePrintHtml({
                    elementId: 'opr-a4-print-sheet',
                    title: programTitle.trim() || `OPR_${selectedItem.jawatanRasmi}`,
                    orientation: 'portrait',
                  });
                  setBanner({
                    type: res.mode === 'error' ? 'error' : 'success',
                    text: res.message,
                  });
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-700/60 text-xs font-bold cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Muat Turun (.html)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const res = triggerSmartPrint({
                    elementId: 'opr-a4-print-sheet',
                    title: programTitle.trim() || `OPR_${selectedItem.jawatanRasmi}`,
                    orientation: 'portrait',
                  });
                  if (res.mode !== 'native') {
                    setBanner({
                      type: res.mode === 'error' ? 'error' : 'success',
                      text: res.message,
                    });
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak / Eksport PDF (A4)</span>
              </button>
            </div>
          </div>

          {/* ACTUAL PRINTABLE A4 PORTRAIT POSTER SHEET */}
          <div
            id="opr-a4-print-sheet"
            className="print-portrait-sheet bg-white text-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 max-w-[794px] mx-auto flex flex-col print:overflow-visible"
          >
            {/* 1. TOP DARK TEAL BANNER (#0D3B42) WITH GOLD BOTTOM BORDER */}
            <div className="bg-[#0D3B42] text-white px-6 py-4 border-b-4 border-[#D4AF37] print-color-exact">
              <div className="flex items-center justify-between gap-4 border-b border-teal-700/70 pb-2 mb-2">
                <span className="text-[11px] font-black uppercase tracking-widest text-[#FDE047]">
                  SKPM KUALITI@SEKOLAH {yearShort}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-100">
                  {selectedItem.kodMySG} · {selectedItem.pillar}
                </span>
              </div>
              <div className="space-y-0.5">
                <div className="text-xs font-black uppercase tracking-wide text-white">
                  {skpmStandard}
                </div>
                <div className="text-[11px] font-extrabold uppercase tracking-wide text-teal-100">
                  {skpmAspek}
                </div>
                <p className="text-[11px] italic text-[#FDE047] leading-snug pt-0.5">
                  Standard Kualiti: {skpmStandardKualiti}
                </p>
              </div>
            </div>

            {/* 2. SCHOOL CREST + SCHOOL NAME + GIANT ONE PAGE REPORT HEADER */}
            <div className="px-6 pt-4 pb-3 border-b-2 border-slate-200 bg-slate-50/70">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <SchoolLogo
                    src={schoolLogo}
                    schoolCode={schoolCode}
                    className="w-14 h-14 bg-white border-slate-300"
                  />
                  <div>
                    <div className="text-sm font-black uppercase tracking-wide text-[#0D3B42]">
                      {schoolName}
                    </div>
                    <div className="text-[10px] font-bold uppercase text-slate-500">
                      Kod Sekolah: {schoolCode} · {selectedItem.jawatankuasaInduk}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black tracking-tight text-[#0D3B42] leading-none">
                    ONE PAGE REPORT
                  </div>
                  <div className="text-[10px] font-extrabold uppercase tracking-widest text-[#B48A18] mt-1">
                    EVIDENS PENGURUSAN BERKUALITI
                  </div>
                </div>
              </div>

              <div className="mt-3 py-2 px-4 rounded-xl bg-[#0D3B42]/5 border border-[#0D3B42]/20 text-center">
                <h2 className="text-sm font-black uppercase tracking-wide text-[#0D3B42]">
                  {programTitle.trim() || `LAPORAN PROGRAM ${selectedItem.jawatanRasmi.toUpperCase()}`}
                </h2>
              </div>
            </div>

            {/* 3. POSTER BODY: LEFT 3 CIRCULAR PHOTOS + RIGHT STRUCTURED CONTENT */}
            <div className="p-6 grid grid-cols-12 gap-5 flex-1 items-start">
              {/* LEFT COLUMN (4 cols): 3 CIRCULAR PHOTO FRAMES */}
              <div className="col-span-4 flex flex-col items-center justify-between gap-4">
                {[0, 1, 2].map((idx) => {
                  const src = photos[idx];
                  return (
                    <div key={idx} className="flex flex-col items-center gap-1">
                      <div className="w-36 h-36 rounded-full border-4 border-[#0D3B42] ring-2 ring-[#D4AF37] overflow-hidden bg-slate-100 flex items-center justify-center shadow-md print-color-exact">
                        {src ? (
                          <img
                            src={src}
                            alt={`Dokumentasi ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="text-center px-3 text-slate-400">
                            <ImageIcon className="w-6 h-6 mx-auto mb-1 opacity-40" />
                            <span className="text-[10px] font-bold block">Gambar {idx + 1}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* RIGHT COLUMN (8 cols): 4 SECTIONS + METADATA + PREPARED BY PILL */}
              <div className="col-span-8 space-y-3.5 text-[11px] leading-relaxed">
                {/* Objektif */}
                <div>
                  <h4 className="text-xs font-black uppercase text-[#0D3B42] border-b border-[#D4AF37] pb-0.5 mb-1">
                    Objektif:
                  </h4>
                  <ol className="list-decimal pl-4 space-y-0.5 text-slate-800 font-medium">
                    {objektif.filter((s) => s.trim()).map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ol>
                </div>

                {/* Pengisian Aktiviti */}
                <div>
                  <h4 className="text-xs font-black uppercase text-[#0D3B42] border-b border-[#D4AF37] pb-0.5 mb-1">
                    Pengisian Aktiviti:
                  </h4>
                  <ul className="list-disc pl-4 space-y-0.5 text-slate-800 font-medium">
                    {pengisianAktiviti.filter((s) => s.trim()).map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>

                {/* Impak */}
                <div>
                  <h4 className="text-xs font-black uppercase text-[#0D3B42] border-b border-[#D4AF37] pb-0.5 mb-1">
                    Impak:
                  </h4>
                  <ul className="list-disc pl-4 space-y-0.5 text-slate-800 font-medium">
                    {impak.filter((s) => s.trim()).map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>

                {/* Refleksi & Tindakan Susulan */}
                <div>
                  <h4 className="text-xs font-black uppercase text-[#0D3B42] border-b border-[#D4AF37] pb-0.5 mb-1">
                    Refleksi dan Tindakan Susulan:
                  </h4>
                  <ul className="list-disc pl-4 space-y-0.5 text-slate-800 font-medium">
                    {refleksiDanTindakanSusulan.filter((s) => s.trim()).map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>

                {/* Metadata Grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-[10px]">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#0D3B42] shrink-0" />
                    <span>
                      <strong>Tarikh:</strong> {tarikh}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#0D3B42] shrink-0" />
                    <span>
                      <strong>Masa:</strong> {masa}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#0D3B42] shrink-0" />
                    <span>
                      <strong>Tempat:</strong> {tempat}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-[#0D3B42] shrink-0" />
                    <span>
                      <strong>Sasaran:</strong> {sasaran}
                    </span>
                  </div>
                </div>

                {/* Bottom Teal Pill: Disediakan oleh */}
                <div className="pt-1 flex justify-end">
                  <div className="inline-block px-4 py-1.5 rounded-full bg-[#0D3B42] text-white text-[10px] font-bold border border-[#D4AF37] print-color-exact">
                    Disediakan oleh:{' '}
                    <span className="font-black text-[#FDE047]">{preparedByName}</span> ({preparedByTitle})
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SAVED OPR ARCHIVE LIST */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 print:hidden">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-black uppercase text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-teal-400" />
            Arkib Poster OPR SKPM ({filteredSavedDocs.length})
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSavedDocs.map((doc) => (
            <div
              key={doc.id}
              className="bg-slate-950 border border-slate-800 hover:border-teal-600/60 rounded-2xl p-4 flex flex-col justify-between gap-3"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[10px] font-bold">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="px-1.5 py-0.5 rounded bg-teal-950/90 text-teal-300 border border-teal-800/60">
                      {doc.skpmCodeBadge || doc.skpmBucket}
                    </span>
                    {doc.secondarySkpmBucket && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-950/90 text-amber-300 border border-amber-800/60">
                        + {doc.secondarySkpmBucket}
                      </span>
                    )}
                    {doc.sourceModule === 'KOKURIKULUM_OPR' && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-950/90 text-emerald-300 border border-emerald-800/60">
                        Koko OPR
                      </span>
                    )}
                    {doc.sourceModule === 'KOKURIKULUM_MEETING' && (
                      <span className="px-1.5 py-0.5 rounded bg-indigo-950/90 text-indigo-300 border border-indigo-800/60">
                        Perjumpaan
                      </span>
                    )}
                  </div>
                  <span className="text-slate-400 font-mono shrink-0">{doc.tarikh}</span>
                </div>
                <h5 className="text-xs font-black text-white uppercase line-clamp-2">
                  {doc.programTitle}
                </h5>
                <p className="text-[11px] text-slate-400 truncate">
                  {doc.jawatankuasaInduk} · {doc.preparedByName}
                </p>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                <button
                  type="button"
                  onClick={() => handleLoadDoc(doc)}
                  className="text-teal-400 hover:text-teal-300 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Buka / Cetak
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteDoc(doc.id)}
                  className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                  title="Padam"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
          {filteredSavedDocs.length === 0 && (
            <div className="col-span-full py-8 text-center text-xs text-slate-500 italic">
              Tiada poster OPR SKPM ditemui bagi penapis Standard ini.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
