
import React, { useState, useEffect, useMemo } from 'react';
import { doc, getDocFromServer, collection, query, where, getDocs, addDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { UserProfile, Student, UasaResult, PbdResult } from '../../types';
import { calculateGrade, calculateMastery } from '../../utils/calculations';
import {
  getPbdStatus,
  getPbdSemanticColor,
  getUasaGrade,
  getUasaGradeInterpretation,
  getUasaSemanticColor,
  getProgressDirection,
  getNearMissStatus,
  getMismatchStatus,
  getInterventionPriority,
  ACADEMIC_COLOR_TOKENS,
  PBD_CHART_PALETTE,
  UASA_CHART_PALETTE,
  resolvePbdScale,
  PbdScaleConfig,
} from '../../utils/academicVisualStandard';
import {
  PbdBadge,
  UasaBadge,
  ProgressIndicator,
  NearMissBadge,
  MismatchBadge,
  InterventionPriorityBadge,
} from '../Academic/AcademicBadges';
import { SUBJECTS_BY_YEAR, ACADEMIC_YEARS, DEFAULT_ACADEMIC_YEAR, CLASSES } from '../../constants';
import { useSchoolTenant } from '../../contexts/SchoolTenantContext';
import { belongsToSchool, scopedDocId } from '../../utils/schoolTenant';
import SchoolLogo from '../SchoolLogo';
import { StudentProfileModal } from '../Student/StudentProfileModal';
import { Save, Search, Table as TableIcon, FileEdit, CheckCircle, AlertTriangle, Users, BarChart3, PieChart as PieChartIcon, TrendingUp, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line, LabelList } from 'recharts';

interface Props {
  profile: UserProfile;
  initialAssessmentType?: 'PBD' | 'UASA';
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function SubjectTeacherView({ profile, initialAssessmentType = 'PBD' }: Props) {
  const { schoolCode: activeSchoolCode, schoolName: tenantSchoolName } = useSchoolTenant();
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(profile.year_assigned || 1);
  const [selectedSubject, setSelectedSubject] = useState<string>(profile.subject_assigned || (SUBJECTS_BY_YEAR[1] ? SUBJECTS_BY_YEAR[1][0] : ''));
  const [assessmentType, setAssessmentType] = useState<'UASA' | 'PBD'>(initialAssessmentType);
  const [term, setTerm] = useState(1);
  const [academicYear, setAcademicYear] = useState(DEFAULT_ACADEMIC_YEAR);
  const [results, setResults] = useState<Record<string, any>>({});
  const resultsRef = React.useRef(results);
  useEffect(() => {
    resultsRef.current = results;
  }, [results]);
  const [loading, setLoading] = useState(false);
  const [savedStatus, setSavedStatus] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'analysis'>('table');
  const [analysisSesi, setAnalysisSesi] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [profileStudentId, setProfileStudentId] = useState<string | null>(null);

  // OPEN_TEACHERS Mode: active teachers have full subject and year access
  const availableYears = useMemo<number[]>(() => [1, 2, 3, 4, 5, 6], []);

  const availableSubjects = useMemo<string[]>(() => {
    return SUBJECTS_BY_YEAR[selectedYear] || [];
  }, [selectedYear]);

  // Versioned Assessment Scale resolution: 2026 -> 6-level (TP1-TP6), 2027 Tahun 1 -> 3-level (TP1-TP3)
  const activeScale = useMemo<PbdScaleConfig>(() => {
    return resolvePbdScale({
      academicYear,
      yearLevel: selectedYear,
      subjectId: selectedSubject,
    });
  }, [academicYear, selectedYear, selectedSubject]);

  // Keep assessmentType in sync with prop if it changes
  useEffect(() => {
    if (initialAssessmentType) {
      setAssessmentType(initialAssessmentType);
    }
  }, [initialAssessmentType]);

  // Handle auto-adjustments when filters update
  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  useEffect(() => {
    if (availableSubjects.length > 0 && !availableSubjects.includes(selectedSubject)) {
      setSelectedSubject(availableSubjects[0]);
    } else if (availableSubjects.length === 0) {
      setSelectedSubject('');
    }
  }, [availableSubjects, selectedSubject]);

  const filteredStudents = useMemo(() => {
    return students.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [students, searchQuery]);

  const saveTimeouts = React.useRef<Record<string, NodeJS.Timeout>>({});

  const COLORS = ['#ef4444', '#f97316', '#eab308', '#a3e635', '#22c55e', '#3b82f6'];

  const academicYears = ACADEMIC_YEARS;

  useEffect(() => {
    // Clear results state first to avoid mixing results of different assessment types/subjects/years/schools
    setResults({});
    // Clear timeouts
    Object.values(saveTimeouts.current).forEach(clearTimeout);
    saveTimeouts.current = {};
    fetchStudents();
  }, [selectedYear, academicYear, assessmentType, term, selectedSubject, activeSchoolCode]);

  // For PBD, we use a fixed term (1) because all columns (TOV-ETR) are in one record
  const effectiveTerm = assessmentType === 'PBD' ? 1 : term;

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'students'),
        where('year', '==', Number(selectedYear)),
        where('academic_year', '==', academicYear)
      );
      const snapshot = await getDocs(q);
      const list = snapshot.docs
        .filter(d => belongsToSchool(d.data(), activeSchoolCode))
        .map(doc => ({ id: doc.id, ...doc.data() as any } as Student));
      list.sort((a, b) => a.name.localeCompare(b.name));
      setStudents(list);
      
      // Fetch existing results for these students
      await fetchExistingResults(list);
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  const fetchExistingResults = async (studentList: Student[]) => {
    if (studentList.length === 0 || !selectedSubject) {
      setResults({});
      return;
    }
    
    const collectionName = assessmentType === 'UASA' ? 'uasa_results' : 'pbd_results';
    const q = query(
      collection(db, collectionName),
      where('subject_id', '==', selectedSubject),
      where('term', '==', Number(effectiveTerm)),
      where('year', '==', Number(selectedYear)),
      where('academic_year', '==', academicYear)
    );
    
    const snapshot = await getDocs(q);
    const existing: Record<string, any> = {};
    
    // Filter by active schoolCode and sort by updatedAt descending to prioritize newest records if duplicates exist
    // Special handling for serverTimestamp(): it might be null locally before sync
    const sortedDocs = snapshot.docs
      .filter(docSnap => belongsToSchool(docSnap.data(), activeSchoolCode))
      .sort((a, b) => {
        const timeA = a.data().updatedAt?.seconds || 0;
        const timeB = b.data().updatedAt?.seconds || 0;
        return timeB - timeA;
      });

    sortedDocs.forEach(docSnap => {
      const data = docSnap.data();
      const studentId = data.student_id;
      
      if (!existing[studentId]) {
        existing[studentId] = { id: docSnap.id, ...data };
      } else {
        // If the current doc in loop is THE deterministic one, we prefer its ID
        const deterministicId = scopedDocId(
          activeSchoolCode,
          `${studentId}_${selectedSubject}_${effectiveTerm}_${academicYear.replace(/\//g, '-')}`
        );
        if (docSnap.id === deterministicId) {
          existing[studentId].id = docSnap.id;
        }

        // Fill in any missing fields in the newest record with data from older records.
        Object.keys(data).forEach(key => {
          if (existing[studentId][key] === undefined || existing[studentId][key] === null || existing[studentId][key] === '') {
            existing[studentId][key] = data[key];
          }
        });
      }
    });

    setResults(prev => {
      // Merge: maintain local "dirty" changes that haven't been saved yet
      const merged = { ...existing };
      Object.keys(prev).forEach(sid => {
        if (saveTimeouts.current[sid]) {
          merged[sid] = { ...merged[sid], ...prev[sid] };
        }
      });
      return merged;
    });
  };

  const forceSave = (studentId: string) => {
    if (saveTimeouts.current[studentId]) {
      clearTimeout(saveTimeouts.current[studentId]);
      delete saveTimeouts.current[studentId];
    }
    const studentData = resultsRef.current[studentId];
    if (studentData) {
      queueSave(studentId, studentData);
    }
  };

  const handleResultChange = (studentId: string, field: string, value: any) => {
    // Update local state and ref immediately for snappy UI
    setResults(prev => {
      const updated = {
        ...prev,
        [studentId]: {
          ...prev[studentId],
          [field]: value
        }
      };
      resultsRef.current = updated;
      return updated;
    });
    
    // Debounce the save operation
    if (saveTimeouts.current[studentId]) {
      clearTimeout(saveTimeouts.current[studentId]);
    }

    saveTimeouts.current[studentId] = setTimeout(() => {
      const studentData = resultsRef.current[studentId];
      if (studentData) {
        queueSave(studentId, studentData);
      }
    }, field === 'rumusan' ? 1000 : 300); // Wait longer for text input
  };

  const queueSave = async (studentId: string, data: any) => {
    setSavedStatus('Menyimpan...');
    const collectionName = assessmentType === 'UASA' ? 'uasa_results' : 'pbd_results';
    try {
      const resultId = scopedDocId(
        activeSchoolCode,
        `${studentId}_${selectedSubject}_${effectiveTerm}_${academicYear.replace(/\//g, '-')}`
      );
      const docRef = doc(db, collectionName, resultId);

      const payload: any = {
        schoolCode: activeSchoolCode,
        student_id: studentId,
        subject_id: selectedSubject,
        term: Number(effectiveTerm),
        year: Number(selectedYear),
        academic_year: academicYear,
        updatedAt: serverTimestamp(),
      };

      if (assessmentType === 'UASA') {
        const rawMarks = data.marks;
        let marks: any = null;
        if (rawMarks !== undefined && rawMarks !== null && rawMarks !== '') {
          if (['TH', 'N/A'].includes(String(rawMarks).toUpperCase())) {
            marks = String(rawMarks).toUpperCase();
          } else {
            marks = Number(rawMarks);
            if (isNaN(marks)) marks = 0;
          }
        }
        payload.marks = marks;
        payload.grade = calculateGrade(marks !== null ? marks : '');
        payload.rumusan = data.rumusan || '';
      } else {
        // Extract only PBD fields to prevent Firestore rule violations due to extra keys
        ['tov', 'oti1', 'ar1', 'oti2', 'ar2', 'etr', 'tp'].forEach(field => {
          let val = data[field];
          if (typeof val === 'string') {
            val = val.replace(/^TP/i, '').trim(); // Remove "TP" prefix (e.g. "TP3" -> "3")
          }
          if (val === '' || val === null || val === undefined) {
            payload[field] = null;
          } else if (['TH', 'N/A'].includes(String(val).toUpperCase())) {
            payload[field] = String(val).toUpperCase();
          } else {
            const num = Number(val);
            payload[field] = isNaN(num) ? null : num;
          }
        });

        // Compute default tp value if null
        if (payload.tp === null) {
          payload.tp = payload.ar1 !== null ? payload.ar1 : (payload.ar2 !== null ? payload.ar2 : null);
        }

        const currentAR = term === 1 ? 'ar1' : 'ar2';
        if (payload[currentAR] !== null && !['TH', 'N/A'].includes(String(payload[currentAR]))) {
          payload.mastery = calculateMastery(Number(payload[currentAR]));
        } else {
          payload.mastery = 'N/A';
        }
        payload.rumusan = data.rumusan || '';
      }

      await setDoc(docRef, payload, { merge: true });
      
      // Update local state with the deterministic ID and payload
      setResults(prev => ({
        ...prev,
        [studentId]: { ...prev[studentId], ...payload, id: resultId }
      }));

      setSavedStatus('Tersimpan secara automatik');
      setTimeout(() => setSavedStatus(null), 2000);
    } catch (error) {
       console.error("Save error encountered:", error);
       const errMsg = error instanceof Error ? error.message : String(error);
       setSavedStatus(`Ralat: ${errMsg}`);
    }
  };

  const getSelectStyle = (tp: any) => {
    if (tp === undefined || tp === null || tp === '' || tp === '-' || tp === 0 || tp === '0') {
      return {
        className: 'w-full py-2 px-1 rounded-lg text-center font-extrabold text-sm border-2 border-slate-300 bg-white text-slate-800 hover:border-blue-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 shadow-sm cursor-pointer transition-all',
        style: { backgroundColor: '#ffffff', color: '#1e293b' },
      };
    }
    const color = getPbdSemanticColor(tp, activeScale);
    if (color === 'academicDanger') {
      return {
        className: 'w-full py-2 px-1 rounded-lg text-center font-black text-sm border-2 border-rose-600 bg-rose-600 text-white shadow-md cursor-pointer transition-all',
        style: { backgroundColor: '#e11d48', color: '#ffffff' },
      };
    }
    if (color === 'academicWarning') {
      return {
        className: 'w-full py-2 px-1 rounded-lg text-center font-black text-sm border-2 border-amber-600 bg-amber-500 text-white shadow-md cursor-pointer transition-all',
        style: { backgroundColor: '#d97706', color: '#ffffff' },
      };
    }
    if (color === 'academicCaution') {
      return {
        className: 'w-full py-2 px-1 rounded-lg text-center font-black text-sm border-2 border-yellow-500 bg-yellow-400 text-slate-950 shadow-md cursor-pointer transition-all',
        style: { backgroundColor: '#facc15', color: '#09090b' },
      };
    }
    if (color === 'academicSuccess') {
      return {
        className: 'w-full py-2 px-1 rounded-lg text-center font-black text-sm border-2 border-emerald-600 bg-emerald-600 text-white shadow-md cursor-pointer transition-all',
        style: { backgroundColor: '#059669', color: '#ffffff' },
      };
    }
    return {
      className: 'w-full py-2 px-1 rounded-lg text-center font-extrabold text-sm border-2 border-slate-300 bg-white text-slate-800 shadow-sm cursor-pointer transition-all',
      style: { backgroundColor: '#ffffff', color: '#1e293b' },
    };
  };

  const getTPColor = (tp: any) => getSelectStyle(tp).className;
  const getTPBg = (tp: any) => {
    if (tp === undefined || tp === null || tp === '' || tp === '-' || tp === 0 || tp === '0') {
      return undefined;
    }
    const color = getPbdSemanticColor(tp, activeScale);
    if (color === 'academicNeutral') return undefined;
    return ACADEMIC_COLOR_TOKENS[color]?.hex;
  };

  const getAnalysisData = () => {
    const resultsArray = Object.values(results);
    
    // Grade/TP Distribution
    const dist: { [key: string]: number } = {};
    const key = assessmentType === 'UASA' ? 'grade' : (analysisSesi === 1 ? 'ar1' : 'ar2');
    
    resultsArray.forEach(r => {
      const val = r[key];
      if (val) {
        const name = assessmentType === 'PBD' ? `TP${val}` : val;
        dist[name] = (dist[name] || 0) + 1;
      }
    });

    const pieData = Object.entries(dist).map(([name, value]) => ({ name, value }));

    // PBD Progression based on analysisSesi
    const progressionKeys = analysisSesi === 1 ? ['tov', 'oti1', 'ar1', 'etr'] : ['ar1', 'oti2', 'ar2', 'etr'];
    const pbdProgression = progressionKeys.map(k => {
      const counts: Record<string, number> = {};
      activeScale.levels.forEach(lvl => {
        counts[String(lvl.order)] = 0;
      });
      const validResults = resultsArray.filter(r => r[k] && !isNaN(Number(r[k])));
      validResults.forEach(r => {
        const val = String(r[k]);
        if (counts[val] !== undefined) counts[val]++;
      });

      const total = validResults.length || 1;
      const data: any = { 
        name: k.toUpperCase(), 
        avg: validResults.length > 0 
          ? (validResults as any[]).reduce((acc: number, curr: any) => acc + Number(curr[k]), 0) / validResults.length 
          : 0,
        count: validResults.length
      };

      activeScale.levels.forEach(lvl => {
        data[lvl.code] = Number((((counts[String(lvl.order)] || 0) / total) * 100).toFixed(0));
      });

      return data;
    });

    return { pieData, pbdProgression };
  };

  const { pieData, pbdProgression } = getAnalysisData();

  return (
    <div className="space-y-6 pb-20">
      <div className="bg-white p-6 rounded-[30px] border border-slate-200 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <SchoolLogo className="w-16 h-16" p="p-1" />
          <div>
            <div className="flex flex-col">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-none">{tenantSchoolName}</h4>
              <h1 className="text-2xl font-black italic uppercase tracking-tighter text-slate-900 leading-none">Guru Mata Pelajaran</h1>
            </div>
            <p className="text-slate-500 text-xs mt-1 italic">Data disimpan secara automatik semasa anda mengisi.</p>
          </div>
        </div>
        {savedStatus && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border ${savedStatus.includes('Ralat') ? 'bg-red-50 text-red-600 border-red-200' : 'bg-blue-50 text-blue-600 border-blue-200'}`}
          >
            {savedStatus.includes('Ralat') ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
            {savedStatus}
          </motion.div>
        )}
      </div>

      {/* Operational Mode & Teacher Identity Banner */}
      <div className="bg-white border border-slate-200 rounded-[24px] p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 text-white w-10 h-10 flex items-center justify-center text-xs font-black rounded-xl">
            {profile.name ? profile.name.slice(0, 2).toUpperCase() : 'GU'}
          </div>
          <div>
            <h4 className="text-sm font-black text-slate-800 uppercase">
              {profile.name || 'Guru Mata Pelajaran'}
            </h4>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px] font-black uppercase">
                {profile.category || 'GURU'}
              </span>
              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-black uppercase">
                Akses Terbuka (OPEN_TEACHERS)
              </span>
            </div>
          </div>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button 
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all ${viewMode === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <TableIcon size={16} /> MASUKAN MARKAH
          </button>
          <button 
            onClick={() => setViewMode('analysis')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all ${viewMode === 'analysis' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <BarChart3 size={16} /> ANALISIS & STATISTIK
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 bg-white p-6 rounded-2xl border-2 border-slate-200 shadow-sm col-span-full">
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-800 uppercase tracking-wider">Sesi Akademik</label>
            <select 
              value={academicYear} 
              onChange={(e) => setAcademicYear(e.target.value)}
              style={{ color: '#0f172a', backgroundColor: '#ffffff' }}
              className="w-full bg-white border-2 border-slate-300 rounded-xl p-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 font-extrabold text-slate-900 shadow-sm cursor-pointer"
            >
              {academicYears.map(y => <option key={y} value={y} style={{ color: '#0f172a', backgroundColor: '#ffffff' }} className="bg-white text-slate-900 font-bold">{y}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-800 uppercase tracking-wider">Tahun</label>
            <select 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              style={{ color: '#0f172a', backgroundColor: '#ffffff' }}
              className="w-full bg-white border-2 border-slate-300 rounded-xl p-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 font-extrabold text-slate-900 shadow-sm cursor-pointer"
            >
              {availableYears.map(v => <option key={v} value={v} style={{ color: '#0f172a', backgroundColor: '#ffffff' }} className="bg-white text-slate-900 font-bold">Tahun {v}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-800 uppercase tracking-wider">Mata Pelajaran</label>
            <select 
              value={selectedSubject} 
              onChange={(e) => setSelectedSubject(e.target.value)}
              style={{ color: '#1d4ed8', backgroundColor: '#ffffff' }}
              className="w-full bg-white border-2 border-slate-300 rounded-xl p-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 font-extrabold text-blue-700 shadow-sm cursor-pointer" 
            >
              <option value="" style={{ color: '#64748b', backgroundColor: '#ffffff' }} className="bg-white text-slate-500 font-semibold">Pilih Subjek</option>
              {availableSubjects.map(s => (
                <option key={s} value={s} style={{ color: '#0f172a', backgroundColor: '#ffffff' }} className="bg-white text-slate-900 font-bold">{s}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-700 uppercase tracking-wider">Jenis Penilaian</label>
            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
              <button 
                onClick={() => setAssessmentType('UASA')}
                className={`flex-1 py-1.5 px-3 rounded-md text-xs font-black transition-all ${assessmentType === 'UASA' ? 'bg-white shadow-sm text-blue-700' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Pentaksiran sumatif
              </button>
              <button 
                onClick={() => setAssessmentType('PBD')}
                className={`flex-1 py-1.5 px-3 rounded-md text-xs font-black transition-all ${assessmentType === 'PBD' ? 'bg-white shadow-sm text-blue-700' : 'text-slate-600 hover:text-slate-900'}`}
              >
                PBD (Excel)
              </button>
            </div>
          </div>
          {assessmentType === 'UASA' && (
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-700 uppercase tracking-wider">Penggal</label>
              <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                {[1, 2].map(v => (
                  <button 
                    key={v}
                    onClick={() => setTerm(v)}
                    className={`flex-1 py-1.5 px-3 rounded-md text-xs font-black transition-all ${term === v ? 'bg-white shadow-sm text-blue-700' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    T{v}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

      {/* Input Table */}
      {/* Content Area */}
      <AnimatePresence mode="wait">
        {viewMode === 'table' ? (
          <motion.div 
            key="table"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden min-h-[400px] overscroll-contain"
          >
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50/80 sticky top-0 z-20 backdrop-blur-sm">
              <div className="flex items-center gap-4">
                 <div className="bg-blue-600 text-white p-2.5 rounded-xl shadow-md">
                    <TableIcon size={20} />
                 </div>
                 <div>
                    <h3 className="font-black text-slate-900 uppercase tracking-tight text-base">
                      Senarai Murid ({students.length})
                    </h3>
                    <p className="text-[11px] text-blue-600 font-extrabold uppercase tracking-widest">{selectedSubject || 'Sila Pilih Subjek'}</p>
                 </div>
              </div>
              <div className="flex items-center gap-3">
                 <div className="relative">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                   <input 
                     type="text" 
                     placeholder="Cari nama murid..." 
                     value={searchQuery}
                     onChange={(e) => setSearchQuery(e.target.value)}
                     style={{ color: '#0f172a', backgroundColor: '#ffffff' }}
                     className="pl-10 pr-4 py-2 bg-white border-2 border-slate-300 rounded-xl text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none w-64 shadow-sm" 
                   />
                 </div>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full text-left border-collapse table-fixed min-w-[1000px]">
                <thead className="sticky top-0 bg-slate-100 backdrop-blur z-10 shadow-sm">
                  <tr className="text-slate-900 text-[11px] font-black uppercase tracking-wider border-b-2 border-slate-300">
                    <th className="px-4 py-4 w-12 text-center border-r border-slate-200 bg-slate-200/80 text-slate-900">BIL</th>
                    <th className="px-6 py-4 w-64 border-r border-slate-200 text-slate-900">NAMA MURID</th>
                    {assessmentType === 'UASA' ? (
                      <>
                        <th className="px-6 py-4 w-32 border-r border-slate-200 text-center text-slate-900">MARKAH</th>
                        <th className="px-6 py-4 w-24 border-r border-slate-200 text-center text-slate-900">GRED</th>
                        <th className="px-6 py-4 border-r border-slate-200 text-slate-900">ULASAN / RUMUSAN</th>
                      </>
                    ) : (
                      <>
                        <th className="px-2 py-4 w-20 text-center border-r border-slate-200 bg-slate-200/60 font-black text-slate-900">TOV</th>
                        <th className="px-2 py-4 w-20 text-center border-r border-slate-200 text-slate-900">OTI1</th>
                        <th className="px-2 py-4 w-20 text-center border-r border-slate-200 bg-emerald-100 font-black text-emerald-950">AR1</th>
                        <th className="px-2 py-4 w-20 text-center border-r border-slate-200 text-slate-900">OTI2</th>
                        <th className="px-2 py-4 w-20 text-center border-r border-slate-200 bg-blue-100 font-black text-blue-950">AR2</th>
                        <th className="px-2 py-4 w-20 text-center border-r border-slate-200 bg-rose-100 font-black text-rose-950">ETR</th>
                        <th className="px-6 py-4 min-w-[200px] text-slate-900">RUMUSAN GURU</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-6 py-20 text-center bg-slate-50">
                        <div className="flex flex-col items-center gap-4 text-slate-400">
                           <Users size={48} strokeWidth={1} />
                           <p className="italic font-bold text-slate-700">{searchQuery ? 'Carian tiada padanan.' : 'Sila pilih tahun dan subjek untuk memaparkan senarai murid.'}</p>
                           <p className="text-[10px] uppercase font-black tracking-widest text-slate-600">Pastikan data murid telah diimport oleh Setiausaha Pentaksiran</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((student, idx) => (
                      <tr key={student.id} className="hover:bg-blue-50/50 transition-colors group border-b border-slate-200">
                        <td className="px-4 py-3 text-[11px] font-black text-slate-700 text-center border-r border-slate-200 bg-slate-50 group-hover:bg-blue-100 transition-colors">{idx + 1}</td>
                        <td className="px-6 py-3 font-bold text-sm text-slate-900 border-r border-slate-200">
                          <button
                            type="button"
                            onClick={() => setProfileStudentId(student.student_id || student.id)}
                            className="text-left font-black text-slate-900 hover:text-blue-600 hover:underline uppercase transition-colors cursor-pointer flex items-center gap-1.5 group/sbtn"
                            title="Klik untuk lihat Profil Lengkap & Kecemasan Murid"
                          >
                            <span>{student.name}</span>
                            <span className="opacity-0 group-hover/sbtn:opacity-100 text-[10px] text-blue-500 font-mono transition-opacity">
                              [Profil]
                            </span>
                          </button>
                        </td>
                        
                        {assessmentType === 'UASA' ? (
                           <>
                             <td className="px-6 py-3 border-r border-slate-200">
                               <input 
                                 type="text"
                                 inputMode="numeric"
                                 value={results[student.student_id]?.marks ?? ''}
                                 onBlur={() => forceSave(student.student_id)}
                                 onChange={(e) => {
                                   const val = e.target.value.toUpperCase();
                                   if (val === '' || /^\d+$/.test(val) || val === 'TH' || val === 'N/A') {
                                     handleResultChange(student.student_id, 'marks', val);
                                   }
                                 }}
                                 style={{ color: '#0f172a', backgroundColor: '#ffffff' }}
                                 className="w-full px-2 py-2 bg-white border-2 border-slate-300 rounded-lg focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none text-center font-black text-lg text-slate-900 shadow-sm"
                                 placeholder="-"
                               />
                             </td>
                             <td className="px-6 py-3 text-center border-r border-slate-200">
                                <UasaBadge
                                  mark={results[student.student_id]?.marks}
                                  grade={results[student.student_id]?.grade}
                                  showMark={false}
                                  size="md"
                                />
                             </td>
                             <td className="px-6 py-3">
                                <input 
                                  type="text"
                                  value={results[student.student_id]?.rumusan || ''}
                                  onBlur={() => forceSave(student.student_id)}
                                  onChange={(e) => handleResultChange(student.student_id, 'rumusan', e.target.value)}
                                  placeholder="Tambah ulasan..."
                                  style={{ color: '#0f172a', backgroundColor: '#ffffff' }}
                                  className="w-full px-4 py-2 bg-white border-2 border-slate-300 rounded-xl text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none shadow-sm"
                                />
                             </td>
                           </>
                        ) : (
                          <>
                            <td className="px-2 py-3 border-r border-slate-200">
                              {(() => {
                                const sel = getSelectStyle(results[student.student_id]?.tov);
                                return (
                                  <select 
                                    value={results[student.student_id]?.tov || ''}
                                    onChange={(e) => handleResultChange(student.student_id, 'tov', e.target.value)}
                                    style={sel.style}
                                    className={sel.className}
                                  >
                                    <option value="" style={{ backgroundColor: '#ffffff', color: '#1e293b' }} className="bg-white text-slate-800 font-bold">-</option>
                                    {activeScale.levels.map(lvl => (
                                      <option key={lvl.code} value={lvl.order} style={{ backgroundColor: '#ffffff', color: '#1e293b' }} className="bg-white text-slate-900 font-extrabold">
                                        {lvl.code}
                                      </option>
                                    ))}
                                  </select>
                                );
                              })()}
                            </td>
                            <td className="px-2 py-3 border-r border-slate-200">
                              {(() => {
                                const sel = getSelectStyle(results[student.student_id]?.oti1);
                                return (
                                  <select 
                                    value={results[student.student_id]?.oti1 || ''}
                                    onChange={(e) => handleResultChange(student.student_id, 'oti1', e.target.value)}
                                    style={sel.style}
                                    className={sel.className}
                                  >
                                    <option value="" style={{ backgroundColor: '#ffffff', color: '#1e293b' }} className="bg-white text-slate-800 font-bold">-</option>
                                    {activeScale.levels.map(lvl => (
                                      <option key={lvl.code} value={lvl.order} style={{ backgroundColor: '#ffffff', color: '#1e293b' }} className="bg-white text-slate-900 font-extrabold">
                                        {lvl.code}
                                      </option>
                                    ))}
                                  </select>
                                );
                              })()}
                            </td>
                            <td className="px-2 py-3 border-r border-slate-200 bg-emerald-50/50">
                              {(() => {
                                const sel = getSelectStyle(results[student.student_id]?.ar1);
                                return (
                                  <select 
                                    value={results[student.student_id]?.ar1 || ''}
                                    onChange={(e) => handleResultChange(student.student_id, 'ar1', e.target.value)}
                                    style={sel.style}
                                    className={sel.className}
                                  >
                                    <option value="" style={{ backgroundColor: '#ffffff', color: '#1e293b' }} className="bg-white text-slate-800 font-bold">-</option>
                                    {activeScale.levels.map(lvl => (
                                      <option key={lvl.code} value={lvl.order} style={{ backgroundColor: '#ffffff', color: '#1e293b' }} className="bg-white text-slate-900 font-extrabold">
                                        {lvl.code}
                                      </option>
                                    ))}
                                  </select>
                                );
                              })()}
                            </td>
                            <td className="px-2 py-3 border-r border-slate-200">
                              {(() => {
                                const sel = getSelectStyle(results[student.student_id]?.oti2);
                                return (
                                  <select 
                                    value={results[student.student_id]?.oti2 || ''}
                                    onChange={(e) => handleResultChange(student.student_id, 'oti2', e.target.value)}
                                    style={sel.style}
                                    className={sel.className}
                                  >
                                    <option value="" style={{ backgroundColor: '#ffffff', color: '#1e293b' }} className="bg-white text-slate-800 font-bold">-</option>
                                    {activeScale.levels.map(lvl => (
                                      <option key={lvl.code} value={lvl.order} style={{ backgroundColor: '#ffffff', color: '#1e293b' }} className="bg-white text-slate-900 font-extrabold">
                                        {lvl.code}
                                      </option>
                                    ))}
                                  </select>
                                );
                              })()}
                            </td>
                            <td className="px-2 py-3 border-r border-slate-200 bg-blue-50/50">
                              {(() => {
                                const sel = getSelectStyle(results[student.student_id]?.ar2);
                                return (
                                  <select 
                                    value={results[student.student_id]?.ar2 || ''}
                                    onChange={(e) => handleResultChange(student.student_id, 'ar2', e.target.value)}
                                    style={sel.style}
                                    className={sel.className}
                                  >
                                    <option value="" style={{ backgroundColor: '#ffffff', color: '#1e293b' }} className="bg-white text-slate-800 font-bold">-</option>
                                    {activeScale.levels.map(lvl => (
                                      <option key={lvl.code} value={lvl.order} style={{ backgroundColor: '#ffffff', color: '#1e293b' }} className="bg-white text-slate-900 font-extrabold">
                                        {lvl.code}
                                      </option>
                                    ))}
                                  </select>
                                );
                              })()}
                            </td>
                            <td className="px-2 py-3 border-r border-slate-200 bg-rose-50/50">
                              {(() => {
                                const sel = getSelectStyle(results[student.student_id]?.etr);
                                return (
                                  <select 
                                    value={results[student.student_id]?.etr || ''}
                                    onChange={(e) => handleResultChange(student.student_id, 'etr', e.target.value)}
                                    style={sel.style}
                                    className={sel.className}
                                  >
                                    <option value="" style={{ backgroundColor: '#ffffff', color: '#1e293b' }} className="bg-white text-slate-800 font-bold">-</option>
                                    {activeScale.levels.map(lvl => (
                                      <option key={lvl.code} value={lvl.order} style={{ backgroundColor: '#ffffff', color: '#1e293b' }} className="bg-white text-slate-900 font-extrabold">
                                        {lvl.code}
                                      </option>
                                    ))}
                                  </select>
                                );
                              })()}
                            </td>
                            <td className="px-6 py-3">
                               <input 
                                 type="text"
                                 value={results[student.student_id]?.rumusan || ''}
                                 onKeyDown={(e) => {
                                   if (e.key === 'Enter') {
                                     (e.target as any).blur();
                                   }
                                 }}
                                 onBlur={() => forceSave(student.student_id)}
                                 onChange={(e) => handleResultChange(student.student_id, 'rumusan', e.target.value)}
                                 placeholder="Ulasan rumusan guru..."
                                 style={{ color: '#0f172a', backgroundColor: '#ffffff' }}
                                 className="w-full px-3 py-2 bg-white border-2 border-slate-300 rounded-lg text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none shadow-sm transition-all"
                               />
                            </td>
                          </>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        ) : viewMode === 'analysis' ? (
          <motion.div 
            key="analysis"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            {/* TP/Grade Distribution Chart */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl">
               <div className="flex items-center gap-3 mb-8">
                  <div className="bg-emerald-100 text-emerald-600 p-2 rounded-xl">
                    <PieChartIcon size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 uppercase tracking-tight">Taburan {assessmentType}</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Bilangan Murid mengikut {assessmentType === 'PBD' ? 'Tahap Penguasaan' : 'Gred'}</p>
                  </div>
               </div>
               <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        innerRadius={0}
                        outerRadius={120}
                        paddingAngle={0}
                        dataKey="value"
                        label={({ percent = 0, cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0 }: any) => {
                          const RADIAN = Math.PI / 180;
                          const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                          const x = cx + radius * Math.cos(-midAngle * RADIAN);
                          const y = cy + radius * Math.sin(-midAngle * RADIAN);
                          return (
                            <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" className="text-sm font-black pointer-events-none">
                              {`${(Number(percent || 0) * 100).toFixed(0)}%`}
                            </text>
                          );
                        }}
                        labelLine={false}
                        stroke="#fff"
                        strokeWidth={2}
                      >
                        {pieData.map((entry, index) => {
                          const fill = assessmentType === 'PBD'
                            ? (PBD_CHART_PALETTE[entry.name as keyof typeof PBD_CHART_PALETTE] || '#94A3B8')
                            : (UASA_CHART_PALETTE[entry.name as keyof typeof UASA_CHART_PALETTE] || '#94A3B8');
                          return <Cell key={`cell-${index}`} fill={fill} />;
                        })}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
               </div>
            </div>

            {/* PBD Progression Chart */}
            {assessmentType === 'PBD' && (
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl">
                 <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-100 text-blue-600 p-2 rounded-xl">
                        <TrendingUp size={20} />
                      </div>
                      <div>
                        <h3 className="font-black text-slate-800 uppercase tracking-tight">Perbandingan Prestasi</h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Analisis Purata TP Murid</p>
                      </div>
                    </div>
                    <div className="flex bg-slate-100 p-1 rounded-xl self-start">
                       <button 
                         onClick={() => setAnalysisSesi(1)}
                         className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${analysisSesi === 1 ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}
                       >
                         SESI 1
                       </button>
                       <button 
                         onClick={() => setAnalysisSesi(2)}
                         className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${analysisSesi === 2 ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}
                       >
                         SESI 2
                       </button>
                    </div>
                 </div>
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={pbdProgression}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                        <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} tickFormatter={(val) => `${val}%`} />
                        <Tooltip 
                          cursor={{ fill: '#f8fafc' }}
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          formatter={(value) => `${value}%`}
                        />
                        <Legend iconType="circle" />
                        {activeScale.levels.map((lvl, lIdx) => (
                          <Bar
                            key={lvl.code}
                            dataKey={lvl.code}
                            stackId="a"
                            fill={lvl.colorToken || getTPBg(lvl.order)}
                            radius={lIdx === activeScale.levels.length - 1 ? [10, 10, 0, 0] : [0, 0, 0, 0]}
                          >
                            <LabelList dataKey={lvl.code} position="center" formatter={(v: any) => Number(v) > 5 ? `${v}%` : ''} className="text-[9px] font-black fill-white pointer-events-none" />
                          </Bar>
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                 </div>
              </div>
            )}

            {/* Overall Summary Stats */}
            <div className="lg:col-span-2 bg-slate-900 text-white p-8 rounded-3xl shadow-2xl flex flex-wrap gap-8 justify-around">
               <div className="text-center">
                  <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2">Jumlah Murid</p>
                  <p className="text-4xl font-black">{students.length}</p>
               </div>
               <div className="text-center border-l border-slate-800 pl-8">
                  <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2">Penilaian Selesai</p>
                  <p className="text-4xl font-black">{Object.keys(results).length}</p>
               </div>
               <div className="text-center border-l border-slate-800 pl-8">
                  <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2">Purata TP (AR{analysisSesi})</p>
                  <p className="text-4xl font-black text-blue-400">
                    {Math.round(pbdProgression.find(p => p.name === `AR${analysisSesi}`)?.avg || 0)}
                  </p>
               </div>
               <div className="text-center border-l border-slate-800 pl-8">
                  <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2">Sasaran ETR</p>
                  <p className="text-4xl font-black text-rose-400">
                    {Math.round(pbdProgression.find(p => p.name === 'ETR')?.avg || 0)}
                  </p>
               </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <StudentProfileModal
        studentId={profileStudentId}
        isOpen={!!profileStudentId}
        onClose={() => setProfileStudentId(null)}
        academicYear={academicYear}
      />
    </div>
  );
}


