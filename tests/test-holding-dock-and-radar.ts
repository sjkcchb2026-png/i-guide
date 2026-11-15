import assert from 'node:assert/strict';
import {
  buildDefaultCurriculumMatrix,
  getDefaultClassTeachers,
} from '../src/constants/defaultCurriculumMatrix';
import {
  generateAutoSchedule,
  autoPairPKARInGrid,
  createEmptyScheduleGrid,
} from '../src/components/Timetable/autoScheduler';
import {
  computeUnscheduledLessons,
  evaluateSlotDropRadar,
} from '../src/components/Timetable/holdingDock';
import { ScheduleGrid } from '../src/components/Timetable/types';

console.log('================================================================');
console.log('iSEPADU AI — HOLDING DOCK & REAL-TIME COLLISION RADAR TEST SUITE');
console.log('================================================================\n');

const matrix = buildDefaultCurriculumMatrix('2027', { includeLegacyTeachers: true });
const classTeachers = getDefaultClassTeachers(true);
const { grid } = generateAutoSchedule(matrix, classTeachers, '2027', 0);

// 1. Full auto-generated grid should have 0 unscheduled lessons
{
  const unscheduled = computeUnscheduledLessons(matrix, grid, '2027');
  assert.equal(
    unscheduled.length,
    0,
    `Expected 0 unscheduled lessons on clean auto-schedule, got ${unscheduled.length}: ${unscheduled
      .map((u) => `T${u.grade}:${u.subjectCode}`)
      .join(', ')}`
  );
  console.log('✓ 1. Clean auto-generated grid returns 0 unscheduled Holding Dock cards');
}

// 2. Parking (Grid -> Dock) and Swapping (Dock -> Occupied Slot)
{
  const cloned: ScheduleGrid = JSON.parse(JSON.stringify(grid));
  const t1Slot = cloned[1]['ISNIN']['W2']!;
  const t4Slot = cloned[4]['RABU']['W3']!;
  assert.ok(t1Slot && t4Slot, 'Sample slots should be populated');

  // Park T1 ISNIN W2 and T4 RABU W3
  cloned[1]['ISNIN']['W2'] = null;
  cloned[4]['RABU']['W3'] = null;
  autoPairPKARInGrid(cloned, '2027');

  const unscheduled = computeUnscheduledLessons(matrix, cloned, '2027');
  assert.equal(unscheduled.length, 2, `Expected 2 unscheduled cards after parking 2 slots, got ${unscheduled.length}`);

  const t1Card = unscheduled.find((u) => u.grade === 1 && u.subjectCode === t1Slot.subjectCode);
  const t4Card = unscheduled.find((u) => u.grade === 4 && u.subjectCode === t4Slot.subjectCode);
  assert.ok(t1Card, 'Parked Tahun 1 subject should appear in Holding Dock');
  assert.ok(t4Card, 'Parked Tahun 4 subject should appear in Holding Dock');

  // Swap: drop t1Card onto an occupied Tahun 1 slot with a different subject
  const swapTargetSlotId = ['W5', 'W6', 'W7', 'W8'].find(
    (sid) => cloned[1]['RABU'][sid] && cloned[1]['RABU'][sid]!.subjectCode !== t1Card.subjectCode
  )!;
  const displacedCell = cloned[1]['RABU'][swapTargetSlotId]!;
  cloned[1]['RABU'][swapTargetSlotId] = {
    subjectId: t1Card.subjectId,
    subjectCode: t1Card.subjectCode,
    subjectName: t1Card.subjectName,
    teacherCode: t1Card.teacherCode,
    periodLength: 1,
  };
  const afterSwap = computeUnscheduledLessons(matrix, cloned, '2027');
  assert.equal(afterSwap.length, 2, 'Swap replaces one slot and keeps total missing count unchanged');
  assert.ok(
    afterSwap.some((u) => u.grade === 1 && u.subjectCode === displacedCell.subjectCode),
    'Displaced lesson automatically returns to Holding Dock after swap'
  );
  console.log('✓ 2. Grid -> Dock parking & Dock -> Occupied slot swap round-trip verified');
}

// 3. Real-Time Drag Hover Radar: Dual-Bell Minute-Level Overlap & Hard Locks
{
  const simGrid = createEmptyScheduleGrid('2027');
  // Tahun 4 has DT teaching BI on ISNIN W2 (07:45 - 08:15)
  simGrid[4]['ISNIN']['W2'] = {
    subjectId: 'bi',
    subjectCode: 'BI',
    subjectName: 'BAHASA INGGERIS',
    teacherCode: 'DT',
    periodLength: 1,
  };

  // Dragging Tahun 1 BI (DT) card:
  // - Tahun 1 W1 (07:30-08:00) overlaps T4 W2 (07:45-08:15) -> RED clash!
  // - Tahun 1 W2 (08:00-08:30) overlaps T4 W2 (07:45-08:15) -> RED clash!
  // - Tahun 1 W3 (08:30-09:00) does NOT overlap -> GREEN valid!
  // - Tahun 1 SELASA W1 (PN locked) -> locked!
  // - Tahun 2 W3 (different grade for Dock card) -> differentGrade!
  const cand = {
    grade: 1,
    subjectCode: 'BI',
    teacherCode: 'DT',
  };

  const rW1 = evaluateSlotDropRadar(simGrid, cand, 1, 'ISNIN', 'W1', '2027');
  assert.equal(rW1.valid, false);
  assert.equal(rW1.hasTeacherClash, true, 'T1 W1 (07:30-08:00) must clash with T4 W2 (07:45-08:15)');
  assert.ok(rW1.clashLabel?.includes('Tahun 4'), `Expected Tahun 4 in clashLabel, got ${rW1.clashLabel}`);

  const rW2 = evaluateSlotDropRadar(simGrid, cand, 1, 'ISNIN', 'W2', '2027');
  assert.equal(rW2.valid, false);
  assert.equal(rW2.hasTeacherClash, true, 'T1 W2 (08:00-08:30) must clash with T4 W2 (07:45-08:15)');

  const rW3 = evaluateSlotDropRadar(simGrid, cand, 1, 'ISNIN', 'W3', '2027');
  assert.equal(rW3.valid, true, 'T1 W3 (08:30-09:00) must be clash-free GREEN');
  assert.equal(rW3.hasTeacherClash, false);

  const rLocked = evaluateSlotDropRadar(simGrid, cand, 1, 'SELASA', 'W1', '2027');
  assert.equal(rLocked.valid, false);
  assert.equal(rLocked.locked, true, 'SELASA W1 PN must remain locked');

  const rDiffGrade = evaluateSlotDropRadar(simGrid, cand, 2, 'ISNIN', 'W3', '2027');
  assert.equal(rDiffGrade.valid, false);
  assert.equal(rDiffGrade.differentGrade, true, 'Dock card must not light up other grades');

  console.log('✓ 3. Dual-Bell minute-level Drag Radar (T1 07:30 vs T4 07:45 clash & green free slots) verified');
}

// 4. Radar blocks drops exceeding 8.0 periods/day (including Year 1 W4 +0.5 PKAR)
{
  const simGrid = createEmptyScheduleGrid('2027');
  // Fill 7 periods for teacher SW on ISNIN across Tahun 2 (W1..W7)
  ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7'].forEach((sid) => {
    simGrid[2]['ISNIN'][sid] = {
      subjectId: 'bc',
      subjectCode: 'BC',
      subjectName: 'BAHASA CINA',
      teacherCode: 'SW',
      periodLength: 1,
    };
  });

  // Dropping SW into Tahun 1 ISNIN W8 (11:45-12:15, free of T2 W7 10:45-11:15) -> 7 + 1 = 8.0 <= 8.0 -> VALID
  const cand = { grade: 1, subjectCode: 'BC', teacherCode: 'SW' };
  const rW8 = evaluateSlotDropRadar(simGrid, cand, 1, 'ISNIN', 'W8', '2027');
  assert.equal(rW8.valid, true, '7.0 + 1.0 = 8.0 must be allowed');

  // Dropping SW into Tahun 1 ISNIN W4 (09:00-09:30, overlaps T2 W4/W5 if on same day, so move T2 W4/W5 to W8/W9)
  delete simGrid[2]['ISNIN']['W4'];
  delete simGrid[2]['ISNIN']['W5'];
  simGrid[2]['ISNIN']['W8'] = {
    subjectId: 'bc',
    subjectCode: 'BC',
    subjectName: 'BAHASA CINA',
    teacherCode: 'SW',
    periodLength: 1,
  };
  simGrid[2]['ISNIN']['W9'] = {
    subjectId: 'bc',
    subjectCode: 'BC',
    subjectName: 'BAHASA CINA',
    teacherCode: 'SW',
    periodLength: 1,
  };
  // Now SW has 7.0 periods on ISNIN and is FREE at 09:00-09:30 (T1 W4)!
  // Placing SW into T1 W4 triggers +1.0 + 0.5 PKAR = 8.5 > 8.0 -> MUST BE RED (workloadExceeded)!
  const rW4 = evaluateSlotDropRadar(simGrid, cand, 1, 'ISNIN', 'W4', '2027');
  assert.equal(rW4.valid, false);
  assert.equal(rW4.workloadExceeded, true, '7.0 + 1.0 (W4) + 0.5 (PKAR) = 8.5 > 8.0 must trigger workloadExceeded');
  console.log('✓ 4. Drag Radar strictly enforces <= 8.0 daily hard cap including Year 1 W4 +0.5 PKAR');
}

// 5. TASMIK gabung kelas exemption
{
  const simGrid = createEmptyScheduleGrid('2027');
  simGrid[2]['RABU']['TASMIK'] = {
    subjectId: 'tasmik',
    subjectCode: 'TASMIK',
    subjectName: 'TASMIK',
    teacherCode: 'MFA',
    periodLength: 1,
  };
  const rTasmik = evaluateSlotDropRadar(
    simGrid,
    { grade: 3, subjectCode: 'TASMIK', teacherCode: 'MFA' },
    3,
    'RABU',
    'TASMIK',
    '2027'
  );
  assert.equal(rTasmik.valid, true, 'TASMIK Gabung Kelas for same Ustaz across T.2 & T.3 must be GREEN');
  console.log('✓ 5. TASMIK Gabung Kelas exemption verified in Drag Radar');
}

// 6. Universal grade-0 TASMIK quick-drag template & Grid->Grid TASMIK drag across grades/days/slots + Gabung Kelas cap check
{
  const simGrid = createEmptyScheduleGrid('2027');
  // MFA already has 7 regular classes on RABU (W1..W7 on T.2) + concurrent TASMIK on T.1 & T.2 RABU (12:45-13:15)
  // Actual daily load for MFA = 7 + 1 (Gabung Kelas) = 8.0!
  ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7'].forEach((sid) => {
    simGrid[2]['RABU'][sid] = {
      subjectId: 'pai',
      subjectCode: 'PAI',
      subjectName: 'PENDIDIKAN ISLAM',
      teacherCode: 'MFA',
      periodLength: 1,
    };
  });
  simGrid[1]['RABU']['TASMIK'] = {
    subjectId: 'tasmik_t1',
    subjectCode: 'TASMIK',
    subjectName: 'PROGRAM TASMIK',
    teacherCode: 'MFA',
    periodLength: 1,
    isManualSlot: true,
  };
  simGrid[2]['RABU']['TASMIK'] = {
    subjectId: 'tasmik_t2',
    subjectCode: 'TASMIK',
    subjectName: 'PROGRAM TASMIK',
    teacherCode: 'MFA',
    periodLength: 1,
    isManualSlot: true,
  };

  // Universal template chip (grade: 0) dragging TASMIK into Tahun 3 RABU TASMIK (concurrent 12:45-13:15 Gabung Kelas) -> must still be valid (load remains 8.0)!
  const rQuickTasmik = evaluateSlotDropRadar(
    simGrid,
    { grade: 0, subjectCode: 'TASMIK', subjectName: 'PROGRAM TASMIK', teacherCode: 'MFA' },
    3,
    'RABU',
    'TASMIK',
    '2027'
  );
  assert.equal(
    rQuickTasmik.valid,
    true,
    `Universal grade-0 TASMIK chip dropping for Gabung Kelas must stay GREEN (8.0w), got: ${rQuickTasmik.reason}`
  );

  // Grid->Grid drag of TASMIK from T.1 RABU TASMIK to T.1 KHAMIS W10 (custom slot relocation) -> must be valid GREEN!
  const rMoveTasmik = evaluateSlotDropRadar(
    simGrid,
    {
      grade: 1,
      subjectCode: 'TASMIK',
      subjectName: 'PROGRAM TASMIK',
      teacherCode: 'MFA',
      fromSlot: { grade: 1, day: 'RABU', slotId: 'TASMIK' },
    },
    1,
    'KHAMIS',
    'W9',
    '2027'
  );
  assert.equal(rMoveTasmik.valid, true, 'Grid->Grid dragging TASMIK onto KHAMIS W9 must be GREEN');

  // Guard: regular lesson cannot be dropped onto Tahun 1 07:15-07:30 MEMBACA slot
  const rBlockedMembaca = evaluateSlotDropRadar(
    simGrid,
    { grade: 1, subjectCode: 'BM', teacherCode: 'KL' },
    1,
    'ISNIN',
    'MEMBACA',
    '2027'
  );
  assert.equal(rBlockedMembaca.valid, false);
  assert.equal(rBlockedMembaca.locked, true, 'Regular subject drop onto MEMBACA morning slot must be locked');

  // Guard: regular lesson cannot be dropped onto RABU/KHAMIS W11 (TASMIK slot 12:45-13:15)
  const rBlockedWedW11 = evaluateSlotDropRadar(
    simGrid,
    { grade: 3, subjectCode: 'BM', teacherCode: 'LMI' },
    3,
    'RABU',
    'TASMIK',
    '2027'
  );
  assert.equal(rBlockedWedW11.valid, false);
  assert.equal(rBlockedWedW11.locked, true, 'Regular subject drop onto RABU W11 (TASMIK slot) must be locked');

  const rBlockedThuW11 = evaluateSlotDropRadar(
    simGrid,
    { grade: 4, subjectCode: 'MT', teacherCode: 'KL' },
    4,
    'KHAMIS',
    'TASMIK',
    '2027'
  );
  assert.equal(rBlockedThuW11.valid, false);
  assert.equal(rBlockedThuW11.locked, true, 'Regular subject drop onto KHAMIS W11 (TASMIK slot) must be locked');

  // TASMIK dropped onto KHAMIS W11 (TASMIK slot) must be GREEN
  const rAllowThuW11Tasmik = evaluateSlotDropRadar(
    simGrid,
    { grade: 0, subjectCode: 'TASMIK', subjectName: 'PROGRAM TASMIK', teacherCode: 'MFA' },
    4,
    'KHAMIS',
    'TASMIK',
    '2027'
  );
  assert.equal(rAllowThuW11Tasmik.valid, true, 'TASMIK drop onto KHAMIS W11 (TASMIK slot) must be allowed');

  // Guard: regular lesson cannot be dropped onto JUMAAT W9 (TASMIK slot 11:45-12:15) for Tahun 4-6
  for (const grade of [4, 5, 6]) {
    const rBlockedFriW9 = evaluateSlotDropRadar(
      simGrid,
      { grade, subjectCode: 'BM', teacherCode: 'LMI' },
      grade,
      'JUMAAT',
      'TASMIK',
      '2027'
    );
    assert.equal(rBlockedFriW9.valid, false, `Tahun ${grade} JUMAAT W9 must block non-TASMIK drop`);
    assert.equal(rBlockedFriW9.locked, true, `Tahun ${grade} JUMAAT W9 must report locked=true for non-TASMIK`);

    const rAllowFriW9Tasmik = evaluateSlotDropRadar(
      simGrid,
      { grade: 0, subjectCode: 'TASMIK', subjectName: 'PROGRAM TASMIK', teacherCode: 'MFA' },
      grade,
      'JUMAAT',
      'TASMIK',
      '2027'
    );
    assert.equal(rAllowFriW9Tasmik.valid, true, `Tahun ${grade} JUMAAT W9 must allow TASMIK drop`);
  }

  // Guard: dragging out of reserved JUMAAT Tahun 5 W9 TASMIK cannot swap with an occupied non-TASMIK cell
  simGrid[5]['JUMAAT']['TASMIK'] = {
    subjectId: 'tasmik_t5',
    subjectCode: 'TASMIK',
    subjectName: 'PROGRAM TASMIK',
    teacherCode: 'MFA',
    periodLength: 1,
    isManualSlot: true,
  };
  simGrid[5]['JUMAAT']['W6'] = {
    subjectId: 'bm',
    subjectCode: 'BM',
    subjectName: 'BAHASA MELAYU',
    teacherCode: 'JW',
    periodLength: 1,
  };
  const rBlockedSwapOutFriW9 = evaluateSlotDropRadar(
    simGrid,
    {
      grade: 5,
      subjectCode: 'TASMIK',
      subjectName: 'PROGRAM TASMIK',
      teacherCode: 'MFA',
      fromSlot: { grade: 5, day: 'JUMAAT', slotId: 'TASMIK' },
    },
    5,
    'JUMAAT',
    'W6',
    '2027'
  );
  assert.equal(rBlockedSwapOutFriW9.valid, false);
  assert.equal(rBlockedSwapOutFriW9.locked, true, 'Swapping out of reserved JUMAAT W9 TASMIK into non-TASMIK cell must be locked');

  console.log('✓ 6. Universal TASMIK drag, Grid->Grid TASMIK relocation, Wed/Thu W11 & Fri T4-6 W9 TASMIK-only lock verified');
}

console.log('\n================================================================');
console.log('ALL HOLDING DOCK & COLLISION RADAR TESTS PASSED (100%)');
console.log('================================================================');
