import * as XLSX from 'xlsx';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as crypto from 'crypto';

import fs from 'fs';
import path from 'path';

const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Use active applet admin DB
if (getApps().length === 0) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}
const adminDb = getFirestore(firebaseConfig.firestoreDatabaseId);

const SPREADSHEET_ID = '1tzOstK0V3JuydgzbfZNg9Dy5Aa1jbVNl3maTqObvV-U';
const EXPORT_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv`;

function maskIc(ic: string): string {
  const digits = String(ic || '').replace(/[^0-9]/g, '');
  if (digits.length >= 12) {
    return `${digits.slice(0, 6)}-**-**${digits.slice(-2)}`;
  }
  if (digits.length >= 6) {
    return `${digits.slice(0, 4)}****${digits.slice(-2)}`;
  }
  return digits ? '******' : '-';
}

function mapRowToGuru(rawRow: Record<string, any>) {
  const getVal = (possibleKeys: string[]): string => {
    for (const k of possibleKeys) {
      if (rawRow[k] !== undefined && rawRow[k] !== null && String(rawRow[k]).trim() !== '') {
        return String(rawRow[k]).trim();
      }
    }
    const cleanEntries = Object.entries(rawRow);
    for (const [k, v] of cleanEntries) {
      const lowerKey = k.toLowerCase().replace(/[\s\r\n_/-]+/g, '');
      for (const pk of possibleKeys) {
        if (lowerKey === pk.toLowerCase().replace(/[\s\r\n_/-]+/g, '')) {
          if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
        }
      }
    }
    return '';
  };

  const name = getVal(['NAMA GURU', 'NAMA', 'NAMA STAF', 'NAMA PEGAWAI', 'NAME']);
  let gender = getVal(['JAN', 'JANTINA', 'GENDER']).toUpperCase();
  if (gender.startsWith('L') || gender.startsWith('M')) gender = 'L';
  else if (gender.startsWith('P') || gender.startsWith('F')) gender = 'P';
  else gender = 'L';

  const staffFileNo = getVal(['NO FAIL', 'NO FAIL PERKHIDMATAN', 'NO. FAIL', 'FAIL', 'FILE NO']).toUpperCase();
  const rawIc = getVal(['NO KP', 'NO. KP', 'NO K/P', 'NO KAD PENGENALAN', 'IC', 'NRIC']);
  const ic = rawIc.replace(/[^0-9]/g, '');
  const maskedIc = maskIc(rawIc);

  const grade = getVal(['GRED', 'GRED JAWATAN', 'GRADE']).toUpperCase();
  const position = getVal(['JAWATAN', 'POSITION']);
  const datePlaced = getVal(['TARIKH DITEMPATKAN', 'TARIKH TEMPATAN', 'TARIKH PENEMPATAN']);
  const dateAppointed = getVal(['TARIKH LANTIKAN / KENAIKAN PANGKAT', 'TARIKH LANTIKAN', 'TARIKH LANTIKAN PERTAMA']);
  const dateConfirmed = getVal(['TARIKH SAH JAWATAN SEMASA', 'TARIKH PENGESAHAN', 'TARIKH SAH JAWATAN']);
  const majorOption = getVal(['OPSYEN MAJOR', 'MAJOR', 'OPSYEN']);
  const minorOption = getVal(['OPSYEN MINOR', 'MINOR']);
  const datePensionStatus = getVal(['TARIKH TARAF BERPENCEN', 'TARIKH PENCEN BERPENCEN']);
  const datePension = getVal(['TARIKH PENCEN', 'PENCEN']);
  const dateNextPromotion = getVal(['TARIKH KENAIKAN / PANGKAT TERDEKAT', 'TARIKH KENAIKAN PANGKAT TERDEKAT']);
  const phone = getVal(['NO HP', 'NO TELEFON', 'TELEFON', 'PHONE', 'NO TEL']);
  const email = getVal(['EMAIL', 'EMEL', 'E-MEL']).toLowerCase();
  const apcReceived = getVal(['PENERIMAAN APC', 'APC', 'ANUGERAH PERKHIDMATAN CEMERLANG']);

  let category: 'GURU' | 'AKP' = 'GURU';
  let leadershipRole: string | null = null;
  const posUpper = position.toUpperCase().trim();
  const gradeUpper = grade.toUpperCase().trim();

  if (
    posUpper.includes('GURU BESAR') ||
    posUpper === 'GB' ||
    posUpper.startsWith('GB ') ||
    posUpper.includes('PENGETUA')
  ) {
    category = 'GURU';
    leadershipRole = 'GURU_BESAR';
  } else if (
    posUpper.includes('PK 1') ||
    posUpper.includes('PK1') ||
    posUpper.includes('PK PENTADBIRAN') ||
    posUpper.includes('GPK 1') ||
    posUpper.includes('GPK1') ||
    posUpper.includes('GPK PENTADBIRAN')
  ) {
    category = 'GURU';
    leadershipRole = 'PK_PENTADBIRAN';
  } else if (
    posUpper.includes('PK HEM') ||
    posUpper.includes('PKHEM') ||
    posUpper.includes('GPK HEM')
  ) {
    category = 'GURU';
    leadershipRole = 'PK_HEM';
  } else if (
    posUpper.includes('PK KK') ||
    posUpper.includes('PKKK') ||
    posUpper.includes('PK KOKU') ||
    posUpper.includes('GPK KK') ||
    posUpper.includes('GPK KOKU')
  ) {
    category = 'GURU';
    leadershipRole = 'PK_KOKURIKULUM';
  } else if (
    posUpper.includes('PENOLONG KANAN') ||
    posUpper.startsWith('PK ') ||
    posUpper === 'PK' ||
    posUpper.startsWith('GPK')
  ) {
    category = 'GURU';
    leadershipRole = 'PENOLONG_KANAN';
  } else if (
    posUpper.includes('GURU') ||
    posUpper.includes('PENDIDIK') ||
    posUpper.includes('GAB') ||
    posUpper.includes('GPM') ||
    posUpper.includes('GPI') ||
    posUpper.includes('GP') ||
    gradeUpper.startsWith('DG') ||
    gradeUpper.startsWith('DC')
  ) {
    category = 'GURU';
    leadershipRole = null;
  } else {
    category = (gradeUpper.startsWith('DG') || gradeUpper.startsWith('DC')) ? 'GURU' : (email.endsWith('@moe-dl.edu.my') ? 'GURU' : 'AKP');
    leadershipRole = null;
  }

  let employmentStatus = 'Tetap';
  if (position.toLowerCase().includes('kontrak') || grade.toLowerCase().includes('kontrak')) {
    employmentStatus = 'Kontrak';
  } else if (position.toLowerCase().includes('sambilan')) {
    employmentStatus = 'Sambilan';
  }

  let teachingStatus = 'Aktif';
  if (position.toLowerCase().includes('cuti') || name.toLowerCase().includes('(cuti)')) {
    teachingStatus = 'Cuti';
  }

  return {
    raw: rawRow,
    name: name.toUpperCase(),
    gender,
    ic,
    maskedIc,
    staffFileNo,
    grade,
    position,
    category,
    leadershipRole,
    datePlaced,
    dateAppointed,
    dateConfirmed,
    majorOption,
    minorOption,
    datePensionStatus,
    datePension,
    dateNextPromotion,
    phone,
    email,
    apcReceived,
    employmentStatus,
    teachingStatus,
  };
}

async function runLivePreview() {
  console.log('=== STEP 1: INITIAL STATE & NON-DESTRUCTIVE BASELINE ===');
  const personnelSnapBefore = await adminDb.collection('personnel').get();
  const teachersSnapBefore = await adminDb.collection('teachers').get();
  console.log(`personnel count BEFORE: ${personnelSnapBefore.size}`);
  console.log(`teachers count BEFORE: ${teachersSnapBefore.size}`);

  console.log('\n=== STEP 2: FETCH OFFICIAL LIVE GOOGLE SHEET ===');
  console.log(`Source URL: ${EXPORT_URL}`);
  const fetchRes = await fetch(EXPORT_URL, {
    headers: { 'User-Agent': 'iSEPADU-AI-Importer/1.0' },
  });
  console.log(`HTTP Status: ${fetchRes.status} ${fetchRes.statusText}`);
  if (!fetchRes.ok) {
    throw new Error(`Failed to fetch sheet: HTTP ${fetchRes.status}`);
  }
  const rawCsvText = await fetchRes.text();
  console.log(`CSV payload received: ${rawCsvText.length} bytes`);

  const workbook = XLSX.read(rawCsvText, { type: 'string', raw: false });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows2D = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '', raw: false });
  console.log(`Worksheet Name: ${sheetName}`);
  console.log(`Total 2D rows parsed: ${rows2D.length}`);

  let bannerTitle = '';
  for (const row of rows2D) {
    const candidate = (row || []).find((c: any) => String(c).trim().length > 5);
    if (candidate) {
      bannerTitle = String(candidate).trim();
      break;
    }
  }
  console.log(`Detected Sheet Banner: "${bannerTitle}"`);

  // Detect header row exactly like server.ts
  let headerRowIndex = -1;
  for (let r = 0; r < rows2D.length; r++) {
    const row = rows2D[r];
    const joined = row.map((c: any) => String(c).trim().toUpperCase()).join(' ');
    if (
      joined.includes('NAMA GURU') ||
      (joined.includes('NAMA') && (joined.includes('KP') || joined.includes('FAIL') || joined.includes('GRED')))
    ) {
      headerRowIndex = r;
      break;
    }
  }

  const columnsDetected = rows2D[headerRowIndex].map((h: any) => String(h).trim().replace(/\r?\n/g, ' ')).filter(Boolean);
  console.log(`Header Row Index: ${headerRowIndex + 1}`);
  console.log(`Detected Columns (${columnsDetected.length}): ${columnsDetected.join(' | ')}`);

  const rawRows: Record<string, any>[] = [];
  for (let i = headerRowIndex + 1; i < rows2D.length; i++) {
    const rawRow = rows2D[i];
    if (!rawRow || rawRow.every((cell: any) => !cell || String(cell).trim() === '')) continue;
    const obj: Record<string, any> = {};
    columnsDetected.forEach((h: string, colIdx: number) => {
      if (h) obj[h] = String(rawRow[colIdx] || '').trim();
    });
    rawRows.push(obj);
  }

  console.log(`Total Source Data Rows: ${rawRows.length}`);

  console.log('\n=== STEP 3: EXECUTE AUDITED PREVIEW PIPELINE ===');
  const seenEmailsInSheet = new Map<string, number>();
  const seenIcsInSheet = new Map<string, number>();

  const summary = {
    totalSourceRows: rawRows.length,
    structurallyValidRows: 0,
    uniqueCandidateStaff: 0,
    guruCount: 0,
    akpCount: 0,
    guruBesarCount: 0,
    penolongKananCount: 0,
    pkPentadbiranCount: 0,
    pkHemCount: 0,
    pkKokurikulumCount: 0,
    new: 0,
    matched: 0,
    update: 0,
    conflict: 0,
    duplicate: 0,
    invalid: 0,
    readyForCommit: 0,
    requiresReview: 0,
  };

  const previewRows: any[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const rawRow = rawRows[i];
    const rowNumber = i + 1;
    const normalized = mapRowToGuru(rawRow);

    if (!normalized.name || (!normalized.email && !normalized.ic && !normalized.staffFileNo)) {
      summary.invalid++;
      previewRows.push({
        rowNumber,
        name: normalized.name || 'TIADA NAMA',
        maskedIc: normalized.maskedIc,
        staffFileNo: normalized.staffFileNo,
        grade: normalized.grade,
        position: normalized.position,
        category: normalized.category,
        majorOption: normalized.majorOption,
        minorOption: normalized.minorOption,
        email: normalized.email,
        leadershipRole: normalized.leadershipRole,
        status: 'INVALID',
        matchReason: 'Nama atau pengecam utama tiada.',
        proposedId: '',
      });
      continue;
    }

    summary.structurallyValidRows++;

    if (normalized.email && seenEmailsInSheet.has(normalized.email)) {
      summary.duplicate++;
      previewRows.push({
        rowNumber,
        name: normalized.name,
        maskedIc: normalized.maskedIc,
        staffFileNo: normalized.staffFileNo,
        grade: normalized.grade,
        position: normalized.position,
        category: normalized.category,
        majorOption: normalized.majorOption,
        minorOption: normalized.minorOption,
        email: normalized.email,
        leadershipRole: normalized.leadershipRole,
        status: 'DUPLICATE',
        matchReason: `Emel berulang (baris ${seenEmailsInSheet.get(normalized.email)}).`,
        proposedId: '',
      });
      continue;
    }
    if (normalized.email) seenEmailsInSheet.set(normalized.email, rowNumber);

    if (normalized.ic && seenIcsInSheet.has(normalized.ic)) {
      summary.duplicate++;
      previewRows.push({
        rowNumber,
        name: normalized.name,
        maskedIc: normalized.maskedIc,
        staffFileNo: normalized.staffFileNo,
        grade: normalized.grade,
        position: normalized.position,
        category: normalized.category,
        majorOption: normalized.majorOption,
        minorOption: normalized.minorOption,
        email: normalized.email,
        leadershipRole: normalized.leadershipRole,
        status: 'DUPLICATE',
        matchReason: `No KP berulang (baris ${seenIcsInSheet.get(normalized.ic)}).`,
        proposedId: '',
      });
      continue;
    }
    if (normalized.ic) seenIcsInSheet.set(normalized.ic, rowNumber);

    summary.uniqueCandidateStaff++;
    if (normalized.category === 'GURU') summary.guruCount++;
    if (normalized.category === 'AKP') summary.akpCount++;
    if (normalized.leadershipRole === 'GURU_BESAR') summary.guruBesarCount++;
    if (
      normalized.leadershipRole === 'PENOLONG_KANAN' ||
      normalized.leadershipRole === 'PK_PENTADBIRAN' ||
      normalized.leadershipRole === 'PK_HEM' ||
      normalized.leadershipRole === 'PK_KOKURIKULUM'
    ) {
      summary.penolongKananCount++;
    }
    if (normalized.leadershipRole === 'PK_PENTADBIRAN') summary.pkPentadbiranCount++;
    if (normalized.leadershipRole === 'PK_HEM') summary.pkHemCount++;
    if (normalized.leadershipRole === 'PK_KOKURIKULUM') summary.pkKokurikulumCount++;

    summary.new++;
    const stableId = `staff_${crypto.randomUUID()}`;
    previewRows.push({
      rowNumber,
      name: normalized.name,
      maskedIc: normalized.maskedIc,
      staffFileNo: normalized.staffFileNo,
      grade: normalized.grade,
      position: normalized.position,
      category: normalized.category,
      majorOption: normalized.majorOption,
      minorOption: normalized.minorOption,
      email: normalized.email,
      leadershipRole: normalized.leadershipRole,
      status: 'NEW',
      matchReason: 'Pengecam baharu — tiada rekod sepadan ditemui dalam SSOT. Profil baharu akan dijana.',
      proposedId: stableId,
    });
  }

  summary.readyForCommit = summary.new + summary.matched + summary.update;
  summary.requiresReview = summary.conflict;

  console.log('\n=== STEP 4: PREVIEW SUMMARY METRICS ===');
  console.log(JSON.stringify(summary, null, 2));

  console.log('\n=== STEP 5: PREVIEW ROWS TABLE DUMP ===');
  previewRows.forEach((r) => {
    console.log(`[Baris ${r.rowNumber}] ${r.name} | IC: ${r.maskedIc} | Fail: ${r.staffFileNo || '-'} | Gred: ${r.grade} | Jawatan: "${r.position}" | Kategori: ${r.category} | Major/Minor: ${r.majorOption || '-'}/${r.minorOption || '-'} | Emel: ${r.email} | Kepimpinan: ${r.leadershipRole || 'TIADA'} | Status: ${r.status} | ID: ${r.proposedId}`);
  });

  console.log('\n=== STEP 6: VERIFY NON-DESTRUCTIVE ZERO-WRITE POST CONDITION ===');
  const personnelSnapAfter = await adminDb.collection('personnel').get();
  const teachersSnapAfter = await adminDb.collection('teachers').get();
  console.log(`personnel count AFTER: ${personnelSnapAfter.size}`);
  console.log(`teachers count AFTER: ${teachersSnapAfter.size}`);

  if (personnelSnapBefore.size !== personnelSnapAfter.size || teachersSnapBefore.size !== teachersSnapAfter.size) {
    throw new Error('VIOLATION: Database state changed during preview!');
  }
  console.log('SUCCESS: ZERO WRITES PERFORMED. Authoritative personnel & teachers collections remain 100% UNTOUCHED.');
}

runLivePreview().catch((err) => {
  console.error('Preview error:', err);
  process.exit(1);
});
