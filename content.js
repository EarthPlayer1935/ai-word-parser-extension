// content.js - 支持双击与滑动选词 (Ultimate Edition)

// 全局变量
let currentIcon = null;
let currentPopup = null;
let currentPopupWord = null; // Track the word associated with the current popup
let lastIconWord = null; // Track the word associated with the current icon
let hideIconTimer = null; // Timer for auto-hiding the icon
let timeoutPopup = null; // Timer for auto-hiding the popup

let clearElementsTimer = null; // Timer for mousedown cleanup
let activeAnchorRect = null; // The rect of the word that triggered the popup
let distanceTrackHandler = null; // The bound function for mousemove tracking

// 1. 清除界面元素
function clearElements() {
    if (clearElementsTimer) {
        clearTimeout(clearElementsTimer);
        clearElementsTimer = null;
    }
    if (currentIcon) {
        currentIcon.remove();
        currentIcon = null;
        lastIconWord = null;
    }
    if (currentPopup) {
        currentPopup.remove();
        currentPopup = null;
        currentPopupWord = null;
    }
    cancelHideIcon(); // Clear any pending hide timers
    if (timeoutPopup) clearTimeout(timeoutPopup);
}

// 1.1 Distance Opacity Logic
function getDistanceToRect(x, y, rect) {
    // Calculate distance from point (x,y) to the rectangle
    // If point is inside, distance is 0.
    const dx = Math.max(rect.left - x, 0, x - rect.right);
    const dy = Math.max(rect.top - y, 0, y - rect.bottom);
    return Math.sqrt(dx * dx + dy * dy);
}

function startDistanceTracking(rect) {
    activeAnchorRect = rect;

    if (distanceTrackHandler) {
        document.removeEventListener('mousemove', distanceTrackHandler);
    }

    distanceTrackHandler = (e) => {
        if (!currentPopup || !activeAnchorRect) return;

        // If mouse is inside Popup, Opacity = 1
        const popupRect = currentPopup.getBoundingClientRect();
        if (e.clientX >= popupRect.left && e.clientX <= popupRect.right &&
            e.clientY >= popupRect.top && e.clientY <= popupRect.bottom) {
            currentPopup.style.opacity = 1;
            return;
        }

        // Calculate distance to the WORD (Anchor)
        const d = getDistanceToRect(e.clientX, e.clientY, activeAnchorRect);

        // Max distance 500px (User requested higher sensitivity range, 500px)
        const MAX_DIST = 500;
        const opacity = Math.max(0, 1 - d / MAX_DIST);

        currentPopup.style.opacity = opacity;

        // Optional: If completely invisible, maybe allow clicks through?
        // But user just said "disappear completely", not "gone". 
        // Existing logic handles clicks elsewhere to close it.
    };

    document.addEventListener('mousemove', distanceTrackHandler);

    // Close on Scroll
    window.addEventListener('scroll', clearElements, { once: true });
}

// Timer Logic for Auto-Hide
function scheduleHideIcon() {
    // REFINED: Don't resetting the timer if it's already running.
    // This allows the grace period to expire even if mouse keeps moving on non-interactive areas.
    if (hideIconTimer) return;

    // If popup is open, we rely on Distance Opacity, NOT timer.
    // So if currentPopup exists, do NOT schedule hide.
    if (currentPopup) return;

    hideIconTimer = setTimeout(() => {
        // Only hide if:
        // 1. Icon exists
        // 2. Icon is set to auto-hide (created via hover)
        // 3. Mouse is NOT over the icon
        // 4. Mouse is NOT over the popup (if it exists)
        if (currentIcon && currentIcon.dataset.isAutoHide === 'true') {
            const iconHovered = currentIcon.matches(':hover');
            const popupHovered = currentPopup && currentPopup.matches(':hover');

            if (!iconHovered && !popupHovered) {
                clearElements();
            }
        } else if (!currentIcon && currentPopup) {
            // Case: Popup opened via click (no icon).
            // With Distance Logic, we don't auto-hide by timer if the popup is controlled by distance.
            // But if we want to be safe, we can leave this EMPTY and rely on Distance Opacity.
            // Or only if distance logic isn't active? 
            // In our design, if popup is open, distance logic IS active.
            // So we do NOTHING here.
        }
        hideIconTimer = null; // Timer finished
    }, 300); // 300ms delay
}

function cancelHideIcon() {
    if (hideIconTimer) {
        clearTimeout(hideIconTimer);
        hideIconTimer = null;
    }
}

// 2. 核心监听逻辑：使用 mouseup 统一处理“双击”和“划词”
document.addEventListener('mouseup', function (e) {
    // 如果点击的是插件自己的图标或弹窗，直接忽略，不处理
    if (!chrome.runtime?.id) return; // Prevent Execution if extension is invalidated
    if ((currentIcon && currentIcon.contains(e.target)) ||
        (currentPopup && currentPopup.contains(e.target))) {
        return;
    }

    // 给一点点延时，确保浏览器完成了选区的构建
    setTimeout(() => {
        handleSelection();
    }, 10);
});

// 提取的创建图标逻辑
// Added autoHide parameter
function createEtymologyIcon(rect, text, autoHide = false) {
    // --- 步骤A：位置计算 ---
    // 加上滚动条偏移量，算出绝对位置
    const savedTop = rect.bottom + window.scrollY;
    const savedLeft = rect.left + window.scrollX;

    // --- 步骤B：清理旧界面 ---
    // 如果图标已经存在且是同一个词，就不重建了 (防止闪烁)
    if (currentIcon && lastIconWord === text) {
        // 更新位置 (可选，万一重新布局了)
        currentIcon.style.top = (savedTop + 5) + 'px';
        currentIcon.style.left = savedLeft + 'px';

        // Refined Logic regarding autoHide update:
        // If current is Permanent (false), and new request is Auto (true), we keep Permanent.
        // If we are strictly selecting, we want it to stay.
        if (currentIcon.dataset.isAutoHide === 'false' && autoHide === true) {
            // Do nothing, keep it permanent
        } else {
            currentIcon.dataset.isAutoHide = String(autoHide);
        }
        return;
    }

    clearElements();

    // --- 步骤C：创建图标 ---
    const icon = document.createElement('img');
    icon.src = chrome.runtime.getURL('images/icon48.png'); // Use the 48px logo
    icon.id = 'etymology-icon-btn';
    // icon.innerText = '构'; // Removed text
    icon.dataset.isAutoHide = String(autoHide); // Store the mode

    // 使用算好的绝对位置
    icon.style.top = (savedTop + 5) + 'px';
    icon.style.left = savedLeft + 'px';

    document.body.appendChild(icon);
    currentIcon = icon;
    lastIconWord = text;

    // --- 步骤D：悬浮事件 (图标本身) ---
    icon.addEventListener('mouseenter', () => {
        if (!chrome.runtime?.id) return;
        cancelHideIcon(); // Don't hide if we enter the icon

        // NOTE: We don't have the exact rect of the word here easily unless we passed it or stored it.
        // rect argument IS available in this closure!

        const positionData = {
            top: savedTop,
            popupTop: rect.top + window.scrollY,
            left: savedLeft,
            rect: rect // Pass the rect for distance tracking
        };

        // Ensure we clear previous timers if we are re-entering
        clearElementsTimer = null; // Just in case

        showPopupLoading(text, positionData);

        // 发送消息给后台
        chrome.runtime.sendMessage({ action: "analyzeWord", word: text }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn("连接断开或后台报错:", chrome.runtime.lastError);
                return;
            }

            if (response && response.success) {
                updatePopupContent(text, response.data);
            } else {
                updatePopupError(response ? response.error : "未知错误");
            }
        });
    });

    icon.addEventListener('mouseleave', () => {
        // Schedule hide only if it is autoHide
        if (icon.dataset.isAutoHide === 'true') {
            scheduleHideIcon();
        } else {
            // Original logic for hiding popup (if needed) but keeping icon
            setTimeout(() => {
                if (currentPopup && !currentPopup.matches(':hover')) {
                    currentPopup.style.display = 'none';
                }
            }, 500);
        }
    });
}

// 处理选区的具体逻辑
function handleSelection() {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    // 校验：必须是纯英文，且不能为空
    if (!selectedText || !/^[a-zA-Z\s]+$/.test(selectedText)) {
        return;
    }

    if (selectedText.split(' ').length > 3) return;

    // --- 步骤A：先算坐标 (防销毁) ---
    if (selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Explicit selection -> NOT autoHide (permanent)
    createEtymologyIcon(rect, selectedText, false);
}

// 3. 点击页面空白处清除 (保留之前的修复逻辑)
document.addEventListener('mousedown', function (e) {
    if (!chrome.runtime?.id) return;
    if (currentIcon) {
        // 判断是否点击了图标或弹窗
        const isClickingIcon = (e.target === currentIcon);
        const isClickingPopup = (currentPopup && currentPopup.contains(e.target));

        if (!isClickingIcon && !isClickingPopup) {
            // 点击别处时，清除图标
            clearElementsTimer = setTimeout(clearElements, 100);
        }
    }
});

// --- UI 显示函数 (保持不变) ---

function showPopupLoading(word, pos) {
    currentPopupWord = word;
    if (!currentPopup) {
        currentPopup = document.createElement('div');
        currentPopup.id = 'etymology-popup-card';
        // Keep popup open if hovered, hide if left
        currentPopup.addEventListener('mouseenter', () => {
            cancelHideIcon();
        });

        // REMOVED mouseleave listener: We rely on Distance Opacity now.

        document.body.appendChild(currentPopup);
    }

    // Clear any pending hidden timeout
    if (typeof timeoutPopup !== 'undefined') clearTimeout(timeoutPopup);

    currentPopup.innerHTML = `
        <div class="ety-word">${word}</div>
        <div style="padding: 15px 0; display: flex; align-items: center; justify-content: center; flex-direction: column;">
            <div class="ety-loader"></div>
            <div style="color:#999; font-size:12px; margin-top:8px;">AI 正在分析词源...</div>
        </div>
    `;

    currentPopup.style.display = 'block';
    // Force reflow to enable transition
    requestAnimationFrame(() => {
        if (currentPopup) currentPopup.classList.add('show');
    });
    // Position ABOVE the word
    // pos.popupTop is the top of the selected word/range.
    // We move up by a small margin (e.g. 5px).
    // We use transform: translateY(-100%) to shift the popup's own height up.


    // Fallback if popupTop isn't provided (e.g. from existing calls? we should fix them) 
    // But for safety, check:
    const targetTop = (pos.popupTop !== undefined) ? pos.popupTop : pos.top;

    // Check available space above the word
    const spaceAbove = targetTop - window.scrollY;
    // Assume popup height is around 250px (safe margin)
    const renderBelow = spaceAbove < 250;

    if (renderBelow) {
        // Not enough space above, render BELOW
        // pos.top is actually the bottom of the selection + scrollY
        // We add a small margin (e.g. 10px)
        currentPopup.style.top = (pos.top + 10) + 'px';
        currentPopup.style.left = pos.left + 'px';
        currentPopup.style.transform = 'none'; // Default (top-left aligned) growing downwards
    } else {
        // Render ABOVE (Standard)
        // targetTop is the top of the selection + scrollY
        // We subtract a small margin (e.g. 5px)
        // And translate up by 100% so the bottom of the popup aligns with this point
        currentPopup.style.top = (targetTop - 5) + 'px';
        currentPopup.style.left = pos.left + 'px';
        currentPopup.style.transform = 'translateY(-100%)';
    }

    // Start Distance Tracking
    if (pos.rect) {
        startDistanceTracking(pos.rect);
    }
}

function updatePopupContent(word, data) {
    if (!currentPopup) return;

    currentPopup.innerHTML = `
        <div class="ety-word">${word} <span style="font-weight:normal; font-size:14px; color:#666;">(${data.translation || '...'})</span></div>
        <div class="ety-part"><span class="ety-label">前缀:</span><span class="ety-val">${data.prefix}</span></div>
        <div class="ety-part"><span class="ety-label">词根:</span><span class="ety-val">${data.root}</span></div>
        <div class="ety-part"><span class="ety-label">后缀:</span><span class="ety-val">${data.suffix}</span></div>
        <div class="ety-part" style="color:#555; font-size:13px; margin-top:10px; line-height:1.4; border-top:1px dashed #eee; padding-top:8px;">
            ${data.desc}
        </div>
    `;
}

function updatePopupError(msg) {
    if (!currentPopup) return;
    currentPopup.innerHTML = `
        <div style="color:red; font-size:12px; padding:10px;">解析失败: ${msg}</div>
    `;
}

// --- 4. 新增：悬浮高亮与点击查词 (Smart Interaction) ---

if (CSS.highlights) {
    let lastHighlightRange = null;
    let lastHoveredText = "";

    function getInteractiveParent(node) {
        let curr = node;
        if (curr.nodeType === Node.TEXT_NODE) {
            curr = curr.parentNode;
        }

        while (curr && curr !== document.body && curr !== document.documentElement) {
            // 1. Tag checks
            if (curr.tagName === 'A' || curr.tagName === 'BUTTON' || curr.tagName === 'SUMMARY' || curr.tagName === 'INPUT' || curr.tagName === 'TEXTAREA' || curr.tagName === 'SELECT') {
                return curr;
            }

            // 2. Role checks
            if (curr.getAttribute) {
                const role = curr.getAttribute('role');
                if (['button', 'link', 'menuitem', 'tab', 'option', 'switch'].includes(role)) {
                    return curr;
                }
            }

            // 3. "More" link heuristic
            // Check if text indicates an expansion link and has pointer cursor
            const text = curr.innerText ? curr.innerText.trim().toLowerCase() : "";
            if (text.length < 30) {
                // Matches: "(more)", "more", "...more", "read more", "load more", "展开", "显示全部"
                const morePatterns = /^(\(?more\)?|read more|… ?more|\.\.\. ?more|load more|展开|显示全部)$/;

                if (morePatterns.test(text)) {
                    try {
                        const style = window.getComputedStyle(curr);
                        if (style.cursor === 'pointer') {
                            return curr;
                        }
                    } catch (e) { }
                }
            }

            curr = curr.parentNode;
        }
        return null;
    }

    function getWordRange(range) {
        if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return null;

        const text = range.startContainer.textContent;
        const offset = range.startOffset;

        let start = offset;
        while (start > 0 && /[a-zA-Z]/.test(text[start - 1])) {
            start--;
        }

        let end = offset;
        while (end < text.length && /[a-zA-Z]/.test(text[end])) {
            end++;
        }

        if (start === end) return null;

        const newRange = document.createRange();
        newRange.setStart(range.startContainer, start);
        newRange.setEnd(range.startContainer, end);
        return { range: newRange, text: text.substring(start, end) };
    }

    function getSentenceRange(range) {
        if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return null;

        const text = range.startContainer.textContent;
        const offset = range.startOffset;
        const delimiters = /[.!?。！？]/;

        let start = offset;
        while (start > 0 && !delimiters.test(text[start - 1])) {
            start--;
        }

        let end = offset;
        while (end < text.length && !delimiters.test(text[end])) {
            end++;
        }

        if (end < text.length && delimiters.test(text[end])) {
            end++;
        }

        const newRange = document.createRange();
        newRange.setStart(range.startContainer, start);
        newRange.setEnd(range.startContainer, end);
        return newRange;
    }

    let ticking = false;
    document.addEventListener('mousemove', (e) => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            handleHover(e);
            ticking = false;
        });
    });

    function handleHover(e) {
        if (!chrome.runtime?.id) return;
        // If clicking/drag/popups, abort
        if (e.buttons !== 0 || (currentPopup && currentPopup.contains(e.target)) || (currentIcon && currentIcon.contains(e.target))) {
            CSS.highlights.clear();
            lastHighlightRange = null;
            lastHoveredText = "";
            return;
        }

        let range;
        try {
            if (document.caretRangeFromPoint) {
                range = document.caretRangeFromPoint(e.clientX, e.clientY);
            } else if (document.caretPositionFromPoint) {
                const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
                range = document.createRange();
                range.setStart(pos.offsetNode, pos.offset);
                range.collapse(true);
            }
        } catch (err) { }

        // --- Logic when NO valid text detected ---
        if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) {
            CSS.highlights.clear();
            lastHighlightRange = null;
            scheduleHideIcon(); // Schedule hide
            return;
        }

        const wordData = getWordRange(range);
        if (!wordData) {
            CSS.highlights.clear();
            lastHighlightRange = null;
            lastHoveredText = "";
            scheduleHideIcon(); // Schedule hide
            return;
        }

        const rects = wordData.range.getClientRects();
        let isOver = false;
        let hoverRect = null;
        for (const rect of rects) {
            if (e.clientX >= rect.left && e.clientX <= rect.right &&
                e.clientY >= rect.top && e.clientY <= rect.bottom) {
                isOver = true;
                hoverRect = rect;
                break;
            }
        }

        if (!isOver) {
            CSS.highlights.clear();
            lastHighlightRange = null;
            lastHoveredText = "";
            scheduleHideIcon(); // Schedule hide
            return;
        }

        // --- Valid Text Detected ---

        // --- Smart Interaction & Highlighting Logic ---

        const interactiveParent = getInteractiveParent(range.startContainer);

        if (interactiveParent) {
            // 1. Interactive Element (Link/Button) -> REMOVE ALL EFFECTS
            CSS.highlights.clear();
            lastHighlightRange = null;
            // No icon, no highlights. Just return.
            return;
        } else {
            // 2. Normal Text -> Apply Highlights

            // Helper to check if we should use "clean" style (no background color)
            // This is for dark mode or complex backgrounds (like Spotify lyrics)
            function shouldUseCleanStyle(node) {
                if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;

                const style = window.getComputedStyle(node);

                // Check 1: Text Color (Light text usually implies dark background)
                const color = style.color || "";
                const colorMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                if (colorMatch) {
                    const r = parseInt(colorMatch[1]);
                    const g = parseInt(colorMatch[2]);
                    const b = parseInt(colorMatch[3]);
                    // Brightness > 200 (out of 255) considered "Light"
                    // If text is white/light, we use clean style.
                    if ((r * 0.299 + g * 0.587 + b * 0.114) > 200) {
                        return true;
                    }
                }

                // Check 2: Background Color
                // We check up to 4 levels to find a background
                let curr = node;
                for (let i = 0; i < 4; i++) {
                    if (!curr) break;

                    const bgStyle = window.getComputedStyle(curr);
                    const bgColor = bgStyle.backgroundColor;

                    // Regex to parse rgba including alpha
                    const bgMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d\.]+))?\)/);
                    if (bgMatch) {
                        const r = parseInt(bgMatch[1]);
                        const g = parseInt(bgMatch[2]);
                        const b = parseInt(bgMatch[3]);
                        const a = bgMatch[4] !== undefined ? parseFloat(bgMatch[4]) : 1;

                        if (a > 0.1) { // If visible
                            // If significantly dark/colored (< 240) -> Use Clean Style
                            if (r < 240 || g < 240 || b < 240) {
                                return true;
                            }
                            // If it is Light (>= 240) AND Opaque (> 0.9) -> Use Normal Style
                            if (a > 0.9) {
                                return false;
                            }
                        }
                    }

                    // Background Image -> Assume Complex -> Clean Style
                    if (bgStyle.backgroundImage && bgStyle.backgroundImage !== 'none') {
                        return true;
                    }

                    curr = curr.parentElement;
                }

                return false;
            }

            const sentenceRange = getSentenceRange(range);
            const wordHighlight = new Highlight(wordData.range);
            const sentenceHighlight = new Highlight(sentenceRange);

            const element = range.startContainer.parentElement;

            if (shouldUseCleanStyle(element)) {
                // Apply Clean Style (Underline only, no background)
                CSS.highlights.set("word-highlight-clean", wordHighlight);
                CSS.highlights.set("sentence-highlight-clean", sentenceHighlight);
                // Ensure normal highlights are removed
                CSS.highlights.delete("word-highlight");
                CSS.highlights.delete("sentence-highlight");
            } else {
                // Apply Normal Style
                CSS.highlights.set("word-highlight", wordHighlight);
                CSS.highlights.set("sentence-highlight", sentenceHighlight);
                // Ensure clean highlights are removed
                CSS.highlights.delete("word-highlight-clean");
                CSS.highlights.delete("sentence-highlight-clean");
            }

            lastHighlightRange = wordData.range;
            lastHoveredText = wordData.text;

            // If we are browsing normal text, we might want to auto-hide the icon 
            // if we moved away from a link previously.
            // MODIFIED: If we are hovering the text that triggers the popup, KEEP IT.
            if (currentPopup && currentPopupWord && wordData.text === currentPopupWord) {
                cancelHideIcon();
            } else {
                scheduleHideIcon();
            }
        }
    }

    document.addEventListener('click', (e) => {
        if (!chrome.runtime?.id) return;
        if (e.button !== 0) return;

        if ((currentIcon && currentIcon.contains(e.target)) || (currentPopup && currentPopup.contains(e.target))) {
            return;
        }

        if (lastHighlightRange && lastHoveredText) {
            const interactiveParent = getInteractiveParent(lastHighlightRange.startContainer);
            if (interactiveParent) {
                return;
            }

            clearElements();
            const rect = lastHighlightRange.getBoundingClientRect();
            const savedTop = rect.bottom + window.scrollY;
            const savedLeft = rect.left + window.scrollX;
            const pos = { top: savedTop, popupTop: rect.top + window.scrollY, left: savedLeft, rect: rect }; // Pass rect

            const wordToSearch = lastHoveredText;

            showPopupLoading(wordToSearch, pos);

            chrome.runtime.sendMessage({ action: "analyzeWord", word: wordToSearch }, (response) => {
                if (chrome.runtime.lastError) return;
                if (response && response.success) {
                    updatePopupContent(wordToSearch, response.data);
                } else {
                    updatePopupError(response ? response.error : "未知错误");
                }
            });

            e.preventDefault();
            e.stopPropagation();
        }
    });

    document.addEventListener('mouseleave', () => {
        CSS.highlights.clear();
        scheduleHideIcon();
    });
}

// --- 5. PDF Redirect Logic ---
// 自动检测 PDF 文件并提示
function isPdfViewer() {
    return window.location.pathname.endsWith('/pdf_viewer.html') || window.location.protocol === 'chrome-extension:';
}

if ((document.contentType === 'application/pdf' || window.location.href.endsWith('.pdf')) && !isPdfViewer()) {
    // Inject a floating button to switch to custom viewer
    const btn = document.createElement('div');
    btn.innerText = '用 AI 构词解析打开';
    Object.assign(btn.style, {
        position: 'fixed',
        bottom: '20px',
        right: '25px', // slightly moved
        zIndex: 2147483647, /* Max z-index */
        background: '#4CAF50',
        color: 'white',
        padding: '10px 15px',
        borderRadius: '5px',
        cursor: 'pointer',
        boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
        fontSize: '14px',
        fontFamily: 'system-ui, sans-serif',
        transition: 'transform 0.2s',
        userSelect: 'none'
    });

    btn.onmouseover = () => btn.style.transform = 'scale(1.05)';
    btn.onmouseout = () => btn.style.transform = 'scale(1)';

    btn.addEventListener('click', () => {
        const fileUrl = window.location.href;
        // chrome-extension://<id>/pdf_viewer.html?file=file:///...
        const viewerUrl = chrome.runtime.getURL('pdf_viewer.html') + '?file=' + encodeURIComponent(fileUrl);
        window.open(viewerUrl, '_blank');
    });

    // Make sure body exists (sometimes PDF viewer DOM is weird)
    if (document.body) {
        document.body.appendChild(btn);
    } else {
        window.addEventListener('DOMContentLoaded', () => document.body.appendChild(btn));
    }
}
