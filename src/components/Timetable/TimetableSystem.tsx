import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { PersonnelProfile } from '../../types';
import { isTeacherForTimetable } from '../../utils/checkoutRules';
import { SchoolTimetableMatrix, SubjectAllocationRow } from './SchoolTimetableMatrix';
import { JKeyinGrid } from './JKeyinGrid';
import { JUtamaView } from './JUtamaView';
import { ClassTimetableView } from './ClassTimetableView';
import { BilikGuruReliefView } from './BilikGuruReliefView';
import { TeacherTimetableView } from './TeacherTimetableView';
import { ReliefSchedulingView } from '../ReliefSchedulingView';
import { OFFICIAL_TEACHERS, generateTeacherShortCode } from '../../constants/officialRoster';
import { buildDefaultCurriculumMatrix, getDefaultClassTeachers } from '../../constants/defaultCurriculumMatrix';
import { 
  ScheduleGrid, 
  TimetableClash 
} from './types';
import { 
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
  Calendar
} from 'lucide-react';

export type TimetableTab = 
  | 'AGIHAN' 
  | 'JKEYIN' 
  | 'JUTAMAP' 
  | 'JUTAMAL' 
  | 'JT1_6' 
  | 'BGURU' 
  | 'RELIEF'
  | 'JG1_50';

interface TimetableSystemProps {
  activeAcademicYear?: string;
  defaultTeacherCode?: string;
  initialTab?: TimetableTab;
}

export const TimetableSystem: React.FC<TimetableSystemProps> = ({
  activeAcademicYear = '2027',
  defaultTeacherCode,
  initialTab = 'AGIHAN',
}) => {
  const [activeTab, setActiveTab] = useState<TimetableTab>(initialTab);
  const [selectedYear, setSelectedYear] = useState<string>(activeAcademicYear || '2027');
  const [displayMode, setDisplayMode] = useState<'NUMBER' | 'CODE'>('CODE');
  const [personnelList, setPersonnelList] = useState<PersonnelProfile[]>([]);
  const [matrixData, setMatrixData] = useState<SubjectAllocationRow[]>(() => buildDefaultCurriculumMatrix(activeAcademicYear || '2027'));
  const [classTeachers, setClassTeachers] = useState<Record<number, string>>(() => getDefaultClassTeachers());

  const [schedule, setSchedule] = useState<ScheduleGrid>(createEmptyScheduleGrid());
  const [clashes, setClashes] = useState<TimetableClash[]>([]);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

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
        // 1. Load Personnel (Strictly teachers; exclude AKP)
        const pSnap = await getDocs(collection(db, 'personnel')).catch(() => null);
        const teachers: PersonnelProfile[] = [];
        if (pSnap && !pSnap.empty) {
          pSnap.forEach((d) => {
            const data = d.data();
            if (isTeacherForTimetable(data)) {
              teachers.push({ id: d.id, ...data } as PersonnelProfile);
            }
          });
        }

        // Merge official teachers if any are missing (ensures Muhammad Fahim Amar & all 14 teachers are present)
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

        if (isMounted) setPersonnelList(teachers);

        // 2. Load Matrix Data (Fallback to official default curriculum allocation if not yet saved)
        const matrixDocRef = doc(db, 'school_timetables', `matrix_${selectedYear}`);
        const matrixSnap = await getDoc(matrixDocRef);
        if (matrixSnap.exists()) {
          const mData = matrixSnap.data();
          if (Array.isArray(mData.matrixData) && mData.matrixData.length > 0 && isMounted) {
            setMatrixData(mData.matrixData);
          } else if (isMounted) {
            setMatrixData(buildDefaultCurriculumMatrix(selectedYear));
          }
          if (mData.classTeachers && Object.values(mData.classTeachers).filter(Boolean).length > 0 && isMounted) {
            setClassTeachers(mData.classTeachers);
          } else if (isMounted) {
            setClassTeachers(getDefaultClassTeachers());
          }
        } else if (isMounted) {
          setMatrixData(buildDefaultCurriculumMatrix(selectedYear));
          setClassTeachers(getDefaultClassTeachers());
        }

        // 3. Load Schedule Grid
        const scheduleDocRef = doc(db, 'school_timetables', `schedule_${selectedYear}`);
        const scheduleSnap = await getDoc(scheduleDocRef);
        if (scheduleSnap.exists()) {
          const sData = scheduleSnap.data();
          if (sData.schedule && isMounted) {
            setSchedule(sData.schedule);
            const foundClashes = detectScheduleClashes(sData.schedule);
            setClashes(foundClashes);
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
  }, [selectedYear]);

  // Teacher Mapping for code & num resolution
  const teacherMapping = useMemo(() => {
    const sourceList: PersonnelProfile[] = [...personnelList];

    // Ensure all 14 official teachers exist in the list
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

    const list = sourceList.slice(0, 50).map((t, idx) => {
      const num = idx + 1;
      let cleanName = (t.name || '').replace(/\s+/g, ' ').trim();
      if (cleanName.toUpperCase().includes('FAHIM') && cleanName.toUpperCase().includes('AMAR')) {
        cleanName = 'MUHAMMAD FAHIM AMAR';
      } else if (cleanName.toUpperCase().includes('STEPHANIE') && cleanName.toUpperCase().includes('WONG')) {
        cleanName = 'STEPHANIE WONG ENG HEE';
      }

      // Generate short form (rule: 4 words -> 2 initials, e.g. Stephanie Wong Eng Hee -> SW)
      const code = (t as any).code || generateTeacherShortCode(cleanName);

      return {
        id: t.id,
        num,
        code,
        name: cleanName,
      };
    });

    return { list };
  }, [personnelList]);

  // Update schedule handler
  const handleUpdateSchedule = (newSchedule: ScheduleGrid) => {
    setSchedule(newSchedule);
    const foundClashes = detectScheduleClashes(newSchedule);
    setClashes(foundClashes);
  };

  // Auto Schedule Generation (Self-healing with official curriculum fallback)
  const handleRunAutoScheduler = () => {
    let currentMatrix = matrixData;
    let currentClassTeachers = classTeachers;

    if (!currentMatrix || currentMatrix.length === 0) {
      currentMatrix = buildDefaultCurriculumMatrix(selectedYear);
      setMatrixData(currentMatrix);
    }

    if (!currentClassTeachers || Object.values(currentClassTeachers).filter(Boolean).length === 0) {
      currentClassTeachers = getDefaultClassTeachers();
      setClassTeachers(currentClassTeachers);
    }

    try {
      setSaveStatus('Sedang menjana jadual waktu secara automatik...');
      const variationSeed = Math.floor(Math.random() * 10000) + 1;
      const { grid, clashes: newClashes, unplaced } = generateAutoSchedule(
        currentMatrix,
        currentClassTeachers,
        selectedYear,
        variationSeed
      );

      setSchedule(grid);
      setClashes(newClashes);

      // Persist generated schedule to Firestore
      const scheduleDocRef = doc(db, 'school_timetables', `schedule_${selectedYear}`);
      const payload = JSON.parse(
        JSON.stringify({
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
      const scheduleDocRef = doc(db, 'school_timetables', `schedule_${selectedYear}`);
      const payload = JSON.parse(
        JSON.stringify({
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

  return (
    <div className="space-y-6">
      {/* System Navigation Tabs Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
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

      {saveStatus && (
        <div
          className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
            saveStatus.includes('Ralat')
              ? 'bg-rose-950/80 border-rose-700 text-rose-200'
              : 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>{saveStatus}</span>
        </div>
      )}

      {/* Main Tab View Rendering */}
      <div>
        {activeTab === 'AGIHAN' && (
          <SchoolTimetableMatrix activeAcademicYear={selectedYear} />
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
            classTeachers={classTeachers}
            displayMode={displayMode}
            teacherMapping={teacherMapping}
            initialOrientation="PORTRAIT"
          />
        )}

        {activeTab === 'JUTAMAL' && (
          <JUtamaView
            schedule={schedule}
            academicYear={selectedYear}
            classTeachers={classTeachers}
            displayMode={displayMode}
            teacherMapping={teacherMapping}
            initialOrientation="LANDSCAPE"
          />
        )}

        {activeTab === 'JT1_6' && (
          <ClassTimetableView
            schedule={schedule}
            academicYear={selectedYear}
            classTeachers={classTeachers}
            matrixData={matrixData}
            displayMode={displayMode}
            teacherMapping={teacherMapping}
            onUpdateSchedule={handleUpdateSchedule}
          />
        )}

        {activeTab === 'BGURU' && (
          <BilikGuruReliefView
            schedule={schedule}
            academicYear={selectedYear}
            teacherMapping={teacherMapping}
            displayMode={displayMode}
          />
        )}

        {activeTab === 'RELIEF' && (
          <ReliefSchedulingView />
        )}

        {activeTab === 'JG1_50' && (
          <TeacherTimetableView
            schedule={schedule}
            academicYear={selectedYear}
            teacherMapping={teacherMapping}
            displayMode={displayMode}
            defaultTeacherCode={defaultTeacherCode}
          />
        )}
      </div>
    </div>
  );
};

export default TimetableSystem;
