import React, { useState } from 'react';
import { Printer } from 'lucide-react';
import { UserProfile, SchoolSettings } from '../../types';
import { triggerSmartPrint } from '../../utils/oprPrintHelper';

interface Props {
  currentUser: UserProfile;
  schoolSettings?: SchoolSettings | null;
  schoolCode: string;
  schoolName: string;
}

export const ModuleMemoMesyuarat: React.FC<Props> = ({
  currentUser,
  schoolSettings,
  schoolCode,
  schoolName,
}) => {
  const [tajukMesyuarat, setTajukMesyuarat] = useState<string>(
    'MESYUARAT PENGURUSAN KURIKULUM & KOKURIKULUM BIL. 1/2026'
  );
  const [tarikhMesyuarat, setTarikhMesyuarat] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [masaMesyuarat, setMasaMesyuarat] = useState<string>('2:00 Petang');
  const [tempatMesyuarat, setTempatMesyuarat] = useState<string>('Bilik Mesyuarat Sekolah');

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div className="md:col-span-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
            Tajuk Panggilan Mesyuarat
          </label>
          <input
            type="text"
            value={tajukMesyuarat}
            onChange={(e) => setTajukMesyuarat(e.target.value.toUpperCase())}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
            Tarikh &amp; Masa
          </label>
          <div className="flex gap-1.5">
            <input
              type="date"
              value={tarikhMesyuarat}
              onChange={(e) => setTarikhMesyuarat(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-xs text-white"
            />
            <input
              type="text"
              value={masaMesyuarat}
              onChange={(e) => setMasaMesyuarat(e.target.value)}
              className="w-28 bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-xs text-white"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            triggerSmartPrint({
              elementId: 'memo-panggilan-mesyuarat-sheet',
              title: tajukMesyuarat,
              orientation: 'portrait',
            })
          }
          className="px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-black uppercase flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          <span>Cetak Memo Panggilan</span>
        </button>
      </div>

      <div
        id="memo-panggilan-mesyuarat-sheet"
        className="bg-white text-black rounded-2xl p-10 shadow-2xl max-w-3xl mx-auto space-y-4 text-sm leading-relaxed"
      >
        <div className="border-b-2 border-black pb-3 text-center">
          <div className="font-black text-base uppercase">{schoolName}</div>
          <div className="text-xs font-bold uppercase">MEMO DALAMAN / NOTIS PANGGILAN MESYUARAT</div>
        </div>

        <div className="text-xs flex justify-between">
          <span>Ruj. Kami: {schoolCode}/PKPA/2026(1)</span>
          <span>Tarikh: {tarikhMesyuarat}</span>
        </div>

        <div>Kepada: Semua Guru &amp; Ahli Jawatankuasa Berkenaan</div>
        <div>Tuan / Puan,</div>

        <div className="font-bold underline uppercase">{tajukMesyuarat}</div>

        <p>Dengan segala hormatnya perkara di atas adalah dirujuk.</p>
        <p>2. Sukacita dimaklumkan bahawa mesyuarat tersebut akan diadakan seperti ketetapan berikut:</p>

        <div className="pl-6 space-y-1 font-semibold">
          <div>Tarikh : {tarikhMesyuarat}</div>
          <div>Masa : {masaMesyuarat}</div>
          <div>Tempat : {tempatMesyuarat}</div>
          <div>Pengerusi : Guru Besar {schoolName}</div>
        </div>

        <p>3. Agenda Mesyuarat:</p>
        <ol className="list-decimal pl-10 space-y-0.5">
          <li>Perutusan Pengerusi</li>
          <li>Pengesahan Minit Mesyuarat Yang Lalu</li>
          <li>Perkara-perkara Berbangkit (Maklum Balas PKPA Bil. 2/1991)</li>
          <li>Pembentangan Kertas Kerja / Fokus Pengurusan &amp; SKPM</li>
          <li>Hal-hal Lain</li>
          <li>Penangguhan Mesyuarat</li>
        </ol>

        <p>Kehadiran dan kerjasama semua guru amat dihargai. Sekian, terima kasih.</p>

        <div className="pt-8">
          <div>Disediakan oleh,</div>
          <div className="mt-10 font-bold uppercase">
            ({currentUser.name || (schoolSettings as any)?.principalName || 'SETIAUSAHA'})
          </div>
          <div>Setiausaha Mesyuarat, {schoolName}</div>
        </div>
      </div>
    </div>
  );
};

export default ModuleMemoMesyuarat;
