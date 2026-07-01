#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import argparse
from datetime import datetime
from io import BytesIO
import json
from pathlib import Path
import sys
import threading
import time
from uuid import uuid4
import webbrowser

from flask import Flask, jsonify, request, send_from_directory

from order_analysis_core import (
    MappingDetectionError,
    analyze_prepared_order_cache,
    build_daily_workbook,
    build_monthly_workbook,
    build_region_workbook,
    build_sku_workbook,
    build_structured_workbook,
    prepare_order_cache,
    write_mapping_suggestion,
)


if getattr(sys, 'frozen', False):
    APP_ROOT = Path(getattr(sys, '_MEIPASS')) / 'app'
else:
    APP_ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_DIR = APP_ROOT / 'assets' / 'web-template'
DEFAULT_PORT = 8765
DATE_BASIS = 'Created Time'
CACHE_TTL_SECONDS = 30 * 60
MAX_CACHED_UPLOADS = 4
DATE_MODE_LABELS = {
    'auto': 'auto',
    'manual': 'manual',
    'full_range': 'full_range',
    'today': 'today',
    'last_7_days': 'last_7_days',
    'last_30_days': 'last_30_days',
    'current_month': 'current_month',
    'custom': 'custom',
}


def parse_args():
    parser = argparse.ArgumentParser(description='Run the local order analytics web service.')
    parser.add_argument('--workspace', help='Workspace directory for generated outputs. Defaults to ./order-analysis-service')
    parser.add_argument('--preset', default='cn_en', help='Mapping preset name. Defaults to cn_en.')
    parser.add_argument('--mapping', help='Optional path to a mapping JSON override.')
    parser.add_argument('--host', default='127.0.0.1', help='Host to bind. Defaults to 127.0.0.1.')
    parser.add_argument('--port', type=int, default=DEFAULT_PORT, help=f'Port to bind. Defaults to {DEFAULT_PORT}.')
    parser.add_argument('--inputs', nargs='*', help='Optional files to analyze immediately after the service starts.')
    parser.add_argument('--start-date', help='Optional manual start date in YYYY-MM-DD format.')
    parser.add_argument('--end-date', help='Optional manual end date in YYYY-MM-DD format.')
    parser.add_argument('--no-open', action='store_true', help='Do not open the browser automatically.')
    return parser.parse_args()


def ensure_workspace(workspace: Path):
    workspace.mkdir(parents=True, exist_ok=True)
    (workspace / 'exports').mkdir(parents=True, exist_ok=True)
    (workspace / 'generated').mkdir(parents=True, exist_ok=True)


def build_empty_payload(preset: str) -> dict:
    return {
        'metadata': {
            'generatedAt': None,
            'preset': preset,
            'inputs': [],
            'startDate': None,
            'endDate': None,
            'dateMode': None,
            'dateBasis': DATE_BASIS,
            'detectedStartDate': None,
            'detectedEndDate': None,
        },
        'summary': {
            'total_files': 0,
            'total_orders': 0,
            'sku_count': 0,
            'region_count': 0,
            'month_count': 0,
            'day_count': 0,
        },
        'skuRows': [],
        'regionRows': [],
        'monthlyRows': [],
        'dailyRows': [],
        'diagnostics': {
            'files': [],
            'unknown_statuses': [],
            'matched_columns': {},
            'preset': preset,
        },
    }


def normalize_payload(payload: dict, preset: str) -> dict:
    normalized = build_empty_payload(preset)
    normalized.update(payload or {})
    normalized['metadata'].update((payload or {}).get('metadata', {}))
    normalized['summary'].update((payload or {}).get('summary', {}))
    normalized['diagnostics'].update((payload or {}).get('diagnostics', {}))
    normalized['skuRows'] = (payload or {}).get('skuRows', normalized['skuRows'])
    normalized['regionRows'] = (payload or {}).get('regionRows', normalized['regionRows'])
    normalized['monthlyRows'] = (payload or {}).get('monthlyRows', normalized['monthlyRows'])
    normalized['dailyRows'] = (payload or {}).get('dailyRows', normalized['dailyRows'])

    metadata = normalized['metadata']
    metadata['dateBasis'] = metadata.get('dateBasis') or DATE_BASIS
    metadata['detectedStartDate'] = metadata.get('detectedStartDate') or metadata.get('startDate')
    metadata['detectedEndDate'] = metadata.get('detectedEndDate') or metadata.get('endDate')
    normalized['diagnostics']['preset'] = normalized['diagnostics'].get('preset') or preset
    return normalized


def write_report_payload(workspace: Path, payload: dict):
    generated_dir = workspace / 'generated'
    (generated_dir / 'report-data.json').write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding='utf-8',
    )
    (generated_dir / 'report-data.js').write_text(
        'window.ORDER_ANALYTICS_DATA = ' + json.dumps(payload, ensure_ascii=False, indent=2) + ';\n',
        encoding='utf-8',
    )
    (generated_dir / 'diagnostics.json').write_text(
        json.dumps(payload.get('diagnostics', {}), ensure_ascii=False, indent=2),
        encoding='utf-8',
    )


def load_existing_payload(workspace: Path, preset: str) -> dict:
    report_path = workspace / 'generated' / 'report-data.json'
    if not report_path.exists():
        return build_empty_payload(preset)
    return normalize_payload(json.loads(report_path.read_text(encoding='utf-8')), preset)


def _clone_streams(file_bytes: list[tuple[str, bytes]]) -> list[BytesIO]:
    streams = []
    for name, raw in file_bytes:
        stream = BytesIO(raw)
        stream.name = name
        streams.append(stream)
    return streams


def build_prepared_upload(file_bytes: list[tuple[str, bytes]], preset: str, mapping_path: str | None) -> dict:
    streams = _clone_streams(file_bytes)
    prepared = prepare_order_cache(
        file_sources=streams,
        preset=preset,
        mapping_path=mapping_path,
        require_region=True,
    )
    now = time.monotonic()
    return {
        'token': uuid4().hex,
        'created_at': now,
        'last_accessed_at': now,
        'raw_files': [
            {
                'name': name,
                'size': len(raw),
                'bytes': raw,
            }
            for name, raw in file_bytes
        ],
        'prepared': prepared,
    }


def purge_upload_cache(upload_cache: dict[str, dict]) -> None:
    now = time.monotonic()
    expired_tokens = [
        token
        for token, entry in upload_cache.items()
        if now - entry['last_accessed_at'] > CACHE_TTL_SECONDS
    ]
    for token in expired_tokens:
        upload_cache.pop(token, None)

    while len(upload_cache) > MAX_CACHED_UPLOADS:
        oldest_token = min(upload_cache.items(), key=lambda item: item[1]['last_accessed_at'])[0]
        upload_cache.pop(oldest_token, None)


def store_upload_cache(upload_cache: dict[str, dict], entry: dict) -> dict:
    purge_upload_cache(upload_cache)
    upload_cache[entry['token']] = entry
    purge_upload_cache(upload_cache)
    return entry


def get_upload_cache(upload_cache: dict[str, dict], token: str) -> dict | None:
    purge_upload_cache(upload_cache)
    entry = upload_cache.get(token)
    if entry is None:
        return None
    entry['last_accessed_at'] = time.monotonic()
    return entry


def serialize_inspection(inspection: dict, upload_token: str | None = None) -> dict:
    return {
        'startDate': inspection['start_date'].isoformat() if inspection['start_date'] else None,
        'endDate': inspection['end_date'].isoformat() if inspection['end_date'] else None,
        'files': inspection['files'],
        'matchedColumns': inspection.get('matched_columns', {}),
        'dateBasis': inspection.get('date_basis', DATE_BASIS),
        'uploadToken': upload_token,
    }


def parse_date_window(start_text: str | None, end_text: str | None, inspection: dict, require_dates: bool = False):
    detected_start = inspection['start_date']
    detected_end = inspection['end_date']
    if detected_start is None or detected_end is None:
        raise ValueError('无法从当前表格自动识别 Created Time 日期范围，请检查数据后重试')

    if start_text or end_text:
        if not start_text or not end_text:
            raise ValueError('手动日期筛选时，start-date 和 end-date 必须同时提供')
        start_date = datetime.strptime(start_text, '%Y-%m-%d').date()
        end_date = datetime.strptime(end_text, '%Y-%m-%d').date()
        mode = 'manual'
    elif require_dates:
        raise ValueError('请先选择有效的日期范围')
    else:
        start_date = detected_start
        end_date = detected_end
        mode = 'auto'

    if start_date > end_date:
        raise ValueError('start-date 不能晚于 end-date')
    if start_date < detected_start or end_date > detected_end:
        raise ValueError(
            f'日期必须位于当前文件的 {DATE_BASIS} 范围内: {detected_start.isoformat()} 到 {detected_end.isoformat()}'
        )
    return start_date, end_date, mode


def analyze_inputs(
    workspace: Path,
    preset: str,
    prepared: dict,
    input_names: list[str],
    start_text: str | None,
    end_text: str | None,
    date_mode: str | None = None,
) -> dict:
    inspection = {
        'start_date': prepared.get('start_date'),
        'end_date': prepared.get('end_date'),
        'files': prepared.get('files', []),
        'matched_columns': prepared.get('matched_columns', {}),
        'date_basis': prepared.get('date_basis', DATE_BASIS),
    }
    allow_detected_full_range = not start_text and not end_text
    start_date, end_date, inferred_mode = parse_date_window(
        start_text,
        end_text,
        inspection,
        require_dates=not allow_detected_full_range,
    )
    requested_mode = DATE_MODE_LABELS.get(date_mode or '')
    effective_mode = requested_mode or inferred_mode
    analysis = analyze_prepared_order_cache(prepared, start_date=start_date, end_date=end_date)
    analysis['diagnostics']['inspected_files'] = prepared.get('files', [])
    analysis['diagnostics']['date_mode'] = date_mode

    build_sku_workbook(analysis['sku_rows']).save(workspace / 'exports' / 'sku_metrics.xlsx')
    build_region_workbook(analysis['region_rows']).save(workspace / 'exports' / 'region_metrics.xlsx')
    build_monthly_workbook(analysis['monthly_rows'], analysis['monthly_sku_rows']).save(workspace / 'exports' / 'monthly_metrics.xlsx')
    build_daily_workbook(analysis['daily_rows'], analysis['daily_sku_rows']).save(workspace / 'exports' / 'daily_metrics.xlsx')
    build_structured_workbook(analysis['structured_rows']).save(workspace / 'exports' / 'structured_orders.xlsx')

    payload = {
        'metadata': {
            'generatedAt': datetime.now().isoformat(timespec='seconds'),
            'preset': preset,
            'inputs': input_names,
            'startDate': start_date.isoformat(),
            'endDate': end_date.isoformat(),
            'dateMode': effective_mode,
            'dateBasis': inspection.get('date_basis', DATE_BASIS),
            'detectedStartDate': inspection['start_date'].isoformat() if inspection['start_date'] else None,
            'detectedEndDate': inspection['end_date'].isoformat() if inspection['end_date'] else None,
        },
        'summary': analysis['summary'],
        'skuRows': analysis['sku_rows'],
        'regionRows': analysis['region_rows'],
        'monthlyRows': analysis['monthly_rows'],
        'dailyRows': analysis['daily_rows'],
        'diagnostics': analysis['diagnostics'],
    }
    payload = normalize_payload(payload, preset)
    write_report_payload(workspace, payload)
    return payload


def create_app(workspace: Path, preset: str, mapping_path: str | None) -> Flask:
    app = Flask(__name__)
    report_lock = threading.Lock()
    cache_lock = threading.Lock()
    upload_cache: dict[str, dict] = {}

    @app.get('/')
    def index():
        return send_from_directory(TEMPLATE_DIR, 'index.html')

    @app.get('/app.js')
    def app_js():
        return send_from_directory(TEMPLATE_DIR, 'app.js')

    @app.get('/styles.css')
    def styles_css():
        return send_from_directory(TEMPLATE_DIR, 'styles.css')

    @app.get('/favicon.svg')
    def favicon():
        return send_from_directory(TEMPLATE_DIR, 'favicon.svg')

    @app.get('/generated/<path:filename>')
    def generated_file(filename: str):
        return send_from_directory(workspace / 'generated', filename)

    @app.get('/exports/<path:filename>')
    def exported_file(filename: str):
        return send_from_directory(workspace / 'exports', filename)

    @app.get('/api/report')
    def current_report():
        return jsonify(load_existing_payload(workspace, preset))

    @app.post('/api/inspect')
    def inspect_uploaded_files():
        uploaded_files = request.files.getlist('files')
        if not uploaded_files:
            return jsonify({'error': '请先上传至少一个表格文件'}), 400

        file_bytes = []
        for uploaded in uploaded_files:
            name = (uploaded.filename or '').strip()
            if not name:
                continue
            raw = uploaded.read()
            if not raw:
                continue
            file_bytes.append((name, raw))

        if not file_bytes:
            return jsonify({'error': '上传文件为空，无法识别日期范围'}), 400

        try:
            cached_upload = build_prepared_upload(file_bytes=file_bytes, preset=preset, mapping_path=mapping_path)
            with cache_lock:
                store_upload_cache(upload_cache, cached_upload)
        except MappingDetectionError as exc:
            suggestion_path = workspace / 'mapping_suggestion.json'
            write_mapping_suggestion(str(suggestion_path), exc.suggestion)
            return jsonify(
                {
                    'error': str(exc),
                    'diagnostics': exc.diagnostics,
                    'mappingSuggestion': exc.suggestion,
                    'mappingSuggestionPath': str(suggestion_path),
                }
            ), 400
        except ValueError as exc:
            return jsonify({'error': str(exc)}), 400
        except Exception as exc:
            return jsonify({'error': f'日期识别失败: {exc}'}), 500

        return jsonify(serialize_inspection(cached_upload['prepared'], upload_token=cached_upload['token']))

    @app.post('/api/analyze')
    def analyze_uploaded_files():
        try:
            upload_token = (request.form.get('upload_token') or '').strip()
            if upload_token:
                with cache_lock:
                    cached_upload = get_upload_cache(upload_cache, upload_token)
                if cached_upload is None:
                    raise ValueError('文件缓存已失效，请重新选择文件')
                prepared = cached_upload['prepared']
                input_names = [file_info['name'] for file_info in cached_upload['raw_files']]
            else:
                uploaded_files = request.files.getlist('files')
                if not uploaded_files:
                    return jsonify({'error': '请先上传至少一个表格文件'}), 400

                file_bytes = []
                for uploaded in uploaded_files:
                    name = (uploaded.filename or '').strip()
                    if not name:
                        continue
                    raw = uploaded.read()
                    if not raw:
                        continue
                    file_bytes.append((name, raw))

                if not file_bytes:
                    return jsonify({'error': '上传文件为空，无法分析'}), 400

                cached_upload = build_prepared_upload(file_bytes=file_bytes, preset=preset, mapping_path=mapping_path)
                with cache_lock:
                    store_upload_cache(upload_cache, cached_upload)
                prepared = cached_upload['prepared']
                input_names = [file_info['name'] for file_info in cached_upload['raw_files']]

            with report_lock:
                payload = analyze_inputs(
                    workspace=workspace,
                    preset=preset,
                    prepared=prepared,
                    input_names=input_names,
                    start_text=request.form.get('start_date') or None,
                    end_text=request.form.get('end_date') or None,
                    date_mode=request.form.get('date_mode') or None,
                )
        except MappingDetectionError as exc:
            suggestion_path = workspace / 'mapping_suggestion.json'
            write_mapping_suggestion(str(suggestion_path), exc.suggestion)
            return jsonify(
                {
                    'error': str(exc),
                    'diagnostics': exc.diagnostics,
                    'mappingSuggestion': exc.suggestion,
                    'mappingSuggestionPath': str(suggestion_path),
                }
            ), 400
        except ValueError as exc:
            return jsonify({'error': str(exc)}), 400
        except Exception as exc:
            return jsonify({'error': f'分析失败: {exc}'}), 500

        return jsonify({'report': payload})

    return app


def open_browser(host: str, port: int):
    browser_host = '127.0.0.1' if host == '0.0.0.0' else host
    webbrowser.open(f'http://{browser_host}:{port}/')


def preload_inputs(workspace: Path, args):
    if not args.inputs:
        return
    file_bytes = []
    for input_path in args.inputs:
        path = Path(input_path).expanduser().resolve()
        file_bytes.append((path.name, path.read_bytes()))

    cached_upload = build_prepared_upload(file_bytes=file_bytes, preset=args.preset, mapping_path=args.mapping)
    payload = analyze_inputs(
        workspace=workspace,
        preset=args.preset,
        prepared=cached_upload['prepared'],
        input_names=[file_info['name'] for file_info in cached_upload['raw_files']],
        start_text=args.start_date,
        end_text=args.end_date,
        date_mode='full_range' if not args.start_date and not args.end_date else 'custom',
    )
    print(
        f"Preloaded {payload['summary']['total_orders']} orders "
        f"from {payload['metadata']['startDate']} to {payload['metadata']['endDate']}"
    )


def main():
    args = parse_args()
    if args.workspace:
        workspace = Path(args.workspace).expanduser().resolve()
    elif getattr(sys, 'frozen', False):
        workspace = (Path.home() / 'Documents' / 'OrderAnalyticsWorkspace').resolve()
    else:
        workspace = (Path.cwd() / 'order-analysis-service').resolve()
    ensure_workspace(workspace)
    write_report_payload(workspace, load_existing_payload(workspace, args.preset))

    if args.inputs:
        try:
            preload_inputs(workspace, args)
        except Exception as exc:
            print(f'Failed to preload inputs: {exc}')

    app = create_app(workspace=workspace, preset=args.preset, mapping_path=args.mapping)
    if not args.no_open:
        threading.Timer(1.0, open_browser, args=(args.host, args.port)).start()

    print(f'Service ready: http://{args.host}:{args.port}/')
    print(f'Workspace: {workspace}')
    app.run(host=args.host, port=args.port, debug=False, use_reloader=False)


if __name__ == '__main__':
    main()
