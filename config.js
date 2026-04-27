/**
 * Samjin QMS - Supabase Configuration
 */
const CONFIG = {
    // Supabase Project 정보
    supabaseUrl: 'https://nupkhceajanwdphkqqtp.supabase.co',
    supabaseKey: 'sb_publishable_TeIzwFwG1o41qDqeR4qpgg_MPpdV3Ag',

    // 기본 임계치 설정 (DB 데이터가 없을 경우 사용)
    thresholds: {
        ppm: 500,
        monthlyTarget: 4500000,
        defectLimit: 80,
        capMin: 410
    }
};
