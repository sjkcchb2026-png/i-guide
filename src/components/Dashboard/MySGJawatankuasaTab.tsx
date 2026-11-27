import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  Save,
  RefreshCw,
  Award,
  Search,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Users,
  Copy,
  Calendar,
  X,
  CheckSquare,
  Square,
  Bell,
} from 'lucide-react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { PersonnelProfile, UserProfile } from '../../types';
import {
  MySGJawatankuasaItem,
  MySGAhliItem,
  MySGPillar,
  MySGTahapBeban,
  MYSG_DEFAULT_CATALOG,
  computeTeacherWorkloadRadar,
  mergeMySGCatalogWithSaved,
} from '../../utils/mysgJawatankuasaCatalog';
import { belongsToSchool, scopedDocId } from '../../utils/schoolTenant';
import { deepSanitizeFirestore } from '../../utils/sanitizeFirestore';

interface Props {
  activeSchoolCode: string;
  displaySchoolName: string;
  selectedAcademicYear: string;
  availableYears?: string[];
  onSelectAcademicYear?: (year: string) => void;
  onAddNewAcademicYear?: (year: string) => Promise<void>;
  personnel: PersonnelProfile[];
  currentUser?: UserProfile | null;
  items: MySGJawatankuasaItem[];
  onItemsChange: (items: MySGJawatankuasaItem[]) => void;
  onSynced?: () => Promise<void>;
  logAuditTrail?: (
    actionType: 'CREATE' | 'UPDATE' | 'DELETE' | 'STATE_CHANGE' | 'AUTHORIZE' | 'IMPORT' | 'ROLLBACK',
    layer: number,
    entityId: string,
    details: string
  ) => Promise<void>;
}

export const MySGJawatankuasaTab: React.FC<Props> = ({
  activeSchoolCode,
  displaySchoolName,
  selectedAcademicYear,
  availableYears = ['2026', '2027', '2028'],
  onSelectAcademicYear,
  onAddNewAcademicYear,
  personnel,
  currentUser,
  items,
  onItemsChange,
  onSynced,
  logAuditTrail,
}) => {
  const [pillarFilter, setPillarFilter] = useState<'ALL' | MySGPillar>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [cloning, setCloning] = useState<boolean>(false);
  const [syncToMakluman, setSyncToMakluman] = useState<boolean>(true);
  const [banner, setBanner] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(
    null
  );

  // Quick Add Session inline modal state
  const [showAddYearInput, setShowAddYearInput] = useState<boolean>(false);
  const [customYearInput, setCustomYearInput] = useState<string>('');

  // Multi-select Ahli Jawatankuasa (AJK) Modal/Popover state
  const [activeAhliModalKod, setActiveAhliModalKod] = useState<string | null>(null);
  const [ahliSearchQuery, setAhliSearchQuery] = useState<string>('');

  // Add custom jawatankuasa state
  const [newKod, setNewKod] = useState<string>('');
  const [newPillar, setNewPillar] = useState<MySGPillar>('KURIKULUM');
  const [newInduk, setNewInduk] = useState<string>('');
  const [newJawatan, setNewJawatan] = useState<string>('');
  const [newBeban, setNewBeban] = useState<MySGTahapBeban>('SEDERHANA');

  const effectiveSession = selectedAcademicYear || '2026';
  const isCurrentSession =
    effectiveSession === '2026' || effectiveSession.startsWith('2026');

  const sessionOptions = useMemo(() => {
    const base = ['2026', '2027', '2028'];
    const merged = Array.from(new Set([...base, ...availableYears, effectiveSession])).filter(
      Boolean
    );
    return merged.sort((a, b) => a.localeCompare(b));
  }, [availableYears, effectiveSession]);

  const radarList = useMemo(
    () => computeTeacherWorkloadRadar(items, personnel),
    [items, personnel]
  );

  const totalPenyelarasAssigned = useMemo(
    () => items.filter((i) => Boolean(i.assignedTeacherId)).length,
    [items]
  );

  const totalAhliAssigned = useMemo(
    () => items.reduce((acc, i) => acc + (Array.isArray(i.ahliList) ? i.ahliList.length : 0), 0),
    [items]
  );

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (pillarFilter !== 'ALL' && item.pillar !== pillarFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const ahliMatch = (item.ahliList || []).some((a) =>
          (a.teacherName || '').toLowerCase().includes(q)
        );
        return (
          item.kodMySG.toLowerCase().includes(q) ||
          item.jawatankuasaInduk.toLowerCase().includes(q) ||
          item.jawatanRasmi.toLowerCase().includes(q) ||
          (item.assignedTeacherName || '').toLowerCase().includes(q) ||
          ahliMatch
        );
      }
      return true;
    });
  }, [items, pillarFilter, searchQuery]);

  const handleAssignTeacher = (kodMySG: string, teacherId: string) => {
    const matchedTeacher = personnel.find((p) => p.id === teacherId);
    const updated = items.map((it) =>
      it.kodMySG === kodMySG
        ? {
            ...it,
            assignedTeacherId: teacherId,
            assignedTeacherName: matchedTeacher ? matchedTeacher.name.toUpperCase() : '',
          }
        : it
    );
    onItemsChange(updated);
  };

  const handleToggleAhliMember = (kodMySG: string, teacher: PersonnelProfile) => {
    const tId = teacher.id;
    const tName = (teacher.name || '').toUpperCase();
    const updated = items.map((it) => {
      if (it.kodMySG !== kodMySG) return it;
      const currentAhli: MySGAhliItem[] = Array.isArray(it.ahliList) ? [...it.ahliList] : [];
      const existsIdx = currentAhli.findIndex(
        (a) => a.teacherId === tId || a.teacherName.toUpperCase() === tName
      );
      if (existsIdx >= 0) {
        currentAhli.splice(existsIdx, 1);
      } else {
        currentAhli.push({ teacherId: tId, teacherName: tName });
      }
      return {
        ...it,
        ahliList: currentAhli,
      };
    });
    onItemsChange(updated);
  };

  const handleRemoveAhliMember = (kodMySG: string, teacherIdOrName: string) => {
    const updated = items.map((it) => {
      if (it.kodMySG !== kodMySG) return it;
      const currentAhli = Array.isArray(it.ahliList) ? it.ahliList : [];
      return {
        ...it,
        ahliList: currentAhli.filter(
          (a) => a.teacherId !== teacherIdOrName && a.teacherName !== teacherIdOrName
        ),
      };
    });
    onItemsChange(updated);
  };

  const handleSelectAllAhliInModal = (kodMySG: string, selectAll: boolean) => {
    const updated = items.map((it) => {
      if (it.kodMySG !== kodMySG) return it;
      if (!selectAll) {
        return { ...it, ahliList: [] };
      }
      const allAhli: MySGAhliItem[] = personnel
        .filter((p) => p.id !== it.assignedTeacherId)
        .map((p) => ({
          teacherId: p.id,
          teacherName: (p.name || '').toUpperCase(),
        }));
      return { ...it, ahliList: allAhli };
    });
    onItemsChange(updated);
  };

  const handleChangeBeban = (kodMySG: string, tahap: MySGTahapBeban) => {
    const mata = tahap === 'BERAT' ? 3 : tahap === 'SEDERHANA' ? 2 : 1;
    const updated = items.map((it) =>
      it.kodMySG === kodMySG ? { ...it, tahapBeban: tahap, mataBeban: mata } : it
    );
    onItemsChange(updated);
  };

  const handleAddCustomItem = () => {
    if (!newInduk.trim() || !newJawatan.trim()) return;
    const code = (
      newKod.trim() || `JK-CUSTOM-${Date.now().toString().slice(-4)}`
    ).toUpperCase();
    const mata = newBeban === 'BERAT' ? 3 : newBeban === 'SEDERHANA' ? 2 : 1;
    const skpmBucket =
      newPillar === 'PENTADBIRAN'
        ? 'Std 1 & 2'
        : newPillar === 'KURIKULUM'
        ? 'Std 3.1'
        : newPillar === 'KOKURIKULUM'
        ? 'Std 3.2'
        : 'Std 3.3';

    const nextItem: MySGJawatankuasaItem = {
      kodMySG: code,
      pillar: newPillar,
      jawatankuasaInduk: newInduk.trim(),
      jawatanRasmi: newJawatan.trim(),
      tahapBeban: newBeban,
      mataBeban: mata,
      skpmBucket,
      skpmStandardRef: `SKPM ${skpmBucket} — ${newInduk.trim()}`,
      assignedTeacherId: '',
      assignedTeacherName: '',
      ahliList: [],
    };

    onItemsChange([...items, nextItem]);
    setNewKod('');
    setNewInduk('');
    setNewJawatan('');
  };

  // Clone from Sesi 2026 (or previous year) into current selectedAcademicYear
  const handleCloneFromPreviousSession = async (sourceYear: string = '2026') => {
    setCloning(true);
    setBanner(null);
    try {
      const sourceSlug = sourceYear.replace(/\//g, '-');
      const assignDocId = `${activeSchoolCode}_${sourceSlug}`;
      const govDocId = scopedDocId(activeSchoolCode, `mysg_jawatankuasa_${sourceSlug}`);

      const [assignSnap, govSnap] = await Promise.all([
        getDoc(doc(db, 'mysg_jawatankuasa_assignments', assignDocId)).catch(() => null),
        getDoc(doc(db, 'school_governance', govDocId)).catch(() => null),
      ]);

      let sourceItems: MySGJawatankuasaItem[] | null = null;
      if (assignSnap?.exists() && Array.isArray(assignSnap.data()?.items) && assignSnap.data().items.length > 0) {
        sourceItems = assignSnap.data().items as MySGJawatankuasaItem[];
      } else if (govSnap?.exists() && Array.isArray(govSnap.data()?.items) && govSnap.data().items.length > 0) {
        sourceItems = govSnap.data().items as MySGJawatankuasaItem[];
      } else if (sourceYear === '2026') {
        // Also check legacy unscoped or 2026-2027 doc if present
        const altGovId = scopedDocId(activeSchoolCode, 'mysg_jawatankuasa_2026-2027');
        const altSnap = await getDoc(doc(db, 'school_governance', altGovId)).catch(() => null);
        if (altSnap?.exists() && Array.isArray(altSnap.data()?.items)) {
          sourceItems = altSnap.data().items as MySGJawatankuasaItem[];
        }
      }

      if (!sourceItems || sourceItems.length === 0) {
        setBanner({
          type: 'error',
          text: `Tiada rekod lantikan ditemui dalam Sesi ${sourceYear} untuk disalin. Sila pastikan Sesi ${sourceYear} telah disimpan.`,
        });
        setCloning(false);
        return;
      }

      const clonedMerged = mergeMySGCatalogWithSaved(sourceItems);
      onItemsChange(clonedMerged);

      const pCount = clonedMerged.filter((i) => i.assignedTeacherId).length;
      const aCount = clonedMerged.reduce(
        (acc, i) => acc + (Array.isArray(i.ahliList) ? i.ahliList.length : 0),
        0
      );

      setBanner({
        type: 'info',
        text: `📋 Berjaya menyalin ${pCount} lantikan Penyelaras & ${aCount} keahlian AJK dari Sesi ${sourceYear} ke draf Sesi ${effectiveSession}! Sila kemas kini jawatan yang berubah dan klik "Simpan & Segerak 4-Arah".`,
      });
    } catch (err: any) {
      setBanner({
        type: 'error',
        text: `Gagal menyalin lantikan dari Sesi ${sourceYear}: ${err?.message || 'Ralat tidak diketahui'}`,
      });
    } finally {
      setCloning(false);
    }
  };

  const handleSaveAndSyncAll = async () => {
    setSaving(true);
    setBanner(null);
    try {
      const ay = effectiveSession;
      const aySlug = ay.replace(/\//g, '-');
      const assignDocId = `${activeSchoolCode}_${aySlug}`;
      const govDocId = scopedDocId(activeSchoolCode, `mysg_jawatankuasa_${aySlug}`);
      const nowIso = new Date().toISOString();

      const payload = deepSanitizeFirestore({
        id: assignDocId,
        schoolCode: activeSchoolCode,
        academicYear: ay,
        type: 'MYSG_JAWATANKUASA_V5',
        items,
        updatedBy: currentUser?.email || currentUser?.uid || 'admin',
        updatedAt: nowIso,
      });

      // 1. Save strictly isolated by `${schoolCode}_${selectedAcademicYear}` in both collections
      await Promise.all([
        setDoc(doc(db, 'mysg_jawatankuasa_assignments', assignDocId), payload, { merge: true }),
        setDoc(
          doc(db, 'school_governance', govDocId),
          { ...payload, id: govDocId },
          { merge: true }
        ),
      ]);

      // 2. Sync to `governance_assignments` strictly scoped to `academicYear === ay`
      // First remove old MySG-generated governance_assignments for this school & session
      try {
        const oldGovQuery = query(
          collection(db, 'governance_assignments'),
          where('academicYear', '==', ay)
        );
        const oldGovSnap = await getDocs(oldGovQuery);
        const oldMySGDocs = oldGovSnap.docs.filter((d) => {
          const data = d.data() as any;
          return (
            belongsToSchool(data, activeSchoolCode) &&
            (data.sourceModule === 'MYSG_JAWATANKUASA' || d.id.includes('_MYSG_'))
          );
        });
        await Promise.all(oldMySGDocs.map((d) => deleteDoc(d.ref)));
      } catch (cleanupErr) {
        console.warn('Cleanup old MySG governance_assignments notice:', cleanupErr);
      }

      const govBatch = writeBatch(db);
      items.forEach((it) => {
        // 2A: Primary Coordinator / Penyelaras / Ketua / Setiausaha (carries Mata Beban)
        if (it.assignedTeacherId && it.assignedTeacherName) {
          const gaId = scopedDocId(
            activeSchoolCode,
            `${aySlug}_MYSG_${it.kodMySG}_PENYELARAS_${it.assignedTeacherId}`
          );
          const isSecretary =
            it.jawatanRasmi.toUpperCase().includes('SETIAUSAHA') ||
            it.kodMySG.includes('-SU-');
          const isChair =
            it.jawatanRasmi.toUpperCase().includes('KETUA') ||
            it.kodMySG.includes('-KP-');

          govBatch.set(
            doc(db, 'governance_assignments', gaId),
            deepSanitizeFirestore({
              id: gaId,
              schoolCode: activeSchoolCode,
              academicYear: ay,
              sourceModule: 'MYSG_JAWATANKUASA',
              kodMySG: it.kodMySG,
              pillar: it.pillar,
              personnelId: it.assignedTeacherId,
              personnelName: it.assignedTeacherName.toUpperCase(),
              governanceType: 'COORDINATOR',
              entityName: `${it.jawatanRasmi} (${it.jawatankuasaInduk})`,
              jawatankuasaInduk: it.jawatankuasaInduk,
              jawatanRasmi: it.jawatanRasmi,
              role: isSecretary ? 'SECRETARY' : isChair ? 'CHAIR' : 'COORDINATOR_LEAD',
              raciRole: 'R',
              mataBeban: it.mataBeban,
              tahapBeban: it.tahapBeban,
              effectiveDate: `${ay.slice(0, 4)}-01-01`,
              status: 'ACTIVE',
              updatedAt: nowIso,
            })
          );
        }

        // 2B: Ahli Jawatankuasa (AJK) — 1 Mata Beban, role: 'COMMITTEE_MEMBER'
        if (Array.isArray(it.ahliList)) {
          it.ahliList.forEach((ahli) => {
            if (!ahli.teacherId && !ahli.teacherName) return;
            const cleanId = ahli.teacherId || ahli.teacherName.replace(/\s+/g, '_');
            const gaAhliId = scopedDocId(
              activeSchoolCode,
              `${aySlug}_MYSG_${it.kodMySG}_AHLI_${cleanId}`
            );
            govBatch.set(
              doc(db, 'governance_assignments', gaAhliId),
              deepSanitizeFirestore({
                id: gaAhliId,
                schoolCode: activeSchoolCode,
                academicYear: ay,
                sourceModule: 'MYSG_JAWATANKUASA',
                kodMySG: it.kodMySG,
                pillar: it.pillar,
                personnelId: ahli.teacherId,
                personnelName: ahli.teacherName.toUpperCase(),
                governanceType: 'COMMITTEE',
                entityName: `AJK ${it.jawatankuasaInduk}`,
                jawatankuasaInduk: it.jawatankuasaInduk,
                jawatanRasmi: `Ahli Jawatankuasa (${it.jawatankuasaInduk})`,
                role: 'COMMITTEE_MEMBER',
                raciRole: 'C',
                mataBeban: 1,
                tahapBeban: 'RINGAN',
                effectiveDate: `${ay.slice(0, 4)}-01-01`,
                status: 'ACTIVE',
                updatedAt: nowIso,
              })
            );
          });
        }
      });
      await govBatch.commit();

      // 3. Sync teacher workload summaries into personnel docs (isolated by session so 2027 planning never overwrites 2026 active fields)
      const pBatch = writeBatch(db);
      radarList.forEach((r) => {
        if (r.teacherId) {
          const penyelarasTitles = r.positions.map(
            (p) => `${p.jawatanRasmi} (${p.jawatankuasaInduk})`
          );
          const ahliTitles = r.ahliPositions.map(
            (p) => `AJK ${p.jawatankuasaInduk}`
          );
          const sessionSummary = {
            totalMata: r.totalMata,
            positionCount: r.positionCount,
            ahliCount: r.ahliCount,
            penyelarasPositions: penyelarasTitles,
            ahliPositions: ahliTitles,
            updatedAt: nowIso,
          };

          const updatePayload: Record<string, any> = {
            [`mysgBySession.${aySlug}`]: sessionSummary,
          };

          // Only overwrite top-level 2026 active summary if saving current 2026 session
          if (isCurrentSession) {
            updatePayload.mataBebanMySG = r.totalMata;
            updatePayload.mysgPositionCount = r.positionCount;
            updatePayload.mysgAhliCount = r.ahliCount;
            updatePayload.committees = [...penyelarasTitles, ...ahliTitles];
          }

          pBatch.set(
            doc(db, 'personnel', r.teacherId),
            deepSanitizeFirestore(updatePayload),
            { merge: true }
          );
        }
      });
      await pBatch.commit();

      // 4. Optional Sync to `makluman_tasks` tagged strictly with `academicYear: ay`
      if (syncToMakluman) {
        const mBatch = writeBatch(db);
        items
          .filter((it) => it.assignedTeacherId && it.tahapBeban === 'BERAT')
          .forEach((it) => {
            const taskDocId = scopedDocId(
              activeSchoolCode,
              `makluman_mysg_${aySlug}_${it.kodMySG}`
            );
            mBatch.set(
              doc(db, 'makluman_tasks', taskDocId),
              deepSanitizeFirestore({
                id: taskDocId,
                schoolCode: activeSchoolCode,
                academicYear: ay,
                title: `[Sesi ${ay}] Mesyuarat & Pelaporan ${it.jawatankuasaInduk}`,
                category: it.pillar,
                kodMySG: it.kodMySG,
                jawatankuasaInduk: it.jawatankuasaInduk,
                jawatanRasmi: it.jawatanRasmi,
                assignedTeacherId: it.assignedTeacherId,
                assignedTeacherName: it.assignedTeacherName,
                ahliList: it.ahliList || [],
                invitedTeachers: [
                  ...(it.assignedTeacherId
                    ? [
                        {
                          teacherId: it.assignedTeacherId,
                          teacherName: it.assignedTeacherName || '',
                          committeeRole: it.jawatanRasmi,
                        },
                      ]
                    : []),
                  ...(it.ahliList || []).map((a) => ({
                    teacherId: a.teacherId,
                    teacherName: a.teacherName,
                    committeeRole: 'Ahli Jawatankuasa (AJK)',
                  })),
                ],
                dueDate: it.customDueDate || `${ay.slice(0, 4)}-03-31`,
                status: 'PENDING',
                updatedAt: nowIso,
              }),
              { merge: true }
            );
          });
        await mBatch.commit().catch((e) => console.warn('Makluman sync notice:', e));
      }

      if (logAuditTrail) {
        await logAuditTrail(
          'UPDATE',
          3,
          assignDocId,
          `Simpan & Segerak 4-Arah Katalog Jawatankuasa MySG Sesi ${ay} (${totalPenyelarasAssigned} Penyelaras, ${totalAhliAssigned} Ahli AJK)`
        );
      }

      if (onSynced) {
        await onSynced();
      }

      setBanner({
        type: 'success',
        text: `Berjaya menyimpan & menyegerakkan ${totalPenyelarasAssigned} Penyelaras & ${totalAhliAssigned} Ahli Jawatankuasa (AJK) bagi ${displaySchoolName} (Sesi ${ay})! Rekod sesi lain kekal terasing & selamat.`,
      });
    } catch (err: any) {
      setBanner({
        type: 'error',
        text: `Gagal menyimpan katalog MySG: ${err?.message || 'Ralat tidak diketahui'}`,
      });
    } finally {
      setSaving(false);
    }
  };

  const activeModalItem = useMemo(
    () => (activeAhliModalKod ? items.find((i) => i.kodMySG === activeAhliModalKod) || null : null),
    [activeAhliModalKod, items]
  );

  const filteredModalPersonnel = useMemo(() => {
    if (!ahliSearchQuery.trim()) return personnel;
    const q = ahliSearchQuery.toLowerCase().trim();
    return personnel.filter(
      (p) =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.position || '').toLowerCase().includes(q)
    );
  }, [personnel, ahliSearchQuery]);

  return (
    <div className="space-y-6">
      {/* Header Card with Interactive Session Switcher & Clone Button */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-indigo-600 font-black text-xs uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4" />
                <span>MySG KPM &amp; SKPM Kualiti@Sekolah (V5 SSOT)</span>
              </div>

              {/* Interactive Session Switcher Badge */}
              <div className="inline-flex items-center gap-1.5 bg-slate-900 text-white px-3 py-1 rounded-xl text-xs font-black">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>Sesi:</span>
                <select
                  value={effectiveSession}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__NEW__') {
                      setShowAddYearInput(true);
                      return;
                    }
                    if (onSelectAcademicYear) onSelectAcademicYear(val);
                  }}
                  className="bg-slate-800 text-amber-300 border border-slate-700 rounded-lg px-2 py-0.5 text-xs font-black outline-none cursor-pointer"
                >
                  {sessionOptions.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                  <option value="__NEW__">+ Sesi Baharu...</option>
                </select>
              </div>

              {/* Clear Status Indicator */}
              {isCurrentSession ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-black">
                  <span>🟢 Sesi Semasa ({effectiveSession})</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-black">
                  <span>
                    🟡 Mod Perancangan Sesi Baharu ({effectiveSession}) — Data Sesi 2026 Kekal Selamat
                  </span>
                </span>
              )}
            </div>

            {showAddYearInput && (
              <div className="mt-2 inline-flex items-center gap-2 bg-slate-100 p-2 rounded-xl border border-slate-300">
                <input
                  type="text"
                  value={customYearInput}
                  onChange={(e) => setCustomYearInput(e.target.value)}
                  placeholder="cth: 2029"
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold w-28"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const clean = customYearInput.trim();
                    if (!clean) return;
                    if (onAddNewAcademicYear) {
                      await onAddNewAcademicYear(clean);
                    } else if (onSelectAcademicYear) {
                      onSelectAcademicYear(clean);
                    }
                    setCustomYearInput('');
                    setShowAddYearInput(false);
                  }}
                  className="px-3 py-1 rounded-lg bg-indigo-600 text-white text-xs font-black cursor-pointer"
                >
                  Pilih Sesi
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddYearInput(false)}
                  className="text-slate-500 hover:text-slate-800 text-xs font-bold px-1"
                >
                  ✕
                </button>
              </div>
            )}

            <h3 className="text-xl font-black text-slate-900 mt-2">
              Agihan Jawatankuasa (Penyelaras &amp; AJK) &amp; Radar Beban Tugas Guru (Sesi {effectiveSession})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              <strong>Penyelaras / Setiausaha / Ketua:</strong> Berat = 3m · Sederhana = 2m · Ringan = 1m (Sasaran Ideal: 10–12 Mata / Guru) ·{' '}
              <strong>Ahli Jawatankuasa (AJK):</strong> 1 Mata Beban setiap jawatankuasa (Tertera dalam Surat Lantikan &amp; Memo Mesyuarat).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 1-Click Clone from Sesi 2026 when viewing 2027/2028+ */}
            {!isCurrentSession && (
              <button
                type="button"
                disabled={cloning}
                onClick={() => handleCloneFromPreviousSession('2026')}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Copy className="w-4 h-4" />
                <span>
                  {cloning ? 'Menyalin...' : '📋 Salin Lantikan dari Sesi 2026'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                onItemsChange(
                  MYSG_DEFAULT_CATALOG.map((i) => ({ ...i, ahliList: [] }))
                )
              }
              className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
            >
              Reset Katalog Asal
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveAndSyncAll}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md cursor-pointer"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>
                {saving
                  ? 'Menyegerak...'
                  : `Simpan & Segerak 4-Arah (Sesi ${effectiveSession})`}
              </span>
            </button>
          </div>
        </div>

        {/* Bottom bar inside Header: Sessional Makluman Sync toggle & Summary */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 font-bold">
            <input
              type="checkbox"
              checked={syncToMakluman}
              onChange={(e) => setSyncToMakluman(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
            />
            <Bell className="w-3.5 h-3.5 text-indigo-600" />
            <span>
              Selaraskan Peringatan Kritikal ke Paparan Makluman (Ditanda khas untuk{' '}
              <strong>Sesi {effectiveSession}</strong> sahaja)
            </span>
          </label>

          <div className="flex items-center gap-3 font-bold text-slate-600">
            <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200">
              Penyelaras Dilantik: {totalPenyelarasAssigned} / {items.length}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 border border-teal-200">
              Jumlah Keahlian AJK (1 Mata / AJK): {totalAhliAssigned}
            </span>
          </div>
        </div>
      </div>

      {banner && (
        <div
          className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between ${
            banner.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : banner.type === 'info'
              ? 'bg-amber-50 border-amber-300 text-amber-950'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {banner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span>{banner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-slate-500 hover:text-slate-800 ml-3"
          >
            ✕
          </button>
        </div>
      )}

      {/* Teacher Workload Radar */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <Award className="w-4 h-4 text-indigo-600" />
            <span>
              Radar Mata Beban Guru (Sesi {effectiveSession}) — Penyelaras + AJK (1 Mata / AJK)
            </span>
          </h4>
          <span className="text-[11px] font-bold text-slate-500">
            Hijau (10–12 Mata: Seimbang) · Merah (&gt;12 Mata: Lebih Beban) · Biru (&lt;10 Mata: Boleh Ditambah)
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {radarList.map((r, idx) => {
            const badgeColor =
              r.totalMata > 12
                ? 'bg-rose-100 text-rose-800 border-rose-300'
                : r.totalMata >= 10
                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                : 'bg-indigo-50 text-indigo-800 border-indigo-200';
            return (
              <div
                key={`${r.teacherId}_${idx}`}
                className="p-3 rounded-2xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-xs font-black text-slate-900 truncate">
                    {r.teacherName}
                  </div>
                  <div className="text-[10px] text-slate-500 font-semibold">
                    {r.positionCount} Penyelaras (B:{r.beratCount} S:{r.sederhanaCount} R:{r.ringanCount})
                  </div>
                  <div className="text-[10px] text-teal-700 font-bold">
                    + {r.ahliCount || 0} Ahli Jawatankuasa ({r.ahliCount || 0}m)
                  </div>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-xl border text-xs font-black shrink-0 ${badgeColor}`}
                >
                  {r.totalMata}m
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters & Table of MySG Positions */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(['ALL', 'PENTADBIRAN', 'KURIKULUM', 'HEM', 'KOKURIKULUM'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPillarFilter(p)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase cursor-pointer transition ${
                  pillarFilter === p
                    ? 'bg-indigo-600 text-white shadow'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {p === 'ALL' ? 'Semua Bidang' : p}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari jawatan / kod / penyelaras / AJK..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Table of MySG Positions */}
        <div className="overflow-x-auto border border-slate-200 rounded-2xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-600 font-black uppercase text-[10px] border-b border-slate-200">
                <th className="py-3 px-4">Kod MySG &amp; SKPM</th>
                <th className="py-3 px-4">Bidang</th>
                <th className="py-3 px-4">Jawatankuasa Induk &amp; Jawatan Rasmi</th>
                <th className="py-3 px-4">Tahap Beban (Penyelaras)</th>
                <th className="py-3 px-4 min-w-[320px]">
                  Pelantikan Guru (Penyelaras + Ahli Jawatankuasa AJK)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-semibold text-slate-800">
              {filteredItems.map((item, idx) => {
                const ahliList = Array.isArray(item.ahliList) ? item.ahliList : [];
                return (
                  <tr key={`${item.kodMySG}_${idx}`} className="hover:bg-slate-50 align-top">
                    <td className="py-3.5 px-4 font-mono text-[11px]">
                      <div className="font-bold text-indigo-700">{item.kodMySG}</div>
                      <div className="text-[10px] text-slate-400">{item.skpmBucket}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-black">
                        {item.pillar}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-black text-slate-900">{item.jawatanRasmi}</div>
                      <div className="text-[11px] text-slate-500">{item.jawatankuasaInduk}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <select
                        value={item.tahapBeban}
                        onChange={(e) =>
                          handleChangeBeban(item.kodMySG, e.target.value as MySGTahapBeban)
                        }
                        className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-bold"
                      >
                        <option value="BERAT">BERAT (3m)</option>
                        <option value="SEDERHANA">SEDERHANA (2m)</option>
                        <option value="RINGAN">RINGAN (1m)</option>
                      </select>
                    </td>
                    <td className="py-3.5 px-4 space-y-2.5">
                      {/* 1. Primary Penyelaras / Ketua / Setiausaha (Load-bearing) */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-black uppercase text-indigo-700">
                            1. Penyelaras / Ketua / Setiausaha ({item.mataBeban} Mata Beban)
                          </span>
                        </div>
                        <select
                          value={item.assignedTeacherId || ''}
                          onChange={(e) => handleAssignTeacher(item.kodMySG, e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-indigo-500"
                        >
                          <option value="">-- Pilih Penyelaras / Setiausaha --</option>
                          {personnel.map((p, pIdx) => (
                            <option key={`${p.id}_${pIdx}`} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* 2. Ahli Jawatankuasa (AJK) Multi-Select Chips & Button (1 Mata Beban) */}
                      <div className="pt-1 border-t border-slate-100">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-[10px] font-black uppercase text-teal-700 flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            <span>
                              2. Ahli Jawatankuasa / AJK ({ahliList.length} Guru · 1 Mata Beban)
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setAhliSearchQuery('');
                              setActiveAhliModalKod(item.kodMySG);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer transition"
                          >
                            <Plus className="w-3 h-3" />
                            <span>+ Tambah Ahli</span>
                          </button>
                        </div>

                        {ahliList.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {ahliList.map((ahli, aIdx) => (
                              <span
                                key={`${item.kodMySG}_ahli_${ahli.teacherId || aIdx}`}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-900 text-[10px] font-bold"
                              >
                                <span>{ahli.teacherName}</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemoveAhliMember(
                                      item.kodMySG,
                                      ahli.teacherId || ahli.teacherName
                                    )
                                  }
                                  className="text-teal-600 hover:text-rose-600 ml-0.5 cursor-pointer"
                                  title="Keluarkan daripada AJK"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400 italic">
                            Tiada Ahli Jawatankuasa (AJK) dipilih. Klik &ldquo;+ Tambah Ahli&rdquo; untuk memilih guru.
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Add Custom Jawatan Row */}
        <div className="pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-6 gap-2 items-end">
          <div>
            <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
              Kod MySG
            </label>
            <input
              type="text"
              value={newKod}
              onChange={(e) => setNewKod(e.target.value)}
              placeholder="JK-BARU"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold"
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
              Bidang
            </label>
            <select
              value={newPillar}
              onChange={(e) => setNewPillar(e.target.value as MySGPillar)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold"
            >
              <option value="PENTADBIRAN">PENTADBIRAN</option>
              <option value="KURIKULUM">KURIKULUM</option>
              <option value="HEM">HEM</option>
              <option value="KOKURIKULUM">KOKURIKULUM</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
              Jawatankuasa Induk
            </label>
            <input
              type="text"
              value={newInduk}
              onChange={(e) => setNewInduk(e.target.value)}
              placeholder="cth: JK Bulan Kebangsaan"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold"
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
              Jawatan Rasmi
            </label>
            <input
              type="text"
              value={newJawatan}
              onChange={(e) => setNewJawatan(e.target.value)}
              placeholder="cth: Penyelaras"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold"
            />
          </div>
          <button
            type="button"
            onClick={handleAddCustomItem}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah</span>
          </button>
        </div>
      </div>

      {/* Multi-Select Ahli Jawatankuasa (AJK) Modal */}
      {activeModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white p-5 flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-teal-400">
                  Pilih Ahli Jawatankuasa (AJK · 1 Mata Beban) — Sesi {effectiveSession}
                </div>
                <h4 className="text-base font-black mt-0.5">
                  {activeModalItem.jawatankuasaInduk}
                </h4>
                <p className="text-xs text-slate-300 mt-0.5">
                  Penyelaras Utama:{' '}
                  <strong className="text-amber-300">
                    {activeModalItem.assignedTeacherName || 'Belum Dilantik'}
                  </strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveAhliModalKod(null)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={ahliSearchQuery}
                    onChange={(e) => setAhliSearchQuery(e.target.value)}
                    placeholder="Cari nama guru..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-teal-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectAllAhliInModal(activeModalItem.kodMySG, true)}
                  className="px-2.5 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-[10px] font-black uppercase cursor-pointer"
                >
                  Pilih Semua
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectAllAhliInModal(activeModalItem.kodMySG, false)}
                  className="px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-black uppercase cursor-pointer"
                >
                  Kosongkan
                </button>
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-2xl">
                {filteredModalPersonnel.map((p, idx) => {
                  const isPenyelaras = p.id === activeModalItem.assignedTeacherId;
                  const isSelected = (activeModalItem.ahliList || []).some(
                    (a) =>
                      a.teacherId === p.id ||
                      a.teacherName.toUpperCase() === (p.name || '').toUpperCase()
                  );
                  return (
                    <div
                      key={`${p.id}_${idx}`}
                      onClick={() => {
                        if (!isPenyelaras) {
                          handleToggleAhliMember(activeModalItem.kodMySG, p);
                        }
                      }}
                      className={`p-3 flex items-center justify-between gap-3 text-xs transition ${
                        isPenyelaras
                          ? 'bg-amber-50/70 text-slate-500 cursor-not-allowed'
                          : isSelected
                          ? 'bg-teal-50/70 text-teal-950 font-bold cursor-pointer'
                          : 'hover:bg-slate-50 text-slate-800 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {isPenyelaras ? (
                          <Award className="w-4 h-4 text-amber-600 shrink-0" />
                        ) : isSelected ? (
                          <CheckSquare className="w-4 h-4 text-teal-600 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300 shrink-0" />
                        )}
                        <div className="truncate">
                          <div className="font-bold uppercase truncate">{p.name}</div>
                          <div className="text-[10px] text-slate-400">
                            {p.position || 'GURU'} {p.grade ? `· ${p.grade}` : ''}
                          </div>
                        </div>
                      </div>

                      {isPenyelaras ? (
                        <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-black shrink-0">
                          PENYELARAS UTAMA
                        </span>
                      ) : isSelected ? (
                        <span className="px-2 py-0.5 rounded-md bg-teal-100 text-teal-800 border border-teal-300 text-[10px] font-black shrink-0">
                          AHLI (AJK)
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs font-bold text-slate-600">
                  Terpilih:{' '}
                  <strong className="text-teal-700">
                    {(activeModalItem.ahliList || []).length} Guru AJK
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => setActiveAhliModalKod(null)}
                  className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase cursor-pointer"
                >
                  Selesai
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MySGJawatankuasaTab;
