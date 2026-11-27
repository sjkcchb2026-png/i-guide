import React, { useState, useEffect, useMemo } from 'react';
import { Printer, Award, UserCheck, Layers } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, SchoolSettings, PersonnelProfile } from '../../types';
import {
  MYSG_DEFAULT_CATALOG,
  MySGJawatankuasaItem,
  mergeMySGCatalogWithSaved,
  computeTeacherWorkloadRadar,
} from '../../utils/mysgJawatankuasaCatalog';
import { scopedDocId } from '../../utils/schoolTenant';
import { triggerSmartPrint } from '../../utils/oprPrintHelper';

interface Props {
  currentUser: UserProfile;
  schoolSettings?: SchoolSettings | null;
  schoolCode: string;
  schoolName: string;
  academicYear?: string;
  mysgItems?: MySGJawatankuasaItem[];
  personnel?: PersonnelProfile[];
}

export const ModuleSuratLantikan: React.FC<Props> = ({
  schoolSettings,
  schoolCode,
  schoolName,
  academicYear = '2026',
  mysgItems: propItems,
  personnel = [],
}) => {
  const [items, setItems] = useState<MySGJawatankuasaItem[]>(
    propItems && propItems.length > 0 ? propItems : MYSG_DEFAULT_CATALOG
  );
  const [viewMode, setViewMode] = useState<'TEACHER' | 'COMMITTEE'>('TEACHER');
  const [selectedTeacherKey, setSelectedTeacherKey] = useState<string>('');
  const [selectedKod, setSelectedKod] = useState<string>(MYSG_DEFAULT_CATALOG[0].kodMySG);
  const [selectedRecipientInCommittee, setSelectedRecipientInCommittee] = useState<string>('PENYELARAS');
  const [tarikhSurat, setTarikhSurat] = useState<string>(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (propItems && propItems.length > 0) {
      setItems(propItems);
      return;
    }
    async function loadGovernance() {
      try {
        const aySlug = (academicYear || '2026').replace(/\//g, '-');
        const assignDocId = `${schoolCode}_${aySlug}`;
        const govDocId = scopedDocId(schoolCode, `mysg_jawatankuasa_${aySlug}`);
        const [assignSnap, govSnap] = await Promise.all([
          getDoc(doc(db, 'mysg_jawatankuasa_assignments', assignDocId)).catch(() => null),
          getDoc(doc(db, 'school_governance', govDocId)).catch(() => null),
        ]);
        if (assignSnap?.exists() && Array.isArray(assignSnap.data()?.items)) {
          setItems(mergeMySGCatalogWithSaved(assignSnap.data().items));
        } else if (govSnap?.exists() && Array.isArray(govSnap.data()?.items)) {
          setItems(mergeMySGCatalogWithSaved(govSnap.data().items));
        } else {
          setItems(mergeMySGCatalogWithSaved(null));
        }
      } catch (err) {
        console.warn('Could not load MySG appointments:', err);
      }
    }
    loadGovernance();
  }, [schoolCode, academicYear, propItems]);

  const radarList = useMemo(
    () => computeTeacherWorkloadRadar(items, personnel),
    [items, personnel]
  );

  useEffect(() => {
    if (radarList.length > 0 && !selectedTeacherKey) {
      const firstWithRole =
        radarList.find((r) => r.positionCount > 0 || r.ahliCount > 0) || radarList[0];
      setSelectedTeacherKey(firstWithRole.teacherId || firstWithRole.teacherName);
    }
  }, [radarList, selectedTeacherKey]);

  const currentTeacherRadar = useMemo(() => {
    if (!radarList.length) return null;
    return (
      radarList.find(
        (r) => r.teacherId === selectedTeacherKey || r.teacherName === selectedTeacherKey
      ) || radarList[0]
    );
  }, [radarList, selectedTeacherKey]);

  const currentItem = useMemo(
    () => items.find((i) => i.kodMySG === selectedKod) || items[0],
    [items, selectedKod]
  );

  const recipientForCommitteeMode = useMemo(() => {
    if (!currentItem) return { name: '', roleLabel: '' };
    if (selectedRecipientInCommittee === 'PENYELARAS') {
      return {
        name: currentItem.assignedTeacherName || '................................................',
        roleLabel: `${currentItem.jawatanRasmi} (Penyelaras Utama)`,
      };
    }
    const ahli = (currentItem.ahliList || []).find(
      (a) => a.teacherId === selectedRecipientInCommittee || a.teacherName === selectedRecipientInCommittee
    );
    return {
      name: ahli?.teacherName || '................................................',
      roleLabel: `Ahli Jawatankuasa (AJK) — ${currentItem.jawatankuasaInduk}`,
    };
  }, [currentItem, selectedRecipientInCommittee]);

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Award className="w-5 h-5 text-amber-400" />

          {/* Switcher: Mengikut Guru vs Mengikut Jawatankuasa */}
          <div className="inline-flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('TEACHER')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 cursor-pointer transition ${
                viewMode === 'TEACHER'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Surat Lantikan Individu Guru (Penyelaras + AJK)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('COMMITTEE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 cursor-pointer transition ${
                viewMode === 'COMMITTEE'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Mengikut Jawatankuasa</span>
            </button>
          </div>

          {viewMode === 'TEACHER' ? (
            <select
              value={selectedTeacherKey}
              onChange={(e) => setSelectedTeacherKey(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold"
            >
              {radarList.map((r, idx) => (
                <option key={`${r.teacherId}_${idx}`} value={r.teacherId || r.teacherName}>
                  {r.teacherName} ({r.positionCount} Penyelaras · {r.ahliCount} AJK · {r.totalMata}m)
                </option>
              ))}
            </select>
          ) : (
            <>
              <select
                value={selectedKod}
                onChange={(e) => {
                  setSelectedKod(e.target.value);
                  setSelectedRecipientInCommittee('PENYELARAS');
                }}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold max-w-xs"
              >
                {items.map((it, idx) => (
                  <option key={`${it.kodMySG}_${idx}`} value={it.kodMySG}>
                    {it.kodMySG} — {it.jawatankuasaInduk} ({it.assignedTeacherName || 'Belum Dilantik'})
                  </option>
                ))}
              </select>

              {currentItem && (
                <select
                  value={selectedRecipientInCommittee}
                  onChange={(e) => setSelectedRecipientInCommittee(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-teal-300 font-bold"
                >
                  <option value="PENYELARAS">
                    Penyelaras: {currentItem.assignedTeacherName || 'Belum Dilantik'}
                  </option>
                  {(currentItem.ahliList || []).map((a, idx) => (
                    <option
                      key={`${a.teacherId}_${idx}`}
                      value={a.teacherId || a.teacherName}
                    >
                      AJK: {a.teacherName}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}

          <input
            type="date"
            value={tarikhSurat}
            onChange={(e) => setTarikhSurat(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
          />
        </div>

        <button
          type="button"
          onClick={() =>
            triggerSmartPrint({
              elementId: 'surat-lantikan-mysg-sheet',
              title:
                viewMode === 'TEACHER'
                  ? `Surat_Lantikan_${currentTeacherRadar?.teacherName || 'Guru'}_Sesi_${academicYear}`
                  : `Surat_Lantikan_${currentItem?.kodMySG || 'MySG'}_Sesi_${academicYear}`,
              orientation: 'portrait',
            })
          }
          className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-black uppercase flex items-center gap-1.5 cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          <span>Cetak Surat Lantikan (Sesi {academicYear})</span>
        </button>
      </div>

      {/* Printable Official Appointment Letter Sheet */}
      <div
        id="surat-lantikan-mysg-sheet"
        className="bg-white text-black rounded-2xl p-10 shadow-2xl max-w-3xl mx-auto space-y-4 text-sm leading-relaxed"
      >
        <div className="border-b-2 border-black pb-3 text-center">
          <div className="font-bold text-xs">KEMENTERIAN PENDIDIKAN MALAYSIA</div>
          <div className="font-black text-base uppercase">{schoolName}</div>
          <div className="text-xs">Kod Sekolah: {schoolCode}</div>
        </div>

        {viewMode === 'TEACHER' && currentTeacherRadar ? (
          <>
            <div className="flex justify-between text-xs pt-2">
              <div>
                Ruj. Kami: {schoolCode}/100-MYSG/{academicYear}(
                {currentTeacherRadar.teacherName.slice(0, 6).replace(/\s+/g, '')})
              </div>
              <div>Tarikh: {tarikhSurat}</div>
            </div>

            <div className="pt-2">
              <div>Kepada,</div>
              <div className="font-bold uppercase text-base">
                {currentTeacherRadar.teacherName}
              </div>
              <div>Guru {schoolName}</div>
            </div>

            <div>Tuan / Puan,</div>

            <div className="font-bold underline uppercase">
              PELANTIKAN RASMI JAWATANKUASA PENGURUSAN SEKOLAH (PENYELARAS &amp; AHLI JAWATANKUASA) BAGI SESI PERSEKOLAHAN {academicYear}
            </div>

            <p>Dengan segala hormatnya perkara di atas adalah dirujuk.</p>

            <p>
              2. Sukacita dimaklumkan bahawa pihak pengurusan <strong>{schoolName}</strong> dengan ini melantik tuan/puan secara rasmi untuk menjalankan tugas dalam Jawatankuasa Pengurusan Sekolah (Pentadbiran, Kurikulum, Hal Ehwal Murid &amp; Kokurikulum) bagi <strong>Sesi Persekolahan {academicYear}</strong> seperti ketetapan berikut:
            </p>

            {/* Section A: Load-Bearing Penyelaras / Ketua / Setiausaha */}
            <div className="space-y-1.5 pt-1">
              <div className="font-bold text-xs uppercase bg-slate-100 px-3 py-1.5 border border-black">
                A. JAWATAN UTAMA: PENYELARAS / SETIAUSAHA / KETUA PANITIA (JUMLAH BEBAN: {currentTeacherRadar.totalMata} MATA)
              </div>
              {currentTeacherRadar.positions.length > 0 ? (
                <table className="w-full border-collapse border border-black text-xs">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="border border-black px-2 py-1 text-left w-8">Bil</th>
                      <th className="border border-black px-2 py-1 text-left">Bidang</th>
                      <th className="border border-black px-2 py-1 text-left">Jawatan Rasmi &amp; Jawatankuasa Induk</th>
                      <th className="border border-black px-2 py-1 text-center w-24">Tahap / Mata</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentTeacherRadar.positions.map((pos, idx) => (
                      <tr key={`${pos.kodMySG}_${idx}`}>
                        <td className="border border-black px-2 py-1 text-center">{idx + 1}</td>
                        <td className="border border-black px-2 py-1 font-semibold">{pos.pillar}</td>
                        <td className="border border-black px-2 py-1">
                          <div className="font-bold">{pos.jawatanRasmi}</div>
                          <div className="text-[11px]">{pos.jawatankuasaInduk} ({pos.skpmBucket})</div>
                        </td>
                        <td className="border border-black px-2 py-1 text-center font-bold">
                          {pos.tahapBeban} ({pos.mataBeban}m)
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-xs italic px-3 py-2 border border-black">
                  Tiada lantikan Penyelaras Utama direkodkan bagi Sesi {academicYear}.
                </div>
              )}
            </div>

            {/* Section B: Ahli Jawatankuasa (AJK) */}
            <div className="space-y-1.5 pt-2">
              <div className="font-bold text-xs uppercase bg-slate-100 px-3 py-1.5 border border-black">
                B. AHLI JAWATANKUASA (AJK) ({currentTeacherRadar.ahliPositions.length} JAWATANKUASA · {currentTeacherRadar.ahliPositions.length} MATA BEBAN)
              </div>
              {currentTeacherRadar.ahliPositions.length > 0 ? (
                <table className="w-full border-collapse border border-black text-xs">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="border border-black px-2 py-1 text-left w-8">Bil</th>
                      <th className="border border-black px-2 py-1 text-left">Bidang</th>
                      <th className="border border-black px-2 py-1 text-left">Jawatankuasa Induk</th>
                      <th className="border border-black px-2 py-1 text-left">Peranan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentTeacherRadar.ahliPositions.map((pos, idx) => (
                      <tr key={`ahli_${pos.kodMySG}_${idx}`}>
                        <td className="border border-black px-2 py-1 text-center">{idx + 1}</td>
                        <td className="border border-black px-2 py-1 font-semibold">{pos.pillar}</td>
                        <td className="border border-black px-2 py-1 font-bold">
                          {pos.jawatankuasaInduk}
                        </td>
                        <td className="border border-black px-2 py-1">
                          Ahli Jawatankuasa (AJK · 1m)
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-xs italic px-3 py-2 border border-black">
                  Tiada keahlian Ahli Jawatankuasa (AJK) direkodkan bagi Sesi {academicYear}.
                </div>
              )}
            </div>

            <p>
              3. Semoga dengan pelantikan ini, tuan/puan dapat melaksanakan amanah dan tanggungjawab secara profesional demi kecemerlangan murid dan sekolah sepanjang Sesi Persekolahan {academicYear}.
            </p>
          </>
        ) : (
          currentItem && (
            <>
              <div className="flex justify-between text-xs pt-2">
                <div>
                  Ruj. Kami: {schoolCode}/100-{currentItem.kodMySG}/{academicYear}(1)
                </div>
                <div>Tarikh: {tarikhSurat}</div>
              </div>

              <div className="pt-2">
                <div>Kepada,</div>
                <div className="font-bold uppercase">
                  {recipientForCommitteeMode.name}
                </div>
                <div>Guru {schoolName}</div>
              </div>

              <div>Tuan / Puan,</div>

              <div className="font-bold underline uppercase">
                PELANTIKAN RASMI SEBAGAI {recipientForCommitteeMode.roleLabel.toUpperCase()} ({currentItem.jawatankuasaInduk.toUpperCase()}) BAGI SESI PERSEKOLAHAN {academicYear}
              </div>

              <p>Dengan segala hormatnya perkara di atas adalah dirujuk.</p>

              <p>
                2. Sukacita dimaklumkan bahawa pihak pengurusan {schoolName} dengan ini melantik tuan/puan secara rasmi memegang jawatan sebagai <strong>{recipientForCommitteeMode.roleLabel}</strong> di bawah <strong>{currentItem.jawatankuasaInduk}</strong> bagi <strong>Sesi Persekolahan {academicYear}</strong> (Rujukan SKPM: {currentItem.skpmStandardRef}).
              </p>

              <div className="border border-black p-3 text-xs space-y-1 bg-slate-50">
                <div className="font-bold uppercase underline">
                  Senarai Jawatankuasa {currentItem.jawatankuasaInduk} (Sesi {academicYear}):
                </div>
                <div>
                  <strong>Penyelaras / Setiausaha Utama:</strong>{' '}
                  {currentItem.assignedTeacherName || 'Belum Dilantik'} ({currentItem.jawatanRasmi})
                </div>
                <div>
                  <strong>Ahli Jawatankuasa (AJK):</strong>{' '}
                  {(currentItem.ahliList || []).length > 0
                    ? (currentItem.ahliList || []).map((a) => a.teacherName).join(', ')
                    : 'Tiada AJK tambahan direkodkan'}
                </div>
              </div>

              <p>
                3. Semoga dengan pelantikan ini, tuan/puan dapat melaksanakan amanah dan tanggungjawab secara profesional demi kecemerlangan murid dan sekolah.
              </p>
            </>
          )
        )}

        <div>Sekian, terima kasih.</div>
        <div className="font-bold">&ldquo;MALAYSIA MADANI&rdquo;</div>
        <div className="font-bold">&ldquo;BERKHIDMAT UNTUK NEGARA&rdquo;</div>

        <div className="pt-8">
          <div>Saya yang menjalankan amanah,</div>
          <div className="mt-12 border-b border-black w-56" />
          <div className="font-bold uppercase mt-1">
            ({(schoolSettings as any)?.principalName || 'GURU BESAR'})
          </div>
          <div>Guru Besar,</div>
          <div>{schoolName}</div>
        </div>
      </div>
    </div>
  );
};

export default ModuleSuratLantikan;
