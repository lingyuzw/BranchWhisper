# LoveChoice / Buding 项目规则

这是一个语音 AI 对话系统项目，核心链路：

ASR → LLM → TTS

## 项目结构

```
buding/
├── web/
│   ├── web_server.py      # FastAPI 主服务
│   ├── runtime_brain.py    # 记忆管理、工具管理、对话逻辑
│   ├── static/
│   │   ├── index.html      # 对话页
│   │   ├── services.html   # 服务管理页
│   │   ├── settings.html   # 配置页
│   │   ├── app.js          # 前端主逻辑（三页共享）
│   │   └── styles.css      # 全局样式
│   └── runtime/            # 运行时数据（对话、日志、记忆数据库）
├── tts/
│   └── trained_tts_server.py
├── scripts/
│   └── start_voice_web.sh
└── logs/
```

## 开发原则

1. 优先保持项目简单清晰。
2. 不要随意破坏现有后端 API（/api/config, /api/services, /api/conversations, /api/memory, /api/tools, /api/health）。
3. 不要随意修改 WebSocket 协议（/ws/dialog）。
4. 不要随意修改配置字段名。
5. 前端优化要注意统一风格、响应式布局和可维护性。
6. 新增功能前先说明方案。
7. 大改前必须等待用户确认。
8. 修改后必须说明改了哪些文件、如何测试。
9. 复杂逻辑要有必要注释。
10. 不要引入复杂工程化工具，除非用户明确同意。

## 常用流程

遇到开发需求时，优先使用：

/ai-change-flow
