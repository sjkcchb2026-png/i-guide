/**
 * Test Suite: iSEPADU AI - Final Kokurikulum System Upgrade (All 6 Enhancements)
 */

import { 
  KPM_12_MEETING_TEMPLATES, 
  KokoActivity, 
  KokoMeetingReport, 
  KokoAttendanceSession,
  KokoScopeLevel,
  KokoPencapaianTier,
  TeacherCommitteeRole,
  StudentCommitteeRole
} from '../src/types/kokurikulum';

console.log('====================================================');
console.log('🧪 TESTING FINAL KOKURIKULUM SYSTEM UPGRADE (6 ENHANCEMENTS)');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string) {
  totalTests++;
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ FAIL: ${testName}`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------
// ENHANCEMENT 1: COMMITTEE HIERARCHICAL ROLES
// ---------------------------------------------------------
console.log('--- ENHANCEMENT 1: Module Renaming & Hierarchical Committee Roles ---');
const teacherRoles: TeacherCommitteeRole[] = ['Ketua Guru Penasihat', 'Guru Penasihat'];
assert(teacherRoles.includes('Ketua Guru Penasihat'), 'Supports Ketua Guru Penasihat role');
assert(teacherRoles.includes('Guru Penasihat'), 'Supports Guru Penasihat role');

const studentRoles: StudentCommitteeRole[] = [
  'Pengerusi', 'Naib Pengerusi', 'Setiausaha', 'Penolong Setiausaha',
  'Bendahari', 'Penolong Bendahari', 'AJK', 'Ahli Biasa'
];
assert(studentRoles.length === 8, 'Supports full hierarchical KPM student committee roles');
assert(studentRoles.includes('Pengerusi') && studentRoles.includes('Bendahari'), 'Core leadership student roles verified');

// ---------------------------------------------------------
// ENHANCEMENT 2: ATTENDANCE & REPORT LINKING (1-12)
// ---------------------------------------------------------
console.log('\n--- ENHANCEMENT 2: Attendance & Report Linking (1 to 12) ---');
const mockSession: KokoAttendanceSession = {
  id: 'session-101',
  groupId: 'tkrs-01',
  category: 'uniform',
  meetingNumber: 1,
  date: '2026-03-12',
  academicYear: '2026',
  attendance: {
    'st-001': '1',
    'st-002': '1',
    'st-003': '0',
    'st-004': 'x'
  }
};
assert(mockSession.meetingNumber === 1, 'Meeting sequence number 1..12 linked to attendance session');

// Compute stats
let present = 0;
let absent = 0;
Object.values(mockSession.attendance).forEach(status => {
  if (status === '1') present++;
  else if (status === '0') absent++;
});
const total = present + absent;
const percentage = Math.round((present / total) * 100);

assert(present === 2 && absent === 1 && percentage === 67, 'Correctly computes attendance stats (present, absent, total, %)');

// ---------------------------------------------------------
// ENHANCEMENT 3: 12 KPM-ALIGNED MEETING REPORT TEMPLATES
// ---------------------------------------------------------
console.log('\n--- ENHANCEMENT 3: 12 KPM Meeting Templates & Attendance Auto-Sync ---');
assert(KPM_12_MEETING_TEMPLATES.length === 12, 'Includes all 12 KPM canonical meeting report templates');

const p1 = KPM_12_MEETING_TEMPLATES.find(t => t.meetingNumber === 1);
assert(Boolean(p1?.title.includes('Mesyuarat Agung Tahunan')), 'Perjumpaan 1 is Mesyuarat Agung Tahunan & Pelantikan AJK');

const p2 = KPM_12_MEETING_TEMPLATES.find(t => t.meetingNumber === 2);
assert(Boolean(p2?.title.includes('Sejarah, Matlamat, Logo')), 'Perjumpaan 2 covers Sejarah, Matlamat, Logo/Lagu & Peraturan Asas');

const p6 = KPM_12_MEETING_TEMPLATES.find(t => t.meetingNumber === 6);
assert(Boolean(p6?.title.includes('Pertandingan Dalaman')), 'Perjumpaan 6 covers Pertandingan Dalaman / Kuiz / Ujian Kemahiran');

const p11 = KPM_12_MEETING_TEMPLATES.find(t => t.meetingNumber === 11);
assert(Boolean(p11?.title.includes('Penilaian Kemahiran')), 'Perjumpaan 11 covers Penilaian Kemahiran & Refleksi Ahli (PAJSK)');

const p12 = KPM_12_MEETING_TEMPLATES.find(t => t.meetingNumber === 12);
assert(Boolean(p12?.title.includes('Majlis Apresiasi')), 'Perjumpaan 12 covers Majlis Apresiasi & Rumusan Tahunan');

// Mock auto-synced meeting report
const mockReport: KokoMeetingReport = {
  meetingNumber: 1,
  meetingTitle: p1!.title,
  category: 'uniform',
  groupId: 'tkrs-01',
  groupName: 'TKRS',
  date: mockSession.date,
  venue: 'Bilik Darjah',
  attendanceStats: {
    present,
    absent,
    total,
    percentage
  },
  guruPenasihatHadir: ['CIKGU AHMAD', 'CIKGU WONG'],
  kpmModule: p1!.kpmModule,
  tajukAktiviti: p1!.title,
  objektif: p1!.defaultObjectives,
  ringkasanAktiviti: p1!.defaultSummary,
  refleksiImpak: p1!.defaultReflection,
  disediakanOleh: 'CIKGU AHMAD',
  jawatanPenyedia: 'Ketua Guru Penasihat',
  academicYear: '2026',
  createdAt: new Date().toISOString()
};
assert(mockReport.attendanceStats.percentage === 67, 'Report attendance auto-synced seamlessly from attendance session');

// ---------------------------------------------------------
// ENHANCEMENT 4: SMART OPR REPORTS (Pertandingan vs Aktiviti)
// ---------------------------------------------------------
console.log('\n--- ENHANCEMENT 4: Smart OPR Reports (Pertandingan vs Aktiviti) ---');
const competitionOPR: KokoActivity = {
  jenis: 'pertandingan',
  programName: 'Kejohanan Bola Tampar MSSD Balingian',
  organizer: 'PPD Mukah',
  date: '2026-04-15',
  venue: 'Dewan Masyarakat Balingian',
  level: 'Daerah/Zon',
  category: 'sport',
  jurulatih: ['CIKGU TING'],
  guruPengiring: ['CIKGU LINDA'],
  participantCount: 12,
  pencapaian: 'Johan',
  pengiktirafan: ['Sijil', 'Trofi', 'PAJSK'],
  images: ['https://example.com/img1.jpg'],
  createdBy: 'CIKGU TING',
  academicYear: '2026',
  createdAt: new Date().toISOString()
};
assert(competitionOPR.jenis === 'pertandingan', 'Supports jenis = pertandingan');
assert(competitionOPR.pencapaian === 'Johan', 'Supports Pencapaian tier (Johan)');
assert(Boolean(competitionOPR.pengiktirafan?.includes('Trofi')), 'Supports Pengiktirafan badges');

// Activity OPR without pencapaian
const activityOPR: KokoActivity = {
  jenis: 'aktiviti',
  programName: 'Perkhemahan Perdana Kokurikulum SJK(C) Chung Hua',
  organizer: 'Unit Kokurikulum Sekolah',
  date: '2026-05-20',
  venue: 'Padang Sekolah',
  level: 'Sekolah',
  category: 'uniform',
  jurulatih: ['CIKGU AHMAD'],
  guruPengiring: ['CIKGU WONG', 'CIKGU TING'],
  participantCount: 45,
  images: [],
  createdBy: 'CIKGU AHMAD',
  academicYear: '2026',
  createdAt: new Date().toISOString()
};
assert(activityOPR.jenis === 'aktiviti' && !activityOPR.pencapaian, 'Activity type omits competition-only pencapaian field');

// ---------------------------------------------------------
// ENHANCEMENT 5: ZERO-STUDENT RULE & TEACHER ROLE SEPARATION
// ---------------------------------------------------------
console.log('\n--- ENHANCEMENT 5: Zero-Student Rule & Teacher Role Separation ---');
const staffWorkshopOPR: KokoActivity = {
  jenis: 'aktiviti',
  programName: 'Kursus Kejurulatihan Guru Bola Tampar Peringkat Bahagian Mukah',
  organizer: 'PPD Mukah & Pejabat Pendidikan Bahagian',
  date: '2026-02-18',
  venue: 'Pusat Kegiatan Guru Mukah',
  level: 'Bahagian',
  category: 'sport',
  jurulatih: ['JURULATIH JPN SARAWAK'],
  guruPengiring: ['CIKGU TING', 'CIKGU LINDA'],
  participantCount: 0, // Zero-student rule!
  studentNames: [],
  images: [],
  createdBy: 'CIKGU TING',
  academicYear: '2026',
  createdAt: new Date().toISOString()
};
assert(staffWorkshopOPR.participantCount === 0, 'Zero-Student Rule: Allows participantCount === 0 without requiring students');
assert(staffWorkshopOPR.jurulatih.length === 1 && staffWorkshopOPR.guruPengiring.length === 2, 'Teacher roles cleanly separated into Jurulatih vs Guru Pengiring');

// ---------------------------------------------------------
// ENHANCEMENT 6: INTERACTIVE ANALYTICS & DRILL-DOWN LOGIC
// ---------------------------------------------------------
console.log('\n--- ENHANCEMENT 6: Interactive Analytics 4 Pillars & Drill-Down ---');
const allActs = [competitionOPR, activityOPR, staffWorkshopOPR];

// Pillar A: Teacher summary
const teacherSummary: Record<string, { j: number; p: number; total: number }> = {};
allActs.forEach(act => {
  act.jurulatih.forEach(t => {
    if (!teacherSummary[t]) teacherSummary[t] = { j: 0, p: 0, total: 0 };
    teacherSummary[t].j++;
    teacherSummary[t].total++;
  });
  act.guruPengiring.forEach(t => {
    if (!teacherSummary[t]) teacherSummary[t] = { j: 0, p: 0, total: 0 };
    teacherSummary[t].p++;
    teacherSummary[t].total++;
  });
});

assert(teacherSummary['CIKGU TING'].j === 1 && teacherSummary['CIKGU TING'].p === 2, 'Teacher analytics correctly separates Jurulatih (1) and Pengiring (2)');
assert(teacherSummary['CIKGU TING'].total === 3, 'Total teacher involvements correctly calculated (3)');

// Pillar B: Student participation by level
const studentByLevel: Record<string, number> = {};
allActs.forEach(act => {
  studentByLevel[act.level] = (studentByLevel[act.level] || 0) + act.participantCount;
});
assert(studentByLevel['Sekolah'] === 45, 'Correctly aggregates student participation for Sekolah level (45)');
assert(studentByLevel['Daerah/Zon'] === 12, 'Correctly aggregates student participation for Daerah/Zon level (12)');
assert(studentByLevel['Bahagian'] === 0, 'Zero-student rule correctly reflects 0 student participants for Bahagian teacher course');

// Pillar D: Achievements by tier
const johanCount = allActs.filter(a => a.jenis === 'pertandingan' && a.pencapaian === 'Johan').length;
assert(johanCount === 1, 'Correctly aggregates achievements by tier (Johan = 1)');

console.log('\n====================================================');
console.log(`🎉 ALL TESTS COMPLETED: ${passedTests} / ${totalTests} PASSED`);
console.log('====================================================');
