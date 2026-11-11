import { determineStaffCategory, validateLeaveSubmission } from '../src/utils/checkoutRules';
import { getTodayDateString } from '../src/utils/date';

console.log('=== TEST 1: Staff Category Classification (g- / g. vs AKP) ===');

const testCases = [
  { email: 'g-12345678@moe-dl.edu.my', expected: 'GURU' },
  { email: 'g.87654321@moe-dl.edu.my', expected: 'GURU' },
  { email: 'g-teacher@school.edu.my', expected: 'GURU' },
  { email: 'g.teacher@gmail.com', expected: 'GURU' },
  { email: 'guru@moe-dl.edu.my', expected: 'GURU' },
  { email: 'staff@moe-dl.edu.my', expected: 'AKP' },
  { email: 'kerani@gmail.com', expected: 'AKP' },
  { email: 'pembantu@yahoo.com', expected: 'AKP' },
  { email: 'sjkcchb2026@gmail.com', expected: 'AKP' },
  { email: 'akp123@moe-dl.edu.my', expected: 'AKP' },
];

for (const tc of testCases) {
  const result = determineStaffCategory(tc.email);
  if (result !== tc.expected) {
    throw new Error(`Failed for ${tc.email}: expected ${tc.expected}, got ${result}`);
  }
  console.log(`✅ ${tc.email} -> ${result} (Expected: ${tc.expected})`);
}

console.log('\n=== TEST 2: Leave & Official Duty Submission Validation ===');

const todayStr = getTodayDateString();

// Tomorrow
const tomorrowDate = new Date();
tomorrowDate.setDate(tomorrowDate.getDate() + 1);
const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

// Yesterday
const yesterdayDate = new Date();
yesterdayDate.setDate(yesterdayDate.getDate() - 1);
const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

// 1. Cuti Sakit (MC) must be today only
const mcToday = validateLeaveSubmission('CUTI_SAKIT', todayStr);
if (!mcToday.isValid) throw new Error('CUTI_SAKIT on today should be valid');
console.log('✅ CUTI_SAKIT on today:', mcToday);

const mcTomorrow = validateLeaveSubmission('CUTI_SAKIT', tomorrowStr);
if (mcTomorrow.isValid) throw new Error('CUTI_SAKIT on tomorrow should be invalid');
console.log('✅ CUTI_SAKIT on tomorrow blocked:', mcTomorrow.errorMessage);

const mcYesterday = validateLeaveSubmission('CUTI_SAKIT', yesterdayStr);
if (mcYesterday.isValid) throw new Error('CUTI_SAKIT on yesterday should be invalid');
console.log('✅ CUTI_SAKIT on yesterday blocked:', mcYesterday.errorMessage);

// 2. Official duties allowed in advance or past
const kursusTomorrow = validateLeaveSubmission('KURSUS', tomorrowStr);
if (!kursusTomorrow.isValid) throw new Error('KURSUS on tomorrow should be valid');
console.log('✅ KURSUS in advance:', kursusTomorrow);

const pertandinganTomorrow = validateLeaveSubmission('PERTANDINGAN', tomorrowStr);
if (!pertandinganTomorrow.isValid) throw new Error('PERTANDINGAN on tomorrow should be valid');
console.log('✅ PERTANDINGAN in advance:', pertandinganTomorrow);

const rasmiYesterday = validateLeaveSubmission('URUSAN_RASMI', yesterdayStr);
if (!rasmiYesterday.isValid) throw new Error('URUSAN_RASMI in past should be valid');
console.log('✅ URUSAN_RASMI in past:', rasmiYesterday);

// 3. Special long leaves allowed in advance
const barahAdvance = validateLeaveSubmission('CUTI_BARAH', tomorrowStr);
if (!barahAdvance.isValid) throw new Error('CUTI_BARAH in advance should be valid');
console.log('✅ CUTI_BARAH in advance:', barahAdvance);

const bersalinAdvance = validateLeaveSubmission('CUTI_BERSALIN', tomorrowStr);
if (!bersalinAdvance.isValid) throw new Error('CUTI_BERSALIN in advance should be valid');
console.log('✅ CUTI_BERSALIN in advance:', bersalinAdvance);

console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
