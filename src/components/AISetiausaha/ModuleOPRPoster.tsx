import React, { useState, useEffect } from 'react';
import {
  FileText,
  Printer,
  Download,
  Plus,
  Trash2,
} from 'lucide-react';
import { collection, getDocs, setDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, SchoolSettings } from '../../types';
import { AISetiausahaDocument } from './types';
import { belongsToSchool, scopedDocId } from '../../utils/schoolTenant';
import { deepSanitizeFirestore } from '../../utils/sanitizeFirestore';
import {
  triggerSmartPrint,
  downloadStandalonePrintHtml,
} from '../../utils/oprPrintHelper';

interface Props {
  currentUser: UserProfile;
  schoolSettings?: SchoolSettings | null;
  schoolCode: string;
  schoolName: string;
}

export const ModuleOPRPoster: React.FC<Props> = ({
  currentUser,
  schoolSettings,
  schoolCode,
  schoolName,
}) => {
  const [docs, setDocs] = useState<AISetiausahaDocument[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<AISetiausahaDocument | null>(null);
  const [programTitle, setProgramTitle] = useState<string>('');
  const [tarikh, setTarikh] = useState<string>(new Date().toISOString().slice(0, 10));
  const [tempat, setTempat] = useState<string>(schoolName);
  const [sasaran, setSasaran] = useState<string>('Semua Guru & Murid');
  const [objektifText, setObjektifText] = useState<string>(
    'Meningkatkan keberkesanan pelaksanaan program sekolah secara terancang.'
  );
  const [impakText, setImpakText] = useState<string>(
    'Program berjalan lancar dan mencapai objektif yang ditetapkan.'
  );
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loadDocs = async () => {
    try {
      const snap = await getDocs(collection(db, 'ai_setiausaha_documents'));
      const list = snap.docs
        .map((d) => ({ ...(d.data() as any), id: d.id } as AISetiausahaDocument))
        .filter((d) => belongsToSchool(d as any, schoolCode) && d.docKind === 'OPR')
        .sort((a, b) => (b.tarikh || '').localeCompare(a.tarikh || ''));
      setDocs(list);
      if (list.length > 0 && !selectedDoc) {
        setSelectedDoc(list[0]);
      }
    } catch (err) {
      console.warn('Could not load AI Setiausaha OPR docs:', err);
    }
  };

  useEffect(() => {
    loadDocs();
  }, [schoolCode]);

  const handleCreateOPR = async () => {
    if (!programTitle.trim()) return;
    const id = scopedDocId(schoolCode, `opr_${Date.now()}`);
    const newDoc: AISetiausahaDocument = {
      id,
      docKind: 'OPR',
      schoolCode,
      academicYear: tarikh.slice(0, 4) || '2026',
      pillar: 'KURIKULUM',
      skpmCodeBadge: 'SKPM Kualiti@Sekolah',
      skpmStandard: 'STANDARD 3.1 / 3.2 / 3.3: PENGURUSAN SEKOLAH',
      programTitle: programTitle.trim().toUpperCase(),
      tarikh,
      tempat: tempat.trim(),
      sasaran: sasaran.trim(),
      objektif: objektifText
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean),
      impak: impakText
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean),
      preparedByName: (currentUser.name || 'SETIAUSAHA').toUpperCase(),
      preparedByTitle: 'Setiausaha Program',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await setDoc(doc(db, 'ai_setiausaha_documents', id), deepSanitizeFirestore(newDoc), {
      merge: true,
    });
    setProgramTitle('');
    await loadDocs();
    setSelectedDoc(newDoc);
  };

  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db, 'ai_setiausaha_documents', id));
    if (selectedDoc?.id === id) setSelectedDoc(null);
    await loadDocs();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-4 space-y-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <h4 className="text-xs font-black uppercase text-amber-300 flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            <span>Jana Poster OPR Baharu</span>
          </h4>
          <input
            type="text"
            value={programTitle}
            onChange={(e) => setProgramTitle(e.target.value)}
            placeholder="Tajuk Program / Aktiviti..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-bold"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={tarikh}
              onChange={(e) => setTarikh(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white"
            />
            <input
              type="text"
              value={tempat}
              onChange={(e) => setTempat(e.target.value)}
              placeholder="Tempat"
              className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white"
            />
          </div>
          <textarea
            rows={2}
            value={objektifText}
            onChange={(e) => setObjektifText(e.target.value)}
            placeholder="Objektif..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white"
          />
          <textarea
            rows={2}
            value={impakText}
            onChange={(e) => setImpakText(e.target.value)}
            placeholder="Impak & Pencapaian..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white"
          />
          <button
            type="button"
            onClick={handleCreateOPR}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase cursor-pointer"
          >
            Simpan &amp; Papar Poster OPR
          </button>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2 max-h-96 overflow-y-auto">
          <div className="text-xs font-black uppercase text-slate-400">
            Arkib OPR SKPM ({docs.length})
          </div>
          {docs.map((d, idx) => (
            <div
              key={`${d.id}_${idx}`}
              onClick={() => setSelectedDoc(d)}
              className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between gap-2 ${
                selectedDoc?.id === d.id
                  ? 'bg-indigo-950/60 border-indigo-500 text-white'
                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">{d.programTitle}</div>
                <div className="text-[10px] text-slate-400 font-mono">
                  {d.tarikh} · {d.skpmCodeBadge || d.skpmBucket || 'OPR'}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(d.id);
                }}
                className="text-slate-500 hover:text-rose-400 p-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="lg:col-span-8 space-y-4">
        {statusMsg && (
          <div className="p-3 rounded-xl bg-indigo-950 border border-indigo-700 text-xs text-indigo-200">
            {statusMsg}
          </div>
        )}
        {selectedDoc ? (
          <div className="space-y-3">
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const res = downloadStandalonePrintHtml({
                    elementId: 'ai-setiausaha-opr-poster',
                    title: selectedDoc.programTitle,
                    orientation: 'portrait',
                  });
                  setStatusMsg(res.message);
                }}
                className="px-3.5 py-2 rounded-xl bg-slate-800 text-teal-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Muat Turun (.html)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const res = triggerSmartPrint({
                    elementId: 'ai-setiausaha-opr-poster',
                    title: selectedDoc.programTitle,
                    orientation: 'portrait',
                  });
                  if (res.mode !== 'native') setStatusMsg(res.message);
                }}
                className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-black uppercase flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak OPR A4</span>
              </button>
            </div>

            <div
              id="ai-setiausaha-opr-poster"
              className="bg-white text-slate-900 rounded-2xl p-8 shadow-2xl border border-slate-200 space-y-5"
            >
              <div className="border-b-4 border-indigo-900 pb-4 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-indigo-700">
                    ONE PAGE REPORT (OPR) · {selectedDoc.skpmCodeBadge || 'SKPM KUALITI@SEKOLAH'}
                  </div>
                  <h2 className="text-xl font-black uppercase text-slate-900 mt-0.5">
                    {selectedDoc.programTitle}
                  </h2>
                  <p className="text-xs font-bold text-slate-600">{schoolName}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs bg-slate-100 p-3.5 rounded-xl">
                <div>
                  <span className="font-bold text-slate-500 block text-[10px]">TARIKH:</span>
                  <span className="font-black">{selectedDoc.tarikh}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 block text-[10px]">TEMPAT:</span>
                  <span className="font-black">{selectedDoc.tempat || schoolName}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 block text-[10px]">SASARAN:</span>
                  <span className="font-black">{selectedDoc.sasaran || '-'}</span>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-xl border border-slate-300">
                  <div className="font-black uppercase text-indigo-900 mb-1">
                    1. Objektif Program
                  </div>
                  <ul className="list-disc pl-5 space-y-1">
                    {(selectedDoc.objektif || []).map((o, i) => (
                      <li key={i}>{o}</li>
                    ))}
                  </ul>
                </div>

                {selectedDoc.pengisianAktiviti && selectedDoc.pengisianAktiviti.length > 0 && (
                  <div className="p-3.5 rounded-xl border border-slate-300">
                    <div className="font-black uppercase text-indigo-900 mb-1">
                      2. Pengisian &amp; Maklumat Penyertaan
                    </div>
                    <ul className="list-disc pl-5 space-y-1">
                      {selectedDoc.pengisianAktiviti.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="p-3.5 rounded-xl border border-slate-300">
                  <div className="font-black uppercase text-indigo-900 mb-1">
                    3. Impak &amp; Kemenjadian
                  </div>
                  <ul className="list-disc pl-5 space-y-1">
                    {(selectedDoc.impak || []).map((im, i) => (
                      <li key={i}>{im}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-300 flex justify-between text-xs">
                <div>
                  <div className="font-bold text-slate-600 mb-8">Disediakan oleh:</div>
                  <div className="font-black uppercase">
                    ({selectedDoc.preparedByName || currentUser.name})
                  </div>
                  <div className="text-slate-600">{selectedDoc.preparedByTitle || 'Penyelaras'}</div>
                </div>
                <div>
                  <div className="font-bold text-slate-600 mb-8">Disahkan oleh:</div>
                  <div className="font-black uppercase">
                    ({(schoolSettings as any)?.principalName || 'GURU BESAR'})
                  </div>
                  <div className="text-slate-600">Guru Besar {schoolName}</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 text-xs">
            <FileText className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            Pilih atau cipta Poster OPR di sebelah kiri.
          </div>
        )}
      </div>
    </div>
  );
};

export default ModuleOPRPoster;
