import {
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDocs,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { UserProfile } from '../types';
import { deepSanitizeFirestore } from './sanitizeFirestore';

export function normalizeStaffEmail(email?: string | null): string {
  return String(email || '').trim().toLowerCase();
}

export function normalizeStaffIc(ic?: string | null): string {
  const digits = String(ic || '').replace(/[^0-9]/g, '');
  return digits.length >= 6 ? digits : '';
}

const PHANTOM_PLACEHOLDER_NAMES = new Set(['', 'STAF', 'STAFF', 'UNKNOWN', '-', 'N/A']);

/**
 * Returns true when a Firestore record is an empty/corrupt phantom document
 * (e.g., partial role write missing name, email, IC, phone, and file no).
 */
export function isPhantomStaffRecord(rec?: Record<string, any> | null): boolean {
  if (!rec || typeof rec !== 'object') return true;
  const rawName = String(rec.name || rec.displayName || rec.nama || '')
    .trim()
    .toUpperCase();
  const email = normalizeStaffEmail(rec.email);
  const ic = normalizeStaffIc(rec.ic);
  const phone = String(rec.phone || rec.noTel || '').trim();
  const staffFileNo = String(rec.staffFileNo || rec.noFail || '').trim();
  if (!email && !ic && !phone && !staffFileNo && PHANTOM_PLACEHOLDER_NAMES.has(rawName)) {
    return true;
  }
  return false;
}

export function isPreRegisteredDocId(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return true;
  const trimmed = id.trim();
  if (!trimmed) return true;
  return (
    trimmed.startsWith('staff_') ||
    trimmed.startsWith('user_') ||
    /^P\d{5,}/i.test(trimmed) ||
    /^t\d+$/i.test(trimmed)
  );
}

export function isRealAuthUid(id?: string | null): boolean {
  return Boolean(id && typeof id === 'string' && !isPreRegisteredDocId(id));
}

function isGenericPosition(pos?: string | null): boolean {
  const p = String(pos || '').trim().toUpperCase();
  return !p || p === 'GURU' || p === 'GURU AKADEMIK BIASA' || p === 'STAF' || p === 'STAFF';
}

function pickBestPosition(positions: Array<string | undefined | null>): string {
  const clean = positions.map((p) => String(p || '').trim()).filter(Boolean);
  if (clean.length === 0) return '';
  const specific = clean.find((p) => !isGenericPosition(p));
  return specific || clean[0];
}

function inferSubRoleFromPosition(position?: string | null, category?: string | null): string | undefined {
  const pos = String(position || '').toUpperCase();
  if (pos.includes('GURU BESAR') || pos === 'GB') return 'GB';
  if (pos.includes('PENTADBIRAN') || pos.includes('PKP') || pos.includes('PK 1') || pos.includes('PK1')) return 'PKP';
  if (pos.includes('HAL EHWAL MURID') || pos.includes('PKHEM') || pos.includes('PK HEM')) return 'PKHEM';
  if (pos.includes('KOKURIKULUM') || pos.includes('PKKK') || pos.includes('PK KK')) return 'PKKK';
  if (pos.includes('PEMBANTU PENGURUSAN MURID') || pos.includes('PPM')) return 'PPM';
  if (pos.includes('PEMBANTU OPERASI') || pos === 'PO') return 'PO';
  if (pos.includes('PEMBANTU TADBIR') || pos === 'PT' || pos.includes('KERANI')) return 'PT';
  if (String(category || '').toUpperCase() === 'AKP') return 'PO';
  return undefined;
}

export function scoreStaffRecord(rec: Record<string, any>): number {
  let score = 0;
  if (isRealAuthUid(rec._docId)) score += 1000;
  if (isRealAuthUid(rec.uid)) score += 500;
  if (rec.isVerified === true || rec.isPreRegistered === false) score += 200;
  if (rec.position && !isGenericPosition(rec.position)) score += 80;
  else if (rec.position) score += 20;
  if (rec.subRole || rec.primaryRoleCode || rec.leadershipRole || rec.akpRole) score += 40;
  if (normalizeStaffIc(rec.ic)) score += 15;
  if (rec.phone) score += 5;
  if (rec.grade) score += 5;
  if (rec.staffFileNo) score += 5;
  if (rec.personnelId) score += 5;
  return score;
}

export interface MergedStaffResult<T = UserProfile> {
  merged: T;
  canonicalDocId: string;
  duplicateDocIds: string[];
}

export function mergeStaffGroup<T extends Record<string, any>>(records: T[]): MergedStaffResult<T> {
  const sorted = [...records].sort((a, b) => scoreStaffRecord(b) - scoreStaffRecord(a));
  const primary = sorted[0];

  // Canonical Firestore doc ID: prefer existing real Auth UID docId, else primary's _docId/uid/id
  const authDocRecord = sorted.find((r) => isRealAuthUid(r._docId));
  const canonicalDocId = String(
    authDocRecord?._docId || primary._docId || primary.uid || primary.id || ''
  );

  // Real Firebase Auth UID if any record in the group has logged in
  const authUidRecord =
    sorted.find((r) => isRealAuthUid(r.uid)) ||
    sorted.find((r) => isRealAuthUid(r._docId));
  const resolvedAuthUid = authUidRecord
    ? String(isRealAuthUid(authUidRecord.uid) ? authUidRecord.uid : authUidRecord._docId)
    : String(primary.uid || canonicalDocId);

  const isVerified = sorted.some(
    (r) =>
      r.isVerified === true ||
      r.isPreRegistered === false ||
      isRealAuthUid(r.uid) ||
      isRealAuthUid(r._docId)
  );

  // Pick richest non-empty metadata across all records in the group
  const bestName =
    sorted
      .map((r) => String(r.name || r.displayName || r.nama || '').trim())
      .filter((n) => n && !n.includes('@') && !PHANTOM_PLACEHOLDER_NAMES.has(n.toUpperCase()))
      .sort((a, b) => b.length - a.length)[0] ||
    String(primary.name || primary.email?.split('@')[0] || '').trim();

  const bestEmail =
    sorted.map((r) => normalizeStaffEmail(r.email)).find(Boolean) || '';
  const bestIc =
    sorted.map((r) => normalizeStaffIc(r.ic)).find(Boolean) ||
    sorted.map((r) => String(r.ic || '').trim()).find(Boolean) ||
    '';
  const bestPhone =
    sorted.map((r) => String(r.phone || r.noTel || '').trim()).find(Boolean) || '';
  const bestGrade =
    sorted.map((r) => String(r.grade || r.gred || '').trim()).find(Boolean) || '';
  const bestStaffFileNo =
    sorted.map((r) => String(r.staffFileNo || r.noFail || '').trim()).find(Boolean) || '';
  const bestPersonnelId =
    sorted.map((r) => String(r.personnelId || r.id || '').trim()).find((v) => v && !v.startsWith('staff_')) ||
    sorted.map((r) => String(r.personnelId || '').trim()).find(Boolean) ||
    '';
  const bestPosition = pickBestPosition(sorted.map((r) => r.position || r.jawatan));

  // Preserve administrative/principal roles & sub-roles
  const isPrincipal = sorted.some(
    (r) =>
      String(r.role || '').toUpperCase() === 'PRINCIPAL' ||
      String(r.category || '').toUpperCase() === 'PRINCIPAL' ||
      String(r.subRole || '').toUpperCase() === 'GB' ||
      String(r.leadershipRole || '').toUpperCase().includes('GURU_BESAR') ||
      String(r.position || '').toUpperCase().includes('GURU BESAR')
  );

  const hasExplicitAkp = sorted.some(
    (r) =>
      String(r.category || '').toUpperCase() === 'AKP' ||
      String(r.role || '').toUpperCase() === 'AKP' ||
      ['PT', 'PO', 'PPM'].includes(String(r.subRole || r.primaryRoleCode || '').toUpperCase())
  );

  const inferredSub =
    sorted.map((r) => r.subRole || r.primaryRoleCode).find(Boolean) ||
    inferSubRoleFromPosition(bestPosition, hasExplicitAkp ? 'AKP' : 'GURU');

  const resolvedCategory = isPrincipal
    ? 'PRINCIPAL'
    : hasExplicitAkp || ['PT', 'PO', 'PPM'].includes(String(inferredSub || '').toUpperCase())
    ? 'AKP'
    : 'GURU';

  const hasClerkAccess = sorted.some((r) => r.hasClerkAccess === true);
  const explicitAdminRole = sorted.find((r) =>
    ['ADMIN', 'SYSTEM_ADMIN'].includes(String(r.role || '').toUpperCase())
  )?.role;

  const resolvedRole = isPrincipal
    ? 'PRINCIPAL'
    : explicitAdminRole
    ? explicitAdminRole
    : hasClerkAccess
    ? 'CLERK'
    : resolvedCategory;

  const activeSource = authUidRecord || primary;
  const resolvedActive = activeSource.active !== false;

  const mergedBase: Record<string, any> = {
    ...primary,
    uid: resolvedAuthUid,
    name: bestName.toUpperCase(),
    email: bestEmail,
    category: resolvedCategory,
    role: resolvedRole,
    active: resolvedActive,
    hasClerkAccess,
    isVerified,
    isPreRegistered: !isVerified,
  };

  if (bestIc) mergedBase.ic = bestIc;
  if (bestPhone) mergedBase.phone = bestPhone;
  if (bestGrade) mergedBase.grade = bestGrade;
  if (bestPosition) mergedBase.position = bestPosition;
  if (bestStaffFileNo) mergedBase.staffFileNo = bestStaffFileNo;
  if (bestPersonnelId) mergedBase.personnelId = bestPersonnelId;
  if (inferredSub) {
    mergedBase.subRole = inferredSub;
    mergedBase.primaryRoleCode = inferredSub;
  }
  const leadershipRole = sorted.map((r) => r.leadershipRole).find(Boolean);
  if (leadershipRole) mergedBase.leadershipRole = leadershipRole;
  const akpRole = sorted.map((r) => r.akpRole).find(Boolean);
  if (akpRole) mergedBase.akpRole = akpRole;
  if (canonicalDocId) mergedBase._docId = canonicalDocId;

  const allDocIds = records
    .map((r) => String(r._docId || '').trim())
    .filter((id) => id && id !== canonicalDocId);
  const duplicateDocIds = Array.from(new Set(allDocIds));

  return {
    merged: mergedBase as T,
    canonicalDocId,
    duplicateDocIds,
  };
}

/**
 * Groups and deduplicates staff records by normalized email or 12-digit IC/KP
 * using union-find connected components so records sharing either email OR IC merge cleanly.
 */
export function groupAndDeduplicateStaffRecords<T extends Record<string, any>>(
  records: T[]
): Array<MergedStaffResult<T>> {
  if (!records || records.length === 0) return [];

  const validRecords = records.filter((rec) => !isPhantomStaffRecord(rec));
  if (validRecords.length === 0) return [];

  const n = validRecords.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const emailOwner = new Map<string, number>();
  const icOwner = new Map<string, number>();
  const uidOwner = new Map<string, number>();

  validRecords.forEach((rec, idx) => {
    const email = normalizeStaffEmail(rec.email);
    const ic = normalizeStaffIc(rec.ic);
    const docId = String(rec._docId || '').trim();
    const authUid = isRealAuthUid(rec.uid) ? String(rec.uid).trim() : '';

    if (email) {
      if (emailOwner.has(email)) union(emailOwner.get(email)!, idx);
      else emailOwner.set(email, idx);
    }
    if (ic) {
      if (icOwner.has(ic)) union(icOwner.get(ic)!, idx);
      else icOwner.set(ic, idx);
    }
    if (authUid) {
      if (uidOwner.has(authUid)) union(uidOwner.get(authUid)!, idx);
      else uidOwner.set(authUid, idx);
    }
    if (docId) {
      if (uidOwner.has(docId)) union(uidOwner.get(docId)!, idx);
      else uidOwner.set(docId, idx);
    }
  });

  const groups = new Map<number, T[]>();
  validRecords.forEach((rec, idx) => {
    const root = find(idx);
    const arr = groups.get(root) || [];
    arr.push(rec);
    groups.set(root, arr);
  });

  const results: Array<MergedStaffResult<T>> = [];
  groups.forEach((group) => {
    results.push(mergeStaffGroup(group));
  });
  return results;
}

export function deduplicateStaffRecords<T extends Record<string, any>>(records: T[]): T[] {
  return groupAndDeduplicateStaffRecords(records).map((g) => g.merged);
}

/**
 * Merges duplicate Firestore `users` documents (e.g., `staff_<uuid>` + `<auth_uid>`)
 * into a single canonical document per teacher and deletes redundant duplicates.
 */
export async function deduplicateUsersSnapshotInFirestore(
  db: Firestore,
  rawDocs: Array<Record<string, any>>,
  allowDelete: boolean = true
): Promise<{
  mergedCount: number;
  deletedCount: number;
  dedupedUsers: UserProfile[];
}> {
  const groups = groupAndDeduplicateStaffRecords(rawDocs);
  let mergedCount = 0;
  let deletedCount = 0;

  if (allowDelete) {
    const phantomDocs = rawDocs.filter((r) => isPhantomStaffRecord(r));
    for (const pDoc of phantomDocs) {
      const phantomId = String(pDoc._docId || pDoc.uid || '').trim();
      if (!phantomId) continue;
      try {
        await deleteDoc(doc(db, 'users', phantomId));
        deletedCount++;
      } catch (delErr) {
        console.warn(`Unable to delete phantom user doc ${phantomId}:`, delErr);
      }
    }
  }

  for (const group of groups) {
    if (group.duplicateDocIds.length === 0) continue;
    if (!group.canonicalDocId) continue;

    try {
      const payloadToSave: Record<string, any> = { ...group.merged, updatedAt: serverTimestamp() };
      delete payloadToSave._docId;

      await setDoc(
        doc(db, 'users', group.canonicalDocId),
        deepSanitizeFirestore(payloadToSave),
        { merge: true }
      );
      mergedCount++;

      if (allowDelete) {
        for (const dupId of group.duplicateDocIds) {
          if (!dupId || dupId === group.canonicalDocId) continue;
          try {
            await deleteDoc(doc(db, 'users', dupId));
            deletedCount++;
          } catch (delErr) {
            console.warn(`Unable to delete duplicate user doc ${dupId}:`, delErr);
          }
        }
      }
    } catch (mergeErr) {
      console.warn(`Unable to merge duplicate user group ${group.canonicalDocId}:`, mergeErr);
    }
  }

  return {
    mergedCount,
    deletedCount,
    dedupedUsers: groups.map((g) => g.merged as unknown as UserProfile),
  };
}

export async function deduplicateAndCleanUsersInFirestore(
  db: Firestore,
  allowDelete: boolean = true
): Promise<{
  mergedCount: number;
  deletedCount: number;
  dedupedUsers: UserProfile[];
}> {
  const snap = await getDocs(collection(db, 'users'));
  const rawDocs = snap.docs.map((d) => ({ ...d.data(), _docId: d.id }));
  return deduplicateUsersSnapshotInFirestore(db, rawDocs, allowDelete);
}
