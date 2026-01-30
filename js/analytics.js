document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Common Logic (includes I18n, Modals, etc.)
    if (window.AppCommon) {
        await AppCommon.init();
    } else {
        I18n.init();
    }
    
    // Bind events
    document.getElementById('runAnalysis').addEventListener('click', runAnalysis);

    // Initial load (try to load from storage or run analysis if empty)
    loadLastAnalysis();
});

async function runAnalysis() {
    const btn = document.getElementById('runAnalysis');
    const originalText = btn.textContent;
    btn.textContent = I18n.t('loading');
    btn.disabled = true;

    try {
        const tree = await chrome.bookmarks.getTree();
        const bookmarks = getAllBookmarks(tree);
        
        // 1. Basic Stats
        const totalCount = bookmarks.length;
        const emptyFolders = countEmptyFolders(tree[0]);
        
        // 2. Duplicates (Fast check)
        const duplicateCount = countDuplicates(bookmarks);

        // 3. Usage & Zombies
        const { mostUsed, zombies, usageMap } = await analyzeUsage(bookmarks);

        // 4. Domains & Time
        const domainStats = analyzeDomains(bookmarks);
        const timeStats = analyzeTime(bookmarks);

        // 5. Invalid Count (Retrieve from last invalid scan or 0)
        let invalidCount = 0;
        if (window.AppCommon) {
            const history = AppCommon.getScanHistory();
            const lastInvalidScan = history.find(h => h.type === 'invalid');
            if (lastInvalidScan) {
                invalidCount = lastInvalidScan.found - lastInvalidScan.cleaned;
                if (invalidCount < 0) invalidCount = 0;
            }
        }

        // 6. Calculate Health Score
        const score = calculateHealthScore(totalCount, duplicateCount, emptyFolders, invalidCount);

        // 7. Render Dashboard
        renderHealthScore(score, totalCount, duplicateCount, emptyFolders, invalidCount);
        renderUsageStats(mostUsed, zombies);
        renderCharts(timeStats, domainStats);
        
        // 8. Trends
        updateTrends({
            total: totalCount,
            invalid: invalidCount,
            duplicate: duplicateCount,
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('Analysis failed:', error);
        alert(I18n.t('errorCode_internalServerError'));
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

function getAllBookmarks(nodes) {
    let bookmarks = [];
    nodes.forEach(node => {
        if (node.url) {
            bookmarks.push(node);
        }
        if (node.children) {
            bookmarks = bookmarks.concat(getAllBookmarks(node.children));
        }
    });
    return bookmarks;
}

function countEmptyFolders(node) {
    let count = 0;
    if (!node.url && node.children) {
        if (node.children.length === 0) {
            count++;
        } else {
            node.children.forEach(child => {
                count += countEmptyFolders(child);
            });
        }
    }
    return count;
}

function countDuplicates(bookmarks) {
    const urlMap = new Set();
    let duplicates = 0;
    bookmarks.forEach(b => {
        if (urlMap.has(b.url)) {
            duplicates++;
        } else {
            urlMap.add(b.url);
        }
    });
    return duplicates;
}

async function analyzeUsage(bookmarks) {
    // If history permission is not available/working, fallback to dateAdded
    let usageMap = new Map(); // url -> visitCount
    let hasHistory = false;

    if (chrome.history) {
        try {
            // We can't query all 1000s of bookmarks efficiently one by one.
            // Strategy: Get top visited URLs from history (last 90 days) and map to bookmarks.
            // Or assume we only check top X bookmarks?
            // Better: search history for each bookmark is too slow.
            // Alternative: chrome.history.search({text: '', maxResults: 10000}) to get global top visited.
            
            const historyItems = await chrome.history.search({
                text: '',
                startTime: 0,
                maxResults: 5000
            });
            
            historyItems.forEach(item => {
                usageMap.set(item.url, {
                    visitCount: item.visitCount,
                    lastVisitTime: item.lastVisitTime
                });
            });
            hasHistory = true;
        } catch (e) {
            console.warn('History API error:', e);
        }
    }

    // Most Used: Filter bookmarks that exist in history map
    let mostUsed = [];
    if (hasHistory) {
        mostUsed = bookmarks.map(b => {
            const history = usageMap.get(b.url);
            return {
                ...b,
                visitCount: history ? history.visitCount : 0,
                lastVisitTime: history ? history.lastVisitTime : 0
            };
        })
        .filter(b => b.visitCount > 0)
        .sort((a, b) => b.visitCount - a.visitCount)
        .slice(0, 10);
    }

    // Zombies: Oldest added, AND (if history avail) no visits in last 90 days
    const threeMonthsAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    
    let zombies = bookmarks.map(b => {
        const history = usageMap.get(b.url);
        return {
            ...b,
            lastVisitTime: history ? history.lastVisitTime : 0
        };
    });

    if (hasHistory) {
        zombies = zombies.filter(b => b.lastVisitTime < threeMonthsAgo && b.dateAdded < threeMonthsAgo);
    } else {
        // Fallback: Just oldest added
        zombies = zombies.filter(b => b.dateAdded < threeMonthsAgo);
    }
    
    zombies.sort((a, b) => a.dateAdded - b.dateAdded).slice(0, 10); // Oldest first

    return { mostUsed, zombies: zombies.slice(0, 10), usageMap };
}

function analyzeDomains(bookmarks) {
    const domains = {};
    bookmarks.forEach(b => {
        try {
            const url = new URL(b.url);
            const domain = url.hostname.replace(/^www\./, '');
            domains[domain] = (domains[domain] || 0) + 1;
        } catch (e) {}
    });
    
    return Object.entries(domains)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8); // Top 8
}

function analyzeTime(bookmarks) {
    const timeline = {};
    bookmarks.forEach(b => {
        if (b.dateAdded) {
            const date = new Date(b.dateAdded);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            timeline[key] = (timeline[key] || 0) + 1;
        }
    });
    
    // Sort keys
    return Object.entries(timeline).sort((a, b) => a[0].localeCompare(b[0])).slice(-12); // Last 12 months with data
}

function calculateHealthScore(total, duplicates, emptyFolders, invalid) {
    // Base 100
    // Penalties:
    // Duplicate: -5 per group (approx) -> simplify to -2 per duplicate
    // Empty Folder: -1
    // Invalid: -5
    
    if (total === 0) return 100;

    let penalty = (duplicates * 2) + (emptyFolders * 1) + (invalid * 5);
    // Normalize by size? No, absolute errors are bad.
    // But limit min score to 0.
    
    // Alternative: Percentage based
    // Invalid % * 100
    // Duplicate % * 50
    
    const invalidRatio = invalid / total;
    const duplicateRatio = duplicates / total;
    
    let score = 100 - (invalidRatio * 200) - (duplicateRatio * 100) - (emptyFolders * 2);
    return Math.max(0, Math.min(100, Math.round(score)));
}

function renderHealthScore(score, total, dupes, empty, invalid) {
    const scoreEl = document.getElementById('healthScoreValue');
    const circle = document.querySelector('.score-circle');
    const statusText = document.getElementById('healthStatusText');
    
    // Animate score?
    scoreEl.textContent = score;
    
    circle.className = 'score-circle'; // Reset
    if (score >= 90) {
        circle.classList.add('excellent');
        statusText.textContent = I18n.t('excellent');
        statusText.style.color = '#4CAF50';
    } else if (score >= 70) {
        circle.classList.add('good');
        statusText.textContent = I18n.t('good');
        statusText.style.color = '#2196F3';
    } else {
        circle.classList.add('poor');
        statusText.textContent = I18n.t('poor');
        statusText.style.color = '#F44336';
    }

    document.getElementById('metricInvalid').textContent = invalid;
    document.getElementById('metricDuplicate').textContent = dupes;
    document.getElementById('metricEmpty').textContent = empty;
}

function renderUsageStats(mostUsed, zombies) {
    const renderList = (list, containerId, isUsage) => {
        const ul = document.getElementById(containerId);
        ul.innerHTML = '';
        if (list.length === 0) {
            ul.innerHTML = `<li>${I18n.t('errorCode_notFound')}</li>`;
            return;
        }
        
        list.forEach(b => {
            const li = document.createElement('li');
            const date = new Date(b.dateAdded).toLocaleDateString();
            const info = isUsage ? `${b.visitCount} visits` : `Added: ${date}`;
            
            li.innerHTML = `
                <div class="url-text" title="${b.title}\n${b.url}">
                    ${b.title || b.url}
                </div>
                <div class="visit-count">${info}</div>
            `;
            ul.appendChild(li);
        });
    };

    renderList(mostUsed, 'mostUsedList', true);
    renderList(zombies, 'zombieList', false);
}

function renderCharts(timeStats, domainStats) {
    // Time Chart
    const timeContainer = document.getElementById('timeChart');
    timeContainer.innerHTML = '';
    const maxTime = Math.max(...timeStats.map(s => s[1]), 1);
    
    timeStats.forEach(([label, value]) => {
        const height = (value / maxTime) * 100; // percent of max height (which is 200px approx)
        // Adjust for container height 200px, keep some padding
        const barHeight = Math.max(height * 0.8, 2); // 80% max height
        
        const bar = document.createElement('div');
        bar.className = 'bar-chart-bar';
        bar.style.height = `${barHeight}%`;
        bar.style.width = '20px';
        bar.style.margin = '0 5px';
        bar.title = `${label} : ${value}`;
        
        bar.innerHTML = `
            <div class="bar-value">${value}</div>
            <div class="bar-label">${label.split('-')[1]}</div> <!-- Show Month -->
        `;
        timeContainer.appendChild(bar);
    });

    // Domain Chart (Simulated horizontal bars or list)
    const domainContainer = document.getElementById('domainChart');
    domainContainer.innerHTML = '';
    // Use horizontal bars for domains
    domainContainer.style.flexDirection = 'column';
    domainContainer.style.alignItems = 'flex-start';
    domainContainer.style.justifyContent = 'flex-start';
    domainContainer.style.padding = '10px';
    domainContainer.style.overflowY = 'auto';

    const maxDomain = Math.max(...domainStats.map(s => s[1]), 1);

    domainStats.forEach(([domain, count]) => {
        const width = (count / maxDomain) * 100;
        const row = document.createElement('div');
        row.style.width = '100%';
        row.style.marginBottom = '8px';
        row.innerHTML = `
            <div style="font-size:12px; margin-bottom:2px; display:flex; justify-content:space-between;">
                <span>${domain}</span>
                <span>${count}</span>
            </div>
            <div style="background:#eee; height:8px; border-radius:4px; width:100%;">
                <div style="background:#4CAF50; height:100%; width:${width}%; border-radius:4px;"></div>
            </div>
        `;
        domainContainer.appendChild(row);
    });
}

function updateTrends(current) {
    const historyKey = 'analytics_history';
    let history = JSON.parse(localStorage.getItem(historyKey) || '[]');
    
    // Add current if not exists (or replace last if very recent?)
    // Just append for now
    history.push(current);
    if (history.length > 10) history.shift(); // Keep last 10
    localStorage.setItem(historyKey, JSON.stringify(history));

    // Compare with previous (or first in history?)
    // Let's compare with the one before current
    const prev = history.length > 1 ? history[history.length - 2] : null;
    
    const renderTrend = (id, currentVal, prevVal) => {
        const el = document.getElementById(id);
        const changeEl = document.getElementById(id + 'Change');
        
        el.textContent = currentVal;
        
        if (prevVal !== undefined && prevVal !== null) {
            const diff = currentVal - prevVal;
            const sign = diff > 0 ? '+' : '';
            changeEl.textContent = `${sign}${diff}`;
            
            // Color logic
            if (diff === 0) {
                changeEl.className = 'trend-change neutral';
            } else if (id === 'trendTotal') {
                changeEl.className = diff > 0 ? 'trend-change down' : 'trend-change up'; // Usually gaining bookmarks is neutral, but losing might be cleanup (good) or loss (bad). Context: "Cleaner" app -> losing is usually good (cleanup).
                // Actually, total bookmarks trend is ambiguous. Let's make it neutral or green if down (cleanup).
                changeEl.className = diff < 0 ? 'trend-change down' : 'trend-change neutral';
            } else {
                // Invalid/Duplicate: Down is good (Green), Up is bad (Red)
                changeEl.className = diff < 0 ? 'trend-change down' : 'trend-change up';
            }
        } else {
            changeEl.textContent = '-';
        }
    };

    renderTrend('trendTotal', current.total, prev ? prev.total : null);
    renderTrend('trendInvalid', current.invalid, prev ? prev.invalid : null);
    renderTrend('trendDuplicate', current.duplicate, prev ? prev.duplicate : null);
    
    const date = new Date(current.timestamp);
    document.getElementById('lastScanTime').textContent = date.toLocaleString();
}

function loadLastAnalysis() {
    const historyKey = 'analytics_history';
    const history = JSON.parse(localStorage.getItem(historyKey) || '[]');
    if (history.length > 0) {
        const last = history[history.length - 1];
        // We can't fully render charts without data, so maybe just render trends?
        // Or just run analysis automatically? 
        // Let's run analysis automatically if it's been a while, or just show "Run Analysis" prompt.
        // For now, let's auto-run to populate the dashboard.
        runAnalysis();
    } else {
        // No history, auto run
        runAnalysis();
    }
}
