import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, Plus, Trash2, Search, Filter, Check, 
  Settings, Award, Sparkles, BookOpen, Heart, 
  ChevronRight, FileSpreadsheet, Download, RefreshCw, X,
  Shield, UserCheck, Crown, Printer
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { 
  collection, getDocs, doc, 
  setDoc, deleteDoc, updateDoc,
  onSnapshot
} from 'firebase/firestore';
import { Student, UserProfile } from '../../types';
import { 
  KokoGroup, 
  KokoMembership, 
  TeacherCommitteeRole, 
  StudentCommitteeRole 
} from '../../types/kokurikulum';
import * as XLSX from 'xlsx';
import { useSchoolTenant } from '../../contexts/SchoolTenantContext';
import { belongsToSchool, scopedDocId } from '../../utils/schoolTenant';

interface Props {
  profile: UserProfile;
  role: 'pentadbir' | 'guru' | 'laporan';
}

const DEFAULT_UNIFORMS = ['TKRS', 'Pengakap Kanak-Kanak', 'Bulan Sabit Merah Malaysia (BSMM)'];
const DEFAULT_CLUBS = ['Kelab STEM & Robotik', 'Kelab Bahasa & Budaya', 'Kelab PALS (Pecinta Alam)', 'Kelab SPBT & Perpustakaan', 'Kelab Seni Kreatif'];
const DEFAULT_SPORTS = ['Bola Tampar', 'Bola Keranjang', 'Badminton', 'Olahraga & Merentas Desa', 'Catur & Permainan Tradisional', 'Wushu'];

export default function KokoCommitteeManager({ profile, role }: Props) {
  const { schoolCode: activeSchoolCode } = useSchoolTenant();
  const [activeTab, setActiveTab] = useState<'committee' | 'members' | 'groups'>('committee');
  const [selectedCategory, setSelectedCategory] = useState<'uniform' | 'club' | 'sport'>('uniform');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  
  // Data lists
  const [groups, setGroups] = useState<KokoGroup[]>([]);
  const [memberships, setMemberships] = useState<KokoMembership[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);
  const [committees, setCommittees] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  // Modal / Form states
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [showAssignTeacherModal, setShowAssignTeacherModal] = useState(false);
  const [selectedTeacherRole, setSelectedTeacherRole] = useState<TeacherCommitteeRole>('Guru Penasihat');
  const [selectedTeacherName, setSelectedTeacherName] = useState('');

  // Student Committee Assignment Modal
  const [showAssignStudentModal, setShowAssignStudentModal] = useState(false);
  const [assignStudentId, setAssignStudentId] = useState('');
  const [assignStudentRole, setAssignStudentRole] = useState<StudentCommitteeRole>('AJK');
  const [assignStudentSubRole, setAssignStudentSubRole] = useState('');

  // Search & Filter for members
  const [memberSearch, setMemberSearch] = useState('');
  const [filterClass, setFilterClass] = useState('semua');

  const canEdit = role === 'pentadbir' || role === 'guru';

  // Load Firestore live data
  useEffect(() => {
    setLoading(true);
    const unsubs: (() => void)[] = [];

    // Groups
    unsubs.push(
      onSnapshot(collection(db, 'koko_groups'), (snap) => {
        const list = snap.docs
          .filter(d => belongsToSchool(d.data(), activeSchoolCode))
          .map(d => ({ id: d.id, ...d.data() } as KokoGroup));
        setGroups(list);
      })
    );

    // Memberships
    unsubs.push(
      onSnapshot(collection(db, 'koko_memberships'), (snap) => {
        const list = snap.docs
          .filter(d => belongsToSchool(d.data(), activeSchoolCode))
          .map(d => ({ id: d.id, ...d.data() } as KokoMembership));
        setMemberships(list);
      })
    );

    // Students
    unsubs.push(
      onSnapshot(collection(db, 'students'), (snap) => {
        const list = snap.docs
          .filter(d => belongsToSchool(d.data(), activeSchoolCode))
          .map(d => ({ id: d.id, ...d.data() } as Student));
        setStudents(list);
      })
    );

    // Committees
    unsubs.push(
      onSnapshot(collection(db, 'koko_committees'), (snap) => {
        const map: Record<string, any> = {};
        snap.docs
          .filter(d => belongsToSchool(d.data(), activeSchoolCode))
          .forEach(d => {
            map[d.id] = d.data();
          });
        setCommittees(map);
      })
    );

    // Fetch Teachers from personnel / teachers
    async function fetchPersonnel() {
      try {
        const pSnap = await getDocs(collection(db, 'personnel'));
        const scopedP = pSnap.docs.filter(d => belongsToSchool(d.data(), activeSchoolCode));
        if (scopedP.length > 0) {
          const list = scopedP.map(d => ({
            id: d.id,
            name: (d.data().name || d.data().nama || '').toUpperCase()
          })).filter(t => t.name.length > 0);
          setTeachers(list);
        } else {
          const tSnap = await getDocs(collection(db, 'teachers'));
          const scopedT = tSnap.docs.filter(d => belongsToSchool(d.data(), activeSchoolCode));
          if (scopedT.length > 0) {
            const list = scopedT.map(d => ({
              id: d.id,
              name: (d.data().name || '').toUpperCase()
            })).filter(t => t.name.length > 0);
            setTeachers(list);
          } else {
            const uSnap = await getDocs(collection(db, 'users'));
            const list = uSnap.docs
              .filter(d => belongsToSchool(d.data(), activeSchoolCode))
              .map(d => ({
                id: d.id,
                name: (d.data().name || '').toUpperCase()
              }))
              .filter(t => t.name.length > 0);
            setTeachers(list);
          }
        }
      } catch (err) {
        console.warn('Personnel load error:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchPersonnel();

    return () => {
      unsubs.forEach(u => u());
    };
  }, [activeSchoolCode]);

  // Filter groups by current category
  const categoryGroups = useMemo(() => {
    return groups.filter(g => g.category === selectedCategory);
  }, [groups, selectedCategory]);

  // Set default group if not set
  useEffect(() => {
    if (categoryGroups.length > 0) {
      const exists = categoryGroups.some(g => g.id === selectedGroupId || g.name === selectedGroupId);
      if (!exists) {
        setSelectedGroupId(categoryGroups[0].id || categoryGroups[0].name);
      }
    } else {
      setSelectedGroupId('');
    }
  }, [categoryGroups, selectedGroupId]);

  const currentGroup = useMemo(() => {
    return groups.find(g => g.id === selectedGroupId || g.name === selectedGroupId);
  }, [groups, selectedGroupId]);

  // Current committee record for this group
  const currentCommitteeData = useMemo(() => {
    if (!selectedGroupId) return null;
    const scopedId = scopedDocId(activeSchoolCode, selectedGroupId);
    const scopedName = currentGroup?.name ? scopedDocId(activeSchoolCode, currentGroup.name) : '';
    return committees[scopedId] || committees[selectedGroupId] || (scopedName ? committees[scopedName] : null) || committees[currentGroup?.name || ''] || {
      ketuaGuruPenasihat: '',
      guruPenasihat: [],
      pengerusi: null,
      naibPengerusi: null,
      setiausaha: null,
      penolongSetiausaha: null,
      bendahari: null,
      penolongBendahari: null,
      ajkList: []
    };
  }, [committees, selectedGroupId, currentGroup, activeSchoolCode]);

  // Members enrolled in current group
  const groupMembers = useMemo(() => {
    if (!currentGroup) return [];
    return memberships.filter(m => {
      if (currentGroup.category === 'uniform') {
        return m.uniform?.toLowerCase().trim() === currentGroup.name.toLowerCase().trim();
      }
      if (currentGroup.category === 'club') {
        return m.club?.toLowerCase().trim() === currentGroup.name.toLowerCase().trim();
      }
      if (currentGroup.category === 'sport') {
        return m.sport?.toLowerCase().trim() === currentGroup.name.toLowerCase().trim();
      }
      return false;
    });
  }, [memberships, currentGroup]);

  // Filtered members for table
  const filteredGroupMembers = useMemo(() => {
    return groupMembers.filter(m => {
      const matchSearch = (m.name || '').toLowerCase().includes(memberSearch.toLowerCase()) ||
                          (m.student_id || '').toLowerCase().includes(memberSearch.toLowerCase());
      if (!matchSearch) return false;
      if (filterClass !== 'semua' && (m.class || '').toLowerCase() !== filterClass.toLowerCase()) {
        return false;
      }
      return true;
    });
  }, [groupMembers, memberSearch, filterClass]);

  // Unique classes for filter
  const uniqueClasses = useMemo(() => {
    const set = new Set<string>();
    groupMembers.forEach(m => {
      if (m.class) set.add(m.class);
    });
    return Array.from(set).sort();
  }, [groupMembers]);

  // Teacher committee actions
  const handleAssignTeacher = async () => {
    if (!currentGroup || !selectedTeacherName) return;
    const rawGroupId = currentGroup.id || currentGroup.name;
    const docId = scopedDocId(activeSchoolCode, rawGroupId);
    const data = { ...currentCommitteeData };

    if (selectedTeacherRole === 'Ketua Guru Penasihat') {
      data.ketuaGuruPenasihat = selectedTeacherName;
    } else {
      const currentList: string[] = Array.isArray(data.guruPenasihat) ? data.guruPenasihat : [];
      if (!currentList.includes(selectedTeacherName)) {
        data.guruPenasihat = [...currentList, selectedTeacherName];
      }
    }

    try {
      await setDoc(doc(db, 'koko_committees', docId), {
        ...data,
        schoolCode: activeSchoolCode,
        groupId: rawGroupId,
        groupName: currentGroup.name,
        category: currentGroup.category,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      setShowAssignTeacherModal(false);
      setSelectedTeacherName('');
    } catch (err) {
      console.error('Error saving teacher committee:', err);
    }
  };

  const handleRemoveTeacher = async (name: string, roleType: 'ketua' | 'penasihat') => {
    if (!currentGroup) return;
    const docId = scopedDocId(activeSchoolCode, currentGroup.id || currentGroup.name);
    const data = { ...currentCommitteeData };

    if (roleType === 'ketua') {
      data.ketuaGuruPenasihat = '';
    } else {
      data.guruPenasihat = (data.guruPenasihat || []).filter((n: string) => n !== name);
    }

    try {
      await setDoc(doc(db, 'koko_committees', docId), {
        ...data,
        schoolCode: activeSchoolCode,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      console.error('Error removing teacher:', err);
    }
  };

  // Student committee actions
  const handleAssignStudentRole = async () => {
    if (!currentGroup || !assignStudentId) return;
    const rawGroupId = currentGroup.id || currentGroup.name;
    const docId = scopedDocId(activeSchoolCode, rawGroupId);
    const member = groupMembers.find(m => m.student_id === assignStudentId);
    if (!member) return;

    const studentObj = {
      studentId: member.student_id,
      name: member.name || '',
      class: member.class || '',
      role: assignStudentRole,
      subRole: assignStudentSubRole
    };

    const data = { ...currentCommitteeData };

    if (assignStudentRole === 'Pengerusi') data.pengerusi = studentObj;
    else if (assignStudentRole === 'Naib Pengerusi') data.naibPengerusi = studentObj;
    else if (assignStudentRole === 'Setiausaha') data.setiausaha = studentObj;
    else if (assignStudentRole === 'Penolong Setiausaha') data.penolongSetiausaha = studentObj;
    else if (assignStudentRole === 'Bendahari') data.bendahari = studentObj;
    else if (assignStudentRole === 'Penolong Bendahari') data.penolongBendahari = studentObj;
    else if (assignStudentRole === 'AJK') {
      const list = Array.isArray(data.ajkList) ? data.ajkList : [];
      // Replace if existing, or add
      const filtered = list.filter((a: any) => a.studentId !== member.student_id);
      data.ajkList = [...filtered, studentObj];
    }

    try {
      await setDoc(doc(db, 'koko_committees', docId), {
        ...data,
        schoolCode: activeSchoolCode,
        groupId: rawGroupId,
        groupName: currentGroup.name,
        category: currentGroup.category,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // Update position in membership record if exists
      if (member.id) {
        await updateDoc(doc(db, 'koko_memberships', member.id), {
          position: assignStudentRole
        });
      }

      setShowAssignStudentModal(false);
      setAssignStudentId('');
      setAssignStudentSubRole('');
    } catch (err) {
      console.error('Error assigning student role:', err);
    }
  };

  const handleRemoveStudentRole = async (roleKey: string, studentId?: string) => {
    if (!currentGroup) return;
    const docId = scopedDocId(activeSchoolCode, currentGroup.id || currentGroup.name);
    const data = { ...currentCommitteeData };

    if (roleKey === 'ajk' && studentId) {
      data.ajkList = (data.ajkList || []).filter((a: any) => a.studentId !== studentId);
    } else {
      data[roleKey] = null;
    }

    try {
      await setDoc(doc(db, 'koko_committees', docId), {
        ...data,
        schoolCode: activeSchoolCode,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      console.error('Error removing student committee role:', err);
    }
  };

  // Add new group
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      await setDoc(doc(collection(db, 'koko_groups')), {
        name: newGroupName.trim(),
        category: selectedCategory,
        schoolCode: activeSchoolCode,
        createdAt: new Date().toISOString()
      });
      setNewGroupName('');
      setShowAddGroupModal(false);
    } catch (err) {
      console.error('Error creating group:', err);
    }
  };

  // Export membership to Excel
  const handleExportExcel = () => {
    if (!currentGroup) return;
    const rows = groupMembers.map((m, idx) => ({
      'Bil': idx + 1,
      'No. Pengenalan / ID': m.student_id,
      'Nama Murid': m.name,
      'Kelas': m.class,
      'Jantina': m.gender === 'P' ? 'Perempuan' : 'Lelaki',
      'Unit': currentGroup.name,
      'Kategori': currentGroup.category.toUpperCase(),
      'Jawatan': m.position || 'Ahli Biasa'
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, currentGroup.name.slice(0, 30));
    XLSX.writeFile(wb, `Senarai_Ahli_${currentGroup.name.replace(/\s+/g, '_')}_2026.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600/20 text-blue-400 rounded-2xl border border-blue-500/30">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Pengurusan Kokurikulum dan Jawatankuasa
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Penetapan Jawatankuasa Guru Penasihat & Barisan Pemimpin Murid (KPM Kokurikulum)
              </p>
            </div>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-800 shrink-0">
          <button
            onClick={() => setSelectedCategory('uniform')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              selectedCategory === 'uniform'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Unit Beruniform
          </button>
          <button
            onClick={() => setSelectedCategory('club')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              selectedCategory === 'club'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Kelab & Persatuan
          </button>
          <button
            onClick={() => setSelectedCategory('sport')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              selectedCategory === 'sport'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Sukan & Permainan
          </button>
        </div>
      </div>

      {/* Unit Selection Pills */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-400 mr-1 uppercase tracking-wider">Pilih Unit:</span>
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
          {categoryGroups.length === 0 && (
            <span className="text-xs text-slate-500 italic">Tiada unit didaftarkan dalam kategori ini.</span>
          )}
        </div>

        {canEdit && (
          <button
            onClick={() => setShowAddGroupModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Unit Baharu</span>
          </button>
        )}
      </div>

      {/* View Switcher: Committee vs Members vs Units */}
      <div className="flex border-b border-slate-800 space-x-6">
        <button
          onClick={() => setActiveTab('committee')}
          className={`pb-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'committee'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Crown className="w-4 h-4" />
          <span>Carta Jawatankuasa (Guru & Murid)</span>
        </button>
        <button
          onClick={() => setActiveTab('members')}
          className={`pb-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'members'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Senarai Ahli Berdaftar ({groupMembers.length})</span>
        </button>
      </div>

      {/* ================= TAB 1: COMMITTEE HIERARCHY ================= */}
      {activeTab === 'committee' && currentGroup && (
        <div className="space-y-6">
          {/* Action Bar */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span>Struktur Organisasi & Jawatankuasa:</span>
                <span className="text-blue-400">{currentGroup.name}</span>
              </h3>
              <p className="text-xs text-slate-400">
                Sesi Persekolahan 2026 · Mengikut Garis Panduan Kokurikulum KPM
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Carta</span>
              </button>
            </div>
          </div>

          {/* Section 1: Guru Penasihat */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-md">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-xl">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-white uppercase tracking-wider">
                    Jawatankuasa Guru Penasihat
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Bimbingan dan penyeliaan rasmi unit oleh guru sekolah
                  </p>
                </div>
              </div>

              {canEdit && (
                <button
                  onClick={() => setShowAssignTeacherModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Lantik Guru Penasihat</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Ketua Guru Penasihat Card */}
              <div className="bg-slate-950/70 border border-indigo-500/30 rounded-2xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400 bg-indigo-950/80 px-2.5 py-0.5 rounded-md border border-indigo-700/50">
                      Ketua Guru Penasihat
                    </span>
                    {canEdit && currentCommitteeData?.ketuaGuruPenasihat && (
                      <button
                        onClick={() => handleRemoveTeacher(currentCommitteeData.ketuaGuruPenasihat, 'ketua')}
                        className="text-slate-500 hover:text-rose-400 transition"
                        title="Buang Lantikan"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm font-bold text-white mt-2">
                    {currentCommitteeData?.ketuaGuruPenasihat || (
                      <span className="text-slate-500 italic font-normal">Belum Dilantik</span>
                    )}
                  </p>
                </div>
                <div className="text-[10px] text-slate-500 mt-3 pt-2 border-t border-slate-900">
                  Bertanggungjawab penuh bagi perancangan modul & laporan
                </div>
              </div>

              {/* Guru Penasihat List Cards */}
              <div className="md:col-span-2 bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-800 px-2.5 py-0.5 rounded-md">
                  Guru Penasihat Bersama ({currentCommitteeData?.guruPenasihat?.length || 0})
                </span>
                <div className="mt-3 flex flex-wrap gap-2">
                  {currentCommitteeData?.guruPenasihat && currentCommitteeData.guruPenasihat.length > 0 ? (
                    currentCommitteeData.guruPenasihat.map((tName: string) => (
                      <div
                        key={tName}
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-850 bg-slate-900 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200"
                      >
                        <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                        <span>{tName}</span>
                        {canEdit && (
                          <button
                            onClick={() => handleRemoveTeacher(tName, 'penasihat')}
                            className="text-slate-400 hover:text-rose-400 ml-1 transition"
                            title="Buang"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500 italic">Tiada guru penasihat tambahan dilantik.</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Jawatankuasa Murid */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-md">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-600/20 text-amber-400 rounded-xl">
                  <Crown className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-white uppercase tracking-wider">
                    Jawatankuasa Pemimpin Murid
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Dipilih semasa Mesyuarat Agung Tahunan unit (KPM Perjumpaan 1)
                  </p>
                </div>
              </div>

              {canEdit && (
                <button
                  onClick={() => setShowAssignStudentModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Lantik Jawatan Murid</span>
                </button>
              )}
            </div>

            {/* Core Leadership Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Pengerusi */}
              <div className="bg-slate-950/70 border border-amber-500/30 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-amber-400 bg-amber-950/70 px-2 py-0.5 rounded border border-amber-700/50">
                    Pengerusi
                  </span>
                  {canEdit && currentCommitteeData?.pengerusi && (
                    <button
                      onClick={() => handleRemoveStudentRole('pengerusi')}
                      className="text-slate-500 hover:text-rose-400 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="mt-2">
                  <p className="text-sm font-bold text-white">
                    {currentCommitteeData?.pengerusi?.name || <span className="text-slate-500 italic font-normal">Belum Dilantik</span>}
                  </p>
                  {currentCommitteeData?.pengerusi?.class && (
                    <p className="text-[11px] text-slate-400 mt-0.5">Kelas: {currentCommitteeData.pengerusi.class}</p>
                  )}
                </div>
              </div>

              {/* Naib Pengerusi */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
                    Naib Pengerusi
                  </span>
                  {canEdit && currentCommitteeData?.naibPengerusi && (
                    <button
                      onClick={() => handleRemoveStudentRole('naibPengerusi')}
                      className="text-slate-500 hover:text-rose-400 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="mt-2">
                  <p className="text-sm font-bold text-white">
                    {currentCommitteeData?.naibPengerusi?.name || <span className="text-slate-500 italic font-normal">Belum Dilantik</span>}
                  </p>
                  {currentCommitteeData?.naibPengerusi?.class && (
                    <p className="text-[11px] text-slate-400 mt-0.5">Kelas: {currentCommitteeData.naibPengerusi.class}</p>
                  )}
                </div>
              </div>

              {/* Setiausaha */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
                    Setiausaha
                  </span>
                  {canEdit && currentCommitteeData?.setiausaha && (
                    <button
                      onClick={() => handleRemoveStudentRole('setiausaha')}
                      className="text-slate-500 hover:text-rose-400 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="mt-2">
                  <p className="text-sm font-bold text-white">
                    {currentCommitteeData?.setiausaha?.name || <span className="text-slate-500 italic font-normal">Belum Dilantik</span>}
                  </p>
                  {currentCommitteeData?.setiausaha?.class && (
                    <p className="text-[11px] text-slate-400 mt-0.5">Kelas: {currentCommitteeData.setiausaha.class}</p>
                  )}
                </div>
              </div>

              {/* Penolong Setiausaha */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
                    Penolong Setiausaha
                  </span>
                  {canEdit && currentCommitteeData?.penolongSetiausaha && (
                    <button
                      onClick={() => handleRemoveStudentRole('penolongSetiausaha')}
                      className="text-slate-500 hover:text-rose-400 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="mt-2">
                  <p className="text-sm font-bold text-white">
                    {currentCommitteeData?.penolongSetiausaha?.name || <span className="text-slate-500 italic font-normal">Belum Dilantik</span>}
                  </p>
                  {currentCommitteeData?.penolongSetiausaha?.class && (
                    <p className="text-[11px] text-slate-400 mt-0.5">Kelas: {currentCommitteeData.penolongSetiausaha.class}</p>
                  )}
                </div>
              </div>

              {/* Bendahari */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
                    Bendahari
                  </span>
                  {canEdit && currentCommitteeData?.bendahari && (
                    <button
                      onClick={() => handleRemoveStudentRole('bendahari')}
                      className="text-slate-500 hover:text-rose-400 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="mt-2">
                  <p className="text-sm font-bold text-white">
                    {currentCommitteeData?.bendahari?.name || <span className="text-slate-500 italic font-normal">Belum Dilantik</span>}
                  </p>
                  {currentCommitteeData?.bendahari?.class && (
                    <p className="text-[11px] text-slate-400 mt-0.5">Kelas: {currentCommitteeData.bendahari.class}</p>
                  )}
                </div>
              </div>

              {/* Penolong Bendahari */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
                    Penolong Bendahari
                  </span>
                  {canEdit && currentCommitteeData?.penolongBendahari && (
                    <button
                      onClick={() => handleRemoveStudentRole('penolongBendahari')}
                      className="text-slate-500 hover:text-rose-400 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="mt-2">
                  <p className="text-sm font-bold text-white">
                    {currentCommitteeData?.penolongBendahari?.name || <span className="text-slate-500 italic font-normal">Belum Dilantik</span>}
                  </p>
                  {currentCommitteeData?.penolongBendahari?.class && (
                    <p className="text-[11px] text-slate-400 mt-0.5">Kelas: {currentCommitteeData.penolongBendahari.class}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Ahli Jawatankuasa (AJK) Section */}
            <div className="mt-6 pt-6 border-t border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-black text-slate-300 uppercase tracking-wider">
                  Ahli Jawatankuasa (AJK) & Wakil Kelas ({currentCommitteeData?.ajkList?.length || 0})
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {currentCommitteeData?.ajkList && currentCommitteeData.ajkList.length > 0 ? (
                  currentCommitteeData.ajkList.map((ajk: any) => (
                    <div
                      key={ajk.studentId}
                      className="bg-slate-950/50 border border-slate-800 rounded-xl p-3 flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 bg-blue-950 text-blue-300 rounded border border-blue-800/60">
                            {ajk.subRole || 'AJK'}
                          </span>
                          <span className="text-[10px] text-slate-400">{ajk.class}</span>
                        </div>
                        <p className="text-xs font-bold text-white mt-1">{ajk.name}</p>
                      </div>
                      {canEdit && (
                        <button
                          onClick={() => handleRemoveStudentRole('ajk', ajk.studentId)}
                          className="text-slate-500 hover:text-rose-400 transition"
                          title="Buang AJK"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="col-span-full py-4 text-center text-xs text-slate-500 italic">
                    Tiada AJK tambahan dilantik. Klik "Lantik Jawatan Murid" untuk menambah.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 2: ENROLLED MEMBERS ================= */}
      {activeTab === 'members' && currentGroup && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-lg font-bold text-white">
                Senarai Ahli Berdaftar: <span className="text-blue-400">{currentGroup.name}</span>
              </h3>
              <p className="text-xs text-slate-400">
                Jumlah {groupMembers.length} murid berdaftar dalam unit ini
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Eksport Excel</span>
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                placeholder="Cari nama murid atau ID..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={filterClass}
                onChange={e => setFilterClass(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-blue-500"
              >
                <option value="semua">Semua Kelas</option>
                {uniqueClasses.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-black tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Bil</th>
                  <th className="py-3 px-4">Nama Murid</th>
                  <th className="py-3 px-4">Kelas</th>
                  <th className="py-3 px-4">Jantina</th>
                  <th className="py-3 px-4">Jawatan Dalam Unit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredGroupMembers.map((m, idx) => (
                  <tr key={m.student_id || idx} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 font-mono text-slate-500">{idx + 1}</td>
                    <td className="py-3 px-4 font-bold text-white">{m.name}</td>
                    <td className="py-3 px-4 font-mono">{m.class}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        m.gender === 'P' ? 'bg-rose-950/80 text-rose-300' : 'bg-blue-950/80 text-blue-300'
                      }`}>
                        {m.gender === 'P' ? 'Perempuan' : 'Lelaki'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase ${
                        m.position && m.position !== 'Ahli Biasa'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800/80'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {m.position || 'Ahli Biasa'}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredGroupMembers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 italic">
                      Tiada ahli sepadan dengan carian.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= MODAL: ASSIGN TEACHER ================= */}
      {showAssignTeacherModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">Lantik Guru Penasihat</h3>
              <button onClick={() => setShowAssignTeacherModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase">Jawatan Guru</label>
              <select
                value={selectedTeacherRole}
                onChange={e => setSelectedTeacherRole(e.target.value as TeacherCommitteeRole)}
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value="Ketua Guru Penasihat">Ketua Guru Penasihat</option>
                <option value="Guru Penasihat">Guru Penasihat (Bersama)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase">Pilih Guru</label>
              <select
                value={selectedTeacherName}
                onChange={e => setSelectedTeacherName(e.target.value)}
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value="">-- Sila Pilih Guru --</option>
                {teachers.map(t => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAssignTeacherModal(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl"
              >
                Batal
              </button>
              <button
                onClick={handleAssignTeacher}
                disabled={!selectedTeacherName}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl"
              >
                Simpan Lantikan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: ASSIGN STUDENT ================= */}
      {showAssignStudentModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">Lantik Jawatan Pemimpin Murid</h3>
              <button onClick={() => setShowAssignStudentModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase">Jawatan Murid</label>
              <select
                value={assignStudentRole}
                onChange={e => setAssignStudentRole(e.target.value as StudentCommitteeRole)}
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value="Pengerusi">Pengerusi</option>
                <option value="Naib Pengerusi">Naib Pengerusi</option>
                <option value="Setiausaha">Setiausaha</option>
                <option value="Penolong Setiausaha">Penolong Setiausaha</option>
                <option value="Bendahari">Bendahari</option>
                <option value="Penolong Bendahari">Penolong Bendahari</option>
                <option value="AJK">AJK (Ahli Jawatankuasa)</option>
              </select>
            </div>

            {assignStudentRole === 'AJK' && (
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase">Pengkhususan AJK (Pilihan)</label>
                <input
                  type="text"
                  placeholder="cth: AJK Tahun 6 / AJK Peralatan / AJK Disiplin"
                  value={assignStudentSubRole}
                  onChange={e => setAssignStudentSubRole(e.target.value)}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
            )}

            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase">Pilih Murid (Daripada Senarai Ahli)</label>
              <select
                value={assignStudentId}
                onChange={e => setAssignStudentId(e.target.value)}
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value="">-- Sila Pilih Murid --</option>
                {groupMembers.map(m => (
                  <option key={m.student_id} value={m.student_id}>
                    {m.name} ({m.class || '-'})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAssignStudentModal(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl"
              >
                Batal
              </button>
              <button
                onClick={handleAssignStudentRole}
                disabled={!assignStudentId}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl"
              >
                Sahkan Jawatan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: CREATE UNIT ================= */}
      {showAddGroupModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">Tambah Unit Kokurikulum Baharu</h3>
              <button onClick={() => setShowAddGroupModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase">Kategori</label>
              <div className="text-xs font-bold text-blue-400 mt-1 capitalize">
                {selectedCategory === 'uniform' ? 'Unit Beruniform' : selectedCategory === 'club' ? 'Kelab & Persatuan' : 'Sukan & Permainan'}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase">Nama Unit</label>
              <input
                type="text"
                placeholder="cth: Pengakap Kanak-Kanak"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddGroupModal(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl"
              >
                Batal
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl"
              >
                Tambah
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
