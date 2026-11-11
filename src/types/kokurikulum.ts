export type KokoScopeLevel = 'Sekolah' | 'Daerah/Zon' | 'Bahagian' | 'Negeri' | 'Kebangsaan' | 'Antarabangsa';

export type KokoPencapaianTier = 
  | 'Johan' 
  | 'Naib Johan' 
  | 'Ketiga' 
  | 'Keempat' 
  | 'Kelima' 
  | 'Saguhati' 
  | 'Penyertaan';

export type KokoPengiktirafanType = 'Sijil' | 'Pingat' | 'Trofi' | 'PAJSK';

export type TeacherCommitteeRole = 'Ketua Guru Penasihat' | 'Guru Penasihat';

export type StudentCommitteeRole = 
  | 'Pengerusi' 
  | 'Naib Pengerusi' 
  | 'Setiausaha' 
  | 'Penolong Setiausaha' 
  | 'Bendahari' 
  | 'Penolong Bendahari' 
  | 'AJK' 
  | 'Ahli Biasa';

export interface KokoActivity {
  id?: string;
  jenis: 'pertandingan' | 'aktiviti';
  programName: string;
  organizer: string;
  date: string;
  endDate?: string;
  venue: string;
  level: KokoScopeLevel;
  category: 'uniform' | 'club' | 'sport' | 'KURIKULUM' | 'KOAKADEMIK' | 'HEM' | 'KOKURIKULUM';
  unit?: string;
  
  // Teacher roles separation
  jurulatih: string[];        // Coach / Trainer names
  guruPengiring: string[];    // Accompanying Chaperone names
  officers?: string;          // Legacy text
  teacherName?: string;       // Legacy single teacher
  
  // Student participation (Supports Zero-Student Rule: participantCount === 0)
  participantCount: number;
  studentIds?: string[];
  studentNames?: string[];
  
  // Conditional for 'pertandingan'
  pencapaian?: KokoPencapaianTier | string;
  pengiktirafan?: (KokoPengiktirafanType | string)[];
  pencapaianDetails?: {
    studentId?: string;
    studentName: string;
    level: string;
    achievement: string;
    prize?: string;
  }[];

  // Documentation & Summary
  objective1?: string;
  objective2?: string;
  objective3?: string;
  objective4?: string;
  objectives?: string[];
  reflection?: string;
  impact?: string;
  kekuatan?: string;
  kelemahanCadangan?: string;
  tindakanSusulan?: string;
  images: string[];
  
  // Metadata
  createdBy: string;
  academicYear: string;
  createdAt: string;
  updatedAt?: string;
}

export interface KokoMeetingReport {
  id?: string;
  meetingNumber: number; // 1 - 12
  meetingTitle: string;  // e.g. "Perjumpaan 1: Mesyuarat Agung Tahunan & Pelantikan AJK"
  category: 'uniform' | 'club' | 'sport';
  groupId: string;
  groupName: string;
  date: string;          // YYYY-MM-DD
  timeStart?: string;
  timeEnd?: string;
  venue: string;
  
  // Attendance sync from koko_attendance
  attendanceSessionId?: string;
  attendanceStats: {
    present: number;
    absent: number;
    total: number;
    percentage: number;
  };
  
  // Personnel
  guruPenasihatHadir: string[];
  
  // Content & KPM syllabus
  kpmModule?: string;
  tajukAktiviti: string;
  objektif: string[];
  ringkasanAktiviti: string;
  refleksiImpak: string;
  halLain?: string;
  images?: string[];
  
  // Sign-off
  disediakanOleh: string;
  jawatanPenyedia: string;
  disahkanOleh?: string;
  
  academicYear: string;
  createdAt: string;
  updatedAt?: string;
}

export type KokoRole = 'pentadbir' | 'guru' | 'laporan';

export interface KokoSettings {
  id?: string;
  schoolLogo: string;
  kpmLogo: string;
  ts25Logo: string;
  schoolName: string;
  lastUpdated: string;
}

export interface KokoGroup {
  id?: string;
  name: string;
  category: 'uniform' | 'club' | 'sport';
  description?: string;
}

export interface KokoMembership {
  id?: string;
  student_id: string;
  name?: string;
  class?: string;
  gender?: string;
  uniform?: string;
  club?: string;
  sport?: string;
  academic_year?: string;
  category?: 'uniform' | 'club' | 'sport' | string;
  groupId?: string;
  groupName?: string;
  position?: StudentCommitteeRole | string;
}

export interface KokoCommitteeMember {
  id?: string;
  type: 'teacher' | 'student';
  personId: string;
  name: string;
  role: TeacherCommitteeRole | StudentCommitteeRole | string;
  subRole?: string; // e.g. "AJK Peralatan", "AJK Disiplin"
  class?: string;
  groupId: string;
  groupName: string;
  category: 'uniform' | 'club' | 'sport';
  academicYear: string;
}

export interface KokoAttendanceSession {
  id?: string;
  meetingNumber?: number; // 1 - 12
  groupId: string;
  category: 'uniform' | 'club' | 'sport';
  date: string;
  academicYear: string;
  attendance: {
    [studentId: string]: '1' | '0' | 'x'; // 1=Hadir, 0=Tidak Hadir, x=Kecualian
  };
  meetingReportId?: string; // Shortcut pre-filled link
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;
}

export const KPM_12_MEETING_TEMPLATES = [
  {
    meetingNumber: 1,
    title: 'Mesyuarat Agung Tahunan & Pelantikan AJK',
    kpmModule: 'Pengurusan Organisasi & Tadbir Urus',
    defaultObjectives: [
      'Memilih dan melantik barisan Ahli Jawatankuasa (AJK) bagi sesi persekolahan semasa.',
      'Membentangkan dan meluluskan perlembagaan serta peraturan unit.',
      'Merancang takwim aktiviti tahunan dan penetapan yuran/perjumpaan.'
    ],
    defaultSummary: 'Murid berkumpul dan mendengar taklimat guru penasihat mengenai matlamat unit. Sesi pencalonan dan undian dijalankan secara demokrasi untuk melantik Pengerusi, Naib Pengerusi, Setiausaha, Bendahari dan AJK. Perbincangan takwim tahunan turut dimuktamadkan.',
    defaultReflection: 'Semua murid memberikan kerjasama padu dalam pelantikan AJK baharu. Barisan kepimpinan murid berjaya dibentuk dengan lancar.'
  },
  {
    meetingNumber: 2,
    title: 'Sejarah, Matlamat, Logo/Lagu & Peraturan Asas',
    kpmModule: 'Pengetahuan Am & Penghayatan Identiti Unit',
    defaultObjectives: [
      'Mempelajari sejarah penubuhan, falsafah, dan matlamat unit.',
      'Menghayati maksud logo, cogan kata, dan menyanyikan lagu rasmi unit.',
      'Memahami tatatertib pemakaian uniform/etika pakaian dan kehadiran.'
    ],
    defaultSummary: 'Guru penasihat memberi penerangan tentang asal usul penubuhan dan etika unit. Murid menyalin dan menyanyikan lagu rasmi serta melukis/menerangkan lambang logo unit dalam buku log/catatan peribadi.',
    defaultReflection: 'Murid menunjukkan minat mendalam terhadap latar belakang unit dan dapat menyanyikan lagu unit dengan bersemangat.'
  },
  {
    meetingNumber: 3,
    title: 'Kemahiran Asas I: Pengenalan Asas & Disiplin Unit',
    kpmModule: 'Modul Kemahiran Teras KPM',
    defaultObjectives: [
      'Mempelajari teknik kawad kaki asas / kemahiran motor / peraturan asas permainan.',
      'Memupuk disiplin kendiri, fokus dan kepatuhan arahan pemimpin.',
      'Mempraktikkan teori asas ke dalam pergerakan fizikal terkawal.'
    ],
    defaultSummary: 'Aktiviti dimulakan dengan taklimat keselamatan dan pemanasan badan. Murid dibahagikan kepada skuad/kumpulan kecil untuk menjalani latihan amali teknik asas di bawah bimbingan guru penasihat dan ketua murid.',
    defaultReflection: 'Murid dapat menguasai kemahiran asas tahap permulaan dengan baik dan mematuhi arahan keselamatan.'
  },
  {
    meetingNumber: 4,
    title: 'Kemahiran Asas II: Aplikasi & Pembinaan Asas Lanjutan',
    kpmModule: 'Modul Kemahiran Teras KPM',
    defaultObjectives: [
      'Memperkukuhkan kemahiran asas melalui latihan berulang dan simulasi berperingkat.',
      'Meningkatkan koordinasi fizikal/minda dan ketepatan tindakan.',
      'Mengaplikasikan teknik ikatan/kemahiran teknikal/strategi asas unit.'
    ],
    defaultSummary: 'Latihan intensif kemahiran fasa kedua dijalankan. Murid melakukan demonstrasi individu dan berpasangan serta menerima maklum balas pembetulan segera daripada guru penasihat.',
    defaultReflection: 'Peningkatan ketara dari segi ketangkasan dan keyakinan murid dalam mempraktikkan kemahiran unit.'
  },
  {
    meetingNumber: 5,
    title: 'Kemahiran Asas III: Kerja Sepasukan & Koordinasi Kumpulan',
    kpmModule: 'Modul Kemahiran Teras KPM',
    defaultObjectives: [
      'Mengintegrasikan kemahiran individu ke dalam dinamika kerja sepasukan.',
      'Membina komunikasi berkesan dan saling membantu sesama ahli.',
      'Menyelesaikan tugasan amali unit secara kolaboratif.'
    ],
    defaultSummary: 'Murid melaksanakan aktiviti stesen secara berkumpulan. Setiap kumpulan perlu menyelesaikan cabaran amali yang menguji kefahaman modul 1 hingga 4 secara pantas dan tepat.',
    defaultReflection: 'Semangat kerjasama antara ahli kumpulan terserlah. Murid berjaya menyelesaikan tugasan stesen dalam masa yang ditetapkan.'
  },
  {
    meetingNumber: 6,
    title: 'Pertandingan Dalaman / Kuiz / Ujian Kemahiran',
    kpmModule: 'Penilaian Formatif & Motivasi Ahli',
    defaultObjectives: [
      'Menguji tahap penguasaan kemahiran yang telah dipelajari melalui pertandingan sihat.',
      'Menyemai semangat kesukanan dan integriti persaingan.',
      'Memberi pengiktirafan awal kepada murid yang menunjukkan kemajuan cemerlang.'
    ],
    defaultSummary: 'Pertandingan dalaman dijalankan antara patrol/kumpulan (Kuiz Pengetahuan / Pertandingan Kemahiran / Perlawanan Mini). Skor dicatat dan pemenang diumumkan di akhir perjumpaan.',
    defaultReflection: 'Persaingan sihat menyuntik semangat murid untuk terus berusaha meningkatkan kemahiran diri.'
  },
  {
    meetingNumber: 7,
    title: 'Kemahiran Lanjutan I: Teknik Khusus & Penyelesaian Masalah',
    kpmModule: 'Modul Kemahiran Lanjutan KPM',
    defaultObjectives: [
      'Mempelajari teknik lanjutan dan strategi menghadapi situasi mencabar.',
      'Meningkatkan daya pemikiran kritis dan penaakulan kreatif dalam aktiviti unit.',
      'Mempraktikkan kemahiran pertolongan cemas asas / taktikal permainan / inovasi modul.'
    ],
    defaultSummary: 'Guru penasihat memperkenalkan modul lanjutan. Murid diberi senario masalah sebenar dan diminta merangka pelan tindakan serta mempraktikkan langkah penyelesaian secara amali.',
    defaultReflection: 'Murid berupaya membuat pertimbangan wajar dan menunjukkan kematangan dalam menyelesaikan tugasan mencabar.'
  },
  {
    meetingNumber: 8,
    title: 'Kemahiran Lanjutan II: Projek Kreatif & Inovasi Unit',
    kpmModule: 'Modul Kemahiran Lanjutan KPM',
    defaultObjectives: [
      'Membangunkan projek atau produk kreatif berteraskan identiti unit.',
      'Mengaplikasikan ilmu merentas kurikulum (STEM / Rekaan / Komunikasi).',
      'Mempersiapkan bahan untuk pameran atau demonstrasi sekolah.'
    ],
    defaultSummary: 'Sesi bengkel pembikinan projek unit. Murid menggunakan bahan terpakai / peralatan khusus untuk menghasilkan gajet, model inovasi, atau bahan penerbitan unit.',
    defaultReflection: 'Kreativiti murid menghasilkan projek yang menarik dan berdaya cipta tinggi.'
  },
  {
    meetingNumber: 9,
    title: 'Kemahiran Lanjutan III: Kepimpinan & Perancangan Strategik',
    kpmModule: 'Modul Kepimpinan Murid',
    defaultObjectives: [
      'Melahirkan murid yang berani memimpin, memberi arahan, dan menguruskan rakan sebaya.',
      'Mempelajari etika pengurusan acara dan protokol perjumpaan.',
      'Memperkukuhkan keyakinan diri dan kemahiran pengucapan awam.'
    ],
    defaultSummary: 'Aktiviti dikendalikan sepenuhnya oleh barisan AJK murid dengan bimbingan fasilitator guru. Setiap AJK memimpin stesen aktiviti dan memberikan taklimat kepada ahli-ahli junior.',
    defaultReflection: 'AJK murid mempamerkan ciri-ciri kepimpinan yang terpuji dan mampu mengawal disiplin rakan sebaya.'
  },
  {
    meetingNumber: 10,
    title: 'Persediaan Karnival / Khidmat Komuniti Sekolah',
    kpmModule: 'Khidmat Masyarakat & Penglibatan Komuniti',
    defaultObjectives: [
      'Melaksanakan khidmat bakti kepada warga sekolah dan persekitaran.',
      'Memupuk sikap prihatin, empati, dan tanggungjawab sivik murid.',
      'Membuat persiapan rapi bagi karnival kokurikulum peringkat sekolah.'
    ],
    defaultSummary: 'Gotong-royong pembersihan bilik peralatan kokurikulum, keceriaan sudut papan kenyataan unit, dan simulasi gerai/aktiviti pameran karnival sekolah.',
    defaultReflection: 'Murid merasa bangga dapat menyumbang tenaga untuk kebersihan dan keindahan sekolah.'
  },
  {
    meetingNumber: 11,
    title: 'Penilaian Kemahiran & Refleksi Ahli',
    kpmModule: 'Penilaian Sumatif & Pentaksiran PAJSK',
    defaultObjectives: [
      'Menilai tahap kehadiran, penglibatan dan pencapaian ahli sepanjang tahun.',
      'Melengkapkan rekod buku log / fail aktiviti untuk pentaksiran PAJSK.',
      'Memberi peluang kepada murid menyuarakan maklum balas dan cadangan penambahbaikan.'
    ],
    defaultSummary: 'Guru penasihat menyemak buku log murid dan mengesahkan rekod perjumpaan serta pemarkahan PAJSK. Sesi *circle time* refleksi dijalankan untuk berkongsi pengalaman sepanjang tahun.',
    defaultReflection: 'Buku log murid disemak lengkap. Refleksi murid membuktikan objektif pembelajaran tahunan tercapai.'
  },
  {
    meetingNumber: 12,
    title: 'Majlis Apresiasi & Rumusan Tahunan',
    kpmModule: 'Penghargaan & Apresiasi Murid',
    defaultObjectives: [
      'Meraikan kejayaan dan komitmen seluruh ahli sepanjang 12 siri perjumpaan.',
      'Menyampaikan sijil penghargaan kepada AJK dan murid yang menunjukkan teladan terbaik.',
      'Membuat rumusan pencapaian tahunan dan amanat guru penasihat.'
    ],
    defaultSummary: 'Majlis penutupan santai diadakan bersama jamuan ringan. Guru penasihat menyampaikan sijil penghargaan dan cenderamata kepada AJK serta ahli cemerlang, diikuti ucapan penutup.',
    defaultReflection: 'Majlis berlangsung dalam suasana meriah dan penuh apresiasi. Murid bersemangat untuk meneruskan kecemerlangan pada sesi akan datang.'
  }
];
