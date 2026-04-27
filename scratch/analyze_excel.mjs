import XLSX from 'xlsx';
import path from 'path';

const filePath = 'c:\\Users\\jmlee\\Desktop\\NEXT\\Web service\\samjin\\삼진_Gasket 생산관리_R07_20260113_raw.xlsx';
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

console.log('--- Row 1 (Headers) ---');
console.log(JSON.stringify(rows[0]));
console.log('--- Row 2 (Sub-headers) ---');
console.log(JSON.stringify(rows[1]));
console.log('--- Row 3 (Sample Data) ---');
console.log(JSON.stringify(rows[2]));
console.log('--- Total Columns ---');
console.log(rows[0]?.length);
