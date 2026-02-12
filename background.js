try {
    importScripts('config.js');
} catch (e) {
    console.error(e);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "analyzeWord") {
        // 使用 async 函数处理逻辑，保持消息通道打开
        handleWordAnalysis(request.word, sendResponse);
        return true; // 告诉 Chrome 我们会异步发送响应
    }
});

async function handleWordAnalysis(word, sendResponse) {
    const lowerWord = word.toLowerCase().trim();
    const cacheKey = `cache_ety_v2_${lowerWord}`;

    try {
        // 1. 检查缓存
        const cachedResult = await chrome.storage.local.get(cacheKey);

        if (cachedResult[cacheKey]) {
            console.log(`[Cache Hit] 从缓存中读取了: ${word}`);
            sendResponse({ success: true, data: cachedResult[cacheKey] });
            return;
        }

        // 2. 缓存没命中，请求 API
        console.log(`[API Request] 正在请求 API: ${word}`);
        const apiData = await fetchEtymology(word);

        // 3. 存入缓存 (这里并没有设置过期时间，意味着除非你手动删，否则永久保存)
        await chrome.storage.local.set({ [cacheKey]: apiData });

        sendResponse({ success: true, data: apiData });

    } catch (error) {
        console.error("处理失败:", error);
        sendResponse({ success: false, error: error.message });
    }
}

async function fetchEtymology(word) {
    // 关键修改：将模型版本从 1.5 改为 2.5
    // 注意：如果是 2026 年，gemini-2.5-flash 是最新的稳定版
    const modelVersion = "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelVersion}:generateContent?key=${CONFIG.API_KEY}`;

    const prompt = `
        你是一个专业的词源学家。请分析英语单词 "${word}"。
        请务必只返回纯 JSON 格式数据，不要包含 Markdown 格式。
        JSON 结构如下：
        {
            "root": "词根及含义 (英文)",
            "prefix": "前缀及含义 (英文)，无则填 None",
            "suffix": "后缀及含义 (英文)，无则填 None",
            "desc": "根据前缀、后缀和词根，总结一下单词的意思 (30字以内)"
        }
    `;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        })
    });

    const result = await response.json();

    // 错误处理增强：如果 API 返回错误，直接抛出，方便在前端看到具体原因
    if (result.error) {
        console.error("Gemini API Error Details:", result.error);
        throw new Error(`API错误: ${result.error.message}`);
    }

    // 安全解析：有时 AI 可能会返回空内容
    if (!result.candidates || !result.candidates[0] || !result.candidates[0].content) {
        throw new Error("API 返回了空结果，请重试");
    }

    let rawText = result.candidates[0].content.parts[0].text;
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    return JSON.parse(rawText);
}