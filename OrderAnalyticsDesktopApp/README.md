# Order Analytics Desktop

本地订单分析工具，支持上传 Excel/CSV，自动识别 `Created Time` 日期范围，并导出：

- SKU 指标
- 地区指标
- 月度 SKU 指标
- 日度 SKU 指标
- 结构化订单明细

签收率口径为：`已完成率 + 已送达率`。退款率单独展示，不计入签收率。

## Windows 源码启动

双击 `Launch Order Analytics.cmd`，浏览器会打开：

`http://127.0.0.1:8876/`

## macOS 源码启动

1. 安装 [uv](https://docs.astral.sh/uv/)。
2. 首次下载后，在终端运行：

   ```bash
   chmod +x "Launch Order Analytics.command"
   ```

3. 之后双击 `Launch Order Analytics.command`。

分析结果保存在项目的 `workspace/exports`。

## macOS 桌面包

GitHub Actions 会在原生 macOS runner 上构建 `OrderAnalytics.app`。从仓库的 Releases
按设备下载并解压：

- Apple M 系列芯片：`OrderAnalytics-macOS-Apple-Silicon.zip`
- Intel 芯片：`OrderAnalytics-macOS-Intel.zip`

应用生成的 Excel 默认保存在：

`~/Documents/OrderAnalyticsWorkspace/exports`

未签名应用首次打开时，macOS 可能要求在“系统设置 > 隐私与安全性”中确认打开。

## 开发

```bash
uv sync --dev
uv run python app/scripts/run_service.py --workspace workspace --port 8876
```

本机构建：

```bash
uv run python build_desktop.py
```
