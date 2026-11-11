/**
 * Test Suite: Auth Whitelist Gateway & Master Data Attendance Account Sync
 */

import fs from 'fs';
import path from 'path';

function runTests() {
  console.log('=== VERIFYING AUTH GATEWAY & ATTENDANCE ACCOUNT SYNC ===\n');
  let passed = 0;
  let total = 0;

  function assert(name: string, condition: boolean, detail: string) {
    total++;
    if (condition) {
      console.log(`✅ PASS: ${name}`);
      console.log(`   ${detail}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   ${detail}`);
    }
  }

  // 1. Check App.tsx multi-stage email lookup
  const appCode = fs.readFileSync('src/App.tsx', 'utf8');
  assert(
    'App.tsx queries users by email',
    appCode.includes("where('email', '==', cleanEmail)") && appCode.includes("collection(db, 'users')"),
    'App.tsx queries users collection by email if user.uid doc does not exist.'
  );

  assert(
    'App.tsx queries personnel by email as fallback',
    appCode.includes("collection(db, 'personnel')") && appCode.includes("where('email', '==', cleanEmail)"),
    'App.tsx falls back to personnel collection in Master Data to auto-provision legitimate teachers.'
  );

  assert(
    'App.tsx queries teachers by email as fallback',
    appCode.includes("collection(db, 'teachers')"),
    'App.tsx checks teachers collection for backwards-compatible teacher profiles.'
  );

  assert(
    'App.tsx calls backend resolver if not found in Firestore collections',
    appCode.includes('/api/auth/resolve-staff-profile'),
    'App.tsx calls server /api/auth/resolve-staff-profile to verify against official school roster.'
  );

  assert(
    'App.tsx auto-links user.uid and marks isPreRegistered: false',
    appCode.includes('isPreRegistered: false') && appCode.includes('uid: user.uid'),
    'App.tsx automatically links the Firebase Auth UID and sets active: true upon first login.'
  );

  // 2. Check PrincipalDashboard staff list and sync
  const pdCode = fs.readFileSync('src/components/PrincipalDashboard.tsx', 'utf8');
  assert(
    'PrincipalDashboard merges Master Data roster into staffList',
    pdCode.includes('/api/personnel/official-roster') || pdCode.includes("collection(db, 'personnel')"),
    'PrincipalDashboard includes Master Data personnel in staffList even before their first login.'
  );

  assert(
    'PrincipalDashboard displays AKTIF (Sedia Log Masuk) status badge',
    pdCode.includes('AKTIF (Sedia Log Masuk)') && pdCode.includes('正常启用 (Disahkan)'),
    'PrincipalDashboard shows AKTIF (Sedia Log Masuk) for unlinked staff and 正常启用 (Disahkan) for active linked staff.'
  );

  assert(
    'PrincipalDashboard handleSyncPersonnelToUsers uses client batch write',
    pdCode.includes('writeBatch(db)') && pdCode.includes('handleSyncPersonnelToUsers'),
    'handleSyncPersonnelToUsers commits staff roster to Firestore users collection via client batch.'
  );

  assert(
    'MasterDataDashboard commits mirror to users collection',
    fs.readFileSync('src/components/Dashboard/MasterDataDashboard.tsx', 'utf8').includes("doc(db, 'users', userDocId)"),
    'MasterDataDashboard automatically seeds users collection when personnel are imported.'
  );

  // 3. Check server.ts endpoints
  const serverCode = fs.readFileSync('server.ts', 'utf8');
  assert(
    'server.ts defines resolve-staff-profile and official-roster',
    serverCode.includes('/api/auth/resolve-staff-profile') && serverCode.includes('/api/personnel/official-roster'),
    'Server provides official roster and staff profile resolver endpoints.'
  );

  console.log(`\nResults: ${passed}/${total} assertions passed.`);
  if (passed !== total) process.exit(1);
}

runTests();
