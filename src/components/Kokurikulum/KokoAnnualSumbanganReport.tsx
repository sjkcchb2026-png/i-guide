import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Award,
  Building2,
  Coins,
  Download,
  FileSpreadsheet,
  HeartHandshake,
  Printer,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { SchoolSettings } from '../../types';
import { KokoActivity, KokoScopeLevel } from '../../types/kokurikulum';
import { useSchoolTenant } from '../../contexts/SchoolTenantContext';
import {
  downloadStandalonePrintHtml,
  triggerSmartPrint,
} from '../../utils/oprPrintHelper';
import SchoolLogo from '../SchoolLogo';

interface KokoAnnualSumbanganReportProps {
  activities: KokoActivity[];
  schoolSettings?: SchoolSettings | null;
  preparedByName?: string;
  onClose?: () => void;
  isModal?: boolean;
}

type DonorFilterBucket =
  | 'SEMUA'
  | 'LPS'
  | 'PIBG'
  | 'YB'
  | 'KOMUNITI'
  | 'GURU'
  | 'BKK_BSS'
  | 'TIADA_KOS';

function formatRM(val?: number): string {
  const num = Number(val) || 0;
  return `RM ${num.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function classifyDonorBucket(kategori?: string, list?: string[]): DonorFilterBucket {
  const combined = [kategori || '', ...(list || [])].join(' ').toUpperCase();
  if (combined.includes('LPS') || combined.includes('LEMBAGA PENGURUS')) return 'LPS';
  if (combined.includes('PIBG')) return 'PIBG';
  if (combined.includes('YB') || combined.includes('WAKIL RAKYAT')) return 'YB';
  if (
    combined.includes('IBU BAPA') ||
    combined.includes('INDIVIDU') ||
    combined.includes('SWASTA') ||
    combined.includes('NGO') ||
    combined.includes('KOMUNITI')
  ) {
    return 'KOMUNITI';
  }
  if (combined.includes('GURU') || combined.includes('TANGGUNGAN SENDIRI')) return 'GURU';
  if (combined.includes('BKK') || combined.includes('BSS') || combined.includes('PCG')) {
    return 'BKK_BSS';
  }
  if (combined.includes('TIADA KOS')) return 'TIADA_KOS';
  return 'KOMUNITI';
}

const ACHIEVEMENT_RANK: Record<string, number> = {
  Johan: 7,
  'Naib Johan': 6,
  Ketiga: 5,
  Keempat: 4,
  Kelima: 3,
  Saguhati: 2,
  Penyertaan: 1,
};

function getActivityExpense(act: KokoActivity) {
  const makan = Number(act.kosMakanMinum) || 0;
  const pengangkutan = Number(act.kosPengangkutan) || 0;
  const yuran = Number(act.kosYuranBahan) || 0;
  const lain = Number(act.kosLain) || 0;
  const computedSum = makan + pengangkutan + yuran + lain;
  const belanja =
    act.jumlahPerbelanjaanRM !== undefined && act.jumlahPerbelanjaanRM !== null
      ? Number(act.jumlahPerbelanjaanRM) || 0
      : computedSum;
  const sumbangan =
    act.jumlahSumbanganRM !== undefined && act.jumlahSumbanganRM !== null
      ? Number(act.jumlahSumbanganRM) || 0
      : belanja;

  return {
    makan,
    pengangkutan,
    yuran,
    lain,
    belanja,
    sumbangan,
  };
}

export const KokoAnnualSumbanganReport: React.FC<KokoAnnualSumbanganReportProps> = ({
  activities,
  schoolSettings,
  preparedByName,
  onClose,
  isModal = false,
}) => {
  const tenant = useSchoolTenant();
  const effectiveSchoolName =
    schoolSettings?.schoolName || tenant.schoolName || 'SJK(C) CHUNG HUA';
  const effectiveSchoolLogo =
    schoolSettings?.schoolLogo || schoolSettings?.logoUrl || tenant.schoolLogo;

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    activities.forEach((a) => {
      const y = (a.academicYear || a.date?.slice(0, 4) || '').trim();
      if (y) years.add(y);
    });
    if (years.size === 0) years.add(String(new Date().getFullYear()));
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [activities]);

  const [filterYear, setFilterYear] = useState<string>('SEMUA');
  const [filterBucket, setFilterBucket] = useState<DonorFilterBucket>('SEMUA');
  const [filterLevel, setFilterLevel] = useState<string>('SEMUA');
  const [includeAktiviti, setIncludeAktiviti] = useState<boolean>(false);
  const [reportViewTab, setReportViewTab] = useState<'ROLL_OF_HONOR' | 'LEDGER'>('ROLL_OF_HONOR');
  const [banner, setBanner] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(
    null
  );

  // Filtered records (Pertandingan focus by default, optional include Aktiviti)
  const filteredActivities = useMemo(() => {
    return activities
      .filter((act) => {
        if (!includeAktiviti && act.jenis !== 'pertandingan') return false;
        const yr = (act.academicYear || act.date?.slice(0, 4) || '').trim();
        if (filterYear !== 'SEMUA' && yr !== filterYear) return false;
        if (filterLevel !== 'SEMUA' && act.level !== filterLevel) return false;
        if (filterBucket !== 'SEMUA') {
          const b = classifyDonorBucket(act.kategoriSumbangan, act.kategoriSumbanganList);
          if (b !== filterBucket) return false;
        }
        return true;
      })
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }, [activities, includeAktiviti, filterYear, filterLevel, filterBucket]);

  // Summary metrics by Donor Category
  const categorySummary = useMemo(() => {
    const init = () => ({ sumbangan: 0, belanja: 0, count: 0 });
    const stats = {
      LPS: init(),
      PIBG: init(),
      YB: init(),
      KOMUNITI: init(),
      GURU: init(),
      BKK_BSS: init(),
      TOTAL: init(),
      makan: 0,
      pengangkutan: 0,
      yuran: 0,
      lain: 0,
      students: 0,
    };

    filteredActivities.forEach((act) => {
      const exp = getActivityExpense(act);
      const bucket = classifyDonorBucket(act.kategoriSumbangan, act.kategoriSumbanganList);
      if (bucket !== 'SEMUA' && bucket !== 'TIADA_KOS') {
        stats[bucket].sumbangan += exp.sumbangan;
        stats[bucket].belanja += exp.belanja;
        stats[bucket].count += 1;
      }
      stats.TOTAL.sumbangan += exp.sumbangan;
      stats.TOTAL.belanja += exp.belanja;
      stats.TOTAL.count += 1;
      stats.makan += exp.makan;
      stats.pengangkutan += exp.pengangkutan;
      stats.yuran += exp.yuran;
      stats.lain += exp.lain;
      stats.students += Number(act.participantCount) || 0;
    });

    return stats;
  }, [filteredActivities]);

  // Donor Roll of Honor grouped by namaPenyumbang
  const donorRollOfHonor = useMemo(() => {
    const groups = new Map<
      string,
      {
        donorName: string;
        categories: Set<string>;
        bucket: DonorFilterBucket;
        competitions: string[];
        studentCount: number;
        bestAchievement: string;
        bestRank: number;
        totalSumbangan: number;
        totalBelanja: number;
        eventsCount: number;
      }
    >();

    filteredActivities.forEach((act) => {
      const exp = getActivityExpense(act);
      const cat = act.kategoriSumbangan || 'Tiada Rekod Sumbangan';
      const bucket = classifyDonorBucket(act.kategoriSumbangan, act.kategoriSumbanganList);
      if (bucket === 'TIADA_KOS' && exp.sumbangan === 0 && exp.belanja === 0) return;

      const rawName = (act.namaPenyumbang || '').trim();
      const donorDisplay =
        rawName ||
        (bucket === 'LPS'
          ? 'Lembaga Pengurus Sekolah (LPS)'
          : bucket === 'PIBG'
          ? 'PIBG Sekolah'
          : bucket === 'YB'
          ? 'YB / Wakil Rakyat'
          : cat);

      const key = donorDisplay.toUpperCase();
      const existing = groups.get(key) || {
        donorName: donorDisplay,
        categories: new Set<string>(),
        bucket,
        competitions: [],
        studentCount: 0,
        bestAchievement: '-',
        bestRank: 0,
        totalSumbangan: 0,
        totalBelanja: 0,
        eventsCount: 0,
      };

      existing.categories.add(cat);
      existing.competitions.push(`${act.programName} (${act.date})`);
      existing.studentCount += Number(act.participantCount) || 0;
      existing.totalSumbangan += exp.sumbangan;
      existing.totalBelanja += exp.belanja;
      existing.eventsCount += 1;

      const ach = String(act.pencapaian || 'Penyertaan');
      const rank = ACHIEVEMENT_RANK[ach] || 1;
      if (rank >= existing.bestRank) {
        existing.bestRank = rank;
        existing.bestAchievement = ach;
      }

      groups.set(key, existing);
    });

    return Array.from(groups.values()).sort((a, b) => b.totalSumbangan - a.totalSumbangan);
  }, [filteredActivities]);

  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Ringkasan Ikut Kategori & Senarai Penghargaan Penyumbang
      const sheet1Rows: any[] = [
        [effectiveSchoolName.toUpperCase()],
        [`LAPORAN TAHUNAN SUMBANGAN & PERBELANJAAN PERTANDINGAN (${filterYear === 'SEMUA' ? 'SEMUA TAHUN' : filterYear})`],
        [],
        ['RINGKASAN IKUT KATEGORI PENYUMBANG', 'BIL. PERTANDINGAN', 'JUMLAH SUMBANGAN (RM)', 'JUMLAH PERBELANJAAN (RM)'],
        ['Lembaga Pengurus Sekolah (LPS)', categorySummary.LPS.count, categorySummary.LPS.sumbangan, categorySummary.LPS.belanja],
        ['PIBG Sekolah', categorySummary.PIBG.count, categorySummary.PIBG.sumbangan, categorySummary.PIBG.belanja],
        ['YB / Wakil Rakyat', categorySummary.YB.count, categorySummary.YB.sumbangan, categorySummary.YB.belanja],
        ['Ibu Bapa / Komuniti / Swasta', categorySummary.KOMUNITI.count, categorySummary.KOMUNITI.sumbangan, categorySummary.KOMUNITI.belanja],
        ['Guru / Tanggungan Sendiri', categorySummary.GURU.count, categorySummary.GURU.sumbangan, categorySummary.GURU.belanja],
        ['Bantuan Sekolah (BKK / BSS / PCG)', categorySummary.BKK_BSS.count, categorySummary.BKK_BSS.sumbangan, categorySummary.BKK_BSS.belanja],
        ['JUMLAH KESELURUHAN', categorySummary.TOTAL.count, categorySummary.TOTAL.sumbangan, categorySummary.TOTAL.belanja],
        [],
        ['SENARAI PENGHARGAAN PENYUMBANG TAHUNAN (LPS / PIBG / YB / KOMUNITI)'],
        ['Bil', 'Nama Penyumbang / Penaja', 'Kategori Sumbangan', 'Bil. Program', 'Program / Pertandingan Ditaja', 'Bil. Murid Terlibat', 'Pencapaian Terbaik', 'Jumlah Sumbangan (RM)', 'Jumlah Perbelanjaan (RM)'],
        ...donorRollOfHonor.map((d, idx) => [
          idx + 1,
          d.donorName,
          Array.from(d.categories).join(', '),
          d.eventsCount,
          d.competitions.join(' | '),
          d.studentCount,
          d.bestAchievement,
          d.totalSumbangan,
          d.totalBelanja,
        ]),
      ];

      const ws1 = XLSX.utils.aoa_to_sheet(sheet1Rows);
      ws1['!cols'] = [
        { wch: 8 },
        { wch: 32 },
        { wch: 34 },
        { wch: 14 },
        { wch: 48 },
        { wch: 16 },
        { wch: 18 },
        { wch: 20 },
        { wch: 22 },
      ];
      XLSX.utils.book_append_sheet(wb, ws1, 'Penghargaan Penyumbang');

      // Sheet 2: Lejar Terperinci Perbelanjaan Pertandingan
      const sheet2Rows: any[] = [
        [effectiveSchoolName.toUpperCase()],
        ['LEJAR TERPERINCI SUMBANGAN & PERBELANJAAN PERTANDINGAN (AUDIT SKPM 2.7.1 & 2.3.1)'],
        [],
        [
          'Bil',
          'Tarikh',
          'Nama Pertandingan / Program',
          'Peringkat',
          'Bil. Murid',
          'Pencapaian Terbaik',
          'Kategori Sumbangan',
          'Nama Penyumbang',
          'Sumbangan (RM)',
          'Makan/Minum (RM)',
          'Pengangkutan (RM)',
          'Yuran/Bahan (RM)',
          'Lain-lain (RM)',
          'Jumlah Belanja (RM)',
          'No. Baucar/Resit',
          'Guru Pengiring',
        ],
        ...filteredActivities.map((act, idx) => {
          const exp = getActivityExpense(act);
          return [
            idx + 1,
            act.date || '-',
            act.programName,
            act.level,
            act.participantCount || 0,
            act.pencapaian || (act.jenis === 'aktiviti' ? 'Aktiviti' : 'Penyertaan'),
            act.kategoriSumbangan || 'Tiada Kos (RM 0.00)',
            act.namaPenyumbang || '-',
            exp.sumbangan,
            exp.makan,
            exp.pengangkutan,
            exp.yuran,
            exp.lain,
            exp.belanja,
            act.noBaucarResit || '-',
            (act.guruPengiring || act.jurulatih || []).join(', ') || '-',
          ];
        }),
        [
          '',
          '',
          'JUMLAH BESAR',
          '',
          categorySummary.students,
          '',
          '',
          '',
          categorySummary.TOTAL.sumbangan,
          categorySummary.makan,
          categorySummary.pengangkutan,
          categorySummary.yuran,
          categorySummary.lain,
          categorySummary.TOTAL.belanja,
          '',
          '',
        ],
      ];

      const ws2 = XLSX.utils.aoa_to_sheet(sheet2Rows);
      ws2['!cols'] = [
        { wch: 5 },
        { wch: 12 },
        { wch: 36 },
        { wch: 14 },
        { wch: 10 },
        { wch: 16 },
        { wch: 32 },
        { wch: 26 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 12 },
        { wch: 15 },
        { wch: 18 },
        { wch: 26 },
      ];
      XLSX.utils.book_append_sheet(wb, ws2, 'Lejar Perbelanjaan');

      const yearTag = filterYear === 'SEMUA' ? 'SemuaTahun' : filterYear;
      XLSX.writeFile(
        wb,
        `Laporan_Sumbangan_Pertandingan_${tenant.schoolCode}_${yearTag}.xlsx`
      );
      setBanner({
        type: 'success',
        text: 'Fail Excel Laporan Tahunan Sumbangan & Perbelanjaan berjaya dimuat turun.',
      });
    } catch (err) {
      setBanner({
        type: 'error',
        text: 'Gagal menjana fail Excel: ' + String(err),
      });
    }
  };

  const handlePrintReport = () => {
    const res = triggerSmartPrint({
      elementId: 'koko-annual-sumbangan-print',
      title: `Laporan_Sumbangan_Pertandingan_${filterYear}`,
      orientation: 'landscape',
    });
    if (res.mode !== 'native') {
      setBanner({
        type: res.mode === 'error' ? 'error' : 'info',
        text: res.message,
      });
    }
  };

  const handleDownloadHtml = () => {
    const res = downloadStandalonePrintHtml({
      elementId: 'koko-annual-sumbangan-print',
      title: `Laporan_Sumbangan_Pertandingan_${filterYear}`,
      orientation: 'landscape',
    });
    setBanner({
      type: res.mode === 'error' ? 'error' : 'info',
      text: res.message,
    });
  };

  const content = (
    <div className="space-y-5">
      {/* HEADER BAR */}
      <div className="print:hidden bg-slate-900 border border-slate-800 rounded-3xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 rounded-2xl shrink-0">
            <HeartHandshake className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
              Laporan Tahunan Sumbangan &amp; Perbelanjaan Pertandingan
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Apresiasi LPS (董事会), PIBG (家教协会), YB &amp; Komuniti · Eviden SKPM Std 2 (Aspek 2.7.1 / A9) &amp; Mesyuarat Agung
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Excel (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadHtml}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-700/60 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Fail Cetak (.html)</span>
          </button>

          <button
            type="button"
            onClick={handlePrintReport}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak Laporan Rasmi (A4)</span>
          </button>

          {isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white transition cursor-pointer"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {banner && (
        <div
          className={`print:hidden p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between gap-3 ${
            banner.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-700 text-emerald-200'
              : banner.type === 'error'
              ? 'bg-rose-950/70 border-rose-700 text-rose-200'
              : 'bg-blue-950/70 border-blue-700 text-blue-200'
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="p-1 rounded-lg hover:bg-white/10 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* FILTER CONTROLS */}
      <div className="print:hidden bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold outline-none"
          >
            <option value="SEMUA">Semua Tahun Akademik</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>
                Tahun {y}
              </option>
            ))}
          </select>

          <select
            value={filterBucket}
            onChange={(e) => setFilterBucket(e.target.value as DonorFilterBucket)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-emerald-300 font-bold outline-none"
          >
            <option value="SEMUA">Semua Kategori Penyumbang</option>
            <option value="LPS">Lembaga Pengurus Sekolah (LPS)</option>
            <option value="PIBG">PIBG Sekolah</option>
            <option value="YB">YB / Wakil Rakyat</option>
            <option value="KOMUNITI">Ibu Bapa / Komuniti / Swasta</option>
            <option value="GURU">Sumbangan Guru / Sendiri</option>
            <option value="BKK_BSS">Bantuan Sekolah (BKK/BSS/PCG)</option>
            <option value="TIADA_KOS">Tiada Kos (RM 0.00)</option>
          </select>

          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-bold outline-none"
          >
            <option value="SEMUA">Semua Peringkat</option>
            {(
              ['Sekolah', 'Daerah/Zon', 'Bahagian', 'Negeri', 'Kebangsaan', 'Antarabangsa'] as KokoScopeLevel[]
            ).map((lvl) => (
              <option key={lvl} value={lvl}>
                {lvl}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={includeAktiviti}
              onChange={(e) => setIncludeAktiviti(e.target.checked)}
              className="accent-emerald-500 rounded"
            />
            <span className="font-semibold">Sertakan Program Aktiviti Bukan Pertandingan</span>
          </label>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setReportViewTab('ROLL_OF_HONOR')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
              reportViewTab === 'ROLL_OF_HONOR'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Penghargaan Penyumbang ({donorRollOfHonor.length})
          </button>
          <button
            type="button"
            onClick={() => setReportViewTab('LEDGER')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
              reportViewTab === 'LEDGER'
                ? 'bg-amber-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Lejar Terperinci ({filteredActivities.length})
          </button>
        </div>
      </div>

      {/* 5 SUMMARY CARDS BY DONOR CATEGORY */}
      <div className="print:hidden grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          {
            label: 'Lembaga Pengurus (LPS)',
            stat: categorySummary.LPS,
            accent: 'border-amber-600/50 bg-amber-950/20 text-amber-300',
            icon: Building2,
          },
          {
            label: 'PIBG Sekolah',
            stat: categorySummary.PIBG,
            accent: 'border-teal-600/50 bg-teal-950/20 text-teal-300',
            icon: Users,
          },
          {
            label: 'YB / Wakil Rakyat',
            stat: categorySummary.YB,
            accent: 'border-indigo-600/50 bg-indigo-950/20 text-indigo-300',
            icon: Award,
          },
          {
            label: 'Ibu Bapa / Komuniti / Swasta',
            stat: categorySummary.KOMUNITI,
            accent: 'border-sky-600/50 bg-sky-950/20 text-sky-300',
            icon: Sparkles,
          },
          {
            label: 'Jumlah Keseluruhan',
            stat: categorySummary.TOTAL,
            accent: 'border-emerald-500/60 bg-emerald-950/30 text-emerald-300',
            icon: Coins,
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={`rounded-2xl border p-4 space-y-1.5 ${card.accent}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider leading-tight">
                  {card.label}
                </span>
                <Icon className="w-4 h-4 shrink-0 opacity-80" />
              </div>
              <div className="text-xl font-black text-white font-mono">
                {formatRM(card.stat.sumbangan)}
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-300 font-mono">
                <span>{card.stat.count} Pertandingan</span>
                <span>Belanja: {formatRM(card.stat.belanja)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* PRINTABLE OFFICIAL A4 REPORT DOCUMENT */}
      <div
        id="koko-annual-sumbangan-print"
        className="bg-white text-slate-900 rounded-3xl border border-slate-200 shadow-2xl p-6 sm:p-8 space-y-6 print:rounded-none print:border-none print:shadow-none print:p-2"
      >
        {/* Formal School Letterhead */}
        <div className="flex items-center justify-between gap-4 border-b-2 border-slate-900 pb-3">
          <div className="flex items-center gap-3">
            <SchoolLogo
              src={effectiveSchoolLogo}
              schoolCode={tenant.schoolCode}
              className="w-14 h-14 bg-white border-slate-300 shrink-0"
            />
            <div>
              <div className="text-base font-black uppercase tracking-wide text-slate-900">
                {effectiveSchoolName}
              </div>
              <div className="text-xs font-bold uppercase text-[#0D3B42]">
                LAPORAN TAHUNAN SUMBANGAN PENYUMBANG &amp; PERBELANJAAN PERTANDINGAN KOKURIKULUM
              </div>
              <div className="text-[10px] text-slate-600 font-semibold">
                Sesi: {filterYear === 'SEMUA' ? 'Semua Tahun' : filterYear} · Eviden SKPM Kualiti@Sekolah Std 2 (Aspek 2.7.1 / A9 Permuafakatan Strategik) &amp; Std 3.2 / Std 5.4
              </div>
            </div>
          </div>
          <div className="text-right text-[10px] font-mono text-slate-700 shrink-0">
            <div>Bil. Rekod: {filteredActivities.length}</div>
            <div>Jumlah Murid: {categorySummary.students} Orang</div>
            <div className="font-bold text-slate-900">
              Jumlah Sumbangan: {formatRM(categorySummary.TOTAL.sumbangan)}
            </div>
          </div>
        </div>

        {/* Print-only Summary Table */}
        <div className="hidden print:block">
          <div className="text-xs font-black uppercase text-slate-900 mb-1.5">
            RINGKASAN SUMBANGAN MENGIKUT KATEGORI PENYUMBANG
          </div>
          <table className="w-full border-collapse border border-slate-900 text-[10px]">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-900 px-2 py-1 text-left">Kategori Penyumbang</th>
                <th className="border border-slate-900 px-2 py-1 text-center">Bil. Pertandingan</th>
                <th className="border border-slate-900 px-2 py-1 text-right">Jumlah Sumbangan (RM)</th>
                <th className="border border-slate-900 px-2 py-1 text-right">Jumlah Perbelanjaan (RM)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-900 px-2 py-1 font-bold">Lembaga Pengurus Sekolah (LPS)</td>
                <td className="border border-slate-900 px-2 py-1 text-center">{categorySummary.LPS.count}</td>
                <td className="border border-slate-900 px-2 py-1 text-right font-mono">{formatRM(categorySummary.LPS.sumbangan)}</td>
                <td className="border border-slate-900 px-2 py-1 text-right font-mono">{formatRM(categorySummary.LPS.belanja)}</td>
              </tr>
              <tr>
                <td className="border border-slate-900 px-2 py-1 font-bold">PIBG Sekolah</td>
                <td className="border border-slate-900 px-2 py-1 text-center">{categorySummary.PIBG.count}</td>
                <td className="border border-slate-900 px-2 py-1 text-right font-mono">{formatRM(categorySummary.PIBG.sumbangan)}</td>
                <td className="border border-slate-900 px-2 py-1 text-right font-mono">{formatRM(categorySummary.PIBG.belanja)}</td>
              </tr>
              <tr>
                <td className="border border-slate-900 px-2 py-1 font-bold">YB / Wakil Rakyat</td>
                <td className="border border-slate-900 px-2 py-1 text-center">{categorySummary.YB.count}</td>
                <td className="border border-slate-900 px-2 py-1 text-right font-mono">{formatRM(categorySummary.YB.sumbangan)}</td>
                <td className="border border-slate-900 px-2 py-1 text-right font-mono">{formatRM(categorySummary.YB.belanja)}</td>
              </tr>
              <tr>
                <td className="border border-slate-900 px-2 py-1 font-bold">Ibu Bapa / Komuniti / Swasta</td>
                <td className="border border-slate-900 px-2 py-1 text-center">{categorySummary.KOMUNITI.count}</td>
                <td className="border border-slate-900 px-2 py-1 text-right font-mono">{formatRM(categorySummary.KOMUNITI.sumbangan)}</td>
                <td className="border border-slate-900 px-2 py-1 text-right font-mono">{formatRM(categorySummary.KOMUNITI.belanja)}</td>
              </tr>
              <tr className="bg-slate-100 font-black">
                <td className="border border-slate-900 px-2 py-1">JUMLAH KESELURUHAN</td>
                <td className="border border-slate-900 px-2 py-1 text-center">{categorySummary.TOTAL.count}</td>
                <td className="border border-slate-900 px-2 py-1 text-right font-mono">{formatRM(categorySummary.TOTAL.sumbangan)}</td>
                <td className="border border-slate-900 px-2 py-1 text-right font-mono">{formatRM(categorySummary.TOTAL.belanja)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* SECTION 1: DONOR ROLL OF HONOR (shown on Roll of Honor tab OR always in Print) */}
        <div className={reportViewTab === 'ROLL_OF_HONOR' ? 'block space-y-2' : 'hidden print:block space-y-2'}>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-[#0D3B42] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
              <span>Senarai Penghargaan Penyumbang Tahunan (Mesyuarat PIBG / LPS / Apresiasi Sekolah)</span>
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-slate-800 text-[11px]">
              <thead>
                <tr className="bg-[#0D3B42] text-white print-color-exact">
                  <th className="border border-slate-800 px-2 py-1.5 text-center w-8">Bil</th>
                  <th className="border border-slate-800 px-2.5 py-1.5 text-left">Nama Penyumbang / Penaja</th>
                  <th className="border border-slate-800 px-2.5 py-1.5 text-left">Kategori</th>
                  <th className="border border-slate-800 px-2.5 py-1.5 text-left">Pertandingan Yang Ditaja</th>
                  <th className="border border-slate-800 px-2 py-1.5 text-center w-16">Murid</th>
                  <th className="border border-slate-800 px-2 py-1.5 text-center w-28">Pencapaian Terbaik</th>
                  <th className="border border-slate-800 px-2.5 py-1.5 text-right w-28">Sumbangan (RM)</th>
                  <th className="border border-slate-800 px-2.5 py-1.5 text-right w-28">Belanja (RM)</th>
                </tr>
              </thead>
              <tbody>
                {donorRollOfHonor.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="border border-slate-300 px-3 py-6 text-center text-slate-500 italic">
                      Belum ada rekod sumbangan / tajaan pertandingan untuk penapis ini.
                    </td>
                  </tr>
                ) : (
                  donorRollOfHonor.map((d, idx) => (
                    <tr key={d.donorName + idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">{idx + 1}</td>
                      <td className="border border-slate-300 px-2.5 py-1.5 font-black text-slate-900">{d.donorName}</td>
                      <td className="border border-slate-300 px-2.5 py-1.5 text-[10px]">
                        {Array.from(d.categories).join(', ')}
                      </td>
                      <td className="border border-slate-300 px-2.5 py-1.5 text-[10px]">
                        {d.competitions.join(' · ')}
                      </td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-mono font-bold">
                        {d.studentCount}
                      </td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-bold text-[#0D3B42]">
                        {d.bestAchievement}
                      </td>
                      <td className="border border-slate-300 px-2.5 py-1.5 text-right font-mono font-bold text-emerald-700">
                        {formatRM(d.totalSumbangan)}
                      </td>
                      <td className="border border-slate-300 px-2.5 py-1.5 text-right font-mono font-bold">
                        {formatRM(d.totalBelanja)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 2: DETAILED COMPETITION AUDIT LEDGER (shown on Ledger tab OR always in Print) */}
        <div className={reportViewTab === 'LEDGER' ? 'block space-y-2' : 'hidden print:block space-y-2 pt-3'}>
          <h3 className="text-xs font-black uppercase tracking-wider text-[#0D3B42]">
            Lejar Terperinci Sumbangan &amp; Perbelanjaan Pertandingan
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-slate-800 text-[10px]">
              <thead>
                <tr className="bg-slate-800 text-white print-color-exact">
                  <th className="border border-slate-800 px-1.5 py-1.5 text-center">Bil</th>
                  <th className="border border-slate-800 px-2 py-1.5 text-left">Tarikh</th>
                  <th className="border border-slate-800 px-2 py-1.5 text-left">Nama Pertandingan / Program</th>
                  <th className="border border-slate-800 px-2 py-1.5 text-left">Peringkat</th>
                  <th className="border border-slate-800 px-1.5 py-1.5 text-center">Murid</th>
                  <th className="border border-slate-800 px-2 py-1.5 text-left">Pencapaian</th>
                  <th className="border border-slate-800 px-2 py-1.5 text-left">Penyumbang / Kategori</th>
                  <th className="border border-slate-800 px-2 py-1.5 text-right">Makan (RM)</th>
                  <th className="border border-slate-800 px-2 py-1.5 text-right">Angkut (RM)</th>
                  <th className="border border-slate-800 px-2 py-1.5 text-right">Yuran/Bhn (RM)</th>
                  <th className="border border-slate-800 px-2 py-1.5 text-right">Lain (RM)</th>
                  <th className="border border-slate-800 px-2 py-1.5 text-right">Jumlah (RM)</th>
                  <th className="border border-slate-800 px-2 py-1.5 text-left">Baucar/Resit</th>
                  <th className="border border-slate-800 px-2 py-1.5 text-left">Guru Pengiring</th>
                </tr>
              </thead>
              <tbody>
                {filteredActivities.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="border border-slate-300 px-3 py-6 text-center text-slate-500 italic">
                      Tiada rekod pertandingan ditemui bagi kriteria penapis ini.
                    </td>
                  </tr>
                ) : (
                  filteredActivities.map((act, idx) => {
                    const exp = getActivityExpense(act);
                    return (
                      <tr key={act.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="border border-slate-300 px-1.5 py-1 text-center font-mono">{idx + 1}</td>
                        <td className="border border-slate-300 px-2 py-1 font-mono whitespace-nowrap">{act.date}</td>
                        <td className="border border-slate-300 px-2 py-1 font-bold">{act.programName}</td>
                        <td className="border border-slate-300 px-2 py-1">{act.level}</td>
                        <td className="border border-slate-300 px-1.5 py-1 text-center font-mono">{act.participantCount || 0}</td>
                        <td className="border border-slate-300 px-2 py-1 font-semibold">
                          {act.pencapaian || (act.jenis === 'aktiviti' ? 'Aktiviti' : 'Penyertaan')}
                        </td>
                        <td className="border border-slate-300 px-2 py-1">
                          <div className="font-bold">{act.namaPenyumbang || '-'}</div>
                          <div className="text-[9px] text-slate-600">{act.kategoriSumbangan || 'Tiada Kos'}</div>
                        </td>
                        <td className="border border-slate-300 px-2 py-1 text-right font-mono">{exp.makan.toFixed(2)}</td>
                        <td className="border border-slate-300 px-2 py-1 text-right font-mono">{exp.pengangkutan.toFixed(2)}</td>
                        <td className="border border-slate-300 px-2 py-1 text-right font-mono">{exp.yuran.toFixed(2)}</td>
                        <td className="border border-slate-300 px-2 py-1 text-right font-mono">{exp.lain.toFixed(2)}</td>
                        <td className="border border-slate-300 px-2 py-1 text-right font-mono font-black">{exp.belanja.toFixed(2)}</td>
                        <td className="border border-slate-300 px-2 py-1 font-mono">{act.noBaucarResit || '-'}</td>
                        <td className="border border-slate-300 px-2 py-1">
                          {(act.guruPengiring && act.guruPengiring.length > 0
                            ? act.guruPengiring
                            : act.jurulatih || []
                          ).join(', ') || '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filteredActivities.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-200 font-black">
                    <td colSpan={4} className="border border-slate-800 px-2 py-1.5 text-right uppercase">
                      JUMLAH BESAR KESELURUHAN
                    </td>
                    <td className="border border-slate-800 px-1.5 py-1.5 text-center font-mono">
                      {categorySummary.students}
                    </td>
                    <td colSpan={2} className="border border-slate-800 px-2 py-1.5 text-right font-mono">
                      Sumbangan: {formatRM(categorySummary.TOTAL.sumbangan)}
                    </td>
                    <td className="border border-slate-800 px-2 py-1.5 text-right font-mono">
                      {categorySummary.makan.toFixed(2)}
                    </td>
                    <td className="border border-slate-800 px-2 py-1.5 text-right font-mono">
                      {categorySummary.pengangkutan.toFixed(2)}
                    </td>
                    <td className="border border-slate-800 px-2 py-1.5 text-right font-mono">
                      {categorySummary.yuran.toFixed(2)}
                    </td>
                    <td className="border border-slate-800 px-2 py-1.5 text-right font-mono">
                      {categorySummary.lain.toFixed(2)}
                    </td>
                    <td className="border border-slate-800 px-2 py-1.5 text-right font-mono text-[#0D3B42]">
                      {formatRM(categorySummary.TOTAL.belanja)}
                    </td>
                    <td colSpan={2} className="border border-slate-800 px-2 py-1.5" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Official Signature Block (Setiausaha / GPK Kokurikulum & Guru Besar) */}
        <div className="grid grid-cols-2 gap-12 pt-6 border-t border-slate-300 text-[11px]">
          <div className="space-y-6">
            <div>
              <div className="font-bold">Disediakan oleh:</div>
              <div className="h-12 border-b border-slate-800 max-w-xs mt-4" />
            </div>
            <div className="space-y-0.5">
              <div className="font-black uppercase">{preparedByName || 'SETIAUSAHA / GPK KOKURIKULUM'}</div>
              <div className="text-slate-600">Setiausaha Kokurikulum / GPK Kokurikulum</div>
              <div className="text-slate-600">{effectiveSchoolName}</div>
              <div className="text-slate-600">Tarikh: ..........................................</div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <div className="font-bold">Disahkan oleh:</div>
              <div className="h-12 border-b border-slate-800 max-w-xs mt-4" />
            </div>
            <div className="space-y-0.5">
              <div className="font-black uppercase">GURU BESAR</div>
              <div className="text-slate-600">{effectiveSchoolName}</div>
              <div className="text-slate-600">Cap Rasmi Sekolah:</div>
              <div className="text-slate-600">Tarikh: ..........................................</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm overflow-y-auto p-3 sm:p-6 print:static print:bg-white print:p-0 print:overflow-visible">
        <div className="max-w-7xl mx-auto">{content}</div>
      </div>
    );
  }

  return content;
};

export default KokoAnnualSumbanganReport;
