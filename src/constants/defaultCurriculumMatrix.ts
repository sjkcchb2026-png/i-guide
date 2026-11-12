/**
 * iSEPADU AI — Default Curriculum Allocation Matrix & Class Teachers
 * Complies with KPM Dual-Track (KP2027 & KSSR Semakan) standards.
 * Pre-populated with official SJK (C) Chung Hua Balingian teacher roster.
 */

import { SubjectAllocationRow } from '../components/Timetable/SchoolTimetableMatrix';

export function isGradeKP2027(yearStr: string, grade: number): boolean {
  const year = parseInt(yearStr, 10) || 2027;
  if (year < 2027) return false;
  const maxKP2027Grade = year - 2026;
  return grade <= maxKP2027Grade;
}

export function getDefaultClassTeachers(): Record<number, string> {
  return {
    1: 'SW',   // Stephanie Wong Eng Hee
    2: 'JW',   // Jenny Wong
    3: 'TKI',  // Tiong Ko Ing
    4: 'NCY',  // Ngu Chui Ying
    5: 'LCI',  // Lai Chin Ing
    6: 'LSC',  // Liew Shiao Ching
  };
}

export function buildDefaultCurriculumMatrix(yearStr: string): SubjectAllocationRow[] {
  const kp = (g: number) => isGradeKP2027(yearStr, g);

  return [
    // 1. Perhimpunan Rasmi (Tuesday W1)
    {
      id: 'pn',
      category: 'COMMON',
      subjectName: 'PERHIMPUNAN',
      subjectCode: 'PN',
      periods: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 },
      teachers: { 1: '', 2: '', 3: '', 4: '', 5: '', 6: '' },
    },
    // 2. Bahasa Cina (BC)
    {
      id: 'bc',
      category: 'COMMON',
      subjectName: 'BAHASA CINA',
      subjectCode: 'BC',
      periods: {
        1: 12,
        2: 12,
        3: kp(3) ? 9 : 12,
        4: kp(4) ? 9 : 10,
        5: kp(5) ? 7 : 10,
        6: kp(6) ? 7 : 10,
      },
      teachers: { 1: 'SW', 2: 'LSC', 3: 'LSC', 4: 'LCI', 5: 'LCI', 6: 'LCI' },
    },
    // 3. Bahasa Melayu (BM)
    {
      id: 'bm',
      category: 'COMMON',
      subjectName: 'BAHASA MELAYU',
      subjectCode: 'BM',
      periods: {
        1: 10,
        2: 10,
        3: kp(3) ? 9 : 10,
        4: kp(4) ? 9 : 8,
        5: kp(5) ? 7 : 8,
        6: kp(6) ? 7 : 8,
      },
      teachers: { 1: 'JW', 2: 'LMI', 3: 'LMI', 4: 'LRR', 5: 'LRR', 6: 'KL' },
    },
    // 4. Bahasa Inggeris (BI)
    {
      id: 'bi',
      category: 'COMMON',
      subjectName: 'BAHASA INGGERIS',
      subjectCode: 'BI',
      periods: {
        1: kp(1) ? 4 : 5,
        2: kp(2) ? 4 : 5,
        3: kp(3) ? 4 : 5,
        4: kp(4) ? 4 : 6,
        5: kp(5) ? 3 : 6,
        6: kp(6) ? 3 : 6,
      },
      teachers: { 1: 'DT', 2: 'DT', 3: 'DT', 4: 'DT', 5: 'DT', 6: 'DT' },
    },
    // 5. Matematik (MT)
    {
      id: 'mt',
      category: 'COMMON',
      subjectName: 'MATEMATIK',
      subjectCode: 'MT',
      periods: {
        1: kp(1) ? 7 : 6,
        2: kp(2) ? 7 : 6,
        3: 6,
        4: 6,
        5: 6,
        6: 6,
      },
      teachers: { 1: 'VY', 2: 'VY', 3: 'VY', 4: 'HHH', 5: 'HHH', 6: 'HHH' },
    },
    // 6. Pendidikan Moral (PM)
    {
      id: 'pm',
      category: 'COMMON',
      subjectName: 'PENDIDIKAN MORAL',
      subjectCode: 'PM',
      periods: {
        1: 4,
        2: 4,
        3: 4,
        4: kp(4) ? 4 : 5,
        5: kp(5) ? 4 : 5,
        6: kp(6) ? 4 : 5,
      },
      teachers: { 1: 'SW', 2: 'JW', 3: 'JW', 4: 'LCI', 5: 'LCI', 6: 'LSC' },
    },
    // 7. Pendidikan Islam (PAI) - Ustaz Muhammad Fahim Amar (MFA)
    {
      id: 'pai',
      category: 'COMMON',
      subjectName: 'PENDIDIKAN ISLAM',
      subjectCode: 'PAI',
      periods: {
        1: 4,
        2: 4,
        3: 4,
        4: kp(4) ? 4 : 5,
        5: kp(5) ? 4 : 5,
        6: kp(6) ? 4 : 5,
      },
      teachers: { 1: 'MFA', 2: 'MFA', 3: 'MFA', 4: 'MFA', 5: 'MFA', 6: 'MFA' },
    },
    // 8. Program Tasmik - Ustaz Muhammad Fahim Amar (MFA)
    {
      id: 'tasmik',
      category: 'COMMON',
      subjectName: 'PROGRAM TASMIK (SELEPAS SEKOLAH)',
      subjectCode: 'TASMIK',
      periods: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 },
      teachers: { 1: 'MFA', 2: 'MFA', 3: 'MFA', 4: 'MFA', 5: 'MFA', 6: 'MFA' },
    },
    // 9. Pendidikan Jasmani (PJ)
    {
      id: 'pj',
      category: 'COMMON',
      subjectName: 'PENDIDIKAN JASMANI',
      subjectCode: 'PJ',
      periods: {
        1: kp(1) ? 3 : 2,
        2: kp(2) ? 3 : 2,
        3: 2,
        4: 2,
        5: 2,
        6: 2,
      },
      teachers: { 1: 'TKI', 2: 'TKI', 3: 'TKI', 4: 'JW', 5: 'JW', 6: 'JW' },
    },
    // 10. Pendidikan Kesihatan (PK)
    {
      id: 'pk',
      category: 'COMMON',
      subjectName: 'PENDIDIKAN KESIHATAN',
      subjectCode: 'PK',
      periods: { 1: kp(1) ? 0 : 1, 2: kp(2) ? 0 : 1, 3: 1, 4: 1, 5: 1, 6: 1 },
      teachers: { 1: 'TKI', 2: 'TKI', 3: 'TKI', 4: 'JW', 5: 'JW', 6: 'JW' },
    },
    // 11. Muzik (MZ)
    {
      id: 'mz',
      category: 'COMMON',
      subjectName: 'PENDIDIKAN MUZIK',
      subjectCode: 'MZ',
      periods: { 1: kp(1) ? 0 : 1, 2: kp(2) ? 0 : 1, 3: 1, 4: 1, 5: 1, 6: 1 },
      teachers: { 1: 'LMI', 2: 'LMI', 3: 'LMI', 4: 'LRR', 5: 'LRR', 6: 'LRR' },
    },
    // 12. Seni Visual (PSV)
    {
      id: 'psv',
      category: 'COMMON',
      subjectName: 'PENDIDIKAN SENI VISUAL',
      subjectCode: 'PSV',
      periods: { 1: kp(1) ? 0 : 2, 2: kp(2) ? 0 : 2, 3: 2, 4: 2, 5: 2, 6: 2 },
      teachers: { 1: 'NCY', 2: 'NCY', 3: 'NCY', 4: 'KL', 5: 'KL', 6: 'KL' },
    },
    // 13. Alam dan Manusia (AM) - KP2027 Tahap I Co-Teaching (Guru 1 & Guru 2)
    {
      id: 'am',
      category: 'KP2027_ONLY',
      subjectName: 'ALAM DAN MANUSIA: PEMBELAJARAN BERSEPADU',
      subjectCode: 'AM',
      periods: { 1: kp(1) ? 3 : 0, 2: kp(2) ? 3 : 0, 3: 0, 4: 0, 5: 0, 6: 0 },
      teachers: { 1: 'NCY', 2: 'NCY', 3: '', 4: '', 5: '', 6: '' },
      secondaryTeachers: { 1: 'VY', 2: 'VY', 3: '', 4: '', 5: '', 6: '' },
    },
    // 14. Sains (SN)
    {
      id: 'sn',
      category: 'COMMON',
      subjectName: 'SAINS',
      subjectCode: 'SN',
      periods: { 1: kp(1) ? 0 : 3, 2: kp(2) ? 0 : 3, 3: 3, 4: 4, 5: 4, 6: 4 },
      teachers: { 1: 'NCY', 2: 'NCY', 3: 'NCY', 4: 'NCY', 5: 'NCY', 6: 'NCY' },
    },
    // 14. Sejarah (SEJ)
    {
      id: 'sej',
      category: 'KSSR_LEGACY',
      subjectName: 'SEJARAH',
      subjectCode: 'SEJ',
      periods: { 1: 0, 2: 0, 3: 0, 4: 2, 5: 2, 6: 2 },
      teachers: { 1: '', 2: '', 3: '', 4: 'LCI', 5: 'LCI', 6: 'LCI' },
    },
    // 15. Reka Bentuk & Teknologi (RBT)
    {
      id: 'rbt',
      category: 'KSSR_LEGACY',
      subjectName: 'REKA BENTUK & TEKNOLOGI',
      subjectCode: 'RBT',
      periods: { 1: 0, 2: 0, 3: 0, 4: 2, 5: 2, 6: 2 },
      teachers: { 1: '', 2: '', 3: '', 4: 'VY', 5: 'VY', 6: 'VY' },
    },
    // 16. Program Pembentukan Karakter (PKAR Isnin - Jumaat, Tahun 1 Sahaja)
    {
      id: 'pkar_1',
      category: 'KP2027_ONLY',
      subjectName: 'PROGRAM PEMBENTUKAN KARAKTER (ISNIN)',
      subjectCode: 'PKAR_1',
      periods: { 1: kp(1) ? 0.5 : 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
      teachers: { 1: 'SW', 2: '', 3: '', 4: '', 5: '', 6: '' },
    },
    {
      id: 'pkar_2',
      category: 'KP2027_ONLY',
      subjectName: 'PROGRAM PEMBENTUKAN KARAKTER (SELASA)',
      subjectCode: 'PKAR_2',
      periods: { 1: kp(1) ? 0.5 : 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
      teachers: { 1: 'SW', 2: '', 3: '', 4: '', 5: '', 6: '' },
    },
    {
      id: 'pkar_3',
      category: 'KP2027_ONLY',
      subjectName: 'PROGRAM PEMBENTUKAN KARAKTER (RABU)',
      subjectCode: 'PKAR_3',
      periods: { 1: kp(1) ? 0.5 : 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
      teachers: { 1: 'SW', 2: '', 3: '', 4: '', 5: '', 6: '' },
    },
    {
      id: 'pkar_4',
      category: 'KP2027_ONLY',
      subjectName: 'PROGRAM PEMBENTUKAN KARAKTER (KHAMIS)',
      subjectCode: 'PKAR_4',
      periods: { 1: kp(1) ? 0.5 : 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
      teachers: { 1: 'SW', 2: '', 3: '', 4: '', 5: '', 6: '' },
    },
    {
      id: 'pkar_5',
      category: 'KP2027_ONLY',
      subjectName: 'PROGRAM PEMBENTUKAN KARAKTER (JUMAAT)',
      subjectCode: 'PKAR_5',
      periods: { 1: kp(1) ? 0.5 : 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
      teachers: { 1: 'SW', 2: '', 3: '', 4: '', 5: '', 6: '' },
    },
  ];
}
