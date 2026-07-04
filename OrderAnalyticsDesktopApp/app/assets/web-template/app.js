const DATE_MODE_LABELS = {
  auto: "自动全范围",
  manual: "手动日期",
  full_range: "全范围",
  today: "今天",
  last_7_days: "近7天",
  last_30_days: "近30天",
  current_month: "本月",
  custom: "自定义",
};

const DEFAULT_SORT_BY_VIEW = {
  sku: "total-desc",
  region: "total-desc",
  date: "dimension-asc",
  insights: "total-desc",
};

const VIEW_LABELS = {
  sku: "SKU 汇总",
  region: "地区分析",
  date: "日期分析",
  insights: "洞察工作台",
};

const VIEW_SEARCH_PLACEHOLDERS = {
  sku: "搜索 SKU",
  region: "搜索 SKU / 地区",
  date: "搜索日期或周期，如 2026-06-23",
  insights: "搜索 SKU / 地区 / 日期",
};

const VIEW_DIMENSION_SORT_LABELS = {
  sku: "按 SKU 升序",
  region: "按 SKU / 地区升序",
  date: "按日期升序",
  insights: "按维度升序",
};

const DATE_GRANULARITY_LABELS = {
  daily: "日总览",
  weekly: "周总览",
  ten_day: "十天总览",
  monthly: "月总览",
};

const DATE_CHART_METRICS = {
  total: { label: "订单数", unit: "单", color: "#3e63dd", kind: "count" },
  sign_rate: { label: "签收率", unit: "%", color: "#2f9e6d", kind: "rate" },
  refund_rate: { label: "退款率", unit: "%", color: "#d64045", kind: "rate" },
  cancel_after_rate: { label: "发货后取消率", unit: "%", color: "#b36b00", kind: "rate" },
  in_transit_rate: { label: "仍在途率", unit: "%", color: "#7c5cff", kind: "rate" },
};

const INSIGHT_LABELS = {
  risk: "风险雷达",
  matrix: "SKU×地区矩阵",
  comparison: "周期对比",
  details: "明细",
};

const BUCKET_LABELS = {
  completed: "已完成",
  delivered: "已送达",
  refund: "退款",
  cancel_before: "发货前取消",
  cancel_after: "发货后取消",
  in_transit: "仍在途",
  unknown_status: "未知状态",
};

const DETAIL_BUCKET_ORDER = [
  "completed",
  "delivered",
  "refund",
  "cancel_before",
  "cancel_after",
  "in_transit",
  "unknown_status",
];

const MATRIX_METRICS = {
  sign_rate: { label: "签收率", suffix: "%", reverse: false },
  refund_rate: { label: "退款率", suffix: "%", reverse: true },
  cancel_after_rate: { label: "发货后取消率", suffix: "%", reverse: true },
  total: { label: "订单量", suffix: "", reverse: false },
};

const RISK_MIN_TOTAL = 5;

const EMPTY_DATA = {
  metadata: {
    generatedAt: null,
    preset: "cn_en",
    inputs: [],
    startDate: null,
    endDate: null,
    dateMode: null,
    dateBasis: "Created Time",
    detectedStartDate: null,
    detectedEndDate: null,
  },
  summary: {
    total_files: 0,
    total_orders: 0,
    sku_count: 0,
    region_count: 0,
    month_count: 0,
    day_count: 0,
  },
  skuRows: [],
  regionRows: [],
  monthlyRows: [],
  dailyRows: [],
  monthlySkuRows: {},
  dailySkuRows: {},
  structuredRows: [],
  matrixRows: [],
  riskRows: [],
  comparison: {
    mode: "none",
    label: "暂无可比数据",
    currentRange: { startDate: null, endDate: null },
    previousRange: null,
    summaryDelta: null,
    skuDeltas: [],
    regionDeltas: [],
    dailyDeltas: [],
    emptyReason: "当前日期范围内没有足够数据生成周期对比。",
  },
  comparisonOptions: [],
  diagnostics: {
    files: [],
    unknown_statuses: [],
    matched_columns: {},
    preset: "cn_en",
  },
};

const EMPTY_INSPECTION = {
  startDate: null,
  endDate: null,
  files: [],
  matchedColumns: {},
  dateBasis: "Created Time",
};

let DATA = normalizeReport(window.ORDER_ANALYTICS_DATA || EMPTY_DATA);
let dateTrendChart = null;

const state = {
  view: "sku",
  search: "",
  sort: "total-desc",
  busy: false,
  inspectBusy: false,
  inspection: { ...EMPTY_INSPECTION },
  dateMode: "full_range",
  selectedDateRange: {
    startDate: null,
    endDate: null,
  },
  uploadToken: null,
  inspectRequestId: 0,
  insightView: "risk",
  dateGranularity: "daily",
  dateMetrics: ["total", "sign_rate", "refund_rate", "cancel_after_rate"],
  matrixMetric: "sign_rate",
  comparisonMode: "auto",
  detailFilters: {},
  detailTitle: "订单明细",
};

function byId(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const element = byId(id);
  if (element) {
    element.textContent = value;
  }
}

function setHTML(id, value) {
  const element = byId(id);
  if (element) {
    element.innerHTML = value;
  }
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function formatMetric(value, suffix = "%") {
  if (value === null || value === undefined) return "-";
  return `${Number(value || 0).toFixed(2).replace(/\.00$/, "")}${suffix}`;
}

function formatDelta(value, suffix = " 个百分点") {
  if (value === null || value === undefined) return "-";
  const numeric = Number(value || 0);
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${numeric.toFixed(2).replace(/\.00$/, "")}${suffix}`;
}

function parseISODate(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function formatISODate(date) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function daysBetween(start, end) {
  return Math.floor((end.getTime() - start.getTime()) / 86400000);
}

function rate(numerator, total) {
  if (!total) return 0;
  return Number((numerator / total * 100).toFixed(2));
}

function readableReason(value) {
  return String(value ?? "")
    .replace(/低于整体 ([\d.]+)pp/g, "比整体低 $1 个百分点")
    .replace(/高于整体 ([\d.]+)pp/g, "比整体高 $1 个百分点")
    .replace(/较上一周期下降 ([\d.]+)pp/g, "比上一周期低 $1 个百分点")
    .replace(/([\d.]+)pp/g, "$1 个百分点");
}

function bucketLabel(value) {
  return BUCKET_LABELS[value] || value || "未知状态";
}

function normalizeReport(payload) {
  const normalized = {
    ...EMPTY_DATA,
    ...payload,
    metadata: {
      ...EMPTY_DATA.metadata,
      ...(payload?.metadata || {}),
    },
    summary: {
      ...EMPTY_DATA.summary,
      ...(payload?.summary || {}),
    },
    diagnostics: {
      ...EMPTY_DATA.diagnostics,
      ...(payload?.diagnostics || {}),
    },
    skuRows: payload?.skuRows || [],
    regionRows: payload?.regionRows || [],
    monthlyRows: payload?.monthlyRows || [],
    dailyRows: payload?.dailyRows || [],
    monthlySkuRows: payload?.monthlySkuRows || {},
    dailySkuRows: payload?.dailySkuRows || {},
    structuredRows: payload?.structuredRows || [],
    matrixRows: payload?.matrixRows || [],
    riskRows: payload?.riskRows || [],
    comparison: {
      ...EMPTY_DATA.comparison,
      ...(payload?.comparison || {}),
    },
    comparisonOptions: (payload?.comparisonOptions || []).map((option) => ({
      ...EMPTY_DATA.comparison,
      ...option,
    })),
  };
  normalized.metadata.dateBasis = normalized.metadata.dateBasis || "Created Time";
  normalized.metadata.detectedStartDate = normalized.metadata.detectedStartDate || normalized.metadata.startDate;
  normalized.metadata.detectedEndDate = normalized.metadata.detectedEndDate || normalized.metadata.endDate;
  return normalized;
}

function metricClass(value, reverse = false) {
  if (reverse) {
    if (value <= 3) return "good";
    if (value <= 8) return "warn";
    return "bad";
  }
  if (value >= 80) return "good";
  if (value >= 60) return "warn";
  return "bad";
}

function hasData() {
  return (DATA.summary?.total_orders || 0) > 0;
}

function hasInspection() {
  return Boolean(state.inspection.startDate && state.inspection.endDate);
}

function hasSelectedRange() {
  return Boolean(state.selectedDateRange.startDate && state.selectedDateRange.endDate);
}

function dateModeLabel(mode) {
  return DATE_MODE_LABELS[mode] || mode || "-";
}

function formatRange(startDate, endDate) {
  if (!startDate || !endDate) {
    return "未选择";
  }
  return `${startDate} 到 ${endDate}`;
}

function parseDateString(value) {
  return new Date(`${value}T00:00:00`);
}

function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clampDate(date, minDate, maxDate) {
  if (date < minDate) return new Date(minDate);
  if (date > maxDate) return new Date(maxDate);
  return date;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function computePresetRange(mode) {
  if (!hasInspection()) {
    return { startDate: null, endDate: null };
  }

  const minDate = parseDateString(state.inspection.startDate);
  const maxDate = parseDateString(state.inspection.endDate);

  if (mode === "custom") {
    if (hasSelectedRange()) {
      const currentStart = clampDate(parseDateString(state.selectedDateRange.startDate), minDate, maxDate);
      const currentEnd = clampDate(parseDateString(state.selectedDateRange.endDate), minDate, maxDate);
      const start = currentStart <= currentEnd ? currentStart : currentEnd;
      const end = currentStart <= currentEnd ? currentEnd : currentStart;
      return { startDate: toDateString(start), endDate: toDateString(end) };
    }
    return { startDate: state.inspection.startDate, endDate: state.inspection.endDate };
  }

  let start = new Date(maxDate);
  let end = new Date(maxDate);

  if (mode === "full_range") {
    start = new Date(minDate);
  } else if (mode === "last_7_days") {
    start = addDays(maxDate, -6);
  } else if (mode === "last_30_days") {
    start = addDays(maxDate, -29);
  } else if (mode === "current_month") {
    start = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
  }

  start = clampDate(start, minDate, maxDate);
  end = clampDate(end, minDate, maxDate);
  if (start > end) {
    start = new Date(end);
  }

  return {
    startDate: toDateString(start),
    endDate: toDateString(end),
  };
}

function setStatus(message, tone = "idle") {
  const box = document.getElementById("statusBox");
  box.className = `status-box ${tone}`;
  box.textContent = message;
}

function setDownloadsEnabled(enabled) {
  ["skuDownload", "regionDownload", "monthlyDownload", "dailyDownload", "structuredDownload"].forEach((id) => {
    document.getElementById(id).classList.toggle("disabled", !enabled);
  });
}

function renderFileSelection() {
  const fileInput = document.getElementById("fileInput");
  const title = document.getElementById("fileSelectionText");
  const hint = document.getElementById("fileSelectionHint");
  const count = fileInput.files.length;

  if (!count) {
    title.textContent = "点击选择或拖入文件";
    hint.textContent = "支持 Excel / CSV，多选后自动识别日期范围";
    return;
  }

  if (count === 1) {
    title.textContent = fileInput.files[0].name;
    hint.textContent = "1 个文件已就绪";
    return;
  }

  title.textContent = `已选择 ${count} 个文件`;
  hint.textContent = `首个文件: ${fileInput.files[0].name}`;
}

function runMeta() {
  const metadata = DATA.metadata || {};
  const matched = DATA.diagnostics?.matched_columns || {};
  const selectedRange = formatRange(metadata.startDate, metadata.endDate);
  const detectedRange = formatRange(metadata.detectedStartDate, metadata.detectedEndDate);
  const modeLabel = dateModeLabel(metadata.dateMode);
  const basis = metadata.dateBasis || "Created Time";

  setText("reportMeta", `${selectedRange} · ${modeLabel} · ${basis}`);

  const inputFiles = metadata.inputs || [];
  setHTML("runMeta", [
    ["生成时间", metadata.generatedAt || "-"],
    ["开始日期", metadata.startDate || "-"],
    ["结束日期", metadata.endDate || "-"],
    ["输入文件", inputFiles.length || 0],
    ["日期模式", modeLabel],
    ["日期基准", basis],
    ["探测范围", detectedRange],
  ].map(([label, value]) => `<li><span>${label}</span><strong>${value}</strong></li>`).join("") || `<li><span>无</span><strong>-</strong></li>`);
}

function renderDiagnostics() {
  const matchedColumns = DATA.diagnostics?.matched_columns || {};
  const unknownStatuses = DATA.diagnostics?.unknown_statuses || [];

  document.getElementById("matchedColumns").innerHTML = Object.entries(matchedColumns)
    .map(([field, column]) => `<li><span>${field}</span><code>${column}</code></li>`)
    .join("") || `<li><span>无</span><strong>-</strong></li>`;

  document.getElementById("unknownStatuses").innerHTML = unknownStatuses.length
    ? unknownStatuses
        .map((item) => `<li><span>${item.order_substatus || "空"} / ${item.cancel_type || "空"}</span><strong>${item.count}</strong></li>`)
        .join("")
    : `<li><span>无未归类状态</span><strong>0</strong></li>`;
}

function bucketMetricsFromRows(rows) {
  const metrics = rows.reduce((acc, row) => {
    const bucket = row.bucket || "unknown_status";
    acc.total += 1;
    acc.skus.add(row.seller_sku || "");
    if (bucket in acc) acc[bucket] += 1;
    return acc;
  }, {
    total: 0,
    skus: new Set(),
    completed: 0,
    delivered: 0,
    refund: 0,
    cancel_before: 0,
    cancel_after: 0,
    in_transit: 0,
  });
  return {
    total: metrics.total,
    sku_count: metrics.skus.size,
    sign_rate: rate(metrics.completed + metrics.delivered + metrics.refund, metrics.total),
    completed_rate: rate(metrics.completed, metrics.total),
    delivered_rate: rate(metrics.delivered, metrics.total),
    refund_rate: rate(metrics.refund, metrics.total),
    cancel_before_rate: rate(metrics.cancel_before, metrics.total),
    cancel_after_rate: rate(metrics.cancel_after, metrics.total),
    in_transit_rate: rate(metrics.in_transit, metrics.total),
  };
}

function dateAnchor() {
  const metadataStart = parseISODate(DATA.metadata?.startDate);
  if (metadataStart) return metadataStart;
  const dates = (DATA.structuredRows || [])
    .map((row) => parseISODate(row.created_date))
    .filter(Boolean)
    .sort((a, b) => a - b);
  return dates[0] || null;
}

function dateRowsForGranularity(granularity = state.dateGranularity) {
  const rows = DATA.structuredRows || [];
  if (!rows.length) {
    if (granularity === "monthly") {
      return (DATA.monthlyRows || []).map((row) => ({ ...row, label: row.month, start_date: row.month, end_date: row.month, sku_count: row.sku_count || "-" }));
    }
    return (DATA.dailyRows || []).map((row) => ({ ...row, label: row.date, start_date: row.date, end_date: row.date }));
  }

  const anchor = dateAnchor();
  const rangeEnd = parseISODate(DATA.metadata?.endDate);
  const groups = new Map();
  rows.forEach((row) => {
    const created = parseISODate(row.created_date);
    if (!created || !anchor) return;
    let key;
    let label;
    let startDate;
    let endDate;
    if (granularity === "monthly") {
      key = row.month || String(row.created_date || "").slice(0, 7);
      label = key;
      startDate = key;
      endDate = key;
    } else if (granularity === "weekly" || granularity === "ten_day") {
      const windowDays = granularity === "ten_day" ? 10 : 7;
      const index = Math.floor(daysBetween(anchor, created) / windowDays);
      const start = addDays(anchor, index * windowDays);
      const rawEnd = addDays(start, windowDays - 1);
      const end = rangeEnd && rawEnd > rangeEnd ? rangeEnd : rawEnd;
      startDate = formatISODate(start);
      endDate = formatISODate(end);
      key = `${startDate}|${endDate}`;
      label = `${startDate} ~ ${endDate}`;
    } else {
      key = row.created_date || "";
      label = key;
      startDate = key;
      endDate = key;
    }
    if (!groups.has(key)) {
      groups.set(key, { key, label, start_date: startDate, end_date: endDate, sourceRows: [] });
    }
    groups.get(key).sourceRows.push(row);
  });

  return [...groups.values()]
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date), "zh-Hans-u-kn-true"))
    .map((group) => ({
      ...group,
      ...bucketMetricsFromRows(group.sourceRows),
      sourceRows: undefined,
    }));
}

function currentSourceRows() {
  if (state.view === "region") return DATA.regionRows || [];
  if (state.view === "date") return dateRowsForGranularity();
  return DATA.skuRows || [];
}

function currentSearchHaystack(row) {
  if (state.view === "region") return `${row.seller_sku || ""} ${row.region || ""}`.toLowerCase();
  if (state.view === "date") return `${row.label || ""} ${row.start_date || ""} ${row.end_date || ""}`.toLowerCase();
  return `${row.seller_sku || ""}`.toLowerCase();
}

function currentDimensionValue(row) {
  if (state.view === "region") return `${row.seller_sku || ""} ${row.region || ""}`;
  if (state.view === "date") return `${row.start_date || row.label || ""}`;
  return `${row.seller_sku || ""}`;
}

function renderToolbarContext() {
  const searchInput = document.getElementById("searchInput");
  const sortSelect = document.getElementById("sortSelect");
  const dimensionOption = sortSelect?.querySelector('option[value="dimension-asc"]');

  if (searchInput) {
    searchInput.placeholder = VIEW_SEARCH_PLACEHOLDERS[state.view] || "搜索";
    if (searchInput.value !== state.search) {
      searchInput.value = state.search;
    }
  }
  if (dimensionOption) {
    dimensionOption.textContent = VIEW_DIMENSION_SORT_LABELS[state.view] || "按维度升序";
  }
  if (sortSelect && sortSelect.value !== state.sort) {
    sortSelect.value = state.sort;
  }
}

function currentRows() {
  const rows = [...currentSourceRows()];
  const search = state.search.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    return !search || currentSearchHaystack(row).includes(search);
  });

  const sorters = {
    "total-desc": (a, b) => Number(b.total || 0) - Number(a.total || 0),
    "sign-desc": (a, b) => Number(b.sign_rate || 0) - Number(a.sign_rate || 0),
    "refund-desc": (a, b) => Number(b.refund_rate || 0) - Number(a.refund_rate || 0),
    "dimension-asc": (a, b) => currentDimensionValue(a).localeCompare(currentDimensionValue(b), "zh-Hans-u-kn-true"),
    "sku-asc": (a, b) => currentDimensionValue(a).localeCompare(currentDimensionValue(b), "zh-Hans-u-kn-true"),
  };
  filtered.sort(sorters[state.sort] || sorters["total-desc"]);
  return filtered;
}

function emptyTable(title, message) {
  return `
    <thead>
      <tr><th>${title}</th></tr>
    </thead>
    <tbody>
      <tr><td class="empty-cell">${message}</td></tr>
    </tbody>
  `;
}

function skuTable(rows) {
  const headers = ["序号", "Seller SKU", "订单数", "签收率", "已完成率", "已送达率", "退款率", "发货前取消率", "发货后取消率", "仍在途率"];
  const body = rows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>
        <button class="table-detail-link" type="button" data-action="table-detail" data-sku="${escapeHTML(row.seller_sku || "")}">
          ${escapeHTML(row.seller_sku || "")}
        </button>
      </td>
      <td>${row.total}</td>
      <td><span class="pill ${metricClass(row.sign_rate)}">${row.sign_rate}%</span></td>
      <td>${row.completed_rate}%</td>
      <td>${row.delivered_rate}%</td>
      <td><span class="pill ${metricClass(row.refund_rate, true)}">${row.refund_rate}%</span></td>
      <td>${row.cancel_before_rate}%</td>
      <td>${row.cancel_after_rate}%</td>
      <td>${row.in_transit_rate}%</td>
    </tr>
  `).join("");
  return `<thead><tr>${headers.map((label) => `<th>${label}</th>`).join("")}</tr></thead><tbody>${body}</tbody>`;
}

function regionTable(rows) {
  const regionLabel = DATA.diagnostics?.matched_columns?.region || "Region";
  const headers = ["序号", "Seller SKU", regionLabel, "订单数", "订单占比", "签收率", "退款率", "发货前取消率", "发货后取消率", "仍在途率"];
  const body = rows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>
        <button class="table-detail-link" type="button" data-action="table-detail" data-sku="${escapeHTML(row.seller_sku || "")}" data-region="${escapeHTML(row.region || "")}">
          ${escapeHTML(row.seller_sku || "")}
        </button>
      </td>
      <td>${escapeHTML(row.region || "")}</td>
      <td>${row.total}</td>
      <td>${row.share_rate}%</td>
      <td><span class="pill ${metricClass(row.sign_rate)}">${row.sign_rate}%</span></td>
      <td><span class="pill ${metricClass(row.refund_rate, true)}">${row.refund_rate}%</span></td>
      <td>${row.cancel_before_rate}%</td>
      <td>${row.cancel_after_rate}%</td>
      <td>${row.in_transit_rate}%</td>
    </tr>
  `).join("");
  return `<thead><tr>${headers.map((label) => `<th>${label}</th>`).join("")}</tr></thead><tbody>${body}</tbody>`;
}

function dateAnalysisTable(rows) {
  const dimensionLabel = {
    daily: "日期",
    weekly: "周期",
    ten_day: "周期",
    monthly: "月份",
  }[state.dateGranularity] || "日期";
  const headers = ["序号", dimensionLabel, "订单数", "SKU 数", "签收率", "已完成率", "已送达率", "退款率", "发货前取消率", "发货后取消率", "仍在途率"];
  const body = rows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td><strong>${escapeHTML(row.label || row.date || row.month || "")}</strong></td>
      <td>${row.total}</td>
      <td>${row.sku_count}</td>
      <td><span class="pill ${metricClass(row.sign_rate)}">${row.sign_rate}%</span></td>
      <td>${row.completed_rate}%</td>
      <td>${row.delivered_rate}%</td>
      <td><span class="pill ${metricClass(row.refund_rate, true)}">${row.refund_rate}%</span></td>
      <td>${row.cancel_before_rate}%</td>
      <td>${row.cancel_after_rate}%</td>
      <td>${row.in_transit_rate}%</td>
    </tr>
  `).join("");
  return `<thead><tr>${headers.map((label) => `<th>${label}</th>`).join("")}</tr></thead><tbody>${body}</tbody>`;
}

function chartRowsForView(rows) {
  if (state.view === "region") {
    const byRegion = new Map();
    rows.forEach((row) => {
      const region = row.region || "空地区";
      const current = byRegion.get(region) || { label: region, filter: region, total: 0, signed: 0, refund: 0 };
      const total = Number(row.total || 0);
      current.total += total;
      current.signed += total * Number(row.sign_rate || 0) / 100;
      current.refund += total * Number(row.refund_rate || 0) / 100;
      byRegion.set(region, current);
    });
    return [...byRegion.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 12)
      .map((row) => ({ ...row, weighted: row.signed, rate: rate(row.signed, row.total), refund_rate: rate(row.refund, row.total) }));
  }
  return [];
}

function chartTitleForView() {
  if (state.view === "region") return "地区签收贡献";
  if (state.view === "date") return `${DATE_GRANULARITY_LABELS[state.dateGranularity] || "日期"}趋势`;
  return "";
}

function chartSubtitleForView(rows) {
  if (state.view === "region") return "条形长度 = 订单数 × 签收率；点击地区筛选明细。";
  if (state.view === "date") return "各指标按自身范围缩放，悬停点位查看真实数值。";
  return "";
}

function regionBarChartHTML(rows) {
  const items = chartRowsForView(rows);
  if (!items.length) return "";
  const maxWeighted = Math.max(...items.map((item) => item.weighted), 1);
  return `
    <section class="chart-panel">
      <div class="chart-head">
        <div>
          <p class="section-kicker">Chart</p>
          <h3>${escapeHTML(chartTitleForView())}</h3>
        </div>
        <span>${escapeHTML(chartSubtitleForView(rows))}</span>
      </div>
      <div class="chart-bars">
        ${items.map((item) => {
          const width = Math.max(4, item.weighted / maxWeighted * 100);
          return `
            <button class="chart-bar" type="button" data-chart-filter="${escapeHTML(item.filter)}" title="${escapeHTML(`${item.label}：${formatNumber(item.total)} 单，签收 ${formatMetric(item.rate)}`)}">
              <span class="chart-label">${escapeHTML(item.label)}</span>
              <span class="chart-track"><span style="width: ${width}%"></span></span>
              <strong>${formatNumber(Math.round(item.weighted))} 签收单</strong>
              <em>${formatNumber(item.total)} 单 · ${formatMetric(item.rate)}</em>
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function dateMetricValue(row, key) {
  return Number(row[key] || 0);
}

function dateMetricText(row, key) {
  const metric = DATE_CHART_METRICS[key];
  const value = dateMetricValue(row, key);
  if (!metric) return String(value);
  return metric.kind === "count" ? `${formatNumber(value)}${metric.unit}` : formatMetric(value);
}

function dateMetricExtent(items, key) {
  const values = items.map((row) => dateMetricValue(row, key));
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1 };
  }
  if (min === max) {
    const padding = max === 0 ? 1 : Math.abs(max) * 0.1;
    min -= padding;
    max += padding;
  } else {
    const padding = (max - min) * 0.12;
    min -= padding;
    max += padding;
  }
  if (DATE_CHART_METRICS[key]?.kind === "rate") {
    min = Math.max(0, min);
    max = Math.min(100, max);
    if (min === max) max = Math.min(100, min + 1);
  } else {
    min = Math.max(0, min);
    if (min === max) max = min + 1;
  }
  return { min, max };
}

function shortChartDateLabel(value) {
  const text = String(value || "");
  const dateMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateMatch) return `${dateMatch[2]}-${dateMatch[3]}`;
  return text;
}

function chartTickLabel(value) {
  const text = String(value || "");
  if (text.includes(" ~ ")) {
    return text.split(" ~ ").map(shortChartDateLabel).join(" ~ ");
  }
  return shortChartDateLabel(text);
}

function dateLineChartHTML(rows) {
  const items = [...rows].sort((a, b) => String(a.start_date || a.label || "").localeCompare(String(b.start_date || b.label || ""), "zh-Hans-u-kn-true"));
  if (!items.length) return "";
  const activeMetrics = activeDateMetricKeys();

  return `
    <section class="chart-panel">
      <div class="chart-head">
        <div>
          <p class="section-kicker">Chart</p>
          <h3>${escapeHTML(chartTitleForView())}</h3>
        </div>
        <span>${escapeHTML(chartSubtitleForView(rows))}</span>
      </div>
      <div class="metric-toggle-row">
        ${Object.entries(DATE_CHART_METRICS).map(([key, metric]) => `
          <button class="metric-chip ${activeMetrics.includes(key) ? "active" : ""}" type="button" data-date-metric="${key}">
            ${metric.label}
          </button>
        `).join("")}
      </div>
      <div class="date-chart-shell">
        <canvas id="dateTrendCanvas" aria-label="日期趋势折线图"></canvas>
      </div>
    </section>
  `;
}

function dateChartRows(rows) {
  return [...rows].sort((a, b) => String(a.start_date || a.label || "").localeCompare(String(b.start_date || b.label || ""), "zh-Hans-u-kn-true"));
}

function activeDateMetricKeys() {
  const selected = state.dateMetrics.filter((key) => DATE_CHART_METRICS[key]);
  return selected.length ? selected : ["sign_rate"];
}

function destroyDateTrendChart() {
  if (!dateTrendChart) return;
  dateTrendChart.destroy();
  dateTrendChart = null;
}

function mountDateTrendChart(rows = []) {
  destroyDateTrendChart();
  if (state.view !== "date") return;
  const canvas = document.getElementById("dateTrendCanvas");
  if (!canvas) return;
  const items = dateChartRows(rows);
  if (!items.length) return;
  if (!window.Chart) {
    canvas.replaceWith(Object.assign(document.createElement("div"), {
      className: "chart-fallback",
      textContent: "图表库未加载，无法渲染日期趋势图。",
    }));
    return;
  }

  const activeMetrics = activeDateMetricKeys();
  const scales = Object.fromEntries(activeMetrics.map((key) => {
    const extent = dateMetricExtent(items, key);
    return [`y_${key}`, {
      type: "linear",
      display: false,
      min: extent.min,
      max: extent.max,
      grid: { display: false },
      border: { display: false },
    }];
  }));
  const labels = items.map((row) => row.label || row.date || row.month || "");
  const datasets = activeMetrics.map((key) => {
    const metric = DATE_CHART_METRICS[key];
    return {
      label: metric.label,
      metricKey: key,
      data: items.map((row) => dateMetricValue(row, key)),
      yAxisID: `y_${key}`,
      borderColor: metric.color,
      backgroundColor: metric.color,
      pointBackgroundColor: metric.color,
      pointBorderColor: "#fff",
      pointBorderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
      borderWidth: 3,
      tension: 0.28,
    };
  });

  dateTrendChart = new window.Chart(canvas, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          align: "start",
          labels: {
            usePointStyle: true,
            boxWidth: 8,
            boxHeight: 8,
            color: "#60646c",
            font: { family: "Segoe UI, Helvetica Neue, sans-serif", size: 12 },
          },
        },
        tooltip: {
          backgroundColor: "rgba(255, 255, 255, 0.98)",
          borderColor: "rgba(28, 32, 36, 0.16)",
          borderWidth: 1,
          titleColor: "#1c2024",
          bodyColor: "#1c2024",
          padding: 12,
          displayColors: true,
          callbacks: {
            title(context) {
              return context?.[0]?.label || "";
            },
            label(context) {
              const key = context.dataset.metricKey;
              const row = items[context.dataIndex];
              return `${context.dataset.label}: ${dateMetricText(row, key)}`;
            },
            footer() {
              return "各指标独立缩放，面板显示真实值。";
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: "#60646c",
            autoSkip: true,
            maxTicksLimit: 7,
            maxRotation: 0,
            callback(value) {
              return chartTickLabel(this.getLabelForValue(value));
            },
          },
        },
        ...scales,
      },
    },
  });
}

function chartHTML(rows) {
  if (state.view === "insights") return "";
  if (state.view === "sku") return "";
  if (state.view === "date") return dateLineChartHTML(rows);
  if (state.view === "region") return regionBarChartHTML(rows);
  return "";
}

function insightTabs() {
  return `
    <div class="insight-tabs">
      ${Object.entries(INSIGHT_LABELS).map(([key, label]) => `
        <button class="insight-tab ${state.insightView === key ? "active" : ""}" type="button" data-insight-view="${key}">
          ${label}
        </button>
      `).join("")}
    </div>
  `;
}

function rowMatchesFilters(row, filters = {}) {
  return Object.entries(filters).every(([key, value]) => {
    if (value === null || value === undefined || value === "") return true;
    return String(row[key] || "") === String(value);
  });
}

function detailRows(filters = state.detailFilters) {
  const search = state.search.trim().toLowerCase();
  return (DATA.structuredRows || []).filter((row) => {
    const haystack = `${row.order_id || ""} ${row.created_date || ""} ${row.seller_sku || ""} ${row.region || ""} ${row.bucket || ""}`.toLowerCase();
    return rowMatchesFilters(row, filters) && (!search || haystack.includes(search));
  });
}

function detailFilterLabel(filters = {}) {
  const labels = [];
  if (filters.seller_sku) labels.push(`SKU: ${filters.seller_sku}`);
  if (filters.region) labels.push(`地区: ${filters.region}`);
  if (filters.bucket) labels.push(`状态: ${bucketLabel(filters.bucket)}`);
  if (filters.created_date) labels.push(`日期: ${filters.created_date}`);
  return labels.join(" / ") || "全部订单";
}

function filtersWithoutBucket(filters = {}) {
  const next = { ...filters };
  delete next.bucket;
  return next;
}

function detailBucketCounts(rows) {
  return rows.reduce((acc, row) => {
    const bucket = row.bucket || "unknown_status";
    acc[bucket] = (acc[bucket] || 0) + 1;
    return acc;
  }, {});
}

function detailSummaryHTML(rows, filters = {}) {
  const bucketCounts = detailBucketCounts(rows);
  return `
    <div class="summary-chip"><span>筛选</span><strong>${escapeHTML(detailFilterLabel(filters))}</strong></div>
    <div class="summary-chip"><span>订单</span><strong>${formatNumber(rows.length)}</strong></div>
    <div class="summary-chip"><span>SKU</span><strong>${formatNumber(new Set(rows.map((row) => row.seller_sku)).size)}</strong></div>
    <div class="summary-chip"><span>地区</span><strong>${formatNumber(new Set(rows.map((row) => row.region)).size)}</strong></div>
    <div class="summary-chip"><span>退款</span><strong>${formatNumber(bucketCounts.refund || 0)}</strong></div>
    <div class="summary-chip"><span>发货后取消</span><strong>${formatNumber(bucketCounts.cancel_after || 0)}</strong></div>
  `;
}

function detailFilterPanelHTML(filters = {}) {
  const baseRows = detailRows(filtersWithoutBucket(filters));
  const counts = detailBucketCounts(baseRows);
  const activeBucket = filters.bucket || "";
  const bucketButtons = DETAIL_BUCKET_ORDER
    .filter((bucket) => counts[bucket] || activeBucket === bucket)
    .map((bucket) => `
      <button class="detail-filter-chip ${activeBucket === bucket ? "active" : ""}" type="button" data-detail-bucket="${escapeHTML(bucket)}">
        <span>${escapeHTML(bucketLabel(bucket))}</span>
        <strong>${formatNumber(counts[bucket] || 0)}</strong>
      </button>
    `).join("");
  if (!baseRows.length) return "";
  return `
    <div class="drawer-filter-group" aria-label="状态筛选">
      <span class="drawer-filter-label">状态筛选</span>
      <div class="drawer-filter-chips">
        <button class="detail-filter-chip ${!activeBucket ? "active" : ""}" type="button" data-detail-bucket="">
          <span>全部状态</span>
          <strong>${formatNumber(baseRows.length)}</strong>
        </button>
        ${bucketButtons}
      </div>
    </div>
  `;
}

function detailTableHTML(rows) {
  if (!rows.length) {
    return emptyTable("无明细", "当前筛选条件下没有订单明细。");
  }
  const visibleRows = rows.slice(0, 300);
  const body = visibleRows.map((row) => {
    const unknown = row.unknown_status || {};
    const unknownText = [unknown.order_substatus, unknown.cancel_type].filter(Boolean).join(" / ");
    return `
      <tr>
        <td>${escapeHTML(row.order_id || "-")}</td>
        <td>${escapeHTML(row.created_date || "")}</td>
        <td><strong>${escapeHTML(row.seller_sku || "")}</strong></td>
        <td>${escapeHTML(row.region || "")}</td>
        <td>
          <button class="bucket-detail-link" type="button" data-detail-bucket="${escapeHTML(row.bucket || "unknown_status")}">
            ${escapeHTML(bucketLabel(row.bucket || "unknown_status"))}
          </button>
        </td>
        <td>${escapeHTML(row.file || "")}</td>
        <td>${escapeHTML(unknownText || "-")}</td>
      </tr>
    `;
  }).join("");
  const more = rows.length > visibleRows.length
    ? `<tr><td colspan="7" class="empty-cell">仅显示前 ${visibleRows.length} 条，共 ${rows.length} 条</td></tr>`
    : "";
  return `
    <thead>
      <tr>
        <th>
          <span class="order-id-head">
            订单号
            <button class="copy-order-button" type="button" data-action="copy-order-ids" title="复制当前筛选出的订单号">复制</button>
          </span>
        </th>
        <th>日期</th><th>SKU</th><th>地区</th><th>状态桶</th><th>文件</th><th>未知状态文本</th>
      </tr>
    </thead>
    <tbody>${body}${more}</tbody>
  `;
}

function detailOrderIds() {
  return detailRows(state.detailFilters)
    .map((row) => String(row.order_id || "").trim())
    .filter(Boolean);
}

function setDetailCopyStatus(message, tone = "neutral") {
  const target = document.getElementById("detailCopyStatus");
  if (!target) return;
  target.textContent = message;
  target.dataset.tone = tone;
}

async function writeTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("copy_failed");
}

async function copyDetailOrderIds() {
  const ids = detailOrderIds();
  if (!ids.length) {
    setDetailCopyStatus("没有可复制的订单号", "warn");
    return;
  }
  try {
    await writeTextToClipboard(ids.join("\n"));
    setDetailCopyStatus(`已复制 ${formatNumber(ids.length)} 个订单号`, "success");
  } catch {
    setDetailCopyStatus("复制失败，请手动选择订单号", "warn");
  }
}

function openDetailDrawer(filters = {}, title = "订单明细") {
  state.detailFilters = { ...filters };
  state.detailTitle = title;
  renderDetailDrawer();
  document.getElementById("detailDrawer").classList.add("open");
  document.getElementById("detailDrawer").setAttribute("aria-hidden", "false");
}

function closeDetailDrawer() {
  document.getElementById("detailDrawer").classList.remove("open");
  document.getElementById("detailDrawer").setAttribute("aria-hidden", "true");
}

function renderDetailDrawer() {
  const rows = detailRows(state.detailFilters);
  setText("detailTitle", state.detailTitle || "订单明细");
  setDetailCopyStatus("");
  setHTML("detailSummary", detailSummaryHTML(rows, state.detailFilters));
  setHTML("detailFilterPanel", detailFilterPanelHTML(state.detailFilters));
  setHTML("detailTable", detailTableHTML(rows));
}

function riskViewHTML() {
  const rows = (DATA.riskRows || []).slice(0, 20);
  if (!rows.length) {
    return `<div class="empty-insight">暂无风险项。低样本项不会进入风险榜。</div>`;
  }
  return `
    <div class="risk-list">
      ${rows.map((row, index) => {
        const score = Math.max(0, Math.min(100, Number(row.risk_score || 0)));
        return `
          <button class="risk-card" type="button" data-action="detail-risk" data-index="${index}" aria-label="查看 ${escapeHTML(row.label)} 的风险订单明细">
            <span class="risk-info">
              <span class="risk-copy">
                <strong>${escapeHTML(row.label)}</strong>
                <em>${escapeHTML(readableReason(row.reason))}</em>
              </span>
              <span class="risk-meta">${escapeHTML(row.type)} · ${formatNumber(row.total)} 单</span>
            </span>
            <span class="risk-visual" aria-hidden="true">
              <span class="risk-visual-label">风险强度</span>
              <span class="risk-meter">
                <span style="width: ${score}%"></span>
              </span>
            </span>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function matrixRowsForView() {
  const search = state.search.trim().toLowerCase();
  const rows = (DATA.matrixRows || []).filter((row) => {
    const haystack = `${row.seller_sku || ""} ${row.region || ""}`.toLowerCase();
    return !search || haystack.includes(search);
  });
  const skuTotals = new Map();
  const regionTotals = new Map();
  rows.forEach((row) => {
    skuTotals.set(row.seller_sku, (skuTotals.get(row.seller_sku) || 0) + Number(row.total || 0));
    regionTotals.set(row.region, (regionTotals.get(row.region) || 0) + Number(row.total || 0));
  });
  const topSkus = [...skuTotals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hans-u-kn-true")).slice(0, search ? 60 : 30).map(([key]) => key);
  const topRegions = [...regionTotals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hans-u-kn-true")).slice(0, search ? 24 : 12).map(([key]) => key);
  const byCell = new Map(rows.map((row) => [`${row.seller_sku}::${row.region}`, row]));
  return { topSkus, topRegions, byCell };
}

function matrixCellStyle(value, metric) {
  const max = metric === "total" ? Math.max(1, ...DATA.matrixRows.map((row) => Number(row.total || 0))) : 100;
  const normalized = Math.max(0, Math.min(1, Number(value || 0) / max));
  const intensity = metric === "sign_rate" ? normalized : 1 - normalized;
  const hue = metric === "sign_rate" ? "62, 99, 221" : "198, 42, 47";
  const alpha = 0.08 + (metric === "sign_rate" ? normalized : 1 - intensity) * 0.42;
  return `background: rgba(${hue}, ${alpha.toFixed(2)});`;
}

function matrixViewHTML() {
  const metric = MATRIX_METRICS[state.matrixMetric] || MATRIX_METRICS.sign_rate;
  const { topSkus, topRegions, byCell } = matrixRowsForView();
  if (!topSkus.length || !topRegions.length) {
    return `<div class="empty-insight">暂无地区矩阵数据。需要上传包含地区字段的订单表。</div>`;
  }
  return `
    <div class="matrix-toolbar">
      ${Object.entries(MATRIX_METRICS).map(([key, item]) => `
        <button class="metric-chip ${state.matrixMetric === key ? "active" : ""}" type="button" data-matrix-metric="${key}">
          ${item.label}
        </button>
      `).join("")}
    </div>
    <div class="matrix-wrap">
      <table class="matrix-table">
        <thead>
          <tr><th>SKU / 地区</th>${topRegions.map((region) => `<th>${escapeHTML(region || "空地区")}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${topSkus.map((sku) => `
            <tr>
              <th>${escapeHTML(sku)}</th>
              ${topRegions.map((region) => {
                const row = byCell.get(`${sku}::${region}`);
                if (!row) return `<td class="matrix-empty">-</td>`;
                const value = row[state.matrixMetric] || 0;
                return `
                  <td>
                    <button class="matrix-cell" type="button" style="${matrixCellStyle(value, state.matrixMetric)}" data-action="detail-cell" data-sku="${escapeHTML(sku)}" data-region="${escapeHTML(region)}">
                      <strong>${formatMetric(value, metric.suffix)}</strong>
                      <span>${formatNumber(row.total)} 单</span>
                    </button>
                  </td>
                `;
              }).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function comparisonOptions() {
  const byMode = new Map();
  (DATA.comparisonOptions || []).forEach((option) => {
    if (option?.mode) byMode.set(option.mode, option);
  });
  if (DATA.comparison?.mode && !byMode.has(DATA.comparison.mode)) {
    byMode.set(DATA.comparison.mode, DATA.comparison);
  }
  return [...byMode.values()].filter((option) => option?.mode && option.mode !== "none");
}

function activeComparison() {
  if (state.comparisonMode === "auto") return DATA.comparison || EMPTY_DATA.comparison;
  return comparisonOptions().find((option) => option.mode === state.comparisonMode) || DATA.comparison || EMPTY_DATA.comparison;
}

function comparisonPresetChips(active) {
  const options = comparisonOptions();
  const autoLabel = active?.label ? `自动推荐：${active.label}` : "自动推荐";
  return `
    <div class="comparison-presets">
      <button class="metric-chip ${state.comparisonMode === "auto" ? "active" : ""}" type="button" data-comparison-mode="auto">
        ${escapeHTML(autoLabel)}
      </button>
      ${options.map((option) => `
        <button class="metric-chip ${state.comparisonMode === option.mode ? "active" : ""}" type="button" data-comparison-mode="${escapeHTML(option.mode)}">
          ${escapeHTML(option.label || option.mode)}
        </button>
      `).join("")}
    </div>
  `;
}

function comparisonCard(label, value, delta, suffix = "pp", toneMode = "higher-better") {
  const numeric = Number(delta || 0);
  let tone = "neutral";
  if (toneMode === "higher-better") {
    tone = numeric < 0 ? "bad" : numeric > 0 ? "good" : "neutral";
  } else if (toneMode === "lower-better") {
    tone = numeric > 0 ? "bad" : numeric < 0 ? "good" : "neutral";
  }
  return `<article class="compare-card"><span>${label}</span><strong>${value}</strong><em class="${tone}">${formatDelta(delta, suffix)}</em></article>`;
}

function comparisonRows(rows, title, direction = "down") {
  const sorted = [...rows]
    .filter((row) => row.sign_delta !== null && row.sign_delta !== undefined)
    .filter((row) => direction === "up" ? Number(row.sign_delta) > 0 : Number(row.sign_delta) < 0)
    .sort((a, b) => direction === "up" ? b.sign_delta - a.sign_delta : a.sign_delta - b.sign_delta)
    .slice(0, 10);
  return `
    <div class="comparison-list">
      <h3>${title}</h3>
      ${sorted.length ? sorted.map((row) => `
        <button class="comparison-row" type="button" data-action="detail-sku" data-sku="${escapeHTML(row.seller_sku || "")}">
          <strong>${escapeHTML(row.seller_sku || "")}</strong>
          <span>${formatNumber(row.total)} 单</span>
          <em class="${direction === "up" ? "good" : "bad"}">${formatDelta(row.sign_delta)}</em>
        </button>
      `).join("") : `<p class="muted">暂无可比 SKU。</p>`}
    </div>
  `;
}

function comparisonViewHTML() {
  const comparison = activeComparison();
  const summary = comparison.summaryDelta;
  const presets = comparisonPresetChips(comparison);
  if (!summary) {
    const reason = comparison.emptyReason || "当前数据不足以生成周期对比。";
    return `
      ${presets}
      <div class="empty-insight">
        ${escapeHTML(reason)}<br>
        当前周期：${escapeHTML(formatRange(comparison.currentRange?.startDate, comparison.currentRange?.endDate))}
      </div>
    `;
  }
  return `
    ${presets}
    <div class="comparison-head">
      <span>${escapeHTML(comparison.label || "当前")} ${escapeHTML(formatRange(comparison.currentRange?.startDate, comparison.currentRange?.endDate))}</span>
      <span>对比 ${escapeHTML(formatRange(comparison.previousRange?.startDate, comparison.previousRange?.endDate))}</span>
    </div>
    <div class="compare-grid">
      ${comparisonCard("订单数", formatNumber(summary.total), summary.total_delta, "", "neutral")}
      ${comparisonCard("签收率", formatMetric(summary.sign_rate), summary.sign_delta, " 个百分点", "higher-better")}
      ${comparisonCard("退款率", formatMetric(summary.refund_rate), summary.refund_delta, " 个百分点", "lower-better")}
      ${comparisonCard("发货后取消率", formatMetric(summary.cancel_after_rate), summary.cancel_after_delta, " 个百分点", "lower-better")}
    </div>
    <div class="comparison-columns">
      ${comparisonRows(comparison.skuDeltas || [], "恶化最大 SKU")}
      ${comparisonRows(comparison.skuDeltas || [], "改善最大 SKU", "up")}
    </div>
  `;
}

function detailsViewHTML() {
  const rows = detailRows({});
  return `
    <div class="inline-detail-summary">${detailSummaryHTML(rows, {})}</div>
    <div class="table-wrap inline-detail-table"><table>${detailTableHTML(rows)}</table></div>
  `;
}

function renderInsights() {
  const body = {
    risk: riskViewHTML,
    matrix: matrixViewHTML,
    comparison: comparisonViewHTML,
    details: detailsViewHTML,
  }[state.insightView]();
  setHTML("insightStage", `${insightTabs()}<div class="insight-body">${body}</div>`);
}

function renderDateGranularityTabs() {
  const stage = document.getElementById("dateGranularityStage");
  if (!stage) return;
  stage.hidden = state.view !== "date";
  if (stage.hidden) {
    stage.innerHTML = "";
    return;
  }
  stage.innerHTML = Object.entries(DATE_GRANULARITY_LABELS).map(([key, label]) => `
    <button class="date-tab ${state.dateGranularity === key ? "active" : ""}" type="button" data-date-granularity="${key}">
      ${label}
    </button>
  `).join("");
}

function renderChart(rows = []) {
  const stage = document.getElementById("chartStage");
  if (!stage) return;
  destroyDateTrendChart();
  const html = state.view === "insights" || !hasData() ? "" : chartHTML(rows);
  stage.hidden = !html;
  stage.innerHTML = html;
  if (state.view === "date" && html) {
    mountDateTrendChart(rows);
  }
}

function renderTable() {
  renderToolbarContext();
  renderDateGranularityTabs();
  document.getElementById("tableTitle").textContent = VIEW_LABELS[state.view] || "SKU 汇总";
  document.getElementById("insightStage").hidden = state.view !== "insights";
  document.getElementById("tableStage").hidden = state.view === "insights";

  if (state.view === "insights") {
    renderChart([]);
    if (!hasData()) {
      setHTML("insightStage", `<div class="empty-insight">上传订单表格并确认日期范围后，这里会显示洞察工作台。</div>`);
      return;
    }
    renderInsights();
    return;
  }

  if (!hasData()) {
    renderChart([]);
    document.getElementById("dataTable").innerHTML = emptyTable("等待分析", "上传订单表格并确认日期范围后，这里会显示分析结果。");
    return;
  }

  const rows = currentRows();
  renderChart(rows);
  if (!rows.length) {
    const message = state.search
      ? "当前搜索条件下没有结果。"
      : `${VIEW_LABELS[state.view] || "当前视图"}暂无数据，请重新分析当前文件后刷新。`;
    document.getElementById("dataTable").innerHTML = emptyTable("无匹配数据", message);
    return;
  }

  if (state.view === "region") {
    document.getElementById("dataTable").innerHTML = regionTable(rows);
  } else if (state.view === "date") {
    document.getElementById("dataTable").innerHTML = dateAnalysisTable(rows);
  } else {
    document.getElementById("dataTable").innerHTML = skuTable(rows);
  }
}

function renderDatePanel() {
  const datePanel = document.getElementById("datePanel");
  const startInput = document.getElementById("startDateInput");
  const endInput = document.getElementById("endDateInput");
  const startField = document.getElementById("startDateField");
  const endField = document.getElementById("endDateField");
  const submitButton = document.getElementById("submitButton");
  const hasRange = hasInspection();
  const isCustom = state.dateMode === "custom";
  const inputsEditable = hasRange && isCustom && !state.busy && !state.inspectBusy;

  datePanel.classList.toggle("disabled", !hasRange);
  setText("detectedRangeText", hasRange
    ? formatRange(state.inspection.startDate, state.inspection.endDate)
    : "等待探测");
  setText("selectedRangeText", hasSelectedRange()
    ? formatRange(state.selectedDateRange.startDate, state.selectedDateRange.endDate)
    : "未选择");
  setText("selectedModeText", dateModeLabel(state.dateMode));
  setText("dateHint", hasRange
    ? `已识别 ${state.inspection.dateBasis || "Created Time"} 范围。`
    : "选择文件后自动识别日期范围。");

  document.querySelectorAll(".preset-chip").forEach((button) => {
    button.classList.toggle("active", button.dataset.dateMode === state.dateMode);
    button.disabled = !hasRange || state.inspectBusy || state.busy;
  });

  startInput.min = hasRange ? state.inspection.startDate : "";
  startInput.max = hasRange ? state.inspection.endDate : "";
  endInput.min = hasRange ? state.inspection.startDate : "";
  endInput.max = hasRange ? state.inspection.endDate : "";
  startInput.value = state.selectedDateRange.startDate || "";
  endInput.value = state.selectedDateRange.endDate || "";
  startInput.disabled = !inputsEditable;
  endInput.disabled = !inputsEditable;

  startField.classList.toggle("emphasis", isCustom && hasRange);
  endField.classList.toggle("emphasis", isCustom && hasRange);
  startField.classList.toggle("soft", !isCustom || !hasRange);
  endField.classList.toggle("soft", !isCustom || !hasRange);

  submitButton.disabled = state.busy || state.inspectBusy || !hasRange || !hasSelectedRange();
}

function renderAll() {
  renderFileSelection();
  runMeta();
  renderDiagnostics();
  renderTable();
  renderDatePanel();
  setDownloadsEnabled(hasData());
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === state.view);
  });
}

function resetInspection() {
  state.inspection = { ...EMPTY_INSPECTION };
  state.dateMode = "full_range";
  state.uploadToken = null;
  state.selectedDateRange = {
    startDate: null,
    endDate: null,
  };
}

function applyDateMode(mode) {
  if (!hasInspection()) {
    state.dateMode = mode;
    renderDatePanel();
    return;
  }

  state.dateMode = mode;
  state.selectedDateRange = computePresetRange(mode);
  renderDatePanel();
}

async function inspectSelectedFiles() {
  const fileInput = document.getElementById("fileInput");
  if (!fileInput.files.length) {
    resetInspection();
    renderDatePanel();
    setStatus("等待上传文件", "idle");
    return;
  }

  const requestId = ++state.inspectRequestId;
  const formData = new FormData();
  Array.from(fileInput.files).forEach((file) => formData.append("files", file));

  state.inspectBusy = true;
  setStatus(`识别日期范围中，共 ${fileInput.files.length} 个文件...`, "busy");
  renderDatePanel();

  try {
    const response = await fetch("/api/inspect", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();
    if (requestId !== state.inspectRequestId) {
      return;
    }
    if (!response.ok) {
      throw new Error(payload.error || "日期识别失败");
    }

    state.inspection = {
      ...EMPTY_INSPECTION,
      ...payload,
      dateBasis: payload.dateBasis || "Created Time",
    };
    state.uploadToken = payload.uploadToken || null;
    state.dateMode = "full_range";
    state.selectedDateRange = {
      startDate: payload.startDate,
      endDate: payload.endDate,
    };
    renderDatePanel();
    setStatus(`已识别范围 ${formatRange(payload.startDate, payload.endDate)}，请确认后分析`, "success");
  } catch (error) {
    if (requestId !== state.inspectRequestId) {
      return;
    }
    resetInspection();
    renderDatePanel();
    setStatus(error.message || "日期识别失败", "error");
  } finally {
    if (requestId === state.inspectRequestId) {
      state.inspectBusy = false;
      renderDatePanel();
    }
  }
}

function updateCustomDateRange() {
  const startInput = document.getElementById("startDateInput");
  const endInput = document.getElementById("endDateInput");
  state.selectedDateRange = {
    startDate: startInput.value || null,
    endDate: endInput.value || null,
  };
  setText("selectedRangeText", hasSelectedRange()
    ? formatRange(state.selectedDateRange.startDate, state.selectedDateRange.endDate)
    : "未选择");
  document.getElementById("submitButton").disabled =
    state.busy || state.inspectBusy || !hasInspection() || !hasSelectedRange();
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      const nextView = button.dataset.view;
      const changedView = state.view !== nextView;
      state.view = nextView;
      if (changedView) {
        state.search = "";
        state.sort = DEFAULT_SORT_BY_VIEW[nextView] || "total-desc";
      }
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab === button));
      renderTable();
    });
  });

  document.getElementById("searchInput").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderTable();
    if (document.getElementById("detailDrawer").getAttribute("aria-hidden") !== "true") {
      renderDetailDrawer();
    }
  });

  document.getElementById("sortSelect").addEventListener("change", (event) => {
    state.sort = event.target.value === "sku-asc" ? "dimension-asc" : event.target.value;
    renderTable();
  });

  document.getElementById("dateGranularityStage").addEventListener("click", (event) => {
    const button = event.target.closest("[data-date-granularity]");
    if (!button) return;
    state.dateGranularity = button.dataset.dateGranularity || "daily";
    state.search = "";
    state.sort = DEFAULT_SORT_BY_VIEW.date;
    renderTable();
  });

  document.getElementById("chartStage").addEventListener("click", (event) => {
    const metricButton = event.target.closest("[data-date-metric]");
    if (metricButton) {
      const metric = metricButton.dataset.dateMetric;
      if (!metric) return;
      if (state.dateMetrics.includes(metric)) {
        if (state.dateMetrics.length > 1) {
          state.dateMetrics = state.dateMetrics.filter((key) => key !== metric);
        }
      } else {
        state.dateMetrics = [...state.dateMetrics, metric];
      }
      renderTable();
      return;
    }

    const button = event.target.closest("[data-chart-filter]");
    if (!button) return;
    state.search = button.dataset.chartFilter || "";
    renderTable();
  });

  document.getElementById("tableStage").addEventListener("click", (event) => {
    const detailButton = event.target.closest('[data-action="table-detail"]');
    if (!detailButton) return;
    const filters = {};
    if (detailButton.dataset.sku) filters.seller_sku = detailButton.dataset.sku;
    if (detailButton.dataset.region) filters.region = detailButton.dataset.region;
    const titleParts = [filters.seller_sku, filters.region].filter(Boolean);
    openDetailDrawer(filters, `${titleParts.join(" / ") || "订单"} 订单明细`);
  });

  document.getElementById("insightStage").addEventListener("click", (event) => {
    const insightButton = event.target.closest("[data-insight-view]");
    if (insightButton) {
      state.insightView = insightButton.dataset.insightView;
      renderInsights();
      return;
    }

    const metricButton = event.target.closest("[data-matrix-metric]");
    if (metricButton) {
      state.matrixMetric = metricButton.dataset.matrixMetric;
      renderInsights();
      return;
    }

    const comparisonButton = event.target.closest("[data-comparison-mode]");
    if (comparisonButton) {
      state.comparisonMode = comparisonButton.dataset.comparisonMode || "auto";
      renderInsights();
      return;
    }

    const detailButton = event.target.closest("[data-action]");
    if (!detailButton) return;
    const action = detailButton.dataset.action;
    if (action === "detail-risk") {
      const risk = (DATA.riskRows || [])[Number(detailButton.dataset.index)];
      if (risk) openDetailDrawer(risk.filters || {}, risk.label || "风险订单明细");
    } else if (action === "detail-cell") {
      openDetailDrawer(
        { seller_sku: detailButton.dataset.sku || "", region: detailButton.dataset.region || "" },
        `${detailButton.dataset.sku || ""} / ${detailButton.dataset.region || "空地区"}`,
      );
    } else if (action === "detail-sku") {
      openDetailDrawer({ seller_sku: detailButton.dataset.sku || "" }, `${detailButton.dataset.sku || ""} 订单明细`);
    }
  });

  document.getElementById("detailClose").addEventListener("click", closeDetailDrawer);
  document.getElementById("detailDrawer").addEventListener("click", async (event) => {
    const copyButton = event.target.closest('[data-action="copy-order-ids"]');
    if (copyButton) {
      await copyDetailOrderIds();
      return;
    }

    const bucketButton = event.target.closest("[data-detail-bucket]");
    if (!bucketButton) return;
    const bucket = bucketButton.dataset.detailBucket || "";
    if (bucket) {
      state.detailFilters = { ...state.detailFilters, bucket };
    } else {
      state.detailFilters = filtersWithoutBucket(state.detailFilters);
    }
    renderDetailDrawer();
  });
  document.getElementById("detailClear").addEventListener("click", () => {
    state.detailFilters = {};
    state.detailTitle = "订单明细";
    renderDetailDrawer();
  });

  document.getElementById("fileInput").addEventListener("change", () => {
    renderFileSelection();
    resetInspection();
    renderDatePanel();
    inspectSelectedFiles();
  });

  document.querySelectorAll(".preset-chip").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      applyDateMode(button.dataset.dateMode);
    });
  });

  document.getElementById("startDateInput").addEventListener("input", () => {
    if (state.dateMode !== "custom") return;
    updateCustomDateRange();
  });

  document.getElementById("endDateInput").addEventListener("input", () => {
    if (state.dateMode !== "custom") return;
    updateCustomDateRange();
  });

  document.getElementById("uploadForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.busy || state.inspectBusy) return;

    const fileInput = document.getElementById("fileInput");
    if (!fileInput.files.length) {
      setStatus("请先选择至少一个表格文件", "error");
      return;
    }
    if (!hasInspection() || !hasSelectedRange()) {
      setStatus("请先完成日期识别并确认分析区间", "error");
      return;
    }
    if (state.selectedDateRange.startDate > state.selectedDateRange.endDate) {
      setStatus("开始日期不能晚于结束日期", "error");
      return;
    }

    const formData = new FormData();
    if (state.uploadToken) {
      formData.append("upload_token", state.uploadToken);
    } else {
      Array.from(fileInput.files).forEach((file) => formData.append("files", file));
    }
    formData.append("start_date", state.selectedDateRange.startDate);
    formData.append("end_date", state.selectedDateRange.endDate);
    formData.append("date_mode", state.dateMode);

    state.busy = true;
    renderDatePanel();
    setStatus(
      `分析中，共 ${fileInput.files.length} 个文件，范围 ${formatRange(state.selectedDateRange.startDate, state.selectedDateRange.endDate)}...`,
      "busy",
    );

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) {
        if ((payload.error || "").includes("缓存已失效")) {
          document.getElementById("fileInput").value = "";
          resetInspection();
          renderFileSelection();
          renderDatePanel();
        }
        throw new Error(payload.error || "分析失败");
      }
      DATA = normalizeReport(payload.report || EMPTY_DATA);
      if (state.view === "insights") {
        state.view = "sku";
      }
      state.insightView = "risk";
      state.comparisonMode = "auto";
      state.search = "";
      state.sort = DEFAULT_SORT_BY_VIEW[state.view] || "total-desc";
      renderAll();
      setStatus(`分析完成，共处理 ${DATA.summary.total_orders || 0} 单`, "success");
    } catch (error) {
      setStatus(error.message || "分析失败", "error");
    } finally {
      state.busy = false;
      renderDatePanel();
    }
  });
}

async function loadInitialReport() {
  if (hasData()) {
    renderAll();
    setStatus(`已加载最近一次结果，共 ${DATA.summary.total_orders || 0} 单`, "success");
    return;
  }

  try {
    const response = await fetch("/api/report");
    if (!response.ok) {
      throw new Error("无法读取当前结果");
    }
    DATA = normalizeReport(await response.json());
    renderAll();
    if (hasData()) {
      setStatus(`已加载最近一次结果，共 ${DATA.summary.total_orders || 0} 单`, "success");
    } else {
      setStatus("等待上传文件", "idle");
    }
  } catch (error) {
    renderAll();
    setStatus(error.message || "服务已启动，但暂时无法读取结果", "error");
  }
}

bindEvents();
renderAll();
loadInitialReport();
