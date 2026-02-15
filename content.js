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
let allowInteractiveHover = false; // Setting: allow hover on links/buttons

// Initialize setting
try {
    if (chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get(['allowInteractiveHover'], (result) => {
            allowInteractiveHover = result.allowInteractiveHover === true;
        });
    }
} catch (e) {
    console.log("Storage init error", e);
}

// Listen for config updates
if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "updateConfig" && request.key === "allowInteractiveHover") {
            allowInteractiveHover = request.value;
            // Clear current highlights if we just disabled it
            if (!allowInteractiveHover && CSS.highlights) {
                CSS.highlights.clear();
                lastHighlightRange = null;
                scheduleHideIcon();
            }
        }
    });
}

// Helper: Safely Send Message
function safelySendMessage(message, callback) {
    if (chrome.runtime?.id) {
        chrome.runtime.sendMessage(message, (response) => {
            const lastError = chrome.runtime.lastError;
            if (lastError) {
                console.warn("Runtime message error:", lastError);
                if (callback) callback({ success: false, error: lastError.message || "Connection error" });
                return;
            }
            if (callback) callback(response);
        });
    } else {
        console.warn("Extension context invalidated.");
    }
}

// 1. 清除界面元素
/**
 * Clears all extension UI elements (icons, popups) and timers.
 */
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

    let ticking = false;
    distanceTrackHandler = (e) => {
        const clientX = e.clientX;
        const clientY = e.clientY;

        if (!ticking) {
            window.requestAnimationFrame(() => {
                if (!currentPopup || !activeAnchorRect) {
                    ticking = false;
                    return;
                }

                // If mouse is inside Popup, Opacity = 1
                const popupRect = currentPopup.getBoundingClientRect();
                if (clientX >= popupRect.left && clientX <= popupRect.right &&
                    clientY >= popupRect.top && clientY <= popupRect.bottom) {
                    currentPopup.style.opacity = 1;
                    ticking = false;
                    return;
                }

                // Calculate distance to the WORD (Anchor)
                const d = getDistanceToRect(clientX, clientY, activeAnchorRect);

                // Max distance 500px (User requested higher sensitivity range, 500px)
                const MAX_DIST = 500;
                const opacity = Math.max(0, 1 - d / MAX_DIST);

                currentPopup.style.opacity = opacity;
                ticking = false;
            });
            ticking = true;
        }
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
/**
 * Creates and displays the etymology icon near the selected text.
 * @param {DOMRect} rect - The bounding rectangle of the selection.
 * @param {string} text - The selected text.
 * @param {boolean} [autoHide=false] - Whether the icon should auto-hide.
 */
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
    icon.id = 'ety-ext-icon-btn';
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
        safelySendMessage({ action: "analyzeWord", word: text }, (response) => {
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

    // Check if clicking inside icon or popup
    const isClickingIcon = (currentIcon && currentIcon.contains(e.target));
    const isClickingPopup = (currentPopup && currentPopup.contains(e.target));

    if (!isClickingIcon && !isClickingPopup) {
        // If clicking elsewhere, clear elements
        // (Only if they exist, otherwise clearElements is safe to call anyway)
        if (currentIcon || currentPopup) {
            clearElementsTimer = setTimeout(clearElements, 100);
        }
    }
});

// --- UI 显示函数 (保持不变) ---

/**
 * Shows the popup loading state and positions it relative to the selection.
 * @param {string} word - The word being analyzed.
 * @param {Object} pos - Position data object.
 */
function showPopupLoading(word, pos) {
    currentPopupWord = word;
    if (!currentPopup) {
        currentPopup = document.createElement('div');
        currentPopup.id = 'ety-ext-popup-card';
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
        <div class="ety-ext-word">${word}</div>
        <div style="padding: 15px 0; display: flex; align-items: center; justify-content: center; flex-direction: column;">
            <div class="ety-ext-loader"></div>
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

// --- Helper: Clean etymology part strings ---
// --- Helper: Clean etymology part strings ---
function cleanEtyPart(text) {
    if (!text) return "";
    // Remove content in parenthesis e.g. " (not; opposite of)"
    let clean = text.replace(/\s*\(.*?\)/g, "").trim();
    if (clean.toLowerCase() === "none") return ""; // Filter out "None"
    return clean;
}


/**
 * Updates the popup content with the analysis data.
 * @param {string} word - The word analyzed.
 * @param {Object} data - The etymology data (root, prefix, suffix, etc.).
 */
function updatePopupContent(word, data) {
    if (!currentPopup) return;

    // 1. Prepare Data with robustness
    // Function to extract multiple parts from a line like "-able (..) and -ly (..)"
    function extractEtyParts(text) {
        if (!text) return [];
        // 1. Remove parenthetical content
        let clean = text.replace(/\s*\(.*?\)/g, " ").trim();
        if (clean.toLowerCase() === "none") return [];

        // 2. Split by delimiters: comma, semicolon, slash, " and ", " or "
        // We use a regex split
        const parts = clean.split(/[,;/]| and | or /i);

        // 3. Clean each part
        return parts.map(p => {
            return p.trim().replace(/-/g, ""); // Remove hyphens for matching
        }).filter(p => p.length > 0);
    }

    // Extract lists of clean parts
    const prefixParts = extractEtyParts(data.prefix);
    const rootParts = extractEtyParts(data.root);
    const suffixParts = extractEtyParts(data.suffix);

    // 2. Colorize Main Word (Title)
    let coloredWordHMTL = "";

    // We try to consume from start (prefix) and end (suffix)
    let remainingWord = word;
    let titlePrefixPart = "";
    let titleRootPart = "";
    let titleSuffixPart = "";

    // A. Match Prefixes (Longest first)
    // We sort parts by length to ensure greedy matching
    prefixParts.sort((a, b) => b.length - a.length);

    // Retry loop for multiple prefixes? 
    // E.g. "un-" and "pre-". 
    // If we matched "un", remaining is "predictable". "pre" matches?
    // Let's do a while loop.
    let foundPrefix = true;
    while (foundPrefix && remainingWord.length > 0) {
        foundPrefix = false;
        for (const p of prefixParts) {
            if (remainingWord.toLowerCase().startsWith(p.toLowerCase())) {
                titlePrefixPart += `<span class="ety-ext-prefix">${remainingWord.substring(0, p.length)}</span>`;
                remainingWord = remainingWord.substring(p.length);
                foundPrefix = true;
                break; // Restart loop to find next prefix
            }
        }
    }

    // B. Match Suffixes (at End)
    suffixParts.sort((a, b) => b.length - a.length);
    let foundSuffix = true;
    // We build suffix part from the end, so we prepend to titleSuffixPart?
    // Or we just subtract from remainingWord.
    // We need to store the HTML string.
    let suffixHTMLStack = []; // To preserve order [suffix1, suffix2] (inner to outer)

    while (foundSuffix && remainingWord.length > 0) {
        foundSuffix = false;
        for (const p of suffixParts) {
            if (remainingWord.toLowerCase().endsWith(p.toLowerCase())) {
                const match = remainingWord.substring(remainingWord.length - p.length);
                suffixHTMLStack.unshift(`<span class="ety-ext-suffix">${match}</span>`); // Add to start (inner)
                remainingWord = remainingWord.substring(0, remainingWord.length - p.length);
                foundSuffix = true;
                break;
            }
        }
    }
    titleSuffixPart = suffixHTMLStack.join("");

    // C. Match Root (in Middle)
    // Check if any root exists in the remaining middle part
    rootParts.sort((a, b) => b.length - a.length);
    let bestRootMatch = null;
    let bestRootIdx = -1;

    for (const p of rootParts) {
        const idx = remainingWord.toLowerCase().indexOf(p.toLowerCase());
        if (idx !== -1) {
            bestRootMatch = p;
            bestRootIdx = idx;
            break; // Pick longest match found (since sorted)
        }
    }

    if (bestRootMatch) {
        const before = remainingWord.substring(0, bestRootIdx);
        const matched = remainingWord.substring(bestRootIdx, bestRootIdx + bestRootMatch.length);
        const after = remainingWord.substring(bestRootIdx + bestRootMatch.length);

        titleRootPart = `<span class="ety-ext-root">${matched}</span>`;
        otherPart = before + titleRootPart + after;
    } else {
        otherPart = remainingWord;
    }

    coloredWordHMTL = titlePrefixPart + otherPart + titleSuffixPart;




    // 3. Colorize Description & Lists

    // Helper: Single-Pass Regex Colorizer (Fixes nested replacement issues)
    function colorizeText(text, tokensOverride = []) {
        if (!text) return "";
        let processed = text;

        // --- Mask Parentheses Content (Protection) ---
        // We replace content inside (...) with placeholders to prevent coloring
        const placeholders = [];
        // Regex selects (...) blocks. We use a simple non-greedy match.
        // Handling nested parentheses with JS Regex is hard, but simple `\([^)]*\)` covers 95% of etymologies.
        processed = processed.replace(/\([^)]*\)/g, (match) => {
            placeholders.push(match);
            return `__PAREN_MASK_${placeholders.length - 1}__`;
        });

        // Collect tokens
        const tokens = tokensOverride.length > 0 ? tokensOverride : [];

        if (tokens.length === 0) {
            // Default token collection using extracted parts

            // Prefixes
            // rawPrefix might be complex, so we parse it again or use prefixParts?
            // prefixParts contains clean strings "un", "pre"
            prefixParts.forEach(p => {
                tokens.push({ text: p, cls: "ety-ext-prefix" });
                // Hyphenated?
                tokens.push({ text: p + "-", cls: "ety-ext-prefix" });
            });

            // Roots
            rootParts.forEach(p => {
                tokens.push({ text: p, cls: "ety-ext-root" });
            });

            // Suffixes
            suffixParts.forEach(p => {
                tokens.push({ text: p, cls: "ety-ext-suffix" });
                tokens.push({ text: "-" + p, cls: "ety-ext-suffix" });
            });
        }

        // Deduplicate and Filter
        const uniqueTokens = [];
        const seen = new Set();
        // Sort by length desc (Critical for correct matching priority)
        tokens.sort((a, b) => b.text.length - a.text.length);

        tokens.forEach(t => {
            const key = t.text.toLowerCase();
            if (!seen.has(key) && t.text.length > 1 && key !== "none") {
                seen.add(key);
                uniqueTokens.push(t);
            }
        });

        if (uniqueTokens.length === 0) {
            // Restore (even if no tokens, we might have masked)
            processed = processed.replace(/__PAREN_MASK_(\d+)__/g, (match, index) => {
                return placeholders[parseInt(index)] || match;
            });
            return processed;
        }

        // Single Pass Regex Construction
        // Map each token to its class for lookup
        const tokenMap = {};
        const patterns = uniqueTokens.map(t => {
            tokenMap[t.text.toLowerCase()] = t.cls;
            // Escape special regex chars
            return t.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        });

        // Create a single master regex that matches any of the tokens
        // The regex engine will try alternatives in order (which is sorted by length)
        const masterRegex = new RegExp(`(${patterns.join('|')})`, 'gi');

        processed = processed.replace(masterRegex, (match) => {
            const cls = tokenMap[match.toLowerCase()];
            if (!cls) return match;
            return `<span class="${cls}">${match}</span>`;
        });

        // --- Restore Parentheses Content ---
        processed = processed.replace(/__PAREN_MASK_(\d+)__/g, (match, index) => {
            return placeholders[parseInt(index)] || match;
        });

        return processed;
    }

    // Process the description
    // Use the default tokens (Prefix, Root, Suffix)
    const finalDesc = colorizeText(data.desc);

    // 4. Construct HTML

    // Generate Tokens for Specific Lines
    // We want to highlight ALL found parts in that line type.

    let prefixLineTokens = [];
    prefixParts.forEach(p => {
        prefixLineTokens.push({ text: p, cls: "ety-ext-prefix" });
        prefixLineTokens.push({ text: p + "-", cls: "ety-ext-prefix" });
    });

    let rootLineTokens = [];
    rootParts.forEach(p => {
        rootLineTokens.push({ text: p, cls: "ety-ext-root" });
    });

    let suffixLineTokens = [];
    suffixParts.forEach(p => {
        suffixLineTokens.push({ text: p, cls: "ety-ext-suffix" });
        suffixLineTokens.push({ text: "-" + p, cls: "ety-ext-suffix" });
    });

    const finalPrefixLine = colorizeText(data.prefix, prefixLineTokens);
    const finalRootLine = colorizeText(data.root, rootLineTokens);
    const finalSuffixLine = colorizeText(data.suffix, suffixLineTokens);

    currentPopup.innerHTML = `
        <div class="ety-ext-word">${coloredWordHMTL} <span style="font-weight:normal; font-size:14px; color:#666;">(${data.translation || '...'})</span></div>
        <div class="ety-ext-part"><span class="ety-ext-label">前缀:</span><span class="ety-ext-val">${finalPrefixLine}</span></div>
        <div class="ety-ext-part"><span class="ety-ext-label">词根:</span><span class="ety-ext-val">${finalRootLine}</span></div>
        <div class="ety-ext-part"><span class="ety-ext-label">后缀:</span><span class="ety-ext-val">${finalSuffixLine}</span></div>
        <div class="ety-ext-part" style="color:#555; font-size:13px; margin-top:10px; line-height:1.4; border-top:1px dashed #eee; padding-top:8px;">
            ${finalDesc}
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

    // Helper to get neighbor word ranges
    function getNeighborRanges(startNode, startOffset, endNode, endOffset, count) {
        const ranges = [];
        const blockElements = new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'HR', 'TABLE', 'TR', 'TD', 'TH']);

        // --- 1. Find Previous Neighbors ---
        let currNode = startNode;
        let currOffset = startOffset;
        let found = 0;

        // Move backwards from start
        while (found < count) {
            // Navigate backwards in DOM
            if (currOffset > 0) {
                // We are in a text node, check char by char? No, let's use words.
                // But the text content might contain multiple words.
                // We used tokenizer logic before...
                // Let's rely on string parsing within the text node first, then jump nodes.
                // Actually, simpler approach:
                // We just expand the range character by character until we find a word boundary?
                // Or use regex on the text content?

                // Strategy:
                // 1. Get text of current node up to offset.
                // 2. Split by words.
                // 3. If we have words, take the last one.
                // 4. If no words, move to previous node.
            }
            // This is getting complicated to do robustly with raw DOM.
            // Let's use a simpler heuristic for now: DOM Tree Walker or just traversing text nodes.
            // Actually, let's look at `getSentenceRange` implementation... it was intra-node only.
            // We need cross-node support ideally, but let's start with robustness within block.
            break; // Placeholder
        }

        // REVISED STRATEGY: Use TreeWalker to get text nodes in sequence.
        function getTextNodes(root, startNode) {
            const walker = document.createTreeWalker(
                root,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );
            const nodes = [];
            let currentNode;
            while (currentNode = walker.nextNode()) {
                nodes.push(currentNode);
            }
            return nodes;
        }

        // Optimized approach:
        // Just scan the text context of the parent block? 
        // That might be too heavy.

        // Let's stick to the requested "2 neighbors".
        // We'll search backwards and forwards.

        // BACKWARD SEARCH
        let prevRanges = [];
        let pNode = startNode;
        let pOffset = startOffset;
        let wordsFound = 0;

        // We need to traverse text nodes backwards.
        // Helper to get previous text node
        function getPrevTextNode(node) {
            let prev = node.previousSibling;
            while (prev) {
                if (prev.nodeType === Node.TEXT_NODE) return prev;
                if (prev.nodeType === Node.ELEMENT_NODE && !blockElements.has(prev.tagName)) {
                    // Go deep
                    if (prev.lastChild) {
                        prev = prev.lastChild;
                        continue;
                    }
                }
                prev = prev.previousSibling;
            }
            // Go up and prev
            let parent = node.parentNode;
            if (parent && parent !== document.body && !blockElements.has(parent.tagName)) {
                return getPrevTextNode(parent);
            }
            return null;
        }

        // Simple Backward Scan within simple text flow
        // Only scan within the same block element to avoid crossing paragraphs
        const parentBlock = (function (node) {
            let p = node.parentElement;
            while (p && window.getComputedStyle(p).display === 'inline') {
                p = p.parentElement;
            }
            return p || document.body;
        })(startNode);


        // Build a stream of text from the block... 
        // Maybe using `Intl.Segmenter` if available? 
        // Or just regex.

        // Let's try a range expansion approach using `modify`.
        // Note: `selection.modify` alters selection. We don't want that.

        // Let's simply look at the textContent of the block and map it back to ranges?
        // Hard to map back.

        // Manual DOM Traversal it is.

        // ... (Implementation detail: I will stick to a simpler "Same Text Node" + "Previous Text Node" logic for stability first)
        // Actually, `getSentenceRange` was already limited.

        function isWordChar(char) {
            return /[a-zA-Z0-9\u00C0-\u00FF'’\-]/.test(char);
        }

        // Backward
        let foundCount = 0;
        let tempRanges = [];

        let walker = document.createTreeWalker(parentBlock, NodeFilter.SHOW_TEXT, null, false);
        let allTextNodes = [];
        let n;
        while (n = walker.nextNode()) allTextNodes.push(n);

        let startIndex = allTextNodes.indexOf(startNode);
        if (startIndex === -1) return []; // Should not happen

        // Search Backwards
        let currentTextStr = allTextNodes[startIndex].textContent;
        let cursor = startOffset;
        let nodeIdx = startIndex;

        for (let i = 0; i < count; i++) {
            // Search for end of word
            while (nodeIdx >= 0) {
                while (cursor > 0) {
                    if (isWordChar(currentTextStr[cursor - 1])) {
                        // Found end of a word?
                        // Verify it's a word end? We are moving backwards.
                        // We need to skip spaces first.
                        break;
                    }
                    cursor--;
                }
                if (cursor > 0 && isWordChar(currentTextStr[cursor - 1])) break; // Found word char

                // Move to prev node
                nodeIdx--;
                if (nodeIdx >= 0) {
                    currentTextStr = allTextNodes[nodeIdx].textContent;
                    cursor = currentTextStr.length;
                }
            }

            if (nodeIdx < 0) break;

            // Found end of word (at cursor). Now find start.
            let endWordCursor = cursor;
            let endWordNodeIdx = nodeIdx;

            while (nodeIdx >= 0) {
                while (cursor > 0) {
                    if (!isWordChar(currentTextStr[cursor - 1])) {
                        break;
                    }
                    cursor--;
                }
                if (cursor > 0 || (cursor === 0 && nodeIdx === 0)) break; // Found start
                if (cursor === 0 && nodeIdx > 0 && isWordChar(currentTextStr[0])) {
                    // Check previous node to see if word continues?
                    // For simplicity, let's break word at node boundary if needed, or check.
                    // Let's assume word doesn't span nodes for now or just take what we have.

                    // Actually, let's just stop at node start for simplicity in this iteration.
                    // If we needed to merge, we'd need complex logic.
                    break;
                }
                // If we reached 0 and it IS a word char, we might need to continue to prev node
                // but for now let's stop.
            }

            // Create Range
            let r = document.createRange();
            r.setStart(allTextNodes[nodeIdx], cursor);
            r.setEnd(allTextNodes[endWordNodeIdx], endWordCursor);
            tempRanges.push(r);

            // Prepare for next word
            // cursor is already at start of word (or space before it). 
            // The outer loop's skip-space logic will handle moving further back.
        }

        // Reverse because we found them closest-first
        // But wait, the loop above logic is a bit slightly flawed for "skipping spaces"
        // Let's rewrite strictly:

        // 1. Skip non-word chars (backwards)
        // 2. Scan word chars (backwards) -> Define Word

        // Reset
        cursor = startOffset;
        nodeIdx = startIndex;
        tempRanges = [];

        for (let i = 0; i < count; i++) {
            // 1. Skip non-word
            while (true) {
                if (cursor > 0) {
                    if (isWordChar(allTextNodes[nodeIdx].textContent[cursor - 1])) break;
                    cursor--;
                } else {
                    if (nodeIdx > 0) {
                        nodeIdx--;
                        cursor = allTextNodes[nodeIdx].textContent.length;
                    } else {
                        break; // End of doc
                    }
                }
            }
            if (nodeIdx === 0 && cursor === 0) break;

            let wordEndNode = allTextNodes[nodeIdx];
            let wordEndOffset = cursor;

            // 2. Scan word
            while (true) {
                if (cursor > 0) {
                    if (!isWordChar(allTextNodes[nodeIdx].textContent[cursor - 1])) break;
                    cursor--;
                } else {
                    if (nodeIdx > 0) {
                        // Check if prev node ends with word char?
                        // If yes, continue word?
                        let prevNode = allTextNodes[nodeIdx - 1];
                        if (isWordChar(prevNode.textContent[prevNode.textContent.length - 1])) {
                            nodeIdx--;
                            cursor = prevNode.textContent.length;
                        } else {
                            break;
                        }
                    } else {
                        break;
                    }
                }
            }

            let wordStartNode = allTextNodes[nodeIdx];
            let wordStartOffset = cursor;

            // Add Range
            let r = document.createRange();
            r.setStart(wordStartNode, wordStartOffset);
            r.setEnd(wordEndNode, wordEndOffset);
            tempRanges.push(r);
        }

        ranges.push(...tempRanges);

        // FORWARD SEARCH
        cursor = endOffset;
        nodeIdx = startIndex; // Start from end of selected word
        tempRanges = [];

        for (let i = 0; i < count; i++) {
            // 1. Skip non-word
            while (true) {
                let txt = allTextNodes[nodeIdx].textContent;
                if (cursor < txt.length) {
                    if (isWordChar(txt[cursor])) break;
                    cursor++;
                } else {
                    if (nodeIdx < allTextNodes.length - 1) {
                        nodeIdx++;
                        cursor = 0;
                    } else {
                        break;
                    }
                }
            }
            if (nodeIdx === allTextNodes.length - 1 && cursor === allTextNodes[nodeIdx].textContent.length) break;

            let wordStartNode = allTextNodes[nodeIdx];
            let wordStartOffset = cursor;

            // 2. Scan word
            while (true) {
                let txt = allTextNodes[nodeIdx].textContent;
                if (cursor < txt.length) {
                    if (!isWordChar(txt[cursor])) break;
                    cursor++;
                } else {
                    if (nodeIdx < allTextNodes.length - 1) {
                        // Check if next node starts with word char
                        let nextNode = allTextNodes[nodeIdx + 1];
                        if (isWordChar(nextNode.textContent[0])) {
                            nodeIdx++;
                            cursor = 0;
                        } else {
                            break;
                        }
                    } else {
                        break;
                    }
                }
            }

            let wordEndNode = allTextNodes[nodeIdx];
            let wordEndOffset = cursor;

            let r = document.createRange();
            r.setStart(wordStartNode, wordStartOffset);
            r.setEnd(wordEndNode, wordEndOffset);
            tempRanges.push(r);
        }

        ranges.push(...tempRanges);

        return ranges;
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
            // 1. Interactive Element (Link/Button)
            // Check setting: if NOT allowed, remove effects and return
            if (!allowInteractiveHover) {
                CSS.highlights.clear();
                lastHighlightRange = null;
                // No icon, no highlights. Just return.
                return;
            }
            // If allowed, fall through to Normal Text logic...
        }

        // 2. Normal Text (or Allowed Interactive) -> Apply Highlights

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

        // Helper to get neighbor word ranges with distance
        function getNeighborRanges(startNode, startOffset, endNode, endOffset, count) {
            const rangesVec = []; // Array of arrays: [ [L1, R1], [L2, R2], ... ]
            // Strategy: Find neighbors iteratively

            // Helper: Get text nodes in block
            const blockElements = new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'HR', 'TABLE', 'TR', 'TD', 'TH']);
            const parentBlock = (function (node) {
                let p = node.parentElement;
                while (p && window.getComputedStyle(p).display === 'inline') {
                    p = p.parentElement;
                }
                return p || document.body;
            })(startNode);

            const walker = document.createTreeWalker(parentBlock, NodeFilter.SHOW_TEXT, null, false);
            const allTextNodes = [];
            let n;
            while (n = walker.nextNode()) allTextNodes.push(n);

            let startIndex = allTextNodes.indexOf(startNode);
            if (startIndex === -1) return [];

            function isWordChar(char) {
                return /[a-zA-Z0-9\u00C0-\u00FF'’\-]/.test(char);
            }

            // Backward Search
            // Returns array of ranges, closest first
            function findBackwards(startIdx, startOff, k) {
                let results = [];
                let cursor = startOff;
                let nodeIdx = startIdx;

                for (let i = 0; i < k; i++) {
                    // 1. Skip non-word
                    while (true) {
                        if (cursor > 0) {
                            if (isWordChar(allTextNodes[nodeIdx].textContent[cursor - 1])) break;
                            cursor--;
                        } else {
                            if (nodeIdx > 0) {
                                nodeIdx--;
                                cursor = allTextNodes[nodeIdx].textContent.length;
                            } else {
                                break;
                            }
                        }
                    }
                    if (nodeIdx === 0 && cursor === 0) break;

                    let wordEndNode = allTextNodes[nodeIdx];
                    let wordEndOffset = cursor;

                    // 2. Scan word
                    while (true) {
                        if (cursor > 0) {
                            if (!isWordChar(allTextNodes[nodeIdx].textContent[cursor - 1])) break;
                            cursor--;
                        } else {
                            if (nodeIdx > 0) {
                                let prevNode = allTextNodes[nodeIdx - 1];
                                if (isWordChar(prevNode.textContent[prevNode.textContent.length - 1])) {
                                    nodeIdx--;
                                    cursor = prevNode.textContent.length;
                                } else {
                                    break;
                                }
                            } else {
                                break;
                            }
                        }
                    }
                    let wordStartNode = allTextNodes[nodeIdx];
                    let wordStartOffset = cursor;

                    let r = document.createRange();
                    r.setStart(wordStartNode, wordStartOffset);
                    r.setEnd(wordEndNode, wordEndOffset);
                    results.push(r);
                }
                return results;
            }

            // Forward Search
            function findForwards(startIdx, startOff, k) {
                let results = [];
                let cursor = startOff;
                let nodeIdx = startIdx;

                for (let i = 0; i < k; i++) {
                    // 1. Skip non-word
                    while (true) {
                        let txt = allTextNodes[nodeIdx].textContent;
                        if (cursor < txt.length) {
                            if (isWordChar(txt[cursor])) break;
                            cursor++;
                        } else {
                            if (nodeIdx < allTextNodes.length - 1) {
                                nodeIdx++;
                                cursor = 0;
                            } else {
                                break;
                            }
                        }
                    }
                    if (nodeIdx === allTextNodes.length - 1 && cursor === allTextNodes[nodeIdx].textContent.length) break;

                    let wordStartNode = allTextNodes[nodeIdx];
                    let wordStartOffset = cursor;

                    // 2. Scan word
                    while (true) {
                        let txt = allTextNodes[nodeIdx].textContent;
                        if (cursor < txt.length) {
                            if (!isWordChar(txt[cursor])) break;
                            cursor++;
                        } else {
                            if (nodeIdx < allTextNodes.length - 1) {
                                let nextNode = allTextNodes[nodeIdx + 1];
                                if (isWordChar(nextNode.textContent[0])) {
                                    nodeIdx++;
                                    cursor = 0;
                                } else {
                                    break;
                                }
                            } else {
                                break;
                            }
                        }
                    }
                    let wordEndNode = allTextNodes[nodeIdx];
                    let wordEndOffset = cursor;

                    let r = document.createRange();
                    r.setStart(wordStartNode, wordStartOffset);
                    r.setEnd(wordEndNode, wordEndOffset);
                    results.push(r);
                }
                return results;
            }

            const leftRanges = findBackwards(startIndex, startOffset, count);
            const rightRanges = findForwards(startIndex, endOffset, count);

            return { left: leftRanges, right: rightRanges };
        }

        // Get categorized neighbors
        const neighbors = getNeighborRanges(range.startContainer, range.startOffset, range.endContainer, range.endOffset, 3);

        // Level 1: Immediate neighbors (Index 0 of left and right)
        const level1Ranges = [];
        if (neighbors.left[0]) level1Ranges.push(neighbors.left[0]);
        if (neighbors.right[0]) level1Ranges.push(neighbors.right[0]);

        // Level 2: Outer neighbors (Index 1 of left and right)
        const level2Ranges = [];
        if (neighbors.left[1]) level2Ranges.push(neighbors.left[1]);
        if (neighbors.right[1]) level2Ranges.push(neighbors.right[1]);

        const wordHighlight = new Highlight(wordData.range);
        const neighborHighlight1 = new Highlight(...level1Ranges);
        const neighborHighlight2 = new Highlight(...level2Ranges);

        const element = range.startContainer.parentElement;

        if (shouldUseCleanStyle(element)) {
            // Apply Clean Style (Underline only, no background)
            CSS.highlights.set("word-highlight-clean", wordHighlight);

            // For neighbors in clean style, separate classes if needed, or unify?
            // User didn't specify gradient for clean style, let's just use dashed for all neighbors for simplicity
            const neighborHighlightClean = new Highlight(...level1Ranges, ...level2Ranges);
            CSS.highlights.set("neighbor-highlight-clean", neighborHighlightClean);

            // Ensure other highlights are removed
            CSS.highlights.delete("word-highlight");
            CSS.highlights.delete("neighbor-highlight-1");
            CSS.highlights.delete("neighbor-highlight-2");
            CSS.highlights.delete("neighbor-highlight"); // Old
            CSS.highlights.delete("sentence-highlight");
            CSS.highlights.delete("sentence-highlight-clean");
        } else {
            // Apply Normal Style
            CSS.highlights.set("word-highlight", wordHighlight);
            // Apply Gradient Highlights
            if (level1Ranges.length > 0) CSS.highlights.set("neighbor-highlight-1", neighborHighlight1);
            else CSS.highlights.delete("neighbor-highlight-1");

            if (level2Ranges.length > 0) CSS.highlights.set("neighbor-highlight-2", neighborHighlight2);
            else CSS.highlights.delete("neighbor-highlight-2");

            // Ensure clean/old highlights are removed
            CSS.highlights.delete("word-highlight-clean");
            CSS.highlights.delete("neighbor-highlight-clean");
            CSS.highlights.delete("neighbor-highlight"); // Old
            CSS.highlights.delete("sentence-highlight-clean");
            CSS.highlights.delete("sentence-highlight");
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
