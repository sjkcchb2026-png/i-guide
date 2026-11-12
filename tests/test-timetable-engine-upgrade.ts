import {
  runTimetableEngine,
  canTeacherTakeSlot,
  isTimetableConflict,
  ClassProfile,
  TeacherProfile,
  SubjectAssignment,
} from '../src/utils/timetableEngine';

console.log('================================================================');
console.log('iSEPADU AI — TIMETABLE ENGINE CORE UPGRADE TEST SUITE');
console.log('================================================================\n');

let passed = 0;
let total = 0;

function assert(desc: string, condition: boolean) {
  total++;
  if (condition) {
    console.log(`  ✓ PASSED: ${desc}`);
    passed++;
  } else {
    console.error(`  ✗ FAILED: ${desc}`);
  }
}

// --------------------------------------------------------------------------
// TEST 1: canTeacherTakeSlot 校验函数
// --------------------------------------------------------------------------
console.log('[RULE 2] Verifying canTeacherTakeSlot logic...');

// 2A: Max 8 periods/day
assert(
  '2A: Teacher with 8 periods on the day cannot take any additional period',
  canTeacherTakeSlot('t1', 'ISNIN', 10, [1, 2, 3, 4, 6, 7, 8, 9]) === false
);

// 2B: Morning (Periods 1-5) must leave at least 1 break (max 4 morning periods)
assert(
  '2B: Teacher with periods 1,2,3,4 already scheduled cannot take period 5 (would fill all 5 morning periods)',
  canTeacherTakeSlot('t1', 'ISNIN', 5, [1, 2, 3, 4]) === false
);
assert(
  '2B: Teacher with periods 1,2,3 already scheduled CAN take period 4 (total 4 morning periods <= 4)',
  canTeacherTakeSlot('t1', 'ISNIN', 4, [1, 2, 3]) === true
);

// 2C: Afternoon (Periods 6+) must leave at least 1 break
// On ISNIN (11 teaching periods, so periods 6,7,8,9,10,11 = 6 afternoon slots). If 5 already scheduled, 6th is blocked.
assert(
  '2C: Teacher on ISNIN with 6,7,8,9,10 already scheduled cannot take period 11 (would fill all 6 afternoon slots)',
  canTeacherTakeSlot('t1', 'ISNIN', 11, [6, 7, 8, 9, 10]) === false
);
assert(
  '2C: Teacher on ISNIN with 6,7,8 scheduled CAN take period 9 (3 afternoon slots taken out of 6)',
  canTeacherTakeSlot('t1', 'ISNIN', 9, [6, 7, 8]) === true
);

// --------------------------------------------------------------------------
// TEST 2: isTimetableConflict TASMIK Gabung Kelas 冲突白名单
// --------------------------------------------------------------------------
console.log('\n[RULE 4] Verifying isTimetableConflict Gabung Kelas whitelist...');

const tasmikLesson1 = {
  teacherId: 'ustaz_1',
  day: 'RABU',
  periodNumber: 11,
  subjectCode: 'TASMIK',
  classId: 'c1',
};
const tasmikLesson2Candidate = {
  teacherId: 'ustaz_1',
  day: 'RABU',
  periodNumber: 11,
  subjectCode: 'TASMIK',
  classId: 'c2',
};
const otherLessonCandidate = {
  teacherId: 'ustaz_1',
  day: 'RABU',
  periodNumber: 11,
  subjectCode: 'PI',
  classId: 'c2',
};

assert(
  '4A: Same teacher, same slot, both TASMIK -> isTimetableConflict returns false (Gabung Kelas allowed)',
  isTimetableConflict(tasmikLesson1, tasmikLesson2Candidate) === false
);
assert(
  '4B: Same teacher, same slot, but different subjects -> isTimetableConflict returns true (Clash intercepted)',
  isTimetableConflict(tasmikLesson1, otherLessonCandidate) === true
);

// --------------------------------------------------------------------------
// TEST 3: runTimetableEngine — PN 周会全员参与与在职教师 +1 节工作量
// --------------------------------------------------------------------------
console.log('\n[RULE 1] Verifying PN (Perhimpunan) all-teacher workload in runTimetableEngine...');

const mockClasses: ClassProfile[] = [
  { classId: 'cls_1', className: 'Tahun 1', grade: 1 },
  { classId: 'cls_2', className: 'Tahun 2', grade: 2 },
];

const mockTeachers: TeacherProfile[] = [
  { teacherId: 't_gb', fullName: 'TEO YANG MING' },
  { teacherId: 't_pk1', fullName: 'HO HUI HUA' },
  { teacherId: 't_bm', fullName: 'CIKGU BM' },
  { teacherId: 't_pem', fullName: 'CIKGU PEMULIHAN' },
  { teacherId: 't_ustaz', fullName: 'USTAZ AHMAD' },
];

const mockAssignments: SubjectAssignment[] = [
  // Class 1 BM regular course (10 periods: 5 days of 2-period double blocks)
  {
    assignmentId: 'asg_bm_1',
    classId: 'cls_1',
    className: 'Tahun 1',
    canonicalSubjectCode: 'BM',
    subjectName: 'Bahasa Melayu',
    teacherId: 't_bm',
    effectiveWeeklyPeriods: 8,
  },
  // Class 1 Pemulihan (4 periods: 2+1+1)
  {
    assignmentId: 'asg_pem_1',
    classId: 'cls_1',
    className: 'Tahun 1',
    canonicalSubjectCode: 'PBM',
    subjectName: 'Pemulihan BM',
    teacherId: 't_pem',
    effectiveWeeklyPeriods: 4,
    assignmentType: 'PBM',
    isPemulihan: true,
  },
  // Tasmik for Class 1 & Class 2 with Ustaz Ahmad
  {
    assignmentId: 'asg_tas_1',
    classId: 'cls_1',
    className: 'Tahun 1',
    canonicalSubjectCode: 'TASMIK',
    subjectName: 'Program Tasmik',
    teacherId: 't_ustaz',
    effectiveWeeklyPeriods: 2,
  },
  {
    assignmentId: 'asg_tas_2',
    classId: 'cls_2',
    className: 'Tahun 2',
    canonicalSubjectCode: 'TASMIK',
    subjectName: 'Program Tasmik',
    teacherId: 't_ustaz',
    effectiveWeeklyPeriods: 2,
  },
];

const result = runTimetableEngine({
  classes: mockClasses,
  teachers: mockTeachers,
  assignments: mockAssignments,
  academicYear: '2027',
});

// Verify PN lessons generated for classes on Tuesday (SELASA) Period 1
const pnClassLessons = result.lessons.filter((l) => l.isPN && l.countsAsClassPeriod);
assert(
  '1A: Class PN lessons scheduled on SELASA Period 1 for all non-prasekolah classes',
  pnClassLessons.length === mockClasses.length &&
  pnClassLessons.every((l) => l.day === 'SELASA' && l.periodNumber === 1 && l.subjectCode === 'PN')
);

// Verify PN workload lessons generated for every teacher on Tuesday (SELASA) Period 1 (+1 period)
const pnTeacherWorkloadLessons = result.lessons.filter(
  (l) => l.isPN && l.countsAsTeacherPeriod && !l.countsAsClassPeriod
);
assert(
  '1B: All active teachers have PN workload lesson on SELASA Period 1 (+1 teaching workload)',
  pnTeacherWorkloadLessons.length === mockTeachers.length &&
  pnTeacherWorkloadLessons.every((l) => l.day === 'SELASA' && l.periodNumber === 1 && l.countsAsTeacherPeriod === true)
);

// --------------------------------------------------------------------------
// TEST 4: PEMULIHAN 2+1+1 结构与优先抽连堂第2节
// --------------------------------------------------------------------------
console.log('\n[RULE 3] Verifying Pemulihan 2+1+1 distribution and 2nd-of-double block selection...');

const pemLessons = result.lessons.filter((l) => l.isPemulihan);
assert(
  '3A: Pemulihan scheduled exactly 4 periods for class 1',
  pemLessons.length === 4
);

// Check day distribution of Pemulihan lessons
const pemDays = new Map<string, number>();
pemLessons.forEach((l) => {
  pemDays.set(l.day, (pemDays.get(l.day) || 0) + 1);
});

const dayCounts = Array.from(pemDays.values()).sort((a, b) => b - a);
assert(
  '3B: Pemulihan follows 2 + 1 + 1 distribution (3 different days: one day with 2 periods, two days with 1 period)',
  dayCounts.length === 3 && dayCounts[0] === 2 && dayCounts[1] === 1 && dayCounts[2] === 1
);

// Verify single-period days pulled the 2nd period of the parent double block
const singleDays = Array.from(pemDays.entries()).filter(([_, count]) => count === 1).map(([day]) => day);
let secondPeriodPulled = true;
for (const day of singleDays) {
  const pemLesson = pemLessons.find((l) => l.day === day)!;
  // Look at the BM lessons on that day
  const bmLessonsOnDay = result.lessons.filter(
    (l) => !l.isPemulihan && !l.isPN && l.classId === 'cls_1' && l.subjectCode === 'BM' && l.day === day
  );
  if (bmLessonsOnDay.length === 2) {
    const sorted = bmLessonsOnDay.sort((a, b) => a.periodNumber - b.periodNumber);
    // pemLesson period must match sorted[1] (the second period)
    if (pemLesson.periodNumber !== sorted[1].periodNumber) {
      secondPeriodPulled = false;
    }
  }
}

assert(
  '3C: Single-period Pemulihan sessions pulled the second period of double block (isSecondOfDoubleBlock)',
  secondPeriodPulled
);

assert(
  '3D: Pemulihan lessons have parentTimetableSlotId and countsAsClassPeriod: false, countsAsTeacherPeriod: true',
  pemLessons.every((l) => !!l.parentTimetableSlotId && l.countsAsClassPeriod === false && l.countsAsTeacherPeriod === true)
);

// --------------------------------------------------------------------------
// TEST 5: Auto-pair PKAR with Pre-Recess Teacher & Year 1 Program Membaca
// --------------------------------------------------------------------------
console.log('\n[PKAR & MEMBACA] Verifying Program Membaca and Auto-paired PKAR...');

// Run an engine test with regular lessons covering pre-recess periods (W1-W5 on Mon-Thu, W1-W4 on Fri)
const regularAssignmentsTest: SubjectAssignment[] = [
  { assignmentId: 'asg_bm', classId: 'cls_1', className: 'Tahun 1', canonicalSubjectCode: 'BM', subjectName: 'Bahasa Melayu', teacherId: 't_bm', effectiveWeeklyPeriods: 10 },
  { assignmentId: 'asg_bc', classId: 'cls_1', className: 'Tahun 1', canonicalSubjectCode: 'BC', subjectName: 'Bahasa Cina', teacherId: 't_gb', effectiveWeeklyPeriods: 12 },
  { assignmentId: 'asg_mt', classId: 'cls_1', className: 'Tahun 1', canonicalSubjectCode: 'MT', subjectName: 'Matematik', teacherId: 't_pk1', effectiveWeeklyPeriods: 7 },
];

const autoPairResult = runTimetableEngine({
  classes: mockClasses,
  teachers: mockTeachers,
  assignments: regularAssignmentsTest,
  academicYear: '2027',
});

// 5A: Year 1 Program Membaca seeded with empty teacher
const membacaLessons = autoPairResult.lessons.filter((l) => l.subjectCode === 'MEMBACA');
assert(
  '5A: Year 1 Program Membaca seeded for all weekdays with empty teacher by default (for manual click assignment)',
  membacaLessons.length === 5 &&
  membacaLessons.every((l) => l.classId === 'cls_1' && l.teacherId === '' && l.periodNumber === 0)
);

// 5B: Auto PKAR paired to pre-recess teacher
const autoPkarLessons = autoPairResult.lessons.filter((l) => l.isAutoPKAR);
assert(
  '5B: Auto PKAR lessons generated with 0.5 fractionalPeriod and countsAsTeacherPeriod: true',
  autoPkarLessons.length > 0 &&
  autoPkarLessons.every((l) => l.fractionalPeriod === 0.5 && l.countsAsTeacherPeriod === true && !!l.teacherId)
);

assert(
  '5C: PKAR teacher matches the teacher of the period immediately before recess',
  autoPkarLessons.every((pkar) => {
    const prePeriod = pkar.day === 'JUMAAT' ? 4 : 5;
    const preLesson = autoPairResult.lessons.find(
      (l) => l.classId === pkar.classId && l.day === pkar.day && l.periodNumber === prePeriod && !l.isPemulihan && l.countsAsClassPeriod
    );
    return preLesson && preLesson.teacherId === pkar.teacherId;
  })
);

console.log('\n================================================================');
console.log(`Results: ${passed}/${total} assertions passed.`);
console.log('================================================================\n');

if (passed === total) {
  process.exit(0);
} else {
  process.exit(1);
}
