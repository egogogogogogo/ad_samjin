/**
 * Samjin QMS Frontend Engine (v7.1 - Fixed Recursive Bug)
 */

const state = {
    apiUrl: localStorage.getItem('samjin_qms_api_url') || '',
    activeTab: 'dashboard',
    activeSubTab: 'total',
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
    // Multi-tab Navigation
    document.querySelectorAll('.nav-links li').forEach(li => {
        li.addEventListener('click', () => switchTab(li.getAttribute('data-tab')));
    });

    // Realtime Sub-tabs
    document.querySelectorAll('.sub-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.activeSubTab = tab.getAttribute('data-sub');
            renderRealtimeTable();
        });
    });

    // Refresh & Config
    document.getElementById('btn-refresh').addEventListener('click', fetchData);
    document.getElementById('btn-save-config').addEventListener('click', saveConfig);
    document.getElementById('btn-save-plan').addEventListener('click', savePlanningData);

    if (state.apiUrl) fetchData();
    else switchTab('settings');
}

// --- Data Fetching & Logging ---
function log(msg, color = 'var(--success)') {
    const cons = document.getElementById('debug-cons');
    if (!cons) return;
    const time = new Date().toLocaleTimeString();
    cons.innerHTML = `[${time}] <span style="color:${color}">${msg}</span><br>` + cons.innerHTML;
}

async function fetchData() {
    if (!state.apiUrl) {
        log('API URL 미설정. [시스템 설정]에서 입력하세요.', 'var(--warning)');
        return;
    }
    
    document.getElementById('update-ts').textContent = '동기화 중...';
    log('데이터를 불러오고 있습니다...');
    
    try {
        const res = await fetch(state.apiUrl);
        const json = await res.json();
        
        state.data = json;
        if (json.thresholds) state.thresholds = json.thresholds;
        
        log(`통신 성공! 일별(${json.daily?.length || 0}), 주별(${json.weekly?.length || 0})`);
        renderUI();
        document.getElementById('update-ts').textContent = `최종 동기화: ${new Date().toLocaleTimeString()}`;
    } catch (e) {
        log(`[통신 에러] ${e.message}`, 'var(--danger)');
        document.getElementById('update-ts').textContent = '연결 실패';
    }
}

// --- UI Rendering ---
function renderUI() {
    if (!state.data) return;
    if (state.activeTab === 'dashboard') { renderKPIs(); renderDashboardCharts(); }
    else if (state.activeTab === 'realtime') { renderRealtimeTable(); }
    else if (state.activeTab === 'planning') { renderPlanningTable(); }
    else if (state.activeTab === 'settings') { renderSettings(); }
}

function renderKPIs() {
    const daily = (state.data.daily || []).filter(d => d.date && d.final > 0);
    if (daily.length === 0) return;
    const latest = daily[daily.length - 1];

    const container = document.getElementById('kpi-container');
    container.innerHTML = `
        <div class="kpi-card">
            <div class="label">최신 품질 지표 (PPM)</div>
            <div class="value" style="color:${latest.ppm > state.thresholds.ppm ? 'var(--danger)' : 'var(--accent)'}">${latest.ppm.toLocaleString()}</div>
            <div style="font-size:11px; margin-top:8px;">기준: ${state.thresholds.ppm} / 일자: ${latest.date}</div>
        </div>
        <div class="kpi-card">
            <div class="label">연간 생산 달성률</div>
            <div class="value">${Math.round((state.data.annual.achieve || 0) * 100)}%</div>
            <div style="width:100%; height:4px; background:#222; margin-top:12px; border-radius:2px;"><div style="width:${Math.round((state.data.annual.achieve || 0) * 100)}%; background:var(--accent); height:100%;"></div></div>
        </div>
        <div class="kpi-card">
            <div class="label">금일 생산량 합계</div>
            <div class="value">${latest.final.toLocaleString()} EA</div>
            <div style="font-size:11px; margin-top:8px; color:var(--text-dim)">성형: ${latest.seong.toLocaleString()} | 조립: ${latest.jorip.toLocaleString()}</div>
        </div>
        <div class="kpi-card">
            <div class="label">Cap 탈거력 평균</div>
            <div class="value" style="color:${latest.capAvg < state.thresholds.capMin ? 'var(--danger)' : 'var(--success)'}">${latest.capAvg || '--'}</div>
            <div style="font-size:11px; margin-top:8px;">기준: ${state.thresholds.capMin}gf 이상</div>
        </div>
    `;
}

function renderRealtimeTable() {
    const daily = state.data.daily || [];
    const head = document.getElementById('data-head');
    const body = document.getElementById('data-body');
    
    const sorted = [...daily].sort((a,b) => {
        return state.sort.order === 'asc' ? String(a[state.sort.key]).localeCompare(String(b[state.sort.key])) : String(b[state.sort.key]).localeCompare(String(a[state.sort.key]));
    });

    let config = { headers: [], keys: [] };
    if (state.activeSubTab === 'total') {
        config = { 
            headers: ['날짜', '성형총합', '조립총합', '릴포장', '최종검사', '불량수', 'PPM', '비고'], 
            keys: ['date', 'seong', 'jorip', 'reel', 'final', 'defect', 'ppm', 'remark'] 
        };
    } else if (state.activeSubTab === 'machine') {
        config = { 
            headers: ['날짜', '성형5', '성형6', '성형7', '성형8', '성형9', '조립1', '조립2', '조립3', '조립5', '조립6', '조립7', '조립8', '조립9', '조립10', '조립11', '조립12'], 
            keys: ['date', 's5', 's6', 's7', 's8', 's9', 'j1', 'j2', 'j3', 'j5', 'j6', 'j7', 'j8', 'j9', 'j10', 'j11', 'j12'] 
        };
    } else if (state.activeSubTab === 'defect') {
        config = { 
            headers: ['날짜', '찌그러짐', '스크레치', '오염', '스프링', '기울어짐', '기타'], 
            keys: ['date', 'sq', 'sc', 'co', 'sp', 'ti', 'et'] 
        };
    } else if (state.activeSubTab === 'cap') {
        config = { 
            headers: ['날짜', '평균', 'Max', 'Min', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10'], 
            keys: ['date', 'capAvg', 'capMax', 'capMin', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10'] 
        };
    }

    head.innerHTML = `<tr>${config.headers.map(h => `<th onclick="handleSort('${config.keys[config.headers.indexOf(h)]}')">${h}</th>`).join('')}</tr>`;
    body.innerHTML = sorted.map(row => `
        <tr>
            ${config.keys.map(k => {
                let v = row[k];
                let style = "";
                if (k === 'ppm' && v > state.thresholds.ppm) style = "color:var(--danger); font-weight:bold;";
                if (['sq','sc','co','sp','ti','et'].includes(k) && v >= state.thresholds.defectLimit) style = "color:var(--danger);";
                if (k === 'capAvg' && v < state.thresholds.capMin && v > 0) style = "color:var(--danger);";
                return `<td style="${style}">${(typeof v === 'number' && k !== 'date') ? v.toLocaleString() : (v || '-')}</td>`;
            }).join('')}
        </tr>
    `).join('');
}

function handleSort(key) {
    if (state.sort.key === key) state.sort.order = state.sort.order === 'asc' ? 'desc' : 'asc';
    else { state.sort.key = key; state.sort.order = 'asc'; }
    renderRealtimeTable();
}

function renderPlanningTable() {
    const plans = state.data.plan || [];
    const body = document.getElementById('plan-body');
    body.innerHTML = plans.map((p, idx) => `
        <tr data-idx="${idx}">
            <td>${p.월 || ''}</td>
            <td>${p.주차 || ''}</td>
            <td>${p.공정 || ''}</td>
            <td><input type="number" class="editable-input plan-qty" value="${p.목표수량 || 0}"></td>
            <td><input type="text" class="editable-input plan-remark" style="width:200px; text-align:left;" value="${p.비고 || ''}"></td>
        </tr>
    `).join('');
}

async function savePlanningData() {
    if (!state.apiUrl) return alert('API URL 미설정');
    const rows = document.querySelectorAll('#plan-body tr');
    const payload = Array.from(rows).map(tr => [tr.cells[0].textContent, tr.cells[1].textContent, tr.cells[2].textContent, Number(tr.querySelector('.plan-qty').value), tr.querySelector('.plan-remark').value]);

    log('생산계획 저장 중...');
    try {
        await fetch(state.apiUrl, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ type: 'SAVE_PLAN', payload }) });
        alert('저장 요청 완료! 구글 시트에서 확인하세요.');
        fetchData();
    } catch (e) { log(`저장 실패: ${e.message}`, 'var(--danger)'); }
}

function renderSettings() {
    document.getElementById('api-url-input').value = state.apiUrl;
    document.getElementById('th-ppm').value = state.thresholds.ppm;
    document.getElementById('th-target').value = state.thresholds.monthlyTarget;
    document.getElementById('th-defect').value = state.thresholds.defectLimit;
    document.getElementById('th-cap').value = state.thresholds.capMin;
}

async function saveConfig() {
    const payload = {
        ppm: document.getElementById('th-ppm').value,
        monthlyTarget: document.getElementById('th-target').value,
        defectLimit: document.getElementById('th-defect').value,
        capMin: document.getElementById('th-cap').value
    };
    const url = document.getElementById('api-url-input').value.trim();
    localStorage.setItem('samjin_qms_api_url', url);
    state.apiUrl = url;

    log('설정값 저장 시도 중...');
    try {
        await fetch(state.apiUrl, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ type: 'SAVE_CONFIG', payload }) });
        alert('설정값이 서버에 전달되었습니다. (대시보드 갱신)');
        fetchData();
    } catch (e) { alert('설정 저장 실패'); }
}

function switchTab(id) {
    state.activeTab = id;
    document.querySelectorAll('.nav-links li').forEach(li => li.classList.toggle('active', li.getAttribute('data-tab') === id));
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.toggle('active', tab.id === `tab-${id}`));
    document.getElementById('page-title').textContent = id.toUpperCase();
    renderUI();
}

function renderDashboardCharts() {
    const daily = state.data.daily || [];
    const ctx = document.getElementById('mainChart')?.getContext('2d');
    if (!ctx) return;
    if (state.charts.main) state.charts.main.destroy();
    state.charts.main = new Chart(ctx, { type: 'line', data: { labels: daily.slice(-15).map(d => d.date.slice(5)), datasets: [{ label: 'PPM', data: daily.slice(-15).map(d => d.ppm), borderColor: '#38bdf8', tension: 0.3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
}
