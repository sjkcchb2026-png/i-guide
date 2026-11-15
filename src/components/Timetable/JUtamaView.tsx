import React, { useState } from 'react';
import {
  DAYS_OF_WEEK,
  ScheduleGrid,
} from './types';
import { SubjectAllocationRow } from './SchoolTimetableMatrix';
import {
  TeacherDirectoryEntry,
  formatKemaskiniDate,
  formatPenggalSesi,
  isKP2027Year1Active,
  parseTeacherCodes,
} from '../../utils/lampiranData';
import { exportMasterTimetableToExcel } from '../../utils/timetableExport';
import { Printer, RotateCw, FileSpreadsheet, Download } from 'lucide-react';
import { useSchoolTenant } from '../../contexts/SchoolTenantContext';

interface JUtamaPrintableSheetProps {
  schedule: ScheduleGrid;
  academicYear: string;
  schoolName: string;
  schoolCode: string;
  classTeachers: Record<number, string>;
  displayMode: 'NUMBER' | 'CODE';
  teacherMapping: { list: TeacherDirectoryEntry[] };
  kemaskiniDate?: string;
  pageBreakClass?: string;
}

export const JUtamaPrintableSheet: React.FC<JUtamaPrintableSheetProps> = ({
  schedule,
  academicYear,
  schoolName,
  schoolCode,
  classTeachers,
  displayMode,
  teacherMapping,
  kemaskiniDate = formatKemaskiniDate(),
  pageBreakClass = '',
}) => {
  const isT1Shifted = isKP2027Year1Active(academicYear);

  const getTeacherLabel = (code: string) => {
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
      {/* Top Meta Bar */}
      <div className="flex items-center justify-between text-[11px] font-bold mb-1.5">
        <span>Kemaskini : {kemaskiniDate}</span>
        <span className="font-extrabold text-[13px]" style={{ color: '#1D4ED8' }}>
          JADUAL INDUK ({schoolCode})
        </span>
      </div>

      {/* Document Header */}
      <div className="text-center pb-3 border-b-2 border-black mb-4 space-y-0.5">
        <div className="text-[10px] font-black tracking-widest uppercase text-slate-600">
          KEMENTERIAN PENDIDIKAN MALAYSIA
        </div>
        <h1 className="text-lg sm:text-xl font-black tracking-tight text-black uppercase">
          {schoolName} ({schoolCode})
        </h1>
        <h2
          className="text-sm sm:text-base font-black uppercase tracking-wide"
          style={{ color: '#800020' }}
        >
          JADUAL WAKTU INDUK PERSEKOLAHAN — {formatPenggalSesi(academicYear)}
        </h2>
        <p className="text-[10px] text-slate-700 font-semibold">
          Isnin & Selasa (T1: 10w / T2-T6: 11w), Rabu & Khamis (T1: 9w / T2-T6: 10w), Jumaat (T1-T3: 7w / T4-T6: 8w) · Rehat: 09:45-10:15
        </p>
      </div>

      {/* Master Table per Day */}
      <div className="space-y-4">
        {DAYS_OF_WEEK.map((day) => {
          const isFri = day === 'JUMAAT';
          const isMonTue = day === 'ISNIN' || day === 'SELASA';
          const isWedThu = day === 'RABU' || day === 'KHAMIS';
          const dayHeaders = isFri
            ? ['W1', 'W2', 'W3', 'W4', 'W5', 'PKAR', 'REHAT', 'W6', 'W7', 'W8', 'W9']
            : isMonTue
            ? ['W1', 'W2', 'W3', 'W4', 'W5', 'PKAR', 'REHAT', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11', 'TASMIK']
            : ['W1', 'W2', 'W3', 'W4', 'W5', 'PKAR', 'REHAT', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11'];

          return (
            <div key={day} className="space-y-1 break-inside-avoid">
              <div
                className="flex items-center justify-between px-3 py-1 border border-black"
                style={{ backgroundColor: '#FFFF99' }}
              >
                <span className="font-black text-[11px] tracking-wider uppercase" style={{ color: '#800020' }}>
                  HARI: {day}
                </span>
                <span className="text-[10px] text-black font-bold font-mono">
                  {isFri
                    ? 'Tamat: 11:45 (T1–T3) / 12:15 (W9 T4–T6 Dikhaskan TASMIK 11:45–12:15)'
                    : isMonTue
                    ? 'Tamat: 13:15 (Tasmik 13:15–13:45)'
                    : 'Tamat: 12:45 (W11 Dikhaskan TASMIK 12:45–13:15)'}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full kpm-double-table text-center text-[10px]">
                  <thead>
                    <tr style={{ backgroundColor: '#CCFFCC' }}>
                      <th className="p-1.5 w-20 font-black text-black">Kelas</th>
                      <th className="p-1.5 w-32 font-black text-black text-left">Guru Kelas</th>
                      {dayHeaders.map((slot) => (
                        <th
                          key={slot}
                          className={`p-1 font-black text-black ${
                            slot === 'REHAT' ? 'w-10' : slot === 'PKAR' ? 'w-14' : ''
                          }`}
                          style={
                            slot === 'REHAT'
                              ? { backgroundColor: '#B8CCE4' }
                              : slot === 'PKAR' || (isWedThu && slot === 'W11') || (isFri && slot === 'W9')
                              ? { backgroundColor: '#DCFCE7' }
                              : undefined
                          }
                        >
                          <div className="text-[9px] font-black">
                            {isWedThu && slot === 'W11'
                              ? 'W11 (TASMIK)'
                              : isFri && slot === 'W9'
                              ? 'W9 (T4–6 TASMIK)'
                              : slot}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4, 5, 6].map((grade) => {
                      const classTeacher = classTeachers[grade] || '-';

                      return (
                        <tr key={grade}>
                          <td className="p-1 font-black text-black bg-slate-50 text-left">
                            Tahun {grade}
                          </td>
                          <td
                            className="p-1 text-[10px] text-black truncate text-left max-w-[130px]"
                            title={classTeacher}
                          >
                            {classTeacher}
                          </td>

                          {dayHeaders.map((slotKey) => {
                            if (slotKey === 'REHAT') {
                              const letters = ['R', 'E', 'H', 'A', 'T', ' '];
                              return (
                                <td
                                  key={slotKey}
                                  className="p-0.5 font-black text-[10px] text-black"
                                  style={{ backgroundColor: '#B8CCE4' }}
                                >
                                  {letters[grade - 1] || ' '}
                                </td>
                              );
                            }

                            const resolveSlotId = (g: number, sk: string): string | null => {
                              if (sk === 'PKAR') return g === 1 && isT1Shifted ? 'PKAR' : null;
                              if (sk === 'W1' || sk === 'W2' || sk === 'W3' || sk === 'W4') return sk;
                              if (sk === 'W5') return g === 1 && isT1Shifted ? null : 'W5';
                              if (isWedThu && sk === 'W11') return 'TASMIK';
                              if (g === 1 && isT1Shifted) {
                                if (sk === 'W6') return 'W5';
                                if (sk === 'W7') return 'W6';
                                if (sk === 'W8') return 'W7';
                                if (sk === 'W9') return isFri ? 'TASMIK' : 'W8';
                                if (sk === 'W10') return 'W9';
                                if (sk === 'W11') return 'W10';
                                if (sk === 'TASMIK') return isFri ? null : 'TASMIK';
                                return null;
                              }
                              if (isFri && sk === 'W8' && g < 4) return 'TASMIK';
                              if (isFri && sk === 'W9') return g >= 4 ? 'TASMIK' : null;
                              return sk;
                            };

                            const targetSlotId = resolveSlotId(grade, slotKey);
                            const cell = targetSlotId ? schedule[grade]?.[day]?.[targetSlotId] : null;

                            let cellBg = '#FFFFFF';
                            if (slotKey === 'PKAR' && grade === 1 && isT1Shifted) {
                              cellBg = '#DCFCE7';
                            } else if (
                              grade === 1 &&
                              isT1Shifted &&
                              ['W1', 'W2', 'W3', 'W4'].includes(targetSlotId || '')
                            ) {
                              cellBg = '#FEF9C3';
                            }

                            return (
                              <td
                                key={slotKey}
                                className="p-0.5 text-center align-middle"
                                style={{ backgroundColor: cellBg }}
                              >
                                {cell ? (
                                  <div>
                                    <div className="font-black text-black text-[10px] leading-tight">
                                      {cell.subjectCode}
                                    </div>
                                    {cell.subjectCode !== 'PN' && (
                                      <div className="text-[9px] text-blue-800 font-bold leading-tight">
                                        {getTeacherLabel(cell.teacherCode)}
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
            </div>
          );
        })}
      </div>

      {/* Footer Sign-off */}
      <div className="pt-6 mt-6 border-t border-black grid grid-cols-2 text-[10px] text-black font-sans">
        <div>
          <p>Disediakan oleh:</p>
          <p className="mt-6 font-black uppercase">Jawatankuasa Jadual Waktu Sekolah</p>
        </div>
        <div className="text-right">
          <p>Disahkan oleh:</p>
          <p className="mt-6 font-black uppercase">Guru Besar / Pentadbir Sekolah</p>
        </div>
      </div>
    </div>
  );
};

interface JUtamaViewProps {
  schedule: ScheduleGrid;
  academicYear: string;
  schoolName?: string;
  schoolCode?: string;
  classTeachers: Record<number, string>;
  matrixData?: SubjectAllocationRow[];
  displayMode: 'NUMBER' | 'CODE';
  teacherMapping: { list: TeacherDirectoryEntry[] };
  initialOrientation?: 'PORTRAIT' | 'LANDSCAPE';
  onExportAllExcel?: () => void;
  onBulkPrintPdf?: () => void;
}

export const JUtamaView: React.FC<JUtamaViewProps> = ({
  schedule,
  academicYear,
  schoolName: propSchoolName,
  schoolCode: propSchoolCode,
  classTeachers,
  matrixData = [],
  displayMode,
  teacherMapping,
  initialOrientation = 'LANDSCAPE',
  onExportAllExcel,
  onBulkPrintPdf,
}) => {
  const tenant = useSchoolTenant();
  const schoolName = propSchoolName || tenant.schoolName;
  const schoolCode = propSchoolCode || tenant.schoolCode;
  const [orientation, setOrientation] = useState<'PORTRAIT' | 'LANDSCAPE'>(initialOrientation);
  const [isExporting, setIsExporting] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadMasterExcel = async () => {
    try {
      setIsExporting(true);
      await exportMasterTimetableToExcel({
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
      {/* Print & View Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30">
              Jadual Induk
            </span>
            <span className="text-xs text-slate-400">JUtama Master School Timetable</span>
          </div>
          <h2 className="text-xl font-black text-white mt-1">
            Jadual Waktu Induk Sekolah ({orientation === 'LANDSCAPE' ? 'JUtamaL — Landskap' : 'JUtamaP — Potret'})
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Susun atur sedia cetak rasmi bagi seluruh Tahun 1 hingga Tahun 6.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setOrientation(orientation === 'LANDSCAPE' ? 'PORTRAIT' : 'LANDSCAPE')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 transition cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5 text-blue-400" />
            <span>Tukar Orientasi ({orientation === 'LANDSCAPE' ? 'Landskap' : 'Potret'})</span>
          </button>

          <button
            type="button"
            disabled={isExporting}
            onClick={handleDownloadMasterExcel}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-emerald-600/30 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{isExporting ? 'Menjana...' : 'Excel Induk'}</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
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

      {/* Printable Master Timetable Document */}
      <JUtamaPrintableSheet
        schedule={schedule}
        academicYear={academicYear}
        schoolName={schoolName}
        schoolCode={schoolCode}
        classTeachers={classTeachers}
        displayMode={displayMode}
        teacherMapping={teacherMapping}
      />
    </div>
  );
};
