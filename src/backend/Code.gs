// ── 0. 시스템 정보 및 표준 컬럼 인덱스 (R07 고정 구조) ──────────────
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

// ── 1. Web App API (doGet: 데이터 읽기) ─────────────────────────
function doGet(e) {
  const APP_VERSION = 'v1.1 (240421-1731-DIAG)'; // 진단 기능 포함 버전
  try {
    const ss = SpreadsheetApp.openById(getSheetId());

    // [추가] 자가 진단 모드: AI가 직접 데이터 타입과 상태를 점표하기 위함
    if (e.parameter.type === 'DIAGNOSE') {
      const sh = ss.getSheetByName('raw data');
      const lastRow = sh.getLastRow();
      const lastData = sh.getRange(Math.max(1, lastRow - 9), 1, 10, 8).getValues();
      const diagnostics = lastData.map((r, i) => ({
        row: Math.max(1, lastRow - 9) + i,
        dateValue: r[3],
        dataType: typeof r[3],
        isDateObject: r[3] instanceof Date,
        formatted: (r[3] instanceof Date) ? Utilities.formatDate(r[3], 'Asia/Seoul', 'yyyy-MM-dd') : 'INVALID'
      }));
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        version: APP_VERSION,
        sheetId: getSheetId(),
        lastRow: lastRow,
        diagnostics: diagnostics
      })).setMimeType(ContentService.MimeType.JSON);
    }

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
    const ss = SpreadsheetApp.openById(getSheetId());
    const params = JSON.parse(e.postData.contents);
    
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
      PropertiesService.getScriptProperties().setProperties(params.payload);
    } else if (params.type === 'UPDATE_RAW_DATA') {
      const status = updateRawDataRefresh(ss, params.payload);
      return ContentService.createTextOutput(JSON.stringify(status))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({status: 'success'}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      msg: '저장 에러: ' + err.toString()
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
    
    // 날짜 파싱 (숫자/문자열/객체 대응)
    let rawDate = row[IDX.date];
    let dateObj = null;
    if (rawDate instanceof Date) {
      dateObj = rawDate;
    } else if (typeof rawDate === 'string' && rawDate.trim() !== '') {
      // 1. 점(.) 형식 처리 (2024.01.01)
      let dStr = rawDate.replace(/\./g, '-');
      dateObj = new Date(dStr);
      // 2. 파싱 실패 시 원본 문자열로 재시도 (KST/UTC 문자열 대응)
      if (isNaN(dateObj.getTime())) dateObj = new Date(rawDate);
    } else if (typeof rawDate === 'number') {
      // 엑셀 시리얼 넘버 처리
      dateObj = new Date((rawDate - 25569) * 86400 * 1000);
    }

    if (!dateObj || isNaN(dateObj.getTime())) {
      // 날짜가 없거나 형식이 잘못된 행은 스킵
      continue;
    }

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
  
  // 1. 유효 데이터 필터링 (날짜 컬럼 기준)
  const validRows = payloadRows.filter(row => {
    const d = row[IDX.date];
    return d && String(d).trim() !== '' && !String(d).includes('날짜');
  });

  if (validRows.length === 0) return { status: 'error', msg: "업로드할 유효한 생산 데이터가 없습니다." };

  // 2. 데이터 가공 및 규격화 (가독성 복구 + 구조 보존)
  // [중요] 시트의 전체 너비(AF=31 ~ C10=51까지)를 보존하기 위해 최소 52개 컬럼을 확보합니다.
  const TARGET_COLS = 52; 
  const processedRows = validRows.map(row => {
    // 2-1. Padding: 시트 구조 보존을 위해 부족한 컬럼을 빈 값으로 채움
    let newRow = Array(TARGET_COLS).fill('');
    row.forEach((val, i) => { if (i < TARGET_COLS) newRow[i] = val; });

    // 2-2. Date Recovery: ISO 문자열을 구글 시트 전용 날짜 객체로 변환
    const d = newRow[IDX.date];
    if (typeof d === 'string' && (d.includes('T') || d.includes('Z'))) {
      const dateObj = new Date(d);
      if (!isNaN(dateObj.getTime())) {
        // 시간 오차를 방지하고 가독성을 위해 정시(00:00)로 초기화합니다.
        dateObj.setHours(0, 0, 0, 0); 
        newRow[IDX.date] = dateObj;
      }
    }
    return newRow;
  });

  // 3. 일괄 쓰기 (구조 파괴 없이 데이터만 교체)
  const currentMaxRow = sh.getLastRow();
  if (currentMaxRow >= 3) {
    // 데이터 영역만 정밀하게 초기화
    sh.getRange(3, 1, Math.max(currentMaxRow - 2, processedRows.length), TARGET_COLS).clearContent();
  }
  
  // 가공된 정규 데이터 쓰기
  const dataRange = sh.getRange(3, 1, processedRows.length, TARGET_COLS);
  dataRange.setValues(processedRows);
  
  // [추가] 서식 강제 고정: D열(날짜) 서식을 "yyyy-mm-dd"로 강제 지정하여 문자열 변환 방지
  sh.getRange(3, 4, processedRows.length, 1).setNumberFormat("yyyy-mm-dd");
  
  SpreadsheetApp.flush();
  
  // [핵심] 자가 진단: 실제 시트에 어떻게 저장되었는지 첫 번째 행을 다시 읽어 검사
  const selfCheck = sh.getRange(3, 4).getValue(); // D3 셀
  const diagInfo = `점검 완료(D3 타입: ${typeof selfCheck}, 값: ${selfCheck instanceof Date ? 'Date객체' : '글자'})`;

  // 4. 집계 프로세스 연동
  try {
    runMonitoringV3();
    return { status: 'success', added: processedRows.length, diagnostic: diagInfo };
  } catch(e) {
    console.error("Dashboard aggregation failed: " + e.toString());
    return { 
      status: 'success', 
      added: processedRows.length, 
      diagnostic: diagInfo,
      warning: '데이터 저장 성공. 단, 대시보드 갱신 중 에러 발생: ' + e.message 
    };
  }
}
