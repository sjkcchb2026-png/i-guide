import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { UserProfile, SchoolSettings } from '../../types';
import { useSchoolTenant } from '../../contexts/SchoolTenantContext';
import { belongsToSchool, scopedDocId } from '../../utils/schoolTenant';
import { 
  FileText, 
  Plus, 
  Printer, 
  Trash2, 
  Edit3, 
  Save, 
  X, 
  Image as ImageIcon, 
  Search, 
  ArrowLeft
} from 'lucide-react';

export type AcademicOPRType = 'AKTIVITI' | 'PLC';

export interface AcademicOPRRecord {
  id: string;
  schoolCode?: string;
  reportType: AcademicOPRType; // 'AKTIVITI' | 'PLC'
  plcTool?: string; // e.g. "Lesson Study", "Teacher Sharing Sessions", etc.
  bidang: string; // e.g. "Prasekolah (Pengurusan)" or "Panitia Sains"
  programName: string;
  tarikh: string; // YYYY-MM-DD
  hari: string; // e.g. "Sabtu", "Isnin"
  sasaran: string;
  penyelaras: string;
  objektif: string; // Multiline (stored as bulleted or newline text)
  agenda: string;
  kekuatan: string;
  kelemahan: string;
  tindakanSusulan: string;
  photos: string[]; // Base64 data URLs (up to 4 photos)
  createdBy: string;
  creatorName: string;
  createdAt: any;
  updatedAt: any;
}

// 教育部官方 PLC 10 大工具 (BPG / KPM PLC Toolkit)
export const PLC_TOOLS = [
  { id: 'LESSON_STUDY', label: 'Lesson Study (Kitaran Pengajaran Kolaboratif)' },
  { id: 'TEACHER_SHARING', label: 'Teacher Sharing Sessions (Sesi Perkongsian Guru)' },
  { id: 'LEARNING_WALKS', label: 'Learning Walks (Jelajah Pembelajaran)' },
  { id: 'PEER_COACHING', label: 'Peer Coaching (Bimbingan Rakan Sekerja)' },
  { id: 'VIDEO_ANALYSIS', label: 'Video Analysis of Teaching (Analisis Video PdP)' },
  { id: 'DATA_ANALYSIS', label: 'Data Analysis (Analisis Data PBD/UASA)' },
  { id: 'BOOK_CLUBS', label: 'Book Clubs (Kelab Buku Ilmiah/Pedagogi)' },
  { id: 'ACTION_RESEARCH', label: 'Action Research (Kajian Tindakan)' },
  { id: 'STUDENT_WORK', label: 'Student Work Analysis (Analisis Hasil Kerja Murid)' },
  { id: 'CURRICULUM_MAPPING', label: 'Curriculum Mapping (Pemetaan Kurikulum)' },
];

interface Props {
  currentUser: UserProfile;
  schoolSettings?: SchoolSettings | null;
}

// Helper to compress images so Base64 safely fits Firestore doc limit
function compressImage(dataUrl: string, maxWidth = 800, quality = 0.7): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } else {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export const AcademicOPRManager: React.FC<Props> = ({ currentUser, schoolSettings }) => {
  const { schoolCode: activeSchoolCode, schoolName: tenantSchoolName } = useSchoolTenant();
  const [records, setRecords] = useState<AcademicOPRRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterType, setFilterType] = useState<'ALL' | AcademicOPRType>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 模式: 'list' (列表) | 'form' (填写/编辑) | 'print' (单页打印预览)
  const [viewMode, setViewMode] = useState<'list' | 'form' | 'print'>('list');
  const [selectedRecord, setSelectedRecord] = useState<AcademicOPRRecord | null>(null);

  // 表单状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reportType, setReportType] = useState<AcademicOPRType>('AKTIVITI');
  const [plcTool, setPlcTool] = useState<string>(PLC_TOOLS[0].label);
  const [bidang, setBidang] = useState<string>('Kurikulum');
  const [programName, setProgramName] = useState<string>('');
  const [tarikh, setTarikh] = useState<string>(new Date().toISOString().slice(0, 10));
  const [hari, setHari] = useState<string>('Isnin');
  const [sasaran, setSasaran] = useState<string>('');
  const [penyelaras, setPenyelaras] = useState<string>(`${currentUser.name} / Guru Akademik`);
  const [objektif, setObjektif] = useState<string>('• Mewujudkan suasana pembelajaran bermakna.\n• Menggalakkan penglibatan aktif murid.');
  const [agenda, setAgenda] = useState<string>('• Guru memberi penerangan aktiviti.\n• Aktiviti dijalankan mengikut kumpulan.\n• Sesi refleksi dan kesimpulan.');
  const [kekuatan, setKekuatan] = useState<string>('• Semua peserta memberi kerjasama yang cemerlang sepanjang aktiviti.');
  const [kelemahan, setKelemahan] = useState<string>('• Kekangan masa yang terhad untuk perbincangan mendalam.');
  const [tindakanSusulan, setTindakanSusulan] = useState<string>('• Sesi susulan fasa seterusnya akan diadakan pada bulan hadapan.');
  const [photos, setPhotos] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // 1. 读取 Firestore 中的学术 OPR 记录
  const fetchRecords = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'academic_opr_reports'), orderBy('tarikh', 'desc'));
      const snap = await getDocs(q);
      const list: AcademicOPRRecord[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (belongsToSchool(data, activeSchoolCode)) {
          list.push({ id: d.id, ...data } as AcademicOPRRecord);
        }
      });
      setRecords(list);
    } catch (err) {
      console.error('Failed to load Academic OPR:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user && isMounted) {
        fetchRecords();
      } else if (!user && isMounted) {
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, [activeSchoolCode]);

  // 打开新建表单
  const handleOpenCreate = (type: AcademicOPRType) => {
    setEditingId(null);
    setReportType(type);
    setPlcTool(PLC_TOOLS[0].label);
    setBidang(type === 'PLC' ? 'Kurikulum / PLC' : 'Kurikulum');
    setProgramName('');
    setTarikh(new Date().toISOString().slice(0, 10));
    setHari('Isnin');
    setSasaran('');
    setPenyelaras(`${currentUser.name} / Guru Akademik`);
    setObjektif('');
    setAgenda('');
    setKekuatan('');
    setKelemahan('');
    setTindakanSusulan('');
    setPhotos([]);
    setViewMode('form');
  };

  // 打开编辑表单
  const handleOpenEdit = (rec: AcademicOPRRecord) => {
    setEditingId(rec.id);
    setReportType(rec.reportType);
    setPlcTool(rec.plcTool || PLC_TOOLS[0].label);
    setBidang(rec.bidang);
    setProgramName(rec.programName);
    setTarikh(rec.tarikh);
    setHari(rec.hari);
    setSasaran(rec.sasaran);
    setPenyelaras(rec.penyelaras);
    setObjektif(rec.objektif);
    setAgenda(rec.agenda);
    setKekuatan(rec.kekuatan);
    setKelemahan(rec.kelemahan);
    setTindakanSusulan(rec.tindakanSusulan);
    setPhotos(rec.photos || []);
    setViewMode('form');
  };

  // 照片上传处理 (压缩并转为 Base64，最多4张)
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (photos.length + files.length > 4) {
      alert('Maksimum 4 keping gambar sahaja dibenarkan.');
      return;
    }

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        if (event.target?.result) {
          const rawUrl = String(event.target?.result);
          const compressed = await compressImage(rawUrl);
          setPhotos((prev) => [...prev, compressed].slice(0, 4));
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // 保存记录
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!programName.trim()) {
      alert('Sila isikan Nama Program / Tajuk PLC.');
      return;
    }

    try {
      setIsSaving(true);
      const docId = editingId || scopedDocId(activeSchoolCode, `opr_${Date.now()}`);
      const payload: AcademicOPRRecord = {
        id: docId,
        schoolCode: activeSchoolCode,
        reportType,
        plcTool: reportType === 'PLC' ? plcTool : undefined,
        bidang: bidang.trim(),
        programName: programName.trim(),
        tarikh,
        hari,
        sasaran: sasaran.trim(),
        penyelaras: penyelaras.trim(),
        objektif: objektif.trim(),
        agenda: agenda.trim(),
        kekuatan: kekuatan.trim(),
        kelemahan: kelemahan.trim(),
        tindakanSusulan: tindakanSusulan.trim(),
        photos,
        createdBy: currentUser.uid,
        creatorName: currentUser.name,
        createdAt: editingId ? undefined : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'academic_opr_reports', docId), payload, { merge: true });
      await fetchRecords();
      setViewMode('list');
    } catch (err: any) {
      console.error('Error saving OPR:', err);
      alert(`Gagal menyimpan rekod: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // 删除记录
  const handleDelete = async (id: string) => {
    if (!confirm('Adakah anda pasti ingin memadamkan laporan OPR ini?')) return;
    try {
      await deleteDoc(doc(db, 'academic_opr_reports', id));
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      alert(`Gagal memadam: ${err.message}`);
    }
  };

  // 过滤记录
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const matchType = filterType === 'ALL' || r.reportType === filterType;
      const matchQuery =
        r.programName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.bidang.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.plcTool && r.plcTool.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchType && matchQuery;
    });
  }, [records, filterType, searchQuery]);

  return (
    <div className="space-y-6">
      
      {/* ================= 1. LIST VIEW (DASHBOARD) ================= */}
      {viewMode === 'list' && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Akademik & Kurikulum
                </span>
                <span className="text-xs text-slate-400">One Page Reporting (OPR) KPM Standard</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white mt-1 flex items-center gap-2">
                Laporan Ringkas OPR (Aktiviti & PLC)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Perekodan laporan satu muka surat bagi Aktiviti Panitia/Prasekolah dan Komuniti Pembelajaran Profesional (PLC).
              </p>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                onClick={() => handleOpenCreate('AKTIVITI')}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-blue-600/30 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ OPR Aktiviti</span>
              </button>
              <button
                onClick={() => handleOpenCreate('PLC')}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-indigo-600/30 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ OPR PLC</span>
              </button>
            </div>
          </div>

          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 rounded-2xl p-3">
            <div className="flex items-center space-x-1.5">
              <button
                onClick={() => setFilterType('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  filterType === 'ALL' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Semua ({records.length})
              </button>
              <button
                onClick={() => setFilterType('AKTIVITI')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  filterType === 'AKTIVITI' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-blue-300'
                }`}
              >
                Aktiviti ({records.filter((r) => r.reportType === 'AKTIVITI').length})
              </button>
              <button
                onClick={() => setFilterType('PLC')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  filterType === 'PLC' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-indigo-300'
                }`}
              >
                PLC ({records.filter((r) => r.reportType === 'PLC').length})
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Cari program / bidang..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Records Table / Grid */}
          {loading ? (
            <div className="py-20 text-center text-slate-400 text-xs animate-pulse">
              Memuatkan rekod OPR...
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-slate-500 text-xs space-y-2">
              <FileText className="w-8 h-8 mx-auto text-slate-600" />
              <p>Tiada rekod laporan OPR ditemui.</p>
              <p className="text-[11px] text-slate-600">Sila klik butang di atas untuk memulakan laporan baharu.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRecords.map((item) => (
                <div
                  key={item.id}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-3xl p-5 shadow-lg flex flex-col justify-between transition-all group"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          item.reportType === 'PLC'
                            ? 'bg-indigo-950 text-indigo-300 border border-indigo-700/60'
                            : 'bg-blue-950 text-blue-300 border border-blue-700/60'
                        }`}
                      >
                        {item.reportType}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {item.tarikh} ({item.hari})
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">
                        {item.bidang}
                      </span>
                      <h4 className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors line-clamp-2 mt-0.5">
                        {item.programName}
                      </h4>
                      {item.reportType === 'PLC' && item.plcTool && (
                        <p className="text-[11px] text-indigo-400 mt-1 italic font-medium">
                          Alat: {item.plcTool}
                        </p>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-400 line-clamp-2">
                      <strong className="text-slate-300">Objektif:</strong> {item.objektif}
                    </div>

                    {item.photos && item.photos.length > 0 && (
                      <div className="flex items-center gap-1.5 pt-1">
                        <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-[10px] text-slate-400 font-mono">
                          {item.photos.length} keping gambar dilampirkan
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    <button
                      onClick={() => {
                        setSelectedRecord(item);
                        setViewMode('print');
                      }}
                      className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-bold transition cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Cetak OPR</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenEdit(item)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                        title="Edit Laporan"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                        title="Padam Laporan"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= 2. FORM VIEW (ENTRY / EDIT) ================= */}
      {viewMode === 'form' && (
        <form onSubmit={handleSave} className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h3 className="text-lg font-black text-white">
                  {editingId ? 'Kemaskini Laporan OPR' : 'Pemasukan Laporan OPR Baharu'}
                </h3>
                <span className="text-xs text-slate-400">
                  Jenis: <strong className="text-blue-400">{reportType}</strong>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-blue-600/30"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Menyimpan...' : 'Simpan Laporan'}</span>
              </button>
            </div>
          </div>

          {/* Form Fields Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6 text-xs text-slate-200">
            
            {/* 1. Report Type Switcher & PLC Tool */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-slate-800">
              <div>
                <label className="block text-slate-400 font-bold mb-1.5">Kategori OPR</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setReportType('AKTIVITI');
                      setBidang('Kurikulum');
                    }}
                    className={`py-2 rounded-xl font-bold border transition ${
                      reportType === 'AKTIVITI'
                        ? 'bg-blue-600 text-white border-blue-500 shadow-md'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    Aktiviti Akademik / Panitia
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReportType('PLC');
                      setBidang('Kurikulum / PLC');
                    }}
                    className={`py-2 rounded-xl font-bold border transition ${
                      reportType === 'PLC'
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    PLC (Komuniti Pembelajaran)
                  </button>
                </div>
              </div>

              {reportType === 'PLC' && (
                <div>
                  <label className="block text-indigo-300 font-bold mb-1.5">
                    Alat Kolaboratif PLC (KPM Toolkit)
                  </label>
                  <select
                    value={plcTool}
                    onChange={(e) => setPlcTool(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-indigo-700/60 text-white outline-none focus:border-indigo-500 font-medium"
                  >
                    {PLC_TOOLS.map((tool) => (
                      <option key={tool.id} value={tool.label}>
                        {tool.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* 2. Top Metarows matching physical sheet */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-slate-400 font-bold mb-1.5">
                  BIDANG (cth: Prasekolah / Panitia Sains)
                </label>
                <input
                  type="text"
                  value={bidang}
                  onChange={(e) => setBidang(e.target.value)}
                  placeholder="cth: Prasekolah (Pengurusan) atau Panitia Bahasa Cina"
                  className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-blue-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-slate-400 font-bold mb-1.5">
                  PROGRAM / AKTIVITI (Nama Penuh Program)
                </label>
                <input
                  type="text"
                  value={programName}
                  onChange={(e) => setProgramName(e.target.value)}
                  placeholder="cth: Gotong-royong Prasekolah SJK Ek Hua Bil.1/2026"
                  className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-blue-500 font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1.5">TARIKH</label>
                <input
                  type="date"
                  value={tarikh}
                  onChange={(e) => setTarikh(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1.5">HARI</label>
                <select
                  value={hari}
                  onChange={(e) => setHari(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-blue-500"
                >
                  {['Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu', 'Ahad'].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1.5">
                  PENYELARAS PROGRAM (Nama & Jawatan)
                </label>
                <input
                  type="text"
                  value={penyelaras}
                  onChange={(e) => setPenyelaras(e.target.value)}
                  placeholder="cth: Kong Lin Bing / Guru Akademik Biasa"
                  className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-blue-500"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-slate-400 font-bold mb-1.5">
                  SASARAN (Sasaran Peserta & Bilangan)
                </label>
                <input
                  type="text"
                  value={sasaran}
                  onChange={(e) => setSasaran(e.target.value)}
                  placeholder="cth: Semua ibu bapa dan penjaga murid prasekolah (30 orang) atau Semua guru panitia (12 orang)"
                  className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* 3. Detailed Text Areas (Bullet Points Format) */}
            <div className="space-y-4 pt-4 border-t border-slate-800">
              <div>
                <label className="block text-amber-300 font-bold mb-1.5">
                  OBJEKTIF PROGRAM (Gunakan tanda • atau baris baharu)
                </label>
                <textarea
                  rows={3}
                  value={objektif}
                  onChange={(e) => setObjektif(e.target.value)}
                  placeholder="• Mewujudkan suasana yang ceria di prasekolah.&#10;• Menggalakkan penglibatan ibu bapa."
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-amber-300 font-bold mb-1.5">
                  AGENDA / TENTATIF PROGRAM
                </label>
                <textarea
                  rows={3}
                  value={agenda}
                  onChange={(e) => setAgenda(e.target.value)}
                  placeholder="• Guru mengagihkan tugas.&#10;• Aktiviti bermula.&#10;• Guru mengucapkan terima kasih."
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-amber-300 font-bold mb-1.5">KEKUATAN</label>
                <textarea
                  rows={2}
                  value={kekuatan}
                  onChange={(e) => setKekuatan(e.target.value)}
                  placeholder="• Ibu bapa dan penjaga memberi kerjasama menjayakan aktiviti."
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-amber-300 font-bold mb-1.5">
                  KELEMAHAN / CADANGAN PENAMBAHBAIKAN
                </label>
                <textarea
                  rows={2}
                  value={kelemahan}
                  onChange={(e) => setKelemahan(e.target.value)}
                  placeholder="• Sebahagian barang belum dapat dipindah balik demi mengelakkan kerosakan..."
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-amber-300 font-bold mb-1.5">TINDAKAN SUSULAN</label>
                <textarea
                  rows={2}
                  value={tindakanSusulan}
                  onChange={(e) => setTindakanSusulan(e.target.value)}
                  placeholder="• Gotong-royong Bil.2/2026 akan diadakan sebelum cuti Tahun Baharu Cina."
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>

            {/* 4. Photos Upload (Maksimum 4 keping) */}
            <div className="pt-4 border-t border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-200 block">
                    FOTO SEBELUM / SEMASA / SELEPAS
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Muat naik 2 hingga 4 keping gambar aktiviti untuk paparan pada bahagian bawah borang OPR.
                  </span>
                </div>
                <label className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl cursor-pointer font-bold flex items-center gap-1.5 border border-slate-700">
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Pilih Gambar</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {photos.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {photos.map((src, index) => (
                    <div
                      key={index}
                      className="relative rounded-2xl overflow-hidden border border-slate-700 aspect-video group"
                    >
                      <img
                        src={src}
                        alt={`Aktiviti ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== index))}
                        className="absolute top-1 right-1 p-1 bg-rose-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition shadow"
                        title="Padam Gambar"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </form>
      )}

      {/* ================= 3. PRINT VIEW (EXACT MATCH TO THE IMAGE) ================= */}
      {viewMode === 'print' && selectedRecord && (
        <div className="space-y-6">
          {/* Top toolbar */}
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-2xl p-4 print:hidden">
            <button
              onClick={() => setViewMode('list')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali ke Senarai</span>
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-lg cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Sekarang (Print / PDF)</span>
            </button>
          </div>

          {/* Printable Sheet (CSS A4 Styled) */}
          <div className="bg-white text-slate-900 p-8 rounded-2xl border border-slate-300 max-w-4xl mx-auto shadow-2xl print:shadow-none print:border-none print:p-0 font-sans text-xs">
            
            {/* Header Table */}
            <div className="text-center font-bold pb-4 border-b border-slate-300 mb-4">
              <h2 className="text-base uppercase tracking-tight">
                {schoolSettings?.schoolName || tenantSchoolName}
              </h2>
              <h3 className="text-sm font-black uppercase text-slate-800">
                LAPORAN SATU MUKA SURAT (ONE PAGE REPORTING - OPR)
              </h3>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">
                {selectedRecord.reportType === 'PLC'
                  ? `KOMUNITI PEMBELAJARAN PROFESIONAL (PLC) - ${selectedRecord.plcTool}`
                  : 'AKTIVITI & PROGRAM KURIKULUM'}
              </span>
            </div>

            {/* Exact Table Layout Matching Image */}
            <table className="w-full border-collapse border border-slate-900 text-xs">
              <tbody>
                <tr>
                  <td className="w-44 bg-[#fef08a] border border-slate-900 p-2 font-bold uppercase text-slate-900">
                    BIDANG
                  </td>
                  <td className="border border-slate-900 p-2 font-semibold">
                    {selectedRecord.bidang}
                  </td>
                </tr>

                <tr>
                  <td className="bg-[#fef08a] border border-slate-900 p-2 font-bold uppercase text-slate-900">
                    PROGRAM / AKTIVITI
                  </td>
                  <td className="border border-slate-900 p-2 font-bold text-slate-900">
                    {selectedRecord.programName}
                  </td>
                </tr>

                <tr>
                  <td className="bg-[#fef08a] border border-slate-900 p-2 font-bold uppercase text-slate-900">
                    TARIKH / HARI
                  </td>
                  <td className="border border-slate-900 p-2 font-semibold">
                    {selectedRecord.tarikh} / {selectedRecord.hari}
                  </td>
                </tr>

                <tr>
                  <td className="bg-[#fef08a] border border-slate-900 p-2 font-bold uppercase text-slate-900">
                    SASARAN
                  </td>
                  <td className="border border-slate-900 p-2">
                    {selectedRecord.sasaran}
                  </td>
                </tr>

                <tr>
                  <td className="bg-[#fef08a] border border-slate-900 p-2 font-bold uppercase text-slate-900">
                    PENYELARAS PROGRAM
                  </td>
                  <td className="border border-slate-900 p-2 font-semibold">
                    {selectedRecord.penyelaras}
                  </td>
                </tr>

                {/* Bullets Sections */}
                <tr>
                  <td className="bg-[#fef08a] border border-slate-900 p-2 font-bold uppercase text-slate-900 align-top">
                    OBJEKTIF
                  </td>
                  <td className="border border-slate-900 p-2 whitespace-pre-line leading-relaxed">
                    {selectedRecord.objektif}
                  </td>
                </tr>

                <tr>
                  <td className="bg-[#fef08a] border border-slate-900 p-2 font-bold uppercase text-slate-900 align-top">
                    AGENDA
                  </td>
                  <td className="border border-slate-900 p-2 whitespace-pre-line leading-relaxed">
                    {selectedRecord.agenda}
                  </td>
                </tr>

                <tr>
                  <td className="bg-[#fef08a] border border-slate-900 p-2 font-bold uppercase text-slate-900 align-top">
                    KEKUATAN
                  </td>
                  <td className="border border-slate-900 p-2 whitespace-pre-line leading-relaxed">
                    {selectedRecord.kekuatan}
                  </td>
                </tr>

                <tr>
                  <td className="bg-[#fef08a] border border-slate-900 p-2 font-bold uppercase text-slate-900 align-top">
                    KELEMAHAN / CADANGAN PENAMBAHBAIKAN
                  </td>
                  <td className="border border-slate-900 p-2 whitespace-pre-line leading-relaxed">
                    {selectedRecord.kelemahan}
                  </td>
                </tr>

                <tr>
                  <td className="bg-[#fef08a] border border-slate-900 p-2 font-bold uppercase text-slate-900 align-top">
                    TINDAKAN SUSULAN
                  </td>
                  <td className="border border-slate-900 p-2 whitespace-pre-line leading-relaxed">
                    {selectedRecord.tindakanSusulan}
                  </td>
                </tr>

                {/* Photo Banner Header */}
                <tr>
                  <td
                    colSpan={2}
                    className="bg-[#fef08a] border border-slate-900 p-1.5 font-bold uppercase text-center text-slate-900 tracking-wider"
                  >
                    FOTO SEBELUM / SEMASA
                  </td>
                </tr>

                {/* Photos Grid Box */}
                <tr>
                  <td colSpan={2} className="border border-slate-900 p-3">
                    {selectedRecord.photos && selectedRecord.photos.length > 0 ? (
                      <div className="grid grid-cols-2 gap-3">
                        {selectedRecord.photos.map((src, i) => (
                          <div
                            key={i}
                            className="aspect-video border border-slate-400 rounded overflow-hidden flex items-center justify-center bg-slate-100"
                          >
                            <img
                              src={src}
                              alt={`Foto ${i + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-8 text-center text-slate-400 italic text-[11px]">
                        Tiada lampiran gambar dimuat naik.
                      </div>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Footer Signature */}
            <div className="mt-8 flex justify-between items-end text-[11px] px-2">
              <div>
                <p>Disediakan Oleh:</p>
                <div className="h-12"></div>
                <p className="font-bold uppercase underline">{selectedRecord.creatorName}</p>
                <p className="text-slate-500">Penyelaras / Guru Pelapor</p>
              </div>

              <div className="text-right">
                <p>Disahkan Oleh:</p>
                <div className="h-12"></div>
                <p className="font-bold uppercase underline">
                  {schoolSettings?.principalEmail ? 'GURU BESAR' : 'GURU BESAR / PK PENTADBIRAN'}
                </p>
                <p className="text-slate-500">{schoolSettings?.schoolName || tenantSchoolName}</p>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default AcademicOPRManager;
