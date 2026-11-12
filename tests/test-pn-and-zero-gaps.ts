import { buildDefaultCurriculumMatrix, getDefaultClassTeachers } from '../src/constants/defaultCurriculumMatrix';
import { generateAutoSchedule, detectScheduleClashes } from '../src/components/Timetable/autoScheduler';
import { getGradeDaySlots, DAYS_OF_WEEK } from '../src/components/Timetable/types';

function runPNAndZeroGapsTest() {
  console.log('🧪 Starting Verification: PN No-Teacher & Zero Middle Gaps...');

  const matrix = buildDefaultCurriculumMatrix('2027');
  const teachers = getDefaultClassTeachers();
  const { grid, clashes, unplaced } = generateAutoSchedule(matrix, teachers, '2027');

  let failed = false;

  // 1. Verify PN has NO teacher name or code assigned (locked on SELASA W1)
  console.log('--- Test 1: PN Teacher Check ---');
  for (let g = 1; g <= 6; g++) {
    const pnCell = grid[g]['SELASA']['W1'];
    if (!pnCell || pnCell.subjectCode !== 'PN') {
      console.error(`❌ Grade ${g} SELASA W1 is not PN:`, pnCell);
      failed = true;
    } else if (pnCell.teacherCode && pnCell.teacherCode.trim() !== '') {
      console.error(`❌ Grade ${g} PN has teacherCode: "${pnCell.teacherCode}" (Expected empty!)`);
      failed = true;
    } else {
      console.log(`✅ Grade ${g} PN on SELASA W1: subjectCode="PN", teacherCode="" (No teacher)`);
    }
  }

  // 2. Verify Zero Middle Gaps across all grades and days
  console.log('\n--- Test 2: Zero Middle Gaps Check ---');
  let gapCount = 0;
  for (let g = 1; g <= 6; g++) {
    for (const day of DAYS_OF_WEEK) {
      const slots = getGradeDaySlots(g, day);
      const mSlots = slots.filter((s) => !s.isRecess && s.endMinutes <= 600 && s.slotId !== 'PKAR' && s.slotId !== 'MEMBACA');
      const aSlots = slots.filter((s) => !s.isRecess && s.startMinutes >= 615 && s.slotId !== 'PKAR' && s.slotId !== 'TASMIK');
      const anyAfternoon = aSlots.some((s) => grid[g][day][s.slotId] !== null);

      // Morning check: no empty slot before an occupied slot, and no empty morning slot if afternoon has lessons
      for (let i = 0; i < mSlots.length; i++) {
        const slot = mSlots[i];
        if (grid[g][day][slot.slotId] === null) {
          const hasLaterMorning = mSlots.slice(i + 1).some((s) => grid[g][day][s.slotId] !== null);
          if (hasLaterMorning) {
            console.error(`❌ Gap detected: Grade ${g} ${day} Morning empty at ${slot.slotId} but later morning occupied!`);
            gapCount++;
            failed = true;
          } else if (anyAfternoon) {
            console.error(`❌ Gap detected: Grade ${g} ${day} Morning empty at ${slot.slotId} right before recess, but afternoon has lessons!`);
            gapCount++;
            failed = true;
          }
        }
      }

      // Afternoon check: no empty slot before an occupied slot
      for (let i = 0; i < aSlots.length; i++) {
        const slot = aSlots[i];
        if (grid[g][day][slot.slotId] === null) {
          const hasLaterAfternoon = aSlots.slice(i + 1).some((s) => grid[g][day][s.slotId] !== null);
          if (hasLaterAfternoon) {
            console.error(`❌ Gap detected: Grade ${g} ${day} Afternoon empty at ${slot.slotId} but later afternoon occupied!`);
            gapCount++;
            failed = true;
          }
        }
      }
    }
  }

  if (gapCount === 0) {
    console.log('✅ 100% PASS: Exactly 0 middle gaps across all grades (1 to 6) and all days (ISNIN to JUMAAT)!');
  } else {
    console.error(`❌ Found ${gapCount} gaps!`);
  }

  // 3. Verify Zero Clashes
  console.log('\n--- Test 3: Zero Teacher Clashes Check ---');
  const detectedClashes = detectScheduleClashes(grid);
  if (detectedClashes.length === 0) {
    console.log('✅ 100% PASS: Exactly 0 teacher minute-overlap clashes!');
  } else {
    console.error(`❌ Found ${detectedClashes.length} clashes:`, detectedClashes);
    failed = true;
  }

  // 4. Verify Unplaced blocks
  console.log('\n--- Test 4: Unplaced Blocks Check ---');
  if (unplaced.length === 0) {
    console.log('✅ 100% PASS: Exactly 0 unplaced blocks!');
  } else {
    console.error(`❌ Found ${unplaced.length} unplaced blocks:`, unplaced);
    failed = true;
  }

  if (!failed) {
    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! Both user requirements fully satisfied.');
  } else {
    process.exit(1);
  }
}

runPNAndZeroGapsTest();
