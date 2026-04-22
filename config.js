/**
 * Samjin QMS - Supabase Configuration
 */
const CONFIG = {
    // Supabase Project 정보
    supabaseUrl: 'https://nupkhceajanwdphkqqtp.supabase.co',
    supabaseKey: 'sb_publishable_TeIzwFwG1o41qDqeR4qpgg_MPpdV3Ag',

    // 기존 GAS URL (하이브리드 운영 또는 백업용으로 유지)
    apiUrl: 'https://script.google.com/macros/s/AKfycbyMD-xl89BwEEfhpeQjyaxe8-xMgAnCVeJJ7nw4nc43wg5OksEIN6xj15468Nfr6LPc/exec', 

    // 기본 임계치 설정 (DB 데이터가 없을 경우 사용)
    thresholds: {
        ppm: 500,
        monthlyTarget: 4500000,
        defectLimit: 80,
        capMin: 410
    }
};
