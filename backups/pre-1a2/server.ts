import express from 'express';
import type { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import type { UserRecord } from 'firebase-admin/auth';

// Read Firebase config from firebase-applet-config.json
const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Explicitly target user Firebase project for Google Cloud SDK and quota attribution
process.env.GOOGLE_CLOUD_PROJECT = firebaseConfig.projectId;
process.env.GOOGLE_CLOUD_QUOTA_PROJECT = firebaseConfig.projectId;

// Initialize Firebase Admin SDK using Application Default Credentials (ADC)
// In Google Cloud Run, ADC is automatically provided by the Cloud Run runtime service account.
// Required IAM roles for Cloud Run service account:
// 1. "Cloud Datastore User" (roles/datastore.user) - for Firestore database access
// 2. "Firebase Authentication Admin" (roles/firebaseauth.admin) - for Auth user management
if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

// Connect to the specific database ID provisioned for this project
const adminDb = getFirestore(firebaseConfig.firestoreDatabaseId);
const adminAuth = getAuth();

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

// Helper: Verify caller Firebase Auth ID Token using Firebase Admin SDK
async function verifyCallerAuth(req: Request): Promise<{ uid: string; email?: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const idToken = authHeader.split('Bearer ')[1].trim();
  if (!idToken) return null;

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      email: decoded.email,
    };
  } catch (err) {
    console.error('Admin Auth verifyIdToken error:', err);
    return null;
  }
}

// Helper: Check if caller is registered Principal AND user profile exists with active === true
async function isCallerPrincipal(uid: string): Promise<boolean> {
  try {
    const [adminDoc, userDoc] = await Promise.all([
      adminDb.doc(`admins/${uid}`).get(),
      adminDb.doc(`users/${uid}`).get(),
    ]);
    if (!adminDoc.exists || !userDoc.exists) {
      return false;
    }
    const userData = userDoc.data();
    if (!userData || userData.active !== true) {
      console.warn(`Principal account ${uid} is deactivated or invalid.`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Error verifying principal role and active status:', err);
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

  // Public endpoint: Fetch current school basic configuration
  app.get('/api/school-info', async (_req: Request, res: Response) => {
    try {
      const generalDoc = await adminDb.doc('school_settings/general').get();
      if (!generalDoc.exists) {
        return res.json({ initialized: false });
      }
      const data = generalDoc.data();
      return res.json({
        initialized: true,
        schoolName: data?.schoolName || 'SJK (C) CHUNG HUA BALINGIAN',
        schoolCode: data?.schoolCode || 'YCC3403',
        principalEmail: data?.principalEmail || '',
      });
    } catch (err: any) {
      console.warn('Error fetching school-info:', err.message);
      return res.json({ initialized: false });
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

  // ================= 2. BATCH ACCOUNT CREATION (Backend Verified) =================
  app.post('/api/staff/batch-create', async (req: Request, res: Response) => {
    const caller = await verifyCallerAuth(req);
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
      const password = item.password || 'Pass1234';
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
        const category = email.endsWith('@moe-dl.edu.my') ? 'GURU' : 'AKP';

        // Check if existing orphan in Auth without Firestore profile
        let uidToUse: string;
        try {
          const newRecord = await adminAuth.createUser({
            email,
            password,
            displayName: name,
          });
          newlyCreatedUid = newRecord.uid;
          uidToUse = newRecord.uid;
        } catch (authErr: any) {
          if (authErr.code === 'auth/email-already-exists') {
            const existingAuth = await adminAuth.getUserByEmail(email);
            const userDoc = await adminDb.doc(`users/${existingAuth.uid}`).get();
            if (!userDoc.exists) {
              // Orphan Auth user without Firestore profile: recover and update!
              uidToUse = existingAuth.uid;
              await adminAuth.updateUser(existingAuth.uid, { password, displayName: name });
            } else {
              throw authErr;
            }
          } else {
            throw authErr;
          }
        }

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
      const category = cleanEmail.endsWith('@moe-dl.edu.my') ? 'GURU' : 'AKP';

      let uidToUse: string;
      try {
        const userRecord = await adminAuth.createUser({
          email: cleanEmail,
          password,
          displayName: cleanName,
        });
        newlyCreatedUid = userRecord.uid;
        uidToUse = userRecord.uid;
      } catch (authErr: any) {
        if (authErr.code === 'auth/email-already-exists') {
          const existingAuth = await adminAuth.getUserByEmail(cleanEmail);
          const userDoc = await adminDb.doc(`users/${existingAuth.uid}`).get();
          if (!userDoc.exists) {
            // Orphan Auth user without Firestore profile: recover and update!
            uidToUse = existingAuth.uid;
            await adminAuth.updateUser(existingAuth.uid, { password, displayName: cleanName });
          } else {
            throw authErr;
          }
        } else {
          throw authErr;
        }
      }

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

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sistem Kehadiran Sekolah (Admin SDK) server running on port ${PORT}`);
  });
}

startServer();
