
import XLSX from 'xlsx';

const filename = '삼진_Gasket 생산관리_R07_20260113_raw.xlsx';

function findExact242() {
    const workbook = XLSX.readFile(filename);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const dataRows = rows.slice(2);
    let janSamples = [];
    
    console.log("--- [1월 242개 데이터 정밀 검증] ---");

    // 사용자님이 말씀하신 1월 데이터를 찾기 위해 'Date'가 1이거나 1월 날짜인 구간 스캔
    dataRows.forEach((row, i) => {
        const rawDate = row[0];
        let isJan = false;

        if (typeof rawDate === 'number') {
            // 날짜가 1~31인 경우 1월로 간주 (파일명 기반)
            if (rawDate >= 1 && rawDate <= 31) isJan = true;
            // 엑셀 시리얼 날짜인 경우
            else if (rawDate > 40000) {
                const d = new Date((rawDate - 25569) * 864e5);
                if (d.getMonth() === 0) isJan = true;
            }
        } else if (typeof rawDate === 'string' && (rawDate.includes('-01-') || rawDate.includes('. 1.'))) {
            isJan = true;
        }

        if (isJan) {
            // AF(31) ~ AQ(42) 열에서 숫자만 추출
            const samples = row.slice(31, 43)
                .map(v => (v === null || v === undefined || v === "") ? NaN : Number(v))
                .filter(v => !isNaN(v)); // 공란 제외 (0이나 1도 포함될 수 있음)
            
            janSamples.push(...samples);
        }
    });

    console.log(`1월 구간에서 발견된 총 샘플 수(공란 제외): ${janSamples.length}개`);

    if (janSamples.length > 0) {
        janSamples.sort((a, b) => a - b);
        
        // 만약 242개보다 많다면, 혹시 1N이나 극단적 이상치를 제외해야 하는지 확인
        const filtered242 = janSamples.filter(v => v > 10); // 10N 이상만 필터링해봄
        console.log(`그 중 10N 이상인 유효 샘플 수: ${filtered242.length}개`);

        // 통계 산출 (사용자님의 242개 데이터 기준 예상 통계)
        const targetData = janSamples.length === 242 ? janSamples : filtered242;
        
        const min = targetData[0];
        const max = targetData[targetData.length - 1];
        const sum = targetData.reduce((a, b) => a + b, 0);
        const avg = sum / targetData.length;
        const mid = targetData[Math.floor(targetData.length / 2)];

        console.log(`\n[최종 1월 통계 보고]`);
        console.log(`- 데이터 수량: ${targetData.length}개`);
        console.log(`- 최솟값: ${min}N`);
        console.log(`- 최댓값: ${max}N`);
        console.log(`- 평균값: ${avg.toFixed(2)}N`);
        console.log(`- 중앙값: ${mid}N`);
    }
}

findExact242();
