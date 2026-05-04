
import XLSX from 'xlsx';

const filename = '삼진_Gasket 생산관리_R07_20260113_raw.xlsx';

function findColumnNames() {
    const workbook = XLSX.readFile(filename);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const h1 = rows[0];
    const h2 = rows[1];

    console.log("--- [헤더 분석 결과] ---");
    h2.forEach((name, i) => {
        const topHeader = h1[i] || "";
        console.log(`Col ${i} (${XLSX.utils.encode_col(i)}): ${topHeader} > ${name}`);
    });
}

findColumnNames();
