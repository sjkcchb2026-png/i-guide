import { SubjectAllocationRow } from '../components/Timetable/SchoolTimetableMatrix';
import {
  DayOfWeek,
  DAYS_OF_WEEK,
  ScheduleGrid,
  TimetableCell,
  getGradeDaySlots,
} from '../components/Timetable/types';

export interface TeacherDirectoryEntry {
  id: string;
  num: number;
  code: string;
  name: string;
  isGuruPemulihan?: boolean;
}

export interface OptionAColumnDef {
  colIndex: number; // 1..12 (excluding Day column)
  slotId: string; // 'W1'..'W5', 'REHAT', 'W6'..'W11'
  headerLabel: string; // e.g. 'W1', 'W6 (T1:W5)', 'REHAT'
  periodLabel: string;
  t2To6Time: string;
  displayTime: string; // Spaced clock format e.g. '07:15 - 07:45'
  t1ShiftedTime?: string; // Present on Cols 1..5
  t1BracketTime?: string; // '[07:30-08:00]' etc. on Cols 1..4
  isPreRecess: boolean;
  isRecess: boolean;
  isPKARColumn?: boolean;
}

export const OPTION_A_COLUMNS: OptionAColumnDef[] = [
  {
    colIndex: 1,
    slotId: 'W1',
    headerLabel: 'W1',
    periodLabel: '1',
    t2To6Time: '07:15-07:45',
    displayTime: '07:15 - 07:45',
    t1ShiftedTime: '(T1: 07:30 - 08:00)',
    t1BracketTime: '[07:30-08:00]',
    isPreRecess: true,
    isRecess: false,
  },
  {
    colIndex: 2,
    slotId: 'W2',
    headerLabel: 'W2',
    periodLabel: '2',
    t2To6Time: '07:45-08:15',
    displayTime: '07:45 - 08:15',
    t1ShiftedTime: '(T1: 08:00 - 08:30)',
    t1BracketTime: '[08:00-08:30]',
    isPreRecess: true,
    isRecess: false,
  },
  {
    colIndex: 3,
    slotId: 'W3',
    headerLabel: 'W3',
    periodLabel: '3',
    t2To6Time: '08:15-08:45',
    displayTime: '08:15 - 08:45',
    t1ShiftedTime: '(T1: 08:30 - 09:00)',
    t1BracketTime: '[08:30-09:00]',
    isPreRecess: true,
    isRecess: false,
  },
  {
    colIndex: 4,
    slotId: 'W4',
    headerLabel: 'W4',
    periodLabel: '4',
    t2To6Time: '08:45-09:15',
    displayTime: '08:45 - 09:15',
    t1ShiftedTime: '(T1: 09:00 - 09:30)',
    t1BracketTime: '[09:00-09:30]',
    isPreRecess: true,
    isRecess: false,
  },
  {
    colIndex: 5,
    slotId: 'W5',
    headerLabel: 'W5',
    periodLabel: '5',
    t2To6Time: '09:15-09:45',
    displayTime: '09:15 - 09:45',
    t1ShiftedTime: '(T1: PKAR 09:30 - 09:45)',
    isPreRecess: true,
    isRecess: false,
    isPKARColumn: true,
  },
  {
    colIndex: 6,
    slotId: 'REHAT',
    headerLabel: 'REHAT',
    periodLabel: 'REHAT',
    t2To6Time: '09:45-10:15',
    displayTime: '09:45 - 10:15',
    isPreRecess: false,
    isRecess: true,
  },
  {
    colIndex: 7,
    slotId: 'W6',
    headerLabel: 'W6 (T1:W5)',
    periodLabel: '6',
    t2To6Time: '10:15-10:45',
    displayTime: '10:15 - 10:45',
    isPreRecess: false,
    isRecess: false,
  },
  {
    colIndex: 8,
    slotId: 'W7',
    headerLabel: 'W7 (T1:W6)',
    periodLabel: '7',
    t2To6Time: '10:45-11:15',
    displayTime: '10:45 - 11:15',
    isPreRecess: false,
    isRecess: false,
  },
  {
    colIndex: 9,
    slotId: 'W8',
    headerLabel: 'W8 (T1:W7)',
    periodLabel: '8',
    t2To6Time: '11:15-11:45',
    displayTime: '11:15 - 11:45',
    isPreRecess: false,
    isRecess: false,
  },
  {
    colIndex: 10,
    slotId: 'W9',
    headerLabel: 'W9 (T1:W8)',
    periodLabel: '9',
    t2To6Time: '11:45-12:15',
    displayTime: '11:45 - 12:15',
    isPreRecess: false,
    isRecess: false,
  },
  {
    colIndex: 11,
    slotId: 'W10',
    headerLabel: 'W10 (T1:W9)',
    periodLabel: '10',
    t2To6Time: '12:15-12:45',
    displayTime: '12:15 - 12:45',
    isPreRecess: false,
    isRecess: false,
  },
  {
    colIndex: 12,
    slotId: 'W11',
    headerLabel: 'W11 (T1:W10)',
    periodLabel: '11',
    t2To6Time: '12:45-13:15',
    displayTime: '12:45 - 13:15',
    isPreRecess: false,
    isRecess: false,
  },
];

export const REHAT_VERTICAL_LETTER: Record<DayOfWeek, string> = {
  ISNIN: 'R',
  SELASA: 'E',
  RABU: 'H',
  KHAMIS: 'A',
  JUMAAT: 'T',
};

export const SUBJECT_FULL_NAMES: Record<string, string> = {
  PN: 'PERHIMPUNAN RASMI',
  BC: 'BAHASA CINA',
  BM: 'BAHASA MELAYU',
  BI: 'BAHASA INGGERIS',
  MT: 'MATEMATIK',
  PM: 'PENDIDIKAN MORAL',
  PAI: 'PENDIDIKAN ISLAM',
  'PM/PAI': 'PENDIDIKAN MORAL / ISLAM',
  PJ: 'PENDIDIKAN JASMANI',
  PK: 'PENDIDIKAN KESIHATAN',
  SN: 'SAINS',
  SEJ: 'SEJARAH',
  RBT: 'REKA BENTUK & TEKNOLOGI',
  PSV: 'PENDIDIKAN SENI VISUAL',
  MZ: 'PENDIDIKAN MUZIK',
  AM: 'ALAM DAN MANUSIA',
  ESD: 'EKSPLORASI SENI & DUNIA',
  EST: 'EKSPLORASI SAINS & TEKNOLOGI',
  TD: 'TEKNOLOGI & DIGITAL',
  PKAR: 'PROGRAM PEMBENTUKAN KARAKTER',
  MEMBACA: 'PROGRAM MEMBACA',
  TASMIK: 'PROGRAM TASMIK',
  PBM: 'PEMULIHAN BAHASA MELAYU',
  PMT: 'PEMULIHAN MATEMATIK',
  KLIBM: 'KLINIK BAHASA MELAYU',
  KLIBI: 'KLINIK BAHASA INGGERIS',
  KLIBC: 'KLINIK BAHASA CINA',
  KLIMT: 'KLINIK MATEMATIK',
};

export function getSubjectFullName(code: string, fallbackName?: string): string {
  const clean = (code || '').trim().toUpperCase();
  if (SUBJECT_FULL_NAMES[clean]) return SUBJECT_FULL_NAMES[clean];
  if (fallbackName && fallbackName.trim()) return fallbackName.trim().toUpperCase();
  return clean || '-';
}

export function formatKemaskiniDate(date: Date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export function formatPenggalSesi(academicYear: string): string {
  const clean = (academicYear || '2027').trim();
  const yr = parseInt(clean, 10);
  if (!isNaN(yr) && clean === '2026') {
    return 'SESI 2026/2027';
  }
  return `SESI ${clean}`;
}

export function parseTeacherCodes(teacherCode?: string | null): string[] {
  if (!teacherCode) return [];
  return teacherCode
    .split('/')
    .map((c) => c.trim())
    .filter(Boolean);
}

export function getDesignatedPemulihanTeacherCode(
  teacherList?: TeacherDirectoryEntry[]
): string {
  if (!Array.isArray(teacherList)) return '';
  const found = teacherList.find((t) => Boolean(t.isGuruPemulihan));
  return found ? found.code.trim().toUpperCase() : '';
}

export function resolveCellPemulihanTeacher(
  cell: TimetableCell | null | undefined,
  designatedPemulihanCode?: string
): string {
  if (!cell || !cell.isPemulihan) return '';
  if (cell.pemulihanManualOverride && cell.pemulihanTeacherCode?.trim()) {
    return cell.pemulihanTeacherCode.trim().toUpperCase();
  }
  const designated = (designatedPemulihanCode || '').trim().toUpperCase();
  if (designated) return designated;
  return (cell.pemulihanTeacherCode || '').trim().toUpperCase();
}

export function getAllCellTeacherCodes(
  cell: TimetableCell | null | undefined,
  designatedPemulihanCode?: string
): string[] {
  if (!cell) return [];
  const codes = new Set<string>(parseTeacherCodes(cell.teacherCode));
  const pemCode = resolveCellPemulihanTeacher(cell, designatedPemulihanCode);
  if (pemCode) {
    parseTeacherCodes(pemCode).forEach((c) => codes.add(c));
  }
  return Array.from(codes);
}

export function hydrateSchedulePemulihanLinks(
  grid: ScheduleGrid,
  designatedPemulihanCode?: string
): ScheduleGrid {
  const designated = (designatedPemulihanCode || '').trim().toUpperCase();
  if (!designated) return grid;
  [1, 2, 3, 4, 5, 6].forEach((grade) => {
    DAYS_OF_WEEK.forEach((day) => {
      const daySlots = grid[grade]?.[day];
      if (!daySlots) return;
      Object.values(daySlots).forEach((cell) => {
        if (!cell) return;
        const sCode = (cell.subjectCode || '').trim().toUpperCase();
        if (cell.isPemulihan && !cell.pemulihanManualOverride) {
          cell.pemulihanTeacherCode = designated;
        } else if ((sCode === 'KLIBM' || sCode === 'KLIMT' || sCode === 'PBM' || sCode === 'PMT') && !cell.teacherCode?.trim()) {
          cell.teacherCode = designated;
        }
      });
    });
  });
  return grid;
}

export function isKP2027Year1Active(academicYear?: string): boolean {
  if (!academicYear) return true;
  const yr = parseInt(academicYear, 10);
  return isNaN(yr) || yr >= 2027;
}

export interface OptionACellEntry {
  grade: number;
  gradeLabel?: string;
  subjectCode: string;
  subjectName: string;
  time: string;
  periodLength: number;
  isYear1Morning?: boolean; // Cols 1..4 on Tahun 1 -> #FEF9C3 + [HH:MM-HH:MM] in #B45309
  year1ClockBracket?: string;
  isPKAR?: boolean; // Col 5 on Tahun 1 -> #DCFCE7 + '09:30-09:45 (+0.5 Waktu)' in #15803D
  isPN?: boolean;
  isTasmik?: boolean;
  isPemulihanSlot?: boolean; // Linked PBM / PMT slot for Guru Pemulihan Khas
  hasMembacaT1?: boolean; // Top badge on Col 1: e.g. 'MEMBACA T.1 [07:15-07:30]' or 'AGAMA T.1 [07:15-07:30]'
  membacaLabel?: string; // Dynamic customized label for Year 1 07:15-07:30 morning program badge
}

export interface LampiranBAnalysisRow {
  bil: number;
  subjectCode: string;
  subjectFullName: string;
  mataPelajaranLabel: string; // e.g. 'BC - BAHASA CINA'
  grade: number;
  kelasLabel: string; // e.g. 'Tahun 1' or 'SEMUA'
  bilWaktu: number;
  minit: number;
}

export interface TeacherOptionABundle {
  grid: Record<DayOfWeek, Record<string, OptionACellEntry | null>>;
  daily: Record<DayOfWeek, number>;
  totalWaktu: number;
  totalMinit: number;
  subjectCounts: Record<string, number>;
  taughtGradesLabel: string;
  daysOver7: number;
  daysOver8: number;
  analysisRows: LampiranBAnalysisRow[];
}

function resolveTeacherSubjectForCell(
  teacherCode: string,
  cellSubjectCode: string,
  cellSubjectName: string,
  cellTeacherCode: string
): { code: string; name: string } {
  const upperCode = (cellSubjectCode || '').trim().toUpperCase();
  if (upperCode === 'PM/PAI') {
    const parts = parseTeacherCodes(cellTeacherCode);
    const idx = parts.indexOf(teacherCode);
    if (teacherCode === 'MFA' || (parts.length >= 2 && idx === 1)) {
      return { code: 'PAI', name: 'PENDIDIKAN ISLAM' };
    }
    if (parts.length >= 2 && idx === 0) {
      return { code: 'PM', name: 'PENDIDIKAN MORAL' };
    }
  }
  return {
    code: upperCode,
    name: getSubjectFullName(upperCode, cellSubjectName),
  };
}

/**
 * Builds the exact Option A Teacher Personal Timetable matrix and Lampiran B Analysis table.
 */
export function buildTeacherOptionAMatrix(
  schedule: ScheduleGrid,
  teacherCode: string,
  academicYear: string = '2027',
  guruPemulihanCode?: string
): TeacherOptionABundle {
  const tCode = (teacherCode || '').trim().toUpperCase();
  const isT1Shifted = isKP2027Year1Active(academicYear);

  const grid: Record<DayOfWeek, Record<string, OptionACellEntry | null>> = {
    ISNIN: {},
    SELASA: {},
    RABU: {},
    KHAMIS: {},
    JUMAAT: {},
  };

  const daily: Record<DayOfWeek, number> = {
    ISNIN: 0,
    SELASA: 0,
    RABU: 0,
    KHAMIS: 0,
    JUMAAT: 0,
  };

  const analysisMap = new Map<
    string,
    {
      subjectCode: string;
      subjectFullName: string;
      grade: number;
      kelasLabel: string;
      bilWaktu: number;
    }
  >();

  const recordAnalysis = (
    subjectCode: string,
    subjectFullName: string,
    grade: number,
    kelasLabel: string,
    periodLength: number
  ) => {
    const key = `${grade}__${subjectCode}`;
    const existing = analysisMap.get(key);
    if (existing) {
      existing.bilWaktu += periodLength;
    } else {
      analysisMap.set(key, {
        subjectCode,
        subjectFullName,
        grade,
        kelasLabel,
        bilWaktu: periodLength,
      });
    }
  };

  const taughtGrades = new Set<number>();

  DAYS_OF_WEEK.forEach((day) => {
    // Initialize all 11 teaching columns cleanly
    OPTION_A_COLUMNS.filter((c) => !c.isRecess).forEach((c) => {
      grid[day][c.slotId] = null;
    });

    if (!tCode) return;

    // 1. Compulsory PN assembly on SELASA W1 (+1.0 period = 30 mins)
    if (day === 'SELASA') {
      grid['SELASA']['W1'] = {
        grade: 0,
        gradeLabel: 'SEMUA',
        subjectCode: 'PN',
        subjectName: 'PERHIMPUNAN RASMI',
        time: '07:15-07:45',
        periodLength: 1,
        isPN: true,
      };
      daily['SELASA'] += 1;
      recordAnalysis('PN', 'PERHIMPUNAN RASMI', 0, 'SEMUA', 1);
    }

    // 2. Check Year 1 Morning Program (07:15-07:30 slotId 'MEMBACA', customizable e.g. Program Membaca / Program Agama)
    let hasMembacaT1Today = false;
    let membacaBadgeText = 'MEMBACA T.1 [07:15-07:30]';
    if (isT1Shifted) {
      const membCell = schedule[1]?.[day]?.['MEMBACA'];
      if (membCell && parseTeacherCodes(membCell.teacherCode).includes(tCode)) {
        hasMembacaT1Today = true;
        const mLen = membCell.periodLength ?? 0.5;
        const customCode = (membCell.subjectCode || 'MEMBACA').trim().toUpperCase();
        const customName =
          membCell.subjectName && membCell.subjectName.trim()
            ? membCell.subjectName.trim().toUpperCase()
            : getSubjectFullName(customCode, 'PROGRAM MEMBACA');
        membacaBadgeText = `${customCode} T.1 [07:15-07:30]`;
        daily[day] += mLen;
        taughtGrades.add(1);
        recordAnalysis(customCode, customName, 1, 'Tahun 1', mLen);
      }
    }

    // 3. Scan Grades 1..6 regular slots (plus Friday / post-school Tasmik if within teacher's schedule)
    const extraTasmikRecordedToday = new Set<string>();

    [1, 2, 3, 4, 5, 6].forEach((grade) => {
      const gradeSlots = getGradeDaySlots(grade, day, academicYear);
      gradeSlots.forEach((gs) => {
        if (gs.isRecess || gs.slotId === 'PKAR' || gs.slotId === 'MEMBACA') return;
        const cell = schedule[grade]?.[day]?.[gs.slotId];
        if (!cell || !cell.subjectCode || cell.subjectCode.toUpperCase() === 'PN') return;

        const mainstreamMatch = parseTeacherCodes(cell.teacherCode).includes(tCode);
        const pemulihanTeacher = resolveCellPemulihanTeacher(cell, guruPemulihanCode);
        const pemulihanMatch = Boolean(cell.isPemulihan && pemulihanTeacher === tCode && !mainstreamMatch);

        if (!mainstreamMatch && !pemulihanMatch) return;

        const baseUpper = (cell.subjectCode || '').trim().toUpperCase();
        const { code: subjCode, name: subjName } = pemulihanMatch
          ? {
              code: baseUpper === 'MT' ? 'PMT' : 'PBM',
              name:
                baseUpper === 'MT'
                  ? 'PEMULIHAN MATEMATIK'
                  : 'PEMULIHAN BAHASA MELAYU',
            }
          : resolveTeacherSubjectForCell(
              tCode,
              cell.subjectCode,
              cell.subjectName,
              cell.teacherCode
            );
        const len = cell.periodLength ?? 1;

        // Handle Tasmik (post-school or Friday slot)
        if (gs.slotId === 'TASMIK' || subjCode === 'TASMIK') {
          const tasmikKey = `${day}_${gs.startMinutes}_${subjCode}`;
          if (!extraTasmikRecordedToday.has(tasmikKey)) {
            extraTasmikRecordedToday.add(tasmikKey);
            daily[day] += len;
          }
          taughtGrades.add(grade);
          recordAnalysis('TASMIK', 'PROGRAM TASMIK', grade, `Tahun ${grade}`, len);

          // If Tasmik coincides with one of the 12-col post-recess times (e.g. Friday 11:15-11:45 / 11:45-12:15), show in grid if empty
          const matchedCol = OPTION_A_COLUMNS.find(
            (c) => !c.isRecess && c.t2To6Time === `${gs.startTime}-${gs.endTime}`
          );
          if (matchedCol && !grid[day][matchedCol.slotId]) {
            grid[day][matchedCol.slotId] = {
              grade,
              subjectCode: 'TASMIK',
              subjectName: 'PROGRAM TASMIK',
              time: `${gs.startTime}-${gs.endTime}`,
              periodLength: len,
              isTasmik: true,
            };
          }
          return;
        }

        // Map Grade 1 post-recess slots W5..W10 -> Cols W6..W11
        let colSlotId = gs.slotId;
        if (grade === 1 && isT1Shifted) {
          if (gs.slotId === 'W5') colSlotId = 'W6';
          else if (gs.slotId === 'W6') colSlotId = 'W7';
          else if (gs.slotId === 'W7') colSlotId = 'W8';
          else if (gs.slotId === 'W8') colSlotId = 'W9';
          else if (gs.slotId === 'W9') colSlotId = 'W10';
          else if (gs.slotId === 'W10') colSlotId = 'W11';
        }

        const isY1MorningCol =
          grade === 1 && isT1Shifted && ['W1', 'W2', 'W3', 'W4'].includes(gs.slotId);
        const colDef = OPTION_A_COLUMNS.find((c) => c.slotId === colSlotId);

        const prevEntry = grid[day][colSlotId];
        grid[day][colSlotId] = {
          grade,
          subjectCode: subjCode,
          subjectName: subjName,
          time: `${gs.startTime}-${gs.endTime}`,
          periodLength: len,
          isYear1Morning: isY1MorningCol,
          year1ClockBracket: isY1MorningCol
            ? colDef?.t1BracketTime || `[${gs.startTime}-${gs.endTime}]`
            : undefined,
          isPemulihanSlot: pemulihanMatch || subjCode === 'PBM' || subjCode === 'PMT',
          hasMembacaT1: colSlotId === 'W1' ? (prevEntry?.hasMembacaT1 || hasMembacaT1Today) : undefined,
          membacaLabel:
            colSlotId === 'W1' && (prevEntry?.hasMembacaT1 || hasMembacaT1Today)
              ? prevEntry?.membacaLabel || membacaBadgeText
              : undefined,
        };

        daily[day] += len;
        taughtGrades.add(grade);
        recordAnalysis(subjCode, subjName, grade, `Tahun ${grade}`, len);
      });
    });

    // Attach Morning Program T.1 badge onto Col 1 (W1) even if teacher doesn't teach W1 (or already has PN/lesson)
    if (hasMembacaT1Today) {
      const w1Existing = grid[day]['W1'];
      if (w1Existing) {
        w1Existing.hasMembacaT1 = true;
        w1Existing.membacaLabel = membacaBadgeText;
      } else {
        grid[day]['W1'] = {
          grade: 1,
          subjectCode: '',
          subjectName: '',
          time: '07:15-07:30',
          periodLength: 0,
          hasMembacaT1: true,
          membacaLabel: membacaBadgeText,
        };
      }
    }

    // 4. Auto-populate Col 5 (W5 column) with PKAR (T.1) (+0.5 Waktu) whenever:
    //    - teacher teaches Tahun 1 W4 (Col 4) on this day, OR
    //    - schedule[1][day]['PKAR'] explicitly lists this teacherCode.
    if (isT1Shifted) {
      const y1W4 = schedule[1]?.[day]?.['W4'];
      const y1Pkar = schedule[1]?.[day]?.['PKAR'];
      const w4Assigned =
        y1W4 &&
        y1W4.subjectCode?.toUpperCase() !== 'PN' &&
        parseTeacherCodes(y1W4.teacherCode).includes(tCode);
      const pkarAssigned =
        y1Pkar && parseTeacherCodes(y1Pkar.teacherCode).includes(tCode);

      if (w4Assigned || pkarAssigned) {
        const pkarLen = y1Pkar?.periodLength ?? 0.5;
        grid[day]['W5'] = {
          grade: 1,
          gradeLabel: 'T.1',
          subjectCode: 'PKAR',
          subjectName: 'PROGRAM PEMBENTUKAN KARAKTER',
          time: '09:30-09:45',
          periodLength: pkarLen,
          isPKAR: true,
        };
        daily[day] += pkarLen;
        taughtGrades.add(1);
        recordAnalysis('PKAR', 'PROGRAM PEMBENTUKAN KARAKTER', 1, 'Tahun 1', pkarLen);
      }
    }
  });

  // Summarize weekly totals & subjectCounts
  const subjectCounts: Record<string, number> = {};
  let totalWaktu = 0;
  let totalMinit = 0;

  const analysisRows: LampiranBAnalysisRow[] = Array.from(analysisMap.values())
    .sort((a, b) => {
      if (a.grade !== b.grade) {
        if (a.grade === 0) return 1; // Place PN last or keep neat order
        if (b.grade === 0) return -1;
        return a.grade - b.grade;
      }
      return a.subjectCode.localeCompare(b.subjectCode);
    })
    .map((item, idx) => {
      const roundedWaktu = Math.round(item.bilWaktu * 10) / 10;
      const minit = Math.round(roundedWaktu * 30);
      totalWaktu += roundedWaktu;
      totalMinit += minit;
      subjectCounts[item.subjectCode] = (subjectCounts[item.subjectCode] || 0) + roundedWaktu;

      return {
        bil: idx + 1,
        subjectCode: item.subjectCode,
        subjectFullName: item.subjectFullName,
        mataPelajaranLabel: `${item.subjectCode} - ${item.subjectFullName}`,
        grade: item.grade,
        kelasLabel: item.kelasLabel,
        bilWaktu: roundedWaktu,
        minit,
      };
    });

  const sortedGrades = Array.from(taughtGrades).sort((a, b) => a - b);
  const taughtGradesLabel =
    sortedGrades.length > 0
      ? sortedGrades.map((g) => `Tahun ${g}`).join(', ')
      : '-';

  const daysOver8 = DAYS_OF_WEEK.filter((d) => daily[d] > 8.0 + 1e-6).length;
  const daysOver7 = DAYS_OF_WEEK.filter((d) => daily[d] > 7.0 + 1e-6).length;

  return {
    grid,
    daily,
    totalWaktu: Math.round(totalWaktu * 10) / 10,
    totalMinit,
    subjectCounts,
    taughtGradesLabel,
    daysOver7,
    daysOver8,
    analysisRows,
  };
}

export interface LampiranAAnalysisRow {
  singkatanNama: string;
  namaGuru: string;
  mp: string;
  bilWaktu: number;
  minit: number;
}

export interface ClassLampiranABundle {
  analysisRows: LampiranAAnalysisRow[];
  totalWaktu: number;
  totalMinit: number;
}

function resolveTeacherDisplayAndName(
  rawTeacherCode: string,
  displayMode: 'NUMBER' | 'CODE',
  teacherList: TeacherDirectoryEntry[]
): { singkatan: string; fullName: string } {
  const parts = parseTeacherCodes(rawTeacherCode);
  if (parts.length === 0) {
    return { singkatan: '-', fullName: 'Semua Guru / Belum Ditugaskan' };
  }
  const singkatan = parts
    .map((c) => {
      if (displayMode === 'CODE') return c;
      const found = teacherList.find((t) => t.code === c);
      return found ? String(found.num) : c;
    })
    .join(' / ');

  const fullName = parts
    .map((c) => {
      const found = teacherList.find((t) => t.code === c);
      return found ? found.name : c;
    })
    .join(' / ');

  return { singkatan, fullName };
}

/**
 * Builds the exact Lampiran A (ANALISIS JADUAL WAKTU KELAS) rows for a given grade.
 * Columns: SINGKATAN NAMA | NAMA GURU | M/P | BIL. WAKTU | MINIT (+ JUMLAH)
 */
export function buildClassLampiranAAnalysis(
  schedule: ScheduleGrid,
  grade: number,
  academicYear: string,
  matrixData: SubjectAllocationRow[],
  teacherMapping: { list: TeacherDirectoryEntry[] },
  displayMode: 'NUMBER' | 'CODE' = 'CODE'
): ClassLampiranABundle {
  const isT1Shifted = grade === 1 && isKP2027Year1Active(academicYear);
  const grouped = new Map<
    string,
    {
      rawTeacherCode: string;
      subjectCode: string;
      subjectName: string;
      bilWaktu: number;
    }
  >();

  let hasAnyScheduledRegular = false;

  DAYS_OF_WEEK.forEach((day) => {
    const slots = getGradeDaySlots(grade, day, academicYear);
    slots.forEach((s) => {
      if (s.isRecess) return;
      const cell = schedule[grade]?.[day]?.[s.slotId];

      // Handle Tahun 1 PKAR even if PKAR slot wasn't materialized yet in legacy docs
      if (s.slotId === 'PKAR' && isT1Shifted) {
        const pkarTeacher =
          cell?.teacherCode?.trim() || schedule[1]?.[day]?.['W4']?.teacherCode?.trim() || '';
        const pkarLen = cell?.periodLength ?? 0.5;
        if (cell || pkarTeacher) {
          const key = `PKAR__${pkarTeacher}`;
          const existing = grouped.get(key);
          if (existing) existing.bilWaktu += pkarLen;
          else {
            grouped.set(key, {
              rawTeacherCode: pkarTeacher,
              subjectCode: 'PKAR',
              subjectName: 'PROGRAM PEMBENTUKAN KARAKTER',
              bilWaktu: pkarLen,
            });
          }
        }
        return;
      }

      if (!cell || !cell.subjectCode) return;
      const sCode = cell.subjectCode.trim().toUpperCase();

      // Only include MEMBACA or TASMIK in analysis if a teacher was assigned
      if ((s.slotId === 'MEMBACA' || sCode === 'MEMBACA' || s.slotId === 'TASMIK' || sCode === 'TASMIK') && !cell.teacherCode?.trim()) {
        return;
      }

      if (sCode !== 'PN' && s.slotId !== 'MEMBACA' && s.slotId !== 'TASMIK') {
        hasAnyScheduledRegular = true;
      }

      const tCode = sCode === 'PN' ? '' : (cell.teacherCode || '').trim();
      const len = cell.periodLength ?? (s.slotId === 'MEMBACA' ? 0.5 : 1);
      const key = `${sCode}__${tCode}`;
      const resolvedSubjName =
        s.slotId === 'MEMBACA' && cell.subjectName && cell.subjectName.trim()
          ? cell.subjectName.trim().toUpperCase()
          : getSubjectFullName(sCode, cell.subjectName);

      const existing = grouped.get(key);
      if (existing) {
        existing.bilWaktu += len;
      } else {
        grouped.set(key, {
          rawTeacherCode: tCode,
          subjectCode: sCode,
          subjectName: resolvedSubjName,
          bilWaktu: len,
        });
      }
    });
  });

  // Fallback to matrixData if schedule grid has not been generated yet
  if (!hasAnyScheduledRegular && matrixData.length > 0) {
    grouped.clear();
    const pmRow = matrixData.find((r) => r.subjectCode.toUpperCase() === 'PM');
    const paiRow = matrixData.find((r) => r.subjectCode.toUpperCase() === 'PAI');
    const pmPeriods = Number(pmRow?.periods?.[grade] || 0);
    const paiPeriods = Number(paiRow?.periods?.[grade] || 0);

    matrixData.forEach((r) => {
      const code = r.subjectCode.toUpperCase();
      const pCount = Number(r.periods?.[grade] || 0);
      if (pCount <= 0) return;

      if (code === 'PAI' && pmPeriods > 0) return; // Combined with PM/PAI
      if (code === 'TASMIK' && !r.teachers?.[grade]?.trim()) return;

      if (code === 'PM' && paiPeriods > 0) {
        const combinedTeacher = [pmRow?.teachers?.[grade] || '', paiRow?.teachers?.[grade] || '']
          .map((t) => t.trim())
          .filter(Boolean)
          .join('/');
        grouped.set(`PM/PAI__${combinedTeacher}`, {
          rawTeacherCode: combinedTeacher,
          subjectCode: 'PM/PAI',
          subjectName: getSubjectFullName('PM/PAI'),
          bilWaktu: Math.max(pmPeriods, paiPeriods),
        });
        return;
      }

      const t1 = r.teachers?.[grade]?.trim() || '';
      const t2 = r.secondaryTeachers?.[grade]?.trim() || '';
      const combined = code === 'AM' && t2 ? `${t1}/${t2}` : t1;
      const normalizedCode = code.startsWith('PKAR') ? 'PKAR' : code;

      const key = `${normalizedCode}__${combined}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.bilWaktu += pCount;
      } else {
        grouped.set(key, {
          rawTeacherCode: normalizedCode === 'PN' ? '' : combined,
          subjectCode: normalizedCode,
          subjectName: getSubjectFullName(normalizedCode, r.subjectName),
          bilWaktu: pCount,
        });
      }
    });
  }

  let totalWaktu = 0;
  let totalMinit = 0;

  const analysisRows: LampiranAAnalysisRow[] = Array.from(grouped.values())
    .sort((a, b) => {
      if (a.subjectCode === 'PN') return -1;
      if (b.subjectCode === 'PN') return 1;
      if (a.subjectCode === 'PKAR') return 1;
      if (b.subjectCode === 'PKAR') return -1;
      return a.subjectCode.localeCompare(b.subjectCode);
    })
    .map((entry) => {
      const roundedWaktu = Math.round(entry.bilWaktu * 10) / 10;
      const minit = Math.round(roundedWaktu * 30);
      totalWaktu += roundedWaktu;
      totalMinit += minit;

      const resolved =
        entry.subjectCode === 'PN'
          ? { singkatan: '-', fullName: 'SEMUA GURU (PERHIMPUNAN)' }
          : resolveTeacherDisplayAndName(entry.rawTeacherCode, displayMode, teacherMapping.list);

      return {
        singkatanNama: resolved.singkatan,
        namaGuru: resolved.fullName,
        mp: `${entry.subjectCode} - ${entry.subjectName}`,
        bilWaktu: roundedWaktu,
        minit,
      };
    });

  return {
    analysisRows,
    totalWaktu: Math.round(totalWaktu * 10) / 10,
    totalMinit,
  };
}
