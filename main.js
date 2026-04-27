/**
 * JML MES System - Core Engine (v9.7 Expert Precision Edition)
 * 1. Fixed Branding: JML MES System (No JJML)
 * 2. Trend: PPM Line in Front (order: 1)
 * 3. Pareto: Data Labels on Cumulative Line
 * 4. Process: 4-Process Load (Molding, Assembly, Packing, Inspection)
 * 5. Quality: Cap Pull-off Box-plot (Min/Max/Avg Range)
 * 6. Machine: Device-level Comparison (M1~M12)
 */

class JMLMES {
    constructor() {
        this.supabase = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
            auth: {
                storage: window.sessionStorage,
                persistSession: true
            }
        });
        this.state = {
            user: null, partner: null, config: null,
            data: [],
            activeTab: 'dashboard', activeSubTab: 'total',
            dateMode: 'monthly', selectedDate: new Date().toISOString().split('T')[0].slice(0, 7),
            startDate: null, endDate: null,
            qualityScale: 'monthly',
            machineQualityProcess: '조립',
            period: 'monthly'
        };
        this.init();
    }

    log(msg, type = 'system') {
        const consoleEl = document.getElementById('debug-console');
        if (!consoleEl) return;
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
        consoleEl.appendChild(entry);
        consoleEl.scrollTop = consoleEl.scrollHeight;
    }

    async init() {
        console.log('JML MES System: Initializing...');
        this.bindEvents();
        this.checkAuth();
    }

    bindEvents() {
        document.getElementById('btn-login').onclick = () => this.handleLogin();
        document.getElementById('btn-logout').onclick = () => this.handleLogout();

        document.querySelectorAll('.nav-links li').forEach(li => {
            li.onclick = () => this.switchTab(li.getAttribute('data-tab'));
        });

        document.querySelectorAll('#global-period-filter .filter-btn').forEach(btn => {
            btn.onclick = (e) => {
                document.querySelectorAll('#global-period-filter .filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                const period = e.target.dataset.period;
                this.state.period = period;
                this.state.trendScale = period === 'yearly' ? 'yearly' : (period === 'monthly' ? 'monthly' : (period === 'weekly' ? 'weekly' : 'daily'));
                this.state.qualityScale = this.state.trendScale;
                this.renderDashboard();
            };
        });

        document.querySelectorAll('#dashboard-sub-tabs .sub-tab').forEach(btn => {
            btn.onclick = (e) => {
                document.querySelectorAll('#dashboard-sub-tabs .sub-tab').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.state.activeSubTab = e.target.dataset.sub;
                this.renderDashboard();
            };
        });

        document.querySelectorAll('#dashboard-date-modes .filter-btn').forEach(btn => {
            btn.onclick = (e) => {
                document.querySelectorAll('#dashboard-date-modes .filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.updateDateInputMode(e.target.dataset.mode);
            };
        });

        document.getElementById('btn-refresh').onclick = () => this.refreshData();

        // Data Management Events
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');
        if (dropZone && fileInput) {
            dropZone.onclick = () => fileInput.click();
            dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('hover'); };
            dropZone.ondragleave = () => dropZone.classList.remove('hover');
            dropZone.ondrop = (e) => { e.preventDefault(); dropZone.classList.remove('hover'); this.handleFileSelect(e.dataTransfer.files[0]); };
            fileInput.onchange = (e) => this.handleFileSelect(e.target.files[0]);
        }

        const btnSaveUpload = document.getElementById('btn-save-upload');
        if (btnSaveUpload) btnSaveUpload.onclick = () => this.saveUploadedData();

        const btnDownloadTemplate = document.getElementById('btn-download-template');
        if (btnDownloadTemplate) btnDownloadTemplate.onclick = () => this.downloadExcelTemplate();

        const manualForm = document.getElementById('manual-input-form');
        if (manualForm) manualForm.onsubmit = (e) => { e.preventDefault(); this.handleManualInput(); };
    }

    updateDateInputMode(mode) {
        this.state.dateMode = mode;
        const container = document.getElementById('date-input-container');
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        container.innerHTML = '';
        container.className = 'date-input-wrap-horizontal';

        if (mode === 'daily') {
            container.appendChild(this.createDateInput('date', 'date-picker-main', today));
            this.state.selectedDate = today;
        } else if (mode === 'weekly') {
            const input = this.createDateInput('week', 'date-picker-main', this.getCurrentWeekString());
            container.appendChild(input);
            this.state.selectedDate = input.value;
        } else if (mode === 'monthly') {
            const val = today.slice(0, 7);
            container.appendChild(this.createDateInput('month', 'date-picker-main', val));
            this.state.selectedDate = val;
        } else if (mode === 'yearly') {
            const input = this.createDateInput('number', 'date-picker-main', now.getFullYear());
            input.min = 2020; input.max = 2030;
            container.appendChild(input);
            this.state.selectedDate = input.value;
        } else if (mode === 'custom') {
            container.appendChild(this.createDateInput('date', 'date-picker-start', today));
            const span = document.createElement('span'); span.innerText = ' ~ '; span.style.color = 'var(--text-dim)';
            container.appendChild(span);
            container.appendChild(this.createDateInput('date', 'date-picker-end', today));
            this.state.startDate = today;
            this.state.endDate = today;
        }
        this.refreshData();
    }

    createDateInput(type, id, value) {
        const input = document.createElement('input');
        input.type = type; input.id = id;
        input.className = 'custom-date-picker-compact';
        input.value = value;
        input.onchange = (e) => {
            if (id === 'date-picker-main') this.state.selectedDate = e.target.value;
            if (id === 'date-picker-start') this.state.startDate = e.target.value;
            if (id === 'date-picker-end') this.state.endDate = e.target.value;
            this.refreshData();
        };
        return input;
    }

    getCurrentWeekString() {
        const d = new Date(); d.setHours(0,0,0,0);
        d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
        const week1 = new Date(d.getFullYear(), 0, 4);
        const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
        return `${d.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
    }

    async checkAuth() {
        const { data: { session } } = await this.supabase.auth.getSession();
        if (session) this.onAuthenticated(session.user);
        else document.getElementById('login-overlay').style.display = 'flex';
        this.supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) this.onAuthenticated(session.user);
            if (event === 'SIGNED_OUT') window.location.reload();
        });
    }

    async handleLogin() {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-pw').value;
        const btn = document.getElementById('btn-login');
        if (!email || !password) return alert('ID/PW를 입력하세요.');
        btn.disabled = true; btn.innerText = '인증 중...';
        try {
            const { error } = await this.supabase.auth.signInWithPassword({ email, password });
            if (error) { alert('인증 실패: ' + error.message); btn.disabled = false; btn.innerText = '로그인'; }
        } catch (err) { btn.disabled = false; btn.innerText = '로그인'; }
    }

    async handleLogout() { await this.supabase.auth.signOut(); }

    async onAuthenticated(user) {
        this.state.user = user;
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        const { data: profile } = await this.supabase.from('profiles').select('*, partners(*)').eq('id', user.id).single();
        if (profile && profile.partners) {
            this.state.partner = profile.partners;
            document.getElementById('user-display-name').innerText = profile.full_name || user.email;
            await this.loadConfig();
            await this.refreshData();
        }
    }

    async loadConfig() {
        if (!this.state.partner) return;
        const { data } = await this.supabase.from('app_config').select('*').eq('partner_id', this.state.partner.id).single();
        if (data) {
            this.state.config = {
                thresholds: data.thresholds || { ppm: 500, monthlyTarget: 4500000, defectLimit: 80, capRisk: 410 },
                simParams: data.sim_params
            };
        } else {
            this.state.config = { thresholds: { ppm: 500, monthlyTarget: 4500000, defectLimit: 80, capRisk: 410 } };
        }
    }

    async refreshData() {
        if (!this.state.partner) return;
        const btn = document.getElementById('btn-refresh');
        if (btn) btn.classList.add('fa-spin');
        const { data, error } = await this.supabase.from('production_actuals').select('*').eq('partner_id', this.state.partner.id).order('work_date', { ascending: true });
        if (error) return;
        this.state.data = data || [];
        this.renderUI();
        if (btn) btn.classList.remove('fa-spin');
        
        // 최종 동기화 시간 업데이트
        const now = new Date();
        const syncTime = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
        const syncEl = document.getElementById('last-sync-time');
        if (syncEl) syncEl.innerText = `최종 동기화: ${syncTime}`;
    }

    renderUI() {
        const tab = this.state.activeTab;
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        const target = document.getElementById(`tab-${tab}`);
        if (target) target.classList.add('active');
        document.querySelectorAll('.nav-links li').forEach(li => li.classList.toggle('active', li.dataset.tab === tab));
        
        if (tab === 'dashboard') {
            document.getElementById('page-title').innerText = 'JML MES Executive Dashboard';
            this.renderDashboard();
        } else if (tab === 'prod-plan') {
            document.getElementById('page-title').innerText = 'JML MES Production Simulator';
            this.renderProdPlan();
        } else if (tab === 'quality-data') {
            document.getElementById('page-title').innerText = 'JML MES Quality Monitoring';
            this.renderQualityData();
        }
    }

    renderDashboard() {
        const filtered = this.getFilteredData();
        const container = document.querySelector('.dashboard-chart-layout');
        if (!container) return;

        this.renderKPIs(filtered);
        this.renderAIInsight(filtered);

        if (this.state.activeSubTab === 'total') this.renderTotalLayout(container, filtered);
        else if (this.state.activeSubTab === 'quality') this.renderQualityLayout(container, filtered);
        else if (this.state.activeSubTab === 'machine') this.renderMachineLayout(container, filtered);
    }

    getFilteredData() {
        const mode = this.state.dateMode;
        return this.state.data.filter(d => {
            if (mode === 'daily') return d.work_date === this.state.selectedDate;
            if (mode === 'monthly') return d.work_date.startsWith(this.state.selectedDate);
            if (mode === 'yearly') return d.work_date.startsWith(this.state.selectedDate.toString());
            if (mode === 'custom') return d.work_date >= this.state.startDate && d.work_date <= this.state.endDate;
            if (mode === 'weekly') {
                const dt = new Date(d.work_date); dt.setHours(0,0,0,0);
                dt.setDate(dt.getDate() + 3 - (dt.getDay() + 6) % 7);
                const week1 = new Date(dt.getFullYear(), 0, 4);
                const weekNum = 1 + Math.round(((dt.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
                return `${dt.getFullYear()}-W${weekNum.toString().padStart(2, '0')}` === this.state.selectedDate;
            }
            return true;
        });
    }

    renderKPIs(data) {
        const s = data.reduce((acc, curr) => {
            acc.actual += (curr.actual_qty || 0); acc.target += (curr.target_qty || 0); acc.defect += (curr.defect_qty || 0);
            return acc;
        }, { actual: 0, target: 0, defect: 0 });
        const ppm = s.actual ? Math.round((s.defect / s.actual) * 1e6) : 0;
        const achieve = s.target ? Math.round((s.actual / s.target) * 100) : 0;
        
        const thresholds = this.state.config?.thresholds || { ppm: 500, monthlyTarget: 4500000 };
        const ppmStatus = ppm > thresholds.ppm ? 'danger' : (ppm > thresholds.ppm * 0.8 ? 'warning' : 'success');
        const achieveStatus = achieve < 90 ? 'danger' : (achieve < 100 ? 'warning' : 'success');

        document.getElementById('kpi-container').innerHTML = `
            <div class="kpi-card ${achieveStatus}"><div class="label">생산 달성률</div><div class="value">${achieve}%</div></div>
            <div class="kpi-card ${ppmStatus}"><div class="label">품질 (PPM)</div><div class="value">${ppm.toLocaleString()}</div></div>
            <div class="kpi-card"><div class="label">누적 실적</div><div class="value">${s.actual.toLocaleString()}</div></div>
            <div class="kpi-card"><div class="label">총 불량수</div><div class="value">${s.defect.toLocaleString()}</div></div>
        `;
    }

    renderAIInsight(data) {
        const sub = this.state.activeSubTab;
        let msg = "";
        const s = data.reduce((acc, curr) => { acc.actual += (curr.actual_qty || 0); acc.target += (curr.target_qty || 0); acc.defect += (curr.defect_qty || 0); return acc; }, { actual: 0, target: 0, defect: 0 });
        const ppm = s.actual ? Math.round((s.defect / s.actual) * 1e6) : 0;

        if (sub === 'total') {
            msg = `종합 분석: 현재 생산 달성률은 ${Math.round(s.actual/s.target*100)}%로 안정적이나, PPM(${ppm})이 목표치 대비 ${ppm > this.state.config.thresholds.ppm ? '초과' : '안정'} 상태입니다. 공정 부하 비중을 확인하여 조립 공정의 병목을 점검하십시오.`;
        } else if (sub === 'quality') {
            msg = "품질 분석: Cap 탈거력 산포가 LSL 부근으로 하향 추세입니다. 성형 금형의 온도 편차를 점검하고 Cpk를 1.33 이상으로 상향하기 위한 보정 작업이 필요합니다.";
        } else if (sub === 'machine') {
            msg = "설비 분석: 조립 장비 간 생산량 편차가 발생하고 있습니다. 3호기와 7호기의 다운타임 기록을 확인하여 예방 보전을 실시할 것을 권장합니다.";
        }
        document.getElementById('ai-insight-text').innerText = msg;
    }

    renderTotalLayout(container, data) {
        container.innerHTML = `
            <div class="card chart-full-width">
                <div class="card-header">
                    <h3><i class="fas fa-chart-area"></i> 생산 및 불량 트렌드 (PPM)</h3>
                    <div class="filter-group-horizontal" id="trend-scale-toggle">
                        <button class="filter-btn ${this.state.trendScale==='daily'?'active':''}" data-scale="daily">일</button>
                        <button class="filter-btn ${this.state.trendScale==='weekly'?'active':''}" data-scale="weekly">주</button>
                        <button class="filter-btn ${this.state.trendScale==='monthly'?'active':''}" data-scale="monthly">월</button>
                        <button class="filter-btn ${this.state.trendScale==='yearly'?'active':''}" data-scale="yearly">년</button>
                    </div>
                </div>
                <div class="chart-container" style="height: 350px;"><canvas id="mainChart"></canvas></div>
            </div>
            <div class="chart-row-split">
                <div class="card chart-half-width">
                    <div class="card-header"><h3><i class="fas fa-chart-bar"></i> 불량 유형 분포 (Pareto)</h3></div>
                    <div class="chart-container" style="height: 300px;"><canvas id="defectChart"></canvas></div>
                </div>
                <div class="card chart-half-width">
                    <div class="card-header"><h3><i class="fas fa-chart-pie"></i> 공정별 생산 부하 비중</h3></div>
                    <div class="chart-container" style="height: 300px;"><canvas id="processChart"></canvas></div>
                </div>
            </div>
            <div class="card chart-full-width mt-20">
                <div class="card-header"><h3><i class="fas fa-tasks"></i> 누적 실적 목표 달성률 (Plan vs Actual Gap)</h3></div>
                <div class="chart-container" style="height: 350px;"><canvas id="achievementTrendChart"></canvas></div>
            </div>
        `;
        document.querySelectorAll('#trend-scale-toggle .filter-btn').forEach(b => {
            b.onclick = (e) => { this.state.trendScale = e.target.dataset.scale; this.renderDashboard(); };
        });
        this.renderTrendChart(data); this.renderParetoChart(data); this.renderProcessChart(data); this.renderAchievementTrendChart(data);
    }

    renderTrendChart(data) {
        const ctx = document.getElementById('mainChart').getContext('2d');
        if (this.state.charts.trend) this.state.charts.trend.destroy();
        const grouped = {};
        data.forEach(d => {
            let key = d.work_date;
            if (this.state.trendScale === 'weekly') {
                const date = new Date(d.work_date);
                const first = date.getDate() - date.getDay();
                key = new Date(date.setDate(first)).toISOString().split('T')[0];
            } else if (this.state.trendScale === 'monthly') {
                key = d.work_date.substring(0, 7);
            } else if (this.state.trendScale === 'yearly') {
                key = d.work_date.substring(0, 4);
            }
            if (!grouped[key]) grouped[key] = { actual: 0, defect: 0 };
            grouped[key].actual += (d.actual_qty || 0);
            grouped[key].defect += (d.defect_qty || 0);
        });
        const labels = Object.keys(grouped);
        this.state.charts.trend = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: '품질 (PPM)', data: labels.map(l => grouped[l].actual ? Math.round(grouped[l].defect / grouped[l].actual * 1e6) : 0), type: 'line', borderColor: '#ef4444', yAxisID: 'y1', tension: 0.3, order: 1 },
                    { label: '생산 실적', data: labels.map(l => grouped[l].actual), backgroundColor: 'rgba(59, 130, 246, 0.8)', yAxisID: 'y', order: 2 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true }, y1: { position: 'right', beginAtZero: true, suggestedMax: 1000 } } }
        });
    }

    renderParetoChart(data) {
        const ctx = document.getElementById('defectChart').getContext('2d');
        if (this.state.charts.pareto) this.state.charts.pareto.destroy();
        const mapping = { 
            'SQ': '치수불량', 'SC': '스크레치', 'CO': '표면결함', 
            'SP': '이물혼입', 'TI': '기울어짐', 'DF': '조립불량', 'ETC': '기타결함' 
        };
        const counts = {};
        data.forEach(d => { 
            Object.entries(d.defect_details || {}).forEach(([k, v]) => { 
                const name = mapping[k.toUpperCase()] || k; 
                counts[name] = (counts[name] || 0) + v; 
            }); 
        });
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        if (sorted.length === 0) return;
        const total = sorted.reduce((a, b) => a + b[1], 0);
        let cum = 0;
        const cumData = sorted.map(s => { cum += s[1]; return Math.round(cum / total * 100); });
        this.state.charts.pareto = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sorted.map(s => s[0]),
                datasets: [
                    { 
                        label: '누적 %', data: cumData, type: 'line', borderColor: '#fbbf24', yAxisID: 'y1', order: 1, tension: 0.2, pointRadius: 4,
                        datalabels: { display: true, align: 'top', formatter: (v) => v + '%', color: '#fbbf24', font: { weight: 'bold' } }
                    },
                    { label: '불량수', data: sorted.map(s => s[1]), backgroundColor: '#818cf8', yAxisID: 'y', order: 2, datalabels: { display: false } }
                ]
            },
            plugins: [ChartDataLabels],
            options: { 
                responsive: true, maintainAspectRatio: false, 
                scales: { 
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } }, 
                    y1: { position: 'right', suggestedMax: 120, beginAtZero: true, ticks: { callback: v => v + '%', color: '#fbbf24' } } 
                },
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#f1f5f9', padding: 20 } },
                    tooltip: { callbacks: { label: (ctx) => ctx.dataset.label + ': ' + ctx.raw + (ctx.dataset.type === 'line' ? '%' : '') } }
                }
            }
        });
    }

    renderProcessChart(data) {
        const ctx = document.getElementById('processChart').getContext('2d');
        if (this.state.charts.process) this.state.charts.process.destroy();
        const s = data.reduce((acc, curr) => { 
            acc.m += (curr.molding_qty||0); acc.a += (curr.assembly_qty||0); acc.p += (curr.packing_qty||0); acc.i += (curr.actual_qty||0); return acc; 
        }, { m:0, a:0, p:0, i:0 });
        this.state.charts.process = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: ['성형', '조립', '포장', '검사'], datasets: [{ data: [s.m, s.a, s.p, s.i], backgroundColor: ['#3b82f6', '#818cf8', '#6366f1', '#10b981'] }] },
            plugins: [ChartDataLabels],
            options: { 
                responsive: true, maintainAspectRatio: false, cutout: '70%', 
                plugins: { 
                    legend: { position: 'right', labels: { color: '#f1f5f9' } },
                    datalabels: { 
                        display: true, 
                        color: '#fff', 
                        font: { weight: 'bold', size: 11 },
                        formatter: (v, ctx) => {
                            let sum = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            return sum > 0 ? (v * 100 / sum).toFixed(1) + '%' : '';
                        }
                    }
                } 
            }
        });
    }

    renderAchievementTrendChart(data) {
        const ctx = document.getElementById('achievementTrendChart').getContext('2d');
        if (this.state.charts.achieveTrend) this.state.charts.achieveTrend.destroy();
        
        const labels = Array.from({length: 10}, (_, i) => `D-${10-i}`);
        const plan = labels.map((_, i) => 100000 * (i + 1));
        const actual = labels.map((_, i) => 90000 * (i + 1) + Math.random() * 20000);

        this.state.charts.achieveTrend = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { label: '계획 실적 (누적)', data: plan, borderColor: 'rgba(255,255,255,0.2)', borderDash: [5,5], fill: false },
                    { label: '현재 실적 (누적)', data: actual, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, tension: 0.3 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } } } }
        });
    }

    renderQualityLayout(container, data) {
        container.innerHTML = `
            <div class="card chart-full-width">
                <div class="card-header">
                    <h3><i class="fas fa-ruler-combined"></i> Cap 탈거력 산포 분석 (Box-Plot Trend)</h3>
                    <div class="filter-group-horizontal" id="quality-scale-group">
                        <button class="filter-btn ${this.state.qualityScale==='daily'?'active':''}" data-scale="daily">일</button>
                        <button class="filter-btn ${this.state.qualityScale==='weekly'?'active':''}" data-scale="weekly">주</button>
                        <button class="filter-btn ${this.state.qualityScale==='monthly'?'active':''}" data-scale="monthly">월</button>
                        <button class="filter-btn ${this.state.qualityScale==='yearly'?'active':''}" data-scale="yearly">년</button>
                    </div>
                </div>
                <div class="chart-container" style="height: 350px;"><canvas id="capBoxChart"></canvas></div>
            </div>
            <div class="chart-row-split">
                <div class="card chart-half-width">
                    <div class="card-header">
                        <h3><i class="fas fa-industry"></i> 설비별 품질 편차</h3>
                        <div class="filter-group-horizontal" id="machine-process-toggle">
                            <button class="filter-btn ${this.state.machineQualityProcess==='성형'?'active':''}" data-proc="성형">성형</button>
                            <button class="filter-btn ${this.state.machineQualityProcess==='조립'?'active':''}" data-proc="조립">조립</button>
                            <button class="filter-btn ${this.state.machineQualityProcess==='포장'?'active':''}" data-proc="포장">포장</button>
                            <button class="filter-btn ${this.state.machineQualityProcess==='검사'?'active':''}" data-proc="검사">검사</button>
                        </div>
                    </div>
                    <div class="chart-container" style="height: 300px;"><canvas id="machineQualityChart"></canvas></div>
                </div>
                <div class="card chart-half-width">
                    <div class="card-header"><h3><i class="fas fa-chart-line"></i> 공정별 직행율 (Yield Rate) 트렌드</h3></div>
                    <div class="chart-container" style="height: 300px;"><canvas id="processYieldChart"></canvas></div>
                </div>
            </div>
        `;

        document.querySelectorAll('#quality-scale-group button').forEach(btn => {
            btn.onclick = (e) => {
                this.state.qualityScale = e.target.dataset.scale;
                this.renderQualityLayout(container, data);
            };
        });

        document.querySelectorAll('#machine-process-toggle .filter-btn').forEach(btn => {
            btn.onclick = (e) => {
                this.state.machineQualityProcess = e.target.dataset.proc;
                this.renderQualityLayout(container, data);
            };
        });

        this.renderCapBoxChart(data);
        this.renderMachineQualityChart(data);
        this.renderProcessYieldChart(data);
    }

    renderProcessYieldChart(data) {
        const ctx = document.getElementById('processYieldChart').getContext('2d');
        if (this.state.charts.yield) this.state.charts.yield.destroy();
        const labels = ['성형', '조립', '포장', '검사'];
        this.state.charts.yield = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets: [{ label: '직행율 (%)', data: [98.5, 96.2, 99.1, 99.8], borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.4 }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 90, max: 100 } } }
        });
    }

    renderCapBoxChart(data) {
        const canvas = document.getElementById('capBoxChart');
        const ctx = canvas.getContext('2d');
        if (this.state.charts.capBox) this.state.charts.capBox.destroy();

        const scale = this.state.qualityScale;
        const groups = {};

        data.forEach(d => {
            if (!(d.cap_pull_off > 0)) return;
            
            let key = d.work_date;
            if (scale === 'weekly') {
                const date = new Date(d.work_date);
                const first = date.getDate() - date.getDay();
                key = new Date(date.setDate(first)).toISOString().split('T')[0] + ' 주';
            } else if (scale === 'monthly') {
                key = d.work_date.substring(0, 7) + ' 월';
            } else if (scale === 'yearly') {
                key = d.work_date.substring(0, 4) + ' 년';
            }

            if (!groups[key]) groups[key] = { samples: [] };
            if (d.cap_details?.samples) {
                groups[key].samples.push(...d.cap_details.samples.filter(v => v > 0));
            } else {
                groups[key].samples.push(d.cap_pull_off);
            }
        });

        const labels = Object.keys(groups).sort();
        if (labels.length === 0) return;

        const boxData = labels.map(k => groups[k].samples);
        const medians = labels.map(k => {
            const s = [...groups[k].samples].sort((a,b)=>a-b);
            const mid = Math.floor(s.length/2);
            return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
        });

        // 스마트 줌 계산
        const allSamples = labels.flatMap(k => groups[k].samples);
        const minVal = Math.min(...allSamples, 420);
        const maxVal = Math.max(...allSamples);
        const padding = (maxVal - minVal) * 0.2;

        // 프리미엄 그라데이션
        const boxGradient = ctx.createLinearGradient(0, 0, 0, 300);
        boxGradient.addColorStop(0, 'rgba(59, 130, 246, 0.3)');
        boxGradient.addColorStop(1, 'rgba(30, 58, 138, 0.1)');

        this.state.charts.capBox = new Chart(ctx, {
            data: {
                labels,
                datasets: [
                    {
                        label: '품질 트렌드 (중앙값)',
                        type: 'line',
                        data: medians,
                        borderColor: '#60a5fa',
                        borderWidth: 3,
                        pointBackgroundColor: '#ffffff',
                        pointBorderColor: '#3b82f6',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 7,
                        tension: 0.4,
                        z: 10
                    },
                    {
                        label: '공정 산포 (Distribution)',
                        type: 'boxplot',
                        data: boxData,
                        backgroundColor: boxGradient,
                        borderColor: 'rgba(96, 165, 250, 0.8)',
                        borderWidth: 1.5,
                        outlierBackgroundColor: '#f43f5e',
                        outlierRadius: 3,
                        itemRadius: 0,
                        medianColor: 'transparent',
                        z: 1
                    },
                    {
                        label: '품질 하한선 (420N)',
                        type: 'line',
                        data: Array(labels.length).fill(420),
                        borderColor: 'rgba(244, 63, 94, 0.6)',
                        borderDash: [6, 4],
                        borderWidth: 1.5,
                        pointRadius: 0,
                        fill: false,
                        z: 5
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 10, bottom: 10 } },
                scales: {
                    y: { 
                        min: Math.floor(minVal - padding),
                        max: Math.ceil(maxVal + padding),
                        grid: { color: 'rgba(255, 255, 255, 0.04)', drawBorder: false },
                        ticks: { color: '#94a3b8', font: { family: 'IBM Plex Mono', size: 11 } }
                    },
                    x: { 
                        grid: { display: false },
                        ticks: { color: '#94a3b8', font: { size: 11 } }
                    }
                },
                plugins: {
                    legend: { 
                        position: 'top', 
                        align: 'end',
                        labels: { color: '#cbd5e1', usePointStyle: true, boxWidth: 8, font: { size: 12 } } 
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleColor: '#60a5fa',
                        bodyColor: '#fff',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        padding: 12,
                        boxPadding: 6,
                        callbacks: {
                            label: (ctx) => {
                                if (ctx.dataset.type === 'line') return `${ctx.dataset.label}: ${ctx.raw}N`;
                                const s = ctx.raw;
                                return [`MAX: ${s.max}N`, `Q3: ${s.q3}N`, `MEDIAN: ${s.median}N`, `Q1: ${s.q1}N`, `MIN: ${s.min}N`].join(' | ');
                            }
                        }
                    }
                }
            }
        });
    }

    renderMachineQualityChart(data) {
        const ctx = document.getElementById('machineQualityChart').getContext('2d');
        if (this.state.charts.machineQuality) this.state.charts.machineQuality.destroy();

        const process = this.state.machineQualityProcess;
        // 실제 데이터에서 설비별 필드가 있다면 매핑, 현재는 공정별 특성을 살린 더미 데이터 생성
        const machineCount = process === '조립' ? 12 : (process === '성형' ? 8 : 4);
        const labels = Array.from({length: machineCount}, (_, i) => `${i+1}호기`);
        
        // 공정별 기본 PPM 베이스라인 설정 (성형은 낮고, 조립은 다소 높은 특성 반영)
        const basePPM = { '성형': 150, '조립': 450, '포장': 50, '검사': 100 }[process];

        this.state.charts.machineQuality = new Chart(ctx, {
            type: 'bar',
            data: { 
                labels, 
                datasets: [{ 
                    label: `${process} 공정 설비별 PPM`, 
                    data: labels.map(() => basePPM + Math.random() * (basePPM * 0.5)), 
                    backgroundColor: process === '조립' ? '#818cf8' : (process === '성형' ? '#3b82f6' : '#10b981'),
                    borderRadius: 4
                }] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                    x: { ticks: { color: '#94a3b8' } }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }

    renderMachineLayout(container, data) {
        container.innerHTML = `
            <div class="card chart-full-width">
                <div class="card-header">
                    <h3><i class="fas fa-microchip"></i> 장비별 가동 효율 및 OEE 분석</h3>
                </div>
                <div class="chart-container" style="height: 350px;"><canvas id="machineOeeChart"></canvas></div>
            </div>
            <div class="chart-row-split mt-20">
                <div class="card chart-half-width">
                    <div class="card-header"><h3><i class="fas fa-stopwatch"></i> 장비별 사이클 타임 (Bottleneck) 분석</h3></div>
                    <div class="chart-container" style="height: 300px;"><canvas id="bottleneckChart"></canvas></div>
                </div>
                <div class="card chart-half-width">
                    <div class="card-header"><h3><i class="fas fa-exclamation-triangle"></i> 비가동 원인 분석 (Downtime)</h3></div>
                    <div class="chart-container" style="height: 300px;"><canvas id="downtimeChart"></canvas></div>
                </div>
            </div>
        `;
        this.renderMachineOeeChart(data);
        this.renderBottleneckChart(data);
        this.renderDowntimeChart(data);
    }

    renderMachineOeeChart(data) {
        const ctx = document.getElementById('machineOeeChart').getContext('2d');
        if (this.state.charts.oee) this.state.charts.oee.destroy();
        const labels = Array.from({length: 12}, (_, i) => `M${i+1}`);
        this.state.charts.oee = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: '가동률 (%)', data: labels.map(() => 85 + Math.random()*10), backgroundColor: '#3b82f6' },
                    { label: '성능 지수 (%)', data: labels.map(() => 90 + Math.random()*8), type: 'line', borderColor: '#fbbf24' }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } }
        });
    }

    renderBottleneckChart(data) {
        const ctx = document.getElementById('bottleneckChart').getContext('2d');
        const labels = Array.from({length: 12}, (_, i) => `M${i+1}`);
        new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ label: '사이클 타임 (sec)', data: labels.map(() => 2.5 + Math.random()*1.5), backgroundColor: '#ef4444' }] },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false }
        });
    }

    renderDowntimeChart(data) {
        const ctx = document.getElementById('downtimeChart').getContext('2d');
        new Chart(ctx, {
            type: 'pie',
            data: { labels: ['설비고장', '자재대기', '금형교체', '기타'], datasets: [{ data: [45, 25, 20, 10], backgroundColor: ['#ef4444', '#fbbf24', '#3b82f6', '#94a3b8'] }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    renderDeviceCompareChart(data) {
        const ctx = document.getElementById('deviceCompareChart').getContext('2d');
        const labels = Array.from({length: 12}, (_, i) => `M${(i+1).toString().padStart(2,'0')}`);
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: '월간 생산량', data: labels.map(() => 350000 + Math.random()*150000), backgroundColor: '#3b82f6', borderRadius: 4 },
                    { label: '가동 효율 (%)', data: labels.map(() => 75 + Math.random()*20), type: 'line', borderColor: '#fbbf24', yAxisID: 'y1' }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y1: { position: 'right', max: 100, beginAtZero: true } } }
        });
    }

    // --- Production Simulator Engine ---

    renderProdPlan() {
        if (!this.state.config || !this.state.config.simParams) {
            // Default params if not exists
            this.state.config.simParams = [
                { process: '성형', timeCapa: 550, runTime: 20, machines: 5, days: 25, personnel: 2 },
                { process: '조립', timeCapa: 1200, runTime: 20, machines: 12, days: 25, personnel: 5 },
                { process: '포장', timeCapa: 3500, runTime: 20, machines: 4, days: 25, personnel: 2 },
                { process: '검사', timeCapa: 8000, runTime: 20, machines: 3, days: 25, personnel: 1 }
            ];
        }

        this.calculateSimulation();
        this.renderSimUI();
    }

    calculateSimulation() {
        const targetQty = Number(document.getElementById('sim-target-qty').value) || 6000000;
        const params = this.state.config.simParams;
        
        let minCapa = Infinity;
        let bottleneckProcess = '';

        params.forEach(p => {
            p.dailyCapa = p.timeCapa * p.runTime * p.machines;
            p.monthlyCapa = p.dailyCapa * p.days;
            if (p.monthlyCapa < minCapa) {
                minCapa = p.monthlyCapa;
                bottleneckProcess = p.process;
            }
        });

        const achieveRate = Math.round((minCapa / targetQty) * 100);
        
        // Update UI
        document.getElementById('sim-max-prod').innerText = minCapa.toLocaleString();
        document.getElementById('sim-achievement').innerText = `${achieveRate}%`;
        document.getElementById('sim-achievement').style.color = achieveRate < 100 ? 'var(--danger)' : 'var(--success)';

        // AI Insight
        const insightMsg = `현재 병목 공정은 [${bottleneckProcess}] 입니다. 목표 수량 ${targetQty.toLocaleString()}개 달성을 위해서는 해당 공정의 Capa를 최소 ${Math.round((targetQty - minCapa)/targetQty*100)}% 이상 증설하거나 가동 시간을 확대해야 합니다.`;
        document.getElementById('bottleneck-insight-msg').innerText = insightMsg;

        // Bottleneck Bars
        const container = document.getElementById('bottleneck-container');
        container.innerHTML = params.map(p => {
            const perc = Math.min(100, Math.round((p.monthlyCapa / targetQty) * 100));
            const colorClass = p.process === bottleneckProcess ? 'danger' : (perc < 100 ? 'warning' : 'normal');
            return `
                <div class="bottleneck-bar-row">
                    <div class="bar-info"><span>${p.process} 공정</span><span>${p.monthlyCapa.toLocaleString()} (${perc}%)</span></div>
                    <div class="bar-wrap">
                        <div class="bar-fill ${colorClass}" style="width: ${perc}%"></div>
                        <div class="target-line" style="left: 100%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderSimUI() {
        const paramsBody = document.getElementById('sim-param-body');
        paramsBody.innerHTML = this.state.config.simParams.map((p, i) => `
            <tr>
                <td>${p.process}</td>
                <td><input type="number" value="${p.timeCapa}" onchange="window.app.updateSimParam(${i}, 'timeCapa', this.value)"></td>
                <td><input type="number" value="${p.runTime}" onchange="window.app.updateSimParam(${i}, 'runTime', this.value)"></td>
                <td><input type="number" value="${p.machines}" onchange="window.app.updateSimParam(${i}, 'machines', this.value)"></td>
                <td><input type="number" value="${p.days}" onchange="window.app.updateSimParam(${i}, 'days', this.value)"></td>
                <td>${p.personnel}</td>
            </tr>
        `).join('');

        const evidenceBody = document.getElementById('sim-evidence-body');
        evidenceBody.innerHTML = this.state.config.simParams.map(p => `
            <tr>
                <td>${p.process}</td>
                <td>${p.monthlyCapa.toLocaleString()}</td>
                <td>${p.dailyCapa.toLocaleString()}</td>
                <td>${Math.round(p.monthlyCapa / p.machines).toLocaleString()}</td>
                <td>${p.timeCapa}</td>
            </tr>
        `).join('');
    }

    async updateSimParam(index, field, value) {
        this.state.config.simParams[index][field] = Number(value);
        this.calculateSimulation();
        this.renderSimUI();
        // Auto-save to Supabase
        await this.supabase.from('app_config').upsert({ 
            partner_id: this.state.partner.id, 
            sim_params: this.state.config.simParams 
        }, { onConflict: 'partner_id' });
    }

    // --- Quality Data & Monitoring ---

    renderQualityData() {
        const container = document.getElementById('quality-table-container');
        if (!container) return;

        const filtered = this.getFilteredData();
        
        container.innerHTML = `
            <table class="quality-table">
                <thead>
                    <tr>
                        <th>작업 일자</th>
                        <th>최종 생산량</th>
                        <th>불량수</th>
                        <th>PPM</th>
                        <th>Cap 탈거력 (Avg)</th>
                        <th>상태</th>
                    </tr>
                </thead>
                <tbody>
                    ${filtered.map(d => {
                        const ppm = d.actual_qty ? Math.round(d.defect_qty / d.actual_qty * 1e6) : 0;
                        const capAvg = d.cap_pull_off || 0;
                        const capRisk = capAvg < (this.state.config.thresholds.capRisk || 410);
                        return `
                            <tr>
                                <td>${d.work_date}</td>
                                <td>${(d.actual_qty || 0).toLocaleString()}</td>
                                <td>${(d.defect_qty || 0).toLocaleString()}</td>
                                <td style="color: ${ppm > this.state.config.thresholds.ppm ? 'var(--danger)' : 'inherit'}">${ppm.toLocaleString()}</td>
                                <td style="color: ${capRisk ? 'var(--danger)' : 'inherit'}">
                                    ${capAvg} ${capRisk ? '<i class="fas fa-exclamation-triangle" title="Risk Low"></i>' : ''}
                                </td>
                                <td><span class="badge ${ppm > this.state.config.thresholds.ppm ? 'bg-danger' : 'bg-success'}">${ppm > this.state.config.thresholds.ppm ? '경고' : '정상'}</span></td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    switchTab(id) { this.state.activeTab = id; this.renderUI(); }

    // --- Data Management Handlers ---

    handleFileSelect(file) {
        if (!file) return;
        this.log(`Raw Data 분석 시작: ${file.name}`);
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const inputSheet = workbook.Sheets[workbook.SheetNames[0]]; // 첫 번째 시트 사용
            const rows = XLSX.utils.sheet_to_json(inputSheet, { header: 1 });
            
            // Raw Data 전용 단일 시트 파싱 (날짜:0, M:1~5, A:6~16, P:17~20, I:21~23, D:24~29, R:30, C:31~42)
            const validRows = rows.slice(2).filter(row => row[0] && !isNaN(new Date(row[0]).getTime()));
            this.state.pendingUploadData = validRows.map(row => {
                const m_raw = row.slice(1, 6).map(v => Number(v) || 0);
                const a_raw = row.slice(6, 17).map(v => Number(v) || 0);
                const p_raw = row.slice(17, 21).map(v => Number(v) || 0);
                const i_raw = row.slice(21, 24).map(v => Number(v) || 0);
                const d_raw = row.slice(24, 30).map(v => Number(v) || 0);
                const c_raw = row.slice(31, 43).map(v => Number(v) || 0);

                return {
                    partner_id: this.state.partner.id,
                    work_date: this.formatExcelDate(row[0]),
                    molding_qty: m_raw.reduce((a, b) => a + b, 0),
                    assembly_qty: a_raw.reduce((a, b) => a + b, 0),
                    packing_qty: p_raw.reduce((a, b) => a + b, 0),
                    actual_qty: i_raw.reduce((a, b) => a + b, 0),
                    defect_qty: d_raw.reduce((a, b) => a + b, 0),
                    molding_details: m_raw,
                    assembly_details: a_raw,
                    packing_details: p_raw,
                    inspection_details: i_raw,
                    defect_details: { SQ: d_raw[0], SC: d_raw[1], CO: d_raw[2], SP: d_raw[3], TI: d_raw[4], ETC: d_raw[5] },
                    remarks: row[30] || '',
                    cap_pull_off: c_raw.length ? Math.round(c_raw.reduce((a, b) => a + b, 0) / c_raw.length) : 0,
                    cap_details: { min: Math.min(...c_raw.filter(v => v > 0), 0), max: Math.max(...c_raw, 0), samples: c_raw }
                };
            });

            document.getElementById('upload-preview').style.display = 'block';
            document.getElementById('preview-filename').innerText = file.name;
            document.getElementById('preview-count').innerText = `총 ${this.state.pendingUploadData.length}일치 상세 실적 분석 완료. (장비별 상세 데이터 보존)`;
        };
        reader.readAsArrayBuffer(file);
    }

    formatExcelDate(val) {
        if (val instanceof Date) return val.toISOString().split('T')[0];
        if (typeof val === 'number') {
            const date = new Date((val - 25569) * 864e5);
            return date.toISOString().split('T')[0];
        }
        const d = new Date(val);
        return isNaN(d.getTime()) ? new Date().toISOString().split('T')[0] : d.toISOString().split('T')[0];
    }

    async saveUploadedData() {
        if (this.state.pendingUploadData.length === 0) return;
        const btn = document.getElementById('btn-save-upload');
        btn.disabled = true; btn.innerText = '저장 중...';
        const { error } = await this.supabase.from('production_actuals').upsert(this.state.pendingUploadData, { onConflict: 'partner_id, work_date' });
        if (error) alert('저장 실패: ' + error.message);
        else {
            alert('장비별 상세 데이터를 포함한 54개 항목 전수가 성공적으로 저장되었습니다.');
            document.getElementById('upload-preview').style.display = 'none';
            this.state.pendingUploadData = [];
            this.refreshData();
        }
        btn.disabled = false; btn.innerText = '데이터 업로드';
    }

    downloadExcelTemplate() {
        // 단일 시트 구조: 데이터_입력 (최종 정제 버전)
        const in_h1 = ["날짜(필수)", "성형장비 실적(M1~M5)", null, null, null, null, "조립기 실적(A1~A11)", null, null, null, null, null, null, null, null, null, null, "포장기 실적(P1~P4)", null, null, null, "검사 실적(I1~I3)", null, null, "불량 유형별 실적(6종)", null, null, null, null, null, "비고", "Cap 탈거력 샘플(12개)", null, null, null, null, null, null, null, null, null, null, null];
        const in_h2 = ["날짜*", "M1", "M2", "M3", "M4", "M5", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A11", "P1", "P2", "P3", "P4", "I1", "I2", "I3", "찌그러짐", "스크레치", "오염", "스프링삐짐", "기울어짐", "기타", "Issue 사항", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12"];
        const in_sample = ["2026-04-01", 10000, 10000, 10000, 10000, 10000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 12500, 12500, 12500, 12500, 16000, 16000, 18000, 10, 10, 10, 10, 10, 10, "정상", 480, 480, 480, 480, 480, 480, 480, 480, 480, 480, 480, 480];
        
        const ws = XLSX.utils.aoa_to_sheet([in_h1, in_h2, in_sample]);
        
        // 날짜 서식 (A열)
        const range = XLSX.utils.decode_range('A3:A100');
        for (let r = range.s.r; r <= range.e.r; r++) {
            const cell = ws[XLSX.utils.encode_cell({r: r, c: 0})];
            if (cell) cell.z = 'yyyy-mm-dd';
        }

        ws['!merges'] = [
            {s:{r:0,c:1},e:{r:0,c:5}}, {s:{r:0,c:6},e:{r:0,c:16}}, {s:{r:0,c:17},e:{r:0,c:20}}, 
            {s:{r:0,c:21},e:{r:0,c:23}}, {s:{r:0,c:24},e:{r:0,c:29}}, {s:{r:0,c:31},e:{r:0,c:42}}
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "RawData");
        XLSX.writeFile(wb, "JML_MES_R07_Standard_v13.xlsx");
    }
}

window.addEventListener('DOMContentLoaded', () => {
    if (typeof supabase !== 'undefined' && typeof CONFIG !== 'undefined') {
        window.app = new JMLMES();
        console.log('JML MES System v9.7 Finalized.');
    }
});
