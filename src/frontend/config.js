/**
 * Samjin QMS - Default Configuration
 * 이 파일은 배포 시 CI/CD 파이프라인에 의해 자동 생성/업데이트될 수 있습니다.
 */
const CONFIG = {
    // 앱 시작 시 사용할 기본 API URL (GitHub Actions에서 자동 주입 가능)
    apiUrl: 'https://script.google.com/macros/s/AKfycbzi27OOImomSZr0aqc6_006IJ0RSa9aakWIXicDfdp-_KRviHp-_M11pjeAksLfSgv3/exec', 

    // 기본 임계치 설정 (서버 데이터가 없을 경우 사용)
    thresholds: {
        ppm: 500,
        monthlyTarget: 4500000,
        defectLimit: 80,
        capMin: 410
    }
};
