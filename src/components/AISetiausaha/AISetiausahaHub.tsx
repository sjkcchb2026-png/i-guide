import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import {
  Award,
  Bot,
  CheckCircle2,
  ClipboardList,
  FileBarChart2,
  FolderKanban,
  Layers,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { auth, db } from '../../firebase';
import { PersonnelProfile, SchoolSettings, UserProfile } from '../../types';
import { AcademicYearConfig, GovernanceAssignment } from '../../types/isepadu';
import {
  MYSG_DEFAULT_CATALOG,
  MySGJawatankuasaItem,
  MySGPillar,
  PILLAR_DISPLAY_META,
} from '../../utils/mysgJawatankuasaCatalog';
import {
  autoResolveKokoSKPM,
  getKokoSKPMOption,
  resolveSKPMForMySGItem,
  SKPMKokoStandardCode,
} from '../../utils/skpmCatalog';
import { KokoActivity, KokoMeetingReport } from '../../types/kokurikulum';
import { deepSanitizeFirestore } from '../../utils/sanitizeFirestore';
import {
  belongsToSchool,
  DEFAULT_SCHOOL_NAME,
  DEFAULT_SCHOOL_SLOGAN,
  normalizeActiveSchoolCode,
  scopedDocId,
} from '../../utils/schoolTenant';
import {
  AnySetiausahaDocument,
  MemoMesyuaratDocument,
  MinitMesyuaratDocument,
  OPRPosterDocument,
  SetiausahaModuleTab,
  SuratLantikanDocument,
} from './types';
import { ModuleOPRPoster } from './ModuleOPRPoster';
import { ModuleMemoMesyuarat } from './ModuleMemoMesyuarat';
import { ModuleMinitMesyuarat } from './ModuleMinitMesyuarat';
import { ModuleSuratLantikan } from './ModuleSuratLantikan';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: Array<{
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }>;
  };
}

function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): string {
  const errMsg = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  return errMsg;
}

interface AISetiausahaHubProps {
  currentUser: UserProfile;
  schoolSettings?: SchoolSettings | null;
}

const PILLARS: MySGPillar[] = ['PENTADBIRAN', 'KURIKULUM', 'HEM', 'KOKURIKULUM'];

export const AISetiausahaHub: React.FC<AISetiausahaHubProps> = ({
  currentUser,
  schoolSettings,
}) => {
  const activeSchoolCode = useMemo(
    () => normalizeActiveSchoolCode(currentUser.schoolCode || schoolSettings?.schoolCode),
    [currentUser.schoolCode, schoolSettings?.schoolCode]
  );

  const schoolName = schoolSettings?.schoolName || DEFAULT_SCHOOL_NAME;
  const schoolLogo = schoolSettings?.schoolLogo || schoolSettings?.logoUrl;
  const schoolSlogan = schoolSettings?.slogan || DEFAULT_SCHOOL_SLOGAN;

  const [authReadyUid, setAuthReadyUid] = useState<string | null>(
    () => auth.currentUser?.uid || null
  );
  const [activeTab, setActiveTab] = useState<SetiausahaModuleTab>('OPR');
  const [academicYear, setAcademicYear] = useState<string>(
    currentUser.academic_year || '2026'
  );
  const [personnel, setPersonnel] = useState<PersonnelProfile[]>([]);
  const [mysgItems, setMysgItems] = useState<MySGJawatankuasaItem[]>(() =>
    MYSG_DEFAULT_CATALOG.map((item) => ({ ...item }))
  );
  const [documents, setDocuments] = useState<AnySetiausahaDocument[]>([]);

  const [selectedPillar, setSelectedPillar] = useState<MySGPillar>('KURIKULUM');
  const [selectedKodMySG, setSelectedKodMySG] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthReadyUid(u?.uid || null);
    });
    return () => unsub();
  }, []);

  const loadWorkspaceData = useCallback(async () => {
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);

    try {
      // 1. Active Academic Year
      let resolvedYear = currentUser.academic_year || '2026';
      try {
        const aySnap = await getDocs(collection(db, 'academic_years'));
        const years = aySnap.docs
          .filter((d) => belongsToSchool(d.data() as Record<string, unknown>, activeSchoolCode))
          .map((d) => ({ id: d.id, ...d.data() } as AcademicYearConfig));
        const activeCfg = years.find((y) => y.status === 'active') || years[0];
        if (activeCfg?.year) {
          resolvedYear = activeCfg.year;
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'academic_years');
      }
      setAcademicYear(resolvedYear);

      // 2. Personnel Master Data (API with Bearer token, fallback to client Firestore)
      let loadedPersonnel: PersonnelProfile[] = [];
      try {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch(
          `/api/core/personnel?schoolCode=${encodeURIComponent(activeSchoolCode)}`,
          {
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
          }
        );
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.personnel)) {
            loadedPersonnel = json.personnel;
          }
        }
      } catch {
        // Fallback to direct Firestore query below
      }

      if (loadedPersonnel.length === 0) {
        try {
          const pSnap = await getDocs(collection(db, 'personnel'));
          loadedPersonnel = pSnap.docs
            .filter((d) => belongsToSchool(d.data() as Record<string, unknown>, activeSchoolCode))
            .map((d) => ({ id: d.id, ...d.data() } as PersonnelProfile));
        } catch (err) {
          handleFirestoreError(err, OperationType.LIST, 'personnel');
        }
      }
      setPersonnel(loadedPersonnel);

      // 3. MySG Jawatankuasa Catalog (school_governance + governance_assignments fallback)
      const aySlug = (resolvedYear || '2026').replace(/\//g, '-');
      const govDocId = scopedDocId(activeSchoolCode, `mysg_jawatankuasa_${aySlug}`);
      let mergedMysg = MYSG_DEFAULT_CATALOG.map((item) => ({ ...item }));

      try {
        const govSnap = await getDocs(collection(db, 'school_governance'));
        const targetDoc =
          govSnap.docs.find((d) => d.id === govDocId) ||
          govSnap.docs.find(
            (d) =>
              d.id.startsWith('mysg_jawatankuasa_') &&
              belongsToSchool(d.data() as Record<string, unknown>, activeSchoolCode)
          );
        const savedList = targetDoc?.data()?.items;
        if (Array.isArray(savedList) && savedList.length > 0) {
          const byKod = new Map<string, MySGJawatankuasaItem>();
          savedList.forEach((s: MySGJawatankuasaItem) => {
            if (s?.kodMySG) byKod.set(s.kodMySG, s);
          });
          mergedMysg = MYSG_DEFAULT_CATALOG.map((def) => {
            const saved = byKod.get(def.kodMySG);
            return saved
              ? {
                  ...def,
                  tahapBeban: saved.tahapBeban || def.tahapBeban,
                  mataBeban: saved.mataBeban || def.mataBeban,
                  assignedTeacherId: saved.assignedTeacherId || '',
                  assignedTeacherName: saved.assignedTeacherName || '',
                  customDueDate: saved.customDueDate || '',
                }
              : { ...def };
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'school_governance');
      }

      // Enrich unassigned items from governance_assignments if present
      try {
        const gaSnap = await getDocs(collection(db, 'governance_assignments'));
        const assignments = gaSnap.docs
          .filter((d) => belongsToSchool(d.data() as Record<string, unknown>, activeSchoolCode))
          .map((d) => ({ id: d.id, ...d.data() } as GovernanceAssignment))
          .filter(
            (a) =>
              (!a.academicYear || a.academicYear === resolvedYear) &&
              a.status !== 'INACTIVE'
          );

        if (assignments.length > 0) {
          const teacherById = new Map<string, PersonnelProfile>();
          loadedPersonnel.forEach((p) => {
            teacherById.set(p.id, p);
            if ((p as any).uid) teacherById.set(String((p as any).uid), p);
          });

          mergedMysg = mergedMysg.map((item) => {
            if (item.assignedTeacherName) return item;
            const roleUpper = item.jawatanRasmi.toUpperCase();
            const unitUpper = item.jawatankuasaInduk.toUpperCase();
            const match = assignments.find((a) => {
              const entity = String(a.entityName || '').toUpperCase();
              return (
                entity &&
                (entity === roleUpper ||
                  roleUpper.includes(entity) ||
                  unitUpper.includes(entity) ||
                  entity.includes(unitUpper))
              );
            });
            if (!match) return item;
            const matchedTeacher = teacherById.get(match.personnelId);
            return {
              ...item,
              assignedTeacherId: matchedTeacher?.id || match.personnelId,
              assignedTeacherName: matchedTeacher?.name || match.personnelName || '',
            };
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'governance_assignments');
      }

      setMysgItems(mergedMysg);

      // 4. AI Setiausaha Documents + Legacy/Live Kokurikulum OPRs & Meeting Reports
      let loadedDocs: AnySetiausahaDocument[] = [];
      try {
        const docsSnap = await getDocs(collection(db, 'ai_setiausaha_documents'));
        loadedDocs = docsSnap.docs
          .filter((d) => belongsToSchool(d.data() as Record<string, unknown>, activeSchoolCode))
          .map((d) => ({ id: d.id, ...d.data() } as AnySetiausahaDocument));
      } catch (err) {
        const errMsg = handleFirestoreError(
          err,
          OperationType.LIST,
          'ai_setiausaha_documents'
        );
        setLoadError(`Ralat memuatkan arkib AI Setiausaha: ${errMsg}`);
      }

      // Deduplicate set of sourceActivityIds already mirrored inside ai_setiausaha_documents
      const mirroredSourceIds = new Set<string>();
      loadedDocs.forEach((docItem) => {
        if (docItem.docKind === 'OPR') {
          if (docItem.sourceActivityId) mirroredSourceIds.add(docItem.sourceActivityId);
          mirroredSourceIds.add(docItem.id);
        }
      });

      // Merge any koko_activities not yet mirrored into ai_setiausaha_documents
      try {
        const actSnap = await getDocs(collection(db, 'koko_activities'));
        actSnap.docs
          .filter((d) => belongsToSchool(d.data() as Record<string, unknown>, activeSchoolCode))
          .forEach((d) => {
            const act = { id: d.id, ...d.data() } as KokoActivity;
            const mirrorDocId = scopedDocId(activeSchoolCode, `koko_opr_${d.id}`);
            if (mirroredSourceIds.has(d.id) || mirroredSourceIds.has(mirrorDocId)) {
              return;
            }
            const skpmSpec = autoResolveKokoSKPM({
              category: act.category,
              jenis: act.jenis,
              level: act.level,
              programName: act.programName,
              unit: act.unit,
              manualCode: act.skpmStandardCode,
            });
            const hasStd5 = Boolean(skpmSpec.standard5Code || act.jenis === 'pertandingan');
            const synthesizedOpr: OPRPosterDocument = {
              id: `koko_legacy_${d.id}`,
              docKind: 'OPR',
              sourceModule: 'KOKURIKULUM_OPR',
              sourceActivityId: d.id,
              schoolCode: activeSchoolCode,
              academicYear: act.academicYear || resolvedYear,
              pillar: 'KOKURIKULUM',
              kodMySG: act.skpmStandardCode || skpmSpec.code,
              jawatankuasaInduk: act.unit || 'Pengurusan Kokurikulum & Koakademik',
              jawatanRasmi:
                act.category === 'KOAKADEMIK'
                  ? `Penyelaras ${act.unit || 'Koakademik'}`
                  : 'Jurulatih / Guru Penasihat Kokurikulum',
              skpmBucket: 'Std 3.2',
              secondarySkpmBucket: hasStd5 ? 'Std 5' : undefined,
              skpmCodeBadge: skpmSpec.standard5Code
                ? `${skpmSpec.code} + Std ${skpmSpec.standard5Code}`
                : skpmSpec.code,
              skpmStandard: act.skpmStandardTitle || skpmSpec.standardTitle,
              skpmAspek: act.skpmAspekTitle || skpmSpec.aspekTitle,
              skpmStandardKualiti: act.skpmKualitiStatement || skpmSpec.kualitiStatement,
              programTitle: (act.programName || 'AKTIVITI KOKURIKULUM').toUpperCase(),
              tarikh: act.date || '',
              masa: act.masa || '-',
              tempat: act.venue || '-',
              sasaran:
                act.participantCount === 0
                  ? 'Guru & Pengurusan Sekolah'
                  : `${act.participantCount || 0} Orang Murid (${act.level || 'Sekolah'})`,
              peringkat: act.level,
              pencapaian: act.jenis === 'pertandingan' ? String(act.pencapaian || '') : undefined,
              rawNotes: '',
              objektif: [act.objective1, act.objective2, act.objective3].filter(Boolean) as string[],
              pengisianAktiviti: [
                `Penganjur: ${act.organizer || '-'}${act.unit ? ` · Unit: ${act.unit}` : ''} (Peringkat: ${act.level || 'Sekolah'})`,
                ...(act.jenis === 'pertandingan' && act.pencapaian
                  ? [`Pencapaian Rasmi: ${act.pencapaian}`]
                  : []),
                ...(act.jurulatih?.length ? [`Jurulatih: ${act.jurulatih.join(', ')}`] : []),
                ...(act.guruPengiring?.length ? [`Guru Pengiring: ${act.guruPengiring.join(', ')}`] : []),
              ],
              impak: [act.impact || '', act.skpmStandard5Label || skpmSpec.standard5Label || ''].filter(Boolean),
              refleksiDanTindakanSusulan: [
                act.reflection ? `Refleksi: ${act.reflection}` : '',
                act.kekuatan ? `Kekuatan: ${act.kekuatan}` : '',
                act.kelemahanCadangan ? `Penambahbaikan: ${act.kelemahanCadangan}` : '',
                act.tindakanSusulan ? `Tindakan Susulan: ${act.tindakanSusulan}` : '',
              ].filter(Boolean),
              photos: (act.images || []).slice(0, 3),
              preparedByName: (act.jurulatih?.[0] || act.createdBy || '').toUpperCase(),
              preparedByTitle:
                act.category === 'KOAKADEMIK'
                  ? `Penyelaras ${act.unit || 'Koakademik'}`
                  : 'Jurulatih / Guru Penasihat',
              createdBy: act.createdBy || '',
              createdAt: act.createdAt || '',
              updatedAt: act.updatedAt || act.createdAt || '',
            };
            loadedDocs.push(synthesizedOpr);
          });
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'koko_activities');
      }

      // Merge any koko_meeting_reports not yet mirrored into ai_setiausaha_documents
      try {
        const repSnap = await getDocs(collection(db, 'koko_meeting_reports'));
        repSnap.docs
          .filter((d) => belongsToSchool(d.data() as Record<string, unknown>, activeSchoolCode))
          .forEach((d) => {
            const rep = { id: d.id, ...d.data() } as KokoMeetingReport;
            const mirrorDocId = scopedDocId(activeSchoolCode, `koko_meeting_${d.id}`);
            if (mirroredSourceIds.has(d.id) || mirroredSourceIds.has(mirrorDocId)) {
              return;
            }
            let code: SKPMKokoStandardCode = '3.2.2.1';
            if (Number(rep.meetingNumber) === 1) code = '3.2.1.1';
            else if (Number(rep.meetingNumber) === 11) code = '3.2.7.1';
            else if (rep.category === 'uniform') code = '3.2.3.1';
            else if (rep.category === 'sport') code = '3.2.4.1';
            const skpmSpec = getKokoSKPMOption(rep.skpmStandardCode || code);

            const synthesizedMeeting: OPRPosterDocument = {
              id: `koko_meeting_legacy_${d.id}`,
              docKind: 'OPR',
              sourceModule: 'KOKURIKULUM_MEETING',
              sourceActivityId: d.id,
              schoolCode: activeSchoolCode,
              academicYear: rep.academicYear || resolvedYear,
              pillar: 'KOKURIKULUM',
              kodMySG: skpmSpec.code,
              jawatankuasaInduk: rep.groupName || 'Unit Kokurikulum',
              jawatanRasmi: rep.jawatanPenyedia || 'Guru Penasihat',
              skpmBucket: 'Std 3.2',
              secondarySkpmBucket: 'Std 5',
              skpmCodeBadge: `${skpmSpec.code} (P${rep.meetingNumber})`,
              skpmStandard: rep.skpmStandardTitle || skpmSpec.standardTitle,
              skpmAspek: rep.skpmAspekTitle || skpmSpec.aspekTitle,
              skpmStandardKualiti: rep.skpmKualitiStatement || skpmSpec.kualitiStatement,
              programTitle: `${(rep.groupName || 'UNIT KOKURIKULUM').toUpperCase()} — ${(rep.tajukAktiviti || rep.meetingTitle || `PERJUMPAAN ${rep.meetingNumber}`).toUpperCase()}`,
              tarikh: rep.date || '',
              masa: `${rep.timeStart || '13:30'} – ${rep.timeEnd || '15:00'}`,
              tempat: rep.venue || 'Sekolah',
              sasaran: `Ahli Unit (${rep.attendanceStats?.present || 0}/${rep.attendanceStats?.total || 0} Hadir · ${rep.attendanceStats?.percentage || 0}%)`,
              rawNotes: '',
              objektif: Array.isArray(rep.objektif) ? rep.objektif.filter(Boolean) : [],
              pengisianAktiviti: [
                `Modul KPM: ${rep.kpmModule || 'Modul Kokurikulum KPM'}`,
                rep.ringkasanAktiviti || '',
                ...(rep.guruPenasihatHadir?.length
                  ? [`Guru Penasihat Hadir: ${rep.guruPenasihatHadir.join(', ')}`]
                  : []),
              ].filter(Boolean),
              impak: [
                rep.refleksiImpak || '',
                skpmSpec.standard5Label || '',
              ].filter(Boolean),
              refleksiDanTindakanSusulan: [
                rep.refleksiImpak ? `Refleksi: ${rep.refleksiImpak}` : '',
                rep.halLain ? `Hal Lain: ${rep.halLain}` : '',
              ].filter(Boolean),
              photos: (rep.images || []).slice(0, 3),
              preparedByName: (rep.disediakanOleh || '').toUpperCase(),
              preparedByTitle: rep.jawatanPenyedia || 'Guru Penasihat',
              createdBy: rep.disediakanOleh || '',
              createdAt: rep.createdAt || '',
              updatedAt: rep.updatedAt || rep.createdAt || '',
            };
            loadedDocs.push(synthesizedMeeting);
          });
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'koko_meeting_reports');
      }

      loadedDocs.sort((a, b) =>
        String(b.updatedAt || b.createdAt || '').localeCompare(
          String(a.updatedAt || a.createdAt || '')
        )
      );
      setDocuments(loadedDocs);
    } finally {
      setLoading(false);
    }
  }, [activeSchoolCode, currentUser.academic_year]);

  useEffect(() => {
    if (authReadyUid) {
      loadWorkspaceData();
    }
  }, [authReadyUid, loadWorkspaceData]);

  const itemsInSelectedPillar = useMemo(
    () => mysgItems.filter((item) => item.pillar === selectedPillar),
    [mysgItems, selectedPillar]
  );

  // Keep selectedKodMySG valid within selectedPillar
  useEffect(() => {
    if (itemsInSelectedPillar.length === 0) return;
    if (!itemsInSelectedPillar.some((i) => i.kodMySG === selectedKodMySG)) {
      setSelectedKodMySG(itemsInSelectedPillar[0].kodMySG);
    }
  }, [itemsInSelectedPillar, selectedKodMySG]);

  const selectedItem = useMemo<MySGJawatankuasaItem>(
    () =>
      itemsInSelectedPillar.find((i) => i.kodMySG === selectedKodMySG) ||
      itemsInSelectedPillar[0] ||
      mysgItems[0] ||
      MYSG_DEFAULT_CATALOG[0],
    [itemsInSelectedPillar, selectedKodMySG, mysgItems]
  );

  const selectedSkpmMeta = useMemo(
    () => resolveSKPMForMySGItem(selectedItem),
    [selectedItem]
  );

  const handleSaveDoc = useCallback(
    async <T extends AnySetiausahaDocument>(
      docInput: Partial<T> & { docKind: T['docKind'] }
    ): Promise<T | null> => {
      if (!auth.currentUser) {
        setLoadError('Sesi log masuk tidak aktif. Sila log masuk semula.');
        return null;
      }

      const existing = docInput.id
        ? documents.find((d) => d.id === docInput.id)
        : undefined;

      const docId = docInput.id
        ? scopedDocId(activeSchoolCode, docInput.id)
        : scopedDocId(
            activeSchoolCode,
            `setiausaha_${String(docInput.docKind).toLowerCase()}_${Date.now()}`
          );

      const nowIso = new Date().toISOString();
      const payload = deepSanitizeFirestore({
        ...docInput,
        id: docId,
        schoolCode: activeSchoolCode,
        academicYear: docInput.academicYear || academicYear,
        createdBy:
          docInput.createdBy ||
          existing?.createdBy ||
          currentUser.email ||
          currentUser.uid,
        createdAt: docInput.createdAt || existing?.createdAt || nowIso,
        updatedAt: nowIso,
      }) as T;

      const docPath = `ai_setiausaha_documents/${docId}`;
      try {
        await setDoc(doc(db, 'ai_setiausaha_documents', docId), payload, {
          merge: true,
        });
        setDocuments((prev) => {
          const filtered = prev.filter((d) => d.id !== docId);
          return [payload, ...filtered];
        });
        setLoadError(null);
        return payload;
      } catch (err) {
        const msg = handleFirestoreError(
          err,
          existing ? OperationType.UPDATE : OperationType.CREATE,
          docPath
        );
        setLoadError(`Gagal menyimpan dokumen ke pangkalan data: ${msg}`);
        return null;
      }
    },
    [
      academicYear,
      activeSchoolCode,
      currentUser.email,
      currentUser.uid,
      documents,
    ]
  );

  const handleDeleteDoc = useCallback(async (id: string): Promise<void> => {
    if (!auth.currentUser || !id) return;
    try {
      if (id.startsWith('koko_legacy_')) {
        const rawId = id.replace('koko_legacy_', '');
        await deleteDoc(doc(db, 'koko_activities', rawId));
      } else if (id.startsWith('koko_meeting_legacy_')) {
        const rawId = id.replace('koko_meeting_legacy_', '');
        await deleteDoc(doc(db, 'koko_meeting_reports', rawId));
      } else {
        await deleteDoc(doc(db, 'ai_setiausaha_documents', id));
      }
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      setLoadError(null);
    } catch (err) {
      const msg = handleFirestoreError(err, OperationType.DELETE, id);
      setLoadError(`Gagal memadam dokumen: ${msg}`);
    }
  }, []);

  const oprDocs = useMemo(
    () => documents.filter((d): d is OPRPosterDocument => d.docKind === 'OPR'),
    [documents]
  );
  const memoDocs = useMemo(
    () => documents.filter((d): d is MemoMesyuaratDocument => d.docKind === 'MEMO'),
    [documents]
  );
  const minitDocs = useMemo(
    () => documents.filter((d): d is MinitMesyuaratDocument => d.docKind === 'MINIT'),
    [documents]
  );
  const lantikanDocs = useMemo(
    () =>
      documents.filter((d): d is SuratLantikanDocument => d.docKind === 'LANTIKAN'),
    [documents]
  );

  const groupedBySubCommittee = useMemo(() => {
    const groups = new Map<string, MySGJawatankuasaItem[]>();
    itemsInSelectedPillar.forEach((item) => {
      const list = groups.get(item.jawatankuasaInduk) || [];
      list.push(item);
      groups.set(item.jawatankuasaInduk, list);
    });
    return Array.from(groups.entries());
  }, [itemsInSelectedPillar]);

  return (
    <div className="space-y-6">
      {/* HERO HEADER BANNER */}
      <div className="print:hidden relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-teal-950/70 to-slate-900 border border-teal-800/50 p-6 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-teal-500/20 text-teal-300 border border-teal-500/40">
                <Bot className="w-3.5 h-3.5" />
                AI Setiausaha Sekolah · KPM
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800/90 text-slate-300 border border-slate-700">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                {schoolName} ({activeSchoolCode})
              </span>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                Sesi {academicYear}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              Hab Dokumentasi Rasmi AI Setiausaha (SKPM &amp; MySG)
            </h2>
            <p className="text-xs text-slate-300 max-w-3xl">
              Penjana bersepadu Poster OPR SKPM Kualiti@Sekolah, Memo Panggilan Mesyuarat, Minit Mesyuarat PKPA Bil. 2/1991 + Borang Maklum Balas, dan Surat Lantikan Jawatankuasa MySG (79 portfolio rasmi).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="px-3.5 py-2 rounded-2xl bg-slate-950/80 border border-slate-800 text-right">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Arkib Dokumen Sekolah
              </div>
              <div className="text-sm font-black text-teal-300 font-mono">
                {documents.length} Rekod
              </div>
            </div>
            <button
              type="button"
              onClick={loadWorkspaceData}
              disabled={loading}
              className="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 border border-slate-700 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
              />
              <span>Muat Semula</span>
            </button>
          </div>
        </div>

        {/* 4 SUB-MODULE NAVIGATION TABS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mt-5 pt-4 border-t border-teal-800/40">
          <button
            type="button"
            onClick={() => setActiveTab('OPR')}
            className={`p-3 rounded-2xl border text-left transition cursor-pointer ${
              activeTab === 'OPR'
                ? 'bg-teal-600/25 border-teal-400 text-white shadow-lg'
                : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-black uppercase">
                <FileBarChart2 className="w-4 h-4 text-teal-300" />
                1. OPR Pintar SKPM
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-teal-300">
                {oprDocs.length}
              </span>
            </div>
            <p className="text-[10px] opacity-80 mt-1">
              Poster A4 One Page Report + 3 Foto Bulat &amp; Radar SKPM
            </p>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('MEMO')}
            className={`p-3 rounded-2xl border text-left transition cursor-pointer ${
              activeTab === 'MEMO'
                ? 'bg-blue-600/25 border-blue-400 text-white shadow-lg'
                : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-black uppercase">
                <Mail className="w-4 h-4 text-blue-300" />
                2. Memo Mesyuarat
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-blue-300">
                {memoDocs.length}
              </span>
            </div>
            <p className="text-[10px] opacity-80 mt-1">
              Surat Panggilan Rasmi KPM + Segerak Makluman &amp; WhatsApp
            </p>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('MINIT')}
            className={`p-3 rounded-2xl border text-left transition cursor-pointer ${
              activeTab === 'MINIT'
                ? 'bg-indigo-600/25 border-indigo-400 text-white shadow-lg'
                : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-black uppercase">
                <ClipboardList className="w-4 h-4 text-indigo-300" />
                3. Minit PKPA 2/1991
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-indigo-300">
                {minitDocs.length}
              </span>
            </div>
            <p className="text-[10px] opacity-80 mt-1">
              Import Memo + Formalisasi AI + Borang Maklum Balas
            </p>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('LANTIKAN')}
            className={`p-3 rounded-2xl border text-left transition cursor-pointer ${
              activeTab === 'LANTIKAN'
                ? 'bg-amber-600/25 border-amber-400 text-white shadow-lg'
                : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-black uppercase">
                <Award className="w-4 h-4 text-amber-300" />
                4. Surat Lantikan MySG
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-amber-300">
                {lantikanDocs.length}
              </span>
            </div>
            <p className="text-[10px] opacity-80 mt-1">
              Lantikan Bersepadu Guru + Keratan Akuan Penerimaan
            </p>
          </button>
        </div>
      </div>

      {loadError && (
        <div className="print:hidden p-4 rounded-2xl bg-rose-950/60 border border-rose-700 text-xs font-bold text-rose-200 flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={loadWorkspaceData}
            className="px-3 py-1 rounded-lg bg-rose-800 hover:bg-rose-700 text-white text-[11px] cursor-pointer"
          >
            Cuba Semula
          </button>
        </div>
      )}

      {/* SHARED 2-LEVEL DRILL-DOWN SELECTOR (TERAS MySG -> JAWATANKUASA / UNIT / PANITIA) */}
      <div className="print:hidden bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FolderKanban className="w-4 h-4 text-teal-400" />
            <h3 className="text-xs font-black uppercase tracking-wider text-white">
              Pemilih Berstruktur 2-Peringkat (Teras MySG → Jawatankuasa / Unit)
            </h3>
          </div>
          <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Pemetaan automatik ke {selectedSkpmMeta.standardCode} ({selectedSkpmMeta.aspekCode})
          </span>
        </div>

        {/* LEVEL 1: 4 PILLARS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {PILLARS.map((pillar) => {
            const meta = PILLAR_DISPLAY_META[pillar];
            const active = selectedPillar === pillar;
            const count = mysgItems.filter((i) => i.pillar === pillar).length;
            return (
              <button
                key={pillar}
                type="button"
                onClick={() => setSelectedPillar(pillar)}
                className={`px-3.5 py-2.5 rounded-2xl border text-left transition cursor-pointer ${
                  active
                    ? 'bg-teal-600 border-teal-400 text-white shadow-md'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase">{meta.label}</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      active ? 'bg-teal-900/60 text-white' : 'bg-slate-900 text-slate-400'
                    }`}
                  >
                    {count}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* LEVEL 2: SPECIFIC COMMITTEE / PANITIA / PORTFOLIO + LIVE METADATA SUMMARY */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          <div className="lg:col-span-6 space-y-1">
            <label className="text-[11px] font-bold uppercase text-slate-400 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-teal-400" />
              Peringkat 2: Pilih Jawatankuasa / Panitia / Unit ({itemsInSelectedPillar.length} Jawatan)
            </label>
            <select
              value={selectedItem.kodMySG}
              onChange={(e) => setSelectedKodMySG(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 focus:border-teal-500 rounded-2xl px-3.5 py-2.5 text-xs font-bold text-white outline-none"
            >
              {groupedBySubCommittee.map(([committeeName, items]) => (
                <optgroup key={committeeName} label={committeeName}>
                  {items.map((item) => (
                    <option key={item.kodMySG} value={item.kodMySG}>
                      [{item.kodMySG}] {item.jawatanRasmi}
                      {item.assignedTeacherName ? ` — ${item.assignedTeacherName}` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="lg:col-span-6 bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                <span className="px-2 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800/60 font-mono">
                  {selectedItem.kodMySG}
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/60">
                  {selectedSkpmMeta.standardCode} · {selectedSkpmMeta.aspekCode}
                </span>
              </div>
              <div className="text-xs font-black text-white truncate">
                {selectedItem.jawatankuasaInduk} — {selectedItem.jawatanRasmi}
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                Penyelaras MySG:{' '}
                <strong className="text-emerald-300">
                  {selectedItem.assignedTeacherName || 'Belum diagihkan di Master Data'}
                </strong>
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>SSOT Disegerak</span>
            </div>
          </div>
        </div>
      </div>

      {/* ACTIVE SUB-MODULE WORKSPACE */}
      {activeTab === 'OPR' && (
        <ModuleOPRPoster
          schoolCode={activeSchoolCode}
          schoolName={schoolName}
          schoolLogo={schoolLogo}
          academicYear={academicYear}
          currentUserName={currentUser.name}
          selectedItem={selectedItem}
          savedDocs={oprDocs}
          onSaveDoc={(d) => handleSaveDoc<OPRPosterDocument>(d)}
          onDeleteDoc={handleDeleteDoc}
        />
      )}

      {activeTab === 'MEMO' && (
        <ModuleMemoMesyuarat
          schoolCode={activeSchoolCode}
          schoolName={schoolName}
          schoolLogo={schoolLogo}
          schoolSlogan={schoolSlogan}
          academicYear={academicYear}
          currentUserName={currentUser.name}
          currentUserUid={currentUser.uid}
          personnel={personnel}
          selectedItem={selectedItem}
          savedDocs={memoDocs}
          onSaveDoc={(d) => handleSaveDoc<MemoMesyuaratDocument>(d)}
          onDeleteDoc={handleDeleteDoc}
        />
      )}

      {activeTab === 'MINIT' && (
        <ModuleMinitMesyuarat
          schoolCode={activeSchoolCode}
          schoolName={schoolName}
          schoolLogo={schoolLogo}
          academicYear={academicYear}
          currentUserName={currentUser.name}
          personnel={personnel}
          selectedItem={selectedItem}
          savedMemos={memoDocs}
          savedDocs={minitDocs}
          onSaveDoc={(d) => handleSaveDoc<MinitMesyuaratDocument>(d)}
          onDeleteDoc={handleDeleteDoc}
        />
      )}

      {activeTab === 'LANTIKAN' && (
        <ModuleSuratLantikan
          schoolCode={activeSchoolCode}
          schoolName={schoolName}
          schoolLogo={schoolLogo}
          schoolSlogan={schoolSlogan}
          academicYear={academicYear}
          currentUserName={currentUser.name}
          personnel={personnel}
          mysgItems={mysgItems}
          selectedItem={selectedItem}
          savedDocs={lantikanDocs}
          onSaveDoc={(d) => handleSaveDoc<SuratLantikanDocument>(d)}
          onDeleteDoc={handleDeleteDoc}
        />
      )}
    </div>
  );
};

export default AISetiausahaHub;
