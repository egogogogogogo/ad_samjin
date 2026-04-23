/**
 * JML MES System - Core Engine (Step 3: Supabase Unified)
 */

class JMLMES {
    constructor() {
        this.supabase = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
        this.state = {
            user: null,
            partner: null,
            config: null,
            data: [],
            activeTab: 'dashboard',
            activeSubTab: 'total',
            timeframe: 'monthly',
            selectedDate: '2026-04',
            charts: {},
            simulator: {
                targetQty: 6000000,
                params: [
                    { name: '성형(Molding)', capa: 25000, hours: 20, machines: 5, days: 25, labor: 2 },
                    { name: '조립(Assembly)', capa: 18000, hours: 20, machines: 11, days: 25, labor: 4 },
                    { name: '검사(Final)', capa: 35000, hours: 10, machines: 3, days: 25, labor: 1 }
                ]
            }
        };
        this.init();
    }

    log(msg, type = 'system') {
        const consoleEl = document.getElementById('debug-console');
        if (!consoleEl) return;
        const entry = document.createElement('div');
        const time = new Date().toLocaleTimeString('ko-KR', { hour12: false });
        entry.className = `log-entry ${type}`;
        entry.innerText = `[${time}] ${msg}`;
        consoleEl.appendChild(entry);
        consoleEl.scrollTop = consoleEl.scrollHeight;
    }

    async init() {
        this.log('v9.0 엔진 초기화 중...');
        this.bindEvents();
        this.checkAuth();
    }

    bindEvents() {
        // Auth
        document.getElementById('btn-login').addEventListener('click', () => this.handleLogin());
        document.getElementById('btn-logout').addEventListener('click', () => this.handleLogout());

        // Sidebar Navigation
        document.querySelectorAll('.nav-links li').forEach(li => {
            li.addEventListener('click', () => this.switchTab(li.getAttribute('data-tab')));
        });

        // Dashboard Sub-Tabs
        document.querySelectorAll('.sub-tab').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.state.activeSubTab = e.target.dataset.sub;
                this.renderUI();
            });
        });

        // Timeframe Filters
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.state.timeframe = e.target.dataset.range;
                this.refreshData();
            });
        });

        // Date Picker
        document.getElementById('date-picker-month').addEventListener('change', (e) => {
            this.state.selectedDate = e.target.value;
            const [y, m] = e.target.value.split('-');
            document.getElementById('current-date-range').innerText = `${y}년 ${m}월`;
            this.refreshData();
        });

        // Forms
        document.getElementById('manual-input-form').addEventListener('submit', (e) => this.handleManualInput(e));
        document.getElementById('btn-save-settings').addEventListener('click', () => this.saveSettings());
        document.getElementById('btn-refresh').addEventListener('click', () => this.refreshData());

        // File Upload
        const dz = document.getElementById('drop-zone');
        const fi = document.getElementById('file-input');
        dz.onclick = () => fi.click();
        fi.onchange = (e) => this.handleFileSelection(e.target.files[0]);
        dz.ondragover = (e) => { e.preventDefault(); dz.style.borderColor = 'var(--accent)'; };
        dz.ondragleave = () => { dz.style.borderColor = 'var(--border)'; };
        dz.ondrop = (e) => { e.preventDefault(); this.handleFileSelection(e.dataTransfer.files[0]); };
        document.getElementById('btn-save-upload').addEventListener('click', () => this.saveUploadedData());
    }

    // --- Auth Logic ---
    async checkAuth() {
        const { data: { session } } = await this.supabase.auth.getSession();
        if (session) {
            this.onAuthenticated(session.user);
        } else {
            document.getElementById('login-overlay').style.display = 'flex';
        }

        this.supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN') this.onAuthenticated(session.user);
            if (event === 'SIGNED_OUT') window.location.reload();
        });
    }

    async handleLogin() {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-pw').value;
        const btn = document.getElementById('btn-login');
        
        btn.disabled = true;
        btn.innerText = '로그인 중...';

        const { error } = await this.supabase.auth.signInWithPassword({ email, password });
        if (error) {
            alert('로그인 실패: ' + error.message);
            btn.disabled = false;
            btn.innerText = '로그인';
        }
    }

    async handleLogout() {
        await this.supabase.auth.signOut();
    }

    async onAuthenticated(user) {
        this.log('사용자 인증 성공. 세션 활성화.');
        console.log("Authenticated User UID:", user.id);
        this.state.user = user;
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';

        // Load Profile & Partner
        const { data: profile, error } = await this.supabase
            .from('profiles')
            .select('*, partners(*)')
            .eq('id', user.id)
            .single();

        if (error) {
            this.log('프로필 조회 실패: ' + error.message, 'error');
            alert("프로필을 불러오지 못했습니다: " + error.message);
            return;
        }

        if (profile && profile.partners) {
            this.state.partner = profile.partners;
            this.log(`업체 연결 성공: ${this.state.partner.company_name}`);
            document.getElementById('user-display-name').innerText = profile.full_name || user.email;
            document.getElementById('setting-company').value = profile.partners.company_name;
            await this.loadConfig();
            await this.refreshData();
        }
    }

    renderUI() {
        // Hide/Show sub-tabs based on main tab
        document.getElementById('dashboard-sub-tabs').style.display = 
            this.state.activeTab === 'dashboard' ? 'flex' : 'none';

        if (this.state.activeTab === 'dashboard') this.renderDashboard();
        if (this.state.activeTab === 'prod-plan') this.renderSimulator();
        if (this.state.activeTab === 'data-mgmt') this.renderHistory();
    }

    renderDashboard() {
        const processed = this.getAggregatedData();
        this.renderKPIs(processed);
        
        const chartGrid = document.querySelector('.charts-grid');
        if (this.state.activeSubTab === 'total') {
            chartGrid.style.display = 'grid';
            this.renderCharts(processed.list);
        } else {
            // Placeholder for other sub-tabs
            chartGrid.style.display = 'none';
            this.log(`서브 탭 [${this.state.activeSubTab}] 준비 중...`);
        }
    }

    // --- Simulator Logic ---
    renderSimulator() {
        const body = document.getElementById('sim-param-body');
        if (!body) return;

        body.innerHTML = this.state.simulator.params.map((p, i) => `
            <tr>
                <td>${p.name}</td>
                <td><input type="number" value="${p.capa}" onchange="app.updateSimParam(${i}, 'capa', this.value)"></td>
                <td><input type="number" value="${p.hours}" onchange="app.updateSimParam(${i}, 'hours', this.value)"></td>
                <td><input type="number" value="${p.machines}" onchange="app.updateSimParam(${i}, 'machines', this.value)"></td>
                <td><input type="number" value="${p.days}" onchange="app.updateSimParam(${i}, 'days', this.value)"></td>
                <td><input type="number" value="${p.labor}" onchange="app.updateSimParam(${i}, 'labor', this.value)"></td>
            </tr>
        `).join('');

        this.runSimulation();
    }

    updateSimParam(index, key, value) {
        this.state.simulator.params[index][key] = parseInt(value);
        this.runSimulation();
    }

    runSimulation() {
        const target = parseInt(document.getElementById('sim-target-qty').value) || 0;
        const results = this.state.simulator.params.map(p => ({
            name: p.name,
            totalCapa: p.capa * p.hours * p.machines * p.days
        }));

        const minCapa = Math.min(...results.map(r => r.totalCapa));
        const bottleneck = results.find(r => r.totalCapa === minCapa);
        const achievement = target > 0 ? Math.round((minCapa / target) * 100) : 0;

        document.getElementById('sim-max-prod').innerText = `${minCapa.toLocaleString()} EA`;
        document.getElementById('sim-achievement').innerText = `${achievement}%`;
        document.getElementById('sim-achievement').style.color = achievement >= 100 ? 'var(--success)' : 'var(--warning)';

        // AI Briefing
        const briefing = document.getElementById('sim-ai-briefing');
        briefing.innerHTML = `
            <p>💡 <b>공정 진단 결과:</b> 현재 라인의 병목(Bottleneck) 공정은 <b>[${bottleneck.name}]</b>입니다.</p>
            <p>🚀 <b>최적화 솔루션:</b> 목표 수량(${target.toLocaleString()} EA) 달성을 위해 ${bottleneck.name} 공정의 
               시간당 CAPA를 ${Math.ceil(target / (bottleneck.totalCapa / bottleneck.name.length))} 수준으로 증설하거나 
               장비 가동 대수를 추가 확보할 것을 권장합니다.</p>
        `;
    }

    // --- Data Logic ---
    async loadConfig() {
        if (!this.state.partner) return;
        const { data, error } = await this.supabase
            .from('app_config')
            .select('*')
            .eq('partner_id', this.state.partner.id)
            .single();
        
        if (data) {
            this.state.config = data;
            document.getElementById('set-ppm-limit').value = data.thresholds.ppm;
            document.getElementById('set-monthly-target').value = data.thresholds.monthlyTarget;
            this.log('시스템 설정 로드 완료.');
        }
    }

    async refreshData() {
        if (!this.state.partner) return;
        this.log(`데이터 새로고침 중... (${this.state.timeframe})`);
        document.getElementById('btn-refresh').classList.add('fa-spin');
        
        // Supabase Query with Timeframe Filter (Simplified for Monthly)
        const { data, error } = await this.supabase
            .from('production_actuals')
            .select('*')
            .eq('partner_id', this.state.partner.id)
            .order('work_date', { ascending: false });

        if (error) {
            this.log('데이터 조회 실패: ' + error.message, 'error');
        } else {
            this.state.data = data || [];
            this.log(`동기화 성공: ${this.state.data.length}행 로드됨.`);
            document.getElementById('last-sync-time').innerText = `최종 동기화(Supabase): ${new Date().toLocaleTimeString()}`;
            this.renderUI();
        }
        document.getElementById('btn-refresh').classList.remove('fa-spin');
    }

    getAggregatedData() {
        const raw = this.state.data;
        const tf = this.state.timeframe;
        // Simple aggregation logic for now
        return {
            summary: this.calculateSummary(raw),
            list: [...raw].reverse()
        };
    }

    calculateSummary(data) {
        if (!data || data.length === 0) return { actual: 0, target: 0, defect: 0, ppm: 0, achieve: 0 };
        const s = data.reduce((acc, curr) => {
            acc.actual += (curr.actual_qty || 0);
            acc.target += (curr.target_qty || 0);
            acc.defect += (curr.defect_qty || 0);
            return acc;
        }, { actual: 0, target: 0, defect: 0 });
        
        s.ppm = s.actual ? Math.round((s.defect / s.actual) * 1000000) : 0;
        s.achieve = s.target ? Math.round((s.actual / s.target) * 100) : 0;
        return s;
    }

    renderKPIs(data) {
        const s = data.summary;
        const container = document.getElementById('kpi-container');
        if (!container) return;
        
        container.innerHTML = `
            <div class="kpi-card">
                <div class="label">생산 달성률</div>
                <div class="value" style="color: ${s.achieve < 90 ? 'var(--warning)' : 'var(--success)'}">${s.achieve || 0}%</div>
            </div>
            <div class="kpi-card">
                <div class="label">최종 품질 (PPM)</div>
                <div class="value" style="color: ${s.ppm > (this.state.config?.thresholds?.ppm || 500) ? 'var(--danger)' : 'var(--accent)'}">${(s.ppm || 0).toLocaleString()}</div>
            </div>
            <div class="kpi-card">
                <div class="label">총 생산량</div>
                <div class="value">${(s.actual || 0).toLocaleString()} <small>EA</small></div>
            </div>
            <div class="kpi-card">
                <div class="label">총 불량수</div>
                <div class="value">${(s.defect || 0).toLocaleString()} <small>EA</small></div>
            </div>
        `;
    }

    renderCharts(list) {
        const labels = list.map(d => d.work_date.slice(5));
        const txtColor = getComputedStyle(document.body).getPropertyValue('--text-dim');
        const gridColor = getComputedStyle(document.body).getPropertyValue('--border');

        const baseOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: txtColor } } },
            scales: {
                x: { ticks: { color: txtColor }, grid: { color: gridColor } },
                y: { ticks: { color: txtColor }, grid: { color: gridColor } }
            }
        };

        // Main Trend Chart
        if (this.state.charts.main) this.state.charts.main.destroy();
        this.state.charts.main = new Chart(document.getElementById('mainChart'), {
            data: {
                labels,
                datasets: [
                    { type: 'line', label: 'PPM (우측)', data: list.map(d => d.actual_qty ? Math.round(d.defect_qty/d.actual_qty*1e6) : 0), borderColor: '#f87171', yAxisID: 'y1' },
                    { type: 'bar', label: '생산량', data: list.map(d => d.actual_qty), backgroundColor: '#3b82f6' }
                ]
            },
            options: { ...baseOptions, scales: { ...baseOptions.scales, y1: { position: 'right', grid: { display: false } } } }
        });

        // Pareto Chart
        const defectSums = { sq:0, sc:0, co:0, sp:0, ti:0, et:0 };
        list.forEach(d => {
            const det = d.defect_details || {};
            Object.keys(defectSums).forEach(k => defectSums[k] += (det[k] || 0));
        });
        const sortedDefects = Object.entries(defectSums).sort((a,b) => b[1] - a[1]);

        if (this.state.charts.defect) this.state.charts.defect.destroy();
        this.state.charts.defect = new Chart(document.getElementById('defectChart'), {
            type: 'bar',
            data: {
                labels: sortedDefects.map(d => d[0].toUpperCase()),
                datasets: [{ label: '불량 건수', data: sortedDefects.map(d => d[1]), backgroundColor: '#818cf8' }]
            },
            options: baseOptions
        });
    }

    // --- Input & Management ---
    async handleManualInput(e) {
        e.preventDefault();
        const payload = {
            partner_id: this.state.partner.id,
            work_date: document.getElementById('input-date').value,
            target_qty: parseInt(document.getElementById('input-target').value) || 0,
            actual_qty: parseInt(document.getElementById('input-actual').value) || 0,
            defect_qty: parseInt(document.getElementById('input-defect').value) || 0
        };

        const { error } = await this.supabase.from('production_actuals').upsert(payload, { onConflict: 'partner_id, work_date' });
        if (error) alert('저장 실패: ' + error.message);
        else {
            this.showToast('데이터가 저장되었습니다.');
            this.refreshData();
            e.target.reset();
        }
    }

    excelDateToJSDate(serial) {
        if (!serial) return null;
        if (typeof serial === 'string' && serial.includes('-')) return serial;
        try {
            const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
            return date.toISOString().split('T')[0];
        } catch (e) {
            return serial;
        }
    }

    handleFileSelection(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            
            // 삼진가스켓 R07/R08 양식 매핑
            this.state.tempRows = rows.slice(2).map(r => {
                const work_date = this.excelDateToJSDate(r[3]);
                if (!work_date) return null;

                return {
                    partner_id: this.state.partner.id,
                    work_date: work_date,
                    target_qty: parseInt(r[7]) || 0,
                    actual_qty: parseInt(r[7]) || 0,
                    defect_qty: parseInt(r[31]) || 0,
                    defect_details: { 
                        sq: parseInt(r[32]) || 0, 
                        sc: parseInt(r[33]) || 0, 
                        co: parseInt(r[34]) || 0, 
                        sp: parseInt(r[35]) || 0, 
                        ti: parseInt(r[36]) || 0, 
                        et: parseInt(r[37]) || 0 
                    },
                    machine_data: { 
                        s5: r[8], s6: r[9], j1: r[13], j2: r[14], j3: r[15] 
                    },
                    remark: r[38] || ''
                };
            }).filter(r => r !== null);

            document.getElementById('upload-preview').style.display = 'block';
            document.getElementById('preview-filename').innerText = file.name;
            document.getElementById('preview-count').innerText = `${this.state.tempRows.length} 행 발견됨`;
        };
        reader.readAsArrayBuffer(file);
    }

    async saveUploadedData() {
        if (!this.state.tempRows) return;
        const { error } = await this.supabase.from('production_actuals').upsert(this.state.tempRows, { onConflict: 'partner_id, work_date' });
        if (error) alert('업로드 실패: ' + error.message);
        else {
            this.showToast('성공적으로 업로드되었습니다.');
            document.getElementById('upload-preview').style.display = 'none';
            this.refreshData();
        }
    }

    renderHistory() {
        const body = document.getElementById('history-body');
        body.innerHTML = this.state.data.slice(0, 15).map(d => {
            const achieve = d.target_qty ? Math.round(d.actual_qty/d.target_qty*100) : 0;
            const ppm = d.actual_qty ? Math.round(d.defect_qty/d.actual_qty*1e6) : 0;
            return `
                <tr>
                    <td>${d.work_date}</td>
                    <td>${d.target_qty.toLocaleString()}</td>
                    <td>${d.actual_qty.toLocaleString()}</td>
                    <td>${d.defect_qty.toLocaleString()}</td>
                    <td>${achieve}%</td>
                    <td>${ppm.toLocaleString()}</td>
                    <td>
                        <button class="btn-sm" onclick="app.editRow(${d.id})"><i class="fas fa-edit"></i></button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    switchTab(tabId) {
        this.state.activeTab = tabId;
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.getElementById(`tab-${tabId}`).classList.add('active');
        document.querySelectorAll('.nav-links li').forEach(li => li.classList.toggle('active', li.dataset.tab === tabId));
        
        const titles = { 'dashboard': '종합 대시보드', 'data-mgmt': '데이터 통합 관리', 'settings': '시스템 설정' };
        document.getElementById('page-title').innerText = titles[tabId];
        this.renderUI();
    }

    showToast(msg) {
        const t = document.createElement('div');
        t.className = 'toast';
        t.innerText = msg;
        document.getElementById('toast-container').appendChild(t);
        setTimeout(() => t.remove(), 3000);
    }
}

// Global instance
const app = new JMLMES();
