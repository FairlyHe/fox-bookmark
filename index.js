document.addEventListener('DOMContentLoaded', async () => {
  const totalBookmarksElement = document.getElementById('totalBookmarks');
  const checkInvalidBtn = document.getElementById('checkInvalid');
  const stopScanBtn = document.getElementById('stopScan');
  const checkDuplicateBtn = document.getElementById('checkDuplicate');
  const progressBar = document.querySelector('.progress');
  const resultsContainer = document.querySelector('.results');
  const invalidList = document.getElementById('invalidList');
  const invalidStatus = document.getElementById('invalidStatus');
  const duplicateList = document.getElementById('duplicateList');
  const actionButtons = document.querySelector('.action-buttons');
  const selectAllInvalid = document.getElementById('selectAllInvalid');
  const selectAllDuplicate = document.getElementById('selectAllDuplicate');
  const deleteSelectedBtn = document.getElementById('deleteSelected');
  const cancelBtn = document.getElementById('cancel');

  const navInvalid = document.getElementById('nav-invalid');
  const navDuplicate = document.getElementById('nav-duplicate');
  const invalidTabContent = document.getElementById('invalid-tab-content');
  const duplicateTabContent = document.getElementById('duplicate-tab-content');
  
  let currentTab = 'invalid'; // 'invalid', 'duplicate'

  function switchTab(tab) {
    currentTab = tab;
    // Reset all
    navInvalid.classList.remove('active');
    navDuplicate.classList.remove('active');
    invalidTabContent.style.display = 'none';
    duplicateTabContent.style.display = 'none';

    if (tab === 'invalid') {
      navInvalid.classList.add('active');
      invalidTabContent.style.display = 'block';
    } else if (tab === 'duplicate') {
      navDuplicate.classList.add('active');
      duplicateTabContent.style.display = 'block';
    }
  }

  navInvalid.addEventListener('click', (e) => {
    e.preventDefault();
    switchTab('invalid');
  });

  navDuplicate.addEventListener('click', (e) => {
    e.preventDefault();
    switchTab('duplicate');
  });

  // 扫描统计数据
  const scanDurationEl = document.getElementById('scan-duration');
  const totalBookmarksEl = document.getElementById('total-bookmarks');
  const scannedBookmarksEl = document.getElementById('scanned-bookmarks');
  const invalidLinksEl = document.getElementById('invalid-links');
  const emptyFoldersEl = document.getElementById('empty-folders');
  // 初始化时获取并显示总书签数
  try {
    const bookmarks = await chrome.bookmarks.getTree();
    const allBookmarks = getAllBookmarks(bookmarks);
    const totalCount = allBookmarks.filter(b => b.url).length;
    totalBookmarksEl.textContent = totalCount;
  } catch (error) {

  }

  let currentBookmarks = [];
  let startTime;
  let scannedCount = 0; // 已扫描的书签数量
  let invalidCount = 0; // 待确认链接
  let emptyFolderCount = 0; // 空文件夹
  let isScanning = false;

  // 更新统计数据
  function updateStats() {
    const statsContainer = document.querySelector('.stats-container');
    const stats = statsContainer.querySelectorAll('div > div:last-child');
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    scanDurationEl.textContent = `${duration}秒`; // 扫描用时
    scannedBookmarksEl.textContent = scannedCount; //扫描进度
    invalidLinksEl.textContent = invalidCount; // 待确认链接
    emptyFoldersEl.textContent = emptyFolderCount; // 空文件夹

    // 更新扫描用时
    // stats[0].textContent = `${duration}秒`;
    // 更新书签总数
    // stats[1].textContent = currentBookmarks.length;
    // 更新待确认链接
    // stats[2].textContent = invalidCount;
    // 更新空文件夹
    // stats[3].textContent = emptyFolderCount;
  }

  function getMessage(messageName) {
    return chrome.i18n.getMessage(messageName);
  }


  function getErrorMessage(code) {
    switch (code) {
      // 4xx 客户端错误
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

      // 5xx 服务器错误
      case 500: return getMessage('errorCode_internalServerError');
      case 502: return getMessage('errorCode_badGateway');
      case 503: return getMessage('errorCode_serviceUnavailable');
      case 504: return getMessage('errorCode_gatewayTimeout');

      default: return `HTTP Error: ${code}`; // 对于未定义的状态码返回原始错误
    }
  }

  // 检测失效书签
  checkInvalidBtn.addEventListener('click', async () => {
    switchTab('invalid');
    resetUI();
    
    isScanning = true;
    checkInvalidBtn.style.display = 'none';
    stopScanBtn.style.display = 'inline-flex';

    startTime = Date.now();
    const bookmarks = await chrome.bookmarks.getTree();
    const allBookmarks = getAllBookmarks(bookmarks);

    currentBookmarks = allBookmarks.filter(b => b.url); // 只保留有URL的书签

    progressBar.style.display = 'block';
    resultsContainer.style.display = 'block';
    // 初始化统计数据
    invalidCount = 0;
    emptyFolderCount = 0;
    updateStats();
    actionButtons.style.display = 'flex';
    
    // Show status and clear list
    invalidStatus.style.display = 'block';
    invalidStatus.textContent = '开始检测...';
    invalidStatus.className = 'scan-status'; // Reset class
    invalidList.innerHTML = ''; 
    
    // Detect empty folders
    const emptyFolders = getEmptyFolders(bookmarks[0].children);
    emptyFolderCount = emptyFolders.length;
    
    // Render empty folders first
    for (const folder of emptyFolders) {
        const folderHtml = `
            <div class="bookmark-item">
              <input type="checkbox" data-id="${folder.id}">
              <div class="bookmark-info">
                <div class="bookmark-title">📁 ${folder.title}</div>
                <div class="bookmark-path">${folder.path}</div>
                <div class="bookmark-state state-invalid">空文件夹</div>
              </div>
            </div>
        `;
        invalidList.insertAdjacentHTML('beforeend', folderHtml);
    }
    
    updateStats();
    
    let checkedCount = 0;

    for (const bookmark of currentBookmarks) {
      if (!isScanning) break; // Check for cancellation
      
      scannedCount++
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), requestTimeout);
        
        const response = await fetch(bookmark.url, { 
          method: 'HEAD',
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        console.log('response', response)
        if (response.status >= 500 && response.status < 600) {
          invalidCount++;
          const bookmarkHtml = `
            <div class="bookmark-item">
              <input type="checkbox" data-id="${bookmark.id}">
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
        /**invalidCount++;
        const bookmarkHtml = `
          <div class="bookmark-item">
            <input type="checkbox" data-id="${bookmark.id}">
            <div class="bookmark-info">
              <div class="bookmark-title">${bookmark.title}</div>
              <div class="bookmark-url">
                  <a target="_blank" href="${bookmark.url}">${bookmark.url}</a>
                </div>
              <div class="bookmark-path">${bookmark.path.replace(/>[^>]*$/, '')}</div>
              <div class="bookmark-state">${getErrorMessage(error)}</div>
            </div>
          </div>
        `;
        bookmarkList.insertAdjacentHTML('beforeend', bookmarkHtml); **/
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
    
    // Only update summary if finished normally or cancelled (handled by break)
    // If cancelled, we might want to say "Detection cancelled"
    
    // Check if we broke out of loop early?
    // scannedCount vs currentBookmarks.length
    // Actually, checkedCount tracks progress.
    
    let statusText = `检测完成`;
    if (checkedCount < currentBookmarks.length) {
        statusText = `检测已取消`;
        invalidStatus.classList.add('status-cancelled');
    } else {
        invalidStatus.classList.add('status-completed');
    }
    
    const summaryText = `${statusText}，共发现 ${invalidCount} 个失效书签和 ${emptyFolderCount} 个空文件夹（用时：${duration}秒）`;
    invalidStatus.textContent = summaryText;

    if (invalidCount === 0 && emptyFolderCount === 0) {
      // actionButtons.style.display = 'none'; // Keep buttons if other tab has items?
    }
  });

  // Stop Scan Button
  stopScanBtn.addEventListener('click', () => {
    isScanning = false;
  });

  // 检测重复书签
  checkDuplicateBtn.addEventListener('click', async () => {
    switchTab('duplicate');
    resetUI();
    startTime = Date.now();
    const bookmarks = await chrome.bookmarks.getTree();
    const allBookmarks = getAllBookmarks(bookmarks);
    currentBookmarks = allBookmarks.filter(b => b.url);

    progressBar.style.display = 'block';
    const urlMap = new Map();

    // 按URL分组收集所有书签
    currentBookmarks.forEach(bookmark => {
      const normalizedUrl = normalizeUrl(bookmark.url);
      if (!urlMap.has(normalizedUrl)) {
        urlMap.set(normalizedUrl, []);
      }
      urlMap.get(normalizedUrl).push(bookmark);
    });

    // 筛选出有重复的书签组
    const duplicateGroups = Array.from(urlMap.entries())
      .filter(([_, bookmarks]) => bookmarks.length > 1)
      .map(([url, bookmarks]) => ({ url, bookmarks }));

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(1);
    updateStats();
    updateProgress(1);
    displayResults(duplicateGroups, '重复', duration);
  });

  // 全选功能
  selectAllInvalid.addEventListener('change', () => {
    const checkboxes = invalidList.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.checked = selectAllInvalid.checked;
    });
  });

  selectAllDuplicate.addEventListener('change', () => {
    const checkboxes = duplicateList.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.checked = selectAllDuplicate.checked;
    });
  });

  // 初始化时获取并显示书签总数
  async function updateTotalBookmarks() {
    const bookmarks = await chrome.bookmarks.getTree();
    const allBookmarks = getAllBookmarks(bookmarks);
    const totalCount = allBookmarks.filter(b => b.url).length;
    totalBookmarksElement.textContent = `总书签数：${totalCount}`;
  }

  // 页面加载时获取总数
  updateTotalBookmarks();

  // 删除选中的书签
  deleteSelectedBtn.addEventListener('click', async () => {
    let currentList, selectAllBox;
    if (currentTab === 'invalid') {
      currentList = invalidList;
      selectAllBox = selectAllInvalid;
    } else if (currentTab === 'duplicate') {
      currentList = duplicateList;
      selectAllBox = selectAllDuplicate;
    }

    const selectedBookmarks = Array.from(currentList.querySelectorAll('input[type="checkbox"]:checked'));
    const selectedIds = selectedBookmarks.map(checkbox => checkbox.dataset.id);

    // 从DOM中移除选中的书签项
    selectedBookmarks.forEach(checkbox => {
      const bookmarkItem = checkbox.closest('.bookmark-item');
      bookmarkItem.remove();
    });

    // 从Chrome书签中删除
    for (const id of selectedIds) {
      try {
        await chrome.bookmarks.remove(id);
      } catch (e) {
        console.error('Delete failed', e);
      }
      // 从currentBookmarks中移除对应的书签 (Only relevant for invalid/duplicate logic using currentBookmarks)
      const index = currentBookmarks.findIndex(b => b.id === id);
      if (index !== -1) {
        currentBookmarks.splice(index, 1);
      }
    }

    // 更新进度条和统计信息
    const summaryElement = currentList.firstElementChild;
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (summaryElement) {
      if (currentTab === 'invalid') {
        const remainingCount = currentList.querySelectorAll('.bookmark-item').length - 1; // 减去summary行
        summaryElement.innerHTML = `检测完成，共发现 ${remainingCount} 个失效书签（用时：${duration}秒）`;
      } else if (currentTab === 'duplicate') {
        // 清理空组
        const groups = currentList.querySelectorAll('.duplicate-group');
        groups.forEach(group => {
          if (group.querySelectorAll('.bookmark-item').length === 0) {
            group.remove();
          }
        });
        const remainingGroups = currentList.querySelectorAll('.duplicate-group').length;
        summaryElement.innerHTML = `检测完成，发现 ${remainingGroups} 组重复书签（用时：${duration}秒）`;
      }
    }

    // 如果没有剩余的失效书签，隐藏操作按钮
    // if (remainingInvalidCount === 0) {
    //   actionButtons.style.display = 'none';
    // }

    alert(`已成功删除 ${selectedIds.length} 个项目`);
    selectAllBox.checked = false;
  });

  // 取消按钮
  cancelBtn.addEventListener('click', resetUI);

  // 辅助函数
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
        // It is a folder
        if (item.children.length === 0) {
           // It is empty
           result.push({
             id: item.id,
             title: item.title,
             path: currentPath.join(' > ')
           });
        } else {
          // Recursively check children
          getEmptyFolders(item.children, currentPath, result);
        }
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

  function updateProgress(percentage) {
    const progress = Math.round(percentage * 100);
    const progressCircle = document.querySelector('.progress-circle-fill');
    const progressText = document.querySelector('.progress-percentage');
    const circumference = 2 * Math.PI * 45; // 圆的周长
    const offset = circumference - (progress / 100) * circumference;
    progressCircle.style.strokeDashoffset = offset;
    progressText.textContent = `${progress}%`;
  }

  function displayResults(duplicateGroups, type, duration) {
    console.log('duplicateGroups', duplicateGroups)
    progressBar.style.display = 'none';
    resultsContainer.style.display = 'block';
    actionButtons.style.display = 'flex';

    if (duplicateGroups.length === 0) {
      duplicateList.innerHTML = `<div class="bookmark-item">未发现${type}书签（用时：${duration}秒）</div>`;
      // actionButtons.style.display = 'none';
      return;
    }

    duplicateList.innerHTML = `
      <div class="bookmark-item">检测完成，发现 ${duplicateGroups.length} 组重复书签（用时：${duration}秒）</div>
      ${duplicateGroups
        .map(group => `
          <div class="duplicate-group">
            <div class="group-header">重复URL：<a target="_blank" href="${group.url}">${group.url}</a></div>
            ${group.bookmarks
            .map(bookmark => `
                <div class="bookmark-item">
                  <input type="checkbox" data-id="${bookmark.id}">
                  <div class="bookmark-info">
                    <div class="bookmark-title">${bookmark.title}</div>
                    <div class="bookmark-path">${bookmark.path.replace(/>[^>]*$/, '')}</div>
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
    progressBar.style.display = 'none';
    resultsContainer.style.display = 'none';
    actionButtons.style.display = 'none';
    selectAllInvalid.checked = false;
    selectAllDuplicate.checked = false;
  }

  // Settings Logic
  const settingsModal = document.getElementById('settingsModal');
  const openSettingsBtn = document.getElementById('openSettings');
  const closeModalBtn = document.querySelector('.close-modal');
  const saveSettingsBtn = document.getElementById('saveSettings');
  const timeoutRange = document.getElementById('timeoutRange');
  const timeoutValue = document.getElementById('timeoutValue');

  // Default timeout 15 seconds
  let requestTimeout = 15000;

  // Load saved settings
  const savedTimeout = localStorage.getItem('scanTimeout');
  if (savedTimeout) {
    requestTimeout = parseInt(savedTimeout, 10);
  }

  openSettingsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    timeoutRange.value = requestTimeout / 1000;
    timeoutValue.textContent = `${timeoutRange.value}s`;
    settingsModal.style.display = 'block';
  });

  closeModalBtn.addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });

  window.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.style.display = 'none';
    }
  });

  timeoutRange.addEventListener('input', () => {
    timeoutValue.textContent = `${timeoutRange.value}s`;
  });

  saveSettingsBtn.addEventListener('click', () => {
    const val = parseInt(timeoutRange.value, 10);
    requestTimeout = val * 1000;
    localStorage.setItem('scanTimeout', requestTimeout);
    settingsModal.style.display = 'none';
    // alert('设置已保存');
  });
});