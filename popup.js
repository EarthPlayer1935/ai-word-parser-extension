document.addEventListener('DOMContentLoaded', function () {
    const input = document.getElementById('word-input');
    const btn = document.getElementById('search-btn');
    const resultArea = document.getElementById('result-area');
    const loadingDiv = document.getElementById('loading');
    const contentDiv = document.getElementById('content');
    const errorDiv = document.getElementById('error');

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

    function showResult(word, data) {
        contentDiv.style.display = 'block';

        document.getElementById('res-word').innerText = word;
        document.getElementById('res-prefix').innerText = data.prefix;
        document.getElementById('res-root').innerText = data.root;
        document.getElementById('res-suffix').innerText = data.suffix;
        document.getElementById('res-desc').innerText = data.desc;
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