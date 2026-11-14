import React, { useState, useMemo } from 'react';
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
import { autoPairPKARInGrid, auditScheduleWorkload } from './autoScheduler';
import { 
  Sparkles, 
  AlertTriangle, 
  CheckCircle2, 
  Trash2, 
  Edit3, 
  Layers,
  Calendar,
  Table as TableIcon,
  ShieldCheck,
  X
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

  const [dragSource, setDragSource] = useState<{ grade: number; day: DayOfWeek; slotId: string } | null>(null);
  const [dragOverCellKey, setDragOverCellKey] = useState<string | null>(null);
  const [workloadAlert, setWorkloadAlert] = useState<string | null>(null);

  const teacherCodesList = useMemo(
    () => teacherMapping.list.map((t) => t.code).filter(Boolean),
    [teacherMapping.list]
  );

  const workloadAudit = useMemo(
    () => auditScheduleWorkload(schedule, teacherCodesList),
    [schedule, teacherCodesList]
  );

  const checkDailyHardCapViolation = (
    candidateGrid: ScheduleGrid,
    affectedTeachers: string[],
    affectedDays: DayOfWeek[]
  ): string | null => {
    const report = auditScheduleWorkload(candidateGrid, teacherCodesList);
    const uniqueTeachers = Array.from(new Set(affectedTeachers.flatMap((tc) => tc.split('/').map((c) => c.trim())).filter(Boolean)));
    const daysToCheck = affectedDays.length > 0 ? affectedDays : DAYS_OF_WEEK;

    for (const tCode of uniqueTeachers) {
      const summary = report.teachers[tCode];
      if (!summary) continue;
      for (const d of daysToCheck) {
        const dayLoad = summary.daily[d] || 0;
        if (dayLoad > 8.0 + 1e-6) {
          return `Had Mutlak 8 Waktu/Hari Dilanggar! Guru [${tCode}] akan mencapai ${dayLoad} waktu pada hari ${d} (maksimum dibenarkan: 8.0 waktu/hari). Perubahan disekat.`;
        }
      }
    }
    return null;
  };

  const isKP = (g: number) => {
    const yr = parseInt(academicYear, 10) || 2027;
    if (yr < 2027) return false;
    return g <= yr - 2026;
  };

  const handleOpenEdit = (grade: number, day: DayOfWeek, slotId: string) => {
    if (slotId === 'REHAT') return;
    setWorkloadAlert(null);
    const current = schedule[grade]?.[day]?.[slotId];
    setEditingCell({ grade, day, slotId, current });
    setEditSubjectCode(current?.subjectCode || (slotId === 'TASMIK' ? 'TASMIK' : slotId === 'MEMBACA' ? 'MEMBACA' : ''));
    setEditTeacherCode(current?.teacherCode || '');
    setEditIsPemulihan(current?.isPemulihan || false);
  };

  const handleSaveCell = () => {
    if (!editingCell) return;
    const { grade, day, slotId } = editingCell;

    const matchedRow = matrixData.find((r) => r.subjectCode === editSubjectCode);
    const isBmOrMt = editSubjectCode === 'BM' || editSubjectCode === 'MT';
    const isTasmik = editSubjectCode === 'TASMIK' || slotId === 'TASMIK';
    const newCell: TimetableCell | null = editSubjectCode
      ? {
          subjectId: matchedRow?.id || editSubjectCode.toLowerCase(),
          subjectCode: editSubjectCode,
          subjectName: matchedRow?.subjectName || (isTasmik ? 'PROGRAM TASMIK' : editSubjectCode),
          teacherCode: editTeacherCode,
          periodLength: slotId === 'PKAR' ? 0.5 : 1,
          isPemulihan: isBmOrMt ? editIsPemulihan : false,
          isManualSlot: isTasmik,
        }
      : null;

    const newGrid: ScheduleGrid = JSON.parse(JSON.stringify(schedule));
    if (!newGrid[grade]) newGrid[grade] = {} as any;
    if (!newGrid[grade][day]) newGrid[grade][day] = {};
    newGrid[grade][day][slotId] = newCell;

    // Dynamically update/re-pair PKAR with pre-recess teacher
    autoPairPKARInGrid(newGrid);

    const violationMsg = checkDailyHardCapViolation(newGrid, [editTeacherCode], [day]);
    if (violationMsg) {
      setWorkloadAlert(violationMsg);
      return;
    }

    setWorkloadAlert(null);
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

    setWorkloadAlert(null);
    onUpdateSchedule(newGrid);
    setEditingCell(null);
  };

  const handleCellDrop = (
    targetGrade: number,
    targetDay: DayOfWeek,
    targetSlotId: string,
    event: React.DragEvent
  ) => {
    event.preventDefault();
    setDragOverCellKey(null);

    // If teacher code was dragged from right-hand panel into cell
    const droppedTeacherCode = event.dataTransfer.getData('application/teacher-code');
    if (droppedTeacherCode && (!dragSource || !event.dataTransfer.types.includes('application/timetable-cell'))) {
      const currentCell = schedule[targetGrade]?.[targetDay]?.[targetSlotId];
      if (currentCell) {
        const newGrid: ScheduleGrid = JSON.parse(JSON.stringify(schedule));
        newGrid[targetGrade][targetDay][targetSlotId] = {
          ...currentCell,
          teacherCode: droppedTeacherCode.trim(),
        };
        autoPairPKARInGrid(newGrid);

        const violationMsg = checkDailyHardCapViolation(newGrid, [droppedTeacherCode.trim()], [targetDay]);
        if (violationMsg) {
          setWorkloadAlert(violationMsg);
          return;
        }

        setWorkloadAlert(null);
        onUpdateSchedule(newGrid);
      }
      return;
    }

    // Cell swap via Drag-and-Drop
    const cellDataRaw = event.dataTransfer.getData('application/timetable-cell');
    let source = dragSource;
    if (!source && cellDataRaw) {
      try {
        source = JSON.parse(cellDataRaw);
      } catch {
        source = null;
      }
    }

    if (!source) return;
    const { grade: srcGrade, day: srcDay, slotId: srcSlotId } = source;

    if (srcGrade === targetGrade && srcDay === targetDay && srcSlotId === targetSlotId) {
      return;
    }

    // Guard against swapping REHAT or locked Tuesday W1 Perhimpunan
    if (targetSlotId === 'REHAT' || srcSlotId === 'REHAT') return;
    if (srcDay === 'SELASA' && srcSlotId === 'W1') return;
    if (targetDay === 'SELASA' && targetSlotId === 'W1') return;

    const newGrid: ScheduleGrid = JSON.parse(JSON.stringify(schedule));
    if (!newGrid[srcGrade]) newGrid[srcGrade] = {} as any;
    if (!newGrid[srcGrade][srcDay]) newGrid[srcGrade][srcDay] = {};
    if (!newGrid[targetGrade]) newGrid[targetGrade] = {} as any;
    if (!newGrid[targetGrade][targetDay]) newGrid[targetGrade][targetDay] = {};

    const cellA = newGrid[srcGrade][srcDay][srcSlotId] || null;
    const cellB = newGrid[targetGrade][targetDay][targetSlotId] || null;

    newGrid[srcGrade][srcDay][srcSlotId] = cellB;
    newGrid[targetGrade][targetDay][targetSlotId] = cellA;

    // Dynamically re-bind PKAR teacher & +0.5 workload if pre-recess slot (W4) changed
    autoPairPKARInGrid(newGrid);

    const affectedTeachers = [cellA?.teacherCode || '', cellB?.teacherCode || ''].filter(Boolean);
    const violationMsg = checkDailyHardCapViolation(newGrid, affectedTeachers, [srcDay, targetDay]);
    if (violationMsg) {
      setWorkloadAlert(violationMsg);
      setDragSource(null);
      return;
    }

    setWorkloadAlert(null);
    onUpdateSchedule(newGrid);
    setDragSource(null);
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

  // Master Table Dual-Bell Period Alignment:
  // Pre-recess: 
  // Year 1 (KP2027): 07:15 Membaca, 07:30-09:30 W1-W4, 09:30-09:45 PKAR (0.5w), 09:45-10:15 REHAT
  // Years 2-6 (KSSR): 07:15-09:45 W1-W5 (5w, no PKAR), 09:45-10:15 REHAT
  // Master Table Dual-Bell Period Alignment:
  // Year 1 (KP2027): 07:15 Membaca, 07:30-09:30 W1-W4, 09:30-09:45 PKAR (0.5w), 09:45-10:15 REHAT
  // Years 2-6 (KSSR): 07:15-09:45 W1-W5 (5w, no PKAR), 09:45-10:15 REHAT
  // Post-recess:
  // Mon/Tue: Year 1 W5-W10 (6w, ends 13:15), T2-6 W6-W11 (6w, ends 13:15), TASMIK 13:15-13:45
  // Wed/Thu: Year 1 W5-W9 (5w, ends 12:45), T2-6 W6-W10 (5w, ends 12:45), TASMIK 12:45-13:15
  // Friday: Year 1 W5-W7 (3w, ends 11:45), T2-3 W6-W7 (ends 11:15), T4-6 W6-W8 (ends 11:45)
  const getMasterSlotHeaders = (day: DayOfWeek) => {
    if (day === 'JUMAAT') {
      return ['MEMBACA', 'W1', 'W2', 'W3', 'W4', 'W5', 'PKAR', 'REHAT', 'W6', 'W7', 'W8', 'W9'];
    }
    if (day === 'ISNIN' || day === 'SELASA') {
      return ['MEMBACA', 'W1', 'W2', 'W3', 'W4', 'W5', 'PKAR', 'REHAT', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11', 'TASMIK'];
    }
    // RABU, KHAMIS
    return ['MEMBACA', 'W1', 'W2', 'W3', 'W4', 'W5', 'PKAR', 'REHAT', 'W6', 'W7', 'W8', 'W9', 'W10', 'TASMIK'];
  };

  const getMasterSlotLabel = (slotKey: string) => {
    switch (slotKey) {
      case 'MEMBACA': return { title: 'Membaca', sub: '07:15 (T1)' };
      case 'W1': return { title: 'W1', sub: '07:15 / 07:30' };
      case 'W2': return { title: 'W2', sub: '07:45 / 08:00' };
      case 'W3': return { title: 'W3', sub: '08:15 / 08:30' };
      case 'W4': return { title: 'W4', sub: '08:45 / 09:00' };
      case 'W5': return { title: 'W5', sub: '09:15 (T2–6)' };
      case 'PKAR': return { title: 'PKAR', sub: '09:30 (T1)' };
      case 'REHAT': return { title: 'REHAT', sub: '09:45–10:15' };
      case 'W6': return { title: 'W6 / W5', sub: '10:15' };
      case 'W7': return { title: 'W7 / W6', sub: '10:45' };
      case 'W8': return { title: 'W8 / W7', sub: '11:15' };
      case 'W9': return { title: 'W9 / W8', sub: '11:45' };
      case 'W10': return { title: 'W10 / W9', sub: '12:15' };
      case 'W11': return { title: 'W11 / W10', sub: '12:45' };
      case 'TASMIK': return { title: 'TASMIK', sub: 'Selepas Sekolah' };
      default: return { title: slotKey, sub: '' };
    }
  };

  const getMasterTargetSlotId = (grade: number, slotKey: string, day: DayOfWeek): string | null => {
    if (slotKey === 'MEMBACA') return grade === 1 ? 'MEMBACA' : null;
    if (slotKey === 'PKAR') return grade === 1 ? 'PKAR' : null;
    if (slotKey === 'REHAT') return 'REHAT';
    if (slotKey === 'W1' || slotKey === 'W2' || slotKey === 'W3' || slotKey === 'W4') return slotKey;
    if (slotKey === 'W5') return grade === 1 ? null : 'W5';

    // Post-recess columns (10:15 onwards)
    if (slotKey === 'W6') return grade === 1 ? 'W5' : 'W6';
    if (slotKey === 'W7') return grade === 1 ? 'W6' : 'W7';
    if (slotKey === 'W8') {
      if (day === 'JUMAAT') {
        if (grade === 2 || grade === 3) return 'TASMIK'; // T2-3 Jumaat 7 regular + Tasmik
      }
      return grade === 1 ? 'W7' : 'W8';
    }
    if (slotKey === 'W9') {
      if (day === 'JUMAAT') {
        if (grade === 1) return 'TASMIK'; // T1 Jumaat 7 regular + Tasmik
        if (grade >= 4) return 'TASMIK';  // T4-6 Jumaat 8 regular + Tasmik
        return null;
      }
      return grade === 1 ? 'W8' : 'W9';
    }
    if (slotKey === 'W10') return grade === 1 ? 'W9' : 'W10';
    if (slotKey === 'W11') {
      return grade === 1 ? 'W10' : 'W11';
    }
    if (slotKey === 'TASMIK') {
      return 'TASMIK';
    }
    return slotKey;
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
              <option value="2026" className="bg-slate-900 text-white">Sesi 2026</option>
              <option value="2027" className="bg-slate-900 text-white">Sesi 2027</option>
              <option value="2028" className="bg-slate-900 text-white">Sesi 2028</option>
              <option value="2029" className="bg-slate-900 text-white">Sesi 2029</option>
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

      {/* Workload Hard-Cap Block Notice (Drag & Drop / Manual Save Guard) */}
      {workloadAlert && !editingCell && (
        <div className="bg-rose-950/90 border border-rose-600 rounded-2xl p-4 text-xs flex items-start justify-between gap-3 shadow-lg">
          <div className="flex items-start gap-2.5 text-rose-200">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-black text-rose-300 uppercase tracking-wider text-[11px]">
                Sekatan Had Maksimum 8 Waktu/Hari
              </div>
              <p className="mt-0.5 font-mono text-[11px]">{workloadAlert}</p>
            </div>
          </div>
          <button
            onClick={() => setWorkloadAlert(null)}
            className="text-rose-300 hover:text-white p-1 rounded-lg cursor-pointer"
            title="Tutup amaran"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Audit Beban Harian & PJ Summary Strip */}
      <div
        className={`rounded-2xl px-4 py-3 border text-xs flex flex-col gap-2 ${
          workloadAudit.isValidWorkload
            ? 'bg-emerald-950/30 border-emerald-700/50 text-emerald-200'
            : 'bg-amber-950/40 border-amber-700/60 text-amber-200'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-black uppercase tracking-wider text-[11px]">
            {workloadAudit.isValidWorkload ? (
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            )}
            <span>
              Audit Beban Harian &amp; PJ:{' '}
              {workloadAudit.isValidWorkload
                ? 'Semua guru ≤ 8w/hari · Selesa & Seimbang'
                : `${workloadAudit.violations.length} Amaran Beban / Selang PJ Dikesan`}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
            <span className={`px-2 py-0.5 rounded-lg border ${
              workloadAudit.teachersOver8 === 0
                ? 'bg-emerald-950/60 border-emerald-700/50 text-emerald-300'
                : 'bg-rose-950/70 border-rose-700 text-rose-300'
            }`}>
              &gt;8w/hari: {workloadAudit.teachersOver8}
            </span>
            <span className={`px-2 py-0.5 rounded-lg border ${
              workloadAudit.teachersExceedingOver7Limit === 0
                ? 'bg-emerald-950/60 border-emerald-700/50 text-emerald-300'
                : 'bg-amber-950/70 border-amber-700 text-amber-300'
            }`}>
              &gt;1 Hari &gt;7w: {workloadAudit.teachersExceedingOver7Limit}
            </span>
            <span className={`px-2 py-0.5 rounded-lg border ${
              workloadAudit.pjConsecutiveViolations === 0 && workloadAudit.pjSlotViolations === 0
                ? 'bg-emerald-950/60 border-emerald-700/50 text-emerald-300'
                : 'bg-amber-950/70 border-amber-700 text-amber-300'
            }`}>
              PJ Selang/W1–W2: {workloadAudit.pjConsecutiveViolations + workloadAudit.pjSlotViolations === 0 ? 'Patuh' : `${workloadAudit.pjConsecutiveViolations + workloadAudit.pjSlotViolations} kes`}
            </span>
            <span className={`px-2 py-0.5 rounded-lg border ${
              workloadAudit.pmPaiBlockViolations === 0
                ? 'bg-emerald-950/60 border-emerald-700/50 text-emerald-300'
                : 'bg-amber-950/70 border-amber-700 text-amber-300'
            }`}>
              PM/PAI Kembar 2+2: {workloadAudit.pmPaiBlockViolations === 0 ? 'Patuh' : `${workloadAudit.pmPaiBlockViolations} kes`}
            </span>
          </div>
        </div>
        {workloadAudit.violations.length > 0 && (
          <ul className="list-disc list-inside space-y-0.5 text-[11px] font-mono text-amber-200/90">
            {workloadAudit.violations.slice(0, 6).map((v, i) => (
              <li key={i}>{v}</li>
            ))}
            {workloadAudit.violations.length > 6 && (
              <li>...dan {workloadAudit.violations.length - 6} lagi.</li>
            )}
          </ul>
        )}
      </div>

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
                      {masterSlots.map((slotKey) => {
                        const { title, sub } = getMasterSlotLabel(slotKey);
                        return (
                          <th
                            key={slotKey}
                            className={`py-2 px-1 border-l border-slate-800 ${
                              slotKey === 'REHAT'
                                ? 'bg-amber-950/40 text-amber-300 w-16'
                                : slotKey === 'PKAR'
                                ? 'bg-emerald-950/40 text-emerald-300 w-16'
                                : 'w-20'
                            }`}
                          >
                            <div className="font-bold text-slate-300">{title}</div>
                            {sub && (
                              <div className="text-[8px] font-mono text-slate-500 font-normal">
                                {sub}
                              </div>
                            )}
                          </th>
                        );
                      })}
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

                            const targetSlotId = getMasterTargetSlotId(grade, slotKey, day);
                            if (!targetSlotId) {
                              return (
                                <td
                                  key={slotKey}
                                  className="py-2 px-1 text-center bg-slate-950/40 text-slate-700 font-bold text-[10px] border-l border-slate-800 select-none"
                                >
                                  -
                                </td>
                              );
                            }

                            const cell = schedule[grade]?.[day]?.[targetSlotId];
                            const isCellDraggable = Boolean(cell) && targetSlotId !== 'REHAT' && !(day === 'SELASA' && targetSlotId === 'W1');
                            const cellKey = `m_${grade}_${day}_${targetSlotId}`;

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
                                draggable={isCellDraggable}
                                onDragStart={(e) => {
                                  if (!isCellDraggable) return;
                                  setDragSource({ grade, day, slotId: targetSlotId });
                                  e.dataTransfer.setData('application/timetable-cell', JSON.stringify({ grade, day, slotId: targetSlotId }));
                                  e.dataTransfer.effectAllowed = 'move';
                                }}
                                onDragOver={(e) => {
                                  if (slotKey !== 'REHAT' && !(day === 'SELASA' && targetSlotId === 'W1')) {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = 'move';
                                    if (dragOverCellKey !== cellKey) setDragOverCellKey(cellKey);
                                  }
                                }}
                                onDragLeave={() => {
                                  if (dragOverCellKey === cellKey) setDragOverCellKey(null);
                                }}
                                onDrop={(e) => {
                                  handleCellDrop(grade, day, targetSlotId, e);
                                }}
                                onClick={() => handleOpenEdit(grade, day, targetSlotId)}
                                className={`py-2 px-1 text-center border-l border-slate-800/80 transition relative group ${
                                  isCellDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                                } ${
                                  dragOverCellKey === cellKey
                                    ? 'ring-2 ring-blue-400 bg-blue-900/40 z-10'
                                    : hasClash
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
                {getGradeDaySlots(selectedGrade, 'ISNIN', academicYear).map((s) => (
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
                const headerSlots = getGradeDaySlots(selectedGrade, 'ISNIN', academicYear);
                const daySlots = getGradeDaySlots(selectedGrade, day, academicYear);
                return (
                  <tr key={day} className="hover:bg-slate-800/30 transition">
                    <td className="py-3 px-3 font-sans font-black text-white bg-slate-950/70 border-r border-slate-800">
                      {day}
                    </td>
                    {headerSlots.map((headerSlot) => {
                      const slot = daySlots.find((s) => s.slotId === headerSlot.slotId);
                      if (!slot) {
                        return (
                          <td
                            key={headerSlot.slotId}
                            className="py-2 px-1 text-center bg-slate-950/40 text-slate-700 font-bold text-xs border-l border-slate-800 select-none"
                          >
                            -
                          </td>
                        );
                      }
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
                      const isCellDraggable = Boolean(cell) && !slot.isRecess && !isLocked;
                      const cellKey = `s_${selectedGrade}_${day}_${slot.slotId}`;
                      
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
                          draggable={isCellDraggable}
                          onDragStart={(e) => {
                            if (!isCellDraggable) return;
                            setDragSource({ grade: selectedGrade, day, slotId: slot.slotId });
                            e.dataTransfer.setData('application/timetable-cell', JSON.stringify({ grade: selectedGrade, day, slotId: slot.slotId }));
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragOver={(e) => {
                            if (!slot.isRecess && !isLocked) {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                              if (dragOverCellKey !== cellKey) setDragOverCellKey(cellKey);
                            }
                          }}
                          onDragLeave={() => {
                            if (dragOverCellKey === cellKey) setDragOverCellKey(null);
                          }}
                          onDrop={(e) => {
                            handleCellDrop(selectedGrade, day, slot.slotId, e);
                          }}
                          onClick={() => handleOpenEdit(selectedGrade, day, slot.slotId)}
                          className={`py-2 px-1 text-center border-l border-slate-800/80 transition relative group ${
                            isCellDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                          } ${
                            dragOverCellKey === cellKey
                              ? 'ring-2 ring-blue-400 bg-blue-900/40 z-10'
                              : hasClash
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
              {(editingCell.slotId === 'TASMIK' || editSubjectCode === 'TASMIK') && (
                <div className="p-3 rounded-2xl bg-emerald-950/50 border border-emerald-600/50 text-emerald-300 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-black text-emerald-200 uppercase tracking-wider text-[11px]">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Slot Khas Tasmik (Gabung Kelas Disokong)</span>
                  </div>
                  <p className="text-[11px] text-emerald-300/90 leading-relaxed font-sans">
                    Waktu pascawaktu sekolah (100% susunan manual oleh Guru Besar/PKP). Ustaz/Ustazah boleh mengajar gabungan berbilang kelas secara serentak tanpa amaran pertembungan waktu. Waktu ini dikira secara automatik ke dalam beban mengajar mingguan.
                  </p>
                </div>
              )}

              {editingCell.slotId === 'MEMBACA' && (
                <div className="p-3 rounded-2xl bg-indigo-950/50 border border-indigo-600/50 text-indigo-300 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-black text-indigo-200 uppercase tracking-wider text-[11px]">
                    <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                    <span>Program Membaca Tahun 1 (07:15 – 07:30)</span>
                  </div>
                  <p className="text-[11px] text-indigo-300/90 leading-relaxed font-sans">
                    Slot pagi khas sebelum loceng pertama. Dikosongkan secara lalai untuk susunan manual oleh pihak pentadbir.
                  </p>
                </div>
              )}

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
                  <option value="TASMIK">TASMIK - Program Tasmik Pascawaktu (Gabung Kelas)</option>
                  {editingCell.slotId === 'MEMBACA' && (
                    <option value="MEMBACA">MEMBACA - Program Membaca Tahun 1 (07:15 - 07:30)</option>
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

            {workloadAlert && (
              <div className="p-3 rounded-2xl bg-rose-950/90 border border-rose-600 text-rose-200 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="font-mono text-[11px]">{workloadAlert}</div>
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-slate-800 gap-2">
              <button
                onClick={handleClearCell}
                className="flex items-center gap-1.5 px-3 py-2 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Padam Petak
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setWorkloadAlert(null);
                    setEditingCell(null);
                  }}
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
