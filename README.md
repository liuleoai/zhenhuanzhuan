# 穿越甄嬛传：重生华妃模拟器 👑

这是一个基于 AI 驱动的文字冒险游戏，玩家扮演重生后的华妃，通过不同的选择改变命运。

## 🎮 游戏特色
- **AI 动态生成**：剧情由 Coze 工作流实时驱动，每个选择都将导向不同的分支。
- **沉浸式体验**：丝滑的文字流式加载动画，模拟古籍书写感。
- **多重结局**：内置 8 种以上不同结局，从“权力之巅”到“隐逸田园”。
- **精美视觉**：深度还原故宫美学的 UI 设计，支持移动端适配。

## 🚀 快速开始

1. **克隆项目**
   ```bash
   git clone https://github.com/你的用户名/穿越甄嬛传.git
   ```

2. **配置 API**
   打开 `game-data.js`，配置您的 Coze API 密钥：
   ```javascript
   const gameData = {
       apiKey: "YOUR_COZE_API_KEY",
       workflowId: "YOUR_WORKFLOW_ID",
       // ...
   }
   ```

3. **运行游戏**
   直接双击 `index.html` 或使用本地服务器运行。

## 🌐 在线访问 (GitHub Pages)

您可以直接访问 [https://你的用户名.github.io/穿越甄嬛传/](https://你的用户名.github.io/穿越甄嬛传/) 在线体验。

## 🛠 技术栈
- HTML5 / CSS3 (CSS Variables, Animations)
- Vanilla JavaScript (ES6+, SSE Stream Parsing)
- Coze API (AI Workflow Integration)

## 📄 开源协议
MIT License
