import React, { useState } from 'react';
import { 
  DayOfWeek, 
  DAYS_OF_WEEK, 
  ScheduleGrid, 
  getGradeDaySlots 
} from './types';
import { Printer, Layout, RotateCw } from 'lucide-react';

interface JUtamaViewProps {
  schedule: ScheduleGrid;
  academicYear: string;
  schoolName?: string;
  schoolCode?: string;
  classTeachers: Record<number, string>;
  displayMode: 'NUMBER' | 'CODE';
  teacherMapping: { list: Array<{ id: string; num: number; code: string; name: string }> };
  initialOrientation?: 'PORTRAIT' | 'LANDSCAPE';
}

export const JUtamaView: React.FC<JUtamaViewProps> = ({
  schedule,
  academicYear,
  schoolName = 'SJK (C) CHUNG HUA BALINGIAN',
  schoolCode = 'YCC3404',
  classTeachers,
  displayMode,
  teacherMapping,
  initialOrientation = 'LANDSCAPE',
}) => {
  const [orientation, setOrientation] = useState<'PORTRAIT' | 'LANDSCAPE'>(initialOrientation);

  const handlePrint = () => {
    window.print();
  };

  const getTeacherLabel = (code: string) => {
    if (!code) return '';
    if (code.includes('/')) {
      return code
        .split('/')
        .map((c) => {
          const trimmed = c.trim();
          if (displayMode === 'CODE') return trimmed;
          const found = teacherMapping.list.find((t) => t.code === trimmed);
          return found ? String(found.num) : trimmed;
        })
        .join(' / ');
    }
    if (displayMode === 'CODE') return code;
    const found = teacherMapping.list.find((t) => t.code === code);
    return found ? String(found.num) : code;
  };

  return (
    <div className="space-y-6">
      {/* Print & View Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
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

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setOrientation(orientation === 'LANDSCAPE' ? 'PORTRAIT' : 'LANDSCAPE')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 transition cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5 text-blue-400" />
            <span>Tukar Orientasi ({orientation === 'LANDSCAPE' ? 'Landskap' : 'Potret'})</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-blue-600/30 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak Jadual Induk</span>
          </button>
        </div>
      </div>

      {/* Printable Master Timetable Document */}
      <div className="bg-white text-slate-900 rounded-3xl p-8 border border-slate-200 shadow-xl print:p-0 print:border-none print:shadow-none print:rounded-none">
        {/* Document Header */}
        <div className="text-center pb-6 border-b-2 border-slate-900 mb-6 space-y-1">
          <div className="text-[11px] font-black tracking-widest uppercase text-slate-500">
            KEMENTERIAN PENDIDIKAN MALAYSIA
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 uppercase">
            {schoolName} ({schoolCode})
          </h1>
          <h2 className="text-sm sm:text-base font-bold text-slate-700 uppercase tracking-wide">
            JADUAL WAKTU INDUK PERSEKOLAHAN — SESI AKADEMIK {academicYear}
          </h2>
          <p className="text-[10px] text-slate-500 italic">
            Kurikulum Dwi-Laluan: Tahun 1 (KP2027 · 46.5 Waktu) & Tahun 2–6 (KSSR Semakan · 50 Waktu) · Waktu Rehat: 09:45–10:15
          </p>
        </div>

        {/* Master Table per Day */}
        <div className="space-y-6">
          {DAYS_OF_WEEK.map((day) => (
            <div key={day} className="space-y-2 break-inside-avoid">
              <div className="flex items-center justify-between bg-slate-100 px-4 py-2 rounded-xl border border-slate-300">
                <span className="font-black text-xs text-slate-900 tracking-wider uppercase">
                  HARI: {day}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {day === 'JUMAAT' ? 'Waktu Tamat: 12:15' : 'Waktu Tamat: 12:45 / 13:15'}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px] border-collapse border border-slate-400">
                  <thead>
                    <tr className="bg-slate-200 text-slate-800 font-black text-center border-b border-slate-400">
                      <th className="p-2 border border-slate-400 w-24">Kelas</th>
                      <th className="p-2 border border-slate-400 w-32">Guru Kelas</th>
                      {/* Common Slot Columns: W1 to W11 */}
                      {['W1', 'W2', 'W3', 'W4', 'W5', 'REHAT', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11'].map((slot) => {
                        if (day === 'JUMAAT' && ['W9', 'W10', 'W11'].includes(slot)) return null;
                        if (['RABU', 'KHAMIS'].includes(day) && slot === 'W11') return null;
                        return (
                          <th
                            key={slot}
                            className={`p-1.5 border border-slate-400 text-center ${
                              slot === 'REHAT' ? 'bg-amber-100 text-amber-900 w-16' : 'w-20'
                            }`}
                          >
                            <div className="text-[10px] font-bold">{slot}</div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300 text-center font-mono">
                    {[1, 2, 3, 4, 5, 6].map((grade) => {
                      const classTeacher = classTeachers[grade] || '-';
                      const slots = getGradeDaySlots(grade, day);

                      return (
                        <tr key={grade} className="hover:bg-slate-50 transition">
                          <td className="p-2 border border-slate-400 font-sans font-black text-slate-900 bg-slate-50 text-left">
                            Tahun {grade}
                          </td>
                          <td className="p-2 border border-slate-400 font-sans text-xs text-slate-600 truncate text-left max-w-[120px]" title={classTeacher}>
                            {classTeacher}
                          </td>

                          {/* Render cells corresponding to master slot structure */}
                          {['W1', 'W2', 'W3', 'W4', 'W5', 'REHAT', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11'].map((slotKey) => {
                            if (day === 'JUMAAT' && ['W9', 'W10', 'W11'].includes(slotKey)) return null;
                            if (['RABU', 'KHAMIS'].includes(day) && slotKey === 'W11') return null;

                            if (slotKey === 'REHAT') {
                              return (
                                <td
                                  key={slotKey}
                                  className="p-1 border border-slate-400 bg-amber-50 text-amber-800 font-bold text-[9px]"
                                >
                                  REHAT
                                </td>
                              );
                            }

                            // For T1, map specific slot if appropriate (PKAR is 09:30-09:45)
                            let cell = schedule[grade]?.[day]?.[slotKey];

                            // T1 doesn't have W5 in morning; its morning has W1-W4 + PKAR
                            if (grade === 1 && slotKey === 'W5') {
                              cell = schedule[grade]?.[day]?.['PKAR'];
                            }

                            return (
                              <td
                                key={slotKey}
                                className={`p-1 border border-slate-400 text-center ${
                                  cell ? 'bg-blue-50/50' : ''
                                }`}
                              >
                                {cell ? (
                                  <div>
                                    <div className="font-black text-slate-900 text-xs font-sans">
                                      {cell.subjectCode}
                                    </div>
                                    {cell.subjectCode !== 'PN' && (
                                      <div className="text-[10px] text-blue-700 font-bold">
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
          ))}
        </div>

        {/* Footer Sign-off */}
        <div className="pt-8 mt-8 border-t border-slate-300 grid grid-cols-2 text-xs text-slate-600 font-sans">
          <div>
            <p>Disediakan oleh:</p>
            <p className="mt-8 font-bold text-slate-900 uppercase">Jawatankuasa Jadual Waktu Sekolah</p>
          </div>
          <div className="text-right">
            <p>Disahkan oleh:</p>
            <p className="mt-8 font-bold text-slate-900 uppercase">Guru Besar / Pentadbir Sekolah</p>
          </div>
        </div>
      </div>
    </div>
  );
};
