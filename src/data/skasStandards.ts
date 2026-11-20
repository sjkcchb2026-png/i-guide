export type SkasStandardGroupKey =
  | 'Std 1'
  | 'Std 2'
  | 'Std 3.1'
  | 'Std 3.2'
  | 'Std 3.3'
  | 'Std 4'
  | 'Std 5';

export interface SkasSubStandard {
  code: string;
  standardGroup: SkasStandardGroupKey;
  titleMs: string;
  descZh: string;
  dropdownLabel: string;
  subStandardFolderName: string;
  kualitiStatement: string;
  suggestedEvidens: string[];
}

export interface SkasStandardGroup {
  standardGroup: SkasStandardGroupKey;
  shortLabel: string;
  standardFullTitle: string;
  standardTitleZh: string;
  dropdownGroupLabel: string;
  standardFolderName: string;
  defaultSubStandardCode: string;
  subStandards: SkasSubStandard[];
}

const makeSub = (
  standardGroup: SkasStandardGroupKey,
  code: string,
  titleMs: string,
  descZh: string,
  kualitiStatement: string,
  suggestedEvidens: string[]
): SkasSubStandard => ({
  code,
  standardGroup,
  titleMs,
  descZh,
  dropdownLabel: `${code} — ${titleMs}（${descZh}）`,
  subStandardFolderName: `${code} - ${titleMs}`,
  kualitiStatement,
  suggestedEvidens,
});

export const SKAS_STANDARDS_DICTIONARY: SkasStandardGroup[] = [
  {
    standardGroup: 'Std 1',
    shortLabel: 'Std 1',
    standardFullTitle: 'STANDARD 1: KEPEMIMPINAN',
    standardTitleZh: '领导力与学校方向管理',
    dropdownGroupLabel: 'Std 1 — Standard 1: Kepemimpinan（领导力与行政决策）',
    standardFolderName: 'Standard 1 - Kepemimpinan',
    defaultSubStandardCode: '1.1.1',
    subStandards: [
      makeSub(
        'Std 1',
        '1.1.1',
        'PGB menetapkan hala tuju sekolah secara terancang',
        '制定学校发展方向',
        'PGB menetapkan hala tuju sekolah secara terancang berasaskan analisis konteks, SWOT dan KPI sekolah.',
        [
          'Dokumen Analisis SWOT / Konteks Sekolah & Penetapan KPI Tahunan',
          'Minit Mesyuarat Pengurusan Tertinggi / Mesyuarat Guru Pertama',
          'OPR Taklimat Hala Tuju, Visi & Misi Sekolah Sesi 2026',
        ]
      ),
      makeSub(
        'Std 1',
        '1.1.2',
        'PGB mengetuai penyediaan Rancangan Pemajuan Sekolah',
        '领导制定学校发展计划 PSO',
        'PGB mengetuai penyediaan Rancangan Pemajuan Sekolah (RPS / Pelan Strategik Organisasi) secara menyeluruh.',
        [
          'Dokumen Pelan Strategik Organisasi (PSO) / Pelan Taktikal & Operasi (OPPM)',
          'Minit Mesyuarat Jawatankuasa Perancangan Strategik Sekolah',
          'OPR Bengkel Penyediaan & Semakan Rancangan Pemajuan Sekolah (RPS)',
        ]
      ),
      makeSub(
        'Std 1',
        '1.1.3',
        'PGB mengetuai pemantauan pengoperasian sekolah',
        '领导监督学校运营',
        'PGB mengetuai pemantauan pengoperasian semua bidang sekolah secara terancang dan berterusan.',
        [
          'Jadual & Instrumen Pemantauan Pengoperasian Sekolah (Kurikulum / HEM / Kokurikulum)',
          'Laporan Dapatan Pemantauan & Tindakan Susulan PGB',
          'OPR Sesi Pemantauan & Semakan Pengoperasian Sekolah',
        ]
      ),
      makeSub(
        'Std 1',
        '1.1.4',
        'PGB menerajui aktiviti instruksional dalam pelaksanaan PdP',
        '领导教学执行',
        'PGB menerajui aktiviti instruksional dalam pelaksanaan PdP secara profesional dan berfokus.',
        [
          'Rekod Pelaksanaan PdP PGB &Jadual Waktu Mengajar PGB',
          'Semakan Rekod Persediaan Mengajar (RPH / e-RPH) oleh PGB',
          'OPR Program Kepimpinan Instruksional & Pemantapan PdP',
        ]
      ),
      makeSub(
        'Std 1',
        '1.1.5',
        'PGB menerajui aktiviti instruksional dalam pelaksanaan pencerapan PdP',
        '领导课堂视导',
        'PGB menerajui pelaksanaan pencerapan PdP guru berasaskan Standard 4 SKPM Kualiti@Sekolah.',
        [
          'Takwim & Jadual Pencerapan PdPc Guru (Fasa 1 & Fasa 2)',
          'Borang Skor & Analisis Pencerapan Standard 4 SKAS',
          'OPR Sesi Maklum Balas & Bimbingan Pencerapan PdPc',
        ]
      ),
      makeSub(
        'Std 1',
        '1.1.6',
        'PGB menerajui pemantauan kemajuan dan pencapaian murid',
        '监督学生进度与 Dialog Prestasi',
        'PGB menerajui pemantauan kemajuan dan pencapaian murid secara sistematik melalui Dialog Prestasi.',
        [
          'Laporan & Minit Dialog Prestasi Sekolah (PBD / Akademik / Sahsiah / Kehadiran)',
          'Analisis Data Pencapaian Murid & Pelan Intervensi berfokus',
          'OPR Pelaksanaan Dialog Prestasi Peringkat Sekolah',
        ]
      ),
      makeSub(
        'Std 1',
        '1.1.7',
        'PGB menangani masalah pengoperasian sekolah',
        '处理学校运营问题',
        'PGB menangani masalah dan isu pengoperasian sekolah dengan pantas, berhemah dan berkesan.',
        [
          'Rekod Tindakan Penyelesaian Isu / Risiko Pengoperasian Sekolah',
          'Minit Mesyuarat Khas / Tindakan Pembetulan & Pencegahan',
          'OPR Tindakan Penyelesaian Masalah & Penambahbaikan Pengoperasian',
        ]
      ),
      makeSub(
        'Std 1',
        '1.2.1',
        'PGB memberi bimbingan kepada guru dan AKP',
        '指导教师与行政人员',
        'PGB memberi bimbingan profesional kepada guru dan Anggota Kumpulan Pelaksana (AKP) secara berterusan.',
        [
          'Rekod Sesi Coaching & Mentoring / Bimbingan Profesional Guru & AKP',
          'Laporan Perkembangan Kompetensi Staf & Maklum Balas Bimbingan',
          'OPR Sesi Bimbingan & Profesionalisme Guru / AKP',
        ]
      ),
      makeSub(
        'Std 1',
        '1.2.2',
        'PGB memberi bimbingan kepada barisan pemimpin yang diturun kuasa',
        '指导副校长与中层主管',
        'PGB memberi bimbingan kepada Penolong Kanan dan Ketua Panitia/Penyelaras yang diturun kuasa.',
        [
          'Surat Penurunan Kuasa & Senarai Tugas Barisan Kepimpinan Pertengahan',
          'Minit Mesyuarat Pengurusan Pentadbiran (PGB bersama PK1, PK HEM, PK KK)',
          'OPR Sesi Coaching Kepimpinan Barisan Pentadbir & Ketua Unit',
        ]
      ),
      makeSub(
        'Std 1',
        '1.3.1',
        'PGB mendorong warga sekolah dengan menjadi suri teladan',
        '以身作则激励全校',
        'PGB mendorong warga sekolah dengan menjadi suri teladan secara profesional dan berintegriti.',
        [
          'Rekod Kehadiran & Penglibatan PGB dalam Program Rasmi Sekolah',
          'Perkongsian Ilmu / Amanat Profesional PGB dalam Perhimpunan & Mesyuarat',
          'OPR Program Pembudayaan Integriti & Etika Kerja Cemerlang',
        ]
      ),
      makeSub(
        'Std 1',
        '1.3.2',
        'PGB menggalakkan warga sekolah memberi input berkaitan pemajuan sekolah',
        '吸纳教职员建议',
        'PGB menyediakan saluran dan menggalakkan warga sekolah memberi pandangan untuk pemajuan sekolah.',
        [
          'Rekod Cadangan / Maklum Balas Guru & Staf dalam Mesyuarat Guru',
          'Analisis Soal Selidik / Sesi Libat Urus Warga Sekolah',
          'OPR Sesi Percambahan Minda & Libat Urus Pemajuan Sekolah',
        ]
      ),
      makeSub(
        'Std 1',
        '1.3.3',
        'PGB menggerakkan warga sekolah dalam melaksanakan tanggungjawab',
        '动员团队落实职责',
        'PGB menggerakkan warga sekolah dalam melaksanakan tanggungjawab secara kolaboratif dan berfokus.',
        [
          'Buku Pengurusan Sekolah & Carta Organisasi Jawatankuasa Tahunan',
          'Penghargaan / Pengiktirafan Prestasi Kerja Guru, AKP & Murid',
          'OPR Program Semarak Semangat Kerja Berpasukan & Apresiasi Warga Sekolah',
        ]
      ),
    ],
  },
  {
    standardGroup: 'Std 2',
    shortLabel: 'Std 2',
    standardFullTitle: 'STANDARD 2: PENGURUSAN ORGANISASI',
    standardTitleZh: '组织与资源管理',
    dropdownGroupLabel: 'Std 2 — Standard 2: Pengurusan Organisasi（行政组织、财务、资产与家协外联）',
    standardFolderName: 'Standard 2 - Pengurusan Organisasi',
    defaultSubStandardCode: '2.1.1',
    subStandards: [
      makeSub(
        'Std 2',
        '2.1.1',
        'Sumber manusia diurus secara sistematik dan terancang',
        '人力资源与职务分配管理',
        'Sumber manusia diurus secara sistematik, adil dan mengikut kepakaran serta keperluan sekolah.',
        [
          'Buku Pengurusan Sekolah & Surat Lantikan Rasmi Jawatankuasa 2026',
          'Minit Mesyuarat Pengurusan Staf & Agihan Tugas Tahunan',
          'OPR Taklimat Agihan Tugas & Penyerahan Surat Lantikan Rasmi',
        ]
      ),
      makeSub(
        'Std 2',
        '2.1.2',
        'Pembangunan sumber manusia diurus secara terancang',
        '教师培训 SPLKPM/LDP 管理',
        'Pembangunan profesionalisme berterusan (SPLKPM / LDP / PLC) diurus secara sistematik.',
        [
          'Analisis Keperluan Latihan (TNA) & Pelan Operasi Latihan (POL)',
          'Laporan & Rekod Kehadiran Kursus LDP / SPLKPM (Sasaran > 5 Hari / 42 Mata Kredit)',
          'OPR Kursus Dalaman / Bengkel Latihan Dalam Perkhidmatan (LDP)',
        ]
      ),
      makeSub(
        'Std 2',
        '2.2.1',
        'Aset alih dan aset tak alih diurus secara sistematik dan terancang',
        '学校固定资产与设施管理',
        'Aset alih dan aset tak alih kerajaan/sekolah diurus mengikut tatacara pengurusan aset yang berkuat kuasa.',
        [
          'Minit Mesyuarat JKPAK (Jawatankuasa Pengurusan Aset Kerajaan) & Daftar KEW.PA',
          'Laporan Pemeriksaan Aset, Penyelenggaraan & Pelupusan',
          'OPR Pemeriksaan Aset & Penyelenggaraan Fasiliti Sekolah',
        ]
      ),
      makeSub(
        'Std 2',
        '2.3.1',
        'Kewangan diurus secara sistematik dan terancang',
        '财务与拨款 PCG 管理',
        'Kewangan dan peruntukan bantuan persekolahan (PCG) diurus mengikut tatacara kewangan semasa.',
        [
          'Anggaran Belanja Mengurus (ABM) & Minit Mesyuarat JPKA (Kewangan & Akaun)',
          'Rekod Nota Minta, Pesanan Sekolah (LO) & Laporan Audit Kewangan',
          'OPR Mesyuarat Pengurusan Kewangan & Akaun Sekolah (JPKA)',
        ]
      ),
      makeSub(
        'Std 2',
        '2.4.1',
        'Sumber pendidikan diurus secara sistematik dan terancang',
        '教学资源、图书馆 PSS 与 ICT 管理',
        'Sumber pendidikan, Pusat Sumber Sekolah (PSS) dan kemudahan ICT/DELIMa diurus secara optimum.',
        [
          'Rekod Penggunaan PSS, Bahan Bantu Mengajar (BBM) & Makmal ICT / DELIMa',
          'Minit Mesyuarat Jawatankuasa Pusat Sumber Sekolah & Pengurusan ICT',
          'OPR Program Galakan Membaca NILAM / Literasi Digital & PSS',
        ]
      ),
      makeSub(
        'Std 2',
        '2.5.1',
        'Persekitaran fizikal diselenggara secara sistematik dan terancang',
        '校园物理环境、卫生与安全维护',
        'Persekitaran fizikal sekolah diselenggara supaya bersih, ceria, kondusif dan selamat.',
        [
          'Jadual & Laporan Pemantauan Kebersihan, Keceriaan dan Keselamatan (3K) Fizikal',
          'Rekod Gotong-Royong / Penambahbaikan Fizikal Bilik Darjah & Bilik Khas',
          'OPR Program Keceriaan, Penyelenggaraan & Gotong-Royong Perdana',
        ]
      ),
      makeSub(
        'Std 2',
        '2.5.2',
        'Suasana yang selesa dan harmoni diwujudkan secara terancang',
        '营造和谐校园氛围',
        'Suasana kerja dan pembelajaran yang harmoni, saling menghormati dan sejahtera diwujudkan.',
        [
          'Kertas Kerja & Laporan Sambutan Hari Guru / Hari Perayaan / Kebajikan Staf',
          'Aktiviti Kelab Kebajikan Guru dan Staf (KKGS)',
          'OPR Program Jalinan Ukhuwah, Kebajikan & Keharmonian Warga Sekolah',
        ]
      ),
      makeSub(
        'Std 2',
        '2.6.1',
        'Pemahaman dan penerimaan terhadap kepelbagaian masyarakat Malaysia diurus secara terancang',
        '多元文化与团结活动管理',
        'Program perpaduan dan penerimaan kepelbagaian budaya masyarakat Malaysia dilaksanakan secara terancang.',
        [
          'Laporan Program RIMUP / Sambutan Bulan Kebangsaan / Perayaan Muhibah',
          'Rekod Penglibatan Murid Pelbagai Kaum dalam Aktiviti Perpaduan',
          'OPR Sambutan Kemerdekaan / Program Perpaduan & Silang Budaya',
        ]
      ),
      makeSub(
        'Std 2',
        '2.7.1',
        'Permuafakatan strategik diusahakan secara profesional dan terancang',
        '家协 PIBG、董事会 LPS 与社区战略合作',
        'Permuafakatan strategik bersama PIBG, Lembaga Pengurus Sekolah (LPS), alumni dan agensi luar dijalin secara aktif.',
        [
          'Minit Mesyuarat Agung PIBG / Mesyuarat AJK PIBG & Lembaga Pengurus Sekolah (LPS)',
          'Rekod Program Kolaborasi Bersama PIBKS, Komuniti, NGO & Agensi Kerajaan (PDRM/KKM)',
          'OPR Program Sarana Ibu Bapa / PIBKS & Jalinan Strategik Komuniti',
        ]
      ),
    ],
  },
  {
    standardGroup: 'Std 3.1',
    shortLabel: 'Std 3.1',
    standardFullTitle: 'STANDARD 3.1: PENGURUSAN KURIKULUM',
    standardTitleZh: '学术与课程管理',
    dropdownGroupLabel: 'Std 3.1 — Standard 3.1: Pengurusan Kurikulum（课程委员会、各科教研组与 PBD 评估）',
    standardFolderName: 'Standard 3.1 - Pengurusan Kurikulum',
    defaultSubStandardCode: '3.1.2.1',
    subStandards: [
      makeSub(
        'Std 3.1',
        '3.1.1.1',
        'Pelaksanaan kurikulum diurus secara sistematik dan terancang',
        '学校课程委员会主管理',
        'Pelaksanaan kurikulum sekolah diurus secara sistematik melalui Jawatankuasa Kurikulum Sekolah (JKS).',
        [
          'Takwim Kurikulum & Minit Mesyuarat Jawatankuasa Kurikulum Sekolah (Bil. 1–4)',
          'Ketetapan Pelaksanaan Kurikulum, PBD & Dasar Panitia Mata Pelajaran',
          'OPR Mesyuarat Jawatankuasa Kurikulum Sekolah / Taklimat Dasar Kurikulum',
        ]
      ),
      makeSub(
        'Std 3.1',
        '3.1.2.1',
        'Pelaksanaan mata pelajaran diurus secara profesional dan terancang',
        '各科 Panitia 教学与大纲执行',
        'Panitia mata pelajaran mengurus pelaksanaan DSKP, RPT dan RPH serta aktiviti koakademik secara profesional.',
        [
          'Minit Mesyuarat Panitia Mata Pelajaran & Penyelarasan RPT / DSKP Semasa',
          'Kertas Kerja & Laporan Minggu Panitia / Kemahiran Akademik',
          'OPR Program Peningkatan Akademik & Aktiviti Panitia Mata Pelajaran',
        ]
      ),
      makeSub(
        'Std 3.1',
        '3.1.2.2',
        'Program peningkatan kualiti pengajaran guru diurus secara terancang',
        'PLC 教研与教学质量提升',
        'Program Komuniti Pembelajaran Profesional (PLC) dilaksanakan bagi meningkatkan kualiti PdPc guru.',
        [
          'Laporan Kitaran PLC (Lesson Study / Learning Walks / Peer Coaching / Teacher Sharing)',
          'Rekod Pendaftaran PLC dalam Portal SPLKPM & Bukti Bergambar',
          'OPR Sesi PLC / Bengkel Pemantapan Pedagogi Guru Panitia',
        ]
      ),
      makeSub(
        'Std 3.1',
        '3.1.2.3',
        'Program peningkatan pencapaian murid diurus secara profesional dan terancang',
        '学生学业提升与 Pemulihan 辅导计划',
        'Program intervensi, pengayaan dan pemulihan murid dilaksanakan berasaskan analisis tahap penguasaan murid.',
        [
          'Laporan Program Intervensi PBD (TP1–TP2), Pemulihan Khas & Pengayaan Akademik',
          'Senarai Murid Sasaran & Rekod Kemajuan Selepas Intervensi',
          'OPR Program Intervensi Akademik / Kem Literasi & Numerasi Murid',
        ]
      ),
      makeSub(
        'Std 3.1',
        '3.1.2.4',
        'Bantuan geran per kapita mata pelajaran dimanfaatkan secara sistematik dan terancang',
        '各科 PCG 经费有效运用',
        'Peruntukan Geran Per Kapita (PCG) mata pelajaran dirancang dan dibelanjakan secara berhemah untuk murid.',
        [
          'Anggaran Belanja Mengurus (ABM) PCG Panitia & Minit Perbincangan Perolehan',
          'Salinan Nota Minta, Rekod Penerimaan BBM & Daftar Inventori Panitia',
          'OPR Semakan Perbelanjaan PCG & Penggunaan Bahan Bantu Mengajar (BBM)',
        ]
      ),
      makeSub(
        'Std 3.1',
        '3.1.3.1',
        'Masa pelaksanaan PdP diurus secara sistematik dan terancang',
        '课程时间表与代课 MMI 管理',
        'Jadual waktu induk, jadual persendirian dan jadual guru ganti (MMI) diurus bagi melindungi masa instruksional.',
        [
          'Jadual Waktu Induk, Jadual Kelas & Jadual Waktu Persendirian Guru 2026',
          'Rekod Slip Guru Ganti (Relief) & Pelaksanaan Modul MMI (Melindungi Masa Instruksional)',
          'OPR Pengurusan Jadual Waktu & Pemantauan Pelaksanaan MMI',
        ]
      ),
      makeSub(
        'Std 3.1',
        '3.1.4.1',
        'Peperiksaan dan pentaksiran diurus secara sistematik dan terancang',
        '校本评估 PBD 与 UASA 考试管理',
        'Pentaksiran Bilik Darjah (PBD) dan Ujian Akhir Sesi Akademik (UASA) diurus secara telus dan berintegriti.',
        [
          'Jadual Kerja PBD / UASA & Minit Penjaminan Kualiti PBD (4P: Pementoran, Pemantauan, Pengesanan, Penyelarasan)',
          'Analisis Pelaporan Tahap Penguasaan (TP1–TP6) & Slip Pelaporan Murid',
          'OPR Moderasi / Penyelarasan Skor PBD & Dialog Prestasi Akademik',
        ]
      ),
    ],
  },
  {
    standardGroup: 'Std 3.2',
    shortLabel: 'Std 3.2',
    standardFullTitle: 'STANDARD 3.2: PENGURUSAN KOKURIKULUM',
    standardTitleZh: '课外活动与体育管理',
    dropdownGroupLabel: 'Std 3.2 — Standard 3.2: Pengurusan Kokurikulum（学会、制服团体、体育运动与 PAJSK）',
    standardFolderName: 'Standard 3.2 - Pengurusan Kokurikulum',
    defaultSubStandardCode: '3.2.1.1',
    subStandards: [
      makeSub(
        'Std 3.2',
        '3.2.1.1',
        'Pelaksanaan kokurikulum diurus secara sistematik dan terancang',
        '课外活动整体规划与委员会管理',
        'Pelaksanaan kokurikulum dirancang, diselaras dan dipantau secara sistematik melalui JK Kokurikulum.',
        [
          'Takwim Tahunan Kokurikulum & Minit Mesyuarat Jawatankuasa Kokurikulum (Bil. 1–4)',
          'Buku Panduan Pengurusan Kokurikulum & Pemantauan Aktiviti Mingguan',
          'OPR Mesyuarat Induk Kokurikulum / Hari Kemuncak & Apresiasi Kokurikulum',
        ]
      ),
      makeSub(
        'Std 3.2',
        '3.2.2.1',
        'Kelab/persatuan diurus secara sistematik dan terancang',
        '学会与学术社团管理',
        'Kelab dan Persatuan merancang serta melaksanakan aktiviti mingguan yang berfokuskan kemahiran dan bakat murid.',
        [
          'Pelan Taktikal, Takwim Mingguan & Rekod Kehadiran Murid Kelab/Persatuan',
          'Laporan Aktiviti Mingguan & Pertandingan Koakademik Kelab/Persatuan',
          'OPR Perjumpaan Mingguan / Projek Khas Kelab & Persatuan',
        ]
      ),
      makeSub(
        'Std 3.2',
        '3.2.3.1',
        'Badan beruniform diurus secara sistematik dan terancang',
        '制服团体管理',
        'Pasukan Badan Beruniform melaksanakan latihan kemahiran, ujian lencana dan perkhemahan secara terancang.',
        [
          'Pelan Aktiviti, Rekod Kehadiran & Rekod Pencapaian Ujian Lencana/Pangkat',
          'Kertas Kerja & Laporan Perkhemahan Tahunan / Kawad Kaki Badan Beruniform',
          'OPR Latihan Mingguan / Perkhemahan Pasukan Badan Beruniform',
        ]
      ),
      makeSub(
        'Std 3.2',
        '3.2.4.1',
        'Sukan/permainan diurus secara sistematik dan terancang',
        '球类与运动队日常管理',
        'Kelab Sukan dan Permainan melaksanakan latihan kemahiran asas, undang-undang permainan dan aplikasi taktikal.',
        [
          'Rancangan Tahunan, Rekod Kehadiran & Modul Latihan Kelab Sukan/Permainan (1M1S)',
          'Laporan Klinik Kemahiran & Pertandingan Dalaman Sukan/Permainan',
          'OPR Latihan Mingguan 1Murid 1Sukan (1M1S) Kelab Sukan & Permainan',
        ]
      ),
      makeSub(
        'Std 3.2',
        '3.2.5.1',
        'Program kecemerlangan kokurikulum diurus secara profesional dan terancang',
        '校队集训与对外竞赛卓越计划',
        'Program latihan intensif pasukan sekolah dirancang dan dilaksanakan bagi mencapai kecemerlangan pertandingan luar.',
        [
          'Jadual Latihan Intensif Pasukan Elit Sekolah & Senarai Atlet/Peserta',
          'Borang SPPK, Surat Kebenaran Ibu Bapa & Sijil Pencapaian (Daerah/Negeri/Kebangsaan)',
          'OPR Latihan Pusat & Penyertaan Pertandingan Kokurikulum / MSSD / MSSS',
        ]
      ),
      makeSub(
        'Std 3.2',
        '3.2.6.1',
        'Aktiviti Sukan Untuk Semua diurus secara profesional dan terancang',
        '全民运动：越野赛跑/达标运动会/常年运动会/班际赛',
        'Aktiviti Sukan Untuk Semua (Merentas Desa, Sukantara, Kejohanan Olahraga Tahunan & Hari Sukan Negara) dilaksanakan secara menyeluruh.',
        [
          'Kertas Kerja, Buku Program & Keputusan Rasmi Merentas Desa / Sukantara / Sukan Tahunan',
          'Rekod Penglibatan Semua Murid dalam Kejohanan & Hari Sukan Negara (HSN)',
          'OPR Kejohanan Olahraga Tahunan / Merentas Desa / Hari Sukan Negara',
        ]
      ),
      makeSub(
        'Std 3.2',
        '3.2.7.1',
        'Pentaksiran kokurikulum dilaksanakan secara sistematik dan terancang',
        'PAJSK 与 SEGAK 体能评估管理',
        'Pentaksiran Aktiviti Jasmani, Sukan dan Kokurikulum (PAJSK) serta ujian SEGAK dilaksanakan mengikut garis panduan KPM.',
        [
          'Jadual & Rekod Skor Ujian SEGAK (Penggal 1 & Penggal 2) serta BMI Murid',
          'Analisis & Pengesahan Markah PAJSK Murid Tahun 4, 5 dan 6',
          'OPR Pelaksanaan Ujian SEGAK & Penyelarasan Pentaksiran PAJSK',
        ]
      ),
    ],
  },
  {
    standardGroup: 'Std 3.3',
    shortLabel: 'Std 3.3',
    standardFullTitle: 'STANDARD 3.3: PENGURUSAN HAL EHWAL MURID',
    standardTitleZh: '学生事务管理 (HEM)',
    dropdownGroupLabel: 'Std 3.3 — Standard 3.3: Pengurusan Hal Ehwal Murid（纪律品德、3K 安全、援助金与辅导）',
    standardFolderName: 'Standard 3.3 - Pengurusan Hal Ehwal Murid',
    defaultSubStandardCode: '3.3.1.1',
    subStandards: [
      makeSub(
        'Std 3.3',
        '3.3.1.1',
        'Pelaksanaan hal ehwal murid diurus secara sistematik dan terancang',
        'HEM 学生事务委员会整体管理',
        'Pengurusan Hal Ehwal Murid dirancang, diselaras dan dipantau secara berkesan melalui JK Induk HEM.',
        [
          'Takwim Tahunan HEM & Minit Mesyuarat Jawatankuasa Induk HEM (Bil. 1–4)',
          'Analisis Kehadiran Bulanan APDM & Pelan Tindakan Sifar Ponteng',
          'OPR Mesyuarat Induk HEM / Kempen Galakan Kehadiran Penuh Murid',
        ]
      ),
      makeSub(
        'Std 3.3',
        '3.3.2.1',
        'Disiplin murid diurus secara profesional dan terancang',
        '学生纪律、品德与 SSDM 管理',
        'Disiplin dan sahsiah murid dipupuk serta dipantau melalui penguatkuasaan peraturan dan perekodan SSDM.',
        [
          'Analisis Data SSDM (Amalan Baik & Kes Salah Laku) serta Minit JK Disiplin & Pengawas',
          'Kertas Kerja Watikah Pelantikan Pengawas / Kem Kepimpinan Pemimpin Muda',
          'OPR Program Pemantapan Disiplin, Sahsiah Terpuji & Watikah Pengawas',
        ]
      ),
      makeSub(
        'Std 3.3',
        '3.3.3.1',
        'Keselamatan murid diurus secara sistematik dan terancang',
        '校园安全、防灾演习与 3K 安全管理',
        'Keselamatan murid di sekolah pergi dan balik serta kesiapsiagaan menghadapi kecemasan diurus secara rapi.',
        [
          'Pelan Laluan Kecemasan & Laporan Latihan Kawad Kebakaran / Pengungsian Bangunan',
          'Audit Keselamatan Fizikal Sekolah & Rekod Pemantauan Penjaga / Pengawal Keselamatan',
          'OPR Latihan Kawad Kebakaran & Taklimat Keselamatan Jalan Raya / Sekolah Selamat',
        ]
      ),
      makeSub(
        'Std 3.3',
        '3.3.4.1',
        'Program dan perkhidmatan kesihatan murid diurus secara sistematik dan terancang',
        '学生卫生、健康检查、食堂与防蚊管理',
        'Perkhidmatan kesihatan, pergigian, kebersihan kantin dan pencegahan denggi diurus secara berkala.',
        [
          'Rekod Rawatan Kesihatan/Pergigian KKM & Laporan Kendiri Kantin / Bebas Denggi',
          'Minit Mesyuarat JK Kesihatan & Kantin Sekolah',
          'OPR Program Pemeriksaan Kesihatan / Kempen Pemakanan Sihat & Pencegahan Aedes',
        ]
      ),
      makeSub(
        'Std 3.3',
        '3.3.5.1',
        'Bantuan pelajaran murid diurus secara sistematik dan terancang',
        '各类政府与社会助学金 RMT/KWAMP/BAP/SPBT 管理',
        'Bantuan persekolahan (RMT, PSS, KWAMP, BAP, SPBT & sumbangan NGO) diurus secara telus kepada murid layak.',
        [
          'Minit Mesyuarat Pemilihan Murid Layak Bantuan (RMT / KWAMP / BAP) & Borang PB1/PB2',
          'Jadual Pemantauan Menu RMT Harian & Pengurusan Buku Teks (SPBT)',
          'OPR Agihan Bantuan Awal Persekolahan (BAP) / Pemantauan RMT & Pengurusan SPBT',
        ]
      ),
      makeSub(
        'Std 3.3',
        '3.3.6.1',
        'Perkhidmatan bimbingan dan kaunseling diurus secara profesional dan terancang',
        '辅导与心理咨询服务、反霸凌/尊重教育',
        'Perkhidmatan bimbingan dan kaunseling serta program pembangunan sahsiah/anti-buli dilaksanakan secara profesional.',
        [
          'Rekod Sesi Bimbingan Individu/Kelompok & Laporan Program Guru Penyayang / Ziarah Cakna',
          'Laporan Kempen Anti-Buli, Gangguan Seksual & Sahsiah Diri Murid',
          'OPR Program Guru Penyayang / Kempen Hentikan Buli & Kesejahteraan Emosi Murid',
        ]
      ),
      makeSub(
        'Std 3.3',
        '3.3.6.2',
        'Pentaksiran psikometrik dilaksanakan secara sistematik dan terancang',
        '心理测评 IPPK 管理',
        'Pentaksiran Psikometrik (IPPK) ditadbir, dianalisis dan dimanfaatkan untuk intervensi perkembangan murid.',
        [
          'Jadual Pentadbiran & Analisis Skor Pentaksiran Psikometrik (IPPK) Tahun 4, 5 & 6',
          'Rekod Konsultasi & Intervensi Berdasarkan Profil Psikometrik Murid',
          'OPR Pelaksanaan Pentaksiran Psikometrik (IPPK) & Taklimat Profil Kerjaya/Sahsiah',
        ]
      ),
    ],
  },
  {
    standardGroup: 'Std 4',
    shortLabel: 'Std 4',
    standardFullTitle: 'STANDARD 4: PEMBELAJARAN DAN PEMUDAHCARAAN (PdPc)',
    standardTitleZh: '课堂教学与引导 (PdPc)',
    dropdownGroupLabel: 'Std 4 — Standard 4: Pembelajaran dan Pemudahcaraan（课堂教学设计、引导、激励与评估）',
    standardFolderName: 'Standard 4 - Pembelajaran dan Pemudahcaraan (PdPc)',
    defaultSubStandardCode: '4.1.1',
    subStandards: [
      makeSub(
        'Std 4',
        '4.1.1',
        'Guru merancang pelaksanaan PdPc secara profesional dan sistematik',
        '教师作为策划者：教案 RPH、学习目标与教学设计',
        'Guru bertindak sebagai perancang dengan menyediakan RPH yang mengandungi objektif, kriteria kejayaan dan aktiviti PAK21.',
        [
          'Rekod Persediaan Mengajar (e-RPH) Lengkap dengan Objektif (OP) & Kriteria Kejayaan (KK)',
          'Penyediaan Bahan Bantu Belajar (BBB) / Sumber Digital PdPc',
          'OPR Bengkel Pemantapan Penulisan RPH & Perancangan PdPc Abad Ke-21',
        ]
      ),
      makeSub(
        'Std 4',
        '4.2.1',
        'Guru mengawal proses pembelajaran secara profesional dan terancang',
        '教师作为管控者：管理课堂教学过程与时间',
        'Guru mengawal kandungan dan masa pembelajaran serta memberi peluang penyertaan aktif kepada murid.',
        [
          'Instrumen Pencerapan Standard 4 (Aspek 4.2.1 Kawalan Proses Pembelajaran)',
          'Rekod Pengurusan Aktiviti Kumpulan & Pembezaan Tugasan (Differentiated Learning)',
          'OPR Perkongsian Amalan Terbaik Pengurusan Proses Pembelajaran Bilik Darjah',
        ]
      ),
      makeSub(
        'Std 4',
        '4.2.2',
        'Guru mengawal suasana pembelajaran secara profesional dan terancang',
        '教师作为管控者：营造积极安全的课堂纪律与氛围',
        'Guru mengawal komunikasi dan perlakuan murid secara berhemah serta menyusun atur kedudukan murid secara kondusif.',
        [
          'Susun Atur Bilik Darjah PAK21, Parking Lot & Sudut Hasil Kerja Murid',
          'Rekod Pengurusan Tingkah Laku Positif dalam Bilik Darjah',
          'OPR Program Pengurusan Bilik Darjah Kondusif & Pembelajaran Abad Ke-21',
        ]
      ),
      makeSub(
        'Std 4',
        '4.3.1',
        'Guru membimbing murid secara profesional dan terancang',
        '教师作为引导者：辅导学生掌握知识、技能与价值观',
        'Guru memberi tunjuk ajar, panduan menguasai isi pelajaran dan kemahiran serta memandu murid membuat keputusan.',
        [
          'Contoh Lembaran Kerja Beraras (Scaffolding) & Modul Bimbingan Terfokus',
          'Bukti Bimbingan Individu/Kumpulan Semasa Sesi PdPc',
          'OPR Bengkel Teknik Bimbingan Terbeza (Differentiated Instruction) dalam PdPc',
        ]
      ),
      makeSub(
        'Std 4',
        '4.4.1',
        'Guru mendorong minda murid dalam melaksanakan aktiviti pembelajaran secara profesional dan terancang',
        '教师作为推动者：激发高阶思维 KBAT 与主动提问',
        'Guru merangsang murid berkomunikasi, berkolaboratif dan mengemukakan soalan berfikir aras tinggi (KBAT).',
        [
          'Penggunaan Peta Pemikiran i-THINK, Soalan KBAT & Aktiviti Penyelesaian Masalah',
          'Hasil Projek / Pembentangan Kumpulan Murid Berasaskan Inkuiri',
          'OPR Bengkel Pembudayaan KBAT & Peta Pemikiran dalam PdPc',
        ]
      ),
      makeSub(
        'Std 4',
        '4.4.2',
        'Guru mendorong emosi murid dalam melaksanakan aktiviti pembelajaran secara profesional dan terancang',
        '教师作为推动者：给予正向鼓励与建立学习自信',
        'Guru memberi pujian, galakan, penghargaan dan keyakinan kepada murid dalam aktiviti pembelajaran.',
        [
          'Sistem Ganjaran / Carta Bintang / Pameran Hasil Kerja Murid Terbaik di Kelas',
          'Maklum Balas Positif & Galakan Guru dalam Buku Latihan Murid',
          'OPR Perkongsian Amalan Pedagogi Penyayang & Motivasi Pembelajaran Murid',
        ]
      ),
      makeSub(
        'Std 4',
        '4.5.1',
        'Guru melaksanakan penilaian secara sistematik dan terancang',
        '教师作为评估者：随堂评估、诊断反馈与教学反思',
        'Guru menggunakan pelbagai kaedah pentaksiran dalam PdPc, menjalankan pemulihan/pengayaan dan membuat refleksi.',
        [
          'Rekod Semakan Kerja Murid, Senarai Semak Pemerhatian PBD & Refleksi e-RPH',
          'Instrumen Kuiz Pantas / Exit Ticket / Pentaksiran Kendiri & Rakan Sebaya',
          'OPR Bengkel Pelaksanaan Pentaksiran Formatif & Penulisan Refleksi PdPc',
        ]
      ),
      makeSub(
        'Std 4',
        '4.6.1',
        'Murid melibatkan diri dalam proses pembelajaran secara berkesan',
        '学生作为主动学习者：积极参与互动、合作与探究',
        'Murid memberi respons aktif, berkomunikasi, berkolaboratif dan berfikiran kritis dalam aktiviti pembelajaran.',
        [
          'Bukti Bergambar / Video Penglibatan Aktif Murid (>90%) dalam Pembentangan & Kerja Kumpulan',
          'Portfolio Hasil Kerja Murid & Projek Pembelajaran Berasaskan Projek (PBL)',
          'OPR Pameran Pembelajaran Berasaskan Projek (PBL) & Showcase Kemenjadian PdPc',
        ]
      ),
    ],
  },
  {
    standardGroup: 'Std 5',
    shortLabel: 'Std 5',
    standardFullTitle: 'STANDARD 5: KEMENJADIAN MURID',
    standardTitleZh: '学生全面发展成果 (Kemenjadian Murid)',
    dropdownGroupLabel: 'Std 5 — Standard 5: Kemenjadian Murid（学术成果、课外竞赛荣誉与品德出席率成果）',
    standardFolderName: 'Standard 5 - Kemenjadian Murid',
    defaultSubStandardCode: '5.1',
    subStandards: [
      makeSub(
        'Std 5',
        '5.1',
        'Kemenjadian Murid Dalam Akademik',
        '学术成就与 PBD/UASA 达标率统计成果',
        'Peratus murid mencapai Tahap Penguasaan Minimum (sekurang-kurangnya TP3) dalam PBD dan peningkatan prestasi UASA.',
        [
          'Rumusan Analisis PBD Akhir Sesi Akademik (% Menguasai TP3–TP6 Mengikut Tahun & Subjek)',
          'Laporan Analisis Pencapaian UASA & Senarai Penerima Anugerah Kecemerlangan Akademik',
          'OPR Majlis Apresiasi Kecemerlangan Akademik & Pelaporan Kemenjadian PBD/UASA',
        ]
      ),
      makeSub(
        'Std 5',
        '5.2',
        'Kemenjadian Murid Dalam Kokurikulum',
        '课外活动 PAJSK 成绩与校外竞赛获奖成果',
        'Peningkatan Gred Purata Sekolah (GPS) dalam PAJSK (Kelab/Persatuan, Badan Beruniform, Sukan/Permainan) dan kejayaan pertandingan.',
        [
          'Rumusan Analisis GPS PAJSK Sekolah & Statistik Gred A/B/C Murid Tahun 4–6',
          'Rekod & Sijil Kejayaan Murid Peringkat Daerah, Negeri, Kebangsaan & Antarabangsa',
          'OPR Pelaporan Kemenjadian Kokurikulum & Anugerah Tokoh Kokurikulum Sekolah',
        ]
      ),
      makeSub(
        'Std 5',
        '5.3',
        'Kemenjadian Sahsiah Murid',
        '学生品德 SSDM 优良表现与全年出席率成果',
        'Peningkatan peratus kehadiran purata tahunan murid serta peningkatan status sahsiah terpuji dalam SSDM.',
        [
          'Rumusan Peratus Kehadiran Tahunan APDM Sekolah & Senarai Murid Kehadiran 100%',
          'Analisis Status Sahsiah Murid dalam SSDM (Terpuji / Amat Baik) & Penurunan Kes Disiplin',
          'OPR Majlis Anugerah Sahsiah Terpuji, Kehadiran Penuh & Kemenjadian Murid HEM',
        ]
      ),
    ],
  },
];

export const SKAS_STANDARD_GROUP_KEYS: SkasStandardGroupKey[] = [
  'Std 1',
  'Std 2',
  'Std 3.1',
  'Std 3.2',
  'Std 3.3',
  'Std 4',
  'Std 5',
];

export function getSkasGroup(groupKey?: string | null): SkasStandardGroup {
  const normalized = normalizeSkasStandardGroupKey(groupKey);
  return (
    SKAS_STANDARDS_DICTIONARY.find((g) => g.standardGroup === normalized) ||
    SKAS_STANDARDS_DICTIONARY[0]
  );
}

export function getSkasSubStandard(
  code?: string | null
): { group: SkasStandardGroup; sub: SkasSubStandard } | null {
  const cleaned = String(code || '').trim();
  if (!cleaned) return null;

  for (const group of SKAS_STANDARDS_DICTIONARY) {
    const exact = group.subStandards.find((s) => s.code === cleaned);
    if (exact) return { group, sub: exact };
  }

  // Fallback prefix match if someone stored e.g. "Standard 3.2.6.1" or "3.2.6.1 — ..."
  const match = cleaned.match(/(\d+(?:\.\d+){1,3})/);
  if (match) {
    const extracted = match[1];
    for (const group of SKAS_STANDARDS_DICTIONARY) {
      const found = group.subStandards.find(
        (s) => s.code === extracted || s.code.startsWith(extracted)
      );
      if (found) return { group, sub: found };
    }
  }
  return null;
}

export function normalizeSkasStandardGroupKey(
  rawGroupOrBucket?: string | null,
  rawSubCodeOrBadge?: string | null,
  rawPillar?: string | null
): SkasStandardGroupKey {
  const subLookup = getSkasSubStandard(rawSubCodeOrBadge);
  if (subLookup) return subLookup.group.standardGroup;

  const combined = `${rawGroupOrBucket || ''} ${rawSubCodeOrBadge || ''} ${rawPillar || ''}`
    .trim()
    .toUpperCase();

  if (combined.includes('3.2') || combined.includes('KOKURIKULUM') || combined.includes('KOKO')) {
    return 'Std 3.2';
  }
  if (combined.includes('3.3') || combined.includes('HEM') || combined.includes('HAL EHWAL')) {
    return 'Std 3.3';
  }
  if (combined.includes('3.1') || combined.includes('KURIKULUM') || combined.includes('AKADEMIK') || combined.includes('PANITIA') || combined.includes('PLC')) {
    return 'Std 3.1';
  }
  if (combined.includes('STD 4') || combined.includes('STANDARD 4') || /\b4\.[1-6]/.test(combined) || combined.includes('PDPC')) {
    return 'Std 4';
  }
  if (combined.includes('STD 5') || combined.includes('STANDARD 5') || /\b5\.[1-3]/.test(combined) || combined.includes('KEMENJADIAN')) {
    return 'Std 5';
  }
  if (combined.includes('STD 2') || combined.includes('STANDARD 2') || /\b2\.[1-7]/.test(combined) || combined.includes('ORGANISASI')) {
    return 'Std 2';
  }
  if (combined.includes('STD 1') || combined.includes('STANDARD 1') || /\b1\.[1-3]/.test(combined) || combined.includes('KEPEMIMPINAN')) {
    return 'Std 1';
  }
  return 'Std 1';
}

export function buildSkasDriveFolderPath(
  standardGroup?: string | null,
  subStandardCode?: string | null,
  rootFolderLabel = 'SKPM Kualiti@Sekolah 2026'
): [string, string, string] {
  const subLookup = getSkasSubStandard(subStandardCode);
  if (subLookup) {
    return [
      rootFolderLabel,
      subLookup.group.standardFolderName,
      subLookup.sub.subStandardFolderName,
    ];
  }
  const group = getSkasGroup(standardGroup);
  const fallbackSub = group.subStandards[0];
  return [
    rootFolderLabel,
    group.standardFolderName,
    fallbackSub.subStandardFolderName,
  ];
}

export function resolveSkasSelection(
  standardGroup?: string | null,
  subStandardCode?: string | null,
  fallbackPillar?: string | null
): {
  standardGroup: SkasStandardGroupKey;
  standardFullTitle: string;
  standardFolderName: string;
  subStandardCode: string;
  subStandardTitle: string;
  subStandardDescZh: string;
  dropdownLabel: string;
  subStandardFolderName: string;
  kualitiStatement: string;
  suggestedEvidens: string[];
  driveTargetFolderPath: [string, string, string];
} {
  const directSub = getSkasSubStandard(subStandardCode);
  if (directSub) {
    const { group, sub } = directSub;
    return {
      standardGroup: group.standardGroup,
      standardFullTitle: group.standardFullTitle,
      standardFolderName: group.standardFolderName,
      subStandardCode: sub.code,
      subStandardTitle: sub.titleMs,
      subStandardDescZh: sub.descZh,
      dropdownLabel: sub.dropdownLabel,
      subStandardFolderName: sub.subStandardFolderName,
      kualitiStatement: sub.kualitiStatement,
      suggestedEvidens: sub.suggestedEvidens,
      driveTargetFolderPath: buildSkasDriveFolderPath(group.standardGroup, sub.code),
    };
  }

  const groupKey = normalizeSkasStandardGroupKey(standardGroup, subStandardCode, fallbackPillar);
  const group = getSkasGroup(groupKey);
  const defaultSub =
    group.subStandards.find((s) => s.code === group.defaultSubStandardCode) ||
    group.subStandards[0];

  return {
    standardGroup: group.standardGroup,
    standardFullTitle: group.standardFullTitle,
    standardFolderName: group.standardFolderName,
    subStandardCode: defaultSub.code,
    subStandardTitle: defaultSub.titleMs,
    subStandardDescZh: defaultSub.descZh,
    dropdownLabel: defaultSub.dropdownLabel,
    subStandardFolderName: defaultSub.subStandardFolderName,
    kualitiStatement: defaultSub.kualitiStatement,
    suggestedEvidens: defaultSub.suggestedEvidens,
    driveTargetFolderPath: buildSkasDriveFolderPath(group.standardGroup, defaultSub.code),
  };
}
