import React, { useRef, useState } from 'react';
import {
  Baby,
  Upload,
  Download,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  Printer,
  Clock,
  UserCheck,
  ShieldCheck,
  Copy,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { DayOfWeek, DAYS_OF_WEEK } from './types';
import { TeacherDirectoryEntry } from '../../utils/lampiranData';
import {
  PrasekolahTimetableDoc,
  PrasekolahTimeBlock,
  computeBlockPeriodEquivalent,
  createDefaultPrasekolahTimetable,
  downloadPrasekolahTemplateExcel,
  formatMinutesToTime,
  parsePrasekolahUploadFile,
  parseTimeStringToMinutes,
} from '../../utils/prasekolahTimetable';

interface PrasekolahTimetableViewProps {
  prasekolahDoc: PrasekolahTimetableDoc;
  teacherList: TeacherDirectoryEntry[];
  isAdmin: boolean;
  isSaving?: boolean;
  schoolName: string;
  schoolCode: string;
  onSaveDoc: (nextDoc: PrasekolahTimetableDoc) => Promise<void> | void;
}

export const PrasekolahTimetableView: React.FC<PrasekolahTimetableViewProps> = ({
  prasekolahDoc,
  teacherList,
  isAdmin,
  isSaving = false,
  schoolName,
  schoolCode,
  onSaveDoc,
}) => {
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('ISNIN');
  const [draftDoc, setDraftDoc] = useState<PrasekolahTimetableDoc>(prasekolahDoc);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync draft when prop doc updates externally (e.g. year/school switch)
  React.useEffect(() => {
    setDraftDoc(prasekolahDoc);
  }, [prasekolahDoc]);

  const handleGuruChange = (newCode: string) => {
    const teacherObj = teacherList.find((t) => t.code === newCode);
    const newName = teacherObj?.name || newCode;
    const updatedBlocks: Record<DayOfWeek, PrasekolahTimeBlock[]> = {
      ISNIN: [],
      SELASA: [],
      RABU: [],
      KHAMIS: [],
      JUMAAT: [],
    };
    DAYS_OF_WEEK.forEach((d) => {
      updatedBlocks[d] = (draftDoc.blocks[d] || []).map((b) => ({
        ...b,
        teacherCode: newCode,
        teacherName: newName,
      }));
    });
    setDraftDoc({
      ...draftDoc,
      guruPrasekolahCode: newCode,
      guruPrasekolahName: newName,
      blocks: updatedBlocks,
    });
  };

  const handlePpmChange = (newPpm: string) => {
    const updatedBlocks: Record<DayOfWeek, PrasekolahTimeBlock[]> = {
      ISNIN: [],
      SELASA: [],
      RABU: [],
      KHAMIS: [],
      JUMAAT: [],
    };
    DAYS_OF_WEEK.forEach((d) => {
      updatedBlocks[d] = (draftDoc.blocks[d] || []).map((b) => ({
        ...b,
        ppmName: newPpm,
      }));
    });
    setDraftDoc({
      ...draftDoc,
      ppmName: newPpm,
      blocks: updatedBlocks,
    });
  };

  const handleBlockChange = (
    day: DayOfWeek,
    blockId: string,
    patch: Partial<PrasekolahTimeBlock>
  ) => {
    const currentList = draftDoc.blocks[day] || [];
    const nextList = currentList.map((b) => {
      if (b.id !== blockId) return b;
      const merged = { ...b, ...patch };
      const startMinutes =
        patch.startTime !== undefined
          ? parseTimeStringToMinutes(patch.startTime, b.startMinutes)
          : merged.startMinutes;
      const endMinutes =
        patch.endTime !== undefined
          ? parseTimeStringToMinutes(patch.endTime, b.endMinutes)
          : merged.endMinutes;
      const isRecess = Boolean(merged.isRecess);
      return {
        ...merged,
        startMinutes,
        endMinutes,
        isRecess,
        requiresRelief: !isRecess,
        periodEquivalent: computeBlockPeriodEquivalent(startMinutes, endMinutes, isRecess),
      };
    });
    setDraftDoc({
      ...draftDoc,
      blocks: {
        ...draftDoc.blocks,
        [day]: nextList,
      },
    });
  };

  const handleAddBlock = (day: DayOfWeek) => {
    const currentList = draftDoc.blocks[day] || [];
    const lastBlock = currentList[currentList.length - 1];
    const startMin = lastBlock ? lastBlock.endMinutes : 450;
    const endMin = Math.min(startMin + 30, 13 * 60);
    const nextNum = currentList.length + 1;
    const newBlock: PrasekolahTimeBlock = {
      id: `${day}_PRA_${Date.now()}`,
      day,
      slotCode: `PRA${nextNum}`,
      startTime: formatMinutesToTime(startMin),
      endTime: formatMinutesToTime(endMin),
      startMinutes: startMin,
      endMinutes: endMin,
      activityName: 'Aktiviti Pembelajaran Prasekolah',
      learningArea: 'Modul Bertema KSPK',
      teacherCode: draftDoc.guruPrasekolahCode,
      teacherName: draftDoc.guruPrasekolahName,
      ppmName: draftDoc.ppmName,
      isRecess: false,
      requiresRelief: true,
      periodEquivalent: computeBlockPeriodEquivalent(startMin, endMin, false),
    };
    setDraftDoc({
      ...draftDoc,
      blocks: {
        ...draftDoc.blocks,
        [day]: [...currentList, newBlock],
      },
    });
  };

  const handleRemoveBlock = (day: DayOfWeek, blockId: string) => {
    const currentList = draftDoc.blocks[day] || [];
    setDraftDoc({
      ...draftDoc,
      blocks: {
        ...draftDoc.blocks,
        [day]: currentList.filter((b) => b.id !== blockId),
      },
    });
  };

  const handleCopyDayToAllDays = (sourceDay: DayOfWeek) => {
    const sourceBlocks = draftDoc.blocks[sourceDay] || [];
    const updatedBlocks: Record<DayOfWeek, PrasekolahTimeBlock[]> = {
      ISNIN: [],
      SELASA: [],
      RABU: [],
      KHAMIS: [],
      JUMAAT: [],
    };
    DAYS_OF_WEEK.forEach((d) => {
      updatedBlocks[d] = sourceBlocks.map((b, idx) => ({
        ...b,
        id: `${d}_${b.slotCode || idx + 1}_${idx}`,
        day: d,
      }));
    });
    setDraftDoc({
      ...draftDoc,
      blocks: updatedBlocks,
    });
    setStatusBanner({
      type: 'info',
      text: `Slot masa hari ${sourceDay} telah disalin ke semua hari (ISNIN – JUMAAT). Klik "Simpan Jadual Prasekolah" untuk menyimpan.`,
    });
  };

  const handleResetDefault = () => {
    const fresh = createDefaultPrasekolahTimetable({
      id: draftDoc.id,
      schoolCode,
      academicYear: draftDoc.academicYear,
      guruPrasekolahCode: draftDoc.guruPrasekolahCode,
      guruPrasekolahName: draftDoc.guruPrasekolahName,
      ppmName: draftDoc.ppmName,
      className: draftDoc.className,
    });
    setDraftDoc(fresh);
    setStatusBanner({
      type: 'info',
      text: 'Jadual Prasekolah (07:30 - 11:30) telah ditetapkan semula kepada templat rasmi KSPK. Klik "Simpan Jadual Prasekolah" untuk mengesahkan.',
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { blocksByDay, importedCount } = await parsePrasekolahUploadFile(file, {
        guruPrasekolahCode: draftDoc.guruPrasekolahCode,
        guruPrasekolahName: draftDoc.guruPrasekolahName,
        ppmName: draftDoc.ppmName,
      });

      if (importedCount === 0) {
        setStatusBanner({
          type: 'error',
          text: 'Tiada baris jadual sah ditemui dalam fail tersebut. Pastikan lajur mengandungi Hari (ISNIN-JUMAAT), Masa Mula (cth: 07:30), Masa Tamat (cth: 08:10), dan Aktiviti.',
        });
        return;
      }

      const mergedBlocks: Record<DayOfWeek, PrasekolahTimeBlock[]> = { ...draftDoc.blocks };
      DAYS_OF_WEEK.forEach((d) => {
        if (blocksByDay[d] && blocksByDay[d].length > 0) {
          mergedBlocks[d] = blocksByDay[d];
        }
      });

      const nextDoc: PrasekolahTimetableDoc = {
        ...draftDoc,
        blocks: mergedBlocks,
        updatedAt: new Date().toISOString(),
      };
      setDraftDoc(nextDoc);
      await onSaveDoc(nextDoc);
      setStatusBanner({
        type: 'success',
        text: `Berjaya memuat naik & menyimpan ${importedCount} blok masa Jadual Prasekolah daripada "${file.name}".`,
      });
    } catch (err) {
      console.error('Failed to parse Prasekolah file:', err);
      setStatusBanner({
        type: 'error',
        text: 'Gagal membaca fail Excel/CSV. Sila gunakan templat .xlsx yang disediakan.',
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveClick = async () => {
    const nextDoc: PrasekolahTimetableDoc = {
      ...draftDoc,
      updatedAt: new Date().toISOString(),
    };
    await onSaveDoc(nextDoc);
    setStatusBanner({
      type: 'success',
      text: 'Jadual Prasekolah (Terpisah) telah berjaya disimpan ke pangkalan data sekolah.',
    });
  };

  const dayBlocks = draftDoc.blocks[selectedDay] || [];
  const activeReliefBlocksCount = dayBlocks.filter((b) => !b.isRecess && b.requiresRelief !== false).length;

  return (
    <div className="space-y-6">
      {/* Header & Isolation Guarantee Banner */}
      <div className="bg-gradient-to-br from-teal-950/90 via-slate-900 to-slate-950 border border-teal-500/30 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-md bg-teal-500/20 border border-teal-400/40 text-teal-300 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                <Baby className="w-3.5 h-3.5" />
                Jadual Prasekolah (Terpisah & Terasing)
              </span>
              <span className="px-2.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/30 text-amber-300 text-[10px] font-bold">
                Sesi {draftDoc.sessionStart || '07:30'} – {draftDoc.sessionEnd || '11:30'}
              </span>
              <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                Ganti Prasekolah: Sehala (Tidak Perlu Pulang Balik)
              </span>
            </div>
            <h3 className="text-lg font-black text-white tracking-tight">
              Pengurusan Jadual Waktu Prasekolah & Integrasi Relief Sehala ({schoolName})
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed max-w-4xl">
              Jadual Prasekolah disimpan secara terasing dalam koleksi <code className="text-teal-300 font-mono">prasekolah_timetables</code> dan{' '}
              <strong>tidak sesekali mengganggu</strong> enjin penjadualan aliran perdana (Tahun 1–6), waktu <code className="text-teal-300">PN</code>, atau{' '}
              <code className="text-teal-300">PKAR</code>. Apabila <strong>Guru Prasekolah ({draftDoc.guruPrasekolahCode})</strong> ditanda tidak hadir dalam{' '}
              <em>Kehadiran Staf</em> atau <em>Jadual Guru Ganti</em>, blok masa Prasekolah di bawah akan dimuatkan secara automatik ke dalam jadual relief dengan status{' '}
              <span className="text-amber-300 font-bold">"Ganti Prasekolah (Tidak Perlu Pulang Balik)"</span>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0 print:hidden">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-2 rounded-xl bg-teal-600/20 hover:bg-teal-600/30 text-teal-200 border border-teal-500/40 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Muat Naik Excel / CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => downloadPrasekolahTemplateExcel(draftDoc)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-teal-400" />
                  <span>Muat Turun Templat (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveClick}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-lg shadow-emerald-600/25 transition-all cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSaving ? 'Menyimpan...' : 'Simpan Jadual Prasekolah'}</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-slate-400" />
              <span>Cetak A4</span>
            </button>
          </div>
        </div>

        {/* Status notification banner */}
        {statusBanner && (
          <div
            className={`mt-4 px-4 py-2.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-3 ${
              statusBanner.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                : statusBanner.type === 'error'
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                : 'bg-teal-500/15 border-teal-500/40 text-teal-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{statusBanner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-[11px] underline opacity-80 hover:opacity-100 cursor-pointer"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Prasekolah Class Profile Controls */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Nama Kelas Prasekolah
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              value={draftDoc.className}
              onChange={(e) => setDraftDoc({ ...draftDoc, className: e.target.value })}
              placeholder="Prasekolah"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Guru Prasekolah (Auto-Link Relief)
            </label>
            <select
              disabled={!isAdmin}
              value={draftDoc.guruPrasekolahCode}
              onChange={(e) => handleGuruChange(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-teal-300 focus:outline-none focus:border-teal-500"
            >
              {teacherList.map((t, idx) => (
                <option key={`${t.id || t.code}_${idx}`} value={t.code}>
                  {t.code} — {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Pembantu Pengurusan Murid (PPM)
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              value={draftDoc.ppmName}
              onChange={(e) => handlePpmChange(e.target.value)}
              placeholder="Nama PPM Prasekolah"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Waktu Sesi & Blok Relief
              </div>
              <div className="text-sm font-black text-white mt-0.5">
                07:30 – 11:30 ({activeReliefBlocksCount} Blok PdP/Hari)
              </div>
              <div className="text-[10px] text-teal-400 font-semibold">
                Tiada Tukar Waktu · Tiada Tarikh Pulang Balik
              </div>
            </div>
            <UserCheck className="w-7 h-7 text-teal-400/70 shrink-0" />
          </div>
        </div>
      </div>

      {/* Day Selector & Quick Actions */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {DAYS_OF_WEEK.map((day) => {
              const isSelected = selectedDay === day;
              const count = (draftDoc.blocks[day] || []).length;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
                    isSelected
                      ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/25'
                      : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <span>{day}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] ${
                      isSelected ? 'bg-teal-800 text-teal-100' : 'bg-slate-900 text-slate-400'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleAddBlock(selectedDay)}
                className="px-3 py-1.5 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 text-teal-300 border border-teal-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Blok Masa ({selectedDay})</span>
              </button>
              <button
                type="button"
                onClick={() => handleCopyDayToAllDays(selectedDay)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-cyan-400" />
                <span>Salin {selectedDay} Ke Semua Hari</span>
              </button>
              <button
                type="button"
                onClick={handleResetDefault}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>Reset Templat KSPK</span>
              </button>
            </div>
          )}
        </div>

        {/* Editable Day Schedule Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950/90 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <th className="py-3 px-3 w-24">Kod Slot</th>
                <th className="py-3 px-3 w-28">Masa Mula</th>
                <th className="py-3 px-3 w-28">Masa Tamat</th>
                <th className="py-3 px-3">Aktiviti Pembelajaran Prasekolah</th>
                <th className="py-3 px-3">Tunjang / Bidang KSPK</th>
                <th className="py-3 px-3 w-40">Guru & PPM</th>
                <th className="py-3 px-3 w-44 text-center">Status Auto-Relief</th>
                {isAdmin && <th className="py-3 px-3 w-16 text-center">Padam</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {dayBlocks.map((block) => (
                <tr
                  key={block.id}
                  className={
                    block.isRecess
                      ? 'bg-amber-950/20 hover:bg-amber-950/30'
                      : 'bg-slate-900/50 hover:bg-slate-800/40'
                  }
                >
                  <td className="py-2.5 px-3 font-mono font-bold text-teal-300">
                    <input
                      type="text"
                      disabled={!isAdmin}
                      value={block.slotCode}
                      onChange={(e) =>
                        handleBlockChange(selectedDay, block.id, { slotCode: e.target.value })
                      }
                      className="w-20 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-bold text-teal-300"
                    />
                  </td>
                  <td className="py-2.5 px-3">
                    <input
                      type="time"
                      disabled={!isAdmin}
                      value={block.startTime}
                      onChange={(e) =>
                        handleBlockChange(selectedDay, block.id, { startTime: e.target.value })
                      }
                      className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-white"
                    />
                  </td>
                  <td className="py-2.5 px-3">
                    <input
                      type="time"
                      disabled={!isAdmin}
                      value={block.endTime}
                      onChange={(e) =>
                        handleBlockChange(selectedDay, block.id, { endTime: e.target.value })
                      }
                      className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-white"
                    />
                  </td>
                  <td className="py-2.5 px-3">
                    <input
                      type="text"
                      disabled={!isAdmin}
                      value={block.activityName}
                      onChange={(e) =>
                        handleBlockChange(selectedDay, block.id, { activityName: e.target.value })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs font-semibold text-white"
                    />
                  </td>
                  <td className="py-2.5 px-3">
                    <input
                      type="text"
                      disabled={!isAdmin}
                      value={block.learningArea}
                      onChange={(e) =>
                        handleBlockChange(selectedDay, block.id, { learningArea: e.target.value })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-300"
                    />
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="text-[11px] font-bold text-teal-300">
                      {block.teacherCode || draftDoc.guruPrasekolahCode}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      PPM: {block.ppmName || draftDoc.ppmName}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <button
                      type="button"
                      disabled={!isAdmin}
                      onClick={() =>
                        handleBlockChange(selectedDay, block.id, { isRecess: !block.isRecess })
                      }
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                        block.isRecess
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                          : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      }`}
                    >
                      {block.isRecess
                        ? 'REHAT (PPM Kawal Selia)'
                        : `Perlu Guru Ganti (${block.periodEquivalent ?? 1} Waktu)`}
                    </button>
                  </td>
                  {isAdmin && (
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveBlock(selectedDay, block.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Padam Blok"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Full Monday-Friday Visual Overview Grid (07:30 - 11:30) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-400" />
            <h4 className="text-sm font-black text-white uppercase tracking-wide">
              Paparan Penuh Jadual Mingguan Prasekolah (ISNIN – JUMAAT | 07:30 – 11:30)
            </h4>
          </div>
          <div className="text-[11px] text-slate-400 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-teal-400" />
            <span>
              Guru Prasekolah: <strong className="text-teal-300">{draftDoc.guruPrasekolahName} ({draftDoc.guruPrasekolahCode})</strong> · PPM:{' '}
              <strong className="text-slate-200">{draftDoc.ppmName}</strong>
            </span>
          </div>
        </div>

        <div className="space-y-3">
          {DAYS_OF_WEEK.map((day) => {
            const blocks = draftDoc.blocks[day] || [];
            return (
              <div
                key={day}
                className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-3 flex flex-col lg:flex-row lg:items-stretch gap-3"
              >
                <div className="lg:w-28 shrink-0 flex flex-row lg:flex-col items-center justify-between lg:justify-center bg-teal-950/50 border border-teal-500/30 rounded-lg px-3 py-2">
                  <span className="text-xs font-black text-teal-300 tracking-wider">{day}</span>
                  <span className="text-[10px] text-slate-400 font-semibold">07:30 – 11:30</span>
                </div>

                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
                  {blocks.map((b) => (
                    <div
                      key={b.id}
                      className={`rounded-lg p-2.5 border flex flex-col justify-between ${
                        b.isRecess
                          ? 'bg-amber-950/30 border-amber-500/30 text-amber-200'
                          : 'bg-slate-900 border-slate-800 text-slate-200'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 text-[10px] font-mono font-bold text-teal-400">
                          <span>{b.slotCode}</span>
                          <span>
                            {b.startTime}–{b.endTime}
                          </span>
                        </div>
                        <div className="text-xs font-bold text-white mt-1 leading-snug">
                          {b.activityName}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                          {b.learningArea}
                        </div>
                      </div>
                      <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[9px]">
                        <span className="font-bold text-teal-300">{b.teacherCode}</span>
                        <span
                          className={
                            b.isRecess ? 'text-amber-300 font-semibold' : 'text-emerald-400 font-semibold'
                          }
                        >
                          {b.isRecess ? 'Rehat PPM' : 'Ganti Sehala'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
