import React, { useState, useEffect, useMemo } from 'react';
import {
  Mail,
  Plus,
  Printer,
  Calendar,
  Clock,
  Send,
  Search,
  UserCheck,
  FolderOpen,
  X,
  FileText,
  CheckCircle2,
  AlertCircle,
  Trash2,
  ShieldAlert,
  Users
} from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
  getDocs
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { UserProfile, SchoolSettings } from '../types';
import { SmartDatePicker } from './Common/SmartDatePicker';
import { useSchoolTenant } from '../contexts/SchoolTenantContext';
import { belongsToSchool, scopedDocId } from '../utils/schoolTenant';

export type SuratDomain = 'PENTADBIRAN' | 'KURIKULUM' | 'HEM' | 'KOKURIKULUM';

export type ArahanTindakanType =
  | 'UNTUK_TINDAKAN'         // Untuk tindakan (Wajib Tarikh Akhir)
  | 'SILA_URUS'              // Sila urus (Wajib Tarikh Akhir)
  | 'SILA_BINCANG_DENGAN_GB' // Sila bincang dengan GB (Auto-notifies assigned teacher and GB)
  | 'UNTUK_SIMPANAN_FAIL'    // Untuk simpanan fail (Log & cetakan sahaja, tiada overdue task)
  | 'UNTUK_DIPAMERKAN'       // Untuk dipamerkan (Papan kenyataan makluman umum)
  | 'PERLU_HADIR'            // Perlu hadir (Kursus / Mesyuarat Luar)
  | 'HANTAR_LAPORAN';        // Perlu hantar laporan / data (Wajib Tarikh Akhir)

export type SuratActionMode =
  | 'PERLU_HADIR'
  | 'HANTAR_LAPORAN'
  | 'HADIR_DAN_LAPOR'
  | 'MAKLUMAN_SAHAJA';

export interface TeacherProfile {
  teacherId: string;
  fullName: string;
  email?: string;
  phone?: string;
  position?: string;
  status?: string;
  category?: 'GURU' | 'AKP' | 'PRINCIPAL' | string;
  subRole?: string;
  leadershipRole?: string;
}

export interface SchoolProfile {
  schoolName: string;
  schoolCode: string;
  principalName?: string;
}

export interface SchoolAcademicAssignment {
  teacherId: string;
  classId: string;
  className: string;
  subjectCode: string;
  subjectName: string;
  weeklyPeriods?: number;
  status?: string;
}

export interface SuratMasukRecord {
  id: string;
  tarikhSurat: string;         // YYYY-MM-DD (format cetakan DD.MM.YYYY)
  tarikhTerima: string;        // YYYY-MM-DD (penentu bulan daftar)
  bulanTahunLabel: string;     // e.g. "2026-10"
  perkara: string;             // Tajuk surat (uppercase)
  noRujukanLuar: string;       // e.g. "PPDMKH.600-7/11/17(19)"
  noFailSekolah: string;       // e.g. "Sjkcch.600-3/2/18"
  domain: SuratDomain;
  arahanTindakan: ArahanTindakanType;
  arahanBadge: string;         // e.g. "UNTUK TINDAKAN", "SILA URUS", "HADIR"
  tindakanTeacherIds: string[];
  supervisorTeacherIds: string[];
  tindakanCustomLabel: string; // e.g. "DORIS TIONG SHU QI\nTEO YANG MING"
  tarikhAkhirTindakan?: string; // YYYY-MM-DD
  actionMode: SuratActionMode;
  // Maklumat Hadir jika berkaitan
  tarikhHadirMula?: string;
  tarikhHadirTamat?: string;
  masaHadir?: string;
  lokasiHadir?: string;
  jenisKeberadaan?: 'KURSUS' | 'URUSAN_RASMI';
  perluJadualGanti?: boolean;
  // Maklumat Laporan jika berkaitan
  tarikhAkhirLaporan?: string;
  catatanLaporan?: string;
  // Linkages
  linkedMaklumanIds?: string[];
  linkedUnavailabilityIds?: string[];
  linkedReliefAlertId?: string;
  createdByUid: string;
  createdByName: string;
  createdAt: string;
}

export interface SuratMasukManagerViewProps {
  currentUid?: string;
  currentUserName?: string;
  allTeachers?: TeacherProfile[];
  academicAssignments?: SchoolAcademicAssignment[];
  schoolProfile?: SchoolProfile | SchoolSettings | null;
  addToast?: (msg: string, type?: 'info' | 'success' | 'warning') => void;
  onNavigateToRelief?: () => void;
}

const MALAY_MONTHS = [
  'JANUARI', 'FEBRUARI', 'MAC', 'APRIL', 'MEI', 'JUN',
  'JULAI', 'OGOS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DISEMBER'
];

const formatDotDate = (yyyyMmDd?: string): string => {
  if (!yyyyMmDd) return '-';
  const parts = yyyyMmDd.split('-');
  if (parts.length !== 3) return yyyyMmDd;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
};

const formatWhatsAppPhone = (rawPhone?: string): string => {
  if (!rawPhone) return '';
  const digits = rawPhone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('60')) return digits;
  if (digits.startsWith('0')) return `6${digits}`;
  return `60${digits}`;
};

export const ARAHAN_TINDAKAN_META: Record<
  ArahanTindakanType,
  {
    label: string;
    badgeLabel: string;
    desc: string;
    requiresDeadline: boolean;
    colorClass: string;
    bgClass: string;
    borderClass: string;
  }
> = {
  UNTUK_TINDAKAN: {
    label: 'Untuk tindakan',
    badgeLabel: 'UNTUK TINDAKAN',
    desc: 'Tindakan segera oleh guru yang dinamakan (Wajib Tarikh Akhir)',
    requiresDeadline: true,
    colorClass: 'text-amber-300',
    bgClass: 'bg-amber-500/20',
    borderClass: 'border-amber-500/30',
  },
  SILA_URUS: {
    label: 'Sila urus',
    badgeLabel: 'SILA URUS',
    desc: 'Pengurusan tugasan/program sehingga selesai (Wajib Tarikh Akhir)',
    requiresDeadline: true,
    colorClass: 'text-blue-300',
    bgClass: 'bg-blue-500/20',
    borderClass: 'border-blue-500/30',
  },
  SILA_BINCANG_DENGAN_GB: {
    label: 'Sila bincang dengan GB',
    badgeLabel: 'SILA BINCANG DENGAN GB',
    desc: 'Perbincangan lanjut bersama Guru Besar sebelum tindakan diambil',
    requiresDeadline: false,
    colorClass: 'text-purple-300',
    bgClass: 'bg-purple-500/20',
    borderClass: 'border-purple-500/30',
  },
  UNTUK_SIMPANAN_FAIL: {
    label: 'Untuk simpanan fail',
    badgeLabel: 'UNTUK SIMPANAN FAIL',
    desc: 'Rekod & pemfailan surat rasmi (tanpa penjejakan tugasan tertunggak)',
    requiresDeadline: false,
    colorClass: 'text-slate-300',
    bgClass: 'bg-slate-700/30',
    borderClass: 'border-slate-600/40',
  },
  UNTUK_DIPAMERKAN: {
    label: 'Untuk dipamerkan',
    badgeLabel: 'UNTUK DIPAMERKAN',
    desc: 'Dipamerkan di papan kenyataan sekolah untuk makluman semua warga',
    requiresDeadline: false,
    colorClass: 'text-emerald-300',
    bgClass: 'bg-emerald-500/20',
    borderClass: 'border-emerald-500/30',
  },
  PERLU_HADIR: {
    label: 'Perlu Hadir (Kursus / Mesyuarat Luar)',
    badgeLabel: 'HADIR',
    desc: 'Kehadiran luar sekolah (Auto Makluman + Keberadaan + Jadual Ganti)',
    requiresDeadline: false,
    colorClass: 'text-indigo-300',
    bgClass: 'bg-indigo-500/20',
    borderClass: 'border-indigo-500/30',
  },
  HANTAR_LAPORAN: {
    label: 'Perlu Hantar Laporan / Data',
    badgeLabel: 'HANTAR LAPORAN',
    desc: 'Penghantaran laporan/data kepada PPD/JPN (Wajib Tarikh Akhir)',
    requiresDeadline: true,
    colorClass: 'text-rose-300',
    bgClass: 'bg-rose-500/20',
    borderClass: 'border-rose-500/30',
  },
};

/**
 * Automates supervisory copy routing:
 * - PENTADBIRAN or KURIKULUM -> Guru Besar (GB) + PK Pentadbiran (PKP)
 * - HEM -> Guru Besar (GB) + PK HEM (PKHEM)
 * - KOKURIKULUM -> Guru Besar (GB) + PK Kokurikulum (PKKK)
 */
export function resolveAutoCopiedSupervisorIds(
  domain: SuratDomain,
  allStaff: TeacherProfile[],
  isLegacySchool: boolean = false
): string[] {
  const supervisorIds = new Set<string>();

  allStaff.forEach((s) => {
    const subRole = ((s as any).subRole || (s as any).leadershipRole || '').toUpperCase();
    const pos = (s.position || '').toUpperCase();
    const name = (s.fullName || '').toUpperCase();
    const cat = s.category;

    // 1. Guru Besar (GB) always copied
    if (
      subRole === 'GB' ||
      cat === 'PRINCIPAL' ||
      pos.includes('GURU BESAR') ||
      (isLegacySchool && name.includes('TEO YANG MING'))
    ) {
      supervisorIds.add(s.teacherId);
    }

    // 2. Domain-targeted Penolong Kanan
    if (domain === 'HEM') {
      if (
        subRole === 'PKHEM' ||
        pos.includes('HEM') ||
        pos.includes('HAL EHWAL MURID') ||
        pos.includes('PK HEM')
      ) {
        supervisorIds.add(s.teacherId);
      }
    } else if (domain === 'KOKURIKULUM') {
      if (
        subRole === 'PKKK' ||
        pos.includes('KOKURIKULUM') ||
        pos.includes('KO-KURIKULUM') ||
        pos.includes('PK KK') ||
        pos.includes('PKKO')
      ) {
        supervisorIds.add(s.teacherId);
      }
    } else {
      // PENTADBIRAN & KURIKULUM -> PKP
      if (
        subRole === 'PKP' ||
        pos.includes('PENTADBIRAN') ||
        pos.includes('PK 1') ||
        pos.includes('PK1') ||
        pos.includes('PK PENTADBIRAN')
      ) {
        supervisorIds.add(s.teacherId);
      }
    }
  });

  return Array.from(supervisorIds);
}

/**
 * Clean data recursively to eliminate undefined values for Firestore WriteBatch
 */
function cleanFirestoreData<T extends Record<string, any>>(obj: T): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        result[key] = cleanFirestoreData(value);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

export const SuratMasukManagerView: React.FC<SuratMasukManagerViewProps> = ({
  currentUid,
  currentUserName,
  allTeachers: propTeachers,
  academicAssignments: propAssignments,
  schoolProfile,
  addToast: propAddToast,
  onNavigateToRelief,
}) => {
  const { schoolCode: activeSchoolCode, schoolName: tenantSchoolName, isLegacySchool } = useSchoolTenant();
  const [internalTeachers, setInternalTeachers] = useState<TeacherProfile[]>([]);
  const [internalAssignments, setInternalAssignments] = useState<SchoolAcademicAssignment[]>([]);
  const [localToast, setLocalToast] = useState<{ msg: string; type: 'info' | 'success' | 'warning' } | null>(null);

  const addToast = (msg: string, type: 'info' | 'success' | 'warning' = 'info') => {
    if (propAddToast) {
      propAddToast(msg, type);
    } else {
      setLocalToast({ msg, type });
      setTimeout(() => setLocalToast(null), 4000);
    }
  };

  const activeUid = currentUid || auth.currentUser?.uid || 'system_po';
  const activeName = currentUserName || auth.currentUser?.displayName || 'Pembantu Operasi (PO)';

  // Auto-hydrate staff profiles with subRole
  useEffect(() => {
    if (propTeachers && propTeachers.length > 0) {
      setInternalTeachers(propTeachers);
      return;
    }

    let isMounted = true;
    async function hydrateStaff() {
      try {
        const [usersSnap, personnelSnap, teacherProfilesSnap] = await Promise.all([
          getDocs(collection(db, 'users')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'personnel')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'teacher_profiles')).catch(() => ({ docs: [] })),
        ]);

        const map = new Map<string, TeacherProfile>();

        // Load personnel scoped to active school
        personnelSnap.docs.forEach((d) => {
          const data = d.data();
          if (!belongsToSchool(data, activeSchoolCode)) return;
          map.set(d.id, {
            teacherId: d.id,
            fullName: data.name || data.fullName || d.id,
            email: data.email || '',
            phone: data.phone || data.mobilePhone || '',
            position: data.position || data.role || data.jawatan || '',
            status: data.status || 'ACTIVE',
            category: data.category || 'GURU',
            subRole: data.subRole || data.primaryRoleCode || '',
            leadershipRole: data.leadershipRole || '',
          });
        });

        // Supplement from users scoped to active school
        usersSnap.docs.forEach((d) => {
          const data = d.data();
          if (!belongsToSchool(data, activeSchoolCode)) return;
          const existing = map.get(d.id);
          if (!existing) {
            map.set(d.id, {
              teacherId: d.id,
              fullName: data.name || data.displayName || d.id,
              email: data.email || '',
              phone: data.phone || '',
              position: data.position || data.role || '',
              status: data.active !== false ? 'ACTIVE' : 'INACTIVE',
              category: data.category || 'GURU',
              subRole: data.subRole || data.primaryRoleCode || '',
              leadershipRole: data.leadershipRole || '',
            });
          } else {
            if (data.subRole && !existing.subRole) existing.subRole = data.subRole;
            if (data.leadershipRole && !existing.leadershipRole) existing.leadershipRole = data.leadershipRole;
          }
        });

        // Supplement from teacher_profiles scoped to active school
        teacherProfilesSnap.docs.forEach((d) => {
          const data = d.data();
          if (!belongsToSchool(data, activeSchoolCode)) return;
          const existing = map.get(d.id);
          if (existing) {
            if (data.subRole && !existing.subRole) existing.subRole = data.subRole;
            if (data.leadershipRole && !existing.leadershipRole) existing.leadershipRole = data.leadershipRole;
          }
        });

        if (isMounted) {
          setInternalTeachers(Array.from(map.values()));
        }
      } catch (err) {
        console.warn('Hydrate teachers for SuratMasuk:', err);
      }
    }
    hydrateStaff();

    return () => {
      isMounted = false;
    };
  }, [propTeachers, activeSchoolCode]);

  // Auto-hydrate academic assignments for relief schedule routing
  useEffect(() => {
    if (propAssignments && propAssignments.length > 0) {
      setInternalAssignments(propAssignments);
      return;
    }

    let isMounted = true;
    async function hydrateAssignments() {
      try {
        const snap = await getDocs(collection(db, 'subject_allocations')).catch(() => ({ docs: [] }));
        const list: SchoolAcademicAssignment[] = [];
        snap.docs.forEach((d) => {
          const data = d.data();
          if (!belongsToSchool(data, activeSchoolCode)) return;
          list.push({
            teacherId: data.teacherId || data.teacherCode || '',
            classId: String(data.year || data.grade || data.classId || ''),
            className: data.className || `Tahun ${data.year || data.grade || ''}`,
            subjectCode: data.subjectCode || '',
            subjectName: data.subjectName || data.subjectCode || '',
            weeklyPeriods: Number(data.periods || data.totalPeriods || 0),
            status: 'ACTIVE',
          });
        });
        if (isMounted) {
          setInternalAssignments(list);
        }
      } catch (err) {
        console.warn('Hydrate assignments for SuratMasuk:', err);
      }
    }
    hydrateAssignments();

    return () => {
      isMounted = false;
    };
  }, [propAssignments, activeSchoolCode]);

  const allTeachers = propTeachers && propTeachers.length > 0 ? propTeachers : internalTeachers;
  const academicAssignments = propAssignments && propAssignments.length > 0 ? propAssignments : internalAssignments;

  const [records, setRecords] = useState<SuratMasukRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'SENARAI' | 'CETAK_WORD'>('SENARAI');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // Form states
  const todayStr = new Date().toISOString().slice(0, 10);
  const [tarikhSurat, setTarikhSurat] = useState<string>(todayStr);
  const [tarikhTerima, setTarikhTerima] = useState<string>(todayStr);
  const [perkara, setPerkara] = useState<string>('');
  const [noRujukanLuar, setNoRujukanLuar] = useState<string>(isLegacySchool ? 'PPDMKH.' : '');
  const [noFailSekolah, setNoFailSekolah] = useState<string>(isLegacySchool ? 'Sjkcch.' : '');
  const [domain, setDomain] = useState<SuratDomain>('PENTADBIRAN');

  // The 5 Official Dispositions + Perlu Hadir / Laporan
  const [arahanTindakan, setArahanTindakan] = useState<ArahanTindakanType>('UNTUK_TINDAKAN');
  const [tarikhAkhirTindakan, setTarikhAkhirTindakan] = useState<string>(todayStr);

  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [customTindakanText, setCustomTindakanText] = useState<string>('');

  // Mode & Attend settings
  const [actionMode, setActionMode] = useState<SuratActionMode>('MAKLUMAN_SAHAJA');
  const [eventCategory, setEventCategory] = useState<'AKTIVITI' | 'MESYUARAT' | 'KURSUS' | 'TUGASAN'>('TUGASAN');

  const [tarikhHadirMula, setTarikhHadirMula] = useState<string>(todayStr);
  const [tarikhHadirTamat, setTarikhHadirTamat] = useState<string>(todayStr);
  const [masaHadir, setMasaHadir] = useState<string>('SEPANJANG_HARI');
  const [lokasiHadir, setLokasiHadir] = useState<string>(isLegacySchool ? 'PPD Mukah / PKG' : '');
  const [jenisKeberadaan, setJenisKeberadaan] = useState<'KURSUS' | 'URUSAN_RASMI'>('URUSAN_RASMI');
  const [perluJadualGanti, setPerluJadualGanti] = useState<boolean>(true);
  const [catatanLaporan, setCatatanLaporan] = useState<string>('');

  const activeTeachers = useMemo(
    () => allTeachers.filter((t) => t.status === 'ACTIVE' || !t.status),
    [allTeachers]
  );

  useEffect(() => {
    const q = query(collection(db, 'surat_masuk_records'), orderBy('tarikhSurat', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: SuratMasukRecord[] = [];
        snap.forEach((d) => {
          const data = d.data() as Omit<SuratMasukRecord, 'id'>;
          if (belongsToSchool(data, activeSchoolCode)) {
            list.push({ id: d.id, ...data });
          }
        });
        setRecords(list);
        setLoading(false);
      },
      (err) => {
        console.error('Error loading surat_masuk_records:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [activeSchoolCode]);

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const matchMonth = !selectedMonth || r.bulanTahunLabel === selectedMonth;
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        r.perkara.toLowerCase().includes(q) ||
        r.noRujukanLuar.toLowerCase().includes(q) ||
        r.noFailSekolah.toLowerCase().includes(q) ||
        (r.tindakanCustomLabel || '').toLowerCase().includes(q) ||
        (r.arahanBadge || '').toLowerCase().includes(q);
      return matchMonth && matchQuery;
    });
  }, [records, selectedMonth, searchQuery]);

  const formattedMonthHeading = useMemo(() => {
    if (!selectedMonth) return 'SURAT MASUK SEKOLAH';
    const [yr, mo] = selectedMonth.split('-');
    const mIdx = parseInt(mo, 10) - 1;
    const mName = MALAY_MONTHS[mIdx] || mo;
    return `SURAT MASUK BULAN ${mName} ${yr}`;
  }, [selectedMonth]);

  // Handle disposition switch
  const handleSelectArahan = (type: ArahanTindakanType) => {
    setArahanTindakan(type);
    if (type === 'PERLU_HADIR') {
      setActionMode('PERLU_HADIR');
      setEventCategory('KURSUS');
    } else if (type === 'HANTAR_LAPORAN') {
      setActionMode('HANTAR_LAPORAN');
      setEventCategory('TUGASAN');
    } else if (type === 'UNTUK_TINDAKAN' || type === 'SILA_URUS') {
      setActionMode('MAKLUMAN_SAHAJA');
      setEventCategory('TUGASAN');
    } else if (type === 'SILA_BINCANG_DENGAN_GB') {
      setActionMode('MAKLUMAN_SAHAJA');
      setEventCategory('MESYUARAT');
    } else {
      setActionMode('MAKLUMAN_SAHAJA');
      setEventCategory('AKTIVITI');
    }
  };

  // Save incoming letter with 4-way synchronization & mandatory deadline verification
  const handleSaveSuratMasuk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!perkara.trim()) {
      addToast('Sila masukkan Perkara / Tajuk Surat.', 'warning');
      return;
    }

    const currentMeta = ARAHAN_TINDAKAN_META[arahanTindakan];
    const isMandatoryDeadline = currentMeta.requiresDeadline || actionMode === 'HANTAR_LAPORAN' || actionMode === 'HADIR_DAN_LAPOR';

    if (isMandatoryDeadline && !tarikhAkhirTindakan) {
      addToast(
        `Sila tetapkan Tarikh Akhir bagi arahan "${currentMeta.label}". Tarikh akhir adalah wajib!`,
        'warning'
      );
      return;
    }

    try {
      setSaving(true);
      const batch = writeBatch(db);
      const suratId = scopedDocId(activeSchoolCode, `surat_${Date.now()}`);
      const bulanLabel = tarikhTerima.slice(0, 7);

      const isHadir = arahanTindakan === 'PERLU_HADIR' || actionMode === 'PERLU_HADIR' || actionMode === 'HADIR_DAN_LAPOR';
      const isLapor = arahanTindakan === 'HANTAR_LAPORAN' || actionMode === 'HANTAR_LAPORAN' || actionMode === 'HADIR_DAN_LAPOR';

      // 1. Build Assigned Staff Names and Label
      const selectedNames = selectedTeacherIds
        .map((id) => activeTeachers.find((t) => t.teacherId === id)?.fullName)
        .filter(Boolean) as string[];

      let finalTindakanLabel = '';
      if (customTindakanText.trim()) {
        finalTindakanLabel = customTindakanText.trim().toUpperCase();
      } else {
        finalTindakanLabel = selectedNames.length > 0 ? selectedNames.join('\n') : 'GURU BESAR';
      }

      // 2. Comprehensive Target Teacher Resolution
      const targetIdsSet = new Set<string>(selectedTeacherIds);
      const textToScan = `${finalTindakanLabel} ${customTindakanText}`.toUpperCase();

      activeTeachers.forEach((t) => {
        const tName = (t.fullName || '').trim().toUpperCase();
        if (tName && tName.length >= 3 && textToScan.includes(tName)) {
          targetIdsSet.add(t.teacherId);
        }
      });

      // If "Sila bincang dengan GB" or text explicitly mentions GB
      if (
        arahanTindakan === 'SILA_BINCANG_DENGAN_GB' ||
        (isLegacySchool && textToScan.includes('TEO YANG MING')) ||
        textToScan.includes('GURU BESAR') ||
        textToScan.includes('GB')
      ) {
        targetIdsSet.add('PRINCIPAL');
        targetIdsSet.add('GURU_BESAR');
        const gbTeacher = activeTeachers.find(
          (t) =>
            t.category === 'PRINCIPAL' ||
            (t as any).subRole === 'GB' ||
            (t.position || '').toUpperCase().includes('BESAR') ||
            (isLegacySchool && (t.fullName || '').toUpperCase().includes('TEO YANG MING'))
        );
        if (gbTeacher) {
          targetIdsSet.add(gbTeacher.teacherId);
        }
        if (activeUid) {
          targetIdsSet.add(activeUid);
        }
      }

      const effectiveTargetTeacherIds = Array.from(targetIdsSet);

      // 3. Resolve Supervisors (GB + PK of the domain)
      const supervisorTeacherIds = resolveAutoCopiedSupervisorIds(domain, activeTeachers, isLegacySchool);

      const linkedMaklumanIds: string[] = [];
      const linkedUnavailabilityIds: string[] = [];
      let linkedReliefAlertId = '';

      const badgeText = currentMeta.badgeLabel;

      // 4. Create Task in `makluman_tasks` according to disposition
      // Case A: UNTUK_TINDAKAN or SILA_URUS
      if (arahanTindakan === 'UNTUK_TINDAKAN' || arahanTindakan === 'SILA_URUS') {
        const taskTitlePrefix = arahanTindakan === 'UNTUK_TINDAKAN' ? '[UNTUK TINDAKAN]' : '[SILA URUS]';
        const maklumanTaskId = `makluman_tindakan_${suratId}`;
        linkedMaklumanIds.push(maklumanTaskId);

        batch.set(
          doc(db, 'makluman_tasks', maklumanTaskId),
          cleanFirestoreData({
            id: maklumanTaskId,
            schoolCode: activeSchoolCode,
            title: `${taskTitlePrefix} ${perkara.trim().toUpperCase()}`,
            description: `No. Ruj: ${noRujukanLuar} (${noFailSekolah}) | Arahan: ${currentMeta.label.toUpperCase()} | Tarikh Akhir: ${formatDotDate(tarikhAkhirTindakan)}`,
            domain: domain,
            category: 'TUGASAN',
            source: 'AD_HOC',
            dueDate: tarikhAkhirTindakan,
            dueTime: '17:00',
            location: 'Pejabat Sekolah / Atas Talian',
            tindakanLabel: `${badgeText}: ${finalTindakanLabel.replace(/\n/g, ', ')}`,
            priority: 'TINGGI',
            targetType: effectiveTargetTeacherIds.length > 0 ? 'GURU_TERPILIH' : 'SEMUA_GURU',
            targetTeacherIds: effectiveTargetTeacherIds,
            supervisorTeacherIds: supervisorTeacherIds,
            completions: {},
            whatsappLogs: {},
            createdByTeacherId: activeUid,
            createdByName: `${activeName} (PO - Daftar Surat Masuk)`,
            createdAt: new Date().toISOString(),
          })
        );
      }

      // Case B: SILA_BINCANG_DENGAN_GB
      if (arahanTindakan === 'SILA_BINCANG_DENGAN_GB') {
        const maklumanTaskId = `makluman_bincang_${suratId}`;
        linkedMaklumanIds.push(maklumanTaskId);

        batch.set(
          doc(db, 'makluman_tasks', maklumanTaskId),
          cleanFirestoreData({
            id: maklumanTaskId,
            schoolCode: activeSchoolCode,
            title: `[SILA BINCANG DENGAN GB] ${perkara.trim().toUpperCase()}`,
            description: `No. Ruj: ${noRujukanLuar} (${noFailSekolah}) | Guru Bertanggungjawab: ${finalTindakanLabel.replace(/\n/g, ', ')}`,
            domain: domain,
            category: 'MESYUARAT',
            source: 'AD_HOC',
            dueDate: tarikhSurat || todayStr,
            dueTime: '08:00',
            location: 'Bilik Guru Besar',
            tindakanLabel: `SILA BINCANG DENGAN GB: ${finalTindakanLabel.replace(/\n/g, ', ')}`,
            priority: 'TINGGI',
            targetType: 'GURU_TERPILIH',
            targetTeacherIds: effectiveTargetTeacherIds,
            supervisorTeacherIds: supervisorTeacherIds,
            completions: {},
            whatsappLogs: {},
            createdByTeacherId: activeUid,
            createdByName: `${activeName} (PO - Daftar Surat Masuk)`,
            createdAt: new Date().toISOString(),
          })
        );
      }

      // Case C: UNTUK_DIPAMERKAN
      if (arahanTindakan === 'UNTUK_DIPAMERKAN') {
        const maklumanTaskId = `makluman_pamer_${suratId}`;
        linkedMaklumanIds.push(maklumanTaskId);

        batch.set(
          doc(db, 'makluman_tasks', maklumanTaskId),
          cleanFirestoreData({
            id: maklumanTaskId,
            schoolCode: activeSchoolCode,
            title: `[UNTUK DIPAMERKAN] ${perkara.trim().toUpperCase()}`,
            description: `No. Ruj: ${noRujukanLuar} (${noFailSekolah}) — Sila pamerkan di papan kenyataan sekolah untuk makluman umum.`,
            domain: domain,
            category: 'AKTIVITI',
            source: 'AD_HOC',
            dueDate: tarikhSurat || todayStr,
            dueTime: '08:00',
            location: 'Papan Kenyataan Sekolah',
            tindakanLabel: 'UNTUK DIPAMERKAN: SEMUA GURU & STAF',
            priority: 'BIASA',
            targetType: 'SEMUA_GURU',
            targetTeacherIds: [],
            supervisorTeacherIds: supervisorTeacherIds,
            completions: {},
            whatsappLogs: {},
            createdByTeacherId: activeUid,
            createdByName: `${activeName} (PO - Daftar Surat Masuk)`,
            createdAt: new Date().toISOString(),
          })
        );
      }

      // Case D: PERLU_HADIR (Four-way sync: Makluman + Unavailability/Attendance + Relief Alerts)
      if (isHadir) {
        const maklumanHadirId = `makluman_hadir_${suratId}`;
        linkedMaklumanIds.push(maklumanHadirId);

        batch.set(
          doc(db, 'makluman_tasks', maklumanHadirId),
          cleanFirestoreData({
            id: maklumanHadirId,
            schoolCode: activeSchoolCode,
            title: `[HADIR] ${perkara.trim().toUpperCase()}`,
            description: `No. Ruj: ${noRujukanLuar} (${noFailSekolah}) | Tindakan: ${finalTindakanLabel.replace(/\n/g, ', ')}`,
            domain: domain,
            category: eventCategory,
            source: 'AD_HOC',
            dueDate: tarikhHadirMula,
            dueTime: masaHadir === 'SEPANJANG_HARI' ? '08:00' : masaHadir || '08:00',
            location: lokasiHadir || 'Luar Kawasan Sekolah',
            tindakanLabel: `HADIR: ${finalTindakanLabel.replace(/\n/g, ', ')}`,
            priority: 'TINGGI',
            targetType: effectiveTargetTeacherIds.length > 0 ? 'GURU_TERPILIH' : 'SEMUA_GURU',
            targetTeacherIds: effectiveTargetTeacherIds,
            supervisorTeacherIds: supervisorTeacherIds,
            completions: {},
            whatsappLogs: {},
            createdByTeacherId: activeUid,
            createdByName: `${activeName} (PO - Daftar Surat Masuk)`,
            createdAt: new Date().toISOString(),
          })
        );

        // Keberadaan Guru sync
        effectiveTargetTeacherIds.forEach((tId) => {
          const noticeId = `unavail_${suratId}_${tId}`;
          linkedUnavailabilityIds.push(noticeId);

          batch.set(
            doc(db, 'staff_unavailability', noticeId),
            cleanFirestoreData({
              id: noticeId,
              noticeId,
              schoolCode: activeSchoolCode,
              teacherId: tId,
              startDate: tarikhHadirMula,
              endDate: tarikhHadirTamat || tarikhHadirMula,
              timeType: masaHadir === 'SEPANJANG_HARI' ? 'SEPANJANG_HARI' : 'WAKTU_TERTENTU',
              startTime: masaHadir === 'SEPANJANG_HARI' ? '07:15' : '08:00',
              endTime: masaHadir === 'SEPANJANG_HARI' ? '13:15' : '12:45',
              reasonCode: jenisKeberadaan,
              reasonText: `[SURAT MASUK] ${perkara.trim().toUpperCase()} (${noRujukanLuar})`,
              notes: `Dijana automatik oleh PO melalui Daftar Surat Masuk (${noFailSekolah}). Lokasi: ${lokasiHadir}`,
              status: 'PUBLISHED',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              createdByUid: activeUid,
            })
          );
        });

        // Relief alert sync
        if (perluJadualGanti && effectiveTargetTeacherIds.length > 0) {
          linkedReliefAlertId = `relief_surat_${suratId}`;
          const affectedClasses = academicAssignments
            .filter((asg) => effectiveTargetTeacherIds.includes(asg.teacherId) && asg.status !== 'INACTIVE')
            .map((asg) => ({
              teacherId: asg.teacherId,
              classId: asg.classId,
              className: asg.className,
              subjectCode: asg.subjectCode,
              subjectName: asg.subjectName,
              weeklyPeriods: asg.weeklyPeriods || 0,
            }));

          batch.set(
            doc(db, 'relief_alerts_from_surat', linkedReliefAlertId),
            cleanFirestoreData({
              id: linkedReliefAlertId,
              schoolCode: activeSchoolCode,
              suratId,
              perkara: perkara.trim().toUpperCase(),
              noRujukanLuar,
              startDate: tarikhHadirMula,
              endDate: tarikhHadirTamat || tarikhHadirMula,
              absentTeacherIds: effectiveTargetTeacherIds,
              affectedClasses,
              status: 'PERLU_JADUAL_GANTI',
              createdAt: new Date().toISOString(),
            })
          );
        }
      }

      // Case E: HANTAR_LAPORAN
      if (isLapor) {
        const maklumanLaporId = `makluman_lapor_${suratId}`;
        linkedMaklumanIds.push(maklumanLaporId);

        batch.set(
          doc(db, 'makluman_tasks', maklumanLaporId),
          cleanFirestoreData({
            id: maklumanLaporId,
            schoolCode: activeSchoolCode,
            title: `[HANTAR LAPORAN] ${perkara.trim().toUpperCase()}`,
            description: `Ruj. Surat: ${noRujukanLuar} (${noFailSekolah}) | Catatan: ${catatanLaporan || 'Sila hantar laporan sebelum tarikh akhir.'}`,
            domain: domain,
            category: 'TUGASAN',
            source: 'AD_HOC',
            dueDate: tarikhAkhirTindakan,
            dueTime: '16:00',
            location: 'Pejabat Sekolah / PPD',
            tindakanLabel: `HANTAR LAPORAN: ${finalTindakanLabel.replace(/\n/g, ', ')}`,
            priority: 'TINGGI',
            targetType: effectiveTargetTeacherIds.length > 0 ? 'GURU_TERPILIH' : 'SEMUA_GURU',
            targetTeacherIds: effectiveTargetTeacherIds,
            supervisorTeacherIds: supervisorTeacherIds,
            completions: {},
            whatsappLogs: {},
            createdByTeacherId: activeUid,
            createdByName: `${activeName} (PO - Daftar Surat Masuk)`,
            createdAt: new Date().toISOString(),
          })
        );
      }

      // 5. Build Master Surat Masuk Document Payload
      const recordPayload: Record<string, any> = {
        id: suratId,
        schoolCode: activeSchoolCode,
        tarikhSurat,
        tarikhTerima,
        bulanTahunLabel: bulanLabel,
        perkara: perkara.trim().toUpperCase(),
        noRujukanLuar: noRujukanLuar.trim(),
        noFailSekolah: noFailSekolah.trim(),
        domain,
        arahanTindakan,
        arahanBadge: badgeText,
        tindakanTeacherIds: effectiveTargetTeacherIds,
        supervisorTeacherIds,
        tindakanCustomLabel: finalTindakanLabel,
        actionMode,
        linkedMaklumanIds,
        linkedUnavailabilityIds,
        createdByUid: activeUid,
        createdByName: activeName,
        createdAt: new Date().toISOString(),
      };

      if (isMandatoryDeadline && tarikhAkhirTindakan) {
        recordPayload.tarikhAkhirTindakan = tarikhAkhirTindakan;
        recordPayload.tarikhAkhirLaporan = tarikhAkhirTindakan;
      }

      if (catatanLaporan && catatanLaporan.trim()) {
        recordPayload.catatanLaporan = catatanLaporan.trim();
      }

      if (isHadir) {
        recordPayload.tarikhHadirMula = tarikhHadirMula;
        recordPayload.tarikhHadirTamat = tarikhHadirTamat || tarikhHadirMula;
        recordPayload.masaHadir = masaHadir || 'SEPANJANG_HARI';
        recordPayload.lokasiHadir = lokasiHadir || 'PPD Mukah / PKG';
        recordPayload.jenisKeberadaan = jenisKeberadaan || 'URUSAN_RASMI';
        recordPayload.perluJadualGanti = Boolean(perluJadualGanti);
      }

      if (linkedReliefAlertId) {
        recordPayload.linkedReliefAlertId = linkedReliefAlertId;
      }

      batch.set(doc(db, 'surat_masuk_records', suratId), cleanFirestoreData(recordPayload));
      await batch.commit();

      setIsModalOpen(false);
      setPerkara('');
      setCustomTindakanText('');
      setSelectedTeacherIds([]);

      const syncList = ['Daftar Surat Masuk'];
      if (linkedMaklumanIds.length > 0) syncList.push('Paparan Makluman Guru & Pentadbir');
      if (linkedUnavailabilityIds.length > 0) syncList.push('Keberadaan Guru (KRS/Kursus)');
      if (linkedReliefAlertId) syncList.push('Jadual Ganti (Relief)');

      addToast(
        `Surat Masuk berjaya disimpan! Automasi aktif: ${syncList.join(' + ')}.`,
        'success'
      );
    } catch (err: any) {
      console.error('Error saving surat masuk:', err);
      addToast(`Gagal menyimpan surat masuk: ${err.message}`, 'warning');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSurat = async (rec: SuratMasukRecord) => {
    if (!window.confirm(`Adakah anda pasti ingin memadam rekod surat "${rec.perkara}" berserta automasi berkaitan?`)) {
      return;
    }
    try {
      setSaving(true);
      const batch = writeBatch(db);
      batch.delete(doc(db, 'surat_masuk_records', rec.id));

      if (rec.linkedMaklumanIds && rec.linkedMaklumanIds.length > 0) {
        rec.linkedMaklumanIds.forEach((mId) => {
          batch.delete(doc(db, 'makluman_tasks', mId));
        });
      }

      if (rec.linkedUnavailabilityIds && rec.linkedUnavailabilityIds.length > 0) {
        rec.linkedUnavailabilityIds.forEach((uId) => {
          batch.delete(doc(db, 'staff_unavailability', uId));
        });
      }

      if (rec.linkedReliefAlertId) {
        batch.delete(doc(db, 'relief_alerts_from_surat', rec.linkedReliefAlertId));
      }

      await batch.commit();
      addToast('Rekod surat masuk dan automasi berkaitan berjaya dipadam.', 'success');
    } catch (err: any) {
      console.error('Error deleting surat record:', err);
      addToast(`Gagal memadam surat: ${err.message}`, 'warning');
    } finally {
      setSaving(false);
    }
  };

  const handleWhatsAppForSurat = (rec: SuratMasukRecord) => {
    const firstTeacher = activeTeachers.find((t) => rec.tindakanTeacherIds.includes(t.teacherId));
    const cleanPhone = formatWhatsAppPhone(firstTeacher?.phone);

    if (!cleanPhone) {
      addToast(
        'Sila pilih guru yang mempunyai nombor telefon berdaftar untuk menghantar WhatsApp.',
        'warning'
      );
      return;
    }

    const schoolName = schoolProfile?.schoolName || tenantSchoolName;
    const deadlineText = rec.tarikhAkhirTindakan
      ? `⏰ *Tarikh Akhir Tindakan / Laporan:* ${formatDotDate(rec.tarikhAkhirTindakan)}`
      : '';

    const lines = [
      `*[MAKLUMAN SURAT MASUK RASMI — ${schoolName}]*`,
      `Kepada: *${rec.tindakanCustomLabel.replace(/\n/g, ', ')}*`,
      `Arahan: *${rec.arahanBadge || 'UNTUK TINDAKAN'}*`,
      ``,
      `📌 *Perkara:* ${rec.perkara}`,
      `📄 *No. Ruj. Surat:* ${rec.noRujukanLuar}`,
      `📁 *No. Fail Sekolah:* ${rec.noFailSekolah}`,
      `📅 *Tarikh Surat:* ${formatDotDate(rec.tarikhSurat)}`,
      rec.tarikhHadirMula
        ? `🗓️ *Tarikh Hadir / Kursus:* ${formatDotDate(rec.tarikhHadirMula)} (${rec.lokasiHadir || '-'}) — _Direkodkan dalam Keberadaan & Relief_`
        : '',
      deadlineText,
      ``,
      `Terima kasih. — _Unit Pentadbiran / PO melalui iSEPADU_`,
    ].filter(Boolean);

    window.open(
      `https://wa.me/${cleanPhone}?text=${encodeURIComponent(lines.join('\n'))}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  return (
    <div className="flex-1 flex flex-col gap-6 max-w-6xl w-full mx-auto">
      {/* Toast Notification Fallback */}
      {localToast && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-2xl border text-xs font-bold flex items-center gap-2 animate-bounce ${
            localToast.type === 'success'
              ? 'bg-emerald-950 text-emerald-200 border-emerald-500/50'
              : localToast.type === 'warning'
              ? 'bg-amber-950 text-amber-200 border-amber-500/50'
              : 'bg-blue-950 text-blue-200 border-blue-500/50'
          }`}
        >
          {localToast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-400" />
          )}
          <span>{localToast.msg}</span>
        </div>
      )}

      {/* Top Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30">
              Pentadbiran Pejabat (MySG HR30 Pembantu Operasi)
            </span>
            <span className="text-xs text-slate-400">Penyegerakan 4-Hala Pintar</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white mt-1 flex items-center gap-2.5">
            <Mail className="w-6 h-6 text-blue-400" />
            <span>Daftar Surat Masuk & Automasi Tindakan (PO)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Input sekali sahaja oleh PO: sistem mengemas kini <strong>Paparan Makluman</strong> (Guru & Pentadbir mengikut bidang), <strong>Keberadaan/Kehadiran Guru</strong>, <strong>Jadual Ganti (Relief)</strong>, dan <strong>Cetakan Bulanan Word</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <input
            type="month"
            value={selectedMonth}
            onClick={(e) => {
              try {
                (e.currentTarget as any).showPicker?.();
              } catch {}
            }}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-slate-950 border border-slate-700 hover:border-blue-500 rounded-2xl px-3.5 py-2 text-xs font-bold text-white font-mono cursor-pointer [color-scheme:dark] transition"
          />

          <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('SENARAI')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                viewMode === 'SENARAI'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Senarai Pintar
            </button>
            <button
              type="button"
              onClick={() => setViewMode('CETAK_WORD')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'CETAK_WORD'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-emerald-300'
              }`}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Format Cetakan Word</span>
            </button>
          </div>

          {onNavigateToRelief && (
            <button
              type="button"
              onClick={onNavigateToRelief}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white border border-amber-500/30 rounded-2xl text-xs font-bold transition cursor-pointer"
              title="Pergi ke Jadual Ganti (Relief)"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Jadual Ganti</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-blue-600/25 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Rekod Surat Masuk</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: Screen Table */}
      {viewMode === 'SENARAI' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4 print:hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <h3 className="text-sm font-black text-white uppercase tracking-wider">
              {formattedMonthHeading} ({filteredRecords.length} Surat)
            </h3>

            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Cari perkara / no. rujukan / arahan / nama..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400 font-mono">
              Memuatkan rekod surat masuk...
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="py-12 text-center space-y-2 text-slate-400 text-xs">
              <FolderOpen className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="font-bold text-slate-300">Tiada rekod surat masuk bagi bulan ini.</p>
              <p>Klik "+ Rekod Surat Masuk" di penjuru kanan atas untuk mula mendaftar surat.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                    <th className="py-3 px-3 w-12 text-center">Bil.</th>
                    <th className="py-3 px-3 w-28">Tarikh Surat</th>
                    <th className="py-3 px-4">Perkara & Status Penyegerakan Automatik</th>
                    <th className="py-3 px-4 w-60">Nama / No. Ruj. Fail</th>
                    <th className="py-3 px-4 w-52">Tindakan</th>
                    <th className="py-3 px-3 w-28 text-right">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {filteredRecords.map((rec, index) => {
                    const badge = rec.arahanBadge || (rec.arahanTindakan ? ARAHAN_TINDAKAN_META[rec.arahanTindakan]?.badgeLabel : 'TINDAKAN');
                    const meta = rec.arahanTindakan ? ARAHAN_TINDAKAN_META[rec.arahanTindakan] : null;

                    return (
                      <tr key={rec.id} className="hover:bg-slate-800/40 align-top">
                        <td className="py-3.5 px-3 text-center font-mono font-bold text-slate-400">
                          {index + 1}.
                        </td>
                        <td className="py-3.5 px-3 font-mono font-bold text-slate-200">
                          {formatDotDate(rec.tarikhSurat)}
                        </td>
                        <td className="py-3.5 px-4 space-y-2">
                          <div className="font-extrabold text-white leading-snug">
                            {rec.perkara}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {badge && (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${
                                  meta ? `${meta.bgClass} ${meta.colorClass} ${meta.borderClass}` : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                                }`}
                              >
                                {badge}
                              </span>
                            )}

                            {rec.domain && (
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[9.5px] font-mono border border-slate-700">
                                {rec.domain}
                              </span>
                            )}

                            {(rec.actionMode === 'PERLU_HADIR' || rec.actionMode === 'HADIR_DAN_LAPOR' || rec.arahanTindakan === 'PERLU_HADIR') && (
                              <>
                                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold">
                                  ✔ Hadir: {formatDotDate(rec.tarikhHadirMula)} ({rec.lokasiHadir})
                                </span>
                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                                  ✔ Auto Keberadaan Guru
                                </span>
                                {rec.perluJadualGanti && (
                                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                                    ✔ Dihantar ke Jadual Ganti
                                  </span>
                                )}
                              </>
                            )}

                            {rec.tarikhAkhirTindakan && (
                              <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold">
                                ⏰ Tarikh Akhir: {formatDotDate(rec.tarikhAkhirTindakan)}
                              </span>
                            )}

                            {rec.arahanTindakan === 'SILA_BINCANG_DENGAN_GB' && (
                              <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold">
                                🤝 Sila bincang dengan GB
                              </span>
                            )}

                            {rec.arahanTindakan === 'UNTUK_SIMPANAN_FAIL' && (
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-mono">
                                Fail Sahaja
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[11px] space-y-1">
                          <div className="text-slate-200 font-semibold">{rec.noRujukanLuar}</div>
                          <div className="text-indigo-300">{rec.noFailSekolah}</div>
                        </td>
                        <td className="py-3.5 px-4 space-y-1 font-sans">
                          {badge && (
                            <div className="text-[10px] font-black text-amber-400 tracking-wide uppercase">
                              [{badge}]
                            </div>
                          )}
                          <div className="font-bold text-slate-100 whitespace-pre-line text-xs">
                            {rec.tindakanCustomLabel}
                          </div>
                          {rec.tarikhAkhirTindakan && (
                            <div className="text-[10px] font-mono text-rose-300">
                              (Akhir: {formatDotDate(rec.tarikhAkhirTindakan)})
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleWhatsAppForSurat(rec)}
                              className="px-2.5 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 text-xs font-bold inline-flex items-center gap-1 transition cursor-pointer"
                              title="Hantar Peringatan WhatsApp"
                            >
                              <Send className="w-3 h-3" />
                              <span>WA</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSurat(rec)}
                              className="p-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 transition cursor-pointer"
                              title="Padam Rekod Surat Masuk & Automasi Berkaitan"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: 100% Authentic Word Table Printout View */}
      {viewMode === 'CETAK_WORD' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between print:hidden">
            <span className="text-xs text-slate-300">
              Paparan ini direka khas menyerupai jadual rasmi sekolah untuk cetakan terus ke dalam Fail Surat Masuk Sekolah.
            </span>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Daftar Surat Masuk (A4)</span>
            </button>
          </div>

          <div className="bg-white text-black p-8 sm:p-10 rounded-xl shadow-2xl max-w-4xl mx-auto print:shadow-none print:p-0 font-sans">
            <h2 className="text-center font-bold text-sm uppercase underline mb-4 tracking-wide">
              {formattedMonthHeading}
            </h2>

            <table className="w-full border-collapse border border-black text-[11px] leading-snug">
              <thead>
                <tr className="border-b border-black font-bold text-center">
                  <th className="border border-black py-1.5 px-2 w-10">BIL.</th>
                  <th className="border border-black py-1.5 px-2 w-24">TARIKH<br />SURAT</th>
                  <th className="border border-black py-1.5 px-3">PERKARA</th>
                  <th className="border border-black py-1.5 px-3 w-56">
                    NAMA / NO. RUJ. FAIL<br />(PPDMKH/JPNSW/KPM)
                  </th>
                  <th className="border border-black py-1.5 px-2.5 w-40">Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((rec, idx) => {
                  const badge = rec.arahanBadge || (rec.arahanTindakan ? ARAHAN_TINDAKAN_META[rec.arahanTindakan]?.badgeLabel : '');
                  return (
                    <tr key={rec.id} className="align-top">
                      <td className="border border-black py-2 px-2 text-center">
                        {idx + 1}.
                      </td>
                      <td className="border border-black py-2 px-2 text-center">
                        {formatDotDate(rec.tarikhSurat)}
                      </td>
                      <td className="border border-black py-2 px-3 uppercase font-medium">
                        {rec.perkara}
                      </td>
                      <td className="border border-black py-2 px-3">
                        <div className="font-semibold">{rec.noRujukanLuar}</div>
                        <div className="mt-3 text-slate-800">{rec.noFailSekolah}</div>
                      </td>
                      <td className="border border-black py-2 px-2.5 uppercase whitespace-pre-line text-[10.5px]">
                        {badge && (
                          <div className="font-bold underline mb-0.5">{badge}:</div>
                        )}
                        <div className="font-semibold">{rec.tindakanCustomLabel}</div>
                        {rec.tarikhAkhirTindakan && (
                          <div className="font-mono text-[9px] mt-1 normal-case italic">
                            (Tarikh Akhir: {formatDotDate(rec.tarikhAkhirTindakan)})
                          </div>
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

      {/* MODAL: Register New Incoming Letter */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 print:hidden">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 space-y-5 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-black text-white">
                  Daftar Surat Masuk Baharu (Input Pembantu Operasi)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Lengkapkan butiran surat rasmi dan tentukan arahan tindakan untuk mengaktifkan automasi 4-hala.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSuratMasuk} className="space-y-4 text-xs">
              {/* Tarikh Surat & Tarikh Terima */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SmartDatePicker
                  label="Tarikh Surat (Pada Surat Rasmi)"
                  required
                  value={tarikhSurat}
                  onChange={setTarikhSurat}
                  accentColor="blue"
                  showPresets={true}
                />
                <SmartDatePicker
                  label="Tarikh Terima (Penentu Bulan Daftar)"
                  required
                  value={tarikhTerima}
                  onChange={setTarikhTerima}
                  accentColor="blue"
                  showPresets={true}
                />
              </div>

              {/* Perkara / Tajuk */}
              <div>
                <label className="block font-bold text-slate-300 mb-1">
                  Perkara / Tajuk Surat *
                </label>
                <textarea
                  rows={2}
                  required
                  value={perkara}
                  onChange={(e) => setPerkara(e.target.value)}
                  placeholder="cth: TAKLIMAT KEMASUKAN MARKAH MATRIKS PEMBELAJARAN TAHUN 4 (MPT4) 2026..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white uppercase font-semibold"
                />
              </div>

              {/* No. Rujukan Luar & No. Fail Sekolah */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">
                    Nama / No. Ruj. Surat Luar (PPDMKH / JPNSW / KPM) *
                  </label>
                  <input
                    type="text"
                    required
                    value={noRujukanLuar}
                    onChange={(e) => setNoRujukanLuar(e.target.value)}
                    placeholder="cth: PPDMKH.600-7/11/17(19)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">
                    No. Ruj. Fail Sekolah *
                  </label>
                  <input
                    type="text"
                    required
                    value={noFailSekolah}
                    onChange={(e) => setNoFailSekolah(e.target.value)}
                    placeholder="cth: Sjkcch.600-3/2/18 atau FAIL PERIBADI"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-mono"
                  />
                </div>
              </div>

              {/* Bidang / Domain Sekolah */}
              <div>
                <label className="block font-bold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Bidang / Domain Sekolah (Penentu Salinan Autokopi Pentadbir):</span>
                  <span className="text-[10px] text-indigo-400 font-mono">
                    GB + {domain === 'HEM' ? 'PK HEM' : domain === 'KOKURIKULUM' ? 'PK KK' : 'PK Pentadbiran'}
                  </span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'PENTADBIRAN', label: 'Pentadbiran', copy: 'GB + PKP' },
                    { id: 'KURIKULUM', label: 'Kurikulum', copy: 'GB + PKP' },
                    { id: 'HEM', label: 'HEM', copy: 'GB + PKHEM' },
                    { id: 'KOKURIKULUM', label: 'Kokurikulum', copy: 'GB + PKKK' },
                  ].map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setDomain(d.id as SuratDomain)}
                      className={`p-2 rounded-xl border text-center transition cursor-pointer ${
                        domain === d.id
                          ? 'bg-blue-600/30 border-blue-400 text-white font-black shadow-md'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="text-xs font-bold">{d.label}</div>
                      <div className="text-[9.5px] text-slate-400 mt-0.5">({d.copy})</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 5 OFFICIAL DISPOSITIONS / MINIT SURAT */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="block font-black text-indigo-300 uppercase tracking-wider">
                    Pilih Arahan Tindakan (Minit Surat Rasmi):
                  </label>
                  <span className="text-[10px] text-slate-400 font-semibold">
                    Format Rasmi 5 Disposisi Pejabat
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(Object.keys(ARAHAN_TINDAKAN_META) as ArahanTindakanType[]).map((key) => {
                    const item = ARAHAN_TINDAKAN_META[key];
                    const isSelected = arahanTindakan === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleSelectArahan(key)}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                          isSelected
                            ? `${item.bgClass} ${item.borderClass} ring-1 ring-white/20 shadow-md`
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`font-black text-xs ${
                              isSelected ? item.colorClass : 'text-slate-200'
                            }`}
                          >
                            {item.label}
                          </span>
                          {item.requiresDeadline && (
                            <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                              Wajib Tarikh
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1 line-clamp-1">
                          {item.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* MANDATORY DEADLINE DATE PICKER */}
              {(ARAHAN_TINDAKAN_META[arahanTindakan]?.requiresDeadline ||
                actionMode === 'HANTAR_LAPORAN' ||
                actionMode === 'HADIR_DAN_LAPOR') && (
                <div className="p-3.5 rounded-2xl bg-amber-950/30 border-2 border-amber-500/60 space-y-2 animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-amber-300 text-xs flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-amber-400" />
                      <span>Tarikh Akhir Tindakan / Laporan * (Wajib Diisi)</span>
                    </span>
                    <span className="text-[10px] text-amber-200/80 font-mono font-semibold">
                      Diperlukan untuk peringatan Makluman & Pemantauan GB
                    </span>
                  </div>
                  <SmartDatePicker
                    label="Tarikh Akhir (Deadline) *"
                    required
                    value={tarikhAkhirTindakan}
                    onChange={setTarikhAkhirTindakan}
                    accentColor="amber"
                    showPresets={true}
                  />
                </div>
              )}

              {/* Pegawai Bertanggungjawab / Tindakan */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-300">
                    Pegawai / Guru Bertanggungjawab (Tindakan):
                  </label>
                  <span className="text-[10px] text-blue-400 font-semibold">
                    Muncul dalam Cetakan & Paparan Makluman Guru
                  </span>
                </div>

                <div className="max-h-36 overflow-y-auto bg-slate-950 border border-slate-800 rounded-xl p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {activeTeachers.map((t) => {
                    const checked = selectedTeacherIds.includes(t.teacherId);
                    return (
                      <label
                        key={t.teacherId}
                        className="flex items-center gap-2 text-slate-200 cursor-pointer hover:bg-slate-900 p-1 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTeacherIds((prev) => [...prev, t.teacherId]);
                            } else {
                              setSelectedTeacherIds((prev) =>
                                prev.filter((id) => id !== t.teacherId)
                              );
                            }
                          }}
                        />
                        <span className="truncate font-semibold text-xs">{t.fullName}</span>
                      </label>
                    );
                  })}
                </div>
                <input
                  type="text"
                  value={customTindakanText}
                  onChange={(e) => setCustomTindakanText(e.target.value)}
                  placeholder="Atau taip nama pegawai khas (cth: Nama Guru Besar / Penolong Kanan)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-medium"
                />
              </div>

              {/* Perlu Hadir Settings (if active) */}
              {(arahanTindakan === 'PERLU_HADIR' || actionMode === 'PERLU_HADIR' || actionMode === 'HADIR_DAN_LAPOR') && (
                <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 space-y-3">
                  <div className="font-black text-indigo-300 text-xs uppercase flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4" />
                    <span>Tetapan Kehadiran Luar, Keberadaan Guru & Jadual Ganti (Relief)</span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-300 mb-1">
                      Kategori Paparan pada Makluman / Takwim Guru:
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        { id: 'AKTIVITI', label: 'Aktiviti Sekolah / Program' },
                        { id: 'MESYUARAT', label: 'Mesyuarat / Taklimat / PLC' },
                        { id: 'KURSUS', label: 'Kursus / LDP / Bengkel' },
                      ].map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setEventCategory(cat.id as any)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                            eventCategory === cat.id
                              ? 'bg-blue-600 text-white border border-blue-400 shadow'
                              : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                          }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <SmartDatePicker
                      label="Tarikh Mula Hadir"
                      required
                      value={tarikhHadirMula}
                      onChange={(val) => {
                        setTarikhHadirMula(val);
                        if (!tarikhHadirTamat || tarikhHadirTamat < val) {
                          setTarikhHadirTamat(val);
                        }
                      }}
                      accentColor="indigo"
                      showPresets={true}
                    />
                    <div className="space-y-1">
                      <SmartDatePicker
                        label="Tarikh Tamat"
                        required
                        value={tarikhHadirTamat}
                        min={tarikhHadirMula}
                        onChange={setTarikhHadirTamat}
                        accentColor="indigo"
                        showPresets={false}
                      />
                      <div className="flex items-center gap-1 pt-0.5">
                        <span className="text-[10px] text-slate-400 font-semibold">Tempoh:</span>
                        <button
                          type="button"
                          onClick={() => setTarikhHadirTamat(tarikhHadirMula)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                            tarikhHadirTamat === tarikhHadirMula
                              ? 'bg-indigo-600 text-white shadow'
                              : 'bg-slate-900 text-slate-400 hover:text-white'
                          }`}
                        >
                          1 Hari
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const [y, m, d] = tarikhHadirMula.split('-').map(Number);
                            const dt = new Date(y, m - 1, d + 1);
                            setTarikhHadirTamat(
                              `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
                            );
                          }}
                          className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white text-[10px] font-bold transition cursor-pointer"
                        >
                          2 Hari
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const [y, m, d] = tarikhHadirMula.split('-').map(Number);
                            const dt = new Date(y, m - 1, d + 2);
                            setTarikhHadirTamat(
                              `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
                            );
                          }}
                          className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white text-[10px] font-bold transition cursor-pointer"
                        >
                          3 Hari
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-slate-300 font-bold mb-1">Status Keberadaan</label>
                      <select
                        value={jenisKeberadaan}
                        onChange={(e) => setJenisKeberadaan(e.target.value as 'KURSUS' | 'URUSAN_RASMI')}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold h-[38px] cursor-pointer"
                      >
                        <option value="URUSAN_RASMI">Urusan Rasmi / Mesyuarat</option>
                        <option value="KURSUS">Kursus / Bengkel / Taklimat</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 font-bold mb-1">Lokasi</label>
                      <input
                        type="text"
                        value={lokasiHadir}
                        onChange={(e) => setLokasiHadir(e.target.value)}
                        placeholder="cth: PPD Mukah / PKG Mukah"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                      />
                    </div>
                    <div className="flex items-center pt-5">
                      <label className="flex items-center gap-2 cursor-pointer text-slate-200 font-bold">
                        <input
                          type="checkbox"
                          checked={perluJadualGanti}
                          onChange={(e) => setPerluJadualGanti(e.target.checked)}
                        />
                        <span>Jana Permintaan Jadual Ganti (Relief) Automatik</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg cursor-pointer"
                >
                  {saving ? 'Menyimpan & Menyelaras...' : 'Simpan & Aktifkan Automasi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuratMasukManagerView;
