# 多设备 Codex 控制台 PRD v0.1

## 1. 需求背景

用户拥有多台可运行 Codex 的设备，包括 Windows 和 macOS。当前主力设备是 MacBook Pro M4，其他设备主要通过远程登录访问。

用户现在主要使用 Codex App，偶尔使用 OpenCode 和 MiniMax Code。Codex 是当前核心工作工具。

当前问题是：每台电脑上的 Codex App 都是相互独立的。用户需要在不同电脑之间远程登录、切换窗口、查看任务状态、继续对话、执行部署或检查结果。这导致多设备使用成本高，尤其是在主力机需要移动、远程机器承担部署或长时间任务时，缺乏统一入口。

因此需要一个 Web 应用，作为多设备 Codex 的统一控制台。

## 2. 产品定位

产品定位为：

**多设备 Codex Web 控制台**

它不是一个全新的 Agent，也不是完整的多 Agent 协作平台，而是对多台电脑上 Codex 能力的统一入口和任务状态聚合层。

核心能力包括：

1. 在一个 Web 页面中查看所有设备。
2. 快速切换并操作不同设备上的 Codex。
3. 查看每台设备上 Codex 的项目、对话和运行状态。
4. 支持新建任务、继续对话、输入 follow-up、中止和恢复任务。
5. 支持任务看板，将不同设备上的 Codex 对话手动关联到同一个任务。
6. 支持查看 Agent 输出、终端输出、模型配置、sandbox / approval 模式、Git 分支 / worktree 信息。
7. 后续可扩展手机端操作。

## 3. 用户目标

### 3.1 核心目标

用户希望在一个地方同时管理多台电脑上的 Codex，不需要频繁远程登录不同电脑。

### 3.2 具体目标

* 快速看到哪台电脑在线。
* 快速进入某台电脑的 Codex 操作界面。
* 查看某台电脑上的项目列表和对话列表。
* 新建或继续 Codex 对话。
* 查看 Codex 当前输出过程。
* 输入 follow-up。
* 中止、恢复任务。
* 查看终端输出。
* 查看 Git 分支 / worktree 状态。
* 切换模型、sandbox、approval 模式。
* 通过任务看板知道某个任务关联了哪些设备上的 Codex 对话。
* 手动设置“这个 Codex 对话属于哪个任务”。

## 4. 非目标

MVP 阶段不解决以下问题：

1. 不做多 Agent 协作编排。
2. 不做自动任务迁移。
3. 不做跨设备上下文无缝转移。
4. 不做自动选择空闲设备。
5. 不优先支持 OpenCode、MiniMax Code、Claude Code。
6. 不做完整远程桌面。
7. 不强制替代 Codex App 的所有 UI 细节。
8. 不优先做手机 App，只预留移动端 Web 适配能力。

## 5. 核心场景

### 场景一：统一查看多台电脑上的 Codex 状态

用户打开 Web 控制台，看到所有设备：

* MacBook Pro M4
* Windows 1
* Windows 2
* Windows 3
* Mac 1
* Mac 2

每台设备显示：

* 在线 / 离线
* 当前是否有 Codex 任务运行
* 当前运行中的项目
* 当前运行中的对话
* 最近更新时间
* 当前模型
* 当前 sandbox / approval 模式

### 场景二：快速切换到某台设备上的 Codex

用户点击某台设备，进入该设备的 Codex 操作界面。

界面中展示：

* 项目列表
* 对话列表
* 当前对话
* Agent 输出流
* 输入框
* 操作按钮：发送、中止、恢复、新建对话
* 终端输出
* Git 状态
* 文件树 / 项目目录信息

### 场景三：任务看板查看多设备 Codex 对话

用户切换到任务看板视图。

看板结构：

* Project

  * Task

    * Linked Codex Conversations

每个任务可以关联多个 Codex 对话，例如：

* Windows 1 / 项目 A / 对话 1
* MacBook Pro / 项目 A / 对话 3
* Mac mini / 项目 B / 对话 2

关联方式由用户手动设置。

### 场景四：一键进入远程设备部署任务

用户在任务看板中看到某个任务需要部署，可以选择目标设备上的 Codex 对话，或者新建一个部署对话。

部署对象包括：

* Windows 桌面应用打包
* Web 项目
* Python 服务
* Node.js / Next.js 项目

MVP 不要求自动完成复杂部署编排，但需要能快速打开对应设备、对应项目、对应 Codex 对话，并输入部署指令。

## 6. 信息架构

产品包含两种主要视图。

### 6.1 设备视图

设备视图以电脑为中心。

结构：

* 全部设备

  * 设备详情

    * 项目列表
    * 对话列表
    * 当前对话
    * 当前运行状态
    * 终端输出
    * Git / worktree 状态

适合场景：

* 快速切换设备。
* 直接操作某台设备上的 Codex。
* 查看远程机器是否正在运行任务。

### 6.2 任务看板视图

任务看板以任务为中心。

结构：

* Project

  * Task

    * Linked Codex Conversation

      * 设备
      * 项目路径
      * 对话标题
      * 状态
      * 最近输出
      * 最近更新时间

适合场景：

* 查看某个任务关联了哪些 Codex 对话。
* 查看任务进度。
* 手动整理多设备 Codex 工作状态。
* 从任务跳转到具体设备和对话。

## 7. MVP 功能范围

### 7.1 设备管理

必须支持：

* 添加设备
* 删除设备
* 修改设备名称
* 查看设备在线状态
* 查看设备系统类型
* 查看设备 Codex Worker 状态
* 查看设备最近心跳时间

设备字段：

```json
{
  "id": "device_001",
  "name": "Windows 台式机 1",
  "os": "windows",
  "host": "192.168.1.10",
  "status": "online",
  "last_seen_at": "2026-06-14T14:00:00+09:00"
}
```

### 7.2 Codex 项目列表

必须支持：

* 查看远程设备上的 Codex 项目列表
* 查看项目路径
* 查看项目最近使用时间
* 查看项目 Git 分支
* 查看项目是否有未提交变更

项目字段：

```json
{
  "id": "project_001",
  "device_id": "device_001",
  "name": "audit-assistant",
  "path": "D:/Projects/audit-assistant",
  "git_branch": "main",
  "has_changes": true,
  "last_opened_at": "2026-06-14T13:30:00+09:00"
}
```

### 7.3 Codex 对话列表

必须支持：

* 查看某个项目下的 Codex 对话列表
* 查看对话标题
* 查看对话状态
* 查看最近输出摘要
* 查看最近更新时间

对话字段：

```json
{
  "id": "conversation_001",
  "device_id": "device_001",
  "project_id": "project_001",
  "title": "打包 Windows 桌面应用",
  "status": "running",
  "last_message_summary": "正在检查 PyInstaller 配置...",
  "updated_at": "2026-06-14T13:55:00+09:00"
}
```

### 7.4 Codex 对话操作

必须支持：

* 新建 Codex 任务
* 继续已有对话
* 输入 follow-up
* 查看 Agent 输出过程
* 查看终端输出
* 中止任务
* 恢复任务
* 切换模型
* 切换 sandbox / approval 模式

MVP 需要优先实现：

1. 新建任务
2. 继续对话
3. 输入 follow-up
4. 查看输出流
5. 中止任务
6. 查看终端输出

模型切换、sandbox / approval 模式可以放在 MVP 后半段，但需要预留配置结构。

### 7.5 任务看板

必须支持：

* 创建 Project
* 创建 Task
* 修改 Task 状态
* 给 Task 关联 Codex 对话
* 取消关联 Codex 对话
* 从 Task 跳转到对应设备和对话
* 查看 Task 下所有关联对话的状态

Task 字段：

```json
{
  "id": "task_001",
  "project_id": "board_project_001",
  "title": "审核助手 Windows 打包",
  "status": "in_progress",
  "linked_conversations": [
    "conversation_001",
    "conversation_002"
  ],
  "created_at": "2026-06-14T12:00:00+09:00",
  "updated_at": "2026-06-14T14:00:00+09:00"
}
```

Task 状态：

* todo
* in_progress
* waiting
* done
* failed
* archived

## 8. 推荐产品形态

### 8.1 主界面布局

推荐采用三栏结构。

```text
左侧：设备 / 任务视图切换
中间：项目列表 / 任务看板
右侧：Codex 对话操作区
```

### 8.2 设备视图布局

```text
左栏：设备列表
中栏：该设备的项目和对话
右栏：当前 Codex 对话详情
```

### 8.3 任务看板布局

```text
左栏：Project / Task 列表
中栏：Task 详情和关联对话
右栏：选中的 Codex 对话操作区
```

### 8.4 关键交互

用户可以在任务看板中点击：

* 关联 Codex 对话
* 打开对话
* 跳转到设备
* 新建远程 Codex 任务
* 查看运行状态
* 输入 follow-up
* 中止运行

## 9. 技术方案建议

### 9.1 总体架构

```text
Web 控制台
  ↓
Server / Control Plane
  ↓
Device Worker
  ↓
Codex CLI / Codex app-server / Codex SDK
  ↓
本机项目目录
```

### 9.2 组件说明

#### Web 控制台

负责：

* 展示设备
* 展示项目
* 展示对话
* 展示任务看板
* 发起操作
* 查看输出流

#### Control Plane

负责：

* 设备注册
* 任务状态存储
* WebSocket 消息转发
* 对话和任务关联关系存储
* 权限控制
* 操作日志

#### Device Worker

每台电脑安装一个 Worker。

负责：

* 向 Control Plane 上报心跳
* 读取本机 Codex 项目和对话信息
* 启动 Codex 任务
* 继续 Codex 对话
* 发送 follow-up
* 中止任务
* 返回输出流
* 返回终端输出
* 返回 Git 状态

#### Codex 控制层

优先考虑：

1. Codex SDK
2. Codex app-server
3. codex exec

由于用户希望支持继续已有对话、输出流、中止、恢复、模型配置和 sandbox 配置，MVP 更适合优先研究 Codex SDK / app-server，而不是只使用 codex exec。

codex exec 更适合一次性任务，不适合作为完整 Codex App 替代界面。

## 10. 数据模型

### Device

```ts
type Device = {
  id: string
  name: string
  os: "macos" | "windows" | "linux"
  status: "online" | "offline"
  host?: string
  workerVersion?: string
  lastSeenAt: string
}
```

### RemoteProject

```ts
type RemoteProject = {
  id: string
  deviceId: string
  name: string
  path: string
  gitBranch?: string
  hasChanges?: boolean
  lastOpenedAt?: string
}
```

### CodexConversation

```ts
type CodexConversation = {
  id: string
  deviceId: string
  projectId: string
  title: string
  status: "idle" | "running" | "waiting_approval" | "stopped" | "failed" | "done"
  model?: string
  sandboxMode?: string
  approvalMode?: string
  lastMessageSummary?: string
  updatedAt: string
}
```

### BoardProject

```ts
type BoardProject = {
  id: string
  title: string
  description?: string
  createdAt: string
  updatedAt: string
}
```

### BoardTask

```ts
type BoardTask = {
  id: string
  boardProjectId: string
  title: string
  description?: string
  status: "todo" | "in_progress" | "waiting" | "done" | "failed" | "archived"
  linkedConversationIds: string[]
  createdAt: string
  updatedAt: string
}
```

### ConversationLink

```ts
type ConversationLink = {
  id: string
  taskId: string
  conversationId: string
  deviceId: string
  projectId: string
  note?: string
  createdAt: string
}
```

## 11. MVP 优先级

### P0：必须实现

* Web 控制台
* 设备注册
* 设备在线状态
* 查看设备列表
* 查看每台设备的项目列表
* 查看每台设备的对话列表
* 打开远程 Codex 对话
* 查看 Agent 输出流
* 输入 follow-up
* 新建 Codex 任务
* 中止任务
* 任务看板
* 手动关联 Task 与 Codex 对话
* 从 Task 跳转到对应 Codex 对话

### P1：重要但可后置

* 恢复任务
* 切换模型
* 切换 sandbox / approval 模式
* 查看终端输出
* 查看 Git 分支 / worktree 状态
* 文件树展示
* 部署快捷模板
* 移动端 Web 适配

### P2：后续扩展

* 手机 App
* OpenCode 支持
* MiniMax Code 支持
* 多 Agent 执行器抽象
* 自动选择设备
* 任务自动归档
* 运行日志检索
* 自动生成任务总结
* 自动生成部署报告

## 12. 风险与限制

### 12.1 Codex 官方接口限制

Codex App 的完整能力未必全部开放给第三方 Web 控制台。需要验证 Codex SDK / app-server 是否支持：

* 读取项目列表
* 读取历史对话
* 继续已有对话
* 中止任务
* 恢复任务
* 切换模型
* 获取终端输出
* 获取文件树
* 获取 Git 状态

如果不支持，需要通过 Worker 自己维护项目索引和任务元数据。

### 12.2 与 Codex App 的一致性风险

如果 Web 控制台复刻 Codex App 体验，可能会遇到功能不一致问题。

建议 MVP 不追求完整复刻，而是先实现：

* 项目
* 对话
* 输出流
* 输入 follow-up
* 任务关联
* 设备切换

### 12.3 安全风险

虽然当前用户对安全没有强要求，但产品仍应默认考虑：

* Worker 只监听本机或内网
* 每台设备独立 token
* Control Plane 与 Worker 通信需要鉴权
* API key 不上传到 Control Plane
* 默认只允许访问白名单项目目录
* 操作日志可追踪
* 高风险命令需要审批

### 12.4 多系统兼容风险

用户同时使用 Windows 和 macOS。需要注意：

* Windows 路径格式
* PowerShell / CMD / WSL 差异
* macOS shell 差异
* 文件权限差异
* Git / Node / Python 环境差异
* Codex Worker 安装和更新机制

## 13. 第一版 MVP 建议

第一版不要做复杂部署、不要做多 Agent、不要做自动迁移。

第一版只验证一个核心价值：

> 用户能否在一个 Web 页面中切换多台设备上的 Codex，并把不同设备上的 Codex 对话手动关联到任务看板。

### MVP Demo 流程

1. 用户打开 Web 控制台。
2. 页面显示 5 台设备。
3. 用户点击 Windows 1。
4. 页面显示 Windows 1 上的项目列表。
5. 用户打开某个项目。
6. 页面显示该项目下的 Codex 对话。
7. 用户打开一个对话，看到 Agent 输出。
8. 用户输入 follow-up。
9. 用户切换到任务看板。
10. 用户创建 Task。
11. 用户将刚才的 Codex 对话关联到 Task。
12. 用户切换到 Mac 设备。
13. 用户将 Mac 上另一个 Codex 对话也关联到同一个 Task。
14. 用户在 Task 中看到两个设备上的 Codex 对话状态。

## 14. 产品一句话

一个 Web 版多设备 Codex 控制台，让用户在一个地方切换、操作和观察多台电脑上的 Codex，并用任务看板手动关联不同设备上的 Codex 对话。
