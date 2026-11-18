import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Printer,
  Download,
  Users,
  Search,
  CheckSquare,
  Square,
  FileText,
  Sparkles,
  Check,
  Edit3,
  UserCheck,
} from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  Student,
  StudentMaster,
  GuardianInfo,
  ResidentialAddress,
  SchoolSettings,
  UserProfile,
} from '../../types';
import { belongsToSchool } from '../../utils/schoolTenant';
import {
  triggerSmartPrint,
  downloadStandalonePrintHtml,
} from '../../utils/oprPrintHelper';

export interface SPPKInitialData {
  programName?: string;
  organizer?: string;
  date?: string;
  endDate?: string;
  masa?: string;
  venue?: string;
  level?: string;
  unit?: string;
  guruPengiring?: string[];
  studentIds?: string[];
  studentNames?: string[];
}

export interface SPPKParticipantOverride {
  studentId: string;
  studentName: string;
  studentIc: string;
  birthDate: string;
  gender: string;
  age: string;
  className: string;
  selectedGuardianSlot: 'G1' | 'G2';
  guardian1?: GuardianInfo;
  guardian2?: GuardianInfo;
  parentName: string;
  parentIc: string;
  parentOccupation: string;
  relationship: string;
  homeAddress: string;
  homePhone: string;
  officePhone: string;
  mobilePhone: string;
  jenisSakitKecederaan?: string;
  jenisRawatan?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  schoolCode: string;
  schoolName?: string;
  schoolLogo?: string;
  schoolSettings?: SchoolSettings | null;
  currentUser?: UserProfile | null;
  initialData?: SPPKInitialData | null;
}

function formatDateDMY(dateStr?: string): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return trimmed;
}

function formatMyKadOrIc(icRaw?: string): string {
  const raw = String(icRaw || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12) {
    return `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 12)}`;
  }
  return raw;
}

function deriveFromMyKad(icRaw?: string): {
  cleanIc: string;
  formattedIc: string;
  birthDateDMY: string;
  age: string;
  gender: string;
} {
  const digits = String(icRaw || '').replace(/\D/g, '');
  if (digits.length < 6) {
    return {
      cleanIc: digits,
      formattedIc: String(icRaw || '').trim(),
      birthDateDMY: '',
      age: '',
      gender: '',
    };
  }

  const yy = parseInt(digits.slice(0, 2), 10);
  const mm = digits.slice(2, 4);
  const dd = digits.slice(4, 6);
  const currentYear = new Date().getFullYear();
  const fullYear = yy > 40 ? 1900 + yy : 2000 + yy;
  const ageNum = Math.max(5, currentYear - fullYear);

  const formattedIc = formatMyKadOrIc(icRaw);

  let gender = '';
  if (digits.length === 12) {
    const lastDigit = parseInt(digits[11], 10);
    gender = lastDigit % 2 === 1 ? 'LELAKI' : 'PEREMPUAN';
  }

  return {
    cleanIc: digits,
    formattedIc,
    birthDateDMY: `${dd}/${mm}/${fullYear}`,
    age: `${ageNum} TAHUN`,
    gender,
  };
}

function formatResidentialAddress(addr?: ResidentialAddress | string | null): string {
  if (!addr) return '';
  if (typeof addr === 'string') return addr.trim().toUpperCase();
  const parts = [
    addr.address1,
    addr.address2,
    addr.address3,
    [addr.postcode, addr.city].filter(Boolean).join(' '),
    addr.district && addr.district !== addr.city ? addr.district : '',
    addr.state,
  ]
    .map((p) => String(p || '').trim())
    .filter((p) => p && p !== '-');
  return parts.join(', ').toUpperCase();
}

function buildParticipantFromMergedRecord(
  s: Partial<Student & StudentMaster> & Record<string, any>
): SPPKParticipantOverride {
  const rawIc =
    s.icNumber ||
    s.ic_no ||
    s.no_kp ||
    s.mykid ||
    s.ic ||
    '';
  const mykad = deriveFromMyKad(rawIc);

  const genderRaw = String(s.gender || s.jantina || '').toUpperCase();
  const genderLabel =
    genderRaw === 'L' || genderRaw.startsWith('LELAKI')
      ? 'LELAKI'
      : genderRaw === 'P' || genderRaw.startsWith('PEREMPUAN')
      ? 'PEREMPUAN'
      : mykad.gender;

  const rawBirth = s.birthDate || s.tarikh_lahir || '';
  const birthDate = rawBirth ? formatDateDMY(String(rawBirth)) : mykad.birthDateDMY;

  const ageVal =
    s.age && Number(s.age) > 0
      ? `${s.age} TAHUN`
      : s.birthYear && Number(s.birthYear) > 1990
      ? `${new Date().getFullYear() - Number(s.birthYear)} TAHUN`
      : mykad.age;

  const className = String(
    s.currentClass ||
      s.class ||
      s.class_name ||
      s.kelas ||
      (s.currentYear !== undefined
        ? s.currentYear === 0
          ? 'PRASEKOLAH'
          : `TAHUN ${s.currentYear}`
        : s.year !== undefined
        ? s.year === 0
          ? 'PRASEKOLAH'
          : `TAHUN ${s.year}`
        : '')
  ).toUpperCase();

  // Extract structured Guardian 1 (Penjaga Utama) & Guardian 2 (Penjaga Kedua) from APDM StudentMaster
  const g1: GuardianInfo = s.guardian1 || {
    name: s.guardianName || s.nama_bapa || s.father_name || s.penjaga_1 || '',
    icNumber: s.no_kp_bapa || s.father_ic || s.no_kp_penjaga || s.parent_ic || '',
    relation: s.hubungan_penjaga_1 || s.hubungan || 'BAPA / PENJAGA UTAMA',
    occupation: s.pekerjaan_bapa || s.father_occupation || s.pekerjaan_penjaga || '',
    officePhone: s.tel_pejabat_1 || '',
    mobilePhone: s.guardianPhone || s.phone || s.no_tel_bapa || s.no_tel_penjaga || '',
  };

  const g2: GuardianInfo = s.guardian2 || {
    name: s.nama_ibu || s.mother_name || s.penjaga_2 || '',
    icNumber: s.no_kp_ibu || s.mother_ic || '',
    relation: s.hubungan_penjaga_2 || 'IBU / PENJAGA KEDUA',
    occupation: s.pekerjaan_ibu || s.mother_occupation || '',
    officePhone: s.tel_pejabat_2 || '',
    mobilePhone: s.no_tel_ibu || '',
  };

  // Prefer Guardian 1 (Penjaga Utama); if Guardian 1 has no name, fall back to Guardian 2
  const useG1 = Boolean(g1?.name && String(g1.name).trim() && String(g1.name).trim() !== '-');
  const activeG = useG1 ? g1 : g2?.name ? g2 : g1;
  const selectedSlot: 'G1' | 'G2' = useG1 ? 'G1' : g2?.name ? 'G2' : 'G1';

  const parentName = String(activeG?.name || s.guardianName || '').trim().toUpperCase();
  const parentIc = formatMyKadOrIc(activeG?.icNumber);
  const parentOccupation = String(
    activeG?.occupation || activeG?.employmentStatus || ''
  )
    .trim()
    .toUpperCase();
  const relationship = String(
    activeG?.relation || (selectedSlot === 'G1' ? 'BAPA / PENJAGA' : 'IBU / PENJAGA')
  )
    .trim()
    .toUpperCase();

  const homeAddress =
    formatResidentialAddress(s.address) ||
    String(s.alamat || s.alamat_rumah || s.home_address || '')
      .trim()
      .toUpperCase();

  const officePhone = String(activeG?.officePhone || '').trim();
  const mobilePhone = String(
    activeG?.mobilePhone ||
      g1?.mobilePhone ||
      g2?.mobilePhone ||
      s.guardianPhone ||
      s.phone ||
      ''
  ).trim();

  const canonicalId = String(s.student_id || s.apdmId || s.id || s.icNumber || s.name);

  return {
    studentId: canonicalId,
    studentName: String(s.name || '').trim().toUpperCase(),
    studentIc: mykad.formattedIc,
    birthDate,
    gender: genderLabel,
    age: ageVal,
    className,
    selectedGuardianSlot: selectedSlot,
    guardian1: g1,
    guardian2: g2,
    parentName,
    parentIc,
    parentOccupation,
    relationship,
    homeAddress,
    homePhone: '',
    officePhone,
    mobilePhone,
    jenisSakitKecederaan: '',
    jenisRawatan: '',
  };
}

export const SPPKCompetitionFormsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  schoolCode,
  schoolName,
  schoolSettings,
  initialData,
}) => {
  const [mergedStudents, setMergedStudents] = useState<Array<Record<string, any>>>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [classFilter, setClassFilter] = useState<string>('ALL');

  // Form Metadata
  const [programName, setProgramName] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [venue, setVenue] = useState<string>('');
  const [schoolFullAddress, setSchoolFullAddress] = useState<string>('');
  const [principalName, setPrincipalName] = useState<string>('');
  const [tarikhPengesahan, setTarikhPengesahan] = useState<string>('');

  // Form Tab Selection
  const [formFilter, setFormFilter] = useState<'ALL' | 'SPPK1' | 'SPPK2' | 'SPPK3'>('ALL');
  const [preTickMedicalNo, setPreTickMedicalNo] = useState<boolean>(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, SPPKParticipantOverride>>({});
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const defaultSchoolDisplay = useMemo(() => {
    const name =
      schoolName ||
      schoolSettings?.schoolName ||
      'SJK (C) CHUNG HUA BALINGIAN';
    const addr =
      (schoolSettings as any)?.address ||
      (schoolCode === 'YCC3404'
        ? '96350 BALINGIAN, MUKAH, SARAWAK'
        : 'SARAWAK');
    return `${name}, ${addr}`.toUpperCase();
  }, [schoolName, schoolSettings, schoolCode]);

  useEffect(() => {
    if (!isOpen) return;
    setProgramName((initialData?.programName || '').toUpperCase());
    setStartDate(initialData?.date || new Date().toISOString().slice(0, 10));
    setEndDate(
      initialData?.endDate ||
        initialData?.date ||
        new Date().toISOString().slice(0, 10)
    );
    setVenue((initialData?.venue || '').toUpperCase());
    setSchoolFullAddress(defaultSchoolDisplay);
    setPrincipalName(
      ((schoolSettings as any)?.principalName || '').toUpperCase()
    );
    setTarikhPengesahan('');
  }, [isOpen, initialData, defaultSchoolDisplay, schoolSettings]);

  // Load and merge `student_master` (APDM Induk with Penjaga 1, Penjaga 2 & Address) + `students` (Sessional Enrollment)
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    async function fetchAndMergeStudents() {
      try {
        const [masterSnap, enrollSnap] = await Promise.all([
          getDocs(collection(db, 'student_master')).catch(() => null),
          getDocs(collection(db, 'students')).catch(() => null),
        ]);

        const masterDocs = masterSnap
          ? masterSnap.docs
              .filter((d) => belongsToSchool(d.data(), schoolCode))
              .map((d) => ({ ...(d.data() as any), student_id: d.data().student_id || d.id, _masterDocId: d.id }))
          : [];

        const enrollDocs = enrollSnap
          ? enrollSnap.docs
              .filter((d) => belongsToSchool(d.data(), schoolCode))
              .map((d) => ({ ...(d.data() as any), id: d.id }))
          : [];

        // Index master records by student_id, apdmId, clean IC, and normalized name
        const masterById = new Map<string, any>();
        const masterByIc = new Map<string, any>();
        const masterByName = new Map<string, any>();

        masterDocs.forEach((m) => {
          if (m.student_id) masterById.set(String(m.student_id).trim(), m);
          if (m._masterDocId) masterById.set(String(m._masterDocId).trim(), m);
          if (m.apdmId) masterById.set(String(m.apdmId).trim(), m);
          const cleanIc = String(m.icNumber || '').replace(/\D/g, '');
          if (cleanIc) masterByIc.set(cleanIc, m);
          const normName = String(m.name || '').toUpperCase().replace(/\s+/g, ' ').trim();
          if (normName) masterByName.set(normName, m);
        });

        const combinedMap = new Map<string, any>();

        // 1. Start with all master records (contains full guardian1, guardian2, address)
        masterDocs.forEach((m) => {
          const key = String(m.student_id || m.apdmId || m._masterDocId || m.name);
          combinedMap.set(key, { ...m, id: key, student_id: key });
        });

        // 2. Overlay sessional enrollment records (`students`) and link any matching master record
        enrollDocs.forEach((e) => {
          const cleanIc = String(e.icNumber || '').replace(/\D/g, '');
          const normName = String(e.name || '').toUpperCase().replace(/\s+/g, ' ').trim();
          const matchedMaster =
            (e.student_id && masterById.get(String(e.student_id).trim())) ||
            (e.apdmId && masterById.get(String(e.apdmId).trim())) ||
            (cleanIc && masterByIc.get(cleanIc)) ||
            (normName && masterByName.get(normName));

          if (matchedMaster) {
            const key = String(matchedMaster.student_id || matchedMaster.apdmId || matchedMaster._masterDocId);
            combinedMap.set(key, {
              ...matchedMaster,
              ...e,
              // Ensure rich APDM fields from student_master are never overwritten by empty enrollment fields
              id: key,
              student_id: key,
              enrollmentDocId: e.id,
              icNumber: matchedMaster.icNumber || e.icNumber || '',
              birthDate: matchedMaster.birthDate || e.birthDate || '',
              birthYear: matchedMaster.birthYear || e.birthYear || 0,
              age: matchedMaster.age || e.age || 0,
              currentClass: e.class || matchedMaster.currentClass || '',
              guardian1: matchedMaster.guardian1,
              guardian2: matchedMaster.guardian2,
              address: matchedMaster.address,
            });
          } else {
            const key = String(e.student_id || e.id || e.name);
            if (!combinedMap.has(key)) {
              combinedMap.set(key, { ...e, id: key, student_id: key });
            }
          }
        });

        // Deduplicate by normalized student name if both scoped & unscoped docs existed
        const seenNames = new Set<string>();
        const list: Array<Record<string, any>> = [];
        Array.from(combinedMap.values())
          .sort((a, b) => {
            // Prefer records that have guardian1.icNumber or guardian1.name populated
            const aHasG1 = a.guardian1?.icNumber || a.guardian1?.name ? 1 : 0;
            const bHasG1 = b.guardian1?.icNumber || b.guardian1?.name ? 1 : 0;
            if (aHasG1 !== bHasG1) return bHasG1 - aHasG1;
            return String(a.name || '').localeCompare(String(b.name || ''));
          })
          .forEach((rec) => {
            const normName = String(rec.name || '').toUpperCase().replace(/\s+/g, ' ').trim();
            if (!normName) return;
            if (seenNames.has(normName)) return;
            seenNames.add(normName);
            list.push(rec);
          });

        list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

        if (!active) return;
        setMergedStudents(list);

        // Build participant overrides map with full APDM guardian1, guardian2 & address
        const map: Record<string, SPPKParticipantOverride> = {};
        list.forEach((s) => {
          const built = buildParticipantFromMergedRecord(s);
          map[built.studentId] = built;
        });
        setOverrides(map);

        // Pre-select students from initialData (match by studentId, enrollmentDocId, apdmId, or name)
        if (
          (initialData?.studentIds && initialData.studentIds.length > 0) ||
          (initialData?.studentNames && initialData.studentNames.length > 0)
        ) {
          const targetIdSet = new Set(
            (initialData?.studentIds || []).map((id) => String(id).trim())
          );
          const targetNameSet = new Set(
            (initialData?.studentNames || []).map((n) =>
              String(n).toUpperCase().replace(/\s+/g, ' ').trim()
            )
          );

          const matched = list
            .filter((s) => {
              const sid = String(s.student_id || s.id || '').trim();
              const eid = String(s.enrollmentDocId || '').trim();
              const aid = String(s.apdmId || '').trim();
              const sName = String(s.name || '').toUpperCase().replace(/\s+/g, ' ').trim();
              return (
                (sid && targetIdSet.has(sid)) ||
                (eid && targetIdSet.has(eid)) ||
                (aid && targetIdSet.has(aid)) ||
                (sName && targetNameSet.has(sName))
              );
            })
            .map((s) => String(s.student_id || s.id));

          if (matched.length > 0) {
            setSelectedIds(matched);
            return;
          }
        }

        if (list.length > 0) {
          setSelectedIds([String(list[0].student_id || list[0].id)]);
        }
      } catch (err) {
        console.warn('Could not load student_master / students for SPPK modal:', err);
      }
    }
    fetchAndMergeStudents();
    return () => {
      active = false;
    };
  }, [isOpen, schoolCode, initialData]);

  const availableClasses = useMemo(() => {
    const set = new Set<string>();
    mergedStudents.forEach((s) => {
      const cls = String(s.currentClass || s.class || s.class_name || '').trim();
      if (cls) set.add(cls);
    });
    return Array.from(set).sort();
  }, [mergedStudents]);

  const filteredStudents = useMemo(() => {
    return mergedStudents.filter((s) => {
      const cls = String(s.currentClass || s.class || s.class_name || '').trim();
      if (classFilter !== 'ALL' && cls !== classFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const name = String(s.name || '').toLowerCase();
        const ic = String(s.icNumber || s.student_id || '').toLowerCase();
        const g1Name = String(s.guardian1?.name || s.guardianName || '').toLowerCase();
        const g2Name = String(s.guardian2?.name || '').toLowerCase();
        return (
          name.includes(q) ||
          ic.includes(q) ||
          g1Name.includes(q) ||
          g2Name.includes(q) ||
          cls.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [mergedStudents, classFilter, searchQuery]);

  // Build list of participants to render (or 1 blank template if 0 selected)
  const activeParticipants: SPPKParticipantOverride[] = useMemo(() => {
    if (selectedIds.length === 0) {
      return [
        {
          studentId: 'BLANK_TEMPLATE',
          studentName: '',
          studentIc: '',
          birthDate: '',
          gender: '',
          age: '',
          className: '',
          selectedGuardianSlot: 'G1',
          parentName: '',
          parentIc: '',
          parentOccupation: '',
          relationship: '',
          homeAddress: '',
          homePhone: '',
          officePhone: '',
          mobilePhone: '',
          jenisSakitKecederaan: '',
          jenisRawatan: '',
        },
      ];
    }
    return selectedIds
      .map((id) => overrides[id])
      .filter((x): x is SPPKParticipantOverride => Boolean(x));
  }, [selectedIds, overrides]);

  if (!isOpen) return null;

  const startFormatted = formatDateDMY(startDate);
  const endFormatted = formatDateDMY(endDate || startDate);

  const toggleStudent = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const switchStudentGuardianSlot = (studentId: string, slot: 'G1' | 'G2') => {
    setOverrides((prev) => {
      const existing = prev[studentId];
      if (!existing) return prev;
      const g = slot === 'G1' ? existing.guardian1 : existing.guardian2;
      if (!g) return prev;
      return {
        ...prev,
        [studentId]: {
          ...existing,
          selectedGuardianSlot: slot,
          parentName: String(g.name || '').trim().toUpperCase(),
          parentIc: formatMyKadOrIc(g.icNumber),
          parentOccupation: String(g.occupation || g.employmentStatus || '')
            .trim()
            .toUpperCase(),
          relationship: String(
            g.relation || (slot === 'G1' ? 'BAPA / PENJAGA UTAMA' : 'IBU / PENJAGA KEDUA')
          )
            .trim()
            .toUpperCase(),
          officePhone: String(g.officePhone || '').trim(),
          mobilePhone: String(
            g.mobilePhone ||
              existing.guardian1?.mobilePhone ||
              existing.guardian2?.mobilePhone ||
              existing.mobilePhone ||
              ''
          ).trim(),
        },
      };
    });
  };

  const switchAllGuardiansSlot = (slot: 'G1' | 'G2') => {
    setOverrides((prev) => {
      const next: Record<string, SPPKParticipantOverride> = { ...prev };
      Object.keys(next).forEach((sid) => {
        const item = next[sid];
        const g = slot === 'G1' ? item.guardian1 : item.guardian2;
        if (g && g.name && String(g.name).trim() !== '-') {
          next[sid] = {
            ...item,
            selectedGuardianSlot: slot,
            parentName: String(g.name || '').trim().toUpperCase(),
            parentIc: formatMyKadOrIc(g.icNumber),
            parentOccupation: String(g.occupation || g.employmentStatus || '')
              .trim()
              .toUpperCase(),
            relationship: String(
              g.relation || (slot === 'G1' ? 'BAPA / PENJAGA UTAMA' : 'IBU / PENJAGA KEDUA')
            )
              .trim()
              .toUpperCase(),
            officePhone: String(g.officePhone || '').trim(),
            mobilePhone: String(
              g.mobilePhone ||
                item.guardian1?.mobilePhone ||
                item.guardian2?.mobilePhone ||
                item.mobilePhone ||
                ''
            ).trim(),
          };
        }
      });
      return next;
    });
  };

  const updateOverrideField = (
    studentId: string,
    field: keyof SPPKParticipantOverride,
    value: string
  ) => {
    setOverrides((prev) => {
      const existing = prev[studentId];
      if (!existing) return prev;
      return {
        ...prev,
        [studentId]: {
          ...existing,
          [field]: value,
        },
      };
    });
  };

  const OfficialHeader: React.FC<{ formCode: 'Borang SPPK 1' | 'Borang SPPK 2' | 'Borang SPPK 3' }> = ({
    formCode,
  }) => (
    <div style={{ marginBottom: '4px' }}>
      <div style={{ textAlign: 'center' }}>
        <img
          src="/assets/aistudio/jata_negara_kpm.png"
          alt="Kementerian Pendidikan - Jabatan Pendidikan Negeri Sarawak"
          style={{
            height: '64px',
            width: 'auto',
            margin: '0 auto',
            display: 'block',
            objectFit: 'contain',
          }}
        />
      </div>
      <div
        style={{
          textAlign: 'right',
          fontWeight: 'bold',
          fontStyle: 'italic',
          textDecoration: 'underline',
          fontSize: '11pt',
          marginTop: '-4px',
          marginBottom: '6px',
        }}
      >
        {formCode}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col overflow-hidden">
      {/* Top Action Bar (Hidden in Print) */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-300">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-wide flex items-center gap-2">
              <span>Jana Rasmi Borang SPPK 1, SPPK 2 &amp; SPPK 3 (JPN Sarawak)</span>
              <span className="px-2 py-0.5 text-[10px] rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Auto-Sync APDM Penjaga 1 &amp; 2
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">
              Auto-isi Nama, No. KP, Pekerjaan, Hubungan, No. Telefon &amp; Alamat Rumah daripada rekod Penjaga Utama (APDM Student Master).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Form Filter Tabs */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs font-bold">
            {(
              [
                { id: 'ALL', label: 'Semua (SPPK 1-3)' },
                { id: 'SPPK1', label: 'Borang SPPK 1' },
                { id: 'SPPK2', label: 'Borang SPPK 2' },
                { id: 'SPPK3', label: 'Borang SPPK 3' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFormFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  formFilter === tab.id
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              const res = downloadStandalonePrintHtml({
                elementId: 'sppk-printable-bundle',
                title: `Borang_SPPK_${programName || 'Program'}`,
                orientation: 'portrait',
              });
              setStatusMsg(res.message);
            }}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-700/60 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Muat Turun (.html)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const res = triggerSmartPrint({
                elementId: 'sppk-printable-bundle',
                title: `Borang_SPPK_${programName || 'Program'}`,
                orientation: 'portrait',
                onNotice: (msg) => setStatusMsg(msg),
              });
              if (res.mode !== 'native') {
                setStatusMsg(res.message);
              }
            }}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase flex items-center gap-1.5 shadow cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>
              Cetak A4 ({activeParticipants.length} Set)
            </span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white transition cursor-pointer"
            title="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="bg-indigo-950/90 border-b border-indigo-700 px-4 py-2 text-xs text-indigo-200 flex items-center justify-between print:hidden">
          <span>{statusMsg}</span>
          <button
            type="button"
            onClick={() => setStatusMsg(null)}
            className="text-indigo-400 hover:text-white ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Split Workspace */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* Left Control Sidebar (Hidden in Print) */}
        <div className="lg:col-span-4 bg-slate-900/95 border-r border-slate-800 p-4 overflow-y-auto space-y-4 print:hidden">
          {/* 1. Program Details */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-3">
            <div className="text-xs font-black text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>1. Maklumat Program / Pertandingan</span>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-400 block mb-1">
                Nama Program / Aktiviti:
              </label>
              <input
                type="text"
                value={programName}
                onChange={(e) => setProgramName(e.target.value.toUpperCase())}
                placeholder="cth: KEJOHANAN MERENTAS DESA MSSR DAERAH DALAT"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">
                  Tarikh Mulai:
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">
                  Hingga Tarikh:
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-400 block mb-1">
                Tempat Diadakan (di):
              </label>
              <input
                type="text"
                value={venue}
                onChange={(e) => setVenue(e.target.value.toUpperCase())}
                placeholder="cth: STADIUM MUKAH / SJK(C) CHUNG HUA BALINGIAN"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-400 block mb-1">
                Nama &amp; Alamat Penuh Sekolah (SPPK 1):
              </label>
              <input
                type="text"
                value={schoolFullAddress}
                onChange={(e) => setSchoolFullAddress(e.target.value.toUpperCase())}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">
                  Nama Guru Besar (Pilihan):
                </label>
                <input
                  type="text"
                  value={principalName}
                  onChange={(e) => setPrincipalName(e.target.value.toUpperCase())}
                  placeholder="Kosongkan jika tandatangan manual"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">
                  Tarikh Pengesahan:
                </label>
                <input
                  type="text"
                  value={tarikhPengesahan}
                  onChange={(e) => setTarikhPengesahan(e.target.value)}
                  placeholder="cth: 16/11/2026"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={preTickMedicalNo}
                onChange={(e) => setPreTickMedicalNo(e.target.checked)}
                className="rounded border-slate-600"
              />
              <span>Pra-tandakan &quot;/&quot; pada ruangan &quot;Tidak&quot; dalam jadual SPPK 2</span>
            </label>
          </div>

          {/* 2. Student Multi-Selector & Penjaga Utama / Kedua Switcher */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-black text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                <span>2. Pilih Peserta ({selectedIds.length} Murid)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedIds(
                      filteredStudents.map((s) =>
                        String(s.student_id || s.id)
                      )
                    )
                  }
                  className="text-[10px] font-bold px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                >
                  Pilih Semua
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="text-[10px] font-bold px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 cursor-pointer"
                  title="Kosongkan untuk cetak Borang SPPK Kosong"
                >
                  Borang Kosong
                </button>
              </div>
            </div>

            {/* Global Penjaga 1 (Utama) vs Penjaga 2 Switcher */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300">
                <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                <span>Data APDM Ibu Bapa:</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => switchAllGuardiansSlot('G1')}
                  className="px-2 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500/40 text-[10px] font-bold cursor-pointer"
                  title="Gunakan Penjaga 1 (Penjaga Utama / Bapa) untuk semua murid"
                >
                  Penjaga 1 (Utama)
                </button>
                <button
                  type="button"
                  onClick={() => switchAllGuardiansSlot('G2')}
                  className="px-2 py-1 rounded-lg bg-purple-600/25 hover:bg-purple-600 text-purple-200 hover:text-white border border-purple-500/40 text-[10px] font-bold cursor-pointer"
                  title="Gunakan Penjaga 2 (Ibu / Penjaga Kedua) untuk semua murid"
                >
                  Penjaga 2 (Ibu)
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama murid / No. KP / nama penjaga..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-2.5 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
                />
              </div>
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white font-bold outline-none"
              >
                <option value="ALL">Semua Kelas</option>
                {availableClasses.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="max-h-56 overflow-y-auto divide-y divide-slate-800/60 border border-slate-800 rounded-xl bg-slate-900/50">
              {filteredStudents.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  Tiada murid ditemui. Anda masih boleh mencetak borang SPPK kosong.
                </div>
              ) : (
                filteredStudents.map((s, idx) => {
                  const sid = String(s.student_id || s.id);
                  const checked = selectedIds.includes(sid);
                  const ov = overrides[sid];
                  const hasG2 = Boolean(
                    ov?.guardian2?.name && String(ov.guardian2.name).trim() !== '-'
                  );

                  return (
                    <div
                      key={`${sid}_${idx}`}
                      className={`p-2 flex items-center justify-between gap-2 text-xs transition ${
                        checked ? 'bg-indigo-950/40' : 'hover:bg-slate-900'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleStudent(sid)}
                        className="flex items-center gap-2 text-left flex-1 min-w-0 cursor-pointer"
                      >
                        {checked ? (
                          <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-600 shrink-0" />
                        )}
                        <div className="truncate">
                          <div className="font-bold text-white truncate">
                            {s.name}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono truncate">
                            {ov?.className || '-'} · KP: {ov?.studentIc || 'Tiada'}
                          </div>
                          <div className="text-[10px] text-emerald-300/90 font-mono truncate">
                            Penjaga ({ov?.selectedGuardianSlot === 'G2' ? 'P2' : 'P1 Utama'}):{' '}
                            {ov?.parentName || 'Tiada Rekod APDM'}{' '}
                            {ov?.parentIc ? `(${ov.parentIc})` : ''}
                          </div>
                        </div>
                      </button>

                      {checked && (
                        <div className="flex items-center gap-1 shrink-0">
                          {hasG2 && (
                            <button
                              type="button"
                              onClick={() =>
                                switchStudentGuardianSlot(
                                  sid,
                                  ov?.selectedGuardianSlot === 'G1' ? 'G2' : 'G1'
                                )
                              }
                              className="px-1.5 py-1 rounded-lg bg-slate-800 hover:bg-indigo-600 text-[10px] font-bold text-indigo-300 hover:text-white border border-slate-700 cursor-pointer"
                              title="Tukar antara Penjaga 1 (Utama) & Penjaga 2 (Ibu/Bapa)"
                            >
                              {ov?.selectedGuardianSlot === 'G2' ? 'P2' : 'P1'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setEditingStudentId(
                                editingStudentId === sid ? null : sid
                              )
                            }
                            className={`p-1.5 rounded-lg border text-[10px] font-bold flex items-center gap-1 cursor-pointer ${
                              editingStudentId === sid
                                ? 'bg-amber-500 text-slate-950 border-amber-400'
                                : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                            }`}
                            title="Kemaskini Maklumat Ibu Bapa / Murid"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 3. Individual Participant Editor (When Edit Clicked) */}
          {editingStudentId && overrides[editingStudentId] && (
            <div className="bg-slate-950 border border-amber-500/40 rounded-2xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-amber-300 uppercase">
                  Kemaskini Peserta: {overrides[editingStudentId].studentName}
                </span>
                <button
                  type="button"
                  onClick={() => setEditingStudentId(null)}
                  className="text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  <Check className="w-4 h-4 text-emerald-400" />
                </button>
              </div>

              {/* Quick Switcher between Penjaga 1 & Penjaga 2 inside Edit Drawer */}
              {(overrides[editingStudentId].guardian1?.name ||
                overrides[editingStudentId].guardian2?.name) && (
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => switchStudentGuardianSlot(editingStudentId, 'G1')}
                    className={`p-2 rounded-xl border text-left text-[10px] cursor-pointer transition ${
                      overrides[editingStudentId].selectedGuardianSlot === 'G1'
                        ? 'bg-indigo-600/30 border-indigo-400 text-white font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="uppercase text-[9px] text-indigo-300 font-black">
                      Penjaga 1 (Utama)
                    </div>
                    <div className="truncate">
                      {overrides[editingStudentId].guardian1?.name || '-'}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => switchStudentGuardianSlot(editingStudentId, 'G2')}
                    className={`p-2 rounded-xl border text-left text-[10px] cursor-pointer transition ${
                      overrides[editingStudentId].selectedGuardianSlot === 'G2'
                        ? 'bg-purple-600/30 border-purple-400 text-white font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="uppercase text-[9px] text-purple-300 font-black">
                      Penjaga 2 (Kedua)
                    </div>
                    <div className="truncate">
                      {overrides[editingStudentId].guardian2?.name || '-'}
                    </div>
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block">
                    Nama Ibu Bapa / Penjaga:
                  </label>
                  <input
                    type="text"
                    value={overrides[editingStudentId].parentName}
                    onChange={(e) =>
                      updateOverrideField(
                        editingStudentId,
                        'parentName',
                        e.target.value.toUpperCase()
                      )
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">
                    No. KP Ibu Bapa / Penjaga:
                  </label>
                  <input
                    type="text"
                    value={overrides[editingStudentId].parentIc}
                    onChange={(e) =>
                      updateOverrideField(
                        editingStudentId,
                        'parentIc',
                        e.target.value
                      )
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">
                    Pekerjaan Ibu Bapa:
                  </label>
                  <input
                    type="text"
                    value={overrides[editingStudentId].parentOccupation}
                    onChange={(e) =>
                      updateOverrideField(
                        editingStudentId,
                        'parentOccupation',
                        e.target.value.toUpperCase()
                      )
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">
                    Hubungan:
                  </label>
                  <input
                    type="text"
                    value={overrides[editingStudentId].relationship}
                    onChange={(e) =>
                      updateOverrideField(
                        editingStudentId,
                        'relationship',
                        e.target.value.toUpperCase()
                      )
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] text-slate-400 block">
                    Alamat Penuh Rumah:
                  </label>
                  <input
                    type="text"
                    value={overrides[editingStudentId].homeAddress}
                    onChange={(e) =>
                      updateOverrideField(
                        editingStudentId,
                        'homeAddress',
                        e.target.value.toUpperCase()
                      )
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">
                    No. Tel Bimbit [HP]:
                  </label>
                  <input
                    type="text"
                    value={overrides[editingStudentId].mobilePhone}
                    onChange={(e) =>
                      updateOverrideField(
                        editingStudentId,
                        'mobilePhone',
                        e.target.value
                      )
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">
                    No. Tel Pejabat:
                  </label>
                  <input
                    type="text"
                    value={overrides[editingStudentId].officePhone}
                    onChange={(e) =>
                      updateOverrideField(
                        editingStudentId,
                        'officePhone',
                        e.target.value
                      )
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Live A4 Preview Pane */}
        <div className="lg:col-span-8 bg-slate-800/90 overflow-y-auto p-4 sm:p-8 flex justify-center">
          <div id="sppk-printable-bundle" className="space-y-8 print:space-y-0">
            {activeParticipants.map((p, pIdx) => {
              const showSppk1 = formFilter === 'ALL' || formFilter === 'SPPK1';
              const showSppk2 = formFilter === 'ALL' || formFilter === 'SPPK2';
              const showSppk3 = formFilter === 'ALL' || formFilter === 'SPPK3';

              return (
                <React.Fragment key={`${p.studentId}_${pIdx}`}>
                  {/* =====================================================================
                      PAGE 1: BORANG SPPK 1 (100% EXACT MATCH TO OFFICIAL JPNS PDF)
                     ===================================================================== */}
                  {showSppk1 && (
                    <div
                      className="print-page-break bg-white text-black shadow-2xl mx-auto"
                      style={{
                        width: '210mm',
                        minHeight: '297mm',
                        padding: '12mm 18mm 12mm 18mm',
                        boxSizing: 'border-box',
                        fontFamily: 'Arial, Helvetica, sans-serif',
                        fontSize: '10.5pt',
                        lineHeight: 1.32,
                        color: '#000000',
                        backgroundColor: '#ffffff',
                      }}
                    >
                      <OfficialHeader formCode="Borang SPPK 1" />

                      {/* Main Title */}
                      <div
                        style={{
                          textAlign: 'center',
                          fontWeight: 'bold',
                          textDecoration: 'underline',
                          fontSize: '11.5pt',
                          marginBottom: '4px',
                        }}
                      >
                        BORANG AKUAN/KEBENARAN IBU BAPA/ PENJAGA
                      </div>

                      {/* 7-Row Exact Boxed Grid Table */}
                      <div
                        style={{
                          border: '1px solid #000000',
                          width: '100%',
                          fontSize: '10.5pt',
                        }}
                      >
                        {/* Row 1: Saya, | [Parent Name] */}
                        <div
                          style={{
                            display: 'flex',
                            borderBottom: '1px solid #000000',
                            minHeight: '24px',
                          }}
                        >
                          <div
                            style={{
                              width: '17%',
                              borderRight: '1px solid #000000',
                              padding: '2px 6px',
                            }}
                          >
                            Saya,
                          </div>
                          <div
                            style={{
                              width: '83%',
                              padding: '2px 8px',
                              fontWeight: 'bold',
                            }}
                          >
                            {p.parentName}
                          </div>
                        </div>

                        {/* Row 2: No. Kad Pengenalan | [Parent IC] | Ibu Bapa/Penjaga kepada */}
                        <div
                          style={{
                            display: 'flex',
                            borderBottom: '1px solid #000000',
                            minHeight: '24px',
                          }}
                        >
                          <div
                            style={{
                              width: '26%',
                              borderRight: '1px solid #000000',
                              padding: '2px 6px',
                            }}
                          >
                            No. Kad Pengenalan
                          </div>
                          <div
                            style={{
                              width: '40%',
                              borderRight: '1px solid #000000',
                              padding: '2px 8px',
                              fontWeight: 'bold',
                            }}
                          >
                            {p.parentIc}
                          </div>
                          <div
                            style={{
                              width: '34%',
                              padding: '2px 6px',
                              textAlign: 'right',
                            }}
                          >
                            Ibu Bapa/Penjaga kepada
                          </div>
                        </div>

                        {/* Row 3: murid yang bernama | [Student Name] | dalam */}
                        <div
                          style={{
                            display: 'flex',
                            borderBottom: '1px solid #000000',
                            minHeight: '24px',
                          }}
                        >
                          <div
                            style={{
                              width: '26%',
                              borderRight: '1px solid #000000',
                              padding: '2px 6px',
                            }}
                          >
                            murid yang bernama
                          </div>
                          <div
                            style={{
                              width: '62%',
                              borderRight: '1px solid #000000',
                              padding: '2px 8px',
                              fontWeight: 'bold',
                            }}
                          >
                            {p.studentName}
                          </div>
                          <div
                            style={{
                              width: '12%',
                              padding: '2px 6px',
                              textAlign: 'right',
                            }}
                          >
                            dalam
                          </div>
                        </div>

                        {/* Row 4: Tahun/Tingkatan | [Class/Year] | yang sedang belajar di sekolah */}
                        <div
                          style={{
                            display: 'flex',
                            borderBottom: '1px solid #000000',
                            minHeight: '24px',
                          }}
                        >
                          <div
                            style={{
                              width: '21%',
                              borderRight: '1px solid #000000',
                              padding: '2px 6px',
                            }}
                          >
                            Tahun/Tingkatan
                          </div>
                          <div
                            style={{
                              width: '43%',
                              borderRight: '1px solid #000000',
                              padding: '2px 8px',
                              fontWeight: 'bold',
                            }}
                          >
                            {p.className}
                          </div>
                          <div
                            style={{
                              width: '36%',
                              padding: '2px 6px',
                              textAlign: 'right',
                            }}
                          >
                            yang sedang belajar di sekolah
                          </div>
                        </div>

                        {/* Row 5: [alamat penuh] | [School Name & Full Address] | dengan ini */}
                        <div
                          style={{
                            display: 'flex',
                            borderBottom: '1px solid #000000',
                            minHeight: '24px',
                          }}
                        >
                          <div
                            style={{
                              width: '21%',
                              borderRight: '1px solid #000000',
                              padding: '2px 6px',
                            }}
                          >
                            [alamat penuh]
                          </div>
                          <div
                            style={{
                              width: '64%',
                              borderRight: '1px solid #000000',
                              padding: '2px 8px',
                              fontWeight: 'bold',
                              fontSize: '9.5pt',
                            }}
                          >
                            {schoolFullAddress}
                          </div>
                          <div
                            style={{
                              width: '15%',
                              padding: '2px 6px',
                              textAlign: 'right',
                            }}
                          >
                            dengan ini
                          </div>
                        </div>

                        {/* Row 6: mengizinkan anak saya untuk menyertai | [Program Name] */}
                        <div
                          style={{
                            display: 'flex',
                            borderBottom: '1px solid #000000',
                            minHeight: '42px',
                          }}
                        >
                          <div
                            style={{
                              width: '45%',
                              borderRight: '1px solid #000000',
                              padding: '3px 6px',
                            }}
                          >
                            mengizinkan anak saya untuk menyertai
                          </div>
                          <div
                            style={{
                              width: '55%',
                              padding: '3px 8px',
                              fontWeight: 'bold',
                            }}
                          >
                            {programName}
                          </div>
                        </div>

                        {/* Row 7: yang diadakan mulai | [Start] | hingga | [End] | di | [Venue] */}
                        <div
                          style={{
                            display: 'flex',
                            minHeight: '38px',
                          }}
                        >
                          <div
                            style={{
                              width: '25%',
                              borderRight: '1px solid #000000',
                              padding: '3px 6px',
                            }}
                          >
                            yang diadakan mulai
                          </div>
                          <div
                            style={{
                              width: '17%',
                              borderRight: '1px solid #000000',
                              padding: '3px 6px',
                              fontWeight: 'bold',
                              textAlign: 'center',
                            }}
                          >
                            {startFormatted}
                          </div>
                          <div
                            style={{
                              width: '10%',
                              borderRight: '1px solid #000000',
                              padding: '3px 6px',
                            }}
                          >
                            hingga
                          </div>
                          <div
                            style={{
                              width: '15%',
                              borderRight: '1px solid #000000',
                              padding: '3px 6px',
                              fontWeight: 'bold',
                              textAlign: 'center',
                            }}
                          >
                            {endFormatted}
                          </div>
                          <div
                            style={{
                              width: '5%',
                              borderRight: '1px solid #000000',
                              padding: '3px 6px',
                            }}
                          >
                            di
                          </div>
                          <div
                            style={{
                              width: '28%',
                              padding: '3px 6px',
                              fontWeight: 'bold',
                              fontSize: '9.5pt',
                            }}
                          >
                            {venue}
                          </div>
                        </div>
                      </div>

                      {/* Numbered Clauses 2, 3, 4 */}
                      <div
                        style={{
                          marginTop: '14px',
                          textAlign: 'justify',
                          fontSize: '10.5pt',
                        }}
                      >
                        <p style={{ margin: '0 0 12px 0' }}>
                          2.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Saya faham bahawa segala langkah keselamatan telah dan akan diambil oleh pihak penganjur. Walaupun demikian saya mengaku bahawa anak saya perlu mematuhi peraturan-peraturan dan arahan sepanjang aktiviti / program dijalankan termasuk dalam masa perjalanan pergi dan balik.
                        </p>
                        <p style={{ margin: '0 0 12px 0' }}>
                          3.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Saya mengesahkan bahawa anak saya tidak mengidap sebarang penyakit kritikal dan membenarkan beliau menyertai aktiviti ini.
                        </p>
                        <p style={{ margin: '0 0 14px 0' }}>
                          4.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Saya juga mengizinkan anak saya supaya diberi rawatan/perubatan/pembedahan jika keadaan memerlukan tindakan segera untuk berbuat demikian.
                        </p>
                        <p style={{ margin: '0 0 14px 0' }}>Sekian, Terima kasih.</p>
                        <p style={{ margin: '0 0 12px 0' }}>Saya yang benar,</p>
                      </div>

                      {/* Parent Signature & Details Block */}
                      <div style={{ paddingLeft: '8px', fontSize: '10.5pt' }}>
                        {/* Tandatangan */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '10px' }}>
                          <div style={{ width: '25%' }}>Tandatangan</div>
                          <div style={{ width: '4%' }}>:</div>
                          <div
                            style={{
                              width: '65%',
                              borderBottom: '1px solid #000000',
                              minHeight: '18px',
                            }}
                          />
                        </div>

                        {/* Nama */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '10px' }}>
                          <div style={{ width: '25%' }}>Nama</div>
                          <div style={{ width: '4%' }}>:</div>
                          <div
                            style={{
                              width: '65%',
                              borderBottom: '1px solid #000000',
                              minHeight: '18px',
                              fontWeight: 'bold',
                              paddingLeft: '4px',
                            }}
                          >
                            {p.parentName}
                          </div>
                        </div>

                        {/* No. Kad Pengenalan */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '6px' }}>
                          <div style={{ width: '25%' }}>No. Kad Pengenalan</div>
                          <div style={{ width: '4%' }}>:</div>
                          <div
                            style={{
                              width: '65%',
                              borderBottom: '1px solid #000000',
                              minHeight: '18px',
                              fontWeight: 'bold',
                              paddingLeft: '4px',
                            }}
                          >
                            {p.parentIc}
                          </div>
                        </div>

                        {/* Pekerjaan */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '10px' }}>
                          <div style={{ width: '25%' }}>Pekerjaan</div>
                          <div style={{ width: '4%' }}>:</div>
                          <div
                            style={{
                              width: '65%',
                              borderBottom: '1px solid #000000',
                              minHeight: '18px',
                              fontWeight: 'bold',
                              paddingLeft: '4px',
                            }}
                          >
                            {p.parentOccupation}
                          </div>
                        </div>

                        {/* Alamat Penuh Rumah (2 lines like official form) */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '10px' }}>
                          <div style={{ width: '25%' }}>Alamat Penuh Rumah</div>
                          <div style={{ width: '4%' }}>:</div>
                          <div
                            style={{
                              width: '65%',
                              borderBottom: '1px solid #000000',
                              minHeight: '18px',
                              fontWeight: 'bold',
                              fontSize: '9.5pt',
                              paddingLeft: '4px',
                            }}
                          >
                            {p.homeAddress}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '10px' }}>
                          <div style={{ width: '29%' }} />
                          <div
                            style={{
                              width: '65%',
                              borderBottom: '1px solid #000000',
                              minHeight: '14px',
                            }}
                          />
                        </div>

                        {/* Telefon : [Rumah], [Pejabat], [HP] */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '10px' }}>
                          <div style={{ width: '25%' }}>Telefon</div>
                          <div style={{ width: '4%' }}>:</div>
                          <div style={{ width: '13%' }}>[Rumah]</div>
                          <div style={{ width: '4%' }}>:</div>
                          <div
                            style={{
                              width: '48%',
                              borderBottomStyle: 'dashed',
                              borderBottomWidth: '1.5px',
                              borderBottomColor: '#000000',
                              minHeight: '18px',
                              fontWeight: 'bold',
                              paddingLeft: '4px',
                            }}
                          >
                            {p.homePhone}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '10px' }}>
                          <div style={{ width: '29%' }} />
                          <div style={{ width: '13%' }}>[Pejabat]</div>
                          <div style={{ width: '4%' }}>:</div>
                          <div
                            style={{
                              width: '48%',
                              borderBottom: '1px solid #000000',
                              minHeight: '18px',
                              fontWeight: 'bold',
                              paddingLeft: '4px',
                            }}
                          >
                            {p.officePhone}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '14px' }}>
                          <div style={{ width: '29%' }} />
                          <div style={{ width: '13%' }}>[HP]</div>
                          <div style={{ width: '4%' }}>:</div>
                          <div
                            style={{
                              width: '48%',
                              borderBottom: '1px solid #000000',
                              minHeight: '18px',
                              fontWeight: 'bold',
                              paddingLeft: '4px',
                            }}
                          >
                            {p.mobilePhone}
                          </div>
                        </div>
                      </div>

                      {/* Thick Horizontal Line separating Pengesahan Pihak Sekolah */}
                      <div
                        style={{
                          borderTop: '2.5px solid #000000',
                          marginTop: '6px',
                          paddingTop: '8px',
                        }}
                      >
                        <div style={{ fontWeight: 'bold', marginBottom: '36px' }}>
                          Pengesahan Pihak Sekolah
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-end',
                          }}
                        >
                          {/* Left: Signature & Details */}
                          <div style={{ width: '58%' }}>
                            <div
                              style={{
                                borderBottom: '1.5px solid #000000',
                                width: '260px',
                                marginBottom: '3px',
                              }}
                            />
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                width: '260px',
                                fontWeight: 'bold',
                                marginBottom: '10px',
                              }}
                            >
                              <span>(</span>
                              <span>{principalName}</span>
                              <span>)</span>
                            </div>
                            <div style={{ fontWeight: 'bold', marginBottom: '12px' }}>
                              Tandatangan Pengetua/Guru Besar
                            </div>
                            <div style={{ fontWeight: 'bold', marginBottom: '14px' }}>
                              Cop Jawatan:
                            </div>
                            <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'flex-end' }}>
                              <span>Tarikh:&nbsp;</span>
                              <span
                                style={{
                                  display: 'inline-block',
                                  width: '215px',
                                  borderBottom: '1.5px solid #000000',
                                  textAlign: 'center',
                                }}
                              >
                                {tarikhPengesahan}
                              </span>
                            </div>
                          </div>

                          {/* Right: Cap Sekolah Circle */}
                          <div
                            style={{
                              width: '35%',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              marginRight: '18px',
                            }}
                          >
                            <div
                              style={{
                                width: '92px',
                                height: '92px',
                                border: '1.5px solid #000000',
                                borderRadius: '50%',
                                marginBottom: '6px',
                              }}
                            />
                            <div style={{ fontWeight: 'bold', fontSize: '10.5pt' }}>
                              Cap Sekolah
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* =====================================================================
                      PAGE 2: BORANG SPPK 2 (100% EXACT MATCH TO OFFICIAL JPNS PDF)
                     ===================================================================== */}
                  {showSppk2 && (
                    <div
                      className="print-page-break bg-white text-black shadow-2xl mx-auto"
                      style={{
                        width: '210mm',
                        minHeight: '297mm',
                        padding: '12mm 18mm 12mm 18mm',
                        boxSizing: 'border-box',
                        fontFamily: 'Arial, Helvetica, sans-serif',
                        fontSize: '10.5pt',
                        lineHeight: 1.35,
                        color: '#000000',
                        backgroundColor: '#ffffff',
                      }}
                    >
                      <OfficialHeader formCode="Borang SPPK 2" />

                      {/* Main Title */}
                      <div
                        style={{
                          textAlign: 'center',
                          fontWeight: 'bold',
                          textDecoration: 'underline',
                          fontSize: '11.5pt',
                          marginBottom: '14px',
                        }}
                      >
                        BORANG DEKLARASI PESERTA SEBELUM PROGRAM
                      </div>

                      {/* Participant Top Lines */}
                      <div style={{ marginBottom: '14px' }}>
                        {/* PROGRAM */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '10px' }}>
                          <span style={{ whiteSpace: 'nowrap', marginRight: '6px' }}>
                            PROGRAM :
                          </span>
                          <div
                            style={{
                              flex: 1,
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              paddingLeft: '4px',
                              minHeight: '18px',
                            }}
                          >
                            {programName}
                          </div>
                        </div>

                        {/* TARIKH ... HINGGA ... */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '10px' }}>
                          <span style={{ whiteSpace: 'nowrap', marginRight: '6px', paddingLeft: '4px' }}>
                            TARIKH :
                          </span>
                          <div
                            style={{
                              width: '28%',
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              textAlign: 'center',
                              minHeight: '18px',
                            }}
                          >
                            {startFormatted}
                          </div>
                          <span style={{ whiteSpace: 'nowrap', margin: '0 8px' }}>
                            HINGGA :
                          </span>
                          <div
                            style={{
                              flex: 1,
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              textAlign: 'center',
                              minHeight: '18px',
                            }}
                          >
                            {endFormatted}
                          </div>
                        </div>

                        {/* NAMA PENUH */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '10px' }}>
                          <span style={{ whiteSpace: 'nowrap', marginRight: '6px' }}>
                            NAMA PENUH (Mengikut Kad Pengenalan/Sijil Lahir :
                          </span>
                          <div
                            style={{
                              flex: 1,
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              paddingLeft: '4px',
                              minHeight: '18px',
                            }}
                          >
                            {p.studentName}
                          </div>
                        </div>

                        {/* ALAMAT ... NO TELEFON */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '14px' }}>
                          <span style={{ whiteSpace: 'nowrap', marginRight: '6px' }}>
                            ALAMAT:
                          </span>
                          <div
                            style={{
                              width: '45%',
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              fontSize: '9pt',
                              paddingLeft: '4px',
                              minHeight: '18px',
                            }}
                          >
                            {p.homeAddress}
                          </div>
                          <span style={{ whiteSpace: 'nowrap', margin: '0 6px' }}>
                            NO TELEFON :
                          </span>
                          <div
                            style={{
                              width: '28%',
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              paddingLeft: '4px',
                              minHeight: '18px',
                            }}
                          >
                            {p.mobilePhone}
                          </div>
                        </div>

                        {/* JANTINA ... UMUR */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '10px' }}>
                          <span style={{ whiteSpace: 'nowrap', marginRight: '6px' }}>
                            JANTINA :
                          </span>
                          <div
                            style={{
                              width: '26%',
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              textAlign: 'center',
                              minHeight: '18px',
                            }}
                          >
                            {p.gender}
                          </div>
                          <span style={{ whiteSpace: 'nowrap', margin: '0 8px 0 18px' }}>
                            UMUR:
                          </span>
                          <div
                            style={{
                              width: '28%',
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              textAlign: 'center',
                              minHeight: '18px',
                            }}
                          >
                            {p.age}
                          </div>
                        </div>

                        {/* TARIKH LAHIR ... NOMBOR KAD PENGENALAN */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '14px' }}>
                          <span style={{ whiteSpace: 'nowrap', marginRight: '6px' }}>
                            TARIKH LAHIR:
                          </span>
                          <div
                            style={{
                              width: '28%',
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              textAlign: 'center',
                              minHeight: '18px',
                            }}
                          >
                            {p.birthDate}
                          </div>
                          <span style={{ whiteSpace: 'nowrap', margin: '0 6px 0 14px' }}>
                            NOMBOR KAD PENGENALAN:
                          </span>
                          <div
                            style={{
                              flex: 1,
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              textAlign: 'center',
                              minHeight: '18px',
                            }}
                          >
                            {p.studentIc}
                          </div>
                        </div>
                      </div>

                      {/* Emergency Contact Block */}
                      <div style={{ marginBottom: '14px' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>
                          PIHAK YANG PERLU DIHUBUNGI JIKA BERLAKUNYA KECEDERAAN ATAU KEMALANGAN:
                        </div>

                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '5px' }}>
                          <span style={{ whiteSpace: 'nowrap', marginRight: '6px' }}>NAMA:</span>
                          <div
                            style={{
                              width: '48%',
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              paddingLeft: '4px',
                              minHeight: '17px',
                            }}
                          >
                            {p.parentName}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '5px' }}>
                          <span style={{ whiteSpace: 'nowrap', marginRight: '6px' }}>HUBUNGAN:</span>
                          <div
                            style={{
                              width: '43%',
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              paddingLeft: '4px',
                              minHeight: '17px',
                            }}
                          >
                            {p.relationship}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '5px' }}>
                          <span style={{ whiteSpace: 'nowrap', marginRight: '6px' }}>ALAMAT:</span>
                          <div
                            style={{
                              width: '48%',
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              fontSize: '9pt',
                              paddingLeft: '4px',
                              minHeight: '17px',
                            }}
                          >
                            {p.homeAddress}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '5px' }}>
                          <span style={{ whiteSpace: 'nowrap', marginRight: '6px' }}>NO.TELEFON:</span>
                          <div
                            style={{
                              width: '40%',
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              paddingLeft: '4px',
                              minHeight: '17px',
                            }}
                          >
                            {p.officePhone || p.homePhone}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '12px' }}>
                          <span style={{ whiteSpace: 'nowrap', marginRight: '6px' }}>NO. TEL. BIMBIT:</span>
                          <div
                            style={{
                              width: '40%',
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              paddingLeft: '4px',
                              minHeight: '17px',
                            }}
                          >
                            {p.mobilePhone}
                          </div>
                        </div>
                      </div>

                      {/* SEJARAH PERUBATAN */}
                      <div>
                        <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>
                          SEJARAH PERUBATAN
                        </div>
                        <div style={{ marginBottom: '2px' }}>
                          Pernahkah anda menerima immunisasi Tetanus? YA / TIDAK &nbsp;(Sila bulatkan)
                        </div>
                        <div style={{ marginBottom: '4px' }}>
                          Sila nyatakan anggaran tarikh immunsasi/penuja yang diambil: _____/_______/______.
                        </div>
                        <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>
                          Sila tandakan /
                        </div>

                        {/* 2-Column Side-by-Side Medical Checklist Table */}
                        <table
                          style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            fontSize: '10.5pt',
                          }}
                        >
                          <thead>
                            <tr>
                              <th style={{ width: '37%', border: 'none' }} />
                              <th
                                style={{
                                  width: '6.5%',
                                  border: 'none',
                                  fontWeight: 'bold',
                                  textAlign: 'center',
                                  paddingBottom: '2px',
                                }}
                              >
                                Ya
                              </th>
                              <th
                                style={{
                                  width: '6.5%',
                                  border: 'none',
                                  fontWeight: 'bold',
                                  textAlign: 'center',
                                  paddingBottom: '2px',
                                }}
                              >
                                Tidak
                              </th>
                              <th style={{ width: '37%', border: 'none' }} />
                              <th
                                style={{
                                  width: '6.5%',
                                  border: 'none',
                                  fontWeight: 'bold',
                                  textAlign: 'center',
                                  paddingBottom: '2px',
                                }}
                              >
                                Ya
                              </th>
                              <th
                                style={{
                                  width: '6.5%',
                                  border: 'none',
                                  fontWeight: 'bold',
                                  textAlign: 'center',
                                  paddingBottom: '2px',
                                }}
                              >
                                Tidak
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              {
                                left: 'Kecederaan pada sendi atau tulang',
                                right: 'Kecederaan atau pembedahan terkini',
                              },
                              {
                                left: 'Alah sengatan lebah, ubat-ubatan, air laut dll.',
                                right: 'Masalah Penafasan/Penyakit asma',
                              },
                              {
                                left: 'Mabuk Laut atau pergerakan',
                                right: 'Sawan',
                              },
                              {
                                left: 'Masalah psikologi atau kelakuan',
                                right: 'Diabetes',
                              },
                              {
                                left: 'Migrain/ pening kepala yang teruk',
                                right: 'Lain-lain masalah (nyatakan)',
                              },
                            ].map((row, rIdx) => (
                              <tr key={rIdx}>
                                <td
                                  style={{
                                    border: '1px solid #000000',
                                    padding: '4px 6px',
                                    verticalAlign: 'top',
                                  }}
                                >
                                  {row.left}
                                </td>
                                <td
                                  style={{
                                    border: '1px solid #000000',
                                    textAlign: 'center',
                                    verticalAlign: 'middle',
                                  }}
                                />
                                <td
                                  style={{
                                    border: '1px solid #000000',
                                    textAlign: 'center',
                                    verticalAlign: 'middle',
                                    fontWeight: 'bold',
                                  }}
                                >
                                  {preTickMedicalNo ? '/' : ''}
                                </td>
                                <td
                                  style={{
                                    border: '1px solid #000000',
                                    padding: '4px 6px',
                                    verticalAlign: 'top',
                                  }}
                                >
                                  {row.right}
                                </td>
                                <td
                                  style={{
                                    border: '1px solid #000000',
                                    textAlign: 'center',
                                    verticalAlign: 'middle',
                                  }}
                                />
                                <td
                                  style={{
                                    border: '1px solid #000000',
                                    textAlign: 'center',
                                    verticalAlign: 'middle',
                                    fontWeight: 'bold',
                                  }}
                                >
                                  {preTickMedicalNo ? '/' : ''}
                                </td>
                              </tr>
                            ))}

                            {/* Row 6: Full-width infectious disease question */}
                            <tr>
                              <td
                                colSpan={4}
                                style={{
                                  border: '1px solid #000000',
                                  padding: '5px 6px',
                                  textAlign: 'justify',
                                }}
                              >
                                Pernahkah anda sebulan yang lalu menghadapi sebarang penyakit berjangkit ataupun terdedah kepada mereka yang mengalami penyakit cirit-birit . atau adakah anda pembawa kepada sebarang penyakit?
                              </td>
                              <td
                                style={{
                                  border: '1px solid #000000',
                                  textAlign: 'center',
                                  verticalAlign: 'middle',
                                }}
                              />
                              <td
                                style={{
                                  border: '1px solid #000000',
                                  textAlign: 'center',
                                  verticalAlign: 'middle',
                                  fontWeight: 'bold',
                                }}
                              >
                                {preTickMedicalNo ? '/' : ''}
                              </td>
                            </tr>
                          </tbody>
                        </table>

                        <div
                          style={{
                            marginTop: '6px',
                            fontStyle: 'italic',
                            textAlign: 'justify',
                            fontSize: '10pt',
                          }}
                        >
                          Sekiranya anda menjawab <strong>Ya</strong> pada <strong>SEBARANG</strong> soalan di atas, sila berikan maklumat terperinci di ruang yang disediakan. Sila nyatakan jika keadaan sekarang atau yang lepas perlu diberi perhatian yang lebih semasa aktiviti berlangsung. Lampiran kertas tambahan sekiranya yang disediakan tidak mencukupi.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* =====================================================================
                      PAGE 3: BORANG SPPK 3 (100% EXACT MATCH TO OFFICIAL JPNS PDF)
                     ===================================================================== */}
                  {showSppk3 && (
                    <div
                      className="print-page-break bg-white text-black shadow-2xl mx-auto"
                      style={{
                        width: '210mm',
                        minHeight: '297mm',
                        padding: '12mm 18mm 12mm 18mm',
                        boxSizing: 'border-box',
                        fontFamily: 'Arial, Helvetica, sans-serif',
                        fontSize: '10.5pt',
                        lineHeight: 1.35,
                        color: '#000000',
                        backgroundColor: '#ffffff',
                      }}
                    >
                      <OfficialHeader formCode="Borang SPPK 3" />

                      {/* Main Title */}
                      <div
                        style={{
                          textAlign: 'center',
                          fontWeight: 'bold',
                          textDecoration: 'underline',
                          fontSize: '11.5pt',
                          marginBottom: '14px',
                        }}
                      >
                        BORANG DEKLARASI PESERTA SELEPAS PROGRAM
                      </div>

                      {/* Participant Top Lines */}
                      <div style={{ marginBottom: '14px' }}>
                        {/* PROGRAM */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '10px' }}>
                          <span style={{ whiteSpace: 'nowrap', marginRight: '6px' }}>
                            PROGRAM :
                          </span>
                          <div
                            style={{
                              flex: 1,
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              paddingLeft: '4px',
                              minHeight: '18px',
                            }}
                          >
                            {programName}
                          </div>
                        </div>

                        {/* TARIKH ... HINGGA ... */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '10px' }}>
                          <span style={{ whiteSpace: 'nowrap', marginRight: '6px', paddingLeft: '4px' }}>
                            TARIKH :
                          </span>
                          <div
                            style={{
                              width: '28%',
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              textAlign: 'center',
                              minHeight: '18px',
                            }}
                          >
                            {startFormatted}
                          </div>
                          <span style={{ whiteSpace: 'nowrap', margin: '0 8px' }}>
                            HINGGA :
                          </span>
                          <div
                            style={{
                              flex: 1,
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              textAlign: 'center',
                              minHeight: '18px',
                            }}
                          >
                            {endFormatted}
                          </div>
                        </div>

                        {/* NAMA PENUH */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '10px' }}>
                          <span style={{ whiteSpace: 'nowrap', marginRight: '6px' }}>
                            NAMA PENUH (Mengikut Kad Pengenalan/Sijil Lahir :
                          </span>
                          <div
                            style={{
                              flex: 1,
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              paddingLeft: '4px',
                              minHeight: '18px',
                            }}
                          >
                            {p.studentName}
                          </div>
                        </div>

                        {/* ALAMAT ... NO TELEFON */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '14px' }}>
                          <span style={{ whiteSpace: 'nowrap', marginRight: '6px' }}>
                            ALAMAT:
                          </span>
                          <div
                            style={{
                              width: '45%',
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              fontSize: '9pt',
                              paddingLeft: '4px',
                              minHeight: '18px',
                            }}
                          >
                            {p.homeAddress}
                          </div>
                          <span style={{ whiteSpace: 'nowrap', margin: '0 6px' }}>
                            NO TELEFON :
                          </span>
                          <div
                            style={{
                              width: '28%',
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              paddingLeft: '4px',
                              minHeight: '18px',
                            }}
                          >
                            {p.mobilePhone}
                          </div>
                        </div>

                        {/* JANTINA ... UMUR */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '10px' }}>
                          <span style={{ whiteSpace: 'nowrap', marginRight: '6px' }}>
                            JANTINA :
                          </span>
                          <div
                            style={{
                              width: '26%',
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              textAlign: 'center',
                              minHeight: '18px',
                            }}
                          >
                            {p.gender}
                          </div>
                          <span style={{ whiteSpace: 'nowrap', margin: '0 8px 0 18px' }}>
                            UMUR:
                          </span>
                          <div
                            style={{
                              width: '28%',
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              textAlign: 'center',
                              minHeight: '18px',
                            }}
                          >
                            {p.age}
                          </div>
                        </div>

                        {/* TARIKH LAHIR ... NOMBOR KAD PENGENALAN */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '14px' }}>
                          <span style={{ whiteSpace: 'nowrap', marginRight: '6px' }}>
                            TARIKH LAHIR:
                          </span>
                          <div
                            style={{
                              width: '28%',
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              textAlign: 'center',
                              minHeight: '18px',
                            }}
                          >
                            {p.birthDate}
                          </div>
                          <span style={{ whiteSpace: 'nowrap', margin: '0 6px 0 14px' }}>
                            NOMBOR KAD PENGENALAN:
                          </span>
                          <div
                            style={{
                              flex: 1,
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              textAlign: 'center',
                              minHeight: '18px',
                            }}
                          >
                            {p.studentIc}
                          </div>
                        </div>
                      </div>

                      {/* Emergency Contact Block */}
                      <div style={{ marginBottom: '14px' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>
                          PIHAK YANG PERLU DIHUBUNGI JIKA BERLAKUNYA KECEDERAAN ATAU KEMALANGAN:
                        </div>

                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '5px' }}>
                          <span style={{ whiteSpace: 'nowrap', marginRight: '6px' }}>NAMA:</span>
                          <div
                            style={{
                              width: '54%',
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              paddingLeft: '4px',
                              minHeight: '17px',
                            }}
                          >
                            {p.parentName}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '5px' }}>
                          <span style={{ whiteSpace: 'nowrap', marginRight: '6px' }}>HUBUNGAN:</span>
                          <div
                            style={{
                              width: '49%',
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              paddingLeft: '4px',
                              minHeight: '17px',
                            }}
                          >
                            {p.relationship}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '5px' }}>
                          <span style={{ whiteSpace: 'nowrap', marginRight: '6px' }}>ALAMAT:</span>
                          <div
                            style={{
                              width: '52%',
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              fontSize: '9pt',
                              paddingLeft: '4px',
                              minHeight: '17px',
                            }}
                          >
                            {p.homeAddress}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '5px' }}>
                          <span style={{ whiteSpace: 'nowrap', marginRight: '6px' }}>NO.TELEFON:</span>
                          <div
                            style={{
                              width: '46%',
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              paddingLeft: '4px',
                              minHeight: '17px',
                            }}
                          >
                            {p.officePhone || p.homePhone}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '14px' }}>
                          <span style={{ whiteSpace: 'nowrap', marginRight: '6px' }}>NO. TEL. BIMBIT:</span>
                          <div
                            style={{
                              width: '44%',
                              borderBottom: '1px solid #000000',
                              fontWeight: 'bold',
                              paddingLeft: '4px',
                              minHeight: '17px',
                            }}
                          >
                            {p.mobilePhone}
                          </div>
                        </div>
                      </div>

                      {/* SAKIT/KECEDERAAN/RAWATAN SEMASA PROGRAM */}
                      <div>
                        <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>
                          SAKIT/KECEDERAAN/RAWATAN SEMASA PROGRAM
                        </div>
                        <div style={{ marginBottom: '2px' }}>
                          Adakah anda mendapat sakit / kecederaan? &nbsp;YA / TIDAK &nbsp;(Sila bulatkan)
                        </div>
                        <div style={{ marginBottom: '2px' }}>
                          Adakah anda mendapat rawatan? &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;YA / TIDAK &nbsp;(Sila bulatkan)
                        </div>
                        <div style={{ marginBottom: '14px' }}>
                          Sila nyatakan tarikh : _____/_______/____ Tempat Rawatan : ____________________
                        </div>

                        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                          Sekiranya anda menjawab Ya pada SEBARANG soalan di atas, sila berikan maklumat terperinci di ruang yang disediakan.
                        </div>

                        {/* 2-Column Boxed Table: JENIS SAKIT/KECEDERAAN | JENIS RAWATAN */}
                        <table
                          style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            border: '1px solid #000000',
                            fontSize: '10.5pt',
                          }}
                        >
                          <thead>
                            <tr>
                              <th
                                style={{
                                  width: '50%',
                                  border: '1px solid #000000',
                                  padding: '6px',
                                  fontWeight: 'bold',
                                  textAlign: 'center',
                                }}
                              >
                                JENIS SAKIT/KECEDERAAN
                              </th>
                              <th
                                style={{
                                  width: '50%',
                                  border: '1px solid #000000',
                                  padding: '6px',
                                  fontWeight: 'bold',
                                  textAlign: 'center',
                                }}
                              >
                                JENIS RAWATAN
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td
                                style={{
                                  border: '1px solid #000000',
                                  height: '215px',
                                  verticalAlign: 'top',
                                  padding: '8px',
                                }}
                              >
                                {p.jenisSakitKecederaan || ''}
                              </td>
                              <td
                                style={{
                                  border: '1px solid #000000',
                                  height: '215px',
                                  verticalAlign: 'top',
                                  padding: '8px',
                                }}
                              >
                                {p.jenisRawatan || ''}
                              </td>
                            </tr>
                          </tbody>
                        </table>

                        <div
                          style={{
                            marginTop: '6px',
                            fontWeight: 'bold',
                            fontStyle: 'italic',
                            textAlign: 'justify',
                            fontSize: '10pt',
                          }}
                        >
                          Sila nyatakan jika keadaan sekarang perlu diberi perhatian yang lebih dan lampirkan kertas tambahan sekiranya ruang yang disediakan tidak mencukupi.
                        </div>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SPPKCompetitionFormsModal;
