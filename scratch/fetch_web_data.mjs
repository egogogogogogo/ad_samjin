
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nupkhceajanwdphkqqtp.supabase.co';
const supabaseKey = 'sb_publishable_TeIzwFwG1o41qDqeR4qpgg_MPpdV3Ag';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkWebDataFlow() {
    console.log("--- [웹 대시보드 데이터 흐름 디버깅] ---");
    
    // 1. 프론트엔드와 동일한 방식으로 DB 데이터 조회 (RLS Read 허용 가정)
    const { data, error } = await supabase
        .from('production_actuals')
        .select('work_date, cap_pull_off, quality_samples')
        .order('work_date', { ascending: true });

    if (error) {
        console.error("DB 읽기 에러:", error.message);
        return;
    }

    if (!data || data.length === 0) {
        console.log("DB에 데이터가 없습니다. (전수 초기화 상태)");
        return;
    }

    console.log(`DB에서 읽어온 데이터 건수: ${data.length}건`);

    // 2. 1월 데이터 필터링
    const janData = data.filter(d => d.work_date && d.work_date.startsWith('2026-01'));
    console.log(`그 중 2026년 1월 데이터: ${janData.length}건`);

    if (janData.length > 0) {
        // 3. renderCapBoxChart 로직 시뮬레이션
        console.log("\n[renderCapBoxChart 로직이 읽어들이는 실제 값]");
        let allExtractedSamples = [];

        janData.forEach(d => {
            // main.js의 flatMap 로직 재현
            const samples = Array.isArray(d.quality_samples) && d.quality_samples.length > 0 
                            ? d.quality_samples 
                            : (d.cap_pull_off > 0 ? [d.cap_pull_off] : []);
            
            const validSamples = samples.map(Number).filter(v => v > 0);
            allExtractedSamples.push(...validSamples);
            
            // 처음 5일치만 상세 출력
            if (allExtractedSamples.length <= 60) {
                console.log(`날짜: ${d.work_date} | DB quality_samples: ${JSON.stringify(d.quality_samples)} | DB cap_pull_off: ${d.cap_pull_off}`);
                console.log(`  -> 그래프에 전달된 샘플: [${validSamples.join(', ')}]`);
            }
        });

        if (allExtractedSamples.length > 0) {
            allExtractedSamples.sort((a, b) => a - b);
            console.log(`\n[그래프가 그리는 최종 박스플롯 통계 (1월 전체)]`);
            console.log(`- 그래프 반영 샘플 수: ${allExtractedSamples.length}개`);
            console.log(`- 최솟값(Min): ${allExtractedSamples[0]}N`);
            console.log(`- 최댓값(Max): ${allExtractedSamples[allExtractedSamples.length - 1]}N`);
            
            // 하위 10개 이상치 출력 (문제의 330N 등 확인)
            console.log(`- 하위 10개 값: ${allExtractedSamples.slice(0, 10).join(', ')}`);
        }
    }
}

checkWebDataFlow();
