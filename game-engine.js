class GameEngine {
    constructor() {
        this.currentScene = 'scene1';
        this.playerStats = {
            favor: 50,
            power: 50,
            wisdom: 50
        };
        this.history = [];
        this.aiGeneratedCount = 0;
        this.maxAiGenerated = 999; // 设置为一个很大的数字，实现无限AI生成
        this.currentKeyScene = 'scene1';
        this.isLoading = false;
        this.aiContentReady = false;
        this.pendingAiContent = null;
    }

    init() {
        this.setupEventListeners();
        this.renderScene();
        this.updateStats();
    }

    setupEventListeners() {
        const startBtn = document.getElementById('start-btn');
        if (startBtn) {
            startBtn.onclick = () => {
                const startScreen = document.getElementById('start-screen');
                const gameScreen = document.getElementById('game-screen');
                if (startScreen) startScreen.classList.remove('active');
                if (gameScreen) gameScreen.style.display = 'flex';
            };
        }

        const restartBtn = document.getElementById('restart-btn');
        if (restartBtn) {
            restartBtn.onclick = () => this.restart();
        }
    }

    async renderScene() {
        const sceneContainer = document.getElementById('scene-container');
        const sceneData = gameData.keyScenes[this.currentScene];
        
        if (!sceneData) {
            console.error('Scene not found:', this.currentScene);
            return;
        }

        const storyContent = document.getElementById('story-content');
        const choicesContainer = document.getElementById('choices-container');
        const feedbackContainer = document.getElementById('feedback-container');
        const continueBtn = document.getElementById('continue-btn');

        // 优化：如果有图标则显示，排版更紧凑
        storyContent.innerHTML = `
            ${sceneData.icon ? `<div class="scene-icon">${sceneData.icon}</div>` : ''}
            <div class="story-wrapper">${sceneData.text}</div>
        `;

        choicesContainer.innerHTML = '';
        feedbackContainer.style.display = 'none';
        continueBtn.style.display = 'none';

        if (sceneData.choices) {
            sceneData.choices.forEach((choice, index) => {
                const choiceBtn = document.createElement('button');
                choiceBtn.className = 'choice-btn';
                choiceBtn.textContent = choice.text;
                choiceBtn.onclick = () => this.makeChoice(choice, index);
                choicesContainer.appendChild(choiceBtn);
            });
        }

        setTimeout(() => {
            sceneContainer.scrollTop = 0;
        }, 100);
    }

    async makeChoice(choice, choiceIndex) {
        const choicesContainer = document.getElementById('choices-container');
        const sceneData = gameData.keyScenes[this.currentScene];

        choicesContainer.innerHTML = '';
        
        // 记录当前选择到历史中（此时结果 summary 还是空的，等 AI 返回后再补上）
        this.history.push({
            scene: this.currentScene,
            question: sceneData.text,
            choice: choice.text,
            summary: '', // 等待 AI 返回
            stats: { ...this.playerStats }
        });
        
        // 立即向 AI 请求结果和下一题
        this.callCozeAPI();
    }

    async callCozeAPI() {
        const recentHistory = this.history.slice(-5);
        const historyText = recentHistory.map((h, index) => {
            const isLast = index === recentHistory.length - 1;
            let text = `题目：${h.question || '无'}\n选择：${h.choice || '无'}`;
            if (!isLast && h.summary) {
                text += `\n结果：${h.summary}`;
            }
            return text;
        }).join('\n\n');
            
        try {
            this.aiContentReady = false;
            this.pendingAiContent = null;
            this.streamingResultText = '';
            
            // 初始化结果展示界面
            const storyContent = document.getElementById('story-content');
            const choicesContainer = document.getElementById('choices-container');
            const continueBtn = document.getElementById('continue-btn');
            
            storyContent.innerHTML = `
                <div class="story-wrapper result-highlight">
                    <div id="streaming-result">
                        <div class="result-loading-placeholder">
                            <div class="loading-spinner-small"></div>
                            <div class="result-loading-dots">命运推演中</div>
                        </div>
                    </div>
                    <span class="typing-cursor" id="typing-cursor" style="display:none"></span>
                </div>
            `;
            choicesContainer.innerHTML = '';
            continueBtn.style.display = 'none';

            const response = await fetch('https://api.coze.cn/v1/workflow/stream_run', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${gameData.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    workflow_id: gameData.workflowId,
                    parameters: {
                        history: historyText,
                        number: this.aiGeneratedCount + 1
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (line.startsWith('data:')) {
                        const dataStr = line.slice(5).trim();
                        if (dataStr === '[DONE]') continue;
                        if (!dataStr) continue;

                        try {
                            const eventData = JSON.parse(dataStr);
                            
                            // 1. 处理流式输出的选择结果 (Message 节点)
                            // 只要是 Message 节点且不是最终输出的 JSON 结构，就尝试展示
                            const isMessage = eventData.node_type === 'Message';
                            const isNotFinalJSON = eventData.content && !eventData.content.includes('"newstory"');

                            if (isMessage && isNotFinalJSON) {
                                if (eventData.content) {
                                    this.streamingResultText += eventData.content;
                                    const streamingElem = document.getElementById('streaming-result');
                                    const cursor = document.getElementById('typing-cursor');
                                    
                                    if (streamingElem) {
                                        // 只要有内容，就移除 loading 占位符
                                        const loadingPlaceholder = streamingElem.querySelector('.result-loading-placeholder');
                                        if (loadingPlaceholder) {
                                            streamingElem.innerHTML = '';
                                            if (cursor) cursor.style.display = 'inline-block';
                                        }

                                        // 清洗文本并更新展示
                                        const fullCleanedText = this.cleanStreamingText(this.streamingResultText);
                                        const currentTextInDom = streamingElem.textContent;
                                        
                                        // 如果清洗后的文本不以当前 DOM 文本开头，说明之前的清洗逻辑误伤或现在识别出了 JSON 包装
                                        // 此时需要清空重新渲染，以保证不会出现 {"result": " 这种乱码
                                        if (fullCleanedText.length > 0 && !fullCleanedText.startsWith(currentTextInDom)) {
                                            streamingElem.innerHTML = '';
                                            for (const char of fullCleanedText) {
                                                const charSpan = document.createElement('span');
                                                charSpan.className = 'streaming-text-node';
                                                charSpan.textContent = char;
                                                streamingElem.appendChild(charSpan);
                                            }
                                        } else if (fullCleanedText.length > currentTextInDom.length) {
                                            // 正常追加新字符
                                            const newChars = fullCleanedText.substring(currentTextInDom.length);
                                            for (const char of newChars) {
                                                const charSpan = document.createElement('span');
                                                charSpan.className = 'streaming-text-node';
                                                charSpan.textContent = char;
                                                streamingElem.appendChild(charSpan);
                                            }
                                        }
                                    }
                                }
                                
                                // 节点完成时隐藏光标
                                if (eventData.node_is_finish) {
                                    const cursor = document.getElementById('typing-cursor');
                                    if (cursor) cursor.style.display = 'none';
                                    this.showContinueBtnAfterStream();
                                }
                            }

                            // 2. 处理最终输出 (包含 newstory/options 或结局 output)
                            const isWorkflowOutput = eventData.node_type === 'WorkflowOutput';
                            const contentStr = typeof eventData.content === 'string' ? eventData.content : JSON.stringify(eventData.content || {});
                            const hasAIResult = contentStr.includes('newstory') || contentStr.includes('end-');
                            
                            if (isWorkflowOutput || hasAIResult) {
                                let outputContent = eventData.content || '';
                                try {
                                    if (typeof outputContent === 'string') {
                                        // 检查是否是纯字符串形式的结局标识，例如 "end-2"
                                        if (outputContent.trim().startsWith('end-')) {
                                            const aiContent = { output: outputContent.trim() };
                                            this.pendingAiContent = aiContent;
                                            this.aiContentReady = true;
                                            this.finalizeHistoryWithAIContent(aiContent);
                                            if (document.getElementById('continue-btn').style.display === 'block') {
                                                this.updateContinueBtnAction();
                                            }
                                            return;
                                        }

                                        // 尝试解析 JSON 字符串
                                        let jsonStr = outputContent;
                                        if (jsonStr.includes('```json')) {
                                            jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
                                        } else if (jsonStr.includes('```')) {
                                            jsonStr = jsonStr.split('```')[1].split('```')[0].trim();
                                        }
                                        
                                        const aiContent = JSON.parse(jsonStr);
                                        if (aiContent.newstory || (aiContent.output && aiContent.output.startsWith('end-'))) {
                                            this.pendingAiContent = aiContent;
                                            this.aiContentReady = true;
                                            this.finalizeHistoryWithAIContent(aiContent);
                                            
                                            // 如果此时流已经结束，确保按钮逻辑是最新的
                                            if (document.getElementById('continue-btn').style.display === 'block') {
                                                this.updateContinueBtnAction();
                                            }
                                        }
                                    } else if (typeof outputContent === 'object') {
                                        // 直接使用对象
                                        this.pendingAiContent = outputContent;
                                        this.aiContentReady = true;
                                        this.finalizeHistoryWithAIContent(this.pendingAiContent);

                                        // 如果此时流已经结束，确保按钮逻辑是最新的
                                        if (document.getElementById('continue-btn').style.display === 'block') {
                                            this.updateContinueBtnAction();
                                        }
                                    }
                                } catch (e) {
                                    console.error('Error parsing final output:', e, outputContent);
                                }
                            }
                            
                            // 3. 处理错误
                            if (eventData.error_code) {
                                throw new Error(eventData.error_message || 'Stream error');
                            }
                        } catch (e) {
                            // 忽略解析失败的非 JSON 行
                        }
                    }
                }
            }
            
            // 流结束后，如果还没显示按钮（比如 node_is_finish 没触发）
            if (document.getElementById('continue-btn').style.display === 'none') {
                const cursor = document.getElementById('typing-cursor');
                if (cursor) cursor.style.display = 'none';
                
                const streamingElem = document.getElementById('streaming-result');
                // 如果不仅没按钮，连字都没出来，给一个保底显示
                if (streamingElem && (streamingElem.querySelector('.result-loading-placeholder') || streamingElem.textContent.length < 2)) {
                    streamingElem.innerHTML = '<div class="result-highlight">命运之轮转动，新篇章已开启。</div>';
                }
                
                this.showContinueBtnAfterStream();
            }

        } catch (error) {
            console.error('Error in streaming Coze API:', error);
            this.showError();
        }
    }

    finalizeHistoryWithAIContent(aiContent) {
        if (this.history.length > 0) {
            const lastEntry = this.history[this.history.length - 1];
            lastEntry.summary = aiContent.result || aiContent.summary || this.cleanStreamingText(this.streamingResultText);
        }
    }

    cleanStreamingText(text) {
        if (!text) return '';
        let cleaned = text.trim();
        
        // 1. 处理 Markdown 代码块标签
        cleaned = cleaned.replace(/```json\s*/g, '');
        cleaned = cleaned.replace(/```\s*/g, '');
        
        // 2. 处理 JSON 结构
        if (cleaned.startsWith('{')) {
            // 如果只有左大括号，或者还没到 key 的引号，先返回空，避免展示乱码
            if (cleaned.length < 5 && !cleaned.includes('"')) {
                return '';
            }

            try {
                // 尝试解析完整的 JSON
                const parsed = JSON.parse(cleaned + (cleaned.endsWith('}') ? '' : '"}'));
                if (parsed.result || parsed.content || parsed.summary) {
                    return parsed.result || parsed.content || parsed.summary;
                }
            } catch (e) {
                // 如果解析失败，使用更稳健的正则提取内容
                // 寻找第一个冒号后的第一个引号之后的内容
                const match = cleaned.match(/:\s*"([^]*)$/);
                if (match) {
                    let content = match[1];
                    // 处理转义字符和结尾引号/大括号
                    content = content.replace(/\\n/g, '\n')
                                   .replace(/\\"/g, '"')
                                   .replace(/"\s*\}?$/, '');
                    return content;
                }
                // 如果连冒号都没出现，说明还在传输 key，返回空
                return '';
            }
        }
        
        return cleaned;
    }

    showContinueBtnAfterStream() {
        const continueBtn = document.getElementById('continue-btn');
        continueBtn.style.display = 'block';
        continueBtn.textContent = '继续步入';
        this.updateContinueBtnAction();
    }

    updateContinueBtnAction() {
        const continueBtn = document.getElementById('continue-btn');
        continueBtn.onclick = () => {
            if (this.aiContentReady && this.pendingAiContent) {
                this.displayAIGeneratedContent(this.pendingAiContent);
                this.aiGeneratedCount++;
            } else {
                // 如果题目还没准备好，显示加载状态
                this.showLoadingInContinueBtn();
            }
        };
    }

    showLoadingInContinueBtn() {
        const continueBtn = document.getElementById('continue-btn');
        continueBtn.disabled = true;
        continueBtn.innerHTML = '<span class="loading-spinner-small"></span> 正在开启新篇章...';
        
        // 轮询检查准备情况
        const checkReady = setInterval(() => {
            if (this.aiContentReady && this.pendingAiContent) {
                clearInterval(checkReady);
                continueBtn.disabled = false;
                continueBtn.textContent = '继续步入';
                this.displayAIGeneratedContent(this.pendingAiContent);
                this.aiGeneratedCount++;
            }
        }, 500);
    }

    displayAIGeneratedContent(aiContent) {
        if (typeof aiContent !== 'object' || aiContent === null) {
            console.error('aiContent is not a valid object:', aiContent);
            return;
        }
        
        // 判断是否触发结局
        if (aiContent.output && typeof aiContent.output === 'string' && aiContent.output.startsWith('end-')) {
            const endingNumber = aiContent.output.split('-')[1];
            const endingId = `ending${endingNumber}`;
            this.showEnding(endingId);
            return;
        }

        this.currentAIQuestion = aiContent.newstory;
        
        const storyContent = document.getElementById('story-content');
        const choicesContainer = document.getElementById('choices-container');
        const continueBtn = document.getElementById('continue-btn');
        const feedbackContainer = document.getElementById('feedback-container');

        // 展示下一道题的题目和选项
        storyContent.innerHTML = `<div class="story-wrapper">${aiContent.newstory}</div>`;
        feedbackContainer.style.display = 'none';
        continueBtn.style.display = 'none';

        choicesContainer.innerHTML = '';
        const choices = ['choose1', 'choose2', 'choose3', 'choose4'];
        choices.forEach((key, index) => {
            if (aiContent[key] && aiContent[key].trim() !== '') {
                const choiceBtn = document.createElement('button');
                choiceBtn.className = 'choice-btn';
                choiceBtn.style.animationDelay = `${index * 0.1}s`;
                choiceBtn.textContent = aiContent[key];
                choiceBtn.onclick = () => this.makeAIGeneratedChoice(aiContent[key]);
                choicesContainer.appendChild(choiceBtn);
            }
        });

        const sceneContainer = document.getElementById('scene-container');
        sceneContainer.scrollTop = 0;
    }

    makeAIGeneratedChoice(choiceText) {
        const choicesContainer = document.getElementById('choices-container');
        const feedbackContainer = document.getElementById('feedback-container');

        choicesContainer.innerHTML = '';
        feedbackContainer.style.display = 'none';

        // 记录选择到历史中
        this.history.push({
            scene: `AI-${this.aiGeneratedCount}`,
            question: this.currentAIQuestion || '',
            choice: choiceText,
            summary: '', // 等待下一次 AI 返回
            stats: { ...this.playerStats }
        });

        if (this.aiGeneratedCount >= this.maxAiGenerated) {
            this.aiGeneratedCount = 0;
            const sceneData = gameData.keyScenes[this.currentKeyScene];
            this.currentKeyScene = sceneData.nextScene;
            this.currentScene = sceneData.nextScene;
            this.renderScene();
        } else {
            this.callCozeAPI();
        }
    }

    showLoading() {
        // 先尝试移除旧的，防止重复
        this.hideLoading();
        
        const sceneContainer = document.getElementById('scene-container');
        const loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'loading-overlay';
        loadingOverlay.className = 'loading-overlay';
        loadingOverlay.innerHTML = `
            <div class="loading-spinner"></div>
            <div class="loading-text">正在生成剧情...</div>
        `;
        sceneContainer.appendChild(loadingOverlay);
    }

    hideLoading() {
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.remove();
        }
    }

    showError() {
        const storyContent = document.getElementById('story-content');
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.innerHTML = `
            <p>剧情生成失败，请稍后重试。</p>
            <button class="retry-btn" onclick="game.retryAICall()">重试</button>
        `;
        storyContent.appendChild(errorDiv);
    }

    retryAICall() {
        const errorDiv = document.querySelector('.error-message');
        if (errorDiv) {
            errorDiv.remove();
        }
        
        this.callCozeAPI();
    }

    showEnding(endingId) {
        const endingData = gameData.endings[endingId];
        if (!endingData) {
            console.error('Ending not found:', endingId);
            return;
        }

        const gameContainer = document.getElementById('game-container');
        const sceneContainer = document.getElementById('scene-container');
        const storyContent = document.getElementById('story-content');
        const choicesContainer = document.getElementById('choices-container');
        const feedbackContainer = document.getElementById('feedback-container');
        const continueBtn = document.getElementById('continue-btn');

        // 应用结局特定样式
        if (endingData.styleClass) {
            gameContainer.className = endingData.styleClass;
        }

        storyContent.innerHTML = `
            <div class="ending-container">
                <div class="ending-badge">${this.getEndingTypeText(endingData.type)}</div>
                <div class="ending-icon">${endingData.icon}</div>
                <h2 class="ending-title">${endingData.title}</h2>
                <div class="ending-text">${endingData.text}</div>
                <div class="ending-footer">
                    <button class="glow-btn restart-action-btn">再续前缘</button>
                </div>
            </div>
        `;

        choicesContainer.innerHTML = '';
        feedbackContainer.style.display = 'none';
        continueBtn.style.display = 'none';

        const restartBtn = storyContent.querySelector('.restart-action-btn');
        if (restartBtn) {
            restartBtn.onclick = () => this.restart();
        }

        setTimeout(() => {
            sceneContainer.scrollTop = 0;
        }, 100);
    }

    getEndingTypeText(type) {
        const typeMap = {
            'good': '完美结局',
            'bad': '悲剧结局',
            'power': '权势结局',
            'freedom': '自由结局',
            'harmony': '和谐结局',
            'tragic': '宿命结局',
            'legend': '传奇结局',
            'love': '爱情结局'
        };
        return typeMap[type] || '未知结局';
    }

    restart() {
        const gameContainer = document.getElementById('game-container');
        if (gameContainer) gameContainer.className = ''; // 清除结局样式
        
        const startScreen = document.getElementById('start-screen');
        const gameScreen = document.getElementById('game-screen');
        if (startScreen) startScreen.classList.add('active');
        if (gameScreen) gameScreen.style.display = 'none';

        this.currentScene = 'scene1';
        this.playerStats = {
            favor: 50,
            power: 50,
            wisdom: 50
        };
        this.history = [];
        this.aiGeneratedCount = 0;
        this.currentKeyScene = 'scene1';
        this.isLoading = false;
        this.renderScene();
        this.updateStats();
    }

    updateStats() {
        // 2026 风格：不再显示顶部数值条
        // 保持方法存在以兼容可能的内部逻辑
    }
}

let game;
document.addEventListener('DOMContentLoaded', () => {
    game = new GameEngine();
    game.init();
});