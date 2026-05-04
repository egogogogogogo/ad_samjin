
import XLSX from 'xlsx';

const filename = 'JML_MES_R07_Standard_v13.xlsx';

function simulateWebUploadAllMonths() {
    console.log(`--- [웹 프론트엔드 업로드 로직 전체 월 디버깅] ---`);
    const workbook = XLSX.readFile(filename);
    const inputSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(inputSheet, { header: 1 });
    
    const validRows = rows.slice(2).filter(row => row[0]);
    console.log(`총 유효 데이터 행 수: ${validRows.length}`);
    
    validRows.forEach((row, index) => {
        let work_date = "Unknown";
        if (typeof row[0] === 'number') {
            work_date = new Date((row[0] - 25569) * 864e5).toISOString().split('T')[0];
        }

        // 웹 코드 로직: AF(31) ~ AQ(42)
        const c_raw = row.slice(31, 43).map(v => Number(v) || 0).filter(v => v > 0);
        
        // 400 미만 데이터 탐지
        const lowValues = c_raw.filter(v => v < 400);
        if (lowValues.length > 0) {
            console.log(`\n🚨 [웹 파싱 이상 데이터 발견] 날짜: ${work_date} (Row ${index + 3})`);
            console.log(`웹 코드가 추출한 12개 샘플(31~42열): [${c_raw.join(', ')}]`);
            console.log(`=> 발견된 비정상 저점: ${lowValues.join(', ')}`);
        }
    });
}

simulateWebUploadAllMonths();
