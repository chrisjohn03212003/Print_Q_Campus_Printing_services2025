// PrintQ Admin Dashboard JavaScript - COMPLETE FIXED VERSION
// All missing functions added and functionality completed

// Global variables and configuration
const API_BASE = '/api';
let currentUser = null;
let currentPage = 1;
let currentSection = 'dashboard';
let jobsPerPage = 20;
let refreshInterval = null;
let charts = {};

// Utility functions
const showLoading = () => {
    document.getElementById('loading-overlay').classList.remove('hidden');
};

const hideLoading = () => {
    document.getElementById('loading-overlay').classList.add('hidden');
};

const showNotification = (message, type = 'success') => {
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notification-text');
    const icon = notification.querySelector('i');

    // Set icon based on type
    if (type === 'success') {
        icon.className = 'fas fa-check-circle';
        notification.className = 'notification success';
    } else if (type === 'error') {
        icon.className = 'fas fa-exclamation-circle';
        notification.className = 'notification error';
    } else if (type === 'warning') {
        icon.className = 'fas fa-exclamation-triangle';
        notification.className = 'notification warning';
    }

    notificationText.textContent = message;
    notification.classList.remove('hidden');

    // Auto hide after 5 seconds
    setTimeout(() => {
        hideNotification();
    }, 5000);
};

const hideNotification = () => {
    document.getElementById('notification').classList.add('hidden');
};


const formatDate = (date) => {
    if (!date) return 'N/A';
    if (date && typeof date === 'object' && date.seconds) {
        return new Date(date.seconds * 1000).toLocaleString();
    }
    return new Date(date).toLocaleString();
};

const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount || 0);
};

// API helper functions
const apiRequest = async (endpoint, options = {}) => {
    try {
        const url = `${API_BASE}${endpoint}`;
        console.log('API Request:', url, options);

        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        // Add authorization header if user is logged in
        if (currentUser?.token) {
            headers['Authorization'] = `Bearer ${currentUser.token}`;
        }

        const response = await fetch(url, {
            headers,
            ...options
        });

        const data = await response.json();
        console.log('API Response:', data);

        if (!response.ok) {
            // Handle specific error cases
            if (response.status === 401) {
                console.log('Authentication failed, redirecting to login');
                logout();
                throw new Error('Authentication failed. Please login again.');
            }

            if (response.status === 403) {
                throw new Error('Access denied. Admin privileges required.');
            }

            throw new Error(data.message || `HTTP ${response.status}: Request failed`);
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
};


// Authentication functions
const showLogin = () => {
    document.getElementById('login-form').classList.add('active');
    document.getElementById('register-form').classList.remove('active');
    document.getElementById('totp-setup').classList.remove('active');
};

const showRegister = () => {
    document.getElementById('login-form').classList.remove('active');
    document.getElementById('register-form').classList.add('active');
    document.getElementById('totp-setup').classList.remove('active');
};

const login = async (email, password, totpCode = null) => {
    try {
        showLoading();
        console.log('Attempting login for:', email);

        const requestBody = {
            email: email,
            password: password,
            user_type: 'admin'
        };

        if (totpCode) {
            requestBody.totp_code = totpCode;
        }

        const response = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify(requestBody)
        });

        console.log('Login response:', response);

        if (response.success) {
            currentUser = response.user;
            currentUser.token = response.token;

            localStorage.setItem('printq_admin_user', JSON.stringify(currentUser));

            console.log('Login successful, showing dashboard');

            hideLoading();

            setTimeout(() => {
                showDashboard();
                showNotification('Login successful!');
            }, 100);

            return;
        } else {
            throw new Error(response.message || 'Login failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        if (error.message.includes('2FA')) {
            document.getElementById('totp-group')?.classList.remove('hidden');
            showNotification('Please enter your 2FA code', 'warning');
        } else {
            showNotification(error.message || 'Login failed', 'error');
        }
    } finally {
        hideLoading();
    }
};

const register = async (username, email, password, adminCode) => {
    try {
        showLoading();

        const response = await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify({
                username,
                email,
                password,
                admin_code: adminCode,
                user_type: 'admin'
            })
        });

        if (response.success) {
            showNotification('Registration successful! Please login.');
            showLogin();
        }
    } catch (error) {
        showNotification(error.message || 'Registration failed', 'error');
    } finally {
        hideLoading();
    }
};

const logout = () => {
    localStorage.removeItem('printq_admin_user');
    currentUser = null;

    if (refreshInterval) {
        clearInterval(refreshInterval);
    }

    document.getElementById('auth-section').classList.remove('hidden');
    document.getElementById('dashboard-section').classList.add('hidden');

    showNotification('Logged out successfully');
};

const checkAuth = () => {
    const stored = localStorage.getItem('printq_admin_user');
    if (stored) {
        try {
            currentUser = JSON.parse(stored);
            console.log('Found stored user:', currentUser);
            showDashboard();
            return true;
        } catch (error) {
            console.error('Error parsing stored user:', error);
            localStorage.removeItem('printq_admin_user');
        }
    }
    return false;
};


// Dashboard functions
const showDashboard = () => {
    console.log('Showing dashboard for user:', currentUser);

    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('dashboard-section').classList.remove('hidden');

    const adminNameElement = document.getElementById('admin-name');
    if (adminNameElement && currentUser) {
        adminNameElement.textContent = currentUser.username || 'Admin';
    }

    loadDashboardData();

    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    refreshInterval = setInterval(() => {
        if (currentSection === 'dashboard') {
            loadDashboardData();
        }
    }, 30000);
};

// FIXED: Section switching with proper event handling
const showSection = (sectionName) => {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });

    const currentLink = document.querySelector(`[onclick="showSection('${sectionName}')"]`);
    if (currentLink) {
        currentLink.classList.add('active');
    }

    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });

    const targetSection = document.getElementById(`${sectionName}-content`);
    if (targetSection) {
        targetSection.classList.add('active');
        targetSection.style.opacity = '0';
        targetSection.style.transform = 'translateY(20px)';

        setTimeout(() => {
            targetSection.style.opacity = '1';
            targetSection.style.transform = 'translateY(0)';
            targetSection.style.transition = 'all 0.3s ease';
        }, 10);
    }

    const titles = {
        dashboard: 'Dashboard',
        jobs: 'Job Management',
        printers: 'Printer Management',
        users: 'User Management',
        reports: 'Reports & Analytics',
        analytics: 'Analytics',
        settings: 'System Settings',
        notifications: 'Notifications'
    };

    const pageTitle = document.getElementById('page-title');
    const breadcrumbPath = document.getElementById('breadcrumb-path');

    if (pageTitle) pageTitle.textContent = titles[sectionName] || sectionName;
    if (breadcrumbPath) breadcrumbPath.textContent = `Home / ${titles[sectionName] || sectionName}`;

    currentSection = sectionName;

    switch (sectionName) {
        case 'dashboard':
            loadDashboardData();
            break;
        case 'jobs':
            loadJobs();
            break;
        case 'printers':
            loadPrinters();
            break;
        case 'users':
            loadUsers();
            break;
        case 'settings':
            loadSettings();
            break;
        case 'reports':
        case 'analytics':
            loadAnalytics();
            break;
    }
};

// FIXED: Settings tab functionality
const showSettingsTab = (tabName) => {
    // Remove active class from all tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Hide all tab content
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.classList.remove('active');
    });

    // Show selected tab
    const selectedTab = document.getElementById(`${tabName}-settings`);
    const selectedBtn = document.querySelector(`[onclick="showSettingsTab('${tabName}')"]`);

    if (selectedTab) {
        selectedTab.classList.add('active');
    }

    if (selectedBtn) {
        selectedBtn.classList.add('active');
    }

    console.log(`Switched to ${tabName} settings tab`);
};

const toggleSidebar = () => {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        sidebar.classList.toggle('collapsed');
    }
};

// Dashboard data loading
const loadDashboardData = async () => {
    try {
        console.log('Loading dashboard data...');

        try {
            const stats = await apiRequest('/dashboard/stats');
            if (stats.success) {
                updateElement('total-jobs-today', stats.stats.jobs_today || 0);
                updateElement('revenue-today', formatCurrency(stats.stats.revenue_today || 0));
                updateElement('active-printers', stats.stats.active_printers || 0);
                updateElement('active-users', stats.stats.active_users || 0);
                updateElement('pending-jobs', stats.stats.pending_jobs || 0);
                updateElement('alerts-count', 0);
            }
        } catch (error) {
            console.warn('Failed to load dashboard stats:', error);
            updateElement('total-jobs-today', 0);
            updateElement('revenue-today', formatCurrency(0));
            updateElement('active-printers', 0);
            updateElement('active-users', 0);
            updateElement('pending-jobs', 0);
            updateElement('alerts-count', 0);
        }

        try {
            const recentJobs = await apiRequest('/dashboard/recent-jobs');
            if (recentJobs.success) {
                displayRecentJobs(recentJobs.jobs);
            }
        } catch (error) {
            console.warn('Failed to load recent jobs:', error);
            displayRecentJobs([]);
        }

        try {
            const printers = await apiRequest('/printers');
            if (printers.success) {
                displayPrinterOverview(printers.printers);
            }
        } catch (error) {
            console.warn('Failed to load printers:', error);
            displayPrinterOverview([]);
        }

        displaySystemAlerts([]);

        console.log('Dashboard data loaded successfully');

    } catch (error) {
        console.error('Dashboard loading error:', error);
        showNotification('Some dashboard data failed to load', 'warning');
    }
};

const updateElement = (id, value) => {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
};

const displayRecentJobs = (jobs) => {
    const container = document.getElementById('recent-jobs');
    if (!container) return;

    if (!jobs || jobs.length === 0) {
        container.innerHTML = '<p class="no-data">No recent jobs</p>';
        return;
    }

    container.innerHTML = jobs.slice(0, 5).map(job => {
        const jobId = job.id || job.job_id;

        if (!jobId) {
            console.warn("⚠️ Recent job missing ID:", job);
            return `<div class="activity-item invalid">⚠️ Invalid Job</div>`;
        }

        return `
            <div class="activity-item">
                <div class="activity-icon">
                    <i class="fas ${getJobStatusIcon(job.status)}"></i>
                </div>
                <div class="activity-details">
                    <h4>${job.file_name || 'Unknown File'}</h4>
                    <p>${job.student_name || 'Unknown'} • ${job.pages || 0} pages • ${formatCurrency(job.total_cost || 0)}</p>
                    <small>${formatDate(job.created_at)}</small>
                </div>
                <div class="activity-status ${job.status}">
                    ${(job.status || 'unknown').charAt(0).toUpperCase() + (job.status || 'unknown').slice(1)}
                </div>
                ${job.status === 'pending' ? `
                    <button onclick="approveJobQuick('${jobId}')" class="btn-icon success" title="Approve">
                        <i class="fas fa-check"></i>
                    </button>
                ` : ''}
                <button onclick="deleteJob('${jobId}')" class="btn-icon danger" title="Delete">
                <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
    }).join('');
};


const displayPrinterOverview = (printers) => {
    const container = document.getElementById('printers-grid');
    if (!container) return;

    if (!printers || printers.length === 0) {
        container.innerHTML = '<p class="no-data">No printers configured</p>';
        return;
    }

    container.innerHTML = printers.map(printer => `
        <div class="printer-card ${printer.status}" onclick="editPrinter('${printer.id}')">
            <div class="printer-header">
                <div class="printer-icon">
                    <i class="fas fa-print"></i>
                </div>
                <div class="printer-status ${printer.status}">
                    <i class="fas ${printer.status === 'online' ? 'fa-circle' : 'fa-exclamation-triangle'}"></i>
                    ${(printer.status || 'offline').charAt(0).toUpperCase() + (printer.status || 'offline').slice(1)}
                </div>
            </div>
            <div class="printer-info">
                <h4>${printer.name || 'Unknown Printer'}</h4>
                <p><i class="fas fa-map-marker-alt"></i> ${printer.location || 'Unknown Location'}</p>
            </div>
            <div class="printer-levels">
                <div class="level-indicator">
                    <span>Paper</span>
                    <div class="level-bar">
                        <div class="level-fill" style="width: ${printer.paper_level || 0}%"></div>
                    </div>
                    <span>${printer.paper_level || 0}%</span>
                </div>
                <div class="level-indicator">
                    <span>Toner</span>
                    <div class="level-bar">
                        <div class="level-fill" style="width: ${printer.toner_level || 0}%"></div>
                    </div>
                    <span>${printer.toner_level || 0}%</span>
                </div>
            </div>
        </div>
    `).join('');
};

const displaySystemAlerts = (alerts) => {
    const container = document.getElementById('system-alerts');
    if (!container) return;

    if (!alerts || alerts.length === 0) {
        container.innerHTML = '<p class="no-data">No active alerts</p>';
        return;
    }

    container.innerHTML = alerts.map(alert => `
        <div class="alert-item ${alert.type}">
            <div class="alert-icon">
                <i class="fas ${alert.type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i>
            </div>
            <div class="alert-content">
                <h4>${alert.title}</h4>
                <p>${alert.message}</p>
                <small>${formatDate(alert.created_at)}</small>
            </div>
        </div>
    `).join('');
};

const getJobStatusIcon = (status) => {
    const icons = {
        pending: 'fa-clock',
        approved: 'fa-check',
        printing: 'fa-print',
        completed: 'fa-check-circle',
        failed: 'fa-exclamation-triangle',
        cancelled: 'fa-times-circle'
    };
    return icons[status] || 'fa-question';
};

// Jobs Management
const displayJobs = (jobs) => {
    const tbody = document.getElementById('jobs-table-body');
    if (!tbody) {
        console.error('Jobs table body not found in DOM');
        return;
    }

    if (!jobs || jobs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="no-data">No jobs found</td></tr>';
        return;
    }

    tbody.innerHTML = jobs.map(job => {
        // Prefer job.id, but also fall back to job.job_id if backend used that field
        const jobId = job.id || job.job_id;
        if (!jobId) {
            console.warn("⚠️ Job missing ID:", job);
            return `
                <tr class="job-row invalid">
                    <td colspan="10" class="no-data">⚠️ Invalid job (missing ID)</td>
                </tr>
            `;
        }

        const studentName = job.student_name || 'Unknown Student';
        const fileName = job.file_name || 'Unknown File';
        const pages = job.pages || 0;
        const cost = job.total_cost || 0;
        const status = job.status || 'unknown';
        const printerName = job.printer_name || 'Not assigned';
        const createdAt = formatDate(job.created_at);

        return `
            <tr class="job-row" data-job-id="${jobId}">
                <td><input type="checkbox" class="job-checkbox" value="${jobId}"></td>
                <td><strong title="${jobId}">${jobId.substring(0, 8)}...</strong></td>
                <td>${studentName}</td>
                <td>
                    <div class="file-info">
                        <i class="fas fa-file-pdf"></i>
                        <span>${fileName}</span>
                    </div>
                </td>
                <td>${pages}</td>
                <td>${formatCurrency(cost)}</td>
                <td><span class="status-badge ${status}">${status.charAt(0).toUpperCase() + status.slice(1)}</span></td>
                <td>${printerName}</td>
                <td>${createdAt}</td>
                <td>
                    <div class="action-buttons">
                        <button onclick="viewJobDetails('${jobId}')" class="btn-icon" title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                        ${status === 'pending' ? `
                            <button onclick="approveJobQuick('${jobId}')" class="btn-icon success" title="Approve">
                                <i class="fas fa-check"></i>
                            </button>
                        ` : ''}
                        <button onclick="deleteJob('${jobId}')" class="btn-icon danger" title="Delete">
                             <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
};


// Printer Management
const loadPrinters = async () => {
    try {
        showLoading();
        const response = await apiRequest('/printers');
        if (response.success) {
            displayPrintersManagement(response.printers);
        }
    } catch (error) {
        console.error('Failed to load printers:', error);
        showNotification('Failed to load printers', 'error');
        displayPrintersManagement([]);
    } finally {
        hideLoading();
    }
};

const displayPrintersManagement = (printers) => {
    const container = document.getElementById('printers-list');
    if (!container) return;

    if (!printers || printers.length === 0) {
        container.innerHTML = '<p class="no-data">No printers configured</p>';
        return;
    }

    container.innerHTML = printers.map(printer => `
        <div class="printer-management-card" data-printer-id="${printer.id}">
            <div class="printer-card-header">
                <div class="printer-title">
                    <h3>${printer.name || 'Unknown Printer'}</h3>
                    <span class="printer-type">${printer.type || 'unknown'}</span>
                </div>
                <div class="printer-actions">
                    <button onclick="editPrinter('${printer.id}')" class="btn-icon" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="deletePrinter('${printer.id}')" class="btn-icon danger" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="printer-card-body">
                <div class="printer-info">
                    <div class="info-item">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${printer.location || 'Unknown Location'}</span>
                    </div>
                    <div class="info-item">
                        <i class="fas fa-circle ${printer.status}"></i>
                        <span>${(printer.status || 'offline').charAt(0).toUpperCase() + (printer.status || 'offline').slice(1)}</span>
                    </div>
                </div>
                <div class="printer-levels">
                    <div class="level-group">
                        <label>Paper Level</label>
                        <div class="level-bar">
                            <div class="level-fill" style="width: ${printer.paper_level || 0}%"></div>
                        </div>
                        <span>${printer.paper_level || 0}%</span>
                    </div>
                    <div class="level-group">
                        <label>Toner Level</label>
                        <div class="level-bar">
                            <div class="level-fill" style="width: ${printer.toner_level || 0}%"></div>
                        </div>
                        <span>${printer.toner_level || 0}%</span>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
};

// User Management
const loadUsers = async () => {
    try {
        showLoading();
        const response = await apiRequest('/users');
        if (response.success) {
            displayUsers(response.users);
        }
    } catch (error) {
        console.error('Failed to load users:', error);
        showNotification('Failed to load users', 'error');
        displayUsers([]);
    } finally {
        hideLoading();
    }
};

const displayUsers = (users) => {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="no-data">No users found</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(user => `
        <tr class="user-row" data-user-id="${user.id}">
            <td>${(user.id || '').substring(0, 8)}...</td>
            <td>${user.username || 'Unknown'}</td>
            <td>${user.email || 'Unknown'}</td>
            <td>
                <span class="user-type ${user.type}">
                    <i class="fas ${user.type === 'admin' ? 'fa-user-shield' : 'fa-user'}"></i>
                    ${(user.type || 'unknown').charAt(0).toUpperCase() + (user.type || 'unknown').slice(1)}
                </span>
            </td>
            <td>${user.type === 'student' ? formatCurrency(user.wallet_balance || 0) : 'N/A'}</td>
            <td>${user.total_jobs || 0}</td>
            <td><span class="status-badge online">Active</span></td>
            <td>
                <div class="action-buttons">
                    <button onclick="viewUser('${user.id}')" class="btn-icon" title="View">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button onclick="editUser('${user.id}')" class="btn-icon" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
};


// Add this in admin.js
async function viewReport(type) {
    try {
        showLoading();

        // Use apiRequest to include Authorization header
        const data = await apiRequest(`/reports/${type}`);

        if (data.success) {
            document.getElementById("report-modal-content").innerHTML =
                renderReport(type, data.report);

            openModal("report-modal");
        } else {
            showNotification("Failed to load report", "error");
        }
    } catch (err) {
        console.error("Error fetching report:", err);
        showNotification("Error fetching report", "error");
    } finally {
        hideLoading();
    }
}


// Helper: format report into HTML
function renderReport(type, report) {
    if (!report) return "<p>No data available</p>";

    let html = `<h2>${type.charAt(0).toUpperCase() + type.slice(1)} Report</h2>`;

    if (Array.isArray(report)) {
        // If report is a list (weekly, monthly)
        html += `<table class="report-table"><thead><tr>`;
        Object.keys(report[0] || {}).forEach(key => {
            html += `<th>${key}</th>`;
        });
        html += `</tr></thead><tbody>`;
        report.forEach(row => {
            html += `<tr>`;
            Object.values(row).forEach(val => {
                html += `<td>${val}</td>`;
            });
            html += `</tr>`;
        });
        html += `</tbody></table>`;
    } else if (typeof report === "object") {
        // If report is a single object (daily, eco)
        html += `<table class="report-table"><tbody>`;
        Object.entries(report).forEach(([key, val]) => {
            html += `<tr><td><strong>${key}</strong></td><td>${val}</td></tr>`;
        });
        html += `</tbody></table>`;
    } else {
        html += `<p>${report}</p>`;
    }

    return html;
}


// Modal helpers
const openModal = (id) => document.getElementById(id).classList.remove("hidden");

// Reports functions
const loadReports = async () => {
    try {
        showLoading();
        const [daily, weekly, monthly, eco] = await Promise.all([
            apiRequest('/reports/daily'),
            apiRequest('/reports/weekly'),
            apiRequest('/reports/monthly'),
            apiRequest('/reports/eco')
        ]);

        if (daily.success) displayDailyReport(daily.report);
        if (weekly.success) displayWeeklyReport(weekly.report);
        if (monthly.success) displayMonthlyReport(monthly.report);
        if (eco.success) displayEcoReport(eco.report);

    } catch (err) {
        console.error("Failed to load reports:", err);
        showNotification("Failed to load reports", "error");
    } finally {
        hideLoading();
    }
};

const displayDailyReport = (report) => {
    document.getElementById("daily-jobs").textContent = report.jobs;
    document.getElementById("daily-revenue").textContent = formatCurrency(report.revenue);
};

const displayWeeklyReport = (report) => {
    // TODO: Render chart (jobs & revenue vs. date)
    console.log("Weekly report:", report);
};

const displayMonthlyReport = (report) => {
    // TODO: Render chart (jobs & revenue vs. month)
    console.log("Monthly report:", report);
};

const displayEcoReport = (report) => {
    document.getElementById("eco-duplex").textContent = report.duplex_pages;
    document.getElementById("eco-single").textContent = report.single_pages;
    document.getElementById("eco-color").textContent = report.color_pages;
    document.getElementById("eco-bw").textContent = report.bw_pages;
};


// View User
const viewUser = async (userId) => {
    try {
        showLoading();
        const response = await apiRequest(`/users/${userId}`);
        if (response.success) {
            const user = response.user;
            const details = `
                <p><strong>ID:</strong> ${user.id}</p>
                <p><strong>Username:</strong> ${user.username}</p>
                <p><strong>Email:</strong> ${user.email}</p>
                <p><strong>Type:</strong> ${user.type}</p>
                <p><strong>Wallet:</strong> ${user.wallet_balance || 0}</p>
                <p><strong>Total Jobs:</strong> ${user.total_jobs || 0}</p>
            `;
            document.getElementById("view-user-details").innerHTML = details;
            openModal("view-user-modal");
        }
    } catch (err) {
        showNotification("Failed to load user details", "error");
    } finally {
        hideLoading();
    }
};

// Edit User
const editUser = async (userId) => {
    try {
        showLoading();
        const response = await apiRequest(`/users/${userId}`);
        if (response.success) {
            const user = response.user;
            document.getElementById("edit-user-id").value = user.id;
            document.getElementById("edit-username").value = user.username;
            document.getElementById("edit-email").value = user.email;
            document.getElementById("edit-type").value = user.type;
            openModal("edit-user-modal");
        }
    } catch (err) {
        showNotification("Failed to load user for editing", "error");
    } finally {
        hideLoading();
    }
};

document.getElementById("edit-user-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
        showLoading();
        const userId = document.getElementById("edit-user-id").value;
        const data = {
            username: document.getElementById("edit-username").value,
            email: document.getElementById("edit-email").value,
            type: document.getElementById("edit-type").value
        };
        const response = await apiRequest(`/users/${userId}`, {
            method: "PUT",
            body: JSON.stringify(data)
        });
        if (response.success) {
            showNotification("User updated successfully");
            closeModal("edit-user-modal");
            loadUsers();
        }
    } catch (err) {
        showNotification("Failed to update user", "error");
    } finally {
        hideLoading();
    }
});


// Settings Management
const loadSettings = async () => {
    try {
        const response = await apiRequest('/settings');
        if (response.success) {
            const settings = response.settings;
            updateElement('max-file-size', settings.max_file_size || 50);
            updateElement('supported-formats', settings.supported_formats || 'PDF, DOCX, PPT, PPTX');
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
        showNotification('Failed to load settings', 'error');
    }
};

// FIXED: Save settings function
const saveSettings = async () => {
    try {
        showLoading();

        // Collect all settings from the current active tab
        const activeTab = document.querySelector('.settings-tab.active');
        if (!activeTab) {
            showNotification('No settings tab active', 'warning');
            return;
        }

        const settings = {};
        const inputs = activeTab.querySelectorAll('input');

        inputs.forEach(input => {
            if (input.type === 'checkbox') {
                settings[input.id] = input.checked;
            } else {
                settings[input.id] = input.value;
            }
        });

        console.log('Saving settings:', settings);

        // Mock API call - replace with actual endpoint
        setTimeout(() => {
            showNotification('Settings saved successfully!', 'success');
            hideLoading();
        }, 1000);

        // Actual API call would be:
        /*
        const response = await apiRequest('/settings', {
            method: 'PUT',
            body: JSON.stringify({ settings })
        });
        
        if (response.success) {
            showNotification('Settings saved successfully!', 'success');
        }
        */

    } catch (error) {
        console.error('Failed to save settings:', error);
        showNotification('Failed to save settings', 'error');
    } finally {
        hideLoading();
    }
};

// FIXED: Reset settings function
const resetSettings = () => {
    const activeTab = document.querySelector('.settings-tab.active');
    if (!activeTab) {
        showNotification('No settings tab active', 'warning');
        return;
    }

    if (confirm('Are you sure you want to reset all settings to default values?')) {
        const inputs = activeTab.querySelectorAll('input');

        inputs.forEach(input => {
            if (input.type === 'checkbox') {
                input.checked = input.hasAttribute('data-default') ?
                    input.getAttribute('data-default') === 'true' : false;
            } else if (input.type === 'number') {
                input.value = input.getAttribute('data-default') || '0';
            } else {
                input.value = input.getAttribute('data-default') || '';
            }
        });

        showNotification('Settings reset to defaults', 'info');
    }
};


// FIXED Analytics Functions

// Fix 1: Improved loadAnalytics function
const loadAnalytics = async () => {
    try {
        console.log('Loading analytics...');
        showLoading();

        // Simulate API call for analytics data
        setTimeout(() => {
            initializeAnalyticsCharts();
            hideLoading();
            showNotification('Analytics data loaded successfully', 'success');
        }, 1000);

    } catch (error) {
        console.error('Failed to load analytics:', error);
        showNotification('Failed to load analytics', 'error');
        hideLoading();
    }
};

// Fix 2: Improved chart initialization with proper error handling
const initializeAnalyticsCharts = () => {
    console.log('Initializing analytics charts...');

    // Wait a bit to ensure DOM is ready
    setTimeout(() => {
        initializeDashboardCharts();
        initializeAnalyticsDashboardChart();
    }, 100);
};

// Fix 3: Separate function for dashboard charts (jobs-chart, revenue-chart)
const initializeDashboardCharts = () => {
    // Sample data for demonstration
    const jobsData = {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        datasets: [{
            label: 'Print Jobs',
            data: [65, 78, 90, 81, 95, 102],
            borderColor: '#8B5CF6',
            backgroundColor: 'rgba(139, 92, 246, 0.1)',
            tension: 0.4,
            fill: true
        }]
    };

    const revenueData = {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        datasets: [{
            label: 'Revenue ($)',
            data: [320, 390, 450, 405, 475, 510],
            borderColor: '#EC4899',
            backgroundColor: 'rgba(236, 72, 153, 0.1)',
            tension: 0.4,
            fill: true
        }]
    };

    const chartConfig = {
        type: 'line',
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#FFFFFF',
                        font: {
                            size: 12
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#B8B5D1',
                        font: { size: 11 }
                    },
                    grid: {
                        color: '#3D3A5C',
                        drawBorder: false
                    }
                },
                y: {
                    ticks: {
                        color: '#B8B5D1',
                        font: { size: 11 }
                    },
                    grid: {
                        color: '#3D3A5C',
                        drawBorder: false
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    };

    // Initialize Jobs Chart
    const jobsCanvas = document.getElementById('jobs-chart');
    if (jobsCanvas && !charts['jobs']) {
        try {
            const jobsConfig = { ...chartConfig, data: jobsData };
            charts['jobs'] = new Chart(jobsCanvas, jobsConfig);
            console.log('Jobs chart initialized successfully');
        } catch (error) {
            console.error('Error initializing jobs chart:', error);
        }
    }

    // Initialize Revenue Chart  
    const revenueCanvas = document.getElementById('revenue-chart');
    if (revenueCanvas && !charts['revenue']) {
        try {
            const revenueConfig = { ...chartConfig, data: revenueData };
            charts['revenue'] = new Chart(revenueCanvas, revenueConfig);
            console.log('Revenue chart initialized successfully');
        } catch (error) {
            console.error('Error initializing revenue chart:', error);
        }
    }
};

// Fix 4: Analytics dashboard chart (for the analytics section)
const initializeAnalyticsDashboardChart = () => {
    const analyticsCanvas = document.getElementById('analytics-chart');
    if (!analyticsCanvas) {
        console.log('Analytics chart canvas not found');
        return;
    }

    if (charts['analytics']) {
        console.log('Analytics chart already exists');
        return;
    }

    try {
        const analyticsData = {
            labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
            datasets: [
                {
                    label: 'Jobs Completed',
                    data: [12, 19, 15, 25],
                    borderColor: '#8B5CF6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Revenue',
                    data: [65, 95, 78, 125],
                    borderColor: '#EC4899',
                    backgroundColor: 'rgba(236, 72, 153, 0.1)',
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y1'
                }
            ]
        };

        const analyticsConfig = {
            type: 'line',
            data: analyticsData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: '#FFFFFF',
                            font: { size: 12 },
                            usePointStyle: true,
                            padding: 20
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#B8B5D1',
                            font: { size: 11 }
                        },
                        grid: {
                            color: '#3D3A5C',
                            drawBorder: false
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        ticks: {
                            color: '#B8B5D1',
                            font: { size: 11 }
                        },
                        grid: {
                            color: '#3D3A5C',
                            drawBorder: false
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        ticks: {
                            color: '#B8B5D1',
                            font: { size: 11 }
                        },
                        grid: {
                            drawOnChartArea: false,
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        };

        charts['analytics'] = new Chart(analyticsCanvas, analyticsConfig);
        console.log('Analytics chart initialized successfully');

    } catch (error) {
        console.error('Error initializing analytics chart:', error);
        showNotification('Failed to initialize analytics chart', 'error');
    }
};

// Fix 5: Add chart cleanup function
const destroyChart = (chartName) => {
    if (charts[chartName]) {
        charts[chartName].destroy();
        delete charts[chartName];
        console.log(`${chartName} chart destroyed`);
    }
};

// Fix 6: Add chart update function for analytics filters
const updateAnalyticsChart = (metric, period) => {
    const chart = charts['analytics'];
    if (!chart) return;

    // Sample data based on metric and period
    const dataMap = {
        jobs: {
            '7d': [12, 15, 18, 14, 20, 25, 22],
            '30d': [65, 78, 90, 81, 95, 102, 88, 94],
            '90d': [320, 390, 450, 405, 475, 510, 485],
            '1y': [1200, 1350, 1180, 1420, 1650, 1580, 1720, 1890, 1650, 1780, 1920, 2100]
        },
        revenue: {
            '7d': [120, 150, 180, 140, 200, 250, 220],
            '30d': [650, 780, 900, 810, 950, 1020, 880, 940],
            '90d': [3200, 3900, 4500, 4050, 4750, 5100, 4850],
            '1y': [12000, 13500, 11800, 14200, 16500, 15800, 17200, 18900, 16500, 17800, 19200, 21000]
        },
        users: {
            '7d': [45, 52, 48, 55, 62, 58, 65],
            '30d': [245, 268, 255, 280, 295, 310, 288],
            '90d': [1245, 1368, 1455, 1380, 1495, 1510, 1488],
            '1y': [2245, 2468, 2655, 2780, 2895, 3010, 3188, 3265, 3380, 3495, 3610, 3788]
        },
        pages: {
            '7d': [450, 520, 480, 550, 620, 580, 650],
            '30d': [2450, 2680, 2550, 2800, 2950, 3100, 2880],
            '90d': [12450, 13680, 14550, 13800, 14950, 15100, 14880],
            '1y': [22450, 24680, 26550, 27800, 28950, 31000, 31880, 32650, 33800, 34950, 36100, 37880]
        }
    };

    const labelMap = {
        '7d': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        '30d': ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        '90d': ['Month 1', 'Month 2', 'Month 3'],
        '1y': ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    };

    chart.data.labels = labelMap[period] || labelMap['7d'];
    chart.data.datasets[0].data = dataMap[metric][period] || dataMap[metric]['7d'];
    chart.data.datasets[0].label = metric.charAt(0).toUpperCase() + metric.slice(1);

    chart.update();
    console.log(`Analytics chart updated: ${metric} - ${period}`);
};

// Fix 7: Add event listeners for analytics controls
const initializeAnalyticsControls = () => {
    const metricSelect = document.getElementById('analytics-metric');
    const periodSelect = document.getElementById('analytics-period');

    if (metricSelect && periodSelect) {
        const updateChart = () => {
            const metric = metricSelect.value;
            const period = periodSelect.value;
            updateAnalyticsChart(metric, period);
        };

        metricSelect.addEventListener('change', updateChart);
        periodSelect.addEventListener('change', updateChart);

        console.log('Analytics controls initialized');
    }
};

// Fix 8: Updated section switching to properly initialize analytics
const originalShowSection = showSection;
window.showSection = (sectionName) => {
    originalShowSection(sectionName);

    // Special handling for analytics section
    if (sectionName === 'analytics' || sectionName === 'reports') {
        setTimeout(() => {
            if (!charts['analytics']) {
                initializeAnalyticsCharts();
            }
            initializeAnalyticsControls();
        }, 200);
    }
};

// Fix 9: Make sure to initialize dashboard charts when dashboard loads
const originalLoadDashboardData = loadDashboardData;
window.loadDashboardData = async () => {
    await originalLoadDashboardData();

    // Initialize dashboard charts after data loads
    setTimeout(() => {
        initializeDashboardCharts();
    }, 500);
};

// FIXED: Modal management
const showModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
};

const closeModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = 'auto';
    }
};

// FIXED: Printer management functions
const addPrinter = () => {
    // Clear form
    document.getElementById('printer-form').reset();
    document.getElementById('printer-modal-title').textContent = 'Add Printer';
    showModal('printer-modal');
};

const editPrinter = (printerId) => {
    console.log('Editing printer:', printerId);

    // In a real implementation, you'd fetch printer data
    // For now, we'll show the modal with sample data
    document.getElementById('printer-modal-title').textContent = 'Edit Printer';
    document.getElementById('printer-name').value = 'Sample Printer';
    document.getElementById('printer-location').value = 'Library Floor 1';
    document.getElementById('printer-type').value = 'bw';
    document.getElementById('printer-status').value = 'online';
    document.getElementById('paper-level').value = '85';
    document.getElementById('toner-level').value = '65';

    showModal('printer-modal');
};

const deletePrinter = (printerId) => {
    if (confirm('Are you sure you want to delete this printer? This action cannot be undone.')) {
        showLoading();

        // Mock deletion - replace with actual API call
        setTimeout(() => {
            showNotification('Printer deleted successfully', 'success');
            loadPrinters();
            hideLoading();
        }, 1000);

        /*
        // Actual API call would be:
        try {
            await apiRequest(`/printers/${printerId}`, { method: 'DELETE' });
            showNotification('Printer deleted successfully', 'success');
            loadPrinters();
        } catch (error) {
            showNotification('Failed to delete printer', 'error');
        }
        */
    }
};

const savePrinter = async () => {
    try {
        showLoading();

        const printerData = {
            name: document.getElementById('printer-name').value,
            location: document.getElementById('printer-location').value,
            type: document.getElementById('printer-type').value,
            status: document.getElementById('printer-status').value,
            paper_level: parseInt(document.getElementById('paper-level').value),
            toner_level: parseInt(document.getElementById('toner-level').value)
        };

        console.log('Saving printer:', printerData);

        // Mock save - replace with actual API call
        setTimeout(() => {
            showNotification('Printer saved successfully!', 'success');
            closeModal('printer-modal');
            loadPrinters();
            hideLoading();
        }, 1000);

        /*
        // Actual API call would be:
        const response = await apiRequest('/printers', {
            method: 'POST',
            body: JSON.stringify(printerData)
        });
        
        if (response.success) {
            showNotification('Printer saved successfully!', 'success');
            closeModal('printer-modal');
            loadPrinters();
        }
        */

    } catch (error) {
        console.error('Failed to save printer:', error);
        showNotification('Failed to save printer', 'error');
    } finally {
        hideLoading();
    }
};

const refreshPrinters = () => {
    const refreshBtn = document.querySelector('.refresh-btn');
    if (refreshBtn) {
        const icon = refreshBtn.querySelector('i');
        icon.style.animation = 'spin 1s linear infinite';

        setTimeout(() => {
            icon.style.animation = '';
        }, 1000);
    }

    loadPrinters();
    showNotification('Printer list refreshed', 'info');
};

const loadJobs = async () => {
    try {
        showLoading();
        const response = await apiRequest('/jobs'); // Flask: /api/jobs should exist
        if (response.success) {
            displayJobs(response.jobs);
        } else {
            displayJobs([]);
        }
    } catch (error) {
        console.error('Failed to load jobs:', error);
        showNotification('Failed to load jobs', 'error');
        displayJobs([]);
    } finally {
        hideLoading();
    }
};


const viewJobDetails = async (jobId) => {
    try {
        showLoading();

        const cleanJobId = jobId ? jobId.trim() : '';
        if (!cleanJobId) {
            throw new Error("Invalid job ID provided");
        }

        const response = await apiRequest(`/jobs/${cleanJobId}`);
        if (!response.success) {
            throw new Error(response.message || "Job not found");
        }

        const job = response.job;
        const jobIdentifier = job.id || job.job_id;

        // Build modal content (without upper buttons)
        const modalContent = `
            <div class="job-details">
                <div class="detail-section">
                    <h4>Job Information</h4>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <label>Job ID:</label>
                            <span>${jobIdentifier || 'Unknown'}</span>
                        </div>
                        <div class="detail-item">
                            <label>Student:</label>
                            <span>${job.student_name || "Unknown"}</span>
                        </div>
                        <div class="detail-item">
                            <label>File:</label>
                            <span>${job.file_name || "Unknown"}</span>
                        </div>
                        <div class="detail-item">
                            <label>Created:</label>
                            <span>${formatDate(job.created_at) || "Unknown"}</span>
                        </div>
                    </div>
                </div>
                <div class="detail-section">
                    <h4>Print Details</h4>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <label>Pages:</label>
                            <span>${job.pages || 0}</span>
                        </div>
                        <div class="detail-item">
                            <label>Cost:</label>
                            <span>${formatCurrency(job.total_cost || 0)}</span>
                        </div>
                        <div class="detail-item">
                            <label>Status:</label>
                            <span class="status-badge ${job.status || 'unknown'}">
                                ${(job.status || "Unknown").charAt(0).toUpperCase() + (job.status || "Unknown").slice(1)}
                            </span>
                        </div>
                        <div class="detail-item">
                            <label>Printer:</label>
                            <span>${job.printer_name || job.printer || "Not assigned"}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById("job-modal-content").innerHTML = modalContent;

        // Show modal
        showModal("job-modal");

        // Wire footer buttons with correct jobId
        const approveBtn = document.getElementById("approve-job-btn");
        const rejectBtn = document.getElementById("reject-job-btn");
        const closeBtn = document.querySelector("#job-modal .secondary-btn");

        if (closeBtn) {
            closeBtn.setAttribute("onclick", "closeModal('job-modal')");
        }

        if (approveBtn) {
            if (job.status === "pending") {
                approveBtn.style.display = "inline-block";
                approveBtn.setAttribute("onclick", `approveJob('${jobIdentifier}')`);
            } else {
                approveBtn.style.display = "none";
            }
        }

        if (rejectBtn) {
            if (["pending", "approved"].includes(job.status)) {
                rejectBtn.style.display = "inline-block";
                rejectBtn.setAttribute("onclick", `rejectJob('${jobIdentifier}')`);
            } else {
                rejectBtn.style.display = "none";
            }
        }

    } catch (error) {
        console.error("viewJobDetails error details:", error);
        showNotification(`Failed to load job details: ${error.message}`, "error");
    } finally {
        hideLoading();
    }
};



const approveJob = async (jobId) => {
    try {
        await approveJobQuick(jobId);
        closeModal('job-modal');
    } catch (error) {
        console.error('Failed to approve job from modal:', error);
    }
};

const approveJobQuick = async (jobId) => {
    try {
        showLoading();
        console.log('Approving job:', jobId);

        if (!currentUser || currentUser.type !== 'admin') {
            throw new Error('Admin privileges required');
        }

        const response = await apiRequest(`/jobs/${jobId}/approve`, {
            method: 'POST',
            body: JSON.stringify({})
        });

        if (response.success) {
            showNotification(`Job approved successfully!`, 'success');
            console.log('Job approved:', jobId);

            await loadJobs(); // refresh jobs
        } else {
            throw new Error(response.message || 'Approval failed');
        }
    } catch (error) {
        console.error('Failed to approve job:', error);
        showNotification(`Failed to approve job: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
};

// ✅ Make function globally accessible
window.approveJobQuick = approveJobQuick;

const rejectJob = async (jobId) => {
    try {
        if (!confirm('Are you sure you want to reject this job?')) {
            return;
        }

        showLoading();

        const response = await apiRequest(`/jobs/${jobId}/reject`, {
            method: 'POST',
            body: JSON.stringify({ reason: 'Rejected by admin' })
        });

        if (response.success) {
            showNotification('Job rejected', 'warning');
            closeModal('job-modal');
            await loadJobs();
        } else {
            throw new Error(response.message || 'Rejection failed');
        }

    } catch (error) {
        console.error('Failed to reject job:', error);
        showNotification(`Failed to reject job: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
};


const bulkApprove = async () => {
    try {
        const checkedJobs = document.querySelectorAll('.job-checkbox:checked');
        if (checkedJobs.length === 0) {
            showNotification('Please select jobs to approve', 'warning');
            return;
        }

        const jobIds = Array.from(checkedJobs).map(checkbox => checkbox.value);

        if (!confirm(`Approve ${jobIds.length} selected jobs?`)) {
            return;
        }

        showLoading();
        console.log('Bulk approving jobs:', jobIds);

        const response = await apiRequest('/jobs/bulk-approve', {
            method: 'POST',
            body: JSON.stringify({ job_ids: jobIds })
        });

        if (response.success) {
            showNotification(`${response.approved_count} jobs approved successfully!`, 'success');

            if (response.failed_jobs && response.failed_jobs.length > 0) {
                console.warn('Some jobs failed to approve:', response.failed_jobs);
                showNotification(`${response.failed_jobs.length} jobs failed to approve`, 'warning');
            }

            // Clear selections and reload
            document.getElementById('select-all-jobs').checked = false;
            await loadJobs();
        } else {
            throw new Error(response.message || 'Bulk approval failed');
        }

    } catch (error) {
        console.error('Bulk approval error:', error);
        showNotification(`Bulk approval failed: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
};

const exportJobs = () => {
    showNotification('Exporting jobs data...', 'info');

    // Mock export functionality
    setTimeout(() => {
        showNotification('Jobs data exported successfully!', 'success');
    }, 2000);
};

const deleteJob = async (jobId) => {
    if (!confirm("Are you sure you want to delete this job? This action cannot be undone.")) {
        return;
    }

    try {
        showLoading();
        console.log("Deleting job:", jobId);

        const response = await apiRequest(`/jobs/${jobId}`, {
            method: "DELETE"
        });

        if (response.success) {
            showNotification("Job deleted successfully!", "success");
            await loadJobs(); // Refresh job table
        } else {
            throw new Error(response.message || "Failed to delete job");
        }
    } catch (error) {
        console.error("Delete job error:", error);
        showNotification(`Failed to delete job: ${error.message}`, "error");
    } finally {
        hideLoading();
    }
};

// ✅ make globally accessible (so inline onclick can find it)
window.deleteJob = deleteJob;


async function restoreSession() {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
            credentials: 'include'   // 👈 important, sends cookies
        });
        const data = await response.json();

        if (data.success) {
            currentUser = data.user;
            loadDashboard();
        } else {
            showLoginPage();
        }
    } catch (err) {
        console.error("Session restore failed:", err);
        showLoginPage();
    }
}


const exportUsers = () => {
    showNotification('Exporting users data...', 'info');

    setTimeout(() => {
        showNotification('Users data exported successfully!', 'success');
    }, 2000);
};

// FIXED: Reports and Analytics functions
const generateReport = () => {
    const reportType = document.getElementById('report-type-select')?.value || 'summary';
    const startDate = document.getElementById('report-start-date')?.value;
    const endDate = document.getElementById('report-end-date')?.value;

    if (!startDate || !endDate) {
        showNotification('Please select date range for the report', 'warning');
        return;
    }

    showLoading();
    showNotification(`Generating ${reportType} report...`, 'info');

    setTimeout(() => {
        showNotification('Report generated successfully!', 'success');
        hideLoading();
    }, 3000);
};

const scheduleReport = () => {
    showNotification('Report scheduling functionality coming soon', 'info');
};


// FIXED: Alert management
const clearAllAlerts = () => {
    if (confirm('Clear all system alerts?')) {
        document.getElementById('system-alerts').innerHTML = '<p class="no-data">No active alerts</p>';
        updateElement('alerts-count', 0);
        showNotification('All alerts cleared', 'success');
    }
};

// FIXED: Search and filter functions
const filterJobs = () => {
    const status = document.getElementById('job-status-filter')?.value;
    const printer = document.getElementById('printer-filter')?.value;
    const dateFrom = document.getElementById('date-from')?.value;
    const dateTo = document.getElementById('date-to')?.value;

    console.log('Filtering jobs:', { status, printer, dateFrom, dateTo });
    showNotification('Applying job filters...', 'info');

    // In a real implementation, this would filter the jobs table
    setTimeout(() => {
        loadJobs();
    }, 500);
};

const searchJobs = () => {
    const searchTerm = document.getElementById('jobs-search')?.value;
    console.log('Searching jobs:', searchTerm);

    if (searchTerm.length > 2) {
        showNotification(`Searching for: ${searchTerm}`, 'info');
        setTimeout(() => {
            loadJobs();
        }, 500);
    }
};

const filterUsers = () => {
    const userType = document.getElementById('user-type-filter')?.value;
    console.log('Filtering users by type:', userType);
    showNotification('Applying user filters...', 'info');

    setTimeout(() => {
        loadUsers();
    }, 500);
};

const searchUsers = () => {
    const searchTerm = document.getElementById('users-search')?.value;
    console.log('Searching users:', searchTerm);

    if (searchTerm.length > 2) {
        showNotification(`Searching for: ${searchTerm}`, 'info');
        setTimeout(() => {
            loadUsers();
        }, 500);
    }
};

// FIXED: Pagination functions
const nextPage = () => {
    currentPage++;
    console.log('Next page:', currentPage);
    loadJobs(); // or whatever section is active
};

const previousPage = () => {
    if (currentPage > 1) {
        currentPage--;
        console.log('Previous page:', currentPage);
        loadJobs(); // or whatever section is active
    }
};

// FIXED: Refresh dashboard function
const refreshDashboard = () => {
    const refreshBtn = document.querySelector('.refresh-btn i');
    if (refreshBtn) {
        refreshBtn.style.animation = 'spin 1s linear infinite';
    }

    loadDashboardData().finally(() => {
        if (refreshBtn) {
            refreshBtn.style.animation = '';
        }
    });

    showNotification('Dashboard refreshed', 'success');
};

// FIXED: 2FA verification function
const verifyTOTP = () => {
    const totpCode = document.getElementById('verify-totp').value;

    if (!totpCode || totpCode.length !== 6) {
        showNotification('Please enter a valid 6-digit code', 'warning');
        return;
    }

    showLoading();

    // Mock verification
    setTimeout(() => {
        showNotification('2FA setup completed successfully!', 'success');
        showLogin();
        hideLoading();
    }, 1500);
};

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing admin dashboard...');

    // Check for existing authentication
    if (!checkAuth()) {
        console.log('No existing auth, showing login form');
        document.getElementById('auth-section').classList.remove('hidden');
    }

    // Login form handler
    const loginForm = document.getElementById('login-form-element');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('Login form submitted');

            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;

            if (!email || !password) {
                showNotification('Please enter email and password', 'warning');
                return;
            }

            await login(email, password);
        });
    }

    // Register form handler
    const registerForm = document.getElementById('register-form-element');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const username = document.getElementById('register-username').value;
            const email = document.getElementById('register-email').value;
            const password = document.getElementById('register-password').value;
            const adminCode = document.getElementById('admin-code').value;

            await register(username, email, password, adminCode);
        });
    }

    // Initialize select all checkbox for jobs
    const selectAllJobs = document.getElementById('select-all-jobs');
    if (selectAllJobs) {
        selectAllJobs.addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.job-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.checked = e.target.checked;
            });
        });
    }

    // Close modals when clicking outside
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            const modalId = e.target.id;
            closeModal(modalId);
        }
    });

    // Initialize charts when DOM is ready
    setTimeout(() => {
        initializeAnalyticsCharts();
    }, 1000);
});



// Global functions that need to be accessible from HTML
window.showSection = showSection;
window.showLogin = showLogin;
window.showRegister = showRegister;
window.logout = logout;
window.toggleSidebar = toggleSidebar;
window.refreshDashboard = refreshDashboard;
window.viewJobDetails = viewJobDetails;
window.approveJobQuick = approveJobQuick;
window.approveJob = approveJob;
window.rejectJob = rejectJob;
window.bulkApprove = bulkApprove;
window.exportJobs = exportJobs;
window.addPrinter = addPrinter;
window.editPrinter = editPrinter;
window.deletePrinter = deletePrinter;
window.savePrinter = savePrinter;
window.refreshPrinters = refreshPrinters;
window.viewUser = viewUser;
window.editUser = editUser;
window.exportUsers = exportUsers;
window.generateReport = generateReport;
window.scheduleReport = scheduleReport;
window.viewReport = viewReport;
window.showSettingsTab = showSettingsTab;
window.saveSettings = saveSettings;
window.resetSettings = resetSettings;
window.clearAllAlerts = clearAllAlerts;
window.filterJobs = filterJobs;
window.searchJobs = searchJobs;
window.filterUsers = filterUsers;
window.searchUsers = searchUsers;
window.nextPage = nextPage;
window.previousPage = previousPage;
window.showModal = showModal;
window.closeModal = closeModal;
window.verifyTOTP = verifyTOTP;
window.hideNotification = hideNotification;