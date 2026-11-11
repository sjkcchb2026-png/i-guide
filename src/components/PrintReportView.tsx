import React from 'react';
import { SchoolSettings, AttendanceRecord, UserProfile } from '../types';
import { formatTimeFromTimestamp, formatDisplayDate } from '../utils/date';
import { calculateDailyWorkTime } from '../utils/checkoutRules';
import { Printer, X } from 'lucide-react';

interface PrintReportViewProps {
  schoolSettings: SchoolSettings | null;
  selectedDate: string;
  allStaff: UserProfile[];
  attendanceMap: Map<string, AttendanceRecord[]>;
  unavailabilityList?: any[];
  onClose: () => void;
}

export const PrintReportView: React.FC<PrintReportViewProps> = ({
  schoolSettings,
  selectedDate,
  allStaff,
  attendanceMap,
  unavailabilityList = [],
  onClose,
}) => {
  const handlePrint = () => {
    window.print();
  };

  // In Malaysia schools, all staff (Principal / Guru Besar, Guru, AKP) are included in the official daily attendance report
  const sortedStaff = [...allStaff].sort((a, b) => {
    if (a.role === 'PRINCIPAL' && b.role !== 'PRINCIPAL') return -1;
    if (b.role === 'PRINCIPAL' && a.role !== 'PRINCIPAL') return 1;
    if (a.category === 'GURU' && b.category === 'AKP') return -1;
    if (a.category === 'AKP' && b.category === 'GURU') return 1;
    return a.name.localeCompare(b.name, 'zh');
  });

  const totalStaff = sortedStaff.length;
  let presentCount = 0;
  let officialDutyCount = 0;

  const staffAttendanceRows = sortedStaff.map((staff, idx) => {
    const records = attendanceMap.get(staff.uid) || [];
    const slot1 = records.find((r) => r.slot === 1);
    const slot2 = records.find((r) => r.slot === 2);
    const isPresent = !!slot1;
    if (isPresent) presentCount++;

    const workTime = calculateDailyWorkTime(staff.category || 'GURU', slot1, slot2);

    let displayCategory = staff.category as string;
    if (staff.role === 'PRINCIPAL') {
      displayCategory = 'GURU BESAR';
    } else if (staff.category === 'GURU') {
      displayCategory = 'GURU';
    } else if (staff.category === 'AKP') {
      displayCategory = 'AKP';
    }

    // Check staff unavailability from Surat Masuk (KURSUS / URUSAN_RASMI)
    const unavail = unavailabilityList.find((u) => {
      const matchStaff =
        u.teacherId === staff.uid ||
        (staff.email && u.teacherId === staff.email) ||
        (staff.name && u.teacherId === staff.name);
      const matchDate =
        u.startDate &&
        u.endDate &&
        u.startDate <= selectedDate &&
        selectedDate <= u.endDate;
      return matchStaff && matchDate && u.status !== 'CANCELLED';
    });

    const reasons: string[] = [];
    if (unavail) {
      officialDutyCount++;
      reasons.push(
        `[${unavail.reasonCode === 'KURSUS' ? 'KURSUS' : 'URUSAN RASMI'}] ${
          unavail.reasonText || 'Tugasan Luar / Surat Masuk PO'
        }`
      );
    }
    if (slot1?.earlyCheckOutReason) reasons.push(`[S1] ${slot1.earlyCheckOutReason}`);
    if (slot2?.earlyCheckOutReason) reasons.push(`[S2] ${slot2.earlyCheckOutReason}`);
    const reasonText = reasons.join('; ');

    let statusText = 'BELUM HADIR';
    if (isPresent) {
      statusText =
        slot2?.status === 'COMPLETED' || (slot1?.status === 'COMPLETED' && !slot2)
          ? 'HADIR (SELESAI)'
          : 'HADIR (BERTUGAS)';
    } else if (unavail) {
      statusText =
        unavail.reasonCode === 'KURSUS'
          ? 'TIDAK HADIR BERSEBAB (KURSUS)'
          : 'TIDAK HADIR BERSEBAB (URUSAN RASMI)';
    }

    return {
      no: idx + 1,
      name: staff.name,
      email: staff.email,
      category: displayCategory,
      slot1In: slot1 ? formatTimeFromTimestamp(slot1.checkInTime) : '-',
      slot1Out: slot1 ? formatTimeFromTimestamp(slot1.checkOutTime) : '-',
      slot2In: slot2 ? formatTimeFromTimestamp(slot2.checkInTime) : '-',
      slot2Out: slot2 ? formatTimeFromTimestamp(slot2.checkOutTime) : '-',
      duration: isPresent ? workTime.displayText : '-',
      isShortHours: isPresent && workTime.isShortHours,
      reasonText,
      status: statusText,
      isOfficialDuty: !isPresent && !!unavail,
    };
  });

  const attendancePercent = totalStaff > 0 ? ((presentCount / totalStaff) * 100).toFixed(1) : '0';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-start p-4 sm:p-6 overflow-y-auto">
      
      {/* Top Floating Controls (Hidden on Print) */}
      <div className="w-full max-w-4xl flex items-center justify-between bg-slate-900 border border-slate-700 p-3 rounded-2xl shadow-xl mb-4 print:hidden">
        <div className="text-xs text-slate-300">
          <span className="font-semibold text-white">报表打印预览 (Pratonton Cetakan)</span>
          <span className="text-slate-500 ml-2">| 适用标准 A4 纵向/横向打印</span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handlePrint}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 transition shadow"
          >
            <Printer className="w-4 h-4" />
            <span>列印报表 / Cetak</span>
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Official Printable Sheet (A4 White Paper Format) */}
      <div className="w-full max-w-4xl bg-white text-slate-900 rounded-xl p-8 sm:p-12 shadow-2xl print:shadow-none print:p-0 print:m-0 print:max-w-none print:w-full">
        
        {/* School Header */}
        <div className="text-center border-b-2 border-slate-900 pb-4 mb-6">
          <h2 className="text-xl sm:text-2xl font-bold uppercase tracking-wider text-slate-900 font-serif">
            {schoolSettings?.schoolName || 'SISTEM KEHADIRAN SEKOLAH'}
          </h2>
          {schoolSettings?.schoolCode && (
            <p className="text-xs text-slate-600 font-mono mt-0.5">
              KOD SEKOLAH: {schoolSettings.schoolCode}
            </p>
          )}
          <h3 className="text-sm sm:text-base font-semibold mt-2 text-slate-800">
            LAPORAN KEHADIRAN HARIAN GURU & AKP / 教职员出勤日报表
          </h3>
          <p className="text-xs text-slate-600 mt-1">
            TARIKH / 日期: <span className="font-bold text-slate-900">{formatDisplayDate(selectedDate)}</span>
          </p>
        </div>

        {/* Summary Statistics */}
        <div className="grid grid-cols-3 gap-2 border border-slate-300 rounded-md p-3 mb-6 text-xs text-center bg-slate-50">
          <div>
            <span className="text-slate-500 block">全校教职员人数 (Jumlah Staf):</span>
            <span className="font-bold text-sm text-slate-900">{totalStaff} 位</span>
          </div>
          <div>
            <span className="text-slate-500 block">今日到校打卡人数 (Jumlah Hadir):</span>
            <span className="font-bold text-sm text-emerald-700">{presentCount} 位</span>
          </div>
          <div>
            <span className="text-slate-500 block">到校出席率 (Peratus Kehadiran):</span>
            <span className="font-bold text-sm text-blue-700">{attendancePercent}%</span>
          </div>
        </div>

        {/* Detailed Table */}
        <table className="w-full text-left text-[11px] border-collapse border border-slate-400">
          <thead>
            <tr className="bg-slate-200 text-slate-800 uppercase font-semibold border-b border-slate-400">
              <th className="p-2 border border-slate-400 text-center w-8">Bil</th>
              <th className="p-2 border border-slate-400">Nama Guru / Staf</th>
              <th className="p-2 border border-slate-400 text-center w-14">Kategori</th>
              <th className="p-2 border border-slate-400 text-center">Sesi 1 Masuk</th>
              <th className="p-2 border border-slate-400 text-center">Sesi 1 Keluar</th>
              <th className="p-2 border border-slate-400 text-center">Sesi 2 Masuk</th>
              <th className="p-2 border border-slate-400 text-center">Sesi 2 Keluar</th>
              <th className="p-2 border border-slate-400 text-center">Jumlah Masa</th>
              <th className="p-2 border border-slate-400 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-300">
            {staffAttendanceRows.map((row) => (
              <tr key={row.no} className="hover:bg-slate-50">
                <td className="p-2 border border-slate-300 text-center font-mono">{row.no}</td>
                <td className="p-2 border border-slate-300 font-medium">
                  <div>{row.name}</div>
                  {row.reasonText && (
                    <div className="text-[10px] text-amber-700 font-normal mt-0.5">
                      理由: {row.reasonText}
                    </div>
                  )}
                </td>
                <td className="p-2 border border-slate-300 text-center">
                  <span className={`px-1 py-0.5 rounded text-[9px] font-bold ${
                    row.category === 'GURU BESAR'
                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                      : row.category === 'GURU'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {row.category}
                  </span>
                </td>
                <td className="p-2 border border-slate-300 text-center font-mono">{row.slot1In}</td>
                <td className="p-2 border border-slate-300 text-center font-mono">{row.slot1Out}</td>
                <td className="p-2 border border-slate-300 text-center font-mono">{row.slot2In}</td>
                <td className="p-2 border border-slate-300 text-center font-mono">{row.slot2Out}</td>
                <td className="p-2 border border-slate-300 text-center">
                  <span className={row.isShortHours ? 'text-amber-700 font-semibold' : ''}>
                    {row.duration}
                  </span>
                </td>
                <td className="p-2 border border-slate-300 text-center font-semibold text-[10px]">
                  {row.status === 'HADIR (SELESAI)' ? (
                    <span className="text-emerald-700">HADIR (SELESAI)</span>
                  ) : row.status === 'HADIR (BERTUGAS)' ? (
                    <span className="text-blue-700">BERTUGAS</span>
                  ) : row.isOfficialDuty ? (
                    <span className="text-indigo-800 font-bold leading-tight block">
                      {row.status}
                    </span>
                  ) : (
                    <span className="text-rose-600">BELUM HADIR</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Official Signatures Section */}
        <div className="grid grid-cols-2 gap-12 mt-12 pt-6 text-xs text-slate-800">
          <div>
            <p className="font-semibold">Disediakan Oleh (准备人 / 书记):</p>
            <div className="mt-12 border-b border-slate-500 w-48"></div>
            <p className="mt-1 text-[11px] text-slate-600">Nama: _______________________</p>
            <p className="text-[11px] text-slate-600">Tarikh: {selectedDate}</p>
          </div>
          <div>
            <p className="font-semibold">Disahkan Oleh (核准人 / 校长 Guru Besar):</p>
            <div className="mt-12 border-b border-slate-500 w-48"></div>
            <p className="mt-1 text-[11px] text-slate-600">Nama: _______________________</p>
            <p className="text-[11px] text-slate-600">Cop Rasmi Sekolah (校印):</p>
          </div>
        </div>

        {/* Footer Note */}
        <div className="mt-8 text-[10px] text-slate-500 text-center border-t border-slate-200 pt-2 font-mono">
          Rekod dijana secara automatik oleh Sistem Kehadiran Sekolah berasaskan Google Cloud Firestore & GPS.
        </div>

      </div>

    </div>
  );
};
