// PrintQ Student Interface JavaScript - Fixed Version
// Connects HTML frontend to Flask backend with animations and full functionality

// Configuration
const API_BASE_URL = '/api';
let currentUser = null;
let currentFile = null;
let jobUpdateInterval = null;

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    initializeApp();
});

// ===== INITIALIZATION =====
function initializeApp() {
    // Check if user is already logged in (using memory instead of localStorage)
    showAuth();

    // Initialize event listeners
    initializeEventListeners();

    // Initialize file upload
    initializeFileUpload();

    // Initialize print options listeners
    initializePrintOptions();
}

function initializeEventListeners() {
    // Auth form listeners
    document.getElementById('login-form-element').addEventListener('submit', handleLogin);
    document.getElementById('register-form-element').addEventListener('submit', handleRegister);

    // File input listener
    document.getElementById('file-input').addEventListener('change', handleFileSelect);

    // Print options listeners
    document.getElementById('color-option').addEventListener('change', updateCostCalculation);
    document.getElementById('duplex-option').addEventListener('change', updateCostCalculation);
    document.getElementById('paper-size').addEventListener('change', updateCostCalculation);
    document.getElementById('copies').addEventListener('input', updateCostCalculation);
    document.getElementById('binding-option').addEventListener('change', updateCostCalculation);

    // Global click listener for closing dropdowns
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.user-menu')) {
            hideUserMenu();
        }
    });

    // Escape key listener for closing modals
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            closeAllModals();
        }
    });
}

// ===== AUTHENTICATION =====
function showLogin() {
    animateAuthSwitch('login-form', 'register-form');
}

function showRegister() {
    animateAuthSwitch('register-form', 'login-form');
}

function animateAuthSwitch(showForm, hideForm) {
    const showElement = document.getElementById(showForm);
    const hideElement = document.getElementById(hideForm);

    // Fade out current form
    hideElement.style.opacity = '0';
    hideElement.style.transform = 'translateX(-50px)';

    setTimeout(() => {
        hideElement.classList.remove('active');
        showElement.classList.add('active');

        // Fade in new form
        setTimeout(() => {
            showElement.style.opacity = '1';
            showElement.style.transform = 'translateX(0)';
        }, 50);
    }, 300);
}

async function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    showLoading('Signing you in...');

    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: email,
                password: password,
                user_type: 'student'
            })
        });

        const data = await response.json();

        if (data.success) {
            // Store user data and token in memory
            currentUser = data.user;
            currentUser.token = data.token;

            showNotification('Login successful! Welcome back!', 'success');

            // Animate transition to dashboard
            setTimeout(() => {
                showDashboard();
                hideLoading();
            }, 1000);
        } else {
            hideLoading();
            showNotification(data.message || 'Login failed', 'error');
        }
    } catch (error) {
        hideLoading();
        showNotification('Connection error. Please try again.', 'error');
        console.error('Login error:', error);
    }
}

async function handleRegister(e) {
    e.preventDefault();

    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const studentId = document.getElementById('register-student-id').value;
    const password = document.getElementById('register-password').value;

    // Basic validation
    if (password.length < 6) {
        showNotification('Password must be at least 6 characters long', 'error');
        return;
    }

    showLoading('Creating your account...');

    try {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: username,
                email: email,
                student_id: studentId,
                password: password,
                user_type: 'student'
            })
        });

        const data = await response.json();

        if (data.success) {
            hideLoading();
            showNotification('Account created successfully! Please login.', 'success');
            showLogin();

            // Pre-fill login form
            document.getElementById('login-email').value = email;
        } else {
            hideLoading();
            showNotification(data.message || 'Registration failed', 'error');
        }
    } catch (error) {
        hideLoading();
        showNotification('Connection error. Please try again.', 'error');
        console.error('Registration error:', error);
    }
}

function logout() {
    // Clear stored data
    currentUser = null;

    // Stop periodic updates
    if (jobUpdateInterval) {
        clearInterval(jobUpdateInterval);
    }

    // Show auth section with animation
    const dashboard = document.getElementById('dashboard-section');
    const auth = document.getElementById('auth-section');

    dashboard.style.opacity = '0';
    setTimeout(() => {
        dashboard.classList.add('hidden');
        auth.classList.remove('hidden');
        setTimeout(() => {
            auth.style.opacity = '1';
        }, 50);
    }, 300);

    showNotification('You have been logged out', 'info');
}

// ===== DASHBOARD =====
function showAuth() {
    document.getElementById('auth-section').classList.remove('hidden');
    document.getElementById('dashboard-section').classList.add('hidden');
}

function showDashboard() {
    const auth = document.getElementById('auth-section');
    const dashboard = document.getElementById('dashboard-section');

    // Animate transition
    auth.style.opacity = '0';
    setTimeout(() => {
        auth.classList.add('hidden');
        dashboard.classList.remove('hidden');

        // Update user display
        updateUserDisplay();

        // Load initial data
        loadDashboardData();

        // Start periodic updates
        startPeriodicUpdates();

        setTimeout(() => {
            dashboard.style.opacity = '1';
        }, 50);
    }, 300);
}

function updateUserDisplay() {
    if (!currentUser) return;

    document.getElementById('username-display').textContent = currentUser.username;
    document.getElementById('wallet-balance').textContent = `$${(currentUser.wallet_balance || 0).toFixed(2)}`;
    document.getElementById('eco-points').textContent = currentUser.eco_points || 0;

    // Update profile section
    document.getElementById('profile-username').textContent = currentUser.username;
    document.getElementById('profile-email').textContent = currentUser.email;
    document.getElementById('profile-student-id').textContent = `ID: ${currentUser.student_id}`;
    document.getElementById('profile-eco-points').textContent = currentUser.eco_points || 0;

    // Update wallet display
    const walletDisplay = document.getElementById('wallet-balance-display');
    if (walletDisplay) {
        walletDisplay.textContent = (currentUser.wallet_balance || 0).toFixed(2);
    }
}

async function loadDashboardData() {
    if (!currentUser) return;

    await Promise.all([
        loadUserJobs(),
        loadWalletTransactions(),
        loadUserStats()
    ]);
}

// ===== NAVIGATION =====
function showSection(sectionName) {
    // Remove active class from all nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });

    // Add active class to clicked nav link
    event.target.classList.add('active');

    // Hide all content sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
        section.style.opacity = '0';
    });

    // Show selected section with animation
    const targetSection = document.getElementById(`${sectionName}-section`);
    setTimeout(() => {
        targetSection.classList.add('active');
        targetSection.style.opacity = '1';

        // Load section-specific data
        if (sectionName === 'jobs') {
            loadUserJobs();
        } else if (sectionName === 'history') {
            loadUserHistory();
        } else if (sectionName === 'wallet') {
            loadWalletTransactions();
        }
    }, 150);
}

// ===== FILE UPLOAD =====
function initializeFileUpload() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');

    // Click to upload
    uploadArea.addEventListener('click', () => {
        fileInput.click();
    });

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelect({ target: { files: files } });
        }
    });
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'];

    if (!allowedTypes.includes(file.type)) {
        showNotification('Unsupported file type. Please select PDF, DOCX, or PPT files.', 'error');
        return;
    }

    // Validate file size (50MB)
    if (file.size > 50 * 1024 * 1024) {
        showNotification('File too large. Maximum size is 50MB.', 'error');
        return;
    }

    currentFile = file;

    // Show file preview with animation
    showFilePreview(file);

    // Enable submit button
    document.getElementById('submit-job-btn').disabled = false;

    // Estimate pages (basic estimation)
    const estimatedPages = Math.max(1, Math.ceil(file.size / (1024 * 100))); // Rough estimate
    document.getElementById('estimated-pages').textContent = estimatedPages;

    // Update cost calculation
    updateCostCalculation();

    showNotification('File uploaded successfully!', 'success');
}

function showFilePreview(file) {
    const preview = document.getElementById('file-preview');
    const fileName = document.getElementById('file-name');
    const fileSize = document.getElementById('file-size');
    const fileIcon = preview.querySelector('.file-icon i');

    // Set file info
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);

    // Set appropriate icon
    if (file.type.includes('pdf')) {
        fileIcon.className = 'fas fa-file-pdf';
    } else if (file.type.includes('word')) {
        fileIcon.className = 'fas fa-file-word';
    } else if (file.type.includes('presentation')) {
        fileIcon.className = 'fas fa-file-powerpoint';
    }

    // Show with animation
    preview.classList.remove('hidden');
    preview.style.opacity = '0';
    preview.style.transform = 'translateY(20px)';

    setTimeout(() => {
        preview.style.opacity = '1';
        preview.style.transform = 'translateY(0)';
    }, 100);
}

function clearFile() {
    currentFile = null;
    document.getElementById('file-preview').classList.add('hidden');
    document.getElementById('file-input').value = '';
    document.getElementById('submit-job-btn').disabled = true;
    updateCostCalculation();
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ===== PRINT OPTIONS =====
function initializePrintOptions() {
    // Set up copy increment/decrement - fix the button selection
    const incrementBtn = document.querySelector('.number-input button:last-child');
    const decrementBtn = document.querySelector('.number-input button:first-child');

    if (incrementBtn) incrementBtn.addEventListener('click', incrementCopies);
    if (decrementBtn) decrementBtn.addEventListener('click', decrementCopies);
}

function incrementCopies() {
    const copiesInput = document.getElementById('copies');
    const currentValue = parseInt(copiesInput.value);
    if (currentValue < 100) {
        copiesInput.value = currentValue + 1;
        updateCostCalculation();
    }
}

function decrementCopies() {
    const copiesInput = document.getElementById('copies');
    const currentValue = parseInt(copiesInput.value);
    if (currentValue > 1) {
        copiesInput.value = currentValue - 1;
        updateCostCalculation();
    }
}

function updateCostCalculation() {
    if (!currentFile) {
        document.getElementById('base-cost').textContent = '$0.00';
        document.getElementById('options-cost').textContent = '$0.00';
        document.getElementById('total-cost').textContent = '$0.00';
        return;
    }

    const estimatedPages = parseInt(document.getElementById('estimated-pages').textContent);
    const isColor = document.getElementById('color-option').checked;
    const isDuplex = document.getElementById('duplex-option').checked;
    const paperSize = document.getElementById('paper-size').value;
    const copies = parseInt(document.getElementById('copies').value);
    const binding = document.getElementById('binding-option').checked;

    // Calculate costs (matching backend logic)
    let baseCost = isColor ? 0.15 : 0.05; // per page
    if (isDuplex) {
        baseCost = isColor ? 0.25 : 0.08; // duplex rates
    }

    let totalCost = estimatedPages * baseCost * copies;

    // Paper size multiplier
    if (paperSize === 'A3') {
        totalCost *= 1.5;
    }

    let optionsCost = 0;
    if (binding) {
        optionsCost += 2.00;
    }

    const finalTotal = totalCost + optionsCost;

    // Update display
    document.getElementById('base-cost').textContent = `$${totalCost.toFixed(2)}`;
    document.getElementById('options-cost').textContent = `$${optionsCost.toFixed(2)}`;
    document.getElementById('total-cost').textContent = `$${finalTotal.toFixed(2)}`;

    // Show/hide eco tip
    const ecoTip = document.getElementById('eco-tip');
    if (isDuplex) {
        ecoTip.style.display = 'block';
        ecoTip.style.opacity = '1';
    } else {
        ecoTip.style.display = 'none';
    }

    // Check if user has sufficient balance
    const submitBtn = document.getElementById('submit-job-btn');
    if (currentUser && currentUser.wallet_balance < finalTotal) {
        submitBtn.classList.add('insufficient-balance');
        submitBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Insufficient Balance';
    } else if (currentFile) {
        submitBtn.classList.remove('insufficient-balance');
        submitBtn.innerHTML = '<i class="fas fa-print"></i> Submit Print Job';
    }
}

async function submitPrintJob() {
    if (!currentFile) {
        showNotification('Please select a file first', 'error');
        return;
    }

    if (!currentUser) {
        showNotification('Please log in first', 'error');
        return;
    }

    const estimatedPages = parseInt(document.getElementById('estimated-pages').textContent);
    const isColor = document.getElementById('color-option').checked;
    const isDuplex = document.getElementById('duplex-option').checked;
    const paperSize = document.getElementById('paper-size').value;
    const copies = parseInt(document.getElementById('copies').value);
    const binding = document.getElementById('binding-option').checked;
    const scheduledTime = document.getElementById('scheduled-time').value;

    showLoading('Submitting your print job...');

    try {
        // Create FormData for file upload
        const formData = new FormData();
        formData.append('file', currentFile);
        // Remove student_id from form data - backend will get it from token
        formData.append('pages', estimatedPages);
        formData.append('color', isColor);
        formData.append('duplex', isDuplex);
        formData.append('paper_size', paperSize);
        formData.append('copies', copies);
        formData.append('binding', binding);
        if (scheduledTime) {
            formData.append('scheduled_time', scheduledTime);
        }

        const response = await fetch(`${API_BASE_URL}/jobs/submit`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentUser.token}` // Only include auth header, not Content-Type for FormData
            },
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            hideLoading();

            // Update user balance
            currentUser.wallet_balance = data.new_balance;
            updateUserDisplay();

            // Show success notification
            showNotification('Print job submitted successfully!', 'success');

            // Show QR code modal
            showQRCode(data.job_id, data.pickup_pin, data.qr_code);

            // Clear form
            clearFile();
            resetPrintOptions();

            // Refresh jobs list
            loadUserJobs();

        } else {
            hideLoading();
            showNotification(data.message || 'Failed to submit job', 'error');
        }
    } catch (error) {
        hideLoading();
        showNotification('Connection error. Please try again.', 'error');
        console.error('Job submission error:', error);
    }
}

function resetPrintOptions() {
    document.getElementById('color-option').checked = false;
    document.getElementById('duplex-option').checked = false;
    document.getElementById('paper-size').value = 'A4';
    document.getElementById('copies').value = '1';
    document.getElementById('binding-option').checked = false;
    document.getElementById('scheduled-time').value = '';
    updateCostCalculation();
}

// ===== JOBS MANAGEMENT =====
async function loadUserJobs() {
    if (!currentUser) return;

    try {
        const response = await fetch(`${API_BASE_URL}/jobs/student/${currentUser.id}`, {
            headers: {
                'Authorization': `Bearer ${currentUser.token}`
            }
        });

        const data = await response.json();

        if (data.success) {
            displayJobs(data.jobs);
        } else {
            console.error('Failed to load jobs:', data.message);
        }
    } catch (error) {
        console.error('Error loading jobs:', error);
    }
}

function displayJobs(jobs) {
    const jobsList = document.getElementById('jobs-list');

    if (jobs.length === 0) {
        jobsList.innerHTML = `
            <div class="no-jobs">
                <i class="fas fa-inbox"></i>
                <h3>No print jobs yet</h3>
                <p>Upload a document to get started!</p>
            </div>
        `;
        return;
    }

    jobsList.innerHTML = jobs.map(job => `
        <div class="job-card" data-job-id="${job.id}">
            <div class="job-header">
                <div class="job-info">
                    <h4>${job.file_name || 'Unknown File'}</h4>
                    <p class="job-id">#${job.id.substring(0, 8)}</p>
                </div>
                <div class="job-status status-${job.status}">
                    ${job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                </div>
            </div>
            <div class="job-details">
                <div class="detail-item">
                    <i class="fas fa-file-alt"></i>
                    <span>${job.pages || 1} pages</span>
                </div>
                <div class="detail-item">
                    <i class="fas fa-copy"></i>
                    <span>${job.copies || 1} ${(job.copies || 1) > 1 ? 'copies' : 'copy'}</span>
                </div>
                <div class="detail-item">
                    <i class="fas fa-dollar-sign"></i>
                    <span>$${(job.total_cost || 0).toFixed(2)}</span>
                </div>
                <div class="detail-item">
                    <i class="fas fa-clock"></i>
                    <span>${formatDateTime(job.created_at)}</span>
                </div>
            </div>
            <div class="job-actions">
                <button onclick="showJobDetails('${job.id}')" class="details-btn">
                    <i class="fas fa-info-circle"></i> Details
                </button>
                ${job.status === 'completed' ? `
                    <button onclick="showQRCode('${job.id}', '${job.pickup_pin}', '${job.qr_code || ''}')" class="qr-btn">
                        <i class="fas fa-qrcode"></i> QR Code
                    </button>
                ` : ''}
                ${job.status === 'pending' ? `
                    <button onclick="cancelJob('${job.id}')" class="cancel-btn">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                ` : ''}
            </div>
        </div>
    `).join('');

    // Add animation to job cards
    animateJobCards();
}

function animateJobCards() {
    const jobCards = document.querySelectorAll('.job-card');
    jobCards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';

        setTimeout(() => {
            card.style.transition = 'all 0.3s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, index * 100);
    });
}

async function showJobDetails(jobId) {
    showModal('job-details-modal');
    const detailsContainer = document.getElementById('job-details-content');
    detailsContainer.innerHTML = `<p>Loading...</p>`;

    try {
        const response = await fetch(`${API_BASE_URL}/jobs/detail/${jobId}`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });

        const data = await response.json();

        console.log("DEBUG JOB DETAIL RESPONSE:", data);  // 👈 check in browser console

        let job = null;

        if (data.success && data.job) {
            job = data.job;
        } else if (data.id) {
            job = data; // backend returned job directly
        }

        if (job) {
            detailsContainer.innerHTML = `
                <h4>${job.file_name || 'Unknown File'}</h4>
                <p><strong>Status:</strong> ${job.status}</p>
                <p><strong>Pages:</strong> ${job.pages}</p>
                <p><strong>Copies:</strong> ${job.copies}</p>
                <p><strong>Total Cost:</strong> $${(job.total_cost || 0).toFixed(2)}</p>
                <p><strong>Pickup PIN:</strong> ${job.pickup_pin || 'N/A'}</p>
            `;
        } else {
            detailsContainer.innerHTML = `<p>Failed to load job details.</p>`;
        }
    } catch (error) {
        console.error("Error loading job details:", error);
        detailsContainer.innerHTML = `<p>Error loading job details.</p>`;
    }
}



async function cancelJob(jobId) {
    if (!confirm('Are you sure you want to cancel this job?')) return;

    showLoading('Cancelling job...');

    try {
        // Implementation for job cancellation
        showNotification('Job cancelled successfully', 'success');
        hideLoading();
        loadUserJobs();
    } catch (error) {
        hideLoading();
        showNotification('Failed to cancel job', 'error');
    }
}

function refreshJobs() {
    const refreshBtn = document.querySelector('.refresh-btn i');
    if (refreshBtn) {
        refreshBtn.style.animation = 'spin 1s linear infinite';
    }

    loadUserJobs().then(() => {
        setTimeout(() => {
            if (refreshBtn) {
                refreshBtn.style.animation = '';
            }
        }, 1000);
    });
}

// ===== WALLET MANAGEMENT =====
function showAddMoney() {
    showModal('add-money-modal');
}

function quickAdd(amount) {
    document.getElementById('add-amount').value = amount;
    showAddMoney();
}

async function processPayment() {
    const amount = parseFloat(document.getElementById('add-amount').value);
    const paymentMethodElement = document.querySelector('input[name="payment-method"]:checked');
    const paymentMethod = paymentMethodElement ? paymentMethodElement.value : 'card';

    if (!amount || amount < 5 || amount > 500) {
        showNotification('Please enter an amount between $5 and $500', 'error');
        return;
    }

    showLoading('Processing payment...');

    try {
        const response = await fetch(`${API_BASE_URL}/wallet/add`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: JSON.stringify({
                student_id: currentUser.id,
                amount: amount,
                payment_method: paymentMethod
            })
        });

        const data = await response.json();

        if (data.success) {
            hideLoading();
            closeModal('add-money-modal');

            // Update user balance
            currentUser.wallet_balance = data.new_balance;
            updateUserDisplay();

            showNotification(`Successfully added $${amount.toFixed(2)} to your wallet!`, 'success');

            // Refresh transactions
            loadWalletTransactions();

        } else {
            hideLoading();
            showNotification(data.message || 'Payment failed', 'error');
        }
    } catch (error) {
        hideLoading();
        showNotification('Payment processing error', 'error');
        console.error('Payment error:', error);
    }
}

async function loadWalletTransactions() {
    if (!currentUser) return;

    try {
        const response = await fetch(`${API_BASE_URL}/wallet/transactions/${currentUser.id}`, {
            headers: {
                'Authorization': `Bearer ${currentUser.token}`
            }
        });

        const data = await response.json();

        if (data.success) {
            displayTransactions(data.transactions);
        } else {
            console.error('Failed to load transactions:', data.message);
        }
    } catch (error) {
        console.error('Error loading transactions:', error);
    }
}

function displayTransactions(transactions) {
    const transactionsList = document.getElementById('transactions-list');

    if (!transactionsList) return;

    if (transactions.length === 0) {
        transactionsList.innerHTML = `
            <div class="no-transactions">
                <i class="fas fa-receipt"></i>
                <p>No transactions yet</p>
            </div>
        `;
        return;
    }

    transactionsList.innerHTML = transactions.map(transaction => `
        <div class="transaction-item ${transaction.type}">
            <div class="transaction-icon">
                <i class="fas fa-${transaction.type === 'credit' ? 'plus' : 'minus'}"></i>
            </div>
            <div class="transaction-details">
                <h4>${transaction.description}</h4>
                <p>${formatDateTime(transaction.created_at)}</p>
            </div>
            <div class="transaction-amount ${transaction.type}">
                ${transaction.type === 'credit' ? '+' : '-'}$${transaction.amount.toFixed(2)}
            </div>
        </div>
    `).join('');
}

// ===== USER STATS & HISTORY =====
async function loadUserStats() {
    // Load and display user statistics
    if (currentUser) {
        document.getElementById('total-jobs').textContent = currentUser.total_jobs || 0;
        document.getElementById('total-pages').textContent = currentUser.total_pages || 0;
        document.getElementById('total-spent').textContent = `$${(currentUser.total_spent || 0).toFixed(2)}`;

        // Calculate trees saved (rough estimate: 1 tree = 8,333 pages)
        const treesSaved = Math.floor((currentUser.total_pages || 0) / 8333 * 100) / 100;
        const treesSavedElement = document.getElementById('trees-saved');
        if (treesSavedElement) {
            treesSavedElement.textContent = treesSaved.toFixed(2);
        }
    }
}

async function loadUserHistory() {
    if (!currentUser) return;

    try {
        const response = await fetch(`${API_BASE_URL}/jobs/history/${currentUser.id}`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });

        const data = await response.json();
        console.log("DEBUG HISTORY:", data);

        if (data.success) {
            // Update counters
            document.getElementById('total-jobs').textContent = data.summary.total_jobs;
            document.getElementById('total-pages').textContent = data.summary.total_pages;
            document.getElementById('total-spent').textContent = `$${data.summary.total_cost.toFixed(2)}`;
            document.getElementById('trees-saved').textContent = data.summary.trees_saved.toFixed(2);

            // Display job history list
            displayHistory(data.jobs);
        } else {
            console.error("Failed to load history:", data.message);
        }
    } catch (err) {
        console.error("Error loading history:", err);
    }
}

function displayHistory(jobs) {
    const historyList = document.getElementById('history-list');

    if (!jobs || jobs.length === 0) {
        historyList.innerHTML = `
            <div class="no-history">
                <i class="fas fa-archive"></i>
                <h3>No completed jobs yet</h3>
            </div>
        `;
        return;
    }

    historyList.innerHTML = jobs.map(job => {
        let statusClass = "status-pending";
        let statusText = job.status ? job.status.charAt(0).toUpperCase() + job.status.slice(1) : "Unknown";

        if (job.status === "completed") statusClass = "status-completed";
        else if (job.status === "failed") statusClass = "status-failed";
        else if (job.status === "processing") statusClass = "status-processing";

        return `
            <div class="history-item">
                <div class="history-info">
                    <h4>${job.file_name || "Unknown File"}</h4>
                    <p><i class="fas fa-clock"></i> ${formatDateTime(job.completed_at || job.created_at)}</p>
                </div>
                <div class="history-meta">
                    <span class="${statusClass}">${statusText}</span>
                    <span>${job.pages || 1} pages</span>
                    <span>${job.copies || 1} copies</span>
                    <span>$${(job.total_cost || 0).toFixed(2)}</span>
                </div>
            </div>
        `;
    }).join('');
}

const savedUser = localStorage.getItem("currentUser");
if (savedUser) {
    currentUser = JSON.parse(savedUser);
    loadDashboard();   // auto-load dashboard if user exists
}


// ===== CLOUD IMPORT =====
async function importFromDrive() {
    showNotification('Google Drive integration coming soon!', 'info');
}

async function importFromOneDrive() {
    showNotification('OneDrive integration coming soon!', 'info');
}

async function importFromDropbox() {
    showNotification('Dropbox integration coming soon!', 'info');
}

// ===== MODALS =====
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');

        // Animate modal appearance
        modal.style.opacity = '0';
        setTimeout(() => {
            modal.style.opacity = '1';
        }, 50);
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.opacity = '0';

        setTimeout(() => {
            modal.classList.add('hidden');
        }, 300);
    }
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        if (!modal.classList.contains('hidden')) {
            modal.style.opacity = '0';
            setTimeout(() => {
                modal.classList.add('hidden');
            }, 300);
        }
    });
}

function showQRCode(jobId, pickupPin, qrCodeData) {
    document.getElementById('pickup-pin').textContent = pickupPin;
    document.getElementById('pickup-job-id').textContent = jobId;

    // Generate QR code display (you might need a QR library for real implementation)
    const qrDisplay = document.getElementById('qr-code-display');
    if (qrCodeData) {
        qrDisplay.innerHTML = `<img src="data:image/png;base64,${qrCodeData}" alt="Pickup QR Code" class="qr-image">`;
    } else {
        qrDisplay.innerHTML = `
            <div class="qr-placeholder">
                <i class="fas fa-qrcode"></i>
                <p>QR Code will be generated</p>
            </div>
        `;
    }

    showModal('qr-modal');
}

// ===== USER MENU =====
function toggleUserMenu() {
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('hidden');
    }
}

function hideUserMenu() {
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) {
        dropdown.classList.add('hidden');
    }
}

// ===== PROFILE MANAGEMENT =====
function showProfile() {
    hideUserMenu();
    showSection('profile');
}

function showHistory() {
    hideUserMenu();
    showSection('history');
}

async function changePassword() {
    const newPassword = prompt('Enter new password (minimum 6 characters):');
    if (!newPassword || newPassword.length < 6) {
        showNotification('Password must be at least 6 characters long', 'error');
        return;
    }

    showNotification('Password change feature coming soon!', 'info');
}

async function deleteAccount() {
    if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
        return;
    }

    const confirmation = prompt('Type "DELETE" to confirm account deletion:');
    if (confirmation !== 'DELETE') {
        showNotification('Account deletion cancelled', 'info');
        return;
    }

    showNotification('Account deletion feature will be implemented with proper security measures', 'info');
}

// ===== DOCUMENT PREVIEW =====
async function previewDocument() {
    if (!currentFile) {
        showNotification('Please select a file first', 'error');
        return;
    }

    showNotification('Document preview feature coming soon!', 'info');
}

// ===== FILTERING AND SEARCH =====
function filterJobs() {
    const statusFilter = document.getElementById('status-filter');
    if (!statusFilter) return;

    const filterValue = statusFilter.value;
    const jobCards = document.querySelectorAll('.job-card');

    jobCards.forEach(card => {
        const statusElement = card.querySelector('.job-status');
        if (!statusElement) return;

        const status = statusElement.textContent.toLowerCase();

        if (filterValue === 'all' || status.includes(filterValue)) {
            card.style.display = 'block';
            card.style.opacity = '0';
            setTimeout(() => {
                card.style.opacity = '1';
            }, 100);
        } else {
            card.style.opacity = '0';
            setTimeout(() => {
                card.style.display = 'none';
            }, 300);
        }
    });
}

function searchJobs() {
    const searchInput = document.getElementById('job-search');
    if (!searchInput) return;

    const searchTerm = searchInput.value.toLowerCase();
    const jobCards = document.querySelectorAll('.job-card');

    jobCards.forEach(card => {
        const fileNameElement = card.querySelector('h4');
        const jobIdElement = card.querySelector('.job-id');

        if (!fileNameElement || !jobIdElement) return;

        const fileName = fileNameElement.textContent.toLowerCase();
        const jobId = jobIdElement.textContent.toLowerCase();

        if (fileName.includes(searchTerm) || jobId.includes(searchTerm)) {
            card.style.display = 'block';
            card.style.opacity = '1';
        } else {
            card.style.opacity = '0';
            setTimeout(() => {
                card.style.display = 'none';
            }, 300);
        }
    });
}

// ===== NOTIFICATIONS =====
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notification-text');

    if (!notification || !notificationText) return;

    const icon = notification.querySelector('i');

    // Set message
    notificationText.textContent = message;

    // Set icon based on type
    if (icon) {
        switch (type) {
            case 'success':
                icon.className = 'fas fa-check-circle';
                notification.className = 'notification success';
                break;
            case 'error':
                icon.className = 'fas fa-exclamation-circle';
                notification.className = 'notification error';
                break;
            case 'warning':
                icon.className = 'fas fa-exclamation-triangle';
                notification.className = 'notification warning';
                break;
            default:
                icon.className = 'fas fa-info-circle';
                notification.className = 'notification info';
        }
    }

    // Show notification with animation
    notification.classList.remove('hidden');
    notification.style.transform = 'translateX(100%)';
    notification.style.opacity = '0';

    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
        notification.style.opacity = '1';
    }, 100);

    // Auto-hide after 5 seconds
    setTimeout(() => {
        hideNotification();
    }, 5000);
}

function hideNotification() {
    const notification = document.getElementById('notification');
    if (!notification) return;

    notification.style.transform = 'translateX(100%)';
    notification.style.opacity = '0';

    setTimeout(() => {
        notification.classList.add('hidden');
    }, 300);
}

// ===== LOADING OVERLAY =====
function showLoading(message = 'Loading...') {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;

    const text = overlay.querySelector('p');
    if (text) {
        text.textContent = message;
    }

    overlay.classList.remove('hidden');
    overlay.style.opacity = '0';

    setTimeout(() => {
        overlay.style.opacity = '1';
    }, 50);
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;

    overlay.style.opacity = '0';

    setTimeout(() => {
        overlay.classList.add('hidden');
    }, 300);
}

// ===== PERIODIC UPDATES =====
function startPeriodicUpdates() {
    // Update jobs every 30 seconds
    jobUpdateInterval = setInterval(() => {
        if (currentUser) {
            const jobsSection = document.getElementById('jobs-section');
            if (jobsSection && jobsSection.classList.contains('active')) {
                loadUserJobs();
            }
        }
    }, 30000);

    // Update user data every 60 seconds
    setInterval(() => {
        if (currentUser) {
            refreshUserData();
        }
    }, 60000);
}

async function refreshUserData() {
    try {
        // In a real implementation, you'd fetch updated user data from the server
        // For now, we'll just update the display with existing data
        updateUserDisplay();
    } catch (error) {
        console.error('Error refreshing user data:', error);
    }
}

// ===== UTILITY FUNCTIONS =====
function formatDateTime(dateString) {
    if (!dateString) return 'Unknown';

    try {
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        return 'Invalid date';
    }
}

function formatFileType(fileName) {
    if (!fileName) return 'Document';

    const extension = fileName.split('.').pop().toLowerCase();
    switch (extension) {
        case 'pdf':
            return 'PDF Document';
        case 'docx':
            return 'Word Document';
        case 'ppt':
        case 'pptx':
            return 'PowerPoint Presentation';
        default:
            return 'Document';
    }
}

function calculateLevel(ecoPoints) {
    if (ecoPoints < 100) return 'Beginner';
    if (ecoPoints < 500) return 'Eco Warrior';
    if (ecoPoints < 1000) return 'Green Champion';
    return 'Eco Master';
}

// ===== ERROR HANDLING =====
window.addEventListener('error', function (e) {
    console.error('JavaScript Error:', e.error);
    showNotification('An unexpected error occurred. Please refresh the page.', 'error');
});

window.addEventListener('unhandledrejection', function (e) {
    console.error('Unhandled Promise Rejection:', e.reason);
    showNotification('Connection error. Please check your internet connection.', 'error');
});

// ===== RESPONSIVE BEHAVIOR =====
window.addEventListener('resize', function () {
    // Handle responsive behavior if needed
    if (window.innerWidth < 768) {
        // Mobile-specific adjustments
        hideUserMenu();
    }
});

// ===== ACCESSIBILITY =====
document.addEventListener('keydown', function (e) {
    // Tab navigation improvements
    if (e.key === 'Tab') {
        document.body.classList.add('keyboard-navigation');
    }

    // Enter key for buttons
    if (e.key === 'Enter' && e.target.tagName === 'BUTTON') {
        e.target.click();
    }
});

document.addEventListener('mousedown', function () {
    document.body.classList.remove('keyboard-navigation');
});

// ===== PERFORMANCE OPTIMIZATIONS =====
// Debounce function for search and other frequent operations
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Apply debouncing to search - Fixed to avoid duplicate listeners
const debouncedSearch = debounce(searchJobs, 300);

// Add search debouncing after DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    const searchInput = document.getElementById('job-search');
    if (searchInput) {
        searchInput.addEventListener('keyup', debouncedSearch);
    }
});

// ===== ANIMATION HELPERS =====
function animateElement(element, animation) {
    if (!element) return;

    element.style.animation = animation;
    element.addEventListener('animationend', function () {
        element.style.animation = '';
    }, { once: true });
}

function slideUp(element) {
    if (!element) return;

    element.style.transition = 'all 0.3s ease';
    element.style.transform = 'translateY(-20px)';
    element.style.opacity = '0';

    setTimeout(() => {
        element.style.display = 'none';
    }, 300);
}

function slideDown(element) {
    if (!element) return;

    element.style.display = 'block';
    element.style.transform = 'translateY(-20px)';
    element.style.opacity = '0';

    setTimeout(() => {
        element.style.transition = 'all 0.3s ease';
        element.style.transform = 'translateY(0)';
        element.style.opacity = '1';
    }, 50);
}

// ===== PRINT QUEUE MONITORING =====
function startQueueMonitoring() {
    // Monitor print queue status for real-time updates
    setInterval(() => {
        if (currentUser) {
            checkJobUpdates();
        }
    }, 10000); // Check every 10 seconds
}

async function checkJobUpdates() {
    try {
        const response = await fetch(`${API_BASE_URL}/jobs/student/${currentUser.id}?status=pending,printing`, {
            headers: {
                'Authorization': `Bearer ${currentUser.token}`
            }
        });

        const data = await response.json();

        if (data.success && data.jobs.length > 0) {
            // Check for status changes and show notifications
            data.jobs.forEach(job => {
                // Implementation for real-time job status updates
                // This would compare with previously stored job states
            });
        }
    } catch (error) {
        console.error('Error checking job updates:', error);
    }
}

// ===== OFFLINE SUPPORT =====
window.addEventListener('online', function () {
    showNotification('Connection restored', 'success');
    if (currentUser) {
        loadDashboardData();
    }
});

window.addEventListener('offline', function () {
    showNotification('You are offline. Some features may not work.', 'warning');
});

// ===== INITIALIZATION COMPLETION =====
console.log('PrintQ Student Interface loaded successfully');

// Start additional features
setTimeout(() => {
    if (currentUser) {
        startQueueMonitoring();
    }
}, 2000);