import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Award,
  Mail,
  ClipboardCheck,
  Calendar,
  Sparkles,
  RefreshCw,
  Printer,
  Download,
  CheckCircle2,
  Plus,
  Trash2,
  Users,
  Send,
  Image as ImageIcon,
  ShieldCheck,
  Archive,
  ClipboardList,
  CheckSquare,
  Square,
  Scissors,
  Layers,
  UserCheck,
} from 'lucide-react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, SchoolSettings, PersonnelProfile } from '../../types';
import { useSchoolTenant } from '../../contexts/SchoolTenantContext';
import { belongsToSchool, scopedDocId } from '../../utils/schoolTenant';
import { deepSanitizeFirestore } from '../../utils/sanitizeFirestore';
import {
  triggerSmartPrint,
  downloadStandalonePrintHtml,
} from '../../utils/oprPrintHelper';
import {
  syncDocumentToSchoolDrive,
  buildFallbackDriveHtml,
} from '../../utils/schoolDriveArchive';
import SchoolLogo from '../SchoolLogo';
import {
  SPPKCompetitionFormsModal,
  SPPKInitialData,
} from '../Kokurikulum/SPPKCompetitionFormsModal';
import { OFFICIAL_TEACHERS } from '../../constants/officialRoster';
import {
  MySGJawatankuasaItem,
  MySGPillar,
  MySGAhliItem,
  mergeMySGCatalogWithSaved,
} from '../../utils/mysgJawatankuasaCatalog';
import {
  AISetiausahaDocument,
  InvitedCommitteeTeacher,
  MinitAttendanceRecord,
  SetiausahaExternalPrefill,
} from './types';

export interface FullMySGPortfolioItem extends MySGJawatankuasaItem {
  legacyCodes?: string[];
  skpmCodeDisplay: string;
  skpmStandardTitle: string;
  skpmAspekTitle: string;
  skpmKualitiStatement: string;
  perincianTugas: string;
  fileRefPrefix: string;
}

// ============================================================================
// 79 OFFICIAL MYSG PORTFOLIOS (22 PENTADBIRAN + 22 KURIKULUM + 19 HEM + 16 KOKO)
// ============================================================================
const OFFICIAL_79_MYSG_PORTFOLIOS: FullMySGPortfolioItem[] = [
  // -------------------- 1. PENTADBIRAN & PENGURUSAN (22) --------------------
  {
    kodMySG: 'JR01 [SU PENGURUSAN]',
    legacyCodes: ['JK01-SU-PENGURUSAN'],
    pillar: 'PENTADBIRAN',
    jawatankuasaInduk: 'JK Pengurusan & Pentadbiran Sekolah',
    jawatanRasmi: 'Setiausaha Pengurusan & Minit Mesyuarat Guru',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 1 & 2',
    skpmStandardRef: 'SKPM Standard 1.1 & 2.1 — Kepimpinan & Pengurusan Organisasi',
    skpmCodeDisplay: 'STANDARD 1.1 • ASPEK 1.1.1',
    skpmStandardTitle: 'STANDARD 1: KEPIMPINAN & HALA TUJU SEKOLAH',
    skpmAspekTitle: 'ASPEK 1.1.1: PGB SEBAGAI PENERAJU PENGURUSAN ORGANISASI',
    skpmKualitiStatement: 'Pengurusan organisasi dan mesyuarat guru dilaksanakan secara sistematik dan terancang.',
    perincianTugas: 'Mengurus panggilan mesyuarat guru, mencatat minit mengikut PKPA Bil. 2/1991 serta menyelaras maklum balas.',
    fileRefPrefix: '100-1/1',
  },
  {
    kodMySG: 'JR02 [PENYELARAS SKPM]',
    legacyCodes: ['JK02-PENYELARAS-SKPM'],
    pillar: 'PENTADBIRAN',
    jawatankuasaInduk: 'JK SKPM Kualiti@Sekolah (SKAS)',
    jawatanRasmi: 'Setiausaha / Penyelaras SKPM Kualiti@Sekolah',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 1 & 2',
    skpmStandardRef: 'SKPM Standard 1.1.2 & 2.1 — Pengurusan Kualiti Sekolah',
    skpmCodeDisplay: 'STANDARD 1.1 • ASPEK 1.1.2',
    skpmStandardTitle: 'STANDARD 1: KEPIMPINAN & PENGURUSAN KUALITI',
    skpmAspekTitle: 'ASPEK 1.1.2: PENETAPAN HALA TUJU & PENILAIAN KENDIRI SKPM',
    skpmKualitiStatement: 'Penilaian kendiri sekolah (SKPM Kualiti@Sekolah) diurus secara menyeluruh, telus dan berterusan.',
    perincianTugas: 'Menyelaras Pasukan Pelaksana Standard (PPS), pengumpulan evidens OPR SKPM dan semakan skor tahunan.',
    fileRefPrefix: '100-2/1',
  },
  {
    kodMySG: 'JR03 [GURU DATA & MAKLUMAT]',
    legacyCodes: ['JK05-PENYELARAS-ICT'],
    pillar: 'PENTADBIRAN',
    jawatankuasaInduk: 'JK Pengurusan Maklumat Sekolah (JPMS / EMIS / idMe)',
    jawatanRasmi: 'Guru Data & Maklumat Sekolah',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 1 & 2',
    skpmStandardRef: 'SKPM Standard 2.1.1 — Pengurusan Sumber Manusia & Data',
    skpmCodeDisplay: 'STANDARD 2.1 • ASPEK 2.1.1',
    skpmStandardTitle: 'STANDARD 2: PENGURUSAN ORGANISASI',
    skpmAspekTitle: 'ASPEK 2.1.1: PENGURUSAN SUMBER MANUSIA & MAKLUMAT',
    skpmKualitiStatement: 'Data dan maklumat sekolah diurus secara tepat, sahih dan kemas kini.',
    perincianTugas: 'Mengemas kini data EMIS, e-Operasi, idMe serta menyediakan laporan statistik rasmi sekolah.',
    fileRefPrefix: '100-3/1',
  },
  {
    kodMySG: 'JR04 [PEGAWAI ASET]',
    legacyCodes: ['JK03-PEGAWAI-ASET'],
    pillar: 'PENTADBIRAN',
    jawatankuasaInduk: 'JK Pengurusan Aset Alih Kerajaan (JKPAK)',
    jawatanRasmi: 'Pegawai Aset Sekolah',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 1 & 2',
    skpmStandardRef: 'SKPM Standard 2.2.1 — Pengurusan Aset Alih & Tak Alih',
    skpmCodeDisplay: 'STANDARD 2.2 • ASPEK 2.2.1',
    skpmStandardTitle: 'STANDARD 2: PENGURUSAN ORGANISASI',
    skpmAspekTitle: 'ASPEK 2.2.1: PENGURUSAN ASET ALIH DAN ASET TAK ALIH',
    skpmKualitiStatement: 'Aset alih dan harta modal kerajaan diurus mengikut tatacara perbendaharaan yang berkuat kuasa.',
    perincianTugas: 'Merekod KEW.PA, menyelaras pemeriksaan tahunan aset dan menyediakan laporan JKPAK.',
    fileRefPrefix: '300-1/1',
  },
  {
    kodMySG: 'JR05 [PENYELARAS LDP / SPLKPM]',
    legacyCodes: ['JK04-PENYELARAS-SPLKPM'],
    pillar: 'PENTADBIRAN',
    jawatankuasaInduk: 'JK Latihan Dalam Perkhidmatan (LDP / SPLKPM)',
    jawatanRasmi: 'Setiausaha LDP & Penyelaras SPLKPM',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 1 & 2',
    skpmStandardRef: 'SKPM Standard 2.1.2 — Pembangunan Sumber Manusia',
    skpmCodeDisplay: 'STANDARD 2.1 • ASPEK 2.1.2',
    skpmStandardTitle: 'STANDARD 2: PENGURUSAN ORGANISASI',
    skpmAspekTitle: 'ASPEK 2.1.2: PEMBANGUNAN SUMBER MANUSIA (SPLKPM)',
    skpmKualitiStatement: 'Pembangunan profesionalisme berterusan (CPD/LDP) guru diurus secara terancang dan berfokus.',
    perincianTugas: 'Merancang kursus dalaman LDP, memantau mata kredit SPLKPM guru dan mendokumentasi OPR latihan.',
    fileRefPrefix: '500-4/1',
  },
  {
    kodMySG: 'JR06 [PENYELARAS ICT & DELIMA]',
    pillar: 'PENTADBIRAN',
    jawatankuasaInduk: 'JK Penyelarasan Bestari, ICT & Pelantar DELIMa KPM',
    jawatanRasmi: 'Penyelaras ICT & Pentadbir DELIMa Sekolah',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 1 & 2',
    skpmStandardRef: 'SKPM Standard 2.4.1 — Pengurusan Sumber Pendidikan & TMK',
    skpmCodeDisplay: 'STANDARD 2.4 • ASPEK 2.4.1',
    skpmStandardTitle: 'STANDARD 2: PENGURUSAN ORGANISASI',
    skpmAspekTitle: 'ASPEK 2.4.1: PENGURUSAN SUMBER PENDIDIKAN DAN TMK',
    skpmKualitiStatement: 'Kemudahan ICT dan pelantar pembelajaran digital DELIMa diurus secara optimum.',
    perincianTugas: 'Mengurus akaun DELIMa guru dan murid, penyelenggaraan peranti ICT dan pembudayaan digital.',
    fileRefPrefix: '100-6/1',
  },
  {
    kodMySG: 'JR07 [SU PIBG & SARANA]',
    legacyCodes: ['JK06-SU-PIBG-SARANA'],
    pillar: 'PENTADBIRAN',
    jawatankuasaInduk: 'JK Permuafakatan Komuniti, PIBG & PIBKS',
    jawatanRasmi: 'Setiausaha PIBG & Penyelaras Sarana Ibu Bapa (2.7.1)',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 1 & 2',
    skpmStandardRef: 'SKPM Standard 2.7.1 — Permuafakatan Strategik',
    skpmCodeDisplay: 'STANDARD 2.7 • ASPEK 2.7.1',
    skpmStandardTitle: 'STANDARD 2: PENGURUSAN ORGANISASI',
    skpmAspekTitle: 'ASPEK 2.7.1: PERMUAFAKATAN STRATEGIK (PIBG / KOMUNITI / LPS)',
    skpmKualitiStatement: 'Permuafakatan strategik bersama ibu bapa, komuniti dan pihak swasta diurus secara aktif.',
    perincianTugas: 'Mengurus mesyuarat AJK PIBG, Mesyuarat Agung Tahunan serta rekod penglibatan PIBKS dan sumbangan komuniti.',
    fileRefPrefix: '100-7/1',
  },
  {
    kodMySG: 'JR08 [SU KEWANGAN & AKAUN]',
    pillar: 'PENTADBIRAN',
    jawatankuasaInduk: 'JK Pengurusan Kewangan & Akaun Sekolah (JPKA)',
    jawatanRasmi: 'Setiausaha JPKA & Penyelaras PCG',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 1 & 2',
    skpmStandardRef: 'SKPM Standard 2.3.1 — Pengurusan Kewangan',
    skpmCodeDisplay: 'STANDARD 2.3 • ASPEK 2.3.1',
    skpmStandardTitle: 'STANDARD 2: PENGURUSAN ORGANISASI',
    skpmAspekTitle: 'ASPEK 2.3.1: PENGURUSAN KEWANGAN SEKOLAH',
    skpmKualitiStatement: 'Kewangan sekolah dan peruntukan PCG diurus secara patuh prosedur dan berintegriti.',
    perincianTugas: 'Menyelaras anggaran belanja mengurus (ABM), kertas kerja perolehan dan mesyuarat JPKA suku tahunan.',
    fileRefPrefix: '400-1/1',
  },
  {
    kodMySG: 'JR09 [PEGAWAI PEMERIKSA ASET]',
    pillar: 'PENTADBIRAN',
    jawatankuasaInduk: 'JK Pemeriksaan & Verifikasi Aset Sekolah',
    jawatanRasmi: 'Pegawai Pemeriksa Harta Modal & Aset Alih',
    tahapBeban: 'RINGAN',
    mataBeban: 1,
    skpmBucket: 'Std 1 & 2',
    skpmStandardRef: 'SKPM Standard 2.2.1 — Pemeriksaan Aset',
    skpmCodeDisplay: 'STANDARD 2.2 • ASPEK 2.2.1',
    skpmStandardTitle: 'STANDARD 2: PENGURUSAN ORGANISASI',
    skpmAspekTitle: 'ASPEK 2.2.1: PEMERIKSAAN HARTA MODAL DAN ASET BERNILAI RENDAH',
    skpmKualitiStatement: 'Pemeriksaan fizikal aset dilaksanakan secara berkala dan direkodkan dengan lengkap.',
    perincianTugas: 'Melaksanakan pemeriksaan fizikal aset sekolah sekurang-kurangnya sekali setahun dan melengkapkan KEW.PA-11.',
    fileRefPrefix: '300-1/2',
  },
  {
    kodMySG: 'JR10 [LEMBAGA PELUPUSAN ASET]',
    pillar: 'PENTADBIRAN',
    jawatankuasaInduk: 'JK Lembaga Pemeriksa Pelupusan Aset (PEP)',
    jawatanRasmi: 'Ahli Lembaga Pemeriksa Pelupusan Aset',
    tahapBeban: 'RINGAN',
    mataBeban: 1,
    skpmBucket: 'Std 1 & 2',
    skpmStandardRef: 'SKPM Standard 2.2.1 — Pelupusan Aset',
    skpmCodeDisplay: 'STANDARD 2.2 • ASPEK 2.2.1',
    skpmStandardTitle: 'STANDARD 2: PENGURUSAN ORGANISASI',
    skpmAspekTitle: 'ASPEK 2.2.1: PENGURUSAN PELUPUSAN ASET ALIH',
    skpmKualitiStatement: 'Proses pelupusan aset usang atau rosak diurus mengikut tatacara perbendaharaan.',
    perincianTugas: 'Memeriksa aset yang dicadangkan untuk pelupusan dan menyediakan laporan syor pelupusan KEW.PA.',
    fileRefPrefix: '300-1/3',
  },
  {
    kodMySG: 'JR11 [PENYELARAS PBPPP & PRESTASI]',
    pillar: 'PENTADBIRAN',
    jawatankuasaInduk: 'JK Penilaian Bersepadu Pegawai Perkhidmatan Pendidikan (PBPPP)',
    jawatanRasmi: 'Setiausaha Jawatankuasa PBPPP Sekolah',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 1 & 2',
    skpmStandardRef: 'SKPM Standard 2.1.1 — Penilaian Prestasi Staf',
    skpmCodeDisplay: 'STANDARD 2.1 • ASPEK 2.1.1',
    skpmStandardTitle: 'STANDARD 2: PENGURUSAN ORGANISASI',
    skpmAspekTitle: 'ASPEK 2.1.1: PENGURUSAN PENILAIAN PRESTASI (PBPPP)',
    skpmKualitiStatement: 'Penilaian prestasi tahunan warga sekolah dilaksanakan secara adil, telus dan profesional.',
    perincianTugas: 'Menyelaras fail pengurusan PBPPP, taklimat keberhasilan dan jadual penilaian pertama serta akhir.',
    fileRefPrefix: '500-2/1',
  },
  {
    kodMySG: 'JKPB01 [SU JADUAL WAKTU & GANTI]',
    pillar: 'PENTADBIRAN',
    jawatankuasaInduk: 'JK Jadual Waktu Induk & Guru Ganti (Relief)',
    jawatanRasmi: 'Setiausaha Jadual Waktu & Penyelaras Guru Ganti',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 1 & 2',
    skpmStandardRef: 'SKPM Standard 1.2.1 & 3.1.1 — Pengurusan Jadual Waktu & MMI',
    skpmCodeDisplay: 'STANDARD 1.2 • ASPEK 1.2.1',
    skpmStandardTitle: 'STANDARD 1: KEPIMPINAN & MELINDUNGI MASA INSTRUKSIONAL (MMI)',
    skpmAspekTitle: 'ASPEK 1.2.1: PENGURUSAN JADUAL WAKTU DAN JADUAL GURU GANTI',
    skpmKualitiStatement: 'Jadual waktu dan jadual guru ganti diurus secara cekap bagi melindungi masa instruksional (MMI).',
    perincianTugas: 'Menyusun jadual waktu induk/kelas/persendirian dan mengurus agihan guru ganti harian.',
    fileRefPrefix: '600-2/1',
  },
  {
    kodMySG: 'JKPB02 [SU TAKWIM & BUKU PENGURUSAN]',
    pillar: 'PENTADBIRAN',
    jawatankuasaInduk: 'JK Buku Pengurusan & Takwim Tahunan Sekolah',
    jawatanRasmi: 'Penyelaras Buku Pengurusan & Takwim Sekolah',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 1 & 2',
    skpmStandardRef: 'SKPM Standard 1.1.1 — Perancangan Tahunan Sekolah',
    skpmCodeDisplay: 'STANDARD 1.1 • ASPEK 1.1.1',
    skpmStandardTitle: 'STANDARD 1: KEPIMPINAN & PERANCANGAN STRATEGIK',
    skpmAspekTitle: 'ASPEK 1.1.1: BUKU PENGURUSAN DAN TAKWIM TAHUNAN SEKOLAH',
    skpmKualitiStatement: 'Takwim dan buku panduan pengurusan tahunan sekolah disediakan secara komprehensif.',
    perincianTugas: 'Mengumpul takwim semua unit (Pentadbiran, Kurikulum, HEM, Kokurikulum) dan menerbitkan Buku Pengurusan.',
    fileRefPrefix: '100-1/2',
  },
  {
    kodMySG: 'JKPB03 [PENYELARAS PSO / PERANCANGAN STRATEGIK]',
    pillar: 'PENTADBIRAN',
    jawatankuasaInduk: 'JK Perancangan Strategik Organisasi (PSO)',
    jawatanRasmi: 'Setiausaha Perancangan Strategik Organisasi (PSO)',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 1 & 2',
    skpmStandardRef: 'SKPM Standard 1.1.1 — Perancangan Strategik Sekolah',
    skpmCodeDisplay: 'STANDARD 1.1 • ASPEK 1.1.1',
    skpmStandardTitle: 'STANDARD 1: KEPIMPINAN & HALA TUJU',
    skpmAspekTitle: 'ASPEK 1.1.1: PELAN STRATEGIK, TAKTIKAL DAN OPERASI (PSO)',
    skpmKualitiStatement: 'Pelan Strategik Organisasi (PSO) dirangka, dipantau dan dinilai secara berfokus.',
    perincianTugas: 'Menyelaras penyediaan Pelan Strategik, Pelan Taktikal dan Pelan Operasi (OPPM) bagi semua bidang.',
    fileRefPrefix: '100-1/3',
  },
  {
    kodMySG: 'JKPB04 [PENYELARAS INFRASTRUKTUR & FIZIKAL]',
    pillar: 'PENTADBIRAN',
    jawatankuasaInduk: 'JK Penyelenggaraan Prasarana & Persekitaran Fizikal',
    jawatanRasmi: 'Penyelaras Prasarana & Fizikal Sekolah',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 1 & 2',
    skpmStandardRef: 'SKPM Standard 2.5.1 — Penyelenggaraan Persekitaran Fizikal',
    skpmCodeDisplay: 'STANDARD 2.5 • ASPEK 2.5.1',
    skpmStandardTitle: 'STANDARD 2: PENGURUSAN ORGANISASI',
    skpmAspekTitle: 'ASPEK 2.5.1: PERSEKITARAN FIZIKAL DISELENGGARA SECARA SISTEMATIK',
    skpmKualitiStatement: 'Bangunan, kemudahan asas dan persekitaran fizikal sekolah berada dalam keadaan selamat dan kondusif.',
    perincianTugas: 'Memantau keselamatan bangunan, perabot bilik darjah serta melaporkan keperluan penyelenggaraan.',
    fileRefPrefix: '200-1/1',
  },
  {
    kodMySG: 'JKPB05 [PENYELARAS BILIK KHAS]',
    pillar: 'PENTADBIRAN',
    jawatankuasaInduk: 'JK Pengurusan Bilik-Bilik Khas Sekolah',
    jawatanRasmi: 'Penyelaras Bilik Khas (Makmal Sains, Bengkel RBT, Bilik Muzik & Bilik Guru)',
    tahapBeban: 'RINGAN',
    mataBeban: 1,
    skpmBucket: 'Std 1 & 2',
    skpmStandardRef: 'SKPM Standard 2.5.1 — Pengurusan Bilik Khas',
    skpmCodeDisplay: 'STANDARD 2.5 • ASPEK 2.5.1',
    skpmStandardTitle: 'STANDARD 2: PENGURUSAN ORGANISASI',
    skpmAspekTitle: 'ASPEK 2.5.1: PENGURUSAN DAN KECERIAAN BILIK-BILIK KHAS',
    skpmKualitiStatement: 'Bilik-bilik khas diurus secara kemas, selamat dan berfungsi menyokong PdP.',
    perincianTugas: 'Menyelaras peraturan penggunaan, rekod log masuk dan keceriaan semua bilik khas sekolah.',
    fileRefPrefix: '200-2/1',
  },
  {
    kodMySG: 'JKPB06 [PENYELARAS IKLIM & KECERIAAN]',
    pillar: 'PENTADBIRAN',
    jawatankuasaInduk: 'JK Iklim Sekolah, Keceriaan & Perpaduan (RIMUP)',
    jawatanRasmi: 'Penyelaras Iklim Sekolah & Program Perpaduan',
    tahapBeban: 'RINGAN',
    mataBeban: 1,
    skpmBucket: 'Std 1 & 2',
    skpmStandardRef: 'SKPM Standard 2.5.2 & 2.6.1 — Iklim Kondusif & Perpaduan',
    skpmCodeDisplay: 'STANDARD 2.6 • ASPEK 2.6.1',
    skpmStandardTitle: 'STANDARD 2: PENGURUSAN ORGANISASI',
    skpmAspekTitle: 'ASPEK 2.6.1: PEMUPUKAN PERPADUAN DAN IKLIM SEKOLAH HARMONI',
    skpmKualitiStatement: 'Suasana sekolah yang harmoni, ceria dan menghormati kepelbagaian budaya dipupuk secara berterusan.',
    perincianTugas: 'Menyelaras papan kenyataan utama, mural pendidikan dan sambutan perayaan silang budaya warga sekolah.',
    fileRefPrefix: '100-8/1',
  },
  {
    kodMySG: 'JKPB07 [PENYELARAS BENCANA & KECEMASAN]',
    pillar: 'PENTADBIRAN',
    jawatankuasaInduk: 'JK Pengurusan Bencana & Keselamatan Kecemasan Sekolah',
    jawatanRasmi: 'Penyelaras Pengurusan Bencana & Banjir Sekolah',
    tahapBeban: 'RINGAN',
    mataBeban: 1,
    skpmBucket: 'Std 1 & 2',
    skpmStandardRef: 'SKPM Standard 2.5.1 — Kesiapsiagaan Bencana',
    skpmCodeDisplay: 'STANDARD 2.5 • ASPEK 2.5.1',
    skpmStandardTitle: 'STANDARD 2: PENGURUSAN ORGANISASI',
    skpmAspekTitle: 'ASPEK 2.5.1: PENGURUSAN KESELAMATAN DAN BENCANA ALAM',
    skpmKualitiStatement: 'Prosedur operasi standard (SOP) menghadapi bencana dan kecemasan diurus dengan rapi.',
    perincianTugas: 'Menyediakan pelan tindakan kecemasan/banjir dan menyelaras komunikasi pantas bersama agensi keselamatan.',
    fileRefPrefix: '200-3/1',
  },
  {
    kodMySG: 'JKPB08 [PENYELARAS ADUAN & INTEGRITI]',
    pillar: 'PENTADBIRAN',
    jawatankuasaInduk: 'JK Pengurusan Aduan Awam, Integriti & Tatatertib',
    jawatanRasmi: 'Penyelaras Aduan Pelanggan & Integriti',
    tahapBeban: 'RINGAN',
    mataBeban: 1,
    skpmBucket: 'Std 1 & 2',
    skpmStandardRef: 'SKPM Standard 2.1.1 — Tadbir Urus Berintegriti',
    skpmCodeDisplay: 'STANDARD 2.1 • ASPEK 2.1.1',
    skpmStandardTitle: 'STANDARD 2: PENGURUSAN ORGANISASI',
    skpmAspekTitle: 'ASPEK 2.1.1: TADBIR URUS INTEGRITI DAN MAKLUM BALAS PELANGGAN',
    skpmKualitiStatement: 'Maklum balas pelanggan dan budaya kerja berintegriti diurus mengikut garis panduan KPM.',
    perincianTugas: 'Merekod maklum balas/aduan ibu bapa secara profesional dan menyelaras pembudayaan integriti.',
    fileRefPrefix: '100-9/1',
  },
  {
    kodMySG: 'JKPB09 [PENYELARAS DOKUMENTASI & MAJALAH]',
    pillar: 'PENTADBIRAN',
    jawatankuasaInduk: 'JK Dokumentasi, Fotografi & Penerbitan Sekolah',
    jawatanRasmi: 'Penyelaras Dokumentasi & Arkib Digital Sekolah',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 1 & 2',
    skpmStandardRef: 'SKPM Standard 2.4.1 — Pengurusan Sumber & Dokumentasi',
    skpmCodeDisplay: 'STANDARD 2.4 • ASPEK 2.4.1',
    skpmStandardTitle: 'STANDARD 2: PENGURUSAN ORGANISASI',
    skpmAspekTitle: 'ASPEK 2.4.1: PENGURUSAN REKOD DAN DOKUMENTASI SEKOLAH',
    skpmKualitiStatement: 'Setiap program utama sekolah didokumentasikan secara lengkap melalui pelaporan OPR dan arkib foto.',
    perincianTugas: 'Menyelaras rakaman foto rasmi, arkib buletin sekolah dan penyimpanan evidens digital.',
    fileRefPrefix: '100-10/1',
  },
  {
    kodMySG: 'JKPB10 [PENYELARAS KEBIRUS / KEBAJIKAN STAF]',
    pillar: 'PENTADBIRAN',
    jawatankuasaInduk: 'Kelab Bilik Guru & Kebajikan Staf (KEBIRUS)',
    jawatanRasmi: 'Pengerusi / Setiausaha Kelab Kebajikan Guru & Staf',
    tahapBeban: 'RINGAN',
    mataBeban: 1,
    skpmBucket: 'Std 1 & 2',
    skpmStandardRef: 'SKPM Standard 2.6.1 — Hubungan Harmoni Warga Sekolah',
    skpmCodeDisplay: 'STANDARD 2.6 • ASPEK 2.6.1',
    skpmStandardTitle: 'STANDARD 2: PENGURUSAN ORGANISASI',
    skpmAspekTitle: 'ASPEK 2.6.1: KEBAJIKAN DAN SEMANGAT KEKITAAN WARGA SEKOLAH',
    skpmKualitiStatement: 'Kebajikan dan kesejahteraan emosi guru serta AKP sentiasa dipelihara.',
    perincianTugas: 'Mengurus aktiviti kebajikan staf, sambutan Hari Guru dan keceriaan ruang kerja bilik guru.',
    fileRefPrefix: '100-11/1',
  },
  {
    kodMySG: 'JKPB11 [PENYELARAS KAJIAN TINDAKAN & INOVASI]',
    pillar: 'PENTADBIRAN',
    jawatankuasaInduk: 'JK Kajian Tindakan, Inovasi & Amalan Terbaik',
    jawatanRasmi: 'Penyelaras Kajian Tindakan & Inovasi Sekolah',
    tahapBeban: 'RINGAN',
    mataBeban: 1,
    skpmBucket: 'Std 1 & 2',
    skpmStandardRef: 'SKPM Standard 2.1.2 — Pembudayaan Inovasi & Kajian Tindakan',
    skpmCodeDisplay: 'STANDARD 2.1 • ASPEK 2.1.2',
    skpmStandardTitle: 'STANDARD 2: PENGURUSAN ORGANISASI',
    skpmAspekTitle: 'ASPEK 2.1.2: PEMBUDAYAAN KAJIAN TINDAKAN DAN INOVASI',
    skpmKualitiStatement: 'Amalan kajian tindakan dan inovasi pendidikan digalakkan bagi meningkatkan kualiti sekolah.',
    perincianTugas: 'Membimbing penghasilan sekurang-kurangnya satu kajian tindakan/inovasi panitia setiap tahun.',
    fileRefPrefix: '100-12/1',
  },
];

// -------------------- 2. KURIKULUM & AKADEMIK (22) --------------------
const KURIKULUM_22_PORTFOLIOS: FullMySGPortfolioItem[] = [
  {
    kodMySG: 'JR12 [SU KURIKULUM]',
    legacyCodes: ['JK07-SU-KURIKULUM'],
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'Jawatankuasa Kurikulum Sekolah (JKS)',
    jawatanRasmi: 'Setiausaha Kurikulum Sekolah',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.1.1 — Ketetapan Pelaksanaan Kurikulum',
    skpmCodeDisplay: 'STANDARD 3.1 • ASPEK 3.1.1',
    skpmStandardTitle: 'STANDARD 3.1: PENGURUSAN KURIKULUM',
    skpmAspekTitle: 'ASPEK 3.1.1: KETETAPAN PELAKSANAAN KURIKULUM',
    skpmKualitiStatement: 'Pelaksanaan kurikulum diurus secara sistematik dan terancang mengikut dasar KPM.',
    perincianTugas: 'Mengurus Mesyuarat Jawatankuasa Kurikulum Sekolah (JKS) 4 kali setahun, memantau fail induk panitia dan penyelarasan DSKP.',
    fileRefPrefix: '600-1/1',
  },
  {
    kodMySG: 'JR13 [SU PEPERIKSAAN & UASA]',
    legacyCodes: ['JK08-SU-PBD-UASA'],
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'JK Pentaksiran & Ujian Akhir Sesi Akademik (UASA)',
    jawatanRasmi: 'Setiausaha Peperiksaan Dalaman & UASA',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.4.1 — Pengurusan Penilaian Murid',
    skpmCodeDisplay: 'STANDARD 3.1 • ASPEK 3.1.4',
    skpmStandardTitle: 'STANDARD 3.1: PENGURUSAN KURIKULUM',
    skpmAspekTitle: 'ASPEK 3.1.4: PENGURUSAN PENILAIAN MURID (UASA & PENTAKSIRAN)',
    skpmKualitiStatement: 'Peperiksaan dan pentaksiran sumatif (UASA) diurus secara sistematik, telus dan berintegriti.',
    perincianTugas: 'Menyelaras jadual UASA, moderasi kertas soalan, kemasukan markah idMe serta analisis prestasi akademik.',
    fileRefPrefix: '600-4/1',
  },
  {
    kodMySG: 'JR14 [PENYELARAS PBD & PBS]',
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'JK Pentaksiran Bilik Darjah (PBD) & Penjaminan Kualiti 4P',
    jawatanRasmi: 'Penyelaras Pentaksiran Bilik Darjah (PBD)',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.4.1 — Pentaksiran Bilik Darjah (PBD)',
    skpmCodeDisplay: 'STANDARD 3.1 • ASPEK 3.1.4',
    skpmStandardTitle: 'STANDARD 3.1: PENGURUSAN KURIKULUM',
    skpmAspekTitle: 'ASPEK 3.1.4: PENGURUSAN PENTAKSIRAN BILIK DARJAH (PBD & 4P)',
    skpmKualitiStatement: 'Pentaksiran Bilik Darjah (PBD) dilaksanakan secara berterusan dengan penjaminan kualiti 4P.',
    perincianTugas: 'Menyelaras pengumpulan Tahap Penguasaan (TP1–TP6), pementoran, penyelarasan dan pengesanan PBD.',
    fileRefPrefix: '600-4/2',
  },
  {
    kodMySG: 'JR15 [GURU PERPUSTAKAAN & MEDIA]',
    legacyCodes: ['JK09-GURU-PSS'],
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'JK Pusat Sumber Sekolah (PSS) & Program NILAM',
    jawatanRasmi: 'Guru Perpustakaan dan Media (GPM / NILAM)',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 2.4.1 & 3.1.2 — Pengurusan Pusat Sumber & NILAM',
    skpmCodeDisplay: 'STANDARD 2.4 • ASPEK 2.4.1',
    skpmStandardTitle: 'STANDARD 2.4 & 3.1: PENGURUSAN PUSAT SUMBER SEKOLAH',
    skpmAspekTitle: 'ASPEK 2.4.1: PENGURUSAN PUSAT SUMBER DAN PEMBUDAYAAN NILAM',
    skpmKualitiStatement: 'Pusat Sumber Sekolah dan program bacaan NILAM diurus secara kondusif dan berimpak tinggi.',
    perincianTugas: 'Mengurus automasi buku PSS, pengawas pusat sumber serta perekodan bacaan NILAM murid.',
    fileRefPrefix: '600-5/1',
  },
  {
    kodMySG: 'JR16 [PENYELARAS PLC & PAK21]',
    legacyCodes: ['JK10-PENYELARAS-PLC'],
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'JK Komuniti Pembelajaran Profesional (PLC), PAK21 & KBAT',
    jawatanRasmi: 'Penyelaras PLC, PAK21 & KBAT Sekolah',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.2.2 & Standard 4 — Peningkatan Kualiti Guru & PdPc',
    skpmCodeDisplay: 'STANDARD 3.1 • ASPEK 3.1.2',
    skpmStandardTitle: 'STANDARD 3.1 & STANDARD 4: PENGURUSAN PANITIA & PDPC',
    skpmAspekTitle: 'ASPEK 3.1.2.2: PROGRAM PENINGKATAN KUALITI PENGAJARAN GURU (PLC)',
    skpmKualitiStatement: 'Kualiti pengajaran guru dipertingkatkan melalui kitaran PLC, Lesson Study dan Learning Walks.',
    perincianTugas: 'Menyelaras pelaksanaan PLC panitia, perkongsian amalan terbaik PAK21 dan pembudayaan KBAT.',
    fileRefPrefix: '600-3/1',
  },
  {
    kodMySG: 'JR17 [GURU PEMULIHAN & INTERVENSI]',
    legacyCodes: ['PM16-GURU-PEMULIHAN'],
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'JK Pemulihan Khas, Literasi & Numerasi (PLA / LINUS)',
    jawatanRasmi: 'Guru Pemulihan Khas & Penyelaras Intervensi 3M',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.2.3 — Program Peningkatan Pencapaian Murid',
    skpmCodeDisplay: 'STANDARD 3.1 • ASPEK 3.1.2',
    skpmStandardTitle: 'STANDARD 3.1: PENGURUSAN KURIKULUM',
    skpmAspekTitle: 'ASPEK 3.1.2.3: PROGRAM PENINGKATAN PENCAPAIAN & INTERVENSI MURID',
    skpmKualitiStatement: 'Program intervensi pemulihan 3M (Membaca, Menulis, Mengira) dilaksanakan secara berfokus.',
    perincianTugas: 'Mengenal pasti murid TP1–TP2, melaksanakan ujian diagnostik dan kelas intervensi berfokus.',
    fileRefPrefix: '600-6/1',
  },
  {
    kodMySG: 'JKPB05-BM [KP BAHASA MELAYU]',
    legacyCodes: ['PM11-KP-BM'],
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'Panitia Bahasa Melayu',
    jawatanRasmi: 'Ketua Panitia Bahasa Melayu',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.2.1 — Pengurusan Mata Pelajaran Bahasa Melayu',
    skpmCodeDisplay: 'STANDARD 3.1 • ASPEK 3.1.2',
    skpmStandardTitle: 'STANDARD 3.1: PENGURUSAN KURIKULUM',
    skpmAspekTitle: 'ASPEK 3.1.2: PENGURUSAN MATA PELAJARAN (PANITIA BAHASA MELAYU)',
    skpmKualitiStatement: 'Panitia Bahasa Melayu diurus secara profesional bagi melonjakkan penguasaan dwibahasa murid.',
    perincianTugas: 'Mempengerusikan mesyuarat panitia BM, menyemak RPT/DSKP, mengurus PCG BM dan program MBMMBI.',
    fileRefPrefix: '600-3/BM',
  },
  {
    kodMySG: 'JKPB05-BC [KP BAHASA CINA]',
    legacyCodes: ['PM12-KP-BC'],
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'Panitia Bahasa Cina',
    jawatanRasmi: 'Ketua Panitia Bahasa Cina',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.2.1 — Pengurusan Mata Pelajaran Bahasa Cina',
    skpmCodeDisplay: 'STANDARD 3.1 • ASPEK 3.1.2',
    skpmStandardTitle: 'STANDARD 3.1: PENGURUSAN KURIKULUM',
    skpmAspekTitle: 'ASPEK 3.1.2: PENGURUSAN MATA PELAJARAN (PANITIA BAHASA CINA)',
    skpmKualitiStatement: 'Panitia Bahasa Cina diurus secara sistematik dan terancang.',
    perincianTugas: 'Mempengerusikan mesyuarat panitia BC, menyelaras RPT/RPH, program literasi BC dan peruntukan PCG.',
    fileRefPrefix: '600-3/BC',
  },
  {
    kodMySG: 'JKPB05-BI [KP BAHASA INGGERIS & HIP]',
    legacyCodes: ['PM13-KP-BI'],
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'Panitia Bahasa Inggeris & Highly Immersive Programme (HIP)',
    jawatanRasmi: 'Ketua Panitia Bahasa Inggeris & Penyelaras HIP',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.2.1 — Pengurusan Mata Pelajaran Bahasa Inggeris',
    skpmCodeDisplay: 'STANDARD 3.1 • ASPEK 3.1.2',
    skpmStandardTitle: 'STANDARD 3.1: PENGURUSAN KURIKULUM',
    skpmAspekTitle: 'ASPEK 3.1.2: PENGURUSAN MATA PELAJARAN (PANITIA BAHASA INGGERIS)',
    skpmKualitiStatement: 'Panitia Bahasa Inggeris dan program imersif HIP dilaksanakan secara menyeluruh.',
    perincianTugas: 'Menyelaras pengurusan Panitia BI, penjajaran CEFR serta aktiviti Highly Immersive Programme (HIP).',
    fileRefPrefix: '600-3/BI',
  },
  {
    kodMySG: 'JKPB05-MT [KP MATEMATIK]',
    legacyCodes: ['PM14-KP-MT'],
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'Panitia Matematik',
    jawatanRasmi: 'Ketua Panitia Matematik',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.2.1 — Pengurusan Mata Pelajaran Matematik',
    skpmCodeDisplay: 'STANDARD 3.1 • ASPEK 3.1.2',
    skpmStandardTitle: 'STANDARD 3.1: PENGURUSAN KURIKULUM',
    skpmAspekTitle: 'ASPEK 3.1.2: PENGURUSAN MATA PELAJARAN (PANITIA MATEMATIK)',
    skpmKualitiStatement: 'Panitia Matematik diurus secara berfokus bagi meningkatkan kemahiran numerasi dan KBAT murid.',
    perincianTugas: 'Menyelaras Panitia Matematik, klinik sifir/numerasi, penggunaan ABM dan analisis PBD/UASA Matematik.',
    fileRefPrefix: '600-3/MT',
  },
  {
    kodMySG: 'JKPB05-SN [KP SAINS]',
    legacyCodes: ['PM15-KP-SN'],
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'Panitia Sains & STEM',
    jawatanRasmi: 'Ketua Panitia Sains',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.2.1 — Pengurusan Mata Pelajaran Sains',
    skpmCodeDisplay: 'STANDARD 3.1 • ASPEK 3.1.2',
    skpmStandardTitle: 'STANDARD 3.1: PENGURUSAN KURIKULUM',
    skpmAspekTitle: 'ASPEK 3.1.2: PENGURUSAN MATA PELAJARAN (PANITIA SAINS)',
    skpmKualitiStatement: 'Panitia Sains dan amali makmal diurus secara inkuiri dan terancang.',
    perincianTugas: 'Menyelaras Panitia Sains, pelaksanaan KPS/KMS di makmal sains serta pengurusan radas PCG Sains.',
    fileRefPrefix: '600-3/SN',
  },
  {
    kodMySG: 'JKPB05-SEJ [KP SEJARAH]',
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'Panitia Sejarah',
    jawatanRasmi: 'Ketua Panitia Sejarah',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.2.1 — Pengurusan Mata Pelajaran Sejarah',
    skpmCodeDisplay: 'STANDARD 3.1 • ASPEK 3.1.2',
    skpmStandardTitle: 'STANDARD 3.1: PENGURUSAN KURIKULUM',
    skpmAspekTitle: 'ASPEK 3.1.2: PENGURUSAN MATA PELAJARAN (PANITIA SEJARAH)',
    skpmKualitiStatement: 'Panitia Sejarah dan kajian kes Tahap 2 diurus secara patriotik dan sistematik.',
    perincianTugas: 'Menyelaras Panitia Sejarah Tahun 4–6, pelaksanaan Kajian Kes Sejarah dan sambutan Bulan Kebangsaan.',
    fileRefPrefix: '600-3/SEJ',
  },
  {
    kodMySG: 'JKPB05-RBT [KP RBT]',
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'Panitia Reka Bentuk dan Teknologi (RBT)',
    jawatanRasmi: 'Ketua Panitia Reka Bentuk & Teknologi (RBT)',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.2.1 — Pengurusan Mata Pelajaran RBT',
    skpmCodeDisplay: 'STANDARD 3.1 • ASPEK 3.1.2',
    skpmStandardTitle: 'STANDARD 3.1: PENGURUSAN KURIKULUM',
    skpmAspekTitle: 'ASPEK 3.1.2: PENGURUSAN MATA PELAJARAN (PANITIA RBT)',
    skpmKualitiStatement: 'Panitia RBT dan aktiviti berasaskan projek inovasi murid diurus dengan berkesan.',
    perincianTugas: 'Menyelaras Panitia RBT Tahap 2, projek reka bentuk dan keselamatan peralatan bengkel RBT.',
    fileRefPrefix: '600-3/RBT',
  },
  {
    kodMySG: 'JKPB05-PJPK [KP PJPK & SEGAK]',
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'Panitia Pendidikan Jasmani & Pendidikan Kesihatan (PJPK)',
    jawatanRasmi: 'Ketua Panitia PJPK & Penyelaras SEGAK',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.2.1 — Pengurusan Mata Pelajaran PJPK & SEGAK',
    skpmCodeDisplay: 'STANDARD 3.1 • ASPEK 3.1.2',
    skpmStandardTitle: 'STANDARD 3.1: PENGURUSAN KURIKULUM',
    skpmAspekTitle: 'ASPEK 3.1.2: PENGURUSAN MATA PELAJARAN (PANITIA PJPK)',
    skpmKualitiStatement: 'Panitia PJPK, stor sukan dan ujian kecergasan SEGAK dilaksanakan mengikut takwim KPM.',
    perincianTugas: 'Menyelaras Panitia PJPK, ujian SEGAK Penggal 1 & 2 serta penyelenggaraan alatan stor PJ.',
    fileRefPrefix: '600-3/PJPK',
  },
  {
    kodMySG: 'JKPB05-PSV [KP PENDIDIKAN SENI VISUAL]',
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'Panitia Pendidikan Seni Visual (PSV)',
    jawatanRasmi: 'Ketua Panitia Pendidikan Seni Visual',
    tahapBeban: 'RINGAN',
    mataBeban: 1,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.2.1 — Pengurusan Mata Pelajaran PSV',
    skpmCodeDisplay: 'STANDARD 3.1 • ASPEK 3.1.2',
    skpmStandardTitle: 'STANDARD 3.1: PENGURUSAN KURIKULUM',
    skpmAspekTitle: 'ASPEK 3.1.2: PENGURUSAN MATA PELAJARAN (PANITIA PSV)',
    skpmKualitiStatement: 'Panitia PSV memupuk daya kreativiti dan estetika murid secara terancang.',
    perincianTugas: 'Menyelaras Panitia PSV, pameran karya seni murid dan perolehan bahan seni PCG.',
    fileRefPrefix: '600-3/PSV',
  },
  {
    kodMySG: 'JKPB05-MZ [KP PENDIDIKAN MUZIK]',
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'Panitia Pendidikan Muzik',
    jawatanRasmi: 'Ketua Panitia Pendidikan Muzik',
    tahapBeban: 'RINGAN',
    mataBeban: 1,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.2.1 — Pengurusan Mata Pelajaran Muzik',
    skpmCodeDisplay: 'STANDARD 3.1 • ASPEK 3.1.2',
    skpmStandardTitle: 'STANDARD 3.1: PENGURUSAN KURIKULUM',
    skpmAspekTitle: 'ASPEK 3.1.2: PENGURUSAN MATA PELAJARAN (PANITIA MUZIK)',
    skpmKualitiStatement: 'Panitia Pendidikan Muzik dan alatan muzik sekolah diurus secara aktif.',
    perincianTugas: 'Menyelaras Panitia Muzik, latihan nyanyian lagu rasmi dan persembahan kesenian murid.',
    fileRefPrefix: '600-3/MZ',
  },
  {
    kodMySG: 'JKPB05-PM [KP PENDIDIKAN MORAL]',
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'Panitia Pendidikan Moral',
    jawatanRasmi: 'Ketua Panitia Pendidikan Moral',
    tahapBeban: 'RINGAN',
    mataBeban: 1,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.2.1 — Pengurusan Mata Pelajaran Pendidikan Moral',
    skpmCodeDisplay: 'STANDARD 3.1 • ASPEK 3.1.2',
    skpmStandardTitle: 'STANDARD 3.1: PENGURUSAN KURIKULUM',
    skpmAspekTitle: 'ASPEK 3.1.2: PENGURUSAN MATA PELAJARAN (PANITIA PENDIDIKAN MORAL)',
    skpmKualitiStatement: 'Panitia Pendidikan Moral menghayati nilai murni dan pembentukan sahsiah murid.',
    perincianTugas: 'Menyelaras Panitia Pendidikan Moral dan aktiviti amali nilai murni / khidmat masyarakat.',
    fileRefPrefix: '600-3/PM',
  },
  {
    kodMySG: 'JKPB05-PAI [KP PENDIDIKAN ISLAM & TASMIK]',
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'Panitia Pendidikan Islam & Program j-QAF / Tasmik',
    jawatanRasmi: 'Ketua Panitia Pendidikan Islam & Penyelaras Tasmik',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.2.1 — Pengurusan Panitia PAI & j-QAF',
    skpmCodeDisplay: 'STANDARD 3.1 • ASPEK 3.1.2',
    skpmStandardTitle: 'STANDARD 3.1: PENGURUSAN KURIKULUM',
    skpmAspekTitle: 'ASPEK 3.1.2: PENGURUSAN MATA PELAJARAN (PANITIA PENDIDIKAN ISLAM)',
    skpmKualitiStatement: 'Panitia Pendidikan Islam, Kem Bestari Solat dan Tasmik diurus mengikut garis panduan KPM.',
    perincianTugas: 'Menyelaras Panitia PAI, pelaksanaan waktu Tasmik, Kem Bestari Solat dan Kem Cemerlang Jawi.',
    fileRefPrefix: '600-3/PAI',
  },
  {
    kodMySG: 'JKPB12 [PENYELARAS PRASEKOLAH]',
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'JK Pengurusan Prasekolah & Kurikulum Standard Prasekolah Kebangsaan (KSPK)',
    jawatanRasmi: 'Guru Prasekolah & Penyelaras KSPK / SMPK',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.1 & 3.1.2 — Pengurusan Kurikulum Prasekolah',
    skpmCodeDisplay: 'STANDARD 3.1 • ASPEK 3.1.1',
    skpmStandardTitle: 'STANDARD 3.1: PENGURUSAN KURIKULUM PRASEKOLAH',
    skpmAspekTitle: 'ASPEK 3.1.1: PELAKSANAAN KURIKULUM STANDARD PRASEKOLAH (KSPK)',
    skpmKualitiStatement: 'Kelas Prasekolah diurus secara holistik merangkumi kurikulum KSPK, nutrisi dan pentaksiran IPPK.',
    perincianTugas: 'Mengurus pendaftaran SMPK, pengajaran KSPK, pentaksiran IPPK dan pengurusan makan murid prasekolah.',
    fileRefPrefix: '600-7/1',
  },
  {
    kodMySG: 'JKPB13 [PENYELARAS TRANSISI TAHUN 1]',
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'JK Program Transisi Tahun 1 (PT2.0)',
    jawatanRasmi: 'Penyelaras Program Transisi Tahun 1',
    tahapBeban: 'RINGAN',
    mataBeban: 1,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.1.1 — Program Transisi Murid Tahun 1',
    skpmCodeDisplay: 'STANDARD 3.1 • ASPEK 3.1.1',
    skpmStandardTitle: 'STANDARD 3.1: PENGURUSAN KURIKULUM',
    skpmAspekTitle: 'ASPEK 3.1.1: PELAKSANAAN PROGRAM TRANSISI TAHUN 1',
    skpmKualitiStatement: 'Program Transisi Tahun 1 (Fasa Penyesuaian dan Fasa Kesediaan) dilaksanakan dengan jayanya.',
    perincianTugas: 'Menyelaras modul Fasa Penyesuaian dan Fasa Kesediaan murid Tahun 1 selama 4 minggu pertama sesi.',
    fileRefPrefix: '600-8/1',
  },
  {
    kodMySG: 'JKPB14 [PENYELARAS MBMMBI & DWIBAHASA]',
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'JK Dasar MBMMBI & Kecemerlangan Bahasa',
    jawatanRasmi: 'Penyelaras Dasar MBMMBI Sekolah',
    tahapBeban: 'RINGAN',
    mataBeban: 1,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 3.1.2.2 — Program Kecemerlangan Bahasa (MBMMBI)',
    skpmCodeDisplay: 'STANDARD 3.1 • ASPEK 3.1.2',
    skpmStandardTitle: 'STANDARD 3.1: PENGURUSAN KURIKULUM',
    skpmAspekTitle: 'ASPEK 3.1.2: MEMARTABATKAN BM MEMPERKUKUH BI (MBMMBI)',
    skpmKualitiStatement: 'Program pengukuhan dwibahasa BM dan BI dilaksanakan secara merentas kurikulum.',
    perincianTugas: 'Menyelaras minggu bahasa, sudut pidato/bercerita dan aktiviti galakan pertuturan BM & BI.',
    fileRefPrefix: '600-9/1',
  },
  {
    kodMySG: 'JKPB15 [PENYELARAS PENCERAPAN PDPC & STD 4]',
    pillar: 'KURIKULUM',
    jawatankuasaInduk: 'JK Pencerapan PdPc (SKPM Standard 4) & Semakan Hasil Kerja Murid',
    jawatanRasmi: 'Penyelaras Jadual Pencerapan PdPc & Standard 4',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.1',
    skpmStandardRef: 'SKPM Standard 4.1–4.6 — Pembelajaran dan Pemudahcaraan (PdPc)',
    skpmCodeDisplay: 'STANDARD 4 • ASPEK 4.1–4.6',
    skpmStandardTitle: 'STANDARD 4: PEMBELAJARAN DAN PEMUDAHCARAAN (PDPC)',
    skpmAspekTitle: 'ASPEK 4.1–4.6: GURU SEBAGAI PERANCANG, PENGAWAL, PEMBIMBING, PENDORONG & PENILAI',
    skpmKualitiStatement: 'Pencerapan PdPc Standard 4 dan semakan buku latihan murid dilaksanakan mengikut takwim.',
    perincianTugas: 'Menyediakan jadual pencerapan PdPc Fasa 1 & 2 serta jadual semakan hasil kerja murid.',
    fileRefPrefix: '600-10/1',
  },
];

// -------------------- 3. HAL EHWAL MURID (HEM) (19) --------------------
const HEM_19_PORTFOLIOS: FullMySGPortfolioItem[] = [
  {
    kodMySG: 'JR18 [SU HAL EHWAL MURID]',
    legacyCodes: ['JK17-SU-HEM'],
    pillar: 'HEM',
    jawatankuasaInduk: 'Jawatankuasa Hal Ehwal Murid (JK HEM)',
    jawatanRasmi: 'Setiausaha Hal Ehwal Murid (HEM)',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 3.3',
    skpmStandardRef: 'SKPM Standard 3.3.1.1 — Ketetapan Pelaksanaan Hal Ehwal Murid',
    skpmCodeDisplay: 'STANDARD 3.3 • ASPEK 3.3.1',
    skpmStandardTitle: 'STANDARD 3.3: PENGURUSAN HAL EHWAL MURID',
    skpmAspekTitle: 'ASPEK 3.3.1: KETETAPAN PELAKSANAAN HAL EHWAL MURID',
    skpmKualitiStatement: 'Pengurusan Hal Ehwal Murid dilaksanakan secara sistematik, menyeluruh dan berfokuskan kebajikan murid.',
    perincianTugas: 'Mengurus Mesyuarat Induk HEM, memantau semua unit di bawah HEM dan penyelarasan dasar keselamatan/kebajikan murid.',
    fileRefPrefix: '700-1/1',
  },
  {
    kodMySG: 'JR19 [KETUA GURU DISIPLIN & SSDM]',
    legacyCodes: ['JK18-GURU-DISIPLIN-SSDM'],
    pillar: 'HEM',
    jawatankuasaInduk: 'JK Lembaga Disiplin Sekolah & Sistem Sahsiah Diri Murid (SSDM)',
    jawatanRasmi: 'Ketua Guru Disiplin & Penyelaras SSDM',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 3.3',
    skpmStandardRef: 'SKPM Standard 3.3.2.1 — Pengurusan Disiplin Murid',
    skpmCodeDisplay: 'STANDARD 3.3 • ASPEK 3.3.2',
    skpmStandardTitle: 'STANDARD 3.3: PENGURUSAN HAL EHWAL MURID',
    skpmAspekTitle: 'ASPEK 3.3.2: PENGURUSAN DISIPLIN DAN SAHSIAH MURID (SSDM)',
    skpmKualitiStatement: 'Disiplin dan amalan baik murid diurus secara berhemah melalui perekodan SSDM yang konsisten.',
    perincianTugas: 'Memantau disiplin murid, merekod amalan baik dalam sistem SSDM KPM dan melaksanakan kempen anti-buli.',
    fileRefPrefix: '700-2/1',
  },
  {
    kodMySG: 'JR20 [PENYELARAS PENGAWAS SEKOLAH]',
    pillar: 'HEM',
    jawatankuasaInduk: 'JK Badan Pengawas & Kepimpinan Murid',
    jawatanRasmi: 'Guru Penasihat Badan Pengawas Sekolah',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.3',
    skpmStandardRef: 'SKPM Standard 3.3.2.1 — Pembangunan Kepimpinan Pengawas',
    skpmCodeDisplay: 'STANDARD 3.3 • ASPEK 3.3.2',
    skpmStandardTitle: 'STANDARD 3.3: PENGURUSAN HAL EHWAL MURID',
    skpmAspekTitle: 'ASPEK 3.3.2: PENGURUSAN BADAN PENGAWAS DAN KEPIMPINAN MURID',
    skpmKualitiStatement: 'Kepimpinan pengawas sekolah dibentuk melalui watikah pelantikan dan kursus kepimpinan.',
    perincianTugas: 'Mengurus pemilihan pengawas, Majlis Watikah Pelantikan, jadual bertugas harian dan kem kepimpinan.',
    fileRefPrefix: '700-2/2',
  },
  {
    kodMySG: 'JR21 [PENYELARAS 3K — KESELAMATAN]',
    legacyCodes: ['JK19-PENYELARAS-3K'],
    pillar: 'HEM',
    jawatankuasaInduk: 'JK Program 3K (Kebersihan, Kesihatan & Keselamatan) — Unit Keselamatan',
    jawatanRasmi: 'Penyelaras Program 3K & Sekolah Selamat',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.3',
    skpmStandardRef: 'SKPM Standard 3.3.3.1 — Pengurusan Keselamatan Murid',
    skpmCodeDisplay: 'STANDARD 3.3 • ASPEK 3.3.3',
    skpmStandardTitle: 'STANDARD 3.3: PENGURUSAN HAL EHWAL MURID',
    skpmAspekTitle: 'ASPEK 3.3.3: PENGURUSAN KESELAMATAN MURID (SEKOLAH SELAMAT)',
    skpmKualitiStatement: 'Keselamatan murid pergi dan balik sekolah serta latihan kebakaran diurus mengikut SOP.',
    perincianTugas: 'Melaksanakan latihan pengungsian bangunan (kawad kebakaran), penarafan SPKS dan papan tanda keselamatan.',
    fileRefPrefix: '700-3/1',
  },
  {
    kodMySG: 'JR22 [PENYELARAS KESIHATAN & RAWATAN]',
    pillar: 'HEM',
    jawatankuasaInduk: 'JK Kesihatan, Rawatan Pergigian, Imunisasi & Pencegahan Denggi',
    jawatanRasmi: 'Penyelaras Kesihatan Murid & Bilik Isolasi/Sakit',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.3',
    skpmStandardRef: 'SKPM Standard 3.3.4.1 — Pengurusan Kesihatan Murid',
    skpmCodeDisplay: 'STANDARD 3.3 • ASPEK 3.3.4',
    skpmStandardTitle: 'STANDARD 3.3: PENGURUSAN HAL EHWAL MURID',
    skpmAspekTitle: 'ASPEK 3.3.4: PROGRAM DAN PERKHIDMATAN KESIHATAN MURID',
    skpmKualitiStatement: 'Perkhidmatan kesihatan, imunisasi dan pencegahan pembiakan Aedes dilaksanakan secara berkala.',
    perincianTugas: 'Menyelaras lawatan klinik pergigian/kesihatan KKM, rekod e-RKM dan laporan mingguan bebas denggi.',
    fileRefPrefix: '700-4/1',
  },
  {
    kodMySG: 'JR23 [PENYELARAS KEBERSIHAN & KECERIAAN KELAS]',
    pillar: 'HEM',
    jawatankuasaInduk: 'JK Kebersihan, Keceriaan Kelas & Tandas Bersih',
    jawatanRasmi: 'Penyelaras Pertandingan Kebersihan Kelas & Tandas',
    tahapBeban: 'RINGAN',
    mataBeban: 1,
    skpmBucket: 'Std 3.3',
    skpmStandardRef: 'SKPM Standard 3.3.4.1 & 2.5.2 — Kebersihan & Kondusif',
    skpmCodeDisplay: 'STANDARD 3.3 • ASPEK 3.3.4',
    skpmStandardTitle: 'STANDARD 3.3: PENGURUSAN HAL EHWAL MURID',
    skpmAspekTitle: 'ASPEK 3.3.4: PENGURUSAN KEBERSIHAN BILIK DARJAH DAN TANDAS',
    skpmKualitiStatement: 'Amalan kebersihan bilik darjah dan penarafan tandas bersih dibudayakan setiap minggu.',
    perincianTugas: 'Menyelaras jadual bertugas murid di kelas, penilaian kelas terbersih mingguan dan penarafan tandas.',
    fileRefPrefix: '700-4/2',
  },
  {
    kodMySG: 'JR24 [PENYELARAS BANTUAN RMT & PSS]',
    legacyCodes: ['JK20-PENYELARAS-BANTUAN-RMT-KWAMP'],
    pillar: 'HEM',
    jawatankuasaInduk: 'JK Rancangan Makanan Tambahan (RMT) & Program Susu Sekolah (PSS)',
    jawatanRasmi: 'Penyelaras RMT & Program Susu Sekolah',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 3.3',
    skpmStandardRef: 'SKPM Standard 3.3.5.1 — Pengurusan Bantuan Pelajaran Murid',
    skpmCodeDisplay: 'STANDARD 3.3 • ASPEK 3.3.5',
    skpmStandardTitle: 'STANDARD 3.3: PENGURUSAN HAL EHWAL MURID',
    skpmAspekTitle: 'ASPEK 3.3.5: PENGURUSAN BANTUAN PELAJARAN MURID (RMT & SUSU)',
    skpmKualitiStatement: 'Rancangan Makanan Tambahan (RMT) dan agihan susu diurus mengikut garis panduan KPM.',
    perincianTugas: 'Mengurus pemilihan murid layak RMT, jadual guru bertugas memantau menu RMT dan rekod agihan susu.',
    fileRefPrefix: '700-5/1',
  },
  {
    kodMySG: 'JR25 [PENYELARAS KWAMP, BAP & BIASISWA]',
    pillar: 'HEM',
    jawatankuasaInduk: 'JK Bantuan KWAMP, Bantuan Awal Persekolahan (BAP) & Kebajikan Murid',
    jawatanRasmi: 'Penyelaras Bantuan KWAMP, BAP & Kebajikan (APDM)',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.3',
    skpmStandardRef: 'SKPM Standard 3.3.5.1 — Pengurusan Bantuan Kewangan Murid',
    skpmCodeDisplay: 'STANDARD 3.3 • ASPEK 3.3.5',
    skpmStandardTitle: 'STANDARD 3.3: PENGURUSAN HAL EHWAL MURID',
    skpmAspekTitle: 'ASPEK 3.3.5: PENGURUSAN BANTUAN KWAMP, BAP DAN KEBAJIKAN MURID',
    skpmKualitiStatement: 'Permohonan dan agihan bantuan kewangan murid (KWAMP/BAP) diurus secara tepat dan telus.',
    perincianTugas: 'Mengurus pengesahan pendapatan penjaga dalam APDM, permohonan e-Kasih/KWAMP dan agihan BAP.',
    fileRefPrefix: '700-5/2',
  },
  {
    kodMySG: 'JR26 [PENYELARAS SPBT & BOSS]',
    legacyCodes: ['JK21-PENYELARAS-SPBT'],
    pillar: 'HEM',
    jawatankuasaInduk: 'JK Skim Pinjaman Buku Teks (SPBT) & Bilik BOSS',
    jawatanRasmi: 'Guru Penyelaras SPBT / Bilik BOSS',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.3',
    skpmStandardRef: 'SKPM Standard 3.3.5.1 — Pengurusan Skim Pinjaman Buku Teks',
    skpmCodeDisplay: 'STANDARD 3.3 • ASPEK 3.3.5',
    skpmStandardTitle: 'STANDARD 3.3: PENGURUSAN HAL EHWAL MURID',
    skpmAspekTitle: 'ASPEK 3.3.5: PENGURUSAN SKIM PINJAMAN BUKU TEKS (SPBT)',
    skpmKualitiStatement: 'Agihan, pemulangan dan pesanan buku teks SPBT diurus dengan cekap tanpa keciciran.',
    perincianTugas: 'Mengurus pesanan eSPBT, borang SPBT-G kelas, pemantauan penjagaan buku teks dan keceriaan Bilik BOSS.',
    fileRefPrefix: '700-6/1',
  },
  {
    kodMySG: 'JR27 [GURU BIMBINGAN & PENYAYANG]',
    legacyCodes: ['JK22-GURU-BIMBINGAN'],
    pillar: 'HEM',
    jawatankuasaInduk: 'JK Bimbingan & Kaunseling, Guru Penyayang & Minda Sihat',
    jawatanRasmi: 'Guru Bimbingan & Penyelaras Program Guru Penyayang',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.3',
    skpmStandardRef: 'SKPM Standard 3.3.6.1 & 3.3.6.2 — Bimbingan & Pentaksiran Psikometrik',
    skpmCodeDisplay: 'STANDARD 3.3 • ASPEK 3.3.6',
    skpmStandardTitle: 'STANDARD 3.3: PENGURUSAN HAL EHWAL MURID',
    skpmAspekTitle: 'ASPEK 3.3.6: PERKHIDMATAN BIMBINGAN, KAUNSELING DAN PSIKOMETRIK',
    skpmKualitiStatement: 'Perkhidmatan bimbingan, amalan Guru Penyayang dan pentaksiran psikometrik diurus secara mesra murid.',
    perincianTugas: 'Melaksanakan sambutan kehadiran murid (Guru Penyayang), sambutan hari lahir, saringan Minda Sihat dan IPP2M.',
    fileRefPrefix: '700-7/1',
  },
  {
    kodMySG: 'JR28 [PENYELARAS APDM & KEHADIRAN]',
    pillar: 'HEM',
    jawatankuasaInduk: 'JK Pengurusan Pendaftaran, Rekod APDM & e-Kehadiran Murid',
    jawatanRasmi: 'Penyelaras APDM & Analisis Kehadiran Murid',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.3',
    skpmStandardRef: 'SKPM Standard 3.3.1.1 & 5.3.1 — Pengurusan Kehadiran Murid',
    skpmCodeDisplay: 'STANDARD 3.3 • ASPEK 3.3.1',
    skpmStandardTitle: 'STANDARD 3.3 & 5.3: PENGURUSAN KEHADIRAN DAN SAHSIAH MURID',
    skpmAspekTitle: 'ASPEK 3.3.1 & 5.3.1: PENGURUSAN DATA APDM DAN PURATA KEHADIRAN MURID',
    skpmKualitiStatement: 'Kehadiran harian murid direkod secara tepat dan intervensi sifar ponteng dilaksanakan.',
    perincianTugas: 'Memantau pengisian e-Kehadiran harian sebelum 9:00 pagi, kemas kini profil APDM dan analisis kehadiran bulanan.',
    fileRefPrefix: '700-8/1',
  },
  {
    kodMySG: 'JR29 [PENYELARAS PPDa]',
    pillar: 'HEM',
    jawatankuasaInduk: 'JK Pendidikan Pencegahan Dadah, Rokok, Vape & Alkohol (PPDa)',
    jawatanRasmi: 'Setiausaha / Penyelaras PPDa Sekolah',
    tahapBeban: 'RINGAN',
    mataBeban: 1,
    skpmBucket: 'Std 3.3',
    skpmStandardRef: 'SKPM Standard 3.3.2.1 — Pendidikan Pencegahan Dadah (PPDa)',
    skpmCodeDisplay: 'STANDARD 3.3 • ASPEK 3.3.2',
    skpmStandardTitle: 'STANDARD 3.3: PENGURUSAN HAL EHWAL MURID',
    skpmAspekTitle: 'ASPEK 3.3.2: PENDIDIKAN PENCEGAHAN DADAH DAN GAYA HIDUP SIHAT (PPDA)',
    skpmKualitiStatement: 'Kesedaran bahaya dadah, rokok dan vape diterapkan melalui Sudut PPDa dan Mesej 5 Minit.',
    perincianTugas: 'Menyelaras Minggu Anti-Dadah, Mesej 5 Minit PPDa semasa perhimpunan dan Sudut Informasi PPDa.',
    fileRefPrefix: '700-9/1',
  },
  {
    kodMySG: 'GK01 [GURU KELAS TAHUN 1]',
    pillar: 'HEM',
    jawatankuasaInduk: 'Pengurusan Kelas & Kebajikan Murid Tahun 1',
    jawatanRasmi: 'Guru Kelas Tahun 1',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 3.3',
    skpmStandardRef: 'SKPM Standard 3.3.1 & 3.3.2 — Pengurusan Kelas Tahun 1',
    skpmCodeDisplay: 'STANDARD 3.3 • ASPEK 3.3.1',
    skpmStandardTitle: 'STANDARD 3.3: PENGURUSAN HAL EHWAL MURID & KELAS',
    skpmAspekTitle: 'ASPEK 3.3.1: PENGURUSAN KEHADIRAN, KEBAJIKAN DAN KECERIAAN TAHUN 1',
    skpmKualitiStatement: 'Pengurusan kelas Tahun 1, rekod APDM dan komunikasi ibu bapa dilaksanakan dengan cemerlang.',
    perincianTugas: 'Mengurus kehadiran harian Tahun 1, profil APDM, agihan SPBT, pelaporan PBD kelas dan keceriaan bilik darjah.',
    fileRefPrefix: '700-GK/T1',
  },
  {
    kodMySG: 'GK02 [GURU KELAS TAHUN 2]',
    pillar: 'HEM',
    jawatankuasaInduk: 'Pengurusan Kelas & Kebajikan Murid Tahun 2',
    jawatanRasmi: 'Guru Kelas Tahun 2',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 3.3',
    skpmStandardRef: 'SKPM Standard 3.3.1 & 3.3.2 — Pengurusan Kelas Tahun 2',
    skpmCodeDisplay: 'STANDARD 3.3 • ASPEK 3.3.1',
    skpmStandardTitle: 'STANDARD 3.3: PENGURUSAN HAL EHWAL MURID & KELAS',
    skpmAspekTitle: 'ASPEK 3.3.1: PENGURUSAN KEHADIRAN, KEBAJIKAN DAN KECERIAAN TAHUN 2',
    skpmKualitiStatement: 'Pengurusan kelas Tahun 2, rekod APDM dan kebajikan murid diurus dengan teratur.',
    perincianTugas: 'Mengurus kehadiran harian Tahun 2, profil APDM, agihan SPBT, pelaporan PBD kelas dan keceriaan bilik darjah.',
    fileRefPrefix: '700-GK/T2',
  },
  {
    kodMySG: 'GK03 [GURU KELAS TAHUN 3]',
    pillar: 'HEM',
    jawatankuasaInduk: 'Pengurusan Kelas & Kebajikan Murid Tahun 3',
    jawatanRasmi: 'Guru Kelas Tahun 3',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 3.3',
    skpmStandardRef: 'SKPM Standard 3.3.1 & 3.3.2 — Pengurusan Kelas Tahun 3',
    skpmCodeDisplay: 'STANDARD 3.3 • ASPEK 3.3.1',
    skpmStandardTitle: 'STANDARD 3.3: PENGURUSAN HAL EHWAL MURID & KELAS',
    skpmAspekTitle: 'ASPEK 3.3.1: PENGURUSAN KEHADIRAN, KEBAJIKAN DAN KECERIAAN TAHUN 3',
    skpmKualitiStatement: 'Pengurusan kelas Tahun 3, rekod APDM dan kebajikan murid diurus dengan teratur.',
    perincianTugas: 'Mengurus kehadiran harian Tahun 3, profil APDM, agihan SPBT, pelaporan PBD kelas dan keceriaan bilik darjah.',
    fileRefPrefix: '700-GK/T3',
  },
  {
    kodMySG: 'GK04 [GURU KELAS TAHUN 4]',
    pillar: 'HEM',
    jawatankuasaInduk: 'Pengurusan Kelas & Kebajikan Murid Tahun 4',
    jawatanRasmi: 'Guru Kelas Tahun 4',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 3.3',
    skpmStandardRef: 'SKPM Standard 3.3.1 & 3.3.2 — Pengurusan Kelas Tahun 4',
    skpmCodeDisplay: 'STANDARD 3.3 • ASPEK 3.3.1',
    skpmStandardTitle: 'STANDARD 3.3: PENGURUSAN HAL EHWAL MURID & KELAS',
    skpmAspekTitle: 'ASPEK 3.3.1: PENGURUSAN KEHADIRAN, KEBAJIKAN DAN PAJSK TAHUN 4',
    skpmKualitiStatement: 'Pengurusan kelas Tahun 4, rekod APDM, PBD/UASA dan PAJSK diurus dengan cekap.',
    perincianTugas: 'Mengurus kehadiran harian Tahun 4, profil APDM, SPBT, slip PBD/UASA serta penyelarasan PAJSK kelas.',
    fileRefPrefix: '700-GK/T4',
  },
  {
    kodMySG: 'GK05 [GURU KELAS TAHUN 5]',
    pillar: 'HEM',
    jawatankuasaInduk: 'Pengurusan Kelas & Kebajikan Murid Tahun 5',
    jawatanRasmi: 'Guru Kelas Tahun 5',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 3.3',
    skpmStandardRef: 'SKPM Standard 3.3.1 & 3.3.2 — Pengurusan Kelas Tahun 5',
    skpmCodeDisplay: 'STANDARD 3.3 • ASPEK 3.3.1',
    skpmStandardTitle: 'STANDARD 3.3: PENGURUSAN HAL EHWAL MURID & KELAS',
    skpmAspekTitle: 'ASPEK 3.3.1: PENGURUSAN KEHADIRAN, KEBAJIKAN DAN PAJSK TAHUN 5',
    skpmKualitiStatement: 'Pengurusan kelas Tahun 5, rekod APDM, PBD/UASA dan PAJSK diurus dengan cekap.',
    perincianTugas: 'Mengurus kehadiran harian Tahun 5, profil APDM, SPBT, slip PBD/UASA serta penyelarasan PAJSK kelas.',
    fileRefPrefix: '700-GK/T5',
  },
  {
    kodMySG: 'GK06 [GURU KELAS TAHUN 6]',
    pillar: 'HEM',
    jawatankuasaInduk: 'Pengurusan Kelas, Kebajikan & Transisi Tingkatan 1 Murid Tahun 6',
    jawatanRasmi: 'Guru Kelas Tahun 6',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 3.3',
    skpmStandardRef: 'SKPM Standard 3.3.1 & 3.3.2 — Pengurusan Kelas Tahun 6',
    skpmCodeDisplay: 'STANDARD 3.3 • ASPEK 3.3.1',
    skpmStandardTitle: 'STANDARD 3.3: PENGURUSAN HAL EHWAL MURID & KELAS',
    skpmAspekTitle: 'ASPEK 3.3.1: PENGURUSAN KELAS TAHUN 6 DAN PENEMPATAN SEKOLAH MENENGAH',
    skpmKualitiStatement: 'Pengurusan kelas Tahun 6 dan urusan penempatan ke Tingkatan 1 (e-Daftar Menengah) diurus sempurna.',
    perincianTugas: 'Mengurus kehadiran Tahun 6, APDM, e-Daftar Menengah, sijil berhenti sekolah, PBD/UASA dan PAJSK.',
    fileRefPrefix: '700-GK/T6',
  },
  {
    kodMySG: 'JR30 [PENYELARAS KELAB PENCEGAHAN JENAYAH]',
    pillar: 'HEM',
    jawatankuasaInduk: 'JK Kelab Pencegahan Jenayah (KPJ) & Kesedaran Sivik',
    jawatanRasmi: 'Guru Penyelaras Kelab Pencegahan Jenayah (KPJ)',
    tahapBeban: 'RINGAN',
    mataBeban: 1,
    skpmBucket: 'Std 3.3',
    skpmStandardRef: 'SKPM Standard 3.3.2.1 — Pencegahan Salah Laku & Jenayah',
    skpmCodeDisplay: 'STANDARD 3.3 • ASPEK 3.3.2',
    skpmStandardTitle: 'STANDARD 3.3: PENGURUSAN HAL EHWAL MURID',
    skpmAspekTitle: 'ASPEK 3.3.2: PROGRAM PENCEGAHAN SALAH LAKU DAN HUBUNGAN PPS (POLIS)',
    skpmKualitiStatement: 'Kerjasama bersama Pegawai Perhubungan Sekolah (PPS PDRM) dilaksanakan secara aktif.',
    perincianTugas: 'Menyelaras ceramah kesedaran undang-undang bersama Pegawai Perhubungan Sekolah (PPS) PDRM.',
    fileRefPrefix: '700-10/1',
  },
];

// -------------------- 4. KOKURIKULUM & KOAKADEMIK (16) --------------------
const KOKO_16_PORTFOLIOS: FullMySGPortfolioItem[] = [
  {
    kodMySG: 'JR31 [SU KOKURIKULUM & PAJSK]',
    legacyCodes: ['JK23-SU-KOKURIKULUM'],
    pillar: 'KOKURIKULUM',
    jawatankuasaInduk: 'Jawatankuasa Kokurikulum Sekolah (JK Koko) & Pentaksiran PAJSK',
    jawatanRasmi: 'Setiausaha Kokurikulum & Penyelaras PAJSK (3.2.1.1 & 3.2.7.1)',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 3.2',
    skpmStandardRef: 'SKPM Standard 3.2.1.1 & 3.2.7.1 — Ketetapan & Pentaksiran PAJSK',
    skpmCodeDisplay: 'STANDARD 3.2 • ASPEK 3.2.1 & 3.2.7',
    skpmStandardTitle: 'STANDARD 3.2: PENGURUSAN KOKURIKULUM',
    skpmAspekTitle: 'ASPEK 3.2.1 & 3.2.7: KETETAPAN PELAKSANAAN DAN PENTAKSIRAN PAJSK',
    skpmKualitiStatement: 'Pelaksanaan kokurikulum dan pentaksiran PAJSK diurus secara sistematik dan terancang.',
    perincianTugas: 'Menyelaras takwim perjumpaan mingguan (12x setahun), pendaftaran ahli unit dan pengesahan skor PAJSK.',
    fileRefPrefix: '800-1/1',
  },
  {
    kodMySG: 'JR32 [SU SUKAN & 1M1S]',
    legacyCodes: ['JK24-SU-SUKAN'],
    pillar: 'KOKURIKULUM',
    jawatankuasaInduk: 'JK Pembangunan Sukan Sekolah, Sukan Untuk Semua & 1M1S',
    jawatanRasmi: 'Setiausaha Sukan & Penyelaras 1M1S (3.2.4.1 & 3.2.6.1)',
    tahapBeban: 'BERAT',
    mataBeban: 3,
    skpmBucket: 'Std 3.2',
    skpmStandardRef: 'SKPM Standard 3.2.4.1 & 3.2.6.1 — Sukan Permainan & Sukan Untuk Semua',
    skpmCodeDisplay: 'STANDARD 3.2 • ASPEK 3.2.6',
    skpmStandardTitle: 'STANDARD 3.2: PENGURUSAN KOKURIKULUM',
    skpmAspekTitle: 'ASPEK 3.2.6: PENGURUSAN SUKAN UNTUK SEMUA (OLAHRAGA / MERENTAS DESA)',
    skpmKualitiStatement: 'Aktiviti Sukan Untuk Semua dan Kejohanan Olahraga Tahunan diurus secara profesional dan terancang.',
    perincianTugas: 'Menyelaras Merentas Desa, Sukantara, Kejohanan Olahraga Tahunan, Hari Sukan Negara dan kontinjen MSS.',
    fileRefPrefix: '800-2/1',
  },
  {
    kodMySG: 'JR33 [PENYELARAS BADAN BERUNIFORM]',
    pillar: 'KOKURIKULUM',
    jawatankuasaInduk: 'JK Penyelarasan Unit Badan Beruniform (Std 3.2.3.1)',
    jawatanRasmi: 'Penyelaras Badan Beruniform & Perkhemahan Tahunan',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.2',
    skpmStandardRef: 'SKPM Standard 3.2.3.1 & 5.2.2 — Pengurusan Badan Beruniform',
    skpmCodeDisplay: 'STANDARD 3.2 • ASPEK 3.2.3',
    skpmStandardTitle: 'STANDARD 3.2: PENGURUSAN KOKURIKULUM',
    skpmAspekTitle: 'ASPEK 3.2.3: PENGURUSAN BADAN BERUNIFORM',
    skpmKualitiStatement: 'Badan beruniform diurus secara sistematik dan terancang.',
    perincianTugas: 'Menyelaras aktiviti mingguan Badan Beruniform, ujian lencana dan Kem Kepimpinan/Perkhemahan.',
    fileRefPrefix: '800-3/1',
  },
  {
    kodMySG: 'JR34 [PENYELARAS KELAB & PERSATUAN]',
    pillar: 'KOKURIKULUM',
    jawatankuasaInduk: 'JK Penyelarasan Kelab & Persatuan (Std 3.2.2.1)',
    jawatanRasmi: 'Penyelaras Kelab dan Persatuan Sekolah',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.2',
    skpmStandardRef: 'SKPM Standard 3.2.2.1 & 5.2.1 — Pengurusan Kelab dan Persatuan',
    skpmCodeDisplay: 'STANDARD 3.2 • ASPEK 3.2.2',
    skpmStandardTitle: 'STANDARD 3.2: PENGURUSAN KOKURIKULUM',
    skpmAspekTitle: 'ASPEK 3.2.2: PENGURUSAN KELAB DAN PERSATUAN',
    skpmKualitiStatement: 'Kelab dan persatuan diurus secara sistematik dan terancang.',
    perincianTugas: 'Memantau pelaksanaan 12 perjumpaan Kelab & Persatuan serta penyertaan pertandingan koakademik.',
    fileRefPrefix: '800-4/1',
  },
  {
    kodMySG: 'JR35 [GURU PENASIHAT TUNAS KADET REMAJA SEKOLAH (TKRS)]',
    pillar: 'KOKURIKULUM',
    jawatankuasaInduk: 'Badan Beruniform: Tunas Kadet Remaja Sekolah (TKRS)',
    jawatanRasmi: 'Ketua Guru Penasihat TKRS (Std 3.2.3.1)',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.2',
    skpmStandardRef: 'SKPM Standard 3.2.3.1 & 5.2.2 — Pengurusan TKRS',
    skpmCodeDisplay: 'STANDARD 3.2 • ASPEK 3.2.3',
    skpmStandardTitle: 'STANDARD 3.2: PENGURUSAN KOKURIKULUM',
    skpmAspekTitle: 'ASPEK 3.2.3: PENGURUSAN BADAN BERUNIFORM (TKRS)',
    skpmKualitiStatement: 'Aktiviti kawad kaki, ikatan dan kemahiran asas TKRS dilaksanakan mengikut modul KPM.',
    perincianTugas: 'Melaksanakan latihan mingguan TKRS, merekod kehadiran ahli dan menyediakan laporan perjumpaan.',
    fileRefPrefix: '800-3/TKRS',
  },
  {
    kodMySG: 'JR36 [GURU PENASIHAT PENGAKAP / BSMM]',
    pillar: 'KOKURIKULUM',
    jawatankuasaInduk: 'Badan Beruniform: Persekutuan Pengakap / Bulan Sabit Merah Malaysia (BSMM)',
    jawatanRasmi: 'Ketua Guru Penasihat Pengakap / BSMM (Std 3.2.3.1)',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.2',
    skpmStandardRef: 'SKPM Standard 3.2.3.1 & 5.2.2 — Pengurusan Pengakap / BSMM',
    skpmCodeDisplay: 'STANDARD 3.2 • ASPEK 3.2.3',
    skpmStandardTitle: 'STANDARD 3.2: PENGURUSAN KOKURIKULUM',
    skpmAspekTitle: 'ASPEK 3.2.3: PENGURUSAN BADAN BERUNIFORM (PENGAKAP / BSMM)',
    skpmKualitiStatement: 'Kemahiran pertolongan cemas dan kepengakapan dilaksanakan secara terancang.',
    perincianTugas: 'Melaksanakan perjumpaan mingguan unit beruniform, latihan pertolongan cemas dan rekod lencana.',
    fileRefPrefix: '800-3/BSMM',
  },
  {
    kodMySG: 'JR37 [GURU PENASIHAT KELAB STEM & ROBOTIK]',
    pillar: 'KOKURIKULUM',
    jawatankuasaInduk: 'Kelab & Persatuan: Kelab STEM, Inovasi & Robotik',
    jawatanRasmi: 'Ketua Guru Penasihat Kelab STEM (Std 3.2.2.1)',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.2',
    skpmStandardRef: 'SKPM Standard 3.2.2.1 & 5.2.1 — Pengurusan Kelab STEM',
    skpmCodeDisplay: 'STANDARD 3.2 • ASPEK 3.2.2',
    skpmStandardTitle: 'STANDARD 3.2: PENGURUSAN KOKURIKULUM',
    skpmAspekTitle: 'ASPEK 3.2.2: PENGURUSAN KELAB DAN PERSATUAN (KELAB STEM)',
    skpmKualitiStatement: 'Aktiviti eksperimen mudah, koding dan reka cipta STEM dijalankan secara aktif.',
    perincianTugas: 'Membimbing ahli Kelab STEM dalam projek inovasi sains/matematik dan karnival STEM.',
    fileRefPrefix: '800-4/STEM',
  },
  {
    kodMySG: 'JR38 [GURU PENASIHAT KELAB KEBUDAYAAN & KESENIAN]',
    pillar: 'KOKURIKULUM',
    jawatankuasaInduk: 'Kelab & Persatuan: Kelab Kebudayaan, Muzik & Kesenian',
    jawatanRasmi: 'Ketua Guru Penasihat Kelab Kebudayaan (Std 3.2.2.1)',
    tahapBeban: 'RINGAN',
    mataBeban: 1,
    skpmBucket: 'Std 3.2',
    skpmStandardRef: 'SKPM Standard 3.2.2.1 & 5.2.1 — Pengurusan Kelab Kebudayaan',
    skpmCodeDisplay: 'STANDARD 3.2 • ASPEK 3.2.2',
    skpmStandardTitle: 'STANDARD 3.2: PENGURUSAN KOKURIKULUM',
    skpmAspekTitle: 'ASPEK 3.2.2: PENGURUSAN KELAB DAN PERSATUAN (KEBUDAYAAN)',
    skpmKualitiStatement: 'Bakat seni tari, nyanyian dan apresiasi budaya murid digilap secara berterusan.',
    perincianTugas: 'Melatih pasukan persembahan kebudayaan sekolah bagi majlis rasmi dan pertandingan.',
    fileRefPrefix: '800-4/SENI',
  },
  {
    kodMySG: 'JR39 [GURU PENASIHAT SUKAN PING PONG & BADMINTON]',
    pillar: 'KOKURIKULUM',
    jawatankuasaInduk: 'Sukan & Permainan (1M1S): Kelab Ping Pong & Badminton',
    jawatanRasmi: 'Ketua Guru Penasihat & Jurulatih Ping Pong / Badminton (Std 3.2.4.1)',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.2',
    skpmStandardRef: 'SKPM Standard 3.2.4.1 & 5.2.3 — Pengurusan Sukan & Permainan',
    skpmCodeDisplay: 'STANDARD 3.2 • ASPEK 3.2.4',
    skpmStandardTitle: 'STANDARD 3.2: PENGURUSAN KOKURIKULUM',
    skpmAspekTitle: 'ASPEK 3.2.4: PENGURUSAN SUKAN DAN PERMAINAN (PING PONG / BADMINTON)',
    skpmKualitiStatement: 'Latihan kemahiran sukan raket dan pembangunan atlet MSS dilaksanakan secara sistematik.',
    perincianTugas: 'Melatih ahli kelab 1M1S dan pasukan sekolah ke kejohanan MSSD Mukah/Dalat.',
    fileRefPrefix: '800-5/RAKET',
  },
  {
    kodMySG: 'JR40 [GURU PENASIHAT SUKAN BOLA KERANJANG & OLAHRAGA]',
    pillar: 'KOKURIKULUM',
    jawatankuasaInduk: 'Sukan & Permainan (1M1S): Kelab Bola Keranjang & Olahraga',
    jawatanRasmi: 'Ketua Guru Penasihat & Jurulatih Bola Keranjang / Olahraga (Std 3.2.4.1)',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.2',
    skpmStandardRef: 'SKPM Standard 3.2.4.1 & 5.2.3 — Pengurusan Sukan & Permainan',
    skpmCodeDisplay: 'STANDARD 3.2 • ASPEK 3.2.4',
    skpmStandardTitle: 'STANDARD 3.2: PENGURUSAN KOKURIKULUM',
    skpmAspekTitle: 'ASPEK 3.2.4: PENGURUSAN SUKAN DAN PERMAINAN (BOLA KERANJANG / OLAHRAGA)',
    skpmKualitiStatement: 'Latihan kemahiran bola keranjang dan olahraga dilaksanakan secara terancang.',
    perincianTugas: 'Melatih pasukan bola keranjang dan atlet balapan/padang sekolah ke kejohanan MSSD.',
    fileRefPrefix: '800-5/BOLA',
  },
  {
    kodMySG: 'PM25-BC [PENYELARAS KOAKADEMIK BAHASA CINA]',
    legacyCodes: ['PM25-3.2.5.1-KOAKADEMIK-BC'],
    pillar: 'KOKURIKULUM',
    jawatankuasaInduk: 'JK Kecemerlangan Koakademik Bahasa Cina (Std 3.2.5.1)',
    jawatanRasmi: 'Penyelaras Koakademik Bahasa Cina (BC)',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.2',
    skpmStandardRef: 'SKPM Standard 3.2.5.1 & 5.2.1 — Kecemerlangan Koakademik BC',
    skpmCodeDisplay: 'STANDARD 3.2 • ASPEK 3.2.5',
    skpmStandardTitle: 'STANDARD 3.2: PENGURUSAN KOKURIKULUM',
    skpmAspekTitle: 'ASPEK 3.2.5: PROGRAM KECEMERLANGAN KOKURIKULUM & KOAKADEMIK (BC)',
    skpmKualitiStatement: 'Latihan intensif peserta koakademik Bahasa Cina (kaligrafi, syarahan, deklamasi sajak) diurus secara profesional.',
    perincianTugas: 'Melatih dan mengiringi wakil sekolah dalam pertandingan Koakademik Bahasa Cina peringkat Daerah/Negeri.',
    fileRefPrefix: '800-6/BC',
  },
  {
    kodMySG: 'PM25-BM [PENYELARAS KOAKADEMIK BAHASA MELAYU]',
    legacyCodes: ['PM25-3.2.5.1-KOAKADEMIK-BM'],
    pillar: 'KOKURIKULUM',
    jawatankuasaInduk: 'JK Kecemerlangan Koakademik Bahasa Melayu (Std 3.2.5.1)',
    jawatanRasmi: 'Penyelaras Koakademik Bahasa Melayu (BM)',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.2',
    skpmStandardRef: 'SKPM Standard 3.2.5.1 & 5.2.1 — Kecemerlangan Koakademik BM',
    skpmCodeDisplay: 'STANDARD 3.2 • ASPEK 3.2.5',
    skpmStandardTitle: 'STANDARD 3.2: PENGURUSAN KOKURIKULUM',
    skpmAspekTitle: 'ASPEK 3.2.5: PROGRAM KECEMERLANGAN KOKURIKULUM & KOAKADEMIK (BM)',
    skpmKualitiStatement: 'Latihan peserta koakademik Bahasa Melayu (bercerita, pidato, pantun) diurus secara terancang.',
    perincianTugas: 'Melatih dan mengiringi wakil sekolah dalam pertandingan Koakademik Bahasa Melayu.',
    fileRefPrefix: '800-6/BM',
  },
  {
    kodMySG: 'PM25-BI [PENYELARAS KOAKADEMIK BAHASA INGGERIS]',
    legacyCodes: ['PM25-3.2.5.1-KOAKADEMIK-BI'],
    pillar: 'KOKURIKULUM',
    jawatankuasaInduk: 'JK Kecemerlangan Koakademik Bahasa Inggeris (Std 3.2.5.1)',
    jawatanRasmi: 'Penyelaras Koakademik Bahasa Inggeris (BI)',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.2',
    skpmStandardRef: 'SKPM Standard 3.2.5.1 & 5.2.1 — Kecemerlangan Koakademik BI',
    skpmCodeDisplay: 'STANDARD 3.2 • ASPEK 3.2.5',
    skpmStandardTitle: 'STANDARD 3.2: PENGURUSAN KOKURIKULUM',
    skpmAspekTitle: 'ASPEK 3.2.5: PROGRAM KECEMERLANGAN KOKURIKULUM & KOAKADEMIK (BI)',
    skpmKualitiStatement: 'Latihan peserta koakademik Bahasa Inggeris (Storytelling, Public Speaking, Poetry) diurus secara profesional.',
    perincianTugas: 'Melatih dan mengiringi wakil sekolah dalam karnival Koakademik Bahasa Inggeris.',
    fileRefPrefix: '800-6/BI',
  },
  {
    kodMySG: 'PM25-STEM [PENYELARAS KOAKADEMIK STEM]',
    legacyCodes: ['PM25-3.2.5.1-KOAKADEMIK-STEM'],
    pillar: 'KOKURIKULUM',
    jawatankuasaInduk: 'JK Kecemerlangan Koakademik STEM (Sains, Matematik & RBT)',
    jawatanRasmi: 'Penyelaras Koakademik STEM (Std 3.2.5.1)',
    tahapBeban: 'SEDERHANA',
    mataBeban: 2,
    skpmBucket: 'Std 3.2',
    skpmStandardRef: 'SKPM Standard 3.2.5.1 & 5.2.1 — Kecemerlangan Koakademik STEM',
    skpmCodeDisplay: 'STANDARD 3.2 • ASPEK 3.2.5',
    skpmStandardTitle: 'STANDARD 3.2: PENGURUSAN KOKURIKULUM',
    skpmAspekTitle: 'ASPEK 3.2.5: PROGRAM KECEMERLANGAN KOKURIKULUM & KOAKADEMIK (STEM)',
    skpmKualitiStatement: 'Penyertaan murid dalam kuiz sains, olimpiad matematik dan cabaran STEM diurus secara berfokus.',
    perincianTugas: 'Melatih dan mengurus penyertaan murid dalam Karnival STEM dan pertandingan inovasi.',
    fileRefPrefix: '800-6/STEM',
  },
  {
    kodMySG: 'PM25-SENI [PENYELARAS KOAKADEMIK KESENIAN]',
    legacyCodes: ['PM25-3.2.5.1-KOAKADEMIK-SENI'],
    pillar: 'KOKURIKULUM',
    jawatankuasaInduk: 'JK Kecemerlangan Koakademik Kesenian & Kebudayaan (Std 3.2.5.1)',
    jawatanRasmi: 'Penyelaras Koakademik Kesenian & Kebudayaan',
    tahapBeban: 'RINGAN',
    mataBeban: 1,
    skpmBucket: 'Std 3.2',
    skpmStandardRef: 'SKPM Standard 3.2.5.1 & 5.2.1 — Kecemerlangan Koakademik Kesenian',
    skpmCodeDisplay: 'STANDARD 3.2 • ASPEK 3.2.5',
    skpmStandardTitle: 'STANDARD 3.2: PENGURUSAN KOKURIKULUM',
    skpmAspekTitle: 'ASPEK 3.2.5: PROGRAM KECEMERLANGAN KOKURIKULUM & KESENIAN',
    skpmKualitiStatement: 'Penyertaan murid dalam pertandingan lukisan, nyanyian dan tarian diurus secara terancang.',
    perincianTugas: 'Melatih dan mengurus penyertaan murid dalam pertandingan kesenian dan kebudayaan.',
    fileRefPrefix: '800-6/SENI',
  },
  {
    kodMySG: 'PM25-AGAMA [PENYELARAS KOAKADEMIK PAI & MORAL]',
    legacyCodes: ['PM25-3.2.5.1-KOAKADEMIK-AGAMA'],
    pillar: 'KOKURIKULUM',
    jawatankuasaInduk: 'JK Kecemerlangan Koakademik Pendidikan Islam (MTQ / Adab) & Moral',
    jawatanRasmi: 'Penyelaras Koakademik Pendidikan Islam & Moral (Std 3.2.5.1)',
    tahapBeban: 'RINGAN',
    mataBeban: 1,
    skpmBucket: 'Std 3.2',
    skpmStandardRef: 'SKPM Standard 3.2.5.1 & 5.2.1 — Kecemerlangan Koakademik PAI & Moral',
    skpmCodeDisplay: 'STANDARD 3.2 • ASPEK 3.2.5',
    skpmStandardTitle: 'STANDARD 3.2: PENGURUSAN KOKURIKULUM',
    skpmAspekTitle: 'ASPEK 3.2.5: PROGRAM KECEMERLANGAN KOAKADEMIK (MTQ / ADAB & NILAI)',
    skpmKualitiStatement: 'Penyertaan murid dalam Mahrajan Al-Quran (MTQ) dan koakademik nilai murni diurus dengan rapi.',
    perincianTugas: 'Melatih dan mengiringi peserta MTQ, tilawah, hafazan dan bercerita kisah teladan.',
    fileRefPrefix: '800-6/AGAMA',
  },
];

export const ALL_79_MYSG_PORTFOLIOS: FullMySGPortfolioItem[] = [
  ...OFFICIAL_79_MYSG_PORTFOLIOS,
  ...KURIKULUM_22_PORTFOLIOS,
  ...HEM_19_PORTFOLIOS,
  ...KOKO_16_PORTFOLIOS,
];

// Merge the 79 official portfolios with saved Firestore items (`mysg_jawatankuasa_assignments`)
function hydrate79PortfoliosWithSaved(
  savedItems?: MySGJawatankuasaItem[] | null
): FullMySGPortfolioItem[] {
  const mergedBase = mergeMySGCatalogWithSaved(savedItems);
  const byCode = new Map<string, MySGJawatankuasaItem>();
  const byTitle = new Map<string, MySGJawatankuasaItem>();

  mergedBase.forEach((it) => {
    if (it.kodMySG) byCode.set(it.kodMySG.toUpperCase(), it);
    const normTitle = `${it.jawatankuasaInduk}__${it.jawatanRasmi}`.toUpperCase();
    byTitle.set(normTitle, it);
  });

  if (Array.isArray(savedItems)) {
    savedItems.forEach((it) => {
      if (it?.kodMySG) byCode.set(it.kodMySG.toUpperCase(), it);
      const normTitle = `${it?.jawatankuasaInduk || ''}__${it?.jawatanRasmi || ''}`.toUpperCase();
      byTitle.set(normTitle, it);
    });
  }

  return ALL_79_MYSG_PORTFOLIOS.map((def) => {
    let matched = byCode.get(def.kodMySG.toUpperCase());
    if (!matched && def.legacyCodes) {
      for (const leg of def.legacyCodes) {
        const m = byCode.get(leg.toUpperCase());
        if (m) {
          matched = m;
          break;
        }
      }
    }
    if (!matched) {
      const normTitle = `${def.jawatankuasaInduk}__${def.jawatanRasmi}`.toUpperCase();
      matched = byTitle.get(normTitle);
    }

    const cleanAhli: MySGAhliItem[] = Array.isArray(matched?.ahliList)
      ? matched!.ahliList!
          .filter((a) => a && (a.teacherId || a.teacherName))
          .map((a) => ({
            teacherId: String(a.teacherId || '').trim(),
            teacherName: String(a.teacherName || '').trim().toUpperCase(),
          }))
      : [];

    return {
      ...def,
      assignedTeacherId: matched?.assignedTeacherId || '',
      assignedTeacherName: matched?.assignedTeacherName || '',
      ahliList: cleanAhli,
    };
  });
}

// ============================================================================
// SMART FORMALIZER ENGINE (CHINESE / BM KEYWORDS -> SKPM SKOR 4 & PKPA 2/1991)
// ============================================================================
function normalizeChineseAndRoughNotesToBM(raw: string): string[] {
  if (!raw || !raw.trim()) return [];
  const dict: Array<[RegExp, string]> = [
    [/会议|开会/g, 'mesyuarat penyelarasan'],
    [/老师|教师|全体老师/g, 'semua warga pendidik'],
    [/学生|同学/g, 'murid-murid'],
    [/家长|父母/g, 'ibu bapa dan penjaga'],
    [/比赛|竞赛/g, 'pertandingan kecemerlangan'],
    [/培训|工作坊|讲座/g, 'bengkel pemantapan profesionalisme'],
    [/大扫除|清洁|卫生/g, 'gotong-royong kebersihan dan keceriaan 3K'],
    [/阅读|读书/g, 'pembudayaan galakan membaca NILAM'],
    [/安全|演习|防火/g, 'latihan kesiapsiagaan keselamatan dan pengungsian bangunan'],
    [/考试|评估|测验/g, 'pentaksiran UASA dan PBD'],
    [/辅导|关怀/g, 'program bimbingan dan amalan Guru Penyayang'],
    [/运动|体育/g, 'aktiviti kecergasan Sukan Untuk Semua (1M1S)'],
    [/颁奖|奖励/g, 'penyampaian sijil penghargaan dan pengiktirafan'],
    [/讨论|商讨/g, 'perbincangan terperinci'],
    [/准备|筹备/g, 'persiapan rapi jawatankuasa kerja'],
    [/完成|顺利|成功/g, 'dilaksanakan dengan lancar serta mencapai sasaran KPI'],
    [/改进|提升|加强/g, 'penambahbaikan berterusan (CQI) dilaksanakan'],
  ];

  return raw
    .split(/[\n;•]+/)
    .map((line) => {
      let s = line.trim();
      if (!s) return '';
      dict.forEach(([re, rep]) => {
        s = s.replace(re, ` ${rep} `);
      });
      s = s.replace(/\s+/g, ' ').trim();
      return s;
    })
    .filter(Boolean);
}

function autoDraftOPRSkor4(params: {
  programTitle: string;
  portfolio: FullMySGPortfolioItem;
  sasaran: string;
  tempat: string;
  rawNotes: string;
}): {
  objektif: string[];
  pengisian: string[];
  impak: string[];
  refleksi: string[];
} {
  const { programTitle, portfolio, sasaran, tempat, rawNotes } = params;
  const titleClean = (programTitle || portfolio.jawatankuasaInduk).toUpperCase();
  const convertedNotes = normalizeChineseAndRoughNotesToBM(rawNotes);

  const objektif = [
    `Memastikan pelaksanaan "${titleClean}" di bawah ${portfolio.jawatankuasaInduk} diurus secara sistematik, terancang dan mematuhi ketetapan ${portfolio.skpmCodeDisplay}.`,
    `Meningkatkan penglibatan aktif serta kemenjadian ${sasaran || 'warga sekolah'} selaras dengan pernyataan kualiti SKPM Kualiti@Sekolah.`,
  ];

  const pengisianBase = [
    `Taklimat hala tuju dan penyelarasan gerak kerja oleh ${portfolio.jawatanRasmi} bertempat di ${tempat || 'sekolah'}.`,
    `Pelaksanaan aktiviti berfokus melibatkan ${sasaran || 'guru dan murid'} mengikut garis panduan KPM.`,
  ];
  convertedNotes.forEach((n) => {
    pengisianBase.push(
      n.charAt(0).toUpperCase() +
        n.slice(1) +
        (n.endsWith('.') ? '' : ' dilaksanakan secara berstruktur.')
    );
  });

  const impak = [
    `100% objektif program tercapai dengan penglibatan aktif ${sasaran || 'peserta'} serta mematuhi piawaian Skor 4 (${portfolio.skpmCodeDisplay}).`,
    `${portfolio.skpmKualitiStatement}`,
  ];

  const refleksi = [
    `Kekuatan: Kerjasama erat antara Penyelaras, Ahli Jawatankuasa (${portfolio.jawatankuasaInduk}) dan pentadbir sekolah melancarkan perjalanan program.`,
    `Tindakan Susulan (Penambahbaikan Berterusan): Pemantauan berkala dan dokumentasi evidens diteruskan bagi mengekalkan kualiti Skor 4 SKPM.`,
  ];

  return {
    objektif,
    pengisian: pengisianBase.slice(0, 4),
    impak,
    refleksi,
  };
}

export interface MinitPKPAAgendaItem {
  id: string;
  bil: string;
  title: string;
  rawKeywords: string;
  formalText: string;
  tindakan: string;
  statusMaklumBalas: string;
}

function defaultMinitAgendaItems(portfolio: FullMySGPortfolioItem, academicYear: string): MinitPKPAAgendaItem[] {
  return [
    {
      id: 'ag-1',
      bil: '1.0',
      title: 'Perutusan Pengerusi',
      rawKeywords: 'Pengerusi ucap terima kasih & hala tuju sesi ' + academicYear,
      formalText: `1.1 Pengerusi mengucapkan ribuan terima kasih atas kehadiran semua ahli ${portfolio.jawatankuasaInduk} bagi Sesi Akademik ${academicYear}.\n1.2 Pengerusi menegaskan agar semua perancangan unit dilaksanakan mengikut piawaian SKPM Kualiti@Sekolah (${portfolio.skpmCodeDisplay}).`,
      tindakan: 'Makluman',
      statusMaklumBalas: 'Telah diambil maklum oleh semua ahli mesyuarat.',
    },
    {
      id: 'ag-2',
      bil: '2.0',
      title: 'Pengesahan Minit Mesyuarat Yang Lalu',
      rawKeywords: 'Dicadang & disokong sebulat suara',
      formalText: `2.1 Minit mesyuarat yang lalu telah dibentangkan dan disahkan tanpa sebarang pindaan dengan cadangan serta sokongan sebulat suara ahli mesyuarat.`,
      tindakan: 'Makluman',
      statusMaklumBalas: 'Minit mesyuarat lepas telah disahkan dan difailkan.',
    },
    {
      id: 'ag-3',
      bil: '3.0',
      title: 'Perkara-perkara Berbangkit (Maklum Balas PKPA Bil. 2/1991)',
      rawKeywords: 'Tindakan mesyuarat lepas telah selesai',
      formalText: `3.1 Mesyuarat mengambil maklum bahawa semua ketetapan daripada mesyuarat yang lalu telah diambil tindakan sewajarnya mengikut Borang Maklum Balas PKPA Bil. 2/1991.`,
      tindakan: portfolio.jawatanRasmi,
      statusMaklumBalas: 'Semua tindakan berbangkit telah selesai dilaksanakan 100%.',
    },
    {
      id: 'ag-4',
      bil: '4.0',
      title: `Fokus Utama: Perancangan Takwim & KPI ${portfolio.jawatankuasaInduk}`,
      rawKeywords: `Penyelarasan program tahunan, KPI & pengurusan fail ${portfolio.kodMySG}`,
      formalText: `4.1 Mesyuarat memutuskan agar semua program utama di bawah ${portfolio.jawatankuasaInduk} dilaksanakan mengikut takwim Sesi ${academicYear} dan didokumentasikan dalam bentuk One Page Report (OPR) SKPM.\n4.2 Semua ahli jawatankuasa diminta mengemas kini rekod dan evidens pelaksanaan secara berkala.`,
      tindakan: 'Penyelaras & Semua AJK',
      statusMaklumBalas: 'Takwim tahunan dan jadual kerja unit sedang dilaksanakan mengikut jadual.',
    },
    {
      id: 'ag-5',
      bil: '5.0',
      title: 'Hal-hal Lain',
      rawKeywords: 'Kerjasama berpasukan & pematuhan tarikh akhir pelaporan',
      formalText: `5.1 Pengerusi mengingatkan agar sebarang kekangan pelaksanaan dilaporkan segera kepada pihak pentadbiran untuk tindakan intervensi bersama.`,
      tindakan: 'Semua Ahli Jawatankuasa',
      statusMaklumBalas: 'Pemantauan berterusan oleh Setiausaha dan Penyelaras.',
    },
    {
      id: 'ag-6',
      bil: '6.0',
      title: 'Penutup',
      rawKeywords: 'Mesyuarat ditangguhkan pada jam 4.00 petang',
      formalText: `6.1 Mesyuarat ditangguhkan pada jam 4:00 petang dengan ucapan terima kasih daripada Pengerusi.`,
      tindakan: 'Makluman',
      statusMaklumBalas: '-',
    },
  ];
}

function formalizeSinglePKPAItem(
  item: MinitPKPAAgendaItem,
  portfolio: FullMySGPortfolioItem,
  idx: number
): MinitPKPAAgendaItem {
  const cleanLines = normalizeChineseAndRoughNotesToBM(item.rawKeywords || item.title);
  const paraBase = item.bil.replace(/\.0$/, '') || String(idx + 1);
  if (cleanLines.length === 0) {
    return item;
  }
  const paragraphs = cleanLines.map((line, subIdx) => {
    const cap = line.charAt(0).toUpperCase() + line.slice(1);
    if (idx === 0) {
      return `${paraBase}.${subIdx + 1} Pengerusi memaklumkan bahawa ${cap.toLowerCase()} perlu diberi perhatian utama oleh semua ahli ${portfolio.jawatankuasaInduk}.`;
    }
    return `${paraBase}.${subIdx + 1} Mesyuarat membincangkan perkara berkaitan ${cap.toLowerCase()} dan memutuskan agar tindakan penyelarasan dilaksanakan mengikut ketetapan ${portfolio.skpmCodeDisplay}.`;
  });

  return {
    ...item,
    formalText: paragraphs.join('\n'),
    tindakan:
      item.tindakan && item.tindakan.trim()
        ? item.tindakan
        : idx === 0 || idx === 1 || idx === 5
        ? 'Makluman'
        : 'Penyelaras & Semua AJK',
    statusMaklumBalas:
      item.statusMaklumBalas && item.statusMaklumBalas.trim() && item.statusMaklumBalas !== '-'
        ? item.statusMaklumBalas
        : 'Tindakan sedang diambil oleh pegawai bertanggungjawab mengikut jadual.',
  };
}

// ============================================================================
// SMART DUAL-CRITERIA SESSION CLASSIFIER (TAJUK + AGENDA + TARIKH)
// ============================================================================
export function resolveDocumentSessions(params: {
  title?: string;
  agendaText?: string;
  tarikh?: string;
  savedAcademicYear?: string;
  savedAcademicYears?: string[];
  fallbackYear?: string;
}): {
  primaryYear: string;
  academicYears: string[];
  badgeLabel: string;
} {
  const extractYears = (text?: string): string[] => {
    if (!text) return [];
    const matches = String(text).match(/\b(202[5-9]|203[0-5])\b/g);
    return matches ? Array.from(new Set(matches)) : [];
  };

  const titleYears = extractYears(params.title);
  const agendaYears = extractYears(params.agendaText);
  const combinedExplicit = Array.from(new Set([...titleYears, ...agendaYears])).sort();

  // Rule 1: If title or agenda explicitly mentions 4-digit year(s) (e.g. "3/2026" + "Perancangan Tahun 2027")
  if (combinedExplicit.length > 0) {
    const primaryYear = titleYears[0] || combinedExplicit[0];
    const allYears = Array.from(
      new Set([
        ...combinedExplicit,
        ...(Array.isArray(params.savedAcademicYears) ? params.savedAcademicYears : []),
      ])
    )
      .filter((y) => /^20[23]\d$/.test(y))
      .sort();
    const finalYears = allYears.length > 0 ? allYears : [primaryYear];
    return {
      primaryYear,
      academicYears: finalYears,
      badgeLabel: `Sesi ${finalYears.join(' & ')}`,
    };
  }

  // Rule 2: Secondary Fallback — extract 4-digit year from `tarikh` (`YYYY-MM-DD`) or `savedAcademicYear`
  const tarikhYearMatch = String(params.tarikh || '').match(/\b(202[5-9]|203[0-5])\b/);
  const tarikhYear = tarikhYearMatch ? tarikhYearMatch[1] : '';
  const savedYrClean = String(params.savedAcademicYear || '').slice(0, 4);
  const fallback =
    tarikhYear ||
    (/^20[23]\d$/.test(savedYrClean) ? savedYrClean : '') ||
    String(params.fallbackYear || '2026').slice(0, 4);

  const savedMulti = Array.isArray(params.savedAcademicYears)
    ? params.savedAcademicYears.filter((y) => /^20[23]\d$/.test(String(y)))
    : [];
  const mergedFallback = Array.from(new Set([fallback, ...savedMulti])).sort();

  return {
    primaryYear: fallback,
    academicYears: mergedFallback,
    badgeLabel: `Sesi ${mergedFallback.join(' & ')}`,
  };
}

/**
 * Sanitize raw agenda/fokus text so ONLY clean, one-topic-per-line discussion items remain.
 * Strips out leading metadata prefixes ("Jawatankuasa ... · Masa: ... · Tempat: ... Agenda Fokus:"),
 * splits by newline or "|", strips leading numbers/bullets ("2.4", "4.1", "•"), and removes
 * mandatory/wajib agenda headings ("Perutusan Pengerusi", "Pengesahan Minit", "Perkara Berbangkit",
 * "Hal-hal Lain", "Penutup").
 */
export function cleanFokusAgendaLines(rawInput: string | string[] | undefined): string[] {
  if (!rawInput) return [];
  const rawCombined = Array.isArray(rawInput) ? rawInput.join('\n') : String(rawInput);

  // Strip leading metadata prefix up to "Agenda Fokus:" or "Fokus Mesyuarat:" if present
  const strippedPrefix = rawCombined
    .replace(
      /^[\s\S]*?(?:Agenda\s*Fokus|Fokus\s*Mesyuarat|Fokus\s*\/\s*Perbincangan\s*Utama(?:\s*Mesyuarat)?)\s*:\s*/i,
      ''
    )
    .replace(/Jawatankuasa[^|\n]*·\s*Masa\s*:[^|\n]*·\s*Tempat\s*:[^|\n.]*[.\s]*/gi, '');

  const segments = strippedPrefix
    .split(/\r?\n|\|/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const wajibRegex =
    /^(?:perutusan\s+pengerusi|pengesahan\s+minit(?:\s+mesyuarat(?:\s+yang\s+lalu|\s+lepas)?)?|perkara[- ]?perkara\s+berbangkit|perkara\s+berbangkit|fokus\s*\/\s*perbincangan\s+utama(?:\s+mesyuarat)?\s*:?|perbincangan\s+utama(?:\s+mesyuarat)?\s*:?|hal[- ]?hal\s+lain|penutup|ucapan\s+penangguhan)$/i;

  const metadataLineRegex =
    /^(?:jawatankuasa|tarikh|masa|tempat|pengerusi|ruj\.?\s*kami|sasaran)\s*:/i;

  const cleaned: string[] = [];
  const seen = new Set<string>();

  for (const seg of segments) {
    let line = seg
      .replace(/Jawatankuasa[^·]*·\s*Masa\s*:[^·]*·\s*Tempat\s*:[^.]*\.\s*/gi, '')
      .replace(/^[\s•\-*–—]+/, '')
      .replace(/^\d+(?:\.\d+)*[.)]?\s+/, '')
      .replace(/^[\s•\-*–—]+/, '')
      .trim();

    if (!line) continue;
    if (wajibRegex.test(line)) continue;
    if (metadataLineRegex.test(line)) continue;
    if (/^·\s*(?:Masa|Tempat|Tarikh)\s*:/i.test(line)) continue;

    const key = line.toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      cleaned.push(line);
    }
  }

  return cleaned;
}

export function cleanFokusAgendaText(rawInput: string | string[] | undefined): string {
  return cleanFokusAgendaLines(rawInput).join('\n');
}

function parseMinitAgendaItemsFromSavedDoc(
  d: AISetiausahaDocument,
  portfolio: FullMySGPortfolioItem,
  academicYear: string
): MinitPKPAAgendaItem[] {
  // 1. Try parsing JSON from `d.rawNotes`
  if (typeof d.rawNotes === 'string' && d.rawNotes.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(d.rawNotes);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((it: any, idx: number) => ({
          id: String(it.id || `ag-${idx + 1}`),
          bil: String(it.bil || `${idx + 1}.0`),
          title: String(it.title || `Agenda ${idx + 1}`),
          rawKeywords: String(it.rawKeywords || ''),
          formalText: String(it.formalText || it.text || ''),
          tindakan: String(it.tindakan || 'Makluman'),
          statusMaklumBalas: String(
            it.statusMaklumBalas ||
              (String(it.tindakan || '').toLowerCase() === 'makluman'
                ? '-'
                : 'Tindakan sedang diambil mengikut ketetapan mesyuarat.')
          ),
        }));
      }
    } catch {
      // Fall through to agendaList parser
    }
  }

  // 2. Fallback: reconstruct from `d.agendaList` if present
  if (Array.isArray(d.agendaList) && d.agendaList.length > 0) {
    return d.agendaList.map((rawLine, idx) => {
      const line = String(rawLine || '').trim();
      const match = /^(\d+(?:\.\d+)?)\s+([^:]+):\s*([\s\S]*)$/.exec(line);
      if (match) {
        const bil = match[1];
        const title = match[2].trim();
        const formalText = match[3].trim();
        const isMakluman = idx === 0 || idx === 1 || idx === d.agendaList!.length - 1;
        return {
          id: `ag-${idx + 1}`,
          bil,
          title,
          rawKeywords: title,
          formalText,
          tindakan: isMakluman ? 'Makluman' : 'Penyelaras & Semua AJK',
          statusMaklumBalas: isMakluman
            ? '-'
            : 'Tindakan sedang dilaksanakan mengikut ketetapan PKPA Bil. 2/1991.',
        };
      }
      return {
        id: `ag-${idx + 1}`,
        bil: `${idx + 1}.0`,
        title: `Perkara ${idx + 1}`,
        rawKeywords: line,
        formalText: line,
        tindakan: idx === 0 ? 'Makluman' : 'Semua AJK',
        statusMaklumBalas: idx === 0 ? '-' : 'Dalam tindakan.',
      };
    });
  }

  // 3. Default PKPA agenda items
  return defaultMinitAgendaItems(portfolio, academicYear);
}

interface Props {
  currentUser: UserProfile;
  schoolSettings?: SchoolSettings | null;
  externalPrefill?: SetiausahaExternalPrefill | null;
  onClearExternalPrefill?: () => void;
}

export const AISetiausahaHub: React.FC<Props> = ({
  currentUser,
  schoolSettings,
  externalPrefill,
  onClearExternalPrefill,
}) => {
  const { schoolCode: activeSchoolCode, schoolName } = useSchoolTenant();
  const effectiveSchoolCode = activeSchoolCode || 'YCC3404';
  const effectiveSchoolName =
    schoolSettings?.schoolName || schoolName || 'SJK (C) CHUNG HUA BALINGIAN';
  const effectiveSchoolLogo =
    schoolSettings?.schoolLogo || (schoolSettings as any)?.logoUrl || '';
  const principalName =
    (schoolSettings as any)?.principalName || 'ENCIK WONG ING SENG';

  // Active sub-module tab
  const [activeTab, setActiveTab] = useState<'OPR' | 'MEMO' | 'MINIT' | 'LANTIKAN'>('OPR');

  // Academic Session (2026 / 2027 / 2028+)
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('2026');
  const [availableYears, setAvailableYears] = useState<string[]>(['2026', '2027', '2028']);
  const [showNewYearInput, setShowNewYearInput] = useState<boolean>(false);
  const [newYearStr, setNewYearStr] = useState<string>('');
  const [archiveSessionScope, setArchiveSessionScope] = useState<'CURRENT' | 'ALL'>('CURRENT');

  // 2-Level Structured Selector state (Level 1 Pillar -> Level 2 Jawatankuasa / Unit)
  const [selectedPillar, setSelectedPillar] = useState<MySGPillar>('KURIKULUM');
  const [selectedKodMySG, setSelectedKodMySG] = useState<string>('JR12 [SU KURIKULUM]');

  // Hydrated 79 MySG Portfolios & Personnel Roster
  const [portfolios, setPortfolios] = useState<FullMySGPortfolioItem[]>(() =>
    hydrate79PortfoliosWithSaved(null)
  );
  const [personnel, setPersonnel] = useState<PersonnelProfile[]>([]);
  const [rawSchoolDocs, setRawSchoolDocs] = useState<AISetiausahaDocument[]>([]);
  const [maklumanMeetings, setMaklumanMeetings] = useState<AISetiausahaDocument[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(false);
  const [bannerMsg, setBannerMsg] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [showArchiveDrawer, setShowArchiveDrawer] = useState<boolean>(false);
  const [sppkModalData, setSppkModalData] = useState<SPPKInitialData | null>(null);

  // -------------------- TAB 1: OPR PINTAR SKPM STATE --------------------
  const [skpmRadarFilter, setSkpmRadarFilter] = useState<string>('Semua');
  const [oprDocId, setOprDocId] = useState<string>('');
  const [oprTitle, setOprTitle] = useState<string>(
    'MESYUARAT & BENGKEL PENYELARASAN JAWATANKUASA KURIKULUM SEKOLAH (JKS)'
  );
  const [oprTarikh, setOprTarikh] = useState<string>(new Date().toISOString().slice(0, 10));
  const [oprMasa, setOprMasa] = useState<string>('02:00 petang – 04:30 petang');
  const [oprTempat, setOprTempat] = useState<string>('Bilik Mesyuarat Utama');
  const [oprSasaran, setOprSasaran] = useState<string>('Semua Guru & Ahli Jawatankuasa');
  const [oprRawNotes, setOprRawNotes] = useState<string>(
    'Penyelarasan DSKP, RPT, PBD/UASA serta peningkatan kualiti PdPc Standard 4.'
  );
  const [oprObjektifText, setOprObjektifText] = useState<string>(
    'Memastikan pelaksanaan kurikulum sekolah diurus secara sistematik, terancang dan mematuhi ketetapan STANDARD 3.1 • ASPEK 3.1.1.\nMeningkatkan penglibatan aktif serta kemenjadian warga sekolah selaras dengan pernyataan kualiti SKPM Kualiti@Sekolah.'
  );
  const [oprPengisianText, setOprPengisianText] = useState<string>(
    'Taklimat hala tuju dan penyelarasan gerak kerja oleh Setiausaha Kurikulum Sekolah.\nPembentangan analisis PBD & UASA serta penyelarasan RPT/RPH mengikut garis panduan KPM.'
  );
  const [oprImpakText, setOprImpakText] = useState<string>(
    '100% objektif program tercapai dengan penglibatan aktif semua guru serta mematuhi piawaian Skor 4 (STANDARD 3.1 • ASPEK 3.1.1).\nPelaksanaan kurikulum diurus secara sistematik dan terancang mengikut dasar KPM.'
  );
  const [oprRefleksiText, setOprRefleksiText] = useState<string>(
    'Kekuatan: Kerjasama erat antara Penyelaras, Ketua Panitia dan Ahli Jawatankuasa melancarkan perjalanan program.\nTindakan Susulan: Pemantauan berkala dan dokumentasi evidens diteruskan bagi mengekalkan kualiti Skor 4 SKPM.'
  );
  const [oprPhotos, setOprPhotos] = useState<string[]>(['', '', '']);
  const [oprPreparedBy, setOprPreparedBy] = useState<string>('');
  const [oprPreparedTitle, setOprPreparedTitle] = useState<string>('');

  // -------------------- TAB 2: MEMO MESYUARAT STATE --------------------
  const [memoDocId, setMemoDocId] = useState<string>('');
  const [memoTitle, setMemoTitle] = useState<string>(
    'MESYUARAT JAWATANKUASA KURIKULUM SEKOLAH (JKS) BIL. 1/2026'
  );
  const [memoRujKami, setMemoRujKami] = useState<string>('YCC3404/600-1/1/01');
  const [memoBilangan, setMemoBilangan] = useState<string>('Bil. 1/2026');
  const [memoTarikhSurat, setMemoTarikhSurat] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [memoTarikhMesyuarat, setMemoTarikhMesyuarat] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [memoMasa, setMemoMasa] = useState<string>('2:15 petang');
  const [memoTempat, setMemoTempat] = useState<string>('Bilik Mesyuarat SJK(C) Chung Hua Balingian');
  const [memoPengerusi, setMemoPengerusi] = useState<string>(principalName);
  const [memoJawatanPengerusi, setMemoJawatanPengerusi] = useState<string>('Guru Besar');
  const [memoRecipientMode, setMemoRecipientMode] = useState<'COMMITTEE_ONLY' | 'ALL_TEACHERS'>(
    'COMMITTEE_ONLY'
  );
  const [memoSelectedTeachers, setMemoSelectedTeachers] = useState<InvitedCommitteeTeacher[]>([]);
  const [memoAiHint, setMemoAiHint] = useState<string>('');
  const [memoFokusText, setMemoFokusText] = useState<string>(
    'Penyelarasan Takwim & Ketetapan Pelaksanaan Unit Sesi 2026\nPembentangan Sasaran KPI & Pelan Strategik Organisasi (PSO)\nPenyelarasan Dokumentasi Evidens One Page Report (OPR) SKPM Kualiti@Sekolah\nPengurusan PCG, BBM & Penyeliaan Berkala'
  );

  // -------------------- TAB 3: MINIT PKPA 2/1991 STATE --------------------
  const [minitDocId, setMinitDocId] = useState<string>('');
  const [minitSourceMemoId, setMinitSourceMemoId] = useState<string>('');
  const [minitViewMode, setMinitViewMode] = useState<'BOTH' | 'MINIT_ONLY' | 'MAKLUM_BALAS_ONLY'>(
    'BOTH'
  );
  const [minitTitle, setMinitTitle] = useState<string>(
    'MINIT MESYUARAT JAWATANKUASA KURIKULUM SEKOLAH (JKS) BIL. 1/2026'
  );
  const [minitTarikh, setMinitTarikh] = useState<string>(new Date().toISOString().slice(0, 10));
  const [minitMasa, setMinitMasa] = useState<string>('2:15 petang – 4:15 petang');
  const [minitTempat, setMinitTempat] = useState<string>('Bilik Mesyuarat SJK(C) Chung Hua Balingian');
  const [minitPengerusi, setMinitPengerusi] = useState<string>(
    `${principalName} (Guru Besar)`
  );
  const [minitPencatat, setMinitPencatat] = useState<string>('');
  const [minitTurutHadir, setMinitTurutHadir] = useState<string>('');
  const [minitAttendance, setMinitAttendance] = useState<MinitAttendanceRecord[]>([]);
  const [minitAgendaItems, setMinitAgendaItems] = useState<MinitPKPAAgendaItem[]>([]);

  // -------------------- TAB 4: SURAT LANTIKAN MYSG STATE --------------------
  const [lantikanMode, setLantikanMode] = useState<'INDIVIDU_BERSEPADU' | 'IKUT_PORTFOLIO'>(
    'INDIVIDU_BERSEPADU'
  );
  const [lantikanTeacherKey, setLantikanTeacherKey] = useState<string>('');
  const [lantikanTarikhSurat, setLantikanTarikhSurat] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [lantikanRujKami, setLantikanRujKami] = useState<string>('YCC3404/500-MYSG/2026(01)');

  // Requirement 4: Use ONLY real teachers loaded from Firestore `personnel` when non-empty
  const teacherRoster = useMemo(() => {
    const map = new Map<string, { id: string; name: string; role: string }>();
    if (personnel.length > 0) {
      personnel.forEach((p) => {
        const nameUp = String(p.name || '').trim().toUpperCase();
        if (!nameUp) return;
        map.set(nameUp, {
          id: p.id || nameUp,
          name: nameUp,
          role: (p as any).position || (p as any).role || 'Guru Akademik Biasa',
        });
      });
      return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    OFFICIAL_TEACHERS.forEach((ot) => {
      const nameUp = String(ot.name || '').trim().toUpperCase();
      if (!nameUp || map.has(nameUp)) return;
      map.set(nameUp, {
        id: (ot as any).code || (ot as any).shortCode || nameUp,
        name: nameUp,
        role: ot.position || 'Guru Akademik Biasa',
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [personnel]);

  // Currently selected Level 2 portfolio
  const selectedPortfolio = useMemo(() => {
    return (
      portfolios.find((p) => p.kodMySG === selectedKodMySG) ||
      portfolios.find((p) => p.pillar === selectedPillar) ||
      portfolios[0]
    );
  }, [portfolios, selectedKodMySG, selectedPillar]);

  // Portfolios under the selected Level 1 Pillar
  const pillarPortfolios = useMemo(() => {
    return portfolios.filter((p) => p.pillar === selectedPillar);
  }, [portfolios, selectedPillar]);

  // Pillar counts (22, 22, 19, 16)
  const pillarCounts = useMemo(() => {
    return {
      PENTADBIRAN: portfolios.filter((p) => p.pillar === 'PENTADBIRAN').length,
      KURIKULUM: portfolios.filter((p) => p.pillar === 'KURIKULUM').length,
      HEM: portfolios.filter((p) => p.pillar === 'HEM').length,
      KOKURIKULUM: portfolios.filter((p) => p.pillar === 'KOKURIKULUM').length,
    };
  }, [portfolios]);

  // Compute assigned Penyelaras + Ahli Jawatankuasa (AJK) for the active portfolio
  const currentCommitteeMembers = useMemo((): InvitedCommitteeTeacher[] => {
    if (!selectedPortfolio) return [];
    const list: InvitedCommitteeTeacher[] = [];
    const seen = new Set<string>();

    if (selectedPortfolio.assignedTeacherName) {
      const nameUp = String(selectedPortfolio.assignedTeacherName || '').trim().toUpperCase();
      if (nameUp) {
        seen.add(nameUp);
        list.push({
          teacherId: selectedPortfolio.assignedTeacherId || nameUp,
          teacherName: nameUp,
          committeeRole: `Penyelaras / ${selectedPortfolio.jawatanRasmi}`,
        });
      }
    }

    (selectedPortfolio.ahliList || []).forEach((ahli) => {
      if (!ahli) return;
      const nameUp = String(ahli.teacherName || (ahli as any).name || '').trim().toUpperCase();
      if (!nameUp || seen.has(nameUp)) return;
      seen.add(nameUp);
      list.push({
        teacherId: ahli.teacherId || nameUp,
        teacherName: nameUp,
        committeeRole: 'Ahli Jawatankuasa (AJK)',
      });
    });

    return list;
  }, [selectedPortfolio]);

  // Load all data from Firestore (`academic_years`, `personnel`, `mysg_jawatankuasa_assignments`, `ai_setiausaha_documents`, `makluman_tasks`)
  const loadHubData = async () => {
    setLoadingData(true);
    try {
      const aySlug = (selectedAcademicYear || '2026').replace(/\//g, '-');
      const assignDocId = `${effectiveSchoolCode}_${aySlug}`;
      const govDocId = scopedDocId(effectiveSchoolCode, `mysg_jawatankuasa_${aySlug}`);

      const [yrSnap, pSnap, assignSnap, govSnap, docsSnap, maklumanSnap] = await Promise.all([
        getDocs(collection(db, 'academic_years')).catch(() => null),
        getDocs(collection(db, 'personnel')).catch(() => null),
        getDoc(doc(db, 'mysg_jawatankuasa_assignments', assignDocId)).catch(() => null),
        getDoc(doc(db, 'school_governance', govDocId)).catch(() => null),
        getDocs(collection(db, 'ai_setiausaha_documents')).catch(() => null),
        getDocs(collection(db, 'makluman_tasks')).catch(() => null),
      ]);

      if (yrSnap) {
        const yrList = yrSnap.docs
          .filter((d) => belongsToSchool(d.data() as any, effectiveSchoolCode))
          .map((d) => String((d.data() as any).year || '').trim())
          .filter(Boolean);
        setAvailableYears(
          Array.from(new Set(['2026', '2027', '2028', ...yrList])).sort((a, b) =>
            a.localeCompare(b)
          )
        );
      }

      if (pSnap && !pSnap.empty) {
        const scopedP = pSnap.docs
          .filter((d) => belongsToSchool(d.data() as any, effectiveSchoolCode))
          .map((d) => ({ ...(d.data() as any), id: d.id } as PersonnelProfile))
          .filter((p) => Boolean(p.name));
        scopedP.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        setPersonnel(scopedP);
      }

      if (
        assignSnap?.exists() &&
        Array.isArray(assignSnap.data()?.items) &&
        assignSnap.data().items.length > 0
      ) {
        setPortfolios(hydrate79PortfoliosWithSaved(assignSnap.data().items));
      } else if (
        govSnap?.exists() &&
        Array.isArray(govSnap.data()?.items) &&
        govSnap.data().items.length > 0
      ) {
        setPortfolios(hydrate79PortfoliosWithSaved(govSnap.data().items));
      } else {
        setPortfolios(hydrate79PortfoliosWithSaved(null));
      }

      if (docsSnap) {
        const normalizedDocs = docsSnap.docs
          .map((d) => {
            const dataObj = (d.data() || {}) as any;
            const safeTitle = String(
              dataObj.programTitle ||
                dataObj.title ||
                dataObj.tajukProgram ||
                dataObj.tajuk ||
                'DOKUMEN RASMI SEKOLAH'
            ).trim();
            const safeTarikh = String(
              dataObj.tarikh || dataObj.date || new Date().toISOString().slice(0, 10)
            ).trim();
            const raw = {
              ...dataObj,
              id: d.id,
              programTitle: safeTitle,
              tarikh: safeTarikh,
            } as AISetiausahaDocument;
            const agendaCombined = [
              ...(Array.isArray(raw.agendaList) ? raw.agendaList : []),
              typeof raw.rawNotes === 'string' ? raw.rawNotes : '',
              ...(Array.isArray(raw.objektif) ? raw.objektif : []),
              ...(Array.isArray(raw.pengisianAktiviti) ? raw.pengisianAktiviti : []),
            ].join(' ');
            const resolved = resolveDocumentSessions({
              title: safeTitle,
              agendaText: agendaCombined,
              tarikh: safeTarikh,
              savedAcademicYear: raw.academicYear,
              savedAcademicYears: raw.academicYears,
              fallbackYear: selectedAcademicYear,
            });
            return {
              ...raw,
              programTitle: safeTitle,
              tarikh: safeTarikh,
              academicYear: resolved.primaryYear,
              academicYears: resolved.academicYears,
            } as AISetiausahaDocument;
          })
          .filter((d) => belongsToSchool(d as any, effectiveSchoolCode))
          .sort((a, b) => String(b.tarikh || '').localeCompare(String(a.tarikh || '')));
        setRawSchoolDocs(normalizedDocs);
      }

      if (maklumanSnap) {
        const meetingItems: AISetiausahaDocument[] = maklumanSnap.docs
          .map((d) => ({ ...(d.data() as any), id: d.id }))
          .filter(
            (m: any) =>
              belongsToSchool(m, effectiveSchoolCode) &&
              String(m.category || '').toUpperCase() === 'MESYUARAT'
          )
          .map((m: any) => {
            const agendaStr = Array.isArray(m.agendaList)
              ? m.agendaList.join('\n')
              : String(m.description || m.arahanTindakan || '');
            const resolved = resolveDocumentSessions({
              title: m.title,
              agendaText: agendaStr,
              tarikh: m.dueDate,
              savedAcademicYear: m.academicYear,
              savedAcademicYears: m.academicYears,
              fallbackYear: selectedAcademicYear,
            });
            const invitedFromMakluman: InvitedCommitteeTeacher[] = Array.isArray(m.invitedTeachers)
              ? m.invitedTeachers
              : Array.isArray(m.targetTeachers)
              ? m.targetTeachers.map((tName: string) => ({
                  teacherId: tName,
                  teacherName: String(tName).toUpperCase(),
                  committeeRole: 'Ahli Mesyuarat',
                }))
              : [];
            const rawAgendaSource = Array.isArray(m.agendaList)
              ? m.agendaList
              : m.description
              ? [String(m.description)]
              : [];
            return {
              id: `makluman_ref_${m.id}`,
              docKind: 'MEMO' as const,
              sourceModule: 'MAKLUMAN_TASK',
              sourceMemoId: m.sourceMemoId || m.id,
              schoolCode: effectiveSchoolCode,
              academicYear: resolved.primaryYear,
              academicYears: resolved.academicYears,
              pillar: m.pillar || m.domain || 'PENTADBIRAN',
              kodMySG: m.kodMySG || '',
              jawatankuasaInduk: m.jawatankuasaInduk || m.tindakanLabel || 'Jawatankuasa Sekolah',
              programTitle: String(m.title || 'MESYUARAT SEKOLAH').toUpperCase(),
              tarikh: m.dueDate || new Date().toISOString().slice(0, 10),
              masa: m.masa || m.dueTime || '2:15 petang',
              tempat: m.venue || m.location || 'Bilik Mesyuarat',
              agendaList: cleanFokusAgendaLines(rawAgendaSource),
              invitedTeachers: invitedFromMakluman,
            };
          });
        setMaklumanMeetings(meetingItems);
      }
    } catch (e) {
      console.warn('Error loading AISetiausahaHub data:', e);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    loadHubData();
  }, [effectiveSchoolCode, selectedAcademicYear]);

  // Filter `rawSchoolDocs` by `selectedAcademicYear` (matching ANY year in `academicYears`) or show all when `archiveSessionScope === 'ALL'`
  const allDocs = useMemo(() => {
    if (archiveSessionScope === 'ALL') return rawSchoolDocs;
    const yr = selectedAcademicYear.slice(0, 4);
    return rawSchoolDocs.filter((d) => {
      const yrs =
        Array.isArray(d.academicYears) && d.academicYears.length > 0
          ? d.academicYears
          : [d.academicYear || '2026'];
      return yrs.some((y) => y === selectedAcademicYear || String(y).startsWith(yr));
    });
  }, [rawSchoolDocs, selectedAcademicYear, archiveSessionScope]);

  // Synchronize default fields ONLY when no saved document (`oprDocId`, `memoDocId`, `minitDocId`, `minitSourceMemoId`) is active
  useEffect(() => {
    if (!selectedPortfolio) return;

    const assignedCoordinator =
      selectedPortfolio.assignedTeacherName ||
      (currentUser?.name || 'SETIAUSAHA PROGRAM').toUpperCase();

    if (!oprDocId) {
      setOprTitle(`PROGRAM & PENYELARASAN ${selectedPortfolio.jawatankuasaInduk.toUpperCase()}`);
      setOprPreparedBy(assignedCoordinator);
      setOprPreparedTitle(selectedPortfolio.jawatanRasmi);
      const drafted = autoDraftOPRSkor4({
        programTitle: `PROGRAM & PENYELARASAN ${selectedPortfolio.jawatankuasaInduk.toUpperCase()}`,
        portfolio: selectedPortfolio,
        sasaran: oprSasaran,
        tempat: oprTempat,
        rawNotes: '',
      });
      setOprObjektifText(drafted.objektif.join('\n'));
      setOprPengisianText(drafted.pengisian.join('\n'));
      setOprImpakText(drafted.impak.join('\n'));
      setOprRefleksiText(drafted.refleksi.join('\n'));
    }

    if (!memoDocId) {
      setMemoTitle(
        `MESYUARAT ${selectedPortfolio.jawatankuasaInduk.toUpperCase()} BIL. 1/${selectedAcademicYear}`
      );
      setMemoBilangan(`Bil. 1/${selectedAcademicYear}`);
      setMemoRujKami(`${effectiveSchoolCode}/${selectedPortfolio.fileRefPrefix}/01`);

      if (currentCommitteeMembers.length > 0) {
        setMemoRecipientMode('COMMITTEE_ONLY');
        setMemoSelectedTeachers(currentCommitteeMembers);
      } else {
        setMemoRecipientMode('ALL_TEACHERS');
        setMemoSelectedTeachers(
          teacherRoster.map((t) => ({
            teacherId: t.id,
            teacherName: t.name,
            committeeRole: t.role,
          }))
        );
      }
    }

    if (!minitSourceMemoId && !minitDocId) {
      setMinitTitle(
        `MINIT MESYUARAT ${selectedPortfolio.jawatankuasaInduk.toUpperCase()} BIL. 1/${selectedAcademicYear}`
      );
      setMinitPencatat(`${assignedCoordinator} (${selectedPortfolio.jawatanRasmi})`);
      setMinitAgendaItems(defaultMinitAgendaItems(selectedPortfolio, selectedAcademicYear));

      const baseRoster =
        currentCommitteeMembers.length > 0
          ? currentCommitteeMembers
          : teacherRoster.map((t) => ({
              teacherId: t.id,
              teacherName: t.name,
              committeeRole: t.role,
            }));
      setMinitAttendance(
        baseRoster.map((m) => ({
          teacherId: m.teacherId,
          teacherName: m.teacherName,
          committeeRole: m.committeeRole,
          status: 'HADIR',
        }))
      );
    }
  }, [selectedPortfolio, selectedAcademicYear, currentCommitteeMembers, teacherRoster]);

  // Handle external prefill from `PaparanMaklumanView` (`📩 Memo` & `📝 Minit` buttons)
  useEffect(() => {
    if (!externalPrefill || !externalPrefill.taskItem) return;
    const task = externalPrefill.taskItem;
    const resolved = resolveDocumentSessions({
      title: task.title,
      agendaText: task.description || task.arahanTindakan || '',
      tarikh: task.dueDate,
      fallbackYear: selectedAcademicYear,
    });
    if (resolved.primaryYear && availableYears.includes(resolved.primaryYear)) {
      setSelectedAcademicYear(resolved.primaryYear);
    }

    const invited: InvitedCommitteeTeacher[] =
      Array.isArray(task.invitedTeachers) && task.invitedTeachers.length > 0
        ? task.invitedTeachers
        : currentCommitteeMembers.length > 0
        ? currentCommitteeMembers
        : teacherRoster.map((t) => ({
            teacherId: t.id,
            teacherName: t.name,
            committeeRole: t.role,
          }));

    const rawPrefillAgenda = Array.isArray(task.agendaList)
      ? task.agendaList
      : task.description
      ? [String(task.description)]
      : [];

    const syntheticMemo: AISetiausahaDocument = {
      id: task.sourceMemoId || `makluman_ref_${task.id}`,
      docKind: 'MEMO',
      schoolCode: effectiveSchoolCode,
      academicYear: resolved.primaryYear,
      academicYears: resolved.academicYears,
      kodMySG: task.kodMySG || selectedPortfolio?.kodMySG,
      jawatankuasaInduk: task.jawatankuasaInduk || selectedPortfolio?.jawatankuasaInduk,
      programTitle: String(task.title || 'MESYUARAT SEKOLAH').toUpperCase(),
      tarikh: task.dueDate || new Date().toISOString().slice(0, 10),
      masa: task.dueTime || task.masa || '2:15 petang',
      tempat: task.location || task.venue || 'Bilik Mesyuarat',
      agendaList: cleanFokusAgendaLines(rawPrefillAgenda),
      invitedTeachers: invited,
    };

    if (externalPrefill.targetTab === 'MINIT') {
      handleImportMemoIntoMinit(syntheticMemo);
    } else if (externalPrefill.targetTab === 'MEMO') {
      handleLoadSavedMemo(syntheticMemo);
    } else {
      setActiveTab('OPR');
    }
    if (onClearExternalPrefill) onClearExternalPrefill();
  }, [externalPrefill]);

  // Set initial teacher for Surat Lantikan
  useEffect(() => {
    if (!lantikanTeacherKey && teacherRoster.length > 0) {
      const firstAssigned =
        portfolios.find((p) => Boolean(p.assignedTeacherName))?.assignedTeacherName ||
        teacherRoster[0].name;
      setLantikanTeacherKey(firstAssigned);
    }
  }, [teacherRoster, portfolios, lantikanTeacherKey]);

  const handleAddCustomYear = async () => {
    const clean = newYearStr.trim();
    if (!clean) return;
    try {
      const docId = scopedDocId(effectiveSchoolCode, clean);
      await setDoc(
        doc(db, 'academic_years', docId),
        {
          id: docId,
          schoolCode: effectiveSchoolCode,
          year: clean,
          status: 'planning',
        },
        { merge: true }
      ).catch(() => null);
      setAvailableYears((prev) =>
        Array.from(new Set([...prev, clean])).sort((a, b) => a.localeCompare(b))
      );
      setSelectedAcademicYear(clean);
    } finally {
      setNewYearStr('');
      setShowNewYearInput(false);
    }
  };

  // Filtered documents by kind (and merged Makluman meetings for Memo import)
  const oprDocs = useMemo(() => allDocs.filter((d) => d.docKind === 'OPR'), [allDocs]);
  const memoDocs = useMemo(() => {
    const savedMemos = allDocs.filter((d) => d.docKind === 'MEMO');
    const savedTitles = new Set(
      savedMemos
        .map((m) => String(m.programTitle || '').trim().toUpperCase())
        .filter(Boolean)
    );
    const extraMakluman = maklumanMeetings.filter((m) => {
      const mTitle = String(m.programTitle || '').trim().toUpperCase();
      if (mTitle && savedTitles.has(mTitle)) return false;
      if (archiveSessionScope === 'ALL') return true;
      const yrs = m.academicYears || [m.academicYear || '2026'];
      return yrs.includes(selectedAcademicYear);
    });
    return [...savedMemos, ...extraMakluman];
  }, [allDocs, maklumanMeetings, archiveSessionScope, selectedAcademicYear]);
  const minitDocs = useMemo(() => allDocs.filter((d) => d.docKind === 'MINIT'), [allDocs]);

  // SKPM Radar counts across OPR docs
  const skpmRadarCounts = useMemo(() => {
    const matchBucket = (d: AISetiausahaDocument, key: string): boolean => {
      const combined = `${d.skpmBucket || ''} ${d.secondarySkpmBucket || ''} ${(d.additionalSkpmBuckets || []).join(' ')} ${d.skpmCodeBadge || ''} ${d.skpmStandard || ''}`.toUpperCase();
      if (key === 'Semua') return true;
      if (key === 'Std 1') return /STD 1|STANDARD 1|1\.1|1\.2/.test(combined);
      if (key === 'Std 2') return /STD 2|STANDARD 2|2\.1|2\.2|2\.3|2\.4|2\.5|2\.6|2\.7/.test(combined);
      if (key === 'Std 3.1') return /3\.1|KURIKULUM/.test(combined);
      if (key === 'Std 3.2') return /3\.2|KOKURIKULUM/.test(combined);
      if (key === 'Std 3.3') return /3\.3|HEM|HAL EHWAL MURID/.test(combined);
      if (key === 'Std 4') return /STD 4|STANDARD 4|PDPC|4\.1/.test(combined);
      if (key === 'Std 5') return /STD 5|STANDARD 5|5\.1|5\.2|5\.3/.test(combined);
      return false;
    };
    const buckets = ['Semua', 'Std 1', 'Std 2', 'Std 3.1', 'Std 3.2', 'Std 3.3', 'Std 4', 'Std 5'];
    const counts: Record<string, number> = {};
    buckets.forEach((b) => {
      counts[b] = oprDocs.filter((d) => matchBucket(d, b)).length;
    });
    return { counts, matchBucket };
  }, [oprDocs]);

  const filteredOprDocs = useMemo(() => {
    return oprDocs.filter((d) => skpmRadarCounts.matchBucket(d, skpmRadarFilter));
  }, [oprDocs, skpmRadarCounts, skpmRadarFilter]);

  // -------------------- ACTION HANDLERS --------------------
  const handlePhotoUpload = (slotIndex: number, file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = String(ev.target?.result || '');
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 640;
        let w = img.width;
        let h = img.height;
        if (w > h && w > maxDim) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else if (h >= w && h > maxDim) {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const compressed = canvas.toDataURL('image/jpeg', 0.78);
          setOprPhotos((prev) => {
            const next = [...prev];
            next[slotIndex] = compressed;
            return next;
          });
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleAutoFormalizeOPR = () => {
    if (!selectedPortfolio) return;
    const drafted = autoDraftOPRSkor4({
      programTitle: oprTitle,
      portfolio: selectedPortfolio,
      sasaran: oprSasaran,
      tempat: oprTempat,
      rawNotes: oprRawNotes,
    });
    setOprObjektifText(drafted.objektif.join('\n'));
    setOprPengisianText(drafted.pengisian.join('\n'));
    setOprImpakText(drafted.impak.join('\n'));
    setOprRefleksiText(drafted.refleksi.join('\n'));
    setBannerMsg({
      type: 'success',
      text: `Rubrik Skor 4 SKPM (${selectedPortfolio.skpmCodeDisplay}) berjaya dijana secara automatik!`,
    });
  };

  const [syncingDriveDocId, setSyncingDriveDocId] = useState<string | null>(null);

  const handleSyncSavedDocToDrive = async (
    d: AISetiausahaDocument,
    elementId?: string,
    silentSuccessPrefix?: string
  ) => {
    setSyncingDriveDocId(d.id);
    try {
      const summaryLines = [
        ...(d.objektif || []).map((x) => `Objektif: ${x}`),
        ...(d.pengisianAktiviti || []).map((x) => `Aktiviti: ${x}`),
        ...(d.impak || []).map((x) => `Impak: ${x}`),
        ...(d.agendaList || []).map((x) => `Agenda: ${x}`),
      ];
      const fallbackHtml = buildFallbackDriveHtml({
        schoolCode: d.schoolCode || effectiveSchoolCode,
        academicYear: d.academicYear || selectedAcademicYear,
        docKind: d.docKind,
        skpmBucket: d.skpmBucket,
        skpmCodeBadge: d.skpmCodeBadge,
        programTitle: d.programTitle,
        tarikh: d.tarikh,
        summaryLines,
      });

      const res = await syncDocumentToSchoolDrive({
        schoolCode: d.schoolCode || effectiveSchoolCode,
        academicYear: d.academicYear || selectedAcademicYear,
        docKind: d.docKind,
        skpmBucket: d.skpmBucket || selectedPortfolio?.skpmBucket || 'STD_3_1_KURIKULUM',
        skpmCodeBadge: d.skpmCodeBadge || selectedPortfolio?.skpmCodeDisplay || d.docKind,
        programTitle: d.programTitle,
        tarikh: d.tarikh,
        elementId,
        htmlContent: elementId ? undefined : fallbackHtml,
        photos: d.photos || [],
      });

      if (res.success) {
        const nowIso = new Date().toISOString();
        if (!String(d.id || '').startsWith('MAKLUMAN_MEMO_')) {
          await setDoc(
            doc(db, 'ai_setiausaha_documents', d.id),
            deepSanitizeFirestore({
              driveFolderUrl: res.folderUrl || '',
              driveFileUrl: res.fileUrl || res.folderUrl || '',
              driveFolderPath: res.folderPath || '',
              driveSyncedAt: nowIso,
              updatedAt: nowIso,
            }),
            { merge: true }
          );
        }
        await loadHubData();
        setBannerMsg({
          type: 'success',
          text: silentSuccessPrefix
            ? `${silentSuccessPrefix} & disegerakkan ke Google Drive Rasmi Sekolah!`
            : `☁️ "${d.programTitle}" berjaya dihantar ke Google Drive Rasmi Sekolah!`,
        });
      } else if (!silentSuccessPrefix) {
        setBannerMsg({
          type: 'info',
          text: `Simpanan tempatan selesai. Status Drive Sekolah: ${res.error || 'Sila semak sambungan Webhook.'}`,
        });
      }
    } catch (err: any) {
      if (!silentSuccessPrefix) {
        setBannerMsg({
          type: 'info',
          text: `Gagal menghantar ke Google Drive Sekolah: ${err?.message || 'Ralat rangkaian'}`,
        });
      }
    } finally {
      setSyncingDriveDocId(null);
    }
  };

  const handleSaveOPR = async () => {
    if (!oprTitle.trim() || !selectedPortfolio) return;
    const resolvedSession = resolveDocumentSessions({
      title: oprTitle,
      agendaText: `${oprRawNotes} ${oprObjektifText} ${oprPengisianText}`,
      tarikh: oprTarikh,
      fallbackYear: selectedAcademicYear,
    });
    const docId =
      oprDocId ||
      scopedDocId(
        effectiveSchoolCode,
        `opr_${resolvedSession.primaryYear}_${Date.now()}`
      );
    const existingDoc = allDocs.find((x) => x.id === docId);
    const payload: AISetiausahaDocument = {
      id: docId,
      docKind: 'OPR',
      schoolCode: effectiveSchoolCode,
      academicYear: resolvedSession.primaryYear,
      academicYears: resolvedSession.academicYears,
      pillar: selectedPortfolio.pillar,
      kodMySG: selectedPortfolio.kodMySG,
      jawatankuasaInduk: selectedPortfolio.jawatankuasaInduk,
      jawatanRasmi: selectedPortfolio.jawatanRasmi,
      skpmBucket: selectedPortfolio.skpmBucket,
      skpmCodeBadge: selectedPortfolio.skpmCodeDisplay,
      skpmStandard: selectedPortfolio.skpmStandardTitle,
      skpmAspek: selectedPortfolio.skpmAspekTitle,
      skpmStandardKualiti: selectedPortfolio.skpmKualitiStatement,
      programTitle: oprTitle.trim().toUpperCase(),
      tarikh: oprTarikh,
      masa: oprMasa.trim(),
      tempat: oprTempat.trim(),
      sasaran: oprSasaran.trim(),
      rawNotes: oprRawNotes,
      objektif: oprObjektifText
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean),
      pengisianAktiviti: oprPengisianText
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean),
      impak: oprImpakText
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean),
      refleksiDanTindakanSusulan: oprRefleksiText
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean),
      photos: oprPhotos.filter(Boolean),
      preparedByName: (oprPreparedBy || currentUser?.name || 'SETIAUSAHA').toUpperCase(),
      preparedByTitle: oprPreparedTitle || selectedPortfolio.jawatanRasmi,
      driveFolderUrl: existingDoc?.driveFolderUrl,
      driveFileUrl: existingDoc?.driveFileUrl,
      driveFolderPath: existingDoc?.driveFolderPath,
      driveSyncedAt: existingDoc?.driveSyncedAt,
      createdAt: existingDoc?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await setDoc(doc(db, 'ai_setiausaha_documents', docId), deepSanitizeFirestore(payload), {
      merge: true,
    });
    setOprDocId(docId);
    await loadHubData();
    setBannerMsg({
      type: 'success',
      text: `Poster OPR "${payload.programTitle}" telah disimpan ke Arkib (${resolvedSession.badgeLabel}). Menyegerak ke Google Drive Sekolah...`,
    });
    void handleSyncSavedDocToDrive(
      payload,
      'ai-setiausaha-opr-poster',
      `Poster OPR "${payload.programTitle}" telah disimpan (${resolvedSession.badgeLabel})`
    );
  };

  const handleLoadSavedOPR = (d: AISetiausahaDocument) => {
    setOprDocId(d.id);
    if (d.kodMySG) {
      const matched = portfolios.find((p) => p.kodMySG === d.kodMySG);
      if (matched) {
        setSelectedPillar(matched.pillar);
        setSelectedKodMySG(matched.kodMySG);
      }
    }
    setOprTitle(d.programTitle || '');
    setOprTarikh(d.tarikh || new Date().toISOString().slice(0, 10));
    setOprMasa(d.masa || '08:00 pagi – 12:00 tengah hari');
    setOprTempat(d.tempat || effectiveSchoolName);
    setOprSasaran(d.sasaran || 'Semua Guru & Murid');
    setOprRawNotes(d.rawNotes || '');
    setOprObjektifText((d.objektif || []).join('\n'));
    setOprPengisianText((d.pengisianAktiviti || []).join('\n'));
    setOprImpakText((d.impak || []).join('\n'));
    setOprRefleksiText((d.refleksiDanTindakanSusulan || []).join('\n'));
    const loadedPhotos = d.photos || [];
    setOprPhotos([loadedPhotos[0] || '', loadedPhotos[1] || '', loadedPhotos[2] || '']);
    setOprPreparedBy(d.preparedByName || '');
    setOprPreparedTitle(d.preparedByTitle || '');
    setActiveTab('OPR');
  };

  const handleLoadSavedMemo = (d: AISetiausahaDocument) => {
    setMemoDocId(d.id.startsWith('makluman_ref_') ? '' : d.id);
    if (d.kodMySG) {
      const matched = portfolios.find((p) => p.kodMySG === d.kodMySG);
      if (matched) {
        setSelectedPillar(matched.pillar);
        setSelectedKodMySG(matched.kodMySG);
      }
    }
    setMemoTitle(d.programTitle || '');
    if (d.skpmCodeBadge) setMemoRujKami(d.skpmCodeBadge);
    setMemoTarikhMesyuarat(d.tarikh || new Date().toISOString().slice(0, 10));
    setMemoMasa(d.masa || '2:15 petang');
    setMemoTempat(d.tempat || 'Bilik Mesyuarat');
    if (Array.isArray(d.invitedTeachers) && d.invitedTeachers.length > 0) {
      setMemoSelectedTeachers(d.invitedTeachers);
    }
    if (Array.isArray(d.agendaList) && d.agendaList.length > 0) {
      const sanitized = cleanFokusAgendaText(d.agendaList);
      if (sanitized) setMemoFokusText(sanitized);
    }
    setActiveTab('MEMO');
  };

  // Requirement 2: Full restoration of saved Minit Mesyuarat including `rawNotes` agenda items & Borang Maklum Balas
  const handleLoadSavedMinit = (d: AISetiausahaDocument) => {
    setMinitDocId(d.id);
    setMinitSourceMemoId(d.sourceMemoId || '');
    const activePort =
      (d.kodMySG ? portfolios.find((p) => p.kodMySG === d.kodMySG) : undefined) ||
      selectedPortfolio;
    if (activePort) {
      setSelectedPillar(activePort.pillar);
      setSelectedKodMySG(activePort.kodMySG);
    }
    setMinitTitle(d.programTitle || '');
    setMinitTarikh(d.tarikh || new Date().toISOString().slice(0, 10));
    setMinitMasa(d.masa || '2:15 petang – 4:15 petang');
    setMinitTempat(d.tempat || 'Bilik Mesyuarat');
    setMinitPengerusi(d.pengerusi || `${principalName} (Guru Besar)`);
    setMinitPencatat(
      d.preparedByName
        ? d.preparedByTitle && !d.preparedByName.includes('(')
          ? `${d.preparedByName} (${d.preparedByTitle})`
          : d.preparedByName
        : `${currentUser?.name || 'SETIAUSAHA'} (${activePort?.jawatanRasmi || 'Setiausaha'})`
    );
    if (Array.isArray(d.attendanceList) && d.attendanceList.length > 0) {
      setMinitAttendance(d.attendanceList);
    }
    const restoredAgendas = parseMinitAgendaItemsFromSavedDoc(
      d,
      activePort,
      d.academicYear || selectedAcademicYear
    );
    setMinitAgendaItems(restoredAgendas);
    setActiveTab('MINIT');
    setBannerMsg({
      type: 'info',
      text: `Minit "${d.programTitle}" (${restoredAgendas.length} agenda & Borang Maklum Balas) dibuka semula dengan lengkap.`,
    });
  };

  const handleCadangAgendaPintar = () => {
    if (!selectedPortfolio) return;
    const hintParts = memoAiHint
      .split(/[,;\n|]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((h) => {
        const cap = h.charAt(0).toUpperCase() + h.slice(1);
        return /penyelarasan|pembentangan|perbincangan|analisis|semakan|persediaan/i.test(cap)
          ? cap
          : `Perbincangan & Penyelarasan: ${cap}`;
      });

    const defaultItems = [
      `Penyelarasan Takwim Tahunan & Ketetapan Pelaksanaan ${selectedPortfolio.jawatankuasaInduk} Sesi ${selectedAcademicYear}`,
      `Semakan Sasaran KPI, Pelan Strategik Organisasi (PSO) & Agihan Tugas Penyelaras / AJK (${selectedPortfolio.kodMySG})`,
      `Penyelarasan Pengumpulan Evidens One Page Report (OPR) bagi ${selectedPortfolio.skpmCodeDisplay}`,
      `Pengurusan Peruntukan Kewangan / PCG, Bahan Bantu Mengajar & Dokumentasi Fail Induk`,
    ];

    const merged = cleanFokusAgendaLines([...hintParts, ...defaultItems]);
    setMemoFokusText(merged.join('\n'));
    setBannerMsg({
      type: 'info',
      text: `Agenda fokus perbincangan bagi ${selectedPortfolio.jawatankuasaInduk} telah dijana (tanpa item wajib berulang).`,
    });
  };

  const handleToggleMemoTeacher = (teacher: { id: string; name: string; role: string }) => {
    const exists = memoSelectedTeachers.some(
      (t) => t.teacherName.toUpperCase() === teacher.name.toUpperCase()
    );
    if (exists) {
      setMemoSelectedTeachers((prev) =>
        prev.filter((t) => t.teacherName.toUpperCase() !== teacher.name.toUpperCase())
      );
    } else {
      const jkMatch = currentCommitteeMembers.find(
        (m) => m.teacherName.toUpperCase() === teacher.name.toUpperCase()
      );
      setMemoSelectedTeachers((prev) => [
        ...prev,
        {
          teacherId: teacher.id,
          teacherName: teacher.name,
          committeeRole: jkMatch?.committeeRole || teacher.role || 'Ahli Jawatankuasa (AJK)',
        },
      ]);
    }
  };

  const handleSaveMemo = async (syncMaklumanAndWhatsApp: boolean = false) => {
    if (!memoTitle.trim() || !selectedPortfolio) return;
    const fokusList = cleanFokusAgendaLines(memoFokusText);
    if (fokusList.length > 0) {
      setMemoFokusText(fokusList.join('\n'));
    }

    const resolvedSession = resolveDocumentSessions({
      title: memoTitle,
      agendaText: memoFokusText,
      tarikh: memoTarikhMesyuarat,
      fallbackYear: selectedAcademicYear,
    });

    const docId =
      memoDocId ||
      scopedDocId(
        effectiveSchoolCode,
        `memo_${resolvedSession.primaryYear}_${Date.now()}`
      );

    const payload: AISetiausahaDocument = {
      id: docId,
      docKind: 'MEMO',
      schoolCode: effectiveSchoolCode,
      academicYear: resolvedSession.primaryYear,
      academicYears: resolvedSession.academicYears,
      pillar: selectedPortfolio.pillar,
      kodMySG: selectedPortfolio.kodMySG,
      jawatankuasaInduk: selectedPortfolio.jawatankuasaInduk,
      jawatanRasmi: selectedPortfolio.jawatanRasmi,
      skpmBucket: selectedPortfolio.skpmBucket,
      skpmCodeBadge: memoRujKami,
      programTitle: memoTitle.trim().toUpperCase(),
      tarikh: memoTarikhMesyuarat,
      masa: memoMasa,
      tempat: memoTempat,
      pengerusi: `${memoPengerusi} (${memoJawatanPengerusi})`,
      agendaList: fokusList,
      invitedTeachers: memoSelectedTeachers,
      preparedByName: (
        selectedPortfolio.assignedTeacherName ||
        currentUser?.name ||
        'SETIAUSAHA'
      ).toUpperCase(),
      preparedByTitle: selectedPortfolio.jawatanRasmi,
      createdAt: memoTarikhSurat || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await setDoc(doc(db, 'ai_setiausaha_documents', docId), deepSanitizeFirestore(payload), {
      merge: true,
    });
    setMemoDocId(docId);

    if (syncMaklumanAndWhatsApp) {
      const maklumanId = scopedDocId(effectiveSchoolCode, `makluman_memo_${docId}`);
      await setDoc(
        doc(db, 'makluman_tasks', maklumanId),
        deepSanitizeFirestore({
          id: maklumanId,
          schoolCode: effectiveSchoolCode,
          academicYear: resolvedSession.primaryYear,
          academicYears: resolvedSession.academicYears,
          title: payload.programTitle,
          category: 'MESYUARAT',
          pillar: selectedPortfolio.pillar,
          kodMySG: selectedPortfolio.kodMySG,
          jawatankuasaInduk: selectedPortfolio.jawatankuasaInduk,
          dueDate: memoTarikhMesyuarat,
          masa: memoMasa,
          venue: memoTempat,
          rujKami: memoRujKami,
          invitedTeachers: memoSelectedTeachers,
          targetTeachers: memoSelectedTeachers.map((t) => t.teacherName),
          agendaList: fokusList,
          sourceMemoId: docId,
          createdAt: new Date().toISOString(),
        }),
        { merge: true }
      ).catch(() => null);

      const waText = `*MEMO PANGGILAN MESYUARAT RASMI — ${effectiveSchoolName} (${resolvedSession.badgeLabel})*\n*Ruj. Kami:* ${memoRujKami}\n*Tajuk:* ${payload.programTitle}\n*Tarikh:* ${memoTarikhMesyuarat}\n*Masa:* ${memoMasa}\n*Tempat:* ${memoTempat}\n*Pengerusi:* ${memoPengerusi} (${memoJawatanPengerusi})\n\n*Ahli Dijemput (${memoSelectedTeachers.length} orang):*\n${memoSelectedTeachers
        .map((t, i) => `${i + 1}. ${t.teacherName} (${t.committeeRole})`)
        .join('\n')}\n\n*Fokus Mesyuarat:*\n${fokusList.map((f) => `• ${f}`).join('\n')}`;

      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(waText).catch(() => null);
      }

      await loadHubData();
      setBannerMsg({
        type: 'success',
        text: `Memo telah disimpan (${resolvedSession.badgeLabel}), disegerakkan ke Paparan Makluman (${memoSelectedTeachers.length} guru) & teks WhatsApp disalin!`,
      });
      void handleSyncSavedDocToDrive(
        payload,
        'ai-setiausaha-memo-sheet',
        `Memo "${payload.programTitle}" disimpan (${resolvedSession.badgeLabel}), disegerakkan ke Makluman`
      );
    } else {
      await loadHubData();
      setBannerMsg({
        type: 'success',
        text: `Memo Panggilan "${payload.programTitle}" telah disimpan di bawah ${resolvedSession.badgeLabel} (${memoSelectedTeachers.length} penerima).`,
      });
      void handleSyncSavedDocToDrive(
        payload,
        'ai-setiausaha-memo-sheet',
        `Memo Panggilan "${payload.programTitle}" disimpan (${resolvedSession.badgeLabel})`
      );
    }
  };

  const handleImportMemoIntoMinit = (memo: AISetiausahaDocument) => {
    setMinitDocId('');
    setMinitSourceMemoId(memo.id);
    if (memo.kodMySG) {
      const matched = portfolios.find((p) => p.kodMySG === memo.kodMySG);
      if (matched) {
        setSelectedPillar(matched.pillar);
        setSelectedKodMySG(matched.kodMySG);
      }
    }
    const safeMemoTitle = String(memo.programTitle || 'MESYUARAT JAWATANKUASA').trim();
    setMinitTitle(
      safeMemoTitle.toUpperCase().startsWith('MINIT')
        ? safeMemoTitle
        : `MINIT ${safeMemoTitle}`
    );
    setMinitTarikh(memo.tarikh || new Date().toISOString().slice(0, 10));
    setMinitMasa(memo.masa || '2:15 petang – 4:15 petang');
    setMinitTempat(memo.tempat || 'Bilik Mesyuarat');
    setMinitPengerusi(memo.pengerusi || `${principalName} (Guru Besar)`);
    setMinitPencatat(
      `${memo.preparedByName || currentUser?.name || 'SETIAUSAHA'} (${
        memo.preparedByTitle || 'Setiausaha'
      })`
    );

    // STRICT 1-TO-1 ATTENDEE FILTERING FROM MEMO PANGGILAN TO MINIT MESYUARAT
    const memoInvited =
      Array.isArray(memo.invitedTeachers) && memo.invitedTeachers.length > 0
        ? memo.invitedTeachers
        : currentCommitteeMembers;

    setMinitAttendance(
      memoInvited.map((inv) => ({
        teacherId: inv.teacherId,
        teacherName: inv.teacherName,
        committeeRole: inv.committeeRole,
        status: 'HADIR',
      }))
    );

    const activePort =
      portfolios.find((p) => p.kodMySG === memo.kodMySG) || selectedPortfolio;
    const fokusFromMemo = cleanFokusAgendaLines(memo.agendaList);
    if (fokusFromMemo.length > 0) {
      setMemoFokusText(fokusFromMemo.join('\n'));
    }
    const sessionBadge =
      Array.isArray(memo.academicYears) && memo.academicYears.length > 0
        ? memo.academicYears.join(' & ')
        : memo.academicYear || selectedAcademicYear;

    const builtAgendas: MinitPKPAAgendaItem[] = [
      {
        id: 'ag-1',
        bil: '1.0',
        title: 'Perutusan Pengerusi',
        rawKeywords: `Ucapan alu-aluan Pengerusi & ketetapan ${activePort.jawatankuasaInduk}`,
        formalText: `1.1 Pengerusi mengucapkan ribuan terima kasih atas kehadiran semua ahli mesyuarat ${activePort.jawatankuasaInduk}.\n1.2 Pengerusi menegaskan pematuhan garis panduan KPM dan sasaran Skor 4 SKPM Kualiti@Sekolah (${activePort.skpmCodeDisplay}).`,
        tindakan: 'Makluman',
        statusMaklumBalas: 'Telah diambil maklum oleh semua ahli.',
      },
      {
        id: 'ag-2',
        bil: '2.0',
        title: 'Pengesahan Minit Mesyuarat Yang Lalu',
        rawKeywords: 'Disahkan tanpa pindaan sebulat suara',
        formalText: `2.1 Minit mesyuarat yang lalu telah dibentangkan dan disahkan tanpa pindaan atas cadangan dan sokongan sebulat suara ahli mesyuarat.`,
        tindakan: 'Makluman',
        statusMaklumBalas: 'Minit lepas telah disahkan.',
      },
      {
        id: 'ag-3',
        bil: '3.0',
        title: 'Perkara-perkara Berbangkit',
        rawKeywords: 'Maklum balas PKPA Bil. 2/1991 telah diambil tindakan',
        formalText: `3.1 Semua perkara berbangkit daripada mesyuarat yang lalu telah diambil tindakan sewajarnya mengikut Borang Maklum Balas PKPA Bil. 2/1991.`,
        tindakan: activePort.jawatanRasmi,
        statusMaklumBalas: 'Tindakan berbangkit telah selesai 100%.',
      },
      {
        id: 'ag-4',
        bil: '4.0',
        title: 'Fokus / Perbincangan Utama Mesyuarat',
        rawKeywords:
          fokusFromMemo.join(' ; ') ||
          `Perancangan & pelaksanaan program ${activePort.jawatankuasaInduk}`,
        formalText:
          fokusFromMemo.length > 0
            ? fokusFromMemo
                .map(
                  (f, i) =>
                    `4.${i + 1} Mesyuarat membincangkan perkara "${f}" dan memutuskan agar pelaksanaan dijalankan mengikut takwim Sesi ${sessionBadge} serta didokumentasikan melalui Poster OPR SKPM.`
                )
                .join('\n')
            : `4.1 Mesyuarat memutuskan agar semua program di bawah ${activePort.jawatankuasaInduk} dilaksanakan mengikut takwim Sesi ${sessionBadge}.`,
        tindakan: 'Penyelaras & Semua AJK',
        statusMaklumBalas: 'Pelaksanaan program sedang berjalan mengikut jadual.',
      },
      {
        id: 'ag-5',
        bil: '5.0',
        title: 'Hal-hal Lain',
        rawKeywords: 'Penyelarasan dokumentasi fail & tarikh akhir OPR',
        formalText: `5.1 Pengerusi mengingatkan semua ahli agar melengkapkan pelaporan OPR dan fail unit dalam tempoh 7 hari bekerja selepas program selesai.`,
        tindakan: 'Semua Ahli Jawatankuasa',
        statusMaklumBalas: 'Pemantauan berterusan oleh Setiausaha.',
      },
      {
        id: 'ag-6',
        bil: '6.0',
        title: 'Penutup',
        rawKeywords: 'Mesyuarat ditangguhkan dengan ucapan terima kasih',
        formalText: `6.1 Mesyuarat ditangguhkan dengan ucapan terima kasih daripada Pengerusi.`,
        tindakan: 'Makluman',
        statusMaklumBalas: '-',
      },
    ];
    setMinitAgendaItems(builtAgendas);
    setActiveTab('MINIT');
    setBannerMsg({
      type: 'success',
      text: `Memo "${memo.programTitle}" (Sesi ${sessionBadge}) diimport! Senarai kehadiran ditapis 1-ke-1 kepada ${memoInvited.length} ahli yang dijemput.`,
    });
  };

  const handleFormalizeAllMinitPKPA = () => {
    if (!selectedPortfolio) return;
    setMinitAgendaItems((prev) =>
      prev.map((item, idx) => formalizeSinglePKPAItem(item, selectedPortfolio, idx))
    );
    setBannerMsg({
      type: 'success',
      text: 'Semua butiran agenda telah diformalisasikan mengikut format rasmi PKPA Bil. 2/1991!',
    });
  };

  const handleSaveMinitPKPA = async () => {
    if (!minitTitle.trim() || !selectedPortfolio) return;
    const agendaCombinedText = minitAgendaItems
      .map((a) => `${a.title} ${a.rawKeywords} ${a.formalText}`)
      .join(' ');
    const resolvedSession = resolveDocumentSessions({
      title: minitTitle,
      agendaText: agendaCombinedText,
      tarikh: minitTarikh,
      fallbackYear: selectedAcademicYear,
    });
    const docId =
      minitDocId ||
      scopedDocId(
        effectiveSchoolCode,
        `minit_${resolvedSession.primaryYear}_${Date.now()}`
      );
    const payload: AISetiausahaDocument = {
      id: docId,
      docKind: 'MINIT',
      sourceMemoId: minitSourceMemoId || undefined,
      schoolCode: effectiveSchoolCode,
      academicYear: resolvedSession.primaryYear,
      academicYears: resolvedSession.academicYears,
      pillar: selectedPortfolio.pillar,
      kodMySG: selectedPortfolio.kodMySG,
      jawatankuasaInduk: selectedPortfolio.jawatankuasaInduk,
      jawatanRasmi: selectedPortfolio.jawatanRasmi,
      skpmBucket: selectedPortfolio.skpmBucket,
      programTitle: minitTitle.trim().toUpperCase(),
      tarikh: minitTarikh,
      masa: minitMasa,
      tempat: minitTempat,
      pengerusi: minitPengerusi,
      attendanceList: minitAttendance,
      rawNotes: JSON.stringify(minitAgendaItems),
      agendaList: minitAgendaItems.map((a) => `${a.bil} ${a.title}: ${a.formalText}`),
      preparedByName: minitPencatat || (currentUser?.name || 'SETIAUSAHA').toUpperCase(),
      preparedByTitle: selectedPortfolio.jawatanRasmi,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await setDoc(doc(db, 'ai_setiausaha_documents', docId), deepSanitizeFirestore(payload), {
      merge: true,
    });
    setMinitDocId(docId);
    await loadHubData();
    setBannerMsg({
      type: 'success',
      text: `Minit Mesyuarat PKPA Bil. 2/1991 & Borang Maklum Balas berjaya disimpan di bawah ${resolvedSession.badgeLabel}! Menyegerak ke Google Drive Sekolah...`,
    });
    void handleSyncSavedDocToDrive(
      payload,
      'ai-setiausaha-minit-sheet',
      `Minit Mesyuarat PKPA Bil. 2/1991 "${payload.programTitle}" disimpan (${resolvedSession.badgeLabel})`
    );
  };

  const handleDeleteDocument = async (id: string) => {
    await deleteDoc(doc(db, 'ai_setiausaha_documents', id));
    if (oprDocId === id) setOprDocId('');
    if (memoDocId === id) setMemoDocId('');
    if (minitDocId === id) setMinitDocId('');
    await loadHubData();
  };

  // Compute selected teacher's Penyelaras + AJK portfolios for Tab 4 (Surat Lantikan MySG)
  const selectedTeacherLantikanSummary = useMemo(() => {
    const targetName = (lantikanTeacherKey || '').trim().toUpperCase();
    const penyelarasRoles = portfolios.filter(
      (p) => (p.assignedTeacherName || '').trim().toUpperCase() === targetName
    );
    const ahliRoles = portfolios.filter((p) =>
      (p.ahliList || []).some(
        (a) => (a.teacherName || '').trim().toUpperCase() === targetName
      )
    );
    const totalMata = penyelarasRoles.reduce((acc, r) => acc + (Number(r.mataBeban) || 0), 0);
    return {
      teacherName: targetName || 'NAMA GURU',
      penyelarasRoles,
      ahliRoles,
      totalMata,
    };
  }, [portfolios, lantikanTeacherKey]);

  const isCurrentSession =
    selectedAcademicYear === '2026' || selectedAcademicYear.startsWith('2026');

  return (
    <div className="space-y-6">
      {/* ====================================================================
          1. TOP HEADER BANNER & 4 SUB-MODULE CARDS
         ==================================================================== */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5">
        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
          <div className="space-y-2">
            {/* Top Badges Row */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-950/90 border border-indigo-500/50 text-indigo-300 text-[11px] font-black uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>AI SETIAUSAHA SEKOLAH • KPM</span>
              </span>

              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 text-[11px] font-black uppercase tracking-wide">
                <span>
                  {effectiveSchoolName} ({effectiveSchoolCode})
                </span>
              </span>

              {/* Interactive Sesi 2026 / 2027 Selector */}
              <div className="inline-flex items-center gap-1.5 bg-slate-950 border border-amber-500/40 px-3 py-1 rounded-xl text-[11px] font-black text-white">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-slate-400">Sesi:</span>
                <select
                  value={selectedAcademicYear}
                  onChange={(e) => {
                    if (e.target.value === '__ADD_NEW__') {
                      setShowNewYearInput(true);
                      return;
                    }
                    setSelectedAcademicYear(e.target.value);
                  }}
                  className="bg-slate-900 text-amber-300 border border-slate-700 rounded-lg px-2 py-0.5 text-[11px] font-black outline-none cursor-pointer"
                >
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      Sesi {yr}
                    </option>
                  ))}
                  <option value="__ADD_NEW__">+ Sesi Baharu...</option>
                </select>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                    isCurrentSession
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                      : 'bg-amber-950 text-amber-300 border border-amber-700/60'
                  }`}
                >
                  {isCurrentSession ? 'Sesi Semasa' : 'Perancangan'}
                </span>
              </div>

              {showNewYearInput && (
                <div className="inline-flex items-center gap-1.5 bg-slate-950 border border-slate-700 rounded-xl p-1">
                  <input
                    type="text"
                    value={newYearStr}
                    onChange={(e) => setNewYearStr(e.target.value)}
                    placeholder="cth: 2029"
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-0.5 text-xs text-white font-bold w-24"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomYear}
                    className="px-2.5 py-0.5 rounded-lg bg-indigo-600 text-white text-xs font-black cursor-pointer"
                  >
                    Pilih
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewYearInput(false)}
                    className="text-slate-400 hover:text-white text-xs px-1 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* Title & Subtitle */}
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Hab Dokumentasi Rasmi AI Setiausaha (SKPM &amp; MySG)
            </h1>
            <p className="text-xs text-slate-400 max-w-4xl leading-relaxed">
              Penjana bersepadu Poster OPR SKPM Kualiti@Sekolah, Memo Panggilan Mesyuarat PKPA Bil. 2/1991 + Borang Maklum Balas, dan Surat Lantikan Jawatankuasa MySG (79 portfolio rasmi).
            </p>
          </div>

          {/* Right Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowArchiveDrawer((prev) => !prev)}
              className="px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-teal-300 text-xs font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer transition"
            >
              <Archive className="w-4 h-4 text-teal-400" />
              <span>ARKIB DOKUMEN SEKOLAH ({allDocs.length})</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setSppkModalData({
                  programName: oprTitle || selectedPortfolio?.jawatankuasaInduk || '',
                  organizer: effectiveSchoolName,
                  date: oprTarikh,
                  masa: oprMasa,
                  venue: oprTempat,
                  level: 'Daerah',
                  unit: selectedPortfolio?.jawatankuasaInduk || '',
                })
              }
              className="px-3.5 py-2 rounded-xl bg-indigo-950/90 hover:bg-indigo-900 border border-indigo-500/60 text-indigo-200 text-xs font-black flex items-center gap-1.5 cursor-pointer transition"
            >
              <ClipboardList className="w-4 h-4 text-indigo-400" />
              <span>Borang SPPK 1-3</span>
            </button>

            <button
              type="button"
              onClick={loadHubData}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin text-amber-400' : ''}`} />
              <span>Muat Semula</span>
            </button>
          </div>
        </div>

        {/* Collapsible School Document Archive Drawer */}
        {showArchiveDrawer && (
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="text-xs font-black uppercase tracking-wider text-teal-300">
                  Arkib Dokumen Rasmi Sekolah — {archiveSessionScope === 'ALL' ? 'Semua Sesi' : `Sesi ${selectedAcademicYear}`} ({allDocs.length} Dokumen)
                </div>
                <div className="inline-flex bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setArchiveSessionScope('CURRENT')}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-black cursor-pointer transition ${
                      archiveSessionScope === 'CURRENT'
                        ? 'bg-teal-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Sesi {selectedAcademicYear}
                  </button>
                  <button
                    type="button"
                    onClick={() => setArchiveSessionScope('ALL')}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-black cursor-pointer transition ${
                      archiveSessionScope === 'ALL'
                        ? 'bg-teal-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Semua Sesi
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowArchiveDrawer(false)}
                className="text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Tutup ✕
              </button>
            </div>
            {allDocs.length === 0 ? (
              <div className="text-xs text-slate-500 py-3">
                Tiada dokumen disimpan bagi {archiveSessionScope === 'ALL' ? 'Semua Sesi' : `Sesi ${selectedAcademicYear}`} buat masa ini.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto">
                {allDocs.map((d, i) => {
                  const docSessions =
                    Array.isArray(d.academicYears) && d.academicYears.length > 0
                      ? d.academicYears
                      : [d.academicYear || selectedAcademicYear];
                  const isMaklumanBridge = String(d.id || '').startsWith('MAKLUMAN_MEMO_');
                  return (
                    <div
                      key={`${d.id}_${i}`}
                      onClick={() => {
                        if (d.docKind === 'OPR') handleLoadSavedOPR(d);
                        else if (d.docKind === 'MEMO') handleLoadSavedMemo(d);
                        else if (d.docKind === 'MINIT') handleLoadSavedMinit(d);
                      }}
                      className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-teal-500/60 cursor-pointer flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700/50 text-[9px] font-black">
                            {isMaklumanBridge ? 'MAKLUMAN • MEMO' : d.docKind}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-black border ${
                              docSessions.length > 1
                                ? 'bg-amber-950/90 text-amber-300 border-amber-600/60'
                                : 'bg-teal-950/80 text-teal-300 border-teal-700/50'
                            }`}
                          >
                            Sesi {docSessions.join(' & ')}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">{d.tarikh}</span>
                        </div>
                        <div className="text-xs font-bold text-white truncate mt-1">
                          {d.programTitle}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          {(d.driveFolderUrl || d.driveFileUrl) && (
                            <a
                              href={d.driveFileUrl || d.driveFolderUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="px-2 py-0.5 rounded-md bg-emerald-950/90 hover:bg-emerald-900 text-emerald-300 border border-emerald-600/60 text-[10px] font-black inline-flex items-center gap-1 transition"
                            >
                              <span>📂 Buka di Google Drive Sekolah</span>
                            </a>
                          )}
                          <button
                            type="button"
                            disabled={syncingDriveDocId === d.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleSyncSavedDocToDrive(d);
                            }}
                            className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer transition disabled:opacity-50"
                          >
                            <span>
                              {syncingDriveDocId === d.id
                                ? '⏳ Menyegerak...'
                                : '☁️ Hantar ke Drive Sekolah'}
                            </span>
                          </button>
                        </div>
                      </div>
                      {!isMaklumanBridge && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteDocument(d.id);
                          }}
                          className="text-slate-500 hover:text-rose-400 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 4 Module Switcher Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              id: 'OPR',
              title: '1. OPR PINTAR SKPM',
              subtitle: 'Poster A4 One Page Report + 3 Foto Bulat & Radar SKPM',
              icon: FileText,
              accent: 'from-teal-600/25 to-emerald-900/20 border-teal-500/70 text-teal-300',
            },
            {
              id: 'MEMO',
              title: '2. MEMO MESYUARAT',
              subtitle: 'Surat Panggilan Rasmi KPM + Segerak Makluman & WhatsApp',
              icon: Mail,
              accent: 'from-indigo-600/25 to-blue-900/20 border-indigo-500/70 text-indigo-300',
            },
            {
              id: 'MINIT',
              title: '3. MINIT PKPA 2/1991',
              subtitle: 'Import Memo + Formalisasi AI + Borang Maklum Balas',
              icon: ClipboardCheck,
              accent: 'from-amber-600/25 to-orange-900/20 border-amber-500/70 text-amber-300',
            },
            {
              id: 'LANTIKAN',
              title: '4. SURAT LANTIKAN MYSG',
              subtitle: 'Lantikan Bersepadu Guru + Keratan Akuan Penerimaan',
              icon: Award,
              accent: 'from-purple-600/25 to-fuchsia-900/20 border-purple-500/70 text-purple-300',
            },
          ].map((card) => {
            const Icon = card.icon;
            const isActive = activeTab === card.id;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => setActiveTab(card.id as any)}
                className={`text-left p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                  isActive
                    ? `bg-gradient-to-br ${card.accent} shadow-lg ring-1 ring-white/15`
                    : 'bg-slate-950/90 border-slate-800 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div
                  className={`p-2.5 rounded-xl shrink-0 ${
                    isActive ? 'bg-white/10 text-white' : 'bg-slate-900 text-slate-400'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-black uppercase tracking-wide text-white">
                    {card.title}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    {card.subtitle}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Status Banner */}
      {bannerMsg && (
        <div
          className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-xs font-bold ${
            bannerMsg.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-600/60 text-emerald-200'
              : bannerMsg.type === 'error'
              ? 'bg-rose-950/80 border-rose-600/60 text-rose-200'
              : 'bg-indigo-950/80 border-indigo-600/60 text-indigo-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{bannerMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerMsg(null)}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ====================================================================
          2. SHARED 2-LEVEL STRUCTURED SELECTOR (TERAS MySG -> JAWATANKUASA / UNIT)
         ==================================================================== */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-[11px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
            <Layers className="w-4 h-4" />
            <span>PEMILIH BERSTRUKTUR 2-PERINGKAT (TERAS MySG &rarr; JAWATANKUASA / UNIT)</span>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-emerald-950 border border-emerald-700/60 text-emerald-300 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>SSOT Disegerak &bull; Sesi {selectedAcademicYear}</span>
          </span>
        </div>

        {/* Level 1 Pillar Pills */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {[
            {
              id: 'PENTADBIRAN' as MySGPillar,
              label: `1. PENTADBIRAN & PENGURUSAN (${pillarCounts.PENTADBIRAN})`,
            },
            {
              id: 'KURIKULUM' as MySGPillar,
              label: `2. KURIKULUM & AKADEMIK (${pillarCounts.KURIKULUM})`,
            },
            {
              id: 'HEM' as MySGPillar,
              label: `3. HAL EHWAL MURID (HEM) (${pillarCounts.HEM})`,
            },
            {
              id: 'KOKURIKULUM' as MySGPillar,
              label: `4. KOKURIKULUM & KOAKADEMIK (${pillarCounts.KOKURIKULUM})`,
            },
          ].map((pil) => {
            const active = selectedPillar === pil.id;
            return (
              <button
                key={pil.id}
                type="button"
                onClick={() => {
                  setSelectedPillar(pil.id);
                  const firstInPillar = portfolios.find((p) => p.pillar === pil.id);
                  if (firstInPillar) {
                    setSelectedKodMySG(firstInPillar.kodMySG);
                    setOprDocId('');
                    setMemoDocId('');
                    setMinitDocId('');
                    setMinitSourceMemoId('');
                  }
                }}
                className={`px-3.5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide border transition cursor-pointer ${
                  active
                    ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/25'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white'
                }`}
              >
                {pil.label}
              </button>
            );
          })}
        </div>

        {/* Level 2 Dropdown + Right Info Card */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          <div className="lg:col-span-6 bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-center space-y-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              PERINGKAT 2: PILIH JAWATANKUASA / PANITIA / UNIT ({pillarPortfolios.length} PORTFOLIO)
            </label>
            <select
              value={selectedPortfolio?.kodMySG || ''}
              onChange={(e) => {
                setSelectedKodMySG(e.target.value);
                setOprDocId('');
                setMemoDocId('');
                setMinitDocId('');
                setMinitSourceMemoId('');
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-white outline-none focus:border-indigo-500 cursor-pointer"
            >
              {pillarPortfolios.map((item, idx) => (
                <option key={`${item.kodMySG}_${idx}`} value={item.kodMySG}>
                  [{item.kodMySG}] {item.jawatanRasmi} — {item.jawatankuasaInduk}
                </option>
              ))}
            </select>
          </div>

          {/* Right Info Card */}
          {selectedPortfolio && (
            <div className="lg:col-span-6 bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-lg bg-indigo-950 border border-indigo-600/60 text-indigo-300 text-[10px] font-mono font-black">
                    {selectedPortfolio.kodMySG}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-lg bg-teal-950 border border-teal-600/60 text-teal-300 text-[10px] font-black uppercase">
                    {selectedPortfolio.skpmCodeDisplay}
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-amber-950/80 border border-amber-700/50 text-amber-300 text-[10px] font-black">
                    {selectedPortfolio.tahapBeban} ({selectedPortfolio.mataBeban} Mata)
                  </span>
                </div>
              </div>

              <div>
                <div className="text-xs font-black text-white uppercase">
                  {selectedPortfolio.jawatankuasaInduk} &bull;{' '}
                  <span className="text-amber-300">{selectedPortfolio.jawatanRasmi}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {selectedPortfolio.perincianTugas}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex flex-wrap items-center gap-3">
                  <span>
                    <strong className="text-teal-400">Penyelaras MySG:</strong>{' '}
                    <span className="text-white font-bold">
                      {selectedPortfolio.assignedTeacherName || 'Belum Dilantik (Master Data)'}
                    </span>
                  </span>
                  <span>
                    <strong className="text-indigo-400">Ahli Jawatankuasa (AJK):</strong>{' '}
                    <span className="text-white font-bold">
                      {(selectedPortfolio.ahliList || []).length} orang
                    </span>
                    {(selectedPortfolio.ahliList || []).length > 0 && (
                      <span className="text-slate-400 ml-1">
                        ({(selectedPortfolio.ahliList || []).map((a) => a.teacherName).join(', ')})
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ====================================================================
          3. TAB 1 — 1. OPR PINTAR SKPM (EXACT SKPM KUALITI@SEKOLAH POSTER)
         ==================================================================== */}
      {activeTab === 'OPR' && selectedPortfolio && (
        <div className="space-y-5">
          {/* Radar Evidens SKPM Kualiti@Sekolah Filter Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-black uppercase tracking-wider text-teal-300 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Radar Evidens SKPM Kualiti@Sekolah — Sesi {selectedAcademicYear}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {['Semua', 'Std 1', 'Std 2', 'Std 3.1', 'Std 3.2', 'Std 3.3', 'Std 4', 'Std 5'].map(
                  (bucket) => (
                    <button
                      key={bucket}
                      type="button"
                      onClick={() => setSkpmRadarFilter(bucket)}
                      className={`px-3 py-1 rounded-xl text-[11px] font-black transition cursor-pointer ${
                        skpmRadarFilter === bucket
                          ? 'bg-teal-500 text-slate-950 shadow'
                          : 'bg-slate-950 text-slate-300 border border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {bucket} ({skpmRadarCounts.counts[bucket] || 0})
                    </button>
                  )
                )}
              </div>
            </div>

            {filteredOprDocs.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {filteredOprDocs.slice(0, 8).map((d, i) => (
                  <button
                    key={`${d.id}_${i}`}
                    type="button"
                    onClick={() => handleLoadSavedOPR(d)}
                    className={`px-3 py-1.5 rounded-xl border text-left shrink-0 cursor-pointer transition ${
                      oprDocId === d.id
                        ? 'bg-teal-950 border-teal-500 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-[11px] font-bold truncate max-w-[220px]">
                      {d.programTitle}
                    </div>
                    <div className="text-[9px] text-teal-400 font-mono">
                      {d.tarikh} &bull; {d.skpmCodeBadge || d.skpmBucket}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Main 2-Column Layout: Left Editor + Right Live A4 Portrait Preview */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* LEFT EDITOR: EDITOR OPR PINTAR SKPM */}
            <div className="xl:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  <span>EDITOR OPR PINTAR SKPM</span>
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setOprDocId('');
                    setOprPhotos(['', '', '']);
                  }}
                  className="text-[11px] font-bold text-teal-300 hover:text-teal-200 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>OPR Baharu</span>
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    TAJUK PROGRAM / AKTIVITI (HURUF BESAR PADA POSTER)
                  </label>
                  <input
                    type="text"
                    value={oprTitle}
                    onChange={(e) => setOprTitle(e.target.value.toUpperCase())}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-black text-white uppercase"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                      Tarikh
                    </label>
                    <input
                      type="date"
                      value={oprTarikh}
                      onChange={(e) => setOprTarikh(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                      Masa
                    </label>
                    <input
                      type="text"
                      value={oprMasa}
                      onChange={(e) => setOprMasa(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                      Tempat
                    </label>
                    <input
                      type="text"
                      value={oprTempat}
                      onChange={(e) => setOprTempat(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                      Sasaran
                    </label>
                    <input
                      type="text"
                      value={oprSasaran}
                      onChange={(e) => setOprSasaran(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>

                {/* Catatan Ringkas (中文 / BM Kata Kunci) + Auto -> BM Rasmi Skor 4 SKPM */}
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-teal-500/40 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[10px] font-black uppercase text-teal-300">
                      CATATAN RINGKAS (中文 / BM KATA KUNCI)
                    </label>
                    <button
                      type="button"
                      onClick={handleAutoFormalizeOPR}
                      className="px-3 py-1 rounded-lg bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 text-[10px] font-black uppercase flex items-center gap-1 shadow cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Auto &rarr; BM Rasmi Skor 4 SKPM</span>
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={oprRawNotes}
                    onChange={(e) => setOprRawNotes(e.target.value)}
                    placeholder="Taip kata kunci draf dalam Bahasa Cina atau BM (cth: 全体老师会议, penyelarasan PBD, 顺利完成)..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    1. OBJEKTIF (1 BARIS = 1 BUTIRAN)
                  </label>
                  <textarea
                    rows={2}
                    value={oprObjektifText}
                    onChange={(e) => setOprObjektifText(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    2. PENGISIAN AKTIVITI
                  </label>
                  <textarea
                    rows={3}
                    value={oprPengisianText}
                    onChange={(e) => setOprPengisianText(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    3. IMPAK &amp; PENCAPAIAN SKPM
                  </label>
                  <textarea
                    rows={2}
                    value={oprImpakText}
                    onChange={(e) => setOprImpakText(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    4. REFLEKSI &amp; TINDAKAN SUSULAN
                  </label>
                  <textarea
                    rows={2}
                    value={oprRefleksiText}
                    onChange={(e) => setOprRefleksiText(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white"
                  />
                </div>

                {/* 3 Circular Photo Uploaders */}
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1.5">
                    MUAT NAIK 3 FOTO BULAT DOKUMENTASI OPR
                  </label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {[0, 1, 2].map((slot) => (
                      <div
                        key={slot}
                        className="bg-slate-950 border border-slate-800 rounded-2xl p-2.5 flex flex-col items-center gap-2"
                      >
                        <div className="w-16 h-16 rounded-full border-2 border-teal-500 overflow-hidden bg-slate-900 flex items-center justify-center">
                          {oprPhotos[slot] ? (
                            <img
                              src={oprPhotos[slot]}
                              alt={`Foto ${slot + 1}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="w-5 h-5 text-slate-600" />
                          )}
                        </div>
                        <label className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-teal-300 cursor-pointer">
                          <span>Foto {slot + 1}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handlePhotoUpload(slot, e.target.files?.[0])}
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                      Disediakan Oleh
                    </label>
                    <input
                      type="text"
                      value={oprPreparedBy}
                      onChange={(e) => setOprPreparedBy(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                      Jawatan Penyedia
                    </label>
                    <input
                      type="text"
                      value={oprPreparedTitle}
                      onChange={(e) => setOprPreparedTitle(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSaveOPR}
                  className="w-full py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-black uppercase tracking-wider shadow-lg cursor-pointer transition"
                >
                  SIMPAN OPR KE ARKIB SEKOLAH
                </button>
              </div>
            </div>

            {/* RIGHT LIVE A4 PORTRAIT PREVIEW */}
            <div className="xl:col-span-7 space-y-3">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-black uppercase tracking-wide text-white">
                  Pratonton Poster A4 Potret (SKPM Kualiti@Sekolah)
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(() => {
                    const currentOprDoc = allDocs.find((x) => x.id === oprDocId);
                    const driveLink = currentOprDoc?.driveFileUrl || currentOprDoc?.driveFolderUrl;
                    return (
                      <>
                        {driveLink && (
                          <a
                            href={driveLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-2 rounded-xl bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/60 text-xs font-black flex items-center gap-1.5 transition"
                          >
                            <span>📂 Buka di Google Drive Sekolah</span>
                          </a>
                        )}
                        <button
                          type="button"
                          disabled={syncingDriveDocId !== null}
                          onClick={async () => {
                            await handleSaveOPR();
                          }}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/50 text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <span>
                            {syncingDriveDocId
                              ? '⏳ Menyegerak Drive...'
                              : '☁️ Hantar ke Drive Sekolah'}
                          </span>
                        </button>
                      </>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => {
                      const res = downloadStandalonePrintHtml({
                        elementId: 'ai-setiausaha-opr-poster',
                        title: oprTitle || 'Poster_OPR_SKPM',
                        orientation: 'portrait',
                      });
                      setBannerMsg({ type: 'info', text: res.message });
                    }}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-700/50 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Muat Turun (.html)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const res = triggerSmartPrint({
                        elementId: 'ai-setiausaha-opr-poster',
                        title: oprTitle || 'Poster_OPR_SKPM',
                        orientation: 'portrait',
                      });
                      if (res.mode !== 'native') {
                        setBannerMsg({ type: 'info', text: res.message });
                      }
                    }}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase flex items-center gap-1.5 shadow cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>CETAK / EKSPORT PDF (A4)</span>
                  </button>
                </div>
              </div>

              {/* EXACT SKPM KUALITI@SEKOLAH A4 POSTER */}
              <div
                id="ai-setiausaha-opr-poster"
                className="bg-white text-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 max-w-[794px] mx-auto flex flex-col"
              >
                {/* 1. Dark-Teal Top Banner */}
                <div className="bg-[#0D3B42] text-white px-6 py-4 border-b-4 border-[#D4AF37]">
                  <div className="flex items-center justify-between gap-4 border-b border-teal-700/70 pb-2 mb-2">
                    <span className="text-xs font-black uppercase tracking-widest text-[#FDE047]">
                      SKPM KUALITI@SEKOLAH {selectedAcademicYear}
                    </span>
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-teal-100">
                      <span>{selectedPortfolio.kodMySG}</span>
                      <span className="px-2 py-0.5 rounded bg-teal-900/90 text-[#FDE047] border border-[#D4AF37]/60">
                        {selectedPortfolio.skpmCodeDisplay}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-xs font-black uppercase tracking-wide text-white">
                      {selectedPortfolio.skpmStandardTitle}
                    </div>
                    <div className="text-[11px] font-extrabold uppercase tracking-wide text-teal-100">
                      {selectedPortfolio.skpmAspekTitle}
                    </div>
                    <p className="text-[11px] italic text-[#FDE047] leading-snug pt-0.5">
                      Standard Kualiti: &ldquo;{selectedPortfolio.skpmKualitiStatement}&rdquo;
                    </p>
                  </div>
                </div>

                {/* 2. Centered School Crest + ONE PAGE REPORT + Activity Title Box */}
                <div className="px-6 pt-5 pb-4 border-b-2 border-slate-200 bg-slate-50/70 text-center space-y-2">
                  <div className="flex flex-col items-center justify-center gap-1.5">
                    <SchoolLogo
                      src={effectiveSchoolLogo}
                      schoolCode={effectiveSchoolCode}
                      className="w-16 h-16 bg-white border-slate-300 shadow-sm"
                    />
                    <div className="text-sm font-black uppercase tracking-wide text-[#0D3B42]">
                      {effectiveSchoolName} ({effectiveSchoolCode})
                    </div>
                    <div className="text-3xl font-black tracking-tight text-[#0D3B42] leading-none pt-0.5">
                      ONE PAGE REPORT
                    </div>
                    <div className="text-[10px] font-extrabold uppercase tracking-widest text-[#B48A18]">
                      EVIDENS PENGURUSAN BERKUALITI &bull; {selectedPortfolio.jawatankuasaInduk.toUpperCase()}
                    </div>
                  </div>

                  <div className="mt-2 py-2 px-4 rounded-xl bg-[#0D3B42]/5 border border-[#0D3B42]/20">
                    <h2 className="text-sm font-black uppercase tracking-wide text-[#0D3B42]">
                      {oprTitle || selectedPortfolio.jawatankuasaInduk}
                    </h2>
                  </div>
                </div>

                {/* 3. Two-Column Body: 3 Circular Stacked Photos on Left + 4 Rubric Sections on Right */}
                <div className="p-6 grid grid-cols-12 gap-5 flex-1 items-start">
                  <div className="col-span-4 flex flex-col items-center justify-start pt-1">
                    {[0, 1, 2].map((idx) => {
                      const src = oprPhotos[idx];
                      return (
                        <div
                          key={idx}
                          className={`w-40 h-40 rounded-full border-4 border-[#0D3B42] ring-2 ring-[#D4AF37] overflow-hidden bg-slate-100 flex items-center justify-center shadow-lg ${
                            idx > 0 ? '-mt-4' : ''
                          }`}
                        >
                          {src ? (
                            <img
                              src={src}
                              alt={`Dokumentasi ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="text-center px-3 text-slate-400">
                              <ImageIcon className="w-6 h-6 mx-auto mb-1 opacity-40" />
                              <span className="text-[10px] font-bold block">
                                Foto Bulat {idx + 1}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="col-span-8 space-y-3 text-[11px] leading-relaxed">
                    <div>
                      <h4 className="text-xs font-black uppercase text-[#0D3B42] border-b border-[#D4AF37] pb-0.5 mb-1">
                        1. Objektif:
                      </h4>
                      <ul className="list-disc pl-4 space-y-0.5 text-slate-800 font-medium">
                        {oprObjektifText
                          .split('\n')
                          .map((x) => x.trim())
                          .filter(Boolean)
                          .map((line, i) => (
                            <li key={i}>{line}</li>
                          ))}
                      </ul>
                    </div>

                    <div>
                      <h4 className="text-xs font-black uppercase text-[#0D3B42] border-b border-[#D4AF37] pb-0.5 mb-1">
                        2. Pengisian Aktiviti:
                      </h4>
                      <ul className="list-disc pl-4 space-y-0.5 text-slate-800 font-medium">
                        {oprPengisianText
                          .split('\n')
                          .map((x) => x.trim())
                          .filter(Boolean)
                          .map((line, i) => (
                            <li key={i}>{line}</li>
                          ))}
                      </ul>
                    </div>

                    <div>
                      <h4 className="text-xs font-black uppercase text-[#0D3B42] border-b border-[#D4AF37] pb-0.5 mb-1">
                        3. Impak &amp; Kemenjadian:
                      </h4>
                      <ul className="list-disc pl-4 space-y-0.5 text-slate-800 font-medium">
                        {oprImpakText
                          .split('\n')
                          .map((x) => x.trim())
                          .filter(Boolean)
                          .map((line, i) => (
                            <li key={i}>{line}</li>
                          ))}
                      </ul>
                    </div>

                    <div>
                      <h4 className="text-xs font-black uppercase text-[#0D3B42] border-b border-[#D4AF37] pb-0.5 mb-1">
                        4. Refleksi &amp; Tindakan Susulan:
                      </h4>
                      <ul className="list-disc pl-4 space-y-0.5 text-slate-800 font-medium">
                        {oprRefleksiText
                          .split('\n')
                          .map((x) => x.trim())
                          .filter(Boolean)
                          .map((line, i) => (
                            <li key={i}>{line}</li>
                          ))}
                      </ul>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-[10px] grid grid-cols-2 gap-2">
                      <div>
                        <strong>Tarikh:</strong> {oprTarikh}
                      </div>
                      <div>
                        <strong>Masa:</strong> {oprMasa}
                      </div>
                      <div>
                        <strong>Tempat:</strong> {oprTempat}
                      </div>
                      <div>
                        <strong>Sasaran:</strong> {oprSasaran}
                      </div>
                    </div>

                    <div className="pt-1 flex justify-end">
                      <div className="inline-block px-4 py-1.5 rounded-full bg-[#0D3B42] text-white text-[10px] font-bold border border-[#D4AF37]">
                        Disediakan oleh:{' '}
                        <span className="font-black text-[#FDE047]">
                          {(oprPreparedBy || currentUser?.name || 'SETIAUSAHA').toUpperCase()}
                        </span>{' '}
                        ({oprPreparedTitle || selectedPortfolio.jawatanRasmi})
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          4. TAB 2 — 2. MEMO MESYUARAT (AUTO-ARRANGED KPM OFFICIAL CALL NOTICE)
         ==================================================================== */}
      {activeTab === 'MEMO' && selectedPortfolio && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* LEFT EDITOR: PEMBINA MEMO PANGGILAN MESYUARAT */}
          <div className="xl:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-indigo-300 flex items-center gap-2">
                <Mail className="w-4 h-4" />
                <span>PEMBINA MEMO PANGGILAN MESYUARAT</span>
              </h3>
              <button
                type="button"
                onClick={() => setMemoDocId('')}
                className="text-[11px] font-bold text-indigo-300 hover:text-indigo-200 flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Memo Baharu</span>
              </button>
            </div>

            {memoDocs.length > 0 && (
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase text-indigo-300">
                  Buka Memo Tersimpan:
                </span>
                <select
                  value={memoDocId}
                  onChange={(e) => {
                    const chosen = memoDocs.find((m) => m.id === e.target.value);
                    if (chosen) handleLoadSavedMemo(chosen);
                  }}
                  className="flex-1 min-w-[200px] bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-bold outline-none cursor-pointer"
                >
                  <option value="">-- Pilih Memo / Makluman ({memoDocs.length}) --</option>
                  {memoDocs.map((m, idx) => {
                    const isMakluman = String(m.id || '').startsWith('MAKLUMAN_MEMO_');
                    const yrs =
                      Array.isArray(m.academicYears) && m.academicYears.length > 0
                        ? m.academicYears.join(' & ')
                        : m.academicYear || selectedAcademicYear;
                    return (
                      <option key={`${m.id}_${idx}`} value={m.id}>
                        {isMakluman ? '[Makluman] ' : ''}[{m.tarikh} • Sesi {yrs}] {m.programTitle}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                  TAJUK RASMI MESYUARAT
                </label>
                <input
                  type="text"
                  value={memoTitle}
                  onChange={(e) => setMemoTitle(e.target.value.toUpperCase())}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-black text-white uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Ruj. Kami
                  </label>
                  <input
                    type="text"
                    value={memoRujKami}
                    onChange={(e) => setMemoRujKami(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Bilangan
                  </label>
                  <input
                    type="text"
                    value={memoBilangan}
                    onChange={(e) => setMemoBilangan(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Tarikh Surat
                  </label>
                  <input
                    type="date"
                    value={memoTarikhSurat}
                    onChange={(e) => setMemoTarikhSurat(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Tarikh Mesyuarat
                  </label>
                  <input
                    type="date"
                    value={memoTarikhMesyuarat}
                    onChange={(e) => setMemoTarikhMesyuarat(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Masa
                  </label>
                  <input
                    type="text"
                    value={memoMasa}
                    onChange={(e) => setMemoMasa(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Tempat
                  </label>
                  <input
                    type="text"
                    value={memoTempat}
                    onChange={(e) => setMemoTempat(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Pengerusi
                  </label>
                  <input
                    type="text"
                    value={memoPengerusi}
                    onChange={(e) => setMemoPengerusi(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Jawatan Pengerusi
                  </label>
                  <input
                    type="text"
                    value={memoJawatanPengerusi}
                    onChange={(e) => setMemoJawatanPengerusi(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              {/* SENARAI PENERIMA (DARIPADA PROFIL GURU) */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-[10px] font-black uppercase text-indigo-300 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    <span>
                      SENARAI PENERIMA (DARIPADA PROFIL GURU) ({memoSelectedTeachers.length} Dipilih)
                    </span>
                  </label>

                  <div className="inline-flex bg-slate-900 p-1 rounded-xl border border-slate-800 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setMemoRecipientMode('ALL_TEACHERS');
                        setMemoSelectedTeachers(
                          teacherRoster.map((t) => ({
                            teacherId: t.id,
                            teacherName: t.name,
                            committeeRole: t.role,
                          }))
                        );
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black cursor-pointer transition ${
                        memoRecipientMode === 'ALL_TEACHERS'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Semua Guru ({teacherRoster.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMemoRecipientMode('COMMITTEE_ONLY');
                        if (currentCommitteeMembers.length > 0) {
                          setMemoSelectedTeachers(currentCommitteeMembers);
                        }
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black cursor-pointer transition ${
                        memoRecipientMode === 'COMMITTEE_ONLY'
                          ? 'bg-teal-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Ahli Jawatankuasa ({currentCommitteeMembers.length})
                    </button>
                  </div>
                </div>

                <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                  {teacherRoster.map((t, idx) => {
                    const isChecked = memoSelectedTeachers.some(
                      (sel) => sel.teacherName.toUpperCase() === t.name.toUpperCase()
                    );
                    const jkRole = currentCommitteeMembers.find(
                      (m) => m.teacherName.toUpperCase() === t.name.toUpperCase()
                    );
                    return (
                      <div
                        key={`${t.id}_${idx}`}
                        onClick={() => handleToggleMemoTeacher(t)}
                        className={`px-2.5 py-1.5 rounded-xl border flex items-center justify-between gap-2 cursor-pointer text-xs ${
                          isChecked
                            ? 'bg-indigo-950/60 border-indigo-600/60 text-white'
                            : 'bg-slate-900/60 border-slate-800/80 text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isChecked ? (
                            <CheckSquare className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                          )}
                          <span className="font-bold truncate">{t.name}</span>
                        </div>
                        {jkRole && (
                          <span className="px-2 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-700/60 text-[9px] font-black shrink-0">
                            {jkRole.committeeRole.startsWith('Penyelaras') ? 'Penyelaras' : 'AJK'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 4. FOKUS / PERBINCANGAN UTAMA + CADANG AGENDA PINTAR */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-[10px] font-black uppercase text-slate-300">
                    4. FOKUS / PERBINCANGAN UTAMA (1 BARIS = 1 SUB-AGENDA)
                  </label>
                  <button
                    type="button"
                    onClick={handleCadangAgendaPintar}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>CADANG AGENDA PINTAR</span>
                  </button>
                </div>

                <input
                  type="text"
                  value={memoAiHint}
                  onChange={(e) => setMemoAiHint(e.target.value)}
                  placeholder="Nota tambahan untuk AI (cth: fokus PBD TP1-TP2, persediaan hari sukan)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60"
                />

                <textarea
                  rows={4}
                  value={memoFokusText}
                  onChange={(e) => setMemoFokusText(e.target.value)}
                  placeholder="Masukkan topik fokus perbincangan sahaja (1 baris = 1 topik di bawah 2.4). Agenda wajib 2.1, 2.2, 2.3, 2.5 & 2.6 dijana automatik."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleSaveMemo(false)}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-wider cursor-pointer transition"
                >
                  SIMPAN MEMO
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveMemo(true)}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg cursor-pointer transition"
                >
                  <Send className="w-4 h-4" />
                  <span>HANTAR KE PAPARAN MAKLUMAN &amp; WHATSAPP</span>
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT LIVE A4 OFFICIAL LETTER PREVIEW */}
          <div className="xl:col-span-7 space-y-3">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-black uppercase tracking-wide text-white">
                Pratonton Surat / Memo Panggilan Mesyuarat Rasmi KPM (A4)
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const currentMemoDoc = allDocs.find((x) => x.id === memoDocId);
                  const driveLink = currentMemoDoc?.driveFileUrl || currentMemoDoc?.driveFolderUrl;
                  return (
                    <>
                      {driveLink && (
                        <a
                          href={driveLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-2 rounded-xl bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/60 text-xs font-black flex items-center gap-1.5 transition"
                        >
                          <span>📂 Buka di Google Drive Sekolah</span>
                        </a>
                      )}
                      <button
                        type="button"
                        disabled={syncingDriveDocId !== null}
                        onClick={async () => {
                          await handleSaveMemo(false);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/50 text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <span>
                          {syncingDriveDocId
                            ? '⏳ Menyegerak Drive...'
                            : '☁️ Hantar ke Drive Sekolah'}
                        </span>
                      </button>
                    </>
                  );
                })()}
                <button
                  type="button"
                  onClick={() => {
                    const res = downloadStandalonePrintHtml({
                      elementId: 'ai-setiausaha-memo-sheet',
                      title: memoTitle || 'Memo_Mesyuarat_KPM',
                      orientation: 'portrait',
                    });
                    setBannerMsg({ type: 'info', text: res.message });
                  }}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-700/50 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Muat Turun (.html)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const res = triggerSmartPrint({
                      elementId: 'ai-setiausaha-memo-sheet',
                      title: memoTitle || 'Memo_Mesyuarat_KPM',
                      orientation: 'portrait',
                    });
                    if (res.mode !== 'native') {
                      setBannerMsg({ type: 'info', text: res.message });
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase flex items-center gap-1.5 shadow cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>CETAK / EKSPORT PDF (A4)</span>
                </button>
              </div>
            </div>

            {/* A4 OFFICIAL KPM CALL NOTICE SHEET */}
            <div
              id="ai-setiausaha-memo-sheet"
              className="bg-white text-black rounded-2xl p-8 sm:p-10 shadow-2xl border border-slate-200 max-w-[794px] mx-auto space-y-4 text-[13px] leading-relaxed"
            >
              {/* Official Letterhead */}
              <div className="border-b-2 border-black pb-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <SchoolLogo
                    src={effectiveSchoolLogo}
                    schoolCode={effectiveSchoolCode}
                    className="w-16 h-16 bg-white border-slate-300 shrink-0"
                  />
                  <div>
                    <div className="text-base font-black uppercase tracking-wide">
                      {effectiveSchoolName}
                    </div>
                    <div className="text-[11px] font-bold text-slate-700">
                      KOD SEKOLAH: {effectiveSchoolCode} &bull; KEMENTERIAN PENDIDIKAN MALAYSIA
                    </div>
                    <div className="text-[11px] text-slate-600">
                      96350 Balingian, Mukah, Sarawak
                    </div>
                  </div>
                </div>
                <div className="border-2 border-black px-3 py-1.5 text-center shrink-0">
                  <div className="text-[10px] font-black uppercase tracking-wider">
                    MEMO DALAMAN / PANGGILAN
                  </div>
                  <div className="text-[10px] font-bold">{memoBilangan}</div>
                </div>
              </div>

              {/* Ruj. Kami & Tarikh */}
              <div className="flex justify-between text-xs pt-1">
                <div>
                  <strong>Ruj. Kami:</strong> {memoRujKami}
                </div>
                <div>
                  <strong>Tarikh:</strong> {memoTarikhSurat}
                </div>
              </div>

              {/* Kepada */}
              <div className="space-y-1">
                <div className="font-bold">Kepada:</div>
                <div className="pl-3 border-l-2 border-slate-400 text-xs space-y-0.5">
                  <div className="font-bold uppercase">
                    Ahli {selectedPortfolio.jawatankuasaInduk} ({memoSelectedTeachers.length} Orang):
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 pt-1">
                    {memoSelectedTeachers.map((t, i) => (
                      <div key={`${t.teacherId}_${i}`}>
                        {i + 1}. {t.teacherName}{' '}
                        <span className="text-[10px] text-slate-600">
                          ({t.committeeRole.startsWith('Penyelaras') ? 'Penyelaras' : 'AJK'})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div>Tuan / Puan,</div>

              {/* Bold Underlined Subject Title */}
              <div className="font-black underline uppercase text-sm">
                {memoTitle}
              </div>

              <p>
                1. Dengan segala hormatnya perkara di atas adalah dirujuk. Sukacita dimaklumkan bahawa{' '}
                <strong>{selectedPortfolio.jawatankuasaInduk}</strong> akan mengadakan mesyuarat seperti ketetapan berikut:
              </p>

              {/* Aligned Metadata Block */}
              <div className="pl-6 space-y-1 text-xs font-semibold">
                <div className="grid grid-cols-12">
                  <span className="col-span-3 font-bold">Tarikh</span>
                  <span className="col-span-9">: {memoTarikhMesyuarat}</span>
                </div>
                <div className="grid grid-cols-12">
                  <span className="col-span-3 font-bold">Masa</span>
                  <span className="col-span-9">: {memoMasa}</span>
                </div>
                <div className="grid grid-cols-12">
                  <span className="col-span-3 font-bold">Tempat</span>
                  <span className="col-span-9">: {memoTempat}</span>
                </div>
                <div className="grid grid-cols-12">
                  <span className="col-span-3 font-bold">Pengerusi</span>
                  <span className="col-span-9">
                    : {memoPengerusi} ({memoJawatanPengerusi})
                  </span>
                </div>
              </div>

              {/* Auto-numbered Agenda (2.1 - 2.6) */}
              <div className="space-y-1">
                <p>2. Agenda mesyuarat adalah seperti berikut:</p>
                <div className="pl-6 space-y-1 text-xs">
                  <div>2.1 Perutusan Pengerusi</div>
                  <div>2.2 Pengesahan Minit Mesyuarat Yang Lalu</div>
                  <div>2.3 Perkara-perkara Berbangkit</div>
                  <div>
                    <div>2.4 Fokus / Perbincangan Utama Mesyuarat:</div>
                    <div className="pl-5 space-y-0.5 mt-0.5">
                      {cleanFokusAgendaLines(memoFokusText).map((item, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <span>&bull;</span>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>2.5 Hal-hal Lain</div>
                  <div>2.6 Penutup</div>
                </div>
              </div>

              <p>
                3. Kehadiran dan kerjasama tuan/puan amatlah dihargai dan didahului dengan ucapan ribuan terima kasih.
              </p>

              <div>Sekian, terima kasih.</div>
              <div className="font-bold text-xs leading-snug">
                &ldquo;MALAYSIA MADANI&rdquo;
                <br />
                &ldquo;BERKHIDMAT UNTUK NEGARA&rdquo;
              </div>

              <div className="pt-4">
                <div>Saya yang menjalankan amanah,</div>
                <div className="mt-10 border-b border-black w-56" />
                <div className="font-black uppercase mt-1 text-xs">
                  ({(selectedPortfolio.assignedTeacherName || currentUser?.name || 'SETIAUSAHA').toUpperCase()})
                </div>
                <div className="text-xs">{selectedPortfolio.jawatanRasmi},</div>
                <div className="text-xs">{selectedPortfolio.jawatankuasaInduk}</div>
                <div className="text-[11px] text-slate-600 mt-2">
                  s.k. 1. Guru Besar {effectiveSchoolName} &bull; 2. Fail Induk ({selectedPortfolio.kodMySG})
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          5. TAB 3 — 3. MINIT PKPA 2/1991 (OFFICIAL MINUTES + BORANG MAKLUM BALAS)
         ==================================================================== */}
      {activeTab === 'MINIT' && selectedPortfolio && (
        <div className="space-y-4">
          {/* Top Import & View Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1">
              <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-300 text-[11px] font-black uppercase">
                IMPORT MEMO
              </span>
              <select
                value={minitSourceMemoId}
                onChange={(e) => {
                  const chosen = memoDocs.find((m) => m.id === e.target.value);
                  if (chosen) handleImportMemoIntoMinit(chosen);
                }}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold min-w-[250px] max-w-[360px] outline-none cursor-pointer"
              >
                <option value="">-- Pilih Memo / Makluman ({memoDocs.length}) --</option>
                {memoDocs.map((m, idx) => {
                  const isMakluman = String(m.id || '').startsWith('MAKLUMAN_MEMO_');
                  const yrs =
                    Array.isArray(m.academicYears) && m.academicYears.length > 0
                      ? m.academicYears.join(' & ')
                      : m.academicYear || selectedAcademicYear;
                  return (
                    <option key={`${m.id}_${idx}`} value={m.id}>
                      {isMakluman ? '[Makluman] ' : ''}[{m.tarikh} • Sesi {yrs}] {m.programTitle} ({(m.invitedTeachers || []).length} Ahli)
                    </option>
                  );
                })}
              </select>

              <span className="px-2.5 py-1 rounded-lg bg-teal-500/20 border border-teal-500/50 text-teal-300 text-[11px] font-black uppercase">
                BUKA MINIT ({minitDocs.length})
              </span>
              <select
                value={minitDocId}
                onChange={(e) => {
                  const chosen = minitDocs.find((m) => m.id === e.target.value);
                  if (chosen) handleLoadSavedMinit(chosen);
                }}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold min-w-[240px] max-w-[340px] outline-none cursor-pointer"
              >
                <option value="">-- Pilih Minit Tersimpan ({minitDocs.length}) --</option>
                {minitDocs.map((m, idx) => {
                  const yrs =
                    Array.isArray(m.academicYears) && m.academicYears.length > 0
                      ? m.academicYears.join(' & ')
                      : m.academicYear || selectedAcademicYear;
                  return (
                    <option key={`${m.id}_${idx}`} value={m.id}>
                      [{m.tarikh} • Sesi {yrs}] {m.programTitle}
                    </option>
                  );
                })}
              </select>

              {/* Session Scope Quick Toggle Pill */}
              <div className="inline-flex bg-slate-950 p-0.5 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setArchiveSessionScope('CURRENT')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black cursor-pointer transition ${
                    archiveSessionScope === 'CURRENT'
                      ? 'bg-teal-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Sesi {selectedAcademicYear}
                </button>
                <button
                  type="button"
                  onClick={() => setArchiveSessionScope('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black cursor-pointer transition ${
                    archiveSessionScope === 'ALL'
                      ? 'bg-teal-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Semua Sesi
                </button>
              </div>
            </div>

            {/* View Switcher Pills */}
            <div className="inline-flex bg-slate-950 p-1 rounded-xl border border-slate-800 gap-1">
              {[
                { id: 'BOTH', label: 'Minit + Maklum Balas' },
                { id: 'MINIT_ONLY', label: 'Minit Sahaja' },
                { id: 'MAKLUM_BALAS_ONLY', label: 'Borang Maklum Balas Sahaja' },
              ].map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setMinitViewMode(v.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black cursor-pointer transition ${
                    minitViewMode === v.id
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* LEFT EDITOR: EDITOR MINIT MESYUARAT (PKPA BIL. 2/1991) */}
            <div className="xl:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4" />
                  <span>EDITOR MINIT MESYUARAT (PKPA BIL. 2/1991)</span>
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setMinitDocId('');
                    setMinitSourceMemoId('');
                  }}
                  className="text-[11px] font-bold text-amber-300 hover:text-amber-200 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Minit Baharu</span>
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    TAJUK MINIT MESYUARAT
                  </label>
                  <input
                    type="text"
                    value={minitTitle}
                    onChange={(e) => setMinitTitle(e.target.value.toUpperCase())}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-black text-white uppercase"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                      Tarikh
                    </label>
                    <input
                      type="date"
                      value={minitTarikh}
                      onChange={(e) => setMinitTarikh(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                      Masa
                    </label>
                    <input
                      type="text"
                      value={minitMasa}
                      onChange={(e) => setMinitMasa(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                      Tempat
                    </label>
                    <input
                      type="text"
                      value={minitTempat}
                      onChange={(e) => setMinitTempat(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                      Pengerusi
                    </label>
                    <input
                      type="text"
                      value={minitPengerusi}
                      onChange={(e) => setMinitPengerusi(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                      Pencatat (Setiausaha)
                    </label>
                    <input
                      type="text"
                      value={minitPencatat}
                      onChange={(e) => setMinitPencatat(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                      Turut Hadir (jika ada)
                    </label>
                    <input
                      type="text"
                      value={minitTurutHadir}
                      onChange={(e) => setMinitTurutHadir(e.target.value)}
                      placeholder="cth: Pegawai SISC+ PPD..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>

                {/* KEHADIRAN AHLI (STRICT 1-TO-1 INHERITANCE) */}
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-[10px] font-black uppercase text-teal-300">
                      KEHADIRAN AHLI ({minitAttendance.filter((a) => a.status === 'HADIR').length}/
                      {minitAttendance.length} HADIR)
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setMinitAttendance((prev) =>
                          prev.map((a) => ({ ...a, status: 'HADIR', reason: '' }))
                        )
                      }
                      className="px-2.5 py-1 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-black cursor-pointer"
                    >
                      Tanda Semua Hadir
                    </button>
                  </div>

                  <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                    {minitAttendance.map((att, idx) => (
                      <div
                        key={`${att.teacherId}_${idx}`}
                        className="p-2 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-white truncate">
                            {idx + 1}. {att.teacherName}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {att.committeeRole}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setMinitAttendance((prev) =>
                                prev.map((x, i) =>
                                  i === idx ? { ...x, status: 'HADIR' } : x
                                )
                              )
                            }
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-black cursor-pointer ${
                              att.status === 'HADIR'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            Hadir
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setMinitAttendance((prev) =>
                                prev.map((x, i) =>
                                  i === idx
                                    ? {
                                        ...x,
                                        status: 'TIDAK_HADIR_BERSEBAB',
                                        reason: x.reason || 'Urusan Rasmi / Cuti',
                                      }
                                    : x
                                )
                              )
                            }
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-black cursor-pointer ${
                              att.status !== 'HADIR'
                                ? 'bg-amber-600 text-slate-950'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            Bersebab
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* BUTIRAN AGENDA & TINDAKAN (6 ITEM) */}
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-[10px] font-black uppercase text-amber-300">
                      BUTIRAN AGENDA &amp; TINDAKAN ({minitAgendaItems.length} ITEM)
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleFormalizeAllMinitPKPA}
                        className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 text-[10px] font-black uppercase flex items-center gap-1 shadow cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>AI RASMI PKPA</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setMinitAgendaItems((prev) => [
                            ...prev,
                            {
                              id: `ag-${Date.now()}`,
                              bil: `${prev.length + 1}.0`,
                              title: 'Perkara Tambahan',
                              rawKeywords: '',
                              formalText: '',
                              tindakan: 'Semua AJK',
                              statusMaklumBalas: 'Sedang diambil tindakan.',
                            },
                          ])
                        }
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-black cursor-pointer"
                      >
                        + Tambah
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                    {minitAgendaItems.map((item, idx) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={item.bil}
                            onChange={(e) =>
                              setMinitAgendaItems((prev) =>
                                prev.map((x, i) =>
                                  i === idx ? { ...x, bil: e.target.value } : x
                                )
                              )
                            }
                            className="w-14 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-black text-amber-300 text-center"
                          />
                          <input
                            type="text"
                            value={item.title}
                            onChange={(e) =>
                              setMinitAgendaItems((prev) =>
                                prev.map((x, i) =>
                                  i === idx ? { ...x, title: e.target.value } : x
                                )
                              )
                            }
                            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-bold text-white"
                          />
                        </div>

                        <input
                          type="text"
                          value={item.rawKeywords}
                          onChange={(e) =>
                            setMinitAgendaItems((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, rawKeywords: e.target.value } : x
                              )
                            )
                          }
                          placeholder="Nota Ringkas / Kata Kunci (中文 / BM)..."
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] text-teal-200"
                        />

                        <textarea
                          rows={2}
                          value={item.formalText}
                          onChange={(e) =>
                            setMinitAgendaItems((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, formalText: e.target.value } : x
                              )
                            )
                          }
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                        />

                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={item.tindakan}
                            onChange={(e) =>
                              setMinitAgendaItems((prev) =>
                                prev.map((x, i) =>
                                  i === idx ? { ...x, tindakan: e.target.value } : x
                                )
                              )
                            }
                            placeholder="TINDAKAN (cth: Makluman / Semua Guru)"
                            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-[11px] text-amber-300 font-bold"
                          />
                          <input
                            type="text"
                            value={item.statusMaklumBalas}
                            onChange={(e) =>
                              setMinitAgendaItems((prev) =>
                                prev.map((x, i) =>
                                  i === idx
                                    ? { ...x, statusMaklumBalas: e.target.value }
                                    : x
                                )
                              )
                            }
                            placeholder="Maklum Balas Pelaksanaan..."
                            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-[11px] text-slate-300"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSaveMinitPKPA}
                  className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase tracking-wider shadow-lg cursor-pointer transition"
                >
                  SIMPAN MINIT PKPA &amp; MAKLUM BALAS
                </button>
              </div>
            </div>

            {/* RIGHT LIVE A4 OFFICIAL DOCUMENT PREVIEW */}
            <div className="xl:col-span-7 space-y-3">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-black uppercase tracking-wide text-white">
                  Pratonton Rasmi PKPA Bil. 2/1991 &amp; Borang Maklum Balas (A4)
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(() => {
                    const currentMinitDoc = allDocs.find((x) => x.id === minitDocId);
                    const driveLink = currentMinitDoc?.driveFileUrl || currentMinitDoc?.driveFolderUrl;
                    return (
                      <>
                        {driveLink && (
                          <a
                            href={driveLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-2 rounded-xl bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/60 text-xs font-black flex items-center gap-1.5 transition"
                          >
                            <span>📂 Buka di Google Drive Sekolah</span>
                          </a>
                        )}
                        <button
                          type="button"
                          disabled={syncingDriveDocId !== null}
                          onClick={async () => {
                            await handleSaveMinitPKPA();
                          }}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/50 text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <span>
                            {syncingDriveDocId
                              ? '⏳ Menyegerak Drive...'
                              : '☁️ Hantar ke Drive Sekolah'}
                          </span>
                        </button>
                      </>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => {
                      const res = downloadStandalonePrintHtml({
                        elementId: 'ai-setiausaha-minit-sheet',
                        title: minitTitle || 'Minit_Mesyuarat_PKPA',
                        orientation: 'portrait',
                      });
                      setBannerMsg({ type: 'info', text: res.message });
                    }}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-700/50 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Muat Turun (.html)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const res = triggerSmartPrint({
                        elementId: 'ai-setiausaha-minit-sheet',
                        title: minitTitle || 'Minit_Mesyuarat_PKPA',
                        orientation: 'portrait',
                      });
                      if (res.mode !== 'native') {
                        setBannerMsg({ type: 'info', text: res.message });
                      }
                    }}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase flex items-center gap-1.5 shadow cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>CETAK / EKSPORT PDF (A4)</span>
                  </button>
                </div>
              </div>

              <div
                id="ai-setiausaha-minit-sheet"
                className="bg-white text-black rounded-2xl p-8 sm:p-10 shadow-2xl border border-slate-200 max-w-[794px] mx-auto space-y-6 text-xs leading-relaxed"
              >
                {/* PART A: MINIT MESYUARAT PKPA BIL. 2/1991 */}
                {(minitViewMode === 'BOTH' || minitViewMode === 'MINIT_ONLY') && (
                  <div className="space-y-4">
                    <div className="text-center border-b-2 border-black pb-3 space-y-1">
                      <SchoolLogo
                        src={effectiveSchoolLogo}
                        schoolCode={effectiveSchoolCode}
                        className="w-14 h-14 mx-auto bg-white border-slate-300"
                      />
                      <div className="font-black text-sm uppercase">
                        {effectiveSchoolName} ({effectiveSchoolCode})
                      </div>
                      <div className="font-black text-sm underline uppercase pt-1">
                        {minitTitle}
                      </div>
                    </div>

                    {/* 2-Column Metadata Table */}
                    <table className="w-full border-collapse border border-black text-xs">
                      <tbody>
                        <tr>
                          <td className="border border-black px-3 py-1.5 font-bold w-36 bg-slate-50">
                            Tarikh
                          </td>
                          <td className="border border-black px-3 py-1.5">{minitTarikh}</td>
                        </tr>
                        <tr>
                          <td className="border border-black px-3 py-1.5 font-bold bg-slate-50">
                            Masa
                          </td>
                          <td className="border border-black px-3 py-1.5">{minitMasa}</td>
                        </tr>
                        <tr>
                          <td className="border border-black px-3 py-1.5 font-bold bg-slate-50">
                            Tempat
                          </td>
                          <td className="border border-black px-3 py-1.5">{minitTempat}</td>
                        </tr>
                        <tr>
                          <td className="border border-black px-3 py-1.5 font-bold bg-slate-50">
                            Pengerusi
                          </td>
                          <td className="border border-black px-3 py-1.5 font-bold">
                            {minitPengerusi}
                          </td>
                        </tr>
                        <tr>
                          <td className="border border-black px-3 py-1.5 font-bold bg-slate-50">
                            Pencatat
                          </td>
                          <td className="border border-black px-3 py-1.5">{minitPencatat}</td>
                        </tr>
                      </tbody>
                    </table>

                    {/* 2-Column Numbered KEHADIRAN Roster */}
                    <div className="border border-black p-3 space-y-2">
                      <div className="font-black uppercase underline">
                        KEHADIRAN ({minitAttendance.filter((a) => a.status === 'HADIR').length} /{' '}
                        {minitAttendance.length} ORANG):
                      </div>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                        {minitAttendance
                          .filter((a) => a.status === 'HADIR')
                          .map((a, i) => (
                            <div key={`${a.teacherId}_${i}`}>
                              {i + 1}. <strong>{a.teacherName}</strong> ({a.committeeRole})
                            </div>
                          ))}
                      </div>
                      {minitAttendance.some((a) => a.status !== 'HADIR') && (
                        <div className="pt-2 border-t border-slate-300">
                          <div className="font-bold">Tidak Hadir (Bersebab):</div>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
                            {minitAttendance
                              .filter((a) => a.status !== 'HADIR')
                              .map((a, i) => (
                                <div key={`abs_${i}`}>
                                  {i + 1}. {a.teacherName} ({a.reason || 'Bersebab'})
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                      {minitTurutHadir && (
                        <div className="pt-1 border-t border-slate-300">
                          <strong>Turut Hadir:</strong> {minitTurutHadir}
                        </div>
                      )}
                    </div>

                    {/* Formal 3-Column PKPA Table */}
                    <table className="w-full border-collapse border border-black text-xs">
                      <thead>
                        <tr className="bg-slate-100">
                          <th className="border border-black px-2 py-2 text-center w-14 font-black">
                            BIL.
                          </th>
                          <th className="border border-black px-3 py-2 text-left font-black">
                            AGENDA / PERKARA &amp; KEPUTUSAN MESYUARAT
                          </th>
                          <th className="border border-black px-2.5 py-2 text-center w-36 font-black">
                            TINDAKAN
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {minitAgendaItems.map((ag) => (
                          <tr key={ag.id}>
                            <td className="border border-black px-2 py-2 text-center font-bold align-top">
                              {ag.bil}
                            </td>
                            <td className="border border-black px-3 py-2 align-top space-y-1">
                              <div className="font-black uppercase underline">{ag.title}</div>
                              <div className="whitespace-pre-line">{ag.formalText}</div>
                            </td>
                            <td className="border border-black px-2.5 py-2 text-center font-bold align-top">
                              {ag.tindakan}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="grid grid-cols-2 gap-8 pt-6">
                      <div>
                        <div>Disediakan oleh,</div>
                        <div className="mt-10 border-b border-black w-48" />
                        <div className="font-black uppercase mt-1">{minitPencatat}</div>
                        <div>Setiausaha Mesyuarat</div>
                      </div>
                      <div>
                        <div>Disahkan oleh,</div>
                        <div className="mt-10 border-b border-black w-48" />
                        <div className="font-black uppercase mt-1">{minitPengerusi}</div>
                        <div>Pengerusi Mesyuarat</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* PART B: BORANG MAKLUM BALAS MINIT MESYUARAT (PKPA BIL. 2/1991) */}
                {(minitViewMode === 'BOTH' || minitViewMode === 'MAKLUM_BALAS_ONLY') && (
                  <div className="pt-6 border-t-2 border-dashed border-slate-400 space-y-3">
                    <div className="text-center">
                      <div className="font-black text-sm uppercase underline">
                        BORANG MAKLUM BALAS MINIT MESYUARAT (PKPA BIL. 2 TAHUN 1991)
                      </div>
                      <div className="text-xs font-bold mt-0.5">{minitTitle}</div>
                    </div>

                    <table className="w-full border-collapse border border-black text-xs">
                      <thead>
                        <tr className="bg-slate-100">
                          <th className="border border-black px-2 py-1.5 w-12 text-center">
                            BIL.
                          </th>
                          <th className="border border-black px-2 py-1.5 w-20 text-center">
                            PARA
                          </th>
                          <th className="border border-black px-2.5 py-1.5 text-left">
                            PERKARA / KEPUTUSAN MESYUARAT
                          </th>
                          <th className="border border-black px-2 py-1.5 w-28 text-center">
                            TINDAKAN
                          </th>
                          <th className="border border-black px-2.5 py-1.5 text-left">
                            STATUS PELAKSANAAN / MAKLUM BALAS
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {minitAgendaItems
                          .filter(
                            (x) =>
                              x.tindakan &&
                              String(x.tindakan || '').trim().toLowerCase() !== 'makluman' &&
                              x.statusMaklumBalas !== '-'
                          )
                          .map((x, i) => (
                            <tr key={`mb_${x.id}`}>
                              <td className="border border-black px-2 py-1.5 text-center">
                                {i + 1}
                              </td>
                              <td className="border border-black px-2 py-1.5 text-center font-bold">
                                {x.bil}
                              </td>
                              <td className="border border-black px-2.5 py-1.5">
                                <div className="font-bold">{x.title}</div>
                                <div className="text-[11px]">{x.formalText}</div>
                              </td>
                              <td className="border border-black px-2 py-1.5 text-center font-bold">
                                {x.tindakan}
                              </td>
                              <td className="border border-black px-2.5 py-1.5">
                                {x.statusMaklumBalas}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          6. TAB 4 — 4. SURAT LANTIKAN MYSG (BERSEPADU + KERATAN AKUAN PENERIMAAN)
         ==================================================================== */}
      {activeTab === 'LANTIKAN' && selectedPortfolio && (
        <div className="space-y-4">
          {/* Top Controls Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="inline-flex bg-slate-950 p-1 rounded-xl border border-slate-800 gap-1">
                <button
                  type="button"
                  onClick={() => setLantikanMode('INDIVIDU_BERSEPADU')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 cursor-pointer transition ${
                    lantikanMode === 'INDIVIDU_BERSEPADU'
                      ? 'bg-purple-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Lantikan Bersepadu Guru (Penyelaras + AJK)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLantikanMode('IKUT_PORTFOLIO')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 cursor-pointer transition ${
                    lantikanMode === 'IKUT_PORTFOLIO'
                      ? 'bg-purple-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Award className="w-3.5 h-3.5" />
                  <span>Lantikan Jawatankuasa Semasa ({selectedPortfolio.kodMySG})</span>
                </button>
              </div>

              {lantikanMode === 'INDIVIDU_BERSEPADU' && (
                <select
                  value={lantikanTeacherKey}
                  onChange={(e) => setLantikanTeacherKey(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold outline-none cursor-pointer"
                >
                  {teacherRoster.map((t, idx) => (
                    <option key={`${t.id}_${idx}`} value={t.name}>
                      {t.name} ({t.role})
                    </option>
                  ))}
                </select>
              )}

              <input
                type="date"
                value={lantikanTarikhSurat}
                onChange={(e) => setLantikanTarikhSurat(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />

              <input
                type="text"
                value={lantikanRujKami}
                onChange={(e) => setLantikanRujKami(e.target.value)}
                placeholder="No. Rujukan Surat"
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono w-56"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={syncingDriveDocId !== null}
                onClick={async () => {
                  const lantikanDoc: AISetiausahaDocument = {
                    id: scopedDocId(
                      effectiveSchoolCode,
                      `lantikan_${selectedAcademicYear}_${Date.now()}`
                    ),
                    docKind: 'SURAT_LANTIKAN',
                    schoolCode: effectiveSchoolCode,
                    academicYear: selectedAcademicYear,
                    academicYears: [selectedAcademicYear],
                    skpmBucket: 'STD_1_KEPIMPINAN',
                    skpmCodeBadge: lantikanRujKami,
                    programTitle:
                      lantikanMode === 'IKUT_PORTFOLIO'
                        ? `SURAT LANTIKAN ${selectedPortfolio.jawatankuasaInduk} (${selectedPortfolio.assignedTeacherName || 'PENYELARAS'})`
                        : `SURAT LANTIKAN BERSEPADU MYSG (${selectedTeacherLantikanSummary.teacherName})`,
                    tarikh: lantikanTarikhSurat,
                  };
                  await handleSyncSavedDocToDrive(lantikanDoc, 'ai-setiausaha-lantikan-sheet');
                }}
                className="px-3.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/50 text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <span>
                  {syncingDriveDocId ? '⏳ Menyegerak Drive...' : '☁️ Hantar ke Drive Sekolah'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const res = downloadStandalonePrintHtml({
                    elementId: 'ai-setiausaha-lantikan-sheet',
                    title: `Surat_Lantikan_MySG_Sesi_${selectedAcademicYear}`,
                    orientation: 'portrait',
                  });
                  setBannerMsg({ type: 'info', text: res.message });
                }}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-700/50 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Muat Turun (.html)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const res = triggerSmartPrint({
                    elementId: 'ai-setiausaha-lantikan-sheet',
                    title: `Surat_Lantikan_MySG_Sesi_${selectedAcademicYear}`,
                    orientation: 'portrait',
                  });
                  if (res.mode !== 'native') {
                    setBannerMsg({ type: 'info', text: res.message });
                  }
                }}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase flex items-center gap-1.5 shadow cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>CETAK / EKSPORT PDF (A4)</span>
              </button>
            </div>
          </div>

          {/* A4 OFFICIAL SURAT LANTIKAN MYSG + KERATAN AKUAN PENERIMAAN */}
          <div
            id="ai-setiausaha-lantikan-sheet"
            className="bg-white text-black rounded-2xl p-8 sm:p-10 shadow-2xl border border-slate-200 max-w-[794px] mx-auto space-y-4 text-xs leading-relaxed"
          >
            {/* Official Letterhead */}
            <div className="border-b-2 border-black pb-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <SchoolLogo
                  src={effectiveSchoolLogo}
                  schoolCode={effectiveSchoolCode}
                  className="w-16 h-16 bg-white border-slate-300 shrink-0"
                />
                <div>
                  <div className="text-base font-black uppercase tracking-wide">
                    {effectiveSchoolName}
                  </div>
                  <div className="text-[11px] font-bold text-slate-700">
                    KOD SEKOLAH: {effectiveSchoolCode} &bull; KEMENTERIAN PENDIDIKAN MALAYSIA
                  </div>
                  <div className="text-[11px] text-slate-600">
                    96350 Balingian, Mukah, Sarawak
                  </div>
                </div>
              </div>
              <div className="border-2 border-black px-3 py-1 text-center shrink-0">
                <div className="text-[10px] font-black uppercase">WATIKAH PELANTIKAN MYSG</div>
                <div className="text-[10px] font-bold">SESI {selectedAcademicYear}</div>
              </div>
            </div>

            <div className="flex justify-between pt-1">
              <div>
                <strong>Ruj. Kami:</strong> {lantikanRujKami}
              </div>
              <div>
                <strong>Tarikh:</strong> {lantikanTarikhSurat}
              </div>
            </div>

            <div>
              <div>Kepada,</div>
              <div className="font-black uppercase text-sm">
                {lantikanMode === 'INDIVIDU_BERSEPADU'
                  ? selectedTeacherLantikanSummary.teacherName
                  : selectedPortfolio.assignedTeacherName || selectedTeacherLantikanSummary.teacherName}
              </div>
              <div>Pegawai Perkhidmatan Pendidikan,</div>
              <div>{effectiveSchoolName}</div>
            </div>

            <div>Tuan / Puan,</div>

            <div className="font-black underline uppercase text-xs">
              PELANTIKAN RASMI JAWATANKUASA PENGURUSAN SEKOLAH (MYSG &amp; SKPM KUALITI@SEKOLAH) BAGI SESI PERSEKOLAHAN {selectedAcademicYear}
            </div>

            <p>Dengan segala hormatnya perkara di atas adalah dirujuk.</p>

            <p>
              2. Sukacita dimaklumkan bahawa pihak pengurusan <strong>{effectiveSchoolName}</strong> dengan kuasa yang diberikan melantik tuan/puan secara rasmi untuk menjalankan tugas dalam Jawatankuasa Pengurusan Sekolah bagi <strong>Sesi Persekolahan {selectedAcademicYear}</strong> seperti perincian berikut:
            </p>

            {lantikanMode === 'INDIVIDU_BERSEPADU' ? (
              <div className="space-y-3">
                {/* Table A: Penyelaras Utama */}
                <div>
                  <div className="font-black uppercase bg-slate-100 border border-black px-2.5 py-1 text-[11px]">
                    A. LANTIKAN PENYELARAS / SETIAUSAHA / KETUA PANITIA (JUMLAH BEBAN: {selectedTeacherLantikanSummary.totalMata} MATA)
                  </div>
                  {selectedTeacherLantikanSummary.penyelarasRoles.length > 0 ? (
                    <table className="w-full border-collapse border border-black text-[11px]">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="border border-black px-2 py-1 w-8 text-center">Bil</th>
                          <th className="border border-black px-2 py-1 text-left w-36">Kod MySG</th>
                          <th className="border border-black px-2 py-1 text-left">
                            Jawatankuasa &amp; Jawatan Rasmi
                          </th>
                          <th className="border border-black px-2 py-1 text-left">
                            Perincian Tugas MySG &amp; Standard SKPM
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedTeacherLantikanSummary.penyelarasRoles.map((r, i) => (
                          <tr key={`${r.kodMySG}_${i}`}>
                            <td className="border border-black px-2 py-1 text-center">{i + 1}</td>
                            <td className="border border-black px-2 py-1 font-mono font-bold">
                              {r.kodMySG}
                            </td>
                            <td className="border border-black px-2 py-1">
                              <div className="font-bold">{r.jawatanRasmi}</div>
                              <div>{r.jawatankuasaInduk}</div>
                            </td>
                            <td className="border border-black px-2 py-1">
                              <div>{r.perincianTugas}</div>
                              <div className="text-[10px] font-bold text-slate-600">
                                {r.skpmCodeDisplay} ({r.tahapBeban} &bull; {r.mataBeban}m)
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="border border-black px-3 py-1.5 italic">
                      Tiada lantikan Penyelaras Utama direkodkan dalam Master Data bagi Sesi {selectedAcademicYear}.
                    </div>
                  )}
                </div>

                {/* Table B: Ahli Jawatankuasa (AJK) */}
                <div>
                  <div className="font-black uppercase bg-slate-100 border border-black px-2.5 py-1 text-[11px]">
                    B. LANTIKAN AHLI JAWATANKUASA (AJK) ({selectedTeacherLantikanSummary.ahliRoles.length} JAWATANKUASA &bull; 0 MATA BEBAN)
                  </div>
                  {selectedTeacherLantikanSummary.ahliRoles.length > 0 ? (
                    <table className="w-full border-collapse border border-black text-[11px]">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="border border-black px-2 py-1 w-8 text-center">Bil</th>
                          <th className="border border-black px-2 py-1 text-left w-36">Kod MySG</th>
                          <th className="border border-black px-2 py-1 text-left">
                            Jawatankuasa Induk
                          </th>
                          <th className="border border-black px-2 py-1 text-left">
                            Peranan &amp; Rujukan SKPM
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedTeacherLantikanSummary.ahliRoles.map((r, i) => (
                          <tr key={`ajk_${r.kodMySG}_${i}`}>
                            <td className="border border-black px-2 py-1 text-center">{i + 1}</td>
                            <td className="border border-black px-2 py-1 font-mono font-bold">
                              {r.kodMySG}
                            </td>
                            <td className="border border-black px-2 py-1 font-bold">
                              {r.jawatankuasaInduk}
                            </td>
                            <td className="border border-black px-2 py-1">
                              Ahli Jawatankuasa (AJK) &bull; {r.skpmCodeDisplay}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="border border-black px-3 py-1.5 italic">
                      Tiada keahlian Ahli Jawatankuasa (AJK) tambahan direkodkan bagi Sesi {selectedAcademicYear}.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <table className="w-full border-collapse border border-black text-xs">
                <tbody>
                  <tr>
                    <td className="border border-black px-3 py-1.5 font-bold bg-slate-50 w-44">
                      Kod Portfolio MySG
                    </td>
                    <td className="border border-black px-3 py-1.5 font-mono font-bold">
                      {selectedPortfolio.kodMySG}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black px-3 py-1.5 font-bold bg-slate-50">
                      Jawatankuasa Induk
                    </td>
                    <td className="border border-black px-3 py-1.5 font-bold">
                      {selectedPortfolio.jawatankuasaInduk}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black px-3 py-1.5 font-bold bg-slate-50">
                      Jawatan Rasmi
                    </td>
                    <td className="border border-black px-3 py-1.5 font-bold">
                      {selectedPortfolio.jawatanRasmi} ({selectedPortfolio.tahapBeban} &bull; {selectedPortfolio.mataBeban} Mata)
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black px-3 py-1.5 font-bold bg-slate-50">
                      Rujukan Standard SKPM
                    </td>
                    <td className="border border-black px-3 py-1.5">
                      {selectedPortfolio.skpmCodeDisplay} — {selectedPortfolio.skpmAspekTitle}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black px-3 py-1.5 font-bold bg-slate-50">
                      Perincian Tugas MySG
                    </td>
                    <td className="border border-black px-3 py-1.5">
                      {selectedPortfolio.perincianTugas}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black px-3 py-1.5 font-bold bg-slate-50">
                      Senarai Ahli Jawatankuasa
                    </td>
                    <td className="border border-black px-3 py-1.5">
                      {(selectedPortfolio.ahliList || []).length > 0
                        ? (selectedPortfolio.ahliList || []).map((a) => a.teacherName).join(', ')
                        : 'Tiada AJK tambahan direkodkan'}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}

            <p>
              3. Semoga dengan pelantikan ini, tuan/puan dapat melaksanakan amanah dan tanggungjawab secara profesional demi kecemerlangan murid dan sekolah.
            </p>

            <div className="font-bold">
              &ldquo;MALAYSIA MADANI&rdquo;
              <br />
              &ldquo;BERKHIDMAT UNTUK NEGARA&rdquo;
            </div>

            <div className="pt-3">
              <div>Saya yang menjalankan amanah,</div>
              <div className="mt-8 border-b border-black w-52" />
              <div className="font-black uppercase mt-1">({principalName})</div>
              <div>Guru Besar, {effectiveSchoolName}</div>
            </div>

            {/* TEAR-OFF SURAT AKUAN PENERIMAAN LANTIKAN */}
            <div className="pt-4 mt-4 border-t-2 border-dashed border-black space-y-2 text-[11px]">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-600">
                <span className="flex items-center gap-1">
                  <Scissors className="w-3.5 h-3.5" />
                  <span>KERATAN AKUAN PENERIMAAN LANTIKAN (POTONG &amp; KEMBALIKAN KEPADA PK PENTADBIRAN)</span>
                </span>
                <span>SESI {selectedAcademicYear}</span>
              </div>

              <div className="font-black uppercase underline text-center">
                SURAT AKUAN PENERIMAAN PELANTIKAN JAWATANKUASA PENGURUSAN SEKOLAH (MYSG) SESI {selectedAcademicYear}
              </div>

              <p>
                Saya,{' '}
                <strong>
                  {lantikanMode === 'INDIVIDU_BERSEPADU'
                    ? selectedTeacherLantikanSummary.teacherName
                    : selectedPortfolio.assignedTeacherName || selectedTeacherLantikanSummary.teacherName}
                </strong>
                , dengan ini mengesahkan bahawa saya <strong>MENERIMA</strong> pelantikan rasmi dalam Jawatankuasa Pengurusan Sekolah bagi Sesi Persekolahan {selectedAcademicYear} seperti yang dinyatakan dalam surat rujukan <strong>{lantikanRujKami}</strong> dan berjanji akan melaksanakan amanah tersebut mengikut piawaian SKPM Kualiti@Sekolah.
              </p>

              <div className="grid grid-cols-2 gap-8 pt-4">
                <div>
                  <div>Tandatangan Guru: ................................................</div>
                  <div className="mt-1">
                    Nama:{' '}
                    <strong>
                      {lantikanMode === 'INDIVIDU_BERSEPADU'
                        ? selectedTeacherLantikanSummary.teacherName
                        : selectedPortfolio.assignedTeacherName || selectedTeacherLantikanSummary.teacherName}
                    </strong>
                  </div>
                </div>
                <div>
                  <div>Tarikh: ................................................</div>
                  <div className="mt-1">Disaksikan oleh: Guru Besar / PK Pentadbiran</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BORANG SPPK 1, 2 & 3 MODAL */}
      <SPPKCompetitionFormsModal
        isOpen={Boolean(sppkModalData)}
        onClose={() => setSppkModalData(null)}
        schoolCode={effectiveSchoolCode}
        schoolName={effectiveSchoolName}
        schoolLogo={effectiveSchoolLogo}
        schoolSettings={schoolSettings}
        currentUser={currentUser}
        initialData={sppkModalData}
      />
    </div>
  );
};

export default AISetiausahaHub;
