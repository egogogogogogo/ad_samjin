
import XLSX from 'xlsx';

const filename = '삼진_Gasket 생산관리_R07_20260113_raw.xlsx';

function verifyExactExcel() {
    const workbook = XLSX.readFile(filename);
    console.log(`--- [파일 정보] ---`);
    console.log(`시트 목록: ${workbook.SheetNames.join(', ')}`);
    
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    console.log(`\n--- [시트: ${sheetName} / 상위 5개 행 데이터 (A~AQ)] ---`);
    rows.slice(0, 5).forEach((row, i) => {
        // A(0)부터 AQ(42)까지 출력
        const data = row.slice(0, 43).map(v => v === undefined ? "null" : v);
        console.log(`[Row ${i+1}]: ${data.join(' | ')}`);
    });
}

verifyExactExcel();
