document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Common Logic (includes I18n, Modals, etc.)
  if (window.AppCommon) {
    await AppCommon.init();
  } else {
    // Fallback if common.js not loaded for some reason, though it should be
    I18n.init();
  }

  const totalBookmarksElement = document.getElementById('totalBookmarks');
  
  // Display Version
  const versionElement = document.getElementById('app-version');
  if (versionElement) {
    const manifest = chrome.runtime.getManifest();
    versionElement.textContent = `v${manifest.version}`;
  }

  const checkInvalidBtn = document.getElementById('checkInvalid');
  const stopScanBtn = document.getElementById('stopScan');
  const progressBar = document.querySelector('.progress');
  const resultsContainer = document.querySelector('.results');
  const invalidList = document.getElementById('invalidList');
  const actionButtons = document.querySelector('.action-buttons');
  const selectAllInvalid = document.getElementById('selectAllInvalid');
  const deleteSelectedBtn = document.getElementById('deleteSelected');
  const cancelBtn = document.getElementById('cancel');

  const navInvalid = document.getElementById('nav-invalid');
  const invalidTabContent = document.getElementById('invalid-tab-content');
  
  // Tab switching logic (even if we only have one visible tab now, kept for structure)
  function switchTab(tab) {
    // Reset all
    if (navInvalid) navInvalid.classList.remove('active');
    if (invalidTabContent) invalidTabContent.style.display = 'none';

    if (tab === 'invalid') {
      if (navInvalid) navInvalid.classList.add('active');
      if (invalidTabContent) invalidTabContent.style.display = 'block';
    }
  }

  if (navInvalid) {
    navInvalid.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('invalid');
    });
  }

  // Statistics
  const scanDurationEl = document.getElementById('scan-duration');
  const totalBookmarksEl = document.getElementById('total-bookmarks');
  const scannedBookmarksEl = document.getElementById('scanned-bookmarks');
  const invalidLinksEl = document.getElementById('invalid-links');
  const emptyFoldersEl = document.getElementById('empty-folders');

  // Initial total count
  try {
    const bookmarks = await chrome.bookmarks.getTree();
    const allBookmarks = getAllBookmarks(bookmarks);
    const totalCount = allBookmarks.filter(b => b.url).length;
    if (totalBookmarksEl) totalBookmarksEl.textContent = totalCount;
  } catch (error) {
    console.error(error);
  }

  let currentBookmarks = [];
  let startTime;
  let scannedCount = 0;
  let invalidCount = 0;
  let emptyFolderCount = 0;
  let isScanning = false;
  let lastInvalidScanId = null;

  function updateStats() {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    if (scanDurationEl) scanDurationEl.textContent = `${duration}${I18n.t('seconds')}`;
    if (scannedBookmarksEl) scannedBookmarksEl.textContent = scannedCount;
    if (invalidLinksEl) invalidLinksEl.textContent = invalidCount;
    if (emptyFoldersEl) emptyFoldersEl.textContent = emptyFolderCount;
  }

  function getMessage(messageName) {
    return I18n.t(messageName);
  }

  function getErrorMessage(code) {
    switch (code) {
      case 400: return getMessage('errorCode_badRequest');
      case 401: return getMessage('errorCode_unauthorized');
      case 403: return getMessage('errorCode_forbidden');
      case 404: return getMessage('errorCode_notFound');
      case 405: return getMessage('errorCode_methodNotAllowed');
      case 406: return getMessage('errorCode_notAcceptable');
      case 408: return getMessage('errorCode_requestTimeout');
      case 413: return getMessage('errorCode_payloadTooLarge');
      case 414: return getMessage('errorCode_urlTooLong');
      case 429: return getMessage('errorCode_tooManyRequests');
      case 500: return getMessage('errorCode_internalServerError');
      case 502: return getMessage('errorCode_badGateway');
      case 503: return getMessage('errorCode_serviceUnavailable');
      case 504: return getMessage('errorCode_gatewayTimeout');
      default: return `${I18n.t('httpError')}: ${code}`;
    }
  }

  // Check Invalid Bookmarks
  checkInvalidBtn.addEventListener('click', async () => {
    switchTab('invalid');
    resetUI();
    
    isScanning = true;
    checkInvalidBtn.style.display = 'none';
    stopScanBtn.style.display = 'inline-flex';

    startTime = Date.now();
    
    // Get scope
    const scopeCheckboxes = document.querySelectorAll('input[name="scanScope"]:checked');
    const selectedIds = Array.from(scopeCheckboxes).map(cb => cb.value);
    
    if (selectedIds.length === 0) {
      alert(I18n.t('selectScope'));
      isScanning = false;
      checkInvalidBtn.style.display = 'inline-flex';
      stopScanBtn.style.display = 'none';
      return;
    }

    const tree = await chrome.bookmarks.getTree();
    const targets = tree[0].children.filter(node => selectedIds.includes(node.id));
    const allBookmarks = getAllBookmarks(targets);

    currentBookmarks = allBookmarks.filter(b => b.url);

    progressBar.style.display = 'block';
    resultsContainer.style.display = 'block';
    
    scannedCount = 0;
    invalidCount = 0;
    emptyFolderCount = 0;
    updateStats();
    actionButtons.style.display = 'flex';
    
    invalidList.innerHTML = ''; 
    
    // Empty folders
    const emptyFolders = getEmptyFolders(targets);
    emptyFolderCount = emptyFolders.length;
    
    for (const folder of emptyFolders) {
        const folderHtml = `
            <div class="bookmark-item">
              <input type="checkbox" data-id="${folder.id}" data-type="folder">
              <div class="bookmark-info">
                <div class="bookmark-title">📁 ${folder.title}</div>
                <div class="bookmark-url"></div>
                <div class="bookmark-path">${folder.path}</div>
                <div class="bookmark-state state-invalid">${I18n.t('emptyFolders')}</div>
              </div>
            </div>
        `;
        invalidList.insertAdjacentHTML('beforeend', folderHtml);
    }
    
    updateStats();
    
    let checkedCount = 0;
    const requestTimeout = AppCommon.requestTimeout || 15000;

    for (const bookmark of currentBookmarks) {
      if (!isScanning) break;
      
      scannedCount++
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), requestTimeout);
        
        const response = await fetch(bookmark.url, { 
          method: 'HEAD',
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.status >= 500 && response.status < 600) {
          invalidCount++;
          const bookmarkHtml = `
            <div class="bookmark-item">
              <input type="checkbox" data-id="${bookmark.id}" data-type="invalid">
              <div class="bookmark-info">
                <div class="bookmark-title">${bookmark.title}</div>
                <div class="bookmark-url">
                  <a target="_blank" href="${bookmark.url}">${bookmark.url}</a>
                </div>
                <div class="bookmark-path">${bookmark.path.replace(/>[^>]*$/, '')}</div>
                <div class="bookmark-state state-invalid">${getErrorMessage(response.status)}</div>
              </div>
            </div>
          `;
          invalidList.insertAdjacentHTML('beforeend', bookmarkHtml);
        }
      } catch (error) {
        // Network error handling if needed
      }
      checkedCount++;
      updateProgress(checkedCount / currentBookmarks.length);
      updateStats();
    }

    checkInvalidBtn.style.display = 'inline-flex';
    stopScanBtn.style.display = 'none';
    isScanning = false;

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(1);
    updateStats();
    
    let statusText = I18n.t('scanCompleted');
    if (checkedCount < currentBookmarks.length) {
        statusText = I18n.t('scanCancelled');
    }
    
    if (statusText === I18n.t('scanCompleted')) {
      lastInvalidScanId = AppCommon.addScanHistory('invalid', scannedCount, invalidCount + emptyFolderCount, duration);
    }
  });

  stopScanBtn.addEventListener('click', () => {
    isScanning = false;
  });

  selectAllInvalid.addEventListener('change', () => {
    const checkboxes = invalidList.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.checked = selectAllInvalid.checked;
    });
  });

  async function initScanScope() {
    try {
      const tree = await chrome.bookmarks.getTree();
      const rootChildren = tree[0].children;
      const container = document.getElementById('scanScopeContainer');
      if (!container) return;
      
      let html = `<span class="scope-label">${I18n.t('scanScopeLabel')}</span>`;
      rootChildren.forEach(node => {
        html += `
          <label class="scope-item">
            <input type="checkbox" name="scanScope" value="${node.id}" checked>
            ${node.title || I18n.t('rootFolder')}
          </label>
        `;
      });
      container.innerHTML = html;
    } catch (e) {
      console.error('Failed to init scan scope', e);
    }
  }

  async function updateTotalBookmarks() {
    const bookmarks = await chrome.bookmarks.getTree();
    const allBookmarks = getAllBookmarks(bookmarks);
    const totalCount = allBookmarks.filter(b => b.url).length;
    if (totalBookmarksElement) totalBookmarksElement.textContent = I18n.t('totalBookmarksLabel') + totalCount;
  }

  updateTotalBookmarks();
  initScanScope();

  // Shortcuts
  document.addEventListener('keydown', (e) => {
    // Alt + I : Invalid Scan
    if (e.altKey && (e.code === 'KeyI' || e.key === 'i')) {
        e.preventDefault();
        if (checkInvalidBtn && checkInvalidBtn.offsetParent !== null) {
            checkInvalidBtn.click();
        }
    }
    // Alt + Delete : Delete Selected
    if (e.altKey && (e.code === 'Delete' || e.code === 'Backspace')) {
        e.preventDefault();
        if (actionButtons && actionButtons.style.display !== 'none') {
            deleteSelectedBtn.click();
        }
    }
  });

  // Delete Selected
  deleteSelectedBtn.addEventListener('click', async () => {
    let currentList = invalidList;
    let selectAllBox = selectAllInvalid;

    const selectedCheckboxes = Array.from(currentList.querySelectorAll('input[type="checkbox"]:checked'));
    if (selectedCheckboxes.length === 0) {
      alert(I18n.t('selectItem'));
      return;
    }

    const itemsToDelete = selectedCheckboxes.map(checkbox => ({
      id: checkbox.dataset.id,
      type: checkbox.dataset.type || 'bookmark',
      checkbox
    }));

    // Remove from UI
    itemsToDelete.forEach(item => {
      const bookmarkItem = item.checkbox.closest('.bookmark-item');
      if (bookmarkItem) {
        bookmarkItem.remove();
      }

      if (item.type === 'folder') {
        emptyFolderCount = Math.max(0, emptyFolderCount - 1);
      } else if (item.type === 'invalid') {
        invalidCount = Math.max(0, invalidCount - 1);
      }
    });

    // Move to Recycle Bin via AppCommon
    const itemsForCommon = itemsToDelete.map(i => ({ id: i.id }));
    const successCount = await AppCommon.moveToRecycleBin(itemsForCommon);
      
    // Update local list
    itemsToDelete.forEach(item => {
      const index = currentBookmarks.findIndex(b => b.id === item.id);
      if (index !== -1) {
        currentBookmarks.splice(index, 1);
      }
    });

    updateStats();
    
    if (lastInvalidScanId) {
        AppCommon.updateHistoryCleaned(lastInvalidScanId, successCount);
    }
    alert(I18n.t('moveToRecycleSuccess', { count: successCount }));
    selectAllBox.checked = false;
  });

  cancelBtn.addEventListener('click', resetUI);

  function getAllBookmarks(bookmarkItems, path = [], result = []) {
    for (const item of bookmarkItems) {
      const currentPath = [...path, item.title];
      if (item.url) {
        result.push({
          ...item,
          path: currentPath.join(' > ')
        });
      }
      if (item.children) {
        getAllBookmarks(item.children, currentPath, result);
      }
    }
    return result;
  }

  function getEmptyFolders(bookmarkItems, path = [], result = []) {
    for (const item of bookmarkItems) {
      const currentPath = [...path, item.title];
      if (item.children) {
        if (item.children.length === 0) {
           result.push({
             id: item.id,
             title: item.title,
             path: currentPath.join(' > ')
           });
        } else {
          getEmptyFolders(item.children, currentPath, result);
        }
      }
    }
    return result;
  }

  function updateProgress(percentage) {
    const progress = Math.round(percentage * 100);
    const progressCircle = document.querySelector('.progress-circle-fill');
    const progressText = document.querySelector('.progress-percentage');
    if (progressCircle) {
        const circumference = 2 * Math.PI * 45;
        const offset = circumference - (progress / 100) * circumference;
        progressCircle.style.strokeDashoffset = offset;
    }
    if (progressText) {
        progressText.textContent = `${progress}%`;
    }
  }

  function resetUI() {
    progressBar.style.display = 'none';
    resultsContainer.style.display = 'none';
    actionButtons.style.display = 'none';
    if (selectAllInvalid) selectAllInvalid.checked = false;
  }
});
