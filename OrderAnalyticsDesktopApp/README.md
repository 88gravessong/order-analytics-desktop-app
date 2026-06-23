# Order Analytics Client

Electron 桌面客户端，内置 Python 分析引擎。启动后直接显示订单分析窗口，不需要手动打开浏览器或管理端口。

支持上传 Excel/CSV，自动识别 `Created Time` 日期范围，并导出：

- SKU 指标
- 地区指标
- 月度 SKU 指标
- 日度 SKU 指标
- 结构化订单明细

签收率口径为：`已完成率 + 已送达率`。退款率单独展示，不计入签收率。

## 下载客户端

从 GitHub Releases 下载对应安装包：

- Windows：`OrderAnalytics-Client-Windows-*.exe`
- Apple M 系列芯片：`OrderAnalytics-Client-macOS-*-arm64.dmg`
- Intel Mac：`OrderAnalytics-Client-macOS-*-x64.dmg`

应用生成的 Excel 保存在：

`~/Documents/OrderAnalyticsWorkspace/exports`

Windows 安装器为机器级安装。安装到 `Program Files` 等受保护目录时会自动请求管理员权限。

macOS 客户端使用临时签名，但未经过 Apple Developer ID 公证。首次打开如果被
Gatekeeper 阻止：

1. 把应用拖到“应用程序”。
2. 尝试打开一次并点击“取消”。
3. 打开“系统设置 > 隐私与安全性”，点击“仍要打开”。

如果系统错误地提示应用“已损坏”，在终端执行：

```bash
xattr -dr com.apple.quarantine "/Applications/Order Analytics.app"
open "/Applications/Order Analytics.app"
```

这是移除浏览器下载附加的隔离属性，不会修改应用内容。

## 源码运行

```bash
uv sync --dev
uv run python build_desktop.py
cd client
npm install
npm start
```

## 构建客户端

```bash
uv run python build_desktop.py
cd client
npm run dist -- --win --x64
# 或 npm run dist -- --mac --arm64
```

## 发布与自动更新

已安装的 Windows 和 macOS 客户端会在启动后自动检查 GitHub Releases：

- 有新版本时自动在后台下载，并显示下载进度。
- 下载完成后可立即重启安装，也可稍后退出应用时安装。
- 开发模式（`npm start`）不会请求更新服务。
- 更新日志写入 Electron 用户数据目录下的 `updater.log`。

发布新版本时，`client/package.json` 与 `pyproject.toml` 的版本号必须一致，
Git 标签也必须使用相同版本，例如三处均为 `1.2.0` / `v1.2.0`。推荐流程：

```bash
# 1. 修改并测试代码
# 2. 同步更新 client/package.json、client/package-lock.json、
#    pyproject.toml 和 uv.lock 中的版本号
git commit -am "发布 v1.2.0"
git tag v1.2.0
git push origin main
git push origin v1.2.0
```

标签会触发 `.github/workflows/build-desktop.yml`，分别构建：

- Windows x64：`latest.yml`、NSIS 安装器及 blockmap
- macOS Apple Silicon：`latest-arm64-mac.yml`、DMG、ZIP 及 blockmap
- macOS Intel：`latest-x64-mac.yml`、DMG、ZIP 及 blockmap

工作流会把安装包和更新元数据一起上传到同一个 GitHub Release。不要手动删除
Release 中的 `.yml` 或 `.blockmap` 文件，否则客户端无法发现更新或执行差分下载。

### 验证自动更新

1. 安装并启动旧版本客户端，确认当前版本可正常运行。
2. 发布一个版本号更高的新标签，并等待 GitHub Actions 三个平台全部完成。
3. 检查 Release 同时包含安装包、ZIP、更新 `.yml` 和 `.blockmap`。
4. 重新启动旧版本客户端，确认依次出现检查、发现版本、下载进度和重启安装提示。
5. 重启安装后确认新版本号、Python 分析服务和导出功能正常。

macOS 自动更新要求应用经过代码签名。当前构建使用临时签名，可用于内部验证，
但面向更广泛团队稳定分发时，建议配置 Apple Developer ID 签名与公证。

Windows 原有浏览器启动器 `Launch Order Analytics.cmd` 和 macOS 源码启动器
`Launch Order Analytics.command` 继续保留，作为轻量备用入口。
