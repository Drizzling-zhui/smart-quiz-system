# 智能题库系统 (Smart Quiz System)

纯前端单页应用，用于管理和练习题库。支持学科管理、浏览、答题训练、文本/JSON导入导出。

## 运行方式

浏览器直接打开 `index.html` 即可，或使用任意静态服务器（如 VS Code Live Server）。

所有数据存储在浏览器的 `localStorage` 中，无需后端。

## 技术栈

- 纯 HTML + CSS + JavaScript，零框架依赖
- 全局作用域加载（`<script>` 标签顺序加载）
- `localStorage` 数据持久化
- 支持 OpenAI 兼容 API 的 AI 智能解析

## 文件结构

```
quiz-app/
├── index.html              # 入口页（仅 HTML 骨架）
├── css/
│   └── style.css           # 全部样式
├── js/
│   ├── utils.js            # escHtml, toast — 零依赖
│   ├── data.js             # 数据模型、loadData/saveData、数据迁移
│   ├── settings.js         # API 配置、公告横幅、设置弹窗
│   ├── modal.js            # 学科/题目弹窗 CRUD
│   ├── sidebar.js          # 侧边栏、学科管理、confirmAction
│   ├── browse.js           # 题库浏览、筛选、题目增删改、重置统计
│   ├── parser.js           # 正则解析、AI解析、finalizeQ
│   ├── import.js           # JSON 修复（8层容错）、导入导出
│   ├── quiz.js             # 答题引擎全套
│   └── app.js              # 初始化、switchTab、全局事件
├── data/
│   └── subjects/           # 题库数据目录（JSON 文件按学科分文件夹存放）
│       ├── .gitkeep
│       └── 计算机网络/
│           └── questions.json  # 示例：[{ "type":"choice", "question":"...", ... }]
├── .gitignore
└── CLAUDE.md               # 本文件
```

### JS 加载顺序

```
utils.js → data.js → settings.js → modal.js → sidebar.js → browse.js → parser.js → import.js → quiz.js → app.js
```

顺序由依赖关系决定。各模块共享全局作用域，函数和变量挂载在 `window` 上。

## 数据模型

```json
{
  "version": "1.0",
  "subjects": [{
    "name": "学科名",
    "description": "",
    "questions": [{
      "id": 1234567890,
      "type": "choice|fill|short",
      "question": "题干",
      "options": [{"label": "A", "text": "选项内容"}],
      "answer": "A",
      "score": 1.3,
      "explanation": "题目解析",
      "stats": {"attempts": 5, "correct": 3, "wrong": 2}
    }]
  }]
}
```

## 关键函数索引

| 函数 | 文件 | 说明 |
|------|------|------|
| `loadData()` / `saveData()` | `js/data.js` | 数据持久化 |
| `renderSidebar()` | `js/sidebar.js` | 侧边栏渲染 |
| `renderBrowse()` | `js/browse.js` | 题库浏览渲染 |
| `renderQuizQuestion()` | `js/quiz.js` | 答题核心渲染 |
| `startQuiz()` / `finishQuiz()` | `js/quiz.js` | 开始/结束答题 |
| `submitQuizAnswer()` | `js/quiz.js` | 提交答案并判分 |
| `parseQuizText()` | `js/parser.js` | 正则文本解析 |
| `aiParseText()` | `js/parser.js` | AI 智能解析 |
| `fixJSON()` | `js/import.js` | JSON 自动修复 |
| `showModal()` / `hideModal()` | `js/modal.js` | 弹窗管理 |
| `toast()` | `js/utils.js` | Toast 通知 |

## GitHub 仓库

- **仓库地址**：https://github.com/Drizzling-zhui/smart-quiz-system
- **默认分支**：`master`

### Git 推送配置

当前网络环境需要代理才能访问 GitHub：

```bash
git config --global http.proxy http://127.0.0.1:7890
git config --global https.proxy http://127.0.0.1:7890
```

### 自动推送

Stop hook 配置在 `.claude/settings.local.json` 中，Claude Code 对话结束时自动执行：

```bash
cd "C:/Users/Administrator/Desktop/quiz-app" && \
  if [ -n "$(git status --porcelain)" ]; then \
    git add -A && \
    git commit -m "auto: $(date '+%Y%m%d-%H%M')" && \
    git push; \
  fi
```

## 开发注意事项

1. **新功能添加流程**：确定功能属于哪个模块 → 编辑对应的 JS 文件 → 浏览器测试 → 对话结束自动推送
2. **跨文件调用**：所有函数都是全局的，直接调用即可，无需 import
3. **数据迁移**：在 `loadData()` 中添加迁移逻辑，需要向后兼容
4. **题目类型**：`choice`（单选）、`fill`（填空）、`short`（简答）
5. **CSS 变量**：色系定义在 `css/style.css` 的 `:root` 中，主色调 `#4f6ef7`

## 运行环境

- 开发人：Drizzling-zhui
- 本地路径：`C:\Users\Administrator\Desktop\quiz-app\`
- 操作系统：Windows 11
- 代理地址：`http://127.0.0.1:7890`
