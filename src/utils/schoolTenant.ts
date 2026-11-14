/**
 * Multi-School (Multi-Tenant) Isolation Utilities
 *
 * CRITICAL MIGRATION / FALLBACK RULE:
 * Any legacy Firestore record that does not have a `schoolCode` (or `schoolId`)
 * field is treated as belonging to `'YCC3404'` (SJK (C) CHUNG HUA BALINGIAN)
 * so zero existing data is lost or hidden for YCC3404.
 */

export const DEFAULT_SCHOOL_CODE = 'YCC3404';
export const DEFAULT_SCHOOL_NAME = 'SJK (C) CHUNG HUA BALINGIAN';
export const DEFAULT_SCHOOL_SLOGAN = 'Sistem Pengurusan Sekolah Bersepadu';

let runtimeActiveSchoolCode = DEFAULT_SCHOOL_CODE;

export function setRuntimeActiveSchoolCode(code?: string | null): void {
  const clean = sanitizeSchoolCodeInput(code);
  runtimeActiveSchoolCode = clean || DEFAULT_SCHOOL_CODE;
}

export function getRuntimeActiveSchoolCode(): string {
  return runtimeActiveSchoolCode || DEFAULT_SCHOOL_CODE;
}

export function sanitizeSchoolCodeInput(code?: string | null): string {
  if (!code || typeof code !== 'string') return '';
  return code.trim().replace(/\s+/g, '').toUpperCase();
}

export function isValidSchoolCode(code?: string | null): boolean {
  const clean = sanitizeSchoolCodeInput(code);
  return /^[A-Z0-9_-]{3,20}$/.test(clean);
}

export function resolveRecordSchoolCode(
  record?: ({ schoolCode?: string | null; schoolId?: string | null } & Record<string, any>) | null
): string {
  const explicit = sanitizeSchoolCodeInput(record?.schoolCode || record?.schoolId);
  return explicit || DEFAULT_SCHOOL_CODE;
}

export function isLegacyDefaultSchool(schoolCode?: string | null): boolean {
  const clean = sanitizeSchoolCodeInput(schoolCode);
  return !clean || clean === DEFAULT_SCHOOL_CODE;
}

export function normalizeActiveSchoolCode(schoolCode?: string | null): string {
  return sanitizeSchoolCodeInput(schoolCode) || DEFAULT_SCHOOL_CODE;
}

export function belongsToSchool(
  record: ({ schoolCode?: string | null; schoolId?: string | null } & Record<string, any>) | null | undefined,
  activeSchoolCode?: string | null
): boolean {
  const target = normalizeActiveSchoolCode(activeSchoolCode);
  return resolveRecordSchoolCode(record) === target;
}

export function filterBySchool<T extends Record<string, any>>(
  items: T[],
  activeSchoolCode?: string | null
): T[] {
  const target = normalizeActiveSchoolCode(activeSchoolCode);
  return items.filter((item) => resolveRecordSchoolCode(item) === target);
}

/**
 * Generates deterministic document IDs that preserve legacy IDs for YCC3404
 * while preventing cross-school collisions for all other schools.
 */
export function scopedDocId(schoolCode: string | null | undefined, baseId: string): string {
  const target = normalizeActiveSchoolCode(schoolCode);
  if (target === DEFAULT_SCHOOL_CODE) return baseId;
  const prefix = `${target}__`;
  return baseId.startsWith(prefix) ? baseId : `${prefix}${baseId}`;
}

export function withSchoolCode<T extends Record<string, any>>(
  data: T,
  schoolCode?: string | null
): T & { schoolCode: string } {
  return {
    ...data,
    schoolCode: normalizeActiveSchoolCode(schoolCode || data.schoolCode),
  };
}
