import { isTeacherForTimetable } from '../src/utils/checkoutRules';
import { OFFICIAL_TEACHERS, generateTeacherShortCode } from '../src/constants/officialRoster';

console.log('================================================================');
console.log('iSEPADU AI — TIMETABLE TEACHERS & SHORT FORM VERIFICATION');
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
// 1. isTeacherForTimetable 校验
// --------------------------------------------------------------------------
console.log('[TEST 1] Verifying isTeacherForTimetable identifies Muhammad Fahim Amar and excludes AKP...');

const fahimProfile = {
  name: 'MUHAMMAD FAHIM AMAR BIN ABDUL RAHIM',
  email: 'muhammadfahimamar.abdulrahim@moe-dl.edu.my',
  category: 'GURU',
  role: 'GURU',
  position: 'GPI',
};

assert('1A: Muhammad Fahim Amar is recognized as teacher for timetable', isTeacherForTimetable(fahimProfile) === true);

const stephanieProfile = {
  name: 'STEPHANIE WONG ENG HEE',
  email: 'g-ipgp21315167@moe-dl.edu.my',
  category: 'GURU',
  role: 'GURU',
  position: 'GAB',
};
assert('1B: Stephanie Wong Eng Hee is recognized as teacher for timetable', isTeacherForTimetable(stephanieProfile) === true);

const akpProfile1 = {
  name: 'MUHAMMAD ZAIM MUNIR ABDULLAH@AZENI',
  email: 'zaimmunir1@gmail.com',
  category: 'AKP',
  role: 'AKP',
  position: 'PKA',
};
assert('1C: PKA AKP is excluded from timetable', isTeacherForTimetable(akpProfile1) === false);

const akpProfile2 = {
  name: 'ROSNA BINTI IBRAHIM',
  email: 'rosnaibrahim318@gmail.com',
  category: 'AKP',
  role: 'AKP',
  position: 'PPM(PRA)',
};
assert('1D: PPM AKP is excluded from timetable', isTeacherForTimetable(akpProfile2) === false);

const akpProfile3 = {
  name: 'NURULJANNAH BINTI DANDAN',
  email: 'nuruljannah201090@gmail.com',
  category: 'AKP',
  role: 'CLERK',
  position: 'PT(P/O)',
};
assert('1E: PT Clerk is excluded from timetable', isTeacherForTimetable(akpProfile3) === false);

// --------------------------------------------------------------------------
// 2. generateTeacherShortCode 缩写规则校验 (4个词只用前2个字母缩写)
// --------------------------------------------------------------------------
console.log('\n[TEST 2] Verifying 4-word names use 2-letter short forms and 3-word names use 3-letter forms...');

assert(
  '2A: Stephanie wong eng hee -> SW (User requested: SW就好)',
  generateTeacherShortCode('Stephanie wong eng hee') === 'SW'
);

assert(
  '2B: STEPHANIE WONG ENG HEE -> SW',
  generateTeacherShortCode('STEPHANIE WONG ENG HEE') === 'SW'
);

assert(
  '2C: Doris Tiong Shu Qi (4 words) -> DT',
  generateTeacherShortCode('Doris Tiong Shu Qi') === 'DT'
);

assert(
  '2D: Kelly Lau Siao Rou (4 words) -> KL',
  generateTeacherShortCode('Kelly Lau Siao Rou') === 'KL'
);

assert(
  '2E: Victor Yii Zi Sheng (4 words) -> VY',
  generateTeacherShortCode('Victor Yii Zi Sheng') === 'VY'
);

assert(
  '2F: Jenny Wong (2 words) -> JW',
  generateTeacherShortCode('Jenny Wong') === 'JW'
);

assert(
  '2G: Lai Chin Ing (3 words) -> LCI (matches screenshot [1] LCI - LAI CHIN ING)',
  generateTeacherShortCode('Lai Chin Ing') === 'LCI'
);

assert(
  '2H: Teo Yang Ming (3 words) -> TYM',
  generateTeacherShortCode('Teo Yang Ming') === 'TYM'
);

assert(
  '2I: Muhammad Fahim Amar -> MFA',
  generateTeacherShortCode('Muhammad Fahim Amar') === 'MFA'
);

assert(
  '2J: MUHAMMAD FAHIM AMAR BIN ABDUL RAHIM -> MFA',
  generateTeacherShortCode('MUHAMMAD FAHIM AMAR BIN ABDUL RAHIM') === 'MFA'
);

// --------------------------------------------------------------------------
// 3. OFFICIAL_TEACHERS 名册校验
// --------------------------------------------------------------------------
console.log('\n[TEST 3] Verifying OFFICIAL_TEACHERS contains all 14 teachers including Muhammad Fahim Amar...');

assert('3A: OFFICIAL_TEACHERS has exactly 14 teachers', OFFICIAL_TEACHERS.length === 14);

const foundFahim = OFFICIAL_TEACHERS.find(t => t.name.includes('FAHIM') || t.email.includes('muhammadfahimamar'));
assert('3B: Muhammad Fahim Amar exists in OFFICIAL_TEACHERS with code MFA', foundFahim !== undefined && foundFahim.code === 'MFA');

const foundStephanie = OFFICIAL_TEACHERS.find(t => t.name.includes('STEPHANIE'));
assert('3C: Stephanie Wong exists in OFFICIAL_TEACHERS with code SW', foundStephanie !== undefined && foundStephanie.code === 'SW');

console.log(`\n================================================================`);
console.log(`Results: ${passed}/${total} assertions passed.`);
console.log(`================================================================`);

if (passed !== total) {
  process.exit(1);
}
