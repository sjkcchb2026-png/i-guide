import { generateAutoSchedule } from '../src/components/Timetable/autoScheduler';
import { buildDefaultCurriculumMatrix } from '../src/constants/defaultCurriculumMatrix';
import { OFFICIAL_TEACHERS } from '../src/constants/officialRoster';
import {
  generateAutoReliefPlan,
  buildFullDayWhatsAppReliefText,
} from '../src/utils/autoReliefEngine';
import { createDefaultPrasekolahTimetable } from '../src/utils/prasekolahTimetable';

const matrix = buildDefaultCurriculumMatrix('2027', { includeLegacyTeachers: true });
const { grid } = generateAutoSchedule(matrix, '2027');

const teacherMapping = {
  list: OFFICIAL_TEACHERS.map((t, idx) => ({
    id: t.id,
    num: idx + 1,
    code: t.code,
    name: t.name,
  })),
};

// 1. Test Mainstream Same-Class Lesson Swap (TUKAR_WAKTU_KELAS_SAMA) & Tarikh Pulang Balik
const planMainstream = generateAutoReliefPlan({
  schedule: grid,
  academicYear: '2027',
  dateStr: '2027-03-08', // Monday (ISNIN)
  absentTeacherCodes: ['NCY'], // Tahun 4 homeroom / mainstream teacher
  teacherMapping,
});

if (planMainstream.slots.length === 0) {
  throw new Error('Expected NCY to have lessons on ISNIN');
}

const swapSlots = planMainstream.slots.filter(
  (s) => s.reliefMode === 'TUKAR_WAKTU_KELAS_SAMA'
);

console.log(
  `[TEST 1] NCY absent on 2027-03-08 (ISNIN): Total slots=${planMainstream.slots.length}, Same-Class Swap=${swapSlots.length}, Standard One-Way=${planMainstream.summary.standardOneWayCount}`
);

if (swapSlots.length === 0) {
  throw new Error('Expected at least one Same-Class Lesson Swap (TUKAR_WAKTU_KELAS_SAMA) for NCY');
}

for (const s of swapSlots) {
  if (!s.requiresRepayment || !s.repaymentDate || !s.repaymentSlotId) {
    throw new Error(`Swap slot ${s.slotKey} missing repaymentDate or repaymentSlotId`);
  }
  if (s.repaymentDate <= '2027-03-08') {
    throw new Error(`Expected repaymentDate (${s.repaymentDate}) > absentDate (2027-03-08)`);
  }
  console.log(
    `  -> [${s.slotKey}] ${s.classLabel} ${s.slotLabel} (${s.timeLabel}): ${s.assignedSubstituteCode} masuk ajar ${s.substituteTeachingSubjectCode} | Pulang Balik: ${s.repaymentDate} (${s.repaymentDay}) ${s.repaymentSlotLabel} (${s.repaymentTimeLabel}) -> NCY ajar ${s.repaymentSubjectCode}`
  );
}

// 2. Test Custom Tarikh Pulang Balik Override (Date Picker Override)
const firstSwapSlot = swapSlots[0];
const customPaybackDate = '2027-03-18'; // Thursday (KHAMIS)
const planWithCustomDate = generateAutoReliefPlan({
  schedule: grid,
  academicYear: '2027',
  dateStr: '2027-03-08',
  absentTeacherCodes: ['NCY'],
  teacherMapping,
  repaymentDateOverrides: {
    [firstSwapSlot.slotKey]: customPaybackDate,
  },
});

const updatedFirstSwap = planWithCustomDate.slots.find(
  (s) => s.slotKey === firstSwapSlot.slotKey
);
if (!updatedFirstSwap || updatedFirstSwap.repaymentDate !== customPaybackDate) {
  throw new Error(
    `Expected custom Tarikh Pulang Balik override (${customPaybackDate}) to be applied, got ${updatedFirstSwap?.repaymentDate}`
  );
}
console.log(
  `[TEST 2] Custom Tarikh Pulang Balik date picker override verified: ${updatedFirstSwap.slotKey} -> ${updatedFirstSwap.repaymentDate} (${updatedFirstSwap.repaymentDay})`
);

// 3. Test Isolated Prasekolah Timetable Auto-Relief (One-Way Relief, No Payback)
const prasekolahDoc = createDefaultPrasekolahTimetable({
  id: 'YCC3404__prasekolah_2027',
  schoolCode: 'YCC3404',
  academicYear: '2027',
  guruPrasekolahCode: 'SW',
  guruPrasekolahName: 'STEPHANIE WONG ENG HEE',
  ppmName: 'PPM Prasekolah',
});

const planPrasekolah = generateAutoReliefPlan({
  schedule: grid,
  academicYear: '2027',
  dateStr: '2027-03-10', // Wednesday (RABU)
  absentTeacherCodes: ['SW'], // Guru Prasekolah absent
  teacherMapping,
  prasekolahTimetable: prasekolahDoc,
});

const praReliefSlots = planPrasekolah.slots.filter((s) => s.isPrasekolah);
if (praReliefSlots.length === 0) {
  throw new Error('Expected Prasekolah relief slots when Guru Prasekolah (SW) is absent');
}

for (const ps of praReliefSlots) {
  if (ps.reliefMode !== 'GANTI_PRASEKOLAH') {
    throw new Error(`Expected reliefMode === 'GANTI_PRASEKOLAH', got ${ps.reliefMode}`);
  }
  if (ps.requiresRepayment || ps.repaymentDate) {
    throw new Error(`Prasekolah slot ${ps.slotKey} must NOT require repayment or have repaymentDate`);
  }
  if (ps.reliefModeLabel !== 'Ganti Prasekolah (Tidak Perlu Pulang Balik)') {
    throw new Error(`Unexpected label: ${ps.reliefModeLabel}`);
  }
  if (!ps.assignedSubstituteCode) {
    throw new Error(`Expected Prasekolah slot ${ps.slotKey} (${ps.timeLabel}) to have an assigned substitute`);
  }
}

console.log(
  `[TEST 3] Prasekolah One-Way Relief verified: ${praReliefSlots.length} blocks assigned with 'Ganti Prasekolah (Tidak Perlu Pulang Balik)' and zero repayment dates.`
);

// 4. Test WhatsApp Full-Day Notification Formatter
const waMessage = buildFullDayWhatsAppReliefText(planMainstream, 'SJK (C) CHUNG HUA BALINGIAN');
if (!waMessage.includes('TUKAR WAKTU KELAS SAMA') || !waMessage.includes('Tarikh Pulang Balik')) {
  throw new Error('Expected WhatsApp message to include Tukar Waktu Kelas Sama & Tarikh Pulang Balik');
}
console.log('[TEST 4] WhatsApp broadcast text formatting verified.');
console.log('ALL TESTS PASSED!');
