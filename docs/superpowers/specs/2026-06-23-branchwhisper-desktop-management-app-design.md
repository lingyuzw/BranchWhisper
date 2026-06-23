# BranchWhisper Desktop Management App Design

## Decision

BranchWhisper desktop will use a management-app layout similar in information architecture to AstrBot: a left navigation rail, a top workspace switch, and distinct pages for onboarding, API configuration, bot management, personas, conversation data, assets, tasks, statistics, logs, and settings.

The app must still feel like BranchWhisper. It must not use a split visual treatment where the left side is black and the right side is white. Navigation, content, dialogs, and empty states must share the same BranchWhisper theme tokens used by the web console.

## Visual Direction

The chosen layout is the simpler management-app direction:

```text
┌───────────────────────────────────────────────────────────────┐
│ Top bar: Bot workspace / Chat switch | language | theme | settings │
├──────────────────┬────────────────────────────────────────────┤
│ Page navigation  │ Current page                               │
│ Guide            │                                            │
│ API              │                                            │
│ Bot              │                                            │
│ Config           │                                            │
│ Conversations    │                                            │
│ Assets           │                                            │
│ Rules            │                                            │
│ Tasks            │                                            │
│ Statistics       │                                            │
│ Logs             │                                            │
│ Diagnostics      │                                            │
└──────────────────┴────────────────────────────────────────────┘
```

Important visual rule:

- The left navigation must not be pure black in light mode.
- The content area must not be plain white while the navigation is dark.
- Light theme uses the existing web tokens: `#f6f4ef` background, `#eeebe3` elevated background, `#fffdf8` surface, `#9a6b34` primary.
- Dark theme uses the existing web tokens: `#171912` background, `#202118` elevated background, `#28281f` surface, `#d6b56d` primary.
- Navigation should be a slightly elevated surface of the current theme, not a separate color world.
- Active navigation items use primary soft backgrounds and a small accent bar.
- Cards use the same radius and border language as the web console: 5-8px radius, subtle borders, restrained shadows.

## Product Principle

The desktop app must be usable by a beginner who has no local AI environment.

The first usable path is API mode. A user should be able to install or open the app, add an API provider, create a bot, test a message, and view logs without installing WSL, conda, CUDA, Python, Node, ffmpeg, llama.cpp, CosyVoice, Qwen ASR, or OpenClaw.

Local mode remains available, but it is guided as an advanced setup path with explanations, checks, repair actions, and fallback to API mode.

## Top Bar

The top bar contains:

- Workspace switch: `Bot 工作台` and `Chat`.
- Language switch: Chinese and English at minimum.
- Theme switch: light and dark, using the existing BranchWhisper web colors.
- System settings button: opens desktop-level settings, app data path, update actions, backup/restore, diagnostics export, and runtime options.
- Global status: current mode, backend state, API state, WeChat bridge state.

The `Chat` switch opens a separate ChatGPT-like conversation page. It must not be just another card inside the bot dashboard.

## Page Navigation

The left page navigation contains:

```text
引导
API
Bot
配置文件
对话数据
素材库
自定义规则
未来任务
数据统计
平台日志
诊断中心
系统设置
```

The label `API` is used instead of `模型提供商` so the product is easier for beginners to understand and more distinct from AstrBot wording.

Each page must have a distinct purpose and layout. The app must not feel like every page is the same card list with different text.

## Beginner Guide Page

The first page is an onboarding guide, not a marketing landing page.

It has two tutorial tracks:

```text
API 轻量部署
本地完整部署
```

The API track is first and recommended. It explains every step in beginner language:

1. What an API is in this app.
2. How to choose a preset such as Qwen, DeepSeek, OpenAI-compatible, or custom.
3. Where to paste the API key.
4. How to test whether the model can reply.
5. How to create a WeChat bot.
6. How to set bot persona and API model persona separately.
7. How to send a test message.
8. Where conversation data and logs are stored.

The local track explains:

1. Why local mode needs more environment setup.
2. What WSL, conda, CUDA, Python, Node, ffmpeg, llama.cpp, CosyVoice, Qwen ASR, and OpenClaw do.
3. What is optional and what is required.
4. How to run each automated check.
5. How to copy repair commands.
6. How to fall back to API mode if local setup is not ready.

Every guide step has:

- a plain-language explanation
- required input
- expected success result
- common failure reason
- repair suggestion
- primary action button
- secondary "skip for now" or "use API instead" action when safe

## API Page

The API page manages API providers and model endpoints.

It supports:

- provider list
- add provider modal
- built-in presets: Qwen, DeepSeek, OpenAI-compatible, custom
- fields for base URL, API key, model, temperature, max tokens, timeout, and test prompt
- provider health test
- save and activate provider
- per-provider usage summary

The page should use the word `API` prominently and keep provider language secondary.

## Bot Page

The Bot page creates and manages WeChat bots.

It supports:

- create bot
- bot name
- WeChat bridge configuration
- active API provider
- bot persona
- enabled rules
- enabled asset libraries
- enabled reminders
- start, stop, restart, test message
- connection state and last activity

The app must distinguish:

- API model persona: how the model behaves generally.
- WeChat bot persona: how this bot talks in a specific WeChat context.

## Config Page

The Config page exposes editable configuration files through a safe form UI.

It must separate:

- API model configuration
- bot configuration
- persona configuration
- memory behavior
- greeting behavior
- storage paths
- advanced raw config view

Raw config editing is an advanced area and should include backup before save.

## Conversation Data Page

This page only manages bot conversation data.

It supports:

- list conversations by bot
- filter by date, keyword, platform, and participant
- open conversation preview
- delete selected conversations
- export selected conversations
- show storage path

Conversation files are stored under a dedicated runtime data folder, not mixed with application code.

## Asset Library Page

The asset library is a first-class page.

It supports:

- images
- stickers
- audio
- video
- files
- links
- reply templates

Assets can be:

- global
- bound to a specific bot
- bound to a persona
- referenced by custom rules
- referenced by future tasks

Each asset has metadata:

- name
- type
- tags
- owner scope
- file path or URL
- created time
- last used time
- usage count

The asset library must support import, preview, delete, and usage statistics.

## Custom Rules Page

This page manages user-defined bot behavior rules.

It supports:

- rule name
- trigger condition
- target bot
- enabled/disabled state
- priority
- response action
- linked assets
- test rule

Rules must not silently fabricate facts. When a rule depends on missing data, the app should show "缺少数据" and ask the user to configure it.

## Future Tasks Page

This page manages reminders, scheduled greetings, and future tasks.

It supports:

- task title
- target bot
- schedule
- repeat rule
- message template
- linked asset
- enabled/disabled state
- next run time
- last run result

If there are no reminders, the assistant must not say it will check reminders.

## Statistics Page

This page shows:

- bot count
- active bot count
- message count
- model call count
- token usage
- API provider usage
- asset usage
- task execution count
- error count

Charts should be useful but restrained. The page should prioritize readable cards and tables over decorative graphics.

## Platform Logs Page

This page shows logs separated by source:

- app logs
- backend logs
- API call logs
- bot logs
- WeChat bridge logs
- task logs
- diagnostic logs

It supports:

- service filter
- severity filter
- text search
- pause auto-scroll
- copy selected log
- export logs

Errors should show a short summary first and detailed stack traces only in an expandable area.

## Diagnostics Page

Diagnostics remains a full page, but in the desktop app it must match the same theme and layout system.

It checks:

- model paths
- ports
- Python
- Node
- ffmpeg
- CUDA
- llama.cpp
- CosyVoice
- Qwen ASR
- OpenClaw
- API provider health
- backend health
- WeChat bridge health

Every failed item shows:

- status
- failure reason
- likely cause
- repair suggestion
- copy command action when applicable
- retry action

Names like Qwen ASR, CosyVoice, and llama.cpp appear as current service types or configured components, not as hard-coded product assumptions. If the user later changes models, the diagnostics page should show configured component names and paths from config.

## Chat Page

The `Chat` workspace is a separate page that feels closer to ChatGPT:

- conversation list on the left
- main message thread in the center
- composer at the bottom
- model selector
- create conversation
- delete conversation
- system/persona selector
- API provider selector
- token usage for current conversation

This page is for direct AI conversation. Bot management pages are for WeChat bot operation.

## Data Storage

Desktop runtime data is stored outside the install directory.

Preferred Windows path:

```text
%APPDATA%\BranchWhisper\runtime
```

Data categories:

```text
runtime/
  config/
  bots/
  conversations/
  assets/
  rules/
  tasks/
  logs/
  diagnostics/
  backups/
```

The app must expose "open folder" actions for these locations.

## Execution Stages

### Stage 1: Desktop Shell And Theme Unification

Goal: replace the current simple Studio shell with the selected management-app structure.

Build:

- unified theme tokens copied from web console
- left page navigation
- top Bot/Chat workspace switch
- language switch
- theme switch
- system settings entry
- welcome guide page skeleton

Done when:

- `BranchWhisper.exe` opens to the new desktop app
- left navigation and content share one visual theme
- no black-left-white-right split exists
- theme switch changes the whole shell coherently

### Stage 2: Detailed Beginner Guide

Goal: make the app usable by a beginner.

Build:

- API tutorial track
- local tutorial track
- step cards with explanations, checks, and actions
- "use API first" recommendation
- progress state

Done when:

- a user can understand what to click without reading external docs
- API path can be followed without local environment
- local path clearly explains each dependency

### Stage 3: API Configuration

Goal: make API mode actually configurable in the desktop app.

Build:

- API page
- add provider modal
- Qwen, DeepSeek, OpenAI-compatible, custom presets
- provider test
- save/activate provider

Done when:

- user can create and test an API provider inside the app
- provider config is persisted through backend-compatible config

### Stage 4: Bot And Persona Management

Goal: create WeChat bots and keep API persona separate from bot persona.

Build:

- Bot page
- create bot flow
- bot persona form
- API model persona form
- WeChat bridge status and test actions

Done when:

- a bot can be created and connected to an API provider
- bot persona and API model persona are visibly separate

### Stage 5: Data, Assets, Rules, And Tasks

Goal: manage operational data without touching files manually.

Build:

- conversation data page
- asset library page
- custom rules page
- future tasks page
- delete/export/open-folder actions

Done when:

- bot conversation data can be listed and deleted
- assets can be imported and linked to bots or rules
- reminders do not produce false "I will check reminders" language when none exist

### Stage 6: Statistics, Logs, Diagnostics, And Chat

Goal: finish the daily-use app surface.

Build:

- statistics page
- platform logs page
- diagnostics page
- ChatGPT-like chat workspace

Done when:

- user can see health, usage, logs, and direct chat from the desktop app
- diagnostics give actionable repair suggestions
- Chat is separate from Bot management

## Verification

Each stage must be verified with:

- automated static tests for required labels, pages, and theme tokens
- screenshot or browser verification for layout
- desktop build verification
- `BranchWhisper.exe` copied to the Windows Desktop
- git commit and push after each small finished point

Visual acceptance checks:

- no text overflow on normal desktop width
- no cards nested inside cards
- no pure black sidebar beside pure white content
- top bar controls remain aligned
- every page has a distinct layout and purpose
- beginner guide can be followed without external knowledge

