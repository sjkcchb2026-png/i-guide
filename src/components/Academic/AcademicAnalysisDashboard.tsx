/**
 * iSEPADU AI — Academic Analysis Dashboard & Visual Standards Showcase
 * Implements Sections 13, 14, 15, and 16 of the Academic Visual Standard:
 *   - Overall Class Performance (Students, % Meeting Target, % Below Target, Near Miss, Mismatch)
 *   - PBD Distribution (TP1-TP6 using standard colors)
 *   - UASA Distribution (A-F using standard colors)
 *   - Priority Intervention Breakdown (Critical, High, Watch, On Track, Excellent)
 *   - Student Analysis Cards with Progress Direction & Actionable Recommendations
 *   - Class Analysis & Panitia Drill-down (School -> Year -> Class -> Subject -> Student)
 */

import React, { useState, useMemo } from 'react';
import {
  getPbdStatus,
  getPbdSemanticColor,
  getUasaGrade,
  getUasaGradeInterpretation,
  getUasaSemanticColor,
  getProgressDirection,
  getNearMissStatus,
  getMismatchStatus,
  getInterventionPriority,
  ACADEMIC_COLOR_TOKENS,
  PBD_CHART_PALETTE,
  UASA_CHART_PALETTE,
  COMPARISON_SERIES_PALETTE,
  PbdLevel,
  UasaGrade,
  InterventionPriority,
} from '../../utils/academicVisualStandard';
import {
  PbdBadge,
  UasaBadge,
  ProgressIndicator,
  NearMissBadge,
  MismatchBadge,
  InterventionPriorityBadge,
  PbdProgressionRow,
} from './AcademicBadges';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  Award,
  AlertTriangle,
  TrendingUp,
  Users,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ChevronRight,
  Sparkles,
  BarChart3,
  Layers,
  ArrowUpDown,
} from 'lucide-react';

export interface StudentAcademicRecord {
  studentId: string;
  name: string;
  className: string;
  subjectName: string;
  pbd: {
    tov?: number | string | null;
    oti1?: number | string | null;
    ar1?: number | string | null;
    oti2?: number | string | null;
    ar2?: number | string | null;
    etr?: number | string | null;
    latestTp?: number | string | null;
  };
  uasa: {
    previousMark?: number | null;
    previousGrade?: string | null;
    currentMark?: number | null;
    currentGrade?: string | null;
    targetGrade?: string | null;
  };
}

interface AcademicAnalysisDashboardProps {
  records: StudentAcademicRecord[];
  className?: string;
  subjectName?: string;
  yearGroup?: number;
  onSelectStudent?: (studentId: string) => void;
}

export default function AcademicAnalysisDashboard({
  records,
  className = '5 Mawar',
  subjectName = 'Matematik',
  yearGroup = 5,
  onSelectStudent,
}: AcademicAnalysisDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'pbd' | 'uasa'>('overview');
  const [studentFilter, setStudentFilter] = useState<'ALL' | 'CRITICAL' | 'NEAR_MISS' | 'MISMATCH' | 'EXCELLENT'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Compute Overall Class Performance Metrics
  const metrics = useMemo(() => {
    let meetingTargetCount = 0;
    let belowTargetCount = 0;
    let nearMissCount = 0;
    let mismatchCount = 0;

    const pbdCounts: Record<`TP${PbdLevel}`, number> = {
      TP1: 0, TP2: 0, TP3: 0, TP4: 0, TP5: 0, TP6: 0,
    };

    const uasaCounts: Record<UasaGrade, number> = {
      A: 0, B: 0, C: 0, D: 0, E: 0, F: 0,
    };

    const priorityCounts: Record<InterventionPriority, number> = {
      CRITICAL: 0, HIGH: 0, WATCH: 0, 'ON TRACK': 0, EXCELLENT: 0,
    };

    records.forEach(r => {
      // PBD evaluation
      const latestTp = r.pbd.latestTp || r.pbd.ar2 || r.pbd.ar1;
      const targetTp = r.pbd.etr || 4; // Expected target
      const tovTp = r.pbd.tov;

      if (latestTp) {
        const num = Number(String(latestTp).replace(/^TP/i, ''));
        if (num >= 1 && num <= 6) {
          pbdCounts[`TP${num as PbdLevel}`]++;
          if (num >= 4) {
            meetingTargetCount++;
          } else {
            belowTargetCount++;
          }
        }
      }

      // UASA evaluation
      const currentUasa = r.uasa.currentMark;
      const grade = r.uasa.currentGrade || getUasaGrade(currentUasa);
      if (grade && grade in uasaCounts) {
        uasaCounts[grade as UasaGrade]++;
      }

      // Near Miss Check
      const pbdNearMiss = getNearMissStatus(latestTp, targetTp);
      const uasaNearMiss = getNearMissStatus(currentUasa, undefined, { targetGrade: r.uasa.targetGrade as any });
      if (pbdNearMiss.isNearMiss || uasaNearMiss.isNearMiss) {
        nearMissCount++;
      }

      // Mismatch Check
      const pbdMismatch = getMismatchStatus(latestTp, targetTp);
      const uasaMismatch = getMismatchStatus(r.uasa.currentMark, r.uasa.targetGrade);
      if (pbdMismatch.isMismatch || uasaMismatch.isMismatch) {
        mismatchCount++;
      }

      // Intervention Priority
      const priority = getInterventionPriority(
        latestTp || currentUasa,
        targetTp || r.uasa.targetGrade,
        tovTp || r.uasa.previousMark
      );
      priorityCounts[priority.priority]++;
    });

    const totalStudents = records.length || 1;
    const meetingTargetPercent = Math.round((meetingTargetCount / totalStudents) * 100);
    const belowTargetPercent = Math.round((belowTargetCount / totalStudents) * 100);

    return {
      total: records.length,
      meetingTargetCount,
      meetingTargetPercent,
      belowTargetCount,
      belowTargetPercent,
      nearMissCount,
      mismatchCount,
      pbdCounts,
      uasaCounts,
      priorityCounts,
    };
  }, [records]);

  // 2. Chart Datasets using standard palettes
  const pbdChartData = useMemo(() => {
    return ([1, 2, 3, 4, 5, 6] as PbdLevel[]).map(lvl => ({
      name: `TP${lvl}`,
      count: metrics.pbdCounts[`TP${lvl}`],
      fill: PBD_CHART_PALETTE[`TP${lvl}`],
    }));
  }, [metrics.pbdCounts]);

  const uasaChartData = useMemo(() => {
    return (['A', 'B', 'C', 'D', 'E', 'F'] as UasaGrade[]).map(g => ({
      name: `Gred ${g}`,
      grade: g,
      count: metrics.uasaCounts[g],
      fill: UASA_CHART_PALETTE[g],
    }));
  }, [metrics.uasaCounts]);

  // 3. Filtered Students
  const filteredStudents = useMemo(() => {
    return records.filter(r => {
      const matchesSearch = r.name.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      const latestTp = r.pbd.latestTp || r.pbd.ar2 || r.pbd.ar1;
      const targetTp = r.pbd.etr || 4;
      const pbdNearMiss = getNearMissStatus(latestTp, targetTp);
      const uasaNearMiss = getNearMissStatus(r.uasa.currentMark, undefined, { targetGrade: r.uasa.targetGrade as any });
      const isNearMiss = pbdNearMiss.isNearMiss || uasaNearMiss.isNearMiss;

      const pbdMismatch = getMismatchStatus(latestTp, targetTp);
      const uasaMismatch = getMismatchStatus(r.uasa.currentMark, r.uasa.targetGrade);
      const isMismatch = pbdMismatch.isMismatch || uasaMismatch.isMismatch;

      const priority = getInterventionPriority(latestTp || r.uasa.currentMark, targetTp, r.pbd.tov);

      if (studentFilter === 'CRITICAL') return priority.priority === 'CRITICAL';
      if (studentFilter === 'NEAR_MISS') return isNearMiss;
      if (studentFilter === 'MISMATCH') return isMismatch;
      if (studentFilter === 'EXCELLENT') return priority.priority === 'EXCELLENT';
      return true;
    });
  }, [records, searchQuery, studentFilter]);

  return (
    <div className="space-y-8">
      {/* Top Banner / Class Context */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-black uppercase">
              Tahun {yearGroup} • {className}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-black uppercase">
              {subjectName}
            </span>
            <span className="text-xs text-slate-400 font-bold">
              • {metrics.total} Jumlah Murid
            </span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mt-2 flex items-center gap-2">
            <BarChart3 className="text-blue-600" size={24} />
            Papan Pemuka Analisis Akademik & Intervensi SSOT
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Bahasa visual akademik berpiawai selaras merentasi PBD, UASA, Panitia, dan Dialog Prestasi.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 self-start md:self-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${
              activeTab === 'overview' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Ringkasan Kelas
          </button>
          <button
            onClick={() => setActiveTab('students')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${
              activeTab === 'students' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Kad Analisis Murid ({records.length})
          </button>
          <button
            onClick={() => setActiveTab('pbd')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${
              activeTab === 'pbd' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Taburan PBD
          </button>
          <button
            onClick={() => setActiveTab('uasa')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${
              activeTab === 'uasa' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Taburan UASA
          </button>
        </div>
      </div>

      {/* SECTION 13: OVERALL CLASS PERFORMANCE STATS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Total & Meeting Target */}
        <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-3xl">
          <span className="block text-[10px] font-black uppercase tracking-wider text-emerald-800">
            Mencapai Sasaran (TP4–TP6 / A–C)
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-black text-emerald-900">{metrics.meetingTargetPercent}%</span>
            <span className="text-xs font-bold text-emerald-700">({metrics.meetingTargetCount} murid)</span>
          </div>
          <span className="block text-[10px] text-emerald-600 mt-1 font-medium">Melepasi tahap minimum</span>
        </div>

        {/* Below Target */}
        <div className="bg-rose-50 border border-rose-200 p-5 rounded-3xl">
          <span className="block text-[10px] font-black uppercase tracking-wider text-rose-800">
            Bawah Sasaran (TP1–TP3 / D–F)
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-black text-rose-600">{metrics.belowTargetPercent}%</span>
            <span className="text-xs font-bold text-rose-700">({metrics.belowTargetCount} murid)</span>
          </div>
          <span className="block text-[10px] text-rose-600 mt-1 font-medium">Memerlukan intervensi / pengukuhan</span>
        </div>

        {/* Near Miss */}
        <div className="bg-yellow-50 border border-yellow-200 p-5 rounded-3xl">
          <span className="block text-[10px] font-black uppercase tracking-wider text-yellow-800 flex items-center gap-1.5">
            <Sparkles size={12} className="text-yellow-600" />
            Near Miss (Lonjakan)
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-black text-yellow-900">{metrics.nearMissCount}</span>
            <span className="text-xs font-bold text-yellow-700">murid</span>
          </div>
          <span className="block text-[10px] text-yellow-700 mt-1 font-medium">1 tahap / 1–3 markah ke sasaran</span>
        </div>

        {/* Mismatch */}
        <div className="bg-rose-50/60 border border-rose-200 p-5 rounded-3xl">
          <span className="block text-[10px] font-black uppercase tracking-wider text-rose-800 flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-rose-600" />
            Mismatch (Jurang Ketara)
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-black text-rose-700">{metrics.mismatchCount}</span>
            <span className="text-xs font-bold text-rose-700">murid</span>
          </div>
          <span className="block text-[10px] text-rose-700 mt-1 font-medium">≥2 gred / tahap di bawah sasaran</span>
        </div>

        {/* Priority Intervention: Critical */}
        <div className="bg-slate-900 text-white p-5 rounded-3xl border border-slate-800">
          <span className="block text-[10px] font-black uppercase tracking-wider text-rose-400">
            Keutamaan: Kritikal
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-black text-rose-400">{metrics.priorityCounts.CRITICAL}</span>
            <span className="text-xs font-bold text-slate-400">kes</span>
          </div>
          <span className="block text-[10px] text-slate-400 mt-1">Tindakan segera wajib</span>
        </div>
      </div>

      {/* VIEW: OVERVIEW (DISTRIBUTION SUMMARY & VISUAL CHARTS) */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* PBD Distribution Panel */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black uppercase text-slate-900 tracking-tight">
                    Taburan PBD (Tahap Penguasaan 1–6)
                  </h3>
                  <p className="text-xs text-slate-400">Merujuk piawaian visual rasmi KPM: TP1–2 Merah, TP3 Jingga, TP4–6 Hijau</p>
                </div>
                <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-[10px] font-mono font-bold text-slate-600">
                  {metrics.total} Murid
                </span>
              </div>

              {/* Bar progress cards */}
              <div className="space-y-2">
                {([1, 2, 3, 4, 5, 6] as PbdLevel[]).map(lvl => {
                  const count = metrics.pbdCounts[`TP${lvl}`];
                  const percent = Math.round((count / (metrics.total || 1)) * 100);
                  const colorToken = getPbdSemanticColor(lvl);
                  const style = ACADEMIC_COLOR_TOKENS[colorToken];

                  return (
                    <div key={lvl} className="flex items-center gap-3">
                      <div className="w-14">
                        <PbdBadge tp={lvl} size="sm" />
                      </div>
                      <div className="flex-1 bg-slate-100 h-4 rounded-full overflow-hidden p-0.5 border border-slate-200">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${style.tailwind.bg}`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <div className="w-16 text-right">
                        <span className="text-xs font-black text-slate-800">{count}</span>
                        <span className="text-[10px] font-mono text-slate-400 ml-1">({percent}%)</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Recharts Bar Chart */}
              <div className="h-48 w-full pt-4 border-t border-slate-100">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pbdChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {pbdChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* UASA Distribution Panel */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black uppercase text-slate-900 tracking-tight">
                    Taburan Gred UASA (A–F)
                  </h3>
                  <p className="text-xs text-slate-400">Gred automatik: A–B Hijau, C Kuning, D Jingga, E–F Merah</p>
                </div>
                <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-[10px] font-mono font-bold text-slate-600">
                  {metrics.total} Murid
                </span>
              </div>

              {/* Bar progress cards */}
              <div className="space-y-2">
                {(['A', 'B', 'C', 'D', 'E', 'F'] as UasaGrade[]).map(g => {
                  const count = metrics.uasaCounts[g];
                  const percent = Math.round((count / (metrics.total || 1)) * 100);
                  const colorToken = getUasaSemanticColor(g);
                  const style = ACADEMIC_COLOR_TOKENS[colorToken];

                  return (
                    <div key={g} className="flex items-center gap-3">
                      <div className="w-14">
                        <UasaBadge grade={g} size="sm" showMark={false} />
                      </div>
                      <div className="flex-1 bg-slate-100 h-4 rounded-full overflow-hidden p-0.5 border border-slate-200">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${style.tailwind.bg}`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <div className="w-16 text-right">
                        <span className="text-xs font-black text-slate-800">{count}</span>
                        <span className="text-[10px] font-mono text-slate-400 ml-1">({percent}%)</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Recharts Bar Chart */}
              <div className="h-48 w-full pt-4 border-t border-slate-100">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={uasaChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {uasaChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Section 16: Panitia / Dialog Prestasi Tier Breakdown */}
          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 space-y-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">
              Pelan Tindakan Dialog Prestasi & Panitia mengikut Tahap
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl">
                <span className="text-xs font-black text-rose-800 block">MERAH: Intervensi Segera</span>
                <span className="text-xl font-black text-rose-900 mt-1 block">
                  {metrics.pbdCounts.TP1 + metrics.pbdCounts.TP2 + metrics.uasaCounts.E + metrics.uasaCounts.F} Rekod
                </span>
                <p className="text-[11px] text-rose-700 mt-1">
                  Murid TP1/TP2 atau Gred E/F wajib dimasukkan ke dalam program klinik pemulihan khas.
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl">
                <span className="text-xs font-black text-amber-800 block">JINGGA: Pengukuhan</span>
                <span className="text-xl font-black text-amber-900 mt-1 block">
                  {metrics.pbdCounts.TP3 + metrics.uasaCounts.D} Rekod
                </span>
                <p className="text-[11px] text-amber-700 mt-1">
                  Murid TP3 atau Gred D berisiko merosot jika tidak dibimbing ke aras kemahiran kukuh.
                </p>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-2xl">
                <span className="text-xs font-black text-yellow-800 block">KUNING: Potensi Lonjakan</span>
                <span className="text-xl font-black text-yellow-900 mt-1 block">
                  {metrics.nearMissCount} Near Miss
                </span>
                <p className="text-[11px] text-yellow-700 mt-1">
                  Murid hampir capai gred seterusnya (1–3 markah). Sasaran lonjakan optimum panitia.
                </p>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl">
                <span className="text-xs font-black text-emerald-800 block">HIJAU: Mencapai & Cemerlang</span>
                <span className="text-xl font-black text-emerald-900 mt-1 block">
                  {metrics.meetingTargetCount} Murid ({metrics.meetingTargetPercent}%)
                </span>
                <p className="text-[11px] text-emerald-700 mt-1">
                  Murid melepasi sasaran. Disediakan program pengayaan KBAT untuk mengekalkan momentum.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 14: STUDENT ANALYSIS PANEL & CARD DRILLDOWN */}
      {activeTab === 'students' && (
        <div className="space-y-6">
          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black uppercase text-slate-400 mr-2 flex items-center gap-1">
                <Filter size={14} /> Tapis:
              </span>
              <button
                onClick={() => setStudentFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  studentFilter === 'ALL' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Semua ({records.length})
              </button>
              <button
                onClick={() => setStudentFilter('CRITICAL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  studentFilter === 'CRITICAL' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                }`}
              >
                Kritikal ({metrics.priorityCounts.CRITICAL})
              </button>
              <button
                onClick={() => setStudentFilter('NEAR_MISS')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  studentFilter === 'NEAR_MISS' ? 'bg-yellow-500 text-white' : 'bg-yellow-50 text-yellow-800 hover:bg-yellow-100'
                }`}
              >
                Near Miss ({metrics.nearMissCount})
              </button>
              <button
                onClick={() => setStudentFilter('MISMATCH')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  studentFilter === 'MISMATCH' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
                }`}
              >
                Mismatch ({metrics.mismatchCount})
              </button>
              <button
                onClick={() => setStudentFilter('EXCELLENT')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  studentFilter === 'EXCELLENT' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                }`}
              >
                Cemerlang ({metrics.priorityCounts.EXCELLENT})
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama murid..."
                className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 w-64"
              />
            </div>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredStudents.map(student => {
              const latestTp = student.pbd.latestTp || student.pbd.ar2 || student.pbd.ar1;
              const targetTp = student.pbd.etr || 4;
              const tovTp = student.pbd.tov;

              const nearMiss = getNearMissStatus(latestTp, targetTp);
              const mismatch = getMismatchStatus(latestTp, targetTp);
              const priority = getInterventionPriority(
                latestTp || student.uasa.currentMark,
                targetTp || student.uasa.targetGrade,
                tovTp || student.uasa.previousMark
              );

              return (
                <div
                  key={student.studentId}
                  className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-all space-y-4"
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <h4 className="font-black text-sm text-slate-900 uppercase">
                        {student.name}
                      </h4>
                      <span className="text-[10px] text-slate-400 font-bold uppercase">
                        {student.className} • {student.subjectName}
                      </span>
                    </div>
                    <InterventionPriorityBadge priority={priority.priority} size="sm" />
                  </div>

                  {/* PBD Progression Subsection */}
                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-black uppercase text-slate-500 text-[10px]">PBD Prestasi</span>
                      <ProgressIndicator previous={tovTp} current={latestTp} showLabel />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-400">TOV:</span>
                        <PbdBadge tp={tovTp} size="sm" />
                      </div>
                      <ChevronRight size={12} className="text-slate-300" />
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-400">Terkini:</span>
                        <PbdBadge tp={latestTp} size="sm" />
                      </div>
                      <ChevronRight size={12} className="text-slate-300" />
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-400">Sasaran:</span>
                        <PbdBadge tp={targetTp} size="sm" />
                      </div>
                    </div>
                  </div>

                  {/* UASA Subsection */}
                  {(student.uasa.currentMark !== undefined && student.uasa.currentMark !== null) && (
                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-black uppercase text-slate-500 text-[10px]">UASA Peperiksaan</span>
                        <ProgressIndicator previous={student.uasa.previousMark} current={student.uasa.currentMark} showLabel />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-bold text-slate-400">Lalu:</span>
                          <span className="text-xs font-mono font-bold text-slate-700">
                            {student.uasa.previousMark || '-'}
                          </span>
                        </div>
                        <ChevronRight size={12} className="text-slate-300" />
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-slate-400">Semasa:</span>
                          <UasaBadge mark={student.uasa.currentMark} grade={student.uasa.currentGrade} size="sm" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Near Miss / Mismatch Alerts */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {nearMiss.isNearMiss && <NearMissBadge current={latestTp} target={targetTp} />}
                    {mismatch.isMismatch && <MismatchBadge actual={latestTp} target={targetTp} />}
                  </div>

                  {/* Recommended Action */}
                  <div className="text-[11px] text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="font-bold text-slate-800 block text-[10px] uppercase mb-0.5">
                      Cadangan Tindakan:
                    </span>
                    <p className="leading-snug text-slate-500">
                      {priority.actionSummaryMs}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW: PBD DETAILS */}
      {activeTab === 'pbd' && (
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black uppercase text-slate-900 tracking-tight">
                Taburan & Rekod Terperinci Pentaksiran Bilik Darjah (PBD)
              </h3>
              <p className="text-xs text-slate-400">Lajur Progression Matrix: TOV → OTI1 → AR1 → OTI2 → AR2 → ETR</p>
            </div>
          </div>

          <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-[500px] overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-100 z-10 border-b border-slate-200">
                <tr className="text-slate-500 text-[10px] font-black uppercase tracking-wider">
                  <th className="px-4 py-3">Bil</th>
                  <th className="px-6 py-3">Nama Murid</th>
                  <th className="px-4 py-3 text-center">TOV</th>
                  <th className="px-4 py-3 text-center">OTI1</th>
                  <th className="px-4 py-3 text-center">AR1</th>
                  <th className="px-4 py-3 text-center">OTI2</th>
                  <th className="px-4 py-3 text-center">AR2</th>
                  <th className="px-4 py-3 text-center">ETR</th>
                  <th className="px-4 py-3 text-center">Kemajuan</th>
                  <th className="px-6 py-3">Status / Intervensi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {records.map((r, idx) => {
                  const latestTp = r.pbd.latestTp || r.pbd.ar2 || r.pbd.ar1;
                  const targetTp = r.pbd.etr || 4;
                  const priority = getInterventionPriority(latestTp, targetTp, r.pbd.tov);

                  return (
                    <tr key={r.studentId} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-slate-400 text-[11px]">{idx + 1}</td>
                      <td className="px-6 py-3 font-bold text-slate-900 uppercase">{r.name}</td>
                      <td className="px-4 py-3 text-center"><PbdBadge tp={r.pbd.tov} size="sm" /></td>
                      <td className="px-4 py-3 text-center"><PbdBadge tp={r.pbd.oti1} size="sm" /></td>
                      <td className="px-4 py-3 text-center"><PbdBadge tp={r.pbd.ar1} size="sm" /></td>
                      <td className="px-4 py-3 text-center"><PbdBadge tp={r.pbd.oti2} size="sm" /></td>
                      <td className="px-4 py-3 text-center"><PbdBadge tp={r.pbd.ar2} size="sm" /></td>
                      <td className="px-4 py-3 text-center"><PbdBadge tp={r.pbd.etr} size="sm" /></td>
                      <td className="px-4 py-3 text-center">
                        <ProgressIndicator previous={r.pbd.tov} current={latestTp} />
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <InterventionPriorityBadge priority={priority.priority} size="sm" />
                          <NearMissBadge current={latestTp} target={targetTp} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW: UASA DETAILS */}
      {activeTab === 'uasa' && (
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black uppercase text-slate-900 tracking-tight">
                Keputusan & Analisis Gred Ujian Akhir Sesi Akademik (UASA)
              </h3>
              <p className="text-xs text-slate-400">Gred dikira automatik daripada markah mengikut skala rasmi KPM</p>
            </div>
          </div>

          <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-[500px] overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-100 z-10 border-b border-slate-200">
                <tr className="text-slate-500 text-[10px] font-black uppercase tracking-wider">
                  <th className="px-4 py-3">Bil</th>
                  <th className="px-6 py-3">Nama Murid</th>
                  <th className="px-6 py-3 text-center">Markah Lalu</th>
                  <th className="px-6 py-3 text-center">Markah Semasa [Gred]</th>
                  <th className="px-6 py-3">Tafsiran KPM</th>
                  <th className="px-4 py-3 text-center">Perubahan</th>
                  <th className="px-6 py-3">Status Intervensi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {records.map((r, idx) => {
                  const currentMark = r.uasa.currentMark;
                  const grade = r.uasa.currentGrade || getUasaGrade(currentMark);
                  const interpretation = getUasaGradeInterpretation(grade);
                  const nearMiss = getNearMissStatus(currentMark, undefined, { targetGrade: r.uasa.targetGrade as any });

                  return (
                    <tr key={r.studentId} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-slate-400 text-[11px]">{idx + 1}</td>
                      <td className="px-6 py-3 font-bold text-slate-900 uppercase">{r.name}</td>
                      <td className="px-6 py-3 text-center font-mono font-bold text-slate-600">
                        {r.uasa.previousMark !== undefined && r.uasa.previousMark !== null ? r.uasa.previousMark : '-'}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <UasaBadge mark={currentMark} grade={grade} size="sm" />
                      </td>
                      <td className="px-6 py-3 font-bold text-slate-700 uppercase text-[11px]">
                        {interpretation}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <ProgressIndicator previous={r.uasa.previousMark} current={currentMark} />
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          {nearMiss.isNearMiss ? (
                            <NearMissBadge current={currentMark} target={r.uasa.targetGrade} />
                          ) : (
                            <span className="text-[11px] font-medium text-slate-500">
                              {currentMark !== null && currentMark !== undefined && currentMark >= 50 ? 'Memuaskan' : 'Perlu Bimbingan'}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
