document.addEventListener('DOMContentLoaded', () => {
  // Settings elements
  const sourceLangSelect = document.getElementById('source-lang');
  const targetLangSelect = document.getElementById('target-lang');
  const fontFamilySelect = document.getElementById('font-family');
  const fontSizeInput = document.getElementById('font-size');
  const fontColorInput = document.getElementById('font-color');
  const saveButton = document.getElementById('save-settings');
  const undoButton = document.getElementById('undo-translation');
  const historyContainer = document.getElementById('history-container');

  const settingsKeys = [
      'sourceLang', 'targetLang',
      'fontFamily', 'fontSize', 'fontColor'
  ];

  // Load saved settings
  chrome.storage.sync.get(settingsKeys, (result) => {
    if (result.sourceLang) sourceLangSelect.value = result.sourceLang;
    if (result.targetLang) targetLangSelect.value = result.targetLang;
    if (result.fontFamily) fontFamilySelect.value = result.fontFamily;
    if (result.fontSize) fontSizeInput.value = result.fontSize;
    if (result.fontColor) fontColorInput.value = result.fontColor;
  });

  // Save settings
  saveButton.addEventListener('click', () => {
    const settings = {
      sourceLang: sourceLangSelect.value,
      targetLang: targetLangSelect.value,
      fontFamily: fontFamilySelect.value,
      fontSize: fontSizeInput.value,
      fontColor: fontColorInput.value,
    };
    chrome.storage.sync.set(settings, () => {
      alert('Cài đặt đã được lưu!');
    });
  });

  // Handle undo button click
  undoButton.addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {action: "undoTranslation"});
      }
    });
  });

  // Load and display translation history
  chrome.storage.local.get({translationHistory: []}, (result) => {
    const history = result.translationHistory;
    historyContainer.innerHTML = '';
    if (history.length === 0) {
        historyContainer.innerHTML = '<p>Chưa có lịch sử dịch.</p>';
        return;
    }
    history.forEach(item => {
      const historyItem = document.createElement('div');
      historyItem.className = 'history-item';
      historyItem.innerHTML = `<span class="text">"${item.original}"</span> -> <span class="translation">"${item.translated}"</span>`;
      historyContainer.appendChild(historyItem);
    });
  });
});