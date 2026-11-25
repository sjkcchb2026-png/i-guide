export type SetiausahaDocKind = 'OPR' | 'MEMO' | 'MINIT' | 'SURAT_LANTIKAN';

export interface InvitedCommitteeTeacher {
  teacherId: string;
  teacherName: string;
  committeeRole: string;
}

export type MinitAttendanceStatus = 'HADIR' | 'TIDAK_HADIR_BERSEBAB' | 'TIDAK_HADIR';

export interface MinitAttendanceRecord {
  teacherId: string;
  teacherName: string;
  committeeRole: string;
  status: MinitAttendanceStatus;
  reason?: string;
}

export interface TurutHadirRecord {
  id: string;
  name: string;
  role: string;
}

export interface AISetiausahaDocument {
  id: string;
  docKind: SetiausahaDocKind;
  sourceModule?: string;
  sourceActivityId?: string;
  sourceMemoId?: string;
  schoolCode: string;
  academicYear?: string;
  academicYears?: string[];
  pillar?: string;
  kodMySG?: string;
  jawatankuasaInduk?: string;
  jawatanRasmi?: string;
  skpmBucket?: string;
  secondarySkpmBucket?: string;
  additionalSkpmBuckets?: string[];
  skpmAspek271Linked?: boolean;
  skpmCodeBadge?: string;
  skpmStandard?: string;
  skpmAspek?: string;
  skpmStandardKualiti?: string;
  standardGroup?: string;
  subStandardCode?: string;
  subStandardTitle?: string;
  driveTargetFolderPath?: string[];
  programTitle: string;
  rujKami?: string;
  tarikh: string;
  masa?: string;
  tempat?: string;
  pengerusi?: string;
  sasaran?: string;
  peringkat?: string;
  pencapaian?: string;
  rawNotes?: string;
  agendaList?: string[];
  invitedTeachers?: InvitedCommitteeTeacher[];
  attendanceList?: MinitAttendanceRecord[];
  turutHadirList?: TurutHadirRecord[];
  objektif?: string[];
  pengisianAktiviti?: string[];
  impak?: string[];
  refleksiDanTindakanSusulan?: string[];
  photos?: string[];
  preparedByName?: string;
  preparedByTitle?: string;
  // Legacy / alternative field aliases for 100% backward compatibility
  tajukMesyuarat?: string;
  tarikhMesyuarat?: string;
  masaMesyuarat?: string;
  tempatMesyuarat?: string;
  agendaFokusUtama?: string[];
  recipientMode?: 'ALL_TEACHERS' | 'COMMITTEE_ONLY' | 'SEMUA_GURU' | 'AHLI_TERPILIH';
  recipientIds?: string[];
  recipientNames?: string[];
  hadirNames?: string[];
  tidakHadirBersebab?: { name: string; sebab: string }[];
  agendaEntries?: { bil: string; perkara: string; butiranPerbincangan: string; tindakan: string }[];
  folderUrl?: string;
  fileUrl?: string;
  folderPath?: string;
  driveFolderUrl?: string;
  driveFileUrl?: string;
  driveFolderPath?: string;
  driveSyncedAt?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SetiausahaExternalPrefill {
  targetTab: 'MEMO' | 'MINIT' | 'OPR';
  taskItem: any;
}

const MANDATORY_PKPA_AGENDA_PATTERNS: RegExp[] = [
  /^perutusan\s+pengerusi\b/i,
  /^ucapan\s+alu[- ]?aluan\s+pengerusi\b/i,
  /^pengesahan\s+minit(\s+mesyuarat)?(\s+yang\s+lalu|\s+lepas)?\b/i,
  /^perkara[- ]?perkara\s+berbangkit(\s*\(?maklum\s+balas(\s+pkpa)?.*\)?)?$/i,
  /^maklum\s+balas\s+minit\s+mesyuarat\b/i,
  /^hal[- ]?hal\s+lain\b/i,
  /^penutup(\s*\/?\s*penangguhan(\s+mesyuarat)?)?$/i,
  /^penangguhan\s+mesyuarat$/i,
  /^ucapan\s+penangguhan(\s+mesyuarat)?$/i,
];

export function cleanAgendaFokusLines(input: string | string[] | undefined | null): string[] {
  if (!input) return [];
  const rawJoined = Array.isArray(input) ? input.join('\n') : String(input || '');
  if (!rawJoined.trim()) return [];

  let cleanedBlock = rawJoined
    .replace(/^[\s\S]*?agenda\s+fokus\s*:\s*/i, '')
    .replace(
      /^jawatankuasa\s+[^|\n]*?(?:·|\|)\s*masa\s*:[^|\n]*?(?:·|\|)\s*tempat\s*:[^.\n]*\.?\s*/i,
      ''
    );

  const rawSegments = cleanedBlock.split(/\r?\n|\s+\|\s+/);
  const results: string[] = [];
  const seen = new Set<string>();

  for (const seg of rawSegments) {
    let line = seg.trim();
    if (!line) continue;

    if (
      /^jawatankuasa\b/i.test(line) &&
      (/\bmasa\s*:/i.test(line) || /\btempat\s*:/i.test(line))
    ) {
      line = line
        .replace(/^jawatankuasa[\s\S]*?(?:agenda\s+fokus\s*:|\.\s+)/i, '')
        .trim();
    }
    line = line.replace(/^agenda\s+fokus\s*:\s*/i, '').trim();
    line = line.replace(/^(?:[-•*]|\d+(?:\.\d+)*[.)]?)\s+/, '').trim();
    line = line.replace(/^(?:[-•*]|\d+(?:\.\d+)*[.)]?)\s+/, '').trim();

    if (!line) continue;
    const isMandatoryItem = MANDATORY_PKPA_AGENDA_PATTERNS.some((rx) => rx.test(line));
    if (isMandatoryItem) continue;

    const normKey = line.toUpperCase();
    if (!seen.has(normKey)) {
      seen.add(normKey);
      results.push(line);
    }
  }

  return results;
}

export interface ResolvedDocumentSessions {
  primaryYear: string;
  academicYears: string[];
  isDualSession: boolean;
  badgeLabel: string;
}

export function resolveDocumentSessions(params: {
  title?: string;
  agendaText?: string;
  tarikh?: string;
  fallbackYear?: string;
}): ResolvedDocumentSessions {
  const titleText = String(params.title || '');
  const agendaStr = String(params.agendaText || '');
  const combinedText = `${titleText} ${agendaStr}`;
  const foundYears = new Set<string>();

  const regexYearMatches = combinedText.match(/\b(202[4-9]|203[0-5])\b/g);
  if (regexYearMatches) {
    regexYearMatches.forEach((yr) => foundYears.add(yr));
  }

  const tarikhStr = String(params.tarikh || '').trim();
  const dateYearMatch = tarikhStr.match(/^(202[4-9]|203[0-5])-\d{2}-\d{2}/);
  const dateYear = dateYearMatch ? dateYearMatch[1] : '';
  if (dateYear) {
    foundYears.add(dateYear);
  }

  if (foundYears.size === 0) {
    const fb = String(params.fallbackYear || '2026').trim() || '2026';
    foundYears.add(fb);
  }

  const sortedYears = Array.from(foundYears).sort((a, b) => a.localeCompare(b));
  const titleYearMatches = titleText.match(/\b(202[4-9]|203[0-5])\b/g);
  const primaryYear =
    dateYear ||
    (titleYearMatches && titleYearMatches[0]) ||
    sortedYears[0] ||
    String(params.fallbackYear || '2026');

  const isDualSession = sortedYears.length > 1;
  const badgeLabel = isDualSession
    ? `Sesi ${sortedYears.join(' & ')}`
    : `Sesi ${primaryYear}`;

  return {
    primaryYear,
    academicYears: sortedYears,
    isDualSession,
    badgeLabel,
  };
}

export function resolveDocSessionYear(
  title?: string,
  tarikh?: string,
  fallbackYear: string = '2026'
): string {
  return resolveDocumentSessions({ title, tarikh, fallbackYear }).primaryYear;
}

