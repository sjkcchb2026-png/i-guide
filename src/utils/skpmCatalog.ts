import { KokoActivity } from '../types/kokurikulum';

export type SKPMKokoStandardCode =
  | '3.2.1.1'
  | '3.2.2.1'
  | '3.2.3.1'
  | '3.2.4.1'
  | '3.2.5.1'
  | '3.2.6.1'
  | '3.2.7.1';

export interface SKPMKokoStandardOption {
  code: SKPMKokoStandardCode;
  shortTitle: string;
  standardTitle: string;
  aspekTitle: string;
  kualitiStatement: string;
  standard5Code?: '5.2.1' | '5.2.2' | '5.2.3';
  standard5Label?: string;
}

export const SKPM_KOKO_STANDARD_OPTIONS: SKPMKokoStandardOption[] = [
  {
    code: '3.2.1.1',
    shortTitle: '3.2.1.1 — Ketetapan Pelaksanaan Kokurikulum',
    standardTitle: 'STANDARD 3.2: PENGURUSAN KOKURIKULUM',
    aspekTitle: 'ASPEK 3.2.1: KETETAPAN PELAKSANAAN KOKURIKULUM',
    kualitiStatement:
      'Pelaksanaan kokurikulum diurus secara sistematik dan terancang.',
  },
  {
    code: '3.2.2.1',
    shortTitle: '3.2.2.1 — Pengurusan Kelab & Persatuan',
    standardTitle: 'STANDARD 3.2: PENGURUSAN KOKURIKULUM',
    aspekTitle: 'ASPEK 3.2.2: PENGURUSAN KELAB DAN PERSATUAN',
    kualitiStatement:
      'Kelab dan persatuan diurus secara sistematik dan terancang.',
    standard5Code: '5.2.1',
    standard5Label: 'Standard 5.2.1 — Kemenjadian Murid Dalam Kelab dan Persatuan',
  },
  {
    code: '3.2.3.1',
    shortTitle: '3.2.3.1 — Pengurusan Badan Beruniform',
    standardTitle: 'STANDARD 3.2: PENGURUSAN KOKURIKULUM',
    aspekTitle: 'ASPEK 3.2.3: PENGURUSAN BADAN BERUNIFORM',
    kualitiStatement:
      'Badan beruniform diurus secara sistematik dan terancang.',
    standard5Code: '5.2.2',
    standard5Label: 'Standard 5.2.2 — Kemenjadian Murid Dalam Badan Beruniform',
  },
  {
    code: '3.2.4.1',
    shortTitle: '3.2.4.1 — Pengurusan Sukan & Permainan (1M1S)',
    standardTitle: 'STANDARD 3.2: PENGURUSAN KOKURIKULUM',
    aspekTitle: 'ASPEK 3.2.4: PENGURUSAN SUKAN DAN PERMAINAN',
    kualitiStatement:
      'Sukan dan permainan diurus secara sistematik dan terancang.',
    standard5Code: '5.2.3',
    standard5Label: 'Standard 5.2.3 — Kemenjadian Murid Dalam Sukan dan Permainan',
  },
  {
    code: '3.2.5.1',
    shortTitle: '3.2.5.1 — Program Kecemerlangan Kokurikulum & Koakademik',
    standardTitle: 'STANDARD 3.2: PENGURUSAN KOKURIKULUM',
    aspekTitle: 'ASPEK 3.2.5: PROGRAM KECEMERLANGAN KOKURIKULUM',
    kualitiStatement:
      'Program kecemerlangan kokurikulum diurus secara profesional dan terancang.',
    standard5Code: '5.2.1',
    standard5Label:
      'Standard 5.2 (5.2.1 / 5.2.2 / 5.2.3) — Pencapaian & Kemenjadian Murid Dalam Kokurikulum',
  },
  {
    code: '3.2.6.1',
    shortTitle: '3.2.6.1 — Pengurusan Sukan Untuk Semua (Merentas Desa / Sukantara / Olahraga)',
    standardTitle: 'STANDARD 3.2: PENGURUSAN KOKURIKULUM',
    aspekTitle: 'ASPEK 3.2.6: PENGURUSAN SUKAN UNTUK SEMUA',
    kualitiStatement:
      'Aktiviti Sukan Untuk Semua diurus secara profesional dan terancang.',
    standard5Code: '5.2.3',
    standard5Label: 'Standard 5.2.3 — Kemenjadian Murid Dalam Sukan dan Permainan',
  },
  {
    code: '3.2.7.1',
    shortTitle: '3.2.7.1 — Pengurusan Pentaksiran Kokurikulum (PAJSK / SEGAK)',
    standardTitle: 'STANDARD 3.2: PENGURUSAN KOKURIKULUM',
    aspekTitle: 'ASPEK 3.2.7: PENGURUSAN PENTAKSIRAN KOKURIKULUM',
    kualitiStatement:
      'Pentaksiran kokurikulum dilaksanakan secara sistematik dan terancang.',
  },
];

export function getKokoSKPMOption(code?: string): SKPMKokoStandardOption {
  const found = SKPM_KOKO_STANDARD_OPTIONS.find((o) => o.code === code);
  return found || SKPM_KOKO_STANDARD_OPTIONS[4]; // Default 3.2.5.1
}

export function autoResolveKokoSKPM(params: {
  category?: KokoActivity['category'];
  jenis?: 'pertandingan' | 'aktiviti';
  level?: string;
  programName?: string;
  unit?: string;
  manualCode?: string;
}): SKPMKokoStandardOption {
  if (params.manualCode) {
    const manual = SKPM_KOKO_STANDARD_OPTIONS.find((o) => o.code === params.manualCode);
    if (manual) return manual;
  }

  const titleUpper = `${params.programName || ''} ${params.unit || ''}`.toUpperCase();

  if (params.category === 'PENTAKSIRAN_PAJSK' || /PAJSK|SEGAK|PENTAKSIRAN/.test(titleUpper)) {
    return getKokoSKPMOption('3.2.7.1');
  }
  if (
    params.category === 'SUKAN_UNTUK_SEMUA' ||
    /MERENTAS DESA|SUKANTARA|KEJOHANAN OLAHRAGA|HARI SUKAN NEGARA|SUKAN TAHUNAN/.test(titleUpper)
  ) {
    return getKokoSKPMOption('3.2.6.1');
  }
  if (params.category === 'KOKURIKULUM' || /MESYUARAT AGUNG|PENDAFTARAN AHLI/.test(titleUpper)) {
    return getKokoSKPMOption('3.2.1.1');
  }
  if (params.category === 'KOAKADEMIK' || params.jenis === 'pertandingan') {
    const base = getKokoSKPMOption('3.2.5.1');
    if (params.category === 'sport') {
      return {
        ...base,
        standard5Code: '5.2.3',
        standard5Label: 'Standard 5.2.3 — Kemenjadian Murid Dalam Sukan dan Permainan',
      };
    }
    if (params.category === 'uniform') {
      return {
        ...base,
        standard5Code: '5.2.2',
        standard5Label: 'Standard 5.2.2 — Kemenjadian Murid Dalam Badan Beruniform',
      };
    }
    return base;
  }
  if (params.category === 'uniform') {
    return getKokoSKPMOption('3.2.3.1');
  }
  if (params.category === 'sport') {
    return getKokoSKPMOption('3.2.4.1');
  }
  if (params.category === 'club') {
    return getKokoSKPMOption('3.2.2.1');
  }
  return getKokoSKPMOption('3.2.5.1');
}
