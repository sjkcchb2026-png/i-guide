/**
 * iSEPADU AI — Authentication & Privilege Hardening Types (Sub-Phase 1A-2)
 * SJK(C) CHUNG HUA BALINGIAN (YCC3404)
 * 
 * White-Label Ready:
 * schoolId is string (authoritative from school_settings/general.schoolCode)
 * Non-sensitive fallback DEFAULT_SCHOOL_CODE = "YCC3404"
 */

export const DEFAULT_SCHOOL_CODE = 'YCC3404';
export const DEFAULT_SCHOOL_NAME = 'SJK(C) CHUNG HUA BALINGIAN';

/**
 * Coarse-grained Firebase Custom Claims (< 150 bytes)
 * Verified server-side. No unbounded arrays or granular governance assignments.
 */
export interface iSEPADUCustomClaims {
  personnelId: string;    // Matched canonical personnel doc ID or verified external operator ID
  schoolId: string;       // Dynamic string from school_settings/general.schoolCode
  isPrincipal: boolean;   // Institutional executive authority
  isSystemAdmin: boolean; // Technical / governance maintenance authority
  claimsVersion: number;  // Monotonic version counter for invalidation & refresh
}

/**
 * Staged Recoverable Principal Transfer State Machine
 */
export type PrincipalTransferStatus =
  | 'IDLE'
  | 'TRANSFER_INITIATED'
  | 'NEW_PRINCIPAL_AUTHORIZED'
  | 'OLD_PRINCIPAL_REVOKED'
  | 'GOVERNANCE_UPDATED'
  | 'TRANSFER_COMPLETED'
  | 'TRANSFER_INCOMPLETE';

export interface PrincipalTransferRecord {
  transferId: string;
  fromUid: string;
  fromPersonnelId: string;
  toUid: string;
  toPersonnelId: string;
  status: PrincipalTransferStatus;
  initiatedAt: any;
  updatedAt: any;
  completedAt?: any;
  interruptedAt?: any;
  errorReason?: string;
  initiatedBy: string;
}

/**
 * Workspaces accessible through the Authorized Workspace Switcher
 */
export type AuthorizedWorkspaceType =
  | 'dsx'
  | 'admin'
  | 'principal'
  | 'teacher_subject'
  | 'teacher_class'
  | 'panitia'
  | 'secretary'
  | 'student'
  | 'visitor';

export interface AuthorizedWorkspaceOption {
  id: AuthorizedWorkspaceType;
  label: string;
  category: 'PENTADBIR' | 'GURU' | 'MURID' | 'PELAWAT';
  description: string;
  authorized: boolean;
  reason?: string;
}

/**
 * Canonical Personnel reference in governance layer
 */
export interface PersonnelIdentity {
  id: string; // Sanitized IC or internal ID
  name: string;
  email?: string;
  role?: string;
  category?: 'GURU' | 'AKP' | 'PRINCIPAL';
  active?: boolean;
}
