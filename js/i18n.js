const I18n = {
  currentLocale: 'zh_CN',
  
  init() {
    // 1. Determine language
    const savedLang = localStorage.getItem('language');
    if (savedLang) {
      this.currentLocale = savedLang;
    } else {
      const uiLang = (chrome.i18n && chrome.i18n.getUILanguage()) || navigator.language || 'en';
      
      // If language starts with 'zh', use zh_CN; otherwise default to en_US
      if (uiLang.toLowerCase().startsWith('zh')) {
        this.currentLocale = 'zh_CN';
      } else {
        this.currentLocale = 'en_US';
      }
    }

    // 2. Translate DOM
    this.translatePage();
  },

  t(key, params = {}) {
    const localeData = locales[this.currentLocale] || locales['zh_CN'];
    let text = localeData[key] || key;
    
    // Replace params {key}
    Object.keys(params).forEach(param => {
      text = text.replace(new RegExp(`{${param}}`, 'g'), params[param]);
    });
    
    return text;
  },

  translatePage() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) {
        if (el.tagName === 'INPUT' && el.type === 'placeholder') {
          el.placeholder = this.t(key);
        } else {
          el.textContent = this.t(key);
        }
      }
    });
    
    // Special handling for elements that might have child nodes we don't want to destroy
    // But textContent destroys children.
    // For this app, most text is leaf nodes. 
    // If we have mixed content, we should use specific spans.
  },

  setLanguage(lang) {
    if (locales[lang]) {
      this.currentLocale = lang;
      localStorage.setItem('language', lang);
      this.translatePage();
      // Dispatch event or callback if needed, but translatePage covers static text.
      // Dynamic text needs to be re-rendered by the app logic if it's currently displayed.
    }
  }
};
