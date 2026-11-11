/**
 * iSEPADU AI — KP2027 Default Subject Configurations
 * Includes 5-day split for Program Pembentukan Karakter (PKAR)
 */

export interface PKARSubjectConfig {
  code: string;
  name: string;
  shortName: string;
  curriculum: string;
  defaultPeriods: number;
  dayLocked: string;
  durationMinutes: number;
}

export const KP2027_PKAR_SUBJECTS: PKARSubjectConfig[] = [
  {
    code: 'PKAR_1',
    name: 'Program Pembentukan Karakter (Isnin)',
    shortName: 'PKAR (Isnin)',
    curriculum: 'KP2027',
    defaultPeriods: 0.5,
    dayLocked: 'ISNIN',
    durationMinutes: 15,
  },
  {
    code: 'PKAR_2',
    name: 'Program Pembentukan Karakter (Selasa)',
    shortName: 'PKAR (Selasa)',
    curriculum: 'KP2027',
    defaultPeriods: 0.5,
    dayLocked: 'SELASA',
    durationMinutes: 15,
  },
  {
    code: 'PKAR_3',
    name: 'Program Pembentukan Karakter (Rabu)',
    shortName: 'PKAR (Rabu)',
    curriculum: 'KP2027',
    defaultPeriods: 0.5,
    dayLocked: 'RABU',
    durationMinutes: 15,
  },
  {
    code: 'PKAR_4',
    name: 'Program Pembentukan Karakter (Khamis)',
    shortName: 'PKAR (Khamis)',
    curriculum: 'KP2027',
    defaultPeriods: 0.5,
    dayLocked: 'KHAMIS',
    durationMinutes: 15,
  },
  {
    code: 'PKAR_5',
    name: 'Program Pembentukan Karakter (Jumaat)',
    shortName: 'PKAR (Jumaat)',
    curriculum: 'KP2027',
    defaultPeriods: 0.5,
    dayLocked: 'JUMAAT',
    durationMinutes: 15,
  },
];
