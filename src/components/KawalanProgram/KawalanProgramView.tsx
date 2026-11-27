/**
 * iSEPADU AI — Kawalan Program & PDCA Bersepadu (PInTaS · OPPM · PDCA · SKAS)
 *
 * Full-Lifecycle School Activity Supervision Hub:
 * 1. Dual-Mode Program Creation:
 *    - Mod Strategik / Program Besar (Full PInTaS, 1-12 Month OPPM Gantt, Multi-Group AJK Checklist)
 *    - Mod Pantas / Program Rutin (1-Click 8 Universal School SOP Templates + 4-Step Streamlined Checklist)
 * 2. Mandatory SKAS Standard & Sub-Standard binding (skasStandards.ts) + PersonnelProfile PIC binding
 * 3. Direct Execution Linkage with Memo, Minit PKPA, Smart OPR & Google Drive Auto-Archive
 * 4. Supervision Radar & 5-Working-Day SLA Red-Light Overdue Alert
 * 5. Role-Based Views for Guru Besar, GPK (PK1 / PK HEM / PK KK), and Guru / AJK
 * 6. Official Excel (.xlsx) Export & A4 Landscape PInTaS + OPPM Official Printout
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  deleteDoc,
  query,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, SchoolSettings } from '../../types';
import { useSchoolTenant } from '../../contexts/SchoolTenantContext';
import { belongsToSchool, scopedDocId } from '../../utils/schoolTenant';
import { deepSanitizeFirestore } from '../../utils/sanitizeFirestore';
import { triggerSmartPrint } from '../../utils/oprPrintHelper';
import { OFFICIAL_TEACHERS } from '../../constants/officialRoster';
import {
  SKAS_STANDARDS_DICTIONARY,
  SkasStandardGroupKey,
  getSkasGroup,
  resolveSkasSelection,
} from '../../data/skasStandards';
import {
  KawalanProgramDoc,
  ProgramMode,
  ProgramDomain,
  PdcaStage,
  ProgramChecklistItem,
  OppmSubTask,
  SchoolSopTemplate,
  PROGRAM_DOMAIN_META,
  PDCA_STAGE_META,
  MALAY_MONTH_SHORT,
  DEFAULT_8_SCHOOL_SOP_TEMPLATES,
  buildDefault4StepChecklist,
  buildStrategicMultiGroupChecklist,
  evaluateProgramSLA,
} from '../../utils/kawalanProgramHelper';
import { SetiausahaExternalPrefill } from '../AISetiausaha/types';
import SchoolLogo from '../SchoolLogo';
import * as XLSX from 'xlsx';
import {
  Activity,
  AlertTriangle,
  Archive,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  CheckSquare,
  Clock,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Filter,
  FolderCheck,
  Layers,
  Mail,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
  Target,
  Trash2,
  TrendingUp,
  UserCheck,
  Users,
  X,
  Zap,
} from 'lucide-react';

export interface KawalanProgramViewProps {
  currentUser: UserProfile;
  schoolSettings?: SchoolSettings | null;
  onOpenSetiausahaDoc?: (prefill: SetiausahaExternalPrefill) => void;
}

interface StaffMemberOption {
  id: string;
  name: string;
  email: string;
  position: string;
  category: string;
}

type SupervisionRoleType =
  | 'GURU_BESAR'
  | 'PK_PENTADBIRAN'
  | 'PK_HEM'
  | 'PK_KOKURIKULUM'
  | 'GURU_AJK';

function resolveUserSupervisionRole(user: UserProfile): {
  roleType: SupervisionRoleType;
  roleBadge: string;
  managedDomains: ProgramDomain[];
} {
  const nameUpper = String(user.name || '').trim().toUpperCase();
  const emailLower = String(user.email || '').trim().toLowerCase();
  const posUpper = String((user as any).position || (user as any).jawatan || (user as any).subRole || '').toUpperCase();

  // Check OFFICIAL_TEACHERS match for canonical positions
  const officialMatch = OFFICIAL_TEACHERS.find(
    (t) =>
      t.email.toLowerCase() === emailLower ||
      t.name.toUpperCase() === nameUpper
  );
  const effectivePos = (officialMatch?.position || posUpper).toUpperCase();

  if (
    user.role === 'PRINCIPAL' ||
    user.category === 'PRINCIPAL' ||
    effectivePos === 'GB' ||
    effectivePos.includes('GURU BESAR')
  ) {
    return {
      roleType: 'GURU_BESAR',
      roleBadge: 'Guru Besar (Penyelia Utama Semua Bidang & Pengesah Act/SOP)',
      managedDomains: ['PENTADBIRAN', 'KURIKULUM', 'HEM', 'KOKURIKULUM', 'PIBK_3K'],
    };
  }

  if (
    effectivePos.includes('PK 1') ||
    effectivePos.includes('PK1') ||
    effectivePos === 'PKP' ||
    effectivePos.includes('PENTADBIRAN')
  ) {
    return {
      roleType: 'PK_PENTADBIRAN',
      roleBadge: 'PK Pentadbiran (Penyelia Bidang Pentadbiran & Kurikulum)',
      managedDomains: ['PENTADBIRAN', 'KURIKULUM'],
    };
  }

  if (effectivePos.includes('PK HEM') || effectivePos === 'PKHEM' || effectivePos.includes('HAL EHWAL MURID')) {
    return {
      roleType: 'PK_HEM',
      roleBadge: 'PK Hal Ehwal Murid (Penyelia Bidang HEM & 3K / PIBK)',
      managedDomains: ['HEM', 'PIBK_3K'],
    };
  }

  if (
    effectivePos.includes('PK KK') ||
    effectivePos.includes('PK KOKO') ||
    effectivePos === 'PKKK' ||
    effectivePos.includes('KOKURIKULUM')
  ) {
    return {
      roleType: 'PK_KOKURIKULUM',
      roleBadge: 'PK Kokurikulum (Penyelia Bidang Kokurikulum & Sukan)',
      managedDomains: ['KOKURIKULUM'],
    };
  }

  return {
    roleType: 'GURU_AJK',
    roleBadge: 'Penyelaras Program & AJK Pelaksana',
    managedDomains: ['PENTADBIRAN', 'KURIKULUM', 'HEM', 'KOKURIKULUM', 'PIBK_3K'],
  };
}

export const KawalanProgramView: React.FC<KawalanProgramViewProps> = ({
  currentUser,
  schoolSettings,
  onOpenSetiausahaDoc,
}) => {
  const { schoolCode: tenantSchoolCode, schoolName: tenantSchoolName, isLegacySchool } = useSchoolTenant();
  const activeSchoolCode = schoolSettings?.schoolCode || tenantSchoolCode || 'YCC3404';
  const activeSchoolName =
    schoolSettings?.schoolName || tenantSchoolName || 'SJK (C) CHUNG HUA BALINGIAN';
  const activeSchoolLogo =
    schoolSettings?.schoolLogo || (schoolSettings as any)?.logoUrl || '';

  const supervisionRole = useMemo(() => resolveUserSupervisionRole(currentUser), [currentUser]);
  const isGB = supervisionRole.roleType === 'GURU_BESAR';
  const isGPK =
    supervisionRole.roleType === 'PK_PENTADBIRAN' ||
    supervisionRole.roleType === 'PK_HEM' ||
    supervisionRole.roleType === 'PK_KOKURIKULUM';
  const isAdminOrGpk = isGB || isGPK;

  // Academic Year Filter
  const [academicYear, setAcademicYear] = useState<string>('2026');
  const [activeSubView, setActiveSubView] = useState<'PDCA_CARDS' | 'PINTAS_OPPM' | 'SOP_LIBRARY'>('PDCA_CARDS');

  // Filter States
  const [domainFilter, setDomainFilter] = useState<'ALL' | 'MY_DOMAIN' | ProgramDomain>('ALL');
  const [stageFilter, setStageFilter] = useState<'ALL' | PdcaStage | 'OVERDUE_SLA'>('ALL');
  const [scopeFilter, setScopeFilter] = useState<'ALL' | 'MY_PROGRAMS'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Firestore State
  const [programs, setPrograms] = useState<KawalanProgramDoc[]>([]);
  const [customSops, setCustomSops] = useState<SchoolSopTemplate[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffMemberOption[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'info' | 'warning' } | null>(null);

  const showToast = (text: string, type: 'success' | 'info' | 'warning' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4500);
  };

  // Create / Edit Program Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingProgramId, setEditingProgramId] = useState<string>('');
  const [formMode, setFormMode] = useState<ProgramMode>('PANTAS');
  const [selectedSopId, setSelectedSopId] = useState<string>(DEFAULT_8_SCHOOL_SOP_TEMPLATES[0].id);
  const [formTitle, setFormTitle] = useState<string>('');
  const [formDomain, setFormDomain] = useState<ProgramDomain>('KURIKULUM');
  const [formTarikhMula, setFormTarikhMula] = useState<string>(new Date().toISOString().slice(0, 10));
  const [formTarikhTamat, setFormTarikhTamat] = useState<string>(new Date().toISOString().slice(0, 10));
  const [formMasa, setFormMasa] = useState<string>('08:00 pagi – 12:00 tengah hari');
  const [formTempat, setFormTempat] = useState<string>(activeSchoolName);
  const [formSasaran, setFormSasaran] = useState<string>('Semua Guru & Murid');
  const [formObjektif, setFormObjektif] = useState<string>('');

  // Mandatory SKAS Binding
  const [formStandardGroup, setFormStandardGroup] = useState<SkasStandardGroupKey>('Std 3.1');
  const [formSubStandardCode, setFormSubStandardCode] = useState<string>('3.1.2.1');

  // Mandatory PIC & AJK Binding
  const [formPicId, setFormPicId] = useState<string>('');
  const [formSelectedAjkIds, setFormSelectedAjkIds] = useState<string[]>([]);

  // PInTaS Details
  const [formBidangFokus, setFormBidangFokus] = useState<string>('Kurikulum & Pentaksiran (PBD / UASA)');
  const [formIsuStrategik, setFormIsuStrategik] = useState<string>('');
  const [formPuncaIsu, setFormPuncaIsu] = useState<string>('');
  const [formTov, setFormTov] = useState<string>('');
  const [formEtr, setFormEtr] = useState<string>('');
  const [formKpi, setFormKpi] = useState<string>('');
  const [formStrategi, setFormStrategi] = useState<string>('');
  const [formKriteriaKejayaan, setFormKriteriaKejayaan] = useState<string>('');
  const [formAnggaranKos, setFormAnggaranKos] = useState<string>('RM 0.00');
  const [formSumberKos, setFormSumberKos] = useState<string>('PCG Panitia / Tiada Kos');

  // OPPM Months (1..12) & SubTasks
  const [formOppmMonths, setFormOppmMonths] = useState<number[]>([new Date().getMonth() + 1]);
  const [formOppmSubTasks, setFormOppmSubTasks] = useState<OppmSubTask[]>([]);
  const [formChecklist, setFormChecklist] = useState<ProgramChecklistItem[]>([]);
  const [newChecklistTitle, setNewChecklistTitle] = useState<string>('');
  const [newChecklistGroup, setNewChecklistGroup] = useState<string>('AJK Pelaksana (Do)');
  const [saving, setSaving] = useState<boolean>(false);

  // Check & Act Approval Modal State (GPK / Guru Besar)
  const [reviewModalProgram, setReviewModalProgram] = useState<KawalanProgramDoc | null>(null);
  const [reviewUlasan, setReviewUlasan] = useState<string>('');
  const [reviewKpiStatus, setReviewKpiStatus] = useState<'CAPAI' | 'SEBAHAGIAN' | 'TIDAK_CAPAI'>('CAPAI');
  const [reviewTindakanAct, setReviewTindakanAct] = useState<string>(
    'Diteruskan sebagai amalan terbaik & SOP tahunan sekolah.'
  );
  const [reviewPromoteToSop, setReviewPromoteToSop] = useState<boolean>(false);

  // 1. Hydrate Personnel / Staff Options from Firestore + OFFICIAL_TEACHERS
  useEffect(() => {
    let isMounted = true;
    async function loadPersonnel() {
      try {
        const [pSnap, uSnap, tSnap] = await Promise.all([
          getDocs(collection(db, 'personnel')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'users')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'teachers')).catch(() => ({ docs: [] })),
        ]);

        const map = new Map<string, StaffMemberOption>();

        pSnap.docs.forEach((d) => {
          const data: any = d.data();
          if (!belongsToSchool(data, activeSchoolCode)) return;
          const name = String(data.name || data.fullName || '').trim().toUpperCase();
          if (!name) return;
          map.set(d.id, {
            id: d.id,
            name,
            email: data.email || '',
            position: data.position || data.jawatan || data.role || 'GURU',
            category: data.category || 'GURU',
          });
        });

        tSnap.docs.forEach((d) => {
          const data: any = d.data();
          if (!belongsToSchool(data, activeSchoolCode)) return;
          const name = String(data.name || data.fullName || '').trim().toUpperCase();
          if (!name || map.has(d.id)) return;
          map.set(d.id, {
            id: d.id,
            name,
            email: data.email || '',
            position: data.position || data.role || 'GURU',
            category: data.category || 'GURU',
          });
        });

        uSnap.docs.forEach((d) => {
          const data: any = d.data();
          if (!belongsToSchool(data, activeSchoolCode)) return;
          if (data.role === 'murid' || data.role === 'student') return;
          const name = String(data.name || data.displayName || '').trim().toUpperCase();
          if (!name) return;
          const dupByName = Array.from(map.values()).some((s) => s.name === name);
          if (!dupByName && !map.has(d.id)) {
            map.set(d.id, {
              id: d.id,
              name,
              email: data.email || '',
              position: data.position || data.role || 'GURU',
              category: data.category || 'GURU',
            });
          }
        });

        if (isLegacySchool) {
          OFFICIAL_TEACHERS.forEach((ot) => {
            const nameUpper = ot.name.trim().toUpperCase();
            const dup = Array.from(map.values()).some((s) => s.name === nameUpper);
            if (!dup) {
              map.set(ot.id, {
                id: ot.id,
                name: nameUpper,
                email: ot.email,
                position: ot.position,
                category: ot.category,
              });
            }
          });
        }

        const list = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
        if (isMounted) {
          setStaffOptions(list);
          if (list.length > 0 && !formPicId) {
            const selfMatch = list.find(
              (s) =>
                s.name === String(currentUser.name || '').trim().toUpperCase() ||
                (s.email && s.email.toLowerCase() === String(currentUser.email || '').toLowerCase())
            );
            setFormPicId(selfMatch ? selfMatch.id : list[0].id);
          }
        }
      } catch (err) {
        console.warn('Error hydrating staff options for KawalanProgram:', err);
      }
    }
    loadPersonnel();
    return () => {
      isMounted = false;
    };
  }, [activeSchoolCode, isLegacySchool, currentUser]);

  // 2. Real-time Subscription to `kawalan_programs` & `school_sop_templates`
  useEffect(() => {
    const qProg = query(collection(db, 'kawalan_programs'));
    const unsubProg = onSnapshot(
      qProg,
      (snap) => {
        const list: KawalanProgramDoc[] = [];
        snap.forEach((d) => {
          const data = d.data() as KawalanProgramDoc;
          if (belongsToSchool(data, activeSchoolCode)) {
            list.push({ ...data, id: d.id });
          }
        });
        list.sort((a, b) => (a.tarikhMula || '').localeCompare(b.tarikhMula || ''));
        setPrograms(list);
        setLoading(false);
      },
      (err) => {
        console.warn('kawalan_programs snapshot error:', err);
        setLoading(false);
      }
    );

    const qSop = query(collection(db, 'school_sop_templates'));
    const unsubSop = onSnapshot(
      qSop,
      (snap) => {
        const sList: SchoolSopTemplate[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          if (belongsToSchool(data, activeSchoolCode)) {
            sList.push({ ...data, id: d.id });
          }
        });
        setCustomSops(sList);
      },
      () => {}
    );

    return () => {
      unsubProg();
      unsubSop();
    };
  }, [activeSchoolCode]);

  // 3. Auto-Reconcile with `ai_setiausaha_documents` (Smart OPR & Memo) so any submitted OPR automatically updates checklist & moves status to CHECK
  useEffect(() => {
    if (programs.length === 0) return;
    let isCancelled = false;

    async function reconcileWithOprDocs() {
      try {
        const docsSnap = await getDocs(collection(db, 'ai_setiausaha_documents')).catch(() => null);
        if (!docsSnap || isCancelled) return;

        const schoolDocs = docsSnap.docs
          .map((d) => ({ ...(d.data() as any), id: d.id }))
          .filter((d) => belongsToSchool(d, activeSchoolCode));

        for (const prog of programs) {
          if (isCancelled) break;
          const cleanProgTitle = String(prog.title || '').trim().toUpperCase();

          // Find matching OPR doc by sourceActivityId, linkedOprDocId, or exact title
          const matchedOpr = schoolDocs.find(
            (d) =>
              d.docKind === 'OPR' &&
              (d.id === prog.linkedOprDocId ||
                d.sourceActivityId === prog.id ||
                String(d.programTitle || '').trim().toUpperCase() === cleanProgTitle)
          );

          if (matchedOpr) {
            const oprStep = prog.checklist?.find((c) => c.stepKey === 'OPR');
            const driveUrl = matchedOpr.driveFileUrl || matchedOpr.fileUrl || matchedOpr.driveFolderUrl || matchedOpr.folderUrl || '';
            const drivePath = matchedOpr.driveFolderPath || matchedOpr.folderPath || '';
            const needsStageAdvance = prog.pdcaStage === 'PLAN' || prog.pdcaStage === 'DO';
            const needsOprMark = !prog.oprSubmitted || (oprStep && !oprStep.done) || (driveUrl && !prog.driveFileUrl);

            if (needsStageAdvance || needsOprMark) {
              const nowIso = new Date().toISOString();
              const updatedChecklist = (prog.checklist || []).map((item) =>
                item.stepKey === 'OPR' || item.stepKey === 'PELAKSANAAN'
                  ? {
                      ...item,
                      done: true,
                      completedAt: item.completedAt || matchedOpr.updatedAt || nowIso,
                      completedBy: item.completedBy || matchedOpr.preparedByName || prog.picName,
                      evidenceUrl: driveUrl || item.evidenceUrl || '',
                      linkedDocId: matchedOpr.id,
                    }
                  : item
              );

              await setDoc(
                doc(db, 'kawalan_programs', prog.id),
                deepSanitizeFirestore({
                  linkedOprDocId: matchedOpr.id,
                  oprSubmitted: true,
                  oprSubmittedAt: prog.oprSubmittedAt || matchedOpr.updatedAt || nowIso,
                  driveFileUrl: driveUrl || prog.driveFileUrl || '',
                  driveFolderPath: drivePath || prog.driveFolderPath || '',
                  checklist: updatedChecklist,
                  pdcaStage: prog.pdcaStage === 'ACT' ? 'ACT' : 'CHECK',
                  updatedAt: nowIso,
                }),
                { merge: true }
              );
            }
          }
        }
      } catch (err) {
        console.warn('Auto-reconcile KawalanProgram with OPR docs:', err);
      }
    }

    reconcileWithOprDocs();
    return () => {
      isCancelled = true;
    };
  }, [programs, activeSchoolCode]);

  // Combined 8 Universal SOPs + Custom School SOPs
  const allSopTemplates = useMemo(() => {
    const map = new Map<string, SchoolSopTemplate>();
    DEFAULT_8_SCHOOL_SOP_TEMPLATES.forEach((t) => map.set(t.id, t));
    customSops.forEach((c) => map.set(c.id, { ...c, isCustomSchoolSop: true }));
    return Array.from(map.values());
  }, [customSops]);

  // Current SKAS Group & Sub-Standards for form dropdown
  const activeFormSkasGroup = useMemo(
    () => getSkasGroup(formStandardGroup),
    [formStandardGroup]
  );

  const activeFormSubStandard = useMemo(() => {
    return (
      activeFormSkasGroup.subStandards.find((s) => s.code === formSubStandardCode) ||
      activeFormSkasGroup.subStandards[0]
    );
  }, [activeFormSkasGroup, formSubStandardCode]);

  // Apply an SOP Template in Mod Pantas (1-Click Auto-Fill)
  const handleApplySopTemplate = (sop: SchoolSopTemplate) => {
    setSelectedSopId(sop.id);
    setFormTitle(sop.titleMs.toUpperCase());
    setFormDomain(sop.domain);
    setFormStandardGroup(sop.standardGroup);
    setFormSubStandardCode(sop.subStandardCode);
    setFormKpi(sop.defaultKpi);
    setFormTov(sop.defaultTov);
    setFormEtr(sop.defaultEtr);
    setFormObjektif(sop.defaultObjektif);
    setFormSasaran(sop.defaultSasaran);
    setFormStrategi(sop.defaultStrategi);
    setFormKriteriaKejayaan(sop.defaultKpi);
    setFormBidangFokus(PROGRAM_DOMAIN_META[sop.domain].label);

    const currentPicName =
      staffOptions.find((s) => s.id === formPicId)?.name || currentUser.name || 'Penyelaras Program';

    const builtChecklist: ProgramChecklistItem[] = sop.defaultChecklistTitles.map((c, idx) => ({
      id: `sop_step_${idx + 1}`,
      stepKey: c.stepKey,
      groupLabel: c.groupLabel,
      title: c.title,
      picName: c.stepKey === 'SEMAKAN' ? 'GPK / Guru Besar' : currentPicName,
      dueDate: formTarikhMula,
      done: false,
    }));
    setFormChecklist(builtChecklist);
  };

  // Open New Program Modal
  const handleOpenNewModal = (initialMode: ProgramMode = 'PANTAS', presetSop?: SchoolSopTemplate) => {
    setEditingProgramId('');
    setFormMode(initialMode);
    const todayStr = new Date().toISOString().slice(0, 10);
    setFormTarikhMula(todayStr);
    setFormTarikhTamat(todayStr);
    setFormMasa('08:00 pagi – 12:00 tengah hari');
    setFormTempat(activeSchoolName);

    const selfStaff = staffOptions.find(
      (s) =>
        s.name === String(currentUser.name || '').trim().toUpperCase() ||
        (s.email && s.email.toLowerCase() === String(currentUser.email || '').toLowerCase())
    );
    const defaultPic = selfStaff || staffOptions[0];
    if (defaultPic) {
      setFormPicId(defaultPic.id);
    }
    setFormSelectedAjkIds([]);

    const currentMonth = new Date().getMonth() + 1;
    setFormOppmMonths([currentMonth]);
    setFormOppmSubTasks([
      {
        id: 'oppm_1',
        title: 'Penyediaan Kertas Kerja & Mesyuarat Jawatankuasa (Plan)',
        picName: defaultPic?.name || currentUser.name || 'Penyelaras',
        months: [currentMonth],
        status: 'SEDANG_BERJALAN',
      },
      {
        id: 'oppm_2',
        title: 'Pelaksanaan Program & Pengumpulan Evidens Smart OPR (Do)',
        picName: defaultPic?.name || currentUser.name || 'Penyelaras',
        months: [currentMonth],
        status: 'BELUM_MULA',
      },
      {
        id: 'oppm_3',
        title: 'Penilaian Impak KPI (TOV -> ETR) & Semakan GPK/GB (Check & Act)',
        picName: 'GPK & Guru Besar',
        months: [currentMonth],
        status: 'BELUM_MULA',
      },
    ]);

    if (initialMode === 'PANTAS') {
      const sopToUse = presetSop || allSopTemplates[0];
      handleApplySopTemplate(sopToUse);
    } else {
      setFormTitle('');
      setFormDomain('KURIKULUM');
      setFormStandardGroup('Std 3.1');
      setFormSubStandardCode('3.1.2.1');
      setFormBidangFokus('Peningkatan Kualiti Akademik & Kemenjadian Murid');
      setFormIsuStrategik('Peratus penguasaan minimum TP3–TP6 dan gred cemerlang UASA masih boleh dipertingkatkan.');
      setFormPuncaIsu('Sebahagian murid memerlukan bimbingan intervensi berfokus dan latihan pengukuhan berterusan.');
      setFormTov('82% Menguasai Minimum');
      setFormEtr('95% Menguasai Minimum');
      setFormKpi('Sekurang-kurangnya 95% murid menguasai tahap minimum TP3–TP6 pada akhir sesi akademik');
      setFormStrategi('Pelaksanaan intervensi berfokus, PLC guru dan pemantauan berkala melalui Dialog Prestasi.');
      setFormKriteriaKejayaan('Peningkatan GPMP sekurang-kurangnya 0.25 mata dan 100% evidens OPR lengkap.');
      setFormObjektif('Meningkatkan pencapaian akademik dan kemenjadian murid secara menyeluruh selaras dengan SKAS.');
      setFormSasaran('Semua Murid Tahun 1 hingga Tahun 6');
      setFormAnggaranKos('RM 300.00');
      setFormSumberKos('PCG Panitia / PIBG');
      setFormChecklist(
        buildStrategicMultiGroupChecklist(defaultPic?.name || currentUser.name || 'Penyelaras', todayStr)
      );
    }

    setIsModalOpen(true);
  };

  // Open Edit Modal for Existing Program
  const handleOpenEditModal = (prog: KawalanProgramDoc) => {
    setEditingProgramId(prog.id);
    setFormMode(prog.mode);
    setSelectedSopId(prog.sopTemplateId || DEFAULT_8_SCHOOL_SOP_TEMPLATES[0].id);
    setFormTitle(prog.title);
    setFormDomain(prog.domain);
    setFormTarikhMula(prog.tarikhMula);
    setFormTarikhTamat(prog.tarikhTamat || prog.tarikhMula);
    setFormMasa(prog.masa || '08:00 pagi – 12:00 tengah hari');
    setFormTempat(prog.tempat || activeSchoolName);
    setFormSasaran(prog.sasaran || 'Semua Guru & Murid');
    setFormObjektif(prog.objektif || '');
    setFormStandardGroup(prog.standardGroup || 'Std 3.1');
    setFormSubStandardCode(prog.subStandardCode || '3.1.2.1');
    setFormPicId(prog.picId);
    setFormSelectedAjkIds((prog.ajkMembers || []).map((a) => a.teacherId));

    setFormBidangFokus(prog.pintas?.bidangFokus || '');
    setFormIsuStrategik(prog.pintas?.isuStrategik || '');
    setFormPuncaIsu(prog.pintas?.puncaIsu || '');
    setFormTov(prog.pintas?.tov || '');
    setFormEtr(prog.pintas?.etr || '');
    setFormKpi(prog.pintas?.kpi || '');
    setFormStrategi(prog.pintas?.strategiInisiatif || '');
    setFormKriteriaKejayaan(prog.pintas?.kriteriaKejayaan || '');
    setFormAnggaranKos(prog.pintas?.anggaranKos || 'RM 0.00');
    setFormSumberKos(prog.pintas?.sumberKos || 'Tiada Kos');

    setFormOppmMonths(
      Array.isArray(prog.oppmMonths) && prog.oppmMonths.length > 0 ? prog.oppmMonths : [1]
    );
    setFormOppmSubTasks(Array.isArray(prog.oppmSubTasks) ? prog.oppmSubTasks : []);
    setFormChecklist(
      Array.isArray(prog.checklist) && prog.checklist.length > 0
        ? prog.checklist
        : buildDefault4StepChecklist(prog.picName, prog.tarikhMula)
    );
    setIsModalOpen(true);
  };

  // Save Program (Create or Update)
  const handleSaveProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      showToast('Sila masukkan Nama Program / Aktiviti.', 'warning');
      return;
    }

    const selectedPic =
      staffOptions.find((s) => s.id === formPicId) ||
      staffOptions[0] || {
        id: currentUser.uid,
        name: (currentUser.name || 'GURU').toUpperCase(),
        email: currentUser.email || '',
        position: 'Penyelaras Program',
        category: 'GURU',
      };

    const ajkList = formSelectedAjkIds
      .map((id) => staffOptions.find((s) => s.id === id))
      .filter(Boolean)
      .map((s) => ({
        teacherId: s!.id,
        teacherName: s!.name,
        role: s!.position || 'AJK Pelaksana',
      }));

    const resolvedSkas = resolveSkasSelection(formStandardGroup, formSubStandardCode);

    const existingProg = editingProgramId
      ? programs.find((p) => p.id === editingProgramId)
      : undefined;

    const docId =
      editingProgramId ||
      scopedDocId(activeSchoolCode, `prog_${academicYear}_${Date.now()}`);

    const nowIso = new Date().toISOString();

    const finalChecklist =
      formChecklist.length > 0
        ? formChecklist.map((item) => ({
            ...item,
            picName:
              item.stepKey === 'SEMAKAN'
                ? 'GPK / Guru Besar'
                : item.picName || selectedPic.name,
            dueDate: item.dueDate || formTarikhMula,
          }))
        : formMode === 'PANTAS'
        ? buildDefault4StepChecklist(selectedPic.name, formTarikhMula)
        : buildStrategicMultiGroupChecklist(selectedPic.name, formTarikhMula);

    // Determine PDCA Stage from checklist
    const memoDone = finalChecklist.some((c) => c.stepKey === 'MEMO' && c.done);
    const pelDone = finalChecklist.some((c) => c.stepKey === 'PELAKSANAAN' && c.done);
    const oprDone = finalChecklist.some((c) => c.stepKey === 'OPR' && c.done) || Boolean(existingProg?.oprSubmitted);
    const semakanDone = finalChecklist.some((c) => c.stepKey === 'SEMAKAN' && c.done) || Boolean(existingProg?.gbApproved);

    let computedStage: PdcaStage = existingProg?.pdcaStage || 'PLAN';
    if (semakanDone) {
      computedStage = 'ACT';
    } else if (oprDone) {
      computedStage = 'CHECK';
    } else if (memoDone || pelDone) {
      computedStage = 'DO';
    }

    const payload: KawalanProgramDoc = {
      id: docId,
      schoolCode: activeSchoolCode,
      academicYear,
      mode: formMode,
      sopTemplateId: formMode === 'PANTAS' ? selectedSopId : undefined,
      title: formTitle.trim().toUpperCase(),
      domain: formDomain,
      tarikhMula: formTarikhMula,
      tarikhTamat: formTarikhTamat || formTarikhMula,
      masa: formMasa,
      tempat: formTempat,
      sasaran: formSasaran,
      objektif: formObjektif,
      standardGroup: resolvedSkas.standardGroup,
      subStandardCode: resolvedSkas.subStandardCode,
      subStandardTitle: resolvedSkas.subStandardTitle,
      picId: selectedPic.id,
      picName: selectedPic.name,
      picEmail: selectedPic.email,
      picPosition: selectedPic.position,
      ajkMembers: ajkList,
      pintas: {
        bidangFokus: formBidangFokus || PROGRAM_DOMAIN_META[formDomain].label,
        isuStrategik:
          formIsuStrategik ||
          `Memastikan pelaksanaan ${formTitle.trim()} mencapai sasaran kualiti SKAS ${resolvedSkas.subStandardCode}.`,
        puncaIsu:
          formPuncaIsu ||
          'Keperluan penyelarasan sistematik, pemantauan berterusan dan dokumentasi evidens berfokus.',
        tov: formTov || '85%',
        etr: formEtr || '100%',
        kpi: formKpi || '100% objektif program dan sasaran penglibatan tercapai',
        strategiInisiatif: formStrategi || formObjektif || formTitle.trim(),
        kriteriaKejayaan: formKriteriaKejayaan || formKpi || '100% mencapai sasaran KPI',
        anggaranKos: formAnggaranKos || 'RM 0.00',
        sumberKos: formSumberKos || 'Tiada Kos',
      },
      oppmMonths:
        formOppmMonths.length > 0
          ? [...formOppmMonths].sort((a, b) => a - b)
          : [parseInt(formTarikhMula.slice(5, 7), 10) || 1],
      oppmSubTasks: formOppmSubTasks,
      pdcaStage: computedStage,
      checklist: finalChecklist,
      linkedMemoDocId: existingProg?.linkedMemoDocId,
      linkedMinitDocId: existingProg?.linkedMinitDocId,
      linkedOprDocId: existingProg?.linkedOprDocId,
      oprSubmitted: oprDone,
      oprSubmittedAt: existingProg?.oprSubmittedAt,
      driveFileUrl: existingProg?.driveFileUrl,
      driveFolderUrl: existingProg?.driveFolderUrl,
      driveFolderPath:
        existingProg?.driveFolderPath || resolvedSkas.driveTargetFolderPath.join(' / '),
      gpkVerified: existingProg?.gpkVerified,
      gpkVerifiedBy: existingProg?.gpkVerifiedBy,
      gpkVerifiedAt: existingProg?.gpkVerifiedAt,
      gpkUlasan: existingProg?.gpkUlasan,
      gbApproved: existingProg?.gbApproved,
      gbApprovedBy: existingProg?.gbApprovedBy,
      gbApprovedAt: existingProg?.gbApprovedAt,
      gbUlasan: existingProg?.gbUlasan,
      kpiAchievementStatus: existingProg?.kpiAchievementStatus,
      tindakanSusulanAct: existingProg?.tindakanSusulanAct,
      isSchoolSopStandard: existingProg?.isSchoolSopStandard,
      createdByUid: existingProg?.createdByUid || currentUser.uid,
      createdByName: existingProg?.createdByName || currentUser.name,
      createdAt: existingProg?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    try {
      setSaving(true);
      await setDoc(doc(db, 'kawalan_programs', docId), deepSanitizeFirestore(payload), {
        merge: true,
      });
      setIsModalOpen(false);
      showToast(
        editingProgramId
          ? `Program "${payload.title}" telah dikemas kini!`
          : `Program "${payload.title}" (${payload.standardGroup} • ${payload.subStandardCode}) berjaya didaftarkan dalam Kawalan PDCA!`,
        'success'
      );
    } catch (err: any) {
      console.error('Error saving Kawalan Program:', err);
      showToast(`Gagal menyimpan program: ${err?.message || 'Ralat'}`, 'warning');
    } finally {
      setSaving(false);
    }
  };

  // Toggle a Checklist Item directly from the Program Card or Personal Todo Card
  const handleToggleChecklistStep = async (
    prog: KawalanProgramDoc,
    stepId: string
  ) => {
    const nowIso = new Date().toISOString();
    const updatedChecklist = (prog.checklist || []).map((item) => {
      if (item.id !== stepId) return item;
      const nextDone = !item.done;
      return {
        ...item,
        done: nextDone,
        completedAt: nextDone ? nowIso : undefined,
        completedBy: nextDone ? currentUser.name : undefined,
      };
    });

    const memoDone = updatedChecklist.some((c) => c.stepKey === 'MEMO' && c.done);
    const pelDone = updatedChecklist.some((c) => c.stepKey === 'PELAKSANAAN' && c.done);
    const oprDone = updatedChecklist.some((c) => c.stepKey === 'OPR' && c.done);
    const semakanDone = updatedChecklist.some((c) => c.stepKey === 'SEMAKAN' && c.done);

    let nextStage: PdcaStage = 'PLAN';
    if (semakanDone && isAdminOrGpk) {
      nextStage = 'ACT';
    } else if (oprDone) {
      nextStage = 'CHECK';
    } else if (memoDone || pelDone || updatedChecklist.some((c) => c.done)) {
      nextStage = 'DO';
    }

    try {
      await setDoc(
        doc(db, 'kawalan_programs', prog.id),
        deepSanitizeFirestore({
          checklist: updatedChecklist,
          oprSubmitted: oprDone,
          oprSubmittedAt: oprDone ? prog.oprSubmittedAt || nowIso : undefined,
          pdcaStage: nextStage,
          updatedAt: nowIso,
        }),
        { merge: true }
      );
      showToast(
        `Status senarai semak "${prog.title}" dikemas kini -> ${PDCA_STAGE_META[nextStage].shortLabel}`,
        'info'
      );
    } catch (err: any) {
      showToast(`Gagal mengemas kini checklist: ${err?.message}`, 'warning');
    }
  };

  // Launch Memo / Minit / Smart OPR directly in AISetiausahaHub with full context inheritance
  const handleLaunchSetiausahaForProgram = (
    prog: KawalanProgramDoc,
    targetTab: 'MEMO' | 'MINIT' | 'OPR'
  ) => {
    if (!onOpenSetiausahaDoc) return;
    const pillarMap: Record<ProgramDomain, string> = {
      PENTADBIRAN: 'PENTADBIRAN',
      KURIKULUM: 'KURIKULUM',
      HEM: 'HEM',
      KOKURIKULUM: 'KOKURIKULUM',
      PIBK_3K: 'HEM',
    };

    const invitedTeachers = [
      {
        teacherId: prog.picId,
        teacherName: prog.picName,
        committeeRole: 'Penyelaras Program',
      },
      ...(prog.ajkMembers || []).map((a) => ({
        teacherId: a.teacherId,
        teacherName: a.teacherName,
        committeeRole: a.role || 'AJK Pelaksana',
      })),
    ];

    onOpenSetiausahaDoc({
      targetTab,
      taskItem: {
        id: prog.id,
        kawalanProgramId: prog.id,
        title: prog.title,
        dueDate: prog.tarikhMula,
        tarikhMula: prog.tarikhMula,
        masa: prog.masa || '08:00 pagi – 12:00 tengah hari',
        location: prog.tempat || activeSchoolName,
        tempat: prog.tempat || activeSchoolName,
        sasaran: prog.sasaran || 'Semua Guru & Murid',
        objektif: prog.objektif || prog.pintas?.kpi || '',
        kpi: prog.pintas?.kpi || '',
        strategi: prog.pintas?.strategiInisiatif || '',
        description: `${prog.objektif || ''} | KPI: ${prog.pintas?.kpi || ''}`,
        standardGroup: prog.standardGroup,
        subStandardCode: prog.subStandardCode,
        subStandardTitle: prog.subStandardTitle,
        pillar: pillarMap[prog.domain] || 'KURIKULUM',
        picName: prog.picName,
        invitedTeachers,
      },
    });
  };

  // Open GPK / GB Check & Act Review Modal
  const handleOpenReviewModal = (prog: KawalanProgramDoc) => {
    setReviewModalProgram(prog);
    setReviewUlasan(
      isGB
        ? prog.gbUlasan ||
            'Program dilaksanakan dengan cemerlang mengikut ketetapan SKPM Kualiti@Sekolah. Evidens OPR lengkap dan mencapai sasaran KPI.'
        : prog.gpkUlasan ||
            'Semakan awal GPK selesai: Laporan Smart OPR dan evidens pelaksanaan lengkap untuk pengesahan akhir Guru Besar.'
    );
    setReviewKpiStatus(prog.kpiAchievementStatus || 'CAPAI');
    setReviewTindakanAct(
      prog.tindakanSusulanAct ||
        'Diteruskan sebagai amalan terbaik & SOP standard sekolah bagi sesi seterusnya.'
    );
    setReviewPromoteToSop(Boolean(prog.isSchoolSopStandard));
  };

  // Submit GPK Check or Guru Besar Final Check + Act SOP Promotion
  const handleConfirmReviewAndAct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewModalProgram) return;
    const prog = reviewModalProgram;
    const nowIso = new Date().toISOString();

    const updatedChecklist = (prog.checklist || []).map((item) =>
      item.stepKey === 'SEMAKAN'
        ? {
            ...item,
            done: true,
            completedAt: nowIso,
            completedBy: currentUser.name,
          }
        : item
    );

    const updatePayload: Partial<KawalanProgramDoc> = {
      checklist: updatedChecklist,
      kpiAchievementStatus: reviewKpiStatus,
      tindakanSusulanAct: reviewTindakanAct,
      updatedAt: nowIso,
    };

    if (isGB) {
      updatePayload.gbApproved = true;
      updatePayload.gbApprovedBy = currentUser.name;
      updatePayload.gbApprovedAt = nowIso;
      updatePayload.gbUlasan = reviewUlasan;
      updatePayload.gpkVerified = true;
      updatePayload.pdcaStage = 'ACT';
      updatePayload.isSchoolSopStandard = reviewPromoteToSop;
    } else {
      // GPK Preliminary Check
      updatePayload.gpkVerified = true;
      updatePayload.gpkVerifiedBy = currentUser.name;
      updatePayload.gpkVerifiedAt = nowIso;
      updatePayload.gpkUlasan = reviewUlasan;
      updatePayload.pdcaStage = prog.gbApproved ? 'ACT' : 'CHECK';
    }

    try {
      setSaving(true);
      await setDoc(
        doc(db, 'kawalan_programs', prog.id),
        deepSanitizeFirestore(updatePayload),
        { merge: true }
      );

      // If Guru Besar checked "Jadikan / Kemaskini SOP Sekolah (Act)", save to `school_sop_templates`
      if (isGB && reviewPromoteToSop) {
        const sopId = scopedDocId(
          activeSchoolCode,
          prog.sopTemplateId || `sop_custom_${prog.id}`
        );
        const newSop: SchoolSopTemplate & { schoolCode: string } = {
          id: sopId,
          schoolCode: activeSchoolCode,
          code: `SOP-GB-${prog.subStandardCode}`,
          titleMs: prog.title,
          titleZh: `校长认证校本标准 SOP (${prog.subStandardCode})`,
          domain: prog.domain,
          defaultMode: prog.mode,
          standardGroup: prog.standardGroup,
          subStandardCode: prog.subStandardCode,
          subStandardTitle: prog.subStandardTitle,
          defaultKpi: prog.pintas?.kpi || '100% mencapai sasaran KPI',
          defaultTov: prog.pintas?.tov || '85%',
          defaultEtr: prog.pintas?.etr || '100%',
          defaultObjektif: prog.objektif || prog.pintas?.strategiInisiatif || '',
          defaultSasaran: prog.sasaran || 'Semua Guru & Murid',
          defaultStrategi: prog.pintas?.strategiInisiatif || '',
          defaultChecklistTitles: [
            { stepKey: 'MEMO', groupLabel: '1. Plan', title: '1. Memo / Kertas Kerja Program' },
            { stepKey: 'PELAKSANAAN', groupLabel: '2. Do', title: '2. Pelaksanaan Mengikut SOP Sekolah' },
            { stepKey: 'OPR', groupLabel: '3. Do -> Check', title: `3. Smart OPR & Arkib Drive (${prog.subStandardCode})` },
            { stepKey: 'SEMAKAN', groupLabel: '4. Check -> Act', title: '4. Semakan GPK & Pengesahan Guru Besar' },
          ],
          isCustomSchoolSop: true,
          updatedByGb: currentUser.name,
          updatedAt: nowIso,
        };
        await setDoc(doc(db, 'school_sop_templates', sopId), deepSanitizeFirestore(newSop), {
          merge: true,
        });
      }

      setReviewModalProgram(null);
      showToast(
        isGB
          ? `Pengesahan Akhir Guru Besar selesai! Program "${prog.title}" kini berstatus "Selesai & SOP (Act)"${
              reviewPromoteToSop ? ' dan telah disimpan ke Pustaka SOP Sekolah!' : '.'
            }`
          : `Semakan Awal GPK bagi "${prog.title}" telah direkodkan untuk pengesahan akhir Guru Besar.`,
        'success'
      );
    } catch (err: any) {
      showToast(`Gagal menyimpan semakan: ${err?.message}`, 'warning');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProgram = async (prog: KawalanProgramDoc) => {
    try {
      await deleteDoc(doc(db, 'kawalan_programs', prog.id));
      showToast(`Program "${prog.title}" telah dipadam.`, 'info');
    } catch (err: any) {
      showToast(`Gagal memadam program: ${err?.message}`, 'warning');
    }
  };

  // Filtered Programs by Academic Year
  const yearPrograms = useMemo(
    () => programs.filter((p) => (p.academicYear || '2026') === academicYear),
    [programs, academicYear]
  );

  // Enrich with SLA Evaluation
  const enrichedPrograms = useMemo(() => {
    return yearPrograms.map((p) => ({
      program: p,
      sla: evaluateProgramSLA(p),
    }));
  }, [yearPrograms]);

  // Top Supervision Radar Metrics
  const radarMetrics = useMemo(() => {
    const total = enrichedPrograms.length;
    const inProgressCount = enrichedPrograms.filter(
      ({ program }) => program.pdcaStage !== 'ACT'
    ).length;
    const completedActCount = enrichedPrograms.filter(
      ({ program }) => program.pdcaStage === 'ACT'
    ).length;
    const waitingCheckCount = enrichedPrograms.filter(
      ({ program }) => program.pdcaStage === 'CHECK'
    ).length;
    const overdueSlaList = enrichedPrograms.filter(({ sla }) => sla.isOverdueSLA);
    const overdueCount = overdueSlaList.length;

    // On-time closure rate: programs completed (ACT) or on-track without SLA violation
    const onTimeCompletionRate =
      total > 0
        ? Math.round(((completedActCount + (total - overdueCount - inProgressCount)) / total) * 100)
        : 100;
    const effectiveClosureRate =
      total > 0 ? Math.max(0, Math.min(100, Math.round((completedActCount / total) * 100))) : 0;

    return {
      total,
      inProgressCount,
      completedActCount,
      waitingCheckCount,
      overdueCount,
      overdueSlaList,
      onTimeCompletionRate,
      effectiveClosureRate,
    };
  }, [enrichedPrograms]);

  // Personal Tasks & Pending OPR for Logged-in Teacher (Guru / AJK view)
  const myPendingPrograms = useMemo(() => {
    const myNameUpper = String(currentUser.name || '').trim().toUpperCase();
    const myEmailLower = String(currentUser.email || '').trim().toLowerCase();
    return enrichedPrograms.filter(({ program }) => {
      if (program.pdcaStage === 'ACT') return false;
      const isPic =
        program.picId === currentUser.uid ||
        String(program.picName || '').trim().toUpperCase() === myNameUpper ||
        (program.picEmail && program.picEmail.toLowerCase() === myEmailLower);
      const isAjk = (program.ajkMembers || []).some(
        (a) =>
          a.teacherId === currentUser.uid ||
          String(a.teacherName || '').trim().toUpperCase() === myNameUpper
      );
      return isPic || isAjk;
    });
  }, [enrichedPrograms, currentUser]);

  // Filtered & Sorted Programs (Overdue SLA automatically pinned to top!)
  const displayedPrograms = useMemo(() => {
    const myNameUpper = String(currentUser.name || '').trim().toUpperCase();
    const q = searchQuery.trim().toLowerCase();

    return enrichedPrograms
      .filter(({ program, sla }) => {
        if (domainFilter === 'MY_DOMAIN') {
          if (!supervisionRole.managedDomains.includes(program.domain)) return false;
        } else if (domainFilter !== 'ALL') {
          if (program.domain !== domainFilter) return false;
        }

        if (stageFilter === 'OVERDUE_SLA') {
          if (!sla.isOverdueSLA) return false;
        } else if (stageFilter !== 'ALL') {
          if (program.pdcaStage !== stageFilter) return false;
        }

        if (scopeFilter === 'MY_PROGRAMS') {
          const isMine =
            program.picId === currentUser.uid ||
            String(program.picName || '').trim().toUpperCase() === myNameUpper ||
            (program.ajkMembers || []).some(
              (a) =>
                a.teacherId === currentUser.uid ||
                String(a.teacherName || '').trim().toUpperCase() === myNameUpper
            );
          if (!isMine) return false;
        }

        if (q) {
          const hay = `${program.title} ${program.picName} ${program.subStandardCode} ${program.subStandardTitle} ${program.pintas?.kpi || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Auto-pin Overdue SLA red-light programs to the top
        if (a.sla.isOverdueSLA && !b.sla.isOverdueSLA) return -1;
        if (!a.sla.isOverdueSLA && b.sla.isOverdueSLA) return 1;
        // Next prioritize CHECK stage for GPK/GB
        if (a.program.pdcaStage === 'CHECK' && b.program.pdcaStage !== 'CHECK') return -1;
        if (a.program.pdcaStage !== 'CHECK' && b.program.pdcaStage === 'CHECK') return 1;
        return (a.program.tarikhMula || '').localeCompare(b.program.tarikhMula || '');
      });
  }, [
    enrichedPrograms,
    domainFilter,
    stageFilter,
    scopeFilter,
    searchQuery,
    supervisionRole,
    currentUser,
  ]);

  // 1-Click Excel (.xlsx) Export of Annual Program Supervision Master Table + PInTaS + OPPM
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Master Kawalan Program PDCA
    const masterRows = enrichedPrograms.map(({ program, sla }, idx) => ({
      Bil: idx + 1,
      'Mod Program': program.mode === 'STRATEGIK' ? 'Mod Strategik (Besar)' : 'Mod Pantas (Rutin)',
      'Nama Program / Aktiviti': program.title,
      Bidang: PROGRAM_DOMAIN_META[program.domain]?.shortLabel || program.domain,
      'Tarikh Mula': program.tarikhMula,
      'Tarikh Tamat': program.tarikhTamat || program.tarikhMula,
      'SKAS Standard': program.standardGroup,
      'SKAS Sub-Standard': `${program.subStandardCode} - ${program.subStandardTitle}`,
      'Penyelaras (PIC)': program.picName,
      'Ahli Jawatankuasa (AJK)': (program.ajkMembers || []).map((a) => a.teacherName).join(', '),
      'Sasaran KPI': program.pintas?.kpi || '-',
      TOV: program.pintas?.tov || '-',
      ETR: program.pintas?.etr || '-',
      'Status PDCA': PDCA_STAGE_META[program.pdcaStage]?.shortLabel || program.pdcaStage,
      'Smart OPR Dihantar': program.oprSubmitted ? 'YA' : 'BELUM',
      'Pautan Google Drive': program.driveFileUrl || program.driveFolderPath || '-',
      'Status SLA (5 Hari Bekerja)': sla.isOverdueSLA
        ? `TERTUNGGAK (${sla.workingDaysElapsed} Hari Bekerja)`
        : 'PATUH SLA',
      'Semakan GPK': program.gpkVerified ? `Disemak (${program.gpkVerifiedBy || 'GPK'})` : 'Belum',
      'Pengesahan Guru Besar': program.gbApproved
        ? `Disahkan (${program.gbApprovedBy || 'GB'})`
        : 'Belum',
      'Ulasan & Tindakan Susulan (Act)': program.gbUlasan || program.tindakanSusulanAct || '-',
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        masterRows.length > 0
          ? masterRows
          : [{ Info: 'Tiada rekod program bagi sesi ini.' }]
      ),
      '1_Master_Kawalan_PDCA'
    );

    // Sheet 2: PInTaS Strategik
    const pintasRows = enrichedPrograms.map(({ program }, idx) => ({
      Bil: idx + 1,
      'Bidang Fokus': program.pintas?.bidangFokus || PROGRAM_DOMAIN_META[program.domain]?.label,
      'Isu Strategik / Data Dapatan': program.pintas?.isuStrategik || '-',
      'Punca Isu': program.pintas?.puncaIsu || '-',
      'Kriteria Kejayaan / KPI': program.pintas?.kpi || '-',
      TOV: program.pintas?.tov || '-',
      ETR: program.pintas?.etr || '-',
      'Strategi & Inisiatif (Program)': `${program.title} (${program.pintas?.strategiInisiatif || ''})`,
      'SKAS Sub-Standard': `${program.subStandardCode} ${program.subStandardTitle}`,
      'Pegawai Bertanggungjawab (PIC)': program.picName,
      Tempoh: `${program.tarikhMula} hingga ${program.tarikhTamat || program.tarikhMula}`,
      'Anggaran Kos & Sumber': `${program.pintas?.anggaranKos || 'RM 0'} (${program.pintas?.sumberKos || '-'})`,
      'Evidens & Status PDCA': `${PDCA_STAGE_META[program.pdcaStage]?.shortLabel} | ${
        program.oprSubmitted ? 'OPR Lengkap' : 'Belum OPR'
      }`,
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        pintasRows.length > 0 ? pintasRows : [{ Info: 'Tiada rekod PInTaS.' }]
      ),
      '2_Matriks_PInTaS'
    );

    // Sheet 3: OPPM Gantt 1-12 Bulan
    const oppmRows = enrichedPrograms.map(({ program }, idx) => {
      const mSet = new Set(program.oppmMonths || []);
      const row: Record<string, any> = {
        Bil: idx + 1,
        'Program / Inisiatif': program.title,
        Bidang: PROGRAM_DOMAIN_META[program.domain]?.shortLabel || program.domain,
        SKAS: program.subStandardCode,
        'Penyelaras (PIC)': program.picName,
      };
      MALAY_MONTH_SHORT.forEach((mName, mIdx) => {
        row[mName] = mSet.has(mIdx + 1) ? '●' : '';
      });
      row['Status PDCA'] = PDCA_STAGE_META[program.pdcaStage]?.shortLabel;
      row['Pencapaian KPI'] = program.kpiAchievementStatus || 'DALAM TINDAKAN';
      return row;
    });
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        oppmRows.length > 0 ? oppmRows : [{ Info: 'Tiada rekod OPPM.' }]
      ),
      '3_OPPM_Gantt_1_12'
    );

    XLSX.writeFile(
      wb,
      `Kawalan_Program_PInTaS_OPPM_PDCA_${activeSchoolCode}_Sesi_${academicYear}.xlsx`
    );
    showToast('Fail Excel Master Kawalan Program, PInTaS & OPPM berjaya dimuat turun!', 'success');
  };

  // Official A4 Landscape Printout of PInTaS & OPPM Report
  const handlePrintPintasOppmA4 = () => {
    triggerSmartPrint({
      elementId: 'kawalan-program-pintas-oppm-print-area',
      title: `Laporan PInTaS & OPPM Kawalan Program PDCA - ${activeSchoolName} (${activeSchoolCode}) Sesi ${academicYear}`,
      orientation: 'landscape',
    });
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMsg && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-2xl border text-xs font-bold flex items-center gap-2.5 animate-fade-in ${
            toastMsg.type === 'success'
              ? 'bg-emerald-950 text-emerald-200 border-emerald-500/50'
              : toastMsg.type === 'warning'
              ? 'bg-amber-950 text-amber-200 border-amber-500/50'
              : 'bg-blue-950 text-blue-200 border-blue-500/50'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* ================= HEADER & ROLE AUTHORITY BANNER ================= */}
      <div className="print:hidden bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-indigo-400" />
                KAWALAN PROGRAM &amp; PDCA BERSEPADU · SESI {academicYear}
              </span>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                {supervisionRole.roleBadge}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
              <span>Kawalan Program Sekolah (PInTaS · OPPM · PDCA · SKAS)</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl">
              Pusat pendaftaran, pemantauan SLA 5 hari bekerja, dan pengesahan kitaran{' '}
              <strong className="text-slate-200">Plan &rarr; Do &rarr; Check &rarr; Act</strong> yang
              bersepadu sepenuhnya dengan <strong className="text-indigo-300">SKAS Standards</strong>,{' '}
              <strong className="text-teal-300">AI Setiausaha (Memo, Minit, Smart OPR)</strong> serta{' '}
              <strong className="text-blue-300">Arkib Google Drive Sekolah</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <select
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white cursor-pointer"
            >
              <option value="2026">Sesi Akademik 2026</option>
              <option value="2027">Sesi Akademik 2027</option>
              <option value="2028">Sesi Akademik 2028</option>
            </select>

            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Eksport Excel (.xlsx)</span>
            </button>

            <button
              type="button"
              onClick={handlePrintPintasOppmA4}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4 text-indigo-400" />
              <span>Cetak PInTaS &amp; OPPM (A4)</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenNewModal('PANTAS')}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-blue-600/30 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Zap className="w-4 h-4" />
              <span>+ Program Pantas (1-Minit SOP)</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenNewModal('STRATEGIK')}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-indigo-600/30 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Program Strategik (PInTaS/OPPM)</span>
            </button>
          </div>
        </div>
      </div>

      {/* ================= SUPERVISION RADAR & SLA METRICS (4 KPI CARDS) ================= */}
      <div className="print:hidden grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => setStageFilter('ALL')}
          className="bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-2xl p-5 cursor-pointer transition"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              Program Sedang Berjalan
            </span>
            <Activity className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-white">
              {radarMetrics.inProgressCount}
            </span>
            <span className="text-xs text-slate-400 font-semibold">
              / {radarMetrics.total} jumlah program
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Fasa Plan &amp; Do merentas 5 bidang sekolah
          </p>
        </div>

        <div
          onClick={() => setStageFilter('ACT')}
          className="bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-5 cursor-pointer transition"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              Kadar Selesai &amp; Patuh SLA
            </span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-emerald-400">
              {radarMetrics.onTimeCompletionRate}%
            </span>
            <span className="text-xs text-slate-400 font-semibold">
              ({radarMetrics.completedActCount} selesai Act)
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Kadar penutupan kes &amp; pematuhan SLA 5 hari
          </p>
        </div>

        <div
          onClick={() => setStageFilter('CHECK')}
          className="bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded-2xl p-5 cursor-pointer transition"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              Menunggu Semakan (Check)
            </span>
            <FolderCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-amber-400">
              {radarMetrics.waitingCheckCount}
            </span>
            <span className="text-xs text-amber-300/80 font-semibold">
              OPR siap diarkib
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Menunggu pengesahan GPK / Guru Besar
          </p>
        </div>

        <div
          onClick={() => setStageFilter(stageFilter === 'OVERDUE_SLA' ? 'ALL' : 'OVERDUE_SLA')}
          className={`rounded-2xl p-5 cursor-pointer transition border ${
            radarMetrics.overdueCount > 0
              ? 'bg-rose-950/40 border-rose-500/60 hover:border-rose-400'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span
              className={`text-[11px] font-bold uppercase tracking-wider ${
                radarMetrics.overdueCount > 0 ? 'text-rose-300' : 'text-slate-400'
              }`}
            >
              Amaran Merah SLA (&gt;5 Hari)
            </span>
            <ShieldAlert
              className={`w-4 h-4 ${
                radarMetrics.overdueCount > 0
                  ? 'text-rose-400 animate-pulse'
                  : 'text-emerald-400'
              }`}
            />
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl sm:text-3xl font-black ${
                radarMetrics.overdueCount > 0 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {radarMetrics.overdueCount}
            </span>
            <span className="text-xs text-slate-400 font-semibold">
              program tertunggak OPR / semakan
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            Melebihi 5 hari bekerja selepas Tarikh Program
          </p>
        </div>
      </div>

      {/* ================= RED-LIGHT SLA OVERDUE ALERT BANNER (AUTO-PINNED) ================= */}
      {radarMetrics.overdueSlaList.length > 0 && (
        <div className="print:hidden bg-rose-950/30 border-2 border-rose-500/60 rounded-3xl p-5 space-y-3 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <h3 className="text-sm font-black text-rose-200 uppercase tracking-wide">
                  Radar Amaran Merah SLA: {radarMetrics.overdueSlaList.length} Program Melebihi 5 Hari Bekerja Tanpa OPR / Semakan Selesai
                </h3>
                <p className="text-[11px] text-rose-300/80">
                  Peraturan SLA Sekolah: Smart OPR &amp; pengesahan semakan wajib diselesaikan dalam tempoh 5 hari bekerja selepas Tarikh Program.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {radarMetrics.overdueSlaList.map(({ program, sla }) => {
              const domMeta = PROGRAM_DOMAIN_META[program.domain];
              return (
                <div
                  key={`sla_${program.id}`}
                  className="bg-slate-950/90 border border-rose-500/40 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded text-[9.5px] font-black uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40">
                        TERTUNGGAK {sla.workingDaysElapsed} HARI BEKERJA
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[9.5px] font-bold border ${domMeta.badgeBg} ${domMeta.badgeText} ${domMeta.badgeBorder}`}
                      >
                        {domMeta.shortLabel}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[9.5px] font-mono font-bold bg-slate-800 text-indigo-300">
                        {program.standardGroup} • {program.subStandardCode}
                      </span>
                    </div>
                    <p className="text-xs font-black text-white">{program.title}</p>
                    <p className="text-[11px] text-slate-300">
                      Penyelaras: <strong className="text-amber-300">{program.picName}</strong> · Tarikh Program:{' '}
                      <span className="font-mono">{program.tarikhMula}</span>
                    </p>
                    <p className="text-[10px] text-rose-300 font-semibold">{sla.slaReason}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!program.oprSubmitted && (
                      <button
                        type="button"
                        onClick={() => handleLaunchSetiausahaForProgram(program, 'OPR')}
                        className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold transition cursor-pointer"
                      >
                        📸 Isi Smart OPR
                      </button>
                    )}
                    {isAdminOrGpk && (
                      <button
                        type="button"
                        onClick={() => handleOpenReviewModal(program)}
                        className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold transition cursor-pointer"
                      >
                        ✅ Semak (Check)
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= GURU / AJK PERSONAL PENDING TASKS & OPR CARD ================= */}
      {myPendingPrograms.length > 0 && (
        <div className="print:hidden bg-slate-900/95 border border-indigo-500/40 rounded-3xl p-5 space-y-3 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-indigo-400" />
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Tugasan &amp; OPR Belum Selesai Saya ({myPendingPrograms.length} Program)
              </h3>
            </div>
            <span className="text-[11px] text-indigo-300 font-semibold">
              Klik kotak semak untuk tandakan siap atau terus jana Smart OPR
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {myPendingPrograms.map(({ program, sla }) => {
              const nextIncompleteStep = (program.checklist || []).find((c) => !c.done);
              return (
                <div
                  key={`my_${program.id}`}
                  className={`rounded-2xl p-4 border flex flex-col justify-between gap-3 ${
                    sla.isOverdueSLA
                      ? 'bg-rose-950/25 border-rose-500/50'
                      : 'bg-slate-950/90 border-slate-800'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2 py-0.5 rounded text-[9.5px] font-mono font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                        {program.standardGroup} • {program.subStandardCode}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[9.5px] font-bold border ${
                          PDCA_STAGE_META[program.pdcaStage].bgClass
                        } ${PDCA_STAGE_META[program.pdcaStage].textClass} ${
                          PDCA_STAGE_META[program.pdcaStage].borderClass
                        }`}
                      >
                        {PDCA_STAGE_META[program.pdcaStage].shortLabel}
                      </span>
                    </div>
                    <h4 className="text-xs font-black text-white leading-snug">{program.title}</h4>
                    <p className="text-[10px] text-slate-400">
                      Tarikh: <span className="font-mono text-slate-300">{program.tarikhMula}</span> · PIC:{' '}
                      <span className="text-slate-200 font-semibold">{program.picName}</span>
                    </p>

                    {nextIncompleteStep && (
                      <button
                        type="button"
                        onClick={() => handleToggleChecklistStep(program, nextIncompleteStep.id)}
                        className="w-full mt-1 p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-left flex items-center gap-2 text-[11px] text-amber-200 font-semibold transition cursor-pointer"
                      >
                        <Square className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="truncate">Langkah Seterusnya: {nextIncompleteStep.title}</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                    <button
                      type="button"
                      onClick={() => handleLaunchSetiausahaForProgram(program, 'MEMO')}
                      className="flex-1 py-1.5 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold transition cursor-pointer text-center"
                    >
                      📩 Memo
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLaunchSetiausahaForProgram(program, 'OPR')}
                      className="flex-1 py-1.5 px-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-bold transition cursor-pointer text-center"
                    >
                      📸 Isi Smart OPR
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= VIEW MODE SWITCHER & FILTER BAR ================= */}
      <div className="print:hidden bg-slate-900 border border-slate-800 rounded-3xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Sub-View Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveSubView('PDCA_CARDS')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeSubView === 'PDCA_CARDS'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>Kad Kawalan PDCA &amp; Checklist ({displayedPrograms.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubView('PINTAS_OPPM')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeSubView === 'PINTAS_OPPM'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Matriks PInTaS &amp; Gantt OPPM (1–12 Bulan)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubView('SOP_LIBRARY')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeSubView === 'SOP_LIBRARY'
                ? 'bg-teal-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Pustaka 8 SOP Standard Sekolah ({allSopTemplates.length})</span>
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Scope Filter */}
          <div className="inline-flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setScopeFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                scopeFilter === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Semua Program
            </button>
            <button
              type="button"
              onClick={() => setScopeFilter('MY_PROGRAMS')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                scopeFilter === 'MY_PROGRAMS'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Program Saya
            </button>
          </div>

          {/* Domain Filter */}
          <select
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value as any)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-200 cursor-pointer"
          >
            <option value="ALL">Semua 5 Bidang Sekolah</option>
            {isGPK && <option value="MY_DOMAIN">Bidang Kawalan GPK Saya</option>}
            <option value="PENTADBIRAN">1. Pentadbiran &amp; Pengurusan</option>
            <option value="KURIKULUM">2. Kurikulum &amp; Akademik</option>
            <option value="HEM">3. Hal Ehwal Murid (HEM)</option>
            <option value="KOKURIKULUM">4. Kokurikulum &amp; Sukan</option>
            <option value="PIBK_3K">5. 3K &amp; PIBK / Komuniti</option>
          </select>

          {/* PDCA Stage Filter */}
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value as any)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-200 cursor-pointer"
          >
            <option value="ALL">Semua Fasa PDCA</option>
            <option value="PLAN">Fasa 1: Perancangan (Plan)</option>
            <option value="DO">Fasa 2: Pelaksanaan (Do)</option>
            <option value="CHECK">Fasa 3: Menunggu Semakan (Check)</option>
            <option value="ACT">Fasa 4: Selesai &amp; SOP (Act)</option>
            <option value="OVERDUE_SLA">🚨 Amaran Merah SLA (&gt;5 Hari)</option>
          </select>

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari program / PIC / SKAS..."
              className="pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 w-48 sm:w-56"
            />
          </div>
        </div>
      </div>

      {/* ================= SUB-VIEW 1: PDCA CARDS & CHECKLIST ================= */}
      {activeSubView === 'PDCA_CARDS' && (
        <div className="print:hidden space-y-4">
          {loading ? (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-xs text-slate-400">
              Memuatkan data Kawalan Program &amp; PDCA...
            </div>
          ) : displayedPrograms.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center space-y-4">
              <Target className="w-12 h-12 text-indigo-400 mx-auto opacity-80" />
              <div>
                <h3 className="text-base font-bold text-white">
                  Tiada Program Ditemui Bagi Penapis Ini
                </h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                  Klik <strong>"+ Program Pantas (1-Minit SOP)"</strong> untuk memilih daripada 8 SOP
                  Standard Sekolah atau <strong>"+ Program Strategik (PInTaS/OPPM)"</strong> untuk
                  mendaftar program baharu.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => handleOpenNewModal('PANTAS')}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition cursor-pointer"
                >
                  ⚡ + Daftar Program Pantas (SOP 1-Minit)
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenNewModal('STRATEGIK')}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer"
                >
                  🎯 + Daftar Program Strategik (PInTaS &amp; OPPM)
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {displayedPrograms.map(({ program, sla }) => {
                const domMeta = PROGRAM_DOMAIN_META[program.domain] || PROGRAM_DOMAIN_META.KURIKULUM;
                const stageMeta = PDCA_STAGE_META[program.pdcaStage] || PDCA_STAGE_META.PLAN;
                const doneCount = (program.checklist || []).filter((c) => c.done).length;
                const totalSteps = (program.checklist || []).length || 1;
                const progressPct = Math.round((doneCount / totalSteps) * 100);

                return (
                  <div
                    key={program.id}
                    className={`rounded-3xl p-6 border transition-all shadow-xl flex flex-col justify-between space-y-4 ${
                      sla.isOverdueSLA
                        ? 'bg-slate-900/95 border-2 border-rose-500/70 ring-1 ring-rose-500/30'
                        : program.pdcaStage === 'CHECK'
                        ? 'bg-slate-900/95 border-amber-500/50'
                        : program.pdcaStage === 'ACT'
                        ? 'bg-slate-900/90 border-emerald-500/40'
                        : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Card Header */}
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {sla.isOverdueSLA && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-500 text-white shadow animate-pulse">
                              🚨 SLA TERTUNGGAK ({sla.workingDaysElapsed} HARI)
                            </span>
                          )}
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${domMeta.badgeBg} ${domMeta.badgeText} ${domMeta.badgeBorder}`}
                          >
                            {domMeta.shortLabel}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-700/60">
                            {program.standardGroup} • {program.subStandardCode}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold ${
                              program.mode === 'STRATEGIK'
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                            }`}
                          >
                            {program.mode === 'STRATEGIK' ? 'Mod Strategik (PInTaS)' : 'Mod Pantas (SOP)'}
                          </span>
                          {program.isSchoolSopStandard && (
                            <span className="px-2 py-0.5 rounded-full text-[9.5px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                              SOP Sekolah
                            </span>
                          )}
                        </div>

                        {/* Stage Badge */}
                        <span
                          className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border ${stageMeta.bgClass} ${stageMeta.textClass} ${stageMeta.borderClass}`}
                        >
                          {stageMeta.shortLabel}
                        </span>
                      </div>

                      {/* Title & SKAS Sub-Standard Title */}
                      <div>
                        <h3 className="text-base font-black text-white leading-snug">
                          {program.title}
                        </h3>
                        <p className="text-[11px] text-indigo-300/90 font-medium mt-0.5">
                          SKAS {program.subStandardCode}: {program.subStandardTitle}
                        </p>
                      </div>

                      {/* Metadata: Date, PIC, AJK & KPI */}
                      <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5 space-y-2 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-slate-300">
                            <Calendar className="w-3.5 h-3.5 text-blue-400" />
                            <span className="font-mono font-bold">
                              {program.tarikhMula}
                              {program.tarikhTamat && program.tarikhTamat !== program.tarikhMula
                                ? ` → ${program.tarikhTamat}`
                                : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-200">
                            <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                            <span>
                              PIC: <strong className="text-white">{program.picName}</strong>
                            </span>
                          </div>
                        </div>

                        {program.ajkMembers && program.ajkMembers.length > 0 && (
                          <div className="text-[11px] text-slate-400">
                            AJK: {program.ajkMembers.map((a) => a.teacherName).join(', ')}
                          </div>
                        )}

                        <div className="pt-1.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                          <span className="text-slate-300">
                            <strong className="text-teal-300">Sasaran KPI:</strong>{' '}
                            {program.pintas?.kpi || '-'}
                          </span>
                          {(program.pintas?.tov || program.pintas?.etr) && (
                            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800">
                              TOV: {program.pintas?.tov || '-'} &rarr; ETR: {program.pintas?.etr || '-'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 4-Step PDCA Visual Stepper */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                          <span>Kemajuan Senarai Semak PDCA ({doneCount}/{totalSteps})</span>
                          <span className="text-emerald-400">{progressPct}%</span>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {(['PLAN', 'DO', 'CHECK', 'ACT'] as PdcaStage[]).map((st) => {
                            const activeNum = PDCA_STAGE_META[program.pdcaStage].stepNum;
                            const thisNum = PDCA_STAGE_META[st].stepNum;
                            const isReached = activeNum >= thisNum;
                            return (
                              <div
                                key={st}
                                className={`py-1 px-2 rounded-lg text-center text-[10px] font-black uppercase border ${
                                  isReached
                                    ? 'bg-blue-600/25 border-blue-500/50 text-blue-200'
                                    : 'bg-slate-950 border-slate-800 text-slate-500'
                                }`}
                              >
                                {st}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Interactive Checklist Items */}
                      <div className="space-y-1.5 pt-1">
                        {(program.checklist || []).map((item) => (
                          <div
                            key={item.id}
                            onClick={() => handleToggleChecklistStep(program, item.id)}
                            className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 cursor-pointer transition ${
                              item.done
                                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                                : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 text-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {item.done ? (
                                <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-500 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <span
                                  className={`font-semibold block truncate ${
                                    item.done ? 'line-through text-emerald-300/80' : 'text-white'
                                  }`}
                                >
                                  {item.title}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {item.groupLabel} · PIC: {item.picName || program.picName}
                                </span>
                              </div>
                            </div>
                            {item.done && (
                              <span className="text-[9.5px] font-mono text-emerald-400 shrink-0">
                                ✔ Siap
                              </span>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Google Drive Evidens Link & GPK/GB Review Remarks */}
                      {(program.driveFileUrl || program.driveFolderPath || program.gbUlasan || program.gpkUlasan) && (
                        <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3 space-y-1.5 text-[11px]">
                          {(program.driveFileUrl || program.driveFolderUrl) && (
                            <div className="flex items-center justify-between">
                              <span className="text-teal-300 font-bold flex items-center gap-1.5">
                                <FolderCheck className="w-3.5 h-3.5" />
                                Evidens Google Drive ({program.subStandardCode})
                              </span>
                              <a
                                href={program.driveFileUrl || program.driveFolderUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 underline font-bold flex items-center gap-1"
                              >
                                <span>Buka Fail Drive</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          )}
                          {program.driveFolderPath && (
                            <div className="text-[10px] font-mono text-slate-400 truncate">
                              📁 {program.driveFolderPath}
                            </div>
                          )}
                          {program.gpkUlasan && (
                            <div className="text-amber-200/90 pt-1 border-t border-slate-800/80">
                              <strong>Semakan GPK ({program.gpkVerifiedBy || 'GPK'}):</strong>{' '}
                              {program.gpkUlasan}
                            </div>
                          )}
                          {program.gbUlasan && (
                            <div className="text-emerald-200/90 pt-1 border-t border-slate-800/80">
                              <strong>Pengesahan GB ({program.gbApprovedBy || 'Guru Besar'}):</strong>{' '}
                              {program.gbUlasan}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Card Footer: Direct Execution Linkage Buttons (Memo, Minit, Smart OPR, Check & Act) */}
                    <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleLaunchSetiausahaForProgram(program, 'MEMO')}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                          title="Jana Memo Panggilan Mesyuarat (Auto-warisi Nama, Tarikh & SKAS)"
                        >
                          <Mail className="w-3.5 h-3.5 text-blue-400" />
                          <span>Jana Memo</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleLaunchSetiausahaForProgram(program, 'MINIT')}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                          title="Jana Minit Mesyuarat PKPA"
                        >
                          <FileText className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Jana Minit</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleLaunchSetiausahaForProgram(program, 'OPR')}
                          className="px-3 py-1.5 rounded-xl bg-teal-600/20 hover:bg-teal-600 text-teal-300 hover:text-white border border-teal-500/40 text-[11px] font-black transition flex items-center gap-1 cursor-pointer"
                          title="Jana Smart OPR & Arkib ke Google Drive (Auto-kemaskini status ke Menunggu Semakan)"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>{program.oprSubmitted ? 'Kemaskini Smart OPR' : 'Isi Smart OPR'}</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {isAdminOrGpk && (
                          <button
                            type="button"
                            onClick={() => handleOpenReviewModal(program)}
                            className={`px-3 py-1.5 rounded-xl text-[11px] font-black transition cursor-pointer ${
                              program.pdcaStage === 'CHECK'
                                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20'
                                : 'bg-indigo-600/25 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40'
                            }`}
                          >
                            {isGB ? '✅ Semak GB & SOP (Act)' : '✅ Semakan GPK (Check)'}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(program)}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold transition cursor-pointer"
                        >
                          Edit
                        </button>

                        {isAdminOrGpk && (
                          <button
                            type="button"
                            onClick={() => handleDeleteProgram(program)}
                            className="p-1.5 rounded-xl bg-rose-950/50 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-800/50 transition cursor-pointer"
                            title="Padam Program"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================= SUB-VIEW 2: MATRIKS PINTAS & OPPM GANTT (1-12 BULAN) ================= */}
      {activeSubView === 'PINTAS_OPPM' && (
        <div className="print:hidden space-y-6">
          {/* OPPM 1-12 Month Gantt Matrix */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-black text-white uppercase tracking-wide">
                  One Page Project Manager (OPPM) — Carta Gantt Pelaksanaan 1–12 Bulan (Sesi {academicYear})
                </h3>
                <p className="text-xs text-slate-400">
                  Pemetaan garis masa bulanan (Januari – Disember), Penyelaras (PIC), SKAS Sub-Standard dan status PDCA.
                </p>
              </div>
              <button
                type="button"
                onClick={handlePrintPintasOppmA4}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer self-start"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak PInTaS &amp; OPPM (A4 Landscape)</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse border border-slate-800">
                <thead>
                  <tr className="bg-slate-950 text-slate-300 uppercase font-mono text-[10px]">
                    <th className="border border-slate-800 py-2.5 px-2.5 text-center w-10">Bil</th>
                    <th className="border border-slate-800 py-2.5 px-3 min-w-[200px]">
                      Program / Inisiatif
                    </th>
                    <th className="border border-slate-800 py-2.5 px-2.5 w-28">Bidang</th>
                    <th className="border border-slate-800 py-2.5 px-2.5 w-24">SKAS</th>
                    <th className="border border-slate-800 py-2.5 px-3 w-36">Penyelaras (PIC)</th>
                    {MALAY_MONTH_SHORT.map((m) => (
                      <th
                        key={m}
                        className="border border-slate-800 py-2.5 px-1.5 text-center w-9"
                      >
                        {m}
                      </th>
                    ))}
                    <th className="border border-slate-800 py-2.5 px-2.5 text-center w-28">
                      Status PDCA
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {displayedPrograms.map(({ program }, idx) => {
                    const mSet = new Set(program.oppmMonths || []);
                    const stMeta = PDCA_STAGE_META[program.pdcaStage];
                    return (
                      <tr key={`oppm_${program.id}`} className="hover:bg-slate-800/40">
                        <td className="border border-slate-800 py-2.5 px-2.5 text-center font-mono text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="border border-slate-800 py-2.5 px-3 font-bold text-white">
                          {program.title}
                        </td>
                        <td className="border border-slate-800 py-2.5 px-2.5 text-slate-300 text-[11px]">
                          {PROGRAM_DOMAIN_META[program.domain]?.shortLabel}
                        </td>
                        <td className="border border-slate-800 py-2.5 px-2.5 font-mono text-indigo-300 text-[11px]">
                          {program.subStandardCode}
                        </td>
                        <td className="border border-slate-800 py-2.5 px-3 text-slate-200 font-semibold text-[11px]">
                          {program.picName}
                        </td>
                        {MALAY_MONTH_SHORT.map((_, mIdx) => {
                          const active = mSet.has(mIdx + 1);
                          return (
                            <td
                              key={mIdx}
                              className={`border border-slate-800 py-2 px-1 text-center font-black ${
                                active
                                  ? program.pdcaStage === 'ACT'
                                    ? 'bg-emerald-500/30 text-emerald-300'
                                    : 'bg-blue-500/30 text-blue-300'
                                  : ''
                              }`}
                            >
                              {active ? '●' : ''}
                            </td>
                          );
                        })}
                        <td className="border border-slate-800 py-2.5 px-2.5 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[9.5px] font-bold border ${stMeta.bgClass} ${stMeta.textClass} ${stMeta.borderClass}`}
                          >
                            {stMeta.code}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* PInTaS Strategic Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div>
              <h3 className="text-base font-black text-white uppercase tracking-wide">
                Pelan Intervensi Lima Langkah (PInTaS) — Matriks Strategik Sekolah
              </h3>
              <p className="text-xs text-slate-400">
                Rangkaian penuh Isu Strategik, Punca, TOV &rarr; ETR, KPI, Strategi Pelaksanaan, SKAS &amp; Evidens OPR.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse border border-slate-800">
                <thead>
                  <tr className="bg-slate-950 text-slate-300 uppercase font-mono text-[10px]">
                    <th className="border border-slate-800 py-2.5 px-2 text-center w-8">Bil</th>
                    <th className="border border-slate-800 py-2.5 px-3">1. Bidang Fokus &amp; Isu</th>
                    <th className="border border-slate-800 py-2.5 px-3">2. Punca Isu</th>
                    <th className="border border-slate-800 py-2.5 px-3">
                      3. Kriteria Kejayaan (TOV &rarr; ETR &amp; KPI)
                    </th>
                    <th className="border border-slate-800 py-2.5 px-3">
                      4. Inisiatif / Program &amp; SKAS
                    </th>
                    <th className="border border-slate-800 py-2.5 px-3">
                      5. PIC, Tempoh, Kos &amp; Status Evidens
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {displayedPrograms.map(({ program }, idx) => (
                    <tr key={`pintas_${program.id}`} className="hover:bg-slate-800/40 align-top">
                      <td className="border border-slate-800 py-3 px-2 text-center font-mono text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="border border-slate-800 py-3 px-3 space-y-1">
                        <span className="text-[10px] font-black uppercase text-indigo-300 block">
                          {program.pintas?.bidangFokus || PROGRAM_DOMAIN_META[program.domain]?.label}
                        </span>
                        <p className="text-slate-200 text-[11px]">{program.pintas?.isuStrategik}</p>
                      </td>
                      <td className="border border-slate-800 py-3 px-3 text-slate-300 text-[11px]">
                        {program.pintas?.puncaIsu}
                      </td>
                      <td className="border border-slate-800 py-3 px-3 space-y-1 text-[11px]">
                        <div className="font-bold text-teal-300">{program.pintas?.kpi}</div>
                        <div className="font-mono text-[10px] text-slate-400">
                          TOV: <strong className="text-white">{program.pintas?.tov || '-'}</strong> | ETR:{' '}
                          <strong className="text-emerald-300">{program.pintas?.etr || '-'}</strong>
                        </div>
                      </td>
                      <td className="border border-slate-800 py-3 px-3 space-y-1">
                        <div className="font-black text-white">{program.title}</div>
                        <div className="text-[11px] text-slate-300">
                          {program.pintas?.strategiInisiatif}
                        </div>
                        <span className="inline-block px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700/60 font-mono text-[10px]">
                          {program.standardGroup} • {program.subStandardCode}
                        </span>
                      </td>
                      <td className="border border-slate-800 py-3 px-3 space-y-1 text-[11px]">
                        <div className="font-bold text-white">PIC: {program.picName}</div>
                        <div className="font-mono text-[10px] text-slate-400">
                          {program.tarikhMula} ({program.pintas?.anggaranKos || 'RM 0'})
                        </div>
                        <div className="text-[10px] font-bold text-emerald-400">
                          {PDCA_STAGE_META[program.pdcaStage]?.shortLabel} ·{' '}
                          {program.oprSubmitted ? '✔ Smart OPR Siap' : '⏳ Belum OPR'}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= SUB-VIEW 3: PUSTAKA 8 SOP STANDARD SEKOLAH (ACT) ================= */}
      {activeSubView === 'SOP_LIBRARY' && (
        <div className="print:hidden space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
            <h3 className="text-base font-black text-white">
              Pustaka 8 SOP Standard Sekolah &amp; Amalan Terbaik (PDCA Fasa Act)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Pilih mana-mana templat SOP di bawah untuk melancarkan program baharu dalam masa 1 minit
              (automatik mengisi KPI lalai, cabang SKAS dan 4 langkah senarai semak). Guru Besar juga
              boleh menaik taraf program cemerlang ke dalam pustaka ini melalui butang{' '}
              <strong>"Jadikan / Kemaskini SOP Sekolah (Act)"</strong>.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
              {allSopTemplates.map((sop) => {
                const domMeta = PROGRAM_DOMAIN_META[sop.domain];
                return (
                  <div
                    key={sop.id}
                    className="bg-slate-950 border border-slate-800 hover:border-teal-500/50 rounded-2xl p-4 flex flex-col justify-between space-y-4 transition shadow-lg"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-black bg-teal-500/20 text-teal-300 border border-teal-500/30">
                          {sop.code}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[9.5px] font-bold border ${domMeta.badgeBg} ${domMeta.badgeText} ${domMeta.badgeBorder}`}
                        >
                          {domMeta.shortLabel}
                        </span>
                      </div>
                      <h4 className="text-xs font-black text-white leading-snug">{sop.titleMs}</h4>
                      <p className="text-[11px] text-slate-400">{sop.titleZh}</p>
                      <div className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[10px] font-mono text-indigo-300">
                        SKAS {sop.standardGroup} • {sop.subStandardCode}
                      </div>
                      <p className="text-[10px] text-slate-300 line-clamp-2">
                        <strong className="text-teal-300">KPI Lalai:</strong> {sop.defaultKpi}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenNewModal('PANTAS', sop)}
                      className="w-full py-2 px-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>Guna Templat SOP Ini</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ================= OFFICIAL A4 LANDSCAPE PINTAS & OPPM PRINT TEMPLATE ================= */}
      <div
        id="kawalan-program-pintas-oppm-print-area"
        className="hidden print:block bg-white text-black p-6 font-sans"
      >
        {/* Official School Header */}
        <div className="flex items-center justify-between border-b-2 border-black pb-3 mb-4">
          <div className="flex items-center gap-4">
            <SchoolLogo
              className="w-16 h-16"
              src={activeSchoolLogo}
              schoolCode={activeSchoolCode}
            />
            <div>
              <h1 className="text-lg font-black uppercase tracking-wide">
                {activeSchoolName} ({activeSchoolCode})
              </h1>
              <h2 className="text-sm font-bold uppercase">
                PELAN INTERVENSI LIMA LANGKAH (PInTaS) &amp; ONE PAGE PROJECT MANAGER (OPPM)
              </h2>
              <p className="text-xs font-medium">
                SISTEM KAWALAN PROGRAM &amp; PDCA BERSEPADU · SKPM KUALITI@SEKOLAH SESI AKADEMIK{' '}
                {academicYear}
              </p>
            </div>
          </div>
          <div className="text-right text-[11px] font-mono">
            <div>Tarikh Cetakan: {new Date().toLocaleDateString('ms-MY')}</div>
            <div>Jumlah Program: {displayedPrograms.length}</div>
            <div>Kadar Patuh SLA: {radarMetrics.onTimeCompletionRate}%</div>
          </div>
        </div>

        {/* Section 1: PInTaS Matrix Table */}
        <h3 className="text-xs font-black uppercase mb-1.5">
          BAHAGIAN A: MATRIKS PELAN INTERVENSI LIMA LANGKAH (PInTaS) &amp; PENJAJARAN SKAS
        </h3>
        <table className="w-full border-collapse border border-black text-[10px] mb-5">
          <thead>
            <tr className="bg-slate-100 font-bold text-center">
              <th className="border border-black py-1 px-1.5 w-7">BIL</th>
              <th className="border border-black py-1 px-2">1. BIDANG FOKUS &amp; ISU STRATEGIK</th>
              <th className="border border-black py-1 px-2">2. PUNCA ISU</th>
              <th className="border border-black py-1 px-2">
                3. KRITERIA KEJAYAAN (KPI / TOV / ETR)
              </th>
              <th className="border border-black py-1 px-2">
                4. INISIATIF / PROGRAM &amp; SKAS SUB-STANDARD
              </th>
              <th className="border border-black py-1 px-2 w-32">
                5. TANGGUNGJAWAB (PIC) &amp; TEMPOH
              </th>
              <th className="border border-black py-1 px-2 w-28">
                STATUS PDCA &amp; EVIDENS OPR
              </th>
            </tr>
          </thead>
          <tbody>
            {displayedPrograms.map(({ program }, idx) => (
              <tr key={`pr_pintas_${program.id}`} className="align-top">
                <td className="border border-black py-1.5 px-1.5 text-center font-bold">
                  {idx + 1}
                </td>
                <td className="border border-black py-1.5 px-2">
                  <div className="font-bold uppercase">
                    [{PROGRAM_DOMAIN_META[program.domain]?.shortLabel}]{' '}
                    {program.pintas?.bidangFokus}
                  </div>
                  <div>{program.pintas?.isuStrategik}</div>
                </td>
                <td className="border border-black py-1.5 px-2">{program.pintas?.puncaIsu}</td>
                <td className="border border-black py-1.5 px-2">
                  <div className="font-semibold">{program.pintas?.kpi}</div>
                  <div className="mt-0.5">
                    TOV: <strong>{program.pintas?.tov || '-'}</strong> &rarr; ETR:{' '}
                    <strong>{program.pintas?.etr || '-'}</strong>
                  </div>
                </td>
                <td className="border border-black py-1.5 px-2">
                  <div className="font-bold uppercase">{program.title}</div>
                  <div>{program.pintas?.strategiInisiatif}</div>
                  <div className="font-mono font-bold mt-0.5">
                    SKAS: {program.standardGroup} ({program.subStandardCode} -{' '}
                    {program.subStandardTitle})
                  </div>
                </td>
                <td className="border border-black py-1.5 px-2">
                  <div className="font-bold">{program.picName}</div>
                  <div>Tarikh: {program.tarikhMula}</div>
                  <div>Kos: {program.pintas?.anggaranKos || 'RM 0.00'}</div>
                </td>
                <td className="border border-black py-1.5 px-2 text-center">
                  <div className="font-bold uppercase">
                    {PDCA_STAGE_META[program.pdcaStage]?.shortLabel}
                  </div>
                  <div>{program.oprSubmitted ? '✔ Smart OPR Lengkap' : 'Belum OPR'}</div>
                  {program.gbApproved && <div className="font-bold">✔ Disahkan GB</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Section 2: OPPM 1-12 Month Gantt Table */}
        <h3 className="text-xs font-black uppercase mb-1.5">
          BAHAGIAN B: ONE PAGE PROJECT MANAGER (OPPM) — JADUAL PELAKSANAAN BULANAN (JANUARI – DISEMBER {academicYear})
        </h3>
        <table className="w-full border-collapse border border-black text-[10px] mb-6">
          <thead>
            <tr className="bg-slate-100 font-bold text-center">
              <th className="border border-black py-1 px-1.5 w-7">BIL</th>
              <th className="border border-black py-1 px-2 text-left">NAMA PROGRAM / INISIATIF</th>
              <th className="border border-black py-1 px-1.5 w-20">BIDANG</th>
              <th className="border border-black py-1 px-1.5 w-16">SKAS</th>
              <th className="border border-black py-1 px-2 w-32 text-left">PENYELARAS (PIC)</th>
              {MALAY_MONTH_SHORT.map((m) => (
                <th key={m} className="border border-black py-1 px-1 w-7 text-center">
                  {m.toUpperCase()}
                </th>
              ))}
              <th className="border border-black py-1 px-2 w-24">STATUS PDCA</th>
            </tr>
          </thead>
          <tbody>
            {displayedPrograms.map(({ program }, idx) => {
              const mSet = new Set(program.oppmMonths || []);
              return (
                <tr key={`pr_oppm_${program.id}`}>
                  <td className="border border-black py-1 px-1.5 text-center">{idx + 1}</td>
                  <td className="border border-black py-1 px-2 font-bold">{program.title}</td>
                  <td className="border border-black py-1 px-1.5 text-center">
                    {PROGRAM_DOMAIN_META[program.domain]?.shortLabel}
                  </td>
                  <td className="border border-black py-1 px-1.5 text-center font-mono">
                    {program.subStandardCode}
                  </td>
                  <td className="border border-black py-1 px-2">{program.picName}</td>
                  {MALAY_MONTH_SHORT.map((_, mIdx) => (
                    <td
                      key={mIdx}
                      className="border border-black py-1 px-1 text-center font-black"
                    >
                      {mSet.has(mIdx + 1) ? '●' : ''}
                    </td>
                  ))}
                  <td className="border border-black py-1 px-2 text-center font-bold">
                    {PDCA_STAGE_META[program.pdcaStage]?.code}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Official 3-Column Sign-Off Block */}
        <div className="grid grid-cols-3 gap-8 pt-6 text-xs">
          <div>
            <p className="font-bold">Disediakan Oleh:</p>
            <div className="h-14 border-b border-black w-56"></div>
            <p className="font-bold mt-1 uppercase">({currentUser.name || 'PENYELARAS PROGRAM'})</p>
            <p className="text-[10px]">Penyelaras Program / Setiausaha</p>
            <p className="text-[10px]">{activeSchoolName}</p>
          </div>
          <div>
            <p className="font-bold">Disemak Oleh:</p>
            <div className="h-14 border-b border-black w-56"></div>
            <p className="font-bold mt-1 uppercase">(PENOLONG KANAN PENTADBIRAN / HEM / KK)</p>
            <p className="text-[10px]">Barisan Kepimpinan Penolong Kanan</p>
            <p className="text-[10px]">{activeSchoolName}</p>
          </div>
          <div>
            <p className="font-bold">Disahkan Oleh:</p>
            <div className="h-14 border-b border-black w-56"></div>
            <p className="font-bold mt-1 uppercase">(GURU BESAR)</p>
            <p className="text-[10px]">
              Guru Besar {activeSchoolName} ({activeSchoolCode})
            </p>
          </div>
        </div>
      </div>

      {/* ================= MODAL 1: CREATE / EDIT PROGRAM (DUAL-MODE) ================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 print:hidden">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full p-6 space-y-5 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-black text-white">
                  {editingProgramId
                    ? 'Kemaskini Program & Kitaran PDCA'
                    : 'Daftar Program Baharu — Kawalan PDCA Bersepadu'}
                </h3>
                <p className="text-xs text-slate-400">
                  Pilih antara <strong>Mod Pantas (1-Minit SOP)</strong> untuk aktiviti rutin atau{' '}
                  <strong>Mod Strategik (PInTaS &amp; OPPM)</strong> untuk projek utama sekolah.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Dual-Tier Mode Switcher */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950 p-2 rounded-2xl border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setFormMode('PANTAS');
                  if (!editingProgramId) {
                    handleApplySopTemplate(
                      allSopTemplates.find((s) => s.id === selectedSopId) || allSopTemplates[0]
                    );
                  }
                }}
                className={`p-3 rounded-xl text-left transition cursor-pointer border ${
                  formMode === 'PANTAS'
                    ? 'bg-blue-600/25 border-blue-500 text-white shadow-lg'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 font-black text-xs uppercase">
                  <Zap className="w-4 h-4 text-blue-400" />
                  <span>Mod Pantas / Program Rutin (1-Minit SOP)</span>
                </div>
                <p className="text-[11px] text-slate-300 mt-1">
                  Pilih daripada 8 Templat SOP Sekolah: automatik isi KPI, cabang SKAS &amp; 4
                  langkah Checklist ringkas.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setFormMode('STRATEGIK');
                  if (!editingProgramId && formChecklist.length <= 4) {
                    const picName =
                      staffOptions.find((s) => s.id === formPicId)?.name ||
                      currentUser.name ||
                      'Penyelaras';
                    setFormChecklist(buildStrategicMultiGroupChecklist(picName, formTarikhMula));
                  }
                }}
                className={`p-3 rounded-xl text-left transition cursor-pointer border ${
                  formMode === 'STRATEGIK'
                    ? 'bg-indigo-600/25 border-indigo-500 text-white shadow-lg'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 font-black text-xs uppercase">
                  <Target className="w-4 h-4 text-indigo-400" />
                  <span>Mod Strategik / Program Besar (PInTaS &amp; OPPM)</span>
                </div>
                <p className="text-[11px] text-slate-300 mt-1">
                  Lengkap dengan analisis PInTaS (Isu, Punca, TOV, ETR, KPI), Carta Gantt OPPM 1–12
                  Bulan &amp; AJK Checklist.
                </p>
              </button>
            </div>

            <form onSubmit={handleSaveProgram} className="space-y-5 text-xs">
              {/* If Mod Pantas: 1-Click 8 SOP Template Picker */}
              {formMode === 'PANTAS' && (
                <div className="bg-blue-950/20 border border-blue-500/30 rounded-2xl p-4 space-y-2.5">
                  <label className="block font-black text-blue-300 uppercase tracking-wider">
                    ⚡ Pilih Templat daripada 8 SOP Standard Sekolah (Auto-Isi KPI, SKAS &amp; 4-Langkah Checklist):
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {allSopTemplates.map((sop) => {
                      const active = selectedSopId === sop.id;
                      return (
                        <button
                          key={sop.id}
                          type="button"
                          onClick={() => handleApplySopTemplate(sop)}
                          className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                            active
                              ? 'bg-blue-600/30 border-blue-400 text-white shadow'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] font-mono font-bold text-blue-300">
                            <span>{sop.code}</span>
                            <span>{sop.subStandardCode}</span>
                          </div>
                          <div className="font-bold text-[11px] text-white mt-0.5 line-clamp-1">
                            {sop.titleMs}
                          </div>
                          <div className="text-[10px] text-slate-400 line-clamp-1">
                            {sop.titleZh}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Section 1: Basic Info & Domain */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="block font-bold text-slate-300 mb-1">
                    Nama Program / Aktiviti Sekolah *
                  </label>
                  <input
                    type="text"
                    required
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="cth: BENGKEL TEKNIK MENJAWAB & INTERVENSI PBD / UASA..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-bold uppercase"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">
                    Bidang / Unit Kawalan *
                  </label>
                  <select
                    value={formDomain}
                    onChange={(e) => setFormDomain(e.target.value as ProgramDomain)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-bold cursor-pointer"
                  >
                    <option value="PENTADBIRAN">1. Pentadbiran &amp; Organisasi</option>
                    <option value="KURIKULUM">2. Kurikulum &amp; Akademik</option>
                    <option value="HEM">3. Hal Ehwal Murid (HEM)</option>
                    <option value="KOKURIKULUM">4. Kokurikulum &amp; Sukan</option>
                    <option value="PIBK_3K">5. 3K &amp; PIBK / Komuniti</option>
                  </select>
                </div>
              </div>

              {/* Dates, Time, Venue, Target */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">
                    Tarikh Mula Program *
                  </label>
                  <input
                    type="date"
                    required
                    value={formTarikhMula}
                    onChange={(e) => {
                      setFormTarikhMula(e.target.value);
                      if (!formTarikhTamat || formTarikhTamat < e.target.value) {
                        setFormTarikhTamat(e.target.value);
                      }
                      const mo = parseInt(e.target.value.slice(5, 7), 10);
                      if (mo >= 1 && mo <= 12 && !formOppmMonths.includes(mo)) {
                        setFormOppmMonths((prev) => [...prev, mo]);
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono [color-scheme:dark]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">
                    Tarikh Tamat (Penentu SLA 5 Hari) *
                  </label>
                  <input
                    type="date"
                    required
                    value={formTarikhTamat}
                    min={formTarikhMula}
                    onChange={(e) => setFormTarikhTamat(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono [color-scheme:dark]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Masa</label>
                  <input
                    type="text"
                    value={formMasa}
                    onChange={(e) => setFormMasa(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Tempat / Lokasi</label>
                  <input
                    type="text"
                    value={formTempat}
                    onChange={(e) => setFormTempat(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              {/* Mandatory SKAS Standard & Sub-Standard Binding (from skasStandards.ts) */}
              <div className="bg-indigo-950/30 border border-indigo-500/40 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-black text-indigo-300 uppercase tracking-wider">
                    📌 Penjajaran Wajib SKPM Kualiti@Sekolah (SKAS Standard 1 – Standard 5):
                  </span>
                  <span className="text-[10px] font-mono text-indigo-300">
                    Auto-Folder Google Drive: {activeFormSkasGroup.standardFolderName} /{' '}
                    {activeFormSubStandard?.subStandardFolderName}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">
                      Standard Induk SKAS *
                    </label>
                    <select
                      value={formStandardGroup}
                      onChange={(e) => {
                        const grpKey = e.target.value as SkasStandardGroupKey;
                        setFormStandardGroup(grpKey);
                        const grp = getSkasGroup(grpKey);
                        setFormSubStandardCode(grp.defaultSubStandardCode);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold cursor-pointer"
                    >
                      {SKAS_STANDARDS_DICTIONARY.map((g) => (
                        <option key={g.standardGroup} value={g.standardGroup}>
                          {g.dropdownGroupLabel}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-300 mb-1">
                      Sub-Standard SKAS *
                    </label>
                    <select
                      value={formSubStandardCode}
                      onChange={(e) => setFormSubStandardCode(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold cursor-pointer"
                    >
                      {activeFormSkasGroup.subStandards.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.dropdownLabel}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Mandatory PIC & AJK Selection from PersonnelProfile */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-emerald-300 mb-1">
                      👤 Ketua Penyelaras Program (PIC — daripada Rekod Personel) *
                    </label>
                    <select
                      value={formPicId}
                      onChange={(e) => setFormPicId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold cursor-pointer"
                    >
                      {staffOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.position})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-300 mb-1">
                      Kumpulan Sasaran (Sasaran Murid / Guru)
                    </label>
                    <input
                      type="text"
                      value={formSasaran}
                      onChange={(e) => setFormSasaran(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1.5">
                    Tandakan Ahli Jawatankuasa (AJK Pelaksana — Muncul dalam Kad Tugasan Guru Berkenaan):
                  </label>
                  <div className="max-h-28 overflow-y-auto bg-slate-900 border border-slate-800 rounded-xl p-2.5 grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                    {staffOptions.map((s) => {
                      const checked = formSelectedAjkIds.includes(s.id);
                      return (
                        <label
                          key={`ajk_${s.id}`}
                          className="flex items-center gap-2 text-slate-200 cursor-pointer hover:bg-slate-800 p-1 rounded"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormSelectedAjkIds((prev) => [...prev, s.id]);
                              } else {
                                setFormSelectedAjkIds((prev) => prev.filter((id) => id !== s.id));
                              }
                            }}
                          />
                          <span className="truncate font-semibold text-[11px]">{s.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* KPI & Objektif (Shown in Both Modes; Expanded Full PInTaS in Mod Strategik) */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="font-black text-teal-300 uppercase tracking-wider">
                  🎯 Sasaran KPI, TOV &rarr; ETR &amp; Objektif Program
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-1">
                    <label className="block font-bold text-slate-300 mb-1">
                      TOV (Nilai Asal / Baseline)
                    </label>
                    <input
                      type="text"
                      value={formTov}
                      onChange={(e) => setFormTov(e.target.value)}
                      placeholder="cth: 82% Menguasai"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="block font-bold text-slate-300 mb-1">
                      ETR (Sasaran Akhir)
                    </label>
                    <input
                      type="text"
                      value={formEtr}
                      onChange={(e) => setFormEtr(e.target.value)}
                      placeholder="cth: 95% Menguasai"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="block font-bold text-slate-300 mb-1">
                      Anggaran Kos &amp; Sumber
                    </label>
                    <input
                      type="text"
                      value={formAnggaranKos}
                      onChange={(e) => setFormAnggaranKos(e.target.value)}
                      placeholder="cth: RM 150.00 (PCG / PIBG)"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">
                    Indikator Prestasi Utama (Sasaran KPI) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formKpi}
                    onChange={(e) => setFormKpi(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-semibold"
                  />
                </div>

                {formMode === 'STRATEGIK' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                    <div>
                      <label className="block font-bold text-indigo-300 mb-1">
                        PInTaS 1: Isu Strategik (Berdasarkan Data Dapatan Sekolah)
                      </label>
                      <textarea
                        rows={2}
                        value={formIsuStrategik}
                        onChange={(e) => setFormIsuStrategik(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-indigo-300 mb-1">
                        PInTaS 2: Punca Isu (Root Cause Analysis)
                      </label>
                      <textarea
                        rows={2}
                        value={formPuncaIsu}
                        onChange={(e) => setFormPuncaIsu(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-indigo-300 mb-1">
                        PInTaS 3: Strategi &amp; Inisiatif Pelaksanaan
                      </label>
                      <textarea
                        rows={2}
                        value={formStrategi}
                        onChange={(e) => setFormStrategi(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-indigo-300 mb-1">
                        PInTaS 4: Kriteria Kejayaan
                      </label>
                      <textarea
                        rows={2}
                        value={formKriteriaKejayaan}
                        onChange={(e) => setFormKriteriaKejayaan(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* OPPM 1-12 Months Gantt Selector */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2.5">
                <label className="block font-black text-indigo-300 uppercase tracking-wider">
                  📅 Jadual Bulanan OPPM (Tandakan Bulan Pelaksanaan 1–12):
                </label>
                <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                  {MALAY_MONTH_SHORT.map((mName, idx) => {
                    const mNum = idx + 1;
                    const active = formOppmMonths.includes(mNum);
                    return (
                      <button
                        key={mName}
                        type="button"
                        onClick={() => {
                          if (active) {
                            setFormOppmMonths((prev) =>
                              prev.length > 1 ? prev.filter((x) => x !== mNum) : prev
                            );
                          } else {
                            setFormOppmMonths((prev) => [...prev, mNum]);
                          }
                        }}
                        className={`py-2 rounded-xl font-bold text-xs border transition cursor-pointer ${
                          active
                            ? 'bg-indigo-600 border-indigo-400 text-white shadow'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {mName}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* PDCA Checklist Editor */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-black text-emerald-300 uppercase tracking-wider">
                    ✅ Senarai Semak Pelaksanaan PDCA ({formChecklist.length} Langkah):
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Langkah 3 (Smart OPR) akan ditanda siap secara automatik apabila OPR diarkib ke Google Drive
                  </span>
                </div>

                <div className="space-y-2">
                  {formChecklist.map((c, idx) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-indigo-300 shrink-0">
                          {c.groupLabel}
                        </span>
                        <input
                          type="text"
                          value={c.title}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormChecklist((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, title: val } : item))
                            );
                          }}
                          className="bg-transparent text-white font-semibold text-xs w-full focus:outline-none"
                        />
                      </div>
                      {c.stepKey === 'CUSTOM' && (
                        <button
                          type="button"
                          onClick={() =>
                            setFormChecklist((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-rose-400 hover:text-rose-300 p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add custom AJK checklist item */}
                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <input
                    type="text"
                    value={newChecklistGroup}
                    onChange={(e) => setNewChecklistGroup(e.target.value)}
                    placeholder="Kumpulan AJK (cth: AJK Logistik)"
                    className="sm:w-48 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-white text-xs"
                  />
                  <input
                    type="text"
                    value={newChecklistTitle}
                    onChange={(e) => setNewChecklistTitle(e.target.value)}
                    placeholder="Tambah tugasan AJK tambahan..."
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-white text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newChecklistTitle.trim()) return;
                      setFormChecklist((prev) => [
                        ...prev,
                        {
                          id: `custom_${Date.now()}`,
                          stepKey: 'CUSTOM',
                          groupLabel: newChecklistGroup.trim() || 'AJK Pelaksana',
                          title: newChecklistTitle.trim(),
                          done: false,
                        },
                      ]);
                      setNewChecklistTitle('');
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 font-bold text-xs cursor-pointer"
                  >
                    + Tambah Tugasan
                  </button>
                </div>
              </div>

              {/* Submit Footer */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black uppercase tracking-wider shadow-lg shadow-blue-600/30 cursor-pointer"
                >
                  {saving
                    ? 'Menyimpan...'
                    : editingProgramId
                    ? 'Simpan Perubahan Program'
                    : 'Daftar Program & Aktifkan Kawalan PDCA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 2: GPK / GURU BESAR CHECK & ACT REVIEW ================= */}
      {reviewModalProgram && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 print:hidden">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  {isGB
                    ? 'Fasa Check & Act — Pengesahan Akhir Guru Besar'
                    : 'Fasa Check — Semakan Awal Penolong Kanan (GPK)'}
                </span>
                <h3 className="text-base font-black text-white mt-1">
                  {reviewModalProgram.title}
                </h3>
                <p className="text-[11px] text-slate-400">
                  PIC: {reviewModalProgram.picName} · SKAS {reviewModalProgram.standardGroup} (
                  {reviewModalProgram.subStandardCode})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewModalProgram(null)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmReviewAndAct} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1.5">
                  Penilaian Pencapaian KPI ({reviewModalProgram.pintas?.kpi || 'Sasaran KPI'}):
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'CAPAI', label: '✔ Capai Sepenuhnya (100%)', cls: 'bg-emerald-600/30 border-emerald-400 text-emerald-200' },
                    { id: 'SEBAHAGIAN', label: '◑ Capai Sebahagian', cls: 'bg-amber-600/30 border-amber-400 text-amber-200' },
                    { id: 'TIDAK_CAPAI', label: '✖ Perlu Intervensi Susulan', cls: 'bg-rose-600/30 border-rose-400 text-rose-200' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setReviewKpiStatus(opt.id as any)}
                      className={`p-2.5 rounded-xl border font-bold text-center transition cursor-pointer ${
                        reviewKpiStatus === opt.id
                          ? opt.cls
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">
                  {isGB ? 'Ulasan & Pengesahan Rasmi Guru Besar *' : 'Ulasan Semakan Awal GPK *'}
                </label>
                <textarea
                  rows={3}
                  required
                  value={reviewUlasan}
                  onChange={(e) => setReviewUlasan(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">
                  Tindakan Susulan &amp; Penambahbaikan (Fasa Act)
                </label>
                <input
                  type="text"
                  value={reviewTindakanAct}
                  onChange={(e) => setReviewTindakanAct(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              {isGB && (
                <label className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/40 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reviewPromoteToSop}
                    onChange={(e) => setReviewPromoteToSop(e.target.checked)}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="font-black text-amber-300 block">
                      ⭐ Jadikan / Kemaskini sebagai SOP Standard Sekolah (Fasa Act)
                    </span>
                    <span className="text-[11px] text-amber-200/80">
                      Menyimpan struktur program, KPI dan senarai semak ini ke dalam Pustaka SOP
                      Sekolah supaya guru-guru boleh menggunakannya secara 1-klik pada masa hadapan.
                    </span>
                  </div>
                </label>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setReviewModalProgram(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-wider shadow-lg cursor-pointer"
                >
                  {saving
                    ? 'Menyimpan...'
                    : isGB
                    ? '✅ Sahkan Lulus (Act) & Tutup Kes'
                    : '✅ Simpan Semakan GPK'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default KawalanProgramView;
