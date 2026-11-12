/**
 * iSEPADU AI — Academic & School Data Structures
 * Supports Co-Teaching / Team-Teaching (Guru Utama & Guru Bersama)
 */

export interface SchoolAcademicAssignment {
  assignmentId: string;
  classId: string;
  className: string;
  subjectCode: string; // 'AM'
  subjectName: string;
  teacherId: string;   // Guru 1 (Guru Utama)
  secondaryTeacherId?: string; // Guru 2 (Guru Bersama / Co-Teacher)
  weeklyPeriods: number; // 3
  isTeamTeaching?: boolean; // 标记为协同教学
}
