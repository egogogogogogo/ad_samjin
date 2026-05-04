
import XLSX from 'xlsx';

const filename = 'JML_MES_R07_Standard_v13.xlsx';

function analyzeV13January() {
    const workbook = XLSX.readFile(filename);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const dataRows = rows.slice(2); // 헤더 제외
    let janSamples = [];
    let janValidDays = 0;

    console.log(`--- [v13 파일 1월 데이터 정밀 분석] ---`);

    dataRows.forEach((row, i) => {
        const rawDate = row[0];
        let isJan = false;

        if (typeof rawDate === 'number' && rawDate > 40000) {
            const d = new Date((rawDate - 25569) * 864e5);
            if (d.getFullYear() === 2026 && d.getMonth() === 0) isJan = true;
        }

        if (isJan) {
            // AF(31) ~ AQ(42) 열에서 샘플 추출
            const samples = row.slice(31, 43)
                .map(v => Number(v))
                .filter(v => !isNaN(v) && v > 0);
            
            if (samples.length > 0) {
                janSamples.push(...samples);
                janValidDays++;
            }
        }
    });

    console.log(`1월 데이터가 있는 작업일수: ${janValidDays}일`);
    console.log(`1월 총 샘플 수(공란 제외): ${janSamples.length}개`);

    if (janSamples.length > 0) {
        janSamples.sort((a, b) => a - b);
        const min = janSamples[0];
        const max = janSamples[janSamples.length - 1];
        const avg = janSamples.reduce((a, b) => a + b, 0) / janSamples.length;
        const mid = janSamples[Math.floor(janSamples.length / 2)];

        console.log(`\n[v13 기준 1월 최종 통계]`);
        console.log(`- 수량: ${janSamples.length}개 (사용자 제시 242개와 대조)`);
        console.log(`- 최솟값: ${min}N`);
        console.log(`- 최댓값: ${max}N`);
        console.log(`- 평균값: ${avg.toFixed(2)}N`);
        console.log(`- 중앙값: ${mid}N`);
    }
}

analyzeV13January();
