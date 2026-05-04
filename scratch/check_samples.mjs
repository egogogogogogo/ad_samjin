
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nupkhceajanwdphkqqtp.supabase.co';
const supabaseKey = 'sb_publishable_TeIzwFwG1o41qDqeR4qpgg_MPpdV3Ag';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSampleData() {
    console.log('--- DB 샘플 데이터 및 날짜 형식 점검 ---');
    const { data, error } = await supabase
        .from('production_actuals')
        .select('*')
        .limit(5);

    if (error) {
        console.error('오류:', error);
        return;
    }

    if (data) {
        data.forEach((d, i) => {
            console.log(`[Sample ${i+1}] Date: ${d.work_date}, Cap Pull-off: ${d.cap_pull_off}`);
        });
    }

    const { data: countData } = await supabase
        .from('production_actuals')
        .select('work_date', { count: 'exact', head: false });
    
    if (countData) {
        const years = [...new Set(countData.map(d => d.work_date.slice(0, 4)))];
        console.log(`\n전체 데이터 연도 분포: ${years.join(', ')}`);
        console.log(`전체 레코드 수: ${countData.length}개`);
    }
}

checkSampleData();
