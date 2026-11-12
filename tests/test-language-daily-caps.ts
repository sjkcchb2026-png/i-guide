import { buildDefaultCurriculumMatrix, getDefaultClassTeachers } from '../src/constants/defaultCurriculumMatrix';
import { generateAutoSchedule, detectScheduleClashes } from '../src/components/Timetable/autoScheduler';
import { getMaxDailyPeriodsForSubject, decomposeSubjectBlocks, canClassAcceptSubjectOnDay } from '../src/utils/timetableEngine';

console.log('================================================================');
console.log('iSEPADU AI — LANGUAGE SUBJECTS DAILY CAP & DECOMPOSITION TEST');
console.log('================================================================');

// 1. Test helper functions
console.log('[TEST 1] Verifying getMaxDailyPeriodsForSubject & decomposeSubjectBlocks...');
if (getMaxDailyPeriodsForSubject(2, 'PJ') !== 1) throw new Error('PJ max daily periods must be 1');
if (getMaxDailyPeriodsForSubject(12, 'BC') !== 3) throw new Error('12-period BC max daily periods must be 3');
if (getMaxDailyPeriodsForSubject(11, 'BC') !== 3) throw new Error('11-period BC max daily periods must be 3');
if (getMaxDailyPeriodsForSubject(10, 'BM') !== 2) throw new Error('10-period BM max daily periods must be 2');
if (getMaxDailyPeriodsForSubject(5, 'BI') !== 2) throw new Error('5-period BI max daily periods must be 2');
if (getMaxDailyPeriodsForSubject(6, 'MT') !== 2) throw new Error('6-period MT max daily periods must be 2');
console.log('  ✓ PASSED: getMaxDailyPeriodsForSubject correctly enforces 1 for PJ, 3 for 11/12w, 2 for <=10w');

const d12 = decomposeSubjectBlocks('BC', 12);
if (JSON.stringify(d12) !== JSON.stringify([3, 3, 2, 2, 2])) throw new Error(`12 BC decomposition mismatch: ${JSON.stringify(d12)}`);
const d10 = decomposeSubjectBlocks('BM', 10);
if (JSON.stringify(d10) !== JSON.stringify([2, 2, 2, 2, 2])) throw new Error(`10 BM decomposition mismatch: ${JSON.stringify(d10)}`);
const d5 = decomposeSubjectBlocks('BI', 5);
if (JSON.stringify(d5) !== JSON.stringify([2, 2, 1])) throw new Error(`5 BI decomposition mismatch: ${JSON.stringify(d5)}`);
console.log('  ✓ PASSED: decomposeSubjectBlocks correctly decomposes 12, 10, 5 periods');

// 2. Test canClassAcceptSubjectOnDay
console.log('[TEST 2] Verifying canClassAcceptSubjectOnDay...');
const twoExisting = [{ subjectCode: 'BI' }, { subjectCode: 'BI' }];
if (canClassAcceptSubjectOnDay(twoExisting, 'BI', 5, 1) !== false) {
  throw new Error('canClassAcceptSubjectOnDay must reject 3rd period for 5-period BI');
}
const threeExisting = [{ subjectCode: 'BC' }, { subjectCode: 'BC' }, { subjectCode: 'BC' }];
if (canClassAcceptSubjectOnDay(threeExisting, 'BC', 12, 1) !== false) {
  throw new Error('canClassAcceptSubjectOnDay must reject 4th period for 12-period BC');
}
const oneExisting = [{ subjectCode: 'BM' }];
if (canClassAcceptSubjectOnDay(oneExisting, 'BM', 10, 1) !== false) {
  throw new Error('canClassAcceptSubjectOnDay must reject splitting <=10w subject into separate session on same day');
}
console.log('  ✓ PASSED: canClassAcceptSubjectOnDay strictly prevents 4 periods and prevents daily splits for <=10w');

// 3. Test generateAutoSchedule for all grades and days
console.log('[TEST 3] Verifying auto-scheduled grid for all 6 grades...');
const matrix = buildDefaultCurriculumMatrix('2027');
const teachers = getDefaultClassTeachers();
const result = generateAutoSchedule(matrix, teachers, '2027');

let violations = 0;
for (let g = 1; g <= 6; g++) {
  for (const day of ['ISNIN', 'SELASA', 'RABU', 'KHAMIS', 'JUMAAT'] as any[]) {
    const counts: Record<string, number> = {};
    Object.values((result.grid as any)[g][day]).forEach((c: any) => {
      if (c && c.subjectCode) {
        counts[c.subjectCode] = (counts[c.subjectCode] || 0) + 1;
      }
    });

    for (const [sub, cnt] of Object.entries(counts)) {
      if (sub === 'PJ' && cnt > 1) {
        console.error(`❌ Grade ${g} ${day} PJ has ${cnt} periods (max allowed: 1)`);
        violations++;
      }
      if (sub === 'BC' && cnt > 3) {
        console.error(`❌ Grade ${g} ${day} BC has ${cnt} periods (max allowed: 3)`);
        violations++;
      }
      if (sub !== 'BC' && sub !== 'TASMIK' && sub !== 'MEMBACA' && cnt > 2) {
        console.error(`❌ Grade ${g} ${day} ${sub} has ${cnt} periods (max allowed: 2)`);
        violations++;
      }
    }
  }
}

if (violations > 0) {
  throw new Error(`Found ${violations} daily period cap violations!`);
}
console.log('  ✓ PASSED: 0 daily period cap violations across all 6 grades and 5 days!');

if (result.unplaced.length > 0) {
  throw new Error(`Unplaced blocks remain: ${result.unplaced.join(', ')}`);
}
console.log('  ✓ PASSED: 0 unplaced blocks!');

if (result.clashes.length > 0) {
  throw new Error(`Clashes detected: ${result.clashes.length}`);
}
console.log('  ✓ PASSED: 0 teacher clashes!');

console.log('================================================================');
console.log('ALL TESTS PASSED (100%)');
console.log('================================================================');
