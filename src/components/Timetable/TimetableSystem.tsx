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
  Bell
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
  const [selectedYear, setSelectedYear] = useState<string>(activeAcademicYear);
  const [displayMode, setDisplayMode] = useState<'NUMBER' | 'CODE'>('CODE');
  const [personnelList, setPersonnelList] = useState<PersonnelProfile[]>([]);
  const [matrixData, setMatrixData] = useState<SubjectAllocationRow[]>([]);
  const [classTeachers, setClassTeachers] = useState<Record<number, string>>({
    1: '', 2: '', 3: '', 4: '', 5: '', 6: '',
  });

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
        // 1. Load Personnel (Strictly teachers with g- email; exclude AKP)
        const pSnap = await getDocs(collection(db, 'personnel'));
        const teachers: PersonnelProfile[] = [];
        pSnap.forEach((d) => {
          const data = d.data();
          if (isTeacherForTimetable(data)) {
            teachers.push({ id: d.id, ...data } as PersonnelProfile);
          }
        });
        if (isMounted) setPersonnelList(teachers);

        // 2. Load Matrix Data
        const matrixDocRef = doc(db, 'school_timetables', `matrix_${selectedYear}`);
        const matrixSnap = await getDoc(matrixDocRef);
        if (matrixSnap.exists()) {
          const mData = matrixSnap.data();
          if (Array.isArray(mData.matrixData) && isMounted) {
            setMatrixData(mData.matrixData);
          }
          if (mData.classTeachers && isMounted) {
            setClassTeachers(mData.classTeachers);
          }
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
    const list = personnelList.slice(0, 50).map((t, idx) => {
      const num = idx + 1;
      const code =
        (t as any).code ||
        (t.name || '')
          .split(' ')
          .filter(Boolean)
          .map((w) => w[0])
          .join('')
          .toUpperCase()
          .slice(0, 4);
      return {
        id: t.id,
        num,
        code,
        name: t.name || '',
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

  // Auto Schedule Generation
  const handleRunAutoScheduler = () => {
    if (matrixData.length === 0) {
      alert('Sila lengkapkan agihan waktu dan guru di tab AGIHAN terlebih dahulu.');
      return;
    }

    const { grid, clashes: newClashes, unplaced } = generateAutoSchedule(
      matrixData,
      classTeachers,
      selectedYear
    );

    setSchedule(grid);
    setClashes(newClashes);

    if (unplaced.length > 0) {
      alert(`Jadual dijana dengan ${unplaced.length} subjek memerlukan pelarasan manual.`);
    } else {
      setSaveStatus('Jadual waktu berjaya dijana secara automatik tanpa pertembungan!');
      setTimeout(() => setSaveStatus(null), 4000);
    }
  };

  // Save Schedule to Firestore
  const handleSaveSchedule = async () => {
    try {
      setSaveStatus('Menyimpan jadual ke pangkalan data...');
      const scheduleDocRef = doc(db, 'school_timetables', `schedule_${selectedYear}`);
      await setDoc(
        scheduleDocRef,
        {
          academicYear: selectedYear,
          schedule,
          classTeachers,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
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

        {/* Global Controls: Mode Toggle & Save Schedule */}
        <div className="flex items-center gap-3 shrink-0">
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
