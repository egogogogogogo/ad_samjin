
import XLSX from 'xlsx';

// 1. 테스트할 파일: 웹에서 업로드했다고 가정하는 엑셀
const filename = 'JML_MES_R07_Standard_v13.xlsx';

function simulateWebUpload() {
    console.log(`--- [웹 프론트엔드 업로드 로직 (main.js) 시뮬레이션] ---`);
    const workbook = XLSX.readFile(filename);
    const inputSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(inputSheet, { header: 1 });
    
    // 2. main.js의 코드를 토씨 하나 틀리지 않고 그대로 적용
    const validRows = rows.slice(2).filter(row => row[0]);
    
    let allParsedSamples = [];
    
    validRows.forEach((row, index) => {
        // [문제의 파싱 구간]
        // AF(31) ~ AQ(42) 열에서 실제 탈거력 샘플 전수 추출 (필터링 없이 모든 측정값 수용)
        const c_raw = row.slice(31, 43).map(v => Number(v) || 0).filter(v => v > 0);
        
        // 날짜 파싱 로직 (웹 코드 동일)
        let work_date = "Invalid Date";
        if (typeof row[0] === 'number') {
            work_date = new Date((row[0] - 25569) * 864e5).toISOString().split('T')[0];
        }

        if (c_raw.length > 0) {
            allParsedSamples.push({ date: work_date, samples: c_raw });
            
            // 샘플 중에 400 미만(사용자가 지적한 300대 저점)이 발견되면 즉시 경고 출력!
            const lowValues = c_raw.filter(v => v < 400);
            if (lowValues.length > 0) {
                console.log(`\n🚨 [웹 파싱 치명적 오류 발견!] Row ${index + 3} (날짜: ${work_date})`);
                console.log(`웹 코드가 읽어들인 31~42열 데이터: [${c_raw.join(', ')}]`);
                console.log(`-> 원인: 이 행의 31~42열에 400 미만의 데이터(${lowValues.join(', ')})가 존재합니다!`);
                console.log(`실제 엑셀 전체 행 데이터 확인:`);
                console.log(row.slice(0, 45).join(' | '));
            }
        }
    });

    console.log(`\n웹 시뮬레이션 완료. 유효 데이터 행 수: ${allParsedSamples.length}`);
}

simulateWebUpload();
