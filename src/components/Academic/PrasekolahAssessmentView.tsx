/**
 * iSEPADU AI — Pentaksiran Prasekolah Inspirasi (Teacher Entry & 1:1 Official Slip Printing)
 *
 * Features:
 * 1. Completely isolated Firestore collection: `prasekolah_assessments`
 * 2. Term switcher: Penggal 1 / Penggal 2 + Academic Year selector
 * 3. Auto-loads all Prasekolah students (5 Tahun / 6 Tahun) + Quick Add Student modal
 * 4. Fast Table Entry (Jadual Pantas) & Single Student Card Entry (Kad Individu + 1:1 Live Slip Preview)
 * 5. Automatic Kedudukan Akademik calculation (A=5, B=4, C=3, D=2, E=1, tie-breaker via Sikap & Nilai) with manual override support
 * 6. 1:1 Official A4 Portrait Slip printing (Single Student or Full Class Batch Printing)
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { UserProfile, SchoolSettings } from '../../types';
import { useSchoolTenant } from '../../contexts/SchoolTenantContext';
import {
  belongsToSchool,
  DEFAULT_SCHOOL_CODE,
  DEFAULT_SCHOOL_NAME,
  scopedDocId,
} from '../../utils/schoolTenant';
import { ACADEMIC_YEARS, DEFAULT_ACADEMIC_YEAR } from '../../constants';
import {
  PrasekolahAssessmentDoc,
  PrasekolahGrade,
  PrasekolahTerm,
  PrasekolahAkademikScores,
  PrasekolahSikapScores,
  PRASEKOLAH_GRADES,
  PRASEKOLAH_AKADEMIK_FIELDS,
  PRASEKOLAH_SIKAP_FIELDS,
  isPrasekolahStudentRecord,
  resolvePrasekolahStudentAge,
  normalizePrasekolahGrade,
  normalizePrasekolahTerm,
  computeAutoKedudukanList,
  computeAkademikPoints,
  computeSikapPoints,
  getPrasekolahGradeBadgeStyle,
  printPrasekolahSlipsA4,
} from '../../utils/prasekolahAssessmentHelper';
import { PrasekolahSlipCard } from './PrasekolahSlipCard';
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileEdit,
  LayoutGrid,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Table as TableIcon,
  Trophy,
  UserPlus,
  Users,
  BarChart3,
} from 'lucide-react';

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
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface PrasekolahAssessmentViewProps {
  currentUser: UserProfile;
  schoolSettings?: SchoolSettings | null;
  onOpenAnalysis?: () => void;
}

export const PrasekolahAssessmentView: React.FC<PrasekolahAssessmentViewProps> = ({
  currentUser,
  schoolSettings,
  onOpenAnalysis,
}) => {
  const tenant = useSchoolTenant();
  const activeSchoolCode =
    schoolSettings?.schoolCode || tenant.schoolCode || currentUser.schoolCode || DEFAULT_SCHOOL_CODE;
  const activeSchoolName =
    schoolSettings?.schoolName || tenant.schoolName || DEFAULT_SCHOOL_NAME;
  const activeSchoolLogo =
    schoolSettings?.schoolLogo ||
    schoolSettings?.logoUrl ||
    (tenant.schoolSettings as any)?.schoolLogo ||
    (tenant.schoolSettings as any)?.logoUrl ||
    '';

  const [academicYear, setAcademicYear] = useState<string>(DEFAULT_ACADEMIC_YEAR);
  const [term, setTerm] = useState<PrasekolahTerm>('Penggal 1');
  const [entryMode, setEntryMode] = useState<'TABLE' | 'CARD'>('TABLE');
  const [ageFilter, setAgeFilter] = useState<'ALL' | 5 | 6>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');

  const [records, setRecords] = useState<PrasekolahAssessmentDoc[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Quick Add Prasekolah Student Modal
  const [isAddStudentOpen, setIsAddStudentOpen] = useState<boolean>(false);
  const [newStudentName, setNewStudentName] = useState<string>('');
  const [newStudentIc, setNewStudentIc] = useState<string>('');
  const [newStudentAge, setNewStudentAge] = useState<5 | 6>(6);

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const buildDocId = (studentId: string, yr: string, trm: PrasekolahTerm) => {
    const termKey = trm === 'Penggal 2' ? 'P2' : 'P1';
    const cleanSid = String(studentId).replace(/[^a-zA-Z0-9_-]/g, '_');
    return scopedDocId(activeSchoolCode, `pra_${cleanSid}_${yr}_${termKey}`);
  };

  // Load Prasekolah students & their existing assessments for (academicYear, term)
  const loadPrasekolahData = async () => {
    setLoading(true);
    try {
      const [studSnap, masterSnap, assessSnap] = await Promise.all([
        getDocs(query(collection(db, 'students'), where('academic_year', '==', academicYear))).catch(
          () => null
        ),
        getDocs(collection(db, 'student_master')).catch(() => null),
        getDocs(
          query(
            collection(db, 'prasekolah_assessments'),
            where('academicYear', '==', academicYear)
          )
        ).catch(() => null),
      ]);

      // Build map of Prasekolah students
      const studentMap = new Map<
        string,
        { studentId: string; studentName: string; noKp: string; age: 5 | 6 }
      >();

      const isInactive = (st: any) => {
        const s = String(st?.studyStatus || st?.status || '').trim().toUpperCase();
        return ['BERPINDAH', 'TIDAK AKTIF', 'INACTIVE', 'KELUAR', 'TRANSFERRED'].includes(s);
      };

      if (masterSnap) {
        masterSnap.docs.forEach((d) => {
          const data = d.data();
          if (!belongsToSchool(data, activeSchoolCode)) return;
          if (isInactive(data)) return;
          if (!isPrasekolahStudentRecord(data)) return;
          const sid = String(data.student_id || d.id);
          const name = String(data.name || '').trim().toUpperCase();
          if (!sid || !name) return;
          studentMap.set(sid, {
            studentId: sid,
            studentName: name,
            noKp: String(data.noKp || data.icNumber || data.ic || '').replace(/[\s-]/g, ''),
            age: resolvePrasekolahStudentAge(data, academicYear),
          });
        });
      }

      if (studSnap) {
        studSnap.docs.forEach((d) => {
          const data = d.data();
          if (!belongsToSchool(data, activeSchoolCode)) return;
          if (isInactive(data)) return;
          if (!isPrasekolahStudentRecord(data)) return;
          const sid = String(data.student_id || d.id);
          const name = String(data.name || '').trim().toUpperCase();
          if (!sid || !name) return;
          const existing = studentMap.get(sid);
          studentMap.set(sid, {
            studentId: sid,
            studentName: name,
            noKp:
              String(data.noKp || data.icNumber || data.ic || existing?.noKp || '').replace(
                /[\s-]/g,
                ''
              ),
            age: resolvePrasekolahStudentAge(data, academicYear),
          });
        });
      }

      // Parse existing Prasekolah assessments for this school, year & term
      const existingAssessments = new Map<string, PrasekolahAssessmentDoc>();
      if (assessSnap) {
        assessSnap.docs.forEach((d) => {
          const data = d.data();
          if (!belongsToSchool(data, activeSchoolCode)) return;
          const docTerm = normalizePrasekolahTerm(data.term);
          const sid = String(data.studentId || data.student_id || '');
          const sName = String(data.studentName || data.name || '').trim().toUpperCase();
          if (!sid) return;

          // Ensure student is also in studentMap even if added directly via Prasekolah module
          if (!studentMap.has(sid) && sName) {
            studentMap.set(sid, {
              studentId: sid,
              studentName: sName,
              noKp: String(data.noKp || data.icNumber || ''),
              age: Number(data.age) === 5 ? 5 : 6,
            });
          }

          if (docTerm === term) {
            existingAssessments.set(sid, {
              id: d.id,
              schoolCode: activeSchoolCode,
              academicYear,
              term,
              studentId: sid,
              studentName: sName || studentMap.get(sid)?.studentName || 'MURID PRASEKOLAH',
              noKp: String(data.noKp || studentMap.get(sid)?.noKp || ''),
              age: Number(data.age) === 5 ? 5 : 6,
              akademik: {
                bm: normalizePrasekolahGrade(data.akademik?.bm),
                bc: normalizePrasekolahGrade(data.akademik?.bc),
                bi: normalizePrasekolahGrade(data.akademik?.bi),
                mt: normalizePrasekolahGrade(data.akademik?.mt),
              },
              sikapNilai: {
                disiplin: normalizePrasekolahGrade(data.sikapNilai?.disiplin),
                sosial: normalizePrasekolahGrade(data.sikapNilai?.sosial),
                keyakinanDiri: normalizePrasekolahGrade(data.sikapNilai?.keyakinanDiri),
                rajin: normalizePrasekolahGrade(data.sikapNilai?.rajin),
              },
              kedudukan: data.kedudukan ?? '',
              jumlahMurid: Number(data.jumlahMurid || 0),
              isManualKedudukan: Boolean(data.isManualKedudukan),
              updatedBy: data.updatedBy,
              updatedAt: data.updatedAt,
            });
          }
        });
      }

      // Merge students with assessments
      const mergedList: PrasekolahAssessmentDoc[] = Array.from(studentMap.values())
        .sort((a, b) => a.studentName.localeCompare(b.studentName))
        .map((st) => {
          const existing = existingAssessments.get(st.studentId);
          if (existing) {
            return {
              ...existing,
              studentName: existing.studentName || st.studentName,
              noKp: existing.noKp || st.noKp,
            };
          }
          return {
            id: buildDocId(st.studentId, academicYear, term),
            schoolCode: activeSchoolCode,
            academicYear,
            term,
            studentId: st.studentId,
            studentName: st.studentName,
            noKp: st.noKp,
            age: st.age,
            akademik: { bm: '', bc: '', bi: '', mt: '' },
            sikapNilai: { disiplin: '', sosial: '', keyakinanDiri: '', rajin: '' },
            kedudukan: '',
            jumlahMurid: studentMap.size,
            isManualKedudukan: false,
          };
        });

      const rankedList = computeAutoKedudukanList(mergedList, false);
      setRecords(rankedList);
      if (rankedList.length > 0 && !rankedList.some((r) => r.studentId === selectedStudentId)) {
        setSelectedStudentId(rankedList[0].studentId);
      }
    } catch (err) {
      console.error('Error loading Prasekolah assessments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrasekolahData();
  }, [academicYear, term, activeSchoolCode]);

  // Persist a batch of records to Firestore
  const persistRecordsToFirestore = async (listToSave: PrasekolahAssessmentDoc[], showBanner = true) => {
    if (listToSave.length === 0) return;
    setSaving(true);
    try {
      const batch = writeBatch(db);
      listToSave.forEach((rec) => {
        const docId = rec.id || buildDocId(rec.studentId, academicYear, term);
        const ref = doc(db, 'prasekolah_assessments', docId);
        batch.set(
          ref,
          {
            id: docId,
            schoolCode: activeSchoolCode,
            academicYear,
            term,
            studentId: rec.studentId,
            studentName: rec.studentName,
            noKp: rec.noKp || '',
            age: rec.age,
            akademik: rec.akademik,
            sikapNilai: rec.sikapNilai,
            kedudukan: rec.kedudukan === '' ? '' : Number(rec.kedudukan) || rec.kedudukan,
            jumlahMurid: Number(rec.jumlahMurid || listToSave.length),
            isManualKedudukan: Boolean(rec.isManualKedudukan),
            updatedBy: currentUser.name || currentUser.email || 'Guru Prasekolah',
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });
      await batch.commit();
      if (showBanner) {
        setStatusMessage(`Disimpan (${term} • ${academicYear})`);
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'prasekolah_assessments');
    } finally {
      setSaving(false);
    }
  };

  const scheduleAutoSave = (updatedList: PrasekolahAssessmentDoc[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      persistRecordsToFirestore(updatedList, true);
    }, 650);
  };

  // Handlers for updating Academic grade, Sikap grade, Age, and Kedudukan
  const handleUpdateAkademik = (
    studentId: string,
    field: keyof PrasekolahAkademikScores,
    grade: PrasekolahGrade
  ) => {
    setRecords((prev) => {
      const next = prev.map((r) => {
        if (r.studentId !== studentId) return r;
        const currentGrade = r.akademik[field];
        const toggledGrade = currentGrade === grade ? '' : grade;
        return {
          ...r,
          akademik: {
            ...r.akademik,
            [field]: toggledGrade,
          },
        };
      });
      const ranked = computeAutoKedudukanList(next, false);
      scheduleAutoSave(ranked);
      return ranked;
    });
  };

  const handleUpdateSikap = (
    studentId: string,
    field: keyof PrasekolahSikapScores,
    grade: PrasekolahGrade
  ) => {
    setRecords((prev) => {
      const next = prev.map((r) => {
        if (r.studentId !== studentId) return r;
        const currentGrade = r.sikapNilai[field];
        const toggledGrade = currentGrade === grade ? '' : grade;
        return {
          ...r,
          sikapNilai: {
            ...r.sikapNilai,
            [field]: toggledGrade,
          },
        };
      });
      const ranked = computeAutoKedudukanList(next, false);
      scheduleAutoSave(ranked);
      return ranked;
    });
  };

  const handleUpdateAge = (studentId: string, newAge: 5 | 6) => {
    setRecords((prev) => {
      const next = prev.map((r) => (r.studentId === studentId ? { ...r, age: newAge } : r));
      scheduleAutoSave(next);
      return next;
    });
  };

  const handleManualKedudukanChange = (studentId: string, rawVal: string) => {
    setRecords((prev) => {
      const trimmed = rawVal.trim();
      const next = prev.map((r) => {
        if (r.studentId !== studentId) return r;
        if (trimmed === '') {
          return { ...r, kedudukan: '', isManualKedudukan: false };
        }
        const num = Number(trimmed);
        return {
          ...r,
          kedudukan: !isNaN(num) && num > 0 ? num : trimmed,
          isManualKedudukan: true,
        };
      });
      const ranked = computeAutoKedudukanList(next, false);
      scheduleAutoSave(ranked);
      return ranked;
    });
  };

  const handleManualJumlahMuridChange = (rawVal: string) => {
    const num = Number(rawVal);
    if (isNaN(num) || num < 1) return;
    setRecords((prev) => {
      const next = prev.map((r) => ({ ...r, jumlahMurid: num, isManualKedudukan: true }));
      scheduleAutoSave(next);
      return next;
    });
  };

  const handleResetAutoKedudukanAll = () => {
    const recalculated = computeAutoKedudukanList(
      records.map((r) => ({ ...r, isManualKedudukan: false, jumlahMurid: records.length })),
      true
    );
    setRecords(recalculated);
    persistRecordsToFirestore(recalculated, true);
  };

  // Quick Add Prasekolah Student
  const handleQuickAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newStudentName.trim().toUpperCase();
    if (!cleanName) return;
    const cleanIc = newStudentIc.replace(/[\s-]/g, '').trim().toUpperCase();
    const rawId = cleanIc || `PRA_${Date.now()}`;
    const studentId = scopedDocId(activeSchoolCode, rawId);
    const enrollId = scopedDocId(activeSchoolCode, `${studentId}_${academicYear}`);

    try {
      setSaving(true);
      await setDoc(
        doc(db, 'student_master', studentId),
        {
          student_id: studentId,
          schoolCode: activeSchoolCode,
          name: cleanName,
          noKp: cleanIc,
          icNumber: cleanIc,
          age: newStudentAge,
          currentClass: 'PRASEKOLAH',
          currentYear: 0,
          academicYear,
          studyStatus: 'BERSEKOLAH',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await setDoc(
        doc(db, 'students', enrollId),
        {
          id: enrollId,
          schoolCode: activeSchoolCode,
          student_id: studentId,
          name: cleanName,
          noKp: cleanIc,
          icNumber: cleanIc,
          age: newStudentAge,
          class: 'PRASEKOLAH',
          year: 0,
          academic_year: academicYear,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setNewStudentName('');
      setNewStudentIc('');
      setIsAddStudentOpen(false);
      await loadPrasekolahData();
      setSelectedStudentId(studentId);
      setStatusMessage(`Murid Prasekolah "${cleanName}" berjaya ditambah!`);
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'students');
    } finally {
      setSaving(false);
    }
  };

  // Filtered records for display
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (ageFilter !== 'ALL' && r.age !== ageFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchName = r.studentName.toLowerCase().includes(q);
        const matchIc = (r.noKp || '').toLowerCase().includes(q);
        return matchName || matchIc;
      }
      return true;
    });
  }, [records, ageFilter, searchQuery]);

  const activeCardRecord = useMemo(() => {
    return (
      records.find((r) => r.studentId === selectedStudentId) ||
      filteredRecords[0] ||
      records[0] ||
      null
    );
  }, [records, filteredRecords, selectedStudentId]);

  const activeCardIndex = useMemo(() => {
    if (!activeCardRecord) return -1;
    return filteredRecords.findIndex((r) => r.studentId === activeCardRecord.studentId);
  }, [filteredRecords, activeCardRecord]);

  const statsSummary = useMemo(() => {
    const total = records.length;
    const age5 = records.filter((r) => r.age === 5).length;
    const age6 = records.filter((r) => r.age === 6).length;
    const completed = records.filter(
      (r) =>
        r.akademik.bm &&
        r.akademik.bc &&
        r.akademik.bi &&
        r.akademik.mt &&
        r.sikapNilai.disiplin &&
        r.sikapNilai.sosial &&
        r.sikapNilai.keyakinanDiri &&
        r.sikapNilai.rajin
    ).length;
    return { total, age5, age6, completed };
  }, [records]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Action Controls */}
      <div className="bg-gradient-to-r from-purple-950/90 via-slate-900 to-indigo-950/90 border border-purple-700/40 rounded-3xl p-5 sm:p-6 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-800">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-purple-300" />
                Modul Pentaksiran Terpisah (100% Diasingkan Daripada PBD/UASA T1–T6)
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
                Koleksi: prasekolah_assessments
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              PRASEKOLAH INSPIRASI &mdash; Rekod Pentaksiran dan Perkembangan Murid
            </h2>
            <p className="text-xs text-slate-300 mt-1">
              Kemasukan gred Pencapaian Akademik (BM, BC, BI, Matematik) &amp; Sikap dan Nilai (A–E), pengiraan automatik Kedudukan Akademik, serta cetakan 1:1 Slip Rekod A4.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {statusMessage && (
              <span className="px-3 py-1.5 rounded-xl bg-emerald-950/90 border border-emerald-600/50 text-emerald-300 text-xs font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>{statusMessage}</span>
              </span>
            )}

            <button
              type="button"
              onClick={() => setIsAddStudentOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 text-purple-400" />
              <span>+ Tambah Murid Pra</span>
            </button>

            <button
              type="button"
              onClick={() => persistRecordsToFirestore(records, true)}
              disabled={saving || records.length === 0}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wide flex items-center gap-1.5 shadow-lg shadow-emerald-950/50 transition cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Menyimpan...' : 'Simpan Semua'}</span>
            </button>

            <button
              type="button"
              onClick={() =>
                printPrasekolahSlipsA4(filteredRecords.length > 0 ? filteredRecords : records, {
                  schoolName: activeSchoolName,
                  schoolCode: activeSchoolCode,
                  schoolLogo: activeSchoolLogo,
                  academicYear,
                  term,
                })
              }
              disabled={records.length === 0}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-black uppercase tracking-wide flex items-center gap-1.5 shadow-lg transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak Slip Semua Murid ({filteredRecords.length})</span>
            </button>

            {onOpenAnalysis && (
              <button
                type="button"
                onClick={onOpenAnalysis}
                className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black uppercase tracking-wide flex items-center gap-1.5 shadow-lg transition cursor-pointer"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Analisis Prasekolah</span>
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Filters (Academic Year, Penggal 1/2, Age 5/6, Entry Mode Switcher, Search) */}
        <div className="pt-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Academic Year Selector */}
            <div className="flex items-center gap-1.5 bg-slate-950/90 px-3 py-2 rounded-xl border border-slate-800">
              <Calendar className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-[11px] font-bold uppercase text-slate-400">Tahun:</span>
              <select
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="bg-transparent text-xs font-black text-white outline-none cursor-pointer"
              >
                {ACADEMIC_YEARS.map((yr) => (
                  <option key={yr} value={yr} className="bg-slate-900 text-white">
                    Tahun {yr}
                  </option>
                ))}
              </select>
            </div>

            {/* Penggal 1 / Penggal 2 Switcher */}
            <div className="inline-flex bg-slate-950/90 p-1 rounded-xl border border-slate-800">
              {(['Penggal 1', 'Penggal 2'] as PrasekolahTerm[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTerm(t)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                    term === t
                      ? 'bg-purple-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Age Filter: Semua / 5 Tahun / 6 Tahun */}
            <div className="inline-flex bg-slate-950/90 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setAgeFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  ageFilter === 'ALL'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Semua ({statsSummary.total})
              </button>
              <button
                type="button"
                onClick={() => setAgeFilter(5)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  ageFilter === 5
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                5 Tahun ({statsSummary.age5})
              </button>
              <button
                type="button"
                onClick={() => setAgeFilter(6)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  ageFilter === 6
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                6 Tahun ({statsSummary.age6})
              </button>
            </div>

            {/* Auto-Rank Recalculate Button */}
            <button
              type="button"
              onClick={handleResetAutoKedudukanAll}
              title="Kira semula Kedudukan Akademik semua murid berdasarkan wajaran A=5, B=4, C=3, D=2, E=1"
              className="px-3 py-2 rounded-xl bg-slate-950/90 hover:bg-slate-800 text-purple-300 border border-purple-800/50 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Auto Kira Kedudukan</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Box */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama murid / MyKid..."
                className="bg-slate-950/90 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500 w-52"
              />
            </div>

            {/* Entry Mode Switcher: Jadual Pantas vs Kad Individu & Slip 1:1 */}
            <div className="inline-flex bg-slate-950/90 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setEntryMode('TABLE')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition cursor-pointer ${
                  entryMode === 'TABLE'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>Jadual Pantas</span>
              </button>
              <button
                type="button"
                onClick={() => setEntryMode('CARD')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition cursor-pointer ${
                  entryMode === 'CARD'
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Kad Individu &amp; Slip 1:1</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {loading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-slate-400 text-sm">
          Memuatkan senarai murid dan rekod pentaksiran Prasekolah Inspirasi...
        </div>
      ) : records.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-purple-500/15 border border-purple-500/30 text-purple-300 flex items-center justify-center mx-auto">
            <Users className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-white">
            Tiada Murid Prasekolah Ditemui Bagi Sesi {academicYear}
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Anda boleh mengimport senarai murid melalui Master Data APDM (Murid 5 &amp; 6 Tahun Kekal Prasekolah) atau menambah murid prasekolah secara terus menggunakan butang di bawah.
          </p>
          <button
            type="button"
            onClick={() => setIsAddStudentOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold inline-flex items-center gap-2 transition cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Tambah Murid Prasekolah Sekarang</span>
          </button>
        </div>
      ) : entryMode === 'TABLE' ? (
        /* ====================================================================
           MODE 1: JADUAL PANTAS (FAST TABLE ENTRY)
           ==================================================================== */
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-wide">
                Jadual Kemasukan Pantas &mdash; Pentaksiran Prasekolah Inspirasi ({term} • {academicYear})
              </h3>
              <p className="text-xs text-slate-400">
                Klik atau pilih gred <strong>A, B, C, D, E</strong>. Kedudukan Akademik dikira secara automatik (A=5, B=4, C=3, D=2, E=1; seri ditentukan mengikut gred Sikap &amp; Nilai) dan boleh diubah secara manual.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800">
              <span>Jumlah Murid Kelas:</span>
              <input
                type="number"
                min={1}
                value={records[0]?.jumlahMurid || records.length}
                onChange={(e) => handleManualJumlahMuridChange(e.target.value)}
                className="w-14 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-center font-mono font-black text-amber-300 outline-none focus:border-purple-500"
              />
              <span>orang murid</span>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-800 rounded-2xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-300 font-black uppercase text-[10px] border-b border-slate-800">
                  <th rowSpan={2} className="py-3 px-2.5 text-center border-r border-slate-800 w-10">
                    Bil
                  </th>
                  <th rowSpan={2} className="py-3 px-3 border-r border-slate-800 min-w-[190px]">
                    Nama Murid
                  </th>
                  <th rowSpan={2} className="py-3 px-2 text-center border-r border-slate-800 w-24">
                    Umur
                  </th>
                  <th
                    colSpan={4}
                    className="py-2 px-3 text-center border-r border-b border-slate-800 bg-blue-950/60 text-blue-300"
                  >
                    B. Pencapaian Akademik (Gred A – E)
                  </th>
                  <th
                    colSpan={4}
                    className="py-2 px-3 text-center border-r border-b border-slate-800 bg-purple-950/60 text-purple-300"
                  >
                    C. Sikap dan Nilai (Gred A – E)
                  </th>
                  <th
                    rowSpan={2}
                    className="py-3 px-2.5 text-center border-r border-slate-800 bg-amber-950/40 text-amber-300 w-36"
                  >
                    Kedudukan Akademik
                    <div className="text-[9px] font-normal text-amber-200/80">
                      (___ drp {records[0]?.jumlahMurid || records.length})
                    </div>
                  </th>
                  <th rowSpan={2} className="py-3 px-2.5 text-center w-28">
                    Slip &amp; Kad
                  </th>
                </tr>
                <tr className="bg-slate-950/90 text-slate-300 font-bold text-[10px] border-b border-slate-800">
                  {PRASEKOLAH_AKADEMIK_FIELDS.map((f) => (
                    <th
                      key={f.key}
                      className="py-2 px-2 text-center border-r border-slate-800 bg-blue-950/30 text-blue-200"
                      title={f.label}
                    >
                      <div>{f.shortCode}</div>
                      <div className="text-[9px] font-normal text-slate-400 truncate max-w-[80px] mx-auto">
                        {f.label}
                      </div>
                    </th>
                  ))}
                  {PRASEKOLAH_SIKAP_FIELDS.map((f) => (
                    <th
                      key={f.key}
                      className="py-2 px-2 text-center border-r border-slate-800 bg-purple-950/30 text-purple-200"
                      title={f.label}
                    >
                      <div>{f.shortLabel}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredRecords.map((rec, idx) => {
                  const akScore = computeAkademikPoints(rec.akademik);
                  return (
                    <tr key={rec.studentId} className="hover:bg-slate-800/40 transition">
                      <td className="py-2.5 px-2.5 text-center font-mono font-bold text-slate-400 border-r border-slate-800">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 border-r border-slate-800">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStudentId(rec.studentId);
                            setEntryMode('CARD');
                          }}
                          className="text-left font-bold text-white hover:text-purple-300 transition block cursor-pointer"
                        >
                          {rec.studentName}
                        </button>
                        {rec.noKp && (
                          <span className="text-[10px] font-mono text-slate-500 block">
                            MyKid: {rec.noKp}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-center border-r border-slate-800">
                        <div className="inline-flex bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                          {([5, 6] as Array<5 | 6>).map((ageOpt) => (
                            <button
                              key={ageOpt}
                              type="button"
                              onClick={() => handleUpdateAge(rec.studentId, ageOpt)}
                              className={`px-2 py-0.5 rounded text-[10px] font-black transition cursor-pointer ${
                                rec.age === ageOpt
                                  ? 'bg-indigo-600 text-white'
                                  : 'text-slate-500 hover:text-slate-300'
                              }`}
                            >
                              {ageOpt}T
                            </button>
                          ))}
                        </div>
                      </td>

                      {/* 4 Academic Subjects */}
                      {PRASEKOLAH_AKADEMIK_FIELDS.map((f) => {
                        const val = rec.akademik[f.key];
                        return (
                          <td
                            key={f.key}
                            className="py-2 px-1.5 text-center border-r border-slate-800 bg-blue-950/10"
                          >
                            <select
                              value={val}
                              onChange={(e) =>
                                handleUpdateAkademik(
                                  rec.studentId,
                                  f.key,
                                  normalizePrasekolahGrade(e.target.value)
                                )
                              }
                              className={`w-14 py-1.5 px-1.5 rounded-lg text-center font-black text-xs border outline-none cursor-pointer transition ${getPrasekolahGradeBadgeStyle(
                                val
                              )}`}
                            >
                              <option value="" className="bg-slate-900 text-slate-400">
                                -
                              </option>
                              {PRASEKOLAH_GRADES.map((g) => (
                                <option key={g} value={g} className="bg-slate-900 text-white">
                                  {g}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      })}

                      {/* 4 Sikap dan Nilai Aspects */}
                      {PRASEKOLAH_SIKAP_FIELDS.map((f) => {
                        const val = rec.sikapNilai[f.key];
                        return (
                          <td
                            key={f.key}
                            className="py-2 px-1.5 text-center border-r border-slate-800 bg-purple-950/10"
                          >
                            <select
                              value={val}
                              onChange={(e) =>
                                handleUpdateSikap(
                                  rec.studentId,
                                  f.key,
                                  normalizePrasekolahGrade(e.target.value)
                                )
                              }
                              className={`w-14 py-1.5 px-1.5 rounded-lg text-center font-black text-xs border outline-none cursor-pointer transition ${getPrasekolahGradeBadgeStyle(
                                val
                              )}`}
                            >
                              <option value="" className="bg-slate-900 text-slate-400">
                                -
                              </option>
                              {PRASEKOLAH_GRADES.map((g) => (
                                <option key={g} value={g} className="bg-slate-900 text-white">
                                  {g}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      })}

                      {/* Kedudukan Akademik (Auto + Manual Override) */}
                      <td className="py-2 px-2 text-center border-r border-slate-800 bg-amber-950/10">
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="text"
                            value={rec.kedudukan}
                            onChange={(e) =>
                              handleManualKedudukanChange(rec.studentId, e.target.value)
                            }
                            placeholder="-"
                            className="w-11 bg-slate-950 border border-amber-700/60 rounded-lg py-1 px-1.5 text-center font-mono font-black text-amber-300 text-xs outline-none focus:border-amber-400"
                          />
                          <span className="text-[10px] text-slate-400 font-mono">
                            / {rec.jumlahMurid || records.length}
                          </span>
                        </div>
                        <div className="text-[9px] text-slate-500 mt-0.5">
                          Skor: {akScore.points}/20{' '}
                          {rec.isManualKedudukan ? '(Manual)' : '(Auto)'}
                        </div>
                      </td>

                      {/* Actions: Kad & Cetak Slip */}
                      <td className="py-2 px-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedStudentId(rec.studentId);
                              setEntryMode('CARD');
                            }}
                            title="Buka Kad Individu & Pratonton Slip 1:1"
                            className="p-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border border-purple-500/30 transition cursor-pointer"
                          >
                            <FileEdit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              printPrasekolahSlipsA4([rec], {
                                schoolName: activeSchoolName,
                                schoolCode: activeSchoolCode,
                                schoolLogo: activeSchoolLogo,
                                academicYear,
                                term,
                              })
                            }
                            title={`Cetak Slip Rekod Prasekolah: ${rec.studentName}`}
                            className="p-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border border-amber-500/30 transition cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ====================================================================
           MODE 2: KAD INDIVIDU & PRATONTON SLIP 1:1
           ==================================================================== */
        activeCardRecord && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Left Column: Interactive Single Student Assessment Card */}
            <div className="xl:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5">
              {/* Student Switcher Bar */}
              <div className="flex items-center justify-between gap-2 pb-4 border-b border-slate-800">
                <button
                  type="button"
                  disabled={activeCardIndex <= 0}
                  onClick={() => {
                    if (activeCardIndex > 0) {
                      setSelectedStudentId(filteredRecords[activeCardIndex - 1].studentId);
                    }
                  }}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="flex-1">
                  <select
                    value={activeCardRecord.studentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-black text-white outline-none focus:border-purple-500 cursor-pointer"
                  >
                    {filteredRecords.map((r, i) => (
                      <option key={r.studentId} value={r.studentId} className="bg-slate-900">
                        {i + 1}. {r.studentName} ({r.age} Tahun)
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  disabled={activeCardIndex < 0 || activeCardIndex >= filteredRecords.length - 1}
                  onClick={() => {
                    if (activeCardIndex < filteredRecords.length - 1) {
                      setSelectedStudentId(filteredRecords[activeCardIndex + 1].studentId);
                    }
                  }}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* A. Maklumat Murid Control */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-purple-300">
                    A. Maklumat Murid
                  </span>
                  <div className="inline-flex bg-slate-900 p-1 rounded-xl border border-slate-800">
                    {([5, 6] as Array<5 | 6>).map((ageOpt) => (
                      <button
                        key={ageOpt}
                        type="button"
                        onClick={() => handleUpdateAge(activeCardRecord.studentId, ageOpt)}
                        className={`px-3 py-1 rounded-lg text-xs font-black transition cursor-pointer ${
                          activeCardRecord.age === ageOpt
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {ageOpt} Tahun
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-base font-black text-white">
                    {activeCardRecord.studentName}
                  </div>
                  {activeCardRecord.noKp && (
                    <div className="text-xs font-mono text-slate-400 mt-0.5">
                      No. MyKid: {activeCardRecord.noKp}
                    </div>
                  )}
                </div>
              </div>

              {/* B. Pencapaian Akademik Grade Buttons */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-blue-300">
                    B. Pencapaian Akademik
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    Mata: {computeAkademikPoints(activeCardRecord.akademik).points} / 20
                  </span>
                </div>

                {PRASEKOLAH_AKADEMIK_FIELDS.map((field) => {
                  const currentVal = activeCardRecord.akademik[field.key];
                  return (
                    <div
                      key={field.key}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-800/70 last:border-none last:pb-0"
                    >
                      <div>
                        <div className="text-xs font-bold text-white">{field.label}</div>
                        <div className="text-[10px] text-slate-500">{field.zhLabel}</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {PRASEKOLAH_GRADES.map((g) => {
                          const isSelected = currentVal === g;
                          return (
                            <button
                              key={g}
                              type="button"
                              onClick={() =>
                                handleUpdateAkademik(activeCardRecord.studentId, field.key, g)
                              }
                              className={`w-9 h-9 rounded-xl font-black text-xs border transition cursor-pointer ${
                                isSelected
                                  ? getPrasekolahGradeBadgeStyle(g) + ' scale-105 shadow-md'
                                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-600 hover:text-white'
                              }`}
                            >
                              {g}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Kedudukan Akademik Box */}
                <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    <span>Kedudukan Akademik:</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <input
                      type="text"
                      value={activeCardRecord.kedudukan}
                      onChange={(e) =>
                        handleManualKedudukanChange(activeCardRecord.studentId, e.target.value)
                      }
                      placeholder="Auto"
                      className="w-14 bg-slate-900 border border-amber-600/60 rounded-lg py-1 px-2 text-center font-mono font-black text-amber-300 outline-none"
                    />
                    <span className="text-slate-400">daripada</span>
                    <input
                      type="number"
                      min={1}
                      value={activeCardRecord.jumlahMurid || records.length}
                      onChange={(e) => handleManualJumlahMuridChange(e.target.value)}
                      className="w-14 bg-slate-900 border border-slate-700 rounded-lg py-1 px-2 text-center font-mono font-bold text-white outline-none"
                    />
                    <span className="text-slate-400">murid</span>
                  </div>
                </div>
              </div>

              {/* C. Sikap dan Nilai Grade Buttons */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-purple-300">
                    C. Sikap dan Nilai
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    Mata: {computeSikapPoints(activeCardRecord.sikapNilai).points} / 20
                  </span>
                </div>

                {PRASEKOLAH_SIKAP_FIELDS.map((field) => {
                  const currentVal = activeCardRecord.sikapNilai[field.key];
                  return (
                    <div
                      key={field.key}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-800/70 last:border-none last:pb-0"
                    >
                      <div>
                        <div className="text-xs font-bold text-white">{field.label}</div>
                        <div className="text-[10px] text-slate-500">{field.zhLabel}</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {PRASEKOLAH_GRADES.map((g) => {
                          const isSelected = currentVal === g;
                          return (
                            <button
                              key={g}
                              type="button"
                              onClick={() =>
                                handleUpdateSikap(activeCardRecord.studentId, field.key, g)
                              }
                              className={`w-9 h-9 rounded-xl font-black text-xs border transition cursor-pointer ${
                                isSelected
                                  ? getPrasekolahGradeBadgeStyle(g) + ' scale-105 shadow-md'
                                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-600 hover:text-white'
                              }`}
                            >
                              {g}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Live 1:1 Official Report Slip Preview & Single Print */}
            <div className="xl:col-span-7 space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-black uppercase text-amber-400 block">
                    Pratonton 1:1 Slip Rasmi (A4 Portrait)
                  </span>
                  <span className="text-xs text-slate-400">
                    Rekod Pentaksiran dan Perkembangan Murid &mdash; {activeCardRecord.studentName}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      printPrasekolahSlipsA4([activeCardRecord], {
                        schoolName: activeSchoolName,
                        schoolCode: activeSchoolCode,
                        schoolLogo: activeSchoolLogo,
                        academicYear,
                        term,
                      })
                    }
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase tracking-wide flex items-center gap-1.5 shadow-lg transition cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Cetak Slip Murid Ini (A4)</span>
                  </button>
                </div>
              </div>

              <PrasekolahSlipCard
                slip={activeCardRecord}
                schoolName={activeSchoolName}
                schoolCode={activeSchoolCode}
                schoolLogo={activeSchoolLogo}
              />
            </div>
          </div>
        )
      )}

      {/* Quick Add Prasekolah Student Modal */}
      {isAddStudentOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-purple-400" />
                <span>Tambah Murid Prasekolah Inspirasi</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAddStudentOpen(false)}
                className="text-slate-400 hover:text-white text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickAddStudent} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Nama Penuh Murid (Huruf Besar) *
                </label>
                <input
                  type="text"
                  required
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  placeholder="CTH: AHMAD BIN ALI / TAN MEI LING"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white uppercase outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  No. MyKid / Kad Pengenalan (Untuk Log Masuk Portal Murid)
                </label>
                <input
                  type="text"
                  value={newStudentIc}
                  onChange={(e) => setNewStudentIc(e.target.value)}
                  placeholder="CTH: 200512130123"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Umur Murid Prasekolah *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {([5, 6] as Array<5 | 6>).map((ageOpt) => (
                    <button
                      key={ageOpt}
                      type="button"
                      onClick={() => setNewStudentAge(ageOpt)}
                      className={`py-2.5 rounded-xl text-xs font-black border transition cursor-pointer ${
                        newStudentAge === ageOpt
                          ? 'bg-purple-600 text-white border-purple-500'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      {ageOpt} Tahun
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddStudentOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black uppercase cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Murid'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrasekolahAssessmentView;
