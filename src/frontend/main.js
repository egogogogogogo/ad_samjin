/**
 * JML MES System v10.8
 * Refactored for Modularity & Structural Stability
 */

class JMLMES {
    constructor() {
        // Initialize Core Clients (using names from config.js)
        this.supabase = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
        
        // Modules (Structural Isolation)
        this.auth = new AuthManager(this.supabase);
        this.api = new APIManager(this.supabase);

        this.state = {
            user: null,
            profile: null,
            partner: null,
            allPartners: [],
            dateMode: 'monthly',
            selectedDate: new Date().toISOString().split('T')[0],
            activeTab: 'dashboard',
            charts: {}
        };
        this.setupAuthListener();
        this.init();
    }

    setupAuthListener() {
        this.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
                if (session) await this.onAuthenticated(session.user);
            } else if (event === 'SIGNED_OUT') {
                this.showLogin();
            }
        });
    }

    async init() {
        this.log('JML MES: UI Engine Initializing...', 'system');
        this.bindEvents();
        await this.checkAuth();
        this.log('JML MES: System Ready.', 'system');
    }

    log(msg, type = 'info') {
        const consoleEl = document.getElementById('debug-console');
        if (!consoleEl) return;
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
        consoleEl.prepend(entry);
    }

    bindEvents() {
        // Auth
        const btnLogin = document.getElementById('btn-login');
        if (btnLogin) btnLogin.onclick = () => this.handleLogin();
        const inputPw = document.getElementById('login-pw');
        if (inputPw) inputPw.onkeypress = (e) => { if (e.key === 'Enter') this.handleLogin(); };
        const btnLogout = document.getElementById('btn-logout');
        if (btnLogout) btnLogout.onclick = () => this.auth.signOut();

        // Tabs
        document.querySelectorAll('.nav-links li').forEach(li => {
            li.onclick = () => this.switchTab(li.getAttribute('data-tab'));
        });

        // Sidebar
        const btnCollapse = document.getElementById('btn-sidebar-collapse');
        const sidebar = document.querySelector('.sidebar');
        if (btnCollapse && sidebar) {
            btnCollapse.onclick = () => sidebar.classList.toggle('collapsed');
        }

        // Global Refresh
        const btnRefresh = document.getElementById('btn-refresh');
        if (btnRefresh) btnRefresh.onclick = () => this.refreshData();

        // Date Modes
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.updateDateInputMode(btn.getAttribute('data-mode'));
            };
        });

        // Profile Modal
        const btnProfile = document.getElementById('btn-profile');
        const pwModal = document.getElementById('password-modal');
        if (btnProfile && pwModal) {
            btnProfile.onclick = () => {
                const emailEl = document.getElementById('modal-user-email');
                if (emailEl) emailEl.innerText = this.state.user?.email || '';
                pwModal.style.display = 'flex';
            };
        }
        const btnClosePw = document.getElementById('btn-close-password-modal');
        if (btnClosePw) btnClosePw.onclick = () => { pwModal.style.display = 'none'; };
    }

    async checkAuth() {
        const session = await this.auth.getSession();
        if (session) {
            await this.onAuthenticated(session.user);
        } else {
            this.showLogin();
        }
    }

    showLogin() {
        const overlay = document.getElementById('login-overlay');
        const app = document.getElementById('app-container');
        if (overlay) overlay.style.display = 'flex';
        if (app) app.style.display = 'none';
        
        const btn = document.getElementById('btn-login');
        if (btn) {
            btn.disabled = false;
            btn.innerText = '로그인';
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
            const { error } = await this.auth.signIn(email, password);
            if (error) {
                alert('인증 실패: ' + error.message);
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
            const overlay = document.getElementById('login-overlay');
            const app = document.getElementById('app-container');
            if (overlay) overlay.style.display = 'none';
            if (app) app.style.display = 'flex';
            
            this.state.user = user;
            this.log('인증 성공: ' + user.email, 'system');
            
            const profile = await this.auth.getProfile(user.id);
            const role = profile.role;
            
            // UI Update (Safe with null checks)
            const nameEl = document.getElementById('user-display-name');
            const roleEl = document.getElementById('user-role');
            if (nameEl) nameEl.innerText = profile?.full_name || user.email.split('@')[0];
            if (roleEl) {
                const labels = this.auth.getRoleLabels();
                roleEl.innerText = labels[role] || 'User';
            }

            if (role === 'super_admin') {
                this.state.allPartners = await this.api.getPartners();
                if (this.state.allPartners.length > 0) this.state.partner = this.state.allPartners[0];
                this.renderPartnerSwitcher();
            } else if (profile?.partner_id) {
                this.state.partner = await this.api.getPartnerById(profile.partner_id);
            }

            if (this.state.partner) {
                this.log(`접속 업체: ${this.state.partner.company_name || this.state.partner.name}`, 'info');
                this.applyUIGuard(role);
                this.refreshData();
            } else {
                this.applyUIGuard(role);
                this.log('업체 정보가 없습니다.', 'warning');
            }
        } catch (err) {
            this.log(`초기화 오류: ${err.message}`, 'error');
            alert(`시스템 초기화 오류: ${err.message}`);
        }
    }

    applyUIGuard(role) {
        document.querySelectorAll('.nav-links li').forEach(li => {
            const tab = li.getAttribute('data-tab');
            li.style.display = (role === 'operator' && tab !== 'dashboard' && tab !== 'quality-data') ? 'none' : 'flex';
        });
    }

    renderPartnerSwitcher() {
        const container = document.getElementById('partner-switcher-container');
        if (!container || this.state.allPartners.length === 0) return;

        container.innerHTML = `
            <select id="select-partner" class="partner-select">
                ${this.state.allPartners.map(p => `<option value="${p.id}" ${this.state.partner?.id === p.id ? 'selected' : ''}>${p.company_name || p.name}</option>`).join('')}
            </select>
        `;

        const select = document.getElementById('select-partner');
        if (select) {
            select.onchange = async (e) => {
                const partnerId = e.target.value;
                this.state.partner = this.state.allPartners.find(p => p.id === partnerId);
                this.log(`업체 전환: ${this.state.partner.company_name || this.state.partner.name}`, 'info');
                await this.refreshData();
            };
        }
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
        const input = document.createElement('input');
        input.type = mode === 'monthly' ? 'month' : (mode === 'yearly' ? 'number' : 'date');
        input.value = mode === 'yearly' ? new Date().getFullYear() : (mode === 'monthly' ? today.slice(0, 7) : today);
        input.className = 'custom-date-picker-compact';
        input.onchange = () => { this.state.selectedDate = input.value; this.refreshData(); };
        container.appendChild(input);
        this.state.selectedDate = input.value;
    }

    async refreshData() {
        if (this.state.activeTab === 'dashboard') {
            await this.loadDashboardStats();
        } else if (this.state.activeTab === 'quality-data') {
            await this.loadQualityHistory();
        }
    }

    async loadDashboardStats() {
        if (!this.state.partner) return;
        try {
            const data = await this.api.getProductionData(this.state.partner.id, this.state.dateMode, this.state.selectedDate);
            
            // Calculation
            const totalProd = data.reduce((sum, r) => sum + (r.actual_qty || 0), 0);
            const totalDefect = data.reduce((sum, r) => sum + (r.defect_qty || 0), 0);
            const ppm = totalProd > 0 ? Math.round((totalDefect / totalProd) * 1000000) : 0;
            const target = CONFIG.thresholds.monthlyTarget || 4500000;
            const achievement = Math.round((totalProd / target) * 100);

            this.renderKPICards(totalProd, ppm, achievement);
            this.renderCharts(data);
        } catch (err) {
            this.log('데이터 분석 실패: ' + err.message, 'error');
        }
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
        const ctxMain = document.getElementById('mainChart');
        if (!ctxMain) return;
        
        if (this.state.charts.main) this.state.charts.main.destroy();

        this.state.charts.main = new Chart(ctxMain, {
            type: 'line',
            data: {
                labels: data.map(r => r.work_date.split('-').slice(1).join('/')),
                datasets: [
                    { label: '생산량', data: data.map(r => r.actual_qty), borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', yAxisID: 'y', fill: true },
                    { label: 'PPM', data: data.map(r => r.actual_qty > 0 ? Math.round((r.defect_qty / r.actual_qty) * 1000000) : 0), borderColor: '#ef4444', borderDash: [5, 5], yAxisID: 'y1' }
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
        try {
            const data = await this.api.getQualityHistory(this.state.partner.id);
            const container = document.getElementById('quality-table-container');
            if (!container) return;

            if (data.length === 0) {
                container.innerHTML = '<div class="no-data">데이터가 없습니다.</div>';
                return;
            }

            container.innerHTML = `
                <table class="quality-table">
                    <thead><tr><th>일자</th><th>생산량</th><th>불량</th><th>PPM</th><th>탈거력(avg)</th><th>비고</th></tr></thead>
                    <tbody>
                        ${data.map(r => {
                            const ppm = r.actual_qty > 0 ? Math.round((r.defect_qty / r.actual_qty) * 1000000) : 0;
                            return `<tr>
                                <td>${r.work_date}</td>
                                <td>${(r.actual_qty || 0).toLocaleString()}</td>
                                <td class="${r.defect_qty > 0 ? 'text-red' : ''}">${(r.defect_qty || 0).toLocaleString()}</td>
                                <td class="${ppm > 500 ? 'text-orange' : ''}">${ppm.toLocaleString()}</td>
                                <td>${r.cap_pull_off || '-'}</td>
                                <td>${r.remarks || ''}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            `;
        } catch (err) {
            this.log('이력 조회 실패: ' + err.message, 'error');
        }
    }
}

// Global Instance
const app = new JMLMES();
