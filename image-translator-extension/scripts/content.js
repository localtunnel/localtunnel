let startX, startY, selectionBox, currentImageUrl, lastTranslationElements = [];

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "startCropping") {
    // Clean up previous elements if any
    removeLastTranslation();
    const oldOverlay = document.getElementById('cropping-overlay');
    if (oldOverlay) document.body.removeChild(oldOverlay);

    currentImageUrl = request.srcUrl;
    const overlay = document.createElement('div');
    overlay.id = 'cropping-overlay';
    document.body.appendChild(overlay);

    overlay.addEventListener('mousedown', handleMouseDown);
  } else if (request.action === "displayTranslation") {
    drawTranslatedImage(request.translatedText, request.cropData);
  } else if (request.action === "undoTranslation") {
    removeLastTranslation();
  }
});

function removeLastTranslation() {
    lastTranslationElements.forEach(el => el.remove());
    lastTranslationElements = [];
}

function handleMouseDown(e) {
  e.preventDefault();

  startX = e.clientX;
  startY = e.clientY;

  selectionBox = document.createElement('div');
  selectionBox.id = 'cropping-selection';
  selectionBox.style.left = startX + 'px';
  selectionBox.style.top = startY + 'px';
  document.getElementById('cropping-overlay').appendChild(selectionBox);

  const overlay = document.getElementById('cropping-overlay');
  overlay.addEventListener('mousemove', handleMouseMove);
  overlay.addEventListener('mouseup', handleMouseUp);
}

function handleMouseMove(e) {
  if (!selectionBox) return;
  e.preventDefault();
  const width = e.clientX - startX;
  const height = e.clientY - startY;
  selectionBox.style.width = Math.abs(width) + 'px';
  selectionBox.style.height = Math.abs(height) + 'px';
  selectionBox.style.left = (width > 0 ? startX : e.clientX) + 'px';
  selectionBox.style.top = (height > 0 ? startY : e.clientY) + 'px';
}

function handleMouseUp(e) {
  const overlay = document.getElementById('cropping-overlay');
  if (!overlay || !selectionBox) return;

  e.preventDefault();

  const cropRect = selectionBox.getBoundingClientRect();

  overlay.removeEventListener('mousemove', handleMouseMove);
  overlay.removeEventListener('mouseup', handleMouseUp);
  document.body.removeChild(overlay);
  selectionBox = null;

  if (cropRect.width > 5 && cropRect.height > 5) {
    const targetImage = findTargetImage(currentImageUrl);
    if (!targetImage) {
        console.error("Could not find the target image on the page.");
        return;
    }

    const imageRect = targetImage.getBoundingClientRect();
    const sx = cropRect.left - imageRect.left;
    const sy = cropRect.top - imageRect.top;

    const canvas = document.createElement('canvas');
    canvas.width = cropRect.width;
    canvas.height = cropRect.height;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(targetImage, sx, sy, cropRect.width, cropRect.height, 0, 0, cropRect.width, cropRect.height);
    const imageDataUrl = canvas.toDataURL('image/png');

    chrome.runtime.sendMessage({
      action: "performOcr",
      imageDataUrl: imageDataUrl,
      cropData: {
        x: cropRect.left + window.scrollX,
        y: cropRect.top + window.scrollY,
        width: cropRect.width,
        height: cropRect.height
      }
    });
  }
}

function findTargetImage(srcUrl) {
    const images = Array.from(document.getElementsByTagName('img'));
    return images.find(img => img.src === srcUrl);
}

function drawTranslatedImage(text, cropData) {
  // Clean up any previous translation before drawing a new one
  removeLastTranslation();

  chrome.storage.sync.get([
    'fontFamily',
    'fontSize',
    'fontColor'
  ], (settings) => {
    const finalSettings = {
        fontFamily: settings.fontFamily || 'Arial, sans-serif',
        fontSize: settings.fontSize || '16',
        fontColor: settings.fontColor || '#000000'
    };

    const canvas = document.createElement('canvas');
    canvas.className = 'translation-canvas';
    canvas.width = cropData.width;
    canvas.height = cropData.height;
    canvas.style.position = 'absolute';
    canvas.style.left = cropData.x + 'px';
    canvas.style.top = cropData.y + 'px';
    canvas.style.zIndex = '10001';

    const ctx = canvas.getContext('2d');

    const targetImage = findTargetImage(currentImageUrl);
    if (targetImage) {
        const imageRect = targetImage.getBoundingClientRect();
        const sx = (cropData.x - window.scrollX) - imageRect.left;
        const sy = (cropData.y - window.scrollY) - imageRect.top;
        ctx.drawImage(targetImage, sx, sy, cropData.width, cropData.height, 0, 0, cropData.width, cropData.height);
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(0, 0, cropData.width, cropData.height);

    ctx.fillStyle = finalSettings.fontColor;
    ctx.font = `${finalSettings.fontSize}px ${finalSettings.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const words = text.split(' ');
    let line = '';
    const lineHeight = parseInt(finalSettings.fontSize, 10) * 1.2;
    const lines = [];

    for(let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > cropData.width - 10 && n > 0) {
        lines.push(line);
        line = words[n] + ' ';
      } else {
        line = testLine;
      }
    }
    lines.push(line);

    const startY = (cropData.height / 2) - (lines.length - 1) * lineHeight / 2;

    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i].trim(), cropData.width / 2, startY + i * lineHeight);
    }

    document.body.appendChild(canvas);

    const closeBtn = document.createElement('div');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.position = 'absolute';
    closeBtn.style.left = (cropData.x + cropData.width - 20) + 'px';
    closeBtn.style.top = cropData.y + 'px';
    closeBtn.style.zIndex = '10002';
    closeBtn.className = 'close-btn';
    closeBtn.onclick = removeLastTranslation;
    document.body.appendChild(closeBtn);

    // Store the elements so they can be removed later
    lastTranslationElements = [canvas, closeBtn];
  });
}