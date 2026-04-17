# 환경 변수 가이드라인 (Environment Variables)

**주의사항**: 이 프로젝트는 보일러플레이트 구조이므로 **절대로 소스코드 안에 외부 시트 ID나 API Key를 직접 입력하지 마십시오.**

## 1. Google Apps Script 속성 (Script Properties) 설정
Apps Script 에디터에 접속하여 `프로젝트 설정` -> `스크립트 속성`에 들어가 다음 변수를 추가합니다.

- **`SHEET_ID`** (필수)
  - 연동할 Google Spreadsheet의 ID입니다.
  - 예시: `1K9KKc3a6_RmxcE...`
- **`COLUMN_MAPPING`** (선택)
  - 스프레드시트 컬럼명과 백엔드 변수 매핑을 위한 JSON 문자열. 값이 없으면 기본 이름(성형_총계, 조립_총계 등)으로 작동합니다.
  - 예시: `{"seong":"프레스_총량", "jorip":"검수_총량"}`

## 2. GitHub Actions Secrets (CI/CD용)
자동 배포 연동 시 GitHub 레포지토리 `Settings` -> `Secrets` 에 등록이 필요한 항목입니다.
- **`CLASPRC_JSON`**: `npm run login` 후 생성되는 `~/.clasprc.json` 파일 안의 전체 인증 내역.
- **`CLASP_SCRIPT_ID`**: 배포 대상 타겟 스크립트의 고유 문자열 ID.
