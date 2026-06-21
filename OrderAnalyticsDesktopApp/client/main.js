const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

let backendProcess = null;
let mainWindow = null;
let quitting = false;

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
  stopBackend();
});

app.on("window-all-closed", () => app.quit());
