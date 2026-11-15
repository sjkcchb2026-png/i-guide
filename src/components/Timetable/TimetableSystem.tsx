import React, { useState, useEffect, useMemo } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { PersonnelProfile } from '../../types';
import { isTeacherForTimetable } from '../../utils/checkoutRules';
import { SchoolTimetableMatrix, SubjectAllocationRow } from './SchoolTimetableMatrix';
import { JKeyinGrid } from './JKeyinGrid';
import { JUtamaView, JUtamaPrintableSheet } from './JUtamaView';
import { ClassTimetableView, LampiranAPrintableSheet } from './ClassTimetableView';
import { BilikGuruReliefView } from './BilikGuruReliefView';
import { PrasekolahTimetableView } from './PrasekolahTimetableView';
import {
  PrasekolahTimetableDoc,
  normalizePrasekolahTimetableDoc,
} from '../../utils/prasekolahTimetable';
import { TeacherTimetableView, LampiranBPrintableSheet } from './TeacherTimetableView';
import { ReliefSchedulingView } from '../ReliefSchedulingView';
import { exportAllTimetablesToExcel } from '../../utils/timetableExport';
import { OFFICIAL_TEACHERS, generateTeacherShortCode } from '../../constants/officialRoster';
import {
  buildDefaultCurriculumMatrix,
  getDefaultClassTeachers,
  hasAnyTeacherAssigned,
  hydrateMatrixTeachers,
} from '../../constants/defaultCurriculumMatrix';
import { useSchoolTenant } from '../../contexts/SchoolTenantContext';
import {
  belongsToSchool,
  isLegacyDefaultSchool,
  normalizeActiveSchoolCode,
  scopedDocId,
} from '../../utils/schoolTenant';
import { 
  ScheduleGrid, 
  DAYS_OF_WEEK,
  TimetableClash 
} from './types';
import { 
  autoPairPKARInGrid,
  createEmptyScheduleGrid, 
  detectScheduleClashes, 
  generateAutoSchedule 
} from './autoScheduler';
import { 
  Table, 
  Layers, 
  Printer, 
  GraduationCap, 
  Users, 
  UserCheck, 
  Sparkles, 
  AlertTriangle, 
  Save, 
  CheckCircle2, 
  ToggleLeft, 
  ToggleRight,
  Bell,
  Calendar,
  FileSpreadsheet,
  Download,
  Baby
} from 'lucide-react';

export type TimetableTab = 
  | 'AGIHAN' 
  | 'JKEYIN' 
  | 'JUTAMAP' 
  | 'JUTAMAL' 
  | 'JT1_6' 
  | 'PRASEKOLAH'
  | 'BGURU' 
  | 'RELIEF'
  | 'JG1_50';

interface TimetableSystemProps {
  activeAcademicYear?: string;
  defaultTeacherCode?: string;
  initialTab?: TimetableTab;
  schoolCode?: string;
  schoolName?: string;
}

export const TimetableSystem: React.FC<TimetableSystemProps> = ({
  activeAcademicYear = '2027',
  defaultTeacherCode,
  initialTab = 'AGIHAN',
  schoolCode: propSchoolCode,
  schoolName: propSchoolName,
}) => {
  const tenant = useSchoolTenant();
  const activeSchoolCode = normalizeActiveSchoolCode(propSchoolCode || tenant.schoolCode);
  const activeSchoolName = propSchoolName || tenant.schoolName;
  const isLegacySchool = isLegacyDefaultSchool(activeSchoolCode);

  const [activeTab, setActiveTab] = useState<TimetableTab>(initialTab);
  const [selectedYear, setSelectedYear] = useState<string>(activeAcademicYear || '2027');
  const [displayMode, setDisplayMode] = useState<'NUMBER' | 'CODE'>('CODE');
  const [personnelList, setPersonnelList] = useState<PersonnelProfile[]>([]);
  const [matrixData, setMatrixData] = useState<SubjectAllocationRow[]>(() =>
    buildDefaultCurriculumMatrix(activeAcademicYear || '2027', { includeLegacyTeachers: isLegacySchool })
  );
  const [classTeachers, setClassTeachers] = useState<Record<number, string>>(() =>
    getDefaultClassTeachers(isLegacySchool)
  );

  const [schedule, setSchedule] = useState<ScheduleGrid>(createEmptyScheduleGrid());
  const [prasekolahDoc, setPrasekolahDoc] = useState<PrasekolahTimetableDoc>(() =>
    normalizePrasekolahTimetableDoc(null, {
      id: scopedDocId(activeSchoolCode, `prasekolah_${activeAcademicYear || '2027'}`),
      schoolCode: activeSchoolCode,
      academicYear: activeAcademicYear || '2027',
      guruPrasekolahCode: isLegacySchool ? 'SW' : 'GPRA',
      guruPrasekolahName: isLegacySchool ? 'STEPHANIE WONG ENG HEE' : 'Guru Prasekolah',
      ppmName: 'PPM Prasekolah',
    })
  );
  const [isSavingPrasekolah, setIsSavingPrasekolah] = useState<boolean>(false);
  const [clashes, setClashes] = useState<TimetableClash[]>([]);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [isExportingAll, setIsExportingAll] = useState<boolean>(false);
  const [isBulkPrinting, setIsBulkPrinting] = useState<boolean>(false);

  useEffect(() => {
    const onAfterPrint = () => setIsBulkPrinting(false);
    window.addEventListener('afterprint', onAfterPrint);
    return () => window.removeEventListener('afterprint', onAfterPrint);
  }, []);

  // Sync year prop if changed by parent
  useEffect(() => {
    if (activeAcademicYear) {
      setSelectedYear(activeAcademicYear);
    }
  }, [activeAcademicYear]);

  // Load Personnel list and saved timetable data from Firestore
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        // 1. Load Personnel (Strictly teachers in active school; exclude AKP)
        const pSnap = await getDocs(collection(db, 'personnel')).catch(() => null);
        const teachers: PersonnelProfile[] = [];
        if (pSnap && !pSnap.empty) {
          const seenEmails = new Set<string>();
          pSnap.forEach((d) => {
            const data = d.data();
            if (belongsToSchool(data, activeSchoolCode) && isTeacherForTimetable(data) && data.name) {
              const emailKey = String(data.email || '').toLowerCase().trim();
              if (emailKey && seenEmails.has(emailKey)) return;
              if (emailKey) seenEmails.add(emailKey);
              teachers.push({ ...data, id: d.id } as PersonnelProfile);
            }
          });
        }

        // Only merge Balingian official teachers for legacy YCC3404
        if (isLegacySchool) {
          OFFICIAL_TEACHERS.forEach((ot) => {
            const exists = teachers.some(
              (p) =>
                (p.email && p.email.toLowerCase().trim() === ot.email.toLowerCase().trim()) ||
                (p.name && (p.name.toUpperCase().includes(ot.name.toUpperCase()) || ot.name.toUpperCase().includes(p.name.toUpperCase())))
            );
            if (!exists) {
              teachers.push(ot as any);
            }
          });
        }

        if (isMounted) setPersonnelList(teachers);

        // 2. Load Matrix Data (Fallback/hydrate official teachers ONLY for YCC3404)
        const matrixDocRef = doc(db, 'school_timetables', scopedDocId(activeSchoolCode, `matrix_${selectedYear}`));
        const matrixSnap = await getDoc(matrixDocRef);
        let resolvedMatrix: SubjectAllocationRow[] = buildDefaultCurriculumMatrix(selectedYear, {
          includeLegacyTeachers: isLegacySchool,
        });

        if (matrixSnap.exists()) {
          const mData = matrixSnap.data();
          if (Array.isArray(mData.matrixData) && mData.matrixData.length > 0) {
            resolvedMatrix =
              hasAnyTeacherAssigned(mData.matrixData) || !isLegacySchool
                ? mData.matrixData
                : hydrateMatrixTeachers(mData.matrixData, selectedYear, true);
          }
          if (isMounted) setMatrixData(resolvedMatrix);

          if (mData.classTeachers && Object.values(mData.classTeachers).filter(Boolean).length > 0 && isMounted) {
            setClassTeachers(mData.classTeachers);
          } else if (isMounted) {
            setClassTeachers(getDefaultClassTeachers(isLegacySchool));
          }
        } else if (isMounted) {
          setMatrixData(resolvedMatrix);
          setClassTeachers(getDefaultClassTeachers(isLegacySchool));
        }

        // 3. Load Schedule Grid (and repair legacy 0-teacher schedules automatically from resolvedMatrix)
        const scheduleDocRef = doc(db, 'school_timetables', scopedDocId(activeSchoolCode, `schedule_${selectedYear}`));
        const scheduleSnap = await getDoc(scheduleDocRef);
        if (scheduleSnap.exists()) {
          const sData = scheduleSnap.data();
          if (sData.schedule && isMounted) {
            let loadedGrid: ScheduleGrid = sData.schedule;

            let regularCellsCount = 0;
            let assignedTeacherCellsCount = 0;
            [1, 2, 3, 4, 5, 6].forEach((grade) => {
              DAYS_OF_WEEK.forEach((day) => {
                const dayObj = loadedGrid[grade]?.[day];
                if (!dayObj) return;
                Object.entries(dayObj).forEach(([slotId, cell]) => {
                  if (!cell || slotId === 'PKAR' || slotId === 'MEMBACA' || slotId === 'TASMIK' || slotId === 'REHAT') return;
                  if (cell.subjectCode === 'PN') return;
                  regularCellsCount++;
                  const cleanedT = (cell.teacherCode || '').replace(/\//g, '').trim();
                  if (cleanedT) assignedTeacherCellsCount++;
                });
              });
            });

            if (regularCellsCount >= 6 && assignedTeacherCellsCount === 0 && hasAnyTeacherAssigned(resolvedMatrix)) {
              const repairedGrid: ScheduleGrid = JSON.parse(JSON.stringify(loadedGrid));
              const pmRow = resolvedMatrix.find((r) => r.subjectCode.toUpperCase() === 'PM');
              const paiRow = resolvedMatrix.find((r) => r.subjectCode.toUpperCase() === 'PAI');
              const amRow = resolvedMatrix.find((r) => r.subjectCode.toUpperCase() === 'AM');

              [1, 2, 3, 4, 5, 6].forEach((grade) => {
                DAYS_OF_WEEK.forEach((day) => {
                  const dayObj = repairedGrid[grade]?.[day];
                  if (!dayObj) return;
                  Object.entries(dayObj).forEach(([slotId, cell]) => {
                    if (!cell || slotId === 'PKAR' || slotId === 'MEMBACA' || slotId === 'TASMIK' || slotId === 'REHAT') return;
                    const code = (cell.subjectCode || '').toUpperCase();
                    if (!code || code === 'PN') return;
                    if (code === 'PM/PAI') {
                      cell.teacherCode = [pmRow?.teachers?.[grade] || '', paiRow?.teachers?.[grade] || '']
                        .map((t) => t.trim())
                        .filter(Boolean)
                        .join('/');
                    } else if (code === 'AM') {
                      const t1 = amRow?.teachers?.[grade]?.trim() || '';
                      const t2 = amRow?.secondaryTeachers?.[grade]?.trim() || '';
                      cell.teacherCode = [t1, t2].filter(Boolean).join('/');
                      cell.isCoTeaching = Boolean(t2);
                    } else {
                      const matched = resolvedMatrix.find((r) => r.subjectCode.toUpperCase() === code);
                      if (matched?.teachers?.[grade]) {
                        cell.teacherCode = matched.teachers[grade].trim();
                      }
                    }
                  });
                });
              });

              autoPairPKARInGrid(repairedGrid);
              loadedGrid = repairedGrid;
            }

            setSchedule(loadedGrid);
            const foundClashes = detectScheduleClashes(loadedGrid);
            setClashes(foundClashes);
          }
        } else if (isMounted) {
          setSchedule(createEmptyScheduleGrid());
          setClashes([]);
        }

        // 4. Load Isolated Prasekolah Timetable (prasekolah_timetables)
        const praDocId = scopedDocId(activeSchoolCode, `prasekolah_${selectedYear}`);
        const praDocRef = doc(db, 'prasekolah_timetables', praDocId);
        const praSnap = await getDoc(praDocRef).catch(() => null);
        if (isMounted) {
          if (praSnap && praSnap.exists()) {
            setPrasekolahDoc(
              normalizePrasekolahTimetableDoc(praSnap.data() as Partial<PrasekolahTimetableDoc>, {
                id: praDocId,
                schoolCode: activeSchoolCode,
                academicYear: selectedYear,
                guruPrasekolahCode: isLegacySchool ? 'SW' : 'GPRA',
                guruPrasekolahName: isLegacySchool ? 'STEPHANIE WONG ENG HEE' : 'Guru Prasekolah',
                ppmName: 'PPM Prasekolah',
              })
            );
          } else {
            setPrasekolahDoc(
              normalizePrasekolahTimetableDoc(null, {
                id: praDocId,
                schoolCode: activeSchoolCode,
                academicYear: selectedYear,
                guruPrasekolahCode: isLegacySchool ? 'SW' : 'GPRA',
                guruPrasekolahName: isLegacySchool ? 'STEPHANIE WONG ENG HEE' : 'Guru Prasekolah',
                ppmName: 'PPM Prasekolah',
              })
            );
          }
        }
      } catch (err) {
        console.warn('Could not load Timetable data:', err);
      }
    }

    const unsub = onAuthStateChanged(auth, (user) => {
      if (user && isMounted) {
        loadData();
      }
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, [selectedYear, activeSchoolCode, isLegacySchool]);

  // Teacher Mapping for code & num resolution (deduplicated by teacher short code)
  const teacherMapping = useMemo(() => {
    const sourceList: PersonnelProfile[] = [...personnelList];

    // Ensure all 14 official teachers exist in the list ONLY for YCC3404
    if (isLegacySchool) {
      OFFICIAL_TEACHERS.forEach((ot) => {
        const exists = sourceList.some(
          (p) =>
            (p.email && p.email.toLowerCase().trim() === ot.email.toLowerCase().trim()) ||
            (p.name && (p.name.toUpperCase().includes(ot.name.toUpperCase()) || ot.name.toUpperCase().includes(p.name.toUpperCase())))
        );
        if (!exists) {
          sourceList.push({
            id: ot.id,
            name: ot.name,
            email: ot.email,
            category: ot.category,
            role: ot.role,
            position: ot.position,
          } as any);
        }
      });
    }

    const seenCodes = new Set<string>();
    const seenIds = new Set<string>();
    const dedupedList: Array<{ id: string; num: number; code: string; name: string }> = [];

    sourceList.forEach((t) => {
      let cleanName = (t.name || '').replace(/\s+/g, ' ').trim();
      if (!cleanName) return;
      if (isLegacySchool) {
        if (cleanName.toUpperCase().includes('FAHIM') && cleanName.toUpperCase().includes('AMAR')) {
          cleanName = 'MUHAMMAD FAHIM AMAR';
        } else if (cleanName.toUpperCase().includes('STEPHANIE') && cleanName.toUpperCase().includes('WONG')) {
          cleanName = 'STEPHANIE WONG ENG HEE';
        }
      }

      const code = ((t as any).code || generateTeacherShortCode(cleanName)).trim().toUpperCase();
      if (!code || seenCodes.has(code)) return;
      seenCodes.add(code);

      let uniqueId = t.id || `teacher_${code}`;
      if (seenIds.has(uniqueId)) {
        uniqueId = `${uniqueId}_${code}`;
      }
      seenIds.add(uniqueId);

      dedupedList.push({
        id: uniqueId,
        num: dedupedList.length + 1,
        code,
        name: cleanName,
      });
    });

    return { list: dedupedList.slice(0, 50) };
  }, [personnelList, isLegacySchool]);

  // Update schedule handler (with automatic Firestore persistence)
  const handleUpdateSchedule = (newSchedule: ScheduleGrid) => {
    setSchedule(newSchedule);
    const foundClashes = detectScheduleClashes(newSchedule, selectedYear);
    setClashes(foundClashes);

    const docId = scopedDocId(activeSchoolCode, `schedule_${selectedYear}`);
    const path = `school_timetables/${docId}`;
    const scheduleDocRef = doc(db, 'school_timetables', docId);
    const payload = JSON.parse(
      JSON.stringify({
        schoolCode: activeSchoolCode,
        academicYear: selectedYear,
        schedule: newSchedule,
        classTeachers,
        updatedAt: new Date().toISOString(),
      })
    );
    setDoc(scheduleDocRef, payload, { merge: true })
      .then(() => {
        setSaveStatus('Perubahan jadual waktu disimpan secara automatik.');
        setTimeout(() => setSaveStatus(null), 2500);
      })
      .catch((err) => {
        try {
          handleFirestoreError(err, OperationType.WRITE, path);
        } catch (wrappedErr: any) {
          console.warn('Auto-save schedule notice:', wrappedErr?.message || err);
        }
      });
  };

  // Auto Schedule Generation (Self-healing with official curriculum fallback for legacy school)
  const handleRunAutoScheduler = () => {
    let currentMatrix = matrixData;
    let currentClassTeachers = classTeachers;

    if (!currentMatrix || currentMatrix.length === 0) {
      currentMatrix = buildDefaultCurriculumMatrix(selectedYear, { includeLegacyTeachers: isLegacySchool });
      setMatrixData(currentMatrix);
    } else if (!hasAnyTeacherAssigned(currentMatrix) && isLegacySchool) {
      currentMatrix = hydrateMatrixTeachers(currentMatrix, selectedYear, true);
      setMatrixData(currentMatrix);
    }

    if ((!currentClassTeachers || Object.values(currentClassTeachers).filter(Boolean).length === 0) && isLegacySchool) {
      currentClassTeachers = getDefaultClassTeachers(true);
      setClassTeachers(currentClassTeachers);
    }

    try {
      setSaveStatus('Sedang menjana jadual waktu secara automatik...');
      const variationSeed = Math.floor(Math.random() * 10000) + 1;
      const { grid, unplaced } = generateAutoSchedule(
        currentMatrix,
        currentClassTeachers,
        selectedYear,
        variationSeed
      );

      // Preserve user-customized Tahun 1 07:15-07:30 morning program (e.g., renamed to Program Agama / 1-3 teachers)
      DAYS_OF_WEEK.forEach((day) => {
        const prevMemb = schedule[1]?.[day]?.['MEMBACA'];
        if (
          prevMemb &&
          (prevMemb.teacherCode?.trim() ||
            prevMemb.subjectCode !== 'MEMBACA' ||
            (prevMemb.subjectName && prevMemb.subjectName !== 'Program Membaca'))
        ) {
          if (!grid[1]) grid[1] = {} as any;
          if (!grid[1][day]) grid[1][day] = {};
          grid[1][day]['MEMBACA'] = JSON.parse(JSON.stringify(prevMemb));
        }
      });

      // Preserve manually placed TASMIK cells (including custom slots if dragged to another slot/day)
      [1, 2, 3, 4, 5, 6].forEach((grade) => {
        DAYS_OF_WEEK.forEach((day) => {
          const prevDay = schedule[grade]?.[day];
          if (!prevDay) return;
          Object.entries(prevDay).forEach(([slotId, prevCell]) => {
            if (!prevCell) return;
            const isManualTasmik =
              (prevCell.subjectCode || '').toUpperCase() === 'TASMIK' &&
              Boolean(prevCell.teacherCode && prevCell.teacherCode.trim());
            if (!isManualTasmik) return;
            if (!grid[grade]) grid[grade] = {} as any;
            if (!grid[grade][day]) grid[grade][day] = {};
            if (slotId === 'TASMIK' || !grid[grade][day][slotId]) {
              grid[grade][day][slotId] = JSON.parse(JSON.stringify(prevCell));
            } else if (!grid[grade][day]['TASMIK']?.teacherCode?.trim()) {
              grid[grade][day]['TASMIK'] = JSON.parse(JSON.stringify(prevCell));
            }
          });
        });
      });

      const newClashes = detectScheduleClashes(grid, selectedYear);
      setSchedule(grid);
      setClashes(newClashes);

      // Persist generated schedule to Firestore (tenant scoped)
      const scheduleDocRef = doc(db, 'school_timetables', scopedDocId(activeSchoolCode, `schedule_${selectedYear}`));
      const payload = JSON.parse(
        JSON.stringify({
          schoolCode: activeSchoolCode,
          academicYear: selectedYear,
          schedule: grid,
          classTeachers: currentClassTeachers,
          updatedAt: new Date().toISOString(),
        })
      );
      setDoc(scheduleDocRef, payload, { merge: true }).catch((err) =>
        console.warn('Auto-save schedule notice:', err)
      );

      if (unplaced.length > 0) {
        setSaveStatus(`Jadual waktu berjaya dijana! (${unplaced.length} waktu memerlukan pelarasan manual)`);
      } else {
        setSaveStatus('Jadual waktu berjaya dijana secara automatik dengan sifar pertembungan!');
      }
      setTimeout(() => setSaveStatus(null), 5000);
    } catch (err: any) {
      console.error('Auto scheduler error:', err);
      setSaveStatus(`Ralat penjanaan jadual: ${err.message || 'Sila semak semula agihan subjek'}`);
      setTimeout(() => setSaveStatus(null), 6000);
    }
  };

  // Save Schedule to Firestore
  const handleSaveSchedule = async () => {
    try {
      setSaveStatus('Menyimpan jadual ke pangkalan data...');
      const scheduleDocRef = doc(db, 'school_timetables', scopedDocId(activeSchoolCode, `schedule_${selectedYear}`));
      const payload = JSON.parse(
        JSON.stringify({
          schoolCode: activeSchoolCode,
          academicYear: selectedYear,
          schedule,
          classTeachers,
          updatedAt: new Date().toISOString(),
        })
      );
      await setDoc(scheduleDocRef, payload, { merge: true });
      setSaveStatus('Jadual Waktu tersimpan dengan jayanya!');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err: any) {
      console.error('Save schedule error:', err);
      setSaveStatus(`Ralat: ${err.message}`);
    }
  };

  // Save Isolated Prasekolah Timetable to Firestore (prasekolah_timetables)
  const handleSavePrasekolahTimetable = async (nextDoc: PrasekolahTimetableDoc) => {
    try {
      setIsSavingPrasekolah(true);
      const praDocId = scopedDocId(activeSchoolCode, `prasekolah_${selectedYear}`);
      const praDocRef = doc(db, 'prasekolah_timetables', praDocId);
      const payload = JSON.parse(
        JSON.stringify({
          ...nextDoc,
          id: praDocId,
          schoolCode: activeSchoolCode,
          academicYear: selectedYear,
          updatedAt: new Date().toISOString(),
        })
      );
      await setDoc(praDocRef, payload, { merge: true });
      setPrasekolahDoc(payload);
      setSaveStatus('Jadual Prasekolah (Terpisah) berjaya disimpan!');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err: any) {
      console.error('Save Prasekolah schedule error:', err);
      setSaveStatus(`Ralat Jadual Prasekolah: ${err.message}`);
    } finally {
      setIsSavingPrasekolah(false);
    }
  };

  // Bulk Download All (Excel .xlsx containing Jadual Induk + 6 Lampiran A + all Lampiran B)
  const handleExportAllExcel = async () => {
    try {
      setIsExportingAll(true);
      setSaveStatus('Sedang menjana fail Excel lengkap (Jadual Induk + Lampiran A + Lampiran B)...');
      await exportAllTimetablesToExcel({
        schedule,
        academicYear: selectedYear,
        schoolName: activeSchoolName,
        schoolCode: activeSchoolCode,
        classTeachers,
        matrixData,
        teacherMapping,
        displayMode,
      });
      setSaveStatus('Semua jadual waktu berjaya dimuat turun dalam fail Excel (.xlsx)!');
      setTimeout(() => setSaveStatus(null), 4000);
    } catch (err: any) {
      setSaveStatus(`Ralat eksport Excel: ${err?.message || 'Gagal menjana fail'}`);
      setTimeout(() => setSaveStatus(null), 5000);
    } finally {
      setIsExportingAll(false);
    }
  };

  // Batch Print All (A4 Landscape PDF mode)
  const handleBulkPrintPdf = () => {
    setIsBulkPrinting(true);
    requestAnimationFrame(() => {
      setTimeout(() => {
        window.print();
      }, 220);
    });
  };

  return (
    <div className="space-y-6">
      {/* System Navigation Tabs Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl flex flex-col gap-3 print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Module Sub-tabs */}
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
          <button
            onClick={() => setActiveTab('AGIHAN')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
              activeTab === 'AGIHAN'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>Agihan Mengajar</span>
          </button>

          <button
            onClick={() => setActiveTab('JKEYIN')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer relative ${
              activeTab === 'JKEYIN'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>JKEYIN (Auto-Jadual)</span>
            {clashes.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('JUTAMAP')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
              activeTab === 'JUTAMAP'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>JUtamaP (Potret)</span>
          </button>

          <button
            onClick={() => setActiveTab('JUTAMAL')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
              activeTab === 'JUTAMAL'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>JUtamaL (Landskap)</span>
          </button>

          <button
            onClick={() => setActiveTab('JT1_6')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
              activeTab === 'JT1_6'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span>JT1–6 (Kelas)</span>
          </button>

          <button
            onClick={() => setActiveTab('PRASEKOLAH')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
              activeTab === 'PRASEKOLAH'
                ? 'bg-teal-600 text-white shadow-md shadow-teal-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Baby className="w-3.5 h-3.5 text-teal-300" />
            <span>Jadual Prasekolah (Terpisah)</span>
          </button>

          <button
            onClick={() => setActiveTab('BGURU')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
              activeTab === 'BGURU'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>BGuru (Waktu Lapang)</span>
          </button>

          <button
            onClick={() => setActiveTab('RELIEF')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
              activeTab === 'RELIEF'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Bell className="w-3.5 h-3.5 text-amber-300" />
            <span>Jadual Ganti (Relief Surat PO)</span>
          </button>

          <button
            onClick={() => setActiveTab('JG1_50')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
              activeTab === 'JG1_50'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>JG1–50 (Guru)</span>
          </button>
        </div>

        {/* Global Controls: Year Selector, Mode Toggle & Save Schedule */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Academic Year Selector */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-700">
            <Calendar className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[11px] font-bold text-slate-400">Sesi:</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-transparent text-white font-black text-xs outline-none cursor-pointer"
            >
              <option value="2026" className="bg-slate-900 text-white">Sesi 2026</option>
              <option value="2027" className="bg-slate-900 text-white">Sesi 2027</option>
              <option value="2028" className="bg-slate-900 text-white">Sesi 2028</option>
              <option value="2029" className="bg-slate-900 text-white">Sesi 2029</option>
            </select>
          </div>

          <button
            onClick={() => setDisplayMode(displayMode === 'CODE' ? 'NUMBER' : 'CODE')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-xs font-bold text-slate-300 border border-slate-700 transition cursor-pointer"
          >
            {displayMode === 'CODE' ? (
              <ToggleRight className="w-4 h-4 text-emerald-400" />
            ) : (
              <ToggleLeft className="w-4 h-4 text-blue-400" />
            )}
            <span>{displayMode === 'CODE' ? 'Mod Kod Singkatan' : 'Mod Nombor (1, 2, 3...)'}</span>
          </button>

          {activeTab !== 'AGIHAN' && (
            <button
              onClick={handleSaveSchedule}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-md shadow-blue-600/30 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Simpan Jadual</span>
            </button>
          )}
        </div>
        </div>

        {/* Dedicated Bulk Export Action Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-slate-800/80">
          <span className="text-[11px] font-bold text-slate-400">
            Eksport Pukal Rasmi (Jadual Induk · 6 Lampiran A Kelas · {teacherMapping.list.length} Lampiran B Guru Option A)
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isExportingAll}
              onClick={handleExportAllExcel}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider transition shadow-md shadow-emerald-600/30 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{isExportingAll ? 'Menjana Excel...' : 'Muat Turun Semua Jadual (Excel)'}</span>
            </button>

            <button
              type="button"
              onClick={handleBulkPrintPdf}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition shadow-md shadow-indigo-600/30 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Muat Turun / Cetak Semua (PDF A4 Landskap)</span>
            </button>
          </div>
        </div>
      </div>

      {saveStatus && (
        <div
          className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 print:hidden ${
            saveStatus.includes('Ralat')
              ? 'bg-rose-950/80 border-rose-700 text-rose-200'
              : 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>{saveStatus}</span>
        </div>
      )}

      {/* Main Tab View Rendering (Hidden when bulk-printing all sheets) */}
      <div className={isBulkPrinting ? 'print:hidden' : ''}>
        {activeTab === 'AGIHAN' && (
          <SchoolTimetableMatrix
            activeAcademicYear={selectedYear}
            schoolCode={activeSchoolCode}
            onMatrixSaved={(rows, teachersMap, yr) => {
              if (yr === selectedYear) {
                setMatrixData(
                  hasAnyTeacherAssigned(rows) || !isLegacySchool
                    ? rows
                    : hydrateMatrixTeachers(rows, yr, true)
                );
                setClassTeachers(teachersMap);
              }
            }}
          />
        )}

        {activeTab === 'JKEYIN' && (
          <JKeyinGrid
            schedule={schedule}
            onUpdateSchedule={handleUpdateSchedule}
            onAutoSchedule={handleRunAutoScheduler}
            clashes={clashes}
            matrixData={matrixData}
            teacherMapping={teacherMapping}
            displayMode={displayMode}
            classTeachers={classTeachers}
            academicYear={selectedYear}
            onYearChange={(newYear) => setSelectedYear(newYear)}
          />
        )}

        {activeTab === 'JUTAMAP' && (
          <JUtamaView
            schedule={schedule}
            academicYear={selectedYear}
            schoolName={activeSchoolName}
            schoolCode={activeSchoolCode}
            classTeachers={classTeachers}
            matrixData={matrixData}
            displayMode={displayMode}
            teacherMapping={teacherMapping}
            initialOrientation="PORTRAIT"
            onExportAllExcel={handleExportAllExcel}
            onBulkPrintPdf={handleBulkPrintPdf}
          />
        )}

        {activeTab === 'JUTAMAL' && (
          <JUtamaView
            schedule={schedule}
            academicYear={selectedYear}
            schoolName={activeSchoolName}
            schoolCode={activeSchoolCode}
            classTeachers={classTeachers}
            matrixData={matrixData}
            displayMode={displayMode}
            teacherMapping={teacherMapping}
            initialOrientation="LANDSCAPE"
            onExportAllExcel={handleExportAllExcel}
            onBulkPrintPdf={handleBulkPrintPdf}
          />
        )}

        {activeTab === 'JT1_6' && (
          <ClassTimetableView
            schedule={schedule}
            academicYear={selectedYear}
            schoolName={activeSchoolName}
            schoolCode={activeSchoolCode}
            classTeachers={classTeachers}
            matrixData={matrixData}
            displayMode={displayMode}
            teacherMapping={teacherMapping}
            onUpdateSchedule={handleUpdateSchedule}
            onExportAllExcel={handleExportAllExcel}
            onBulkPrintPdf={handleBulkPrintPdf}
          />
        )}

        {activeTab === 'PRASEKOLAH' && (
          <PrasekolahTimetableView
            prasekolahDoc={prasekolahDoc}
            teacherList={teacherMapping.list}
            isAdmin={true}
            isSaving={isSavingPrasekolah}
            schoolName={activeSchoolName}
            schoolCode={activeSchoolCode}
            onSaveDoc={handleSavePrasekolahTimetable}
          />
        )}

        {activeTab === 'BGURU' && (
          <BilikGuruReliefView
            schedule={schedule}
            academicYear={selectedYear}
            teacherMapping={teacherMapping}
            displayMode={displayMode}
            schoolCode={activeSchoolCode}
            schoolName={activeSchoolName}
            prasekolahTimetable={prasekolahDoc}
          />
        )}

        {activeTab === 'RELIEF' && (
          <ReliefSchedulingView />
        )}

        {activeTab === 'JG1_50' && (
          <TeacherTimetableView
            schedule={schedule}
            academicYear={selectedYear}
            schoolName={activeSchoolName}
            schoolCode={activeSchoolCode}
            teacherMapping={teacherMapping}
            displayMode={displayMode}
            defaultTeacherCode={defaultTeacherCode}
            classTeachers={classTeachers}
            matrixData={matrixData}
            onExportAllExcel={handleExportAllExcel}
            onBulkPrintPdf={handleBulkPrintPdf}
          />
        )}
      </div>

      {/* Batch Printable A4 Landscape Pages Container (Active during Bulk Print All PDF) */}
      {isBulkPrinting && (
        <div className="hidden print:block space-y-6">
          <JUtamaPrintableSheet
            schedule={schedule}
            academicYear={selectedYear}
            schoolName={activeSchoolName}
            schoolCode={activeSchoolCode}
            classTeachers={classTeachers}
            displayMode={displayMode}
            teacherMapping={teacherMapping}
            pageBreakClass="print-landscape-page"
          />

          {[1, 2, 3, 4, 5, 6].map((grade) => (
            <LampiranAPrintableSheet
              key={`bulk_class_${grade}`}
              schedule={schedule}
              grade={grade}
              academicYear={selectedYear}
              schoolName={activeSchoolName}
              classTeachers={classTeachers}
              matrixData={matrixData}
              teacherMapping={teacherMapping}
              displayMode={displayMode}
              pageBreakClass="print-landscape-page"
            />
          ))}

          {teacherMapping.list.map((teacher) => (
            <LampiranBPrintableSheet
              key={`bulk_teacher_${teacher.id}`}
              schedule={schedule}
              academicYear={selectedYear}
              teacher={teacher}
              schoolName={activeSchoolName}
              pageBreakClass="print-landscape-page"
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default TimetableSystem;
