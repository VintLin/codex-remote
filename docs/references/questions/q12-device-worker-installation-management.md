---
title: "Q12：Device Worker 安装与管理"
source_url: "https://chatgpt.com/c/6a34ff35-97a4-83ee-be06-d899c5408141"
exported_at: "2026-06-19T17:07:20"
method: "system-clipboard"
clicked_copy: "True"
warnings:
---

## 结论：采用 “User-mode Worker first，System service later”

对 Codex Remote Device Worker，最低可维护方案不应该从复杂安装器或全平台 system service 开始。更合适的默认路线是：

| 阶段      | 推荐方案                                                                                                                                               |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 当前开发期   | 保留 `codex-worker run/probe/doctor` 手动 CLI。所有平台先以当前登录用户运行。                                                                                          |
| 早期 Beta | 提供单个二进制 + `codex-worker install --user`。macOS 写 LaunchAgent；Windows 写“登录时启动”的 Scheduled Task；Linux 写 `systemd --user` unit。                        |
| 稳定版     | 继续支持 user-mode；另加 `install --system` 给 headless/server 设备。Windows 才使用 Windows Service；Linux 使用 system service；macOS 只有确实需要开机无用户登录时才用 LaunchDaemon。 |
| 更新策略    | 初期不自更新；先做 `update check` / Control Plane 提示 / 手动升级。自更新必须等到签名 manifest、校验、回滚、服务重启健康检查都完成后再启用。                                                       |

核心判断：Worker 要访问本机 Codex app-server、本机文件系统、本机 git、SSH agent、terminal 和用户目录权限；这些天然更接近“用户会话代理”而不是“机器级后台服务”。Windows Service 在 Session 0 中运行，不能假设有交互式用户环境；LocalSystem 权限很大且不等同于登录用户。macOS 的 Documents、Downloads、Desktop 等目录还受 TCC 用户授权约束。([Microsoft Learn][1])

---

## 总体安装模型

建议把 Worker 做成一个统一 CLI：

```bash
codex-worker run                 # 前台运行，开发/调试
codex-worker probe               # 探测本机 app-server、git、terminal、文件权限
codex-worker doctor              # 完整诊断
codex-worker install --user      # 写入当前用户的启动项
codex-worker uninstall --user
codex-worker start|stop|restart
codex-worker status
codex-worker logs
codex-worker update check
codex-worker update apply        # 后期再开放
```

安装器不是必需品。第一阶段只需要发布 zip/tar 包或包管理器脚本，让 CLI 自己生成 OS 原生启动配置。这样能把复杂度压在 Worker 内部，而不是一开始维护三套 GUI installer。

---

## 启动方案比较

| 方案                     | 适合                            | 优点                                | 主要问题                                                               | 对 Device Worker 的结论          |
| ---------------------- | ----------------------------- | --------------------------------- | ------------------------------------------------------------------ | ---------------------------- |
| 手动 CLI                 | 开发、probe、故障复现                 | 环境最真实；日志直接 stdout/stderr；无安装成本    | 不能随登录/开机稳定运行；用户关终端即停                                               | 必须保留，作为开发期和诊断基线              |
| macOS LaunchAgent      | macOS 默认 user-mode worker     | 当前用户上下文；登录后自动启动；可用 launchd 管理生命周期 | plist 容易写错；TCC 权限仍需用户授权；stdout/stderr 日志只是最低限度                     | macOS 默认方案                   |
| macOS LaunchDaemon     | macOS headless / machine-mode | 开机启动；不依赖用户登录                      | 权限与用户环境错位；访问用户目录、git、SSH、TCC 更麻烦                                   | 不作为默认；只给受控 headless          |
| Windows Scheduled Task | Windows 默认 user-mode worker   | 登录时启动；可运行在当前用户下；不需要实现 ServiceMain | 监控能力比 Service 弱；重启策略要自己补                                           | Windows 桌面默认方案               |
| Windows Service        | Windows server/headless       | SCM 管理；开机启动；服务状态标准化               | 普通 CLI 不能直接当 service；服务需调用 service dispatcher；Session 0 非交互；用户环境错位 | 只作为 `--system` 或 headless 方案 |
| Linux `systemd --user` | Linux 桌面/开发机默认                | 用户上下文；journald 日志；Restart 策略简单    | 默认依赖用户会话；无登录运行需 linger 或改 system service                           | Linux 默认方案                   |
| Linux system service   | Linux server/headless         | 开机启动；隔离专用用户；journald；hardening 强  | 访问用户 home/git/SSH 需显式授权；更像 agent runner                            | headless 默认方案                |

macOS 的 launchd 区分 per-user LaunchAgent 与 system-wide LaunchDaemon：`~/Library/LaunchAgents` 是用户代理，`/Library/LaunchDaemons` 是系统级 daemon。([Keith's Blog][2]) Windows 的 `sc.exe create` 只是把服务写入 SCM 数据库，真正的服务进程还要满足 SCM 协议；微软文档说明服务启动后需调用 `StartServiceCtrlDispatcher`，否则不是可靠的普通 CLI 托管方式。([Microsoft Learn][3]) Linux 的 systemd unit 是 ini 风格配置，user unit 搜索路径包含 `~/.config/systemd/user`，system unit 通常由 `/etc/systemd/system` 管理。([Man7][4])

---

# macOS 推荐方案

## 默认：LaunchAgent，当前用户运行

使用：

```text
~/Library/LaunchAgents/com.codexremote.worker.plist
```

不要默认安装到：

```text
/Library/LaunchDaemons/com.codexremote.worker.plist
```

LaunchAgent 更适合你的 Worker，因为它要使用当前用户的 home、git config、SSH agent、terminal 环境、本机 Codex app-server 以及用户授权过的文件夹。LaunchDaemon 更像 root/system 级服务，适合 headless runner，但不适合桌面权限体验。

最小 plist：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.codexremote.worker</string>

  <key>ProgramArguments</key>
  <array>
    <string>/Users/USER/.local/bin/codex-worker</string>
    <string>run</string>
    <string>--config</string>
    <string>/Users/USER/Library/Application Support/Codex Remote/worker/config.toml</string>
  </array>

  <key>WorkingDirectory</key>
  <string>/Users/USER</string>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>/Users/USER/Library/Logs/Codex Remote/worker.out.log</string>

  <key>StandardErrorPath</key>
  <string>/Users/USER/Library/Logs/Codex Remote/worker.err.log</string>
</dict>
</plist>
```

`KeepAlive` 可让 launchd 保持进程运行，`StandardOutPath` / `StandardErrorPath` 可作为最低日志输出路径。Apple 文档也明确列出这些 key；但长期应改为结构化日志 + 日志轮转，避免无限增长。([Keith's Blog][2])

安装命令由 CLI 封装：

```bash
codex-worker install --user
# 内部执行类似：
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.codexremote.worker.plist
launchctl enable gui/$(id -u)/com.codexremote.worker
launchctl kickstart -k gui/$(id -u)/com.codexremote.worker
```

## macOS 权限策略

macOS 10.15+ 对 Documents、Downloads、Desktop、iCloud Drive、网络卷等位置要求用户同意。Worker 不应尝试绕过；应在 UI/CLI 中显示“需要授权的 workspace root”，然后让用户通过实际访问触发授权，或引导用户到 Full Disk Access。([苹果支持][5])

建议：

```text
默认只能访问用户显式添加的 workspace_roots
首次访问受保护目录时显示解释
Full Disk Access 仅作为高级选项
不默认请求 root
不把 provider secrets 放到 plist、环境变量或命令行参数
```

Worker 的本地 device token 存 macOS Keychain。Apple 的 Keychain 用于安全保存密码、密钥、身份等敏感项，并由系统服务控制访问。([苹果支持][6])

---

# Windows 推荐方案

## 默认：Scheduled Task，而不是 Windows Service

Windows 桌面默认建议用“登录时启动”的 Scheduled Task：

```powershell
$exe = "$env:LOCALAPPDATA\Programs\CodexRemote\Worker\codex-worker.exe"
$config = "$env:LOCALAPPDATA\CodexRemote\Worker\config.toml"

$action = New-ScheduledTaskAction `
  -Execute $exe `
  -Argument "run --config `"$config`""

$trigger = New-ScheduledTaskTrigger -AtLogOn

Register-ScheduledTask `
  -TaskPath "\CodexRemote\" `
  -TaskName "Worker" `
  -Action $action `
  -Trigger $trigger `
  -Description "Codex Remote Device Worker"

Start-ScheduledTask -TaskPath "\CodexRemote\" -TaskName "Worker"
```

`SchTasks` / Task Scheduler 支持 `ONLOGON` 触发器，也支持指定运行账户。([Microsoft Learn][7]) 这比 Windows Service 更适合桌面 Worker，因为它运行在用户账户下，可以使用用户 git config、SSH agent、profile、AppData 和交互式权限提示。

## 什么时候用 Windows Service

仅在这些场景使用：

```text
机器作为 headless runner
设备无人登录也必须在线
workspace 固定在机器级目录
不依赖用户 SSH agent / GUI prompt / 当前登录 session
```

Windows Service 不是把任意 CLI 丢给 `sc.exe create` 就可靠。SCM 要求服务进程按服务协议启动；如果 Worker 不是 native service，需要服务 wrapper。WinSW 是一个可选方案，它的目标就是把任意应用包装成 Windows Service。([Microsoft Learn][8])

示例，仅适合 headless/system mode：

```powershell
sc.exe create CodexRemoteWorker `
  binpath= "\"C:\Program Files\CodexRemote\Worker\codex-worker.exe\" service-run --config \"C:\ProgramData\CodexRemote\Worker\config.toml\"" `
  start= delayed-auto `
  obj= ".\codex-worker"
```

不要默认用 `LocalSystem`。微软文档说明 LocalSystem 拥有广泛本地权限，并且不关联登录用户。([Microsoft Learn][9]) 如果要 machine-mode，创建专用本地账户更可控；需要网络机器身份时再考虑 NetworkService，但它仍不是用户会话。([Microsoft Learn][10])

## Windows 权限与日志

推荐：

```text
user-mode:
  binary: %LOCALAPPDATA%\Programs\CodexRemote\Worker\
  config/state/logs: %LOCALAPPDATA%\CodexRemote\Worker\
  secret: DPAPI user scope

machine-mode:
  binary: %ProgramFiles%\CodexRemote\Worker\
  config/state/logs: %ProgramData%\CodexRemote\Worker\
  secret: DPAPI machine scope only when explicitly needed
```

Windows 的 Known Folder 机制用于识别标准系统目录；不要硬编码 `C:\Users\...`。([Microsoft Learn][11]) DPAPI 的 `CryptProtectData` 通常要求同一用户凭据、同一台机器才能解密；机器级保护会让同机其他用户也可能解密，因此 user-mode token 默认应使用 user scope。([Microsoft Learn][12])

日志方面，user-mode 初期用 rotating file 最简单；稳定后补 Windows Event Log。微软文档把 Windows Event Log 描述为集中式标准日志机制。([Microsoft Learn][13])

---

# Linux 推荐方案

## 默认：`systemd --user`

使用：

```text
~/.config/systemd/user/codex-remote-worker.service
```

最小 unit：

```ini
[Unit]
Description=Codex Remote Device Worker
After=network-online.target

[Service]
Type=exec
ExecStart=%h/.local/bin/codex-worker run --config %h/.config/codex-remote/worker.toml
WorkingDirectory=%h
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=default.target
```

安装命令：

```bash
mkdir -p ~/.config/systemd/user
cp codex-remote-worker.service ~/.config/systemd/user/

systemctl --user daemon-reload
systemctl --user enable --now codex-remote-worker.service

journalctl --user -u codex-remote-worker.service -f
```

systemd user unit 的搜索路径包含 `~/.config/systemd/user`；journald 会收集 systemd unit 输出，`journalctl` 用于查看 systemd-journald 存储的日志。([Man7][4])

如果需要“用户未登录也运行”，有两条路：

```text
桌面用户代理：loginctl enable-linger USER
真正 headless：改用 system service + 专用用户
```

`loginctl enable-linger` 允许未登录用户运行长期服务。([自由桌面][14]) 但对 Codex Remote，更清晰的边界是：桌面开发机用 user service；无人值守 runner 用 system service。

## Linux system service

适合 server/headless：

```ini
[Unit]
Description=Codex Remote Device Worker
After=network-online.target

[Service]
Type=exec
User=codex-worker
Group=codex-worker
ExecStart=/usr/local/bin/codex-worker run --config /etc/codex-remote/worker.toml
Restart=on-failure
RestartSec=5s

StateDirectory=codex-remote-worker
LogsDirectory=codex-remote-worker

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/var/lib/codex-remote-worker /srv/codex-workspaces

[Install]
WantedBy=multi-user.target
```

Red Hat 文档建议自定义 systemd unit 放在 `/etc/systemd/system`，并展示了 `Restart=always` / `RestartSec` 这类服务重启配置。([红帽文档][15]) system service 适合固定 workspace，例如 `/srv/codex-workspaces`，不适合默认去碰用户 home 里的私有项目。

Linux 目录遵循 XDG Base Directory：`$XDG_CONFIG_HOME` 默认 `~/.config`，`$XDG_STATE_HOME` 用于状态数据，`$XDG_CACHE_HOME` 用于缓存。([Freedesktop Specifications][16]) 机器级目录则遵循 FHS，`/etc` 用于配置、`/var` 用于可变状态。([Freedesktop Specifications][17])

---

# 配置、日志、状态目录约定

建议统一逻辑名：

```text
app id: codex-remote
service id: codex-remote-worker
label: com.codexremote.worker
```

| 平台           | user-mode binary                                              | user-mode config                                                | state                                                      | cache                                      | logs                                                     | service definition                                    | secret store                                      |
| ------------ | ------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| macOS        | `~/.local/bin/codex-worker` 或 `/usr/local/bin/codex-worker`   | `~/Library/Application Support/Codex Remote/worker/config.toml` | `~/Library/Application Support/Codex Remote/worker/state/` | `~/Library/Caches/Codex Remote/worker/`    | `~/Library/Logs/Codex Remote/worker.log`                 | `~/Library/LaunchAgents/com.codexremote.worker.plist` | Keychain                                          |
| Windows      | `%LOCALAPPDATA%\Programs\CodexRemote\Worker\codex-worker.exe` | `%LOCALAPPDATA%\CodexRemote\Worker\config.toml`                 | `%LOCALAPPDATA%\CodexRemote\Worker\state\`                 | `%LOCALAPPDATA%\CodexRemote\Worker\cache\` | `%LOCALAPPDATA%\CodexRemote\Worker\logs\`                | Task Scheduler `\CodexRemote\Worker`                  | DPAPI user scope                                  |
| Linux        | `~/.local/bin/codex-worker`                                   | `$XDG_CONFIG_HOME/codex-remote/worker.toml`                     | `$XDG_STATE_HOME/codex-remote/worker/`                     | `$XDG_CACHE_HOME/codex-remote/worker/`     | journald + optional `$XDG_STATE_HOME/codex-remote/logs/` | `~/.config/systemd/user/codex-remote-worker.service`  | Secret Service/libsecret or 0600 local token file |
| Linux system | `/usr/local/bin/codex-worker`                                 | `/etc/codex-remote/worker.toml`                                 | `/var/lib/codex-remote-worker/`                            | `/var/cache/codex-remote-worker/`          | journald or `/var/log/codex-remote-worker/`              | `/etc/systemd/system/codex-remote-worker.service`     | root/dedicated-user protected secret              |

Apple 明确建议把应用支持文件放在 `Library/Application Support`，缓存放在 `Library/Caches`。([Apple Developer][18]) Linux 采用 XDG / FHS；Windows 采用 Known Folders / AppData / ProgramData，不硬编码绝对路径。([Freedesktop Specifications][16])

---

# 配置文件建议

`config.toml` 只保存非 provider-secret 配置：

```toml
device_name = "mbp-vint"
control_plane_url = "https://codex-remote.local"
codex_app_server_url = "http://127.0.0.1:1455"

log_level = "info"
update_channel = "stable"
auto_update = "off" # off | notify | apply

[permissions]
workspace_roots = [
  "/Users/vint/projects",
]
allow_terminal = true
terminal_approval = "per-command" # never | per-command | session | always
allow_git_write = true
allow_file_delete = "confirm"

[network]
bind_local_only = true
proxy = ""
```

不要把这些放进配置文件：

```text
OpenAI / Anthropic / provider API key
SSH private key
Git credentials
Control Plane admin token
长期 refresh token 明文
```

Worker 自己的 device token 应存入 OS secret store。macOS 用 Keychain；Windows 用 DPAPI user scope；Linux 桌面用 Secret Service/libsecret，libsecret 通过 D-Bus 与 Secret Service 通信。([苹果支持][6])

---

# 权限管理模型

## 1. 设备配对

推荐流程：

```text
codex-worker pair
  -> 打开本地浏览器或显示一次性 pairing code
  -> Control Plane 记录 device_id、公钥、token hash、capabilities
  -> Worker 本地保存 device private key / device token
```

Control Plane 不保存 provider secrets。它只知道：

```text
device_id
device_name
OS / arch
worker version
capabilities
workspace aliases
last_seen
token hash / public key
```

## 2. 文件系统权限

默认拒绝全盘访问。采用 allowlist：

```toml
workspace_roots = [
  "/Users/vint/projects/codex-remote",
  "/Users/vint/work"
]
```

Worker 对任何超出 workspace root 的请求返回：

```text
PERMISSION_REQUIRED: path outside allowed roots
```

macOS 额外显示 TCC 指引；Windows 显示 ACL / Defender Controlled Folder Access 可能性；Linux 显示 POSIX owner/group/mode 诊断。

## 3. Terminal 权限

Terminal 是最高风险能力，必须拆级：

```text
read-only probe:
  pwd, git status, ls, cat allowlisted files

safe write:
  edit files under workspace root

command execution:
  每条命令显示 cwd、命令、env diff、预计影响

dangerous:
  rm -rf, chmod/chown, sudo, curl | sh, secret-looking env access
  默认二次确认或禁用
```

Worker 永远以当前用户或专用低权限用户运行，不默认 sudo/admin。`sudo`、UAC、管理员 shell 都应由本机用户显式触发，而不是 Control Plane 远程提升。

## 4. Git 权限

默认调用本机 `git`：

```text
git status/diff/log: 允许
git add/commit: 可配置
git push/reset/clean/rebase: 需要确认
```

不要把 SSH key 上传到 Control Plane。user-mode Worker 可以复用用户 SSH agent；system-mode Worker 应使用专用 deploy key 或专用机器账户，不要隐式读取用户私钥。

## 5. 本机 Codex app-server

Worker 到 Codex app-server 的连接应限制在 loopback：

```text
127.0.0.1 / ::1 only
local pairing token
origin check
no LAN bind by default
```

Control Plane 发任务给 Worker，Worker 在本机调用 Codex app-server。provider secrets 留在本机 app-server 或本机 secret store，不经过 Control Plane。

---

# 自更新 vs 不自更新

## 推荐顺序

| 阶段      | 策略          | 原因                                                        |
| ------- | ----------- | --------------------------------------------------------- |
| 开发期     | 不自更新        | 降低变量；便于复现 bug；避免服务被错误版本替换                                 |
| 早期 Beta | notify-only | Control Plane 显示“设备版本落后”，用户手动 `codex-worker update apply` |
| 稳定版     | 可选自更新       | 必须有签名 manifest、下载校验、原子替换、健康检查、回滚                          |
| 企业/自托管  | 默认不强制自更新    | 管理员应控制版本、channel、更新窗口和签名公钥                                |

## 自更新最低安全要求

自更新不能只是下载覆盖二进制。至少要有：

```text
release manifest:
  version
  os
  arch
  sha256
  signature
  min_supported_version
  rollback_allowed

worker:
  下载到 staging
  校验 sha256
  校验 manifest 签名
  stop service
  原子切换 binary 或 current symlink
  start service
  health check
  失败回滚
```

Control Plane 可以“通知可更新”，但不应有能力推送未签名二进制。自托管用户应能配置自己的 update URL 和 trusted public key。

macOS 稳定分发应做 Developer ID 签名和 notarization；Apple 的 notarization 用于让用户更信任 Developer ID 签名的软件。([Apple Developer][19]) Windows 稳定分发应做 Authenticode 签名；Microsoft SignTool 用于数字签名、验证签名和时间戳。([Microsoft Learn][20])

---

# 最低可维护实现清单

## 现在就做

```text
codex-worker run
codex-worker probe
codex-worker doctor
codex-worker logs
config.toml
workspace allowlist
local secret store abstraction
rotating file logs
structured JSON logs option
```

## 下一步做

```text
codex-worker install --user
  macOS: LaunchAgent
  Windows: Scheduled Task @ logon
  Linux: systemd --user

codex-worker uninstall --user
codex-worker status
Control Plane 显示 worker version / last_seen / permission issues
```

## 稳定版再做

```text
install --system
  Windows: native service or WinSW wrapper
  Linux: systemd system unit
  macOS: LaunchDaemon only for headless

signed releases
notarized macOS artifacts
Windows Authenticode signing
update notify/apply
rollback
enterprise policy config
```

---

## 最终推荐矩阵

| OS      | 默认安装                   | headless 安装            | 默认日志                                          | 默认 secrets                            | 备注                                                 |
| ------- | ---------------------- | ---------------------- | --------------------------------------------- | ------------------------------------- | -------------------------------------------------- |
| macOS   | LaunchAgent            | LaunchDaemon，少用        | `~/Library/Logs` + 后期 OSLog                   | Keychain                              | TCC 是核心 UX；固定 binary 路径，减少授权/启动项失效                 |
| Windows | Scheduled Task @ logon | Windows Service        | `%LOCALAPPDATA%` rotating logs + 后期 Event Log | DPAPI user scope                      | Service 只给 server/headless；普通 CLI 不应直接 `sc create` |
| Linux   | `systemd --user`       | systemd system service | journald                                      | Secret Service/libsecret 或 0600 token | 桌面用 user unit；无人值守用专用用户 system unit                |
| all     | 手动 CLI 保留              | —                      | stdout/stderr                                 | OS secret store                       | CLI 是开发、probe、recovery 的生命线                        |

最小可维护答案：**不要过早做复杂 installer；做一个单二进制 Worker + OS-native user-mode install 命令。macOS 用 LaunchAgent，Windows 用登录触发 Scheduled Task，Linux 用 `systemd --user`。Windows Service 和 Linux system service 作为 headless 模式，macOS LaunchDaemon 谨慎开放。自更新先不做，先做 notify/manual update；签名、校验、回滚完整后再允许 apply。**

[1]: https://learn.microsoft.com/en-us/windows/win32/services/service-changes-for-windows-vista "Service Changes for Windows Vista - Win32 apps | Microsoft Learn"
[2]: https://keith.github.io/xcode-man-pages/launchd.plist.5.html "launchd.plist(5)"
[3]: https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/sc-create "sc.exe create | Microsoft Learn"
[4]: https://man7.org/linux/man-pages/man5/systemd.unit.5.html "systemd.unit(5) - Linux manual page"
[5]: https://support.apple.com/guide/security/controlling-app-access-to-files-secddd1d86a6/web "Controlling app access to files in macOS - Apple Support"
[6]: https://support.apple.com/guide/security/keychain-data-protection-secb0694df1a/web "Keychain data protection - Apple Support"
[7]: https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/schtasks-create "schtasks create | Microsoft Learn"
[8]: https://learn.microsoft.com/en-us/windows/win32/api/winsvc/nf-winsvc-startservicectrldispatchera "StartServiceCtrlDispatcherA function (winsvc.h) - Win32 apps | Microsoft Learn"
[9]: https://learn.microsoft.com/en-us/windows/win32/services/localsystem-account "LocalSystem Account - Win32 apps | Microsoft Learn"
[10]: https://learn.microsoft.com/en-us/windows/win32/services/networkservice-account "NetworkService Account - Win32 apps | Microsoft Learn"
[11]: https://learn.microsoft.com/en-us/windows/win32/shell/knownfolderid?utm_source=chatgpt.com "KNOWNFOLDERID (Knownfolders.h) - Win32 apps"
[12]: https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata "CryptProtectData function (dpapi.h) - Win32 apps | Microsoft Learn"
[13]: https://learn.microsoft.com/en-us/windows/win32/eventlog/event-logging "Event Logging (Event Logging) - Win32 apps | Microsoft Learn"
[14]: https://www.freedesktop.org/software/systemd/man/loginctl.html?utm_source=chatgpt.com "loginctl"
[15]: https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_systemd_unit_files_to_customize_and_optimize_your_system/assembly_working-with-systemd-unit-files_working-with-systemd "Chapter 1. Working with systemd unit files | Using systemd unit files to customize and optimize your system | Red Hat Enterprise Linux | 9 | Red Hat Documentation"
[16]: https://specifications.freedesktop.org/basedir/?utm_source=chatgpt.com "XDG Base Directory Specification"
[17]: https://specifications.freedesktop.org/fhs/latest "Filesystem Hierarchy Standard"
[18]: https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemOverview/FileSystemOverview.html "File System Basics"
[19]: https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution?utm_source=chatgpt.com "Notarizing macOS software before distribution"
[20]: https://learn.microsoft.com/en-us/dotnet/framework/tools/signtool-exe "SignTool.exe (Sign Tool) - .NET Framework | Microsoft Learn"
