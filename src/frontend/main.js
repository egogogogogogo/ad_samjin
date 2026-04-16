/**
 * Samjin QMS Frontend Engine (v8.0 - Advanced Viz & Planning)
 */

const state = {
    apiUrl: localStorage.getItem('samjin_qms_api_url') || '',
    activeTab: 'dashboard',
    activeDashTab: 'summary', // dashboard sub-tab
    timeframe: 'daily', // daily, weekly, monthly, annual
    activeSubTab: 'total', // realtime data sub-tab
    filter: { start: '', end: '' }, // Date range filter
    data: null,
    thresholds: { ppm: 500, monthlyTarget: 4500000, defectLimit: 80, capMin: 410 },
    sort: { key: 'date', order: 'asc' },
    charts: {}
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    document.querySelectorAll('.nav-links li').forEach(li => {
        li.addEventListener('click', () => switchTab(li.getAttribute('data-tab')));
    });
    document.querySelectorAll('.sub-tab[data-sub]').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.sub-tab[data-sub]').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.activeSubTab = tab.getAttribute('data-sub');
            renderRealtimeTable();
        });
    });

    document.querySelectorAll('.dash-sub-tabs .sub-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.dash-sub-tabs .sub-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.activeDashTab = tab.getAttribute('data-dtab');
            document.querySelectorAll('.dash-sec').forEach(sec => sec.style.display = 'none');
            document.getElementById(`dash-sec-${state.activeDashTab}`).style.display = 'block';
            renderDashboardCharts();
        });
    });

    document.querySelectorAll('.tf-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.timeframe = btn.getAttribute('data-tf');
            renderKPIs();
            renderDashboardCharts();
        });
    });

    document.getElementById('btn-refresh').addEventListener('click', fetchData);
    document.getElementById('btn-save-config').addEventListener('click', saveConfig);
    document.getElementById('btn-save-plan').addEventListener('click', savePlanningData);

    const today = new Date();
    const priorDate = new Date(new Date().setDate(today.getDate() - 30));
    state.filter.start = priorDate.toISOString().split('T')[0];
    state.filter.end = today.toISOString().split('T')[0];
    document.getElementById('filter-start').value = state.filter.start;
    document.getElementById('filter-end').value = state.filter.end;

    document.getElementById('filter-start').addEventListener('change', (e) => { state.filter.start = e.target.value; renderUI(); });
    document.getElementById('filter-end').addEventListener('change', (e) => { state.filter.end = e.target.value; renderUI(); });

    if (state.apiUrl) fetchData();
    else switchTab('settings');
}

function getFilteredData(timeframe) {
    if (!state.data || !state.data.daily) return [];
    
    // 1. 항상 '일간' 기반으로 사용자가 지정한 날짜 범위 안의 데이터만 추출합니다.
    const filteredDaily = state.data.daily.filter(d => d.date && d.date >= state.filter.start && d.date <= state.filter.end);
    if (filteredDaily.length === 0) return [];
    if (timeframe === 'daily') return filteredDaily;

    // 2. 주/월/연 단위일 경우, 필터링된 일간 데이터를 기준 단위로 프론트엔드에서 실시간 재집계합니다.
    // 이렇게 해야만 "선택한 구간에 엮여 있는" 쓸데없는 과거/미래 데이터가 표출되는 것을 막습니다.
    const keysLog = ['seong','jorip','reel','final','defect','sq','sc','co','sp','ti','et','s5','s6','s7','s8','s9','j1','j2','j3','j5','j6','j7','j8','j9','j10','j11','j12','r1','r2','r3','r4','f1','f2','f3'];
    
    if (timeframe === 'weekly') {
        const m = {};
        filteredDaily.forEach(r => {
            const k = r.weekNum; if(!k) return;
            if (!m[k]) { m[k] = { week: k, days: 0 }; keysLog.forEach(f=>m[k][f]=0); }
            keysLog.forEach(f=>m[k][f] += (r[f]||0));
            m[k].days++;
        });
        return Object.values(m).map(w => ({ ...w, ppm: w.final?Math.round(w.defect/w.final*1e6*10)/10:0 })).sort((a,b)=>a.week.localeCompare(b.week));
    }
    
    if (timeframe === 'monthly') {
        const m = {};
        filteredDaily.forEach(r => {
            const k = r.month; if(!k) return;
            if (!m[k]) { m[k] = { month: k, days: 0 }; keysLog.forEach(f=>m[k][f]=0); }
            keysLog.forEach(f=>m[k][f] += (r[f]||0));
            m[k].days++;
        });
        return Object.values(m).map(mo => ({ ...mo, ppm: mo.final?Math.round(mo.defect/mo.final*1e6*10)/10:0 })).sort((a,b)=>a.month-b.month);
    }
    
    if (timeframe === 'annual') {
        const a = { year: filteredDaily[0].date.substring(0,4), days: 0 };
        keysLog.forEach(f=>a[f]=0);
        filteredDaily.forEach(r => {
            keysLog.forEach(f=>a[f]+=(r[f]||0));
            a.days++;
        });
        a.ppm = a.final ? Math.round(a.defect/a.final*1e6*10)/10 : 0;
        return [a];
    }
    
    return filteredDaily;
}

// 동적 타겟 계산 (생산계획표 기반)
function getDynamicTarget(timeframe, dtStr) {
    if (!state.data || !state.data.plan) return state.thresholds.monthlyTarget;
    let target = 0;
    const plans = state.data.plan;
    if (timeframe === 'monthly') {
        const m = parseInt(dtStr); // dtStr is month number
        plans.filter(p => p.월 == m && p.공정 === '최종').forEach(p => target += p.목표수량);
    } else if (timeframe === 'weekly') {
        const w = parseInt(dtStr.split('W')[1] || 0); // rough estimation
        plans.filter(p => p.주차 == w && p.공정 === '최종').forEach(p => target += p.목표수량);
    }
    // 기본 폴백
    return target > 0 ? target : (timeframe === 'daily' ? 180000 : state.thresholds.monthlyTarget);
}

function log(msg, color = 'var(--success)') {
    const cons = document.getElementById('debug-cons');
    if (!cons) return;
    const time = new Date().toLocaleTimeString();
    cons.innerHTML = `[${time}] <span style="color:${color}">${msg}</span><br>` + cons.innerHTML;
}

async function fetchData() {
    if (!state.apiUrl) {
        log('API URL 미설정.', 'var(--warning)');
        return;
    }
    document.getElementById('update-ts').textContent = '동기화 중...';
    try {
        const res = await fetch(state.apiUrl);
        const json = await res.json();
        state.data = json;
        if (json.thresholds) state.thresholds = json.thresholds;
        
        const count = json.daily ? json.daily.length : 0;
        log(`데이터 연동 성공! (불러온 실적: ${count}건)`);
        
        if (count === 0) log('주의: 일별 실적이 존재하지 않습니다. 시트 동기화를 확인하세요.', 'var(--warning)');
        
        renderUI();
        document.getElementById('update-ts').textContent = `최종 동기화: ${new Date().toLocaleTimeString()}`;
    } catch (e) {
        log(`[통신 에러] ${e.message}`, 'var(--danger)');
        console.error(e);
    }
}

function renderUI() {
    if (!state.data) return;
    if (state.activeTab === 'dashboard') { renderKPIs(); renderDashboardCharts(); }
    else if (state.activeTab === 'realtime') { renderRealtimeTable(); }
    else if (state.activeTab === 'planning') { renderPlanningTable(); }
    else if (state.activeTab === 'settings') { renderSettings(); }
}

function renderKPIs() {
    let sourceData = getFilteredData(state.timeframe);
    let labelPrefix = '';
    
    // 빈 데이터 제거 (생산량 0 제외)
    if (state.timeframe === 'daily') sourceData = sourceData.filter(d => d.final > 0);
    
    if (state.timeframe === 'daily') labelPrefix = '일간';
    else if (state.timeframe === 'weekly') labelPrefix = '주간';
    else if (state.timeframe === 'monthly') labelPrefix = '월간';
    else if (state.timeframe === 'annual') labelPrefix = '연간';

    const container = document.getElementById('kpi-container');
    if (sourceData.length === 0) {
        container.innerHTML = `<div class="kpi-card" style="grid-column: 1 / -1; text-align:center; color:var(--text-dim);">[${labelPrefix}] 표시할 실적 데이터가 없습니다. 지정된 날짜 범위를 확인해 주세요.</div>`;
        return;
    }

    const latest = sourceData[sourceData.length - 1]; // 가장 최신(마지막) 데이터
    
    // 라벨 동적 텍스트
    let timeLabel = '';
    let targetBasis = '';
    if (state.timeframe === 'daily') { timeLabel = `(${latest.date}) ${labelPrefix}`; targetBasis = latest.date; }
    else if (state.timeframe === 'weekly') { timeLabel = `${latest.week} ${labelPrefix}`; targetBasis = latest.week; }
    else if (state.timeframe === 'monthly') { timeLabel = `${latest.month}월 ${labelPrefix}`; targetBasis = latest.month; }
    else if (state.timeframe === 'annual') { timeLabel = `${latest.year}년 ${labelPrefix}`; targetBasis = latest.year; }

    const targetQty = getDynamicTarget(state.timeframe, targetBasis);
    let achieve = latest.final / targetQty; // 프론트엔드 자체 동적 계산
    if (state.timeframe === 'annual' && state.data.annual) achieve = (latest.final || 0) / 54000000;
    
    container.innerHTML = `
        <div class="kpi-card">
            <div class="label">${timeLabel} 품질 PPM</div>
            <div class="value" style="color:${latest.ppm > state.thresholds.ppm ? 'var(--danger)' : 'var(--accent)'}">${latest.ppm.toLocaleString()}</div>
        </div>
        <div class="kpi-card">
            <div class="label">${timeLabel} 달성률</div>
            <div class="value" style="color:${achieve < 0.9 ? 'var(--warning)' : 'var(--success)'}">${Math.round(achieve * 100)}%</div>
        </div>
        <div class="kpi-card">
            <div class="label">${timeLabel} 생산량 합계</div>
            <div class="value">${latest.final.toLocaleString()} EA</div>
        </div>
        <div class="kpi-card">
            <div class="label">${timeLabel} 평균 불량수</div>
            <div class="value">${Math.round(latest.defect || 0).toLocaleString()} 건</div>
        </div>
    `;
}

function renderRealtimeTable() {
    const daily = state.data.daily || [];
    const head = document.getElementById('data-head');
    const body = document.getElementById('data-body');
    const sorted = [...daily].sort((a,b) => state.sort.order === 'asc' ? String(a[state.sort.key]).localeCompare(String(b[state.sort.key])) : String(b[state.sort.key]).localeCompare(String(a[state.sort.key])));

    let config = { headers: [], keys: [] };
    if (state.activeSubTab === 'total') {
        config = { 
            headers: ['날짜', '최종생산', '불량', 'PPM', '달성률', '성형', '조립', '릴', '비고'], 
            keys: ['date', 'final', 'defect', 'ppm', 'achieve', 'seong', 'jorip', 'reel', 'remark'] 
        };
    } else if (state.activeSubTab === 'machine') {
        config = { headers: ['날짜', 'S5','S6','S7','S8','S9', 'J1','J2','J3','J5','J6','J7','J8','J9','J10','J11','J12', 'R1','R2','R3','R4', 'F1','F2','F3'], keys: ['date', 's5','s6','s7','s8','s9','j1','j2','j3','j5','j6','j7','j8','j9','j10','j11','j12','r1','r2','r3','r4','f1','f2','f3'] };
    } else if (state.activeSubTab === 'defect') {
        config = { headers: ['날짜', '찌그러짐', '스크레치', '오염', '스프링', '기울어짐', '기타'], keys: ['date', 'sq', 'sc', 'co', 'sp', 'ti', 'et'] };
    } else if (state.activeSubTab === 'cap') {
        config = { headers: ['날짜', '평균', 'Min', 'Max', 'C1','C2','C3','C4','C5','C6','C7','C8','C9','C10'], keys: ['date', 'capAvg', 'capMin', 'capMax', 'c1','c2','c3','c4','c5','c6','c7','c8','c9','c10'] };
    }

    head.innerHTML = `<tr>${config.headers.map(h => `<th onclick="handleSort('${config.keys[config.headers.indexOf(h)]}')">${h}</th>`).join('')}</tr>`;
    body.innerHTML = sorted.map(row => `<tr>${config.keys.map(k => {
        let val = row[k];
        let style = '';
        if (k === 'ppm' && val > state.thresholds.ppm) style = 'color:var(--danger); font-weight:bold;';
        if (k === 'achieve') {
            val = Math.round(val * 100) + '%';
            if (row[k] < 0.9) style = 'color:var(--warning)';
        } else if (typeof val === 'number' && k !== 'date') {
            val = val.toLocaleString();
        }
        return `<td style="${style}">${val || '-'}</td>`;
    }).join('')}</tr>`).join('');
}

function handleSort(key) {
    if (state.sort.key === key) state.sort.order = state.sort.order === 'asc' ? 'desc' : 'asc';
    else { state.sort.key = key; state.sort.order = 'asc'; }
    renderRealtimeTable();
}

function renderPlanningTable() {
    const plans = state.data.plan || [];
    const body = document.getElementById('plan-body');
    
    const rowsHtml = plans.map((p, idx) => `
        <tr>
            <td><select class="editable-input plan-month">${[1,2,3,4,5,6,7,8,9,10,11,12].map(m=>`<option value="${m}" ${p.월==m?'selected':''}>${m}월</option>`).join('')}</select></td>
            <td><select class="editable-input plan-week">${[1,2,3,4,5].map(w=>`<option value="${w}" ${p.주차==w?'selected':''}>${w}주차</option>`).join('')}</select></td>
            <td><select class="editable-input plan-proc">${['성형','조립','포장','최종'].map(pr=>`<option value="${pr}" ${p.공정==pr?'selected':''}>${pr}</option>`).join('')}</select></td>
            <td><input type="number" class="editable-input plan-qty" value="${p.목표수량 || 0}"></td>
            <td><input type="text" class="editable-input plan-remark" style="width:100%; text-align:left;" value="${p.비고 || ''}"></td>
        </tr>
    `).join('');
    
    const addBtnHtml = `<tr><td colspan="5" style="text-align:center; padding:10px;"><button class="btn-save" style="background:#222; color:var(--accent);" onclick="addNewPlanRow()">+ 신규 계획 행 추가</button></td></tr>`;
    body.innerHTML = rowsHtml + addBtnHtml;
}

function addNewPlanRow() {
    state.data.plan.push({ 월: 1, 주차: 1, 공정: '성형', 목표수량: 0, 비고: '' });
    renderPlanningTable();
}

async function savePlanningData() {
    const rows = document.querySelectorAll('#plan-body tr:not(:last-child)');
    const payload = Array.from(rows).map(tr => [Number(tr.querySelector('.plan-month').value), Number(tr.querySelector('.plan-week').value), tr.querySelector('.plan-proc').value, Number(tr.querySelector('.plan-qty').value), tr.querySelector('.plan-remark').value]);
    log('생산계획 저장 중...');
    try {
        await fetch(state.apiUrl, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ type: 'SAVE_PLAN', payload }) });
        alert('저장 완료! (약 1분 후 시트 반영)');
        fetchData();
    } catch (e) { log(`저장 실패`, 'var(--danger)'); }
}

function renderSettings() {
    document.getElementById('api-url-input').value = state.apiUrl;
    document.getElementById('th-ppm').value = state.thresholds.ppm;
    document.getElementById('th-target').value = state.thresholds.monthlyTarget;
    document.getElementById('th-defect').value = state.thresholds.defectLimit;
    document.getElementById('th-cap').value = state.thresholds.capMin;
}

async function saveConfig() {
    const payload = { ppm: document.getElementById('th-ppm').value, monthlyTarget: document.getElementById('th-target').value, defectLimit: document.getElementById('th-defect').value, capMin: document.getElementById('th-cap').value };
    const url = document.getElementById('api-url-input').value.trim();
    localStorage.setItem('samjin_qms_api_url', url);
    state.apiUrl = url;
    try {
        await fetch(state.apiUrl, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ type: 'SAVE_CONFIG', payload }) });
        alert('설정 저장 완료');
        fetchData();
    } catch (e) { alert('설정 저장 실패'); }
}

function switchTab(id) {
    state.activeTab = id;
    document.querySelectorAll('.nav-links li').forEach(li => li.classList.toggle('active', li.getAttribute('data-tab') === id));
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.toggle('active', tab.id === `tab-${id}`));
    renderUI();
}

function renderDashboardCharts() {
    // 1. Data Selection based on Timeframe and Date Range Filter
    let chartData = getFilteredData(state.timeframe);
    let xKey = 'date';
    
    if (state.timeframe === 'daily') {
        chartData = chartData.filter(d => d.final > 0);
        xKey = 'date';
        document.getElementById('chart-title-trend').textContent = '일간 PPM & 생산량 트렌드';
    } else if (state.timeframe === 'weekly') {
        xKey = 'week';
        document.getElementById('chart-title-trend').textContent = '주간 PPM & 생산량 트렌드';
    } else if (state.timeframe === 'monthly') {
        xKey = 'month';
        document.getElementById('chart-title-trend').textContent = '월간 PPM & 생산량 트렌드';
    } else if (state.timeframe === 'annual') {
        chartData = state.data.annual && state.data.annual.final ? [state.data.annual] : [];
        xKey = 'year';
        document.getElementById('chart-title-trend').textContent = '연간 PPM & 생산량';
    }

    const cleanCanvas = (id) => {
        const ctx = document.getElementById(id)?.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.font = "14px Arial"; ctx.fillStyle = "#94a3b8"; ctx.textAlign = "center";
            ctx.fillText("데이터가 없습니다.", ctx.canvas.width/2, ctx.canvas.height/2);
        }
    };

    const chartIds = ['mainChart', 'defectChart', 'processChart', 'capChart', 'machineChart', 'planChart'];
    if (!chartData.length) {
        chartIds.forEach(cleanCanvas);
        return;
    }

    const labels = chartData.map(d => {
        if(xKey === 'date') return d[xKey].slice(5); // MM-DD
        if(xKey === 'month') return String(d[xKey]) + '월';
        return d[xKey];
    });
    const latest = chartData[chartData.length - 1];

    // Destroy existing charts to prevent overlay
    chartIds.forEach(id => {
        if (state.charts[id]) state.charts[id].destroy();
    });

    // Option Boilerplate
    const commonOptions = { responsive: true, maintainAspectRatio: false, color: '#94a3b8', plugins: { legend: { labels: { color: '#94a3b8' } } }, scales: { x: { ticks: { color: '#94a3b8'}, grid: { color: 'rgba(255,255,255,0.05)'} }, y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)'} } } };

    // --- SUMMARY TAB ---
    if (state.activeDashTab === 'summary') {
        const ctxMain = document.getElementById('mainChart').getContext('2d');
        state.charts.mainChart = new Chart(ctxMain, {
            data: {
                labels: labels,
                datasets: [
                    { type: 'line', label: 'PPM', data: chartData.map(d => d.ppm), borderColor: '#f87171', yAxisID: 'y1', tension: 0.3 },
                    { type: 'bar', label: '생산량', data: chartData.map(d => d.final), backgroundColor: '#38bdf8', yAxisID: 'y' }
                ]
            },
            options: { ...commonOptions, scales: { ...commonOptions.scales, y1: { position: 'right', ticks: { color: '#f87171' }, grid: { display: false } } } }
        });

        // Pareto Chart (Defect Types) -> Assuming Bar for exact numbers, Line for cumulative%
        const defects = [
            { k: '찌그러짐', v: latest.sq||0 }, { k: '스크레치', v: latest.sc||0 }, { k: '오염', v: latest.co||0 },
            { k: '스프링', v: latest.sp||0 }, { k: '기울어짐', v: latest.ti||0 }, { k: '기타', v: latest.et||0 }
        ].sort((a,b) => b.v - a.v);
        
        let totalD = defects.reduce((sum, d) => sum + d.v, 0);
        let cum = 0;
        const cumPercents = defects.map(d => { cum += d.v; return totalD ? (cum/totalD*100).toFixed(1) : 0; });

        const ctxDefect = document.getElementById('defectChart').getContext('2d');
        state.charts.defectChart = new Chart(ctxDefect, {
            data: {
                labels: defects.map(d=>d.k),
                datasets: [
                    { type: 'line', label: '누적 비율(%)', data: cumPercents, borderColor: '#34d399', yAxisID: 'y1' },
                    { type: 'bar', label: '발생 건수', data: defects.map(d=>d.v), backgroundColor: 'rgba(129, 140, 248, 0.7)', yAxisID: 'y' }
                ]
            },
            options: { ...commonOptions, scales: { ...commonOptions.scales, y1: { position: 'right', max: 100, grid: { display: false } } } }
        });
    }

    // --- QUALITY TAB ---
    if (state.activeDashTab === 'quality') {
        const ctxProcess = document.getElementById('processChart').getContext('2d');
        state.charts.processChart = new Chart(ctxProcess, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    { label: '성형', data: chartData.map(d => d.seong), backgroundColor: '#3b82f6' },
                    { label: '조립', data: chartData.map(d => d.jorip), backgroundColor: '#10b981' },
                    { label: '포장(릴)', data: chartData.map(d => d.reel), backgroundColor: '#8b5cf6' },
                    { label: '최종(검사)', data: chartData.map(d => d.final), backgroundColor: '#f43f5e' }
                ]
            },
            options: { ...commonOptions, plugins: { stacked: false } }
        });

        const ctxCap = document.getElementById('capChart').getContext('2d');
        // Cap Data is typically only meaningful daily, but if aggregate, use capAvg.
        // To prevent crash, map fallback to 0.
        state.charts.capChart = new Chart(ctxCap, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Min', data: chartData.map(d => d.capMin||0), borderColor: '#f87171', borderDash: [5, 5], fill: '+1', backgroundColor:'rgba(56, 189, 248, 0.1)' },
                    { label: 'Avg', data: chartData.map(d => d.capAvg||0), borderColor: '#38bdf8', fill: false },
                    { label: 'Max', data: chartData.map(d => d.capMax||0), borderColor: '#34d399', borderDash: [5, 5], fill: '-1', backgroundColor:'rgba(56, 189, 248, 0.1)' },
                    { label: '위험 한계치', data: chartData.map(() => state.thresholds.capMin), borderColor: '#ef4444', borderWidth: 1, pointRadius: 0 }
                ]
            },
            options: { ...commonOptions }
        });
    }

    // --- MACHINE & PLAN TAB ---
    if (state.activeDashTab === 'machine') {
        // Machine Bar Chart (Latest period only, to avoid clutter) 
        // 포장(R1~R4)과 검사(F1~F3) 장비 추가
        const ctxMachine = document.getElementById('machineChart').getContext('2d');
        state.charts.machineChart = new Chart(ctxMachine, {
            type: 'bar',
            data: {
                labels: ['S5','S6','S7','S8','S9', 'J1','J2','J3','J5','J6','J7','J8','J9','J10','J11','J12', 'R1','R2','R3','R4', 'F1','F2','F3'],
                datasets: [{
                    label: `설비별/공정별 실적 합산 (${labels[0]} ~ ${labels[labels.length-1]})`,
                    data: [
                        latest.s5, latest.s6, latest.s7, latest.s8, latest.s9, 
                        latest.j1, latest.j2, latest.j3, latest.j5, latest.j6, latest.j7, latest.j8, latest.j9, latest.j10, latest.j11, latest.j12,
                        latest.r1, latest.r2, latest.r3, latest.r4,
                        latest.f1, latest.f2, latest.f3
                    ],
                    backgroundColor: [
                        '#3b82f6','#3b82f6','#3b82f6','#3b82f6','#3b82f6', 
                        '#10b981','#10b981','#10b981','#10b981','#10b981','#10b981','#10b981','#10b981','#10b981','#10b981','#10b981',
                        '#8b5cf6','#8b5cf6','#8b5cf6','#8b5cf6',
                        '#f43f5e','#f43f5e','#f43f5e'
                    ]
                }]
            },
            options: { ...commonOptions }
        });

        // Plan vs Actual Chart
        const ctxPlan = document.getElementById('planChart').getContext('2d');
        state.charts.planChart = new Chart(ctxPlan, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    { label: '목표 (Target)', data: chartData.map(d => getDynamicTarget(state.timeframe, d[xKey])), backgroundColor: 'rgba(255, 255, 255, 0.2)' },
                    { label: '실적 (Actual)', data: chartData.map(d => d.final), backgroundColor: chartData.map(d => ((d.final / getDynamicTarget(state.timeframe, d[xKey])) < 0.9) ? '#fbbf24' : '#38bdf8') }
                ]
            },
            options: { ...commonOptions }
        });
    }
}
