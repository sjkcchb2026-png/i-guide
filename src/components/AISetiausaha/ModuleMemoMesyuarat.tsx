import React, { useState, useEffect, useMemo } from 'react';
import {
  Printer,
  Save,
  Users,
  CheckSquare,
  Square,
  ArrowRight,
  Trash2,
  CheckCircle2,
  Plus,
} from 'lucide-react';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, SchoolSettings, PersonnelProfile } from '../../types';
import {
  MYSG_DEFAULT_CATALOG,
  MySGJawatankuasaItem,
} from '../../utils/mysgJawatankuasaCatalog';
import {
  AISetiausahaDocument,
  InvitedCommitteeTeacher,
  resolveDocumentSessions,
  cleanAgendaFokusLines,
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
  mysgItems?: MySGJawatankuasaItem[];
  personnel?: PersonnelProfile[];
  onOpenMemoInMinit?: (memoDoc: AISetiausahaDocument) => void;
}

export const ModuleMemoMesyuarat: React.FC<Props> = ({
  currentUser,
  schoolSettings,
  schoolCode,
  schoolName,
  academicYear = '2026',
  mysgItems = MYSG_DEFAULT_CATALOG,
  personnel = [],
  onOpenMemoInMinit,
}) => {
  const [savedMemos, setSavedMemos] = useState<AISetiausahaDocument[]>([]);
  const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null);

  const [selectedKodMySG, setSelectedKodMySG] = useState<string>(
    mysgItems[0]?.kodMySG || 'JK01-SU-PENGURUSAN'
  );
  const [tajukMesyuarat, setTajukMesyuarat] = useState<string>(
    `MESYUARAT JAWATANKUASA BIL. 1/${academicYear}`
  );
  const [tarikhMesyuarat, setTarikhMesyuarat] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [masaMesyuarat, setMasaMesyuarat] = useState<string>('2:00 Petang');
  const [tempatMesyuarat, setTempatMesyuarat] = useState<string>('Bilik Mesyuarat Sekolah');
  const [pengerusi, setPengerusi] = useState<string>(
    (schoolSettings as any)?.principalName || `Guru Besar ${schoolName}`
  );
  const [setiausahaName, setSetiausahaName] = useState<string>(
    (currentUser.name || 'SETIAUSAHA').toUpperCase()
  );

  // Strict 1-to-1 invitee state
  const [invitedTeacherIds, setInvitedTeacherIds] = useState<string[]>([]);
  const [includePrincipalChair, setIncludePrincipalChair] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const selectedCommittee = useMemo(
    () => mysgItems.find((i) => i.kodMySG === selectedKodMySG) || null,
    [mysgItems, selectedKodMySG]
  );

  // Build unified roster from personnel + any teachers referenced in mysgItems
  const fullTeacherRoster = useMemo(() => {
    const map = new Map<string, { id: string; name: string; position: string }>();
    personnel.forEach((p) => {
      if (!p.name) return;
      const key = p.id || p.name.toUpperCase();
      map.set(key, {
        id: key,
        name: p.name.toUpperCase(),
        position: p.position || 'GURU',
      });
    });
    mysgItems.forEach((it) => {
      if (it.assignedTeacherId || it.assignedTeacherName) {
        const key = it.assignedTeacherId || it.assignedTeacherName!.toUpperCase();
        if (!map.has(key)) {
          map.set(key, {
            id: key,
            name: (it.assignedTeacherName || key).toUpperCase(),
            position: 'GURU',
          });
        }
      }
      (it.ahliList || []).forEach((a) => {
        const key = a.teacherId || a.teacherName.toUpperCase();
        if (key && !map.has(key)) {
          map.set(key, {
            id: key,
            name: (a.teacherName || key).toUpperCase(),
            position: 'GURU',
          });
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [personnel, mysgItems]);

  // Helper to determine a teacher's role in the currently selected committee
  const getTeacherRoleInSelectedCommittee = (
    teacherId: string,
    teacherName: string
  ): { isCommitteeMember: boolean; roleLabel: string } => {
    if (!selectedCommittee) {
      return { isCommitteeMember: false, roleLabel: 'Ahli Mesyuarat' };
    }
    const normName = teacherName.trim().toUpperCase();
    if (
      (selectedCommittee.assignedTeacherId &&
        selectedCommittee.assignedTeacherId === teacherId) ||
      (selectedCommittee.assignedTeacherName &&
        selectedCommittee.assignedTeacherName.trim().toUpperCase() === normName)
    ) {
      return {
        isCommitteeMember: true,
        roleLabel: `${selectedCommittee.jawatanRasmi} (Penyelaras)`,
      };
    }
    const isAhli = (selectedCommittee.ahliList || []).some(
      (a) =>
        (a.teacherId && a.teacherId === teacherId) ||
        (a.teacherName && a.teacherName.trim().toUpperCase() === normName)
    );
    if (isAhli) {
      return {
        isCommitteeMember: true,
        roleLabel: 'Ahli Jawatankuasa (AJK)',
      };
    }
    return {
      isCommitteeMember: false,
      roleLabel: 'Guru Jemputan / Turut Hadir',
    };
  };

  // Auto-select ONLY Penyelaras + Ahli (AJK) when a committee is selected (unless JK01-SU-PENGURUSAN / Mesyuarat Guru)
  const applyCommitteeAutoSelection = (kod: string, includeGB: boolean) => {
    if (kod === '__SEMUA_GURU__' || kod === 'JK01-SU-PENGURUSAN') {
      setInvitedTeacherIds(fullTeacherRoster.map((t) => t.id));
      return;
    }

    const comm = mysgItems.find((i) => i.kodMySG === kod);
    if (!comm) {
      setInvitedTeacherIds([]);
      return;
    }

    const autoIds = new Set<string>();

    // 1. Add Penyelaras
    if (comm.assignedTeacherId || comm.assignedTeacherName) {
      const matched = fullTeacherRoster.find(
        (t) =>
          t.id === comm.assignedTeacherId ||
          t.name === (comm.assignedTeacherName || '').toUpperCase()
      );
      if (matched) autoIds.add(matched.id);
    }

    // 2. Add Ahli (AJK)
    (comm.ahliList || []).forEach((a) => {
      const matched = fullTeacherRoster.find(
        (t) =>
          t.id === a.teacherId || t.name === (a.teacherName || '').toUpperCase()
      );
      if (matched) autoIds.add(matched.id);
    });

    // 3. Optional Pengerusi / GPK
    if (includeGB) {
      fullTeacherRoster.forEach((t) => {
        const pos = (t.position || '').toUpperCase();
        if (
          pos.includes('GURU BESAR') ||
          pos === 'GB' ||
          pos.includes('PENOLONG KANAN') ||
          pos.startsWith('PK')
        ) {
          autoIds.add(t.id);
        }
      });
    }

    setInvitedTeacherIds(Array.from(autoIds));
  };

  useEffect(() => {
    if (selectedCommittee && !selectedMemoId) {
      setTajukMesyuarat(
        `MESYUARAT ${selectedCommittee.jawatankuasaInduk.toUpperCase()} BIL. 1/${academicYear}`
      );
      if (selectedCommittee.assignedTeacherName) {
        setSetiausahaName(selectedCommittee.assignedTeacherName.toUpperCase());
      }
      applyCommitteeAutoSelection(selectedKodMySG, includePrincipalChair);
    }
  }, [selectedKodMySG, academicYear, mysgItems, fullTeacherRoster.length]);

  const loadSavedMemos = async () => {
    try {
      const snap = await getDocs(collection(db, 'ai_setiausaha_documents'));
      const list = snap.docs
        .map((d) => ({ ...(d.data() as any), id: d.id } as AISetiausahaDocument))
        .filter((d) => {
          if (!belongsToSchool(d as any, schoolCode) || d.docKind !== 'MEMO') return false;
          const docYear = d.academicYear || (d.tarikh ? d.tarikh.slice(0, 4) : '2026');
          return docYear === academicYear || docYear.startsWith(academicYear.slice(0, 4));
        })
        .sort((a, b) => (b.createdAt || b.tarikh || '').localeCompare(a.createdAt || a.tarikh || ''));
      setSavedMemos(list);
    } catch (err) {
      console.warn('Could not load saved memos:', err);
    }
  };

  useEffect(() => {
    loadSavedMemos();
  }, [schoolCode, academicYear]);

  // Build the structured `invitedTeachers` array from `invitedTeacherIds`
  const invitedTeachersList: InvitedCommitteeTeacher[] = useMemo(() => {
    return invitedTeacherIds
      .map((id) => {
        const t = fullTeacherRoster.find((r) => r.id === id);
        if (!t) return null;
        const roleInfo = getTeacherRoleInSelectedCommittee(t.id, t.name);
        return {
          teacherId: t.id,
          teacherName: t.name,
          committeeRole: roleInfo.roleLabel,
        };
      })
      .filter((x): x is InvitedCommitteeTeacher => Boolean(x));
  }, [invitedTeacherIds, fullTeacherRoster, selectedCommittee]);

  const handleToggleTeacher = (id: string) => {
    setInvitedTeacherIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSaveMemo = async () => {
    if (!tajukMesyuarat.trim()) return;
    setSaving(true);
    setStatusBanner(null);
    try {
      const nowIso = new Date().toISOString();
      const resolvedSession = resolveDocumentSessions({
        title: tajukMesyuarat,
        tarikh: tarikhMesyuarat,
        fallbackYear: academicYear,
      });
      const memoId =
        selectedMemoId ||
        scopedDocId(schoolCode, `memo_${resolvedSession.primaryYear.replace(/\//g, '-')}_${Date.now()}`);

      const isAllSelected =
        fullTeacherRoster.length > 0 && invitedTeachersList.length >= fullTeacherRoster.length;

      const memoDoc: AISetiausahaDocument = {
        id: memoId,
        docKind: 'MEMO',
        schoolCode,
        academicYear: resolvedSession.primaryYear,
        academicYears: resolvedSession.academicYears,
        pillar: selectedCommittee?.pillar || 'PENTADBIRAN',
        kodMySG: selectedKodMySG,
        jawatankuasaInduk:
          selectedCommittee?.jawatankuasaInduk || 'JK Pengurusan & Pentadbiran Sekolah',
        jawatanRasmi: selectedCommittee?.jawatanRasmi || 'Setiausaha Mesyuarat',
        programTitle: tajukMesyuarat.trim().toUpperCase(),
        tajukMesyuarat: tajukMesyuarat.trim().toUpperCase(),
        tarikh: tarikhMesyuarat,
        tarikhMesyuarat,
        masa: masaMesyuarat,
        masaMesyuarat,
        tempat: tempatMesyuarat,
        tempatMesyuarat,
        pengerusi,
        invitedTeachers: invitedTeachersList,
        recipientMode: isAllSelected ? 'ALL_TEACHERS' : 'COMMITTEE_ONLY',
        recipientIds: invitedTeachersList.map((t) => t.teacherId),
        recipientNames: invitedTeachersList.map((t) => t.teacherName),
        preparedByName: (setiausahaName.trim() || currentUser.name || 'SETIAUSAHA').toUpperCase(),
        preparedByTitle:
          selectedCommittee?.jawatanRasmi || `Setiausaha Mesyuarat, ${schoolName}`,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await setDoc(doc(db, 'ai_setiausaha_documents', memoId), deepSanitizeFirestore(memoDoc), {
        merge: true,
      });

      // Also sync to `makluman_tasks` with the exact `invitedTeachers` list & `academicYear`
      const maklumanId = scopedDocId(schoolCode, `makluman_${memoId}`);
      await setDoc(
        doc(db, 'makluman_tasks', maklumanId),
        deepSanitizeFirestore({
          id: maklumanId,
          sourceMemoId: memoId,
          schoolCode,
          academicYear,
          title: tajukMesyuarat.trim().toUpperCase(),
          category: selectedCommittee?.pillar || 'PENTADBIRAN',
          kodMySG: selectedKodMySG,
          jawatankuasaInduk:
            selectedCommittee?.jawatankuasaInduk || 'JK Pengurusan Sekolah',
          dueDate: tarikhMesyuarat,
          masa: masaMesyuarat,
          tempat: tempatMesyuarat,
          invitedTeachers: invitedTeachersList,
          status: 'ACTIVE',
          updatedAt: nowIso,
        }),
        { merge: true }
      ).catch(() => null);

      setSelectedMemoId(memoId);
      await loadSavedMemos();
      setStatusBanner(
        `Memo Panggilan Mesyuarat disimpan dengan ${invitedTeachersList.length} guru jemputan! Senarai kehadiran ini sedia diwarisi 1-ke-1 ke Minit Mesyuarat.`
      );
    } catch (err: any) {
      setStatusBanner(`Gagal menyimpan Memo: ${err?.message || 'Ralat'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSelectSavedMemo = (memo: AISetiausahaDocument) => {
    setSelectedMemoId(memo.id);
    if (memo.kodMySG) setSelectedKodMySG(memo.kodMySG);
    setTajukMesyuarat(memo.programTitle);
    setTarikhMesyuarat(memo.tarikh);
    if (memo.masa) setMasaMesyuarat(memo.masa);
    if (memo.tempat) setTempatMesyuarat(memo.tempat);
    if (memo.pengerusi) setPengerusi(memo.pengerusi);
    if (memo.preparedByName) setSetiausahaName(memo.preparedByName.toUpperCase());
    if (Array.isArray(memo.invitedTeachers)) {
      setInvitedTeacherIds(memo.invitedTeachers.map((t) => t.teacherId));
    }
  };

  const handleDeleteMemo = async (id: string) => {
    await deleteDoc(doc(db, 'ai_setiausaha_documents', id));
    if (selectedMemoId === id) setSelectedMemoId(null);
    await loadSavedMemos();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column: Committee Selection, Auto-Selected Invitee Checklist & Saved Memos */}
      <div className="lg:col-span-5 space-y-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black uppercase text-amber-400">
              1. Tetapan Memo Panggilan (Sesi {academicYear})
            </h4>
            <button
              type="button"
              onClick={() => {
                setSelectedMemoId(null);
                applyCommitteeAutoSelection(selectedKodMySG, includePrincipalChair);
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Memo Baharu</span>
            </button>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
              Pilih Jawatankuasa / Panitia / Unit (Auto-Pilih Penyelaras + AJK)
            </label>
            <select
              value={selectedKodMySG}
              onChange={(e) => {
                const nextKod = e.target.value;
                setSelectedMemoId(null);
                setSelectedKodMySG(nextKod);
                const comm = mysgItems.find((i) => i.kodMySG === nextKod);
                if (comm) {
                  setTajukMesyuarat(
                    `MESYUARAT ${comm.jawatankuasaInduk.toUpperCase()} BIL. 1/${academicYear}`
                  );
                } else if (nextKod === '__SEMUA_GURU__') {
                  setTajukMesyuarat(
                    `MESYUARAT PENGURUSAN & GURU BIL. 1/${academicYear}`
                  );
                }
                applyCommitteeAutoSelection(nextKod, includePrincipalChair);
              }}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold"
            >
              <option value="__SEMUA_GURU__">
                Semua Guru — Mesyuarat Guru / Pengurusan Sekolah
              </option>
              {mysgItems.map((it, idx) => {
                const ahliLen = Array.isArray(it.ahliList) ? it.ahliList.length : 0;
                return (
                  <option key={`${it.kodMySG}_${idx}`} value={it.kodMySG}>
                    {it.kodMySG} — {it.jawatankuasaInduk} (Penyelaras:{' '}
                    {it.assignedTeacherName || 'Tiada'} + {ahliLen} AJK)
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
              Tajuk Panggilan Mesyuarat
            </label>
            <input
              type="text"
              value={tajukMesyuarat}
              onChange={(e) => setTajukMesyuarat(e.target.value.toUpperCase())}
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
                value={tarikhMesyuarat}
                onChange={(e) => setTarikhMesyuarat(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                Masa
              </label>
              <input
                type="text"
                value={masaMesyuarat}
                onChange={(e) => setMasaMesyuarat(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                Tempat
              </label>
              <input
                type="text"
                value={tempatMesyuarat}
                onChange={(e) => setTempatMesyuarat(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                Pengerusi
              </label>
              <input
                type="text"
                value={pengerusi}
                onChange={(e) => setPengerusi(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-amber-300 uppercase block mb-1">
              Nama Setiausaha (Penyedia Memo)
            </label>
            <input
              type="text"
              value={setiausahaName}
              onChange={(e) => setSetiausahaName(e.target.value.toUpperCase())}
              placeholder="Taip nama Setiausaha"
              className="w-full bg-slate-950 border border-amber-500/40 rounded-xl px-2.5 py-2 text-xs text-white font-bold uppercase"
            />
          </div>

          {/* Step A: Auto-Selected Committee Roster (Penyelaras + Ahli) Checklist */}
          <div className="pt-2 border-t border-slate-800 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-black uppercase text-teal-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                <span>
                  2. Senarai Guru Dijemput ({invitedTeacherIds.length} Guru Terpilih)
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    applyCommitteeAutoSelection(selectedKodMySG, includePrincipalChair)
                  }
                  className="px-2 py-1 rounded-lg bg-teal-950 border border-teal-700 text-teal-300 text-[10px] font-bold cursor-pointer"
                  title="Pilih semula hanya Penyelaras & AJK jawatankuasa ini"
                >
                  Hanya Penyelaras &amp; AJK
                </button>
                <button
                  type="button"
                  onClick={() => setInvitedTeacherIds(fullTeacherRoster.map((t) => t.id))}
                  className="px-2 py-1 rounded-lg bg-slate-800 text-slate-300 text-[10px] font-bold cursor-pointer"
                >
                  Semua Guru
                </button>
                <button
                  type="button"
                  onClick={() => setInvitedTeacherIds([])}
                  className="px-2 py-1 rounded-lg bg-rose-950 border border-rose-700 text-rose-300 text-[10px] font-bold cursor-pointer"
                  title="Nyahpilih semua penerima (Untick All)"
                >
                  Nyahpilih Semua (Untick)
                </button>
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includePrincipalChair}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setIncludePrincipalChair(checked);
                  applyCommitteeAutoSelection(selectedKodMySG, checked);
                }}
                className="rounded text-indigo-500"
              />
              <span>Sertakan Guru Besar / Pentadbir (Pengerusi) dalam senarai jemputan</span>
            </label>

            <div className="max-h-56 overflow-y-auto divide-y divide-slate-800/80 bg-slate-950 border border-slate-800 rounded-xl">
              {fullTeacherRoster.map((t, idx) => {
                const isChecked = invitedTeacherIds.includes(t.id);
                const roleInfo = getTeacherRoleInSelectedCommittee(t.id, t.name);
                return (
                  <div
                    key={`${t.id}_${idx}`}
                    onClick={() => handleToggleTeacher(t.id)}
                    className={`px-3 py-2 flex items-center justify-between gap-2 text-xs cursor-pointer transition ${
                      isChecked
                        ? 'bg-indigo-950/60 text-white font-bold'
                        : 'text-slate-400 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-teal-400 shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-600 shrink-0" />
                      )}
                      <span className="truncate">{t.name}</span>
                    </div>
                    {roleInfo.isCommitteeMember && (
                      <span className="px-2 py-0.5 rounded bg-teal-900/70 border border-teal-700 text-teal-200 text-[9px] font-black shrink-0">
                        {roleInfo.roleLabel.includes('Penyelaras') ? 'PENYELARAS' : 'AHLI (AJK)'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveMemo}
              className="flex-1 py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-black uppercase flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>
                {saving
                  ? 'Menyimpan...'
                  : `Simpan Memo (${invitedTeachersList.length} Guru)`}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                triggerSmartPrint({
                  elementId: 'memo-panggilan-mesyuarat-sheet',
                  title: tajukMesyuarat,
                  orientation: 'portrait',
                  onNotice: (msg) => setStatusBanner(msg),
                })
              }
              className="py-2.5 px-3.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-black uppercase flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak</span>
            </button>
          </div>
        </div>

        {/* Saved Memos List for 1-to-1 Minit Mesyuarat Inheritance */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2.5">
          <div className="text-xs font-black uppercase text-slate-400">
            Arkib Memo Panggilan Sesi {academicYear} ({savedMemos.length})
          </div>
          {savedMemos.length === 0 ? (
            <div className="text-xs text-slate-500 italic py-3">
              Belum ada Memo disimpan bagi Sesi {academicYear}. Klik &ldquo;Simpan Memo&rdquo; di atas untuk mengunci senarai kehadiran.
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {savedMemos.map((m, idx) => (
                <div
                  key={`${m.id}_${idx}`}
                  onClick={() => handleSelectSavedMemo(m)}
                  className={`p-3 rounded-xl border cursor-pointer transition space-y-2 ${
                    selectedMemoId === m.id
                      ? 'bg-indigo-950/60 border-indigo-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{m.programTitle}</div>
                      <div className="text-[10px] text-slate-400">
                        {m.tarikh} · {(m.invitedTeachers || []).length} Guru Dijemput
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteMemo(m.id);
                      }}
                      className="text-slate-500 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {onOpenMemoInMinit && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenMemoInMinit(m);
                      }}
                      className="w-full py-1.5 px-2.5 rounded-lg bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/40 text-teal-300 text-[10px] font-black uppercase flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>Buka dalam Minit Mesyuarat (1-ke-1: {(m.invitedTeachers || []).length} Guru)</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Printable Memo Sheet */}
      <div className="lg:col-span-7 space-y-4">
        {statusBanner && (
          <div className="p-3.5 rounded-2xl bg-emerald-950/80 border border-emerald-600 text-emerald-200 text-xs font-bold flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{statusBanner}</span>
            </div>
            <button onClick={() => setStatusBanner(null)} className="text-emerald-400">
              ✕
            </button>
          </div>
        )}

        <div
          id="memo-panggilan-mesyuarat-sheet"
          className="bg-white text-black rounded-2xl p-10 shadow-2xl max-w-3xl mx-auto space-y-4 text-sm leading-relaxed"
        >
          <div className="border-b-2 border-black pb-3 text-center">
            <div className="font-black text-base uppercase">{schoolName}</div>
            <div className="text-xs font-bold uppercase">
              MEMO DALAMAN / NOTIS PANGGILAN MESYUARAT (SESI {academicYear})
            </div>
          </div>

          <div className="text-xs flex justify-between">
            <span>
              Ruj. Kami: {schoolCode}/PKPA/{academicYear}/
              {selectedKodMySG === '__SEMUA_GURU__' ? 'PENGURUSAN' : selectedKodMySG}(1)
            </span>
            <span>Tarikh: {tarikhMesyuarat}</span>
          </div>

          <div className="space-y-1">
            <div className="font-bold">
              Kepada: Senarai Ahli Jawatankuasa &amp; Guru Terlibat ({invitedTeachersList.length} Orang)
            </div>
            {invitedTeachersList.length > 0 ? (
              <div className="border border-black p-2.5 text-xs bg-slate-50 grid grid-cols-1 sm:grid-cols-2 gap-1">
                {invitedTeachersList.map((t, idx) => (
                  <div key={`${t.teacherId}_${idx}`}>
                    {idx + 1}. <strong>{t.teacherName}</strong> ({t.committeeRole})
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs italic text-slate-600">
                Semua Guru &amp; Ahli Jawatankuasa Berkenaan
              </div>
            )}
          </div>

          <div>Tuan / Puan,</div>

          <div className="font-bold underline uppercase">{tajukMesyuarat}</div>

          <p>Dengan segala hormatnya perkara di atas adalah dirujuk.</p>
          <p>
            2. Sukacita dimaklumkan bahawa mesyuarat tersebut akan diadakan seperti ketetapan berikut:
          </p>

          <div className="pl-6 space-y-1 font-semibold">
            <div>Tarikh : {tarikhMesyuarat}</div>
            <div>Masa : {masaMesyuarat}</div>
            <div>Tempat : {tempatMesyuarat}</div>
            <div>Pengerusi : {pengerusi}</div>
          </div>

          <p>3. Agenda Mesyuarat:</p>
          <ol className="list-decimal pl-10 space-y-0.5">
            <li>Perutusan Pengerusi</li>
            <li>Pengesahan Minit Mesyuarat Yang Lalu</li>
            <li>Perkara-perkara Berbangkit (Maklum Balas PKPA Bil. 2/1991)</li>
            <li>Pembentangan Kertas Kerja / Fokus Pengurusan &amp; SKPM</li>
            <li>Hal-hal Lain</li>
            <li>Penangguhan Mesyuarat</li>
          </ol>

          <p>
            Kehadiran semua ahli jawatankuasa yang disenaraikan di atas adalah diwajibkan. Sekian, terima kasih.
          </p>

          <div className="pt-8">
            <div>Disediakan oleh,</div>
            <div className="mt-10 font-bold uppercase">
              ({(setiausahaName.trim() || currentUser.name || (schoolSettings as any)?.principalName || 'SETIAUSAHA').toUpperCase()})
            </div>
            <div>
              {selectedCommittee?.jawatanRasmi || 'Setiausaha Mesyuarat'}, {schoolName}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModuleMemoMesyuarat;
