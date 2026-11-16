import React, { useState, useMemo } from 'react';
import {
  DAYS_OF_WEEK,
  ScheduleGrid,
  getGradeDaySlots,
} from './types';
import { SubjectAllocationRow } from './SchoolTimetableMatrix';
import {
  REHAT_VERTICAL_LETTER,
  TeacherDirectoryEntry,
  buildClassLampiranAAnalysis,
  formatKemaskiniDate,
  formatPenggalSesi,
  getDesignatedPemulihanTeacherCode,
  isKP2027Year1Active,
  parseTeacherCodes,
  resolveCellPemulihanTeacher,
} from '../../utils/lampiranData';
import { exportSingleClassToExcel } from '../../utils/timetableExport';
import { Printer, FileSpreadsheet, Download } from 'lucide-react';
import { useSchoolTenant } from '../../contexts/SchoolTenantContext';

interface LampiranAPrintableSheetProps {
  schedule: ScheduleGrid;
  grade: number;
  academicYear: string;
  schoolName: string;
  classTeachers: Record<number, string>;
  matrixData: SubjectAllocationRow[];
  teacherMapping: { list: TeacherDirectoryEntry[] };
  displayMode: 'NUMBER' | 'CODE';
  onUpdateSchedule?: (newSchedule: ScheduleGrid) => void;
  kemaskiniDate?: string;
  pageBreakClass?: string;
}

export const LampiranAPrintableSheet: React.FC<LampiranAPrintableSheetProps> = ({
  schedule,
  grade,
  academicYear,
  schoolName,
  classTeachers,
  matrixData,
  teacherMapping,
  displayMode,
  onUpdateSchedule,
  kemaskiniDate = formatKemaskiniDate(),
  pageBreakClass = '',
}) => {
  const isT1Shifted = grade === 1 && isKP2027Year1Active(academicYear);
  const currentClassTeacher = classTeachers[grade] || 'Belum Ditetapkan';
  const guruPemulihanCode = useMemo(
    () => getDesignatedPemulihanTeacherCode(teacherMapping.list),
    [teacherMapping.list]
  );
  const headerSlots = useMemo(
    () => getGradeDaySlots(grade, 'ISNIN', academicYear),
    [grade, academicYear]
  );

  const analysisBundle = useMemo(
    () =>
      buildClassLampiranAAnalysis(
        schedule,
        grade,
        academicYear,
        matrixData,
        teacherMapping,
        displayMode
      ),
    [schedule, grade, academicYear, matrixData, teacherMapping, displayMode]
  );

  const getTeacherDisplay = (code: string) => {
    const parts = parseTeacherCodes(code);
    if (parts.length === 0) return '';
    return parts
      .map((trimmed) => {
        if (displayMode === 'CODE') return trimmed;
        const found = teacherMapping.list.find((t) => t.code === trimmed);
        return found ? String(found.num) : trimmed;
      })
      .join(' / ');
  };

  return (
    <div
      className={`bg-white text-black rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xl print:p-0 print:border-none print:shadow-none print:rounded-none print-color-exact ${pageBreakClass}`}
    >
      {/* Top Meta Row: Kemaskini (Left) & Lampiran A (Right Bold Blue) */}
      <div className="flex items-center justify-between text-[11px] font-bold mb-1.5">
        <span className="text-black">Kemaskini : {kemaskiniDate}</span>
        <span className="font-extrabold text-[13px]" style={{ color: '#1D4ED8' }}>
          Lampiran A
        </span>
      </div>

      {/* Centered Maroon Title */}
      <div className="text-center mb-3">
        <h2
          className="text-lg sm:text-xl font-black uppercase tracking-wide"
          style={{ color: '#800020' }}
        >
          JADUAL WAKTU KELAS TAHUN {grade} ({academicYear})
        </h2>
      </div>

      {/* Dotted Metadata Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-[11px] font-bold text-black mb-3">
        <div className="border-b border-dotted border-black pb-0.5 flex items-baseline gap-1.5">
          <span className="uppercase shrink-0">KELAS / GURU KELAS :</span>
          <span className="uppercase font-black">
            TAHUN {grade} — {currentClassTeacher}
          </span>
        </div>
        <div className="border-b border-dotted border-black pb-0.5 flex items-baseline gap-1.5">
          <span className="uppercase shrink-0">PENGGAL :</span>
          <span className="uppercase font-black">{formatPenggalSesi(academicYear)}</span>
        </div>
        <div className="border-b border-dotted border-black pb-0.5 flex items-baseline gap-1.5">
          <span className="uppercase shrink-0">KURIKULUM :</span>
          <span className="font-black">
            {isT1Shifted ? 'KP2027 (Tahun 1 · 46.5 Waktu)' : 'KSSR Semakan'}
          </span>
        </div>
        <div className="border-b border-dotted border-black pb-0.5 flex items-baseline gap-1.5">
          <span className="uppercase shrink-0">SEKOLAH :</span>
          <span className="font-black">{schoolName}</span>
        </div>
      </div>

      {/* Class Timetable Double-Bordered Grid */}
      <div className="overflow-x-auto">
        <table className="w-full kpm-double-table text-center text-[10px] table-fixed">
          <thead>
            <tr style={{ backgroundColor: '#CCFFCC' }}>
              <th className="py-1.5 px-1 w-20 font-black text-black text-[10px] uppercase">
                HARI / WAKTU
              </th>
              {headerSlots.map((s) => {
                let headerLabel = s.label;
                if (s.slotId === 'MEMBACA' && grade === 1) {
                  const codes = Array.from(
                    new Set(
                      DAYS_OF_WEEK.map((d) => schedule[1]?.[d]?.['MEMBACA']?.subjectCode?.trim().toUpperCase()).filter(
                        (c): c is string => Boolean(c)
                      )
                    )
                  );
                  if (codes.length === 1) headerLabel = codes[0];
                  else if (codes.length > 1) headerLabel = 'Prog. Pagi';
                }
                return (
                  <th
                    key={s.slotId}
                    className={`py-1 px-0.5 font-black text-black ${
                      s.isRecess ? 'w-8' : ''
                    }`}
                    style={s.isRecess ? { backgroundColor: '#B8CCE4' } : undefined}
                  >
                    <div className="text-[9px] font-black">{headerLabel}</div>
                    <div className="text-[8px] font-bold leading-tight">
                      {s.startTime}-{s.endTime}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {DAYS_OF_WEEK.map((day) => {
              const daySlots = getGradeDaySlots(grade, day, academicYear);
              return (
                <tr key={day} className="h-12">
                  <td
                    className="py-1.5 px-1.5 font-black text-[10px] text-black text-left"
                    style={{ backgroundColor: '#F8FAFC' }}
                  >
                    {day}
                  </td>
                  {headerSlots.map((headerSlot) => {
                    // Align all post-recess columns (>= 10:15 / 615 min) strictly by exact clock interval
                    // so TASMIK lands seamlessly right after the final academic period across JT1-JT6
                    const slot =
                      headerSlot.startMinutes >= 615
                        ? daySlots.find(
                            (s) =>
                              !s.isRecess &&
                              s.startMinutes === headerSlot.startMinutes &&
                              s.endMinutes === headerSlot.endMinutes
                          )
                        : daySlots.find((s) => s.slotId === headerSlot.slotId);
                    if (!slot) {
                      return (
                        <td
                          key={headerSlot.slotId}
                          style={{ backgroundColor: '#F1F5F9' }}
                        >
                          <span className="text-[9px] text-slate-300">-</span>
                        </td>
                      );
                    }
                    if (slot.isRecess) {
                      return (
                        <td
                          key={headerSlot.slotId}
                          className="font-black text-xs text-black"
                          style={{ backgroundColor: '#B8CCE4' }}
                        >
                          {REHAT_VERTICAL_LETTER[day]}
                        </td>
                      );
                    }

                    const cell = schedule[grade]?.[day]?.[slot.slotId];
                    const isBmOrMt =
                      cell &&
                      (cell.subjectCode.toUpperCase() === 'BM' ||
                        cell.subjectCode.toUpperCase() === 'MT');

                    const handleCellClick = () => {
                      if (isBmOrMt && onUpdateSchedule) {
                        const newSchedule = JSON.parse(JSON.stringify(schedule)) as ScheduleGrid;
                        const target = newSchedule[grade]?.[day]?.[slot.slotId];
                        if (target) {
                          target.isPemulihan = !target.isPemulihan;
                          if (target.isPemulihan && guruPemulihanCode && !target.pemulihanManualOverride) {
                            target.pemulihanTeacherCode = guruPemulihanCode;
                          } else if (!target.isPemulihan) {
                            target.pemulihanTeacherCode = '';
                            target.pemulihanManualOverride = false;
                          }
                          onUpdateSchedule(newSchedule);
                        }
                      }
                    };

                    const pemulihanTeacher = cell?.isPemulihan
                      ? resolveCellPemulihanTeacher(cell, guruPemulihanCode)
                      : '';

                    let cellBg = '#FFFFFF';
                    if (slot.slotId === 'PKAR') {
                      cellBg = '#DCFCE7';
                    } else if (isT1Shifted && ['W1', 'W2', 'W3', 'W4'].includes(slot.slotId)) {
                      cellBg = '#FEF9C3';
                    } else if (cell?.isPemulihan) {
                      cellBg = '#ECFDF5';
                    } else if (slot.slotId === 'TASMIK' && cell?.teacherCode?.trim()) {
                      cellBg = '#F0FDF4';
                    }

                    return (
                      <td
                        key={headerSlot.slotId}
                        onClick={handleCellClick}
                        title={
                          isBmOrMt && onUpdateSchedule
                            ? 'Klik untuk aktifkan / nyahaktifkan lampiran Pemulihan Khas (PBM / PMT)'
                            : undefined
                        }
                        style={{ backgroundColor: cellBg }}
                        className={`p-1 align-middle transition ${
                          isBmOrMt && onUpdateSchedule ? 'cursor-pointer hover:opacity-85' : ''
                        }`}
                      >
                        {cell ? (
                          <div className="space-y-0.5">
                            <div className="font-black text-[11px] text-black leading-tight flex items-center justify-center gap-0.5">
                              <span>{cell.subjectCode}</span>
                              {cell.isCoTeaching && (
                                <span className="text-[8px] font-bold text-purple-700">(Co)</span>
                              )}
                            </div>
                            {cell.subjectCode !== 'PN' && (
                              <div className="text-[9px] font-bold text-black leading-tight">
                                {getTeacherDisplay(cell.teacherCode)}
                              </div>
                            )}
                            {slot.slotId === 'PKAR' && (
                              <div
                                className="text-[7px] font-black leading-tight"
                                style={{ color: '#15803D' }}
                              >
                                +0.5w
                              </div>
                            )}
                            {cell.isPemulihan && (
                              <div className="pt-0.5">
                                <span className="inline-block px-1 py-0.2 rounded text-[7px] font-black uppercase bg-emerald-700 text-white">
                                  {cell.subjectCode.toUpperCase() === 'BM' ? 'PBM' : 'PMT'}
                                  {pemulihanTeacher ? ` (${getTeacherDisplay(pemulihanTeacher)})` : ''}
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bottom Analysis Table: ANALISIS JADUAL WAKTU KELAS & Signatures */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
        <div className="md:col-span-9">
          <h4
            className="text-[11px] font-black uppercase tracking-wide mb-1"
            style={{ color: '#800020' }}
          >
            ANALISIS JADUAL WAKTU KELAS
          </h4>
          <table className="w-full kpm-double-table text-[10px]">
            <thead>
              <tr style={{ backgroundColor: '#FFFF99' }}>
                <th
                  className="py-1 px-2 font-black text-center w-24"
                  style={{ color: '#CC00CC' }}
                >
                  SINGKATAN NAMA
                </th>
                <th
                  className="py-1 px-2 font-black text-left"
                  style={{ color: '#CC00CC' }}
                >
                  NAMA GURU
                </th>
                <th
                  className="py-1 px-2 font-black text-left"
                  style={{ color: '#CC00CC' }}
                >
                  M/P
                </th>
                <th
                  className="py-1 px-2 font-black text-center w-20"
                  style={{ color: '#CC00CC' }}
                >
                  BIL. WAKTU
                </th>
                <th
                  className="py-1 px-2 font-black text-center w-16"
                  style={{ color: '#CC00CC' }}
                >
                  MINIT
                </th>
              </tr>
            </thead>
            <tbody>
              {analysisBundle.analysisRows.map((row, idx) => (
                <tr key={`${row.singkatanNama}_${row.mp}_${idx}`}>
                  <td className="py-1 px-2 text-center font-black">{row.singkatanNama}</td>
                  <td className="py-1 px-2 text-left font-bold uppercase">{row.namaGuru}</td>
                  <td className="py-1 px-2 text-left font-bold">{row.mp}</td>
                  <td className="py-1 px-2 text-center font-black">{row.bilWaktu}</td>
                  <td className="py-1 px-2 text-center font-black">{row.minit}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: '#FFFF99' }}>
                <td colSpan={3} className="py-1.5 px-2 text-right font-black text-black">
                  JUMLAH
                </td>
                <td className="py-1.5 px-2 text-center font-black text-black">
                  {analysisBundle.totalWaktu}
                </td>
                <td className="py-1.5 px-2 text-center font-black text-black">
                  {analysisBundle.totalMinit}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Signatures Panel */}
        <div className="md:col-span-3 pt-5 grid grid-cols-1 gap-8 text-[10px] text-black font-sans">
          <div>
            <p className="font-semibold">Disediakan oleh:</p>
            <div className="mt-8 border-t border-black pt-1 font-black uppercase">
              {currentClassTeacher !== 'Belum Ditetapkan' ? currentClassTeacher : 'Guru Kelas'}
            </div>
            <p className="text-[9px] text-slate-600">Guru Kelas Tahun {grade}</p>
          </div>
          <div>
            <p className="font-semibold">Disahkan oleh:</p>
            <div className="mt-8 border-t border-black pt-1 font-black uppercase">Guru Besar</div>
            <p className="text-[9px] text-slate-600">{schoolName}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ClassTimetableViewProps {
  schedule: ScheduleGrid;
  academicYear: string;
  schoolName?: string;
  schoolCode?: string;
  classTeachers: Record<number, string>;
  matrixData: SubjectAllocationRow[];
  displayMode: 'NUMBER' | 'CODE';
  teacherMapping: { list: TeacherDirectoryEntry[] };
  onUpdateSchedule?: (newSchedule: ScheduleGrid) => void;
  onExportAllExcel?: () => void;
  onBulkPrintPdf?: () => void;
}

export const ClassTimetableView: React.FC<ClassTimetableViewProps> = ({
  schedule,
  academicYear,
  schoolName: propSchoolName,
  schoolCode: propSchoolCode,
  classTeachers,
  matrixData,
  displayMode,
  teacherMapping,
  onUpdateSchedule,
  onExportAllExcel,
  onBulkPrintPdf,
}) => {
  const tenant = useSchoolTenant();
  const schoolName = propSchoolName || tenant.schoolName;
  const schoolCode = propSchoolCode || tenant.schoolCode;
  const [selectedGrade, setSelectedGrade] = useState<number>(1);
  const [isExporting, setIsExporting] = useState(false);

  const isKP = selectedGrade === 1 && isKP2027Year1Active(academicYear);
  const currentClassTeacher = classTeachers[selectedGrade] || 'Belum Ditetapkan';

  const handleDownloadSingleExcel = async () => {
    try {
      setIsExporting(true);
      await exportSingleClassToExcel(selectedGrade, {
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
      {/* Control Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30">
              Lampiran A · Jadual Kelas
            </span>
            <span className="text-xs text-slate-400">
              JT1 – JT6 Lembaran Jadual Waktu Kelas Rasmi KPM
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
            Jadual Waktu Kelas: Tahun {selectedGrade} (JT{selectedGrade})
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Guru Kelas: <strong className="text-white">{currentClassTeacher}</strong> · Format:{' '}
            <strong className={isKP ? 'text-emerald-400' : 'text-amber-300'}>
              {isKP ? 'KP2027 (46.5 Waktu)' : 'KSSR Semakan'}
            </strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800">
            {[1, 2, 3, 4, 5, 6].map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setSelectedGrade(g)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                  selectedGrade === g
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                JT{g}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={isExporting}
            onClick={handleDownloadSingleExcel}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-emerald-600/30 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{isExporting ? 'Menjana...' : `Excel JT${selectedGrade}`}</span>
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
            >
              <Printer className="w-4 h-4 text-amber-400" />
              <span>Semua PDF</span>
            </button>
          )}
        </div>
      </div>

      {/* Printable Lampiran A Sheet */}
      <LampiranAPrintableSheet
        schedule={schedule}
        grade={selectedGrade}
        academicYear={academicYear}
        schoolName={schoolName}
        classTeachers={classTeachers}
        matrixData={matrixData}
        teacherMapping={teacherMapping}
        displayMode={displayMode}
        onUpdateSchedule={onUpdateSchedule}
      />
    </div>
  );
};
