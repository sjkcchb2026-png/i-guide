/**
 * iSEPADU AI — 1:1 Official Prasekolah Inspirasi Report Card Component
 * Used in:
 * 1. Pentaksiran Prasekolah Inspirasi (Single-student live preview & batch modal)
 * 2. Portal Murid (Preschool student report card view)
 */

import React from 'react';
import SchoolLogo from '../SchoolLogo';
import {
  PrasekolahAssessmentDoc,
  PRASEKOLAH_AKADEMIK_FIELDS,
  PRASEKOLAH_SIKAP_FIELDS,
} from '../../utils/prasekolahAssessmentHelper';

interface PrasekolahSlipCardProps {
  slip: PrasekolahAssessmentDoc;
  schoolName?: string;
  schoolCode?: string;
  schoolLogo?: string;
  className?: string;
}

export const PrasekolahSlipCard: React.FC<PrasekolahSlipCardProps> = ({
  slip,
  schoolName = 'SJK Chung Hua Balingian',
  schoolCode = 'YCC3404',
  schoolLogo,
  className = '',
}) => {
  const kedudukanDisplay =
    slip.kedudukan !== undefined && slip.kedudukan !== null && String(slip.kedudukan).trim() !== ''
      ? String(slip.kedudukan)
      : '___';
  const jumlahDisplay =
    slip.jumlahMurid && Number(slip.jumlahMurid) > 0 ? String(slip.jumlahMurid) : '___';

  return (
    <div
      className={`bg-white text-black border-2 border-slate-900 rounded-2xl p-6 sm:p-8 shadow-xl max-w-[210mm] mx-auto font-serif ${className}`}
    >
      {/* Top Header: School Logo Left + Centered PRASEKOLAH INSPIRASI Titles */}
      <div className="flex flex-col sm:flex-row items-center gap-4 pb-4 border-b-2 border-black">
        <div className="flex flex-col items-center shrink-0 sm:w-32">
          <SchoolLogo
            src={schoolLogo}
            schoolCode={schoolCode}
            className="w-16 h-16 bg-white border-slate-300"
          />
          <span className="text-[10px] font-sans font-bold text-slate-900 text-center mt-1 leading-tight">
            {schoolName || 'SJK Chung Hua Balingian'}
          </span>
        </div>

        <div className="flex-1 text-center sm:pr-12">
          <h2 className="text-xl sm:text-2xl font-sans font-black uppercase tracking-wider text-black">
            PRASEKOLAH INSPIRASI
          </h2>
          <p className="text-sm sm:text-base font-bold text-black mt-1">
            Rekod Pentaksiran dan Perkembangan Murid
          </p>
          <p className="text-xs sm:text-sm font-bold text-slate-800 mt-0.5">
            Tahun {slip.academicYear || '2026'}
            {slip.term ? ` (${slip.term})` : ''}
          </p>
        </div>
      </div>

      {/* Section A. Maklumat Murid */}
      <div className="mt-5 space-y-3">
        <div className="border-2 border-black rounded-xl px-4 py-1.5 bg-slate-50 font-sans font-extrabold text-sm text-black">
          A. Maklumat Murid
        </div>
        <div className="px-3 space-y-2 text-sm text-black">
          <div className="flex items-baseline">
            <span className="w-32 font-bold shrink-0">Nama Murid</span>
            <span className="w-5 font-bold shrink-0">:</span>
            <span className="flex-1 font-extrabold border-b border-dotted border-slate-600 pb-0.5 uppercase">
              {slip.studentName || '-'}
            </span>
          </div>
          <div className="flex items-baseline">
            <span className="w-32 font-bold shrink-0">Umur</span>
            <span className="w-5 font-bold shrink-0">:</span>
            <span className="flex-1 font-extrabold border-b border-dotted border-slate-600 pb-0.5">
              {slip.age || 6} Tahun
            </span>
          </div>
        </div>
      </div>

      {/* Section B. Pencapaian Akademik */}
      <div className="mt-5 space-y-2.5">
        <div className="border-2 border-black rounded-xl px-4 py-1.5 bg-slate-50 font-sans font-extrabold text-sm text-black">
          B. Pencapaian Akademik
        </div>
        <table className="w-full border-collapse border-2 border-black text-sm text-black">
          <thead>
            <tr className="bg-slate-100 font-sans font-extrabold">
              <th className="border border-black py-2 px-4 text-left w-[72%]">Bidang</th>
              <th className="border border-black py-2 px-4 text-center w-[28%]">Gred</th>
            </tr>
          </thead>
          <tbody>
            {PRASEKOLAH_AKADEMIK_FIELDS.map((field) => {
              const g = slip.akademik?.[field.key] || '';
              return (
                <tr key={field.key}>
                  <td className="border border-black py-2 px-4 font-semibold">{field.label}</td>
                  <td className="border border-black py-2 px-4 text-center font-sans font-black text-base">
                    {g || '-'}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-slate-50/80">
              <td colSpan={2} className="border border-black py-2.5 px-4 text-center font-bold">
                Kedudukan Akademik :{' '}
                <span className="inline-block min-w-[36px] border-b-2 border-black font-sans font-black px-2 text-center">
                  {kedudukanDisplay}
                </span>{' '}
                daripada{' '}
                <span className="inline-block min-w-[36px] border-b-2 border-black font-sans font-black px-2 text-center">
                  {jumlahDisplay}
                </span>{' '}
                orang murid
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Section C. Sikap dan Nilai */}
      <div className="mt-5 space-y-2.5">
        <div className="border-2 border-black rounded-xl px-4 py-1.5 bg-slate-50 font-sans font-extrabold text-sm text-black">
          C. Sikap dan Nilai
        </div>
        <table className="w-full border-collapse border-2 border-black text-sm text-black">
          <thead>
            <tr className="bg-slate-100 font-sans font-extrabold">
              <th className="border border-black py-2 px-4 text-left w-[72%]">Aspek</th>
              <th className="border border-black py-2 px-4 text-center w-[28%]">Gred</th>
            </tr>
          </thead>
          <tbody>
            {PRASEKOLAH_SIKAP_FIELDS.map((field) => {
              const g = slip.sikapNilai?.[field.key] || '';
              return (
                <tr key={field.key}>
                  <td className="border border-black py-2 px-4 font-semibold">{field.label}</td>
                  <td className="border border-black py-2 px-4 text-center font-sans font-black text-base">
                    {g || '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bottom 3-Column Signature Block */}
      <div className="mt-12 pt-4 grid grid-cols-3 gap-6 text-center font-sans text-xs font-bold text-black">
        <div>
          <div className="h-12 border-b border-black mb-2" />
          <div>Tandatangan Guru</div>
        </div>
        <div>
          <div className="h-12 border-b border-black mb-2" />
          <div>Tandatangan Ibu Bapa / Penjaga</div>
        </div>
        <div>
          <div className="h-12 border-b border-black mb-2" />
          <div>Tandatangan Guru Besar</div>
        </div>
      </div>
    </div>
  );
};

export default PrasekolahSlipCard;
