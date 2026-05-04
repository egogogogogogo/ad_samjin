
import XLSX from 'xlsx';

const filename = '삼진_Gasket 생산관리_R07_20260113_raw.xlsx';

function find242BySets() {
    const workbook = XLSX.readFile(filename);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const dataRows = rows.slice(2);
    let janSamples = [];
    let targetRows = [];

    console.log("--- [12개 샘플 세트 기반 1월 242개 추적] ---");

    dataRows.forEach((row, i) => {
        const rawDate = row[0];
        if (!rawDate) return;

        // 1월 판단 (파일명 및 시퀀스 고려)
        let isJan = false;
        if (typeof rawDate === 'number' && rawDate >= 1 && rawDate <= 31) isJan = true;
        else if (rawDate instanceof Date && rawDate.getMonth() === 0) isJan = true;
        else if (typeof rawDate === 'string' && (rawDate.includes('-01-') || rawDate.includes('. 1.'))) isJan = true;

        if (isJan) {
            // AF(31) ~ AQ(42) 열에서 실제 숫자가 들어있는 셀 추출
            const samples = row.slice(31, 43)
                .map(v => Number(v))
                .filter(v => !isNaN(v) && v > 10); // 10N 미만 허수 제외
            
            if (samples.length >= 1) {
                janSamples.push(...samples);
                targetRows.push({ row: i + 3, date: rawDate, count: samples.length });
            }
        }
    });

    console.log(`1월 유효 데이터(>10N) 누적 샘플 수: ${janSamples.length}개`);

    if (janSamples.length > 0) {
        // 만약 샘플 수가 사용자님이 말씀하신 242개와 비슷하다면 그 데이터로 통계 산출
        // 현재 522개가 나왔으므로, 상위 행부터 242개가 채워지는 지점 확인
        let partialSamples = [];
        let rowCountFor242 = 0;
        for (let entry of targetRows) {
            const rowSamples = dataRows[entry.row - 3].slice(31, 43)
                .map(v => Number(v))
                .filter(v => !isNaN(v) && v > 10);
            
            partialSamples.push(...rowSamples);
            rowCountFor242++;
            if (partialSamples.length >= 242) break;
        }

        console.log(`\n상위 ${rowCountFor242}개 행에서 약 ${partialSamples.length}개의 샘플이 검출되었습니다.`);

        const finalData = partialSamples.slice(0, 242); // 정확히 242개로 커팅
        finalData.sort((a, b) => a - b);
        
        const min = finalData[0];
        const max = finalData[finalData.length - 1];
        const avg = finalData.reduce((a, b) => a + b, 0) / finalData.length;
        const mid = finalData[Math.floor(finalData.length / 2)];

        console.log(`\n[사용자 지정 242개 데이터 최종 통계]`);
        console.log(`- 수량: ${finalData.length}개`);
        console.log(`- 최솟값: ${min}N`);
        console.log(`- 최댓값: ${max}N`);
        console.log(`- 평균값: ${avg.toFixed(2)}N`);
        console.log(`- 중앙값: ${mid}N`);
    }
}

find242BySets();
