import { MySGJawatankuasaItem, MySGPillar } from './mysgJawatankuasaCatalog';

export type SKPMRadarBucket = 'Std 1' | 'Std 2' | 'Std 3.1' | 'Std 3.2' | 'Std 3.3' | 'Std 4' | 'Std 5';

export interface SKPMStandardMeta {
  bucket: SKPMRadarBucket;
  standardCode: string;
  standardTitle: string;
  aspekCode: string;
  aspekTitle: string;
  standardKualitiStatement: string;
  skor4Rubric: string;
}

export const SKPM_RADAR_BUCKETS: Array<{
  bucket: SKPMRadarBucket;
  shortLabel: string;
  fullLabel: string;
}> = [
  { bucket: 'Std 1', shortLabel: 'Std 1', fullLabel: 'Standard 1: Kepimpinan' },
  { bucket: 'Std 2', shortLabel: 'Std 2', fullLabel: 'Standard 2: Pengurusan Organisasi' },
  { bucket: 'Std 3.1', shortLabel: 'Std 3.1', fullLabel: 'Std 3.1: Pengurusan Kurikulum' },
  { bucket: 'Std 3.2', shortLabel: 'Std 3.2', fullLabel: 'Std 3.2: Pengurusan Kokurikulum' },
  { bucket: 'Std 3.3', shortLabel: 'Std 3.3', fullLabel: 'Std 3.3: Pengurusan HEM' },
  { bucket: 'Std 4', shortLabel: 'Std 4', fullLabel: 'Standard 4: Pembelajaran & Pemudahcaraan' },
  { bucket: 'Std 5', shortLabel: 'Std 5', fullLabel: 'Standard 5: Kemenjadian Murid' },
];

const SKPM_CATALOG_ENTRIES: Record<string, SKPMStandardMeta> = {
  '1.1': {
    bucket: 'Std 1',
    standardCode: 'STANDARD 1',
    standardTitle: 'KEPIMPINAN',
    aspekCode: 'ASPEK 1.1',
    aspekTitle: 'PGB SEBAGAI PENERAJU',
    standardKualitiStatement:
      'PGB bertindak sebagai peneraju dalam semua aspek pengurusan dan pendidikan di sekolah secara terancang, sistematik dan berimpak tinggi.',
    skor4Rubric:
      'Dilaksanakan secara menyeluruh, mengikut ketetapan, mengambil kira keperluan semasa serta disertai tindakan susulan penambahbaikan berterusan.',
  },
  '1.2': {
    bucket: 'Std 1',
    standardCode: 'STANDARD 1',
    standardTitle: 'KEPIMPINAN',
    aspekCode: 'ASPEK 1.2',
    aspekTitle: 'PGB SEBAGAI PEMBIMBING',
    standardKualitiStatement:
      'PGB memberi bimbingan kepada guru dan AKP secara profesional dan terancang bagi meningkatkan kualiti pelaksanaan kurikulum dan organisasi.',
    skor4Rubric:
      'Bimbingan berterusan secara menyeluruh dengan eviden pementoran, dialog prestasi dan peningkatan kompetensi staf.',
  },
  '2.1': {
    bucket: 'Std 2',
    standardCode: 'STANDARD 2',
    standardTitle: 'PENGURUSAN ORGANISASI',
    aspekCode: 'ASPEK 2.1',
    aspekTitle: 'PENGURUSAN SUMBER MANUSIA',
    standardKualitiStatement:
      'Sumber manusia diurus untuk meningkatkan kualiti kerja dengan mengagihkan tugas secara adil, mengeluarkan surat lantikan rasmi serta melaksanakan pembangunan profesionalisme berterusan (LDP/SPLKPM).',
    skor4Rubric:
      'Pengagihan tugas berpandukan MySG secara telus dan adil, surat lantikan lengkap diterima staf dan program LDP berimpak dilaksanakan.',
  },
  '2.2': {
    bucket: 'Std 2',
    standardCode: 'STANDARD 2',
    standardTitle: 'PENGURUSAN ORGANISASI',
    aspekCode: 'ASPEK 2.2',
    aspekTitle: 'PENGURUSAN ASET & MAKLUMAT',
    standardKualitiStatement:
      'Aset alih kerajaan dan pengurusan maklumat sekolah (EMIS, APDM/MOEIS, idMe, e-Operasi) diurus secara sistematik, tepat dan mematuhi peraturan berkuat kuasa.',
    skor4Rubric:
      'Rekod maklumat sifar ralat, disahkan mengikut jadual KPM serta disokong pemeriksaan fizikal dan tindakan penyelenggaraan.',
  },
  '2.3': {
    bucket: 'Std 2',
    standardCode: 'STANDARD 2',
    standardTitle: 'PENGURUSAN ORGANISASI',
    aspekCode: 'ASPEK 2.3',
    aspekTitle: 'PENGURUSAN KEWANGAN',
    standardKualitiStatement:
      'Kewangan sekolah diurus secara telus, berhemah dan mematuhi Tatacara Pengurusan Kewangan serta audit eSPKWS.',
    skor4Rubric:
      'Perbelanjaan PCG dirancang mengikut keutamaan pembelajaran murid dan disemak secara berkala oleh JPKA.',
  },
  '2.6': {
    bucket: 'Std 2',
    standardCode: 'STANDARD 2',
    standardTitle: 'PENGURUSAN ORGANISASI',
    aspekCode: 'ASPEK 2.6',
    aspekTitle: 'PENGURUSAN KEMUDAHAN & FIZIKAL',
    standardKualitiStatement:
      'Kemudahan prasarana, ICT/DELIMa dan Pusat Sumber Sekolah (PSS) diurus dan diselenggara agar kondusif serta menyokong PdP.',
    skor4Rubric:
      'Prasarana selamat, bersih, berfungsi optimum dengan rekod penggunaan aktif dan penyelenggaraan berkala.',
  },
  '2.7': {
    bucket: 'Std 2',
    standardCode: 'STANDARD 2',
    standardTitle: 'PENGURUSAN ORGANISASI',
    aspekCode: 'ASPEK 2.7',
    aspekTitle: 'PEMUAFAKATAN STRATEGIK',
    standardKualitiStatement:
      'Permuafakatan strategik bersama PIBG, PIBKS, ibu bapa dan komuniti dijalinkan secara aktif bagi menyokong kecemerlangan sekolah.',
    skor4Rubric:
      'Melibatkan 6 aktiviti utama e-Sarana dan kerjasama berterusan bersama pihak luar yang memberi impak kepada kemenjadian murid.',
  },
  '3.1.1': {
    bucket: 'Std 3.1',
    standardCode: 'STANDARD 3.1',
    standardTitle: 'PENGURUSAN KURIKULUM',
    aspekCode: 'ASPEK 3.1.1',
    aspekTitle: 'KETETAPAN PELAKSANAAN KURIKULUM',
    standardKualitiStatement:
      'Pelaksanaan kurikulum diurus secara sistematik dengan mematuhi ketetapan dasar KPM, dokumen DSKP serta penyelarasan jawatankuasa kurikulum.',
    skor4Rubric:
      'Ketetapan kurikulum menyeluruh, didokumenkan, disebarluaskan dan disemak secara berkala untuk tindakan penambahbaikan.',
  },
  '3.1.2': {
    bucket: 'Std 3.1',
    standardCode: 'STANDARD 3.1',
    standardTitle: 'PENGURUSAN KURIKULUM',
    aspekCode: 'ASPEK 3.1.2',
    aspekTitle: 'PENGURUSAN MATA PELAJARAN / PANITIA',
    standardKualitiStatement:
      'Mata pelajaran diurus untuk meningkatkan kualiti pembelajaran dan pengajaran melalui pelaksanaan DSKP, program peningkatan prestasi (PitS, PLaN, 3M, HIP) serta penggunaan peruntukan PCG secara berkesan.',
    skor4Rubric:
      'Program peningkatan akademik berfokus kepada keperluan murid (TP1–TP6) dengan penilaian impak dan tindakan susulan berterusan.',
  },
  '3.1.3': {
    bucket: 'Std 3.1',
    standardCode: 'STANDARD 3.1',
    standardTitle: 'PENGURUSAN KURIKULUM',
    aspekCode: 'ASPEK 3.1.3',
    aspekTitle: 'PENGURUSAN MASA INSTRUKSIONAL',
    standardKualitiStatement:
      'Masa instruksional diurus dengan berkesan menerusi penyediaan jadual waktu induk dan pengurusan guru ganti (relief) bagi memastikan PdP terlaksana tanpa gangguan.',
    skor4Rubric:
      'Jadual waktu dan jadual guru ganti dipatuhi sepenuhnya bagi melindungi masa instruksional (MMI) murid.',
  },
  '3.1.4': {
    bucket: 'Std 3.1',
    standardCode: 'STANDARD 3.1',
    standardTitle: 'PENGURUSAN KURIKULUM',
    aspekCode: 'ASPEK 3.1.4',
    aspekTitle: 'PENGURUSAN PENILAIAN MURID',
    standardKualitiStatement:
      'Peperiksaan dan pentaksiran (PBD, UASA, PKL, Penjaminan Kualiti 4P) diurus secara sistematik untuk mengesan perkembangan penguasaan dan memacu intervensi murid.',
    skor4Rubric:
      'Penjaminan kualiti 4P dilaksanakan, data pentaksiran dianalisis melalui dialog prestasi dan disusuli intervensi tepat.',
  },
  '3.2.1': {
    bucket: 'Std 3.2',
    standardCode: 'STANDARD 3.2',
    standardTitle: 'PENGURUSAN KOKURIKULUM',
    aspekCode: 'ASPEK 3.2.1',
    aspekTitle: 'KETETAPAN PELAKSANAAN KOKURIKULUM',
    standardKualitiStatement:
      'Pelaksanaan kokurikulum diurus secara sistematik, menyeluruh dan selaras dengan dasar 1M1S serta penglibatan semua murid.',
    skor4Rubric:
      'Takwim 12 perjumpaan, pendaftaran keahlian dan pelaporan PAJSK diselaraskan dengan teliti.',
  },
  '3.2.2': {
    bucket: 'Std 3.2',
    standardCode: 'STANDARD 3.2',
    standardTitle: 'PENGURUSAN KOKURIKULUM',
    aspekCode: 'ASPEK 3.2.2',
    aspekTitle: 'PENGURUSAN KELAB / PERSATUAN & KOAKADEMIK',
    standardKualitiStatement:
      'Kelab, persatuan dan pasukan koakademik (BC, BM, BI, STEM, Kesenian) diurus untuk mengukuhkan pengetahuan, kemahiran dan kreativiti murid.',
    skor4Rubric:
      'Aktiviti terancang memupuk bakat dan kreativiti murid dengan penglibatan aktif serta dokumentasi OPR lengkap.',
  },
  '3.2.3': {
    bucket: 'Std 3.2',
    standardCode: 'STANDARD 3.2',
    standardTitle: 'PENGURUSAN KOKURIKULUM',
    aspekCode: 'ASPEK 3.2.3',
    aspekTitle: 'PENGURUSAN BADAN BERUNIFORM',
    standardKualitiStatement:
      'Badan beruniform diurus untuk membentuk disiplin, ketahanan diri dan kemahiran kepimpinan murid secara terancang.',
    skor4Rubric:
      'Latihan kepimpinan, perkhemahan dan rekod kehadiran dilaksanakan secara konsisten sepanjang tahun.',
  },
  '3.2.4': {
    bucket: 'Std 3.2',
    standardCode: 'STANDARD 3.2',
    standardTitle: 'PENGURUSAN KOKURIKULUM',
    aspekCode: 'ASPEK 3.2.4',
    aspekTitle: 'PENGURUSAN SUKAN / PERMAINAN',
    standardKualitiStatement:
      'Sukan dan permainan (1M1S, Sukantara, Merentas Desa, Sukan Tahunan) diurus untuk membina kecergasan fizikal dan semangat kesukanan murid.',
    skor4Rubric:
      'Penyertaan menyeluruh murid dengan pengurusan keselamatan alatan dan rekod pencapaian yang kemas.',
  },
  '3.2.5': {
    bucket: 'Std 3.2',
    standardCode: 'STANDARD 3.2',
    standardTitle: 'PENGURUSAN KOKURIKULUM',
    aspekCode: 'ASPEK 3.2.5',
    aspekTitle: 'PENGURUSAN PROGRAM KECEMERLANGAN KOKURIKULUM',
    standardKualitiStatement:
      'Program kecemerlangan sukan dan koakademik diurus dengan latihan berfasa, bimbingan jurulatih dan penyertaan pertandingan peringkat daerah hingga kebangsaan.',
    skor4Rubric:
      'Pelan latihan berjadual, pengesanan bakat dan rekod pengiktirafan pertandingan didokumentasikan.',
  },
  '3.2.6': {
    bucket: 'Std 3.2',
    standardCode: 'STANDARD 3.2',
    standardTitle: 'PENGURUSAN KOKURIKULUM',
    aspekCode: 'ASPEK 3.2.6',
    aspekTitle: 'PENGURUSAN SUKAN UNTUK SEMUA',
    standardKualitiStatement:
      'Aktiviti Sukan Untuk Semua (Merentas Desa, Sukantara, Olahraga Tahunan, Hari Sukan Negara) diurus secara profesional dan terancang.',
    skor4Rubric:
      'Penyertaan menyeluruh semua murid dengan pelan keselamatan, jawatankuasa pelaksana dan dokumentasi OPR lengkap.',
  },
  '3.2.7': {
    bucket: 'Std 3.2',
    standardCode: 'STANDARD 3.2',
    standardTitle: 'PENGURUSAN KOKURIKULUM',
    aspekCode: 'ASPEK 3.2.7',
    aspekTitle: 'PENGURUSAN PENTAKSIRAN KOKURIKULUM',
    standardKualitiStatement:
      'Pentaksiran kokurikulum (PAJSK & SEGAK) dilaksanakan secara sistematik dan terancang.',
    skor4Rubric:
      '100% murid Tahun 4–6 dinilai dan dianalisis bagi merancang peningkatan skor penglibatan serta kecergasan.',
  },
  '3.3.1': {
    bucket: 'Std 3.3',
    standardCode: 'STANDARD 3.3',
    standardTitle: 'PENGURUSAN HAL EHWAL MURID',
    aspekCode: 'ASPEK 3.3.1',
    aspekTitle: 'KETETAPAN PELAKSANAAN HAL EHWAL MURID',
    standardKualitiStatement:
      'Pengurusan hal ehwal murid, kehadiran harian MOEIS dan kebajikan murid kelas diurus secara sistematik demi kesejahteraan dan kemenjadian murid.',
    skor4Rubric:
      'Ketetapan HEM menyeluruh dengan pemantauan kehadiran dan intervensi keciciran sifar.',
  },
  '3.3.2': {
    bucket: 'Std 3.3',
    standardCode: 'STANDARD 3.3',
    standardTitle: 'PENGURUSAN HAL EHWAL MURID',
    aspekCode: 'ASPEK 3.3.2',
    aspekTitle: 'PENGURUSAN DISIPLIN MURID',
    standardKualitiStatement:
      'Disiplin murid, amalan baik SSDM dan pencegahan gejala negatif (PPDa) diurus untuk membentuk sahsiah terpuji murid.',
    skor4Rubric:
      'Penguatkuasaan peraturan berhemah bersama perekodan SSDM dan program pemupukan amalan baik.',
  },
  '3.3.3': {
    bucket: 'Std 3.3',
    standardCode: 'STANDARD 3.3',
    standardTitle: 'PENGURUSAN HAL EHWAL MURID',
    aspekCode: 'ASPEK 3.3.3',
    aspekTitle: 'PENGURUSAN KESELAMATAN MURID',
    standardKualitiStatement:
      'Keselamatan murid di dalam dan sekitar sekolah (SPKS, Fire Drill, pencegahan kemalangan) diurus secara proaktif dan terancang.',
    skor4Rubric:
      'SOP keselamatan dipatuhi, latihan kecemasan dilaksanakan dua kali setahun dan audit kawasan berisiko dijalankan.',
  },
  '3.3.4': {
    bucket: 'Std 3.3',
    standardCode: 'STANDARD 3.3',
    standardTitle: 'PENGURUSAN HAL EHWAL MURID',
    aspekCode: 'ASPEK 3.3.4',
    aspekTitle: 'PENGURUSAN KESIHATAN MURID',
    standardKualitiStatement:
      'Kesihatan dan kebersihan murid (3K, Anti-Denggi, Kantin Sihat, RKM) diurus untuk menjamin persekitaran pembelajaran yang sihat.',
    skor4Rubric:
      'Pemeriksaan berkala dilaksanakan dengan laporan kendiri kantin, denggi dan tindakan pencegahan segera.',
  },
  '3.3.5': {
    bucket: 'Std 3.3',
    standardCode: 'STANDARD 3.3',
    standardTitle: 'PENGURUSAN HAL EHWAL MURID',
    aspekCode: 'ASPEK 3.3.5',
    aspekTitle: 'PENGURUSAN BANTUAN PELAJARAN MURID',
    standardKualitiStatement:
      'Bantuan pelajaran murid (SPBT, RMT, Program Susu, BAP, KWAPM) diurus secara telus dan menepati kriteria kelayakan.',
    skor4Rubric:
      'Agihan bantuan tepat kepada murid layak mengikut jadual serta disertai pemantauan keberkesanan.',
  },
  '3.3.6': {
    bucket: 'Std 3.3',
    standardCode: 'STANDARD 3.3',
    standardTitle: 'PENGURUSAN HAL EHWAL MURID',
    aspekCode: 'ASPEK 3.3.6',
    aspekTitle: 'PENGURUSAN PERKHIDMATAN BIMBINGAN & KAUNSELING',
    standardKualitiStatement:
      'Perkhidmatan bimbingan, kaunseling (GBLD), Minda Sihat dan psikometrik dilaksanakan untuk menyokong kesejahteraan emosi serta sahsiah murid.',
    skor4Rubric:
      'Saringan Minda Sihat dan program Guru Penyayang / Ziarah Cakna dilaksanakan dengan pelaporan impak.',
  },
  '4.1': {
    bucket: 'Std 4',
    standardCode: 'STANDARD 4',
    standardTitle: 'PEMBELAJARAN DAN PEMUDAHCARAAN (PdPc)',
    aspekCode: 'ASPEK 4.1 – 4.6',
    aspekTitle: 'GURU SEBAGAI PERANCANG, PENGAWAL, PEMBIMBING & PENDORONG',
    standardKualitiStatement:
      'Guru melaksanakan PdPc PAK21 dan perkongsian profesionalisme (PLC) secara berkesan bagi memaksimumkan pembelajaran aktif murid.',
    skor4Rubric:
      'Murid terlibat secara aktif, berfikir aras tinggi (KBAT) dan guru melaksanakan refleksi penambahbaikan PdPc.',
  },
  '5.1': {
    bucket: 'Std 5',
    standardCode: 'STANDARD 5',
    standardTitle: 'KEMENJADIAN MURID',
    aspekCode: 'ASPEK 5.1 – 5.4',
    aspekTitle: 'KEMENJADIAN AKADEMIK, KOKURIKULUM (5.2), SAHSIAH (5.3) & PENCAPAIAN (5.4)',
    standardKualitiStatement:
      'Program sekolah berimpak menghasilkan peningkatan kemenjadian murid dari segi penguasaan akademik, penglibatan kokurikulum (5.2) serta kecemerlangan pertandingan (5.4).',
    skor4Rubric:
      'Peningkatan pencapaian murid disokong oleh data PBD/UASA, PAJSK, SSDM dan rekod kemenangan kokurikulum secara menyeluruh.',
  },
};

export type SKPMKokoStandardCode =
  | '3.2.1.1'
  | '3.2.2.1'
  | '3.2.3.1'
  | '3.2.4.1'
  | '3.2.5.1'
  | '3.2.6.1'
  | '3.2.7.1';

export interface SKPMKokoStandardSpec {
  code: SKPMKokoStandardCode;
  shortTitle: string;
  standardTitle: string;
  aspekTitle: string;
  kualitiStatement: string;
  standard5Code?: string;
  standard5Label?: string;
}

export const SKPM_KOKO_STANDARD_OPTIONS: SKPMKokoStandardSpec[] = [
  {
    code: '3.2.1.1',
    shortTitle: '3.2.1.1 — Ketetapan Pelaksanaan Kokurikulum',
    standardTitle: 'STANDARD 3.2 : PENGURUSAN KOKURIKULUM',
    aspekTitle: 'ASPEK 3.2.1 : KETETAPAN PELAKSANAAN KOKURIKULUM',
    kualitiStatement:
      'Standard Kualiti 3.2.1.1 : Pelaksanaan kokurikulum diurus secara sistematik dan terancang.',
    standard5Code: '5.2',
    standard5Label: 'STANDARD 5 (Aspek 5.2) : Kemenjadian & Penglibatan Murid dalam Kokurikulum',
  },
  {
    code: '3.2.2.1',
    shortTitle: '3.2.2.1 — Pengurusan Kelab/Persatuan',
    standardTitle: 'STANDARD 3.2 : PENGURUSAN KOKURIKULUM',
    aspekTitle: 'ASPEK 3.2.2 : PENGURUSAN KELAB/PERSATUAN',
    kualitiStatement:
      'Standard Kualiti 3.2.2.1 : Kelab/persatuan diurus secara sistematik dan terancang.',
    standard5Code: '5.2',
    standard5Label: 'STANDARD 5 (Aspek 5.2) : Kemenjadian Murid dalam Kelab & Persatuan',
  },
  {
    code: '3.2.3.1',
    shortTitle: '3.2.3.1 — Pengurusan Badan Beruniform',
    standardTitle: 'STANDARD 3.2 : PENGURUSAN KOKURIKULUM',
    aspekTitle: 'ASPEK 3.2.3 : PENGURUSAN BADAN BERUNIFORM',
    kualitiStatement:
      'Standard Kualiti 3.2.3.1 : Badan beruniform diurus secara sistematik dan terancang.',
    standard5Code: '5.2',
    standard5Label: 'STANDARD 5 (Aspek 5.2) : Kemenjadian Murid dalam Badan Beruniform',
  },
  {
    code: '3.2.4.1',
    shortTitle: '3.2.4.1 — Pengurusan Sukan/Permainan',
    standardTitle: 'STANDARD 3.2 : PENGURUSAN KOKURIKULUM',
    aspekTitle: 'ASPEK 3.2.4 : PENGURUSAN SUKAN/PERMAINAN',
    kualitiStatement:
      'Standard Kualiti 3.2.4.1 : Sukan/permainan diurus secara sistematik dan terancang.',
    standard5Code: '5.2',
    standard5Label: 'STANDARD 5 (Aspek 5.2) : Kemenjadian Murid dalam Sukan/Permainan',
  },
  {
    code: '3.2.5.1',
    shortTitle: '3.2.5.1 — Program Kecemerlangan Kokurikulum (+ Std 5.2 / 5.4)',
    standardTitle: 'STANDARD 3.2 : PENGURUSAN KOKURIKULUM',
    aspekTitle: 'ASPEK 3.2.5 : PENGURUSAN PROGRAM KECEMERLANGAN KOKURIKULUM',
    kualitiStatement:
      'Standard Kualiti 3.2.5.1 : Program kecemerlangan kokurikulum diurus secara profesional dan terancang.',
    standard5Code: '5.2 & 5.4',
    standard5Label:
      'STANDARD 5 (Aspek 5.2 & 5.4) : Kemenjadian Kokurikulum & Pencapaian Kecemerlangan Sekolah',
  },
  {
    code: '3.2.6.1',
    shortTitle: '3.2.6.1 — Pengurusan Sukan Untuk Semua',
    standardTitle: 'STANDARD 3.2 : PENGURUSAN KOKURIKULUM',
    aspekTitle: 'ASPEK 3.2.6 : PENGURUSAN SUKAN UNTUK SEMUA',
    kualitiStatement:
      'Standard Kualiti 3.2.6.1 : Aktiviti Sukan Untuk Semua diurus secara profesional dan terancang.',
    standard5Code: '5.2',
    standard5Label: 'STANDARD 5 (Aspek 5.2) : Penyertaan Sukan Untuk Semua Murid',
  },
  {
    code: '3.2.7.1',
    shortTitle: '3.2.7.1 — Pengurusan Pentaksiran Kokurikulum (PAJSK/SEGAK)',
    standardTitle: 'STANDARD 3.2 : PENGURUSAN KOKURIKULUM',
    aspekTitle: 'ASPEK 3.2.7 : PENGURUSAN PENTAKSIRAN KOKURIKULUM',
    kualitiStatement:
      'Standard Kualiti 3.2.7.1 : Pentaksiran kokurikulum dilaksanakan secara sistematik dan terancang.',
    standard5Code: '5.2',
    standard5Label: 'STANDARD 5 (Aspek 5.2) : Rekod Kemenjadian PAJSK & SEGAK',
  },
];

export function getKokoSKPMOption(code?: string): SKPMKokoStandardSpec {
  const clean = String(code || '').trim();
  return (
    SKPM_KOKO_STANDARD_OPTIONS.find((opt) => opt.code === clean) ||
    SKPM_KOKO_STANDARD_OPTIONS[3] // Default 3.2.4.1
  );
}

export function autoResolveKokoSKPM(input: {
  category?: string;
  jenis?: string;
  level?: string;
  programName?: string;
  unit?: string;
  manualCode?: string;
}): SKPMKokoStandardSpec {
  if (input.manualCode) {
    const manualMatch = SKPM_KOKO_STANDARD_OPTIONS.find((o) => o.code === input.manualCode);
    if (manualMatch) {
      if (
        input.jenis === 'pertandingan' &&
        input.level &&
        input.level !== 'Sekolah' &&
        !manualMatch.standard5Code?.includes('5.4')
      ) {
        return {
          ...manualMatch,
          standard5Code: '5.2 & 5.4',
          standard5Label:
            'STANDARD 5 (Aspek 5.2 & 5.4) : Kemenjadian Kokurikulum & Pencapaian Kecemerlangan Sekolah',
        };
      }
      return manualMatch;
    }
  }

  const combinedText = `${input.programName || ''} ${input.unit || ''}`.toUpperCase();
  const cat = String(input.category || '');
  const level = String(input.level || 'Sekolah');

  // 1. 3.2.7.1 — Pentaksiran PAJSK / SEGAK
  if (
    cat === 'PENTAKSIRAN_PAJSK' ||
    combinedText.includes('PAJSK') ||
    combinedText.includes('SEGAK') ||
    combinedText.includes('PENTAKSIRAN KOKURIKULUM')
  ) {
    return getKokoSKPMOption('3.2.7.1');
  }

  // 2. 3.2.6.1 — Sukan Untuk Semua
  if (
    cat === 'SUKAN_UNTUK_SEMUA' ||
    combinedText.includes('MERENTAS DESA') ||
    combinedText.includes('SUKAN TARA') ||
    combinedText.includes('SUKANTARA') ||
    combinedText.includes('OLAHRAGA TAHUNAN') ||
    combinedText.includes('HARI SUKAN NEGARA') ||
    combinedText.includes('SUKAN UNTUK SEMUA') ||
    combinedText.includes('ANTARA RUMAH') ||
    combinedText.includes('ANTARA KELAS')
  ) {
    return getKokoSKPMOption('3.2.6.1');
  }

  // 3. 3.2.5.1 — Program Kecemerlangan Kokurikulum (+ Dual-Link Std 5.2 & 5.4)
  if (
    cat === 'KOAKADEMIK' ||
    (input.jenis === 'pertandingan' && level !== 'Sekolah') ||
    combinedText.includes('KOAKADEMIK') ||
    combinedText.includes('MSSD') ||
    combinedText.includes('PASUKAN ELIT') ||
    combinedText.includes('KECEMERLANGAN KOKURIKULUM')
  ) {
    return getKokoSKPMOption('3.2.5.1');
  }

  // 4. 3.2.4.1 — Sukan/Permainan (1M1S & School Sports Tournaments)
  if (cat === 'sport') {
    return getKokoSKPMOption('3.2.4.1');
  }

  // 5. 3.2.3.1 — Badan Beruniform
  if (cat === 'uniform') {
    return getKokoSKPMOption('3.2.3.1');
  }

  // 6. 3.2.2.1 — Kelab/Persatuan
  if (cat === 'club') {
    return getKokoSKPMOption('3.2.2.1');
  }

  // 7. 3.2.1.1 — Ketetapan Pelaksanaan Kokurikulum
  return getKokoSKPMOption('3.2.1.1');
}

export function resolveSKPMForMySGItem(item?: MySGJawatankuasaItem | null): SKPMStandardMeta {
  if (!item) return SKPM_CATALOG_ENTRIES['3.1.2'];
  const raw = `${item.skpmStandardCode || ''} ${item.kodMySG || ''}`.toUpperCase();

  // Direct aspect matching from MySG catalog's skpmStandardCode
  const prioritizedKeys = [
    '3.2.7',
    '3.2.6',
    '3.2.5',
    '3.2.4',
    '3.2.3',
    '3.2.2',
    '3.2.1',
    '3.1.4',
    '3.1.3',
    '3.1.2',
    '3.1.1',
    '3.3.6',
    '3.3.5',
    '3.3.4',
    '3.3.3',
    '3.3.2',
    '3.3.1',
    '4.1',
    '2.7',
    '2.6',
    '2.3',
    '2.2',
    '2.1',
    '1.2',
    '1.1',
  ];

  // Check PLC special match -> Standard 4 + 2.1.2
  if (raw.includes('PLC') || raw.includes('4.1')) {
    return SKPM_CATALOG_ENTRIES['4.1'];
  }
  if (raw.includes('PAJSK') || raw.includes('SEGAK')) {
    return SKPM_CATALOG_ENTRIES['3.2.7'];
  }
  if (raw.includes('3K-03') || raw.includes('FIRE DRILL')) {
    return SKPM_CATALOG_ENTRIES['3.3.3'];
  }
  if (raw.includes('3K-01') || raw.includes('3K-02')) {
    return SKPM_CATALOG_ENTRIES['3.3.4'];
  }

  for (const key of prioritizedKeys) {
    if (raw.includes(key)) {
      return SKPM_CATALOG_ENTRIES[key];
    }
  }

  // Fallback by pillar
  const pillarFallback: Record<MySGPillar, string> = {
    PENTADBIRAN: '2.1',
    KURIKULUM: '3.1.2',
    HEM: '3.3.1',
    KOKURIKULUM: '3.2.2',
  };
  return SKPM_CATALOG_ENTRIES[pillarFallback[item.pillar] || '3.1.2'];
}

export function getAllSKPMStandards(): SKPMStandardMeta[] {
  return Object.values(SKPM_CATALOG_ENTRIES);
}
