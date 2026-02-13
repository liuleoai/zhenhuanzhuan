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
        this.maxAiGenerated = 10;
        this.currentKeyScene = 'scene1';
        this.isLoading = false;
        this.aiContentReady = false;
        this.pendingAiContent = null;
    }

    init() {
        console.log('GameEngine init called');
        console.log('Current scene:', this.currentScene);
        console.log('Game data:', gameData);
        console.log('Key scenes:', gameData.keyScenes);
        this.renderScene();
        this.updateStats();
    }

    async renderScene() {
        console.log('renderScene called, currentScene:', this.currentScene);
        const sceneContainer = document.getElementById('scene-container');
        const sceneData = gameData.keyScenes[this.currentScene];
        
        console.log('Scene data:', sceneData);
        
        if (!sceneData) {
            console.error('Scene not found:', this.currentScene);
            return;
        }

        const chapterTitle = document.getElementById('chapter-title');
        const chapterName = document.getElementById('chapter-name');
        const storyContent = document.getElementById('story-content');
        const choicesContainer = document.getElementById('choices-container');
        const feedbackContainer = document.getElementById('feedback-container');
        const continueBtn = document.getElementById('continue-btn');

        if (chapterTitle && chapterName) {
            chapterTitle.textContent = sceneData.chapter;
            chapterName.textContent = sceneData.chapterName;
        }

        storyContent.innerHTML = `
            <div class="scene-icon">${sceneData.icon}</div>
            <div class="scene-text">${sceneData.text}</div>
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
        const storyContent = document.getElementById('story-content');
        const choicesContainer = document.getElementById('choices-container');
        const continueBtn = document.getElementById('continue-btn');

        storyContent.innerHTML = '';
        choicesContainer.innerHTML = '';
        
        if (choice.summary) {
            const feedbackParagraph = document.createElement('div');
            feedbackParagraph.className = 'story-feedback';
            feedbackParagraph.innerHTML = choice.summary;
            storyContent.appendChild(feedbackParagraph);
        }

        this.history.push({
            scene: this.currentScene,
            choice: choice.text,
            summary: choice.summary,
            stats: { ...this.playerStats }
        });

        const sceneData = gameData.keyScenes[this.currentScene];
        
        if (sceneData.nextScene === 'ending' && sceneData.endings) {
            const endingId = sceneData.endings[choiceIndex];
            this.showEnding(endingId);
            return;
        }

        this.aiContentReady = false;
        this.pendingAiContent = null;

        if (this.aiGeneratedCount >= this.maxAiGenerated) {
            this.aiGeneratedCount = 0;
            this.currentKeyScene = sceneData.nextScene;
            this.currentScene = sceneData.nextScene;
            
            continueBtn.style.display = 'block';
            continueBtn.textContent = '继续';
            continueBtn.onclick = () => {
                continueBtn.style.display = 'none';
                this.renderScene();
            };
        } else {
            continueBtn.style.display = 'block';
            continueBtn.textContent = '继续';
            continueBtn.onclick = () => {
                continueBtn.style.display = 'none';
                
                if (this.aiContentReady) {
                    this.displayAIGeneratedContent(this.pendingAiContent);
                    this.aiGeneratedCount++;
                } else {
                    this.showLoading();
                }
            };
            
            this.callCozeAPI();
        }
    }

    async callCozeAPI() {
        const historyText = this.history.map(h => `${h.scene}-选项：${h.choice}`).join('\n');
        const nextSceneData = gameData.keyScenes[gameData.keyScenes[this.currentKeyScene].nextScene];
        const nextstory = nextSceneData ? nextSceneData.text : '';

        try {
            const response = await fetch('https://api.coze.cn/v1/workflow/run', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${gameData.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    workflow_id: gameData.workflowId,
                    parameters: {
                        history: historyText,
                        nextstory: nextstory,
                        number: this.aiGeneratedCount + 1
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }

            const data = await response.json();
            this.hideLoading();
            this.isLoading = false;

            let aiContent = null;
            
            try {
                if (data.code === 0 && data.data) {
                    let dataObj;
                    try {
                        dataObj = JSON.parse(data.data);
                    } catch (e) {
                        dataObj = { output: data.data };
                    }
                    
                    if (dataObj.output) {
                        let outputContent = dataObj.output;
                        if (outputContent.includes('```json')) {
                            outputContent = outputContent.replace(/```json/g, '').replace(/```/g, '');
                        }
                        
                        try {
                            aiContent = JSON.parse(outputContent);
                        } catch (e) {
                            aiContent = { newstory: outputContent };
                        }
                    } else if (dataObj.summary || dataObj.newstory || dataObj.choose1) {
                        aiContent = dataObj;
                    } else {
                        aiContent = { newstory: JSON.stringify(dataObj) };
                    }
                }
            } catch (error) {
                console.error('Error processing response structure:', error);
            }

            if (aiContent && typeof aiContent === 'object' && Object.keys(aiContent).length > 0) {
                this.pendingAiContent = aiContent;
                this.aiContentReady = true;
                
                const continueBtn = document.getElementById('continue-btn');
                if (continueBtn.style.display === 'none') {
                    this.displayAIGeneratedContent(aiContent);
                    this.aiGeneratedCount++;
                }
            } else {
                this.pendingAiContent = null;
                this.aiContentReady = false;
            }

        } catch (error) {
            console.error('Error calling Coze API:', error);
            this.pendingAiContent = null;
            this.aiContentReady = false;
            this.showError();
        }
    }

    showGenericMessage() {
        const storyContent = document.getElementById('story-content');
        const choicesContainer = document.getElementById('choices-container');

        choicesContainer.innerHTML = '';

        const genericMessage = document.createElement('div');
        genericMessage.className = 'story-feedback';
        genericMessage.innerHTML = '剧情正在发展中...';
        storyContent.appendChild(genericMessage);

        const continueBtn = document.getElementById('continue-btn');
        continueBtn.style.display = 'block';
        continueBtn.textContent = '继续';
        continueBtn.onclick = () => {
            continueBtn.style.display = 'none';
            
            if (this.aiContentReady) {
                this.displayAIGeneratedContent(this.pendingAiContent);
                this.aiGeneratedCount++;
            } else {
                this.showLoading();
            }
        };
    }

    displayAIGeneratedContent(aiContent) {
        if (typeof aiContent !== 'object' || aiContent === null) {
            console.error('aiContent is not a valid object:', aiContent);
            return;
        }
        
        const storyContent = document.getElementById('story-content');
        const choicesContainer = document.getElementById('choices-container');
        const continueBtn = document.getElementById('continue-btn');

        storyContent.innerHTML = '';

        if (aiContent.newstory) {
            const newStoryParagraph = document.createElement('div');
            newStoryParagraph.className = 'ai-generated-story';
            newStoryParagraph.innerHTML = aiContent.newstory;
            storyContent.appendChild(newStoryParagraph);
        }

        choicesContainer.innerHTML = '';

        const choices = ['choose1', 'choose2', 'choose3', 'choose4'];
        choices.forEach((key, index) => {
            if (aiContent[key] && aiContent[key].trim() !== '') {
                const choiceBtn = document.createElement('button');
                choiceBtn.className = 'choice-btn';
                choiceBtn.textContent = aiContent[key];
                choiceBtn.onclick = () => this.makeAIGeneratedChoice(aiContent[key], aiContent[`result${index + 1}`] || aiContent.summary);
                choicesContainer.appendChild(choiceBtn);
            }
        });

        setTimeout(() => {
            const sceneContainer = document.getElementById('scene-container');
            sceneContainer.scrollTop = sceneContainer.scrollHeight;
        }, 100);

        continueBtn.style.display = 'none';
    }

    makeAIGeneratedChoice(choiceText, resultText) {
        const storyContent = document.getElementById('story-content');
        const choicesContainer = document.getElementById('choices-container');
        const continueBtn = document.getElementById('continue-btn');

        storyContent.innerHTML = '';
        choicesContainer.innerHTML = '';

        if (resultText) {
            const feedbackParagraph = document.createElement('div');
            feedbackParagraph.className = 'story-feedback';
            feedbackParagraph.innerHTML = resultText;
            storyContent.appendChild(feedbackParagraph);
        }

        this.history.push({
            scene: `AI-${this.aiGeneratedCount}`,
            choice: choiceText,
            summary: resultText,
            stats: { ...this.playerStats }
        });

        continueBtn.style.display = 'block';
        continueBtn.textContent = '继续';
        continueBtn.onclick = () => {
            continueBtn.style.display = 'none';
            
            if (this.aiGeneratedCount >= this.maxAiGenerated) {
                this.aiGeneratedCount = 0;
                const sceneData = gameData.keyScenes[this.currentKeyScene];
                this.currentKeyScene = sceneData.nextScene;
                this.currentScene = sceneData.nextScene;
                this.renderScene();
            } else {
                this.callCozeAPI();
            }
        };
    }

    showLoading() {
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
        
        const lastHistory = this.history[this.history.length - 1];
        if (lastHistory) {
            this.callCozeAPI({ text: lastHistory.choice }, 0);
        }
    }

    showEnding(endingId) {
        const endingData = gameData.endings[endingId];
        if (!endingData) {
            console.error('Ending not found:', endingId);
            return;
        }

        const sceneContainer = document.getElementById('scene-container');
        const chapterTitle = document.getElementById('chapter-title');
        const chapterName = document.getElementById('chapter-name');
        const storyContent = document.getElementById('story-content');
        const choicesContainer = document.getElementById('choices-container');
        const feedbackContainer = document.getElementById('feedback-container');
        const continueBtn = document.getElementById('continue-btn');

        if (chapterTitle && chapterName) {
            chapterTitle.textContent = '结局';
            chapterName.textContent = endingData.title;
        }

        storyContent.innerHTML = `
            <div class="ending-icon">${endingData.icon}</div>
            <div class="ending-text">${endingData.text}</div>
            <div class="ending-type">${this.getEndingTypeText(endingData.type)}</div>
        `;

        choicesContainer.innerHTML = '';
        feedbackContainer.style.display = 'none';
        continueBtn.style.display = 'none';

        const restartBtn = document.createElement('button');
        restartBtn.className = 'restart-btn';
        restartBtn.textContent = '重新开始';
        restartBtn.onclick = () => this.restart();
        storyContent.appendChild(restartBtn);

        setTimeout(() => {
            sceneContainer.scrollTop = 0;
        }, 100);
    }

    getEndingTypeText(type) {
        const typeMap = {
            'good': '完美结局',
            'bad': '悲剧结局',
            'power': '权势结局',
            'harmony': '和谐结局',
            'transcend': '超脱结局',
            'tragic': '宿命结局',
            'legend': '传奇结局',
            'love': '爱情结局'
        };
        return typeMap[type] || '未知结局';
    }

    restart() {
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
        const favorBar = document.getElementById('favor-bar');
        const powerBar = document.getElementById('power-bar');
        const wisdomBar = document.getElementById('wisdom-bar');
        const favorValue = document.getElementById('favor-value');
        const powerValue = document.getElementById('power-value');
        const wisdomValue = document.getElementById('wisdom-value');

        if (favorBar) favorBar.style.width = `${this.playerStats.favor}%`;
        if (powerBar) powerBar.style.width = `${this.playerStats.power}%`;
        if (wisdomBar) wisdomBar.style.width = `${this.playerStats.wisdom}%`;
        
        if (favorValue) favorValue.textContent = this.playerStats.favor;
        if (powerValue) powerValue.textContent = this.playerStats.power;
        if (wisdomValue) wisdomValue.textContent = this.playerStats.wisdom;
    }
}

let game;
document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('start-btn');
    const restartBtn = document.getElementById('restart-btn');
    
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            document.getElementById('start-screen').style.display = 'none';
            document.getElementById('game-screen').style.display = 'block';
            game = new GameEngine();
            game.init();
        });
    }
    
    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            if (game) {
                game.restart();
            }
        });
    }
});
