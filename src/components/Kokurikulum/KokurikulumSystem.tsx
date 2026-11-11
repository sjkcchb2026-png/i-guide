import React, { useState } from 'react';
import { 
  Users, Calendar, FileText, Trophy, BarChart3, 
  Crown, Sparkles, Shield
} from 'lucide-react';
import { UserProfile, SchoolSettings } from '../../types';
import KokoCommitteeManager from './KokoCommitteeManager';
import KokoAttendanceManager from './KokoAttendanceManager';
import KokoMeetingReportManager from './KokoMeetingReportManager';
import KokoSmartOPRManager from './KokoSmartOPRManager';
import KokoAnalyticsView from './KokoAnalyticsView';

export type KokoMainTab = 
  | 'committee' 
  | 'attendance' 
  | 'meeting-reports' 
  | 'opr' 
  | 'analytics';

interface Props {
  currentUser: UserProfile;
  profile?: UserProfile;
  role?: 'pentadbir' | 'guru' | 'laporan';
  schoolSettings?: SchoolSettings | null;
}

export default function KokurikulumSystem({
  currentUser,
  profile,
  role = 'guru',
  schoolSettings
}: Props) {
  const [activeTab, setActiveTab] = useState<KokoMainTab>('committee');
  const userProfile = profile || currentUser;

  // Prefill state passed from Attendance shortcut to Meeting Report
  const [reportPrefill, setReportPrefill] = useState<{
    groupId: string;
    groupName: string;
    category: 'uniform' | 'club' | 'sport';
    date: string;
    meetingNumber: number;
    present: number;
    absent: number;
    total: number;
    percentage: number;
  } | null>(null);

  // Shortcut triggered from attendance
  const handleNavigateToReport = (prefillData: {
    groupId: string;
    groupName: string;
    category: 'uniform' | 'club' | 'sport';
    date: string;
    meetingNumber: number;
    present: number;
    absent: number;
    total: number;
    percentage: number;
  }) => {
    setReportPrefill(prefillData);
    setActiveTab('meeting-reports');
  };

  return (
    <div className="space-y-6">
      {/* ================= TOP TAB NAVIGATION BAR ================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-2 sm:p-3 shadow-xl overflow-x-auto print:hidden">
        <div className="flex items-center space-x-2 min-w-max">
          {/* Tab 1: Pengurusan Kokurikulum dan Jawatankuasa */}
          <button
            onClick={() => setActiveTab('committee')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'committee'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>1. Pengurusan Kokurikulum & Jawatankuasa</span>
          </button>

          {/* Tab 2: Kehadiran Kokurikulum */}
          <button
            onClick={() => setActiveTab('attendance')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'attendance'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>2. Kehadiran Kokurikulum</span>
          </button>

          {/* Tab 3: Laporan Perjumpaan (12 KPM) */}
          <button
            onClick={() => setActiveTab('meeting-reports')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'meeting-reports'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>3. Laporan Perjumpaan (12 KPM)</span>
          </button>

          {/* Tab 4: Laporan Pertandingan & Aktiviti (Smart OPR) */}
          <button
            onClick={() => setActiveTab('opr')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'opr'
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>4. Smart OPR (Pertandingan & Aktiviti)</span>
          </button>

          {/* Tab 5: Analisis Kokurikulum */}
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'analytics'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>5. Analisis Kokurikulum</span>
          </button>
        </div>
      </div>

      {/* ================= ACTIVE TAB VIEW ================= */}
      <div>
        {activeTab === 'committee' && (
          <KokoCommitteeManager 
            profile={userProfile} 
            role={role} 
          />
        )}

        {activeTab === 'attendance' && (
          <KokoAttendanceManager 
            profile={userProfile} 
            role={role} 
            onNavigateToReport={handleNavigateToReport} 
          />
        )}

        {activeTab === 'meeting-reports' && (
          <KokoMeetingReportManager 
            profile={userProfile} 
            role={role} 
            schoolSettings={schoolSettings}
            prefill={reportPrefill}
            onClearPrefill={() => setReportPrefill(null)}
          />
        )}

        {activeTab === 'opr' && (
          <KokoSmartOPRManager 
            profile={userProfile} 
            role={role} 
            schoolSettings={schoolSettings} 
          />
        )}

        {activeTab === 'analytics' && (
          <KokoAnalyticsView 
            profile={userProfile} 
          />
        )}
      </div>
    </div>
  );
}
