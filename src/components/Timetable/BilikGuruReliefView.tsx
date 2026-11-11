import React, { useState, useMemo } from 'react';
import { 
  DayOfWeek, 
  DAYS_OF_WEEK, 
  ScheduleGrid, 
  getGradeDaySlots, 
  checkIntervalOverlap 
} from './types';
import { Users, Clock, CheckCircle2, UserCheck, Search, Printer, AlertCircle } from 'lucide-react';

interface BilikGuruReliefViewProps {
  schedule: ScheduleGrid;
  academicYear: string;
  teacherMapping: { list: Array<{ id: string; num: number; code: string; name: string }> };
  displayMode: 'NUMBER' | 'CODE';
}

export const BilikGuruReliefView: React.FC<BilikGuruReliefViewProps> = ({
  schedule,
  academicYear,
  teacherMapping,
  displayMode,
}) => {
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('ISNIN');
  const [selectedSlot, setSelectedSlot] = useState<string>('W1');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const slotsForDay = useMemo(() => {
    // Use Grade 2 slots as standard 11-slot reference for KSSR
    return getGradeDaySlots(2, selectedDay).filter((s) => !s.isRecess);
  }, [selectedDay]);

  // Determine what each teacher is doing at each slot on selectedDay
  // returns: Record<teacherCode, { isTeaching: boolean; details?: string; grade?: number; subject?: string }>
  const teacherActivityMap = useMemo(() => {
    const map: Record<string, Record<string, { isTeaching: boolean; details?: string; grade?: number }>> = {};

    teacherMapping.list.forEach((t) => {
      map[t.code] = {};
    });

    // Scan all grades for this day
    [1, 2, 3, 4, 5, 6].forEach((grade) => {
      const gradeSlots = getGradeDaySlots(grade, selectedDay);
      gradeSlots.forEach((s) => {
        if (s.isRecess) return;
        const cell = schedule[grade]?.[selectedDay]?.[s.slotId];
        if (cell && cell.teacherCode) {
          const tCode = cell.teacherCode.trim();
          if (map[tCode]) {
            // Find which reference slot overlaps with this grade slot
            slotsForDay.forEach((refSlot) => {
              if (checkIntervalOverlap(s.startMinutes, s.endMinutes, refSlot.startMinutes, refSlot.endMinutes)) {
                map[tCode][refSlot.slotId] = {
                  isTeaching: true,
                  grade,
                  details: `T.${grade} ${cell.subjectCode}`,
                };
              }
            });
          }
        }
      });
    });

    return map;
  }, [schedule, selectedDay, teacherMapping, slotsForDay]);

  // Free teachers for the selected slot
  const freeTeachersForSelectedSlot = useMemo(() => {
    return teacherMapping.list.filter((t) => {
      const act = teacherActivityMap[t.code]?.[selectedSlot];
      return !act || !act.isTeaching;
    });
  }, [teacherMapping, teacherActivityMap, selectedSlot]);

  const busyTeachersForSelectedSlot = useMemo(() => {
    return teacherMapping.list
      .map((t) => ({
        teacher: t,
        act: teacherActivityMap[t.code]?.[selectedSlot],
      }))
      .filter((item) => item.act && item.act.isTeaching);
  }, [teacherMapping, teacherActivityMap, selectedSlot]);

  const filteredTeachers = useMemo(() => {
    if (!searchQuery.trim()) return teacherMapping.list;
    const q = searchQuery.toLowerCase();
    return teacherMapping.list.filter(
      (t) => t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q) || String(t.num) === q
    );
  }, [teacherMapping, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Control Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Pengurusan Guru Ganti
            </span>
            <span className="text-xs text-slate-400">BGuru — Bilik Guru & Waktu Lapang</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white mt-1 flex items-center gap-2">
            Pemantauan Waktu Lapang & Guru Ganti (Relief)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Semakan pantas guru yang tiada kelas bagi setiap waktu mengajar untuk penugasan guru ganti (Relief).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-blue-600/30 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak Lembaran BGuru</span>
          </button>
        </div>
      </div>

      {/* Quick Interactive Slot Finder Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-xl">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Pencari Guru Bebas Segera (Waktu Ini)
              </h3>
              <p className="text-xs text-slate-400">
                Pilih hari dan waktu untuk mengenal pasti guru yang boleh ditugaskan sebagai Guru Ganti.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Day Selector */}
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value as DayOfWeek)}
              className="px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-bold text-white outline-none focus:border-blue-500 cursor-pointer"
            >
              {DAYS_OF_WEEK.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            {/* Slot Selector */}
            <select
              value={selectedSlot}
              onChange={(e) => setSelectedSlot(e.target.value)}
              className="px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-bold text-white outline-none focus:border-blue-500 cursor-pointer"
            >
              {slotsForDay.map((s) => (
                <option key={s.slotId} value={s.slotId}>
                  {s.label} ({s.startTime}–{s.endTime})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Free Teachers Available List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Guru Bebas / Waktu Lapang ({freeTeachersForSelectedSlot.length} orang)</span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Sedia Ditugaskan</span>
            </div>
            {freeTeachersForSelectedSlot.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-2">Tiada guru bebas pada waktu ini.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                {freeTeachersForSelectedSlot.map((t) => (
                  <span
                    key={t.id}
                    className="px-2.5 py-1 bg-emerald-950/60 border border-emerald-700/60 text-emerald-200 rounded-lg text-xs font-bold"
                    title={t.name}
                  >
                    [{displayMode === 'CODE' ? t.code : t.num}] {t.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-blue-400 flex items-center gap-1.5 uppercase">
                <Clock className="w-3.5 h-3.5" />
                <span>Guru Sedang Mengajar ({busyTeachersForSelectedSlot.length} orang)</span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Di Dalam Kelas</span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
              {busyTeachersForSelectedSlot.map((item) => (
                <span
                  key={item.teacher.id}
                  className="px-2.5 py-1 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-xs font-medium"
                >
                  <strong className="text-white">[{item.teacher.code}]</strong>: {item.act?.details}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Full Bilik Guru Matrix Table (All Teachers vs Day's Slots) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl overflow-hidden print:p-0 print:border-none print:shadow-none print:bg-white print:text-slate-900">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-3 border-b border-slate-800 print:border-slate-300">
          <div>
            <h3 className="text-sm font-black text-white print:text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              <span>Matriks Jadual Mengajar Guru — Hari {selectedDay}</span>
            </h3>
            <p className="text-[11px] text-slate-400 print:text-slate-600">
              Status mengajar bagi setiap guru pada setiap waktu (Sesi {academicYear})
            </p>
          </div>

          <div className="relative print:hidden">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Cari nama atau kod guru..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white outline-none focus:border-blue-500 w-56"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse font-mono">
            <thead>
              <tr className="bg-slate-950 text-slate-300 print:bg-slate-100 print:text-slate-900 font-black text-[11px] uppercase border-b border-slate-800 print:border-slate-400 text-center">
                <th className="py-2.5 px-2 w-12 text-center border-r border-slate-800 print:border-slate-400">No</th>
                <th className="py-2.5 px-2 w-14 text-center border-r border-slate-800 print:border-slate-400">Kod</th>
                <th className="py-2.5 px-3 text-left w-48 border-r border-slate-800 print:border-slate-400">Nama Guru</th>
                {slotsForDay.map((s) => (
                  <th key={s.slotId} className="py-2 px-1 border-r border-slate-800 print:border-slate-400 w-16">
                    <div>{s.label}</div>
                    <div className="text-[9px] font-normal text-slate-500 print:text-slate-600">
                      {s.startTime}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 print:divide-slate-300">
              {filteredTeachers.map((t) => (
                <tr key={t.id} className="hover:bg-slate-800/40 print:hover:bg-transparent">
                  <td className="py-2 px-2 text-center text-slate-400 print:text-slate-600 font-bold border-r border-slate-800 print:border-slate-300">
                    {t.num}
                  </td>
                  <td className="py-2 px-2 text-center font-bold text-indigo-300 print:text-indigo-800 border-r border-slate-800 print:border-slate-300">
                    {t.code}
                  </td>
                  <td className="py-2 px-3 font-sans font-bold text-slate-200 print:text-slate-900 truncate max-w-[180px] border-r border-slate-800 print:border-slate-300" title={t.name}>
                    {t.name}
                  </td>

                  {slotsForDay.map((slot) => {
                    const act = teacherActivityMap[t.code]?.[slot.slotId];
                    const isTeaching = act && act.isTeaching;

                    return (
                      <td
                        key={slot.slotId}
                        className={`py-1.5 px-1 text-center border-r border-slate-800/60 print:border-slate-300 ${
                          isTeaching
                            ? 'bg-blue-950/60 text-blue-200 print:bg-blue-100 print:text-blue-900 font-bold text-[10px]'
                            : 'bg-emerald-950/20 text-emerald-400/80 print:bg-emerald-50 print:text-emerald-800 text-[10px]'
                        }`}
                      >
                        {isTeaching ? act.details : 'BEBAS'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
