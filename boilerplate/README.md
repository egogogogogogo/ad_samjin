# Generic PMS Boilerplate (범용 공정관리 시스템 뼈대)

이 프로젝트는 어떤 산업군이나 공정 데이터라도 **"데이터 명세서(Excel) + 매핑 설정"**만으로 즉시 시각화 대시보드를 구축할 수 있게 설계된 범용 보일러플레이트입니다.

## 🚀 빠른 구축 프로세스 (End-to-End)

### 1단계: 데이터 준비 (Excel)
`docs/DATA_SCHEMA_GUIDE.md`를 참고하여 엑셀 파일의 `raw data` 탭에 데이터를 입력합니다. 
*   최소 필수 항목: **날짜, 최종생산량, 불량수**
*   컬럼명은 자유롭게 정하셔도 됩니다. (2단계에서 연결함)

### 2단계: 클라우드 배포 및 설정 (Backend)
1.  이 프로젝트의 `src/backend` 폴더를 구글 Apps Script에 배포합니다.
2.  Apps Script 프로젝트 설정의 **[스크립트 속성]**에 다음 정보를 입력합니다.
    *   `SHEET_ID`: 연동할 구글 시트의 ID
    *   `COLUMN_MAPPING`: 내 엑셀 헤더와 시스템 변수를 연결하는 JSON
        ```json
        {
          "date": "작업일자",
          "final": "양품수합계",
          "defect": "불량코드합계"
        }
        ```

### 3단계: 대시보드 연결 (Frontend)
1.  Apps Script를 '웹 앱'으로 배포하여 생성된 URL을 복사합니다.
2.  `src/frontend/index.html`을 실행(혹은 호스팅)한 후 **[Settings]** 탭에 해당 URL을 입력합니다.
3.  **[Refresh Data]** 버튼을 누르면 내 엑셀 데이터가 차트로 즉시 시각화됩니다.

## 📂 폴더 구조
- `/src/backend`: 구글 Apps Script 엔진 (동적 파싱 미들웨어)
- `/src/frontend`: 데이터 시각화 웹 대시보드 (클린 테마)
- `/docs`: 데이터 명세서 및 기술 가이드

## 💡 차별점
- **Zero Coding**: 시트 구조가 바뀌어도 코드를 수정할 필요 없이 `COLUMN_MAPPING` 값만 바꾸면 됩니다.
- **Stateless**: 데이터는 구글 시트에만 존재하며, 시스템은 실시간으로 데이터를 가공하여 보여주기만 합니다.
