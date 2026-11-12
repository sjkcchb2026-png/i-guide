import { runTimetableEngine, isTimetableConflict } from '../src/utils/timetableEngine';
import { SchoolAcademicAssignment } from '../src/types/schoolData';
import { generateAutoSchedule, detectScheduleClashes } from '../src/components/Timetable/autoScheduler';
import { buildDefaultCurriculumMatrix, getDefaultClassTeachers } from '../src/constants/defaultCurriculumMatrix';

console.log('================================================================');
console.log('iSEPADU AI — ALAM DAN MANUSIA (AM) CO-TEACHING TEST SUITE');
console.log('================================================================');

// TEST 1: SchoolAcademicAssignment Interface Verification
console.log('\n[TEST 1] Verifying SchoolAcademicAssignment interface...');
const testAssignment: SchoolAcademicAssignment = {
  assignmentId: 'asg_am_t1',
  classId: 'T1',
  className: 'Tahun 1',
  subjectCode: 'AM',
  subjectName: 'Alam dan Manusia',
  teacherId: 'NCY',
  secondaryTeacherId: 'VY',
  weeklyPeriods: 3,
  isTeamTeaching: true,
};
console.log('  ✓ PASSED: SchoolAcademicAssignment supports secondaryTeacherId and isTeamTeaching');

// TEST 2: runTimetableEngine AM Co-Teaching
console.log('\n[TEST 2] Verifying runTimetableEngine Co-Teaching for AM...');
const classes = [
  { classId: 'c1', className: 'Tahun 1', grade: 1 },
  { classId: 'c2', className: 'Tahun 2', grade: 2 },
];
const teachers = [
  { teacherId: 't1', fullName: 'NG CHIEW YONG', code: 'NCY' },
  { teacherId: 't2', fullName: 'VICTOR YII', code: 'VY' },
  { teacherId: 't3', fullName: 'STEPHANIE WONG', code: 'SW' },
];

const assignments = [
  {
    assignmentId: 'asg_am_c1',
    classId: 'c1',
    className: 'Tahun 1',
    canonicalSubjectCode: 'AM',
    subjectName: 'Alam dan Manusia',
    teacherId: 't1',
    secondaryTeacherId: 't2',
    effectiveWeeklyPeriods: 3,
    isTeamTeaching: true,
  },
  {
    assignmentId: 'asg_bc_c1',
    classId: 'c1',
    className: 'Tahun 1',
    canonicalSubjectCode: 'BC',
    subjectName: 'Bahasa Cina',
    teacherId: 't3',
    effectiveWeeklyPeriods: 10,
  },
];

const engineResult = runTimetableEngine({
  classes,
  teachers,
  assignments,
  academicYear: '2027',
});

// Check primary lessons
const primaryAmLessons = engineResult.lessons.filter(
  (l) => l.classId === 'c1' && l.subjectCode === 'AM' && l.countsAsClassPeriod
);
console.log(`  - Primary AM Lessons: ${primaryAmLessons.length}`);
if (primaryAmLessons.length !== 3) {
  throw new Error(`Expected exactly 3 primary AM lessons for class, got ${primaryAmLessons.length}`);
}
console.log('  ✓ PASSED: Exactly 3 class periods scheduled for AM');

// Check secondary lessons
const secondaryAmLessons = engineResult.lessons.filter(
  (l) => l.classId === 'c1' && l.subjectCode === 'AM' && !l.countsAsClassPeriod && l.countsAsTeacherPeriod
);
console.log(`  - Secondary Co-Teaching AM Lessons: ${secondaryAmLessons.length}`);
if (secondaryAmLessons.length !== 3) {
  throw new Error(`Expected exactly 3 secondary co-teaching AM lessons for Teacher 2, got ${secondaryAmLessons.length}`);
}
console.log('  ✓ PASSED: Exactly 3 secondary lessons generated for Teacher 2 (countsAsClassPeriod: false, countsAsTeacherPeriod: true)');

// Verify combined teacher name on primary lesson
primaryAmLessons.forEach((l) => {
  if (!l.teacherName.includes('NG CHIEW YONG') || !l.teacherName.includes('VICTOR YII')) {
    throw new Error(`Primary lesson teacherName should combine both teachers, got ${l.teacherName}`);
  }
});
console.log('  ✓ PASSED: Primary AM lesson displays combined names "NG CHIEW YONG / VICTOR YII"');

// Check that isTimetableConflict whitelists co-teaching parent/child slots
const conflict = isTimetableConflict(primaryAmLessons[0], secondaryAmLessons[0]);
if (conflict) {
  throw new Error('isTimetableConflict should return false for co-teaching lesson pair');
}
console.log('  ✓ PASSED: isTimetableConflict exempts co-teaching slot pairs');

// TEST 3: autoScheduler Dual-Teacher placement
console.log('\n[TEST 3] Verifying autoScheduler with default matrix AM Co-Teaching...');
const matrix = buildDefaultCurriculumMatrix('2027');
const classTeachers = getDefaultClassTeachers();

const amRow = matrix.find((r) => r.subjectCode === 'AM');
if (!amRow) {
  throw new Error('Matrix missing AM subject row');
}
if (!amRow.secondaryTeachers || !amRow.secondaryTeachers[1]) {
  throw new Error('AM row missing secondaryTeachers for Year 1');
}
console.log(`  ✓ PASSED: Default matrix contains AM row with Guru 1 (${amRow.teachers[1]}) and Guru 2 (${amRow.secondaryTeachers[1]})`);

const autoResult = generateAutoSchedule(matrix, classTeachers, '2027');
console.log(`  - Generated auto schedule with ${Object.keys(autoResult.grid).length} grades`);

// Verify Year 1 contains AM slots with both teachers
let amSlotCount = 0;
['ISNIN', 'SELASA', 'RABU', 'KHAMIS', 'JUMAAT'].forEach((day) => {
  Object.values(autoResult.grid[1][day]).forEach((cell) => {
    if (cell && cell.subjectCode === 'AM') {
      amSlotCount++;
      if (!cell.teacherCode.includes('/')) {
        throw new Error(`Expected AM teacherCode to include both teachers (e.g. NCY/VY), got ${cell.teacherCode}`);
      }
      if (!cell.isCoTeaching) {
        throw new Error('Expected cell.isCoTeaching to be true for AM slot');
      }
    }
  });
});

console.log(`  - Total AM slots scheduled for Grade 1: ${amSlotCount}`);
if (amSlotCount !== 3) {
  throw new Error(`Expected 3 AM slots for Grade 1, got ${amSlotCount}`);
}
console.log('  ✓ PASSED: Year 1 AM scheduled with combined teacher codes and marked isCoTeaching: true');

console.log('\n================================================================');
console.log('ALL AM CO-TEACHING TESTS PASSED (100%)');
console.log('================================================================');
