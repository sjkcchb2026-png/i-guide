export type SetiausahaDocKind = 'OPR' | 'MEMO' | 'MINIT' | 'SURAT_LANTIKAN';

export interface InvitedCommitteeTeacher {
  teacherId: string;
  teacherName: string;
  committeeRole: string;
}

export type MinitAttendanceStatus = 'HADIR' | 'TIDAK_HADIR_BERSEBAB' | 'TIDAK_HADIR';

export interface MinitAttendanceRecord {
  teacherId: string;
  teacherName: string;
  committeeRole: string;
  status: MinitAttendanceStatus;
  reason?: string;
}

export interface TurutHadirRecord {
  id: string;
  name: string;
  role: string;
}

export interface AISetiausahaDocument {
  id: string;
  docKind: SetiausahaDocKind;
  sourceModule?: string;
  sourceActivityId?: string;
  sourceMemoId?: string;
  schoolCode: string;
  academicYear?: string;
  pillar?: string;
  kodMySG?: string;
  jawatankuasaInduk?: string;
  jawatanRasmi?: string;
  skpmBucket?: string;
  secondarySkpmBucket?: string;
  additionalSkpmBuckets?: string[];
  skpmAspek271Linked?: boolean;
  skpmCodeBadge?: string;
  skpmStandard?: string;
  skpmAspek?: string;
  skpmStandardKualiti?: string;
  programTitle: string;
  tarikh: string;
  masa?: string;
  tempat?: string;
  pengerusi?: string;
  sasaran?: string;
  peringkat?: string;
  pencapaian?: string;
  rawNotes?: string;
  agendaList?: string[];
  invitedTeachers?: InvitedCommitteeTeacher[];
  attendanceList?: MinitAttendanceRecord[];
  turutHadirList?: TurutHadirRecord[];
  objektif?: string[];
  pengisianAktiviti?: string[];
  impak?: string[];
  refleksiDanTindakanSusulan?: string[];
  photos?: string[];
  preparedByName?: string;
  preparedByTitle?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}
