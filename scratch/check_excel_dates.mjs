
import XLSX from 'xlsx';

const filename = '삼진_Gasket 생산관리_R07_20260113_raw.xlsx';

function checkExcelDates() {
    const workbook = XLSX.readFile(filename);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const validRows = rows.slice(2).filter(row => row[0]);
    console.log(`총 데이터 행 수: ${validRows.length}개`);
    
    const yearSet = new Set();
    const monthSet = new Set();

    validRows.slice(0, 5).forEach((row, i) => {
        console.log(`[Row ${i+3} Date Sample] Raw: ${row[0]}, Type: ${typeof row[0]}`);
    });

    validRows.forEach(row => {
        let dateObj;
        const rawDate = row[0];
        if (rawDate instanceof Date) dateObj = rawDate;
        else if (typeof rawDate === 'number') dateObj = new Date((rawDate - 25569) * 864e5);
        else dateObj = new Date(rawDate);

        if (!isNaN(dateObj.getTime())) {
            yearSet.add(dateObj.getFullYear());
            monthSet.add(dateObj.getMonth() + 1);
        }
    });

    console.log(`\n데이터에 존재하는 연도: ${Array.from(yearSet).join(', ')}`);
    console.log(`데이터에 존재하는 월: ${Array.from(monthSet).join(', ')}`);
}

checkExcelDates();
