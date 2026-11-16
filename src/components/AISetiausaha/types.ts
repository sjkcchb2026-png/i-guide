import { MySGPillar } from '../../utils/mysgJawatankuasaCatalog';
import { SKPMRadarBucket } from '../../utils/skpmCatalog';

export type SetiausahaModuleTab = 'OPR' | 'MEMO' | 'MINIT' | 'LANTIKAN';

export interface OPRPosterDocument {
  id: string;
  docKind: 'OPR';
  schoolCode: string;
  academicYear: string;
  pillar: MySGPillar;
  kodMySG: string;
  jawatankuasaInduk: string;
  jawatanRasmi: string;
  skpmBucket: SKPMRadarBucket;
  skpmStandard: string;
  skpmAspek: string;
  skpmStandardKualiti: string;
  programTitle: string;
  tarikh: string;
  masa: string;
  tempat: string;
  sasaran: string;
  rawNotes: string;
  objektif: string[];
  pengisianAktiviti: string[];
  impak: string[];
  refleksiDanTindakanSusulan: string[];
  photos: string[]; // Up to 3 circular photos (base64 compressed)
  preparedByName: string;
  preparedByTitle: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoMesyuaratDocument {
  id: string;
  docKind: 'MEMO';
  schoolCode: string;
  academicYear: string;
  pillar: MySGPillar;
  kodMySG: string;
  jawatankuasaInduk: string;
  jawatanRasmi: string;
  tajukMesyuarat: string;
  bilangan: string;
  rujukanKami: string;
  tarikhSurat: string;
  tarikhMesyuarat: string;
  hariMesyuarat: string;
  masaMesyuarat: string;
  tempatMesyuarat: string;
  pengerusiName: string;
  pengerusiTitle: string;
  recipientMode: 'SEMUA_GURU' | 'AHLI_TERPILIH';
  recipientIds: string[];
  recipientNames: string[];
  agendaPerutusan: string;
  agendaPengesahanMinit: string;
  agendaPerkaraBerbangkit: string;
  agendaFokusUtama: string[];
  agendaHalLain: string;
  agendaPenutup: string;
  principalName: string;
  principalTitle: string;
  maklumanSyncedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MinitAgendaEntry {
  id: string;
  paraNo: string;
  agendaTitle: string;
  rawNotes: string;
  formalText: string;
  tindakanType: 'MAKLUMAN' | 'TINDAKAN';
  tindakanOwner: string;
  maklumBalasStatus: string;
  mukaSurat: string;
}

export interface MinitMesyuaratDocument {
  id: string;
  docKind: 'MINIT';
  schoolCode: string;
  academicYear: string;
  linkedMemoId?: string;
  pillar: MySGPillar;
  kodMySG: string;
  jawatankuasaInduk: string;
  tajukMesyuarat: string;
  bilangan: string;
  tarikh: string;
  masa: string;
  tempat: string;
  pengerusi: string;
  pencatat: string;
  hadirNames: string[];
  tidakHadirBersebab: string[];
  turutHadir: string[];
  agendaEntries: MinitAgendaEntry[];
  disahkanOlehName: string;
  disahkanOlehTitle: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SuratLantikanDocument {
  id: string;
  docKind: 'LANTIKAN';
  schoolCode: string;
  academicYear: string;
  mode: 'INDIVIDU_BERSEPADU' | 'JAWATAN_TUNGGAL';
  rujukanKami: string;
  tarikhSurat: string;
  teacherId?: string;
  teacherName?: string;
  kodMySG?: string;
  jawatanRasmi?: string;
  principalName: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type AnySetiausahaDocument =
  | OPRPosterDocument
  | MemoMesyuaratDocument
  | MinitMesyuaratDocument
  | SuratLantikanDocument;
