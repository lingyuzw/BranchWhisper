# 枝语 BranchWhisper

枝语 BranchWhisper 是一个本地优先的语音 AI 对话控制台，用来管理 ASR、LLM、TTS 服务，并提供 Web 对话、记忆、联网工具、主动消息、素材表情包和微信个人号接入。

核心链路：

```text
浏览器麦克风 -> WebSocket -> VAD -> ASR -> LLM -> TTS -> 浏览器播放
微信消息 -> OpenClaw 桥接 -> BranchWhisper 对话内核 -> 文字/语音回复
```

## 主要功能

- Web 语音/文字对话：支持麦克风、文字输入、图片上传、TTS 播放、打断和会话管理。
- 服务编排：在服务页启动、停止、查看 ASR/LLM/TTS 状态、日志和资源占用。
- 本地模型优先：默认使用本地 OpenAI-compatible LLM 接口，也可以切换 API 模式做测试。
- 记忆系统：按模型模式隔离记忆，支持记忆列表、筛选、搜索、手动增删改和衰减。
- 联网工具：时间、天气、搜索、网页读取、新闻、财经、地图等工具统一配置。
- 微信个人号接入：基于 OpenClaw 和 `@tencent-weixin/openclaw-weixin`，支持扫码登录、桥接、文字回复和语音回复。
- 主动性系统：支持日常问候、主动追问、定时提醒和主动事件。
- 素材与对话：支持头像、表情包素材库、图片理解和上下文压缩。

## 快速启动

```bash
python web/web_server.py --host 127.0.0.1 --port 7860
```

打开：

```text
http://127.0.0.1:7860
```

常用页面：

- 对话页：`http://127.0.0.1:7860`
- 服务页：`http://127.0.0.1:7860#services`
- 接入页：`http://127.0.0.1:7860#integrations`
- 记忆页：`http://127.0.0.1:7860#memory`
- 配置页：`http://127.0.0.1:7860#settings`

## 服务配置

在配置页可以修改 ASR、LLM、TTS 的启动命令、工作目录、健康检查地址、启动等待时间和模型参数。点击“应用配置”后会保存到：

```text
web/runtime/service_profiles.json
```

也可以启动时指定其它服务配置文件：

```bash
python web/web_server.py --host 0.0.0.0 --port 7860 --service-config /path/to/service_profiles.json
```

示例配置：

```text
web/service_profiles.example.json
```

## 微信个人号接入

微信个人号接入依赖 Node.js、OpenClaw、微信适配器、ffmpeg 和 `silk-wasm`。

安装示例：

```bash
npm install -g openclaw
npm install -g @tencent-weixin/openclaw-weixin-cli
npm install -g silk-wasm
openclaw --version
```

`silk-wasm` 用于把枝语生成的 TTS 音频转成微信客户端可播放的 SILK 语音格式。AutoDL、容器或自定义 Node 目录里，需要确保启动枝语的同一个 shell 可以找到这些命令：

```bash
export PATH=/root/autodl-tmp/tools/node/bin:$PATH
node -v
npm -v
npx --version
openclaw --version
npm list -g silk-wasm --depth=0
```

进入接入页：

```text
http://127.0.0.1:7860#integrations
```

基本流程：

1. 添加微信个人号实例。
2. 检查 `node/npm/openclaw/ffmpeg/silk-wasm` 环境。
3. 扫码登录。
4. 启动桥接。
5. 使用语音自检确认微信端可以播放语音。

## 项目结构

```text
buding/
  web/
    web_server.py            # 启动入口
    app/                     # FastAPI 应用装配、生命周期
    api/                     # HTTP API routers
    core/                    # 配置、通用工具、provider 配置
    data/                    # 当前数据 store
    repositories/            # 数据访问适配层
    domain/                  # 路径、常量、领域对象
    dialog/                  # WebSocket 对话会话
    service_runtime/         # ASR/LLM/TTS 服务管理和音频管线
    integration_runtime/     # OpenClaw/微信桥接运行时
    engagement/              # 主动性和提醒
    media/                   # 头像、图片、表情包素材
    tools/                   # 记忆和联网工具
    static/                  # 前端 SPA
      js/
        api/                 # 前端 API 客户端
        pages/               # 页面控制器
        stores/              # 前端状态
        utils/               # DOM/UI 工具
      css/                   # 页面样式
    runtime/                 # 运行时数据，不提交 Git
  tts/                       # TTS 服务脚本
  scripts/                   # 启动脚本
  configs/                   # 本地服务配置示例或私有配置
```

## 运行时数据

运行时数据默认在 `web/runtime/`，不应提交到 Git：

- `settings.json`：主配置
- `service_profiles.json`：服务启动配置
- `integrations.json`：接入实例配置
- `tool_providers.json`：第三方工具 provider 配置
- `bot_profiles.json`：Bot 人格配置
- `memory.sqlite3`：记忆数据库
- `proactive.sqlite3`、`reminders.sqlite3`：主动消息和提醒
- `conversations/`：会话记录
- `logs/`：服务日志
- `uploads/`：头像、图片、表情包等上传素材
- `integration_media/`：微信语音等临时媒体

仓库根目录的 `logs/`、`docs/` 也默认不进入 Git。

## 开发说明

- 后端 API 尽量放在 `web/api/`，业务逻辑放到 `web/services/` 或对应领域模块。
- 前端页面逻辑放在 `web/static/js/pages/`，通用组件和工具放在 `components/`、`utils/`。
- 不要把运行时配置、日志、会话、上传文件提交到 Git。
- 大改结构后至少运行：

```bash
python -m py_compile web/web_server.py web/app/server.py
node --check web/static/js/main.js
node --check web/integration_runtime/weixin_voice_sender.mjs
```

更完整的检查可以遍历所有 Python 和前端 JS 文件执行语法检查。

## 命名说明

项目正式名称为“枝语 BranchWhisper”。历史上部分文件、注释或本地 key 可能仍包含 LoveChoice/Buding 兼容命名，后续会逐步清理，但运行时兼容字段不应贸然删除。
