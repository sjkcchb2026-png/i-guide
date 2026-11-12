import {
  isTeacherBusyInTimeRange,
  scoreDoubleSlotCandidate,
  TimeInterval,
  generateAutoSchedule,
  detectScheduleClashes,
} from '../src/components/Timetable/autoScheduler';
import { buildDefaultCurriculumMatrix, getDefaultClassTeachers } from '../src/constants/defaultCurriculumMatrix';
import { isTimetableConflict, runTimetableEngine } from '../src/utils/timetableEngine';

function assert(desc: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓ PASSED: ${desc}`);
  } else {
    console.error(`  ✗ FAILED: ${desc}`);
    process.exit(1);
  }
}

console.log('================================================================');
console.log('iSEPADU AI — ZERO COLLISION GUARANTEE & TIMETABLE RULES TEST SUITE');
console.log('================================================================');

// 1. isTeacherBusyInTimeRange test
console.log('\n[TEST 1] isTeacherBusyInTimeRange real clock minute collision...');
const existingIntervals: TimeInterval[] = [
  // T.1 W8: 11:45 - 12:15 (705 to 735)
  {
    day: 'ISNIN',
    startMinutes: 705,
    endMinutes: 735,
    classId: 'T1',
    subjectCode: 'BM',
  },
];

// Candidate in T.6 W9: 11:45 - 12:15 (705 to 735) -> EXACT OVERLAP!
assert(
  '1A: Exact same clock time on same day -> isTeacherBusyInTimeRange returns true',
  isTeacherBusyInTimeRange(existingIntervals, 'ISNIN', 705, 735, 'BM') === true
);

// Candidate in T.6 W8: 11:15 - 11:45 (675 to 705) -> NO OVERLAP (adjacent)
assert(
  '1B: Adjacent non-overlapping time interval -> isTeacherBusyInTimeRange returns false',
  isTeacherBusyInTimeRange(existingIntervals, 'ISNIN', 675, 705, 'BM') === false
);

// Candidate partial overlap: 11:30 - 12:00 (690 to 720)
assert(
  '1C: Partial clock time overlap -> isTeacherBusyInTimeRange returns true',
  isTeacherBusyInTimeRange(existingIntervals, 'ISNIN', 690, 720, 'BM') === true
);

// TASMIK exemption (Gabung kelas)
const tasmikIntervals: TimeInterval[] = [
  {
    day: 'RABU',
    startMinutes: 765,
    endMinutes: 795,
    classId: 'T1',
    subjectCode: 'TASMIK',
  },
];
assert(
  '1D: Concurrent TASMIK slots for same Ustaz -> isTeacherBusyInTimeRange exempts Gabung Kelas (returns false)',
  isTeacherBusyInTimeRange(tasmikIntervals, 'RABU', 765, 795, 'TASMIK') === false
);

// 2. scoreDoubleSlotCandidate test
console.log('\n[TEST 2] scoreDoubleSlotCandidate scoring function...');
assert(
  '2A: Consecutive slots on same side of recess (P1-P2) scores 100',
  scoreDoubleSlotCandidate(1, 2, 5) === 100
);
assert(
  '2B: Consecutive slots crossing recess (P5-P6 with recessAfterPeriod=5) scores 40',
  scoreDoubleSlotCandidate(5, 6, 5) === 40
);

// 3. Full School Auto-Scheduler Zero Collision Test
console.log('\n[TEST 3] Generating full school auto-schedule from default matrix...');
const matrix = buildDefaultCurriculumMatrix('2027');
const teachers = getDefaultClassTeachers();
const result = generateAutoSchedule(matrix, teachers, '2027');

console.log(`  - Clashes detected: ${result.clashes.length}`);
console.log(`  - Unplaced count: ${result.unplaced.length}`);

assert(
  '3A: Complete zero collisions guarantee: detectScheduleClashes returns 0 clashes',
  result.clashes.length === 0
);
assert(
  '3B: Complete placement guarantee: all subjects and blocks 100% placed (0 unplaced)',
  result.unplaced.length === 0
);

// Verify Perhimpunan (PN) on Wednesday (RABU) W1
[1, 2, 3, 4, 5, 6].forEach((g) => {
  const pnCell = result.grid[g]['RABU']['W1'];
  assert(
    `3C: Grade ${g} has locked Perhimpunan (PN) on RABU W1`,
    Boolean(pnCell && pnCell.subjectCode === 'PN' && pnCell.isLocked)
  );
});

// Verify Year 1 PKAR daily slots
const pkarDays = ['ISNIN', 'SELASA', 'RABU', 'KHAMIS', 'JUMAAT'] as const;
pkarDays.forEach((day, idx) => {
  const pkarCell = result.grid[1][day]['PKAR'];
  assert(
    `3D: Year 1 has PKAR_${idx + 1} locked on ${day} 09:30-09:45`,
    Boolean(pkarCell && pkarCell.subjectCode.startsWith('PKAR') && pkarCell.isLocked)
  );
});

console.log('================================================================');
console.log('ALL ZERO COLLISION & TIMETABLE ENGINE RULES VERIFIED (100% PASS)');
console.log('================================================================');
