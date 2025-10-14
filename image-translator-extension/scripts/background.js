// Import Tesseract.js
// This path must be relative to the extension's root directory.
self.importScripts('scripts/tesseract.min.js');

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "translateImage",
    title: "Dịch chữ trên ảnh",
    contexts: ["image"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "translateImage" && tab.id) {
    chrome.tabs.sendMessage(tab.id, {
      action: "startCropping",
      srcUrl: info.srcUrl
    });
  }
});

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action === "performOcr") {
    const { imageDataUrl, cropData } = request;

    chrome.storage.sync.get({
        sourceLang: 'auto', // Default to auto-detect
        targetLang: 'vi'    // Default to Vietnamese
    }, (settings) => {
        const ocrLang = settings.sourceLang === 'auto' ? 'eng+jpn+kor+rus+chi_sim' : settings.sourceLang;

        Tesseract.recognize(
          imageDataUrl,
          ocrLang,
          {
            logger: m => console.log(m)
          }
        ).then(async ({ data: { text } }) => {
          console.log('Recognized Text:', text);
          const translatedText = await translateText(text, settings.sourceLang, settings.targetLang);
          console.log('Translated Text:', translatedText);

          saveToHistory(text, translatedText);

          chrome.tabs.sendMessage(sender.tab.id, {
            action: "displayTranslation",
            translatedText: translatedText,
            cropData: cropData
          });
        });
    });
  }
});

async function translateText(text, sourceLang, targetLang) {
    if (!text || text.trim() === "") {
        return "";
    }
    // NOTE: This uses an unofficial, publicly available Google Translate API endpoint.
    // For a production-level application, it's highly recommended to use the official
    // Google Cloud Translation API with a secure API key managed on a backend server
    // to ensure reliability and compliance with terms of service.
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        return data[0].map(item => item[0]).join('');
    } catch (error) {
        console.error('Translation error:', error);
        return 'Error translating text.';
    }
}

function saveToHistory(original, translated) {
    if (!original || !translated || original.trim() === '' || translated.trim() === '') return;
    chrome.storage.local.get({translationHistory: []}, (result) => {
        let history = result.translationHistory;
        history.unshift({ original: original.trim(), translated: translated.trim(), date: new Date().toISOString() });
        history = history.slice(0, 50);
        chrome.storage.local.set({translationHistory: history});
    });
}