/**
 * Generic PMS Frontend Engine (Boilerplate)
 */

const state = {
    apiUrl: localStorage.getItem('generic_pms_api') || '',
    activeTab: 'dashboard',
    data: null,
    charts: {}
};

document.addEventListener('DOMContentLoaded', initApp);

function initApp() {
    // Nav logic
    document.querySelectorAll('.nav-links li').forEach(li => {
        li.addEventListener('click', () => switchTab(li.getAttribute('data-tab')));
    });

    document.getElementById('btn-refresh').addEventListener('click', fetchData);
    document.getElementById('btn-save-settings').addEventListener('click', () => {
        const url = document.getElementById('api-url-input').value;
        localStorage.setItem('generic_pms_api', url);
        state.apiUrl = url;
        log('API URL Saved!');
        fetchData();
    });

    if (state.apiUrl) {
        document.getElementById('api-url-input').value = state.apiUrl;
        fetchData();
    } else {
        switchTab('settings');
    }
}

function switchTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
    document.querySelector(`.nav-links li[data-tab="${tab}"]`).classList.add('active');
    
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    
    document.getElementById('page-title').innerText = tab.charAt(0).toUpperCase() + tab.slice(1);
    renderUI();
}

async function fetchData() {
    if (!state.apiUrl) return;
    log('Fetching data...');
    try {
        const res = await fetch(state.apiUrl);
        state.data = await res.json();
        log('Data synced successfully!');
        renderUI();
    } catch (e) {
        log('Error: ' + e.message, 'red');
    }
}

function renderUI() {
    if (!state.data) return;
    if (state.activeTab === 'dashboard') renderDashboard();
    if (state.activeTab === 'data') renderTable();
}

function renderDashboard() {
    const daily = state.data.daily || [];
    if (!daily.length) return;

    // KPI Calc
    let total = 0; let totalDefect = 0;
    daily.forEach(d => {
        total += Number(d.final || 0);
        totalDefect += Number(d.defect || 0);
    });
    const ppm = total > 0 ? Math.round(totalDefect / total * 1e6 * 10) / 10 : 0;

    document.getElementById('kpi-total').innerText = total.toLocaleString();
    document.getElementById('kpi-ppm').innerText = ppm.toLocaleString();
    document.getElementById('kpi-achieve').innerText = '95%'; // Mock

    renderCharts(daily);
}

function renderCharts(data) {
    const ctxMain = document.getElementById('mainChart').getContext('2d');
    if (state.charts.main) state.charts.main.destroy();

    const sorted = [...data].sort((a,b) => String(a.date).localeCompare(String(b.date)));

    state.charts.main = new Chart(ctxMain, {
        type: 'line',
        data: {
            labels: sorted.map(d => d.date),
            datasets: [{
                label: 'Production',
                data: sorted.map(d => d.final),
                borderColor: '#38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                fill: true
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderTable() {
    const list = state.data.daily || [];
    const head = document.getElementById('table-head');
    const body = document.getElementById('table-body');
    if (!list.length) return;

    const keys = Object.keys(list[0]);
    head.innerHTML = `<tr>${keys.map(k => `<th>${k}</th>`).join('')}</tr>`;
    body.innerHTML = list.map(row => `<tr>${keys.map(k => `<td>${row[k]}</td>`).join('')}</tr>`).join('');
}

function log(msg, color = '#10b981') {
    const con = document.getElementById('log-console');
    if (!con) return;
    con.innerHTML += `<div style="color:${color}">[${new Date().toLocaleTimeString()}] ${msg}</div>`;
    con.scrollTop = con.scrollHeight;
}
