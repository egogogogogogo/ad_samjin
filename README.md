# Generic PMS (Production Management System) Boilerplate

이 리포지토리는 구글 클라우드(Apps Script + Sheets) 환경에서 동작하는 공정관리 시스템(PMS) 및 품질관리 시스템(QMS)의 범용 보일러플레이트입니다. (기존 Samjin QMS 프로젝트를 보일러플레이트 구조로 추상화)

## 🚀 빠른 시작 (Quick Start)

### 1단계: 의존성 설치
```powershell
npm install
```

### 2단계: 클라우드 환경 설정 및 연동 (필수)
이 프로젝트는 시큐리티 모듈화 템플릿입니다. 구글 시트 ID나 민감 정보는 코드 영역(`Code.gs`)에 절대 저장하지 않고, Apps Script의 Script Properties(환경변수)로 주입받아 구동됩니다.
환경 변수 세팅 방법은 [docs/env.example.md](./docs/env.example.md)를 참조하세요.

```powershell
# 관리자 구글 계정 연동
npm run login

# 대상 Apps Script 프로젝트와 연결 (최초 1회)
npx clasp clone "여기에_스크립트_ID_입력" --rootDir ./src/backend
```

### 3단계: 코드 수정 및 자동 배포 체계(CI/CD) 구동
코드 수정 후 로컬에서 클라우드로 배포합니다. (GitHub Actions가 연동된 경우 \`git push\` 시 자동 배포됩니다)
```powershell
npm run push
```

## 📂 폴더 구조 및 역할
- `src/backend/Code.gs`: 100% 추상화된 시트 파싱 백엔드 미들웨어. 환경변수로 전달된 스키마에 따라 자유롭게 동작.
- `src/frontend`: Single Page Application 기반 데이터 시각화 웹뷰 (Chart.js 등 자체 내장)
- `docs/`: PMS 아키텍처 및 설정 가이드라인

## 💡 범용 확장성 (Dynamic Column Mapping)
다른 공장/기능 적용 시, `Code.gs` 수정 없이 구글 스크립트 속성에 `COLUMN_MAPPING` JSON 문자열을 주입하면, 입력 시트 컬럼명과 백엔드 변수명을 동적으로 치환해 프론트엔드로 파이프라이닝할 수 있습니다.
