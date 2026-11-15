import ExcelJS from 'exceljs';
import { DayOfWeek, DAYS_OF_WEEK } from '../components/Timetable/types';

export interface PrasekolahTimeBlock {
  id: string;
  day: DayOfWeek;
  slotCode: string; // e.g. 'PRA1', 'PRA2', 'REHAT_PRA'
  startTime: string; // '07:30'
  endTime: string;   // '08:10'
  startMinutes: number;
  endMinutes: number;
  activityName: string; // e.g. 'Perbualan Awal & Rutin Pagi'
  learningArea: string; // e.g. 'Tunjang Komunikasi / Sosioemosi'
  teacherCode: string;  // e.g. 'SW'
  teacherName?: string;
  ppmName?: string;
  isRecess?: boolean;
  requiresRelief?: boolean; // true for teaching blocks, false for recess
  periodEquivalent?: number; // e.g. 1.0 per 30-40m block
}

export interface PrasekolahTimetableDoc {
  id: string;
  schoolCode: string;
  academicYear: string;
  className: string; // e.g. 'Prasekolah Ceria'
  guruPrasekolahCode: string; // e.g. 'SW'
  guruPrasekolahName: string; // e.g. 'STEPHANIE WONG ENG HEE'
  ppmName: string; // e.g. 'PPM Prasekolah'
  sessionStart: string; // '07:30'
  sessionEnd: string;   // '11:30'
  blocks: Record<DayOfWeek, PrasekolahTimeBlock[]>;
  updatedAt: string;
  updatedByUid?: string;
}

export function parseTimeStringToMinutes(timeStr: string, fallback = 450): number {
  if (!timeStr) return fallback;
  const cleaned = String(timeStr).trim().replace('.', ':');
  const match = cleaned.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return fallback;
  return h * 60 + m;
}

export function formatMinutesToTime(minutes: number): string {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function computeBlockPeriodEquivalent(startMinutes: number, endMinutes: number, isRecess?: boolean): number {
  if (isRecess) return 0;
  const duration = Math.max(15, endMinutes - startMinutes);
  return Math.max(0.5, Math.round((duration / 30) * 10) / 10);
}

const DEFAULT_DAILY_BLUEPRINTS: Record<
  DayOfWeek,
  Array<{
    slotCode: string;
    startTime: string;
    endTime: string;
    activityName: string;
    learningArea: string;
    isRecess?: boolean;
  }>
> = {
  ISNIN: [
    {
      slotCode: 'PRA1',
      startTime: '07:30',
      endTime: '08:00',
      activityName: 'Perbualan Awal & Rutin Pagi',
      learningArea: 'Sosioemosi & Rutin Harian',
    },
    {
      slotCode: 'PRA2',
      startTime: '08:00',
      endTime: '08:40',
      activityName: 'Bahasa Melayu (Komunikasi Awal)',
      learningArea: 'Tunjang Komunikasi (BM)',
    },
    {
      slotCode: 'PRA3',
      startTime: '08:40',
      endTime: '09:20',
      activityName: 'Matematik Awal & Penyelesaian Masalah',
      learningArea: 'Tunjang Sains & Teknologi',
    },
    {
      slotCode: 'PRA4',
      startTime: '09:20',
      endTime: '09:50',
      activityName: 'Main Bebas Terancang (Free Play)',
      learningArea: 'Perkembangan Fizikal & Sosioemosi',
    },
    {
      slotCode: 'REHAT_PRA',
      startTime: '09:50',
      endTime: '10:20',
      activityName: 'Rehat, Kudapan & Pengurusan Diri (PPM)',
      learningArea: 'Rehat & Kesihatan Diri',
      isRecess: true,
    },
    {
      slotCode: 'PRA5',
      startTime: '10:20',
      endTime: '11:10',
      activityName: 'Aktiviti Pembelajaran Bertema (AP)',
      learningArea: 'Modul Bertema Bersepadu',
    },
    {
      slotCode: 'PRA6',
      startTime: '11:10',
      endTime: '11:30',
      activityName: 'Refleksi, Kemas Kelas & Penutup',
      learningArea: 'Refleksi Harian',
    },
  ],
  SELASA: [
    {
      slotCode: 'PRA1',
      startTime: '07:30',
      endTime: '08:00',
      activityName: 'Fizikal & Pergerakan Kreatif Luar',
      learningArea: 'Tunjang Fizikal & Estetika',
    },
    {
      slotCode: 'PRA2',
      startTime: '08:00',
      endTime: '08:40',
      activityName: 'Bahasa Cina (Komunikasi Awal)',
      learningArea: 'Tunjang Komunikasi (BC)',
    },
    {
      slotCode: 'PRA3',
      startTime: '08:40',
      endTime: '09:20',
      activityName: 'Sains Awal & Penerokaan Alam',
      learningArea: 'Tunjang Sains & Teknologi',
    },
    {
      slotCode: 'PRA4',
      startTime: '09:20',
      endTime: '09:50',
      activityName: 'Pendidikan Moral / Kerohanian',
      learningArea: 'Tunjang Kerohanian, Sikap & Nilai',
    },
    {
      slotCode: 'REHAT_PRA',
      startTime: '09:50',
      endTime: '10:20',
      activityName: 'Rehat, Kudapan & Pengurusan Diri (PPM)',
      learningArea: 'Rehat & Kesihatan Diri',
      isRecess: true,
    },
    {
      slotCode: 'PRA5',
      startTime: '10:20',
      endTime: '11:10',
      activityName: 'Kreativiti, Seni Visual & Kraf',
      learningArea: 'Tunjang Fizikal & Estetika',
    },
    {
      slotCode: 'PRA6',
      startTime: '11:10',
      endTime: '11:30',
      activityName: 'Refleksi, Kemas Kelas & Penutup',
      learningArea: 'Refleksi Harian',
    },
  ],
  RABU: [
    {
      slotCode: 'PRA1',
      startTime: '07:30',
      endTime: '08:00',
      activityName: 'Perbualan Awal & Bercerita Pagi',
      learningArea: 'Sosioemosi & Literasi Awal',
    },
    {
      slotCode: 'PRA2',
      startTime: '08:00',
      endTime: '08:40',
      activityName: 'Bahasa Inggeris (Early English / CEFR)',
      learningArea: 'Tunjang Komunikasi (BI)',
    },
    {
      slotCode: 'PRA3',
      startTime: '08:40',
      endTime: '09:20',
      activityName: 'Aktiviti Pembelajaran (Pusat Pembelajaran)',
      learningArea: 'Modul Bertema Bersepadu',
    },
    {
      slotCode: 'PRA4',
      startTime: '09:20',
      endTime: '09:50',
      activityName: 'Muzik, Lagu Kanak-Kanak & Ritma',
      learningArea: 'Tunjang Fizikal & Estetika',
    },
    {
      slotCode: 'REHAT_PRA',
      startTime: '09:50',
      endTime: '10:20',
      activityName: 'Rehat, Kudapan & Pengurusan Diri (PPM)',
      learningArea: 'Rehat & Kesihatan Diri',
      isRecess: true,
    },
    {
      slotCode: 'PRA5',
      startTime: '10:20',
      endTime: '11:10',
      activityName: 'Bahasa Cina / Literasi Bergambar',
      learningArea: 'Tunjang Komunikasi (BC)',
    },
    {
      slotCode: 'PRA6',
      startTime: '11:10',
      endTime: '11:30',
      activityName: 'Refleksi, Kemas Kelas & Penutup',
      learningArea: 'Refleksi Harian',
    },
  ],
  KHAMIS: [
    {
      slotCode: 'PRA1',
      startTime: '07:30',
      endTime: '08:00',
      activityName: 'Senaman Pagi & Permainan Luar',
      learningArea: 'Tunjang Fizikal & Kesihatan',
    },
    {
      slotCode: 'PRA2',
      startTime: '08:00',
      endTime: '08:40',
      activityName: 'Bahasa Melayu (Fonik & Bacaan Awal)',
      learningArea: 'Tunjang Komunikasi (BM)',
    },
    {
      slotCode: 'PRA3',
      startTime: '08:40',
      endTime: '09:20',
      activityName: 'Pendidikan Moral / Nilai Murni',
      learningArea: 'Tunjang Kerohanian, Sikap & Nilai',
    },
    {
      slotCode: 'PRA4',
      startTime: '09:20',
      endTime: '09:50',
      activityName: 'Main Bebas & Kemahiran Sosial',
      learningArea: 'Tunjang Ketrampilan Diri',
    },
    {
      slotCode: 'REHAT_PRA',
      startTime: '09:50',
      endTime: '10:20',
      activityName: 'Rehat, Kudapan & Pengurusan Diri (PPM)',
      learningArea: 'Rehat & Kesihatan Diri',
      isRecess: true,
    },
    {
      slotCode: 'PRA5',
      startTime: '10:20',
      endTime: '11:10',
      activityName: 'Aktiviti Pembelajaran (Sains & Kemanusiaan)',
      learningArea: 'Tunjang Kemanusiaan & Sains',
    },
    {
      slotCode: 'PRA6',
      startTime: '11:10',
      endTime: '11:30',
      activityName: 'Refleksi, Kemas Kelas & Penutup',
      learningArea: 'Refleksi Harian',
    },
  ],
  JUMAAT: [
    {
      slotCode: 'PRA1',
      startTime: '07:30',
      endTime: '08:00',
      activityName: 'Perbualan Awal & Amalan Kebersihan',
      learningArea: 'Rutin Pagi & Kesihatan',
    },
    {
      slotCode: 'PRA2',
      startTime: '08:00',
      endTime: '08:40',
      activityName: 'Bahasa Inggeris (Storytelling & Songs)',
      learningArea: 'Tunjang Komunikasi (BI)',
    },
    {
      slotCode: 'PRA3',
      startTime: '08:40',
      endTime: '09:20',
      activityName: 'Bahasa Cina (Tulisan & Kosa Kata Awal)',
      learningArea: 'Tunjang Komunikasi (BC)',
    },
    {
      slotCode: 'PRA4',
      startTime: '09:20',
      endTime: '09:50',
      activityName: 'Aktiviti Projek / Kerja Kumpulan Kecil',
      learningArea: 'Pembelajaran Berasaskan Projek',
    },
    {
      slotCode: 'REHAT_PRA',
      startTime: '09:50',
      endTime: '10:20',
      activityName: 'Rehat, Kudapan & Pengurusan Diri (PPM)',
      learningArea: 'Rehat & Kesihatan Diri',
      isRecess: true,
    },
    {
      slotCode: 'PRA5',
      startTime: '10:20',
      endTime: '11:10',
      activityName: 'Seni Kraf, Muzik & Drama Kanak-Kanak',
      learningArea: 'Tunjang Fizikal & Estetika',
    },
    {
      slotCode: 'PRA6',
      startTime: '11:10',
      endTime: '11:30',
      activityName: 'Refleksi Mingguan & Penutup',
      learningArea: 'Refleksi Mingguan',
    },
  ],
};

export function createDefaultPrasekolahTimetable(params: {
  id: string;
  schoolCode: string;
  academicYear: string;
  guruPrasekolahCode?: string;
  guruPrasekolahName?: string;
  ppmName?: string;
  className?: string;
}): PrasekolahTimetableDoc {
  const guruCode = (params.guruPrasekolahCode || 'SW').trim().toUpperCase();
  const guruName = (params.guruPrasekolahName || 'STEPHANIE WONG ENG HEE').trim();
  const ppmName = (params.ppmName || 'PPM Prasekolah').trim();
  const className = (params.className || 'Prasekolah').trim();

  const blocks: Record<DayOfWeek, PrasekolahTimeBlock[]> = {
    ISNIN: [],
    SELASA: [],
    RABU: [],
    KHAMIS: [],
    JUMAAT: [],
  };

  DAYS_OF_WEEK.forEach((day) => {
    blocks[day] = (DEFAULT_DAILY_BLUEPRINTS[day] || []).map((bp, idx) => {
      const startMinutes = parseTimeStringToMinutes(bp.startTime, 450);
      const endMinutes = parseTimeStringToMinutes(bp.endTime, startMinutes + 30);
      const isRecess = Boolean(bp.isRecess);
      return {
        id: `${day}_${bp.slotCode || idx + 1}`,
        day,
        slotCode: bp.slotCode || `PRA${idx + 1}`,
        startTime: formatMinutesToTime(startMinutes),
        endTime: formatMinutesToTime(endMinutes),
        startMinutes,
        endMinutes,
        activityName: bp.activityName,
        learningArea: bp.learningArea,
        teacherCode: guruCode,
        teacherName: guruName,
        ppmName,
        isRecess,
        requiresRelief: !isRecess,
        periodEquivalent: computeBlockPeriodEquivalent(startMinutes, endMinutes, isRecess),
      };
    });
  });

  return {
    id: params.id,
    schoolCode: params.schoolCode,
    academicYear: params.academicYear,
    className,
    guruPrasekolahCode: guruCode,
    guruPrasekolahName: guruName,
    ppmName,
    sessionStart: '07:30',
    sessionEnd: '11:30',
    blocks,
    updatedAt: new Date().toISOString(),
  };
}

export function normalizePrasekolahTimetableDoc(
  raw: Partial<PrasekolahTimetableDoc> | null | undefined,
  fallback: {
    id: string;
    schoolCode: string;
    academicYear: string;
    guruPrasekolahCode?: string;
    guruPrasekolahName?: string;
    ppmName?: string;
  }
): PrasekolahTimetableDoc {
  const base = createDefaultPrasekolahTimetable(fallback);
  if (!raw || typeof raw !== 'object') return base;

  const guruCode = (raw.guruPrasekolahCode || base.guruPrasekolahCode).trim().toUpperCase();
  const guruName = (raw.guruPrasekolahName || base.guruPrasekolahName).trim();
  const ppmName = (raw.ppmName || base.ppmName).trim();

  const normalizedBlocks: Record<DayOfWeek, PrasekolahTimeBlock[]> = {
    ISNIN: [],
    SELASA: [],
    RABU: [],
    KHAMIS: [],
    JUMAAT: [],
  };

  DAYS_OF_WEEK.forEach((day) => {
    const rawDayList = raw.blocks?.[day];
    if (Array.isArray(rawDayList) && rawDayList.length > 0) {
      normalizedBlocks[day] = rawDayList
        .map((b, idx) => {
          const startMinutes =
            typeof b.startMinutes === 'number' && !isNaN(b.startMinutes)
              ? b.startMinutes
              : parseTimeStringToMinutes(b.startTime, 450 + idx * 30);
          const endMinutes =
            typeof b.endMinutes === 'number' && !isNaN(b.endMinutes)
              ? b.endMinutes
              : parseTimeStringToMinutes(b.endTime, startMinutes + 30);
          const isRecess =
            Boolean(b.isRecess) ||
            /rehat|kudapan/i.test(b.activityName || '') ||
            /rehat/i.test(b.slotCode || '');
          const tCode = (b.teacherCode || guruCode).trim().toUpperCase();
          return {
            id: b.id || `${day}_PRA_${idx + 1}`,
            day,
            slotCode: b.slotCode || (isRecess ? 'REHAT_PRA' : `PRA${idx + 1}`),
            startTime: formatMinutesToTime(startMinutes),
            endTime: formatMinutesToTime(endMinutes),
            startMinutes,
            endMinutes,
            activityName: (b.activityName || 'Aktiviti Pembelajaran Prasekolah').trim(),
            learningArea: (b.learningArea || 'Modul Prasekolah').trim(),
            teacherCode: tCode,
            teacherName: b.teacherName || guruName,
            ppmName: b.ppmName || ppmName,
            isRecess,
            requiresRelief: b.requiresRelief !== undefined ? Boolean(b.requiresRelief) : !isRecess,
            periodEquivalent:
              typeof b.periodEquivalent === 'number' && b.periodEquivalent > 0
                ? b.periodEquivalent
                : computeBlockPeriodEquivalent(startMinutes, endMinutes, isRecess),
          };
        })
        .sort((a, b) => a.startMinutes - b.startMinutes);
    } else {
      normalizedBlocks[day] = base.blocks[day].map((b) => ({
        ...b,
        teacherCode: guruCode,
        teacherName: guruName,
        ppmName,
      }));
    }
  });

  return {
    id: raw.id || base.id,
    schoolCode: raw.schoolCode || base.schoolCode,
    academicYear: raw.academicYear || base.academicYear,
    className: raw.className || base.className,
    guruPrasekolahCode: guruCode,
    guruPrasekolahName: guruName,
    ppmName,
    sessionStart: raw.sessionStart || '07:30',
    sessionEnd: raw.sessionEnd || '11:30',
    blocks: normalizedBlocks,
    updatedAt: raw.updatedAt || base.updatedAt,
    updatedByUid: raw.updatedByUid,
  };
}

function mapRawDayName(rawDay: string): DayOfWeek | null {
  const u = (rawDay || '').trim().toUpperCase();
  if (!u) return null;
  if (u.includes('ISNIN') || u.includes('MON') || u === '1' || u.includes('星期一') || u.includes('周一')) return 'ISNIN';
  if (u.includes('SELASA') || u.includes('TUE') || u === '2' || u.includes('星期二') || u.includes('周二')) return 'SELASA';
  if (u.includes('RABU') || u.includes('WED') || u === '3' || u.includes('星期三') || u.includes('周三')) return 'RABU';
  if (u.includes('KHAMIS') || u.includes('THU') || u === '4' || u.includes('星期四') || u.includes('周四')) return 'KHAMIS';
  if (u.includes('JUMAAT') || u.includes('FRI') || u === '5' || u.includes('星期五') || u.includes('周五')) return 'JUMAAT';
  return null;
}

/**
 * Parses an uploaded Excel (.xlsx) or CSV (.csv) file into Monday-Friday PrasekolahTimeBlock records.
 * Supports:
 * 1) Row-based table format with columns: Hari | Masa Mula | Masa Tamat | Aktiviti / Tunjang | Guru | PPM
 * 2) Time-range single column e.g. Hari | Masa (07:30-08:10) | Aktiviti | Tunjang
 */
export async function parsePrasekolahUploadFile(
  file: File,
  defaults: {
    guruPrasekolahCode: string;
    guruPrasekolahName: string;
    ppmName: string;
  }
): Promise<{
  blocksByDay: Record<DayOfWeek, PrasekolahTimeBlock[]>;
  importedCount: number;
}> {
  const rows: string[][] = [];

  if (file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv') {
    const text = await file.text();
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((c) =>
          c.replace(/^"|"$/g, '').trim()
        );
        rows.push(cols);
      });
  } else {
    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];
    if (worksheet) {
      worksheet.eachRow((row) => {
        const vals: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          let cellText = '';
          if (cell.value !== null && cell.value !== undefined) {
            if (typeof cell.value === 'object' && 'text' in cell.value) {
              cellText = String((cell.value as { text: string }).text || '');
            } else if (cell.value instanceof Date) {
              const hh = String(cell.value.getUTCHours()).padStart(2, '0');
              const mm = String(cell.value.getUTCMinutes()).padStart(2, '0');
              cellText = `${hh}:${mm}`;
            } else {
              cellText = String(cell.value);
            }
          }
          vals[colNumber - 1] = cellText.trim();
        });
        if (vals.some(Boolean)) {
          rows.push(vals);
        }
      });
    }
  }

  const blocksByDay: Record<DayOfWeek, PrasekolahTimeBlock[]> = {
    ISNIN: [],
    SELASA: [],
    RABU: [],
    KHAMIS: [],
    JUMAAT: [],
  };

  let importedCount = 0;

  rows.forEach((cols) => {
    if (cols.length < 3) return;
    const day = mapRawDayName(cols[0] || '');
    if (!day) return;

    let startStr = '';
    let endStr = '';
    let activityName = '';
    let learningArea = '';
    let teacherCode = defaults.guruPrasekolahCode;
    let ppmName = defaults.ppmName;

    // Check if col[1] is a combined range like "07:30 - 08:00"
    const combinedMatch = (cols[1] || '').match(/(\d{1,2}[:.]\d{2})\s*[-–~]\s*(\d{1,2}[:.]\d{2})/);
    if (combinedMatch) {
      startStr = combinedMatch[1].replace('.', ':');
      endStr = combinedMatch[2].replace('.', ':');
      activityName = cols[2] || 'Aktiviti Pembelajaran';
      learningArea = cols[3] || 'Modul Prasekolah';
      if (cols[4]) teacherCode = cols[4].trim().toUpperCase();
      if (cols[5]) ppmName = cols[5].trim();
    } else {
      startStr = (cols[1] || '').replace('.', ':');
      endStr = (cols[2] || '').replace('.', ':');
      activityName = cols[3] || 'Aktiviti Pembelajaran';
      learningArea = cols[4] || 'Modul Prasekolah';
      if (cols[5]) teacherCode = cols[5].trim().toUpperCase();
      if (cols[6]) ppmName = cols[6].trim();
    }

    const startMinutes = parseTimeStringToMinutes(startStr, -1);
    const endMinutes = parseTimeStringToMinutes(endStr, -1);
    if (startMinutes < 0 || endMinutes <= startMinutes) return;

    const isRecess = /rehat|kudapan/i.test(activityName) || /rehat/i.test(learningArea);
    const nextIdx = blocksByDay[day].length + 1;
    const slotCode = isRecess ? 'REHAT_PRA' : `PRA${nextIdx}`;

    blocksByDay[day].push({
      id: `${day}_${slotCode}_${startMinutes}`,
      day,
      slotCode,
      startTime: formatMinutesToTime(startMinutes),
      endTime: formatMinutesToTime(endMinutes),
      startMinutes,
      endMinutes,
      activityName: activityName.trim(),
      learningArea: learningArea.trim(),
      teacherCode: teacherCode || defaults.guruPrasekolahCode,
      teacherName: defaults.guruPrasekolahName,
      ppmName: ppmName || defaults.ppmName,
      isRecess,
      requiresRelief: !isRecess,
      periodEquivalent: computeBlockPeriodEquivalent(startMinutes, endMinutes, isRecess),
    });
    importedCount++;
  });

  DAYS_OF_WEEK.forEach((d) => {
    blocksByDay[d].sort((a, b) => a.startMinutes - b.startMinutes);
  });

  return { blocksByDay, importedCount };
}

/**
 * Generates and downloads an Excel (.xlsx) template / backup of the isolated Prasekolah Timetable.
 */
export async function downloadPrasekolahTemplateExcel(doc: PrasekolahTimetableDoc): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Jadual Prasekolah');

  sheet.columns = [
    { header: 'HARI', key: 'day', width: 14 },
    { header: 'MASA MULA', key: 'startTime', width: 14 },
    { header: 'MASA TAMAT', key: 'endTime', width: 14 },
    { header: 'AKTIVITI / SLOT PRASEKOLAH', key: 'activityName', width: 38 },
    { header: 'TUNJANG / BIDANG PEMBELAJARAN', key: 'learningArea', width: 34 },
    { header: 'KOD GURU PRASEKOLAH', key: 'teacherCode', width: 20 },
    { header: 'NAMA PPM', key: 'ppmName', width: 24 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F766E' },
  };

  DAYS_OF_WEEK.forEach((day) => {
    const dayBlocks = doc.blocks[day] || [];
    dayBlocks.forEach((b) => {
      sheet.addRow({
        day,
        startTime: b.startTime,
        endTime: b.endTime,
        activityName: b.activityName,
        learningArea: b.learningArea,
        teacherCode: b.teacherCode || doc.guruPrasekolahCode,
        ppmName: b.ppmName || doc.ppmName,
      });
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Jadual_Prasekolah_${doc.schoolCode}_${doc.academicYear}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
