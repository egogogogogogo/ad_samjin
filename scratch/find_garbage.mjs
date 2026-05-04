
import XLSX from 'xlsx';

const filename = 'JML_MES_R07_Standard_v13.xlsx';

function findGarbageData() {
    console.log(`--- [엑셀 전체 데이터 스캔 (200~399 범위 탐지)] ---`);
    const workbook = XLSX.readFile(filename);
    const inputSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(inputSheet, { header: 1 });
    
    const validRows = rows.slice(2).filter(row => row[0]);
    let found = false;

    validRows.forEach((row, index) => {
        let work_date = "Unknown";
        if (typeof row[0] === 'number') {
            work_date = new Date((row[0] - 25569) * 864e5).toISOString().split('T')[0];
        }

        // 전체 열(0~100)을 뒤져서 사진에 나온 200~399N 대역의 숫자가 어디 숨어있는지 확인
        row.forEach((cell, colIndex) => {
            const val = Number(cell);
            if (!isNaN(val) && val >= 200 && val < 400) {
                console.log(`🚨 [문제의 숫자 발견!] 날짜: ${work_date} (Row ${index + 3}), 열 인덱스: ${colIndex}`);
                console.log(`=> 발견된 값: ${val}`);
                found = true;
            }
        });
    });

    if (!found) {
        console.log("\nv13 파일의 어디에도 200~399 사이의 숫자가 존재하지 않습니다.");
        console.log("즉, 웹 대시보드가 읽고 있는 파일은 이 파일이 아니거나, 완전히 다른 로직으로 데이터가 왜곡되었습니다.");
    }
}

findGarbageData();
