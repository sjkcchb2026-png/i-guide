import assert from 'node:assert';
import {
  getMaxDailyPeriodsForSubject,
  decomposeSubjectBlocks,
  canClassAcceptSubjectOnDay,
  runTimetableEngine,
  DAYS_OF_WEEK,
  ClassProfile,
  TeacherProfile,
  SubjectAssignment,
} from '../src/utils/timetableEngine';
import { generateAutoSchedule } from '../src/components/Timetable/autoScheduler';
import {
  buildDefaultCurriculumMatrix,
  getDefaultClassTeachers,
} from '../src/constants/defaultCurriculumMatrix';
import {
  deduplicateStaffRecords,
  groupAndDeduplicateStaffRecords,
  isPhantomStaffRecord,
} from '../src/utils/staffNormalizer';

console.log('--- TEST SUITE: DAILY PERIOD CAPS & STAFF DEDUPLICATION ---');

// 1. Unit tests for getMaxDailyPeriodsForSubject & decomposeSubjectBlocks
assert.strictEqual(getMaxDailyPeriodsForSubject(12, 'BC'), 3);
assert.strictEqual(getMaxDailyPeriodsForSubject(11, 'BC'), 3);
assert.strictEqual(getMaxDailyPeriodsForSubject(10, 'BM'), 2);
assert.strictEqual(getMaxDailyPeriodsForSubject(10, 'BI'), 2);
assert.strictEqual(getMaxDailyPeriodsForSubject(6, 'MT'), 2);
assert.strictEqual(getMaxDailyPeriodsForSubject(3, 'PJ'), 1);

assert.deepStrictEqual(decomposeSubjectBlocks('BC', 12), [3, 3, 2, 2, 2]);
assert.deepStrictEqual(decomposeSubjectBlocks('BC', 11), [3, 2, 2, 2, 2]);
assert.deepStrictEqual(decomposeSubjectBlocks('BM', 10), [2, 2, 2, 2, 2]);
assert.deepStrictEqual(decomposeSubjectBlocks('BI', 9), [2, 2, 2, 2, 1]);
assert.deepStrictEqual(decomposeSubjectBlocks('BI', 8), [2, 2, 2, 1, 1]);
assert.deepStrictEqual(decomposeSubjectBlocks('MT', 6), [2, 2, 2]);
assert.deepStrictEqual(decomposeSubjectBlocks('PJ', 3), [1, 1, 1]);
assert.deepStrictEqual(decomposeSubjectBlocks('PSV', 2), [2]);
console.log('✓ 1. getMaxDailyPeriodsForSubject & decomposeSubjectBlocks passed');

// 2. Unit tests for canClassAcceptSubjectOnDay
const threeBC = [{ subjectCode: 'BC' }, { subjectCode: 'BC' }, { subjectCode: 'BC' }];
assert.strictEqual(canClassAcceptSubjectOnDay(threeBC, 'BC', 12, 1), false, 'BC with 3 on day must reject adding 1 (no 4 periods/day)');
assert.strictEqual(canClassAcceptSubjectOnDay([{ subjectCode: 'BC' }, { subjectCode: 'BC' }], 'BC', 12, 1), true, '12-period BC with 2 on day may add 1 to become 3');
const twoBM = [{ subjectCode: 'BM' }, { subjectCode: 'BM' }];
assert.strictEqual(canClassAcceptSubjectOnDay(twoBM, 'BM', 10, 1), false, '<=10-period BM with 2 on day must reject adding 1');
assert.strictEqual(canClassAcceptSubjectOnDay([{ subjectCode: 'BI' }], 'BI', 8, 1), false, '<=10-period BI with 1 on day must reject adding another separate block on same day');
console.log('✓ 2. canClassAcceptSubjectOnDay rules passed');

// 3. Integration test: generateAutoSchedule across 2026 and 2027
for (const year of ['2026', '2027']) {
  const matrix = buildDefaultCurriculumMatrix(year);
  const classTeachers = getDefaultClassTeachers();
  const { grid, clashes, unplaced } = generateAutoSchedule(matrix, classTeachers, year);

  assert.strictEqual(clashes.length, 0, `Year ${year}: Expected 0 teacher clashes, got ${clashes.length}: ${clashes.map((c) => c.message).join('; ')}`);
  if (year === '2027') {
    assert.strictEqual(unplaced.length, 0, `Year ${year}: Expected 0 unplaced blocks, got: ${unplaced.join(', ')}`);
  } else {
    // Year 2026 KSSR Tahun 1 default matrix has 47 periods in a 45-slot Year 1 grid (max 2 overflow for T.1, 0 for T.2-T.6)
    const nonT1Unplaced = unplaced.filter((u) => !u.startsWith('T.1 '));
    assert.strictEqual(nonT1Unplaced.length, 0, `Year ${year}: Expected 0 T.2-T.6 unplaced blocks, got: ${nonT1Unplaced.join(', ')}`);
    assert.ok(unplaced.length <= 2, `Year ${year}: Expected at most 2 T.1 capacity-overflow periods, got: ${unplaced.join(', ')}`);
  }

  // Verify daily subject cap per grade per day
  const weeklyMap = new Map<string, number>();
  matrix.forEach((row) => {
    [1, 2, 3, 4, 5, 6].forEach((g) => {
      const p = Number(row.periods[g] || 0);
      if (p > 0) {
        weeklyMap.set(`${g}_${row.subjectCode.toUpperCase()}`, p);
      }
    });
  });

  [1, 2, 3, 4, 5, 6].forEach((g) => {
    DAYS_OF_WEEK.forEach((day) => {
      const dayCounts = new Map<string, number>();
      const dayMap = grid[g]?.[day] || {};
      Object.entries(dayMap).forEach(([slotId, cell]) => {
        if (!cell) return;
        if (slotId === 'PKAR' || slotId === 'MEMBACA' || slotId === 'TASMIK') return;
        const code = cell.subjectCode.toUpperCase();
        if (code === 'PN') return;
        dayCounts.set(code, (dayCounts.get(code) || 0) + 1);
      });

      dayCounts.forEach((count, code) => {
        const weekly =
          code === 'PM/PAI'
            ? Math.max(weeklyMap.get(`${g}_PM`) || 0, weeklyMap.get(`${g}_PAI`) || 0)
            : weeklyMap.get(`${g}_${code}`) || 2;
        const cap = getMaxDailyPeriodsForSubject(weekly, code);
        assert.ok(
          count <= cap,
          `Year ${year} T.${g} ${day} ${code} has ${count} periods (weekly=${weekly}, maxAllowed=${cap})`
        );
        assert.ok(count <= 3, `Year ${year} T.${g} ${day} ${code} exceeded absolute ceiling of 3 (${count})`);
      });
    });
  });
  console.log(`✓ 3. generateAutoSchedule (${year}) passed all daily caps, 0 clashes, 0 unplaced`);
}

// 4. Integration test: runTimetableEngine with BC=12, BM=10, BI=8, MT=6
{
  const classes: ClassProfile[] = [
    { classId: 'T1', className: 'Tahun 1', grade: 1 },
    { classId: 'T2', className: 'Tahun 2', grade: 2 },
  ];
  const teachers: TeacherProfile[] = [
    { teacherId: 'T_LCI', fullName: 'LAU CHUI ING' },
    { teacherId: 'T_JW', fullName: 'JENNY WONG' },
    { teacherId: 'T_LRR', fullName: 'LING ROU RONG' },
  ];
  const assignments: SubjectAssignment[] = [
    { assignmentId: 'a1', classId: 'T1', className: 'Tahun 1', canonicalSubjectCode: 'BC', subjectName: 'Bahasa Cina', teacherId: 'T_LCI', effectiveWeeklyPeriods: 12 },
    { assignmentId: 'a2', classId: 'T1', className: 'Tahun 1', canonicalSubjectCode: 'BM', subjectName: 'Bahasa Melayu', teacherId: 'T_JW', effectiveWeeklyPeriods: 10 },
    { assignmentId: 'a3', classId: 'T1', className: 'Tahun 1', canonicalSubjectCode: 'MT', subjectName: 'Matematik', teacherId: 'T_LRR', effectiveWeeklyPeriods: 6 },
    { assignmentId: 'a4', classId: 'T2', className: 'Tahun 2', canonicalSubjectCode: 'BC', subjectName: 'Bahasa Cina', teacherId: 'T_LCI', effectiveWeeklyPeriods: 11 },
  ];
  const res = runTimetableEngine({ classes, teachers, assignments, academicYear: '2027' });
  assert.strictEqual(res.unplacedCount, 0, `runTimetableEngine had ${res.unplacedCount} unplaced periods`);
  for (const asg of assignments) {
    for (const day of DAYS_OF_WEEK) {
      const count = res.lessons.filter(
        (l) => l.classId === asg.classId && l.day === day && l.subjectCode === asg.canonicalSubjectCode && l.countsAsClassPeriod
      ).length;
      const cap = getMaxDailyPeriodsForSubject(asg.effectiveWeeklyPeriods, asg.canonicalSubjectCode);
      assert.ok(count <= cap, `Engine ${asg.classId} ${day} ${asg.canonicalSubjectCode}: ${count} > cap ${cap}`);
    }
  }
  console.log('✓ 4. runTimetableEngine daily period cap enforcement passed');
}

// 5. Unit tests for Staff Deduplication & Merging (Email & IC/KP)
{
  const duplicateRecords: Record<string, any>[] = [
    {
      _docId: 'staff_800101135555',
      uid: 'staff_800101135555',
      name: 'JENNY WONG',
      email: 'g-12345678@moe-dl.edu.my',
      ic: '800101135555',
      position: 'Penolong Kanan Kokurikulum',
      subRole: 'PKKK',
      primaryRoleCode: 'PKKK',
      leadershipRole: 'PKKK',
      phone: '019-8881234',
      grade: 'DG44',
      staffFileNo: 'JPNS.800-1/12',
      personnelId: 'P001',
      category: 'GURU',
      role: 'GURU',
      active: true,
      isPreRegistered: true,
    },
    {
      _docId: 'authUidJenny9876543210abcd',
      uid: 'authUidJenny9876543210abcd',
      name: 'JENNY WONG',
      email: 'G-12345678@MOE-DL.EDU.MY',
      category: 'GURU',
      role: 'GURU',
      active: true,
      isPreRegistered: false,
      isVerified: true,
    },
    // Second teacher merged by IC (when Auth doc lacked IC or had different case, or third doc shares IC)
    {
      _docId: 'staff_900202136666',
      uid: 'staff_900202136666',
      name: 'VICTOR YII ZI SHENG',
      email: 'g-87654321@moe-dl.edu.my',
      ic: '900202-13-6666',
      position: 'Penolong Kanan Hal Ehwal Murid',
      subRole: 'PKHEM',
      category: 'GURU',
      role: 'GURU',
      isPreRegistered: true,
    },
    {
      _docId: 'authUidVictor11223344556677',
      uid: 'authUidVictor11223344556677',
      name: 'VICTOR YII ZI SHENG',
      email: 'g-87654321@moe-dl.edu.my',
      category: 'GURU',
      role: 'GURU',
      active: true,
      isPreRegistered: false,
    },
  ];

  const groups = groupAndDeduplicateStaffRecords(duplicateRecords);
  assert.strictEqual(groups.length, 2, `Expected 2 canonical staff records, got ${groups.length}`);

  const jennyGroup = groups.find((g) => g.merged.email === 'g-12345678@moe-dl.edu.my')!;
  assert.ok(jennyGroup);
  assert.strictEqual(jennyGroup.canonicalDocId, 'authUidJenny9876543210abcd');
  assert.deepStrictEqual(jennyGroup.duplicateDocIds, ['staff_800101135555']);
  assert.strictEqual(jennyGroup.merged.uid, 'authUidJenny9876543210abcd');
  assert.strictEqual(jennyGroup.merged.isVerified, true);
  assert.strictEqual(jennyGroup.merged.isPreRegistered, false);
  assert.strictEqual(jennyGroup.merged.position, 'Penolong Kanan Kokurikulum');
  assert.strictEqual(jennyGroup.merged.subRole, 'PKKK');
  assert.strictEqual(jennyGroup.merged.ic, '800101135555');
  assert.strictEqual(jennyGroup.merged.phone, '019-8881234');
  assert.strictEqual(jennyGroup.merged.grade, 'DG44');
  assert.strictEqual(jennyGroup.merged.staffFileNo, 'JPNS.800-1/12');

  const victorGroup = groups.find((g) => g.merged.email === 'g-87654321@moe-dl.edu.my')!;
  assert.ok(victorGroup);
  assert.strictEqual(victorGroup.canonicalDocId, 'authUidVictor11223344556677');
  assert.deepStrictEqual(victorGroup.duplicateDocIds, ['staff_900202136666']);
  assert.strictEqual(victorGroup.merged.position, 'Penolong Kanan Hal Ehwal Murid');
  assert.strictEqual(victorGroup.merged.subRole, 'PKHEM');
  assert.strictEqual(victorGroup.merged.ic, '900202136666');
  assert.strictEqual(victorGroup.merged.isVerified, true);

  // Also test IC-only transitive merge (e.g. email missing or changed on one doc, shared 12-digit IC)
  const icOnlyDup = deduplicateStaffRecords([
    { _docId: 'staff_770707137777', uid: 'staff_770707137777', name: 'GURU A', ic: '770707137777', position: 'Guru Data' },
    { _docId: 'authGuruA1234567890123456', uid: 'authGuruA1234567890123456', name: 'GURU A', ic: '770707-13-7777', email: 'gurua@moe-dl.edu.my', isPreRegistered: false },
  ]);
  assert.strictEqual(icOnlyDup.length, 1);
  assert.strictEqual(icOnlyDup[0].uid, 'authGuruA1234567890123456');
  assert.strictEqual(icOnlyDup[0].position, 'Guru Data');
  assert.strictEqual(icOnlyDup[0].email, 'gurua@moe-dl.edu.my');

  console.log('✓ 5. Staff deduplication & merging (email & IC/KP) passed');
}

// 6. Unit tests for Phantom / Ghost "STAF" Detection & Filtering
{
  const recordsWithPhantom: Record<string, any>[] = [
    {
      _docId: 'staff_ghost_1',
      uid: 'staff_ghost_1',
      name: '',
      email: '',
      category: 'GURU',
      role: 'GURU',
      active: false,
    },
    {
      _docId: 'staff_ghost_2',
      uid: 'staff_ghost_2',
      name: 'STAF',
      email: '',
      ic: '',
      category: 'GURU',
      role: 'GURU',
      active: false,
    },
    {
      _docId: 'authUidRealTeacher',
      uid: 'authUidRealTeacher',
      name: 'ROSNA BINTI IBRAHIM',
      email: 'rosnaibrahim318@gmail.com',
      category: 'AKP',
      role: 'AKP',
      active: true,
    },
  ];

  assert.strictEqual(isPhantomStaffRecord(recordsWithPhantom[0]), true, 'Nameless doc with no email/IC must be detected as phantom');
  assert.strictEqual(isPhantomStaffRecord(recordsWithPhantom[1]), true, 'STAF placeholder doc with no email/IC must be detected as phantom');
  assert.strictEqual(isPhantomStaffRecord(recordsWithPhantom[2]), false, 'Valid staff doc must NOT be marked phantom');

  const cleaned = deduplicateStaffRecords(recordsWithPhantom);
  assert.strictEqual(cleaned.length, 1, 'Phantom STAF rows must be filtered out');
  assert.strictEqual(cleaned[0].name, 'ROSNA BINTI IBRAHIM');

  console.log('✓ 6. Phantom / Ghost STAF detection & filtering passed');
}

console.log('=== ALL DAILY CAP & STAFF DEDUPLICATION TESTS PASSED ===');
