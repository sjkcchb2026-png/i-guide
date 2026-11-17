import React, { useState, useMemo } from 'react';
import {
  Coins,
  HeartHandshake,
  Printer,
  Download,
  X,
  Trophy,
  Filter,
  Building2,
} from 'lucide-react';
import { KokoActivity, computeTotalPerbelanjaan, isSumbanganCommunityLinked } from '../../types/kokurikulum';
import { SchoolSettings } from '../../types';
import { useSchoolTenant } from '../../contexts/SchoolTenantContext';
import {
  triggerSmartPrint,
  downloadStandalonePrintHtml,
} from '../../utils/oprPrintHelper';

interface Props {
  activities: KokoActivity[];
  schoolSettings?: SchoolSettings | null;
  preparedByName?: string;
  isModal?: boolean;
  onClose?: () => void;
}

export const KokoAnnualSumbanganReport: React.FC<Props> = ({
  activities,
  schoolSettings,
  preparedByName,
  isModal = false,
  onClose,
}) => {
  const { schoolName: tenantSchoolName, schoolCode: activeSchoolCode } = useSchoolTenant();
  const [selectedYear, setSelectedYear] = useState<string>('2026');
  const [filterCommunityOnly, setFilterCommunityOnly] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const effectiveSchoolName =
    schoolSettings?.schoolName || tenantSchoolName || 'SJK (C) CHUNG HUA BALINGIAN';

  const financialRecords = useMemo(() => {
    return activities
      .filter((a) => {
        const yr = a.academicYear || (a.date ? a.date.slice(0, 4) : '2026');
        if (selectedYear !== 'ALL' && yr !== selectedYear) return false;
        const totalBelanja =
          a.jumlahPerbelanjaanRM ??
          computeTotalPerbelanjaan(a) ??
          0;
        const hasFinance =
          Boolean(a.kategoriSumbangan && !/TIADA KOS/i.test(a.kategoriSumbangan)) ||
          Boolean(a.namaPenyumbang) ||
          Number(a.jumlahSumbanganRM || 0) > 0 ||
          Number(totalBelanja) > 0;
        if (!hasFinance) return false;
        if (filterCommunityOnly) {
          return Boolean(
            a.skpmAspek271Linked || isSumbanganCommunityLinked(a.kategoriSumbangan)
          );
        }
        return true;
      })
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [activities, selectedYear, filterCommunityOnly]);

  const summary = useMemo(() => {
    let totalSumbangan = 0;
    let totalPerbelanjaan = 0;
    let communityCount = 0;
    let totalMuridManfaat = 0;

    financialRecords.forEach((r) => {
      const sumbang = Number(r.jumlahSumbanganRM || 0);
      const belanja =
        Number(r.jumlahPerbelanjaanRM || 0) ||
        computeTotalPerbelanjaan(r);
      totalSumbangan += sumbang;
      totalPerbelanjaan += belanja;
      if (r.skpmAspek271Linked || isSumbanganCommunityLinked(r.kategoriSumbangan)) {
        communityCount += 1;
      }
      totalMuridManfaat +=
        r.participantCount ?? (r.studentIds ? r.studentIds.length : 0);
    });

    return {
      totalSumbangan,
      totalPerbelanjaan,
      communityCount,
      totalMuridManfaat,
    };
  }, [financialRecords]);

  const content = (
    <div className="space-y-5">
      {/* Control Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300">
            <HeartHandshake className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wide">
              Rumusan Kewangan Pertandingan &amp; Sumbangan Luar (SKPM Aspek 2.7.1 / A9)
            </h3>
            <p className="text-xs text-slate-400">
              Bukti Audit Permuafakatan Strategik (PIBG, LPS, Alumni, NGO &amp; Agensi Luar) serta Perbelanjaan Kokurikulum
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-transparent text-white font-bold outline-none"
            >
              <option value="2026" className="bg-slate-900">Tahun 2026</option>
              <option value="2025" className="bg-slate-900">Tahun 2025</option>
              <option value="ALL" className="bg-slate-900">Semua Tahun</option>
            </select>
          </div>

          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-amber-300 font-bold cursor-pointer">
            <input
              type="checkbox"
              checked={filterCommunityOnly}
              onChange={(e) => setFilterCommunityOnly(e.target.checked)}
            />
            <span>Hanya Sumbangan Komuniti (2.7.1 / A9)</span>
          </label>

          <button
            type="button"
            onClick={() => {
              const res = downloadStandalonePrintHtml({
                elementId: 'koko-annual-sumbangan-print',
                title: `Laporan_Sumbangan_Kewangan_Koko_${selectedYear}`,
                orientation: 'landscape',
              });
              setStatusMsg(res.message);
            }}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-700/50 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Muat Turun (.html)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const res = triggerSmartPrint({
                elementId: 'koko-annual-sumbangan-print',
                title: `Laporan_Sumbangan_Kewangan_Koko_${selectedYear}`,
                orientation: 'landscape',
              });
              if (res.mode !== 'native') setStatusMsg(res.message);
            }}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase flex items-center gap-1.5 shadow cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Cetak Laporan</span>
          </button>

          {isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {statusMsg && (
        <div className="p-3 rounded-xl bg-indigo-950/80 border border-indigo-700 text-xs text-indigo-200 flex items-center justify-between print:hidden">
          <span>{statusMsg}</span>
          <button onClick={() => setStatusMsg(null)} className="text-indigo-400 hover:text-white">✕</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 print:hidden">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-[11px] font-bold text-slate-400 uppercase flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 text-emerald-400" />
            <span>Jumlah Tajaan / Sumbangan</span>
          </div>
          <div className="text-xl font-black text-emerald-400 font-mono mt-1">
            RM {summary.totalSumbangan.toFixed(2)}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-[11px] font-bold text-slate-400 uppercase flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>Jumlah Perbelanjaan Program</span>
          </div>
          <div className="text-xl font-black text-amber-300 font-mono mt-1">
            RM {summary.totalPerbelanjaan.toFixed(2)}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-[11px] font-bold text-slate-400 uppercase flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Jalinan Komuniti (SKPM 2.7.1)</span>
          </div>
          <div className="text-xl font-black text-indigo-300 font-mono mt-1">
            {summary.communityCount} Program
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-[11px] font-bold text-slate-400 uppercase">
            Murid Menerima Manfaat
          </div>
          <div className="text-xl font-black text-white font-mono mt-1">
            {summary.totalMuridManfaat} Murid
          </div>
        </div>
      </div>

      {/* Printable Report Sheet */}
      <div
        id="koko-annual-sumbangan-print"
        className="bg-white text-slate-900 rounded-2xl p-6 shadow-xl border border-slate-200"
      >
        <div className="text-center border-b-2 border-slate-900 pb-3 mb-4">
          <div className="text-xs font-bold uppercase tracking-widest text-slate-600">
            KEMENTERIAN PENDIDIKAN MALAYSIA · {activeSchoolCode}
          </div>
          <h2 className="text-lg font-black uppercase text-slate-900">
            {effectiveSchoolName}
          </h2>
          <p className="text-xs font-bold uppercase text-slate-700 mt-0.5">
            LAPORAN RUMUSAN KEWANGAN PERTANDINGAN &amp; SUMBANGAN KOMUNITI (SKPM ASPEK 2.7.1 / A9) — SESI {selectedYear}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-900 uppercase font-black">
                <th className="border border-slate-400 p-2 text-center w-8">Bil</th>
                <th className="border border-slate-400 p-2 text-left">Tarikh</th>
                <th className="border border-slate-400 p-2 text-left">Nama Program / Pertandingan</th>
                <th className="border border-slate-400 p-2 text-left">Peringkat &amp; Pencapaian</th>
                <th className="border border-slate-400 p-2 text-left">Sumber / Kategori Sumbangan</th>
                <th className="border border-slate-400 p-2 text-left">Nama Penyumbang &amp; Bentuk Tajaan</th>
                <th className="border border-slate-400 p-2 text-right">Tajaan (RM)</th>
                <th className="border border-slate-400 p-2 text-right">Perbelanjaan (RM)</th>
                <th className="border border-slate-400 p-2 text-center">Kod SKPM</th>
              </tr>
            </thead>
            <tbody>
              {financialRecords.length === 0 ? (
                <tr>
                  <td colSpan={9} className="border border-slate-300 p-6 text-center text-slate-500 italic">
                    Tiada rekod kewangan atau sumbangan pertandingan bagi kriteria yang dipilih.
                  </td>
                </tr>
              ) : (
                financialRecords.map((act, idx) => {
                  const sumbang = Number(act.jumlahSumbanganRM || 0);
                  const belanja =
                    Number(act.jumlahPerbelanjaanRM || 0) ||
                    computeTotalPerbelanjaan(act);
                  const is271 =
                    act.skpmAspek271Linked ||
                    isSumbanganCommunityLinked(act.kategoriSumbangan);

                  return (
                    <tr key={`${act.id}_${idx}`} className="even:bg-slate-50">
                      <td className="border border-slate-300 p-2 text-center font-mono">
                        {idx + 1}
                      </td>
                      <td className="border border-slate-300 p-2 font-mono whitespace-nowrap">
                        {act.date}
                      </td>
                      <td className="border border-slate-300 p-2 font-bold">
                        <div>{act.programName}</div>
                        <div className="text-[10px] text-slate-500 font-normal">
                          Unit: {act.unit || '-'} · Murid: {act.participantCount ?? act.studentIds?.length ?? 0} org
                        </div>
                      </td>
                      <td className="border border-slate-300 p-2">
                        <div className="font-bold">{act.level}</div>
                        <div className="text-[10px] text-slate-600">{act.pencapaian}</div>
                      </td>
                      <td className="border border-slate-300 p-2 font-semibold">
                        {act.kategoriSumbangan || '-'}
                      </td>
                      <td className="border border-slate-300 p-2">
                        <div className="font-bold">{act.namaPenyumbang || '-'}</div>
                        {act.noBaucarResit && (
                          <div className="text-[10px] text-slate-600">Resit/Baucar: {act.noBaucarResit}</div>
                        )}
                      </td>
                      <td className="border border-slate-300 p-2 text-right font-mono font-bold text-emerald-800">
                        {sumbang.toFixed(2)}
                      </td>
                      <td className="border border-slate-300 p-2 text-right font-mono font-bold text-slate-900">
                        {belanja.toFixed(2)}
                      </td>
                      <td className="border border-slate-300 p-2 text-center font-mono text-[10px] font-bold">
                        <div>{act.skpmStandardCode || '3.2.5.1'}</div>
                        {is271 && (
                          <div className="text-indigo-700">+ 2.7.1 (A9)</div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-black text-slate-900">
                <td colSpan={6} className="border border-slate-400 p-2 text-right uppercase">
                  Jumlah Keseluruhan (RM):
                </td>
                <td className="border border-slate-400 p-2 text-right font-mono text-emerald-800">
                  {summary.totalSumbangan.toFixed(2)}
                </td>
                <td className="border border-slate-400 p-2 text-right font-mono">
                  {summary.totalPerbelanjaan.toFixed(2)}
                </td>
                <td className="border border-slate-400 p-2 text-center font-mono text-[10px]">
                  {summary.communityCount} Jalinan 2.7.1
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="grid grid-cols-2 gap-8 mt-10 pt-4 text-xs">
          <div>
            <div className="font-bold text-slate-700 mb-10">Disediakan oleh:</div>
            <div className="border-b border-slate-800 w-56 mb-1" />
            <div className="font-black uppercase text-slate-900">
              ({preparedByName || 'SETIAUSAHA KOKURIKULUM'})
            </div>
            <div className="text-slate-600">Setiausaha Kokurikulum / Penyelaras</div>
          </div>
          <div>
            <div className="font-bold text-slate-700 mb-10">Disahkan oleh:</div>
            <div className="border-b border-slate-800 w-56 mb-1" />
            <div className="font-black uppercase text-slate-900">
              ({(schoolSettings as any)?.principalName || 'GURU BESAR'})
            </div>
            <div className="text-slate-600">Guru Besar {effectiveSchoolName}</div>
          </div>
        </div>
      </div>
    </div>
  );

  if (!isModal) return content;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 max-w-6xl w-full max-h-[92vh] overflow-y-auto shadow-2xl">
        {content}
      </div>
    </div>
  );
};

export default KokoAnnualSumbanganReport;
