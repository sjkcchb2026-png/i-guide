import React, { useState, useMemo } from 'react';
import { 
  DayOfWeek, 
  DAYS_OF_WEEK, 
  ScheduleGrid, 
  getGradeDaySlots 
} from './types';
import { Printer, User, Award, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

interface TeacherTimetableViewProps {
  schedule: ScheduleGrid;
  academicYear: string;
  teacherMapping: { list: Array<{ id: string; num: number; code: string; name: string }> };
  displayMode: 'NUMBER' | 'CODE';
  schoolName?: string;
  schoolCode?: string;
  defaultTeacherCode?: string;
}

export const TeacherTimetableView: React.FC<TeacherTimetableViewProps> = ({
  schedule,
  academicYear,
  teacherMapping,
  displayMode,
  schoolName = 'SJK (C) CHUNG HUA BALINGIAN',
  schoolCode = 'YCC3404',
  defaultTeacherCode,
}) => {
  const [selectedTeacherCode, setSelectedTeacherCode] = useState<string>(
    defaultTeacherCode || teacherMapping.list[0]?.code || ''
  );

  const selectedTeacher = useMemo(() => {
    return teacherMapping.list.find((t) => t.code === selectedTeacherCode) || teacherMapping.list[0];
  }, [teacherMapping, selectedTeacherCode]);

  // Build the personal timetable matrix for this teacher: [day][slot] => { grade, subjectCode, subjectName, time }
  const personalSchedule = useMemo(() => {
    const data: Record<DayOfWeek, Record<string, { grade: number; subjectCode: string; subjectName: string; time: string } | null>> = {
      ISNIN: {},
      SELASA: {},
      RABU: {},
      KHAMIS: {},
      JUMAAT: {},
    };

    if (!selectedTeacher) return data;
    const tCode = selectedTeacher.code;

    DAYS_OF_WEEK.forEach((day) => {
      // Use standard reference slots (W1 to W11)
      const slots = getGradeDaySlots(2, day).filter((s) => !s.isRecess);
      slots.forEach((s) => {
        data[day][s.slotId] = null;
      });

      // Find where this teacher is assigned across grades 1 to 6
      [1, 2, 3, 4, 5, 6].forEach((grade) => {
        const gradeSlots = getGradeDaySlots(grade, day);
        gradeSlots.forEach((gs) => {
          if (gs.isRecess) return;
          const cell = schedule[grade]?.[day]?.[gs.slotId];
          const isAssigned =
            cell &&
            (cell.teacherCode === tCode ||
              (cell.teacherCode && cell.teacherCode.split('/').map((c) => c.trim()).includes(tCode)));

          if (cell && isAssigned) {
            // Find slot key
            let slotKey = gs.slotId;
            // Map T1 W5 (which is 10:15-10:45) to reference W6, up to W10 -> W11
            if (grade === 1) {
              if (gs.slotId === 'W5') slotKey = 'W6';
              else if (gs.slotId === 'W6') slotKey = 'W7';
              else if (gs.slotId === 'W7') slotKey = 'W8';
              else if (gs.slotId === 'W8') slotKey = 'W9';
              else if (gs.slotId === 'W9') slotKey = 'W10';
              else if (gs.slotId === 'W10') slotKey = 'W11';
            }

            let subjCode = cell.subjectCode;
            let subjName = cell.subjectName;
            if (tCode === 'MFA' && cell.teacherCode?.includes('/') && subjCode.includes('PAI')) {
              subjCode = 'PAI';
              subjName = 'PENDIDIKAN ISLAM';
            }

            data[day][slotKey] = {
              grade,
              subjectCode: subjCode,
              subjectName: subjName,
              time: `${gs.startTime}–${gs.endTime}`,
            };
          }
        });
      });
    });

    return data;
  }, [schedule, selectedTeacher]);

  // Calculate daily workload and total workload
  const workloads = useMemo(() => {
    const daily: Record<DayOfWeek, number> = { ISNIN: 0, SELASA: 0, RABU: 0, KHAMIS: 0, JUMAAT: 0 };
    let total = 0;
    const subjectCounts: Record<string, number> = {};

    DAYS_OF_WEEK.forEach((day) => {
      Object.values(personalSchedule[day]).forEach((item) => {
        if (item) {
          daily[day] += 1;
          total += 1;
          subjectCounts[item.subjectCode] = (subjectCounts[item.subjectCode] || 0) + 1;
        }
      });
    });

    return { daily, total, subjectCounts };
  }, [personalSchedule]);

  const isOptimal = workloads.total >= 22 && workloads.total <= 30;
  const isOverload = workloads.total > 30;

  return (
    <div className="space-y-6">
      {/* Control Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30">
              Jadual Peribadi Guru
            </span>
            <span className="text-xs text-slate-400">JG1 – JG50 Lembaran Waktu Individu</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white mt-1 flex items-center gap-2">
            Jadual Mengajar: {selectedTeacher ? selectedTeacher.name : 'Pilih Guru'} ({selectedTeacher ? selectedTeacher.code : ''})
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Jumlah Waktu Seminggu: <strong className="text-white">{workloads.total} waktu</strong> ·{' '}
            Status Beban:{' '}
            <strong className={isOverload ? 'text-rose-400' : isOptimal ? 'text-emerald-400' : 'text-slate-300'}>
              {isOverload ? 'Lebih Beban (>30w)' : isOptimal ? 'Optimum (22–30w)' : 'Kurang (<22w)'}
            </strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Teacher Selector Dropdown */}
          <select
            value={selectedTeacherCode}
            onChange={(e) => setSelectedTeacherCode(e.target.value)}
            className="px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-bold text-white outline-none focus:border-blue-500 cursor-pointer max-w-xs"
          >
            {teacherMapping.list.map((t) => (
              <option key={t.id} value={t.code}>
                [{t.num}] {t.code} - {t.name}
              </option>
            ))}
          </select>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-blue-600/30 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak Jadual Guru</span>
          </button>
        </div>
      </div>

      {/* Printable Teacher Timetable Sheet */}
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
            JADUAL WAKTU PERSENDIRIAN GURU — SESI AKADEMIK {academicYear}
          </h2>
          <div className="flex justify-center items-center gap-4 text-xs font-semibold text-slate-600 pt-1">
            <span>Nama Guru: <strong className="text-slate-900 uppercase">{selectedTeacher?.name}</strong></span>
            <span>·</span>
            <span>Kod Singkatan: <strong className="text-blue-700">{selectedTeacher?.code}</strong> ({selectedTeacher?.num})</span>
            <span>·</span>
            <span>Jumlah Waktu: <strong className="text-slate-900">{workloads.total} Waktu</strong></span>
          </div>
        </div>

        {/* Timetable Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse border border-slate-400">
            <thead>
              <tr className="bg-slate-100 text-slate-800 font-black text-center border-b border-slate-400">
                <th className="p-3 border border-slate-400 w-24">Hari / Waktu</th>
                {['W1', 'W2', 'W3', 'W4', 'W5', 'REHAT', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11'].map((slot) => (
                  <th
                    key={slot}
                    className={`p-2 border border-slate-400 ${
                      slot === 'REHAT' ? 'bg-amber-100 text-amber-900 w-16' : 'w-20'
                    }`}
                  >
                    <div className="font-bold text-xs">{slot}</div>
                  </th>
                ))}
                <th className="p-3 border border-slate-400 w-20 text-center bg-slate-200">Jumlah</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300 font-mono text-center">
              {DAYS_OF_WEEK.map((day) => {
                const dayWorkload = workloads.daily[day];
                const isOverDailyLimit = dayWorkload > 7;

                return (
                  <tr key={day} className="hover:bg-slate-50 transition">
                    <td className="p-3 border border-slate-400 font-sans font-black text-slate-900 bg-slate-50 text-left">
                      {day}
                    </td>

                    {['W1', 'W2', 'W3', 'W4', 'W5', 'REHAT', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11'].map((slotKey) => {
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

                      // Friday ends at W8
                      if (day === 'JUMAAT' && ['W9', 'W10', 'W11'].includes(slotKey)) {
                        return (
                          <td key={slotKey} className="p-1 border border-slate-400 bg-slate-100 text-slate-300">
                            -
                          </td>
                        );
                      }

                      // Wed & Thu end at W10
                      if (['RABU', 'KHAMIS'].includes(day) && slotKey === 'W11') {
                        return (
                          <td key={slotKey} className="p-1 border border-slate-400 bg-slate-100 text-slate-300">
                            -
                          </td>
                        );
                      }

                      const item = personalSchedule[day]?.[slotKey];

                      return (
                        <td
                          key={slotKey}
                          className={`p-2 border border-slate-400 ${
                            item ? 'bg-blue-50/70 font-bold' : ''
                          }`}
                        >
                          {item ? (
                            <div>
                              <div className="font-sans font-black text-sm text-slate-900">
                                {item.subjectCode}
                              </div>
                              <div className="text-[10px] text-blue-700 font-bold">
                                T.{item.grade}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-300 font-light">-</span>
                          )}
                        </td>
                      );
                    })}

                    <td className="p-2 border border-slate-400 font-bold text-xs bg-slate-50">
                      <span className={isOverDailyLimit ? 'text-rose-600 font-black' : 'text-slate-800'}>
                        {dayWorkload} waktu
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Workload Breakdown Legend */}
        <div className="mt-6 pt-6 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
          <div>
            <h4 className="font-black uppercase text-slate-700 tracking-wider mb-2">
              Pecahan Mengajar Mengikut Subjek:
            </h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(workloads.subjectCounts).map(([code, count]) => (
                <span
                  key={code}
                  className="px-2.5 py-1 bg-slate-100 border border-slate-300 rounded-lg font-bold text-slate-800 font-mono"
                >
                  {code}: <strong>{count} waktu</strong>
                </span>
              ))}
            </div>
          </div>

          <div className="text-right">
            <span className="text-[11px] text-slate-500 block">Sasaran Had Harian: Max 7 waktu</span>
            <span className="font-black text-sm text-slate-900">
              Jumlah Mingguan: {workloads.total} Waktu
            </span>
          </div>
        </div>

        {/* Signatures */}
        <div className="pt-8 mt-8 border-t border-slate-300 grid grid-cols-2 text-xs text-slate-600 font-sans">
          <div>
            <p>Tandatangan Guru:</p>
            <p className="mt-8 font-bold text-slate-900 uppercase">{selectedTeacher?.name}</p>
          </div>
          <div className="text-right">
            <p>Disahkan oleh Guru Besar:</p>
            <p className="mt-8 font-bold text-slate-900 uppercase">Guru Besar / PK Pentadbiran</p>
          </div>
        </div>
      </div>
    </div>
  );
};
