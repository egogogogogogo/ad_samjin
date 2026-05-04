
import XLSX from 'xlsx';

const filename = '삼진_Gasket 생산관리_R07_20260113_raw.xlsx';

function debugRowByRow() {
    const workbook = XLSX.readFile(filename);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const dataRows = rows.slice(2);
    let totalFound = 0;

    console.log("--- [행별 상세 샘플 수 점검] ---");
    
    dataRows.forEach((row, i) => {
        const rawDate = row[0];
        if (!rawDate) return;

        // AF(31) ~ AQ(42) 추출
        const samples = row.slice(31, 43)
            .map(v => v === undefined || v === null ? "" : v) // 공란 유지
            .filter(v => v !== ""); // 진짜 데이터만 필터링
        
        const validSamples = samples.filter(v => typeof v === 'number' && v > 10); // 10N 미만(허수) 제외 시도

        if (samples.length > 0) {
            console.log(`[Row ${i+3}] Date: ${rawDate}, Total Cells: ${samples.length}, Valid(>10N): ${validSamples.length}`);
            totalFound += samples.length;
        }
    });

    console.log(`\n전체 발견된 데이터 셀 수 (공란 제외): ${totalFound}`);
}

debugRowByRow();
