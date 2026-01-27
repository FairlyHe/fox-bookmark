// 监听插件图标点击事件
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'index.html' });
});

// 监听来自index的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkInvalidBookmarks') {
    checkInvalidBookmarks(sendResponse);
    return true; // 保持消息通道开放
  } else if (request.action === 'checkDuplicateBookmarks') {
    checkDuplicateBookmarks(sendResponse);
    return true;
  }
});

// 检查无效书签
async function checkInvalidBookmarks(sendResponse) {
  const bookmarks = await getAllBookmarks();
  const totalBookmarks = bookmarks.length;
  let checkedCount = 0;
  const invalidBookmarks = [];

  for (const bookmark of bookmarks) {
    try {
      const response = await fetch(bookmark.url, { method: 'HEAD' });
      if (!response.ok) {
        invalidBookmarks.push(bookmark);
      }
    } catch (error) {
      invalidBookmarks.push(bookmark);
    }
    
    checkedCount++;
    // 发送进度更新
    chrome.runtime.sendMessage({
      action: 'updateProgress',
      progress: (checkedCount / totalBookmarks) * 100
    });
  }

  sendResponse({ bookmarks: invalidBookmarks });
}

// 检查重复书签
async function checkDuplicateBookmarks(sendResponse) {
  const bookmarks = await getAllBookmarks();
  const totalBookmarks = bookmarks.length;
  const urlMap = new Map();
  const duplicateBookmarks = [];

  bookmarks.forEach((bookmark, index) => {
    const normalizedUrl = normalizeUrl(bookmark.url);
    if (urlMap.has(normalizedUrl)) {
      duplicateBookmarks.push(bookmark);
    } else {
      urlMap.set(normalizedUrl, bookmark);
    }

    // 发送进度更新
    chrome.runtime.sendMessage({
      action: 'updateProgress',
      progress: (index + 1) / totalBookmarks * 100
    });
  });

  sendResponse({ bookmarks: duplicateBookmarks });
}

// 获取所有书签
async function getAllBookmarks() {
  const bookmarks = await chrome.bookmarks.getTree();
  return extractBookmarks(bookmarks);
}

// 递归提取书签
function extractBookmarks(bookmarkItems) {
  let bookmarks = [];

  for (const item of bookmarkItems) {
    if (item.url) {
      bookmarks.push({
        id: item.id,
        title: item.title,
        url: item.url
      });
    }
    if (item.children) {
      bookmarks = bookmarks.concat(extractBookmarks(item.children));
    }
  }

  return bookmarks;
}

// 标准化URL以进行比较
function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    // 移除协议、www前缀和末尾斜杠
    return urlObj.hostname.replace(/^www\./, '') + urlObj.pathname.replace(/\/$/, '') + urlObj.search;
  } catch (e) {
    return url; // 如果URL无效，返回原始URL
  }
}