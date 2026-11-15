import assert from 'node:assert/strict';
import { createEmptyScheduleGrid } from '../src/components/Timetable/autoScheduler';
import { buildDefaultCurriculumMatrix, getDefaultClassTeachers } from '../src/constants/defaultCurriculumMatrix';
import { OFFICIAL_TEACHERS } from '../src/constants/officialRoster';
import {
  OPTION_A_COLUMNS,
  buildClassLampiranAAnalysis,
  buildTeacherOptionAMatrix,
} from '../src/utils/lampiranData';
import { buildAllTimetablesWorkbook } from '../src/utils/timetableExport';
import {
  dateStrToDayOfWeek,
  detectAbsentTeachersForDate,
  generateAutoReliefPlan,
} from '../src/utils/autoReliefEngine';

async function runTests() {
  const teacherMapping = {
    list: OFFICIAL_TEACHERS.map((t) => ({
      id: t.id,
      num: t.num,
      code: t.code,
      name: t.name,
    })),
  };

  const grid = createEmptyScheduleGrid();
  const academicYear = '2027';

  // Populate representative schedule cells across Tahun 1 and Tahun 2 for ISNIN & SELASA
  // Tahun 1 ISNIN:
  // MEMBACA (07:15-07:30) assigned to LRR
  grid[1].ISNIN.MEMBACA = {
    subjectId: 'membaca',
    subjectCode: 'MEMBACA',
    subjectName: 'PROGRAM MEMBACA',
    teacherCode: 'LRR',
    periodLength: 0.5,
  };
  // W1 (07:30-08:00) assigned to LRR (BC)
  grid[1].ISNIN.W1 = {
    subjectId: 'bc',
    subjectCode: 'BC',
    subjectName: 'BAHASA CINA',
    teacherCode: 'LRR',
    periodLength: 1,
  };
  // W2 (08:00-08:30) assigned to KL (BM)
  grid[1].ISNIN.W2 = {
    subjectId: 'bm',
    subjectCode: 'BM',
    subjectName: 'BAHASA MELAYU',
    teacherCode: 'KL',
    periodLength: 1,
  };
  // W3 (08:30-09:00) assigned to DT (BI)
  grid[1].ISNIN.W3 = {
    subjectId: 'bi',
    subjectCode: 'BI',
    subjectName: 'BAHASA INGGERIS',
    teacherCode: 'DT',
    periodLength: 1,
  };
  // W4 (09:00-09:30) assigned to NCY/VY (AM Co-Teaching) — PKAR should auto-populate for both NCY & VY!
  grid[1].ISNIN.W4 = {
    subjectId: 'am',
    subjectCode: 'AM',
    subjectName: 'ALAM DAN MANUSIA',
    teacherCode: 'NCY/VY',
    isCoTeaching: true,
    periodLength: 1,
  };
  // Note: deliberately omit grid[1].ISNIN.PKAR to verify auto-population from W4!
  // T1 W5 (10:15-10:45 post-recess -> maps to Col W6) assigned to LRR (BC)
  grid[1].ISNIN.W5 = {
    subjectId: 'bc',
    subjectCode: 'BC',
    subjectName: 'BAHASA CINA',
    teacherCode: 'LRR',
    periodLength: 1,
  };

  // SELASA W1 (PN) & W4 (SW/MFA PM/PAI)
  grid[1].SELASA.W1 = {
    subjectId: 'pn',
    subjectCode: 'PN',
    subjectName: 'PERHIMPUNAN RASMI',
    teacherCode: 'SEMUA',
    periodLength: 1,
  };
  grid[1].SELASA.W4 = {
    subjectId: 'pm_pai',
    subjectCode: 'PM/PAI',
    subjectName: 'PENDIDIKAN MORAL / ISLAM',
    teacherCode: 'SW/MFA',
    periodLength: 1,
  };
  grid[1].SELASA.MEMBACA = {
    subjectId: 'membaca',
    subjectCode: 'MEMBACA',
    subjectName: 'PROGRAM MEMBACA',
    teacherCode: 'LRR',
    periodLength: 0.5,
  };

  // Tahun 2 ISNIN:
  // W1 (07:15-07:45) assigned to LMI -> Overlaps clock time with T1 W1 [07:30-08:00]!
  grid[2].ISNIN.W1 = {
    subjectId: 'bm',
    subjectCode: 'BM',
    subjectName: 'BAHASA MELAYU',
    teacherCode: 'LMI',
    periodLength: 1,
  };
  // W5 (09:15-09:45) assigned to JW -> Overlaps clock time with T1 PKAR [09:30-09:45]!
  grid[2].ISNIN.W5 = {
    subjectId: 'mt',
    subjectCode: 'MT',
    subjectName: 'MATEMATIK',
    teacherCode: 'JW',
    periodLength: 1,
  };
  // Heavy workload on HHH (4 periods on ISNIN) vs light workload on LSC (0 periods on ISNIN)
  grid[3].ISNIN.W2 = { subjectId: 'mt', subjectCode: 'MT', subjectName: 'MATEMATIK', teacherCode: 'HHH', periodLength: 1 };
  grid[3].ISNIN.W3 = { subjectId: 'mt', subjectCode: 'MT', subjectName: 'MATEMATIK', teacherCode: 'HHH', periodLength: 1 };
  grid[3].ISNIN.W6 = { subjectId: 'mt', subjectCode: 'MT', subjectName: 'MATEMATIK', teacherCode: 'HHH', periodLength: 1 };
  grid[3].ISNIN.W7 = { subjectId: 'mt', subjectCode: 'MT', subjectName: 'MATEMATIK', teacherCode: 'HHH', periodLength: 1 };

  // ============================================================================
  // TEST 1: Option A Teacher Matrix (Lampiran B)
  // ============================================================================
  assert.equal(OPTION_A_COLUMNS.length, 12, 'Option A must have exact 12 columns');
  assert.equal(OPTION_A_COLUMNS[4].t1ShiftedTime, '(T1: PKAR 15m)', 'Col 5 must carry T1 PKAR header');

  const lrrBundle = buildTeacherOptionAMatrix(grid, 'LRR', academicYear);
  const isninW1 = lrrBundle.grid.ISNIN.W1;
  assert.ok(isninW1, 'LRR should have ISNIN W1');
  assert.equal(isninW1?.isYear1Morning, true, 'T1 W1 must be marked Year 1 morning');
  assert.equal(isninW1?.year1ClockBracket, '[07:30-08:00]');
  assert.equal(isninW1?.hasMembacaT1, true, 'MEMBACA T.1 badge should appear on W1');

  // Post-recess T1 W5 maps to W6
  assert.ok(lrrBundle.grid.ISNIN.W6, 'T1 W5 post-recess must map to Col W6');
  assert.equal(lrrBundle.grid.ISNIN.W6?.isYear1Morning, false);
  assert.equal(lrrBundle.grid.ISNIN.W6?.grade, 1);

  // SELASA W1 has compulsory PN + MEMBACA T.1 non-overwriting badge
  assert.equal(lrrBundle.grid.SELASA.W1?.subjectCode, 'PN');
  assert.equal(lrrBundle.grid.SELASA.W1?.hasMembacaT1, true, 'MEMBACA T.1 badge must not overwrite SELASA W1 PN');

  // NCY teaches Tahun 1 ISNIN W4 -> Col 5 (W5) must auto-populate PKAR (T.1) (+0.5 Waktu)
  const ncyBundle = buildTeacherOptionAMatrix(grid, 'NCY', academicYear);
  assert.equal(ncyBundle.grid.ISNIN.W4?.isYear1Morning, true);
  assert.equal(ncyBundle.grid.ISNIN.W4?.year1ClockBracket, '[09:00-09:30]');
  assert.equal(ncyBundle.grid.ISNIN.W5?.isPKAR, true, 'Col 5 must auto-populate PKAR (T.1) from W4');
  assert.equal(ncyBundle.grid.ISNIN.W5?.periodLength, 0.5);
  assert.equal(ncyBundle.daily.ISNIN, 1.5, 'NCY ISNIN load must be 1.0 (W4) + 0.5 (PKAR) = 1.5');

  // MFA teaches PM/PAI on SELASA W4 -> resolved as PAI (not PM) and gets PKAR (+0.5)
  const mfaBundle = buildTeacherOptionAMatrix(grid, 'MFA', academicYear);
  assert.equal(mfaBundle.grid.SELASA.W4?.subjectCode, 'PAI');
  assert.equal(mfaBundle.grid.SELASA.W5?.isPKAR, true);

  // Verify Lampiran B minute calculations (1.0 = 30m, 0.5 = 15m)
  const lrrMembacaRow = lrrBundle.analysisRows.find((r) => r.subjectCode === 'MEMBACA');
  assert.ok(lrrMembacaRow, 'MEMBACA row should appear in LRR analysis');
  assert.equal(lrrMembacaRow?.bilWaktu, 1); // 2 days * 0.5 = 1
  assert.equal(lrrMembacaRow?.minit, 30);
  assert.equal(
    lrrBundle.totalMinit,
    lrrBundle.analysisRows.reduce((acc, r) => acc + r.minit, 0),
    'Lampiran B totalMinit must equal sum of rows'
  );

  // ============================================================================
  // TEST 2: Lampiran A Class Analysis
  // ============================================================================
  const matrixData = buildDefaultCurriculumMatrix(academicYear, { includeLegacyTeachers: true });
  const classTeachers = getDefaultClassTeachers(true);
  const class1Analysis = buildClassLampiranAAnalysis(
    grid,
    1,
    academicYear,
    matrixData,
    teacherMapping,
    'CODE'
  );
  const pkarClassRow = class1Analysis.analysisRows.find((r) => r.mp.startsWith('PKAR'));
  assert.ok(pkarClassRow, 'Class 1 Lampiran A must include auto-resolved PKAR rows');
  // Sum of PKAR rows in class 1 (ISNIN NCY/VY 0.5 + SELASA SW/MFA 0.5 = 1.0w = 30m)
  const pkarTotalMinit = class1Analysis.analysisRows
    .filter((r) => r.mp.startsWith('PKAR'))
    .reduce((acc, r) => acc + r.minit, 0);
  assert.equal(pkarTotalMinit, 30, '2 days of PKAR = 1.0w = 30 minutes');
  assert.equal(
    class1Analysis.totalMinit,
    class1Analysis.analysisRows.reduce((acc, r) => acc + r.minit, 0)
  );

  // ============================================================================
  // TEST 3: Styled Bulk Excel Workbook (Jadual Induk + 6 Lampiran A + 14 Lampiran B)
  // ============================================================================
  const wb = await buildAllTimetablesWorkbook({
    schedule: grid,
    academicYear,
    schoolName: 'SJK (C) Chung Hua Balingian',
    schoolCode: 'YCC3404',
    classTeachers,
    matrixData,
    teacherMapping,
    displayMode: 'CODE',
    kemaskiniDate: '14.11.2026',
  });

  assert.equal(wb.worksheets.length, 1 + 6 + OFFICIAL_TEACHERS.length, 'Workbook must contain Jadual Induk + 6 Class + 14 Teacher sheets');
  wb.worksheets.forEach((ws) => {
    assert.ok(ws.name.length <= 31, `Worksheet name "${ws.name}" exceeds 31 chars`);
  });

  const ncySheet = wb.getWorksheet('Lampiran B - NCY');
  assert.ok(ncySheet, 'Lampiran B - NCY sheet must exist');
  // Row 6 is header row; Col 2 (W1) has richText with #CC00CC top and #0F766E bottom, fill #CCFFCC
  const hdrW1Fill: any = ncySheet.getCell(6, 2).fill;
  assert.equal(hdrW1Fill?.fgColor?.argb, 'FFCCFFCC', 'Header row must use #CCFFCC background');
  // Col 7 (index 6 in OPTION_A_COLUMNS -> Excel Col 7) is REHAT (#B8CCE4)
  assert.equal(ncySheet.getCell(7, 7).value, 'R', 'ISNIN REHAT cell must spell R');
  assert.equal(ncySheet.getCell(8, 7).value, 'E', 'SELASA REHAT cell must spell E');
  assert.equal(ncySheet.getCell(11, 7).value, 'T', 'JUMAAT REHAT cell must spell T');
  const rehatFill: any = ncySheet.getCell(7, 7).fill;
  assert.equal(rehatFill?.fgColor?.argb, 'FFB8CCE4', 'REHAT column must use #B8CCE4');
  // NCY ISNIN W4 = Row 7, Col 5 -> Tahun 1 morning amber #FEF9C3
  const t1W4Fill: any = ncySheet.getCell(7, 5).fill;
  assert.equal(t1W4Fill?.fgColor?.argb, 'FFFEF9C3', 'T1 W4 cell must use #FEF9C3');
  // NCY ISNIN Col 5 (W5) = Row 7, Col 6 -> PKAR green #DCFCE7
  const pkarFill: any = ncySheet.getCell(7, 6).fill;
  assert.equal(pkarFill?.fgColor?.argb, 'FFDCFCE7', 'T1 PKAR Col 5 cell must use #DCFCE7');

  const xlsxBuffer = await wb.xlsx.writeBuffer();
  assert.ok((xlsxBuffer as ArrayBuffer).byteLength > 5000, 'Generated Excel buffer must be non-trivial');

  // ============================================================================
  // TEST 4: Auto-Relief Sync with Kehadiran Staf + Zero Clock-Overlap + Lightest Load
  // ============================================================================
  // 2026-11-16 is a Monday (ISNIN)
  assert.equal(dateStrToDayOfWeek('2026-11-16'), 'ISNIN');
  assert.equal(dateStrToDayOfWeek('2026-11-15'), null); // Sunday

  const detectedAbsent = detectAbsentTeachersForDate({
    dateStr: '2026-11-16',
    teacherMapping,
    staffDirectory: OFFICIAL_TEACHERS.map((o) => ({ id: o.id, name: o.name, email: o.email, code: o.code })),
    absenceRecords: [
      {
        id: 'abs1',
        userId: 'staff_000717131252', // LRR
        userName: 'LAM RONG RONG',
        userEmail: 'g-52567531@moe-dl.edu.my',
        date: '2026-11-16',
        category: 'CUTI_SAKIT',
        reason: 'MC Klinik',
      },
      {
        id: 'abs2',
        userEmail: 'g-94251439@moe-dl.edu.my', // NCY
        date: '2026-11-16',
        category: 'KURSUS',
        reason: 'Bengkel Sains',
      },
    ],
  });

  assert.equal(detectedAbsent.length, 2, 'Should detect LRR and NCY from Kehadiran Staf');

  const reliefPlan = generateAutoReliefPlan({
    schedule: grid,
    academicYear,
    dateStr: '2026-11-16',
    absentTeacherCodes: detectedAbsent.map((d) => d.teacherCode),
    teacherMapping,
    detectedAbsentTeachers: detectedAbsent,
  });

  // Flagged slots for LRR (MEMBACA 07:15-07:30, T1 W1 07:30-08:00, T1 W5 10:15-10:45) + NCY (T1 W4 09:00-09:30, T1 PKAR 09:30-09:45)
  assert.equal(reliefPlan.slots.length, 5, 'Should flag all 5 affected periods including MEMBACA, T1 W1, T1 W4, PKAR, T1 W5');

  const t1W1Slot = reliefPlan.slots.find((s) => s.slotKey === 'T1_ISNIN_W1');
  assert.ok(t1W1Slot, 'Must flag Tahun 1 W1');
  assert.equal(t1W1Slot?.isYear1ShiftedMorning, true);
  assert.equal(t1W1Slot?.timeLabel, '07:30-08:00');
  // LMI teaches T2 W1 (07:15-07:45) -> overlaps T1 W1 (07:30-08:00) -> MUST NOT be in candidate list!
  assert.equal(
    t1W1Slot?.recommendedCandidates.some((c) => c.code === 'LMI'),
    false,
    'LMI (T2 W1 07:15-07:45) overlaps T1 W1 (07:30-08:00) and must be excluded'
  );

  const pkarSlot = reliefPlan.slots.find((s) => s.slotKey === 'T1_ISNIN_PKAR');
  assert.ok(pkarSlot, 'Must flag Tahun 1 PKAR');
  assert.equal(pkarSlot?.isPKAR, true);
  assert.equal(pkarSlot?.timeLabel, '09:30-09:45');
  assert.equal(pkarSlot?.periodLength, 0.5);
  // JW teaches T2 W5 (09:15-09:45) -> overlaps T1 PKAR (09:30-09:45) -> MUST NOT be eligible!
  assert.equal(
    pkarSlot?.recommendedCandidates.some((c) => c.code === 'JW'),
    false,
    'JW (T2 W5 09:15-09:45) overlaps T1 PKAR (09:30-09:45) and must be excluded'
  );
  // Heavy-loaded HHH (4w on ISNIN) should NOT beat 0w-loaded teachers
  assert.notEqual(
    pkarSlot?.assignedSubstituteCode,
    'HHH',
    'Lighter daily workload teacher must be prioritized over HHH (4w)'
  );

  // ============================================================================
  // TEST 5: Renamed Morning Program (Program Agama) + Up to 3 Teachers
  // ============================================================================
  const agamaGrid = createEmptyScheduleGrid();
  agamaGrid[1].RABU.MEMBACA = {
    subjectId: 'membaca',
    subjectCode: 'AGAMA',
    subjectName: 'PROGRAM AGAMA',
    teacherCode: 'MFA/LRR/KL',
    secondaryTeacherCode: 'LRR',
    periodLength: 0.5,
    isManualSlot: true,
  };
  agamaGrid[1].RABU.W1 = {
    subjectId: 'bc',
    subjectCode: 'BC',
    subjectName: 'BAHASA CINA',
    teacherCode: 'LRR',
    periodLength: 1,
  };

  // All 3 teachers must receive +0.5w (15 min) & custom 'AGAMA T.1 [07:15-07:30]' badge on Lampiran B
  for (const tc of ['MFA', 'LRR', 'KL']) {
    const b = buildTeacherOptionAMatrix(agamaGrid, tc, academicYear);
    assert.equal(b.daily.RABU, tc === 'LRR' ? 1.5 : 0.5, `Teacher ${tc} should receive +0.5w for Program Agama on RABU`);
    assert.equal(b.grid.RABU.W1?.hasMembacaT1, true);
    assert.equal(b.grid.RABU.W1?.membacaLabel, 'AGAMA T.1 [07:15-07:30]');
    const agamaRow = b.analysisRows.find((r) => r.subjectCode === 'AGAMA');
    assert.ok(agamaRow, `Teacher ${tc} Lampiran B analysis must contain AGAMA row`);
    assert.equal(agamaRow?.mataPelajaranLabel, 'AGAMA - PROGRAM AGAMA');
    assert.equal(agamaRow?.minit, 15);
  }

  // Lampiran A class analysis must list all 3 teachers under AGAMA - PROGRAM AGAMA
  const agamaClass1 = buildClassLampiranAAnalysis(
    agamaGrid,
    1,
    academicYear,
    matrixData,
    teacherMapping,
    'CODE'
  );
  const agamaClassRow = agamaClass1.analysisRows.find((r) => r.mp === 'AGAMA - PROGRAM AGAMA');
  assert.ok(agamaClassRow, 'Lampiran A must display renamed AGAMA - PROGRAM AGAMA row');
  assert.equal(agamaClassRow?.singkatanNama, 'MFA / LRR / KL');
  assert.equal(agamaClassRow?.bilWaktu, 0.5);
  assert.equal(agamaClassRow?.minit, 15);

  // Excel export reflects custom AGAMA T.1 badge
  const agamaWb = await buildAllTimetablesWorkbook({
    schedule: agamaGrid,
    academicYear,
    schoolName: 'SJK (C) Chung Hua Balingian',
    schoolCode: 'YCC3404',
    classTeachers,
    matrixData,
    teacherMapping,
    displayMode: 'CODE',
  });
  const mfaSheet = agamaWb.getWorksheet('Lampiran B - MFA');
  assert.ok(mfaSheet, 'Lampiran B - MFA must exist');
  // RABU is Row 9 (7=ISNIN, 8=SELASA, 9=RABU), W1 is Col 2
  const rabuW1Val: any = mfaSheet.getCell(9, 2).value;
  const serializedCell = JSON.stringify(rabuW1Val || '');
  assert.ok(serializedCell.includes('AGAMA T.1'), `Excel W1 badge must contain AGAMA T.1, got: ${serializedCell}`);

  // Auto-Relief flags MFA absence on Program Agama (2026-11-18 is RABU) and shows LRR & KL still present
  assert.equal(dateStrToDayOfWeek('2026-11-18'), 'RABU');
  const agamaRelief = generateAutoReliefPlan({
    schedule: agamaGrid,
    academicYear,
    dateStr: '2026-11-18',
    absentTeacherCodes: ['MFA'],
    teacherMapping,
  });
  const agamaReliefSlot = agamaRelief.slots.find((s) => s.slotKey === 'T1_RABU_MEMBACA');
  assert.ok(agamaReliefSlot, 'Auto-Relief must flag T1_RABU_MEMBACA');
  assert.equal(agamaReliefSlot?.subjectCode, 'AGAMA');
  assert.equal(agamaReliefSlot?.subjectName, 'PROGRAM AGAMA');
  assert.deepEqual(agamaReliefSlot?.absentTeacherCodes, ['MFA']);
  assert.deepEqual(agamaReliefSlot?.presentCoTeacherCodes, ['LRR', 'KL']);

  console.log('✅ All Lampiran A/B Option A, Custom Program Agama (3 teachers), Bulk Excel Export, and Auto-Relief tests passed!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
