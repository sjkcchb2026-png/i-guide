/**
 * iSEPADU AI — Prasekolah Inspirasi Assessment Data Model, Isolation Guard, Ranking & 1:1 A4 Print Helper
 */

export type PrasekolahGrade = 'A' | 'B' | 'C' | 'D' | 'E' | '';
export type PrasekolahTerm = 'Penggal 1' | 'Penggal 2';

export interface PrasekolahAkademikScores {
  bm: PrasekolahGrade; // Bahasa Melayu
  bc: PrasekolahGrade; // Bahasa Cina
  bi: PrasekolahGrade; // Bahasa Inggeris
  mt: PrasekolahGrade; // Matematik
}

export interface PrasekolahSikapScores {
  disiplin: PrasekolahGrade;      // Disiplin dan Peraturan
  sosial: PrasekolahGrade;        // Sosial
  keyakinanDiri: PrasekolahGrade; // Keyakinan Diri
  rajin: PrasekolahGrade;         // Rajin
}

export interface PrasekolahAssessmentDoc {
  id: string;
  schoolCode: string;
  academicYear: string;
  term: PrasekolahTerm;
  studentId: string;
  studentName: string;
  noKp?: string;
  age: 5 | 6;
  akademik: PrasekolahAkademikScores;
  sikapNilai: PrasekolahSikapScores;
  kedudukan: number | string;
  jumlahMurid: number;
  isManualKedudukan?: boolean;
  updatedBy?: string;
  updatedAt?: any;
}

export const PRASEKOLAH_GRADES: Array<'A' | 'B' | 'C' | 'D' | 'E'> = ['A', 'B', 'C', 'D', 'E'];

// Ranking point weight: A=5, B=4, C=3, D=2, E=1
export const PRASEKOLAH_RANK_WEIGHT: Record<'A' | 'B' | 'C' | 'D' | 'E', number> = {
  A: 5,
  B: 4,
  C: 3,
  D: 2,
  E: 1,
};

// GPMP weight (lower = better mastery, consistent with KPM standard): A=1, B=2, C=3, D=4, E=5
export const PRASEKOLAH_GPMP_WEIGHT: Record<'A' | 'B' | 'C' | 'D' | 'E', number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
};

export const PRASEKOLAH_AKADEMIK_FIELDS: Array<{
  key: keyof PrasekolahAkademikScores;
  label: string;
  zhLabel: string;
  shortCode: string;
}> = [
  { key: 'bm', label: 'Bahasa Melayu', zhLabel: '国文', shortCode: 'BM' },
  { key: 'bc', label: 'Bahasa Cina', zhLabel: '华文', shortCode: 'BC' },
  { key: 'bi', label: 'Bahasa Inggeris', zhLabel: '英文', shortCode: 'BI' },
  { key: 'mt', label: 'Matematik', zhLabel: '数学', shortCode: 'MT' },
];

export const PRASEKOLAH_SIKAP_FIELDS: Array<{
  key: keyof PrasekolahSikapScores;
  label: string;
  zhLabel: string;
  shortLabel: string;
}> = [
  { key: 'disiplin', label: 'Disiplin dan Peraturan', zhLabel: '纪律与守则', shortLabel: 'Disiplin' },
  { key: 'sosial', label: 'Sosial', zhLabel: '社交能力', shortLabel: 'Sosial' },
  { key: 'keyakinanDiri', label: 'Keyakinan Diri', zhLabel: '自信心', shortLabel: 'Keyakinan Diri' },
  { key: 'rajin', label: 'Rajin', zhLabel: '勤勉', shortLabel: 'Rajin' },
];

export function normalizePrasekolahGrade(val: unknown): PrasekolahGrade {
  const s = String(val || '').trim().toUpperCase();
  if (s === 'A' || s === 'B' || s === 'C' || s === 'D' || s === 'E') {
    return s;
  }
  return '';
}

export function normalizePrasekolahTerm(val: unknown): PrasekolahTerm {
  const s = String(val || '').trim().toUpperCase();
  if (s === '2' || s === 'PENGGAL 2' || s === 'PENGGAL_2' || s === 'P2') {
    return 'Penggal 2';
  }
  return 'Penggal 1';
}

/**
 * Strict Isolation Guard:
 * Determines whether a student or assessment record belongs to Prasekolah.
 * Used to include students in Prasekolah Inspirasi and STRICTLY EXCLUDE them from Tahun 1-6 PBD/UASA.
 */
export function isPrasekolahStudentRecord(data: any): boolean {
  if (!data) return false;
  if (data.year === 0 || data.currentYear === 0 || data.yearLevel === 0) return true;
  if (String(data.year) === '0' || String(data.currentYear) === '0' || String(data.yearLevel) === '0') {
    return true;
  }
  const classLabels = [
    data.class,
    data.className,
    data.currentClass,
    data.class_id,
    data.rawClassLabel,
    data.levelName,
  ]
    .filter(Boolean)
    .map((v) => String(v).trim().toUpperCase());

  for (const lbl of classLabels) {
    if (lbl.includes('PRA') || lbl === '0' || lbl === '0M' || lbl === 'TAHUN 0') {
      return true;
    }
  }
  return false;
}

/**
 * Resolves student age (5 or 6) for Prasekolah Inspirasi.
 */
export function resolvePrasekolahStudentAge(data: any, academicYear: string = '2026'): 5 | 6 {
  const activeYr = Number(String(academicYear || '2026').slice(0, 4)) || 2026;

  // 1. Explicit age field
  if (data?.age !== undefined && data?.age !== null && Number(data.age) > 0) {
    const numAge = Number(data.age);
    if (numAge <= 5) return 5;
    return 6;
  }

  // 2. Explicit birthYear
  if (data?.birthYear && Number(data.birthYear) > 2000) {
    const computed = activeYr - Number(data.birthYear);
    return computed <= 5 ? 5 : 6;
  }

  // 3. Parse from MyKid / IC first 2 digits (YYMMDD)
  const rawIc = String(data?.noKp || data?.icNumber || data?.ic || data?.mykid || '').replace(/\D/g, '');
  if (rawIc.length >= 6) {
    const yy = Number(rawIc.slice(0, 2));
    if (!isNaN(yy)) {
      const birthYr = yy <= 40 ? 2000 + yy : 1900 + yy;
      const computed = activeYr - birthYr;
      return computed <= 5 ? 5 : 6;
    }
  }

  return 6;
}

export function computeAkademikPoints(akademik: PrasekolahAkademikScores): {
  points: number;
  evaluatedCount: number;
} {
  let points = 0;
  let evaluatedCount = 0;
  (['bm', 'bc', 'bi', 'mt'] as Array<keyof PrasekolahAkademikScores>).forEach((k) => {
    const g = normalizePrasekolahGrade(akademik?.[k]);
    if (g) {
      points += PRASEKOLAH_RANK_WEIGHT[g];
      evaluatedCount++;
    }
  });
  return { points, evaluatedCount };
}

export function computeSikapPoints(sikap: PrasekolahSikapScores): {
  points: number;
  evaluatedCount: number;
} {
  let points = 0;
  let evaluatedCount = 0;
  (['disiplin', 'sosial', 'keyakinanDiri', 'rajin'] as Array<keyof PrasekolahSikapScores>).forEach((k) => {
    const g = normalizePrasekolahGrade(sikap?.[k]);
    if (g) {
      points += PRASEKOLAH_RANK_WEIGHT[g];
      evaluatedCount++;
    }
  });
  return { points, evaluatedCount };
}

/**
 * Automatically calculates Kedudukan Akademik across all Prasekolah students in the session/term.
 * Weighting: A=5, B=4, C=3, D=2, E=1 across the 4 Academic subjects; ties broken by Sikap & Nilai points.
 * Preserves manual teacher override when `isManualKedudukan` is true and `kedudukan` is non-empty.
 */
export function computeAutoKedudukanList(
  records: PrasekolahAssessmentDoc[],
  forceRecalculateAll: boolean = false
): PrasekolahAssessmentDoc[] {
  const totalStudents = records.length;
  if (totalStudents === 0) return [];

  // Score each student
  const scored = records.map((rec) => {
    const ak = computeAkademikPoints(rec.akademik);
    const sk = computeSikapPoints(rec.sikapNilai);
    return {
      rec,
      akPoints: ak.points,
      akCount: ak.evaluatedCount,
      skPoints: sk.points,
    };
  });

  // Sort students who have at least 1 academic grade evaluated
  const evaluatedPool = scored
    .filter((s) => s.akCount > 0)
    .sort((a, b) => {
      if (b.akPoints !== a.akPoints) return b.akPoints - a.akPoints;
      if (b.skPoints !== a.skPoints) return b.skPoints - a.skPoints;
      return a.rec.studentName.localeCompare(b.rec.studentName);
    });

  // Assign standard competition rank (1, 2, 3...)
  const autoRankMap = new Map<string, number>();
  let currentRank = 1;
  evaluatedPool.forEach((item, idx) => {
    if (idx > 0) {
      const prev = evaluatedPool[idx - 1];
      if (item.akPoints < prev.akPoints || item.skPoints < prev.skPoints) {
        currentRank = idx + 1;
      }
    }
    autoRankMap.set(item.rec.studentId, currentRank);
  });

  return records.map((rec) => {
    const autoRank = autoRankMap.get(rec.studentId);
    const keepManual =
      !forceRecalculateAll &&
      rec.isManualKedudukan &&
      rec.kedudukan !== '' &&
      rec.kedudukan !== null &&
      rec.kedudukan !== undefined;

    return {
      ...rec,
      jumlahMurid: rec.jumlahMurid && rec.isManualKedudukan ? rec.jumlahMurid : totalStudents,
      kedudukan: keepManual ? rec.kedudukan : autoRank ?? '',
      isManualKedudukan: keepManual ? true : false,
    };
  });
}

export function getPrasekolahGradeBadgeStyle(grade: PrasekolahGrade): string {
  switch (grade) {
    case 'A':
      return 'bg-emerald-600 text-white border-emerald-500';
    case 'B':
      return 'bg-sky-600 text-white border-sky-500';
    case 'C':
      return 'bg-amber-500 text-slate-950 border-amber-400';
    case 'D':
      return 'bg-orange-600 text-white border-orange-500';
    case 'E':
      return 'bg-rose-600 text-white border-rose-500';
    default:
      return 'bg-slate-800 text-slate-400 border-slate-700';
  }
}

/**
 * 1:1 Official A4 Portrait Slip Printer (Supports Single Student or Full Class Batch Printing)
 */
export function printPrasekolahSlipsA4(
  slips: PrasekolahAssessmentDoc[],
  options: {
    schoolName?: string;
    schoolCode?: string;
    schoolLogo?: string;
    academicYear: string;
    term?: string;
  }
): void {
  if (!slips || slips.length === 0) return;

  const yearLabel = options.academicYear || '2026';
  const defaultLogoSvg = `
    <svg viewBox="0 0 120 120" width="76" height="76" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="60" r="56" fill="#ffffff" stroke="#0f172a" stroke-width="4"/>
      <circle cx="60" cy="60" r="46" fill="none" stroke="#0f172a" stroke-width="1.5"/>
      <path d="M60 22 L88 45 L88 86 L32 86 L32 45 Z" fill="#eff6ff" stroke="#1e3a8a" stroke-width="3"/>
      <text x="60" y="64" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="18" fill="#1e3a8a">CHB</text>
      <text x="60" y="80" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="9" fill="#0f172a">BALINGIAN</text>
    </svg>
  `;

  const logoHtml = options.schoolLogo
    ? `<img src="${options.schoolLogo}" alt="Logo Sekolah" style="width: 78px; height: 78px; object-fit: contain;" />`
    : defaultLogoSvg;

  const pagesHtml = slips
    .map((slip, index) => {
      const isLast = index === slips.length - 1;
      const kedudukanVal =
        slip.kedudukan !== undefined && slip.kedudukan !== null && String(slip.kedudukan).trim() !== ''
          ? String(slip.kedudukan)
          : '___';
      const jumlahVal =
        slip.jumlahMurid && Number(slip.jumlahMurid) > 0 ? String(slip.jumlahMurid) : '___';

      return `
        <div class="slip-page" style="${isLast ? '' : 'page-break-after: always;'}">
          <!-- Top Header -->
          <div class="slip-header">
            <div class="slip-logo">
              ${logoHtml}
              <div class="school-caption">SJK Chung Hua Balingian</div>
            </div>
            <div class="slip-title-area">
              <div class="main-title">PRASEKOLAH INSPIRASI</div>
              <div class="sub-title">Rekod Pentaksiran dan Perkembangan Murid</div>
              <div class="year-title">Tahun ${yearLabel}${slip.term ? ` (${slip.term})` : ''}</div>
            </div>
          </div>

          <hr class="header-divider" />

          <!-- Section A: Maklumat Murid -->
          <div class="section-block">
            <div class="section-pill">A. Maklumat Murid</div>
            <div class="info-rows">
              <div class="info-line">
                <span class="info-label">Nama Murid</span>
                <span class="info-colon">:</span>
                <span class="info-value">${slip.studentName || '-'}</span>
              </div>
              <div class="info-line">
                <span class="info-label">Umur</span>
                <span class="info-colon">:</span>
                <span class="info-value">${slip.age || 6} Tahun</span>
              </div>
            </div>
          </div>

          <!-- Section B: Pencapaian Akademik -->
          <div class="section-block">
            <div class="section-pill">B. Pencapaian Akademik</div>
            <table class="record-table">
              <thead>
                <tr>
                  <th class="col-left">Bidang</th>
                  <th class="col-right">Gred</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="col-left">Bahasa Melayu</td>
                  <td class="col-right">${slip.akademik?.bm || '-'}</td>
                </tr>
                <tr>
                  <td class="col-left">Bahasa Cina</td>
                  <td class="col-right">${slip.akademik?.bc || '-'}</td>
                </tr>
                <tr>
                  <td class="col-left">Bahasa Inggeris</td>
                  <td class="col-right">${slip.akademik?.bi || '-'}</td>
                </tr>
                <tr>
                  <td class="col-left">Matematik</td>
                  <td class="col-right">${slip.akademik?.mt || '-'}</td>
                </tr>
                <tr class="kedudukan-row">
                  <td colspan="2" class="kedudukan-cell">
                    Kedudukan Akademik : <span class="underline-num">${kedudukanVal}</span> daripada <span class="underline-num">${jumlahVal}</span> orang murid
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Section C: Sikap dan Nilai -->
          <div class="section-block">
            <div class="section-pill">C. Sikap dan Nilai</div>
            <table class="record-table">
              <thead>
                <tr>
                  <th class="col-left">Aspek</th>
                  <th class="col-right">Gred</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="col-left">Disiplin dan Peraturan</td>
                  <td class="col-right">${slip.sikapNilai?.disiplin || '-'}</td>
                </tr>
                <tr>
                  <td class="col-left">Sosial</td>
                  <td class="col-right">${slip.sikapNilai?.sosial || '-'}</td>
                </tr>
                <tr>
                  <td class="col-left">Keyakinan Diri</td>
                  <td class="col-right">${slip.sikapNilai?.keyakinanDiri || '-'}</td>
                </tr>
                <tr>
                  <td class="col-left">Rajin</td>
                  <td class="col-right">${slip.sikapNilai?.rajin || '-'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Bottom 3-Column Sign-off Area -->
          <div class="signature-grid">
            <div class="sig-col">
              <div class="sig-line"></div>
              <div class="sig-label">Tandatangan Guru</div>
            </div>
            <div class="sig-col">
              <div class="sig-line"></div>
              <div class="sig-label">Tandatangan Ibu Bapa / Penjaga</div>
            </div>
            <div class="sig-col">
              <div class="sig-line"></div>
              <div class="sig-label">Tandatangan Guru Besar</div>
            </div>
          </div>
        </div>
      `;
    })
    .join('\n');

  const fullHtml = `
    <!DOCTYPE html>
    <html lang="ms">
    <head>
      <meta charset="UTF-8" />
      <title>Rekod Pentaksiran Prasekolah Inspirasi - Tahun ${yearLabel}</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 14mm 16mm;
        }
        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body {
          margin: 0;
          padding: 0;
          font-family: "Times New Roman", Georgia, serif;
          color: #000000;
          background: #ffffff;
        }
        .slip-page {
          width: 100%;
          max-width: 178mm;
          margin: 0 auto;
          padding: 4mm 2mm;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .slip-header {
          display: flex;
          align-items: center;
          gap: 18px;
          padding-bottom: 10px;
        }
        .slip-logo {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 120px;
          flex-shrink: 0;
        }
        .school-caption {
          font-family: Arial, Helvetica, sans-serif;
          font-size: 9px;
          font-weight: 700;
          text-align: center;
          margin-top: 3px;
          color: #111827;
        }
        .slip-title-area {
          flex: 1;
          text-align: center;
          padding-right: 30px;
        }
        .main-title {
          font-family: Arial, Helvetica, sans-serif;
          font-size: 24px;
          font-weight: 900;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: #000000;
        }
        .sub-title {
          font-size: 16px;
          font-weight: 700;
          margin-top: 4px;
          color: #000000;
        }
        .year-title {
          font-size: 15px;
          font-weight: 700;
          margin-top: 3px;
          color: #000000;
        }
        .header-divider {
          border: none;
          border-top: 2.5px solid #000000;
          margin: 4px 0 18px 0;
        }
        .section-block {
          margin-bottom: 20px;
        }
        .section-pill {
          display: block;
          width: 100%;
          border: 2px solid #000000;
          border-radius: 12px;
          padding: 7px 16px;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 14px;
          font-weight: 800;
          background-color: #f8fafc;
          margin-bottom: 12px;
        }
        .info-rows {
          padding: 2px 12px;
        }
        .info-line {
          display: flex;
          align-items: baseline;
          font-size: 15px;
          margin-bottom: 8px;
        }
        .info-label {
          width: 120px;
          font-weight: 700;
        }
        .info-colon {
          width: 20px;
          font-weight: 700;
        }
        .info-value {
          flex: 1;
          font-weight: 800;
          border-bottom: 1px dotted #334155;
          padding-bottom: 2px;
        }
        .record-table {
          width: 100%;
          border-collapse: collapse;
          border: 2px solid #000000;
          font-size: 15px;
        }
        .record-table th,
        .record-table td {
          border: 1.5px solid #000000;
          padding: 9px 16px;
        }
        .record-table thead th {
          background-color: #f1f5f9;
          font-family: Arial, Helvetica, sans-serif;
          font-weight: 800;
          font-size: 14px;
        }
        .col-left {
          width: 72%;
          text-align: left;
          font-weight: 600;
        }
        .col-right {
          width: 28%;
          text-align: center;
          font-family: Arial, Helvetica, sans-serif;
          font-weight: 800;
          font-size: 16px;
        }
        .kedudukan-cell {
          text-align: center;
          font-weight: 700;
          padding: 11px 16px !important;
          background-color: #fafafa;
          font-size: 15px;
        }
        .underline-num {
          display: inline-block;
          min-width: 36px;
          border-bottom: 1.5px solid #000000;
          font-family: Arial, Helvetica, sans-serif;
          font-weight: 900;
          text-align: center;
          padding: 0 6px;
        }
        .signature-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
          margin-top: 56px;
          padding-top: 20px;
        }
        .sig-col {
          text-align: center;
        }
        .sig-line {
          border-bottom: 1.5px solid #000000;
          height: 45px;
          margin-bottom: 8px;
        }
        .sig-label {
          font-family: Arial, Helvetica, sans-serif;
          font-size: 12.5px;
          font-weight: 700;
        }
      </style>
    </head>
    <body>
      ${pagesHtml}
    </body>
    </html>
  `;

  // Render inside hidden print iframe to comply with environment constraints (no window.open needed)
  const existingIframe = document.getElementById('prasekolah-slip-print-iframe');
  if (existingIframe && existingIframe.parentNode) {
    existingIframe.parentNode.removeChild(existingIframe);
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'prasekolah-slip-print-iframe';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(fullHtml);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }, 350);
  }
}
