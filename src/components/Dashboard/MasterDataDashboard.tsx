
import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  serverTimestamp 
} from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { 
  SchoolConfig, 
  AcademicYearConfig, 
  PersonnelProfile, 
  ClassConfig, 
  SubjectAllocation, 
  StudentMaster,
  Student,
  GovernanceAssignment,
  AuditTrailEntry,
  ImportSession,
  RollbackRecord
} from '../../types';
import { GuruImportRow, GuruImportPreviewResponse, ApdmStudentImportRow, ApdmStudentImportPreviewResponse } from '../../types/isepadu';
import { deepSanitizeFirestore } from '../../utils/sanitizeFirestore';
import { StudentProfileModal } from '../Student/StudentProfileModal';
import { TimetableSystem } from '../Timetable/TimetableSystem';
import { StaffRoleCell } from './StaffRoleCell';
import { SchoolLogo } from '../SchoolLogo';
import { SchoolLogoModal } from '../SchoolLogoModal';
import { 
  Settings, 
  Calendar, 
  UserSquare, 
  BookOpen, 
  Building2, 
  Users2, 
  UploadCloud, 
  Plus, 
  Edit3, 
  Trash2, 
  Save, 
  Check, 
  X, 
  AlertTriangle, 
  Search, 
  Sparkles,
  ArrowRight,
  Clipboard,
  ShieldCheck,
  Languages,
  CheckSquare,
  Square,
  GraduationCap,
  AlertCircle,
  FolderOpen,
  Users,
  FileSpreadsheet,
  Link as LinkIcon,
  CheckCircle2,
  RefreshCw,
  FileText,
  History
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
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || 'current-user',
      email: auth.currentUser?.email || 'user-email',
    },
    operationType,
    path
  };
  console.warn('Firestore Master Data warning: ', JSON.stringify(errInfo));
}

async function parseResponseSafely(res: Response, defaultError: string): Promise<any> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.error || `${defaultError} (HTTP ${res.status})`);
    }
    return data;
  }
  const text = await res.text();
  const cleanText = text.trim();
  if (!res.ok) {
    if (res.status === 503 || cleanText.includes('warmup')) {
      throw new Error('Pangkalan Data iSEPADU Core belum dapat dicapai. Sila pastikan pangkalan data aktif.');
    }
    const isHtml = cleanText.startsWith('<');
    throw new Error(isHtml ? `${defaultError} (HTTP ${res.status})` : (cleanText || `${defaultError} (HTTP ${res.status})`));
  }
  if (cleanText.startsWith('<')) {
    throw new Error('Pelayan mengembalikan respons HTML dan bukan JSON (Pangkalan Data Core mungkin sedang di luar talian).');
  }
  return { text: cleanText };
}

type MDSubTab = 'config' | 'academic_years' | 'personnel' | 'classes' | 'subject_allocations' | 'students' | 'import' | 'history' | 'audit';

export default function MasterDataDashboard() {
  const [activeSubTab, setActiveSubTab] = useState<MDSubTab>('config');
  const [loading, setLoading] = useState(false);

  // Core Data States
  const [schoolConfig, setSchoolConfig] = useState<SchoolConfig | null>(null);
  const [academicYears, setAcademicYears] = useState<AcademicYearConfig[]>([]);
  const [personnel, setPersonnel] = useState<PersonnelProfile[]>([]);
  const [personnelError, setPersonnelError] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassConfig[]>([]);
  const [allocations, setAllocations] = useState<SubjectAllocation[]>([]);
  const [studentMasters, setStudentMasters] = useState<StudentMaster[]>([]);
  const [activeEnrollments, setActiveEnrollments] = useState<Student[]>([]);

  // Governance, Import, and Override States
  const [governanceAssignments, setGovernanceAssignments] = useState<GovernanceAssignment[]>([]);
  const [importSessions, setImportSessions] = useState<ImportSession[]>([]);
  const [auditTrail, setAuditTrail] = useState<AuditTrailEntry[]>([]);
  const [portfolioInput, setPortfolioInput] = useState('');
  const [committeeInput, setCommitteeInput] = useState('');
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideJustification, setOverrideJustification] = useState('');
  const [pendingAllocation, setPendingAllocation] = useState<any>(null);
  const [allocationViewMode, setAllocationViewMode] = useState<'matrix' | 'table'>('matrix');

  // Selection state for filters
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('');

  // Initial Fetching
  useEffect(() => {
    fetchSchoolConfig();
    fetchAcademicYears();
    fetchPersonnel();
    fetchImportSessions();
    fetchAuditTrail();
  }, []);

  useEffect(() => {
    if (selectedAcademicYear) {
      fetchClasses(selectedAcademicYear);
      fetchAllocations(selectedAcademicYear);
      fetchEnrollments(selectedAcademicYear);
      fetchGovernanceAssignments(selectedAcademicYear);
    }
  }, [selectedAcademicYear]);

  useEffect(() => {
    if (activeSubTab === 'audit') {
      fetchAuditTrail();
    } else if (activeSubTab === 'history') {
      fetchImportSessions();
    }
  }, [activeSubTab]);

  // Audit trail writer helper
  const logAuditTrail = async (
    actionType: 'CREATE' | 'UPDATE' | 'DELETE' | 'STATE_CHANGE' | 'AUTHORIZE' | 'IMPORT' | 'ROLLBACK',
    layer: number,
    entityId: string,
    details: string
  ) => {
    try {
      const entry: AuditTrailEntry = {
        timestamp: new Date().toISOString(),
        actor_id: auth.currentUser?.uid || 'admin-user',
        actor_name: auth.currentUser?.displayName || auth.currentUser?.email || 'Pentadbir Utama',
        actor_role: 'admin',
        action_type: actionType,
        layer,
        entity_id: entityId,
        details
      };
      await addDoc(collection(db, 'audit_trail'), entry);
    } catch (err) {
      console.error('Failed to write audit trail:', err);
    }
  };

  const fetchGovernanceAssignments = async (ay: string) => {
    try {
      const q = query(collection(db, 'governance_assignments'), where('academicYear', '==', ay));
      const snap = await getDocs(q);
      setGovernanceAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() } as GovernanceAssignment)));
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'governance_assignments');
    }
  };

  const fetchImportSessions = async () => {
    try {
      const snap = await getDocs(collection(db, 'import_sessions'));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ImportSession));
      list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      setImportSessions(list);
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'import_sessions');
    }
  };

  const fetchAuditTrail = async () => {
    try {
      const snap = await getDocs(collection(db, 'audit_trail'));
      const list = snap.docs.map(d => {
        const data = d.data();
        const rawDetails = data.details;
        const detailsString = typeof rawDetails === 'object' && rawDetails !== null
          ? (rawDetails.message || rawDetails.description || JSON.stringify(rawDetails))
          : String(rawDetails || '');

        return {
          id: d.id,
          timestamp: data.timestamp || new Date().toISOString(),
          actor_id: data.actor_id || '',
          actor_name: data.actor_name || 'Pentadbir',
          actor_role: data.actor_role || 'admin',
          action_type: data.action_type || 'UPDATE',
          layer: data.layer || 1,
          entity_id: data.entity_id || '',
          details: detailsString
        } as AuditTrailEntry;
      });
      list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      setAuditTrail(list);
    } catch (e) {
      console.error('Failed to fetch audit trail logs:', e);
    }
  };

  // Fetch functions with robust error tracking
  const fetchSchoolConfig = async () => {
    try {
      const docRef = doc(db, 'school_config', 'default');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setSchoolConfig(docSnap.data() as SchoolConfig);
      } else {
        // Seed default config
        const defaultConfig: SchoolConfig = {
          id: 'default',
          schoolName: 'SEKOLAH KEBANGSAAN DEMO',
          schoolType: 'SK',
          schoolCategory: 'Non-SKM',
          hasPreschool: true,
          hasPPKI: false,
          academicSession: '2026/2027',
          defaultLanguages: ['Bahasa Melayu', 'English'],
          schoolLogo: ''
        };
        await setDoc(docRef, defaultConfig);
        setSchoolConfig(defaultConfig);
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, 'school_config/default');
    }
  };

  const fetchAcademicYears = async () => {
    try {
      const snap = await getDocs(collection(db, 'academic_years'));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as AcademicYearConfig));
      // Sort list
      list.sort((a, b) => b.year.localeCompare(a.year));
      setAcademicYears(list);
      
      // If no academic years, seed default from config
      if (list.length === 0) {
        const defaultYear = '2026/2027';
        await setDoc(doc(db, 'academic_years', defaultYear), {
          id: defaultYear,
          year: defaultYear,
          status: 'active'
        });
        setAcademicYears([{ id: defaultYear, year: defaultYear, status: 'active' }]);
        setSelectedAcademicYear(defaultYear);
      } else {
        const active = list.find(y => y.status === 'active') || list[0];
        setSelectedAcademicYear(active.year);
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'academic_years');
    }
  };

  const fetchPersonnel = async () => {
    setPersonnelError(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/core/personnel', {
        headers: {
          'Authorization': `Bearer ${idToken || ''}`
        }
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (Array.isArray(data.personnel)) {
          setPersonnel(data.personnel);
          setPersonnelError(null);
          return;
        }
      }
      const errData = contentType.includes('application/json') ? await res.json().catch(() => ({})) : {};
      const errMsg = errData.message || errData.error || 'Gagal mengakses Data Guru iSEPADU Core.';
      setPersonnel([]);
      setPersonnelError(errMsg);
    } catch (apiErr: any) {
      console.warn('Could not fetch personnel from /api/core/personnel:', apiErr);
      setPersonnel([]);
      setPersonnelError('Gagal mengakses Data Guru iSEPADU Core.');
    }
  };

  const fetchClasses = async (ay: string) => {
    try {
      const q = query(collection(db, 'classes'), where('academicYear', '==', ay));
      const snap = await getDocs(q);
      setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() } as ClassConfig)));
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'classes');
    }
  };

  const fetchAllocations = async (ay: string) => {
    try {
      const q = query(collection(db, 'subject_allocations'), where('academicYear', '==', ay));
      const snap = await getDocs(q);
      setAllocations(snap.docs.map(d => ({ id: d.id, ...d.data() } as SubjectAllocation)));
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'subject_allocations');
    }
  };

  const fetchEnrollments = async (ay: string) => {
    try {
      // Fetch student masters
      const mSnap = await getDocs(collection(db, 'student_master'));
      setStudentMasters(mSnap.docs.map(d => ({ student_id: d.id, ...d.data() } as StudentMaster)));

      // Fetch active enrollments in standard students collection for backward compatibility
      const q = query(collection(db, 'students'), where('academic_year', '==', ay));
      const snap = await getDocs(q);
      setActiveEnrollments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Student)));
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'students');
    }
  };

  // ==========================================
  // MODULE 1: School Configuration Form
  // ==========================================
  const [configForm, setConfigForm] = useState<Partial<SchoolConfig>>({});
  const [editingConfig, setEditingConfig] = useState(false);
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);

  useEffect(() => {
    if (schoolConfig) setConfigForm(schoolConfig);
  }, [schoolConfig]);

  const saveSchoolConfig = async () => {
    if (!configForm.schoolName) return;
    setLoading(true);
    try {
      const docRef = doc(db, 'school_config', 'default');
      await setDoc(docRef, configForm, { merge: true });
      
      // Also sync to school_settings/general for whole-app shell branding
      try {
        await setDoc(doc(db, 'school_settings', 'general'), {
          schoolName: configForm.schoolName,
          schoolLogo: configForm.schoolLogo || '',
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (e) {
        // Safe ignore
      }

      setSchoolConfig(configForm as SchoolConfig);
      setEditingConfig(false);
      await logAuditTrail('UPDATE', 0, 'default', `Kemas kini konfigurasi sekolah: ${configForm.schoolName} (${configForm.schoolType})`);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'school_config/default');
    }
    setLoading(false);
  };

  // ==========================================
  // MODULE 2: Academic Year Manager
  // ==========================================
  const [newYear, setNewYear] = useState('');
  
  const addAcademicYear = async () => {
    if (!newYear || !/^\d{4}(\/\d{4})?$/.test(newYear)) {
      alert('Sila masukkan format sesi akademik yang betul (Contoh: 2026 atau 2026/2027)');
      return;
    }
    if (academicYears.some(y => y.year === newYear)) {
      alert('Sesi akademik ini sudah wujud!');
      return;
    }
    setLoading(true);
    try {
      const ref = doc(db, 'academic_years', newYear);
      const payload: AcademicYearConfig = {
        id: newYear,
        year: newYear,
        status: 'historical'
      };
      await setDoc(ref, payload);
      setNewYear('');
      await logAuditTrail('CREATE', 0, newYear, `Tambah sesi akademik baharu: ${newYear}`);
      await fetchAcademicYears();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `academic_years/${newYear}`);
    }
    setLoading(false);
  };

  const setAcademicYearStatus = async (year: string, status: 'active' | 'historical') => {
    setLoading(true);
    try {
      if (status === 'active') {
        // Deactivate all others
        const batchPromises = academicYears.map(async (y) => {
          const ref = doc(db, 'academic_years', y.year);
          await updateDoc(ref, { status: y.year === year ? 'active' : 'historical' });
        });
        await Promise.all(batchPromises);
      } else {
        await updateDoc(doc(db, 'academic_years', year), { status: 'historical' });
      }
      await logAuditTrail('STATE_CHANGE', 0, year, `Tukar status sesi akademik ${year} kepada ${status}`);
      await fetchAcademicYears();
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `academic_years/${year}`);
    }
    setLoading(false);
  };

  // ==========================================
  // MODULE 3 & 4: Personnel Master & Governance
  // ==========================================
  const [editingTeacher, setEditingTeacher] = useState<PersonnelProfile | null>(null);
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [teacherForm, setTeacherForm] = useState<Partial<PersonnelProfile>>({
    name: '', ic: '', gender: 'L', email: '', phone: '', employmentStatus: 'Tetap', teachingStatus: 'Aktif',
    portfolios: [], committees: [], coordinators: [], additionalResponsibilities: []
  });

  const [teacherAssignments, setTeacherAssignments] = useState<Omit<GovernanceAssignment, 'id' | 'personnelId' | 'personnelName'>[]>([]);
  const [govTypeInput, setGovTypeInput] = useState<'PORTFOLIO' | 'COMMITTEE' | 'COORDINATOR' | 'ADDITIONAL_RESPONSIBILITY'>('PORTFOLIO');
  const [govNameInput, setGovNameInput] = useState('');
  const [govRoleInput, setGovRoleInput] = useState<'CHAIR' | 'SECRETARY' | 'COMMITTEE_MEMBER' | 'COORDINATOR_LEAD' | 'OPERATIONAL_STAFF'>('COMMITTEE_MEMBER');
  const [govRaciInput, setGovRaciInput] = useState<'R' | 'A' | 'C' | 'I'>('R');

  const openTeacherModal = (teacher: PersonnelProfile | null) => {
    if (teacher) {
      setEditingTeacher(teacher);
      setTeacherForm(teacher);
      // Load their governance assignments for the selected academic year
      const matching = governanceAssignments.filter(ga => ga.personnelId === teacher.id);
      setTeacherAssignments(matching.map(ga => ({
        academicYear: ga.academicYear,
        governanceType: ga.governanceType,
        entityName: ga.entityName,
        role: ga.role,
        raciRole: ga.raciRole,
        effectiveDate: ga.effectiveDate,
        status: ga.status,
        expiryDate: ga.expiryDate
      })));
    } else {
      setEditingTeacher(null);
      setTeacherForm({
        name: '', ic: '', gender: 'L', email: '', phone: '', employmentStatus: 'Tetap', teachingStatus: 'Aktif',
        portfolios: [], committees: [], coordinators: [], additionalResponsibilities: []
      });
      setTeacherAssignments([]);
    }
    setGovTypeInput('PORTFOLIO');
    setGovNameInput('');
    setGovRoleInput('COMMITTEE_MEMBER');
    setGovRaciInput('R');
    setShowTeacherModal(true);
  };

  const saveTeacher = async () => {
    if (!teacherForm.name || !teacherForm.ic || !teacherForm.email) {
      alert('Sila isikan nama, IC, dan e-mel DELIMa.');
      return;
    }
    setLoading(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();

      // Store portfolio names in flat arrays for backward compatibility
      const pNames = teacherAssignments.filter(x => x.governanceType === 'PORTFOLIO').map(x => x.entityName);
      const cNames = teacherAssignments.filter(x => x.governanceType === 'COMMITTEE').map(x => x.entityName);
      const coNames = teacherAssignments.filter(x => x.governanceType === 'COORDINATOR').map(x => x.entityName);
      const rNames = teacherAssignments.filter(x => x.governanceType === 'ADDITIONAL_RESPONSIBILITY').map(x => x.entityName);

      // Route through server endpoint POST /api/core/personnel which generates staff_<UUID>
      const payload = {
        id: editingTeacher?.id || undefined,
        name: teacherForm.name,
        ic: teacherForm.ic,
        email: teacherForm.email,
        gender: teacherForm.gender || 'L',
        staffFileNo: teacherForm.staffFileNo || '',
        grade: teacherForm.grade || '',
        position: teacherForm.position || 'GURU',
        datePlaced: teacherForm.datePlaced || '',
        dateAppointed: teacherForm.dateAppointed || '',
        dateConfirmed: teacherForm.dateConfirmed || '',
        majorOption: teacherForm.majorOption || '',
        minorOption: teacherForm.minorOption || '',
        datePensionStatus: teacherForm.datePensionStatus || '',
        datePension: teacherForm.datePension || '',
        dateNextPromotion: teacherForm.dateNextPromotion || '',
        phone: teacherForm.phone || '',
        apcReceived: teacherForm.apcReceived || '',
        employmentStatus: teacherForm.employmentStatus || 'Tetap',
        teachingStatus: teacherForm.teachingStatus || 'Aktif',
        portfolios: pNames,
        committees: cNames,
        coordinators: coNames,
        additionalResponsibilities: rNames
      };

      const res = await fetch('/api/core/personnel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken || ''}`
        },
        body: JSON.stringify(payload)
      });

      const resData = await parseResponseSafely(res, 'Gagal menyimpan maklumat guru.');

      const assignedId = resData.id || editingTeacher?.id;

      // Clean up old assignments for this teacher and academic year
      if (assignedId && selectedAcademicYear) {
        const oldQuery = query(
          collection(db, 'governance_assignments'), 
          where('personnelId', '==', assignedId),
          where('academicYear', '==', selectedAcademicYear)
        );
        const oldSnap = await getDocs(oldQuery);
        const deletePromises = oldSnap.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deletePromises);

        // Save new sessional isolated governance assignments
        const savePromises = teacherAssignments.map(async (item) => {
          const gaId = `${assignedId}_${selectedAcademicYear.replace(/\//g, '-')}_${item.governanceType}_${item.entityName.toUpperCase().replace(/\s+/g, '_')}`;
          const gaRef = doc(db, 'governance_assignments', gaId);
          await setDoc(gaRef, deepSanitizeFirestore({
            id: gaId,
            personnelId: assignedId,
            personnelName: teacherForm.name!.toUpperCase(),
            academicYear: selectedAcademicYear,
            governanceType: item.governanceType,
            entityName: item.entityName.toUpperCase(),
            role: item.role,
            raciRole: item.raciRole,
            effectiveDate: item.effectiveDate || new Date().toISOString().split('T')[0],
            status: 'ACTIVE'
          }));
        });
        await Promise.all(savePromises);
      }

      await logAuditTrail(
        editingTeacher ? 'UPDATE' : 'CREATE', 
        1, 
        assignedId || 'unknown', 
        `${editingTeacher ? 'Kemas kini' : 'Daftar'} guru ${teacherForm.name} beserta ${teacherAssignments.length} tugasan tadbir urus bagi Sesi ${selectedAcademicYear}`
      );

      setShowTeacherModal(false);
      await fetchPersonnel();
      if (selectedAcademicYear) {
        await fetchGovernanceAssignments(selectedAcademicYear);
      }
    } catch (e: any) {
      console.error('Error saving teacher profile:', e);
      alert(`Ralat menyimpan profil guru: ${e.message}`);
    }
    setLoading(false);
  };

  const deleteTeacher = async (teacher: PersonnelProfile) => {
    if (!confirm(`Adakah anda pasti mahu memadam profil guru ${teacher.name}? Semua tugasan tadbir urus yang dihubungkan juga akan dipadam.`)) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'personnel', teacher.id));
      await deleteDoc(doc(db, 'teachers', teacher.id));

      // Clean up governance assignments
      const oldQuery = query(collection(db, 'governance_assignments'), where('personnelId', '==', teacher.id));
      const oldSnap = await getDocs(oldQuery);
      const deletePromises = oldSnap.docs.map(d => deleteDoc(d.ref));
      await Promise.all(deletePromises);

      await logAuditTrail('DELETE', 1, teacher.id, `Padam profil guru ${teacher.name} beserta seluruh tugasan tadbir urusnya`);

      await fetchPersonnel();
      if (selectedAcademicYear) {
        await fetchGovernanceAssignments(selectedAcademicYear);
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `personnel/${teacher.id}`);
    }
    setLoading(false);
  };

  // Sync Personnel to Attendance Users handler
  const [syncingPersonnelUsers, setSyncingPersonnelUsers] = useState(false);
  const [syncPersonnelSuccess, setSyncPersonnelSuccess] = useState<string | null>(null);

  const handleSyncPersonnelToUsers = async () => {
    setSyncingPersonnelUsers(true);
    setSyncPersonnelSuccess(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/sync-personnel-to-users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken || ''}`,
        },
      });
      const data = await parseResponseSafely(res, 'Ralat semasa menyelaraskan personel ke kehadiran.');
      setSyncPersonnelSuccess(data.message || `Berjaya menyelaraskan ${data.syncedCount} rekod personel ke Kehadiran Staf.`);
      setTimeout(() => setSyncPersonnelSuccess(null), 8000);
    } catch (e: any) {
      console.error('Error syncing personnel to users:', e);
      alert(`Ralat penyelarasan: ${e.message}`);
    } finally {
      setSyncingPersonnelUsers(false);
    }
  };

  // ==========================================
  // MODULE 5: Subject Allocation
  // ==========================================
  const [allocationForm, setAllocationForm] = useState<Partial<SubjectAllocation>>({
    teacherId: '', classId: '', subjectName: '', periodsPerWeek: 4, role: 'MAIN'
  });
  const [showAllocModal, setShowAllocModal] = useState(false);

  const saveAllocation = async () => {
    if (!allocationForm.teacherId || !allocationForm.classId || !allocationForm.subjectName) {
      alert('Sila pilih guru, kelas, dan subjek.');
      return;
    }
    setLoading(true);
    try {
      const selectedTeacher = personnel.find(p => p.id === allocationForm.teacherId);
      const selectedClass = classes.find(c => c.id === allocationForm.classId);
      
      if (!selectedTeacher || !selectedClass) {
        alert('Data guru atau kelas tidak sah.');
        setLoading(false);
        return;
      }

      // Rule T2: Class-Subject Solitary Main Teacher
      if (allocationForm.role === 'MAIN') {
        const hasMainTeacher = allocations.some(a => 
          a.classId === selectedClass.id &&
          a.subjectName.toUpperCase() === allocationForm.subjectName!.toUpperCase() &&
          a.role === 'MAIN'
        );
        if (hasMainTeacher) {
          alert(`Pelanggaran Peraturan T2: Subjek ${allocationForm.subjectName!.toUpperCase()} untuk Kelas ${selectedClass.name} sudah mempunyai Guru Utama (MAIN) bagi sesi ini!`);
          setLoading(false);
          return;
        }
      }

      const payload: Omit<SubjectAllocation, 'id'> = {
        academicYear: selectedAcademicYear,
        teacherId: selectedTeacher.id,
        teacherName: selectedTeacher.name,
        classId: selectedClass.id,
        className: selectedClass.name,
        subjectName: allocationForm.subjectName.toUpperCase().trim(),
        periodsPerWeek: Number(allocationForm.periodsPerWeek || 4),
        role: allocationForm.role || 'MAIN'
      };

      // Rule T1: Weekly Workload Threshold Validation
      const currentPeriods = allocations
        .filter(a => a.teacherId === selectedTeacher.id)
        .reduce((sum, a) => sum + a.periodsPerWeek, 0);
      const proposedPeriods = Number(allocationForm.periodsPerWeek || 4);
      const totalPeriods = currentPeriods + proposedPeriods;

      if (totalPeriods >= 33) {
        // Trigger Administrator Override Flow
        setPendingAllocation({
          payload,
          totalPeriods,
          teacherName: selectedTeacher.name
        });
        setShowOverrideModal(true);
        setLoading(false);
        return;
      }

      const ref = await addDoc(collection(db, 'subject_allocations'), payload);
      await logAuditTrail('CREATE', 4, ref.id, `Daftar agihan tugas mengajar: ${selectedTeacher.name} mengajar ${payload.subjectName} di kelas ${selectedClass.name} (${payload.periodsPerWeek} period/minggu)`);

      setShowAllocModal(false);
      await fetchAllocations(selectedAcademicYear);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'subject_allocations');
    }
    setLoading(false);
  };

  const confirmAllocationOverride = async () => {
    if (!overrideJustification.trim()) {
      alert('Sila masukkan justifikasi kelulusan pentadbir.');
      return;
    }
    setLoading(true);
    try {
      const { payload, totalPeriods, teacherName } = pendingAllocation;
      const ref = await addDoc(collection(db, 'subject_allocations'), payload);
      
      await logAuditTrail(
        'AUTHORIZE', 
        4, 
        ref.id, 
        `Pelepasan Pentadbir (Override): Tugas mengajar ${teacherName} melebihi had (Jumlah: ${totalPeriods} period). Justifikasi: "${overrideJustification.trim()}"`
      );

      setShowOverrideModal(false);
      setPendingAllocation(null);
      setOverrideJustification('');
      setShowAllocModal(false);
      await fetchAllocations(selectedAcademicYear);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'subject_allocations');
    }
    setLoading(false);
  };

  const deleteAllocation = async (id: string) => {
    if (!confirm('Adakah anda pasti untuk memadam agihan subjek ini?')) return;
    setLoading(true);
    try {
      const alloc = allocations.find(a => a.id === id);
      await deleteDoc(doc(db, 'subject_allocations', id));
      
      if (alloc) {
        await logAuditTrail('DELETE', 4, id, `Padam agihan tugas mengajar: ${alloc.teacherName} mengajar ${alloc.subjectName} di kelas ${alloc.className}`);
      }

      await fetchAllocations(selectedAcademicYear);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `subject_allocations/${id}`);
    }
    setLoading(false);
  };

  // ==========================================
  // MODULE 7: Class Allocation
  // ==========================================
  const [classForm, setClassForm] = useState<Partial<ClassConfig>>({
    name: '', yearGroup: 1, classTeacherId: ''
  });
  const [showClassModal, setShowClassModal] = useState(false);

  const saveClass = async () => {
    if (!classForm.name) {
      alert('Sila masukkan nama kelas.');
      return;
    }
    setLoading(true);
    try {
      const classTeacher = personnel.find(p => p.id === classForm.classTeacherId);
      const classId = `${selectedAcademicYear.replace(/\//g, '-')}_${classForm.name.toUpperCase().trim()}`;
      
      const payload: ClassConfig = {
        id: classId,
        name: classForm.name.trim().toUpperCase(),
        academicYear: selectedAcademicYear,
        yearGroup: Number(classForm.yearGroup || 1),
        classTeacherId: classTeacher?.id || '',
        classTeacherName: classTeacher?.name || ''
      };

      await setDoc(doc(db, 'classes', classId), deepSanitizeFirestore(payload), { merge: true });
      await logAuditTrail('CREATE', 3, classId, `Daftar kelas baharu: ${payload.name} (Tahun ${payload.yearGroup}) dengan Guru Kelas: ${payload.classTeacherName || 'Tiada'}`);
      
      setShowClassModal(false);
      await fetchClasses(selectedAcademicYear);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `classes/${classForm.name}`);
    }
    setLoading(false);
  };

  const deleteClass = async (c: ClassConfig) => {
    if (!confirm(`Adakah anda pasti mahu memadam kelas ${c.name}? Murid dalam kelas ini akan kehilangan penempatan kelas mereka.`)) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'classes', c.id));
      await logAuditTrail('DELETE', 3, c.id, `Padam kelas: ${c.name} (Tahun ${c.yearGroup})`);
      await fetchClasses(selectedAcademicYear);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `classes/${c.id}`);
    }
    setLoading(false);
  };

  // ==========================================
  // MODULE 6: Student Master & Promotion
  // ==========================================
  const [editingStudent, setEditingStudent] = useState<StudentMaster | null>(null);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [studentForm, setStudentForm] = useState<Partial<StudentMaster>>({
    student_id: '', name: '', gender: 'L', race: 'Melayu', phone: '', email: ''
  });

  const [enrollmentStudentId, setEnrollmentStudentId] = useState('');
  const [enrollmentClassId, setEnrollmentClassId] = useState('');
  const [showEnrollmentModal, setShowEnrollmentModal] = useState(false);

  // Promotion States
  const [selectedPromoStudents, setSelectedPromoStudents] = useState<string[]>([]);
  const [promoTargetYear, setPromoTargetYear] = useState('');
  const [promoTargetClassId, setPromoTargetClassId] = useState('');
  const [promoClasses, setPromoClasses] = useState<ClassConfig[]>([]);

  useEffect(() => {
    if (promoTargetYear) {
      const q = query(collection(db, 'classes'), where('academicYear', '==', promoTargetYear));
      getDocs(q).then(snap => {
        setPromoClasses(snap.docs.map(d => ({ id: d.id, ...d.data() } as ClassConfig)));
      });
    }
  }, [promoTargetYear]);

  const openStudentModal = (student: StudentMaster | null) => {
    if (student) {
      setEditingStudent(student);
      setStudentForm(student);
    } else {
      setEditingStudent(null);
      setStudentForm({
        student_id: '', name: '', gender: 'L', race: 'Melayu', phone: '', email: ''
      });
    }
    setShowStudentModal(true);
  };

  const saveStudentMaster = async () => {
    if (!studentForm.name || !studentForm.student_id) {
      alert('Sila masukkan ID Murid dan Nama.');
      return;
    }
    setLoading(true);
    try {
      const sId = studentForm.student_id.toUpperCase().trim();
      await setDoc(doc(db, 'student_master', sId), deepSanitizeFirestore({
        ...studentForm,
        student_id: sId
      }), { merge: true });

      await logAuditTrail(
        editingStudent ? 'UPDATE' : 'CREATE',
        1,
        sId,
        `${editingStudent ? 'Kemas kini' : 'Daftar'} profil murid master: ${studentForm.name} (ID: ${sId})`
      );

      setShowStudentModal(false);
      await fetchEnrollments(selectedAcademicYear);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `student_master/${studentForm.student_id}`);
    }
    setLoading(false);
  };

  const saveClassEnrollment = async () => {
    if (!enrollmentStudentId || !enrollmentClassId) {
      alert('Sila pilih murid dan kelas.');
      return;
    }
    setLoading(true);
    try {
      const master = studentMasters.find(s => s.student_id === enrollmentStudentId);
      const targetClass = classes.find(c => c.id === enrollmentClassId);
      if (!master || !targetClass) {
        alert('Ralat data murid atau kelas.');
        setLoading(false);
        return;
      }

      // Add to standard 'students' collection (enrollment)
      const enrollId = `${master.student_id}_${selectedAcademicYear.replace(/\//g, '-')}`;
      await setDoc(doc(db, 'students', enrollId), deepSanitizeFirestore({
        id: enrollId,
        student_id: master.student_id,
        name: master.name,
        gender: master.gender,
        race: master.race,
        class: targetClass.name,
        year: targetClass.yearGroup,
        academic_year: selectedAcademicYear
      }), { merge: true });

      await logAuditTrail(
        'CREATE',
        5,
        enrollId,
        `Hubungkan kelas murid: ${master.name} (ID: ${master.student_id}) ke kelas ${targetClass.name} bagi Sesi ${selectedAcademicYear}`
      );

      setShowEnrollmentModal(false);
      setEnrollmentStudentId('');
      setEnrollmentClassId('');
      await fetchEnrollments(selectedAcademicYear);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `students/${enrollmentStudentId}`);
    }
    setLoading(false);
  };

  const handlePromoteStudents = async () => {
    if (selectedPromoStudents.length === 0 || !promoTargetYear || !promoTargetClassId) {
      alert('Sila pilih murid, sesi akademik sasaran, dan kelas sasaran.');
      return;
    }
    setLoading(true);
    try {
      const targetClass = promoClasses.find(c => c.id === promoTargetClassId);
      if (!targetClass) {
        alert('Kelas sasaran tidak sah.');
        setLoading(false);
        return;
      }

      const promoPromises = selectedPromoStudents.map(async (studentId) => {
        const enrollment = activeEnrollments.find(e => e.student_id === studentId);
        if (!enrollment) return;

        const enrollId = `${studentId}_${promoTargetYear.replace(/\//g, '-')}`;
        await setDoc(doc(db, 'students', enrollId), deepSanitizeFirestore({
          id: enrollId,
          student_id: studentId,
          name: enrollment.name,
          gender: enrollment.gender || 'L',
          race: enrollment.race || 'Melayu',
          class: targetClass.name,
          year: targetClass.yearGroup,
          academic_year: promoTargetYear
        }), { merge: true });
      });

      await Promise.all(promoPromises);
      
      await logAuditTrail(
        'STATE_CHANGE',
        5,
        promoTargetYear,
        `Menaikkan/memindahkan kelas berkelompok untuk ${selectedPromoStudents.length} murid ke Sesi ${promoTargetYear} (${targetClass.name})`
      );

      alert(`Berjaya menaikkan/memindahkan ${selectedPromoStudents.length} murid ke Sesi ${promoTargetYear} (${targetClass.name})`);
      setSelectedPromoStudents([]);
      setPromoTargetYear('');
      setPromoTargetClassId('');
      await fetchEnrollments(selectedAcademicYear);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'promotion_batch');
    }
    setLoading(false);
  };

  // ==========================================
  // ==========================================
  // MODULE 8A: Direct Guru Google Sheet Import (Step 1 SSOT)
  // ==========================================
  const [importMode, setImportMode] = useState<'google_sheet_guru' | 'apdm_student' | 'ids_text'>('apdm_student');
  const [guruSheetUrl, setGuruSheetUrl] = useState('');
  const [guruCsvData, setGuruCsvData] = useState('');
  const [guruFileName, setGuruFileName] = useState('');
  const [guruPreviewResponse, setGuruPreviewResponse] = useState<GuruImportPreviewResponse | null>(null);
  const [guruImportLoading, setGuruImportLoading] = useState(false);
  const [guruImportError, setGuruImportError] = useState<string | null>(null);
  const [guruCommitResult, setGuruCommitResult] = useState<{ committedCount: number; sessionId: string } | null>(null);

  // Application-Native Confirmation Modal & In-View Status State
  const [showGuruCommitModal, setShowGuruCommitModal] = useState(false);
  const [guruCommitConfirmedCheckbox, setGuruCommitConfirmedCheckbox] = useState(false);
  const [isCommittingGuru, setIsCommittingGuru] = useState(false);
  const [guruCommitError, setGuruCommitError] = useState<{ title: string; message: string; details?: string; target?: any } | null>(null);
  const [guruCommitSuccess, setGuruCommitSuccess] = useState<{ sessionId: string; committedCount: number; target: string } | null>(null);

  // APDM Student Import States (Hoisted for Auto-Detection Routing)
  const [apdmFileName, setApdmFileName] = useState('');
  const [apdmFileBase64, setApdmFileBase64] = useState('');
  const [apdmLoading, setApdmLoading] = useState(false);
  const [apdmError, setApdmError] = useState<string | null>(null);
  const [apdmPreviewResponse, setApdmPreviewResponse] = useState<ApdmStudentImportPreviewResponse | null>(null);
  const [sixYearOldPromotionMap, setSixYearOldPromotionMap] = useState<Record<string, boolean>>({});
  const [showApdmCommitModal, setShowApdmCommitModal] = useState(false);
  const [apdmCommitConfirmedCheckbox, setApdmCommitConfirmedCheckbox] = useState(false);
  const [isCommittingApdm, setIsCommittingApdm] = useState(false);
  const [apdmCommitError, setApdmCommitError] = useState<{ title: string; message: string; details?: string } | null>(null);
  const [apdmCommitSuccess, setApdmCommitSuccess] = useState<{ sessionId: string; committedCount: number; target: string } | null>(null);
  const [activeProfileStudentId, setActiveProfileStudentId] = useState<string | null>(null);

  const executeApdmPreviewWithData = async (base64Payload: string, fileNamePayload: string) => {
    if (!base64Payload) {
      setApdmError('Sila pilih fail APDM (.xlsx) terlebih dahulu.');
      return;
    }
    setApdmLoading(true);
    setApdmError(null);
    setApdmCommitSuccess(null);
    setApdmCommitError(null);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/import/apdm-student-preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken || ''}`,
        },
        body: JSON.stringify({
          excelBase64: base64Payload,
          academicYear: selectedAcademicYear || '2026',
          fileName: fileNamePayload || 'YCC3404 Keseluruhan Murid.xlsx',
        }),
      });

      const data = await parseResponseSafely(res, 'Ralat memproses fail APDM Murid.');
      if (data && data.summary && Array.isArray(data.rows)) {
        setApdmPreviewResponse(data);
        const initial6YoMap: Record<string, boolean> = {};
        if (Array.isArray(data.sixYearsOldStudents)) {
          data.sixYearsOldStudents.forEach((st: any) => {
            initial6YoMap[st.rowId] = false;
          });
        }
        setSixYearOldPromotionMap(initial6YoMap);
      } else {
        throw new Error(data?.message || data?.error || 'Format data pra-tonton APDM tidak sah.');
      }
    } catch (err: any) {
      console.warn('APDM preview error:', err);
      setApdmError(err.message || 'Gagal menjana pra-tonton APDM Murid.');
    } finally {
      setApdmLoading(false);
    }
  };

  const handleGuruSheetFetch = async () => {
    if (!guruSheetUrl.trim() && !guruCsvData.trim()) {
      setGuruImportError('Sila masukkan pautan Google Sheets yang sah atau muat naik fail CSV/XLSX.');
      return;
    }
    setGuruImportLoading(true);
    setGuruImportError(null);
    setGuruCommitResult(null);
    setGuruCommitSuccess(null);
    setGuruCommitError(null);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/import/guru-preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken || ''}`,
        },
        body: JSON.stringify({
          sheetUrl: guruSheetUrl.trim() || undefined,
          csvData: guruCsvData.trim() || undefined,
        }),
      });

      const data = await parseResponseSafely(res, 'Ralat menjana pra-tonton import guru.');
      if (data && data.summary && Array.isArray(data.rows)) {
        setGuruPreviewResponse(data);
      } else {
        throw new Error(data?.message || data?.error || 'Format data pra-tonton tidak sah atau tidak lengkap.');
      }
    } catch (err: any) {
      console.warn('Guru preview fetch error:', err);
      setGuruImportError(err.message || 'Gagal mencapai sumber Google Sheets.');
    } finally {
      setGuruImportLoading(false);
    }
  };

  const handleGuruFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setGuruFileName(file.name);
    setGuruImportError(null);

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const reader = new FileReader();

    if (isExcel) {
      reader.onload = (event) => {
        try {
          const buffer = event.target?.result as ArrayBuffer;
          const workbook = XLSX.read(buffer, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          if (!firstSheetName) {
            setGuruImportError('Fail Excel tidak mengandungi sebarang lembaran kerja.');
            return;
          }
          const worksheet = workbook.Sheets[firstSheetName];
          const csvText = XLSX.utils.sheet_to_csv(worksheet);

          // AUTO-DETECT APDM STUDENT FILE (Prevent routing student XLSX to Guru parser)
          const upperHeaderCheck = (csvText.slice(0, 5000) + ' ' + file.name).toUpperCase();
          const isStudentApdm = 
            upperHeaderCheck.includes('ID MURID') ||
            upperHeaderCheck.includes('PENJAGA 1') ||
            upperHeaderCheck.includes('TAHUN / TINGKATAN') ||
            upperHeaderCheck.includes('TAHUN/TINGKATAN') ||
            upperHeaderCheck.includes('NAMA GURU KELAS') ||
            upperHeaderCheck.includes('KESELURUHAN MURID');

          if (isStudentApdm) {
            // Automatically switch importMode to 'apdm_student'
            setImportMode('apdm_student');
            setApdmFileName(file.name);
            setApdmError(null);
            setApdmCommitSuccess(null);
            setApdmCommitError(null);

            // Convert buffer to base64 for preview
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            const base64 = btoa(binary);
            setApdmFileBase64(base64);

            // Clear Guru state so it is clean
            setGuruFileName('');
            setGuruCsvData('');
            setGuruPreviewResponse(null);
            setGuruImportError(null);

            // Trigger APDM Preview automatically
            executeApdmPreviewWithData(base64, file.name);
            return;
          }

          setGuruCsvData(csvText);
        } catch (err: any) {
          console.error('Error reading Excel file:', err);
          setGuruImportError(`Ralat membaca fail Excel: ${err.message}`);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const upperHeaderCheck = (text.slice(0, 5000) + ' ' + file.name).toUpperCase();
        const isStudentApdm = 
          upperHeaderCheck.includes('ID MURID') ||
          upperHeaderCheck.includes('PENJAGA 1') ||
          upperHeaderCheck.includes('TAHUN / TINGKATAN') ||
          upperHeaderCheck.includes('TAHUN/TINGKATAN') ||
          upperHeaderCheck.includes('NAMA GURU KELAS') ||
          upperHeaderCheck.includes('KESELURUHAN MURID');

        if (isStudentApdm) {
          setImportMode('apdm_student');
          setApdmFileName(file.name);
          setApdmError(null);
          setApdmCommitSuccess(null);
          setApdmCommitError(null);

          const base64 = btoa(unescape(encodeURIComponent(text)));
          setApdmFileBase64(base64);

          setGuruFileName('');
          setGuruCsvData('');
          setGuruPreviewResponse(null);
          setGuruImportError(null);

          executeApdmPreviewWithData(base64, file.name);
          return;
        }

        setGuruCsvData(text);
      };
      reader.readAsText(file);
    }
  };

  const handleOpenGuruCommitModal = () => {
    if (!guruPreviewResponse || !guruPreviewResponse.sessionId) {
      setGuruCommitError({
        title: 'Tiada Sesi Pra-tonton',
        message: 'Sila jana pra-tonton lembaran kerja guru terlebih dahulu sebelum mengkomit data.',
      });
      return;
    }
    setGuruCommitError(null);
    setGuruCommitConfirmedCheckbox(false);
    setShowGuruCommitModal(true);
  };

  const handleExecuteGuruCommit = async () => {
    if (!guruPreviewResponse || !guruPreviewResponse.sessionId) return;
    if (!guruCommitConfirmedCheckbox) return;

    setIsCommittingGuru(true);
    setGuruCommitError(null);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/import/guru-commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken || ''}`,
        },
        body: JSON.stringify({
          sessionId: guruPreviewResponse.sessionId,
        }),
      });

      const data = await parseResponseSafely(res, 'Ralat semasa mengkomit data guru.');

      setShowGuruCommitModal(false);
      const successInfo = {
        committedCount: data.committedCount,
        sessionId: data.sessionId,
        target: data.target || 'gen-lang-client-0384285333/ai-studio-9da55e18-8b12-4090-9356-16a74f3c27e2',
      };
      setGuruCommitResult({ committedCount: data.committedCount, sessionId: data.sessionId });
      setGuruCommitSuccess(successInfo);

      await fetchPersonnel();
      await fetchImportSessions();
      await fetchAuditTrail();
    } catch (err: any) {
      console.warn('Guru commit notice:', err);
      setGuruCommitError({
        title: 'Gagal Mengkomit Data Guru',
        message: err.message || 'Ralat rangkaian atau pangkalan data tidak dapat diakses. Tiada data ditulis.',
      });
    } finally {
      setIsCommittingGuru(false);
    }
  };

  const handleGuruReset = () => {
    setGuruSheetUrl('');
    setGuruCsvData('');
    setGuruFileName('');
    setGuruPreviewResponse(null);
    setGuruImportError(null);
    setGuruCommitResult(null);
    setGuruCommitSuccess(null);
    setGuruCommitError(null);
    setShowGuruCommitModal(false);
    setGuruCommitConfirmedCheckbox(false);
  };

  // ==========================================
  // MODULE 8C: APDM Student Excel (.xlsx) Import & 6YO Gate
  // (State hoisted to top of component for auto-detection support)

  const handleApdmFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setApdmFileName(file.name);
    setApdmError(null);
    setApdmCommitSuccess(null);
    setApdmCommitError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const buffer = event.target?.result as ArrayBuffer;
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        setApdmFileBase64(base64);
      } catch (err: any) {
        console.error('Error reading APDM Excel file:', err);
        setApdmError(`Ralat membaca fail APDM: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleApdmPreview = async () => {
    await executeApdmPreviewWithData(apdmFileBase64, apdmFileName);
  };

  const handleToggleSixYearOld = (rowId: string) => {
    setSixYearOldPromotionMap(prev => ({
      ...prev,
      [rowId]: !prev[rowId],
    }));
  };

  const handleSelectAllSixYearOld = (promote: boolean) => {
    if (!apdmPreviewResponse?.sixYearsOldStudents) return;
    const nextMap: Record<string, boolean> = {};
    apdmPreviewResponse.sixYearsOldStudents.forEach((st: any) => {
      nextMap[st.rowId] = promote;
    });
    setSixYearOldPromotionMap(nextMap);
  };

  const handleOpenApdmCommitModal = () => {
    if (!apdmPreviewResponse || !apdmPreviewResponse.sessionId) {
      setApdmCommitError({
        title: 'Tiada Sesi Pra-tonton',
        message: 'Sila muat naik fail APDM dan jana pra-tonton terlebih dahulu.',
      });
      return;
    }
    setApdmCommitError(null);
    setApdmCommitConfirmedCheckbox(false);
    setShowApdmCommitModal(true);
  };

  const handleExecuteApdmCommit = async () => {
    if (!apdmPreviewResponse || !apdmPreviewResponse.sessionId) return;
    if (!apdmCommitConfirmedCheckbox) return;

    setIsCommittingApdm(true);
    setApdmCommitError(null);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      const promotedIds = Object.keys(sixYearOldPromotionMap).filter(k => sixYearOldPromotionMap[k]);

      const res = await fetch('/api/import/apdm-student-commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken || ''}`,
        },
        body: JSON.stringify({
          sessionId: apdmPreviewResponse.sessionId,
          sixYearsOldPromoteIds: promotedIds,
        }),
      });

      const data = await parseResponseSafely(res, 'Ralat semasa mengkomit data murid ke SSOT.');

      setShowApdmCommitModal(false);
      setApdmCommitSuccess({
        sessionId: data.sessionId,
        committedCount: data.committedCount,
        target: data.target || 'gen-lang-client-0384285333/ai-studio-9da55e18-8b12-4090-9356-16a74f3c27e2',
      });

      if (selectedAcademicYear) {
        await fetchEnrollments(selectedAcademicYear);
      }
      await fetchImportSessions();
      await fetchAuditTrail();
    } catch (err: any) {
      console.warn('APDM commit notice:', err);
      setApdmCommitError({
        title: 'Gagal Mengkomit Data Murid APDM',
        message: err.message || 'Ralat rangkaian atau pangkalan data tidak dapat diakses. Tiada data ditulis.',
      });
    } finally {
      setIsCommittingApdm(false);
    }
  };

  const handleApdmReset = () => {
    setApdmFileName('');
    setApdmFileBase64('');
    setApdmPreviewResponse(null);
    setApdmError(null);
    setSixYearOldPromotionMap({});
    setApdmCommitSuccess(null);
    setApdmCommitError(null);
    setShowApdmCommitModal(false);
    setApdmCommitConfirmedCheckbox(false);
  };

  // ==========================================
  // MODULE 8B: Incremental Import (IDS)
  // ==========================================
  const [importType, setImportType] = useState<'personnel' | 'student'>('student');
  const [pasteData, setPasteData] = useState('');
  const [idsPreview, setIdsPreview] = useState<any[]>([]);
  const [idsSummary, setIdsSummary] = useState({ insert: 0, fill: 0, conflict: 0, skip: 0 });
  const [importActive, setImportActive] = useState(false);

  const handleIdsPreview = async () => {
    if (!pasteData.trim()) {
      alert('Sila tampal data terlebih dahulu.');
      return;
    }
    setLoading(true);
    const lines = pasteData.split('\n').map(l => l.trim()).filter(Boolean);
    const resolvedRows: any[] = [];
    let insertCount = 0;
    let fillCount = 0;
    let conflictCount = 0;
    let skipCount = 0;

    try {
      for (const line of lines) {
        const cols = line.split(/[,\t]/).map(c => c.trim());
        if (cols.length < 2) continue;

        if (importType === 'personnel') {
          // Columns: Name, IC, Gender, Email, Phone, EmploymentStatus, TeachingStatus
          const [name, ic, genderRaw, email, phone, empStatus, teachStatus] = cols;
          const gender = (genderRaw?.toUpperCase().startsWith('P') ? 'P' : 'L') as 'L' | 'P';
          const cleanIc = ic?.replace(/[^a-zA-Z0-9]/g, '') || '';

          if (!cleanIc) continue;

          // Check DB
          const ref = doc(db, 'personnel', cleanIc);
          const snap = await getDoc(ref);

          if (!snap.exists()) {
            insertCount++;
            resolvedRows.push({
              key: cleanIc,
              type: 'personnel',
              status: 'INSERT',
              action: 'Kemasukan Baharu',
              data: {
                id: cleanIc,
                name: name || 'GURU BARU',
                ic: ic,
                gender,
                email: email || '',
                phone: phone || '',
                employmentStatus: empStatus || 'Tetap',
                teachingStatus: teachStatus || 'Aktif',
                portfolios: [], committees: [], coordinators: [], additionalResponsibilities: []
              },
              details: 'Rekod tidak ditemui dalam SSOT. Profil akan didaftarkan.'
            });
          } else {
            const existing = snap.data() as PersonnelProfile;
            const diffs: string[] = [];
            const emptyFills: Partial<PersonnelProfile> = {};

            // Compare Name
            if (name && existing.name !== name) {
              diffs.push(`Nama: "${existing.name}" -> "${name}"`);
            }
            // Compare Email
            if (email && existing.email !== email) {
              if (!existing.email) emptyFills.email = email;
              else diffs.push(`E-mel: "${existing.email}" -> "${email}"`);
            }
            // Compare Phone
            if (phone && existing.phone !== phone) {
              if (!existing.phone) emptyFills.phone = phone;
              else diffs.push(`Telefon: "${existing.phone}" -> "${phone}"`);
            }

            if (diffs.length > 0) {
              conflictCount++;
              resolvedRows.push({
                key: cleanIc,
                type: 'personnel',
                status: 'CONFLICT',
                action: 'Konflik Nilai',
                data: { ...existing },
                details: `Terdapat perbezaan nilai dalam pangkalan data: ${diffs.join(', ')}. Rekod ini dilangkau untuk keselamatan.`
              });
            } else if (Object.keys(emptyFills).length > 0) {
              fillCount++;
              resolvedRows.push({
                key: cleanIc,
                type: 'personnel',
                status: 'FILL_EMPTY',
                action: 'Isi Medan Kosong',
                data: { ...existing, ...emptyFills },
                details: `Medan kosong akan diisi: ${Object.keys(emptyFills).join(', ')}.`
              });
            } else {
              skipCount++;
              resolvedRows.push({
                key: cleanIc,
                type: 'personnel',
                status: 'SKIP',
                action: 'Bertindih (Langkau)',
                data: existing,
                details: 'Maklumat sepadan sepenuhnya dengan rekod semasa.'
              });
            }
          }

        } else {
          // Columns: StudentID, Name, Gender, Race, Phone, Email
          const [sId, name, genderRaw, race, phone, email] = cols;
          const gender = (genderRaw?.toUpperCase().startsWith('P') ? 'P' : 'L') as 'L' | 'P';
          const cleanId = sId?.toUpperCase().trim() || '';

          if (!cleanId) continue;

          // Check DB
          const ref = doc(db, 'student_master', cleanId);
          const snap = await getDoc(ref);

          if (!snap.exists()) {
            insertCount++;
            resolvedRows.push({
              key: cleanId,
              type: 'student',
              status: 'INSERT',
              action: 'Kemasukan Baharu',
              data: {
                student_id: cleanId,
                name: name || 'MURID BARU',
                gender,
                race: race || 'Melayu',
                phone: phone || '',
                email: email || ''
              },
              details: 'Murid baru dikesan. Profil master akan diwujudkan.'
            });
          } else {
            const existing = snap.data() as StudentMaster;
            const diffs: string[] = [];
            const emptyFills: Partial<StudentMaster> = {};

            if (name && existing.name !== name) {
              diffs.push(`Nama: "${existing.name}" -> "${name}"`);
            }
            if (race && existing.race !== race) {
              if (!existing.race) emptyFills.race = race;
              else diffs.push(`Kaum: "${existing.race}" -> "${race}"`);
            }

            if (diffs.length > 0) {
              conflictCount++;
              resolvedRows.push({
                key: cleanId,
                type: 'student',
                status: 'CONFLICT',
                action: 'Konflik Nilai',
                data: existing,
                details: `Terdapat perbezaan nilai: ${diffs.join(', ')}. Rekod dilangkau.`
              });
            } else if (Object.keys(emptyFills).length > 0) {
              fillCount++;
              resolvedRows.push({
                key: cleanId,
                type: 'student',
                status: 'FILL_EMPTY',
                action: 'Isi Medan Kosong',
                data: { ...existing, ...emptyFills },
                details: `Mengisi medan kosong: ${Object.keys(emptyFills).join(', ')}.`
              });
            } else {
              skipCount++;
              resolvedRows.push({
                key: cleanId,
                type: 'student',
                status: 'SKIP',
                action: 'Bertindih (Langkau)',
                data: existing,
                details: 'Maklumat sedia ada adalah sepadan sepenuhnya.'
              });
            }
          }
        }
      }

      setIdsPreview(resolvedRows);
      setIdsSummary({ insert: insertCount, fill: fillCount, conflict: conflictCount, skip: skipCount });
    } catch (e) {
      console.error(e);
      alert('Ralat memproses pratonton IDS.');
    }
    setLoading(false);
  };

  const commitIdsImport = async () => {
    if (idsPreview.length === 0) return;
    setLoading(true);
    let successCount = 0;
    const sessionId = `session_${Date.now()}`;

    try {
      for (const row of idsPreview) {
        if (row.status === 'INSERT' || row.status === 'FILL_EMPTY') {
          const colName = row.type === 'personnel' ? 'personnel' : 'student_master';
          const ref = doc(db, colName, row.key);
          const snap = await getDoc(ref);

          // Prepare rollback history record
          const rollbackId = `rollback_${Date.now()}_${row.key}`;
          const rollbackRef = doc(db, 'rollback_records', rollbackId);
          await setDoc(rollbackRef, {
            id: rollbackId,
            sessionId,
            collection: colName,
            docId: row.key,
            actionType: row.status,
            previousState: snap.exists() ? snap.data() : null
          });

          // Perform write
          if (row.type === 'personnel') {
            await setDoc(ref, row.data, { merge: true });

            // Backward compatible collection update
            await setDoc(doc(db, 'teachers', row.key), {
              name: row.data.name,
              ic: row.data.ic,
              email: row.data.email?.toLowerCase().trim()
            }, { merge: true });

          } else {
            await setDoc(ref, row.data, { merge: true });
          }
          successCount++;
        }
      }

      // Record Import Session metadata
      const sessionDoc: ImportSession = {
        id: sessionId,
        timestamp: new Date().toISOString(),
        importType: importType,
        summary: idsSummary,
        status: 'active',
        actorName: auth.currentUser?.displayName || auth.currentUser?.email || 'Pentadbir Utama'
      };
      await setDoc(doc(db, 'import_sessions', sessionId), sessionDoc);

      await logAuditTrail(
        'IMPORT', 
        6, 
        sessionId, 
        `Melaksanakan import pintar IDS (${importType}) dengan ID Sesi ${sessionId}. Kemasukan: ${idsSummary.insert}, Isi medan kosong: ${idsSummary.fill}`
      );

      alert(`Import IDS Berjaya! ${successCount} rekod telah dikemas kini atau dimasukkan.`);
      setPasteData('');
      setIdsPreview([]);
      setIdsSummary({ insert: 0, fill: 0, conflict: 0, skip: 0 });
      await fetchPersonnel();
      await fetchEnrollments(selectedAcademicYear);
      await fetchImportSessions();
    } catch (e) {
      console.error(e);
      alert('Ralat komit import data.');
    }
    setLoading(false);
  };

  const rollbackImportSession = async (sessId: string) => {
    if (!confirm('Adakah anda pasti mahu membatalkan (rollback) sesi import ini? Semua rekod yang dimasukkan akan dipadamkan, dan rekod yang dikemas kini akan dikembalikan kepada nilai asal.')) return;
    
    setLoading(true);
    try {
      // Fetch all rollback records for this session
      const q = query(collection(db, 'rollback_records'), where('sessionId', '==', sessId));
      const snap = await getDocs(q);
      const records = snap.docs.map(d => d.data() as RollbackRecord);

      let revertedCount = 0;

      for (const rec of records) {
        if (rec.actionType === 'INSERT') {
          // If it was inserted, delete it!
          await deleteDoc(doc(db, rec.collection, rec.docId));
          if (rec.collection === 'personnel') {
            await deleteDoc(doc(db, 'teachers', rec.docId));
          }
        } else {
          // If it was updated/filled, restore previous state!
          if (rec.previousState) {
            await setDoc(doc(db, rec.collection, rec.docId), rec.previousState);
            if (rec.collection === 'personnel') {
              await setDoc(doc(db, 'teachers', rec.docId), {
                name: rec.previousState.name,
                ic: rec.previousState.ic,
                email: rec.previousState.email?.toLowerCase().trim()
              }, { merge: true });
            }
          }
        }
        revertedCount++;
      }

      // Update Import Session status
      await updateDoc(doc(db, 'import_sessions', sessId), { status: 'rolled_back' });

      // Log to audit trail
      await logAuditTrail(
        'ROLLBACK', 
        6, 
        sessId, 
        `Membatalkan (rollback) sesi import ${sessId}. ${revertedCount} rekod telah dikembalikan ke keadaan asal.`
      );

      alert(`Pengunduran berjaya! ${revertedCount} rekod dikembalikan.`);
      await fetchImportSessions();
      await fetchPersonnel();
      await fetchEnrollments(selectedAcademicYear);
    } catch (e) {
      console.error('Failed to rollback import:', e);
      alert('Gagal melakukan pengunduran sesi import.');
    }
    setLoading(false);
  };

  return (
    <div className="bg-slate-50 min-h-screen text-slate-900 rounded-3xl overflow-hidden border border-slate-200">
      {/* Tab Navigation Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40 px-8 py-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <ShieldCheck className="text-blue-600" size={28} />
              <h2 className="text-2xl font-black italic uppercase tracking-tighter text-slate-900">
                Pangkalan Data Induk (SSOT)
              </h2>
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">
              Satu punca kebenaran (Single Source of Truth) iSEF Governance & Metadata System
            </p>
          </div>

          <div className="flex items-center gap-3 w-full lg:w-auto">
            <span className="text-xs font-black text-slate-400 uppercase">Sesi Aktif:</span>
            <select
              value={selectedAcademicYear}
              onChange={(e) => setSelectedAcademicYear(e.target.value)}
              className="bg-slate-100 hover:bg-slate-200 border-none rounded-xl px-4 py-2 text-xs font-black text-slate-800 transition-colors cursor-pointer"
            >
              {academicYears.map(y => (
                <option key={y.year} value={y.year}>{y.year} {y.status === 'active' && '●'}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Horizontal Navigation Sub-Tabs */}
        <div className="flex flex-wrap gap-2 mt-6 border-t border-slate-100 pt-4">
          <SubTabBtn active={activeSubTab === 'config'} onClick={() => setActiveSubTab('config')} icon={<Settings size={16} />} label="Profil Sekolah" />
          <SubTabBtn active={activeSubTab === 'academic_years'} onClick={() => setActiveSubTab('academic_years')} icon={<Calendar size={16} />} label="Sesi Akademik" />
          <SubTabBtn active={activeSubTab === 'personnel'} onClick={() => setActiveSubTab('personnel')} icon={<UserSquare size={16} />} label="Profil Guru & Portfolio" />
          <SubTabBtn active={activeSubTab === 'classes'} onClick={() => setActiveSubTab('classes')} icon={<Building2 size={16} />} label="Kelas & Guru Kelas" />
          <SubTabBtn active={activeSubTab === 'subject_allocations'} onClick={() => setActiveSubTab('subject_allocations')} icon={<BookOpen size={16} />} label="Agihan Mengajar (Jadual)" />
          <SubTabBtn active={activeSubTab === 'students'} onClick={() => setActiveSubTab('students')} icon={<Users2 size={16} />} label="Profil Murid & Promosi" />
          <SubTabBtn active={activeSubTab === 'import'} onClick={() => setActiveSubTab('import')} icon={<UploadCloud size={16} />} label="Import Pintar (IDS)" />
          <SubTabBtn active={activeSubTab === 'history'} onClick={() => setActiveSubTab('history')} icon={<FolderOpen size={16} />} label="Sejarah Import & Rollback" />
          <SubTabBtn active={activeSubTab === 'audit'} onClick={() => setActiveSubTab('audit')} icon={<ShieldCheck size={16} />} label="Log Audit SSOT" />
        </div>
      </div>

      <div className="p-8">
        {loading && (
          <div className="flex items-center justify-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm mb-6">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-xs font-bold uppercase tracking-wider text-slate-400">Memuatkan data...</span>
          </div>
        )}

        {!loading && (
          <div className="space-y-8">
            {/* ======================================================== */}
            {/* SUB-TAB 1: SCHOOL CONFIGURATION */}
            {/* ======================================================== */}
            {activeSubTab === 'config' && schoolConfig && (
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-md">
                <div className="flex items-center justify-between mb-8 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-xl font-black italic uppercase tracking-tight text-slate-800">
                      Konfigurasi Tadbir Urus Sekolah
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Maklumat institusi primer yang diwarisi oleh semua sub-module iSEPADU.
                    </p>
                  </div>
                  {!editingConfig ? (
                    <button
                      onClick={() => setEditingConfig(true)}
                      className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs uppercase px-4 py-2.5 rounded-xl transition-all"
                    >
                      <Edit3 size={14} /> Kemas Kini
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={saveSchoolConfig}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs uppercase px-4 py-2.5 rounded-xl transition-all"
                      >
                        <Save size={14} /> Simpan
                      </button>
                      <button
                        onClick={() => {
                          setConfigForm(schoolConfig);
                          setEditingConfig(false);
                        }}
                        className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-extrabold text-xs uppercase px-4 py-2.5 rounded-xl transition-all"
                      >
                        <X size={14} /> Batal
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div>
                      <label className="block text-xs font-black uppercase text-slate-400 mb-2">Nama Sekolah</label>
                      <input
                        type="text"
                        disabled={!editingConfig}
                        value={configForm.schoolName || ''}
                        onChange={(e) => setConfigForm({ ...configForm, schoolName: e.target.value.toUpperCase() })}
                        className="w-full bg-slate-50 disabled:bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-black uppercase text-slate-400 mb-2">Jenis Sekolah</label>
                        <select
                          disabled={!editingConfig}
                          value={configForm.schoolType || 'SK'}
                          onChange={(e) => setConfigForm({ ...configForm, schoolType: e.target.value as any })}
                          className="w-full bg-slate-50 disabled:opacity-75 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                        >
                          <option value="SK">Sekolah Kebangsaan (SK)</option>
                          <option value="SJKC">Sekolah Jenis Kebangsaan Cina (SJKC)</option>
                          <option value="SJKT">Sekolah Jenis Kebangsaan Tamil (SJKT)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-black uppercase text-slate-400 mb-2">Kategori</label>
                        <select
                          disabled={!editingConfig}
                          value={configForm.schoolCategory || 'Non-SKM'}
                          onChange={(e) => setConfigForm({ ...configForm, schoolCategory: e.target.value as any })}
                          className="w-full bg-slate-50 disabled:opacity-75 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                        >
                          <option value="SKM">Sekolah Kurang Murid (SKM)</option>
                          <option value="Non-SKM">Sekolah Biasa (Non-SKM)</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex gap-8 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          disabled={!editingConfig}
                          checked={configForm.hasPreschool || false}
                          onChange={(e) => setConfigForm({ ...configForm, hasPreschool: e.target.checked })}
                          className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                        />
                        <span className="text-xs font-black uppercase text-slate-600">Prasekolah</span>
                      </label>

                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          disabled={!editingConfig}
                          checked={configForm.hasPPKI || false}
                          onChange={(e) => setConfigForm({ ...configForm, hasPPKI: e.target.checked })}
                          className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                        />
                        <span className="text-xs font-black uppercase text-slate-600">Program Khas (PPKI)</span>
                      </label>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-xs font-black uppercase text-slate-400 mb-2">Sesi Akademik Semasa</label>
                      <input
                        type="text"
                        disabled={!editingConfig}
                        value={configForm.academicSession || ''}
                        onChange={(e) => setConfigForm({ ...configForm, academicSession: e.target.value })}
                        className="w-full bg-slate-50 disabled:bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 focus:outline-none"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-black uppercase text-slate-400">Logo Sekolah</label>
                        <button
                          type="button"
                          onClick={() => setIsLogoModalOpen(true)}
                          className="text-[11px] font-black uppercase tracking-wider text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <UploadCloud size={13} />
                          <span>Muat Naik / Ekstrak URL</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                        <div className="w-14 h-14 bg-slate-900 rounded-xl p-1 shrink-0 flex items-center justify-center">
                          <SchoolLogo src={configForm.schoolLogo || ''} className="w-12 h-12" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <input
                            type="text"
                            disabled={!editingConfig}
                            value={configForm.schoolLogo || ''}
                            placeholder="Tinggalkan kosong untuk menggunakan logo laluan"
                            onChange={(e) => setConfigForm({ ...configForm, schoolLogo: e.target.value })}
                            className="w-full bg-white disabled:bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-blue-500 truncate"
                          />
                          <p className="text-[10px] text-slate-400 mt-1">
                            {configForm.schoolLogo
                              ? (configForm.schoolLogo.startsWith('data:') ? 'Format: Imej Dimuat Naik (Tersimpan)' : 'Format: Pautan URL Luaran')
                              : 'Menggunakan lambang rasmi laluan iSEPADU'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* SUB-TAB 2: ACADEMIC YEAR MANAGER */}
            {/* ======================================================== */}
            {activeSubTab === 'academic_years' && (
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-md">
                <div className="mb-6">
                  <h3 className="text-xl font-black italic uppercase tracking-tight text-slate-800">
                    Pengurusan Sesi Akademik
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Uruskan tahun sesi persekolahan. Rekod lama dikekalkan bagi pematuhan arkib sejarah.
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Left Form */}
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                    <h4 className="text-xs font-black uppercase text-slate-600 mb-4 tracking-wider">Tambah Sesi Akademik</h4>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-black text-slate-400 mb-1">Sesi Akademik</label>
                        <input
                          type="text"
                          placeholder="Contoh: 2026/2027 atau 2027"
                          value={newYear}
                          onChange={(e) => setNewYear(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <button
                        onClick={addAcademicYear}
                        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs uppercase py-2.5 rounded-xl transition-all"
                      >
                        <Plus size={14} /> Daftar Tahun
                      </button>
                    </div>
                  </div>

                  {/* Right List */}
                  <div className="lg:col-span-2">
                    <div className="overflow-x-auto rounded-2xl border border-slate-100">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-wider">
                            <th className="px-6 py-4">Sesi Akademik</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4 text-right">Tindakan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 italic">
                          {academicYears.map(y => (
                            <tr key={y.year} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4 text-xs font-black text-slate-800">{y.year}</td>
                              <td className="px-6 py-4">
                                <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-lg ${y.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                  {y.status === 'active' ? 'AKTIF (SESI UTAMA)' : 'SEJARAH'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                {y.status !== 'active' && (
                                  <button
                                    onClick={() => setAcademicYearStatus(y.year, 'active')}
                                    className="text-xs font-black text-blue-600 hover:text-blue-800"
                                  >
                                    Set Sebagai Aktif
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* SUB-TAB 3: PERSONNEL MASTER & GOVERNANCE */}
            {/* ======================================================== */}
            {activeSubTab === 'personnel' && (
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-md">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-xl font-black italic uppercase tracking-tight text-slate-800">
                      Direktori & Profil Guru Pentadbir
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Satu profil induk mutlak untuk setiap tenaga pengajar (iSEPADU Core SSOT). Tiada rekod bertindih.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 self-start flex-wrap">
                    <button
                      type="button"
                      onClick={handleSyncPersonnelToUsers}
                      disabled={syncingPersonnelUsers}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-extrabold text-xs uppercase px-4 py-2.5 rounded-xl transition-all shadow-md cursor-pointer"
                      title="Selaraskan guru & AKP ke modul Kehadiran Staf agar guru dipaparkan dalam pemantauan kehadiran"
                    >
                      <RefreshCw size={14} className={syncingPersonnelUsers ? 'animate-spin' : ''} />
                      <span>{syncingPersonnelUsers ? 'Menyelaras...' : 'Selaras ke Kehadiran Staf'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openTeacherModal(null)}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs uppercase px-4 py-2.5 rounded-xl transition-all shadow-md cursor-pointer"
                    >
                      <Plus size={14} /> Daftar Guru Baharu
                    </button>
                  </div>
                </div>

                {syncPersonnelSuccess && (
                  <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-emerald-800 animate-in fade-in">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                      <span className="text-xs font-bold">{syncPersonnelSuccess}</span>
                    </div>
                    <button onClick={() => setSyncPersonnelSuccess(null)} className="text-xs text-emerald-600 hover:text-emerald-900 font-bold ml-2">✕</button>
                  </div>
                )}

                {personnelError && (
                  <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-rose-700">
                    <AlertCircle size={20} className="shrink-0" />
                    <div>
                      <div className="text-xs font-black uppercase tracking-wider">Ralat Capaian SSOT</div>
                      <div className="text-xs font-bold mt-0.5">{personnelError}</div>
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-wider border-b border-slate-100">
                        <th className="px-6 py-4">Nama Guru</th>
                        <th className="px-6 py-4">No. KP / IC</th>
                        <th className="px-6 py-4">E-mel DELIMa</th>
                        <th className="px-6 py-4">Peranan (Jadual)</th>
                        <th className="px-6 py-4">Status Mengajar</th>
                        <th className="px-6 py-4">Tanggungjawab & Portfolio (Metadata)</th>
                        <th className="px-6 py-4 text-right">Tindakan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-700">
                      {personnel.map(p => (
                        <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 text-slate-900 uppercase">
                            <div>{p.name}</div>
                            <div className="text-[10px] text-slate-400 italic mt-0.5">{p.employmentStatus} ({p.gender})</div>
                          </td>
                          <td className="px-6 py-4 font-mono text-slate-500">{p.ic}</td>
                          <td className="px-6 py-4 font-mono text-blue-600 font-normal">{p.email}</td>
                          <td className="px-6 py-4">
                            <StaffRoleCell
                              userId={p.id}
                              currentCategory={p.category || 'GURU'}
                              currentSubRole={(p as any).subRole || (p as any).primaryRoleCode || ((p as any).role === 'PRINCIPAL' || (p as any).jawatan === 'Guru Besar' ? 'GB' : undefined)}
                              currentRole={p.category || 'GURU'}
                              userEmail={p.email}
                              onUpdated={(newCat, newSub) => {
                                setPersonnel(prev => prev.map(item => item.id === p.id ? { ...item, category: newCat, subRole: newSub } : item));
                              }}
                              onRoleUpdated={(newRole) => {
                                setPersonnel(prev => prev.map(item => item.id === p.id ? { ...item, category: newRole } : item));
                              }}
                            />
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-lg ${p.teachingStatus === 'Aktif' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                              {p.teachingStatus}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1 max-w-sm">
                              {governanceAssignments.filter(ga => ga.personnelId === p.id).map(ga => {
                                const typeLabel = ga.governanceType === 'PORTFOLIO' ? 'P' : ga.governanceType === 'COMMITTEE' ? 'J' : ga.governanceType === 'COORDINATOR' ? 'K' : 'L';
                                const roleColor = ga.role === 'CHAIR' ? 'bg-rose-50 text-rose-700 border-rose-200' : ga.role === 'SECRETARY' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-100';
                                return (
                                  <span key={ga.id} className={`text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase border ${roleColor}`}>
                                    {typeLabel}: {ga.entityName} ({ga.role} - {ga.raciRole})
                                  </span>
                                );
                              })}
                              {governanceAssignments.filter(ga => ga.personnelId === p.id).length === 0 && (
                                <span className="text-[10px] text-slate-400 italic font-semibold">Tiada Tugasan Sesi Ini</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => openTeacherModal(p)}
                                className="text-blue-600 hover:text-blue-800 p-1"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                onClick={() => deleteTeacher(p)}
                                className="text-rose-500 hover:text-rose-700 p-1"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {personnel.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-400">
                            <AlertCircle size={32} className="mx-auto mb-2 opacity-30" />
                            <p className="font-bold text-xs">{personnelError ? 'Gagal mengakses Data Guru iSEPADU Core. Sila semak status sambungan Core.' : 'Tiada profil guru ditemui dalam iSEPADU Core SSOT.'}</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* SUB-TAB 4: CLASS CONFIGURATION */}
            {/* ======================================================== */}
            {activeSubTab === 'classes' && (
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-md">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-xl font-black italic uppercase tracking-tight text-slate-800">
                      Daftar Kelas Sesi {selectedAcademicYear}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Konfigurasi nama kelas mengikut Sesi Akademik. Hubungkan Guru Kelas tanpa nama kelas berkod keras.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setClassForm({ name: '', yearGroup: 4, classTeacherId: '' });
                      setShowClassModal(true);
                    }}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs uppercase px-4 py-2.5 rounded-xl shadow-md transition-all self-start"
                  >
                    <Plus size={14} /> Tambah Kelas Baharu
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {classes.map(c => (
                    <div key={c.id} className="bg-slate-50 border border-slate-200 rounded-3xl p-6 relative group hover:shadow-md transition-all">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <span className="text-[10px] font-black uppercase text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-lg">Tahun {c.yearGroup}</span>
                          <h4 className="text-xl font-black text-slate-800 uppercase mt-1">{c.name}</h4>
                        </div>
                        <button
                          onClick={() => deleteClass(c)}
                          className="text-rose-500 hover:text-rose-700"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      
                      <div className="bg-white p-4 rounded-2xl border border-slate-100 text-xs">
                        <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Guru Kelas (Tanggungjawab Utama)</span>
                        <p className="font-extrabold text-slate-700 uppercase">{c.classTeacherName || 'Belum Diisi'}</p>
                      </div>
                    </div>
                  ))}
                  {classes.length === 0 && (
                    <div className="col-span-full py-16 text-center text-slate-400">
                      <AlertCircle size={40} className="mx-auto mb-3 opacity-20" />
                      <p className="font-bold italic text-sm">Tiada kelas didaftarkan untuk Sesi Akademik ini.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* ======================================================== */}
            {/* SUB-TAB 5: SUBJECT ALLOCATION */}
            {/* ======================================================== */}
            {activeSubTab === 'subject_allocations' && (
              <div className="space-y-6">
                {/* View Switcher Bar */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAllocationViewMode('matrix')}
                      className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        allocationViewMode === 'matrix'
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      Matriks Jadual Mengajar (T1–T6)
                    </button>
                    <button
                      onClick={() => setAllocationViewMode('table')}
                      className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        allocationViewMode === 'table'
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      Senarai Agihan Rekod ({allocations.length})
                    </button>
                  </div>

                  {allocationViewMode === 'table' && (
                    <button
                      onClick={() => {
                        setAllocationForm({ teacherId: '', classId: '', subjectName: '', periodsPerWeek: 4, role: 'MAIN' });
                        setShowAllocModal(true);
                      }}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs uppercase px-4 py-2 rounded-xl shadow-md transition-all self-start cursor-pointer"
                    >
                      <Plus size={14} /> Agih Tugas Baharu
                    </button>
                  )}
                </div>

                {allocationViewMode === 'matrix' ? (
                  <TimetableSystem activeAcademicYear={selectedAcademicYear || '2027'} />
                ) : (
                  <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-md">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                      <div>
                        <h3 className="text-xl font-black italic uppercase tracking-tight text-slate-800">
                          Senarai Rekod Agihan Mengajar Subjek
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">
                          Rekod agihan guru kepada subjek dan kelas tertentu bagi Sesi Akademik {selectedAcademicYear}.
                        </p>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-slate-200">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-wider border-b border-slate-100">
                            <th className="px-6 py-4">Guru</th>
                            <th className="px-6 py-4">Kelas</th>
                            <th className="px-6 py-4">Subjek</th>
                            <th className="px-6 py-4">Kadar Masa (Siri Pertemuan)</th>
                            <th className="px-6 py-4">Peranan Pengajaran</th>
                            <th className="px-6 py-4 text-right">Tindakan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-700">
                          {allocations.map(a => (
                            <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4 text-slate-950 uppercase">{a.teacherName}</td>
                              <td className="px-6 py-4 uppercase text-slate-500">{a.className}</td>
                              <td className="px-6 py-4 text-blue-600 uppercase">{a.subjectName}</td>
                              <td className="px-6 py-4">{a.periodsPerWeek} Siri / Minggu</td>
                              <td className="px-6 py-4">
                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-lg ${a.role === 'MAIN' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                  {a.role}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <button
                                  onClick={() => deleteAllocation(a.id)}
                                  className="text-rose-500 hover:text-rose-700 cursor-pointer"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {allocations.length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-16 text-center text-slate-400 italic font-bold">
                                Tiada rekod agihan mengajar untuk sesi ini.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ======================================================== */}
            {/* SUB-TAB 6: STUDENT MASTER & PROMOTION */}
            {/* ======================================================== */}
            {activeSubTab === 'students' && (
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-md space-y-8">
                {/* 1. Student Directory */}
                <div>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-slate-100 pb-4">
                    <div>
                      <h3 className="text-xl font-black italic uppercase tracking-tight text-slate-800">
                        Direktori & Profil Murid Induk (Student Master)
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">
                        Profil statik biografi murid. Penempatan kelas dilakukan mengikut tahun sesi akademik di bahagian bawah.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          setActiveSubTab('import');
                          setImportMode('apdm_student');
                        }}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs uppercase px-4 py-2.5 rounded-xl shadow-md transition-all cursor-pointer"
                      >
                        <UploadCloud size={14} /> Import APDM (.xlsx)
                      </button>
                      <button
                        onClick={() => openStudentModal(null)}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs uppercase px-4 py-2.5 rounded-xl shadow-md transition-all"
                      >
                        <Plus size={14} /> Daftar Murid Baharu
                      </button>
                      <button
                        onClick={() => setShowEnrollmentModal(true)}
                        className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs uppercase px-4 py-2.5 rounded-xl shadow-md transition-all"
                      >
                        <Plus size={14} /> Hubungkan Kelas Murid
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-slate-200 max-h-96">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-wider border-b border-slate-100">
                          <th className="px-6 py-4">ID Murid</th>
                          <th className="px-6 py-4">Nama Murid</th>
                          <th className="px-6 py-4">Jantina</th>
                          <th className="px-6 py-4">Kaum</th>
                          <th className="px-6 py-4 text-right">Tindakan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-700">
                        {studentMasters.map(s => (
                          <tr key={s.student_id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4 font-mono text-slate-500">{s.student_id}</td>
                            <td className="px-6 py-4 text-slate-900 uppercase">
                              <button
                                type="button"
                                onClick={() => setActiveProfileStudentId(s.student_id)}
                                className="text-left font-bold text-slate-900 hover:text-blue-600 hover:underline uppercase transition-colors cursor-pointer flex items-center gap-1.5"
                                title="Klik untuk buka Profil Lengkap Murid & Maklumat Kecemasan"
                              >
                                <span>{s.name}</span>
                                <span className="text-[10px] text-blue-500 font-normal">📋</span>
                              </button>
                            </td>
                            <td className="px-6 py-4">{s.gender === 'P' ? 'Perempuan' : 'Lelaki'}</td>
                            <td className="px-6 py-4">{s.race}</td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => openStudentModal(s)}
                                className="text-blue-600 hover:text-blue-800 p-1"
                              >
                                <Edit3 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 2. Active Enrollments & Promotions */}
                <div className="border-t border-slate-200 pt-8">
                  <div className="mb-6">
                    <h3 className="text-lg font-black italic uppercase tracking-tight text-slate-800">
                      Penempatan & Kenaikan Kelas Sesi {selectedAcademicYear}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Pilih murid yang ingin dipromosikan (naik kelas) ke Sesi Akademik sasaran. Sejarah kelas lama akan terus dikekalkan.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Active Enrollment Table */}
                    <div className="lg:col-span-3 overflow-x-auto rounded-2xl border border-slate-200">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-wider border-b border-slate-100">
                            <th className="px-4 py-4 w-10">
                              <input
                                type="checkbox"
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedPromoStudents(activeEnrollments.map(ae => ae.student_id));
                                  else setSelectedPromoStudents([]);
                                }}
                                checked={selectedPromoStudents.length === activeEnrollments.length && activeEnrollments.length > 0}
                              />
                            </th>
                            <th className="px-6 py-4">ID Murid</th>
                            <th className="px-6 py-4">Nama</th>
                            <th className="px-6 py-4">Kelas Semasa</th>
                            <th className="px-6 py-4">Tahun / Aliran</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-700">
                          {activeEnrollments.map(ae => (
                            <tr key={ae.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-4">
                                <input
                                  type="checkbox"
                                  checked={selectedPromoStudents.includes(ae.student_id)}
                                  onChange={(e) => {
                                    if (e.target.checked) setSelectedPromoStudents([...selectedPromoStudents, ae.student_id]);
                                    else setSelectedPromoStudents(selectedPromoStudents.filter(id => id !== ae.student_id));
                                  }}
                                />
                              </td>
                              <td className="px-6 py-4 font-mono text-slate-500">{ae.student_id}</td>
                              <td className="px-6 py-4 text-slate-900 uppercase">
                                <button
                                  type="button"
                                  onClick={() => setActiveProfileStudentId(ae.student_id)}
                                  className="text-left font-bold text-slate-900 hover:text-blue-600 hover:underline uppercase transition-colors cursor-pointer flex items-center gap-1.5"
                                  title="Klik untuk buka Profil Lengkap Murid & Maklumat Kecemasan"
                                >
                                  <span>{ae.name}</span>
                                  <span className="text-[10px] text-blue-500 font-normal">📋</span>
                                </button>
                              </td>
                              <td className="px-6 py-4 uppercase text-blue-600">{ae.class}</td>
                              <td className="px-6 py-4">Tahun {ae.year}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Promotion Panel */}
                    <div className="bg-slate-900 text-white p-6 rounded-3xl flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-4 text-blue-400">
                          <Sparkles size={20} />
                          <h4 className="text-xs font-black uppercase tracking-wider">Kenaikan Kelas Pintar</h4>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed mb-6">
                          Sistem memelihara integritas data dengan mendaftarkan tahun persidangan baru tanpa melupuskan rekod terdahulu.
                        </p>

                        <div className="space-y-4">
                          <div>
                            <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Pilih Sesi Sasaran</label>
                            <select
                              value={promoTargetYear}
                              onChange={(e) => setPromoTargetYear(e.target.value)}
                              className="w-full bg-slate-800 text-white text-xs border border-slate-700 rounded-xl px-4 py-2.5 focus:outline-none"
                            >
                              <option value="">-- Pilih Sesi --</option>
                              {academicYears.map(ay => (
                                <option key={ay.year} value={ay.year}>{ay.year}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Pilih Kelas Sasaran</label>
                            <select
                              value={promoTargetClassId}
                              onChange={(e) => setPromoTargetClassId(e.target.value)}
                              className="w-full bg-slate-800 text-white text-xs border border-slate-700 rounded-xl px-4 py-2.5 focus:outline-none"
                            >
                              <option value="">-- Pilih Kelas --</option>
                              {promoClasses.map(c => (
                                <option key={c.id} value={c.id}>{c.name} (Tahun {c.yearGroup})</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="mt-8">
                        <div className="text-xs text-slate-400 mb-2">
                          Murid Terpilih: <strong className="text-white text-sm">{selectedPromoStudents.length}</strong>
                        </div>
                        <button
                          onClick={handlePromoteStudents}
                          disabled={selectedPromoStudents.length === 0}
                          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-800 disabled:text-slate-600 text-white font-extrabold text-xs uppercase py-3 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
                        >
                          Laksanakan Naik Kelas <ArrowRight size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* SUB-TAB 7: INCREMENTAL DATA STORE IMPORT */}
            {/* ======================================================== */}
            {/* ======================================================== */}
            {/* SUB-TAB 7: GURU GOOGLE SHEET IMPORT & IDS IMPORT */}
            {/* ======================================================== */}
            {activeSubTab === 'import' && (
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-md space-y-8">
                {/* Header & Sub-Mode Switcher */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
                  <div>
                    <h3 className="text-xl font-black italic uppercase tracking-tight text-slate-800 flex items-center gap-2">
                      <FileSpreadsheet className="text-emerald-600" size={24} />
                      Import Data Induk (SSOT)
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Penyelarasan automatik terus dari Google Sheet rasmi sekolah atau fail CSV/XLSX ke dalam SSOT.
                    </p>
                  </div>

                  <div className="flex flex-wrap bg-slate-100 p-1 rounded-2xl border border-slate-200 gap-1">
                    <button
                      type="button"
                      onClick={() => setImportMode('apdm_student')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${
                        importMode === 'apdm_student'
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <GraduationCap size={14} />
                      Import APDM Murid (.xlsx)
                      <span className="bg-indigo-500/30 text-[9px] px-1.5 py-0.5 rounded-full ml-1">SSOT</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportMode('google_sheet_guru')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${
                        importMode === 'google_sheet_guru'
                          ? 'bg-emerald-600 text-white shadow-md'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <FileSpreadsheet size={14} />
                      Import Guru Google Sheet
                      <span className="bg-emerald-500/30 text-[9px] px-1.5 py-0.5 rounded-full ml-1">SSOT</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportMode('ids_text')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${
                        importMode === 'ids_text'
                          ? 'bg-slate-900 text-white shadow-md'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Clipboard size={14} />
                      Import Teks / IDS Manual
                    </button>
                  </div>
                </div>

                {/* MODE 1: DIRECT GURU GOOGLE SHEET IMPORT */}
                {importMode === 'google_sheet_guru' && (
                  <div className="space-y-8">
                    {/* Input Controls Card */}
                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 space-y-6">
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-emerald-100 text-emerald-800 rounded-2xl">
                          <LinkIcon size={24} />
                        </div>
                        <div className="flex-1">
                          <h4 className="text-sm font-black uppercase text-slate-900 tracking-wide">
                            Pautan Google Sheets Rasmi Staf / Guru
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Sistem akan mengekstrak ID Spreadsheet dan memuat turun jadual secara selamat melalui protokol eksport Google.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-black uppercase text-slate-500 mb-2">
                            URL Google Sheets
                          </label>
                          <div className="flex gap-3">
                            <input
                              type="url"
                              value={guruSheetUrl}
                              onChange={(e) => setGuruSheetUrl(e.target.value)}
                              placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0"
                              className="flex-1 bg-white border border-slate-300 rounded-2xl px-4 py-3 text-xs font-mono text-slate-800 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                            />
                            <button
                              type="button"
                              onClick={handleGuruSheetFetch}
                              disabled={guruImportLoading || (!guruSheetUrl.trim() && !guruCsvData.trim())}
                              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-extrabold text-xs uppercase px-6 py-3 rounded-2xl transition-all shadow-md flex items-center gap-2 cursor-pointer"
                            >
                              {guruImportLoading ? (
                                <>
                                  <RefreshCw size={14} className="animate-spin" />
                                  Memproses...
                                </>
                              ) : (
                                <>
                                  <Sparkles size={14} />
                                  Muat Turun & Jana Pra-tonton
                                </>
                              )}
                            </button>
                          </div>
                          <span className="block text-[11px] text-slate-400 mt-1.5 italic">
                            * Nota: Pastikan tetapan perkongsian lembaran kerja Google Sheets adalah "Anyone with the link can view" (Sesiapa dengan pautan boleh lihat).
                          </span>
                        </div>

                        {/* File upload fallback */}
                        <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-black uppercase text-slate-400">Pilihan Gantian:</span>
                            <label className="flex items-center gap-2 bg-white hover:bg-slate-100 border border-slate-300 px-4 py-2 rounded-xl text-xs font-extrabold text-slate-700 cursor-pointer transition-colors shadow-sm">
                              <UploadCloud size={14} className="text-slate-500" />
                              {guruFileName ? `Fail: ${guruFileName}` : 'Muat Naik Fail CSV / XLSX'}
                              <input
                                type="file"
                                accept=".csv,.txt,.xlsx"
                                onChange={handleGuruFileUpload}
                                className="hidden"
                              />
                            </label>
                            {guruCsvData && (
                              <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                                <Check size={12} /> Data fail sedia ({guruCsvData.length} bait)
                              </span>
                            )}
                          </div>

                          {(guruSheetUrl || guruCsvData || guruPreviewResponse) && (
                            <button
                              type="button"
                              onClick={handleGuruReset}
                              className="text-xs font-bold text-slate-500 hover:text-slate-800 underline transition-colors"
                            >
                              Set Semula Input
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* In-View Guru Import / Fetch Error Banner */}
                    {guruImportError && (
                      <div className="p-5 bg-rose-50 border border-rose-200 rounded-3xl text-rose-800 text-xs flex items-start justify-between gap-3 shadow-sm">
                        <div className="flex items-start gap-3">
                          <AlertCircle size={20} className="text-rose-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-extrabold text-sm block">Ralat Capaian / Muat Naik:</span>
                            <p className="mt-1 leading-relaxed">{guruImportError}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setGuruImportError(null)}
                          className="text-rose-400 hover:text-rose-700 p-1"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}

                    {/* In-View Commit Error Banner */}
                    {guruCommitError && (
                      <div className="p-6 bg-rose-50 border-2 border-rose-300 rounded-3xl text-rose-900 shadow-md flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <AlertTriangle size={24} className="text-rose-600 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-black text-sm uppercase tracking-wide text-rose-950">
                                {guruCommitError.title}
                              </h4>
                              <span className="text-[9px] font-black uppercase bg-rose-200 text-rose-900 px-2 py-0.5 rounded-full">
                                Fail-Closed (Tiada Penulisan Data)
                              </span>
                            </div>
                            <p className="text-xs text-rose-800 leading-relaxed font-medium">
                              {guruCommitError.message}
                            </p>
                            {guruCommitError.details && (
                              <p className="text-[11px] font-mono text-rose-700 bg-rose-100 p-2 rounded-xl mt-1.5 border border-rose-200">
                                {guruCommitError.details}
                              </p>
                            )}
                            <p className="text-[11px] text-rose-600 italic mt-1">
                              * Pangkalan data Core dan Attendance kekal selamat tanpa sebarang data separa.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setGuruCommitError(null)}
                          className="text-rose-400 hover:text-rose-700 p-1"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    )}

                    {/* Persistent Commit Success Panel */}
                    {(guruCommitSuccess || guruCommitResult) && (
                      <div className="p-6 bg-emerald-50 border border-emerald-300 rounded-3xl text-emerald-950 flex flex-col md:flex-row items-center justify-between gap-4 shadow-md">
                        <div className="flex items-center gap-4">
                          <div className="p-2.5 bg-emerald-100 rounded-2xl text-emerald-700 shrink-0">
                            <CheckCircle2 size={32} />
                          </div>
                          <div>
                            <span className="font-black text-sm uppercase block text-emerald-950 tracking-wide">
                              Komit Guru SSOT Berjaya!
                            </span>
                            <span className="text-xs text-emerald-800 block mt-0.5">
                              Sebanyak <strong>{guruCommitSuccess?.committedCount || guruCommitResult?.committedCount}</strong> profil guru telah berjaya dikomit ke dalam pangkalan data SSOT <strong>iSEPADU Core</strong>.
                            </span>
                            <span className="text-[11px] text-emerald-700 block mt-1 font-mono">
                              Sasaran: {guruCommitSuccess?.target || 'gen-lang-client-0384285333/ai-studio-9da55e18-8b12-4090-9356-16a74f3c27e2'} | Sesi ID: {guruCommitSuccess?.sessionId || guruCommitResult?.sessionId}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setActiveSubTab('personnel')}
                            className="bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs uppercase px-4 py-2.5 rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                          >
                            <Users size={14} /> Lihat Profil Guru
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveSubTab('audit')}
                            className="bg-slate-900 hover:bg-slate-800 text-white font-black text-xs uppercase px-4 py-2.5 rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                          >
                            <History size={14} /> Lihat Sejarah Import
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Preview Dashboard */}
                    {guruPreviewResponse && (
                      <div className="space-y-6">
                        {/* Summary Counters */}
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-black uppercase text-slate-400 tracking-wider">
                              Keputusan Analisis Pra-tonton ({guruPreviewResponse.totalRows} Jumlah Baris)
                            </span>
                            <span className="text-xs font-mono text-slate-500">
                              Sesi Pra-tonton: {guruPreviewResponse.sessionId}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                            <div className="bg-emerald-50 text-emerald-900 p-4 rounded-2xl border border-emerald-200">
                              <span className="block text-[9px] font-black uppercase tracking-wider text-emerald-700">Baharu (NEW)</span>
                              <span className="text-2xl font-black">{guruPreviewResponse.summary?.new ?? 0}</span>
                              <span className="block text-[10px] text-emerald-600 mt-0.5">Akan ditambah ke SSOT</span>
                            </div>
                            <div className="bg-blue-50 text-blue-900 p-4 rounded-2xl border border-blue-200">
                              <span className="block text-[9px] font-black uppercase tracking-wider text-blue-700">Sepadan (MATCHED)</span>
                              <span className="text-2xl font-black">{guruPreviewResponse.summary?.matched ?? 0}</span>
                              <span className="block text-[10px] text-blue-600 mt-0.5">Data sudah lengkap</span>
                            </div>
                            <div className="bg-amber-50 text-amber-900 p-4 rounded-2xl border border-amber-200">
                              <span className="block text-[9px] font-black uppercase tracking-wider text-amber-700">Kemaskini (UPDATE)</span>
                              <span className="text-2xl font-black">{guruPreviewResponse.summary?.update ?? 0}</span>
                              <span className="block text-[10px] text-amber-600 mt-0.5">Nilai baharu dikesan</span>
                            </div>
                            <div className="bg-rose-50 text-rose-900 p-4 rounded-2xl border border-rose-200">
                              <span className="block text-[9px] font-black uppercase tracking-wider text-rose-700">Konflik (CONFLICT)</span>
                              <span className="text-2xl font-black text-rose-600">{guruPreviewResponse.summary?.conflict ?? 0}</span>
                              <span className="block text-[10px] text-rose-600 mt-0.5">Percanggahan identiti</span>
                            </div>
                            <div className="bg-purple-50 text-purple-900 p-4 rounded-2xl border border-purple-200">
                              <span className="block text-[9px] font-black uppercase tracking-wider text-purple-700">Pendua (DUPLICATE)</span>
                              <span className="text-2xl font-black">{guruPreviewResponse.summary?.duplicate ?? 0}</span>
                              <span className="block text-[10px] text-purple-600 mt-0.5">Berulang dalam lembaran</span>
                            </div>
                            <div className="bg-slate-100 text-slate-800 p-4 rounded-2xl border border-slate-200">
                              <span className="block text-[9px] font-black uppercase tracking-wider text-slate-500">Tidak Sah (INVALID)</span>
                              <span className="text-2xl font-black">{guruPreviewResponse.summary?.invalid ?? 0}</span>
                              <span className="block text-[10px] text-slate-500 mt-0.5">Tiada nama lengkap</span>
                            </div>
                          </div>
                        </div>

                        {/* Detected Columns Chip Bar */}
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                          <span className="block text-[10px] font-black uppercase text-slate-500 mb-2">
                            Lajur Lembaran Dikesan ({guruPreviewResponse.columnsDetected.length} Lajur):
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {guruPreviewResponse.columnsDetected.map((col, idx) => (
                              <span
                                key={idx}
                                className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-[10px] font-mono font-bold text-slate-700"
                              >
                                {col}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Data Rows Preview Table */}
                        <div className="border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                          <div className="max-h-96 overflow-y-auto">
                            <table className="w-full text-left border-collapse">
                              <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 z-10">
                                <tr className="text-slate-500 text-[10px] font-black uppercase tracking-wider">
                                  <th className="px-4 py-3">Bil</th>
                                  <th className="px-4 py-3">Nama Guru</th>
                                  <th className="px-4 py-3">No. Fail / KP</th>
                                  <th className="px-4 py-3">Jawatan / Gred</th>
                                  <th className="px-4 py-3">Opsyen Major / Minor</th>
                                  <th className="px-4 py-3">Emel / Telefon</th>
                                  <th className="px-4 py-3">Status Resolusi</th>
                                  <th className="px-4 py-3">Sebab & Perincian</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-xs">
                                {guruPreviewResponse.rows.map((row) => (
                                  <tr
                                    key={row.rowNumber}
                                    className={`hover:bg-slate-50/70 transition-colors ${
                                      row.status === 'CONFLICT'
                                        ? 'bg-rose-50/40'
                                        : row.status === 'NEW'
                                        ? 'bg-emerald-50/20'
                                        : row.status === 'UPDATE'
                                        ? 'bg-amber-50/20'
                                        : ''
                                    }`}
                                  >
                                    <td className="px-4 py-3 font-mono text-slate-400 text-[11px]">
                                      {row.rowNumber}
                                    </td>
                                    <td className="px-4 py-3 font-bold text-slate-900 uppercase">
                                      {row.normalized?.name || (row as any)?.name || '<Tiada Nama>'}
                                      <span className="block text-[10px] font-normal text-slate-400">
                                        Jantina: {row.normalized?.gender || (row as any)?.gender || '-'} | Taraf: {row.normalized?.employmentStatus || (row as any)?.employmentStatus || 'Tetap'}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 font-mono text-slate-600 text-[11px]">
                                      <div>{row.normalized?.staffFileNo || (row as any)?.staffFileNo || '-'}</div>
                                      <div className="text-slate-400 text-[10px]">
                                        {(row.normalized?.ic || (row as any)?.maskedIc || (row as any)?.ic) ? `••••${String(row.normalized?.ic || (row as any)?.maskedIc || (row as any)?.ic).slice(-4)}` : '-'}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-slate-700">
                                      <span className="font-bold">{row.normalized?.grade || (row as any)?.grade || '-'}</span>
                                      <span className="block text-[10px] text-slate-400">
                                        {row.normalized?.position || (row as any)?.position || '-'}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-700 text-[11px]">
                                      <div>Major: <span className="font-bold">{row.normalized?.majorOption || (row as any)?.majorOption || '-'}</span></div>
                                      <div className="text-slate-400 text-[10px]">Minor: {row.normalized?.minorOption || (row as any)?.minorOption || '-'}</div>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 text-[11px]">
                                      <div className="font-mono text-[10px] text-blue-700">{row.normalized?.email || (row as any)?.email || '-'}</div>
                                      <div className="text-slate-400 text-[10px]">{row.normalized?.phone || (row as any)?.phone || '-'}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                      <span
                                        className={`inline-block px-2.5 py-1 rounded-md text-[9px] font-black uppercase border ${
                                          row.status === 'NEW'
                                            ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                                            : row.status === 'MATCHED'
                                            ? 'bg-blue-100 border-blue-300 text-blue-800'
                                            : row.status === 'UPDATE'
                                            ? 'bg-amber-100 border-amber-300 text-amber-800'
                                            : row.status === 'CONFLICT'
                                            ? 'bg-rose-100 border-rose-300 text-rose-800'
                                            : row.status === 'DUPLICATE'
                                            ? 'bg-purple-100 border-purple-300 text-purple-800'
                                            : 'bg-slate-100 border-slate-300 text-slate-600'
                                        }`}
                                      >
                                        {row.status}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-[11px] text-slate-500 max-w-xs">
                                      <p className="leading-snug">{row.matchReason}</p>
                                      {row.diffs && row.diffs.length > 0 && (
                                        <div className="mt-1 text-[10px] text-amber-700 bg-amber-50 p-1.5 rounded border border-amber-200">
                                          <strong>Perubahan:</strong> {row.diffs.join('; ')}
                                        </div>
                                      )}
                                      {row.conflicts && row.conflicts.length > 0 && (
                                        <div className="mt-1 text-[10px] text-rose-700 bg-rose-50 p-1.5 rounded border border-rose-200">
                                          <strong>Konflik:</strong> {row.conflicts.join('; ')}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Pre-Commit Safety Bar & Actions */}
                        <div className="bg-slate-900 text-white p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
                          <div className="space-y-1">
                            <span className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                              <ShieldCheck size={16} />
                              Pintu Kawalan Kelulusan (Approval Gate Ready)
                            </span>
                            <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
                              Tiada sebarang data ditulis ke dalam pangkalan data SSOT semasa peringkat pra-tonton. Sila semak semua maklumat di atas sebelum membuka tetingkap pengesahan komit.
                            </p>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <button
                              type="button"
                              onClick={handleGuruReset}
                              disabled={isCommittingGuru}
                              className="px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-extrabold text-xs uppercase transition-all"
                            >
                              Batal
                            </button>
                            <button
                              type="button"
                              onClick={handleOpenGuruCommitModal}
                              disabled={guruImportLoading || isCommittingGuru}
                              className="px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-black text-xs uppercase tracking-wide transition-all shadow-lg flex items-center gap-2 cursor-pointer"
                            >
                              <CheckCircle2 size={16} />
                              Sahkan & Komit Data Guru ke SSOT
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* MODE 2: DIRECT APDM STUDENT EXCEL (.XLSX) IMPORT & 6YO GATE */}
                {importMode === 'apdm_student' && (
                  <div className="space-y-8">
                    {/* Input Controls Card */}
                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 space-y-6">
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-indigo-100 text-indigo-800 rounded-2xl">
                          <GraduationCap size={24} />
                        </div>
                        <div className="flex-1">
                          <h4 className="text-sm font-black uppercase text-slate-900 tracking-wide">
                            Import Data APDM Murid (Format Rasmi .xlsx)
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Penyelarasan automatik dari fail APDM KPM ("YCC3404 Keseluruhan Murid as of 2026-10-26.xlsx") ke dalam Pangkalan Data iSEPADU Core secara selamat tanpa menjejaskan data akademik sedia ada.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="p-6 bg-white border-2 border-dashed border-indigo-200 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shrink-0">
                              <UploadCloud size={24} />
                            </div>
                            <div>
                              <label className="text-xs font-black uppercase text-slate-800 cursor-pointer hover:text-indigo-600">
                                {apdmFileName ? `Fail Dipilih: ${apdmFileName}` : 'Klik untuk Pilih Fail APDM Excel (.xlsx / .xls)'}
                                <input
                                  type="file"
                                  accept=".xlsx,.xls"
                                  onChange={handleApdmFileUpload}
                                  className="hidden"
                                />
                              </label>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                Format disokong: Fail APDM Keseluruhan Murid rasmi KPM (61 lajur data biografi, kebajikan & penjaga).
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {apdmFileBase64 && (
                              <button
                                type="button"
                                onClick={handleApdmReset}
                                className="text-xs font-bold text-slate-500 hover:text-slate-800 underline transition-colors px-2 py-1"
                              >
                                Set Semula
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={handleApdmPreview}
                              disabled={apdmLoading || !apdmFileBase64}
                              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-extrabold text-xs uppercase px-6 py-3 rounded-2xl transition-all shadow-md flex items-center gap-2 cursor-pointer"
                            >
                              {apdmLoading ? (
                                <>
                                  <RefreshCw size={14} className="animate-spin" />
                                  Menganalisis APDM...
                                </>
                              ) : (
                                <>
                                  <Sparkles size={14} />
                                  Jana Pra-tonton APDM Murid
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* In-View APDM Error Banner */}
                    {apdmError && (
                      <div className="p-5 bg-rose-50 border border-rose-200 rounded-3xl text-rose-800 text-xs flex items-start justify-between gap-3 shadow-sm">
                        <div className="flex items-start gap-3">
                          <AlertCircle size={20} className="text-rose-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-extrabold text-sm block">Ralat Capaian / Muat Naik APDM:</span>
                            <p className="mt-1 leading-relaxed">{apdmError}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setApdmError(null)}
                          className="text-rose-400 hover:text-rose-700 p-1"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}

                    {/* In-View Commit Error Banner */}
                    {apdmCommitError && (
                      <div className="p-6 bg-rose-50 border-2 border-rose-300 rounded-3xl text-rose-900 shadow-md flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <AlertTriangle size={24} className="text-rose-600 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-black text-sm uppercase tracking-wide text-rose-950">
                                {apdmCommitError.title}
                              </h4>
                              <span className="text-[9px] font-black uppercase bg-rose-200 text-rose-900 px-2 py-0.5 rounded-full">
                                Fail-Closed (Tiada Penulisan Data)
                              </span>
                            </div>
                            <p className="text-xs text-rose-800 leading-relaxed font-medium">
                              {apdmCommitError.message}
                            </p>
                            {apdmCommitError.details && (
                              <p className="text-[11px] font-mono text-rose-700 bg-rose-100 p-2 rounded-xl mt-1.5 border border-rose-200">
                                {apdmCommitError.details}
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setApdmCommitError(null)}
                          className="text-rose-400 hover:text-rose-700 p-1"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    )}

                    {/* Persistent Commit Success Panel */}
                    {apdmCommitSuccess && (
                      <div className="p-6 bg-emerald-50 border border-emerald-300 rounded-3xl text-emerald-950 flex flex-col md:flex-row items-center justify-between gap-4 shadow-md">
                        <div className="flex items-center gap-4">
                          <div className="p-2.5 bg-emerald-100 rounded-2xl text-emerald-700 shrink-0">
                            <CheckCircle2 size={32} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-black text-base uppercase text-emerald-950">
                                Data Murid APDM Berjaya Dikomit ke SSOT!
                              </h4>
                              <span className="text-[10px] font-black uppercase bg-emerald-200 text-emerald-900 px-2.5 py-0.5 rounded-full">
                                Selesai
                              </span>
                            </div>
                            <p className="text-xs text-emerald-800 mt-1">
                              Sebanyak <strong>{apdmCommitSuccess.committedCount} rekod murid</strong> telah selamat diselaraskan ke dalam Pangkalan Data iSEPADU Core. Semua data penilaian akademik dan kokurikulum sedia ada kekal terpelihara tanpa sebarang kehilangan.
                            </p>
                            <span className="text-[10px] font-mono text-emerald-700 block mt-1">
                              ID Sesi: {apdmCommitSuccess.sessionId} • Sasaran: {apdmCommitSuccess.target}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setApdmCommitSuccess(null)}
                          className="px-4 py-2 bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-black uppercase rounded-xl transition-all shadow-sm"
                        >
                          Tutup
                        </button>
                      </div>
                    )}

                    {/* PREVIEW CONTENT */}
                    {apdmPreviewResponse && (
                      <div className="space-y-8">
                        {/* Summary Metrics */}
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                          <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-sm">
                            <span className="block text-[9px] font-black uppercase text-slate-400 tracking-wider">Jumlah Rekod</span>
                            <span className="text-2xl font-black mt-1 block font-mono">{apdmPreviewResponse.totalRows || apdmPreviewResponse.summary.totalSourceRows}</span>
                            <span className="text-[10px] text-slate-400">APDM Baris</span>
                          </div>

                          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-4 rounded-2xl shadow-sm">
                            <span className="block text-[9px] font-black uppercase text-emerald-600 tracking-wider">Murid Baharu</span>
                            <span className="text-2xl font-black mt-1 block font-mono text-emerald-700">{apdmPreviewResponse.summary.new}</span>
                            <span className="text-[10px] text-emerald-600">Daftar Pertama</span>
                          </div>

                          <div className="bg-blue-50 border border-blue-200 text-blue-900 p-4 rounded-2xl shadow-sm">
                            <span className="block text-[9px] font-black uppercase text-blue-600 tracking-wider">Padanan Penuh</span>
                            <span className="text-2xl font-black mt-1 block font-mono text-blue-700">{apdmPreviewResponse.summary.matched}</span>
                            <span className="text-[10px] text-blue-600">Sudah Wujud</span>
                          </div>

                          <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-2xl shadow-sm">
                            <span className="block text-[9px] font-black uppercase text-amber-600 tracking-wider">Kemas Kini</span>
                            <span className="text-2xl font-black mt-1 block font-mono text-amber-700">{apdmPreviewResponse.summary.update}</span>
                            <span className="text-[10px] text-amber-600">Gabung Medan</span>
                          </div>

                          <div className="bg-indigo-50 border border-indigo-200 text-indigo-900 p-4 rounded-2xl shadow-sm">
                            <span className="block text-[9px] font-black uppercase text-indigo-600 tracking-wider">Murid 6 Tahun</span>
                            <span className="text-2xl font-black mt-1 block font-mono text-indigo-700">{apdmPreviewResponse.summary.sixYearsOldCount}</span>
                            <span className="text-[10px] text-indigo-600">Lahir 2020 (Gate)</span>
                          </div>

                          <div className="bg-purple-50 border border-purple-200 text-purple-900 p-4 rounded-2xl shadow-sm">
                            <span className="block text-[9px] font-black uppercase text-purple-600 tracking-wider">Prasekolah</span>
                            <span className="text-2xl font-black mt-1 block font-mono text-purple-700">{apdmPreviewResponse.summary.preschoolCount}</span>
                            <span className="text-[10px] text-purple-600">Umur 4 - 6</span>
                          </div>

                          <div className="bg-teal-50 border border-teal-200 text-teal-900 p-4 rounded-2xl shadow-sm">
                            <span className="block text-[9px] font-black uppercase text-teal-600 tracking-wider">Tahun 1 - 6</span>
                            <span className="text-2xl font-black mt-1 block font-mono text-teal-700">{apdmPreviewResponse.summary.primaryCount}</span>
                            <span className="text-[10px] text-teal-600">Aliran Perdana</span>
                          </div>
                        </div>

                        {/* ======================================================== */}
                        {/* DEDICATED 6-YEAR-OLD CHECKBOX GATE (LAHIR 2020) */}
                        {/* ======================================================== */}
                        {apdmPreviewResponse.sixYearsOldStudents && apdmPreviewResponse.sixYearsOldStudents.length > 0 && (
                          <div className="p-6 bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-3xl space-y-4 shadow-sm">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-amber-200 pb-4">
                              <div className="flex items-start gap-3">
                                <div className="p-2.5 bg-amber-500 text-white rounded-2xl shadow-sm">
                                  <AlertCircle size={22} />
                                </div>
                                <div>
                                  <h4 className="text-sm font-black uppercase text-amber-950 tracking-wide flex items-center gap-2">
                                    Pintu Kawalan: Penempatan Murid Berumur 6 Tahun (Lahir 2020)
                                    <span className="bg-amber-200 text-amber-900 text-[10px] px-2 py-0.5 rounded-full font-black">
                                      {apdmPreviewResponse.sixYearsOldStudents.length} Murid
                                    </span>
                                  </h4>
                                  <p className="text-xs text-amber-800 mt-1 max-w-2xl leading-relaxed">
                                    Mengikut dasar KPM, murid lahir tahun 2020 (berumur 6 tahun pada sesi 2026) secara lalai ditempatkan di <strong>PRASEKOLAH</strong>. Tandakan kotak semak <strong>[✓] Naik ke Tahun 1</strong> sekiranya murid telah diluluskan untuk mendaftar terus ke Tahun Satu.
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleSelectAllSixYearOld(true)}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black uppercase rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                                >
                                  <CheckSquare size={13} />
                                  Pilih Semua Naik Tahun 1
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSelectAllSixYearOld(false)}
                                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white text-[11px] font-black uppercase rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                                >
                                  <Square size={13} />
                                  Nyahpilih Semua (Kekal Pra)
                                </button>
                              </div>
                            </div>

                            <div className="overflow-x-auto rounded-2xl border border-amber-200 bg-white shadow-sm">
                              <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                  <tr className="bg-amber-100/70 text-amber-900 text-[10px] font-black uppercase tracking-wider border-b border-amber-200">
                                    <th className="px-4 py-3 text-center w-28">Tindakan Kelulusan</th>
                                    <th className="px-4 py-3">Nama Murid (Klik untuk Profil)</th>
                                    <th className="px-4 py-3">No. Pengenalan (MyKid)</th>
                                    <th className="px-4 py-3">Jantina</th>
                                    <th className="px-4 py-3">Tarikh Lahir</th>
                                    <th className="px-4 py-3">Penempatan Semasa</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-amber-100 font-bold text-slate-800">
                                  {apdmPreviewResponse.sixYearsOldStudents.map((st) => {
                                    const isPromoted = !!sixYearOldPromotionMap[st.rowId];
                                    return (
                                      <tr key={st.rowId} className="hover:bg-amber-50/50 transition-colors">
                                        <td className="px-4 py-3 text-center">
                                          <label className="inline-flex items-center gap-1.5 cursor-pointer bg-slate-50 hover:bg-amber-100 px-2.5 py-1.5 rounded-xl border border-slate-200 transition-colors">
                                            <input
                                              type="checkbox"
                                              checked={isPromoted}
                                              onChange={() => handleToggleSixYearOld(st.rowId)}
                                              className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                                            />
                                            <span className={`text-[10px] font-black uppercase ${isPromoted ? 'text-emerald-700' : 'text-slate-600'}`}>
                                              {isPromoted ? 'Naik Thn 1' : 'Kekal Pra'}
                                            </span>
                                          </label>
                                        </td>
                                        <td className="px-4 py-3">
                                          <button
                                            type="button"
                                            onClick={() => setActiveProfileStudentId(st.proposedId || st.existingId || st.icNumber)}
                                            className="text-left font-extrabold text-slate-900 hover:text-indigo-600 hover:underline uppercase transition-colors cursor-pointer flex items-center gap-1.5"
                                          >
                                            <span>{st.name}</span>
                                            <span className="text-[10px] text-indigo-500 font-normal">📋</span>
                                          </button>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-slate-600">{st.maskedIc || st.icNumber}</td>
                                        <td className="px-4 py-3">{st.gender === 'P' ? 'Perempuan' : 'Lelaki'}</td>
                                        <td className="px-4 py-3 font-mono text-slate-600">{st.birthDate}</td>
                                        <td className="px-4 py-3">
                                          {isPromoted ? (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                                              <CheckCircle2 size={12} /> TAHUN 1 (Dinaikkan)
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-900 border border-amber-300">
                                              PRASEKOLAH (Laluan Biasa)
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

                        {/* Full Staged Rows Table */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                              Pratonton Keseluruhan Murid ({apdmPreviewResponse.rows.length} Rekod)
                            </h4>
                            <span className="text-[11px] text-slate-400 italic">
                              * Klik pada nama murid untuk memaparkan Kad Kecemasan dan Profil Lengkap.
                            </span>
                          </div>

                          <div className="overflow-x-auto rounded-2xl border border-slate-200 max-h-96 shadow-sm">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead className="sticky top-0 bg-slate-100 z-10">
                                <tr className="text-slate-500 text-[10px] font-black uppercase tracking-wider border-b border-slate-200">
                                  <th className="px-4 py-3 text-center w-12">Bil</th>
                                  <th className="px-4 py-3">Nama Murid</th>
                                  <th className="px-4 py-3">No. Pengenalan</th>
                                  <th className="px-4 py-3">Umur</th>
                                  <th className="px-4 py-3">Cadangan Kelas SSOT</th>
                                  <th className="px-4 py-3">Penjaga 1 & Telefon</th>
                                  <th className="px-4 py-3 text-right">Status Rekod</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 font-bold text-slate-800">
                                {apdmPreviewResponse.rows.map((r, idx) => {
                                  const isPromoted = r.isSixYearsOld && sixYearOldPromotionMap[r.rowId];
                                  const effectiveClass = r.isSixYearsOld ? (isPromoted ? 'TAHUN 1' : 'PRASEKOLAH') : r.suggestedClass;

                                  return (
                                    <tr key={r.rowId} className="hover:bg-slate-50/70 transition-colors">
                                      <td className="px-4 py-3 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                                      <td className="px-4 py-3">
                                        <button
                                          type="button"
                                          onClick={() => setActiveProfileStudentId(r.proposedId || r.existingId || r.icNumber)}
                                          className="text-left font-extrabold text-slate-900 hover:text-indigo-600 hover:underline uppercase transition-colors cursor-pointer flex items-center gap-1.5"
                                          title="Buka Kad Profil & Maklumat Kecemasan"
                                        >
                                          <span>{r.name}</span>
                                          <span className="text-[10px] text-indigo-500 font-normal">📋</span>
                                        </button>
                                      </td>
                                      <td className="px-4 py-3 font-mono text-slate-600">{r.maskedIc || r.icNumber}</td>
                                      <td className="px-4 py-3">
                                        <span className="font-mono">{r.age} thn</span>{' '}
                                        <span className="text-[10px] text-slate-400">({r.birthYear})</span>
                                      </td>
                                      <td className="px-4 py-3">
                                        <span className="font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                                          {effectiveClass}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3">
                                        <span className="block truncate max-w-xs">{r.guardian1?.name || '-'}</span>
                                        {r.guardian1?.mobilePhone && (
                                          <span className="text-[10px] font-mono text-slate-400 block">{r.guardian1.mobilePhone}</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-3 text-right">
                                        {r.status === 'NEW' && (
                                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-100 text-emerald-800">
                                            Baharu
                                          </span>
                                        )}
                                        {r.status === 'MATCHED' && (
                                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-blue-100 text-blue-800">
                                            Padanan
                                          </span>
                                        )}
                                        {r.status === 'UPDATE' && (
                                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-100 text-amber-800">
                                            Kemas Kini
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

                        {/* Approval Gate Commit Bar */}
                        <div className="p-6 bg-slate-900 rounded-3xl text-white flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
                          <div>
                            <span className="text-xs font-black uppercase tracking-wider text-emerald-400 block mb-1">
                              Pintu Kawalan Kelulusan Sedia (Approval Gate Ready)
                            </span>
                            <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
                              Tiada sebarang data ditulis ke dalam pangkalan data SSOT semasa peringkat pra-tonton. Sila sahkan pecahan murid sebelum memulakan komit rasmi.
                            </p>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <button
                              type="button"
                              onClick={handleApdmReset}
                              disabled={isCommittingApdm}
                              className="px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-extrabold text-xs uppercase transition-all"
                            >
                              Batal
                            </button>
                            <button
                              type="button"
                              onClick={handleOpenApdmCommitModal}
                              disabled={apdmLoading || isCommittingApdm}
                              className="px-6 py-3 rounded-2xl bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-black text-xs uppercase tracking-wide transition-all shadow-lg flex items-center gap-2 cursor-pointer"
                            >
                              <CheckCircle2 size={16} />
                              Sahkan & Komit Data Murid ke SSOT
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* MODE 2: INCREMENTAL DATA STORE (IDS) MANUAL / STUDENT TEXT */}
                {importMode === 'ids_text' && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Pasting area */}
                    <div className="lg:col-span-1 space-y-6">
                      <div>
                        <label className="block text-xs font-black uppercase text-slate-400 mb-2">Jenis Entiti Import</label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => { setImportType('student'); setIdsPreview([]); }}
                            className={`flex-1 py-2 rounded-xl text-xs font-black uppercase transition-all border ${importType === 'student' ? 'bg-slate-900 border-slate-900 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                          >
                            Profil Murid Master
                          </button>
                          <button
                            type="button"
                            onClick={() => { setImportType('personnel'); setIdsPreview([]); }}
                            className={`flex-1 py-2 rounded-xl text-xs font-black uppercase transition-all border ${importType === 'personnel' ? 'bg-slate-900 border-slate-900 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                          >
                            Direktori Guru
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-black uppercase text-slate-400 mb-2">
                          Format Medan Berasingan Koma (CSV) / Tab
                        </label>
                        <span className="block text-[10px] text-slate-400 italic mb-2 leading-relaxed">
                          {importType === 'student' 
                            ? 'Sila susun: IDMurid, Nama Murid, Jantina(L/P), Kaum' 
                            : 'Sila susun: Nama Guru, No_KP, Jantina(L/P), Emel_DELIMa, Telefon, Status_Kerja, Status_Mengajar'}
                        </span>
                        <textarea
                          rows={10}
                          value={pasteData}
                          onChange={(e) => setPasteData(e.target.value)}
                          placeholder={importType === 'student' 
                            ? 'S001, MUHAMMAD AMIR, L, Melayu\nS002, SITI SARAH, P, Melayu' 
                            : 'HALIM BIN MAT, 850101035543, L, halim@moe.edu.my, 0123456789, Tetap, Aktif'}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 font-mono text-xs focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <button
                        onClick={handleIdsPreview}
                        className="w-full bg-slate-950 hover:bg-slate-900 text-white font-extrabold text-xs uppercase py-3 rounded-xl transition-all"
                      >
                        Jana Pratonton Konflik & IDS
                      </button>
                    </div>

                    {/* IDS Summary & Interactive Preview Grid */}
                    <div className="lg:col-span-2 space-y-6">
                      {idsPreview.length > 0 && (
                        <>
                          {/* IDS Dashboard Stats */}
                          <div className="grid grid-cols-4 gap-4">
                            <div className="bg-emerald-50 text-emerald-800 p-4 rounded-2xl border border-emerald-100">
                              <span className="block text-[9px] font-black uppercase tracking-wider">Baharu (Insert)</span>
                              <span className="text-2xl font-black">{idsSummary.insert}</span>
                            </div>
                            <div className="bg-blue-50 text-blue-800 p-4 rounded-2xl border border-blue-100">
                              <span className="block text-[9px] font-black uppercase tracking-wider">Isi Medan Kosong</span>
                              <span className="text-2xl font-black">{idsSummary.fill}</span>
                            </div>
                            <div className="bg-rose-50 text-rose-800 p-4 rounded-2xl border border-rose-100 animate-pulse">
                              <span className="block text-[9px] font-black uppercase tracking-wider">Konflik Nilai</span>
                              <span className="text-2xl font-black text-rose-600">{idsSummary.conflict}</span>
                            </div>
                            <div className="bg-slate-100 text-slate-800 p-4 rounded-2xl border border-slate-200">
                              <span className="block text-[9px] font-black uppercase tracking-wider">Langkau (Skip)</span>
                              <span className="text-2xl font-black">{idsSummary.skip}</span>
                            </div>
                          </div>

                          {/* Interactive Preview List */}
                          <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-80 overflow-y-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-wider border-b border-slate-100">
                                  <th className="px-6 py-3">ID / IC</th>
                                  <th className="px-6 py-3">Nama Maklumat</th>
                                  <th className="px-6 py-3">Resolusi IDS</th>
                                  <th className="px-6 py-3">Keterangan Konflik</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-700">
                                {idsPreview.map((row, i) => (
                                  <tr key={i} className={`hover:bg-slate-50/50 transition-colors ${row.status === 'CONFLICT' ? 'bg-rose-50/30' : ''}`}>
                                    <td className="px-6 py-3 font-mono text-slate-500 text-[11px]">{row.key}</td>
                                    <td className="px-6 py-3 text-slate-900 uppercase">{row.data?.name || '-'}</td>
                                    <td className="px-6 py-3">
                                      <span className={`text-[8.5px] font-black uppercase px-2 py-0.5 rounded-md border ${
                                        row.status === 'INSERT' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                                        row.status === 'FILL_EMPTY' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                                        row.status === 'CONFLICT' ? 'bg-rose-100 border-rose-300 text-rose-700 font-extrabold' :
                                        'bg-slate-100 border-slate-200 text-slate-500'
                                      }`}>
                                        {row.action}
                                      </span>
                                    </td>
                                    <td className="px-6 py-3 text-[11px] font-medium text-slate-500">{row.details}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          <div className="flex justify-end gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            <p className="text-[11px] font-medium text-slate-500 self-center max-w-sm mr-auto italic">
                              * Hanya rekod 'Kemasukan Baharu' dan 'Isi Medan Kosong' sahaja yang akan digabungkan ke dalam pangkalan data.
                            </p>
                            <button
                              onClick={commitIdsImport}
                              className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs uppercase px-6 py-3 rounded-xl transition-all shadow-md cursor-pointer"
                            >
                              Laksanakan Import IDS
                            </button>
                          </div>
                        </>
                      )}

                      {idsPreview.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400 border border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
                          <Clipboard size={44} className="mb-4 opacity-20" />
                          <p className="font-bold text-sm italic">Jana pratonton untuk melihat visualisasi perbandingan data SSOT.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ======================================================== */}
            {/* SUB-TAB 8: IMPORT HISTORY & ROLLBACK */}
            {/* ======================================================== */}
            {activeSubTab === 'history' && (
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-md space-y-8">
                <div>
                  <h3 className="text-xl font-black italic uppercase tracking-tight text-slate-800">
                    Sejarah Sesi Import & Reversibiliti (IDS Rollback)
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Semua sesi import pintar disimpan secara transactional. Anda boleh memulihkan (rollback) mana-mana sesi import aktif untuk membalikkan keadaan pangkalan data tanpa kehilangan data sessional lain.
                  </p>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-wider border-b border-slate-100">
                        <th className="px-6 py-4">ID Sesi</th>
                        <th className="px-6 py-4">Waktu Import</th>
                        <th className="px-6 py-4">Jenis Entiti</th>
                        <th className="px-6 py-4">Ringkasan IDS</th>
                        <th className="px-6 py-4">Pengendali</th>
                        <th className="px-6 py-4">Status Sesi</th>
                        <th className="px-6 py-4 text-right">Tindakan Pengunduran</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-700">
                      {importSessions.map(sess => (
                        <tr key={sess.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 font-mono text-slate-600">{sess.id}</td>
                          <td className="px-6 py-4 font-mono text-slate-500 font-normal">
                            {new Date(sess.timestamp).toLocaleString('ms-MY')}
                          </td>
                          <td className="px-6 py-4">
                            <span className="uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 text-[10px] font-black">
                              {sess.importType === 'personnel' ? 'Direktori Guru' : 'Profil Murid Master'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1 text-[10px]">
                              {sess.summary?.insert !== undefined && (
                                <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">+{sess.summary.insert} Kemasukan</span>
                              )}
                              {sess.summary?.fill !== undefined && (
                                <span className="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">~{sess.summary.fill} Pengisian</span>
                              )}
                              {(sess.summary as any)?.new !== undefined && (
                                <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">+{(sess.summary as any).new} Baharu</span>
                              )}
                              {(sess.summary as any)?.update !== undefined && (sess.summary as any).update > 0 && (
                                <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">~{(sess.summary as any).update} Kemaskini</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-slate-800">{sess.actorName}</td>
                          <td className="px-6 py-4">
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-lg ${
                              sess.status === 'active' 
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                                : 'bg-slate-100 text-slate-400 border border-slate-200 line-through'
                            }`}>
                              {sess.status === 'active' ? 'AKTIF (REVERSIBLE)' : 'Telah Di-Rollback'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {sess.status === 'active' ? (
                              <button
                                onClick={() => rollbackImportSession(sess.id)}
                                className="bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[10px] uppercase px-3 py-1.5 rounded-lg transition-all shadow-sm"
                              >
                                Lakukan Rollback
                              </button>
                            ) : (
                              <span className="text-slate-400 italic font-medium">Batal Kekal</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {importSessions.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-16 text-center text-slate-400 italic font-semibold">
                            Tiada sejarah import ditemui dalam log sesi.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* SUB-TAB 9: AUDIT TRAIL LOGS */}
            {/* ======================================================== */}
            {activeSubTab === 'audit' && (
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-md space-y-8">
                <div>
                  <h3 className="text-xl font-black italic uppercase tracking-tight text-slate-800">
                    Log Audit Pangkalan Data & Pematuhan Urus Tadbir
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Log terperinci yang mencatatkan segala operasi pendaftaran, pengubahsuaian, pelepasan override, pemadam, dan rollback data induk bagi iSEPADU AI.
                  </p>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-wider border-b border-slate-100">
                        <th className="px-6 py-4">Waktu</th>
                        <th className="px-6 py-4">Pengendali</th>
                        <th className="px-6 py-4">Kategori Modul</th>
                        <th className="px-6 py-4">Operasi</th>
                        <th className="px-6 py-4">Deskripsi Aktiviti</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-700">
                      {auditTrail.map(log => {
                        const moduleLabel = 
                          log.layer === 1 ? 'Direktori Guru' :
                          log.layer === 2 ? 'Tadbir Urus' :
                          log.layer === 3 ? 'Pengurusan Kelas' :
                          log.layer === 4 ? 'Tugas Mengajar' :
                          log.layer === 5 ? 'Data Murid' : 'Sesi Import / Rollback';

                        const moduleColor = 
                          log.layer === 1 ? 'bg-cyan-50 text-cyan-700 border-cyan-100' :
                          log.layer === 2 ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                          log.layer === 3 ? 'bg-amber-50 text-amber-700 border-amber-100' :
                          log.layer === 4 ? 'bg-purple-50 text-purple-700 border-purple-100' :
                          log.layer === 5 ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                          'bg-rose-50 text-rose-700 border-rose-100';

                        const actionColor = 
                          log.action_type === 'CREATE' ? 'text-emerald-600 bg-emerald-50/50' :
                          log.action_type === 'UPDATE' ? 'text-blue-600 bg-blue-50/50' :
                          log.action_type === 'DELETE' ? 'text-rose-600 bg-rose-50/50' :
                          log.action_type === 'AUTHORIZE' ? 'text-amber-600 bg-amber-50/50 font-extrabold' :
                          'text-slate-600 bg-slate-100';

                        return (
                          <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4 font-mono text-slate-500 font-normal">
                              {new Date(log.timestamp).toLocaleString('ms-MY')}
                            </td>
                            <td className="px-6 py-4 text-slate-800">{log.actor_name}</td>
                            <td className="px-6 py-4">
                              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md border ${moduleColor}`}>
                                {moduleLabel}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`text-[8.5px] font-black uppercase px-2 py-0.5 rounded-md border ${actionColor}`}>
                                {log.action_type}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-slate-900 leading-relaxed max-w-md font-medium text-[11px]">
                              {typeof log.details === 'object' && log.details !== null
                                ? JSON.stringify(log.details)
                                : String(log.details || '')}
                            </td>
                          </tr>
                        );
                      })}
                      {auditTrail.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-16 text-center text-slate-400 italic font-semibold">
                            Tiada rekod log audit ditemui dalam pangkalan data.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* DIALOG MODALS */}
      {/* ======================================================== */}

      {/* MODAL 0: APPLICATION-NATIVE GURU COMMIT CONFIRMATION MODAL */}
      {showGuruCommitModal && guruPreviewResponse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-xl w-full max-h-[92vh] overflow-y-auto shadow-2xl p-6 sm:p-8 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 inline-block">
                  Pintu Kawalan Kelulusan Rasmi (Approval Gate)
                </span>
                <h3 className="text-lg font-black uppercase text-slate-900 tracking-tight">
                  Pengesahan Komit Guru ke iSEPADU Core
                </h3>
              </div>
              <button
                type="button"
                disabled={isCommittingGuru}
                onClick={() => setShowGuruCommitModal(false)}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-40 p-1 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            {/* School & Target Database SSOT Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase block">Institusi Pendidikan</span>
                  <span className="text-xs font-black text-slate-900">SJK(C) CHUNG HUA BALINGIAN</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black text-slate-400 uppercase block">Kod & Sesi</span>
                  <span className="text-xs font-mono font-bold text-slate-700">YCC3404 (Sesi 2026)</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  Sasaran Pangkalan Data SSOT:
                </span>
                <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs font-mono space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-sans font-bold">Sasaran:</span>
                    <span className="font-black text-emerald-700">iSEPADU CORE (Unified SSOT)</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400 font-sans">GCP Project:</span>
                    <span className="text-slate-800">gen-lang-client-0384285333</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400 font-sans">Database ID:</span>
                    <span className="text-slate-800">ai-studio-9da55e18-8b12-4090-9356-16a74f3c27e2</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400 font-sans">Koleksi:</span>
                    <span className="text-slate-800">personnel (SSOT) & teachers (Mirror)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Breakdown Table */}
            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                Ringkasan Rekod Yang Bakal Ditulis
              </span>
              <div className="border border-slate-200 rounded-2xl overflow-hidden text-xs">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-100 text-[10px] font-black uppercase text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5">Kategori Status</th>
                      <th className="px-4 py-2.5 text-right">Bilangan</th>
                      <th className="px-4 py-2.5 text-right">Tindakan SSOT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-bold">
                    <tr className="bg-emerald-50/70 text-emerald-950 font-black">
                      <td className="px-4 py-2.5">SIAP UNTUK KOMIT (NEW + MATCHED + UPDATE)</td>
                      <td className="px-4 py-2.5 text-right font-black text-sm">
                        {((guruPreviewResponse?.summary?.new || 0) + (guruPreviewResponse?.summary?.matched || 0) + (guruPreviewResponse?.summary?.update || 0))}
                      </td>
                      <td className="px-4 py-2.5 text-right text-emerald-700 uppercase text-[10px]">Akan Ditulis</td>
                    </tr>
                    <tr className="text-slate-700">
                      <td className="px-4 py-2 pl-6 text-[11px]">↳ Rekod Baharu (NEW)</td>
                      <td className="px-4 py-2 text-right font-mono">{guruPreviewResponse?.summary?.new || 0}</td>
                      <td className="px-4 py-2 text-right text-emerald-600 font-normal text-[10px]">Cipta Profil</td>
                    </tr>
                    <tr className="text-slate-700">
                      <td className="px-4 py-2 pl-6 text-[11px]">↳ Padanan Lengkap (MATCHED)</td>
                      <td className="px-4 py-2 text-right font-mono">{guruPreviewResponse?.summary?.matched || 0}</td>
                      <td className="px-4 py-2 text-right text-blue-600 font-normal text-[10px]">Padan Terus</td>
                    </tr>
                    <tr className="text-slate-700">
                      <td className="px-4 py-2 pl-6 text-[11px]">↳ Kemas Kini Medan (UPDATE)</td>
                      <td className="px-4 py-2 text-right font-mono">{guruPreviewResponse?.summary?.update || 0}</td>
                      <td className="px-4 py-2 text-right text-amber-600 font-normal text-[10px]">Kemas Kini</td>
                    </tr>
                    <tr className="bg-slate-50/60 text-slate-500 text-[11px]">
                      <td className="px-4 py-2">Konflik Nilai (CONFLICT)</td>
                      <td className="px-4 py-2 text-right font-mono text-rose-600">{guruPreviewResponse?.summary?.conflict || 0}</td>
                      <td className="px-4 py-2 text-right text-slate-400 font-normal text-[10px]">Dikecualikan</td>
                    </tr>
                    <tr className="bg-slate-50/60 text-slate-500 text-[11px]">
                      <td className="px-4 py-2">Pendua Lembaran (DUPLICATE)</td>
                      <td className="px-4 py-2 text-right font-mono text-purple-600">{guruPreviewResponse?.summary?.duplicate || 0}</td>
                      <td className="px-4 py-2 text-right text-slate-400 font-normal text-[10px]">Dilangkau</td>
                    </tr>
                    <tr className="bg-slate-50/60 text-slate-500 text-[11px]">
                      <td className="px-4 py-2">Format Tidak Sah (INVALID)</td>
                      <td className="px-4 py-2 text-right font-mono text-slate-500">{guruPreviewResponse?.summary?.invalid || 0}</td>
                      <td className="px-4 py-2 text-right text-slate-400 font-normal text-[10px]">Diabaikan</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Reversibility Notice */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3.5 flex items-start gap-3 text-xs text-blue-900">
              <ShieldCheck size={20} className="text-blue-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-extrabold block text-blue-950">Jaminan Keselamatan & Kebolehbalikan (100% Reversible):</span>
                Snapshot sandaran bagi setiap rekod akan disimpan dalam <code className="font-mono text-[10px] bg-white px-1 py-0.5 rounded">rollback_records</code> sebelum penulisan dilakukan. Anda boleh mengundur balik sesi ini pada bila-bila masa melalui menu Sejarah Import.
              </div>
            </div>

            {/* Error inside modal if commit failed */}
            {guruCommitError && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 text-xs flex items-start gap-3">
                <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-black block">{guruCommitError.title}</span>
                  <p className="mt-0.5 leading-relaxed">{guruCommitError.message}</p>
                </div>
              </div>
            )}

            {/* Deliberate Confirmation Checkbox */}
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  disabled={isCommittingGuru}
                  checked={guruCommitConfirmedCheckbox}
                  onChange={(e) => setGuruCommitConfirmedCheckbox(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-amber-400 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs font-black text-amber-950 leading-relaxed">
                  Saya telah menyemak data dan mengesahkan import ke iSEPADU Core.
                </span>
              </label>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isCommittingGuru}
                onClick={() => setShowGuruCommitModal(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-extrabold text-xs uppercase transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!guruCommitConfirmedCheckbox || isCommittingGuru}
                onClick={handleExecuteGuruCommit}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-wide transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                {isCommittingGuru ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Mengkomit Data Guru ke SSOT...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    Sahkan Komit ke SSOT
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 0B: APPLICATION-NATIVE APDM STUDENT COMMIT CONFIRMATION MODAL */}
      {showApdmCommitModal && apdmPreviewResponse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-xl w-full max-h-[92vh] overflow-y-auto shadow-2xl p-6 sm:p-8 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 inline-block">
                  Pintu Kawalan Kelulusan Rasmi (APDM Approval Gate)
                </span>
                <h3 className="text-lg font-black uppercase text-slate-900 tracking-tight">
                  Pengesahan Komit Data Murid APDM ke iSEPADU Core
                </h3>
              </div>
              <button
                type="button"
                disabled={isCommittingApdm}
                onClick={() => setShowApdmCommitModal(false)}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-40 p-1 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            {/* School & Target Database SSOT Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase block">Institusi Pendidikan</span>
                  <span className="text-xs font-black text-slate-900">SJK(C) CHUNG HUA BALINGIAN</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black text-slate-400 uppercase block">Kod & Sesi</span>
                  <span className="text-xs font-mono font-bold text-slate-700">YCC3404 (Sesi {selectedAcademicYear || '2026'})</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  Sasaran Pangkalan Data SSOT:
                </span>
                <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs font-mono space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-sans font-bold">Sasaran:</span>
                    <span className="font-black text-indigo-700">iSEPADU CORE (Unified SSOT)</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400 font-sans">GCP Project:</span>
                    <span className="text-slate-800">gen-lang-client-0384285333</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400 font-sans">Database ID:</span>
                    <span className="text-slate-800">ai-studio-9da55e18-8b12-4090-9356-16a74f3c27e2</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400 font-sans">Koleksi Terlibat:</span>
                    <span className="text-slate-800">student_master (Induk) & students (Sesi {selectedAcademicYear || '2026'})</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Commit Breakdown Table */}
            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                Ringkasan Tindakan Penulisan:
              </span>
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 font-bold text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2">Kategori Tindakan</th>
                      <th className="px-4 py-2 text-right">Bilangan</th>
                      <th className="px-4 py-2 text-right">Kesan Operasi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                    <tr>
                      <td className="px-4 py-2 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        Murid Baharu (NEW)
                      </td>
                      <td className="px-4 py-2 text-right font-mono font-bold text-emerald-700">{apdmPreviewResponse.summary.new}</td>
                      <td className="px-4 py-2 text-right text-emerald-700 font-bold text-[11px]">Daftar Profil Induk & Kelas</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        Padanan Penuh (MATCHED)
                      </td>
                      <td className="px-4 py-2 text-right font-mono font-bold text-blue-700">{apdmPreviewResponse.summary.matched}</td>
                      <td className="px-4 py-2 text-right text-blue-700 font-bold text-[11px]">Sahkan Penempatan Kelas</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                        Kemas Kini Profil (UPDATE)
                      </td>
                      <td className="px-4 py-2 text-right font-mono font-bold text-amber-700">{apdmPreviewResponse.summary.update}</td>
                      <td className="px-4 py-2 text-right text-amber-700 font-bold text-[11px]">Gabung Medan Baharu (Merge)</td>
                    </tr>
                    <tr className="bg-amber-50/70 font-bold">
                      <td className="px-4 py-2 text-amber-900">
                        Murid 6 Tahun Dinaikkan ke Tahun 1
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-emerald-700">
                        {Object.values(sixYearOldPromotionMap).filter(Boolean).length}
                      </td>
                      <td className="px-4 py-2 text-right text-emerald-800 text-[11px]">Didaftarkan ke Tahun 1</td>
                    </tr>
                    <tr className="bg-amber-50/30 font-bold">
                      <td className="px-4 py-2 text-amber-900">
                        Murid 6 Tahun Kekal Prasekolah
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-amber-700">
                        {(apdmPreviewResponse.summary.sixYearsOldCount || 0) - Object.values(sixYearOldPromotionMap).filter(Boolean).length}
                      </td>
                      <td className="px-4 py-2 text-right text-amber-800 text-[11px]">Dikekalkan di Prasekolah</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Non-destructive guarantee notice */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 flex items-start gap-3 text-xs text-emerald-900">
              <ShieldCheck size={20} className="text-emerald-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-extrabold block text-emerald-950">Jaminan Non-Destructive Upsert (100% Selamat):</span>
                Penulisan menggunakan mod <code className="font-mono text-[10px] bg-white px-1 py-0.5 rounded">merge: true</code> mengekalkan kunci dokumen sedia ada. Semua markah PBD, keputusan UASA, rekod keahlian Kokurikulum, dan data kebajikan sedia ada kekal terpelihara tanpa sebarang pemadaman.
              </div>
            </div>

            {/* Error inside modal if commit failed */}
            {apdmCommitError && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 text-xs flex items-start gap-3">
                <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-black block">{apdmCommitError.title}</span>
                  <p className="mt-0.5 leading-relaxed">{apdmCommitError.message}</p>
                </div>
              </div>
            )}

            {/* Deliberate Confirmation Checkbox */}
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  disabled={isCommittingApdm}
                  checked={apdmCommitConfirmedCheckbox}
                  onChange={(e) => setApdmCommitConfirmedCheckbox(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-amber-400 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs font-black text-amber-950 leading-relaxed">
                  Saya telah menyemak data APDM murid dan penempatan 6 tahun. Sahkan komit ke iSEPADU Core.
                </span>
              </label>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isCommittingApdm}
                onClick={() => setShowApdmCommitModal(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-extrabold text-xs uppercase transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!apdmCommitConfirmedCheckbox || isCommittingApdm}
                onClick={handleExecuteApdmCommit}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-wide transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                {isCommittingApdm ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Mengkomit Data Murid ke SSOT...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    Sahkan Komit Murid ke SSOT
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: TEACHER PROFILE FORM */}
      {showTeacherModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl p-8">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <h4 className="text-lg font-black uppercase text-slate-800">{editingTeacher ? 'Kemas Kini Profil Guru' : 'Daftar Profil Guru Baru'}</h4>
              <button onClick={() => setShowTeacherModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Nama Guru</label>
                  <input
                    type="text"
                    value={teacherForm.name || ''}
                    onChange={(e) => setTeacherForm({ ...teacherForm, name: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">No. KP / IC</label>
                  <input
                    type="text"
                    disabled={!!editingTeacher}
                    value={teacherForm.ic || ''}
                    onChange={(e) => setTeacherForm({ ...teacherForm, ic: e.target.value })}
                    className="w-full bg-slate-50 disabled:opacity-60 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Jantina</label>
                  <select
                    value={teacherForm.gender || 'L'}
                    onChange={(e) => setTeacherForm({ ...teacherForm, gender: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                  >
                    <option value="L">Lelaki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">E-mel DELIMa</label>
                  <input
                    type="email"
                    value={teacherForm.email || ''}
                    onChange={(e) => setTeacherForm({ ...teacherForm, email: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Telefon</label>
                  <input
                    type="text"
                    value={teacherForm.phone || ''}
                    onChange={(e) => setTeacherForm({ ...teacherForm, phone: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Status Lantikan</label>
                  <select
                    value={teacherForm.employmentStatus || 'Tetap'}
                    onChange={(e) => setTeacherForm({ ...teacherForm, employmentStatus: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                  >
                    <option value="Tetap">Tetap</option>
                    <option value="Kontrak">Kontrak</option>
                    <option value="Sambilan">Sambilan</option>
                  </select>
                </div>
              </div>

              {/* Tagging / Responsibilities */}
              <div className="space-y-4 border-t border-slate-100 pt-4">
                <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Tadbir Urus & Tanggungjawab (Metadata)</span>
                
                {/* Portfolios */}
                <div>
                  <label className="block text-[9px] font-black text-slate-500 uppercase mb-1">Portofolio iSEF</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {teacherForm.portfolios?.map(p => (
                      <span key={p} className="flex items-center gap-1 text-[9px] font-black bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md border border-blue-200">
                        {p} <X size={10} className="cursor-pointer" onClick={() => setTeacherForm({ ...teacherForm, portfolios: teacherForm.portfolios?.filter(x => x !== p) })} />
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Contoh: Kurikulum, Hal Ehwal Murid"
                      value={portfolioInput}
                      onChange={(e) => setPortfolioInput(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!portfolioInput.trim()) return;
                        setTeacherForm({ ...teacherForm, portfolios: [...(teacherForm.portfolios || []), portfolioInput.trim()] });
                        setPortfolioInput('');
                      }}
                      className="bg-slate-900 text-white font-extrabold text-[10px] px-3.5 py-1.5 rounded-xl uppercase"
                    >
                      Tambah
                    </button>
                  </div>
                </div>

                {/* Committees */}
                <div>
                  <label className="block text-[9px] font-black text-slate-500 uppercase mb-1">Panitia / Jawatankuasa</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {teacherForm.committees?.map(p => (
                      <span key={p} className="flex items-center gap-1 text-[9px] font-black bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md border border-amber-200">
                        {p} <X size={10} className="cursor-pointer" onClick={() => setTeacherForm({ ...teacherForm, committees: teacherForm.committees?.filter(x => x !== p) })} />
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Contoh: Panitia BM, JK Pentaksiran"
                      value={committeeInput}
                      onChange={(e) => setCommitteeInput(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!committeeInput.trim()) return;
                        setTeacherForm({ ...teacherForm, committees: [...(teacherForm.committees || []), committeeInput.trim()] });
                        setCommitteeInput('');
                      }}
                      className="bg-slate-900 text-white font-extrabold text-[10px] px-3.5 py-1.5 rounded-xl uppercase"
                    >
                      Tambah
                    </button>
                  </div>
                </div>
              </div>

              <button
                onClick={saveTeacher}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs uppercase py-3 rounded-xl transition-all shadow-md"
              >
                Simpan Profil Guru
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CLASS CONFIG FORM */}
      {showClassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-sm w-full shadow-2xl p-8">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <h4 className="text-sm font-black uppercase text-slate-800">Daftar Kelas Baharu</h4>
              <button onClick={() => setShowClassModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Nama Kelas</label>
                <input
                  type="text"
                  placeholder="Contoh: UTAMA, BESTARI"
                  value={classForm.name || ''}
                  onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Tahun Aliran</label>
                <select
                  value={classForm.yearGroup || 4}
                  onChange={(e) => setClassForm({ ...classForm, yearGroup: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                >
                  {[1, 2, 3, 4, 5, 6].map(v => (
                    <option key={v} value={v}>Tahun {v}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Pilih Guru Kelas</label>
                <select
                  value={classForm.classTeacherId || ''}
                  onChange={(e) => setClassForm({ ...classForm, classTeacherId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                >
                  <option value="">-- Tiada Guru Kelas --</option>
                  {personnel.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (IC: {p.ic})</option>
                  ))}
                </select>
              </div>

              <button
                onClick={saveClass}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs uppercase py-3 rounded-xl transition-all shadow-md"
              >
                Daftarkan Kelas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: SUBJECT ALLOCATION FORM */}
      {showAllocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-sm w-full shadow-2xl p-8">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <h4 className="text-sm font-black uppercase text-slate-800">Agihan Tugas Mengajar</h4>
              <button onClick={() => setShowAllocModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Pilih Guru</label>
                <select
                  value={allocationForm.teacherId || ''}
                  onChange={(e) => setAllocationForm({ ...allocationForm, teacherId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                >
                  <option value="">-- Pilih Guru --</option>
                  {personnel.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Pilih Kelas</label>
                <select
                  value={allocationForm.classId || ''}
                  onChange={(e) => setAllocationForm({ ...allocationForm, classId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                >
                  <option value="">-- Pilih Kelas --</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name} (Tahun {c.yearGroup})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Subjek</label>
                <input
                  type="text"
                  placeholder="Contoh: MATEMATIK, BAHASA INGGERIS"
                  value={allocationForm.subjectName || ''}
                  onChange={(e) => setAllocationForm({ ...allocationForm, subjectName: e.target.value.toUpperCase() })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Siri Pertemuan / Minggu</label>
                  <input
                    type="number"
                    value={allocationForm.periodsPerWeek || 4}
                    onChange={(e) => setAllocationForm({ ...allocationForm, periodsPerWeek: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Peranan</label>
                  <select
                    value={allocationForm.role || 'MAIN'}
                    onChange={(e) => setAllocationForm({ ...allocationForm, role: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                  >
                    <option value="MAIN">MAIN (Utama)</option>
                    <option value="ASSISTANT">ASSISTANT</option>
                    <option value="RELIEF">RELIEF</option>
                    <option value="OBSERVER">OBSERVER</option>
                  </select>
                </div>
              </div>

              <button
                onClick={saveAllocation}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs uppercase py-3 rounded-xl transition-all shadow-md"
              >
                Daftar Agihan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: STUDENT MASTER PROFILE FORM */}
      {showStudentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-sm w-full shadow-2xl p-8">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <h4 className="text-sm font-black uppercase text-slate-800">{editingStudent ? 'Kemas Kini Profil Murid' : 'Daftar Profil Murid'}</h4>
              <button onClick={() => setShowStudentModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">ID Murid (MyKid / IC / Khas)</label>
                <input
                  type="text"
                  disabled={!!editingStudent}
                  placeholder="Contoh: S10255"
                  value={studentForm.student_id || ''}
                  onChange={(e) => setStudentForm({ ...studentForm, student_id: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Nama Murid</label>
                <input
                  type="text"
                  placeholder="Nama Penuh"
                  value={studentForm.name || ''}
                  onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value.toUpperCase() })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Jantina</label>
                  <select
                    value={studentForm.gender || 'L'}
                    onChange={(e) => setStudentForm({ ...studentForm, gender: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                  >
                    <option value="L">Lelaki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Kaum</label>
                  <select
                    value={studentForm.race || 'Melayu'}
                    onChange={(e) => setStudentForm({ ...studentForm, race: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                  >
                    <option value="Melayu">Melayu</option>
                    <option value="Cina">Cina</option>
                    <option value="India">India</option>
                    <option value="Bumiputera Sabah">Bumiputera Sabah</option>
                    <option value="Bumiputera Sarawak">Bumiputera Sarawak</option>
                    <option value="Lain-lain">Lain-lain</option>
                  </select>
                </div>
              </div>

              <button
                onClick={saveStudentMaster}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs uppercase py-3 rounded-xl transition-all shadow-md"
              >
                Simpan Profil Murid
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: CLASS ENROLLMENT FORM */}
      {showEnrollmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-sm w-full shadow-2xl p-8">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <h4 className="text-sm font-black uppercase text-slate-800">Hubungkan Kelas Murid</h4>
              <button onClick={() => setShowEnrollmentModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Pilih Murid (Dari Master)</label>
                <select
                  value={enrollmentStudentId}
                  onChange={(e) => setEnrollmentStudentId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                >
                  <option value="">-- Pilih Murid --</option>
                  {studentMasters.map(s => (
                    <option key={s.student_id} value={s.student_id}>{s.name} ({s.student_id})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Pilih Kelas</label>
                <select
                  value={enrollmentClassId}
                  onChange={(e) => setEnrollmentClassId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                >
                  <option value="">-- Pilih Kelas --</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name} (Tahun {c.yearGroup})</option>
                  ))}
                </select>
              </div>

              <button
                onClick={saveClassEnrollment}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs uppercase py-3 rounded-xl transition-all shadow-md"
              >
                Hubungkan & Letak Kelas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: ADMINISTRATOR OVERRIDE WARNING & JUSTIFICATION DIALOG */}
      {showOverrideModal && pendingAllocation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-md w-full shadow-2xl p-8 space-y-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl border border-amber-200">
                <AlertTriangle size={28} />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-black uppercase text-slate-800">
                  Amaran Ambilan Lebih (Override)
                </h4>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                  Matriks Agihan Tugas Mengajar
                </p>
              </div>
            </div>

            <div className="bg-amber-50/50 border border-amber-100 p-4 rounded-2xl space-y-2 text-xs text-amber-900 leading-relaxed">
              <p className="font-extrabold text-amber-950">
                Syarat Had Tempoh Mingguan (Peraturan T1):
              </p>
              <p>
                Guru <strong className="uppercase">{pendingAllocation.teacherName}</strong> akan dipasangkan dengan beban mengajar sebanyak <strong className="text-sm font-black">{pendingAllocation.totalPeriods} period</strong> seminggu (Had disyorkan: 32 period).
              </p>
              <p className="font-semibold italic">
                Sila berikan justifikasi rasmi pentadbir untuk melepasi had amaran ini bagi simpanan kekal di dalam Log Audit iSEPADU.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase text-slate-400">Justifikasi Kelulusan Pentadbir</label>
              <textarea
                rows={3}
                required
                value={overrideJustification}
                onChange={(e) => setOverrideJustification(e.target.value)}
                placeholder="Contoh: Sekolah Kurang Murid (SKM) / Kekurangan Guru Subjek Teras Sessional..."
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-bold text-slate-800 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowOverrideModal(false);
                  setPendingAllocation(null);
                  setOverrideJustification('');
                }}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-extrabold text-xs uppercase py-3 rounded-xl transition-all"
              >
                Batal
              </button>
              <button
                onClick={confirmAllocationOverride}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs uppercase py-3 rounded-xl transition-all shadow-md"
              >
                Lulus & Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7: STUDENT PROFILE & EMERGENCY CARD MODAL */}
      <StudentProfileModal
        studentId={activeProfileStudentId}
        isOpen={!!activeProfileStudentId}
        onClose={() => setActiveProfileStudentId(null)}
        academicYear={selectedAcademicYear || '2026'}
      />

      {/* MODAL 8: SCHOOL LOGO UPLOAD & URL EXTRACTION MODAL */}
      <SchoolLogoModal
        isOpen={isLogoModalOpen}
        onClose={() => setIsLogoModalOpen(false)}
        currentLogoUrl={configForm.schoolLogo || schoolConfig?.schoolLogo || ''}
        onLogoUpdated={(newLogo) => {
          setConfigForm((prev) => ({ ...prev, schoolLogo: newLogo }));
          setSchoolConfig((prev) => (prev ? { ...prev, schoolLogo: newLogo } : null));
        }}
      />
    </div>
  );
}

// Reusable Helper Components
interface SubTabBtnProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function SubTabBtn({ active, onClick, icon, label }: SubTabBtnProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${
        active 
          ? 'bg-slate-900 text-white shadow-md shadow-slate-200' 
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}


