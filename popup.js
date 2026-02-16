document.addEventListener('DOMContentLoaded', function () {
    const input = document.getElementById('word-input');
    const btn = document.getElementById('search-btn');
    const resultArea = document.getElementById('result-area');
    const loadingDiv = document.getElementById('loading');
    const contentDiv = document.getElementById('content');
    const errorDiv = document.getElementById('error');

    // View Elements
    const mainView = document.getElementById('main-view');
    const settingsView = document.getElementById('settings-view');
    const settingsBtn = document.getElementById('settings-btn');
    const backBtn = document.getElementById('back-btn');

    // --- Navigation Logic ---
    settingsBtn.addEventListener('click', () => {
        mainView.style.display = 'none';
        settingsView.style.display = 'block';
        settingsBtn.style.visibility = 'hidden'; // Hide settings icon in settings view
    });

    backBtn.addEventListener('click', () => {
        settingsView.style.display = 'none';
        mainView.style.display = 'block';
        settingsBtn.style.visibility = 'visible';
    });

    // --- Search Logic ---

    // 绑定点击事件
    btn.addEventListener('click', () => {
        doSearch();
    });

    // 绑定回车事件 (体验优化)
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            doSearch();
        }
    });

    // Default Word Logic
    // Pre-fill and select the long word for fun/demo
    input.value = "Supercalifragilisticexpialidocious";
    input.select();

    function doSearch() {
        const word = input.value.trim();

        // 校验输入
        if (!word || !/^[a-zA-Z\s]+$/.test(word)) {
            showError("请输入有效的英文单词");
            return;
        }

        // 1. UI 切换到加载状态
        resultArea.style.display = 'block';
        contentDiv.style.display = 'none';
        errorDiv.style.display = 'none';
        loadingDiv.style.display = 'block';

        // 2. 发送消息给 background.js (复用之前的逻辑)
        chrome.runtime.sendMessage({ action: "analyzeWord", word: word }, (response) => {

            loadingDiv.style.display = 'none';

            if (chrome.runtime.lastError) {
                showError("连接失败，请重试");
                return;
            }

            if (response && response.success) {
                showResult(word, response.data);
            } else {
                showError(response ? response.error : "未知错误");
            }
        });
    }

    // --- Coloring Logic (Adapted from content.js) ---

    // Function to extract multiple parts from a line like "-able (..) and -ly (..)"
    function extractEtyParts(text) {
        if (!text) return [];
        // 1. Remove parenthetical content
        let clean = text.replace(/\s*\(.*?\)/g, " ").trim();
        if (clean.toLowerCase() === "none") return [];

        // 2. Split by delimiters: comma, semicolon, slash, " and ", " or "
        const parts = clean.split(/[,;/]| and | or /i);

        // 3. Clean each part
        return parts.map(p => {
            return p.trim().replace(/-/g, ""); // Remove hyphens for matching
        }).filter(p => p.length > 0);
    }

    function colorizeMainWord(word, data) {
        const prefixParts = extractEtyParts(data.prefix);
        const rootParts = extractEtyParts(data.root);
        const suffixParts = extractEtyParts(data.suffix);

        let coloredWordHMTL = "";
        let remainingWord = word;
        let titlePrefixPart = "";
        let titleRootPart = "";
        let titleSuffixPart = "";

        // A. Match Prefixes (Longest first)
        prefixParts.sort((a, b) => b.length - a.length);
        let foundPrefix = true;
        while (foundPrefix && remainingWord.length > 0) {
            foundPrefix = false;
            for (const p of prefixParts) {
                if (remainingWord.toLowerCase().startsWith(p.toLowerCase())) {
                    titlePrefixPart += `<span class="ety-ext-prefix">${remainingWord.substring(0, p.length)}</span>`;
                    remainingWord = remainingWord.substring(p.length);
                    foundPrefix = true;
                    break;
                }
            }
        }

        // B. Match Suffixes (at End)
        suffixParts.sort((a, b) => b.length - a.length);
        let foundSuffix = true;
        let suffixHTMLStack = [];

        while (foundSuffix && remainingWord.length > 0) {
            foundSuffix = false;
            for (const p of suffixParts) {
                if (remainingWord.toLowerCase().endsWith(p.toLowerCase())) {
                    const match = remainingWord.substring(remainingWord.length - p.length);
                    suffixHTMLStack.unshift(`<span class="ety-ext-suffix">${match}</span>`);
                    remainingWord = remainingWord.substring(0, remainingWord.length - p.length);
                    foundSuffix = true;
                    break;
                }
            }
        }
        titleSuffixPart = suffixHTMLStack.join("");

        // C. Match Root (in Middle)
        rootParts.sort((a, b) => b.length - a.length);
        let bestRootMatch = null;
        let bestRootIdx = -1;

        for (const p of rootParts) {
            const idx = remainingWord.toLowerCase().indexOf(p.toLowerCase());
            if (idx !== -1) {
                bestRootMatch = p;
                bestRootIdx = idx;
                break;
            }
        }

        let otherPart = "";
        if (bestRootMatch) {
            const before = remainingWord.substring(0, bestRootIdx);
            const matched = remainingWord.substring(bestRootIdx, bestRootIdx + bestRootMatch.length);
            const after = remainingWord.substring(bestRootIdx + bestRootMatch.length);

            titleRootPart = `<span class="ety-ext-root">${matched}</span>`;
            otherPart = before + titleRootPart + after;
        } else {
            otherPart = remainingWord;
        }

        return titlePrefixPart + otherPart + titleSuffixPart;
    }

    function colorizeText(text, tokensOverride = []) {
        if (!text) return "";
        let processed = text;

        // Mask Parentheses
        const placeholders = [];
        processed = processed.replace(/\([^)]*\)/g, (match) => {
            placeholders.push(match);
            return `__PAREN_MASK_${placeholders.length - 1}__`;
        });

        // Collect tokens
        // Note: In popup.js we might not have 'prefixParts' handy unless passed.
        // But for simplicity in the description, we largely rely on simple regex or just the tokens passed.
        // If tokensOverride is empty, we might skip generic coloring or re-extract?
        // Let's assume for description we want generic coloring if possible.
        // For simplicity here, we only use tokensOverride if provided.

        let tokens = tokensOverride;
        if (tokens.length === 0) {
            // If no tokens provided, we skip detailed coloring for now to avoid complexity overkill
            // or we could reimplement the full logic if needed. 
            // Ideally we pass data to this function.
        }

        // Deduplicate and Filter
        const uniqueTokens = [];
        const seen = new Set();
        tokens.sort((a, b) => b.text.length - a.text.length);

        tokens.forEach(t => {
            const key = t.text.toLowerCase();
            if (!seen.has(key) && t.text.length > 1 && key !== "none") {
                seen.add(key);
                uniqueTokens.push(t);
            }
        });

        if (uniqueTokens.length > 0) {
            const tokenMap = {};
            const patterns = uniqueTokens.map(t => {
                tokenMap[t.text.toLowerCase()] = t.cls;
                return t.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            });

            const masterRegex = new RegExp(`(${patterns.join('|')})`, 'gi');
            processed = processed.replace(masterRegex, (match) => {
                const cls = tokenMap[match.toLowerCase()];
                if (!cls) return match;
                return `<span class="${cls}">${match}</span>`;
            });
        }

        // Restore Parentheses
        processed = processed.replace(/__PAREN_MASK_(\d+)__/g, (match, index) => {
            return placeholders[parseInt(index)] || match;
        });

        return processed;
    }


    function showResult(word, data) {
        contentDiv.style.display = 'block';

        // 1. Colorize Title
        const coloredTitle = colorizeMainWord(word, data);
        document.getElementById('res-word').innerHTML = coloredTitle;

        // 2. Translation
        const translation = data.translation ? `(${data.translation})` : "";
        document.getElementById('res-trans').innerText = translation;


        // 3. Prepare tokens for Description & Lines
        const prefixParts = extractEtyParts(data.prefix);
        const rootParts = extractEtyParts(data.root);
        const suffixParts = extractEtyParts(data.suffix);

        let allTokens = [];
        prefixParts.forEach(p => {
            allTokens.push({ text: p, cls: "ety-ext-prefix" });
            allTokens.push({ text: p + "-", cls: "ety-ext-prefix" });
        });
        rootParts.forEach(p => {
            allTokens.push({ text: p, cls: "ety-ext-root" });
        });
        suffixParts.forEach(p => {
            allTokens.push({ text: p, cls: "ety-ext-suffix" });
            allTokens.push({ text: "-" + p, cls: "ety-ext-suffix" });
        });

        // 4. Colorize Parts
        // For specific lines, we prioritize their own parts
        let prefixTokens = [];
        prefixParts.forEach(p => { prefixTokens.push({ text: p, cls: "ety-ext-prefix" }); prefixTokens.push({ text: p + "-", cls: "ety-ext-prefix" }); });

        let rootTokens = [];
        rootParts.forEach(p => { rootTokens.push({ text: p, cls: "ety-ext-root" }); });

        let suffixTokens = [];
        suffixParts.forEach(p => { suffixTokens.push({ text: p, cls: "ety-ext-suffix" }); suffixTokens.push({ text: "-" + p, cls: "ety-ext-suffix" }); });


        document.getElementById('res-prefix').innerHTML = colorizeText(data.prefix, prefixTokens);
        document.getElementById('res-root').innerHTML = colorizeText(data.root, rootTokens);
        document.getElementById('res-suffix').innerHTML = colorizeText(data.suffix, suffixTokens);
        document.getElementById('res-desc').innerHTML = colorizeText(data.desc, allTokens);
    }

    function showError(msg) {
        resultArea.style.display = 'block';
        loadingDiv.style.display = 'none';
        contentDiv.style.display = 'none';
        errorDiv.style.display = 'block';
        errorDiv.innerText = msg;
    }

    // --- Settings Logic ---
    const toggleInteractive = document.getElementById('toggle-interactive');

    // 1. Load saved setting
    chrome.storage.sync.get(['allowInteractiveHover'], (result) => {
        // Default to false if not set
        const isAllowed = result.allowInteractiveHover === true;
        toggleInteractive.checked = isAllowed;
    });

    // 2. Handle change
    toggleInteractive.addEventListener('change', () => {
        const isAllowed = toggleInteractive.checked;

        // Save to storage
        chrome.storage.sync.set({ allowInteractiveHover: isAllowed }, () => {
            console.log('Setting saved:', isAllowed);
        });

        // Notify active tab to update immediately
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: "updateConfig",
                    key: "allowInteractiveHover",
                    value: isAllowed
                });
            }
        });
    });
});