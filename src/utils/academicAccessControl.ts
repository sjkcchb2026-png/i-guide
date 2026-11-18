import { useState, useEffect } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { OFFICIAL_TEACHERS, generateTeacherShortCode, OfficialTeacherEntry } from '../constants/officialRoster';
import { DEFAULT_SCHOOL_CODE, SUBJECTS_BY_YEAR } from '../constants';
import {
  buildDefaultCurriculumMatrix,
  getDefaultClassTeachers,
} from '../constants/defaultCurriculumMatrix';
import { MYSG_DEFAULT_CATALOG } from './mysgJawatankuasaCatalog';

export interface TeachingAssignmentItem {
  yearLevel: number;
  className: string;
  subjectCode: string;
  subjectName: string;
}

export interface ClassTeacherAssignmentItem {
  yearLevel: number;
  className: string;
}

export interface AcademicAccessProfile {
  isAcademicAdmin: boolean;
  teacherId: string;
  teacherShortCode: string;
  teacherName: string;
  teacherEmail: string;
  positionLabel: string;
  teachingAssignments: TeachingAssignmentItem[];
  classTeacherOf: ClassTeacherAssignmentItem[];
  ketuaPanitiaSubjects: string[]; // Normalized subject codes e.g. ['BM', 'BC', 'MT']
  ketuaPanitiaSubjectNames: string[]; // Full PBD/UASA names e.g. ['Bahasa Melayu', 'Bahasa Cina']
  roleBadges: string[];
}

const SUBJECT_CODE_TO_FULL_NAME: Record<string, string> = {
  BM: 'Bahasa Melayu',
  BI: 'Bahasa Inggeris',
  BC: 'Bahasa Cina',
  MT: 'Matematik',
  SN: 'Sains',
  SEJ: 'Sejarah',
  RBT: 'Reka Bentuk & Teknologi',
  PJ: 'Pendidikan Jasmani & Kesihatan',
  PK: 'Pendidikan Jasmani & Kesihatan',
  PJPK: 'Pendidikan Jasmani & Kesihatan',
  PSV: 'Pendidikan Seni Visual',
  MZ: 'Pendidikan Muzik',
  PM: 'Pendidikan Moral',
  PAI: 'Pendidikan Moral',
  'PM/PAI': 'Pendidikan Moral',
};

/**
 * Maps a subject code or name to canonical PBD/UASA subject names for a given yearLevel (1..6).
 */
export function normalizeSubjectCodeToPbdNames(codeOrName: string, yearLevel?: number): string[] {
  const raw = String(codeOrName || '').trim();
  if (!raw) return [];
  const upper = raw.toUpperCase();

  // Ignore non-PBD administrative slots
  if (['PN', 'PER', 'REHAT', 'PKAR', 'MEMBACA', 'TASMIK', 'KLIBC', 'KLIMT'].includes(upper)) {
    if (upper === 'KLIBC') return ['Bahasa Cina'];
    if (upper === 'KLIMT') return ['Matematik'];
    return [];
  }

  const results = new Set<string>();
  const isLowerPrimary = yearLevel ? yearLevel <= 3 : false;

  if (upper === 'BM' || upper.includes('BAHASA MELAYU')) results.add('Bahasa Melayu');
  if (upper === 'BI' || upper.includes('BAHASA INGGERIS')) results.add('Bahasa Inggeris');
  if (upper === 'BC' || upper.includes('BAHASA CINA')) results.add('Bahasa Cina');
  if (upper === 'MT' || upper.includes('MATEMATIK')) results.add('Matematik');
  if (upper === 'SN' || upper.includes('SAINS')) results.add('Sains');
  if (upper === 'SEJ' || upper.includes('SEJARAH')) results.add('Sejarah');
  if (upper === 'RBT' || upper.includes('REKA BENTUK')) results.add('Reka Bentuk & Teknologi');
  if (
    upper === 'PJ' ||
    upper === 'PK' ||
    upper === 'PJPK' ||
    upper.includes('JASMANI') ||
    upper.includes('KESIHATAN')
  ) {
    results.add('Pendidikan Jasmani & Kesihatan');
  }
  if (upper === 'PSV' || upper.includes('SENI VISUAL') || upper.includes('KESENIAN')) {
    if (yearLevel) {
      results.add(isLowerPrimary ? 'Pendidikan Kesenian' : 'Pendidikan Seni Visual');
    } else {
      results.add('Pendidikan Kesenian');
      results.add('Pendidikan Seni Visual');
    }
  }
  if (upper === 'MZ' || upper.includes('MUZIK')) {
    if (yearLevel) {
      results.add(isLowerPrimary ? 'Pendidikan Kesenian' : 'Pendidikan Muzik');
    } else {
      results.add('Pendidikan Kesenian');
      results.add('Pendidikan Muzik');
    }
  }
  if (
    upper === 'PM' ||
    upper === 'PAI' ||
    upper === 'PM/PAI' ||
    upper.includes('MORAL') ||
    upper.includes('ISLAM')
  ) {
    results.add('Pendidikan Moral');
  }

  if (results.size === 0 && SUBJECT_CODE_TO_FULL_NAME[upper]) {
    results.add(SUBJECT_CODE_TO_FULL_NAME[upper]);
  }

  // Filter by valid subjects in that yearLevel if specified
  if (yearLevel && SUBJECTS_BY_YEAR[yearLevel]) {
    const allowed = new Set(SUBJECTS_BY_YEAR[yearLevel]);
    return Array.from(results).filter((name) => allowed.has(name));
  }

  return Array.from(results);
}

/**
 * Converts a PBD/UASA subject name or code to its canonical short code ('BM', 'BI', 'BC', 'MT', 'SN', 'SEJ', 'RBT', 'PJPK', 'PSV', 'MZ', 'PM').
 */
export function normalizePbdNameToSubjectCode(subjectNameOrCode: string): string {
  const upper = String(subjectNameOrCode || '').trim().toUpperCase();
  if (!upper) return '';
  if (['BM', 'BI', 'BC', 'MT', 'SN', 'SEJ', 'RBT', 'PJPK', 'PSV', 'MZ', 'PM', 'PAI'].includes(upper)) {
    return upper === 'PAI' ? 'PM' : upper;
  }
  if (upper === 'PJ' || upper === 'PK') return 'PJPK';
  if (upper === 'PM/PAI') return 'PM';
  if (upper === 'KLIBC') return 'BC';
  if (upper === 'KLIMT') return 'MT';
  if (upper.includes('BAHASA MELAYU')) return 'BM';
  if (upper.includes('BAHASA INGGERIS')) return 'BI';
  if (upper.includes('BAHASA CINA')) return 'BC';
  if (upper.includes('MATEMATIK')) return 'MT';
  if (upper.includes('SAINS')) return 'SN';
  if (upper.includes('SEJARAH')) return 'SEJ';
  if (upper.includes('REKA BENTUK')) return 'RBT';
  if (upper.includes('JASMANI') || upper.includes('KESIHATAN')) return 'PJPK';
  if (upper.includes('SENI VISUAL') || upper.includes('KESENIAN')) return 'PSV';
  if (upper.includes('MUZIK')) return 'MZ';
  if (upper.includes('MORAL') || upper.includes('ISLAM')) return 'PM';
  return upper;
}

/**
 * Extracts Ketua Panitia subject codes from a Jawatankuasa title or portfolio name.
 */
function extractPanitiaSubjectCodesFromText(text: string): string[] {
  const upper = String(text || '').toUpperCase();
  if (!upper.includes('PANITIA') && !upper.includes('KETUA PANITIA')) return [];
  const codes = new Set<string>();
  if (upper.includes('BAHASA MELAYU') || /\bBM\b/.test(upper)) codes.add('BM');
  if (upper.includes('BAHASA INGGERIS') || /\bBI\b/.test(upper)) codes.add('BI');
  if (upper.includes('BAHASA CINA') || /\bBC\b/.test(upper)) codes.add('BC');
  if (upper.includes('MATEMATIK') || /\bMT\b/.test(upper)) codes.add('MT');
  if (upper.includes('SAINS') || /\bSN\b/.test(upper)) codes.add('SN');
  if (upper.includes('SEJARAH') || /\bSEJ\b/.test(upper)) codes.add('SEJ');
  if (upper.includes('REKA BENTUK') || /\bRBT\b/.test(upper)) codes.add('RBT');
  if (upper.includes('JASMANI') || upper.includes('KESIHATAN') || /\bPJPK\b/.test(upper) || /\bPJ\b/.test(upper)) {
    codes.add('PJPK');
  }
  if (upper.includes('SENI VISUAL') || upper.includes('KESENIAN') || /\bPSV\b/.test(upper)) {
    codes.add('PSV');
  }
  if (upper.includes('MUZIK') || /\bMZ\b/.test(upper)) {
    codes.add('MZ');
  }
  if (upper.includes('MORAL') || upper.includes('ISLAM') || /\bPM\b/.test(upper) || /\bPAI\b/.test(upper)) {
    codes.add('PM');
  }
  return Array.from(codes);
}

/**
 * Resolves the canonical teacher entry from OFFICIAL_TEACHERS / personnel for the currentUser.
 */
export function matchOfficialTeacher(
  currentUser: any,
  personnelDocs: any[] = []
): {
  teacherId: string;
  teacherShortCode: string;
  teacherName: string;
  teacherEmail: string;
  position: string;
  role: string;
} {
  const rawEmail = String(currentUser?.email || auth.currentUser?.email || '').trim().toLowerCase();
  const rawName = String(currentUser?.name || auth.currentUser?.displayName || '').trim();
  const upperName = rawName.toUpperCase();
  const rawUid = String(currentUser?.uid || auth.currentUser?.uid || '').trim();
  const rawStaffId = String(currentUser?.staffId || currentUser?.id || '').trim();
  const rawShortCode = String(currentUser?.shortCode || currentUser?.code || '').trim().toUpperCase();

  // 1. Check OFFICIAL_TEACHERS first for canonical short code & position
  let matchedOfficial: OfficialTeacherEntry | undefined = OFFICIAL_TEACHERS.find(
    (t) =>
      (rawEmail && t.email.toLowerCase() === rawEmail) ||
      (rawStaffId && t.id === rawStaffId) ||
      (rawUid && t.id === rawUid) ||
      (rawShortCode && t.code.toUpperCase() === rawShortCode) ||
      (upperName && t.name.toUpperCase() === upperName)
  );

  if (!matchedOfficial && upperName) {
    matchedOfficial = OFFICIAL_TEACHERS.find(
      (t) => upperName.includes(t.name.toUpperCase()) || t.name.toUpperCase().includes(upperName)
    );
  }

  // 2. Check personnel collection docs
  const matchedPersonnel = personnelDocs.find((p) => {
    const pEmail = String(p.email || '').trim().toLowerCase();
    const pName = String(p.name || p.fullName || '').trim().toUpperCase();
    const pCode = String(p.shortCode || p.code || '').trim().toUpperCase();
    return (
      (rawEmail && pEmail === rawEmail) ||
      (rawUid && (p.id === rawUid || p.uid === rawUid)) ||
      (rawStaffId && p.id === rawStaffId) ||
      (rawShortCode && pCode === rawShortCode) ||
      (upperName && pName === upperName) ||
      (matchedOfficial && (p.id === matchedOfficial.id || pName === matchedOfficial.name.toUpperCase()))
    );
  });

  const teacherName =
    matchedOfficial?.name ||
    matchedPersonnel?.name ||
    matchedPersonnel?.fullName ||
    rawName ||
    'Guru Akademik';

  const teacherShortCode =
    matchedOfficial?.code ||
    matchedPersonnel?.shortCode ||
    matchedPersonnel?.code ||
    rawShortCode ||
    generateTeacherShortCode(teacherName);

  const teacherId =
    matchedOfficial?.id ||
    matchedPersonnel?.id ||
    rawStaffId ||
    rawUid ||
    `staff_${teacherShortCode}`;

  const position =
    matchedPersonnel?.position ||
    matchedOfficial?.position ||
    String(currentUser?.position || currentUser?.jawatan || 'GAB');

  const role =
    String(currentUser?.role || matchedPersonnel?.role || matchedOfficial?.role || 'GURU').toUpperCase();

  return {
    teacherId,
    teacherShortCode: teacherShortCode.toUpperCase(),
    teacherName,
    teacherEmail: rawEmail || matchedOfficial?.email || '',
    position,
    role,
  };
}

/**
 * Checks whether a given teacher code/name/id token matches the logged-in user's AcademicAccessProfile.
 */
export function doesTeacherMatchProfile(
  tokenOrField: string | undefined | null,
  profile: Pick<AcademicAccessProfile, 'teacherShortCode' | 'teacherName' | 'teacherId' | 'teacherEmail'>
): boolean {
  if (!tokenOrField) return false;
  const raw = String(tokenOrField).trim();
  if (!raw || raw === '-') return false;
  const upper = raw.toUpperCase();
  const myCode = profile.teacherShortCode.toUpperCase();
  const myName = profile.teacherName.toUpperCase();
  const myId = profile.teacherId.toUpperCase();

  if (upper === myCode || upper === myName || upper === myId) return true;

  // Handle slash or comma separated teacher codes e.g. "DT / MFA" or "LRR / MFA"
  const parts = upper
    .split(/[/,&+]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.includes(myCode) || parts.includes(myName) || parts.includes(myId)) {
    return true;
  }

  // Handle "TEO YANG MING (TYM)" or "[TYM] TEO YANG MING"
  if (myName.length >= 4 && upper.includes(myName)) return true;
  const codeRegex = new RegExp(`\\b${myCode}\\b`, 'i');
  if (myCode.length >= 2 && codeRegex.test(upper)) return true;

  return false;
}

/**
 * Pure synchronous builder that computes AcademicAccessProfile from loaded SSOT data.
 */
export function computeAcademicAccessFromData(params: {
  currentUser: any;
  academicYear: string;
  personnelDocs?: any[];
  subjectAllocationDocs?: any[];
  classDocs?: any[];
  timetableDocData?: any | null;
  mysgAssignments?: any[];
  governanceDocs?: any[];
}): AcademicAccessProfile {
  const {
    currentUser,
    academicYear,
    personnelDocs = [],
    subjectAllocationDocs = [],
    classDocs = [],
    timetableDocData = null,
    mysgAssignments = [],
    governanceDocs = [],
  } = params;

  const matched = matchOfficialTeacher(currentUser, personnelDocs);
  const posUpper = String(matched.position || '').toUpperCase().replace(/\s+/g, '');
  const roleUpper = String(matched.role || currentUser?.role || '').toUpperCase();
  const userPosUpper = String(currentUser?.position || currentUser?.jawatan || '')
    .toUpperCase()
    .replace(/\s+/g, '');

  // 1. isAcademicAdmin: true ONLY for Guru Besar (GB), GPK Pentadbiran (PK1), or System Admin
  const isGB =
    posUpper === 'GB' ||
    posUpper.includes('GURUBESAR') ||
    userPosUpper === 'GB' ||
    userPosUpper.includes('GURUBESAR') ||
    matched.teacherShortCode === 'TYM' ||
    roleUpper === 'PRINCIPAL' ||
    roleUpper === 'GURU_BESAR';

  const isPK1 =
    posUpper === 'PK1' ||
    posUpper.includes('PKPENTADBIRAN') ||
    posUpper.includes('GPKPENTADBIRAN') ||
    posUpper.includes('PENOLONGKANANPENTADBIRAN') ||
    userPosUpper === 'PK1' ||
    userPosUpper.includes('PKPENTADBIRAN') ||
    userPosUpper.includes('GPKPENTADBIRAN') ||
    matched.teacherShortCode === 'HHH';

  const isSysAdmin =
    roleUpper === 'ADMIN' ||
    roleUpper === 'SYSTEM_ADMIN' ||
    roleUpper === 'SUPERADMIN' ||
    Boolean(currentUser?.isSystemAdmin);

  const isAcademicAdmin = Boolean(isGB || isPK1 || isSysAdmin);

  // Fallback canonical timetable matrix & classTeachers if Firestore timetable document is not yet saved
  const fallbackMatrix = buildDefaultCurriculumMatrix(String(academicYear || '2026'), {
    includeLegacyTeachers: true,
  });
  const fallbackClassTeachers = getDefaultClassTeachers(true);

  // 2. Resolve Teaching Assignments (yearLevel, className, subjectCode, subjectName)
  const assignmentMap = new Map<string, TeachingAssignmentItem>();
  const addTeachingAssignment = (yearLevel: number, rawSubjCodeOrName: string) => {
    if (!yearLevel || yearLevel < 1 || yearLevel > 6) return;
    const className = `Tahun ${yearLevel}`;
    const pbdNames = normalizeSubjectCodeToPbdNames(rawSubjCodeOrName, yearLevel);
    const subjCode = normalizePbdNameToSubjectCode(rawSubjCodeOrName);

    if (pbdNames.length > 0) {
      for (const sName of pbdNames) {
        const canonicalCode = normalizePbdNameToSubjectCode(sName) || subjCode;
        const key = `${yearLevel}__${sName}`;
        if (!assignmentMap.has(key)) {
          assignmentMap.set(key, {
            yearLevel,
            className,
            subjectCode: canonicalCode,
            subjectName: sName,
          });
        }
      }
    }
  };

  // 2a. From subject_allocations collection
  for (const alloc of subjectAllocationDocs) {
    const allocYear = String(alloc.academicYear || academicYear).trim();
    if (allocYear && allocYear !== String(academicYear).trim()) continue;

    const allocTeacherMatch =
      doesTeacherMatchProfile(alloc.teacherId, matched) ||
      doesTeacherMatchProfile(alloc.teacherCode, matched) ||
      doesTeacherMatchProfile(alloc.teacherName, matched);

    if (allocTeacherMatch) {
      const yLevel =
        Number(alloc.yearLevel || alloc.grade) ||
        Number(String(alloc.className || alloc.classId || '').replace(/\D/g, ''));
      const subj = alloc.subjectName || alloc.subjectCode || alloc.subject;
      if (yLevel >= 1 && yLevel <= 6 && subj) {
        addTeachingAssignment(yLevel, subj);
      }
    }
  }

  // 2b. From school_timetables matrixData (Agihan Jadual Waktu)
  const matrixData: any[] =
    Array.isArray(timetableDocData?.matrixData) && timetableDocData.matrixData.length > 0
      ? timetableDocData.matrixData
      : fallbackMatrix;

  for (const row of matrixData) {
    const subjCode = String(row?.subjectCode || row?.code || '').trim().toUpperCase();
    if (!subjCode) continue;
    for (let grade = 1; grade <= 6; grade++) {
      const periods = Number(row?.periods?.[grade] ?? row?.grades?.[grade]?.periods ?? 0);
      const teacherToken = row?.teachers?.[grade] ?? row?.grades?.[grade]?.teacher ?? '';
      if (periods <= 0) continue;
      if (doesTeacherMatchProfile(teacherToken, matched)) {
        addTeachingAssignment(grade, subjCode);
      }
    }
  }

  // 2c. From school_timetables schedule grid
  const scheduleGrid = timetableDocData?.schedule || {};
  for (let grade = 1; grade <= 6; grade++) {
    const gradeDays = scheduleGrid[grade];
    if (!gradeDays || typeof gradeDays !== 'object') continue;
    for (const dayKey of Object.keys(gradeDays)) {
      const daySlots = gradeDays[dayKey];
      if (!daySlots || typeof daySlots !== 'object') continue;
      for (const slotKey of Object.keys(daySlots)) {
        const slotCell = daySlots[slotKey];
        if (!slotCell || !slotCell.subjectCode) continue;
        if (doesTeacherMatchProfile(slotCell.teacherCode, matched)) {
          addTeachingAssignment(grade, slotCell.subjectCode);
        }
      }
    }
  }

  const teachingAssignments = Array.from(assignmentMap.values()).sort((a, b) =>
    a.yearLevel !== b.yearLevel
      ? a.yearLevel - b.yearLevel
      : a.subjectName.localeCompare(b.subjectName)
  );

  // 3. Resolve classTeacherOf (Guru Kelas)
  const classTeacherMap = new Map<number, ClassTeacherAssignmentItem>();
  const addClassTeacher = (yearLevel: number) => {
    if (yearLevel >= 1 && yearLevel <= 6 && !classTeacherMap.has(yearLevel)) {
      classTeacherMap.set(yearLevel, {
        yearLevel,
        className: `Tahun ${yearLevel}`,
      });
    }
  };

  // 3a. From classes collection
  for (const cls of classDocs) {
    const clsYear = String(cls.academicYear || academicYear).trim();
    if (clsYear && clsYear !== String(academicYear).trim()) continue;
    const isHomeroom =
      doesTeacherMatchProfile(cls.classTeacherId, matched) ||
      doesTeacherMatchProfile(cls.classTeacherName, matched) ||
      doesTeacherMatchProfile(cls.teacherName, matched) ||
      doesTeacherMatchProfile(cls.guruKelas, matched);
    if (isHomeroom) {
      const yLevel =
        Number(cls.yearLevel || cls.grade) ||
        Number(String(cls.name || cls.className || cls.id || '').replace(/\D/g, ''));
      addClassTeacher(yLevel);
    }
  }

  // 3b. From school_timetables.classTeachers
  const classTeachersObj =
    timetableDocData?.classTeachers && Object.keys(timetableDocData.classTeachers).length > 0
      ? timetableDocData.classTeachers
      : fallbackClassTeachers;
  for (let grade = 1; grade <= 6; grade++) {
    const hmNameOrCode = classTeachersObj[grade];
    if (doesTeacherMatchProfile(hmNameOrCode, matched)) {
      addClassTeacher(grade);
    }
  }

  // 3c. From mysg_jawatankuasa_assignments
  const effectiveMysgList =
    mysgAssignments.length > 0 ? mysgAssignments : MYSG_DEFAULT_CATALOG;
  for (const item of effectiveMysgList) {
    const titleStr = String(item.jawatanRasmi || item.jawatanTitle || '');
    if (
      String(item.kodMySG || item.portfolioCode || '').includes('GURU-KELAS') ||
      titleStr.toUpperCase().includes('GURU KELAS TAHUN')
    ) {
      const isCoordinator =
        doesTeacherMatchProfile(item.assignedTeacherId, matched) ||
        doesTeacherMatchProfile(item.assignedTeacherName, matched);
      if (isCoordinator) {
        const yMatch = titleStr.match(/TAHUN\s*([1-6])/i);
        if (yMatch) {
          addClassTeacher(Number(yMatch[1]));
        }
      }
    }
  }

  const classTeacherOf = Array.from(classTeacherMap.values()).sort(
    (a, b) => a.yearLevel - b.yearLevel
  );

  // 4. Resolve ketuaPanitiaSubjects (Ketua Panitia)
  const panitiaCodeSet = new Set<string>();

  // 4a. From mysg_jawatankuasa_assignments (Penyelaras of Panitia)
  for (const item of effectiveMysgList) {
    const title = String(item.jawatanRasmi || item.jawatanTitle || '');
    const jkInduk = String(item.jawatankuasaInduk || item.subModule || '');
    if (
      title.toUpperCase().includes('KETUA PANITIA') ||
      jkInduk.toUpperCase().includes('PANITIA')
    ) {
      const isCoordinator =
        doesTeacherMatchProfile(item.assignedTeacherId, matched) ||
        doesTeacherMatchProfile(item.assignedTeacherName, matched);
      if (isCoordinator) {
        const extracted = extractPanitiaSubjectCodesFromText(`${title} ${jkInduk}`);
        extracted.forEach((c) => panitiaCodeSet.add(c));
      }
    }
  }

  // 4b. From governance_assignments / school_governance
  for (const gov of governanceDocs) {
    const title = String(gov.title || gov.roleTitle || gov.position || gov.jawatanTitle || '');
    const isHolder =
      doesTeacherMatchProfile(gov.teacherId || gov.assignedTeacherId, matched) ||
      doesTeacherMatchProfile(gov.teacherName || gov.assignedTeacherName, matched);
    if (isHolder) {
      const extracted = extractPanitiaSubjectCodesFromText(
        `${title} ${gov.subject || gov.catatanSkop || ''}`
      );
      extracted.forEach((c) => panitiaCodeSet.add(c));
    }
  }

  const ketuaPanitiaSubjects = Array.from(panitiaCodeSet);
  const ketuaPanitiaNameSet = new Set<string>();
  for (const code of ketuaPanitiaSubjects) {
    for (let y = 1; y <= 6; y++) {
      normalizeSubjectCodeToPbdNames(code, y).forEach((n) => ketuaPanitiaNameSet.add(n));
    }
  }
  const ketuaPanitiaSubjectNames = Array.from(ketuaPanitiaNameSet);

  // 5. Build clear human-readable roleBadges for the UI header
  const roleBadges: string[] = [];
  if (isAcademicAdmin) {
    if (isGB) roleBadges.push('Pentadbir Akademik (Guru Besar)');
    else if (isPK1) roleBadges.push('Pentadbir Akademik (GPK Pentadbiran)');
    else roleBadges.push('Pentadbir Akademik (Admin)');
  } else {
    roleBadges.push(`Guru Subjek (${matched.teacherShortCode})`);
  }

  if (classTeacherOf.length > 0) {
    roleBadges.push(`Guru Kelas ${classTeacherOf.map((c) => c.className).join(', ')}`);
  }

  if (ketuaPanitiaSubjects.length > 0) {
    roleBadges.push(`Ketua Panitia (${ketuaPanitiaSubjects.join(', ')})`);
  }

  return {
    isAcademicAdmin,
    teacherId: matched.teacherId,
    teacherShortCode: matched.teacherShortCode,
    teacherName: matched.teacherName,
    teacherEmail: matched.teacherEmail,
    positionLabel: matched.position,
    teachingAssignments,
    classTeacherOf,
    ketuaPanitiaSubjects,
    ketuaPanitiaSubjectNames,
    roleBadges,
  };
}

/**
 * One-shot async resolver for AcademicAccessProfile.
 */
export async function resolveAcademicAccessControl(
  currentUser: any,
  academicYear: string,
  schoolCode: string = DEFAULT_SCHOOL_CODE
): Promise<AcademicAccessProfile> {
  const cleanSchool = (schoolCode || DEFAULT_SCHOOL_CODE).trim().toUpperCase();
  const cleanYear = String(academicYear || '2026').trim();

  try {
    const [personnelSnap, allocSnap, classesSnap, ttScopedSnap, mysgSnap] = await Promise.all([
      getDocs(query(collection(db, 'personnel'), where('schoolCode', '==', cleanSchool))).catch(
        () => null
      ),
      getDocs(
        query(collection(db, 'subject_allocations'), where('schoolCode', '==', cleanSchool))
      ).catch(() => null),
      getDocs(query(collection(db, 'classes'), where('schoolCode', '==', cleanSchool))).catch(
        () => null
      ),
      getDoc(doc(db, 'school_timetables', `${cleanSchool}_${cleanYear}`)).catch(() => null),
      getDoc(doc(db, 'mysg_jawatankuasa_assignments', `${cleanSchool}_${cleanYear}`)).catch(
        () => null
      ),
    ]);

    let timetableDocData = ttScopedSnap?.exists() ? ttScopedSnap.data() : null;
    if (!timetableDocData) {
      const legacySnap = await getDoc(doc(db, 'school_timetables', cleanYear)).catch(() => null);
      if (legacySnap?.exists()) timetableDocData = legacySnap.data();
    }

    let mysgAssignments: any[] = [];
    if (mysgSnap?.exists() && Array.isArray(mysgSnap.data()?.items)) {
      mysgAssignments = mysgSnap.data()!.items;
    } else if (cleanYear !== '2026') {
      const mysg2026Snap = await getDoc(
        doc(db, 'mysg_jawatankuasa_assignments', `${cleanSchool}_2026`)
      ).catch(() => null);
      if (mysg2026Snap?.exists() && Array.isArray(mysg2026Snap.data()?.items)) {
        mysgAssignments = mysg2026Snap.data()!.items;
      }
    }

    return computeAcademicAccessFromData({
      currentUser,
      academicYear: cleanYear,
      personnelDocs: personnelSnap ? personnelSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [],
      subjectAllocationDocs: allocSnap
        ? allocSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
        : [],
      classDocs: classesSnap ? classesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [],
      timetableDocData,
      mysgAssignments,
    });
  } catch {
    return computeAcademicAccessFromData({
      currentUser,
      academicYear: cleanYear,
    });
  }
}

/**
 * Reactive React Hook for Academic RBAC permissions across Akademik, Jadual Waktu, PBD/UASA, Analisis & Relief.
 */
export function useAcademicAccessControl(
  currentUser: any,
  academicYear: string = '2026',
  schoolCode: string = DEFAULT_SCHOOL_CODE
): AcademicAccessProfile & { loading: boolean } {
  const cleanSchool = (schoolCode || DEFAULT_SCHOOL_CODE).trim().toUpperCase();
  const cleanYear = String(academicYear || '2026').trim();

  const [personnelDocs, setPersonnelDocs] = useState<any[]>([]);
  const [subjectAllocationDocs, setSubjectAllocationDocs] = useState<any[]>([]);
  const [classDocs, setClassDocs] = useState<any[]>([]);
  const [timetableDocData, setTimetableDocData] = useState<any | null>(null);
  const [mysgAssignments, setMysgAssignments] = useState<any[]>([]);
  const [governanceDocs, setGovernanceDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    // Subscribe to timetable & MySG assignments for live reactivity
    const ttDocRef = doc(db, 'school_timetables', `${cleanSchool}_${cleanYear}`);
    const mysgDocRef = doc(db, 'mysg_jawatankuasa_assignments', `${cleanSchool}_${cleanYear}`);

    const unsubTimetable = onSnapshot(
      ttDocRef,
      async (snap) => {
        if (!active) return;
        if (snap.exists()) {
          setTimetableDocData(snap.data());
        } else {
          const legacySnap = await getDoc(doc(db, 'school_timetables', cleanYear)).catch(
            () => null
          );
          if (active && legacySnap?.exists()) {
            setTimetableDocData(legacySnap.data());
          } else if (active) {
            setTimetableDocData(null);
          }
        }
        if (active) setLoading(false);
      },
      () => {
        if (active) setLoading(false);
      }
    );

    const unsubMysg = onSnapshot(
      mysgDocRef,
      async (snap) => {
        if (!active) return;
        if (snap.exists() && Array.isArray(snap.data()?.items)) {
          setMysgAssignments(snap.data()!.items);
        } else {
          const fallback2026 = await getDoc(
            doc(db, 'mysg_jawatankuasa_assignments', `${cleanSchool}_2026`)
          ).catch(() => null);
          if (active && fallback2026?.exists() && Array.isArray(fallback2026.data()?.items)) {
            setMysgAssignments(fallback2026.data()!.items);
          } else if (active) {
            setMysgAssignments([]);
          }
        }
      },
      () => {}
    );

    // Fetch supporting collections
    Promise.all([
      getDocs(query(collection(db, 'personnel'), where('schoolCode', '==', cleanSchool))).catch(
        () => null
      ),
      getDocs(
        query(collection(db, 'subject_allocations'), where('schoolCode', '==', cleanSchool))
      ).catch(() => null),
      getDocs(query(collection(db, 'classes'), where('schoolCode', '==', cleanSchool))).catch(
        () => null
      ),
      getDocs(
        query(collection(db, 'governance_assignments'), where('schoolCode', '==', cleanSchool))
      ).catch(() => null),
    ]).then(([pSnap, aSnap, cSnap, gSnap]) => {
      if (!active) return;
      if (pSnap) setPersonnelDocs(pSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      if (aSnap) setSubjectAllocationDocs(aSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      if (cSnap) setClassDocs(cSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      if (gSnap) setGovernanceDocs(gSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => {
      active = false;
      unsubTimetable();
      unsubMysg();
    };
  }, [cleanSchool, cleanYear, currentUser?.uid, currentUser?.email, currentUser?.name]);

  const profile = computeAcademicAccessFromData({
    currentUser,
    academicYear: cleanYear,
    personnelDocs,
    subjectAllocationDocs,
    classDocs,
    timetableDocData,
    mysgAssignments,
    governanceDocs,
  });

  return {
    ...profile,
    loading,
  };
}
