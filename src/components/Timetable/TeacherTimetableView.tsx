import React, { useState, useMemo, useEffect } from 'react';
import {
  DAYS_OF_WEEK,
  ScheduleGrid,
} from './types';
import { SubjectAllocationRow } from './SchoolTimetableMatrix';
import {
  OPTION_A_COLUMNS,
  REHAT_VERTICAL_LETTER,
  TeacherDirectoryEntry,
  buildTeacherOptionAMatrix,
  formatKemaskiniDate,
  formatPenggalSesi,
} from '../../utils/lampiranData';
import { exportSingleTeacherToExcel } from '../../utils/timetableExport';
import { Printer, FileSpreadsheet, Download } from 'lucide-react';
import { useSchoolTenant } from '../../contexts/SchoolTenantContext';

interface LampiranBPrintableSheetProps {
  schedule: ScheduleGrid;
  academicYear: string;
  teacher: TeacherDirectoryEntry;
  schoolName: string;
  kemaskiniDate?: string;
  pageBreakClass?: string;
}

export const LampiranBPrintableSheet: React.FC<LampiranBPrintableSheetProps> = ({
  schedule,
  academicYear,
  teacher,
  schoolName,
  kemaskiniDate = formatKemaskiniDate(),
  pageBreakClass = '',
}) => {
  const bundle = useMemo(
    () => buildTeacherOptionAMatrix(schedule, teacher.code, academicYear),
    [schedule, teacher.code, academicYear]
  );

  return (
    <div
      className={`bg-white text-black rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xl print:p-0 print:border-none print:shadow-none print:rounded-none print-color-exact ${pageBreakClass}`}
    >
      {/* Top Meta Row: Kemaskini (Left) & Lampiran B (Right Bold Blue) */}
      <div className="flex items-center justify-between text-[11px] font-bold mb-1.5">
        <span className="text-black">Kemaskini : {kemaskiniDate}</span>
        <span className="font-extrabold text-[13px]" style={{ color: '#1D4ED8' }}>
          Lampiran B
        </span>
      </div>

      {/* Centered Maroon Title */}
      <div className="text-center mb-3">
        <h2
          className="text-lg sm:text-xl font-black uppercase tracking-wide"
          style={{ color: '#800020' }}
        >
          JADUAL WAKTU PERIBADI GURU TAHUN {academicYear}
        </h2>
      </div>

      {/* Dotted Metadata Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-[11px] font-bold text-black mb-3">
        <div className="border-b border-dotted border-black pb-0.5 flex items-baseline gap-1.5">
          <span className="uppercase shrink-0">NAMA GURU :</span>
          <span className="uppercase font-black">
            {teacher.name} ({teacher.code})
          </span>
        </div>
        <div className="border-b border-dotted border-black pb-0.5 flex items-baseline gap-1.5">
          <span className="uppercase shrink-0">PENGGAL :</span>
          <span className="uppercase font-black">{formatPenggalSesi(academicYear)}</span>
        </div>
        <div className="border-b border-dotted border-black pb-0.5 flex items-baseline gap-1.5">
          <span className="uppercase shrink-0">KELAS/TAHUN DIAJAR :</span>
          <span className="font-black">{bundle.taughtGradesLabel}</span>
        </div>
        <div className="border-b border-dotted border-black pb-0.5 flex items-baseline gap-1.5">
          <span className="uppercase shrink-0">SEKOLAH :</span>
          <span className="font-black">{schoolName}</span>
        </div>
      </div>

      {/* Option A 12-Column Double-Bordered Timetable Grid */}
      <div className="overflow-x-auto">
        <table className="w-full kpm-double-table text-center text-[10px] table-fixed">
          <thead>
            <tr style={{ backgroundColor: '#CCFFCC' }}>
              <th className="py-1.5 px-1 w-20 font-black text-black text-[10px] uppercase">
                HARI / WAKTU
              </th>
              {OPTION_A_COLUMNS.map((col) => {
                if (col.isRecess) {
                  return (
                    <th
                      key={col.slotId}
                      className="py-1 px-0.5 w-8 font-black text-black text-[9px]"
                      style={{ backgroundColor: '#B8CCE4' }}
                    >
                      <div>REHAT</div>
                      <div className="text-[8px] font-bold leading-tight">{col.t2To6Time}</div>
                    </th>
                  );
                }

                return (
                  <th key={col.slotId} className="py-1 px-0.5 align-middle">
                    {col.t1ShiftedTime ? (
                      <div className="leading-tight space-y-0.5">
                        <div className="font-black text-[9px]" style={{ color: '#CC00CC' }}>
                          {col.t2To6Time}
                        </div>
                        <div className="font-black text-[8px]" style={{ color: '#0F766E' }}>
                          {col.t1ShiftedTime}
                        </div>
                      </div>
                    ) : (
                      <div className="leading-tight space-y-0.5 text-black">
                        <div className="font-black text-[9px]">W{col.periodLabel}</div>
                        <div className="font-bold text-[8px]">{col.t2To6Time}</div>
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {DAYS_OF_WEEK.map((day) => (
              <tr key={day} className="h-12">
                <td
                  className="py-1.5 px-1.5 font-black text-[10px] text-black text-left"
                  style={{ backgroundColor: '#F8FAFC' }}
                >
                  {day}
                </td>

                {OPTION_A_COLUMNS.map((col) => {
                  if (col.isRecess) {
                    return (
                      <td
                        key={col.slotId}
                        className="font-black text-xs text-black"
                        style={{ backgroundColor: '#B8CCE4' }}
                      >
                        {REHAT_VERTICAL_LETTER[day]}
                      </td>
                    );
                  }

                  const isOffHours =
                    day === 'JUMAAT' && ['W10', 'W11'].includes(col.slotId);

                  const entry = bundle.grid[day]?.[col.slotId];

                  if (!entry) {
                    return (
                      <td
                        key={col.slotId}
                        style={{
                          backgroundColor: isOffHours ? '#F1F5F9' : '#FFFFFF',
                        }}
                      >
                        {isOffHours ? (
                          <span className="text-[9px] text-slate-300">-</span>
                        ) : null}
                      </td>
                    );
                  }

                  // Year 1 PKAR (Col 5) -> Soft Green (#DCFCE7)
                  if (entry.isPKAR) {
                    return (
                      <td
                        key={col.slotId}
                        className="p-1 align-middle"
                        style={{ backgroundColor: '#DCFCE7' }}
                      >
                        <div className="font-black text-[10px] text-black leading-tight">
                          PKAR (T.1)
                        </div>
                        <div
                          className="font-bold text-[8px] leading-tight mt-0.5"
                          style={{ color: '#15803D' }}
                        >
                          09:30-09:45 (+0.5 Waktu)
                        </div>
                      </td>
                    );
                  }

                  // Year 1 Morning (Cols 1..4) -> Soft Amber/Yellow (#FEF9C3)
                  if (entry.isYear1Morning) {
                    return (
                      <td
                        key={col.slotId}
                        className="p-0.5 align-middle"
                        style={{ backgroundColor: '#FEF9C3' }}
                      >
                        {entry.hasMembacaT1 && (
                          <div
                            className="text-[7px] font-black leading-tight px-0.5 py-0.5 mb-0.5 rounded-xs"
                            style={{ backgroundColor: '#CCFBF1', color: '#0F766E' }}
                          >
                            {entry.membacaLabel || 'MEMBACA T.1 [07:15-07:30]'}
                          </div>
                        )}
                        <div className="font-black text-[10px] text-black leading-tight">
                          {entry.subjectCode} (T.1)
                        </div>
                        <div
                          className="font-bold text-[8px] leading-tight mt-0.5"
                          style={{ color: '#B45309' }}
                        >
                          {entry.year1ClockBracket}
                        </div>
                      </td>
                    );
                  }

                  // Regular Tahun 2-6 or Post-Recess Synchronized Lesson -> White background, bold black text
                  return (
                    <td
                      key={col.slotId}
                      className="p-0.5 align-middle"
                      style={{
                        backgroundColor:
                          entry.hasMembacaT1 && !entry.subjectCode ? '#CCFBF1' : '#FFFFFF',
                      }}
                    >
                      {entry.hasMembacaT1 && (
                        <div
                          className="text-[7px] font-black leading-tight px-0.5 py-0.5 mb-0.5 rounded-xs"
                          style={{ backgroundColor: '#CCFBF1', color: '#0F766E' }}
                        >
                          {entry.membacaLabel || 'MEMBACA T.1 [07:15-07:30]'}
                        </div>
                      )}
                      {entry.subjectCode && (
                        <>
                          <div className="font-black text-[11px] text-black leading-tight">
                            {entry.subjectCode}
                          </div>
                          <div className="font-bold text-[9px] text-black leading-tight mt-0.5">
                            {entry.gradeLabel || `T.${entry.grade}`}
                          </div>
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottom Analysis & Signature Grid */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
        <div className="md:col-span-8">
          <h4
            className="text-[11px] font-black uppercase tracking-wide mb-1"
            style={{ color: '#800020' }}
          >
            ANALISIS JADUAL WAKTU PERIBADI
          </h4>
          <table className="w-full kpm-double-table text-[10px]">
            <thead>
              <tr style={{ backgroundColor: '#FFFF99' }}>
                <th
                  className="py-1 px-2 font-black text-center w-10"
                  style={{ color: '#CC00CC' }}
                >
                  Bil
                </th>
                <th
                  className="py-1 px-2 font-black text-left"
                  style={{ color: '#CC00CC' }}
                >
                  Mata Pelajaran
                </th>
                <th
                  className="py-1 px-2 font-black text-center w-24"
                  style={{ color: '#CC00CC' }}
                >
                  Kelas
                </th>
                <th
                  className="py-1 px-2 font-black text-center w-20"
                  style={{ color: '#CC00CC' }}
                >
                  Bil. Waktu
                </th>
                <th
                  className="py-1 px-2 font-black text-center w-20"
                  style={{ color: '#CC00CC' }}
                >
                  Minit
                </th>
              </tr>
            </thead>
            <tbody>
              {bundle.analysisRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-3 text-center text-slate-500 italic">
                    Tiada waktu mengajar dijadualkan untuk guru ini.
                  </td>
                </tr>
              ) : (
                bundle.analysisRows.map((row) => (
                  <tr key={`${row.grade}_${row.subjectCode}`}>
                    <td className="py-1 px-2 text-center font-bold">{row.bil}</td>
                    <td className="py-1 px-2 text-left font-bold">{row.mataPelajaranLabel}</td>
                    <td className="py-1 px-2 text-center font-semibold">{row.kelasLabel}</td>
                    <td className="py-1 px-2 text-center font-black">{row.bilWaktu}</td>
                    <td className="py-1 px-2 text-center font-black">{row.minit}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: '#FFFF99' }}>
                <td colSpan={3} className="py-1.5 px-2 text-right font-black text-black">
                  JUMLAH
                </td>
                <td className="py-1.5 px-2 text-center font-black text-black">
                  {bundle.totalWaktu}
                </td>
                <td className="py-1.5 px-2 text-center font-black text-black">
                  {bundle.totalMinit}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Signatures Panel */}
        <div className="md:col-span-4 pt-5 grid grid-cols-1 gap-8 text-[10px] text-black font-sans">
          <div>
            <p className="font-semibold">Tandatangan Guru:</p>
            <div className="mt-8 border-t border-black pt-1 font-black uppercase">
              {teacher.name}
            </div>
          </div>
          <div>
            <p className="font-semibold">Disahkan oleh Guru Besar:</p>
            <div className="mt-8 border-t border-black pt-1 font-black uppercase">
              Guru Besar / PK Pentadbiran
            </div>
            <p className="text-[9px] text-slate-600">{schoolName}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

interface TeacherTimetableViewProps {
  schedule: ScheduleGrid;
  academicYear: string;
  teacherMapping: { list: TeacherDirectoryEntry[] };
  displayMode: 'NUMBER' | 'CODE';
  schoolName?: string;
  schoolCode?: string;
  defaultTeacherCode?: string;
  classTeachers?: Record<number, string>;
  matrixData?: SubjectAllocationRow[];
  onExportAllExcel?: () => void;
  onBulkPrintPdf?: () => void;
}

export const TeacherTimetableView: React.FC<TeacherTimetableViewProps> = ({
  schedule,
  academicYear,
  teacherMapping,
  displayMode,
  schoolName: propSchoolName,
  schoolCode: propSchoolCode,
  defaultTeacherCode,
  classTeachers = {},
  matrixData = [],
  onExportAllExcel,
  onBulkPrintPdf,
}) => {
  const tenant = useSchoolTenant();
  const schoolName = propSchoolName || tenant.schoolName;
  const schoolCode = propSchoolCode || tenant.schoolCode;
  const [selectedTeacherCode, setSelectedTeacherCode] = useState<string>(
    defaultTeacherCode || teacherMapping.list[0]?.code || ''
  );
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (defaultTeacherCode && teacherMapping.list.some((t) => t.code === defaultTeacherCode)) {
      setSelectedTeacherCode(defaultTeacherCode);
    } else if (
      !selectedTeacherCode &&
      teacherMapping.list.length > 0
    ) {
      setSelectedTeacherCode(teacherMapping.list[0].code);
    }
  }, [defaultTeacherCode, teacherMapping.list, selectedTeacherCode]);

  const selectedTeacher = useMemo(() => {
    return teacherMapping.list.find((t) => t.code === selectedTeacherCode) || teacherMapping.list[0];
  }, [teacherMapping, selectedTeacherCode]);

  const workloads = useMemo(() => {
    if (!selectedTeacher) {
      return {
        daily: { ISNIN: 0, SELASA: 0, RABU: 0, KHAMIS: 0, JUMAAT: 0 },
        totalWaktu: 0,
        daysOver7: 0,
        daysOver8: 0,
      };
    }
    return buildTeacherOptionAMatrix(schedule, selectedTeacher.code, academicYear);
  }, [schedule, selectedTeacher, academicYear]);

  const isOptimal = workloads.totalWaktu >= 22 && workloads.totalWaktu <= 33;
  const isOverload = workloads.totalWaktu > 35;

  const handleDownloadSingleExcel = async () => {
    if (!selectedTeacher) return;
    try {
      setIsExporting(true);
      await exportSingleTeacherToExcel(selectedTeacher, {
        schedule,
        academicYear,
        schoolName,
        schoolCode,
        classTeachers,
        matrixData,
        teacherMapping,
        displayMode,
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Control Banner (hidden on print) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30">
              Lampiran B · Option A
            </span>
            <span className="text-xs text-slate-400">
              JG1 – JG50 Jadual Waktu Peribadi Guru (Dwi-Waktu Tahun 1)
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
            Jadual Mengajar: {selectedTeacher ? selectedTeacher.name : 'Pilih Guru'} (
            {selectedTeacher ? selectedTeacher.code : ''})
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Jumlah Waktu Seminggu:{' '}
            <strong className="text-white">{workloads.totalWaktu} waktu</strong> · Status Beban:{' '}
            <strong
              className={
                isOverload ? 'text-rose-400' : isOptimal ? 'text-emerald-400' : 'text-slate-300'
              }
            >
              {isOverload ? 'Lebih Beban (>35w)' : isOptimal ? 'Seimbang (22–33w)' : 'Kurang (<22w)'}
            </strong>{' '}
            · Hari &gt;7w:{' '}
            <strong
              className={
                workloads.daysOver7 > 1
                  ? 'text-rose-400'
                  : workloads.daysOver7 === 1
                  ? 'text-amber-300'
                  : 'text-emerald-400'
              }
            >
              {workloads.daysOver7}/1
            </strong>
          </p>
          {/* Daily workload distribution strip */}
          <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] font-mono">
            {DAYS_OF_WEEK.map((d) => {
              const cnt = Math.round(workloads.daily[d] * 10) / 10;
              return (
                <span
                  key={d}
                  className={`px-2 py-0.5 rounded-lg border font-bold ${
                    cnt > 8
                      ? 'bg-rose-950/80 border-rose-600 text-rose-300'
                      : cnt > 7
                      ? 'bg-amber-950/70 border-amber-600 text-amber-300'
                      : 'bg-slate-950 border-slate-700 text-slate-300'
                  }`}
                >
                  {d.slice(0, 3)}: {cnt}/8
                </span>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Teacher Selector Dropdown */}
          <select
            value={selectedTeacher?.code || ''}
            onChange={(e) => setSelectedTeacherCode(e.target.value)}
            className="px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-bold text-white outline-none focus:border-blue-500 cursor-pointer max-w-xs"
          >
            {teacherMapping.list.map((t, idx) => (
              <option key={`${t.code}_${t.id}_${idx}`} value={t.code}>
                [{t.num}] {t.code} - {t.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={isExporting || !selectedTeacher}
            onClick={handleDownloadSingleExcel}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-emerald-600/30 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{isExporting ? 'Menjana...' : 'Excel (.xlsx)'}</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-blue-600/30 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak / PDF A4</span>
          </button>

          {onExportAllExcel && (
            <button
              type="button"
              onClick={onExportAllExcel}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer"
              title="Muat turun Excel lengkap (Jadual Induk + semua Lampiran A & Lampiran B)"
            >
              <Download className="w-4 h-4" />
              <span>Semua Excel</span>
            </button>
          )}

          {onBulkPrintPdf && (
            <button
              type="button"
              onClick={onBulkPrintPdf}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider border border-slate-700 transition cursor-pointer"
              title="Cetak semua jadual dalam format A4 Landskap"
            >
              <Printer className="w-4 h-4 text-amber-400" />
              <span>Semua PDF</span>
            </button>
          )}
        </div>
      </div>

      {/* Printable Lampiran B Option A Sheet */}
      {selectedTeacher && (
        <LampiranBPrintableSheet
          schedule={schedule}
          academicYear={academicYear}
          teacher={selectedTeacher}
          schoolName={schoolName}
        />
      )}
    </div>
  );
};
