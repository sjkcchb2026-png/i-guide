import assert from 'node:assert/strict';
import {
  generateAutoSchedule,
  auditScheduleWorkload,
  resetScheduleSignature,
} from '../src/components/Timetable/autoScheduler';
import { DAYS_OF_WEEK, DayOfWeek } from '../src/components/Timetable/types';
import {
  buildDefaultCurriculumMatrix,
  getDefaultClassTeachers,
} from '../src/constants/defaultCurriculumMatrix';
import {
  runTimetableEngine,
  ClassProfile,
  TeacherProfile,
  SubjectAssignment,
} from '../src/utils/timetableEngine';

console.log('================================================================');
console.log('iSEPADU AI — WORKLOAD CAP (<=8/day), EVEN SPREAD & PJ GAP TEST');
console.log('================================================================\n');

const defaultMatrix = buildDefaultCurriculumMatrix('2027', { includeLegacyTeachers: true });
const defaultTeachers = getDefaultClassTeachers(true);

const activeTeacherCodes = Array.from(
  new Set(
    defaultMatrix.flatMap((row) => [
      ...Object.values(row.teachers || {}),
      ...Object.values(row.secondaryTeachers || {}),
    ])
  )
).filter(Boolean);

// --------------------------------------------------------------------------
// PART 1: 5 consecutive full-school generateAutoSchedule runs
// --------------------------------------------------------------------------
console.log('[PART 1] Running 5 consecutive generateAutoSchedule runs (seeds 0..4)...');
resetScheduleSignature();

let totalTimeMs = 0;

for (let seed = 0; seed < 5; seed++) {
  const t0 = performance.now();
  const res = generateAutoSchedule(defaultMatrix, defaultTeachers, '2027', seed);
  const elapsed = performance.now() - t0;
  totalTimeMs += elapsed;

  console.log(`\n  Seed ${seed}: ${elapsed.toFixed(1)} ms | unplaced=${res.unplaced.length} | clashes=${res.clashes.length}`);
  assert.equal(res.unplaced.length, 0, `Seed ${seed}: Expected 0 unplaced blocks, got ${res.unplaced.length}`);
  assert.equal(res.clashes.length, 0, `Seed ${seed}: Expected 0 clashes, got ${res.clashes.length}`);

  const audit = auditScheduleWorkload(res.grid, activeTeacherCodes);
  assert.equal(
    audit.teachersOver8,
    0,
    `Seed ${seed}: Teachers over 8.0/day found: ${audit.violations.join('; ')}`
  );
  assert.equal(
    audit.teachersExceedingOver7Limit,
    0,
    `Seed ${seed}: Teachers with >1 day > 7.0 found: ${audit.violations.join('; ')}`
  );
  assert.equal(
    audit.pmPaiBlockViolations,
    0,
    `Seed ${seed}: PM/PAI consecutive double-block violation found: ${audit.violations.join('; ')}`
  );
  assert.equal(
    audit.pjConsecutiveViolations,
    0,
    `Seed ${seed}: PJ consecutive-day violation found: ${audit.violations.join('; ')}`
  );
  assert.equal(
    audit.pjSlotViolations,
    0,
    `Seed ${seed}: PJ slot violation found (must be W1 or W2, max 1/day): ${audit.violations.join('; ')}`
  );

  // Verify heavy teachers (W >= 26) have balanced daily distributions (no Friday starvation)
  const heavyCodes = ['DT', 'LCI', 'LSC', 'VY', 'JW', 'MFA', 'NCY'];
  for (const code of heavyCodes) {
    const summary = audit.teachers[code];
    assert.ok(summary, `Missing summary for teacher ${code}`);
    const loadsStr = DAYS_OF_WEEK.map((d) => `${d.slice(0, 3)}:${summary.daily[d]}`).join(', ');
    if (seed === 0) {
      console.log(`    ${code.padEnd(4)} (${summary.weeklyTotal}w): [${loadsStr}] (min=${summary.minDaily}, max=${summary.maxDaily})`);
    }
    assert.ok(
      summary.maxDaily <= 8.0,
      `Seed ${seed} ${code}: maxDaily ${summary.maxDaily} > 8.0`
    );
    const hasFractional = DAYS_OF_WEEK.some((d) => summary.daily[d] % 1 !== 0);
    const minAcceptable = Math.floor(summary.weeklyTotal / 5) - (hasFractional && summary.weeklyTotal <= 30.5 ? 1.5 : 1);
    assert.ok(
      summary.minDaily >= minAcceptable,
      `Seed ${seed} ${code} (${summary.weeklyTotal}w): uneven minDaily ${summary.minDaily} < ${minAcceptable} [${loadsStr}]`
    );
    assert.ok(
      summary.maxDaily - summary.minDaily <= 3,
      `Seed ${seed} ${code}: range max-min = ${summary.maxDaily - summary.minDaily} > 3 [${loadsStr}]`
    );
  }

  // Verify PJ placement details across Tahun 1..6
  let w2Total = 0;
  for (let grade = 1; grade <= 6; grade++) {
    const pjEntries: Array<{ day: DayOfWeek; dayIdx: number; slotId: string }> = [];
    DAYS_OF_WEEK.forEach((day, dayIdx) => {
      for (const slotId of ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11']) {
        const cell = res.grid[grade]?.[day]?.[slotId];
        if (cell?.subjectCode?.toUpperCase() === 'PJ') {
          pjEntries.push({ day, dayIdx, slotId });
          if (slotId === 'W2') w2Total++;
        }
      }
    });

    for (const e of pjEntries) {
      assert.ok(
        e.slotId === 'W1' || e.slotId === 'W2',
        `Seed ${seed} T.${grade} ${e.day}: PJ placed at ${e.slotId} (only W1/W2 allowed)`
      );
    }
    if (grade >= 2) {
      for (let i = 1; i < pjEntries.length; i++) {
        assert.ok(
          pjEntries[i].dayIdx - pjEntries[i - 1].dayIdx >= 2,
          `Seed ${seed} T.${grade}: PJ consecutive days ${pjEntries[i - 1].day} & ${pjEntries[i].day}`
        );
      }
    }
  }
  console.log(`    ✓ Passed audit | pjW2Count=${w2Total} | pmPaiViolations=${audit.pmPaiBlockViolations} | isValidWorkload=${audit.isValidWorkload}`);
}

console.log(`\n  ✓ Average runtime over 5 runs: ${(totalTimeMs / 5).toFixed(1)} ms/run`);

// --------------------------------------------------------------------------
// PART 2: runTimetableEngine daily cap (<=8.0), <=1 day > 7.0 & PJ gap checks
// --------------------------------------------------------------------------
console.log('\n[PART 2] Verifying runTimetableEngine hard cap & PJ constraints...');

const classes: ClassProfile[] = [
  { classId: 'c1', className: 'Tahun 1', grade: 1 },
  { classId: 'c2', className: 'Tahun 2', grade: 2 },
  { classId: 'c3', className: 'Tahun 3', grade: 3 },
];

const teachers: TeacherProfile[] = [
  { teacherId: 't_heavy', fullName: 'HEAVY TEACHER' },
  { teacherId: 't_pj', fullName: 'PJ TEACHER' },
  { teacherId: 't_other', fullName: 'OTHER TEACHER' },
];

// Give t_heavy 32 periods total (including Tuesday PN +1):
// BC c1 (12) + BM c2 (10) + MT c3 (6) + SEJ c3 (3) = 31 + PN(1) = 32w
const assignments: SubjectAssignment[] = [
  { assignmentId: 'a_bc1', classId: 'c1', className: 'Tahun 1', canonicalSubjectCode: 'BC', subjectName: 'Bahasa Cina', teacherId: 't_heavy', effectiveWeeklyPeriods: 12 },
  { assignmentId: 'a_bm2', classId: 'c2', className: 'Tahun 2', canonicalSubjectCode: 'BM', subjectName: 'Bahasa Melayu', teacherId: 't_heavy', effectiveWeeklyPeriods: 10 },
  { assignmentId: 'a_mt3', classId: 'c3', className: 'Tahun 3', canonicalSubjectCode: 'MT', subjectName: 'Matematik', teacherId: 't_heavy', effectiveWeeklyPeriods: 6 },
  { assignmentId: 'a_esd3', classId: 'c3', className: 'Tahun 3', canonicalSubjectCode: 'ESD', subjectName: 'ESD', teacherId: 't_heavy', effectiveWeeklyPeriods: 3 },
  // PJ for Tahun 1, 2, 3 taught by t_pj
  { assignmentId: 'a_pj1', classId: 'c1', className: 'Tahun 1', canonicalSubjectCode: 'PJ', subjectName: 'PJ', teacherId: 't_pj', effectiveWeeklyPeriods: 3 },
  { assignmentId: 'a_pj2', classId: 'c2', className: 'Tahun 2', canonicalSubjectCode: 'PJ', subjectName: 'PJ', teacherId: 't_pj', effectiveWeeklyPeriods: 3 },
  { assignmentId: 'a_pj3', classId: 'c3', className: 'Tahun 3', canonicalSubjectCode: 'PJ', subjectName: 'PJ', teacherId: 't_pj', effectiveWeeklyPeriods: 2 },
  // Fill remaining slots with t_other so Period 4 Year 1 also has options
  { assignmentId: 'a_bi1', classId: 'c1', className: 'Tahun 1', canonicalSubjectCode: 'BI', subjectName: 'BI', teacherId: 't_other', effectiveWeeklyPeriods: 4 },
  { assignmentId: 'a_mt1', classId: 'c1', className: 'Tahun 1', canonicalSubjectCode: 'MT', subjectName: 'MT', teacherId: 't_other', effectiveWeeklyPeriods: 7 },
];

const engineRes = runTimetableEngine({ classes, teachers, assignments, academicYear: '2027' });
assert.equal(engineRes.unplacedCount, 0, `runTimetableEngine left ${engineRes.unplacedCount} unplaced`);

const heavyByDay: Record<string, number> = { ISNIN: 0, SELASA: 0, RABU: 0, KHAMIS: 0, JUMAAT: 0 };
for (const lesson of engineRes.lessons) {
  if (lesson.teacherId === 't_heavy' && lesson.countsAsTeacherPeriod !== false) {
    heavyByDay[lesson.day] = (heavyByDay[lesson.day] || 0) + (lesson.fractionalPeriod ?? 1);
  }
}
console.log('  runTimetableEngine t_heavy daily load:', heavyByDay);
const heavyLoads = Object.values(heavyByDay);
const heavyOver8 = heavyLoads.filter((v) => v > 8.0 + 1e-6).length;
const heavyOver7 = heavyLoads.filter((v) => v > 7.0 + 1e-6).length;
assert.equal(heavyOver8, 0, 't_heavy exceeded 8.0 periods in a day');
assert.ok(heavyOver7 <= 1, `t_heavy (32w) had ${heavyOver7} days > 7.0 (max 1 allowed)`);

// Check PJ for Tahun 2 & 3: W1/W2 only & >= 1-day gap
for (const cid of ['c2', 'c3']) {
  const pjLessons = engineRes.lessons
    .filter((l) => l.classId === cid && l.subjectCode === 'PJ' && l.countsAsClassPeriod !== false)
    .sort((a, b) => DAYS_OF_WEEK.indexOf(a.day as DayOfWeek) - DAYS_OF_WEEK.indexOf(b.day as DayOfWeek));

  assert.ok(pjLessons.length >= 2, `Expected >=2 PJ lessons for ${cid}`);
  for (const l of pjLessons) {
    assert.ok(l.periodNumber === 1 || l.periodNumber === 2, `${cid} ${l.day}: PJ periodNumber=${l.periodNumber} must be 1 or 2`);
  }
  for (let i = 1; i < pjLessons.length; i++) {
    const gap = DAYS_OF_WEEK.indexOf(pjLessons[i].day as DayOfWeek) - DAYS_OF_WEEK.indexOf(pjLessons[i - 1].day as DayOfWeek);
    assert.ok(gap >= 2, `${cid}: PJ consecutive days ${pjLessons[i - 1].day} & ${pjLessons[i].day}`);
  }
}

console.log('  ✓ Passed runTimetableEngine daily cap & PJ gap checks!');

// --------------------------------------------------------------------------
// PART 3: runTimetableEngine PM/PAI strict [2,2,1] / [2,2] / [2,1] double-block check
// --------------------------------------------------------------------------
console.log('\n[PART 3] Verifying runTimetableEngine PM/PAI consecutive double periods (2+2+1 / 2+2 / 2+1)...');

const pmPaiClasses: ClassProfile[] = [
  { classId: 't1', className: 'Tahun 1', grade: 1 },
  { classId: 't2', className: 'Tahun 2', grade: 2 },
  { classId: 't4', className: 'Tahun 4', grade: 4 },
  { classId: 't5', className: 'Tahun 5', grade: 5 },
  { classId: 't6', className: 'Tahun 6', grade: 6 },
];
const pmPaiTeachers: TeacherProfile[] = [
  { teacherId: 'MFA', fullName: 'USTAZ MFA' },
  { teacherId: 'PM1', fullName: 'CIKGU PM1' },
  { teacherId: 'PM2', fullName: 'CIKGU PM2' },
  { teacherId: 'PM4', fullName: 'CIKGU PM4' },
  { teacherId: 'PM5', fullName: 'CIKGU PM5' },
  { teacherId: 'PM6', fullName: 'CIKGU PM6' },
  { teacherId: 'T_CORE', fullName: 'CIKGU CORE' },
];
const pmPaiAssignments: SubjectAssignment[] = [
  { assignmentId: 'pm1', classId: 't1', className: 'Tahun 1', canonicalSubjectCode: 'PM', subjectName: 'PM', teacherId: 'PM1', effectiveWeeklyPeriods: 3 },
  { assignmentId: 'pai1', classId: 't1', className: 'Tahun 1', canonicalSubjectCode: 'PAI', subjectName: 'PAI', teacherId: 'MFA', effectiveWeeklyPeriods: 3 },
  { assignmentId: 'pm2', classId: 't2', className: 'Tahun 2', canonicalSubjectCode: 'PM', subjectName: 'PM', teacherId: 'PM2', effectiveWeeklyPeriods: 4 },
  { assignmentId: 'pai2', classId: 't2', className: 'Tahun 2', canonicalSubjectCode: 'PAI', subjectName: 'PAI', teacherId: 'MFA', effectiveWeeklyPeriods: 4 },
  { assignmentId: 'pm4', classId: 't4', className: 'Tahun 4', canonicalSubjectCode: 'PM', subjectName: 'PM', teacherId: 'PM4', effectiveWeeklyPeriods: 5 },
  { assignmentId: 'pai4', classId: 't4', className: 'Tahun 4', canonicalSubjectCode: 'PAI', subjectName: 'PAI', teacherId: 'MFA', effectiveWeeklyPeriods: 5 },
  { assignmentId: 'pm5', classId: 't5', className: 'Tahun 5', canonicalSubjectCode: 'PM', subjectName: 'PM', teacherId: 'PM5', effectiveWeeklyPeriods: 5 },
  { assignmentId: 'pai5', classId: 't5', className: 'Tahun 5', canonicalSubjectCode: 'PAI', subjectName: 'PAI', teacherId: 'MFA', effectiveWeeklyPeriods: 5 },
  { assignmentId: 'pm6', classId: 't6', className: 'Tahun 6', canonicalSubjectCode: 'PM', subjectName: 'PM', teacherId: 'PM6', effectiveWeeklyPeriods: 5 },
  { assignmentId: 'pai6', classId: 't6', className: 'Tahun 6', canonicalSubjectCode: 'PAI', subjectName: 'PAI', teacherId: 'MFA', effectiveWeeklyPeriods: 5 },
  { assignmentId: 'pj4', classId: 't4', className: 'Tahun 4', canonicalSubjectCode: 'PJ', subjectName: 'PJ', teacherId: 'T_CORE', effectiveWeeklyPeriods: 2 },
  { assignmentId: 'bc4', classId: 't4', className: 'Tahun 4', canonicalSubjectCode: 'BC', subjectName: 'BC', teacherId: 'T_CORE', effectiveWeeklyPeriods: 10 },
];

const pmPaiRes = runTimetableEngine({ classes: pmPaiClasses, teachers: pmPaiTeachers, assignments: pmPaiAssignments, academicYear: '2027' });
assert.equal(pmPaiRes.unplacedCount, 0, `PM/PAI runTimetableEngine left ${pmPaiRes.unplacedCount} unplaced`);

const expectedSignatures: Record<string, number[]> = {
  t1: [2, 1],
  t2: [2, 2],
  t4: [2, 2, 1],
  t5: [2, 2, 1],
  t6: [2, 2, 1],
};

for (const [cid, expected] of Object.entries(expectedSignatures)) {
  const pmLessons = pmPaiRes.lessons.filter((l) => l.classId === cid && l.subjectCode === 'PM/PAI');
  const byDay = new Map<string, number[]>();
  pmLessons.forEach((l) => {
    const arr = byDay.get(l.day) || [];
    arr.push(l.periodNumber);
    byDay.set(l.day, arr);
  });
  const blockSizes: number[] = [];
  byDay.forEach((periods, d) => {
    periods.sort((a, b) => a - b);
    assert.ok(periods.length <= 2, `${cid} ${d}: PM/PAI has ${periods.length} periods on same day`);
    if (periods.length === 2) {
      assert.equal(periods[1] - periods[0], 1, `${cid} ${d}: PM/PAI 2-period block not consecutive [${periods.join(',')}]`);
    }
    blockSizes.push(periods.length);
  });
  blockSizes.sort((a, b) => b - a);
  assert.deepEqual(blockSizes, expected, `${cid}: Expected PM/PAI pattern [${expected.join('+')}], got [${blockSizes.join('+')}]`);
}
console.log('  ✓ Passed runTimetableEngine strict PM/PAI [2,2,1] / [2,2] / [2,1] checks!');

console.log('\n================================================================');
console.log('ALL WORKLOAD CAP, EVEN SPREAD, PJ GAP & PM/PAI DOUBLE TESTS PASSED (100%)');
console.log('================================================================');
