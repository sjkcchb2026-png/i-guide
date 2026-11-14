import React, { useState, useEffect, useMemo } from 'react';
import { 
  Trophy, Plus, Trash2, Edit3, Save, Printer, 
  Search, Filter, Sparkles, Image, ChevronRight, X,
  Check, ArrowRight, UserCheck, Shield, Award, Users, AlertCircle, FileText
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { 
  collection, doc, getDocs, setDoc, deleteDoc, 
  onSnapshot, addDoc 
} from 'firebase/firestore';
import { Student, UserProfile, SchoolSettings } from '../../types';
import { 
  KokoActivity, 
  KokoScopeLevel, 
  KokoPencapaianTier, 
  KokoPengiktirafanType 
} from '../../types/kokurikulum';
import { useSchoolTenant } from '../../contexts/SchoolTenantContext';
import { belongsToSchool } from '../../utils/schoolTenant';

interface Props {
  profile: UserProfile;
  role: 'pentadbir' | 'guru' | 'laporan';
  schoolSettings?: SchoolSettings | null;
}

const SCOPE_LEVELS: KokoScopeLevel[] = [
  'Sekolah', 
  'Daerah/Zon', 
  'Bahagian', 
  'Negeri', 
  'Kebangsaan', 
  'Antarabangsa'
];

const PENCAPAIAN_TIERS: KokoPencapaianTier[] = [
  'Johan', 
  'Naib Johan', 
  'Ketiga', 
  'Keempat', 
  'Kelima', 
  'Saguhati', 
  'Penyertaan'
];

const PENGIKTIRAFAN_TYPES: KokoPengiktirafanType[] = [
  'Sijil', 
  'Pingat', 
  'Trofi', 
  'PAJSK'
];

export default function KokoSmartOPRManager({ profile, role, schoolSettings }: Props) {
  const { schoolCode: activeSchoolCode, schoolName: tenantSchoolName, isLegacySchool } = useSchoolTenant();
  const [activities, setActivities] = useState<KokoActivity[]>([]);
  const [teachers, setTeachers] = useState<string[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  // View mode: 'list' | 'create' | 'edit' | 'print-opr'
  const [viewMode, setViewMode] = useState<'list' | 'form' | 'print-opr'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedPrintActivity, setSelectedPrintActivity] = useState<KokoActivity | null>(null);

  // Form Fields
  const [jenis, setJenis] = useState<'pertandingan' | 'aktiviti'>('pertandingan');
  const [programName, setProgramName] = useState('');
  const [organizer, setOrganizer] = useState('PPD / JPN / KPM / Sekolah');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [venue, setVenue] = useState('');
  const [level, setLevel] = useState<KokoScopeLevel>('Daerah/Zon');
  const [category, setCategory] = useState<'uniform' | 'club' | 'sport' | 'KOKURIKULUM'>('sport');
  const [unit, setUnit] = useState('');

  // Teacher Role Separation
  const [jurulatih, setJurulatih] = useState<string[]>([]);
  const [guruPengiring, setGuruPengiring] = useState<string[]>([]);

  // Student Participation & Zero-Student Rule
  const [isZeroStudent, setIsZeroStudent] = useState<boolean>(false);
  const [participantCount, setParticipantCount] = useState<number>(1);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentSearch, setStudentSearch] = useState('');

  // Conditional Fields for 'pertandingan'
  const [pencapaian, setPencapaian] = useState<KokoPencapaianTier>('Penyertaan');
  const [pengiktirafan, setPengiktirafan] = useState<KokoPengiktirafanType[]>(['Sijil', 'PAJSK']);

  // OPR Documentation
  const [objective1, setObjective1] = useState('');
  const [reflection, setReflection] = useState('');
  const [impact, setImpact] = useState('');
  const [kekuatan, setKekuatan] = useState('');
  const [kelemahanCadangan, setKelemahanCadangan] = useState('');
  const [tindakanSusulan, setTindakanSusulan] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [newImageUrl, setNewImageUrl] = useState('');

  // Search & Filter for list
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLevel, setFilterLevel] = useState<string>('semua');
  const [filterJenis, setFilterJenis] = useState<string>('semua');

  const canEdit = role === 'pentadbir' || role === 'guru';

  // Load Firestore Data
  useEffect(() => {
    setLoading(true);
    const unsubs: (() => void)[] = [];

    // koko_activities
    unsubs.push(
      onSnapshot(collection(db, 'koko_activities'), (snap) => {
        const list = snap.docs
          .filter(d => belongsToSchool(d.data(), activeSchoolCode))
          .map(d => {
            const raw = d.data();
            // Normalize legacy records for teacher role separation
            const legacyJurulatih: string[] = Array.isArray(raw.jurulatih)
              ? raw.jurulatih
              : raw.teacherName
              ? [raw.teacherName]
              : raw.namaJurulatih
              ? [raw.namaJurulatih]
              : [];

            const legacyGuruPengiring: string[] = Array.isArray(raw.guruPengiring)
              ? raw.guruPengiring
              : [];

            return {
              id: d.id,
              ...raw,
              jurulatih: legacyJurulatih,
              guruPengiring: legacyGuruPengiring
            } as KokoActivity;
          });
        setActivities(list);
        setLoading(false);
      })
    );

    // Students
    unsubs.push(
      onSnapshot(collection(db, 'students'), (snap) => {
        setStudents(
          snap.docs
            .filter(d => belongsToSchool(d.data(), activeSchoolCode))
            .map(d => ({ id: d.id, ...d.data() } as Student))
        );
      })
    );

    // Teachers
    async function loadTeachers() {
      try {
        const pSnap = await getDocs(collection(db, 'personnel'));
        const scopedP = pSnap.docs.filter(d => belongsToSchool(d.data(), activeSchoolCode));
        if (scopedP.length > 0) {
          setTeachers(scopedP.map(d => (d.data().name || d.data().nama || '').toUpperCase()).filter(Boolean));
        } else {
          const tSnap = await getDocs(collection(db, 'teachers'));
          setTeachers(
            tSnap.docs
              .filter(d => belongsToSchool(d.data(), activeSchoolCode))
              .map(d => (d.data().name || '').toUpperCase())
              .filter(Boolean)
          );
        }
      } catch (err) {
        console.warn('Teacher load error:', err);
      }
    }
    loadTeachers();

    return () => unsubs.forEach(u => u());
  }, [activeSchoolCode]);

  // Filtered Activities
  const filteredActivities = useMemo(() => {
    return activities.filter(act => {
      const matchSearch = act.programName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          act.organizer.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (act.venue || '').toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchSearch) return false;
      if (filterLevel !== 'semua' && act.level !== filterLevel) return false;
      if (filterJenis !== 'semua' && act.jenis !== filterJenis) return false;
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [activities, searchQuery, filterLevel, filterJenis]);

  // Open Form for Create
  const handleOpenCreate = () => {
    setEditingId(null);
    setJenis('pertandingan');
    setProgramName('');
    setOrganizer(isLegacySchool ? 'PPD Mukah / JPN Sarawak / KPM' : 'PPD / JPN / KPM');
    setDate(new Date().toISOString().split('T')[0]);
    setEndDate('');
    setVenue(`Dewan / Padang ${tenantSchoolName}`);
    setLevel('Daerah/Zon');
    setCategory('sport');
    setUnit('');
    setJurulatih([profile.name]);
    setGuruPengiring([]);
    setIsZeroStudent(false);
    setParticipantCount(1);
    setSelectedStudentIds([]);
    setPencapaian('Penyertaan');
    setPengiktirafan(['Sijil', 'PAJSK']);
    setObjective1('Mendedahkan murid kepada pertandingan kokurikulum dan mencungkil bakat baharu.');
    setReflection('Semua peserta mempamerkan disiplin dan semangat kesukanan yang tinggi sepanjang program.');
    setImpact('Meningkatkan kemahiran kepimpinan, keyakinan diri, dan nilai kerjasama murid.');
    setKekuatan('Kerjasama erat antara jurulatih, guru pengiring, dan sokongan pihak pengurusan sekolah.');
    setKelemahanCadangan('Latihan amali perlu dipertingkatkan lebih awal sebelum tarikh kejohanan.');
    setTindakanSusulan('Mengadakan sesi pasca-nilai bersama peserta dan merangka jadual latihan berjadual.');
    setImages([]);
    setViewMode('form');
  };

  // Open Form for Edit
  const handleOpenEdit = (act: KokoActivity) => {
    setEditingId(act.id || null);
    setJenis(act.jenis || 'pertandingan');
    setProgramName(act.programName);
    setOrganizer(act.organizer);
    setDate(act.date);
    setEndDate(act.endDate || '');
    setVenue(act.venue);
    setLevel(act.level);
    setCategory(act.category as any);
    setUnit(act.unit || '');
    setJurulatih(act.jurulatih || []);
    setGuruPengiring(act.guruPengiring || []);
    setIsZeroStudent(act.participantCount === 0);
    setParticipantCount(act.participantCount || 0);
    setSelectedStudentIds(act.studentIds || []);
    setPencapaian((act.pencapaian as KokoPencapaianTier) || 'Penyertaan');
    setPengiktirafan((act.pengiktirafan as KokoPengiktirafanType[]) || ['Sijil']);
    setObjective1(act.objective1 || '');
    setReflection(act.reflection || '');
    setImpact(act.impact || '');
    setKekuatan(act.kekuatan || '');
    setKelemahanCadangan(act.kelemahanCadangan || '');
    setTindakanSusulan(act.tindakanSusulan || '');
    setImages(act.images || []);
    setViewMode('form');
  };

  // Open Print OPR
  const handleOpenPrintOpr = (act: KokoActivity) => {
    setSelectedPrintActivity(act);
    setViewMode('print-opr');
  };

  // Handle Save
  const handleSaveActivity = async () => {
    if (!programName.trim()) {
      alert('Sila masukkan Nama Program / Pertandingan.');
      return;
    }

    // Zero-Student Rule check:
    // If isZeroStudent === true, participantCount is 0, students list is empty. No error thrown!
    const effectiveCount = isZeroStudent ? 0 : Math.max(participantCount, selectedStudentIds.length);
    const selectedStudentNames = isZeroStudent 
      ? [] 
      : students.filter(s => selectedStudentIds.includes(s.id || '')).map(s => s.name);

    const payload: KokoActivity & { schoolCode?: string } = {
      schoolCode: activeSchoolCode,
      jenis,
      programName: programName.trim(),
      organizer: organizer.trim(),
      date,
      endDate: endDate || date,
      venue: venue.trim(),
      level,
      category,
      unit,
      jurulatih,
      guruPengiring,
      participantCount: effectiveCount,
      studentIds: isZeroStudent ? [] : selectedStudentIds,
      studentNames: selectedStudentNames,
      objective1,
      reflection,
      impact,
      kekuatan,
      kelemahanCadangan,
      tindakanSusulan,
      images,
      createdBy: profile.name,
      academicYear: '2026',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Conditional Pertandingan fields
    if (jenis === 'pertandingan') {
      payload.pencapaian = pencapaian;
      payload.pengiktirafan = pengiktirafan;
    }

    try {
      if (editingId) {
        await setDoc(doc(db, 'koko_activities', editingId), payload, { merge: true });
      } else {
        await addDoc(collection(db, 'koko_activities'), payload);
      }
      setViewMode('list');
    } catch (err) {
      console.error('Error saving activity OPR:', err);
      alert('Ralat menyimpan rekod: ' + String(err));
    }
  };

  // Delete
  const handleDeleteActivity = async (id: string) => {
    if (!canEdit) return;
    if (!window.confirm('Adakah anda pasti ingin memadamkan laporan OPR ini?')) return;
    try {
      await deleteDoc(doc(db, 'koko_activities', id));
    } catch (err) {
      console.error('Error deleting activity:', err);
    }
  };

  // Image Upload or URL paste
  const handleAddImage = () => {
    if (!newImageUrl.trim()) return;
    if (images.length >= 4) {
      alert('Maksimum 4 keping gambar bagi One-Page Report (OPR).');
      return;
    }
    setImages(prev => [...prev, newImageUrl.trim()]);
    setNewImageUrl('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (images.length >= 4) {
      alert('Maksimum 4 keping gambar bagi format OPR.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result) {
        setImages(prev => [...prev, String(reader.result)]);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner (hidden during print) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 print:hidden">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-600/20 text-amber-400 rounded-2xl border border-amber-500/30">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Laporan Pertandingan & Aktiviti (Smart OPR)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Perekodan One-Page Report (OPR) KPM, Pemisahan Jurulatih & Pengiring, serta Zero-Student Rule
              </p>
            </div>
          </div>
        </div>

        {canEdit && viewMode === 'list' && (
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition shadow-lg shadow-amber-600/30 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Cipta Laporan OPR Baru</span>
          </button>
        )}

        {viewMode !== 'list' && (
          <button
            onClick={() => setViewMode('list')}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            <span>← Kembali ke Senarai</span>
          </button>
        )}
      </div>

      {/* ================= VIEW 1: LIST OF ACTIVITIES ================= */}
      {viewMode === 'list' && (
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Cari nama program, penganjur, atau tempat..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={filterJenis}
                onChange={e => setFilterJenis(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none"
              >
                <option value="semua">Semua Jenis (Pertandingan & Aktiviti)</option>
                <option value="pertandingan">Pertandingan Sahaja</option>
                <option value="aktiviti">Aktiviti Sahaja</option>
              </select>

              <select
                value={filterLevel}
                onChange={e => setFilterLevel(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none"
              >
                <option value="semua">Semua Peringkat</option>
                {SCOPE_LEVELS.map(lvl => (
                  <option key={lvl} value={lvl}>{lvl}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredActivities.map(act => (
              <div
                key={act.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-3xl p-5 shadow-lg flex flex-col justify-between transition-all space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                      act.jenis === 'pertandingan'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800/80'
                        : 'bg-blue-950 text-blue-300 border border-blue-800/80'
                    }`}>
                      {act.jenis === 'pertandingan' ? 'Pertandingan' : 'Aktiviti / Program'}
                    </span>

                    <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                      {act.level}
                    </span>
                  </div>

                  <h3 className="text-sm font-black text-white line-clamp-2 leading-snug">
                    {act.programName}
                  </h3>

                  <div className="text-[11px] text-slate-400 mt-2 space-y-1">
                    <div className="flex items-center gap-1.5 font-mono">
                      <span>📅 {act.date}</span>
                      <span>·</span>
                      <span className="truncate">📍 {act.venue || 'Sekolah'}</span>
                    </div>

                    {act.jenis === 'pertandingan' && act.pencapaian && (
                      <div className="text-amber-400 font-bold flex items-center gap-1 mt-1">
                        <Award className="w-3.5 h-3.5" />
                        <span>Pencapaian: {act.pencapaian}</span>
                      </div>
                    )}
                  </div>

                  {/* Teacher involvement tags */}
                  <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-1.5 text-[10px]">
                    {act.jurulatih && act.jurulatih.length > 0 && (
                      <div className="flex items-center gap-1 text-slate-300">
                        <span className="font-bold text-amber-400">Jurulatih:</span>
                        <span className="truncate">{act.jurulatih.join(', ')}</span>
                      </div>
                    )}

                    {act.guruPengiring && act.guruPengiring.length > 0 && (
                      <div className="flex items-center gap-1 text-slate-400">
                        <span className="font-bold text-indigo-400">Pengiring:</span>
                        <span className="truncate">{act.guruPengiring.join(', ')}</span>
                      </div>
                    )}

                    <div className="text-slate-400">
                      <span className="font-bold text-slate-300">Penyertaan Murid:</span>{' '}
                      {act.participantCount === 0 ? (
                        <span className="text-slate-500 italic">0 (Bengkel / Program Staf)</span>
                      ) : (
                        <span className="font-mono text-white font-bold">{act.participantCount} orang</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                  <button
                    onClick={() => handleOpenPrintOpr(act)}
                    className="flex items-center gap-1 text-xs font-bold text-blue-400 hover:text-blue-300"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Lihat OPR</span>
                  </button>

                  {canEdit && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenEdit(act)}
                        className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
                        title="Edit"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteActivity(act.id!)}
                        className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-rose-400"
                        title="Padam"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {filteredActivities.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500 italic">
                Tiada laporan aktiviti atau pertandingan ditemui.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= VIEW 2: FORM (CREATE / EDIT) ================= */}
      {viewMode === 'form' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h3 className="text-lg font-bold text-white">
              {editingId ? 'Kemaskini Laporan OPR' : 'Daftar Laporan OPR Baharu'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Sila lengkapkan maklumat aktiviti atau pertandingan mengikut format One-Page Report KPM
            </p>
          </div>

          {/* 1. Type Selector: Pertandingan vs Aktiviti */}
          <div>
            <label className="text-xs font-black text-slate-300 uppercase tracking-wider block mb-2">
              Jenis Laporan:
            </label>
            <div className="grid grid-cols-2 gap-4 max-w-md">
              <button
                type="button"
                onClick={() => setJenis('pertandingan')}
                className={`p-3.5 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-1 ${
                  jenis === 'pertandingan'
                    ? 'bg-amber-600 border-amber-500 text-white shadow-lg shadow-amber-600/30 font-black'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <Trophy className="w-5 h-5" />
                <span className="text-xs">Pertandingan</span>
                <span className="text-[10px] opacity-80">(Perlu Pencapaian & Hadiah)</span>
              </button>

              <button
                type="button"
                onClick={() => setJenis('aktiviti')}
                className={`p-3.5 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-1 ${
                  jenis === 'aktiviti'
                    ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/30 font-black'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <Sparkles className="w-5 h-5" />
                <span className="text-xs">Aktiviti / Program</span>
                <span className="text-[10px] opacity-80">(Kem, Bengkel, Sambutan)</span>
              </button>
            </div>
          </div>

          {/* 2. Core Event Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                Nama Program / Pertandingan:
              </label>
              <input
                type="text"
                value={programName}
                onChange={e => setProgramName(e.target.value)}
                placeholder="cth: Kejohanan Bola Tampar MSSD Balingian 2026"
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white font-bold outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-black text-slate-300 uppercase tracking-wider">Penganjur:</label>
              <input
                type="text"
                value={organizer}
                onChange={e => setOrganizer(e.target.value)}
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-black text-slate-300 uppercase tracking-wider">Tempat / Lokasi:</label>
              <input
                type="text"
                value={venue}
                onChange={e => setVenue(e.target.value)}
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-black text-slate-300 uppercase tracking-wider">Peringkat / Tahap:</label>
              <select
                value={level}
                onChange={e => setLevel(e.target.value as KokoScopeLevel)}
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-amber-500"
              >
                {SCOPE_LEVELS.map(lvl => (
                  <option key={lvl} value={lvl}>{lvl}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-black text-slate-300 uppercase tracking-wider">Tarikh Program:</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* 3. Conditional: Pertandingan Pencapaian & Pengiktirafan */}
          {jenis === 'pertandingan' && (
            <div className="p-5 bg-amber-950/30 border border-amber-600/40 rounded-2xl space-y-4">
              <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Award className="w-4 h-4" />
                Maklumat Pencapaian & Pengiktirafan Rasmi
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black text-slate-300 uppercase tracking-wider">Pencapaian:</label>
                  <select
                    value={pencapaian}
                    onChange={e => setPencapaian(e.target.value as KokoPencapaianTier)}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-amber-300 font-bold outline-none"
                  >
                    {PENCAPAIAN_TIERS.map(tier => (
                      <option key={tier} value={tier}>{tier}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-black text-slate-300 uppercase tracking-wider block mb-1">
                    Bentuk Pengiktirafan:
                  </label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {PENGIKTIRAFAN_TYPES.map(type => {
                      const isSelected = pengiktirafan.includes(type);
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            if (isSelected) setPengiktirafan(prev => prev.filter(t => t !== type));
                            else setPengiktirafan(prev => [...prev, type]);
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 border ${
                            isSelected
                              ? 'bg-amber-600 text-white border-amber-500'
                              : 'bg-slate-950 text-slate-400 border-slate-800'
                          }`}
                        >
                          <span>{type}</span>
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. Teacher Roles Separation: Jurulatih vs Guru Pengiring */}
          <div className="p-5 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-4">
            <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-indigo-400" />
              Guru Yang Terlibat (Pemisahan Jurulatih & Guru Pengiring)
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Jurulatih Multi-Select */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-amber-400 uppercase">
                  Jurulatih / Trainer ({jurulatih.length}):
                </label>
                <div className="max-h-36 overflow-y-auto border border-slate-800 rounded-xl p-2 bg-slate-900/60 space-y-1">
                  {teachers.map(tName => {
                    const isSelected = jurulatih.includes(tName);
                    return (
                      <button
                        key={tName}
                        type="button"
                        onClick={() => {
                          if (isSelected) setJurulatih(prev => prev.filter(t => t !== tName));
                          else setJurulatih(prev => [...prev, tName]);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition ${
                          isSelected ? 'bg-amber-950 text-amber-300 border border-amber-700/60' : 'text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        <span className="truncate">{tName}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-amber-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Guru Pengiring Multi-Select */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-indigo-400 uppercase">
                  Guru Pengiring / Chaperone ({guruPengiring.length}):
                </label>
                <div className="max-h-36 overflow-y-auto border border-slate-800 rounded-xl p-2 bg-slate-900/60 space-y-1">
                  {teachers.map(tName => {
                    const isSelected = guruPengiring.includes(tName);
                    return (
                      <button
                        key={tName}
                        type="button"
                        onClick={() => {
                          if (isSelected) setGuruPengiring(prev => prev.filter(t => t !== tName));
                          else setGuruPengiring(prev => [...prev, tName]);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition ${
                          isSelected ? 'bg-indigo-950 text-indigo-300 border border-indigo-700/60' : 'text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        <span className="truncate">{tName}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* 5. Student Participation & Zero-Student Rule */}
          <div className="p-5 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-emerald-400" />
                Penyertaan Murid
              </span>

              {/* Zero-Student Gate Checkbox */}
              <label className="flex items-center gap-2 cursor-pointer bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
                <input
                  type="checkbox"
                  checked={isZeroStudent}
                  onChange={e => setIsZeroStudent(e.target.checked)}
                  className="rounded border-slate-700 text-blue-600 focus:ring-0"
                />
                <span className="text-xs font-bold text-amber-300">
                  Zero-Student Rule (0 Murid: Bengkel / Kursus Guru / Pengurusan Sahaja)
                </span>
              </label>
            </div>

            {!isZeroStudent ? (
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase">Bilangan Murid Terlibat:</label>
                    <input
                      type="number"
                      min={1}
                      value={participantCount}
                      onChange={e => setParticipantCount(Math.max(1, Number(e.target.value)))}
                      className="mt-1 w-28 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white font-mono font-bold"
                    />
                  </div>
                  <div className="text-xs text-slate-400 mt-5">
                    Dipilih: <span className="text-white font-bold">{selectedStudentIds.length} orang murid</span>
                  </div>
                </div>

                {/* Quick Student Selector */}
                <div className="space-y-2">
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={e => setStudentSearch(e.target.value)}
                    placeholder="Tapis senarai murid untuk ditandakan..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white outline-none"
                  />
                  <div className="max-h-40 overflow-y-auto border border-slate-800 rounded-xl p-2 bg-slate-900/60 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1">
                    {students
                      .filter(s => (s.name || '').toLowerCase().includes(studentSearch.toLowerCase()))
                      .slice(0, 30)
                      .map(st => {
                        const isSelected = selectedStudentIds.includes(st.id || '');
                        return (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => {
                              if (isSelected) setSelectedStudentIds(prev => prev.filter(id => id !== st.id));
                              else setSelectedStudentIds(prev => [...prev, st.id || '']);
                            }}
                            className={`text-left px-2 py-1 rounded text-[11px] truncate flex items-center justify-between ${
                              isSelected ? 'bg-emerald-950 text-emerald-300 font-bold' : 'text-slate-400 hover:bg-slate-800'
                            }`}
                          >
                            <span className="truncate">{st.name} ({st.class || '-'})</span>
                            {isSelected && <Check className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />}
                          </button>
                        );
                      })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-amber-950/20 border border-amber-700/40 rounded-xl text-xs text-amber-300">
                ✓ Mod Zero-Student aktif. Rekod akan disimpan dengan 0 bilangan murid terlibat (sah untuk bengkel/seminar staf).
              </div>
            )}
          </div>

          {/* 6. OPR Narrative Details */}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-black text-slate-300 uppercase tracking-wider">Objektif Program:</label>
              <textarea
                rows={2}
                value={objective1}
                onChange={e => setObjective1(e.target.value)}
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 outline-none focus:border-amber-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-black text-slate-300 uppercase tracking-wider">Refleksi / Ringkasan:</label>
                <textarea
                  rows={3}
                  value={reflection}
                  onChange={e => setReflection(e.target.value)}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-black text-slate-300 uppercase tracking-wider">Impak Kepada Murid/Sekolah:</label>
                <textarea
                  rows={3}
                  value={impact}
                  onChange={e => setImpact(e.target.value)}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-black text-slate-300 uppercase tracking-wider">Kekuatan Program:</label>
                <textarea
                  rows={2}
                  value={kekuatan}
                  onChange={e => setKekuatan(e.target.value)}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-black text-slate-300 uppercase tracking-wider">Kelemahan & Cadangan Penambahbaikan:</label>
                <textarea
                  rows={2}
                  value={kelemahanCadangan}
                  onChange={e => setKelemahanCadangan(e.target.value)}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 outline-none"
                />
              </div>
            </div>
          </div>

          {/* 7. Image Upload / Pasting (Up to 4 images for OPR card) */}
          <div className="p-5 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Image className="w-4 h-4 text-blue-400" />
                Gambar Dokumentasi OPR (Maksimum 4 Keping):
              </label>
              <span className="text-[11px] text-slate-400 font-mono">{images.length} / 4</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {images.map((img, idx) => (
                <div key={idx} className="relative aspect-video rounded-xl overflow-hidden border border-slate-800 group bg-slate-900">
                  <img src={img} alt={`Gambar ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImages(prev => prev.filter((_, i) => i !== idx))}
                    className="absolute top-1 right-1 p-1 bg-black/70 hover:bg-rose-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {images.length < 4 && (
                <label className="aspect-video rounded-xl border-2 border-dashed border-slate-800 hover:border-slate-700 flex flex-col items-center justify-center cursor-pointer text-slate-500 hover:text-slate-300 transition">
                  <Plus className="w-5 h-5 mb-1" />
                  <span className="text-[10px] font-bold">Muat Naik Gambar</span>
                  <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                </label>
              )}
            </div>

            {/* URL Paste Option */}
            {images.length < 4 && (
              <div className="flex gap-2 pt-2">
                <input
                  type="text"
                  value={newImageUrl}
                  onChange={e => setNewImageUrl(e.target.value)}
                  placeholder="Atau tampal URL gambar..."
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddImage}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl"
                >
                  Tambah URL
                </button>
              </div>
            )}
          </div>

          {/* Form Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSaveActivity}
              className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition shadow-lg shadow-amber-600/30"
            >
              Simpan Laporan OPR
            </button>
          </div>
        </div>
      )}

      {/* ================= VIEW 3: ONE-PAGE REPORT (OPR) PRINT VIEW ================= */}
      {viewMode === 'print-opr' && selectedPrintActivity && (
        <div className="space-y-6">
          <div className="flex items-center justify-between print:hidden">
            <button
              onClick={() => setViewMode('list')}
              className="px-4 py-2 bg-slate-800 text-slate-200 rounded-xl text-xs font-bold"
            >
              ← Kembali
            </button>

            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black uppercase shadow"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak OPR (A4)</span>
            </button>
          </div>

          {/* Pristine A4 Sheet */}
          <div className="bg-white text-slate-900 p-8 sm:p-12 rounded-3xl shadow-2xl max-w-4xl mx-auto border border-slate-200 space-y-6 print:m-0 print:p-6 print:border-none print:shadow-none">
            {/* Header */}
            <div className="text-center border-b-2 border-slate-900 pb-4">
              <h1 className="text-lg font-black uppercase tracking-wide">
                {schoolSettings?.schoolName || tenantSchoolName} ({schoolSettings?.schoolCode || activeSchoolCode})
              </h1>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 mt-0.5">
                ONE PAGE REPORT (OPR) KOKURIKULUM SESI 2026
              </h2>
              <div className="mt-2 inline-block px-3 py-0.5 bg-slate-900 text-white text-[11px] font-black rounded uppercase">
                {selectedPrintActivity.jenis === 'pertandingan' ? 'Laporan Pertandingan' : 'Laporan Aktiviti'}
              </div>
            </div>

            {/* Core Info Table */}
            <table className="w-full text-xs border border-slate-900 border-collapse">
              <tbody>
                <tr className="border-b border-slate-900">
                  <td className="w-36 py-2 px-3 font-bold bg-slate-100 border-r border-slate-900">Nama Program:</td>
                  <td colSpan={3} className="py-2 px-3 font-black text-sm">{selectedPrintActivity.programName}</td>
                </tr>
                <tr className="border-b border-slate-900">
                  <td className="py-2 px-3 font-bold bg-slate-100 border-r border-slate-900">Penganjur:</td>
                  <td className="py-2 px-3 border-r border-slate-900">{selectedPrintActivity.organizer}</td>
                  <td className="w-28 py-2 px-3 font-bold bg-slate-100 border-r border-slate-900">Peringkat:</td>
                  <td className="py-2 px-3 font-black">{selectedPrintActivity.level}</td>
                </tr>
                <tr className="border-b border-slate-900">
                  <td className="py-2 px-3 font-bold bg-slate-100 border-r border-slate-900">Tarikh & Tempat:</td>
                  <td className="py-2 px-3 border-r border-slate-900 font-mono">{selectedPrintActivity.date} · {selectedPrintActivity.venue}</td>
                  <td className="py-2 px-3 font-bold bg-slate-100 border-r border-slate-900">Murid Terlibat:</td>
                  <td className="py-2 px-3 font-mono font-bold">
                    {selectedPrintActivity.participantCount === 0 ? '0 (Staf Sahaja)' : `${selectedPrintActivity.participantCount} Orang`}
                  </td>
                </tr>
                {selectedPrintActivity.jenis === 'pertandingan' && (
                  <tr className="border-b border-slate-900 bg-amber-50">
                    <td className="py-2 px-3 font-bold bg-amber-100 border-r border-slate-900 text-amber-900">Pencapaian:</td>
                    <td className="py-2 px-3 border-r border-slate-900 font-black text-amber-900">{selectedPrintActivity.pencapaian || '-'}</td>
                    <td className="py-2 px-3 font-bold bg-amber-100 border-r border-slate-900 text-amber-900">Pengiktirafan:</td>
                    <td className="py-2 px-3 font-bold text-amber-900">{(selectedPrintActivity.pengiktirafan || []).join(', ') || '-'}</td>
                  </tr>
                )}
                <tr className="border-b border-slate-900">
                  <td className="py-2 px-3 font-bold bg-slate-100 border-r border-slate-900">Jurulatih:</td>
                  <td className="py-2 px-3 border-r border-slate-900 font-bold">
                    {(selectedPrintActivity.jurulatih || []).join(', ') || '-'}
                  </td>
                  <td className="py-2 px-3 font-bold bg-slate-100 border-r border-slate-900">Guru Pengiring:</td>
                  <td className="py-2 px-3 font-bold">
                    {(selectedPrintActivity.guruPengiring || []).join(', ') || '-'}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Narrative Sections */}
            <div className="space-y-3 text-xs leading-relaxed">
              <div>
                <strong className="uppercase font-black text-slate-800">1. Objektif:</strong>
                <p className="mt-0.5 text-slate-700">{selectedPrintActivity.objective1 || '-'}</p>
              </div>

              <div>
                <strong className="uppercase font-black text-slate-800">2. Ringkasan & Refleksi:</strong>
                <p className="mt-0.5 text-slate-700">{selectedPrintActivity.reflection || '-'}</p>
              </div>

              <div>
                <strong className="uppercase font-black text-slate-800">3. Impak:</strong>
                <p className="mt-0.5 text-slate-700">{selectedPrintActivity.impact || '-'}</p>
              </div>
            </div>

            {/* Photo Gallery Grid (2x2 or 4 photos) */}
            {selectedPrintActivity.images && selectedPrintActivity.images.length > 0 && (
              <div className="space-y-1">
                <strong className="uppercase font-black text-slate-800 text-xs">4. Rakaman Gambar Aktiviti:</strong>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  {selectedPrintActivity.images.map((img, i) => (
                    <div key={i} className="aspect-video rounded-lg overflow-hidden border border-slate-300 bg-slate-100">
                      <img src={img} alt={`Aktiviti ${i + 1}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Signatures */}
            <div className="grid grid-cols-2 gap-8 pt-8 border-t-2 border-slate-900 text-xs">
              <div className="space-y-10">
                <span className="font-bold uppercase text-[10px] text-slate-500">Disediakan Oleh:</span>
                <div className="border-b border-slate-400 pb-1 font-bold">
                  ({(selectedPrintActivity.jurulatih && selectedPrintActivity.jurulatih[0]) || selectedPrintActivity.createdBy})
                </div>
              </div>
              <div className="space-y-10">
                <span className="font-bold uppercase text-[10px] text-slate-500">Disahkan Oleh:</span>
                <div className="border-b border-slate-400 pb-1 font-bold">
                  (GURU BESAR / GPK KOKURIKULUM)
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
