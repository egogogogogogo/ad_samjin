# Samjin Gasket QMS 파이프라인 개발 환경

이 리포지토리는 샘진 가스켓 품질 업무 자동화 시스템(QMS)의 로컬 개발 및 자동 배포를 위한 프로젝트입니다.

## 🚀 빠른 시작 (Quick Start)

### 1단계: 의존성 설치
```powershell
npm install
```

### 2단계: Google Apps Script 로그인 및 연동
```powershell
# 로그인 수행
npm run login

# 기존 프로젝트와 연결 (최초 1회)
npx clasp clone "여기에_스크립트_ID_입력" --rootDir ./src/backend
```

### 3단계: 코드 수정 및 배포
`src/backend/Code.gs` 또는 `src/frontend` 파일을 수정한 후 다음 명령어로 배포합니다.
```powershell
npm run push
```

## 📂 폴더 구조
- `src/backend`: Google Apps Script 소스 코드
- `src/frontend`: 대시보드 웹 애플리케이션 (HTML/CSS/JS)
- `docs/`: 시스템 설계 및 파이프라인 가이드 문서

## 🛠 주요 기능
- **자동 파이프라인**: VS Code에서 저장 시 `clasp`를 통해 실시간 Apps Script 반영
- **프리미엄 대시보드**: Modern UI/UX가 적용된 품질 지표 시각화
- **실시간 알림**: 이상치 감지 시 MS Teams 연동 알림 (설정 필요)

자세한 내용은 [docs/pipeline_guide.md](./docs/pipeline_guide.md) 및 [docs/architecture.md](./docs/architecture.md) 파일을 참조해주세요.
