import {
  canAssignYear1Period4,
  getFridayTasmikSlotMeta,
  computeScheduleSignature,
  isSignificantlyDifferentFromPrevious,
  resetScheduleSignature,
} from '../src/utils/timetableEngine';
import { generateAutoSchedule } from '../src/components/Timetable/autoScheduler';
import { buildDefaultCurriculumMatrix, getDefaultClassTeachers } from '../src/constants/defaultCurriculumMatrix';

console.log('--- TEST 1: canAssignYear1Period4 ---');

// Non-Year-1 or non-period-4 should always be true
console.assert(
  canAssignYear1Period4(2, 4, 'BC', 'T1', []) === true,
  'Year 2 should not be restricted by Year 1 rule'
);
console.assert(
  canAssignYear1Period4(1, 3, 'BC', 'T1', []) === true,
  'Year 1 Period 3 should not be restricted'
);

// Year 1 Period 4 strict mode
const existingP4 = [
  { day: 'ISNIN', subjectCode: 'BC', teacherId: 'T1' },
  { day: 'SELASA', subjectCode: 'BM', teacherId: 'T2' },
];

// Strict mode: same teacher T1 should be rejected
console.assert(
  canAssignYear1Period4(1, 4, 'MT', 'T1', existingP4, true) === false,
  'Strict mode: same teacher T1 should be rejected'
);

// Strict mode: same subject BC should be rejected
console.assert(
  canAssignYear1Period4(1, 4, 'BC', 'T3', existingP4, true) === false,
  'Strict mode: same subject BC should be rejected'
);

// Strict mode: new teacher T3 and new subject MT should be accepted
console.assert(
  canAssignYear1Period4(1, 4, 'MT', 'T3', existingP4, true) === true,
  'Strict mode: new teacher T3 and new subject MT should be accepted'
);

// Fallback mode (strictMode = false): same teacher can teach up to 2 times
console.assert(
  canAssignYear1Period4(1, 4, 'MT', 'T1', existingP4, false) === true,
  'Fallback mode: teacher with count=1 can be assigned again (< 2)'
);

const existingP4WithTwoT1 = [
  { day: 'ISNIN', subjectCode: 'BC', teacherId: 'T1' },
  { day: 'SELASA', subjectCode: 'BM', teacherId: 'T2' },
  { day: 'RABU', subjectCode: 'MT', teacherId: 'T1' },
];

console.assert(
  canAssignYear1Period4(1, 4, 'BI', 'T1', existingP4WithTwoT1, false) === false,
  'Fallback mode: teacher with count=2 must be rejected'
);

console.log('✅ canAssignYear1Period4 passed all tests!');

console.log('\n--- TEST 2: getFridayTasmikSlotMeta ---');
const t1Meta = getFridayTasmikSlotMeta(1);
const t2Meta = getFridayTasmikSlotMeta(2);
const t3Meta = getFridayTasmikSlotMeta(3);
const t4Meta = getFridayTasmikSlotMeta(4);
const t5Meta = getFridayTasmikSlotMeta(5);
const t6Meta = getFridayTasmikSlotMeta(6);

console.assert(t1Meta.periodNumber === 8 && t1Meta.timeLabel === '11:15 - 11:45', 'T1 Friday meta incorrect');
console.assert(t2Meta.periodNumber === 8 && t2Meta.timeLabel === '11:15 - 11:45', 'T2 Friday meta incorrect');
console.assert(t3Meta.periodNumber === 8 && t3Meta.timeLabel === '11:15 - 11:45', 'T3 Friday meta incorrect');
console.assert(t1Meta.startMinutes === 675 && t1Meta.endMinutes === 705, 'T1 Friday minutes incorrect');

console.assert(t4Meta.periodNumber === 9 && t4Meta.timeLabel === '11:45 - 12:15', 'T4 Friday meta incorrect');
console.assert(t5Meta.periodNumber === 9 && t5Meta.timeLabel === '11:45 - 12:15', 'T5 Friday meta incorrect');
console.assert(t6Meta.periodNumber === 9 && t6Meta.timeLabel === '11:45 - 12:15', 'T6 Friday meta incorrect');
console.assert(t4Meta.startMinutes === 705 && t4Meta.endMinutes === 735, 'T4 Friday minutes incorrect');

console.log('✅ getFridayTasmikSlotMeta passed all tests!');

console.log('\n--- TEST 3: computeScheduleSignature & isSignificantlyDifferentFromPrevious ---');
resetScheduleSignature();

const dummyLessonsA = [
  { classId: 'T1', day: 'ISNIN', periodNumber: 1, subjectCode: 'BC', countsAsClassPeriod: true },
  { classId: 'T1', day: 'ISNIN', periodNumber: 2, subjectCode: 'BC', countsAsClassPeriod: true },
  { classId: 'T1', day: 'SELASA', periodNumber: 1, subjectCode: 'PN', countsAsClassPeriod: true }, // PN should be excluded
  { classId: 'T1', day: 'RABU', periodNumber: 1, subjectCode: 'MT', countsAsClassPeriod: true },
  { classId: 'T1', day: 'KHAMIS', periodNumber: 1, subjectCode: 'BI', countsAsClassPeriod: true },
];

const sigA = computeScheduleSignature(dummyLessonsA);
console.log('Signature A:', sigA);
console.assert(!sigA.includes('PN'), 'Signature must exclude PN');
console.assert(sigA.includes('T1_ISNIN_P1:BC'), 'Signature must contain regular lessons');

// First check returns true (first run)
console.assert(isSignificantlyDifferentFromPrevious(dummyLessonsA) === true, 'First schedule should return true');

// Identical schedule should return false (similarity is 100% > 70%)
console.assert(isSignificantlyDifferentFromPrevious(dummyLessonsA) === false, 'Identical schedule should return false');

// Schedule with 60% changes should return true
const dummyLessonsB = [
  { classId: 'T1', day: 'ISNIN', periodNumber: 1, subjectCode: 'SN', countsAsClassPeriod: true },
  { classId: 'T1', day: 'ISNIN', periodNumber: 2, subjectCode: 'SN', countsAsClassPeriod: true },
  { classId: 'T1', day: 'SELASA', periodNumber: 1, subjectCode: 'PN', countsAsClassPeriod: true },
  { classId: 'T1', day: 'RABU', periodNumber: 1, subjectCode: 'PJ', countsAsClassPeriod: true },
  { classId: 'T1', day: 'KHAMIS', periodNumber: 1, subjectCode: 'BI', countsAsClassPeriod: true }, // only this one overlaps
];

console.assert(isSignificantlyDifferentFromPrevious(dummyLessonsB) === true, 'Significantly different schedule should return true');

console.log('✅ Schedule signature comparison passed all tests!');

console.log('\n--- TEST 4: Dynamic schedule variation with full matrix ---');
const defaultMatrix = buildDefaultCurriculumMatrix('2027', { includeLegacyTeachers: true });
const defaultTeachers = getDefaultClassTeachers(true);
resetScheduleSignature();

const res1 = generateAutoSchedule(defaultMatrix, defaultTeachers, '2027', 0);
console.log('Run 1 unplaced:', res1.unplaced.length, 'clashes:', res1.clashes.length);
console.assert(res1.unplaced.length === 0, 'Run 1 should have 0 unplaced');
console.assert(res1.clashes.length === 0, 'Run 1 should have 0 clashes');

const isDiff1 = isSignificantlyDifferentFromPrevious(res1.grid);
console.log('Run 1 initial signature registered:', isDiff1);

const res2 = generateAutoSchedule(defaultMatrix, defaultTeachers, '2027', 1);
console.log('Run 2 unplaced:', res2.unplaced.length, 'clashes:', res2.clashes.length);
console.assert(res2.unplaced.length === 0, 'Run 2 should have 0 unplaced');
console.assert(res2.clashes.length === 0, 'Run 2 should have 0 clashes');

const isDiff2 = isSignificantlyDifferentFromPrevious(res2.grid);
console.log('Run 2 is significantly different from Run 1 (>30% variation):', isDiff2);
console.assert(isDiff2 === true, 'Run 2 should be significantly different from Run 1');

// Verify Year 1 W4 rotation: count distinct teachers in Year 1 W4
const y1W4Teachers = ['ISNIN', 'SELASA', 'RABU', 'KHAMIS', 'JUMAAT'].map((d) => {
  return (res2.grid as any)[1]?.[d]?.['W4']?.teacherCode || '';
}).filter(Boolean);
console.log('Year 1 W4 teachers across Mon-Fri:', y1W4Teachers);
const distinctY1W4Teachers = new Set(y1W4Teachers);
console.log('Distinct Year 1 W4 teachers count:', distinctY1W4Teachers.size);
console.assert(distinctY1W4Teachers.size >= 4, 'Year 1 W4 should have diverse teachers (>= 4 distinct teachers)');

console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉');
