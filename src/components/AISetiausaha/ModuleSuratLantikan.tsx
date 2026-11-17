import React, { useState, useEffect } from 'react';
import { Printer, Award } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, SchoolSettings } from '../../types';
import {
  MYSG_DEFAULT_CATALOG,
  MySGJawatankuasaItem,
} from '../../utils/mysgJawatankuasaCatalog';
import { belongsToSchool } from '../../utils/schoolTenant';
import { triggerSmartPrint } from '../../utils/oprPrintHelper';

interface Props {
  currentUser: UserProfile;
  schoolSettings?: SchoolSettings | null;
  schoolCode: string;
  schoolName: string;
}

export const ModuleSuratLantikan: React.FC<Props> = ({
  schoolSettings,
  schoolCode,
  schoolName,
}) => {
  const [items, setItems] = useState<MySGJawatankuasaItem[]>(MYSG_DEFAULT_CATALOG);
  const [selectedKod, setSelectedKod] = useState<string>(MYSG_DEFAULT_CATALOG[0].kodMySG);
  const [tarikhSurat, setTarikhSurat] = useState<string>(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    async function loadGovernance() {
      try {
        const snap = await getDocs(collection(db, 'school_governance'));
        const matched = snap.docs
          .map((d) => d.data() as any)
          .filter((d) => belongsToSchool(d, schoolCode) && d.type === 'MYSG_JAWATANKUASA_V5');
        const latest = matched[matched.length - 1];
        if (latest && Array.isArray(latest.items) && latest.items.length > 0) {
          setItems(latest.items);
          setSelectedKod(latest.items[0].kodMySG);
        }
      } catch (err) {
        console.warn('Could not load MySG appointments:', err);
      }
    }
    loadGovernance();
  }, [schoolCode]);

  const currentItem = items.find((i) => i.kodMySG === selectedKod) || items[0];

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Award className="w-5 h-5 text-amber-400" />
          <select
            value={selectedKod}
            onChange={(e) => setSelectedKod(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold"
          >
            {items.map((it, idx) => (
              <option key={`${it.kodMySG}_${idx}`} value={it.kodMySG}>
                {it.kodMySG} — {it.jawatanRasmi} ({it.assignedTeacherName || 'Belum Dilantik'})
              </option>
            ))}
          </select>
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
              title: `Surat_Lantikan_${currentItem?.kodMySG || 'MySG'}`,
              orientation: 'portrait',
            })
          }
          className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-black uppercase flex items-center gap-1.5 cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          <span>Cetak Surat Lantikan</span>
        </button>
      </div>

      {currentItem && (
        <div
          id="surat-lantikan-mysg-sheet"
          className="bg-white text-black rounded-2xl p-10 shadow-2xl max-w-3xl mx-auto space-y-4 text-sm leading-relaxed"
        >
          <div className="border-b-2 border-black pb-3 text-center">
            <div className="font-bold text-xs">KEMENTERIAN PENDIDIKAN MALAYSIA</div>
            <div className="font-black text-base uppercase">{schoolName}</div>
            <div className="text-xs">Kod Sekolah: {schoolCode}</div>
          </div>

          <div className="flex justify-between text-xs pt-2">
            <div>Ruj. Kami: {schoolCode}/100-{currentItem.kodMySG}(1)</div>
            <div>Tarikh: {tarikhSurat}</div>
          </div>

          <div className="pt-2">
            <div>Kepada,</div>
            <div className="font-bold uppercase">
              {currentItem.assignedTeacherName || '................................................'}
            </div>
            <div>Guru {schoolName}</div>
          </div>

          <div>Tuan / Puan,</div>

          <div className="font-bold underline uppercase">
            PELANTIKAN RASMI SEBAGAI {currentItem.jawatanRasmi.toUpperCase()} ({currentItem.jawatankuasaInduk.toUpperCase()}) BAGI SESI PERSEKOLAHAN 2026
          </div>

          <p>Dengan segala hormatnya perkara di atas adalah dirujuk.</p>

          <p>
            2. Sukacita dimaklumkan bahawa pihak pengurusan {schoolName} dengan ini melantik tuan/puan secara rasmi memegang jawatan sebagai <strong>{currentItem.jawatanRasmi}</strong> di bawah <strong>{currentItem.jawatankuasaInduk}</strong> (Rujukan SKPM: {currentItem.skpmStandardRef}).
          </p>

          <p>
            3. Semoga dengan pelantikan ini, tuan/puan dapat melaksanakan amanah dan tanggungjawab secara profesional demi kecemerlangan murid dan sekolah.
          </p>

          <div>Sekian, terima kasih.</div>
          <div className="font-bold">&ldquo;MALAYSIA MADANI&rdquo;</div>
          <div className="font-bold">&ldquo;BERKHIDMAT UNTUK NEGARA&rdquo;</div>

          <div className="pt-10">
            <div>Saya yang menjalankan amanah,</div>
            <div className="mt-12 border-b border-black w-56" />
            <div className="font-bold uppercase mt-1">
              ({(schoolSettings as any)?.principalName || 'GURU BESAR'})
            </div>
            <div>Guru Besar,</div>
            <div>{schoolName}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModuleSuratLantikan;
