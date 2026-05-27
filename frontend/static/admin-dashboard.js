// Admin Dashboard JavaScript

let authToken = localStorage.getItem('adminToken');
let adminUser = JSON.parse(localStorage.getItem('adminUser') || '{}');
let allCandidates = [];

// Check authentication
document.addEventListener('DOMContentLoaded', () => {
    if (!authToken) {
        window.location.href = '/admin/login.html';
        return;
    }
    
    initializeDashboard();
    setupEventListeners();
    loadAnalytics();
    loadCandidates();
    updateTimestamp();
});

function initializeDashboard() {
    document.getElementById('adminName').textContent = adminUser.name || 'Admin';
    document.getElementById('pageTitle').textContent = 'Dashboard';
}

function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.dataset.section;
            switchSection(section);
            
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });
    
    // Logout
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
        window.location.href = '/admin/login.html';
    });
    
    // Candidates section
    document.getElementById('applyFiltersBtn').addEventListener('click', applyFilters);
    document.getElementById('searchBox').addEventListener('input', applyFilters);
    
    // Modal
    document.getElementById('closeModal').addEventListener('click', () => {
        document.getElementById('candidateModal').classList.add('hidden');
    });
    
    document.getElementById('candidateModal').addEventListener('click', (e) => {
        if (e.target.id === 'candidateModal') {
            document.getElementById('candidateModal').classList.add('hidden');
        }
    });
}

function switchSection(sectionName) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.getElementById(sectionName).classList.add('active');
    
    const titles = {
        'dashboard': 'Dashboard',
        'candidates': 'Candidates',
        'analytics': 'Analytics',
        'settings': 'Settings'
    };
    document.getElementById('pageTitle').textContent = titles[sectionName] || 'Dashboard';
    
    if (sectionName === 'candidates') {
        loadCandidates();
    } else if (sectionName === 'analytics') {
        loadAnalytics();
    }
}

function updateTimestamp() {
    const now = new Date();
    document.getElementById('timestamp').textContent = now.toLocaleString();
    setInterval(() => {
        const now = new Date();
        document.getElementById('timestamp').textContent = now.toLocaleString();
    }, 60000);
}

async function loadAnalytics() {
    try {
        const response = await fetch('/admin/analytics', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (!response.ok) throw new Error('Failed to load analytics');
        
        const data = await response.json();
        
        // Update stats
        document.getElementById('totalCandidates').textContent = data.totalCandidates;
        document.getElementById('completedInterviews').textContent = data.completedInterviews;
        document.getElementById('selectedForHR').textContent = data.selectedForHR;
        document.getElementById('rejected').textContent = data.rejected;
        
        // Create charts
        createConfidenceChart(data.averageConfidenceScore);
        createRoleChart(data.roleDistribution);
        
        // Update analytics section
        updateAnalyticsSection(data);
    } catch (error) {
        console.error('Error loading analytics:', error);
    }
}

function createConfidenceChart(score) {
    const ctx = document.getElementById('confidenceChart');
    if (!ctx) return;
    
    if (window.confidenceChartInstance) {
        window.confidenceChartInstance.destroy();
    }
    
    window.confidenceChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Confidence', 'Remaining'],
            datasets: [{
                data: [score, 100 - score],
                backgroundColor: ['#3b82f6', '#e5e7eb'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

function createRoleChart(roleData) {
    const ctx = document.getElementById('roleChart');
    if (!ctx) return;
    
    if (window.roleChartInstance) {
        window.roleChartInstance.destroy();
    }
    
    const labels = Object.keys(roleData);
    const data = Object.values(roleData);
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    
    window.roleChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Candidates',
                data: data,
                backgroundColor: colors
            }]
        },
        options: {
            responsive: true,
            indexAxis: 'y',
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

function updateAnalyticsSection(data) {
    const total = data.completedInterviews;
    const selected = data.selectedForHR;
    const rejected = data.rejected;
    const pending = total - selected - rejected;
    
    const performanceHtml = `
        <div style="padding: 15px;">
            <p><strong>Average Score:</strong> ${data.averageConfidenceScore}/100</p>
            <p><strong>Completed:</strong> ${data.completedInterviews}</p>
            <p><strong>Pending Decision:</strong> ${pending}</p>
        </div>
    `;
    
    const conversionHtml = `
        <div style="padding: 15px;">
            <div style="margin-bottom: 15px;">
                <span>Completed → HR Selected</span>
                <div style="background: #e5e7eb; height: 8px; border-radius: 4px; margin-top: 5px;">
                    <div style="background: #10b981; height: 100%; width: ${(selected/total)*100}%; border-radius: 4px;"></div>
                </div>
                <small>${((selected/total)*100).toFixed(1)}%</small>
            </div>
            <div>
                <span>Completed → Rejected</span>
                <div style="background: #e5e7eb; height: 8px; border-radius: 4px; margin-top: 5px;">
                    <div style="background: #ef4444; height: 100%; width: ${(rejected/total)*100}%; border-radius: 4px;"></div>
                </div>
                <small>${((rejected/total)*100).toFixed(1)}%</small>
            </div>
        </div>
    `;
    
    document.getElementById('performanceMetrics').innerHTML = performanceHtml;
    document.getElementById('conversionFunnel').innerHTML = conversionHtml;
}

async function loadCandidates() {
    try {
        document.getElementById('candidatesList').innerHTML = '<p class="loading">Loading candidates...</p>';
        
        const response = await fetch('/admin/candidates', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (!response.ok) throw new Error('Failed to load candidates');
        
        const data = await response.json();
        allCandidates = data.candidates;
        
        displayCandidates(allCandidates);
    } catch (error) {
        console.error('Error loading candidates:', error);
        document.getElementById('candidatesList').innerHTML = `<p class="loading">Error loading candidates: ${error.message}</p>`;
    }
}

function displayCandidates(candidates) {
    if (!candidates.length) {
        document.getElementById('candidatesList').innerHTML = '<p class="loading">No candidates found.</p>';
        return;
    }
    
    const html = candidates.map(candidate => `
        <div class="candidate-item" onclick="viewCandidateDetails('${candidate.id}')">
            <div>
                <div class="candidate-name">${candidate.name}</div>
                <div class="candidate-email">${candidate.email}</div>
            </div>
            <div>
                <span class="candidate-role">${candidate.selected_role}</span>
            </div>
            <div>
                <span class="status-badge ${candidate.interviewStatus === 'completed' ? 'completed' : 'pending'}">
                    ${candidate.interviewStatus === 'completed' ? 'Completed' : 'Pending'}
                </span>
            </div>
            <div>
                <span class="score-badge ${candidate.avgScore < 4 ? 'low' : candidate.avgScore < 7 ? 'medium' : ''}">
                    ${candidate.avgScore}/10
                </span>
            </div>
            <div class="actions-group">
                <button class="btn btn-success" onclick="selectForHR('${candidate.id}', event)">Select HR</button>
                <button class="btn btn-danger" onclick="rejectCandidate('${candidate.id}', event)">Reject</button>
            </div>
        </div>
    `).join('');
    
    document.getElementById('candidatesList').innerHTML = html;
}

function applyFilters() {
    const roleFilter = document.getElementById('roleFilter').value;
    const scoreFilter = parseInt(document.getElementById('scoreFilter').value) || 0;
    const searchTerm = document.getElementById('searchBox').value.toLowerCase();
    
    let filtered = allCandidates.filter(c => {
        const matchesRole = !roleFilter || c.selected_role === roleFilter;
        const matchesScore = c.avgScore >= scoreFilter;
        const matchesSearch = !searchTerm || 
                              c.name.toLowerCase().includes(searchTerm) || 
                              c.email.toLowerCase().includes(searchTerm);
        return matchesRole && matchesScore && matchesSearch;
    });
    
    displayCandidates(filtered);
}

async function viewCandidateDetails(candidateId) {
    try {
        const response = await fetch(`/admin/candidate/${candidateId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (!response.ok) throw new Error('Failed to load candidate details');
        
        const data = await response.json();
        const candidate = data.candidate;
        const interviews = data.interviews;
        
        const latestInterview = interviews[0];
        const behaviorData = latestInterview?.behavior;
        
        let resultsList = '';
        if (latestInterview?.results) {
            resultsList = latestInterview.results.map(r => `
                <div style="margin: 15px 0; padding: 15px; background: #f9fafb; border-radius: 6px;">
                    <strong>Q${r.question_number}:</strong> ${r.question_text}
                    <p><em style="color: #6b7280;">A: ${r.answer_text}</em></p>
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 10px;">
                        <div><small>Technical: ${r.technical_accuracy}/10</small></div>
                        <div><small>Communication: ${r.communication}/10</small></div>
                        <div><small>Relevance: ${r.relevance}/10</small></div>
                        <div><small>Confidence: ${r.confidence}/10</small></div>
                    </div>
                    <p style="margin-top: 8px; color: #555; font-size: 12px;">${r.feedback}</p>
                </div>
            `).join('');
        }
        
        const behaviorSection = behaviorData ? `
            <div style="margin: 20px 0; padding: 15px; background: #ecfdf5; border-left: 4px solid #10b981; border-radius: 6px;">
                <h4>Behavior Analysis</h4>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px;">
                    <div><small>Confidence: ${behaviorData.overall_confidence}%</small></div>
                    <div><small>Stress: ${behaviorData.overall_stress}%</small></div>
                    <div><small>Eye Contact: ${behaviorData.eye_contact_avg}%</small></div>
                    <div><small>Voice Stability: ${behaviorData.voice_stability_avg}%</small></div>
                    <div><small>Blink Rate: ${behaviorData.blink_rate_avg}/min</small></div>
                    <div><small>Speaking Speed: ${behaviorData.speaking_speed_avg} wpm</small></div>
                </div>
            </div>
        ` : '';
        
        const html = `
            <div class="candidate-details">
                <div class="detail-section">
                    <h3>Candidate Information</h3>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <div class="detail-label">Name</div>
                            <div class="detail-value">${candidate.name}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Email</div>
                            <div class="detail-value">${candidate.email}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Selected Role</div>
                            <div class="detail-value">${candidate.selected_role}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Skill Level</div>
                            <div class="detail-value">${candidate.skill_level}</div>
                        </div>
                    </div>
                </div>
                
                <div class="detail-section">
                    <h3>Interview Performance</h3>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <div class="detail-label">Average Score</div>
                            <div class="detail-value">${latestInterview?.avgScore || 0}/10</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Status</div>
                            <div class="detail-value">${latestInterview?.status || 'Not Started'}</div>
                        </div>
                    </div>
                </div>
                
                ${behaviorSection}
                
                <div class="detail-section">
                    <h3>Answers & Feedback</h3>
                    ${resultsList}
                </div>
                
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button class="btn btn-success" onclick="selectForHR('${candidate.id}', null, true)">Select for HR Round</button>
                    <button class="btn btn-danger" onclick="rejectCandidate('${candidate.id}', null, true)">Reject Candidate</button>
                </div>
            </div>
        `;
        
        document.getElementById('candidateDetailContent').innerHTML = html;
        document.getElementById('candidateModal').classList.remove('hidden');
    } catch (error) {
        alert('Error loading candidate details: ' + error.message);
    }
}

function createGmailComposeLink(to, subject, body) {
    const params = new URLSearchParams({
        view: 'cm',
        fs: '1',
        to,
        su: subject,
        body,
        tf: '1'
    });
    return `https://mail.google.com/mail/?${params.toString()}`;
}

function openGmailCompose(to, subject, body) {
    const url = createGmailComposeLink(to, subject, body);
    window.open(url, '_blank');
}

function getCandidateById(candidateId) {
    return allCandidates.find(c => c.id === candidateId);
}

function selectForHR(candidateId, event, fromModal = false) {
    if (event) event.stopPropagation();

    const candidate = getCandidateById(candidateId);
    if (!candidate || !candidate.email) {
        alert('Unable to open Gmail compose: candidate email is missing.');
        return;
    }

    const subject = 'Congratulations! You Are Selected for HR Round';
    const body = `Dear ${candidate.name},\n\n` +
        'We are pleased to inform you that you have been selected for the HR round of our interview process.\n\n' +
        'Next Steps:\n' +
        '- Round: HR Interview\n' +
        '- Duration: 30-45 minutes\n' +
        '- Topics: Culture fit, experience, expectations\n\n' +
        'Please be ready and expect a calendar invite soon.\n\n' +
        'Best regards,\n' +
        'Recruitment Team';

    openGmailCompose(candidate.email, subject, body);

    if (fromModal) {
        document.getElementById('candidateModal').classList.add('hidden');
    }
}

function rejectCandidate(candidateId, event, fromModal = false) {
    if (event) event.stopPropagation();
    
    if (!confirm('Are you sure you want to reject this candidate?')) return;

    const candidate = getCandidateById(candidateId);
    if (!candidate || !candidate.email) {
        alert('Unable to open Gmail compose: candidate email is missing.');
        return;
    }

    const subject = 'Interview Application Update';
    const body = `Dear ${candidate.name},\n\n` +
        'Thank you for participating in our interview process. After careful consideration, we have decided to move forward with other applicants whose qualifications better match our current needs.\n\n' +
        'We appreciate your effort and encourage you to apply again for future opportunities.\n\n' +
        'Best regards,\n' +
        'Recruitment Team';

    openGmailCompose(candidate.email, subject, body);

    if (fromModal) {
        document.getElementById('candidateModal').classList.add('hidden');
    }
}
