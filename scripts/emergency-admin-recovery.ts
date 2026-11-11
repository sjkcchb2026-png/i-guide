/**
 * iSEPADU AI — Emergency Administrator Recovery Tool
 * Sub-Phase 1A-2: Authentication & Privilege Hardening
 * 
 * Usage:
 *   npx tsx scripts/emergency-admin-recovery.ts <admin-email> [personnel-id]
 * 
 * Rationale:
 *   Provides an out-of-band, server-authoritative recovery mechanism in the event
 *   of catastrophic administrative lockout or bootstrap corruption.
 *   Preserves "MASUK SEKALI, GUNA BERKALI-KALI" by matching the existing personnel record.
 */

import path from 'path';
import fs from 'fs';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const adminDb = getFirestore(firebaseConfig.firestoreDatabaseId);
const adminAuth = getAuth();

async function getRuntimeSchoolCode(): Promise<string> {
  try {
    const generalDoc = await adminDb.doc('school_settings/general').get();
    if (generalDoc.exists) {
      const data = generalDoc.data();
      if (data?.schoolCode && typeof data.schoolCode === 'string' && data.schoolCode.trim()) {
        return data.schoolCode.trim().toUpperCase();
      }
    }
  } catch (err: any) {
    console.warn('Could not read school_settings/general, fallback to default:', err.message);
  }
  return 'YCC3404';
}

async function runRecovery() {
  const targetEmail = process.argv[2]?.trim().toLowerCase();
  const explicitPersonnelId = process.argv[3]?.trim();

  if (!targetEmail || !targetEmail.includes('@')) {
    console.error('❌ Error: Please provide a valid email address.');
    console.error('Usage: npx tsx scripts/emergency-admin-recovery.ts <target-email> [personnel-id]');
    process.exit(1);
  }

  console.log(`[RECOVERY] Initiating emergency admin recovery for: ${targetEmail}`);

  // 1. Fetch Auth user
  let userRecord;
  try {
    userRecord = await adminAuth.getUserByEmail(targetEmail);
    console.log(`[RECOVERY] Found Firebase Auth user UID: ${userRecord.uid}`);
  } catch (err: any) {
    console.error(`❌ Error: User ${targetEmail} not found in Firebase Auth: ${err.message}`);
    console.error('The user must sign in at least once via Google OAuth before recovery can assign claims.');
    process.exit(1);
  }

  // 2. Identity resolution against canonical personnel master
  let personnelId = explicitPersonnelId || '';
  let matchedName = userRecord.displayName || targetEmail.split('@')[0];

  if (!personnelId) {
    console.log(`[RECOVERY] Searching canonical personnel collection for ${targetEmail}...`);
    const pSnap = await adminDb.collection('personnel')
      .where('email', '==', targetEmail)
      .limit(1)
      .get();

    if (!pSnap.empty) {
      const pDoc = pSnap.docs[0];
      personnelId = pDoc.id;
      matchedName = pDoc.data()?.name || pDoc.data()?.nama || matchedName;
      console.log(`[RECOVERY] Matched existing personnel master record: ID=${personnelId}, Name=${matchedName}`);
    } else {
      personnelId = `staff_${userRecord.uid.substring(0, 8)}`;
      console.log(`[RECOVERY] No existing personnel doc matched. Assigning internal ID: ${personnelId}`);
    }
  }

  // 3. Resolve school code
  const schoolId = await getRuntimeSchoolCode();
  console.log(`[RECOVERY] Authoritative School Code: ${schoolId}`);

  // 4. Set Custom Claims
  const currentClaims = userRecord.customClaims || {};
  const newClaims = {
    ...currentClaims,
    personnelId,
    schoolId,
    isSystemAdmin: true,
    claimsVersion: ((currentClaims.claimsVersion as number) || 0) + 1,
  };

  await adminAuth.setCustomUserClaims(userRecord.uid, newClaims);
  console.log('[RECOVERY] Firebase Custom Claims successfully updated:', newClaims);

  // 5. Update Firestore Admin Registry, Governance Security, Profile, and Audit Log
  const batch = adminDb.batch();

  batch.set(adminDb.doc(`admins/${userRecord.uid}`), {
    email: targetEmail,
    role: 'SYSTEM_ADMIN',
    personnelId,
    recoveryGranted: true,
    active: true,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  batch.set(adminDb.doc('school_governance/security'), {
    firstAdminBootstrapped: true,
    firstAdminUid: userRecord.uid,
    firstAdminEmail: targetEmail,
    firstAdminPersonnelId: personnelId,
    bootstrapLocked: true,
    lastRecoveryAt: FieldValue.serverTimestamp(),
    schoolCode: schoolId,
  }, { merge: true });

  batch.set(adminDb.doc(`users/${userRecord.uid}`), {
    uid: userRecord.uid,
    name: matchedName,
    email: targetEmail,
    role: 'admin',
    active: true,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const auditRef = adminDb.collection('audit_trail').doc();
  batch.set(auditRef, {
    timestamp: new Date().toISOString(),
    actor_id: userRecord.uid,
    actor_name: targetEmail,
    actor_role: 'admin',
    action_type: 'EMERGENCY_ADMIN_RECOVERY_EXECUTED',
    layer: 'GOVERNANCE',
    entity_id: userRecord.uid,
    details: {
      targetEmail,
      personnelId,
      schoolCode: schoolId,
    },
  });

  await batch.commit();

  console.log('✅ [RECOVERY] Emergency recovery completed successfully.');
  console.log(`User ${targetEmail} (${userRecord.uid}) is now verified System Administrator.`);
}

runRecovery().catch((err) => {
  console.error('❌ Recovery execution failed:', err);
  process.exit(1);
});
