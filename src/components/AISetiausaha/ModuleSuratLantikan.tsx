import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  FileText,
  Layers,
  Printer,
  Save,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { PersonnelProfile } from '../../types';
import {
  MySGJawatankuasaItem,
  MySGPillar,
  PILLAR_DISPLAY_META,
} from '../../utils/mysgJawatankuasaCatalog';
import SchoolLogo from '../SchoolLogo';
import { SuratLantikanDocument } from './types';

interface ModuleSuratLantikanProps {
  schoolCode: string;
  schoolName: string;
  schoolLogo?: string;
  schoolSlogan?: string;
  academicYear: string;
  currentUserName: string;
  personnel: PersonnelProfile[];
  mysgItems: MySGJawatankuasaItem[];
  selectedItem: MySGJawatankuasaItem;
  savedDocs: SuratLantikanDocument[];
  onSaveDoc: (
    doc: Partial<SuratLantikanDocument> & { docKind: 'LANTIKAN' }
  ) => Promise<SuratLantikanDocument | null>;
  onDeleteDoc: (id: string) => Promise<void>;
}

interface TeacherDossier {
  key: string;
  teacherId: string;
  teacherName: string;
  ic: string;
  position: string;
  grade: string;
  positions: MySGJawatankuasaItem[];
  totalMata: number;
}

const PILLAR_ORDER: MySGPillar[] = ['PENTADBIRAN', 'KURIKULUM', 'HEM', 'KOKURIKULUM'];

function formatMalayDate(dateStr: string): string {
  if (!dateStr) return '-';
  const months = [
    'Januari',
    'Februari',
    'Mac',
    'April',
    'Mei',
    'Jun',
    'Julai',
    'Ogos',
    'September',
    'Oktober',
    'November',
    'Disember',
  ];
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  return `${day} ${months[monthIdx] || parts[1]} ${year}`;
}

function normalizeNameKey(raw: string): string {
  return String(raw || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export const ModuleSuratLantikan: React.FC<ModuleSuratLantikanProps> = ({
  schoolCode,
  schoolName,
  schoolLogo,
  schoolSlogan,
  academicYear,
  personnel,
  mysgItems,
  selectedItem,
  savedDocs,
  onSaveDoc,
  onDeleteDoc,
}) => {
  const principalProfile = useMemo(
    () =>
      personnel.find(
        (p) =>
          p.category === 'PRINCIPAL' ||
          String(p.position || '').toUpperCase() === 'GB' ||
          String(p.position || '').toUpperCase().includes('GURU BESAR')
      ),
    [personnel]
  );

  const activeTeachers = useMemo(
    () =>
      personnel
        .filter((p) => p.name && (!p.teachingStatus || p.teachingStatus === 'Aktif'))
        .sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [personnel]
  );

  // Build teacher dossiers from all assigned MySG items
  const teacherDossiers = useMemo<TeacherDossier[]>(() => {
    const byKey = new Map<string, TeacherDossier>();

    const findPersonnel = (id: string, name: string): PersonnelProfile | undefined => {
      if (id) {
        const matchId = activeTeachers.find(
          (p) => p.id === id || (p as any).uid === id
        );
        if (matchId) return matchId;
      }
      const norm = normalizeNameKey(name);
      if (norm) {
        return activeTeachers.find((p) => normalizeNameKey(p.name) === norm);
      }
      return undefined;
    };

    mysgItems.forEach((item) => {
      const tName = String(item.assignedTeacherName || '').trim();
      const tId = String(item.assignedTeacherId || '').trim();
      if (!tName && !tId) return;

      const matched = findPersonnel(tId, tName);
      const resolvedName = matched?.name || tName || tId;
      const resolvedId = matched?.id || tId || resolvedName;
      const key = normalizeNameKey(resolvedName) || resolvedId;

      const existing = byKey.get(key);
      if (existing) {
        existing.positions.push(item);
        existing.totalMata += Number(item.mataBeban) || 0;
      } else {
        byKey.set(key, {
          key,
          teacherId: resolvedId,
          teacherName: resolvedName,
          ic: matched?.ic || '-',
          position: matched?.position || 'Guru Akademik',
          grade: matched?.grade || 'DG41',
          positions: [item],
          totalMata: Number(item.mataBeban) || 0,
        });
      }
    });

    return Array.from(byKey.values()).sort((a, b) =>
      a.teacherName.localeCompare(b.teacherName)
    );
  }, [mysgItems, activeTeachers]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [mode, setMode] = useState<'INDIVIDU_BERSEPADU' | 'JAWATAN_TUNGGAL'>(
    'INDIVIDU_BERSEPADU'
  );
  const [printAllTeachers, setPrintAllTeachers] = useState(false);
  const [selectedTeacherKey, setSelectedTeacherKey] = useState<string>('');
  const [singleOverrideTeacherId, setSingleOverrideTeacherId] = useState<string>('');
  const [rujukanKami, setRujukanKami] = useState(
    `${schoolCode}/500-2/1/${String(savedDocs.length + 1).padStart(2, '0')}`
  );
  const [tarikhSurat, setTarikhSurat] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [principalName, setPrincipalName] = useState(
    principalProfile?.name || 'GURU BESAR'
  );
  const [notes, setNotes] = useState(
    'Pelantikan ini berkuat kuasa serta-merta bagi sesi persekolahan semasa tertakluk kepada pindaan dari semasa ke semasa oleh pihak pentadbiran sekolah.'
  );
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  useEffect(() => {
    if (principalProfile?.name) {
      setPrincipalName(principalProfile.name);
    }
  }, [principalProfile]);

  useEffect(() => {
    if (!selectedTeacherKey && teacherDossiers.length > 0) {
      setSelectedTeacherKey(teacherDossiers[0].key);
    } else if (
      selectedTeacherKey &&
      teacherDossiers.length > 0 &&
      !teacherDossiers.some((d) => d.key === selectedTeacherKey)
    ) {
      setSelectedTeacherKey(teacherDossiers[0].key);
    }
  }, [teacherDossiers, selectedTeacherKey]);

  useEffect(() => {
    setSingleOverrideTeacherId(selectedItem.assignedTeacherId || '');
  }, [selectedItem.kodMySG, selectedItem.assignedTeacherId]);

  const activeSingleTeacher = useMemo(() => {
    if (singleOverrideTeacherId) {
      const found = activeTeachers.find(
        (p) =>
          p.id === singleOverrideTeacherId ||
          (p as any).uid === singleOverrideTeacherId
      );
      if (found) {
        return {
          teacherId: found.id,
          teacherName: found.name,
          ic: found.ic || '-',
          position: found.position || 'Guru Akademik',
          grade: found.grade || 'DG41',
        };
      }
    }
    const normName = normalizeNameKey(selectedItem.assignedTeacherName);
    const matchedByName = normName
      ? activeTeachers.find((p) => normalizeNameKey(p.name) === normName)
      : undefined;
    return {
      teacherId: matchedByName?.id || selectedItem.assignedTeacherId || '',
      teacherName:
        matchedByName?.name ||
        selectedItem.assignedTeacherName ||
        '(BELUM DILANTIK — SILA PILIH GURU)',
      ic: matchedByName?.ic || '-',
      position: matchedByName?.position || 'Guru Akademik',
      grade: matchedByName?.grade || 'DG41',
    };
  }, [singleOverrideTeacherId, activeTeachers, selectedItem]);

  const dossiersToRender = useMemo<TeacherDossier[]>(() => {
    if (mode !== 'INDIVIDU_BERSEPADU') return [];
    if (printAllTeachers) {
      return teacherDossiers;
    }
    const picked = teacherDossiers.find((d) => d.key === selectedTeacherKey);
    if (picked) return [picked];
    if (teacherDossiers.length > 0) return [teacherDossiers[0]];
    return [];
  }, [mode, printAllTeachers, teacherDossiers, selectedTeacherKey]);

  const handleSave = async () => {
    setSaving(true);
    setBanner(null);
    try {
      const selectedDossier = teacherDossiers.find(
        (d) => d.key === selectedTeacherKey
      );
      const saved = await onSaveDoc({
        id: editingId || undefined,
        docKind: 'LANTIKAN',
        academicYear,
        mode,
        rujukanKami,
        tarikhSurat,
        teacherId:
          mode === 'INDIVIDU_BERSEPADU'
            ? printAllTeachers
              ? 'SEMUA_GURU'
              : selectedDossier?.teacherId || ''
            : activeSingleTeacher.teacherId,
        teacherName:
          mode === 'INDIVIDU_BERSEPADU'
            ? printAllTeachers
              ? `Semua Guru (${teacherDossiers.length} Orang)`
              : selectedDossier?.teacherName || ''
            : activeSingleTeacher.teacherName,
        kodMySG: mode === 'JAWATAN_TUNGGAL' ? selectedItem.kodMySG : 'BERSEPADU_MYSG',
        jawatanRasmi:
          mode === 'JAWATAN_TUNGGAL'
            ? selectedItem.jawatanRasmi
            : 'Surat Lantikan Tugas Rasmi Bersepadu (4 Teras MySG)',
        principalName,
        notes,
      });
      if (saved) {
        setEditingId(saved.id);
        setBanner({
          type: 'success',
          message:
            'Rekod Surat Lantikan berjaya disimpan ke arkib AI Setiausaha sekolah.',
        });
      }
    } catch (err: any) {
      setBanner({
        type: 'error',
        message: err?.message || 'Gagal menyimpan rekod Surat Lantikan.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLoadSaved = (d: SuratLantikanDocument) => {
    setEditingId(d.id);
    setMode(d.mode);
    setRujukanKami(d.rujukanKami);
    setTarikhSurat(d.tarikhSurat);
    setPrincipalName(d.principalName || principalProfile?.name || 'GURU BESAR');
    setNotes(d.notes || '');
    if (d.mode === 'INDIVIDU_BERSEPADU') {
      if (d.teacherId === 'SEMUA_GURU') {
        setPrintAllTeachers(true);
      } else {
        setPrintAllTeachers(false);
        const key = normalizeNameKey(d.teacherName || '');
        if (key && teacherDossiers.some((td) => td.key === key)) {
          setSelectedTeacherKey(key);
        }
      }
    } else if (d.teacherId) {
      setSingleOverrideTeacherId(d.teacherId);
    }
    setBanner({
      type: 'info',
      message: `Rekod lantikan (${d.rujukanKami}) telah dimuatkan.`,
    });
  };

  const handleBulkPrintAll = () => {
    setMode('INDIVIDU_BERSEPADU');
    setPrintAllTeachers(true);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const renderLetterhead = (refStr: string, dateStr: string) => (
    <div className="border-b-2 border-slate-900 pb-2.5 mb-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SchoolLogo
            src={schoolLogo}
            schoolCode={schoolCode}
            className="w-12 h-12 shrink-0"
          />
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">
              KEMENTERIAN PENDIDIKAN MALAYSIA
            </p>
            <h2 className="text-sm font-black uppercase text-slate-950 leading-tight">
              {schoolName} ({schoolCode})
            </h2>
            {schoolSlogan && (
              <p className="text-[9px] font-semibold italic text-slate-600">
                &ldquo;{schoolSlogan}&rdquo;
              </p>
            )}
          </div>
        </div>
        <div className="text-right text-[9.5px] leading-snug text-slate-800 shrink-0">
          <p>
            <span className="font-bold">Ruj. Kami :</span> {refStr}
          </p>
          <p>
            <span className="font-bold">Tarikh :</span> {formatMalayDate(dateStr)}
          </p>
          <p className="font-bold text-teal-800 uppercase mt-0.5">
            SKPM Aspek 2.1.1 (MySG)
          </p>
        </div>
      </div>
    </div>
  );

  const renderAkuanSlip = (
    nama: string,
    ic: string,
    kodRingkas: string
  ) => (
    <div className="mt-4 pt-3 border-t-2 border-dashed border-slate-500">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[9.5px] font-black uppercase tracking-wider text-slate-900">
          BORANG AKUAN PENERIMAAN LANTIKAN TUGAS RASMI ({kodRingkas})
        </p>
        <span className="text-[8.5px] font-semibold text-slate-500">
          [KERATAN AKUAN — KEMBALIKAN KEPADA PEJABAT / SU PENGURUSAN]
        </span>
      </div>
      <p className="text-[9.5px] text-slate-800 leading-relaxed mb-3">
        Saya, <span className="font-bold uppercase">{nama}</span> (No. KP:{' '}
        <span className="font-bold">{ic || '__________________'}</span>), dengan ini
        <span className="font-bold"> MENERIMA DAN MEMATUHI</span> pelantikan tugas
        rasmi seperti yang tersenarai dalam surat lantikan bertarikh{' '}
        <span className="font-bold">{formatMalayDate(tarikhSurat)}</span> dan
        berjanji akan melaksanakan tanggungjawab tersebut dengan penuh dedikasi serta
        berintegriti demi kecemerlangan sekolah.
      </p>
      <div className="grid grid-cols-3 gap-4 pt-2 text-[9px] text-slate-800">
        <div>
          <div className="h-8 border-b border-slate-700 mb-1" />
          <p className="font-bold">Tandatangan Guru</p>
          <p className="text-[8px] text-slate-500 truncate">Nama: {nama}</p>
        </div>
        <div>
          <div className="h-8 border-b border-slate-700 mb-1" />
          <p className="font-bold">Tarikh Diterima</p>
          <p className="text-[8px] text-slate-500">Sesi: {academicYear}</p>
        </div>
        <div>
          <div className="h-8 border-b border-slate-700 mb-1" />
          <p className="font-bold">Disahkan Oleh (Pejabat)</p>
          <p className="text-[8px] text-slate-500">Ruj: {rujukanKami}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Control Toolbar */}
      <div className="print:hidden bg-slate-900/90 border border-slate-800 rounded-3xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
                Modul 4 · SKPM Aspek 2.1.1
              </span>
              <span className="text-xs font-mono text-slate-400">
                {teacherDossiers.length} Guru Dilantik · {mysgItems.filter((i) => i.assignedTeacherName).length}/{mysgItems.length} Jawatan MySG Diisi
              </span>
            </div>
            <h3 className="text-lg font-black text-white mt-1">
              Penjana Surat Lantikan Jawatankuasa Rasmi MySG
            </h3>
            <p className="text-xs text-slate-400">
              Menjana Surat Lantikan Bersepadu (1 Guru = 1 Surat Lantikan + Lampiran Tugas 4 Teras MySG) atau Surat Lantikan Jawatan Tunggal lengkap dengan Keratan Akuan Penerimaan.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleBulkPrintAll}
              disabled={teacherDossiers.length === 0}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-amber-600/20 cursor-pointer"
            >
              <Users className="w-4 h-4" />
              Cetak Semua Guru ({teacherDossiers.length})
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-teal-600/20 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Cetak / PDF (A4)
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-blue-600/20 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Menyimpan...' : 'Simpan Rekod'}
            </button>
          </div>
        </div>

        {banner && (
          <div
            className={`px-4 py-2.5 rounded-xl text-xs font-semibold border flex items-center gap-2 ${
              banner.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                : banner.type === 'error'
                ? 'bg-rose-950/60 border-rose-700/60 text-rose-300'
                : 'bg-blue-950/60 border-blue-700/60 text-blue-300'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{banner.message}</span>
          </div>
        )}

        {/* Mode Switcher & Letter Metadata */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-2 border-t border-slate-800/80">
          <div className="lg:col-span-5 space-y-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Mod Surat Lantikan
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('INDIVIDU_BERSEPADU')}
                className={`px-3 py-2.5 rounded-xl text-xs font-bold border text-left transition cursor-pointer ${
                  mode === 'INDIVIDU_BERSEPADU'
                    ? 'bg-teal-600/20 border-teal-500 text-teal-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  <span>Mod Individu Bersepadu</span>
                </div>
                <p className="text-[10px] font-normal opacity-80 mt-0.5">
                  1 Guru · Semua Tugas 4 Teras MySG
                </p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('JAWATAN_TUNGGAL');
                  setPrintAllTeachers(false);
                }}
                className={`px-3 py-2.5 rounded-xl text-xs font-bold border text-left transition cursor-pointer ${
                  mode === 'JAWATAN_TUNGGAL'
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5" />
                  <span>Mod Jawatan Tunggal</span>
                </div>
                <p className="text-[10px] font-normal opacity-80 mt-0.5">
                  Berdasarkan Pilihan Unit Di Atas
                </p>
              </button>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-2">
            {mode === 'INDIVIDU_BERSEPADU' ? (
              <>
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Pilih Guru (Dossier MySG)
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] font-bold text-amber-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={printAllTeachers}
                      onChange={(e) => setPrintAllTeachers(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-amber-500"
                    />
                    Papar Semua ({teacherDossiers.length})
                  </label>
                </div>
                <select
                  value={selectedTeacherKey}
                  disabled={printAllTeachers}
                  onChange={(e) => setSelectedTeacherKey(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white disabled:opacity-50"
                >
                  {teacherDossiers.length === 0 ? (
                    <option value="">
                      Tiada guru diagihkan dalam MySG Jawatankuasa lagi
                    </option>
                  ) : (
                    teacherDossiers.map((d) => (
                      <option key={d.key} value={d.key}>
                        {d.teacherName} ({d.positions.length} jawatan · {d.totalMata} mata)
                      </option>
                    ))
                  )}
                </select>
              </>
            ) : (
              <>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Penerima Jawatan ({selectedItem.kodMySG})
                </label>
                <select
                  value={singleOverrideTeacherId}
                  onChange={(e) => setSingleOverrideTeacherId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                >
                  <option value="">
                    {selectedItem.assignedTeacherName
                      ? `Laluan MySG: ${selectedItem.assignedTeacherName}`
                      : '-- Pilih Guru Penerima --'}
                  </option>
                  {activeTeachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.position || 'Guru'})
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

          <div className="lg:col-span-3 grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                No. Rujukan
              </label>
              <input
                type="text"
                value={rujukanKami}
                onChange={(e) => setRujukanKami(e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Tarikh Surat
              </label>
              <input
                type="date"
                value={tarikhSurat}
                onChange={(e) => setTarikhSurat(e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Penandatangan (Guru Besar)
            </label>
            <input
              type="text"
              value={principalName}
              onChange={(e) => setPrincipalName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Catatan Rasmi Tambahan
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
            />
          </div>
        </div>
      </div>

      {/* PRINTABLE A4 PORTRAIT SHEET(S) */}
      {mode === 'INDIVIDU_BERSEPADU' ? (
        dossiersToRender.length === 0 ? (
          <div className="print:hidden bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center">
            <UserCheck className="w-10 h-10 text-amber-400 mx-auto mb-3" />
            <h4 className="text-sm font-bold text-white">
              Tiada Pengagihan Guru MySG Ditemui
            </h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
              Sila agihkan jawatan guru dalam{' '}
              <span className="font-bold text-amber-300">
                Master Data &rarr; Jawatankuasa &amp; Beban MySG
              </span>{' '}
              terlebih dahulu atau gunakan{' '}
              <span className="font-bold text-indigo-300">
                Mod Jawatan Tunggal
              </span>{' '}
              untuk menjana surat lantikan serta-merta.
            </p>
          </div>
        ) : (
          <div className="space-y-8 print:space-y-0">
            {dossiersToRender.map((dossier, idx) => {
              const refForTeacher = printAllTeachers
                ? `${rujukanKami}-${String(idx + 1).padStart(2, '0')}`
                : rujukanKami;
              return (
                <div
                  key={dossier.key}
                  className={`print-portrait-sheet bg-white text-slate-900 rounded-xl shadow-2xl mx-auto max-w-[210mm] p-8 sm:p-10 font-serif border border-slate-200 print:shadow-none print:border-0 print:p-0 ${
                    idx < dossiersToRender.length - 1 ? 'print-portrait-page' : ''
                  }`}
                >
                  {renderLetterhead(refForTeacher, tarikhSurat)}

                  <div className="text-[11px] leading-relaxed space-y-2.5">
                    <div>
                      <p className="font-bold uppercase text-slate-950">
                        {dossier.teacherName}
                      </p>
                      <p className="text-[10px] text-slate-700">
                        No. KP: {dossier.ic} · Jawatan / Gred: {dossier.position} (
                        {dossier.grade})
                      </p>
                      <p className="text-[10px] text-slate-700">
                        Melalui dan salinan: Fail Peribadi Guru &amp; Fail Jawatankuasa
                        Pengurusan Sekolah
                      </p>
                    </div>

                    <p className="pt-1">Tuan / Puan,</p>

                    <p className="font-black uppercase underline tracking-wide text-slate-950 text-[11.5px]">
                      PELANTIKAN RASMI JAWATANKUASA &amp; TUGAS KHAS SEKOLAH (MySG)
                      SESI AKADEMIK {academicYear}
                    </p>

                    <p className="text-justify">
                      Dengan hormatnya perkara di atas adalah dirujuk.
                    </p>

                    <p className="text-justify">
                      2. Sukacita dimaklumkan bahawa pihak pentadbiran{' '}
                      <span className="font-bold">{schoolName}</span> dengan ini melantik
                      tuan/puan untuk menganggotai dan menjalankan tugas rasmi bagi
                      jawatankuasa/portfolio di bawah{' '}
                      <span className="font-bold">
                        Garis Panduan Tugas Guru &amp; AKP (MySG KPM)
                      </span>{' '}
                      seperti yang diperincikan dalam jadual lampiran di bawah (Jumlah
                      Portfolio:{' '}
                      <span className="font-bold">
                        {dossier.positions.length} Jawatan Rasmi
                      </span>{' '}
                      | Indeks Beban Tugas:{' '}
                      <span className="font-bold">{dossier.totalMata} Mata</span>).
                    </p>

                    <div className="my-2">
                      <table className="w-full border-collapse border border-slate-800 text-[9.5px] font-sans">
                        <thead>
                          <tr className="bg-teal-900 text-white">
                            <th className="border border-slate-800 px-2 py-1.5 text-left w-24">
                              Teras &amp; Kod
                            </th>
                            <th className="border border-slate-800 px-2 py-1.5 text-left w-48">
                              Jawatankuasa &amp; Jawatan Rasmi
                            </th>
                            <th className="border border-slate-800 px-2 py-1.5 text-left">
                              Perincian Tugas &amp; Skop Utama (MySG)
                            </th>
                            <th className="border border-slate-800 px-1.5 py-1.5 text-center w-14">
                              Beban
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {PILLAR_ORDER.flatMap((pillar) => {
                            const itemsInPillar = dossier.positions.filter(
                              (p) => p.pillar === pillar
                            );
                            if (itemsInPillar.length === 0) return [];
                            return itemsInPillar.map((pos) => (
                              <tr key={pos.kodMySG} className="align-top">
                                <td className="border border-slate-400 px-2 py-1.5">
                                  <span className="block font-bold text-teal-900 text-[8.5px] uppercase">
                                    {PILLAR_DISPLAY_META[pillar].shortLabel}
                                  </span>
                                  <span className="font-mono text-[8.5px] text-slate-700">
                                    {pos.kodMySG}
                                  </span>
                                </td>
                                <td className="border border-slate-400 px-2 py-1.5">
                                  <span className="block font-bold text-slate-950">
                                    {pos.jawatanRasmi}
                                  </span>
                                  <span className="block text-[8.5px] text-slate-600">
                                    {pos.jawatankuasaInduk}
                                  </span>
                                </td>
                                <td className="border border-slate-400 px-2 py-1.5 text-slate-800 leading-snug">
                                  {pos.perincianTugas}
                                  {pos.sistemKPM && pos.sistemKPM !== '-' && (
                                    <span className="block text-[8px] text-teal-800 font-semibold mt-0.5">
                                      Sistem/SKPM: {pos.sistemKPM} ({pos.skpmStandardCode})
                                    </span>
                                  )}
                                </td>
                                <td className="border border-slate-400 px-1.5 py-1.5 text-center font-bold">
                                  {pos.mataBeban} M
                                </td>
                              </tr>
                            ));
                          })}
                        </tbody>
                      </table>
                    </div>

                    <p className="text-justify">
                      3. Tuan/puan dikehendaki melaksanakan tugas dengan mematuhi
                      ketetapan Standard Kualiti Pendidikan Malaysia (SKPM), pekeliling
                      ikhtisas KPM yang berkuat kuasa, serta menghantar evidens
                      pelaksanaan mengikut takwim sekolah. {notes}
                    </p>

                    <p className="pt-1">Sekian, terima kasih.</p>

                    <div className="pt-1 font-bold uppercase text-[10px] space-y-0.5 text-slate-950">
                      <p>&ldquo;MALAYSIA MADANI&rdquo;</p>
                      <p>&ldquo;BERKHIDMAT UNTUK NEGARA&rdquo;</p>
                    </div>

                    <div className="pt-4">
                      <p className="text-[10.5px]">Saya yang menjalankan amanah,</p>
                      <div className="h-10" />
                      <p className="font-black uppercase text-[11px] text-slate-950">
                        ({principalName})
                      </p>
                      <p className="text-[10px] font-semibold text-slate-700">
                        Guru Besar · {schoolName} ({schoolCode})
                      </p>
                    </div>
                  </div>

                  {renderAkuanSlip(
                    dossier.teacherName,
                    dossier.ic,
                    `${dossier.positions.length} PORTFOLIO MySG`
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="print-portrait-sheet bg-white text-slate-900 rounded-xl shadow-2xl mx-auto max-w-[210mm] p-8 sm:p-10 font-serif border border-slate-200 print:shadow-none print:border-0 print:p-0">
          {renderLetterhead(rujukanKami, tarikhSurat)}

          <div className="text-[11.5px] leading-relaxed space-y-3">
            <div>
              <p className="font-bold uppercase text-slate-950">
                {activeSingleTeacher.teacherName}
              </p>
              <p className="text-[10.5px] text-slate-700">
                No. KP: {activeSingleTeacher.ic} · Jawatan / Gred:{' '}
                {activeSingleTeacher.position} ({activeSingleTeacher.grade})
              </p>
              <p className="text-[10.5px] text-slate-700">{schoolName}</p>
            </div>

            <p className="pt-1">Tuan / Puan,</p>

            <p className="font-black uppercase underline tracking-wide text-slate-950 text-[12px]">
              PELANTIKAN SEBAGAI {selectedItem.jawatanRasmi.toUpperCase()} (
              {selectedItem.kodMySG}) SESI AKADEMIK {academicYear}
            </p>

            <p className="text-justify">
              Dengan hormatnya perkara di atas adalah dirujuk.
            </p>

            <p className="text-justify">
              2. Sukacita dimaklumkan bahawa pihak pentadbiran{' '}
              <span className="font-bold">{schoolName}</span> dengan penuh
              kepercayaan melantik tuan/puan memegang jawatan rasmi di bawah{' '}
              <span className="font-bold">
                {PILLAR_DISPLAY_META[selectedItem.pillar].label}
              </span>{' '}
              seperti butiran berikut:
            </p>

            <div className="bg-slate-50 border border-slate-400 rounded-lg p-3.5 text-[10.5px] font-sans space-y-1.5">
              <div className="grid grid-cols-3 gap-2">
                <span className="font-bold text-slate-600">Jawatankuasa Induk</span>
                <span className="col-span-2 font-bold text-slate-950">
                  : {selectedItem.jawatankuasaInduk}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="font-bold text-slate-600">Jawatan Rasmi</span>
                <span className="col-span-2 font-bold text-teal-900">
                  : {selectedItem.jawatanRasmi}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="font-bold text-slate-600">Kod MySG &amp; SKPM</span>
                <span className="col-span-2 font-mono text-slate-800">
                  : {selectedItem.kodMySG} · {selectedItem.skpmStandardCode} (
                  {selectedItem.tahapBeban})
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-200">
                <span className="font-bold text-slate-600">
                  Perincian Tugas &amp; Skop Utama
                </span>
                <span className="col-span-2 text-slate-900 leading-snug">
                  : {selectedItem.perincianTugas}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="font-bold text-slate-600">Sistem / Evidens KPM</span>
                <span className="col-span-2 text-slate-800">
                  : {selectedItem.sistemKPM}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="font-bold text-rose-700">Peringatan Kritikal</span>
                <span className="col-span-2 text-rose-900 font-semibold">
                  : {selectedItem.peringatanKritikal}
                </span>
              </div>
            </div>

            <p className="text-justify">
              3. Pihak sekolah amat yakin dengan keupayaan, komitmen dan
              profesionalisme tuan/puan dalam memacu kecemerlangan unit ini. {notes}
            </p>

            <p className="pt-1">Sekian, terima kasih.</p>

            <div className="pt-1 font-bold uppercase text-[10.5px] space-y-0.5 text-slate-950">
              <p>&ldquo;MALAYSIA MADANI&rdquo;</p>
              <p>&ldquo;BERKHIDMAT UNTUK NEGARA&rdquo;</p>
            </div>

            <div className="pt-5">
              <p>Saya yang menjalankan amanah,</p>
              <div className="h-12" />
              <p className="font-black uppercase text-[11.5px] text-slate-950">
                ({principalName})
              </p>
              <p className="text-[10.5px] font-semibold text-slate-700">
                Guru Besar · {schoolName} ({schoolCode})
              </p>
            </div>
          </div>

          {renderAkuanSlip(
            activeSingleTeacher.teacherName,
            activeSingleTeacher.ic,
            selectedItem.kodMySG
          )}
        </div>
      )}

      {/* Saved Archive List */}
      <div className="print:hidden bg-slate-900/90 border border-slate-800 rounded-3xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-black text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-amber-400" />
            Arkib Rekod Surat Lantikan MySG ({savedDocs.length})
          </h4>
        </div>

        {savedDocs.length === 0 ? (
          <p className="text-xs text-slate-500">
            Belum ada rekod surat lantikan yang disimpan untuk sekolah ini.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {savedDocs.map((d) => (
              <div
                key={d.id}
                className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between gap-2"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/60 text-[10px] font-bold">
                      {d.mode === 'INDIVIDU_BERSEPADU'
                        ? 'Bersepadu'
                        : d.kodMySG || 'Tunggal'}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {d.tarikhSurat}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-white truncate">
                    {d.teacherName || d.jawatanRasmi}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate font-mono">
                    {d.rujukanKami}
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/70">
                  <button
                    type="button"
                    onClick={() => handleLoadSaved(d)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-teal-300 cursor-pointer"
                  >
                    Buka / Cetak
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteDoc(d.id)}
                    title="Padam Rekod"
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ModuleSuratLantikan;
