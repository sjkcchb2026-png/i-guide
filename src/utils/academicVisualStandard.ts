/**
 * iSEPADU AI — Academic Visual Standard
 * Centralized Single Source of Truth (SSOT) for all Academic Visualizations
 * 
 * Reused across:
 *   - PBD
 *   - UASA
 *   - Academic Dashboard
 *   - Class Analysis
 *   - Student Analysis
 *   - Intervention
 *   - Panitia Analysis
 *   - Dialog Prestasi
 *   - Reports, Charts, Tables, Badges, Near Miss & Mismatch Indicators
 */

// ============================================================================
// 1. SEMANTIC COLOR TOKENS & DEFINITIONS
// ============================================================================

export type AcademicSemanticColor = 
  | 'academicDanger'   // RED: Serious concern / Immediate intervention required
  | 'academicWarning'  // ORANGE: At risk / Below expected level / Reinforcement needed
  | 'academicCaution'  // YELLOW: Basic satisfactory / Improvement opportunity
  | 'academicSuccess'  // GREEN: Meets or exceeds expected target
  | 'academicNeutral'; // GREY: Unrecorded / Non-applicable / Pending

export interface SemanticColorStyle {
  token: AcademicSemanticColor;
  labelZh: string;
  labelMs: string;
  hex: string;
  bgHex: string;
  tailwind: {
    bg: string;
    text: string;
    border: string;
    badge: string;
    subtleBg: string;
    hoverBg: string;
    ring: string;
  };
}

export const ACADEMIC_COLOR_TOKENS: Record<AcademicSemanticColor, SemanticColorStyle> = {
  academicDanger: {
    token: 'academicDanger',
    labelZh: '亟需干预 / 严重警示',
    labelMs: 'Intervensi Segera / Tahap Kritikal',
    hex: '#EF4444', // Red-500
    bgHex: '#FEF2F2', // Red-50
    tailwind: {
      bg: 'bg-rose-500',
      text: 'text-rose-700',
      border: 'border-rose-300',
      badge: 'bg-rose-50 border-rose-300 text-rose-800 font-extrabold',
      subtleBg: 'bg-rose-50/70',
      hoverBg: 'hover:bg-rose-100',
      ring: 'ring-rose-400',
    },
  },
  academicWarning: {
    token: 'academicWarning',
    labelZh: '需巩固 / 风险预警',
    labelMs: 'Perlu Pengukuhan / Berisiko',
    hex: '#F97316', // Orange-500
    bgHex: '#FFF7ED', // Orange-50
    tailwind: {
      bg: 'bg-amber-500',
      text: 'text-amber-800',
      border: 'border-amber-300',
      badge: 'bg-amber-50 border-amber-300 text-amber-800 font-extrabold',
      subtleBg: 'bg-amber-50/70',
      hoverBg: 'hover:bg-amber-100',
      ring: 'ring-amber-400',
    },
  },
  academicCaution: {
    token: 'academicCaution',
    labelZh: '基本达标 / 仍需提升',
    labelMs: 'Tahap Memuaskan / Potensi Peningkatan',
    hex: '#EAB308', // Yellow-500
    bgHex: '#FEFCE8', // Yellow-50
    tailwind: {
      bg: 'bg-yellow-400',
      text: 'text-yellow-800',
      border: 'border-yellow-300',
      badge: 'bg-yellow-50 border-yellow-300 text-yellow-900 font-extrabold',
      subtleBg: 'bg-yellow-50/70',
      hoverBg: 'hover:bg-yellow-100',
      ring: 'ring-yellow-400',
    },
  },
  academicSuccess: {
    token: 'academicSuccess',
    labelZh: '达标或优秀',
    labelMs: 'Mencapai / Melepasi Tahap Sasaran',
    hex: '#10B981', // Emerald-500
    bgHex: '#ECFDF5', // Emerald-50
    tailwind: {
      bg: 'bg-emerald-500',
      text: 'text-emerald-800',
      border: 'border-emerald-300',
      badge: 'bg-emerald-50 border-emerald-300 text-emerald-800 font-extrabold',
      subtleBg: 'bg-emerald-50/70',
      hoverBg: 'hover:bg-emerald-100',
      ring: 'ring-emerald-400',
    },
  },
  academicNeutral: {
    token: 'academicNeutral',
    labelZh: '未记录 / 不适用',
    labelMs: 'Tiada Rekod / Tidak Berkenaan',
    hex: '#94A3B8', // Slate-400
    bgHex: '#F8FAFC', // Slate-50
    tailwind: {
      bg: 'bg-slate-400',
      text: 'text-slate-600',
      border: 'border-slate-300',
      badge: 'bg-slate-100 border-slate-200 text-slate-600 font-bold',
      subtleBg: 'bg-slate-50',
      hoverBg: 'hover:bg-slate-100',
      ring: 'ring-slate-300',
    },
  },
};

// ============================================================================
// 2. PBD (PENTAKSIRAN BILIK DARJAH) STANDARDS (TP1 → TP6)
// ============================================================================

export type PbdLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface PbdInfo {
  level: PbdLevel;
  code: `TP${PbdLevel}`;
  semanticColor: AcademicSemanticColor;
  meaningMs: string;
  meaningZh: string;
  actionRequiredMs: string;
  actionRequiredZh: string;
}

export const PBD_STANDARDS: Record<PbdLevel, PbdInfo> = {
  1: {
    level: 1,
    code: 'TP1',
    semanticColor: 'academicDanger',
    meaningMs: 'Tahu / Perlu Intervensi Segera',
    meaningZh: '尚未掌握基础，亟需个别辅导',
    actionRequiredMs: 'Intervensi Segera',
    actionRequiredZh: '立刻启动重点个案辅导',
  },
  2: {
    level: 2,
    code: 'TP2',
    semanticColor: 'academicDanger',
    meaningMs: 'Tahu dan Faham / Perlu Intervensi Segera',
    meaningZh: '理解有限，亟需个别辅导',
    actionRequiredMs: 'Intervensi Segera',
    actionRequiredZh: '安排课后补救与技能再巩固',
  },
  3: {
    level: 3,
    code: 'TP3',
    semanticColor: 'academicWarning',
    meaningMs: 'Tahu, Faham dan Boleh Buat / Perlu Pengukuhan',
    meaningZh: '勉强达标，仍需加强巩固',
    actionRequiredMs: 'Perlu Pengukuhan',
    actionRequiredZh: '重点跟进，推动升至TP4标准',
  },
  4: {
    level: 4,
    code: 'TP4',
    semanticColor: 'academicSuccess',
    meaningMs: 'Boleh Buat dengan Beradab / Mencapai Tahap',
    meaningZh: '良好掌握，已达标',
    actionRequiredMs: 'Mencapai Sasaran',
    actionRequiredZh: '稳步进阶，向更高掌握层次拓展',
  },
  5: {
    level: 5,
    code: 'TP5',
    semanticColor: 'academicSuccess',
    meaningMs: 'Boleh Buat dengan Terpuji / Melepasi Tahap',
    meaningZh: '熟练掌握，成绩优异',
    actionRequiredMs: 'Melepasi Sasaran',
    actionRequiredZh: '拔尖培优，鼓励高阶思维挑战',
  },
  6: {
    level: 6,
    code: 'TP6',
    semanticColor: 'academicSuccess',
    meaningMs: 'Boleh Buat dengan Teladan / Cemerlang & Contoh',
    meaningZh: '融会贯通，典范水平',
    actionRequiredMs: 'Cemerlang Terpuji',
    actionRequiredZh: '成为班级榜样及领航导学助手',
  },
};
// ============================================================================
// 2A. VERSIONED ACADEMIC ASSESSMENT SCALE CONFIGURATION LAYER
// ============================================================================

export interface PbdScaleLevel {
  code: string;               // e.g. 'TP1', 'TP2', 'TP3', etc.
  order: number;              // 1, 2, 3... canonical scale order
  semanticStatus: AcademicSemanticColor; // 'academicDanger', 'academicWarning', 'academicSuccess'
  colorToken: string;         // e.g. '#EF4444'
  meaningMs: string;
  meaningZh: string;
  actionRequiredMs?: string;
  actionRequiredZh?: string;
}

export interface PbdScaleConfig {
  scaleId: string;            // e.g. 'PBD_STANDARD_6_LEVEL_2026', 'PBD_3_LEVEL_2027_Y1'
  name: string;
  academicYear: string;       // e.g. '2026', '2027'
  yearLevel?: number | 'ALL'; // 1..6 or 'ALL'
  subjectId?: string;
  levels: PbdScaleLevel[];
  active: boolean;
  version: number;
}

/**
 * 2026 Standard 6-level scale (Tahun 1-6)
 */
export const DEFAULT_2026_6_LEVEL_SCALE: PbdScaleConfig = {
  scaleId: 'PBD_STANDARD_6_LEVEL_2026',
  name: 'Skala Piawai PBD 6 Tahap (2026)',
  academicYear: '2026',
  yearLevel: 'ALL',
  version: 1,
  active: true,
  levels: [
    {
      code: 'TP1',
      order: 1,
      semanticStatus: 'academicDanger',
      colorToken: '#EF4444',
      meaningMs: 'Tahu / Perlu Intervensi Segera',
      meaningZh: '尚未掌握基础，亟需个别辅导',
      actionRequiredMs: 'Intervensi Segera',
      actionRequiredZh: '立刻启动重点个案辅导',
    },
    {
      code: 'TP2',
      order: 2,
      semanticStatus: 'academicDanger',
      colorToken: '#EF4444',
      meaningMs: 'Tahu dan Faham / Perlu Intervensi Segera',
      meaningZh: '理解有限，亟需个别辅导',
      actionRequiredMs: 'Intervensi Segera',
      actionRequiredZh: '安排课后补救与技能再巩固',
    },
    {
      code: 'TP3',
      order: 3,
      semanticStatus: 'academicWarning',
      colorToken: '#F97316',
      meaningMs: 'Tahu, Faham dan Boleh Buat / Perlu Pengukuhan',
      meaningZh: '勉强达标，仍需加强巩固',
      actionRequiredMs: 'Perlu Pengukuhan',
      actionRequiredZh: '重点跟进，推动升至TP4标准',
    },
    {
      code: 'TP4',
      order: 4,
      semanticStatus: 'academicSuccess',
      colorToken: '#10B981',
      meaningMs: 'Boleh Buat dengan Beradab / Mencapai Tahap',
      meaningZh: '良好掌握，已达标',
      actionRequiredMs: 'Mencapai Sasaran',
      actionRequiredZh: '稳步进阶，向更高掌握层次拓展',
    },
    {
      code: 'TP5',
      order: 5,
      semanticStatus: 'academicSuccess',
      colorToken: '#10B981',
      meaningMs: 'Boleh Buat dengan Terpuji / Melepasi Tahap',
      meaningZh: '熟练掌握，成绩优异',
      actionRequiredMs: 'Melepasi Sasaran',
      actionRequiredZh: '拔尖培优，鼓励高阶思维挑战',
    },
    {
      code: 'TP6',
      order: 6,
      semanticStatus: 'academicSuccess',
      colorToken: '#10B981',
      meaningMs: 'Boleh Buat dengan Teladan / Cemerlang & Contoh',
      meaningZh: '融会贯通，典范水平',
      actionRequiredMs: 'Cemerlang Terpuji',
      actionRequiredZh: '成为班级榜样及领航导学助手',
    },
  ],
};

/**
 * 2027 Year 1 3-level scale (Tahun 1)
 */
export const SCALE_2027_YEAR1_3_LEVEL: PbdScaleConfig = {
  scaleId: 'PBD_3_LEVEL_2027_Y1',
  name: 'Skala PBD 3 Tahap Tahun 1 (2027)',
  academicYear: '2027',
  yearLevel: 1,
  version: 1,
  active: true,
  levels: [
    {
      code: 'TP1',
      order: 1,
      semanticStatus: 'academicDanger',
      colorToken: '#EF4444',
      meaningMs: 'Tahu / Perlu Bimbingan & Intervensi',
      meaningZh: '尚未掌握基础，需个别辅导',
      actionRequiredMs: 'Intervensi Asas',
      actionRequiredZh: '基础辅导干预',
    },
    {
      code: 'TP2',
      order: 2,
      semanticStatus: 'academicWarning',
      colorToken: '#F97316',
      meaningMs: 'Tahu dan Faham / Perlu Pengukuhan',
      meaningZh: '基本掌握，需强化巩固',
      actionRequiredMs: 'Pengukuhan Berterusan',
      actionRequiredZh: '持续跟进强化',
    },
    {
      code: 'TP3',
      order: 3,
      semanticStatus: 'academicSuccess',
      colorToken: '#10B981',
      meaningMs: 'Tahu, Faham dan Boleh Buat / Mencapai Sasaran',
      meaningZh: '良好达标，达到预期目标',
      actionRequiredMs: 'Mencapai Sasaran',
      actionRequiredZh: '达到预期目标',
    },
  ],
};

/**
 * Versioned UASA Scale Configuration
 */
export interface UasaScaleGrade {
  grade: UasaGrade;
  minMark: number;
  maxMark: number;
  order: number; // 1 (F) to 6 (A)
  semanticStatus: AcademicSemanticColor;
  interpretationMs: string;
  interpretationZh: string;
}

export interface UasaScaleConfig {
  scaleId: string;
  name: string;
  academicYear: string;
  yearLevel?: number | 'ALL';
  grades: UasaScaleGrade[];
  version: number;
  active: boolean;
}

export const DEFAULT_UASA_SCALE_CONFIG: UasaScaleConfig = {
  scaleId: 'UASA_STANDARD_2026',
  name: 'Skala Piawai Gred UASA KPM',
  academicYear: '2026',
  yearLevel: 'ALL',
  version: 1,
  active: true,
  grades: [
    {
      grade: 'A',
      minMark: 82,
      maxMark: 100,
      order: 6,
      semanticStatus: 'academicSuccess',
      interpretationMs: 'CEMERLANG',
      interpretationZh: '特优',
    },
    {
      grade: 'B',
      minMark: 66,
      maxMark: 81,
      order: 5,
      semanticStatus: 'academicSuccess',
      interpretationMs: 'KEPUJIAN',
      interpretationZh: '良好',
    },
    {
      grade: 'C',
      minMark: 50,
      maxMark: 65,
      order: 4,
      semanticStatus: 'academicCaution',
      interpretationMs: 'BAIK',
      interpretationZh: '满意',
    },
    {
      grade: 'D',
      minMark: 35,
      maxMark: 49,
      order: 3,
      semanticStatus: 'academicWarning',
      interpretationMs: 'MEMUASKAN',
      interpretationZh: '基础达标',
    },
    {
      grade: 'E',
      minMark: 20,
      maxMark: 34,
      order: 2,
      semanticStatus: 'academicDanger',
      interpretationMs: 'MENCAPAI TAHAP MINIMUM',
      interpretationZh: '达到最低水平',
    },
    {
      grade: 'F',
      minMark: 0,
      maxMark: 19,
      order: 1,
      semanticStatus: 'academicDanger',
      interpretationMs: 'TIDAK MENCAPAI TAHAP MINIMUM',
      interpretationZh: '未达最低水平',
    },
  ],
};

/**
 * Resolves the appropriate PBD scale config based on context
 */
export function resolvePbdScale(params?: {
  academicYear?: string;
  yearLevel?: number;
  subjectId?: string;
  customScale?: PbdScaleConfig;
}): PbdScaleConfig {
  if (params?.customScale) return params.customScale;
  if (params?.academicYear === '2027' && params?.yearLevel === 1) {
    return SCALE_2027_YEAR1_3_LEVEL;
  }
  return DEFAULT_2026_6_LEVEL_SCALE;
}

/**
 * Resolves the appropriate UASA scale config based on context
 */
export function resolveUasaScale(params?: {
  academicYear?: string;
  yearLevel?: number;
  customScale?: UasaScaleConfig;
}): UasaScaleConfig {
  if (params?.customScale) return params.customScale;
  return DEFAULT_UASA_SCALE_CONFIG;
}

/**
 * TOV Carry-Forward Compatibility Check
 * Enforces TOV_REQUIRES_MAPPING protection against blind carry-forward
 * across incompatible assessment scale structures.
 */
export type TovCarryForwardStatus = 'COMPATIBLE' | 'TOV_REQUIRES_MAPPING';

export interface TovCarryForwardCheckResult {
  status: TovCarryForwardStatus;
  compatible: boolean;
  reasonMs: string;
  reasonZh: string;
  sourceScaleId: string;
  targetScaleId: string;
}

export function checkTovCarryForwardCompatibility(
  sourceScale: PbdScaleConfig,
  targetScale: PbdScaleConfig
): TovCarryForwardCheckResult {
  if (sourceScale.scaleId === targetScale.scaleId && sourceScale.levels.length === targetScale.levels.length) {
    return {
      status: 'COMPATIBLE',
      compatible: true,
      reasonMs: 'Struktur skala pentaksiran serasi untuk pemindahan TOV terus.',
      reasonZh: '评价量表结构一致，可直接结转 TOV 基线。',
      sourceScaleId: sourceScale.scaleId,
      targetScaleId: targetScale.scaleId,
    };
  }

  return {
    status: 'TOV_REQUIRES_MAPPING',
    compatible: false,
    reasonMs: `Struktur skala berbeza (${sourceScale.scaleId} [${sourceScale.levels.length} tahap] vs ${targetScale.scaleId} [${targetScale.levels.length} tahap]). Pemetaan TOV diperlukan sebelum unjuran.`,
    reasonZh: `评估量表结构存在版本差异（原量表 ${sourceScale.scaleId} [${sourceScale.levels.length} 阶] vs 新量表 ${targetScale.scaleId} [${targetScale.levels.length} 阶]），禁止直接盲目结转，需经量表转换映射。`,
    sourceScaleId: sourceScale.scaleId,
    targetScaleId: targetScale.scaleId,
  };
}

/**
 * Resolves a level item within a configured PbdScaleConfig by matching:
 * - code (case-insensitive: 'TP1', 'TP2', etc.)
 * - order (numeric: 1, 2, 3...)
 * Does NOT rely on parsing TP numbers directly.
 */
export function findLevelInScale(
  levelInput: unknown,
  scale: PbdScaleConfig
): PbdScaleLevel | null {
  if (levelInput === null || levelInput === undefined || levelInput === '') return null;
  const str = String(levelInput).trim().toUpperCase();

  // 1. Match code directly (e.g. 'TP1', 'TP2')
  const byCode = scale.levels.find(l => l.code.toUpperCase() === str);
  if (byCode) return byCode;

  // 2. Match order directly (e.g. 1, 2, 3)
  const num = typeof levelInput === 'number' ? levelInput : parseInt(str.replace(/^[A-Z]+/i, ''), 10);
  if (!isNaN(num)) {
    const byOrder = scale.levels.find(l => l.order === num);
    if (byOrder) return byOrder;
  }

  return null;
}

/**
 * Universal Scale Gap Evaluator
 * 
 * Finalized Rule:
 *   Scale gap = target.order - actual.order
 * 
 *   Scale gap <= 0 → ON TRACK
 *   Scale gap = 1  → NEAR MISS
 *   Scale gap >= 2 → MISMATCH
 * 
 * Operates strictly on configured scale order, NOT on parsing TP strings directly.
 */
export type AcademicScaleGapStatus = 'ON TRACK' | 'NEAR MISS' | 'MISMATCH' | 'UNKNOWN';

export interface ScaleGapResult {
  actualLevel: PbdScaleLevel | null;
  targetLevel: PbdScaleLevel | null;
  gap: number;
  status: AcademicScaleGapStatus;
}

export function calculateScaleGap(
  actual: unknown,
  target: unknown,
  scaleConfig?: PbdScaleConfig
): ScaleGapResult {
  const scale = scaleConfig ?? resolvePbdScale();
  const act = findLevelInScale(actual, scale);
  const tgt = findLevelInScale(target, scale);

  if (!act || !tgt) {
    return { actualLevel: act, targetLevel: tgt, gap: 0, status: 'UNKNOWN' };
  }

  // Scale gap = target.order - actual.order
  const gap = tgt.order - act.order;

  if (gap >= 2) {
    return { actualLevel: act, targetLevel: tgt, gap, status: 'MISMATCH' };
  } else if (gap === 1) {
    return { actualLevel: act, targetLevel: tgt, gap: 1, status: 'NEAR MISS' };
  } else {
    return { actualLevel: act, targetLevel: tgt, gap: Math.max(0, gap), status: 'ON TRACK' };
  }
}

/**
 * Normalizes any TP input (e.g. 3, "3", "TP3", "tp3") into 1..6 or null
 */
export function normalizeTp(input: unknown): PbdLevel | null {
  if (input === null || input === undefined || input === '') return null;
  const str = String(input).toUpperCase().replace(/^TP/i, '').trim();
  const num = parseInt(str, 10);
  if (num >= 1 && num <= 6) {
    return num as PbdLevel;
  }
  return null;
}

/**
 * Returns the full PBD Standard info object
 */
export function getPbdStatus(tp: unknown): PbdInfo | null {
  const norm = normalizeTp(tp);
  if (!norm) return null;
  return PBD_STANDARDS[norm];
}

/**
 * Returns the semantic color token for PBD
 */
export function getPbdSemanticColor(tp: unknown, scaleConfig?: PbdScaleConfig): AcademicSemanticColor {
  if (scaleConfig) {
    const level = findLevelInScale(tp, scaleConfig);
    return level ? level.semanticStatus : 'academicNeutral';
  }
  const info = getPbdStatus(tp);
  if (info) return info.semanticColor;
  const defLevel = findLevelInScale(tp, DEFAULT_2026_6_LEVEL_SCALE);
  return defLevel ? defLevel.semanticStatus : 'academicNeutral';
}

// ============================================================================
// 3. UASA (UJIAN AKHIR SESI AKADEMIK) STANDARDS (A → F)
// ============================================================================

export type UasaGrade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface UasaGradeInfo {
  grade: UasaGrade;
  minMark: number;
  maxMark: number;
  interpretationMs: string;
  interpretationZh: string;
  semanticColor: AcademicSemanticColor;
  descriptionMs: string;
  descriptionZh: string;
}

export const UASA_GRADE_STANDARDS: Record<UasaGrade, UasaGradeInfo> = {
  A: {
    grade: 'A',
    minMark: 82,
    maxMark: 100,
    interpretationMs: 'CEMERLANG',
    interpretationZh: '特优',
    semanticColor: 'academicSuccess',
    descriptionMs: 'Prestasi cemerlang melepasi sasaran tinggi.',
    descriptionZh: '成绩特优，全面掌握高阶概念。',
  },
  B: {
    grade: 'B',
    minMark: 66,
    maxMark: 81,
    interpretationMs: 'KEPUJIAN',
    interpretationZh: '优良',
    semanticColor: 'academicSuccess',
    descriptionMs: 'Prestasi kepujian dan mencapai sasaran dengan baik.',
    descriptionZh: '成绩优良，稳步掌握教学核心要点。',
  },
  C: {
    grade: 'C',
    minMark: 50,
    maxMark: 65,
    interpretationMs: 'BAIK',
    interpretationZh: '良好',
    semanticColor: 'academicCaution',
    descriptionMs: 'Pencapaian memuaskan tetapi ada ruang peningkatan.',
    descriptionZh: '成绩良好达标，具备进一步冲刺优良潜力。',
  },
  D: {
    grade: 'D',
    minMark: 35,
    maxMark: 49,
    interpretationMs: 'MEMUASKAN',
    interpretationZh: '及格',
    semanticColor: 'academicWarning',
    descriptionMs: 'Berada di bawah sasaran memuaskan, perlukan bimbingan.',
    descriptionZh: '勉强及格，存在掉入不及格风险，亟需强化。',
  },
  E: {
    grade: 'E',
    minMark: 20,
    maxMark: 34,
    interpretationMs: 'MENCAPAI TAHAP MINIMUM',
    interpretationZh: '达最低掌握水平（待改进）',
    semanticColor: 'academicDanger',
    descriptionMs: 'Perlu intervensi segera bagi mencapai kelulusan kukuh.',
    descriptionZh: '仅达最低水平，基础薄弱，需个案紧抓。',
  },
  F: {
    grade: 'F',
    minMark: 0,
    maxMark: 19,
    interpretationMs: 'TIDAK MENCAPAI TAHAP MINIMUM',
    interpretationZh: '未达最低掌握水平',
    semanticColor: 'academicDanger',
    descriptionMs: 'Tahap kritikal, wajib intervensi intensif segera.',
    descriptionZh: '严重落后，未达基本要求，必须深度介入补救。',
  },
};

/**
 * Computes official UASA Grade from raw mark (0-100 or special codes TH/N/A)
 * Never allows manual teacher override of grade calculation.
 */
export function getUasaGrade(mark: unknown): UasaGrade | 'TH' | null {
  if (mark === null || mark === undefined || mark === '') return null;
  const str = String(mark).trim().toUpperCase();
  if (str === 'TH' || str === 'ABSENT') return 'TH';
  if (['A', 'B', 'C', 'D', 'E', 'F'].includes(str)) {
    return str as UasaGrade;
  }
  const num = typeof mark === 'number' ? mark : parseFloat(str);
  if (isNaN(num)) return null;

  if (num >= 82) return 'A';
  if (num >= 66) return 'B';
  if (num >= 50) return 'C';
  if (num >= 35) return 'D';
  if (num >= 20) return 'E';
  if (num >= 0) return 'F';
  return null;
}

/**
 * Returns official UASA Interpretation (e.g. CEMERLANG, KEPUJIAN, BAIK, etc.)
 */
export function getUasaGradeInterpretation(grade: unknown): string {
  if (!grade) return '-';
  const g = String(grade).toUpperCase().trim();
  if (g === 'TH') return 'TIDAK HADIR';
  if (g in UASA_GRADE_STANDARDS) {
    return UASA_GRADE_STANDARDS[g as UasaGrade].interpretationMs;
  }
  return '-';
}

/**
 * Returns semantic color token for UASA Grade
 */
export function getUasaSemanticColor(gradeOrMark: unknown): AcademicSemanticColor {
  if (gradeOrMark === null || gradeOrMark === undefined || gradeOrMark === '') {
    return 'academicNeutral';
  }
  let grade: UasaGrade | 'TH' | null = null;
  const str = String(gradeOrMark).trim().toUpperCase();
  if (['A', 'B', 'C', 'D', 'E', 'F', 'TH'].includes(str)) {
    grade = str as any;
  } else {
    grade = getUasaGrade(gradeOrMark);
  }

  if (!grade || grade === 'TH') return 'academicNeutral';
  return UASA_GRADE_STANDARDS[grade].semanticColor;
}

// ============================================================================
// 4. PROGRESSION DIRECTION (↑ / → / ↓)
// ============================================================================

export type ProgressDirection = 'IMPROVED' | 'STABLE' | 'DECLINED' | 'UNKNOWN';

export interface ProgressResult {
  direction: ProgressDirection;
  symbol: '↑' | '→' | '↓' | '-';
  labelMs: string;
  labelZh: string;
  diff: number | null;
  cssClass: string;
}

/**
 * Calculates progress direction from previous value to current value.
 * Supports PBD (1..6) and UASA (0..100).
 * IMPORTANT: Color represents current achievement; the arrow represents progress direction.
 */
export function getProgressDirection(previous: unknown, current: unknown): ProgressResult {
  if (previous === null || previous === undefined || previous === '' ||
      current === null || current === undefined || current === '') {
    return {
      direction: 'UNKNOWN',
      symbol: '-',
      labelMs: 'Tiada Perbandingan',
      labelZh: '无历史对比',
      diff: null,
      cssClass: 'text-slate-400',
    };
  }

  const prevNum = typeof previous === 'number' ? previous : (normalizeTp(previous) ?? parseFloat(String(previous)));
  const currNum = typeof current === 'number' ? current : (normalizeTp(current) ?? parseFloat(String(current)));

  if (isNaN(prevNum) || isNaN(currNum)) {
    return {
      direction: 'UNKNOWN',
      symbol: '-',
      labelMs: 'Tiada Perbandingan',
      labelZh: '无历史对比',
      diff: null,
      cssClass: 'text-slate-400',
    };
  }

  const diff = currNum - prevNum;

  if (diff > 0) {
    return {
      direction: 'IMPROVED',
      symbol: '↑',
      labelMs: `Meningkat (+${diff})`,
      labelZh: `进步 (+${diff})`,
      diff,
      cssClass: 'text-emerald-600 font-bold',
    };
  } else if (diff < 0) {
    return {
      direction: 'DECLINED',
      symbol: '↓',
      labelMs: `Menurun (${diff})`,
      labelZh: `退步 (${diff})`,
      diff,
      cssClass: 'text-rose-600 font-bold',
    };
  } else {
    return {
      direction: 'STABLE',
      symbol: '→',
      labelMs: 'Kekal / Stabil',
      labelZh: '持平保持',
      diff: 0,
      cssClass: 'text-blue-600 font-bold',
    };
  }
}

// ============================================================================
// 5. NEAR MISS DEFINITION & DETECTION (TARGET-BASED)
// ============================================================================

export interface NearMissResult {
  isNearMiss: boolean;
  distance: number;
  targetDescription: string;
  suggestedActionMs: string;
  suggestedActionZh: string;
}

/**
 * Near Miss: Student is close to next desired achievement level and can reach it
 * with focused intervention. NOT based on color alone.
 * 
 * Rules:
 * - PBD: Exactly 1 level below target (e.g. TP3 with target TP4, TP5 with target TP6).
 * - UASA: Within configurable marks threshold (default: 1-3 marks) of next grade boundary
 *   or student's target grade.
 */
export function getNearMissStatus(
  current: unknown,
  target?: unknown,
  options?: { 
    uasaThresholdMarks?: number; 
    targetGrade?: UasaGrade;
    scaleConfig?: PbdScaleConfig;
  }
): NearMissResult {
  const threshold = options?.uasaThresholdMarks ?? 3;
  const pbdScale = options?.scaleConfig ?? resolvePbdScale();

  // 1. PBD Check via configured scale order (NOT parsing digits directly)
  const currentLevel = findLevelInScale(current, pbdScale);
  if (currentLevel) {
    let targetLevel: PbdScaleLevel | null = null;
    if (target !== undefined && target !== null && target !== '') {
      targetLevel = findLevelInScale(target, pbdScale);
    } else {
      // Default: next level in scale order if available
      targetLevel = pbdScale.levels.find(l => l.order === currentLevel.order + 1) || null;
    }

    if (targetLevel) {
      const gap = targetLevel.order - currentLevel.order;
      if (gap === 1) {
        return {
          isNearMiss: true,
          distance: 1,
          targetDescription: `1 Tahap ke ${targetLevel.code}`,
          suggestedActionMs: `Fokus intervensi pengukuhan untuk melonjakkan ke ${targetLevel.code}.`,
          suggestedActionZh: `仅差1个掌握等级即可升至 ${targetLevel.code}，宜实施点对点攻坚。`,
        };
      }
      return {
        isNearMiss: false,
        distance: Math.max(0, gap),
        targetDescription: `Sasaran: ${targetLevel.code}`,
        suggestedActionMs: '',
        suggestedActionZh: '',
      };
    }

    return {
      isNearMiss: false,
      distance: 0,
      targetDescription: '',
      suggestedActionMs: '',
      suggestedActionZh: '',
    };
  }

  // 2. UASA Check
  const mark = typeof current === 'number' ? current : parseFloat(String(current));
  if (!isNaN(mark) && mark >= 0 && mark <= 100) {
    const boundaries: Array<{ grade: UasaGrade; mark: number }> = [
      { grade: 'E', mark: 20 },
      { grade: 'D', mark: 35 },
      { grade: 'C', mark: 50 },
      { grade: 'B', mark: 66 },
      { grade: 'A', mark: 82 },
    ];

    // Determine target threshold
    let nextBoundary: { grade: UasaGrade; mark: number } | null = null;
    if (options?.targetGrade && options.targetGrade in UASA_GRADE_STANDARDS) {
      const targetBoundary = UASA_GRADE_STANDARDS[options.targetGrade].minMark;
      if (mark < targetBoundary && (targetBoundary - mark) <= threshold) {
        return {
          isNearMiss: true,
          distance: targetBoundary - mark,
          targetDescription: `Jurang ${targetBoundary - mark} markah ke Gred ${options.targetGrade}`,
          suggestedActionMs: `Sangat berpotensi mencapai Gred ${options.targetGrade} dengan bimbingan terarah.`,
          suggestedActionZh: `距离目标 Gred ${options.targetGrade} 仅差 ${targetBoundary - mark} 分，属于高回报提分对象。`,
        };
      }
    }

    // Default: Check nearest upper grade boundary
    for (const b of boundaries) {
      if (mark < b.mark) {
        nextBoundary = b;
        break;
      }
    }

    if (nextBoundary) {
      const gap = nextBoundary.mark - mark;
      if (gap > 0 && gap <= threshold) {
        return {
          isNearMiss: true,
          distance: gap,
          targetDescription: `Jurang ${gap} markah ke Gred ${nextBoundary.grade} (${nextBoundary.mark}%)`,
          suggestedActionMs: `Bimbingan terfokus pada kertas peperiksaan boleh melonjakkan ke Gred ${nextBoundary.grade}.`,
          suggestedActionZh: `距下一等第 Gred ${nextBoundary.grade} 仅差 ${gap} 分，建议针对薄弱题型重点突破。`,
        };
      }
    }
  }

  return {
    isNearMiss: false,
    distance: 0,
    targetDescription: '',
    suggestedActionMs: '',
    suggestedActionZh: '',
  };
}

// ============================================================================
// 6. MISMATCH DEFINITION & DETECTION (SCALE-ORDER GAP BASED)
// ============================================================================

export interface MismatchResult {
  isMismatch: boolean;
  gap: number;
  detailsMs: string;
  detailsZh: string;
}

/**
 * Mismatch: Actual achievement is MATERIALLY below expected / targeted achievement.
 * Based on: Actual Performance vs Expected / Target Performance.
 * 
 * Finalized Rules:
 * - Scale gap = target.order - actual.order
 *   Scale gap = 0  → ON TRACK
 *   Scale gap = 1  → NEAR MISS
 *   Scale gap >= 2 → MISMATCH
 * 
 * Works for any configured scale (3-level, 6-level, etc.) via scale order.
 * - UASA: Actual is >= 2 grade bands below target (e.g. Target B vs Actual E).
 */
export function getMismatchStatus(
  actual: unknown, 
  target: unknown,
  options?: { scaleConfig?: PbdScaleConfig; uasaScaleConfig?: UasaScaleConfig }
): MismatchResult {
  if (actual === null || actual === undefined || target === null || target === undefined) {
    return { isMismatch: false, gap: 0, detailsMs: '', detailsZh: '' };
  }

  const pbdScale = options?.scaleConfig ?? resolvePbdScale();
  const actualLevel = findLevelInScale(actual, pbdScale);
  const targetLevel = findLevelInScale(target, pbdScale);

  // 1. PBD Evaluation via configured scale order
  if (actualLevel && targetLevel) {
    const scaleGap = calculateScaleGap(actual, target, pbdScale);
    if (scaleGap.status === 'MISMATCH') {
      return {
        isMismatch: true,
        gap: scaleGap.gap,
        detailsMs: `Jurang ketara: Sasaran ${targetLevel.code} vs Capaian Semasa ${actualLevel.code} (Jurang -${scaleGap.gap} tahap mengikut urutan skala).`,
        detailsZh: `显著落后预期：目标 ${targetLevel.code} 与实际 ${actualLevel.code} 存在 ${scaleGap.gap} 个量表层级缺口。`,
      };
    }
    return { isMismatch: false, gap: scaleGap.gap, detailsMs: '', detailsZh: '' };
  }

  // 2. UASA Evaluation (Grade tiers: A=6, B=5, C=4, D=3, E=2, F=1)
  const uasaScale = options?.uasaScaleConfig ?? resolveUasaScale();
  const actualG = getUasaGrade(actual);
  const targetG = typeof target === 'string' && uasaScale.grades.some(g => g.grade === target.toUpperCase())
    ? (target.toUpperCase() as UasaGrade) 
    : getUasaGrade(target);

  if (actualG && actualG !== 'TH' && targetG && targetG !== 'TH') {
    const actualGradeObj = uasaScale.grades.find(g => g.grade === actualG);
    const targetGradeObj = uasaScale.grades.find(g => g.grade === targetG);
    const actualRank = actualGradeObj?.order || 0;
    const targetRank = targetGradeObj?.order || 0;
    const gap = targetRank - actualRank;
    if (gap >= 2) {
      return {
        isMismatch: true,
        gap,
        detailsMs: `Percanggahan prestasi: Sasaran Gred ${targetG} vs Capaian Sebenar Gred ${actualG} (Jurang -${gap} gred).`,
        detailsZh: `实际成绩与目标存在显著断层：目标 ${targetG} vs 实际 ${actualG}（落后 ${gap} 个等第）。`,
      };
    }
  }

  return { isMismatch: false, gap: 0, detailsMs: '', detailsZh: '' };
}

// ============================================================================
// 7. INTERVENTION PRIORITY (CRITICAL → HIGH → WATCH → ON TRACK → EXCELLENT)
// ============================================================================

export type InterventionPriority = 
  | 'CRITICAL'   // Red result with major target gap
  | 'HIGH'       // Orange result or identified Mismatch
  | 'WATCH'      // Near Miss or Yellow UASA result
  | 'ON TRACK'   // Green result meeting target
  | 'EXCELLENT'; // Exceeding target / TP6 / strong A

export interface InterventionPriorityInfo {
  priority: InterventionPriority;
  semanticColor: AcademicSemanticColor;
  labelMs: string;
  labelZh: string;
  actionSummaryMs: string;
  actionSummaryZh: string;
  badgeClass: string;
}

export const INTERVENTION_PRIORITY_STANDARDS: Record<InterventionPriority, InterventionPriorityInfo> = {
  CRITICAL: {
    priority: 'CRITICAL',
    semanticColor: 'academicDanger',
    labelMs: 'KRITIKAL',
    labelZh: '特急 / 危机干预',
    actionSummaryMs: 'Wajib program pemulihan intensif segera dan intervensi bersemuka berkala.',
    actionSummaryZh: '列入校级重点扶困名单，由科委安排个别化辅导计划。',
    badgeClass: 'bg-rose-100 border-rose-300 text-rose-800 font-black ring-1 ring-rose-400',
  },
  HIGH: {
    priority: 'HIGH',
    semanticColor: 'academicWarning',
    labelMs: 'TINGGI',
    labelZh: '重点关注 / 需强化',
    actionSummaryMs: 'Modul bimbingan berfokus bagi mengelakkan kemerosotan berterusan.',
    actionSummaryZh: '安排专项巩固模块，定期跟踪作业与形成性测验。',
    badgeClass: 'bg-amber-100 border-amber-300 text-amber-900 font-extrabold',
  },
  WATCH: {
    priority: 'WATCH',
    semanticColor: 'academicCaution',
    labelMs: 'PANTAUAN',
    labelZh: '潜质跟踪 / 提分突破',
    actionSummaryMs: 'Tumpuan bimbingan sasaran bagi menjayakan lonjakan gred (Near Miss).',
    actionSummaryZh: '临界提分重点（Near Miss），加强考试技巧点拨可获显著飞跃。',
    badgeClass: 'bg-yellow-100 border-yellow-300 text-yellow-900 font-extrabold',
  },
  'ON TRACK': {
    priority: 'ON TRACK',
    semanticColor: 'academicSuccess',
    labelMs: 'DALAM LANDASAN',
    labelZh: '正常达标 / 稳步发展',
    actionSummaryMs: 'Mencapai sasaran pembelajaran dengan memuaskan, kekalkan momentum.',
    actionSummaryZh: '按教学计划稳步推进，保持良好学习态势。',
    badgeClass: 'bg-emerald-100 border-emerald-300 text-emerald-800 font-bold',
  },
  EXCELLENT: {
    priority: 'EXCELLENT',
    semanticColor: 'academicSuccess',
    labelMs: 'CEMERLANG',
    labelZh: '拔尖培优 / 榜样示范',
    actionSummaryMs: 'Program pengayaan dan bimbingan kebolehan aras tinggi (KBAT).',
    actionSummaryZh: '提供高阶思维挑战题与学科拓展，培养标杆学子。',
    badgeClass: 'bg-emerald-600 text-white font-black shadow-sm',
  },
};

/**
 * Determines intervention priority by synthesizing:
 * 1. Current achievement color/level
 * 2. Target gap (Mismatch vs On Track)
 * 3. Near Miss status
 * 4. Progression trajectory
 */
export function getInterventionPriority(
  current: unknown,
  target?: unknown,
  previous?: unknown,
  options?: { scaleConfig?: PbdScaleConfig; uasaScaleConfig?: UasaScaleConfig }
): InterventionPriorityInfo {
  const mismatch = getMismatchStatus(current, target, options);
  const nearMiss = getNearMissStatus(current, target, { scaleConfig: options?.scaleConfig });
  const progress = getProgressDirection(previous, current);

  const scale = options?.scaleConfig ?? resolvePbdScale();
  const currentLevel = findLevelInScale(current, scale);
  const isPbd = currentLevel !== null;

  const tpOrder = currentLevel ? currentLevel.order : null;
  const grade = !isPbd ? getUasaGrade(current) : null;
  const mark = (!isPbd && typeof current === 'number') ? current : parseFloat(String(current));

  // 1. EXCELLENT
  // High-performing student reaching maximum level in scale or Grade A >= 85
  const isMaxLevel = currentLevel ? currentLevel.order === scale.levels.length : false;
  if (isMaxLevel || (!isPbd && grade === 'A' && (!isNaN(mark) ? mark >= 85 : true))) {
    return INTERVENTION_PRIORITY_STANDARDS.EXCELLENT;
  }

  // 2. CRITICAL
  // Red result with major target gap (danger semantic status or UASA E / F significantly below target)
  const isRed = (currentLevel && currentLevel.semanticStatus === 'academicDanger') || (!isPbd && (grade === 'E' || grade === 'F'));
  if (isRed && (mismatch.isMismatch || progress.direction === 'DECLINED' || (currentLevel && currentLevel.order === 1) || (!isPbd && grade === 'F'))) {
    return INTERVENTION_PRIORITY_STANDARDS.CRITICAL;
  }

  // 3. HIGH
  // Orange result or identified Mismatch
  if (mismatch.isMismatch) {
    return INTERVENTION_PRIORITY_STANDARDS.HIGH;
  }
  const isOrange = (currentLevel && currentLevel.semanticStatus === 'academicWarning') || (!isPbd && grade === 'D');
  if (isOrange && !nearMiss.isNearMiss) {
    return INTERVENTION_PRIORITY_STANDARDS.HIGH;
  }
  if (isRed) {
    return INTERVENTION_PRIORITY_STANDARDS.HIGH;
  }

  // 4. WATCH
  // Near Miss or Yellow UASA result
  if (nearMiss.isNearMiss || (!isPbd && grade === 'C')) {
    return INTERVENTION_PRIORITY_STANDARDS.WATCH;
  }

  // 5. ON TRACK
  // Green result meeting expected target
  return INTERVENTION_PRIORITY_STANDARDS['ON TRACK'];
}

// ============================================================================
// 8. CHART PALETTES FOR RECHARTS / CHART.JS
// ============================================================================

export const PBD_CHART_PALETTE: Record<`TP${PbdLevel}`, string> = {
  TP1: '#EF4444', // Red-500 (academicDanger)
  TP2: '#F87171', // Red-400 (academicDanger)
  TP3: '#F97316', // Orange-500 (academicWarning)
  TP4: '#34D399', // Emerald-400 (academicSuccess)
  TP5: '#10B981', // Emerald-500 (academicSuccess)
  TP6: '#059669', // Emerald-600 (academicSuccess)
};

export const UASA_CHART_PALETTE: Record<UasaGrade, string> = {
  A: '#10B981', // Emerald-500 (academicSuccess)
  B: '#34D399', // Emerald-400 (academicSuccess)
  C: '#EAB308', // Yellow-500 (academicCaution)
  D: '#F97316', // Orange-500 (academicWarning)
  E: '#F87171', // Red-400 (academicDanger)
  F: '#EF4444', // Red-500 (academicDanger)
};

export const COMPARISON_SERIES_PALETTE = {
  baselineTov: '#94A3B8', // Slate-400
  currentAr: '#3B82F6',   // Blue-500
  targetEtr: '#8B5CF6',   // Purple-500
  previousYear: '#64748B',// Slate-500
  currentYear: '#2563EB', // Blue-600
};
