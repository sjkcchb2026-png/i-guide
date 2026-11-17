import React, { useState } from 'react';
import {
  FileText,
  Award,
  Mail,
  ClipboardCheck,
} from 'lucide-react';
import { UserProfile, SchoolSettings } from '../../types';
import { useSchoolTenant } from '../../contexts/SchoolTenantContext';
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

  const effectiveSchoolName =
    schoolSettings?.schoolName || schoolName || 'SJK (C) CHUNG HUA BALINGIAN';

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-tight">
            Hab Dokumentasi Rasmi &amp; AI Setiausaha (SKPM / PKPA / MySG)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Pusat sehenti penjanaan Poster OPR SKPM Kualiti@Sekolah, Surat Lantikan MySG, Memo Panggilan &amp; Minit Mesyuarat PKPA Bil. 2/1991.
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

      {activeTab === 'OPR' && (
        <ModuleOPRPoster
          currentUser={currentUser}
          schoolSettings={schoolSettings}
          schoolCode={activeSchoolCode}
          schoolName={effectiveSchoolName}
        />
      )}
      {activeTab === 'LANTIKAN' && (
        <ModuleSuratLantikan
          currentUser={currentUser}
          schoolSettings={schoolSettings}
          schoolCode={activeSchoolCode}
          schoolName={effectiveSchoolName}
        />
      )}
      {activeTab === 'MEMO' && (
        <ModuleMemoMesyuarat
          currentUser={currentUser}
          schoolSettings={schoolSettings}
          schoolCode={activeSchoolCode}
          schoolName={effectiveSchoolName}
        />
      )}
      {activeTab === 'MINIT' && (
        <ModuleMinitMesyuarat
          currentUser={currentUser}
          schoolSettings={schoolSettings}
          schoolCode={activeSchoolCode}
          schoolName={effectiveSchoolName}
        />
      )}
    </div>
  );
};

export default AISetiausahaHub;
