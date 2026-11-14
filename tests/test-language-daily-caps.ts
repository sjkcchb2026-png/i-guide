import assert from 'node:assert/strict';
import { buildDefaultCurriculumMatrix, getDefaultClassTeachers } from '../src/constants/defaultCurriculumMatrix';
import { generateAutoSchedule, auditScheduleWorkload } from '../src/components/Timetable/autoScheduler';
import {
  getMaxSubjectsPerDay,
  getMaxDailyPeriodsForSubject,
  decomposeSubjectCompactly,
  canAddSubjectToClassDay,
  canClassAcceptSubjectOnDay,
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

// 2. Test canAddSubjectToClassDay & canClassAcceptSubjectOnDay
console.log('[TEST 2] Verifying canAddSubjectToClassDay anti-fragmentation...');
// Major language: 2 consecutive + 1 allowed = 3
assert.equal(
  canAddSubjectToClassDay([{ subjectCode: 'BM' }, { subjectCode: 'BM' }], 'BM', 1, 1, {
    existingPeriodPositions: [0, 1],
    candidatePeriodPositions: [2],
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
console.log('  ✓ PASSED: Anti-fragmentation & distinct daily subject gates enforced!');

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

  for (let g = 1; g <= 6; g++) {
    const dayCounts = ['ISNIN', 'SELASA', 'RABU', 'KHAMIS', 'JUMAAT'].map((d) => {
      const subs = new Set<string>();
      Object.values((result.grid as any)[g][d]).forEach((c: any) => {
        if (!c || !c.subjectCode) return;
        const sc = c.subjectCode.toUpperCase();
        if (sc !== 'PN' && sc !== 'TASMIK' && sc !== 'MEMBACA' && !sc.startsWith('PKAR')) {
          subs.add(sc);
        }
      });
      return `${d.slice(0, 3)}:${subs.size}`;
    });
    console.log(`    Tahun ${g} distinct subjects/day: [${dayCounts.join(', ')}]`);
  }

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
  console.log(`  ✓ PASSED ${year}: 0 clashes, 0 unplaced, 0 gaps, 0 fragmentation, compact subjects!`);
}

console.log('\n================================================================');
console.log('ALL COMPACT GROUPING TESTS PASSED (100%)');
console.log('================================================================');
