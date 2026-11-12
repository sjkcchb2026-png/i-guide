/**
 * Official Teacher Roster for SJK (C) Chung Hua Balingian (YCC3404)
 * Contains canonical personnel, initials/codes (Kod Singkatan), and email mappings.
 */

export interface OfficialTeacherEntry {
  id: string;
  name: string;
  code: string;
  num: number;
  email: string;
  position: string;
  category: 'GURU' | 'PRINCIPAL' | 'AKP';
  role: 'GURU' | 'PRINCIPAL' | 'AKP';
  gender?: 'L' | 'P';
  staffFileNo?: string;
  ic?: string;
  phone?: string;
  majorOption?: string;
}

export const OFFICIAL_TEACHERS: OfficialTeacherEntry[] = [
  {
    id: 'staff_850917135355',
    num: 1,
    code: 'TYM',
    name: 'TEO YANG MING',
    email: 'g-55297726@moe-dl.edu.my',
    position: 'GB',
    category: 'PRINCIPAL',
    role: 'PRINCIPAL',
    gender: 'L',
    staffFileNo: 'S38745',
    ic: '850917135355',
    phone: '0103919531',
    majorOption: 'PC',
  },
  {
    id: 'staff_710811135336',
    num: 2,
    code: 'HHH',
    name: 'HO HUI HUA',
    email: 'g-36297763@moe-dl.edu.my',
    position: 'PK 1',
    category: 'GURU',
    role: 'GURU',
    gender: 'P',
    staffFileNo: 'S29636',
    ic: '710811135336',
    phone: '0138458625',
    majorOption: 'MT',
  },
  {
    id: 'staff_970903136070',
    num: 3,
    code: 'TKI',
    name: 'TIONG KO ING',
    email: 'g-ipg007949@moe-dl.edu.my',
    position: 'PK HEM',
    category: 'GURU',
    role: 'GURU',
    gender: 'P',
    staffFileNo: 'S66897',
    ic: '970903136070',
    phone: '0138037203',
    majorOption: 'BNK',
  },
  {
    id: 'staff_001110131154',
    num: 4,
    code: 'JW',
    name: 'JENNY WONG',
    email: 'g-54567390@moe-dl.edu.my',
    position: 'PK KK',
    category: 'GURU',
    role: 'GURU',
    gender: 'P',
    staffFileNo: 'S63821',
    ic: '001110131154',
    phone: '01112017587',
    majorOption: 'BM',
  },
  {
    id: 'staff_890509136494',
    num: 5,
    code: 'NCY',
    name: 'NGU CHUI YING',
    email: 'g-94251439@moe-dl.edu.my',
    position: 'GAB',
    category: 'GURU',
    role: 'GURU',
    gender: 'P',
    staffFileNo: 'S59657',
    ic: '890509136494',
    phone: '0128093537',
    majorOption: 'SN',
  },
  {
    id: 'staff_941213136126',
    num: 6,
    code: 'LCI',
    name: 'LAI CHIN ING',
    email: 'g-26408405@moe-dl.edu.my',
    position: 'GPM',
    category: 'GURU',
    role: 'GURU',
    gender: 'P',
    staffFileNo: 'S59589',
    ic: '941213136126',
    phone: '0138108553',
    majorOption: 'SEJ',
  },
  {
    id: 'staff_000407130940',
    num: 7,
    code: 'LMI',
    name: 'LAI MEE ING',
    email: 'g-40568075@moe-dl.edu.my',
    position: 'GAB',
    category: 'GURU',
    role: 'GURU',
    gender: 'P',
    staffFileNo: 'S63867',
    ic: '000407130940',
    phone: '0178059407',
    majorOption: 'BM',
  },
  {
    id: 'staff_000717131252',
    num: 8,
    code: 'LRR',
    name: 'LAM RONG RONG',
    email: 'g-52567531@moe-dl.edu.my',
    position: 'GAB',
    category: 'GURU',
    role: 'GURU',
    gender: 'P',
    staffFileNo: 'S.63874',
    ic: '000717131252',
    phone: '0168162320',
    majorOption: 'BM',
  },
  {
    id: 'staff_991103135806',
    num: 9,
    code: 'DT',
    name: 'DORIS TIONG SHU QI',
    email: 'g-06569668@moe-dl.edu.my',
    position: 'GAB',
    category: 'GURU',
    role: 'GURU',
    gender: 'P',
    staffFileNo: 'S.63693',
    ic: '991103135806',
    phone: '0168089129',
    majorOption: 'BI',
  },
  {
    id: 'staff_010614130176',
    num: 10,
    code: 'KL',
    name: 'KELLY LAU SIAO ROU',
    email: 'g-76566396@moe-dl.edu.my',
    position: 'GAB',
    category: 'GURU',
    role: 'GURU',
    gender: 'P',
    staffFileNo: 'S63852',
    ic: '010614130176',
    phone: '01126809983',
    majorOption: 'BM',
  },
  {
    id: 'staff_001003130041',
    num: 11,
    code: 'VY',
    name: 'VICTOR YII ZI SHENG',
    email: 'g-41573054@moe-dl.edu.my',
    position: 'GP',
    category: 'GURU',
    role: 'GURU',
    gender: 'L',
    staffFileNo: 'S65300',
    ic: '001003130041',
    phone: '0178689297',
    majorOption: 'MT',
  },
  {
    id: 'staff_990117136186',
    num: 12,
    code: 'LSC',
    name: 'LIEW SHIAO CHING',
    email: 'g-86280367@moe-dl.edu.my',
    position: 'GAB',
    category: 'GURU',
    role: 'GURU',
    gender: 'P',
    staffFileNo: 'S64876',
    ic: '990117136186',
    phone: '0128705056',
    majorOption: 'BC',
  },
  {
    id: 'staff_970130145011',
    num: 13,
    code: 'MFA',
    name: 'MUHAMMAD FAHIM AMAR',
    email: 'muhammadfahimamar.abdulrahim@moe-dl.edu.my',
    position: 'GPI',
    category: 'GURU',
    role: 'GURU',
    gender: 'L',
    staffFileNo: 'S66948',
    ic: '970130145011',
    phone: '0175989262',
    majorOption: 'PAI',
  },
  {
    id: 'staff_030917131406',
    num: 14,
    code: 'SW',
    name: 'STEPHANIE WONG ENG HEE',
    email: 'g-ipgp21315167@moe-dl.edu.my',
    position: 'GAB',
    category: 'GURU',
    role: 'GURU',
    gender: 'P',
    staffFileNo: 'S68917',
    ic: '030917131406',
    phone: '01129433100',
    majorOption: 'PRA',
  },
];

/**
 * Generates teacher short code (Kod Singkatan):
 * Rule: If the name has 4 parts/words (e.g., Stephanie Wong Eng Hee), use only 2 short form letters (SW).
 */
export function generateTeacherShortCode(name: string): string {
  if (!name) return 'GR';
  const cleanName = name.replace(/\s+/g, ' ').trim();
  const upper = cleanName.toUpperCase();

  // Known override mappings:
  if (upper.includes('STEPHANIE') && upper.includes('WONG')) {
    return 'SW';
  }
  if (upper.includes('FAHIM') || upper.includes('AMAR')) {
    return 'MFA';
  }

  const rawWords = cleanName.split(' ').filter(Boolean);

  // If name has 4 words, use only the first 2 initials (e.g. Stephanie Wong Eng Hee -> SW)
  if (rawWords.length === 4) {
    return (rawWords[0][0] + rawWords[1][0]).toUpperCase();
  }

  // Filter out Malay connectors
  const filteredWords = rawWords.filter(
    (w) => !['BIN', 'BINTI', 'A/L', 'A/P', 'ANAK', 'BT', 'B.'].includes(w.toUpperCase())
  );

  if (filteredWords.length === 4) {
    return (filteredWords[0][0] + filteredWords[1][0]).toUpperCase();
  }

  if (filteredWords.length === 2) {
    return (filteredWords[0][0] + filteredWords[1][0]).toUpperCase();
  }

  if (filteredWords.length === 3) {
    return (filteredWords[0][0] + filteredWords[1][0] + filteredWords[2][0]).toUpperCase();
  }

  return filteredWords.map((w) => w[0]).join('').toUpperCase().slice(0, 3) || 'GR';
}
