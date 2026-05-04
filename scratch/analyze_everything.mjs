
import XLSX from 'xlsx';

const filename = '삼진_Gasket 생산관리_R07_20260113_raw.xlsx';

function analyzeEverything() {
    console.log(`--- [최종 분석] 엑셀 전수 데이터 통계 추출 ---`);
    const workbook = XLSX.readFile(filename);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // 헤더 제외, 실제 데이터가 시작되는 3행(Index 2)부터 끝까지 조사
    const dataRows = rows.slice(2);
    
    let allSamples = [];
    let validRowCount = 0;

    dataRows.forEach((row, i) => {
        // AF(31) ~ AQ(42) 열에 있는 12개 샘플 추출
        const samples = row.slice(31, 43)
            .map(v => Number(v))
            .filter(v => !isNaN(v) && v > 0);
        
        if (samples.length > 0) {
            allSamples.push(...samples);
            validRowCount++;
        }
    });

    console.log(`품질 데이터가 존재하는 행 수: ${validRowCount}개`);
    console.log(`전체 추출된 탈거력 샘플 수: ${allSamples.length}개`);

    if (allSamples.length > 0) {
        allSamples.sort((a, b) => a - b);
        const min = allSamples[0];
        const max = allSamples[allSamples.length - 1];
        const sum = allSamples.reduce((a, b) => a + b, 0);
        const avg = sum / allSamples.length;
        const mid = allSamples[Math.floor(allSamples.length / 2)];

        console.log(`\n[데이터 분석 결과]`);
        console.log(`- 전체 수량: ${allSamples.length}개`);
        console.log(`- 최솟값 (Min): ${min}N`);
        console.log(`- 최댓값 (Max): ${max}N`);
        console.log(`- 평균값 (Avg): ${avg.toFixed(2)}N`);
        console.log(`- 중앙값 (Mid): ${mid}N`);
        
        // 상위/하위 3개 데이터 예시
        console.log(`\n[상세 하위 3개]: ${allSamples.slice(0, 3).join(', ')}`);
        console.log(`[상세 상위 3개]: ${allSamples.slice(-3).reverse().join(', ')}`);
    } else {
        console.log('파일 내에 유효한 품질 샘플 데이터가 전혀 발견되지 않았습니다. 열 위치를 다시 확인해야 합니다.');
    }
}

analyzeEverything();
