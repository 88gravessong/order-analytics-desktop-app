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

未签名应用首次打开时，macOS 可能要求在“系统设置 > 隐私与安全性”中确认打开。

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

Windows 原有浏览器启动器 `Launch Order Analytics.cmd` 和 macOS 源码启动器
`Launch Order Analytics.command` 继续保留，作为轻量备用入口。
