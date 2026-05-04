
import XLSX from 'xlsx';

const filename = '삼진_Gasket 생산관리_R07_20260113_raw.xlsx'; // 또 다른 원본 의심 파일

function simulateWebUploadOtherFile() {
    console.log(`--- [웹 프론트엔드 파싱 로직 디버깅 (R07_raw 파일)] ---`);
    try {
        const workbook = XLSX.readFile(filename);
        const inputSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(inputSheet, { header: 1 });
        
        const validRows = rows.slice(2).filter(row => row[0]);
        console.log(`총 유효 데이터 행 수: ${validRows.length}`);
        
        let errorCount = 0;
        validRows.forEach((row, index) => {
            let work_date = "Unknown";
            if (typeof row[0] === 'number') {
                work_date = new Date((row[0] - 25569) * 864e5).toISOString().split('T')[0];
            }

            // 웹 코드 로직: AF(31) ~ AQ(42) 고정 인덱스 파싱
            const c_raw = row.slice(31, 43).map(v => Number(v) || 0).filter(v => v > 0);
            
            // 400 미만 데이터 탐지 (사용자가 지적한 290~300대 저점)
            const lowValues = c_raw.filter(v => v < 400);
            if (lowValues.length > 0) {
                if (errorCount < 5) { // 로그가 너무 길어지지 않게 5개만 상세 출력
                    console.log(`\n🚨 [웹 파싱 대참사 발견] 날짜: ${work_date} (Row ${index + 3})`);
                    console.log(`웹 코드가 31~42열에서 추출한 값: [${c_raw.join(', ')}]`);
                    console.log(`=> 쓰레기 값(저점): ${lowValues.join(', ')}`);
                }
                errorCount++;
            }
        });
        console.log(`\n총 ${errorCount}개의 행에서 웹 파싱 오류(400 미만 저점)가 발생했습니다!`);
    } catch (e) {
        console.log("파일 읽기 실패:", e.message);
    }
}

simulateWebUploadOtherFile();
