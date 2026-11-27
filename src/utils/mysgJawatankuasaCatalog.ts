import { PersonnelProfile } from '../types';

export type MySGPillar = 'PENTADBIRAN' | 'KURIKULUM' | 'HEM' | 'KOKURIKULUM';
export type MySGTahapBeban = 'BERAT' | 'SEDERHANA' | 'RINGAN';
export type MySGSkpmBucket = 'Std 1 & 2' | 'Std 3.1' | 'Std 3.2' | 'Std 3.3' | 'Std 5';

export interface MySGAhliItem {
  teacherId: string;
  teacherName: string;
}

export interface MySGJawatankuasaItem {
  kodMySG: string;
  pillar: MySGPillar;
  jawatankuasaInduk: string;
  jawatanRasmi: string;
  tahapBeban: MySGTahapBeban;
  mataBeban: number;
  skpmBucket: MySGSkpmBucket;
  skpmStandardRef: string;
  assignedTeacherId?: string;
  assignedTeacherName?: string;
  ahliList?: MySGAhliItem[];
  customDueDate?: string;
}

export interface MySGKoakademikOption {
  code: string;
  unit: string;
  subjectLabel: string;
}

export const MYSG_OPR_KOAKADEMIK_OPTIONS: MySGKoakademikOption[] = [
  {
    code: 'PM25-3.2.5.1-KOAKADEMIK-BC',
    unit: 'Koakademik Bahasa Cina (BC)',
    subjectLabel: 'Panitia Bahasa Cina',
  },
  {
    code: 'PM25-3.2.5.1-KOAKADEMIK-BM',
    unit: 'Koakademik Bahasa Melayu (BM)',
    subjectLabel: 'Panitia Bahasa Melayu',
  },
  {
    code: 'PM25-3.2.5.1-KOAKADEMIK-BI',
    unit: 'Koakademik Bahasa Inggeris (BI)',
    subjectLabel: 'Panitia Bahasa Inggeris',
  },
  {
    code: 'PM25-3.2.5.1-KOAKADEMIK-STEM',
    unit: 'Koakademik STEM (Sains, Matematik & RBT)',
    subjectLabel: 'Panitia Sains / Matematik / RBT',
  },
  {
    code: 'PM25-3.2.5.1-KOAKADEMIK-SENI',
    unit: 'Koakademik Kesenian & Kebudayaan (PSV & Muzik)',
    subjectLabel: 'Panitia PSV / Muzik',
  },
  {
    code: 'PM25-3.2.5.1-KOAKADEMIK-AGAMA',
    unit: 'Koakademik Pendidikan Islam (MTQ / Adab) & Moral',
    subjectLabel: 'Panitia PAI / Pendidikan Moral',
  },
];

export const MYSG_DEFAULT_CATALOG: MySGJawatankuasaItem[] = [
  // ======================== 1. PENTADBIRAN (STD 1 & 2) ========================
  {
    kodMySG: 'JK01-SU-PENGURUSAN',
    pillar: 'PENTADBIRAN',
    jawatankuasaInduk: 'JK Pengurusan & Pentadbiran Sekolah',
    jawatanRasmi: 'Setiausaha Pengurusan & Minit Mesyuarat Guru',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 1 & 2',
    skpmStandardRef: 'SKPM Standard 1.1 & 2.1 — Kepimpinan & Pengurusan Sumber Manusia',
  },
  {
    kodMySG: 'JK02-PENYELARAS-SKPM',
    pillar: 'PENTADBIRAN',
    jawatankuasaInduk: 'JK SKPM Kualiti@Sekolah (SKAS)',
    jawatanRasmi: 'Setiausaha / Penyelaras SKPM Kualiti@Sekolah',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 1 & 2',
    skpmStandardRef: 'SKPM Standard 1.1.2 & 2.1 — Pengurusan Kualiti Sekolah',
  },
  {
    kodMySG: 'JK03-PEGAWAI-ASET',
    pillar: 'PENTADBIRAN',
    jawatankuasaInduk: 'JK Pengurusan Aset Alih Kerajaan (JKPAK)',
    jawatanRasmi: 'Pegawai Aset Sekolah',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 1 & 2',
    skpmStandardRef: 'SKPM Standard 2.2 — Pengurusan Aset',
  },
  {
    kodMySG: 'JK04-PENYELARAS-SPLKPM',
    pillar: 'PENTADBIRAN',
    jawatankuasaInduk: 'JK Latihan Dalam Perkhidmatan (LDP / SPLKPM)',
    jawatanRasmi: 'Penyelaras LDP / SPLKPM',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 1 & 2',
    skpmStandardRef: 'SKPM Standard 2.1.2 — Pembangunan Sumber Manusia',
  },
  {
    kodMySG: 'JK05-PENYELARAS-ICT',
    pillar: 'PENTADBIRAN',
    jawatankuasaInduk: 'JK Pengurusan Maklumat Sekolah (JPMS / DELIMa / ICT)',
    jawatanRasmi: 'Guru Data & Penyelaras ICT / DELIMa',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 1 & 2',
    skpmStandardRef: 'SKPM Standard 2.4 — Pengurusan Sumber Pendidikan & TMK',
  },
  {
    kodMySG: 'JK06-SU-PIBG-SARANA',
    pillar: 'PENTADBIRAN',
    jawatankuasaInduk: 'JK Permuafakatan Komuniti & PIBG / PIBKS',
    jawatanRasmi: 'Setiausaha PIBG & Penyelaras Sarana (Aspek 2.7.1)',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 1 & 2',
    skpmStandardRef: 'SKPM Standard 2.7.1 — Permuafakatan Strategik',
  },

  // ======================== 2. KURIKULUM (STD 3.1) ========================
  {
    kodMySG: 'JK07-SU-KURIKULUM',
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'Jawatankuasa Kurikulum Sekolah (JKS)',
    jawatanRasmi: 'Setiausaha Kurikulum Sekolah',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.1.1 — Ketetapan Pelaksanaan Kurikulum',
  },
  {
    kodMySG: 'JK08-SU-PBD-UASA',
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'JK Pentaksiran Berasaskan Sekolah (PBS / PBD / UASA)',
    jawatanRasmi: 'Setiausaha Peperiksaan (UASA) & Penyelaras PBD',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.4.1 — Pengurusan Penilaian Murid',
  },
  {
    kodMySG: 'JK09-GURU-PSS',
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'JK Pusat Sumber Sekolah (PSS / NILAM)',
    jawatanRasmi: 'Guru Perpustakaan dan Media (GPM / NILAM)',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 2.4.1 — Pengurusan Pusat Sumber Sekolah',
  },
  {
    kodMySG: 'JK10-PENYELARAS-PLC',
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'JK Komuniti Pembelajaran Profesional (PLC) &KBAT',
    jawatanRasmi: 'Penyelaras PLC & PAK21 Sekolah',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.2.2 — Peningkatan Kualiti Akademik (PLC)',
  },
  {
    kodMySG: 'PM11-KP-BM',
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'Panitia Bahasa Melayu',
    jawatanRasmi: 'Ketua Panitia Bahasa Melayu',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.2.1 — Pengurusan Mata Pelajaran (BM)',
  },
  {
    kodMySG: 'PM12-KP-BC',
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'Panitia Bahasa Cina',
    jawatanRasmi: 'Ketua Panitia Bahasa Cina',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.2.1 — Pengurusan Mata Pelajaran (BC)',
  },
  {
    kodMySG: 'PM13-KP-BI',
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'Panitia Bahasa Inggeris & HIP',
    jawatanRasmi: 'Ketua Panitia Bahasa Inggeris & Penyelaras HIP',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.2.1 — Pengurusan Mata Pelajaran (BI)',
  },
  {
    kodMySG: 'PM14-KP-MT',
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'Panitia Matematik',
    jawatanRasmi: 'Ketua Panitia Matematik',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.2.1 — Pengurusan Mata Pelajaran (MT)',
  },
  {
    kodMySG: 'PM15-KP-SN',
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'Panitia Sains',
    jawatanRasmi: 'Ketua Panitia Sains',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.2.1 — Pengurusan Mata Pelajaran (SN)',
  },
  {
    kodMySG: 'PM16-GURU-PEMULIHAN',
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'JK Pemulihan Khas & Intervensi Literasi/Numerasi',
    jawatanRasmi: 'Guru Pemulihan Khas / Penyelaras PLA',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.2.3 — Program Peningkatan Pencapaian Murid',
  },

  // ======================== 3. HAL EHWAL MURID (STD 3.3) ========================
  {
    kodMySG: 'JK17-SU-HEM',
    pillar: 'HEM',
    jawatankuasaInduk: 'Jawatankuasa Hal Ehwal Murid (JK HEM)',
    jawatanRasmi: 'Setiausaha Hal Ehwal Murid (HEM)',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 3.3',
    skpmStandardRef: 'SKPM Standard 3.3.1.1 — Ketetapan Pelaksanaan HEM',
  },
  {
    kodMySG: 'JK18-GURU-DISIPLIN-SSDM',
    pillar: 'HEM',
    jawatankuasaInduk: 'JK Lembaga Disiplin & Pengawas Sekolah (SSDM)',
    jawatanRasmi: 'Ketua Guru Disiplin & Pengawas (SSDM)',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 3.3',
    skpmStandardRef: 'SKPM Standard 3.3.2.1 — Pengurusan Disiplin Murid',
  },
  {
    kodMySG: 'JK19-PENYELARAS-3K',
    pillar: 'HEM',
    jawatankuasaInduk: 'JK Kebersihan, Kesihatan & Keselamatan (3K)',
    jawatanRasmi: 'Penyelaras Program 3K & Sekolah Selamat',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.3',
    skpmStandardRef: 'SKPM Standard 3.3.3.1 & 3.3.4.1 — Keselamatan & Kesihatan Murid',
  },
  {
    kodMySG: 'JK20-PENYELARAS-BANTUAN-RMT-KWAMP',
    pillar: 'HEM',
    jawatankuasaInduk: 'JK Pengurusan Bantuan Pelajaran Murid (RMT / KWAMP / BAP)',
    jawatanRasmi: 'Penyelaras Bantuan Murid (RMT, Susu & KWAMP)',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 3.3',
    skpmStandardRef: 'SKPM Standard 3.3.5.1 — Pengurusan Bantuan Pelajaran Murid',
  },
  {
    kodMySG: 'JK21-PENYELARAS-SPBT',
    pillar: 'HEM',
    jawatankuasaInduk: 'JK Skim Pinjaman Buku Teks (SPBT)',
    jawatanRasmi: 'Guru SPBT / BOSS',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.3',
    skpmStandardRef: 'SKPM Standard 3.3.5.1 — Pengurusan SPBT',
  },
  {
    kodMySG: 'JK22-GURU-BIMBINGAN',
    pillar: 'HEM',
    jawatankuasaInduk: 'JK Perkhidmatan Bimbingan & Kaunseling / Guru Penyayang',
    jawatanRasmi: 'Guru Bimbingan & Penyelaras Guru Penyayang',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.3',
    skpmStandardRef: 'SKPM Standard 3.3.6.1 — Perkhidmatan Bimbingan dan Kaunseling',
  },

  // ======================== 4. KOKURIKULUM & KOAKADEMIK (STD 3.2 & STD 5) ========================
  {
    kodMySG: 'JK23-SU-KOKURIKULUM',
    pillar: 'KOKURIKULUM',
    jawatankuasaInduk: 'Jawatankuasa Kokurikulum Sekolah (JK Koko)',
    jawatanRasmi: 'Setiausaha Kokurikulum & Penyelaras PAJSK (3.2.1.1 & 3.2.7.1)',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 3.2',
    skpmStandardRef: 'SKPM Standard 3.2.1.1 & 3.2.7.1 — Ketetapan & Pentaksiran PAJSK',
  },
  {
    kodMySG: 'JK24-SU-SUKAN',
    pillar: 'KOKURIKULUM',
    jawatankuasaInduk: 'JK Pembangunan Sukan Sekolah & 1M1S',
    jawatanRasmi: 'Setiausaha Sukan & Penyelaras 1M1S (3.2.4.1 & 3.2.6.1)',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 3.2',
    skpmStandardRef: 'SKPM Standard 3.2.4.1 & 3.2.6.1 — Sukan Permainan & Sukan Untuk Semua',
  },
  {
    kodMySG: 'PM25-3.2.5.1-KOAKADEMIK-BC',
    pillar: 'KOKURIKULUM',
    jawatankuasaInduk: 'JK Kecemerlangan Koakademik (Std 3.2.5.1)',
    jawatanRasmi: 'Penyelaras Koakademik Bahasa Cina (BC)',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.2',
    skpmStandardRef: 'SKPM Standard 3.2.5.1 & 5.2.1 — Kecemerlangan Koakademik BC',
  },
  {
    kodMySG: 'PM25-3.2.5.1-KOAKADEMIK-BM',
    pillar: 'KOKURIKULUM',
    jawatankuasaInduk: 'JK Kecemerlangan Koakademik (Std 3.2.5.1)',
    jawatanRasmi: 'Penyelaras Koakademik Bahasa Melayu (BM)',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.2',
    skpmStandardRef: 'SKPM Standard 3.2.5.1 & 5.2.1 — Kecemerlangan Koakademik BM',
  },
  {
    kodMySG: 'PM25-3.2.5.1-KOAKADEMIK-BI',
    pillar: 'KOKURIKULUM',
    jawatankuasaInduk: 'JK Kecemerlangan Koakademik (Std 3.2.5.1)',
    jawatanRasmi: 'Penyelaras Koakademik Bahasa Inggeris (BI)',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.2',
    skpmStandardRef: 'SKPM Standard 3.2.5.1 & 5.2.1 — Kecemerlangan Koakademik BI',
  },
  {
    kodMySG: 'PM25-3.2.5.1-KOAKADEMIK-STEM',
    pillar: 'KOKURIKULUM',
    jawatankuasaInduk: 'JK Kecemerlangan Koakademik (Std 3.2.5.1)',
    jawatanRasmi: 'Penyelaras Koakademik STEM (Sains, Matematik & RBT)',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.2',
    skpmStandardRef: 'SKPM Standard 3.2.5.1 & 5.2.1 — Kecemerlangan Koakademik STEM',
  },
  {
    kodMySG: 'PM25-3.2.5.1-KOAKADEMIK-SENI',
    pillar: 'KOKURIKULUM',
    jawatankuasaInduk: 'JK Kecemerlangan Koakademik (Std 3.2.5.1)',
    jawatanRasmi: 'Penyelaras Koakademik Kesenian & Kebudayaan',
    tahapBeban: 'RINGAN',
    mataBeban: 1,
    skpmBucket: 'Std 3.2',
    skpmStandardRef: 'SKPM Standard 3.2.5.1 & 5.2.1 — Kecemerlangan Koakademik Kesenian',
  },
  {
    kodMySG: 'PM25-3.2.5.1-KOAKADEMIK-AGAMA',
    pillar: 'KOKURIKULUM',
    jawatankuasaInduk: 'JK Kecemerlangan Koakademik (Std 3.2.5.1)',
    jawatanRasmi: 'Penyelaras Koakademik Pendidikan Islam (MTQ / Adab) & Moral',
    tahapBeban: 'RINGAN',
    mataBeban: 1,
    skpmBucket: 'Std 3.2',
    skpmStandardRef: 'SKPM Standard 3.2.5.1 & 5.2.1 — Kecemerlangan Koakademik PAI & Moral',
  },
];

export interface TeacherWorkloadRadarItem {
  teacherId: string;
  teacherName: string;
  email: string;
  totalMata: number;
  positionCount: number;
  beratCount: number;
  sederhanaCount: number;
  ringanCount: number;
  positions: MySGJawatankuasaItem[];
  ahliCount: number;
  ahliPositions: MySGJawatankuasaItem[];
}

export function mergeMySGCatalogWithSaved(
  savedList?: MySGJawatankuasaItem[] | null
): MySGJawatankuasaItem[] {
  if (!Array.isArray(savedList) || savedList.length === 0) {
    return MYSG_DEFAULT_CATALOG.map((item) => ({
      ...item,
      ahliList: item.ahliList ? [...item.ahliList] : [],
    }));
  }

  const savedByKod = new Map<string, MySGJawatankuasaItem>();
  savedList.forEach((s) => {
    if (s && s.kodMySG) {
      savedByKod.set(s.kodMySG, s);
    }
  });

  const defaultKods = new Set(MYSG_DEFAULT_CATALOG.map((d) => d.kodMySG));

  const mergedDefaults = MYSG_DEFAULT_CATALOG.map((def) => {
    const saved = savedByKod.get(def.kodMySG);
    if (!saved) {
      return { ...def, ahliList: [] };
    }
    const cleanAhli: MySGAhliItem[] = Array.isArray(saved.ahliList)
      ? saved.ahliList
          .filter((a) => a && (a.teacherId || a.teacherName))
          .map((a) => ({
            teacherId: String(a.teacherId || '').trim(),
            teacherName: String(a.teacherName || '').trim().toUpperCase(),
          }))
      : [];
    return {
      ...def,
      jawatankuasaInduk: saved.jawatankuasaInduk || def.jawatankuasaInduk,
      jawatanRasmi: saved.jawatanRasmi || def.jawatanRasmi,
      tahapBeban: saved.tahapBeban || def.tahapBeban,
      mataBeban: saved.mataBeban || def.mataBeban,
      assignedTeacherId: saved.assignedTeacherId || '',
      assignedTeacherName: saved.assignedTeacherName || '',
      ahliList: cleanAhli,
      customDueDate: saved.customDueDate || '',
    };
  });

  const customSaved = savedList
    .filter((s) => s && s.kodMySG && !defaultKods.has(s.kodMySG))
    .map((s) => ({
      ...s,
      assignedTeacherId: s.assignedTeacherId || '',
      assignedTeacherName: s.assignedTeacherName || '',
      ahliList: Array.isArray(s.ahliList)
        ? s.ahliList
            .filter((a) => a && (a.teacherId || a.teacherName))
            .map((a) => ({
              teacherId: String(a.teacherId || '').trim(),
              teacherName: String(a.teacherName || '').trim().toUpperCase(),
            }))
        : [],
    }));

  return [...mergedDefaults, ...customSaved];
}

export function computeTeacherWorkloadRadar(
  items: MySGJawatankuasaItem[],
  personnel: PersonnelProfile[]
): TeacherWorkloadRadarItem[] {
  const map = new Map<string, TeacherWorkloadRadarItem>();

  const findOrCreateEntry = (tIdRaw: string, tNameRaw: string): TeacherWorkloadRadarItem | null => {
    const tId = (tIdRaw || '').trim();
    const tName = (tNameRaw || '').trim().toUpperCase();
    if (!tId && !tName) return null;

    let entry = tId ? map.get(tId) : undefined;
    if (!entry && tName) {
      for (const candidate of map.values()) {
        if (candidate.teacherName === tName) {
          entry = candidate;
          break;
        }
      }
    }
    if (!entry) {
      const fallbackKey = tId || tName;
      entry = {
        teacherId: tId || tName,
        teacherName: tName || tId,
        email: '',
        totalMata: 0,
        positionCount: 0,
        beratCount: 0,
        sederhanaCount: 0,
        ringanCount: 0,
        positions: [],
        ahliCount: 0,
        ahliPositions: [],
      };
      map.set(fallbackKey, entry);
    }
    return entry;
  };

  personnel.forEach((p) => {
    const key = p.id || p.name.toUpperCase();
    map.set(key, {
      teacherId: p.id,
      teacherName: (p.name || '').toUpperCase(),
      email: p.email || '',
      totalMata: 0,
      positionCount: 0,
      beratCount: 0,
      sederhanaCount: 0,
      ringanCount: 0,
      positions: [],
      ahliCount: 0,
      ahliPositions: [],
    });
  });

  items.forEach((item) => {
    // 1. Primary Penyelaras / Ketua / Setiausaha (Load-bearing: BERAT=3, SEDERHANA=2, RINGAN=1)
    const entry = findOrCreateEntry(item.assignedTeacherId || '', item.assignedTeacherName || '');
    if (entry) {
      const mata =
        Number(item.mataBeban) ||
        (item.tahapBeban === 'BERAT' ? 3 : item.tahapBeban === 'SEDERHANA' ? 2 : 1);
      entry.totalMata += mata;
      entry.positionCount += 1;
      if (item.tahapBeban === 'BERAT') entry.beratCount += 1;
      else if (item.tahapBeban === 'SEDERHANA') entry.sederhanaCount += 1;
      else entry.ringanCount += 1;
      entry.positions.push(item);
    }

    // 2. Ahli Jawatankuasa (AJK) — 1 Mata Beban per committee
    if (Array.isArray(item.ahliList)) {
      item.ahliList.forEach((ahli) => {
        const ahliEntry = findOrCreateEntry(ahli.teacherId, ahli.teacherName);
        if (ahliEntry) {
          ahliEntry.totalMata += 1;
          ahliEntry.ahliCount += 1;
          ahliEntry.ahliPositions.push(item);
        }
      });
    }
  });

  return Array.from(map.values()).sort(
    (a, b) => b.totalMata - a.totalMata || a.teacherName.localeCompare(b.teacherName)
  );
}

