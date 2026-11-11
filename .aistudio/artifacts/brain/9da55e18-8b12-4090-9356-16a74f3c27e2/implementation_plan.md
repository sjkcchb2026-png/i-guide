# iSEPADU AI — Phase 1A Implementation Design & Change Plan
## Production Safety Hardening & Baseline Identity Configuration

This plan defines the precise, non-destructive implementation roadmap for **Phase 1A: Production Safety Hardening** of the iSEPADU AI platform for **SJK (C) CHUNG HUA BALINGIAN** (School Code: `YCC3404`). It addresses the critical vulnerabilities and architectural requirements identified in the Phase 0 Architecture Audit without altering historical records, without disrupting the operational Staff Attendance system, and without prematurely merging Firebase environments.

---

## User Review & Confirmed Architectural Decisions

> [!IMPORTANT]
> The following architectural directives have been established and override any legacy assumptions:
>
> 1. **Master Data Principle ("Masuk Sekali, Guna Berkali-kali" / "Enter Once, Reuse Everywhere")**: Core identity data shall be entered or imported only once and reused across all authorized workspaces (Student Master $\to$ Enrollment $\to$ PBD $\to$ UASA $\to$ Kokurikulum $\to$ HEM $\to$ Portals; Personnel Master $\to$ Auth $\to$ Teaching Allocation $\to$ Portfolios $\to$ Attendance $\to$ LDP $\to$ iSEF).
> 2. **Master Identity via Stable Internal IDs**: System records must use permanent internal identifiers (`student_master_id` and `personnel_id`). National IC, MyKid, Birth Certificate, and DELIMa email are treated as protected PII and matching evidence, not primary document keys.
> 3. **Attendance Integration Strategy (Option D — Progressive Hybrid Integration)**: Preserved as the *Transitional Architecture*. Staff Attendance remains operational on its independent Firebase project (`ai-studio-9da55e18-8b12-4090-9356-16a74f3c27e2`) during initial phases. Physical database consolidation remains optional and deferred.
> 4. **Verified Clarifications**:
>    - **Admin Bootstrap & Authority (1A-2)**: Server-verified custom claims / server authority managed via secure administrative tooling (no client-side hardcoded passwords).
>    - **School Profile Storage (1A-4)**: Configurable Firestore `school_settings/profile` document with robust in-code default fallback to SJK (C) Chung Hua Balingian (`YCC3404`) for white-label readiness.
>    - **Sub-Phase Cadence**: Strict sequential execution with independent verification gates after each sub-phase: `1A-1` $\to$ `1A-2` $\to$ `1A-3` $\to$ `1A-4`.
> 5. **Deferred Legacy Items**:
>    - `koko_memberships` doc ID collision risk (`${student_id}`) is registered as a future correction under the *Student Master / Academic Year Integration Phase*.
>    - `AssessmentSecretaryView.tsx` automatic ID cascade replacement is designated as **LEGACY / HIGH-RISK IMPORT PATH** and will not be touched in Phase 1A.

---

## Technical Architecture & Safety Topology

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        iSEPADU AI: PHASE 1A SAFETY TOPOLOGY                             │
└────────────────────────────────────────────────────────────────────────────────────────┘

  [ Client Browser: iSEPADU Core ]
         │
         ├─── (1A-1) AUTO-PURGE ELIMINATION
         │      │
         │      └──► DELETED: purgeUnusedSampleStudents()
         │             (Protects Malaysian student records & cascade collections)
         │
         ├─── (1A-2) AUTHENTICATION HARDENING
         │      │
         │      ├──► REMOVED: In-code passwords ('<REDACTED_HARDCODED_CREDENTIAL>', 'PELAWAT...')
         │      └──► REPLACED: Role resolution via Server/Firestore Token Verification
         │             (Primary Admin: sjkcchb2026@gmail.com verified bootstrap)
         │
         ├─── (1A-4) SCHOOL IDENTITY CONFIGURATION
         │      │
         │      └──► DYNAMIC LOAD: /school_settings/profile
         │             ├── Name: SJK (C) CHUNG HUA BALINGIAN
         │             ├── Code: YCC3404 | Category: SKM_B | Type: SJKC
         │             └── Fallback: In-code immutable config object
         │
         ▼
  [ Cloud Firestore: ai-studio-2b763e92-60bd-4b23-9079-2cba85c09a65 ]
         ▲
         │
         └─── (1A-3) FIRESTORE SECURITY RULES HARDENING
                ├── Default Deny catch-all on all documents
                ├── Role-based Access Control (RBAC) via Server Authority
                ├── Protected PII isolation (users, students, guardian records)
                └── Write-Path Matrix enforcement (PBD, UASA, Koko preserved)
```

---

## Recommended Execution Order

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  STEP 1: Phase 1A-1 — Auto-Purge Safety (Immediate Data Loss Prevention)     │
├──────────────────────────────────────────────────────────────────────────────┤
│  STEP 2: Phase 1A-2 — Authentication & Privilege Hardening (Credential Fix)  │
├──────────────────────────────────────────────────────────────────────────────┤
│  STEP 3: Phase 1A-3 — Firestore Security Rule Hardening (ABAC / RBAC Rules)  │
├──────────────────────────────────────────────────────────────────────────────┤
│  STEP 4: Phase 1A-4 — School Identity Configuration (YCC3404 Configuration)  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Rationale**:
1. `1A-1` must execute first because `purgeUnusedSampleStudents` runs automatically upon *any* user authentication. If an administrator logs in, real student records could be destroyed immediately.
2. `1A-2` must execute second to eliminate client-side credential injection before deploying hardened security rules, ensuring only legitimate authenticated identities can interact with the database.
3. `1A-3` must execute third, once authenticated user identities and administrative bootstrap tokens are deterministic, locking down the Firestore security perimeter.
4. `1A-4` completes Phase 1A by binding all UI components, headers, and exports to SJK (C) Chung Hua Balingian metadata.

---

## 1A-1: Auto-Purge Safety

### Exact Files Affected
- `src/App.tsx` (in iSEPADU Core)

### Exact Functions Affected
- `purgeUnusedSampleStudents` (defined inside `useEffect` hook, lines 699–779)
- Enclosing `useEffect([user])` hook

### Exact Collections Affected
- `students`
- `uasa_results`
- `pbd_results`
- `koko_memberships`

### Current Behaviour
Whenever any user logs in (`[user]` dependency), an asynchronous cleanup task executes in the background. It downloads all documents in `students`, parses every student's name and ID, and checks for substrings:
- IDs: `s001`, `s002`, `s26201`, `demo-st`, `demo_st`, or any ID containing `test`.
- Names: containing `muthu`, `siti nurhaliza`, `ahmad faiz`, `tan ah kau`, `trial`, `demo`, or `percubaan`.

If a match is found, it immediately deletes the `students` document, then executes a cascading delete across `uasa_results`, `pbd_results`, and `koko_memberships` for all records matching that `student_id`. It also deletes any `koko_memberships` whose member name contains those common Malaysian names.

### Proposed Behaviour
The automatic background execution of `purgeUnusedSampleStudents` will be completely removed from `src/App.tsx`.
- The production application will **never** automatically delete student records based on name heuristics or ID prefixes.
- Data deletion is restricted to explicit, audited administrative actions within Master Data Management (`MasterDataDashboard.tsx`), requiring multi-factor confirmation and transaction logging.
- Any manual purge tool must require super-admin authentication, explicit confirmation modals, and produce an `audit_trail` entry before soft-deleting.

### Dependencies
- None. Removing this effect eliminates an unprompted background side-effect.

### Failure Risks
- If active developers relied on this effect to clear mock data during local development, test students might persist in the dev Firestore database. (Mitigated by providing an explicit, manually triggered admin-only cleanup script).

### Backup Point
- Create a timestamped backup JSON snapshot of `students`, `uasa_results`, `pbd_results`, and `koko_memberships` collections prior to deploying code.

### Regression Tests
1. **Login Stability**: Authenticate as a teacher; verify no unhandled promise rejection or error in browser console.
2. **Student Preservation**: Insert a student record with `student_id: "S001"` and `name: "Ahmad Faiz Bin Abdullah"`; refresh the app and log in; verify the student record and associated PBD/UASA scores remain intact.
3. **Network Quietness**: Verify no unprompted background `DELETE` or `getDocs` requests to Firestore on auth state transition.

### Security Tests
- Confirm that unprivileged users cannot trigger batch deletions across academic collections through any API or UI trigger.

### Rollback Strategy
- Revert the `src/App.tsx` file modification to restore the previous commit state. No schema changes are involved.

### Acceptance Criteria
- `purgeUnusedSampleStudents` is completely excised from `src/App.tsx`.
- Real Malaysian student records matching common names or standard student ID formats are never deleted upon login.
- Zero console warnings or background fetch storms on user authentication.

---

## 1A-2: Authentication & Privilege Hardening

### Exact Files Affected
- `src/App.tsx`
- `src/types.ts` (or `src/types/index.ts`)
- `server.ts` (backend administrative verification endpoint)

### Exact Functions Affected
- `handleAdminAuth` (lines 890–906 in `src/App.tsx`)
- `handleVisitorAuth` (lines 840–868 in `src/App.tsx`)
- `handleCreateProfile` (lines 870–888 in `src/App.tsx`)
- Role selection UI modal render block (lines 1265–1310)

### Exact Collections Affected
- `users`
- `school_settings` (for administrative authorization registry)

### Current Behaviour
- Client-side code compares user input to hardcoded plaintext strings:
  - Admin escalation: `if (adminPassInput === '<REDACTED_HARDCODED_CREDENTIAL>')`
  - Visitor login: `if (visitorPassInput === '<REDACTED_HARDCODED_CREDENTIAL>' || ...)`
- Any user who inspects the frontend bundle or enters the string can immediately write `{ role: 'admin' }` to their own document in `/users/{uid}` via client Firestore SDK.
- Any user in `handleCreateProfile` can arbitrarily select and persist roles (`secretary`, `head_department`, `class_teacher`, `subject_teacher`).

### Proposed Behaviour
1. **Eradicate Client Passwords**: Remove all hardcoded credential strings and client-side password inputs (`adminPassInput`, `visitorPassInput`).
2. **Server-Verified Authority Architecture**:
   - Administrative authority is granted only through server-verified custom claims or verified server-side identity matching against a protected administrator registry in Firestore (`school_settings/admin_registry`).
   - The verified initial administrator email is bootstrapped to `sjkcchb2026@gmail.com`.
3. **Non-Escalatable Self-Registration**:
   - First-time authenticated users (via Google OAuth) default to a base role (`subject_teacher` or `pending_verification`).
   - Users cannot assign themselves `admin`, `principal`, or `secretary` roles via client SDK.
   - Administrative and leadership role elevations must be approved by the Guru Besar / Administrator via the internal Personnel Governance console or executed through a server endpoint that validates session tokens against the Admin Registry.
4. **Visitor Access Hardening**:
   - Remove unauthenticated visitor password bypass. Public or visitor access, if needed, will utilize a restricted read-only guest scope without write permissions to any collection.

### Dependencies
- Firebase Authentication with Google Provider.
- Backend token verification endpoint (`/api/auth/verify-role`).

### Failure Risks
- Authorized school leaders could be locked out if their Google account email is not in the bootstrap administrator registry.
- *Mitigation*: Hardcode the bootstrap authority to `sjkcchb2026@gmail.com` in server configuration with a verified fallback mechanism.

### Backup Point
- Export existing `users` collection to JSON before altering role assignment logic.

### Regression Tests
1. **Admin Login**: Sign in with `sjkcchb2026@gmail.com`; verify admin dashboard and secretary views load seamlessly without asking for password inputs.
2. **Teacher Login**: Sign in with an ordinary teacher Google account; verify proper assignment of teacher workspace without administrative access.
3. **No Password Prompt**: Verify no UI prompt or modal asks for `<REDACTED_HARDCODED_CREDENTIAL>` or visitor passwords.

### Security Tests
1. **Client Injection Test**: Attempt calling `setDoc(doc(db, 'users', auth.currentUser.uid), { role: 'admin' })` from the browser console as a non-admin user; verify operation is rejected by Firestore security rules.
2. **Credential Inspection Test**: Build production bundle (`npm run build`); grep for redacted strings; verify zero instances of plaintext credentials in the output.

### Rollback Strategy
- If an admin lockout occurs, revert `src/App.tsx` and restore the user's role document directly in Firestore console or via Firebase CLI.

### Acceptance Criteria
- Zero plaintext passwords in source code.
- Administrator privilege cannot be acquired via client-side input manipulation.
- Principal / Admin access is strictly bound to verified school credentials (`sjkcchb2026@gmail.com`).

---

## 1A-3: Firestore Security Rule Hardening

### Exact Files Affected
- `firestore.rules`
- `firebase-blueprint.json`

### Exact Functions Affected
- Security rule helper functions: `isSignedIn()`, `isValidId()`, `isAdmin()`, `isTeacher()`, `isOwner()`
- Collection match blocks across all 16 collections

### Exact Collections Affected
- `users`, `students`, `student_master`, `personnel`, `teachers`, `subjects`, `classes`, `academic_years`
- `pbd_results`, `uasa_results`, `interventions`
- `koko_groups`, `koko_memberships`, `koko_attendance`, `koko_activities`, `koko_settings`
- `import_sessions`, `rollback_records`, `audit_trail`, `school_settings`, `bulletins`, `principal_warnings`

### Current Behaviour
Every collection in `firestore.rules` uses blanket permissions:
```javascript
match /students/{studentId} {
  allow read, write: if isSignedIn() && isValidId(studentId);
}
match /users/{userId} {
  allow read, write: if isSignedIn() && isValidId(userId);
}
```
Any signed-in user can read, overwrite, or delete any record in the entire database.

### Proposed Behaviour
Implement strict Attribute-Based Access Control (ABAC) following the Zero-Trust security pillars:
1. **Default Deny**: Global catch-all denying all operations.
2. **Role Verification via Master Identity**: Use helper functions checking the user's verified role from `/users/$(request.auth.uid)`.
3. **Protected PII**: Direct client reads of sensitive student/guardian welfare fields are restricted to authorized leadership and class teachers.
4. **Operation Separation**: Differentiate `create`, `update`, `delete`, `get`, and `list` operations with `affectedKeys().hasOnly()` guards.

### Write-Path Matrix

| Collection | Read Scope | Create Role | Update Role | Delete Role | Constraints & Invariants |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `users` | Authenticated (Self or Admin) | Auth User (Self, base role only) | Self (non-role fields) / Admin | Admin Only | Users cannot alter `role` field on self |
| `school_settings` | Authenticated (Public read) | Admin Only | Admin Only | None | Immutable school core identifier |
| `personnel` | Authenticated Staff | Admin Only | Admin / Self (contact only) | Admin Only | Master staff directory |
| `student_master` | Staff Only (Restricted PII) | Admin / Secretary | Admin / Secretary | Admin Only | Permanent identity; requires audit log |
| `students` | Staff Only | Admin / Secretary | Staff (assigned class) / Admin | Admin Only | Sessional enrollment record |
| `academic_years` | Authenticated | Admin Only | Admin Only | None | Immutable once closed |
| `classes` | Authenticated | Admin Only | Admin Only | Admin Only | Standardized class registry |
| `subjects` | Authenticated | Admin Only | Admin Only | Admin Only | Curriculum subject registry |
| `pbd_results` | Staff Only | Assigned Teacher / Admin | Assigned Teacher / Admin | Admin Only | Must match valid `student_id` & `academic_year` |
| `uasa_results` | Staff Only | Assigned Teacher / Admin | Assigned Teacher / Admin | Admin Only | Must match valid `student_id` & `academic_year` |
| `interventions` | Staff Only | Subject Teacher / Admin | Assigned Teacher / Admin | Admin Only | Polyphasic PDCA record |
| `koko_groups` | Authenticated Staff | Admin / Koko PK | Assigned Advisor / Admin | Admin Only | Co-curricular units |
| `koko_memberships`| Authenticated Staff | Advisor / Admin | Advisor / Admin | Admin Only | Co-curricular enrollment |
| `koko_activities` | Authenticated Staff | Advisor / Admin | Advisor / Admin | Admin Only | Activity meeting logs |
| `koko_attendance` | Authenticated Staff | Advisor / Admin | Advisor / Admin | Admin Only | Meeting attendance |
| `import_sessions` | Admin / Secretary | Admin / Secretary | Admin / Secretary | None | Immutable audit trail |
| `rollback_records`| Admin / Secretary | Admin / Secretary | None | None | Append-only rollback snapshots |
| `audit_trail` | Admin Only | System / Server | None | None | Append-only compliance log |

### Dependencies
- `firebase-blueprint.json` synced with all entity schemas.
- Local Firebase Emulator / Rules unit tests.

### Failure Risks
- Overly tight rules could cause `PERMISSION_DENIED` errors on legitimate teacher workflows (e.g., submitting PBD grades or marking co-curricular attendance).
- *Mitigation*: Run comprehensive emulator tests across all existing views (`SubjectTeacherView`, `ClassTeacherView`, `CoCurricularTeacherView`, `AssessmentSecretaryView`) prior to deploying rules.

### Backup Point
- Existing `firestore.rules` preserved in version control and as `firestore.rules.bak`.

### Regression Tests
1. **PBD Submission**: Log in as Subject Teacher; record Tahap Penguasaan (TP) for a student; verify save succeeds.
2. **UASA Entry**: Log in as Subject Teacher; record UASA marks; verify score calculation and document save succeed.
3. **Koko Attendance**: Log in as Co-Curricular Advisor; log attendance for an activity; verify save succeeds.
4. **Secretary Import View**: Verify Secretary can view academic rosters without permission errors.

### Security Tests
1. **Privilege Escalation**: Attempt to update `users/{uid}` with `role: "admin"` as a teacher; verify `PERMISSION_DENIED`.
2. **Student Deletion**: Attempt to call `deleteDoc` on `students/{id}` as a subject teacher; verify `PERMISSION_DENIED`.
3. **Unauthenticated Access**: Query `students` or `pbd_results` with `auth == null`; verify immediate rejection.

### Rollback Strategy
- Immediate redeployment of previous permissive rules via `DeployRules` if critical teaching operations are obstructed during school hours.

### Acceptance Criteria
- Default deny in effect for unauthenticated and unauthorized requests.
- All valid teaching, assessment, and administrative write paths function without errors.
- Rules pass automated ESLint security rule checks without warnings.

---

## 1A-4: School Identity Configuration

### Exact Files Affected
- `src/config/schoolConfig.ts` (new master configuration loader)
- `src/App.tsx` (header, title, and profile defaults)
- `src/components/Navbar.tsx` (school branding and badge)
- `src/components/StudentView.tsx` (school portal title)
- `src/components/CoCurricularTeacherView.tsx` (school header)
- `index.html` (title and metadata)

### Exact Functions / Constants Affected
- Hardcoded string instances: `"SJK(C) Ek Hua"`, `"SJK(C) Ek Hua Mukah"`, `"guest@ekhua.edu.my"`
- New hook / service: `useSchoolProfile()`

### Exact Collections Affected
- `school_settings` (document ID: `profile`)

### Current Behaviour
- The school name is hardcoded in multiple frontend files as `SJK(C) Ek Hua` or `SJK(C) Ek Hua Mukah`.
- Default fallback email domains use `@ekhua.edu.my`.
- Any institutional change requires modifying source code and recompiling the application.

### Proposed Behaviour
1. **Central Master School Profile**:
   Create a single source of truth for institutional configuration in `school_settings/profile`:
   ```json
   {
     "school_code": "YCC3404",
     "official_name": "SJK (C) CHUNG HUA BALINGIAN",
     "short_name": "SJKC CHUNG HUA BALINGIAN",
     "school_type": "SJKC",
     "school_category": "SKM_B",
     "state": "SARAWAK",
     "district": "MUKAH",
     "has_preschool": true,
     "has_ppki": false,
     "default_academic_year": "2026",
     "primary_admin_email": "sjkcchb2026@gmail.com"
   }
   ```
2. **Robust In-Code Fallback**:
   If Firestore is unreachable or the document does not yet exist, `schoolConfig.ts` provides an immutable in-code fallback to SJK (C) Chung Hua Balingian (`YCC3404`).
3. **Dynamic White-Label Readiness**:
   All UI headers, reports, PDF exports, and metadata consume the profile from `useSchoolProfile()`. Future deployment to another school will only require updating the `school_settings/profile` document.
4. **Email & Domain Sanitization**:
   Replace legacy `@ekhua.edu.my` fallbacks with standard `@moe-dl.edu.my` / `@gmail.com` conventions.

### Dependencies
- None. Fully backward-compatible.

### Failure Risks
- Flash of unstyled/unloaded content (FOUC) or title flicker if Firestore read is slow.
- *Mitigation*: The in-code fallback defaults immediately to SJK (C) Chung Hua Balingian on initial render before network hydration.

### Backup Point
- Git commit checkpoint before string and config refactoring.

### Regression Tests
1. **Header & Navigation**: Verify application title displays `SJK (C) CHUNG HUA BALINGIAN (YCC3404)` on desktop and mobile.
2. **Portal Views**: Check Student View, Co-Curricular View, and Assessment Views; verify no occurrences of `Ek Hua`.
3. **Report Generation**: Trigger an assessment or attendance report preview; verify school letterhead displays official institutional details.

### Security Tests
- Verify that non-admin users cannot alter the `school_settings/profile` document.

### Rollback Strategy
- Revert configuration loader commit to restore previous constant references.

### Acceptance Criteria
- Zero occurrences of `Ek Hua` across the entire application interface.
- Institutional metadata dynamically driven by `school_settings/profile` with robust fallback.
- Application fully white-label ready for future multi-school deployment.

---

## Safety Verification Checklist (Before Phase 1A Code Execution)

- [ ] Current database snapshot exported and secured.
- [ ] Operational Staff Attendance system confirmed completely isolated and untouched.
- [ ] Zero changes made to `AssessmentSecretaryView.tsx` import logic (marked as LEGACY / HIGH-RISK).
- [ ] Zero changes made to `koko_memberships` document ID format (deferred to Academic Year Phase).
- [ ] No student records imported during Phase 1A.
- [ ] Implementation approved by user.
