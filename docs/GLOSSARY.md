# 术语表

## 0. 使用规则

本术语表定义 Codex Remote 面向用户的名称。产品 UI、空态、加载态、错误态和帮助文案默认使用「用户可见名称」，不要直接暴露内部实现术语。

内部术语可以出现在开发文档、测试名、日志分类和折叠的诊断详情中，但默认界面必须先解释用户能理解的对象和动作。

## 1. 核心术语

| 用户可见名称 | 内部术语 | 含义 | UI 使用规则 |
|---|---|---|---|
| 控制中心 | Control Plane | Web 连接到的本地中转服务，负责发现设备、聚合状态并路由请求。 | 默认显示“控制中心”，不要显示 `Control Plane`。 |
| 设备连接器 | Worker | 每台设备上的本机连接服务，负责访问该设备上的 Codex、本地文件、Git 和只读环境信息。 | 默认显示“设备连接器”，不要显示 `Worker`。 |
| Codex 本机服务 | Codex runtime / Codex app-server | 在目标设备上实际承载 Codex 对话、任务和运行时状态的本机服务。 | 默认显示“Codex 本机服务”，不要显示 `app-server`。 |
| 设备 | Device | 一台可连接的 Mac、Windows 或 Linux 机器。 | 显示设备名和状态。 |
| 工作区 | Project / allowed project root | 设备上一组可管理的项目上下文。 | 不显示本机绝对路径，必要时显示安全的项目名。 |
| 对话 | Conversation / thread | 一个可打开、继续或控制的 Codex 工作上下文。 | 显示安全标题、状态和更新时间。 |
| 对话记录 | Timeline | 对话内的历史消息、工具摘要、审批卡和状态事件。 | 不显示 raw prompt、raw command output、raw JSON-RPC、full diff 或本机绝对路径。 |
| 连接凭证 | Bearer token / public token / worker token | Web、控制中心和设备连接器之间用于本地鉴权的凭证。 | 错误态只显示“连接凭证无效”，不要显示 token。 |

## 2. 状态术语

| 用户可见名称 | 内部术语 | 含义 | UI 使用规则 |
|---|---|---|---|
| 正在连接 | loading / connecting | 正在联系控制中心、设备连接器或 Codex 本机服务。 | 显示当前正在连接的对象。 |
| 已连接 | loaded / connected | 当前链路可用，数据已加载。 | 进入正常侧边栏和主内容。 |
| 部分可用 | degraded | 主链路可用，但某个区域不可用或读取失败。 | 保留已加载内容，提示具体区域失败。 |
| 未配置连接 | not_configured | 缺少连接配置或连接凭证。 | 提示需要配置本地连接。 |
| 连接凭证无效 | unauthorized / forbidden | token 无效或浏览器来源不允许。 | 不暴露鉴权细节。 |
| 控制中心不可达 | control_plane_unreachable / request_failure | Web 无法连接控制中心。 | 提示控制中心可能未启动或不可达。 |
| 设备不可达 | device_unavailable | 控制中心可用，但目标设备连接器不可达。 | 保持选中的设备，显示重试入口。 |
| Codex 本机服务未就绪 | app_server_unavailable / app_server_timeout | 设备连接器可用，但 Codex 本机服务不可用或超时。 | 提示检查目标设备上的 Codex 服务。 |
| 对话记录暂不可读 | timeline_read_error | 对话列表可用，但选中对话的内容读取失败。 | 保留侧边栏，主内容显示重试。 |
| 可重试 | retryable | 当前失败可能通过重试恢复。 | 显示“重试”操作。 |

## 3. 加载文案顺序

进入 Web 时，加载状态应按用户可理解的顺序表达：

1. 正在连接控制中心。
2. 正在连接上次使用的设备。
3. 正在检查 Codex 本机服务。
4. 正在加载对话记录。
5. 已连接后显示侧边栏对话记录和主内容区域。

## 4. 诊断详情

默认 UI 不展示内部术语。需要排障时，可以在折叠详情中显示脱敏诊断信息：

- error code，例如 `device_unavailable`。
- request id。
- retryable。
- device id。
- operation。

诊断详情不得包含 token、raw app-server URL、raw JSON-RPC、raw prompt、raw command output、full diff、stack/cause 或本机绝对路径。
