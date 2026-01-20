// content.js - 终极完美版 (修复未悬浮无法清除的问题)

// 全局变量
let currentIcon = null;
let currentPopup = null;

// 1. 清除界面元素
function clearElements() {
    if (currentIcon) {
        currentIcon.remove();
        currentIcon = null;
    }
    if (currentPopup) {
        currentPopup.remove();
        currentPopup = null;
    }
}

// 2. 核心监听逻辑
document.addEventListener('dblclick', function(e) {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    // 排除非英文单词
    if (!selectedText || selectedText.includes(' ') || !/^[a-zA-Z]+$/.test(selectedText)) {
        return;
    }

    // --- 步骤A：先算坐标 (防销毁) ---
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // 加上滚动条偏移量，算出绝对位置
    const savedTop = rect.bottom + window.scrollY; 
    const savedLeft = rect.left + window.scrollX;
    
    // --- 步骤B：清理旧界面 ---
    clearElements();

    // --- 步骤C：创建图标 ---
    const icon = document.createElement('div');
    icon.id = 'etymology-icon-btn';
    icon.innerText = '构';
    
    // 使用算好的绝对位置
    icon.style.top = (savedTop + 5) + 'px'; 
    icon.style.left = savedLeft + 'px';

    document.body.appendChild(icon);
    currentIcon = icon;

    // --- 步骤D：悬浮事件 ---
    icon.addEventListener('mouseenter', () => {
        // 把算好的坐标直接打包传给显示函数
        const positionData = {
            top: savedTop,
            left: savedLeft
        };
        
        showPopupLoading(selectedText, positionData);
        
        // 发送消息给后台
        chrome.runtime.sendMessage({ action: "analyzeWord", word: selectedText }, (response) => {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
                return;
            }
            
            if (response && response.success) {
                updatePopupContent(selectedText, response.data);
            } else {
                updatePopupError(response ? response.error : "未知错误");
            }
        });
    });

    icon.addEventListener('mouseleave', () => {
        setTimeout(() => {
           if (currentPopup && !currentPopup.matches(':hover')) {
               currentPopup.style.display = 'none';
           } 
        }, 500);
    });
});

// --- 关键修复在这里 ---
// 点击页面任意位置时的清除逻辑
document.addEventListener('mousedown', function(e) {
    // 只有当图标存在时才需要判断
    if (currentIcon) {
        // 判断1: 点击的是否是图标本身？
        const isClickingIcon = (e.target === currentIcon);
        
        // 判断2: 点击的是否是弹窗内部？(如果弹窗还没生成，就默认为 false)
        const isClickingPopup = (currentPopup && currentPopup.contains(e.target));

        // 如果既不是点图标，也不是点弹窗，那就清除！
        if (!isClickingIcon && !isClickingPopup) {
            // 稍微延时一点点，避免和双击冲突（其实不延时也可以，200ms体验比较好）
            setTimeout(clearElements, 100);
        }
    }
});
// --------------------

// --- UI 显示函数 ---

function showPopupLoading(word, pos) {
    if (!currentPopup) {
        currentPopup = document.createElement('div');
        currentPopup.id = 'etymology-popup-card';
        currentPopup.addEventListener('mouseleave', () => {
            currentPopup.style.display = 'none';
        });
        document.body.appendChild(currentPopup);
    }

    // 加载动画 HTML
    currentPopup.innerHTML = `
        <div class="ety-word">${word}</div>
        <div style="padding: 15px 0; display: flex; align-items: center; justify-content: center; flex-direction: column;">
            <div class="ety-loader"></div>
            <div style="color:#999; font-size:12px; margin-top:8px;">AI 正在分析词源...</div>
        </div>
    `;

    currentPopup.style.display = 'block';
    
    // 使用绝对坐标
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