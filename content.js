// content.js - 支持双击与滑动选词 (Ultimate Edition)

// 全局变量
let currentIcon = null;
let currentPopup = null;
let lastIconWord = null; // Track the word associated with the current icon
let hideIconTimer = null; // Timer for auto-hiding the icon
let timeoutPopup = null; // Timer for auto-hiding the popup

// 1. 清除界面元素
function clearElements() {
    if (currentIcon) {
        currentIcon.remove();
        currentIcon = null;
        lastIconWord = null;
    }
    if (currentPopup) {
        currentPopup.remove();
        currentPopup = null;
    }
    cancelHideIcon(); // Clear any pending hide timers
    if (timeoutPopup) clearTimeout(timeoutPopup);
}

// Timer Logic for Auto-Hide
function scheduleHideIcon() {
    // REFINED: Don't resetting the timer if it's already running.
    // This allows the grace period to expire even if mouse keeps moving on non-interactive areas.
    if (hideIconTimer) return;

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
    const icon = document.createElement('div');
    icon.id = 'etymology-icon-btn';
    icon.innerText = '构';
    icon.dataset.isAutoHide = String(autoHide); // Store the mode

    // 使用算好的绝对位置
    icon.style.top = (savedTop + 5) + 'px';
    icon.style.left = savedLeft + 'px';

    document.body.appendChild(icon);
    currentIcon = icon;
    lastIconWord = text;

    // --- 步骤D：悬浮事件 (图标本身) ---
    icon.addEventListener('mouseenter', () => {
        cancelHideIcon(); // Don't hide if we enter the icon

        const positionData = {
            top: savedTop,
            left: savedLeft
        };

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
    if (currentIcon) {
        // 判断是否点击了图标或弹窗
        const isClickingIcon = (e.target === currentIcon);
        const isClickingPopup = (currentPopup && currentPopup.contains(e.target));

        if (!isClickingIcon && !isClickingPopup) {
            // 点击别处时，清除图标
            setTimeout(clearElements, 100);
        }
    }
});

// --- UI 显示函数 (保持不变) ---

function showPopupLoading(word, pos) {
    if (!currentPopup) {
        currentPopup = document.createElement('div');
        currentPopup.id = 'etymology-popup-card';
        // Keep popup open if hovered, hide if left
        currentPopup.addEventListener('mouseenter', cancelHideIcon);
        currentPopup.addEventListener('mouseleave', () => {
            // Auto-close with delay to allow moving back
            // FIX: Reduced delay from 300ms to 100ms to make the popup disappear faster when mouse leaves
            timeoutPopup = setTimeout(() => {
                const iconHovered = currentIcon && currentIcon.matches(':hover');
                const popupHovered = currentPopup && currentPopup.matches(':hover');

                if (!iconHovered && !popupHovered) {
                    currentPopup.style.display = 'none';
                    // Also clear icon if it was auto-hide
                    if (currentIcon && currentIcon.dataset.isAutoHide === 'true') {
                        clearElements();
                    }
                }
            }, 100); // Reduced delay for responsiveness
        });
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
    currentPopup.style.top = (pos.top + 35) + 'px';
    currentPopup.style.left = pos.left + 'px';
}

function updatePopupContent(word, data) {
    if (!currentPopup) return;

    currentPopup.innerHTML = `
        <div class="ety-word">${word}</div>
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
        while (curr && curr !== document.body) {
            if (curr.tagName === 'A' || curr.tagName === 'BUTTON') {
                return curr;
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

        const sentenceRange = getSentenceRange(range);

        const wordHighlight = new Highlight(wordData.range);
        const sentenceHighlight = new Highlight(sentenceRange);

        CSS.highlights.set("word-highlight", wordHighlight);
        CSS.highlights.set("sentence-highlight", sentenceHighlight);

        lastHighlightRange = wordData.range;
        lastHoveredText = wordData.text;

        // --- Smart Interaction ---
        const interactiveParent = getInteractiveParent(range.startContainer);
        if (interactiveParent) {
            // Hovered a link/button -> Show icon, enable AutoHide and cancel hide timer
            if (hoverRect) {
                cancelHideIcon();
                createEtymologyIcon(hoverRect, wordData.text, true);
            }
        } else {
            // Normal Text.
            // If we just left a Link, we should hide the icon (after delay).
            // If we are just browsing normal text, this call is redundant but harmless (checks timer).
            scheduleHideIcon();
        }
    }

    document.addEventListener('click', (e) => {
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
            const pos = { top: savedTop, left: savedLeft };

            showPopupLoading(lastHoveredText, pos);

            chrome.runtime.sendMessage({ action: "analyzeWord", word: lastHoveredText }, (response) => {
                if (chrome.runtime.lastError) return;
                if (response && response.success) {
                    updatePopupContent(lastHoveredText, response.data);
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
