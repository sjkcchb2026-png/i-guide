import React, { useState, useEffect, useMemo } from 'react';
import {
  Bell,
  Clock,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  UserCheck,
  Users,
  Search,
  Printer,
  ChevronRight,
  Sparkles,
  ArrowRight,
  Mail,
  ShieldCheck,
  FileSpreadsheet,
  X,
  Send,
  ArrowLeftRight,
  Baby,
  MessageSquare,
  Copy,
  Check
} from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  setDoc,
  getDoc,
  getDocs
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { UserProfile, SchoolSettings } from '../types';
import { BilikGuruReliefView } from './Timetable/BilikGuruReliefView';
import { ScheduleGrid } from './Timetable/types';
import { createEmptyScheduleGrid } from './Timetable/autoScheduler';
import { useSchoolTenant } from '../contexts/SchoolTenantContext';
import { belongsToSchool, isLegacyDefaultSchool, scopedDocId } from '../utils/schoolTenant';
import { OFFICIAL_TEACHERS, generateTeacherShortCode } from '../constants/officialRoster';
import {
  AbsenceSyncSourceRecord,
  AutoReliefSlotItem,
  StaffDirectoryRecord,
  buildTeacherIdentifierIndex,
  dateStrToDayOfWeek,
  detectAbsentTeachersForDate,
  formatCleanAbsentTeacherNames,
  generateAutoReliefPlan,
  sanitizeAbsentTeacherInput,
} from '../utils/autoReliefEngine';
import {
  PrasekolahTimetableDoc,
  normalizePrasekolahTimetableDoc,
} from '../utils/prasekolahTimetable';
import { useAcademicAccessControl } from '../utils/academicAccessControl';

export interface ReliefAlertRecord {
  id: string;
  suratId?: string;
  reliefScheduleId?: string;
  perkara: string;
  noRujukanLuar: string;
  startDate: string;
  endDate: string;
  absentTeacherIds: string[];
  affectedClasses: Array<{
    teacherId: string;
    classId: string;
    className: string;
    subjectCode: string;
    subjectName: string;
    weeklyPeriods: number;
  }>;
  status: 'PERLU_JADUAL_GANTI' | 'SELESAI_DIJADUAL';
  createdAt: string;
}

export interface ReliefPeriodAssignment {
  slotId: string;
  timeLabel: string;
  grade: number;
  className: string;
  subjectCode: string;
  absentTeacherName: string;
  substituteTeacherId: string;
  substituteTeacherName: string;
}

interface ReliefSchedulingViewProps {
  currentUser?: UserProfile | null;
  schoolSettings?: SchoolSettings | null;
  onNavigateToSuratMasuk?: () => void;
}

export const ReliefSchedulingView: React.FC<ReliefSchedulingViewProps> = ({
  currentUser,
  schoolSettings,
  onNavigateToSuratMasuk,
}) => {
  const { schoolCode: activeSchoolCode, schoolName: tenantSchoolName } = useSchoolTenant();
  const [alerts, setAlerts] = useState<ReliefAlertRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedAlert, setSelectedAlert] = useState<ReliefAlertRecord | null>(null);
  const [activeTab, setActiveTab] = useState<'ALERTS' | 'BGURU_MONITOR' | 'HISTORY'>('ALERTS');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  const isLegacySchool = isLegacyDefaultSchool(activeSchoolCode);

  // Teachers directory
  const [teacherList, setTeacherList] = useState<
    Array<{
      id: string;
      uid?: string;
      masterStaffId?: string;
      aliasIds: string[];
      name: string;
      email: string;
      code: string;
      phone?: string;
    }>
  >([]);
  const [scheduleGrid, setScheduleGrid] = useState<ScheduleGrid>(createEmptyScheduleGrid());
  const [prasekolahTimetable, setPrasekolahTimetable] = useState<PrasekolahTimetableDoc | null>(null);
  const [activeAcademicYear, setActiveAcademicYear] = useState<string>('2027');
  const accessProfile = useAcademicAccessControl(currentUser, activeAcademicYear, activeSchoolCode);
  const isAcademicAdmin = accessProfile.isAcademicAdmin;
  const [absenceRecords, setAbsenceRecords] = useState<AbsenceSyncSourceRecord[]>([]);
  const [unavailabilityRecords, setUnavailabilityRecords] = useState<AbsenceSyncSourceRecord[]>([]);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Modal for Scheduling
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState<boolean>(false);
  const [activeAlertForSchedule, setActiveAlertForSchedule] = useState<ReliefAlertRecord | null>(null);
  const [activeAutoSlots, setActiveAutoSlots] = useState<AutoReliefSlotItem[]>([]);
  const [slotAssignments, setSlotAssignments] = useState<Record<string, string>>({}); // key: slotKey or classId_period -> substituteTeacherId/code
  const [slotRepaymentDates, setSlotRepaymentDates] = useState<Record<string, string>>({}); // key: slotKey -> YYYY-MM-DD Tarikh Pulang Balik
  const [submittingSchedule, setSubmittingSchedule] = useState<boolean>(false);
  const [copiedSlipWhatsApp, setCopiedSlipWhatsApp] = useState<boolean>(false);

  // Print slip state
  const [printSlipData, setPrintSlipData] = useState<{
    date: string;
    absentTeacher: string;
    reason: string;
    letterRef: string;
    assignments: Array<{
      period: string;
      className: string;
      subject: string;
      substituteName: string;
      reliefModeLabel?: string;
      repaymentDetails?: string;
    }>;
  } | null>(null);

  // 1. Subscribe to relief_alerts_from_surat
  useEffect(() => {
    const q = query(collection(db, 'relief_alerts_from_surat'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ReliefAlertRecord[] = [];
        snap.forEach((d) => {
          const data = d.data() as Omit<ReliefAlertRecord, 'id'>;
          if (belongsToSchool(data, activeSchoolCode)) {
            list.push({ id: d.id, ...data });
          }
        });
        setAlerts(list);
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to relief_alerts_from_surat:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [activeSchoolCode]);

  // 2. Fetch Teachers, Timetable Schedule, and Kehadiran Staf absence_records from Firestore
  useEffect(() => {
    let isMounted = true;
    async function loadDirectoryAndSchedule() {
      try {
        const [
          usersSnap,
          personnelSnap,
          masterTeachersSnap,
          staffDirSnap,
          timetableSnap,
          absSnap,
          unavailSnap,
          praSnap,
        ] = await Promise.all([
          getDocs(collection(db, 'users')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'personnel')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'master_teachers')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'staff_directory')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'school_timetables')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'absence_records')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'staff_unavailability')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'prasekolah_timetables')).catch(() => ({ docs: [] })),
        ]);

        type MergedTeacher = {
          id: string;
          uid?: string;
          masterStaffId?: string;
          aliasIds: string[];
          name: string;
          email: string;
          code: string;
          phone?: string;
        };
        const map = new Map<string, MergedTeacher>();
        const seenCodes = new Set<string>();

        const addOrMergeTeacher = (entry: {
          id: string;
          uid?: string;
          masterStaffId?: string;
          aliasIds?: string[];
          name: string;
          email: string;
          code: string;
          phone?: string;
        }) => {
          const cleanCode = (entry.code || '').trim().toUpperCase();
          const cleanEmail = (entry.email || '').trim().toLowerCase();
          const cleanNameUpper = (entry.name || '').replace(/\s+/g, ' ').trim().toUpperCase();
          const incomingAliases = [
            entry.id,
            entry.uid,
            entry.masterStaffId,
            entry.code,
            ...(entry.aliasIds || []),
          ]
            .filter(Boolean)
            .map((a) => String(a).trim());

          const existing = Array.from(map.values()).find(
            (p) =>
              (cleanCode && p.code === cleanCode) ||
              (cleanEmail && p.email.trim().toLowerCase() === cleanEmail) ||
              (entry.id && (p.id === entry.id || p.aliasIds.includes(entry.id))) ||
              (entry.uid && (p.uid === entry.uid || p.aliasIds.includes(entry.uid))) ||
              (cleanNameUpper &&
                cleanNameUpper.length >= 3 &&
                (p.name.toUpperCase() === cleanNameUpper ||
                  p.name.toUpperCase().includes(cleanNameUpper) ||
                  cleanNameUpper.includes(p.name.toUpperCase())))
          );

          if (existing) {
            const aliasSet = new Set<string>([...existing.aliasIds, ...incomingAliases]);
            existing.aliasIds = Array.from(aliasSet);
            if (!existing.uid && entry.uid) existing.uid = entry.uid;
            if (!existing.masterStaffId && entry.masterStaffId) {
              existing.masterStaffId = entry.masterStaffId;
            }
            if (!existing.email && entry.email) existing.email = entry.email;
            if (!existing.phone && entry.phone) existing.phone = entry.phone;
            return;
          }

          if (!cleanCode || seenCodes.has(cleanCode)) return;
          seenCodes.add(cleanCode);
          map.set(entry.id, {
            id: entry.id,
            uid: entry.uid,
            masterStaffId: entry.masterStaffId,
            aliasIds: Array.from(new Set(incomingAliases)),
            name: entry.name,
            email: entry.email,
            code: cleanCode,
            phone: entry.phone,
          });
        };

        personnelSnap.docs.forEach((d) => {
          const data = d.data();
          if (!belongsToSchool(data, activeSchoolCode)) return;
          const cleanName = (data.name || data.fullName || d.id).replace(/\s+/g, ' ').trim();
          const code = data.code || generateTeacherShortCode(cleanName);
          addOrMergeTeacher({
            id: d.id,
            uid: data.uid || data.userId || undefined,
            masterStaffId: data.masterStaffId || data.staffId || undefined,
            aliasIds: [d.id, data.uid, data.userId, data.teacherId, data.masterStaffId, data.staffId].filter(Boolean),
            name: cleanName,
            email: data.email || '',
            code,
            phone: data.phone || data.mobilePhone || '',
          });
        });

        masterTeachersSnap.docs.forEach((d) => {
          const data = d.data();
          if (!belongsToSchool(data, activeSchoolCode)) return;
          const cleanName = (data.name || data.fullName || d.id).replace(/\s+/g, ' ').trim();
          const code = data.code || data.shortCode || generateTeacherShortCode(cleanName);
          addOrMergeTeacher({
            id: d.id,
            uid: data.uid || data.userId || undefined,
            masterStaffId: d.id,
            aliasIds: [d.id, data.uid, data.userId, data.teacherId, data.staffId].filter(Boolean),
            name: cleanName,
            email: data.email || '',
            code,
            phone: data.phone || data.mobilePhone || '',
          });
        });

        staffDirSnap.docs.forEach((d) => {
          const data = d.data();
          if (!belongsToSchool(data, activeSchoolCode)) return;
          const cleanName = (data.name || data.fullName || d.id).replace(/\s+/g, ' ').trim();
          const code = data.code || data.shortCode || generateTeacherShortCode(cleanName);
          addOrMergeTeacher({
            id: d.id,
            uid: data.uid || data.userId || undefined,
            masterStaffId: data.masterStaffId || d.id,
            aliasIds: [d.id, data.uid, data.userId, data.teacherId, data.masterStaffId].filter(Boolean),
            name: cleanName,
            email: data.email || '',
            code,
            phone: data.phone || data.mobilePhone || '',
          });
        });

        usersSnap.docs.forEach((d) => {
          const data = d.data();
          if (!belongsToSchool(data, activeSchoolCode)) return;
          const cleanName = (data.name || data.fullName || d.id).replace(/\s+/g, ' ').trim();
          addOrMergeTeacher({
            id: d.id,
            uid: data.uid || d.id,
            masterStaffId: data.masterStaffId || data.staffId || undefined,
            aliasIds: [d.id, data.uid, data.teacherId, data.masterStaffId, data.staffId].filter(Boolean),
            name: cleanName,
            email: data.email || '',
            code: data.code || generateTeacherShortCode(cleanName),
            phone: data.phone || '',
          });
        });

        if (isLegacySchool) {
          OFFICIAL_TEACHERS.forEach((ot) => {
            addOrMergeTeacher({
              id: ot.id,
              masterStaffId: ot.id,
              aliasIds: [ot.id, ot.code, ot.name],
              name: ot.name,
              email: ot.email,
              code: ot.code,
              phone: ot.phone || '',
            });
          });
        }

        const absList: AbsenceSyncSourceRecord[] = [];
        absSnap.docs.forEach((d) => {
          const data = d.data() as any;
          if (belongsToSchool(data, activeSchoolCode)) {
            absList.push({ id: d.id, ...data });
          }
        });

        const unavailList: AbsenceSyncSourceRecord[] = [];
        unavailSnap.docs.forEach((d) => {
          const data = d.data() as any;
          if (belongsToSchool(data, activeSchoolCode)) {
            unavailList.push({ id: d.id, ...data });
          }
        });

        // Load timetable schedule scoped to active school if exists (prefer schedule_2027, then schedule_*)
        let loadedSchedule: ScheduleGrid = createEmptyScheduleGrid();
        let resolvedYr = '2027';
        const scopedTimetableDocs = timetableSnap.docs.filter((d) => belongsToSchool(d.data(), activeSchoolCode));
        if (scopedTimetableDocs.length > 0) {
          const hasSchedulePayload = (d: any) => {
            const data = d.data();
            return Boolean(data && 'schedule' in data && data.schedule && Object.keys(data.schedule).length > 0);
          };
          const tDoc =
            scopedTimetableDocs.find((d) => d.id.includes('schedule_2027') && hasSchedulePayload(d)) ||
            scopedTimetableDocs.find((d) => d.id.includes('schedule_') && hasSchedulePayload(d)) ||
            scopedTimetableDocs.find((d) => hasSchedulePayload(d)) ||
            scopedTimetableDocs.find((d) => d.id.includes('schedule_2027')) ||
            scopedTimetableDocs.find((d) => d.id.includes('schedule_')) ||
            scopedTimetableDocs[0];
          const tData = tDoc.data();
          if (tData && 'schedule' in tData && tData.schedule) {
            loadedSchedule = tData.schedule as ScheduleGrid;
            if (typeof tData.academicYear === 'string' && tData.academicYear) {
              resolvedYr = tData.academicYear;
            }
          }
        }

        const scopedPraDocs = praSnap.docs.filter((d) => belongsToSchool(d.data(), activeSchoolCode));
        const loadedPraDoc =
          scopedPraDocs.length > 0
            ? normalizePrasekolahTimetableDoc(scopedPraDocs[0].data() as Partial<PrasekolahTimetableDoc>, {
                id: scopedPraDocs[0].id,
                schoolCode: activeSchoolCode,
                academicYear: resolvedYr,
                guruPrasekolahCode: isLegacySchool ? 'SW' : 'GPRA',
                guruPrasekolahName: isLegacySchool ? 'STEPHANIE WONG ENG HEE' : 'Guru Prasekolah',
              })
            : normalizePrasekolahTimetableDoc(null, {
                id: scopedDocId(activeSchoolCode, `prasekolah_${resolvedYr}`),
                schoolCode: activeSchoolCode,
                academicYear: resolvedYr,
                guruPrasekolahCode: isLegacySchool ? 'SW' : 'GPRA',
                guruPrasekolahName: isLegacySchool ? 'STEPHANIE WONG ENG HEE' : 'Guru Prasekolah',
              });

        if (isMounted) {
          setTeacherList(Array.from(map.values()));
          setScheduleGrid(loadedSchedule);
          setPrasekolahTimetable(loadedPraDoc);
          setActiveAcademicYear(resolvedYr);
          setAbsenceRecords(absList);
          setUnavailabilityRecords(unavailList);
        }
      } catch (err) {
        console.warn('Load teachers/schedule error in ReliefSchedulingView:', err);
      }
    }

    loadDirectoryAndSchedule();
    return () => {
      isMounted = false;
    };
  }, [activeSchoolCode, isLegacySchool]);

  const pendingAlerts = useMemo(() => {
    return alerts.filter((a) => a.status === 'PERLU_JADUAL_GANTI');
  }, [alerts]);

  const teacherMappingList = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{
      id: string;
      uid?: string;
      masterStaffId?: string;
      aliasIds: string[];
      email: string;
      num: number;
      code: string;
      name: string;
    }> = [];
    teacherList.forEach((t) => {
      const code = (t.code || '').trim().toUpperCase();
      if (!code || seen.has(code)) return;
      seen.add(code);
      list.push({
        id: t.id,
        uid: t.uid,
        masterStaffId: t.masterStaffId,
        aliasIds: t.aliasIds,
        email: t.email,
        num: list.length + 1,
        code,
        name: t.name,
      });
    });
    return {
      homerooms: {} as Record<number, string>,
      list,
    };
  }, [teacherList]);

  const resolveAbsentCodesForAlert = (alertItem: ReliefAlertRecord): string[] => {
    const staffDir: StaffDirectoryRecord[] = teacherList;
    const identifierIndex = buildTeacherIdentifierIndex(teacherMappingList.list, staffDir);
    const codeSet = new Set<string>();

    const detected = detectAbsentTeachersForDate({
      dateStr: alertItem.startDate,
      teacherMapping: teacherMappingList,
      staffDirectory: staffDir,
      absenceRecords,
      unavailabilityRecords,
      suratAlerts: [alertItem],
    });
    detected.forEach((d) => codeSet.add(d.teacherCode.toUpperCase()));

    // Also resolve directly from alertItem.absentTeacherIds regardless of date bounds
    const rawIdentifiers = [
      ...(alertItem.absentTeacherIds || []),
      ...(alertItem.affectedClasses || []).map((c) => c.teacherId).filter(Boolean),
    ];

    rawIdentifiers.forEach((raw) => {
      const parsed = sanitizeAbsentTeacherInput(raw);
      const candidates = [
        ...parsed.extractedCodes,
        ...parsed.extractedUids,
        ...parsed.extractedIds,
        ...parsed.extractedEmails,
        ...parsed.cleanNames,
        ...parsed.cleanNames.map((n) => generateTeacherShortCode(n)),
      ];
      candidates.forEach((cand) => {
        const upper = cand.trim().toUpperCase();
        if (!upper) return;
        const mapped = identifierIndex.get(upper) || identifierIndex.get(upper.replace(/^STAFF_/, ''));
        if (mapped) {
          codeSet.add(mapped);
        } else if (cand.length >= 3) {
          const bySubstr = teacherMappingList.list.find((t) => {
            const tn = t.name.replace(/\s+/g, ' ').trim().toUpperCase();
            return tn === upper || tn.includes(upper) || upper.includes(tn);
          });
          if (bySubstr) codeSet.add(bySubstr.code.toUpperCase());
        }
      });
    });

    return Array.from(codeSet);
  };

  // Handle opening 1-Click scheduling modal with REAL clock-overlap & Priority 1 Same-Class Lesson Swap + Prasekolah One-Way Relief
  const recomputeModalAutoSlots = (
    alertItem: ReliefAlertRecord,
    overridesMap: Record<string, string>,
    repaymentMap: Record<string, string>
  ) => {
    const detectedAbsent = detectAbsentTeachersForDate({
      dateStr: alertItem.startDate,
      teacherMapping: teacherMappingList,
      staffDirectory: teacherList,
      absenceRecords,
      unavailabilityRecords,
      suratAlerts: [alertItem],
    });
    const absentCodes = resolveAbsentCodesForAlert(alertItem);
    const plan = generateAutoReliefPlan({
      schedule: scheduleGrid,
      academicYear: activeAcademicYear,
      dateStr: alertItem.startDate,
      dayOverride: dateStrToDayOfWeek(alertItem.startDate) || 'ISNIN',
      absentTeacherCodes: absentCodes,
      teacherMapping: teacherMappingList,
      staffDirectory: teacherList,
      detectedAbsentTeachers: detectedAbsent,
      manualOverrides: overridesMap,
      repaymentDateOverrides: repaymentMap,
      prasekolahTimetable,
      absenceRecords,
      unavailabilityRecords,
      suratAlerts: [alertItem],
    });
    setActiveAutoSlots(plan.slots);
    return plan;
  };

  const handleOpenScheduleModal = (alertItem: ReliefAlertRecord) => {
    setErrorBanner(null);
    setActiveAlertForSchedule(alertItem);
    setSelectedAlert(alertItem);
    setSlotRepaymentDates({});

    const plan = recomputeModalAutoSlots(alertItem, {}, {});
    const resolvedAbsentCodes = new Set(resolveAbsentCodesForAlert(alertItem));

    const initialMap: Record<string, string> = {};
    const initialRepayMap: Record<string, string> = {};
    if (plan.slots.length > 0) {
      plan.slots.forEach((slot) => {
        initialMap[slot.slotKey] = slot.assignedSubstituteCode;
        if (slot.repaymentDate) {
          initialRepayMap[slot.slotKey] = slot.repaymentDate;
        }
      });
    } else {
      alertItem.affectedClasses.forEach((cls, i) => {
        const otherTeachers = teacherList.filter(
          (t) =>
            !resolvedAbsentCodes.has(t.code.toUpperCase()) &&
            !alertItem.absentTeacherIds.includes(t.id) &&
            !alertItem.absentTeacherIds.includes(t.name)
        );
        if (otherTeachers.length > 0) {
          const candidate = otherTeachers[i % otherTeachers.length];
          initialMap[`${cls.classId}_${cls.subjectCode}`] = candidate.id;
        }
      });
    }
    setSlotAssignments(initialMap);
    setSlotRepaymentDates(initialRepayMap);
    setIsScheduleModalOpen(true);
  };

  // Save 1-Click scheduled relief
  const handleSaveReliefSchedule = async () => {
    if (!activeAlertForSchedule) return;
    try {
      setSubmittingSchedule(true);
      setErrorBanner(null);
      const scheduleId = scopedDocId(activeSchoolCode, `relief_sched_${Date.now()}`);

      const assignments =
        activeAutoSlots.length > 0
          ? activeAutoSlots.map((slot) => {
              const assignedCode = slotAssignments[slot.slotKey] || slot.assignedSubstituteCode;
              const teacherObj = teacherList.find((t) => t.code === assignedCode || t.id === assignedCode);
              const repayDate = slotRepaymentDates[slot.slotKey] || slot.repaymentDate || '';
              const isSwap = slot.reliefMode === 'TUKAR_WAKTU_KELAS_SAMA';
              const repaymentDetails =
                isSwap && repayDate
                  ? `Pulang Balik: ${repayDate}${slot.repaymentDay ? ` (${slot.repaymentDay})` : ''} · ${slot.repaymentSlotLabel || ''} (${slot.repaymentTimeLabel || ''}) — ${slot.absentTeacherCodes[0] || ''} ajar ${slot.repaymentSubjectCode || slot.subjectCode}`
                  : 'Tidak Perlu Pulang Balik';

              return {
                period: `${slot.slotLabel} (${slot.timeLabel})`,
                classId: slot.isPrasekolah ? 'PRASEKOLAH' : `T${slot.grade}`,
                className: slot.classLabel,
                subjectCode:
                  isSwap && slot.substituteTeachingSubjectCode
                    ? `${slot.substituteTeachingSubjectCode} (Tukar Waktu dengan ${slot.subjectCode})`
                    : slot.subjectCode,
                subjectName: slot.subjectName,
                substituteTeacherId: teacherObj?.id || assignedCode,
                substituteName: teacherObj?.name || assignedCode || 'GURU GANTI',
                reliefMode: slot.reliefMode,
                reliefModeLabel: slot.reliefModeLabel,
                requiresRepayment: slot.requiresRepayment,
                repaymentDate: isSwap ? repayDate : '',
                repaymentDetails,
              };
            })
          : activeAlertForSchedule.affectedClasses.map((cls, idx) => {
              const assignedTId = slotAssignments[`${cls.classId}_${cls.subjectCode}`];
              const teacherObj = teacherList.find((t) => t.id === assignedTId || t.code === assignedTId);
              return {
                period: `Waktu ${idx + 1}`,
                classId: cls.classId,
                className: cls.className,
                subjectCode: cls.subjectCode,
                subjectName: cls.subjectName,
                substituteTeacherId: assignedTId || '',
                substituteName: teacherObj?.name || 'GURU GANTI',
                reliefMode: 'GANTI_BIASA',
                reliefModeLabel: 'Ganti Biasa (Tidak Perlu Pulang Balik)',
                requiresRepayment: false,
                repaymentDate: '',
                repaymentDetails: 'Tidak Perlu Pulang Balik',
              };
            });

      // 1. Save record into relief_schedules
      await setDoc(doc(db, 'relief_schedules', scheduleId), {
        id: scheduleId,
        schoolCode: activeSchoolCode,
        alertId: activeAlertForSchedule.id,
        suratId: activeAlertForSchedule.suratId || '',
        perkara: activeAlertForSchedule.perkara,
        noRujukanLuar: activeAlertForSchedule.noRujukanLuar,
        date: activeAlertForSchedule.startDate,
        absentTeacherIds: activeAlertForSchedule.absentTeacherIds,
        assignments,
        scheduledByUid: currentUser?.uid || auth.currentUser?.uid || 'system',
        scheduledByName: currentUser?.name || auth.currentUser?.displayName || 'Pentadbir Jadual Ganti',
        createdAt: new Date().toISOString(),
      });

      // 2. Update status in relief_alerts_from_surat
      await updateDoc(doc(db, 'relief_alerts_from_surat', activeAlertForSchedule.id), {
        status: 'SELESAI_DIJADUAL',
        reliefScheduleId: scheduleId,
        updatedAt: new Date().toISOString(),
      });

      // Prepare clean print slip data (never expose Firebase UID or role enums)
      const absentNames = getAbsentTeacherNames(activeAlertForSchedule.absentTeacherIds);

      setPrintSlipData({
        date: activeAlertForSchedule.startDate,
        absentTeacher: absentNames || 'Guru Akademik',
        reason: activeAlertForSchedule.perkara,
        letterRef: activeAlertForSchedule.noRujukanLuar,
        assignments: assignments.map((a) => ({
          period: a.period,
          className: a.className,
          subject: `${a.subjectCode} - ${a.subjectName}`,
          substituteName: a.substituteName,
          reliefModeLabel: a.reliefModeLabel,
          repaymentDetails: a.repaymentDetails,
        })),
      });

      setIsScheduleModalOpen(false);
      setActiveAlertForSchedule(null);
    } catch (err: any) {
      console.error('Error saving relief schedule:', err);
      setErrorBanner(`Gagal menyimpan jadual ganti: ${err.message}`);
    } finally {
      setSubmittingSchedule(false);
    }
  };

  const getAbsentTeacherNames = (ids: string[]) => {
    return formatCleanAbsentTeacherNames(ids || [], teacherMappingList.list, teacherList);
  };

  if (!isAcademicAdmin) {
    return (
      <div className="flex-1 flex flex-col gap-6 max-w-7xl w-full mx-auto font-sans">
        <BilikGuruReliefView
          schedule={scheduleGrid}
          academicYear={activeAcademicYear}
          teacherMapping={teacherMappingList}
          isAdmin={false}
          lockedTeacherShortCode={accessProfile.teacherShortCode}
          lockedTeacherName={accessProfile.teacherName}
          displayMode="CODE"
          schoolCode={activeSchoolCode}
          schoolName={schoolSettings?.schoolName || tenantSchoolName}
          prasekolahTimetable={prasekolahTimetable}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-6 max-w-7xl w-full mx-auto font-sans">
      {/* ================= TOP PROMINENT LIVE ALERT BANNER ================= */}
      {pendingAlerts.length > 0 && (
        <div className="bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/80 border-2 border-amber-500/50 rounded-3xl p-5 sm:p-6 shadow-2xl relative overflow-hidden print:hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
            <div className="flex items-start gap-3.5">
              <div className="p-3 bg-amber-500/20 border border-amber-500/40 rounded-2xl text-amber-300 animate-pulse shrink-0">
                <Bell className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500 text-black">
                    Live Alert Dari Surat Masuk (PO)
                  </span>
                  <span className="text-xs text-amber-200 font-mono font-bold">
                    {pendingAlerts.length} Guru Tidak Hadir Perlu Jadual Ganti
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-white mt-1">
                  Permintaan Jadual Ganti Automatik (Relief) Dikesan
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Pembantu Operasi (PO) telah mendaftarkan surat rasmi berkaitan mesyuarat/kursus luar. Klik butang 1-Klik di bawah untuk menetapkan guru ganti bagi kelas terjejas.
                </p>
              </div>
            </div>

            {onNavigateToSuratMasuk && (
              <button
                type="button"
                onClick={onNavigateToSuratMasuk}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-2xl text-xs font-bold flex items-center gap-2 border border-slate-700 transition cursor-pointer self-start md:self-auto"
              >
                <Mail className="w-3.5 h-3.5 text-blue-400" />
                <span>Lihat Daftar Surat Masuk</span>
              </button>
            )}
          </div>

          {/* Cards for each pending alert */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendingAlerts.map((alertItem) => {
              const absentNames = getAbsentTeacherNames(alertItem.absentTeacherIds);
              return (
                <div
                  key={alertItem.id}
                  className="bg-slate-950/80 border border-amber-500/30 rounded-2xl p-4 flex flex-col justify-between space-y-3 hover:border-amber-400/60 transition"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="text-amber-300 font-bold">
                        📅 {alertItem.startDate === alertItem.endDate ? alertItem.startDate : `${alertItem.startDate} hingga ${alertItem.endDate}`}
                      </span>
                      <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
                        Perlu Relief
                      </span>
                    </div>

                    <div className="font-extrabold text-white text-xs line-clamp-2">
                      {alertItem.perkara}
                    </div>

                    <div className="text-[11px] text-slate-300">
                      <span className="text-slate-400 font-medium">Guru Terlibat: </span>
                      <span className="font-bold text-amber-200">{absentNames || 'Guru Akademik'}</span>
                    </div>

                    <div className="text-[10px] font-mono text-slate-400">
                      Ruj: {alertItem.noRujukanLuar}
                    </div>

                    {/* Affected classes pill */}
                    <div className="pt-1 flex flex-wrap gap-1">
                      {alertItem.affectedClasses.length > 0 ? (
                        alertItem.affectedClasses.map((cls, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800/60 text-[10px] font-bold"
                          >
                            {cls.className} ({cls.subjectCode})
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-slate-500 italic">
                          (Semua jadual kelas hari tersebut)
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenScheduleModal(alertItem)}
                    className="w-full py-2 px-3 bg-amber-500 hover:bg-amber-400 text-black font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 transition cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Jadualkan Guru Ganti (1-Klik)</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= HEADER CONTROL BAR ================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Pengurusan Waktu Lapang & Guru Ganti
            </span>
            <span className="text-xs text-slate-400">Penyegerakan Automatik Surat Masuk</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white mt-1 flex items-center gap-2.5">
            <Clock className="w-6 h-6 text-emerald-400" />
            <span>Jadual Ganti (Relief Scheduling) & BGuru</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Mengenal pasti guru yang tiada kelas pada waktu tertentu dan mengagihkan waktu guru ganti dengan pantas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('ALERTS')}
              className={`px-3.5 py-1.5 rounded-xl transition cursor-pointer ${
                activeTab === 'ALERTS'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Semua Permintaan ({alerts.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('BGURU_MONITOR')}
              className={`px-3.5 py-1.5 rounded-xl transition cursor-pointer ${
                activeTab === 'BGURU_MONITOR'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-emerald-300'
              }`}
            >
              Semakan Waktu Lapang (BGuru)
            </button>
          </div>

          {onNavigateToSuratMasuk && (
            <button
              type="button"
              onClick={onNavigateToSuratMasuk}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl text-xs font-bold transition cursor-pointer"
            >
              <Mail className="w-4 h-4 text-blue-400" />
              <span>Daftar Surat Masuk</span>
            </button>
          )}
        </div>
      </div>

      {/* ================= TAB 1: ALL RELIEF ALERTS TABLE ================= */}
      {activeTab === 'ALERTS' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4 print:hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Senarai Permintaan Jadual Ganti Mengikut Surat Masuk
              </h3>
              <p className="text-xs text-slate-400">
                Penyelarasan automatik sebaik sahaja Pembantu Operasi merekodkan surat rasmi.
              </p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Cari perkara / guru..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400 font-mono">
              Memuatkan senarai permintaan guru ganti...
            </div>
          ) : alerts.length === 0 ? (
            <div className="py-12 text-center space-y-2 text-slate-400 text-xs">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
              <p className="font-bold text-slate-300">Tiada permintaan guru ganti aktif pada masa ini.</p>
              <p>Apabila PO merekodkan surat masuk dengan tanda "Perlu Hadir", ia akan dipaparkan di sini secara automatik.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                    <th className="py-3 px-3 w-12 text-center">Bil.</th>
                    <th className="py-3 px-3 w-28">Tarikh</th>
                    <th className="py-3 px-4">Perkara / No. Rujukan</th>
                    <th className="py-3 px-4 w-48">Guru Bertugas Luar</th>
                    <th className="py-3 px-4">Kelas & Mata Pelajaran Terjejas</th>
                    <th className="py-3 px-3 w-28 text-center">Status</th>
                    <th className="py-3 px-3 w-32 text-right">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {alerts
                    .filter((a) => {
                      if (!searchQuery.trim()) return true;
                      const q = searchQuery.toLowerCase();
                      return (
                        a.perkara.toLowerCase().includes(q) ||
                        a.noRujukanLuar.toLowerCase().includes(q) ||
                        getAbsentTeacherNames(a.absentTeacherIds).toLowerCase().includes(q)
                      );
                    })
                    .map((item, index) => {
                      const isPending = item.status === 'PERLU_JADUAL_GANTI';
                      const absentNames = getAbsentTeacherNames(item.absentTeacherIds);
                      return (
                        <tr key={item.id} className="hover:bg-slate-800/40 align-top">
                          <td className="py-3.5 px-3 text-center font-mono font-bold text-slate-400">
                            {index + 1}.
                          </td>
                          <td className="py-3.5 px-3 font-mono font-bold text-slate-200">
                            {item.startDate}
                          </td>
                          <td className="py-3.5 px-4 space-y-1">
                            <div className="font-extrabold text-white leading-snug">
                              {item.perkara}
                            </div>
                            <div className="text-[11px] font-mono text-indigo-300">
                              {item.noRujukanLuar}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-200">
                            {absentNames || '-'}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex flex-wrap gap-1">
                              {item.affectedClasses.length > 0 ? (
                                item.affectedClasses.map((cls, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800 text-[10px] font-mono font-bold"
                                  >
                                    {cls.className} ({cls.subjectCode})
                                  </span>
                                ))
                              ) : (
                                <span className="text-slate-500 italic text-[11px]">
                                  Jadual harian umum
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-3 text-center">
                            {isPending ? (
                              <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-extrabold uppercase">
                                Belum Dijadual
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-extrabold uppercase">
                                SELESAI DIJADUALKAN
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-3 text-right">
                            {isPending ? (
                              <button
                                type="button"
                                onClick={() => handleOpenScheduleModal(item)}
                                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold inline-flex items-center gap-1 transition cursor-pointer"
                              >
                                <Sparkles className="w-3 h-3" />
                                <span>Jadualkan</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={async () => {
                                  setSelectedAlert(item);
                                  let slipAssignments: Array<{
                                    period: string;
                                    className: string;
                                    subject: string;
                                    substituteName: string;
                                    reliefModeLabel?: string;
                                    repaymentDetails?: string;
                                  }> = [];

                                  if (item.reliefScheduleId) {
                                    try {
                                      const savedSnap = await getDoc(
                                        doc(db, 'relief_schedules', item.reliefScheduleId)
                                      );
                                      if (savedSnap.exists()) {
                                        const savedData = savedSnap.data() as any;
                                        if (Array.isArray(savedData.assignments) && savedData.assignments.length > 0) {
                                          slipAssignments = savedData.assignments.map((a: any) => ({
                                            period: a.period,
                                            className: a.className,
                                            subject: `${a.subjectCode} - ${a.subjectName}`,
                                            substituteName: a.substituteName,
                                            reliefModeLabel: a.reliefModeLabel,
                                            repaymentDetails: a.repaymentDetails,
                                          }));
                                        }
                                      }
                                    } catch {
                                      // Fallback to auto recompute below
                                    }
                                  }

                                  if (slipAssignments.length === 0) {
                                    const plan = recomputeModalAutoSlots(item, {}, {});
                                    if (plan.slots.length > 0) {
                                      slipAssignments = plan.slots.map((slot) => ({
                                        period: `${slot.slotLabel} (${slot.timeLabel})`,
                                        className: slot.classLabel,
                                        subject: `${slot.subjectCode} - ${slot.subjectName}`,
                                        substituteName:
                                          slot.assignedSubstituteName || slot.assignedSubstituteCode || 'GURU GANTI',
                                        reliefModeLabel: slot.reliefModeLabel,
                                        repaymentDetails:
                                          slot.reliefMode === 'TUKAR_WAKTU_KELAS_SAMA' && slot.repaymentDate
                                            ? `Pulang Balik: ${slot.repaymentDate}${slot.repaymentDay ? ` (${slot.repaymentDay})` : ''} · ${slot.repaymentSlotLabel || ''} (${slot.repaymentTimeLabel || ''})`
                                            : 'Tidak Perlu Pulang Balik',
                                      }));
                                    } else {
                                      slipAssignments = item.affectedClasses.map((c, i) => ({
                                        period: `Waktu ${i + 1}`,
                                        className: c.className,
                                        subject: `${c.subjectCode} - ${c.subjectName}`,
                                        substituteName: 'Guru Bertugas',
                                      }));
                                    }
                                  }

                                  setPrintSlipData({
                                    date: item.startDate,
                                    absentTeacher: absentNames || 'Guru Akademik',
                                    reason: item.perkara,
                                    letterRef: item.noRujukanLuar,
                                    assignments: slipAssignments,
                                  });
                                }}
                                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold inline-flex items-center gap-1 transition cursor-pointer"
                              >
                                <Printer className="w-3 h-3" />
                                <span>Slip Ganti</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 2: BILIK GURU LIVE RELIEF MONITOR ================= */}
      {activeTab === 'BGURU_MONITOR' && (
        <div className="space-y-4">
          <BilikGuruReliefView
            schedule={scheduleGrid}
            academicYear={activeAcademicYear}
            teacherMapping={teacherMappingList}
            displayMode="CODE"
            schoolCode={activeSchoolCode}
            schoolName={schoolSettings?.schoolName || tenantSchoolName}
            prasekolahTimetable={prasekolahTimetable}
          />
        </div>
      )}

      {/* ================= MODAL: 1-CLICK GURU GANTI SCHEDULING ================= */}
      {isScheduleModalOpen && activeAlertForSchedule && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 print:hidden">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 space-y-5 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  <span>Jadualkan Guru Ganti (1-Klik Auto)</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Tetapkan guru ganti bagi kelas terjejas akibat ketiadaan guru menghadiri mesyuarat/kursus rasmi.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsScheduleModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs">
              <div className="font-bold text-amber-300">
                📌 {activeAlertForSchedule.perkara}
              </div>
              <div className="text-slate-400">
                <span>Tarikh: </span>
                <strong className="text-white">{activeAlertForSchedule.startDate}</strong>
                <span className="mx-2">|</span>
                <span>Ruj. Surat: </span>
                <strong className="text-white">{activeAlertForSchedule.noRujukanLuar}</strong>
              </div>
              <div className="text-slate-400">
                <span>Guru Tidak Hadir: </span>
                <strong className="text-rose-300">
                  {getAbsentTeacherNames(activeAlertForSchedule.absentTeacherIds)}
                </strong>
              </div>
            </div>

            {/* List of affected classes & substitute selector */}
            <div className="space-y-3">
              <div className="font-bold text-white text-xs uppercase tracking-wider flex items-center justify-between flex-wrap gap-2">
                <span>Senarai Kelas & Penugasan Guru Ganti</span>
                {activeAutoSlots.length > 0 ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-extrabold uppercase">
                    ✔ SELESAI DIJADUALKAN ({activeAutoSlots.length} Slot)
                  </span>
                ) : activeAlertForSchedule.affectedClasses.length > 0 ? (
                  <span className="text-[11px] text-emerald-400">
                    ✔ Dicadangkan secara automatik daripada guru yang berkelapangan
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-extrabold uppercase">
                    TIADA JADUAL / Tiada Kelas Dijadualkan Pada Hari Ini
                  </span>
                )}
              </div>

              <div className="space-y-2.5">
                {activeAutoSlots.length > 0 ? (
                  activeAutoSlots.map((slot) => {
                    const currentAssigned = slotAssignments[slot.slotKey] || slot.assignedSubstituteCode;
                    const currentRepayDate = slotRepaymentDates[slot.slotKey] ?? slot.repaymentDate ?? '';
                    const isSwap = slot.reliefMode === 'TUKAR_WAKTU_KELAS_SAMA';
                    const isPra = slot.reliefMode === 'GANTI_PRASEKOLAH';

                    return (
                      <div
                        key={slot.slotKey}
                        className={`p-3.5 border rounded-xl flex flex-col gap-3 text-xs ${
                          isPra
                            ? 'bg-teal-950/20 border-teal-500/30'
                            : isSwap
                            ? 'bg-indigo-950/20 border-indigo-500/30'
                            : 'bg-slate-950 border-slate-800'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-white text-sm">{slot.classLabel}</span>
                              <span className="px-2 py-0.5 bg-blue-950 text-blue-300 border border-blue-800/60 rounded font-mono text-[10px] font-bold">
                                {slot.subjectCode}
                              </span>
                              {isSwap ? (
                                <span className="px-2 py-0.5 rounded bg-indigo-500/20 border border-indigo-400/40 text-indigo-200 text-[10px] font-black flex items-center gap-1">
                                  <ArrowLeftRight className="w-3 h-3" />
                                  Tukar Waktu Kelas Sama (Ajar {slot.substituteTeachingSubjectCode || slot.subjectCode})
                                </span>
                              ) : isPra ? (
                                <span className="px-2 py-0.5 rounded bg-teal-500/20 border border-teal-400/40 text-teal-200 text-[10px] font-black flex items-center gap-1">
                                  <Baby className="w-3 h-3" />
                                  Ganti Prasekolah (Tidak Perlu Pulang Balik)
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-bold">
                                  Ganti Biasa (Tidak Perlu Pulang Balik)
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {slot.slotLabel} ({slot.timeLabel}) · {slot.subjectName}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 w-full sm:w-80">
                            <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                            <select
                              value={currentAssigned}
                              onChange={(e) => {
                                const nextCode = e.target.value;
                                const nextMap = {
                                  ...slotAssignments,
                                  [slot.slotKey]: nextCode,
                                };
                                setSlotAssignments(nextMap);
                                if (activeAlertForSchedule) {
                                  recomputeModalAutoSlots(activeAlertForSchedule, nextMap, slotRepaymentDates);
                                }
                              }}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white font-bold"
                            >
                              {slot.recommendedCandidates.map((cand, idx) => {
                                const tag =
                                  cand.reliefMode === 'TUKAR_WAKTU_KELAS_SAMA' && cand.repaymentInfo
                                    ? `🔄 Tukar Waktu (Ajar ${cand.repaymentInfo.substituteOriginalSubjectCode} · Pulang ${cand.repaymentInfo.repaymentDate})`
                                    : slot.isPrasekolah
                                    ? '🧸 Ganti Prasekolah (Tiada Pulang Balik)'
                                    : 'Ganti Biasa (Tiada Pulang Balik)';
                                return (
                                  <option key={`${cand.code}_${idx}`} value={cand.code}>
                                    {idx === 0 ? '★ ' : ''}[{cand.code}] {cand.name} — {tag} ({cand.baseDayLoad}w→{cand.projectedDayLoad}w)
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                        </div>

                        {/* Editable Tarikh Pulang Balik row for Tukar Waktu Kelas Sama */}
                        {isSwap && (
                          <div className="pt-2 border-t border-indigo-500/20 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                            <div className="text-indigo-200">
                              🔄 <strong>Pulang Balik (2-Hala):</strong> Pada{' '}
                              <strong>{currentRepayDate || slot.repaymentDate}</strong> ({slot.repaymentDay}),{' '}
                              <strong>{slot.absentTeacherCodes[0]}</strong> masuk {slot.classLabel} pada{' '}
                              <strong>
                                {slot.repaymentSlotLabel} ({slot.repaymentTimeLabel})
                              </strong>{' '}
                              ajar subjek <strong>{slot.repaymentSubjectCode || slot.subjectCode}</strong>.
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold uppercase text-indigo-300">
                                Tarikh Pulang Balik:
                              </span>
                              <input
                                type="date"
                                value={currentRepayDate}
                                min={activeAlertForSchedule.startDate}
                                onChange={(e) => {
                                  const nextDate = e.target.value;
                                  const nextRepayMap = {
                                    ...slotRepaymentDates,
                                    [slot.slotKey]: nextDate,
                                  };
                                  setSlotRepaymentDates(nextRepayMap);
                                  if (activeAlertForSchedule) {
                                    recomputeModalAutoSlots(activeAlertForSchedule, slotAssignments, nextRepayMap);
                                  }
                                }}
                                className="bg-slate-900 border border-indigo-500/50 rounded-lg px-2 py-1 text-xs font-bold text-indigo-200"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  activeAlertForSchedule.affectedClasses.map((cls, idx) => {
                    const key = `${cls.classId}_${cls.subjectCode}`;
                    const currentAssigned = slotAssignments[key] || '';
                    const resolvedCodes = new Set(resolveAbsentCodesForAlert(activeAlertForSchedule));
                    const otherTeachers = teacherList.filter(
                      (t) =>
                        !resolvedCodes.has(t.code.toUpperCase()) &&
                        !activeAlertForSchedule.absentTeacherIds.includes(t.id) &&
                        !activeAlertForSchedule.absentTeacherIds.includes(t.name)
                    );

                    return (
                      <div
                        key={key}
                        className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm">
                              {cls.className}
                            </span>
                            <span className="px-2 py-0.5 bg-blue-950 text-blue-300 border border-blue-800/60 rounded font-mono text-[10px] font-bold">
                              {cls.subjectCode} - {cls.subjectName}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Waktu {idx + 1} (Agihan Mingguan: {cls.weeklyPeriods} waktu)
                          </div>
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-64">
                          <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                          <select
                            value={currentAssigned}
                            onChange={(e) =>
                              setSlotAssignments((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white font-bold"
                          >
                            {otherTeachers.map((t, idx) => (
                              <option key={`${t.id}_${idx}`} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              {errorBanner && (
                <div className="p-2.5 bg-rose-950/80 border border-rose-700 text-rose-200 rounded-xl text-xs font-bold">
                  {errorBanner}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsScheduleModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={submittingSchedule}
                onClick={handleSaveReliefSchedule}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {submittingSchedule ? 'Menyimpan Jadual Ganti...' : 'Sahkan & Jana Slip Guru Ganti'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL / PRINT VIEW: SLIP GURU GANTI ================= */}
      {printSlipData && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto print:p-0 print:border-none print:bg-white print:max-w-none">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 print:hidden">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Printer className="w-5 h-5 text-emerald-400" />
                <span>Slip Penugasan Guru Ganti & Tukar Waktu (KPM)</span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const waLines = [
                      `*📌 SLIP GURU GANTI & TUKAR WAKTU (${(schoolSettings?.schoolName || tenantSchoolName).toUpperCase()})*`,
                      `📅 Tarikh: *${printSlipData.date}* | Ruj: ${printSlipData.letterRef}`,
                      `👤 Guru Tidak Hadir: *${printSlipData.absentTeacher}*`,
                      `📌 Sebab: ${printSlipData.reason}`,
                      `----------------------------------------`,
                      ...printSlipData.assignments.map(
                        (a, idx) =>
                          `*${idx + 1}. [${a.className}] ${a.period}*\n` +
                          `   • Subjek: ${a.subject}\n` +
                          `   • Guru Ganti: *${a.substituteName}* (${a.reliefModeLabel || 'Ganti Biasa'})\n` +
                          `   • Pulang Balik: *${a.repaymentDetails || 'Tidak Perlu Pulang Balik'}*`
                      ),
                    ].join('\n');
                    try {
                      await navigator.clipboard.writeText(waLines);
                      setCopiedSlipWhatsApp(true);
                      setTimeout(() => setCopiedSlipWhatsApp(false), 2500);
                    } catch {
                      // ignore
                    }
                  }}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/40 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedSlipWhatsApp ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Disalin untuk WhatsApp!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Salin Teks WhatsApp</span>
                    </>
                  )}
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    [
                      `*📌 SLIP GURU GANTI & TUKAR WAKTU (${(schoolSettings?.schoolName || tenantSchoolName).toUpperCase()})*`,
                      `📅 Tarikh: *${printSlipData.date}* | Ruj: ${printSlipData.letterRef}`,
                      `👤 Guru Tidak Hadir: *${printSlipData.absentTeacher}*`,
                      `📌 Sebab: ${printSlipData.reason}`,
                      `----------------------------------------`,
                      ...printSlipData.assignments.map(
                        (a, idx) =>
                          `*${idx + 1}. [${a.className}] ${a.period}*\n` +
                          `   • Subjek: ${a.subject}\n` +
                          `   • Guru Ganti: *${a.substituteName}* (${a.reliefModeLabel || 'Ganti Biasa'})\n` +
                          `   • Pulang Balik: *${a.repaymentDetails || 'Tidak Perlu Pulang Balik'}*`
                      ),
                    ].join('\n')
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>WhatsApp</span>
                </a>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak Slip</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintSlipData(null)}
                  className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Slip Paper Sheet (Word/Print format) */}
            <div className="bg-white text-black p-6 rounded-xl border border-black text-xs font-sans space-y-4">
              <div className="text-center border-b border-black pb-3">
                <div className="font-bold text-sm uppercase">
                  {schoolSettings?.schoolName || tenantSchoolName}
                </div>
                <div className="text-[11px] font-bold text-slate-800 uppercase mt-0.5">
                  SLIP GURU GANTI & TUKAR WAKTU KELAS SAMA (JADUAL RELIEF)
                </div>
                <div className="text-[10px] text-slate-600 mt-0.5">
                  Tarikh: <strong>{printSlipData.date}</strong> | Ruj. Surat: <strong>{printSlipData.letterRef}</strong>
                </div>
              </div>

              <div className="text-[11px] space-y-1">
                <div>
                  Guru Tidak Hadir: <strong>{printSlipData.absentTeacher}</strong>
                </div>
                <div>
                  Sebab: <strong>{printSlipData.reason}</strong>
                </div>
              </div>

              <table className="w-full border-collapse border border-black text-[11px]">
                <thead>
                  <tr className="border-b border-black font-bold text-center bg-slate-100">
                    <th className="border border-black py-1.5 px-2">Waktu / Masa</th>
                    <th className="border border-black py-1.5 px-2">Kelas</th>
                    <th className="border border-black py-1.5 px-2">Mata Pelajaran / Aktiviti</th>
                    <th className="border border-black py-1.5 px-2">Guru Ganti & Mod</th>
                    <th className="border border-black py-1.5 px-2">Tarikh Pulang Balik</th>
                    <th className="border border-black py-1.5 px-2 w-20">T.Tangan</th>
                  </tr>
                </thead>
                <tbody>
                  {printSlipData.assignments.map((item, i) => (
                    <tr key={i}>
                      <td className="border border-black py-2 px-2 text-center font-bold">
                        {item.period}
                      </td>
                      <td className="border border-black py-2 px-2 text-center font-bold">
                        {item.className}
                      </td>
                      <td className="border border-black py-2 px-2">
                        {item.subject}
                      </td>
                      <td className="border border-black py-2 px-2 text-center">
                        <div className="font-bold">{item.substituteName}</div>
                        <div className="text-[9px] text-slate-700">
                          {item.reliefModeLabel || 'Ganti Biasa'}
                        </div>
                      </td>
                      <td className="border border-black py-2 px-2 text-center text-[10px]">
                        {item.repaymentDetails || 'Tidak Perlu Pulang Balik'}
                      </td>
                      <td className="border border-black py-2 px-2 text-center">
                        &nbsp;
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-between items-end pt-6 text-[10px]">
                <div>
                  Disediakan oleh:<br /><br /><br />
                  ____________________________<br />
                  (Penyelaras Jadual Waktu / PKP)
                </div>
                <div>
                  Disahkan oleh:<br /><br /><br />
                  ____________________________<br />
                  (Guru Besar / PK Pentadbiran)
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
