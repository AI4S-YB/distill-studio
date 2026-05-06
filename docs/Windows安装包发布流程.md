# Windows 安装包发布流程

这份文档面向项目维护者，不面向最终用户。

目标是把当前“第一档方案”固定下来：

- 最终用户只下载安装包
- 不接触 Rust / Node / Visual Studio
- 不跑开发模式
- 第一次打开时只需要做一次模型 API key 配置

如果发布前要核对此前测试提出的问题是否已经收口，可以同时参考：

- `docs/测试问题收口.md`

## 1. 第一档方案的边界

当前版本的发布思路是：

- 客户端仍然直连第三方模型服务
- 不做实验室统一后端
- 不做零配置联网
- 只把“安装体验”做成普通桌面软件

这意味着：

- 安装可以做到像普通软件一样
- 更新可以做到应用内自动更新
- 但第一次使用仍需要用户自己填一次 API key

## 2. 给最终用户的交付物

对 Windows 最终用户，原则上只交付这些内容：

- Windows 安装包
- 一份简短的使用说明

通常至少包括以下之一：

- `.exe` 安装包
- `.msi` 安装包

如果自动更新已经接通，还需要随 release 一起发布：

- `latest.json`
- updater 产物

最终用户不应接触这些内容：

- 源码仓库
- `npm run tauri:dev`
- `.env.local`
- Rust / Node / Visual Studio 安装说明

## 3. 发布前检查

建议先用脚本统一升版本，不要手改多个文件：

```bash
cd apps/distill-studio
npm run release:bump -- 0.1.5
```

然后建议直接执行一键发布前准备：

```bash
cd apps/distill-studio
npm run release:prepare
```

它会顺序执行：

- `npm run build`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `npm run release:preflight`
- `npm run release:summary`

如果你要单独排查某一步，也可以继续分别执行。

完整拆开的命令如下：

```bash
cd apps/distill-studio
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run release:preflight
npm run release:summary
```

重点确认：

- `.env.local` 没有被提交
- `config/local/profiles/` 没有被提交
- `output/`、`dist/`、`target/` 没有被提交
- 版本号已经一致
- 本地工作区干净
- `release:summary` 生成的版本号、tag、安装包名和 `latest.json` 地址正确

## 4. 准备自动更新配置

如果本次要发布“可自动更新”的正式版本，需要先准备：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`（如果私钥有密码）
- `TAURI_UPDATER_PUBLIC_KEY`
- `TAURI_UPDATER_ENDPOINT`

当前默认 updater endpoint 约定是：

```text
https://github.com/AI4S-YB/distill-studio/releases/latest/download/latest.json
```

如果本机已经登录 `gh`，也可以直接运行：

```bash
npm run github:sync-secrets
```

它会同步：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_UPDATER_PUBLIC_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`（仅当当前环境或 `.env.local` 已提供时）

如果只是本地测试打包、不需要自动更新，也可以先不走正式 release 流程。

## 5. 本地打 Windows 安装包

在可用的 Windows 打包环境中执行：

```bash
cd apps/distill-studio
npm run tauri:build:release
```

说明：

- Windows 下建议在 PowerShell 或 CMD 中使用等价的环境变量写法
- 现在本地 `tauri:build:release` 会优先自动读取：
  - `config/local/updater.json`
  - 用户目录下的 `.tauri` 本地密钥
- 如果本地私钥设置了密码，仍建议先在环境变量或 `.env.local` 中提供：
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- 这一步内部仍会调用：
  - `npm run updater:prepare-config`
  - `tauri build --config src-tauri/tauri.release.conf.json`

打包完成后，安装包通常会出现在：

```text
target/release/bundle/
```

建议紧接着执行：

```bash
cd apps/distill-studio
npm run release:assets
```

它会自动扫描 bundle 目录，把安装包、`latest.json` 和 updater 签名产物整理成一份清单，写到 `dist/release-assets-v<version>.md`。

## 6. GitHub Releases 发布方式

推荐使用 GitHub Releases。

好处是：

- HTTPS 地址天然可用
- 可以直接承载安装包和 `latest.json`
- 与当前 updater 约定一致

建议流程：

1. 确认版本号
2. 提交并推送代码
3. 打 tag，例如：

```bash
git tag app-v0.2.0
git push origin app-v0.2.0
```

4. 通过 GitHub Actions 或本地手动发布 release 资产

## 7. 给最终用户的说明应该是什么

最终用户拿到的说明应尽量短，只保留这些信息：

1. 下载并安装 `QA小灶` 安装包
2. 第一次打开后，在 `设置` 中填写一次 API key
3. 后续直接使用
4. 如有新版本，在应用内点击 `检查更新`

不应把这些内容发给最终用户：

- Rust 安装
- Node 安装
- Visual Studio C++ 工具链
- `npm run tauri:dev`
- `.env.local`
- Git Bash / WSL

## 8. 内部推荐分工

如果后续由多人协作，建议把职责分开：

- 产品/测试同事：只验证安装包和用户流程
- 开发同事：负责源码、打包、签名、自动更新配置
- 发布同事：负责 GitHub Releases 与版本公告

## 9. 第一档方案下最重要的产品原则

后续所有改动都尽量遵守这几条：

- 最终用户只碰安装包，不碰源码
- 模型配置最多做一次，不要反复要求填写
- 更新尽量通过应用内完成
- 发布版与开发模式文档彻底分开

## 10. 当前最短内部发布清单

如果只想看最短步骤，可以按这个执行：

```text
1. npm run release:bump -- 0.1.5
2. npm run release:prepare
3. npm run tauri:build:release
4. 上传安装包和 latest.json 到 GitHub Releases
5. 把“安装包使用说明”发给最终用户
```
