#!/bin/bash

set -euo pipefail

APPDIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE="$APPDIR/workspace"
SERVICE="$APPDIR/app/scripts/run_service.py"
PORT=8876
URL="http://127.0.0.1:${PORT}/"
LOGFILE="$WORKSPACE/service.log"

mkdir -p "$WORKSPACE/generated" "$WORKSPACE/exports"
rm -f "$WORKSPACE/generated/report-data.json" "$WORKSPACE/generated/report-data.js"

if curl --silent --fail --max-time 2 "$URL" >/dev/null 2>&1; then
  open "$URL"
  exit 0
fi

if command -v uv >/dev/null 2>&1; then
  nohup uv run --project "$APPDIR" python "$SERVICE" \
    --workspace "$WORKSPACE" --port "$PORT" --no-open \
    >"$LOGFILE" 2>&1 &
elif command -v python3 >/dev/null 2>&1 && \
     python3 -c "import flask, openpyxl" >/dev/null 2>&1; then
  nohup python3 "$SERVICE" \
    --workspace "$WORKSPACE" --port "$PORT" --no-open \
    >"$LOGFILE" 2>&1 &
else
  osascript -e 'display dialog "请先安装 uv，再重新双击启动。终端命令：curl -LsSf https://astral.sh/uv/install.sh | sh" buttons {"好"} default button "好" with icon caution'
  exit 1
fi

for _ in $(seq 1 40); do
  if curl --silent --fail --max-time 2 "$URL" >/dev/null 2>&1; then
    open "$URL"
    exit 0
  fi
  sleep 0.5
done

osascript -e "display dialog \"订单分析启动失败，请查看日志：$LOGFILE\" buttons {\"好\"} default button \"好\" with icon stop"
exit 1
