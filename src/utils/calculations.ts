/**
 * iSEPADU AI — Academic Calculations Compatibility Wrapper
 * Forwards all grading and mastery logic to the centralized Academic Visual Standard.
 */

import {
  getUasaGrade,
  getUasaGradeInterpretation,
  normalizeTp,
  getPbdStatus,
  PbdLevel,
  UasaGrade,
} from './academicVisualStandard';

/**
 * Calculates official UASA Grade from raw numeric mark or string mark.
 */
export function calculateGrade(marks: number | string | null | undefined): string {
  const g = getUasaGrade(marks);
  return g || '';
}

/**
 * Calculates PBD mastery status / description based on TP level.
 */
export function calculateMastery(tp: number | string | null | undefined): string {
  const norm = normalizeTp(tp);
  if (!norm) return '';
  const info = getPbdStatus(norm);
  return info ? info.meaningMs : '';
}

export {
  getUasaGrade,
  getUasaGradeInterpretation,
  normalizeTp,
  getPbdStatus,
};
