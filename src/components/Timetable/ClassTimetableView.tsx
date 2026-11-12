import React, { useState } from 'react';
import { 
  DayOfWeek, 
  DAYS_OF_WEEK, 
  ScheduleGrid, 
  getGradeDaySlots 
} from './types';
import { SubjectAllocationRow } from './SchoolTimetableMatrix';
import { Printer, GraduationCap, Clock, Award } from 'lucide-react';

interface ClassTimetableViewProps {
  schedule: ScheduleGrid;
  academicYear: string;
  schoolName?: string;
  schoolCode?: string;
  classTeachers: Record<number, string>;
  matrixData: SubjectAllocationRow[];
  displayMode: 'NUMBER' | 'CODE';
  teacherMapping: { list: Array<{ id: string; num: number; code: string; name: string }> };
  onUpdateSchedule?: (newSchedule: ScheduleGrid) => void;
}

export const ClassTimetableView: React.FC<ClassTimetableViewProps> = ({
  schedule,
  academicYear,
  schoolName = 'SJK (C) CHUNG HUA BALINGIAN',
  schoolCode = 'YCC3404',
  classTeachers,
  matrixData,
  displayMode,
  teacherMapping,
  onUpdateSchedule,
}) => {
  const [selectedGrade, setSelectedGrade] = useState<number>(1);

  const isKP = selectedGrade === 1 && parseInt(academicYear, 10) >= 2027;
  const currentClassTeacher = classTeachers[selectedGrade] || 'Belum Ditetapkan';

  const getTeacherDisplay = (code: string) => {
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

  const getTeacherFullName = (code: string) => {
    if (!code) return '';
    if (code.includes('/')) {
      return code
        .split('/')
        .map((c) => {
          const trimmed = c.trim();
          const found = teacherMapping.list.find((t) => t.code === trimmed);
          return found ? found.name : trimmed;
        })
        .join(' / ');
    }
    const found = teacherMapping.list.find((t) => t.code === code);
    return found ? found.name : code;
  };

  return (
    <div className="space-y-6">
      {/* Control Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30">
              Jadual Kelas
            </span>
            <span className="text-xs text-slate-400">JT1 – JT6 Lembaran Jadual Waktu Kelas</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white mt-1 flex items-center gap-2">
            Jadual Waktu Kelas: Tahun {selectedGrade} (JT{selectedGrade})
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Guru Kelas: <strong className="text-white">{currentClassTeacher}</strong> · Format:{' '}
            <strong className={isKP ? 'text-emerald-400' : 'text-amber-300'}>
              {isKP ? 'KP2027 (46.5 Waktu)' : 'KSSR Semakan (50 Waktu)'}
            </strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800">
            {[1, 2, 3, 4, 5, 6].map((g) => (
              <button
                key={g}
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
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-blue-600/30 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak Jadual JT{selectedGrade}</span>
          </button>
        </div>
      </div>

      {/* Printable Class Timetable Sheet */}
      <div className="bg-white text-slate-900 rounded-3xl p-8 border border-slate-200 shadow-xl print:p-0 print:border-none print:shadow-none print:rounded-none">
        {/* Header */}
        <div className="text-center pb-5 border-b-2 border-slate-900 mb-6 space-y-1">
          <div className="text-[10px] font-black tracking-widest uppercase text-slate-500">
            KEMENTERIAN PENDIDIKAN MALAYSIA
          </div>
          <h1 className="text-2xl font-black text-slate-900 uppercase">
            {schoolName} ({schoolCode})
          </h1>
          <h2 className="text-base font-bold text-slate-800 uppercase">
            JADUAL WAKTU KELAS: TAHUN {selectedGrade} · SESI AKADEMIK {academicYear}
          </h2>
          <div className="flex justify-center items-center gap-4 text-xs font-semibold text-slate-600 pt-1">
            <span>Guru Kelas: <strong className="text-slate-900 uppercase">{currentClassTeacher}</strong></span>
            <span>·</span>
            <span>Kurikulum: <strong className="text-slate-900">{isKP ? 'KP2027 (46.5 Waktu)' : 'KSSR Semakan (50 Waktu)'}</strong></span>
          </div>
        </div>

        {/* Timetable Grid */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse border border-slate-400">
            <thead>
              <tr className="bg-slate-100 text-slate-800 font-black text-center border-b border-slate-400">
                <th className="p-3 border border-slate-400 w-24">Hari / Waktu</th>
                {getGradeDaySlots(selectedGrade, 'ISNIN').map((s) => (
                  <th
                    key={s.slotId}
                    className={`p-2 border border-slate-400 ${
                      s.isRecess ? 'bg-amber-100 text-amber-900 w-20' : 'w-24'
                    }`}
                  >
                    <div className="font-bold text-xs">{s.label}</div>
                    <div className="text-[9px] font-mono text-slate-500 font-normal">
                      {s.startTime}–{s.endTime}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300 font-mono text-center">
              {DAYS_OF_WEEK.map((day) => {
                const daySlots = getGradeDaySlots(selectedGrade, day);
                return (
                  <tr key={day} className="hover:bg-slate-50 transition">
                    <td className="p-3 border border-slate-400 font-sans font-black text-slate-900 bg-slate-50 text-left">
                      {day}
                    </td>
                    {daySlots.map((slot) => {
                      if (slot.isRecess) {
                        return (
                          <td
                            key={slot.slotId}
                            className="p-2 border border-slate-400 bg-amber-50 text-amber-800 font-bold text-[10px]"
                          >
                            REHAT
                          </td>
                        );
                      }

                      const cell = schedule[selectedGrade]?.[day]?.[slot.slotId];
                      const isBmOrMt = cell && (cell.subjectCode.toUpperCase() === 'BM' || cell.subjectCode.toUpperCase() === 'MT');

                      const handleCellClick = () => {
                        if (isBmOrMt && onUpdateSchedule) {
                          const newSchedule = JSON.parse(JSON.stringify(schedule)) as ScheduleGrid;
                          const target = newSchedule[selectedGrade]?.[day]?.[slot.slotId];
                          if (target) {
                            target.isPemulihan = !target.isPemulihan;
                            onUpdateSchedule(newSchedule);
                          }
                        }
                      };

                      return (
                        <td
                          key={slot.slotId}
                          onClick={handleCellClick}
                          title={isBmOrMt ? 'Klik untuk aktifkan / nyahaktifkan lampiran Pemulihan Khas (PBM / PMT)' : undefined}
                          className={`p-2 border border-slate-400 transition ${
                            cell ? (cell.isPemulihan ? 'bg-emerald-50/80 ring-2 ring-emerald-500/50' : 'bg-blue-50/60') : ''
                          } ${isBmOrMt ? 'cursor-pointer hover:bg-emerald-100/60' : ''}`}
                        >
                          {cell ? (
                            <div className="space-y-0.5">
                              <div className="font-sans font-black text-sm text-slate-900 flex items-center justify-center gap-1">
                                {cell.subjectCode}
                                {cell.isCoTeaching && (
                                  <span className="text-[9px] text-purple-600 font-bold">(Co)</span>
                                )}
                              </div>
                              {cell.subjectCode !== 'PN' && (
                                <div className="text-[10px] font-bold text-blue-700">
                                  {getTeacherDisplay(cell.teacherCode)}
                                </div>
                              )}
                              {cell.isPemulihan && (
                                <div className="pt-0.5">
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-emerald-600 text-white shadow-xs">
                                    {cell.subjectCode === 'BM' ? 'PBM' : 'PMT'} PEMULIHAN
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

        {/* Legend of Subjects & Teachers in this Class */}
        <div className="mt-6 pt-6 border-t border-slate-200">
          <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider mb-3">
            Senarai Guru Mata Pelajaran (Tahun {selectedGrade}):
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs">
            {matrixData
              .filter((r) => (r.periods[selectedGrade] || 0) > 0)
              .map((r) => {
                const tCode = r.teachers[selectedGrade] || '';
                const secCode = r.secondaryTeachers?.[selectedGrade] || '';
                const combinedCode = secCode ? `${tCode} / ${secCode}` : tCode;
                return (
                  <div key={r.id} className="p-2 bg-slate-50 rounded-xl border border-slate-200 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 font-sans">
                        {r.subjectCode} {secCode && <span className="text-[9px] text-purple-600 font-bold">(Co-Teaching)</span>}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">{r.periods[selectedGrade]}w</span>
                    </div>
                    <div className="text-[11px] text-blue-700 font-semibold truncate mt-1" title={getTeacherFullName(combinedCode)}>
                      {combinedCode ? `${getTeacherDisplay(combinedCode)} - ${getTeacherFullName(combinedCode)}` : '(Belum Ditugaskan)'}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Signatures */}
        <div className="pt-8 mt-8 border-t border-slate-300 grid grid-cols-2 text-xs text-slate-600 font-sans">
          <div>
            <p>Disediakan oleh:</p>
            <p className="mt-8 font-bold text-slate-900 uppercase">
              {currentClassTeacher !== 'Belum Ditetapkan' ? currentClassTeacher : 'Guru Kelas'}
            </p>
            <p className="text-[10px] text-slate-500">Guru Kelas Tahun {selectedGrade}</p>
          </div>
          <div className="text-right">
            <p>Disahkan oleh:</p>
            <p className="mt-8 font-bold text-slate-900 uppercase">Guru Besar</p>
            <p className="text-[10px] text-slate-500">{schoolName}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
