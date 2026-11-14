import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, Check, Plus, Trash2, Edit3, Save, Printer, 
  Sparkles, Calendar, Users, Award, ShieldCheck, ChevronRight,
  RefreshCw, CheckCircle2, Clock, MapPin, AlertCircle
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { 
  collection, doc, getDocs, setDoc, deleteDoc, 
  onSnapshot, query, where 
} from 'firebase/firestore';
import { UserProfile, SchoolSettings } from '../../types';
import { 
  KokoGroup, 
  KokoMeetingReport, 
  KokoAttendanceSession,
  KPM_12_MEETING_TEMPLATES 
} from '../../types/kokurikulum';
import { useSchoolTenant } from '../../contexts/SchoolTenantContext';
import { belongsToSchool, scopedDocId } from '../../utils/schoolTenant';

interface Props {
  profile: UserProfile;
  role: 'pentadbir' | 'guru' | 'laporan';
  schoolSettings?: SchoolSettings | null;
  prefill?: {
    groupId: string;
    groupName: string;
    category: 'uniform' | 'club' | 'sport';
    date: string;
    meetingNumber: number;
    present: number;
    absent: number;
    total: number;
    percentage: number;
  } | null;
  onClearPrefill?: () => void;
}

export default function KokoMeetingReportManager({ 
  profile, 
  role, 
  schoolSettings,
  prefill,
  onClearPrefill 
}: Props) {
  const { schoolCode: activeSchoolCode, schoolName: tenantSchoolName } = useSchoolTenant();
  const [selectedCategory, setSelectedCategory] = useState<'uniform' | 'club' | 'sport'>('uniform');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [selectedMeetingNumber, setSelectedMeetingNumber] = useState<number>(1);

  const [groups, setGroups] = useState<KokoGroup[]>([]);
  const [teachers, setTeachers] = useState<string[]>([]);
  const [reports, setReports] = useState<KokoMeetingReport[]>([]);
  const [attendanceSessions, setAttendanceSessions] = useState<KokoAttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form states for active report
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [timeStart, setTimeStart] = useState('13:30');
  const [timeEnd, setTimeEnd] = useState('15:00');
  const [venue, setVenue] = useState('Bilik Darjah / Dewan Sekolah');
  const [tajukAktiviti, setTajukAktiviti] = useState('');
  const [kpmModule, setKpmModule] = useState('');
  const [objectives, setObjectives] = useState<string[]>([]);
  const [newObjectiveText, setNewObjectiveText] = useState('');
  const [ringkasanAktiviti, setRingkasanAktiviti] = useState('');
  const [refleksiImpak, setRefleksiImpak] = useState('');
  const [halLain, setHalLain] = useState('');
  const [guruHadir, setGuruHadir] = useState<string[]>([]);
  const [disediakanOleh, setDisediakanOleh] = useState(profile.name);
  const [jawatanPenyedia, setJawatanPenyedia] = useState('Guru Penasihat');
  const [disahkanOleh, setDisahkanOleh] = useState('GPK Kokurikulum');

  // Attendance stats for current report
  const [attendanceStats, setAttendanceStats] = useState<{
    present: number;
    absent: number;
    total: number;
    percentage: number;
    isSynced: boolean;
  }>({
    present: 0,
    absent: 0,
    total: 0,
    percentage: 0,
    isSynced: false
  });

  const canEdit = role === 'pentadbir' || role === 'guru';

  // Load Firestore data
  useEffect(() => {
    setLoading(true);
    const unsubs: (() => void)[] = [];

    // Groups
    unsubs.push(
      onSnapshot(collection(db, 'koko_groups'), (snap) => {
        setGroups(
          snap.docs
            .filter(d => belongsToSchool(d.data(), activeSchoolCode))
            .map(d => ({ id: d.id, ...d.data() } as KokoGroup))
        );
      })
    );

    // Reports
    unsubs.push(
      onSnapshot(collection(db, 'koko_meeting_reports'), (snap) => {
        setReports(
          snap.docs
            .filter(d => belongsToSchool(d.data(), activeSchoolCode))
            .map(d => ({ id: d.id, ...d.data() } as KokoMeetingReport))
        );
      })
    );

    // Attendance
    unsubs.push(
      onSnapshot(collection(db, 'koko_attendance'), (snap) => {
        setAttendanceSessions(
          snap.docs
            .filter(d => belongsToSchool(d.data(), activeSchoolCode))
            .map(d => ({ id: d.id, ...d.data() } as KokoAttendanceSession))
        );
        setLoading(false);
      })
    );

    // Personnel
    async function loadTeachers() {
      try {
        const snap = await getDocs(collection(db, 'personnel'));
        const scopedPersonnel = snap.docs.filter(d => belongsToSchool(d.data(), activeSchoolCode));
        if (scopedPersonnel.length > 0) {
          setTeachers(scopedPersonnel.map(d => (d.data().name || d.data().nama || '').toUpperCase()).filter(Boolean));
        } else {
          const tSnap = await getDocs(collection(db, 'teachers'));
          setTeachers(
            tSnap.docs
              .filter(d => belongsToSchool(d.data(), activeSchoolCode))
              .map(d => (d.data().name || '').toUpperCase())
              .filter(Boolean)
          );
        }
      } catch (err) {
        console.warn('Teacher load error:', err);
      }
    }
    loadTeachers();

    return () => unsubs.forEach(u => u());
  }, [activeSchoolCode]);

  // Filter groups by category
  const categoryGroups = useMemo(() => {
    return groups.filter(g => g.category === selectedCategory);
  }, [groups, selectedCategory]);

  useEffect(() => {
    if (categoryGroups.length > 0 && !selectedGroupId) {
      setSelectedGroupId(categoryGroups[0].id || categoryGroups[0].name);
    }
  }, [categoryGroups, selectedGroupId]);

  const currentGroup = useMemo(() => {
    return groups.find(g => g.id === selectedGroupId || g.name === selectedGroupId);
  }, [groups, selectedGroupId]);

  // Handle incoming prefill from Attendance module shortcut
  useEffect(() => {
    if (prefill) {
      setSelectedCategory(prefill.category);
      setSelectedGroupId(prefill.groupId);
      setSelectedMeetingNumber(prefill.meetingNumber);
      setDate(prefill.date);
      setAttendanceStats({
        present: prefill.present,
        absent: prefill.absent,
        total: prefill.total,
        percentage: prefill.percentage,
        isSynced: true
      });
      if (onClearPrefill) onClearPrefill();
    }
  }, [prefill, onClearPrefill]);

  // Determine active report or load default KPM template
  useEffect(() => {
    if (!currentGroup) return;
    const targetGroupId = currentGroup.id || currentGroup.name;

    // Search existing report
    const existing = reports.find(
      r => (r.groupId === targetGroupId || r.groupName === currentGroup.name) &&
           Number(r.meetingNumber) === Number(selectedMeetingNumber)
    );

    const template = KPM_12_MEETING_TEMPLATES.find(t => t.meetingNumber === Number(selectedMeetingNumber));

    if (existing) {
      setDate(existing.date || new Date().toISOString().split('T')[0]);
      setTimeStart(existing.timeStart || '13:30');
      setTimeEnd(existing.timeEnd || '15:00');
      setVenue(existing.venue || 'Bilik Darjah / Dewan Sekolah');
      setTajukAktiviti(existing.tajukAktiviti || existing.meetingTitle || '');
      setKpmModule(existing.kpmModule || template?.kpmModule || '');
      setObjectives(existing.objektif || template?.defaultObjectives || []);
      setRingkasanAktiviti(existing.ringkasanAktiviti || template?.defaultSummary || '');
      setRefleksiImpak(existing.refleksiImpak || template?.defaultReflection || '');
      setHalLain(existing.halLain || '');
      setGuruHadir(existing.guruPenasihatHadir || [profile.name]);
      setDisediakanOleh(existing.disediakanOleh || profile.name);
      setJawatanPenyedia(existing.jawatanPenyedia || 'Guru Penasihat');
      setDisahkanOleh(existing.disahkanOleh || 'GPK Kokurikulum');
      if (existing.attendanceStats) {
        setAttendanceStats({
          ...existing.attendanceStats,
          isSynced: true
        });
      }
    } else {
      // Initialize with KPM 12 template defaults
      setTajukAktiviti(template ? `Perjumpaan ${template.meetingNumber}: ${template.title}` : `Perjumpaan ${selectedMeetingNumber}`);
      setKpmModule(template?.kpmModule || 'Modul Kokurikulum KPM');
      setObjectives(template?.defaultObjectives || ['Melaksanakan modul aktiviti unit kokurikulum secara terancang.']);
      setRingkasanAktiviti(template?.defaultSummary || 'Aktiviti dijalankan mengikut rancangan mingguan.');
      setRefleksiImpak(template?.defaultReflection || 'Murid menunjukkan minat dan penglibatan aktif.');
      setHalLain('');
      setGuruHadir([profile.name]);

      // Check attendance session in koko_attendance to auto-sync!
      const matchingSession = attendanceSessions.find(
        s => (s.groupId === targetGroupId || s.groupId === currentGroup.name) &&
             Number(s.meetingNumber) === Number(selectedMeetingNumber)
      );

      if (matchingSession && matchingSession.attendance) {
        let present = 0;
        let absent = 0;
        Object.values(matchingSession.attendance).forEach(val => {
          if (val === '1') present++;
          else if (val === '0') absent++;
        });
        const total = present + absent;
        const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
        setDate(matchingSession.date);
        setAttendanceStats({ present, absent, total, percentage, isSynced: true });
      } else {
        setAttendanceStats({ present: 0, absent: 0, total: 0, percentage: 0, isSynced: false });
      }
    }
  }, [reports, selectedGroupId, selectedMeetingNumber, currentGroup, attendanceSessions, profile.name]);

  // Save report
  const handleSaveReport = async () => {
    if (!currentGroup) return;
    setSaving(true);
    const targetGroupId = currentGroup.id || currentGroup.name;
    const reportDocId = scopedDocId(activeSchoolCode, `${targetGroupId}_p${selectedMeetingNumber}`);

    const reportData: KokoMeetingReport & { schoolCode?: string } = {
      schoolCode: activeSchoolCode,
      meetingNumber: selectedMeetingNumber,
      meetingTitle: tajukAktiviti,
      category: currentGroup.category,
      groupId: targetGroupId,
      groupName: currentGroup.name,
      date,
      timeStart,
      timeEnd,
      venue,
      attendanceStats: {
        present: attendanceStats.present,
        absent: attendanceStats.absent,
        total: attendanceStats.total,
        percentage: attendanceStats.percentage
      },
      guruPenasihatHadir: guruHadir,
      kpmModule,
      tajukAktiviti,
      objektif: objectives,
      ringkasanAktiviti,
      refleksiImpak,
      halLain,
      disediakanOleh,
      jawatanPenyedia,
      disahkanOleh,
      academicYear: '2026',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'koko_meeting_reports', reportDocId), reportData);
      setSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving meeting report:', err);
      setSaving(false);
    }
  };

  // Add objective
  const handleAddObjective = () => {
    if (!newObjectiveText.trim()) return;
    setObjectives(prev => [...prev, newObjectiveText.trim()]);
    setNewObjectiveText('');
  };

  const handleRemoveObjective = (idx: number) => {
    setObjectives(prev => prev.filter((_, i) => i !== idx));
  };

  // Toggle teacher attendance
  const handleToggleTeacher = (tName: string) => {
    if (guruHadir.includes(tName)) {
      setGuruHadir(prev => prev.filter(t => t !== tName));
    } else {
      setGuruHadir(prev => [...prev, tName]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 print:hidden">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600/20 text-blue-400 rounded-2xl border border-blue-500/30">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Laporan Perjumpaan Kokurikulum (12 Template KPM)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Berdasarkan Buku Panduan Pengurusan Kokurikulum & Kelab/Persatuan KPM dengan Segerak Kehadiran
              </p>
            </div>
          </div>
        </div>

        {/* Category Switcher */}
        <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-800 shrink-0">
          <button
            onClick={() => setSelectedCategory('uniform')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              selectedCategory === 'uniform' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            Unit Beruniform
          </button>
          <button
            onClick={() => setSelectedCategory('club')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              selectedCategory === 'club' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            Kelab & Persatuan
          </button>
          <button
            onClick={() => setSelectedCategory('sport')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              selectedCategory === 'sport' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            Sukan & Permainan
          </button>
        </div>
      </div>

      {/* Unit Selector Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-400 mr-1 uppercase tracking-wider">Unit:</span>
          {categoryGroups.map(g => {
            const isSelected = g.id === selectedGroupId || g.name === selectedGroupId;
            return (
              <button
                key={g.id || g.name}
                onClick={() => setSelectedGroupId(g.id || g.name)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-white text-slate-950 shadow-md font-black'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <span>{g.name}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-blue-600" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* 12 Meetings Stepper / Selector Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg print:hidden">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-blue-400" />
            12 Siri Perjumpaan Rasmi KPM (Pilih Sesi):
          </span>
          <span className="text-[11px] text-slate-400">
            Perjumpaan Semasa: <strong className="text-blue-400 font-mono">P{selectedMeetingNumber}</strong>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
          {Array.from({ length: 12 }, (_, i) => i + 1).map(num => {
            const isSelected = selectedMeetingNumber === num;
            const hasReport = currentGroup && reports.some(
              r => (r.groupId === (currentGroup.id || currentGroup.name) || r.groupName === currentGroup.name) &&
                   Number(r.meetingNumber) === num
            );

            return (
              <button
                key={num}
                onClick={() => setSelectedMeetingNumber(num)}
                className={`p-2.5 rounded-xl border flex flex-col items-center justify-center transition-all ${
                  isSelected
                    ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-600/30 scale-105 font-black'
                    : hasReport
                    ? 'bg-slate-800/90 border-emerald-600/50 text-emerald-300 hover:bg-slate-800'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                }`}
              >
                <span className="text-xs font-black">P{num}</span>
                <span className="text-[9px] mt-0.5 truncate w-full text-center">
                  {hasReport ? '✓ Siap' : 'Draf'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Report Form Card */}
      {currentGroup && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          {/* Header Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5 print:hidden">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 bg-blue-950 text-blue-300 border border-blue-800/80 rounded-lg text-xs font-black">
                  Perjumpaan {selectedMeetingNumber}
                </span>
                <h3 className="text-lg font-bold text-white">
                  {tajukAktiviti || `Laporan Perjumpaan ${selectedMeetingNumber}`}
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {currentGroup.name} · Modul: {kpmModule}
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition shadow"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak / Eksport PDF</span>
              </button>

              {canEdit && (
                <button
                  onClick={handleSaveReport}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider transition shadow-lg shadow-blue-600/30"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>Simpan Laporan</span>
                </button>
              )}
            </div>
          </div>

          {saveSuccess && (
            <div className="p-3 bg-emerald-950/80 border border-emerald-500/50 rounded-2xl flex items-center gap-2 text-xs font-bold text-emerald-300 print:hidden">
              <CheckCircle2 className="w-4 h-4" />
              <span>Laporan Perjumpaan {selectedMeetingNumber} berjaya disimpan ke pangkalan data!</span>
            </div>
          )}

          {/* ================= PRINTABLE OFFICIAL REPORT SHEET ================= */}
          <div className="print-report-container space-y-6">
            {/* School Header Banner for Print */}
            <div className="border-b-2 border-slate-300 pb-4 text-center">
              <h1 className="text-base font-black uppercase tracking-wide text-slate-900 dark:text-white">
                {schoolSettings?.schoolName || tenantSchoolName} ({schoolSettings?.schoolCode || activeSchoolCode})
              </h1>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mt-0.5">
                BUKU REKOD PENGURUSAN DAN LAPORAN AKTIVITI KOKURIKULUM SESI 2026
              </h2>
              <div className="mt-2 inline-block px-4 py-1 bg-blue-100 dark:bg-blue-950/80 text-blue-900 dark:text-blue-300 font-black text-xs rounded-full border border-blue-400">
                LAPORAN PERJUMPAAN MINGGUAN ({selectedMeetingNumber} / 12)
              </div>
            </div>

            {/* Metadata Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-950/60 border border-slate-800 rounded-2xl text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Unit / Pasukan</label>
                <div className="font-bold text-white mt-0.5">{currentGroup.name}</div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Tarikh</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full bg-transparent border-b border-slate-700 text-white font-bold py-0.5 text-xs outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Masa</label>
                <div className="flex items-center gap-1 text-white font-mono mt-0.5">
                  <input
                    type="time"
                    value={timeStart}
                    onChange={e => setTimeStart(e.target.value)}
                    className="bg-transparent border-b border-slate-700 text-white text-xs outline-none w-16"
                  />
                  <span>-</span>
                  <input
                    type="time"
                    value={timeEnd}
                    onChange={e => setTimeEnd(e.target.value)}
                    className="bg-transparent border-b border-slate-700 text-white text-xs outline-none w-16"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Tempat</label>
                <input
                  type="text"
                  value={venue}
                  onChange={e => setVenue(e.target.value)}
                  className="w-full bg-transparent border-b border-slate-700 text-white font-bold py-0.5 text-xs outline-none"
                />
              </div>
            </div>

            {/* Attendance Live-Sync Summary Card */}
            <div className="p-4 bg-gradient-to-r from-slate-950 to-blue-950/40 border border-blue-500/30 rounded-2xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2 mb-3">
                <span className="text-xs font-black uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  Statistik Kehadiran Ahli
                </span>
                {attendanceStats.isSynced ? (
                  <span className="text-[10px] px-2 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-700/60 rounded-md font-bold">
                    ✓ Disegerakkan dari Modul Kehadiran
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 bg-amber-950 text-amber-300 border border-amber-700/60 rounded-md font-bold">
                    Manual / Belum Disegerak
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase">Jumlah Ahli</div>
                  <div className="text-lg font-black text-white mt-1 font-mono">{attendanceStats.total}</div>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-emerald-400 uppercase">Hadir</div>
                  <div className="text-lg font-black text-emerald-400 mt-1 font-mono">{attendanceStats.present}</div>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-rose-400 uppercase">Tidak Hadir</div>
                  <div className="text-lg font-black text-rose-400 mt-1 font-mono">{attendanceStats.absent}</div>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-blue-400 uppercase">Peratus Kehadiran</div>
                  <div className="text-lg font-black text-blue-400 mt-1 font-mono">{attendanceStats.percentage}%</div>
                </div>
              </div>
            </div>

            {/* Tajuk Aktiviti & Modul KPM */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                  Tajuk Aktiviti / Perjumpaan:
                </label>
                <input
                  type="text"
                  value={tajukAktiviti}
                  onChange={e => setTajukAktiviti(e.target.value)}
                  placeholder="Tajuk Aktiviti Mingguan..."
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white font-bold outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                  Modul / Sukatan KPM:
                </label>
                <input
                  type="text"
                  value={kpmModule}
                  onChange={e => setKpmModule(e.target.value)}
                  placeholder="Modul KPM..."
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Objektif Aktiviti (Editable Bulleted List) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                  Objektif Pembelajaran / Aktiviti:
                </label>
              </div>

              <div className="space-y-2">
                {objectives.map((obj, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
                    <span className="w-5 h-5 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center text-[10px] font-black shrink-0">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={obj}
                      onChange={e => {
                        const updated = [...objectives];
                        updated[idx] = e.target.value;
                        setObjectives(updated);
                      }}
                      className="w-full bg-transparent text-xs text-slate-200 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveObjective(idx)}
                      className="text-slate-500 hover:text-rose-400 print:hidden"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 print:hidden">
                <input
                  type="text"
                  value={newObjectiveText}
                  onChange={e => setNewObjectiveText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddObjective(); }}}
                  placeholder="Tambah objektif aktiviti baru..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={handleAddObjective}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold"
                >
                  + Tambah
                </button>
              </div>
            </div>

            {/* Ringkasan Aktiviti Dijalankan */}
            <div>
              <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                Ringkasan Aktiviti Dijalankan:
              </label>
              <textarea
                rows={4}
                value={ringkasanAktiviti}
                onChange={e => setRingkasanAktiviti(e.target.value)}
                placeholder="Terangkan langkah atau aktiviti yang telah dijalankan sepanjang perjumpaan..."
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-200 outline-none focus:border-blue-500 leading-relaxed"
              />
            </div>

            {/* Refleksi & Impak Aktiviti */}
            <div>
              <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                Refleksi & Impak Aktiviti:
              </label>
              <textarea
                rows={3}
                value={refleksiImpak}
                onChange={e => setRefleksiImpak(e.target.value)}
                placeholder="Catatkan pencapaian objektif, respons murid, dan impak terhadap kemahiran..."
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-200 outline-none focus:border-blue-500 leading-relaxed"
              />
            </div>

            {/* Hal-hal Lain / Cadangan Penambahbaikan */}
            <div>
              <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                Hal-hal Lain / Cadangan Penambahbaikan:
              </label>
              <textarea
                rows={2}
                value={halLain}
                onChange={e => setHalLain(e.target.value)}
                placeholder="Catatan tambahan atau cadangan penambahbaikan untuk perjumpaan seterusnya..."
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-200 outline-none focus:border-blue-500"
              />
            </div>

            {/* Guru Penasihat Hadir Checklist */}
            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl">
              <label className="text-xs font-black text-slate-300 uppercase tracking-wider block mb-2">
                Guru Penasihat Hadir Bertugas ({guruHadir.length}):
              </label>
              <div className="flex flex-wrap gap-2">
                {teachers.map(tName => {
                  const isChecked = guruHadir.includes(tName);
                  return (
                    <button
                      key={tName}
                      type="button"
                      onClick={() => handleToggleTeacher(tName)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border flex items-center gap-1.5 ${
                        isChecked
                          ? 'bg-blue-600 text-white border-blue-500'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      <span>{tName}</span>
                      {isChecked && <Check className="w-3.5 h-3.5" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Official Signatures Box (Print View) */}
            <div className="grid grid-cols-2 gap-8 pt-8 border-t-2 border-slate-800 text-xs">
              <div className="space-y-3">
                <div className="text-[11px] text-slate-400 uppercase font-bold">Disediakan Oleh:</div>
                <div className="h-14 border-b border-slate-700 flex items-end pb-1 font-bold text-white">
                  {disediakanOleh}
                </div>
                <div className="text-[10px] text-slate-400">
                  <input
                    type="text"
                    value={jawatanPenyedia}
                    onChange={e => setJawatanPenyedia(e.target.value)}
                    className="bg-transparent border-b border-slate-700 text-white outline-none w-full"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-[11px] text-slate-400 uppercase font-bold">Disahkan Oleh:</div>
                <div className="h-14 border-b border-slate-700 flex items-end pb-1 font-bold text-white">
                  {disahkanOleh}
                </div>
                <div className="text-[10px] text-slate-400">
                  Guru Besar / Penolong Kanan Kokurikulum
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
