import React, { useEffect, useMemo, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import {
  Bell,
  CheckCircle2,
  Copy,
  Edit3,
  ExternalLink,
  Mail,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { auth, db } from '../../firebase';
import { PersonnelProfile } from '../../types';
import { MySGJawatankuasaItem } from '../../utils/mysgJawatankuasaCatalog';
import { deepSanitizeFirestore } from '../../utils/sanitizeFirestore';
import { scopedDocId } from '../../utils/schoolTenant';
import SchoolLogo from '../SchoolLogo';
import { MemoMesyuaratDocument } from './types';

interface ModuleMemoMesyuaratProps {
  schoolCode: string;
  schoolName: string;
  schoolLogo?: string;
  schoolSlogan?: string;
  academicYear: string;
  currentUserName: string;
  currentUserUid: string;
  personnel: PersonnelProfile[];
  selectedItem: MySGJawatankuasaItem;
  savedDocs: MemoMesyuaratDocument[];
  onSaveDoc: (doc: Partial<MemoMesyuaratDocument> & { docKind: 'MEMO' }) => Promise<MemoMesyuaratDocument | null>;
  onDeleteDoc: (id: string) => Promise<void>;
}

const HARI_MELAYU = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];

function resolveHariFromDate(dateStr: string): string {
  if (!dateStr) return 'Isnin';
  const d = new Date(`${dateStr}T08:00:00`);
  if (Number.isNaN(d.getTime())) return 'Isnin';
  return HARI_MELAYU[d.getDay()] || 'Isnin';
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

export const ModuleMemoMesyuarat: React.FC<ModuleMemoMesyuaratProps> = ({
  schoolCode,
  schoolName,
  schoolLogo,
  schoolSlogan,
  academicYear,
  currentUserName,
  currentUserUid,
  personnel,
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

  const yearShort = (academicYear || '2026').slice(0, 4);
  const defaultMeetingDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    return d.toISOString().slice(0, 10);
  }, []);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [bilangan, setBilangan] = useState(`Bil. 1/${yearShort}`);
  const [tajukMesyuarat, setTajukMesyuarat] = useState(
    `MESYUARAT ${selectedItem.jawatankuasaInduk.toUpperCase()} BIL. 1/${yearShort}`
  );
  const [rujukanKami, setRujukanKami] = useState(
    `${schoolCode}/600-1/1/${String(savedDocs.length + 1).padStart(2, '0')}`
  );
  const [tarikhSurat, setTarikhSurat] = useState(new Date().toISOString().slice(0, 10));
  const [tarikhMesyuarat, setTarikhMesyuarat] = useState(defaultMeetingDate);
  const [hariMesyuarat, setHariMesyuarat] = useState(resolveHariFromDate(defaultMeetingDate));
  const [masaMesyuarat, setMasaMesyuarat] = useState('01:30 petang – 03:00 petang');
  const [tempatMesyuarat, setTempatMesyuarat] = useState(`Bilik Mesyuarat ${schoolName}`);

  const [pengerusiName, setPengerusiName] = useState(
    (principalProfile?.name || 'GURU BESAR').toUpperCase()
  );
  const [pengerusiTitle, setPengerusiTitle] = useState('Guru Besar');

  const [recipientMode, setRecipientMode] = useState<'SEMUA_GURU' | 'AHLI_TERPILIH'>('SEMUA_GURU');
  const [recipientIds, setRecipientIds] = useState<string[]>([]);

  const [agendaPerutusan, setAgendaPerutusan] = useState('Perutusan Pengerusi');
  const [agendaPengesahanMinit, setAgendaPengesahanMinit] = useState('Pengesahan Minit Mesyuarat Yang Lalu');
  const [agendaPerkaraBerbangkit, setAgendaPerkaraBerbangkit] = useState('Perkara-perkara Berbangkit');
  const [agendaFokusUtama, setAgendaFokusUtama] = useState<string[]>([
    `Pembentangan Perancangan & Takwim ${selectedItem.jawatankuasaInduk} Sesi ${academicYear || yearShort}`,
    `Semakan Agihan Tugas MySG (${selectedItem.kodMySG}) dan Pematuhan Standard SKPM`,
    'Analisis Isu Semasa serta Tindakan Intervensi Berfokus',
  ]);
  const [agendaHalLain, setAgendaHalLain] = useState('Hal-hal Lain');
  const [agendaPenutup, setAgendaPenutup] = useState('Penutup');
  const [contextNotes, setContextNotes] = useState('');

  const [principalName, setPrincipalName] = useState(
    (principalProfile?.name || 'GURU BESAR').toUpperCase()
  );

  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingMakluman, setSyncingMakluman] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState<string>('');
  const [copiedWa, setCopiedWa] = useState(false);

  // Sync defaults when switching Committee in Level 2 selector (when creating new)
  useEffect(() => {
    if (editingId) return;
    setTajukMesyuarat(`MESYUARAT ${selectedItem.jawatankuasaInduk.toUpperCase()} ${bilangan.toUpperCase()}`);
    const domainPrefix =
      selectedItem.pillar === 'PENTADBIRAN'
        ? '100'
        : selectedItem.pillar === 'KURIKULUM'
        ? '600'
        : selectedItem.pillar === 'HEM'
        ? '700'
        : '800';
    setRujukanKami(`${schoolCode}/${domainPrefix}-1/1/${String(savedDocs.length + 1).padStart(2, '0')}`);
    setAgendaFokusUtama([
      `Pembentangan Perancangan & Takwim ${selectedItem.jawatankuasaInduk} Sesi ${academicYear || yearShort}`,
      `Semakan Tugas & Sasaran ${selectedItem.jawatanRasmi} (${selectedItem.kodMySG})`,
      `Penyelarasan Sistem KPM (${selectedItem.sistemKPM}) & Pematuhan ${selectedItem.skpmStandardCode}`,
    ]);
  }, [selectedItem, editingId, schoolCode, academicYear, yearShort, bilangan, savedDocs.length]);

  useEffect(() => {
    if (principalProfile?.name && !editingId) {
      setPrincipalName(principalProfile.name.toUpperCase());
      setPengerusiName(principalProfile.name.toUpperCase());
    }
  }, [principalProfile, editingId]);

  const selectedRecipientNames = useMemo(() => {
    if (recipientMode === 'SEMUA_GURU') return ['Semua Guru & Staf Berkaitan'];
    return activeTeachers
      .filter((t) => recipientIds.includes(t.id))
      .map((t) => t.name.toUpperCase());
  }, [recipientMode, recipientIds, activeTeachers]);

  const handleSuggestAgendaAI = async () => {
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
          action: 'MEMO_AGENDA',
          payload: {
            committeeName: selectedItem.jawatankuasaInduk,
            jawatanRasmi: selectedItem.jawatanRasmi,
            pillar: selectedItem.pillar,
            tarikhMesyuarat,
            bilangan,
            contextNotes,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mencadangkan agenda.');
      if (Array.isArray(data.agendas) && data.agendas.length > 0) {
        setAgendaFokusUtama(data.agendas);
        setBanner({
          type: 'success',
          text:
            data.source === 'gemini'
              ? 'Cadangan Agenda Fokus Utama (Bahagian 4) berjaya dijana oleh AI Setiausaha.'
              : 'Cadangan agenda berstruktur telah diisi untuk semakan anda.',
        });
      }
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Gagal menjana agenda AI.' });
    } finally {
      setAiLoading(false);
    }
  };

  const buildCurrentPayload = (overrideId?: string): Partial<MemoMesyuaratDocument> & { docKind: 'MEMO' } => ({
    id: overrideId || editingId || undefined,
    docKind: 'MEMO',
    academicYear,
    pillar: selectedItem.pillar,
    kodMySG: selectedItem.kodMySG,
    jawatankuasaInduk: selectedItem.jawatankuasaInduk,
    jawatanRasmi: selectedItem.jawatanRasmi,
    tajukMesyuarat: tajukMesyuarat.trim().toUpperCase(),
    bilangan: bilangan.trim(),
    rujukanKami: rujukanKami.trim(),
    tarikhSurat,
    tarikhMesyuarat,
    hariMesyuarat,
    masaMesyuarat,
    tempatMesyuarat,
    pengerusiName: pengerusiName.trim().toUpperCase(),
    pengerusiTitle: pengerusiTitle.trim(),
    recipientMode,
    recipientIds,
    recipientNames: selectedRecipientNames,
    agendaPerutusan,
    agendaPengesahanMinit,
    agendaPerkaraBerbangkit,
    agendaFokusUtama: agendaFokusUtama.filter((s) => s.trim()),
    agendaHalLain,
    agendaPenutup,
    principalName: principalName.trim().toUpperCase(),
    principalTitle: 'Guru Besar',
  });

  const handleSaveMemo = async () => {
    if (!tajukMesyuarat.trim()) {
      setBanner({ type: 'error', text: 'Sila isi Tajuk Mesyuarat sebelum menyimpan.' });
      return null;
    }
    setSaving(true);
    setBanner(null);
    const saved = await onSaveDoc(buildCurrentPayload());
    setSaving(false);
    if (saved) {
      setEditingId(saved.id);
      setBanner({ type: 'success', text: `Memo "${saved.tajukMesyuarat}" telah disimpan ke pangkalan data.` });
    }
    return saved;
  };

  const handleSendToMaklumanAndWhatsApp = async () => {
    setSyncingMakluman(true);
    setBanner(null);
    try {
      let currentDocId = editingId;
      if (!currentDocId) {
        const saved = await onSaveDoc(buildCurrentPayload());
        if (saved) {
          currentDocId = saved.id;
          setEditingId(saved.id);
        }
      }
      const maklumanId = scopedDocId(
        schoolCode,
        `memo_${currentDocId || Date.now()}`
      );
      const agendaSummary = agendaFokusUtama
        .filter((s) => s.trim())
        .map((a, idx) => `4.${idx + 1} ${a}`)
        .join(' | ');

      const taskPayload = deepSanitizeFirestore({
        id: maklumanId,
        schoolCode,
        title: `[Panggilan Mesyuarat] ${tajukMesyuarat}`,
        description: `${selectedItem.jawatankuasaInduk} · Masa: ${masaMesyuarat} · Tempat: ${tempatMesyuarat}. Agenda Fokus: ${agendaSummary}`,
        domain: selectedItem.pillar,
        category: 'MESYUARAT',
        source: 'AD_HOC',
        dueDate: tarikhMesyuarat,
        dueTime: masaMesyuarat,
        location: tempatMesyuarat,
        tindakanLabel: recipientMode === 'SEMUA_GURU' ? 'SEMUA GURU' : selectedRecipientNames.join(', '),
        priority: 'TINGGI',
        targetType: recipientMode === 'SEMUA_GURU' ? 'SEMUA_GURU' : 'GURU_TERPILIH',
        targetTeacherIds: recipientMode === 'SEMUA_GURU' ? [] : recipientIds,
        arahanTindakan: `Kehadiran adalah diwajibkan. Ruj: ${rujukanKami}`,
        completions: {},
        whatsappLogs: {},
        createdByTeacherId: currentUserUid,
        createdByName: currentUserName,
        createdAt: new Date().toISOString(),
      });

      await setDoc(doc(db, 'makluman_tasks', maklumanId), taskPayload, { merge: true });

      const waText = [
        `*MEMO PANGGILAN MESYUARAT (${schoolName})*`,
        `Ruj: ${rujukanKami}`,
        ``,
        `*${tajukMesyuarat}*`,
        `Tarikh: ${formatMalayDate(tarikhMesyuarat)} (${hariMesyuarat})`,
        `Masa: ${masaMesyuarat}`,
        `Tempat: ${tempatMesyuarat}`,
        `Pengerusi: ${pengerusiName} (${pengerusiTitle})`,
        ``,
        `*Fokus Agenda Utama:*`,
        ...agendaFokusUtama.filter((s) => s.trim()).map((a, i) => `4.${i + 1} ${a}`),
        ``,
        `Kehadiran tuan/puan adalah diwajibkan. Terima kasih.`,
      ].join('\n');

      setWhatsappUrl(`https://wa.me/?text=${encodeURIComponent(waText)}`);
      setBanner({
        type: 'success',
        text: 'Berjaya dihantar ke Paparan Makluman semua guru & mesej WhatsApp sedia untuk dikongsi!',
      });
    } catch (err: any) {
      setBanner({
        type: 'error',
        text: `Gagal menghantar ke Paparan Makluman: ${err?.message || String(err)}`,
      });
    } finally {
      setSyncingMakluman(false);
    }
  };

  const handleLoadMemo = (m: MemoMesyuaratDocument) => {
    setEditingId(m.id);
    setBilangan(m.bilangan);
    setTajukMesyuarat(m.tajukMesyuarat);
    setRujukanKami(m.rujukanKami);
    setTarikhSurat(m.tarikhSurat);
    setTarikhMesyuarat(m.tarikhMesyuarat);
    setHariMesyuarat(m.hariMesyuarat);
    setMasaMesyuarat(m.masaMesyuarat);
    setTempatMesyuarat(m.tempatMesyuarat);
    setPengerusiName(m.pengerusiName);
    setPengerusiTitle(m.pengerusiTitle);
    setRecipientMode(m.recipientMode);
    setRecipientIds(m.recipientIds || []);
    setAgendaPerutusan(m.agendaPerutusan);
    setAgendaPengesahanMinit(m.agendaPengesahanMinit);
    setAgendaPerkaraBerbangkit(m.agendaPerkaraBerbangkit);
    setAgendaFokusUtama(m.agendaFokusUtama || []);
    setAgendaHalLain(m.agendaHalLain);
    setAgendaPenutup(m.agendaPenutup);
    setPrincipalName(m.principalName);
    setBanner({ type: 'success', text: `Memo "${m.tajukMesyuarat}" dimuatkan.` });
  };

  const handleCopyWhatsApp = async () => {
    if (!whatsappUrl) return;
    const raw = decodeURIComponent(whatsappUrl.replace('https://wa.me/?text=', ''));
    try {
      await navigator.clipboard.writeText(raw);
      setCopiedWa(true);
      setTimeout(() => setCopiedWa(false), 3000);
    } catch {
      // Clipboard fallback ignored
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT PANEL: MEMO EDITOR */}
        <div className="xl:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5 print:hidden">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h4 className="text-sm font-black uppercase text-white">Pembina Memo Panggilan Mesyuarat</h4>
              <p className="text-[11px] text-slate-400">
                Unit: <strong className="text-blue-300">{selectedItem.jawatankuasaInduk}</strong>
              </p>
            </div>
            <div className="flex items-center gap-2">
              {editingId && (
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                  title="Memo Baharu"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveMemo}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase cursor-pointer disabled:opacity-50"
              >
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Simpan Memo</span>
              </button>
            </div>
          </div>

          {banner && (
            <div
              className={`p-3 rounded-xl text-xs font-bold border space-y-2 ${
                banner.type === 'success'
                  ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300'
                  : 'bg-rose-950/60 border-rose-700 text-rose-300'
              }`}
            >
              <div>{banner.text}</div>
              {whatsappUrl && banner.type === 'success' && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black uppercase"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Buka WhatsApp Kongsi
                  </a>
                  <button
                    type="button"
                    onClick={handleCopyWhatsApp}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold cursor-pointer"
                  >
                    {copiedWa ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedWa ? 'Disalin!' : 'Salin Teks WhatsApp'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Core Memo Inputs */}
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-black uppercase text-slate-300 block mb-1">
                Tajuk Rasmi Mesyuarat:
              </label>
              <input
                type="text"
                value={tajukMesyuarat}
                onChange={(e) => setTajukMesyuarat(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">Ruj. Kami:</label>
                <input
                  type="text"
                  value={rujukanKami}
                  onChange={(e) => setRujukanKami(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">Bilangan:</label>
                <input
                  type="text"
                  value={bilangan}
                  onChange={(e) => setBilangan(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">Tarikh Surat:</label>
                <input
                  type="date"
                  value={tarikhSurat}
                  onChange={(e) => setTarikhSurat(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">Tarikh Mesyuarat:</label>
                <input
                  type="date"
                  value={tarikhMesyuarat}
                  onChange={(e) => {
                    setTarikhMesyuarat(e.target.value);
                    setHariMesyuarat(resolveHariFromDate(e.target.value));
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">Masa:</label>
                <input
                  type="text"
                  value={masaMesyuarat}
                  onChange={(e) => setMasaMesyuarat(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">Tempat:</label>
                <input
                  type="text"
                  value={tempatMesyuarat}
                  onChange={(e) => setTempatMesyuarat(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">Pengerusi:</label>
                <input
                  type="text"
                  value={pengerusiName}
                  onChange={(e) => setPengerusiName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">Jawatan Pengerusi:</label>
                <input
                  type="text"
                  value={pengerusiTitle}
                  onChange={(e) => setPengerusiTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>
            </div>
          </div>

          {/* Recipients */}
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
            <label className="text-[11px] font-black uppercase text-slate-300 block">
              Senarai Penerima (Daripada Profil Guru):
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRecipientMode('SEMUA_GURU')}
                className={`py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                  recipientMode === 'SEMUA_GURU'
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                Semua Guru ({activeTeachers.length})
              </button>
              <button
                type="button"
                onClick={() => setRecipientMode('AHLI_TERPILIH')}
                className={`py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                  recipientMode === 'AHLI_TERPILIH'
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                Ahli Jawatankuasa ({recipientIds.length})
              </button>
            </div>
            {recipientMode === 'AHLI_TERPILIH' && (
              <div className="max-h-32 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1 border border-slate-800 rounded-xl p-2 bg-slate-900">
                {activeTeachers.map((t) => {
                  const checked = recipientIds.includes(t.id);
                  return (
                    <label
                      key={t.id}
                      className="flex items-center gap-2 text-[11px] text-slate-200 px-2 py-1 rounded hover:bg-slate-800 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) setRecipientIds((prev) => [...prev, t.id]);
                          else setRecipientIds((prev) => prev.filter((id) => id !== t.id));
                        }}
                        className="rounded border-slate-700 text-indigo-500 focus:ring-0"
                      />
                      <span className="truncate">{t.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* AI Agenda Builder for Section 4 */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-indigo-700/50 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black uppercase text-indigo-300 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" />
                4. Fokus / Perbincangan Utama
              </span>
              <button
                type="button"
                onClick={handleSuggestAgendaAI}
                disabled={aiLoading}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-black uppercase flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {aiLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-300" />}
                <span>Cadang Agenda Pintar</span>
              </button>
            </div>
            <input
              type="text"
              value={contextNotes}
              onChange={(e) => setContextNotes(e.target.value)}
              placeholder="Nota tambahan untuk AI (cth: fokus PBD TP1-TP2, persediaan hari sukan)..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 outline-none"
            />
            <textarea
              rows={4}
              value={agendaFokusUtama.join('\n')}
              onChange={(e) => setAgendaFokusUtama(e.target.value.split('\n'))}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 outline-none"
            />
          </div>

          <button
            type="button"
            onClick={handleSendToMaklumanAndWhatsApp}
            disabled={syncingMakluman}
            className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg cursor-pointer disabled:opacity-50"
          >
            {syncingMakluman ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
            <span>
              {syncingMakluman ? 'Menghantar...' : 'Hantar ke Paparan Makluman & WhatsApp'}
            </span>
          </button>
        </div>

        {/* RIGHT PANEL: OFFICIAL KPM LETTERHEAD A4 PREVIEW */}
        <div className="xl:col-span-7 space-y-3">
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-2xl px-4 py-2.5 print:hidden">
            <span className="text-xs font-bold text-slate-300">
              Pratonton Surat / Memo Panggilan Mesyuarat Rasmi KPM (A4)
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

          <div
            id="memo-a4-print-sheet"
            className="print-portrait-sheet bg-white text-slate-900 rounded-2xl shadow-2xl border border-slate-200 max-w-[794px] mx-auto p-10 space-y-5 text-[12px] leading-relaxed font-serif"
          >
            {/* KEPALA SURAT RASMI SEKOLAH */}
            <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4">
              <div className="flex items-center gap-4">
                <SchoolLogo
                  src={schoolLogo}
                  schoolCode={schoolCode}
                  className="w-16 h-16 bg-white border-slate-300"
                />
                <div>
                  <h2 className="text-base font-black uppercase tracking-wide text-slate-950 font-sans">
                    {schoolName}
                  </h2>
                  <p className="text-[11px] font-bold text-slate-700 font-sans">
                    KOD SEKOLAH: {schoolCode} · KEMENTERIAN PENDIDIKAN MALAYSIA
                  </p>
                  {schoolSlogan && (
                    <p className="text-[10px] italic text-slate-500 font-sans">“{schoolSlogan}”</p>
                  )}
                </div>
              </div>
              <div className="text-right text-[10px] font-sans text-slate-600">
                <div className="font-black uppercase text-slate-900">MEMO DALAMAN / PANGGILAN</div>
                <div>MySG: {selectedItem.kodMySG}</div>
              </div>
            </div>

            {/* RUJUKAN & TARIKH */}
            <div className="flex justify-end">
              <table className="text-[11px] font-sans">
                <tbody>
                  <tr>
                    <td className="pr-2 font-bold">Ruj. Kami</td>
                    <td className="pr-2">:</td>
                    <td className="font-mono font-bold">{rujukanKami}</td>
                  </tr>
                  <tr>
                    <td className="pr-2 font-bold">Tarikh</td>
                    <td className="pr-2">:</td>
                    <td>{formatMalayDate(tarikhSurat)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* PENERIMA */}
            <div className="space-y-1">
              <p className="font-bold">Kepada:</p>
              <p className="font-bold uppercase">
                {recipientMode === 'SEMUA_GURU'
                  ? 'Semua Guru dan Ahli Jawatankuasa Berkaitan'
                  : selectedRecipientNames.join(', ') || 'Ahli Jawatankuasa Terlibat'}
              </p>
              <p>{schoolName}</p>
            </div>

            <p>Tuan / Puan,</p>

            {/* TAJUK */}
            <div className="font-black uppercase underline tracking-wide text-[13px] text-slate-950">
              {tajukMesyuarat}
            </div>

            <p className="text-justify">
              Dengan segala hormatnya perkara di atas adalah dirujuk. Sukacita dimaklumkan bahawa{' '}
              <strong>{selectedItem.jawatankuasaInduk}</strong> akan mengadakan mesyuarat seperti ketetapan berikut:
            </p>

            {/* BUTIRAN MESYUARAT */}
            <table className="w-full max-w-lg ml-6 text-[12px] font-sans">
              <tbody>
                <tr>
                  <td className="w-28 py-1 font-bold">Tarikh</td>
                  <td className="w-4">:</td>
                  <td className="font-bold">
                    {formatMalayDate(tarikhMesyuarat)} ({hariMesyuarat})
                  </td>
                </tr>
                <tr>
                  <td className="py-1 font-bold">Masa</td>
                  <td>:</td>
                  <td className="font-bold">{masaMesyuarat}</td>
                </tr>
                <tr>
                  <td className="py-1 font-bold">Tempat</td>
                  <td>:</td>
                  <td className="font-bold">{tempatMesyuarat}</td>
                </tr>
                <tr>
                  <td className="py-1 font-bold">Pengerusi</td>
                  <td>:</td>
                  <td>
                    {pengerusiName} ({pengerusiTitle})
                  </td>
                </tr>
              </tbody>
            </table>

            {/* AGENDA RASMI 6 PERKARA */}
            <div className="space-y-1.5">
              <p className="font-bold">2. Agenda mesyuarat adalah seperti berikut:</p>
              <ol className="ml-8 space-y-1">
                <li>2.1 {agendaPerutusan}</li>
                <li>2.2 {agendaPengesahanMinit}</li>
                <li>2.3 {agendaPerkaraBerbangkit}</li>
                <li>
                  2.4 Fokus / Perbincangan Utama Mesyuarat:
                  <ul className="list-disc ml-6 mt-1 space-y-0.5 text-[11px]">
                    {agendaFokusUtama.filter((s) => s.trim()).map((ag, i) => (
                      <li key={i}>{ag}</li>
                    ))}
                  </ul>
                </li>
                <li>2.5 {agendaHalLain}</li>
                <li>2.6 {agendaPenutup}</li>
              </ol>
            </div>

            <p className="text-justify">
              3. Kehadiran dan kerjasama tuan/puan amatlah dihargai dan didahului dengan ucapan ribuan terima kasih.
            </p>

            <div className="pt-2 space-y-1 font-bold uppercase font-sans text-[11px]">
              <p>“MALAYSIA MADANI”</p>
              <p>“BERKHIDMAT UNTUK NEGARA”</p>
            </div>

            <div className="pt-2 space-y-10">
              <p>Saya yang menjalankan amanah,</p>
              <div>
                <p className="font-black uppercase font-sans">{principalName}</p>
                <p className="font-sans text-[11px]">Guru Besar</p>
                <p className="font-sans text-[11px]">{schoolName}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SAVED MEMOS ARCHIVE */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 print:hidden">
        <h4 className="text-sm font-black uppercase text-white flex items-center gap-2">
          <Mail className="w-4 h-4 text-blue-400" />
          Arkib Memo Panggilan Mesyuarat ({savedDocs.length})
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {savedDocs.map((m) => (
            <div
              key={m.id}
              className="bg-slate-950 border border-slate-800 hover:border-blue-600/60 rounded-2xl p-4 flex flex-col justify-between gap-3"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] font-bold">
                  <span className="text-blue-300 font-mono">{m.rujukanKami}</span>
                  <span className="text-slate-400 font-mono">{m.tarikhMesyuarat}</span>
                </div>
                <h5 className="text-xs font-black text-white uppercase line-clamp-2">
                  {m.tajukMesyuarat}
                </h5>
                <p className="text-[11px] text-slate-400 truncate">
                  {m.tempatMesyuarat} · {m.masaMesyuarat}
                </p>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                <button
                  type="button"
                  onClick={() => handleLoadMemo(m)}
                  className="text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1 cursor-pointer"
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
              Belum ada Memo Panggilan Mesyuarat disimpan.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
