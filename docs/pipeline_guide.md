# 파이프라인 구축 가이드 (CI/CD)

이 가이드는 로컬 개발 환경(VS Code)에서 작성한 코드를 Google Apps Script로 자동 배포하는 파이프라인 구축 방법을 안내합니다.

## 1. 사전 준비
- **Node.js 설치**: 로컬 PC에 Node.js가 설치되어 있어야 합니다.
- **Google Apps Script API 활성화**: [Google Apps Script Settings](https://script.google.com/home/usersettings)에서 **Google Apps Script API**를 `On`으로 설정해주세요.

## 2. 로컬 프로젝트 설정
현재 작업 디렉토리(`samjin`)에서 다음 명령을 실행하여 필요한 라이브러리를 설치합니다.

```powershell
npm install
```

## 3. Google 계정 로그인
로컬 터미널에서 Google 계정에 로그인합니다. 브라우저가 열리면 권한을 승인해주세요.

```powershell
npm run login
```

## 4. 기존 Apps Script 프로젝트 연동
기존에 생성한 Apps Script 프로젝트를 로컬과 연결합니다.

1. Apps Script 에디터 접속
2. **프로젝트 설정**(톱니바퀴 아이콘) 클릭
3. **스크립트 ID** 복사
4. 로컬에서 다음 명령 실행:
   ```powershell
   # Placeholder: [SCRIPT_ID] 부분에 복사한 ID를 넣으세요
   npx clasp clone [SCRIPT_ID] --rootDir ./src/backend
   ```

## 5. 코드 수정 및 배포
이제 `src/backend/Code.gs` 파일을 수정하고 저장한 뒤, 다음 명령으로 즉시 배포할 수 있습니다.

- **즉시 배포**: `npm run push` (로컬 파일을 서버로 전송)
- **자동 감지**: `npm run watch` (파일 저장 시마다 자동 전송)
- **에디터 열기**: `npm run open` (브라우저에서 에디터 확인)

## 6. GitHub 연동 (선택 사항)
GitHub 리포지토리를 생성하고 소스 코드를 push하여 버전 관리를 시작하세요.
```powershell
git init
git add .
git commit -m "Initial commit: QMS Pipeline Setup"
git remote add origin [YOUR_GITHUB_REPO_URL]
git push -u origin main
```
