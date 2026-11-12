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
import { autoPairPKARInGrid } from './autoScheduler';
import { 
  Sparkles, 
  AlertTriangle, 
  CheckCircle2, 
  Trash2, 
  Edit3, 
  Layers,
  Calendar,
  Table as TableIcon
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
  onYearChange?: (year: string) => void;
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
  onYearChange,
}) => {
  const [selectedGrade, setSelectedGrade] = useState<number | 'ALL'>('ALL');
  const [activeDayFilter, setActiveDayFilter] = useState<DayOfWeek | 'ALL'>('ALL');
  const [isScheduling, setIsScheduling] = useState(false);

  const [editingCell, setEditingCell] = useState<{
    grade: number;
    day: DayOfWeek;
    slotId: string;
    current?: TimetableCell | null;
  } | null>(null);

  const [editSubjectCode, setEditSubjectCode] = useState<string>('');
  const [editTeacherCode, setEditTeacherCode] = useState<string>('');
  const [editIsPemulihan, setEditIsPemulihan] = useState<boolean>(false);

  const isKP = (g: number) => {
    const yr = parseInt(academicYear, 10) || 2027;
    if (yr < 2027) return false;
    return g <= yr - 2026;
  };

  const handleOpenEdit = (grade: number, day: DayOfWeek, slotId: string) => {
    if (slotId === 'REHAT') return;
    const current = schedule[grade]?.[day]?.[slotId];
    setEditingCell({ grade, day, slotId, current });
    setEditSubjectCode(current?.subjectCode || '');
    setEditTeacherCode(current?.teacherCode || '');
    setEditIsPemulihan(current?.isPemulihan || false);
  };

  const handleSaveCell = () => {
    if (!editingCell) return;
    const { grade, day, slotId } = editingCell;

    const matchedRow = matrixData.find((r) => r.subjectCode === editSubjectCode);
    const isBmOrMt = editSubjectCode === 'BM' || editSubjectCode === 'MT';
    const newCell: TimetableCell | null = editSubjectCode
      ? {
          subjectId: matchedRow?.id || editSubjectCode.toLowerCase(),
          subjectCode: editSubjectCode,
          subjectName: matchedRow?.subjectName || editSubjectCode,
          teacherCode: editTeacherCode,
          periodLength: slotId === 'PKAR' ? 0.5 : 1,
          isPemulihan: isBmOrMt ? editIsPemulihan : false,
        }
      : null;

    const newGrid: ScheduleGrid = JSON.parse(JSON.stringify(schedule));
    if (!newGrid[grade]) newGrid[grade] = {} as any;
    if (!newGrid[grade][day]) newGrid[grade][day] = {};
    newGrid[grade][day][slotId] = newCell;

    // Dynamically update/re-pair PKAR with pre-recess teacher
    autoPairPKARInGrid(newGrid);

    onUpdateSchedule(newGrid);
    setEditingCell(null);
  };

  const handleClearCell = () => {
    if (!editingCell) return;
    const { grade, day, slotId } = editingCell;
    const newGrid: ScheduleGrid = JSON.parse(JSON.stringify(schedule));
    if (newGrid[grade]?.[day]) {
      newGrid[grade][day][slotId] = null;
    }
    // Dynamically update/re-pair PKAR with pre-recess teacher
    autoPairPKARInGrid(newGrid);

    onUpdateSchedule(newGrid);
    setEditingCell(null);
  };

  const handleTriggerAutoSchedule = () => {
    setIsScheduling(true);
    setTimeout(() => {
      try {
        onAutoSchedule();
      } finally {
        setIsScheduling(false);
      }
    }, 150);
  };

  // Helper to format teacher code/number label
  const getTeacherLabel = (teacherCode?: string) => {
    if (!teacherCode) return '-';
    if (teacherCode.includes('/')) {
      return teacherCode
        .split('/')
        .map((c) => {
          const trimmed = c.trim();
          if (displayMode === 'CODE') return trimmed;
          const found = teacherMapping.list.find((t) => t.code === trimmed);
          return found ? String(found.num) : trimmed;
        })
        .join(' / ');
    }
    if (displayMode === 'CODE') return teacherCode;
    const found = teacherMapping.list.find((t) => t.code === teacherCode);
    return found ? String(found.num) : teacherCode;
  };

  // Filter clashes that affect currently viewed grade
  const filteredClashes = selectedGrade === 'ALL'
    ? clashes
    : clashes.filter((c) => c.gradeA === selectedGrade || c.gradeB === selectedGrade);

  // Common slots for 1-to-6 Master Table
  // Mon/Tue: 11 teaching periods (W1-W5, PKAR, REHAT, W6-W11, TASMIK)
  // Wed/Thu: 10 teaching periods (W1-W5, PKAR, REHAT, W6-W10, TASMIK)
  // Friday: 7 teaching periods (T1-T3) / 8 teaching periods (T4-T6)
  const getMasterSlotHeaders = (day: DayOfWeek) => {
    if (day === 'JUMAAT') {
      return ['MEMBACA', 'W1', 'W2', 'W3', 'W4', 'W5', 'PKAR', 'REHAT', 'W6', 'W7', 'W8', 'TASMIK'];
    }
    if (day === 'ISNIN' || day === 'SELASA') {
      return ['MEMBACA', 'W1', 'W2', 'W3', 'W4', 'W5', 'PKAR', 'REHAT', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11', 'TASMIK'];
    }
    // RABU, KHAMIS
    return ['MEMBACA', 'W1', 'W2', 'W3', 'W4', 'W5', 'PKAR', 'REHAT', 'W6', 'W7', 'W8', 'W9', 'W10', 'TASMIK'];
  };

  const daysToDisplay = activeDayFilter === 'ALL' ? DAYS_OF_WEEK : [activeDayFilter];

  return (
    <div className="space-y-6">
      {/* Control Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30">
              {selectedGrade === 'ALL' ? 'Jadual Induk T1–T6' : `Jadual Kelas Tahun ${selectedGrade}`}
            </span>
            <span className="text-xs text-slate-400">JKEYIN Grid Penjadualan Sekolah</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white mt-1 flex items-center gap-2">
            {selectedGrade === 'ALL'
              ? 'Jadual Induk Keseluruhan (Tahun 1 – Tahun 6)'
              : `Penyuntingan Jadual Kelas (Tahun ${selectedGrade})`}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {selectedGrade === 'ALL' ? (
              <>
                Paparan matriks penjadualan serentak untuk semua kelas mengikut hari ·{' '}
                <strong className="text-emerald-400">Sesi Akademik {academicYear}</strong>
              </>
            ) : (
              <>
                Guru Kelas: <strong className="text-white">{classTeachers[selectedGrade] || 'Belum Ditetapkan'}</strong> ·{' '}
                Format Kurikulum: <strong className={isKP(selectedGrade) ? 'text-emerald-400' : 'text-amber-300'}>
                  {isKP(selectedGrade) ? 'KP2027 (Dual-Bell 07:30)' : 'KSSR SEMAKAN (Dual-Bell 07:15)'}
                </strong>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Academic Year Selector */}
          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-2xl border border-slate-800">
            <Calendar className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[11px] font-bold text-slate-400">Sesi:</span>
            <select
              value={academicYear}
              onChange={(e) => onYearChange?.(e.target.value)}
              className="bg-transparent text-white font-black text-xs outline-none cursor-pointer"
            >
              <option value="2026" className="bg-slate-900 text-white">2026 / 2027</option>
              <option value="2027" className="bg-slate-900 text-white">2027 / 2028</option>
              <option value="2028" className="bg-slate-900 text-white">2028 / 2029</option>
              <option value="2029" className="bg-slate-900 text-white">2029 / 2030</option>
            </select>
          </div>

          {/* Grade Selector Tabs including Master 1-to-6 Table */}
          <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800">
            <button
              onClick={() => setSelectedGrade('ALL')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                selectedGrade === 'ALL'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Paparan Jadual Induk Semua Tahun 1 Hingga 6"
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>T1–T6 (Jadual Induk)</span>
            </button>

            {[1, 2, 3, 4, 5, 6].map((g) => (
              <button
                key={g}
                onClick={() => setSelectedGrade(g)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
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
            onClick={handleTriggerAutoSchedule}
            disabled={isScheduling}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-indigo-600/30 cursor-pointer"
            title="Jana penempatan jadual automatik berasaskan agihan subjek & elak pertembungan"
          >
            <Sparkles className={`w-4 h-4 text-amber-300 ${isScheduling ? 'animate-spin' : 'animate-pulse'}`} />
            <span>{isScheduling ? 'Menjana Jadual...' : 'Jana Jadual Automatik'}</span>
          </button>
        </div>
      </div>

      {/* Clashes Warning Notice */}
      {filteredClashes.length > 0 && (
        <div className="bg-rose-950/80 border border-rose-700/80 rounded-2xl p-4 text-xs space-y-2">
          <div className="flex items-center gap-2 text-rose-300 font-black uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>
              Pertembungan Guru Dikesan {selectedGrade === 'ALL' ? '(Semua Kelas)' : `Pada Tahun ${selectedGrade}`} ({filteredClashes.length} kes)
            </span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-rose-200 font-mono text-[11px]">
            {filteredClashes.map((c, idx) => (
              <li key={idx}>{c.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. MASTER 1-TO-6 TIMETABLE VIEW (Jadual Induk T1–T6)                     */}
      {/* ========================================================================= */}
      {selectedGrade === 'ALL' ? (
        <div className="space-y-6">
          {/* Day Navigation Tabs for Master Table */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-300 uppercase tracking-wider">Pilih Hari:</span>
              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setActiveDayFilter('ALL')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    activeDayFilter === 'ALL'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Semua Hari
                </button>
                {DAYS_OF_WEEK.map((d) => (
                  <button
                    key={d}
                    onClick={() => setActiveDayFilter(d)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      activeDayFilter === d
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <span className="text-[11px] text-slate-400">
              * Klik mana-mana petak untuk menyunting subjek atau guru kelas secara langsung
            </span>
          </div>

          {/* Master Table per Day */}
          {daysToDisplay.map((day) => {
            const masterSlots = getMasterSlotHeaders(day);
            return (
              <div key={day} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl overflow-x-auto space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-xl font-black text-xs uppercase tracking-wider">
                      HARI: {day}
                    </span>
                    <span className="text-xs text-slate-400">
                      {day === 'JUMAAT' ? 'Waktu Tamat: 12:15' : 'Waktu Tamat: 12:45 (T1) / 13:15 (T2–T6)'}
                    </span>
                  </div>
                </div>

                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950 text-slate-300 font-black text-[11px] uppercase border-b border-slate-800 text-center">
                      <th className="py-2.5 px-3 text-left w-28">Kelas</th>
                      <th className="py-2.5 px-3 text-left w-36">Guru Kelas</th>
                      {masterSlots.map((slotKey) => (
                        <th
                          key={slotKey}
                          className={`py-2 px-1 border-l border-slate-800 ${
                            slotKey === 'REHAT' ? 'bg-amber-950/40 text-amber-300 w-16' : 'w-20'
                          }`}
                        >
                          <div className="font-bold text-slate-300">{slotKey}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    {[1, 2, 3, 4, 5, 6].map((grade) => {
                      const classTeacher = classTeachers[grade] || 'Belum Ditetapkan';
                      return (
                        <tr key={grade} className="hover:bg-slate-800/30 transition">
                          <td className="py-2.5 px-3 font-sans font-black text-white bg-slate-950/70 border-r border-slate-800">
                            <div className="flex items-center gap-1.5">
                              <span>Tahun {grade}</span>
                              <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                                isKP(grade) ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-slate-800 text-slate-400'
                              }`}>
                                {isKP(grade) ? 'KP' : 'KSSR'}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-sans text-xs text-slate-300 border-r border-slate-800 truncate max-w-[140px]" title={classTeacher}>
                            {classTeacher}
                          </td>

                          {masterSlots.map((slotKey) => {
                            if (slotKey === 'REHAT') {
                              return (
                                <td
                                  key={slotKey}
                                  className="py-2 px-1 text-center bg-amber-950/20 text-amber-400/80 font-bold text-[10px] border-l border-slate-800 select-none"
                                >
                                  REHAT
                                </td>
                              );
                            }

                            // For Grade 2-6: MEMBACA does not apply
                            if (slotKey === 'MEMBACA' && grade !== 1) {
                              return (
                                <td
                                  key={slotKey}
                                  className="py-2 px-1 text-center bg-slate-950/40 text-slate-700 font-bold text-[10px] border-l border-slate-800 select-none"
                                >
                                  -
                                </td>
                              );
                            }

                            // On Friday: W8 only applies to Upper Primary (Grade 4-6)
                            if (day === 'JUMAAT' && slotKey === 'W8' && grade < 4) {
                              return (
                                <td
                                  key={slotKey}
                                  className="py-2 px-1 text-center bg-slate-950/40 text-slate-700 font-bold text-[10px] border-l border-slate-800 select-none"
                                >
                                  -
                                </td>
                              );
                            }

                            const targetSlotId = slotKey;
                            const cell = schedule[grade]?.[day]?.[targetSlotId];

                            // Check collision
                            const hasClash = clashes.some(
                              (c) =>
                                (c.gradeA === grade && c.day === day && c.slotA === targetSlotId) ||
                                (c.gradeB === grade && c.day === day && c.slotB === targetSlotId)
                            );

                            const teacherLabel = getTeacherLabel(cell?.teacherCode);

                            return (
                              <td
                                key={slotKey}
                                onClick={() => handleOpenEdit(grade, day, targetSlotId)}
                                className={`py-2 px-1 text-center border-l border-slate-800/80 transition cursor-pointer relative group ${
                                  hasClash
                                    ? 'bg-rose-950/70 ring-2 ring-rose-500'
                                    : cell
                                    ? targetSlotId === 'PKAR'
                                      ? 'bg-emerald-950/40 hover:bg-emerald-900/50'
                                      : targetSlotId === 'MEMBACA'
                                      ? 'bg-indigo-950/40 hover:bg-indigo-900/50'
                                      : 'bg-slate-800/60 hover:bg-slate-700/60'
                                    : 'hover:bg-slate-800/30'
                                }`}
                              >
                                {cell ? (
                                  <div className="space-y-0.5">
                                    <div className="font-sans font-black text-xs text-white flex items-center justify-center gap-1">
                                      {cell.subjectCode}
                                      {cell.isCoTeaching && (
                                        <span className="text-[8px] text-purple-400 font-bold">(Co)</span>
                                      )}
                                    </div>
                                    {cell.subjectCode !== 'PN' && (
                                      <div className={`text-[10px] font-bold ${
                                        cell.isAutoPKAR ? 'text-emerald-300' : 'text-blue-300'
                                      }`}>
                                        {teacherLabel}
                                      </div>
                                    )}
                                    {cell.isPemulihan && (
                                      <div>
                                        <span className="inline-block px-1 py-0.2 rounded text-[7px] font-black uppercase tracking-tight bg-emerald-600 text-white">
                                          {cell.subjectCode === 'BM' ? 'PBM' : 'PMT'}
                                        </span>
                                      </div>
                                    )}
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
            );
          })}
        </div>
      ) : (
        /* ========================================================================= */
        /* 2. SINGLE-GRADE TIMETABLE VIEW (Tahun 1, 2, 3, etc.)                      */
        /* ========================================================================= */
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
                      const isLocked = slot.isSpecialLocked || (day === 'SELASA' && slot.slotId === 'W1');
                      
                      // Check if this slot has a clash
                      const hasClash = clashes.some(
                        (c) =>
                          (c.gradeA === selectedGrade && c.day === day && c.slotA === slot.slotId) ||
                          (c.gradeB === selectedGrade && c.day === day && c.slotB === slot.slotId)
                      );

                      const teacherLabel = getTeacherLabel(cell?.teacherCode);

                      return (
                        <td
                          key={slot.slotId}
                          onClick={() => handleOpenEdit(selectedGrade, day, slot.slotId)}
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
                              <div className="font-sans font-black text-xs text-white flex items-center justify-center gap-1">
                                {cell.subjectCode}
                                {cell.isCoTeaching && (
                                  <span className="text-[8px] text-purple-400 font-bold">(Co)</span>
                                )}
                              </div>
                              {cell.subjectCode !== 'PN' && (
                                <div className="text-[10px] font-bold text-blue-300">
                                  {teacherLabel}
                                </div>
                              )}
                              {cell.isPemulihan && (
                                <div>
                                  <span className="inline-block px-1 py-0.2 rounded text-[7px] font-black uppercase tracking-tight bg-emerald-600 text-white">
                                    {cell.subjectCode === 'BM' ? 'PBM' : 'PMT'} PEMULIHAN
                                  </span>
                                </div>
                              )}
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
      )}

      {/* Edit Cell Modal */}
      {editingCell && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-black text-white uppercase tracking-wider">
                Sunting Petak Jadual (T.{editingCell.grade} · {editingCell.day} · {editingCell.slotId})
              </h3>
              <button
                onClick={() => setEditingCell(null)}
                className="text-slate-400 hover:text-white text-xs font-bold cursor-pointer"
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
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="">-- Kosong / Tiada Subjek --</option>
                  {editingCell.slotId === 'MEMBACA' && (
                    <option value="MEMBACA">MEMBACA - Program Membaca (07:15 - 07:30)</option>
                  )}
                  {editingCell.slotId === 'PKAR' && (
                    <option value="PKAR">PKAR - Program Pembentukan Karakter (Auto Pre-Recess)</option>
                  )}
                  {matrixData.map((r) => (
                    <option key={r.id} value={r.subjectCode}>
                      {r.subjectCode} - {r.subjectName} ({r.periods[editingCell.grade] || 0} waktu)
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
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="">-- Kosongkan Guru --</option>
                  {teacherMapping.list.map((t) => (
                    <option key={t.id} value={t.code}>
                      [{t.num}] {t.code} - {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {(editSubjectCode.toUpperCase() === 'BM' || editSubjectCode.toUpperCase() === 'MT') && (
                <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editIsPemulihan}
                    onChange={(e) => setEditIsPemulihan(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-400 bg-slate-900 border-slate-700 cursor-pointer"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-white block">
                      Lampirkan Pemulihan Khas ({editSubjectCode.toUpperCase() === 'BM' ? 'PBM' : 'PMT'})
                    </span>
                    <span className="text-[10px] text-emerald-400/80">
                      Murid pemulihan ditarik keluar semasa waktu mata pelajaran ini
                    </span>
                  </div>
                </label>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800 gap-2">
              <button
                onClick={handleClearCell}
                className="flex items-center gap-1.5 px-3 py-2 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Padam Petak
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditingCell(null)}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
                >
                  Batal
                </button>
                <button
                  onClick={handleSaveCell}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase transition cursor-pointer"
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
