import * as pdfjsLib from './lib/pdf.mjs';

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = './lib/pdf.worker.mjs';

const container = document.getElementById('pdf-container');

async function loadPDF() {
    const params = new URLSearchParams(window.location.search);
    const fileUrl = params.get('file');

    if (!fileUrl) {
        container.innerHTML = '<div style="color:white; padding:20px;">No PDF file specified.</div>';
        return;
    }

    try {
        const loadingTask = pdfjsLib.getDocument(fileUrl);
        const pdf = await loadingTask.promise;

        console.log('PDF loaded, pages:', pdf.numPages);

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            await renderPage(pdf, pageNum);
        }

    } catch (error) {
        console.error('Error loading PDF:', error);
        container.innerHTML = `<div style="color:red; padding:20px;">Error loading PDF: ${error.message}</div>`;
    }
}

async function renderPage(pdf, pageNum) {
    const page = await pdf.getPage(pageNum);

    // Scale usually 1.5 for better reading
    const scale = 1.5;
    const viewport = page.getViewport({ scale });

    // Create page wrapper
    const pageDiv = document.createElement('div');
    pageDiv.className = 'pdf-page';
    pageDiv.style.width = Math.floor(viewport.width) + 'px';
    pageDiv.style.height = Math.floor(viewport.height) + 'px';
    container.appendChild(pageDiv);

    // Canvas for rendering content
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    pageDiv.appendChild(canvas);

    const context = canvas.getContext('2d');
    const renderContext = {
        canvasContext: context,
        viewport: viewport
    };

    // Render PDF content
    await page.render(renderContext).promise;

    // Text Layer for selection
    const textContent = await page.getTextContent();
    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'textLayer';
    textLayerDiv.style.width = Math.floor(viewport.width) + 'px';
    textLayerDiv.style.height = Math.floor(viewport.height) + 'px';
    pageDiv.appendChild(textLayerDiv);

    // PDF.js utility to render text layer
    // Note: PDF.js v3+ syntax might vary, manual implementation or using pdfjsLib.renderTextLayer
    // We'll use a basic manual rendering loop if the helper isn't easily available or complex

    // Manual Text Layer Rendering
    // Optimized for PDF.js v3/v4 where renderTextLayer might be missing or complex

    // Set minimal text layer styles
    textLayerDiv.style.color = 'transparent';
    textLayerDiv.style.position = 'absolute';
    textLayerDiv.style.left = '0';
    textLayerDiv.style.top = '0';
    textLayerDiv.style.right = '0';
    textLayerDiv.style.bottom = '0';
    textLayerDiv.style.overflow = 'hidden';
    textLayerDiv.style.lineHeight = '1.0';

    const textContentItems = textContent.items;

    // 1. Merge text items to improve sentence detection
    const mergedItems = [];
    let currentItem = null;

    for (const item of textContentItems) {
        if (!item.str || !item.str.trim()) continue;

        // Try to merge with previous item if on same line
        if (currentItem) {
            const dy = Math.abs(currentItem.transform[5] - item.transform[5]);
            if (dy < 1.0) { // Same line
                currentItem.str += item.str;
                currentItem.width += item.width;
                continue;
            }
        }

        if (currentItem) mergedItems.push(currentItem);

        currentItem = {
            str: item.str,
            transform: item.transform.slice(),
            width: item.width,
            height: item.height
        };
    }
    if (currentItem) mergedItems.push(currentItem);

    for (const item of mergedItems) {
        // Create span for text
        const span = document.createElement('span');
        span.textContent = item.str;

        // Calculate position and style
        // item.transform is [scaleX, skewY, skewX, scaleY, transX, transY]
        // We need to map this to the viewport

        // Use PDF.js util to transform metrics
        // The viewport already handles the scale (1.5)
        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);

        // Calculate font height
        // tx[3] is roughly the scaled height (scaleY)
        // A simple approximation: Math.hypot(tx[2], tx[3])
        const fontHeight = Math.hypot(tx[2], tx[3]);

        // Set styles
        span.style.position = 'absolute';
        span.style.left = tx[4] + 'px';

        // Vertical Alignment Fix: 
        // Move text down slightly to align with canvas text. 
        // 0.8 is a common baseline factor.
        span.style.top = (tx[5] - fontHeight * 0.8) + 'px';

        span.style.fontSize = fontHeight + 'px';
        span.style.fontFamily = 'sans-serif';
        span.style.whiteSpace = 'pre';
        span.style.transformOrigin = '0% 0%';

        textLayerDiv.appendChild(span);
    }
}

loadPDF();
