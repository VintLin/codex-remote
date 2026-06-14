export type DeviceConnectionStatus = "Connected" | "Not connected";
export type ConversationStatus = "running" | "waiting" | "done" | "failed";
export type TaskStatus = "in_progress" | "waiting" | "done";
export type DiffKind = "context" | "add" | "remove";

export interface Device {
  id: string;
  icon: string;
  name: string;
  status: DeviceConnectionStatus;
  ip: string;
  lastOnlineAt: string;
  currentProject: string;
  model: string;
}

export interface SidebarProject {
  id: string;
  name: string;
  deviceId: string;
  path: string;
  branch: string;
  hasChanges: boolean;
  pinned: boolean;
  expanded?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  deviceId: string;
  projectId?: string;
  projectName: string;
  status: ConversationStatus;
  updatedAt: string;
  summary: string;
  sandbox: string;
  approval: string;
  pinned?: boolean;
}

export interface BoardTask {
  id: string;
  title: string;
  status: TaskStatus;
  linkedConversationIds: string[];
}

export interface DiffLine {
  line: number;
  kind: DiffKind;
  text: string;
}

export const devices: Device[] = [
  {
    id: "macbook",
    icon: "MB",
    name: "MacBook Pro M4",
    status: "Connected",
    ip: "192.168.1.24",
    lastOnlineAt: "刚刚",
    currentProject: "050_codex_remote",
    model: "GPT-5.4",
  },
  {
    id: "windows-build",
    icon: "W1",
    name: "Windows Build 01",
    status: "Not connected",
    ip: "192.168.1.41",
    lastOnlineAt: "3 分钟前",
    currentProject: "desktop-packager",
    model: "GPT-5.4",
  },
  {
    id: "mac-mini",
    icon: "MM",
    name: "Mac mini Lab",
    status: "Connected",
    ip: "192.168.1.32",
    lastOnlineAt: "18 秒前",
    currentProject: "01_skill-flow",
    model: "GPT-5.4",
  },
  {
    id: "linux-gpu",
    icon: "LX",
    name: "Linux GPU Box",
    status: "Not connected",
    ip: "10.0.0.18",
    lastOnlineAt: "2 小时前",
    currentProject: "research-index",
    model: "GPT-5.1",
  },
];

export const sidebarProjects: SidebarProject[] = [
  {
    id: "project-a",
    name: "项目 a",
    deviceId: "macbook",
    path: "/Users/Vint/Repos/ProjectA",
    branch: "main",
    hasChanges: true,
    pinned: true,
  },
  {
    id: "project-b",
    name: "项目 b",
    deviceId: "macbook",
    path: "/Users/Vint/Repos/ProjectB",
    branch: "release",
    hasChanges: false,
    pinned: true,
  },
  {
    id: "project-c",
    name: "项目 c",
    deviceId: "macbook",
    path: "/Users/Vint/Repos/ProjectC",
    branch: "main",
    hasChanges: true,
    pinned: false,
    expanded: true,
  },
  {
    id: "project-d",
    name: "项目 d",
    deviceId: "macbook",
    path: "/Users/Vint/Repos/ProjectD",
    branch: "feature/ui",
    hasChanges: false,
    pinned: false,
  },
  {
    id: "project-e",
    name: "项目 e",
    deviceId: "macbook",
    path: "/Users/Vint/Repos/ProjectE",
    branch: "main",
    hasChanges: false,
    pinned: false,
  },
  {
    id: "project-font-audit",
    name: "070_[网站]平面审核",
    deviceId: "macbook",
    path: "/Users/Vint/Repos/02_Project_Work/070_[网站]平面审核",
    branch: "main",
    hasChanges: false,
    pinned: false,
  },
  {
    id: "project-guoxue",
    name: "020_[网站]国学 Agent",
    deviceId: "macbook",
    path: "/Users/Vint/Repos/02_Project_Work/020_[网站]国学 Agent",
    branch: "deploy/wsl",
    hasChanges: true,
    pinned: false,
  },
  {
    id: "project-skill-flow",
    name: "01_skill-flow",
    deviceId: "macbook",
    path: "/Users/Vint/Repos/01_Project_Personal/020_skill_flow/01_skill-flow",
    branch: "main",
    hasChanges: false,
    pinned: false,
  },
  {
    id: "project-daily",
    name: "01_DailyMission",
    deviceId: "macbook",
    path: "/Users/Vint/Repos/00_Tasks/01_DailyMission",
    branch: "main",
    hasChanges: false,
    pinned: false,
  },
  {
    id: "project-research",
    name: "02_Research",
    deviceId: "macbook",
    path: "/Users/Vint/Repos/00_Tasks/02_Research",
    branch: "main",
    hasChanges: false,
    pinned: false,
  },
  {
    id: "project-openai",
    name: "02_OpenAI",
    deviceId: "macbook",
    path: "/Users/Vint/Repos/00_Obsidian/02_OpenAI",
    branch: "resources",
    hasChanges: true,
    pinned: false,
  },
  {
    id: "project-wordbank",
    name: "060_[网站]词库",
    deviceId: "macbook",
    path: "/Users/Vint/Repos/02_Project_Work/060_[网站]词库",
    branch: "v3",
    hasChanges: false,
    pinned: false,
  },
  {
    id: "project-archive",
    name: "03_Research",
    deviceId: "macbook",
    path: "/Users/Vint/Repos/00_Obsidian/03_Research",
    branch: "main",
    hasChanges: false,
    pinned: false,
  },
];

export const conversations: Conversation[] = [
  {
    id: "conversation-a",
    title: "对话 a",
    deviceId: "macbook",
    projectId: "project-c",
    projectName: "项目 c",
    status: "running",
    updatedAt: "刚刚",
    summary: "正在整理 sidebar 信息架构和 app-server 边界。",
    sandbox: "workspace-write",
    approval: "never",
  },
  {
    id: "conversation-b",
    title: "对话 b",
    deviceId: "macbook",
    projectId: "project-c",
    projectName: "项目 c",
    status: "done",
    updatedAt: "42 分钟前",
    summary: "完成项目列表与对话记录的 mock 结构梳理。",
    sandbox: "read-only",
    approval: "on-request",
  },
  {
    id: "conversation-c",
    title: "对话 c",
    deviceId: "macbook",
    projectName: "050_codex_remote",
    status: "waiting",
    updatedAt: "1 小时前",
    summary: "等待确认是否归档当前设备上的历史聊天。",
    sandbox: "workspace-write",
    approval: "untrusted",
  },
  {
    id: "conversation-d",
    title: "对话 d",
    deviceId: "macbook",
    projectName: "040_CodexManager",
    status: "failed",
    updatedAt: "昨天",
    summary: "模拟失败态，用于检查状态颜色和右侧 review 细节。",
    sandbox: "workspace-write",
    approval: "on-request",
  },
  {
    id: "search-test",
    title: "Test",
    deviceId: "mac-mini",
    projectName: "050_codex_remote",
    status: "done",
    updatedAt: "昨天",
    summary: "搜索弹窗首项 mock。",
    sandbox: "read-only",
    approval: "never",
    pinned: true,
  },
];

export const searchRecents = [
  { title: "Test", project: "", active: true },
  { title: "文档优化", project: "050_codex_remote" },
  { title: "样式设计", project: "050_codex_remote" },
  { title: "排查 group 导入超时", project: "01_skill-flow", marker: true },
  { title: "审查导入页修复", project: "01_skill-flow" },
  { title: "查找 Web UI 设计技能", project: "01_DailyMission" },
  { title: "安装 codegraph", project: "01_DailyMission" },
  { title: "查明 sqlite 数据作用", project: "040_CodexManager" },
  { title: "查看当前 worktree", project: "040_CodexManager" },
];

export const tasks: BoardTask[] = [
  {
    id: "task-web-mvp",
    title: "Ship Web MVP shell",
    status: "in_progress",
    linkedConversationIds: ["conversation-a", "conversation-b"],
  },
  {
    id: "task-worker-probe",
    title: "Worker probe parity",
    status: "waiting",
    linkedConversationIds: ["conversation-c"],
  },
];

export const diffLines: DiffLine[] = [
  { line: 18, kind: "context", text: "export interface Device {" },
  { line: 19, kind: "remove", text: "  status: string;" },
  { line: 19, kind: "add", text: "  status: DeviceConnectionStatus;" },
  { line: 20, kind: "add", text: "  lastHeartbeatAt: string;" },
  { line: 21, kind: "context", text: "  workerVersion: string;" },
];
