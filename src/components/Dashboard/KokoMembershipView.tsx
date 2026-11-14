
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, Plus, Trash2, Search, Filter, Check, 
  Settings, Award, Sparkles, BookOpen, Heart, 
  HelpCircle, ChevronRight, FileSpreadsheet, Download, RefreshCw, X, Upload, Bookmark
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { 
  collection, getDocs, addDoc, doc, 
  setDoc, deleteDoc, updateDoc, query, where,
  onSnapshot
} from 'firebase/firestore';
import { Student, UserProfile } from '../../types';
import * as XLSX from 'xlsx';
import { useSchoolTenant } from '../../contexts/SchoolTenantContext';
import { belongsToSchool, scopedDocId } from '../../utils/schoolTenant';

interface Props {
  profile: UserProfile;
  role: 'pentadbir' | 'guru' | 'laporan';
}

interface KokoGroup {
  id?: string;
  name: string;
  category: 'uniform' | 'club' | 'sport';
}

interface KokoMembership {
  id?: string;
  student_id: string;
  name: string;
  class: string;
  gender: string;
  uniform: string;
  club: string;
  sport: string;
  academic_year: string;
}

const DEFAULT_UNIFORMS = ['TKRS', 'Pengakap', 'Bulan Sabit Merah'];
const DEFAULT_CLUBS = ['Stem', 'PALS', 'Kelab Bahasa', 'Kelab Tarian', 'Kelab SPBT', 'Kelab Perpustakaan'];
const DEFAULT_SPORTS = ['Bola Tampar', 'Bola Keranjang', 'Olahraga', 'Catur', 'Wushu'];

export default function KokoMembershipView({ profile, role }: Props) {
  const { schoolCode: activeSchoolCode, schoolName: tenantSchoolName } = useSchoolTenant();
  const [subTab, setSubTab] = useState<'overview' | 'groups' | 'enrollment' | 'import-excel' | 'committee'>('groups');
  const [students, setStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<KokoGroup[]>([]);
  const [memberships, setMemberships] = useState<KokoMembership[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [committees, setCommittees] = useState<Record<string, any>>({});
  const [settings, setSettings] = useState<any>({
    schoolLogo: '',
    kpmLogo: '',
    ts25Logo: '',
    schoolName: ''
  });
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<string | null>(null);

  // States for Jawatankuasa (Committee) Subtab
  const [selectedCommCategory, setSelectedCommCategory] = useState<'uniform' | 'club' | 'sport'>('uniform');
  const [selectedCommGroupId, setSelectedCommGroupId] = useState<string>('');
  const [showTeacherAssignModal, setShowTeacherAssignModal] = useState(false);

  // States for Excel / Image Import
  const [importType, setImportType] = useState<'image' | 'text'>('image');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [pastedText, setPastedText] = useState<string>('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string>('');
  const [parsingSuccess, setParsingSuccess] = useState(false);
  
  // Results of parsing
  const [parsedStudents, setParsedStudents] = useState<any[]>([]);
  const [parsedGroups, setParsedGroups] = useState<{
    uniforms: string[];
    clubs: string[];
    sports: string[];
  }>({ uniforms: [], clubs: [], sports: [] });
  
  // Selection states for parsed rows
  const [selectedParsedRowIds, setSelectedParsedRowIds] = useState<Record<string, boolean>>({});
  const [committing, setCommitting] = useState(false);
  const [commitStatus, setCommitStatus] = useState<string>('');

  // States for optional default groups selection
  const [showInitModal, setShowInitModal] = useState(false);
  const [selectedInitUniforms, setSelectedInitUniforms] = useState<string[]>(DEFAULT_UNIFORMS);
  const [selectedInitClubs, setSelectedInitClubs] = useState<string[]>(DEFAULT_CLUBS);
  const [selectedInitSports, setSelectedInitSports] = useState<string[]>(DEFAULT_SPORTS);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState('semua');
  const [selectedYear, setSelectedYear] = useState('semua');

  // New Group Form States
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupCat, setNewGroupCat] = useState<'uniform' | 'club' | 'sport'>('uniform');

  // Bulk enrollment state
  const [bulkCategory, setBulkCategory] = useState<'uniform' | 'club' | 'sport'>('uniform');
  const [bulkGroup, setBulkGroup] = useState('');
  const [bulkSearch, setBulkSearch] = useState('');
  const [bulkFilterYear, setBulkFilterYear] = useState<string>('4_5_6'); // Default to Year 4, 5, 6
  const [bulkFilterClass, setBulkFilterClass] = useState<string>('semua');

  // Admin upgrade states
  const [showAdminUpgradeModal, setShowAdminUpgradeModal] = useState(false);
  const [upgradePassword, setUpgradePassword] = useState('');
  const [upgradeError, setUpgradeError] = useState('');
  const [upgradeLoading, setUpgradeLoading] = useState(false);

  // New state variables for merging and teacher inputs
  const [overviewMode, setOverviewMode] = useState<'view' | 'edit'>('view');
  const [pastedTeachersText, setPastedTeachersText] = useState('');
  const [importingTeachers, setImportingTeachers] = useState(false);
  const [teacherImportMode, setTeacherImportMode] = useState<'student' | 'teacher'>('student');

  const canEdit = role === 'pentadbir' || role === 'guru';
  const academicYear = profile.academic_year || '2026';

  const classes = useMemo(() => {
    return Array.from(new Set(students.map(s => s.class)))
      .filter((c): c is string => {
        if (!c) return false;
        const normalized = String(c).trim().toLowerCase();
        return normalized !== 'tiada kelas' && normalized !== 'tiada' && normalized !== 'none';
      })
      .sort();
  }, [students]);

  const years = useMemo(() => {
    return Array.from(new Set(students.map(s => s.year))).filter(Boolean).sort();
  }, [students]);

  const uniqueClassCombinations = useMemo(() => {
    const combs: { year: number; className: string; label: string }[] = [];
    const seen = new Set<string>();
    
    const sortedStudents = [...students].sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return String(a.class).localeCompare(String(b.class));
    });

    sortedStudents.forEach(s => {
      if (s.year && s.class) {
        const key = `${s.year}_${s.class.toUpperCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          combs.push({
            year: Number(s.year),
            className: s.class,
            label: `${s.year} ${s.class.toUpperCase()}`
          });
        }
      }
    });
    return combs;
  }, [students]);

  const exportToExcel = () => {
    // Map students to their co-curricular groups
    const exportData = students.map((s, idx) => {
      const m = memberships.find(x => x.student_id === s.student_id);
      return {
        'BIL': idx + 1,
        'NO. ID MURID': s.student_id || '',
        'NAMA MURID': s.name || '',
        'TAHUN': s.year || '',
        'KELAS': s.class ? s.class.toUpperCase() : '',
        'JANTINA': s.gender || '',
        'BADAN BERUNIFORM': m?.uniform || 'TIDAK BERDAFTAR',
        'KELAB & PERSATUAN': m?.club || 'TIDAK BERDAFTAR',
        'SUKAN & PERMAINAN': m?.sport || 'TIDAK BERDAFTAR',
      };
    });

    const wb = XLSX.utils.book_new();

    // Sheet 1: Pendaftaran Keseluruhan
    const wsAll = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, wsAll, 'Pendaftaran Keseluruhan');

    // Sheet 2: Badan Beruniform
    const uniformData: any[] = [];
    students.forEach((s) => {
      const m = memberships.find(x => x.student_id === s.student_id);
      if (m?.uniform) {
        uniformData.push({
          'NAMA MURID': s.name,
          'TAHUN': s.year,
          'KELAS': s.class ? s.class.toUpperCase() : '',
          'JANTINA': s.gender,
          'BADAN BERUNIFORM': m.uniform
        });
      }
    });
    uniformData.sort((a, b) => a['BADAN BERUNIFORM'].localeCompare(b['BADAN BERUNIFORM']) || a['TAHUN'] - b['TAHUN']);
    const wsUniform = XLSX.utils.json_to_sheet(uniformData);
    XLSX.utils.book_append_sheet(wb, wsUniform, 'Badan Beruniform');

    // Sheet 3: Kelab & Persatuan
    const clubData: any[] = [];
    students.forEach((s) => {
      const m = memberships.find(x => x.student_id === s.student_id);
      if (m?.club) {
        clubData.push({
          'NAMA MURID': s.name,
          'TAHUN': s.year,
          'KELAS': s.class ? s.class.toUpperCase() : '',
          'JANTINA': s.gender,
          'KELAB & PERSATUAN': m.club
        });
      }
    });
    clubData.sort((a, b) => a['KELAB & PERSATUAN'].localeCompare(b['KELAB & PERSATUAN']) || a['TAHUN'] - b['TAHUN']);
    const wsClub = XLSX.utils.json_to_sheet(clubData);
    XLSX.utils.book_append_sheet(wb, wsClub, 'Kelab & Persatuan');

    // Sheet 4: Sukan & Permainan
    const sportData: any[] = [];
    students.forEach((s) => {
      const m = memberships.find(x => x.student_id === s.student_id);
      if (m?.sport) {
        sportData.push({
          'NAMA MURID': s.name,
          'TAHUN': s.year,
          'KELAS': s.class ? s.class.toUpperCase() : '',
          'JANTINA': s.gender,
          'SUKAN & PERMAINAN': m.sport
        });
      }
    });
    sportData.sort((a, b) => a['SUKAN & PERMAINAN'].localeCompare(b['SUKAN & PERMAINAN']) || a['TAHUN'] - b['TAHUN']);
    const wsSport = XLSX.utils.json_to_sheet(sportData);
    XLSX.utils.book_append_sheet(wb, wsSport, 'Sukan & Permainan');

    XLSX.writeFile(wb, `Pendaftaran_Kokurikulum_${academicYear}.xlsx`);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Students
      const studentSnap = await getDocs(collection(db, 'students'));
      const studentList = studentSnap.docs
        .filter(d => belongsToSchool(d.data(), activeSchoolCode))
        .map(d => {
          const data = d.data();
          let sClass = data.class ? String(data.class).trim() : '';
          const norm = sClass.toLowerCase();
          if (!sClass || norm === 'tiada' || norm === 'tiada kelas' || norm === 'none') {
            sClass = 'Amanah';
          }
          return {
            id: d.id,
            ...data,
            class: sClass
          };
        }) as Student[];
      setStudents(studentList);

      // 2. Fetch Groups
      const groupSnap = await getDocs(collection(db, 'koko_groups'));
      const groupList = groupSnap.docs
        .filter(d => belongsToSchool(d.data(), activeSchoolCode))
        .map(d => ({
          id: d.id,
          ...d.data()
        })) as KokoGroup[];
      
      setGroups(groupList);

      // 3. Fetch Memberships
      const membershipSnap = await getDocs(collection(db, 'koko_memberships'));
      const membershipList = membershipSnap.docs
        .filter(d => belongsToSchool(d.data(), activeSchoolCode))
        .map(d => {
          const data = d.data();
          let mClass = data.class ? String(data.class).trim() : '';
          const norm = mClass.toLowerCase();
          if (!mClass || norm === 'tiada' || norm === 'tiada kelas' || norm === 'none') {
            mClass = 'Amanah';
          }
          return {
            id: d.id,
            ...data,
            class: mClass
          };
        }) as KokoMembership[];
      setMemberships(membershipList);

      // 4. Fetch Teachers
      const teacherSnap = await getDocs(collection(db, 'teachers'));
      const teacherList = teacherSnap.docs
        .filter(d => belongsToSchool(d.data(), activeSchoolCode))
        .map(d => ({
          id: d.id,
          ...d.data()
        }));
      setTeachers(teacherList);

      // 5. Fetch Committees
      const committeeSnap = await getDocs(collection(db, 'koko_committees'));
      const committeeMap: Record<string, any> = {};
      committeeSnap.docs
        .filter(d => belongsToSchool(d.data(), activeSchoolCode))
        .forEach(d => {
          committeeMap[d.id] = d.data();
        });
      setCommittees(committeeMap);

      // 6. Fetch Settings
      const settingsDocId = scopedDocId(activeSchoolCode, 'global');
      const settingsSnap = await getDocs(collection(db, 'koko_settings'));
      if (!settingsSnap.empty) {
        const globalDoc = settingsSnap.docs.find(d => d.id === settingsDocId);
        if (globalDoc) {
          setSettings(globalDoc.data());
        } else {
          setSettings({ schoolLogo: '', kpmLogo: '', ts25Logo: '', schoolName: '' });
        }
      }

    } catch (err) {
      console.error("Error loading membership/group data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeSchoolCode]);

  useEffect(() => {
    const settingsDocId = scopedDocId(activeSchoolCode, 'global');
    const unsub = onSnapshot(doc(db, 'koko_settings', settingsDocId), (docSnap) => {
      if (docSnap.exists()) {
        setSettings(docSnap.data());
      } else {
        setSettings({ schoolLogo: '', kpmLogo: '', ts25Logo: '', schoolName: '' });
      }
    });
    return () => unsub();
  }, [activeSchoolCode]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleStartParse = async () => {
    setParsing(true);
    setParseError('');
    setParsingSuccess(false);
    try {
      let payload: any = {};
      
      if (importType === 'image') {
        if (!imagePreview) {
          throw new Error("Sila pilih atau seret gambar jadual Excel terlebih dahulu.");
        }
        const base64Data = imagePreview.split(',')[1];
        const mimeType = imageFile?.type || "image/png";
        payload = { image: { base64Data, mimeType } };
      } else {
        if (!pastedText.trim()) {
          throw new Error("Sila tampalkan teks rekod dari Excel terlebih dahulu.");
        }
        payload = { text: pastedText };
      }
      
      const response = await fetch('/api/parse-excel-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      const data = await response.json();
      
      if (response.status !== 200) {
        throw new Error(data.error || "Gagal memproses maklumat.");
      }
      
      if (!data.students || !Array.isArray(data.students)) {
        throw new Error("Format data yang dipulangkan tidak sah atau tidak lengkap.");
      }
      
      const mapped = data.students.map((s: any, idx: number) => ({
        ...s,
        tempId: s.student_id ? String(s.student_id).trim() : `temp_${idx}_${Date.now()}`
      }));
      
      setParsedStudents(mapped);
      setParsedGroups(data.detected_groups || { uniforms: [], clubs: [], sports: [] });
      
      const initialSels: Record<string, boolean> = {};
      mapped.forEach((s: any) => {
        initialSels[s.tempId] = true;
      });
      setSelectedParsedRowIds(initialSels);
      setParsingSuccess(true);
      
    } catch (err: any) {
      console.error("Error parsing with Gemini:", err);
      setParseError(err.message || "Gagal memproses data dengan kecerdasan buatan (Gemini). Hubungi admin.");
    } finally {
      setParsing(false);
    }
  };

  const handleCommitImport = async () => {
    setCommitting(true);
    setCommitStatus('Menyediakan kumpulan baru...');
    try {
      const activeParsed = parsedStudents.filter(s => selectedParsedRowIds[s.tempId]);
      if (activeParsed.length === 0) {
        throw new Error("Tiada murid dipilih untuk diimport.");
      }
      
      const existingGroupNames = new Set(groups.map(g => g.name.toLowerCase().trim()));
      
      const newUniforms = parsedGroups.uniforms?.filter(n => n && !existingGroupNames.has(n.toLowerCase().trim())) || [];
      const newClubs = parsedGroups.clubs?.filter(n => n && !existingGroupNames.has(n.toLowerCase().trim())) || [];
      const newSports = parsedGroups.sports?.filter(n => n && !existingGroupNames.has(n.toLowerCase().trim())) || [];
      
      const groupPromises: Promise<any>[] = [];
      newUniforms.forEach(name => {
        groupPromises.push(addDoc(collection(db, 'koko_groups'), { name: name.trim(), category: 'uniform', schoolCode: activeSchoolCode }));
      });
      newClubs.forEach(name => {
        groupPromises.push(addDoc(collection(db, 'koko_groups'), { name: name.trim(), category: 'club', schoolCode: activeSchoolCode }));
      });
      newSports.forEach(name => {
        groupPromises.push(addDoc(collection(db, 'koko_groups'), { name: name.trim(), category: 'sport', schoolCode: activeSchoolCode }));
      });
      
      if (groupPromises.length > 0) {
        setCommitStatus(`Mendaftarkan ${groupPromises.length} kelab & persatuan baru...`);
        await Promise.all(groupPromises);
      }
      
      setCommitStatus('Menyemak database murid...');
      const existingStudentIdMap = new Map<string, Student>(students.map(s => [String(s.student_id).toLowerCase().trim(), s]));
      const existingStudentNameMap = new Map<string, Student>(students.map(s => [String(s.name).toLowerCase().trim(), s]));
      
      const studentPromises: Promise<any>[] = [];
      
      for (const pStud of activeParsed) {
        const idLower = pStud.student_id ? String(pStud.student_id).toLowerCase().trim() : '';
        const nameLower = String(pStud.name).toLowerCase().trim();
        
        let existingStudent = (idLower && existingStudentIdMap.get(idLower)) || existingStudentNameMap.get(nameLower);
        
        let finalId = existingStudent?.student_id || pStud.student_id || `S_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        
        let rawClass = pStud.class ? String(pStud.class).trim() : '';
        const norm = rawClass.toLowerCase();
        if (!rawClass || norm === 'tiada' || norm === 'tiada kelas' || norm === 'none') {
          rawClass = 'Amanah';
        }

        let rawYear = 4;
        if (pStud.year) {
          rawYear = parseInt(pStud.year) || 4;
        } else if (pStud.class) {
          const match = String(pStud.class).match(/\d+/);
          if (match) {
            rawYear = parseInt(match[0]) || 4;
          }
        }

        if (!existingStudent) {
          const newStudentData = {
            student_id: finalId,
            name: pStud.name.toUpperCase().trim(),
            class: rawClass,
            gender: pStud.gender || 'L',
            year: rawYear,
            academic_year: academicYear,
            schoolCode: activeSchoolCode
          };
          studentPromises.push(addDoc(collection(db, 'students'), newStudentData));
        }
        
        const membershipModel = {
          student_id: finalId,
          name: pStud.name.toUpperCase().trim(),
          class: rawClass,
          gender: pStud.gender || 'L',
          uniform: pStud.uniform || '',
          club: pStud.club || '',
          sport: pStud.sport || '',
          academic_year: academicYear,
          schoolCode: activeSchoolCode
        };
        
        studentPromises.push(setDoc(doc(db, 'koko_memberships', scopedDocId(activeSchoolCode, finalId)), membershipModel));
      }
      
      setCommitStatus(`Mengimport ${activeParsed.length} pendaftaran murid...`);
      await Promise.all(studentPromises);
      
      await loadData();
      alert(`Berjaya mendaftarkan ${activeParsed.length} murid ke Unit Kokurikulum!`);
      
      setImageFile(null);
      setImagePreview('');
      setPastedText('');
      setParsingSuccess(false);
      setParsedStudents([]);
      setParsedGroups({ uniforms: [], clubs: [], sports: [] });
      setSubTab('overview');
    } catch (err: any) {
      console.error("Error committing import:", err);
      alert("Gagal mengimport data: " + err.message);
    } finally {
      setCommitting(false);
      setCommitStatus('');
    }
  };

  const handleImportTeachers = async () => {
    if (!pastedTeachersText.trim()) {
      alert("Sila masukkan senarai nama guru.");
      return;
    }
    setImportingTeachers(true);
    try {
      const names = pastedTeachersText
        .split('\n')
        .map(n => n.trim())
        .filter(n => n.length > 0);

      if (names.length === 0) {
        throw new Error("Tiada nama guru ditemui.");
      }

      const promises = names.map(async (name) => {
        const uppercaseName = name.toUpperCase();
        // Check uniqueness to avoid duplicates
        const exists = teachers.some(t => t.name.toUpperCase() === uppercaseName);
        if (!exists) {
          return addDoc(collection(db, 'teachers'), {
            name: uppercaseName,
            email: `${uppercaseName.toLowerCase().replace(/[^a-z0-9]/g, '')}@moe-dl.edu.my`,
            ic: '-',
            schoolCode: activeSchoolCode
          });
        }
      });

      await Promise.all(promises);
      await loadData();
      alert(`Berjaya mendaftarkan ${names.length} orang guru!`);
      setPastedTeachersText('');
    } catch (err: any) {
      console.error("Error importing teachers:", err);
      alert("Gagal mendaftarkan guru: " + err.message);
    } finally {
      setImportingTeachers(false);
    }
  };

  // Initialize selected default groups
  const initializeDefaultGroups = async () => {
    setInitializing(true);
    try {
      const promises: any[] = [];
      const existingNames = new Set(groups.map(g => g.name.toLowerCase().trim()));

      // 1. Create newly checked ones
      selectedInitUniforms.forEach(name => {
        const cleanName = name.trim();
        if (!existingNames.has(cleanName.toLowerCase())) {
          promises.push(addDoc(collection(db, 'koko_groups'), { name: cleanName, category: 'uniform', schoolCode: activeSchoolCode }));
        }
      });

      selectedInitClubs.forEach(name => {
        const cleanName = name.trim();
        if (!existingNames.has(cleanName.toLowerCase())) {
          promises.push(addDoc(collection(db, 'koko_groups'), { name: cleanName, category: 'club', schoolCode: activeSchoolCode }));
        }
      });

      selectedInitSports.forEach(name => {
        const cleanName = name.trim();
        if (!existingNames.has(cleanName.toLowerCase())) {
          promises.push(addDoc(collection(db, 'koko_groups'), { name: cleanName, category: 'sport', schoolCode: activeSchoolCode }));
        }
      });

      // 2. Identify and delete unchecked ones that are part of default list
      const selectedUniformsLower = new Set(selectedInitUniforms.map(x => x.toLowerCase().trim()));
      const selectedClubsLower = new Set(selectedInitClubs.map(x => x.toLowerCase().trim()));
      const selectedSportsLower = new Set(selectedInitSports.map(x => x.toLowerCase().trim()));

      groups.forEach(g => {
        const gNameLower = g.name.toLowerCase().trim();
        if (g.category === 'uniform') {
          const isDefaultUniform = DEFAULT_UNIFORMS.map(x => x.toLowerCase().trim()).includes(gNameLower);
          if (isDefaultUniform && !selectedUniformsLower.has(gNameLower)) {
            promises.push(deleteDoc(doc(db, 'koko_groups', g.id!)));
          }
        } else if (g.category === 'club') {
          const isDefaultClub = DEFAULT_CLUBS.map(x => x.toLowerCase().trim()).includes(gNameLower);
          if (isDefaultClub && !selectedClubsLower.has(gNameLower)) {
            promises.push(deleteDoc(doc(db, 'koko_groups', g.id!)));
          }
        } else if (g.category === 'sport') {
          const isDefaultSport = DEFAULT_SPORTS.map(x => x.toLowerCase().trim()).includes(gNameLower);
          if (isDefaultSport && !selectedSportsLower.has(gNameLower)) {
            promises.push(deleteDoc(doc(db, 'koko_groups', g.id!)));
          }
        }
      });

      if (promises.length > 0) {
        await Promise.all(promises);
      }
      await loadData();
      setShowInitModal(false);
    } catch (err) {
      console.error("Failed to initialize groups:", err);
    } finally {
      setInitializing(false);
    }
  };

  // Add Group
  const handleAddGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    try {
      await addDoc(collection(db, 'koko_groups'), {
        name: newGroupName.trim(),
        category: newGroupCat,
        schoolCode: activeSchoolCode
      });
      setNewGroupName('');
      await loadData();
    } catch (err) {
      console.error("Gagal menambah kumpulan:", err);
    }
  };

  // Delete Group
  const handleDeleteGroup = async (groupId: string) => {
    try {
      await deleteDoc(doc(db, 'koko_groups', groupId));
      await loadData();
    } catch (err) {
      console.error("Gagal memadam kumpulan:", err);
    }
  };

  // Assign Student to Co-curricular groups (Single update)
  const handleSingleAssign = async (student: Student, field: 'uniform' | 'club' | 'sport', val: string) => {
    const existingMember = memberships.find(m => m.student_id === student.student_id);
    const updatedModel = existingMember 
      ? { ...existingMember, [field]: val, schoolCode: activeSchoolCode }
      : {
          student_id: student.student_id,
          name: student.name,
          class: student.class,
          gender: student.gender || 'L',
          uniform: field === 'uniform' ? val : '',
          club: field === 'club' ? val : '',
          sport: field === 'sport' ? val : '',
          academic_year: academicYear,
          schoolCode: activeSchoolCode
        };

    try {
      const targetDocId = existingMember?.id || scopedDocId(activeSchoolCode, student.student_id);
      await setDoc(doc(db, 'koko_memberships', targetDocId), updatedModel);
      
      // Update local state instanly
      setMemberships(prev => {
        const index = prev.findIndex(m => m.student_id === student.student_id);
        if (index > -1) {
          const newM = [...prev];
          newM[index] = updatedModel;
          return newM;
        } else {
          return [...prev, updatedModel];
        }
      });
    } catch (err) {
      console.error("Gagal mendaftarkan murid:", err);
    }
  };

  // Bulk Toggle membership of student in a selected category's group
  const handleBulkToggle = async (student: Student, isMember: boolean) => {
    if (!bulkGroup) return;
    const valueToSet = isMember ? bulkGroup : '';
    await handleSingleAssign(student, bulkCategory, valueToSet);
  };

  // Filtered lists
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          s.student_id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchClass = selectedClass === 'semua' || s.class === selectedClass;
      const matchYear = selectedYear === 'semua' || s.year === Number(selectedYear);
      return matchSearch && matchClass && matchYear;
    }).sort((a, b) => {
      const yearA = Number(a.year) || 0;
      const yearB = Number(b.year) || 0;
      if (yearA !== yearB) return yearA - yearB;
      
      const classComp = (a.class || 'Amanah').trim().localeCompare((b.class || 'Amanah').trim(), undefined, { numeric: true, sensitivity: 'base' });
      if (classComp !== 0) return classComp;
      
      return a.name.trim().localeCompare(b.name.trim());
    });
  }, [students, searchQuery, selectedClass, selectedYear]);

  // Group membership lists
  const uniformGroupsList = useMemo(() => groups.filter(g => g.category === 'uniform').map(g => g.name), [groups]);
  const clubGroupsList = useMemo(() => groups.filter(g => g.category === 'club').map(g => g.name), [groups]);
  const sportGroupsList = useMemo(() => groups.filter(g => g.category === 'sport').map(g => g.name), [groups]);

  // Fast mapping of student ID to full student details for sorting / lookup
  const studentsMap = useMemo(() => {
    const map = new Map<string, Student>();
    students.forEach(s => {
      if (s.student_id) {
        map.set(s.student_id.trim().toLowerCase(), s);
      }
    });
    return map;
  }, [students]);

  // Grouped members to display in Excel sheet style
  const membersByGroup = useMemo(() => {
    const map: Record<string, KokoMembership[]> = {};
    memberships.forEach(m => {
      // populate uniform
      const activeUniform = m.uniform && uniformGroupsList.some(x => x.toLowerCase().trim() === m.uniform.toLowerCase().trim())
        ? uniformGroupsList.find(x => x.toLowerCase().trim() === m.uniform.toLowerCase().trim()) || m.uniform
        : '';
      if (activeUniform) {
        if (!map[activeUniform]) map[activeUniform] = [];
        if (!map[activeUniform].find(x => x.student_id === m.student_id)) map[activeUniform].push(m);
      }
      
      // populate club
      const activeClub = m.club && clubGroupsList.some(x => x.toLowerCase().trim() === m.club.toLowerCase().trim())
        ? clubGroupsList.find(x => x.toLowerCase().trim() === m.club.toLowerCase().trim()) || m.club
        : '';
      if (activeClub) {
        if (!map[activeClub]) map[activeClub] = [];
        if (!map[activeClub].find(x => x.student_id === m.student_id)) map[activeClub].push(m);
      }
      
      // populate sport
      const activeSport = m.sport && sportGroupsList.some(x => x.toLowerCase().trim() === m.sport.toLowerCase().trim())
        ? sportGroupsList.find(x => x.toLowerCase().trim() === m.sport.toLowerCase().trim()) || m.sport
        : '';
      if (activeSport) {
        if (!map[activeSport]) map[activeSport] = [];
        if (!map[activeSport].find(x => x.student_id === m.student_id)) map[activeSport].push(m);
      }
    });

    // Ensure sorted inside each group: Year (asc), Class Alphabet (asc), Student Name (asc)
    Object.keys(map).forEach(key => {
      map[key] = map[key].sort((a, b) => {
        const studA = studentsMap.get(a.student_id.trim().toLowerCase());
        const studB = studentsMap.get(b.student_id.trim().toLowerCase());
        
        const yearA = studA ? Number(studA.year) : (Number(a.class) || 4);
        const yearB = studB ? Number(studB.year) : (Number(b.class) || 4);
        if (yearA !== yearB) {
          return yearA - yearB;
        }
        
        const classA = studA ? (studA.class || 'Amanah').trim() : (a.class || 'Amanah').trim();
        const classB = studB ? (studB.class || 'Amanah').trim() : (b.class || 'Amanah').trim();
        const classComp = classA.localeCompare(classB, undefined, { numeric: true, sensitivity: 'base' });
        if (classComp !== 0) {
          return classComp;
        }
        
        const nameA = studA ? (studA.name || '').trim() : (a.name || '').trim();
        const nameB = studB ? (studB.name || '').trim() : (b.name || '').trim();
        return nameA.localeCompare(nameB);
      });
    });

    return map;
  }, [memberships, uniformGroupsList, clubGroupsList, sportGroupsList, studentsMap]);

  // Jawatankuasa (Committee) logical helpers
  const filteredGroupsForComm = useMemo(() => {
    return groups.filter(g => g.category === selectedCommCategory);
  }, [groups, selectedCommCategory]);

  // Synchronise selected group ID when category changes
  useEffect(() => {
    const filtered = groups.filter(g => g.category === selectedCommCategory);
    if (filtered.length > 0) {
      const exists = filtered.some(g => g.id === selectedCommGroupId);
      if (!exists) {
        setSelectedCommGroupId(filtered[0].id || '');
      }
    } else {
      setSelectedCommGroupId('');
    }
  }, [selectedCommCategory, groups, selectedCommGroupId]);

  const currentGroupMembers = useMemo(() => {
    if (!selectedCommGroupId) return [];
    const group = groups.find(g => g.id === selectedCommGroupId);
    if (!group) return [];
    
    // Filter memberships based on category and group name
    return memberships.filter(m => {
      if (group.category === 'uniform') return m.uniform?.toLowerCase().trim() === group.name?.toLowerCase().trim();
      if (group.category === 'club') return m.club?.toLowerCase().trim() === group.name?.toLowerCase().trim();
      if (group.category === 'sport') return m.sport?.toLowerCase().trim() === group.name?.toLowerCase().trim();
      return false;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedCommGroupId, groups, memberships]);

  const currentCommittee = useMemo(() => {
    if (!selectedCommGroupId) return null;
    const scopedCommId = scopedDocId(activeSchoolCode, selectedCommGroupId);
    return committees[scopedCommId] || committees[selectedCommGroupId] || {
      teachers: [],
      pengerusi: '',
      naib_pengerusi: '',
      setiausaha: '',
      penolong_setiausaha: '',
      bendahari: '',
      penolong_bendahari: '',
      ajk_tahun4: '',
      ajk_tahun5: '',
      ajk_tahun6: ''
    };
  }, [selectedCommGroupId, committees, activeSchoolCode]);

  const handleUpdateCommitteeField = async (field: string, val: any) => {
    if (!selectedCommGroupId) return;
    try {
      const scopedCommId = scopedDocId(activeSchoolCode, selectedCommGroupId);
      const updated = {
        ...currentCommittee,
        [field]: val,
        schoolCode: activeSchoolCode
      };
      
      await setDoc(doc(db, 'koko_committees', scopedCommId), updated);
      
      setCommittees(prev => ({
        ...prev,
        [scopedCommId]: updated
      }));
    } catch (err) {
      console.error("Gagal mengemas kini jawatankuasa:", err);
    }
  };

  const year4Members = useMemo(() => {
    return currentGroupMembers.filter(m => {
      const s = studentsMap.get(m.student_id.toLowerCase().trim());
      return s ? Number(s.year) === 4 : false;
    });
  }, [currentGroupMembers, studentsMap]);

  const year5Members = useMemo(() => {
    return currentGroupMembers.filter(m => {
      const s = studentsMap.get(m.student_id.toLowerCase().trim());
      return s ? Number(s.year) === 5 : false;
    });
  }, [currentGroupMembers, studentsMap]);

  const year6Members = useMemo(() => {
    return currentGroupMembers.filter(m => {
      const s = studentsMap.get(m.student_id.toLowerCase().trim());
      return s ? Number(s.year) === 6 : false;
    });
  }, [currentGroupMembers, studentsMap]);

  // Quick check for students available under a specific category group
  const bulkFilteredStudents = useMemo(() => {
    return students.filter(s => {
      // 1. Search Query
      const matchSearch = s.name.toLowerCase().includes(bulkSearch.toLowerCase()) ||
                          (s.class || '').toLowerCase().includes(bulkSearch.toLowerCase());
      if (!matchSearch) return false;

      // 2. Standalone local Year filter (with Year 4, 5, 6 Stage 2 helper)
      if (bulkFilterYear === '4_5_6') {
        const y = Number(s.year);
        if (y < 4 || y > 6) return false;
      } else if (bulkFilterYear !== 'semua') {
        if (String(s.year) !== bulkFilterYear) return false;
      }

      // 3. Standalone local Class filter
      if (bulkFilterClass !== 'semua') {
        const sClass = (s.class || '').toLowerCase().trim();
        if (sClass !== bulkFilterClass.toLowerCase().trim()) return false;
      }

      // 4. Automated Hide: If the student is already assigned to a group in this school-year category:
      // - If they are assigned to the selected `bulkGroup`, they are VISIBLE and SELECTED.
      // - If they are assigned to another active group in this category, they are HIDDEN (since they can't be in 2 groups under same category).
      // - If they have no active group assigned in this category, they are VISIBLE.
      const m = memberships.find(x => x.student_id === s.student_id);
      if (m) {
        const assignedVal = m[bulkCategory];
        if (assignedVal) {
          // Check if this group name is in the list of currently active Groups in DB
          let activeList: string[] = [];
          if (bulkCategory === 'uniform') activeList = uniformGroupsList;
          else if (bulkCategory === 'club') activeList = clubGroupsList;
          else if (bulkCategory === 'sport') activeList = sportGroupsList;

          const isActiveGroup = activeList.some(x => x.toLowerCase().trim() === assignedVal.toLowerCase().trim());
          if (isActiveGroup) {
            // Yes, they have a genuine active group assignment in this category!
            if (bulkGroup) {
              // If we have selected a group in the dropdown (e.g. STEM), 
              // and the student is assigned to "Kelab Bahasa" (different group), we hide them.
              // If the student is assigned to STEM, we keep them visible (so they stay checked in the list!)
              if (assignedVal.toLowerCase().trim() !== bulkGroup.toLowerCase().trim()) {
                return false;
              }
            } else {
              // If no specific group is chosen yet, and they already have some active group, we don't display them as a candidate
              return false;
            }
          }
        }
      }

      return true;
    }).sort((a, b) => {
      const yearA = Number(a.year) || 0;
      const yearB = Number(b.year) || 0;
      if (yearA !== yearB) return yearA - yearB;
      
      const classComp = (a.class || 'Amanah').trim().localeCompare((b.class || 'Amanah').trim(), undefined, { numeric: true, sensitivity: 'base' });
      if (classComp !== 0) return classComp;
      
      return a.name.trim().localeCompare(b.name.trim());
    });
  }, [students, bulkSearch, bulkFilterYear, bulkFilterClass, memberships, bulkCategory, bulkGroup, uniformGroupsList, clubGroupsList, sportGroupsList]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1200">
      
      {/* Top Controller */}
      <div className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-xl shadow-slate-100/50 flex flex-col md:flex-row md:items-center justify-between gap-6 print:hidden">
        <div>
          <h3 className="text-xl font-black italic uppercase tracking-tighter text-slate-800 flex items-center gap-2">
            <Users className="text-blue-600" size={24} />
            Pengurusan Aktiviti Kokurikulum
          </h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
            Penetapan unit beruniform, persatuan, kelab, sukan & permainan (PKKK)
          </p>
        </div>
      </div>

      {/* Prominent high-contrast, easy-to-tap button/card grid for sub-tabs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 print:hidden">
        {[
          {
            id: 'groups' as const,
            label: 'Kump. Kokurikulum',
            icon: '⚙️',
            color: 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100/40',
            activeColor: 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200/50',
            desc: 'Kelab, Sukan & Uniform'
          },
          {
            id: 'overview' as const,
            label: 'Spreedsheet & Daftar',
            icon: '📋',
            color: 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100/40',
            activeColor: 'bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-200/50',
            desc: 'Daftar ahli & paparan cetak'
          },
          {
            id: 'committee' as const,
            label: 'Jawatankuasa',
            icon: '👥',
            color: 'bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100/40',
            activeColor: 'bg-amber-600 text-white border-amber-600 shadow-lg shadow-amber-200/50',
            desc: 'Lantikan J/K & Guru Penasihat'
          },
          {
            id: 'import-excel' as const,
            label: 'Import Rekod',
            icon: '📸',
            color: 'bg-rose-50 text-rose-600 border-rose-100 hover:bg-rose-100/40',
            activeColor: 'bg-rose-600 text-white border-rose-600 shadow-lg shadow-rose-200/50',
            desc: 'Scan imej jadual / fail Excel'
          }
        ].map(nav => {
          const isActive = subTab === nav.id;
          return (
            <button
              key={nav.id}
              type="button"
              onClick={() => setSubTab(nav.id)}
              className={`flex flex-col items-center justify-center p-5 rounded-[22px] border-2 text-center transition-all duration-300 group hover:-translate-y-1 cursor-pointer ${
                isActive
                  ? `${nav.activeColor} scale-[1.02] font-black`
                  : `${nav.color} bg-white border-slate-100 shadow-sm hover:shadow-md`
              }`}
            >
              <span className="text-2xl mb-2.5">{nav.icon}</span>
              <span className="text-[11px] font-black uppercase tracking-tight line-clamp-1">{nav.label}</span>
              <span className={`text-[9px] font-bold mt-1 leading-snug line-clamp-2 ${isActive ? 'text-white/80' : 'text-slate-400'}`}>
                {nav.desc}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-100">
          <RefreshCw className="animate-spin text-blue-600 mb-4" size={32} />
          <p className="text-xs font-black uppercase text-slate-400 tracking-wider">Memuatkan data pendaftaran...</p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          
          {/* OVERVIEW TABLE: EXCEL / SPREADSHEET LAYOUT */}
          {subTab === 'overview' && (
            <div className="space-y-8 animate-in fade-in duration-350">
              
              {/* Mode Selection Header inside Overview */}
              <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4 print:hidden">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOverviewMode('view')}
                    className={`px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                      overviewMode === 'view'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    📊 Paparan Ringkasan Spreedsheet
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverviewMode('edit')}
                    className={`px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                      overviewMode === 'edit'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    ✍️ Daftar Ahli (Kemas Kini Rekod)
                  </button>
                </div>
                <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide pr-3">
                  {overviewMode === 'view' ? '📋 Klik "Daftar Ahli" untuk mengemaskini rekod' : '✅ Pilih "Ringkasan" untuk melihat / mencetak senarai penuh'}
                </div>
              </div>

              {overviewMode === 'view' ? (
                <motion.div
                  key="overview"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="space-y-12"
                >
              <div className="flex justify-between items-center print:hidden">
                <div className="text-slate-500 text-xs">
                  Sila pilih tab untuk mendaftar murid baharu ke mana-mana kumpulan.
                </div>
                <div className="flex gap-4">
                  {groups.length === 0 && canEdit && (
                    <button
                      onClick={() => setShowInitModal(true)}
                      disabled={initializing}
                      className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black uppercase tracking-wider rounded-xl transition shadow flex items-center gap-2"
                    >
                      <Sparkles size={14} />
                      Masukkan Laluan Asal
                    </button>
                  )}
                  <button
                    onClick={handlePrint}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-black text-white text-xs font-black uppercase tracking-wider rounded-xl transition shadow flex items-center gap-2"
                  >
                    <Download size={14} />
                    Download / Cetak PDF
                  </button>
                </div>
              </div>

              {/* THREE CORE SECTIONS PRINT STYLING STACKED */}
              <div className="space-y-14">
                
                {/* 1. BADAN BERUNIFORM SECTION */}
                <div>
                  <div className="bg-slate-900 text-white py-4 px-6 rounded-t-3xl border-b-2 border-orange-500 flex justify-between items-center">
                    <div>
                      <h4 className="font-black tracking-widest text-sm uppercase">KOKURIKULUM {settings.schoolName ? settings.schoolName.toUpperCase() : tenantSchoolName} TAHUN {academicYear.substring(0,4)}</h4>
                      <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">SENARAI NAMA AHLI BADAN BERUNIFORM</p>
                    </div>
                    <span className="bg-orange-500 text-[10px] font-black tracking-widest px-3 py-1 rounded-full uppercase">Unit Beruniform</span>
                  </div>

                  {uniformGroupsList.length === 0 ? (
                    <div className="bg-white p-12 text-center rounded-b-3xl border border-slate-200 text-slate-400 text-xs">
                      Tiada kumpulan Badan Beruniform ditubuhkan lagi.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-4 print:grid-cols-3">
                      {uniformGroupsList.map(groupName => {
                        const list = membersByGroup[groupName] || [];
                        return (
                          <div key={groupName} className="bg-white border-2 border-slate-200 rounded-[20px] overflow-hidden flex flex-col h-full shadow-md">
                            {/* Orange Ribbon Header matching standard Excel format */}
                            <div className="bg-orange-500 text-white text-xs text-center font-black uppercase tracking-widest py-3 border-b-2 border-slate-300">
                              {groupName} ({list.length} Ahli)
                            </div>
                            <div className="flex-1 overflow-x-auto">
                              <table className="w-full text-[11px] text-left border-collapse">
                                <thead>
                                  <tr className="bg-orange-50 border-b border-slate-200 font-extrabold text-[#7c2d12] uppercase tracking-wider">
                                    <th className="py-2 px-3 text-center border-r border-slate-200">NO</th>
                                    <th className="py-2 px-3 text-center border-r border-slate-200">KELAS</th>
                                    <th className="py-2 px-4 border-r border-slate-200">NAMA MURID</th>
                                    <th className="py-2 px-3 text-center">JANTINA</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {list.length === 0 ? (
                                    <tr>
                                      <td colSpan={4} className="py-6 text-center text-slate-400 italic">Tiada Ahli</td>
                                    </tr>
                                  ) : (
                                    list.map((m, idx) => (
                                      <tr key={m.student_id} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-slate-50/50' : 'bg-white'} hover:bg-slate-100/50`}>
                                        <td className="py-2 px-3 text-center font-bold text-slate-500 border-r border-slate-100">{idx + 1}</td>
                                        <td className="py-2 px-3 text-center font-extrabold border-r border-slate-100">{m.class}</td>
                                        <td className="py-2 px-4 font-black text-slate-800 uppercase border-r border-slate-100 truncate max-w-[150px]">{m.name}</td>
                                        <td className="py-2 px-3 text-center font-bold text-slate-500">{m.gender === 'P' ? 'Perempuan' : 'Lelaki'}</td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 2. KELAB & PERSATUAN SECTION */}
                <div>
                  <div className="bg-slate-900 text-white py-4 px-6 rounded-t-3xl border-b-2 border-blue-500 flex justify-between items-center">
                    <div>
                      <h4 className="font-black tracking-widest text-sm uppercase">KOKURIKULUM {settings.schoolName ? settings.schoolName.toUpperCase() : tenantSchoolName} TAHUN {academicYear.substring(0,4)}</h4>
                      <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">SENARAI NAMA AHLI KELAB / PERSATUAN</p>
                    </div>
                    <span className="bg-blue-600 text-[10px] font-black tracking-widest px-3 py-1 rounded-full uppercase">Kelab & Persatuan</span>
                  </div>

                  {clubGroupsList.length === 0 ? (
                    <div className="bg-white p-12 text-center rounded-b-3xl border border-slate-200 text-slate-400 text-xs">
                      Tiada kumpulan Kelab / Persatuan ditubuhkan lagi.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-4 print:grid-cols-3">
                      {clubGroupsList.map(groupName => {
                        const list = membersByGroup[groupName] || [];
                        return (
                          <div key={groupName} className="bg-white border-2 border-slate-200 rounded-[20px] overflow-hidden flex flex-col h-full shadow-md">
                            {/* Blue Ribbon Header */}
                            <div className="bg-blue-600 text-white text-xs text-center font-black uppercase tracking-widest py-3 border-b-2 border-slate-300">
                              {groupName} ({list.length} Ahli)
                            </div>
                            <div className="flex-1 overflow-x-auto">
                              <table className="w-full text-[11px] text-left border-collapse">
                                <thead>
                                  <tr className="bg-blue-50 border-b border-slate-200 font-extrabold text-blue-900 uppercase tracking-wider">
                                    <th className="py-2 px-3 text-center border-r border-slate-200">NO</th>
                                    <th className="py-2 px-3 text-center border-r border-slate-200">KELAS</th>
                                    <th className="py-2 px-4 border-r border-slate-200">NAMA MURID</th>
                                    <th className="py-2 px-3 text-center">JANTINA</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {list.length === 0 ? (
                                    <tr>
                                      <td colSpan={4} className="py-6 text-center text-slate-400 italic">Tiada Ahli</td>
                                    </tr>
                                  ) : (
                                    list.map((m, idx) => (
                                      <tr key={m.student_id} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-slate-50/50' : 'bg-white'} hover:bg-slate-100/50`}>
                                        <td className="py-2 px-3 text-center font-bold text-slate-500 border-r border-slate-100">{idx + 1}</td>
                                        <td className="py-2 px-3 text-center font-extrabold border-r border-slate-100">{m.class}</td>
                                        <td className="py-2 px-4 font-black text-slate-800 uppercase border-r border-slate-100 truncate max-w-[150px]">{m.name}</td>
                                        <td className="py-2 px-3 text-center font-bold text-slate-500">{m.gender === 'P' ? 'Perempuan' : 'Lelaki'}</td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 3. SUKAN & PERMAINAN SECTION */}
                <div>
                  <div className="bg-slate-900 text-white py-4 px-6 rounded-t-3xl border-b-2 border-emerald-500 flex justify-between items-center">
                    <div>
                      <h4 className="font-black tracking-widest text-sm uppercase">KOKURIKULUM {settings.schoolName ? settings.schoolName.toUpperCase() : tenantSchoolName} TAHUN {academicYear.substring(0,4)}</h4>
                      <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">SENARAI NAMA AHLI SUKAN / PERMAINAN</p>
                    </div>
                    <span className="bg-emerald-600 text-[10px] font-black tracking-widest px-3 py-1 rounded-full uppercase">Sukan & Permainan</span>
                  </div>

                  {sportGroupsList.length === 0 ? (
                    <div className="bg-white p-12 text-center rounded-b-3xl border border-slate-200 text-slate-400 text-xs">
                      Tiada kumpulan Sukan / Permainan ditubuhkan lagi.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-4 print:grid-cols-3">
                      {sportGroupsList.map(groupName => {
                        const list = membersByGroup[groupName] || [];
                        return (
                          <div key={groupName} className="bg-white border-2 border-slate-200 rounded-[20px] overflow-hidden flex flex-col h-full shadow-md">
                            {/* Emerald Ribbon Header */}
                            <div className="bg-emerald-600 text-white text-xs text-center font-black uppercase tracking-widest py-3 border-b-2 border-slate-300">
                              {groupName} ({list.length} Ahli)
                            </div>
                            <div className="flex-1 overflow-x-auto">
                              <table className="w-full text-[11px] text-left border-collapse">
                                <thead>
                                  <tr className="bg-emerald-50 border-b border-slate-200 font-extrabold text-emerald-900 uppercase tracking-wider">
                                    <th className="py-2 px-3 text-center border-r border-slate-200">NO</th>
                                    <th className="py-2 px-3 text-center border-r border-slate-200">KELAS</th>
                                    <th className="py-2 px-4 border-r border-slate-200">NAMA MURID</th>
                                    <th className="py-2 px-3 text-center">JANTINA</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {list.length === 0 ? (
                                    <tr>
                                      <td colSpan={4} className="py-6 text-center text-slate-400 italic">Tiada Ahli</td>
                                    </tr>
                                  ) : (
                                    list.map((m, idx) => (
                                      <tr key={m.student_id} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-slate-50/50' : 'bg-white'} hover:bg-slate-100/50`}>
                                        <td className="py-2 px-3 text-center font-bold text-slate-500 border-r border-slate-100">{idx + 1}</td>
                                        <td className="py-2 px-3 text-center font-extrabold border-r border-slate-100">{m.class}</td>
                                        <td className="py-2 px-4 font-black text-slate-800 uppercase border-r border-slate-100 truncate max-w-[150px]">{m.name}</td>
                                        <td className="py-2 px-3 text-center font-bold text-slate-500">{m.gender === 'P' ? 'Perempuan' : 'Lelaki'}</td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            </motion.div>
          ) : (
            <motion.div
              key="enrollment"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              {/* Left 2 Cols: Student search, filter and assignments */}
              <div className="lg:col-span-2 bg-white p-8 rounded-[32px] border border-slate-200 shadow-xl shadow-slate-100 space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-6">
                  <div>
                    <h4 className="text-lg font-black italic uppercase tracking-tighter text-slate-800">Senarai Pendaftaran Murid</h4>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Daftarkan murid ke dalam kumpulan kokurikulum masing-masing</p>
                  </div>
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={exportToExcel}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm transition-all w-full sm:w-auto"
                    >
                      <Download size={14} />
                      Export Excel (Daftar Ahli)
                    </button>
                    <span className="text-xs bg-blue-50 text-blue-600 font-extrabold px-3 py-1.5 rounded-xl uppercase tracking-wider whitespace-nowrap">
                      {filteredStudents.length} Murid
                    </span>
                  </div>
                </div>

                {/* Class Quick Selection Grid */}
                <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-3">
                  <div className="flex items-center gap-2">
                    <Users size={14} className="text-slate-400" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Carian Pantas Mengikut Kelas</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedClass('semua');
                        setSelectedYear('semua');
                      }}
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all text-left ${
                        selectedClass === 'semua' && selectedYear === 'semua'
                          ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                          : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className={`p-1.5 rounded-lg flex items-center justify-center ${
                        selectedClass === 'semua' && selectedYear === 'semua' ? 'bg-blue-500 text-white' : 'bg-slate-50 text-slate-400'
                      }`}>
                        <Users size={12} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[8px] font-black uppercase opacity-65 tracking-wider leading-none">PILIH</div>
                        <div className="text-[10px] font-black uppercase tracking-tight leading-normal truncate">SEMUA KELAS</div>
                      </div>
                    </button>

                    {uniqueClassCombinations.map((comb) => {
                      const isActive = selectedClass === comb.className && String(selectedYear) === String(comb.year);
                      return (
                        <button
                          key={comb.label}
                          type="button"
                          onClick={() => {
                            setSelectedClass(comb.className);
                            setSelectedYear(String(comb.year));
                          }}
                          className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all text-left ${
                            isActive
                              ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                              : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className={`p-1.5 rounded-lg flex items-center justify-center ${
                            isActive ? 'bg-blue-500 text-white' : 'bg-slate-50 text-slate-400'
                          }`}>
                            <Bookmark size={12} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[8px] font-black uppercase opacity-65 tracking-wider leading-none">KELAS</div>
                            <div className="text-[10px] font-black uppercase tracking-tight leading-normal truncate">{comb.label}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text"
                      placeholder="Cari murid..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-xs outline-none focus:ring-2 focus:ring-blue-500 uppercase tracking-wider h-11 font-bold"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Filter size={14} className="text-slate-400" />
                    <select
                      value={selectedClass}
                      onChange={e => setSelectedClass(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-xs font-bold uppercase tracking-wider h-11"
                    >
                      <option value="semua">Semua Kelas</option>
                      {classes.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <Settings size={14} className="text-slate-400" />
                    <select
                      value={selectedYear}
                      onChange={e => setSelectedYear(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-xs font-bold uppercase tracking-wider h-11"
                    >
                      <option value="semua">Semua Tahun</option>
                      {years.map(y => <option key={y} value={y}>Tahun {y}</option>)}
                    </select>
                  </div>
                </div>

                {/* Table list */}
                {selectedClass === 'semua' && selectedYear === 'semua' ? (
                  <div className="flex flex-col items-center justify-center py-16 px-8 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[28px] text-center space-y-4">
                    <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shadow-md">
                      <Filter size={28} />
                    </div>
                    <div>
                      <h5 className="font-extrabold text-slate-800 uppercase tracking-tight text-xs">Sila Pilih Kelas atau Tahun Utama</h5>
                      <p className="text-[10px] font-black text-slate-400 max-w-sm mt-1 leading-relaxed uppercase tracking-wider">
                        Pilih Kelas atau Tahun di atas untuk memaparkan senarai pendaftaran murid individu. 
                        Sebagai peringatan, pendaftaran kokurikulum (PAJSK) hanya diwajibkan bagi murid **Tahun 4, 5 dan 6**.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-[20px] border border-slate-200">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 font-extrabold uppercase text-slate-500 tracking-wider">
                        <th className="py-4 px-4 w-12 text-center">NO</th>
                        <th className="py-4 px-4 w-16 text-center">KELAS</th>
                        <th className="py-4 px-4">NAMA MURID</th>
                        <th className="py-4 px-4">UNIT UNIFORM</th>
                        <th className="py-4 px-4">KELAB & PERSATUAN</th>
                        <th className="py-4 px-4">SUKAN & PERMAINAN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400 font-black uppercase tracking-widest text-xs">Tiada rekod ditemui</td>
                        </tr>
                      ) : (
                        filteredStudents.map((student, idx) => {
                          const m = memberships.find(x => x.student_id === student.student_id) || {
                            uniform: '',
                            club: '',
                            sport: ''
                          };

                          return (
                            <tr key={student.student_id} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-slate-50/20' : 'bg-white'} hover:bg-slate-50/80`}>
                              <td className="py-4 px-4 text-center text-slate-400 font-bold">{idx + 1}</td>
                              <td className="py-4 px-4 text-center">
                                <span className="font-extrabold text-slate-800 block text-xs">{student.class}</span>
                                <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded inline-block mt-1">TAHUN {student.year}</span>
                              </td>
                              <td className="py-4 px-4">
                                <p className="font-black text-slate-900 uppercase truncate max-w-[150px]">{student.name}</p>
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{student.student_id}</span>
                              </td>

                              {/* Uniform Dropdown Selector */}
                              <td className="py-3 px-4">
                                <select
                                  disabled={!canEdit}
                                  value={m.uniform && uniformGroupsList.some(x => x.toLowerCase().trim() === m.uniform.toLowerCase().trim())
                                    ? uniformGroupsList.find(x => x.toLowerCase().trim() === m.uniform.toLowerCase().trim()) || m.uniform
                                    : ''
                                  }
                                  onChange={e => handleSingleAssign(student, 'uniform', e.target.value)}
                                  className={`w-full text-[11px] font-black px-2.5 py-1.5 rounded-lg border uppercase tracking-wider outline-none ${
                                    m.uniform && uniformGroupsList.some(x => x.toLowerCase().trim() === m.uniform.toLowerCase().trim())
                                      ? 'bg-orange-50 border-orange-200 text-orange-700' 
                                      : 'bg-white border-slate-200 text-slate-400'
                                  }`}
                                >
                                  <option value="">TIADA</option>
                                  {uniformGroupsList.map(name => (
                                    <option key={name} value={name}>{name}</option>
                                  ))}
                                </select>
                              </td>

                              {/* Club Dropdown */}
                              <td className="py-3 px-4">
                                <select
                                  disabled={!canEdit}
                                  value={m.club && clubGroupsList.some(x => x.toLowerCase().trim() === m.club.toLowerCase().trim())
                                    ? clubGroupsList.find(x => x.toLowerCase().trim() === m.club.toLowerCase().trim()) || m.club
                                    : ''
                                  }
                                  onChange={e => handleSingleAssign(student, 'club', e.target.value)}
                                  className={`w-full text-[11px] font-black px-2.5 py-1.5 rounded-lg border uppercase tracking-wider outline-none ${
                                    m.club && clubGroupsList.some(x => x.toLowerCase().trim() === m.club.toLowerCase().trim())
                                      ? 'bg-blue-50 border-blue-200 text-blue-700' 
                                      : 'bg-white border-slate-200 text-slate-400'
                                  }`}
                                >
                                  <option value="">TIADA</option>
                                  {clubGroupsList.map(name => (
                                    <option key={name} value={name}>{name}</option>
                                  ))}
                                </select>
                              </td>

                              {/* Sport Dropdown */}
                              <td className="py-3 px-4">
                                <select
                                  disabled={!canEdit}
                                  value={m.sport && sportGroupsList.some(x => x.toLowerCase().trim() === m.sport.toLowerCase().trim())
                                    ? sportGroupsList.find(x => x.toLowerCase().trim() === m.sport.toLowerCase().trim()) || m.sport
                                    : ''
                                  }
                                  onChange={e => handleSingleAssign(student, 'sport', e.target.value)}
                                  className={`w-full text-[11px] font-black px-2.5 py-1.5 rounded-lg border uppercase tracking-wider outline-none ${
                                    m.sport && sportGroupsList.some(x => x.toLowerCase().trim() === m.sport.toLowerCase().trim())
                                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                                      : 'bg-white border-slate-200 text-slate-400'
                                  }`}
                                >
                                  <option value="">TIADA</option>
                                  {sportGroupsList.map(name => (
                                    <option key={name} value={name}>{name}</option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                )}
              </div>

              {/* Right 1 Col: BULK ENROLLMENT WITH TICKBOXES (Easy group builder!) */}
              <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-xl shadow-slate-100 flex flex-col h-full space-y-6">
                <div>
                  <h4 className="text-lg font-black italic uppercase tracking-tighter text-slate-800 flex items-center gap-2">
                    <Sparkles className="text-amber-500" size={20} />
                    Pendaftaran Pukal (Tickbox)
                  </h4>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Pilih Kumpulan dan tickbox murid yang ingin dimasukkan</p>
                </div>

                {!canEdit ? (
                  <div className="bg-slate-50 p-6 text-center text-slate-400 text-xs rounded-2xl">
                    Hanya Pentadbir (PKKK) atau Guru boleh mendaftar / mengemas-kini keahlian murid.
                  </div>
                ) : (
                  <div className="space-y-4 flex-1 flex flex-col">
                    {/* Category Selector */}
                    <div>
                      <label className="text-[9px] font-black tracking-widest uppercase text-slate-450 block mb-1.5">Kategori</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'uniform', label: 'Uniform' },
                          { id: 'club', label: 'Kelab' },
                          { id: 'sport', label: 'Sukan' }
                        ].map((cat) => (
                          <button
                            key={cat.id}
                            onClick={() => {
                              setBulkCategory(cat.id as any);
                              setBulkGroup('');
                            }}
                            className={`py-2 px-3 rounded-xl font-bold uppercase tracking-widest text-[9px] border text-center transition-all ${
                              bulkCategory === cat.id 
                                ? 'bg-slate-900 text-white border-slate-900 shadow'
                                : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                            }`}
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Group Selector */}
                    <div>
                      <label className="text-[9px] font-black tracking-widest uppercase text-slate-450 block mb-1.5">Pilih Kumpulan</label>
                      <select
                        value={bulkGroup}
                        onChange={e => setBulkGroup(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-wider h-11"
                      >
                        <option value="">-- PILIH KUMPULAN --</option>
                        {groups.filter(g => g.category === bulkCategory).map(g => (
                          <option key={g.id} value={g.name}>{g.name.toUpperCase()}</option>
                        ))}
                      </select>
                    </div>

                    {bulkGroup && (
                      <div className="flex-1 flex flex-col space-y-4 pt-2">
                        <div className="h-px bg-slate-100"></div>

                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-blue-600 uppercase tracking-wider">
                            Pendaftaran untuk: {bulkGroup.toUpperCase()}
                          </span>
                        </div>

                        {/* Search students within building */}
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                          <input 
                            type="text"
                            placeholder="Cari murid..."
                            value={bulkSearch}
                            onChange={e => setBulkSearch(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-500 uppercase tracking-wider h-9"
                          />
                        </div>

                        {/* Interactive local filters for the tickbox list */}
                        <div className="flex flex-col gap-2 p-3.5 bg-slate-50 border border-slate-150 rounded-2xl">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[8px] font-black uppercase tracking-wider text-slate-400 block mb-1">Tahun (Year)</label>
                              <select
                                value={bulkFilterYear}
                                onChange={e => setBulkFilterYear(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-[10px] font-bold uppercase tracking-wider"
                              >
                                <option value="4_5_6">Tahun 4, 5, 6 (Tahap 2)</option>
                                <option value="semua">Semua (Tahun 1-6)</option>
                                <option value="4">Tahun 4</option>
                                <option value="5">Tahun 5</option>
                                <option value="6">Tahun 6</option>
                                <option value="1">Tahun 1</option>
                                <option value="2">Tahun 2</option>
                                <option value="3">Tahun 3</option>
                              </select>
                            </div>

                            <div>
                              <label className="text-[8px] font-black uppercase tracking-wider text-slate-400 block mb-1">Kelas (Class)</label>
                              <select
                                value={bulkFilterClass}
                                onChange={e => setBulkFilterClass(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-[10px] font-bold uppercase tracking-wider"
                              >
                                <option value="semua">Semua Kelas</option>
                                {classes.map(c => (
                                  <option key={c} value={c}>{c.toUpperCase()}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 mt-1 text-slate-600 bg-slate-100/85 border border-slate-200 p-2 rounded-lg text-[9px] font-black uppercase tracking-wider">
                            <span>ℹ️</span>
                            <span>Murid berdaftar kelab/sukan lain disorok secara automatik</span>
                          </div>
                        </div>

                        {/* List with Checkboxes */}
                        <div className="flex-1 overflow-y-auto max-h-[320px] rounded-2xl border border-slate-200 divide-y divide-slate-100 relative bg-slate-50/50">
                          {bulkFilteredStudents.map(student => {
                            const m = memberships.find(x => x.student_id === student.student_id);
                            const isSelected = m ? m[bulkCategory] === bulkGroup : false;

                            return (
                              <label 
                                key={student.student_id} 
                                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 cursor-pointer select-none"
                              >
                                <div>
                                  <p className="text-xs font-black uppercase text-slate-800">{student.name}</p>
                                  <div className="text-[9px] font-bold text-slate-450 uppercase flex flex-wrap items-center gap-1.5 mt-0.5">
                                    <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-black">TAHUN {student.year}</span>
                                    <span>•</span>
                                    <span className="text-blue-500">Kelas: {student.class}</span>
                                    {student.gender && (
                                      <>
                                        <span>•</span>
                                        <span className={student.gender === 'P' ? 'text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded font-black' : 'text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-black'}>
                                          {student.gender === 'P' ? 'Perempuan' : 'Lelaki'}
                                        </span>
                                      </>
                                    )}
                                    {student.race && (
                                      <>
                                        <span>•</span>
                                        <span className="text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded font-black">
                                          {student.race}
                                        </span>
                                      </>
                                    )}
                                    <span>•</span>
                                    <span className="text-slate-400 font-medium">ID: {student.student_id}</span>
                                  </div>
                                </div>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={e => handleBulkToggle(student, e.target.checked)}
                                  className="w-5 h-5 rounded-md border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600"
                                />
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
            </div>
          )}

          {/* ⚙️ SETUP GROUPS */}
          {subTab === 'groups' && (
            <motion.div
              key="groups"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-8"
            >
              {/* Top Row: Create Group Box & Sparkly SOP Banner */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left side: Form to create group */}
                <div className="lg:col-span-5 bg-white p-8 rounded-[32px] border border-slate-200 shadow-xl shadow-slate-100 flex flex-col space-y-6">
                  <div>
                    <h4 className="text-lg font-black italic uppercase tracking-tighter text-slate-800">Tambah Kumpulan Baru</h4>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Tubuhkan kelab, unit atau sukan yang baharu didaftarkan</p>
                  </div>

                  {!canEdit ? (
                    <div className="bg-slate-50 p-6 text-center text-slate-400 text-xs rounded-2xl">
                      Hanya Pentadbir (PKKK) boleh menubuhkan kelab baharu.
                    </div>
                  ) : (
                    <form onSubmit={handleAddGroup} className="space-y-4">
                      <div>
                        <label className="text-[10px] font-black tracking-widest uppercase text-slate-400 mb-2 block">
                          Kategori Kelab / Kokurikulum
                        </label>
                        <select
                          value={newGroupCat}
                          onChange={e => setNewGroupCat(e.target.value as any)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-wider h-11"
                        >
                          <option value="uniform">Badan Beruniform</option>
                          <option value="club">Kelab / Persatuan</option>
                          <option value="sport">Sukan / Permainan</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-black tracking-widest uppercase text-slate-400 mb-2 block">
                          Nama Kumpulan
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Contoh: STEM, TKRS, Wushu..."
                          value={newGroupName}
                          onChange={e => setNewGroupName(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs outline-none focus:ring-2 focus:ring-blue-500 uppercase tracking-wider h-11 font-bold"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-100 transition-all flex items-center justify-center gap-2"
                      >
                        <Plus size={16} />
                        Tubuhkan Kumpulan
                      </button>
                    </form>
                  )}
                </div>

                {/* Right side: SOP / Import Laluan Asal informative card */}
                <div className="lg:col-span-7 bg-slate-900 text-white p-8 rounded-[32px] border border-slate-800 shadow-xl flex flex-col justify-between relative overflow-hidden">
                  <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none translate-x-1/4 translate-y-1/4">
                    <Sparkles size={240} className="text-amber-400 rotate-12" />
                  </div>
                  <div className="space-y-3 z-10">
                    <span className="bg-amber-500/20 text-amber-300 text-[9px] font-black uppercase tracking-wider px-3.5 py-1.5 rounded-full border border-amber-500/30 inline-block">
                      Sediakan Laluan Asal (SOP)
                    </span>
                    <h4 className="text-xl font-black italic uppercase tracking-tighter text-slate-100">Setup Pantas Kokurikulum Sekolah</h4>
                    <p className="text-[11px] text-slate-350 leading-relaxed font-semibold">
                      Gunakan modul ini untuk menjana kumpulan-kumpulan wajib bagi Kokurikulum SJK(C) secara automatik (TKRS, Pengakap, STEM, Bola Tampar, Catur, dll.). Sesuai untuk penyediaan awal sistem sekolah anda tanpa perlu menubuhkan kumpulan satu demi satu.
                    </p>
                  </div>
                  
                  {canEdit && (
                    <div className="pt-6 z-10">
                      <button
                        type="button"
                        onClick={() => {
                          const dbNames = new Set(groups.map(g => g.name.toLowerCase().trim()));
                          
                          // Uniforms
                          const activeUniforms = DEFAULT_UNIFORMS.filter(x => dbNames.has(x.toLowerCase().trim()));
                          const initialUniforms = groups.length === 0 ? DEFAULT_UNIFORMS : activeUniforms;
                          setSelectedInitUniforms(initialUniforms);
                          
                          // Clubs
                          const activeClubs = DEFAULT_CLUBS.filter(x => dbNames.has(x.toLowerCase().trim()));
                          const initialClubs = groups.length === 0 ? DEFAULT_CLUBS : activeClubs;
                          setSelectedInitClubs(initialClubs);

                          // Sports
                          const activeSports = DEFAULT_SPORTS.filter(x => dbNames.has(x.toLowerCase().trim()));
                          const initialSports = groups.length === 0 ? DEFAULT_SPORTS : activeSports;
                          setSelectedInitSports(initialSports);

                          setShowInitModal(true);
                        }}
                        className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2 font-bold self-start"
                      >
                        <Sparkles size={14} className="text-slate-950 animate-pulse" />
                        Mula Import Laluan Asal
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Row: Spacious full-width Senarai Kumpulan Semasa Card */}
              <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-xl shadow-slate-100 space-y-6">
                <div>
                  <h4 className="text-lg font-black italic uppercase tracking-tighter text-slate-800">Senarai Kumpulan Semasa</h4>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Berikut adalah senarai kelab dan sukan yang telah wujud dalam sistem</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  {/* UNIFORMS WIDGET */}
                  <div className="space-y-4">
                    <div className="bg-orange-50 border border-orange-100 text-orange-850 px-4 py-3 rounded-2xl flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider">Badan Beruniform</p>
                        <p className="text-xs font-black text-orange-950 mt-1">
                          {groups.filter(g => g.category === 'uniform').length} Ditubuhkan
                        </p>
                      </div>
                      <span className="text-lg">🛡️</span>
                    </div>
                    <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-y-auto max-h-[350px] bg-slate-50/50">
                      {groups.filter(g => g.category === 'uniform').length === 0 ? (
                        <p className="p-4 text-center text-slate-400 text-[10px] italic">Tiada Rekod</p>
                      ) : (
                        groups.filter(g => g.category === 'uniform').map(g => (
                          <div key={g.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                            <span className="text-xs font-black uppercase text-slate-800 tracking-wide truncate pr-2">{g.name}</span>
                            {canEdit && (
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {confirmDeleteGroupId === g.id ? (
                                  <div className="flex items-center gap-1 bg-red-50 border border-red-200 p-1 rounded-xl shadow-sm">
                                    <span className="text-[7px] font-black text-rose-600 px-1 uppercase tracking-widest leading-none">Padam?</span>
                                    <button 
                                      onClick={() => {
                                        handleDeleteGroup(g.id!);
                                        setConfirmDeleteGroupId(null);
                                      }}
                                      className="px-2 py-0.5 bg-red-650 hover:bg-red-750 text-white rounded text-[8px] font-bold uppercase transition"
                                    >
                                      Ya
                                    </button>
                                    <button 
                                      onClick={() => setConfirmDeleteGroupId(null)}
                                      className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[8px] font-bold uppercase transition"
                                    >
                                      X
                                    </button>
                                  </div>
                                ) : (
                                  <button 
                                    onClick={() => setConfirmDeleteGroupId(g.id!)}
                                    className="text-slate-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50 flex-shrink-0"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* CLUBS WIDGET */}
                  <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-100 text-blue-850 px-4 py-3 rounded-2xl flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider">Kelab & Persatuan</p>
                        <p className="text-xs font-black text-blue-950 mt-1">
                          {groups.filter(g => g.category === 'club').length} Ditubuhkan
                        </p>
                      </div>
                      <span className="text-lg">🧪</span>
                    </div>
                    <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-y-auto max-h-[350px] bg-slate-50/50">
                      {groups.filter(g => g.category === 'club').length === 0 ? (
                        <p className="p-4 text-center text-slate-400 text-[10px] italic">Tiada Rekod</p>
                      ) : (
                        groups.filter(g => g.category === 'club').map(g => (
                          <div key={g.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                            <span className="text-xs font-black uppercase text-slate-800 tracking-wide truncate pr-2">{g.name}</span>
                            {canEdit && (
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {confirmDeleteGroupId === g.id ? (
                                  <div className="flex items-center gap-1 bg-red-50 border border-red-200 p-1 rounded-xl shadow-sm">
                                    <span className="text-[7px] font-black text-rose-600 px-1 uppercase tracking-widest leading-none">Padam?</span>
                                    <button 
                                      onClick={() => {
                                        handleDeleteGroup(g.id!);
                                        setConfirmDeleteGroupId(null);
                                      }}
                                      className="px-2 py-0.5 bg-red-655 hover:bg-red-755 text-white rounded text-[8px] font-bold uppercase transition"
                                    >
                                      Ya
                                    </button>
                                    <button 
                                      onClick={() => setConfirmDeleteGroupId(null)}
                                      className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[8px] font-bold uppercase transition"
                                    >
                                      X
                                    </button>
                                  </div>
                                ) : (
                                  <button 
                                    onClick={() => setConfirmDeleteGroupId(g.id!)}
                                    className="text-slate-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50 flex-shrink-0"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* SPORTS WIDGET */}
                  <div className="space-y-4">
                    <div className="bg-emerald-50 border border-emerald-100 text-emerald-850 px-4 py-3 rounded-2xl flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider">Sukan & Permainan</p>
                        <p className="text-xs font-black text-emerald-950 mt-1">
                          {groups.filter(g => g.category === 'sport').length} Ditubuhkan
                        </p>
                      </div>
                      <span className="text-lg">⚽</span>
                    </div>
                    <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-y-auto max-h-[350px] bg-slate-50/50">
                      {groups.filter(g => g.category === 'sport').length === 0 ? (
                        <p className="p-4 text-center text-slate-400 text-[10px] italic">Tiada Rekod</p>
                      ) : (
                        groups.filter(g => g.category === 'sport').map(g => (
                          <div key={g.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                            <span className="text-xs font-black uppercase text-slate-800 tracking-wide truncate pr-2">{g.name}</span>
                            {canEdit && (
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {confirmDeleteGroupId === g.id ? (
                                  <div className="flex items-center gap-1 bg-red-50 border border-red-200 p-1 rounded-xl shadow-sm">
                                    <span className="text-[7px] font-black text-rose-600 px-1 uppercase tracking-widest leading-none">Padam?</span>
                                    <button 
                                      onClick={() => {
                                        handleDeleteGroup(g.id!);
                                        setConfirmDeleteGroupId(null);
                                      }}
                                      className="px-2 py-0.5 bg-red-655 hover:bg-red-755 text-white rounded text-[8px] font-bold uppercase transition"
                                    >
                                      Ya
                                    </button>
                                    <button 
                                      onClick={() => setConfirmDeleteGroupId(null)}
                                      className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[8px] font-bold uppercase transition"
                                    >
                                      X
                                    </button>
                                  </div>
                                ) : (
                                  <button 
                                    onClick={() => setConfirmDeleteGroupId(g.id!)}
                                    className="text-slate-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50 flex-shrink-0"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                </div>
              </div>
            </motion.div>
          )}

          {subTab === 'import-excel' && (
            <motion.div
              key="import-excel"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              <div className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-xl shadow-slate-100/50 space-y-6">
                <div>
                  <h4 className="text-lg font-black italic uppercase tracking-tighter text-slate-800 flex items-center gap-2">
                    <Sparkles className="text-blue-600 animate-pulse" size={22} />
                    Sistem Import Berkelompok ⚡
                  </h4>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                    Sediakan pendaftaran murid atau senarai guru penasihat dari fail/salinan Excel anda dengan cepat.
                  </p>
                </div>

                {/* Import Target Selection (Students vs Teachers) */}
                <div className="flex gap-2 border-b border-slate-150 pb-3">
                  <button
                    type="button"
                    onClick={() => setTeacherImportMode('student')}
                    className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                      teacherImportMode === 'student'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-slate-50 text-slate-500 hover:text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    👥 Import Ahli (Murid)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTeacherImportMode('teacher')}
                    className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                      teacherImportMode === 'teacher'
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'bg-slate-50 text-slate-500 hover:text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    👨‍🏫 Import Senarai Guru
                  </button>
                </div>

                {teacherImportMode === 'teacher' ? (
                  <div className="space-y-6 animate-in fade-in">
                    <div className="bg-purple-50/50 border border-purple-100 rounded-2xl p-5 space-y-3">
                      <div className="flex items-center gap-2 text-purple-900">
                        <span className="text-base">👨‍🏫</span>
                        <h5 className="text-xs font-black uppercase tracking-wider">Pendaftaran Guru Penasihat Berkelompok</h5>
                      </div>
                      <ol className="text-[11px] text-slate-600 font-bold space-y-1.5 list-decimal list-inside uppercase tracking-wide">
                        <li>Sila salin / taip semua nama guru yang mahu dimasukkan ke sistem.</li>
                        <li>Tampalkan di kotak input di bawah (Satu nama untuk satu baris).</li>
                        <li>Sistem mendaftarkan mereka secara terus untuk dilantik di tab "Kump. Kokurikulum".</li>
                      </ol>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Senarai nama guru (Satu baris satu nama):
                      </label>
                      <textarea
                        rows={8}
                        value={pastedTeachersText}
                        onChange={(e) => setPastedTeachersText(e.target.value)}
                        placeholder="Contoh:&#13;PN TAN AH LIAN&#13;EN MOHD KHALID BIN SALIM&#13;CIK ARYATI JAAFAR"
                        className="w-full p-4 border border-slate-200 rounded-2xl font-mono text-xs focus:ring-2 focus:ring-purple-500 bg-slate-50/50 uppercase"
                      />
                    </div>

                    <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide">
                        {pastedTeachersText.split('\n').filter(n => n.trim().length > 0).length} Talian Dikesan
                      </div>
                      <button
                        type="button"
                        onClick={handleImportTeachers}
                        disabled={importingTeachers || !pastedTeachersText.trim()}
                        className="px-6 py-3.5 bg-purple-600 hover:bg-purple-705 text-white text-xs font-black uppercase tracking-widest rounded-xl transition shadow flex items-center gap-2 disabled:bg-slate-200 disabled:text-slate-400"
                      >
                        {importingTeachers ? (
                          <>
                            <RefreshCw className="animate-spin" size={14} />
                            Sedang Melakukan Pendaftaran...
                          </>
                        ) : (
                          <>
                            📑 Mula Import Senarai Guru ✔️
                          </>
                        )}
                      </button>
                    </div>

                    {/* Quick List of Current Teachers in Database */}
                    <div className="pt-6 border-t border-slate-100 space-y-4">
                      <div>
                        <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Senarai Guru Berdaftar Semasa ({teachers.length})</h5>
                        <p className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider mt-0.5">Guru-guru ini telah sedia wujud untuk dilantik.</p>
                      </div>

                      {teachers.length === 0 ? (
                        <p className="text-slate-400 text-xs italic">Tiada guru didaftarkan.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-62 overflow-y-auto pr-2">
                          {teachers.sort((a,b) => a.name.localeCompare(b.name)).map((t, idx) => (
                            <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                              <div className="truncate">
                                <p className="text-xs font-black text-slate-800 uppercase tracking-wide truncate">{t.name}</p>
                                <p className="text-[9px] font-mono text-slate-400 truncate uppercase">{t.email || '-'}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <>

                {/* Import method selection */}
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setImportType('image');
                      setParsingSuccess(false);
                      setParsedStudents([]);
                    }}
                    className={`py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                      importType === 'image'
                        ? 'bg-white text-blue-600 shadow-sm border border-slate-200'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    📸 Gambar / Screenshot Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setImportType('text');
                      setParsingSuccess(false);
                      setParsedStudents([]);
                    }}
                    className={`py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                      importType === 'text'
                        ? 'bg-white text-blue-600 shadow-sm border border-slate-200'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    📋 Tampal Teks Lajur Excel
                  </button>
                </div>

                {/* Main Inputs */}
                {importType === 'image' ? (
                  <div className="space-y-4">
                    <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-3xl p-8 text-center bg-slate-50/50 hover:bg-slate-50 transition-all cursor-pointer relative">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Upload className="text-slate-400" size={36} />
                        <p className="text-xs font-black text-slate-700 uppercase tracking-widest mt-2">
                          Sila heret atau pilih gambar tangkapan skrin Excel anda
                        </p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                          Format disokong: PNG, JPG, JPEG (Maksimum 10MB)
                        </p>
                      </div>
                    </div>

                    {imagePreview && (
                      <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col items-center gap-3">
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Pratonton Gambar Terpilih:</p>
                        <img
                          src={imagePreview}
                          alt="Screenshot Excel"
                          className="max-h-72 object-contain border border-slate-300 rounded-xl shadowReferrer"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setImageFile(null);
                            setImagePreview('');
                          }}
                          className="px-4 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-[10px] font-black uppercase tracking-wider transition"
                        >
                          Padam Gambar
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Tampalkan teks lajur Excel (Salin baris dari spreadsheet & tampal di bawah):
                    </label>
                    <textarea
                      rows={8}
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      placeholder="Contoh format:&#13;1  160711130323  AERRIEL TAN  LELAKI  4  KRS  Olahraga  STEM&#13;2  160519130489  BRADLEY YEO   LELAKI  4  KRS  Olahraga  STEM"
                      className="w-full p-4 border border-slate-200 rounded-2xl font-mono text-xs focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
                    />
                  </div>
                )}

                {/* Analysis CTA Button */}
                {!parsingSuccess && (
                  <div className="flex justify-end pt-4">
                    <button
                      type="button"
                      onClick={handleStartParse}
                      disabled={parsing || (importType === 'image' ? !imagePreview : !pastedText.trim())}
                      className="px-6 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-black uppercase tracking-widest rounded-xl transition shadow flex items-center gap-2"
                    >
                      {parsing ? (
                        <>
                          <RefreshCw className="animate-spin" size={14} />
                          Kecerdasan Buatan Sedang Menganalisis...
                        </>
                      ) : (
                        <>
                          <Sparkles size={14} />
                          Mula Analisis & Ekstrak Data
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Handlers of state alerts */}
                {parsing && (
                  <div className="p-6 bg-blue-50/50 border border-blue-100 rounded-2xl flex flex-col items-center justify-center gap-3">
                    <RefreshCw className="animate-spin text-blue-600" size={24} />
                    <p className="text-xs font-black uppercase text-blue-900 tracking-wider animate-pulse">
                      Gemini AI sedang menterjemah jadual Excel anda...
                    </p>
                    <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">
                      Ini mengambil masa beberapa saat. Sila tunggu.
                    </p>
                  </div>
                )}

                {parseError && (
                  <div className="p-4 bg-red-50 border border-red-100 text-red-700 rounded-2xl text-xs font-bold uppercase tracking-wide flex items-center gap-2">
                    ⚠️ {parseError}
                  </div>
                )}

                {/* Parsing Results Display */}
                {parsingSuccess && parsedStudents.length > 0 && (
                  <div className="space-y-6 pt-6 border-t border-slate-100 animate-in fade-in duration-300">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h5 className="font-extrabold text-slate-800 text-sm">
                          Hasil Cabutan Data ({parsedStudents.length} rekod dijumpai)
                        </h5>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                          Sila semak senarai murid dan pilihan sub-kokurikulum di bawah sebelum menyimpan ke pangkalan data.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const allSelected = parsedStudents.every(s => selectedParsedRowIds[s.tempId]);
                            const nextSels: Record<string, boolean> = {};
                            parsedStudents.forEach(s => {
                              nextSels[s.tempId] = !allSelected;
                            });
                            setSelectedParsedRowIds(nextSels);
                          }}
                          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-wider rounded-lg transition"
                        >
                          {parsedStudents.every(s => selectedParsedRowIds[s.tempId]) ? "Nyahpilih Semua" : "Pilih Semua"}
                        </button>
                      </div>
                    </div>

                    {/* Meta summary cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 bg-orange-50/50 border border-orange-100 rounded-2xl">
                        <p className="text-[10px] font-black uppercase tracking-wider text-orange-600">Unit Beruniform Dikesan</p>
                        <p className="text-xs font-black text-slate-800 mt-1 whitespace-pre-wrap">
                          {parsedGroups.uniforms?.filter(Boolean).join(', ') || 'Tiada'}
                        </p>
                      </div>
                      <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl">
                        <p className="text-[10px] font-black uppercase tracking-wider text-blue-600">Kelab & Persatuan Dikesan</p>
                        <p className="text-xs font-black text-slate-800 mt-1 whitespace-pre-wrap">
                          {parsedGroups.clubs?.filter(Boolean).join(', ') || 'Tiada'}
                        </p>
                      </div>
                      <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl">
                        <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Sukan & Permainan Dikesan</p>
                        <p className="text-xs font-black text-slate-800 mt-1 whitespace-pre-wrap">
                          {parsedGroups.sports?.filter(Boolean).join(', ') || 'Tiada'}
                        </p>
                      </div>
                    </div>

                    {/* Extracted table */}
                    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-inner max-h-[400px] overflow-y-auto">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-200高度 sticky top-0 z-10">
                          <tr className="font-extrabold text-slate-600 uppercase tracking-wider text-[10px]">
                            <th className="py-3 px-4 text-center border-r border-slate-200 w-12">Pilih</th>
                            <th className="py-3 px-4 text-center border-r border-slate-200 w-16">No. KP / ID</th>
                            <th className="py-3 px-4 border-r border-slate-200">Nama Murid</th>
                            <th className="py-3 px-3 text-center border-r border-slate-200 w-16">Kelas</th>
                            <th className="py-3 px-3 text-center border-r border-slate-200 w-16">Jantina</th>
                            <th className="py-3 px-4 border-r border-slate-200 text-orange-600">Unit Beruniform</th>
                            <th className="py-3 px-4 border-r border-slate-200 text-blue-600">Kelab & Persatuan</th>
                            <th className="py-3 px-4 text-emerald-600 font-extrabold">Sukan/Permainan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 animate-fade-in">
                          {parsedStudents.map((s) => (
                            <tr
                              key={s.tempId}
                              className={`hover:bg-slate-50 transition border-b border-slate-100 ${
                                selectedParsedRowIds[s.tempId] ? 'bg-blue-50/10' : 'opacity-60 bg-slate-50/20'
                              }`}
                            >
                              <td className="py-2.5 px-4 text-center border-r border-slate-100">
                                <input
                                  type="checkbox"
                                  checked={!!selectedParsedRowIds[s.tempId]}
                                  onChange={() => {
                                    setSelectedParsedRowIds(prev => ({
                                      ...prev,
                                      [s.tempId]: !prev[s.tempId]
                                    }));
                                  }}
                                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 focus:ring-2 border-slate-350 cursor-pointer"
                                />
                              </td>
                              <td className="py-2.5 px-4 text-center font-mono border-r border-slate-100 font-bold text-slate-500">
                                {s.student_id ? String(s.student_id).replace('temp_', '') : 'Automatis'}
                              </td>
                              <td className="py-2.5 px-4 font-black uppercase border-r border-slate-100 text-slate-800">
                                {s.name}
                              </td>
                              <td className="py-2.5 px-3 text-center font-extrabold border-r border-slate-100">
                                {s.class}
                              </td>
                              <td className="py-2.5 px-3 text-center font-bold text-slate-500 border-r border-slate-100">
                                {s.gender === 'P' ? 'P' : 'L'}
                              </td>
                              <td className="py-2.5 px-4 border-r border-slate-100 font-bold text-orange-800 uppercase">
                                {s.uniform || <span className="text-slate-300 font-normal italic">-</span>}
                              </td>
                              <td className="py-2.5 px-4 border-r border-slate-100 font-bold text-blue-800 uppercase">
                                {s.club || <span className="text-slate-300 font-normal italic">-</span>}
                              </td>
                              <td className="py-2.5 px-4 font-bold text-emerald-850 uppercase">
                                {s.sport || <span className="text-slate-300 font-normal italic">-</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Commit Section */}
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-150 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-black text-slate-850 uppercase tracking-tight">
                          Sedia untuk simpan pendaftaran?
                        </p>
                        <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mt-1">
                          Sistem akan mendaftarkan kumpulan-kumpulan baru dikesan secara automatik & memasukkan murid.
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        {committing && (
                          <span className="text-[10px] text-blue-600 font-black uppercase tracking-wider animate-pulse">
                            🔄 {commitStatus}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={handleCommitImport}
                          disabled={committing || parsedStudents.filter(s => selectedParsedRowIds[s.tempId]).length === 0}
                          className="px-6 py-3.5 bg-green-600 hover:bg-green-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-black uppercase tracking-widest rounded-xl transition shadow-lg flex items-center gap-2"
                        >
                          {committing ? "Sedang Menyimpan..." : "Sahkan & Daftar Semua Murid ✔️"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                  </>
                )}
              </div>
            </motion.div>
          )}

          {subTab === 'committee' && (
            <motion.div
              key="committee"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-8"
            >
              {/* Selector Card */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xl shadow-slate-100/50 flex flex-col gap-6 print:hidden">
                {/* 1. Category Tabs at Top (Fully spacious) */}
                <div className="flex flex-wrap items-center gap-2 pb-5 border-b border-slate-100">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-2">PILIH KATEGORI:</span>
                  {(['uniform', 'club', 'sport'] as const).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCommCategory(cat)}
                      className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm ${
                        selectedCommCategory === cat
                          ? 'bg-blue-600 text-white shadow-blue-205 shadow-md'
                          : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200 hover:text-slate-800'
                      }`}
                    >
                      {cat === 'uniform' ? '🛡️ Badan Beruniform' : cat === 'club' ? '📚 Kelab/Persatuan' : '🏀 Sukan/Permainan'}
                    </button>
                  ))}
                </div>

                {/* 2. Group Selection and Print below */}
                <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
                  <div className="flex items-center gap-3 w-full md:w-auto">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">Kumpulan:</label>
                    <select
                      value={selectedCommGroupId}
                      onChange={e => setSelectedCommGroupId(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-wide h-11 focus:ring-2 focus:ring-blue-500 outline-none w-full sm:w-64"
                    >
                      {filteredGroupsForComm.length === 0 ? (
                        <option value="">-- TIADA KUMPULAN --</option>
                      ) : (
                        filteredGroupsForComm.map(g => (
                          <option key={g.id} value={g.id}>{g.name.toUpperCase()}</option>
                        ))
                      )}
                    </select>
                  </div>
                  
                  {selectedCommGroupId && (
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="px-6 py-3 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition whitespace-nowrap shadow-md shadow-slate-900/10 w-full sm:w-auto"
                    >
                      🖨️ Cetak
                    </button>
                  )}
                </div>
              </div>

              {/* Empty state if nothing selected */}
              {!selectedCommGroupId ? (
                <div className="bg-white p-12 text-center rounded-3xl border border-slate-200 text-slate-400 italic">
                  Sila pilih kumpulan terlebih dahulu untuk melihat jawatankuasa.
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  {/* The Document Card */}
                  <div className="bg-white border-2 border-slate-300 rounded-2xl p-6 sm:p-12 w-full max-w-[800px] shadow-2xl relative text-slate-800 font-sans print:shadow-none print:border-none print:p-0">
                    
                    {/* Official Malaysian School Header Layout */}
                    <div className="flex justify-between items-center pb-6 border-b-4 border-slate-800 mb-8 gap-4">
                      <div className="w-[64px] h-[64px] sm:w-[80px] sm:h-[80px] flex items-center justify-center overflow-hidden">
                        {settings.schoolLogo ? (
                          <img referrerPolicy="no-referrer" src={settings.schoolLogo} className="max-w-full max-h-full object-contain" alt="School Logo" />
                        ) : (
                          <Award size={48} className="text-amber-500" />
                        )}
                      </div>
                      
                      <div className="text-center flex-1">
                        <h1 className="text-sm sm:text-lg font-black text-slate-900 tracking-tight leading-snug">
                          {settings.schoolName ? settings.schoolName.toUpperCase() : tenantSchoolName}
                        </h1>
                        <h2 className="text-[10px] sm:text-xs font-bold text-slate-500 tracking-wide uppercase mt-1 leading-tight">
                          JAWATANKUASA {
                            selectedCommCategory === 'uniform' ? 'BADAN BERUNIFORM' :
                            selectedCommCategory === 'club' ? 'KELAB DAN PERSATUAN' :
                            'SUKAN DAN PERMAINAN'
                          }
                        </h2>
                        <h3 className="text-lg sm:text-2xl font-black tracking-widest text-blue-600 uppercase mt-2 font-mono">
                          {groups.find(g => g.id === selectedCommGroupId)?.name}
                        </h3>
                      </div>

                      <div className="w-[64px] h-[64px] sm:w-[80px] sm:h-[80px] flex items-center justify-center overflow-hidden">
                        {settings.ts25Logo ? (
                          <img referrerPolicy="no-referrer" src={settings.ts25Logo} className="max-w-full max-h-full object-contain" alt="TS25 Logo" />
                        ) : settings.kpmLogo ? (
                          <img referrerPolicy="no-referrer" src={settings.kpmLogo} className="max-w-full max-h-full object-contain" alt="KPM Logo" />
                        ) : (
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center font-black text-blue-600 text-[9px] leading-tight text-center p-1 uppercase">TS25</div>
                        )}
                      </div>
                    </div>

                    {/* Committee Content Table Grid */}
                    <div className="border border-slate-300 rounded-xl overflow-hidden shadow-sm text-sm">
                      
                      {/* 👨‍🏫 TEACHERS ROW (Guru Penyelaras) */}
                      <div className="grid grid-cols-12 border-b border-slate-300">
                        <div className="col-span-12 sm:col-span-4 bg-orange-100/70 p-4 font-black flex flex-col justify-center border-b sm:border-b-0 sm:border-r border-slate-300 text-amber-950 uppercase text-[10px] tracking-wider leading-relaxed">
                          <span className="font-black text-amber-950">Guru Penyelaras:</span>
                          
                          {/* PKKK Admin can appoint teachers button */}
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => setShowTeacherAssignModal(true)}
                              className="mt-3 px-3 py-1.5 bg-blue-600 hover:bg-slate-900 text-white text-[9px] font-black tracking-widest uppercase rounded-lg shadow-sm transition self-start print:hidden"
                            >
                              委任 / Urus Guru
                            </button>
                          )}
                        </div>
                        
                        <div className="col-span-12 sm:col-span-8 p-3 flex flex-col gap-2 min-h-[80px] justify-center bg-orange-50/20">
                          {!(currentCommittee?.teachers || []).length ? (
                            <span className="text-slate-400 italic uppercase text-[10px] font-bold">Tiada guru dilantik oleh PKKK.</span>
                          ) : (
                            (currentCommittee?.teachers || []).map((tName: string, idx: number) => (
                              <div key={idx} className="bg-orange-50 border border-orange-200 px-4 py-2.5 rounded-lg font-black text-amber-950 text-xs tracking-wide uppercase shadow-sm">
                                {tName}
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* 👥 STANDARD COMMITTEE MEMBERS (Pengerusi, Naib Pengerusi, etc.) */}
                      {[
                        { key: 'pengerusi', label: 'Pengerusi' },
                        { key: 'naib_pengerusi', label: 'Naib Pengerusi' },
                        { key: 'setiausaha', label: 'Setiausaha' },
                        { key: 'penolong_setiausaha', label: 'Penolong Setiausaha' },
                        { key: 'bendahari', label: 'Bendahari' },
                        { key: 'penolong_bendahari', label: 'Penolong Bendahari' },
                      ].map(field => {
                        const currentVal = currentCommittee?.[field.key] || '';
                        return (
                          <div key={field.key} className="grid grid-cols-12 border-b border-slate-300">
                            <div className="col-span-12 sm:col-span-4 bg-orange-100/45 p-4 font-bold flex items-center border-b sm:border-b-0 sm:border-r border-slate-300 text-amber-900 text-[10px] tracking-wider uppercase">
                              {field.label}:
                            </div>
                            
                            <div className="col-span-12 sm:col-span-8 p-2 flex items-center bg-white">
                              {canEdit ? (
                                <select
                                  value={currentVal}
                                  onChange={e => handleUpdateCommitteeField(field.key, e.target.value)}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wider outline-none h-11 focus:bg-white focus:ring-1 focus:ring-blue-500 transition-all font-sans"
                                >
                                  <option value="">-- SILA PILIH MURID --</option>
                                  {currentGroupMembers.map(m => {
                                    const s = studentsMap.get(m.student_id.toLowerCase().trim());
                                    const displayClass = s ? s.class : m.class;
                                    const displayYear = s ? `TAHUN ${s.year}` : `TAHUN ${m.class}`;
                                    return (
                                      <option key={m.student_id} value={m.student_id}>
                                        {m.name.toUpperCase()} ({displayYear} - {displayClass.toUpperCase()})
                                      </option>
                                    );
                                  })}
                                </select>
                              ) : (
                                <div className="px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-800">
                                  {currentGroupMembers.find(m => m.student_id === currentVal)?.name.toUpperCase() || '--- BELUM DILANTIK ---'}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* AJK Separator Row */}
                      <div className="grid grid-cols-12 border-b border-slate-300 bg-slate-900 text-white font-black">
                        <div className="col-span-12 p-3 text-center uppercase text-[9px] tracking-[0.2em] font-black">
                          Ahli Jawatankuasa (AJK) Wakil Tahun
                        </div>
                      </div>

                      {/* AJK Wakil Tahun (Tahun 4, Tahun 5, Tahun 6) */}
                      {[
                        { key: 'ajk_tahun4', label: 'Tahun 4', list: year4Members },
                        { key: 'ajk_tahun5', label: 'Tahun 5', list: year5Members },
                        { key: 'ajk_tahun6', label: 'Tahun 6', list: year6Members }
                      ].map(field => {
                        const currentVal = currentCommittee?.[field.key] || '';
                        return (
                          <div key={field.key} className="grid grid-cols-12 border-b border-slate-300 last:border-b-0">
                            <div className="col-span-12 sm:col-span-4 bg-orange-100/45 p-4 font-bold flex items-center border-b sm:border-b-0 sm:border-r border-slate-300 text-amber-900 text-[10px] tracking-wider uppercase">
                              Wakil {field.label}:
                            </div>
                            
                            <div className="col-span-12 sm:col-span-8 p-2 flex items-center bg-white">
                              {canEdit ? (
                                <select
                                  value={currentVal}
                                  onChange={e => handleUpdateCommitteeField(field.key, e.target.value)}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wider outline-none h-11 focus:bg-white focus:ring-1 focus:ring-blue-500 transition-all font-sans"
                                >
                                  <option value="">-- SILA PILIH MURID ({field.label}) --</option>
                                  {field.list.map(m => {
                                    const s = studentsMap.get(m.student_id.toLowerCase().trim());
                                    const displayClass = s ? s.class : m.class;
                                    return (
                                      <option key={m.student_id} value={m.student_id}>
                                        {m.name.toUpperCase()} ({displayClass.toUpperCase()})
                                      </option>
                                    );
                                  })}
                                </select>
                              ) : (
                                <div className="px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-800">
                                  {field.list.find(m => m.student_id === currentVal)?.name.toUpperCase() || '--- BELUM DILANTIK ---'}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                    </div>

                    {/* Official Footer Signature Area for Print */}
                    <div className="hidden print:flex justify-between items-center mt-16 text-xs uppercase font-bold text-slate-800">
                      <div className="text-center w-56 border-t border-slate-400 pt-3">
                        Disediakan Oleh,
                        <div className="h-10"></div>
                        <span>...........................................</span>
                        <span className="block text-[10px] font-black text-slate-500 mt-1">GURU PENASIHAT</span>
                      </div>
                      
                      <div className="text-center w-56 border-t border-slate-400 pt-3">
                        Diasahkan Oleh,
                        <div className="h-10"></div>
                        <span>...........................................</span>
                        <span className="block text-[10px] font-black text-slate-500 mt-1">PEN. KANAN KOKURIKULUM</span>
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {/* 📋 MODAL: TEACHER ASSIGNMENT FOR PKKK */}
              {showTeacherAssignModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200 print:hidden font-sans">
                  <div className="bg-white rounded-[32px] border border-slate-200 shadow-2xl max-w-md w-full p-8 space-y-6 relative max-h-[85vh] flex flex-col text-slate-800">
                    <button 
                      type="button"
                      onClick={() => setShowTeacherAssignModal(false)}
                      className="absolute right-6 top-6 text-slate-400 hover:text-slate-600 transition-colors p-2 hover:bg-slate-50 rounded-xl"
                    >
                      <X size={20} />
                    </button>

                    <div>
                      <h3 className="text-lg font-black italic uppercase tracking-tighter text-slate-800 flex items-center gap-2">
                        <span>👨‍🏫</span> Lantikan Guru Penasihat
                      </h3>
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-0.5">
                        Sila tandakan guru-guru yang dilantik untuk mengurus kumpulan ini.
                      </p>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2 space-y-2 max-h-[45vh] border-y border-slate-100 py-4 font-sans">
                      {teachers.length === 0 ? (
                        <p className="text-slate-400 text-xs italic text-center py-6">Tiada rekod guru berdaftar dalam sistem.</p>
                      ) : (
                        teachers.sort((a,b) => a.name.localeCompare(b.name)).map(t => {
                          const isSelected = (currentCommittee?.teachers || []).includes(t.name);
                          return (
                            <label 
                              key={t.id} 
                              className={`flex items-center justify-between p-3.5 rounded-2xl cursor-pointer border transition-all ${
                                isSelected 
                                  ? 'bg-blue-50/50 border-blue-200 text-blue-950 font-black' 
                                  : 'bg-white border-slate-100 text-slate-700 hover:bg-slate-50 hover:border-slate-200'
                              }`}
                            >
                              <div className="flex flex-col">
                                <span className="text-xs uppercase tracking-wide font-bold">{t.name}</span>
                                <span className="text-[9px] font-mono text-slate-400 uppercase">{t.email || '-'}</span>
                              </div>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={async (e) => {
                                  const checked = e.target.checked;
                                  const activeTeachers = currentCommittee?.teachers || [];
                                  const updatedTeachers = checked 
                                    ? [...activeTeachers, t.name] 
                                    : activeTeachers.filter((x: string) => x !== t.name);
                                  
                                  await handleUpdateCommitteeField('teachers', updatedTeachers);
                                }}
                                className="w-5 h-5 rounded border-slate-350 text-blue-600 focus:ring-blue-500 accent-blue-600"
                              />
                            </label>
                          );
                        })
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowTeacherAssignModal(false)}
                      className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg transition-all"
                    >
                      Selesai Lantikan ✔️
                    </button>
                  </div>
                </div>
              )}

            </motion.div>
          )}

        </AnimatePresence>
      )}

      {/* 🔮 SELECTION MODAL: CHOOSE CUSTOM INITIAL DEFAULTS */}
      {showInitModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-[32px] border border-slate-200 shadow-2xl max-w-2xl w-full p-8 space-y-6 relative max-h-[90vh] overflow-y-auto my-8">
            <button 
              onClick={() => setShowInitModal(false)}
              className="absolute right-6 top-6 text-slate-400 hover:text-slate-600 transition-colors p-2 hover:bg-slate-50 rounded-xl"
            >
              <X size={20} />
            </button>

            <div>
              <span className="bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-wider px-3.5 py-1 rounded-full">
                Sediakan Laluan Asal
              </span>
              <h3 className="text-xl font-black italic uppercase tracking-tighter text-slate-800 mt-2 flex items-center gap-2">
                <Sparkles className="text-amber-500 animate-pulse" size={24} />
                Pilih Kumpulan Laluan Asal
              </h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                Suaikan senarai mengikut saiz dan penawaran di sekolah anda
              </p>
            </div>

            {/* Help Advisory */}
            <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl text-xs flex gap-3 text-blue-900">
              <span className="text-lg">💡</span>
              <div>
                <p className="font-extrabold uppercase text-[10px] tracking-wider text-blue-950">Tip Sekolah Kecil</p>
                <p className="font-medium mt-0.5 text-blue-700">Pastikan anda hanya menanda kelab atau unit yang betul-betul aktif di sekolah anda. Kebanyakan SJK(C) mikro hanya menawarkan <strong className="font-black">1 atau 2 pilihan</strong> untuk memudahkan giliran guru.</p>
              </div>
            </div>

            <div className="space-y-6">
              
              {/* 1. BADAN BERUNIFORM */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-orange-100 pb-1.5">
                  <span className="text-xs font-black text-orange-600 uppercase tracking-wider flex items-center gap-1.5 font-bold">
                    1. Badan Beruniform
                  </span>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setSelectedInitUniforms(DEFAULT_UNIFORMS)}
                      className="text-[9px] font-black uppercase text-blue-600 hover:underline"
                    >
                      Pilih Semua
                    </button>
                    <span className="text-slate-300 text-[9px]">•</span>
                    <button 
                      onClick={() => setSelectedInitUniforms([])}
                      className="text-[9px] font-black uppercase text-slate-500 hover:underline"
                    >
                      Padam Semua
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {DEFAULT_UNIFORMS.map(name => {
                    const isChecked = selectedInitUniforms.includes(name);
                    return (
                      <label 
                        key={name}
                        className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all select-none ${
                          isChecked 
                            ? 'bg-orange-50/50 border-orange-500 text-orange-950 font-bold' 
                            : 'bg-white border-slate-100 text-slate-450 hover:border-slate-300'
                        }`}
                      >
                        <input 
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedInitUniforms(prev => prev.filter(x => x !== name));
                            } else {
                              setSelectedInitUniforms(prev => [...prev, name]);
                            }
                          }}
                          className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 accent-orange-600"
                        />
                        <span className="text-xs font-black uppercase tracking-wider">{name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* 2. KELAB & PERSATUAN */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-blue-100 pb-1.5">
                  <span className="text-xs font-black text-blue-600 uppercase tracking-wider flex items-center gap-1.5 font-bold">
                    2. Kelab & Persatuan
                  </span>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setSelectedInitClubs(DEFAULT_CLUBS)}
                      className="text-[9px] font-black uppercase text-blue-600 hover:underline"
                    >
                      Pilih Semua
                    </button>
                    <span className="text-slate-300 text-[9px]">•</span>
                    <button 
                      onClick={() => setSelectedInitClubs([])}
                      className="text-[9px] font-black uppercase text-slate-500 hover:underline"
                    >
                      Padam Semua
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {DEFAULT_CLUBS.map(name => {
                    const isChecked = selectedInitClubs.includes(name);
                    return (
                      <label 
                        key={name}
                        className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all select-none ${
                          isChecked 
                            ? 'bg-blue-50/50 border-blue-500 text-blue-950 font-bold' 
                            : 'bg-white border-slate-100 text-slate-455 hover:border-slate-300'
                        }`}
                      >
                        <input 
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedInitClubs(prev => prev.filter(x => x !== name));
                            } else {
                              setSelectedInitClubs(prev => [...prev, name]);
                            }
                          }}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 accent-blue-600"
                        />
                        <span className="text-xs font-black uppercase tracking-wider truncate">{name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* 3. SUKAN & PERMAINAN */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-emerald-100 pb-1.5 font-bold">
                  <span className="text-xs font-black text-emerald-600 uppercase tracking-wider flex items-center gap-1.5 font-bold">
                    3. Sukan & Permainan
                  </span>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setSelectedInitSports(DEFAULT_SPORTS)}
                      className="text-[9px] font-black uppercase text-blue-600 hover:underline"
                    >
                      Pilih Semua
                    </button>
                    <span className="text-slate-300 text-[9px]">•</span>
                    <button 
                      onClick={() => setSelectedInitSports([])}
                      className="text-[9px] font-black uppercase text-slate-500 hover:underline"
                    >
                      Padam Semua
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {DEFAULT_SPORTS.map(name => {
                    const isChecked = selectedInitSports.includes(name);
                    return (
                      <label 
                        key={name}
                        className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all select-none ${
                          isChecked 
                            ? 'bg-emerald-50/50 border-emerald-500 text-emerald-950 font-bold' 
                            : 'bg-white border-slate-100 text-slate-455 hover:border-slate-300'
                        }`}
                      >
                        <input 
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedInitSports(prev => prev.filter(x => x !== name));
                            } else {
                              setSelectedInitSports(prev => [...prev, name]);
                            }
                          }}
                          className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
                        />
                        <span className="text-xs font-black uppercase tracking-wider truncate">{name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Action Footer */}
            <div className="flex gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowInitModal(false)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase tracking-widest transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={initializeDefaultGroups}
                disabled={initializing || (selectedInitUniforms.length === 0 && selectedInitClubs.length === 0 && selectedInitSports.length === 0)}
                className="flex-[2] py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-100 transition-all flex items-center justify-center gap-2 font-bold"
              >
                {initializing ? (
                  <>
                    <RefreshCw className="animate-spin" size={14} />
                    Menyediakan...
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    Sahkan & Bina ({selectedInitUniforms.length + selectedInitClubs.length + selectedInitSports.length} Kumpulan)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


