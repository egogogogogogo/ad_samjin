/**
 * Samjin QMS Frontend Engine (v9.5 - VIP Executive Dashboard & Line Balancing)
 */

const state = {
    apiUrl: localStorage.getItem('samjin_qms_api_url') || '',
    theme: localStorage.getItem('samjin_theme') || 'dark',
    activeTab: 'dashboard',
    activeDashTab: 'summary',
    timeframe: 'monthly', // shared with realtime
    filterValue: '', 
    customFilter: { start: '', end: '' },
    activeSubTab: 'total',
    data: null,
    thresholds: { ppm: 500, monthlyTarget: 4500000, defectLimit: 80, capMin: 410 },
    sort: { key: 'date', order: 'asc' },
    charts: {},
    drillDown: { active: false, process: null },
    simulators: [] // Line Balancing local state
};

document.addEventListener('DOMContentLoaded', initApp);

function initApp() {
    // Theme setup
    applyTheme(state.theme);
    document.getElementById('theme-btn').addEventListener('click', () => {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        applyTheme(state.theme);
    });

    // Nav logic
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
        btn.addEventListener('click', (e) => {
            const tf = e.target.getAttribute('data-tf');
            state.timeframe = tf;
            
            const d = new Date();
            if(tf === 'daily') state.filterValue = d.toISOString().split('T')[0];
            else if(tf === 'weekly') {
                const s = new Date(d.getFullYear(), 0, 1);
                const w = Math.ceil((((d - s) / 86400000) + s.getDay() + 1) / 7);
                state.filterValue = `${d.getFullYear()}-W${String(w).padStart(2,'0')}`;
            }
            else if(tf === 'monthly') state.filterValue = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
            else if(tf === 'annual') state.filterValue = d.getFullYear().toString();

            document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll(`.tf-btn[data-tf="${tf}"]`).forEach(b => b.classList.add('active'));
            buildDynamicFilterUI();
        });
    });

    document.getElementById('btn-refresh').addEventListener('click', fetchData);
    document.getElementById('btn-save-config').addEventListener('click', saveConfig);
    document.getElementById('btn-save-plan').addEventListener('click', saveLineBalance);

    const today = new Date();
    state.filterValue = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
    state.customFilter.end = today.toISOString().split('T')[0];
    const prior = new Date(); prior.setDate(prior.getDate() - 30);
    state.customFilter.start = prior.toISOString().split('T')[0];

    buildDynamicFilterUI();
    if (state.apiUrl) fetchData();
    else switchTab('settings');
}

function applyTheme(theme) {
    if(theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        document.body.setAttribute('data-theme', 'light');
        document.getElementById('theme-btn').innerHTML = '🌙 다크 모드로 전환';
    } else {
        document.documentElement.removeAttribute('data-theme');
        document.body.removeAttribute('data-theme');
        document.getElementById('theme-btn').innerHTML = '☀️ 라이트 모드로 전환';
    }
    localStorage.setItem('samjin_theme', theme);
    if(state.data) renderDashboardCharts(); // Redraw colors
}

function createFilterUX() {
    let html = '';
    if (state.timeframe === 'daily') {
        let v = state.filterValue.length > 10 ? new Date().toISOString().split('T')[0] : state.filterValue;
        state.filterValue = v;
        html = `<div class="input-with-icon"><input type="date" class="editable-input filter-val" value="${v}"></div>`;
    } else if (state.timeframe === 'weekly') {
        let v = state.filterValue.includes('-W') ? state.filterValue : `${new Date().getFullYear()}-W01`;
        state.filterValue = v;
        html = `<div class="input-with-icon"><input type="week" class="editable-input filter-val" value="${v}"></div>`;
    } else if (state.timeframe === 'monthly') {
        let v = state.filterValue.length !== 7 ? `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}` : state.filterValue;
        state.filterValue = v;
        html = `<div class="input-with-icon"><input type="month" class="editable-input filter-val" value="${v}"></div>`;
    } else if (state.timeframe === 'annual') {
        const curY = new Date().getFullYear();
        let opts = '';
        for(let i=0; i<3; i++) opts += `<option value="${curY-i}">${curY-i}년</option>`;
        if(!state.filterValue || isNaN(state.filterValue)) state.filterValue = curY;
        html = `<div class="input-with-icon"><select class="editable-input filter-val">${opts}</select></div>`;
    } else if (state.timeframe === 'custom') {
        html = `
            <div class="input-with-icon"><input type="date" class="editable-input c-start" value="${state.customFilter.start}" style="width:140px;"></div>
            <span style="color: var(--text-dim); margin:0 4px;">~</span>
            <div class="input-with-icon"><input type="date" class="editable-input c-end" value="${state.customFilter.end}" style="width:140px;"></div>
        `;
    }
    return html;
}

function bindFilterEvents(container) {
    if(!container) return;
    if (state.timeframe === 'custom') {
        container.querySelector('.c-start').onchange = (e) => { state.customFilter.start = e.target.value; renderUI(); };
        container.querySelector('.c-end').onchange = (e) => { state.customFilter.end = e.target.value; renderUI(); };
    } else {
        const el = container.querySelector('.filter-val');
        if(el) {
            if(state.timeframe === 'annual') el.value = state.filterValue;
            el.onchange = (e) => { state.filterValue = e.target.value; renderUI(); };
        }
    }
}

function buildDynamicFilterUI() {
    const c1 = document.getElementById('dynamic-filter-container');
    const c2 = document.getElementById('rt-dynamic-filter-container');
    const html = createFilterUX();
    if(c1) { c1.innerHTML = html; bindFilterEvents(c1); }
    if(c2) { c2.innerHTML = html; bindFilterEvents(c2); }
    if(state.data) renderUI();
}

function formatFilterLabel(val, tf) {
    if(tf === 'weekly' && val && val.includes('-W')) {
        const parts = val.split('-W');
        return `${parts[0]}년 ${parseInt(parts[1])}주차`;
    }
    if(tf === 'monthly' && val && val.includes('-')) {
        const parts = val.split('-');
        return `${parts[0]}년 ${parseInt(parts[1])}월`;
    }
    return val;
}

// Data Parsing Engine
function getAggregatedData(targetTimeframe, valOrRange) {
    if (!state.data || !state.data.daily) return { current: [], previous: [] };
    const all = state.data.daily;
    let curr = [], prev = [];
    
    if (targetTimeframe === 'daily') {
        curr = all.filter(d => d.date === valOrRange);
        const pDate = new Date(valOrRange); pDate.setDate(pDate.getDate()-1);
        prev = all.filter(d => d.date === pDate.toISOString().split('T')[0]);
    }
    else if (targetTimeframe === 'weekly') {
        curr = all.filter(d => d.weekNum === valOrRange);
        if(valOrRange) {
            let [y, w] = valOrRange.split('-W');
            let pW = parseInt(w)-1; let pY = parseInt(y);
            if(pW < 1) { pW = 52; pY--; }
            prev = all.filter(d => d.weekNum === `${pY}-W${String(pW).padStart(2,'0')}`);
        }
    }
    else if (targetTimeframe === 'monthly') {
        const monStr = valOrRange ? parseInt(valOrRange.split('-')[1]) : 0;
        curr = all.filter(d => d.month == monStr);
        let pM = monStr - 1;
        prev = all.filter(d => d.month == (pM < 1 ? 12 : pM));
    }
    else if (targetTimeframe === 'annual') {
        curr = all.filter(d => d.date && d.date.startsWith(String(valOrRange)));
        prev = all.filter(d => d.date && d.date.startsWith(String(parseInt(valOrRange)-1)));
    }
    else if (targetTimeframe === 'custom') {
        curr = all.filter(d => d.date >= valOrRange.start && d.date <= valOrRange.end);
        prev = []; 
    }
    return { current: curr, previous: prev };
}

function aggregateSingleSummary(arr) {
    if(!arr || arr.length === 0) return null;
    const res = { days: arr.length, final: 0, defect: 0, seong:0, jorip:0, reel:0, sq:0, sc:0, co:0, sp:0, ti:0, et:0, capMin:999, capAvgTotal:0 };
    arr.forEach(r => {
        res.final += (r.final||0); res.defect += (r.defect||0);
        res.seong+=(r.seong||0); res.jorip+=(r.jorip||0); res.reel+=(r.reel||0);
        res.sq+=(r.sq||0); res.sc+=(r.sc||0); res.co+=(r.co||0); res.sp+=(r.sp||0); res.ti+=(r.ti||0); res.et+=(r.et||0);
        if(r.capMin && r.capMin < res.capMin) res.capMin = r.capMin;
        res.capAvgTotal += (r.capAvg||0);
        ['s5','s6','s7','s8','s9','j1','j2','j3','j5','j6','j7','j8','j9','j10','j11','j12','r1','r2','r3','r4'].forEach(m => {
            if(!res[m]) res[m]=0; res[m]+=(r[m]||0);
        });
    });
    res.ppm = res.final ? Math.round((res.defect / res.final) * 1e6 * 10)/10 : 0;
    res.capAvg = res.capAvgTotal / res.days;
    if(res.capMin === 999) res.capMin = 0;
    return res;
}

function getDynamicTarget(timeframe) {
    if (!state.data || !state.data.plan) return state.thresholds.monthlyTarget;
    let target = 0;
    const plans = state.data.plan;
    if (timeframe === 'monthly') {
        const m = state.filterValue ? parseInt(state.filterValue.split('-')[1]) : new Date().getMonth()+1;
        plans.filter(p => p.월 == m && p.공정 === '최종').forEach(p => target += p.목표수량);
    } else if (timeframe === 'weekly') {
        const w = state.filterValue ? parseInt(state.filterValue.split('W')[1] || 1) : 1;
        plans.filter(p => p.주차 == w && p.공정 === '최종').forEach(p => target += p.목표수량);
    }
    return target > 0 ? target : (timeframe === 'daily' ? 180000 : state.thresholds.monthlyTarget);
}

function log(msg, color = 'var(--success)') {
    const cons = document.getElementById('debug-cons');
    if (!cons) return;
    const time = new Date().toLocaleTimeString();
    cons.innerHTML = `[${time}] <span style="color:${color}">${msg}</span><br>` + cons.innerHTML;
}

async function fetchData() {
    if (!state.apiUrl) return;
    document.getElementById('update-ts').textContent = '동기화 중...';
    try {
        const res = await fetch(state.apiUrl);
        state.data = await res.json();
        if (state.data.thresholds) state.thresholds = state.data.thresholds;
        log(`데이터 연동 성공!`);
        renderUI();
        document.getElementById('update-ts').textContent = `최종 동기화: ${new Date().toLocaleTimeString()}`;
    } catch (e) { log(`[통신 에러] ${e.message}`, 'var(--danger)'); }
}

function renderUI() {
    if (!state.data) return;
    if (state.activeTab === 'dashboard') { 
        state.drillDown.active = false; 
        renderKPIs(); 
        renderDashboardCharts(); 
        generateSmartInsights();
    }
    else if (state.activeTab === 'realtime') { renderRealtimeTable(); }
    else if (state.activeTab === 'planning') { renderLineBalancing(); }
    else if (state.activeTab === 'settings') { renderSettings(); }
}

function buildDeltaBadge(cur, prev, isReversedGood = false) {
    if (!prev || prev === 0) return '';
    const diff = cur - prev;
    const pct = (diff / prev * 100).toFixed(1);
    if(diff === 0) return `<span class="delta-badge" style="color:var(--text-dim)">- 0%</span>`;
    let isGood = isReversedGood ? diff < 0 : diff > 0;
    const cls = isGood ? 'delta-down' : 'delta-up'; 
    const arrow = diff > 0 ? '🔼' : '🔽';
    return `<span class="delta-badge ${cls}">${arrow} ${Math.abs(pct)}%</span>`;
}

function renderKPIs() {
    const filterParams = state.timeframe === 'custom' ? state.customFilter : state.filterValue;
    const { current, previous } = getAggregatedData(state.timeframe, filterParams);
    
    const container = document.getElementById('kpi-container');
    if (!current.length) {
        container.innerHTML = `<div class="kpi-card" style="grid-column: 1 / -1; text-align:center; color:var(--text-dim);">지정된 기간에 표시할 실적 데이터가 없습니다.</div>`;
        return;
    }

    const cAgg = aggregateSingleSummary(current);
    const pAgg = aggregateSingleSummary(previous);
    const targetQty = getDynamicTarget(state.timeframe);
    let achieve = cAgg.final / targetQty; 
    let pAchieve = pAgg ? (pAgg.final / targetQty) : 0; 
    const lblString = formatFilterLabel(state.timeframe === 'custom' ? `${filterParams.start}~${filterParams.end}` : state.filterValue, state.timeframe);

    container.innerHTML = `
        <div class="kpi-card">
            <div class="label">[${lblString}] 결과 품질 (PPM) ${buildDeltaBadge(cAgg.ppm, pAgg?.ppm, true)}</div>
            <div class="value" style="color:${cAgg.ppm > state.thresholds.ppm ? 'var(--danger)' : 'var(--accent)'}">${cAgg.ppm.toLocaleString()}</div>
        </div>
        <div class="kpi-card">
            <div class="label">[${lblString}] 생산 달성률 ${buildDeltaBadge(achieve, pAchieve, false)}</div>
            <div class="value" style="color:${achieve < 0.9 ? 'var(--warning)' : 'var(--success)'}">${Math.round(achieve * 100)}%</div>
        </div>
        <div class="kpi-card">
            <div class="label">[${lblString}] 생산량 누적 ${buildDeltaBadge(cAgg.final, pAgg?.final, false)}</div>
            <div class="value">${cAgg.final.toLocaleString()} <span style="font-size:12px;color:var(--text-dim)">EA</span></div>
        </div>
        <div class="kpi-card">
            <div class="label">[${lblString}] 총 불량 발생 ${buildDeltaBadge(cAgg.defect, pAgg?.defect, true)}</div>
            <div class="value">${cAgg.defect.toLocaleString()} <span style="font-size:12px;color:var(--text-dim)">건</span></div>
        </div>
    `;
}

function generateSmartInsights() {
    const panel = document.getElementById('smart-insight-panel');
    const txt = document.getElementById('insight-text');
    const filterParams = state.timeframe === 'custom' ? state.customFilter : state.filterValue;
    const { current, previous } = getAggregatedData(state.timeframe, filterParams);
    if(!current.length || !previous.length) { panel.style.display = 'none'; return; }

    const cAgg = aggregateSingleSummary(current);
    const pAgg = aggregateSingleSummary(previous);
    let insights = [];
    
    if (cAgg.ppm > state.thresholds.ppm) 
        insights.push(`🚨 누적 품질 수준(${cAgg.ppm} PPM)이 통제 한계치(${state.thresholds.ppm})를 초과했습니다. 긴급 원인 분석이 필요합니다.`);

    const defTypes = [ { k: 'sq', label: '찌그러짐' }, { k: 'sc', label: '스크레치' }, { k: 'co', label: '오염' }, { k: 'sp', label: '스프링' }, { k: 'ti', label: '기울어짐' }];
    let maxSpike = { label: '', pct: 0 };
    defTypes.forEach(d => {
        if(pAgg[d.k] > 0) {
            const pct = (cAgg[d.k] - pAgg[d.k]) / pAgg[d.k];
            if(pct > 0.2 && pct > maxSpike.pct) { maxSpike = { label: d.label, pct }; }
        }
    });
    if(maxSpike.pct > 0) insights.push(`⚠️ 이전 기간 대비 <strong>'${maxSpike.label}'</strong> 불량이 <strong>${(maxSpike.pct*100).toFixed(0)}% 급증</strong>했습니다. 관련 공정 점검을 권장합니다.`);
    if(cAgg.seong > 0 && cAgg.jorip > 0 && (cAgg.seong / cAgg.jorip) > 1.2) insights.push(`ℹ️ 성형량 대비 조립량이 부족해 재공품(WIP) 적체 우려가 있습니다.`);

    if(insights.length > 0) {
        txt.innerHTML = insights.join('<br><div style="height:6px;"></div>');
        panel.style.display = 'flex';
    } else {
        txt.innerHTML = `✅ 현재 주요 품질 및 생산 지표가 매우 안정적입니다. 이전 기간 대비 특이사항이 감지되지 않았습니다.`;
        panel.style.display = 'flex';
    }
}

function renderDashboardCharts() {
    const filterParams = state.timeframe === 'custom' ? state.customFilter : state.filterValue;
    const { current } = getAggregatedData(state.timeframe, filterParams);
    let chartData = [...current].sort((a,b)=>a.date && b.date ? a.date.localeCompare(b.date) : 0);
    
    const cleanCanvas = (id) => {
        const ctx = document.getElementById(id)?.getContext('2d');
        if (ctx) { ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.font = "14px Outfit"; ctx.fillStyle = "#94a3b8"; ctx.textAlign = "center"; ctx.fillText("데이터 없음", ctx.canvas.width/2, ctx.canvas.height/2); }
    };
    const chartIds = ['mainChart', 'defectChart', 'processChart', 'capChart', 'machineChart', 'planChart'];
    if (!chartData.length) { chartIds.forEach(cleanCanvas); return; }

    const labels = chartData.map(d => d.date ? d.date.slice(5) : ''); 
    const cAgg = aggregateSingleSummary(chartData);
    chartIds.forEach(id => { if (state.charts[id]) state.charts[id].destroy(); });

    const txtColor = state.theme === 'light' ? '#64748b' : '#94a3b8';
    const gridColor = state.theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
    const cOpts = { responsive: true, maintainAspectRatio: false, color: txtColor, plugins: { legend: { labels: { color: txtColor } } }, scales: { x: { ticks: { color: txtColor}, grid: { color: gridColor} }, y: { ticks: { color: txtColor, font: {family: 'IBM Plex Mono'} }, grid: { color: gridColor} } }, interaction: { mode: 'index', intersect: false } };

    if (state.activeDashTab === 'summary') {
        state.charts.mainChart = new Chart(document.getElementById('mainChart').getContext('2d'), {
            data: {
                labels: labels,
                datasets: [
                    { type: 'line', label: 'PPM (우측)', data: chartData.map(d => d.ppm), borderColor: '#f87171', backgroundColor: 'rgba(248,113,113,0.5)', yAxisID: 'y1', tension: 0.4, borderWidth: 3 },
                    { type: 'bar', label: '최종생산량', data: chartData.map(d => d.final), backgroundColor: '#38bdf8', borderRadius: 4 }
                ]
            },
            options: { ...cOpts, scales: { ...cOpts.scales, y1: { position: 'right', ticks: { color: '#f87171' }, grid: { display: false } } } }
        });
        const defects = [ { k: '찌그러짐', v: cAgg.sq }, { k: '스크레치', v: cAgg.sc }, { k: '오염', v: cAgg.co }, { k: '스프링', v: cAgg.sp }, { k: '기울어짐', v: cAgg.ti }, { k: '기타', v: cAgg.et }].sort((a,b) => b.v - a.v);
        let totalD = defects.reduce((sum, d) => sum + d.v, 0); let cum = 0;
        const cumPercents = defects.map(d => { cum += d.v; return totalD ? (cum/totalD*100).toFixed(1) : 0; });
        state.charts.defectChart = new Chart(document.getElementById('defectChart').getContext('2d'), {
            data: {
                labels: defects.map(d=>d.k),
                datasets: [ { type: 'line', label: '누적 점유율(%)', data: cumPercents, borderColor: '#34d399', yAxisID: 'y1', tension: 0 }, { type: 'bar', label: '총 발생 건수', data: defects.map(d=>d.v), backgroundColor: 'rgba(129, 140, 248, 0.8)', borderRadius: 4 } ]
            },
            options: { ...cOpts, scales: { ...cOpts.scales, y1: { position: 'right', max: 100, min: 0, grid: { display: false } } } }
        });
    }

    if (state.activeDashTab === 'quality') {
        state.charts.processChart = new Chart(document.getElementById('processChart').getContext('2d'), {
            type: 'line',
            data: { labels: labels, datasets: [ { label: '성형 추이', data: chartData.map(d => d.seong), borderColor: '#3b82f6', tension:0.4 }, { label: '조립 추이', data: chartData.map(d => d.jorip), borderColor: '#10b981', tension:0.4 }, { label: '포장/검사 추이', data: chartData.map(d => (d.reel||0)+(d.final||0)), borderColor: '#f43f5e', tension:0.4 } ] },
            options: { ...cOpts }
        });
    }

    if (state.activeDashTab === 'machine') {
        const cAggList = [
            { m: 'S5', v: cAgg.s5||0, type: 'molding' }, { m: 'S6', v: cAgg.s6||0, type: 'molding' }, { m: 'S7', v: cAgg.s7||0, type: 'molding' }, { m: 'S8', v: cAgg.s8||0, type: 'molding' }, { m: 'S9', v: cAgg.s9||0, type: 'molding' },
            { m: 'J1', v: cAgg.j1||0, type: 'assembly' }, { m: 'J2', v: cAgg.j2||0, type: 'assembly' }, { m: 'J3', v: cAgg.j3||0, type: 'assembly' }, { m: 'J5', v: cAgg.j5||0, type: 'assembly' }, { m: 'J6', v: cAgg.j6||0, type: 'assembly' }, { m: 'J7', v: cAgg.j7||0, type: 'assembly' }, { m: 'J8', v: cAgg.j8||0, type: 'assembly' }, { m: 'J9', v: cAgg.j9||0, type: 'assembly' }, { m: 'J10', v: cAgg.j10||0, type: 'assembly' }, { m: 'J11', v: cAgg.j11||0, type: 'assembly' }, { m: 'J12', v: cAgg.j12||0, type: 'assembly' },
            { m: 'R1', v: cAgg.r1||0, type: 'packaging' }, { m: 'R2', v: cAgg.r2||0, type: 'packaging' }, { m: 'R3', v: cAgg.r3||0, type: 'packaging' }, { m: 'R4', v: cAgg.r4||0, type: 'packaging' }
        ];
        let mLabels = [], mData = [], mColors = [], tooltipLabel = '';
        if (!state.drillDown.active) {
            mLabels = ['성형 공정', '조립 공정', '포장 공정'];
            mData = [ cAggList.filter(o=>o.type==='molding').reduce((s,o)=>s+o.v,0), cAggList.filter(o=>o.type==='assembly').reduce((s,o)=>s+o.v,0), cAggList.filter(o=>o.type==='packaging').reduce((s,o)=>s+o.v,0) ];
            mColors = ['#3b82f6', '#10b981', '#8b5cf6']; tooltipLabel = '클릭하여 장비 상세 보기';
        } else {
            const f = cAggList.filter(o=>o.type === state.drillDown.process);
            mLabels = f.map(o=>o.m); mData = f.map(o=>o.v);
            mColors = Array(mLabels.length).fill({ 'molding':'#3b82f6', 'assembly':'#10b981', 'packaging':'#8b5cf6' }[state.drillDown.process]);
            tooltipLabel = '개별 실적';
        }

        const ctxMachine = document.getElementById('machineChart');
        if(state.drillDown.active && !document.getElementById('machine-back-btn')) {
            const btn = document.createElement('div'); btn.id = 'machine-back-btn'; btn.className = 'chart-back-btn'; btn.innerHTML = '⬅ 공정 종합으로 돌아가기'; btn.onclick = () => { state.drillDown.active = false; renderDashboardCharts(); }; ctxMachine.parentNode.insertBefore(btn, ctxMachine);
        } else if (!state.drillDown.active && document.getElementById('machine-back-btn')) { document.getElementById('machine-back-btn').remove(); }

        state.charts.machineChart = new Chart(ctxMachine.getContext('2d'), {
            type: 'bar', data: { labels: mLabels, datasets: [{ label: tooltipLabel, data: mData, backgroundColor: mColors, borderRadius: 6 }] },
            options: { ...cOpts, onHover: (e, el) => { e.native.target.style.cursor = el[0] && !state.drillDown.active ? 'pointer' : 'default'; }, onClick: (e, el) => { if(!state.drillDown.active && el.length > 0) { state.drillDown.active = true; state.drillDown.process = ['molding', 'assembly', 'packaging'][el[0].index]; renderDashboardCharts(); } } }
        });
    }
}

// Phase 4: Match new clear names
function renderRealtimeTable() {
    const filterParams = state.timeframe === 'custom' ? state.customFilter : state.filterValue;
    const { current } = getAggregatedData(state.timeframe, filterParams);
    
    const head = document.getElementById('data-head');
    const body = document.getElementById('data-body');
    const sorted = [...current].sort((a,b) => state.sort.order === 'asc' ? String(a[state.sort.key]).localeCompare(String(b[state.sort.key])) : String(b[state.sort.key]).localeCompare(String(a[state.sort.key])));

    let config = { headers: [], keys: [] };
    if (state.activeSubTab === 'total') { config = { headers: ['날짜', '성형', '조립', '포장(릴)', '최종검사', '최종합격생산', '불량', 'PPM', '비고'], keys: ['date', 'seong', 'jorip', 'reel', 'f1', 'final', 'defect', 'ppm', 'remark'] }; } 
    else if (state.activeSubTab === 'machine') { config = { headers: ['날짜', '성형5','성형6','성형7','성형8','성형9', '조립1','조립2','조립3','조립5','조립6','조립7','조립8','조립9','조립10','조립11','조립12', '포장1','포장2','포장3','포장4', '최검1','최검2','최검3'], keys: ['date', 's5','s6','s7','s8','s9','j1','j2','j3','j5','j6','j7','j8','j9','j10','j11','j12','r1','r2','r3','r4','f1','f2','f3'] }; } 
    else if (state.activeSubTab === 'defect') { config = { headers: ['날짜', '찌그러짐', '스크레치', '오염', '스프링', '기울어짐', '기타'], keys: ['date', 'sq', 'sc', 'co', 'sp', 'ti', 'et'] }; } 
    else if (state.activeSubTab === 'cap') { config = { headers: ['날짜', '평균', 'Min', 'Max', 'C1','C2','C3','C4','C5','C6','C7','C8','C9','C10'], keys: ['date', 'capAvg', 'capMin', 'capMax', 'c1','c2','c3','c4','c5','c6','c7','c8','c9','c10'] }; }

    head.innerHTML = `<tr>${config.headers.map(h => `<th onclick="handleSort('${config.keys[config.headers.indexOf(h)]}')">${h}</th>`).join('')}</tr>`;
    body.innerHTML = sorted.length ? sorted.map(row => `<tr>${config.keys.map(k => {
        let val = row[k]; let style = '';
        if (k === 'ppm' && val > state.thresholds.ppm) style = 'color:var(--danger); font-weight:bold;';
        if (typeof val === 'number' && k !== 'date' && k !== 'ppm') val = val.toLocaleString();
        return `<td style="${style}">${val || '-'}</td>`;
    }).join('')}</tr>`).join('') : `<tr><td colspan="${config.headers.length}" style="text-align:center;">데이터가 없습니다.</td></tr>`;
}
function handleSort(key) {
    if (state.sort.key === key) state.sort.order = state.sort.order === 'asc' ? 'desc' : 'asc';
    else { state.sort.key = key; state.sort.order = 'asc'; }
    renderRealtimeTable();
}

// Phase 4: Line Balancing Simulator
function renderLineBalancing() {
    if(!state.data || !state.data.lineBalance) return;
    const lb = state.data.lineBalance;
    if(lb.error) {
        document.getElementById('plan-simulator-table').innerHTML = `<tr><td colspan="6" style="padding:40px; color:var(--danger); text-align:center;">${lb.msg} (구글 시트 탭 이름을 확인해주세요)</td></tr>`;
        document.getElementById('pb-target-qty').innerText = "오류";
        document.getElementById('pb-actual-qty').innerText = "오류";
        document.getElementById('pb-achieve-rate').innerText = "오류";
        return;
    }

    document.getElementById('pb-target-qty').innerText = Number(lb.targetQty||0).toLocaleString();
    document.getElementById('pb-actual-qty').innerText = Number(lb.actualQty||0).toLocaleString();
    const rate = Math.round(Number(lb.achieveRate||0) * 100);
    document.getElementById('pb-achieve-rate').innerText = `${rate}%`;

    const tbody = document.getElementById('plan-body');
    if(!state.simulators.length) state.simulators = lb.basics; // Load initial defaults from sheet
    
    tbody.innerHTML = '';
    state.simulators.forEach((row, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:600;">${row.process}</td>
            <td><input type="number" class="editable-input sim-input" data-idx="${i}" data-key="timeCapa" value="${row.timeCapa}" style="width:100px;"></td>
            <td><input type="number" class="editable-input sim-input" data-idx="${i}" data-key="runTime" value="${row.runTime}" style="width:80px;"></td>
            <td><input type="number" class="editable-input sim-input" data-idx="${i}" data-key="machines" value="${row.machines}" style="width:80px;"></td>
            <td><input type="number" class="editable-input sim-input" data-idx="${i}" data-key="days" value="${row.days}" style="width:80px;"></td>
            <td><input type="number" class="editable-input sim-input" data-idx="${i}" data-key="personnel" value="${row.personnel}" style="width:80px;"></td>
        `;
        tbody.appendChild(tr);
    });

    document.querySelectorAll('.sim-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = e.target.getAttribute('data-idx');
            const key = e.target.getAttribute('data-key');
            state.simulators[idx][key] = Number(e.target.value);
            drawBottleneckSim();
        });
    });

    drawBottleneckSim();
}

function drawBottleneckSim() {
    const target = Number(state.data?.lineBalance?.targetQty || 6000000);
    const container = document.getElementById('bottleneck-container');
    container.innerHTML = '';
    
    // Simulate total Capa based on input
    state.simulators.forEach(sim => {
        const estMonthlyCapa = sim.timeCapa * sim.runTime * sim.machines * sim.days;
        const pct = target > 0 ? (estMonthlyCapa / target) * 100 : 0;
        const isBottleneck = estMonthlyCapa < target;
        
        let barW = pct > 120 ? 120 : pct; // cap visual at 120%
        const cls = isBottleneck ? 'danger' : '';
        const txtColor = isBottleneck ? 'var(--danger)' : 'var(--success)';

        container.innerHTML += `
            <div style="display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:600;">
                    <span>${sim.process} 공정 예상 Capa 
                        <span style="color:${txtColor}; font-size:11px; margin-left:8px;">
                            ${isBottleneck ? '⚠️ 수량 부족 (병목 예상)' : '✅ 목표 달성 충분'}
                        </span>
                    </span>
                    <span style="font-family:var(--mono);">${estMonthlyCapa.toLocaleString()} / ${target.toLocaleString()} EA</span>
                </div>
                <div class="bottleneck-bar-wrap">
                    <div class="bottleneck-bar ${cls}" style="width:${barW}%;"></div>
                    <div class="bottleneck-target-line" style="left:${target>0 ? Math.min(100, 100) : 100}%"></div>
                </div>
            </div>
        `;
    });
}

function renderSettings() { 
    document.getElementById('api-url-input').value = state.apiUrl; 
    document.getElementById('th-ppm').value = state.thresholds.ppm;
    document.getElementById('th-target').value = state.thresholds.monthlyTarget;
    document.getElementById('th-defect').value = state.thresholds.defectLimit;
    document.getElementById('th-cap').value = state.thresholds.capMin;
}

async function saveConfig() { 
    const p = {
        ppm: document.getElementById('th-ppm').value,
        monthlyTarget: document.getElementById('th-target').value,
        defectLimit: document.getElementById('th-defect').value,
        capMin: document.getElementById('th-cap').value
    };
    const url = document.getElementById('api-url-input').value;
    if(url) { localStorage.setItem('samjin_qms_api_url', url); state.apiUrl = url; }
    try {
        await fetch(state.apiUrl, { method:'POST', body: JSON.stringify({type:'SAVE_CONFIG', payload: p}) });
        state.thresholds = p; log('시스템 파라미터가 저장되었습니다.');
    } catch(e) { log('저장 실패', 'var(--danger)'); }
}

async function saveLineBalance() {
    if(!state.apiUrl || !state.simulators.length) return;
    try {
        const btn = document.getElementById('btn-save-plan');
        btn.innerText = '저장 중...'; btn.disabled = true;
        await fetch(state.apiUrl, { method:'POST', body: JSON.stringify({type:'SAVE_LINE_BALANCE', payload: state.simulators}) });
        log('라인 밸런싱 모의 결과가 클라우드에 영구 적용(저장)되었습니다.');
        btn.innerText = '시뮬레이션 클라우드 저장'; btn.disabled = false;
        fetchData(); // reload fresh data
    } catch(e) { log('저장 실패', 'var(--danger)'); }
}

function switchTab(id) {
    state.activeTab = id;
    document.querySelectorAll('.nav-links li').forEach(li => li.classList.toggle('active', li.getAttribute('data-tab') === id));
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.toggle('active', tab.id === `tab-${id}`));
    renderUI();
}
