/**
 * Generic PMS Backend Engine (v1.0 - Boilerplate)
 * 정적 인덱스 방식에서 벗어나 COLUMN_MAPPING 설정을 통해 동적으로 데이터를 파싱합니다.
 */

const APP_VERSION = 'v1.0-Skeleton';

// ── 1. 시스템 환경변수 조회 ──────────────────────────
const getParam = (key) => PropertiesService.getScriptProperties().getProperty(key);

const getSheetId = () => {
  const id = getParam('SHEET_ID');
  if (!id) throw new Error("SHEET_ID 환경변수가 설정되지 않았습니다. (스크립트 속성 확인)");
  return id;
};

const getMapping = () => {
  const m = getParam('COLUMN_MAPPING');
  if (!m) return {}; // 매핑이 없으면 헤더명 그대로 사용 시도
  try {
    return JSON.parse(m);
  } catch (e) {
    console.error("Mapping JSON Parse Error");
    return {};
  }
};

// ── 2. Web App API (doGet) ─────────────────────────
function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(getSheetId());
    const mapping = getMapping();
    
    const fetchData = (sheetName) => {
      const sh = ss.getSheetByName(sheetName);
      if (!sh) return [];
      const values = sh.getDataRange().getValues();
      if (values.length < 2) return [];
      
      const headers = values[0].map(h => String(h).trim());
      const dataRows = values.slice(1);
      
      return dataRows.map(row => {
        const obj = {};
        // 1. 시트의 실제 헤더명을 키로 데이터 매핑
        headers.forEach((h, i) => {
          let val = row[i];
          // 공통 전처리: 날짜 형식
          if (val instanceof Date) val = Utilities.formatDate(val, 'Asia/Seoul', 'yyyy-MM-dd');
          
          // 2. COLUMN_MAPPING에 정의된 별칭(Key)이 있다면 해당 키로 저장
          const systemKey = Object.keys(mapping).find(key => mapping[key] === h);
          if (systemKey) {
            obj[systemKey] = val;
          } else {
            obj[h] = val; // 매핑 없으면 시트 헤더명 그대로 사용
          }
        });
        
        // 3. 동적 계산 (PPM 등 시스템 필수 지표)
        if (obj.final && obj.defect) {
          const f = Number(obj.final) || 0;
          const d = Number(obj.defect) || 0;
          obj.ppm = f > 0 ? Math.round(d / f * 1e6 * 10) / 10 : 0;
        }
        
        return obj;
      });
    };

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      version: APP_VERSION,
      updatedAt: new Date().toISOString(),
      daily: fetchData('일별 생산현황'),
      weekly: fetchData('주별 생산현황'),
      monthly: fetchData('월별 생산현황'),
      // 추가 시트 및 설정값 확장 가능
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      msg: 'Backend Service Error: ' + err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ── 3. Web App API (doPost: 데이터 수신 및 동기화) ─────────────────
function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    if (params.type === 'UPDATE_CONFIG') {
      PropertiesService.getScriptProperties().setProperties(params.payload);
      return ContentService.createTextOutput(JSON.stringify({status: 'success'}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // 추가 POST 처리 로직 (Save Plan 등) 구현 가능
    
    return ContentService.createTextOutput(JSON.stringify({status: 'unknown_type'}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── 4. 주단위 ISO 8601 계산 (Helper) ─────────────────
function calculateISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
