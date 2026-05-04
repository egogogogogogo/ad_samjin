
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

const supabaseUrl = 'https://nupkhceajanwdphkqqtp.supabase.co';
const supabaseKey = 'sb_publishable_TeIzwFwG1o41qDqeR4qpgg_MPpdV3Ag';
const filename = 'JML_MES_R07_Standard_v13.xlsx';

const supabase = createClient(supabaseUrl, supabaseKey);

async function uploadJanuaryData() {
    console.log("--- [1월 v13 데이터 실운영 DB 반영 시작] ---");
    
    // 1. 파트너 정보 가져오기 (가장 첫 번째 파트너 사용)
    const { data: partners } = await supabase.from('partners').select('id').limit(1);
    if (!partners || partners.length === 0) {
        console.error("파트너 정보를 찾을 수 없습니다.");
        return;
    }
    const partnerId = partners[0].id;
    console.log(`대상 파트너 ID: ${partnerId}`);

    // 2. 엑셀 데이터 파싱
    const workbook = XLSX.readFile(filename);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const dataRows = rows.slice(2);
    let finalUploadData = [];

    dataRows.forEach((row) => {
        const rawDate = row[0];
        let dateStr = "";
        
        if (typeof rawDate === 'number' && rawDate > 40000) {
            const d = new Date((rawDate - 25569) * 864e5);
            if (d.getFullYear() === 2026 && d.getMonth() === 0) {
                dateStr = d.toISOString().split('T')[0];
            }
        }

        if (dateStr) {
            const c_raw = row.slice(31, 43).map(v => Number(v) || 0).filter(v => v > 0);
            const m_raw = row.slice(1, 6).map(v => Number(v) || 0);
            const a_raw = row.slice(6, 17).map(v => Number(v) || 0);
            const p_raw = row.slice(17, 21).map(v => Number(v) || 0);
            const i_raw = row.slice(21, 24).map(v => Number(v) || 0);
            const d_raw = row.slice(24, 30).map(v => Number(v) || 0);

            finalUploadData.push({
                partner_id: partnerId,
                work_date: dateStr,
                molding_qty: m_raw.reduce((a, b) => a + b, 0),
                assembly_qty: a_raw.reduce((a, b) => a + b, 0),
                packing_qty: p_raw.reduce((a, b) => a + b, 0),
                actual_qty: i_raw.reduce((a, b) => a + b, 0),
                defect_qty: d_raw.reduce((a, b) => a + b, 0),
                machine_data: { molding: m_raw, assembly: a_raw, packing: p_raw, inspection: i_raw },
                defect_detail: {
                    dent: d_raw[0], scratch: d_raw[1], contamination: d_raw[2],
                    spring: d_raw[3], tilt: d_raw[4], etc: d_raw[5]
                },
                quality_samples: c_raw,
                remarks: row[30] || '',
                cap_pull_off: c_raw.length ? Math.round(c_raw.reduce((a, b) => a + b, 0) / c_raw.length) : 0
            });
        }
    });

    console.log(`업로드 준비된 행 수: ${finalUploadData.length}개`);

    // 3. Supabase Upsert 실행
    const { error } = await supabase
        .from('production_actuals')
        .upsert(finalUploadData, { onConflict: 'partner_id, work_date' });

    if (error) {
        console.error("업로드 실패:", error.message);
    } else {
        console.log("업로드 성공! 1월 데이터가 v13 표준에 맞춰 완벽히 반영되었습니다.");
    }
}

uploadJanuaryData();
