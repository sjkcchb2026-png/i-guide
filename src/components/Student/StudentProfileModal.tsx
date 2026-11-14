import React, { useState, useEffect } from 'react';
import { 
  X, 
  Phone, 
  PhoneCall, 
  MessageCircle, 
  User, 
  MapPin, 
  ShieldAlert, 
  HeartHandshake, 
  BookOpen, 
  Award, 
  Briefcase, 
  Building2, 
  DollarSign, 
  Calendar, 
  CreditCard, 
  CheckCircle2, 
  Clock, 
  Copy, 
  Eye, 
  EyeOff,
  AlertCircle
} from 'lucide-react';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { StudentMaster, Student, PbdResult, UasaResult, KokoMembership } from '../../types';
import { useSchoolTenant } from '../../contexts/SchoolTenantContext';
import { belongsToSchool, scopedDocId } from '../../utils/schoolTenant';

interface StudentProfileModalProps {
  studentId: string | null;
  isOpen: boolean;
  onClose: () => void;
  preloadedStudent?: Partial<Student & StudentMaster> | null;
  academicYear?: string;
}

export const StudentProfileModal: React.FC<StudentProfileModalProps> = ({
  studentId,
  isOpen,
  onClose,
  preloadedStudent,
  academicYear = '2026',
}) => {
  const { schoolCode: activeSchoolCode, schoolName: tenantSchoolName } = useSchoolTenant();
  const [activeTab, setActiveTab] = useState<'emergency' | 'bio' | 'academic' | 'koko'>('emergency');
  const [loading, setLoading] = useState<boolean>(false);
  const [studentMaster, setStudentMaster] = useState<StudentMaster | null>(null);
  const [enrollment, setEnrollment] = useState<Student | null>(null);
  const [pbdResults, setPbdResults] = useState<PbdResult[]>([]);
  const [uasaResults, setUasaResults] = useState<UasaResult[]>([]);
  const [kokoMemberships, setKokoMemberships] = useState<KokoMembership[]>([]);
  const [showFullIc, setShowFullIc] = useState<boolean>(false);
  const [copiedAddress, setCopiedAddress] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !studentId) {
      setStudentMaster(null);
      setEnrollment(null);
      setPbdResults([]);
      setUasaResults([]);
      setKokoMemberships([]);
      setShowFullIc(false);
      setActiveTab('emergency');
      return;
    }

    let isMounted = true;
    setLoading(true);

    async function loadStudentData() {
      try {
        const targetId = studentId!;
        
        // 1. Fetch Student Master record (scoped by activeSchoolCode with legacy fallback)
        let masterData: StudentMaster | null = null;
        const scopedMasterRef = doc(db, 'student_master', scopedDocId(activeSchoolCode, targetId));
        const masterSnap = await getDoc(scopedMasterRef);

        if (masterSnap.exists() && belongsToSchool(masterSnap.data(), activeSchoolCode)) {
          masterData = { student_id: masterSnap.id, ...masterSnap.data() } as StudentMaster;
        } else {
          // Fallback: search by apdmId or icNumber within active school
          const qApdm = query(collection(db, 'student_master'), where('apdmId', '==', targetId));
          const snapApdm = await getDocs(qApdm);
          const matchedApdm = snapApdm.docs.find((d) => belongsToSchool(d.data(), activeSchoolCode));
          if (matchedApdm) {
            masterData = { student_id: matchedApdm.id, ...matchedApdm.data() } as StudentMaster;
          } else {
            const qIc = query(collection(db, 'student_master'), where('icNumber', '==', targetId.replace(/[^0-9]/g, '')));
            const snapIc = await getDocs(qIc);
            const matchedIc = snapIc.docs.find((d) => belongsToSchool(d.data(), activeSchoolCode));
            if (matchedIc) {
              masterData = { student_id: matchedIc.id, ...matchedIc.data() } as StudentMaster;
            }
          }
        }

        // 2. Fetch sessional enrollment (students collection)
        let enrollData: Student | null = null;
        const enrollId = `${targetId}_${academicYear.replace(/\//g, '-')}`;
        const enrollRef = doc(db, 'students', scopedDocId(activeSchoolCode, enrollId));
        const enrollSnap = await getDoc(enrollRef);

        if (enrollSnap.exists() && belongsToSchool(enrollSnap.data(), activeSchoolCode)) {
          enrollData = { id: enrollSnap.id, ...enrollSnap.data() } as Student;
        } else {
          // Search by student_id and academic_year within active school
          const qEnroll = query(
            collection(db, 'students'),
            where('student_id', '==', targetId),
            where('academic_year', '==', academicYear)
          );
          const snapEnroll = await getDocs(qEnroll);
          const matchedEnroll = snapEnroll.docs.find((d) => belongsToSchool(d.data(), activeSchoolCode));
          if (matchedEnroll) {
            enrollData = { id: matchedEnroll.id, ...matchedEnroll.data() } as Student;
          }
        }

        // 3. Fetch academic results (PBD & UASA)
        const qPbd = query(
          collection(db, 'pbd_results'),
          where('student_id', '==', targetId),
          where('academic_year', '==', academicYear)
        );
        const pbdSnap = await getDocs(qPbd);
        const pbdList = pbdSnap.docs
          .filter((d) => belongsToSchool(d.data(), activeSchoolCode))
          .map(d => ({ id: d.id, ...d.data() } as PbdResult));

        const qUasa = query(
          collection(db, 'uasa_results'),
          where('student_id', '==', targetId),
          where('academic_year', '==', academicYear)
        );
        const uasaSnap = await getDocs(qUasa);
        const uasaList = uasaSnap.docs
          .filter((d) => belongsToSchool(d.data(), activeSchoolCode))
          .map(d => ({ id: d.id, ...d.data() } as UasaResult));

        // 4. Fetch Kokurikulum memberships
        const qKoko = query(
          collection(db, 'koko_memberships'),
          where('student_id', '==', targetId),
          where('academicYear', '==', academicYear)
        );
        const kokoSnap = await getDocs(qKoko);
        const kokoList = kokoSnap.docs
          .filter((d) => belongsToSchool(d.data(), activeSchoolCode))
          .map(d => ({ id: d.id, ...d.data() } as KokoMembership));

        if (isMounted) {
          setStudentMaster(masterData);
          setEnrollment(enrollData);
          setPbdResults(pbdList);
          setUasaResults(uasaList);
          setKokoMemberships(kokoList);
        }
      } catch (err) {
        console.warn('Error loading student profile details:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadStudentData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, studentId, academicYear, activeSchoolCode]);

  if (!isOpen) return null;

  // Resolve unified fields between preloaded & fetched data
  const name = studentMaster?.name || enrollment?.name || preloadedStudent?.name || 'Nama Murid';
  const apdmId = studentMaster?.apdmId || enrollment?.apdmId || (preloadedStudent as any)?.apdmId || studentId || '-';
  const rawIc = studentMaster?.icNumber || enrollment?.icNumber || (preloadedStudent as any)?.icNumber || '';
  const maskedIc = studentMaster?.maskedIc || enrollment?.maskedIc || (rawIc ? `${rawIc.slice(0, 6)}-**-**${rawIc.slice(-2)}` : '-');
  const displayIc = showFullIc && rawIc ? rawIc : maskedIc;
  const gender = studentMaster?.gender || enrollment?.gender || preloadedStudent?.gender || 'L';
  const birthDate = studentMaster?.birthDate || enrollment?.birthDate || (preloadedStudent as any)?.birthDate || '-';
  const birthYear = studentMaster?.birthYear || enrollment?.birthYear || (preloadedStudent as any)?.birthYear;
  const calculatedAge = studentMaster?.age || enrollment?.age || (birthYear ? 2026 - birthYear : undefined);
  const className = enrollment?.class || studentMaster?.currentClass || preloadedStudent?.class || 'Belum Diagih';
  const yearLevel = enrollment?.year !== undefined ? enrollment.year : (studentMaster?.currentYear !== undefined ? studentMaster.currentYear : preloadedStudent?.year);
  const classTeacher = studentMaster?.classTeacherName || enrollment?.classTeacherName || '-';

  // Guardians
  const g1 = studentMaster?.guardian1;
  const g2 = studentMaster?.guardian2;
  const addr = studentMaster?.address;
  const welfare = studentMaster?.welfare;

  // Helpers for phone and WhatsApp formatting
  const formatPhoneClean = (raw?: string) => (raw || '').replace(/[^0-9]/g, '');
  const formatWhatsAppUrl = (raw?: string) => {
    let clean = formatPhoneClean(raw);
    if (!clean) return '';
    if (clean.startsWith('0')) clean = '6' + clean;
    else if (!clean.startsWith('60') && !clean.startsWith('6')) clean = '60' + clean;
    return `https://wa.me/${clean}?text=${encodeURIComponent(`Salam Sejahtera, ini dari pihak ${tenantSchoolName} berkenaan murid ${name}.`)}`;
  };

  const copyAddressToClipboard = () => {
    if (!addr) return;
    const fullAddr = [addr.address1, addr.address2, addr.address3, addr.postcode, addr.city, addr.district, addr.state].filter(Boolean).join(', ');
    navigator.clipboard.writeText(fullAddr);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl border border-slate-200 max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div className="p-6 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white relative shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800/80 transition-colors"
          >
            <X size={20} />
          </button>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pr-10">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black shadow-lg shrink-0 ${
              gender === 'P' ? 'bg-rose-500 text-white shadow-rose-500/20' : 'bg-blue-600 text-white shadow-blue-500/20'
            }`}>
              {name.charAt(0)}
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-md border border-emerald-500/30">
                  APDM: {apdmId}
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md border border-slate-700">
                  {gender === 'P' ? 'Perempuan' : 'Lelaki'}
                </span>
                {calculatedAge !== undefined && (
                  <span className="text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-md border border-amber-500/30">
                    {calculatedAge} Tahun {birthYear ? `(Lahir ${birthYear})` : ''}
                  </span>
                )}
                <span className="text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-md border border-blue-500/30">
                  {yearLevel === 0 ? 'PRASEKOLAH' : `Tahun ${yearLevel}`} ({className})
                </span>
              </div>

              <h3 className="text-xl font-black tracking-tight uppercase text-white">
                {name}
              </h3>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300 font-medium">
                <div className="flex items-center gap-1.5 font-mono">
                  <span>No. KP: {displayIc}</span>
                  {rawIc && (
                    <button
                      type="button"
                      onClick={() => setShowFullIc(!showFullIc)}
                      className="text-slate-400 hover:text-white p-0.5"
                      title={showFullIc ? 'Sembunyikan MyKid' : 'Papar MyKid Penuh'}
                    >
                      {showFullIc ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  )}
                </div>
                <span>•</span>
                <span>T. Lahir: {birthDate}</span>
                <span>•</span>
                <span>Guru Kelas: <strong className="text-white">{classTeacher}</strong></span>
              </div>
            </div>
          </div>

          {/* TAB BUTTONS */}
          <div className="flex gap-2 mt-6 border-t border-slate-800/80 pt-4 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('emergency')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all shrink-0 ${
                activeTab === 'emergency'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <PhoneCall size={14} />
              Kecemasan & Penjaga
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('bio')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all shrink-0 ${
                activeTab === 'bio'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <User size={14} />
              Profil & Alamat
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('academic')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all shrink-0 ${
                activeTab === 'academic'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <BookOpen size={14} />
              Akademik (PBD & UASA)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('koko')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all shrink-0 ${
                activeTab === 'koko'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Award size={14} />
              Kokurikulum
            </button>
          </div>
        </div>

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: EMERGENCY & GUARDIANS */}
          {activeTab === 'emergency' && (
            <div className="space-y-6">
              {/* Emergency Banner */}
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3.5 text-rose-950">
                <div className="p-2 bg-rose-100 rounded-xl text-rose-600 shrink-0 mt-0.5">
                  <ShieldAlert size={20} />
                </div>
                <div className="space-y-0.5">
                  <span className="text-xs font-black uppercase tracking-wider block text-rose-900">
                    Pusat Tindakan & Hubungan Kecemasan Murid
                  </span>
                  <p className="text-xs text-rose-800 leading-relaxed">
                    Sila gunakan butang panggilan atau WhatsApp di bawah untuk berhubung terus dengan ibu bapa / penjaga sekiranya berlaku kecemasan, murid tidak sihat, atau memerlukan pengesahan segera.
                  </p>
                </div>
              </div>

              {/* Guardians Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Guardian 1 */}
                <div className="p-5 rounded-2xl border-2 border-slate-200 bg-slate-50/70 space-y-4 hover:border-blue-400 transition-colors">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs font-black">1</span>
                      <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                        Penjaga Utama (Penjaga 1)
                      </h4>
                    </div>
                    <span className="text-[10px] font-black uppercase bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
                      {g1?.relation || 'Ibu Bapa / Penjaga'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-sm font-black text-slate-900 uppercase block">
                      {g1?.name || (enrollment?.guardianName) || '<Tiada Maklumat Penjaga 1>'}
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium block">
                      Pekerjaan: <strong>{g1?.occupation || '-'}</strong> ({g1?.employer || 'Majikan -'})
                    </span>
                    {g1?.income !== undefined && g1?.income !== '' && (
                      <span className="text-[11px] text-slate-500 font-medium block">
                        Pendapatan: <strong>RM {g1.income}</strong>
                      </span>
                    )}
                  </div>

                  {/* Contact Buttons */}
                  <div className="pt-2 border-t border-slate-200/80 space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                      Hubungan Segera:
                    </span>
                    <div className="flex flex-col gap-2">
                      {(g1?.mobilePhone || enrollment?.guardianPhone) ? (
                        <>
                          <a
                            href={`tel:${formatPhoneClean(g1?.mobilePhone || enrollment?.guardianPhone)}`}
                            className="flex items-center justify-center gap-2 w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase shadow-sm transition-all"
                          >
                            <Phone size={14} />
                            Hubungi: {g1?.mobilePhone || enrollment?.guardianPhone}
                          </a>
                          <a
                            href={formatWhatsAppUrl(g1?.mobilePhone || enrollment?.guardianPhone)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 w-full py-2.5 px-3 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-black uppercase shadow-sm transition-all"
                          >
                            <MessageCircle size={14} />
                            Mesej WhatsApp
                          </a>
                        </>
                      ) : (
                        <div className="text-xs text-slate-400 italic py-2 text-center bg-white rounded-xl border border-slate-200">
                          Tiada nombor telefon bimbit direkodkan
                        </div>
                      )}

                      {g1?.officePhone && (
                        <a
                          href={`tel:${formatPhoneClean(g1.officePhone)}`}
                          className="flex items-center justify-center gap-2 w-full py-2 px-3 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all"
                        >
                          <Building2 size={13} className="text-slate-400" />
                          Tel. Pejabat: {g1.officePhone}
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Guardian 2 */}
                <div className="p-5 rounded-2xl border-2 border-slate-200 bg-slate-50/70 space-y-4 hover:border-purple-400 transition-colors">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-purple-600 text-white flex items-center justify-center text-xs font-black">2</span>
                      <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                        Penjaga Kedua (Penjaga 2)
                      </h4>
                    </div>
                    <span className="text-[10px] font-black uppercase bg-purple-50 text-purple-700 px-2 py-0.5 rounded border border-purple-200">
                      {g2?.relation || 'Ibu / Bapa'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-sm font-black text-slate-900 uppercase block">
                      {g2?.name || '<Tiada Maklumat Penjaga 2>'}
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium block">
                      Pekerjaan: <strong>{g2?.occupation || '-'}</strong> ({g2?.employer || 'Majikan -'})
                    </span>
                    {g2?.income !== undefined && g2?.income !== '' && (
                      <span className="text-[11px] text-slate-500 font-medium block">
                        Pendapatan: <strong>RM {g2.income}</strong>
                      </span>
                    )}
                  </div>

                  {/* Contact Buttons */}
                  <div className="pt-2 border-t border-slate-200/80 space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                      Hubungan Segera:
                    </span>
                    <div className="flex flex-col gap-2">
                      {g2?.mobilePhone ? (
                        <>
                          <a
                            href={`tel:${formatPhoneClean(g2.mobilePhone)}`}
                            className="flex items-center justify-center gap-2 w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase shadow-sm transition-all"
                          >
                            <Phone size={14} />
                            Hubungi: {g2.mobilePhone}
                          </a>
                          <a
                            href={formatWhatsAppUrl(g2.mobilePhone)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 w-full py-2.5 px-3 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-black uppercase shadow-sm transition-all"
                          >
                            <MessageCircle size={14} />
                            Mesej WhatsApp
                          </a>
                        </>
                      ) : (
                        <div className="text-xs text-slate-400 italic py-2 text-center bg-white rounded-xl border border-slate-200">
                          Tiada nombor telefon bimbit direkodkan
                        </div>
                      )}

                      {g2?.officePhone && (
                        <a
                          href={`tel:${formatPhoneClean(g2.officePhone)}`}
                          className="flex items-center justify-center gap-2 w-full py-2 px-3 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all"
                        >
                          <Building2 size={13} className="text-slate-400" />
                          Tel. Pejabat: {g2.officePhone}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Residential Address Mini-Card */}
              {addr && (addr.address1 || addr.city) && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <MapPin size={18} className="text-slate-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
                        Alamat Kediaman Semasa
                      </span>
                      <p className="text-xs font-semibold text-slate-800 mt-0.5 leading-relaxed">
                        {[addr.address1, addr.address2, addr.address3, addr.postcode, addr.city, addr.district, addr.state].filter(Boolean).join(', ')}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={copyAddressToClipboard}
                    className="p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-center gap-1.5 shrink-0 transition-colors shadow-sm"
                  >
                    {copiedAddress ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    {copiedAddress ? 'Disalin' : 'Salin'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: BIO & ADDRESS & WELFARE */}
          {activeTab === 'bio' && (
            <div className="space-y-6">
              {/* Identity & Demographics Grid */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-black uppercase text-slate-500 tracking-wider border-b border-slate-200 pb-2">
                  Profil Demografi & Warganegara
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Kaum</span>
                    <span className="font-black text-slate-800">{studentMaster?.race || enrollment?.race || preloadedStudent?.race || '-'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Agama</span>
                    <span className="font-black text-slate-800">{studentMaster?.religion || '-'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Warganegara</span>
                    <span className="font-black text-slate-800">{studentMaster?.citizenship || 'WARGANEGARA'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Status Pengajian</span>
                    <span className="font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 inline-block">
                      {studentMaster?.studyStatus || 'BERSEKOLAH'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Welfare & Kebajikan (HEM) */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <HeartHandshake size={16} className="text-rose-500" />
                  <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                    Status Kebajikan & Bantuan (HEM)
                  </h4>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Status OKU</span>
                    <span className={`font-black px-2 py-0.5 rounded text-[11px] inline-block ${
                      welfare?.isOku || welfare?.okuStatus === 'YA' 
                        ? 'bg-rose-100 text-rose-800' 
                        : 'bg-slate-200 text-slate-700'
                    }`}>
                      {welfare?.isOku || welfare?.okuStatus === 'YA' ? `OKU (${welfare?.disabilityCategory || 'TIDAK NYATA'})` : 'BUKAN OKU'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Status Yatim</span>
                    <span className="font-black text-slate-800">{welfare?.orphanStatus || 'TIDAK'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Nama Bank</span>
                    <span className="font-black text-slate-800">{welfare?.bankName || '-'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">No. Akaun Bank</span>
                    <span className="font-mono font-bold text-slate-800">{welfare?.bankAccountNumber || '-'}</span>
                  </div>
                </div>
              </div>

              {/* Full Address */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <MapPin size={16} className="text-blue-600" />
                    <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                      Alamat Penuh Kediaman
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={copyAddressToClipboard}
                    className="text-[10px] font-black uppercase text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    {copiedAddress ? <CheckCircle2 size={12} className="text-emerald-600" /> : <Copy size={12} />}
                    {copiedAddress ? 'Disalin' : 'Salin Alamat'}
                  </button>
                </div>
                <div className="text-xs space-y-1 font-medium text-slate-800">
                  <div>{addr?.address1 || '-'}</div>
                  {addr?.address2 && <div>{addr.address2}</div>}
                  {addr?.address3 && <div>{addr.address3}</div>}
                  <div className="pt-1 text-slate-500 font-mono text-[11px]">
                    {[addr?.postcode, addr?.city, addr?.district, addr?.state].filter(Boolean).join(', ')}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ACADEMIC (PBD & UASA) */}
          {activeTab === 'academic' && (
            <div className="space-y-6">
              {/* PBD Results Summary */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <BookOpen size={16} className="text-emerald-600" />
                    <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                      Pentaksiran Bilik Darjah (PBD) Sesi {academicYear}
                    </h4>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    {pbdResults.length} Subjek Direkodkan
                  </span>
                </div>

                {pbdResults.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {pbdResults.map((pbd, idx) => (
                      <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 space-y-1 shadow-sm">
                        <span className="text-xs font-black uppercase text-slate-800 block truncate">
                          {pbd.subject_id}
                        </span>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-400 uppercase font-bold">Tahap Penguasaan:</span>
                          <span className="px-2 py-0.5 rounded text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                            TP {pbd.tp}
                          </span>
                        </div>
                        {pbd.mastery && (
                          <div className="text-[9px] text-slate-500 italic">
                            Status: {pbd.mastery}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-400 italic">
                    Tiada keputusan PBD direkodkan untuk sesi {academicYear}.
                  </div>
                )}
              </div>

              {/* UASA Results Summary */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <Award size={16} className="text-blue-600" />
                    <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                      Ujian Akhir Sesi Akademik (UASA) Sesi {academicYear}
                    </h4>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    {uasaResults.length} Subjek Direkodkan
                  </span>
                </div>

                {uasaResults.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {uasaResults.map((uasa, idx) => (
                      <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 space-y-1 shadow-sm">
                        <span className="text-xs font-black uppercase text-slate-800 block truncate">
                          {uasa.subject_id}
                        </span>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono font-bold text-slate-600">{uasa.marks} Markah</span>
                          <span className="px-2 py-0.5 rounded text-xs font-black bg-blue-50 text-blue-700 border border-blue-200">
                            Gred {uasa.grade}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-400 italic">
                    Tiada keputusan UASA direkodkan untuk sesi {academicYear}.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: KOKURIKULUM */}
          {activeTab === 'koko' && (
            <div className="space-y-6">
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <Award size={16} className="text-purple-600" />
                    <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                      Keahlian & Penglibatan Kokurikulum Sesi {academicYear}
                    </h4>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    {kokoMemberships.length} Badan Kokurikulum
                  </span>
                </div>

                {kokoMemberships.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {kokoMemberships.map((m, idx) => {
                      const typeLabel = 
                        m.category === 'uniform' ? 'Unit Beruniform' :
                        m.category === 'club' ? 'Kelab & Persatuan' : 'Sukan & Permainan';
                      return (
                        <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 space-y-1 shadow-sm">
                          <span className="text-[9px] font-black uppercase text-purple-600 block">
                            {typeLabel}
                          </span>
                          <span className="text-xs font-black uppercase text-slate-800 block">
                            {m.groupId}
                          </span>
                          <div className="text-[11px] text-slate-500">
                            Jawatan: <strong className="text-slate-800">{m.position || 'Ahli'}</strong>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-400 italic">
                    Tiada pendaftaran kokurikulum direkodkan bagi sesi {academicYear}.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span>ID Dokumen: {studentId}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs uppercase rounded-xl transition-all shadow-sm"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

export default StudentProfileModal;
