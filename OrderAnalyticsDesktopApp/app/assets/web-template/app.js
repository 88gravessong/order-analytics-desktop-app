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
  monthly: "dimension-asc",
  daily: "dimension-asc",
};

const VIEW_LABELS = {
  sku: "SKU 汇总",
  region: "地区分析",
  monthly: "月度总览",
  daily: "日度总览",
};

const VIEW_SEARCH_PLACEHOLDERS = {
  sku: "搜索 SKU",
  region: "搜索 SKU / 地区",
  monthly: "搜索月份，如 2026-06",
  daily: "搜索日期，如 2026-06-23",
};

const VIEW_DIMENSION_SORT_LABELS = {
  sku: "按 SKU 升序",
  region: "按 SKU / 地区升序",
  monthly: "按月份升序",
  daily: "按日期升序",
};

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

function currentSourceRows() {
  if (state.view === "region") return DATA.regionRows || [];
  if (state.view === "monthly") return DATA.monthlyRows || [];
  if (state.view === "daily") return DATA.dailyRows || [];
  return DATA.skuRows || [];
}

function currentSearchHaystack(row) {
  if (state.view === "region") return `${row.seller_sku || ""} ${row.region || ""}`.toLowerCase();
  if (state.view === "monthly") return `${row.month || ""}`.toLowerCase();
  if (state.view === "daily") return `${row.date || ""}`.toLowerCase();
  return `${row.seller_sku || ""}`.toLowerCase();
}

function currentDimensionValue(row) {
  if (state.view === "region") return `${row.seller_sku || ""} ${row.region || ""}`;
  if (state.view === "monthly") return `${row.month || ""}`;
  if (state.view === "daily") return `${row.date || ""}`;
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
      <td><strong>${row.seller_sku}</strong></td>
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
      <td><strong>${row.seller_sku}</strong></td>
      <td>${row.region}</td>
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

function monthlyTable(rows) {
  const headers = ["序号", "月份", "订单数", "签收率", "已完成率", "已送达率", "退款率", "发货前取消率", "发货后取消率", "仍在途率"];
  const body = rows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td><strong>${row.month}</strong></td>
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

function dailyTable(rows) {
  const headers = ["序号", "日期", "订单数", "SKU 数", "签收率", "已完成率", "已送达率", "退款率", "发货前取消率", "发货后取消率", "仍在途率"];
  const body = rows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td><strong>${row.date}</strong></td>
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

function renderTable() {
  renderToolbarContext();
  document.getElementById("tableTitle").textContent = VIEW_LABELS[state.view] || "SKU 汇总";

  if (!hasData()) {
    document.getElementById("dataTable").innerHTML = emptyTable("等待分析", "上传订单表格并确认日期范围后，这里会显示分析结果。");
    return;
  }

  const rows = currentRows();
  if (!rows.length) {
    const message = state.search
      ? "当前搜索条件下没有结果。"
      : `${VIEW_LABELS[state.view] || "当前视图"}暂无数据，请重新分析当前文件后刷新。`;
    document.getElementById("dataTable").innerHTML = emptyTable("无匹配数据", message);
    return;
  }

  if (state.view === "region") {
    document.getElementById("dataTable").innerHTML = regionTable(rows);
  } else if (state.view === "monthly") {
    document.getElementById("dataTable").innerHTML = monthlyTable(rows);
  } else if (state.view === "daily") {
    document.getElementById("dataTable").innerHTML = dailyTable(rows);
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
  });

  document.getElementById("sortSelect").addEventListener("change", (event) => {
    state.sort = event.target.value === "sku-asc" ? "dimension-asc" : event.target.value;
    renderTable();
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
