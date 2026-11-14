import assert from 'node:assert/strict';
import { buildDefaultCurriculumMatrix, getDefaultClassTeachers } from '../src/constants/defaultCurriculumMatrix';
import { generateAutoSchedule, auditScheduleWorkload } from '../src/components/Timetable/autoScheduler';
import {
  getMaxSubjectsPerDay,
  getMaxDailyPeriodsForSubject,
  decomposeSubjectCompactly,
  canAddSubjectToClassDay,
  canClassAcceptSubjectOnDay,
  hasThreeConsecutiveSameSubject,
  canSafelyAssignBlockToDay,
  repairEmptyClassSlots,
} from '../src/utils/timetableEngine';

console.log('================================================================');
console.log('iSEPADU AI — COMPACT SUBJECT GROUPING & ANTI-FRAGMENTATION TEST');
console.log('================================================================');

// 1. Test helper functions
console.log('[TEST 1] Verifying getMaxSubjectsPerDay, getMaxDailyPeriodsForSubject & decomposeSubjectCompactly...');
assert.equal(getMaxSubjectsPerDay(1), 4);
assert.equal(getMaxSubjectsPerDay(2), 4);
assert.equal(getMaxSubjectsPerDay(3), 4);
assert.equal(getMaxSubjectsPerDay(4), 6);
assert.equal(getMaxSubjectsPerDay(5), 6);
assert.equal(getMaxSubjectsPerDay(6), 6);

assert.equal(getMaxDailyPeriodsForSubject('BC'), 3);
assert.equal(getMaxDailyPeriodsForSubject('BM'), 3);
assert.equal(getMaxDailyPeriodsForSubject('BI'), 3);
assert.equal(getMaxDailyPeriodsForSubject('MT'), 2);
assert.equal(getMaxDailyPeriodsForSubject('SN'), 2);
assert.equal(getMaxDailyPeriodsForSubject('PSV'), 2);
assert.equal(getMaxDailyPeriodsForSubject('RBT'), 2);
assert.equal(getMaxDailyPeriodsForSubject('SEJ'), 2);
assert.equal(getMaxDailyPeriodsForSubject('PM'), 2);
assert.equal(getMaxDailyPeriodsForSubject('PAI'), 2);
assert.equal(getMaxDailyPeriodsForSubject('PJ'), 1);
assert.equal(getMaxDailyPeriodsForSubject('PK'), 1);
assert.equal(getMaxDailyPeriodsForSubject('MZ'), 1);
assert.equal(getMaxDailyPeriodsForSubject('PN'), 1);

assert.deepEqual(decomposeSubjectCompactly('BC', 12, 1), [2, 1, 2, 1, 2, 2, 2]);
assert.deepEqual(decomposeSubjectCompactly('BC', 11, 2), [2, 1, 2, 1, 2, 1, 2]);
assert.deepEqual(decomposeSubjectCompactly('BM', 10, 1), [2, 1, 2, 1, 2, 2]);
assert.deepEqual(decomposeSubjectCompactly('BM', 10, 4), [2, 2, 2, 2, 2]);
assert.deepEqual(decomposeSubjectCompactly('BI', 5, 2), [2, 1, 2]);
assert.deepEqual(decomposeSubjectCompactly('BI', 5, 4), [2, 2, 1]);
assert.deepEqual(decomposeSubjectCompactly('MT', 6, 3), [2, 2, 2]);
assert.deepEqual(decomposeSubjectCompactly('PSV', 2, 4), [2]);
assert.deepEqual(decomposeSubjectCompactly('RBT', 2, 5), [2]);
assert.deepEqual(decomposeSubjectCompactly('SEJ', 2, 6), [2]);
console.log('  ✓ PASSED: Compact decomposition & caps match specification!');

// 2. Test canAddSubjectToClassDay, hasThreeConsecutiveSameSubject, canSafelyAssignBlockToDay & repairEmptyClassSlots
console.log('[TEST 2] Verifying canAddSubjectToClassDay anti-fragmentation & 2+1 separated...');

// Major language: 3 CONSECUTIVE periods (W1-W2-W3) MUST BE REJECTED!
assert.equal(
  canAddSubjectToClassDay([{ subjectCode: 'BM' }, { subjectCode: 'BM' }], 'BM', 1, 1, {
    existingPeriodPositions: [0, 1],
    candidatePeriodPositions: [2],
  }),
  false
);
assert.equal(hasThreeConsecutiveSameSubject([1, 2], [3]), true);
assert.equal(hasThreeConsecutiveSameSubject([1, 2], [5]), false);

// Major language: 2 consecutive + 1 separated (e.g. [0,1] + [3] across gap/recess) ALLOWED = 3
assert.equal(
  canAddSubjectToClassDay([{ subjectCode: 'BM' }, { subjectCode: 'BM' }], 'BM', 1, 1, {
    existingPeriodPositions: [0, 1],
    candidatePeriodPositions: [3],
  }),
  true
);
// Major language: 1 + 1 non-adjacent with another 1 (1+1+1 scattered) REJECTED
assert.equal(
  canAddSubjectToClassDay([{ subjectCode: 'BC' }, { subjectCode: 'BC' }], 'BC', 1, 1, {
    existingPeriodPositions: [0, 3],
    candidatePeriodPositions: [6],
  }),
  false
);
// Major language: 4th period REJECTED
assert.equal(canClassAcceptSubjectOnDay([{ subjectCode: 'BC' }, { subjectCode: 'BC' }, { subjectCode: 'BC' }], 'BC', 12, 1, 1), false);
// Non-major subject: 3rd period REJECTED
assert.equal(canClassAcceptSubjectOnDay([{ subjectCode: 'MT' }, { subjectCode: 'MT' }], 'MT', 6, 1, 3), false);
// Non-major subject: non-adjacent 1+1 REJECTED
assert.equal(
  canAddSubjectToClassDay([{ subjectCode: 'SN' }], 'SN', 1, 3, {
    existingPeriodPositions: [0],
    candidatePeriodPositions: [4],
  }),
  false
);
// Tahap 1 max 4 distinct subjects check (PN excluded!)
assert.equal(
  canAddSubjectToClassDay(
    [
      { subjectCode: 'PN' },
      { subjectCode: 'BC' },
      { subjectCode: 'BM' },
      { subjectCode: 'BI' },
      { subjectCode: 'MT' },
    ],
    'SN',
    2,
    2
  ),
  false
);
// Adding to existing subject in 4-subject Tahap 1 day STILL ALLOWED
assert.equal(
  canAddSubjectToClassDay(
    [
      { subjectCode: 'BC' },
      { subjectCode: 'BC' },
      { subjectCode: 'BM' },
      { subjectCode: 'BI' },
      { subjectCode: 'MT' },
    ],
    'BC',
    1,
    2
  ),
  true
);
// Tahap 2 allows 6 distinct subjects (excluding PN)
assert.equal(
  canAddSubjectToClassDay(
    [
      { subjectCode: 'PN' },
      { subjectCode: 'BC' },
      { subjectCode: 'BM' },
      { subjectCode: 'BI' },
      { subjectCode: 'MT' },
      { subjectCode: 'SN' },
    ],
    'SEJ',
    2,
    5
  ),
  true
);
// Tahap 2 rejects 7th distinct subject
assert.equal(
  canAddSubjectToClassDay(
    [
      { subjectCode: 'BC' },
      { subjectCode: 'BM' },
      { subjectCode: 'BI' },
      { subjectCode: 'MT' },
      { subjectCode: 'SN' },
      { subjectCode: 'SEJ' },
    ],
    'RBT',
    2,
    5
  ),
  false
);

// Fix A: Day-Capacity Feasibility check blocks opening a 3rd isolated 1-period subject in Tahap 1 when remaining 4 slots cannot be filled
assert.equal(
  canSafelyAssignBlockToDay({
    dayMaxPeriods: 10,
    currentDayLessons: [
      { subjectCode: 'PJ' },
      { subjectCode: 'PK' },
      { subjectCode: 'PM' },
      { subjectCode: 'PM' },
      { subjectCode: 'BC' },
      { subjectCode: 'BC' },
    ],
    candidateSubjectCode: 'MZ',
    blockLength: 1,
    classLevel: 3,
    remainingSubjectPeriodsInWeek: new Map([['BC', 1], ['MZ', 1]]),
  }),
  false
);

// Synthetic Kempe Swap Repair test
{
  const classes = [{ classId: 'T6', className: 'Tahun 6', grade: 6 }];
  const lessons: any[] = [
    { id: 'l1', day: 'ISNIN', periodNumber: 1, classId: 'T6', className: 'Tahun 6', subjectCode: 'MT', subjectName: 'MT', teacherId: 'TA', teacherName: 'TA', countsAsClassPeriod: true, countsAsTeacherPeriod: true },
  ];
  const assignments: any[] = [
    { assignmentId: 'a_mt', classId: 'T6', className: 'Tahun 6', canonicalSubjectCode: 'MT', subjectName: 'MT', teacherId: 'TA', effectiveWeeklyPeriods: 1 },
    { assignmentId: 'a_sn', classId: 'T6', className: 'Tahun 6', canonicalSubjectCode: 'SN', subjectName: 'SN', teacherId: 'TB', effectiveWeeklyPeriods: 1 },
  ];
  const scheduledPerAssignment = new Map<string, number>([['a_mt', 1], ['a_sn', 0]]);
  const classSlotOccupied = new Set<string>(['T6_ISNIN_1']);
  const teacherSlotOccupied = new Set<string>(['TB_ISNIN_2', 'TB_ISNIN_3', 'TB_ISNIN_4', 'TB_ISNIN_5', 'TB_ISNIN_6', 'TB_ISNIN_7', 'TB_ISNIN_8', 'TB_ISNIN_9', 'TB_ISNIN_10', 'TB_ISNIN_11']);
  // Block TB everywhere except ISNIN_1 (where MT sits!) and on all other days so swap ISNIN_1 -> ISNIN_2 (TA) and SN -> ISNIN_1 (TB) is forced!
  for (const d of ['SELASA', 'RABU', 'KHAMIS', 'JUMAAT']) {
    for (let p = 1; p <= 11; p++) teacherSlotOccupied.add(`TB_${d}_${p}`);
  }
  const tCount = new Map<string, number>([['TA_ISNIN', 1]]);
  const tPeriods = new Map<string, number[]>([['TA_ISNIN', [1]]]);
  const sPeriods = new Map<string, number[]>([['T6_MT_ISNIN', [1]]]);
  const repaired = repairEmptyClassSlots({
    classes,
    assignments,
    lessons,
    scheduledPerAssignment,
    teacherMap: new Map([['TA', { teacherId: 'TA', fullName: 'TA' }], ['TB', { teacherId: 'TB', fullName: 'TB' }]]),
    classSlotOccupied,
    teacherSlotOccupied,
    incTeacherDayCount: (t, d, delta = 1) => tCount.set(`${t}_${d}`, (tCount.get(`${t}_${d}`) || 0) + delta),
    addTeacherPeriodOnDay: (t, d, p) => { const a = tPeriods.get(`${t}_${d}`) || []; a.push(p); tPeriods.set(`${t}_${d}`, a); },
    removeTeacherPeriodOnDay: (t, d, p) => tPeriods.set(`${t}_${d}`, (tPeriods.get(`${t}_${d}`) || []).filter(x => x !== p)),
    getTeacherDayLoad: (t, d) => tCount.get(`${t}_${d}`) || 0,
    recordSubjectPeriod: (c, s, d, p) => { const a = sPeriods.get(`${c}_${s.toUpperCase()}_${d}`) || []; a.push(p); sPeriods.set(`${c}_${s.toUpperCase()}_${d}`, a); },
    unrecordSubjectPeriod: (c, s, d, p) => { const k = `${c}_${s.toUpperCase()}_${d}`; sPeriods.set(k, (sPeriods.get(k) || []).filter(x => x !== p)); },
    getSubjectPeriodsOnDay: (c, s, d) => sPeriods.get(`${c}_${s.toUpperCase()}_${d}`) || [],
    canTeacherTakeBlockOnDay: () => true,
  });
  assert.equal(repaired, 1, 'Kempe swap must place SN into ISNIN P1 by moving MT to ISNIN P2');
  assert.equal(scheduledPerAssignment.get('a_sn'), 1);
}
console.log('  ✓ PASSED: Anti-fragmentation, 2+1 separated, feasibility check & Kempe swap enforced!');

// 3. Full schedule test with real school teachers (2027 & 2026)
for (const year of ['2027', '2026'] as const) {
  console.log(`\n[TEST 3 - ${year}] Verifying compact auto-scheduled grid for all 6 grades (real teachers)...`);
  const matrix = buildDefaultCurriculumMatrix(year, { includeLegacyTeachers: true });
  const teachers = getDefaultClassTeachers(true);
  const result = generateAutoSchedule(matrix, teachers, year, 0);

  assert.equal(result.unplaced.length, 0, `${year}: Unplaced blocks remain: ${result.unplaced.join(', ')}`);
  assert.equal(result.clashes.length, 0, `${year}: Clashes detected: ${result.clashes.length}`);

  const activeTeachers = Array.from(
    new Set(matrix.flatMap((r) => [...Object.values(r.teachers || {}), ...Object.values(r.secondaryTeachers || {})]))
  ).filter(Boolean);
  const audit = auditScheduleWorkload(result.grid, activeTeachers, year);

  console.log(
    `  ${year} Audit: T2_violations=${audit.tahap2SubjectCapViolations} | T1_over5=${audit.tahap1Over5Days} | T1_daysOver4=${audit.tahap1SubjectExcessDays} | periodCapViol=${audit.subjectDailyPeriodCapViolations} | fragmentedViol=${audit.fragmentedSubjectViolations} | gaps=${audit.middleGaps} | totalSubjectDays=${audit.totalDistinctSubjectDays}`
  );

  // Explicit verification of zero 3-consecutive same-subject periods across every class/day
  let threeConsecCount = 0;
  for (let g = 1; g <= 6; g++) {
    const dayCounts = ['ISNIN', 'SELASA', 'RABU', 'KHAMIS', 'JUMAAT'].map((d) => {
      const subs = new Set<string>();
      const subPositions = new Map<string, number[]>();
      const entries = Object.entries((result.grid as any)[g][d]).filter(([sid]) =>
        sid.startsWith('W')
      );
      entries.forEach(([sid, c]: [string, any]) => {
        if (!c || !c.subjectCode) return;
        const sc = c.subjectCode.toUpperCase();
        if (sc !== 'PN' && sc !== 'TASMIK' && sc !== 'MEMBACA' && !sc.startsWith('PKAR')) {
          subs.add(sc);
          const pNum = parseInt(sid.slice(1), 10);
          const arr = subPositions.get(sc) || [];
          arr.push(pNum);
          subPositions.set(sc, arr);
        }
      });
      subPositions.forEach((ps) => {
        if (hasThreeConsecutiveSameSubject(ps, [])) threeConsecCount++;
      });
      return `${d.slice(0, 3)}:${subs.size}`;
    });
    console.log(`    Tahun ${g} distinct subjects/day: [${dayCounts.join(', ')}]`);
  }
  assert.equal(threeConsecCount, 0, `${year}: Found ${threeConsecCount} occurrences of 3 consecutive same-subject periods!`);

  assert.equal(audit.teachersOver8, 0, `${year}: Teachers over 8.0: ${audit.violations.join('; ')}`);
  assert.equal(audit.teachersExceedingOver7Limit, 0, `${year}: Teachers exceeding >7 limit: ${audit.violations.join('; ')}`);
  assert.equal(audit.tahap2SubjectCapViolations, 0, `${year}: Tahap 2 >6 subject violations: ${audit.violations.join('; ')}`);
  assert.equal(audit.tahap1Over5Days, 0, `${year}: Tahap 1 >5 subject violations: ${audit.violations.join('; ')}`);
  assert.equal(audit.subjectDailyPeriodCapViolations, 0, `${year}: Daily period cap violations: ${audit.violations.join('; ')}`);
  assert.equal(audit.fragmentedSubjectViolations, 0, `${year}: Fragmented subject violations: ${audit.violations.join('; ')}`);
  assert.equal(audit.pmPaiBlockViolations, 0, `${year}: PM/PAI block violations: ${audit.violations.join('; ')}`);
  assert.equal(audit.pjConsecutiveViolations, 0, `${year}: PJ consecutive violations`);
  assert.equal(audit.pjSlotViolations, 0, `${year}: PJ slot violations`);
  assert.equal(audit.middleGaps, 0, `${year}: Middle gaps found`);
  console.log(`  ✓ PASSED ${year}: 0 clashes, 0 unplaced, 0 gaps, 0 fragmentation, 0 three-consecutive!`);
}

console.log('\n================================================================');
console.log('ALL COMPACT GROUPING TESTS PASSED (100%)');
console.log('================================================================');
