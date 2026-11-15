import React, { useState, useMemo, useEffect } from 'react';
import {
  DayOfWeek,
  DAYS_OF_WEEK,
  ScheduleGrid,
  getGradeDaySlots,
  checkIntervalOverlap,
} from './types';
import { db, auth } from '../../lib/firebase';
import { collection, doc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { useSchoolTenant } from '../../contexts/SchoolTenantContext';
import { belongsToSchool, normalizeActiveSchoolCode, scopedDocId } from '../../utils/schoolTenant';
import {
  TeacherDirectoryEntry,
  isKP2027Year1Active,
  parseTeacherCodes,
} from '../../utils/lampiranData';
import {
  AbsenceSyncSourceRecord,
  dateStrToDayOfWeek,
  detectAbsentTeachersForDate,
  generateAutoReliefPlan,
} from '../../utils/autoReliefEngine';
import {
  Users,
  Clock,
  CheckCircle2,
  UserCheck,
  Search,
  Printer,
  Sparkles,
  UserX,
  Calendar,
  Save,
  AlertTriangle,
} from 'lucide-react';

interface BilikGuruReliefViewProps {
  schedule: ScheduleGrid;
  academicYear: string;
  teacherMapping: { list: TeacherDirectoryEntry[] };
  displayMode: 'NUMBER' | 'CODE';
  schoolCode?: string;
  schoolName?: string;
}

export const BilikGuruReliefView: React.FC<BilikGuruReliefViewProps> = ({
  schedule,
  academicYear,
  teacherMapping,
  displayMode,
  schoolCode: propSchoolCode,
  schoolName: propSchoolName,
}) => {
  const tenant = useSchoolTenant();
  const activeSchoolCode = normalizeActiveSchoolCode(propSchoolCode || tenant.schoolCode);
  const activeSchoolName = propSchoolName || tenant.schoolName;

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return dateStrToDayOfWeek(`${y}-${m}-${d}`) || 'ISNIN';
  });
  const [selectedSlot, setSelectedSlot] = useState<string>('W1');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Kehadiran Staf & Surat Masuk Live Sync state
  const [absenceRecords, setAbsenceRecords] = useState<AbsenceSyncSourceRecord[]>([]);
  const [unavailabilityRecords, setUnavailabilityRecords] = useState<AbsenceSyncSourceRecord[]>([]);
  const [suratAlerts, setSuratAlerts] = useState<any[]>([]);
  const [staffDirectory, setStaffDirectory] = useState<
    Array<{ id?: string; uid?: string; name?: string; email?: string; code?: string }>
  >([]);
  const [manualAbsentToggles, setManualAbsentToggles] = useState<Record<string, boolean>>({});
  const [manualOverrides, setManualOverrides] = useState<Record<string, string>>({});
  const [saveBanner, setSaveBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [isSavingRelief, setIsSavingRelief] = useState(false);

  // Sync DayOfWeek automatically when selectedDate changes to a weekday
  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    setManualOverrides({});
    const mapped = dateStrToDayOfWeek(newDate);
    if (mapped) setSelectedDay(mapped);
  };

  // Load & subscribe Kehadiran Staf (`absence_records`, `staff_unavailability`, `relief_alerts_from_surat`, `personnel`, `users`)
  useEffect(() => {
    let isMounted = true;

    async function loadDirectory() {
      try {
        const [usersSnap, personnelSnap] = await Promise.all([
          getDocs(collection(db, 'users')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'personnel')).catch(() => ({ docs: [] })),
        ]);

        const dir: Array<{ id?: string; uid?: string; name?: string; email?: string; code?: string }> = [];
        personnelSnap.docs.forEach((d) => {
          const data = d.data() as any;
          if (!belongsToSchool(data, activeSchoolCode)) return;
          dir.push({
            id: d.id,
            uid: data.uid,
            name: data.name || data.fullName,
            email: data.email,
            code: data.code,
          });
        });
        usersSnap.docs.forEach((d) => {
          const data = d.data() as any;
          if (!belongsToSchool(data, activeSchoolCode)) return;
          dir.push({
            id: d.id,
            uid: data.uid || d.id,
            name: data.name,
            email: data.email,
            code: data.code,
          });
        });
        if (isMounted) setStaffDirectory(dir);
      } catch (err) {
        console.warn('Could not load staff directory for relief sync:', err);
      }
    }
    loadDirectory();

    // Real-time listener on absence_records (graceful fallback for non-admin user)
    let unsubAbsence = () => {};
    try {
      unsubAbsence = onSnapshot(
        collection(db, 'absence_records'),
        (snap) => {
          const list: AbsenceSyncSourceRecord[] = [];
          snap.forEach((d) => {
            const data = d.data() as any;
            if (belongsToSchool(data, activeSchoolCode)) {
              list.push({ id: d.id, ...data });
            }
          });
          if (isMounted) setAbsenceRecords(list);
        },
        () => {
          const uid = auth.currentUser?.uid;
          if (!uid) return;
          getDocs(query(collection(db, 'absence_records'), where('userId', '==', uid)))
            .then((snap) => {
              const list: AbsenceSyncSourceRecord[] = [];
              snap.forEach((d) => {
                const data = d.data() as any;
                if (belongsToSchool(data, activeSchoolCode)) {
                  list.push({ id: d.id, ...data });
                }
              });
              if (isMounted) setAbsenceRecords(list);
            })
            .catch(() => {});
        }
      );
    } catch {
      // Ignore subscription error
    }

    const unsubUnavail = onSnapshot(
      collection(db, 'staff_unavailability'),
      (snap) => {
        const list: AbsenceSyncSourceRecord[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          if (belongsToSchool(data, activeSchoolCode)) {
            list.push({ id: d.id, ...data });
          }
        });
        if (isMounted) setUnavailabilityRecords(list);
      },
      () => {}
    );

    const unsubAlerts = onSnapshot(
      collection(db, 'relief_alerts_from_surat'),
      (snap) => {
        const list: any[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          if (belongsToSchool(data, activeSchoolCode)) {
            list.push({ id: d.id, ...data });
          }
        });
        if (isMounted) setSuratAlerts(list);
      },
      () => {}
    );

    return () => {
      isMounted = false;
      unsubAbsence();
      unsubUnavail();
      unsubAlerts();
    };
  }, [activeSchoolCode]);

  const detectedAbsentTeachers = useMemo(
    () =>
      detectAbsentTeachersForDate({
        dateStr: selectedDate,
        teacherMapping,
        staffDirectory,
        absenceRecords,
        unavailabilityRecords,
        suratAlerts,
      }),
    [selectedDate, teacherMapping, staffDirectory, absenceRecords, unavailabilityRecords, suratAlerts]
  );

  // Merge auto-detected absent teachers with manual toggles
  const effectiveAbsentCodes = useMemo(() => {
    const set = new Set<string>(detectedAbsentTeachers.map((d) => d.teacherCode));
    Object.entries(manualAbsentToggles).forEach(([code, isAbs]) => {
      if (isAbs) set.add(code);
      else set.delete(code);
    });
    return Array.from(set);
  }, [detectedAbsentTeachers, manualAbsentToggles]);

  const autoReliefPlan = useMemo(
    () =>
      generateAutoReliefPlan({
        schedule,
        academicYear,
        dateStr: selectedDate,
        dayOverride: selectedDay,
        absentTeacherCodes: effectiveAbsentCodes,
        teacherMapping,
        detectedAbsentTeachers,
        manualOverrides,
      }),
    [
      schedule,
      academicYear,
      selectedDate,
      selectedDay,
      effectiveAbsentCodes,
      teacherMapping,
      detectedAbsentTeachers,
      manualOverrides,
    ]
  );

  const slotsForDay = useMemo(() => {
    return getGradeDaySlots(2, selectedDay, academicYear).filter((s) => !s.isRecess);
  }, [selectedDay, academicYear]);

  // Fixed teacherActivityMap: properly splits co-teaching cells (e.g. NCY/VY, SW/MFA) AND resolves Tahun 1 PKAR
  const teacherActivityMap = useMemo(() => {
    const map: Record<string, Record<string, { isTeaching: boolean; details?: string; grade?: number }>> = {};
    const isT1Shifted = isKP2027Year1Active(academicYear);

    teacherMapping.list.forEach((t) => {
      map[t.code] = {};
    });

    // SELASA W1 PN
    if (selectedDay === 'SELASA') {
      teacherMapping.list.forEach((t) => {
        map[t.code]['W1'] = { isTeaching: true, grade: 0, details: 'PN' };
      });
    }

    [1, 2, 3, 4, 5, 6].forEach((grade) => {
      const gradeSlots = getGradeDaySlots(grade, selectedDay, academicYear);
      gradeSlots.forEach((s) => {
        if (s.isRecess) return;

        let cell = schedule[grade]?.[selectedDay]?.[s.slotId];
        if (s.slotId === 'PKAR' && isT1Shifted && !cell?.teacherCode) {
          const w4Cell = schedule[1]?.[selectedDay]?.['W4'];
          if (w4Cell?.teacherCode && w4Cell.subjectCode?.toUpperCase() !== 'PN') {
            cell = {
              subjectId: 'pkar',
              subjectCode: 'PKAR',
              subjectName: 'PROGRAM PEMBENTUKAN KARAKTER',
              teacherCode: w4Cell.teacherCode,
              periodLength: 0.5,
            };
          }
        }

        if (!cell || !cell.teacherCode || cell.subjectCode?.toUpperCase() === 'PN') return;
        const tCodes = parseTeacherCodes(cell.teacherCode);

        tCodes.forEach((tCode) => {
          if (!map[tCode]) map[tCode] = {};
          slotsForDay.forEach((refSlot) => {
            if (checkIntervalOverlap(s.startMinutes, s.endMinutes, refSlot.startMinutes, refSlot.endMinutes)) {
              const existing = map[tCode][refSlot.slotId];
              const tag = s.slotId === 'PKAR' ? 'PKAR(T1)' : `T.${grade} ${cell.subjectCode}`;
              map[tCode][refSlot.slotId] = {
                isTeaching: true,
                grade,
                details: existing?.details ? `${existing.details} + ${tag}` : tag,
              };
            }
          });
        });
      });
    });

    return map;
  }, [schedule, selectedDay, academicYear, teacherMapping, slotsForDay]);

  const freeTeachersForSelectedSlot = useMemo(() => {
    const absentSet = new Set(effectiveAbsentCodes);
    return teacherMapping.list.filter((t) => {
      if (absentSet.has(t.code)) return false;
      const act = teacherActivityMap[t.code]?.[selectedSlot];
      return !act || !act.isTeaching;
    });
  }, [teacherMapping, teacherActivityMap, selectedSlot, effectiveAbsentCodes]);

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

  const handleToggleTeacherAbsent = (code: string) => {
    const currentlyAbsent = effectiveAbsentCodes.includes(code);
    setManualAbsentToggles((prev) => ({
      ...prev,
      [code]: !currentlyAbsent,
    }));
  };

  const handleSaveReliefPlan = async (shouldPrintAfter: boolean = false) => {
    if (autoReliefPlan.slots.length === 0) return;
    try {
      setIsSavingRelief(true);
      setSaveBanner(null);
      const docId = scopedDocId(activeSchoolCode, `auto_relief_${selectedDate}`);
      const payload = {
        id: docId,
        schoolCode: activeSchoolCode,
        schoolName: activeSchoolName,
        date: selectedDate,
        dayOfWeek: selectedDay,
        academicYear,
        absentTeachers: autoReliefPlan.absentTeachers,
        assignments: autoReliefPlan.slots.map((s) => {
          const subObj = teacherMapping.list.find((t) => t.code === s.assignedSubstituteCode);
          return {
            slotKey: s.slotKey,
            grade: s.grade,
            className: s.classLabel,
            slotId: s.slotId,
            period: `${s.slotLabel} (${s.timeLabel})`,
            subjectCode: s.subjectCode,
            subjectName: s.subjectName,
            absentTeacherCodes: s.absentTeacherCodes,
            absentTeacherNames: s.absentTeacherNames,
            substituteTeacherCode: s.assignedSubstituteCode,
            substituteName: subObj?.name || 'BELUM DITETAPKAN',
          };
        }),
        updatedByUid: auth.currentUser?.uid || 'system',
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'relief_schedules', docId), payload, { merge: true });
      setSaveBanner({
        type: 'success',
        text: `Jadual Guru Ganti bagi ${selectedDate} (${selectedDay}) berjaya disimpan (${autoReliefPlan.summary.totalAutoAssigned}/${autoReliefPlan.summary.totalFlagged} waktu ditugaskan).`,
      });
      if (shouldPrintAfter) {
        setTimeout(() => window.print(), 150);
      }
    } catch (err: any) {
      setSaveBanner({
        type: 'error',
        text: `Gagal menyimpan jadual ganti: ${err?.message || 'Ralat pangkalan data'}`,
      });
    } finally {
      setIsSavingRelief(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Control Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Auto-Relief & BGuru
            </span>
            <span className="text-xs text-slate-400">
              Segerak Kehadiran Staf · Waktu Tahun 1 & PKAR Tepat
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
            Guru Ganti Automatik & Pemantauan Waktu Lapang
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Mengesan guru tidak hadir daripada Kehadiran Staf serta mencadangkan guru ganti bebas pertindihan masa dengan beban teringan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-700">
            <Calendar className="w-3.5 h-3.5 text-emerald-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="bg-transparent text-white font-mono text-xs font-bold outline-none cursor-pointer"
            />
          </div>

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

          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-blue-600/30 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak A4 Landskap</span>
          </button>
        </div>
      </div>

      {/* ================= SECTION 1: AUTO-RELIEF SYNC WITH KEHADIRAN STAF ================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5 print:bg-white print:text-black print:border print:border-black print:rounded-none print:shadow-none">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800 print:border-black">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl print:hidden">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-white print:text-black uppercase tracking-wider">
                Jadual Guru Ganti Automatik — {selectedDate} ({selectedDay})
              </h3>
              <p className="text-xs text-slate-400 print:text-slate-700">
                Disegerakkan dengan <strong className="text-slate-200 print:text-black">Kehadiran Staf</strong> ·{' '}
                {effectiveAbsentCodes.length} guru tidak hadir ·{' '}
                {autoReliefPlan.summary.totalFlagged} waktu terjejas ({autoReliefPlan.summary.year1MorningAndPkarCount} slot Tahun 1 Pagi/PKAR)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {autoReliefPlan.slots.length > 0 && (
              <>
                <button
                  type="button"
                  disabled={isSavingRelief}
                  onClick={() => handleSaveReliefPlan(false)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSavingRelief ? 'Menyimpan...' : 'Simpan Relief'}</span>
                </button>
                <button
                  type="button"
                  disabled={isSavingRelief}
                  onClick={() => handleSaveReliefPlan(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Simpan & Cetak Slip</span>
                </button>
              </>
            )}
          </div>
        </div>

        {saveBanner && (
          <div
            className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 print:hidden ${
              saveBanner.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
                : 'bg-rose-950/80 border-rose-700 text-rose-200'
            }`}
          >
            {saveBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{saveBanner.text}</span>
          </div>
        )}

        {/* Interactive Absent Teacher Selector (Auto-detected + Quick Toggle) */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3 print:hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5 uppercase">
              <UserX className="w-4 h-4" />
              <span>Guru Tidak Hadir (Segerak Kehadiran Staf / Klik Untuk Ubah Suai)</span>
            </span>
            {Object.keys(manualAbsentToggles).length > 0 && (
              <button
                type="button"
                onClick={() => setManualAbsentToggles({})}
                className="text-[11px] font-bold text-slate-400 hover:text-white underline cursor-pointer self-start sm:self-auto"
              >
                Tetap Semula Ikut Kehadiran Staf
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {teacherMapping.list.map((t) => {
              const isAbsent = effectiveAbsentCodes.includes(t.code);
              const detected = detectedAbsentTeachers.find((d) => d.teacherCode === t.code);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleToggleTeacherAbsent(t.code)}
                  title={
                    detected
                      ? `${t.name} — Rekod: ${detected.sources.join(', ')} (${detected.reasonSummary})`
                      : `Klik untuk tanda ${t.name} tidak hadir`
                  }
                  className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition cursor-pointer ${
                    isAbsent
                      ? 'bg-rose-600 border-rose-400 text-white shadow-sm shadow-rose-600/30'
                      : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {t.code} {detected ? '★' : ''}
                </button>
              );
            })}
          </div>

          {autoReliefPlan.absentTeachers.length > 0 && (
            <div className="text-[11px] text-slate-300 space-y-1 pt-1 border-t border-slate-800">
              {autoReliefPlan.absentTeachers.map((ab) => (
                <div key={ab.teacherCode} className="flex flex-wrap items-center gap-2">
                  <strong className="text-rose-300">
                    [{ab.teacherCode}] {ab.teacherName}
                  </strong>
                  <span className="text-slate-400">({ab.sources.join(', ')})</span>
                  <span className="text-slate-300">— {ab.reasonSummary}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Auto-Assigned Relief Schedule Table */}
        {autoReliefPlan.slots.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 print:text-slate-600 bg-slate-950/60 print:bg-slate-50 rounded-2xl border border-slate-800 print:border-slate-300">
            Tiada waktu mengajar yang terjejas pada tarikh ini. Pilih guru tidak hadir di atas atau rekod ketidakhadiran dalam <strong className="text-slate-200 print:text-black">Kehadiran Staf</strong> untuk menjana jadual guru ganti automatik.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse border border-slate-700 print:border-black">
              <thead>
                <tr className="bg-slate-950 text-slate-300 print:bg-slate-100 print:text-black font-black uppercase text-[10px]">
                  <th className="py-2.5 px-3 border border-slate-700 print:border-black">Masa / Waktu</th>
                  <th className="py-2.5 px-3 border border-slate-700 print:border-black">Kelas</th>
                  <th className="py-2.5 px-3 border border-slate-700 print:border-black">Subjek</th>
                  <th className="py-2.5 px-3 border border-slate-700 print:border-black">Guru Tidak Hadir</th>
                  <th className="py-2.5 px-3 border border-slate-700 print:border-black">Guru Ganti Disyorkan (Sifar Pertindihan)</th>
                  <th className="py-2.5 px-3 border border-slate-700 print:border-black hidden print:table-cell w-24 text-center">
                    T.Tangan
                  </th>
                </tr>
              </thead>
              <tbody>
                {autoReliefPlan.slots.map((slot) => {
                  const assignedObj = teacherMapping.list.find(
                    (t) => t.code === slot.assignedSubstituteCode
                  );
                  return (
                    <tr
                      key={slot.slotKey}
                      className={`border-b border-slate-800 print:border-black ${
                        slot.isPKAR
                          ? 'bg-emerald-950/25 print:bg-emerald-50'
                          : slot.isYear1ShiftedMorning
                          ? 'bg-amber-950/25 print:bg-amber-50'
                          : 'bg-slate-900/50 print:bg-white'
                      }`}
                    >
                      <td className="py-2.5 px-3 border border-slate-700 print:border-black font-mono">
                        <div className="font-black text-white print:text-black">{slot.slotLabel}</div>
                        <div
                          className={`text-[10px] font-bold ${
                            slot.isPKAR
                              ? 'text-emerald-400 print:text-emerald-800'
                              : slot.isYear1ShiftedMorning
                              ? 'text-amber-300 print:text-amber-800'
                              : 'text-slate-400 print:text-slate-700'
                          }`}
                        >
                          [{slot.timeLabel}]{slot.isPKAR ? ' (+0.5 Waktu)' : ''}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 border border-slate-700 print:border-black font-black text-white print:text-black">
                        {slot.classLabel}
                      </td>
                      <td className="py-2.5 px-3 border border-slate-700 print:border-black">
                        <div className="font-black text-blue-300 print:text-black">
                          {slot.subjectCode}
                        </div>
                        {slot.presentCoTeacherCodes.length > 0 && (
                          <div className="text-[10px] text-emerald-300 print:text-slate-700">
                            Rakan PdP hadir: {slot.presentCoTeacherCodes.join('/')}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 border border-slate-700 print:border-black font-bold text-rose-300 print:text-black">
                        {slot.absentTeacherCodes.join('/')} — {slot.absentTeacherNames.join(', ')}
                      </td>
                      <td className="py-2.5 px-3 border border-slate-700 print:border-black">
                        <div className="print:hidden">
                          {slot.recommendedCandidates.length === 0 ? (
                            <span className="text-rose-400 font-bold">
                              Tiada guru bebas bertindih masa
                            </span>
                          ) : (
                            <select
                              value={slot.assignedSubstituteCode}
                              onChange={(e) =>
                                setManualOverrides((prev) => ({
                                  ...prev,
                                  [slot.slotKey]: e.target.value,
                                }))
                              }
                              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-emerald-300 outline-none focus:border-emerald-500 cursor-pointer"
                            >
                              {slot.recommendedCandidates.map((cand, cIdx) => (
                                <option key={cand.code} value={cand.code}>
                                  {cIdx === 0 ? '★ ' : ''}[{cand.code}] {cand.name} · Beban: {cand.baseDayLoad}w → {cand.projectedDayLoad}w
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                        <div className="hidden print:block font-black text-black">
                          {assignedObj ? `[${assignedObj.code}] ${assignedObj.name}` : '-'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 border border-slate-700 print:border-black hidden print:table-cell">
                        &nbsp;
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================= SECTION 2: QUICK INTERACTIVE SLOT FINDER CARD ================= */}
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
                Semakan guru yang berkelapangan mengikut slot masa sebenar (termasuk Tahun 1 & PKAR).
              </p>
            </div>
          </div>

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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Guru Bebas ({freeTeachersForSelectedSlot.length} orang)</span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Beban Harian</span>
            </div>
            {freeTeachersForSelectedSlot.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-2">Tiada guru bebas pada waktu ini.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                {freeTeachersForSelectedSlot.map((t) => {
                  const load = autoReliefPlan.teacherProjectedDayLoads[t.code] ?? 0;
                  return (
                    <span
                      key={t.id}
                      className="px-2.5 py-1 bg-emerald-950/60 border border-emerald-700/60 text-emerald-200 rounded-lg text-xs font-bold"
                      title={t.name}
                    >
                      [{displayMode === 'CODE' ? t.code : t.num}] {t.name} ({load}w)
                    </span>
                  );
                })}
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

      {/* ================= SECTION 3: FULL BILIK GURU MATRIX TABLE ================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl overflow-hidden print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              <span>Matriks Jadual Mengajar Guru — Hari {selectedDay}</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Status mengajar bagi setiap guru pada setiap waktu (Sesi {academicYear})
            </p>
          </div>

          <div className="relative">
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
              <tr className="bg-slate-950 text-slate-300 font-black text-[11px] uppercase border-b border-slate-800 text-center">
                <th className="py-2.5 px-2 w-12 text-center border-r border-slate-800">No</th>
                <th className="py-2.5 px-2 w-14 text-center border-r border-slate-800">Kod</th>
                <th className="py-2.5 px-3 text-left w-48 border-r border-slate-800">Nama Guru</th>
                {slotsForDay.map((s) => (
                  <th key={s.slotId} className="py-2 px-1 border-r border-slate-800 w-16">
                    <div>{s.label}</div>
                    <div className="text-[9px] font-normal text-slate-500">{s.startTime}</div>
                  </th>
                ))}
                <th className="py-2 px-2 w-16 text-center">Beban</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredTeachers.map((t) => {
                const isAbsent = effectiveAbsentCodes.includes(t.code);
                const projectedLoad = autoReliefPlan.teacherProjectedDayLoads[t.code] ?? 0;

                return (
                  <tr
                    key={t.id}
                    className={isAbsent ? 'bg-rose-950/30' : 'hover:bg-slate-800/40'}
                  >
                    <td className="py-2 px-2 text-center text-slate-400 font-bold border-r border-slate-800">
                      {t.num}
                    </td>
                    <td className="py-2 px-2 text-center font-bold text-indigo-300 border-r border-slate-800">
                      {t.code}
                    </td>
                    <td
                      className="py-2 px-3 font-sans font-bold text-slate-200 truncate max-w-[180px] border-r border-slate-800"
                      title={t.name}
                    >
                      {t.name} {isAbsent && <span className="text-rose-400 text-[10px]">(TIDAK HADIR)</span>}
                    </td>

                    {slotsForDay.map((slot) => {
                      const act = teacherActivityMap[t.code]?.[slot.slotId];
                      const isTeaching = act && act.isTeaching;

                      return (
                        <td
                          key={slot.slotId}
                          className={`py-1.5 px-1 text-center border-r border-slate-800/60 ${
                            isAbsent && isTeaching
                              ? 'bg-rose-950/70 text-rose-300 font-black text-[10px]'
                              : isTeaching
                              ? 'bg-blue-950/60 text-blue-200 font-bold text-[10px]'
                              : 'bg-emerald-950/20 text-emerald-400/80 text-[10px]'
                          }`}
                        >
                          {isTeaching ? (isAbsent ? `GANTI: ${act.details}` : act.details) : 'BEBAS'}
                        </td>
                      );
                    })}

                    <td className="py-2 px-2 text-center font-bold text-slate-200">
                      {projectedLoad}w
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
