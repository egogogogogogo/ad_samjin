// 시스템 기본값 정의 (사용자 설정이 없을 경우의 Fallback)
const DEFAULT_THRESHOLDS = {
  ppm: 500,
  monthlyTarget: 4500000,
  defectLimit: 80,
  capMin: 410
};

// 시스템 구동 스크립트 속성 읽기 헬퍼 (하드코딩 제거)
const getParam = (key) => {
  const val = PropertiesService.getScriptProperties().getProperty(key);
  return val;
};

// 범용 PMS 구동을 위한 핵심 연결 고리
const getSheetId = () => {
  const id = getParam('SHEET_ID');
  if (!id) throw new Error("SHEET_ID 환경변수가 설정되지 않았습니다. Apps Script 속성을 확인하세요.");
  return id;
};

// ── 1. Web App API (doGet: 데이터 읽기) ─────────────────────────
function doGet(e) {
  const ss = SpreadsheetApp.openById(getSheetId());
  const fetchData = (name) => {
    const sh = ss.getSheetByName(name);
    if (!sh) return [];
    const v = sh.getDataRange().getValues();
    if (v.length < 2) return [];
    const h = v[0].map(k => String(k).trim());
    return v.slice(1)
      .filter(r => r[0] !== '' || r[1] !== '') // 데이터가 있는 행만 필터링
      .map(r => {
        const o = {};
        h.forEach((k, i) => {
          let val = r[i];
          if (val instanceof Date) val = Utilities.formatDate(val, 'Asia/Seoul', 'yyyy-MM-dd');
          if (typeof val === 'string' && !isNaN(val) && val !== '') val = Number(val);
          o[k] = (val === null || val === undefined) ? '' : val;
        });
        return o;
      });
  };

  // 설정 관리 (ScriptProperties 활용)
  const props = PropertiesService.getScriptProperties().getProperties();
  const thresholds = {
    ppm: props.ppm || DEFAULT_THRESHOLDS.ppm,
    monthlyTarget: props.monthlyTarget || DEFAULT_THRESHOLDS.monthlyTarget,
    defectLimit: props.defectLimit || DEFAULT_THRESHOLDS.defectLimit,
    capMin: props.capMin || DEFAULT_THRESHOLDS.capMin
  };

  return ContentService.createTextOutput(JSON.stringify({
    daily: fetchData('일별 생산현황'),
    weekly: fetchData('주별 생산현황'),
    monthly: fetchData('월별 생산현황'),
    annual: fetchData('연간 실적 합계')[0] || {},
    plan: fetchData('plan'),
    lineBalance: fetchLineBalance(ss),
    thresholds: thresholds,
    meta: fetchData('meta')[0] || {}
  })).setMimeType(ContentService.MimeType.JSON);
}

// ── 2. Web App API (doPost: 데이터 저장) ────────────────────────
function doPost(e) {
  const ss = SpreadsheetApp.openById(getSheetId());
  const params = JSON.parse(e.postData.contents);
  
  if (params.type === 'SAVE_PLAN') {
    const sh = ss.getSheetByName('plan');
    const data = params.payload; // [[월, 주차, 공정, 목표, 비고], ...]
    if (sh && data.length > 0) {
      sh.getRange(2, 1, sh.getLastRow(), sh.getLastColumn()).clearContent();
      sh.getRange(2, 1, data.length, data[0].length).setValues(data);
    }
  } else if (params.type === 'SAVE_LINE_BALANCE') {
    const sh = ss.getSheetByName('생산계획 관리');
    const b = params.payload;
    if(sh && b.length === 4) {
      const writeData = b.map(r => [r.timeCapa, r.runTime, r.machines, r.days, r.personnel]);
      sh.getRange(10, 2, 4, 5).setValues(writeData);
      SpreadsheetApp.flush(); // Ensure calculations are updated
    }
  } else if (params.type === 'SAVE_CONFIG') {
    PropertiesService.getScriptProperties().setProperties(params.payload);
  } else if (params.type === 'UPDATE_RAW_DATA') {
    const status = updateRawDataSmartSync(ss, params.payload);
    return ContentService.createTextOutput(JSON.stringify(status))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({status: 'success'}))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── 3. 상세 파싱 (동적 컬럼 매핑 적용) ───────────────────────────
function parseIntegratedRawData(ss) {
  const ws = ss.getSheetByName('raw data');
  if (!ws) return [];
  const data = ws.getDataRange().getValues();
  if (data.length < 2) return [];

  // 헤더 탐색 및 매핑 (이름 기준)
  const headers = data[1].map(h => String(h).trim()); // 2행을 헤더로 가정
  
  // 외부 동적 맵퍼 설정 불러오기 (PropertiesService 연동 - 없을 시 기존 기본값 Fallback)
  const mappingStr = getParam('COLUMN_MAPPING');
  let mapObj = {};
  if (mappingStr) { try { mapObj = JSON.parse(mappingStr); } catch(e) {} }

  const M = (key, def) => mapObj[key] || def;

  const idx = {
    month: headers.indexOf(M('month', '월')),
    date: headers.indexOf(M('date', '날짜')),
    seong: headers.indexOf(M('seong', '성형_총계')),
    jorip: headers.indexOf(M('jorip', '조립_총계')),
    reel: headers.indexOf(M('reel', '릴_총계')),
    final: headers.indexOf(M('final', '최종_총계')),
    defect: headers.indexOf(M('defect', '불량_총계')),
    sq: headers.indexOf(M('sq', '찌그러짐')), 
    sc: headers.indexOf(M('sc', '스크레치')), 
    co: headers.indexOf(M('co', '오염')),
    sp: headers.indexOf(M('sp', '스프링')), 
    ti: headers.indexOf(M('ti', '기울어짐')), 
    et: headers.indexOf(M('et', '기타')),
    remark: headers.indexOf(M('remark', '비고'))
  };

  // 만약 헤더 이름이 다를 경우 대비하여 기본 인덱스 보정 (v7.0 호환)
  if (idx.date === -1) idx.date = 3;
  if (idx.final === -1) idx.final = 7;
  if (idx.defect === -1) idx.defect = 31;

  const rows = [];
  for (let i = 2; i < data.length; i++) {
    const row = data[i];
    
    // 날짜 파싱 유연화
    let rawDate = row[idx.date];
    let dateObj = null;
    if (rawDate instanceof Date) {
      dateObj = rawDate;
    } else if (typeof rawDate === 'string' && rawDate.trim() !== '') {
      dateObj = new Date(rawDate.replace(/\./g, '-')); // 2024.04.15 대응
    }
    if (!dateObj || isNaN(dateObj.getTime())) continue;
    
    // 숫자 강제 변환 헬퍼
    const n = v => {
      if (v === null || v === undefined || v === '') return 0;
      if (typeof v === 'number') return isNaN(v) ? 0 : v;
      let clean = String(v).replace(/[^0-9.-]/g, '');
      let num = Number(clean);
      return isNaN(num) ? 0 : num;
    };

    const final = n(row[idx.final]);
    const defect = n(row[idx.defect]);
    
    rows.push({
      date: Utilities.formatDate(dateObj, 'Asia/Seoul', 'yyyy-MM-dd'),
      month: n(row[idx.month] || dateObj.getMonth() + 1), 
      weekNum: calculateISOWeek(dateObj),
      seong: n(row[idx.seong] || row[4]), 
      jorip: n(row[idx.jorip] || row[5]), 
      reel: n(row[idx.reel] || row[6]), 
      final: final,
      defect: defect, 
      ppm: final > 0 ? Math.round(defect/final*1e6*10)/10 : 0,
      achieve: 180000 ? Math.round(final / 180000 * 10000) / 10000 : 0, // 일 목표 18만 EA 기준
      sq: n(row[idx.sq] || row[32]), sc: n(row[idx.sc] || row[33]), 
      co: n(row[idx.co] || row[34]), sp: n(row[idx.sp] || row[35]), 
      ti: n(row[idx.ti] || row[36]), et: n(row[idx.et] || row[37]),
      remark: row[idx.remark] ? String(row[idx.remark]) : '',
      // 하단 설비별/탈거력 데이터는 기존 인덱스 유지 (v7.0 표준 레이아웃 기준)
      s5: n(row[8]), s6: n(row[9]), s7: n(row[10]), s8: n(row[11]), s9: n(row[12]),
      j1: n(row[13]), j2: n(row[14]), j3: n(row[15]), j5: n(row[16]), j6: n(row[17]),
      j7: n(row[18]), j8: n(row[19]), j9: n(row[20]), j10: n(row[21]), j11: n(row[22]), j12: n(row[23]),
      r1: n(row[24]), r2: n(row[25]), r3: n(row[26]), r4: n(row[27]),
      f1: n(row[28]), f2: n(row[29]), f3: n(row[30]),
      capAvg: n(row[39]), capMin: n(row[40]), capMax: n(row[41]),
      c1: n(row[42]), c2: n(row[43]), c3: n(row[44]), c4: n(row[45]), c5: n(row[46]),
      c6: n(row[47]), c7: n(row[48]), c8: n(row[49]), c9: n(row[50]), c10: n(row[51])
    });
  }
  return rows;
}

// ── 4. 기타 필수 엔진 (v8.0 로직 업데이트) ───────────────────────────
function runMonitoringV3() {
  const ss = SpreadsheetApp.openById(getSheetId());
  const raw = parseIntegratedRawData(ss);
  if (!raw || raw.length === 0) return;

  saveToSheetWithAutoCreate(ss, '일별 생산현황', raw);
  saveToSheetWithAutoCreate(ss, '주별 생산현황', aggregateWeekly(raw));
  saveToSheetWithAutoCreate(ss, '월별 생산현황', aggregateMonthly(raw));
  saveToSheetWithAutoCreate(ss, '연간 실적 합계', [aggregateAnnual(raw)]);
  
  // 사용자 요청 상세 탭들
  saveToSheetWithAutoCreate(ss, '공정별 생산현황_상세', extractMachineData(raw));
  saveToSheetWithAutoCreate(ss, '상세불량내역', extractDefectData(raw));
  saveToSheetWithAutoCreate(ss, 'Cap 탈거력 모니터링', extractCapData(raw));

  const metaSh = ss.getSheetByName('meta') || ss.insertSheet('meta');
  metaSh.clearContents().getRange(1, 1, 1, 2).setValues([['lastUpdated', new Date().toISOString()]]);
}

const SUM_KEYS = ['seong','jorip','reel','final','defect','sq','sc','co','sp','ti','et','s5','s6','s7','s8','s9','j1','j2','j3','j5','j6','j7','j8','j9','j10','j11','j12','r1','r2','r3','r4','f1','f2','f3'];

function aggregateWeekly(rows) {
  const props = PropertiesService.getScriptProperties().getProperties();
  const monthlyTarget = Number(props.monthlyTarget) || 4500000;
  const weeklyTarget = Math.round(monthlyTarget / 4);

  const m = {};
  rows.forEach(r => {
    const k = r.weekNum;
    if (!m[k]) { m[k]={week:k, days:0, target: weeklyTarget}; SUM_KEYS.forEach(f=>m[k][f]=0); }
    SUM_KEYS.forEach(f=>m[k][f] += (r[f]||0));
    m[k].days++;
  });
  return Object.values(m).map(w => ({ 
    ...w, 
    ppm: w.final?Math.round(w.defect/w.final*1e6*10)/10:0,
    achieve: w.target ? Math.round(w.final / w.target * 10000) / 10000 : 0
  })).sort((a,b)=>a.week.localeCompare(b.week));
}

function aggregateMonthly(rows) {
  const props = PropertiesService.getScriptProperties().getProperties();
  const monthlyTarget = Number(props.monthlyTarget) || 4500000;

  const m = {};
  rows.forEach(r => {
    const k = r.month; if (!k) return;
    if (!m[k]) { m[k]={month:k, days:0, target: monthlyTarget}; SUM_KEYS.forEach(f=>m[k][f]=0); }
    SUM_KEYS.forEach(f=>m[k][f] += (r[f]||0));
    m[k].days++;
  });
  return Object.values(m).map(mo => ({ 
    ...mo, 
    ppm: mo.final?Math.round(mo.defect/mo.final*1e6*10)/10:0, 
    achieve: mo.target?Math.round(mo.final/mo.target*10000)/10000:0 
  })).sort((a,b)=>a.month-b.month);
}

function aggregateAnnual(rows) {
  const a = { year: new Date().getFullYear(), target: 54000000 };
  SUM_KEYS.forEach(f => a[f] = 0);
  rows.forEach(r => SUM_KEYS.forEach(f => a[f] += (r[f]||0)));
  return { 
    ...a, 
    ppm: a.final ? Math.round(a.defect/a.final*1e6*10)/10 : 0,
    achieve: a.target ? Math.round(a.final / a.target * 10000) / 10000 : 0
  };
}

function saveToSheetWithAutoCreate(ss, name, data) {
  if (!data || data.length === 0) return;
  let sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  const h = Object.keys(data[0]);
  const matrix = [h, ...data.map(r => h.map(k => r[k]))];
  sh.getRange(1, 1, matrix.length, h.length).setValues(matrix);
}

function calculateISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-W${String(Math.ceil((((d-yearStart)/86400000)+1)/7)).padStart(2,'0')}`;
}

function createTriggersV3() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('runMonitoringV3').timeBased().everyDays(1).atHour(7).create();
}

function extractMachineData(raw) {
  return raw.map(r => ({
    날짜: r.date,
    성형5: r.s5, 성형6: r.s6, 성형7: r.s7, 성형8: r.s8, 성형9: r.s9,
    조립1: r.j1, 조립2: r.j2, 조립3: r.j3, 조립5: r.j5, 조립6: r.j6, 
    조립7: r.j7, 조립8: r.j8, 조립9: r.j9, 조립10: r.j10, 조립11: r.j11, 조립12: r.j12,
    포장1: r.r1, 포장2: r.r2, 포장3: r.r3, 포장4: r.r4,
    최종1: r.f1, 최종2: r.f2, 최종3: r.f3,
    비고: r.remark
  }));
}

function extractDefectData(raw) {
  return raw.map(r => ({
    날짜: r.date,
    찌그러짐: r.sq, 스크레치: r.sc, 오염: r.co, 스프링: r.sp, 기울어짐: r.ti, 기타: r.et, 
    비고: r.remark
  }));
}

function extractCapData(raw) {
  return raw.map(r => ({
    날짜: r.date,
    평균: r.capAvg, 최소: r.capMin, 최대: r.capMax,
    C1: r.c1, C2: r.c2, C3: r.c3, C4: r.c4, C5: r.c5,
    C6: r.c6, C7: r.c7, C8: r.c8, C9: r.c9, C10: r.c10
  }));
}

function fetchLineBalance(ss) {
  // 어떤 형태든 (공백 포함) "생산계획"이라는 단어가 들어간 시트를 스마트하게 찾아냅니다. 
  const sh = ss.getSheets().find(s => s.getName().replace(/\s/g, '').includes('생산계획'));
  if (!sh) return { error: true, msg: "생산계획 관련 시트를 못 찾았습니다." };
  
  const v = sh.getDataRange().getValues();
  while(v.length <= 25) v.push([]); // Pad empty rows to avoid crashes
  
  const basics = [];
  for(let i=9; i<=12; i++) {
    basics.push({ process: String(v[i][0]).trim(), timeCapa: Number(v[i][1])||0, runTime: Number(v[i][2])||0, machines: Number(v[i][3])||0, days: Number(v[i][4])||0, personnel: Number(v[i][5])||0 });
  }

  const capas = [];
  for(let i=16; i<=19; i++) {
    capas.push({ process: String(v[i][0]).trim(), daily: Number(v[i][1])||0, monthly: Number(v[i][2])||0, reqPerson: Number(v[i][3])||0 });
  }

  return { targetQty: v[4][2]||0, actualQty: v[5][2]||0, achieveRate: v[6][2]||0, basics, capas };
}

/**
 * Smart Sync: 엑셀 데이터를 기존 데이터와 비교하여 중복이 없는 경우에만 추가합니다.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {Array<Array>} payloadRows - 2차원 배열 형태의 시트 데이터
 */
function updateRawDataSmartSync(ss, payloadRows) {
  const sh = ss.getSheetByName('raw data');
  if (!sh) return { status: 'error', msg: "'raw data' 시트를 찾을 수 없습니다." };
  
  const existingData = sh.getDataRange().getValues();
  const existingKeys = new Set();
  
  // 기존 데이터에서 키 생성 (2행 헤더, 3행부터 데이터)
  // v7.0~8.0 레이아웃: 날짜=3번 인덱스, 최종_총계=7번 인덱스
  for (let i = 2; i < existingData.length; i++) {
    const row = existingData[i];
    const date = row[3];
    const final = row[7];
    if (date) {
      const dStr = date instanceof Date ? Utilities.formatDate(date, 'Asia/Seoul', 'yyyy-MM-dd') : String(date);
      existingKeys.add(`${dStr}_${final}`);
    }
  }

  const rowsToAppend = payloadRows.filter(row => {
    let date = row[3];
    if (!date) return false;
    let dStr = date instanceof Date ? Utilities.formatDate(date, 'Asia/Seoul', 'yyyy-MM-dd') : String(date);
    const k = `${dStr}_${row[7]}`;
    if (existingKeys.has(k)) return false;
    existingKeys.add(k); // 이번 업로드 묶음 내에서의 중복도 방지
    return true;
  });

  if (rowsToAppend.length > 0) {
    sh.getRange(sh.getLastRow() + 1, 1, rowsToAppend.length, rowsToAppend[0].length).setValues(rowsToAppend);
    // 데이터가 추가되었으므로 모니터링 로직(V3)을 실행하여 통계 탭들을 갱신합니다.
    runMonitoringV3();
  }

  return { 
    status: 'success', 
    added: rowsToAppend.length, 
    skipped: payloadRows.length - rowsToAppend.length 
  };
}
