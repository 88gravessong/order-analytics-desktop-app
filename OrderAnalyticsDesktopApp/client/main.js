const { app, BrowserWindow, dialog, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

let backendProcess = null;
let mainWindow = null;
let quitting = false;
let updateStatusTimer = null;

function appendUpdateLog(level, ...values) {
  const message = values
    .map((value) => {
      if (value instanceof Error) return value.stack || value.message;
      if (typeof value === "string") return value;
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    })
    .join(" ");
  const line = `${new Date().toISOString()} [${level}] ${message}\n`;

  try {
    const logPath = path.join(app.getPath("userData"), "updater.log");
    fs.appendFile(logPath, line, "utf8", () => {});
  } catch {
    // Updating must never prevent the application from starting.
  }
}

const updateLogger = {
  debug: (...values) => appendUpdateLog("debug", ...values),
  info: (...values) => appendUpdateLog("info", ...values),
  warn: (...values) => appendUpdateLog("warn", ...values),
  error: (...values) => appendUpdateLog("error", ...values),
};

function showNativeMessage(options) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return dialog.showMessageBox(mainWindow, options);
  }
  return dialog.showMessageBox(options);
}

function setUpdateStatus(message, progress = null, resetAfterMs = 0) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (updateStatusTimer) {
    clearTimeout(updateStatusTimer);
    updateStatusTimer = null;
  }

  mainWindow.setTitle(message ? `Order Analytics — ${message}` : "Order Analytics");
  mainWindow.setProgressBar(progress === null ? -1 : progress);

  if (resetAfterMs > 0) {
    updateStatusTimer = setTimeout(() => {
      updateStatusTimer = null;
      setUpdateStatus("");
    }, resetAfterMs);
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged) {
    updateLogger.info("开发模式：跳过自动更新检查");
    return;
  }
  if (!["win32", "darwin"].includes(process.platform)) {
    updateLogger.info(`当前平台不支持自动更新：${process.platform}`);
    return;
  }

  autoUpdater.logger = updateLogger;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.autoRunAppAfterInstall = true;

  // Separate macOS channels prevent the Intel and Apple Silicon metadata files
  // from overwriting each other in a single GitHub Release.
  autoUpdater.channel = process.platform === "darwin"
    ? `latest-${process.arch}`
    : "latest";

  autoUpdater.on("checking-for-update", () => {
    updateLogger.info("正在检查更新");
    setUpdateStatus("正在检查更新…");
  });

  autoUpdater.on("update-available", (info) => {
    updateLogger.info("发现新版本", info);
    setUpdateStatus(`发现 v${info.version}，正在下载…`, 0);
    void showNativeMessage({
      type: "info",
      title: "发现新版本",
      message: `Order Analytics v${info.version} 可用`,
      detail: "更新正在后台下载。下载完成后会提示你重启安装。",
      buttons: ["知道了"],
      defaultId: 0,
      noLink: true,
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    updateLogger.info("当前已是最新版本", info);
    setUpdateStatus(`已是最新版本 v${app.getVersion()}`, null, 4000);
  });

  autoUpdater.on("download-progress", (progress) => {
    const percent = Math.max(0, Math.min(100, Math.round(progress.percent)));
    updateLogger.info(`更新下载进度 ${percent}%`);
    setUpdateStatus(`正在下载更新 ${percent}%`, percent / 100);
  });

  autoUpdater.on("update-downloaded", (info) => {
    updateLogger.info("更新下载完成", info);
    setUpdateStatus(`v${info.version} 已下载，等待安装`, 1);

    void showNativeMessage({
      type: "info",
      title: "更新已下载",
      message: `Order Analytics v${info.version} 已准备好`,
      detail: "立即重启会关闭当前分析服务并安装更新。选择“稍后”时，更新将在退出应用后自动安装。",
      buttons: ["立即重启并安装", "稍后"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    }).then(({ response }) => {
      if (response !== 0) {
        setUpdateStatus("更新将在退出后安装", null, 5000);
        return;
      }

      quitting = true;
      stopBackend();
      autoUpdater.quitAndInstall(false, true);
    });
  });

  autoUpdater.on("error", (error) => {
    updateLogger.error("自动更新失败", error);
    setUpdateStatus("自动更新失败", null, 5000);
    void showNativeMessage({
      type: "warning",
      title: "自动更新失败",
      message: "暂时无法检查或下载更新",
      detail: `${error.message}\n\n你仍可继续使用当前版本，或稍后从 GitHub Releases 手动下载安装。`,
      buttons: ["继续使用"],
      defaultId: 0,
      noLink: true,
    });
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      updateLogger.error("检查更新请求失败", error);
    });
  }, 2000);
}

function backendExecutable() {
  const filename = process.platform === "win32"
    ? "order-analytics-backend.exe"
    : "order-analytics-backend";
  const root = app.isPackaged
    ? path.join(process.resourcesPath, "backend")
    : path.join(__dirname, "..", "backend-dist");
  return path.join(root, filename);
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function waitForService(url, attempts = 80) {
  return new Promise((resolve, reject) => {
    let remaining = attempts;
    const probe = () => {
      const request = http.get(url, (response) => {
        response.resume();
        if (response.statusCode >= 200 && response.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });
      request.setTimeout(1200, () => request.destroy());
      request.on("error", retry);
    };
    const retry = () => {
      remaining -= 1;
      if (remaining <= 0) {
        reject(new Error("订单分析服务启动超时"));
        return;
      }
      setTimeout(probe, 250);
    };
    probe();
  });
}

function startBackend(port) {
  const executable = backendExecutable();
  if (!fs.existsSync(executable)) {
    throw new Error(`找不到分析引擎：${executable}`);
  }

  const workspace = path.join(app.getPath("documents"), "OrderAnalyticsWorkspace");
  const logDir = app.getPath("userData");
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });
  const logStream = fs.createWriteStream(path.join(logDir, "backend.log"), { flags: "a" });

  backendProcess = spawn(
    executable,
    ["--workspace", workspace, "--host", "127.0.0.1", "--port", String(port), "--no-open"],
    {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PYTHONUTF8: "1" },
    },
  );
  backendProcess.stdout.pipe(logStream);
  backendProcess.stderr.pipe(logStream);
  backendProcess.on("exit", (code) => {
    logStream.end();
    if (!quitting && code !== 0) {
      dialog.showErrorBox("分析引擎已停止", `后端进程意外退出，错误码：${code ?? "未知"}`);
    }
  });
}

function stopBackend() {
  if (!backendProcess || backendProcess.killed) return;
  const pid = backendProcess.pid;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
  } else {
    backendProcess.kill("SIGTERM");
  }
  backendProcess = null;
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: "#f7f7f8",
    title: "Order Analytics",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadURL(url);
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith(url)) return { action: "allow" };
    shell.openExternal(target);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, target) => {
    if (!target.startsWith(url)) {
      event.preventDefault();
      shell.openExternal(target);
    }
  });
}

async function launch() {
  const port = await reservePort();
  const url = `http://127.0.0.1:${port}/`;
  startBackend(port);
  await waitForService(url);
  createWindow(url);
  setupAutoUpdater();
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(launch).catch((error) => {
    dialog.showErrorBox("Order Analytics 启动失败", error.message);
    app.quit();
  });
}

app.on("before-quit", () => {
  quitting = true;
  if (updateStatusTimer) clearTimeout(updateStatusTimer);
  stopBackend();
});

app.on("window-all-closed", () => app.quit());
