import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Award,
  Mail,
  ClipboardCheck,
  Calendar,
} from 'lucide-react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, SchoolSettings, PersonnelProfile } from '../../types';
import { useSchoolTenant } from '../../contexts/SchoolTenantContext';
import { belongsToSchool, scopedDocId } from '../../utils/schoolTenant';
import {
  MYSG_DEFAULT_CATALOG,
  MySGJawatankuasaItem,
  mergeMySGCatalogWithSaved,
} from '../../utils/mysgJawatankuasaCatalog';
import { AISetiausahaDocument } from './types';
import ModuleOPRPoster from './ModuleOPRPoster';
import ModuleSuratLantikan from './ModuleSuratLantikan';
import ModuleMemoMesyuarat from './ModuleMemoMesyuarat';
import ModuleMinitMesyuarat from './ModuleMinitMesyuarat';

interface Props {
  currentUser: UserProfile;
  schoolSettings?: SchoolSettings | null;
}

export const AISetiausahaHub: React.FC<Props> = ({
  currentUser,
  schoolSettings,
}) => {
  const { schoolCode: activeSchoolCode, schoolName } = useSchoolTenant();
  const [activeTab, setActiveTab] = useState<'OPR' | 'LANTIKAN' | 'MEMO' | 'MINIT'>('OPR');

  // Academic Session state synced across OPR, Surat Lantikan, Memo & Minit
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('2026');
  const [availableYears, setAvailableYears] = useState<string[]>(['2026', '2027', '2028']);
  const [showNewYearInput, setShowNewYearInput] = useState<boolean>(false);
  const [newYearStr, setNewYearStr] = useState<string>('');

  // Sessional MySG roster & school personnel
  const [mysgItems, setMysgItems] = useState<MySGJawatankuasaItem[]>(() =>
    MYSG_DEFAULT_CATALOG.map((i) => ({ ...i, ahliList: [] }))
  );
  const [personnel, setPersonnel] = useState<PersonnelProfile[]>([]);
  const [activeMemoForMinit, setActiveMemoForMinit] = useState<AISetiausahaDocument | null>(null);

  const effectiveSchoolName =
    schoolSettings?.schoolName || schoolName || 'SJK (C) CHUNG HUA BALINGIAN';

  const isCurrentSession =
    selectedAcademicYear === '2026' || selectedAcademicYear.startsWith('2026');

  // Load Academic Years & Personnel
  useEffect(() => {
    async function loadYearsAndPersonnel() {
      try {
        const [yrSnap, pSnap] = await Promise.all([
          getDocs(collection(db, 'academic_years')).catch(() => null),
          getDocs(collection(db, 'personnel')).catch(() => null),
        ]);

        if (yrSnap) {
          const yrList = yrSnap.docs
            .filter((d) => belongsToSchool(d.data() as any, activeSchoolCode))
            .map((d) => String((d.data() as any).year || '').trim())
            .filter(Boolean);
          const mergedYrs = Array.from(new Set(['2026', '2027', '2028', ...yrList])).sort((a, b) =>
            a.localeCompare(b)
          );
          setAvailableYears(mergedYrs);
        }

        if (pSnap && !pSnap.empty) {
          const scopedP = pSnap.docs
            .filter((d) => belongsToSchool(d.data() as any, activeSchoolCode))
            .map((d) => ({ ...(d.data() as any), id: d.id } as PersonnelProfile))
            .filter((p) => Boolean(p.name));
          scopedP.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
          setPersonnel(scopedP);
        }
      } catch (e) {
        console.warn('Could not load academic years or personnel in AISetiausahaHub:', e);
      }
    }
    loadYearsAndPersonnel();
  }, [activeSchoolCode]);

  // Load sessional MySG assignments strictly isolated by `${activeSchoolCode}_${selectedAcademicYear}`
  useEffect(() => {
    async function loadSessionalMySG() {
      try {
        const aySlug = (selectedAcademicYear || '2026').replace(/\//g, '-');
        const assignDocId = `${activeSchoolCode}_${aySlug}`;
        const govDocId = scopedDocId(activeSchoolCode, `mysg_jawatankuasa_${aySlug}`);

        const [assignSnap, govSnap] = await Promise.all([
          getDoc(doc(db, 'mysg_jawatankuasa_assignments', assignDocId)).catch(() => null),
          getDoc(doc(db, 'school_governance', govDocId)).catch(() => null),
        ]);

        if (
          assignSnap?.exists() &&
          Array.isArray(assignSnap.data()?.items) &&
          assignSnap.data().items.length > 0
        ) {
          setMysgItems(mergeMySGCatalogWithSaved(assignSnap.data().items));
        } else if (
          govSnap?.exists() &&
          Array.isArray(govSnap.data()?.items) &&
          govSnap.data().items.length > 0
        ) {
          setMysgItems(mergeMySGCatalogWithSaved(govSnap.data().items));
        } else {
          setMysgItems(mergeMySGCatalogWithSaved(null));
        }
      } catch (err) {
        console.warn('Could not load sessional MySG in AISetiausahaHub:', err);
        setMysgItems(mergeMySGCatalogWithSaved(null));
      }
    }
    loadSessionalMySG();
  }, [activeSchoolCode, selectedAcademicYear]);

  const handleAddCustomYear = async () => {
    const clean = newYearStr.trim();
    if (!clean) return;
    try {
      const docId = scopedDocId(activeSchoolCode, clean);
      await setDoc(
        doc(db, 'academic_years', docId),
        {
          id: docId,
          schoolCode: activeSchoolCode,
          year: clean,
          status: 'historical',
        },
        { merge: true }
      ).catch(() => null);
      setAvailableYears((prev) =>
        Array.from(new Set([...prev, clean])).sort((a, b) => a.localeCompare(b))
      );
      setSelectedAcademicYear(clean);
    } finally {
      setNewYearStr('');
      setShowNewYearInput(false);
    }
  };

  const sessionSummaryCounts = useMemo(() => {
    const penyelarasCount = mysgItems.filter((i) => Boolean(i.assignedTeacherId)).length;
    const ahliCount = mysgItems.reduce(
      (acc, i) => acc + (Array.isArray(i.ahliList) ? i.ahliList.length : 0),
      0
    );
    return { penyelarasCount, ahliCount };
  }, [mysgItems]);

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <div className="inline-flex items-center gap-1.5 bg-slate-950 border border-slate-700 px-3 py-1 rounded-xl text-xs font-black text-white">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>Sesi Akademik:</span>
                <select
                  value={selectedAcademicYear}
                  onChange={(e) => {
                    if (e.target.value === '__ADD_NEW__') {
                      setShowNewYearInput(true);
                      return;
                    }
                    setSelectedAcademicYear(e.target.value);
                  }}
                  className="bg-slate-900 text-amber-300 border border-slate-700 rounded-lg px-2 py-0.5 text-xs font-black outline-none cursor-pointer"
                >
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      Sesi {yr}
                    </option>
                  ))}
                  <option value="__ADD_NEW__">+ Sesi Baharu...</option>
                </select>
              </div>

              {isCurrentSession ? (
                <span className="px-2.5 py-1 rounded-xl bg-emerald-950/80 border border-emerald-700 text-emerald-300 text-[11px] font-black">
                  🟢 Sesi Semasa ({selectedAcademicYear}) · {sessionSummaryCounts.penyelarasCount} Penyelaras &amp; {sessionSummaryCounts.ahliCount} AJK
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-xl bg-amber-950/80 border border-amber-600 text-amber-300 text-[11px] font-black">
                  🟡 Mod Perancangan Sesi Baharu ({selectedAcademicYear}) · {sessionSummaryCounts.penyelarasCount} Penyelaras &amp; {sessionSummaryCounts.ahliCount} AJK
                </span>
              )}

              {showNewYearInput && (
                <div className="inline-flex items-center gap-1.5 bg-slate-950 border border-slate-700 rounded-xl p-1">
                  <input
                    type="text"
                    value={newYearStr}
                    onChange={(e) => setNewYearStr(e.target.value)}
                    placeholder="cth: 2029"
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-bold w-24"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomYear}
                    className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-black cursor-pointer"
                  >
                    Pilih
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewYearInput(false)}
                    className="text-slate-400 hover:text-white text-xs px-1"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            <h2 className="text-xl font-black text-white uppercase tracking-tight">
              Hab Dokumentasi Rasmi &amp; AI Setiausaha (SKPM / PKPA / MySG — Sesi {selectedAcademicYear})
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Pusat sehenti penjanaan Poster OPR SKPM Kualiti@Sekolah, Surat Lantikan MySG (Penyelaras &amp; AJK), Memo Panggilan &amp; Minit Mesyuarat PKPA Bil. 2/1991.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'OPR', label: 'Poster OPR (SKPM)', icon: FileText },
              { id: 'LANTIKAN', label: 'Surat Lantikan MySG', icon: Award },
              { id: 'MEMO', label: 'Memo Panggilan', icon: Mail },
              { id: 'MINIT', label: 'Minit Mesyuarat PKPA', icon: ClipboardCheck },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                      : 'bg-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {activeTab === 'OPR' && (
        <ModuleOPRPoster
          currentUser={currentUser}
          schoolSettings={schoolSettings}
          schoolCode={activeSchoolCode}
          schoolName={effectiveSchoolName}
          academicYear={selectedAcademicYear}
        />
      )}
      {activeTab === 'LANTIKAN' && (
        <ModuleSuratLantikan
          currentUser={currentUser}
          schoolSettings={schoolSettings}
          schoolCode={activeSchoolCode}
          schoolName={effectiveSchoolName}
          academicYear={selectedAcademicYear}
          mysgItems={mysgItems}
          personnel={personnel}
        />
      )}
      {activeTab === 'MEMO' && (
        <ModuleMemoMesyuarat
          currentUser={currentUser}
          schoolSettings={schoolSettings}
          schoolCode={activeSchoolCode}
          schoolName={effectiveSchoolName}
          academicYear={selectedAcademicYear}
          mysgItems={mysgItems}
          personnel={personnel}
          onOpenMemoInMinit={(memoDoc) => {
            setActiveMemoForMinit(memoDoc);
            setActiveTab('MINIT');
          }}
        />
      )}
      {activeTab === 'MINIT' && (
        <ModuleMinitMesyuarat
          currentUser={currentUser}
          schoolSettings={schoolSettings}
          schoolCode={activeSchoolCode}
          schoolName={effectiveSchoolName}
          academicYear={selectedAcademicYear}
          initialMemo={activeMemoForMinit}
        />
      )}
    </div>
  );
};

export default AISetiausahaHub;
