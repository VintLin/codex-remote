---
title: "Q17"
source_url: "https://chatgpt.com/c/6a350f6e-8b20-83e8-8f91-b9a6cd8aad10"
exported_at: "2026-06-19T19:39:16"
method: "system-clipboard"
clicked_copy: "True"
warnings:
---

## 结论

**最小可维护实现**：不要自己分别封装 macOS Keychain、Windows Credential Manager/DPAPI、Linux libsecret。建议做一个很薄的 TypeScript `SecretStore` 接口，主后端使用 **`@napi-rs/keyring`**，失败时只在用户显式允许的情况下使用 **受限权限文件 fallback**。

推荐策略：

1. **默认：OS secret store**

   * macOS：Keychain。
   * Windows：Credential Manager；大 blob 或服务场景可后续加 DPAPI-encrypted file。
   * Linux desktop：Secret Service / libsecret / GNOME Keyring / KWallet。

2. **Linux headless / CI / Docker：默认 fail closed**

   * 没有 D-Bus session 或 unlocked keyring 时，不自动静默降级。
   * 提供明确配置：`CODEX_REMOTE_SECRET_STORE=file` 或 `--secret-store=file`。
   * 文件 fallback 只保存 **Device Worker 自身身份材料**，不保存 provider secrets。

3. **文件 fallback**

   * POSIX：目录 `0700`，文件 `0600`，原子写入，拒绝 symlink，启动时校验权限。
   * Windows：不要把 Node 的 `chmod(0600)` 当安全边界；Node 文档明确 Windows 不实现 owner/group/others 权限语义。Windows fallback 若确实需要，应使用 DPAPI CurrentUser 加密文件，或设置真实 ACL。([Node.js][1])

4. **不存 provider secrets 的边界**

   * `DeviceIdentityStore` 只允许写入 allowlist schema：`deviceToken`、`devicePrivateKey`、`deviceId`、`publicKeyFingerprint`。
   * Control Plane 只保存 public key / fingerprint / device record / revocation state。
   * OpenAI、ChatGPT、Anthropic、provider API key 等不得进入该 store，也不得同步到 Control Plane。

---

## 推荐架构

```text
Device Worker
  ├─ DeviceIdentityStore       // 只存 worker 自身身份材料
  │   └─ SecretStore interface
  │       ├─ KeyringSecretStore        // 默认：@napi-rs/keyring
  │       ├─ Posix0600FileStore        // Linux/headless 显式 fallback
  │       ├─ WindowsDpapiFileStore     // 可选后续增强
  │       └─ MemorySecretStore         // 测试专用
  │
  └─ ProviderSecretPolicy
      ├─ 不进入 Control Plane
      ├─ 不进入 DeviceIdentityStore
      └─ 如未来允许本地 provider secret，也必须是单独 local-only scope
```

`@napi-rs/keyring` 的 README 给出的 API 很小：`new Entry(service, account)` 后 `setPassword/getPassword/deletePassword`，并说明它是基于 Rust `keyring-rs` 的 Node 绑定，目标是替代 `node-keytar`。该 npm 包截至 2026 年仍有近期 release；底层 `keyring-rs` 也在 2026 年仍活跃维护。([GitHub][2])

---

## 平台比较

| 平台 / 后端                              |                                                   安全边界 |                                                 Headless 行为 | 主要坑                                                                   | 对 Codex Remote 的建议                                                                                                                                             |
| ------------------------------------ | -----------------------------------------------------: | ----------------------------------------------------------: | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **macOS Keychain**                   |                   用户 keychain；可有访问控制；其他 app 访问可能触发用户授权 | 登录用户上下文通常可用；后台 daemon / CI 可能遇到 prompt 或 keychain unlock 问题 | 可能阻塞等待用户输入；code signing / app identity 变化可能影响访问                       | 默认使用。生产 CLI/worker 应提供 `doctor secrets` 检查 keychain 可用性。Electron 文档也指出 macOS Keychain 访问可能阻塞等待用户输入。([Electron][3])                                             |
| **Windows Credential Manager**       |          当前用户 credential set；Credential Manager 可查看/删除 |              Windows service 可用，但 secret 绑定到运行该 service 的账户 | Generic Credential blob 最大约 2560 bytes；service account 改变后读不到旧 secret | 默认使用。把 token 和 private key 分成多个 entry；避免 RSA 私钥这类大 blob，优先 Ed25519/P-256。Microsoft 文档列出了 `CRED_MAX_CREDENTIAL_BLOB_SIZE` 和 `Persist` 语义。([Microsoft Learn][4]) |
| **Windows DPAPI**                    |           默认同一用户、通常同一机器可解；`LOCAL_MACHINE` 会放宽到本机任意用户可解 |                                              非交互服务友好；可禁止 UI | 需要自己存 ciphertext 文件；`LOCAL_MACHINE` 不适合用户隔离                           | 作为 Windows 大 blob fallback 很合适，但不要用 `LOCAL_MACHINE`，除非明确接受本机任意用户可解密风险。([Microsoft Learn][5])                                                                   |
| **Linux Secret Service / libsecret** | 用户 session 内的 secret service；GNOME Keyring/KWallet 等实现 |       headless 常见失败：没有 D-Bus session、没有 unlocked collection | lookup attributes 不是 secret；locked collection 可能需要 prompt             | desktop Linux 默认使用；headless 不要静默降级。Secret Service 规范说明它运行在用户登录 session 中，locked item 需要 unlock，attributes 不应视为 secret。([Freedesktop.org 规格][6])                |
| **Linux headless server**            |                          取决于是否配置 D-Bus + gnome-keyring |                                                     默认经常不可用 | CI/systemd/docker 没有桌面 session；unlock 流程复杂                            | 默认 fail closed；文档化两种模式：配置 gnome-keyring，或显式启用 file fallback。Zowe 的 headless Linux 文档也要求启动 D-Bus 并解锁 GNOME Keyring。([Zowe 文档][7])                               |
| **POSIX 0600 file fallback**         |                  只防其他 Unix 用户；不防同 UID 恶意进程；不加密 at rest |                                   最稳定，适合 server / container | 权限、symlink、backup、volume 泄露                                           | 可作为显式 fallback。要求专用 service user、`0700` 目录、`0600` 文件、原子写入、启动校验、token 可轮换。                                                                                      |
| **Windows restricted file fallback** |                                  取决于 ACL，不是 POSIX mode |                                                     可用但实现复杂 | Node `chmod` 不能表达 owner/group/others；ACL 设置容易错                        | 不建议作为 v1。若需要，优先 DPAPI file；或用 Win32 ACL / `icacls`，不是单纯 `chmod`。Microsoft `icacls` 用于查看和修改 DACL。([Microsoft Learn][8])                                         |

---

## Node / TypeScript 库选型

| 库                                          | 状态                        | 优点                                                                                                    | 风险 / 不选原因                                                                         | 建议                                                   |
| ------------------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **`@napi-rs/keyring`**                     | 仍在维护；基于 Rust `keyring-rs` | API 小；跨平台；不需要自己写三套 native binding                                                                     | Windows Credential Manager blob size 限制仍要考虑；Linux headless 仍依赖 Secret Service 可用性 | **v1 首选**。用 adapter 隔离，便于后续替换。([GitHub][2])          |
| **`keytar`**                               | GitHub repo 已归档只读         | 老牌 Electron/Node 方案；支持 macOS Keychain、Linux Secret Service、Windows Credential Vault                   | 2022 年已 archived；不适合作为 2026 产品主依赖                                                 | 不建议新项目采用。([GitHub][9])                               |
| **`cross-keychain`**                       | 较新                        | Node/CLI；声明支持 Windows Credential Manager、macOS Keychain、Linux Secret Service；有 diagnose/force backend | 生态和成熟度不如 keyring-rs 路线；需要评估 transitive 行为                                         | 可作为备选或 CLI 诊断参考，不建议先作为唯一核心。([GitHub][10])            |
| **Electron `safeStorage`**                 | Electron 官方               | 对 Electron app 很方便；macOS Keychain、Windows DPAPI、Linux Secret Service/portal                           | 不是纯 Node 依赖；Linux 没有 secret store 时可能退到 `basic_text`，这对 secret storage 很危险        | 只有 Device Worker 本身跑在 Electron 内时才考虑。([Electron][3]) |
| **Bun `secrets`**                          | Bun 官方但实验性                | API 很干净；macOS Keychain、Linux libsecret、Windows Credential Manager                                     | 不是 Node runtime；官方标注 experimental；Linux 仍要求 secret service daemon                 | 若未来支持 Bun worker 可考虑；Node 产品线不作为主方案。([Bun][11])      |
| 自己封装 `security.exe/secret-tool/cmdkey` CLI | 可行但脆弱                     | 无 native npm 依赖                                                                                       | CLI 参数泄露、输出解析、本地化、prompt、CI 差异、错误码复杂                                              | 不建议生产主路径；只用于 `doctor` 或调试文档。                         |

---

## 关键实现细节

### 1. service/account 命名

建议固定：

```ts
const SERVICE = "dev.codex-remote.worker";

const accounts = {
  deviceToken: `device:${deviceId}:token`,
  devicePrivateKey: `device:${deviceId}:private-key`,
  deviceIdentityMeta: `device:${deviceId}:meta`,
};
```

不要把整个 identity JSON 都塞进一个 Windows Credential Manager item。Windows Generic Credential blob 有约 2560 bytes 限制，RSA private key 很容易超；Ed25519/P-256 私钥通常更适合。([Microsoft Learn][4])

### 2. TypeScript 最小接口

```ts
export interface SecretStore {
  readonly kind: "os-keyring" | "posix-0600-file" | "windows-dpapi-file" | "memory";

  get(account: string): Promise<string | null>;
  set(account: string, value: string): Promise<void>;
  delete(account: string): Promise<void>;
  healthcheck(): Promise<void>;
}
```

### 3. OS keyring adapter

```ts
export class KeyringSecretStore implements SecretStore {
  readonly kind = "os-keyring" as const;

  constructor(private readonly service: string) {}

  async get(account: string): Promise<string | null> {
    const { Entry } = await import("@napi-rs/keyring");
    const entry = new Entry(this.service, account);

    try {
      return entry.getPassword() ?? null;
    } catch (error) {
      // 具体错误类型依赖 native backend；上层统一包装。
      throw new SecretStoreUnavailableError("OS keyring read failed", { cause: error });
    }
  }

  async set(account: string, value: string): Promise<void> {
    const { Entry } = await import("@napi-rs/keyring");
    const entry = new Entry(this.service, account);

    try {
      entry.setPassword(value);
    } catch (error) {
      throw new SecretStoreUnavailableError("OS keyring write failed", { cause: error });
    }
  }

  async delete(account: string): Promise<void> {
    const { Entry } = await import("@napi-rs/keyring");
    const entry = new Entry(this.service, account);

    try {
      entry.deletePassword();
    } catch {
      // delete 应该幂等；not found 不应导致 uninstall/re-enroll 失败。
    }
  }

  async healthcheck(): Promise<void> {
    const probe = `healthcheck:${process.pid}:${Date.now()}`;
    await this.set(probe, "ok");
    const got = await this.get(probe);
    await this.delete(probe);

    if (got !== "ok") {
      throw new SecretStoreUnavailableError("OS keyring healthcheck failed");
    }
  }
}

export class SecretStoreUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SecretStoreUnavailableError";
  }
}
```

### 4. POSIX 0600 file fallback

只在以下条件满足时启用：

```text
CODEX_REMOTE_SECRET_STORE=file
或
配置 allowFileFallback=true
并且用户/管理员已确认接受“不加密 at rest，只靠文件权限”的风险
```

核心要求：

```ts
import { mkdir, open, rename, chmod, lstat, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export class Posix0600FileStore implements SecretStore {
  readonly kind = "posix-0600-file" as const;

  constructor(private readonly rootDir: string) {
    if (process.platform === "win32") {
      throw new Error("Use DPAPI/ACL backend on Windows; POSIX 0600 semantics do not apply.");
    }
  }

  private pathFor(account: string): string {
    const safe = account.replace(/[^a-zA-Z0-9._:-]/g, "_");
    return join(this.rootDir, `${safe}.secret`);
  }

  async get(account: string): Promise<string | null> {
    const path = this.pathFor(account);

    try {
      await this.assertSafeFile(path);
      return await readFile(path, "utf8");
    } catch (error: any) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
  }

  async set(account: string, value: string): Promise<void> {
    const path = this.pathFor(account);
    const dir = dirname(path);
    const tmp = join(dir, `.${Date.now()}.${process.pid}.tmp`);

    await mkdir(dir, { recursive: true, mode: 0o700 });
    await chmod(dir, 0o700);

    const fh = await open(tmp, "wx", 0o600);
    try {
      await fh.writeFile(value, "utf8");
      await fh.sync();
    } finally {
      await fh.close();
    }

    await chmod(tmp, 0o600);
    await rename(tmp, path);
    await this.assertSafeFile(path);
  }

  async delete(account: string): Promise<void> {
    const { rm } = await import("node:fs/promises");
    await rm(this.pathFor(account), { force: true });
  }

  async healthcheck(): Promise<void> {
    const probe = `healthcheck:${process.pid}:${Date.now()}`;
    await this.set(probe, "ok");
    const got = await this.get(probe);
    await this.delete(probe);
    if (got !== "ok") throw new Error("file fallback healthcheck failed");
  }

  private async assertSafeFile(path: string): Promise<void> {
    const st = await lstat(path);

    if (!st.isFile()) {
      throw new Error(`Secret path is not a regular file: ${path}`);
    }

    if ((st.mode & 0o077) !== 0) {
      throw new Error(`Secret file must not be readable by group/others: ${path}`);
    }
  }
}
```

Node 的 `fs.open`/`writeFile` mode 只在新建文件时生效，默认 mode 是 `0o666`，所以必须显式创建、`chmod`、再校验；Node 文档也说明 Windows 上 owner/group/others 权限语义不完整。([Node.js][1])

---

## 自动选择逻辑

建议不要“OS store 失败就悄悄写明文文件”。选择逻辑应可观测：

```ts
export async function createSecretStore(options: {
  mode: "auto" | "os" | "file" | "memory";
  allowFileFallback: boolean;
  service: string;
  fileRoot: string;
}): Promise<SecretStore> {
  if (options.mode === "memory") return new MemorySecretStore();

  if (options.mode === "file") {
    const store = new Posix0600FileStore(options.fileRoot);
    await store.healthcheck();
    return store;
  }

  const osStore = new KeyringSecretStore(options.service);

  try {
    await osStore.healthcheck();
    return osStore;
  } catch (error) {
    if (options.mode === "os") throw error;

    if (!options.allowFileFallback) {
      throw new SecretStoreUnavailableError(
        "OS secret store is unavailable. Run `codex-remote doctor secrets` or explicitly enable file fallback.",
        { cause: error }
      );
    }

    const fileStore = new Posix0600FileStore(options.fileRoot);
    await fileStore.healthcheck();
    return fileStore;
  }
}
```

Linux 下还可以提前给出更友好的诊断：

```ts
function linuxSecretServiceLikelyUnavailable(): boolean {
  return process.platform === "linux" && !process.env.DBUS_SESSION_BUS_ADDRESS;
}
```

但不要只靠这个判断；最终仍以 `healthcheck()` 为准。

---

## Linux headless 行为建议

Linux 是最容易踩坑的平台。Secret Service 规范假设有用户登录 session 和 secret service；locked collection 需要 unlock，attribute 也不是 secret。([Freedesktop.org 规格][6])

建议文档化三种部署模式：

### 模式 A：Desktop Linux

```text
CODEX_REMOTE_SECRET_STORE=auto
```

要求系统有 GNOME Keyring、KWallet 或兼容 Secret Service 的 provider。

### 模式 B：Headless Linux，使用 OS keyring

要求管理员显式配置：

```text
DBUS session
gnome-keyring-daemon 或兼容 Secret Service daemon
启动时 unlock keyring
```

Zowe 的 headless Linux 文档给出的模式也是启动 D-Bus、运行 `gnome-keyring-daemon --unlock --components=secrets`，并说明每个用户 session 都要 unlock。([Zowe 文档][7])

### 模式 C：Headless Linux，使用 0600 file fallback

```text
CODEX_REMOTE_SECRET_STORE=file
```

要求：

```text
专用 Unix 用户：codex-remote
secret 目录：0700
secret 文件：0600
systemd service 不共享该用户
device token 可撤销、可轮换
Control Plane 可 revoke device public key / fingerprint
```

对自托管 server，这是实际运维成本最低的模式。它不是强加密方案，但比“强行配置 GNOME Keyring in systemd/docker”更可预测。

---

## Windows 特别建议

Windows 上有两个合理路径：

### v1：Credential Manager

适合小 secret：

```text
device token
Ed25519 private key
P-256 private key
small JSON metadata
```

不适合大 blob。Microsoft 文档中 Generic Credential 的 `CredentialBlobSize` 上限是 `CRED_MAX_CREDENTIAL_BLOB_SIZE`，即约 2560 bytes。([Microsoft Learn][4])

### v1.5：DPAPI-encrypted file

适合：

```text
大于 Credential Manager 限制的 identity bundle
Windows service 固定 service account
需要非交互、无 Credential Manager UI 依赖
```

DPAPI 默认只有同一用户、通常同一机器能解密；`CRYPTPROTECT_LOCAL_MACHINE` 会允许本机任何用户解密，因此不建议用于 Codex Remote 的 per-device identity。([Microsoft Learn][5])

---

## macOS 特别建议

macOS 默认走 Keychain。需要注意：

```text
CLI 首次写入通常没问题；
读取时可能受 keychain lock / access control / app identity 影响；
LaunchDaemon、SSH session、CI 可能遇到交互式 prompt 或 unlock 问题。
```

Electron 官方文档也说明 macOS Keychain 访问可能阻塞等待用户输入。([Electron][3])

建议提供：

```bash
codex-remote doctor secrets
codex-remote device re-enroll
codex-remote device rotate-key
```

`doctor secrets` 只报告 backend、可写性、可读性、错误类型；不要打印 secret 值。

---

## CI 测试矩阵

### 1. 单元测试

所有业务逻辑使用 `MemorySecretStore`：

```text
schema allowlist
provider secret 拒写
device identity serialization
rotation / revoke flow
missing secret re-enroll flow
```

### 2. OS integration tests

建议 GitHub Actions matrix：

```yaml
strategy:
  matrix:
    os:
      - macos-latest
      - windows-latest
      - ubuntu-latest
```

`keyring-rs` 自身 CI 也覆盖 macOS、Windows、Ubuntu 等平台，这说明底层生态本身有跨平台测试基础。([GitHub][12])

### 3. Linux CI

Linux Secret Service integration test 默认容易 flaky。建议：

```text
默认跑 file fallback tests
Secret Service integration tests 仅在 RUN_SECRET_SERVICE_TESTS=1 时跑
CI 中显式安装 gnome-keyring / libsecret 相关包
用 dbus-run-session 或 dbus-launch 启动 session
显式 unlock keyring
```

`dbus_secret_service` 文档也提到 Secret Service 需要 session D-Bus，并指出 headless 环境存在已知问题；其 CI workaround 是启动 unlocked gnome-keyring。([Docs.rs][13])

### 4. 文件 fallback tests

必须覆盖：

```text
新文件 mode 是 0600
目录 mode 是 0700
group/others readable 时拒绝启动
symlink path 拒绝
atomic write 中断不会留下半写 secret
delete 幂等
backup/export 不包含 provider secrets
```

### 5. Windows tests

必须覆盖：

```text
Credential Manager set/get/delete
service/account 命名稳定
large secret 超限时给出明确错误
不要使用 POSIX chmod fallback
```

---

## Provider secrets 边界

建议在代码层做硬隔离，而不是靠约定。

### 1. 只暴露 DeviceIdentityStore

```ts
export type DeviceIdentityV1 = {
  schema: "codex-remote.device-identity.v1";
  deviceId: string;
  deviceToken: string;
  privateKeyPem: string;
  publicKeyFingerprint: string;
  createdAt: string;
};

export class DeviceIdentityStore {
  constructor(private readonly secrets: SecretStore) {}

  async save(identity: DeviceIdentityV1): Promise<void> {
    assertDeviceIdentityOnly(identity);

    await this.secrets.set(
      `device:${identity.deviceId}:token`,
      identity.deviceToken
    );

    await this.secrets.set(
      `device:${identity.deviceId}:private-key`,
      identity.privateKeyPem
    );

    await this.secrets.set(
      `device:${identity.deviceId}:meta`,
      JSON.stringify({
        schema: identity.schema,
        deviceId: identity.deviceId,
        publicKeyFingerprint: identity.publicKeyFingerprint,
        createdAt: identity.createdAt,
      })
    );
  }
}
```

### 2. 拒绝 provider secret 进入该模块

```ts
function assertDeviceIdentityOnly(value: unknown): asserts value is DeviceIdentityV1 {
  const identity = value as Partial<DeviceIdentityV1>;

  if (identity.schema !== "codex-remote.device-identity.v1") {
    throw new Error("Only device identity material may be stored here.");
  }

  const serialized = JSON.stringify(identity);

  if (/\b(openai|chatgpt|anthropic|provider|api[_-]?key|sk-[a-zA-Z0-9])/i.test(serialized)) {
    throw new Error("Provider secrets must not be stored in DeviceIdentityStore.");
  }
}
```

正则只能防误用，真正的安全边界应该是 **API 设计上根本没有 `saveProviderSecret()`**，并在 Control Plane request schema 中禁止 provider secret 字段。

---

## 最终推荐

Codex Remote 的 v1 产品化方案可以这样定：

```text
默认后端：
  @napi-rs/keyring

存储内容：
  device token
  device private key
  public key fingerprint metadata

不存：
  OpenAI / ChatGPT / provider API key
  provider refresh token
  browser cookie
  user session secret

Linux headless：
  默认报错 + doctor 指引
  显式 opt-in 后使用 0600 file fallback

Windows 大 blob：
  v1 拆分 entry + 使用小型 Ed25519/P-256 key
  v1.5 增加 DPAPI-encrypted file backend

测试：
  MemoryStore 单测
  OS keyring integration matrix
  Linux Secret Service optional integration
  fallback 权限/atomic/symlink 测试
```

这套方案的维护面最小：一个主依赖、一个内部接口、一个可审计的 file fallback，并且把 Linux headless 的不确定性显式暴露给管理员，而不是在最危险的场景静默降级。

[1]: https://nodejs.org/api/fs.html "File system | Node.js v26.3.1 Documentation"
[2]: https://github.com/Brooooooklyn/keyring-node "GitHub - Brooooooklyn/keyring-node: https://github.com/hwchen/keyring-rs Node.js binding via https://napi.rs. Including 100% compatible node-keytar alternative. · GitHub"
[3]: https://electronjs.org/docs/latest/api/safe-storage "safeStorage | Electron"
[4]: https://learn.microsoft.com/en-us/windows/win32/api/wincred/ns-wincred-credentiala?utm_source=chatgpt.com "CREDENTIALA (wincred.h) - Win32 apps"
[5]: https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata "CryptProtectData function (dpapi.h) - Win32 apps | Microsoft Learn"
[6]: https://specifications.freedesktop.org/secret-service/latest-single "Secret Service API Draft"
[7]: https://docs.zowe.org/v3.1.x/user-guide/cli-configure-scs-on-headless-linux-os "Configuring secure credential storage on headless Linux operating systems | Zowe Docs"
[8]: https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls?utm_source=chatgpt.com "icacls"
[9]: https://github.com/atom/node-keytar/issues/482?utm_source=chatgpt.com "Farewell, my dear Keytar · Issue #482 · atom/node-keytar"
[10]: https://github.com/magarcia/cross-keychain "GitHub - magarcia/cross-keychain: Cross-platform secret storage for Node.js applications and CLI usage. · GitHub"
[11]: https://bun.com/docs/runtime/secrets "Secrets - Bun"
[12]: https://github.com/hwchen/keyring-rs/blob/master/.github/workflows/ci.yaml "keyring-rs/.github/workflows/ci.yaml at main · open-source-cooperative/keyring-rs · GitHub"
[13]: https://docs.rs/dbus-secret-service "dbus_secret_service - Rust"
