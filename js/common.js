const AppCommon = {
    restoreMap: {},

    async init() {
        console.log('AppCommon init started');
        if (window.I18n) {
            I18n.init();
        }
        this.loadSettings();
        this.applyTheme();
        this.injectModals();
        this.bindEvents();
        this.loadRestoreMap();
        console.log('AppCommon init finished');
    },

    injectModals() {
        if (document.getElementById('settingsModal')) {
            console.log('Modals already exist, skipping injection');
            return;
        }
        console.log('Injecting modals');

        const modalHTML = `
        <div id="settingsModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2 data-i18n="scanSettings">扫描设置</h2>
                    <span class="close-modal">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="setting-item">
                        <label data-i18n="language">语言</label>
                        <select id="languageSelect" class="form-select">
                            <option value="zh_CN">中文</option>
                            <option value="en_US">English</option>
                        </select>
                    </div>
                    <div class="setting-item">
                        <label data-i18n="theme">主题</label>
                        <select id="themeSelect" class="form-select">
                            <option value="system">系统</option>
                            <option value="light">浅色</option>
                            <option value="dark">深色</option>
                        </select>
                    </div>
                    <div class="setting-item">
                        <label for="timeoutRange" data-i18n="timeoutRange">请求超时时间 (秒)</label>
                        <div class="range-container">
                            <input type="range" id="timeoutRange" min="5" max="60" value="15" step="1">
                            <span id="timeoutValue">15s</span>
                        </div>
                        <p class="setting-desc" data-i18n="timeoutDesc">建议设置在 10-15 秒之间，时间过短可能导致误判。</p>
                    </div>
                    <div class="setting-item">
                        <label data-i18n="shortcuts">快捷键</label>
                        <div class="shortcut-list">
                            <div class="shortcut-item">
                                <span data-i18n="checkInvalid">失效书签检测</span>
                                <span class="kbd">Alt + I</span>
                            </div>
                            <div class="shortcut-item">
                                <span data-i18n="checkDuplicate">重复书签检测</span>
                                <span class="kbd">Alt + D</span>
                            </div>
                            <div class="shortcut-item">
                                <span data-i18n="deleteSelected">删除选中书签</span>
                                <span class="kbd">Alt + Del</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="saveSettings" data-i18n="save">保存</button>
                </div>
            </div>
        </div>

        <div id="historyModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2 data-i18n="scanHistory">扫描历史</h2>
                    <span class="close-modal close-history">&times;</span>
                </div>
                <div class="modal-body">
                    <div id="historyList" class="history-list">
                        <!-- Items -->
                    </div>
                    <div style="text-align: center; margin-top: 15px;">
                        <button id="clearHistory" style="background-color: var(--text-secondary); padding: 8px 16px; font-size: 14px;" data-i18n="clearHistory">清空历史</button>
                    </div>
                </div>
            </div>
        </div>

        <div id="recycleBinModal" class="modal">
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header">
                    <h2 data-i18n="recycleBinTitle">书签回收站</h2>
                    <span class="close-modal close-recycle">&times;</span>
                </div>
                <div class="modal-body">
                    <div style="margin-bottom: 15px; font-size: 13px; color: var(--text-secondary);">
                        <p data-i18n="recycleBinDesc">这里显示“书签回收站”文件夹中的所有内容。您可以将它们恢复到原来的位置。</p>
                    </div>
                    <div id="recycleList" class="bookmark-list" style="height: 400px;">
                        <!-- Items -->
                    </div>
                    <div style="text-align: center; margin-top: 15px; display: flex; justify-content: flex-end; gap: 10px;">
                        <button id="restoreSelected" style="background-color: var(--success-color);" data-i18n="restoreSelected">恢复选中</button>
                        <button id="emptyRecycleBin" style="background-color: var(--danger-color);" data-i18n="emptyRecycleBin">清空回收站</button>
                    </div>
                </div>
            </div>
        </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Re-translate new content
        if (window.I18n) {
            I18n.translatePage();
        }
    },

    bindEvents() {
        // Modal toggles
        this.bindModal('openSettings', 'settingsModal', 'close-modal');
        this.bindModal('openHistory', 'historyModal', 'close-history', () => this.renderHistory());
        this.bindModal('openRecycleBin', 'recycleBinModal', 'close-recycle', () => this.renderRecycleBin());

        // Settings
        const saveSettingsBtn = document.getElementById('saveSettings');
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        }

        const timeoutRange = document.getElementById('timeoutRange');
        if (timeoutRange) {
            timeoutRange.addEventListener('input', () => {
                document.getElementById('timeoutValue').textContent = `${timeoutRange.value}s`;
            });
        }

        // History
        const clearHistoryBtn = document.getElementById('clearHistory');
        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener('click', () => this.clearHistory());
        }

        // Recycle Bin
        const restoreSelectedBtn = document.getElementById('restoreSelected');
        if (restoreSelectedBtn) {
            restoreSelectedBtn.addEventListener('click', () => this.restoreSelected());
        }

        const emptyRecycleBinBtn = document.getElementById('emptyRecycleBin');
        if (emptyRecycleBinBtn) {
            emptyRecycleBinBtn.addEventListener('click', () => this.emptyRecycleBin());
        }

        // Global click to close modals
        window.addEventListener('click', (e) => {
            ['settingsModal', 'historyModal', 'recycleBinModal'].forEach(id => {
                const modal = document.getElementById(id);
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            });
        });
    },

    bindModal(btnId, modalId, closeClass, onOpen) {
        const btn = document.getElementById(btnId);
        const modal = document.getElementById(modalId);
        
        if (!btn) console.warn(`Button ${btnId} not found`);
        if (!modal) console.warn(`Modal ${modalId} not found`);
        
        if (!btn || !modal) return;

        console.log(`Binding modal ${modalId} to button ${btnId}`);

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (onOpen) onOpen();
            modal.style.display = 'block';
            
            // If settings, init values
            if (modalId === 'settingsModal') {
                this.initSettingsModal();
            }
        });

        const closeBtn = modal.querySelector('.' + closeClass);
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.style.display = 'none';
            });
        }
    },

    // --- Settings ---
    loadSettings() {
        const savedTimeout = localStorage.getItem('scanTimeout');
        this.requestTimeout = savedTimeout ? parseInt(savedTimeout, 10) : 15000;
        const savedTheme = localStorage.getItem('themeMode');
        this.themeMode = savedTheme || 'system';
    },

    initSettingsModal() {
        const timeoutRange = document.getElementById('timeoutRange');
        const timeoutValue = document.getElementById('timeoutValue');
        const languageSelect = document.getElementById('languageSelect');
        const themeSelect = document.getElementById('themeSelect');

        if (timeoutRange) {
            timeoutRange.value = this.requestTimeout / 1000;
            timeoutValue.textContent = `${timeoutRange.value}s`;
        }

        if (languageSelect && window.I18n) {
            languageSelect.value = I18n.currentLocale;
        }
        if (themeSelect) {
            themeSelect.value = this.themeMode;
            if (window.I18n) {
                themeSelect.options[0].text = I18n.t('themeSystem');
                themeSelect.options[1].text = I18n.t('themeLight');
                themeSelect.options[2].text = I18n.t('themeDark');
            }
        }
    },

    saveSettings() {
        const timeoutRange = document.getElementById('timeoutRange');
        const languageSelect = document.getElementById('languageSelect');
        const themeSelect = document.getElementById('themeSelect');
        
        if (timeoutRange) {
            const val = parseInt(timeoutRange.value, 10);
            this.requestTimeout = val * 1000;
            localStorage.setItem('scanTimeout', this.requestTimeout);
        }

        if (languageSelect && window.I18n) {
            const newLang = languageSelect.value;
            if (newLang !== I18n.currentLocale) {
                I18n.setLanguage(newLang);
                location.reload(); // Reload to apply changes everywhere properly
            }
        }
        if (themeSelect) {
            const newTheme = themeSelect.value;
            this.themeMode = newTheme;
            localStorage.setItem('themeMode', newTheme);
            this.applyTheme();
        }

        document.getElementById('settingsModal').style.display = 'none';
    },
    
    applyTheme() {
        const root = document.documentElement;
        if (this.themeMode === 'system') {
            const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            root.setAttribute('data-theme', isDark ? 'dark' : 'light');
            this.setupSystemThemeListener();
        } else {
            root.setAttribute('data-theme', this.themeMode);
        }
    },
    
    setupSystemThemeListener() {
        if (!this._mediaQuery) {
            this._mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            const handler = () => {
                if (this.themeMode === 'system') {
                    document.documentElement.setAttribute('data-theme', this._mediaQuery.matches ? 'dark' : 'light');
                }
            };
            this._mediaQuery.addEventListener('change', handler);
        }
    },

    // --- History ---
    getScanHistory() {
        try {
            return JSON.parse(localStorage.getItem('scanHistory') || '[]');
        } catch (e) {
            return [];
        }
    },

    addScanHistory(type, total, found, duration) {
        const history = this.getScanHistory();
        const record = {
            id: Date.now(),
            date: new Date().toLocaleString(),
            type,
            total,
            found,
            cleaned: 0,
            duration
        };
        history.unshift(record);
        if (history.length > 50) history.pop();
        localStorage.setItem('scanHistory', JSON.stringify(history));
        return record.id;
    },

    updateHistoryCleaned(scanId, count) {
        if (!scanId) return;
        const history = this.getScanHistory();
        const index = history.findIndex(item => item.id === scanId);
        if (index !== -1) {
            history[index].cleaned += count;
            localStorage.setItem('scanHistory', JSON.stringify(history));
        }
    },

    renderHistory() {
        const historyList = document.getElementById('historyList');
        const history = this.getScanHistory();
        
        if (history.length === 0) {
            historyList.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-secondary);">${I18n.t('noHistory')}</div>`;
            return;
        }

        historyList.innerHTML = history.map(item => `
            <div class="history-item">
                <div class="history-date">${item.date}</div>
                <div class="history-detail">
                    <span>
                        <strong>${item.type === 'invalid' ? I18n.t('invalidScan') : I18n.t('duplicateScan')}</strong>
                        <span style="color: var(--text-secondary); margin-left: 8px;">(${item.duration}s)</span>
                    </span>
                    <span>
                        <span style="color: var(--text-secondary);">${I18n.t('scanLabel')}${item.total}</span>
                        <span style="margin: 0 8px; color: ${item.found > 0 ? 'var(--danger-color)' : 'var(--success-color)'};">${I18n.t('foundLabel')}${item.found}</span>
                        <span style="color: var(--primary-color);">${I18n.t('cleanedLabel')}${item.cleaned}</span>
                    </span>
                </div>
            </div>
        `).join('');
    },

    clearHistory() {
        if (confirm(I18n.t('confirmClearHistory'))) {
            localStorage.removeItem('scanHistory');
            this.renderHistory();
        }
    },

    // --- Recycle Bin ---
    loadRestoreMap() {
        try {
            this.restoreMap = JSON.parse(localStorage.getItem('restoreMap') || '{}');
        } catch (e) {
            this.restoreMap = {};
        }
    },

    saveRestoreMap() {
        localStorage.setItem('restoreMap', JSON.stringify(this.restoreMap));
    },

    async getOrCreateRecycleBin() {
        const recycleBinTitle = I18n.t('recycleBinTitle');
        // Need to be careful: I18n might change, so searching by title is risky if lang changes.
        // Ideally we store ID. But for now stick to logic.
        // Actually, let's search for "Bookmakr Recycle Bin" or localized.
        // Better: search by title in current locale.
        
        const searchResults = await chrome.bookmarks.search({ title: recycleBinTitle });
        const existingFolder = searchResults.find(node => !node.url);
        
        if (existingFolder) {
            return existingFolder.id;
        } else {
            const newFolder = await chrome.bookmarks.create({
                title: recycleBinTitle
            });
            return newFolder.id;
        }
    },

    async renderRecycleBin() {
        const recycleList = document.getElementById('recycleList');
        const recycleBinId = await this.getOrCreateRecycleBin();
        const children = await chrome.bookmarks.getChildren(recycleBinId);

        if (children.length === 0) {
            recycleList.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-secondary);">${I18n.t('recycleBinEmpty')}</div>`;
            return;
        }

        recycleList.innerHTML = children.map(item => `
            <div class="bookmark-item">
                <input type="checkbox" data-id="${item.id}">
                <div class="bookmark-info">
                    <div class="bookmark-title">${item.title}</div>
                    <div class="bookmark-url">
                        <a target="_blank" href="${item.url}">${item.url || '文件夹'}</a>
                    </div>
                    <div class="bookmark-path" style="font-size: 11px; margin-top: 2px; color: var(--text-secondary);">
                        ${this.restoreMap[item.id] ? I18n.t('restoreMapFound') : I18n.t('restoreMapUnknown')}
                    </div>
                </div>
            </div>
        `).join('');
    },

    async restoreSelected() {
        const recycleList = document.getElementById('recycleList');
        const checkboxes = Array.from(recycleList.querySelectorAll('input[type="checkbox"]:checked'));
        if (checkboxes.length === 0) {
            alert(I18n.t('selectItem'));
            return;
        }

        let successCount = 0;
        for (const checkbox of checkboxes) {
            const id = checkbox.dataset.id;
            const meta = this.restoreMap[id];
            
            try {
                if (meta && meta.parentId) {
                    try {
                        await chrome.bookmarks.move(id, { parentId: meta.parentId });
                    } catch (err) {
                        console.warn('Restore to original parent failed', err);
                        continue;
                    }
                } else {
                    continue;
                }
                
                successCount++;
                delete this.restoreMap[id];
            } catch (e) {
                console.error('Restore failed', e);
            }
        }
        this.saveRestoreMap();
        await this.renderRecycleBin();
        alert(I18n.t('restoreCountSuccess', { count: successCount }));
    },

    async emptyRecycleBin() {
        if (!confirm(I18n.t('confirmEmptyRecycle'))) return;
        
        const recycleBinId = await this.getOrCreateRecycleBin();
        const children = await chrome.bookmarks.getChildren(recycleBinId);
        
        for (const child of children) {
            await chrome.bookmarks.removeTree(child.id);
            if (this.restoreMap[child.id]) {
                delete this.restoreMap[child.id];
            }
        }
        this.saveRestoreMap();
        await this.renderRecycleBin();
    },

    // Helper to be used by other pages to save restore info before delete
    async moveToRecycleBin(itemsToDelete) {
        const recycleBinId = await this.getOrCreateRecycleBin();
        let successCount = 0;

        for (const item of itemsToDelete) {
            try {
                if (item.id === recycleBinId) continue;

                // Save restore info
                try {
                    const [node] = await chrome.bookmarks.get(item.id);
                    if (node) {
                        this.restoreMap[item.id] = {
                            id: item.id,
                            parentId: node.parentId,
                            index: node.index,
                            dateDeleted: Date.now()
                        };
                    }
                } catch (err) {
                    console.warn('Failed to get bookmark info for restore', err);
                }

                await chrome.bookmarks.move(item.id, { parentId: recycleBinId });
                successCount++;
            } catch (e) {
                console.error('Move to recycle bin failed', e);
            }
        }
        this.saveRestoreMap();
        return successCount;
    }
};

// Make it global
window.AppCommon = AppCommon;
