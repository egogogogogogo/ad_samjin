
import XLSX from 'xlsx';

const filename = 'JML_MES_R07_Standard_v13.xlsx';

function analyzeV13Excel() {
    const workbook = XLSX.readFile(filename);
    console.log(`--- [최신 파일 정보] ---`);
    console.log(`파일명: ${filename}`);
    console.log(`시트 목록: ${workbook.SheetNames.join(', ')}`);
    
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    console.log(`\n--- [시트: ${sheetName} / 상위 3개 행 구조 분석 (A~AQ)] ---`);
    rows.slice(0, 3).forEach((row, i) => {
        const data = row.slice(0, 43).map(v => v === undefined ? "null" : v);
        console.log(`[Row ${i+1}]: ${data.join(' | ')}`);
    });

    // 1월 데이터 분석 (D열 날짜 기준)
    let janSamples = [];
    const dataRows = rows.slice(2);
    
    dataRows.forEach((row, i) => {
        const rawDate = row[3]; // v13 구조에서 D열이 날짜인지 확인
        let isJan = false;
        
        if (typeof rawDate === 'number' && rawDate > 40000) {
            const d = new Date((rawDate - 25569) * 864e5);
            if (d.getMonth() === 0 && d.getFullYear() === 2026) isJan = true;
        }

        if (isJan) {
            // 사용자님이 말씀하신 1월 샘플 데이터 추출 (열 위치 재확인 필요)
            // 일단 AQ(42)열부터 샘플이 있는지 확인
            const samples = row.slice(31, 43).filter(v => typeof v === 'number' && v > 0);
            janSamples.push(...samples);
        }
    });

    console.log(`\n[1월 데이터 통계 - 임시]`);
    console.log(`추출된 샘플 수: ${janSamples.length}개`);
}

analyzeV13Excel();
