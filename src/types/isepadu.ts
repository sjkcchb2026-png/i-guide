
export type Role = 'subject_teacher' | 'class_teacher' | 'head_department' | 'admin' | 'student' | 'secretary' | 'principal' | 'visitor';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: Role;
  year_assigned?: number;
  class_assigned?: string;
  subject_assigned?: string;
  academic_year?: string;
}

export interface Student {
  id: string;
  student_id: string;
  apdmId?: string;
  name: string;
  class: string;
  year: number;
  academic_year: string;
  gender?: 'L' | 'P';
  race?: string;
  icNumber?: string;
  maskedIc?: string;
  birthDate?: string;
  birthYear?: number;
  age?: number;
  guardianPhone?: string;
  guardianName?: string;
  classTeacherName?: string;
}

export interface Subject {
  id: string;
  name: string;
}

export interface UasaResult {
  id?: string;
  student_id: string;
  subject_id: string;
  marks: number | string;
  grade: string;
  rumusan?: string;
  term: number;
  year: number;
  academic_year: string;
  updatedAt?: any;
}

export interface PbdResult {
  id?: string;
  student_id: string;
  subject_id: string;
  tp: number | string;
  tov?: number | string;
  oti1?: number | string;
  ar1?: number | string;
  oti2?: number | string;
  ar2?: number | string;
  etr?: number | string;
  rumusan: string;
  mastery: 'Belum Menguasai' | 'Menguasai' | 'N/A';
  term: number;
  year: number;
  academic_year: string;
  updatedAt?: any;
}

export interface GradeThreshold {
  min: number;
  max: number;
  grade: string;
}

export const GRADE_THRESHOLDS: GradeThreshold[] = [
  { min: 82, max: 100, grade: 'A' },
  { min: 66, max: 81, grade: 'B' },
  { min: 50, max: 65, grade: 'C' },
  { min: 35, max: 49, grade: 'D' },
  { min: 20, max: 34, grade: 'E' },
  { min: 0, max: 19, grade: 'F' },
];

export interface Intervention {
  id?: string;
  student_id: string | null;
  student_name: string | null;
  category: 'mismatch' | 'near_miss' | 'icu' | 'general';
  type: 'individual' | 'overall';
  action_text: string;
  created_by: string;
  teacher_name: string;
  subject_id: string;
  year: number;
  term: number;
  academic_year: string;
  createdAt: any;
}

export interface SchoolConfig {
  id: string;
  schoolName: string;
  schoolType: 'SK' | 'SJKC' | 'SJKT';
  schoolCategory: 'SKM' | 'Non-SKM';
  hasPreschool: boolean;
  hasPPKI: boolean;
  academicSession: string;
  defaultLanguages: string[];
  schoolLogo?: string;
}

export interface AcademicYearConfig {
  id: string;
  year: string;
  status: 'active' | 'historical';
}

export interface PersonnelProfile {
  id: string; // Internal stable personnel ID
  name: string;
  ic?: string;
  gender: 'L' | 'P';
  email: string;
  phone: string;
  staffFileNo?: string;
  grade?: string;
  position?: string;
  majorOption?: string;
  minorOption?: string;
  datePlaced?: string;
  dateAppointed?: string;
  dateConfirmed?: string;
  datePensionStatus?: string;
  datePension?: string;
  dateNextPromotion?: string;
  apcReceived?: string;
  employmentStatus: 'Tetap' | 'Kontrak' | 'Sambilan' | string;
  teachingStatus: 'Aktif' | 'Cuti' | 'Tidak Aktif' | string;
  portfolios?: string[];
  committees?: string[];
  coordinators?: string[];
  additionalResponsibilities?: string[];
  category?: 'GURU' | 'AKP' | string;
  importedAt?: any;
  importSessionId?: string;
}

export interface GuruImportRow {
  rowNumber: number;
  raw: Record<string, string>;
  normalized: {
    name: string;
    gender: 'L' | 'P';
    ic: string;
    staffFileNo: string;
    grade: string;
    position: string;
    datePlaced: string;
    dateAppointed: string;
    dateConfirmed: string;
    majorOption: string;
    minorOption: string;
    datePensionStatus: string;
    datePension: string;
    dateNextPromotion: string;
    phone: string;
    email: string;
    apcReceived: string;
    employmentStatus: string;
    teachingStatus: string;
  };
  matchedPersonnelId?: string;
  status: 'NEW' | 'MATCHED' | 'UPDATE' | 'CONFLICT' | 'DUPLICATE' | 'INVALID';
  matchReason?: string;
  conflicts?: string[];
  diffs?: string[];
  proposedId: string;
}

export interface GuruImportPreviewResponse {
  success: boolean;
  sessionId: string;
  sheetSource: string;
  columnsDetected: string[];
  totalRows: number;
  summary: {
    new: number;
    matched: number;
    update: number;
    conflict: number;
    duplicate: number;
    invalid: number;
  };
  rows: GuruImportRow[];
}

export interface ClassConfig {
  id: string;
  name: string;
  academicYear: string;
  yearGroup: number;
  classTeacherId?: string;
  classTeacherName?: string;
}

export interface SubjectAllocation {
  id: string;
  academicYear: string;
  teacherId: string;
  teacherName: string;
  classId: string;
  className: string;
  subjectName: string;
  periodsPerWeek: number;
  role: 'MAIN' | 'ASSISTANT' | 'RELIEF' | 'OBSERVER';
}

export interface GuardianInfo {
  name?: string;
  icNumber?: string;
  relation?: string;
  occupation?: string;
  employer?: string;
  income?: string | number;
  officePhone?: string;
  mobilePhone?: string;
  employmentStatus?: string;
}

export interface ResidentialAddress {
  address1?: string;
  address2?: string;
  address3?: string;
  postcode?: string;
  city?: string;
  district?: string;
  state?: string;
}

export interface WelfareInfo {
  isOku?: boolean;
  okuStatus?: string;
  disabilityCategory?: string;
  disabilitySubCategory?: string;
  okuCardNo?: string;
  isOrphan?: boolean;
  orphanStatus?: string;
  bankName?: string;
  bankAccountNumber?: string;
  dependentsCount?: number | string;
}

export interface StudentMaster {
  student_id: string; // Document ID (apdmId or icNumber)
  apdmId?: string;
  name: string;
  icNumber?: string;
  maskedIc?: string;
  idType?: string;
  birthDate?: string;
  birthYear?: number;
  age?: number; // Calculated birth-year age (activeAcademicYear - birthYear)
  gender: 'L' | 'P';
  race: string;
  religion?: string;
  citizenship?: string;
  countryOfOrigin?: string;

  // Enrolment & Current Class
  studyStatus?: string;
  enrolmentDate?: string;
  currentClass?: string;
  currentYear?: number;
  classTeacherName?: string;
  academicYear?: string;

  // Welfare & Guardians & Address
  welfare?: WelfareInfo;
  guardian1?: GuardianInfo;
  guardian2?: GuardianInfo;
  address?: ResidentialAddress;

  phone?: string;
  email?: string;
  createdAt?: any;
  updatedAt?: any;
  importedAt?: any;
  importSessionId?: string;
}

export interface ApdmStudentImportRow {
  rowNumber: number;
  rowId: string;
  apdmId: string;
  name: string;
  icNumber: string;
  maskedIc: string;
  idType: string;
  birthDate: string;
  birthYear: number;
  age: number; // 2026 - birthYear
  gender: 'L' | 'P';
  race: string;
  religion: string;
  citizenship: string;
  studyStatus: string;
  enrolmentDate: string;
  rawYear: string;
  rawClassName: string;
  suggestedYear: number; // 0 for PRASEKOLAH, 1-6
  suggestedClass: string;
  isSixYearsOld: boolean; // age === 6 (born 2020)
  sixYearsOldPromoted?: boolean; // checked -> TAHUN 1, unchecked -> PRASEKOLAH
  welfare: WelfareInfo;
  guardian1: GuardianInfo;
  guardian2: GuardianInfo;
  address: ResidentialAddress;
  status: 'NEW' | 'MATCHED' | 'UPDATE' | 'CONFLICT' | 'DUPLICATE' | 'INVALID';
  matchReason?: string;
  existingId?: string;
  proposedId: string;
  diffs?: string[];
}

export interface ApdmStudentImportPreviewResponse {
  success: boolean;
  sessionId: string;
  sheetSource: string;
  columnsDetected: string[];
  totalRows: number;
  summary: {
    totalSourceRows: number;
    new: number;
    matched: number;
    update: number;
    conflict: number;
    duplicate: number;
    invalid: number;
    sixYearsOldCount: number;
    preschoolCount: number;
    primaryCount: number;
  };
  sixYearsOldStudents: ApdmStudentImportRow[];
  rows: ApdmStudentImportRow[];
}

export interface GovernanceAssignment {
  id: string;
  personnelId: string;
  personnelName: string;
  academicYear: string;
  governanceType: 'PORTFOLIO' | 'COMMITTEE' | 'COORDINATOR' | 'ADDITIONAL_RESPONSIBILITY';
  entityName: string;
  role: 'CHAIR' | 'SECRETARY' | 'COMMITTEE_MEMBER' | 'COORDINATOR_LEAD' | 'OPERATIONAL_STAFF';
  raciRole: 'R' | 'A' | 'C' | 'I';
  effectiveDate: string;
  expiryDate?: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface AuditTrailEntry {
  id?: string;
  timestamp: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  action_type: 'CREATE' | 'UPDATE' | 'DELETE' | 'STATE_CHANGE' | 'AUTHORIZE' | 'IMPORT' | 'ROLLBACK';
  layer: number;
  entity_id: string;
  details: string;
}

export interface ImportSession {
  id: string;
  timestamp: string;
  importType: 'student' | 'personnel';
  summary: {
    insert: number;
    fill: number;
    conflict: number;
    skip: number;
  };
  status: 'active' | 'rolled_back' | 'archived';
  actorName: string;
}

export interface RollbackRecord {
  id: string;
  sessionId: string;
  collection: 'personnel' | 'student_master' | 'teachers';
  docId: string;
  actionType: 'INSERT' | 'FILL_EMPTY' | 'UPDATE';
  previousState: any | null;
}




