#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import argparse
from datetime import datetime
import json
import shutil
from io import BytesIO
from pathlib import Path
import webbrowser

from order_analysis_core import (
    MappingDetectionError,
    analyze_order_files,
    build_region_workbook,
    build_sku_workbook,
    write_mapping_suggestion,
)


def parse_args():
    parser = argparse.ArgumentParser(description="Build a local order analytics HTML + Excel report.")
    parser.add_argument("--inputs", nargs="+", required=True, help="Input order export files.")
    parser.add_argument("--workspace", required=True, help="Output workspace directory.")
    parser.add_argument("--preset", default="cn_en", help="Mapping preset name. Defaults to cn_en.")
    parser.add_argument("--start-date", required=True, help="Inclusive start date in YYYY-MM-DD format.")
    parser.add_argument("--end-date", required=True, help="Inclusive end date in YYYY-MM-DD format.")
    parser.add_argument("--mapping", help="Optional path to a mapping JSON override.")
    return parser.parse_args()


def ensure_workspace(workspace: Path):
    workspace.mkdir(parents=True, exist_ok=True)
    (workspace / "generated").mkdir(parents=True, exist_ok=True)
    (workspace / "exports").mkdir(parents=True, exist_ok=True)


def sync_template(template_dir: Path, workspace: Path):
    for item in template_dir.iterdir():
        target = workspace / item.name
        if item.is_dir():
            if target.exists():
                shutil.rmtree(target)
            shutil.copytree(item, target)
        else:
            shutil.copy2(item, target)


def write_report_data(workspace: Path, analysis: dict, inputs: list[str], args):
    payload = {
        "metadata": {
            "generatedAt": datetime.now().isoformat(timespec="seconds"),
            "preset": args.preset,
            "inputs": inputs,
            "startDate": args.start_date,
            "endDate": args.end_date,
        },
        "summary": analysis["summary"],
        "skuRows": analysis["sku_rows"],
        "regionRows": analysis["region_rows"],
        "diagnostics": analysis["diagnostics"],
    }
    data_path = workspace / "generated" / "report-data.js"
    data_path.write_text(
        "window.ORDER_ANALYTICS_DATA = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    (workspace / "generated" / "diagnostics.json").write_text(
        json.dumps(payload["diagnostics"], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def open_report(index_path: Path):
    try:
        webbrowser.open(index_path.resolve().as_uri())
    except Exception as exc:
        print(f"Failed to open report automatically: {exc}")


def main():
    args = parse_args()
    start_date = datetime.strptime(args.start_date, "%Y-%m-%d").date()
    end_date = datetime.strptime(args.end_date, "%Y-%m-%d").date()
    if start_date > end_date:
        raise SystemExit("start-date 不能晚于 end-date")

    workspace = Path(args.workspace).expanduser().resolve()
    ensure_workspace(workspace)

    input_paths = [Path(path).expanduser().resolve() for path in args.inputs]
    streams = []
    for path in input_paths:
        stream = BytesIO(path.read_bytes())
        stream.name = path.name
        streams.append(stream)

    try:
        analysis = analyze_order_files(
            file_sources=streams,
            start_date=start_date,
            end_date=end_date,
            preset=args.preset,
            mapping_path=args.mapping,
            require_region=True,
        )
    except MappingDetectionError as exc:
        suggestion_path = workspace / "mapping_suggestion.json"
        write_mapping_suggestion(str(suggestion_path), exc.suggestion)
        print(f"Column mapping failed. Suggestion written to: {suggestion_path}")
        print(json.dumps(exc.diagnostics, ensure_ascii=False, indent=2))
        raise SystemExit(2) from exc

    build_sku_workbook(analysis["sku_rows"]).save(workspace / "exports" / "sku_metrics.xlsx")
    build_region_workbook(analysis["region_rows"]).save(workspace / "exports" / "region_metrics.xlsx")

    template_dir = Path(__file__).resolve().parents[1] / "assets" / "web-template"
    sync_template(template_dir, workspace)
    write_report_data(workspace, analysis, [str(path) for path in input_paths], args)
    index_path = workspace / "index.html"
    open_report(index_path)

    print(f"Report ready: {index_path}")
    print(f"SKU workbook: {workspace / 'exports' / 'sku_metrics.xlsx'}")
    print(f"Region workbook: {workspace / 'exports' / 'region_metrics.xlsx'}")


if __name__ == "__main__":
    main()
