import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart3, Users, Award, Calendar, Trophy, 
  TrendingUp, Shield, ChevronRight, X, Filter,
  CheckCircle2, ArrowUpRight, School, Sparkles
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { Student, UserProfile } from '../../types';
import { 
  KokoActivity, 
  KokoGroup, 
  KokoAttendanceSession, 
  KokoScopeLevel, 
  KokoPencapaianTier 
} from '../../types/kokurikulum';

interface Props {
  profile: UserProfile;
}

const SCOPE_LEVELS: KokoScopeLevel[] = [
  'Sekolah', 
  'Daerah/Zon', 
  'Bahagian', 
  'Negeri', 
  'Kebangsaan', 
  'Antarabangsa'
];

const PENCAPAIAN_TIERS: KokoPencapaianTier[] = [
  'Johan', 
  'Naib Johan', 
  'Ketiga', 
  'Keempat', 
  'Kelima', 
  'Saguhati', 
  'Penyertaan'
];

interface DrillDownModalData {
  title: string;
  subtitle: string;
  type: 'teacher' | 'student' | 'achievement' | 'attendance';
  items: {
    id: string;
    title: string;
    date?: string;
    level?: string;
    role?: string;
    details?: string;
    badge?: string;
    badgeColor?: string;
  }[];
}

export default function KokoAnalyticsView({ profile }: Props) {
  const [activePillar, setActivePillar] = useState<'guru' | 'murid' | 'kehadiran' | 'pencapaian'>('guru');

  const [activities, setActivities] = useState<KokoActivity[]>([]);
  const [groups, setGroups] = useState<KokoGroup[]>([]);
  const [attendanceSessions, setAttendanceSessions] = useState<KokoAttendanceSession[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  // Drill-down modal state
  const [modalData, setModalData] = useState<DrillDownModalData | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsubs: (() => void)[] = [];

    // Activities
    unsubs.push(
      onSnapshot(collection(db, 'koko_activities'), (snap) => {
        const list = snap.docs.map(d => {
          const raw = d.data();
          const legacyJurulatih: string[] = Array.isArray(raw.jurulatih)
            ? raw.jurulatih
            : raw.teacherName
            ? [raw.teacherName]
            : raw.namaJurulatih
            ? [raw.namaJurulatih]
            : [];

          const legacyGuruPengiring: string[] = Array.isArray(raw.guruPengiring)
            ? raw.guruPengiring
            : [];

          return {
            id: d.id,
            ...raw,
            jurulatih: legacyJurulatih,
            guruPengiring: legacyGuruPengiring
          } as KokoActivity;
        });
        setActivities(list);
      })
    );

    // Groups
    unsubs.push(
      onSnapshot(collection(db, 'koko_groups'), (snap) => {
        setGroups(snap.docs.map(d => ({ id: d.id, ...d.data() } as KokoGroup)));
      })
    );

    // Attendance
    unsubs.push(
      onSnapshot(collection(db, 'koko_attendance'), (snap) => {
        setAttendanceSessions(snap.docs.map(d => ({ id: d.id, ...d.data() } as KokoAttendanceSession)));
      })
    );

    // Students
    unsubs.push(
      onSnapshot(collection(db, 'students'), (snap) => {
        setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() } as Student)));
        setLoading(false);
      })
    );

    return () => unsubs.forEach(u => u());
  }, []);

  // ================= PILLAR A: PENGLIBATAN GURU COMPUTATIONS =================
  const teacherStatsByLevel = useMemo(() => {
    const map: Record<KokoScopeLevel, { jurulatih: number; pengiring: number; total: number }> = {
      'Sekolah': { jurulatih: 0, pengiring: 0, total: 0 },
      'Daerah/Zon': { jurulatih: 0, pengiring: 0, total: 0 },
      'Bahagian': { jurulatih: 0, pengiring: 0, total: 0 },
      'Negeri': { jurulatih: 0, pengiring: 0, total: 0 },
      'Kebangsaan': { jurulatih: 0, pengiring: 0, total: 0 },
      'Antarabangsa': { jurulatih: 0, pengiring: 0, total: 0 }
    };

    activities.forEach(act => {
      const lvl = act.level || 'Daerah/Zon';
      if (!map[lvl]) return;
      const jCount = (act.jurulatih || []).length;
      const pCount = (act.guruPengiring || []).length;
      map[lvl].jurulatih += jCount;
      map[lvl].pengiring += pCount;
      map[lvl].total += (jCount + pCount);
    });

    return map;
  }, [activities]);

  // Teacher Leaderboard Table
  const teacherSummaryList = useMemo(() => {
    const tMap: Record<string, { name: string; jurulatihCount: number; pengiringCount: number; total: number; highestLevel: string; acts: KokoActivity[] }> = {};

    activities.forEach(act => {
      (act.jurulatih || []).forEach(name => {
        const clean = name.trim().toUpperCase();
        if (!clean) return;
        if (!tMap[clean]) {
          tMap[clean] = { name: clean, jurulatihCount: 0, pengiringCount: 0, total: 0, highestLevel: act.level, acts: [] };
        }
        tMap[clean].jurulatihCount += 1;
        tMap[clean].total += 1;
        tMap[clean].acts.push(act);
      });

      (act.guruPengiring || []).forEach(name => {
        const clean = name.trim().toUpperCase();
        if (!clean) return;
        if (!tMap[clean]) {
          tMap[clean] = { name: clean, jurulatihCount: 0, pengiringCount: 0, total: 0, highestLevel: act.level, acts: [] };
        }
        tMap[clean].pengiringCount += 1;
        tMap[clean].total += 1;
        if (!tMap[clean].acts.includes(act)) {
          tMap[clean].acts.push(act);
        }
      });
    });

    return Object.values(tMap).sort((a, b) => b.total - a.total);
  }, [activities]);

  // Click Teacher Row Drill-down
  const handleTeacherDrillDown = (teacherName: string) => {
    const matching = activities.filter(act => 
      (act.jurulatih || []).some(j => j.toUpperCase() === teacherName.toUpperCase()) ||
      (act.guruPengiring || []).some(p => p.toUpperCase() === teacherName.toUpperCase())
    );

    setModalData({
      title: `Rekod Penglibatan: ${teacherName}`,
      subtitle: `Jumlah ${matching.length} program disertai sebagai Jurulatih atau Guru Pengiring`,
      type: 'teacher',
      items: matching.map(act => {
        const isJ = (act.jurulatih || []).some(j => j.toUpperCase() === teacherName.toUpperCase());
        const isP = (act.guruPengiring || []).some(p => p.toUpperCase() === teacherName.toUpperCase());
        const roleStr = isJ && isP ? 'Jurulatih & Pengiring' : isJ ? 'Jurulatih' : 'Guru Pengiring';
        return {
          id: act.id || Math.random().toString(),
          title: act.programName,
          date: act.date,
          level: act.level,
          role: roleStr,
          badge: act.jenis === 'pertandingan' ? (act.pencapaian || 'Pertandingan') : 'Aktiviti',
          badgeColor: act.jenis === 'pertandingan' ? 'bg-amber-950 text-amber-300' : 'bg-blue-950 text-blue-300'
        };
      })
    });
  };

  // Click Level Drill-down for Guru
  const handleLevelTeacherDrillDown = (level: KokoScopeLevel) => {
    const matching = activities.filter(act => act.level === level);
    setModalData({
      title: `Penglibatan Guru Peringkat ${level}`,
      subtitle: `${matching.length} program diadakan di peringkat ${level}`,
      type: 'teacher',
      items: matching.map(act => ({
        id: act.id || Math.random().toString(),
        title: act.programName,
        date: act.date,
        level: act.level,
        role: `Jurulatih: ${(act.jurulatih || []).join(', ') || '-'} | Pengiring: ${(act.guruPengiring || []).join(', ') || '-'}`,
        badge: act.jenis === 'pertandingan' ? (act.pencapaian || 'Pertandingan') : 'Aktiviti',
        badgeColor: 'bg-indigo-950 text-indigo-300'
      }))
    });
  };

  // ================= PILLAR B: PENGLIBATAN MURID COMPUTATIONS =================
  const studentStatsByLevel = useMemo(() => {
    const map: Record<KokoScopeLevel, { count: number; events: number }> = {
      'Sekolah': { count: 0, events: 0 },
      'Daerah/Zon': { count: 0, events: 0 },
      'Bahagian': { count: 0, events: 0 },
      'Negeri': { count: 0, events: 0 },
      'Kebangsaan': { count: 0, events: 0 },
      'Antarabangsa': { count: 0, events: 0 }
    };

    activities.forEach(act => {
      const lvl = act.level || 'Daerah/Zon';
      if (!map[lvl]) return;
      map[lvl].count += (act.participantCount || 0);
      map[lvl].events += 1;
    });

    return map;
  }, [activities]);

  const handleStudentLevelDrillDown = (level: KokoScopeLevel) => {
    const matching = activities.filter(act => act.level === level && (act.participantCount || 0) > 0);
    setModalData({
      title: `Penyertaan Murid Peringkat ${level}`,
      subtitle: `Senarai program dan bilangan murid yang bertanding/menyertai`,
      type: 'student',
      items: matching.map(act => ({
        id: act.id || Math.random().toString(),
        title: act.programName,
        date: act.date,
        level: act.level,
        details: act.studentNames && act.studentNames.length > 0 
          ? `Peserta: ${act.studentNames.join(', ')}` 
          : `${act.participantCount} orang peserta`,
        badge: `${act.participantCount} Murid`,
        badgeColor: 'bg-emerald-950 text-emerald-300'
      }))
    });
  };

  // ================= PILLAR C: KEHADIRAN MURID COMPUTATIONS =================
  const attendance12Stats = useMemo(() => {
    const perjumpaanList = Array.from({ length: 12 }, (_, i) => i + 1).map(num => {
      const sessions = attendanceSessions.filter(s => Number(s.meetingNumber) === num);
      let totalP = 0;
      let totalT = 0;

      sessions.forEach(s => {
        if (!s.attendance) return;
        Object.values(s.attendance).forEach(val => {
          if (val === '1') {
            totalP++;
            totalT++;
          } else if (val === '0') {
            totalT++;
          }
        });
      });

      const pct = totalT > 0 ? Math.round((totalP / totalT) * 100) : 0;
      return {
        meetingNumber: num,
        sessionsCount: sessions.length,
        present: totalP,
        total: totalT,
        percentage: pct
      };
    });

    return perjumpaanList;
  }, [attendanceSessions]);

  // Unit rankings in attendance
  const unitAttendanceRankings = useMemo(() => {
    const uMap: Record<string, { groupName: string; category: string; present: number; total: number; pct: number }> = {};

    attendanceSessions.forEach(s => {
      const key = s.groupId;
      if (!uMap[key]) {
        const grp = groups.find(g => g.id === key || g.name === key);
        uMap[key] = {
          groupName: grp?.name || key,
          category: s.category || 'Kokurikulum',
          present: 0,
          total: 0,
          pct: 0
        };
      }

      if (s.attendance) {
        Object.values(s.attendance).forEach(val => {
          if (val === '1') {
            uMap[key].present++;
            uMap[key].total++;
          } else if (val === '0') {
            uMap[key].total++;
          }
        });
      }
    });

    return Object.values(uMap).map(u => ({
      ...u,
      pct: u.total > 0 ? Math.round((u.present / u.total) * 100) : 0
    })).sort((a, b) => b.pct - a.pct);
  }, [attendanceSessions, groups]);

  // ================= PILLAR D: PENCAPAIAN MURID COMPUTATIONS =================
  const achievementsByTier = useMemo(() => {
    const map: Record<KokoPencapaianTier, { count: number; acts: KokoActivity[] }> = {
      'Johan': { count: 0, acts: [] },
      'Naib Johan': { count: 0, acts: [] },
      'Ketiga': { count: 0, acts: [] },
      'Keempat': { count: 0, acts: [] },
      'Kelima': { count: 0, acts: [] },
      'Saguhati': { count: 0, acts: [] },
      'Penyertaan': { count: 0, acts: [] }
    };

    activities.filter(a => a.jenis === 'pertandingan').forEach(act => {
      const tier = act.pencapaian as KokoPencapaianTier;
      if (map[tier]) {
        map[tier].count += 1;
        map[tier].acts.push(act);
      }
    });

    return map;
  }, [activities]);

  const handleAchievementDrillDown = (tier: KokoPencapaianTier) => {
    const matching = activities.filter(act => act.jenis === 'pertandingan' && act.pencapaian === tier);
    setModalData({
      title: `Pencapaian: ${tier}`,
      subtitle: `${matching.length} pertandingan memenangi kedudukan ini`,
      type: 'achievement',
      items: matching.map(act => ({
        id: act.id || Math.random().toString(),
        title: act.programName,
        date: act.date,
        level: act.level,
        details: act.studentNames && act.studentNames.length > 0 
          ? `Pemenang: ${act.studentNames.join(', ')}` 
          : `Jurulatih: ${(act.jurulatih || []).join(', ') || '-'}`,
        badge: (act.pengiktirafan || []).join(', ') || 'Sijil',
        badgeColor: 'bg-amber-950 text-amber-300'
      }))
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-600/20 text-indigo-400 rounded-2xl border border-indigo-500/30">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Analisis Kokurikulum Interaktif & Drill-Down
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                4 Teras Analisis: Penglibatan Guru, Penyertaan Murid, Kehadiran 12 Perjumpaan & Pencapaian
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Pillars Nav Tabs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            id: 'guru' as const,
            label: '1. Penglibatan Guru',
            sub: 'Jurulatih & Pengiring',
            icon: Shield,
            color: 'indigo'
          },
          {
            id: 'murid' as const,
            label: '2. Penglibatan Murid',
            sub: 'Peringkat & Kategori',
            icon: Users,
            color: 'blue'
          },
          {
            id: 'kehadiran' as const,
            label: '3. Kehadiran Murid',
            sub: '12 Siri Perjumpaan',
            icon: Calendar,
            color: 'emerald'
          },
          {
            id: 'pencapaian' as const,
            label: '4. Pencapaian Murid',
            sub: 'Johan hingga Penyertaan',
            icon: Trophy,
            color: 'amber'
          }
        ].map(pillar => {
          const isSelected = activePillar === pillar.id;
          const Icon = pillar.icon;
          return (
            <button
              key={pillar.id}
              onClick={() => setActivePillar(pillar.id)}
              className={`p-4 rounded-2xl border text-left transition-all ${
                isSelected
                  ? 'bg-slate-800 border-indigo-500 text-white shadow-xl shadow-indigo-950/50 scale-[1.02]'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-850'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <Icon className={`w-5 h-5 ${isSelected ? 'text-indigo-400' : 'text-slate-500'}`} />
                {isSelected && <ArrowUpRight className="w-4 h-4 text-indigo-400" />}
              </div>
              <div className="text-xs font-black text-white">{pillar.label}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{pillar.sub}</div>
            </button>
          );
        })}
      </div>

      {/* ================= PILLAR 1: PENGLIBATAN GURU ================= */}
      {activePillar === 'guru' && (
        <div className="space-y-6">
          {/* Level Cards with Jurulatih vs Pengiring Breakdown */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  Penglibatan Guru Mengikut Peringkat
                </h3>
                <p className="text-[11px] text-slate-400">
                  Klik mana-mana kad untuk melihat senarai terperinci acara & peranan guru
                </p>
              </div>
              <span className="text-xs font-mono text-indigo-400 font-bold">
                *Klik kad untuk drill-down
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {SCOPE_LEVELS.map(lvl => {
                const stat = teacherStatsByLevel[lvl];
                return (
                  <div
                    key={lvl}
                    onClick={() => handleLevelTeacherDrillDown(lvl)}
                    className="bg-slate-950/70 border border-slate-800 hover:border-indigo-500/60 rounded-2xl p-3.5 cursor-pointer transition-all hover:scale-105 group"
                  >
                    <div className="text-[10px] font-black uppercase text-slate-400 truncate">{lvl}</div>
                    <div className="text-xl font-black text-white mt-1 group-hover:text-indigo-400 font-mono">
                      {stat.total}
                    </div>

                    <div className="mt-2 pt-2 border-t border-slate-900 space-y-1 text-[9px]">
                      <div className="flex justify-between text-amber-400">
                        <span>Jurulatih:</span>
                        <span className="font-mono font-bold">{stat.jurulatih}</span>
                      </div>
                      <div className="flex justify-between text-indigo-400">
                        <span>Pengiring:</span>
                        <span className="font-mono font-bold">{stat.pengiring}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Teacher Summary Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Jadual Penglibatan Individu Guru
              </h3>
              <p className="text-[11px] text-slate-400">
                Pecahan lantikan sebagai Jurulatih dan Guru Pengiring bagi setiap staf
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 text-[10px] font-black uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Bil</th>
                    <th className="py-3 px-4">Nama Guru</th>
                    <th className="py-3 px-4 text-center">Sebagai Jurulatih</th>
                    <th className="py-3 px-4 text-center">Sebagai Pengiring</th>
                    <th className="py-3 px-4 text-center">Jumlah Penglibatan</th>
                    <th className="py-3 px-4 text-center">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {teacherSummaryList.map((t, idx) => (
                    <tr 
                      key={t.name}
                      onClick={() => handleTeacherDrillDown(t.name)}
                      className="hover:bg-slate-800/40 cursor-pointer transition"
                    >
                      <td className="py-3 px-4 font-mono text-slate-500">{idx + 1}</td>
                      <td className="py-3 px-4 font-bold text-white flex items-center gap-1.5">
                        <span>{t.name}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-0.5 bg-amber-950 text-amber-300 rounded font-mono font-bold">
                          {t.jurulatihCount}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-0.5 bg-indigo-950 text-indigo-300 rounded font-mono font-bold">
                          {t.pengiringCount}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-black text-white font-mono text-sm">
                        {t.total}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleTeacherDrillDown(t.name); }}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-300 rounded-lg text-[10px] font-bold transition"
                        >
                          Perincian →
                        </button>
                      </td>
                    </tr>
                  ))}
                  {teacherSummaryList.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 italic">
                        Tiada rekod penglibatan guru dalam aktiviti kokurikulum lagi.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= PILLAR 2: PENGLIBATAN MURID ================= */}
      {activePillar === 'murid' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-sm font-black text-white uppercase tracking-wider">
              Penyertaan Murid Mengikut Peringkat
            </h3>
            <p className="text-[11px] text-slate-400">
              Jumlah kumulatif penyertaan murid dalam kejohanan dan aktiviti luar
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {SCOPE_LEVELS.map(lvl => {
              const stat = studentStatsByLevel[lvl];
              return (
                <div
                  key={lvl}
                  onClick={() => handleStudentLevelDrillDown(lvl)}
                  className="bg-slate-950/70 border border-slate-800 hover:border-blue-500/60 rounded-2xl p-4 cursor-pointer transition-all hover:scale-105 group"
                >
                  <div className="text-[10px] font-black uppercase text-slate-400">{lvl}</div>
                  <div className="text-2xl font-black text-white mt-1 group-hover:text-blue-400 font-mono">
                    {stat.count}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {stat.events} Acara
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= PILLAR 3: KEHADIRAN 12 PERJUMPAAN ================= */}
      {activePillar === 'kehadiran' && (
        <div className="space-y-6">
          {/* 12 Meetings Attendance Visual */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Purata Peratus Kehadiran 12 Siri Perjumpaan
              </h3>
              <p className="text-[11px] text-slate-400">
                Analisis kehadiran murid dari Perjumpaan 1 hingga Perjumpaan 12 bagi semua unit
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
              {attendance12Stats.map(stat => (
                <div
                  key={stat.meetingNumber}
                  className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-center flex flex-col justify-between"
                >
                  <div className="text-[10px] font-black text-slate-400">P{stat.meetingNumber}</div>
                  <div className={`text-base font-black my-1 font-mono ${
                    stat.percentage >= 80 ? 'text-emerald-400' : stat.percentage > 0 ? 'text-amber-400' : 'text-slate-600'
                  }`}>
                    {stat.percentage > 0 ? `${stat.percentage}%` : '-'}
                  </div>
                  <div className="text-[9px] text-slate-500 font-mono">
                    {stat.sessionsCount} Sesi
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Unit Rankings */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Kedudukan Prestasi Kehadiran Mengikut Unit
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {unitAttendanceRankings.map((u, idx) => (
                <div key={u.groupName} className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-slate-800 text-slate-300 font-mono text-xs flex items-center justify-center font-bold">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="text-xs font-bold text-white">{u.groupName}</div>
                      <div className="text-[10px] text-slate-400 capitalize">{u.category}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black font-mono text-emerald-400">{u.pct}%</div>
                    <div className="text-[9px] text-slate-500 font-mono">{u.present}/{u.total}</div>
                  </div>
                </div>
              ))}
              {unitAttendanceRankings.length === 0 && (
                <div className="col-span-full py-8 text-center text-slate-500 italic">
                  Belum ada sesi kehadiran direkodkan.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= PILLAR 4: PENCAPAIAN MURID ================= */}
      {activePillar === 'pencapaian' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-sm font-black text-white uppercase tracking-wider">
              Statistik Pencapaian Murid Mengikut Tahap
            </h3>
            <p className="text-[11px] text-slate-400">
              Pecahan anugerah dari Johan hingga Sijil Penyertaan. Klik kad untuk melihat senarai pemenang.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
            {PENCAPAIAN_TIERS.map(tier => {
              const stat = achievementsByTier[tier];
              return (
                <div
                  key={tier}
                  onClick={() => handleAchievementDrillDown(tier)}
                  className="bg-slate-950/70 border border-slate-800 hover:border-amber-500/60 rounded-2xl p-4 cursor-pointer transition-all hover:scale-105 group text-center"
                >
                  <Trophy className="w-5 h-5 mx-auto mb-1 text-amber-400" />
                  <div className="text-xs font-bold text-slate-300 truncate">{tier}</div>
                  <div className="text-2xl font-black text-white mt-1 group-hover:text-amber-400 font-mono">
                    {stat.count}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= DRILL-DOWN MODAL ================= */}
      {modalData && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-black text-white">{modalData.title}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{modalData.subtitle}</p>
              </div>
              <button
                onClick={() => setModalData(null)}
                className="p-1 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {modalData.items.map(item => (
                <div key={item.id} className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white line-clamp-1">{item.title}</span>
                    {item.badge && (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase shrink-0 ${item.badgeColor || 'bg-slate-800 text-slate-300'}`}>
                        {item.badge}
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-2 font-mono">
                    {item.date && <span>📅 {item.date}</span>}
                    {item.level && <span>· 📍 Peringkat: {item.level}</span>}
                  </div>

                  {item.role && (
                    <div className="text-[11px] text-indigo-300 font-semibold">
                      Peranan: {item.role}
                    </div>
                  )}

                  {item.details && (
                    <div className="text-[11px] text-slate-300">
                      {item.details}
                    </div>
                  )}
                </div>
              ))}

              {modalData.items.length === 0 && (
                <div className="py-8 text-center text-slate-500 italic text-xs">
                  Tiada rekod terperinci dijumpai.
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setModalData(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
