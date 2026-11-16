import React, { useEffect, useMemo, useState } from 'react';
import {
  Printer,
  Calendar,
  UserX,
  UserCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  FileSpreadsheet,
  Save,
  ArrowLeftRight,
  Baby,
  MessageSquare,
  Copy,
  Check,
} from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import {
  DayOfWeek,
  DAYS_OF_WEEK,
  ScheduleGrid,
  getGradeDaySlots,
} from './types';
import {
  TeacherDirectoryEntry,
  getDesignatedPemulihanTeacherCode,
  isKP2027Year1Active,
  parseTeacherCodes,
  resolveCellPemulihanTeacher,
} from '../../utils/lampiranData';
import {
  AbsenceSyncSourceRecord,
  dateStrToDayOfWeek,
  detectAbsentTeachersForDate,
  generateAutoReliefPlan,
  buildFullDayWhatsAppReliefText,
} from '../../utils/autoReliefEngine';
import {
  PrasekolahTimetableDoc,
  normalizePrasekolahTimetableDoc,
} from '../../utils/prasekolahTimetable';
import { exportMasterTimetableToExcel } from '../../utils/timetableExport';
import { DEFAULT_SCHOOL_CODE, belongsToSchool, scopedDocId } from '../../utils/schoolTenant';

interface BilikGuruReliefViewProps {
  schedule: ScheduleGrid;
  academicYear: string;
  teacherMapping: {
    homerooms?: Record<number, string>;
    list: TeacherDirectoryEntry[];
  };
  isAdmin?: boolean;
  displayMode?: 'NUMBER' | 'CODE';
  schoolCode?: string;
  schoolName?: string;
  prasekolahTimetable?: PrasekolahTimetableDoc | null;
}

export const BilikGuruReliefView: React.FC<BilikGuruReliefViewProps> = ({
  schedule,
  academicYear,
  teacherMapping,
  isAdmin = true,
  schoolCode = DEFAULT_SCHOOL_CODE,
  schoolName = 'SJK (C) CHUNG HUA BALINGIAN',
  prasekolahTimetable: propPrasekolahTimetable = null,
}) => {
  const activeSchoolCode = schoolCode || DEFAULT_SCHOOL_CODE;
  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const [reliefDate, setReliefDate] = useState<string>(todayStr);
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(() => {
    return dateStrToDayOfWeek(todayStr) || 'ISNIN';
  });

  // Live absence data synced from Kehadiran Staf, Surat Masuk, and Relief Alerts
  const [absenceRecords, setAbsenceRecords] = useState<AbsenceSyncSourceRecord[]>([]);
  const [unavailabilityRecords, setUnavailabilityRecords] = useState<AbsenceSyncSourceRecord[]>([]);
  const [suratAlerts, setSuratAlerts] = useState<
    Array<{
      id?: string;
      startDate?: string;
      endDate?: string;
      absentTeacherIds?: string[];
      perkara?: string;
      noRujukanLuar?: string;
      status?: string;
    }>
  >([]);
  const [staffDirectory, setStaffDirectory] = useState<
    Array<{ id?: string; uid?: string; name?: string; email?: string; code?: string }>
  >([]);
  const [holidayDates, setHolidayDates] = useState<string[]>([]);
  const [fetchedPrasekolahDoc, setFetchedPrasekolahDoc] = useState<PrasekolahTimetableDoc | null>(null);

  // Manual toggle overrides & saved plan state
  const [manualAddedAbsentCodes, setManualAddedAbsentCodes] = useState<string[]>([]);
  const [manualExcludedAbsentCodes, setManualExcludedAbsentCodes] = useState<string[]>([]);
  const [manualSubstituteOverrides, setManualSubstituteOverrides] = useState<Record<string, string>>({});
  const [repaymentDateOverrides, setRepaymentDateOverrides] = useState<Record<string, string>>({});
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [savedPlanTimestamp, setSavedPlanTimestamp] = useState<string | null>(null);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);

  const uniqueTeacherMapping = useMemo(() => {
    const seen = new Set<string>();
    const list: TeacherDirectoryEntry[] = [];
    (teacherMapping.list || []).forEach((t) => {
      const code = (t.code || '').trim().toUpperCase();
      if (!code || seen.has(code)) return;
      seen.add(code);
      list.push({
        ...t,
        code,
        num: list.length + 1,
      });
    });
    return {
      homerooms: teacherMapping.homerooms,
      list,
    };
  }, [teacherMapping]);

  const effectivePrasekolahTimetable = useMemo(() => {
    if (propPrasekolahTimetable) return propPrasekolahTimetable;
    if (fetchedPrasekolahDoc) return fetchedPrasekolahDoc;
    const defaultGuru =
      uniqueTeacherMapping.list.find((t) => t.code === 'SW') || uniqueTeacherMapping.list[0];
    return normalizePrasekolahTimetableDoc(null, {
      id: scopedDocId(activeSchoolCode, `prasekolah_${academicYear}`),
      schoolCode: activeSchoolCode,
      academicYear,
      guruPrasekolahCode: defaultGuru?.code || 'SW',
      guruPrasekolahName: defaultGuru?.name || 'STEPHANIE WONG ENG HEE',
      ppmName: 'PPM Prasekolah',
    });
  }, [propPrasekolahTimetable, fetchedPrasekolahDoc, activeSchoolCode, academicYear, uniqueTeacherMapping.list]);

  // Subscribe to Firestore collections for real-time Kehadiran Staf + Prasekolah + Holiday sync
  useEffect(() => {
    const unsubAbsence = onSnapshot(
      collection(db, 'absence_records'),
      (snap) => {
        setAbsenceRecords(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as AbsenceSyncSourceRecord & { schoolCode?: string }) }))
            .filter((d) => belongsToSchool(d, activeSchoolCode))
        );
      },
      (err) => console.warn('BilikGuruReliefView absence_records listener warning:', err)
    );

    const unsubUnavail = onSnapshot(
      collection(db, 'staff_unavailability'),
      (snap) => {
        setUnavailabilityRecords(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as AbsenceSyncSourceRecord & { schoolCode?: string }) }))
            .filter((d) => belongsToSchool(d, activeSchoolCode))
        );
      },
      (err) => console.warn('BilikGuruReliefView staff_unavailability listener warning:', err)
    );

    const unsubAlerts = onSnapshot(
      collection(db, 'relief_alerts_from_surat'),
      (snap) => {
        setSuratAlerts(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Record<string, any>) }))
            .filter((d) => belongsToSchool(d, activeSchoolCode))
        );
      },
      (err) => console.warn('BilikGuruReliefView relief_alerts listener warning:', err)
    );

    const unsubStaff = onSnapshot(
      collection(db, 'staff_directory'),
      (snap) => {
        setStaffDirectory((prev) => {
          const filteredPrev = prev.filter((item: any) => item.__src !== 'staff_directory');
          const next = snap.docs
            .map((d) => ({ id: d.id, __src: 'staff_directory', ...(d.data() as Record<string, any>) }))
            .filter((d) => belongsToSchool(d, activeSchoolCode));
          return [...filteredPrev, ...next];
        });
      },
      (err) => console.warn('BilikGuruReliefView staff_directory listener warning:', err)
    );

    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        setStaffDirectory((prev) => {
          const filteredPrev = prev.filter((item: any) => item.__src !== 'users');
          const next = snap.docs
            .map((d) => ({ id: d.id, uid: d.id, __src: 'users', ...(d.data() as Record<string, any>) }))
            .filter((d) => belongsToSchool(d, activeSchoolCode));
          return [...filteredPrev, ...next];
        });
      },
      (err) => console.warn('BilikGuruReliefView users listener warning:', err)
    );

    const unsubPersonnel = onSnapshot(
      collection(db, 'personnel'),
      (snap) => {
        setStaffDirectory((prev) => {
          const filteredPrev = prev.filter((item: any) => item.__src !== 'personnel');
          const next = snap.docs
            .map((d) => ({ id: d.id, __src: 'personnel', ...(d.data() as Record<string, any>) }))
            .filter((d) => belongsToSchool(d, activeSchoolCode));
          return [...filteredPrev, ...next];
        });
      },
      (err) => console.warn('BilikGuruReliefView personnel listener warning:', err)
    );

    const unsubCalendar = onSnapshot(
      collection(db, 'school_calendar'),
      (snap) => {
        const dates: string[] = [];
        snap.docs.forEach((d) => {
          const data = d.data() as {
            schoolCode?: string;
            date?: string;
            startDate?: string;
            endDate?: string;
            type?: string;
            category?: string;
          };
          if (!belongsToSchool(data, activeSchoolCode)) return;
          const cat = ((data.type || data.category || '') as string).toUpperCase();
          if (cat.includes('CUTI') || cat.includes('HOLIDAY')) {
            if (data.date) dates.push(data.date);
            if (data.startDate) dates.push(data.startDate);
          }
        });
        setHolidayDates(dates);
      },
      () => {}
    );

    const praDocId = scopedDocId(activeSchoolCode, `prasekolah_${academicYear}`);
    const unsubPrasekolah = onSnapshot(
      doc(db, 'prasekolah_timetables', praDocId),
      (snap) => {
        if (snap.exists()) {
          const defaultGuru =
            teacherMapping.list.find((t) => t.code === 'SW') || teacherMapping.list[0];
          setFetchedPrasekolahDoc(
            normalizePrasekolahTimetableDoc(snap.data() as Partial<PrasekolahTimetableDoc>, {
              id: praDocId,
              schoolCode: activeSchoolCode,
              academicYear,
              guruPrasekolahCode: defaultGuru?.code || 'SW',
              guruPrasekolahName: defaultGuru?.name || 'STEPHANIE WONG ENG HEE',
            })
          );
        }
      },
      () => {}
    );

    return () => {
      unsubAbsence();
      unsubUnavail();
      unsubAlerts();
      unsubStaff();
      unsubUsers();
      unsubPersonnel();
      unsubCalendar();
      unsubPrasekolah();
    };
  }, [activeSchoolCode, academicYear, teacherMapping.list]);

  // Load saved daily relief overrides when reliefDate changes
  useEffect(() => {
    if (!reliefDate) return;
    const mappedDay = dateStrToDayOfWeek(reliefDate);
    if (mappedDay) {
      setSelectedDay(mappedDay);
    }
    setManualAddedAbsentCodes([]);
    setManualExcludedAbsentCodes([]);
    setManualSubstituteOverrides({});
    setRepaymentDateOverrides({});
    setSavedPlanTimestamp(null);

    const unsubPlan = onSnapshot(
      doc(db, 'daily_relief_plans', scopedDocId(activeSchoolCode, reliefDate)),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.manualSubstituteOverrides && typeof data.manualSubstituteOverrides === 'object') {
            setManualSubstituteOverrides(data.manualSubstituteOverrides as Record<string, string>);
          }
          if (data.repaymentDateOverrides && typeof data.repaymentDateOverrides === 'object') {
            setRepaymentDateOverrides(data.repaymentDateOverrides as Record<string, string>);
          }
          if (Array.isArray(data.manualAddedAbsentCodes)) {
            setManualAddedAbsentCodes(data.manualAddedAbsentCodes as string[]);
          }
          if (Array.isArray(data.manualExcludedAbsentCodes)) {
            setManualExcludedAbsentCodes(data.manualExcludedAbsentCodes as string[]);
          }
          if (typeof data.updatedAt === 'string') {
            setSavedPlanTimestamp(data.updatedAt);
          }
        }
      },
      () => {}
    );
    return () => unsubPlan();
  }, [reliefDate, activeSchoolCode]);

  // Auto-detect absent teachers from Kehadiran Staf / Surat Masuk / Relief Alerts
  const autoDetectedTeachers = useMemo(() => {
    return detectAbsentTeachersForDate({
      dateStr: reliefDate,
      teacherMapping,
      staffDirectory,
      absenceRecords,
      unavailabilityRecords,
      suratAlerts,
    });
  }, [reliefDate, teacherMapping, staffDirectory, absenceRecords, unavailabilityRecords, suratAlerts]);

  // Combine auto-detected codes with manual toggles
  const effectiveAbsentCodes = useMemo(() => {
    const set = new Set<string>();
    autoDetectedTeachers.forEach((d) => set.add(d.teacherCode));
    manualAddedAbsentCodes.forEach((c) => set.add(c));
    manualExcludedAbsentCodes.forEach((c) => set.delete(c));
    return Array.from(set);
  }, [autoDetectedTeachers, manualAddedAbsentCodes, manualExcludedAbsentCodes]);

  // Run the Auto-Relief Engine (with Priority 1 Same-Class Lesson Swap & Isolated Prasekolah Relief)
  const reliefPlan = useMemo(() => {
    return generateAutoReliefPlan({
      schedule,
      academicYear,
      dateStr: reliefDate,
      dayOverride: selectedDay,
      absentTeacherCodes: effectiveAbsentCodes,
      teacherMapping,
      staffDirectory,
      detectedAbsentTeachers: autoDetectedTeachers,
      manualOverrides: manualSubstituteOverrides,
      repaymentDateOverrides,
      prasekolahTimetable: effectivePrasekolahTimetable,
      holidayDates,
      absenceRecords,
      unavailabilityRecords,
      suratAlerts,
    });
  }, [
    schedule,
    academicYear,
    reliefDate,
    selectedDay,
    effectiveAbsentCodes,
    teacherMapping,
    staffDirectory,
    autoDetectedTeachers,
    manualSubstituteOverrides,
    repaymentDateOverrides,
    effectivePrasekolahTimetable,
    holidayDates,
    absenceRecords,
    unavailabilityRecords,
    suratAlerts,
  ]);

  // Quick lookup for rendering relief badges on the Master Board below
  const reliefSlotByGradeAndSlotId = useMemo(() => {
    const map = new Map<string, (typeof reliefPlan.slots)[number]>();
    reliefPlan.slots.forEach((s) => {
      if (!s.isPrasekolah) {
        map.set(`${s.grade}__${s.slotId}`, s);
      }
    });
    return map;
  }, [reliefPlan]);

  const toggleAbsentTeacher = (code: string) => {
    const isCurrentlyAbsent = effectiveAbsentCodes.includes(code);
    const isAuto = autoDetectedTeachers.some((d) => d.teacherCode === code);

    if (isCurrentlyAbsent) {
      if (isAuto) {
        setManualExcludedAbsentCodes((prev) => Array.from(new Set([...prev, code])));
      }
      setManualAddedAbsentCodes((prev) => prev.filter((c) => c !== code));
    } else {
      setManualExcludedAbsentCodes((prev) => prev.filter((c) => c !== code));
      if (!isAuto) {
        setManualAddedAbsentCodes((prev) => Array.from(new Set([...prev, code])));
      }
    }
  };

  const handleSelectSubstitute = (slotKey: string, subCode: string) => {
    setManualSubstituteOverrides((prev) => ({
      ...prev,
      [slotKey]: subCode,
    }));
  };

  const handleChangeRepaymentDate = (slotKey: string, newDate: string) => {
    setRepaymentDateOverrides((prev) => ({
      ...prev,
      [slotKey]: newDate,
    }));
  };

  const handleSaveDailyReliefPlan = async () => {
    if (!reliefDate) return;
    setIsSavingPlan(true);
    try {
      const nowIso = new Date().toISOString();
      await setDoc(
        doc(db, 'daily_relief_plans', scopedDocId(activeSchoolCode, reliefDate)),
        {
          schoolCode: activeSchoolCode,
          dateStr: reliefDate,
          day: selectedDay,
          academicYear,
          effectiveAbsentCodes,
          manualAddedAbsentCodes,
          manualExcludedAbsentCodes,
          manualSubstituteOverrides,
          repaymentDateOverrides,
          slots: reliefPlan.slots.map((s) => ({
            slotKey: s.slotKey,
            grade: s.grade,
            classLabel: s.classLabel,
            slotId: s.slotId,
            slotLabel: s.slotLabel,
            timeLabel: s.timeLabel,
            subjectCode: s.subjectCode,
            subjectName: s.subjectName,
            absentTeacherCodes: s.absentTeacherCodes,
            assignedSubstituteCode: s.assignedSubstituteCode,
            assignedSubstituteName: s.assignedSubstituteName || '',
            reliefMode: s.reliefMode,
            reliefModeLabel: s.reliefModeLabel,
            requiresRepayment: s.requiresRepayment,
            substituteTeachingSubjectCode: s.substituteTeachingSubjectCode || s.subjectCode,
            repaymentDate: s.repaymentDate || '',
            repaymentDay: s.repaymentDay || '',
            repaymentSlotId: s.repaymentSlotId || '',
            repaymentSlotLabel: s.repaymentSlotLabel || '',
            repaymentTimeLabel: s.repaymentTimeLabel || '',
            repaymentSubjectCode: s.repaymentSubjectCode || '',
            periodLength: s.periodLength,
          })),
          updatedAt: nowIso,
        },
        { merge: true }
      );
      setSavedPlanTimestamp(nowIso);
    } catch (err) {
      console.error('Failed to save daily relief plan:', err);
    } finally {
      setIsSavingPlan(false);
    }
  };

  const isT1Shifted = isKP2027Year1Active(academicYear);
  const isFriday = selectedDay === 'JUMAAT';
  const isMonTue = selectedDay === 'ISNIN' || selectedDay === 'SELASA';

  const guruPemulihanCode = useMemo(
    () => getDesignatedPemulihanTeacherCode(teacherMapping.list),
    [teacherMapping.list]
  );

  const masterColumns = useMemo(() => {
    const cols: {
      id: string;
      headerTop: string;
      headerSub: string;
      headerT1Sub?: string;
      t1SlotId?: string;
      t26SlotId?: string;
      isRecess?: boolean;
      isPkar?: boolean;
      isMembaca?: boolean;
      isTasmik?: boolean;
    }[] = [];

    if (isT1Shifted) {
      cols.push({
        id: 'MEMBACA',
        headerTop: 'MEMBACA',
        headerSub: '07:15 - 07:30',
        headerT1Sub: '(T1)',
        t1SlotId: 'MEMBACA',
        isMembaca: true,
      });
    }

    cols.push(
      {
        id: 'COL_1',
        headerTop: 'W1',
        headerSub: '07:15 - 07:45',
        headerT1Sub: isT1Shifted ? '(T1: 07:30 - 08:00)' : undefined,
        t1SlotId: 'W1',
        t26SlotId: 'W1',
      },
      {
        id: 'COL_2',
        headerTop: 'W2',
        headerSub: '07:45 - 08:15',
        headerT1Sub: isT1Shifted ? '(T1: 08:00 - 08:30)' : undefined,
        t1SlotId: 'W2',
        t26SlotId: 'W2',
      },
      {
        id: 'COL_3',
        headerTop: 'W3',
        headerSub: '08:15 - 08:45',
        headerT1Sub: isT1Shifted ? '(T1: 08:30 - 09:00)' : undefined,
        t1SlotId: 'W3',
        t26SlotId: 'W3',
      },
      {
        id: 'COL_4',
        headerTop: 'W4',
        headerSub: '08:45 - 09:15',
        headerT1Sub: isT1Shifted ? '(T1: 09:00 - 09:30)' : undefined,
        t1SlotId: 'W4',
        t26SlotId: 'W4',
      },
      {
        id: 'COL_5',
        headerTop: 'W5',
        headerSub: '09:15 - 09:45',
        headerT1Sub: isT1Shifted ? '(T2–T6)' : undefined,
        t1SlotId: isT1Shifted ? undefined : 'W5',
        t26SlotId: 'W5',
      }
    );

    if (isT1Shifted) {
      cols.push({
        id: 'PKAR',
        headerTop: 'PKAR',
        headerSub: '09:30 - 09:45',
        headerT1Sub: '(T1: PKAR 09:30 - 09:45)',
        t1SlotId: 'PKAR',
        isPkar: true,
      });
    }

    cols.push({
      id: 'REHAT',
      headerTop: 'REHAT',
      headerSub: '09:45 - 10:15',
      t1SlotId: 'REHAT',
      t26SlotId: 'REHAT',
      isRecess: true,
    });

    cols.push(
      { id: 'COL_6', headerTop: isT1Shifted ? 'W6 (T1:W5)' : 'W6', headerSub: '10:15 - 10:45', t1SlotId: isT1Shifted ? 'W5' : 'W6', t26SlotId: 'W6' },
      { id: 'COL_7', headerTop: isT1Shifted ? 'W7 (T1:W6)' : 'W7', headerSub: '10:45 - 11:15', t1SlotId: isT1Shifted ? 'W6' : 'W7', t26SlotId: 'W7' }
    );

    if (isFriday) {
      cols.push({
        id: 'COL_8',
        headerTop: isT1Shifted ? 'W8 (T1:W7)' : 'W8',
        headerSub: '11:15 - 11:45',
        t1SlotId: isT1Shifted ? 'W7' : undefined,
        t26SlotId: 'W8',
      });
    } else {
      cols.push(
        { id: 'COL_8', headerTop: isT1Shifted ? 'W8 (T1:W7)' : 'W8', headerSub: '11:15 - 11:45', t1SlotId: isT1Shifted ? 'W7' : 'W8', t26SlotId: 'W8' },
        { id: 'COL_9', headerTop: isT1Shifted ? 'W9 (T1:W8)' : 'W9', headerSub: '11:45 - 12:15', t1SlotId: isT1Shifted ? 'W8' : 'W9', t26SlotId: 'W9' },
        { id: 'COL_10', headerTop: isT1Shifted ? 'W10 (T1:W9)' : 'W10', headerSub: '12:15 - 12:45', t1SlotId: isT1Shifted ? 'W9' : 'W10', t26SlotId: 'W10' }
      );
      if (isMonTue) {
        cols.push({
          id: 'COL_11',
          headerTop: isT1Shifted ? 'W11 (T1:W10)' : 'W11',
          headerSub: '12:45 - 13:15',
          t1SlotId: isT1Shifted ? 'W10' : 'W11',
          t26SlotId: 'W11',
        });
      }
    }

    cols.push({
      id: 'TASMIK',
      headerTop: 'TASMIK',
      headerSub: isFriday ? '11:15 / 11:45' : isMonTue ? '13:15 - 13:45' : '12:45 - 13:15',
      t1SlotId: 'TASMIK',
      t26SlotId: 'TASMIK',
      isTasmik: true,
    });

    return cols;
  }, [isT1Shifted, isFriday, isMonTue]);

  const teacherNameMap = useMemo(
    () => new Map(teacherMapping.list.map((t) => [t.code, t.name])),
    [teacherMapping.list]
  );

  const fullWhatsAppText = useMemo(
    () => buildFullDayWhatsAppReliefText(reliefPlan, schoolName),
    [reliefPlan, schoolName]
  );

  const handleCopyWhatsApp = async (textToCopy: string) => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedWhatsApp(true);
      setTimeout(() => setCopiedWhatsApp(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="space-y-6">
      {/* ===================================================================== */}
      {/* TOP PANEL: AUTO-RELIEF SYNC + TUKAR WAKTU KELAS SAMA + PRASEKOLAH     */}
      {/* ===================================================================== */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5 print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Auto-Sync Kehadiran Staf
              </span>
              <span className="px-2.5 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-[10px] font-bold flex items-center gap-1">
                <ArrowLeftRight className="w-3 h-3" />
                Keutamaan 1: Tukar Waktu Kelas Sama & Tarikh Pulang Balik
              </span>
              <span className="px-2.5 py-0.5 rounded-md bg-teal-500/15 border border-teal-500/30 text-teal-300 text-[10px] font-bold flex items-center gap-1">
                <Baby className="w-3 h-3" />
                Prasekolah: Ganti Sehala (Tiada Pulang Balik)
              </span>
            </div>
            <h3 className="text-base font-black text-white tracking-tight mt-1">
              Jadual Guru Ganti Automatik (Bilik Guru & Relief Harian)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Mengutamakan <strong>Tukar Waktu Kelas Sama (2-Hala)</strong> beserta <strong>Tarikh Pulang Balik</strong> bagi kelas Tahun 1–6, dan <strong>Ganti Sehala (Tidak Perlu Pulang Balik)</strong> bagi Prasekolah & ganti biasa.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Date Picker */}
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
              <Calendar className="w-4 h-4 text-indigo-400" />
              <div className="flex flex-col">
                <span className="text-[9px] font-bold uppercase text-slate-500">Tarikh Relief</span>
                <input
                  type="date"
                  value={reliefDate}
                  onChange={(e) => setReliefDate(e.target.value)}
                  className="bg-transparent text-xs font-bold text-white focus:outline-none"
                />
              </div>
            </div>

            {/* Day Selector */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              {DAYS_OF_WEEK.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    selectedDay === day
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() =>
                exportMasterTimetableToExcel({
                  schedule,
                  academicYear,
                  schoolName,
                  schoolCode: activeSchoolCode,
                  classTeachers: teacherMapping.homerooms || {},
                  matrixData: [],
                  teacherMapping,
                  displayMode: 'CODE',
                })
              }
              className="px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Eksport Excel</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition-all cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-indigo-400" />
              <span>Cetak A4</span>
            </button>
          </div>
        </div>

        {/* Auto-Detected Absent Teachers & Manual Toggles */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <div className="lg:col-span-7 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                <UserX className="w-4 h-4 text-rose-400" />
                <span>
                  Guru Tidak Hadir Pada <span className="text-white">{reliefDate}</span> ({selectedDay}):
                </span>
              </div>
              {(manualAddedAbsentCodes.length > 0 ||
                manualExcludedAbsentCodes.length > 0 ||
                Object.keys(manualSubstituteOverrides).length > 0 ||
                Object.keys(repaymentDateOverrides).length > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setManualAddedAbsentCodes([]);
                    setManualExcludedAbsentCodes([]);
                    setManualSubstituteOverrides({});
                    setRepaymentDateOverrides({});
                  }}
                  className="text-[11px] font-bold text-slate-400 hover:text-rose-400 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Reset Pilihan Manual</span>
                </button>
              )}
            </div>

            {/* Teacher Pill Selector */}
            <div className="flex flex-wrap gap-1.5">
              {uniqueTeacherMapping.list.map((t, idx) => {
                const isAbsent = effectiveAbsentCodes.includes(t.code);
                const autoEntry = autoDetectedTeachers.find((d) => d.teacherCode === t.code);
                const isPraGuru =
                  effectivePrasekolahTimetable?.guruPrasekolahCode?.toUpperCase() ===
                  t.code.toUpperCase();
                return (
                  <button
                    key={`${t.id || t.code}_${idx}`}
                    type="button"
                    onClick={() => toggleAbsentTeacher(t.code)}
                    title={
                      autoEntry
                        ? `Auto-Sync (${autoEntry.sources.join(', ')}): ${autoEntry.reasonSummary}`
                        : `${t.name} — Klik untuk tanda tidak hadir`
                    }
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                      isAbsent
                        ? 'bg-rose-600 text-white border-rose-400 shadow-lg shadow-rose-600/25'
                        : autoEntry
                        ? 'bg-rose-950/40 text-rose-300 border-rose-500/40'
                        : 'bg-slate-800/70 text-slate-300 border-slate-700/70 hover:border-slate-600 hover:text-white'
                    }`}
                  >
                    <span>{t.code}</span>
                    <span className="text-[10px] opacity-80 hidden sm:inline">
                      ({t.name.split(' ')[0]})
                    </span>
                    {isPraGuru && (
                      <span className="px-1 py-0.2 rounded bg-teal-400/25 text-[9px] font-black uppercase">
                        PRA
                      </span>
                    )}
                    {autoEntry && (
                      <span className="px-1.5 py-0.2 rounded bg-black/30 text-[9px] font-black uppercase tracking-wider">
                        AUTO
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Active Absence Details Banner */}
            {reliefPlan.absentTeachers.length > 0 ? (
              <div className="bg-rose-950/30 border border-rose-500/30 rounded-xl p-3 space-y-1.5">
                <div className="text-[11px] font-black uppercase tracking-wider text-rose-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                  <span>Senarai Guru Tidak Hadir ({reliefPlan.absentTeachers.length} Orang):</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {reliefPlan.absentTeachers.map((at, idx) => (
                    <div
                      key={`${at.teacherCode}_${idx}`}
                      className="flex items-center justify-between bg-slate-950/70 border border-rose-500/20 rounded-lg px-2.5 py-1.5 text-xs"
                    >
                      <div>
                        <span className="font-black text-rose-300">{at.teacherCode}</span>
                        <span className="text-slate-300 ml-1.5 font-semibold">{at.teacherName}</span>
                        <div className="text-[10px] text-slate-400">{at.reasonSummary}</div>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[9px] font-bold">
                        {at.sources.join(' + ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-3 flex items-center gap-2.5 text-xs text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Semua guru hadir pada <strong>{reliefDate}</strong> ({selectedDay}). Anda juga boleh klik mana-mana kod guru di atas untuk simulasi / jadual ganti manual.
                </span>
              </div>
            )}
          </div>

          {/* Workload & Relief Summary Cards */}
          <div className="lg:col-span-5 bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                Bebanan Waktu Hari {selectedDay} (Asal → Selepas Ganti)
              </span>
              <span className="text-[10px] font-bold text-indigo-400">Had Maksimum: ≤ 8 Waktu</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto pr-1">
              {uniqueTeacherMapping.list.map((t, idx) => {
                const isAbsent = effectiveAbsentCodes.includes(t.code);
                const base = reliefPlan.teacherBaseDayLoads[t.code] || 0;
                const proj = reliefPlan.teacherProjectedDayLoads[t.code] || 0;
                const delta = Math.round((proj - base) * 10) / 10;

                return (
                  <div
                    key={`${t.id || t.code}_load_${idx}`}
                    className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center justify-between ${
                      isAbsent
                        ? 'bg-rose-950/30 border-rose-500/30 text-rose-400 line-through opacity-60'
                        : delta > 0
                        ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                        : 'bg-slate-900 border-slate-800 text-slate-300'
                    }`}
                  >
                    <span className="font-black">{t.code}</span>
                    <span className="font-mono text-[11px]">
                      {base}
                      {delta > 0 ? (
                        <strong className="text-emerald-400 ml-1">→ {proj}</strong>
                      ) : (
                        <span className="text-slate-500 ml-1">w</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>

            {reliefPlan.slots.length > 0 && (
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-bold">
                      🔄 Tukar Waktu: {reliefPlan.summary.sameClassSwapCount}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold">
                      ✅ Ganti Biasa: {reliefPlan.summary.standardOneWayCount}
                    </span>
                    {reliefPlan.summary.prasekolahReliefCount > 0 && (
                      <span className="px-2 py-0.5 rounded bg-teal-500/20 border border-teal-500/40 text-teal-300 font-bold">
                        🧸 Prasekolah: {reliefPlan.summary.prasekolahReliefCount}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setShowWhatsAppModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>WhatsApp Slip & Pulang Balik</span>
                  </button>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={handleSaveDailyReliefPlan}
                      disabled={isSavingPlan}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{isSavingPlan ? 'Menyimpan...' : 'Simpan Pelan Relief'}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
            {savedPlanTimestamp && (
              <div className="text-[10px] text-emerald-400 text-right">
                Disimpan: {new Date(savedPlanTimestamp).toLocaleTimeString('ms-MY')}
              </div>
            )}
          </div>
        </div>

        {/* ===================================================================== */}
        {/* AUTO-RELIEF ASSIGNMENT TABLE (WITH TUKAR WAKTU & TARIKH PULANG BALIK) */}
        {/* ===================================================================== */}
        {reliefPlan.slots.length > 0 && (
          <div className="space-y-2.5 pt-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-indigo-300 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-400" />
                <span>
                  Senarai Penugasan Guru Ganti & Tukar Waktu Kelas Sama ({reliefPlan.slots.length} Slot)
                </span>
              </h4>
              <span className="text-[11px] text-slate-400">
                Keutamaan 1: Guru Kelas Sama (Tukar Waktu 2-Hala + Tarikh Pulang Balik) · Keutamaan 2: Ganti Biasa / Prasekolah (Tiada Pulang Balik)
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950/90 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <th className="py-2.5 px-3">Masa Sebenar</th>
                    <th className="py-2.5 px-3">Kelas & Slot</th>
                    <th className="py-2.5 px-3">Subjek Asal / Aktiviti</th>
                    <th className="py-2.5 px-3">Guru Tidak Hadir</th>
                    <th className="py-2.5 px-3">Mod Ganti & Subjek Diajar Hari Ini</th>
                    <th className="py-2.5 px-3">Tarikh Pulang Balik (2-Hala)</th>
                    <th className="py-2.5 px-3">Guru Ganti Ditugaskan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-xs">
                  {reliefPlan.slots.map((slot) => {
                    const chosenCand = slot.recommendedCandidates.find(
                      (c) => c.code === slot.assignedSubstituteCode
                    );
                    const isSwap = slot.reliefMode === 'TUKAR_WAKTU_KELAS_SAMA';
                    const isPra = slot.reliefMode === 'GANTI_PRASEKOLAH';

                    return (
                      <tr
                        key={slot.slotKey}
                        className={
                          isPra
                            ? 'bg-teal-950/20 hover:bg-teal-950/30'
                            : isSwap
                            ? 'bg-indigo-950/20 hover:bg-indigo-950/30'
                            : slot.isPKAR || slot.isYear1ShiftedMorning || slot.isMembaca
                            ? 'bg-amber-950/15 hover:bg-amber-950/25'
                            : 'bg-slate-900/50 hover:bg-slate-800/40'
                        }
                      >
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-200 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            <span>{slot.timeLabel}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            ({slot.periodLength} Waktu)
                          </div>
                        </td>

                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`font-black ${
                                isPra ? 'text-teal-300' : 'text-white'
                              }`}
                            >
                              {slot.classLabel}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold text-[10px]">
                              {slot.slotLabel}
                            </span>
                            {slot.isPKAR && (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-black text-[9px]">
                                PKAR 15m
                              </span>
                            )}
                          </div>
                          {isPra && slot.ppmName && (
                            <div className="text-[10px] text-teal-400/90 mt-0.5">
                              PPM Pembantu: {slot.ppmName}
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-3">
                          <span className="font-black text-indigo-300">{slot.subjectCode}</span>
                          <div className="text-[10px] text-slate-400 leading-tight">
                            {slot.subjectName}
                          </div>
                        </td>

                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap items-center gap-1">
                            {slot.absentTeacherCodes.map((ac) => (
                              <span
                                key={ac}
                                className="px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 font-black text-[11px]"
                              >
                                {ac} ({teacherNameMap.get(ac)?.split(' ')[0] || ac})
                              </span>
                            ))}
                          </div>
                        </td>

                        {/* Mod Ganti & Subjek Diajar Hari Ini */}
                        <td className="py-2.5 px-3">
                          {isSwap ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/20 border border-indigo-400/40 text-indigo-200 text-[10px] font-black uppercase tracking-wide">
                                <ArrowLeftRight className="w-3 h-3 text-indigo-300" />
                                Tukar Waktu Kelas Sama
                              </span>
                              <div className="text-[11px] text-slate-200">
                                Hari ini{' '}
                                <strong className="text-emerald-300">
                                  {slot.assignedSubstituteCode}
                                </strong>{' '}
                                masuk ajar subjek{' '}
                                <strong className="text-amber-300">
                                  {slot.substituteTeachingSubjectCode || slot.subjectCode}
                                </strong>
                              </div>
                            </div>
                          ) : isPra ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-500/20 border border-teal-400/40 text-teal-200 text-[10px] font-black uppercase tracking-wide">
                                <Baby className="w-3 h-3 text-teal-300" />
                                Ganti Prasekolah (Tidak Perlu Pulang Balik)
                              </span>
                              <div className="text-[10px] text-slate-400">
                                Ganti Sehala · Kawal Selia Prasekolah bersama PPM
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-bold">
                                Ganti Biasa (Tidak Perlu Pulang Balik)
                              </span>
                              <div className="text-[10px] text-slate-400">
                                Ganti Sehala · Tiada guru kelas sama yang lapang
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Tarikh Pulang Balik (Editable Date Picker for Tukar Waktu Kelas Sama) */}
                        <td className="py-2.5 px-3">
                          {isSwap ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="date"
                                  value={slot.repaymentDate || ''}
                                  min={reliefDate}
                                  onChange={(e) =>
                                    handleChangeRepaymentDate(slot.slotKey, e.target.value)
                                  }
                                  className="bg-slate-950 border border-indigo-500/50 rounded-lg px-2 py-1 text-[11px] font-bold text-indigo-200 focus:outline-none focus:border-indigo-400"
                                />
                                {slot.repaymentDay && (
                                  <span className="px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/30 text-[9px] font-black">
                                    {slot.repaymentDay}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-indigo-300 leading-tight">
                                Waktu Pulang:{' '}
                                <strong>
                                  {slot.repaymentSlotLabel} ({slot.repaymentTimeLabel})
                                </strong>{' '}
                                →{' '}
                                <strong className="text-white">
                                  {slot.absentTeacherCodes[0]}
                                </strong>{' '}
                                masuk ajar{' '}
                                <strong className="text-amber-300">
                                  {slot.repaymentSubjectCode || slot.subjectCode}
                                </strong>
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] font-semibold text-slate-500 italic">
                              Tidak Perlu Pulang Balik
                            </span>
                          )}
                        </td>

                        {/* Substitute Teacher Selector */}
                        <td className="py-2.5 px-3">
                          {slot.recommendedCandidates.length > 0 ? (
                            <div className="space-y-1">
                              <select
                                value={slot.assignedSubstituteCode}
                                onChange={(e) =>
                                  handleSelectSubstitute(slot.slotKey, e.target.value)
                                }
                                className="bg-slate-950 border border-emerald-500/40 rounded-lg px-2.5 py-1.5 text-xs font-bold text-emerald-300 focus:outline-none focus:border-emerald-400 w-full max-w-xs"
                              >
                                {slot.recommendedCandidates.map((cand, idx) => {
                                  const modeTag =
                                    cand.reliefMode === 'TUKAR_WAKTU_KELAS_SAMA' &&
                                    cand.repaymentInfo
                                      ? `🔄 TUKAR WAKTU (Ajar ${cand.repaymentInfo.substituteOriginalSubjectCode} · Pulang ${cand.repaymentInfo.repaymentDate})`
                                      : slot.isPrasekolah
                                      ? '🧸 Ganti Prasekolah (Tiada Pulang Balik)'
                                      : 'Ganti Biasa (Tiada Pulang Balik)';
                                  return (
                                    <option key={`${cand.code}_${idx}`} value={cand.code}>
                                      {idx === 0 ? '★ ' : ''}
                                      {cand.code} — {cand.name} [{modeTag}] (Asal: {cand.baseDayLoad}w →{' '}
                                      {cand.projectedDayLoad}w)
                                    </option>
                                  );
                                })}
                              </select>
                              {chosenCand && (
                                <div className="text-[10px] text-slate-400">
                                  Beban Hari Ini: <strong>{chosenCand.baseDayLoad}w</strong> →{' '}
                                  <strong className="text-emerald-400">
                                    {chosenCand.projectedDayLoad}w
                                  </strong>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-rose-400 font-bold text-xs">
                              Tiada guru lapang pada {slot.timeLabel}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* MODAL WHATSAPP SLIP & TARIKH PULANG BALIK                             */}
      {/* ===================================================================== */}
      {showWhatsAppModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 print:hidden">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-black text-white uppercase">
                  Notifikasi WhatsApp Jadual Guru Ganti & Tarikh Pulang Balik
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowWhatsAppModal(false)}
                className="text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Tutup
              </button>
            </div>

            <pre className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-slate-200 font-mono whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed">
              {fullWhatsAppText}
            </pre>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handleCopyWhatsApp(fullWhatsAppText)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                {copiedWhatsApp ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-300">Disalin ke Papan Klip!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-indigo-400" />
                    <span>Salin Teks WhatsApp</span>
                  </>
                )}
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(fullWhatsAppText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5 shadow-lg shadow-emerald-600/20"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Hantar Ke Kumpulan WhatsApp Sekolah</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* PAPAN INDUK BILIK GURU (TAHUN 1 - TAHUN 6) + CETAKAN SLIP RELIEF A4   */}
      {/* ===================================================================== */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 overflow-x-auto print:bg-white print:text-black print:border-black print:p-2">
        <div className="hidden print:block text-center mb-4 border-b border-black pb-2">
          <h1 className="text-sm font-bold uppercase">
            {schoolName} — PAPAN INDUK JADUAL WAKTU & SLIP GURU GANTI ({academicYear})
          </h1>
          <p className="text-xs font-bold">
            TARIKH: {reliefDate} | HARI: {selectedDay}
            {reliefPlan.absentTeachers.length > 0 &&
              ` | GURU TIDAK HADIR: ${reliefPlan.absentTeachers.map((a) => `${a.teacherCode} (${a.teacherName})`).join(', ')}`}
          </p>
        </div>

        {/* Print-only Summary Table of Relief + Tukar Waktu & Tarikh Pulang Balik */}
        {reliefPlan.slots.length > 0 && (
          <div className="hidden print:block mb-4">
            <h2 className="text-xs font-bold uppercase mb-1">
              SENARAI PENUGASAN GURU GANTI & TUKAR WAKTU KELAS SAMA ({reliefDate} - {selectedDay})
            </h2>
            <table className="w-full border-collapse border border-black text-[10px] mb-3">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-black p-1">Masa</th>
                  <th className="border border-black p-1">Kelas & Slot</th>
                  <th className="border border-black p-1">Subjek Asal</th>
                  <th className="border border-black p-1">Guru Tidak Hadir</th>
                  <th className="border border-black p-1">Guru Ganti & Mod Ganti</th>
                  <th className="border border-black p-1">Tarikh Pulang Balik (Jika Tukar Waktu)</th>
                  <th className="border border-black p-1 w-20">Tandatangan</th>
                </tr>
              </thead>
              <tbody>
                {reliefPlan.slots.map((s) => (
                  <tr key={s.slotKey}>
                    <td className="border border-black p-1 text-center font-bold">{s.timeLabel}</td>
                    <td className="border border-black p-1 text-center font-bold">
                      {s.classLabel} ({s.slotLabel})
                    </td>
                    <td className="border border-black p-1 text-center">
                      {s.subjectCode} — {s.subjectName}
                    </td>
                    <td className="border border-black p-1 text-center">
                      {s.absentTeacherCodes.join(', ')}
                    </td>
                    <td className="border border-black p-1 text-center font-bold">
                      <div>
                        {s.assignedSubstituteCode} (
                        {teacherNameMap.get(s.assignedSubstituteCode) || s.assignedSubstituteCode})
                      </div>
                      <div className="text-[9px] font-normal">
                        {s.reliefMode === 'TUKAR_WAKTU_KELAS_SAMA'
                          ? `Tukar Waktu Kelas Sama (Ajar ${s.substituteTeachingSubjectCode || s.subjectCode})`
                          : s.reliefModeLabel}
                      </div>
                    </td>
                    <td className="border border-black p-1 text-center">
                      {s.reliefMode === 'TUKAR_WAKTU_KELAS_SAMA' && s.repaymentDate
                        ? `${s.repaymentDate} (${s.repaymentDay}) · ${s.repaymentSlotLabel} (${s.repaymentTimeLabel}) — ${s.absentTeacherCodes[0]} ajar ${s.repaymentSubjectCode || s.subjectCode}`
                        : 'Tidak Perlu Pulang Balik'}
                    </td>
                    <td className="border border-black p-1"></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between mb-4 print:hidden">
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-bold">
              HARI: {selectedDay}
            </span>
            <span className="text-xs text-slate-400">
              Waktu Tamat: {isFriday ? '11:45 (T1–T3) / 12:15 (T4–T6)' : isMonTue ? '13:15' : '12:45 (T1) / 13:15 (T2–T6)'}
            </span>
          </div>
        </div>

        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-900 text-slate-300 print:bg-slate-100 print:text-black">
              <th className="border border-slate-800 print:border-black p-2.5 text-left w-28">KELAS</th>
              <th className="border border-slate-800 print:border-black p-2.5 text-left w-28">GURU KELAS</th>
              {masterColumns.map((col) => (
                <th
                  key={col.id}
                  className={`border border-slate-800 print:border-black p-2 text-center ${
                    col.isRecess
                      ? 'bg-amber-950/30 text-amber-300 w-16'
                      : col.isPkar
                      ? 'bg-emerald-950/30 text-emerald-300 w-20'
                      : col.isMembaca
                      ? 'bg-indigo-950/30 text-indigo-300 w-20'
                      : col.isTasmik
                      ? 'bg-teal-950/30 text-teal-300 w-24'
                      : ''
                  }`}
                >
                  <div className="font-bold">{col.headerTop}</div>
                  <div className="text-[9px] text-slate-300 print:text-black font-semibold leading-tight">{col.headerSub}</div>
                  {col.headerT1Sub && (
                    <div className="text-[8px] text-teal-300 print:text-black font-bold leading-tight">{col.headerT1Sub}</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6].map((grade) => {
              const isYear1Row = grade === 1 && isT1Shifted;
              const homeroomName = teacherMapping.homerooms?.[grade] || '-';

              return (
                <tr key={grade} className="hover:bg-slate-900/40 transition-colors">
                  <td className="border border-slate-800 print:border-black p-2.5 font-bold text-white print:text-black bg-slate-900/60 print:bg-white">
                    <div className="flex items-center justify-between">
                      <span>Tahun {grade}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 print:border print:border-black print:text-black">
                        {isYear1Row ? 'KP2027' : 'KSSR'}
                      </span>
                    </div>
                  </td>
                  <td className="border border-slate-800 print:border-black p-2.5 text-slate-300 print:text-black font-medium">
                    {homeroomName}
                  </td>

                  {masterColumns.map((col) => {
                    if (col.isRecess) {
                      return (
                        <td
                          key={col.id}
                          className="border border-slate-800 print:border-black p-2 text-center bg-amber-950/20 text-amber-300 print:text-black font-bold text-[10px]"
                        >
                          REHAT
                        </td>
                      );
                    }

                    const slotId = isYear1Row ? col.t1SlotId : col.t26SlotId;
                    if (!slotId) {
                      return (
                        <td
                          key={col.id}
                          className="border border-slate-800 print:border-black p-2 text-center bg-slate-950/80 text-slate-700"
                        >
                          —
                        </td>
                      );
                    }

                    const validGradeSlots = getGradeDaySlots(grade, selectedDay, academicYear);
                    const isValidForGrade = validGradeSlots.some((s) => s.slotId === slotId);
                    if (!isValidForGrade) {
                      return (
                        <td
                          key={col.id}
                          className="border border-slate-800 print:border-black p-2 text-center bg-slate-950/80 text-slate-700"
                        >
                          —
                        </td>
                      );
                    }

                    const rawCell = schedule[grade]?.[selectedDay]?.[slotId];
                    const w4Cell =
                      isYear1Row && slotId === 'PKAR' ? schedule[1]?.[selectedDay]?.['W4'] : null;
                    const cell =
                      isYear1Row && slotId === 'PKAR'
                        ? {
                            subjectId: 'pkar',
                            subjectCode: 'PKAR',
                            subjectName: 'PROGRAM PEMBENTUKAN KARAKTER',
                            teacherCode:
                              rawCell?.teacherCode?.trim() ||
                              (w4Cell && w4Cell.subjectCode !== 'PN' ? w4Cell.teacherCode : '') ||
                              '-',
                            periodLength: 0.5,
                            isLocked: true,
                          }
                        : rawCell;

                    const reliefItem = reliefSlotByGradeAndSlotId.get(`${grade}__${slotId}`);
                    const cellTeachers = parseTeacherCodes(cell?.teacherCode);
                    const hasAbsentTeacher = Boolean(reliefItem);

                    return (
                      <td
                        key={col.id}
                        className={`border border-slate-800 print:border-black p-2 text-center transition-all ${
                          hasAbsentTeacher
                            ? reliefItem?.reliefMode === 'TUKAR_WAKTU_KELAS_SAMA'
                              ? 'bg-indigo-950/60 border-indigo-500/60 ring-1 ring-indigo-500/40'
                              : 'bg-rose-950/60 border-rose-500/60 ring-1 ring-rose-500/40'
                            : col.isPkar
                            ? 'bg-emerald-950/20'
                            : col.isMembaca
                            ? 'bg-indigo-950/20'
                            : col.isTasmik
                            ? 'bg-teal-950/20'
                            : ''
                        }`}
                      >
                        {cell && cell.subjectCode ? (
                          <div className="space-y-0.5">
                            <div className="font-black text-white print:text-black tracking-tight">
                              {cell.subjectCode}
                            </div>
                            <div
                              className={`text-[10px] font-bold ${
                                hasAbsentTeacher
                                  ? 'text-rose-300 line-through print:text-black'
                                  : 'text-indigo-300 print:text-black'
                              }`}
                            >
                              {cell.teacherCode}
                            </div>
                            {hasAbsentTeacher && reliefItem && (
                              <div
                                className={`mt-1 px-1.5 py-0.5 rounded text-white font-black text-[9px] shadow print:bg-white print:text-black print:border print:border-black ${
                                  reliefItem.reliefMode === 'TUKAR_WAKTU_KELAS_SAMA'
                                    ? 'bg-indigo-600'
                                    : 'bg-emerald-600'
                                }`}
                              >
                                {reliefItem.reliefMode === 'TUKAR_WAKTU_KELAS_SAMA'
                                  ? `TUKAR: ${reliefItem.assignedSubstituteCode || '?'} (${reliefItem.substituteTeachingSubjectCode})`
                                  : `GANTI: ${reliefItem.assignedSubstituteCode || 'TIADA'}`}
                              </div>
                            )}
                            {!hasAbsentTeacher && cellTeachers.length > 1 && (
                              <div className="text-[8px] text-slate-400">Co-Teach</div>
                            )}
                            {cell.isPemulihan && (
                              <div className="text-[8px] font-black text-emerald-300 print:text-black">
                                {cell.subjectCode.toUpperCase() === 'MT' ? 'PMT' : 'PBM'}
                                {(() => {
                                  const pemT = resolveCellPemulihanTeacher(cell, guruPemulihanCode);
                                  return pemT ? ` (${pemT})` : '';
                                })()}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-700">-</span>
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
};
