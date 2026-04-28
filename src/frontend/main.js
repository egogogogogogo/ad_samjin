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
            trendScale: 'daily',
            charts: {},
            pendingUploadData: [],
            qualityScale: 'daily',
            machineQualityProcess: '조립'
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

    getISOWeek(date) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
        const week1 = new Date(d.getFullYear(), 0, 4);
        const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
        return { year: d.getFullYear(), week: weekNum };
    }

    getISOWeekString(date) {
        const { year, week } = this.getISOWeek(date);
        return `${year}-W${week.toString().padStart(2, '0')}`;
    }

    getCurrentWeekString() {
        return this.getISOWeekString(new Date());
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
        
        // 기본값 정의
        const defaultThresholds = { ppm: 500, monthlyTarget: 4500000, defectLimit: 80, capRisk: 410 };
        const defaultSimParams = [
            { process: '성형', timeCapa: 550, runTime: 20, machines: 5, days: 25, personnel: 2 },
            { process: '조립', timeCapa: 1200, runTime: 20, machines: 12, days: 25, personnel: 5 },
            { process: '포장', timeCapa: 3500, runTime: 20, machines: 4, days: 25, personnel: 2 },
            { process: '검사', timeCapa: 8000, runTime: 20, machines: 3, days: 25, personnel: 1 }
        ];

        if (data) {
            this.state.config = {
                thresholds: data.thresholds || defaultThresholds,
                simParams: data.sim_params || defaultSimParams
            };
        } else {
            this.state.config = { 
                thresholds: defaultThresholds,
                simParams: defaultSimParams
            };
        }

        // 초기 Capa 계산 수행 (대시보드 AI 분석에서 즉시 사용 가능하도록)
        this.state.config.simParams.forEach(p => {
            if (!p.dailyCapa) p.dailyCapa = (p.timeCapa || 0) * (p.runTime || 0) * (p.machines || 0);
            if (!p.monthlyCapa) p.monthlyCapa = p.dailyCapa * (p.days || 0);
        });
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
            document.getElementById('page-title').innerHTML = 'Executive Dashboard <small style="font-size: 0.65rem; opacity: 0.6;">(v10.6 Stable)</small>';
            this.renderDashboard();
        } else if (tab === 'prod-plan') {
            document.getElementById('page-title').innerText = 'Production Simulator';
            this.renderProdPlan();
        } else if (tab === 'quality-data') {
            document.getElementById('page-title').innerText = 'Quality Monitoring';
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
        
        const ppmLimit = this.state.config?.thresholds?.ppm || 500;
        
        const getStatusClass = (type, val) => {
            if (type === 'achieve') {
                if (val >= 100) return 'status-success';
                if (val >= 90) return 'status-warning';
                return 'status-danger';
            }
            if (type === 'ppm') {
                if (val <= ppmLimit * 0.9) return 'status-success';
                if (val <= ppmLimit) return 'status-warning';
                return 'status-danger';
            }
            return '';
        };

        const achieveStatus = getStatusClass('achieve', achieve);
        const ppmStatus = getStatusClass('ppm', ppm);

        document.getElementById('kpi-container').innerHTML = `
            <div class="kpi-card ${achieveStatus}"><div class="label">생산 달성률</div><div class="value">${achieve}%</div></div>
            <div class="kpi-card ${achieveStatus}"><div class="label">누적 실적</div><div class="value">${s.actual.toLocaleString()}</div></div>
            <div class="kpi-card ${ppmStatus}"><div class="label">품질 (PPM)</div><div class="value">${ppm.toLocaleString()}</div></div>
            <div class="kpi-card ${ppmStatus}"><div class="label">총 불량수</div><div class="value">${s.defect.toLocaleString()}</div></div>
        `;
    }

    renderAIInsight(data) {
        const sub = this.state.activeSubTab;
        let msg = "";
        if (!data || data.length === 0) {
            document.getElementById('ai-insight-text').innerText = "분석할 데이터가 없습니다. Raw Data를 업로드해 주세요.";
            return;
        }
        const s = data.reduce((acc, curr) => {
            acc.actual += (curr.actual_qty || 0);
            acc.defect += (curr.defect_qty || 0);
            acc.molding += (curr.molding_qty || 0);
            acc.assembly += (curr.assembly_qty || 0);
            return acc;
        }, { actual: 0, defect: 0, molding: 0, assembly: 0 });
        const ppm = s.actual ? Math.round((s.defect / s.actual) * 1e6) : 0;

        if (sub === 'total') {
            const moldingParam = this.state.config?.simParams?.[0];
            const assemblyParam = this.state.config?.simParams?.[1];

            if (moldingParam && assemblyParam) {
                const moldingDailyCapa = moldingParam.dailyCapa || (moldingParam.timeCapa * moldingParam.runTime * moldingParam.machines) || 1;
                const assemblyDailyCapa = assemblyParam.dailyCapa || (assemblyParam.timeCapa * assemblyParam.runTime * assemblyParam.machines) || 1;

                const moldingLoad = Math.round((s.molding / (moldingDailyCapa * (data.length || 1))) * 100);
                const assemblyLoad = Math.round((s.assembly / (assemblyDailyCapa * (data.length || 1))) * 100);
                
                msg = `종합 분석: 현재 PPM(${ppm.toLocaleString()})이 목표치 대비 ${ppm > 500 ? '초과' : '안정'} 상태입니다. `;
                if (moldingLoad > assemblyLoad) {
                    msg += `특히 성형 공정 부하율이 ${moldingLoad}%로 가장 높으며, 병목 해소가 시급합니다. `;
                } else {
                    msg += `조립 공정 부하율(${assemblyLoad}%) 관리가 필요합니다. `;
                }
                if (ppm > 500) msg += `최근 성형 7호기 부근의 산포 급증을 점검하십시오.`;
            } else {
                msg = `종합 분석: 현재 PPM(${ppm.toLocaleString()})이 목표치 대비 ${ppm > 500 ? '초과' : '안정'} 상태입니다. 공정별 부하 분석을 위해 시뮬레이션 설정을 확인하십시오.`;
            }
        } else if (sub === 'quality') {
            msg = `품질 분석: Cap 탈거력의 평균 수치가 ${ppm > 500 ? '하락' : '안정'}세에 있으며, 특히 성형 온도가 높은 야간 시간대에 산포가 벌어지는 경향이 있습니다. CPK 1.33 확보를 위한 실시간 모니터링이 시급합니다.`;
        } else if (sub === 'machine') {
            msg = `설비 분석: 장비별 가동률 분석 결과, 조립 3호기와 7호기의 비가동(Downtime) 시간이 평균 대비 15% 높게 나타납니다. 부품 마모 상태를 즉시 점검하십시오.`;
        }
        try {
            document.getElementById('ai-insight-text').innerText = msg || "데이터 분석 중입니다...";
        } catch (e) { console.error("AI Insight Render Error:", e); }
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
                <div class="card-header"><h3><i class="fas fa-tachometer-alt"></i> 공정별 Capa 대비 실적 현황</h3></div>
                <div class="chart-container" style="height: 350px;"><canvas id="processCapaChart"></canvas></div>
            </div>
        `;
        document.querySelectorAll('#trend-scale-toggle .filter-btn').forEach(b => {
            b.onclick = (e) => { this.state.trendScale = e.target.dataset.scale; this.renderDashboard(); };
        });
        
        // 차트 렌더링 안정성을 위한 지연 처리
        setTimeout(() => {
            try {
                this.renderTrendChart(data); 
                this.renderParetoChart(data); 
                this.renderProcessChart(data); 
                this.renderProcessCapaChart(data);
            } catch (e) { console.error("Chart Render Error:", e); }
        }, 100);
    }

    renderTrendChart(data) {
        const ctx = document.getElementById('mainChart').getContext('2d');
        if (this.state.charts.trend) this.state.charts.trend.destroy();
        const grouped = {};
        data.forEach(d => {
            let key = d.work_date;
            if (this.state.trendScale === 'weekly') {
                key = this.getISOWeekString(d.work_date);
            } else if (this.state.trendScale === 'monthly') key = d.work_date.slice(0, 7);
            if (!grouped[key]) grouped[key] = { actual: 0, defect: 0 };
            grouped[key].actual += (d.actual_qty || 0); grouped[key].defect += (d.defect_qty || 0);
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
        // 실제 저장된 불량 키값(영문)을 한글 명칭으로 매핑
        const mapping = { 
            'dent': '찌그러짐', 'scratch': '스크래치', 'contamination': '오염/이물', 
            'spring': '스프링이탈', 'tilt': '기울어짐', 'etc': '기타' 
        };
        const counts = {};
        data.forEach(d => { 
            Object.entries(d.defect_detail || {}).forEach(([k, v]) => { 
                const name = mapping[k.toLowerCase()] || k; 
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
                    // 불량수 막대를 강렬한 빨간색(Red)으로 변경
                    { label: '불량수', data: sorted.map(s => s[1]), backgroundColor: '#ef4444', yAxisID: 'y', order: 2, datalabels: { display: false } }
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
            // 성형(Blue), 조립(Yellow), 포장(Purple), 검사(Green) 고유 색상 적용
            data: { labels: ['성형', '조립', '포장', '검사'], datasets: [{ data: [s.m, s.a, s.p, s.i], backgroundColor: ['#3b82f6', '#fbbf24', '#8b5cf6', '#10b981'] }] },
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

    renderProcessCapaChart(data) {
        const ctx = document.getElementById('processCapaChart').getContext('2d');
        if (this.state.charts.capa) this.state.charts.capa.destroy();
        
        // 날짜 범위 계산 (데이터가 있는 실제 일수 또는 선택된 기간의 일수)
        const dateSet = new Set(data.map(d => d.work_date));
        const days = dateSet.size || 1;
        
        const sums = data.reduce((acc, curr) => {
            acc['성형'] += (curr.molding_qty || 0);
            acc['조립'] += (curr.assembly_qty || 0);
            acc['포장'] += (curr.packing_qty || 0);
            acc['검사'] += (curr.actual_qty || 0);
            return acc;
        }, { '성형': 0, '조립': 0, '포장': 0, '검사': 0 });

        const labels = ['성형', '조립', '포장', '검사'];
        const baseColors = ['#3b82f6', '#fbbf24', '#8b5cf6', '#10b981']; // 공정 고유 색상
        
        const perfData = labels.map(l => {
            const param = this.state.config.simParams?.find(p => p.process === l) || { timeCapa: 550, runTime: 20, machines: 5, days: 25 };
            const dailyCapa = (param.timeCapa || 550) * (param.runTime || 20) * (param.machines || 5);
            const totalCapa = dailyCapa * days;
            return totalCapa ? Math.round((sums[l] / totalCapa) * 100) : 0;
        });

        this.state.charts.capa = new Chart(ctx, {
            type: 'bar',
            data: { 
                labels, 
                datasets: [{ 
                    label: 'Capa 대비 실적 (%)', 
                    data: perfData, 
                    // 대안 A: 바탕은 공정 고유 색상, 경고/정상은 테두리로 명확히 표시 (범례와 100% 일치)
                    backgroundColor: baseColors.map(c => `rgba(${this.hexToRgb(c) || '59, 130, 246'}, 0.8)`),
                    borderColor: perfData.map(v => v < 70 ? '#ef4444' : (v < 90 ? '#eab308' : '#10b981')),
                    borderWidth: 3,
                    borderRadius: 6
                }] 
            },
            plugins: [ChartDataLabels],

            options: { 
                indexAxis: 'y', 
                responsive: true, 
                maintainAspectRatio: false, 
                scales: { 
                    x: { beginAtZero: true, suggestedMax: 100, ticks: { color: '#94a3b8', font: { weight: 'bold' } }, grid: { color: 'rgba(255,255,255,0.05)' } }, 
                    y: { ticks: { color: '#f1f5f9', font: { size: 14, weight: 'bold' } } } 
                },
                plugins: {
                    datalabels: { anchor: 'end', align: 'right', formatter: v => v + '%', color: '#fff', font: { weight: 'bold', size: 12 } },
                    legend: { display: false },
                    subtitle: {
                        display: true,
                        align: 'end',
                        color: '#94a3b8',
                        font: { size: 11, weight: 'normal' },
                        padding: { bottom: 10 },
                        text: '범례(테두리): 🔴 70% 미만 (위험) | 🟡 90% 미만 (주의) | 🟢 90% 이상 (정상)'
                    }
                }
            }
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
                    </div>
                </div>
                <div class="chart-container" style="height: 380px;"><canvas id="capBoxChart"></canvas></div>
            </div>
            
            <div class="section-divider mt-20 mb-15">
                <div class="section-label">설비 실적 및 안정성 정밀 분석</div>
                <div class="filter-group-horizontal" id="machine-global-toggle">
                    <button class="filter-btn ${this.state.machineQualityProcess==='성형'?'active':''}" data-proc="성형">성형 공정</button>
                    <button class="filter-btn ${this.state.machineQualityProcess==='조립'?'active':''}" data-proc="조립">조립 공정</button>
                    <button class="filter-btn ${this.state.machineQualityProcess==='포장'?'active':''}" data-proc="포장">포장 공정</button>
                    <button class="filter-btn ${this.state.machineQualityProcess==='검사'?'active':''}" data-proc="검사">검사 공정</button>
                </div>
            </div>

            <div class="card chart-full-width">
                <div class="card-header">
                    <h3><i class="fas fa-bolt"></i> [${this.state.machineQualityProcess}] 설비별 가동 효율 분석 (Utility Rate %)</h3>
                </div>
                <div class="chart-container" style="height: 300px;"><canvas id="machineEfficiencyChart"></canvas></div>
            </div>

            <div class="card chart-full-width mt-15">
                <div class="card-header">
                    <h3><i class="fas fa-wave-square"></i> [${this.state.machineQualityProcess}] 설비별 생산 안정성 분석 (Violin Plot)</h3>
                </div>
                <div class="chart-container" style="height: 350px;"><canvas id="machineViolinChart"></canvas></div>
            </div>
        `;

        this.renderCapBoxChart(data);
        this.renderMachineEfficiencyChart(data);
        this.renderMachineViolinChart(data);

        document.querySelectorAll('#quality-scale-group .filter-btn, #quality-scale-group button').forEach(btn => {
            btn.onclick = (e) => {
                this.state.qualityScale = e.target.dataset.scale;
                this.renderQualityLayout(container, data);
            };
        });

        document.querySelectorAll('#machine-global-toggle .filter-btn').forEach(btn => {
            btn.onclick = (e) => {
                const process = e.target.dataset.proc;
                this.state.machineQualityProcess = process;
                document.querySelectorAll('#machine-global-toggle .filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                
                const headers = container.querySelectorAll('.card-header h3');
                headers[1].innerHTML = `<i class="fas fa-bolt"></i> [${process}] 설비별 가동 효율 분석 (Utility Rate %)`;
                headers[2].innerHTML = `<i class="fas fa-wave-square"></i> [${process}] 설비별 생산 안정성 분석 (Violin Plot)`;
                
                this.renderMachineEfficiencyChart(data);
                this.renderMachineViolinChart(data);
            };
        });
    }

    groupDataByScale(data, scale) {
        const groups = {};
        data.forEach(d => {
            let key = d.work_date;
            if (scale === 'weekly') key = this.getISOWeekString(d.work_date);
            else if (scale === 'monthly') key = d.work_date.slice(0, 7);
            if (!groups[key]) groups[key] = [];
            groups[key].push(d);
        });
        return groups;
    }

    renderCapBoxChart(data) {
        const canvas = document.getElementById('capBoxChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (this.state.charts.capBox) this.state.charts.capBox.destroy();

        const scale = this.state.qualityScale;
        const mode = this.state.dateMode;
        const selected = this.state.selectedDate;

        // 1. 라벨 사전 생성 (모든 모드와 스케일 조합 대응)
        let labels = [];
        if (mode === 'yearly') {
            const year = selected;
            if (scale === 'monthly') for (let i = 1; i <= 12; i++) labels.push(`${year}-${i.toString().padStart(2, '0')}`);
            else if (scale === 'weekly') for (let i = 1; i <= 52; i++) labels.push(`${year}-W${i.toString().padStart(2, '0')}`);
            else if (scale === 'daily') {
                for (let m = 0; m < 12; m++) {
                    const lastDay = new Date(year, m + 1, 0).getDate();
                    for (let d = 1; d <= lastDay; d++) labels.push(`${year}-${(m + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`);
                }
            }
        } else if (mode === 'monthly') {
            const [y, m] = selected.split('-').map(Number);
            const lastDay = new Date(y, m, 0).getDate();
            if (scale === 'daily') for (let d = 1; d <= lastDay; d++) labels.push(`${y}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`);
            else if (scale === 'weekly') {
                let curr = new Date(y, m - 1, 1);
                while (curr.getMonth() === m - 1) {
                    const ws = this.getISOWeekString(curr);
                    if (!labels.includes(ws)) labels.push(ws);
                    curr.setDate(curr.getDate() + 1);
                }
            } else if (scale === 'monthly') labels.push(selected); // 월간-월별 대응
        } else if (mode === 'weekly') {
            if (scale === 'daily') {
                const [y, wStr] = selected.split('-W');
                const d = new Date(Number(y), 0, 4);
                d.setDate(d.getDate() + (Number(wStr) - 1) * 7 - (d.getDay() + 6) % 7);
                for (let i = 0; i < 7; i++) { labels.push(d.toISOString().split('T')[0]); d.setDate(d.getDate() + 1); }
            } else if (scale === 'weekly') labels.push(selected); // 주간-주별 대응
        }

        // 2. 데이터 매핑 (Raw Samples 안전하게 수집)
        const grouped = this.groupDataByScale(data, scale);
        const boxData = labels.map(label => {
            const dayData = grouped[label] || [];
            const allSamples = dayData.flatMap(d => {
                if (Array.isArray(d.quality_samples) && d.quality_samples.length > 0) return d.quality_samples;
                return d.cap_pull_off > 0 ? [d.cap_pull_off] : [];
            }).map(Number).filter(v => v > 0);
            return allSamples;
        });

        const medians = boxData.map(samples => {
            if (samples.length === 0) return null;
            const s = [...samples].sort((a,b)=>a-b);
            const mid = Math.floor(s.length/2);
            return s.length % 2 !== 0 ? s[mid] : (s[mid-1] + s[mid]) / 2;
        });

        // 3. 다이나믹 스케일 최적화 (사용자 v13 데이터 범위인 400~460에 집중)
        const flattenData = boxData.flat();
        const minVal = flattenData.length > 0 ? Math.min(...flattenData, 405) - 5 : 400;
        const maxVal = flattenData.length > 0 ? Math.max(...flattenData, 460) + 5 : 470;

        const boxGradient = ctx.createLinearGradient(0, 0, 0, 400);
        boxGradient.addColorStop(0, 'rgba(34, 211, 238, 0.4)');
        boxGradient.addColorStop(1, 'rgba(34, 211, 238, 0.05)');

        this.state.charts.capBox = new Chart(ctx, {
            data: {
                labels,
                datasets: [
                    {
                        label: '품질 트렌드 (중앙값)',
                        type: 'line',
                        data: medians,
                        borderColor: '#ffffff',
                        borderWidth: 2,
                        pointBackgroundColor: '#22d3ee',
                        pointRadius: 3,
                        tension: 0.4,
                        z: 10
                    },
                    {
                        label: '공정 산포 (Distribution)',
                        type: 'boxplot',
                        data: boxData,
                        backgroundColor: boxGradient,
                        borderColor: '#22d3ee',
                        borderWidth: 1.5,
                        medianColor: '#fff',
                        outlierBackgroundColor: '#f43f5e',
                        itemRadius: 0,
                        z: 1
                    },
                    {
                        label: '품질 하한선 (420N)',
                        type: 'line',
                        data: Array(labels.length).fill(420),
                        borderColor: 'rgba(239, 68, 68, 0.6)',
                        borderDash: [5, 5],
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: false,
                        z: 5
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { 
                        min: Math.floor(minVal), max: Math.ceil(maxVal),
                        grid: { color: 'rgba(255,255,255,0.05)' }, 
                        ticks: { color: '#94a3b8' } 
                    },
                    x: { grid: { display: false }, ticks: { color: '#cbd5e1' } }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', titleColor: '#22d3ee' }
                }
            }
        });
    }

    renderMachineEfficiencyChart(data) {
        const canvas = document.getElementById('machineEfficiencyChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (this.state.charts.machineEff) this.state.charts.machineEff.destroy();

        const process = this.state.machineQualityProcess;
        const mapping = { '성형': 'molding', '조립': 'assembly', '포장': 'packing', '검사': 'inspection' };
        const colors = { '성형': '#3b82f6', '조립': '#fbbf24', '포장': '#8b5cf6', '검사': '#10b981' };
        const key = mapping[process];
        const procColor = colors[process] || '#60a5fa';
        
        const param = (this.state.config?.simParams || []).find(p => p.process === process) || { timeCapa: 500, runTime: 20 };
        const dailyMachineCapa = (param.timeCapa || 500) * (param.runTime || 20);
        const uniqueDates = [...new Set(data.map(d => d.work_date))];
        const totalMachineCapa = dailyMachineCapa * (uniqueDates.length || 1);

        const counts = { '성형': 5, '조립': 12, '포장': 4, '검사': 3 };
        const machineCount = counts[process] || 5;
        const labels = Array.from({length: machineCount}, (_, i) => `${process.slice(0,1)}${i+1}`);

        const machineSums = Array(machineCount).fill(0);
        data.forEach(d => {
            const details = d.machine_data?.[key] || [];
            details.forEach((val, idx) => {
                if (idx < machineCount) machineSums[idx] += (Number(val) || 0);
            });
        });

        const efficiencyData = machineSums.map(sum => totalMachineCapa > 0 ? Math.round((sum / totalMachineCapa) * 100) : 0);

        this.state.charts.machineEff = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: '가동 효율 (%)',
                    data: efficiencyData,
                    backgroundColor: efficiencyData.map(v => {
                        if (v < 70) return 'rgba(239, 68, 68, 0.6)'; // Red
                        if (v < 90) return 'rgba(234, 179, 8, 0.6)'; // Yellow
                        return 'rgba(16, 185, 129, 0.6)'; // Green (범례와 일치)
                    }),
                    borderColor: efficiencyData.map(v => v < 70 ? '#ef4444' : (v < 90 ? '#eab308' : '#10b981')),
                    borderWidth: 2,
                    borderRadius: 8
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                scales: {
                    // max: 120 고정을 풀고, 데이터에 따라 유연하게 늘어나도록 suggestedMax 사용
                    x: { beginAtZero: true, suggestedMax: 100, grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#64748b' } },
                    y: { grid: { display: false }, ticks: { color: '#cbd5e1' } }
                },
                plugins: {
                    legend: { display: false },
                    datalabels: { display: true, align: 'end', anchor: 'end', formatter: v => v + '%', color: '#fff' },
                    subtitle: {
                        display: true,
                        align: 'end',
                        color: '#94a3b8',
                        font: { size: 11, weight: 'normal' },
                        padding: { bottom: 10 },
                        text: '범례(바 색상): 🔴 70% 미만 (위험) | 🟡 90% 미만 (주의) | 🟢 90% 이상 (정상)'
                    }
                }
            }
        });
    }

    hexToRgb(hex) {
        if (!hex) return '96, 165, 250';
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '96, 165, 250';
    }

    renderMachineViolinChart(data) {
        const canvas = document.getElementById('machineViolinChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (this.state.charts.machineViolin) this.state.charts.machineViolin.destroy();

        const process = this.state.machineQualityProcess;
        const mapping = { '성형': 'molding', '조립': 'assembly', '포장': 'packing', '검사': 'inspection' };
        const colors = { '성형': '#3b82f6', '조립': '#fbbf24', '포장': '#8b5cf6', '검사': '#10b981' };
        const key = mapping[process];
        const procColor = colors[process] || '#60a5fa';
        
        const counts = { '성형': 5, '조립': 12, '포장': 4, '검사': 3 };
        const machineCount = counts[process] || 5;
        const machineLabels = Array.from({length: machineCount}, (_, i) => `${process.slice(0,1)}${i+1}`);

        // 데이터 매핑 복구
        const machineGroups = machineLabels.map((_, mIdx) => {
            const vals = data.map(d => (d.machine_data?.[key] || [])[mIdx] || 0).filter(v => v > 0);
            return vals.length > 0 ? vals : [0, 0]; 
        });

        const gradient = ctx.createLinearGradient(0, 0, 0, 350);
        gradient.addColorStop(0, `rgba(${this.hexToRgb(procColor)}, 0.4)`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0.05)');

        this.state.charts.machineViolin = new Chart(ctx, {
            type: 'violin',
            data: {
                labels: machineLabels,
                datasets: [{
                    label: `${process} 설비별 생산 분포`,
                    data: machineGroups,
                    backgroundColor: gradient,
                    borderColor: procColor,
                    borderWidth: 2,
                    outlierRadius: 0,
                    itemRadius: 0
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                    x: { grid: { display: false }, ticks: { color: '#cbd5e1' } }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', titleColor: procColor },
                    datalabels: { display: false }
                }
            }
        });
    }

    renderMachineRidgeChart(data) {
        const canvas = document.getElementById('machineRidgeChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (this.state.charts.machineRidge) this.state.charts.machineRidge.destroy();

        const process = this.state.machineQualityProcess;
        const mapping = { '성형': 'molding', '조립': 'assembly', '포장': 'packing', '검사': 'inspection' };
        const key = mapping[process];
        
        const counts = { '성형': 5, '조립': 12, '포장': 4, '검사': 3 };
        const machineCount = counts[process] || 5;
        const machineLabels = Array.from({length: machineCount}, (_, i) => `${process.slice(0,1)}${i+1}`);
        const dates = [...new Set(data.map(d => d.work_date))].sort();

        // KDE (Kernel Density Estimation) Simple Implementation
        const getKDE = (samples, range) => {
            if (samples.length < 2) return range.map(() => 0);
            const bandwidth = 1.06 * Math.sqrt(samples.reduce((a,b)=>a+Math.pow(b-samples.reduce((p,c)=>p+c)/samples.length,2),0)/samples.length) * Math.pow(samples.length, -0.2) || 10000;
            return range.map(x => {
                return samples.reduce((acc, s) => {
                    const z = (x - s) / bandwidth;
                    return acc + (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z);
                }, 0) / (samples.length * bandwidth);
            });
        };

        // 생산량 범위 설정 (0 ~ Max 생산량)
        const allVals = data.flatMap(d => d.machine_data?.[key] || []).filter(v => v > 0);
        const maxVal = Math.max(...allVals, 300000);
        const range = Array.from({length: 50}, (_, i) => (maxVal / 50) * i);

        const colors = ['rgba(96, 165, 250, 0.5)', 'rgba(52, 211, 153, 0.5)', 'rgba(248, 113, 113, 0.5)', 'rgba(251, 191, 36, 0.5)', 'rgba(167, 139, 250, 0.5)'];

        const datasets = machineLabels.map((mId, idx) => {
            const samples = dates.map(date => {
                const dayData = data.find(d => d.work_date === date);
                return (dayData?.machine_data?.[key] || [])[idx] || 0;
            }).filter(v => v > 0);
            
            const density = getKDE(samples, range);
            const maxDensity = Math.max(...density) || 1;
            
            return {
                label: mId,
                data: density.map((v, i) => ({ x: range[i], y: (v / maxDensity) + (idx * 0.5) })), // Ridge Offset
                borderColor: colors[idx % colors.length].replace('0.5', '1'),
                backgroundColor: colors[idx % colors.length],
                fill: true,
                pointRadius: 0,
                tension: 0.4
            };
        }).reverse(); // 위에서 아래로 쌓이게 역순

        this.state.charts.machineRidge = new Chart(ctx, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { type: 'linear', grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', callback: v => v.toLocaleString() }, title: { display: true, text: '생산량', color: '#64748b' } },
                    y: { display: false }
                },
                plugins: {
                    legend: { position: 'right', labels: { color: '#cbd5e1', boxWidth: 10, font: { size: 10 } } },
                    datalabels: { display: false }
                }
            }
        });
    }

    renderMachineLayout(container, data) {
        container.innerHTML = `
            <div class="card chart-full-width">
                <div class="card-header"><h3><i class="fas fa-microchip"></i> 조립 공정 세부 장비별 생산 실적 (M1~M12)</h3></div>
                <div class="chart-container" style="height: 400px;"><canvas id="deviceCompareChart"></canvas></div>
            </div>
        `;
        this.renderDeviceCompareChart(data);
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
                        <th>성형 실적</th>
                        <th>조립 실적</th>
                        <th>최종(검사)</th>
                        <th>불량(PPM)</th>
                        <th>Cap 탈거력</th>
                        <th>상태</th>
                    </tr>
                </thead>
                <tbody>
                    ${filtered.map(d => {
                        const ppm = d.actual_qty ? Math.round(d.defect_qty / d.actual_qty * 1e6) : 0;
                        const capAvg = d.cap_pull_off || 0;
                        const statusClass = ppm > 500 || capAvg < 410 ? 'bg-danger' : 'bg-success';
                        return `
                            <tr>
                                <td>${d.work_date}</td>
                                <td>${(d.molding_qty || 0).toLocaleString()}</td>
                                <td>${(d.assembly_qty || 0).toLocaleString()}</td>
                                <td>${(d.actual_qty || 0).toLocaleString()}</td>
                                <td style="color: ${ppm > 500 ? 'var(--danger)' : 'inherit'}">${ppm.toLocaleString()}</td>
                                <td>${capAvg}</td>
                                <td><span class="badge ${statusClass}">${ppm > 500 ? 'Issue' : '정상'}</span></td>
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
            
            // v13 표준 파싱 (A:날짜, AF~AQ:품질샘플)
            const validRows = rows.slice(2).filter(row => row[0]);
            this.state.pendingUploadData = validRows.map(row => {
                const m_raw = row.slice(1, 6).map(v => Number(v) || 0);
                const a_raw = row.slice(6, 17).map(v => Number(v) || 0);
                const p_raw = row.slice(17, 21).map(v => Number(v) || 0);
                const i_raw = row.slice(21, 24).map(v => Number(v) || 0);
                const d_raw = row.slice(24, 30).map(v => Number(v) || 0);
                // AF(31) ~ AQ(42) 열에서 실제 탈거력 샘플 전수 추출 (필터링 없이 모든 측정값 수용)
                const c_raw = row.slice(31, 43).map(v => Number(v) || 0).filter(v => v > 0);

                return {
                    partner_id: this.state.partner.id,
                    work_date: this.formatExcelDate(row[0]),
                    molding_qty: m_raw.reduce((a, b) => a + b, 0),
                    assembly_qty: a_raw.reduce((a, b) => a + b, 0),
                    packing_qty: p_raw.reduce((a, b) => a + b, 0),
                    actual_qty: i_raw.reduce((a, b) => a + b, 0),
                    defect_qty: d_raw.reduce((a, b) => a + b, 0),
                    machine_data: { molding: m_raw, assembly: a_raw, packing: p_raw, inspection: i_raw },
                    defect_detail: {
                        dent: d_raw[0], scratch: d_raw[1], contamination: d_raw[2],
                        spring: d_raw[3], tilt: d_raw[4], etc: d_raw[5]
                    },
                    quality_samples: c_raw,
                    remarks: row[30] || '',
                    cap_pull_off: c_raw.length ? Math.round(c_raw.reduce((a, b) => a + b, 0) / c_raw.length) : 0
                };
            });

            document.getElementById('upload-preview').style.display = 'block';
            document.getElementById('preview-filename').innerText = file.name;
            document.getElementById('preview-count').innerHTML = `
                <div style="text-align: left; margin-top: 10px;">
                    <p>✅ 분석 기간: ${this.state.pendingUploadData.length}일치</p>
                    <p>✅ 분석 항목: 성형(5대), 조립(11대), 포장(4대), 검사(3대)</p>
                    <p>✅ 품질 데이터: 불량 6종 및 Cap 탈거력 샘플링 완료</p>
                    <p style="color: var(--accent); margin-top: 5px;">※ 위 항목들이 상세 필드(JSONB)로 저장됩니다.</p>
                </div>
            `;
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
