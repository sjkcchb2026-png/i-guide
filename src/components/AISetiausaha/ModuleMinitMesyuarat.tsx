import React, { useMemo, useState } from 'react';
import {
  CheckSquare,
  ClipboardList,
  Edit3,
  FileDown,
  FileText,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { auth } from '../../firebase';
import { PersonnelProfile } from '../../types';
import { MySGJawatankuasaItem } from '../../utils/mysgJawatankuasaCatalog';
import SchoolLogo from '../SchoolLogo';
import {
  MemoMesyuaratDocument,
  MinitAgendaEntry,
  MinitMesyuaratDocument,
} from './types';

interface ModuleMinitMesyuaratProps {
  schoolCode: string;
  schoolName: string;
  schoolLogo?: string;
  academicYear: string;
  currentUserName: string;
  personnel: PersonnelProfile[];
  selectedItem: MySGJawatankuasaItem;
  savedMemos: MemoMesyuaratDocument[];
  savedDocs: MinitMesyuaratDocument[];
  onSaveDoc: (
    doc: Partial<MinitMesyuaratDocument> & { docKind: 'MINIT' }
  ) => Promise<MinitMesyuaratDocument | null>;
  onDeleteDoc: (id: string) => Promise<void>;
}

function buildDefaultEntries(committeeName: string): MinitAgendaEntry[] {
  return [
    {
      id: 'sec_1',
      paraNo: '1.0',
      agendaTitle: 'PERUTUSAN PENGERUSI',
      rawNotes:
        'Pengerusi mengalu-alukan kehadiran ahli mesyuarat dan menekankan kerjasama berpasukan.',
      formalText:
        'Pengerusi memulakan mesyuarat dengan mengucapkan ribuan terima kasih atas kehadiran semua ahli mesyuarat dan mengingatkan kepentingan komitmen terhadap kecemerlangan sekolah.',
      tindakanType: 'MAKLUMAN',
      tindakanOwner: 'Makluman',
      maklumBalasStatus: '',
      mukaSurat: '1',
    },
    {
      id: 'sec_2',
      paraNo: '2.0',
      agendaTitle: 'PENGESAHAN MINIT MESYUARAT YANG LALU',
      rawNotes: 'Minit disahkan tanpa pindaan.',
      formalText:
        'Minit mesyuarat yang lalu dibentangkan dan disahkan tanpa sebarang pindaan.',
      tindakanType: 'MAKLUMAN',
      tindakanOwner: 'Makluman',
      maklumBalasStatus: '',
      mukaSurat: '1',
    },
    {
      id: 'sec_3',
      paraNo: '3.0',
      agendaTitle: 'PERKARA-PERKARA BERBANGKIT',
      rawNotes: 'Tiada perkara berbangkit.',
      formalText:
        'Tiada perkara berbangkit dibincangkan daripada minit mesyuarat yang lalu.',
      tindakanType: 'MAKLUMAN',
      tindakanOwner: 'Makluman',
      maklumBalasStatus: '',
      mukaSurat: '1',
    },
    {
      id: 'sec_4_1',
      paraNo: '4.1',
      agendaTitle: `PERANCANGAN STRATEGIK & TAKWIM ${committeeName.toUpperCase()}`,
      rawNotes:
        'Semua guru penyelaras perlu kemaskini rekod dan hantar OPR selepas setiap aktiviti.',
      formalText: `Mesyuarat mengambil maklum dan memutuskan agar semua guru penyelaras di bawah ${committeeName} melaksanakan program mengikut takwim yang ditetapkan serta memuat naik laporan OPR SKPM selepas pelaksanaan aktiviti.`,
      tindakanType: 'TINDAKAN',
      tindakanOwner: 'Semua Guru Penyelaras',
      maklumBalasStatus: 'Dalam tindakan pelaksanaan mengikut takwim.',
      mukaSurat: '2',
    },
    {
      id: 'sec_5',
      paraNo: '5.0',
      agendaTitle: 'HAL-HAL LAIN',
      rawNotes: 'Kerjasama semua guru diminta untuk memastikan eviden lengkap.',
      formalText:
        'Pengerusi mengingatkan ahli jawatankuasa agar memastikan dokumentasi evidens SKPM dan maklum balas tindakan dikemas kini sebelum tarikh tutup.',
      tindakanType: 'TINDAKAN',
      tindakanOwner: 'Semua Ahli Jawatankuasa',
      maklumBalasStatus: 'Akan disemak dalam mesyuarat berikutnya.',
      mukaSurat: '2',
    },
    {
      id: 'sec_6',
      paraNo: '6.0',
      agendaTitle: 'PENUTUP',
      rawNotes: 'Mesyuarat ditangguhkan dengan ucapan terima kasih.',
      formalText:
        'Mesyuarat ditangguhkan pada jam 3.00 petang dengan ucapan terima kasih daripada Pengerusi.',
      tindakanType: 'MAKLUMAN',
      tindakanOwner: 'Makluman',
      maklumBalasStatus: '',
      mukaSurat: '2',
    },
  ];
}

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

export const ModuleMinitMesyuarat: React.FC<ModuleMinitMesyuaratProps> = ({
  schoolCode,
  schoolName,
  schoolLogo,
  academicYear,
  currentUserName,
  personnel,
  selectedItem,
  savedMemos,
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

  const yearShort = (academicYear || '2026').slice(0, 4);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [linkedMemoId, setLinkedMemoId] = useState<string>('');
  const [printMode, setPrintMode] = useState<'BOTH' | 'MINIT_ONLY' | 'MAKLUM_BALAS_ONLY'>('BOTH');

  const [tajukMesyuarat, setTajukMesyuarat] = useState(
    `MINIT MESYUARAT ${selectedItem.jawatankuasaInduk.toUpperCase()} BIL. 1/${yearShort}`
  );
  const [bilangan, setBilangan] = useState(`Bil. 1/${yearShort}`);
  const [tarikh, setTarikh] = useState(new Date().toISOString().slice(0, 10));
  const [masa, setMasa] = useState('01:30 petang – 03:00 petang');
  const [tempat, setTempat] = useState(`Bilik Mesyuarat ${schoolName}`);
  const [pengerusi, setPengerusi] = useState(
    (principalProfile?.name || 'GURU BESAR').toUpperCase()
  );
  const [pencatat, setPencatat] = useState(
    (selectedItem.assignedTeacherName || currentUserName).toUpperCase()
  );

  const [hadirNames, setHadirNames] = useState<string[]>(() =>
    activeTeachers.map((t) => t.name.toUpperCase())
  );
  const [tidakHadirBersebab, setTidakHadirBersebab] = useState<string[]>([]);
  const [turutHadirRaw, setTurutHadirRaw] = useState('');

  const [agendaEntries, setAgendaEntries] = useState<MinitAgendaEntry[]>(() =>
    buildDefaultEntries(selectedItem.jawatankuasaInduk)
  );
  const [disahkanOlehName, setDisahkanOlehName] = useState(
    (principalProfile?.name || 'GURU BESAR').toUpperCase()
  );
  const [disahkanOlehTitle, setDisahkanOlehTitle] = useState('Guru Besar');

  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleImportFromMemo = (memoId: string) => {
    const memo = savedMemos.find((m) => m.id === memoId);
    if (!memo) return;
    setLinkedMemoId(memo.id);
    setBilangan(memo.bilangan);
    setTajukMesyuarat(
      memo.tajukMesyuarat.startsWith('MINIT')
        ? memo.tajukMesyuarat
        : `MINIT ${memo.tajukMesyuarat}`
    );
    setTarikh(memo.tarikhMesyuarat);
    setMasa(memo.masaMesyuarat);
    setTempat(memo.tempatMesyuarat);
    setPengerusi(memo.pengerusiName);
    setDisahkanOlehName(memo.principalName);

    const importedFokus: MinitAgendaEntry[] = (memo.agendaFokusUtama || []).map(
      (ag, idx) => ({
        id: `sec_4_${idx + 1}`,
        paraNo: `4.${idx + 1}`,
        agendaTitle: ag.toUpperCase(),
        rawNotes: '',
        formalText: `Mesyuarat membincangkan perkara berhubung ${ag} dan bersetuju agar tindakan susulan dilaksanakan oleh ahli jawatankuasa terlibat.`,
        tindakanType: 'TINDAKAN',
        tindakanOwner: 'Penyelaras Berkaitan',
        maklumBalasStatus: 'Dalam tindakan.',
        mukaSurat: '2',
      })
    );

    const defaults = buildDefaultEntries(memo.jawatankuasaInduk);
    const merged: MinitAgendaEntry[] = [
      defaults[0],
      defaults[1],
      defaults[2],
      ...importedFokus,
      defaults[4],
      defaults[5],
    ];
    setAgendaEntries(merged);
    setBanner({
      type: 'success',
      text: `Maklumat & agenda dari Memo "${memo.tajukMesyuarat}" berjaya diimport!`,
    });
  };

  const handleToggleAttendance = (teacherNameUpper: string, target: 'HADIR' | 'TIDAK_HADIR') => {
    if (target === 'HADIR') {
      setTidakHadirBersebab((prev) =>
        prev.filter((n) => !n.startsWith(teacherNameUpper))
      );
      setHadirNames((prev) =>
        prev.includes(teacherNameUpper) ? prev : [...prev, teacherNameUpper]
      );
    } else {
      setHadirNames((prev) => prev.filter((n) => n !== teacherNameUpper));
      const entry = `${teacherNameUpper} (Bersebab / Urusan Rasmi)`;
      setTidakHadirBersebab((prev) =>
        prev.some((n) => n.startsWith(teacherNameUpper)) ? prev : [...prev, entry]
      );
    }
  };

  const handleAddAgendaItem = () => {
    const idx = agendaEntries.length + 1;
    setAgendaEntries((prev) => [
      ...prev,
      {
        id: `sec_custom_${Date.now()}`,
        paraNo: `4.${idx}`,
        agendaTitle: 'PERKARA PERBINCANGAN TAMBAHAN',
        rawNotes: '',
        formalText: '',
        tindakanType: 'TINDAKAN',
        tindakanOwner: 'Semua Guru',
        maklumBalasStatus: '',
        mukaSurat: '2',
      },
    ]);
  };

  const handleUpdateEntry = (id: string, patch: Partial<MinitAgendaEntry>) => {
    setAgendaEntries((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const handleRemoveEntry = (id: string) => {
    setAgendaEntries((prev) => prev.filter((item) => item.id !== id));
  };

  const handleFormalizeWithAI = async () => {
    setAiLoading(true);
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
          action: 'MINIT_FORMALIZE',
          payload: {
            meetingTitle: tajukMesyuarat,
            committeeName: selectedItem.jawatankuasaInduk,
            sections: agendaEntries,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menjana minit formal AI.');
      const entries = Array.isArray(data.entries) ? data.entries : [];
      if (entries.length > 0) {
        const map = new Map<string, string>();
        entries.forEach((e: any) => {
          if (e?.id && e?.formalText) map.set(String(e.id), String(e.formalText));
        });
        setAgendaEntries((prev) =>
          prev.map((item) => ({
            ...item,
            formalText: map.get(item.id) || item.formalText,
          }))
        );
        setBanner({
          type: 'success',
          text:
            data.source === 'gemini'
              ? 'Semua catatan minit telah dikembangkan kepada Bahasa Melayu rasmi PKPA Bil. 2/1991 oleh Gemini AI.'
              : 'Minit mesyuarat berstruktur PKPA Bil. 2/1991 telah dikemaskini.',
        });
      }
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Ralat AI Setiausaha.' });
    } finally {
      setAiLoading(false);
    }
  };

  const handleSaveMinit = async () => {
    if (!tajukMesyuarat.trim()) {
      setBanner({ type: 'error', text: 'Sila isi Tajuk Minit Mesyuarat.' });
      return;
    }
    setSaving(true);
    setBanner(null);
    const saved = await onSaveDoc({
      id: editingId || undefined,
      docKind: 'MINIT',
      academicYear,
      linkedMemoId: linkedMemoId || undefined,
      pillar: selectedItem.pillar,
      kodMySG: selectedItem.kodMySG,
      jawatankuasaInduk: selectedItem.jawatankuasaInduk,
      tajukMesyuarat: tajukMesyuarat.trim().toUpperCase(),
      bilangan,
      tarikh,
      masa,
      tempat,
      pengerusi: pengerusi.trim().toUpperCase(),
      pencatat: pencatat.trim().toUpperCase(),
      hadirNames,
      tidakHadirBersebab,
      turutHadir: turutHadirRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      agendaEntries,
      disahkanOlehName: disahkanOlehName.trim().toUpperCase(),
      disahkanOlehTitle: disahkanOlehTitle.trim(),
    });
    setSaving(false);
    if (saved) {
      setEditingId(saved.id);
      setBanner({
        type: 'success',
        text: `Minit & Borang Maklum Balas "${saved.tajukMesyuarat}" telah disimpan.`,
      });
    }
  };

  const handleLoadMinit = (m: MinitMesyuaratDocument) => {
    setEditingId(m.id);
    setLinkedMemoId(m.linkedMemoId || '');
    setTajukMesyuarat(m.tajukMesyuarat);
    setBilangan(m.bilangan);
    setTarikh(m.tarikh);
    setMasa(m.masa);
    setTempat(m.tempat);
    setPengerusi(m.pengerusi);
    setPencatat(m.pencatat);
    setHadirNames(m.hadirNames || []);
    setTidakHadirBersebab(m.tidakHadirBersebab || []);
    setTurutHadirRaw((m.turutHadir || []).join(', '));
    setAgendaEntries(m.agendaEntries || []);
    setDisahkanOlehName(m.disahkanOlehName);
    setDisahkanOlehTitle(m.disahkanOlehTitle);
    setBanner({ type: 'success', text: `Minit "${m.tajukMesyuarat}" dimuatkan.` });
  };

  const maklumBalasItems = useMemo(
    () => agendaEntries.filter((e) => e.tindakanType === 'TINDAKAN'),
    [agendaEntries]
  );

  return (
    <div className="space-y-6">
      {/* TOP BAR: IMPORT FROM MEMO & PRINT MODE SWITCHER */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-black uppercase text-indigo-300">
            <FileDown className="w-4 h-4" />
            <span>Import Memo:</span>
          </div>
          <select
            value={linkedMemoId}
            onChange={(e) => handleImportFromMemo(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none max-w-xs"
          >
            <option value="">-- Pilih Memo Tersimpan (1-Klik Import) --</option>
            {savedMemos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.rujukanKami} · {m.tajukMesyuarat}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPrintMode('BOTH')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
              printMode === 'BOTH'
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-slate-950 border-slate-800 text-slate-400'
            }`}
          >
            Minit + Maklum Balas
          </button>
          <button
            type="button"
            onClick={() => setPrintMode('MINIT_ONLY')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
              printMode === 'MINIT_ONLY'
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-slate-950 border-slate-800 text-slate-400'
            }`}
          >
            Minit Sahaja
          </button>
          <button
            type="button"
            onClick={() => setPrintMode('MAKLUM_BALAS_ONLY')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
              printMode === 'MAKLUM_BALAS_ONLY'
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-slate-950 border-slate-800 text-slate-400'
            }`}
          >
            Borang Maklum Balas Sahaja
          </button>
        </div>
      </div>

      {/* SPLIT WORKSPACE: EDITOR + PRINTABLE PKPA DOCUMENTS */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT EDITOR */}
        <div className="xl:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5 print:hidden">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h4 className="text-sm font-black uppercase text-white">
                Editor Minit Mesyuarat (PKPA Bil. 2/1991)
              </h4>
              <p className="text-[11px] text-slate-400">
                Catat poin ringkas (中文 / BM) dan tukar ke format rasmi KPM.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {editingId && (
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                  title="Minit Baharu"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveMinit}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase cursor-pointer disabled:opacity-50"
              >
                {saving ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Simpan Minit</span>
              </button>
            </div>
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

          {/* Header fields */}
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-black uppercase text-slate-300 block mb-1">
                Tajuk Minit Mesyuarat:
              </label>
              <input
                type="text"
                value={tajukMesyuarat}
                onChange={(e) => setTajukMesyuarat(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none"
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
                <label className="text-[11px] font-bold text-slate-400 block mb-1">Pengerusi:</label>
                <input
                  type="text"
                  value={pengerusi}
                  onChange={(e) => setPengerusi(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">Pencatat (Setiausaha):</label>
                <input
                  type="text"
                  value={pencatat}
                  onChange={(e) => setPencatat(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">Turut Hadir (jika ada):</label>
                <input
                  type="text"
                  value={turutHadirRaw}
                  onChange={(e) => setTurutHadirRaw(e.target.value)}
                  placeholder="Pegawai PPD / YDP PIBG..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>
            </div>
          </div>

          {/* Attendance Toggles from Profil Guru */}
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase text-slate-300 flex items-center gap-1.5">
                <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                Kehadiran Ahli ({hadirNames.length} Hadir / {tidakHadirBersebab.length} Bersebab)
              </span>
              <button
                type="button"
                onClick={() => {
                  setHadirNames(activeTeachers.map((t) => t.name.toUpperCase()));
                  setTidakHadirBersebab([]);
                }}
                className="text-[10px] font-bold text-teal-400 hover:underline cursor-pointer"
              >
                Tanda Semua Hadir
              </button>
            </div>
            <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
              {activeTeachers.map((t) => {
                const upperName = t.name.toUpperCase();
                const isHadir = hadirNames.includes(upperName);
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-2 text-[11px] px-2 py-1 rounded bg-slate-900/70"
                  >
                    <span className="text-slate-200 truncate">{upperName}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleAttendance(upperName, 'HADIR')}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                          isHadir
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        Hadir
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleAttendance(upperName, 'TIDAK_HADIR')}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                          !isHadir
                            ? 'bg-amber-600 text-white'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        Bersebab
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bilingual AI Minutes Formalizer */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-indigo-300">
                Butiran Agenda &amp; Tindakan ({agendaEntries.length} Item)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleFormalizeWithAI}
                  disabled={aiLoading}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-black uppercase flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  {aiLoading ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  )}
                  <span>AI Rasmi PKPA</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddAgendaItem}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Tambah
                </button>
              </div>
            </div>

            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {agendaEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={entry.paraNo}
                      onChange={(e) => handleUpdateEntry(entry.id, { paraNo: e.target.value })}
                      className="w-16 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs font-mono font-bold text-indigo-300 outline-none"
                    />
                    <input
                      type="text"
                      value={entry.agendaTitle}
                      onChange={(e) =>
                        handleUpdateEntry(entry.id, { agendaTitle: e.target.value })
                      }
                      className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs font-bold text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveEntry(entry.id)}
                      className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-0.5">
                      Nota Ringkas / Kata Kunci (中文 / BM):
                    </label>
                    <input
                      type="text"
                      value={entry.rawNotes}
                      onChange={(e) => handleUpdateEntry(entry.id, { rawNotes: e.target.value })}
                      placeholder="cth: 下个月进行阅读比赛，陈老师负责出题"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-amber-200 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-0.5">
                      Teks Minit Rasmi (PKPA Bil. 2/1991):
                    </label>
                    <textarea
                      rows={2}
                      value={entry.formalText}
                      onChange={(e) => handleUpdateEntry(entry.id, { formalText: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="flex items-center gap-1.5">
                      <select
                        value={entry.tindakanType}
                        onChange={(e) =>
                          handleUpdateEntry(entry.id, {
                            tindakanType: e.target.value as 'MAKLUMAN' | 'TINDAKAN',
                            tindakanOwner:
                              e.target.value === 'MAKLUMAN'
                                ? 'Makluman'
                                : entry.tindakanOwner === 'Makluman'
                                ? 'Semua Guru'
                                : entry.tindakanOwner,
                          })
                        }
                        className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] font-bold text-white outline-none"
                      >
                        <option value="MAKLUMAN">MAKLUMAN</option>
                        <option value="TINDAKAN">TINDAKAN</option>
                      </select>
                      <input
                        type="text"
                        value={entry.tindakanOwner}
                        onChange={(e) =>
                          handleUpdateEntry(entry.id, { tindakanOwner: e.target.value })
                        }
                        placeholder="Pelaksana (cth: Ketua Panitia)"
                        className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-200 outline-none"
                      />
                    </div>
                    {entry.tindakanType === 'TINDAKAN' && (
                      <input
                        type="text"
                        value={entry.maklumBalasStatus}
                        onChange={(e) =>
                          handleUpdateEntry(entry.id, { maklumBalasStatus: e.target.value })
                        }
                        placeholder="Status Maklum Balas..."
                        className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-emerald-300 outline-none"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: A4 PRINTABLE PKPA MINIT + BORANG MAKLUM BALAS */}
        <div className="xl:col-span-7 space-y-6">
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-2xl px-4 py-2.5 print:hidden">
            <span className="text-xs font-bold text-slate-300">
              Pratonton Rasmi PKPA Bil. 2/1991 &amp; Borang Maklum Balas (A4)
            </span>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak / Eksport PDF (A4)</span>
            </button>
          </div>

          {/* SHEET 1: MINIT MESYUARAT */}
          {(printMode === 'BOTH' || printMode === 'MINIT_ONLY') && (
            <div className="print-portrait-sheet print-portrait-page bg-white text-slate-900 rounded-2xl shadow-2xl border border-slate-200 max-w-[794px] mx-auto p-10 space-y-5 text-[11.5px] leading-relaxed font-serif">
              {/* Header */}
              <div className="flex items-center gap-4 border-b-2 border-slate-900 pb-3">
                <SchoolLogo
                  src={schoolLogo}
                  schoolCode={schoolCode}
                  className="w-14 h-14 bg-white border-slate-300"
                />
                <div className="flex-1 text-center">
                  <div className="text-sm font-black uppercase tracking-wide font-sans">
                    {schoolName} ({schoolCode})
                  </div>
                  <div className="text-xs font-black uppercase underline mt-0.5 font-sans">
                    {tajukMesyuarat}
                  </div>
                </div>
              </div>

              {/* Meeting Details Table */}
              <table className="w-full text-[11px] font-sans border border-slate-300">
                <tbody>
                  <tr className="border-b border-slate-300">
                    <td className="w-32 px-3 py-1.5 font-bold bg-slate-50 border-r border-slate-300">
                      Tarikh
                    </td>
                    <td className="px-3 py-1.5">{formatMalayDate(tarikh)}</td>
                    <td className="w-24 px-3 py-1.5 font-bold bg-slate-50 border-x border-slate-300">
                      Masa
                    </td>
                    <td className="px-3 py-1.5">{masa}</td>
                  </tr>
                  <tr className="border-b border-slate-300">
                    <td className="px-3 py-1.5 font-bold bg-slate-50 border-r border-slate-300">
                      Tempat
                    </td>
                    <td className="px-3 py-1.5" colSpan={3}>
                      {tempat}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-1.5 font-bold bg-slate-50 border-r border-slate-300">
                      Pengerusi
                    </td>
                    <td className="px-3 py-1.5">{pengerusi}</td>
                    <td className="px-3 py-1.5 font-bold bg-slate-50 border-x border-slate-300">
                      Pencatat
                    </td>
                    <td className="px-3 py-1.5">{pencatat}</td>
                  </tr>
                </tbody>
              </table>

              {/* Attendance */}
              <div className="space-y-2 text-[11px]">
                <div>
                  <span className="font-bold uppercase font-sans">KEHADIRAN ({hadirNames.length} ORANG):</span>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1 pl-2">
                    {hadirNames.map((n, i) => (
                      <div key={i}>
                        {i + 1}. {n}
                      </div>
                    ))}
                  </div>
                </div>
                {tidakHadirBersebab.length > 0 && (
                  <div>
                    <span className="font-bold uppercase font-sans">
                      TIDAK HADIR BERSEBAB ({tidakHadirBersebab.length} ORANG):
                    </span>
                    <div className="pl-2 mt-0.5">
                      {tidakHadirBersebab.map((n, i) => (
                        <div key={i}>
                          {i + 1}. {n}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {turutHadirRaw.trim() && (
                  <div>
                    <span className="font-bold uppercase font-sans">TURUT HADIR:</span>{' '}
                    {turutHadirRaw}
                  </div>
                )}
              </div>

              {/* PKPA Minutes Table with Right-Hand TINDAKAN Column */}
              <table className="w-full border-collapse border border-slate-800 text-[11px]">
                <thead>
                  <tr className="bg-slate-100 font-sans text-[10px] uppercase">
                    <th className="border border-slate-800 px-2 py-1.5 w-14 text-center">Bil.</th>
                    <th className="border border-slate-800 px-3 py-1.5 text-left">
                      Agenda / Perkara &amp; Keputusan Mesyuarat
                    </th>
                    <th className="border border-slate-800 px-2 py-1.5 w-32 text-center">
                      Tindakan
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {agendaEntries.map((e) => (
                    <tr key={e.id} className="align-top">
                      <td className="border border-slate-800 px-2 py-2 text-center font-bold font-sans">
                        {e.paraNo}
                      </td>
                      <td className="border border-slate-800 px-3 py-2 space-y-1">
                        <div className="font-bold uppercase font-sans text-[10.5px]">
                          {e.agendaTitle}
                        </div>
                        <p className="text-justify">{e.formalText || e.rawNotes}</p>
                      </td>
                      <td className="border border-slate-800 px-2 py-2 text-center font-sans text-[10px] font-bold">
                        {e.tindakanType === 'MAKLUMAN' ? (
                          <span className="text-slate-600">Makluman</span>
                        ) : (
                          <span className="text-slate-950 uppercase">{e.tindakanOwner}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Sign-offs */}
              <div className="grid grid-cols-2 gap-10 pt-4 text-[11px] font-sans">
                <div>
                  <p>Disediakan oleh:</p>
                  <div className="h-12" />
                  <p className="font-bold uppercase">{pencatat}</p>
                  <p className="text-[10px] text-slate-600">
                    Setiausaha, {selectedItem.jawatankuasaInduk}
                  </p>
                </div>
                <div>
                  <p>Disemak &amp; Disahkan oleh:</p>
                  <div className="h-12" />
                  <p className="font-bold uppercase">{disahkanOlehName}</p>
                  <p className="text-[10px] text-slate-600">
                    {disahkanOlehTitle}, {schoolName}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* SHEET 2: BORANG MAKLUM BALAS MINIT MESYUARAT */}
          {(printMode === 'BOTH' || printMode === 'MAKLUM_BALAS_ONLY') && (
            <div className="print-portrait-sheet bg-white text-slate-900 rounded-2xl shadow-2xl border border-slate-200 max-w-[794px] mx-auto p-10 space-y-4 text-[11px] font-sans">
              <div className="text-center border-b-2 border-slate-900 pb-3">
                <div className="text-xs font-black uppercase text-slate-600">
                  LAMPIRAN PKPA BIL. 2/1991 · {schoolName} ({schoolCode})
                </div>
                <h3 className="text-sm font-black uppercase tracking-wide mt-1">
                  BORANG MAKLUM BALAS MINIT MESYUARAT
                </h3>
                <p className="text-[11px] font-bold text-slate-700 mt-0.5">
                  {tajukMesyuarat} ({formatMalayDate(tarikh)})
                </p>
              </div>

              <table className="w-full border-collapse border border-slate-800 text-[10.5px]">
                <thead>
                  <tr className="bg-slate-100 uppercase text-[10px]">
                    <th className="border border-slate-800 px-2 py-2 w-14 text-center">M/S</th>
                    <th className="border border-slate-800 px-2 py-2 w-14 text-center">Para</th>
                    <th className="border border-slate-800 px-3 py-2 text-left">
                      Perkara / Keputusan Mesyuarat
                    </th>
                    <th className="border border-slate-800 px-2 py-2 w-32 text-left">
                      Tindakan
                    </th>
                    <th className="border border-slate-800 px-3 py-2 w-44 text-left">
                      Maklum Balas Terkini
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {maklumBalasItems.map((item) => (
                    <tr key={item.id} className="align-top">
                      <td className="border border-slate-800 px-2 py-2 text-center font-mono">
                        {item.mukaSurat || '2'}
                      </td>
                      <td className="border border-slate-800 px-2 py-2 text-center font-bold">
                        {item.paraNo}
                      </td>
                      <td className="border border-slate-800 px-3 py-2">
                        <div className="font-bold uppercase text-[10px] mb-0.5">
                          {item.agendaTitle}
                        </div>
                        <div className="text-slate-700">{item.formalText || item.rawNotes}</div>
                      </td>
                      <td className="border border-slate-800 px-2 py-2 font-bold">
                        {item.tindakanOwner}
                      </td>
                      <td className="border border-slate-800 px-3 py-2 text-slate-800">
                        {item.maklumBalasStatus || 'Belum dikemaskini'}
                      </td>
                    </tr>
                  ))}
                  {maklumBalasItems.length === 0 && (
                    <tr>
                      <td colSpan={5} className="border border-slate-800 p-6 text-center italic">
                        Tiada item bertanda TINDAKAN dalam minit mesyuarat ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* SAVED MINUTES ARCHIVE */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 print:hidden">
        <h4 className="text-sm font-black uppercase text-white flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-indigo-400" />
          Arkib Minit Mesyuarat &amp; Borang Maklum Balas ({savedDocs.length})
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {savedDocs.map((m) => (
            <div
              key={m.id}
              className="bg-slate-950 border border-slate-800 hover:border-indigo-600/60 rounded-2xl p-4 flex flex-col justify-between gap-3"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] font-bold">
                  <span className="text-indigo-300">{m.kodMySG}</span>
                  <span className="text-slate-400 font-mono">{m.tarikh}</span>
                </div>
                <h5 className="text-xs font-black text-white uppercase line-clamp-2">
                  {m.tajukMesyuarat}
                </h5>
                <p className="text-[11px] text-slate-400 truncate">
                  {m.hadirNames?.length || 0} Hadir ·{' '}
                  {(m.agendaEntries || []).filter((e) => e.tindakanType === 'TINDAKAN').length}{' '}
                  Tindakan Maklum Balas
                </p>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                <button
                  type="button"
                  onClick={() => handleLoadMinit(m)}
                  className="text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Buka / Cetak
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteDoc(m.id)}
                  className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                  title="Padam"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
          {savedDocs.length === 0 && (
            <div className="col-span-full py-6 text-center text-xs text-slate-500 italic">
              Belum ada Minit Mesyuarat disimpan.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModuleMinitMesyuarat;
