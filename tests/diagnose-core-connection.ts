import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { GoogleAuth } from 'google-auth-library';
import http from 'http';
import fs from 'fs';
import path from 'path';

async function diagnose() {
  console.log('=== RUNTIME IDENTITY & FIREBASE ADMIN DIAGNOSTIC ===\n');

  // 1. GoogleAuth ADC details
  const auth = new GoogleAuth();
  let projectId = '';
  let clientEmail = '';
  try {
    projectId = await auth.getProjectId();
  } catch (e: any) {
    projectId = `Error obtaining projectId: ${e.message}`;
  }

  try {
    const credentials = await auth.getCredentials();
    clientEmail = credentials.client_email || '(No client_email in credentials object)';
  } catch (e: any) {
    clientEmail = `Error obtaining credentials: ${e.message}`;
  }

  // Check metadata server if available (e.g. Cloud Run / GCE)
  let metadataServiceAccount = '';
  try {
    const metaPromise = new Promise<string>((resolve) => {
      const req = http.get(
        'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email',
        { headers: { 'Metadata-Flavor': 'Google' }, timeout: 1500 },
        (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(data.trim()));
        }
      );
      req.on('error', () => resolve('(Metadata server unreachable / local environment)'));
      req.on('timeout', () => { req.destroy(); resolve('(Metadata server timeout)'); });
    });
    metadataServiceAccount = await metaPromise;
  } catch {
    metadataServiceAccount = '(Unable to query metadata server)';
  }

  console.log('--- Runtime Identity ---');
  console.log('NODE_ENV:', process.env.NODE_ENV || 'undefined');
  console.log('GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS || '(not set)');
  console.log('GOOGLE_CLOUD_PROJECT:', process.env.GOOGLE_CLOUD_PROJECT || '(not set)');
  console.log('GOOGLE_CLOUD_QUOTA_PROJECT:', process.env.GOOGLE_CLOUD_QUOTA_PROJECT || '(not set)');
  console.log('ADC Default Project ID:', projectId);
  console.log('ADC Client Email:', clientEmail);
  console.log('GCP Metadata Service Account:', metadataServiceAccount);

  // 2. Inspect firebase-applet-config.json
  const configPath = path.resolve('firebase-applet-config.json');
  let appletConfig: any = {};
  if (fs.existsSync(configPath)) {
    appletConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  console.log('\n--- firebase-applet-config.json ---');
  console.log('Project ID:', appletConfig.projectId);
  console.log('Firestore Database ID:', appletConfig.firestoreDatabaseId);

  // 3. Test Core DB Connection
  const CORE_PROJECT_ID = 'gen-lang-client-0796671896';
  const CORE_DATABASE_ID = 'ai-studio-2b763e92-60bd-4b23-9079-2cba85c09a65';

  console.log('\n--- Probing Authoritative Core Database ---');
  console.log('Target Project:', CORE_PROJECT_ID);
  console.log('Target Database:', CORE_DATABASE_ID);

  const coreApp = getApps().find(a => a.name === 'diag-core') || initializeApp({
    projectId: CORE_PROJECT_ID,
  }, 'diag-core');

  const coreDb = getFirestore(coreApp, CORE_DATABASE_ID);

  // Attempt read-only probes
  console.log('\n1. Probing school_settings/general...');
  try {
    const docSnap = await coreDb.doc('school_settings/general').get();
    console.log('Status: SUCCESS (Document exists:', docSnap.exists, ')');
    if (docSnap.exists) {
      console.log('Data keys:', Object.keys(docSnap.data() || {}));
    }
  } catch (err: any) {
    console.log('Status: FAILED');
    console.log('Error Code:', err.code);
    console.log('Error Details:', err.details);
    console.log('Error Message:', err.message);
  }

  console.log('\n2. Probing personnel collection (limit 1)...');
  try {
    const colSnap = await coreDb.collection('personnel').limit(1).get();
    console.log('Status: SUCCESS (Collection size:', colSnap.size, ')');
  } catch (err: any) {
    console.log('Status: FAILED');
    console.log('Error Code:', err.code);
    console.log('Error Details:', err.details);
    console.log('Error Message:', err.message);
  }

  console.log('\n3. Probing (default) database on Core Project gen-lang-client-0796671896...');
  try {
    const defaultDb = getFirestore(coreApp); // default DB
    const colSnap = await defaultDb.collection('personnel').limit(1).get();
    console.log('Default DB Status: SUCCESS (Collection size:', colSnap.size, ')');
  } catch (err: any) {
    console.log('Default DB Status: FAILED');
    console.log('Default DB Error Code:', err.code);
    console.log('Default DB Error Message:', err.message);
  }

  // 4. Test Attendance DB Connection for comparison
  const ATTENDANCE_PROJECT_ID = 'gen-lang-client-0384285333';
  const ATTENDANCE_DATABASE_ID = 'ai-studio-9da55e18-8b12-4090-9356-16a74f3c27e2';
  console.log('\n--- Probing Attendance Database (Baseline) ---');
  console.log('Target Project:', ATTENDANCE_PROJECT_ID);
  console.log('Target Database:', ATTENDANCE_DATABASE_ID);

  const attApp = getApps().find(a => a.name === 'diag-att') || initializeApp({
    projectId: ATTENDANCE_PROJECT_ID,
  }, 'diag-att');
  const attDb = getFirestore(attApp, ATTENDANCE_DATABASE_ID);

  try {
    const docSnap = await attDb.doc('school_settings/general').get();
    console.log('Attendance Status: SUCCESS (Document exists:', docSnap.exists, ')');
  } catch (err: any) {
    console.log('Attendance Status: FAILED');
    console.log('Attendance Error Code:', err.code);
    console.log('Attendance Error Message:', err.message);
  }
}

diagnose().catch(err => {
  console.error('Diagnostic error:', err);
});
