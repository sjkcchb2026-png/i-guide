import React, { useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  Filter,
  Layers,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  UploadCloud,
  UserCheck,
  Users,
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { GovernanceAssignment, PersonnelProfile, UserProfile } from '../../types';
import {
  computeMataBeban,
  computeTeacherWorkloadRadar,
  exportMySGWorkbook,
  getPillarSummaries,
  getSubCommitteeGroups,
  MYSG_DEFAULT_CATALOG,
  MySGJawatankuasaItem,
  MySGPillar,
  MySGTahapBeban,
  parseMySGWorkbookImport,
  PILLAR_DISPLAY_META,
} from '../../utils/mysgJawatankuasaCatalog';
import { deepSanitizeFirestore } from '../../utils/sanitizeFirestore';
import { belongsToSchool, scopedDocId } from '../../utils/schoolTenant';

interface MySGJawatankuasaTabProps {
  activeSchoolCode: string;
  displaySchoolName: string;
  selectedAcademicYear: string;
  personnel: PersonnelProfile[];
  currentUser?: UserProfile | null;
  items: MySGJawatankuasaItem[];
  onItemsChange: (next: MySGJawatankuasaItem[]) => void;
  onSynced?: () => Promise<void> | void;
  logAuditTrail?: (
    actionType: 'CREATE' | 'UPDATE' | 'DELETE' | 'STATE_CHANGE' | 'AUTHORIZE' | 'IMPORT' | 'ROLLBACK',
    layer: number,
    entityId: string,
    details: string
  ) => Promise<void>;
}

const PILLAR_BADGE_CLASSES: Record<MySGPillar, string> = {
  PENTADBIRAN: 'bg-blue-50 text-blue-700 border-blue-200',
  KURIKULUM: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  HEM: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  KOKURIKULUM: 'bg-amber-50 text-amber-800 border-amber-200',
};

const BEBAN_BADGE_CLASSES: Record<MySGTahapBeban, string> = {
  'BERAT (重)': 'bg-rose-50 text-rose-700 border-rose-200',
  'SEDERHANA (中)': 'bg-amber-50 text-amber-800 border-amber-200',
  'RINGAN (轻)': 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

function inferGovernanceType(item: MySGJawatankuasaItem): GovernanceAssignment['governanceType'] {
  const title = item.jawatanRasmi.toUpperCase();
  const code = item.kodMySG.toUpperCase();
  if (title.includes('SETIAUSAHA') || title.includes('GURU DATA') || title.includes('PEGAWAI ASET') || title.includes('GURU KELAS')) {
    return 'PORTFOLIO';
  }
  if (title.includes('PENYELARAS') || code.includes('KOAKADEMIK')) {
    return 'COORDINATOR';
  }
  return 'COMMITTEE';
}

function inferGovernanceRole(item: MySGJawatankuasaItem): GovernanceAssignment['role'] {
  const title = item.jawatanRasmi.toUpperCase();
  if (title.includes('SETIAUSAHA')) return 'SECRETARY';
  if (title.includes('KETUA') || title.includes('PENGERUSI')) return 'CHAIR';
  if (title.includes('PENYELARAS')) return 'COORDINATOR_LEAD';
  return 'COMMITTEE_MEMBER';
}

function slugifyKey(raw: string): string {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

export const MySGJawatankuasaTab: React.FC<MySGJawatankuasaTabProps> = ({
  activeSchoolCode,
  displaySchoolName,
  selectedAcademicYear,
  personnel,
  currentUser,
  items,
  onItemsChange,
  onSynced,
  logAuditTrail,
}) => {
  const [activePillar, setActivePillar] = useState<MySGPillar | 'ALL'>('ALL');
  const [activeSubCommittee, setActiveSubCommittee] = useState<string>('ALL');
  const [selectedTeacherFilter, setSelectedTeacherFilter] = useState<string>('ALL');
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showRadarPanel, setShowRadarPanel] = useState(true);
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
  const [syncTakwimOnSave, setSyncTakwimOnSave] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncingMakluman, setSyncingMakluman] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const sortedPersonnel = useMemo(() => {
    return [...personnel]
      .filter((p) => p.name)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [personnel]);

  const pillarSummaries = useMemo(() => getPillarSummaries(items), [items]);
  const totalPositions = items.length;
  const totalMata = useMemo(() => items.reduce((s, i) => s + (Number(i.mataBeban) || 0), 0), [items]);
  const totalAssigned = useMemo(
    () => items.filter((i) => Boolean(i.assignedTeacherId || i.assignedTeacherName)).length,
    [items]
  );

  const subCommitteeOptions = useMemo(
    () => getSubCommitteeGroups(items, activePillar),
    [items, activePillar]
  );

  const teacherRadar = useMemo(
    () => computeTeacherWorkloadRadar(items, sortedPersonnel),
    [items, sortedPersonnel]
  );

  const radarSummary = useMemo(() => {
    const optimum = teacherRadar.filter((r) => r.status === 'OPTIMUM').length;
    const kurang = teacherRadar.filter((r) => r.status === 'KURANG').length;
    const berat = teacherRadar.filter((r) => r.status === 'BERAT').length;
    const avg =
      teacherRadar.length > 0
        ? (teacherRadar.reduce((s, r) => s + r.totalMata, 0) / teacherRadar.length).toFixed(1)
        : '0.0';
    return { optimum, kurang, berat, avg };
  }, [teacherRadar]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (activePillar !== 'ALL' && item.pillar !== activePillar) return false;
      if (activeSubCommittee !== 'ALL' && item.jawatankuasaInduk !== activeSubCommittee) return false;
      if (onlyUnassigned && (item.assignedTeacherId || item.assignedTeacherName)) return false;
      if (selectedTeacherFilter !== 'ALL') {
        const matchId = item.assignedTeacherId && item.assignedTeacherId === selectedTeacherFilter;
        const matchName =
          item.assignedTeacherName &&
          sortedPersonnel.find((p) => p.id === selectedTeacherFilter)?.name?.toUpperCase() ===
            item.assignedTeacherName.toUpperCase();
        if (!matchId && !matchName) return false;
      }
      if (q) {
        const haystack = [
          item.kodMySG,
          item.jawatankuasaInduk,
          item.jawatanRasmi,
          item.perincianTugas,
          item.sistemKPM,
          item.peringatanKritikal,
          item.skpmStandardCode,
          item.assignedTeacherName,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [items, activePillar, activeSubCommittee, onlyUnassigned, selectedTeacherFilter, searchQuery, sortedPersonnel]);

  const handleAssignTeacher = (bil: number, teacherId: string) => {
    const found = sortedPersonnel.find((p) => p.id === teacherId);
    const next = items.map((item) =>
      item.bil === bil
        ? {
            ...item,
            assignedTeacherId: found ? found.id : '',
            assignedTeacherName: found ? found.name : '',
          }
        : item
    );
    onItemsChange(next);
  };

  const handleChangeTahapBeban = (bil: number, newTahap: MySGTahapBeban) => {
    const next = items.map((item) =>
      item.bil === bil
        ? {
            ...item,
            tahapBeban: newTahap,
            mataBeban: computeMataBeban(newTahap),
          }
        : item
    );
    onItemsChange(next);
  };

  const handleChangeCustomDueDate = (bil: number, dateStr: string) => {
    const next = items.map((item) => (item.bil === bil ? { ...item, customDueDate: dateStr } : item));
    onItemsChange(next);
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const { updatedItems, matchedCount, assignedCount } = parseMySGWorkbookImport(
        buffer,
        items,
        sortedPersonnel.map((p) => ({ id: p.id, name: p.name }))
      );
      onItemsChange(updatedItems);
      setStatusBanner({
        type: 'success',
        message: `Berjaya mengimport fail "${file.name}": ${matchedCount} jawatan MySG dipadankan & ${assignedCount} pelantikan guru dikemas kini. Sila klik "Simpan & Selaras SSOT" untuk menyimpan ke pangkalan data.`,
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        message: `Gagal mengimport fail Excel: ${err?.message || String(err)}`,
      });
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const handleResetDefault = () => {
    if (
      !window.confirm(
        'Pulihkan kesemua 79 jawatan & 159 mata beban ke tetapan rasmi MySG v5? Pelantikan guru semasa dalam jadual ini akan dikosongkan sehingga anda simpan.'
      )
    ) {
      return;
    }
    onItemsChange(MYSG_DEFAULT_CATALOG.map((i) => ({ ...i })));
    setActivePillar('ALL');
    setActiveSubCommittee('ALL');
    setSelectedTeacherFilter('ALL');
    setStatusBanner({
      type: 'info',
      message: 'Katalog MySG v5 (79 jawatan / 159 Mata Beban) telah dipulihkan ke tetapan asal.',
    });
  };

  const pushCriticalRemindersToMakluman = async (sourceItems: MySGJawatankuasaItem[]) => {
    const aySlug = (selectedAcademicYear || '2026').replace(/\//g, '-');
    const yearPrefix = (selectedAcademicYear || '2026').slice(0, 4);
    const defaultDueDate = `${yearPrefix}-10-31`;
    const assignedWithReminders = sourceItems.filter(
      (i) => Boolean(i.peringatanKritikal) && Boolean(i.assignedTeacherId || i.assignedTeacherName)
    );

    if (assignedWithReminders.length === 0) {
      return 0;
    }

    const CHUNK = 400;
    for (let i = 0; i < assignedWithReminders.length; i += CHUNK) {
      const slice = assignedWithReminders.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      slice.forEach((item) => {
        const docId = scopedDocId(activeSchoolCode, `mysg_rem_${aySlug}_${slugifyKey(item.kodMySG)}`);
        const taskPayload = deepSanitizeFirestore({
          id: docId,
          schoolCode: activeSchoolCode,
          title: `[MySG ${item.kodMySG}] ${item.jawatanRasmi}`,
          description: `${item.peringatanKritikal} (Sistem KPM: ${item.sistemKPM} | ${item.skpmStandardCode})`,
          domain: item.pillar,
          category: 'TUGASAN',
          source: 'AD_HOC',
          dueDate: item.customDueDate || defaultDueDate,
          tindakanLabel: item.assignedTeacherName || item.cadanganPelaksana,
          priority: item.tahapBeban === 'BERAT (重)' ? 'TINGGI' : 'SEDERHANA',
          targetType: item.assignedTeacherId ? 'GURU_TERPILIH' : 'SEMUA_GURU',
          targetTeacherIds: item.assignedTeacherId ? [item.assignedTeacherId] : [],
          arahanTindakan: item.peringatanKritikal,
          completions: {},
          whatsappLogs: {},
          createdByTeacherId: currentUser?.uid || 'admin',
          createdByName: currentUser?.name || 'Pentadbir MySG SSOT',
          createdAt: new Date().toISOString(),
        });
        batch.set(doc(db, 'makluman_tasks', docId), taskPayload, { merge: true });
      });
      await batch.commit();
    }
    return assignedWithReminders.length;
  };

  const handleSaveAndSyncSSOT = async () => {
    setSaving(true);
    setStatusBanner(null);
    const ay = selectedAcademicYear || '2026/2027';
    const aySlug = ay.replace(/\//g, '-');
    try {
      // 1. Save master MySG v5 catalog into `school_governance` (permitted by firestore.rules)
      const govDocId = scopedDocId(activeSchoolCode, `mysg_jawatankuasa_${aySlug}`);
      const batchCatalog = writeBatch(db);
      batchCatalog.set(
        doc(db, 'school_governance', govDocId),
        deepSanitizeFirestore({
          id: govDocId,
          schoolCode: activeSchoolCode,
          academicYear: ay,
          type: 'MYSG_JAWATANKUASA_V5',
          version: 'v5',
          totalPositions: items.length,
          totalMata,
          assignedCount: totalAssigned,
          items,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser?.email || currentUser?.name || 'admin',
        }),
        { merge: true }
      );
      await batchCatalog.commit();

      // 2. Sync assigned MySG positions -> `governance_assignments` (preserving manual non-MySG assignments)
      const existingGaSnap = await getDocs(
        query(collection(db, 'governance_assignments'), where('academicYear', '==', ay))
      );
      const staleMySGDocs = existingGaSnap.docs.filter((d) => {
        const data = d.data() as any;
        return belongsToSchool(data, activeSchoolCode) && (data.source === 'MYSG_V5' || d.id.includes('_mysg_'));
      });

      const assignedItems = items.filter((item) => Boolean(item.assignedTeacherId));

      // Delete stale MySG assignments and write current ones in safe batches
      for (let i = 0; i < staleMySGDocs.length; i += 400) {
        const b = writeBatch(db);
        staleMySGDocs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
        await b.commit();
      }

      for (let i = 0; i < assignedItems.length; i += 400) {
        const b = writeBatch(db);
        assignedItems.slice(i, i + 400).forEach((item) => {
          const gaId = scopedDocId(activeSchoolCode, `mysg_${aySlug}_${slugifyKey(item.kodMySG)}`);
          const gaPayload = deepSanitizeFirestore({
            id: gaId,
            schoolCode: activeSchoolCode,
            personnelId: item.assignedTeacherId,
            personnelName: item.assignedTeacherName.toUpperCase(),
            academicYear: ay,
            governanceType: inferGovernanceType(item),
            entityName: `${item.kodMySG} · ${item.jawatanRasmi}`.toUpperCase(),
            role: inferGovernanceRole(item),
            raciRole: 'R',
            effectiveDate: `${ay.slice(0, 4)}-01-01`,
            status: 'Active',
            source: 'MYSG_V5',
            pillar: item.pillar,
            kodMySG: item.kodMySG,
            mataBeban: item.mataBeban,
            tahapBeban: item.tahapBeban,
            skpmStandardCode: item.skpmStandardCode,
          });
          b.set(doc(db, 'governance_assignments', gaId), gaPayload, { merge: true });
        });
        await b.commit();
      }

      // 3. Update `personnel` records with `mataBebanMySG` & `mysgPositions` so Profil Guru SSOT reflects workload directly
      const radarMap = new Map(teacherRadar.map((r) => [r.teacherId, r]));
      const personnelToUpdate = sortedPersonnel.filter((p) => p.id);
      for (let i = 0; i < personnelToUpdate.length; i += 400) {
        const b = writeBatch(db);
        personnelToUpdate.slice(i, i + 400).forEach((p) => {
          const r = radarMap.get(p.id);
          const mysgTitles = r ? r.positions.map((pos) => `${pos.kodMySG}: ${pos.jawatanRasmi}`) : [];
          b.set(
            doc(db, 'personnel', p.id),
            deepSanitizeFirestore({
              schoolCode: activeSchoolCode,
              mataBebanMySG: r?.totalMata || 0,
              mysgPositionCount: r?.positionCount || 0,
              mysgPositions: mysgTitles,
            }),
            { merge: true }
          );
        });
        await b.commit().catch((err) => {
          console.warn('Background personnel MySG workload sync warning:', err);
        });
      }

      // 4. Optional auto-sync critical Takwim reminders to `makluman_tasks`
      let reminderCount = 0;
      if (syncTakwimOnSave) {
        reminderCount = await pushCriticalRemindersToMakluman(items);
      }

      if (logAuditTrail) {
        await logAuditTrail(
          'UPDATE',
          2,
          govDocId,
          `Simpan & selaras MySG v5 (${totalAssigned}/${items.length} jawatan dilantik, ${totalMata} Mata Beban, ${reminderCount} peringatan Paparan Makluman).`
        );
      }

      if (onSynced) await onSynced();

      setStatusBanner({
        type: 'success',
        message: `Berjaya disimpan & diselaraskan ke SSOT! ${totalAssigned}/${items.length} jawatan MySG disimpan ke Profil Guru & Governance${
          syncTakwimOnSave ? `, dan ${reminderCount} peringatan kritikal telah dihantar ke Paparan Makluman.` : '.'
        }`,
      });
    } catch (err: any) {
      console.error('Error saving MySG catalog:', err);
      setStatusBanner({
        type: 'error',
        message: `Gagal menyimpan katalog MySG: ${err?.message || String(err)}`,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSyncRemindersOnly = async () => {
    setSyncingMakluman(true);
    setStatusBanner(null);
    try {
      const count = await pushCriticalRemindersToMakluman(items);
      setStatusBanner({
        type: count > 0 ? 'success' : 'info',
        message:
          count > 0
            ? `Berjaya menyelaraskan ${count} Peringatan Kritikal MySG ke modul Paparan Makluman untuk guru yang dilantik.`
            : 'Tiada jawatan yang sudah dilantik guru untuk dihantar ke Paparan Makluman. Sila lantik guru terlebih dahulu.',
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        message: `Gagal menyelaraskan peringatan ke Paparan Makluman: ${err?.message || String(err)}`,
      });
    } finally {
      setSyncingMakluman(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* TOP CONTROL CARD */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-md space-y-6">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 font-black text-[10px] uppercase tracking-wider">
                MySG KPM · Versi 5 SSOT
              </span>
              <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-600 font-bold text-[10px] uppercase">
                Sesi {selectedAcademicYear || '2026/2027'}
              </span>
              <span className="px-2.5 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-black text-[10px] uppercase">
                {totalAssigned} / {totalPositions} Dilantik ({totalMata} Mata Beban)
              </span>
            </div>
            <h3 className="text-xl font-black italic uppercase tracking-tight text-slate-800">
              Jawatankuasa MySG, Analisis Beban Tugas &amp; Takwim Peringatan
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Punca tunggal rasmi (SSOT) bagi 79 jawatan dalam 4 teras (termasuk PitS, PLaN, PKL, Sivik &amp; 5 Penyelaras Koakademik) untuk Surat Lantikan, Profil Guru, Paparan Makluman &amp; OPR.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImportExcel}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs uppercase px-3.5 py-2.5 rounded-xl transition-all cursor-pointer"
              title="Import pelantikan & tahap beban daripada fail Excel v5"
            >
              <UploadCloud size={14} /> Import .xlsx
            </button>
            <button
              type="button"
              onClick={() =>
                exportMySGWorkbook(
                  items,
                  sortedPersonnel,
                  displaySchoolName,
                  activeSchoolCode,
                  selectedAcademicYear || '2026/2027'
                )
              }
              className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-extrabold text-xs uppercase px-3.5 py-2.5 rounded-xl transition-all cursor-pointer"
            >
              <Download size={14} /> Eksport v5 .xlsx
            </button>
            <button
              type="button"
              onClick={handleSyncRemindersOnly}
              disabled={syncingMakluman}
              className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-extrabold text-xs uppercase px-3.5 py-2.5 rounded-xl transition-all cursor-pointer disabled:opacity-50"
            >
              <Bell size={14} className={syncingMakluman ? 'animate-pulse' : ''} />
              <span>{syncingMakluman ? 'Menghantar...' : 'Peringatan -> Makluman'}</span>
            </button>
            <button
              type="button"
              onClick={handleResetDefault}
              className="flex items-center gap-1.5 bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-600 hover:text-rose-700 font-extrabold text-xs uppercase px-3 py-2.5 rounded-xl transition-all cursor-pointer"
              title="Pulihkan 79 jawatan & 159 mata beban asal v5"
            >
              <RotateCcw size={14} /> Reset v5
            </button>
            <button
              type="button"
              onClick={handleSaveAndSyncSSOT}
              disabled={saving}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase px-5 py-2.5 rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              <span>{saving ? 'Menyimpan...' : 'Simpan & Selaras SSOT'}</span>
            </button>
          </div>
        </div>

        {/* Sync Option & Status Banner */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={syncTakwimOnSave}
              onChange={(e) => setSyncTakwimOnSave(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-0"
            />
            <span>Selaraskan Peringatan Kritikal ke Paparan Makluman &amp; Profil Guru secara automatik semasa Simpan</span>
          </label>
          <span className="text-[11px] font-bold text-slate-400">
            Skala Mata: <strong className="text-rose-600">BERAT = 3</strong> ·{' '}
            <strong className="text-amber-600">SEDERHANA = 2</strong> ·{' '}
            <strong className="text-emerald-600">RINGAN = 1</strong>
          </span>
        </div>

        {statusBanner && (
          <div
            className={`p-4 rounded-2xl border flex items-center justify-between gap-3 text-xs font-bold ${
              statusBanner.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : statusBanner.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-blue-50 border-blue-200 text-blue-800'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {statusBanner.type === 'success' ? (
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              ) : statusBanner.type === 'error' ? (
                <AlertCircle size={18} className="text-rose-600 shrink-0" />
              ) : (
                <Sparkles size={18} className="text-blue-600 shrink-0" />
              )}
              <span>{statusBanner.message}</span>
            </div>
            <button onClick={() => setStatusBanner(null)} className="text-xs opacity-60 hover:opacity-100">
              ✕
            </button>
          </div>
        )}

        {/* ============================================================ */}
        {/* TEACHER WORKLOAD RADAR (Keseimbangan Mata Beban Guru)        */}
        {/* ============================================================ */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <BarChart3 size={18} className="text-indigo-600" />
              <div>
                <h4 className="text-sm font-black uppercase tracking-tight text-slate-800">
                  Radar Keseimbangan Mata Beban Guru (Sasaran 10–12 Mata)
                </h4>
                <p className="text-[11px] text-slate-500 font-semibold">
                  Klik kad guru untuk menapis senarai jawatan guru tersebut. Purata semasa:{' '}
                  <strong className="text-slate-800">{radarSummary.avg} Mata</strong> · Optimum:{' '}
                  <strong className="text-emerald-600">{radarSummary.optimum}</strong> · Kurang:{' '}
                  <strong className="text-amber-600">{radarSummary.kurang}</strong> · Berat (&gt;12):{' '}
                  <strong className="text-rose-600">{radarSummary.berat}</strong>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedTeacherFilter !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setSelectedTeacherFilter('ALL')}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-[11px] font-black uppercase cursor-pointer"
                >
                  Papar Semua Guru ✕
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowRadarPanel((v) => !v)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-[11px] font-black uppercase cursor-pointer hover:bg-slate-100"
              >
                {showRadarPanel ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                <span>{showRadarPanel ? 'Tutup Radar' : 'Buka Radar'}</span>
              </button>
            </div>
          </div>

          {showRadarPanel && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3 max-h-72 overflow-y-auto pr-1">
              {teacherRadar.map((entry) => {
                const isSelected = selectedTeacherFilter === entry.teacherId;
                const badgeStyle =
                  entry.status === 'OPTIMUM'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : entry.status === 'BERAT'
                    ? 'bg-rose-100 text-rose-800 border-rose-300'
                    : 'bg-amber-50 text-amber-800 border-amber-200';
                const barColor =
                  entry.status === 'OPTIMUM'
                    ? 'bg-emerald-500'
                    : entry.status === 'BERAT'
                    ? 'bg-rose-500'
                    : 'bg-amber-400';
                const widthPct = Math.min(100, Math.round((entry.totalMata / 15) * 100));
                return (
                  <button
                    key={entry.teacherId}
                    type="button"
                    onClick={() =>
                      setSelectedTeacherFilter((prev) => (prev === entry.teacherId ? 'ALL' : entry.teacherId))
                    }
                    className={`text-left p-3 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-300 shadow-sm'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <span className="text-[11px] font-black text-slate-800 uppercase line-clamp-1">
                        {entry.teacherName}
                      </span>
                      <span className={`shrink-0 px-1.5 py-0.5 rounded-md border text-[10px] font-black ${badgeStyle}`}>
                        {entry.totalMata} Mata
                      </span>
                    </div>
                    <div className="mt-1.5 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${widthPct}%` }} />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] font-bold text-slate-400">
                      <span>{entry.positionCount} Jawatan</span>
                      <span>
                        {entry.status === 'OPTIMUM'
                          ? 'Seimbang'
                          : entry.status === 'BERAT'
                          ? 'Tinggi (>12)'
                          : 'Boleh Tambah'}
                      </span>
                    </div>
                  </button>
                );
              })}
              {teacherRadar.length === 0 && (
                <div className="col-span-full py-6 text-center text-xs text-slate-400 italic">
                  Tiada senarai guru aktif ditemui dalam Profil Guru.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2-LEVEL DRILL-DOWN PILLARS & SEARCH MATRIX CARD               */}
      {/* ============================================================ */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-md space-y-5">
        {/* LEVEL 1: 4 PILLARS */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-400">
            <Layers size={14} />
            <span>Aras 1: Pilih Teras Utama MySG</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setActivePillar('ALL');
                setActiveSubCommittee('ALL');
              }}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase border transition-all cursor-pointer ${
                activePillar === 'ALL'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              Semua ({totalPositions} Jawatan · {totalMata} Mata)
            </button>
            {pillarSummaries.map((s) => {
              const active = activePillar === s.pillar;
              return (
                <button
                  key={s.pillar}
                  type="button"
                  onClick={() => {
                    setActivePillar(s.pillar);
                    setActiveSubCommittee('ALL');
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase border transition-all cursor-pointer ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {s.label} ({s.totalPositions} · {s.totalMata} Mata)
                </button>
              );
            })}
          </div>
        </div>

        {/* LEVEL 2: SUB-COMMITTEE PILLS */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-400">
              <Filter size={14} />
              <span>Aras 2: Tapis Jawatankuasa Induk / Sub-Unit</span>
            </div>
            <span className="text-[11px] font-bold text-slate-400">
              Menunjukkan <strong className="text-slate-700">{filteredItems.length}</strong> daripada {items.length} jawatan
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto py-0.5">
            <button
              type="button"
              onClick={() => setActiveSubCommittee('ALL')}
              className={`px-3 py-1 rounded-lg text-[11px] font-extrabold border transition-all cursor-pointer ${
                activeSubCommittee === 'ALL'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              Semua Sub-Jawatankuasa
            </button>
            {subCommitteeOptions.map((sub) => (
              <button
                key={sub}
                type="button"
                onClick={() => setActiveSubCommittee(sub)}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                  activeSubCommittee === sub
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {sub}
              </button>
            ))}
          </div>
        </div>

        {/* SEARCH & FILTER BAR */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 pt-2 border-t border-slate-100">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari kod MySG (cth: PitS, PLaN, PKL, SIVIK, KOAKADEMIK), jawatan rasmi, sistem KPM, atau nama guru..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500"
            />
          </div>

          <select
            value={selectedTeacherFilter}
            onChange={(e) => setSelectedTeacherFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">Semua Guru ({sortedPersonnel.length})</option>
            {sortedPersonnel.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setOnlyUnassigned((v) => !v)}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase border transition-all cursor-pointer ${
              onlyUnassigned
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Belum Dilantik ({items.length - totalAssigned})
          </button>
        </div>

        {/* ============================================================ */}
        {/* MAIN 12-COLUMN INTERACTIVE WORKLOAD TABLE                    */}
        {/* ============================================================ */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-[10px] font-black uppercase tracking-wider border-b border-slate-200">
                <th className="px-3 py-3.5 w-12 text-center">Bil</th>
                <th className="px-4 py-3.5 min-w-[170px]">Teras / Kod MySG &amp; SKPM</th>
                <th className="px-4 py-3.5 min-w-[260px]">Jawatankuasa Induk &amp; Jawatan Rasmi</th>
                <th className="px-4 py-3.5 min-w-[175px]">Tahap &amp; Mata Beban</th>
                <th className="px-4 py-3.5 min-w-[230px]">Guru Dilantik (Profil Guru)</th>
                <th className="px-4 py-3.5 min-w-[260px]">Sistem KPM &amp; Peringatan Kritikal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredItems.map((item) => {
                const isExpanded = expandedRowKey === item.kodMySG;
                return (
                  <React.Fragment key={`${item.bil}_${item.kodMySG}`}>
                    <tr className="hover:bg-slate-50/70 transition-colors align-top">
                      <td className="px-3 py-3.5 text-center font-mono font-black text-slate-400">
                        {item.bil}
                      </td>
                      <td className="px-4 py-3.5 space-y-1.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md border text-[9px] font-black uppercase ${PILLAR_BADGE_CLASSES[item.pillar]}`}
                        >
                          {item.pillar}
                        </span>
                        <div className="font-mono text-[11px] font-black text-slate-800">
                          {item.kodMySG}
                        </div>
                        <div className="text-[10px] font-bold text-slate-400">
                          SKPM: <span className="text-slate-600">{item.skpmStandardCode}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 space-y-1">
                        <div className="text-[10px] font-extrabold uppercase text-slate-400">
                          {item.jawatankuasaInduk}
                        </div>
                        <div className="text-xs font-black text-slate-900">
                          {item.jawatanRasmi}
                        </div>
                        <div className="text-[11px] text-slate-500 leading-snug">
                          {item.analisisBeban}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedRowKey((prev) => (prev === item.kodMySG ? null : item.kodMySG))
                          }
                          className="text-[10px] font-black text-blue-600 hover:text-blue-800 uppercase inline-flex items-center gap-1 pt-0.5 cursor-pointer"
                        >
                          <span>{isExpanded ? 'Tutup Perincian' : 'Lihat Perincian Tugas (12 Kolum)'}</span>
                          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                      </td>
                      <td className="px-4 py-3.5 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <select
                            value={item.tahapBeban}
                            onChange={(e) =>
                              handleChangeTahapBeban(item.bil, e.target.value as MySGTahapBeban)
                            }
                            className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-black outline-none cursor-pointer ${BEBAN_BADGE_CLASSES[item.tahapBeban]}`}
                          >
                            <option value="BERAT (重)">BERAT (重) · 3 Mata</option>
                            <option value="SEDERHANA (中)">SEDERHANA (中) · 2 Mata</option>
                            <option value="RINGAN (轻)">RINGAN (轻) · 1 Mata</option>
                          </select>
                          <span className="px-2 py-1 rounded-lg bg-slate-900 text-white font-mono text-[11px] font-black">
                            {item.mataBeban}M
                          </span>
                        </div>
                        <div className="text-[10px] font-bold text-slate-400">
                          Cadangan: <span className="text-slate-600">{item.cadanganPelaksana}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 space-y-1.5">
                        <select
                          value={item.assignedTeacherId || ''}
                          onChange={(e) => handleAssignTeacher(item.bil, e.target.value)}
                          className={`w-full rounded-xl border px-3 py-2 text-xs font-bold outline-none cursor-pointer ${
                            item.assignedTeacherId
                              ? 'bg-blue-50/70 border-blue-300 text-slate-900'
                              : 'bg-white border-slate-200 text-slate-400'
                          }`}
                        >
                          <option value="">— Belum Dilantik —</option>
                          {sortedPersonnel.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        {item.assignedTeacherName && !item.assignedTeacherId && (
                          <div className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                            Import Excel: {item.assignedTeacherName}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 space-y-1.5">
                        <div className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-bold">
                          {item.sistemKPM}
                        </div>
                        <p className="text-[11px] font-semibold text-amber-900 bg-amber-50/80 border border-amber-200/80 rounded-lg p-2 leading-snug">
                          {item.peringatanKritikal}
                        </p>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50/90 border-b border-slate-200">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                            <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                              <div className="text-[10px] font-black uppercase text-slate-400 mb-1">
                                Perincian Tugas Rasmi (Surat Lantikan)
                              </div>
                              <p className="text-slate-700 font-semibold leading-relaxed">
                                {item.perincianTugas}
                              </p>
                            </div>
                            <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2">
                              <div>
                                <div className="text-[10px] font-black uppercase text-slate-400">
                                  Analisis Beban &amp; Cadangan Pelaksana
                                </div>
                                <p className="text-slate-700 font-semibold mt-0.5">
                                  {item.analisisBeban} · <span className="text-indigo-700">{item.cadanganPelaksana}</span>
                                </p>
                              </div>
                              <div>
                                <div className="text-[10px] font-black uppercase text-slate-400">
                                  Sistem KPM &amp; Standard SKPM
                                </div>
                                <p className="text-slate-700 font-mono font-bold mt-0.5">
                                  {item.sistemKPM} ({item.skpmStandardCode})
                                </p>
                              </div>
                            </div>
                            <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2">
                              <div className="text-[10px] font-black uppercase text-slate-400">
                                Tarikh Akhir Takwim (Paparan Makluman)
                              </div>
                              <input
                                type="date"
                                value={item.customDueDate || `${(selectedAcademicYear || '2026').slice(0, 4)}-10-31`}
                                onChange={(e) => handleChangeCustomDueDate(item.bil, e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono font-bold text-slate-800"
                              />
                              <p className="text-[10px] text-slate-400">
                                Digunakan apabila peringatan kritikal dihantar ke Paparan Makluman.
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 font-bold text-xs">
                    Tiada jawatan MySG sepadan dengan penapis carian anda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
