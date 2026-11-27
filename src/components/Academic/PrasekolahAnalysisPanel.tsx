/**
 * iSEPADU AI — Analisis Prasekolah Inspirasi (Independent Preschool Analytics Dashboard)
 *
 * Completely isolated from Elementary (Tahun 1 – Tahun 6) PBD/UASA.
 * Reads exclusively from `prasekolah_assessments` (and preschool roster in `students` / `student_master`).
 *
 * Includes:
 * 1. Scope Filter: Keseluruhan Prasekolah, Umur 5 Tahun, Umur 6 Tahun + Term Filter (Penggal 1 / Penggal 2)
 * 2. Table 1 — Analisis Pencapaian Akademik (BM, BC, BI, Matematik: Bil. Murid, Gred A–E Bil/%, Menguasai A–D Bil/%, GPMP)
 * 3. Table 2 — Analisis Sikap dan Nilai (Disiplin dan Peraturan, Sosial, Keyakinan Diri, Rajin: Gred A–E Bil/%)
 * 4. Table 3 — Senarai Kedudukan Akademik Murid (Sorted by rank, with 1-click Excel export & A4 Report / Slip printing)
 */

import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { belongsToSchool } from '../../utils/schoolTenant';
import SchoolLogo from '../SchoolLogo';
import { triggerSmartPrint } from '../../utils/oprPrintHelper';
import * as XLSX from 'xlsx';
import {
  PrasekolahAssessmentDoc,
  PrasekolahTerm,
  PRASEKOLAH_GRADES,
  PRASEKOLAH_AKADEMIK_FIELDS,
  PRASEKOLAH_SIKAP_FIELDS,
  PRASEKOLAH_GPMP_WEIGHT,
  isPrasekolahStudentRecord,
  resolvePrasekolahStudentAge,
  normalizePrasekolahGrade,
  normalizePrasekolahTerm,
  computeAutoKedudukanList,
  computeAkademikPoints,
  computeSikapPoints,
  printPrasekolahSlipsA4,
} from '../../utils/prasekolahAssessmentHelper';
import {
  Award,
  FileSpreadsheet,
  Printer,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';

interface PrasekolahAnalysisPanelProps {
  academicYear: string;
  schoolCode: string;
  schoolName: string;
  schoolLogo?: string;
  principalName?: string;
}

type PrasekolahAgeScope = 'ALL' | 5 | 6;

export const PrasekolahAnalysisPanel: React.FC<PrasekolahAnalysisPanelProps> = ({
  academicYear,
  schoolCode,
  schoolName,
  schoolLogo,
  principalName = 'GURU BESAR',
}) => {
  const [term, setTerm] = useState<PrasekolahTerm>('Penggal 1');
  const [ageScope, setAgeScope] = useState<PrasekolahAgeScope>('ALL');
  const [records, setRecords] = useState<PrasekolahAssessmentDoc[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([
      getDocs(query(collection(db, 'students'), where('academic_year', '==', academicYear))).catch(
        () => null
      ),
      getDocs(collection(db, 'student_master')).catch(() => null),
      getDocs(
        query(
          collection(db, 'prasekolah_assessments'),
          where('academicYear', '==', academicYear)
        )
      ).catch(() => null),
    ])
      .then(([studSnap, masterSnap, assessSnap]) => {
        if (!active) return;

        const studentMap = new Map<
          string,
          { studentId: string; studentName: string; noKp: string; age: 5 | 6 }
        >();

        const isInactive = (st: any) => {
          const s = String(st?.studyStatus || st?.status || '').trim().toUpperCase();
          return ['BERPINDAH', 'TIDAK AKTIF', 'INACTIVE', 'KELUAR', 'TRANSFERRED'].includes(s);
        };

        if (masterSnap) {
          masterSnap.docs.forEach((d) => {
            const data = d.data();
            if (!belongsToSchool(data, schoolCode)) return;
            if (isInactive(data)) return;
            if (!isPrasekolahStudentRecord(data)) return;
            const sid = String(data.student_id || d.id);
            const name = String(data.name || '').trim().toUpperCase();
            if (!sid || !name) return;
            studentMap.set(sid, {
              studentId: sid,
              studentName: name,
              noKp: String(data.noKp || data.icNumber || data.ic || '').replace(/[\s-]/g, ''),
              age: resolvePrasekolahStudentAge(data, academicYear),
            });
          });
        }

        if (studSnap) {
          studSnap.docs.forEach((d) => {
            const data = d.data();
            if (!belongsToSchool(data, schoolCode)) return;
            if (isInactive(data)) return;
            if (!isPrasekolahStudentRecord(data)) return;
            const sid = String(data.student_id || d.id);
            const name = String(data.name || '').trim().toUpperCase();
            if (!sid || !name) return;
            const existing = studentMap.get(sid);
            studentMap.set(sid, {
              studentId: sid,
              studentName: name,
              noKp: String(
                data.noKp || data.icNumber || data.ic || existing?.noKp || ''
              ).replace(/[\s-]/g, ''),
              age: resolvePrasekolahStudentAge(data, academicYear),
            });
          });
        }

        const assessMap = new Map<string, PrasekolahAssessmentDoc>();
        if (assessSnap) {
          assessSnap.docs.forEach((d) => {
            const data = d.data();
            if (!belongsToSchool(data, schoolCode)) return;
            const docTerm = normalizePrasekolahTerm(data.term);
            const sid = String(data.studentId || data.student_id || '');
            const sName = String(data.studentName || data.name || '').trim().toUpperCase();
            if (!sid) return;

            if (!studentMap.has(sid) && sName) {
              studentMap.set(sid, {
                studentId: sid,
                studentName: sName,
                noKp: String(data.noKp || data.icNumber || ''),
                age: Number(data.age) === 5 ? 5 : 6,
              });
            }

            if (docTerm === term) {
              assessMap.set(sid, {
                id: d.id,
                schoolCode,
                academicYear,
                term,
                studentId: sid,
                studentName: sName || studentMap.get(sid)?.studentName || 'MURID PRASEKOLAH',
                noKp: String(data.noKp || studentMap.get(sid)?.noKp || ''),
                age: Number(data.age) === 5 ? 5 : 6,
                akademik: {
                  bm: normalizePrasekolahGrade(data.akademik?.bm),
                  bc: normalizePrasekolahGrade(data.akademik?.bc),
                  bi: normalizePrasekolahGrade(data.akademik?.bi),
                  mt: normalizePrasekolahGrade(data.akademik?.mt),
                },
                sikapNilai: {
                  disiplin: normalizePrasekolahGrade(data.sikapNilai?.disiplin),
                  sosial: normalizePrasekolahGrade(data.sikapNilai?.sosial),
                  keyakinanDiri: normalizePrasekolahGrade(data.sikapNilai?.keyakinanDiri),
                  rajin: normalizePrasekolahGrade(data.sikapNilai?.rajin),
                },
                kedudukan: data.kedudukan ?? '',
                jumlahMurid: Number(data.jumlahMurid || 0),
                isManualKedudukan: Boolean(data.isManualKedudukan),
              });
            }
          });
        }

        const merged: PrasekolahAssessmentDoc[] = Array.from(studentMap.values())
          .sort((a, b) => a.studentName.localeCompare(b.studentName))
          .map((st) => {
            const existing = assessMap.get(st.studentId);
            if (existing) return existing;
            return {
              id: `pra_${st.studentId}_${academicYear}`,
              schoolCode,
              academicYear,
              term,
              studentId: st.studentId,
              studentName: st.studentName,
              noKp: st.noKp,
              age: st.age,
              akademik: { bm: '', bc: '', bi: '', mt: '' },
              sikapNilai: { disiplin: '', sosial: '', keyakinanDiri: '', rajin: '' },
              kedudukan: '',
              jumlahMurid: studentMap.size,
              isManualKedudukan: false,
            };
          });

        setRecords(computeAutoKedudukanList(merged, false));
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [academicYear, term, schoolCode]);

  // Scoped records by ageScope ('ALL' | 5 | 6)
  const scopedRecords = useMemo(() => {
    if (ageScope === 'ALL') return records;
    return records.filter((r) => r.age === ageScope);
  }, [records, ageScope]);

  const ageScopeLabel =
    ageScope === 'ALL'
      ? 'Keseluruhan Prasekolah (Umur 5 & 6 Tahun)'
      : `Murid Prasekolah Umur ${ageScope} Tahun`;

  // ============================================================================
  // TABLE 1: ANALISIS PENCAPAIAN AKADEMIK (BM, BC, BI, MATEMATIK)
  // ============================================================================
  const akademikTableRows = useMemo(() => {
    return PRASEKOLAH_AKADEMIK_FIELDS.map((field) => {
      const counts: Record<'A' | 'B' | 'C' | 'D' | 'E', number> = {
        A: 0,
        B: 0,
        C: 0,
        D: 0,
        E: 0,
      };
      let totalEvaluated = 0;
      let gpWeightedSum = 0;

      scopedRecords.forEach((rec) => {
        const g = normalizePrasekolahGrade(rec.akademik?.[field.key]);
        if (g) {
          counts[g]++;
          totalEvaluated++;
          gpWeightedSum += PRASEKOLAH_GPMP_WEIGHT[g];
        }
      });

      const pct = (n: number) =>
        totalEvaluated > 0 ? Number(((n / totalEvaluated) * 100).toFixed(1)) : 0;
      const menguasaiCount = counts.A + counts.B + counts.C + counts.D;
      const belumCount = counts.E;

      return {
        key: field.key,
        label: field.label,
        zhLabel: field.zhLabel,
        shortCode: field.shortCode,
        bilMurid: totalEvaluated,
        counts,
        percents: {
          A: pct(counts.A),
          B: pct(counts.B),
          C: pct(counts.C),
          D: pct(counts.D),
          E: pct(counts.E),
        },
        menguasaiCount,
        menguasaiPercent: pct(menguasaiCount),
        belumCount,
        belumPercent: pct(belumCount),
        gpmp: totalEvaluated > 0 ? (gpWeightedSum / totalEvaluated).toFixed(2) : '-',
      };
    });
  }, [scopedRecords]);

  // ============================================================================
  // TABLE 2: ANALISIS SIKAP DAN NILAI
  // ============================================================================
  const sikapTableRows = useMemo(() => {
    return PRASEKOLAH_SIKAP_FIELDS.map((field) => {
      const counts: Record<'A' | 'B' | 'C' | 'D' | 'E', number> = {
        A: 0,
        B: 0,
        C: 0,
        D: 0,
        E: 0,
      };
      let totalEvaluated = 0;

      scopedRecords.forEach((rec) => {
        const g = normalizePrasekolahGrade(rec.sikapNilai?.[field.key]);
        if (g) {
          counts[g]++;
          totalEvaluated++;
        }
      });

      const pct = (n: number) =>
        totalEvaluated > 0 ? Number(((n / totalEvaluated) * 100).toFixed(1)) : 0;

      return {
        key: field.key,
        label: field.label,
        zhLabel: field.zhLabel,
        bilMurid: totalEvaluated,
        counts,
        percents: {
          A: pct(counts.A),
          B: pct(counts.B),
          C: pct(counts.C),
          D: pct(counts.D),
          E: pct(counts.E),
        },
      };
    });
  }, [scopedRecords]);

  // ============================================================================
  // TABLE 3: SENARAI KEDUDUKAN AKADEMIK MURID (ORDERED BY RANK)
  // ============================================================================
  const sortedRankingRows = useMemo(() => {
    return [...scopedRecords].sort((a, b) => {
      const rankA =
        a.kedudukan !== '' && a.kedudukan !== null && !isNaN(Number(a.kedudukan))
          ? Number(a.kedudukan)
          : 9999;
      const rankB =
        b.kedudukan !== '' && b.kedudukan !== null && !isNaN(Number(b.kedudukan))
          ? Number(b.kedudukan)
          : 9999;
      if (rankA !== rankB) return rankA - rankB;
      const ptsA = computeAkademikPoints(a.akademik).points;
      const ptsB = computeAkademikPoints(b.akademik).points;
      if (ptsB !== ptsA) return ptsB - ptsA;
      return a.studentName.localeCompare(b.studentName);
    });
  }, [scopedRecords]);

  // Excel Export (.xlsx)
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Analisis Pencapaian Akademik
    const sheet1Data = akademikTableRows.map((r, idx) => ({
      Bil: idx + 1,
      'Bidang Pembelajaran': r.label,
      'Bil. Murid': r.bilMurid,
      'Gred A (Bil)': r.counts.A,
      'Gred A (%)': r.percents.A,
      'Gred B (Bil)': r.counts.B,
      'Gred B (%)': r.percents.B,
      'Gred C (Bil)': r.counts.C,
      'Gred C (%)': r.percents.C,
      'Gred D (Bil)': r.counts.D,
      'Gred D (%)': r.percents.D,
      'Gred E (Bil)': r.counts.E,
      'Gred E (%)': r.percents.E,
      'Menguasai A-D (Bil)': r.menguasaiCount,
      'Menguasai A-D (%)': r.menguasaiPercent,
      GPMP: r.gpmp,
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(sheet1Data),
      '1_Analisis_Akademik_Pra'
    );

    // Sheet 2: Analisis Sikap dan Nilai
    const sheet2Data = sikapTableRows.map((r, idx) => ({
      Bil: idx + 1,
      'Aspek Sikap dan Nilai': r.label,
      'Bil. Murid': r.bilMurid,
      'Gred A (Bil)': r.counts.A,
      'Gred A (%)': r.percents.A,
      'Gred B (Bil)': r.counts.B,
      'Gred B (%)': r.percents.B,
      'Gred C (Bil)': r.counts.C,
      'Gred C (%)': r.percents.C,
      'Gred D (Bil)': r.counts.D,
      'Gred D (%)': r.percents.D,
      'Gred E (Bil)': r.counts.E,
      'Gred E (%)': r.percents.E,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet2Data), '2_Analisis_Sikap_Pra');

    // Sheet 3: Senarai Kedudukan Akademik Murid
    const sheet3Data = sortedRankingRows.map((r, idx) => ({
      Bil: idx + 1,
      'Kedudukan Akademik':
        r.kedudukan !== '' ? `${r.kedudukan} daripada ${r.jumlahMurid || records.length}` : '-',
      'Nama Murid': r.studentName,
      'No. MyKid': r.noKp || '-',
      'Umur (Tahun)': r.age,
      'Bahasa Melayu': r.akademik.bm || '-',
      'Bahasa Cina': r.akademik.bc || '-',
      'Bahasa Inggeris': r.akademik.bi || '-',
      Matematik: r.akademik.mt || '-',
      'Disiplin dan Peraturan': r.sikapNilai.disiplin || '-',
      Sosial: r.sikapNilai.sosial || '-',
      'Keyakinan Diri': r.sikapNilai.keyakinanDiri || '-',
      Rajin: r.sikapNilai.rajin || '-',
      'Skor Akademik (/20)': computeAkademikPoints(r.akademik).points,
      'Skor Sikap (/20)': computeSikapPoints(r.sikapNilai).points,
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(sheet3Data),
      '3_Kedudukan_Murid_Pra'
    );

    const fileName = `Analisis_Prasekolah_Inspirasi_${schoolCode}_${academicYear}_${term.replace(
      /\s+/g,
      '_'
    )}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const handlePrintAnalysisReport = () => {
    triggerSmartPrint({
      elementId: 'prasekolah-analysis-print-area',
      title: `Laporan Analisis Pentaksiran Prasekolah Inspirasi - ${schoolName} (${academicYear} ${term})`,
      orientation: 'portrait',
    });
  };

  return (
    <div className="space-y-6">
      {/* Filter & Export Controls Bar */}
      <div className="print:hidden bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Term Switcher: Penggal 1 / Penggal 2 */}
          <div className="inline-flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
            {(['Penggal 1', 'Penggal 2'] as PrasekolahTerm[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTerm(t)}
                className={`px-4 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                  term === t
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Age Scope Filter: Keseluruhan / 5 Tahun / 6 Tahun */}
          <div className="inline-flex flex-wrap bg-slate-100 p-1 rounded-2xl border border-slate-200 gap-1">
            {(
              [
                { value: 'ALL', label: `Keseluruhan Prasekolah (${records.length})` },
                {
                  value: 5,
                  label: `Umur 5 Tahun (${records.filter((r) => r.age === 5).length})`,
                },
                {
                  value: 6,
                  label: `Umur 6 Tahun (${records.filter((r) => r.age === 6).length})`,
                },
              ] as Array<{ value: PrasekolahAgeScope; label: string }>
            ).map((btn) => (
              <button
                key={String(btn.value)}
                type="button"
                onClick={() => setAgeScope(btn.value)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                  ageScope === btn.value
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Export Excel & Print Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wide flex items-center gap-1.5 shadow-sm transition cursor-pointer"
          >
            <FileSpreadsheet size={15} />
            <span>Eksport Excel (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={handlePrintAnalysisReport}
            className="px-4 py-2 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase tracking-wide flex items-center gap-1.5 shadow-sm transition cursor-pointer"
          >
            <Printer size={15} />
            <span>Cetak Laporan Analisis (A4)</span>
          </button>

          <button
            type="button"
            onClick={() =>
              printPrasekolahSlipsA4(sortedRankingRows, {
                schoolName,
                schoolCode,
                schoolLogo,
                academicYear,
                term,
              })
            }
            disabled={sortedRankingRows.length === 0}
            className="px-4 py-2 rounded-2xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wide flex items-center gap-1.5 shadow-sm transition cursor-pointer"
          >
            <Printer size={15} />
            <span>Cetak Slip Semua Murid ({sortedRankingRows.length})</span>
          </button>
        </div>
      </div>

      {/* Printable Analysis Container */}
      <div
        id="prasekolah-analysis-print-area"
        className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-8 text-slate-900"
      >
        {/* Official School Header */}
        <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <SchoolLogo
              src={schoolLogo}
              schoolCode={schoolCode}
              className="w-16 h-16 bg-white border-slate-300 shrink-0"
            />
            <div>
              <div className="text-lg font-black uppercase tracking-wide text-slate-900">
                {schoolName} ({schoolCode})
              </div>
              <div className="text-xs font-bold text-purple-800 uppercase">
                PRASEKOLAH INSPIRASI &mdash; LAPORAN ANALISIS PENTAKSIRAN DAN PERKEMBANGAN MURID
              </div>
              <div className="text-[11px] text-slate-600 font-semibold">
                Tahun {academicYear} &bull; {term} &bull; Skop: {ageScopeLabel}
              </div>
            </div>
          </div>
          <div className="border-2 border-slate-900 px-3.5 py-1.5 text-center shrink-0 self-start sm:self-center">
            <div className="text-[10px] font-black uppercase text-slate-900">
              ANALISIS PRASEKOLAH
            </div>
            <div className="text-[11px] font-black text-purple-700">
              TAHUN {academicYear} &bull; {term.toUpperCase()}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-500 text-xs font-bold">
            Memuatkan data analisis Prasekolah Inspirasi...
          </div>
        ) : (
          <>
            {/* ==============================================================
                STATISTICAL TABLE 1: ANALISIS PENCAPAIAN AKADEMIK
               ============================================================== */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-black uppercase text-slate-900 flex items-center gap-2">
                  <Award className="w-4 h-4 text-blue-600" />
                  <span>
                    Jadual 1: Analisis Pencapaian Akademik Prasekolah Inspirasi ({ageScopeLabel})
                  </span>
                </h3>
                <span className="text-[11px] font-bold text-slate-500">
                  Tahap Menguasai: Gred A hingga Gred D &bull; Wajaran GPMP: A=1, B=2, C=3, D=4, E=5
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-300 rounded-2xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white font-black uppercase text-[10px] border-b border-slate-300">
                      <th className="py-3 px-2.5 text-center border-r border-slate-700 w-10">
                        Bil
                      </th>
                      <th className="py-3 px-3 border-r border-slate-700 min-w-[180px]">
                        Bidang Pembelajaran
                      </th>
                      <th className="py-3 px-2.5 text-center border-r border-slate-700">
                        Bil. Murid
                      </th>
                      {PRASEKOLAH_GRADES.map((g) => (
                        <th
                          key={g}
                          className={`py-3 px-2.5 text-center border-r border-slate-700 ${
                            g === 'E'
                              ? 'bg-rose-950/90 text-rose-200'
                              : g === 'A' || g === 'B'
                              ? 'bg-emerald-950/80 text-emerald-200'
                              : 'bg-slate-800 text-slate-200'
                          }`}
                        >
                          Gred {g}
                          <div className="text-[9px] font-normal">(Bil / %)</div>
                        </th>
                      ))}
                      <th className="py-3 px-3 text-center border-r border-slate-700 bg-emerald-800 text-white">
                        Menguasai (A – D)
                        <div className="text-[9px] font-bold">(Bil &amp; %)</div>
                      </th>
                      <th className="py-3 px-3 text-center border-r border-slate-700 bg-rose-800 text-white">
                        Belum Menguasai (E)
                        <div className="text-[9px] font-bold">(Bil &amp; %)</div>
                      </th>
                      <th className="py-3 px-2.5 text-center bg-slate-800 text-amber-300">
                        GPMP
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {akademikTableRows.map((row, idx) => (
                      <tr key={row.key} className="hover:bg-blue-50/40">
                        <td className="py-2.5 px-2.5 text-center font-mono font-bold text-slate-600 border-r border-slate-200">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3 border-r border-slate-200">
                          <div className="font-black text-slate-900">{row.label}</div>
                          <div className="text-[10px] font-bold text-slate-500">
                            Kod: {row.shortCode} ({row.zhLabel})
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5 text-center font-mono font-black text-slate-900 border-r border-slate-200">
                          {row.bilMurid}
                        </td>
                        {PRASEKOLAH_GRADES.map((g) => (
                          <td
                            key={g}
                            className={`py-2.5 px-2 text-center font-mono border-r border-slate-200 ${
                              g === 'E'
                                ? 'bg-rose-50/40 text-rose-800'
                                : g === 'A' || g === 'B'
                                ? 'bg-emerald-50/30 text-emerald-900'
                                : 'text-slate-800'
                            }`}
                          >
                            <div className="font-black">{row.counts[g]}</div>
                            <div className="text-[10px] text-slate-500">({row.percents[g]}%)</div>
                          </td>
                        ))}
                        <td className="py-2.5 px-3 text-center font-mono bg-emerald-50/70 border-r border-slate-200">
                          <span className="font-black text-emerald-900">{row.menguasaiCount}</span>{' '}
                          <span className="text-[10px] font-bold text-emerald-700">
                            ({row.menguasaiPercent}%)
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono bg-rose-50/70 border-r border-slate-200">
                          <span className="font-black text-rose-800">{row.belumCount}</span>{' '}
                          <span className="text-[10px] font-bold text-rose-600">
                            ({row.belumPercent}%)
                          </span>
                        </td>
                        <td className="py-2.5 px-2.5 text-center font-mono font-black text-indigo-900 bg-slate-50">
                          {row.gpmp}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ==============================================================
                STATISTICAL TABLE 2: ANALISIS SIKAP DAN NILAI
               ============================================================== */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-black uppercase text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <span>
                    Jadual 2: Analisis Sikap dan Nilai Murid Prasekolah ({ageScopeLabel})
                  </span>
                </h3>
                <span className="text-[11px] font-bold text-slate-500">
                  Taburan Pencapaian Sahsiah &amp; Nilai Murni (Gred A hingga Gred E)
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-300 rounded-2xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white font-black uppercase text-[10px] border-b border-slate-300">
                      <th className="py-3 px-2.5 text-center border-r border-slate-700 w-10">
                        Bil
                      </th>
                      <th className="py-3 px-3 border-r border-slate-700 min-w-[200px]">
                        Aspek Sikap dan Nilai
                      </th>
                      <th className="py-3 px-2.5 text-center border-r border-slate-700">
                        Bil. Murid
                      </th>
                      {PRASEKOLAH_GRADES.map((g) => (
                        <th
                          key={g}
                          className="py-3 px-2.5 text-center border-r border-slate-700 last:border-r-0"
                        >
                          Gred {g}
                          <div className="text-[9px] font-normal">(Bil / %)</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {sikapTableRows.map((row, idx) => (
                      <tr key={row.key} className="hover:bg-purple-50/40">
                        <td className="py-2.5 px-2.5 text-center font-mono font-bold text-slate-600 border-r border-slate-200">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3 border-r border-slate-200">
                          <div className="font-black text-slate-900">{row.label}</div>
                          <div className="text-[10px] text-slate-500">{row.zhLabel}</div>
                        </td>
                        <td className="py-2.5 px-2.5 text-center font-mono font-black text-slate-900 border-r border-slate-200">
                          {row.bilMurid}
                        </td>
                        {PRASEKOLAH_GRADES.map((g) => (
                          <td
                            key={g}
                            className="py-2.5 px-2 text-center font-mono border-r border-slate-200 last:border-r-0"
                          >
                            <div className="font-black text-slate-900">{row.counts[g]}</div>
                            <div className="text-[10px] text-slate-500">({row.percents[g]}%)</div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ==============================================================
                STATISTICAL TABLE 3: SENARAI KEDUDUKAN AKADEMIK MURID
               ============================================================== */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-black uppercase text-slate-900 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  <span>
                    Jadual 3: Senarai Kedudukan Akademik Murid Prasekolah Inspirasi ({ageScopeLabel})
                  </span>
                </h3>
                <span className="text-[11px] font-bold text-slate-500">
                  Disusun mengikut Kedudukan Akademik (1 hingga {records.length})
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-300 rounded-2xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white font-black uppercase text-[10px] border-b border-slate-300">
                      <th className="py-3 px-2.5 text-center border-r border-slate-700 w-24">
                        Kedudukan
                      </th>
                      <th className="py-3 px-3 border-r border-slate-700 min-w-[180px]">
                        Nama Murid
                      </th>
                      <th className="py-3 px-2 text-center border-r border-slate-700">Umur</th>
                      <th className="py-3 px-2 text-center border-r border-slate-700 bg-blue-950 text-blue-200">
                        BM
                      </th>
                      <th className="py-3 px-2 text-center border-r border-slate-700 bg-blue-950 text-blue-200">
                        BC
                      </th>
                      <th className="py-3 px-2 text-center border-r border-slate-700 bg-blue-950 text-blue-200">
                        BI
                      </th>
                      <th className="py-3 px-2 text-center border-r border-slate-700 bg-blue-950 text-blue-200">
                        MT
                      </th>
                      <th className="py-3 px-2 text-center border-r border-slate-700 bg-purple-950 text-purple-200">
                        Disiplin
                      </th>
                      <th className="py-3 px-2 text-center border-r border-slate-700 bg-purple-950 text-purple-200">
                        Sosial
                      </th>
                      <th className="py-3 px-2 text-center border-r border-slate-700 bg-purple-950 text-purple-200">
                        Keyakinan
                      </th>
                      <th className="py-3 px-2 text-center border-r border-slate-700 bg-purple-950 text-purple-200">
                        Rajin
                      </th>
                      <th className="py-3 px-2.5 text-center border-r border-slate-700 bg-slate-800 text-amber-300">
                        Mata (/20)
                      </th>
                      <th className="py-3 px-2.5 text-center print:hidden">Slip A4</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {sortedRankingRows.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="py-8 text-center text-slate-400">
                          Tiada rekod murid prasekolah bagi tapisan ini.
                        </td>
                      </tr>
                    ) : (
                      sortedRankingRows.map((rec) => {
                        const akPts = computeAkademikPoints(rec.akademik).points;
                        return (
                          <tr key={rec.studentId} className="hover:bg-slate-50">
                            <td className="py-2.5 px-2.5 text-center font-mono font-black text-amber-800 bg-amber-50/50 border-r border-slate-200">
                              {rec.kedudukan !== ''
                                ? `${rec.kedudukan} / ${rec.jumlahMurid || records.length}`
                                : '-'}
                            </td>
                            <td className="py-2.5 px-3 font-black text-slate-900 border-r border-slate-200">
                              {rec.studentName}
                            </td>
                            <td className="py-2.5 px-2 text-center font-mono font-bold text-slate-700 border-r border-slate-200">
                              {rec.age} Thn
                            </td>
                            <td className="py-2.5 px-2 text-center font-mono font-black border-r border-slate-200 bg-blue-50/20">
                              {rec.akademik.bm || '-'}
                            </td>
                            <td className="py-2.5 px-2 text-center font-mono font-black border-r border-slate-200 bg-blue-50/20">
                              {rec.akademik.bc || '-'}
                            </td>
                            <td className="py-2.5 px-2 text-center font-mono font-black border-r border-slate-200 bg-blue-50/20">
                              {rec.akademik.bi || '-'}
                            </td>
                            <td className="py-2.5 px-2 text-center font-mono font-black border-r border-slate-200 bg-blue-50/20">
                              {rec.akademik.mt || '-'}
                            </td>
                            <td className="py-2.5 px-2 text-center font-mono font-bold border-r border-slate-200 bg-purple-50/20">
                              {rec.sikapNilai.disiplin || '-'}
                            </td>
                            <td className="py-2.5 px-2 text-center font-mono font-bold border-r border-slate-200 bg-purple-50/20">
                              {rec.sikapNilai.sosial || '-'}
                            </td>
                            <td className="py-2.5 px-2 text-center font-mono font-bold border-r border-slate-200 bg-purple-50/20">
                              {rec.sikapNilai.keyakinanDiri || '-'}
                            </td>
                            <td className="py-2.5 px-2 text-center font-mono font-bold border-r border-slate-200 bg-purple-50/20">
                              {rec.sikapNilai.rajin || '-'}
                            </td>
                            <td className="py-2.5 px-2.5 text-center font-mono font-black text-indigo-900 bg-slate-50 border-r border-slate-200">
                              {akPts}
                            </td>
                            <td className="py-2 px-2.5 text-center print:hidden">
                              <button
                                type="button"
                                onClick={() =>
                                  printPrasekolahSlipsA4([rec], {
                                    schoolName,
                                    schoolCode,
                                    schoolLogo,
                                    academicYear,
                                    term,
                                  })
                                }
                                className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[11px] inline-flex items-center gap-1 transition cursor-pointer"
                              >
                                <Printer size={12} />
                                <span>Slip</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Official Signature Block for Print Report */}
            <div className="pt-8 mt-6 border-t border-slate-300 grid grid-cols-2 gap-12 text-xs text-slate-900">
              <div>
                <p className="font-bold">Disediakan oleh:</p>
                <div className="h-14 border-b border-slate-900 w-56 mt-4 mb-1" />
                <p className="font-black uppercase">GURU PRASEKOLAH INSPIRASI</p>
                <p className="text-slate-600">{schoolName}</p>
              </div>
              <div className="text-right flex flex-col items-end">
                <p className="font-bold">Disahkan oleh:</p>
                <div className="h-14 border-b border-slate-900 w-56 mt-4 mb-1" />
                <p className="font-black uppercase">{principalName}</p>
                <p className="text-slate-600">Guru Besar {schoolName}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PrasekolahAnalysisPanel;
