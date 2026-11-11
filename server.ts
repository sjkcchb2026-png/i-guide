import express from 'express';
import type { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();
import * as XLSX from 'xlsx';
import crypto from 'crypto';

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import type { UserRecord } from 'firebase-admin/auth';
import type { StaffCategory, UserRole } from './src/types';

// Read Firebase config from firebase-applet-config.json
const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Explicitly target user Firebase project for Google Cloud SDK and quota attribution
process.env.GOOGLE_CLOUD_PROJECT = firebaseConfig.projectId;
process.env.GOOGLE_CLOUD_QUOTA_PROJECT = firebaseConfig.projectId;

// =========================================================================
// 1. STAFF ATTENDANCE FIREBASE TARGET (Preserved & Protected)
// Project: gen-lang-client-0384285333
// Database: ai-studio-9da55e18-8b12-4090-9356-16a74f3c27e2
// =========================================================================
const ATTENDANCE_PROJECT_ID = firebaseConfig.projectId;
const ATTENDANCE_DATABASE_ID = firebaseConfig.firestoreDatabaseId;

export const attendanceAdminApp = getApps().find(a => a.name === 'attendance') || initializeApp({
  projectId: ATTENDANCE_PROJECT_ID,
}, 'attendance');

export const attendanceDb = getFirestore(attendanceAdminApp, ATTENDANCE_DATABASE_ID);
attendanceDb.settings({ ignoreUndefinedProperties: true });
export const attendanceAuth = getAuth(attendanceAdminApp);

// =========================================================================
// 2. AUTHORITATIVE iSEPADU CORE TARGET (Canonical Personnel SSOT)
// Unified Target:
// Project: gen-lang-client-0384285333
// Database: ai-studio-9da55e18-8b12-4090-9356-16a74f3c27e2
// =========================================================================
export const EXPECTED_CORE_PROJECT_ID = 'gen-lang-client-0384285333';
export const EXPECTED_CORE_DATABASE_ID = 'ai-studio-9da55e18-8b12-4090-9356-16a74f3c27e2';

export const CORE_PROJECT_ID = process.env.CORE_FIREBASE_PROJECT_ID || EXPECTED_CORE_PROJECT_ID;
export const CORE_DATABASE_ID = process.env.CORE_FIRESTORE_DATABASE_ID || EXPECTED_CORE_DATABASE_ID;

export const coreAdminApp = getApps().find(a => a.name === 'core') || initializeApp({
  projectId: CORE_PROJECT_ID,
}, 'core');

export const coreDb = getFirestore(coreAdminApp, CORE_DATABASE_ID);
coreDb.settings({ ignoreUndefinedProperties: true });

// Deep sanitize helper to prevent Firestore undefined value errors
export function deepSanitizeFirestore<T = any>(val: T): T {
  if (val === undefined) {
    return null as any;
  }
  if (val === null || typeof val !== 'object') {
    return val;
  }
  if (
    val instanceof Date ||
    (val as any).constructor?.name === 'FieldValue' ||
    (val as any)._methodName ||
    (val as any).nanoseconds !== undefined
  ) {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(item => deepSanitizeFirestore(item)) as any;
  }
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(val)) {
    if (v === undefined) {
      result[k] = null;
    } else {
      result[k] = deepSanitizeFirestore(v);
    }
  }
  return result as any;
}

// Core database resolver: strictly targets authoritative Core DB - FAILS CLOSED with ZERO fallback to Attendance DB
export async function getCoreDbInstance(): Promise<{
  db: FirebaseFirestore.Firestore;
  targetCoreDb: FirebaseFirestore.Firestore;
  isTargetCore: boolean;
  targetInfo: string;
  projectId: string;
  databaseId: string;
}> {
  if (CORE_PROJECT_ID !== EXPECTED_CORE_PROJECT_ID || CORE_DATABASE_ID !== EXPECTED_CORE_DATABASE_ID) {
    const err: any = new Error(`INVALID_CORE_TARGET: Dijangka ${EXPECTED_CORE_PROJECT_ID}/${EXPECTED_CORE_DATABASE_ID}, tetapi menerima ${CORE_PROJECT_ID}/${CORE_DATABASE_ID}`);
    err.code = 'INVALID_CORE_TARGET';
    throw err;
  }

  try {
    await coreDb.collection('_iam_probe').limit(1).get();
    return {
      db: coreDb,
      targetCoreDb: coreDb,
      isTargetCore: true,
      targetInfo: `${CORE_PROJECT_ID}/${CORE_DATABASE_ID}`,
      projectId: CORE_PROJECT_ID,
      databaseId: CORE_DATABASE_ID,
    };
  } catch (probeErr: any) {
    console.warn(`[Core DB Standalone] Authoritative Core DB (${CORE_PROJECT_ID}/${CORE_DATABASE_ID}) probe inactive:`, probeErr?.message || probeErr);
    const failClosedErr: any = new Error('CORE_DATABASE_UNAVAILABLE');
    failClosedErr.code = 'CORE_DATABASE_UNAVAILABLE';
    failClosedErr.details = probeErr?.message || 'Akses ke pangkalan data Core gagal atau tiada kebenaran IAM.';
    failClosedErr.target = { projectId: CORE_PROJECT_ID, databaseId: CORE_DATABASE_ID };
    throw failClosedErr;
  }
}

// Preserve existing attendance aliases for attendance/auth routes
const adminDb = attendanceDb;
const adminAuth = attendanceAuth;

// Official server time in Asia/Kuala_Lumpur (UTC+8)
export function getMalaysiaDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date); // YYYY-MM-DD
}

// Helper: Convert Firestore REST field map to a standard JS object
export function parseFirestoreRestFields(fields: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(fields)) {
    if (val.stringValue !== undefined) result[key] = val.stringValue;
    else if (val.booleanValue !== undefined) result[key] = val.booleanValue;
    else if (val.integerValue !== undefined) result[key] = parseInt(val.integerValue, 10);
    else if (val.doubleValue !== undefined) result[key] = parseFloat(val.doubleValue);
    else if (val.timestampValue !== undefined) result[key] = val.timestampValue;
    else if (val.nullValue !== undefined) result[key] = null;
    else if (val.mapValue?.fields) result[key] = parseFirestoreRestFields(val.mapValue.fields);
    else if (val.arrayValue?.values) {
      result[key] = val.arrayValue.values.map((v: any) => {
        if (v.stringValue !== undefined) return v.stringValue;
        if (v.booleanValue !== undefined) return v.booleanValue;
        if (v.integerValue !== undefined) return parseInt(v.integerValue, 10);
        if (v.doubleValue !== undefined) return parseFloat(v.doubleValue);
        if (v.mapValue?.fields) return parseFirestoreRestFields(v.mapValue.fields);
        return v;
      });
    } else {
      result[key] = val;
    }
  }
  return result;
}

// Resilient Firestore REST document fetcher using Web API key for read-allowed collections
export async function fetchDocumentViaFirestoreRest(docPath: string): Promise<{ exists: boolean; data?: any }> {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/${docPath}?key=${firebaseConfig.apiKey}`;
    const res = await fetch(url);
    if (res.status === 404) {
      return { exists: false };
    }
    if (!res.ok) {
      return { exists: false };
    }
    const json = await res.json();
    if (!json || !json.fields) {
      return { exists: true, data: {} };
    }
    return { exists: true, data: parseFirestoreRestFields(json.fields) };
  } catch {
    return { exists: false };
  }
}

// Helper: White-label ready school code resolver
async function getRuntimeSchoolCode(): Promise<string> {
  try {
    try {
      const generalDoc = await adminDb.doc('school_settings/general').get();
      if (generalDoc.exists) {
        const data = generalDoc.data();
        if (data?.schoolCode && typeof data.schoolCode === 'string' && data.schoolCode.trim()) {
          return data.schoolCode.trim().toUpperCase();
        }
      }
    } catch {
      const restDoc = await fetchDocumentViaFirestoreRest('school_settings/general');
      if (restDoc.exists && restDoc.data?.schoolCode && typeof restDoc.data.schoolCode === 'string') {
        return restDoc.data.schoolCode.trim().toUpperCase();
      }
    }
  } catch (err) {
    console.warn('Error reading school_settings/general, using default fallback:', err);
  }
  return 'YCC3404';
}

// Helper: Verify caller Firebase Auth ID Token using Firebase Admin SDK with token revocation check
async function verifyCallerAuth(req: Request, checkRevoked: boolean = true): Promise<{ uid: string; email?: string; claims: any } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const idToken = authHeader.split('Bearer ')[1].trim();
  if (!idToken) return null;

  try {
    const decoded = await adminAuth.verifyIdToken(idToken, checkRevoked);
    return {
      uid: decoded.uid,
      email: decoded.email,
      claims: decoded,
    };
  } catch (err: any) {
    if (err?.code === 'auth/id-token-revoked') {
      console.warn('ID Token is revoked for caller:', err?.message);
    } else {
      console.error('Admin Auth verifyIdToken error:', err?.message || err);
    }
    return null;
  }
}

// Helper: Check if caller is registered Principal AND user profile exists with active === true
async function isCallerPrincipal(uid: string, callerClaims?: any): Promise<boolean> {
  try {
    // 1. Check verified token claims if provided (zero latency, zero network)
    if (callerClaims?.isPrincipal === true) {
      return true;
    }

    // 2. Check school_settings/general authoritative principalUid
    try {
      const settingsDoc = await adminDb.doc('school_settings/general').get();
      if (settingsDoc.exists && settingsDoc.data()?.principalUid === uid) {
        return true;
      }
    } catch (dbErr) {
      console.warn('Error checking school_settings for principalUid:', dbErr);
    }

    // 3. Check canonical users/{uid} collection
    try {
      const userDoc = await adminDb.doc(`users/${uid}`).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        if (userData?.active === true && (userData.role === 'principal' || userData.role === 'PRINCIPAL' || userData.category === 'PRINCIPAL')) {
          return true;
        }
      }
    } catch (userErr) {
      console.warn('Error checking users collection for principal:', userErr);
    }

    // 4. Legacy compatibility fallback for admins collection
    try {
      const adminDoc = await adminDb.doc(`admins/${uid}`).get();
      if (adminDoc.exists && adminDoc.data()?.role === 'PRINCIPAL') {
        return true;
      }
    } catch (adminErr) {
      console.warn('Error checking admins collection for principal:', adminErr);
    }

    // 5. Try adminAuth custom claims as fallback
    try {
      const authUser = await adminAuth.getUser(uid);
      if (authUser.customClaims?.isPrincipal === true) {
        return true;
      }
    } catch {
      // Ignore Auth API lookup errors (e.g. Identity Toolkit disabled in environment)
    }

    return false;
  } catch (err) {
    console.error('Error verifying principal role and active status:', err);
    return false;
  }
}

// Helper: Check if caller has System Administrator authority
async function isCallerSystemAdmin(uid: string, callerClaims?: any): Promise<boolean> {
  try {
    // 1. Check verified token claims if provided (zero latency, zero network)
    if (callerClaims?.isSystemAdmin === true) {
      return true;
    }

    // 2. Check school_governance/security authoritative firstAdminUid
    try {
      const secDoc = await adminDb.doc('school_governance/security').get();
      if (secDoc.exists && secDoc.data()?.firstAdminUid === uid) {
        return true;
      }
    } catch (secErr) {
      console.warn('Error checking school_governance for admin:', secErr);
    }

    // 3. Check canonical users/{uid} collection
    try {
      const userDoc = await adminDb.doc(`users/${uid}`).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        if (userData?.active === true && (userData.role === 'admin' || userData.role === 'ADMIN' || userData.role === 'SYSTEM_ADMIN' || userData.category === 'PENTADBIR')) {
          return true;
        }
      }
    } catch (userErr) {
      console.warn('Error checking users collection for admin:', userErr);
    }

    // 4. Legacy compatibility fallback for admins collection
    try {
      const adminDoc = await adminDb.doc(`admins/${uid}`).get();
      if (adminDoc.exists && (adminDoc.data()?.role === 'SYSTEM_ADMIN' || adminDoc.data()?.role === 'ADMIN')) {
        return true;
      }
    } catch (adminErr) {
      console.warn('Error checking admins collection for admin:', adminErr);
    }

    // 5. Try adminAuth custom claims as fallback
    try {
      const authUser = await adminAuth.getUser(uid);
      if (authUser.customClaims?.isSystemAdmin === true) {
        return true;
      }
    } catch {
      // Ignore Auth API lookup errors
    }

    return false;
  } catch (err) {
    console.error('Error verifying system admin role:', err);
    return false;
  }
}

// In-memory mutex per user to serialize concurrent requests and avoid double clicks
const userLocks = new Map<string, Promise<any>>();

async function withUserLock<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  const prevLock = userLocks.get(uid) || Promise.resolve();
  let release: () => void;
  const currentLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  userLocks.set(uid, prevLock.then(() => currentLock).catch(() => currentLock));
  await prevLock;
  try {
    return await fn();
  } finally {
    release!();
    if (userLocks.get(uid) === currentLock) {
      userLocks.delete(uid);
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Serve static assets from public/ directory (icons, manifest, service worker)
  app.use(express.static(path.resolve('public')));

  // Explicit PWA Manifest & Service Worker Endpoints for external scanners (PWABuilder, Google Lighthouse)
  app.get(['/manifest.json', '/manifest.webmanifest'], (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(path.resolve('public/manifest.json'));
  });

  app.get(['/sw.js', '/service-worker.js'], (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.resolve('public/sw.js'));
  });

  // Public endpoint: Fetch current school basic configuration (White-label ready)
  app.get('/api/school-info', async (_req: Request, res: Response) => {
    try {
      let data: any = null;
      let exists = false;

      // 1. First attempt via Firebase Admin SDK
      try {
        const generalDoc = await adminDb.doc('school_settings/general').get();
        if (generalDoc.exists) {
          exists = true;
          data = generalDoc.data();
        }
      } catch {
        // Fallback to Firestore REST API using Web API key (handles sandbox without GCP ADC IAM)
        const restResult = await fetchDocumentViaFirestoreRest('school_settings/general');
        if (restResult.exists && restResult.data) {
          exists = true;
          data = restResult.data;
        }
      }

      if (!exists || !data) {
        return res.json({ 
          initialized: false,
          schoolCode: 'YCC3404',
          schoolName: 'SJK (C) CHUNG HUA BALINGIAN',
          schoolLogo: '',
        });
      }

      return res.json({
        initialized: true,
        schoolName: data?.schoolName || 'SJK (C) CHUNG HUA BALINGIAN',
        schoolCode: data?.schoolCode || 'YCC3404',
        principalEmail: data?.principalEmail || '',
        schoolLogo: data?.schoolLogo || '',
      });
    } catch (err: any) {
      console.warn('Error fetching school-info:', err.message);
      return res.json({ 
        initialized: false,
        schoolCode: 'YCC3404',
        schoolName: 'SJK (C) CHUNG HUA BALINGIAN',
        schoolLogo: '',
      });
    }
  });

  // Endpoint: Extract School Logo from URL (supports direct image URL or web page extraction)
  app.post('/api/extract-logo', async (req: Request, res: Response) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== 'string' || !url.trim().startsWith('http')) {
        return res.status(400).json({ 
          success: false, 
          message: 'Sila masukkan URL yang sah bermula dengan http:// atau https://' 
        });
      }

      const targetUrl = url.trim();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/*,text/html;q=0.9,*/*;q=0.8'
        }
      });
      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';

      // Case 1: Direct Image URL
      if (contentType.startsWith('image/')) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');
        const mime = contentType.split(';')[0] || 'image/png';
        const dataUrl = `data:${mime};base64,${base64}`;

        return res.json({
          success: true,
          type: 'direct_image',
          logoUrl: dataUrl,
          rawUrl: targetUrl,
          sizeBytes: buffer.length,
          mime
        });
      }

      // Case 2: Web page HTML (extract og:image, favicon, or logo img)
      if (contentType.includes('text/html')) {
        const html = await response.text();
        let extractedImgUrl = '';

        const ogMatch = html.match(/<meta[^>]+property=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["'](?:og:image|twitter:image)["']/i);
        if (ogMatch && ogMatch[1]) {
          extractedImgUrl = ogMatch[1];
        }

        if (!extractedImgUrl) {
          const logoImgMatch = html.match(/<img[^>]+src=["']([^"']+)["'][^>]+(?:class|id|alt)=["'][^"']*logo[^"']*["']/i) ||
                               html.match(/<img[^>]+(?:class|id|alt)=["'][^"']*logo[^"']*["'][^>]+src=["']([^"']+)["']/i) ||
                               html.match(/<img[^>]+src=["']([^"']*(?:logo|crest|emblem)[^"']*)["']/i);
          if (logoImgMatch && logoImgMatch[1]) {
            extractedImgUrl = logoImgMatch[1];
          }
        }

        if (!extractedImgUrl) {
          const iconMatch = html.match(/<link[^>]+rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]+href=["']([^"']+)["']/i);
          if (iconMatch && iconMatch[1]) {
            extractedImgUrl = iconMatch[1];
          }
        }

        if (extractedImgUrl) {
          const resolvedUrl = new URL(extractedImgUrl, targetUrl).href;
          try {
            const imgRes = await fetch(resolvedUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const imgContentType = imgRes.headers.get('content-type') || 'image/png';
            const imgBuf = Buffer.from(await imgRes.arrayBuffer());
            const dataUrl = `data:${imgContentType.split(';')[0]};base64,${imgBuf.toString('base64')}`;

            return res.json({
              success: true,
              type: 'extracted_from_page',
              logoUrl: dataUrl,
              rawUrl: resolvedUrl,
              sizeBytes: imgBuf.length,
              mime: imgContentType
            });
          } catch {
            return res.json({
              success: true,
              type: 'extracted_url_only',
              logoUrl: resolvedUrl,
              rawUrl: resolvedUrl
            });
          }
        }
      }

      return res.status(404).json({
        success: false,
        message: 'Tidak dapat mengesan imej logo daripada URL tersebut. Sila pastikan pautan terus kepada fail imej (PNG, JPG, SVG, WebP).'
      });
    } catch (err: any) {
      console.error('Extract logo error:', err);
      return res.status(500).json({
        success: false,
        message: `Ralat mengekstrak logo: ${err.message}`
      });
    }
  });

  // Endpoint: Update School Logo in school_settings and school_config
  app.post('/api/update-school-logo', async (req: Request, res: Response) => {
    try {
      const { schoolLogo } = req.body;
      const logoValue = typeof schoolLogo === 'string' ? schoolLogo.trim() : '';

      await adminDb.doc('school_settings/general').set({
        schoolLogo: logoValue,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      try {
        await adminDb.doc('school_config/default').set({
          schoolLogo: logoValue,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (e) {
        // Safe ignore
      }

      return res.json({ success: true, schoolLogo: logoValue });
    } catch (err: any) {
      console.error('Update logo error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // Safe Read-Only Core Health Probe Endpoint (Non-sensitive, no secrets)
  app.get('/api/system/core-health', async (_req: Request, res: Response) => {
    try {
      const probeSnap = await coreDb.doc('school_settings/general').get();
      return res.json({
        status: 'OK',
        projectId: CORE_PROJECT_ID,
        databaseId: CORE_DATABASE_ID,
        adminApp: coreAdminApp.name,
        target: `${CORE_PROJECT_ID}/${CORE_DATABASE_ID}`,
        connection: 'PASS',
        documentExists: probeSnap.exists,
      });
    } catch (err: any) {
      return res.status(503).json({
        status: 'UNAVAILABLE',
        projectId: CORE_PROJECT_ID,
        databaseId: CORE_DATABASE_ID,
        adminApp: coreAdminApp.name,
        target: `${CORE_PROJECT_ID}/${CORE_DATABASE_ID}`,
        connection: 'FAIL',
        errorCode: err.code || 'UNKNOWN',
        errorMessage: err.message || 'Connection failed',
      });
    }
  });

  // ================= 1. SAFE SCHOOL SETUP (SETUP_TOKEN + TRANSACTION + ROLLBACK) =================
  app.post('/api/setup/init-school', async (req: Request, res: Response) => {
    const { setupToken, schoolName, schoolCode, principalEmail, principalPassword, principalName } = req.body;

    // 1. Strict Server Environment Token Verification (No default fallback key!)
    const expectedToken = process.env.SETUP_TOKEN;
    if (!expectedToken || !expectedToken.trim()) {
      return res.status(500).json({
        error: '系统安全拒绝：服务器尚未配置 SETUP_TOKEN 环境变量。请在服务器配置有效密钥后再执行学校初始化。',
      });
    }
    if (!setupToken || setupToken.trim() !== expectedToken.trim()) {
      return res.status(401).json({
        error: '安全校验失败：无效或缺少一次性初始化设立密钥 (SETUP_TOKEN)。',
      });
    }

    if (!schoolName || !principalEmail || !principalPassword) {
      return res.status(400).json({ error: '请完整填写学校全称、校长邮箱与管理密码。' });
    }
    if (principalPassword.length < 6) {
      return res.status(400).json({ error: '密码最少需 6 位字符。' });
    }

    const cleanEmail = principalEmail.trim().toLowerCase();
    let createdUid: string | null = null;
    let uid = (req.body.principalUid || '').trim();

    try {
      // 2. Pre-check: Ensure school is not already initialized
      const generalDoc = await adminDb.doc('school_settings/general').get();
      if (generalDoc.exists) {
        return res.status(400).json({ error: '系统已完成初始化设定，禁止重复执行！' });
      }

      // 3. Create or resolve Principal account via Admin Auth if UID not provided
      if (!uid) {
        try {
          const createdAuthUser = await adminAuth.createUser({
            email: cleanEmail,
            password: principalPassword,
            displayName: (principalName || '').trim() || '校长',
          });
          createdUid = createdAuthUser.uid;
          uid = createdAuthUser.uid;
        } catch (authErr: any) {
          if (authErr.code === 'auth/email-already-exists') {
            try {
              const existingUser = await adminAuth.getUserByEmail(cleanEmail);
              uid = existingUser.uid;
              await adminAuth.updateUser(uid, {
                password: principalPassword,
                displayName: (principalName || '').trim() || '校长',
              });
            } catch (resolveErr: any) {
              return res.status(400).json({
                error: `该校长邮箱已被占用，且无法重置: ${resolveErr.message}`,
              });
            }
          } else {
            return res.status(400).json({
              error: `创建校长认证账号失败: ${authErr.message || '邮箱可能已被注册'}`,
            });
          }
        }
      }

      // 4. Atomic Firestore Transaction for School Settings, Admin Registry, and Profile
      await adminDb.runTransaction(async (transaction) => {
        const settingsRef = adminDb.doc('school_settings/general');
        const settingsSnap = await transaction.get(settingsRef);
        if (settingsSnap.exists) {
          throw new Error('ALREADY_INITIALIZED');
        }

        const adminRef = adminDb.doc(`admins/${uid}`);
        const userRef = adminDb.doc(`users/${uid}`);

        transaction.set(settingsRef, {
          schoolName: schoolName.trim(),
          schoolCode: (schoolCode || '').trim().toUpperCase(),
          principalEmail: cleanEmail,
          principalUid: uid,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        transaction.set(adminRef, {
          email: cleanEmail,
          role: 'PRINCIPAL',
          createdAt: FieldValue.serverTimestamp(),
        });

        transaction.set(userRef, {
          uid,
          name: (principalName || '').trim() || '校长',
          email: cleanEmail,
          category: 'PRINCIPAL',
          role: 'PRINCIPAL',
          hasClerkAccess: true,
          active: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      return res.json({ success: true, uid });
    } catch (err: any) {
      console.error('Error during school setup transaction:', err);

      // Recovery rollback: Delete created auth user if database transaction failed
      if (createdUid) {
        try {
          await adminAuth.deleteUser(createdUid);
          console.log(`Rolled back auth user ${createdUid} after transaction failure.`);
        } catch (cleanupErr) {
          console.error('Failed to cleanup auth user on rollback:', cleanupErr);
        }
      }

      const msg = err.message === 'ALREADY_INITIALIZED'
        ? '系统已完成初始化设立，禁止重复执行！'
        : (err.message || '初始化数据库事务失败，已回滚。');

      return res.status(500).json({ error: msg });
    }
  });

  // ================= 1A-2. SAFE FIRST SYSTEM ADMIN BOOTSTRAP (IDEMPOTENT 5-STEP STATE MACHINE) =================
  app.post('/api/auth/bootstrap-first-admin', async (req: Request, res: Response) => {
    const caller = await verifyCallerAuth(req, true);
    if (!caller || !caller.email) {
      return res.status(401).json({ error: '未授权：请先通过 Google / DELIMa 登录。' });
    }

    const cleanEmail = caller.email.toLowerCase().trim();
    const secRef = adminDb.doc('school_governance/security');

    return await withUserLock('first_admin_bootstrap', async () => {
      try {
        const secSnap = await secRef.get();
        const existingData = secSnap.exists ? secSnap.data() : null;

        // Idempotency Check: Already completed by this user
        if (existingData?.status === 'BOOTSTRAP_COMPLETED' && existingData?.firstAdminUid === caller.uid) {
          const schoolCode = existingData.schoolCode || await getRuntimeSchoolCode();
          return res.json({
            success: true,
            idempotent: true,
            message: '第一系统管理员 (First System Admin) 初始化已完成，幂等返回现有会话。',
            personnelId: existingData.firstAdminPersonnelId,
            schoolId: schoolCode,
            isSystemAdmin: true,
            isPrincipal: false,
            status: 'BOOTSTRAP_COMPLETED',
          });
        }

        // Rejection Check: Already completed and locked by someone else
        if (existingData?.bootstrapLocked === true && existingData?.firstAdminUid && existingData?.firstAdminUid !== caller.uid) {
          return res.status(403).json({
            error: '安全拒绝：第一系统管理员已完成初始化设立 (Bootstrap Locked)。禁止重复执行！',
            firstAdminEmail: existingData.firstAdminEmail,
          });
        }

        // STEP 1: BOOTSTRAP_INITIATED
        await secRef.set({
          status: 'BOOTSTRAP_INITIATED',
          initiatedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          initiatorUid: caller.uid,
          initiatorEmail: cleanEmail,
        }, { merge: true });

        // STEP 2: IDENTITY_VERIFIED (MASUK SEKALI, GUNA BERKALI-KALI)
        let personnelId = '';
        let matchedName = '';
        const personnelQuery = await adminDb.collection('personnel')
          .where('email', '==', cleanEmail)
          .limit(1)
          .get();

        if (!personnelQuery.empty) {
          const pDoc = personnelQuery.docs[0];
          personnelId = pDoc.id;
          matchedName = pDoc.data()?.name || pDoc.data()?.nama || '';
        } else {
          // Check if external operator requested
          if (req.body.isExternalOperator === true) {
            personnelId = `ext_operator_${caller.uid.substring(0, 8)}`;
            matchedName = (req.body.operatorName || cleanEmail.split('@')[0]).trim();
          } else {
            // Fallback staff ID using caller UID prefix without polluting canonical personnel
            personnelId = `staff_${caller.uid.substring(0, 8)}`;
            matchedName = cleanEmail.split('@')[0];
          }
        }

        const schoolId = await getRuntimeSchoolCode();

        await secRef.update({
          status: 'IDENTITY_VERIFIED',
          firstAdminPersonnelId: personnelId,
          firstAdminName: matchedName,
          schoolCode: schoolId,
          updatedAt: FieldValue.serverTimestamp(),
        });

        // STEP 3: CLAIMS_ASSIGNED (Coarse Custom Claims <150 bytes)
        const claims = {
          personnelId,
          schoolId,
          isPrincipal: false, // Strict separation: Admin is NOT Principal
          isSystemAdmin: true,
          claimsVersion: 1,
        };
        await adminAuth.setCustomUserClaims(caller.uid, claims);

        await secRef.update({
          status: 'CLAIMS_ASSIGNED',
          updatedAt: FieldValue.serverTimestamp(),
        });

        // STEP 4: GOVERNANCE_RECORDED
        const batch = adminDb.batch();

        batch.set(secRef, {
          status: 'GOVERNANCE_RECORDED',
          firstAdminBootstrapped: true,
          firstAdminUid: caller.uid,
          firstAdminEmail: cleanEmail,
          firstAdminPersonnelId: personnelId,
          schoolCode: schoolId,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        // Canonical user profile
        batch.set(adminDb.doc(`users/${caller.uid}`), {
          uid: caller.uid,
          name: matchedName || 'SISTEM PENTADBIR',
          email: cleanEmail,
          category: 'GURU',
          role: 'admin',
          active: true,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        // Backward-compatibility projection for legacy attendance admin reader
        batch.set(adminDb.doc(`admins/${caller.uid}`), {
          email: cleanEmail,
          role: 'SYSTEM_ADMIN',
          personnelId,
          active: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        // Canonical audit trail entry (Single Source of Truth)
        const auditRef = adminDb.collection('audit_trail').doc();
        batch.set(auditRef, {
          timestamp: new Date().toISOString(),
          actor_id: caller.uid,
          actor_name: matchedName || cleanEmail,
          actor_role: 'admin',
          action_type: 'BOOTSTRAP_FIRST_ADMIN_SUCCESS',
          layer: 'GOVERNANCE',
          entity_id: caller.uid,
          details: {
            email: cleanEmail,
            personnelId,
            schoolCode: schoolId,
            stateMachine: '5-STEP_IDEMPOTENT',
          },
        });

        await batch.commit();

        // STEP 5: BOOTSTRAP_COMPLETED
        await secRef.update({
          status: 'BOOTSTRAP_COMPLETED',
          bootstrapLocked: true,
          completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        return res.json({
          success: true,
          message: '第一系统管理员 (First System Admin) 初始化引导成功。',
          claims,
          personnelId,
          schoolId,
          isSystemAdmin: true,
          isPrincipal: false,
          status: 'BOOTSTRAP_COMPLETED',
        });
      } catch (err: any) {
        console.error('Error during first admin bootstrap state machine:', err);
        // Mark interrupted state for audit and safe reconciliation
        try {
          await secRef.set({
            status: 'BOOTSTRAP_INCOMPLETE',
            errorReason: err.message || 'Bootstrap step failed',
            interruptedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });

          await adminDb.collection('audit_trail').add({
            timestamp: new Date().toISOString(),
            actor_id: caller.uid,
            actor_name: cleanEmail,
            actor_role: 'admin',
            action_type: 'BOOTSTRAP_FIRST_ADMIN_INTERRUPTED',
            layer: 'GOVERNANCE',
            entity_id: caller.uid,
            details: {
              error: err.message,
            },
          });
        } catch (recordErr) {
          console.error('Failed to record BOOTSTRAP_INCOMPLETE state:', recordErr);
        }

        return res.status(500).json({
          error: err.message || '第一管理员引导失败。系统已记录中断状态 (BOOTSTRAP_INCOMPLETE)。',
          status: 'BOOTSTRAP_INCOMPLETE',
        });
      }
    });
  });

  // ================= 1A-2. FETCH AUTH CLAIMS & WORKSPACE ACCESS =================
  app.get('/api/auth/claims', async (req: Request, res: Response) => {
    const caller = await verifyCallerAuth(req, true);
    if (!caller) {
      return res.status(401).json({ error: '未授权：请先登录' });
    }

    try {
      const authUser = await adminAuth.getUser(caller.uid);
      const claims = authUser.customClaims || {};
      const schoolCode = await getRuntimeSchoolCode();

      // Read governance assignments for this personnel if available
      let governanceAssignments = null;
      if (claims.personnelId) {
        const govDoc = await adminDb.doc(`governance_assignments/${claims.personnelId}`).get();
        if (govDoc.exists) {
          governanceAssignments = govDoc.data();
        }
      }

      return res.json({
        uid: caller.uid,
        email: caller.email,
        claims: {
          personnelId: claims.personnelId || '',
          schoolId: claims.schoolId || schoolCode,
          isPrincipal: claims.isPrincipal === true,
          isSystemAdmin: claims.isSystemAdmin === true,
          claimsVersion: claims.claimsVersion || 1,
        },
        governanceAssignments,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ================= 1A-2. STAGED RECOVERABLE PRINCIPAL TRANSFER =================
  app.post('/api/governance/initiate-principal-transfer', async (req: Request, res: Response) => {
    const caller = await verifyCallerAuth(req, true);
    if (!caller) {
      return res.status(401).json({ error: '未授权：请先登录' });
    }

    // Must be either System Admin or Current Principal
    const [isSysAdmin, isPrincipal] = await Promise.all([
      isCallerSystemAdmin(caller.uid),
      isCallerPrincipal(caller.uid),
    ]);

    if (!isSysAdmin && !isPrincipal) {
      return res.status(403).json({ error: '禁止访问：只有现任校长或系统管理员可发起校长职权交接。' });
    }

    const { targetUid, targetPersonnelId } = req.body;
    if (!targetUid || typeof targetUid !== 'string') {
      return res.status(400).json({ error: '请提供接任校长的有效 Auth UID。' });
    }

    const transferDocRef = adminDb.doc('school_governance/principal_transfer');

    return await withUserLock('principal_transfer', async () => {
      // Check for ongoing transfer
      const activeSnap = await transferDocRef.get();
      if (activeSnap.exists) {
        const existing = activeSnap.data();
        if (existing?.status && !['IDLE', 'TRANSFER_COMPLETED', 'TRANSFER_INCOMPLETE'].includes(existing.status)) {
          return res.status(409).json({
            error: '另一项校长移交程序正在进行中，请先等待完成或调用恢复接口。',
            currentStatus: existing.status,
            transferId: existing.transferId,
          });
        }
      }

      // Verify target user in Firebase Auth
      let targetUser: UserRecord;
      try {
        targetUser = await adminAuth.getUser(targetUid);
      } catch (authErr: any) {
        return res.status(400).json({ error: `目标接任用户在认证系统中不存在: ${authErr.message}` });
      }

      // Fetch current Principal identity
      const schoolSettingsSnap = await adminDb.doc('school_settings/general').get();
      const oldPrincipalUid = schoolSettingsSnap.data()?.principalUid || '';
      const oldPrincipalEmail = schoolSettingsSnap.data()?.principalEmail || '';
      const schoolCode = await getRuntimeSchoolCode();

      const transferId = `transfer_${Date.now()}`;
      const resolvedTargetPersonnelId = targetPersonnelId || targetUser.customClaims?.personnelId || targetUid;

      // STAGE 1: TRANSFER_INITIATED
      await transferDocRef.set({
        transferId,
        fromUid: oldPrincipalUid,
        fromEmail: oldPrincipalEmail,
        toUid: targetUid,
        toEmail: targetUser.email || '',
        toPersonnelId: resolvedTargetPersonnelId,
        status: 'TRANSFER_INITIATED',
        initiatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        initiatedBy: caller.uid,
      });

      try {
        // STAGE 2: NEW_PRINCIPAL_AUTHORIZED
        const targetClaims = (targetUser.customClaims || {}) as any;
        await adminAuth.setCustomUserClaims(targetUid, {
          ...targetClaims,
          personnelId: resolvedTargetPersonnelId,
          schoolId: schoolCode,
          isPrincipal: true,
          claimsVersion: (targetClaims.claimsVersion || 0) + 1,
        });

        await transferDocRef.update({
          status: 'NEW_PRINCIPAL_AUTHORIZED',
          updatedAt: FieldValue.serverTimestamp(),
        });

        // STAGE 3: OLD_PRINCIPAL_REVOKED
        if (oldPrincipalUid && oldPrincipalUid !== targetUid) {
          try {
            const oldUser = await adminAuth.getUser(oldPrincipalUid);
            const oldClaims = (oldUser.customClaims || {}) as any;
            await adminAuth.setCustomUserClaims(oldPrincipalUid, {
              ...oldClaims,
              isPrincipal: false,
              claimsVersion: (oldClaims.claimsVersion || 0) + 1,
            });
            // Revoke active refresh tokens immediately to prevent dual authority
            await adminAuth.revokeRefreshTokens(oldPrincipalUid);
          } catch (oldErr: any) {
            console.warn('Could not revoke old principal claims:', oldErr.message);
          }
        }

        await transferDocRef.update({
          status: 'OLD_PRINCIPAL_REVOKED',
          updatedAt: FieldValue.serverTimestamp(),
        });

        // STAGE 4: GOVERNANCE_UPDATED
        const batch = adminDb.batch();
        batch.set(adminDb.doc('school_settings/general'), {
          principalUid: targetUid,
          principalEmail: (targetUser.email || '').toLowerCase().trim(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        batch.set(adminDb.doc(`admins/${targetUid}`), {
          email: (targetUser.email || '').toLowerCase().trim(),
          role: 'PRINCIPAL',
          personnelId: resolvedTargetPersonnelId,
          active: true,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        batch.set(adminDb.doc(`users/${targetUid}`), {
          category: 'PRINCIPAL',
          role: 'principal',
          hasClerkAccess: true,
          active: true,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        if (oldPrincipalUid && oldPrincipalUid !== targetUid) {
          batch.set(adminDb.doc(`users/${oldPrincipalUid}`), {
            category: 'GURU',
            role: 'subject_teacher',
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          batch.delete(adminDb.doc(`admins/${oldPrincipalUid}`));
        }

        await batch.commit();

        await transferDocRef.update({
          status: 'GOVERNANCE_UPDATED',
          updatedAt: FieldValue.serverTimestamp(),
        });

        // STAGE 5: TRANSFER_COMPLETED
        await transferDocRef.update({
          status: 'TRANSFER_COMPLETED',
          completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        await adminDb.collection('audit_trail').add({
          timestamp: new Date().toISOString(),
          actor_id: caller.uid,
          actor_name: caller.email || 'Admin',
          actor_role: isSysAdmin ? 'admin' : 'principal',
          action_type: 'PRINCIPAL_TRANSFER_COMPLETED',
          layer: 'GOVERNANCE',
          entity_id: targetUid,
          details: {
            transferId,
            fromUid: oldPrincipalUid,
            toUid: targetUid,
            toPersonnelId: resolvedTargetPersonnelId,
          },
        });

        return res.json({
          success: true,
          transferId,
          status: 'TRANSFER_COMPLETED',
          newPrincipalUid: targetUid,
        });
      } catch (stageErr: any) {
        console.error('Error during Principal Transfer staging:', stageErr);
        await transferDocRef.update({
          status: 'TRANSFER_INCOMPLETE',
          errorReason: stageErr.message || 'Staging step failed',
          interruptedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        await adminDb.collection('audit_trail').add({
          timestamp: new Date().toISOString(),
          actor_id: caller.uid,
          actor_name: caller.email || 'Admin',
          actor_role: isSysAdmin ? 'admin' : 'principal',
          action_type: 'PRINCIPAL_TRANSFER_INTERRUPTED',
          layer: 'GOVERNANCE',
          entity_id: targetUid,
          details: {
            transferId,
            error: stageErr.message,
          },
        });

        return res.status(500).json({
          error: '校长职权交接被中断。系统已安全记录中断阶段 (TRANSFER_INCOMPLETE)，可通过恢复接口 resume-principal-transfer 继续完成。',
          transferId,
          status: 'TRANSFER_INCOMPLETE',
          details: stageErr.message,
        });
      }
    });
  });

  // ================= 1A-2. RESUME INTERRUPTED PRINCIPAL TRANSFER =================
  app.post('/api/governance/resume-principal-transfer', async (req: Request, res: Response) => {
    const caller = await verifyCallerAuth(req, true);
    if (!caller) {
      return res.status(401).json({ error: '未授权：请先登录' });
    }

    const [isSysAdmin, isPrincipal] = await Promise.all([
      isCallerSystemAdmin(caller.uid),
      isCallerPrincipal(caller.uid),
    ]);

    if (!isSysAdmin && !isPrincipal) {
      return res.status(403).json({ error: '禁止访问：只有校长或系统管理员可恢复交接程序。' });
    }

    const transferDocRef = adminDb.doc('school_governance/principal_transfer');

    return await withUserLock('principal_transfer', async () => {
      const snap = await transferDocRef.get();
      if (!snap.exists) {
        return res.status(404).json({ error: '未发现任何交接记录。' });
      }

      const transfer = snap.data();
      if (transfer?.status === 'TRANSFER_COMPLETED') {
        return res.json({
          message: '校长职权交接已顺利完成，无需恢复。',
          status: 'TRANSFER_COMPLETED',
          transferId: transfer.transferId,
        });
      }

      const { targetUid, fromUid, toPersonnelId, transferId } = {
        targetUid: transfer?.toUid,
        fromUid: transfer?.fromUid,
        toPersonnelId: transfer?.toPersonnelId,
        transferId: transfer?.transferId,
      };

      if (!targetUid) {
        return res.status(400).json({ error: '交接记录损坏：缺少目标 UID。' });
      }

      const schoolCode = await getRuntimeSchoolCode();

      try {
        // Re-execute remaining stages
        const targetUser = await adminAuth.getUser(targetUid);
        const targetClaims = (targetUser.customClaims || {}) as any;

        // Stage 2 check & apply
        if (targetClaims.isPrincipal !== true) {
          await adminAuth.setCustomUserClaims(targetUid, {
            ...targetClaims,
            personnelId: toPersonnelId || targetUid,
            schoolId: schoolCode,
            isPrincipal: true,
            claimsVersion: (targetClaims.claimsVersion || 0) + 1,
          });
          await transferDocRef.update({
            status: 'NEW_PRINCIPAL_AUTHORIZED',
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        // Stage 3 check & apply
        if (fromUid && fromUid !== targetUid) {
          try {
            const oldUser = await adminAuth.getUser(fromUid);
            const oldClaims = (oldUser.customClaims || {}) as any;
            if (oldClaims.isPrincipal === true) {
              await adminAuth.setCustomUserClaims(fromUid, {
                ...oldClaims,
                isPrincipal: false,
                claimsVersion: (oldClaims.claimsVersion || 0) + 1,
              });
              await adminAuth.revokeRefreshTokens(fromUid);
            }
          } catch (e: any) {
            console.warn('Could not revoke old principal:', e.message);
          }
          await transferDocRef.update({
            status: 'OLD_PRINCIPAL_REVOKED',
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        // Stage 4 check & apply
        const batch = adminDb.batch();
        batch.set(adminDb.doc('school_settings/general'), {
          principalUid: targetUid,
          principalEmail: (targetUser.email || '').toLowerCase().trim(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        batch.set(adminDb.doc(`admins/${targetUid}`), {
          email: (targetUser.email || '').toLowerCase().trim(),
          role: 'PRINCIPAL',
          personnelId: toPersonnelId || targetUid,
          active: true,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        batch.set(adminDb.doc(`users/${targetUid}`), {
          category: 'PRINCIPAL',
          role: 'principal',
          hasClerkAccess: true,
          active: true,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        if (fromUid && fromUid !== targetUid) {
          batch.set(adminDb.doc(`users/${fromUid}`), {
            category: 'GURU',
            role: 'subject_teacher',
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          batch.delete(adminDb.doc(`admins/${fromUid}`));
        }

        await batch.commit();

        await transferDocRef.update({
          status: 'GOVERNANCE_UPDATED',
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Stage 5
        await transferDocRef.update({
          status: 'TRANSFER_COMPLETED',
          completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        await adminDb.collection('audit_trail').add({
          timestamp: new Date().toISOString(),
          actor_id: caller.uid,
          actor_name: caller.email || 'Admin',
          actor_role: isSysAdmin ? 'admin' : 'principal',
          action_type: 'PRINCIPAL_TRANSFER_RESUMED_AND_COMPLETED',
          layer: 'GOVERNANCE',
          entity_id: targetUid,
          details: {
            transferId,
            fromUid,
            toUid: targetUid,
          },
        });

        return res.json({
          success: true,
          message: '已成功恢复并完成校长职权交接。',
          status: 'TRANSFER_COMPLETED',
          transferId,
        });
      } catch (err: any) {
        return res.status(500).json({ error: `恢复交接程序失败: ${err.message}` });
      }
    });
  });

  // ================= 1A-2. MANAGE SYSTEM ADMINISTRATORS =================
  app.post('/api/governance/manage-admin', async (req: Request, res: Response) => {
    const caller = await verifyCallerAuth(req, true);
    if (!caller) {
      return res.status(401).json({ error: '未授权：请先登录' });
    }

    const isSysAdmin = await isCallerSystemAdmin(caller.uid);
    if (!isSysAdmin) {
      return res.status(403).json({ error: '禁止访问：只有系统管理员可授予或撤回管理权限。' });
    }

    const { targetUid, action } = req.body;
    if (!targetUid || (action !== 'GRANT' && action !== 'REVOKE')) {
      return res.status(400).json({ error: '请提供有效的 targetUid 及 action (GRANT 或 REVOKE)。' });
    }

    if (action === 'REVOKE' && targetUid === caller.uid) {
      return res.status(400).json({ error: '安全拒绝：禁止撤回自身系统管理员权限，以防系统无管理员可用。' });
    }

    try {
      const targetUser = await adminAuth.getUser(targetUid);
      const currentClaims = (targetUser.customClaims || {}) as any;
      const schoolCode = await getRuntimeSchoolCode();

      if (action === 'GRANT') {
        await adminAuth.setCustomUserClaims(targetUid, {
          ...currentClaims,
          schoolId: currentClaims.schoolId || schoolCode,
          personnelId: currentClaims.personnelId || targetUid,
          isSystemAdmin: true,
          claimsVersion: (currentClaims.claimsVersion || 0) + 1,
        });

        await adminDb.doc(`admins/${targetUid}`).set({
          email: (targetUser.email || '').toLowerCase().trim(),
          role: 'SYSTEM_ADMIN',
          grantedBy: caller.uid,
          updatedAt: FieldValue.serverTimestamp(),
          active: true,
        }, { merge: true });

        await adminDb.collection('audit_trail').add({
          timestamp: new Date().toISOString(),
          actor_id: caller.uid,
          actor_name: caller.email || 'Admin',
          actor_role: 'admin',
          action_type: 'ADMIN_PERMISSION_GRANTED',
          layer: 'GOVERNANCE',
          entity_id: targetUid,
          details: {
            targetUid,
            grantedBy: caller.uid,
          },
        });

        return res.json({ success: true, message: '已成功授予该用户系统管理员权限。' });
      } else {
        await adminAuth.setCustomUserClaims(targetUid, {
          ...currentClaims,
          isSystemAdmin: false,
          claimsVersion: (currentClaims.claimsVersion || 0) + 1,
        });

        // Revoke active refresh tokens
        await adminAuth.revokeRefreshTokens(targetUid);

        await adminDb.doc(`admins/${targetUid}`).delete();

        await adminDb.collection('audit_trail').add({
          timestamp: new Date().toISOString(),
          actor_id: caller.uid,
          actor_name: caller.email || 'Admin',
          actor_role: 'admin',
          action_type: 'ADMIN_PERMISSION_REVOKED',
          layer: 'GOVERNANCE',
          entity_id: targetUid,
          details: {
            targetUid,
            revokedBy: caller.uid,
          },
        });

        return res.json({ success: true, message: '已成功撤回该用户系统管理员权限，已注销其有效令牌。' });
      }
    } catch (err: any) {
      return res.status(500).json({ error: err.message || '管理管理员权限失败。' });
    }
  });

  // ================= 1A-3. UPDATE STAFF ROLE / CATEGORY (GURU vs AKP) =================
  app.post('/api/admin/update-staff-category', async (req: Request, res: Response) => {
    try {
      const caller = await verifyCallerAuth(req);
      if (!caller) {
        return res.status(401).json({ error: 'Sila log masuk terlebih dahulu.' });
      }

      const { userId, userEmail, category } = req.body;
      if (!userId || (category !== 'GURU' && category !== 'AKP')) {
        return res.status(400).json({ error: 'userId dan category (GURU/AKP) diperlukan.' });
      }

      // 1. Update in users collection
      const userDocRef = adminDb.doc(`users/${userId}`);
      const userSnap = await userDocRef.get();
      if (userSnap.exists) {
        await userDocRef.update({
          category,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        await userDocRef.set({
          category,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      // 2. Synchronize to personnel collection (Master Data)
      let personnelUpdated = false;
      const directPersonnelRef = adminDb.doc(`personnel/${userId}`);
      const directSnap = await directPersonnelRef.get();
      if (directSnap.exists) {
        await directPersonnelRef.update({
          category,
          updatedAt: FieldValue.serverTimestamp(),
        });
        personnelUpdated = true;
      }

      // If not updated by userId, match by email
      const searchEmail = (userEmail || (userSnap.exists ? userSnap.data()?.email : '') || '').toLowerCase().trim();
      if (searchEmail) {
        const pSnap = await adminDb.collection('personnel').where('email', '==', searchEmail).get();
        for (const pDoc of pSnap.docs) {
          await pDoc.ref.update({
            category,
            updatedAt: FieldValue.serverTimestamp(),
          });
          personnelUpdated = true;
        }
      }

      // 3. Audit trail
      await adminDb.collection('audit_trail').add({
        timestamp: new Date().toISOString(),
        actor_id: caller.uid,
        actor_name: caller.email || 'Admin',
        actor_role: 'admin',
        action_type: 'STAFF_CATEGORY_UPDATED',
        layer: 'MASTER_DATA',
        entity_id: userId,
        details: {
          targetUserId: userId,
          targetEmail: searchEmail,
          newCategory: category,
          personnelUpdated,
        },
      });

      return res.json({
        success: true,
        message: `Peranan staf berjaya dikemaskini kepada ${category}.`,
        userId,
        category,
        personnelUpdated,
      });
    } catch (err: any) {
      console.error('Error updating staff category:', err);
      return res.status(500).json({ error: `Gagal mengemaskini peranan: ${err.message}` });
    }
  });

  // ================= 1B-GURU. GOOGLE SHEETS GURU IMPORT & SAFE ROSTER PIPELINE =================

  // Helper: Extract Spreadsheet ID and optional GID from Google Sheets URL
  function extractGoogleSpreadsheetId(url: string): { spreadsheetId: string; gid?: string } | null {
    try {
      const trimmed = url.trim();
      const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
      if (!match) return null;
      const spreadsheetId = match[1];
      const gidMatch = trimmed.match(/[?#&]gid=([0-9]+)/i);
      return { spreadsheetId, gid: gidMatch ? gidMatch[1] : undefined };
    } catch {
      return null;
    }
  }

  // Helper: Normalize sheet header strings
  function normalizeHeaderKey(header: string): string {
    return header.trim().toUpperCase().replace(/[\s\t\.\/\-_]+/g, ' ');
  }

  // Helper: Mask IC for privacy protection
  function maskIcNumber(raw: string): string {
    const clean = (raw || '').replace(/[^0-9]/g, '');
    if (clean.length === 12) {
      return `${clean.slice(0, 6)}-**-**${clean.slice(-2)}`;
    }
    if (clean.length >= 4) {
      return `${clean.slice(0, 2)}******${clean.slice(-2)}`;
    }
    return clean ? '******' : '-';
  }

  // Helper: Map arbitrary school sheet row to normalized Guru model
  function mapRowToGuru(rawRow: Record<string, any>) {
    const normMap: Record<string, string> = {};
    for (const [key, val] of Object.entries(rawRow)) {
      const cleanK = normalizeHeaderKey(key);
      normMap[cleanK] = val !== undefined && val !== null ? String(val).trim() : '';
    }

    const getByAlias = (...aliases: string[]): string => {
      for (const a of aliases) {
        const normA = normalizeHeaderKey(a);
        if (normMap[normA] !== undefined && normMap[normA] !== '') {
          return normMap[normA];
        }
      }
      for (const [k, v] of Object.entries(normMap)) {
        for (const a of aliases) {
          const normA = normalizeHeaderKey(a);
          if (k.includes(normA) || normA.includes(k)) {
            if (v !== '') return v;
          }
        }
      }
      return '';
    };

    const name = getByAlias('NAMA GURU', 'NAMA', 'NAME');
    const rawGender = getByAlias('JAN', 'JANTINA', 'GENDER');
    const gender: 'L' | 'P' = (rawGender.toUpperCase().startsWith('P') || rawGender.toUpperCase() === 'F' || rawGender.toUpperCase().includes('PEREMPUAN')) ? 'P' : 'L';
    const staffFileNo = getByAlias('NO FAIL', 'NO. FAIL', 'NO FAIL PERKHIDMATAN', 'NOFAIL', 'FAIL');
    const rawIc = getByAlias('NO KP', 'NO K P', 'NO KAD PENGENALAN', 'NO IC', 'IC', 'KP', 'MYKAD');
    const ic = rawIc.replace(/[^0-9]/g, '');
    const maskedIc = maskIcNumber(ic);
    const grade = getByAlias('GRED', 'GRED JAWATAN', 'GRADE');
    const position = getByAlias('JAWATAN', 'POSITION'); // Preserves original JAWATAN
    const datePlaced = getByAlias('TARIKH DITEMPATKAN', 'DITEMPATKAN');
    const dateAppointed = getByAlias('TARIKH LANTIKAN KENAIKAN PANGKAT', 'TARIKH LANTIKAN', 'LANTIKAN');
    const dateConfirmed = getByAlias('TARIKH SAH JAWATAN SEMASA', 'TARIKH SAH JAWATAN', 'SAH JAWATAN');
    const majorOption = getByAlias('OPSYEN MAJOR', 'MAJOR', 'OPSYEN');
    const minorOption = getByAlias('OPSYEN MINOR', 'MINOR');
    const datePensionStatus = getByAlias('TARIKH TARAF BERPENCEN', 'TARAF BERPENCEN');
    const datePension = getByAlias('TARIKH PENCEN', 'PENCEN');
    const dateNextPromotion = getByAlias('TARIKH KENAIKAN PANGKAT TERDEKAT', 'KENAIKAN PANGKAT TERDEKAT');
    const phone = getByAlias('NO HP', 'NO. HP', 'NO TELEFON', 'TELEFON', 'HP', 'PHONE');
    const email = getByAlias('EMAIL', 'E MEL', 'EMEL', 'E-MEL').toLowerCase();
    const apcReceived = getByAlias('PENERIMAAN APC', 'APC');

    // Classify GURU vs AKP using actual position / jawatan and grade data (NOT solely from email domain)
    const posUpper = position.toUpperCase().trim();
    const gradeUpper = grade.toUpperCase().trim();

    let category: 'GURU' | 'AKP' = 'GURU';
    let leadershipRole: 'GURU_BESAR' | 'PK_PENTADBIRAN' | 'PK_HEM' | 'PK_KOKURIKULUM' | 'PENOLONG_KANAN' | null = null;

    const isAkpGrade = gradeUpper.startsWith('N') || gradeUpper.startsWith('H') || gradeUpper.startsWith('C') || gradeUpper.startsWith('FA');
    const isAkpPosition = posUpper.includes('PEMBANTU') || posUpper.includes('PPM') || posUpper.includes('PT') || posUpper.includes('PKA') || posUpper.includes('PEJABAT') || posUpper.includes('OPERASI') || posUpper.includes('MAKMAL') || posUpper.includes('AKP') || posUpper.includes('KERANI') || posUpper.includes('JURUTEKNIK');

    const emailLower = email.trim().toLowerCase();
    const isGuruEmail = emailLower.startsWith('g-') || emailLower.startsWith('g.');

    if (isAkpGrade || isAkpPosition || !isGuruEmail) {
      // 只要没有 g- 开始，或者属于 AKP 职衔，一律为 AKP
      category = 'AKP';
      leadershipRole = null;
    } else {
      category = 'GURU';
      if (
        posUpper === 'GB' ||
        posUpper.startsWith('GB ') ||
        posUpper.includes('GURU BESAR') ||
        posUpper.includes('PENGETUA')
      ) {
        leadershipRole = 'GURU_BESAR';
      } else if (
        posUpper.includes('PK 1') ||
        posUpper.includes('PK1') ||
        posUpper.includes('PK PENTADBIRAN') ||
        posUpper.includes('GPK 1') ||
        posUpper.includes('GPK1') ||
        posUpper.includes('GPK PENTADBIRAN')
      ) {
        leadershipRole = 'PK_PENTADBIRAN';
      } else if (
        posUpper.includes('PK HEM') ||
        posUpper.includes('PKHEM') ||
        posUpper.includes('GPK HEM')
      ) {
        leadershipRole = 'PK_HEM';
      } else if (
        posUpper.includes('PK KK') ||
        posUpper.includes('PKKK') ||
        posUpper.includes('PK KOKU') ||
        posUpper.includes('GPK KK') ||
        posUpper.includes('GPK KOKU')
      ) {
        leadershipRole = 'PK_KOKURIKULUM';
      } else if (
        posUpper.includes('PENOLONG KANAN') ||
        posUpper.startsWith('PK ') ||
        posUpper === 'PK' ||
        posUpper.startsWith('GPK')
      ) {
        leadershipRole = 'PENOLONG_KANAN';
      } else {
        leadershipRole = null;
      }
    }

    let employmentStatus = 'Tetap';
    if (position.toLowerCase().includes('kontrak') || grade.toLowerCase().includes('kontrak')) {
      employmentStatus = 'Kontrak';
    } else if (position.toLowerCase().includes('sambilan')) {
      employmentStatus = 'Sambilan';
    }

    let teachingStatus = 'Aktif';
    if (position.toLowerCase().includes('cuti') || name.toLowerCase().includes('(cuti)')) {
      teachingStatus = 'Cuti';
    }

    return {
      raw: rawRow,
      name: name.toUpperCase(),
      gender,
      ic,
      maskedIc,
      staffFileNo,
      grade,
      position, // Preserves original JAWATAN
      category, // Normalized operational category: GURU | AKP
      leadershipRole, // GURU_BESAR | PENOLONG_KANAN | null
      datePlaced,
      dateAppointed,
      dateConfirmed,
      majorOption,
      minorOption,
      datePensionStatus,
      datePension,
      dateNextPromotion,
      phone,
      email,
      apcReceived,
      employmentStatus,
      teachingStatus,
    };
  }

  // =========================================================================
  // OFFICIAL STAFF ROSTER PARSER FROM ASSETS
  // =========================================================================
  function loadOfficialStaffRoster(): any[] {
    try {
      const csvPath = path.resolve('public/assets/aistudio/Senarai_Nama_Staf_SJK_Chung_Hua_177531fe');
      if (!fs.existsSync(csvPath)) return [];
      const content = fs.readFileSync(csvPath, 'utf8');
      const wb = XLSX.read(content, { type: 'string' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
      let headerIdx = -1;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r && r.some((c: any) => String(c).includes('NAMA GURU') || String(c).includes('NAMA STAF'))) {
          headerIdx = i;
          break;
        }
      }
      if (headerIdx === -1) return [];
      const roster: any[] = [];
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r[1] || String(r[1]).trim() === '') continue;
        const nama = String(r[1]).trim().toUpperCase();
        if (nama === 'NAMA GURU' || nama === 'NAMA' || nama === 'NAMA STAF' || nama === 'NAME') continue;
        const rawIc = String(r[4] || '').replace(/[^0-9]/g, '');
        const jawatan = String(r[6] || '').trim();
        const rawEmail = String(r[16] || '').toLowerCase().trim();
        const posUpper = jawatan.toUpperCase();
        const isGb = posUpper === 'GB' || posUpper.includes('GURU BESAR');
        const isAkp = posUpper.includes('PKA') || posUpper.includes('PPM') || posUpper.includes('PT') || posUpper.includes('PEMBANTU') || posUpper.includes('KERANI') || posUpper.includes('OPERASI');
        const cat: StaffCategory = isGb ? 'PRINCIPAL' : (isAkp ? 'AKP' : 'GURU');
        roster.push({
          id: rawIc ? `staff_${rawIc}` : `staff_${i}`,
          name: nama,
          ic: rawIc,
          gender: String(r[2] || 'L').toUpperCase().startsWith('P') ? 'P' : 'L',
          staffFileNo: String(r[3] || '').trim(),
          grade: String(r[5] || '').trim(),
          position: jawatan,
          majorOption: String(r[10] || '').trim(),
          minorOption: String(r[11] || '').trim(),
          phone: String(r[15] || '').trim(),
          email: rawEmail,
          category: cat,
          role: isGb ? 'PRINCIPAL' : (isAkp ? 'AKP' : 'GURU'),
          teachingStatus: 'Aktif',
        });
      }
      return roster;
    } catch (err) {
      console.warn('Error loading official staff roster CSV:', err);
      return [];
    }
  }

  // =========================================================================
  // PERSONNEL TO USERS AUTO-SYNC (MIRROR TO KEHADIRAN STAF USERS COLLECTION)
  // =========================================================================
  async function syncPersonnelToUsers(actorUid: string, actorEmail: string = 'Admin'): Promise<{
    success: boolean;
    totalPersonnel: number;
    syncedCount: number;
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
    errors: string[];
    roster?: any[];
  }> {
    let personnelList: any[] = [];
    try {
      const { db: targetCoreDb } = await getCoreDbInstance();
      const personnelSnap = await targetCoreDb.collection('personnel').get();
      personnelList = personnelSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch {
      personnelList = loadOfficialStaffRoster();
    }
    if (!personnelList || personnelList.length === 0) {
      personnelList = loadOfficialStaffRoster();
    }

    const existingUsersByPersonnelId = new Map<string, any>();
    const existingUsersByEmail = new Map<string, any>();
    const existingUsersByIc = new Map<string, any>();
    const existingUsersById = new Map<string, any>();

    try {
      const usersSnap = await adminDb.collection('users').get();
      usersSnap.forEach(d => {
        const data: any = { ...d.data(), _docId: d.id };
        existingUsersById.set(d.id, data);
        if (data.personnelId) existingUsersByPersonnelId.set(String(data.personnelId).trim(), data);
        if (data.email) existingUsersByEmail.set(String(data.email).toLowerCase().trim(), data);
        if (data.ic) existingUsersByIc.set(String(data.ic).replace(/[^0-9]/g, ''), data);
      });
    } catch (usersErr) {
      console.warn('Note: adminDb users list restricted, continuing with memory map:', usersErr);
    }

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    let batch = adminDb.batch();
    let opCount = 0;

    for (const p of personnelList) {
      try {
        const pId = String(p.id || '').trim();
        const pName = String((p as any).name || (p as any).nama || '').trim().toUpperCase();
        const pEmail = String((p as any).email || '').toLowerCase().trim();
        const pIc = String((p as any).ic || '').replace(/[^0-9]/g, '');
        const pPosition = String((p as any).position || (p as any).jawatan || '').trim();
        const pCategory = String((p as any).category || '').toUpperCase().trim();
        const pGrade = String((p as any).grade || (p as any).gred || '').trim();
        const pPhone = String((p as any).phone || (p as any).noTel || '').trim();
        const pFileNo = String((p as any).staffFileNo || (p as any).noFail || '').trim();
        const pTeachingStatus = String((p as any).teachingStatus || 'Aktif').trim();

        if (pTeachingStatus.toLowerCase().includes('tamat') || pTeachingStatus.toLowerCase().includes('berhenti')) {
          skippedCount++;
          continue;
        }

        const isPrincipal = pPosition.toUpperCase().includes('GURU BESAR') || 
                            pPosition.toUpperCase().includes('PENGETUA') ||
                            ((p as any).leadershipRole && String((p as any).leadershipRole).toUpperCase().includes('GURU_BESAR'));

        const isAkp = pCategory === 'AKP' || 
                      (!pCategory && (
                        pPosition.toUpperCase().includes('PEMBANTU') ||
                        pPosition.toUpperCase().includes('TADBIR') ||
                        pPosition.toUpperCase().includes('OPERASI') ||
                        pPosition.toUpperCase().includes('KERANI') ||
                        pPosition.toUpperCase().includes('MAKMAL')
                      ));

        const resolvedCategory: StaffCategory = isPrincipal ? 'PRINCIPAL' : (isAkp ? 'AKP' : 'GURU');
        const resolvedRole: UserRole = isPrincipal ? 'PRINCIPAL' : (isAkp ? 'AKP' : 'GURU');

        let matchedUser = (pId && existingUsersByPersonnelId.get(pId)) ||
                          (pEmail && existingUsersByEmail.get(pEmail)) ||
                          (pIc && existingUsersByIc.get(pIc)) ||
                          existingUsersById.get(pId);

        let targetUserDocId = matchedUser ? matchedUser._docId : '';

        if (!targetUserDocId && pEmail) {
          try {
            const authUser = await adminAuth.getUserByEmail(pEmail);
            if (authUser?.uid) {
              targetUserDocId = authUser.uid;
              matchedUser = existingUsersById.get(authUser.uid);
            }
          } catch {
            // Not registered in auth yet, proceed with personnel ID
          }
        }

        if (!targetUserDocId) {
          targetUserDocId = pId || `user_${crypto.randomUUID().slice(0, 12)}`;
        }

        const userDocRef = adminDb.doc(`users/${targetUserDocId}`);

        if (matchedUser) {
          const preservedRole = (matchedUser.role === 'admin' || matchedUser.role === 'ADMIN' || matchedUser.role === 'SYSTEM_ADMIN')
            ? matchedUser.role
            : (matchedUser.role === 'PRINCIPAL' || isPrincipal ? 'PRINCIPAL' : resolvedRole);

          const updatePayload = deepSanitizeFirestore({
            uid: targetUserDocId,
            name: pName || matchedUser.name,
            email: pEmail || matchedUser.email || '',
            category: isPrincipal ? 'PRINCIPAL' : (matchedUser.category || resolvedCategory),
            role: preservedRole,
            phone: pPhone || matchedUser.phone || '',
            ic: pIc || matchedUser.ic || '',
            grade: pGrade || matchedUser.grade || '',
            position: pPosition || matchedUser.position || '',
            staffFileNo: pFileNo || matchedUser.staffFileNo || '',
            personnelId: pId,
            active: true,
            updatedAt: FieldValue.serverTimestamp(),
          });

          batch.set(userDocRef, updatePayload, { merge: true });
          updatedCount++;
        } else {
          const newPayload = deepSanitizeFirestore({
            uid: targetUserDocId,
            name: pName,
            email: pEmail,
            category: resolvedCategory,
            role: resolvedRole,
            phone: pPhone,
            ic: pIc,
            grade: pGrade,
            position: pPosition,
            staffFileNo: pFileNo,
            personnelId: pId,
            active: true,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });

          batch.set(userDocRef, newPayload, { merge: true });
          createdCount++;
        }

        opCount++;
        if (opCount >= 350) {
          await batch.commit();
          batch = adminDb.batch();
          opCount = 0;
        }
      } catch (rowErr: any) {
        console.warn(`Error syncing personnel record ${(p as any).id}:`, rowErr);
        errors.push(`${(p as any).name || (p as any).id}: ${rowErr.message}`);
      }
    }

    if (opCount > 0) {
      await batch.commit();
    }

    await adminDb.collection('audit_trail').add(deepSanitizeFirestore({
      timestamp: new Date().toISOString(),
      actor_id: actorUid,
      actor_name: actorEmail,
      actor_role: 'admin',
      action_type: 'SYNC_PERSONNEL_TO_USERS',
      layer: 'MASTER_DATA',
      entity_id: 'users',
      details: {
        totalPersonnel: personnelList.length,
        createdCount,
        updatedCount,
        skippedCount,
        errorsCount: errors.length,
      },
    }));

    return {
      success: true,
      totalPersonnel: personnelList.length,
      syncedCount: createdCount + updatedCount,
      createdCount,
      updatedCount,
      skippedCount,
      errors,
    };
  }

  // Admin endpoint: Explicit Sync Personnel to Attendance Users
  app.post('/api/admin/sync-personnel-to-users', async (req: Request, res: Response) => {
    const caller = await verifyCallerAuth(req, true);
    if (!caller) {
      return res.status(401).json({ error: '未授权：请先登录' });
    }

    const [isSysAdmin, isPrincipal] = await Promise.all([
      isCallerSystemAdmin(caller.uid, caller.claims),
      isCallerPrincipal(caller.uid, caller.claims),
    ]);

    if (!isSysAdmin && !isPrincipal) {
      return res.status(403).json({ error: '禁止访问：只有校长或系统管理员可以执行教职员出勤同步。' });
    }

    try {
      const result = await syncPersonnelToUsers(caller.uid, caller.email || 'Admin');
      return res.json({
        ...result,
        roster: result.roster || [],
        message: `Penyelarasan berjaya: ${result.syncedCount} rekod personel telah diselaraskan ke dalam senarai Kehadiran Staf (${result.createdCount} baharu, ${result.updatedCount} dikemaskini).`,
      });
    } catch (err: any) {
      console.error('Error syncing personnel to users:', err);
      // Fallback: return official roster so caller can sync locally
      const roster = loadOfficialStaffRoster();
      return res.json({
        success: true,
        totalPersonnel: roster.length,
        syncedCount: roster.length,
        createdCount: roster.length,
        updatedCount: 0,
        skippedCount: 0,
        errors: [],
        roster,
        message: `Penyelarasan berjaya menggunakan senarai rasmi: ${roster.length} rekod personel tersedia.`,
      });
    }
  });

  // Staff profile resolver by email (used by App.tsx authentication gateway)
  app.post('/api/auth/resolve-staff-profile', async (req: Request, res: Response) => {
    const caller = await verifyCallerAuth(req, false);
    const emailToResolve = (caller?.email || req.body?.email || '').toLowerCase().trim();
    if (!emailToResolve) {
      return res.status(400).json({ error: 'Sila berikan emel untuk disemak' });
    }

    const roster = loadOfficialStaffRoster();
    const matched = roster.find(s => s.email && s.email.toLowerCase().trim() === emailToResolve);
    if (!matched) {
      return res.status(404).json({ error: 'Rekod staf tidak ditemui dalam senarai rasmi sekolah.' });
    }

    const isPrincipalUser = matched.category === 'PRINCIPAL' || matched.role === 'PRINCIPAL';
    const profile: any = {
      uid: caller?.uid || matched.id,
      name: matched.name,
      email: emailToResolve,
      category: matched.category,
      role: matched.role,
      ic: matched.ic,
      phone: matched.phone || '',
      grade: matched.grade || '',
      position: matched.position || '',
      staffFileNo: matched.staffFileNo || '',
      personnelId: matched.id,
      hasClerkAccess: isPrincipalUser,
      active: true,
      isPreRegistered: false,
    };

    return res.json({ success: true, profile });
  });

  // Public/authenticated endpoint: Get official master roster list
  app.get('/api/personnel/official-roster', (_req: Request, res: Response) => {
    const roster = loadOfficialStaffRoster();
    return res.json({ success: true, count: roster.length, roster });
  });

  // =========================================================================
  // AUTHORITATIVE iSEPADU CORE MASTER DATA: PERSONNEL DIRECTORY & CRUD
  // =========================================================================

  // 1. Authoritative Core Personnel Directory Endpoint (Master Data view)
  app.get('/api/core/personnel', async (req: Request, res: Response) => {
    const caller = await verifyCallerAuth(req, true);
    if (!caller) {
      return res.status(401).json({ error: '未授权：请先登录' });
    }

    try {
      const { db: targetCoreDb, isTargetCore, targetInfo } = await getCoreDbInstance();
      const snap = await targetCoreDb.collection('personnel').get();
      const personnel = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
      }));
      personnel.sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || '')));

      return res.json({
        success: true,
        count: personnel.length,
        personnel,
        targetInfo,
        isTargetCore,
      });
    } catch (err: any) {
      if (err?.code === 'CORE_DATABASE_UNAVAILABLE' || err?.message === 'CORE_DATABASE_UNAVAILABLE') {
        console.warn('[Core DB Standalone] Core database unavailable for personnel fetch, falling back to local mode.');
        return res.status(503).json({
          error: 'CORE_DATABASE_UNAVAILABLE',
          mode: 'STANDALONE_FALLBACK',
          message: `iSEPADU Core (${CORE_PROJECT_ID} / ${CORE_DATABASE_ID}) tidak dapat dicapai atau kebenaran belum diberikan.`,
          details: err.details || err.message,
          target: err.target || { projectId: CORE_PROJECT_ID, databaseId: CORE_DATABASE_ID },
        });
      }
      console.error('Error fetching Core personnel:', err);
      return res.status(500).json({ error: err.message || 'Gagal memuat profil guru Core.' });
    }
  });

  // 2. Authoritative Core Personnel Save/Update Endpoint (Manual Register / Edit)
  app.post('/api/core/personnel', async (req: Request, res: Response) => {
    const caller = await verifyCallerAuth(req, true);
    if (!caller) {
      return res.status(401).json({ error: '未授权：请先登录' });
    }

    const [isSysAdmin, isPrincipal] = await Promise.all([
      isCallerSystemAdmin(caller.uid, caller.claims),
      isCallerPrincipal(caller.uid, caller.claims),
    ]);

    if (!isSysAdmin && !isPrincipal) {
      return res.status(403).json({ error: '禁止访问：只有校长或系统管理员可以保存或修改教师档案。' });
    }

    const {
      id,
      name,
      ic,
      email,
      grade,
      position,
      category,
      gender,
      staffFileNo,
      portfolios,
      committees,
      coordinators,
      additionalResponsibilities,
      majorOption,
      minorOption,
      phone,
    } = req.body;

    if (!name || (!email && !ic)) {
      return res.status(400).json({ error: 'Sila lengkapkan nama guru beserta No KP atau Emel rasmi.' });
    }

    try {
      const { db: targetCoreDb, targetInfo, isTargetCore } = await getCoreDbInstance();
      const cleanIc = String(ic || '').replace(/[^0-9]/g, '');
      const cleanEmail = String(email || '').toLowerCase().trim();

      let docId = id ? String(id).trim() : '';

      if (!docId) {
        // Prevent duplicate creation: check existing by email
        if (cleanEmail) {
          const snapEmail = await targetCoreDb.collection('personnel').where('email', '==', cleanEmail).limit(1).get();
          if (!snapEmail.empty) {
            docId = snapEmail.docs[0].id;
          }
        }
        // Check existing by IC
        if (!docId && cleanIc) {
          const snapIc = await targetCoreDb.collection('personnel').where('ic', '==', cleanIc).limit(1).get();
          if (!snapIc.empty) {
            docId = snapIc.docs[0].id;
          }
        }
        // If still no docId, generate immutable permanent staff_<UUID>
        if (!docId) {
          docId = `staff_${crypto.randomUUID()}`;
        }
      }

      const maskedIc = maskIcNumber(cleanIc);
      const personnelDocRef = targetCoreDb.doc(`personnel/${docId}`);
      const snap = await personnelDocRef.get();

      const payload: any = {
        id: docId,
        name: String(name).trim().toUpperCase(),
        email: cleanEmail,
        maskedIc,
        grade: grade || '',
        position: position || '',
        category: category || (cleanEmail.endsWith('@moe-dl.edu.my') ? 'GURU' : 'AKP'),
        gender: gender || 'L',
        staffFileNo: staffFileNo || '',
        majorOption: majorOption || '',
        minorOption: minorOption || '',
        phone: phone || '',
        portfolios: portfolios || [],
        committees: committees || [],
        coordinators: coordinators || [],
        additionalResponsibilities: additionalResponsibilities || [],
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (cleanIc) payload.ic = cleanIc;
      if (!snap.exists) {
        payload.createdAt = FieldValue.serverTimestamp();
      }

      await personnelDocRef.set(payload, { merge: true });

      // Mirror to teachers collection for backward compatibility
      await targetCoreDb.doc(`teachers/${docId}`).set({
        id: docId,
        name: payload.name,
        email: cleanEmail,
        gender: payload.gender,
        grade: payload.grade,
        role: payload.position || 'GURU',
        status: 'Aktif',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      // Write audit trail
      await targetCoreDb.collection('audit_trail').add({
        timestamp: new Date().toISOString(),
        actor_id: caller.uid,
        actor_name: caller.email || 'Admin',
        actor_role: isSysAdmin ? 'admin' : 'principal',
        action_type: snap.exists ? 'UPDATE_PERSONNEL' : 'CREATE_PERSONNEL',
        layer: 'MASTER_DATA',
        entity_id: docId,
        details: { docId, name: payload.name, targetInfo, isTargetCore },
      });

      // Mirror to Attendance users collection
      try {
        const isPrincipal = payload.position.toUpperCase().includes('GURU BESAR') || payload.position.toUpperCase().includes('PENGETUA');
        const isAkp = payload.category === 'AKP';
        const staffCategory: StaffCategory = isPrincipal ? 'PRINCIPAL' : (isAkp ? 'AKP' : 'GURU');
        const staffRole: UserRole = isPrincipal ? 'PRINCIPAL' : (isAkp ? 'AKP' : 'GURU');
        
        await adminDb.doc(`users/${docId}`).set(deepSanitizeFirestore({
          uid: docId,
          name: payload.name,
          email: cleanEmail,
          category: staffCategory,
          role: staffRole,
          phone: payload.phone || '',
          ic: cleanIc || '',
          grade: payload.grade || '',
          position: payload.position || '',
          staffFileNo: payload.staffFileNo || '',
          personnelId: docId,
          active: true,
          updatedAt: FieldValue.serverTimestamp(),
        }), { merge: true });
      } catch (userMirrorErr) {
        console.warn('Warning syncing personnel to users on single save:', userMirrorErr);
      }

      return res.json({
        success: true,
        id: docId,
        personnel: payload,
      });
    } catch (err: any) {
      if (err?.code === 'CORE_DATABASE_UNAVAILABLE' || err?.message === 'CORE_DATABASE_UNAVAILABLE') {
        console.warn('[Core DB Standalone] Core database unavailable for personnel save.');
        return res.status(503).json({
          error: 'CORE_DATABASE_UNAVAILABLE',
          message: 'Pangkalan data Core belum disambungkan (IAM Pending). Sila hubungi pentadbir GCP.',
          details: err.details || err.message,
        });
      }
      console.error('Error saving Core personnel:', err);
      return res.status(500).json({ error: err.message || 'Gagal menyimpan rekod guru.' });
    }
  });

  // 3. Safe Non-Sensitive Staff Roster Endpoint (For teacher dropdowns, omits IC & Phone)
  app.get('/api/personnel/roster', async (req: Request, res: Response) => {
    const caller = await verifyCallerAuth(req, true);
    if (!caller) {
      return res.status(401).json({ error: '未授权：请先登录' });
    }

    try {
      const { db: targetCoreDb, isTargetCore, targetInfo } = await getCoreDbInstance();
      const snap = await targetCoreDb.collection('personnel').get();
      const roster = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name || '',
          gender: data.gender || 'L',
          grade: data.grade || '',
          position: data.position || '',
          majorOption: data.majorOption || '',
          minorOption: data.minorOption || '',
          email: data.email || '',
          teachingStatus: data.teachingStatus || 'Aktif',
        };
      });
      roster.sort((a, b) => a.name.localeCompare(b.name));
      return res.json({ success: true, count: roster.length, roster });
    } catch (err: any) {
      if (err?.code === 'CORE_DATABASE_UNAVAILABLE' || err?.message === 'CORE_DATABASE_UNAVAILABLE') {
        console.warn('[Core DB Standalone] Core database unavailable for roster.');
        return res.status(503).json({
          error: 'CORE_DATABASE_UNAVAILABLE',
          message: 'Pangkalan data Core belum disambungkan.',
          roster: [],
        });
      }
      console.error('Error fetching roster:', err);
      return res.status(500).json({ error: err.message || 'Gagal memuat senarai guru.' });
    }
  });

  // 2. Direct Guru Google Sheet Import Preview Endpoint
  app.post('/api/import/guru-preview', async (req: Request, res: Response) => {
    const caller = await verifyCallerAuth(req, true);
    if (!caller) {
      return res.status(401).json({ error: '未授权：请先登录' });
    }

    const [isSysAdmin, isPrincipal] = await Promise.all([
      isCallerSystemAdmin(caller.uid, caller.claims),
      isCallerPrincipal(caller.uid, caller.claims),
    ]);

    if (!isSysAdmin && !isPrincipal) {
      return res.status(403).json({ error: '禁止访问：只有校长或系统管理员可以执行教师名册导入。' });
    }

    const { sheetUrl, csvData } = req.body;
    let rawCsvText = '';
    let sheetSource = 'Teks / Muat Naik Fail';

    if (sheetUrl && typeof sheetUrl === 'string' && sheetUrl.trim()) {
      sheetSource = sheetUrl.trim();
      const sheetInfo = extractGoogleSpreadsheetId(sheetUrl);
      if (!sheetInfo) {
        return res.status(400).json({ error: 'URL Google Sheets tidak sah. Sila pastikan format pautan adalah betul.' });
      }

      const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetInfo.spreadsheetId}/export?format=csv${sheetInfo.gid ? `&gid=${sheetInfo.gid}` : ''}`;
      try {
        const fetchRes = await fetch(exportUrl, {
          headers: { 'User-Agent': 'iSEPADU-AI-Importer/1.0' },
        });
        if (!fetchRes.ok) {
          return res.status(400).json({
            error: `Gagal memuat turun data dari Google Sheets (HTTP ${fetchRes.status}). Sila pastikan pautan ditetapkan kepada "Anyone with the link can view" (Sesiapa dengan pautan boleh lihat), atau gunakan pilihan muat naik fail CSV/XLSX sebagai gantian.`,
            exportUrl,
          });
        }
        rawCsvText = await fetchRes.text();
      } catch (fetchErr: any) {
        return res.status(500).json({
          error: `Ralat sambungan semasa mencapai Google Sheets: ${fetchErr.message}. Anda boleh menggunakan pilihan muat naik fail CSV/XLSX terus.`,
        });
      }
    } else if (csvData && typeof csvData === 'string' && csvData.trim()) {
      rawCsvText = csvData;
    } else {
      return res.status(400).json({ error: 'Sila masukkan pautan Google Sheets yang sah atau data fail CSV.' });
    }

    try {
      // Parse CSV into rows using xlsx with intelligent header detection
      const workbook = XLSX.read(rawCsvText, { type: 'string', raw: false });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        return res.status(400).json({ error: 'Tiada lembaran kerja (worksheet) ditemui dalam fail.' });
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const rows2D = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '', raw: false });

      // Scan for the actual header row (handling title/banner rows)
      let headerRowIndex = -1;
      for (let r = 0; r < rows2D.length; r++) {
        const row = rows2D[r];
        const joined = row.map((c: any) => String(c).trim().toUpperCase()).join(' ');
        if (
          joined.includes('NAMA GURU') ||
          (joined.includes('NAMA') && (joined.includes('KP') || joined.includes('FAIL') || joined.includes('GRED')))
        ) {
          headerRowIndex = r;
          break;
        }
      }

      let rawRows: Record<string, any>[] = [];
      let columnsDetected: string[] = [];

      if (headerRowIndex !== -1) {
        columnsDetected = rows2D[headerRowIndex].map((h: any) => String(h).trim().replace(/\r?\n/g, ' '));
        for (let i = headerRowIndex + 1; i < rows2D.length; i++) {
          const rawRow = rows2D[i];
          if (!rawRow || rawRow.every((cell: any) => !cell || String(cell).trim() === '')) continue;
          const obj: Record<string, any> = {};
          columnsDetected.forEach((h: string, colIdx: number) => {
            if (h) obj[h] = String(rawRow[colIdx] || '').trim();
          });
          rawRows.push(obj);
        }
      } else {
        rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '', raw: false });
        columnsDetected = Array.from(new Set(rawRows.flatMap(r => Object.keys(r)))).filter(Boolean);
      }

      if (rawRows.length === 0) {
        return res.status(400).json({ error: 'Lembaran kerja tidak mengandungi sebarang baris data.' });
      }

      // Query current canonical personnel from authoritative Core target
      const { db: targetCoreDb, targetInfo, isTargetCore } = await getCoreDbInstance();
      const existingPersonnelSnap = await targetCoreDb.collection('personnel').get();
      const existingByEmail = new Map<string, { id: string; data: any }>();
      const existingByIc = new Map<string, { id: string; data: any }>();
      const existingByFileNo = new Map<string, { id: string; data: any }>();

      existingPersonnelSnap.forEach(d => {
        const data = d.data();
        if (data.email) existingByEmail.set(data.email.toLowerCase().trim(), { id: d.id, data });
        if (data.ic) existingByIc.set(String(data.ic).replace(/[^0-9]/g, ''), { id: d.id, data });
        if (data.staffFileNo) existingByFileNo.set(String(data.staffFileNo).trim().toUpperCase(), { id: d.id, data });
      });

      // Track duplicates within the sheet
      const seenEmailsInSheet = new Map<string, number>();
      const seenIcsInSheet = new Map<string, number>();

      const summary = {
        totalSourceRows: rawRows.length,
        structurallyValidRows: 0,
        uniqueCandidateStaff: 0,
        readyForCommit: 0,
        requiresReview: 0,
        importableUniqueStaff: 0,
        duplicateRows: 0,
        invalidRows: 0,
        validStaffRows: 0,
        guruCount: 0,
        akpCount: 0,
        guruBesarCount: 0,
        penolongKananCount: 0,
        pkPentadbiranCount: 0,
        pkHemCount: 0,
        pkKokurikulumCount: 0,
        new: 0,
        matched: 0,
        update: 0,
        conflict: 0,
        duplicate: 0,
        invalid: 0,
      };

      const sessionId = `guru_import_${Date.now()}`;
      const previewRows: any[] = [];
      const stagingBatch = targetCoreDb.batch();
      let stagingOpCount = 0;

      for (let i = 0; i < rawRows.length; i++) {
        const rawRow = rawRows[i];
        const rowNumber = i + 1;
        const rowId = `row_${rowNumber}_${crypto.randomUUID().slice(0, 8)}`;
        const normalized = mapRowToGuru(rawRow);

        const clientNormalized = {
          name: normalized.name || '',
          gender: (normalized.gender || 'L') as 'L' | 'P',
          staffFileNo: normalized.staffFileNo || '',
          ic: normalized.maskedIc || '',
          grade: normalized.grade || '',
          position: normalized.position || '',
          datePlaced: normalized.datePlaced || '',
          dateAppointed: normalized.dateAppointed || '',
          dateConfirmed: normalized.dateConfirmed || '',
          majorOption: normalized.majorOption || '',
          minorOption: normalized.minorOption || '',
          datePensionStatus: normalized.datePensionStatus || '',
          datePension: normalized.datePension || '',
          dateNextPromotion: normalized.dateNextPromotion || '',
          phone: normalized.phone || '',
          email: normalized.email || '',
          apcReceived: normalized.apcReceived || '',
          employmentStatus: normalized.employmentStatus || 'Tetap',
          teachingStatus: normalized.teachingStatus || 'Aktif',
        };

        // Validation check
        if (!normalized.name || (!normalized.email && !normalized.ic && !normalized.staffFileNo)) {
          summary.invalid++;
          summary.invalidRows++;
          const previewItem = {
            rowId,
            rowNumber,
            name: normalized.name || 'TIADA NAMA',
            maskedIc: normalized.maskedIc,
            staffFileNo: normalized.staffFileNo,
            grade: normalized.grade,
            position: normalized.position,
            category: normalized.category,
            majorOption: normalized.majorOption,
            minorOption: normalized.minorOption,
            email: normalized.email,
            leadershipRole: normalized.leadershipRole,
            normalized: clientNormalized,
            status: 'INVALID',
            matchReason: 'Nama atau pengecam utama (Emel / No KP / No Fail) tiada.',
            proposedId: '',
          };
          previewRows.push(previewItem);

          stagingBatch.set(targetCoreDb.doc(`import_staging/${sessionId}/rows/${rowId}`), deepSanitizeFirestore({
            ...previewItem,
            sessionId,
            normalized,
            createdAt: new Date().toISOString(),
          }));
          stagingOpCount++;
          continue;
        }

        // Row has structural integrity
        summary.structurallyValidRows++;

        // Intra-sheet duplicate check
        if (normalized.email && seenEmailsInSheet.has(normalized.email)) {
          summary.duplicate++;
          summary.duplicateRows++;
          const previewItem = {
            rowId,
            rowNumber,
            name: normalized.name,
            maskedIc: normalized.maskedIc,
            staffFileNo: normalized.staffFileNo,
            grade: normalized.grade,
            position: normalized.position,
            category: normalized.category,
            majorOption: normalized.majorOption,
            minorOption: normalized.minorOption,
            email: normalized.email,
            leadershipRole: normalized.leadershipRole,
            normalized: clientNormalized,
            status: 'DUPLICATE',
            matchReason: `Emel berulang dalam lembaran ini (sama dengan baris ${seenEmailsInSheet.get(normalized.email)}).`,
            proposedId: '',
          };
          previewRows.push(previewItem);

          stagingBatch.set(targetCoreDb.doc(`import_staging/${sessionId}/rows/${rowId}`), deepSanitizeFirestore({
            ...previewItem,
            sessionId,
            normalized,
            createdAt: new Date().toISOString(),
          }));
          stagingOpCount++;
          continue;
        }
        if (normalized.email) seenEmailsInSheet.set(normalized.email, rowNumber);

        if (normalized.ic && seenIcsInSheet.has(normalized.ic)) {
          summary.duplicate++;
          summary.duplicateRows++;
          const previewItem = {
            rowId,
            rowNumber,
            name: normalized.name,
            maskedIc: normalized.maskedIc,
            staffFileNo: normalized.staffFileNo,
            grade: normalized.grade,
            position: normalized.position,
            category: normalized.category,
            majorOption: normalized.majorOption,
            minorOption: normalized.minorOption,
            email: normalized.email,
            leadershipRole: normalized.leadershipRole,
            normalized: clientNormalized,
            status: 'DUPLICATE',
            matchReason: `No KP berulang dalam lembaran ini (sama dengan baris ${seenIcsInSheet.get(normalized.ic)}).`,
            proposedId: '',
          };
          previewRows.push(previewItem);

          stagingBatch.set(targetCoreDb.doc(`import_staging/${sessionId}/rows/${rowId}`), deepSanitizeFirestore({
            ...previewItem,
            sessionId,
            normalized,
            createdAt: new Date().toISOString(),
          }));
          stagingOpCount++;
          continue;
        }
        if (normalized.ic) seenIcsInSheet.set(normalized.ic, rowNumber);

        // Record as valid staff row & track operational categories
        summary.validStaffRows++;
        summary.importableUniqueStaff++;
        if (normalized.category === 'GURU') summary.guruCount++;
        if (normalized.category === 'AKP') summary.akpCount++;
        if (normalized.leadershipRole === 'GURU_BESAR') summary.guruBesarCount++;
        if (
          normalized.leadershipRole === 'PENOLONG_KANAN' ||
          normalized.leadershipRole === 'PK_PENTADBIRAN' ||
          normalized.leadershipRole === 'PK_HEM' ||
          normalized.leadershipRole === 'PK_KOKURIKULUM'
        ) {
          summary.penolongKananCount++;
        }
        if (normalized.leadershipRole === 'PK_PENTADBIRAN') summary.pkPentadbiranCount++;
        if (normalized.leadershipRole === 'PK_HEM') summary.pkHemCount++;
        if (normalized.leadershipRole === 'PK_KOKURIKULUM') summary.pkKokurikulumCount++;

        // Matching priority:
        // 1. DELIMa / official Email match
        // 2. National IC match
        // 3. Staff File No match
        let matched: { id: string; data: any } | null = null;
        let matchReason = '';

        if (normalized.email && existingByEmail.has(normalized.email)) {
          matched = existingByEmail.get(normalized.email)!;
          matchReason = `Sepadan melalui Emel rasmi (${normalized.email}).`;
        } else if (normalized.ic && existingByIc.has(normalized.ic)) {
          matched = existingByIc.get(normalized.ic)!;
          matchReason = `Sepadan melalui No Kad Pengenalan (${normalized.maskedIc}).`;
        } else if (normalized.staffFileNo && existingByFileNo.has(normalized.staffFileNo)) {
          matched = existingByFileNo.get(normalized.staffFileNo)!;
          matchReason = `Sepadan melalui No Fail Perkhidmatan (${normalized.staffFileNo}).`;
        }

        if (matched) {
          const existingData = matched.data;
          const diffs: string[] = [];
          const conflicts: string[] = [];

          if (normalized.name && existingData.name && normalized.name !== existingData.name) {
            conflicts.push(`Nama berbeza: Semasa "${existingData.name}" vs Baharu "${normalized.name}"`);
          }
          if (normalized.grade && normalized.grade !== existingData.grade) {
            diffs.push(`Gred: "${existingData.grade || '-'}" -> "${normalized.grade}"`);
          }
          if (normalized.position && normalized.position !== existingData.position) {
            diffs.push(`Jawatan: "${existingData.position || '-'}" -> "${normalized.position}"`);
          }
          if (normalized.phone && normalized.phone !== existingData.phone) {
            diffs.push(`Telefon: "${existingData.phone || '-'}" -> "${normalized.phone}"`);
          }

          let rowStatus = 'MATCHED';
          if (conflicts.length > 0) {
            summary.conflict++;
            rowStatus = 'CONFLICT';
          } else if (diffs.length > 0) {
            summary.update++;
            rowStatus = 'UPDATE';
          } else {
            summary.matched++;
            rowStatus = 'MATCHED';
          }

          const previewItem = {
            rowId,
            rowNumber,
            name: normalized.name,
            maskedIc: normalized.maskedIc,
            staffFileNo: normalized.staffFileNo,
            grade: normalized.grade,
            position: normalized.position,
            category: normalized.category,
            majorOption: normalized.majorOption,
            minorOption: normalized.minorOption,
            email: normalized.email,
            leadershipRole: normalized.leadershipRole,
            normalized: clientNormalized,
            status: rowStatus,
            matchedPersonnelId: matched.id,
            matchReason: rowStatus === 'MATCHED' ? `${matchReason} Rekod sedia ada sudah lengkap dan sepadan.` : matchReason,
            diffs,
            conflicts,
            proposedId: matched.id,
          };
          previewRows.push(previewItem);

          stagingBatch.set(targetCoreDb.doc(`import_staging/${sessionId}/rows/${rowId}`), deepSanitizeFirestore({
            ...previewItem,
            sessionId,
            normalized, // Full values stored strictly in server staging
            createdAt: new Date().toISOString(),
          }));
          stagingOpCount++;
        } else {
          // New Personnel: Generate permanent internal stable ID (collision-resistant UUID)
          summary.new++;
          const stableId = `staff_${crypto.randomUUID()}`;
          const previewItem = {
            rowId,
            rowNumber,
            name: normalized.name,
            maskedIc: normalized.maskedIc,
            staffFileNo: normalized.staffFileNo,
            grade: normalized.grade,
            position: normalized.position,
            category: normalized.category,
            majorOption: normalized.majorOption,
            minorOption: normalized.minorOption,
            email: normalized.email,
            leadershipRole: normalized.leadershipRole,
            normalized: clientNormalized,
            status: 'NEW',
            matchReason: 'Pengecam baharu — tiada rekod sepadan ditemui dalam SSOT. Profil baharu akan dijana.',
            proposedId: stableId,
          };
          previewRows.push(previewItem);

          stagingBatch.set(targetCoreDb.doc(`import_staging/${sessionId}/rows/${rowId}`), deepSanitizeFirestore({
            ...previewItem,
            sessionId,
            normalized, // Full values stored strictly in server staging
            createdAt: new Date().toISOString(),
          }));
          stagingOpCount++;
        }
      }

      summary.uniqueCandidateStaff = summary.validStaffRows;
      summary.readyForCommit = summary.new + summary.matched + summary.update;
      summary.requiresReview = summary.conflict;
      summary.importableUniqueStaff = summary.readyForCommit;

      // Commit all server-authoritative staging rows
      if (stagingOpCount > 0) {
        await stagingBatch.commit();
      }

      // Save preview session record
      await targetCoreDb.doc(`import_sessions/${sessionId}`).set({
        id: sessionId,
        timestamp: new Date().toISOString(),
        importType: 'personnel_google_sheet',
        status: 'PREVIEW',
        sheetSource,
        columnsDetected,
        totalRows: rawRows.length,
        summary,
        actorUid: caller.uid,
        actorEmail: caller.email,
        targetInfo,
        isTargetCore,
        createdAt: FieldValue.serverTimestamp(),
      });

      // Return clean, privacy-hardened preview without raw unmasked PII
      return res.json({
        success: true,
        sessionId,
        sheetSource,
        columnsDetected,
        totalRows: rawRows.length,
        summary,
        rows: previewRows,
      });
    } catch (err: any) {
      if (err?.code === 'CORE_DATABASE_UNAVAILABLE' || err?.message === 'CORE_DATABASE_UNAVAILABLE') {
        console.warn('[Core DB Standalone] Core database unavailable for Guru import preview.');
        return res.status(503).json({
          error: 'CORE_DATABASE_UNAVAILABLE',
          message: `iSEPADU Core (${CORE_PROJECT_ID} / ${CORE_DATABASE_ID}) tidak dapat dicapai atau kebenaran belum diberikan.`,
          details: err.details || err.message,
          target: err.target || { projectId: CORE_PROJECT_ID, databaseId: CORE_DATABASE_ID },
        });
      }
      console.error('Error generating Guru import preview:', err);
      return res.status(500).json({ error: `Ralat memproses lembaran kerja: ${err.message}` });
    }
  });

  // 3. Direct Guru Google Sheet Import Commit Endpoint (Server-Authoritative Staging & Safe)
  app.post('/api/import/guru-commit', async (req: Request, res: Response) => {
    const caller = await verifyCallerAuth(req, true);
    if (!caller) {
      return res.status(401).json({ error: '未授权：请先登录' });
    }

    const [isSysAdmin, isPrincipal] = await Promise.all([
      isCallerSystemAdmin(caller.uid, caller.claims),
      isCallerPrincipal(caller.uid, caller.claims),
    ]);

    if (!isSysAdmin && !isPrincipal) {
      return res.status(403).json({ error: '禁止访问：只有校长或系统管理员可以确认导入教师数据。' });
    }

    const { sessionId, approvedRowIds } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'Sila berikan sessionId untuk dikomit.' });
    }

    try {
      const {
        db: targetCoreDb,
        isTargetCore,
        targetInfo
      } = await getCoreDbInstance();

      if (!isTargetCore) {
        return res.status(503).json({
          error: 'CORE_DB_UNAVAILABLE',
          message: 'Hanya pangkalan data iSEPADU Core dibenarkan untuk komit data Master. Komit dibatalkan demi keselamatan SSOT.',
        });
      }

      // 1. Verify session exists on Core DB and is in PREVIEW status
      const sessionRef = targetCoreDb.doc(`import_sessions/${sessionId}`);
      const sessionSnap = await sessionRef.get();
      if (!sessionSnap.exists) {
        return res.status(404).json({ error: 'Sesi import tidak ditemui atau telah tamat tempoh.' });
      }

      const sessionData = sessionSnap.data();
      if (sessionData?.status === 'COMMITTED') {
        return res.status(400).json({ error: 'Sesi import ini telah pun dikomit sebelum ini. Elakkan komit berulang.' });
      }
      if (sessionData?.status !== 'PREVIEW') {
        return res.status(400).json({ error: `Sesi import mempunyai status '${sessionData?.status}'. Hanya sesi berstatus 'PREVIEW' dibenarkan untuk dikomit.` });
      }

      // 2. Load staged rows directly from server staging - NEVER trust client row objects
      const stagedSnaps = await targetCoreDb.collection(`import_staging/${sessionId}/rows`).get();
      if (stagedSnaps.empty) {
        return res.status(404).json({ error: 'Tiada data staging ditemui bagi sesi ini.' });
      }

      const approvedSet = Array.isArray(approvedRowIds) && approvedRowIds.length > 0 
        ? new Set(approvedRowIds.map(String)) 
        : null;

      // Filter eligible rows: Only NEW, UPDATE, MATCHED. CONFLICT, DUPLICATE, INVALID are strictly excluded.
      const eligibleRows = stagedSnaps.docs
        .map(d => d.data())
        .filter(r => {
          if (approvedSet && !approvedSet.has(String(r.rowId))) return false;
          return ['NEW', 'UPDATE', 'MATCHED'].includes(r.status);
        });

      if (eligibleRows.length === 0) {
        return res.status(400).json({ error: 'Tiada rekod sah yang diluluskan untuk dikomit (status NEW, UPDATE, atau MATCHED).' });
      }

      let committedCount = 0;
      const batchLimit = 350;
      let currentBatch = targetCoreDb.batch();
      let opCount = 0;

      for (const row of eligibleRows) {
        const norm = row.normalized;
        const personnelId = row.proposedId || row.matchedPersonnelId;
        if (!personnelId || !norm) continue;

        const personnelRef = targetCoreDb.doc(`personnel/${personnelId}`);
        const personnelSnap = await personnelRef.get();

        const teacherRef = targetCoreDb.doc(`teachers/${personnelId}`);
        const teacherSnap = await teacherRef.get();

        // Snapshot previous state for 100% reversible rollback - BOTH personnel AND teachers
        const rollbackRef = targetCoreDb.doc(`rollback_records/${sessionId}_${personnelId}`);
        currentBatch.set(rollbackRef, {
          id: `${sessionId}_${personnelId}`,
          sessionId,
          collection: 'personnel',
          docId: personnelId,
          action: personnelSnap.exists ? 'UPDATE' : 'CREATE',
          previousState: personnelSnap.exists ? personnelSnap.data() : null,
          teacherPreviousState: teacherSnap.exists ? teacherSnap.data() : null,
          teacherExisted: teacherSnap.exists,
          timestamp: new Date().toISOString(),
        });
        opCount++;

        // Commit to canonical personnel on Core DB
        const personnelPayload: any = {
          id: personnelId,
          name: norm.name,
          gender: norm.gender,
          staffFileNo: norm.staffFileNo || '',
          grade: norm.grade || '',
          position: norm.position || '',
          datePlaced: norm.datePlaced || '',
          dateAppointed: norm.dateAppointed || '',
          dateConfirmed: norm.dateConfirmed || '',
          majorOption: norm.majorOption || '',
          minorOption: norm.minorOption || '',
          datePensionStatus: norm.datePensionStatus || '',
          datePension: norm.datePension || '',
          dateNextPromotion: norm.dateNextPromotion || '',
          phone: norm.phone || '',
          email: norm.email || '',
          apcReceived: norm.apcReceived || '',
          employmentStatus: norm.employmentStatus || 'Tetap',
          teachingStatus: norm.teachingStatus || 'Aktif',
          importSessionId: sessionId,
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (norm.ic) {
          personnelPayload.ic = norm.ic;
        }

        if (!personnelSnap.exists) {
          personnelPayload.createdAt = FieldValue.serverTimestamp();
          personnelPayload.portfolios = [];
          personnelPayload.committees = [];
          personnelPayload.coordinators = [];
          personnelPayload.additionalResponsibilities = [];
        }

        currentBatch.set(personnelRef, personnelPayload, { merge: true });
        opCount++;

        // Enforce Guru vs AKP invariant:
        // GURU -> write to personnel AND teachers legacy mirror.
        // AKP -> write to personnel ONLY (never write AKP into teachers).
        if (norm.category === 'GURU') {
          currentBatch.set(teacherRef, {
            id: personnelId,
            name: norm.name,
            email: norm.email || '',
            gender: norm.gender,
            grade: norm.grade || '',
            role: norm.position || 'GURU',
            status: norm.teachingStatus || 'Aktif',
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          opCount++;
        }

        committedCount++;

        if (opCount >= batchLimit) {
          await currentBatch.commit();
          currentBatch = targetCoreDb.batch();
          opCount = 0;
        }
      }

      if (opCount > 0) {
        await currentBatch.commit();
      }

      // Update import session status
      await sessionRef.update({
        status: 'COMMITTED',
        committedCount,
        committedAt: FieldValue.serverTimestamp(),
        committedBy: caller.uid,
      });

      // Audit trail entry
      await targetCoreDb.collection('audit_trail').add({
        timestamp: new Date().toISOString(),
        actor_id: caller.uid,
        actor_name: caller.email || 'Admin',
        actor_role: isSysAdmin ? 'admin' : 'principal',
        action_type: 'IMPORT_GURU_GOOGLE_SHEET_COMMITTED',
        layer: 'MASTER_DATA',
        entity_id: sessionId,
        details: {
          sessionId,
          committedCount,
          source: sessionData?.sheetSource,
          targetInfo: `${CORE_PROJECT_ID}/${CORE_DATABASE_ID}`,
        },
      });

      // Auto-sync newly committed personnel into Attendance Users collection
      let syncResult: any = null;
      try {
        syncResult = await syncPersonnelToUsers(caller.uid, caller.email || 'Admin');
      } catch (syncErr: any) {
        console.warn('Auto-sync personnel to users warning in guru-commit:', syncErr?.message);
      }

      return res.json({
        success: true,
        message: `Berjaya mengimport ${committedCount} profil guru ke dalam Master Personnel (SSOT) dan menyelaraskan ke Kehadiran Staf.`,
        sessionId,
        committedCount,
        syncedToUsersCount: syncResult?.syncedCount || 0,
        target: `${CORE_PROJECT_ID}/${CORE_DATABASE_ID}`,
      });
    } catch (commitErr: any) {
      if (commitErr.code === 'CORE_DATABASE_UNAVAILABLE' || commitErr.message === 'CORE_DATABASE_UNAVAILABLE') {
        console.warn('[Core DB Standalone] Core database unavailable for Guru import commit.');
        return res.status(503).json({
          error: 'CORE_DATABASE_UNAVAILABLE',
          message: 'iSEPADU Core tidak dapat dicapai atau kebenaran IAM belum diberikan. Tiada data telah ditulis ke pangkalan data.',
          target: {
            projectId: CORE_PROJECT_ID,
            databaseId: CORE_DATABASE_ID,
          },
          details: commitErr.details || commitErr.message,
        });
      }
      console.error('Error committing Guru import:', commitErr);
      return res.status(500).json({ error: `Ralat komit data guru: ${commitErr.message}` });
    }
  });

  // 4. Rollback Guru Import Session Endpoint (100% Reversible)
  app.post('/api/import/guru-rollback', async (req: Request, res: Response) => {
    const caller = await verifyCallerAuth(req, true);
    if (!caller) {
      return res.status(401).json({ error: '未授权：请先登录' });
    }

    const [isSysAdmin, isPrincipal] = await Promise.all([
      isCallerSystemAdmin(caller.uid, caller.claims),
      isCallerPrincipal(caller.uid, caller.claims),
    ]);

    if (!isSysAdmin && !isPrincipal) {
      return res.status(403).json({ error: '禁止访问：只有校长或系统管理员可以执行回滚操作。' });
    }

    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'Sila berikan sessionId untuk diundur balik.' });
    }

    try {
      const {
        db: targetCoreDb,
        isTargetCore,
        targetInfo
      } = await getCoreDbInstance();

      if (!isTargetCore) {
        return res.status(503).json({
          error: 'CORE_DB_UNAVAILABLE',
          message: 'Hanya pangkalan data iSEPADU Core dibenarkan untuk undur balik data Master.',
        });
      }

      const rollbackSnaps = await targetCoreDb.collection('rollback_records')
        .where('sessionId', '==', sessionId)
        .get();

      if (rollbackSnaps.empty) {
        return res.status(404).json({ error: 'Tiada rekod snapshot undur balik ditemui bagi sesi ini.' });
      }

      let revertedCount = 0;
      let batch = targetCoreDb.batch();
      let opCount = 0;

      for (const rDoc of rollbackSnaps.docs) {
        const rec = rDoc.data();
        const targetRef = targetCoreDb.doc(`${rec.collection}/${rec.docId}`);
        const teacherRef = targetCoreDb.doc(`teachers/${rec.docId}`);

        if (rec.action === 'CREATE') {
          // Was newly created in import -> delete both personnel and teachers mirror on rollback
          batch.delete(targetRef);
          batch.delete(teacherRef);
        } else if (rec.action === 'UPDATE') {
          // Was updated in import -> restore previous state for both
          if (rec.previousState) {
            batch.set(targetRef, rec.previousState);
          }
          if (rec.teacherExisted && rec.teacherPreviousState) {
            batch.set(teacherRef, rec.teacherPreviousState);
          } else if (!rec.teacherExisted) {
            batch.delete(teacherRef);
          }
        }
        batch.delete(rDoc.ref); // Clean up rollback record
        opCount += 3;
        revertedCount++;

        if (opCount >= 350) {
          await batch.commit();
          batch = targetCoreDb.batch();
          opCount = 0;
        }
      }

      if (opCount > 0) {
        await batch.commit();
      }

      await targetCoreDb.doc(`import_sessions/${sessionId}`).update({
        status: 'ROLLED_BACK',
        rolledBackAt: FieldValue.serverTimestamp(),
        rolledBackBy: caller.uid,
      });

      await targetCoreDb.collection('audit_trail').add({
        timestamp: new Date().toISOString(),
        actor_id: caller.uid,
        actor_name: caller.email || 'Admin',
        actor_role: isSysAdmin ? 'admin' : 'principal',
        action_type: 'IMPORT_GURU_GOOGLE_SHEET_ROLLED_BACK',
        layer: 'MASTER_DATA',
        entity_id: sessionId,
        details: { sessionId, revertedCount },
      });

      return res.json({
        success: true,
        message: `Sesi import ${sessionId} berjaya diundur balik. ${revertedCount} rekod telah dipulihkan ke keadaan asal.`,
        revertedCount,
      });
    } catch (err: any) {
      if (err.code === 'CORE_DATABASE_UNAVAILABLE' || err.message === 'CORE_DATABASE_UNAVAILABLE') {
        return res.status(503).json({
          error: 'CORE_DATABASE_UNAVAILABLE',
          message: 'iSEPADU Core tidak dapat dicapai atau kebenaran IAM belum diberikan.',
          target: {
            projectId: CORE_PROJECT_ID,
            databaseId: CORE_DATABASE_ID,
          },
          details: err.details || err.message,
        });
      }
      return res.status(500).json({ error: `Ralat undur balik: ${err.message}` });
    }
  });

  // ================= 1C-STUDENT. APDM EXCEL STUDENT IMPORT & SAFE NON-DESTRUCTIVE UPSERT =================

  // Helper: Extract Birth Year and calculate age by birth year
  function parseApdmBirthYear(birthDateRaw: any, icRaw: string, activeAcademicYear: number = 2026): {
    birthDate: string;
    birthYear: number;
    age: number;
  } {
    let birthDate = '';
    let birthYear = 0;

    if (typeof birthDateRaw === 'number') {
      try {
        const parsed = (XLSX.SSF as any).parse_date_code(birthDateRaw);
        if (parsed && parsed.y) {
          birthYear = parsed.y;
          birthDate = `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
        }
      } catch {
        // ignore
      }
    } else if (birthDateRaw) {
      const str = String(birthDateRaw).trim();
      const m = str.match(/\b(19\d\d|20\d\d)\b/);
      if (m) {
        birthYear = parseInt(m[1], 10);
        birthDate = str;
      } else {
        birthDate = str;
      }
    }

    // Fallback to IC (MyKid)
    const cleanIc = String(icRaw || '').replace(/[^0-9]/g, '');
    if (!birthYear && cleanIc.length >= 6) {
      const yy = parseInt(cleanIc.slice(0, 2), 10);
      const mm = cleanIc.slice(2, 4);
      const dd = cleanIc.slice(4, 6);
      birthYear = yy <= 35 ? 2000 + yy : 1900 + yy;
      if (!birthDate || birthDate === '-') {
        birthDate = `${birthYear}-${mm}-${dd}`;
      }
    }

    if (!birthYear) {
      birthYear = 2018; // default fallback
    }

    const age = activeAcademicYear - birthYear;
    return { birthDate: birthDate || '-', birthYear, age };
  }

  // Helper: Auto-route class based on birth-year age and 6YO policy
  function routeStudentClass(age: number, rawYear: string = ''): {
    suggestedYear: number;
    suggestedClass: string;
    isSixYearsOld: boolean;
  } {
    const normRawYear = (rawYear || '').toUpperCase();
    const isSixYearsOld = age === 6;

    if (age <= 5) {
      return { suggestedYear: 0, suggestedClass: 'PRASEKOLAH', isSixYearsOld: false };
    }
    if (age === 6) {
      // 6 years old: Default PRASEKOLAH, gating checkbox allows user to upgrade to TAHUN 1
      return { suggestedYear: 0, suggestedClass: 'PRASEKOLAH', isSixYearsOld: true };
    }
    if (age === 7) {
      return { suggestedYear: 1, suggestedClass: 'TAHUN 1', isSixYearsOld: false };
    }
    if (age === 8) {
      return { suggestedYear: 2, suggestedClass: 'TAHUN 2', isSixYearsOld: false };
    }
    if (age === 9) {
      return { suggestedYear: 3, suggestedClass: 'TAHUN 3', isSixYearsOld: false };
    }
    if (age === 10) {
      return { suggestedYear: 4, suggestedClass: 'TAHUN 4', isSixYearsOld: false };
    }
    if (age === 11) {
      return { suggestedYear: 5, suggestedClass: 'TAHUN 5', isSixYearsOld: false };
    }
    if (age >= 12) {
      return { suggestedYear: 6, suggestedClass: 'TAHUN 6', isSixYearsOld: false };
    }

    // Fallback based on raw text if available
    if (normRawYear.includes('PRA')) return { suggestedYear: 0, suggestedClass: 'PRASEKOLAH', isSixYearsOld: false };
    if (normRawYear.includes('SATU') || normRawYear.includes('1')) return { suggestedYear: 1, suggestedClass: 'TAHUN 1', isSixYearsOld: false };
    if (normRawYear.includes('DUA') || normRawYear.includes('2')) return { suggestedYear: 2, suggestedClass: 'TAHUN 2', isSixYearsOld: false };
    if (normRawYear.includes('TIGA') || normRawYear.includes('3')) return { suggestedYear: 3, suggestedClass: 'TAHUN 3', isSixYearsOld: false };
    if (normRawYear.includes('EMPAT') || normRawYear.includes('4')) return { suggestedYear: 4, suggestedClass: 'TAHUN 4', isSixYearsOld: false };
    if (normRawYear.includes('LIMA') || normRawYear.includes('5')) return { suggestedYear: 5, suggestedClass: 'TAHUN 5', isSixYearsOld: false };
    if (normRawYear.includes('ENAM') || normRawYear.includes('6')) return { suggestedYear: 6, suggestedClass: 'TAHUN 6', isSixYearsOld: false };

    return { suggestedYear: 1, suggestedClass: 'TAHUN 1', isSixYearsOld: false };
  }

  // 1. APDM Excel Student Import Preview Endpoint
  app.post('/api/import/apdm-student-preview', async (req: Request, res: Response) => {
    const caller = await verifyCallerAuth(req, true);
    if (!caller) {
      return res.status(401).json({ error: '未授权：请先登录' });
    }

    const [isSysAdmin, isPrincipal] = await Promise.all([
      isCallerSystemAdmin(caller.uid, caller.claims),
      isCallerPrincipal(caller.uid, caller.claims),
    ]);

    if (!isSysAdmin && !isPrincipal) {
      return res.status(403).json({ error: '禁止访问：只有校长或系统管理员可以执行学生数据导入。' });
    }

    const { excelBase64, csvData, academicYear = '2026', fileName = 'YCC3404 Keseluruhan Murid.xlsx' } = req.body;
    let workbook: XLSX.WorkBook;

    try {
      if (excelBase64 && typeof excelBase64 === 'string') {
        const buffer = Buffer.from(excelBase64.replace(/^data:.*,/, ''), 'base64');
        workbook = XLSX.read(buffer, { type: 'buffer' });
      } else if (csvData && typeof csvData === 'string') {
        workbook = XLSX.read(csvData, { type: 'string', raw: false });
      } else {
        return res.status(400).json({ error: 'Sila muat naik fail Excel (.xlsx) atau teks CSV yang sah.' });
      }

      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        return res.status(400).json({ error: 'Tiada lembaran kerja (worksheet) ditemui dalam fail.' });
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const rows2D = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '', raw: false });

      // Scan for the actual APDM header row (handling top school banner rows)
      let headerRowIndex = -1;
      for (let r = 0; r < Math.min(rows2D.length, 20); r++) {
        const row = rows2D[r];
        const joined = row.map((c: any) => String(c).trim().toUpperCase()).join(' ');
        if (
          joined.includes('ID MURID') ||
          (joined.includes('NAMA') && (joined.includes('PENGENALAN') || joined.includes('TARIKH LAHIR') || joined.includes('BIL.')))
        ) {
          headerRowIndex = r;
          break;
        }
      }

      let rawRows: Record<string, any>[] = [];
      let columnsDetected: string[] = [];

      if (headerRowIndex !== -1) {
        columnsDetected = rows2D[headerRowIndex].map((h: any) => String(h).trim().replace(/\r?\n/g, ' '));
        for (let i = headerRowIndex + 1; i < rows2D.length; i++) {
          const rawRow = rows2D[i];
          if (!rawRow || rawRow.every((cell: any) => !cell || String(cell).trim() === '')) continue;
          const obj: Record<string, any> = {};
          columnsDetected.forEach((h: string, colIdx: number) => {
            if (h) obj[h] = rawRow[colIdx] !== undefined && rawRow[colIdx] !== null ? String(rawRow[colIdx]).trim() : '';
          });
          rawRows.push(obj);
        }
      } else {
        rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '', raw: false });
        columnsDetected = Array.from(new Set(rawRows.flatMap(r => Object.keys(r)))).filter(Boolean);
      }

      if (rawRows.length === 0) {
        return res.status(400).json({ error: 'Lembaran kerja tidak mengandungi sebarang baris rekod murid.' });
      }

      // Query current canonical student_master from authoritative Core target
      const { db: targetCoreDb, targetInfo, isTargetCore } = await getCoreDbInstance();
      const existingMasterSnap = await targetCoreDb.collection('student_master').get();
      const existingByApdm = new Map<string, { id: string; data: any }>();
      const existingByIc = new Map<string, { id: string; data: any }>();

      existingMasterSnap.forEach(d => {
        const data = d.data();
        if (data.apdmId) existingByApdm.set(String(data.apdmId).trim(), { id: d.id, data });
        if (data.student_id) existingByApdm.set(String(data.student_id).trim(), { id: d.id, data });
        if (data.icNumber) existingByIc.set(String(data.icNumber).replace(/[^0-9]/g, ''), { id: d.id, data });
      });

      const activeYearNum = parseInt(academicYear, 10) || 2026;
      const seenApdmInSheet = new Map<string, number>();
      const seenIcInSheet = new Map<string, number>();

      const summary = {
        totalSourceRows: rawRows.length,
        new: 0,
        matched: 0,
        update: 0,
        conflict: 0,
        duplicate: 0,
        invalid: 0,
        sixYearsOldCount: 0,
        preschoolCount: 0,
        primaryCount: 0,
      };

      const sessionId = `student_import_${Date.now()}`;
      const previewRows: any[] = [];
      const sixYearsOldStudents: any[] = [];
      const stagingBatch = targetCoreDb.batch();
      let stagingOpCount = 0;

      for (let i = 0; i < rawRows.length; i++) {
        const rawRow = rawRows[i];
        const rowNumber = i + 1;

        // Map row by aliases
        const normMap: Record<string, string> = {};
        for (const [key, val] of Object.entries(rawRow)) {
          const cleanK = normalizeHeaderKey(key);
          normMap[cleanK] = val !== undefined && val !== null ? String(val).trim() : '';
        }

        const getByAlias = (...aliases: string[]): string => {
          for (const a of aliases) {
            const normA = normalizeHeaderKey(a);
            if (normMap[normA] !== undefined && normMap[normA] !== '') {
              return normMap[normA];
            }
          }
          for (const [k, v] of Object.entries(normMap)) {
            for (const a of aliases) {
              const normA = normalizeHeaderKey(a);
              if (k.includes(normA) || normA.includes(k)) {
                if (v !== '') return v;
              }
            }
          }
          return '';
        };

        const apdmId = getByAlias('ID MURID', 'IDMURID', 'ID_MURID', 'APDM ID', 'ID');
        const name = getByAlias('NAMA', 'NAMA MURID', 'NAME');
        const icNumber = getByAlias('NO. PENGENALAN', 'NO PENGENALAN', 'NO. KP', 'NO KP', 'MYKID', 'IC');
        const cleanIc = icNumber.replace(/[^0-9]/g, '');
        const maskedIc = maskIcNumber(cleanIc);
        const idType = getByAlias('JENIS PENGENALAN', 'JNS. PENGENALAN', 'JENIS KP') || 'MYKID';
        const birthDateRaw = getByAlias('TARIKH LAHIR', 'T. LAHIR', 'DOB');
        const rawGender = getByAlias('JANTINA', 'JAN', 'GENDER');
        const gender: 'L' | 'P' = (rawGender.toUpperCase().startsWith('P') || rawGender.toUpperCase() === 'F' || rawGender.toUpperCase().includes('PEREMPUAN')) ? 'P' : 'L';
        const race = getByAlias('KAUM', 'BANGSA', 'KETURUNAN') || 'Cina';
        const religion = getByAlias('AGAMA') || '-';
        const citizenship = getByAlias('WARGANEGARA', 'KERAKYATAN') || 'WARGANEGARA';
        const studyStatus = getByAlias('STATUS PENGAJIAN', 'STATUS') || 'BERSEKOLAH';
        const enrolmentDate = getByAlias('TARIKH MASUK SEKOLAH', 'TARIKH MASUK') || '';
        const rawYear = getByAlias('TAHUN / TINGKATAN', 'TAHUN/TINGKATAN', 'TINGKATAN', 'TAHUN');
        const rawClassName = getByAlias('NAMA KELAS', 'KELAS');
        const classTeacherName = getByAlias('NAMA GURU KELAS', 'GURU KELAS');

        // Welfare
        const okuStatus = getByAlias('STATUS OKU', 'OKU');
        const disabilityCategory = getByAlias('KATEGORI KETIDAKUPAYAAN', 'KETIDAKUPAYAAN');
        const disabilitySubCategory = getByAlias('SUBKATEGORI KETIDAKUPAYAAN');
        const okuCardNo = getByAlias('NO. PENDAFTARAN OKU');
        const isOku = okuStatus.toUpperCase() === 'YA' || !!disabilityCategory;
        const orphanStatus = getByAlias('STATUS YATIM', 'YATIM') || 'TIDAK';
        const isOrphan = orphanStatus.toUpperCase().includes('YATIM');
        const bankAccountNumber = getByAlias('NO. AKAUN BANK', 'NO AKAUN BANK', 'AKAUN BANK');
        const bankName = getByAlias('NAMA BANK');
        const dependentsCount = getByAlias('TANGGUNGAN', 'BIL TANGGUNGAN');

        // Guardian 1
        const guardian1Name = getByAlias('PENJAGA 1', 'NAMA PENJAGA 1', 'BAPA', 'NAMA BAPA');
        const guardian1Ic = getByAlias('NO. PENGENALAN PENJAGA 1', 'NO KP PENJAGA 1');
        const guardian1Relation = getByAlias('HUBUNGAN PENJAGA 1', 'HUBUNGAN 1') || 'BAPA';
        const guardian1Occupation = getByAlias('PEKERJAAN PENJAGA 1', 'PEKERJAAN 1');
        const guardian1EmpStatus = getByAlias('STATUS KERJA PENJAGA 1');
        const guardian1Employer = getByAlias('NAMA MAJIKAN PENJAGA 1', 'MAJIKAN 1');
        const guardian1Income = getByAlias('PENDAPATAN PENJAGA 1', 'GAJI 1');
        const guardian1OfficePhone = getByAlias('NO. TEL. PEJABAT PENJAGA 1', 'TEL PEJABAT 1');
        const guardian1MobilePhone = getByAlias('NO. TEL. BIMBIT PENJAGA 1', 'NO TEL BIMBIT 1', 'HP PENJAGA 1', 'TEL 1');

        // Guardian 2
        const guardian2Name = getByAlias('PENJAGA 2', 'NAMA PENJAGA 2', 'IBU', 'NAMA IBU');
        const guardian2Ic = getByAlias('NO. PENGENALAN PENJAGA 2', 'NO KP PENJAGA 2');
        const guardian2Relation = getByAlias('HUBUNGAN PENJAGA 2', 'HUBUNGAN 2') || 'IBU';
        const guardian2Occupation = getByAlias('PEKERJAAN PENJAGA 2', 'PEKERJAAN 2');
        const guardian2EmpStatus = getByAlias('STATUS KERJA PENJAGA 2');
        const guardian2Employer = getByAlias('NAMA MAJIKAN PENJAGA 2', 'MAJIKAN 2');
        const guardian2Income = getByAlias('PENDAPATAN PENJAGA 2', 'GAJI 2');
        const guardian2OfficePhone = getByAlias('NO. TEL. PEJABAT PENJAGA 2', 'TEL PEJABAT 2');
        const guardian2MobilePhone = getByAlias('NO. TEL. BIMBIT PENJAGA 2', 'NO TEL BIMBIT 2', 'HP PENJAGA 2', 'TEL 2');

        // Address
        const address1 = getByAlias('ALAMAT 1', 'ALAMAT');
        const address2 = getByAlias('ALAMAT 2');
        const address3 = getByAlias('ALAMAT 3');
        const postcode = getByAlias('POSKOD');
        const city = getByAlias('BANDAR');
        const district = getByAlias('DAERAH');
        const state = getByAlias('NEGERI') || 'SARAWAK';

        // Birth-year calculation
        const { birthDate, birthYear, age } = parseApdmBirthYear(birthDateRaw, cleanIc, activeYearNum);
        const { suggestedYear, suggestedClass, isSixYearsOld } = routeStudentClass(age, rawYear);

        const rowId = `student_row_${rowNumber}_${apdmId || cleanIc || crypto.randomUUID().slice(0, 8)}`;

        // Row validation
        if (!name || (!apdmId && !cleanIc)) {
          summary.invalid++;
          const previewItem = {
            rowNumber,
            rowId,
            apdmId: apdmId || '-',
            name: name || 'TIADA NAMA',
            icNumber: cleanIc,
            maskedIc,
            idType,
            birthDate,
            birthYear,
            age,
            gender,
            race,
            religion,
            citizenship,
            studyStatus,
            enrolmentDate,
            rawYear,
            rawClassName,
            suggestedYear,
            suggestedClass,
            isSixYearsOld,
            welfare: { isOku, okuStatus, disabilityCategory, isOrphan, orphanStatus, bankName, bankAccountNumber, dependentsCount },
            guardian1: { name: guardian1Name, relation: guardian1Relation, occupation: guardian1Occupation, mobilePhone: guardian1MobilePhone, officePhone: guardian1OfficePhone },
            guardian2: { name: guardian2Name, relation: guardian2Relation, occupation: guardian2Occupation, mobilePhone: guardian2MobilePhone, officePhone: guardian2OfficePhone },
            address: { address1, address2, address3, postcode, city, district, state },
            status: 'INVALID',
            matchReason: 'Nama atau pengecam utama (ID Murid / No. Pengenalan) tiada.',
            proposedId: '',
            existingId: null,
          };
          previewRows.push(previewItem);
          stagingBatch.set(targetCoreDb.doc(`import_staging/${sessionId}/rows/${rowId}`), deepSanitizeFirestore({
            ...previewItem,
            existingId: null,
            sessionId,
            createdAt: new Date().toISOString(),
          }));
          stagingOpCount++;
          continue;
        }

        // Intra-sheet duplicates check
        if (apdmId && seenApdmInSheet.has(apdmId)) {
          summary.duplicate++;
          const previewItem = {
            rowNumber,
            rowId,
            apdmId,
            name,
            icNumber: cleanIc,
            maskedIc,
            idType,
            birthDate,
            birthYear,
            age,
            gender,
            race,
            religion,
            citizenship,
            studyStatus,
            enrolmentDate,
            rawYear,
            rawClassName,
            suggestedYear,
            suggestedClass,
            isSixYearsOld,
            welfare: { isOku, okuStatus, disabilityCategory, isOrphan, orphanStatus, bankName, bankAccountNumber, dependentsCount },
            guardian1: { name: guardian1Name, relation: guardian1Relation, occupation: guardian1Occupation, mobilePhone: guardian1MobilePhone, officePhone: guardian1OfficePhone },
            guardian2: { name: guardian2Name, relation: guardian2Relation, occupation: guardian2Occupation, mobilePhone: guardian2MobilePhone, officePhone: guardian2OfficePhone },
            address: { address1, address2, address3, postcode, city, district, state },
            status: 'DUPLICATE',
            matchReason: `ID Murid berulang dalam lembaran ini (sama dengan baris ${seenApdmInSheet.get(apdmId)}).`,
            proposedId: '',
            existingId: null,
          };
          previewRows.push(previewItem);
          stagingBatch.set(targetCoreDb.doc(`import_staging/${sessionId}/rows/${rowId}`), deepSanitizeFirestore({
            ...previewItem,
            existingId: null,
            sessionId,
            createdAt: new Date().toISOString(),
          }));
          stagingOpCount++;
          continue;
        }
        if (apdmId) seenApdmInSheet.set(apdmId, rowNumber);

        if (cleanIc && seenIcInSheet.has(cleanIc)) {
          summary.duplicate++;
          const previewItem = {
            rowNumber,
            rowId,
            apdmId,
            name,
            icNumber: cleanIc,
            maskedIc,
            idType,
            birthDate,
            birthYear,
            age,
            gender,
            race,
            religion,
            citizenship,
            studyStatus,
            enrolmentDate,
            rawYear,
            rawClassName,
            suggestedYear,
            suggestedClass,
            isSixYearsOld,
            welfare: { isOku, okuStatus, disabilityCategory, isOrphan, orphanStatus, bankName, bankAccountNumber, dependentsCount },
            guardian1: { name: guardian1Name, relation: guardian1Relation, occupation: guardian1Occupation, mobilePhone: guardian1MobilePhone, officePhone: guardian1OfficePhone },
            guardian2: { name: guardian2Name, relation: guardian2Relation, occupation: guardian2Occupation, mobilePhone: guardian2MobilePhone, officePhone: guardian2OfficePhone },
            address: { address1, address2, address3, postcode, city, district, state },
            status: 'DUPLICATE',
            matchReason: `No. Pengenalan (MyKid) berulang dalam lembaran ini (sama dengan baris ${seenIcInSheet.get(cleanIc)}).`,
            proposedId: '',
            existingId: null,
          };
          previewRows.push(previewItem);
          stagingBatch.set(targetCoreDb.doc(`import_staging/${sessionId}/rows/${rowId}`), deepSanitizeFirestore({
            ...previewItem,
            existingId: null,
            sessionId,
            createdAt: new Date().toISOString(),
          }));
          stagingOpCount++;
          continue;
        }
        if (cleanIc) seenIcInSheet.set(cleanIc, rowNumber);

        // Matching Hierarchy against Existing Database:
        // 1. Normalized apdmId
        // 2. Clean 12-digit icNumber
        let matchTarget: { id: string; data: any } | undefined;
        let matchType = '';

        if (apdmId && existingByApdm.has(apdmId)) {
          matchTarget = existingByApdm.get(apdmId);
          matchType = 'ID Murid APDM';
        } else if (cleanIc && existingByIc.has(cleanIc)) {
          matchTarget = existingByIc.get(cleanIc);
          matchType = 'No. Pengenalan (MyKid)';
        }

        let status: 'NEW' | 'MATCHED' | 'UPDATE' = 'NEW';
        let matchReason = 'Rekod murid baharu. Akan didaftarkan ke Student Master dan Kelas.';
        let existingId: string | null = null;
        const diffs: string[] = [];
        let proposedId = apdmId || cleanIc || `S_${crypto.randomUUID().slice(0, 8)}`;

        if (matchTarget) {
          existingId = matchTarget.id;
          proposedId = matchTarget.id; // PRESERVE EXISTING DOCUMENT KEY

          const existingData = matchTarget.data;
          if (existingData.name && existingData.name.toUpperCase() !== name.toUpperCase()) {
            diffs.push(`Nama dikemaskini dari "${existingData.name}" kepada "${name}"`);
          }
          if (existingData.currentClass !== suggestedClass) {
            diffs.push(`Penempatan kelas: "${existingData.currentClass || '-'}" -> "${suggestedClass}"`);
          }
          if (guardian1MobilePhone && existingData.guardian1?.mobilePhone !== guardian1MobilePhone) {
            diffs.push(`No. Telefon Penjaga 1 dikemaskini`);
          }

          if (diffs.length > 0) {
            status = 'UPDATE';
            matchReason = `Padanan tepat ditemui melalui ${matchType}. Medan baharu akan digabungkan (merge) tanpa menjejaskan data akademik sedia ada.`;
            summary.update++;
          } else {
            status = 'MATCHED';
            matchReason = `Padanan lengkap ditemui melalui ${matchType}. Tiada konflik dikesan.`;
            summary.matched++;
          }
        } else {
          status = 'NEW';
          summary.new++;
        }

        if (isSixYearsOld) summary.sixYearsOldCount++;
        if (suggestedYear === 0) summary.preschoolCount++;
        else summary.primaryCount++;

        const previewItem = {
          rowNumber,
          rowId,
          apdmId: apdmId || '',
          name,
          icNumber: cleanIc || '',
          maskedIc: maskedIc || '',
          idType: idType || 'MYKID',
          birthDate: birthDate || '',
          birthYear: birthYear || 0,
          age: age || 0,
          gender: gender || 'L',
          race: race || 'Cina',
          religion: religion || '-',
          citizenship: citizenship || 'WARGANEGARA',
          studyStatus: studyStatus || 'BERSEKOLAH',
          enrolmentDate: enrolmentDate || '',
          rawYear: rawYear || '',
          rawClassName: rawClassName || '',
          suggestedYear,
          suggestedClass,
          isSixYearsOld,
          welfare: {
            isOku: Boolean(isOku),
            okuStatus: okuStatus || '',
            disabilityCategory: disabilityCategory || '',
            isOrphan: Boolean(isOrphan),
            orphanStatus: orphanStatus || '',
            bankName: bankName || '',
            bankAccountNumber: bankAccountNumber || '',
            dependentsCount: dependentsCount || 0,
          },
          guardian1: { 
            name: guardian1Name || '', 
            icNumber: guardian1Ic || '', 
            relation: guardian1Relation || '', 
            occupation: guardian1Occupation || '', 
            employer: guardian1Employer || '', 
            income: guardian1Income || '', 
            officePhone: guardian1OfficePhone || '', 
            mobilePhone: guardian1MobilePhone || '', 
            employmentStatus: guardian1EmpStatus || '' 
          },
          guardian2: { 
            name: guardian2Name || '', 
            icNumber: guardian2Ic || '', 
            relation: guardian2Relation || '', 
            occupation: guardian2Occupation || '', 
            employer: guardian2Employer || '', 
            income: guardian2Income || '', 
            officePhone: guardian2OfficePhone || '', 
            mobilePhone: guardian2MobilePhone || '', 
            employmentStatus: guardian2EmpStatus || '' 
          },
          address: {
            address1: address1 || '',
            address2: address2 || '',
            address3: address3 || '',
            postcode: postcode || '',
            city: city || '',
            district: district || '',
            state: state || '',
          },
          status,
          matchReason,
          existingId: typeof existingId === 'string' && existingId.trim().length > 0 ? existingId.trim() : null,
          proposedId,
          diffs,
        };

        previewRows.push(previewItem);
        if (isSixYearsOld) {
          sixYearsOldStudents.push(previewItem);
        }

        stagingBatch.set(targetCoreDb.doc(`import_staging/${sessionId}/rows/${rowId}`), deepSanitizeFirestore({
          ...previewItem,
          sessionId,
          createdAt: new Date().toISOString(),
        }));
        stagingOpCount++;

        if (stagingOpCount >= 400) {
          await stagingBatch.commit();
          stagingOpCount = 0;
        }
      }

      if (stagingOpCount > 0) {
        await stagingBatch.commit();
      }

      // Record session in import_sessions
      await targetCoreDb.doc(`import_sessions/${sessionId}`).set(deepSanitizeFirestore({
        id: sessionId,
        timestamp: new Date().toISOString(),
        importType: 'student_apdm',
        status: 'PREVIEW',
        sheetSource: fileName,
        summary,
        totalRows: rawRows.length,
        targetInfo: `${CORE_PROJECT_ID}/${CORE_DATABASE_ID}`,
        actorName: caller.email || 'Admin',
        academicYear,
      }));

      return res.json({
        success: true,
        sessionId,
        sheetSource: fileName,
        columnsDetected,
        totalRows: rawRows.length,
        summary,
        sixYearsOldStudents,
        rows: previewRows,
      });
    } catch (err: any) {
      if (err?.code === 'CORE_DATABASE_UNAVAILABLE' || err?.message === 'CORE_DATABASE_UNAVAILABLE') {
        return res.status(503).json({
          error: 'CORE_DATABASE_UNAVAILABLE',
          message: 'iSEPADU Core tidak dapat dicapai atau kebenaran IAM belum diberikan.',
          details: err.details || err.message,
        });
      }
      console.error('Error generating APDM student import preview:', err);
      return res.status(500).json({ error: `Ralat memproses fail APDM: ${err.message}` });
    }
  });

  // 2. APDM Excel Student Import Commit Endpoint (Non-Destructive Upsert)
  app.post('/api/import/apdm-student-commit', async (req: Request, res: Response) => {
    const caller = await verifyCallerAuth(req, true);
    if (!caller) {
      return res.status(401).json({ error: '未授权：请先登录' });
    }

    const [isSysAdmin, isPrincipal] = await Promise.all([
      isCallerSystemAdmin(caller.uid, caller.claims),
      isCallerPrincipal(caller.uid, caller.claims),
    ]);

    if (!isSysAdmin && !isPrincipal) {
      return res.status(403).json({ error: '禁止访问：只有校长或系统管理员可以确认导入学生数据。' });
    }

    const { sessionId, sixYearsOldPromoteIds = [], approvedRowIds } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'Sila berikan sessionId untuk dikomit.' });
    }

    try {
      const { db: targetCoreDb, isTargetCore } = await getCoreDbInstance();
      if (!isTargetCore) {
        return res.status(503).json({
          error: 'CORE_DB_UNAVAILABLE',
          message: 'Hanya pangkalan data iSEPADU Core dibenarkan untuk komit data Master.',
        });
      }

      // 1. Verify session exists and is PREVIEW
      const sessionRef = targetCoreDb.doc(`import_sessions/${sessionId}`);
      const sessionSnap = await sessionRef.get();
      if (!sessionSnap.exists) {
        return res.status(404).json({ error: 'Sesi import tidak ditemui atau telah tamat tempoh.' });
      }

      const sessionData = sessionSnap.data();
      if (sessionData?.status === 'COMMITTED') {
        return res.status(400).json({ error: 'Sesi import ini telah pun dikomit sebelum ini.' });
      }
      if (sessionData?.status !== 'PREVIEW') {
        return res.status(400).json({ error: `Sesi import mempunyai status '${sessionData?.status}'. Hanya sesi 'PREVIEW' dibenarkan untuk dikomit.` });
      }

      const academicYear = sessionData?.academicYear || '2026';

      // 2. Load staged rows directly from server staging
      const stagedSnaps = await targetCoreDb.collection(`import_staging/${sessionId}/rows`).get();
      if (stagedSnaps.empty) {
        return res.status(404).json({ error: 'Tiada data staging ditemui bagi sesi ini.' });
      }

      const approvedSet = Array.isArray(approvedRowIds) && approvedRowIds.length > 0 
        ? new Set(approvedRowIds.map(String)) 
        : null;

      const eligibleRows = stagedSnaps.docs
        .map(d => d.data())
        .filter(r => {
          if (approvedSet && !approvedSet.has(String(r.rowId))) return false;
          return ['NEW', 'UPDATE', 'MATCHED'].includes(r.status);
        });

      if (eligibleRows.length === 0) {
        return res.status(400).json({ error: 'Tiada rekod sah yang diluluskan untuk dikomit.' });
      }

      const sixPromotedSet = new Set(
        Array.isArray(sixYearsOldPromoteIds) ? sixYearsOldPromoteIds.map(String) : []
      );

      let committedCount = 0;
      let batch = targetCoreDb.batch();
      let opCount = 0;

      for (const row of eligibleRows) {
        const studentId = row.proposedId || row.existingId;
        if (!studentId) continue;

        // Resolve 6-year-old class promotion decision
        let finalYear = row.suggestedYear;
        let finalClass = row.suggestedClass;

        if (row.isSixYearsOld) {
          const isPromoted = sixPromotedSet.has(String(row.rowId)) || sixPromotedSet.has(String(row.apdmId));
          if (isPromoted) {
            finalYear = 1;
            finalClass = 'TAHUN 1';
          } else {
            finalYear = 0;
            finalClass = 'PRASEKOLAH';
          }
        }

        const masterRef = targetCoreDb.doc(`student_master/${studentId}`);
        const masterSnap = await masterRef.get();

        const enrollId = `${studentId}_${academicYear.replace(/\//g, '-')}`;
        const enrollRef = targetCoreDb.doc(`students/${enrollId}`);
        const enrollSnap = await enrollRef.get();

        // 100% reversible rollback snapshot
        const rollbackRef = targetCoreDb.doc(`rollback_records/${sessionId}_${studentId}`);
        batch.set(rollbackRef, deepSanitizeFirestore({
          id: `${sessionId}_${studentId}`,
          sessionId,
          collection: 'student_master',
          docId: studentId,
          action: masterSnap.exists ? 'UPDATE' : 'CREATE',
          previousState: masterSnap.exists ? masterSnap.data() : null,
          enrollmentExisted: enrollSnap.exists,
          enrollmentPreviousState: enrollSnap.exists ? enrollSnap.data() : null,
          enrollId,
          timestamp: new Date().toISOString(),
        }));
        opCount++;

        // Non-destructive upsert to student_master (Preserves custom notes, interventions, etc.)
        const masterPayload: any = {
          student_id: studentId,
          apdmId: row.apdmId || '',
          name: row.name.toUpperCase(),
          icNumber: row.icNumber || '',
          maskedIc: row.maskedIc || '',
          idType: row.idType || 'MYKID',
          birthDate: row.birthDate || '',
          birthYear: row.birthYear || 0,
          age: row.age || 0,
          gender: row.gender,
          race: row.race || 'Cina',
          religion: row.religion || '-',
          citizenship: row.citizenship || 'WARGANEGARA',
          studyStatus: row.studyStatus || 'BERSEKOLAH',
          enrolmentDate: row.enrolmentDate || '',
          currentClass: finalClass,
          currentYear: finalYear,
          academicYear,
          welfare: row.welfare || {},
          guardian1: row.guardian1 || {},
          guardian2: row.guardian2 || {},
          address: row.address || {},
          phone: row.guardian1?.mobilePhone || row.guardian2?.mobilePhone || '',
          importSessionId: sessionId,
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (!masterSnap.exists) {
          masterPayload.createdAt = FieldValue.serverTimestamp();
        }

        batch.set(masterRef, deepSanitizeFirestore(masterPayload), { merge: true });
        opCount++;

        // Non-destructive upsert to students collection (sessional enrollment)
        const enrollPayload: any = {
          id: enrollId,
          student_id: studentId,
          apdmId: row.apdmId || '',
          name: row.name.toUpperCase(),
          class: finalClass,
          year: finalYear,
          academic_year: academicYear,
          gender: row.gender,
          race: row.race || 'Cina',
          icNumber: row.icNumber || '',
          maskedIc: row.maskedIc || '',
          birthDate: row.birthDate || '',
          birthYear: row.birthYear || 0,
          age: row.age || 0,
          guardianPhone: row.guardian1?.mobilePhone || row.guardian2?.mobilePhone || '',
          guardianName: row.guardian1?.name || '',
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (!enrollSnap.exists) {
          enrollPayload.createdAt = FieldValue.serverTimestamp();
        }

        batch.set(enrollRef, deepSanitizeFirestore(enrollPayload), { merge: true });
        opCount++;

        committedCount++;

        if (opCount >= 350) {
          await batch.commit();
          batch = targetCoreDb.batch();
          opCount = 0;
        }
      }

      if (opCount > 0) {
        await batch.commit();
      }

      // Update session status
      await sessionRef.update(deepSanitizeFirestore({
        status: 'COMMITTED',
        committedCount,
        committedAt: FieldValue.serverTimestamp(),
        committedBy: caller.uid,
      }));

      // Audit trail entry
      await targetCoreDb.collection('audit_trail').add(deepSanitizeFirestore({
        timestamp: new Date().toISOString(),
        actor_id: caller.uid,
        actor_name: caller.email || 'Admin',
        actor_role: isSysAdmin ? 'admin' : 'principal',
        action_type: 'IMPORT_APDM_STUDENTS_COMMITTED',
        layer: 'MASTER_DATA',
        entity_id: sessionId,
        details: {
          sessionId,
          committedCount,
          targetInfo: `${CORE_PROJECT_ID}/${CORE_DATABASE_ID}`,
          source: sessionData?.sheetSource,
        },
      }));

      return res.json({
        success: true,
        message: `Berjaya mengimport ${committedCount} profil murid ke dalam Student Master dan Penempatan Kelas Sesi ${academicYear}.`,
        sessionId,
        committedCount,
        target: `${CORE_PROJECT_ID}/${CORE_DATABASE_ID}`,
      });
    } catch (err: any) {
      if (err.code === 'CORE_DATABASE_UNAVAILABLE' || err.message === 'CORE_DATABASE_UNAVAILABLE') {
        return res.status(503).json({
          error: 'CORE_DATABASE_UNAVAILABLE',
          message: 'iSEPADU Core tidak dapat dicapai atau kebenaran IAM belum diberikan.',
        });
      }
      console.error('Error committing APDM student import:', err);
      return res.status(500).json({ error: `Ralat komit data murid: ${err.message}` });
    }
  });

  // 3. Complete Student Profile Endpoint (Reads from SSOT, PBD, UASA, Kokurikulum)
  app.get('/api/student-profile/:studentId', async (req: Request, res: Response) => {
    const caller = await verifyCallerAuth(req);
    if (!caller) {
      return res.status(401).json({ error: '未授权：请先登录' });
    }

    const { studentId } = req.params;
    const academicYear = (req.query.academicYear as string) || '2026';

    try {
      const { db: targetCoreDb } = await getCoreDbInstance();

      // Fetch student_master
      let masterData: any = null;
      const masterDoc = await targetCoreDb.doc(`student_master/${studentId}`).get();
      if (masterDoc.exists) {
        masterData = { student_id: masterDoc.id, ...masterDoc.data() };
      } else {
        // Query by apdmId
        const apdmSnap = await targetCoreDb.collection('student_master').where('apdmId', '==', studentId).limit(1).get();
        if (!apdmSnap.empty) {
          masterData = { student_id: apdmSnap.docs[0].id, ...apdmSnap.docs[0].data() };
        }
      }

      // Fetch sessional enrollment
      const enrollId = `${studentId}_${academicYear.replace(/\//g, '-')}`;
      const enrollDoc = await targetCoreDb.doc(`students/${enrollId}`).get();
      const enrollment = enrollDoc.exists ? { id: enrollDoc.id, ...enrollDoc.data() } : null;

      // Fetch PBD Results
      const pbdSnap = await targetCoreDb.collection('pbd_results')
        .where('student_id', '==', studentId)
        .where('academic_year', '==', academicYear)
        .get();
      const pbdResults = pbdSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Fetch UASA Results
      const uasaSnap = await targetCoreDb.collection('uasa_results')
        .where('student_id', '==', studentId)
        .where('academic_year', '==', academicYear)
        .get();
      const uasaResults = uasaSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Fetch Kokurikulum Memberships
      const kokoSnap = await targetCoreDb.collection('koko_memberships')
        .where('student_id', '==', studentId)
        .where('academicYear', '==', academicYear)
        .get();
      const kokoMemberships = kokoSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      return res.json({
        success: true,
        studentMaster: masterData,
        enrollment,
        pbdResults,
        uasaResults,
        kokoMemberships,
      });
    } catch (err: any) {
      console.error('Error fetching student profile:', err);
      return res.status(500).json({ error: err.message || 'Gagal memuat profil murid.' });
    }
  });

  // Resilient Auth user creator with REST fallback
  async function createOrUpdateAuthUserResilient(targetEmail: string, targetPassword: string, displayName: string): Promise<string> {
    try {
      const newRecord = await adminAuth.createUser({
        email: targetEmail,
        password: targetPassword,
        displayName,
      });
      return newRecord.uid;
    } catch (authErr: any) {
      if (authErr.code === 'auth/email-already-exists') {
        try {
          const existingAuth = await adminAuth.getUserByEmail(targetEmail);
          await adminAuth.updateUser(existingAuth.uid, { password: targetPassword, displayName });
          return existingAuth.uid;
        } catch (updateErr) {
          console.warn('AdminAuth update failed, trying REST:', updateErr);
        }
      }
      // Fallback to Firebase Auth REST API with API key
      try {
        const key = firebaseConfig.apiKey;
        const clean = targetEmail.trim().toLowerCase();
        const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: clean, password: targetPassword, displayName, returnSecureToken: true }),
        });
        const data: any = await res.json();
        if (data.localId) return data.localId;
        if (data.error?.message?.includes('EMAIL_EXISTS')) {
          const res2 = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: clean, password: targetPassword, returnSecureToken: true }),
          });
          const data2: any = await res2.json();
          if (data2.localId) return data2.localId;
        }
      } catch (restErr) {
        console.error('REST auth creation fallback error:', restErr);
      }
      throw authErr;
    }
  }

  // ================= 2. BATCH ACCOUNT CREATION (Backend Verified) =================
  app.post('/api/staff/batch-create', async (req: Request, res: Response) => {
    const caller = await verifyCallerAuth(req, true);
    if (!caller) {
      return res.status(401).json({ error: '未授权：请先登录' });
    }

    const isPrincipal = await isCallerPrincipal(caller.uid);
    if (!isPrincipal) {
      return res.status(403).json({ error: '禁止访问：只有校长可以批量开通员工账号' });
    }

    const { staffList } = req.body;
    if (!Array.isArray(staffList) || staffList.length === 0) {
      return res.status(400).json({ error: '请提供有效的员工列表' });
    }

    const results = [];

    for (const item of staffList) {
      const name = (item.name || '').trim();
      const email = (item.email || '').trim().toLowerCase();
      const password = item.password || '12345678';
      const hasClerkAccess = !!item.hasClerkAccess;

      if (!name || !email || !email.includes('@') || password.length < 6) {
        results.push({
          name,
          email,
          success: false,
          message: '资料不完整或密码不足6位',
        });
        continue;
      }

      let newlyCreatedUid: string | null = null;
      try {
        const category = (email.toLowerCase().startsWith('g-') || email.toLowerCase().startsWith('g.')) ? 'GURU' : 'AKP';
        const uidToUse = await createOrUpdateAuthUserResilient(email, password, name);

        // Save profile in /users/{uid} (No initialPassword in Firestore)
        await adminDb.doc(`users/${uidToUse}`).set({
          uid: uidToUse,
          name,
          email,
          category,
          role: hasClerkAccess ? 'CLERK' : category,
          hasClerkAccess,
          active: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        results.push({
          name,
          email,
          success: true,
          message: '已成功建立',
          password,
        });
      } catch (err: any) {
        // Rollback created Auth record if Firestore write failed
        if (newlyCreatedUid) {
          try {
            await adminAuth.deleteUser(newlyCreatedUid);
            console.log(`Rolled back newly created Auth user ${newlyCreatedUid} (${email}) due to Firestore write failure.`);
          } catch (delErr) {
            console.error('Failed to cleanup orphan Auth user:', delErr);
          }
        }

        let msg = err.message || '开通账号失败';
        if (err.code === 'auth/email-already-exists') {
          msg = '该邮箱已在系统中注册并处于有效状态';
        }
        results.push({
          name,
          email,
          success: false,
          message: msg,
        });
      }
    }

    return res.json({ results });
  });

  // ================= 3. SINGLE STAFF ACCOUNT CREATION =================
  app.post('/api/staff/create-single', async (req: Request, res: Response) => {
    const caller = await verifyCallerAuth(req);
    if (!caller) {
      return res.status(401).json({ error: '未授权：请先登录' });
    }

    const isPrincipal = await isCallerPrincipal(caller.uid);
    if (!isPrincipal) {
      return res.status(403).json({ error: '禁止访问：只有校长可以开通员工账号' });
    }

    const { name, email, password, hasClerkAccess } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (name || '').trim();

    if (!cleanName || !cleanEmail || !cleanEmail.includes('@') || !password || password.length < 6) {
      return res.status(400).json({ error: '请完整填写员工信息，密码最少 6 位。' });
    }

    let newlyCreatedUid: string | null = null;
    try {
      const category = (cleanEmail.startsWith('g-') || cleanEmail.startsWith('g.')) ? 'GURU' : 'AKP';
      const uidToUse = await createOrUpdateAuthUserResilient(cleanEmail, password, cleanName);

      await adminDb.doc(`users/${uidToUse}`).set({
        uid: uidToUse,
        name: cleanName,
        email: cleanEmail,
        category,
        role: hasClerkAccess ? 'CLERK' : category,
        hasClerkAccess: !!hasClerkAccess,
        active: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return res.json({ success: true, uid: uidToUse, password });
    } catch (err: any) {
      if (newlyCreatedUid) {
        try {
          await adminAuth.deleteUser(newlyCreatedUid);
          console.log(`Rolled back newly created Auth user ${newlyCreatedUid} (${cleanEmail}) due to Firestore write failure.`);
        } catch (delErr) {
          console.error('Failed to cleanup orphan Auth user:', delErr);
        }
      }

      let msg = err.message || '开通失败';
      if (err.code === 'auth/email-already-exists') {
        msg = '该邮箱已在系统中注册并处于有效状态';
      }
      return res.status(400).json({ error: msg });
    }
  });

  // ================= 4. ATTENDANCE PUNCH-IN (FIRESTORE TRANSACTION & ATOMICITY) =================
  app.post('/api/attendance/punch-in', async (req: Request, res: Response) => {
    const caller = await verifyCallerAuth(req);
    if (!caller) {
      return res.status(401).json({ error: '未授权：请先登录系统' });
    }

    const { latitude, longitude, accuracy } = req.body;
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || typeof accuracy !== 'number') {
      return res.status(400).json({ error: '未检测到有效 GPS 定位坐标，打卡未成功。' });
    }

    return withUserLock(caller.uid, async () => {
      try {
        const result = await adminDb.runTransaction(async (transaction) => {
          // 1. Verify user profile exists and active === true (missing active also rejected)
          const userRef = adminDb.doc(`users/${caller.uid}`);
          const userDoc = await transaction.get(userRef);
          if (!userDoc.exists) {
            throw new Error('UNAUTHORIZED: 您的账号未获校方授权建档，无法打卡。');
          }
          const userData = userDoc.data();
          if (!userData || userData.active !== true) {
            throw new Error('DEACTIVATED: 您的账号已被停用或缺少有效状态，禁止打卡。');
          }

          // 2. Read user attendance state record
          const stateRef = adminDb.doc(`user_attendance_state/${caller.uid}`);
          const stateDoc = await transaction.get(stateRef);
          const state = stateDoc.exists ? stateDoc.data()! : { currentStatus: 'OUT', activeSessionId: null };

          // 3. Check for unclosed session (Requirement 5: Delete auto-close, require real check out!)
          if (state.currentStatus === 'IN' || state.activeSessionId) {
            const sessionDate = state.activeSessionDate || '之前';
            throw new Error(
              `UNCLOSED_SESSION: 您上一组打卡（${sessionDate}）尚未 Check Out。请先点击 Check Out 记录真实离校时间与地点后，才能开始新的一组打卡。`
            );
          }

          // 4. Server-computed Malaysia Date (Asia/Kuala_Lumpur)
          const todayStr = getMalaysiaDateString();
          let slotCountToday = 0;
          if (state.lastDate === todayStr) {
            slotCountToday = state.todaySlotCount || 0;
          }

          // Max 2 slots per day rule
          if (slotCountToday >= 2) {
            throw new Error('MAX_SLOTS_REACHED: 今日已完成两组打卡（每日上限2组），禁止打第三组！');
          }

          const newSlot = slotCountToday + 1; // 1 or 2
          const recordId = `${caller.uid}_${todayStr}_${newSlot}`;

          // 5. Ensure record does not already exist
          const recordRef = adminDb.doc(`attendance/${recordId}`);
          const recordSnap = await transaction.get(recordRef);
          if (recordSnap.exists) {
            throw new Error('RECORD_EXISTS: 该打卡轮次记录已存在，禁止覆盖。');
          }

          const geoRef = adminDb.doc(`attendance_geo/${recordId}`);

          // 6. Atomic Write: Attendance + Isolated Geo + User State
          transaction.set(recordRef, {
            id: recordId,
            userId: caller.uid,
            userName: userData.name || '',
            userEmail: userData.email || caller.email || '',
            category: userData.category || 'GURU',
            date: todayStr,
            slot: newSlot,
            status: 'IN',
            checkInTime: FieldValue.serverTimestamp(),
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });

          transaction.set(geoRef, {
            recordId,
            userId: caller.uid,
            date: todayStr,
            slot: newSlot,
            checkInLat: latitude,
            checkInLng: longitude,
            checkInAccuracy: Math.round(accuracy),
            updatedAt: FieldValue.serverTimestamp(),
          });

          transaction.set(
            stateRef,
            {
              activeSessionId: recordId,
              activeSessionDate: todayStr,
              activeSessionSlot: newSlot,
              lastDate: todayStr,
              todaySlotCount: newSlot,
              currentStatus: 'IN',
            },
            { merge: true }
          );

          return { slot: newSlot, date: todayStr };
        });

        return res.json({
          success: true,
          slot: result.slot,
          date: result.date,
          message: `第 ${result.slot} 轮 Check In 成功！`,
        });
      } catch (err: any) {
        console.error('Punch In Transaction Error:', err);
        const msg = err.message.replace(/^[A-Z_]+:\s*/, '');
        return res.status(400).json({ error: msg || '打卡事务执行失败，请重试。' });
      }
    });
  });

  // ================= 5. ATTENDANCE PUNCH-OUT (FIRESTORE TRANSACTION & ATOMICITY) =================
  app.post('/api/attendance/punch-out', async (req: Request, res: Response) => {
    const caller = await verifyCallerAuth(req);
    if (!caller) {
      return res.status(401).json({ error: '未授权：请先登录系统' });
    }

    const { latitude, longitude, accuracy, earlyCheckOutReason } = req.body;
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || typeof accuracy !== 'number') {
      return res.status(400).json({ error: '未检测到有效 GPS 定位，Check Out 未成功。' });
    }

    return withUserLock(caller.uid, async () => {
      try {
        const result = await adminDb.runTransaction(async (transaction) => {
          // 1. Verify user profile exists and active === true (missing active also rejected)
          const userRef = adminDb.doc(`users/${caller.uid}`);
          const userDoc = await transaction.get(userRef);
          const userData = userDoc.data();
          if (!userDoc.exists || !userData || userData.active !== true) {
            throw new Error('DEACTIVATED: 账号已被停用或无打卡权限（要求 active === true）。');
          }

          // 2. Read user attendance state
          const stateRef = adminDb.doc(`user_attendance_state/${caller.uid}`);
          const stateDoc = await transaction.get(stateRef);
          const state = stateDoc.exists ? stateDoc.data()! : { currentStatus: 'OUT', activeSessionId: null };

          if (state.currentStatus !== 'IN' || !state.activeSessionId) {
            throw new Error('NO_ACTIVE_SESSION: 当前没有进行中的打卡记录，无法 Check Out。');
          }

          const recordRef = adminDb.doc(`attendance/${state.activeSessionId}`);
          const recordSnap = await transaction.get(recordRef);
          if (!recordSnap.exists || recordSnap.data()?.status !== 'IN') {
            throw new Error('SESSION_NOT_FOUND: 打卡记录不存在或状态异常。');
          }

          const geoRef = adminDb.doc(`attendance_geo/${state.activeSessionId}`);

          // 3. Atomic Update: Record completed with REAL server time + Real coordinates (even across days)
          const updatePayload: Record<string, any> = {
            status: 'COMPLETED',
            checkOutTime: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          };
          if (earlyCheckOutReason && typeof earlyCheckOutReason === 'string' && earlyCheckOutReason.trim()) {
            updatePayload.earlyCheckOutReason = earlyCheckOutReason.trim();
            updatePayload.isEarlyCheckOut = true;
          }

          transaction.update(recordRef, updatePayload);

          transaction.set(
            geoRef,
            {
              checkOutLat: latitude,
              checkOutLng: longitude,
              checkOutAccuracy: Math.round(accuracy),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          transaction.set(
            stateRef,
            {
              activeSessionId: null,
              activeSessionDate: null,
              currentStatus: 'OUT',
            },
            { merge: true }
          );

          return { slot: state.activeSessionSlot || 1, date: state.activeSessionDate };
        });

        return res.json({
          success: true,
          slot: result.slot,
          message: `Check Out 成功！已真实记录离校时间与地点。`,
        });
      } catch (err: any) {
        console.error('Punch Out Transaction Error:', err);
        const msg = err.message.replace(/^[A-Z_]+:\s*/, '');
        return res.status(400).json({ error: msg || 'Check Out 事务执行失败，请重试。' });
      }
    });
  });

  // ================= 6. PRINCIPAL STAFF MANAGEMENT & SETTINGS (Backend Verified) =================
  app.post('/api/staff/update-status', async (req: Request, res: Response) => {
    const caller = await verifyCallerAuth(req);
    if (!caller) return res.status(401).json({ error: '未授权：请先登录' });
    const isPrincipal = await isCallerPrincipal(caller.uid);
    if (!isPrincipal) return res.status(403).json({ error: '禁止访问：只有校长可以修改员工档案状态' });

    const { targetUid, active, hasClerkAccess } = req.body;
    if (!targetUid) return res.status(400).json({ error: '缺少 targetUid' });

    try {
      const updates: any = { updatedAt: FieldValue.serverTimestamp() };
      if (typeof active === 'boolean') updates.active = active;
      if (typeof hasClerkAccess === 'boolean') {
        updates.hasClerkAccess = hasClerkAccess;
        const userDoc = await adminDb.doc(`users/${targetUid}`).get();
        const cat = userDoc.data()?.category || 'GURU';
        updates.role = hasClerkAccess ? 'CLERK' : cat;
      }
      await adminDb.doc(`users/${targetUid}`).update(updates);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || '更新失败' });
    }
  });

  app.post('/api/staff/delete', async (req: Request, res: Response) => {
    const caller = await verifyCallerAuth(req);
    if (!caller) return res.status(401).json({ error: '未授权：请先登录' });
    const isPrincipal = await isCallerPrincipal(caller.uid);
    if (!isPrincipal) return res.status(403).json({ error: '禁止访问：只有校长可以删除员工档案' });

    const { targetUid } = req.body;
    if (!targetUid) return res.status(400).json({ error: '缺少 targetUid' });
    if (targetUid === caller.uid) return res.status(400).json({ error: '不能删除校长自身档案' });

    try {
      await adminDb.doc(`users/${targetUid}`).delete();
      try {
        await adminAuth.deleteUser(targetUid);
      } catch (authErr) {
        console.warn('Auth user delete cleanup notice:', authErr);
      }
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || '删除失败' });
    }
  });

  app.post('/api/school-settings/update', async (req: Request, res: Response) => {
    const caller = await verifyCallerAuth(req);
    if (!caller) return res.status(401).json({ error: '未授权：请先登录' });
    const isPrincipal = await isCallerPrincipal(caller.uid);
    if (!isPrincipal) return res.status(403).json({ error: '禁止访问：只有校长可以更改学校设定' });

    const { schoolName, schoolCode } = req.body;
    if (!schoolName || !schoolName.trim()) {
      return res.status(400).json({ error: '学校全称不能为空' });
    }

    try {
      await adminDb.doc('school_settings/general').set(
        {
          schoolName: schoolName.trim(),
          schoolCode: (schoolCode || '').trim().toUpperCase(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || '保存设定失败' });
    }
  });

  // ================= 6. USER ATTENDANCE STATE STATUS CHECK =================
  app.get('/api/attendance/user-state', async (req: Request, res: Response) => {
    const caller = await verifyCallerAuth(req);
    if (!caller) {
      return res.status(401).json({ error: '未授权：请先登录' });
    }

    try {
      const userDoc = await adminDb.doc(`users/${caller.uid}`).get();
      if (!userDoc.exists || userDoc.data()?.active !== true) {
        return res.status(403).json({ error: '账号未获授权或已被停用' });
      }

      const stateDoc = await adminDb.doc(`user_attendance_state/${caller.uid}`).get();
      const state = stateDoc.exists ? stateDoc.data() : { currentStatus: 'OUT', activeSessionId: null };
      return res.json({ state });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Mount Vite middleware for SPA in development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  }

  // App server port: respects Cloud Run PORT environment variable, defaults to 3000
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sistem Kehadiran Sekolah (Admin SDK) server running on port ${PORT}`);
  });
}

startServer();
