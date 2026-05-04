
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nupkhceajanwdphkqqtp.supabase.co';
const supabaseKey = 'sb_publishable_TeIzwFwG1o41qDqeR4qpgg_MPpdV3Ag';
const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzeJanuaryData() {
    console.log('--- 2026년 1월 탈거력 데이터 정밀 분석 ---');
    
    const { data, error } = await supabase
        .from('production_actuals')
        .select('work_date, cap_pull_off')
        .gte('work_date', '2026-01-01')
        .lte('work_date', '2026-01-31');

    if (error) {
        console.error('데이터 조회 오류:', error);
        return;
    }

    if (!data || data.length === 0) {
        console.log('1월 데이터가 존재하지 않습니다.');
        return;
    }

    const allValues = data.map(d => d.cap_pull_off).filter(v => v !== null && v !== undefined);
    const validValues = allValues.filter(v => v > 0);
    const zeroValues = allValues.filter(v => v === 0);

    console.log(`전체 레코드 수: ${data.length}개`);
    console.log(`탈거력 유효 데이터 수 (>0): ${validValues.length}개`);
    console.log(`탈거력 0인 데이터 수: ${zeroValues.length}개`);

    if (validValues.length > 0) {
        validValues.sort((a, b) => a - b);
        const min = validValues[0];
        const max = validValues[validValues.length - 1];
        const sum = validValues.reduce((a, b) => a + b, 0);
        const avg = sum / validValues.length;
        const mid = validValues[Math.floor(validValues.length / 2)];

        console.log(`\n[통계 결과]`);
        console.log(`최솟값: ${min}N`);
        console.log(`최댓값: ${max}N`);
        console.log(`평균값: ${avg.toFixed(2)}N`);
        console.log(`중앙값: ${mid}N`);
        
        // 데이터 분포 요약 (5개씩 끊어서 예시 출력)
        console.log(`\n[데이터 예시 (Top 5)]`);
        console.log(validValues.slice(-5).reverse());
        console.log(`\n[데이터 예시 (Bottom 5)]`);
        console.log(validValues.slice(0, 5));
    } else {
        console.log('유효한 탈거력 데이터가 없습니다.');
    }
}

analyzeJanuaryData();
