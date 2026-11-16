import * as XLSX from 'xlsx';

export type MySGPillar = 'PENTADBIRAN' | 'KURIKULUM' | 'HEM' | 'KOKURIKULUM';
export type MySGTahapBeban = 'BERAT (重)' | 'SEDERHANA (中)' | 'RINGAN (轻)';
export type MySGMataBeban = 3 | 2 | 1;

export interface MySGJawatankuasaItem {
  bil: number;
  pillar: MySGPillar;
  kodMySG: string;
  jawatankuasaInduk: string;
  jawatanRasmi: string;
  tahapBeban: MySGTahapBeban;
  mataBeban: MySGMataBeban;
  analisisBeban: string;
  cadanganPelaksana: string;
  perincianTugas: string;
  sistemKPM: string;
  peringatanKritikal: string;
  skpmStandardCode: string;
  assignedTeacherId: string;
  assignedTeacherName: string;
  /** Optional custom due date (YYYY-MM-DD) for Takwim reminder sync */
  customDueDate?: string;
}

export interface MySGPillarSummary {
  pillar: MySGPillar;
  label: string;
  totalPositions: number;
  totalMata: number;
  assignedCount: number;
}

export interface TeacherWorkloadRadarEntry {
  teacherId: string;
  teacherName: string;
  category: string;
  positionCount: number;
  totalMata: number;
  status: 'KURANG' | 'OPTIMUM' | 'BERAT';
  positions: MySGJawatankuasaItem[];
}

export const TAHAP_BEBAN_MATA_MAP: Record<MySGTahapBeban, MySGMataBeban> = {
  'BERAT (重)': 3,
  'SEDERHANA (中)': 2,
  'RINGAN (轻)': 1,
};

export function computeMataBeban(tahap: MySGTahapBeban): MySGMataBeban {
  return TAHAP_BEBAN_MATA_MAP[tahap] ?? 2;
}

export function normalizeTahapBeban(raw: unknown): MySGTahapBeban {
  const s = String(raw || '').toUpperCase().trim();
  if (s.includes('BERAT') || s.includes('重') || s === '3') return 'BERAT (重)';
  if (s.includes('RINGAN') || s.includes('轻') || s === '1') return 'RINGAN (轻)';
  return 'SEDERHANA (中)';
}

export const PILLAR_DISPLAY_META: Record<MySGPillar, { label: string; shortLabel: string; accent: string }> = {
  PENTADBIRAN: {
    label: '1. Pentadbiran & Pengurusan',
    shortLabel: 'Pentadbiran',
    accent: 'blue',
  },
  KURIKULUM: {
    label: '2. Kurikulum & Akademik',
    shortLabel: 'Kurikulum',
    accent: 'indigo',
  },
  HEM: {
    label: '3. Hal Ehwal Murid (HEM)',
    shortLabel: 'HEM',
    accent: 'emerald',
  },
  KOKURIKULUM: {
    label: '4. Kokurikulum & Koakademik',
    shortLabel: 'Kokurikulum',
    accent: 'amber',
  },
};

export const MYSG_OPR_KOAKADEMIK_OPTIONS = [
  {
    code: 'JR21 [KOAKADEMIK-BC]',
    unit: 'Koakademik Bahasa Cina (BC)',
    bidang: 'Koakademik Bahasa Cina (Syarahan, Kaligrafi, Bercerita)',
    skpm: 'Std 3.2.5.1 / 3.2.2.1',
  },
  {
    code: 'JR21 [KOAKADEMIK-BM]',
    unit: 'Koakademik Bahasa Melayu (BM)',
    bidang: 'Koakademik Bahasa Melayu (Pidato, Bercerita, Sahibba)',
    skpm: 'Std 3.2.5.1 / 3.2.2.1',
  },
  {
    code: 'JR21 [KOAKADEMIK-BI]',
    unit: 'Koakademik Bahasa Inggeris (BI)',
    bidang: 'Koakademik Bahasa Inggeris (Storytelling, Public Speaking, Choral Speaking)',
    skpm: 'Std 3.2.5.1 / 3.2.2.1',
  },
  {
    code: 'JR21 [KOAKADEMIK-STEM]',
    unit: 'Koakademik STEM (Sains & Matematik)',
    bidang: 'Koakademik STEM (Reka Cipta, Robotik, Kuiz Sains & Matematik)',
    skpm: 'Std 3.2.5.1 / 3.2.2.1',
  },
  {
    code: 'JR21 [KOAKADEMIK-SENI]',
    unit: 'Koakademik Kesenian & Kebudayaan',
    bidang: 'Koakademik Kesenian & Kebudayaan (Tarian, Koir, Seni Visual)',
    skpm: 'Std 3.2.5.1 / 3.2.2.1',
  },
] as const;

type SeedItemInput = Omit<MySGJawatankuasaItem, 'mataBeban' | 'assignedTeacherId' | 'assignedTeacherName'>;

function buildSeedCatalog(raw: SeedItemInput[]): MySGJawatankuasaItem[] {
  return raw.map((item) => ({
    ...item,
    mataBeban: computeMataBeban(item.tahapBeban),
    assignedTeacherId: '',
    assignedTeacherName: '',
  }));
}

export const MYSG_DEFAULT_CATALOG: MySGJawatankuasaItem[] = buildSeedCatalog([
  // =========================================================================
  // PILLAR 1: PENTADBIRAN (JR01 - JR10 | 22 POSITIONS | 45 MATA BEBAN)
  // =========================================================================
  {
    bil: 1,
    pillar: 'PENTADBIRAN',
    kodMySG: 'JR01 [PENGURUSAN]',
    jawatankuasaInduk: 'Jawatankuasa Pengurusan Sekolah',
    jawatanRasmi: 'Setiausaha Pengurusan Sekolah',
    tahapBeban: 'BERAT (重)',
    analisisBeban: 'Teras mesyuarat pengurusan & surat lantikan sepanjang tahun',
    cadanganPelaksana: 'Guru Kanan / Guru Berpengalaman',
    perincianTugas: 'Menyediakan minit mesyuarat guru/pentadbiran, takwim induk sekolah, surat lantikan MySG dan pelaporan tahunan sekolah.',
    sistemKPM: 'MySG / Portal Sekolah / HRMIS',
    peringatanKritikal: 'Keluarkan Surat Lantikan Jawatankuasa MySG & Takwim Induk selewat-lewatnya Minggu 2 sesi persekolahan.',
    skpmStandardCode: 'Std 1.1.1 / 2.1.1',
  },
  {
    bil: 2,
    pillar: 'PENTADBIRAN',
    kodMySG: 'JR01 [STRATEGIK]',
    jawatankuasaInduk: 'Jawatankuasa Perancangan Strategik',
    jawatanRasmi: 'Penyelaras Perancangan Strategik & Pelan Taktikal',
    tahapBeban: 'RINGAN (轻)',
    analisisBeban: 'Semakan berkala awal tahun, pertengahan & akhir tahun',
    cadanganPelaksana: 'Guru Akademik Biasa (Senior)',
    perincianTugas: 'Menyelaras Pelan Strategik Organisasi (PSO), Pelan Taktikal dan Pelan Operasi setiap unit mengikut KPI PPD/JPN.',
    sistemKPM: 'SKPM Kualiti@Sekolah',
    peringatanKritikal: 'Sediakan semakan pencapaian Pelan Taktikal pada Jun & November setiap tahun.',
    skpmStandardCode: 'Std 1.1.2 / 1.1.3',
  },
  {
    bil: 3,
    pillar: 'PENTADBIRAN',
    kodMySG: 'JR02 [FIZIKAL]',
    jawatankuasaInduk: 'Jawatankuasa Pembangunan & Penyelenggaraan',
    jawatanRasmi: 'Penyelaras Penyelenggaraan Fizikal & Prasarana',
    tahapBeban: 'RINGAN (轻)',
    analisisBeban: 'Pemeriksaan kerosakan & laporan ad-hoc PPD',
    cadanganPelaksana: 'Guru Akademik Biasa / Penyelaras Stor',
    perincianTugas: 'Merekod kerosakan fizikal bilik darjah, elektrik, paip dan perabot serta mengemukakan permohonan penyelenggaraan kepada PPD.',
    sistemKPM: 'EMIS / Sistem Aduan KPM',
    peringatanKritikal: 'Laksanakan audit fizikal prasarana sebelum pembukaan penggal & selepas cuti panjang.',
    skpmStandardCode: 'Std 2.6.1',
  },
  {
    bil: 4,
    pillar: 'PENTADBIRAN',
    kodMySG: 'JR02 [MEDIA]',
    jawatankuasaInduk: 'Jawatankuasa Media, Dokumentasi & Publisiti',
    jawatanRasmi: 'Penyelaras Siaraya, Fotografi & Media Sosial Rasmi',
    tahapBeban: 'SEDERHANA (中)',
    analisisBeban: 'Liputan setiap majlis rasmi & pengurusan PA system',
    cadanganPelaksana: 'Guru Muda / Guru ICT',
    perincianTugas: 'Mengurus sistem siaraya (PA) majlis sekolah, merakam foto/video rasmi, menyunting poster hebahan & mengemas kini laman rasmi.',
    sistemKPM: 'Laman Rasmi Sekolah / DELIMa',
    peringatanKritikal: 'Pastikan peralatan siaraya diuji 24 jam sebelum perhimpunan atau majlis rasmi.',
    skpmStandardCode: 'Std 2.7.1',
  },
  {
    bil: 5,
    pillar: 'PENTADBIRAN',
    kodMySG: 'JR03 [TS25]',
    jawatankuasaInduk: 'Jawatankuasa Transformasi Sekolah (TS25)',
    jawatanRasmi: 'Penyelaras Program Transformasi Sekolah (TS25)',
    tahapBeban: 'RINGAN (轻)',
    analisisBeban: 'Pengumpulan evidens PAK21 & kemenjadian murid',
    cadanganPelaksana: 'Guru Akademik Biasa / SISC+ Liaison',
    perincianTugas: 'Menyelaras bengkel modul TS25, pameran PAK21, PInTaS dan pelaporan intervensi bersama rakan ELIT / SIPartners+.',
    sistemKPM: 'Portal TS25 / DELIMa',
    peringatanKritikal: 'Kemas kini PInTaS & OPPM setiap suku tahun untuk lawatan bimbingan PPD.',
    skpmStandardCode: 'Std 1.2.1 / 3.1.1',
  },
  {
    bil: 6,
    pillar: 'PENTADBIRAN',
    kodMySG: 'JR04 [GDM]',
    jawatankuasaInduk: 'Jawatankuasa Pengurusan Maklumat Sekolah (JPMS)',
    jawatanRasmi: 'Guru Data Maklumat (GDM)',
    tahapBeban: 'BERAT (重)',
    analisisBeban: 'Pengesahan data bulanan EMIS & berjadual KPM',
    cadanganPelaksana: 'Guru Data Lantikan Rasmi (GDM)',
    perincianTugas: 'Mengurus dan mengesahkan data profil sekolah, enrolmen, prasarana, guru dan kelas dalam EMIS serta laporan JPMS suku tahun.',
    sistemKPM: 'EMIS Online / e-Operasi',
    peringatanKritikal: 'Sahkan data EMIS sebelum 30 haribulan setiap bulan (Pengesahan Ralat Sifar).',
    skpmStandardCode: 'Std 2.2.1',
  },
  {
    bil: 7,
    pillar: 'PENTADBIRAN',
    kodMySG: 'JR04 [APDM/MOEIS]',
    jawatankuasaInduk: 'Jawatankuasa Pengurusan Maklumat Sekolah (JPMS)',
    jawatanRasmi: 'Guru Admin APDM & MOEIS (Kehadiran & Murid)',
    tahapBeban: 'BERAT (重)',
    analisisBeban: 'Pemantauan harian kehadiran murid & pengurusan pindah/daftar',
    cadanganPelaksana: 'Guru Data / Penyelaras MOEIS',
    perincianTugas: 'Memantau pengisian kehadiran harian sebelum jam 9.00 pagi, memproses pendaftaran Tahun 1 & pertukaran murid dalam MOEIS/APDM.',
    sistemKPM: 'MOEIS / APDM KPM',
    peringatanKritikal: 'Semak ketepatan enrolmen & kehadiran harian MOEIS sebelum 10:00 pagi dan tutup buku hujung bulan.',
    skpmStandardCode: 'Std 2.2.1 / 3.3.1',
  },
  {
    bil: 8,
    pillar: 'PENTADBIRAN',
    kodMySG: 'JR04 [idMe]',
    jawatankuasaInduk: 'Jawatankuasa Pengurusan Maklumat Sekolah (JPMS)',
    jawatanRasmi: 'Penyelaras Sistem Bersepadu idMe KPM',
    tahapBeban: 'BERAT (重)',
    analisisBeban: 'Pentadbir modul PBD, PAJSK & Profil Murid dalam idMe',
    cadanganPelaksana: 'Guru Admin idMe / Guru ICT',
    perincianTugas: 'Mengurus akaun guru/ibu bapa dalam idMe, pengagihan kelas, pengesahan kemasukan markah PBD/UASA serta aduan akses.',
    sistemKPM: 'Sistem Bersepadu KPM (idMe)',
    peringatanKritikal: 'Pastikan pemetaan guru mata pelajaran & kelas dalam idMe selesai sebelum tetingkap PBD dibuka.',
    skpmStandardCode: 'Std 2.2.1 / 3.1.4',
  },
  {
    bil: 9,
    pillar: 'PENTADBIRAN',
    kodMySG: 'JR04 [e-OPERASI]',
    jawatankuasaInduk: 'Jawatankuasa Pengurusan Maklumat Sekolah (JPMS)',
    jawatanRasmi: 'Penyelaras e-Operasi & HRMIS Sekolah',
    tahapBeban: 'BERAT (重)',
    analisisBeban: 'Semakan opsyen, ABM perjawatan & rekod cuti HRMIS',
    cadanganPelaksana: 'Guru Data / PT Pentadbiran',
    perincianTugas: 'Membantu PKP mengemas kini maklumat guru dalam e-Operasi (ABM, opsyen, waktu mengajar) dan menyemak rekod cuti/profil HRMIS.',
    sistemKPM: 'e-Operasi / HRMIS 2.0',
    peringatanKritikal: 'Sahkan semakan ABM Perjawatan e-Operasi pada Februari, Mei & Oktober mengikut takwim JPN.',
    skpmStandardCode: 'Std 2.1.1 / 2.2.1',
  },
  {
    bil: 10,
    pillar: 'PENTADBIRAN',
    kodMySG: 'JR04 [ICT/DELIMa]',
    jawatankuasaInduk: 'Jawatankuasa ICT & Digitalisasi Sekolah',
    jawatanRasmi: 'Penyelaras ICT & Pelantar DELIMa',
    tahapBeban: 'SEDERHANA (中)',
    analisisBeban: 'Penyelenggaraan makmal komputer, Chromebook & akaun DELIMa',
    cadanganPelaksana: 'Guru Penyelaras Bestari (GPB) / Guru ICT',
    perincianTugas: 'Mengurus akaun DELIMa guru dan murid, jadual penggunaan makmal/Chromebook, DCS murid Tahun 6 dan keselamatan siber.',
    sistemKPM: 'DELIMa 2.0 / DCS KPM',
    peringatanKritikal: 'Kemas kini akaun DELIMa murid Tahun 1 & semak skor Digital Competency Score (DCS) mengikut tarikh PPD.',
    skpmStandardCode: 'Std 2.6.2',
  },
  {
    bil: 11,
    pillar: 'PENTADBIRAN',
    kodMySG: 'JR05 [LDP/SULDP]',
    jawatankuasaInduk: 'Jawatankuasa Latihan Dalam Perkhidmatan (LDP)',
    jawatanRasmi: 'Setiausaha Latihan Dalam Perkhidmatan (SULDP)',
    tahapBeban: 'BERAT (重)',
    analisisBeban: 'Memantau minimum 5 hari / 42 mata kredit SPLKPM semua staf',
    cadanganPelaksana: 'Guru Akademik Biasa (Teliti)',
    perincianTugas: 'Merancang kursus LDP/PLC peringkat sekolah, mendaftar kursus dalam SPLKPM dan memantau pencapaian hari berkursus serta e-Pembelajaran staf.',
    sistemKPM: 'SPLKPM KPM',
    peringatanKritikal: 'Pastikan 100% guru dan AKP capai minimum 5 hari LDP / 42 mata kredit SPLKPM sebelum 31 Oktober.',
    skpmStandardCode: 'Std 2.1.2',
  },
  {
    bil: 12,
    pillar: 'PENTADBIRAN',
    kodMySG: 'JR05 [PBPPP]',
    jawatankuasaInduk: 'Jawatankuasa Penilaian Bersepadu (PBPPP)',
    jawatanRasmi: 'Penyelaras & Urus Setia PBPPP Sekolah',
    tahapBeban: 'RINGAN (轻)',
    analisisBeban: 'Urusetia teknikal 2 fasa penilaian tahunan',
    cadanganPelaksana: 'Guru Kanan / Setiausaha Pentadbiran',
    perincianTugas: 'Membantu jawatankuasa PBPPP menyemak senarai PYD, jadual keberhasilan fasa pertama/akhir dan pengesahan dalam sistem e-Prestasi.',
    sistemKPM: 'e-Prestasi (PBPPP)',
    peringatanKritikal: 'Sediakan surat pelantikan JK PBPPP & selaraskan serahan borang keberhasilan pada Mac & September.',
    skpmStandardCode: 'Std 2.1.2',
  },
  {
    bil: 13,
    pillar: 'PENTADBIRAN',
    kodMySG: 'JR06 [KEWANGAN]',
    jawatankuasaInduk: 'Jawatankuasa Pengurusan Kewangan & Akaun (JPKA)',
    jawatanRasmi: 'Setiausaha Kewangan & Perolehan (eSPKWS)',
    tahapBeban: 'BERAT (重)',
    analisisBeban: 'Mesyuarat JPKA suku tahun, nota minta & audit akaun sekolah',
    cadanganPelaksana: 'Guru / PT Kewangan Lantikan',
    perincianTugas: 'Menyelaras mesyuarat JPKA suku tahunan, memantau perbelanjaan PCG setiap panitia, baucar bayaran dan persediaan audit eSPKWS.',
    sistemKPM: 'eSPKWS / ePerolehan',
    peringatanKritikal: 'Pastikan baki peruntukan PCG dibelanjakan mengikut garis panduan sebelum tutup akaun November.',
    skpmStandardCode: 'Std 2.3.1',
  },
  {
    bil: 14,
    pillar: 'PENTADBIRAN',
    kodMySG: 'JR06 [ASET]',
    jawatankuasaInduk: 'Jawatankuasa Pengurusan Aset Alih Kerajaan (JKPAK)',
    jawatanRasmi: 'Pegawai Aset Sekolah',
    tahapBeban: 'BERAT (重)',
    analisisBeban: 'Pendaftaran KEW.PA, pelabelan harta modal & mesyuarat suku tahun',
    cadanganPelaksana: 'Guru Lantikan Rasmi Pegawai Aset',
    perincianTugas: 'Mendaftar penerimaan aset baharu (KEW.PA-2/3), melabel nombor siri harta modal/inventori dan mengurus laporan pelupusan aset.',
    sistemKPM: 'SPATA / iSPAA KPM',
    peringatanKritikal: 'Hantar Laporan Tahunan Harta Modal & Inventori (KEW.PA-8) serta mesyuarat JKPAK setiap suku tahun.',
    skpmStandardCode: 'Std 2.6.1',
  },
  {
    bil: 15,
    pillar: 'PENTADBIRAN',
    kodMySG: 'JR06 [PEMERIKSA ASET]',
    jawatankuasaInduk: 'Jawatankuasa Pengurusan Aset Alih Kerajaan (JKPAK)',
    jawatanRasmi: 'Pegawai Pemeriksa Aset Sekolah',
    tahapBeban: 'RINGAN (轻)',
    analisisBeban: 'Pemeriksaan fizikal aset 1 kali setahun (KEW.PA-11)',
    cadanganPelaksana: 'Guru Akademik Biasa (Bukan Pegawai Aset)',
    perincianTugas: 'Melaksanakan pemeriksaan fizikal aset alih dan inventori di semua bilik khas & kelas serta melengkapkan borang KEW.PA-11/12.',
    sistemKPM: 'iSPAA / Fail Aset',
    peringatanKritikal: 'Lengkapkan pemeriksaan fizikal aset tahunan selewat-lewatnya bulan Oktober.',
    skpmStandardCode: 'Std 2.6.1',
  },
  {
    bil: 16,
    pillar: 'PENTADBIRAN',
    kodMySG: 'JR06 [JURUAUDIT]',
    jawatankuasaInduk: 'Jawatankuasa Pengurusan Kewangan & Akaun (JPKA)',
    jawatanRasmi: 'Juruaudit Dalaman Kewangan & Koperasi',
    tahapBeban: 'RINGAN (轻)',
    analisisBeban: 'Semakan berkala buku tunai, resit & rekod kutipan PIBG/KGKT',
    cadanganPelaksana: 'Guru Matematik / Guru Senior',
    perincianTugas: 'Menyemak penyata kewangan suku tahunan, resit rasmi, buku tunai dan laporan audit dalaman sebelum pengesahan Guru Besar.',
    sistemKPM: 'eSPKWS / Fail Audit',
    peringatanKritikal: 'Semak penyata penyesuaian bank dan baucar bayaran setiap suku tahun.',
    skpmStandardCode: 'Std 2.3.1',
  },
  {
    bil: 17,
    pillar: 'PENTADBIRAN',
    kodMySG: 'JR07 [SKPM]',
    jawatankuasaInduk: 'Jawatankuasa Standard Kualiti Pendidikan Malaysia (SKPM)',
    jawatanRasmi: 'Setiausaha SKPM Kualiti@Sekolah',
    tahapBeban: 'BERAT (重)',
    analisisBeban: 'Penyelarasan eviden Standard 1–5 & pengisian portal KPM',
    cadanganPelaksana: 'Guru Kanan / Guru Data / SU Pengurusan',
    perincianTugas: 'Menyelaras jawatankuasa PPS bagi Standard 1 hingga 5, mengumpulkan evidens PdPc Standard 4 dan memasukkan skor ke portal SKPM.',
    sistemKPM: 'Portal SKPM Kualiti@Sekolah',
    peringatanKritikal: 'Lengkapkan pengisian & pengesahan skor Fasa 1 (Mac) dan Fasa 2 (Oktober/November).',
    skpmStandardCode: 'Std 1.1 – Std 5',
  },
  {
    bil: 18,
    pillar: 'PENTADBIRAN',
    kodMySG: 'JR08 [PRASEKOLAH]',
    jawatankuasaInduk: 'Jawatankuasa Pengurusan Prasekolah',
    jawatanRasmi: 'Guru & Penyelaras Prasekolah',
    tahapBeban: 'BERAT (重)',
    analisisBeban: 'PdP penuh prasekolah, pentaksiran IPPK, makan & SMPK',
    cadanganPelaksana: 'Guru Opsyen Prasekolah',
    perincianTugas: 'Mengurus PdP prasekolah, menyelia PPM, pengisian Sistem Maklumat Prasekolah Kebangsaan (SMPK), permohonan murid & kewangan makan prasekolah.',
    sistemKPM: 'SMPK / IPPK / e-Prasekolah',
    peringatanKritikal: 'Kemas kini data SMPK bulanan dan urus permohonan e-Prasekolah Mac–Mei.',
    skpmStandardCode: 'Std 3.1.1 / 2.2.1',
  },
  {
    bil: 19,
    pillar: 'PENTADBIRAN',
    kodMySG: 'JR09 [BENCANA]',
    jawatankuasaInduk: 'Jawatankuasa Pengurusan Bencana Sekolah',
    jawatanRasmi: 'Penyelaras Pengurusan Bencana & Kecemasan',
    tahapBeban: 'RINGAN (轻)',
    analisisBeban: 'Pelan kontingensi banjir/jerebu & laporan segera PPD',
    cadanganPelaksana: 'Guru Akademik Biasa / Penyelaras 3K',
    perincianTugas: 'Menyediakan SOP kecemasan bencana (banjir, jerebu, ribut), pelan pemindahan bilik darjah dan pelaporan status sekolah kepada PPD.',
    sistemKPM: 'Portal Bencana KPM',
    peringatanKritikal: 'Semak kesiapsiagaan peti kecemasan & pelan laluan bencana sebelum musim tengkujuh.',
    skpmStandardCode: 'Std 2.6.1 / 3.3.4',
  },
  {
    bil: 20,
    pillar: 'PENTADBIRAN',
    kodMySG: 'JR10 [PIBG]',
    jawatankuasaInduk: 'Jawatankuasa Persatuan Ibu Bapa dan Guru (PIBG)',
    jawatanRasmi: 'Setiausaha & Bendahari Kehormat PIBG',
    tahapBeban: 'SEDERHANA (中)',
    analisisBeban: 'Mesyuarat Agung Tahunan PIBG, minit & penyata kewangan',
    cadanganPelaksana: 'Guru Lantikan Mesyuarat Agung PIBG',
    perincianTugas: 'Mengurus notis & minit Mesyuarat Agung Tahunan (MAT) PIBG, mengendalikan penyata kewangan tahunan dan permohonan sumbangan PIBG.',
    sistemKPM: 'Fail PIBG / e-Sarana',
    peringatanKritikal: 'Adakan Mesyuarat Agung Tahunan PIBG sebelum 31 Mac setiap tahun.',
    skpmStandardCode: 'Std 2.7.1',
  },
  {
    bil: 21,
    pillar: 'PENTADBIRAN',
    kodMySG: 'JR10 [PIBKS]',
    jawatankuasaInduk: 'Jawatankuasa Penglibatan Ibu Bapa, Komuniti & Swasta',
    jawatanRasmi: 'Penyelaras PIBKS & Sistem e-Sarana',
    tahapBeban: 'RINGAN (轻)',
    analisisBeban: 'Rekod kehadiran ibu bapa 6 aktiviti utama dalam e-Sarana',
    cadanganPelaksana: 'Guru Akademik Biasa',
    perincianTugas: 'Merekod penglibatan ibu bapa/komuniti dalam gotong-royong, hari sukan, hari terbuka dan program sukarelawan ke dalam sistem e-Sarana.',
    sistemKPM: 'Sistem e-Sarana KPM',
    peringatanKritikal: 'Kemas kini peratus kehadiran ibu bapa dalam e-Sarana selepas setiap 6 program utama sekolah.',
    skpmStandardCode: 'Std 2.7.1',
  },
  {
    bil: 22,
    pillar: 'PENTADBIRAN',
    kodMySG: 'JR10 [KGKT]',
    jawatankuasaInduk: 'Kelab Kebajikan Guru dan Kakitangan (KGKT)',
    jawatanRasmi: 'Pengerusi / Setiausaha Kelab Kebajikan Staf (KGKT)',
    tahapBeban: 'RINGAN (轻)',
    analisisBeban: 'Kebajikan staf, sambutan hari guru & jamuan perpisahan',
    cadanganPelaksana: 'Guru Akademik Biasa (Dilantik Staf)',
    perincianTugas: 'Mengurus dana kebajikan staf, lawatan sakit/takziah, sambutan Hari Guru, majlis persaraan dan aktiviti muhibah warga sekolah.',
    sistemKPM: 'Dalaman Sekolah',
    peringatanKritikal: 'Selaraskan kutipan yuran kebajikan & jadual sambutan Hari Guru pada bulan Mei.',
    skpmStandardCode: 'Std 2.1.1',
  },

  // =========================================================================
  // PILLAR 2: KURIKULUM (JR12 - JR15 | 22 POSITIONS | 48 MATA BEBAN)
  // =========================================================================
  {
    bil: 23,
    pillar: 'KURIKULUM',
    kodMySG: 'JR12 [SU KURIKULUM]',
    jawatankuasaInduk: 'Jawatankuasa Kurikulum Sekolah',
    jawatanRasmi: 'Setiausaha Kurikulum Sekolah',
    tahapBeban: 'BERAT (重)',
    analisisBeban: 'Mesyuarat Kurikulum 4x setahun, fail induk & pemantauan PdP',
    cadanganPelaksana: 'Guru Senior / Penyelaras Akademik',
    perincianTugas: 'Mengurus minit mesyuarat Jawatankuasa Kurikulum (4 kali setahun), menyelaraskan fail induk panitia, pencerapan PdPc & semakan buku tulis.',
    sistemKPM: 'SKPM Std 3.1 / e-RPH',
    peringatanKritikal: 'Adakan Mesyuarat Kurikulum Bil. 1 sebelum sesi persekolahan bermula & kumpul analisis pencerapan Standard 4.',
    skpmStandardCode: 'Std 3.1.1.1',
  },
  {
    bil: 24,
    pillar: 'KURIKULUM',
    kodMySG: 'JR12 [JADUAL WAKTU]',
    jawatankuasaInduk: 'Jawatankuasa Jadual Waktu & Guru Ganti',
    jawatanRasmi: 'Penyelaras Jadual Waktu & Guru Ganti (Relief)',
    tahapBeban: 'BERAT (重)',
    analisisBeban: 'Pembinaan jadual induk/kelas/guru & agihan relief harian',
    cadanganPelaksana: 'Guru Jadual Waktu / Penyelaras PKP',
    perincianTugas: 'Menyusun jadual waktu induk mematuhi KPM KSSR/SKM, menyemak had beban harian guru dan menjana jadual guru ganti setiap pagi.',
    sistemKPM: 'iSEPADU Timetable Engine / e-Operasi',
    peringatanKritikal: 'Pastikan jadual waktu induk disahkan sebelum hari pertama persekolahan & slip relief dijana sebelum 07:30 pagi.',
    skpmStandardCode: 'Std 3.1.3.1',
  },
  {
    bil: 25,
    pillar: 'KURIKULUM',
    kodMySG: 'JR12 [TRANSISI T1]',
    jawatankuasaInduk: 'Jawatankuasa Program Transisi Tahun 1',
    jawatanRasmi: 'Penyelaras Program Transisi Tahun 1 (PTTS)',
    tahapBeban: 'RINGAN (轻)',
    analisisBeban: 'Berfokus pada 4 minggu awal sesi persekolahan Tahun 1',
    cadanganPelaksana: 'Guru Kelas Tahun 1 / Guru Tahap 1',
    perincianTugas: 'Merancang jadual Fasa Penyesuaian (2 minggu) & Fasa Kesediaan (2 minggu), mengumpul laporan kesediaan murid & majlis penutupan.',
    sistemKPM: 'Modul Transisi KPM 2.0',
    peringatanKritikal: 'Hantar laporan pelaksanaan Program Transisi 4 minggu ke PPD pada minggu kelima persekolahan.',
    skpmStandardCode: 'Std 3.1.2.1',
  },
  {
    bil: 26,
    pillar: 'KURIKULUM',
    kodMySG: 'JR12 [PitS]',
    jawatankuasaInduk: 'Jawatankuasa Program Intervensi Tahun 1 (PitS)',
    jawatanRasmi: 'Penyelaras Program Intervensi Tahun 1 (PitS)',
    tahapBeban: 'SEDERHANA (中)',
    analisisBeban: 'Saringan pengesanan awal Tahun 1, pelaporan berfasa & bimbingan 3M',
    cadanganPelaksana: 'Guru Tahun 1 / Guru Pemulihan Khas',
    perincianTugas: 'Menyelaras saringan pengesanan literasi dan numerasi Tahun 1 (PitS), membina rekod profil murid intervensi dan memantau kemajuan selepas 3 bulan.',
    sistemKPM: 'Portal Intervensi KPM / PBD',
    peringatanKritikal: 'Laksanakan saringan PitS selepas Fasa Transisi (Bulan 3–4) dan hantar pelaporan fasa intervensi kepada PPD.',
    skpmStandardCode: 'Std 3.1.2.2 / 3.1.4.1',
  },
  {
    bil: 27,
    pillar: 'KURIKULUM',
    kodMySG: 'JR12 [PLaN]',
    jawatankuasaInduk: 'Jawatankuasa Program Literasi dan Numerasi (PLaN)',
    jawatanRasmi: 'Penyelaras Program Literasi dan Numerasi (PLaN)',
    tahapBeban: 'SEDERHANA (中)',
    analisisBeban: 'Pemantauan Tahap 1 (BM/BI/MT) mencapai minimum TP3 secara berkala',
    cadanganPelaksana: 'Guru Tahap 1 / Ketua Panitia Teras',
    perincianTugas: 'Menyelaras data penguasaan literasi BM/BI dan numerasi Matematik murid Tahun 2 & 3 serta menyelaras aktiviti bimbingan PLaN bersama SISC+.',
    sistemKPM: 'Sistem Pelaporan PLaN KPM',
    peringatanKritikal: 'Bentangkan analisis murid belum capai TP3 dalam mesyuarat dialog prestasi & kemas kini data PLaN fasa 1 & 2.',
    skpmStandardCode: 'Std 3.1.2.2 / 3.1.4.1',
  },
  {
    bil: 28,
    pillar: 'KURIKULUM',
    kodMySG: 'JR12 [PKL]',
    jawatankuasaInduk: 'Jawatankuasa Pentaksiran Kompetensi dan Literasi (PKL)',
    jawatanRasmi: 'Penyelaras Pentaksiran Kompetensi dan Literasi (PKL)',
    tahapBeban: 'RINGAN (轻)',
    analisisBeban: 'Pelaksanaan ujian saringan digital berkala (Bacaan, Sains, Matematik, Kewangan)',
    cadanganPelaksana: 'Guru ICT / Guru Sains atau Matematik',
    perincianTugas: 'Menyediakan jadual sesi makmal/peranti bagi pentaksiran PKL murid Tahap 2 (literasi saintifik, matematik, bacaan & kewangan) dan memantau penyelesaian 100%.',
    sistemKPM: 'Portal PKL / DELIMa KPM',
    peringatanKritikal: 'Pastikan 100% murid sasaran Tahap 2 melengkapkan pentaksiran PKL dalam tetingkap rasmi KPM.',
    skpmStandardCode: 'Std 3.1.4.1',
  },
  {
    bil: 29,
    pillar: 'KURIKULUM',
    kodMySG: 'JR12 [SIVIK]',
    jawatankuasaInduk: 'Jawatankuasa Pendidikan Sivik Sekolah',
    jawatanRasmi: 'Penyelaras Pendidikan Sivik',
    tahapBeban: 'RINGAN (轻)',
    analisisBeban: 'Pelaksanaan 1 jam sivik setiap minggu ke-4 bulan dalam mata pelajaran teras',
    cadanganPelaksana: 'Guru BM / BI / PM / Sejarah',
    perincianTugas: 'Menyelaras 4 nilai teras Pendidikan Sivik (Kasih Sayang, Hormat-menghormati, Bertanggungjawab, Kegembiraan) dalam PdP & perhimpunan minggu ke-4 setiap bulan.',
    sistemKPM: 'Manual Pendidikan Sivik KPM / e-RPH',
    peringatanKritikal: 'Ingatkan guru teras memasukkan elemen Pendidikan Sivik (1 jam) pada minggu ke-4 setiap bulan serta muat naik evidens.',
    skpmStandardCode: 'Std 3.1.1.1 / 3.3.1',
  },
  {
    bil: 30,
    pillar: 'KURIKULUM',
    kodMySG: 'JR12 [PEMULIHAN]',
    jawatankuasaInduk: 'Jawatankuasa Pemulihan Khas & Program 3M',
    jawatanRasmi: 'Penyelaras Pemulihan Khas & Program 3M',
    tahapBeban: 'BERAT (重)',
    analisisBeban: 'Ujian IPP2M/IKAM, pengajaran berfokus & rekod profil 3M individu',
    cadanganPelaksana: 'Guru Pemulihan Khas (GPM)',
    perincianTugas: 'Menjalankan ujian diagnostik IPP2M/IKAM, mengajar murid pemulihan 3M (Membaca, Menulis, Mengira), menyelaras bilik pemulihan dan melaporkan status pelepasan murid.',
    sistemKPM: 'APDM Pemulihan / Data 3M KPM',
    peringatanKritikal: 'Laksanakan saringan & hantar data pencapaian 3M ke PPD pada bulan Mac, Jun & Oktober.',
    skpmStandardCode: 'Std 3.1.2.2',
  },
  {
    bil: 31,
    pillar: 'KURIKULUM',
    kodMySG: 'JR12 [PLC]',
    jawatankuasaInduk: 'Jawatankuasa Komuniti Pembelajaran Profesional (PLC)',
    jawatanRasmi: 'Penyelaras Komuniti Pembelajaran Profesional (PLC)',
    tahapBeban: 'SEDERHANA (中)',
    analisisBeban: 'Penyelarasan kitaran Lesson Study / Learning Walk & kredit SPLKPM',
    cadanganPelaksana: 'Guru Akademik Biasa / Ketua Panitia',
    perincianTugas: 'Merancang takwim PLC panitia (Lesson Study, Learning Walks, Peer Coaching, Teacher Sharing), mengumpul laporan OPR PLC dan mendaftarkan mata kredit dalam SPLKPM.',
    sistemKPM: 'SPLKPM / iSEPADU Academic OPR',
    peringatanKritikal: 'Pastikan setiap panitia melengkapkan minimum 2 kitaran PLC setahun & didaftarkan dalam SPLKPM.',
    skpmStandardCode: 'Std 2.1.2 / 4.1',
  },
  {
    bil: 32,
    pillar: 'KURIKULUM',
    kodMySG: 'JR12 [MBMMBI/HIP]',
    jawatankuasaInduk: 'Jawatankuasa Dasar MBMMBI, DLP & Program HIP',
    jawatanRasmi: 'Penyelaras DLP / MBMMBI / Highly Immersive Programme (HIP)',
    tahapBeban: 'RINGAN (轻)',
    analisisBeban: 'Penyelarasan sudut bahasa & pengisian skor tahap HIP 2x setahun',
    cadanganPelaksana: 'Guru Bahasa Melayu / Guru Bahasa Inggeris',
    perincianTugas: 'Menyelaras aktiviti persekitaran imersif Bahasa Inggeris (HIP) dan pengukuhan Bahasa Melayu (MBMMBI) serta menghantar instrumen penilaian kendiri HIP.',
    sistemKPM: 'Portal HIP JPN / MBMMBI',
    peringatanKritikal: 'Lengkapkan instrumen penilaian kendiri HIP Fasa 1 & Fasa 2 sebelum tarikh tutup JPN.',
    skpmStandardCode: 'Std 3.1.2.1',
  },
  {
    bil: 33,
    pillar: 'KURIKULUM',
    kodMySG: 'JR13 [PANITIA-BC]',
    jawatankuasaInduk: 'Panitia Mata Pelajaran Teras',
    jawatanRasmi: 'Ketua Panitia Bahasa Cina (BC)',
    tahapBeban: 'BERAT (重)',
    analisisBeban: 'Mata pelajaran teras SJKC berjam kredit tertinggi (10–12 waktu/kelas)',
    cadanganPelaksana: 'Guru Opsyen Bahasa Cina',
    perincianTugas: 'Mempengerusikan mesyuarat panitia 4x setahun, mengurus belanjawan PCG, analisis PBD/UASA BC, semakan kertas peperiksaan & intervensi literasi.',
    sistemKPM: 'idMe PBD / iSEPADU Akademik',
    peringatanKritikal: 'Serahkan pelan intervensi TP1–TP2 & minit mesyuarat panitia selewat-lewatnya 2 minggu selepas mesyuarat.',
    skpmStandardCode: 'Std 3.1.2.1 – 3.1.2.4',
  },
  {
    bil: 34,
    pillar: 'KURIKULUM',
    kodMySG: 'JR13 [PANITIA-BM]',
    jawatankuasaInduk: 'Panitia Mata Pelajaran Teras',
    jawatanRasmi: 'Ketua Panitia Bahasa Melayu (BM)',
    tahapBeban: 'BERAT (重)',
    analisisBeban: 'Subjek teras SJKC berfokus UASA/PBD, PLaN & Minggu Bahasa',
    cadanganPelaksana: 'Guru Opsyen Bahasa Melayu',
    perincianTugas: 'Menyelaras RPT/DSKP BM, mesyuarat panitia, semakan UASA/PBD, program peningkatan penguasaan BM SJKC serta kolaborasi bersama JK PLaN & Pemulihan.',
    sistemKPM: 'idMe PBD / PLaN / iSEPADU Akademik',
    peringatanKritikal: 'Pantau murid TP1–TP2 BM Tahap 1 & Tahap 2 selepas setiap pentaksiran pertengahan & akhir tahun.',
    skpmStandardCode: 'Std 3.1.2.1 – 3.1.2.4',
  },
  {
    bil: 35,
    pillar: 'KURIKULUM',
    kodMySG: 'JR13 [PANITIA-BI]',
    jawatankuasaInduk: 'Panitia Mata Pelajaran Teras',
    jawatanRasmi: 'Ketua Panitia Bahasa Inggeris (BI)',
    tahapBeban: 'BERAT (重)',
    analisisBeban: 'Penyelarasan CEFR, UASA BI, PBD & sokongan program HIP',
    cadanganPelaksana: 'Guru Opsyen Bahasa Inggeris',
    perincianTugas: 'Mengurus penjajaran kurikulum CEFR, pentaksiran kemahiran mendengar/bertutur/membaca/menulis, pelan intervensi BI dan pengurusan PCG panitia.',
    sistemKPM: 'idMe PBD / CEFR / HIP',
    peringatanKritikal: 'Pastikan penjajaran item UASA mengikut format CEFR & analisa pencapaian selepas setiap fasa pentaksiran.',
    skpmStandardCode: 'Std 3.1.2.1 – 3.1.2.4',
  },
  {
    bil: 36,
    pillar: 'KURIKULUM',
    kodMySG: 'JR13 [PANITIA-MT]',
    jawatankuasaInduk: 'Panitia Mata Pelajaran Teras',
    jawatanRasmi: 'Ketua Panitia Matematik (MT)',
    tahapBeban: 'BERAT (重)',
    analisisBeban: 'Subjek teras numerasi, semakan item KBAT/UASA & sokongan PLaN',
    cadanganPelaksana: 'Guru Opsyen Matematik',
    perincianTugas: 'Menyelaras RPT, bahan bantu mengajar numerasi, pembinaan JSU UASA Matematik, analisis item serta program penguasaan sifir & penyelesaian masalah.',
    sistemKPM: 'idMe PBD / PLaN / PKL',
    peringatanKritikal: 'Laksanakan semakan JSU & moderasi skrip jawapan Matematik sebelum kemasukan markah UASA.',
    skpmStandardCode: 'Std 3.1.2.1 – 3.1.2.4',
  },
  {
    bil: 37,
    pillar: 'KURIKULUM',
    kodMySG: 'JR13 [PANITIA-SN]',
    jawatankuasaInduk: 'Panitia Mata Pelajaran Teras & Sains',
    jawatanRasmi: 'Ketua Panitia Sains / Alam Sekitar (SN/AM)',
    tahapBeban: 'SEDERHANA (中)',
    analisisBeban: 'Pengurusan bilik sains, eksperimen amali & pentaksiran UASA SN',
    cadanganPelaksana: 'Guru Opsyen Sains',
    perincianTugas: 'Menyelaras pengajaran amali sains, keselamatan dan inventori Bilik Sains, program Minggu STEM serta pentaksiran Kemahiran Proses Sains.',
    sistemKPM: 'idMe PBD / Fail Bilik Sains',
    peringatanKritikal: 'Semak stok radas & keselamatan Bilik Sains awal tahun serta selaras jadual penggunaan makmal.',
    skpmStandardCode: 'Std 3.1.2.1 – 3.1.2.4',
  },
  {
    bil: 38,
    pillar: 'KURIKULUM',
    kodMySG: 'JR13 [PANITIA-SEJ/RBT]',
    jawatankuasaInduk: 'Panitia Mata Pelajaran Elektif & Teras Tahap 2',
    jawatanRasmi: 'Ketua Panitia Sejarah & Reka Bentuk dan Teknologi (SEJ & RBT)',
    tahapBeban: 'SEDERHANA (中)',
    analisisBeban: 'Subjek Tahap 2, projek amali bengkel RBT & kajian kes Sejarah',
    cadanganPelaksana: 'Guru Sejarah / Guru RBT',
    perincianTugas: 'Menyelaras tugasan projek RBT, penyelenggaraan alatan bengkel RBT, kajian kes Sejarah Tahap 2 serta pengurusan peruntukan PCG kedua-dua panitia.',
    sistemKPM: 'idMe PBD / Fail Bengkel RBT',
    peringatanKritikal: 'Pastikan SOP keselamatan bengkel RBT dipatuhi dan projek murid disiapkan sebelum pentaksiran akhir.',
    skpmStandardCode: 'Std 3.1.2.1 – 3.1.2.4',
  },
  {
    bil: 39,
    pillar: 'KURIKULUM',
    kodMySG: 'JR13 [PANITIA-PJPK]',
    jawatankuasaInduk: 'Panitia Mata Pelajaran Kesihatan & Jasmani',
    jawatanRasmi: 'Ketua Panitia Pendidikan Jasmani & Kesihatan (PJPK)',
    tahapBeban: 'SEDERHANA (中)',
    analisisBeban: 'Pelaksanaan ujian SEGAK Tahap 2 (Mac & Ogos) serta stor PJ',
    cadanganPelaksana: 'Guru Opsyen PJK',
    perincianTugas: 'Menyelaras ujian kecergasan SEGAK (Mac & Ogos) untuk murid Tahun 4–6, merekod BMI 5–9T dan mengemas kini data SEGAK dalam PAJSK.',
    sistemKPM: 'PAJSK SEGAK / idMe PBD',
    peringatanKritikal: 'Rekod skor SEGAK Fasa 1 (Mac) & Fasa 2 (Ogos) serta BMI dalam portal PAJSK sebelum tarikh tutup.',
    skpmStandardCode: 'Std 3.1.2.1 / 3.2.4',
  },
  {
    bil: 40,
    pillar: 'KURIKULUM',
    kodMySG: 'JR13 [PANITIA-PM]',
    jawatankuasaInduk: 'Panitia Nilai & Kerohanian',
    jawatanRasmi: 'Ketua Panitia Pendidikan Moral (PM)',
    tahapBeban: 'RINGAN (轻)',
    analisisBeban: 'Penyelarasan RPT, nilai sivik & pentaksiran PBD Pendidikan Moral',
    cadanganPelaksana: 'Guru Pendidikan Moral',
    perincianTugas: 'Menyelaras 14 nilai murni Pendidikan Moral, projek sahsiah murid, fail panitia serta perbelanjaan PCG Pendidikan Moral.',
    sistemKPM: 'idMe PBD',
    peringatanKritikal: 'Selaraskan penilaian sahsiah murid bersama Unit Disiplin/SSDM pada akhir penggal.',
    skpmStandardCode: 'Std 3.1.2.1',
  },
  {
    bil: 41,
    pillar: 'KURIKULUM',
    kodMySG: 'JR13 [PANITIA-KESENIAN]',
    jawatankuasaInduk: 'Panitia Kesenian & Muzik',
    jawatanRasmi: 'Ketua Panitia Pendidikan Kesenian (PSV & Muzik)',
    tahapBeban: 'RINGAN (轻)',
    analisisBeban: 'Pengurusan peralatan seni/muzik & pameran hasil karya murid',
    cadanganPelaksana: 'Guru PSV / Guru Muzik',
    perincianTugas: 'Menyelaras stok alatan muzik dan seni visual, pameran karya murid, persembahan majlis rasmi sekolah serta pentaksiran PBD PSV & Muzik.',
    sistemKPM: 'idMe PBD',
    peringatanKritikal: 'Kemaskini inventori alat muzik/seni & rancang perbelanjaan PCG sebelum Ogos.',
    skpmStandardCode: 'Std 3.1.2.1',
  },
  {
    bil: 42,
    pillar: 'KURIKULUM',
    kodMySG: 'JR14 [PEP & PBD]',
    jawatankuasaInduk: 'Jawatankuasa Peperiksaan & Pentaksiran (PBS/PBD)',
    jawatanRasmi: 'Setiausaha Peperiksaan Dalaman & PBD/PBS',
    tahapBeban: 'BERAT (重)',
    analisisBeban: 'Penjadualan PBD berterusan, analisis penggal & pengurusan idMe',
    cadanganPelaksana: 'Guru Data Peperiksaan / Guru Akademik',
    perincianTugas: 'Menyelaras takwim pentaksiran bilik darjah (PBD), memantau kemasukan TP semua subjek dalam idMe dan menyediakan analisis keseluruhan PBD.',
    sistemKPM: 'idMe KPM (Modul PBD) / iSEPADU',
    peringatanKritikal: 'Pastikan 100% guru melengkapkan pelaporan PBD Pertengahan Tahun & Akhir Sesi dalam idMe.',
    skpmStandardCode: 'Std 3.1.4.1',
  },
  {
    bil: 43,
    pillar: 'KURIKULUM',
    kodMySG: 'JR14 [UASA & 4P]',
    jawatankuasaInduk: 'Jawatankuasa Peperiksaan & Penjaminan Kualiti 4P',
    jawatanRasmi: 'Penyelaras UASA & Penjaminan Kualiti 4P',
    tahapBeban: 'BERAT (重)',
    analisisBeban: 'Penjadualan UASA Tahap 2, percetakan, JSU & semakan 4P',
    cadanganPelaksana: 'Setiausaha UASA / Ketua Penjaminan Kualiti',
    perincianTugas: 'Menyusun jadual UASA Tahap 2, menyelaras 4P (Pementoran, Pengesanan, Pemantauan, Penyelerasan) dan menjana slip keputusan murid.',
    sistemKPM: 'idMe UASA / Fail 4P Sekolah',
    peringatanKritikal: 'Lengkapkan laporan Penjaminan Kualiti 4P dan dialog prestasi selepas UASA selesai.',
    skpmStandardCode: 'Std 3.1.4.1',
  },
  {
    bil: 44,
    pillar: 'KURIKULUM',
    kodMySG: 'JR15 [PSS/NILAM]',
    jawatankuasaInduk: 'Jawatankuasa Pusat Sumber Sekolah (PSS) & NILAM',
    jawatanRasmi: 'Penyelaras PSS Lantikan Dalaman & Program NILAM',
    tahapBeban: 'BERAT (重)',
    analisisBeban: 'Pengurusan perpustakaan, pinjaman buku & rekod IQ-NILAM',
    cadanganPelaksana: 'Guru Perpustakaan dan Media (GPM) / Penyelaras PSS',
    perincianTugas: 'Mengurus operasi PSS, pengkatalogan buku, bilik tayangan, program galakan membaca serta pengisian dan pengesahan data IQ-NILAM sekolah.',
    sistemKPM: 'Sistem IQ-NILAM / iSEPADU PSS',
    peringatanKritikal: 'Kemas kini pengesahan bacaan NILAM setiap bulan & hantar pencapaian akhir IQ-NILAM pada Oktober.',
    skpmStandardCode: 'Std 2.6.2 / 3.1.2.1',
  },

  // =========================================================================
  // PILLAR 3: HAL EHWAL MURID (HEM) (JR16 - JR19 | 19 POSITIONS | 38 MATA BEBAN)
  // =========================================================================
  {
    bil: 45,
    pillar: 'HEM',
    kodMySG: 'JR16 [SU HEM]',
    jawatankuasaInduk: 'Jawatankuasa Pengurusan Hal Ehwal Murid (HEM)',
    jawatanRasmi: 'Setiausaha Hal Ehwal Murid (HEM)',
    tahapBeban: 'BERAT (重)',
    analisisBeban: 'Penyelarasan semua 18 unit HEM, minit mesyuarat & audit kes',
    cadanganPelaksana: 'Guru Akademik Senior',
    perincianTugas: 'Mengurus mesyuarat JK HEM (4x setahun), menyelaras pelaporan sub-unit HEM (Disiplin, RMT, SPBT, 3K, Bantuan) dan fail induk HEM.',
    sistemKPM: 'MOEIS / SKPM Std 3.3',
    peringatanKritikal: 'Adakan Mesyuarat JK HEM Bil. 1 pada minggu pertama persekolahan & semak fail semua unit HEM.',
    skpmStandardCode: 'Std 3.3.1.1',
  },
  {
    bil: 46,
    pillar: 'HEM',
    kodMySG: 'JR16 [GK-T1]',
    jawatankuasaInduk: 'Jawatankuasa Pengurusan Kelas & Kebajikan Murid',
    jawatanRasmi: 'Guru Kelas Tahun 1',
    tahapBeban: 'BERAT (重)',
    analisisBeban: 'Pengurusan awal persekolahan murid baharu, buku rekod, SPBT & APDM',
    cadanganPelaksana: 'Guru Bahasa / Teras Tahun 1',
    perincianTugas: 'Mengurus penyesuaian murid baharu Tahun 1, kehadiran harian MOEIS, semakan dokumen kelahiran/vaksinasi, agihan SPBT & yuran PIBG.',
    sistemKPM: 'MOEIS / APDM / idMe',
    peringatanKritikal: 'Tanda kehadiran MOEIS sebelum 08:30 pagi setiap hari & lengkapkan profail ibu bapa minggu pertama.',
    skpmStandardCode: 'Std 3.3.1.1',
  },
  {
    bil: 47,
    pillar: 'HEM',
    kodMySG: 'JR16 [GK-T2]',
    jawatankuasaInduk: 'Jawatankuasa Pengurusan Kelas & Kebajikan Murid',
    jawatanRasmi: 'Guru Kelas Tahun 2',
    tahapBeban: 'SEDERHANA (中)',
    analisisBeban: 'Pengurusan kehadiran harian, bilik darjah & pelaporan PBD',
    cadanganPelaksana: 'Guru Mata Pelajaran Tahun 2',
    perincianTugas: 'Merekod kehadiran murid dalam MOEIS, menyelaras keceriaan kelas, mengurus penyata PBD serta pemantauan sahsiah murid Tahun 2.',
    sistemKPM: 'MOEIS / APDM / idMe',
    peringatanKritikal: 'Tanda kehadiran sebelum 08:30 pagi & edarkan pelaporan PBD pertengahan/akhir tahun.',
    skpmStandardCode: 'Std 3.3.1.1',
  },
  {
    bil: 48,
    pillar: 'HEM',
    kodMySG: 'JR16 [GK-T3]',
    jawatankuasaInduk: 'Jawatankuasa Pengurusan Kelas & Kebajikan Murid',
    jawatanRasmi: 'Guru Kelas Tahun 3',
    tahapBeban: 'SEDERHANA (中)',
    analisisBeban: 'Pengurusan kehadiran harian, bilik darjah & pelaporan PBD',
    cadanganPelaksana: 'Guru Mata Pelajaran Tahun 3',
    perincianTugas: 'Merekod kehadiran murid dalam MOEIS, memastikan data bantuan/SPBT dikemas kini dan menyemak kemajuan murid Tahun 3.',
    sistemKPM: 'MOEIS / APDM / idMe',
    peringatanKritikal: 'Sahkan maklumat pendapatan ibu bapa dalam APDM sebelum agihan bantuan tahunan.',
    skpmStandardCode: 'Std 3.3.1.1',
  },
  {
    bil: 49,
    pillar: 'HEM',
    kodMySG: 'JR16 [GK-T4]',
    jawatankuasaInduk: 'Jawatankuasa Pengurusan Kelas & Kebajikan Murid',
    jawatanRasmi: 'Guru Kelas Tahun 4',
    tahapBeban: 'SEDERHANA (中)',
    analisisBeban: 'Pengurusan kelas peralihan ke Tahap 2, PAJSK & UASA',
    cadanganPelaksana: 'Guru Mata Pelajaran Tahun 4',
    perincianTugas: 'Merekod kehadiran MOEIS, membimbing murid Tahun 4 menyertai unit kokurikulum/PAJSK serta mengurus keceriaan dan disiplin kelas.',
    sistemKPM: 'MOEIS / PAJSK / idMe',
    peringatanKritikal: 'Pastikan semua murid Tahun 4 berdaftar dalam 3 unit kokurikulum sebelum Februari.',
    skpmStandardCode: 'Std 3.3.1.1',
  },
  {
    bil: 50,
    pillar: 'HEM',
    kodMySG: 'JR16 [GK-T5]',
    jawatankuasaInduk: 'Jawatankuasa Pengurusan Kelas & Kebajikan Murid',
    jawatanRasmi: 'Guru Kelas Tahun 5',
    tahapBeban: 'SEDERHANA (中)',
    analisisBeban: 'Pengurusan kehadiran harian, PAJSK, UASA & sahsiah Tahap 2',
    cadanganPelaksana: 'Guru Mata Pelajaran Tahun 5',
    perincianTugas: 'Mengurus kehadiran harian MOEIS, pelaporan PBD/UASA, semakan buku rekod kesihatan dan pencapaian kokurikulum murid Tahun 5.',
    sistemKPM: 'MOEIS / PAJSK / idMe',
    peringatanKritikal: 'Tutup analisis kehadiran bulanan kelas & semak kes ponteng melebihi 3 hari berturut-turut.',
    skpmStandardCode: 'Std 3.3.1.1',
  },
  {
    bil: 51,
    pillar: 'HEM',
    kodMySG: 'JR16 [GK-T6]',
    jawatankuasaInduk: 'Jawatankuasa Pengurusan Kelas & Kebajikan Murid',
    jawatanRasmi: 'Guru Kelas Tahun 6',
    tahapBeban: 'BERAT (重)',
    analisisBeban: 'Penempatan Tingkatan 1 (eDaftar Menengah), sijil berhenti & graduasi',
    cadanganPelaksana: 'Guru Senior Tahap 2',
    perincianTugas: 'Mengurus permohonan penempatan Tingkatan 1 (eDaftar Menengah), sijil berhenti sekolah, pengesahan rekod PAJSK/SEGAK/PBD dan majlis graduasi Tahun 6.',
    sistemKPM: 'MOEIS / eDaftar Menengah / PAJSK',
    peringatanKritikal: 'Selesaikan permohonan eDaftar Menengah & pengesahan sijil berhenti Tahun 6 mengikut tarikh PPD.',
    skpmStandardCode: 'Std 3.3.1.1',
  },
  {
    bil: 52,
    pillar: 'HEM',
    kodMySG: 'JR16 [BERTUGAS]',
    jawatankuasaInduk: 'Jawatankuasa Perhimpunan & Guru Bertugas Mingguan',
    jawatanRasmi: 'Penyelaras Guru Bertugas Mingguan',
    tahapBeban: 'RINGAN (轻)',
    analisisBeban: 'Menyusun jadual giliran mingguan & semakan buku laporan bertugas',
    cadanganPelaksana: 'Guru Akademik Biasa',
    perincianTugas: 'Menyediakan jadual giliran guru bertugas mingguan (pagi/rehat/pulang), format laporan perhimpunan mingguan dan pemantauan keselamatan pagar.',
    sistemKPM: 'Buku Laporan Guru Bertugas',
    peringatanKritikal: 'Edarkan jadual bertugas mingguan penggal baharu sebelum minggu pertama persekolahan.',
    skpmStandardCode: 'Std 3.3.4.1',
  },
  {
    bil: 53,
    pillar: 'HEM',
    kodMySG: 'JR17 [SPBT]',
    jawatankuasaInduk: 'Jawatankuasa Skim Pinjaman Buku Teks (SPBT)',
    jawatanRasmi: 'Penyelaras Skim Pinjaman Buku Teks (SPBT)',
    tahapBeban: 'BERAT (重)',
    analisisBeban: 'Pengurusan Bilik BOSS, pesanan eSPBT, pemulangan & agihan 100%',
    cadanganPelaksana: 'Guru Penyelaras SPBT',
    perincianTugas: 'Mengurus stok buku teks Bilik BOSS, pesanan BTBT460 dalam eSPBT, pengagihan awal tahun, pemeriksaan fizikal buku dan kutipan akhir tahun.',
    sistemKPM: 'eSPBT / SISTEM BOSS',
    peringatanKritikal: 'Selesaikan pesanan buku teks tahun hadapan (eSPBT) pada Mac–Mei & kutipan penuh sebelum cuti akhir tahun.',
    skpmStandardCode: 'Std 3.3.5.1',
  },
  {
    bil: 54,
    pillar: 'HEM',
    kodMySG: 'JR17 [RMT/SUSU]',
    jawatankuasaInduk: 'Jawatankuasa Rancangan Makanan Tambahan (RMT) & Program Susu',
    jawatanRasmi: 'Penyelaras Program Susu Sekolah (PSS) & RMT',
    tahapBeban: 'SEDERHANA (中)',
    analisisBeban: 'Pemantauan menu sarapan harian 07:00 pagi & tuntutan bil bulanan',
    cadanganPelaksana: 'Guru Akademik Biasa',
    perincianTugas: 'Mengenal pasti murid layak RMT (PGK), menyelia penyediaan makanan & agihan susu harian, memantau kebersihan serta menyediakan laporan tuntutan bulanan.',
    sistemKPM: 'APDM RMT / Fail RMT & Susu',
    peringatanKritikal: 'Pastikan senarai penerima RMT disahkan PK HEM minggu pertama & buku log pemantauan menu ditandatangani harian.',
    skpmStandardCode: 'Std 3.3.5.1',
  },
  {
    bil: 55,
    pillar: 'HEM',
    kodMySG: 'JR17 [BAP/KWAPM]',
    jawatankuasaInduk: 'Jawatankuasa Bantuan & Kebajikan Murid',
    jawatanRasmi: 'Penyelaras Bantuan Awal Persekolahan (BAP) & KWAPM',
    tahapBeban: 'RINGAN (轻)',
    analisisBeban: 'Agihan berfasa BAP, pengesahan KWAPM & Bantuan Kebajikan',
    cadanganPelaksana: 'Guru Akademik Biasa',
    perincianTugas: 'Menyemak kelayakan murid dalam sistem APB/e-Bantuan, menyelaras serahan wang BAP dan mengumpul borang akuan penerimaan ibu bapa.',
    sistemKPM: 'Sistem Aplikasi Pengurusan Bantuan (APB)',
    peringatanKritikal: 'Serahkan borang akuan penerimaan BAP yang lengkap ditandatangani dalam tempoh 14 hari selepas agihan.',
    skpmStandardCode: 'Std 3.3.5.1',
  },
  {
    bil: 56,
    pillar: 'HEM',
    kodMySG: 'JR17 [KANTIN]',
    jawatankuasaInduk: 'Jawatankuasa Pengurusan Kantin Sekolah',
    jawatanRasmi: 'Penyelaras Pengurusan & Kebersihan Kantin',
    tahapBeban: 'SEDERHANA (中)',
    analisisBeban: 'Pemeriksaan kendiri kantin harian (KKM) & semakan harga/kualiti',
    cadanganPelaksana: 'Guru Akademik Biasa',
    perincianTugas: 'Melaksanakan penilaian kendiri kebersihan kantin setiap hari, menyemak sijil pengendali makanan/vaksin tifoid dan menghantar laporan bulanan ke PKD/PPD.',
    sistemKPM: 'Sistem Penarafan Kendiri Kantin',
    peringatanKritikal: 'Hantar laporan bulanan kendiri kantin selewat-lewatnya 5 haribulan bulan berikutnya.',
    skpmStandardCode: 'Std 3.3.3.1',
  },
  {
    bil: 57,
    pillar: 'HEM',
    kodMySG: 'JR17 [PPDa]',
    jawatankuasaInduk: 'Jawatankuasa Pendidikan Pencegahan Dadah (PPDa)',
    jawatanRasmi: 'Penyelaras Pendidikan Pencegahan Dadah (PPDa)',
    tahapBeban: 'RINGAN (轻)',
    analisisBeban: 'Sudut PPDa, kempen kesedaran & Minggu Antidadah',
    cadanganPelaksana: 'Guru Akademik Biasa',
    perincianTugas: 'Mengurus sudut/lorong PPDa, menganjurkan Minggu Antidadah & ceramah kesedaran rokok/vape serta melengkapkan pelaporan PPDa.',
    sistemKPM: 'Sistem Pelaporan PPDa KPM',
    peringatanKritikal: 'Anjurkan kempen Minggu PPDa pada penggal pertama & hantar laporan bergambar ke PPD.',
    skpmStandardCode: 'Std 3.3.2.1',
  },
  {
    bil: 58,
    pillar: 'HEM',
    kodMySG: 'JR18 [DISIPLIN]',
    jawatankuasaInduk: 'Jawatankuasa Disiplin & Badan Pengawas Sekolah',
    jawatanRasmi: 'Ketua Guru Disiplin & Badan Pengawas',
    tahapBeban: 'SEDERHANA (中)',
    analisisBeban: 'Pemantauan sahsiah, latihan pengawas & mesyuarat lembaga disiplin',
    cadanganPelaksana: 'Guru Disiplin Lantikan Sekolah',
    perincianTugas: 'Mengurus pemilihan & watikah pelantikan pengawas sekolah, mengendalikan kes salah laku murid, kempen ponteng sifar dan peraturan sekolah.',
    sistemKPM: 'SSDM KPM',
    peringatanKritikal: 'Anjurkan Majlis Watikah Pelantikan Pengawas pada Januari/Februari & adakan perjumpaan bulanan pengawas.',
    skpmStandardCode: 'Std 3.3.2.1',
  },
  {
    bil: 59,
    pillar: 'HEM',
    kodMySG: 'JR18 [SSDM]',
    jawatankuasaInduk: 'Jawatankuasa Disiplin & Pembangunan Sahsiah',
    jawatanRasmi: 'Guru Data Sistem Sahsiah Diri Murid (SSDM)',
    tahapBeban: 'SEDERHANA (中)',
    analisisBeban: 'Perekodan amalan baik & kes disiplin dalam SSDM setiap minggu',
    cadanganPelaksana: 'Guru Penyelaras SSDM',
    perincianTugas: 'Memastikan semua guru merekod amalan baik murid dan kes salah laku dalam SSDM serta menjana laporan status sahsiah bulanan.',
    sistemKPM: 'SSDM 2.0 KPM',
    peringatanKritikal: 'Pastikan rekod Amalan Baik & status sifar salah laku berat disemak hujung setiap bulan.',
    skpmStandardCode: 'Std 3.3.2.1',
  },
  {
    bil: 60,
    pillar: 'HEM',
    kodMySG: 'JR19 [3K-01]',
    jawatankuasaInduk: 'Jawatankuasa Program Bersepadu Sekolah Sihat & 3K',
    jawatanRasmi: 'Penyelaras 3K-01 (Kebersihan, Keceriaan & Anti-Denggi)',
    tahapBeban: 'BERAT (重)',
    analisisBeban: 'Pemantauan denggi mingguan (KD2), gotong-royong & pertandingan kelas',
    cadanganPelaksana: 'Guru Penyelaras 3K',
    perincianTugas: 'Menyelia kebersihan tandas/persekitaran sekolah, penghantaran laporan pencegahan denggi mingguan/bulanan (KD2) dan pertandingan keceriaan kelas.',
    sistemKPM: 'e-Denggi / Laporan 3K KPM',
    peringatanKritikal: 'Lakukan pemeriksaan pembiakan nyamuk aedes setiap minggu & hantar laporan denggi sebelum hujung bulan.',
    skpmStandardCode: 'Std 3.3.3.1 / 3.3.4.1',
  },
  {
    bil: 61,
    pillar: 'HEM',
    kodMySG: 'JR19 [3K-02]',
    jawatankuasaInduk: 'Jawatankuasa Program Bersepadu Sekolah Sihat & 3K',
    jawatanRasmi: 'Penyelaras 3K-02 (Kesihatan & Rekod Kesihatan Murid)',
    tahapBeban: 'RINGAN (轻)',
    analisisBeban: 'Penyelarasan lawatan Klinik Pergigian/Kesihatan & Bilik Rawatan',
    cadanganPelaksana: 'Guru Akademik Biasa',
    perincianTugas: 'Mengurus jadual lawatan pasukan kesihatan/pergigian sekolah, menyelaras buku RKM dan memastikan kelengkapan peti pertolongan cemas sentiasa mencukupi.',
    sistemKPM: 'e-RKM / Fail Kesihatan',
    peringatanKritikal: 'Kemas kini kebenaran imunisasi ibu bapa sebelum tarikh lawatan pasukan kesihatan KKM.',
    skpmStandardCode: 'Std 3.3.3.1',
  },
  {
    bil: 62,
    pillar: 'HEM',
    kodMySG: 'JR19 [3K-03]',
    jawatankuasaInduk: 'Jawatankuasa Program Bersepadu Sekolah Sihat & 3K',
    jawatanRasmi: 'Penyelaras 3K-03 (Keselamatan & Latihan Kebakaran / Fire Drill)',
    tahapBeban: 'RINGAN (轻)',
    analisisBeban: 'Latihan kebakaran 2x setahun & audit keselamatan pagar/alat pemadam api',
    cadanganPelaksana: 'Guru Akademik Biasa',
    perincianTugas: 'Merancang pelan laluan kecemasan, menganjurkan latihan kebakaran (Fire Drill) sekurang-kurangnya 2 kali setahun dan menyemak tarikh luput alat pemadam api.',
    sistemKPM: 'SPKS (Sistem Penarafan Keselamatan Sekolah)',
    peringatanKritikal: 'Laksanakan Fire Drill Fasa 1 (Feb/Mac) & Fasa 2 (Ogos/Sep) serta kemas kini skor SPKS.',
    skpmStandardCode: 'Std 3.3.4.1',
  },
  {
    bil: 63,
    pillar: 'HEM',
    kodMySG: 'JR19 [GBLD/MINDA]',
    jawatankuasaInduk: 'Jawatankuasa Bimbingan, Kaunseling & Minda Sihat',
    jawatanRasmi: 'Guru Bimbingan Lantikan Dalaman (GBLD) & Minda Sihat',
    tahapBeban: 'SEDERHANA (中)',
    analisisBeban: 'Saringan Minda Sihat Tahap 2, kaunseling murid & Ziarah Cakna',
    cadanganPelaksana: 'Guru Bimbingan Lantikan Dalaman (GBLD)',
    perincianTugas: 'Mengendalikan saringan Minda Sihat (DASS/PHQ), sesi bimbingan murid bermasalah kehadiran/emosi, program Guru Penyayang dan Ziarah Cakna.',
    sistemKPM: 'Sistem e-Rekod Kaunseling / SePKM',
    peringatanKritikal: 'Lengkapkan saringan Minda Sihat Fasa 1 & Fasa 2 murid Tahun 5–6 serta rekod intervensi.',
    skpmStandardCode: 'Std 3.3.6.1',
  },

  // =========================================================================
  // PILLAR 4: KOKURIKULUM & KOAKADEMIK (JR21 - JR23 | 16 POSITIONS | 28 MATA BEBAN)
  // =========================================================================
  {
    bil: 64,
    pillar: 'KOKURIKULUM',
    kodMySG: 'JR21 [SU KOKO]',
    jawatankuasaInduk: 'Jawatankuasa Induk Kokurikulum Sekolah',
    jawatanRasmi: 'Setiausaha Kokurikulum Sekolah',
    tahapBeban: 'SEDERHANA (中)',
    analisisBeban: 'Penyelarasan takwim 12 perjumpaan, pendaftaran unit & minit mesyuarat',
    cadanganPelaksana: 'Guru Kanan / Guru Akademik Teliti',
    perincianTugas: 'Menyelaras takwim 12 kali perjumpaan mingguan unit beruniform/kelab/sukan, memantau rekod kehadiran kokurikulum, fail induk dan laporan tahunan.',
    sistemKPM: 'PAJSK / iSEPADU Kokurikulum',
    peringatanKritikal: 'Pastikan pendaftaran keahlian murid Tahun 4–6 dalam semua 3 bidang kokurikulum selesai sebelum Februari.',
    skpmStandardCode: 'Std 3.2.1.1',
  },
  {
    bil: 65,
    pillar: 'KOKURIKULUM',
    kodMySG: 'JR21 [UNIFORM]',
    jawatankuasaInduk: 'Jawatankuasa Unit Badan Beruniform',
    jawatanRasmi: 'Penyelaras Unit Badan Beruniform',
    tahapBeban: 'RINGAN (轻)',
    analisisBeban: 'Penyelarasan aktiviti TKRS / Pengakap / BSMM & perkhemahan tahunan',
    cadanganPelaksana: 'Guru Penasihat Senior',
    perincianTugas: 'Menyelaras laporan 12 kali perjumpaan setiap unit beruniform, buku log kurikulum beruniform dan perkhemahan perdana peringkat sekolah.',
    sistemKPM: 'PAJSK / iSEPADU Smart OPR',
    peringatanKritikal: 'Selaraskan tarikh Perkhemahan Tahunan Unit Beruniform & pastikan 12 perjumpaan lengkap sebelum Oktober.',
    skpmStandardCode: 'Std 3.2.3.1',
  },
  {
    bil: 66,
    pillar: 'KOKURIKULUM',
    kodMySG: 'JR21 [KELAB]',
    jawatankuasaInduk: 'Jawatankuasa Unit Kelab dan Persatuan',
    jawatanRasmi: 'Penyelaras Unit Kelab dan Persatuan',
    tahapBeban: 'RINGAN (轻)',
    analisisBeban: 'Penyelarasan persatuan bahasa, STEM, alam sekitar & rekod mingguan',
    cadanganPelaksana: 'Guru Penasihat Kelab',
    perincianTugas: 'Memantau pelaksanaan aktiviti tahunan kelab/persatuan, penyediaan fail dan perancangan aktiviti interaktif sepanjang 12 kali perjumpaan.',
    sistemKPM: 'PAJSK / iSEPADU Smart OPR',
    peringatanKritikal: 'Semak buku pelaporan kelab dan persatuan pada pertengahan dan akhir tahun.',
    skpmStandardCode: 'Std 3.2.2.1',
  },
  {
    bil: 67,
    pillar: 'KOKURIKULUM',
    kodMySG: 'JR21 [KOAKADEMIK-BC]',
    jawatankuasaInduk: 'Jawatankuasa Koakademik (Pertandingan Akademik)',
    jawatanRasmi: 'Penyelaras Koakademik Bahasa Cina (BC)',
    tahapBeban: 'SEDERHANA (中)',
    analisisBeban: 'Latihan peserta, pemilihan sekolah & penyertaan karnival BM/BC peringkat daerah',
    cadanganPelaksana: 'Guru Bahasa Cina / Jurulatih Koakademik',
    perincianTugas: 'Mengenal pasti bakat murid, melatih peserta syarahan, bercerita, kaligrafi dan deklamasi sajak BC serta menghantar laporan OPR & PAJSK pertandingan.',
    sistemKPM: 'PAJSK / iSEPADU Smart OPR',
    peringatanKritikal: 'Sediakan pasukan wakil sekolah 4 minggu sebelum Karnival Koakademik Bahasa Cina MSSD/Bahagian.',
    skpmStandardCode: 'Std 3.2.5.1 / 3.2.2.1',
  },
  {
    bil: 68,
    pillar: 'KOKURIKULUM',
    kodMySG: 'JR21 [KOAKADEMIK-BM]',
    jawatankuasaInduk: 'Jawatankuasa Koakademik (Pertandingan Akademik)',
    jawatanRasmi: 'Penyelaras Koakademik Bahasa Melayu (BM)',
    tahapBeban: 'SEDERHANA (中)',
    analisisBeban: 'Latihan pidato, bercerita, pantun & pertandingan perpaduan SJKC',
    cadanganPelaksana: 'Guru Bahasa Melayu / Jurulatih Koakademik',
    perincianTugas: 'Merancang saringan dalaman, melatih peserta pidato, bercerita, sahibba dan syair peringkat zon/daerah serta melengkapkan OPR pertandingan.',
    sistemKPM: 'PAJSK / iSEPADU Smart OPR',
    peringatanKritikal: 'Anjurkan saringan Koakademik BM peringkat sekolah sebelum takwim pertandingan PPD bermula.',
    skpmStandardCode: 'Std 3.2.5.1 / 3.2.2.1',
  },
  {
    bil: 69,
    pillar: 'KOKURIKULUM',
    kodMySG: 'JR21 [KOAKADEMIK-BI]',
    jawatankuasaInduk: 'Jawatankuasa Koakademik (Pertandingan Akademik)',
    jawatanRasmi: 'Penyelaras Koakademik Bahasa Inggeris (BI)',
    tahapBeban: 'SEDERHANA (中)',
    analisisBeban: 'Latihan storytelling, public speaking, scrabble & karnival BI daerah',
    cadanganPelaksana: 'Guru Bahasa Inggeris / Jurulatih Koakademik',
    perincianTugas: 'Melatih peserta pertandingan Storytelling, Public Speaking, Poetry Recitation & Action Song serta merekod penyertaan untuk pengiktirafan PAJSK.',
    sistemKPM: 'PAJSK / iSEPADU Smart OPR',
    peringatanKritikal: 'Mulakan latihan intensif BI sekurang-kurangnya 1 bulan sebelum Karnival Bahasa Inggeris Daerah.',
    skpmStandardCode: 'Std 3.2.5.1 / 3.2.2.1',
  },
  {
    bil: 70,
    pillar: 'KOKURIKULUM',
    kodMySG: 'JR21 [KOAKADEMIK-STEM]',
    jawatankuasaInduk: 'Jawatankuasa Koakademik (Pertandingan Akademik)',
    jawatanRasmi: 'Penyelaras Koakademik STEM (Sains, Teknologi & Matematik)',
    tahapBeban: 'SEDERHANA (中)',
    analisisBeban: 'Latihan reka cipta, roket air, robotik & kuiz STEM peringkat daerah/negeri',
    cadanganPelaksana: 'Guru Sains / Matematik / RBT',
    perincianTugas: 'Menyelaras penyertaan murid dalam Karnival STEM (Young Inventors, Roket Air, Kuiz Sains/Matematik, Coding) dan memohon peruntukan bahan projek.',
    sistemKPM: 'PAJSK / Portal STEM KPM / Smart OPR',
    peringatanKritikal: 'Daftarkan pasukan sekolah dalam portal Karnival STEM PPD/JPN sebelum tarikh tutup penyertaan.',
    skpmStandardCode: 'Std 3.2.5.1 / 3.2.2.1',
  },
  {
    bil: 71,
    pillar: 'KOKURIKULUM',
    kodMySG: 'JR21 [KOAKADEMIK-SENI]',
    jawatankuasaInduk: 'Jawatankuasa Koakademik (Pertandingan Akademik)',
    jawatanRasmi: 'Penyelaras Koakademik Kesenian & Kebudayaan',
    tahapBeban: 'SEDERHANA (中)',
    analisisBeban: 'Latihan tarian kebudayaan, koir, nyanyian solo & seni lukis daerah',
    cadanganPelaksana: 'Guru Muzik / PSV / Penasihat Kesenian',
    perincianTugas: 'Melatih pasukan kebudayaan, tarian, nyanyian, kaligrafi dan seni lukis untuk pertandingan PPD/JPN serta persembahan rasmi sekolah.',
    sistemKPM: 'PAJSK / iSEPADU Smart OPR',
    peringatanKritikal: 'Sediakan jadual latihan persembahan 6 minggu sebelum tarikh festival kesenian murid.',
    skpmStandardCode: 'Std 3.2.5.1 / 3.2.2.1',
  },
  {
    bil: 72,
    pillar: 'KOKURIKULUM',
    kodMySG: 'JR21 [1M1S]',
    jawatankuasaInduk: 'Jawatankuasa Sukan & Permainan (1M1S)',
    jawatanRasmi: 'Penyelaras Unit Sukan & Permainan 1M1S',
    tahapBeban: 'RINGAN (轻)',
    analisisBeban: 'Penyelarasan latihan mingguan 1 Murid 1 Sukan (Badminton/Bola Keranjang/dll)',
    cadanganPelaksana: 'Guru PJK / Guru Penasihat Sukan',
    perincianTugas: 'Menyelaras modul latihan 1M1S, memastikan setiap murid menyertai sekurang-kurangnya satu sukan dan memantau rekod kehadiran mingguan.',
    sistemKPM: 'PAJSK / iSEPADU Kokurikulum',
    peringatanKritikal: 'Semak keselamatan alatan gelanggang & jadual latihan 1M1S di awal setiap penggal.',
    skpmStandardCode: 'Std 3.2.4.1',
  },
  {
    bil: 73,
    pillar: 'KOKURIKULUM',
    kodMySG: 'JR21 [PENASIHAT]',
    jawatankuasaInduk: 'Jawatankuasa Pelaksana Unit Kokurikulum',
    jawatanRasmi: 'Ketua & Guru Penasihat Unit Kokurikulum',
    tahapBeban: 'SEDERHANA (中)',
    analisisBeban: 'Pengendalian perjumpaan mingguan Rabu & pengisian markah PAJSK ahli',
    cadanganPelaksana: 'Semua Guru Akademik Biasa',
    perincianTugas: 'Mengendalikan 12 kali perjumpaan mingguan unit masing-masing, mencatat kehadiran murid, membimbing AJK murid dan mengisi skor penyertaan PAJSK.',
    sistemKPM: 'PAJSK / iSEPADU Kehadiran Koko',
    peringatanKritikal: 'Rekod kehadiran murid setiap Rabu & sahkan jawatan AJK murid sebelum Mei.',
    skpmStandardCode: 'Std 3.2.2 – 3.2.4',
  },
  {
    bil: 74,
    pillar: 'KOKURIKULUM',
    kodMySG: 'JR21 [PAJSK]',
    jawatankuasaInduk: 'Jawatankuasa Pentaksiran Kokurikulum (PAJSK)',
    jawatanRasmi: 'Penyelaras Data Pentaksiran PAJSK (Tahun 4–6)',
    tahapBeban: 'SEDERHANA (中)',
    analisisBeban: 'Penyelarasan kemasukan skor Kokurikulum, Ekstra Kurikulum & SEGAK',
    cadanganPelaksana: 'Setiausaha Kokurikulum / Guru Data Koko',
    perincianTugas: 'Membuka akses kelas Tahun 4–6 dalam portal PAJSK, menyemak pengisian markah oleh guru penasihat & guru kelas dan menjana penyata PAJSK.',
    sistemKPM: 'Portal PAJSK KPM',
    peringatanKritikal: 'Pastikan 100% skor PAJSK Tahun 4–6 (termasuk Tahun 6 untuk eDaftar Menengah) disahkan sebelum November.',
    skpmStandardCode: 'Std 3.2.6.1',
  },
  {
    bil: 75,
    pillar: 'KOKURIKULUM',
    kodMySG: 'JR21 [RIMUP]',
    jawatankuasaInduk: 'Jawatankuasa RIMUP & Lawatan Sambil Belajar',
    jawatanRasmi: 'Penyelaras RIMUP & Lawatan Sambil Belajar',
    tahapBeban: 'RINGAN (轻)',
    analisisBeban: 'Program integrasi muhibah antara sekolah & permit lawatan murid',
    cadanganPelaksana: 'Guru Akademik Biasa',
    perincianTugas: 'Merancang aktiviti Rancangan Integrasi Murid Untuk Perpaduan (RIMUP) bersama sekolah rakan dan mengurus permohonan permit lawatan sambil belajar.',
    sistemKPM: 'Sistem Pengurusan Lawatan / RIMUP',
    peringatanKritikal: 'Hantar permohonan permit lawatan kepada PPD selewat-lewatnya 5 minggu sebelum tarikh bertolak.',
    skpmStandardCode: 'Std 3.2.1.1 / 2.7.1',
  },
  {
    bil: 76,
    pillar: 'KOKURIKULUM',
    kodMySG: 'JR22 [SU SUKAN]',
    jawatankuasaInduk: 'Jawatankuasa Majlis Sukan Sekolah (SuS)',
    jawatanRasmi: 'Setiausaha Sukan Sekolah (SuS) & Pengurus Stor Sukan',
    tahapBeban: 'SEDERHANA (中)',
    analisisBeban: 'Inventori stor sukan, padang & penyelarasan penyertaan kejohanan MSSD',
    cadanganPelaksana: 'Guru Opsyen PJK / Guru Sukan',
    perincianTugas: 'Mengurus inventori dan pinjaman alatan Stor Sukan, menyelaras penyediaan padang, jadual latihan pasukan sekolah dan pendaftaran kejohanan MSSD.',
    sistemKPM: 'Sistem MSSD / Fail Stor Sukan',
    peringatanKritikal: 'Lakukan audit stok peralatan sukan awal tahun dan selepas Kejohanan Sukan Tahunan.',
    skpmStandardCode: 'Std 3.2.4.1 / 3.2.5.1',
  },
  {
    bil: 77,
    pillar: 'KOKURIKULUM',
    kodMySG: 'JR22 [RUMAH SUKAN]',
    jawatankuasaInduk: 'Jawatankuasa Majlis Sukan Sekolah (SuS)',
    jawatanRasmi: 'Ketua Rumah Sukan (Merah, Biru, Kuning, Hijau)',
    tahapBeban: 'RINGAN (轻)',
    analisisBeban: 'Pengurusan ahli rumah, latihan sukan & pengumpulan mata merentas desa',
    cadanganPelaksana: 'Guru Penasihat Rumah Sukan',
    perincianTugas: 'Mengagihkan murid baharu mengikut rumah sukan, mengetuai latihan perbarisan/acara balapan dan mengurus kebajikan peserta rumah semasa kejohanan.',
    sistemKPM: 'Dalaman Sekolah',
    peringatanKritikal: 'Sediakan senarai peserta acara & maskot/khemah rumah 2 minggu sebelum Hari Sukan.',
    skpmStandardCode: 'Std 3.2.4.1',
  },
  {
    bil: 78,
    pillar: 'KOKURIKULUM',
    kodMySG: 'JR23 [MSSD/BAKAT]',
    jawatankuasaInduk: 'Jawatankuasa Pembangunan Bakat & Pasukan Sekolah',
    jawatanRasmi: 'Penyelaras Pembangunan Bakat & Jurulatih Pasukan Sekolah (MSSD)',
    tahapBeban: 'SEDERHANA (中)',
    analisisBeban: 'Latihan berjadual pasukan elit sekolah (Olahraga, Ping Pong, Bola Keranjang, dll)',
    cadanganPelaksana: 'Jurulatih Pasukan Sekolah',
    perincianTugas: 'Mengurus pemilihan atlet elit sekolah, jadual latihan berfasa, surat kebenaran waris dan dokumentasi OPR penyertaan kejohanan MSSD/MSSB.',
    sistemKPM: 'PAJSK / iSEPADU Smart OPR',
    peringatanKritikal: 'Lengkapkan borang kebenaran waris, insurans & pendaftaran atlet MSSD 2 minggu sebelum kejohanan.',
    skpmStandardCode: 'Std 3.2.5.1',
  },
  {
    bil: 79,
    pillar: 'KOKURIKULUM',
    kodMySG: 'JR23 [SUKAN TAHUNAN]',
    jawatankuasaInduk: 'Jawatankuasa Kejohanan Sukan Tahunan, Merentas Desa & Sukantara',
    jawatanRasmi: 'Penyelaras Kejohanan Sukan Tahunan, Merentas Desa & Sukantara',
    tahapBeban: 'BERAT (重)',
    analisisBeban: 'Penganjuran acara mega seluruh sekolah melibatkan warga, PIBG & hadiah',
    cadanganPelaksana: 'Setiausaha Sukan / Guru PJK / Pengurus Acara',
    perincianTugas: 'Merancang kertas kerja, jadual saringan Sukantara, laluan keselamatan Merentas Desa, tempahan pingat/khemah dan penyelarasan hari Kejohanan Sukan Tahunan.',
    sistemKPM: 'e-Sukan Sekolah / iSEPADU Smart OPR',
    peringatanKritikal: 'Bentangkan kertas kerja & bajet Kejohanan Sukan Tahunan 6 minggu sebelum tarikh kejohanan.',
    skpmStandardCode: 'Std 3.2.4.1 / 3.2.5.1',
  },
]);

export function getPillarSummaries(items: MySGJawatankuasaItem[]): MySGPillarSummary[] {
  const pillars: MySGPillar[] = ['PENTADBIRAN', 'KURIKULUM', 'HEM', 'KOKURIKULUM'];
  return pillars.map((pillar) => {
    const group = items.filter((i) => i.pillar === pillar);
    return {
      pillar,
      label: PILLAR_DISPLAY_META[pillar].label,
      totalPositions: group.length,
      totalMata: group.reduce((sum, item) => sum + (Number(item.mataBeban) || 0), 0),
      assignedCount: group.filter((i) => Boolean(i.assignedTeacherId || i.assignedTeacherName)).length,
    };
  });
}

export function getSubCommitteeGroups(items: MySGJawatankuasaItem[], pillar: MySGPillar | 'ALL'): string[] {
  const scoped = pillar === 'ALL' ? items : items.filter((i) => i.pillar === pillar);
  const set = new Set<string>();
  scoped.forEach((item) => {
    if (item.jawatankuasaInduk) set.add(item.jawatankuasaInduk);
  });
  return Array.from(set);
}

export function computeTeacherWorkloadRadar(
  items: MySGJawatankuasaItem[],
  teachers: Array<{ id: string; name: string; category?: string; position?: string; teachingStatus?: string }>
): TeacherWorkloadRadarEntry[] {
  const activeTeachers = teachers.filter((t) => !t.teachingStatus || t.teachingStatus === 'Aktif');
  const map = new Map<string, TeacherWorkloadRadarEntry>();

  activeTeachers.forEach((t) => {
    map.set(t.id, {
      teacherId: t.id,
      teacherName: t.name,
      category: t.category || t.position || 'GURU',
      positionCount: 0,
      totalMata: 0,
      status: 'KURANG',
      positions: [],
    });
  });

  items.forEach((item) => {
    if (!item.assignedTeacherId && !item.assignedTeacherName) return;
    let entry = item.assignedTeacherId ? map.get(item.assignedTeacherId) : undefined;
    if (!entry && item.assignedTeacherName) {
      const normalizedTarget = item.assignedTeacherName.trim().toUpperCase();
      for (const candidate of map.values()) {
        if (candidate.teacherName.trim().toUpperCase() === normalizedTarget) {
          entry = candidate;
          break;
        }
      }
    }
    if (!entry) {
      const syntheticId = item.assignedTeacherId || `ext_${item.assignedTeacherName.trim().toUpperCase()}`;
      entry = map.get(syntheticId) || {
        teacherId: syntheticId,
        teacherName: item.assignedTeacherName || item.assignedTeacherId,
        category: 'GURU',
        positionCount: 0,
        totalMata: 0,
        status: 'KURANG',
        positions: [],
      };
      map.set(syntheticId, entry);
    }

    entry.positionCount += 1;
    entry.totalMata += Number(item.mataBeban) || 0;
    entry.positions.push(item);
  });

  const results = Array.from(map.values()).map((entry) => {
    const status: TeacherWorkloadRadarEntry['status'] =
      entry.totalMata > 12 ? 'BERAT' : entry.totalMata >= 10 ? 'OPTIMUM' : 'KURANG';
    return { ...entry, status };
  });

  results.sort((a, b) => b.totalMata - a.totalMata || a.teacherName.localeCompare(b.teacherName));
  return results;
}

export function exportMySGWorkbook(
  items: MySGJawatankuasaItem[],
  teachers: Array<{ id: string; name: string; category?: string; position?: string; teachingStatus?: string }>,
  schoolName: string,
  schoolCode: string,
  academicYear: string
) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Master 12-Column Matrix + Assignment
  const masterRows = items.map((item) => ({
    Bil: item.bil,
    Teras: item.pillar,
    'Kod MySG': item.kodMySG,
    'Jawatankuasa Induk': item.jawatankuasaInduk,
    'Jawatan Rasmi (Surat Lantikan)': item.jawatanRasmi,
    'Tahap Beban': item.tahapBeban,
    'Mata Beban': item.mataBeban,
    'Analisis Beban': item.analisisBeban,
    'Cadangan Pelaksana': item.cadanganPelaksana,
    'Perincian Tugas': item.perincianTugas,
    'Sistem KPM Berkaitan': item.sistemKPM,
    'Peringatan Kritikal & Takwim': item.peringatanKritikal,
    'Kod Standard SKPM': item.skpmStandardCode,
    'Guru Dilantik': item.assignedTeacherName || '(Belum Dilantik)',
  }));

  const wsMaster = XLSX.utils.json_to_sheet(masterRows);
  wsMaster['!cols'] = [
    { wch: 5 },
    { wch: 15 },
    { wch: 24 },
    { wch: 36 },
    { wch: 42 },
    { wch: 16 },
    { wch: 11 },
    { wch: 36 },
    { wch: 28 },
    { wch: 48 },
    { wch: 26 },
    { wch: 46 },
    { wch: 18 },
    { wch: 32 },
  ];
  XLSX.utils.book_append_sheet(wb, wsMaster, 'Induk_MySG_v5');

  // Sheet 2: Radar Keseimbangan Mata Beban Guru
  const radar = computeTeacherWorkloadRadar(items, teachers);
  const radarRows = radar.map((r, idx) => ({
    Bil: idx + 1,
    'Nama Guru': r.teacherName,
    Kategori: r.category,
    'Bilangan Jawatan': r.positionCount,
    'Jumlah Mata Beban': r.totalMata,
    'Status Keseimbangan (Sasaran 10-12)': r.status,
    'Senarai Jawatan Rasmi': r.positions.map((p) => `${p.kodMySG} - ${p.jawatanRasmi} (${p.mataBeban})`).join(' | '),
  }));
  const wsRadar = XLSX.utils.json_to_sheet(radarRows);
  wsRadar['!cols'] = [{ wch: 5 }, { wch: 32 }, { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 28 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, wsRadar, 'Radar_Beban_Guru');

  // Sheet 3: Ringkasan Teras & Meta
  const summaries = getPillarSummaries(items);
  const summaryRows = [
    { Perkara: 'Sekolah', Nilai: `${schoolName} (${schoolCode})` },
    { Perkara: 'Sesi Akademik', Nilai: academicYear },
    { Perkara: 'Jumlah Keseluruhan Jawatan', Nilai: items.length },
    { Perkara: 'Jumlah Keseluruhan Mata Beban', Nilai: items.reduce((s, i) => s + i.mataBeban, 0) },
    ...summaries.map((s) => ({
      Perkara: s.label,
      Nilai: `${s.totalPositions} Jawatan | ${s.totalMata} Mata | ${s.assignedCount} Dilantik`,
    })),
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 36 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan_v5');

  XLSX.writeFile(wb, `iSEPADU_MySG_Jawatankuasa_Tugas_Dan_Peringatan-v5.xlsx`);
}

export function parseMySGWorkbookImport(
  buffer: ArrayBuffer,
  currentItems: MySGJawatankuasaItem[],
  teachers: Array<{ id: string; name: string }>
): { updatedItems: MySGJawatankuasaItem[]; matchedCount: number; assignedCount: number } {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetNames = wb.SheetNames;
  if (sheetNames.length === 0) {
    throw new Error('Fail Excel tiada helaian data.');
  }

  const teacherByName = new Map<string, { id: string; name: string }>();
  teachers.forEach((t) => {
    teacherByName.set(t.name.trim().toUpperCase(), t);
  });

  const importedRows: Record<string, any>[] = [];
  sheetNames.forEach((name) => {
    const upper = name.toUpperCase();
    if (upper.includes('RADAR') || upper.includes('RINGKASAN') || upper.includes('SUMMARY')) return;
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[name], { defval: '' });
    importedRows.push(...rows);
  });

  const nextItems = currentItems.map((item) => ({ ...item }));
  let matchedCount = 0;
  let assignedCount = 0;

  const findTargetIndex = (row: Record<string, any>): number => {
    const rawCode = String(row['Kod MySG'] || row['kodMySG'] || row['KOD'] || '').trim().toUpperCase();
    const rawJawatan = String(
      row['Jawatan Rasmi (Surat Lantikan)'] || row['Jawatan Rasmi'] || row['jawatanRasmi'] || ''
    )
      .trim()
      .toUpperCase();
    const rawBil = Number(row['Bil'] || row['bil'] || 0);

    if (rawCode) {
      const idx = nextItems.findIndex((x) => x.kodMySG.toUpperCase() === rawCode);
      if (idx >= 0) return idx;
    }
    if (rawJawatan) {
      const idx = nextItems.findIndex((x) => x.jawatanRasmi.toUpperCase() === rawJawatan);
      if (idx >= 0) return idx;
    }
    if (rawBil > 0) {
      const idx = nextItems.findIndex((x) => x.bil === rawBil);
      if (idx >= 0) return idx;
    }
    return -1;
  };

  importedRows.forEach((row) => {
    const idx = findTargetIndex(row);
    if (idx < 0) return;

    matchedCount += 1;
    const target = nextItems[idx];

    const rawTahap = row['Tahap Beban'] || row['tahapBeban'];
    if (rawTahap) {
      const normalized = normalizeTahapBeban(rawTahap);
      target.tahapBeban = normalized;
      target.mataBeban = computeMataBeban(normalized);
    }

    const rawTeacher = String(
      row['Guru Dilantik'] || row['assignedTeacherName'] || row['Nama Guru'] || ''
    ).trim();
    if (rawTeacher && !rawTeacher.includes('BELUM DILANTIK')) {
      const upperName = rawTeacher.toUpperCase();
      const matchedTeacher = teacherByName.get(upperName);
      if (matchedTeacher) {
        target.assignedTeacherId = matchedTeacher.id;
        target.assignedTeacherName = matchedTeacher.name;
      } else {
        // Partial match fallback
        const partial = teachers.find(
          (t) => t.name.toUpperCase().includes(upperName) || upperName.includes(t.name.toUpperCase())
        );
        target.assignedTeacherId = partial?.id || '';
        target.assignedTeacherName = partial?.name || upperName;
      }
      assignedCount += 1;
    }

    const rawPeringatan = String(row['Peringatan Kritikal & Takwim'] || row['peringatanKritikal'] || '').trim();
    if (rawPeringatan) target.peringatanKritikal = rawPeringatan;

    const rawPerincian = String(row['Perincian Tugas'] || row['perincianTugas'] || '').trim();
    if (rawPerincian) target.perincianTugas = rawPerincian;
  });

  return { updatedItems: nextItems, matchedCount, assignedCount };
}
