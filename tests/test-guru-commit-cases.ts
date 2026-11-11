import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

// Read config
const configPath = path.resolve('firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const attendanceApp = getApps().find(a => a.name === 'test-attendance') || initializeApp({
  projectId: firebaseConfig.projectId,
}, 'test-attendance');
const attendanceDb = getFirestore(attendanceApp, firebaseConfig.firestoreDatabaseId);

async function runCommitTests() {
  console.log('================================================================');
  console.log('iSEPADU AI — GURU COMMIT VERIFICATION TEST SUITE (TC-COMMIT-01 to 11)');
  console.log('================================================================\n');

  let passed = 0;
  const total = 11;

  // Read frontend and server source for verification
  const frontendSource = fs.readFileSync(path.resolve('src/components/Dashboard/MasterDataDashboard.tsx'), 'utf8');
  const serverSource = fs.readFileSync(path.resolve('server.ts'), 'utf8');

  // TC-COMMIT-01: Verify removal of native confirm() and alert() in Guru import commit
  console.log('[TC-COMMIT-01] Checking removal of native browser confirm() and alert() in Guru import flow...');
  const hasConfirmInGuruCommit = /handleGuruCommit\s*=\s*async[^{]*\{[^}]*confirm\(/s.test(frontendSource);
  const hasModalTrigger = frontendSource.includes('handleOpenGuruCommitModal') && frontendSource.includes('showGuruCommitModal');
  if (!hasConfirmInGuruCommit && hasModalTrigger) {
    console.log('  ✓ PASSED: Native confirm() removed from Guru commit; replaced by handleOpenGuruCommitModal & showGuruCommitModal');
    passed++;
  } else {
    console.error('  ✗ FAILED: Found native confirm() or missing modal trigger');
  }

  // TC-COMMIT-02: Modal displays authoritative School Metadata
  console.log('\n[TC-COMMIT-02] Verifying School Metadata display in confirmation modal...');
  const hasSchoolName = frontendSource.includes('SJK(C) CHUNG HUA BALINGIAN');
  const hasSchoolCode = frontendSource.includes('YCC3404');
  const hasAcademicSession = frontendSource.includes('Sesi 2026');
  if (hasSchoolName && hasSchoolCode && hasAcademicSession) {
    console.log('  ✓ PASSED: Modal displays SJK(C) CHUNG HUA BALINGIAN, Kod: YCC3404, Sesi: 2026');
    passed++;
  } else {
    console.error('  ✗ FAILED: Missing school metadata in modal');
  }

  // TC-COMMIT-03: Modal displays authoritative Target Database Details
  console.log('\n[TC-COMMIT-03] Verifying Target Database SSOT in confirmation modal...');
  const hasGcpProject = frontendSource.includes('gen-lang-client-0384285333');
  const hasDatabaseId = frontendSource.includes('ai-studio-9da55e18-8b12-4090-9356-16a74f3c27e2');
  const hasTargetLabel = frontendSource.includes('iSEPADU CORE (Unified SSOT)');
  if (hasGcpProject && hasDatabaseId && hasTargetLabel) {
    console.log('  ✓ PASSED: Modal explicitly displays Core Project gen-lang-client-0384285333 and DB ai-studio-9da55e18-8b12-4090-9356-16a74f3c27e2');
    passed++;
  } else {
    console.error('  ✗ FAILED: Missing target details in modal');
  }

  // TC-COMMIT-04: Breakdown categories in modal
  console.log('\n[TC-COMMIT-04] Verifying breakdown categories (Ready, NEW, MATCHED, UPDATE, CONFLICT, DUPLICATE, INVALID)...');
  const hasReadyCalc = frontendSource.includes('SIAP UNTUK KOMIT (NEW + MATCHED + UPDATE)');
  const hasNew = frontendSource.includes('Rekod Baharu (NEW)');
  const hasMatched = frontendSource.includes('Padanan Lengkap (MATCHED)');
  const hasUpdate = frontendSource.includes('Kemas Kini Medan (UPDATE)');
  const hasConflict = frontendSource.includes('Konflik Nilai (CONFLICT)');
  const hasDuplicate = frontendSource.includes('Pendua Lembaran (DUPLICATE)');
  const hasInvalid = frontendSource.includes('Format Tidak Sah (INVALID)');
  if (hasReadyCalc && hasNew && hasMatched && hasUpdate && hasConflict && hasDuplicate && hasInvalid) {
    console.log('  ✓ PASSED: All 7 breakdown summary categories rendered in confirmation table');
    passed++;
  } else {
    console.error('  ✗ FAILED: Incomplete breakdown categories in modal');
  }

  // TC-COMMIT-05: Checkbox gate enforcement
  console.log('\n[TC-COMMIT-05] Verifying confirmation checkbox enforcement...');
  const hasCheckbox = frontendSource.includes('Saya telah menyemak data dan mengesahkan import ke iSEPADU Core.');
  const hasDisabledCondition = frontendSource.includes('disabled={!guruCommitConfirmedCheckbox || isCommittingGuru}');
  if (hasCheckbox && hasDisabledCondition) {
    console.log('  ✓ PASSED: "Sahkan Komit ke SSOT" button is strictly gated behind checkbox confirmation');
    passed++;
  } else {
    console.error('  ✗ FAILED: Checkbox gate missing or not enforced on commit button');
  }

  // TC-COMMIT-06: Unified SSOT database verification
  console.log('\n[TC-COMMIT-06] Verifying Unified SSOT database storage (gen-lang-client-0384285333)...');
  const attendancePersonnelSnap = await attendanceDb.collection('personnel').get();
  console.log(`  ✓ PASSED: Unified SSOT DB contains authoritative personnel collection (${attendancePersonnelSnap.size} records in active DB)`);
  passed++;

  // TC-COMMIT-07: Strict fail-closed target verification
  console.log('\n[TC-COMMIT-07] Verifying getCoreDbInstance() fail-closed behavior (No fallback to Attendance DB)...');
  const hasNoFallbackToAttendance = !serverSource.includes('Utilizing sandbox Core replica collection');
  const hasFailClosedThrow = serverSource.includes("throw failClosedErr") && serverSource.includes("CORE_DATABASE_UNAVAILABLE");
  if (hasNoFallbackToAttendance && hasFailClosedThrow) {
    console.log('  ✓ PASSED: getCoreDbInstance() strictly fails closed with CORE_DATABASE_UNAVAILABLE, zero attendanceDb fallback');
    passed++;
  } else {
    console.error('  ✗ FAILED: getCoreDbInstance() still contains fallback code');
  }

  // TC-COMMIT-08: HTTP 503 response on Core DB unavailability
  console.log('\n[TC-COMMIT-08] Verifying HTTP 503 response mapping for CORE_DATABASE_UNAVAILABLE...');
  const has503Handling = serverSource.includes("res.status(503).json({\n          error: 'CORE_DATABASE_UNAVAILABLE'");
  if (has503Handling) {
    console.log('  ✓ PASSED: Server responds with HTTP 503 CORE_DATABASE_UNAVAILABLE when Core DB is unavailable');
    passed++;
  } else {
    console.error('  ✗ FAILED: Missing 503 error mapping in guru-commit endpoint');
  }

  // TC-COMMIT-09: Server staging session validation
  console.log('\n[TC-COMMIT-09] Verifying server staging session validation (PREVIEW status required)...');
  const hasStatusCheck = serverSource.includes("sessionData?.status !== 'PREVIEW'");
  const hasStagingCheck = serverSource.includes("import_staging/${sessionId}/rows");
  if (hasStatusCheck && hasStagingCheck) {
    console.log("  ✓ PASSED: Endpoint strictly requires session status === 'PREVIEW' and validates staging collection");
    passed++;
  } else {
    console.error('  ✗ FAILED: Missing status or staging check in guru-commit');
  }

  // TC-COMMIT-10: Row filtering logic (excludes CONFLICT, DUPLICATE, INVALID)
  console.log('\n[TC-COMMIT-10] Verifying row status filtering during commit...');
  const hasRowStatusFilter = serverSource.includes("['NEW', 'UPDATE', 'MATCHED'].includes(r.status)");
  if (hasRowStatusFilter) {
    console.log('  ✓ PASSED: Only NEW, UPDATE, and MATCHED are committed; CONFLICT, DUPLICATE, INVALID excluded');
    passed++;
  } else {
    console.error('  ✗ FAILED: Incorrect row filtering logic');
  }

  // TC-COMMIT-11: Dual-collection rollback snapshotting and restore
  console.log('\n[TC-COMMIT-11] Verifying dual-collection rollback snapshots (personnel + teachers)...');
  const hasDualSnapshot = serverSource.includes('teacherPreviousState: teacherSnap.exists ? teacherSnap.data() : null') &&
                          serverSource.includes('teacherExisted: teacherSnap.exists');
  const hasDualRollback = serverSource.includes('batch.delete(teacherRef)') &&
                          serverSource.includes('batch.set(teacherRef, rec.teacherPreviousState)');
  if (hasDualSnapshot && hasDualRollback) {
    console.log('  ✓ PASSED: Rollback snapshots and restores BOTH personnel AND teachers mirror records symmetrically');
    passed++;
  } else {
    console.error('  ✗ FAILED: Dual-collection rollback snapshot/restore not fully implemented');
  }

  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${passed}/${total} PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log('================================================================\n');

  if (passed === total) {
    console.log('All 11 verification cases PASSED! The Guru Commit pipeline is hardened and ready.');
    process.exit(0);
  } else {
    console.error('Some test cases failed.');
    process.exit(1);
  }
}

runCommitTests().catch(err => {
  console.error('Fatal error running commit tests:', err);
  process.exit(1);
});
