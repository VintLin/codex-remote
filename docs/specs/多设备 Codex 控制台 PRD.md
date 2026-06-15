# 多设备 Codex 控制台 PRD

## 1. 产品定位

本项目是一个自托管多设备 Codex Web 控制台。它不是新的 Agent、多 Agent 编排平台、provider proxy 或 Codex Desktop clone，而是对多台设备上 Codex 能力的统一入口和任务状态聚合层。

Control Plane 聚合设备状态、远程项目、Codex conversations、输出流、approval 状态和手动任务关联，但不跨设备共享 OpenAI、ChatGPT、Codex 或 provider secrets。

## 2. 用户与使用背景

目标用户是同时使用多台 macOS、Windows、Linux 设备运行 Codex 的高频用户。他们通常在不同机器上进行长时间实现、部署、打包或验证工作，需要一个浏览器入口查看设备是否在线、Codex 对话正在做什么、以及这些对话属于哪个任务。

当前痛点是每台电脑上的 Codex App 相互独立。用户需要远程登录不同电脑、切换窗口、查看任务状态、继续对话或检查部署结果，导致多设备使用成本高，尤其是在主力机需要移动、远程机器承担部署或长时间任务时。

## 3. 产品目标

- 在一个 Web 页面中查看所有设备状态。
- 快速切换并操作不同设备上的 Codex。
- 查看每台设备上的项目、对话、运行状态、输出流、审批状态和 Git / worktree 信息。
- 支持新建任务、继续对话、输入 follow-up、中止任务和处理 approval。
- 支持任务看板，将不同设备上的 Codex 对话手动关联到同一个任务。
- 为后续移动端操作预留 API 和配对边界。

## 4. 非目标

- 不做多 Agent 协作编排。
- 不做自动任务迁移。
- 不做跨设备上下文无缝转移。
- 不做自动选择空闲设备。
- 不优先支持 OpenCode、MiniMax Code、Claude Code 或 provider 抽象。
- 不做完整远程桌面。
- 不重打包 Codex Desktop。
- 不在 MVP 中实现完整 iOS App。

## 5. 核心场景

### 场景一：统一查看多台电脑上的 Codex 状态

用户打开 Web 控制台，看到所有已接入设备的在线状态、当前运行项目、运行中对话、最近更新时间、模型、sandbox 和 approval 模式。

### 场景二：快速切换到某台设备上的 Codex

用户选择设备后进入该设备的操作区，查看项目列表、对话列表、当前对话输出流、输入框、终端输出、Git 状态和可执行操作。

### 场景三：任务看板查看多设备 Codex 对话

用户在任务看板中查看 Project、Task 和 Linked Codex Conversations，并手动把不同设备、不同项目的 Codex 对话关联到同一个任务。

### 场景四：一键进入远程设备部署任务

用户从任务详情打开目标设备上的部署对话或新建部署对话，快速把部署指令发送给对应机器上的 Codex。

## 6. 信息架构

第一版包含设备视图和任务看板视图。

设备视图以电脑为中心：

- 全部设备。
- 设备详情。
- 项目列表。
- 对话列表。
- 当前对话。
- 当前运行状态。
- 终端输出。
- Git / worktree 状态。

任务看板以任务为中心：

- Board Project。
- Board Task。
- Linked Codex Conversations。
- 每个 linked conversation 的设备、项目路径、对话标题、状态、最近输出和更新时间。

两个视图都必须清晰显示设备、项目、对话和任务之间的归属关系。

## 7. MVP 功能范围

- 设备管理。
- 设备接入和配对命令。
- 远程项目列表。
- Codex 对话列表。
- Codex 对话读取、follow-up、中止和 approval 处理。
- 输出流查看。
- 任务看板。
- 任务和 Codex conversation 的手动关联。

## 8. MVP 优先级

P0 是设备接入、项目列表、对话列表、对话读取、follow-up、中止、输出流、任务看板和 conversation link。

P1 是终端输出、Git diff、worktree 状态、模型切换和更细的状态筛选。

P2 是移动端、自动任务迁移、provider 抽象和正式安装包。

## 9. 产品体验原则

- 保持设备、项目、对话和任务归属在操作点可见。
- 先展示运行状态，再要求用户深入详情。
- 明确区分 Control Plane 状态和本机 Codex runtime 状态。
- 使用紧凑、熟悉、可重复操作的控件。
- 任务关联保持手动和轻量。
- 视觉风格克制、技术化、清晰，避免营销页、重装饰和紧急感滥用。
- 状态必须不只依赖颜色表达，也要有明确文本或图标语义。

## 10. 风险与限制

- Codex app-server 接口和行为可能随版本变化。
- Windows、macOS 和 Linux 的本机路径、socket、权限和 shell 环境不同。
- approval 和 server request 处理不完整会导致任务卡住。
- 多设备控制必须避免泄露 OpenAI、ChatGPT、Codex 或 provider secrets。
- 如果过早引入 provider proxy、多 Agent 或完整移动端，会稀释 MVP。

## 11. 产品一句话

一个自托管的多设备 Codex Web 控制台，用来统一查看、操作和关联多台设备上的 Codex 工作。
