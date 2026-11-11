import * as XLSX from 'xlsx';

const sheetId = '1tzOstK0V3JuydgzbfZNg9Dy5Aa1jbVNl3maTqObvV-U';
const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;

async function main() {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  console.log('HTTP status:', res.status, res.statusText);
  const rawCsvText = await res.text();
  const workbook = XLSX.read(rawCsvText, { type: 'string', raw: false });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows2D = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '', raw: false });

  console.log('Sheet Name:', firstSheetName);
  console.log('Total 2D rows:', rows2D.length);
  const banner = rows2D[0].find((c: any) => String(c).trim()) || '';
  console.log('Banner Title:', banner);

  const headers = rows2D[2].map((h: any) => String(h).trim().replace(/\r?\n/g, ' '));
  console.log('Headers:', headers.filter(Boolean));

  for (let i = 3; i < rows2D.length; i++) {
    const row = rows2D[i];
    if (!row || row.every((c: any) => !c || String(c).trim() === '')) {
      console.log(`Row ${i + 1}: EMPTY ROW`);
      continue;
    }
    const bil = row[0];
    const nama = row[1];
    const jan = row[2];
    const fail = row[3];
    const kp = row[4];
    const gred = row[5];
    const jawatan = row[6];
    const major = row[10];
    const minor = row[11];
    const email = row[16];
    console.log(`Row ${i + 1} | BIL: ${bil} | NAMA: ${nama} | KP: ${kp ? kp.slice(0, 6) + '******' : '-'} | FAIL: ${fail} | GRED: ${gred} | JAWATAN: ${jawatan} | MAJOR: ${major} | MINOR: ${minor} | EMAIL: ${email}`);
  }
}

main();
