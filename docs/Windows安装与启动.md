# Windows 安装与启动

这份文档面向两类场景：

- 你要在 Windows 上跑 `QA小灶` 的 GUI 开发模式
- 你要给测试同事一份更直接的安装说明

如果你只是最终用户，不建议自己跑开发模式；更推荐直接使用打包好的安装包。

## 1. 先安装基础环境

### Node.js

建议安装 Node.js 20 或更新版本。

安装后确认：

```powershell
node -v
npm -v
```

### Rust

建议安装 Rust 的 Windows MSVC 工具链版本：

```powershell
rustup default stable-x86_64-pc-windows-msvc
rustup show
```

如果还没有安装 Rust，可以先安装 `rustup-init.exe`，然后确认当前默认工具链是 `stable-x86_64-pc-windows-msvc`。

### Visual Studio C++ Build Tools

这是 Windows 上编译 Tauri / Rust 桌面应用时最容易漏掉的一步。

至少需要安装：

- `MSVC v143 - VS 2022 C++ x64/x86 生成工具`
- `Windows 11 SDK`

如果缺这两个组件，Tauri 桌面端基本无法正常编译。

## 2. 拉取项目并安装依赖

```powershell
cd apps/distill-studio
npm install
```

说明：

- 第一次执行 `npm install` 时，速度取决于当前网络和 npm 源
- 如果后续还要跑 `tauri dev`，Cargo 会继续下载和编译 Rust 依赖

## 3. 准备 `.env.local`

先复制示例文件：

```powershell
copy .env.local.example .env.local
```

然后把 `.env.local` 里的内容改成你自己的 API key，例如：

```text
DASHSCOPE_API_KEY="your-real-api-key"
```

当前项目的启动脚本已经会自动读取 `.env.local`，所以：

- 不需要再手动执行 `source ./.env.local`
- 不要求必须在 Git Bash / WSL 中运行

PowerShell、CMD、Git Bash 都可以直接执行启动命令。

## 4. 启动 GUI 开发模式

```powershell
cd apps/distill-studio
npm run tauri:dev
```

说明：

- 启动脚本会自动把 `.env.local` 中的变量注入到 Tauri 开发模式
- 开发模式下，输出目录默认写到项目根目录下的 `output/`
- 本地配置档案默认写到 `config/local/profiles/`

## 5. 为什么第一次启动会很慢

如果是全新 Windows 环境，第一次执行：

```powershell
npm run tauri:dev
```

很可能要花十几分钟到数十分钟，原因通常是：

- 首次下载 Rust crates
- 首次编译 Tauri / Wry / Tokio 等依赖
- 首次生成本地 `target/` 缓存

这属于冷启动成本，不是项目逻辑 bug。

后续同一台机器再次启动，一般会明显变快。

## 6. 常见问题

### 1. 提示缺少 C++ 编译器或 linker

优先检查：

- 是否安装了 Visual Studio 2022 C++ Build Tools
- 是否勾选了 `MSVC v143`
- 是否安装了 `Windows 11 SDK`

### 2. 提示 Rust 目标不对

执行：

```powershell
rustup show
rustup default stable-x86_64-pc-windows-msvc
```

确保当前默认工具链是 `msvc`，不是 `gnu`。

### 3. API key 看起来没有生效

优先检查：

- `.env.local` 是否真的存在于项目根目录
- key 是否写成了 `KEY="value"` 这种格式
- 是否把示例值忘记替换成真实值

### 4. 第一次启动太慢，是不是程序坏了

通常不是。

如果终端还在持续输出 Cargo 编译日志，说明大概率只是首次编译很慢。

## 7. 推荐给测试同事的最短步骤

如果你要把最短说明发给测试同事，可以直接发下面这段：

```text
1. 安装 Node.js、Rust（MSVC 版本）、Visual Studio 2022 C++ Build Tools、Windows 11 SDK
2. 进入 apps/distill-studio
3. 复制 .env.local.example 为 .env.local，并填入自己的 API key
4. 运行 npm install
5. 运行 npm run tauri:dev
6. 第一次启动很慢是正常现象
```
