import XLSX from 'xlsx';
import path from 'path';

const filePath = 'c:\\Users\\jmlee\\Desktop\\NEXT\\Web service\\samjin\\JML_MES_R07_Standard_v13.xlsx';
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

console.log('--- SHEET NAME ---');
console.log(sheetName);

console.log('\n--- ROW 1 (Group Headers) ---');
console.log(JSON.stringify(rows[0]));

console.log('\n--- ROW 2 (Machine/Category Headers) ---');
console.log(JSON.stringify(rows[1]));

console.log('\n--- ROW 3 (Sample Data) ---');
console.log(JSON.stringify(rows[2]));

console.log('\n--- Column Mapping Analysis ---');
const headers = rows[1] || [];
headers.forEach((h, i) => {
    if (h && (h.includes('성형') || h.includes('조립') || h.includes('릴포장') || h.includes('최종검사') || h.includes('Date') || h.includes('날짜'))) {
        console.log(`Col ${i}: ${h}`);
    }
});
