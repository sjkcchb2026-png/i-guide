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

console.log('\n================================================================');
console.log('ALL HOLDING DOCK & COLLISION RADAR TESTS PASSED (100%)');
console.log('================================================================');
