
import XLSX from 'xlsx';

const filename = '삼진_Gasket 생산관리_R07_20260113_raw.xlsx';

function analyzeExcelData() {
    console.log(`--- 엑셀 파일 분석: ${filename} ---`);
    const workbook = XLSX.readFile(filename);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const validRows = rows.slice(2).filter(row => row[0]);
    
    let allPullOffValues = [];
    let januaryCount = 0;

    validRows.forEach(row => {
        let dateObj;
        const rawDate = row[0];
        
        if (rawDate instanceof Date) {
            dateObj = rawDate;
        } else if (typeof rawDate === 'number') {
            dateObj = new Date((rawDate - 25569) * 864e5);
        } else {
            dateObj = new Date(rawDate);
        }

        if (!isNaN(dateObj.getTime())) {
            // 1월 데이터 필터링 (Month는 0부터 시작하므로 0이 1월)
            if (dateObj.getMonth() === 0 && dateObj.getFullYear() === 2026) {
                januaryCount++;
                const c_raw = row.slice(31, 43).map(v => Number(v) || 0).filter(v => v > 0);
                allPullOffValues.push(...c_raw);
            }
        }
    });

    console.log(`1월 데이터 행(Row) 수: ${januaryCount}개`);
    console.log(`1월 전체 탈거력 샘플 수: ${allPullOffValues.length}개`);

    if (allPullOffValues.length > 0) {
        allPullOffValues.sort((a, b) => a - b);
        const min = allPullOffValues[0];
        const max = allPullOffValues[allPullOffValues.length - 1];
        const sum = allPullOffValues.reduce((a, b) => a + b, 0);
        const avg = sum / allPullOffValues.length;
        const mid = allPullOffValues[Math.floor(allPullOffValues.length / 2)];

        console.log(`\n[1월 탈거력 통계]`);
        console.log(`최솟값: ${min}N`);
        console.log(`최댓값: ${max}N`);
        console.log(`평균값: ${avg.toFixed(2)}N`);
        console.log(`중앙값: ${mid}N`);
    } else {
        console.log('1월 유효 탈거력 데이터가 엑셀에 없습니다.');
    }
}

analyzeExcelData();
