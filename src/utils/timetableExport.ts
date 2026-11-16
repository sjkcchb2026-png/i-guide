import ExcelJS from 'exceljs';
import { SubjectAllocationRow } from '../components/Timetable/SchoolTimetableMatrix';
import {
  DayOfWeek,
  DAYS_OF_WEEK,
  ScheduleGrid,
  getGradeDaySlots,
} from '../components/Timetable/types';
import {
  OPTION_A_COLUMNS,
  REHAT_VERTICAL_LETTER,
  TeacherDirectoryEntry,
  buildClassLampiranAAnalysis,
  buildTeacherOptionAMatrix,
  formatKemaskiniDate,
  formatPenggalSesi,
  getDesignatedPemulihanTeacherCode,
  isKP2027Year1Active,
  parseTeacherCodes,
  resolveCellPemulihanTeacher,
} from './lampiranData';

const DOUBLE_BORDER: Partial<ExcelJS.Border> = { style: 'double', color: { argb: 'FF000000' } };
const THIN_BORDER: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF000000' } };

function sanitizeWorksheetName(rawName: string, usedNames: Set<string>): string {
  // Excel sheet names max 31 chars, cannot include \ / ? * [ ] :
  const cleaned = rawName.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim() || 'Sheet';
  let candidate = cleaned.slice(0, 31);
  let suffix = 2;
  while (usedNames.has(candidate.toUpperCase())) {
    const tag = ` (${suffix})`;
    candidate = `${cleaned.slice(0, Math.max(1, 31 - tag.length))}${tag}`;
    suffix++;
  }
  usedNames.add(candidate.toUpperCase());
  return candidate;
}

function triggerBrowserDownload(buffer: ArrayBuffer | Uint8Array, fileName: string) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function applyGridOuterDoubleBorders(
  ws: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number
) {
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const cell = ws.getCell(r, c);
      cell.border = {
        top: r === startRow ? DOUBLE_BORDER : THIN_BORDER,
        bottom: r === endRow ? DOUBLE_BORDER : THIN_BORDER,
        left: c === startCol ? DOUBLE_BORDER : THIN_BORDER,
        right: c === endCol ? DOUBLE_BORDER : THIN_BORDER,
      };
    }
  }
}

export interface ExportCommonParams {
  schedule: ScheduleGrid;
  academicYear: string;
  schoolName: string;
  schoolCode?: string;
  classTeachers: Record<number, string>;
  matrixData: SubjectAllocationRow[];
  teacherMapping: { list: TeacherDirectoryEntry[] };
  displayMode: 'NUMBER' | 'CODE';
  kemaskiniDate?: string;
}

function resolveTeacherDisplay(
  teacherCode: string,
  displayMode: 'NUMBER' | 'CODE',
  teacherList: TeacherDirectoryEntry[]
): string {
  const parts = parseTeacherCodes(teacherCode);
  if (parts.length === 0) return '';
  return parts
    .map((c) => {
      if (displayMode === 'CODE') return c;
      const found = teacherList.find((t) => t.code === c);
      return found ? String(found.num) : c;
    })
    .join(' / ');
}

/**
 * Builds Sheet: Jadual Induk (Master Timetable for all 5 days x 6 classes)
 */
export function buildJadualIndukSheet(
  wb: ExcelJS.Workbook,
  params: ExportCommonParams,
  usedSheetNames: Set<string>
): ExcelJS.Worksheet {
  const sheetName = sanitizeWorksheetName('Jadual Induk', usedSheetNames);
  const ws = wb.addWorksheet(sheetName, {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  const {
    schedule,
    academicYear,
    schoolName,
    classTeachers,
    teacherMapping,
    displayMode,
    kemaskiniDate = formatKemaskiniDate(),
  } = params;

  const t1MorningCodes = Array.from(
    new Set(
      DAYS_OF_WEEK.map((d) => schedule[1]?.[d]?.['MEMBACA']?.subjectCode?.trim().toUpperCase()).filter(
        Boolean
      )
    )
  );
  const masterMembacaHeader =
    t1MorningCodes.length === 1 ? `${t1MorningCodes[0]} (T1)` : 'PROG. PAGI (T1)';

  const isT1Shifted = isKP2027Year1Active(academicYear);
  const guruPemulihanCode = getDesignatedPemulihanTeacherCode(teacherMapping.list);

  const masterHeaders = [
    'KELAS',
    'GURU KELAS',
    masterMembacaHeader,
    'W1',
    'W2',
    'W3',
    'W4',
    'W5',
    'PKAR (T1)',
    'REHAT',
    'W6 / W5',
    'W7 / W6',
    'W8 / W7',
    'W9 / W8',
    'W10 / W9',
    'W11 / W10',
    'TASMIK',
  ];
  const totalCols = masterHeaders.length;

  const formatMasterExcelHeader = (h: string, day: DayOfWeek) => {
    if (h === masterMembacaHeader) return `${masterMembacaHeader}\n07:15 - 07:30`;
    if (h === 'W1') return isT1Shifted ? 'W1\n07:15 - 07:45\n(T1: 07:30 - 08:00)' : 'W1\n07:15 - 07:45';
    if (h === 'W2') return isT1Shifted ? 'W2\n07:45 - 08:15\n(T1: 08:00 - 08:30)' : 'W2\n07:45 - 08:15';
    if (h === 'W3') return isT1Shifted ? 'W3\n08:15 - 08:45\n(T1: 08:30 - 09:00)' : 'W3\n08:15 - 08:45';
    if (h === 'W4') return isT1Shifted ? 'W4\n08:45 - 09:15\n(T1: 09:00 - 09:30)' : 'W4\n08:45 - 09:15';
    if (h === 'W5') return 'W5\n09:15 - 09:45';
    if (h === 'PKAR (T1)') return 'PKAR\n(T1: PKAR 09:30 - 09:45)';
    if (h === 'REHAT') return 'REHAT\n09:45 - 10:15';
    if (h === 'W6 / W5') return isT1Shifted ? 'W6 (T1:W5)\n10:15 - 10:45' : 'W6\n10:15 - 10:45';
    if (h === 'W7 / W6') return isT1Shifted ? 'W7 (T1:W6)\n10:45 - 11:15' : 'W7\n10:45 - 11:15';
    if (h === 'W8 / W7') return isT1Shifted ? 'W8 (T1:W7)\n11:15 - 11:45' : 'W8\n11:15 - 11:45';
    if (h === 'W9 / W8') {
      const top = isT1Shifted ? 'W9 (T1:W8)' : 'W9';
      return day === 'JUMAAT' ? `${top}\n11:45 - 12:15\n(T4-6 TASMIK)` : `${top}\n11:45 - 12:15`;
    }
    if (h === 'W10 / W9') return isT1Shifted ? 'W10 (T1:W9)\n12:15 - 12:45' : 'W10\n12:15 - 12:45';
    if (h === 'W11 / W10') {
      const top = isT1Shifted ? 'W11 (T1:W10)' : 'W11';
      return day === 'RABU' || day === 'KHAMIS' ? `${top}\n12:45 - 13:15\n(TASMIK)` : `${top}\n12:45 - 13:15`;
    }
    if (h === 'TASMIK') return 'TASMIK\n13:15 - 13:45';
    return h;
  };

  ws.columns = masterHeaders.map((_, idx) => ({
    width: idx === 0 ? 12 : idx === 1 ? 22 : idx === 9 ? 9 : 14.5,
  }));

  // Header
  ws.getCell(1, 1).value = `Kemaskini : ${kemaskiniDate}`;
  ws.getCell(1, 1).font = { bold: true, size: 10 };
  ws.getCell(1, totalCols).value = 'JADUAL INDUK';
  ws.getCell(1, totalCols).font = { bold: true, size: 11, color: { argb: 'FF1D4ED8' } };
  ws.getCell(1, totalCols).alignment = { horizontal: 'right' };

  ws.mergeCells(2, 1, 2, totalCols);
  const titleCell = ws.getCell(2, 1);
  titleCell.value = `JADUAL WAKTU INDUK SEKOLAH TAHUN ${academicYear}`;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF800020' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(3, 1, 3, totalCols);
  const schoolCell = ws.getCell(3, 1);
  schoolCell.value = `SEKOLAH : ${schoolName}   |   PENGGAL : ${formatPenggalSesi(academicYear)}`;
  schoolCell.font = { bold: true, size: 10 };
  schoolCell.alignment = { horizontal: 'center' };

  let rowCursor = 5;

  const resolveMasterSlotId = (g: number, colHeader: string, day: DayOfWeek): string | null => {
    if (colHeader === masterMembacaHeader) return g === 1 ? 'MEMBACA' : null;
    if (colHeader === 'PKAR (T1)') return g === 1 ? 'PKAR' : null;
    if (colHeader === 'REHAT') return 'REHAT';
    if (colHeader === 'W1' || colHeader === 'W2' || colHeader === 'W3' || colHeader === 'W4') return colHeader;
    if (colHeader === 'W5') return g === 1 ? null : 'W5';
    if (colHeader === 'W6 / W5') return g === 1 ? 'W5' : 'W6';
    if (colHeader === 'W7 / W6') return g === 1 ? 'W6' : 'W7';
    if (colHeader === 'W8 / W7') {
      if (day === 'JUMAAT' && (g === 2 || g === 3)) return 'TASMIK';
      return g === 1 ? 'W7' : 'W8';
    }
    if (colHeader === 'W9 / W8') {
      if (day === 'JUMAAT') return g === 1 || g >= 4 ? 'TASMIK' : null;
      return g === 1 ? 'W8' : 'W9';
    }
    if (colHeader === 'W10 / W9') {
      if (day === 'JUMAAT') return null;
      return g === 1 ? 'W9' : 'W10';
    }
    if (colHeader === 'W11 / W10') {
      if (day === 'JUMAAT') return null;
      if (day === 'RABU' || day === 'KHAMIS') return 'TASMIK';
      return g === 1 ? 'W10' : 'W11';
    }
    if (colHeader === 'TASMIK') {
      return day === 'ISNIN' || day === 'SELASA' ? 'TASMIK' : null;
    }
    return null;
  };

  DAYS_OF_WEEK.forEach((day) => {
    ws.mergeCells(rowCursor, 1, rowCursor, totalCols);
    const dayBanner = ws.getCell(rowCursor, 1);
    dayBanner.value =
      day === 'RABU' || day === 'KHAMIS'
        ? `HARI : ${day}  (W11 / W10: 12:45–13:15 DIKHASKAN UNTUK TASMIK)`
        : day === 'JUMAAT'
        ? `HARI : ${day}  (W9 / W8: 11:45–12:15 TAHUN 4–6 DIKHASKAN UNTUK TASMIK)`
        : `HARI : ${day}`;
    dayBanner.font = { bold: true, size: 11, color: { argb: 'FF800020' } };
    dayBanner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF99' } };
    dayBanner.alignment = { horizontal: 'left', vertical: 'middle' };
    rowCursor++;

    const headerRowIdx = rowCursor;
    masterHeaders.forEach((h, i) => {
      const c = ws.getCell(headerRowIdx, i + 1);
      c.value = formatMasterExcelHeader(h, day);
      c.font = { bold: true, size: 8, color: { argb: 'FF000000' } };
      c.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: {
          argb:
            h === 'REHAT'
              ? 'FFB8CCE4'
              : ((day === 'RABU' || day === 'KHAMIS') && h === 'W11 / W10') ||
                (day === 'JUMAAT' && h === 'W9 / W8') ||
                h === 'PKAR (T1)'
              ? 'FFBBF7D0'
              : 'FFCCFFCC',
        },
      };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    ws.getRow(headerRowIdx).height = 38;
    rowCursor++;

    const startBodyRow = rowCursor;
    [1, 2, 3, 4, 5, 6].forEach((grade, gIdx) => {
      const rIdx = rowCursor;
      ws.getRow(rIdx).height = 28;
      ws.getCell(rIdx, 1).value = `Tahun ${grade}`;
      ws.getCell(rIdx, 1).font = { bold: true, size: 9 };
      ws.getCell(rIdx, 1).alignment = { horizontal: 'center', vertical: 'middle' };

      ws.getCell(rIdx, 2).value = classTeachers[grade] || '-';
      ws.getCell(rIdx, 2).font = { size: 9 };
      ws.getCell(rIdx, 2).alignment = { horizontal: 'left', vertical: 'middle' };

      masterHeaders.slice(2).forEach((h, offset) => {
        const colNum = offset + 3;
        const cell = ws.getCell(rIdx, colNum);
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

        if (h === 'REHAT') {
          const letters = ['R', 'E', 'H', 'A', 'T', ' '];
          cell.value = letters[gIdx] || '';
          cell.font = { bold: true, size: 10 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB8CCE4' } };
          return;
        }

        const slotId = resolveMasterSlotId(grade, h, day);
        const entry = slotId ? schedule[grade]?.[day]?.[slotId] : null;
        if (!entry || !entry.subjectCode) {
          cell.value = '-';
          cell.font = { size: 9, color: { argb: 'FF94A3B8' } };
          return;
        }

        const tLabel =
          entry.subjectCode === 'PN'
            ? 'SEMUA'
            : resolveTeacherDisplay(entry.teacherCode, displayMode, teacherMapping.list);
        const pemCode = entry.isPemulihan ? resolveCellPemulihanTeacher(entry, guruPemulihanCode) : '';
        const pemTag = entry.isPemulihan
          ? `\n${entry.subjectCode.toUpperCase() === 'MT' ? 'PMT' : 'PBM'}${
              pemCode ? ` (${resolveTeacherDisplay(pemCode, displayMode, teacherMapping.list)})` : ''
            }`
          : '';
        cell.value = (tLabel ? `${entry.subjectCode}\n${tLabel}` : entry.subjectCode) + pemTag;
        cell.font = { bold: true, size: 8.5 };
        if (grade === 1 && ['W1', 'W2', 'W3', 'W4'].includes(slotId || '')) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
        } else if (slotId === 'PKAR') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
        } else if (entry.isPemulihan) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
        }
      });
      rowCursor++;
    });

    applyGridOuterDoubleBorders(ws, headerRowIdx, rowCursor - 1, 1, totalCols);
    rowCursor++; // Blank spacing row between days
  });

  return ws;
}

/**
 * Builds Sheet: Lampiran B (Official Option A Teacher Personal Timetable)
 */
export function buildLampiranBTeacherSheet(
  wb: ExcelJS.Workbook,
  teacher: TeacherDirectoryEntry,
  params: ExportCommonParams,
  usedSheetNames: Set<string>
): ExcelJS.Worksheet {
  const sheetName = sanitizeWorksheetName(`Lampiran B - ${teacher.code}`, usedSheetNames);
  const ws = wb.addWorksheet(sheetName, {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
    },
  });

  const {
    schedule,
    academicYear,
    schoolName,
    teacherMapping,
    kemaskiniDate = formatKemaskiniDate(),
  } = params;

  const guruPemulihanCode = getDesignatedPemulihanTeacherCode(teacherMapping.list);
  const bundle = buildTeacherOptionAMatrix(schedule, teacher.code, academicYear, guruPemulihanCode);
  const totalCols = 13; // Day col + 12 Option A columns

  ws.columns = [
    { width: 13 }, // Hari
    { width: 15.5 }, // W1
    { width: 15.5 }, // W2
    { width: 15.5 }, // W3
    { width: 15.5 }, // W4
    { width: 15.5 }, // W5 / PKAR
    { width: 6.5 }, // REHAT
    { width: 13 }, // W6
    { width: 13 }, // W7
    { width: 13 }, // W8
    { width: 13 }, // W9
    { width: 13 }, // W10
    { width: 13 }, // W11
  ];

  // Row 1: Kemaskini (Left) & Lampiran B (Right Bold Blue)
  ws.getCell(1, 1).value = `Kemaskini : ${kemaskiniDate}`;
  ws.getCell(1, 1).font = { size: 10, bold: true };
  ws.getCell(1, totalCols).value = 'Lampiran B';
  ws.getCell(1, totalCols).font = { size: 11, bold: true, color: { argb: 'FF1D4ED8' } };
  ws.getCell(1, totalCols).alignment = { horizontal: 'right' };

  // Row 2: Maroon Title
  ws.mergeCells(2, 1, 2, totalCols);
  const titleCell = ws.getCell(2, 1);
  titleCell.value = `JADUAL WAKTU PERIBADI GURU TAHUN ${academicYear}`;
  titleCell.font = { size: 14, bold: true, color: { argb: 'FF800020' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 24;

  // Rows 3-4: Dotted Metadata Fields
  ws.mergeCells(3, 1, 3, 7);
  ws.getCell(3, 1).value = `NAMA GURU : ${teacher.name} (${teacher.code})`;
  ws.getCell(3, 1).font = { size: 10, bold: true };
  ws.getCell(3, 1).border = { bottom: { style: 'dotted', color: { argb: 'FF000000' } } };

  ws.mergeCells(3, 8, 3, totalCols);
  ws.getCell(3, 8).value = `PENGGAL : ${formatPenggalSesi(academicYear)}`;
  ws.getCell(3, 8).font = { size: 10, bold: true };
  ws.getCell(3, 8).border = { bottom: { style: 'dotted', color: { argb: 'FF000000' } } };

  ws.mergeCells(4, 1, 4, 7);
  ws.getCell(4, 1).value = `KELAS/TAHUN DIAJAR : ${bundle.taughtGradesLabel}`;
  ws.getCell(4, 1).font = { size: 10, bold: true };
  ws.getCell(4, 1).border = { bottom: { style: 'dotted', color: { argb: 'FF000000' } } };

  ws.mergeCells(4, 8, 4, totalCols);
  ws.getCell(4, 8).value = `SEKOLAH : ${schoolName}`;
  ws.getCell(4, 8).font = { size: 10, bold: true };
  ws.getCell(4, 8).border = { bottom: { style: 'dotted', color: { argb: 'FF000000' } } };

  // Row 6: Option A Dual-Time Header (#CCFFCC pale green)
  const headerRow = 6;
  ws.getRow(headerRow).height = 44;

  const dayHdr = ws.getCell(headerRow, 1);
  dayHdr.value = 'HARI / WAKTU';
  dayHdr.font = { bold: true, size: 10, color: { argb: 'FF000000' } };
  dayHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCFFCC' } };
  dayHdr.alignment = { horizontal: 'center', vertical: 'middle' };

  OPTION_A_COLUMNS.forEach((col, idx) => {
    const excelCol = idx + 2;
    const cell = ws.getCell(headerRow, excelCol);
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    if (col.isRecess) {
      cell.value = `REHAT\n${col.displayTime}`;
      cell.font = { bold: true, size: 8.5, color: { argb: 'FF000000' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB8CCE4' } };
    } else if (col.t1ShiftedTime) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCFFCC' } };
      cell.value = {
        richText: [
          {
            text: `${col.headerLabel}\n`,
            font: { bold: true, size: 9, color: { argb: 'FF000000' } },
          },
          {
            text: `${col.displayTime}\n`,
            font: { bold: true, size: 8.5, color: { argb: 'FFCC00CC' } },
          },
          {
            text: col.t1ShiftedTime,
            font: { bold: true, size: 7.5, color: { argb: 'FF0F766E' } },
          },
        ],
      };
    } else {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCFFCC' } };
      cell.value = `${col.headerLabel}\n${col.displayTime}`;
      cell.font = { bold: true, size: 8.5, color: { argb: 'FF000000' } };
    }
  });

  // Rows 7..11: Days ISNIN..JUMAAT
  const firstDayRow = headerRow + 1;
  DAYS_OF_WEEK.forEach((day, dIdx) => {
    const rIdx = firstDayRow + dIdx;
    ws.getRow(rIdx).height = 38;

    const dCell = ws.getCell(rIdx, 1);
    dCell.value = day;
    dCell.font = { bold: true, size: 10, color: { argb: 'FF000000' } };
    dCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    dCell.alignment = { horizontal: 'center', vertical: 'middle' };

    OPTION_A_COLUMNS.forEach((col, cIdx) => {
      const excelCol = cIdx + 2;
      const cell = ws.getCell(rIdx, excelCol);
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

      if (col.isRecess) {
        cell.value = REHAT_VERTICAL_LETTER[day];
        cell.font = { bold: true, size: 11, color: { argb: 'FF000000' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB8CCE4' } };
        return;
      }

      // Disabled tail columns on Friday (W9 active for T4-6 TASMIK; W11 on Wed/Thu active for TASMIK)
      const isOffHours =
        day === 'JUMAAT' && ['W10', 'W11'].includes(col.slotId);

      const entry = bundle.grid[day]?.[col.slotId];

      if (isOffHours && !entry) {
        cell.value = '';
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        return;
      }

      if (!entry) {
        cell.value = '';
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
        return;
      }

      // 1. Year 1 PKAR (Col 5): soft green #DCFCE7 + PKAR (T.1) + 09:30-09:45 (+0.5 Waktu)
      if (entry.isPKAR) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
        cell.value = {
          richText: [
            {
              text: 'PKAR (T.1)\n',
              font: { bold: true, size: 10, color: { argb: 'FF000000' } },
            },
            {
              text: '09:30-09:45 (+0.5 Waktu)',
              font: { bold: true, size: 8, color: { argb: 'FF15803D' } },
            },
          ],
        };
        return;
      }

      // 2. Year 1 Morning (Cols 1..4): soft amber #FEF9C3 + <SUBJECT> (T.1) + [HH:MM-HH:MM]
      const badgeLine = entry.membacaLabel || 'MEMBACA T.1 [07:15-07:30]';
      if (entry.isYear1Morning) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
        const runs: ExcelJS.RichText[] = [];
        if (entry.hasMembacaT1) {
          runs.push({
            text: `${badgeLine}\n`,
            font: { bold: true, size: 7, color: { argb: 'FF0F766E' } },
          });
        }
        runs.push({
          text: `${entry.subjectCode} (T.1)\n`,
          font: { bold: true, size: 10, color: { argb: 'FF000000' } },
        });
        runs.push({
          text: entry.year1ClockBracket || `[${entry.time}]`,
          font: { bold: true, size: 8, color: { argb: 'FFB45309' } },
        });
        cell.value = { richText: runs };
        return;
      }

      // 3. Regular Tahun 2-6 or synchronized post-recess lesson (White background, or soft emerald #ECFDF5 for PBM/PMT Pemulihan)
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: entry.isPemulihanSlot ? 'FFECFDF5' : 'FFFFFFFF' },
      };
      if (entry.hasMembacaT1 && entry.subjectCode) {
        cell.value = {
          richText: [
            {
              text: `${badgeLine}\n`,
              font: { bold: true, size: 7, color: { argb: 'FF0F766E' } },
            },
            {
              text: `${entry.subjectCode}\n${entry.gradeLabel || `T.${entry.grade}`}`,
              font: { bold: true, size: 10, color: { argb: 'FF000000' } },
            },
          ],
        };
      } else if (entry.hasMembacaT1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCFBF1' } };
        cell.value = {
          richText: [
            {
              text: badgeLine.replace(' [', '\n['),
              font: { bold: true, size: 8, color: { argb: 'FF0F766E' } },
            },
          ],
        };
      } else {
        cell.value = `${entry.subjectCode}\n${entry.gradeLabel || `T.${entry.grade}`}${
          entry.isPemulihanSlot ? '\nPEMULIHAN' : ''
        }`;
        cell.font = { bold: true, size: 9.5, color: { argb: 'FF000000' } };
      }
    });
  });

  const lastGridRow = firstDayRow + DAYS_OF_WEEK.length - 1;
  applyGridOuterDoubleBorders(ws, headerRow, lastGridRow, 1, totalCols);

  // Bottom Analysis Table: ANALISIS JADUAL WAKTU PERIBADI
  let curRow = lastGridRow + 2;
  ws.mergeCells(curRow, 1, curRow, 8);
  const analysisTitle = ws.getCell(curRow, 1);
  analysisTitle.value = 'ANALISIS JADUAL WAKTU PERIBADI';
  analysisTitle.font = { bold: true, size: 11, color: { argb: 'FF800020' } };
  analysisTitle.alignment = { horizontal: 'left', vertical: 'middle' };
  curRow++;

  // Columns: Bil (col 1) | Mata Pelajaran (cols 2..4 merged) | Kelas (col 5..6 merged) | Bil. Waktu (col 7) | Minit (col 8)
  const analysisHeaderRow = curRow;
  ws.getRow(analysisHeaderRow).height = 24;
  ws.getCell(analysisHeaderRow, 1).value = 'Bil';
  ws.mergeCells(analysisHeaderRow, 2, analysisHeaderRow, 4);
  ws.getCell(analysisHeaderRow, 2).value = 'Mata Pelajaran';
  ws.mergeCells(analysisHeaderRow, 5, analysisHeaderRow, 6);
  ws.getCell(analysisHeaderRow, 5).value = 'Kelas';
  ws.getCell(analysisHeaderRow, 7).value = 'Bil. Waktu';
  ws.getCell(analysisHeaderRow, 8).value = 'Minit';

  for (let c = 1; c <= 8; c++) {
    const cell = ws.getCell(analysisHeaderRow, c);
    cell.font = { bold: true, size: 10, color: { argb: 'FFCC00CC' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF99' } };
    cell.alignment = { horizontal: c === 2 ? 'left' : 'center', vertical: 'middle' };
  }
  curRow++;

  bundle.analysisRows.forEach((row) => {
    ws.getRow(curRow).height = 20;
    ws.getCell(curRow, 1).value = row.bil;
    ws.getCell(curRow, 1).alignment = { horizontal: 'center', vertical: 'middle' };

    ws.mergeCells(curRow, 2, curRow, 4);
    ws.getCell(curRow, 2).value = row.mataPelajaranLabel;
    ws.getCell(curRow, 2).alignment = { horizontal: 'left', vertical: 'middle' };

    ws.mergeCells(curRow, 5, curRow, 6);
    ws.getCell(curRow, 5).value = row.kelasLabel;
    ws.getCell(curRow, 5).alignment = { horizontal: 'center', vertical: 'middle' };

    ws.getCell(curRow, 7).value = row.bilWaktu;
    ws.getCell(curRow, 7).alignment = { horizontal: 'center', vertical: 'middle' };

    ws.getCell(curRow, 8).value = row.minit;
    ws.getCell(curRow, 8).alignment = { horizontal: 'center', vertical: 'middle' };

    for (let c = 1; c <= 8; c++) {
      ws.getCell(curRow, c).font = { size: 9, bold: c >= 7 };
    }
    curRow++;
  });

  // JUMLAH row
  const jumlahRow = curRow;
  ws.getRow(jumlahRow).height = 22;
  ws.mergeCells(jumlahRow, 1, jumlahRow, 6);
  ws.getCell(jumlahRow, 1).value = 'JUMLAH';
  ws.getCell(jumlahRow, 1).alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell(jumlahRow, 7).value = bundle.totalWaktu;
  ws.getCell(jumlahRow, 7).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell(jumlahRow, 8).value = bundle.totalMinit;
  ws.getCell(jumlahRow, 8).alignment = { horizontal: 'center', vertical: 'middle' };

  for (let c = 1; c <= 8; c++) {
    const cell = ws.getCell(jumlahRow, c);
    cell.font = { bold: true, size: 10, color: { argb: 'FF000000' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF99' } };
  }

  applyGridOuterDoubleBorders(ws, analysisHeaderRow, jumlahRow, 1, 8);

  // Signatures on right side next to analysis
  const sigRow = analysisHeaderRow + 1;
  ws.mergeCells(sigRow, 10, sigRow, 13);
  ws.getCell(sigRow, 10).value = `Tandatangan Guru: ${teacher.name}`;
  ws.getCell(sigRow, 10).font = { size: 9, bold: true };
  ws.mergeCells(sigRow + 2, 10, sigRow + 2, 13);
  ws.getCell(sigRow + 2, 10).value = 'Disahkan oleh: Guru Besar / PK Pentadbiran';
  ws.getCell(sigRow + 2, 10).font = { size: 9, bold: true };

  return ws;
}

/**
 * Builds Sheet: Lampiran A (Official Class Timetable)
 */
export function buildLampiranAClassSheet(
  wb: ExcelJS.Workbook,
  grade: number,
  params: ExportCommonParams,
  usedSheetNames: Set<string>
): ExcelJS.Worksheet {
  const sheetName = sanitizeWorksheetName(`Lampiran A - T${grade}`, usedSheetNames);
  const ws = wb.addWorksheet(sheetName, {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
    },
  });

  const {
    schedule,
    academicYear,
    schoolName,
    classTeachers,
    matrixData,
    teacherMapping,
    displayMode,
    kemaskiniDate = formatKemaskiniDate(),
  } = params;

  const isT1Shifted = grade === 1 && isKP2027Year1Active(academicYear);
  const headerSlots = getGradeDaySlots(grade, 'ISNIN', academicYear);
  const totalCols = headerSlots.length + 1; // Hari + class slots
  const currentClassTeacher = classTeachers[grade] || 'Belum Ditetapkan';

  ws.columns = [
    { width: 13 },
    ...headerSlots.map((s) => ({
      width: s.isRecess ? 6.5 : s.slotId === 'MEMBACA' || s.slotId === 'PKAR' ? 13.5 : 13,
    })),
  ];

  // Top Header: Kemaskini & Lampiran A (bold blue)
  ws.getCell(1, 1).value = `Kemaskini : ${kemaskiniDate}`;
  ws.getCell(1, 1).font = { size: 10, bold: true };
  ws.getCell(1, totalCols).value = 'Lampiran A';
  ws.getCell(1, totalCols).font = { size: 11, bold: true, color: { argb: 'FF1D4ED8' } };
  ws.getCell(1, totalCols).alignment = { horizontal: 'right' };

  // Title Row (maroon)
  ws.mergeCells(2, 1, 2, totalCols);
  const titleCell = ws.getCell(2, 1);
  titleCell.value = `JADUAL WAKTU KELAS TAHUN ${grade} (${academicYear})`;
  titleCell.font = { size: 14, bold: true, color: { argb: 'FF800020' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 24;

  // Dotted metadata rows
  const midCol = Math.max(4, Math.floor(totalCols / 2));
  ws.mergeCells(3, 1, 3, midCol);
  ws.getCell(3, 1).value = `GURU KELAS : ${currentClassTeacher}`;
  ws.getCell(3, 1).font = { size: 10, bold: true };
  ws.getCell(3, 1).border = { bottom: { style: 'dotted', color: { argb: 'FF000000' } } };

  ws.mergeCells(3, midCol + 1, 3, totalCols);
  ws.getCell(3, midCol + 1).value = `PENGGAL : ${formatPenggalSesi(academicYear)}`;
  ws.getCell(3, midCol + 1).font = { size: 10, bold: true };
  ws.getCell(3, midCol + 1).border = { bottom: { style: 'dotted', color: { argb: 'FF000000' } } };

  ws.mergeCells(4, 1, 4, midCol);
  ws.getCell(4, 1).value = `KURIKULUM : ${isT1Shifted ? 'KP2027 (Tahun 1)' : 'KSSR SEMAKAN'}`;
  ws.getCell(4, 1).font = { size: 10, bold: true };
  ws.getCell(4, 1).border = { bottom: { style: 'dotted', color: { argb: 'FF000000' } } };

  ws.mergeCells(4, midCol + 1, 4, totalCols);
  ws.getCell(4, midCol + 1).value = `SEKOLAH : ${schoolName}`;
  ws.getCell(4, midCol + 1).font = { size: 10, bold: true };
  ws.getCell(4, midCol + 1).border = { bottom: { style: 'dotted', color: { argb: 'FF000000' } } };

  // Row 6: Header Row (#CCFFCC pale green, #B8CCE4 for REHAT)
  const headerRow = 6;
  ws.getRow(headerRow).height = 32;
  ws.getCell(headerRow, 1).value = 'HARI / WAKTU';
  ws.getCell(headerRow, 1).font = { bold: true, size: 10 };
  ws.getCell(headerRow, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCFFCC' } };
  ws.getCell(headerRow, 1).alignment = { horizontal: 'center', vertical: 'middle' };

  headerSlots.forEach((s, idx) => {
    const cell = ws.getCell(headerRow, idx + 2);
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    if (s.isRecess) {
      cell.value = `REHAT\n${s.startTime}-${s.endTime}`;
      cell.font = { bold: true, size: 9 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB8CCE4' } };
    } else {
      let headerLabel = s.label;
      if (s.slotId === 'MEMBACA' && grade === 1) {
        const codes = Array.from(
          new Set(
            DAYS_OF_WEEK.map((d) => schedule[1]?.[d]?.['MEMBACA']?.subjectCode?.trim().toUpperCase()).filter(
              (c): c is string => Boolean(c)
            )
          )
        );
        if (codes.length === 1) headerLabel = codes[0];
        else if (codes.length > 1) headerLabel = 'PROG. PAGI';
      }
      cell.value = `${headerLabel}\n${s.startTime}-${s.endTime}`;
      cell.font = { bold: true, size: 9, color: { argb: 'FF000000' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCFFCC' } };
    }
  });

  const guruPemulihanCode = getDesignatedPemulihanTeacherCode(teacherMapping.list);

  // Days Rows
  const firstDayRow = headerRow + 1;
  DAYS_OF_WEEK.forEach((day, dIdx) => {
    const rIdx = firstDayRow + dIdx;
    ws.getRow(rIdx).height = 36;
    const daySlots = getGradeDaySlots(grade, day, academicYear);

    const dCell = ws.getCell(rIdx, 1);
    dCell.value = day;
    dCell.font = { bold: true, size: 10 };
    dCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    dCell.alignment = { horizontal: 'center', vertical: 'middle' };

    headerSlots.forEach((hs, idx) => {
      const cell = ws.getCell(rIdx, idx + 2);
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

      const matchedSlot =
        hs.startMinutes >= 615
          ? daySlots.find(
              (ds) =>
                !ds.isRecess &&
                ds.startMinutes === hs.startMinutes &&
                ds.endMinutes === hs.endMinutes
            )
          : daySlots.find((ds) => ds.slotId === hs.slotId);
      if (!matchedSlot) {
        cell.value = '';
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        return;
      }
      if (matchedSlot.isRecess) {
        cell.value = REHAT_VERTICAL_LETTER[day];
        cell.font = { bold: true, size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB8CCE4' } };
        return;
      }

      const entry = schedule[grade]?.[day]?.[matchedSlot.slotId];
      if (!entry || !entry.subjectCode) {
        cell.value = '-';
        cell.font = { size: 9, color: { argb: 'FF94A3B8' } };
        return;
      }

      const tDisplay =
        entry.subjectCode === 'PN'
          ? 'SEMUA'
          : resolveTeacherDisplay(entry.teacherCode, displayMode, teacherMapping.list);
      const pemCode = entry.isPemulihan ? resolveCellPemulihanTeacher(entry, guruPemulihanCode) : '';
      const pemTag = entry.isPemulihan
        ? `\n${entry.subjectCode.toUpperCase() === 'MT' ? 'PMT' : 'PBM'}${
            pemCode ? ` (${resolveTeacherDisplay(pemCode, displayMode, teacherMapping.list)})` : ''
          }`
        : '';
      cell.value = (tDisplay ? `${entry.subjectCode}\n${tDisplay}` : entry.subjectCode) + pemTag;
      cell.font = { bold: true, size: 9.5, color: { argb: 'FF000000' } };

      if (matchedSlot.slotId === 'PKAR') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
      } else if (isT1Shifted && ['W1', 'W2', 'W3', 'W4'].includes(matchedSlot.slotId)) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
      } else if (entry.isPemulihan) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
      } else if (matchedSlot.slotId === 'TASMIK' && entry.teacherCode?.trim()) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
      } else {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
      }
    });
  });

  const lastGridRow = firstDayRow + DAYS_OF_WEEK.length - 1;
  applyGridOuterDoubleBorders(ws, headerRow, lastGridRow, 1, totalCols);

  // Bottom Analysis Table: ANALISIS JADUAL WAKTU KELAS
  const bundle = buildClassLampiranAAnalysis(
    schedule,
    grade,
    academicYear,
    matrixData,
    teacherMapping,
    displayMode
  );

  let curRow = lastGridRow + 2;
  ws.mergeCells(curRow, 1, curRow, 9);
  const analysisTitle = ws.getCell(curRow, 1);
  analysisTitle.value = 'ANALISIS JADUAL WAKTU KELAS';
  analysisTitle.font = { bold: true, size: 11, color: { argb: 'FF800020' } };
  analysisTitle.alignment = { horizontal: 'left', vertical: 'middle' };
  curRow++;

  // Columns: SINGKATAN NAMA (1..2) | NAMA GURU (3..5) | M/P (6..7) | BIL. WAKTU (8) | MINIT (9)
  const analysisHeaderRow = curRow;
  ws.getRow(analysisHeaderRow).height = 24;
  ws.mergeCells(analysisHeaderRow, 1, analysisHeaderRow, 2);
  ws.getCell(analysisHeaderRow, 1).value = 'SINGKATAN NAMA';
  ws.mergeCells(analysisHeaderRow, 3, analysisHeaderRow, 5);
  ws.getCell(analysisHeaderRow, 3).value = 'NAMA GURU';
  ws.mergeCells(analysisHeaderRow, 6, analysisHeaderRow, 7);
  ws.getCell(analysisHeaderRow, 6).value = 'M/P';
  ws.getCell(analysisHeaderRow, 8).value = 'BIL. WAKTU';
  ws.getCell(analysisHeaderRow, 9).value = 'MINIT';

  for (let c = 1; c <= 9; c++) {
    const cell = ws.getCell(analysisHeaderRow, c);
    cell.font = { bold: true, size: 10, color: { argb: 'FFCC00CC' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF99' } };
    cell.alignment = { horizontal: c === 3 || c === 6 ? 'left' : 'center', vertical: 'middle' };
  }
  curRow++;

  bundle.analysisRows.forEach((row) => {
    ws.getRow(curRow).height = 20;
    ws.mergeCells(curRow, 1, curRow, 2);
    ws.getCell(curRow, 1).value = row.singkatanNama;
    ws.getCell(curRow, 1).alignment = { horizontal: 'center', vertical: 'middle' };

    ws.mergeCells(curRow, 3, curRow, 5);
    ws.getCell(curRow, 3).value = row.namaGuru;
    ws.getCell(curRow, 3).alignment = { horizontal: 'left', vertical: 'middle' };

    ws.mergeCells(curRow, 6, curRow, 7);
    ws.getCell(curRow, 6).value = row.mp;
    ws.getCell(curRow, 6).alignment = { horizontal: 'left', vertical: 'middle' };

    ws.getCell(curRow, 8).value = row.bilWaktu;
    ws.getCell(curRow, 8).alignment = { horizontal: 'center', vertical: 'middle' };

    ws.getCell(curRow, 9).value = row.minit;
    ws.getCell(curRow, 9).alignment = { horizontal: 'center', vertical: 'middle' };

    for (let c = 1; c <= 9; c++) {
      ws.getCell(curRow, c).font = { size: 9, bold: c === 1 || c >= 8 };
    }
    curRow++;
  });

  // JUMLAH row
  const jumlahRow = curRow;
  ws.getRow(jumlahRow).height = 22;
  ws.mergeCells(jumlahRow, 1, jumlahRow, 7);
  ws.getCell(jumlahRow, 1).value = 'JUMLAH';
  ws.getCell(jumlahRow, 1).alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell(jumlahRow, 8).value = bundle.totalWaktu;
  ws.getCell(jumlahRow, 8).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell(jumlahRow, 9).value = bundle.totalMinit;
  ws.getCell(jumlahRow, 9).alignment = { horizontal: 'center', vertical: 'middle' };

  for (let c = 1; c <= 9; c++) {
    const cell = ws.getCell(jumlahRow, c);
    cell.font = { bold: true, size: 10, color: { argb: 'FF000000' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF99' } };
  }

  applyGridOuterDoubleBorders(ws, analysisHeaderRow, jumlahRow, 1, 9);

  return ws;
}

export async function buildSingleClassWorkbook(
  grade: number,
  params: ExportCommonParams
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const used = new Set<string>();
  buildLampiranAClassSheet(wb, grade, params, used);
  return wb;
}

export async function buildSingleTeacherWorkbook(
  teacher: TeacherDirectoryEntry,
  params: ExportCommonParams
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const used = new Set<string>();
  buildLampiranBTeacherSheet(wb, teacher, params, used);
  return wb;
}

export async function buildMasterTimetableWorkbook(
  params: ExportCommonParams
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const used = new Set<string>();
  buildJadualIndukSheet(wb, params, used);
  return wb;
}

/**
 * Bulk workbook containing Master Timetable (Jadual Induk), all 6 Class Timetables (Lampiran A),
 * and all Teacher Personal Timetables (Lampiran B).
 */
export async function buildAllTimetablesWorkbook(
  params: ExportCommonParams
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const used = new Set<string>();

  // 1. Master Timetable (Jadual Induk)
  buildJadualIndukSheet(wb, params, used);

  // 2. All 6 Class Timetables (Lampiran A)
  [1, 2, 3, 4, 5, 6].forEach((g) => {
    buildLampiranAClassSheet(wb, g, params, used);
  });

  // 3. All Teacher Personal Timetables (Lampiran B)
  params.teacherMapping.list.forEach((teacher) => {
    buildLampiranBTeacherSheet(wb, teacher, params, used);
  });

  return wb;
}

export async function exportSingleClassToExcel(
  grade: number,
  params: ExportCommonParams
): Promise<void> {
  const wb = await buildSingleClassWorkbook(grade, params);
  const buffer = await wb.xlsx.writeBuffer();
  triggerBrowserDownload(buffer, `Lampiran_A_Tahun_${grade}_Sesi_${params.academicYear}.xlsx`);
}

export async function exportSingleTeacherToExcel(
  teacher: TeacherDirectoryEntry,
  params: ExportCommonParams
): Promise<void> {
  const wb = await buildSingleTeacherWorkbook(teacher, params);
  const buffer = await wb.xlsx.writeBuffer();
  triggerBrowserDownload(
    buffer,
    `Lampiran_B_${teacher.code}_Sesi_${params.academicYear}.xlsx`
  );
}

export async function exportMasterTimetableToExcel(
  params: ExportCommonParams
): Promise<void> {
  const wb = await buildMasterTimetableWorkbook(params);
  const buffer = await wb.xlsx.writeBuffer();
  triggerBrowserDownload(buffer, `Jadual_Induk_Sesi_${params.academicYear}.xlsx`);
}

export async function exportAllTimetablesToExcel(
  params: ExportCommonParams
): Promise<void> {
  const wb = await buildAllTimetablesWorkbook(params);
  const buffer = await wb.xlsx.writeBuffer();
  triggerBrowserDownload(
    buffer,
    `Semua_Jadual_Waktu_Induk_Kelas_Guru_Sesi_${params.academicYear}.xlsx`
  );
}
