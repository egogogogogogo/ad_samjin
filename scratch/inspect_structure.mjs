
import XLSX from 'xlsx';

const filename = '삼진_Gasket 생산관리_R07_20260113_raw.xlsx';

function inspectRawStructure() {
    const workbook = XLSX.readFile(filename);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    console.log("--- [엑셀 헤더 및 상위 데이터 정밀 조사] ---");
    
    // 상위 10개 행의 모든 컬럼을 출력하여 구조 파악
    rows.slice(0, 10).forEach((row, i) => {
        console.log(`[Row ${i+1}] ${JSON.stringify(row).slice(0, 200)}...`);
    });

    // 날짜 컬럼(A열)의 하위 데이터들도 확인 (변화가 생기는 지점)
    console.log("\n--- [A열 날짜 데이터 변화 추적] ---");
    for (let i = 2; i < rows.length; i += 20) {
        if (rows[i]) console.log(`[Row ${i+1}] A열 값: ${rows[i][0]}`);
    }
}

inspectRawStructure();
