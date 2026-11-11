
import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, query, where, deleteDoc, doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { Student, UserProfile } from '../../types';
import { ACADEMIC_YEARS, DEFAULT_ACADEMIC_YEAR, CLASSES, SCHOOL_NAME_MS } from '../../constants';
import SchoolLogo from '../SchoolLogo';
import { FileUp, Users, Trash2, Search, Table as TableIcon, AlertCircle, Info, Download, Edit3, Plus } from 'lucide-react';
import * as XLSX from 'xlsx';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function AssessmentSecretaryView() {
  const [activeTab, setActiveTab] = useState<'students' | 'teachers'>('students');
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number>(1);
  const [academicYear, setAcademicYear] = useState(DEFAULT_ACADEMIC_YEAR);
  const [searchQuery, setSearchQuery] = useState('');
  const [teacherSearchQuery, setTeacherSearchQuery] = useState('');

  // Student manual add and edit states
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editName, setEditName] = useState('');
  const [editStudentId, setEditStudentId] = useState('');
  const [editClass, setEditClass] = useState('');
  const [editYear, setEditYear] = useState<number>(1);
  const [editGender, setEditGender] = useState<'L' | 'P' | ''>('');
  const [editRace, setEditRace] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addName, setAddName] = useState('');
  const [addStudentId, setAddStudentId] = useState('');
  const [addClass, setAddClass] = useState('Utama');
  const [addYear, setAddYear] = useState<number>(1);
  const [addGender, setAddGender] = useState<'L' | 'P' | ''>('');
  const [addRace, setAddRace] = useState('');
  const [addingStudentState, setAddingStudentState] = useState(false);

  const academicYears = ACADEMIC_YEARS;

  const saveStudentEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    if (!editName.trim() || !editStudentId.trim()) {
      alert("Nama dan No. KP tidak boleh dibiarkan kosong.");
      return;
    }

    setSavingEdit(true);
    try {
      const studentDocRef = doc(db, 'students', editingStudent.id);
      const updatedFields: any = {
        name: editName.toUpperCase().trim(),
        student_id: editStudentId.trim(),
        class: editClass.trim(),
        year: Number(editYear),
      };
      if (editGender) updatedFields.gender = editGender;
      if (editRace) updatedFields.race = editRace;

      await updateDoc(studentDocRef, updatedFields);

      // Kemas kini keahlian kokurikulum jika wujud
      try {
        const kokoRef = doc(db, 'koko_memberships', editStudentId.trim());
        await setDoc(kokoRef, {
          name: editName.toUpperCase().trim(),
          class: editClass.trim(),
          academic_year: academicYear,
          ...(editGender && { gender: editGender }),
          ...(editRace && { race: editRace })
        }, { merge: true });
      } catch (errk) {
        console.log("Failed to sync to Koko membership:", errk);
      }

      await fetchStudents();
      setEditingStudent(null);
      alert("Data murid berjaya dikemas kini!");
    } catch (err: any) {
      console.error(err);
      alert("Gagal mengemaskini data murid: " + err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAddStudentManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim() || !addStudentId.trim()) {
      alert("Nama dan No. KP tidak boleh dibiarkan kosong.");
      return;
    }

    setAddingStudentState(true);
    try {
      const q = query(
        collection(db, 'students'),
        where('student_id', '==', addStudentId.trim()),
        where('academic_year', '==', academicYear)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        alert("Murid dengan ID / MyKad ini telah sedia ada untuk sesi akademik ini!");
        setAddingStudentState(false);
        return;
      }

      const studentData: any = {
        student_id: addStudentId.trim(),
        name: addName.toUpperCase().trim(),
        class: addClass.trim(),
        year: Number(addYear),
        academic_year: academicYear,
      };
      if (addGender) studentData.gender = addGender;
      if (addRace) studentData.race = addRace;

      await addDoc(collection(db, 'students'), studentData);

      // Sediakan default koko membership
      try {
        const kokoRef = doc(db, 'koko_memberships', addStudentId.trim());
        await setDoc(kokoRef, {
          student_id: addStudentId.trim(),
          name: addName.toUpperCase().trim(),
          class: addClass.trim(),
          academic_year: academicYear,
          gender: addGender || 'L',
          race: addRace || '',
          uniform: '',
          club: '',
          sport: ''
        });
      } catch (errk) {
        console.log("Failed to create default koko membership:", errk);
      }

      await fetchStudents();
      setShowAddModal(false);
      setAddName('');
      setAddStudentId('');
      setAddClass('Utama');
      setAddYear(1);
      setAddGender('');
      setAddRace('');
      alert("Murid baru berjaya ditambah!");
    } catch (err: any) {
      console.error(err);
      alert("Gagal menambah murid: " + err.message);
    } finally {
      setAddingStudentState(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, [selectedYear, academicYear]);

  useEffect(() => {
    fetchTeachers();
  }, []);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'students'),
        where('year', '==', selectedYear),
        where('academic_year', '==', academicYear)
      );

      const snapshot = await getDocs(q);
      const studentList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
      setStudents(studentList.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  const fetchTeachers = async () => {
    setLoading(true);
    try {
      const q = collection(db, 'teachers');
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setTeachers(list.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        if (!data) throw new Error('Fail tidak dapat dibaca.');

        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];
        if (!rows || rows.length === 0) {
          alert('Fail Excel kosong.');
          setLoading(false);
          return;
        }

        console.log('Total baris dijumpai:', rows.length);

        // Ambil semua murid sedia ada untuk mengelakkan ralat data bertindih
        const existingSnap = await getDocs(query(
          collection(db, 'students'),
          where('academic_year', '==', academicYear)
        ));
        const existingStudents = existingSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
        
        const existingById = new Map<string, Student>();
        const existingByName = new Map<string, Student>();
        
        existingStudents.forEach(s => {
          if (s.student_id) {
            existingById.set(s.student_id.trim().toLowerCase(), s);
          }
          if (s.name) {
            existingByName.set(s.name.trim().toLowerCase(), s);
          }
        });

        let nameCol = -1;
        let idCol = -1;
        let yearCol = -1;
        let classCol = -1;
        let genderCol = -1;
        let raceCol = -1;
        let emailCol = -1;
        let startIndex = 0;

        const nameKeywords = ['name', 'nama', 'murid', 'student'];
        const idKeywords = ['id', 'kp', 'mykad', 'nokp', 'pendaftaran'];
        const yearKeywords = ['tahun', 'year', 'darjah', 'grade'];
        const classKeywords = ['kelas', 'class', 'bilik'];
        const genderKeywords = ['jantina', 'jan', 'gender', 'sex'];
        const raceKeywords = ['kaum', 'bangsa', 'race', 'ethnic', 'etnik'];
        const emailKeywords = ['email', 'emel', 'delima', 'mel'];

        // Cari header dalam 10 baris pertama
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          const rowSearch = rows[i].map(c => String(c || '').toLowerCase().trim());
          
          const nIdx = rowSearch.findIndex(c => nameKeywords.some(k => c.includes(k)));
          const iIdx = rowSearch.findIndex(c => idKeywords.some(k => c === k || (k.length > 2 && c.includes(k)))); 
          const yIdx = rowSearch.findIndex(c => yearKeywords.some(k => c.includes(k)));
          const cIdx = rowSearch.findIndex(c => classKeywords.some(k => c.includes(k)));
          const gIdx = rowSearch.findIndex(c => genderKeywords.some(k => c === k || c.includes(k)));
          const rIdx = rowSearch.findIndex(c => raceKeywords.some(k => c === k || c.includes(k)));
          const eIdx = rowSearch.findIndex(c => emailKeywords.some(k => c.includes(k)));

          if (nIdx !== -1) nameCol = nIdx;
          if (iIdx !== -1 && iIdx !== nIdx) idCol = iIdx;
          if (yIdx !== -1) yearCol = yIdx;
          if (cIdx !== -1) classCol = cIdx;
          if (gIdx !== -1) genderCol = gIdx;
          if (rIdx !== -1) raceCol = rIdx;
          if (eIdx !== -1) emailCol = eIdx;

          if (nameCol !== -1) {
            startIndex = i + 1;
            console.log(`Header dikesan di baris ${i}`);
            break;
          }
        }

        // Fallback khas untuk format user (ID=0, Nama=1, Tahun=2)
        if (nameCol === -1) {
          idCol = 0;
          nameCol = 1;
          yearCol = 2;
          startIndex = 0;
        }

        const dataRows = rows.slice(startIndex);
        let importedCount = 0;
        const yearSummary: Record<number, number> = {};

        for (const row of dataRows) {
          if (!row || row.length <= 1) continue;

          const rawName = String(row[nameCol] || '').trim();
          if (!rawName) continue;

          let rawId = String(row[idCol] || '').trim();
          if (!rawId || rawId === rawName) {
            rawId = `S-${rawName.replace(/\s+/g, '-').slice(0, 10)}-${Math.floor(Math.random() * 1000)}`;
          }

          let finalYear = selectedYear;
          let finalClass = 'Utama';
          let finalGender: 'L' | 'P' | undefined = undefined;
          let finalRace = '';
          let finalEmail = '';

          // Ambil E-Mel
          if (emailCol !== -1 && row[emailCol] !== undefined && row[emailCol] !== '') {
            finalEmail = String(row[emailCol]).trim().toLowerCase();
          }

          // Ambil Tahun
          if (yearCol !== -1 && row[yearCol] !== undefined && row[yearCol] !== '') {
            const y = parseInt(String(row[yearCol]).replace(/[^0-9]/g, ''));
            if (!isNaN(y) && y >= 1 && y <= 6) finalYear = y;
          }

          // Ambil Gender
          if (genderCol !== -1 && row[genderCol]) {
            const g = String(row[genderCol]).toUpperCase().trim();
            if (g === 'L' || g === 'LELAKI' || g === 'MALE' || g === 'M') finalGender = 'L';
            if (g === 'P' || g === 'PEREMPUAN' || g === 'FEMALE' || g === 'F') finalGender = 'P';
          }

          // Ambil Kaum
          if (raceCol !== -1 && row[raceCol] !== undefined && row[raceCol] !== '') {
            finalRace = String(row[raceCol]).trim();
          }

          // Ambil Kelas
          if (classCol !== -1 && row[classCol] !== undefined && row[classCol] !== '') {
            const cStr = String(row[classCol]).trim();
            // Cek jika kelas ada dalam senarai standard kita (CLASSES)
            // Jika tidak, kita cuba cari padanan paling hampir atau gunakan 'Tiada Kelas' jika ia bermaksud tiada
            const upperC = cStr.toUpperCase();
            if (upperC === 'TIADA' || upperC === 'TIADA KELAS' || upperC === 'NONE' || cStr === '-') {
              finalClass = 'Amanah';
            } else {
              // Cuba cari padanan dalam senarai standard (case insensitive)
              const matchedClass = CLASSES.find(c => c.toLowerCase() === cStr.toLowerCase());
              if (matchedClass) {
                finalClass = matchedClass;
              } else {
                finalClass = cStr;
              }
            }
          }

          const cleanId = rawId.trim().toLowerCase();
          const cleanName = rawName.toUpperCase().trim().toLowerCase();
          const existingStudent = existingById.get(cleanId) || existingByName.get(cleanName);

          const studentData: any = {
            student_id: rawId,
            name: rawName.toUpperCase(),
            class: finalClass,
            year: Number(finalYear),
            academic_year: academicYear,
          };
          if (finalGender) studentData.gender = finalGender;
          if (finalRace) studentData.race = finalRace;
          if (finalEmail) studentData.email = finalEmail;
          
          try {
            if (existingStudent) {
              const docRef = doc(db, 'students', existingStudent.id);
              await updateDoc(docRef, studentData);

              const oldSId = existingStudent.student_id;
              const newSId = rawId;

              // If the student_id has changed, migrate all matching records in related collections
              if (oldSId && newSId && oldSId.trim().toLowerCase() !== newSId.trim().toLowerCase()) {
                console.log(`Migrating records for student ${rawName.toUpperCase()} from old ID ${oldSId} to new ID ${newSId}`);
                
                // 1. Migrate UASA Results
                try {
                  const uasaSnap = await getDocs(query(collection(db, 'uasa_results'), where('student_id', '==', oldSId)));
                  for (const uDoc of uasaSnap.docs) {
                    const uData = uDoc.data();
                    const oldDocId = uDoc.id;
                    const newDocId = oldDocId.replace(oldSId, newSId);
                    
                    await setDoc(doc(db, 'uasa_results', newDocId), {
                      ...uData,
                      student_id: newSId,
                      updatedAt: serverTimestamp()
                    });
                    await deleteDoc(uDoc.ref);
                  }
                } catch (erru) {
                  console.error("Gagal bermigrasi data UASA:", erru);
                }

                // 2. Migrate PBD Results
                try {
                  const pbdSnap = await getDocs(query(collection(db, 'pbd_results'), where('student_id', '==', oldSId)));
                  for (const pDoc of pbdSnap.docs) {
                    const pData = pDoc.data();
                    const oldDocId = pDoc.id;
                    const newDocId = oldDocId.replace(oldSId, newSId);
                    
                    await setDoc(doc(db, 'pbd_results', newDocId), {
                      ...pData,
                      student_id: newSId,
                      updatedAt: serverTimestamp()
                    });
                    await deleteDoc(pDoc.ref);
                  }
                } catch (errp) {
                  console.error("Gagal bermigrasi data PBD:", errp);
                }

                // 3. Migrate Co-curricular (Kokurikulum) Memberships
                try {
                  const kokoSnap = await getDocs(query(collection(db, 'koko_memberships'), where('student_id', '==', oldSId)));
                  for (const kDoc of kokoSnap.docs) {
                    const kData = kDoc.data();
                    const oldDocId = kDoc.id;
                    const newDocId = oldDocId.replace(oldSId, newSId);
                    
                    await setDoc(doc(db, 'koko_memberships', newDocId), {
                      ...kData,
                      student_id: newSId,
                    });
                    await deleteDoc(kDoc.ref);
                  }
                } catch (errk) {
                  console.error("Gagal bermigrasi data kokurikulum:", errk);
                }
              } else {
                // Keep koko memberships up to date if student_id was same
                try {
                  const kokoRef = doc(db, 'koko_memberships', rawId);
                  await setDoc(kokoRef, {
                    name: rawName.toUpperCase(),
                    class: finalClass,
                    academic_year: academicYear,
                    ...(finalGender && { gender: finalGender }),
                    ...(finalRace && { race: finalRace })
                  }, { merge: true });
                } catch (errk) {
                  console.log("Gagal mengemas kini koko membership:", errk);
                }
              }
            } else {
              await addDoc(collection(db, 'students'), studentData);
            }
            importedCount++;
            yearSummary[finalYear] = (yearSummary[finalYear] || 0) + 1;
          } catch (e: any) {
            console.error('Gagal tambah murid:', rawName, e);
            if (e.code === 'permission-denied') {
               throw new Error('Akses ditolak: Anda tidak mempunyai kebenaran untuk menambah data murid. Sila pastikan Profil anda telah disahkan.');
            }
          }
        }

        await fetchStudents();
        
        if (importedCount > 0) {
          let summary = `Berjaya import ${importedCount} murid!\n\nRingkasan Data:`;
          Object.keys(yearSummary).sort().forEach(yr => {
            summary += `\nTahun ${yr}: ${yearSummary[Number(yr)]} murid`;
          });
          alert(summary);
        } else {
          alert('Gagal mengimport data. Sila pastikan:\n1. Kolum Nama Murid ada dalam fail.\n2. Anda mempunyai akses internet yang stabil.\n3. Fail Excel tidak diprotect.');
        }
      } catch (err) {
        console.error('Import error:', err);
        alert(err instanceof Error ? err.message : 'Ralat semasa proses import fail.');
      } finally {
        setLoading(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.onerror = () => {
      alert('Ralat pembacaan fail.');
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const deleteStudent = async (id: string) => {
    if (!confirm('Hapus murid ini?')) return;
    try {
      await deleteDoc(doc(db, 'students', id));
      setStudents(prev => prev.filter(s => s.id !== id));
    } catch (error) {
      alert('Gagal memadam murid.');
    }
  };

  const deleteTeacher = async (id: string) => {
    if (!confirm('Hapus maklumat guru ini?')) return;
    try {
      await deleteDoc(doc(db, 'teachers', id));
      setTeachers(prev => prev.filter(t => t.id !== id));
    } catch (error) {
      alert('Gagal memadam maklumat guru.');
    }
  };

  const handleTeacherExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        if (!data) throw new Error('Fail tidak dapat dibaca.');

        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];
        if (!rows || rows.length === 0) {
          alert('Fail Excel kosong.');
          setLoading(false);
          return;
        }

        console.log('Total baris guru dijumpai:', rows.length);

        let nameCol = -1;
        let icCol = -1;
        let emailCol = -1;
        let startIndex = 0;

        const nameKeywords = ['name', 'nama', 'guru', 'teacher', 'jurulatih'];
        const icKeywords = ['ic', 'kp', 'nokp', 'kad pengenalan', 'pendaftaran', 'kad'];
        const emailKeywords = ['email', 'emel', 'delima', 'mel'];

        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          const rowSearch = rows[i].map(c => String(c || '').toLowerCase().trim());
          
          const nIdx = rowSearch.findIndex(c => nameKeywords.some(k => c.includes(k)));
          const iIdx = rowSearch.findIndex(c => icKeywords.some(k => c === k || c.includes(k))); 
          const eIdx = rowSearch.findIndex(c => emailKeywords.some(k => c.includes(k)));

          if (nIdx !== -1) nameCol = nIdx;
          if (iIdx !== -1) icCol = iIdx;
          if (eIdx !== -1) emailCol = eIdx;

          if (nameCol !== -1) {
            startIndex = i + 1;
            break;
          }
        }

        if (nameCol === -1) {
          nameCol = 0;
          icCol = 1;
          emailCol = 2;
          startIndex = 0;
        }

        const dataRows = rows.slice(startIndex);
        let importedCount = 0;

        for (const row of dataRows) {
          if (!row || row.length === 0) continue;

          const rawName = String(row[nameCol] || '').trim();
          if (!rawName) continue;

          const rawIc = icCol !== -1 ? String(row[icCol] || '').trim() : '-';
          const rawEmail = emailCol !== -1 ? String(row[emailCol] || '').trim().toLowerCase() : '-';

          const teacherData = {
            name: rawName.toUpperCase(),
            ic: rawIc,
            email: rawEmail
          };
          
          try {
            await addDoc(collection(db, 'teachers'), teacherData);
            importedCount++;
          } catch (e: any) {
            console.error('Gagal tambah guru:', rawName, e);
          }
        }

        await fetchTeachers();
        
        if (importedCount > 0) {
          alert(`Berjaya mengimport ${importedCount} orang guru!`);
        } else {
          alert('Gagal mengimport data guru. Sila semak semula fail asal.');
        }
      } catch (err) {
        console.error('Import error:', err);
        alert(err instanceof Error ? err.message : 'Ralat semasa proses import fail.');
      } finally {
        setLoading(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.onerror = () => {
      alert('Ralat pembacaan fail.');
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const promoteStudents = async () => {
    if (students.length === 0) {
      alert('Tiada murid untuk dinaikkan kelas.');
      return;
    }
    if (selectedYear >= 6) {
      alert('Murid Tahun 6 tidak boleh dinaikkan kelas (Tamat Sekolah).');
      return;
    }
    
    const nextYear = selectedYear + 1;
    const nextSession = academicYears[academicYears.indexOf(academicYear) + 1];
    
    if (!nextSession) {
      alert('Sila pilih sesi akademik yang sah untuk kenaikan kelas.');
      return;
    }

    if (!confirm(`NAIK KELAS: Adakah anda pasti untuk menaikkan ${students.length} murid dari Tahun ${selectedYear} ke Tahun ${nextYear} untuk sesi ${nextSession}?`)) return;

    setLoading(true);
    try {
      const promises = students.map(async (s) => {
        const studentData = {
          student_id: s.student_id,
          name: s.name,
          class: s.class,
          year: nextYear,
          academic_year: nextSession
        };
        return await addDoc(collection(db, 'students'), studentData);
      });
      await Promise.all(promises);
      alert('Berjaya menaikkan kelas murid ke tahun dan sesi hadapan!');
      setAcademicYear(nextSession);
      setSelectedYear(nextYear);
    } catch (error) {
      console.error(error);
      alert('Ralat semasa proses kenaikan kelas.');
    }
    setLoading(false);
  };

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.student_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredTeachers = teachers.filter(t =>
    t.name.toLowerCase().includes(teacherSearchQuery.toLowerCase()) ||
    t.ic.toLowerCase().includes(teacherSearchQuery.toLowerCase()) ||
    t.email.toLowerCase().includes(teacherSearchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 text-slate-800 pb-20">
      <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <SchoolLogo className="w-20 h-20" p="p-1" />
          <div>
            <div className="flex flex-col">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-none">{SCHOOL_NAME_MS}</h4>
              <h1 className="text-3xl font-black italic uppercase tracking-tighter text-slate-900 leading-none">Setiausaha Pentaksiran</h1>
            </div>
            <p className="text-slate-500 font-medium mt-2">
              {activeTab === 'students' ? 'Pengurusan data murid untuk seluruh sekolah.' : 'Import dan pengurusan data jurulatih / guru kokurikulum.'}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          {activeTab === 'students' ? (
            <label className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 px-6 rounded-2xl cursor-pointer transition-all shadow-lg shadow-emerald-600/20 uppercase text-xs tracking-widest">
              <FileUp size={18} />
              Import Murid (Excel)
              <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleExcelImport} />
            </label>
          ) : (
            <label className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 px-6 rounded-2xl cursor-pointer transition-all shadow-lg shadow-indigo-600/20 uppercase text-xs tracking-widest">
              <FileUp size={18} />
              Import Guru (Excel)
              <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleTeacherExcelImport} />
            </label>
          )}
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex border-b border-slate-200 gap-4 mb-2">
        <button
          onClick={() => setActiveTab('students')}
          className={`pb-3 px-4 font-black uppercase text-xs tracking-wider border-b-2 transition-all ${activeTab === 'students' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
          Sistem Murid
        </button>
        <button
          onClick={() => setActiveTab('teachers')}
          className={`pb-3 px-4 font-black uppercase text-xs tracking-wider border-b-2 transition-all ${activeTab === 'teachers' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
          Import Data Guru
        </button>
      </div>

      {activeTab === 'students' ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
                <h3 className="font-bold text-sm text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Users size={16} /> Tapisan
                </h3>
                <div className="flex flex-col gap-3">
                    <div>
                        <label className="text-xs font-bold text-slate-500 mb-1 block">Sesi Akademik</label>
                        <select 
                            value={academicYear} 
                            onChange={(e) => setAcademicYear(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {academicYears.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 mb-1 block">Tahun / Darjah</label>
                        <select 
                            value={selectedYear} 
                            onChange={(e) => setSelectedYear(Number(e.target.value))}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {[1,2,3,4,5,6].map(y => <option key={y} value={y}>Tahun {y}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
                <h3 className="font-bold text-sm text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Search size={16} /> Carian Murid
                </h3>
                <div className="relative">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                        type="text"
                        placeholder="Cari nama atau MyKad murid..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 outline-none focus:ring-2 focus:ring-blue-500"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="flex items-start gap-2 bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <Info size={16} className="text-blue-500 mt-0.5" />
                    <p className="text-xs text-blue-700 leading-relaxed">
                        Data yang diimport di sini akan dipaparkan secara automatik dalam modul Guru Kelas dan Guru Mata Pelajaran mengikut kelas yang dipilih.
                    </p>
                </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center gap-4">
                 <h3 className="font-bold text-sm text-slate-400 uppercase tracking-wider">Tugas Akhir Tahun</h3>
                 <button
                   onClick={promoteStudents}
                   className="w-full flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold py-3 px-4 rounded-xl transition-all border border-blue-200"
                 >
                    <Download size={18} className="rotate-180" />
                    Naik Darjah (Sesi Hadapan)
                 </button>
                 <p className="text-[10px] text-slate-400 text-center italic">
                    Salin semua murid ke Tahun {selectedYear < 6 ? selectedYear + 1 : 'Tamat'} untuk sesi akademik seterusnya.
                 </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold flex items-center gap-2">
                <TableIcon className="text-emerald-600" size={18} />
                Senarai Murid Tahun {selectedYear} ({filteredStudents.length})
              </h3>
              <button
                onClick={() => {
                  setAddName('');
                  setAddStudentId('');
                  setAddClass('Utama');
                  setAddYear(selectedYear);
                  setAddGender('');
                  setAddRace('');
                  setShowAddModal(true);
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-emerald-600/10"
              >
                <Plus size={14} /> Tambah Murid
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider border-b border-slate-100">
                    <th className="px-6 py-4">No.</th>
                    <th className="px-6 py-4">ID / MyKad</th>
                    <th className="px-6 py-4">Nama Penuh</th>
                    <th className="px-6 py-4">Kelas</th>
                    <th className="px-6 py-4 text-center">Jantina</th>
                    <th className="px-6 py-4 text-center">Kaum</th>
                    <th className="px-6 py-4 text-center">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr><td colSpan={7} className="px-6 py-8 text-center text-slate-400">Memuatkan...</td></tr>
                  ) : filteredStudents.length === 0 ? (
                    <tr>
                        <td colSpan={7} className="px-6 py-12 text-center">
                            <div className="text-slate-400 italic flex flex-col items-center gap-2">
                                <Users size={32} />
                                <p>Tiada murid ditemui untuk Tahun {selectedYear}.</p>
                                <p className="text-xs">Klik "Tambah Murid" atau "Import Murid" untuk mula memuat naik data.</p>
                            </div>
                        </td>
                    </tr>
                  ) : (
                    filteredStudents.map((s, idx) => (
                      <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-sm text-slate-400">{idx + 1}</td>
                        <td className="px-6 py-4 text-sm font-mono text-slate-500">{s.student_id}</td>
                        <td className="px-6 py-4 font-extrabold uppercase text-slate-800">{s.name}</td>
                        <td className="px-6 py-4 text-sm font-black text-blue-600 uppercase">{s.class || 'Amanah'}</td>
                        <td className="px-6 py-4 text-center">
                          {s.gender ? (
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${s.gender === 'P' ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-blue-50 text-blue-700 border border-blue-100'}`}>
                              {s.gender === 'P' ? 'Perempuan' : 'Lelaki'}
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-50 text-amber-600 border border-amber-100 animate-pulse">
                              Sila Kemaskini ⚠️
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {s.race ? (
                            <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] uppercase font-black tracking-wider">
                              {s.race}
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-50 text-amber-600 border border-amber-100 animate-pulse">
                              Sila Kemaskini ⚠️
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => {
                                setEditingStudent(s);
                                setEditName(s.name);
                                setEditStudentId(s.student_id);
                                setEditClass(s.class || 'Amanah');
                                setEditYear(s.year || selectedYear);
                                setEditGender(s.gender || '');
                                setEditRace(s.race || '');
                              }}
                              className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"
                              title="Kemas Kini Profil"
                            >
                              <Edit3 size={15} />
                            </button>
                            <button 
                              onClick={() => deleteStudent(s.id)}
                              className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                              title="Padam Murid"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
                <h3 className="font-bold text-sm text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Search size={16} /> Carian Guru / Jurulatih
                </h3>
                <div className="relative">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                        type="text"
                        placeholder="Cari nama, IC, atau e-mel guru..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 outline-none focus:ring-2 focus:ring-blue-500"
                        value={teacherSearchQuery}
                        onChange={(e) => setTeacherSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
                <div className="flex items-start gap-2 bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                    <Info size={16} className="text-indigo-500 mt-0.5" />
                    <p className="text-xs text-indigo-700 leading-relaxed">
                        Data guru yang diimport di sini akan digunakan sebagai pilihan jurulatih (checkbox selection) dalam modul Laporan Kokurikulum.
                    </p>
                </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold flex items-center gap-2">
                <TableIcon className="text-indigo-600" size={18} />
                Senarai Guru Berdaftar ({filteredTeachers.length})
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider border-b border-slate-100">
                    <th className="px-6 py-4">No.</th>
                    <th className="px-6 py-4">Nama Guru</th>
                    <th className="px-6 py-4">Nombor K/P (IC)</th>
                    <th className="px-6 py-4">E-mel DeLIMA</th>
                    <th className="px-6 py-4 text-center">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">Memuatkan...</td></tr>
                  ) : filteredTeachers.length === 0 ? (
                    <tr>
                        <td colSpan={5} className="px-6 py-12 text-center">
                            <div className="text-slate-400 italic flex flex-col items-center gap-2">
                                <Users size={32} />
                                <p>Tiada guru ditemui.</p>
                                <p className="text-xs">Klik "Import Guru" untuk memuat naik fail Excel guru (Format: Nama, IC, E-mel).</p>
                            </div>
                        </td>
                    </tr>
                  ) : (
                    filteredTeachers.map((t, idx) => (
                      <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-sm text-slate-400">{idx + 1}</td>
                        <td className="px-6 py-4 font-medium">{t.name}</td>
                        <td className="px-6 py-4 text-sm font-mono text-slate-500">{t.ic}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{t.email}</td>
                        <td className="px-6 py-4">
                          <button 
                            onClick={() => deleteTeacher(t.id)}
                            className="p-2 text-slate-300 hover:text-red-500 transition-colors block mx-auto"
                            title="Padam Guru"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modal Kemas Kini Profil Murid */}
      {editingStudent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in duration-200 text-slate-800">
            <h3 className="text-xl font-black italic uppercase tracking-tighter text-slate-800 mb-2 flex items-center gap-2">
              <span>✏️</span> Kemas Kini Profil Murid
            </h3>
            <p className="text-[10px] text-slate-400 mb-6 font-black uppercase tracking-wider leading-relaxed">
              Sila kemas kini butiran murid di bawah. Tindakan ini akan mengemas kini rekod kurikulum dan menyelaraskan data kokurikulum secara automatik.
            </p>

            <form onSubmit={saveStudentEdit} className="space-y-4 text-left">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Nama Penuh Murid</label>
                <input 
                  type="text" 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="NAMA MURID..."
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">No MyKad / ID Pendaftaran</label>
                <input 
                  type="text" 
                  value={editStudentId}
                  onChange={(e) => setEditStudentId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="CONTOH: 160519130489"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Tahun / Darjah</label>
                  <select
                    value={editYear}
                    onChange={(e) => setEditYear(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {[1,2,3,4,5,6].map(y => <option key={y} value={y}>Tahun {y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Kelas</label>
                  <input
                    type="text"
                    value={editClass}
                    onChange={(e) => setEditClass(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Contoh: Amanah, Utama"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Jantina</label>
                  <select
                    value={editGender}
                    onChange={(e) => setEditGender(e.target.value as 'L' | 'P' | '')}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">- PILIH -</option>
                    <option value="L">LELAKI</option>
                    <option value="P">PEREMPUAN</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Kaum (Bangsa)</label>
                  <select
                    value={editRace}
                    onChange={(e) => setEditRace(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">- PILIH -</option>
                    <option value="Melayu">Melayu</option>
                    <option value="Cina">Cina</option>
                    <option value="India">India</option>
                    <option value="Bumiputera Sabah">Bumiputera Sabah</option>
                    <option value="Bumiputera Sarawak">Bumiputera Sarawak</option>
                    <option value="Asli">Orang Asli</option>
                    <option value="Lain-lain">Lain-lain</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-black uppercase tracking-wider rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  disabled={savingEdit}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-colors shadow-lg shadow-blue-600/10 disabled:opacity-50"
                >
                  {savingEdit ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Tambah Murid Baru */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in duration-200 text-slate-800">
            <h3 className="text-xl font-black italic uppercase tracking-tighter text-slate-800 mb-2 flex items-center gap-2">
              <span>👤</span> Tambah Murid Baru
            </h3>
            <p className="text-[10px] text-slate-400 mb-6 font-black uppercase tracking-wider leading-relaxed">
              Sila masukkan maklumat murid baru di bawah secara terperinci untuk mendaftarkannya secara manual.
            </p>

            <form onSubmit={handleAddStudentManual} className="space-y-4 text-left">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Nama Penuh Murid</label>
                <input 
                  type="text" 
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="NAMA MURID..."
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">No MyKad / ID Pendaftaran</label>
                <input 
                  type="text" 
                  value={addStudentId}
                  onChange={(e) => setAddStudentId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="CONTOH: 160519130489"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Tahun / Darjah</label>
                  <select
                    value={addYear}
                    onChange={(e) => setAddYear(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {[1,2,3,4,5,6].map(y => <option key={y} value={y}>Tahun {y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Kelas</label>
                  <input
                    type="text"
                    value={addClass}
                    onChange={(e) => setAddClass(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Contoh: Amanah, Utama"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Jantina</label>
                  <select
                    value={addGender}
                    onChange={(e) => setAddGender(e.target.value as 'L' | 'P' | '')}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">- PILIH -</option>
                    <option value="L">LELAKI</option>
                    <option value="P">PEREMPUAN</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Kaum (Bangsa)</label>
                  <select
                    value={addRace}
                    onChange={(e) => setAddRace(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">- PILIH -</option>
                    <option value="Melayu">Melayu</option>
                    <option value="Cina">Cina</option>
                    <option value="India">India</option>
                    <option value="Bumiputera Sabah">Bumiputera Sabah</option>
                    <option value="Bumiputera Sarawak">Bumiputera Sarawak</option>
                    <option value="Asli">Orang Asli</option>
                    <option value="Lain-lain">Lain-lain</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-black uppercase tracking-wider rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  disabled={addingStudentState}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-colors shadow-lg shadow-emerald-600/10 disabled:opacity-50"
                >
                  {addingStudentState ? 'Menambah...' : 'Tambah'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


