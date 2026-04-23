# QA小灶（distill-studio）

`distill-studio` 是一个面向高吞吐 QA 蒸馏的桌面应用与 Rust 工具集。

它的目标不是做重型、强人工参与的数据生产线，而是让用户输入一段研究主题，配置模型接口后，快速批量生成可继续筛选、训练和迭代的 QA 数据。

当前项目包含两条并行能力：

- GUI：基于 `Tauri + TypeScript` 的跨平台桌面应用，适合在 macOS、Linux、Windows 上直接操作
- CLI：基于 Rust 的批处理入口，适合脚本化、调试和后续扩展
- Updater：已接入 Tauri v2 应用内更新基础能力，可进一步接到 `GitHub Releases + latest.json`

## 项目结构

```text
apps/distill-studio/
  crates/
    distill-core/             共享数据结构、主题规划、打包逻辑
    distill-cli/              命令行入口
    distill-runtime/          生成阶段运行时与 provider 调用
  src/                        Tauri 前端
  src-tauri/                  Tauri Rust 后端
  config/
    local/                    本地开发配置目录（不应提交真实密钥）
  docs/                       中文说明文档
  examples/                   示例配置
```

## 当前能力

- 主题输入、Topic 预览
- 领域标签选择与自定义标签
- Provider 预设与模型参数配置
- 本地配置档案保存/加载
- GUI 中直接填写 API key，并默认隐藏显示
- 运行进度遥测、结果摘要、输出目录快捷打开
- `openai-compatible` 与 `stub` 两类 provider
- 生成结果打包为 `dataset.jsonl`

## 开发环境启动

如果你主要在 Windows 上安装和启动，建议先看：

- [安装包使用说明](./docs/安装包使用说明.md)
- [Windows 安装与启动](./docs/Windows安装与启动.md)

### 1. 安装依赖

```bash
cd apps/distill-studio
npm install
```

如果本机还没有 Rust 工具链，需要先安装 Rust。

Windows 额外前置要求：

- Rust 目标建议使用 `stable-x86_64-pc-windows-msvc`
- 需要安装 Visual Studio 2022 C++ Build Tools
- 至少勾选：
  - `MSVC v143 - VS 2022 C++ x64/x86 生成工具`
  - `Windows 11 SDK`

这些不是本项目自己的特殊要求，而是 `Tauri + Rust` 在 Windows 上的常规编译前提。如果缺这套 MSVC 工具链，桌面端编译基本起不来。

### 2. 启动 GUI 开发模式

```bash
cd apps/distill-studio
npm run tauri:dev
```

说明：

- `npm run tauri:dev` 现在会自动读取项目根目录下的 `.env.local`
- `.env.local` 建议从 `.env.local.example` 复制后修改
- `.env.local` 兼容两种写法：
  - `DASHSCOPE_API_KEY="..."`
  - `export DASHSCOPE_API_KEY="..."`
- 开发模式下，默认相对输出目录 `./output/...` 会写入当前项目根目录
- 开发模式下，本地配置档案默认写入 `config/local/profiles/`
- 这些目录都已经通过 `.gitignore` 排除，不会进入 GitHub

Windows 说明：

- 之前需要在 Git Bash / WSL 里先执行 `source ./.env.local`
- 现在已经不再依赖 Bash 的 `source`；PowerShell、CMD、Git Bash 都可以直接运行 `npm run tauri:dev`
- 但第一次在全新 Windows 环境启动时，Tauri 会拉取并编译大量 Rust crates，耗时很长是正常现象

### 3. 首次冷启动说明

如果是全新机器，第一次执行 `npm run tauri:dev` 很可能需要十几分钟到数十分钟，尤其在 Windows 上更明显。常见原因：

- 首次下载 Cargo crates
- 首次编译 Tauri / Wry / Tokio 等 Rust 依赖
- 首次生成本地 `target/` 缓存

这类耗时主要是冷启动成本，不是项目逻辑 bug。后续同机再次启动通常会明显变快。

如果只是给最终用户使用，不建议让用户自己跑开发模式；应该直接分发构建好的安装包。

## CLI 示例

```bash
cd apps/distill-studio

cargo run -p distill-cli -- init \
  --prompt "Soybean seed oil and protein improvement under density management" \
  --output ./output/topic.json

cargo run -p distill-cli -- plan \
  --topic ./output/topic.json \
  --limit 200 \
  --output ./output/plans.json

cargo run -p distill-cli -- write-default-config \
  --target-count 1000 \
  --output ./output/generate_config.json
```

## 模型与密钥配置

GUI 当前支持直接填写 API key。为了兼顾你的本机使用与仓库发布，项目采用以下约定：

- 真实密钥只保存在本地配置文件或本地环境变量中
- 真实密钥不写入运行输出的 `generate_config.json`
- 真实密钥不进入 Git 仓库
- 打包后的发布版不再依赖项目目录内的本地配置，而会转到系统配置目录

推荐方式：

- 开发期：GUI 中填写 API key，保存到本地 profile
- 脚本/CLI：使用 `.env.local` 或 shell 环境变量

示例文件：

- `.env.local.example`
- `config/examples/generate_config.qwen.example.json`
- `config/examples/generate_config.qwen_canary.example.json`
- `config/examples/default.profile.example.json`

## 开发环境与发布版本的差异

为了不影响你本机当前工作流，同时又能为正式发布做准备，路径策略已经分成两套：

- 开发环境
  - 配置档案：`config/local/profiles/`
  - 旧版兼容配置：`config/local/gui.pipeline.json`
  - 运行输出：`./output/...`
- 发布版本
  - 配置档案：系统 `app config` 目录
  - 运行输出：系统 `app data` 目录下的 `workspace/`

这样做的结果是：

- 你现在本机继续按原来的方式用，不需要迁移
- 发布给别人时，不会把你的项目路径、密钥文件和运行产物一并带出去

## 发布前建议执行

```bash
cd apps/distill-studio
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri:build
```

发布前还应检查：

- `.env.local` 没有被加入版本库
- `config/local/profiles/` 中的真实密钥没有被提交
- `config/local/gui.pipeline.json` 没有被提交
- `output/`、`src-tauri/output/`、`dist/`、`target/` 没有被提交

详细清单见：

- [安装包使用说明](./docs/安装包使用说明.md)
- [Windows 安装与启动](./docs/Windows安装与启动.md)
- [Windows 安装包发布流程](./docs/Windows安装包发布流程.md)
- [发布前准备](./docs/发布前准备.md)
- [本地配置与密钥管理](./docs/本地配置与密钥管理.md)
- [自动更新](./docs/自动更新.md)
- [测试问题收口](./docs/测试问题收口.md)

## 自动更新与发布工作流

项目已经提供自动更新基础接入和 GitHub Actions 发布脚手架：

- 应用内 `检查更新`
- 本地 updater 覆盖配置：`config/local/updater.json`
- GitHub Actions 工作流：
  - `.github/workflows/release.yml`

发布链路默认约定：

- Git tag 格式：`app-v*`
- updater endpoint：`https://github.com/<owner>/<repo>/releases/latest/download/latest.json`
- GitHub Actions 需要的 secrets：
  - `TAURI_SIGNING_PRIVATE_KEY`
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
  - `TAURI_UPDATER_PUBLIC_KEY`

本地手动生成 release 配置并打包的命令：

```bash
cd /Users/kentnf/projects/ai4s/distill-studio
npm run tauri:build:release
```

说明：

- 当前脚本会优先自动读取本地 `config/local/updater.json`
- 也会尝试读取 `~/.tauri/distill-studio.key` 和 `~/.tauri/distill-studio.key.pub`
- 如果私钥设置了密码，仍需要通过环境变量或 `.env.local` 提供 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

发布前还可以先跑一次本地预检查：

```bash
cd /Users/kentnf/projects/ai4s/distill-studio
npm run release:preflight
```

现在也可以直接跑一键发布前准备：

```bash
cd /Users/kentnf/projects/ai4s/distill-studio
npm run release:prepare
```

它会依次执行构建、`cargo check`、发布预检查和发布摘要生成。

真正打包完成后，还可以再跑：

```bash
cd /Users/kentnf/projects/ai4s/distill-studio
npm run release:assets
```

它会自动扫描 `target/release/bundle/`，列出当前版本的安装包和 updater 相关产物。

如果本机已经安装并登录 `gh`，还可以直接同步 GitHub secrets：

```bash
cd /Users/kentnf/projects/ai4s/distill-studio
npm run github:sync-secrets
```

## Git 发布建议

如果这是一个新仓库，建议在 `apps/distill-studio` 目录内初始化并发布：

```bash
cd apps/distill-studio
git init
git add .
git commit -m "init: prepare distill-studio for release"
git remote add origin git@github.com:AI4S-YB/distill-studio.git
git branch -M main
git push -u origin main
```

在执行 `git add .` 之前，可以先运行：

```bash
git status --short --ignored
```

确认本地密钥、profile 和运行产物确实处于 ignored 状态。
