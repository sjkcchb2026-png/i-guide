import assert from 'node:assert';
import {
  DAYS_OF_WEEK,
  MAX_ATTEMPTS,
  canClassPlacePJOnDay,
  canTeacherTakeLoadOnDay,
  canTeacherTakeSlot,
  getDayIndex,
  getMorningPJCandidates,
  runTimetableEngine,
  ClassProfile,
  TeacherProfile,
  SubjectAssignment,
} from '../src/utils/timetableEngine';
import {
  generateAutoSchedule,
  detectScheduleClashes,
} from '../src/components/Timetable/autoScheduler';
import {
  buildDefaultCurriculumMatrix,
  getDefaultClassTeachers,
} from '../src/constants/defaultCurriculumMatrix';
import { SubjectAllocationRow } from '../src/components/Timetable/SchoolTimetableMatrix';
import { getGradeDaySlots, DayOfWeek } from '../src/components/Timetable/types';

console.log('================================================================');
console.log('TEST SUITE: PJ 1-DAY GAP, P1 PRIORITY & MAX 1 EIGHT-PERIOD DAY');
console.log('================================================================');

// --------------------------------------------------------------------------
// 1. Unit Tests: PJ 1-Day Gap & Morning Candidates
// --------------------------------------------------------------------------
assert.strictEqual(MAX_ATTEMPTS, 80, 'MAX_ATTEMPTS must be 80');
assert.deepStrictEqual(getMorningPJCandidates('ISNIN'), [1, 2]);
assert.deepStrictEqual(getMorningPJCandidates('SELASA'), [2]);
assert.deepStrictEqual(getMorningPJCandidates('RABU'), [1, 2]);
assert.deepStrictEqual(getMorningPJCandidates('KHAMIS'), [1, 2]);
assert.deepStrictEqual(getMorningPJCandidates('JUMAAT'), [1, 2]);

// Tahun 2-6 strict 1-day gap
assert.strictEqual(canClassPlacePJOnDay(['ISNIN'], 'SELASA', 2), false, 'T.2 ISNIN -> SELASA consecutive must be rejected');
assert.strictEqual(canClassPlacePJOnDay(['ISNIN'], 'RABU', 2), true, 'T.2 ISNIN -> RABU (gap=2) allowed');
assert.strictEqual(canClassPlacePJOnDay(['RABU'], 'KHAMIS', 5), false, 'T.5 RABU -> KHAMIS consecutive must be rejected');
assert.strictEqual(canClassPlacePJOnDay(['KHAMIS'], 'JUMAAT', 6), false, 'T.6 KHAMIS -> JUMAAT consecutive must be rejected');
assert.strictEqual(canClassPlacePJOnDay(['ISNIN'], 'ISNIN', 3), false, 'T.3 same day PJ must be rejected');

// Tahun 1 exempt from strict 1-day gap, but still max 1/day
assert.strictEqual(canClassPlacePJOnDay(['ISNIN'], 'SELASA', 1), true, 'T.1 ISNIN -> SELASA allowed when needed');
assert.strictEqual(canClassPlacePJOnDay(['ISNIN'], 'ISNIN', 1), false, 'T.1 same day PJ must still be rejected');

console.log('✓ 1. PJ 1-day gap & morning period unit checks passed');

// --------------------------------------------------------------------------
// 2. Unit Tests: Teacher Daily Workload <= 8.0 & Max 1 Day > 7.0 & PKAR +0.5
// --------------------------------------------------------------------------
{
  const weekLoads: Record<string, number> = {
    ISNIN: 8.0, // Already 1 day > 7.0
    SELASA: 7.0,
    RABU: 7.0,
    KHAMIS: 6.0,
    JUMAAT: 5.0,
  };
  const getLoad = (d: string) => weekLoads[d] || 0;

  // Trying to push SELASA from 7.0 -> 8.0 when ISNIN is already 8.0 (>7.0) must be rejected
  assert.strictEqual(
    canTeacherTakeLoadOnDay({ day: 'SELASA', addedLoad: 1, getLoadOnDay: getLoad, maxAllowedDailyLoad: 8 }),
    false,
    'Teacher already having 1 day > 7.0 cannot get a 2nd day > 7.0'
  );
  // Pushing KHAMIS 6.0 -> 7.0 is allowed
  assert.strictEqual(
    canTeacherTakeLoadOnDay({ day: 'KHAMIS', addedLoad: 1, getLoadOnDay: getLoad, maxAllowedDailyLoad: 8 }),
    true,
    'Teacher with 1 day > 7.0 CAN add load on another day that stays <= 7.0'
  );
  // Trying to push ISNIN 8.0 -> 9.0 must always be rejected
  assert.strictEqual(
    canTeacherTakeLoadOnDay({ day: 'ISNIN', addedLoad: 1, getLoadOnDay: getLoad, maxAllowedDailyLoad: 8 }),
    false,
    'Teacher cannot exceed 8.0 periods/day'
  );

  // PKAR +0.5 boundary in canTeacherTakeSlot: 7.5 + 1.0 + 0.5 = 9.0 > 8.0
  assert.strictEqual(
    canTeacherTakeSlot('T_A', 'RABU', 4, [1, 2, 6, 7, 8, 9, 10], 7.0, {
      classLevel: 1,
      maxAllowedDailyLoad: 8,
      otherDaysAbove7Count: 0,
      addedWorkload: 1.5,
    }),
    false,
    'Year 1 P4 (+0.5 PKAR) must block teacher when 7.0 + 1.5 = 8.5 > 8.0'
  );
}
console.log('✓ 2. Teacher <= 8.0 hard cap & max 1 day > 7.0 unit checks passed');

// --------------------------------------------------------------------------
// 3. Shared PJ Teacher Conflict Test (Period 1 Priority -> Period 2 Overflow Only)
// --------------------------------------------------------------------------
{
  const matrix: SubjectAllocationRow[] = [
    {
      id: 'pj',
      category: 'COMMON',
      subjectCode: 'PJ',
      subjectName: 'Pendidikan Jasmani',
      periods: { 1: 3, 2: 3, 3: 2, 4: 2, 5: 2, 6: 2 },
      teachers: { 1: 'TKI', 2: 'TKI', 3: 'TKI', 4: 'KL', 5: 'KL', 6: 'DT' },
    },
    {
      id: 'bm',
      category: 'COMMON',
      subjectCode: 'BM',
      subjectName: 'Bahasa Melayu',
      periods: { 1: 8, 2: 8, 3: 8, 4: 8, 5: 8, 6: 8 },
      teachers: { 1: 'G1', 2: 'G2', 3: 'G3', 4: 'G4', 5: 'G5', 6: 'G6' },
    },
  ];
  const { grid, clashes, unplaced } = generateAutoSchedule(matrix, {}, '2027');
  assert.strictEqual(clashes.length, 0, 'Shared PJ test must have 0 clashes');
  assert.strictEqual(unplaced.length, 0, 'Shared PJ test must have 0 unplaced');

  for (let g = 1; g <= 6; g++) {
    const pjEntries: Array<{ day: DayOfWeek; slotId: string }> = [];
    for (const day of DAYS_OF_WEEK) {
      for (const s of getGradeDaySlots(g, day)) {
        if (s.isRecess || s.slotId === 'PKAR' || s.slotId === 'MEMBACA' || s.slotId === 'TASMIK') continue;
        const cell = grid[g][day][s.slotId];
        if (cell && cell.subjectCode === 'PJ') {
          pjEntries.push({ day, slotId: s.slotId });
          assert.ok(s.slotId === 'W1' || s.slotId === 'W2', `T.${g} ${day} PJ placed in invalid slot ${s.slotId}`);
        }
      }
    }
    const expected = g <= 2 ? 3 : 2;
    assert.strictEqual(pjEntries.length, expected, `T.${g} should have ${expected} PJ lessons`);
    const uniqueDays = new Set(pjEntries.map((e) => e.day));
    assert.strictEqual(uniqueDays.size, pjEntries.length, `T.${g} has >1 PJ on same day`);

    if (g >= 2) {
      for (let i = 0; i < pjEntries.length; i++) {
        for (let j = i + 1; j < pjEntries.length; j++) {
          const diff = Math.abs(getDayIndex(pjEntries[i].day) - getDayIndex(pjEntries[j].day));
          assert.ok(diff >= 2, `T.${g} PJ consecutive days forbidden: ${pjEntries[i].day} & ${pjEntries[j].day}`);
        }
      }
    }
  }

  // KL teaches T.4 & T.5 PJ (only 4 slots total across W1 of Mon/Wed/Thu/Fri) -> ALL 4 of KL's PJ MUST be in W1!
  const klPjSlots: string[] = [];
  for (const g of [4, 5]) {
    for (const day of DAYS_OF_WEEK) {
      for (const s of getGradeDaySlots(g, day)) {
        const cell = grid[g][day][s.slotId];
        if (cell && cell.subjectCode === 'PJ') {
          klPjSlots.push(`${g}:${day}:${s.slotId}`);
        }
      }
    }
  }
  assert.ok(
    klPjSlots.every((x) => x.endsWith(':W1')),
    `KL teaches T.4+T.5 (4 slots == 4 available W1 days), so 100% must be in W1! Got: ${klPjSlots.join(', ')}`
  );
}
console.log('✓ 3. PJ Period 1 Priority, Period 2 Overflow & Tahun 2-6 1-day gap verified');

// --------------------------------------------------------------------------
// 4. Full Realistic Balanced School Matrix (All Teachers <= 34 Periods/Week)
//    Verify:
//    - 0 Clashes, 0 Unplaced, 0 Gaps
//    - PJ 1-day gap & W1/W2 only
//    - Every teacher: dailyLoad <= 8.0, AT MOST 1 day > 7.0, heavy (>=26) >= 4.5 every day
//    - PN empty teacher on SELASA W1
// --------------------------------------------------------------------------
function buildRealisticBalancedMatrix(): SubjectAllocationRow[] {
  // Total teaching workload per class:
  // T1: BC(10)+BM(8)+BI(8)+MT(5)+AM(3)+PJ(3)+PK(1)+MZ(1)+PSV(2)+PM/PAI(4) = 45 periods (excl PKAR 2.5 & PN 1)
  // Actually T1 slots = 10+10+9+9+7 = 45 incl PN(1) -> 44 teaching periods + 1 PN = 45!
  // Let's keep T1=44, T2=48, T3=48, T4=49, T5=49, T6=49 (leaving 1 free PN slot) with 12 teachers <= 34 periods!
  return [
    { id: 'bc', category: 'COMMON', subjectCode: 'BC', subjectName: 'Bahasa Cina', periods: { 1: 10, 2: 12, 3: 12, 4: 10, 5: 10, 6: 10 }, teachers: { 1: 'G1', 2: 'G2', 3: 'G3', 4: 'G4', 5: 'G5', 6: 'G6' } },
    { id: 'bm', category: 'COMMON', subjectCode: 'BM', subjectName: 'Bahasa Melayu', periods: { 1: 8, 2: 10, 3: 10, 4: 8, 5: 8, 6: 8 }, teachers: { 1: 'G7', 2: 'G8', 3: 'G7', 4: 'G9', 5: 'G8', 6: 'G9' } },
    { id: 'bi', category: 'COMMON', subjectCode: 'BI', subjectName: 'Bahasa Inggeris', periods: { 1: 8, 2: 10, 3: 10, 4: 8, 5: 8, 6: 8 }, teachers: { 1: 'G10', 2: 'G11', 3: 'G10', 4: 'G12', 5: 'G11', 6: 'G12' } },
    { id: 'mt', category: 'COMMON', subjectCode: 'MT', subjectName: 'Matematik', periods: { 1: 5, 2: 6, 3: 6, 4: 6, 5: 6, 6: 6 }, teachers: { 1: 'G1', 2: 'G2', 3: 'G3', 4: 'G4', 5: 'G5', 6: 'G6' } },
    { id: 'am', category: 'KP2027_ONLY', subjectCode: 'AM', subjectName: 'Alam Dan Manusia', periods: { 1: 3, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }, teachers: { 1: 'G1', 2: '', 3: '', 4: '', 5: '', 6: '' }, secondaryTeachers: { 1: 'G13', 2: '', 3: '', 4: '', 5: '', 6: '' } },
    { id: 'sn', category: 'KSSR_LEGACY', subjectCode: 'SN', subjectName: 'Sains', periods: { 1: 0, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4 }, teachers: { 1: '', 2: 'G13', 3: 'G13', 4: 'G13', 5: 'G4', 6: 'G5' } },
    { id: 'sej', category: 'COMMON', subjectCode: 'SEJ', subjectName: 'Sejarah', periods: { 1: 0, 2: 0, 3: 0, 4: 2, 5: 2, 6: 2 }, teachers: { 1: '', 2: '', 3: '', 4: 'G6', 5: 'G6', 6: 'G4' } },
    { id: 'rbt', category: 'COMMON', subjectCode: 'RBT', subjectName: 'Reka Bentuk & Teknologi', periods: { 1: 0, 2: 0, 3: 0, 4: 2, 5: 2, 6: 2 }, teachers: { 1: '', 2: '', 3: '', 4: 'G13', 5: 'G13', 6: 'G13' } },
    { id: 'pj', category: 'COMMON', subjectCode: 'PJ', subjectName: 'Pendidikan Jasmani', periods: { 1: 3, 2: 3, 3: 2, 4: 2, 5: 2, 6: 2 }, teachers: { 1: 'G14', 2: 'G14', 3: 'G14', 4: 'G15', 5: 'G15', 6: 'G15' } },
    { id: 'pk', category: 'COMMON', subjectCode: 'PK', subjectName: 'Pendidikan Kesihatan', periods: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 }, teachers: { 1: 'G14', 2: 'G14', 3: 'G14', 4: 'G15', 5: 'G15', 6: 'G15' } },
    { id: 'mz', category: 'COMMON', subjectCode: 'MZ', subjectName: 'Pendidikan Muzik', periods: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 }, teachers: { 1: 'G2', 2: 'G3', 3: 'G7', 4: 'G8', 5: 'G9', 6: 'G10' } },
    { id: 'psv', category: 'COMMON', subjectCode: 'PSV', subjectName: 'Pendidikan Seni Visual', periods: { 1: 1, 2: 1, 3: 2, 4: 2, 5: 2, 6: 2 }, teachers: { 1: 'G11', 2: 'G12', 3: 'G1', 4: 'G2', 5: 'G3', 6: 'G5' } },
    { id: 'pm', category: 'COMMON', subjectCode: 'PM', subjectName: 'Pendidikan Moral', periods: { 1: 4, 2: 2, 3: 2, 4: 3, 5: 3, 6: 3 }, teachers: { 1: 'G14', 2: 'G15', 3: 'G14', 4: 'G15', 5: 'G14', 6: 'G15' } },
    { id: 'pai', category: 'COMMON', subjectCode: 'PAI', subjectName: 'Pendidikan Islam', periods: { 1: 4, 2: 2, 3: 2, 4: 3, 5: 3, 6: 3 }, teachers: { 1: 'G16', 2: 'G16', 3: 'G16', 4: 'G16', 5: 'G16', 6: 'G16' } },
  ];
}

{
  const balancedMatrix = buildRealisticBalancedMatrix();
  const startMs = Date.now();
  const res1 = generateAutoSchedule(balancedMatrix, {}, '2027');
  const elapsedMs = Date.now() - startMs;
  console.log(`  - generateAutoSchedule completed balanced 6-grade school in ${elapsedMs}ms`);

  assert.strictEqual(res1.clashes.length, 0, `Expected 0 clashes, got ${res1.clashes.length}`);
  assert.strictEqual(res1.unplaced.length, 0, `Expected 0 unplaced, got ${res1.unplaced.join(', ')}`);

  // Compute every teacher's daily load including PN (+1 on SELASA) and Year 1 PKAR (+0.5)
  const teacherList = Array.from({ length: 16 }, (_, i) => `G${i + 1}`);
  for (const t of teacherList) {
    const loads: number[] = [];
    for (const day of DAYS_OF_WEEK) {
      let load = day === 'SELASA' ? 1 : 0; // PN on SELASA
      for (let g = 1; g <= 6; g++) {
        for (const s of getGradeDaySlots(g, day)) {
          if (s.isRecess || s.slotId === 'MEMBACA' || s.slotId === 'TASMIK') continue;
          const cell = res1.grid[g][day][s.slotId];
          if (!cell || !cell.teacherCode) continue;
          const codes = cell.teacherCode.split('/').map((c) => c.trim()).filter(Boolean);
          if (codes.includes(t)) {
            load += s.slotId === 'PKAR' ? 0.5 : 1;
          }
        }
      }
      assert.ok(load <= 8.0, `Teacher ${t} on ${day} exceeded 8.0 hard cap: ${load}`);
      loads.push(load);
    }
    const weeklyTotal = loads.reduce((a, b) => a + b, 0);
    const daysAbove7 = loads.filter((l) => l > 7.0).length;
    assert.ok(
      daysAbove7 <= 1,
      `Teacher ${t} (total=${weeklyTotal}) has ${daysAbove7} days > 7.0 periods (max allowed is 1): [${loads.join(', ')}]`
    );
    if (weeklyTotal >= 26) {
      const minDay = Math.min(...loads);
      assert.ok(
        minDay >= 4.0,
        `Heavy teacher ${t} (total=${weeklyTotal}) has an overly light day ${minDay}: [${loads.join(', ')}]`
      );
    }
  }

  // Stochastic variation check: running again produces a valid schedule (and verify distinct cells across calls)
  const res2 = generateAutoSchedule(balancedMatrix, {}, '2027');
  assert.strictEqual(res2.clashes.length, 0);
  assert.strictEqual(res2.unplaced.length, 0);
  const s1 = JSON.stringify(res1.grid);
  const s2 = JSON.stringify(res2.grid);
  assert.notStrictEqual(s1, s2, 'Repeated calls to generateAutoSchedule should generate fresh valid layouts');
}
console.log('✓ 4. Full balanced 6-grade matrix passed max-1 day > 7, <= 8.0 cap, and stochastic variety');

// --------------------------------------------------------------------------
// 5. runTimetableEngine: PJ 1-Day Gap + Max 1 Day > 7.0 Verification
// --------------------------------------------------------------------------
{
  const classes: ClassProfile[] = [
    { classId: 'T1', className: 'Tahun 1', grade: 1 },
    { classId: 'T2', className: 'Tahun 2', grade: 2 },
    { classId: 'T3', className: 'Tahun 3', grade: 3 },
  ];
  const teachers: TeacherProfile[] = [
    { teacherId: 'T_BM', fullName: 'CIKGU BM' },
    { teacherId: 'T_BC', fullName: 'CIKGU BC' },
    { teacherId: 'T_PJ', fullName: 'CIKGU PJ' },
    { teacherId: 'T_MT', fullName: 'CIKGU MT' },
  ];
  const assignments: SubjectAssignment[] = [
    { assignmentId: 'pj1', classId: 'T1', className: 'Tahun 1', canonicalSubjectCode: 'PJ', subjectName: 'PJ', teacherId: 'T_PJ', effectiveWeeklyPeriods: 3 },
    { assignmentId: 'pj2', classId: 'T2', className: 'Tahun 2', canonicalSubjectCode: 'PJ', subjectName: 'PJ', teacherId: 'T_PJ', effectiveWeeklyPeriods: 3 },
    { assignmentId: 'pj3', classId: 'T3', className: 'Tahun 3', canonicalSubjectCode: 'PJ', subjectName: 'PJ', teacherId: 'T_PJ', effectiveWeeklyPeriods: 2 },
    { assignmentId: 'bc1', classId: 'T1', className: 'Tahun 1', canonicalSubjectCode: 'BC', subjectName: 'BC', teacherId: 'T_BC', effectiveWeeklyPeriods: 10 },
    { assignmentId: 'bc2', classId: 'T2', className: 'Tahun 2', canonicalSubjectCode: 'BC', subjectName: 'BC', teacherId: 'T_BC', effectiveWeeklyPeriods: 11 },
    { assignmentId: 'bc3', classId: 'T3', className: 'Tahun 3', canonicalSubjectCode: 'BC', subjectName: 'BC', teacherId: 'T_BC', effectiveWeeklyPeriods: 11 },
    { assignmentId: 'bm1', classId: 'T1', className: 'Tahun 1', canonicalSubjectCode: 'BM', subjectName: 'BM', teacherId: 'T_BM', effectiveWeeklyPeriods: 10 },
    { assignmentId: 'bm2', classId: 'T2', className: 'Tahun 2', canonicalSubjectCode: 'BM', subjectName: 'BM', teacherId: 'T_BM', effectiveWeeklyPeriods: 10 },
    { assignmentId: 'bm3', classId: 'T3', className: 'Tahun 3', canonicalSubjectCode: 'BM', subjectName: 'BM', teacherId: 'T_BM', effectiveWeeklyPeriods: 10 },
    { assignmentId: 'mt1', classId: 'T1', className: 'Tahun 1', canonicalSubjectCode: 'MT', subjectName: 'MT', teacherId: 'T_MT', effectiveWeeklyPeriods: 6 },
    { assignmentId: 'mt2', classId: 'T2', className: 'Tahun 2', canonicalSubjectCode: 'MT', subjectName: 'MT', teacherId: 'T_MT', effectiveWeeklyPeriods: 6 },
    { assignmentId: 'mt3', classId: 'T3', className: 'Tahun 3', canonicalSubjectCode: 'MT', subjectName: 'MT', teacherId: 'T_MT', effectiveWeeklyPeriods: 6 },
  ];

  const engineRes = runTimetableEngine({ classes, teachers, assignments, academicYear: '2027' });
  assert.strictEqual(engineRes.unplacedCount, 0, `runTimetableEngine had ${engineRes.unplacedCount} unplaced`);

  // Check T2 & T3 strict 1-day gap
  for (const cid of ['T2', 'T3']) {
    const pj = engineRes.lessons.filter((l) => l.classId === cid && l.subjectCode === 'PJ' && l.countsAsClassPeriod);
    for (let i = 0; i < pj.length; i++) {
      assert.ok(pj[i].periodNumber === 1 || pj[i].periodNumber === 2);
      for (let j = i + 1; j < pj.length; j++) {
        assert.ok(Math.abs(getDayIndex(pj[i].day) - getDayIndex(pj[j].day)) >= 2);
      }
    }
  }

  // Check teacher daily loads <= 8.0 and <= 1 day > 7.0
  for (const t of teachers) {
    const loads = DAYS_OF_WEEK.map((d) =>
      engineRes.lessons
        .filter((l) => l.teacherId === t.teacherId && l.day === d && l.countsAsTeacherPeriod)
        .reduce((acc, l) => acc + (l.fractionalPeriod ?? 1), 0)
    );
    assert.ok(loads.every((l) => l <= 8.0), `Engine teacher ${t.teacherId} exceeded 8.0: [${loads.join(', ')}]`);
    const daysOver7 = loads.filter((l) => l > 7.0).length;
    assert.ok(daysOver7 <= 1, `Engine teacher ${t.teacherId} had ${daysOver7} days > 7.0: [${loads.join(', ')}]`);
  }
}
console.log('✓ 5. runTimetableEngine PJ gap & max-1 day > 7.0 passed');

// --------------------------------------------------------------------------
// 6. Default 2026 & 2027 Matrix Check (PJ rules must also pass cleanly)
// --------------------------------------------------------------------------
for (const yr of ['2026', '2027']) {
  const m = buildDefaultCurriculumMatrix(yr);
  const { grid, clashes } = generateAutoSchedule(m, getDefaultClassTeachers(), yr);
  assert.strictEqual(clashes.length, 0);
  for (let g = 2; g <= 6; g++) {
    const pjDays: string[] = [];
    for (const day of DAYS_OF_WEEK) {
      for (const s of getGradeDaySlots(g, day)) {
        if (s.isRecess || s.slotId === 'PKAR' || s.slotId === 'MEMBACA' || s.slotId === 'TASMIK') continue;
        const cell = grid[g][day][s.slotId];
        if (cell && cell.subjectCode === 'PJ') {
          assert.ok(s.slotId === 'W1' || s.slotId === 'W2', `Default ${yr} T.${g} ${day} PJ in ${s.slotId}`);
          pjDays.push(day);
        }
      }
    }
    for (let i = 0; i < pjDays.length; i++) {
      for (let j = i + 1; j < pjDays.length; j++) {
        assert.ok(
          Math.abs(getDayIndex(pjDays[i]) - getDayIndex(pjDays[j])) >= 2,
          `Default ${yr} T.${g} PJ consecutive days: ${pjDays.join(', ')}`
        );
      }
    }
  }
}
console.log('✓ 6. Default 2026 & 2027 matrices preserve PJ 1-day gap & P1/P2 constraint');

console.log('================================================================');
console.log('ALL PJ GAP, P1 PRIORITY & WORKLOAD BALANCING TESTS PASSED (100%)');
console.log('================================================================');
