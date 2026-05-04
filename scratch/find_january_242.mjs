
import XLSX from 'xlsx';

const filename = '삼진_Gasket 생산관리_R07_20260113_raw.xlsx';

function findJanuary242() {
    const workbook = XLSX.readFile(filename);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const dataRows = rows.slice(2);
    
    let janSamples = [];
    let janRowCount = 0;

    console.log("--- [1월 데이터 정밀 타겟팅] ---");
    
    dataRows.forEach((row, i) => {
        let isJanuary = false;
        const rawDate = row[0];

        // 날짜 판별 로직 보강
        if (typeof rawDate === 'number') {
            // Case A: 엑셀 날짜 시리얼 넘버 (46023 등)
            if (rawDate > 40000) {
                const d = new Date((rawDate - 25569) * 864e5);
                if (d.getFullYear() === 2026 && d.getMonth() === 0) isJanuary = true;
            } 
            // Case B: 단순 일자 (1~31) -> 1월 파일인 경우 1~31은 1월로 간주
            else if (rawDate >= 1 && rawDate <= 31) {
                isJanuary = true;
            }
        } else if (typeof rawDate === 'string') {
            if (rawDate.includes('2026-01') || rawDate.includes('26. 1.')) isJanuary = true;
        }

        if (isJanuary) {
            const samples = row.slice(31, 43)
                .map(v => Number(v))
                .filter(v => !isNaN(v) && v > 0);
            
            if (samples.length > 0) {
                janSamples.push(...samples);
                janRowCount++;
            }
        }
    });

    console.log(`판별된 1월 행 수: ${janRowCount}개`);
    console.log(`판별된 1월 총 샘플 수: ${janSamples.length}개`);

    if (janSamples.length > 0) {
        janSamples.sort((a, b) => a - b);
        const min = janSamples[0];
        const max = janSamples[janSamples.length - 1];
        const sum = janSamples.reduce((a, b) => a + b, 0);
        const avg = sum / janSamples.length;

        console.log(`\n[사용자 요청 1월 데이터 분석 결과]`);
        console.log(`- 최종 수량: ${janSamples.length}개 (사용자 제시 242개와 대조 필요)`);
        console.log(`- 최솟값: ${min}N`);
        console.log(`- 최댓값: ${max}N`);
        console.log(`- 평균값: ${avg.toFixed(2)}N`);
    }
}

findJanuary242();
