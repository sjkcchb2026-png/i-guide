import React, { useState } from 'react';
import { 
  DayOfWeek, 
  DAYS_OF_WEEK, 
  ScheduleGrid, 
  SlotTimeInfo, 
  TimetableCell, 
  TimetableClash, 
  getGradeDaySlots 
} from './types';
import { SubjectAllocationRow } from './SchoolTimetableMatrix';
import { 
  Sparkles, 
  AlertTriangle, 
  CheckCircle2, 
  Trash2, 
  Edit3, 
  Layers
} from 'lucide-react';

interface JKeyinGridProps {
  schedule: ScheduleGrid;
  onUpdateSchedule: (newSchedule: ScheduleGrid) => void;
  onAutoSchedule: () => void;
  clashes: TimetableClash[];
  matrixData: SubjectAllocationRow[];
  teacherMapping: { list: Array<{ id: string; num: number; code: string; name: string }> };
  displayMode: 'NUMBER' | 'CODE';
  classTeachers: Record<number, string>;
  academicYear: string;
}

export const JKeyinGrid: React.FC<JKeyinGridProps> = ({
  schedule,
  onUpdateSchedule,
  onAutoSchedule,
  clashes,
  matrixData,
  teacherMapping,
  displayMode,
  classTeachers,
  academicYear,
}) => {
  const [selectedGrade, setSelectedGrade] = useState<number>(1);
  const [editingCell, setEditingCell] = useState<{
    day: DayOfWeek;
    slotId: string;
    current?: TimetableCell | null;
  } | null>(null);

  const [editSubjectCode, setEditSubjectCode] = useState<string>('');
  const [editTeacherCode, setEditTeacherCode] = useState<string>('');

  const isKP = (g: number) => {
    const yr = parseInt(academicYear, 10) || 2027;
    if (yr < 2027) return false;
    return g <= yr - 2026;
  };

  const handleOpenEdit = (day: DayOfWeek, slot: SlotTimeInfo) => {
    if (slot.isRecess) return;
    const current = schedule[selectedGrade]?.[day]?.[slot.slotId];
    setEditingCell({ day, slotId: slot.slotId, current });
    setEditSubjectCode(current?.subjectCode || '');
    setEditTeacherCode(current?.teacherCode || '');
  };

  const handleSaveCell = () => {
    if (!editingCell) return;
    const { day, slotId } = editingCell;

    const matchedRow = matrixData.find((r) => r.subjectCode === editSubjectCode);
    const newCell: TimetableCell | null = editSubjectCode
      ? {
          subjectId: matchedRow?.id || editSubjectCode.toLowerCase(),
          subjectCode: editSubjectCode,
          subjectName: matchedRow?.subjectName || editSubjectCode,
          teacherCode: editTeacherCode,
          periodLength: slotId === 'PKAR' ? 0.5 : 1,
        }
      : null;

    const newGrid: ScheduleGrid = JSON.parse(JSON.stringify(schedule));
    if (!newGrid[selectedGrade]) newGrid[selectedGrade] = {} as any;
    if (!newGrid[selectedGrade][day]) newGrid[selectedGrade][day] = {};
    newGrid[selectedGrade][day][slotId] = newCell;

    onUpdateSchedule(newGrid);
    setEditingCell(null);
  };

  const handleClearCell = () => {
    if (!editingCell) return;
    const { day, slotId } = editingCell;
    const newGrid: ScheduleGrid = JSON.parse(JSON.stringify(schedule));
    if (newGrid[selectedGrade]?.[day]) {
      newGrid[selectedGrade][day][slotId] = null;
    }
    onUpdateSchedule(newGrid);
    setEditingCell(null);
  };

  // Filter clashes that affect currently viewed grade
  const gradeClashes = clashes.filter(
    (c) => c.gradeA === selectedGrade || c.gradeB === selectedGrade
  );

  return (
    <div className="space-y-6">
      {/* Control Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30">
              Jadual Interaktif
            </span>
            <span className="text-xs text-slate-400">JKEYIN Grid Penjadualan Sekolah</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white mt-1 flex items-center gap-2">
            Penyuntingan Jadual Kelas (Tahun {selectedGrade})
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Guru Kelas: <strong className="text-white">{classTeachers[selectedGrade] || 'Belum Ditetapkan'}</strong> ·{' '}
            Format Kurikulum: <strong className={isKP(selectedGrade) ? 'text-emerald-400' : 'text-amber-300'}>
              {isKP(selectedGrade) ? 'KP2027 (Dual-Bell 07:30)' : 'KSSR SEMAKAN (Dual-Bell 07:15)'}
            </strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Grade Selector Tabs */}
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
                T.{g}
              </button>
            ))}
          </div>

          {/* Auto Scheduler Trigger */}
          <button
            onClick={onAutoSchedule}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-indigo-600/30 cursor-pointer"
            title="Jana penempatan jadual automatik berasaskan agihan subjek & elak pertembungan"
          >
            <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
            <span>Jana Jadual Automatik</span>
          </button>
        </div>
      </div>

      {/* Clashes Warning Notice */}
      {gradeClashes.length > 0 && (
        <div className="bg-rose-950/80 border border-rose-700/80 rounded-2xl p-4 text-xs space-y-2">
          <div className="flex items-center gap-2 text-rose-300 font-black uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>Pertembungan Guru Dikesan Pada Tahun {selectedGrade} ({gradeClashes.length} kes)</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-rose-200 font-mono text-[11px]">
            {gradeClashes.map((c, idx) => (
              <li key={idx}>{c.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Interactive Timetable Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl overflow-x-auto">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
          <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            <span>Matriks Waktu Mengajar Mingguan (Tahun {selectedGrade})</span>
          </h3>
          <span className="text-[11px] text-slate-400">
            * Klik mana-mana petak untuk mengubah subjek atau guru secara manual
          </span>
        </div>

        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-950 text-slate-300 font-black text-[11px] uppercase border-b border-slate-800 text-center">
              <th className="py-3 px-3 text-left w-24">Hari</th>
              {getGradeDaySlots(selectedGrade, 'ISNIN').map((s) => (
                <th
                  key={s.slotId}
                  className={`py-2 px-1 border-l border-slate-800 ${
                    s.isRecess ? 'bg-amber-950/40 text-amber-300' : s.slotId === 'PKAR' ? 'bg-emerald-950/40 text-emerald-300' : ''
                  }`}
                >
                  <div className="font-bold text-slate-300">{s.label}</div>
                  <div className="text-[9px] font-mono text-slate-500 font-normal">
                    {s.startTime}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 font-mono">
            {DAYS_OF_WEEK.map((day) => {
              const daySlots = getGradeDaySlots(selectedGrade, day);
              return (
                <tr key={day} className="hover:bg-slate-800/30 transition">
                  <td className="py-3 px-3 font-sans font-black text-white bg-slate-950/70 border-r border-slate-800">
                    {day}
                  </td>
                  {daySlots.map((slot) => {
                    if (slot.isRecess) {
                      return (
                        <td
                          key={slot.slotId}
                          className="py-2 px-1 text-center bg-amber-950/20 text-amber-400/80 font-bold text-[10px] border-l border-slate-800 select-none"
                        >
                          REHAT
                        </td>
                      );
                    }

                    const cell = schedule[selectedGrade]?.[day]?.[slot.slotId];
                    const isLocked = slot.isSpecialLocked || (day === 'ISNIN' && slot.slotId === 'W1');
                    
                    // Check if this slot has a clash
                    const hasClash = clashes.some(
                      (c) =>
                        (c.gradeA === selectedGrade && c.day === day && c.slotA === slot.slotId) ||
                        (c.gradeB === selectedGrade && c.day === day && c.slotB === slot.slotId)
                    );

                    const teacherLabel = cell?.teacherCode
                      ? displayMode === 'CODE'
                        ? cell.teacherCode
                        : teacherMapping.list.find((t) => t.code === cell.teacherCode)?.num || cell.teacherCode
                      : '-';

                    return (
                      <td
                        key={slot.slotId}
                        onClick={() => handleOpenEdit(day, slot)}
                        className={`py-2 px-1 text-center border-l border-slate-800/80 transition cursor-pointer relative group ${
                          hasClash
                            ? 'bg-rose-950/70 ring-2 ring-rose-500'
                            : cell
                            ? isLocked
                              ? 'bg-blue-950/50'
                              : 'bg-slate-800/60 hover:bg-slate-700/60'
                            : 'hover:bg-slate-800/30'
                        }`}
                      >
                        {cell ? (
                          <div className="space-y-0.5">
                            <div className="font-sans font-black text-xs text-white">
                              {cell.subjectCode}
                            </div>
                            <div className="text-[10px] font-bold text-blue-300">
                              {teacherLabel}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-600 text-xs">-</span>
                        )}

                        <div className="opacity-0 group-hover:opacity-100 absolute top-1 right-1 text-slate-400">
                          <Edit3 className="w-2.5 h-2.5" />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Edit Cell Modal */}
      {editingCell && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-black text-white uppercase tracking-wider">
                Sunting Petak Jadual (T.{selectedGrade} · {editingCell.day} · {editingCell.slotId})
              </h3>
              <button
                onClick={() => setEditingCell(null)}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                Tutup
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-bold mb-1 uppercase text-[10px]">
                  Mata Pelajaran:
                </label>
                <select
                  value={editSubjectCode}
                  onChange={(e) => setEditSubjectCode(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold outline-none focus:border-blue-500"
                >
                  <option value="">-- Kosong / Tiada Subjek --</option>
                  {matrixData.map((r) => (
                    <option key={r.id} value={r.subjectCode}>
                      {r.subjectCode} - {r.subjectName} ({r.periods[selectedGrade] || 0} waktu)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1 uppercase text-[10px]">
                  Guru Mengajar:
                </label>
                <select
                  value={editTeacherCode}
                  onChange={(e) => setEditTeacherCode(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold outline-none focus:border-blue-500"
                >
                  <option value="">-- Kosongkan Guru --</option>
                  {teacherMapping.list.map((t) => (
                    <option key={t.id} value={t.code}>
                      [{t.num}] {t.code} - {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800 gap-2">
              <button
                onClick={handleClearCell}
                className="flex items-center gap-1.5 px-3 py-2 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded-xl text-xs font-bold transition"
              >
                <Trash2 className="w-3.5 h-3.5" /> Padam Petak
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditingCell(null)}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
                >
                  Batal
                </button>
                <button
                  onClick={handleSaveCell}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase transition"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Simpan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
