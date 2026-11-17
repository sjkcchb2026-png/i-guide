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
} from 'lucide-react';
import { doc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { PersonnelProfile, UserProfile } from '../../types';
import {
  MySGJawatankuasaItem,
  MySGPillar,
  MySGTahapBeban,
  MYSG_DEFAULT_CATALOG,
  computeTeacherWorkloadRadar,
} from '../../utils/mysgJawatankuasaCatalog';
import { scopedDocId } from '../../utils/schoolTenant';
import { deepSanitizeFirestore } from '../../utils/sanitizeFirestore';

interface Props {
  activeSchoolCode: string;
  displaySchoolName: string;
  selectedAcademicYear: string;
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
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Add custom jawatankuasa state
  const [newKod, setNewKod] = useState<string>('');
  const [newPillar, setNewPillar] = useState<MySGPillar>('KURIKULUM');
  const [newInduk, setNewInduk] = useState<string>('');
  const [newJawatan, setNewJawatan] = useState<string>('');
  const [newBeban, setNewBeban] = useState<MySGTahapBeban>('SEDERHANA');

  const radarList = useMemo(
    () => computeTeacherWorkloadRadar(items, personnel),
    [items, personnel]
  );

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (pillarFilter !== 'ALL' && item.pillar !== pillarFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          item.kodMySG.toLowerCase().includes(q) ||
          item.jawatankuasaInduk.toLowerCase().includes(q) ||
          item.jawatanRasmi.toLowerCase().includes(q) ||
          (item.assignedTeacherName || '').toLowerCase().includes(q)
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
    };

    onItemsChange([...items, nextItem]);
    setNewKod('');
    setNewInduk('');
    setNewJawatan('');
  };

  const handleSaveAndSyncAll = async () => {
    setSaving(true);
    setBanner(null);
    try {
      const ay = selectedAcademicYear || '2026';
      const aySlug = ay.replace(/\//g, '-');
      const govDocId = scopedDocId(activeSchoolCode, `mysg_jawatankuasa_${aySlug}`);

      await setDoc(
        doc(db, 'school_governance', govDocId),
        deepSanitizeFirestore({
          id: govDocId,
          schoolCode: activeSchoolCode,
          academicYear: ay,
          type: 'MYSG_JAWATANKUASA_V5',
          items,
          updatedBy: currentUser?.email || currentUser?.uid || 'admin',
          updatedAt: new Date().toISOString(),
        }),
        { merge: true }
      );

      // Sync teacher workload summaries into personnel docs
      const batch = writeBatch(db);
      radarList.forEach((r) => {
        if (r.teacherId) {
          batch.set(
            doc(db, 'personnel', r.teacherId),
            deepSanitizeFirestore({
              mataBebanMySG: r.totalMata,
              mysgPositionCount: r.positionCount,
              committees: r.positions.map((p) => `${p.jawatanRasmi} (${p.jawatankuasaInduk})`),
            }),
            { merge: true }
          );
        }
      });
      await batch.commit();

      if (logAuditTrail) {
        await logAuditTrail(
          'UPDATE',
          3,
          govDocId,
          `Simpan & Segerak 4-Arah Katalog Jawatankuasa MySG (${items.filter((i) => i.assignedTeacherId).length} lantikan aktif)`
        );
      }

      if (onSynced) {
        await onSynced();
      }

      setBanner({
        type: 'success',
        text: `Berjaya menyimpan & menyegerakkan ${items.filter((i) => i.assignedTeacherId).length} lantikan Jawatankuasa MySG bagi ${displaySchoolName} (Sesi ${ay})!`,
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

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 font-black text-xs uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            <span>MySG KPM &amp; SKPM Kualiti@Sekolah (V5 SSOT)</span>
          </div>
          <h3 className="text-xl font-black text-slate-900 mt-1">
            Agihan Jawatankuasa &amp; Radar Keseimbangan Beban Tugas Guru ({selectedAcademicYear || '2026'})
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            berat = 3 mata · sederhana = 2 mata · ringan = 1 mata (Sasaran Ideal: 10–12 Mata / Guru). Disegerakkan terus ke Surat Lantikan &amp; OPR AI Setiausaha.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onItemsChange(MYSG_DEFAULT_CATALOG.map((i) => ({ ...i })))}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
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
            <span>{saving ? 'Menyegerak...' : 'Simpan & Segerak 4-Arah'}</span>
          </button>
        </div>
      </div>

      {banner && (
        <div
          className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between ${
            banner.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {banner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            )}
            <span>{banner.text}</span>
          </div>
          <button onClick={() => setBanner(null)} className="text-slate-500 hover:text-slate-800">
            ✕
          </button>
        </div>
      )}

      {/* Teacher Workload Radar */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <Award className="w-4 h-4 text-indigo-600" />
            <span>Radar Mata Beban Jawatankuasa Guru</span>
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
                    {r.positionCount} Jawatan (B:{r.beratCount} S:{r.sederhanaCount} R:{r.ringanCount})
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

      {/* Filters & Add Custom Position */}
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
              placeholder="Cari jawatan / kod / nama guru..."
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
                <th className="py-3 px-4">Tahap Beban</th>
                <th className="py-3 px-4">Guru Dilantik</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-semibold text-slate-800">
              {filteredItems.map((item, idx) => (
                <tr key={`${item.kodMySG}_${idx}`} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono text-[11px]">
                    <div className="font-bold text-indigo-700">{item.kodMySG}</div>
                    <div className="text-[10px] text-slate-400">{item.skpmBucket}</div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-black">
                      {item.pillar}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-black text-slate-900">{item.jawatanRasmi}</div>
                    <div className="text-[11px] text-slate-500">{item.jawatankuasaInduk}</div>
                  </td>
                  <td className="py-3 px-4">
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
                  <td className="py-3 px-4">
                    <select
                      value={item.assignedTeacherId || ''}
                      onChange={(e) => handleAssignTeacher(item.kodMySG, e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-indigo-500"
                    >
                      <option value="">-- Pilih Guru --</option>
                      {personnel.map((p, pIdx) => (
                        <option key={`${p.id}_${pIdx}`} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
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
    </div>
  );
};

export default MySGJawatankuasaTab;
