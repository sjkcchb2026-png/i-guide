import { deepSanitizeFirestore } from '../src/utils/sanitizeFirestore';

console.log('--- 1. Testing deepSanitizeFirestore ---');

const inputWithUndefined = {
  rowNumber: 1,
  rowId: 'row_1',
  name: 'WONG JIA WEI',
  existingId: undefined,
  unmappedField: undefined,
  welfare: {
    isOku: false,
    disabilityCategory: undefined,
    bankAccountNumber: '',
    nested: {
      deepUndefined: undefined,
      deepValid: 'OK',
    },
  },
  guardian1: {
    name: 'WONG SENG',
    icNumber: undefined,
    mobilePhone: '0123456789',
  },
  items: [
    { id: 1, val: undefined },
    { id: 2, val: 'valid' },
  ],
  dateField: new Date('2026-01-01'),
};

const sanitized = deepSanitizeFirestore(inputWithUndefined);

console.log('Sanitized output existingId:', sanitized.existingId);
console.log('Sanitized output unmappedField:', sanitized.unmappedField);
console.log('Sanitized welfare.disabilityCategory:', sanitized.welfare.disabilityCategory);
console.log('Sanitized nested.deepUndefined:', sanitized.welfare.nested.deepUndefined);
console.log('Sanitized items[0].val:', sanitized.items[0].val);

// Assertions
if (sanitized.existingId !== null) {
  throw new Error(`Expected existingId to be null, got: ${sanitized.existingId}`);
}
if (sanitized.unmappedField !== null) {
  throw new Error(`Expected unmappedField to be null, got: ${sanitized.unmappedField}`);
}
if (sanitized.welfare.disabilityCategory !== null) {
  throw new Error(`Expected disabilityCategory to be null, got: ${sanitized.welfare.disabilityCategory}`);
}
if (sanitized.welfare.nested.deepUndefined !== null) {
  throw new Error(`Expected nested.deepUndefined to be null, got: ${sanitized.welfare.nested.deepUndefined}`);
}
if (sanitized.items[0].val !== null) {
  throw new Error(`Expected items[0].val to be null, got: ${sanitized.items[0].val}`);
}
if (!(sanitized.dateField instanceof Date)) {
  throw new Error('Expected dateField to preserve Date instance');
}

// Function to recursively assert no 'undefined' exists in any key
function assertNoUndefined(obj: any, path: string = '') {
  if (obj === undefined) {
    throw new Error(`Found undefined at path: ${path}`);
  }
  if (obj && typeof obj === 'object') {
    if (obj instanceof Date) return;
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) {
        throw new Error(`Found undefined at key: ${path}.${k}`);
      }
      assertNoUndefined(v, `${path}.${k}`);
    }
  }
}

assertNoUndefined(sanitized, 'root');
console.log('✅ deepSanitizeFirestore successfully sanitized all undefined values to null!');

console.log('\n--- 2. Testing Personnel to Users mapping logic ---');
const mockPersonnel = [
  {
    id: 'staff_1',
    name: 'LEE WEI PING',
    email: 'lee@moe-dl.edu.my',
    ic: '800101-13-1234',
    position: 'GURU BESAR',
    category: 'GURU',
    grade: 'DG48',
    phone: '0198887777',
  },
  {
    id: 'staff_2',
    name: 'TAN MEI LING',
    email: 'tan@moe-dl.edu.my',
    ic: '850505-13-5678',
    position: 'GURU PENOLONG KANAN',
    category: 'GURU',
    grade: 'DG44',
  },
  {
    id: 'staff_3',
    name: 'FATIMAH BINTI AHMAD',
    email: 'fatimah@gmail.com',
    ic: '900202-13-9999',
    position: 'PEMBANTU TADBIR (P/O)',
    category: 'AKP',
    grade: 'N19',
  },
];

for (const p of mockPersonnel) {
  const isPrincipal = p.position.toUpperCase().includes('GURU BESAR') || p.position.toUpperCase().includes('PENGETUA');
  const isAkp = p.category === 'AKP';
  const role = isPrincipal ? 'PRINCIPAL' : (isAkp ? 'AKP' : 'GURU');
  const category = isPrincipal ? 'PRINCIPAL' : (isAkp ? 'AKP' : 'GURU');

  const mappedUser = deepSanitizeFirestore({
    uid: p.id,
    name: p.name,
    email: p.email,
    category,
    role,
    phone: p.phone || '',
    ic: p.ic.replace(/[^0-9]/g, ''),
    grade: p.grade || '',
    position: p.position || '',
    personnelId: p.id,
    active: true,
  });

  assertNoUndefined(mappedUser, `mappedUser_${p.id}`);
  console.log(`✅ Staff ${p.name} -> Category: ${mappedUser.category}, Role: ${mappedUser.role}, Verified zero undefined.`);
}

console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
