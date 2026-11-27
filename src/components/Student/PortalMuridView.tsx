import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  UserProfile,
  SchoolSettings,
  KokoGroup,
  KokoMembership,
  KokoActivity,
} from '../../types';
import { SchoolLogo } from '../SchoolLogo';
import {
  BookOpen,
  ShieldAlert,
  Trophy,
  LogOut,
  GraduationCap,
  Award,
  CheckCircle2,
  Calendar,
  Sparkles,
  UserCheck,
  Clock,
  Info,
  Medal,
  Star,
  Printer,
} from 'lucide-react';
import { getRuntimeActiveSchoolCode, belongsToSchool } from '../../utils/schoolTenant';
import {
  PrasekolahAssessmentDoc,
  isPrasekolahStudentRecord,
  resolvePrasekolahStudentAge,
  normalizePrasekolahGrade,
  normalizePrasekolahTerm,
  printPrasekolahSlipsA4,
} from '../../utils/prasekolahAssessmentHelper';
import { PrasekolahSlipCard } from '../Academic/PrasekolahSlipCard';

interface PortalMuridViewProps {
  currentUser: UserProfile;
  schoolSettings: SchoolSettings | null;
  onLogout: () => void;
}

const SUBJECT_LABELS: Record<string, { ms: string; zh: string }> = {
  BM: { ms: 'Bahasa Melayu', zh: '国文' },
  BC: { ms: 'Bahasa Cina', zh: '华文' },
  BI: { ms: 'Bahasa Inggeris', zh: '英文' },
  MT: { ms: 'Matematik', zh: '数学' },
  SC: { ms: 'Sains', zh: '科学' },
  SN: { ms: 'Sains', zh: '科学' },
  SEJ: { ms: 'Sejarah', zh: '历史' },
  PM: { ms: 'Pendidikan Moral', zh: '道德教育' },
  PI: { ms: 'Pendidikan Islam', zh: '伊斯兰教育' },
  PJPK: { ms: 'Pendidikan Jasmani & Kesihatan', zh: '体育与健康教育' },
  PJK: { ms: 'Pendidikan Jasmani & Kesihatan', zh: '体育与健康教育' },
  PJ: { ms: 'Pendidikan Jasmani', zh: '体育' },
  PK: { ms: 'Pendidikan Kesihatan', zh: '体健' },
  PSV: { ms: 'Pendidikan Seni Visual', zh: '美术' },
  MZ: { ms: 'Pendidikan Muzik', zh: '音乐' },
  RBT: { ms: 'Reka Bentuk dan Teknologi', zh: '设计与工艺' },
};

const TP_DESCRIPTORS: Record<number, { label: string; colorClass: string; desc: string }> = {
  1: {
    label: 'TP1',
    colorClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    desc: 'Tahu (Mengetahui perkara asas)',
  },
  2: {
    label: 'TP2',
    colorClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    desc: 'Tahu dan Faham',
  },
  3: {
    label: 'TP3',
    colorClass: 'bg-yellow-500/20 text-yellow-200 border-yellow-500/40',
    desc: 'Tahu, Faham dan Boleh Buat',
  },
  4: {
    label: 'TP4',
    colorClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    desc: 'Tahu, Faham dan Boleh Buat dengan Beradab',
  },
  5: {
    label: 'TP5',
    colorClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    desc: 'Tahu, Faham dan Boleh Buat dengan Beradab Terpuji',
  },
  6: {
    label: 'TP6',
    colorClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    desc: 'Tahu, Faham dan Boleh Buat dengan Beradab Mithali',
  },
};

function cleanIcString(val?: string | null): string {
  return String(val || '').replace(/[\s-]/g, '').trim().toUpperCase();
}

function normalizeName(val?: string | null): string {
  return String(val || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function formatAssessmentDate(val: any): string {
  if (!val) return '-';
  try {
    if (typeof val === 'string') {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' });
      }
      return val;
    }
    if (val?.toDate) {
      return val.toDate().toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    if (typeof val?.seconds === 'number') {
      return new Date(val.seconds * 1000).toLocaleDateString('ms-MY', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    }
  } catch {
    // ignore
  }
  return '-';
}

// PAJSK Scoring Reference (KPM Primary School Standard)
const JAWATAN_POINTS: Record<string, number> = {
  PENGERUSI: 10,
  PRESIDEN: 10,
  KETUA: 10,
  'NAIB PENGERUSI': 8,
  'TIMBALAN PENGERUSI': 8,
  SETIAUSAHA: 8,
  BENDAHARI: 8,
  'PENOLONG SETIAUSAHA': 7,
  'NAIB SETIAUSAHA': 7,
  'PENOLONG BENDAHARI': 7,
  'NAIB BENDAHARI': 7,
  AJK: 6,
  'AHLI JAWATANKUASA': 6,
  'AHLI AKTIF': 4,
  'AHLI BIASA': 2,
  AHLI: 2,
};

const PENGLIBATAN_POINTS: Record<string, number> = {
  ANTARABANGSA: 20,
  KEBANGSAAN: 17,
  NEGERI: 14,
  BAHAGIAN: 12,
  ZON: 11,
  DAERAH: 11,
  'DAERAH/ZON': 11,
  SEKOLAH: 8,
};

const PENCAPAIAN_POINTS: Record<string, Record<string, number>> = {
  ANTARABANGSA: { JOHAN: 20, 'NAIB JOHAN': 19, KETIGA: 18 },
  KEBANGSAAN: { JOHAN: 17, 'NAIB JOHAN': 16, KETIGA: 15 },
  NEGERI: { JOHAN: 14, 'NAIB JOHAN': 13, KETIGA: 12 },
  BAHAGIAN: { JOHAN: 11, 'NAIB JOHAN': 10, KETIGA: 9 },
  DAERAH: { JOHAN: 11, 'NAIB JOHAN': 10, KETIGA: 9 },
  'DAERAH/ZON': { JOHAN: 11, 'NAIB JOHAN': 10, KETIGA: 9 },
  ZON: { JOHAN: 11, 'NAIB JOHAN': 10, KETIGA: 9 },
  SEKOLAH: { JOHAN: 8, 'NAIB JOHAN': 7, KETIGA: 6 },
};

export const PortalMuridView: React.FC<PortalMuridViewProps> = ({
  currentUser,
  schoolSettings,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<'AKADEMIK' | 'DISIPLIN' | 'KOKURIKULUM'>('AKADEMIK');
  const [selectedTerm, setSelectedTerm] = useState<1 | 2>(1);

  const [studentMasterRecord, setStudentMasterRecord] = useState<any | null>(null);
  const [enrolledRecords, setEnrolledRecords] = useState<any[]>([]);
  const [pbdResults, setPbdResults] = useState<any[]>([]);
  const [prasekolahResults, setPrasekolahResults] = useState<any[]>([]);
  const [kokoGroups, setKokoGroups] = useState<KokoGroup[]>([]);
  const [kokoMemberships, setKokoMemberships] = useState<KokoMembership[]>([]);
  const [kokoCommittees, setKokoCommittees] = useState<any[]>([]);
  const [kokoAttendance, setKokoAttendance] = useState<any[]>([]);
  const [kokoActivities, setKokoActivities] = useState<KokoActivity[]>([]);

  const cleanedUserIc = useMemo(() => {
    const fromNoKp = cleanIcString(currentUser.noKp || currentUser.icNumber || currentUser.ic);
    if (fromNoKp) return fromNoKp;
    const emailPrefix = String(currentUser.email || '').split('@')[0];
    return cleanIcString(emailPrefix);
  }, [currentUser]);

  // 1. Load Student Master & Enrollment Records matching this student
  useEffect(() => {
    const activeCode = currentUser.schoolCode || getRuntimeActiveSchoolCode();

    const unsubMaster = onSnapshot(
      collection(db, 'student_master'),
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((d) => belongsToSchool(d, activeCode));

        const matched = docs.find((d) => {
          if (currentUser.studentId && (d.id === currentUser.studentId || d.student_id === currentUser.studentId)) {
            return true;
          }
          const docIc = cleanIcString(d.noKp || d.icNumber || d.ic || d.mykid);
          if (cleanedUserIc && docIc && docIc === cleanedUserIc) {
            return true;
          }
          return false;
        });

        if (matched) {
          setStudentMasterRecord(matched);
        }
      },
      (err) => console.warn('PortalMurid student_master listener:', err)
    );

    const unsubStudents = onSnapshot(
      collection(db, 'students'),
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((d) => belongsToSchool(d, activeCode));
        setEnrolledRecords(docs);
      },
      (err) => console.warn('PortalMurid students listener:', err)
    );

    return () => {
      unsubMaster();
      unsubStudents();
    };
  }, [currentUser.schoolCode, currentUser.studentId, cleanedUserIc]);

  // Candidate IDs and student profile info
  const resolvedStudentInfo = useMemo(() => {
    const targetNameNorm = normalizeName(studentMasterRecord?.name || currentUser.name);

    const matchingEnrollments = enrolledRecords.filter((r) => {
      const rIc = cleanIcString(r.noKp || r.icNumber || r.ic);
      if (cleanedUserIc && rIc && rIc === cleanedUserIc) return true;
      if (currentUser.studentId && (r.id === currentUser.studentId || r.student_id === currentUser.studentId)) {
        return true;
      }
      if (
        studentMasterRecord &&
        (r.student_id === studentMasterRecord.student_id ||
          r.student_id === studentMasterRecord.id ||
          (studentMasterRecord.apdmId && r.apdmId === studentMasterRecord.apdmId))
      ) {
        return true;
      }
      if (targetNameNorm && normalizeName(r.name) === targetNameNorm) return true;
      return false;
    });

    const latestEnrollment = matchingEnrollments[0] || null;

    const candidateIds = new Set<string>();
    if (currentUser.studentId) candidateIds.add(String(currentUser.studentId));
    if (currentUser.student_id) candidateIds.add(String(currentUser.student_id));
    if (cleanedUserIc) candidateIds.add(cleanedUserIc);
    if (studentMasterRecord?.id) candidateIds.add(String(studentMasterRecord.id));
    if (studentMasterRecord?.student_id) candidateIds.add(String(studentMasterRecord.student_id));
    if (studentMasterRecord?.apdmId) candidateIds.add(String(studentMasterRecord.apdmId));
    matchingEnrollments.forEach((e) => {
      if (e.id) candidateIds.add(String(e.id));
      if (e.student_id) candidateIds.add(String(e.student_id));
      if (e.apdmId) candidateIds.add(String(e.apdmId));
    });

    const displayName =
      studentMasterRecord?.name || latestEnrollment?.name || currentUser.name || 'Murid';
    const displayClass =
      studentMasterRecord?.currentClass ||
      studentMasterRecord?.className ||
      studentMasterRecord?.class ||
      latestEnrollment?.class ||
      latestEnrollment?.className ||
      currentUser.className ||
      currentUser.class_assigned ||
      '-';
    const displayNoKp =
      cleanedUserIc ||
      cleanIcString(studentMasterRecord?.noKp || studentMasterRecord?.icNumber || latestEnrollment?.icNumber) ||
      '-';
    const academicYear =
      latestEnrollment?.academic_year ||
      studentMasterRecord?.academic_year ||
      currentUser.academic_year ||
      new Date().getFullYear().toString();

    return {
      candidateIds,
      displayName,
      displayClass,
      displayNoKp,
      academicYear,
      targetNameNorm: normalizeName(displayName),
      rawRecord: studentMasterRecord || latestEnrollment || null,
    };
  }, [currentUser, studentMasterRecord, enrolledRecords, cleanedUserIc]);

  // 2. Load PBD Results & Kokurikulum collections
  useEffect(() => {
    const activeCode = currentUser.schoolCode || getRuntimeActiveSchoolCode();

    const unsubPbd = onSnapshot(
      collection(db, 'pbd_results'),
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((d) => belongsToSchool(d, activeCode));
        setPbdResults(docs);
      },
      (err) => console.warn('PortalMurid pbd_results listener:', err)
    );

    const unsubGroups = onSnapshot(
      collection(db, 'koko_groups'),
      (snap) => {
        setKokoGroups(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as any) } as KokoGroup))
            .filter((d) => belongsToSchool(d as any, activeCode))
        );
      },
      (err) => console.warn('PortalMurid koko_groups listener:', err)
    );

    const unsubMembers = onSnapshot(
      collection(db, 'koko_memberships'),
      (snap) => {
        setKokoMemberships(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as any) } as KokoMembership))
            .filter((d) => belongsToSchool(d as any, activeCode))
        );
      },
      (err) => console.warn('PortalMurid koko_memberships listener:', err)
    );

    const unsubCommittees = onSnapshot(
      collection(db, 'koko_committees'),
      (snap) => {
        setKokoCommittees(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as any) }))
            .filter((d) => belongsToSchool(d as any, activeCode))
        );
      },
      (err) => console.warn('PortalMurid koko_committees listener:', err)
    );

    const unsubAtt = onSnapshot(
      collection(db, 'koko_attendance'),
      (snap) => {
        setKokoAttendance(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as any) }))
            .filter((d) => belongsToSchool(d as any, activeCode))
        );
      },
      (err) => console.warn('PortalMurid koko_attendance listener:', err)
    );

    const unsubAct = onSnapshot(
      collection(db, 'koko_activities'),
      (snap) => {
        setKokoActivities(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as any) } as KokoActivity))
            .filter((d) => belongsToSchool(d as any, activeCode))
        );
      },
      (err) => console.warn('PortalMurid koko_activities listener:', err)
    );

    const unsubPrasekolah = onSnapshot(
      collection(db, 'prasekolah_assessments'),
      (snap) => {
        setPrasekolahResults(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as any) }))
            .filter((d) => belongsToSchool(d as any, activeCode))
        );
      },
      (err) => console.warn('PortalMurid prasekolah_assessments listener:', err)
    );

    return () => {
      unsubPbd();
      unsubGroups();
      unsubMembers();
      unsubCommittees();
      unsubAtt();
      unsubAct();
      unsubPrasekolah();
    };
  }, [currentUser.schoolCode]);

  // Detect if this student is a Prasekolah student or has a Prasekolah assessment record
  const myPrasekolahDocs = useMemo(() => {
    const { candidateIds, displayNoKp, targetNameNorm } = resolvedStudentInfo;
    return prasekolahResults.filter((r) => {
      const sid = String(r.studentId || r.student_id || '');
      const ric = cleanIcString(r.noKp || r.icNumber || r.ic);
      if (sid && candidateIds.has(sid)) return true;
      if (ric && displayNoKp !== '-' && ric === displayNoKp) return true;
      if (targetNameNorm && r.studentName && normalizeName(r.studentName) === targetNameNorm) {
        return true;
      }
      return false;
    });
  }, [prasekolahResults, resolvedStudentInfo]);

  const isPrasekolahMurid = useMemo(() => {
    if (myPrasekolahDocs.length > 0) return true;
    if (isPrasekolahStudentRecord(resolvedStudentInfo.rawRecord)) return true;
    if (isPrasekolahStudentRecord({ className: resolvedStudentInfo.displayClass })) return true;
    return false;
  }, [myPrasekolahDocs, resolvedStudentInfo]);

  const studentPrasekolahSlipForTerm = useMemo<PrasekolahAssessmentDoc | null>(() => {
    if (!isPrasekolahMurid) return null;
    const targetTermLabel = selectedTerm === 2 ? 'Penggal 2' : 'Penggal 1';
    const matchedDoc = myPrasekolahDocs.find(
      (d) => normalizePrasekolahTerm(d.term) === targetTermLabel
    );
    const defaultAge = resolvePrasekolahStudentAge(
      resolvedStudentInfo.rawRecord,
      resolvedStudentInfo.academicYear
    );

    if (matchedDoc) {
      return {
        id: matchedDoc.id,
        schoolCode: currentUser.schoolCode || getRuntimeActiveSchoolCode(),
        academicYear: matchedDoc.academicYear || resolvedStudentInfo.academicYear,
        term: targetTermLabel,
        studentId: String(matchedDoc.studentId || currentUser.studentId || ''),
        studentName: matchedDoc.studentName || resolvedStudentInfo.displayName,
        noKp: matchedDoc.noKp || resolvedStudentInfo.displayNoKp,
        age: Number(matchedDoc.age) === 5 ? 5 : 6,
        akademik: {
          bm: normalizePrasekolahGrade(matchedDoc.akademik?.bm),
          bc: normalizePrasekolahGrade(matchedDoc.akademik?.bc),
          bi: normalizePrasekolahGrade(matchedDoc.akademik?.bi),
          mt: normalizePrasekolahGrade(matchedDoc.akademik?.mt),
        },
        sikapNilai: {
          disiplin: normalizePrasekolahGrade(matchedDoc.sikapNilai?.disiplin),
          sosial: normalizePrasekolahGrade(matchedDoc.sikapNilai?.sosial),
          keyakinanDiri: normalizePrasekolahGrade(matchedDoc.sikapNilai?.keyakinanDiri),
          rajin: normalizePrasekolahGrade(matchedDoc.sikapNilai?.rajin),
        },
        kedudukan: matchedDoc.kedudukan ?? '',
        jumlahMurid: Number(matchedDoc.jumlahMurid || 0),
      };
    }

    return {
      id: `pra_${resolvedStudentInfo.displayNoKp}_${selectedTerm}`,
      schoolCode: currentUser.schoolCode || getRuntimeActiveSchoolCode(),
      academicYear: resolvedStudentInfo.academicYear,
      term: targetTermLabel,
      studentId: String(currentUser.studentId || resolvedStudentInfo.displayNoKp),
      studentName: resolvedStudentInfo.displayName,
      noKp: resolvedStudentInfo.displayNoKp,
      age: defaultAge,
      akademik: { bm: '', bc: '', bi: '', mt: '' },
      sikapNilai: { disiplin: '', sosial: '', keyakinanDiri: '', rajin: '' },
      kedudukan: '',
      jumlahMurid: 0,
    };
  }, [isPrasekolahMurid, myPrasekolahDocs, selectedTerm, resolvedStudentInfo, currentUser]);

  // Filter PBD results for this student & selected term
  const studentPbdForTerm = useMemo(() => {
    const { candidateIds, displayNoKp, targetNameNorm } = resolvedStudentInfo;

    const allMine = pbdResults.filter((r) => {
      const sid = String(r.student_id || r.studentId || '');
      const ric = cleanIcString(r.noKp || r.icNumber || r.ic);
      if (sid && candidateIds.has(sid)) return true;
      if (ric && displayNoKp !== '-' && ric === displayNoKp) return true;
      if (targetNameNorm && r.studentName && normalizeName(r.studentName) === targetNameNorm) return true;
      return false;
    });

    // Match selectedTerm (1 or 2). Records without a `term` field default to Penggal 1
    const termFiltered = allMine.filter((r) => {
      const t = Number(r.term || 1);
      return t === selectedTerm;
    });

    // Deduplicate by subject_id (keep latest)
    const bySubject = new Map<string, any>();
    termFiltered.forEach((r) => {
      const code = String(r.subject_id || r.subjectCode || r.subject || 'UMUM').toUpperCase();
      bySubject.set(code, r);
    });

    return Array.from(bySubject.values()).sort((a, b) =>
      String(a.subject_id || '').localeCompare(String(b.subject_id || ''))
    );
  }, [pbdResults, resolvedStudentInfo, selectedTerm]);

  // Resolve student's Kokurikulum memberships & committee positions
  const studentKokoUnits = useMemo(() => {
    const { candidateIds, targetNameNorm, displayNoKp, rawRecord } = resolvedStudentInfo;

    const myMembershipDocs = kokoMemberships.filter((m: any) => {
      const sid = String(m.student_id || m.studentId || m.id || '');
      if (sid && candidateIds.has(sid)) return true;
      const mic = cleanIcString(m.noKp || m.icNumber);
      if (mic && displayNoKp !== '-' && mic === displayNoKp) return true;
      if (targetNameNorm && (m.name || m.studentName) && normalizeName(m.name || m.studentName) === targetNameNorm) {
        return true;
      }
      return false;
    });

    const primaryMembership: any = myMembershipDocs[0] || null;

    const getGroupName = (groupId?: string | null) => {
      if (!groupId) return null;
      const g = kokoGroups.find((grp) => grp.id === groupId || grp.name === groupId);
      return g ? g.name : groupId;
    };

    const getStudentPositionInGroup = (groupId?: string | null, categoryKey?: string, fallbackRole?: string) => {
      if (!groupId) return fallbackRole || 'Belum Didaftarkan';

      // Check KokoCommitteeMember rows (where type === 'student' and personId / name matches)
      const memberCommitteeEntry = kokoCommittees.find((c: any) => {
        const matchesGroup =
          c.groupId === groupId ||
          c.group_id === groupId ||
          (c.groupName && normalizeName(c.groupName) === normalizeName(getGroupName(groupId))) ||
          (categoryKey && c.category === categoryKey);
        if (!matchesGroup) return false;
        if (c.type === 'student' || c.personId || c.role) {
          return (
            (c.personId && candidateIds.has(String(c.personId))) ||
            (targetNameNorm && c.name && normalizeName(c.name) === targetNameNorm)
          );
        }
        return false;
      });

      if (memberCommitteeEntry?.role) {
        return memberCommitteeEntry.subRole
          ? `${memberCommitteeEntry.role} (${memberCommitteeEntry.subRole})`
          : memberCommitteeEntry.role;
      }

      // Check legacy object-based KokoCommittee doc
      const legacyComm = kokoCommittees.find((c: any) => c.group_id === groupId || c.groupId === groupId);
      if (legacyComm) {
        const checkMatch = (val?: string) =>
          Boolean(val && (candidateIds.has(String(val)) || normalizeName(val) === targetNameNorm));
        if (checkMatch(legacyComm.pengerusi)) return 'Pengerusi';
        if (checkMatch(legacyComm.naib_pengerusi)) return 'Naib Pengerusi';
        if (checkMatch(legacyComm.setiausaha)) return 'Setiausaha';
        if (checkMatch(legacyComm.naib_setiausaha)) return 'Penolong Setiausaha';
        if (checkMatch(legacyComm.bendahari)) return 'Bendahari';
        if (checkMatch(legacyComm.naib_bendahari)) return 'Penolong Bendahari';
        if (Array.isArray(legacyComm.ajk) && legacyComm.ajk.some((a: any) => checkMatch(String(a)))) {
          return 'Ahli Jawatankuasa (AJK)';
        }
      }

      return fallbackRole || 'Ahli Biasa';
    };

    // Resolve unit per category ('uniform', 'club', 'sport') from either single doc or category-specific docs
    const resolveUnitForCat = (cat: 'uniform' | 'club' | 'sport', idField: string) => {
      const catDoc: any = myMembershipDocs.find((m: any) => m.category === cat);
      const unitIdOrName =
        catDoc?.groupId ||
        catDoc?.groupName ||
        primaryMembership?.[cat] ||
        primaryMembership?.[idField] ||
        (rawRecord as any)?.[cat] ||
        (rawRecord as any)?.[idField] ||
        null;
      const roleFromMembership =
        catDoc?.position ||
        primaryMembership?.[`${cat}_role`] ||
        primaryMembership?.position ||
        undefined;
      return { unitIdOrName, roleFromMembership };
    };

    const uniformInfo = resolveUnitForCat('uniform', 'uniform_id');
    const clubInfo = resolveUnitForCat('club', 'club_id');
    const sportInfo = resolveUnitForCat('sport', 'sport_id');

    return [
      {
        categoryKey: 'UNIFORM',
        categoryLabel: 'Unit Beruniform',
        categoryZh: '制服团体',
        groupId: uniformInfo.unitIdOrName,
        unitName: getGroupName(uniformInfo.unitIdOrName) || 'Belum Didaftarkan',
        jawatan: uniformInfo.unitIdOrName
          ? getStudentPositionInGroup(uniformInfo.unitIdOrName, 'uniform', uniformInfo.roleFromMembership)
          : 'Tiada Rekod',
      },
      {
        categoryKey: 'CLUB',
        categoryLabel: 'Kelab & Persatuan',
        categoryZh: '学会与社团',
        groupId: clubInfo.unitIdOrName,
        unitName: getGroupName(clubInfo.unitIdOrName) || 'Belum Didaftarkan',
        jawatan: clubInfo.unitIdOrName
          ? getStudentPositionInGroup(clubInfo.unitIdOrName, 'club', clubInfo.roleFromMembership)
          : 'Tiada Rekod',
      },
      {
        categoryKey: 'SPORT',
        categoryLabel: 'Sukan & Permainan',
        categoryZh: '运动与球类',
        groupId: sportInfo.unitIdOrName,
        unitName: getGroupName(sportInfo.unitIdOrName) || 'Belum Didaftarkan',
        jawatan: sportInfo.unitIdOrName
          ? getStudentPositionInGroup(sportInfo.unitIdOrName, 'sport', sportInfo.roleFromMembership)
          : 'Tiada Rekod',
      },
    ];
  }, [kokoMemberships, kokoGroups, kokoCommittees, resolvedStudentInfo]);

  // Resolve student's Competition & Achievement records from koko_activities
  const studentCompetitions = useMemo(() => {
    const { candidateIds, targetNameNorm, displayNoKp } = resolvedStudentInfo;

    return kokoActivities
      .filter((act: any) => {
        if (Array.isArray(act.studentIds) && act.studentIds.some((id: string) => candidateIds.has(String(id)))) {
          return true;
        }
        if (
          Array.isArray(act.studentNames) &&
          targetNameNorm &&
          act.studentNames.some((n: string) => normalizeName(n) === targetNameNorm)
        ) {
          return true;
        }
        if (
          Array.isArray(act.pencapaianDetails) &&
          act.pencapaianDetails.some(
            (p: any) =>
              (p.studentId && candidateIds.has(String(p.studentId))) ||
              (targetNameNorm && p.studentName && normalizeName(p.studentName) === targetNameNorm) ||
              (displayNoKp !== '-' && cleanIcString(p.noKp || p.icNumber) === displayNoKp)
          )
        ) {
          return true;
        }
        return false;
      })
      .map((act: any) => {
        const personalDetail = Array.isArray(act.pencapaianDetails)
          ? act.pencapaianDetails.find(
              (p: any) =>
                (p.studentId && candidateIds.has(String(p.studentId))) ||
                (targetNameNorm && p.studentName && normalizeName(p.studentName) === targetNameNorm)
            )
          : null;

        return {
          id: act.id,
          programName: act.programName || 'Pertandingan Kokurikulum',
          unitName: act.unit || act.unitName || act.category || 'Kokurikulum',
          level: act.level || 'Sekolah',
          date: act.date || '-',
          achievement: personalDetail?.achievement || act.pencapaian || 'Penyertaan',
        };
      })
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [kokoActivities, resolvedStudentInfo]);

  // Compute or extract PAJSK Current Score Breakdown
  const pajskSummary = useMemo(() => {
    const { candidateIds, rawRecord } = resolvedStudentInfo;

    const explicitPajsk = (rawRecord as any)?.pajsk || (rawRecord as any)?.pajskScore || null;

    let presentCount = 0;
    let totalSessions = 0;

    kokoAttendance.forEach((att: any) => {
      if (att.attendance && typeof att.attendance === 'object') {
        for (const cid of candidateIds) {
          if (att.attendance[cid] !== undefined) {
            totalSessions += 1;
            if (att.attendance[cid] === '1' || att.attendance[cid] === 'x') {
              presentCount += 1;
            }
            break;
          }
        }
      } else if (att.student_id && candidateIds.has(String(att.student_id))) {
        totalSessions += 1;
        if (att.status === 'present' || att.status === 'late' || att.status === 'excused') {
          presentCount += 1;
        }
      }
    });

    const hasAnyUnit = studentKokoUnits.some((u) => Boolean(u.groupId));
    const hasAnyAttendance = totalSessions > 0;
    const hasAnyCompetition = studentCompetitions.length > 0;

    const kehadiranScore: number | null =
      explicitPajsk?.kehadiran !== undefined
        ? Number(explicitPajsk.kehadiran)
        : hasAnyAttendance
        ? Math.min(40, Math.round((presentCount / Math.max(totalSessions, 12)) * 40))
        : null;

    const jawatanScore: number | null =
      explicitPajsk?.jawatan !== undefined
        ? Number(explicitPajsk.jawatan)
        : hasAnyUnit
        ? Math.max(
            ...studentKokoUnits.map((u) => {
              const jUpper = String(u.jawatan || '').toUpperCase();
              for (const [key, pts] of Object.entries(JAWATAN_POINTS)) {
                if (jUpper.includes(key)) return pts;
              }
              return u.groupId ? 2 : 0;
            })
          )
        : null;

    const penglibatanScore: number | null =
      explicitPajsk?.penglibatan !== undefined
        ? Number(explicitPajsk.penglibatan)
        : hasAnyCompetition
        ? Math.max(
            ...studentCompetitions.map((c) => {
              const lvl = String(c.level || 'SEKOLAH').toUpperCase();
              return PENGLIBATAN_POINTS[lvl] || 8;
            })
          )
        : null;

    const pencapaianScore: number | null =
      explicitPajsk?.pencapaian !== undefined
        ? Number(explicitPajsk.pencapaian)
        : hasAnyCompetition
        ? Math.max(
            ...studentCompetitions.map((c) => {
              const lvl = String(c.level || 'SEKOLAH').toUpperCase();
              const ach = String(c.achievement || '').toUpperCase();
              const mapForLvl = PENCAPAIAN_POINTS[lvl] || PENCAPAIAN_POINTS.SEKOLAH;
              if (ach.includes('NAIB JOHAN') || ach.includes('KEDUA')) return mapForLvl['NAIB JOHAN'];
              if (ach.includes('JOHAN') || ach.includes('PERTAMA') || ach.includes('EMAS')) return mapForLvl.JOHAN;
              if (ach.includes('KETIGA') || ach.includes('GANGSA')) return mapForLvl.KETIGA;
              return 0;
            })
          )
        : null;

    const hasAnyRecordedComponent =
      kehadiranScore !== null ||
      jawatanScore !== null ||
      penglibatanScore !== null ||
      pencapaianScore !== null ||
      explicitPajsk?.total !== undefined;

    const totalScore: number | null =
      explicitPajsk?.total !== undefined
        ? Number(explicitPajsk.total)
        : hasAnyRecordedComponent
        ? (kehadiranScore || 0) + (jawatanScore || 0) + (penglibatanScore || 0) + (pencapaianScore || 0)
        : null;

    const computeGrade = (score: number | null): string => {
      if (score === null) return 'Belum Dikemaskini';
      if (score >= 80) return 'A (Cemerlang)';
      if (score >= 60) return 'B (Kepujian)';
      if (score >= 40) return 'C (Memuaskan)';
      if (score > 0) return 'D (Sederhana)';
      return 'Belum Dikemaskini';
    };

    return {
      kehadiranScore,
      presentCount,
      totalSessions,
      jawatanScore,
      penglibatanScore,
      pencapaianScore,
      totalScore,
      gred: explicitPajsk?.gred || computeGrade(totalScore),
      hasAnyRecordedComponent,
    };
  }, [resolvedStudentInfo, kokoAttendance, studentKokoUnits, studentCompetitions]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Bar */}
      <header className="bg-slate-900/90 border-b border-slate-800 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <SchoolLogo
              className="w-11 h-11 shrink-0"
              src={schoolSettings?.schoolLogo || schoolSettings?.logoUrl}
              schoolCode={schoolSettings?.schoolCode || currentUser.schoolCode}
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Portal Murid
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Sesi {resolvedStudentInfo.academicYear}
                </span>
              </div>
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
                {schoolSettings?.schoolName || 'SJK (C) CHUNG HUA BALINGIAN'}
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900/70 text-rose-200 border border-rose-800/50 text-xs font-semibold transition"
          >
            <LogOut className="w-4 h-4 text-rose-400" />
            <span>Log Keluar</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 space-y-6">
        {/* Student Identity Banner Card */}
        <section className="bg-gradient-to-r from-indigo-950/80 via-slate-900 to-blue-950/80 border border-indigo-800/40 rounded-3xl p-5 sm:p-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center space-x-4">
              <div className="w-14 h-14 rounded-2xl bg-indigo-600/25 border border-indigo-500/40 flex items-center justify-center text-indigo-300 shrink-0">
                <GraduationCap className="w-8 h-8" />
              </div>
              <div>
                <p className="text-xs text-indigo-300 font-medium">Selamat Datang ke Portal Murid</p>
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-0.5">
                  {resolvedStudentInfo.displayName}
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-700 text-slate-200 font-medium">
                    <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Kelas: <strong className="text-white">{resolvedStudentInfo.displayClass}</strong></span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-700 text-slate-300 font-mono">
                    <span>No. MyKid / KP: <strong className="text-indigo-300">{resolvedStudentInfo.displayNoKp}</strong></span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center bg-slate-950/70 border border-slate-800 px-3.5 py-2 rounded-2xl text-xs text-slate-300">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Rekod Rasmi Murid (Paparan Sahaja)</span>
            </div>
          </div>
        </section>

        {/* 3 Core Navigation Tabs */}
        <nav className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-slate-900/90 p-2 rounded-2xl border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('AKADEMIK')}
            className={`flex items-center justify-center space-x-2.5 py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold transition ${
              activeTab === 'AKADEMIK'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            <span>1. Akademik (PBD)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('DISIPLIN')}
            className={`flex items-center justify-center space-x-2.5 py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold transition ${
              activeTab === 'DISIPLIN'
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>2. Disiplin dan Sahsiah Murid</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('KOKURIKULUM')}
            className={`flex items-center justify-center space-x-2.5 py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold transition ${
              activeTab === 'KOKURIKULUM'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Trophy className="w-4 h-4 shrink-0" />
            <span>3. Kokurikulum & PAJSK</span>
          </button>
        </nav>

        {/* TAB 1: AKADEMIK (PBD OR PRASEKOLAH INSPIRASI) */}
        {activeTab === 'AKADEMIK' && (
          <section className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-blue-400" />
                    <span>
                      {isPrasekolahMurid
                        ? 'PRASEKOLAH INSPIRASI — Rekod Pentaksiran dan Perkembangan Murid'
                        : 'Keputusan Pentaksiran Bilik Darjah (PBD)'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    {isPrasekolahMurid
                      ? 'Slip Rekod Pencapaian Akademik (BM, BC, BI, Matematik), Kedudukan Akademik, serta Sikap dan Nilai'
                      : 'Tahap Penguasaan (TP1 - TP6) dan Ulasan Guru Mata Pelajaran bagi Sesi Semasa'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-center">
                  {/* Penggal 1 / Penggal 2 Switcher */}
                  <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setSelectedTerm(1)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        selectedTerm === 1
                          ? 'bg-blue-600 text-white shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Penggal 1
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedTerm(2)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        selectedTerm === 2
                          ? 'bg-blue-600 text-white shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Penggal 2
                    </button>
                  </div>

                  {isPrasekolahMurid && studentPrasekolahSlipForTerm && (
                    <button
                      type="button"
                      onClick={() =>
                        printPrasekolahSlipsA4([studentPrasekolahSlipForTerm], {
                          schoolName:
                            schoolSettings?.schoolName || 'SJK Chung Hua Balingian',
                          schoolCode:
                            schoolSettings?.schoolCode || currentUser.schoolCode || 'YCC3404',
                          schoolLogo:
                            schoolSettings?.schoolLogo || schoolSettings?.logoUrl || '',
                          academicYear: studentPrasekolahSlipForTerm.academicYear,
                          term: studentPrasekolahSlipForTerm.term,
                        })
                      }
                      className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase tracking-wide inline-flex items-center gap-1.5 shadow transition cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Cetak Slip A4</span>
                    </button>
                  )}
                </div>
              </div>

              {isPrasekolahMurid && studentPrasekolahSlipForTerm ? (
                <div className="mt-6">
                  <PrasekolahSlipCard
                    slip={studentPrasekolahSlipForTerm}
                    schoolName={schoolSettings?.schoolName || 'SJK Chung Hua Balingian'}
                    schoolCode={schoolSettings?.schoolCode || currentUser.schoolCode || 'YCC3404'}
                    schoolLogo={schoolSettings?.schoolLogo || schoolSettings?.logoUrl || ''}
                  />
                </div>
              ) : studentPbdForTerm.length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto text-slate-400">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div className="text-sm font-semibold text-slate-200">
                    Tiada Rekod PBD Bagi Penggal {selectedTerm}
                  </div>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Keputusan Pentaksiran Bilik Darjah (PBD) untuk Penggal {selectedTerm} belum dimasukkan atau sedang dikemaskini oleh guru mata pelajaran.
                  </p>
                </div>
              ) : (
                <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {studentPbdForTerm.map((item) => {
                    const subjCode = String(item.subject_id || item.subjectCode || 'SUBJEK').toUpperCase();
                    const subjMeta = SUBJECT_LABELS[subjCode];
                    const subjectTitle = item.subjectName || (subjMeta ? `${subjMeta.ms} (${subjCode})` : subjCode);
                    const tpNum = Number(item.tp || 0);
                    const tpInfo = TP_DESCRIPTORS[tpNum] || {
                      label: item.tp ? `TP${item.tp}` : 'Belum Dinilai',
                      colorClass: 'bg-slate-800 text-slate-300 border-slate-700',
                      desc: item.mastery || '-',
                    };

                    return (
                      <div
                        key={item.id || subjCode}
                        className="bg-slate-950/80 border border-slate-800/90 rounded-2xl p-4 flex flex-col justify-between space-y-3 hover:border-slate-700 transition"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="text-[11px] font-mono uppercase text-blue-400 font-semibold">
                              Kod: {subjCode} • Penggal {selectedTerm}
                            </span>
                            <h4 className="text-sm sm:text-base font-bold text-white mt-0.5">
                              {subjectTitle}
                            </h4>
                          </div>

                          <span
                            className={`px-3 py-1 rounded-xl text-xs font-bold border shrink-0 ${tpInfo.colorClass}`}
                          >
                            {tpInfo.label}
                          </span>
                        </div>

                        <div className="text-xs text-slate-300 bg-slate-900/70 rounded-xl p-3 border border-slate-800/80 space-y-1.5">
                          <div className="text-[11px] text-slate-400 font-medium">
                            Tafsiran Tahap Penguasaan:
                          </div>
                          <div className="font-medium text-slate-200">
                            {item.mastery || tpInfo.desc}
                          </div>
                        </div>

                        <div className="space-y-1.5 pt-1">
                          <div className="text-[11px] font-semibold text-indigo-300">
                            Ulasan Guru Mata Pelajaran:
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed bg-indigo-950/20 border border-indigo-900/30 rounded-xl p-2.5">
                            {item.rumusan || item.ulasan || 'Tiada ulasan tambahan.'}
                          </p>
                        </div>

                        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            <span>Tarikh Pentaksiran: {formatAssessmentDate(item.updatedAt || item.date)}</span>
                          </span>
                          <span className="text-emerald-400 font-medium">Disahkan</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {/* TAB 2: DISIPLIN DAN SAHSIAH MURID */}
        {activeTab === 'DISIPLIN' && (
          <section className="bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 text-center shadow-xl">
            <div className="max-w-lg mx-auto space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <span className="inline-block px-3 py-1 rounded-lg bg-amber-950/60 border border-amber-800/50 text-amber-300 text-xs font-semibold">
                Status Modul HEM / SSDM
              </span>
              <h3 className="text-lg sm:text-xl font-bold text-white">
                Modul Disiplin dan Sahsiah Murid Belum Diaktifkan
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Paparan rekod sahsiah terpuji, amalan baik, dan disiplin murid sedang dalam fasa penyelarasan oleh Unit Hal Ehwal Murid (HEM) sekolah. Sila rujuk Guru Kelas atau GPK HEM sekiranya memerlukan maklumat lanjut.
              </p>
            </div>
          </section>
        )}

        {/* TAB 3: KOKURIKULUM & PAJSK */}
        {activeTab === 'KOKURIKULUM' && (
          <section className="space-y-6">
            {/* 1. Keahlian Unit Kokurikulum */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6">
              <div className="pb-4 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <Award className="w-5 h-5 text-emerald-400" />
                    <span>1. Keahlian Unit Kokurikulum & Jawatan</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Senarai unit kokurikulum dan jawatan rasmi murid bagi sesi semasa
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                {studentKokoUnits.map((unit) => (
                  <div
                    key={unit.categoryKey}
                    className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                        {unit.categoryLabel}
                      </span>
                      <h4 className="text-base font-bold text-white mt-1">
                        {unit.unitName}
                      </h4>
                    </div>

                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                      <span className="text-slate-400">Jawatan:</span>
                      <span
                        className={`px-2.5 py-1 rounded-lg font-semibold ${
                          unit.groupId
                            ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/50'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {unit.jawatan}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. Rekod Penyertaan Pertandingan & Pencapaian */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6">
              <div className="pb-4 border-b border-slate-800">
                <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <Medal className="w-5 h-5 text-amber-400" />
                  <span>2. Rekod Penyertaan Pertandingan & Pencapaian</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Semua pertandingan dan kejayaan yang didaftarkan oleh guru penasihat bagi pihak anda
                </p>
              </div>

              {studentCompetitions.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <Trophy className="w-8 h-8 text-slate-600 mx-auto" />
                  <div className="text-sm font-semibold text-slate-300">
                    Tiada Rekod Pertandingan Didaftarkan Setakat Ini
                  </div>
                  <p className="text-xs text-slate-500">
                    Rekod penyertaan pertandingan akan dipaparkan secara automatik selepas dikemaskini oleh Guru Penasihat.
                  </p>
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 text-xs">
                        <th className="py-3 px-3 font-semibold">Nama Pertandingan / Program</th>
                        <th className="py-3 px-3 font-semibold">Peringkat</th>
                        <th className="py-3 px-3 font-semibold">Tarikh</th>
                        <th className="py-3 px-3 font-semibold">Pencapaian</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {studentCompetitions.map((comp) => (
                        <tr key={comp.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-3 px-3">
                            <div className="font-semibold text-white">{comp.programName}</div>
                            <div className="text-[11px] text-slate-400">{comp.unitName}</div>
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2.5 py-1 rounded-lg bg-blue-950/60 border border-blue-800/50 text-blue-300 text-xs font-medium">
                              {comp.level}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-300 font-mono text-xs">
                            {comp.date}
                          </td>
                          <td className="py-3 px-3">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-950/60 border border-amber-800/50 text-amber-300 text-xs font-semibold">
                              <Star className="w-3.5 h-3.5 text-amber-400" />
                              <span>{comp.achievement}</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 3. Markah PAJSK Semasa */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6">
              <div className="pb-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-indigo-400" />
                    <span>3. Markah PAJSK Semasa</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Pentaksiran Aktiviti Jasmani, Sukan dan Kokurikulum (PAJSK)
                  </p>
                </div>

                <span className="px-3 py-1 rounded-xl bg-indigo-950/60 border border-indigo-800/50 text-indigo-300 text-xs font-semibold self-start sm:self-center">
                  Gred Semasa: <strong className="text-white">{pajskSummary.gred}</strong>
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                {/* Kehadiran */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4">
                  <div className="text-xs text-slate-400">Kehadiran (Maks 40)</div>
                  <div className="text-lg font-bold text-white mt-1">
                    {pajskSummary.kehadiranScore !== null ? (
                      <span>{pajskSummary.kehadiranScore} / 40</span>
                    ) : (
                      <span className="text-xs font-medium text-amber-300">Belum Dikemaskini</span>
                    )}
                  </div>
                  {pajskSummary.totalSessions > 0 && (
                    <div className="text-[11px] text-slate-500 mt-1">
                      Hadir: {pajskSummary.presentCount}/{pajskSummary.totalSessions} sesi
                    </div>
                  )}
                </div>

                {/* Jawatan */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4">
                  <div className="text-xs text-slate-400">Jawatan (Maks 10)</div>
                  <div className="text-lg font-bold text-white mt-1">
                    {pajskSummary.jawatanScore !== null ? (
                      <span>{pajskSummary.jawatanScore} / 10</span>
                    ) : (
                      <span className="text-xs font-medium text-amber-300">Belum Dikemaskini</span>
                    )}
                  </div>
                </div>

                {/* Penglibatan */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4">
                  <div className="text-xs text-slate-400">Penglibatan (Maks 20)</div>
                  <div className="text-lg font-bold text-white mt-1">
                    {pajskSummary.penglibatanScore !== null ? (
                      <span>{pajskSummary.penglibatanScore} / 20</span>
                    ) : (
                      <span className="text-xs font-medium text-amber-300">Belum Dikemaskini</span>
                    )}
                  </div>
                </div>

                {/* Pencapaian */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4">
                  <div className="text-xs text-slate-400">Pencapaian (Maks 20)</div>
                  <div className="text-lg font-bold text-white mt-1">
                    {pajskSummary.pencapaianScore !== null ? (
                      <span>{pajskSummary.pencapaianScore} / 20</span>
                    ) : (
                      <span className="text-xs font-medium text-amber-300">Belum Dikemaskini</span>
                    )}
                  </div>
                </div>

                {/* Jumlah Markah */}
                <div className="bg-indigo-950/40 border border-indigo-800/50 rounded-2xl p-4">
                  <div className="text-xs text-indigo-300 font-medium">Jumlah Markah Semasa</div>
                  <div className="text-xl font-bold text-white mt-1">
                    {pajskSummary.totalScore !== null ? (
                      <span>{pajskSummary.totalScore}%</span>
                    ) : (
                      <span className="text-xs font-medium text-amber-300">Belum Dikemaskini</span>
                    )}
                  </div>
                  <div className="text-[11px] text-indigo-300/80 mt-1">
                    {pajskSummary.gred}
                  </div>
                </div>
              </div>

              <div className="mt-4 p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-start space-x-2 text-xs text-slate-400">
                <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <span>
                  Markah PAJSK dikira berdasarkan rekod kehadiran, jawatan unit, penglibatan, dan pencapaian pertandingan yang telah disahkan dalam sistem. Komponen yang masih dalam proses kemas kini oleh guru akan memaparkan status <strong className="text-amber-300">"Belum Dikemaskini"</strong>.
                </span>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
};
