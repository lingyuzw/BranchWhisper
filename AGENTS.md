# LoveChoice / Buding 项目规则

语音 AI 对话系统：ASR → LLM → TTS

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
│   │   ├── app.js          # 前端主逻辑
│   │   └── styles.css      # 全局样式
│   └── runtime/            # 运行时数据
├── tts/
│   └── trained_tts_server.py
├── scripts/
│   └── start_voice_web.sh
└── logs/
```

## 开发原则

1. 保持项目简单清晰。
2. 不要破坏现有后端 API（/api/config, /api/services, /api/conversations, /api/memory, /api/tools, /api/health）。
3. 不要修改 WebSocket 协议（/ws/dialog）。
4. 不要随意修改配置字段名。
5. 前端注意统一风格、响应式布局。
6. 新增功能前先说明方案。
7. 大改前等待用户确认。
8. 修改后说明改了哪些文件、如何测试。
9. 复杂逻辑加注释。
