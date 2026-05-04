/**
 * JML MES System v10.7
 * Optimized for RBAC, Security and Mobile Experience
 */

class JMLMES {
    constructor() {
        this.supabase = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
        this.state = {
            user: null,
            profile: null,
            partner: null,
            allPartners: [],
            dateMode: 'monthly',
            selectedDate: '',
            activeTab: 'dashboard'
        };
        this.init();
    }

    async init() {
        this.log('JML MES System: Initializing...', 'system');
        this.bindEvents();
        await this.checkAuth();
        this.log('JML MES System v10.7 Finalized.', 'system');
    }

    log(msg, type = 'info') {
        const consoleEl = document.getElementById('debug-console');
        if (!consoleEl) return;
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
        consoleEl.prepend(entry);
        console.log(`[${type.toUpperCase()}] ${msg}`);
    }

    bindEvents() {
        // Login
        document.getElementById('btn-login').onclick = () => this.handleLogin();
        document.getElementById('login-pw').onkeypress = (e) => { if (e.key === 'Enter') this.handleLogin(); };

        // Logout
        document.getElementById('btn-logout').onclick = () => this.handleLogout();

        // Tabs
        document.querySelectorAll('.nav-links li').forEach(li => {
            li.onclick = () => this.switchTab(li.getAttribute('data-tab'));
        });

        // Settings
        const btnSaveSettings = document.getElementById('btn-save-settings');
        if (btnSaveSettings) btnSaveSettings.onclick = () => this.saveSettings();

        // Password Modal
        const btnProfile = document.getElementById('btn-profile');
        const pwModal = document.getElementById('password-modal');
        const btnClosePwModal = document.getElementById('btn-close-password-modal');
        const btnChangePwModal = document.getElementById('btn-modal-change-password');

        if (btnProfile) btnProfile.onclick = () => { 
            const emailEl = document.getElementById('modal-user-email');
            if (emailEl) emailEl.innerText = this.state.user?.email || '';
            pwModal.style.display = 'flex'; 
        };
        if (btnClosePwModal) btnClosePwModal.onclick = () => { pwModal.style.display = 'none'; };
        if (btnChangePwModal) btnChangePwModal.onclick = () => this.handleChangePassword();

        // Sidebar Collapse
        const btnCollapse = document.getElementById('btn-sidebar-collapse');
        const sidebar = document.querySelector('.sidebar');
        if (btnCollapse) {
            btnCollapse.onclick = () => {
                sidebar.classList.toggle('collapsed');
            };
        }

        // Global Modal Close
        window.onclick = (event) => {
            if (event.target == pwModal) pwModal.style.display = 'none';
            const manualModal = document.getElementById('manual-input-modal');
            if (event.target == manualModal) manualModal.style.display = 'none';
        };

        // Refresh
        document.getElementById('btn-refresh').onclick = () => this.refreshData();

        // Date Filters
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.updateDateInputMode(btn.getAttribute('data-mode'));
            };
        });
    }

    async checkAuth() {
        const { data: { session } } = await this.supabase.auth.getSession();
        if (session) {
            await this.onAuthenticated(session.user);
        } else {
            document.getElementById('login-overlay').style.display = 'flex';
            document.getElementById('app-container').style.display = 'none';
        }
    }

    async handleLogin() {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-pw').value;
        const btn = document.getElementById('btn-login');
        if (!email || !password) return alert('아이디와 비밀번호를 입력해 주세요.');
        
        btn.disabled = true;
        btn.innerText = '인증 중...';
        
        try {
            const { error } = await this.supabase.auth.signInWithPassword({ email, password });
            if (error) { 
                const msg = error.message === 'Invalid login credentials' ? '이메일 또는 비밀번호가 일치하지 않습니다.' : error.message;
                alert('인증 실패: ' + msg); 
                btn.disabled = false;
                btn.innerText = '로그인'; 
            }
        } catch (err) {
            btn.disabled = false;
            btn.innerText = '로그인';
        }
    }

    async onAuthenticated(user) {
        try {
            document.getElementById('login-overlay').style.display = 'none';
            document.getElementById('app-container').style.display = 'flex';
            
            this.state.user = user;
            this.log('인증 성공: ' + user.email, 'system');
            
            const { data: profile } = await this.supabase.from('profiles').select('*').eq('id', user.id).single();
            
            let role = profile?.role || 'operator';
            if (user.email.endsWith('@jml.com')) role = 'super_admin';
            this.state.profile = { ...profile, role };
            
            const nameEl = document.getElementById('user-display-name');
            const roleEl = document.getElementById('user-role');
            if (nameEl) nameEl.innerText = profile?.full_name || user.email.split('@')[0];
                if (roleEl) roleEl.innerText = roleLabels[role] || 'User';
            }

            if (role === 'super_admin') {
                const { data: allPartners } = await this.supabase.from('partners').select('*');
                this.state.allPartners = allPartners || [];
                if (this.state.allPartners.length > 0) this.state.partner = this.state.allPartners[0];
                this.renderPartnerSwitcher();
            } else if (profile?.partner_id) {
                const { data: partner } = await this.supabase.from('partners').select('*').eq('id', profile.partner_id).single();
                this.state.partner = partner;
            }

            if (this.state.partner) {
                this.log(`접속 업체: ${this.state.partner.company_name || this.state.partner.name}`, 'info');
                this.applyUIGuard(role);
                await this.loadConfig();
                await this.refreshData();
            } else {
                this.applyUIGuard(role);
                this.log('업체 정보가 없습니다.', 'warning');
            }
        } catch (err) {
            this.log(`초기화 오류: ${err.message}`, 'error');
            alert(`시스템 초기화 오류: ${err.message}`);
        }
    }

    async handleLogout() {
        await this.supabase.auth.signOut();
        location.reload();
    }

    applyUIGuard(role) {
        document.querySelectorAll('.nav-links li').forEach(li => {
            const tab = li.getAttribute('data-tab');
            li.style.display = (role === 'operator' && tab !== 'dashboard' && tab !== 'quality-data') ? 'none' : 'flex';
        });

        // Hide upload bar from dashboard if needed via CSS or JS
        // (Moved to Quality tab in index.html, so it won't show on dashboard)
    }

    switchTab(tabId) {
        this.state.activeTab = tabId;
        document.querySelectorAll('.nav-links li').forEach(li => li.classList.toggle('active', li.getAttribute('data-tab') === tabId));
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.toggle('active', tab.id === `tab-${tabId}`));
        
        const titles = { 'dashboard': 'Dashboard Summary', 'quality-data': 'Quality Data Management', 'settings': 'System Settings' };
        const titleEl = document.getElementById('page-title');
        if (titleEl) titleEl.innerText = titles[tabId] || 'JML MES';
        
        if (tabId === 'dashboard') this.refreshData();
    }

    updateDateInputMode(mode) {
        this.state.dateMode = mode;
        const container = document.getElementById('date-input-container');
        if (!container) return;
        
        const today = new Date().toISOString().split('T')[0];
        container.innerHTML = '';

        const input = this.createDateInput(mode === 'monthly' ? 'month' : (mode === 'yearly' ? 'number' : 'date'), 'date-picker-main', today);
        if (input) container.appendChild(input);
        this.state.selectedDate = today;
    }

    createDateInput(type, id, value) {
        const input = document.createElement('input');
        input.type = type;
        input.id = id;
        input.value = value;
        input.className = 'custom-date-picker-compact';
        input.onchange = () => { this.state.selectedDate = input.value; this.refreshData(); };
        return input;
    }

    async refreshData() {
        this.log(`데이터 새로고침 중... (${this.state.dateMode})`, 'info');
        if (this.state.activeTab === 'dashboard') {
            await this.loadDashboardStats();
        } else if (this.state.activeTab === 'quality-data') {
            await this.loadQualityHistory();
        }
    }

    renderPartnerSwitcher() {
        const container = document.getElementById('partner-switcher-container');
        if (!container || this.state.allPartners.length === 0) return;

        container.innerHTML = `
            <select id="select-partner" class="partner-select">
                ${this.state.allPartners.map(p => `<option value="${p.id}" ${this.state.partner?.id === p.id ? 'selected' : ''}>${p.company_name || p.name}</option>`).join('')}
            </select>
        `;

        document.getElementById('select-partner').onchange = async (e) => {
            const partnerId = e.target.value;
            this.state.partner = this.state.allPartners.find(p => p.id === partnerId);
            this.log(`업체 전환: ${this.state.partner.company_name || this.state.partner.name}`, 'info');
            await this.refreshData();
        };
    }

    async loadDashboardStats() {
        if (!this.state.partner) return;
        this.log('대시보드 통계 계산 중...', 'info');
        
        let query = this.supabase.from('production_actuals').select('*').eq('partner_id', this.state.partner.id);
        
        // Date Filtering
        const dateVal = this.state.selectedDate || new Date().toISOString().split('T')[0];
        if (this.state.dateMode === 'monthly') {
            const [year, month] = dateVal.split('-');
            query = query.gte('work_date', `${year}-${month}-01`).lte('work_date', `${year}-${month}-31`);
        } else if (this.state.dateMode === 'yearly') {
            const year = dateVal.split('-')[0];
            query = query.gte('work_date', `${year}-01-01`).lte('work_date', `${year}-12-31`);
        } else {
            query = query.eq('work_date', dateVal);
        }

        const { data, error } = await query.order('work_date', { ascending: true });
        if (error) return this.log('데이터 로드 실패: ' + error.message, 'error');

        // Calculate Totals
        const totalProd = data.reduce((sum, r) => sum + (r.actual_qty || 0), 0);
        const totalDefect = data.reduce((sum, r) => sum + (r.defect_qty || 0), 0);
        const ppm = totalProd > 0 ? Math.round((totalDefect / totalProd) * 1000000) : 0;
        const target = CONFIG.thresholds.monthlyTarget || 4500000;
        const achievement = Math.round((totalProd / target) * 100);

        this.renderKPICards(totalProd, ppm, achievement);
        this.renderCharts(data);
    }

    renderKPICards(total, ppm, achievement) {
        const container = document.getElementById('kpi-container');
        if (!container) return;
        
        container.innerHTML = `
            <div class="kpi-card">
                <div class="label">총 생산량</div>
                <div class="value">${total.toLocaleString()}</div>
                <div class="unit">EA</div>
            </div>
            <div class="kpi-card ${ppm > (CONFIG.thresholds.ppm || 500) ? 'warning' : ''}">
                <div class="label">종합 불량률 (PPM)</div>
                <div class="value">${ppm.toLocaleString()}</div>
                <div class="unit">PPM</div>
            </div>
            <div class="kpi-card">
                <div class="label">목표 달성률</div>
                <div class="value">${achievement}%</div>
                <div class="unit">Target: ${(CONFIG.thresholds.monthlyTarget/10000).toLocaleString()}만</div>
            </div>
        `;
    }

    renderCharts(data) {
        // Main Trend Chart
        const ctxMain = document.getElementById('mainChart');
        if (!ctxMain) return;
        
        if (this.charts?.main) this.charts.main.destroy();
        if (!this.charts) this.charts = {};

        this.charts.main = new Chart(ctxMain, {
            type: 'line',
            data: {
                labels: data.map(r => r.work_date.split('-').slice(1).join('/')),
                datasets: [
                    {
                        label: '생산량',
                        data: data.map(r => r.actual_qty),
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        yAxisID: 'y',
                        fill: true
                    },
                    {
                        label: 'PPM',
                        data: data.map(r => r.actual_qty > 0 ? Math.round((r.defect_qty / r.actual_qty) * 1000000) : 0),
                        borderColor: '#ef4444',
                        borderDash: [5, 5],
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { type: 'linear', position: 'left', title: { display: true, text: '생산량 (EA)' } },
                    y1: { type: 'linear', position: 'right', title: { display: true, text: 'PPM' }, grid: { drawOnChartArea: false } }
                }
            }
        });
    }

    async loadQualityHistory() {
        if (!this.state.partner) return;
        this.log('품질 데이터 로드 중...', 'info');

        const { data, error } = await this.supabase
            .from('production_actuals')
            .select('*')
            .eq('partner_id', this.state.partner.id)
            .order('work_date', { ascending: false })
            .limit(100);

        if (error) return this.log('품질 데이터 로드 실패: ' + error.message, 'error');

        const container = document.getElementById('quality-table-container');
        if (!container) return;

        if (data.length === 0) {
            container.innerHTML = '<div class="no-data">데이터가 없습니다.</div>';
            return;
        }

        container.innerHTML = `
            <table class="quality-table">
                <thead>
                    <tr>
                        <th>일자</th>
                        <th>생산량</th>
                        <th>불량</th>
                        <th>PPM</th>
                        <th>탈거력(avg)</th>
                        <th>비고</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(r => {
                        const ppm = r.actual_qty > 0 ? Math.round((r.defect_qty / r.actual_qty) * 1000000) : 0;
                        return `
                            <tr>
                                <td>${r.work_date}</td>
                                <td>${(r.actual_qty || 0).toLocaleString()}</td>
                                <td class="${r.defect_qty > 0 ? 'text-red' : ''}">${(r.defect_qty || 0).toLocaleString()}</td>
                                <td class="${ppm > 500 ? 'text-orange' : ''}">${ppm.toLocaleString()}</td>
                                <td>${r.cap_pull_off || '-'}</td>
                                <td>${r.remarks || ''}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    async loadConfig() { 
        this.log('시스템 설정 로딩...', 'info'); 
        // Sync setting inputs with current thresholds
        const ppmInput = document.getElementById('set-ppm-limit');
        const targetInput = document.getElementById('sim-target-qty');
        if (ppmInput) ppmInput.value = CONFIG.thresholds.ppm;
        if (targetInput) targetInput.value = CONFIG.thresholds.monthlyTarget;
    }
    
    async handleChangePassword() { this.log('비밀번호 변경 기능은 준비 중입니다.', 'info'); }
    async saveSettings() { 
        this.log('설정이 로컬에 반영되었습니다. (서버 동기화 준비 중)', 'success'); 
        this.refreshData();
    }
}

const app = new JMLMES();
