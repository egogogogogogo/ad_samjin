/**
 * Samjin QMS - Integrated Bidirectional System (v7.0)
 * 가이드: [raw data] 분석 -> [Plan 양방향 연동] -> [장비별 상세 모니터링]
 */

const SECRETS = {
  SHEET_ID: '1K9KKc3a6_RmxcE-eD6Roj9DnZt3t2dhkGlEyg4JhiCg'
};

// ── 1. Web App API (doGet: 데이터 읽기) ─────────────────────────
function doGet(e) {
  const ss = SpreadsheetApp.openById(SECRETS.SHEET_ID);
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
    ppm: props.ppm || 500,
    monthlyTarget: props.monthlyTarget || 4500000,
    defectLimit: props.defectLimit || 80,
    capMin: props.capMin || 410
  };

  return ContentService.createTextOutput(JSON.stringify({
    daily: fetchData('daily'),
    weekly: fetchData('weekly'),
    monthly: fetchData('monthly'),
    annual: fetchData('annual')[0] || {},
    plan: fetchData('plan'),
    thresholds: thresholds,
    meta: fetchData('meta')[0] || {}
  })).setMimeType(ContentService.MimeType.JSON);
}

// ── 2. Web App API (doPost: 데이터 저장) ────────────────────────
function doPost(e) {
  const ss = SpreadsheetApp.openById(SECRETS.SHEET_ID);
  const params = JSON.parse(e.postData.contents);
  
  if (params.type === 'SAVE_PLAN') {
    const sh = ss.getSheetByName('plan');
    const data = params.payload; // [[월, 주차, 공정, 목표, 비고], ...]
    if (sh && data.length > 0) {
      sh.getRange(2, 1, sh.getLastRow(), sh.getLastColumn()).clearContent();
      sh.getRange(2, 1, data.length, data[0].length).setValues(data);
    }
  } else if (params.type === 'SAVE_CONFIG') {
    PropertiesService.getScriptProperties().setProperties(params.payload);
  }

  return ContentService.createTextOutput(JSON.stringify({status: 'success'}))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── 3. 상세 파싱 (장비/불량/탈거력 모든 컬럼 추출) ──────────────────
function parseIntegratedRawData(ss) {
  const ws = ss.getSheetByName('raw data');
  if (!ws) return [];
  const data = ws.getDataRange().getValues();
  const rows = [];
  
  for (let i = 2; i < data.length; i++) {
    const row = data[i];
    const date = row[3];
    if (!(date instanceof Date)) continue;
    
    // 숫자 강제 변환 헬퍼 (쉼표, 특수문자, 공백 완벽 제거)
    const n = v => {
      if (v === null || v === undefined || v === '') return 0;
      if (typeof v === 'number') return isNaN(v) ? 0 : v;
      let clean = String(v).replace(/[^0-9.-]/g, '');
      let num = Number(clean);
      return isNaN(num) ? 0 : num;
    };

    const final = n(row[7]);
    const defect = n(row[31]);
    
    rows.push({
      date: Utilities.formatDate(date, 'Asia/Seoul', 'yyyy-MM-dd'),
      month: n(row[0]), weekNum: calculateISOWeek(date),
      // 총 생산량
      seong: n(row[4]), jorip: n(row[5]), reel: n(row[6]), final: final,
      // 장비별 생산 (s5~9, j1~12, r1~4, f1~3)
      s5: n(row[8]), s6: n(row[9]), s7: n(row[10]), s8: n(row[11]), s9: n(row[12]),
      j1: n(row[13]), j2: n(row[14]), j3: n(row[15]), j5: n(row[16]), j6: n(row[17]),
      j7: n(row[18]), j8: n(row[19]), j9: n(row[20]), j10: n(row[21]), j11: n(row[22]), j12: n(row[23]),
      r1: n(row[24]), r2: n(row[25]), r3: n(row[26]), r4: n(row[27]),
      f1: n(row[28]), f2: n(row[29]), f3: n(row[30]),
      // 품질 (PPM 및 불량 6종)
      defect: defect, ppm: final > 0 ? Math.round(defect/final*1e6*10)/10 : 0,
      sq: n(row[32]), sc: n(row[33]), co: n(row[34]), sp: n(row[35]), ti: n(row[36]), et: n(row[37]),
      remark: row[38] ? String(row[38]) : '',
      // Cap 탈거력 (1~12EA)
      capAvg: n(row[39]), capMin: n(row[40]), capMax: n(row[41]),
      c1: n(row[42]), c2: n(row[43]), c3: n(row[44]), c4: n(row[45]), c5: n(row[46]),
      c6: n(row[47]), c7: n(row[48]), c8: n(row[49]), c9: n(row[50]), c10: n(row[51])
    });
  }
  return rows;
}

// ── 4. 기타 필수 엔진 (v6.0 로직 유지) ───────────────────────────
function runMonitoringV3() {
  const ss = SpreadsheetApp.openById(SECRETS.SHEET_ID);
  const raw = parseIntegratedRawData(ss);
  if (!raw || raw.length === 0) return;

  saveToSheetWithAutoCreate(ss, 'daily', raw);
  saveToSheetWithAutoCreate(ss, 'weekly', aggregateWeekly(raw));
  saveToSheetWithAutoCreate(ss, 'monthly', aggregateMonthly(raw));
  saveToSheetWithAutoCreate(ss, 'annual', [aggregateAnnual(raw)]);

  const metaSh = ss.getSheetByName('meta') || ss.insertSheet('meta');
  metaSh.clearContents().getRange(1, 1, 1, 2).setValues([['lastUpdated', new Date().toISOString()]]);
}

const SUM_KEYS = ['seong','jorip','reel','final','defect','sq','sc','co','sp','ti','et','s5','s6','s7','s8','s9','j1','j2','j3','j5','j6','j7','j8','j9','j10','j11','j12','r1','r2','r3','r4','f1','f2','f3'];

function aggregateWeekly(rows) {
  const m = {};
  rows.forEach(r => {
    const k = r.weekNum;
    if (!m[k]) { m[k]={week:k, days:0}; SUM_KEYS.forEach(f=>m[k][f]=0); }
    SUM_KEYS.forEach(f=>m[k][f] += (r[f]||0));
    m[k].days++;
  });
  return Object.values(m).map(w => ({ ...w, ppm: w.final?Math.round(w.defect/w.final*1e6*10)/10:0 })).sort((a,b)=>a.week.localeCompare(b.week));
}

function aggregateMonthly(rows) {
  const m = {};
  rows.forEach(r => {
    const k = r.month; if (!k) return;
    if (!m[k]) { m[k]={month:k, days:0, target:4500000}; SUM_KEYS.forEach(f=>m[k][f]=0); }
    SUM_KEYS.forEach(f=>m[k][f] += (r[f]||0));
    m[k].days++;
  });
  return Object.values(m).map(mo => ({ ...mo, ppm: mo.final?Math.round(mo.defect/mo.final*1e6*10)/10:0, achieve: mo.target?Math.round(mo.final/mo.target*10000)/10000:0 })).sort((a,b)=>a.month-b.month);
}

function aggregateAnnual(rows) {
  const a = { year: 2026, target: 54000000 };
  SUM_KEYS.forEach(f => a[f] = 0);
  rows.forEach(r => SUM_KEYS.forEach(f => a[f] += (r[f]||0)));
  return { ...a, ppm: a.final ? Math.round(a.defect/a.final*1e6*10)/10 : 0 };
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
