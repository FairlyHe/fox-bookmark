document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Common Logic (includes I18n, Modals, etc.)
  if (window.AppCommon) {
    await AppCommon.init();
  } else {
    I18n.init();
  }

  const totalBookmarksElement = document.getElementById('totalBookmarks');
  
  // Display Version
  const versionElement = document.getElementById('app-version');
  if (versionElement) {
    const manifest = chrome.runtime.getManifest();
    versionElement.textContent = `v${manifest.version}`;
  }

  const checkDuplicateBtn = document.getElementById('checkDuplicate');
  const resultsContainer = document.querySelector('.results');
  const duplicateList = document.getElementById('duplicateList');
  const actionButtons = document.querySelector('.action-buttons');
  const selectAllDuplicate = document.getElementById('selectAllDuplicate');
  const deleteSelectedBtn = document.getElementById('deleteSelected');
  const smartSelectBtn = document.getElementById('smartSelect');
  const cancelBtn = document.getElementById('cancel');

  // Statistics
  const scanDurationEl = document.getElementById('scan-duration');
  const totalBookmarksEl = document.getElementById('total-bookmarks');
  const scannedBookmarksEl = document.getElementById('scanned-bookmarks');
  const duplicateUrlsEl = document.getElementById('duplicate-urls');
  const duplicateBookmarksEl = document.getElementById('duplicate-bookmarks');

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
  let duplicateUrlsCount = 0;
  let duplicateBookmarksCount = 0;
  let lastDuplicateScanId = null;

  function updateStats() {
    const duration = startTime ? ((Date.now() - startTime) / 1000).toFixed(1) : 0;

    if (scanDurationEl) scanDurationEl.textContent = `${duration}${I18n.t('seconds')}`;
    if (scannedBookmarksEl) scannedBookmarksEl.textContent = scannedCount;
    if (duplicateUrlsEl) duplicateUrlsEl.textContent = duplicateUrlsCount;
    if (duplicateBookmarksEl) duplicateBookmarksEl.textContent = duplicateBookmarksCount;
  }

  function getMessage(messageName) {
    return I18n.t(messageName);
  }

  // Check Duplicate Bookmarks
  checkDuplicateBtn.addEventListener('click', async () => {
    resetUI();
    startTime = Date.now();
    
    // Get scope
    const scopeCheckboxes = document.querySelectorAll('input[name="scanScope"]:checked');
    const selectedIds = Array.from(scopeCheckboxes).map(cb => cb.value);
    
    if (selectedIds.length === 0) {
      alert(I18n.t('selectScope'));
      return;
    }

    const tree = await chrome.bookmarks.getTree();
    const targets = tree[0].children.filter(node => selectedIds.includes(node.id));
    const allBookmarks = getAllBookmarks(targets);
    currentBookmarks = allBookmarks.filter(b => b.url);

    scannedCount = currentBookmarks.length;
    duplicateUrlsCount = 0;
    duplicateBookmarksCount = 0;
    updateStats();

    const urlMap = new Map();

    // Group by URL
    currentBookmarks.forEach(bookmark => {
      const normalizedUrl = normalizeUrl(bookmark.url);
      if (!urlMap.has(normalizedUrl)) {
        urlMap.set(normalizedUrl, []);
      }
      urlMap.get(normalizedUrl).push(bookmark);
    });

    // Filter duplicates
    const duplicateGroups = Array.from(urlMap.entries())
      .filter(([_, bookmarks]) => bookmarks.length > 1)
      .map(([url, bookmarks]) => ({ url, bookmarks }));

    duplicateUrlsCount = duplicateGroups.length;
    duplicateBookmarksCount = duplicateGroups.reduce((acc, group) => acc + group.bookmarks.length, 0);

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(1);
    updateStats();
    displayResults(duplicateGroups, I18n.t('duplicate'), duration);

    const totalFound = duplicateBookmarksCount;
    lastDuplicateScanId = AppCommon.addScanHistory('duplicate', scannedCount, totalFound, duration);
  });

  selectAllDuplicate.addEventListener('change', () => {
    const checkboxes = duplicateList.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.checked = selectAllDuplicate.checked;
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

  // Smart Select
  smartSelectBtn.addEventListener('click', () => {
    const groups = document.querySelectorAll('.duplicate-group');
    let totalChecked = 0;

    groups.forEach(group => {
      const checkboxes = Array.from(group.querySelectorAll('input[type="checkbox"]'));
      if (checkboxes.length <= 1) return;

      checkboxes.forEach(cb => cb.checked = false);

      checkboxes.sort((a, b) => {
        const dateA = parseInt(a.dataset.dateAdded) || 0;
        const dateB = parseInt(b.dataset.dateAdded) || 0;
        return dateA - dateB;
      });

      for (let i = 1; i < checkboxes.length; i++) {
        checkboxes[i].checked = true;
        totalChecked++;
      }
    });
    
    alert(I18n.t('smartKeepAlert', { count: totalChecked }));
  });

  // Shortcuts
  document.addEventListener('keydown', (e) => {
    // Alt + D : Duplicate Scan
    if (e.altKey && (e.code === 'KeyD' || e.key === 'd')) {
        e.preventDefault();
        if (checkDuplicateBtn) checkDuplicateBtn.click();
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
    const currentList = duplicateList;
    const selectAllBox = selectAllDuplicate;

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

    // Remove empty groups
    const groups = currentList.querySelectorAll('.duplicate-group');
    groups.forEach(group => {
        if (group.querySelectorAll('.bookmark-item').length === 0) {
            group.remove();
        }
    });
    
    const remainingGroups = currentList.querySelectorAll('.duplicate-group').length;
    const summaryElement = currentList.firstElementChild;
    const duration = startTime ? ((Date.now() - startTime) / 1000).toFixed(1) : 0;
    
    if (summaryElement) {
        summaryElement.innerHTML = I18n.t('duplicateScanSummary', { count: remainingGroups, duration: duration });
    }

    updateStats();
    
    if (lastDuplicateScanId) {
        AppCommon.updateHistoryCleaned(lastDuplicateScanId, successCount);
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

  function normalizeUrl(url) {
    try {
      return new URL(url).href;
    } catch {
      return url;
    }
  }

  function displayResults(duplicateGroups, type, duration) {
    resultsContainer.style.display = 'block';
    actionButtons.style.display = 'flex';
    smartSelectBtn.style.display = 'inline-block';

    if (duplicateGroups.length === 0) {
      duplicateList.innerHTML = `<div class="bookmark-item">${I18n.t('noDuplicateFound')}</div>`;
      return;
    }

    duplicateList.innerHTML = `
      <div class="bookmark-item">${I18n.t('duplicateScanSummary', { count: duplicateGroups.length, duration: duration })}</div>
      ${duplicateGroups
        .map(group => `
          <div class="duplicate-group">
            <div class="group-header">URL：<a target="_blank" href="${group.url}">${group.url}</a></div>
            ${group.bookmarks
            .map(bookmark => `
                <div class="bookmark-item">
                  <input type="checkbox" data-id="${bookmark.id}" data-date-added="${bookmark.dateAdded || 0}">
                  <div class="bookmark-info">
                    <div class="bookmark-title">${bookmark.title}</div>
                    <div class="bookmark-url"><a target="_blank" href="${bookmark.url}">${bookmark.url}</a></div>
                    <div class="bookmark-path">${bookmark.path.replace(/>[^>]*$/, '')}</div>
                    <div class="bookmark-state">${I18n.t('duplicate')}</div>
                  </div>
                </div>
              `)
            .join('')
          }
          </div>
        `)
        .join('')
      }`;
  }

  function resetUI() {
    resultsContainer.style.display = 'none';
    actionButtons.style.display = 'none';
    if (selectAllDuplicate) selectAllDuplicate.checked = false;
  }
});
