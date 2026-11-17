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

export const ModuleMinitMesyuarat: React.FC<Props> = ({
  currentUser,
  schoolSettings,
  schoolName,
}) => {
  const [tajuk, setTajuk] = useState<string>(
    'MINIT MESYUARAT PENGURUSAN SEKOLAH BIL. 1/2026'
  );
  const [tarikh, setTarikh] = useState<string>(new Date().toISOString().slice(0, 10));
  const [masa, setMasa] = useState<string>('2:00 Petang – 4:00 Petang');
  const [tempat, setTempat] = useState<string>('Bilik Mesyuarat');
  const [agendaFokus, setAgendaFokus] = useState<string>(
    'Penyelarasan Takwim Tahunan, Sasaran SKPM Kualiti@Sekolah dan Kemenjadian Murid.'
  );

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div className="md:col-span-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
            Tajuk Minit Mesyuarat (Format PKPA Bil. 2/1991)
          </label>
          <input
            type="text"
            value={tajuk}
            onChange={(e) => setTajuk(e.target.value.toUpperCase())}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
            Fokus Pembentangan
          </label>
          <input
            type="text"
            value={agendaFokus}
            onChange={(e) => setAgendaFokus(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
          />
        </div>
        <button
          type="button"
          onClick={() =>
            triggerSmartPrint({
              elementId: 'minit-mesyuarat-pkpa-sheet',
              title: tajuk,
              orientation: 'portrait',
            })
          }
          className="px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-black uppercase flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          <span>Cetak Minit PKPA</span>
        </button>
      </div>

      <div
        id="minit-mesyuarat-pkpa-sheet"
        className="bg-white text-black rounded-2xl p-10 shadow-2xl max-w-3xl mx-auto space-y-4 text-sm leading-relaxed"
      >
        <div className="border-b-2 border-black pb-3 text-center">
          <div className="font-black text-base uppercase">{schoolName}</div>
          <div className="font-bold uppercase">{tajuk}</div>
        </div>

        <div className="text-xs space-y-1 bg-slate-50 p-3 rounded border border-slate-300">
          <div><strong>Tarikh:</strong> {tarikh}</div>
          <div><strong>Masa:</strong> {masa}</div>
          <div><strong>Tempat:</strong> {tempat}</div>
          <div><strong>Pengerusi:</strong> {(schoolSettings as any)?.principalName || 'Guru Besar'}</div>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <div className="font-bold uppercase">1.0 PERUTUSAN PENGERUSI</div>
            <p className="pl-4">
              1.1 Pengerusi mengucapkan terima kasih atas kehadiran semua guru dan mengingatkan agar semua program sekolah direkodkan secara sistematik selaras dengan SKPM Kualiti@Sekolah.
            </p>
            <div className="text-right font-bold italic">Tindakan: Makluman Semua Guru</div>
          </div>

          <div>
            <div className="font-bold uppercase">2.0 PENGESAHAN MINIT MESYUARAT YANG LALU</div>
            <p className="pl-4">
              2.1 Minit mesyuarat yang lalu dicadang untuk disahkan dan disokong sebulat suara tanpa pindaan.
            </p>
            <div className="text-right font-bold italic">Tindakan: Setiausaha</div>
          </div>

          <div>
            <div className="font-bold uppercase">3.0 PERKARA-PERKARA BERBANGKIT</div>
            <p className="pl-4">
              3.1 Semua tindakan daripada mesyuarat lepas telah diambil tindakan sewajarnya.
            </p>
          </div>

          <div>
            <div className="font-bold uppercase">4.0 FOKUS PENGURUSAN &amp; PEMBENTANGAN</div>
            <p className="pl-4">4.1 {agendaFokus}</p>
            <div className="text-right font-bold italic">Tindakan: Semua Penyelaras &amp; Guru</div>
          </div>

          <div>
            <div className="font-bold uppercase">5.0 PENUTUP</div>
            <p className="pl-4">
              5.1 Mesyuarat ditangguhkan pada jam 4:00 petang dengan ucapan terima kasih daripada Pengerusi.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 pt-8 text-xs">
          <div>
            <div>Disediakan oleh,</div>
            <div className="mt-10 font-bold uppercase">({currentUser.name || 'SETIAUSAHA'})</div>
            <div>Setiausaha Mesyuarat</div>
          </div>
          <div>
            <div>Disahkan oleh,</div>
            <div className="mt-10 font-bold uppercase">
              ({(schoolSettings as any)?.principalName || 'GURU BESAR'})
            </div>
            <div>Guru Besar {schoolName}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModuleMinitMesyuarat;
