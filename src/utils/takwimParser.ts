import * as XLSX from 'xlsx';

export type SchoolDomain = 'KURIKULUM' | 'HEM' | 'KOKURIKULUM';
export type MaklumanSource = 'TAKWIM_EXCEL' | 'AD_HOC';

export interface ParsedTakwimEvent {
  id: string;
  monthSheet: string;
  minggu: number | null;
  hari: string;
  dateStr: string; // YYYY-MM-DD
  timeStr: string;
  title: string;
  domain: SchoolDomain;
  category: 'TUGASAN' | 'KURSUS' | 'MESYUARAT' | 'PERTANDINGAN' | 'AKTIVITI';
  tindakan: string;
  isHoliday: boolean;
  source: MaklumanSource;
}

export const MONTH_SHEET_MAP: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAC: 3,
  APRIL: 4,
  MEI: 5,
  JUN: 6,
  JULAI: 7,
  OGOS: 8,
  SEPT: 9,
  OKT: 10,
  NOV: 11,
  DIS: 12,
};

export const HOLIDAY_KEYWORDS = [
  'CUTI',
  'CUTU',
  'GOOD FRIDAY',
  'EASTER',
  'CHING MING',
  'HARI RAYA',
  'HARI WESAK',
  'DRAGON BOAT',
  'HARI SARAWAK',
  'MAULIDUR',
  'MOON CAKE',
  'HARI MALAYSIA',
  'KEPUTERAAN',
  'DEEPAVALI',
];

export function inferCategory(title: string): ParsedTakwimEvent['category'] {
  const u = title.toUpperCase();
  if (u.includes('MESYUARAT') || u.includes('TAKLIMAT') || u.includes('PLC')) return 'MESYUARAT';
  if (u.includes('KURSUS') || u.includes('LDP') || u.includes('BENGKEL') || u.includes('LATIHAN')) return 'KURSUS';
  if (u.includes('PERTANDINGAN') || u.includes('KEJOHANAN') || u.includes('KARNIVAL')) return 'PERTANDINGAN';
  if (u.includes('LAPORAN') || u.includes('SEMAKAN') || u.includes('PENGHANTARAN')) return 'TUGASAN';
  return 'AKTIVITI';
}

export function inferDomainFromTitle(title: string, fallback: SchoolDomain): SchoolDomain {
  const u = title.toUpperCase();
  if (u.includes('KOKURIKULUM') || u.includes('SUKAN') || u.includes('BERUNIFORM') || u.includes('KELAB')) {
    return 'KOKURIKULUM';
  }
  if (
    u.includes('HEM') ||
    u.includes('HAL EHWAL MURID') ||
    u.includes('PENDAFTARAN MURID') ||
    u.includes('ORIENTASI') ||
    u.includes('DISIPLIN') ||
    u.includes('3K') ||
    u.includes('SPBT') ||
    u.includes('RMT')
  ) {
    return 'HEM';
  }
  if (u.includes('KURIKULUM') || u.includes('PANITIA') || u.includes('TRANSISI') || u.includes('PBD') || u.includes('UASA')) {
    return 'KURIKULUM';
  }
  return fallback;
}

export function parseTakwimExcelFile(
  arrayBuffer: ArrayBuffer,
  academicYear = 2027
): ParsedTakwimEvent[] {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const results: ParsedTakwimEvent[] = [];
  const seenKeys = new Set<string>();

  workbook.SheetNames.forEach((sheetName) => {
    const cleanSheet = sheetName.trim().toUpperCase();
    const monthNum = MONTH_SHEET_MAP[cleanSheet];
    if (!monthNum) return;

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;

    // Expand merged cells into a lookup map so merged dates/days/events are preserved
    const merges = sheet['!merges'] || [];
    const getCellVal = (r: number, c: number): string => {
      const directAddr = XLSX.utils.encode_cell({ r, c });
      if (sheet[directAddr] && sheet[directAddr].v !== undefined && sheet[directAddr].v !== null) {
        return String(sheet[directAddr].v).trim();
      }
      for (const m of merges) {
        if (r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c) {
          const topLeftAddr = XLSX.utils.encode_cell({ r: m.s.r, c: m.s.c });
          if (sheet[topLeftAddr] && sheet[topLeftAddr].v !== undefined && sheet[topLeftAddr].v !== null) {
            return String(sheet[topLeftAddr].v).trim();
          }
        }
      }
      return '';
    };

    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:I50');
    let seenDay1 = false;
    let lastMinggu: number | null = null;
    let lastHari = '';
    let lastTarikh: number | null = null;

    for (let r = 2; r <= range.e.r; r++) {
      const rawMinggu = getCellVal(r, 0);
      const rawHari = getCellVal(r, 1);
      const rawTarikh = getCellVal(r, 2);

      if (rawMinggu && /^\d+$/.test(rawMinggu.replace(/\.0$/, ''))) {
        lastMinggu = parseInt(rawMinggu, 10);
      }
      if (rawHari) {
        lastHari = rawHari.toUpperCase();
      }
      if (rawTarikh && /^\d+$/.test(rawTarikh.replace(/\.0$/, ''))) {
        lastTarikh = parseInt(rawTarikh, 10);
        if (lastTarikh === 1) {
          seenDay1 = true;
        }
      }

      if (lastTarikh === null) continue;

      // Handle December pre-school registration/meeting days at top of JAN sheet (e.g., 29, 30, 31 Dec 2026)
      const actualYear = cleanSheet === 'JAN' && !seenDay1 && lastTarikh >= 20 ? academicYear - 1 : academicYear;
      const actualMonth = cleanSheet === 'JAN' && !seenDay1 && lastTarikh >= 20 ? 12 : monthNum;
      const dateStr = `${actualYear}-${String(actualMonth).padStart(2, '0')}-${String(lastTarikh).padStart(2, '0')}`;

      const colD = getCellVal(r, 3); // MASA or full-row merged event
      const colE = getCellVal(r, 4); // PENGURUSAN / KURIKULUM
      const colF = getCellVal(r, 5); // HAL EHWAL MURID
      const colG = getCellVal(r, 6); // KOKURIKULUM
      const colH = getCellVal(r, 7); // TINDAKAN

      const pushExtractedText = (rawText: string, defaultDomain: SchoolDomain, masaStr: string) => {
        if (!rawText) return;
        const normalized = rawText
          .replace(/SERI PADUKA\s*\r?\n\s*BAGINDA/gi, 'SERI PADUKA BAGINDA')
          .trim();

        const lines = normalized
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);

        for (const line of lines) {
          const upper = line.toUpperCase();
          const isHoliday = HOLIDAY_KEYWORDS.some((kw) => upper.includes(kw));
          const domain = inferDomainFromTitle(line, defaultDomain);
          const category = inferCategory(line);
          const uniqueKey = `${dateStr}__${domain}__${line.toUpperCase()}`;

          if (seenKeys.has(uniqueKey)) continue;
          seenKeys.add(uniqueKey);

          results.push({
            id: `takwim_${dateStr}_${results.length + 1}`,
            monthSheet: cleanSheet,
            minggu: lastMinggu,
            hari: lastHari,
            dateStr,
            timeStr: masaStr,
            title: line,
            domain,
            category,
            tindakan: colH && colH !== line ? colH : 'SEMUA GURU',
            isHoliday,
            source: 'TAKWIM_EXCEL',
          });
        }
      };

      const isColDEvent = colD.length > 0 && !/^\d/.test(colD);
      if (isColDEvent) {
        pushExtractedText(colD, 'KURIKULUM', '');
      } else {
        const masaStr = colD;
        if (colE && colE === colF && colF === colG) {
          pushExtractedText(colE, 'KURIKULUM', masaStr);
        } else {
          if (colE && colE !== colD) pushExtractedText(colE, 'KURIKULUM', masaStr);
          if (colF && colF !== colE) pushExtractedText(colF, 'HEM', masaStr);
          if (colG && colG !== colF) pushExtractedText(colG, 'KOKURIKULUM', masaStr);
        }
      }
    }
  });

  return results;
}
