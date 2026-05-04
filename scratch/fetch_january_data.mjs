
import XLSX from 'xlsx';

const filename = 'JML_MES_R07_Standard_v13.xlsx';

function getJanuaryDataForGraph() {
    const workbook = XLSX.readFile(filename);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const dataRows = rows.slice(2);
    let uploadData = [];

    dataRows.forEach((row, i) => {
        const rawDate = row[0];
        let dateStr = "";
        
        if (typeof rawDate === 'number' && rawDate > 40000) {
            const d = new Date((rawDate - 25569) * 864e5);
            if (d.getFullYear() === 2026 && d.getMonth() === 0) {
                dateStr = d.toISOString().split('T')[0];
            }
        }

        if (dateStr) {
            // main.js의 handleFileSelect와 동일한 로직 적용
            const c_raw = row.slice(31, 43).map(v => Number(v) || 0).filter(v => v > 0);
            
            uploadData.push({
                work_date: dateStr,
                actual_qty: (Number(row[21]) || 0) + (Number(row[22]) || 0) + (Number(row[23]) || 0),
                quality_samples: c_raw,
                cap_pull_off: c_raw.length ? Math.round(c_raw.reduce((a, b) => a + b, 0) / c_raw.length) : 0
            });
        }
    });

    console.log(`--- [그래프 적용 대기 데이터: 1월] ---`);
    console.log(`총 작업일수: ${uploadData.length}일`);
    
    // 상위 5일치 샘플 데이터 출력
    uploadData.slice(0, 5).forEach(d => {
        console.log(`날짜: ${d.work_date} | 샘플수: ${d.quality_samples.length}개 | 평균: ${d.cap_pull_off}N | 샘플: [${d.quality_samples.slice(0, 3).join(', ')}...]`);
    });

    const allSamples = uploadData.flatMap(d => d.quality_samples);
    allSamples.sort((a, b) => a - b);
    console.log(`\n전체 샘플 통계: 수량 ${allSamples.length}개, Min ${allSamples[0]}N, Max ${allSamples[allSamples.length-1]}N`);
}

getJanuaryDataForGraph();
