/**
 * iSEPADU AI — Kawalan Program & PDCA Bersepadu (PInTaS · OPPM · PDCA · SKAS)
 *
 * Data Models, 8 Universal School SOP Templates, 5-Working-Day SLA Engine,
 * and Auto-Reconciliation Helper with AI Setiausaha / Smart OPR & Google Drive.
 */

import { SkasStandardGroupKey } from '../data/skasStandards';

export type ProgramMode = 'STRATEGIK' | 'PANTAS';

export type ProgramDomain =
  | 'PENTADBIRAN'
  | 'KURIKULUM'
  | 'HEM'
  | 'KOKURIKULUM'
  | 'PIBK_3K';

export type PdcaStage = 'PLAN' | 'DO' | 'CHECK' | 'ACT';

export type ChecklistStepKey = 'MEMO' | 'PELAKSANAAN' | 'OPR' | 'SEMAKAN' | 'CUSTOM';

export interface ProgramChecklistItem {
  id: string;
  stepKey: 'MEMO' | 'PELAKSANAAN' | 'OPR' | 'SEMAKAN' | 'CUSTOM';
  groupLabel: string; // e.g. 'Fasa 1: Perancangan', 'AJK Dokumentasi', etc.
  title: string;
  picName?: string;
  dueDate?: string;
  done: boolean;
  completedAt?: string;
   completedBy?: string;
  evidenceUrl?: string;
  linkedDocId?: string;
}

export interface OppmSubTask {
  id: string;
  title: string;
  picName: string;
  months: number[]; // 1..12
  status: 'BELUM_MULA' | 'SEDANG_BERJALAN' | 'SELESAI';
}

export interface PintasDetails {
  bidangFokus: string;
  isuStrategik: string;
  puncaIsu: string;
  tov: string;
  etr: string;
  kpi: string;
  strategiInisiatif: string;
  kriteriaKejayaan: string;
  anggaranKos: string;
  sumberKos: string;
}

export interface KawalanProgramDoc {
  id: string;
  schoolCode: string;
  academicYear: string;
  mode: ProgramMode;
  sopTemplateId?: string;
  title: string;
  domain: ProgramDomain;
  tarikhMula: string; // YYYY-MM-DD (Tarikh Program)
  tarikhTamat: string; // YYYY-MM-DD
  masa?: string;
  tempat?: string;
  sasaran?: string;
  objektif?: string;

  // Mandatory SKAS Binding
  standardGroup: SkasStandardGroupKey;
  subStandardCode: string;
  subStandardTitle: string;

  // Mandatory Personnel / PIC Binding
  picId: string;
  picName: string;
  picEmail?: string;
  picPosition?: string;
  ajkMembers: {
    teacherId: string;
    teacherName: string;
    role: string;
  }[];

  // PInTaS & KPI (Full in STRATEGIK, streamlined in PANTAS)
  pintas: PintasDetails;

  // OPPM 1-12 Months Gantt
  oppmMonths: number[]; // [1..12]
  oppmSubTasks: OppmSubTask[];

  // PDCA & Checklist
  pdcaStage: PdcaStage;
  checklist: ProgramChecklistItem[];

  // Execution & Google Drive Linkages
  linkedMemoDocId?: string;
  linkedMinitDocId?: string;
  linkedOprDocId?: string;
  oprSubmitted: boolean;
  oprSubmittedAt?: string;
  driveFileUrl?: string;
  driveFolderUrl?: string;
  driveFolderPath?: string;

  // Check & Act Supervision Review (GPK & Guru Besar)
  gpkVerified?: boolean;
  gpkVerifiedBy?: string;
  gpkVerifiedAt?: string;
  gpkUlasan?: string;

  gbApproved?: boolean;
  gbApprovedBy?: string;
  gbApprovedAt?: string;
  gbUlasan?: string;
  kpiAchievementStatus?: 'CAPAI' | 'SEBAHAGIAN' | 'TIDAK_CAPAI';
  tindakanSusulanAct?: string;
  isSchoolSopStandard?: boolean;

  createdByUid?: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchoolSopTemplate {
  id: string;
  code: string;
  titleMs: string;
  titleZh: string;
  domain: ProgramDomain;
  defaultMode: ProgramMode;
  standardGroup: SkasStandardGroupKey;
  subStandardCode: string;
  subStandardTitle: string;
  defaultKpi: string;
  defaultTov: string;
  defaultEtr: string;
  defaultObjektif: string;
  defaultSasaran: string;
  defaultStrategi: string;
  defaultChecklistTitles: {
    stepKey: 'MEMO' | 'PELAKSANAAN' | 'OPR' | 'SEMAKAN';
    groupLabel: string;
    title: string;
  }[];
  isCustomSchoolSop?: boolean;
  updatedByGb?: string;
  updatedAt?: string;
}

export const PROGRAM_DOMAIN_META: Record<
  ProgramDomain,
  {
    label: string;
    labelZh: string;
    shortLabel: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
    gpkRoleLabel: string;
  }
> = {
  PENTADBIRAN: {
    label: 'Pentadbiran & Pengurusan',
    labelZh: '行政与组织管理',
    shortLabel: 'Pentadbiran',
    badgeBg: 'bg-blue-500/15',
    badgeText: 'text-blue-300',
    badgeBorder: 'border-blue-500/30',
    gpkRoleLabel: 'Guru Besar / PK Pentadbiran',
  },
  KURIKULUM: {
    label: 'Kurikulum & Akademik',
    labelZh: '课程与学术教学',
    shortLabel: 'Kurikulum',
    badgeBg: 'bg-indigo-500/15',
    badgeText: 'text-indigo-300',
    badgeBorder: 'border-indigo-500/30',
    gpkRoleLabel: 'PK Pentadbiran (PK1)',
  },
  HEM: {
    label: 'Hal Ehwal Murid (HEM)',
    labelZh: '学生事务与品格纪律',
    shortLabel: 'HEM',
    badgeBg: 'bg-emerald-500/15',
    badgeText: 'text-emerald-300',
    badgeBorder: 'border-emerald-500/30',
    gpkRoleLabel: 'PK Hal Ehwal Murid (PK HEM)',
  },
  KOKURIKULUM: {
    label: 'Kokurikulum & Sukan',
    labelZh: '课外活动与体育比赛',
    shortLabel: 'Kokurikulum',
    badgeBg: 'bg-amber-500/15',
    badgeText: 'text-amber-300',
    badgeBorder: 'border-amber-500/30',
    gpkRoleLabel: 'PK Kokurikulum (PK KK)',
  },
  PIBK_3K: {
    label: '3K & PIBK / Komuniti',
    labelZh: '校园 3K 与家协社区',
    shortLabel: '3K & PIBK',
    badgeBg: 'bg-purple-500/15',
    badgeText: 'text-purple-300',
    badgeBorder: 'border-purple-500/30',
    gpkRoleLabel: 'PK HEM / Guru Besar',
  },
};

export const PDCA_STAGE_META: Record<
  PdcaStage,
  {
    code: PdcaStage;
    label: string;
    shortLabel: string;
    descZh: string;
    bgClass: string;
    textClass: string;
    borderClass: string;
    stepNum: number;
  }
> = {
  PLAN: {
    code: 'PLAN',
    label: 'Fasa 1: Perancangan (Plan)',
    shortLabel: 'Perancangan (Plan)',
    descZh: '已立项 / 筹备 Memo 与工作分配',
    bgClass: 'bg-slate-800',
    textClass: 'text-slate-200',
    borderClass: 'border-slate-600',
    stepNum: 1,
  },
  DO: {
    code: 'DO',
    label: 'Fasa 2: Pelaksanaan (Do)',
    shortLabel: 'Pelaksanaan (Do)',
    descZh: '活动执行中 / 待提交 Smart OPR',
    bgClass: 'bg-blue-500/20',
    textClass: 'text-blue-300',
    borderClass: 'border-blue-500/40',
    stepNum: 2,
  },
  CHECK: {
    code: 'CHECK',
    label: 'Fasa 3: Menunggu Semakan (Check)',
    shortLabel: 'Menunggu Semakan (Check)',
    descZh: 'OPR 已归档 / 待副校长或校长审核',
    bgClass: 'bg-amber-500/20',
    textClass: 'text-amber-300',
    borderClass: 'border-amber-500/40',
    stepNum: 3,
  },
  ACT: {
    code: 'ACT',
    label: 'Fasa 4: Selesai & Penambahbaikan (Act)',
    shortLabel: 'Selesai & SOP (Act)',
    descZh: '校长已批示结案 / 纳入学校标准 SOP',
    bgClass: 'bg-emerald-500/20',
    textClass: 'text-emerald-300',
    borderClass: 'border-emerald-500/40',
    stepNum: 4,
  },
};

export const MALAY_MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mac',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Ogo',
  'Sep',
  'Okt',
  'Nov',
  'Dis',
];

/**
 * Standard 4-step streamlined checklist for Mod Pantas / Program Rutin
 */
export function buildDefault4StepChecklist(
  picName: string,
  tarikhProgram: string
): ProgramChecklistItem[] {
  return [
    {
      id: 'step_1_memo',
      stepKey: 'MEMO',
      groupLabel: '1. Plan (Perancangan)',
      title: '1. Memo Panggilan / Kertas Kerja & Agihan Tugas',
      picName,
      dueDate: tarikhProgram,
      done: false,
    },
    {
      id: 'step_2_pelaksanaan',
      stepKey: 'PELAKSANAAN',
      groupLabel: '2. Do (Pelaksanaan)',
      title: '2. Pelaksanaan Program & Rakaman Gambar Bukti',
      picName,
      dueDate: tarikhProgram,
      done: false,
    },
    {
      id: 'step_3_opr',
      stepKey: 'OPR',
      groupLabel: '3. Do -> Check (Dokumentasi Evidens)',
      title: '3. Penghantaran Smart OPR & Arkib Google Drive SKAS',
      picName,
      dueDate: tarikhProgram,
      done: false,
    },
    {
      id: 'step_4_semakan',
      stepKey: 'SEMAKAN',
      groupLabel: '4. Check -> Act (Semakan Pentadbir)',
      title: '4. Semakan & Pengesahan GPK / Guru Besar (PDCA Act)',
      picName: 'GPK / Guru Besar',
      dueDate: tarikhProgram,
      done: false,
    },
  ];
}

/**
 * Multi-group strategic checklist for Mod Strategik / Program Besar
 */
export function buildStrategicMultiGroupChecklist(
  picName: string,
  tarikhProgram: string
): ProgramChecklistItem[] {
  return [
    {
      id: 'strat_1_memo',
      stepKey: 'MEMO',
      groupLabel: 'AJK Induk & Perancangan (Plan)',
      title: 'Penyediaan Kertas Kerja PInTaS / Memo Panggilan Mesyuarat Jawatankuasa',
      picName,
      dueDate: tarikhProgram,
      done: false,
    },
    {
      id: 'strat_2_logistik',
      stepKey: 'CUSTOM',
      groupLabel: 'AJK Persiapan, Logistik & Jemputan (Do)',
      title: 'Persiapan Tempat, Bahan Program, Banner & Pengesahan Kehadiran Peserta',
      picName,
      dueDate: tarikhProgram,
      done: false,
    },
    {
      id: 'strat_3_pelaksanaan',
      stepKey: 'PELAKSANAAN',
      groupLabel: 'AJK Pelaksanaan & Pengurusan Program (Do)',
      title: 'Pelaksanaan Program Mengikut Tentatif & Pemantauan Instrumen SKAS',
      picName,
      dueDate: tarikhProgram,
      done: false,
    },
    {
      id: 'strat_4_opr',
      stepKey: 'OPR',
      groupLabel: 'AJK Dokumentasi & Evidens SKAS (Do -> Check)',
      title: 'Laporan Smart OPR (3 Foto Bulat) & Penilaian Impak TOV -> ETR ke Google Drive',
      picName,
      dueDate: tarikhProgram,
      done: false,
    },
    {
      id: 'strat_5_semakan',
      stepKey: 'SEMAKAN',
      groupLabel: 'Pentadbir GPK & Guru Besar (Check -> Act)',
      title: 'Semakan Pencapaian KPI oleh GPK, Pengesahan Akhir GB & Penetapan SOP Sekolah',
      picName: 'GPK / Guru Besar',
      dueDate: tarikhProgram,
      done: false,
    },
  ];
}

/**
 * 8 Universal School SOP Templates (全校 8 大通用 SOP 模板库)
 */
export const DEFAULT_8_SCHOOL_SOP_TEMPLATES: SchoolSopTemplate[] = [
  {
    id: 'sop_1_dialog_prestasi',
    code: 'SOP-01',
    titleMs: 'Mesyuarat Pengurusan & Dialog Prestasi Sekolah',
    titleZh: '行政/绩效对话与工作协调会议',
    domain: 'PENTADBIRAN',
    defaultMode: 'PANTAS',
    standardGroup: 'Std 1',
    subStandardCode: '1.1.6',
    subStandardTitle: 'PGB menerajui pemantauan kemajuan dan pencapaian murid',
    defaultKpi: '100% kehadiran ahli mesyuarat & tindakan susulan intervensi direkodkan dalam tempoh 5 hari bekerja',
    defaultTov: '85% tindakan selesai',
    defaultEtr: '100% tindakan selesai mengikut PKPA',
    defaultObjektif: 'Menilai pencapaian semasa murid serta menyelaras tindakan intervensi berfokus merentas unit.',
    defaultSasaran: 'Semua Guru & Pentadbir Sekolah',
    defaultStrategi: 'Pelaksanaan Dialog Prestasi berpandukan data PBD/UASA dan kehadiran murid.',
    defaultChecklistTitles: [
      { stepKey: 'MEMO', groupLabel: '1. Plan', title: '1. Memo Panggilan Mesyuarat / Dialog Prestasi' },
      { stepKey: 'PELAKSANAAN', groupLabel: '2. Do', title: '2. Pelaksanaan Dialog Prestasi & Pembentangan Data' },
      { stepKey: 'OPR', groupLabel: '3. Do -> Check', title: '3. Penghantaran Smart OPR / Minit PKPA ke Google Drive' },
      { stepKey: 'SEMAKAN', groupLabel: '4. Check -> Act', title: '4. Semakan & Pengesahan GPK / Guru Besar' },
    ],
  },
  {
    id: 'sop_2_intervensi_akademik',
    code: 'SOP-02',
    titleMs: 'Program Kecemerlangan Panitia & Intervensi PBD / UASA',
    titleZh: '科委会学术提升与 PBD/UASA 辅导干预活动',
    domain: 'KURIKULUM',
    defaultMode: 'PANTAS',
    standardGroup: 'Std 3.1',
    subStandardCode: '3.1.2.1',
    subStandardTitle: 'Pelaksanaan mata pelajaran diurus secara profesional dan terancang',
    defaultKpi: 'Sekurang-kurangnya 90% murid mencapai Tahap Penguasaan Minimum (TP3–TP6) / Lulus UASA',
    defaultTov: '82% Menguasai TP3–TP6',
    defaultEtr: '92% Menguasai TP3–TP6',
    defaultObjektif: 'Meningkatkan penguasaan kemahiran asas dan pencapaian akademik murid melalui aktiviti panitia berfokus.',
    defaultSasaran: 'Murid Tahun 1 hingga Tahun 6',
    defaultStrategi: 'Bengkel teknik menjawab, bimbingan berfokus murid TP1–TP2 dan kuiz pengukuhan panitia.',
    defaultChecklistTitles: [
      { stepKey: 'MEMO', groupLabel: '1. Plan', title: '1. Memo / Kertas Kerja Program Panitia' },
      { stepKey: 'PELAKSANAAN', groupLabel: '2. Do', title: '2. Pelaksanaan Aktiviti Panitia & Penilaian Murid' },
      { stepKey: 'OPR', groupLabel: '3. Do -> Check', title: '3. Smart OPR Panitia & Arkib Google Drive (3.1.2.1)' },
      { stepKey: 'SEMAKAN', groupLabel: '4. Check -> Act', title: '4. Semakan PK Pentadbiran & Pengesahan Guru Besar' },
    ],
  },
  {
    id: 'sop_3_plc_ladap',
    code: 'SOP-03',
    titleMs: 'Komuniti Pembelajaran Profesional (PLC) & LADAP Guru',
    titleZh: '教师专业学习社群 (PLC) 与校本培训 (LADAP)',
    domain: 'KURIKULUM',
    defaultMode: 'PANTAS',
    standardGroup: 'Std 2',
    subStandardCode: '2.1.2',
    subStandardTitle: 'Pembangunan sumber manusia diurus secara terancang',
    defaultKpi: '100% guru menghadiri sesi PLC/LADAP & mengamalkan strategi PdPc berkesan (Standard 4)',
    defaultTov: '88% skor PdPc Standard 4',
    defaultEtr: '95% skor PdPc Standard 4',
    defaultObjektif: 'Memantapkan kompetensi pedagogi guru melalui perkongsian amalan terbaik (Lesson Study / Learning Walks / Teacher Sharing).',
    defaultSasaran: 'Semua Guru Mata Pelajaran',
    defaultStrategi: 'Sesi PLC panitia dan latihan pembangunan profesionalisme berterusan (SPLKPM).',
    defaultChecklistTitles: [
      { stepKey: 'MEMO', groupLabel: '1. Plan', title: '1. Memo Panggilan Sesi PLC / LADAP' },
      { stepKey: 'PELAKSANAAN', groupLabel: '2. Do', title: '2. Pelaksanaan Sesi PLC & Perkongsian Pedagogi' },
      { stepKey: 'OPR', groupLabel: '3. Do -> Check', title: '3. Smart OPR PLC & Pendaftaran SPLKPM / Google Drive' },
      { stepKey: 'SEMAKAN', groupLabel: '4. Check -> Act', title: '4. Semakan PK Pentadbiran & Pengesahan Guru Besar' },
    ],
  },
  {
    id: 'sop_4_sahsiah_disiplin_hem',
    code: 'SOP-04',
    titleMs: 'Program Pembangunan Sahsiah, Disiplin & Kehadiran Murid (SSDM)',
    titleZh: '学生品格塑造、纪律规范与出席率提升活动',
    domain: 'HEM',
    defaultMode: 'PANTAS',
    standardGroup: 'Std 3.3',
    subStandardCode: '3.3.2.1',
    subStandardTitle: 'Disiplin murid diurus secara profesional dan terancang',
    defaultKpi: 'Peratus kehadiran murid melebihi 95% & peningkatan rekod Amalan Baik SSDM sebanyak 20%',
    defaultTov: '92.5% Kehadiran Bulanan',
    defaultEtr: '96.0% Kehadiran Bulanan',
    defaultObjektif: 'Memupuk sahsiah terpuji, disiplin kendiri dan motivasi kehadiran murid ke sekolah.',
    defaultSasaran: 'Semua Murid Prasekolah & Tahun 1–6',
    defaultStrategi: 'Kempen Jom Ke Sekolah, penghargaan Amalan Baik SSDM dan bimbingan kaunseling berfokus.',
    defaultChecklistTitles: [
      { stepKey: 'MEMO', groupLabel: '1. Plan', title: '1. Memo / Kertas Kerja Program Sahsiah & Disiplin HEM' },
      { stepKey: 'PELAKSANAAN', groupLabel: '2. Do', title: '2. Pelaksanaan Program & Perekodan SSDM' },
      { stepKey: 'OPR', groupLabel: '3. Do -> Check', title: '3. Smart OPR HEM & Arkib Google Drive (3.3.2.1)' },
      { stepKey: 'SEMAKAN', groupLabel: '4. Check -> Act', title: '4. Semakan PK HEM & Pengesahan Guru Besar' },
    ],
  },
  {
    id: 'sop_5_3k_keselamatan',
    code: 'SOP-05',
    titleMs: 'Program 3K (Kebersihan, Kesihatan, Keselamatan) & Latihan Kecemasan',
    titleZh: '校园 3K（整洁、健康、安全）与防火逃生演习',
    domain: 'PIBK_3K',
    defaultMode: 'PANTAS',
    standardGroup: 'Std 3.3',
    subStandardCode: '3.3.3.1',
    subStandardTitle: 'Keselamatan murid diurus secara sistematik dan terancang',
    defaultKpi: '100% warga sekolah mematuhi SOP keselamatan & masa pengungsian bangunan < 3 minit',
    defaultTov: '3.5 minit masa berkumpul',
    defaultEtr: '< 2.5 minit & 0 kemalangan',
    defaultObjektif: 'Memastikan persekitaran sekolah bersih, kondusif serta meningkatkan kesiapsiagaan menghadapi kecemasan.',
    defaultSasaran: 'Semua Guru, AKP & Murid',
    defaultStrategi: 'Latihan pengungsian bangunan (Fire Drill), pemeriksaan fizikal 3K dan ceramah kesihatan.',
    defaultChecklistTitles: [
      { stepKey: 'MEMO', groupLabel: '1. Plan', title: '1. Memo / Taklimat Pelan Laluan Kecemasan & 3K' },
      { stepKey: 'PELAKSANAAN', groupLabel: '2. Do', title: '2. Pelaksanaan Latihan / Pemeriksaan 3K Sekolah' },
      { stepKey: 'OPR', groupLabel: '3. Do -> Check', title: '3. Smart OPR 3K & Arkib Google Drive (3.3.3.1)' },
      { stepKey: 'SEMAKAN', groupLabel: '4. Check -> Act', title: '4. Semakan PK HEM & Pengesahan Guru Besar' },
    ],
  },
  {
    id: 'sop_6_koko_pertandingan',
    code: 'SOP-06',
    titleMs: 'Aktiviti Kokurikulum, Kemahiran Sukan & Penyertaan Pertandingan',
    titleZh: '课外活动训练、校内运动会及校外比赛带队',
    domain: 'KOKURIKULUM',
    defaultMode: 'PANTAS',
    standardGroup: 'Std 3.2',
    subStandardCode: '3.2.2.1',
    subStandardTitle: 'Kelab/persatuan diurus secara sistematik dan terancang',
    defaultKpi: 'Kehadiran kokurikulum > 95% & pencapaian sekurang-kurangnya tempat ke-3 peringkat Daerah/Bahagian',
    defaultTov: 'Penyertaan Daerah',
    defaultEtr: 'Pencapaian Podium Daerah / Negeri',
    defaultObjektif: 'Mencungkil bakat murid serta meningkatkan pencapaian PAJSK dalam bidang beruniform, kelab dan sukan.',
    defaultSasaran: 'Murid Tahap 2 (Tahun 4–6) / Pasukan Sekolah',
    defaultStrategi: 'Latihan intensif berjadual, bimbingan jurulatih dan penyertaan kejohanan MSSR / Ko-Akademik.',
    defaultChecklistTitles: [
      { stepKey: 'MEMO', groupLabel: '1. Plan', title: '1. Memo / Surat Kebenaran Ibu Bapa (SPPK) & Latihan' },
      { stepKey: 'PELAKSANAAN', groupLabel: '2. Do', title: '2. Pelaksanaan Aktiviti / Pertandingan Kokurikulum' },
      { stepKey: 'OPR', groupLabel: '3. Do -> Check', title: '3. Smart OPR Kokurikulum & Kemaskini PAJSK / Drive' },
      { stepKey: 'SEMAKAN', groupLabel: '4. Check -> Act', title: '4. Semakan PK Kokurikulum & Pengesahan Guru Besar' },
    ],
  },
  {
    id: 'sop_7_pibk_komuniti',
    code: 'SOP-07',
    titleMs: 'Program Permuafakatan PIBG, Sarana Ibu Bapa (PIBK) & Komuniti',
    titleZh: '董家协联谊、家长日 (Hari Terbuka) 与社区合作活动',
    domain: 'PIBK_3K',
    defaultMode: 'PANTAS',
    standardGroup: 'Std 2',
    subStandardCode: '2.7.1',
    subStandardTitle: 'Permuafakatan strategik diusahakan secara profesional dan terancang',
    defaultKpi: 'Sekurang-kurangnya 85% penglibatan ibu bapa / penjaga dalam program sekolah',
    defaultTov: '75% kehadiran ibu bapa',
    defaultEtr: '90% kehadiran ibu bapa',
    defaultObjektif: 'Mengukuhkan jalinan kerjasama strategik antara pihak sekolah, Lembaga Pengurus, PIBG dan komuniti setempat.',
    defaultSasaran: 'Ibu Bapa / Penjaga, AJK PIBG & Warga Sekolah',
    defaultStrategi: 'Hari Pelaporan PBD, Gotong-Royong Madani dan Mesyuarat Agung PIBG.',
    defaultChecklistTitles: [
      { stepKey: 'MEMO', groupLabel: '1. Plan', title: '1. Memo / Surat Jemputan Ibu Bapa & AJK PIBG' },
      { stepKey: 'PELAKSANAAN', groupLabel: '2. Do', title: '2. Pelaksanaan Program PIBK & Pendaftaran Kehadiran' },
      { stepKey: 'OPR', groupLabel: '3. Do -> Check', title: '3. Smart OPR PIBK & Arkib Google Drive (2.7.1)' },
      { stepKey: 'SEMAKAN', groupLabel: '4. Check -> Act', title: '4. Semakan GPK & Pengesahan Guru Besar' },
    ],
  },
  {
    id: 'sop_8_perpaduan_sambutan',
    code: 'SOP-08',
    titleMs: 'Sambutan Hari Kebesaran, Perpaduan (RIMUP) & Apresiasi Murid',
    titleZh: '节庆庆典、国民团结 (RIMUP) 与颁奖表扬大会',
    domain: 'PENTADBIRAN',
    defaultMode: 'PANTAS',
    standardGroup: 'Std 2',
    subStandardCode: '2.6.1',
    subStandardTitle: 'Pemahaman dan penerimaan terhadap kepelbagaian masyarakat Malaysia diurus secara terancang',
    defaultKpi: '100% penglibatan murid pelbagai kaum dalam aktiviti perpaduan & sambutan rasmi sekolah',
    defaultTov: '90% penglibatan murid',
    defaultEtr: '100% penglibatan murid & warga sekolah',
    defaultObjektif: 'Memupuk semangat patriotisme, perpaduan silang budaya dan menghargai kecemerlangan warga sekolah.',
    defaultSasaran: 'Semua Guru, AKP & Murid',
    defaultStrategi: 'Sambutan Bulan Kebangsaan, Hari Guru, Tahun Baru Cina, Hari Raya, Gawai dan Majlis Apresiasi.',
    defaultChecklistTitles: [
      { stepKey: 'MEMO', groupLabel: '1. Plan', title: '1. Memo & Agihan Jawatankuasa Sambutan' },
      { stepKey: 'PELAKSANAAN', groupLabel: '2. Do', title: '2. Pelaksanaan Majlis Sambutan & Aktiviti Murid' },
      { stepKey: 'OPR', groupLabel: '3. Do -> Check', title: '3. Smart OPR Sambutan & Arkib Google Drive (2.6.1)' },
      { stepKey: 'SEMAKAN', groupLabel: '4. Check -> Act', title: '4. Semakan GPK & Pengesahan Guru Besar' },
    ],
  },
];

/**
 * Calculates working days (Monday - Friday) elapsed between a target date (YYYY-MM-DD) and today.
 * Returns 0 if the target date is today or in the future.
 */
export function computeWorkingDaysElapsed(
  tarikhProgramStr: string,
  referenceDate: Date = new Date()
): number {
  if (!tarikhProgramStr) return 0;
  const cleanStr = tarikhProgramStr.slice(0, 10);
  const parts = cleanStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return 0;

  const progDate = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  const today = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
    0,
    0,
    0,
    0
  );

  if (today <= progDate) return 0;

  let workingDays = 0;
  const cursor = new Date(progDate);
  cursor.setDate(cursor.getDate() + 1);

  while (cursor <= today) {
    const dayOfWeek = cursor.getDay(); // 0 = Sun, 6 = Sat
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDays++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return workingDays;
}

/**
 * SLA Red-Light Rule:
 * Any program whose Tarikh Program (or Tarikh Tamat) has passed by MORE THAN 5 working days
 * AND either has not submitted Smart OPR OR has not completed verification (pdcaStage !== 'ACT')
 * is flagged as Overdue SLA.
 */
export function evaluateProgramSLA(program: KawalanProgramDoc): {
  workingDaysElapsed: number;
  isOverdueOpr: boolean;
  isOverdueVerification: boolean;
  isOverdueSLA: boolean;
  slaReason: string;
} {
  const effectiveDate = program.tarikhTamat || program.tarikhMula;
  const workingDaysElapsed = computeWorkingDaysElapsed(effectiveDate);
  const oprStep = program.checklist?.find((c) => c.stepKey === 'OPR');
  const hasOpr = Boolean(program.oprSubmitted || oprStep?.done || program.linkedOprDocId);
  const isCompletedAct = program.pdcaStage === 'ACT' || Boolean(program.gbApproved);

  if (isCompletedAct || workingDaysElapsed <= 5) {
    return {
      workingDaysElapsed,
      isOverdueOpr: false,
      isOverdueVerification: false,
      isOverdueSLA: false,
      slaReason: '',
    };
  }

  const isOverdueOpr = !hasOpr;
  const isOverdueVerification = hasOpr && !isCompletedAct;

  return {
    workingDaysElapsed,
    isOverdueOpr,
    isOverdueVerification,
    isOverdueSLA: isOverdueOpr || isOverdueVerification,
    slaReason: isOverdueOpr
      ? `Tertunggak Smart OPR (${workingDaysElapsed} hari bekerja selepas tarikh program)`
      : `Menunggu Semakan & Pengesahan (${workingDaysElapsed} hari bekerja selepas tarikh program)`,
  };
}
