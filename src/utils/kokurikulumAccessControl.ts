import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile } from '../types';
import { OFFICIAL_TEACHERS, OfficialTeacherEntry } from '../constants/officialRoster';
import { DEFAULT_SCHOOL_CODE } from '../constants';
import { belongsToSchool, normalizeActiveSchoolCode } from './schoolTenant';

export interface KokurikulumAccessState {
  canManageKokoCommittee: boolean;
  kokoRoleLabel: string;
  isPrincipalOrAdmin: boolean;
  isPKKK: boolean;
  isSetiausahaKoko: boolean;
  loading: boolean;
}

const normalizeText = (value?: string | null): string =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');

const PKKK_REGEX = /\b(PK\s*KOKURIKULUM|GPK\s*KOKURIKULUM|PENOLONG\s+KANAN\s+KOKURIKULUM|PK\s*KK|PKKK)\b/i;
const SU_KOKO_REGEX = /\b(SETIAUSAHA\s+KOKURIKULUM|SETIAUSAHA\s+PKKK|SU\s+KOKURIKULUM|SETIAUSAHA\s+INDUK\s+KOKURIKULUM)\b/i;
const SU_KOKO_CODES = new Set(['JR21', 'JK23-SU-KOKURIKULUM', 'SU_KOKO', 'SU-KOKO']);
const PKKK_CODES = new Set(['PKKK', 'PG04', 'PG04-PK-KOKO', 'GPK_KOKO']);

export function matchesTeacherIdentity(
  candidate: { id?: string; uid?: string; name?: string; email?: string },
  target: {
    teacherId?: string;
    teacherUid?: string;
    teacherName?: string;
    teacherEmail?: string;
  }
): boolean {
  const cId = normalizeText(candidate.id);
  const cUid = normalizeText(candidate.uid);
  const cEmail = normalizeText(candidate.email);
  const cName = normalizeText(candidate.name);

  const tId = normalizeText(target.teacherId);
  const tUid = normalizeText(target.teacherUid);
  const tEmail = normalizeText(target.teacherEmail);
  const tName = normalizeText(target.teacherName);

  if (cUid && (cUid === tUid || cUid === tId)) return true;
  if (cId && (cId === tId || cId === tUid)) return true;
  if (cEmail && tEmail && cEmail === tEmail) return true;
  if (cName && tName && cName === tName) return true;
  return false;
}

export function useKokurikulumAccessControl(
  currentUser: UserProfile | null | undefined,
  academicYear: string = '2026',
  schoolCode?: string
): KokurikulumAccessState {
  const resolvedSchoolCode = normalizeActiveSchoolCode(
    schoolCode || currentUser?.schoolCode || (currentUser as any)?.schoolId || DEFAULT_SCHOOL_CODE
  );

  const [personnelDocs, setPersonnelDocs] = useState<any[]>([]);
  const [mysgAssignments, setMysgAssignments] = useState<any[]>([]);
  const [governanceDocs, setGovernanceDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubs: (() => void)[] = [];

    unsubs.push(
      onSnapshot(
        collection(db, 'personnel'),
        (snap) => {
          setPersonnelDocs(
            snap.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .filter((d) => belongsToSchool(d, resolvedSchoolCode))
          );
        },
        () => {}
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'mysg_jawatankuasa_assignments'),
        (snap) => {
          setMysgAssignments(
            snap.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .filter((d) => belongsToSchool(d, resolvedSchoolCode))
          );
          setLoading(false);
        },
        () => setLoading(false)
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'governance_assignments'),
        (snap) => {
          setGovernanceDocs(
            snap.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .filter((d) => belongsToSchool(d, resolvedSchoolCode))
          );
        },
        () => {}
      )
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [currentUser?.uid, resolvedSchoolCode]);

  const accessState = useMemo<KokurikulumAccessState>(() => {
    if (!currentUser) {
      return {
        canManageKokoCommittee: false,
        kokoRoleLabel: 'Guru Penasihat (Paparan Sahaja)',
        isPrincipalOrAdmin: false,
        isPKKK: false,
        isSetiausahaKoko: false,
        loading,
      };
    }

    const rawRole = normalizeText(currentUser.role);
    const emailLower = String(currentUser.email || '').trim().toLowerCase();
    const isSuperEmail =
      emailLower === 'sjkcchb2026@gmail.com' || emailLower === 'sean3919531@gmail.com';

    const isPrincipalOrAdmin =
      isSuperEmail ||
      rawRole === 'PRINCIPAL' ||
      rawRole === 'ADMIN' ||
      rawRole === 'SYSTEM_ADMIN';

    // Match teacher identity in personnel & OFFICIAL_TEACHERS
    const matchedPersonnel = personnelDocs.find((p) =>
      matchesTeacherIdentity(
        {
          id: (currentUser as any).teacherId || currentUser.uid,
          uid: currentUser.uid,
          name: currentUser.name,
          email: currentUser.email,
        },
        {
          teacherId: p.id || p.teacherId,
          teacherUid: p.uid || p.userId,
          teacherName: p.name || p.fullName,
          teacherEmail: p.email,
        }
      )
    );

    const matchedOfficial = OFFICIAL_TEACHERS.find((t: OfficialTeacherEntry) =>
      matchesTeacherIdentity(
        {
          id: (currentUser as any).teacherId || currentUser.uid,
          uid: currentUser.uid,
          name: currentUser.name,
          email: currentUser.email,
        },
        {
          teacherId: t.id,
          teacherName: t.name,
          teacherEmail: t.email,
        }
      )
    );

    const candidateIdentity = {
      id:
        (currentUser as any).teacherId ||
        matchedPersonnel?.id ||
        matchedOfficial?.id ||
        currentUser.uid,
      uid: currentUser.uid,
      name: currentUser.name || matchedPersonnel?.name || matchedOfficial?.name || '',
      email: currentUser.email || matchedPersonnel?.email || matchedOfficial?.email || '',
    };

    // 1. Check PKKK (Penolong Kanan Kokurikulum)
    const userSubRole = normalizeText(currentUser.subRole);
    const userPrimaryCode = normalizeText((currentUser as any).primaryRoleCode);
    const userPosition = String(
      (currentUser as any).position || (currentUser as any).jawatan || ''
    );
    const personnelSubRole = normalizeText(matchedPersonnel?.subRole || matchedPersonnel?.primaryRoleCode);
    const personnelPosition = String(
      matchedPersonnel?.position || matchedPersonnel?.jawatan || matchedPersonnel?.roleLabel || ''
    );
    const officialSubRole = normalizeText((matchedOfficial as any)?.subRole);
    const officialPosition = String((matchedOfficial as any)?.position || '');

    let isPKKK =
      PKKK_CODES.has(userSubRole) ||
      PKKK_CODES.has(userPrimaryCode) ||
      PKKK_CODES.has(personnelSubRole) ||
      PKKK_CODES.has(officialSubRole) ||
      PKKK_REGEX.test(userPosition) ||
      PKKK_REGEX.test(personnelPosition) ||
      PKKK_REGEX.test(officialPosition);

    // 2. Check Setiausaha Kokurikulum (Setiausaha PKKK) & PKKK in MySG Jawatankuasa / Governance
    const secondaryCodes: string[] = Array.isArray((currentUser as any).secondaryRoleCodes)
      ? (currentUser as any).secondaryRoleCodes.map((c: string) => normalizeText(c))
      : [];

    let isSetiausahaKoko =
      Boolean((currentUser as any).isSetiausahaKoko) ||
      SU_KOKO_CODES.has(userSubRole) ||
      SU_KOKO_CODES.has(userPrimaryCode) ||
      secondaryCodes.some((c) => SU_KOKO_CODES.has(c)) ||
      SU_KOKO_REGEX.test(userPosition) ||
      SU_KOKO_REGEX.test(personnelPosition);

    const targetYear = String(academicYear || '2026').trim();

    // Scan mysg_jawatankuasa_assignments
    for (const docItem of mysgAssignments) {
      const docYear = String(docItem.academicYear || '').trim();
      const docId = String(docItem.id || '');
      const matchesYear =
        !docYear ||
        docYear === targetYear ||
        docYear.includes(targetYear) ||
        docId.includes(targetYear);

      if (!matchesYear) continue;

      const items: any[] = Array.isArray(docItem.assignments)
        ? docItem.assignments
        : Array.isArray(docItem.items)
        ? docItem.items
        : [docItem];

      for (const row of items) {
        const kodMySG = normalizeText(row.kodMySG || row.roleCode || row.code);
        const jawatanText = `${row.jawatanRasmi || ''} ${row.jawatankuasaInduk || ''} ${
          row.entityName || ''
        } ${row.roleTitle || ''}`;

        const isRowPKKK = PKKK_CODES.has(kodMySG) || PKKK_REGEX.test(jawatanText);
        const isRowSUKoko =
          SU_KOKO_CODES.has(kodMySG) ||
          kodMySG.includes('JK23-SU-KOKURIKULUM') ||
          kodMySG === 'JR21' ||
          SU_KOKO_REGEX.test(jawatanText);

        if (!isRowPKKK && !isRowSUKoko) continue;

        const isPrimaryMatch = matchesTeacherIdentity(candidateIdentity, {
          teacherId: row.assignedTeacherId || row.teacherId,
          teacherUid: row.assignedTeacherUid || row.userId,
          teacherName: row.assignedTeacherName || row.teacherName,
          teacherEmail: row.assignedTeacherEmail || row.email,
        });

        if (isPrimaryMatch) {
          if (isRowPKKK) isPKKK = true;
          if (isRowSUKoko) isSetiausahaKoko = true;
        }
      }
    }

    // Scan governance_assignments
    for (const gov of governanceDocs) {
      const govYear = String(gov.academicYear || '').trim();
      if (govYear && govYear !== targetYear && !govYear.includes(targetYear)) continue;

      const isMatchedTeacher = matchesTeacherIdentity(candidateIdentity, {
        teacherId: gov.teacherId || gov.personnelId || gov.assignedTeacherId,
        teacherUid: gov.userId || gov.uid,
        teacherName: gov.teacherName || gov.assignedTeacherName || gov.name,
        teacherEmail: gov.email,
      });

      if (!isMatchedTeacher) continue;

      const code = normalizeText(gov.roleCode || gov.kodMySG || gov.primaryRoleCode);
      const label = `${gov.roleTitle || ''} ${gov.jawatanRasmi || ''} ${gov.entityName || ''} ${
        gov.jawatankuasaInduk || ''
      }`;

      if (PKKK_CODES.has(code) || PKKK_REGEX.test(label)) {
        isPKKK = true;
      }
      if (SU_KOKO_CODES.has(code) || SU_KOKO_REGEX.test(label)) {
        isSetiausahaKoko = true;
      }
    }

    const canManageKokoCommittee = isPrincipalOrAdmin || isPKKK || isSetiausahaKoko;

    let kokoRoleLabel = 'Guru Penasihat (Paparan Sahaja)';
    if (isPrincipalOrAdmin) {
      kokoRoleLabel = 'Guru Besar / Pentadbir (Akses Penuh)';
    } else if (isPKKK) {
      kokoRoleLabel = 'PK Kokurikulum / PKKK (Akses Penuh)';
    } else if (isSetiausahaKoko) {
      kokoRoleLabel = 'Setiausaha Kokurikulum / SU PKKK (Akses Penuh)';
    }

    return {
      canManageKokoCommittee,
      kokoRoleLabel,
      isPrincipalOrAdmin,
      isPKKK,
      isSetiausahaKoko,
      loading,
    };
  }, [currentUser, personnelDocs, mysgAssignments, governanceDocs, academicYear, loading]);

  // Sync detected PKKK / Setiausaha Kokurikulum flags onto users/{uid} so Firestore security rules can verify on write
  useEffect(() => {
    if (!currentUser?.uid) return;
    if (!accessState.isPKKK && !accessState.isSetiausahaKoko) return;

    const needsSync =
      (accessState.isSetiausahaKoko && !(currentUser as any).isSetiausahaKoko) ||
      (accessState.isPKKK && currentUser.subRole !== 'PKKK');

    if (!needsSync) return;

    const payload: Record<string, any> = {};
    if (accessState.isSetiausahaKoko) {
      payload.isSetiausahaKoko = true;
    }
    if (accessState.isPKKK && !currentUser.subRole) {
      payload.subRole = 'PKKK';
    }

    if (Object.keys(payload).length > 0) {
      setDoc(doc(db, 'users', currentUser.uid), payload, { merge: true }).catch(() => {
        // Ignore non-critical sync errors
      });
    }
  }, [currentUser?.uid, accessState.isPKKK, accessState.isSetiausahaKoko]);

  return accessState;
}
