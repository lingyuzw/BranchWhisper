---
name: skill-router
description: Use this skill before any agent starts work. It decides which skills are needed, checks whether they are installed, and asks Skill Discovery to search/install missing skills.
---

# Skill Router

每个 AI agent 在开始工作前，都必须先执行本 skill 的判断逻辑。

## 1. 判断任务类型

根据当前用户需求、当前阶段、文件范围，判断任务属于哪些类型：

- 前端 UI / 页面布局 / CSS / HTML / JS / 交互体验
- 后端 API / FastAPI / WebSocket / 服务管理
- 音频链路 / ASR / LLM / TTS / VAD
- Bug 修复 / 日志排查 / 报错分析
- 代码重构 / 文件结构整理 / 模块拆分
- 测试 / 启动验证 / 页面验证
- 文档 / README / 修改说明 / 交付总结
- Git / 提交说明 / 变更摘要

## 2. 推荐 skills

根据任务类型推荐 skills：

### 前端任务

推荐：
- frontend-design
- ui-review
- accessibility
- design-system

### 重构任务

推荐：
- refactor
- clean-code
- code-organization

### Bug / 日志任务

推荐：
- debug
- log-analysis

### 测试验证任务

推荐：
- verify
- test
- browser-check

### 文档总结任务

推荐：
- docs
- summarize-changes
- changelog

### Git 任务

推荐：
- git-workflow
- summarize-changes

## 3. 检查本地是否存在

检查：
- .claude/skills/<skill-name>/SKILL.md
- ~/.claude/skills/<skill-name>/SKILL.md

如果 skill 存在，当前 agent 应该调用或遵循它。

如果 skill 不存在，不要假装已经使用。应该输出：

```
缺失 skill：xxx
建议进入 Skill Discovery 阶段搜索并安装。
```

## 4. 输出 Skill 决策

每个 agent 开始正式工作前，必须输出：

```
Skill 决策：
- 当前任务类型：
- 本地可用 skills：
- 缺失 skills：
- 是否需要 Skill Discovery：
- 本阶段实际使用：
```

## 5. 重要规则

- 不要调用不存在的 skill。
- 不要编造 skill 内容。
- 找不到 skill 时，先请求 Skill Discovery 搜索。
- 不要自动安装未知来源 skill。
- 如果任务是前端相关，frontend-design 优先级最高。
- 如果任务是最终文档，summarize-changes / docs 优先级最高。
