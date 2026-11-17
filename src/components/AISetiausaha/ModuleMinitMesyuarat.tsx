import React, { useState, useEffect } from 'react';
import {
  Printer,
  Save,
  UserPlus,
  CheckCircle2,
  Trash2,
  ClipboardCheck,
  X,
} from 'lucide-react';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, SchoolSettings } from '../../types';
import {
  AISetiausahaDocument,
  InvitedCommitteeTeacher,
  MinitAttendanceRecord,
  MinitAttendanceStatus,
  TurutHadirRecord,
} from './types';
import { belongsToSchool, scopedDocId } from '../../utils/schoolTenant';
import { deepSanitizeFirestore } from '../../utils/sanitizeFirestore';
import { triggerSmartPrint } from '../../utils/oprPrintHelper';

interface Props {
  currentUser: UserProfile;
  schoolSettings?: SchoolSettings | null;
  schoolCode: string;
  schoolName: string;
  academicYear?: string;
  initialMemo?: AISetiausahaDocument | null;
}

export const ModuleMinitMesyuarat: React.FC<Props> = ({
  currentUser,
  schoolSettings,
  schoolCode,
  schoolName,
  academicYear = '2026',
  initialMemo = null,
}) => {
  const [availableMemos, setAvailableMemos] = useState<AISetiausahaDocument[]>([]);
  const [savedMinits, setSavedMinits] = useState<AISetiausahaDocument[]>([]);
  const [selectedSourceMemoId, setSelectedSourceMemoId] = useState<string>('');
  const [selectedMinitId, setSelectedMinitId] = useState<string | null>(null);

  const [tajuk, setTajuk] = useState<string>(
    `MINIT MESYUARAT JAWATANKUASA BIL. 1/${academicYear}`
  );
  const [tarikh, setTarikh] = useState<string>(new Date().toISOString().slice(0, 10));
  const [masa, setMasa] = useState<string>('2:00 Petang – 4:00 Petang');
  const [tempat, setTempat] = useState<string>('Bilik Mesyuarat Sekolah');
  const [pengerusi, setPengerusi] = useState<string>(
    (schoolSettings as any)?.principalName || `Guru Besar ${schoolName}`
  );
  const [agendaFokus, setAgendaFokus] = useState<string>(
    'Penyelarasan Takwim Tahunan, Sasaran SKPM Kualiti@Sekolah dan Kemenjadian Murid.'
  );

  // Step B: Strictly locked 1-to-1 attendance list from the Memo's `invitedTeachers`
  const [attendanceList, setAttendanceList] = useState<MinitAttendanceRecord[]>([]);

  // Optional Turut Hadir (uninvited guest/observer)
  const [turutHadirList, setTurutHadirList] = useState<TurutHadirRecord[]>([]);
  const [showTurutHadirForm, setShowTurutHadirForm] = useState<boolean>(false);
  const [guestNameInput, setGuestNameInput] = useState<string>('');
  const [guestRoleInput, setGuestRoleInput] = useState<string>('Turut Hadir / Pemerhati');

  const [saving, setSaving] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const applyMemoToMinit = (memo: AISetiausahaDocument) => {
    setSelectedMinitId(null);
    setSelectedSourceMemoId(memo.id);
    const rawTitle = (memo.programTitle || '').toUpperCase();
    const minitTitle = rawTitle.startsWith('MINIT ')
      ? rawTitle
      : `MINIT ${rawTitle}`;
    setTajuk(minitTitle);
    if (memo.tarikh) setTarikh(memo.tarikh);
    if (memo.masa) setMasa(memo.masa);
    if (memo.tempat) setTempat(memo.tempat);
    if (memo.pengerusi) setPengerusi(memo.pengerusi);

    // Strictly populate Kehadiran ONLY from the Memo's `invitedTeachers`, defaulting all to HADIR
    const invited: InvitedCommitteeTeacher[] = Array.isArray(memo.invitedTeachers)
      ? memo.invitedTeachers
      : [];
    setAttendanceList(
      invited.map((t) => ({
        teacherId: t.teacherId,
        teacherName: t.teacherName,
        committeeRole: t.committeeRole || 'Ahli Mesyuarat',
        status: 'HADIR',
        reason: '',
      }))
    );
    setTurutHadirList([]);
  };

  const loadMemosAndMinits = async () => {
    try {
      const [docsSnap, maklumanSnap] = await Promise.all([
        getDocs(collection(db, 'ai_setiausaha_documents')),
        getDocs(collection(db, 'makluman_tasks')).catch(() => null),
      ]);

      const allDocs = docsSnap.docs
        .map((d) => ({ ...(d.data() as any), id: d.id } as AISetiausahaDocument))
        .filter((d) => {
          if (!belongsToSchool(d as any, schoolCode)) return false;
          const docYear = d.academicYear || (d.tarikh ? d.tarikh.slice(0, 4) : '2026');
          return docYear === academicYear || docYear.startsWith(academicYear.slice(0, 4));
        });

      const memos = allDocs
        .filter((d) => d.docKind === 'MEMO')
        .sort((a, b) => (b.createdAt || b.tarikh || '').localeCompare(a.createdAt || a.tarikh || ''));

      // Also include any makluman_tasks with invitedTeachers that aren't already in memos
      if (maklumanSnap) {
        const memoIds = new Set(memos.map((m) => m.id));
        maklumanSnap.docs.forEach((md) => {
          const data = md.data() as any;
          if (!belongsToSchool(data, schoolCode)) return;
          const mYear = data.academicYear || (data.dueDate ? data.dueDate.slice(0, 4) : '2026');
          if (mYear !== academicYear && !mYear.startsWith(academicYear.slice(0, 4))) return;
          if (
            Array.isArray(data.invitedTeachers) &&
            data.invitedTeachers.length > 0 &&
            (!data.sourceMemoId || !memoIds.has(data.sourceMemoId))
          ) {
            memos.push({
              id: md.id,
              docKind: 'MEMO',
              schoolCode,
              academicYear: mYear,
              kodMySG: data.kodMySG,
              jawatankuasaInduk: data.jawatankuasaInduk,
              programTitle: data.title || 'MESYUARAT JAWATANKUASA',
              tarikh: data.dueDate || new Date().toISOString().slice(0, 10),
              masa: data.masa || '2:00 Petang',
              tempat: data.tempat || 'Bilik Mesyuarat',
              invitedTeachers: data.invitedTeachers,
            });
          }
        });
      }

      const minits = allDocs
        .filter((d) => d.docKind === 'MINIT')
        .sort((a, b) => (b.createdAt || b.tarikh || '').localeCompare(a.createdAt || a.tarikh || ''));

      setAvailableMemos(memos);
      setSavedMinits(minits);

      if (initialMemo) {
        applyMemoToMinit(initialMemo);
      } else if (memos.length > 0 && !selectedSourceMemoId && !selectedMinitId) {
        applyMemoToMinit(memos[0]);
      }
    } catch (err) {
      console.warn('Could not load Memos and Minits:', err);
    }
  };

  useEffect(() => {
    loadMemosAndMinits();
  }, [schoolCode, academicYear]);

  useEffect(() => {
    if (initialMemo) {
      applyMemoToMinit(initialMemo);
    }
  }, [initialMemo]);

  const handleStatusChange = (index: number, nextStatus: MinitAttendanceStatus) => {
    setAttendanceList((prev) =>
      prev.map((rec, i) =>
        i === index
          ? {
              ...rec,
              status: nextStatus,
              reason:
                nextStatus === 'TIDAK_HADIR_BERSEBAB'
                  ? rec.reason || 'Urusan Rasmi / Cuti Sakit'
                  : '',
            }
          : rec
      )
    );
  };

  const handleReasonChange = (index: number, reason: string) => {
    setAttendanceList((prev) =>
      prev.map((rec, i) => (i === index ? { ...rec, reason } : rec))
    );
  };

  const handleAddTurutHadir = () => {
    if (!guestNameInput.trim()) return;
    setTurutHadirList((prev) => [
      ...prev,
      {
        id: `guest_${Date.now()}`,
        name: guestNameInput.trim().toUpperCase(),
        role: guestRoleInput.trim() || 'Turut Hadir',
      },
    ]);
    setGuestNameInput('');
    setGuestRoleInput('Turut Hadir / Pemerhati');
    setShowTurutHadirForm(false);
  };

  const handleRemoveTurutHadir = (id: string) => {
    setTurutHadirList((prev) => prev.filter((g) => g.id !== id));
  };

  const handleSaveMinit = async () => {
    if (!tajuk.trim()) return;
    setSaving(true);
    setStatusMsg(null);
    try {
      const nowIso = new Date().toISOString();
      const minitId =
        selectedMinitId ||
        scopedDocId(schoolCode, `minit_${academicYear.replace(/\//g, '-')}_${Date.now()}`);

      const minitDoc: AISetiausahaDocument = {
        id: minitId,
        docKind: 'MINIT',
        sourceMemoId: selectedSourceMemoId || undefined,
        schoolCode,
        academicYear,
        programTitle: tajuk.trim().toUpperCase(),
        tarikh,
        masa,
        tempat,
        pengerusi,
        rawNotes: agendaFokus,
        attendanceList,
        turutHadirList,
        preparedByName: (currentUser.name || 'SETIAUSAHA').toUpperCase(),
        preparedByTitle: 'Setiausaha Mesyuarat',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await setDoc(doc(db, 'ai_setiausaha_documents', minitId), deepSanitizeFirestore(minitDoc), {
        merge: true,
      });

      setSelectedMinitId(minitId);
      await loadMemosAndMinits();
      setStatusMsg(
        `Minit Mesyuarat PKPA berjaya disimpan (${attendanceList.filter((a) => a.status === 'HADIR').length}/${attendanceList.length} Hadir)!`
      );
    } catch (err: any) {
      setStatusMsg(`Gagal menyimpan Minit: ${err?.message || 'Ralat'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleLoadSavedMinit = (m: AISetiausahaDocument) => {
    setSelectedMinitId(m.id);
    setSelectedSourceMemoId(m.sourceMemoId || '');
    setTajuk(m.programTitle);
    setTarikh(m.tarikh);
    if (m.masa) setMasa(m.masa);
    if (m.tempat) setTempat(m.tempat);
    if (m.pengerusi) setPengerusi(m.pengerusi);
    if (m.rawNotes) setAgendaFokus(m.rawNotes);
    setAttendanceList(Array.isArray(m.attendanceList) ? m.attendanceList : []);
    setTurutHadirList(Array.isArray(m.turutHadirList) ? m.turutHadirList : []);
  };

  const handleDeleteMinit = async (id: string) => {
    await deleteDoc(doc(db, 'ai_setiausaha_documents', id));
    if (selectedMinitId === id) setSelectedMinitId(null);
    await loadMemosAndMinits();
  };

  const hadirRecords = attendanceList.filter((a) => a.status === 'HADIR');
  const tidakHadirBersebabRecords = attendanceList.filter(
    (a) => a.status === 'TIDAK_HADIR_BERSEBAB'
  );
  const tidakHadirRecords = attendanceList.filter((a) => a.status === 'TIDAK_HADIR');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column: Source Memo Picker & Locked 1-to-1 Attendance Toggles */}
      <div className="lg:col-span-5 space-y-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black uppercase text-amber-400 flex items-center gap-1.5">
              <ClipboardCheck className="w-4 h-4" />
              <span>1. Sumber Memo Panggilan (1-ke-1 Sesi {academicYear})</span>
            </h4>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
              Pilih Memo Panggilan / Makluman Mesyuarat (Kunci Senarai Kehadiran)
            </label>
            <select
              value={selectedSourceMemoId}
              onChange={(e) => {
                const memoId = e.target.value;
                const found = availableMemos.find((m) => m.id === memoId);
                if (found) {
                  applyMemoToMinit(found);
                } else {
                  setSelectedSourceMemoId('');
                }
              }}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold"
            >
              <option value="">
                -- Pilih Memo Panggilan Sesi {academicYear} ({availableMemos.length} Memo) --
              </option>
              {availableMemos.map((m, idx) => (
                <option key={`${m.id}_${idx}`} value={m.id}>
                  {m.tarikh} — {m.programTitle} ({(m.invitedTeachers || []).length} Guru Dijemput)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
              Tajuk Minit Mesyuarat (Format PKPA Bil. 2/1991)
            </label>
            <input
              type="text"
              value={tajuk}
              onChange={(e) => setTajuk(e.target.value.toUpperCase())}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                Tarikh
              </label>
              <input
                type="date"
                value={tarikh}
                onChange={(e) => setTarikh(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                Masa
              </label>
              <input
                type="text"
                value={masa}
                onChange={(e) => setMasa(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
              Fokus Pembentangan / Keputusan Mesyuarat
            </label>
            <textarea
              rows={2}
              value={agendaFokus}
              onChange={(e) => setAgendaFokus(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
            />
          </div>

          {/* Step B: Strictly Scoped Kehadiran List from Memo's invitedTeachers */}
          <div className="pt-2 border-t border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-black uppercase text-teal-400">
                  2. Kehadiran Ahli Mesyuarat ({hadirRecords.length}/{attendanceList.length} Hadir)
                </div>
                <div className="text-[10px] text-slate-400">
                  Dikunci 1-ke-1 daripada senarai jemputan Memo Panggilan (Lalai: Semua Hadir)
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowTurutHadirForm((v) => !v)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer shrink-0"
              >
                <UserPlus className="w-3 h-3" />
                <span>+ Tambah Turut Hadir</span>
              </button>
            </div>

            {attendanceList.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 text-center">
                Sila pilih Memo Panggilan Mesyuarat di atas untuk memuatkan senarai guru yang dijemput secara automatik.
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {attendanceList.map((rec, idx) => (
                  <div
                    key={`${rec.teacherId}_${idx}`}
                    className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">
                          {idx + 1}. {rec.teacherName}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {rec.committeeRole}
                        </div>
                      </div>

                      <div className="inline-flex rounded-lg bg-slate-900 p-0.5 border border-slate-800 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStatusChange(idx, 'HADIR')}
                          className={`px-2 py-1 rounded-md text-[10px] font-black cursor-pointer transition ${
                            rec.status === 'HADIR'
                              ? 'bg-emerald-600 text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Hadir
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusChange(idx, 'TIDAK_HADIR_BERSEBAB')}
                          className={`px-2 py-1 rounded-md text-[10px] font-black cursor-pointer transition ${
                            rec.status === 'TIDAK_HADIR_BERSEBAB'
                              ? 'bg-amber-500 text-slate-950'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Bersebab
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusChange(idx, 'TIDAK_HADIR')}
                          className={`px-2 py-1 rounded-md text-[10px] font-black cursor-pointer transition ${
                            rec.status === 'TIDAK_HADIR'
                              ? 'bg-rose-600 text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Tidak Hadir
                        </button>
                      </div>
                    </div>

                    {rec.status === 'TIDAK_HADIR_BERSEBAB' && (
                      <input
                        type="text"
                        value={rec.reason || ''}
                        onChange={(e) => handleReasonChange(idx, e.target.value)}
                        placeholder="Nyatakan sebab tidak hadir (cth: Cuti Sakit / Kursus PPD)..."
                        className="w-full bg-slate-900 border border-amber-500/50 rounded-lg px-2.5 py-1.5 text-xs text-amber-200 placeholder:text-slate-500 outline-none"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Optional + Tambah Turut Hadir Input & Chips */}
            {showTurutHadirForm && (
              <div className="p-3 rounded-xl bg-slate-950 border border-amber-500/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-amber-300">
                    Tambah Tetamu / Pemerhati (Turut Hadir)
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowTurutHadirForm(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={guestNameInput}
                    onChange={(e) => setGuestNameInput(e.target.value)}
                    placeholder="Nama Tetamu / Pegawai..."
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                  <input
                    type="text"
                    value={guestRoleInput}
                    onChange={(e) => setGuestRoleInput(e.target.value)}
                    placeholder="Jawatan (cth: Pegawai SISC+)"
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddTurutHadir}
                  className="w-full py-1.5 rounded-lg bg-amber-500 text-slate-950 text-[11px] font-black uppercase cursor-pointer"
                >
                  Masukkan ke Senarai Turut Hadir
                </button>
              </div>
            )}

            {turutHadirList.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] font-bold uppercase text-amber-300">
                  Turut Hadir ({turutHadirList.length}):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {turutHadirList.map((g) => (
                    <span
                      key={g.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-950/60 border border-amber-700 text-amber-200 text-[10px] font-bold"
                    >
                      <span>
                        {g.name} ({g.role})
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTurutHadir(g.id)}
                        className="text-amber-400 hover:text-rose-400"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveMinit}
              className="flex-1 py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-black uppercase flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Menyimpan...' : 'Simpan Minit PKPA'}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                triggerSmartPrint({
                  elementId: 'minit-mesyuarat-pkpa-sheet',
                  title: tajuk,
                  orientation: 'portrait',
                })
              }
              className="py-2.5 px-3.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-black uppercase flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Minit</span>
            </button>
          </div>
        </div>

        {/* Saved Minits Archive */}
        {savedMinits.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="text-xs font-black uppercase text-slate-400">
              Arkib Minit Mesyuarat Sesi {academicYear} ({savedMinits.length})
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {savedMinits.map((m, idx) => (
                <div
                  key={`${m.id}_${idx}`}
                  onClick={() => handleLoadSavedMinit(m)}
                  className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between gap-2 ${
                    selectedMinitId === m.id
                      ? 'bg-indigo-950/60 border-indigo-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate">{m.programTitle}</div>
                    <div className="text-[10px] text-slate-400">
                      {m.tarikh} · {(m.attendanceList || []).filter((x) => x.status === 'HADIR').length}/
                      {(m.attendanceList || []).length} Hadir
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteMinit(m.id);
                    }}
                    className="text-slate-500 hover:text-rose-400 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right Column: Printable Official PKPA Bil. 2/1991 Minit Mesyuarat Sheet */}
      <div className="lg:col-span-7 space-y-4">
        {statusMsg && (
          <div className="p-3.5 rounded-2xl bg-emerald-950/80 border border-emerald-600 text-emerald-200 text-xs font-bold flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{statusMsg}</span>
            </div>
            <button onClick={() => setStatusMsg(null)} className="text-emerald-400">
              ✕
            </button>
          </div>
        )}

        <div
          id="minit-mesyuarat-pkpa-sheet"
          className="bg-white text-black rounded-2xl p-10 shadow-2xl max-w-3xl mx-auto space-y-4 text-sm leading-relaxed"
        >
          <div className="border-b-2 border-black pb-3 text-center">
            <div className="font-black text-base uppercase">{schoolName}</div>
            <div className="font-bold uppercase">{tajuk}</div>
          </div>

          <div className="text-xs space-y-1 bg-slate-50 p-3 rounded border border-black">
            <div>
              <strong>Tarikh:</strong> {tarikh}
            </div>
            <div>
              <strong>Masa:</strong> {masa}
            </div>
            <div>
              <strong>Tempat:</strong> {tempat}
            </div>
            <div>
              <strong>Pengerusi:</strong> {pengerusi}
            </div>
          </div>

          {/* Official PKPA Bil. 2/1991 Attendance Box */}
          <div className="border border-black text-xs">
            <div className="bg-slate-100 border-b border-black px-3 py-1.5 font-bold uppercase">
              KEHADIRAN AHLI MESYUARAT ({hadirRecords.length} / {attendanceList.length} HADIR)
            </div>
            <div className="p-3 space-y-2.5">
              <div>
                <div className="font-bold underline mb-1">
                  Hadir ({hadirRecords.length} Orang):
                </div>
                {hadirRecords.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {hadirRecords.map((r, i) => (
                      <div key={`h_${r.teacherId}_${i}`}>
                        {i + 1}. <strong>{r.teacherName}</strong> ({r.committeeRole})
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="italic text-slate-600">Tiada rekod kehadiran.</div>
                )}
              </div>

              {tidakHadirBersebabRecords.length > 0 && (
                <div className="pt-1 border-t border-slate-300">
                  <div className="font-bold underline mb-1">
                    Tidak Hadir Bersebab ({tidakHadirBersebabRecords.length} Orang):
                  </div>
                  <div className="space-y-0.5">
                    {tidakHadirBersebabRecords.map((r, i) => (
                      <div key={`thb_${r.teacherId}_${i}`}>
                        {i + 1}. <strong>{r.teacherName}</strong> — Catatan:{' '}
                        <em>{r.reason || 'Urusan Rasmi'}</em>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tidakHadirRecords.length > 0 && (
                <div className="pt-1 border-t border-slate-300">
                  <div className="font-bold underline mb-1">
                    Tidak Hadir ({tidakHadirRecords.length} Orang):
                  </div>
                  <div className="space-y-0.5">
                    {tidakHadirRecords.map((r, i) => (
                      <div key={`th_${r.teacherId}_${i}`}>
                        {i + 1}. <strong>{r.teacherName}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {turutHadirList.length > 0 && (
                <div className="pt-1 border-t border-slate-300">
                  <div className="font-bold underline mb-1">
                    Turut Hadir ({turutHadirList.length} Orang):
                  </div>
                  <div className="space-y-0.5">
                    {turutHadirList.map((g, i) => (
                      <div key={g.id}>
                        {i + 1}. <strong>{g.name}</strong> ({g.role})
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <div className="font-bold uppercase">1.0 PERUTUSAN PENGERUSI</div>
              <p className="pl-4">
                1.1 Pengerusi mengucapkan terima kasih atas kehadiran semua ahli jawatankuasa dan mengingatkan agar semua program direkodkan secara sistematik selaras dengan SKPM Kualiti@Sekolah bagi Sesi {academicYear}.
              </p>
              <div className="text-right font-bold italic">Tindakan: Makluman Semua Ahli</div>
            </div>

            <div>
              <div className="font-bold uppercase">
                2.0 PENGESAHAN MINIT MESYUARAT YANG LALU
              </div>
              <p className="pl-4">
                2.1 Minit mesyuarat yang lalu dicadang untuk disahkan dan disokong sebulat suara tanpa pindaan.
              </p>
              <div className="text-right font-bold italic">Tindakan: Setiausaha</div>
            </div>

            <div>
              <div className="font-bold uppercase">3.0 PERKARA-PERKARA BERBANGKIT</div>
              <p className="pl-4">
                3.1 Semua tindakan daripada mesyuarat lepas telah diambil tindakan sewajarnya mengikut ketetapan PKPA Bil. 2/1991.
              </p>
            </div>

            <div>
              <div className="font-bold uppercase">
                4.0 FOKUS PENGURUSAN &amp; PEMBENTANGAN KERTAS KERJA
              </div>
              <p className="pl-4">4.1 {agendaFokus}</p>
              <div className="text-right font-bold italic">
                Tindakan: Penyelaras &amp; Ahli Jawatankuasa (AJK)
              </div>
            </div>

            <div>
              <div className="font-bold uppercase">5.0 PENUTUP</div>
              <p className="pl-4">
                5.1 Mesyuarat ditangguhkan dengan ucapan terima kasih daripada Pengerusi.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 pt-8 text-xs">
            <div>
              <div>Disediakan oleh,</div>
              <div className="mt-10 font-bold uppercase">
                ({currentUser.name || 'SETIAUSAHA'})
              </div>
              <div>Setiausaha Mesyuarat</div>
            </div>
            <div>
              <div>Disahkan oleh,</div>
              <div className="mt-10 font-bold uppercase">
                ({(schoolSettings as any)?.principalName || 'GURU BESAR'})
              </div>
              <div>Guru Besar {schoolName}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModuleMinitMesyuarat;
