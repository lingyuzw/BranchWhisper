---
name: ai-change-flow
description: Use this skill when the user provides a development requirement and wants a structured AI workflow: requirement confirmation, improvement suggestions, implementation, review, and final documentation.
---

# AI Change Flow（Agent 编排版）

你是主控 AI。你的工作不是自己执行所有阶段，而是**依次启动 6 个 stage agent**，每个 agent 是独立的子任务，有自己独立的上下文。

## 为什么用 Agent

以前把规则写在 prompt 里，你容易在 thinking 块里跳阶段。现在每个阶段是一个独立 Agent 调用，**物理上不可能跳过**——Agent A 的上下文里根本没有 Agent B 该做的事。

## 工作流

```
用户需求
→ 你输出 "## AI Change Flow 启动" + 流程清单
→ Agent: stage-0-skill-discovery  → 返回结果 → 展示给用户
→ 等用户确认
→ Agent: stage-1-requirement       → 返回结果 → 展示给用户
→ 等用户确认
→ Agent: stage-2-solution          → 返回结果 → 展示给用户
→ 等用户确认
→ Agent: stage-3-implementation    → 返回结果 → 展示给用户
→ Agent: stage-4-review            → 返回结果 → 展示给用户
→ Agent: stage-5-document          → 返回结果 → 展示给用户 → 流程结束
```

## 每轮你的工作

**每轮只做一件事：启动一个 stage agent，拿到它的结果，展示给用户，问用户是否可以继续（或自动进入下一阶段）。**

## 启动流程

用户触发后，**第一轮你的回复只有这段话**：

```
## AI Change Flow 启动

严格按以下流程，每阶段用独立 Agent 执行：
0. Skill Discovery → 1. 需求确认 → 2. 方案设计 → 3. 执行修改 → 4. 代码审查 → 5. 最终文档

现在启动阶段 0。
```

然后立即使用 Agent 工具启动 stage-0-skill-discovery。

---

## 阶段 0：Skill Discovery

```javascript
使用 Agent 工具，subagent_type: "general-purpose"
参数：
  description: "Stage 0: Skill Discovery"
  prompt: "检查当前任务需要哪些 skills。任务描述：{用户需求原文}。
    1. 扫描 .Codex/skills/ 目录
    2. 判断任务类型和需要的 skills
    3. 如果有缺失的 skills，搜索可信来源
    4. 输出阶段 0 的标准化报告（按 stage-0-skill-discovery agent 的格式）
    5. 最后问用户是否确认进入阶段 1"
```

展示 Agent 返回结果给用户。等用户确认后进入阶段 1。

---

## 阶段 1：需求确认

```javascript
使用 Agent 工具，subagent_type: "Codex"
参数：
  description: "Stage 1: Requirement Analysis"
  prompt: "用户需求：{用户需求原文}

你的任务：
1. 复述需求
2. 找模糊点
3. 列出必须实现和可选优化
4. 分析影响范围
5. 如果需要了解现状，读取相关代码文件
6. 按 stage-1-requirement agent 格式输出阶段 1 报告
7. 最后问用户是否确认进入阶段 2

重要：只读代码，不改代码。"
```

展示 Agent 返回结果给用户。等用户确认后进入阶段 2。

---

## 阶段 2：方案设计

```javascript
使用 Agent 工具，subagent_type: "Codex"
参数：
  description: "Stage 2: Solution Design"
  prompt: "基于已确认的需求：{需求确认摘要}

你的任务：
1. 给出总体实现思路
2. 列出文件级修改计划（包含风险等级）
3. 区分本次做和以后做
4. 明确列出不能修改的内容
5. 给出测试计划
6. 按 stage-2-solution agent 格式输出阶段 2 报告
7. 最后问用户是否确认进入阶段 3

重要：只设计方案，不改代码。"
```

展示 Agent 返回结果给用户。等用户确认后进入阶段 3。

---

## 阶段 3：执行修改

```javascript
使用 Agent 工具，subagent_type: "Codex"
参数：
  description: "Stage 3: Implementation"
  prompt: "按以下方案修改代码：
{阶段 2 确认的方案}

执行规则：
1. 修改前先读相关文件
2. 严格按方案执行，不扩大范围
3. 不改后端 API、WebSocket、配置字段
4. 复杂逻辑加注释
5. 全部改完后按 stage-3-implementation agent 格式输出修改报告
6. 不要做代码审查，不要写文档"
```

展示 Agent 返回结果给用户。自动进入阶段 4。

---

## 阶段 4：代码审查

```javascript
使用 Agent 工具，subagent_type: "Codex"
参数：
  description: "Stage 4: Code Review"
  prompt: "审查以下修改：
{阶段 3 修改文件清单}

检查内容：
1. 需求是否完成
2. 是否破坏现有功能
3. 代码质量
4. 注释是否充分
5. 按 stage-4-review agent 格式输出审查报告
6. 只审查，不改代码"
```

展示 Agent 返回结果给用户。自动进入阶段 5。

---

## 阶段 5：最终文档

```javascript
使用 Agent 工具，subagent_type: "Codex"
参数：
  description: "Stage 5: Final Documentation"
  prompt: "基于本次修改生成最终文档：
- 原始需求：{用户需求}
- 方案：{阶段 2 方案摘要}
- 修改文件：{阶段 3 文件清单}
- 审查结论：{阶段 4 结论}

按 stage-5-document agent 格式输出完整修改文档，包括：
1. 修改文件清单
2. 新增功能
3. 测试方法
4. 风险和建议
5. 建议的 git commit message"
```

展示 Agent 返回结果给用户。流程结束。

---

## 触发场景

任何涉及改代码的请求：
- "帮我改..."、"修复..."、"优化..."、"重构..."、"加个功能..."
- `/ai-change-flow`

---

## 关键警告

**你是主控，不是执行者。你不能自己跑阶段 1-5，你必须用 Agent 工具分别启动各个 stage agent。你自己只做一件事：启动 agent → 展示结果 → 问确认 → 启动下一个 agent。**

**绝对不要：**
- 自己读取代码开始分析需求（那是 stage-1 agent 的事）
- 自己设计方案（那是 stage-2 agent 的事）
- 自己改代码（那是 stage-3 agent 的事）
- 同时启动多个 stage agent
- 跳过任何 stage
