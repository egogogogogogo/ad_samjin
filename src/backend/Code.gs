const APP_VERSION = 'v8.0 (240421-Stable)'; // [최종] 초기 구조 안정화 버전
const RAW_HEADERS_ROW = 2; // 2행이 헤더 (Data는 3행부터)
const IDX = {
  month: 0, date: 3, seong: 4, jorip: 5, reel: 6, final: 7, 
  defect: 31, sq: 32, sc: 33, co: 34, sp: 35, ti: 36, et: 37, remark: 38,
  // 상세 설비 (v7.0 표준 인덱스 유지)
  cap: { avg: 39, min: 40, max: 41 }
};

const DEFAULT_THRESHOLDS = {
  ppm: 500, monthlyTarget: 4500000, defectLimit: 80, capMin: 410
};

const getParam = (key) => PropertiesService.getScriptProperties().getProperty(key);

const getSheetId = () => {
  const id = getParam('SHEET_ID');
  if (!id) throw new Error("SHEET_ID 환경변수가 설정되지 않았습니다.");
  return id;
};

// ── 보안 설정 ──────────────────────────
const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8시간

function verifySession(token) {
  if (!token) return false;
  const props = PropertiesService.getScriptProperties();
  const sessionData = props.getProperty('SESSION_' + token);
  if (!sessionData) return false;
  
  const { expiry } = JSON.parse(sessionData);
  if (new Date().getTime() > expiry) {
    props.deleteProperty('SESSION_' + token);
    return false;
  }
  return true;
}

function createSession() {
  const token = Utilities.getUuid();
  const expiry = new Date().getTime() + SESSION_TIMEOUT_MS;
  PropertiesService.getScriptProperties().setProperty('SESSION_' + token, JSON.stringify({ expiry }));
  return token;
}

// ── 1. Web App API (doGet: 데이터 읽기) ─────────────────────────
function doGet(e) {
  try {
    const token = e.parameter.token;
    if (!verifySession(token)) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        msg: '인증이 필요합니다. (Invalid or expired token)'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const ss = SpreadsheetApp.openById(getSheetId());
    
    const fetchData = (name) => {
      const sh = ss.getSheetByName(name);
      if (!sh) return [];
      const v = sh.getDataRange().getValues();
      if (v.length < 2) return [];
      const h = v[0].map(k => String(k).trim());
      return v.slice(1)
        .filter(r => r[0] !== '' || r[1] !== '')
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

    const props = PropertiesService.getScriptProperties().getProperties();
    const thresholds = {
      ppm: props.ppm || DEFAULT_THRESHOLDS.ppm,
      monthlyTarget: props.monthlyTarget || DEFAULT_THRESHOLDS.monthlyTarget,
      defectLimit: props.defectLimit || DEFAULT_THRESHOLDS.defectLimit,
      capMin: props.capMin || DEFAULT_THRESHOLDS.capMin
    };

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      version: APP_VERSION,
      daily: fetchData('일별 생산현황'),
      weekly: fetchData('주별 생산현황'),
      monthly: fetchData('월별 생산현황'),
      annual: fetchData('연간 실적 합계')[0] || {},
      plan: fetchData('plan'),
      lineBalance: fetchLineBalance(ss),
      thresholds: thresholds,
      meta: fetchData('meta')[0] || {}
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      msg: '초기화 에러: ' + err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ── 2. Web App API (doPost: 데이터 저장/동기화) ────────────────────────
function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    
    // [보안] 로그인 요청은 토큰 체크 제외
    if (params.type === 'LOGIN') {
      const props = PropertiesService.getScriptProperties();
      const adminId = (props.getProperty('ADMIN_ID') || 'admin').trim();
      const adminPw = (props.getProperty('ADMIN_PW') || '1234').trim();
      
      const inputId = (params.payload.id || '').trim();
      const inputPw = (params.payload.pw || '').trim();
      
      if (inputId === adminId && inputPw === adminPw) {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          version: APP_VERSION,
          token: createSession()
        })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'error',
          msg: '아이디 또는 비밀번호가 일치하지 않습니다.'
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // [보안] 초기 설정 (한번 실행 후 제거 권장)
    if (params.type === 'SETUP_ADMIN') {
      PropertiesService.getScriptProperties().setProperties({
        'ADMIN_ID': params.payload.id,
        'ADMIN_PW': params.payload.pw
      });
      return ContentService.createTextOutput(JSON.stringify({status: 'success', msg: 'Admin 설정 완료'}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // [보안] 일반 요청 토큰 체크
    if (!verifySession(params.token)) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        msg: '세션이 만료되었습니다. 다시 로그인해주세요.'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const ss = SpreadsheetApp.openById(getSheetId());
    
    if (params.type === 'SAVE_PLAN') {
      const sh = ss.getSheetByName('plan');
      const data = params.payload;
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
        SpreadsheetApp.flush();
      }
    } else if (params.type === 'SAVE_CONFIG') {
      const config = {...params.payload};
      delete config.token;
      PropertiesService.getScriptProperties().setProperties(config);
    } else if (params.type === 'UPDATE_RAW_DATA') {
      const status = updateRawDataRefresh(ss, params.payload);
      return ContentService.createTextOutput(JSON.stringify(status))
        .setMimeType(ContentService.MimeType.JSON);
    } else {
      // [보안] 정의되지 않은 타입 요청 시 에러 반환
      return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: '잘못된 요청 타입입니다.'}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({status: 'success'}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      msg: '처리 중 에러 발생: ' + err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}



// ── 3. 상세 파싱 (표준 고정 인덱스 기반 단순화) ───────────────────────────
function parseIntegratedRawData(ss) {
  const ws = ss.getSheetByName('raw data');
  if (!ws) return [];
  const data = ws.getDataRange().getValues();
  if (data.length < 3) return [];

  const n = v => {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return isNaN(v) ? 0 : v;
    let clean = String(v).replace(/[^0-9.-]/g, '');
    let num = Number(clean);
    return isNaN(num) ? 0 : num;
  };

  const rows = [];
  for (let i = 2; i < data.length; i++) {
    const row = data[i];
    
    // 날짜 파싱: 구글 시트 Date 객체 최우선 처리
    let rawDate = row[IDX.date];
    let dateObj = null;
    
    if (rawDate instanceof Date) {
      dateObj = rawDate;
    } else if (rawDate) {
      // 텍스트(예: 2024.01.01) 대응
      const dStr = String(rawDate).replace(/\./g, '-');
      dateObj = new Date(dStr);
      if (isNaN(dateObj.getTime())) dateObj = new Date(rawDate);
    }

    if (!dateObj || isNaN(dateObj.getTime())) continue;

    const final = n(row[IDX.final]);
    const defect = n(row[IDX.defect]);
    
    rows.push({
      date: Utilities.formatDate(dateObj, 'Asia/Seoul', 'yyyy-MM-dd'),
      month: n(row[IDX.month] || dateObj.getMonth() + 1),
      weekNum: calculateISOWeek(dateObj),
      seong: n(row[IDX.seong]), jorip: n(row[IDX.jorip]), reel: n(row[IDX.reel]), 
      final: final, defect: defect, 
      ppm: final > 0 ? Math.round(defect/final*1e6*10)/10 : 0,
      achieve: 180000 ? Math.round(final / 180000 * 10000) / 10000 : 0,
      sq: n(row[IDX.sq]), sc: n(row[IDX.sc]), co: n(row[IDX.co]), 
      sp: n(row[IDX.sp]), ti: n(row[IDX.ti]), et: n(row[IDX.et]),
      remark: row[IDX.remark] ? String(row[IDX.remark]) : '',
      // 설비 데이터 (하단 고정 인덱스)
      s5: n(row[8]), s6: n(row[9]), s7: n(row[10]), s8: n(row[11]), s9: n(row[12]),
      j1: n(row[13]), j2: n(row[14]), j3: n(row[15]), j5: n(row[16]), j6: n(row[17]),
      j7: n(row[18]), j8: n(row[19]), j9: n(row[20]), j10: n(row[21]), j11: n(row[22]), j12: n(row[23]),
      r1: n(row[24]), r2: n(row[25]), r3: n(row[26]), r4: n(row[27]),
      f1: n(row[28]), f2: n(row[29]), f3: n(row[30]),
      capAvg: n(row[IDX.cap.avg]), capMin: n(row[IDX.cap.min]), capMax: n(row[IDX.cap.max]),
      c1: n(row[42]), c2: n(row[43]), c3: n(row[44]), c4: n(row[45]), c5: n(row[46]),
      c6: n(row[47]), c7: n(row[48]), c8: n(row[49]), c9: n(row[50]), c10: n(row[51])
    });
  }
  return rows;
}

// ── 4. 집계 및 저장 엔진 ───────────────────────────
function runMonitoringV3() {
  const ss = SpreadsheetApp.openById(getSheetId());
  const raw = parseIntegratedRawData(ss);
  if (!raw || raw.length === 0) return;

  saveToSheetWithAutoCreate(ss, '일별 생산현황', raw);
  saveToSheetWithAutoCreate(ss, '주별 생산현황', aggregateWeekly(raw));
  saveToSheetWithAutoCreate(ss, '월별 생산현황', aggregateMonthly(raw));
  saveToSheetWithAutoCreate(ss, '연간 실적 합계', [aggregateAnnual(raw)]);
  
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
    ...w, ppm: w.final?Math.round(w.defect/w.final*1e6*10)/10:0,
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
    ...mo, ppm: mo.final?Math.round(mo.defect/mo.final*1e6*10)/10:0, 
    achieve: mo.target?Math.round(mo.final/mo.target*10000)/10000:0 
  })).sort((a,b)=>a.month-b.month);
}

function aggregateAnnual(rows) {
  const a = { year: new Date().getFullYear(), target: 54000000 };
  SUM_KEYS.forEach(f => a[f] = 0);
  rows.forEach(r => SUM_KEYS.forEach(f => a[f] += (r[f]||0)));
  return { ...a, ppm: a.final ? Math.round(a.defect/a.final*1e6*10)/10 : 0, achieve: a.target ? Math.round(a.final / a.target * 10000) / 10000 : 0 };
}

function saveToSheetWithAutoCreate(ss, name, data) {
  if (!data || data.length === 0) return;
  let sh = ss.getSheetByName(name) || ss.insertSheet(name);
  
  const h = Object.keys(data[0]);
  const matrix = [h, ...data.map(r => h.map(k => r[k]))];
  
  sh.clearContents();
  sh.getRange(1, 1, matrix.length, h.length).setValues(matrix);
}

function calculateISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-W${String(Math.ceil((((d-yearStart)/86400000)+1)/7)).padStart(2,'0')}`;
}

function extractMachineData(raw) {
  return raw.map(r => ({ 날짜: r.date, 성형5: r.s5, 성형6: r.s6, 성형7: r.s7, 성형8: r.s8, 성형9: r.s9, 조립1: r.j1, 조립2: r.j2, 조립3: r.j3, 조립5: r.j5, 조립6: r.j6, 조립7: r.j7, 조립8: r.j8, 조립9: r.j9, 조립10: r.j10, 조립11: r.j11, 조립12: r.j12, 포장1: r.r1, 포장2: r.r2, 포장3: r.r3, 포장4: r.r4, 최종1: r.f1, 최종2: r.f2, 최종3: r.f3, 비고: r.remark }));
}

function extractDefectData(raw) {
  return raw.map(r => ({ 날짜: r.date, 찌그러짐: r.sq, 스크레치: r.sc, 오염: r.co, 스프링: r.sp, 기울어짐: r.ti, 기타: r.et, 비고: r.remark }));
}

function extractCapData(raw) {
  return raw.map(r => ({ 날짜: r.date, 평균: r.capAvg, 최소: r.capMin, 최대: r.capMax, C1: r.c1, C2: r.c2, C3: r.c3, C4: r.c4, C5: r.c5, C6: r.c6, C7: r.c7, C8: r.c8, C9: r.c9, C10: r.c10 }));
}

function fetchLineBalance(ss) {
  const sh = ss.getSheets().find(s => s.getName().replace(/\s/g, '').includes('생산계획'));
  if (!sh) return { error: true, msg: "생산계획 시트 누락" };
  const v = sh.getDataRange().getValues();
  while(v.length <= 25) v.push([]);
  const basics = [];
  for(let i=9; i<=12; i++) basics.push({ process: String(v[i][0]).trim(), timeCapa: Number(v[i][1])||0, runTime: Number(v[i][2])||0, machines: Number(v[i][3])||0, days: Number(v[i][4])||0, personnel: Number(v[i][5])||0 });
  const capas = [];
  for(let i=16; i<=19; i++) capas.push({ process: String(v[i][0]).trim(), daily: Number(v[i][1])||0, monthly: Number(v[i][2])||0, reqPerson: Number(v[i][3])||0 });
  return { targetQty: v[4][2]||0, actualQty: v[5][2]||0, achieveRate: v[6][2]||0, basics, capas };
}

/**
 * [개선] Refresh Sync: 기존 데이터를 비우고 새로운 데이터를 규격에 맞춰 재구성하여 저장합니다.
 */
function updateRawDataRefresh(ss, payloadRows) {
  const sh = ss.getSheetByName('raw data');
  if (!sh) return { status: 'error', msg: "'raw data' 시트 누락" };
  
  // 1. 유효 데이터 필터링
  const validRows = payloadRows.filter(row => row[3] && String(row[3]).trim() !== '' && !String(row[3]).includes('날짜'));
  if (validRows.length === 0) return { status: 'error', msg: "업로드할 데이터가 없습니다." };

  // 2. 데이터 가공 (구조 보존을 위한 패딩만 처리)
  const TARGET_COLS = 52; 
  const processedRows = validRows.map(row => {
    let newRow = Array(TARGET_COLS).fill('');
    row.forEach((val, i) => { if (i < TARGET_COLS) newRow[i] = val; });
    return newRow;
  });

  // 3. 일괄 쓰기 (추가 서식 지정 없이 데이터 그대로 입력)
  const lastRow = sh.getLastRow();
  if (lastRow >= 3) {
    sh.getRange(3, 1, Math.max(lastRow - 2, processedRows.length), TARGET_COLS).clearContent();
  }
  
  sh.getRange(3, 1, processedRows.length, TARGET_COLS).setValues(processedRows);
  SpreadsheetApp.flush();
  
  // 4. 집계 엔진 실행
  try {
    runMonitoringV3();
    return { status: 'success', added: processedRows.length };
  } catch(e) {
    console.error("Dashboard sync error: " + e.toString());
    return { status: 'success', added: processedRows.length, warning: '집계 오류' };
  }
}
