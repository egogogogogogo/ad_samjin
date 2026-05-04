
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nupkhceajanwdphkqqtp.supabase.co';
const supabaseKey = 'sb_publishable_TeIzwFwG1o41qDqeR4qpgg_MPpdV3Ag';

const supabase = createClient(supabaseUrl, supabaseKey);

async function wipeDatabase() {
    console.log("--- [DB 전수 초기화 재시도] ---");
    
    // ID가 0이 아닌 모든 데이터 삭제 (UUID 형식에 맞게 수정)
    const { data, error } = await supabase
        .from('production_actuals')
        .delete()
        .neq('partner_id', '00000000-0000-0000-0000-000000000000'); 

    if (error) {
        console.error("삭제 실패:", error.message);
    } else {
        console.log("DB 초기화 성공: 모든 오염된 레코드가 성공적으로 삭제되었습니다.");
    }
}

wipeDatabase();
