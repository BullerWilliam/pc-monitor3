const crypto = require("node:crypto");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { app, desktopCapturer, nativeImage, shell } = require("electron");
const { FirebaseRegistry, loadFirebaseConfig } = require("../shared/firebase");
const { userFile } = require("../shared/paths");
const { ensureAppDir, readJson, writeJson } = require("../shared/storage");
const { accessMetadata } = require("../shared/systemInfo");

const STATE_PATH = () => userFile("access_state.json");

function accessExecutablePath() {
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
}

function startupShortcutPath() {
  return path.join(
    app.getPath("appData"),
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "Startup",
    "PcMonitor3 Access.lnk"
  );
}

function createPairingCode() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

function loadAccessState() {
  ensureAppDir();
  const state = readJson(STATE_PATH(), null);
  if (state?.pairingCode && state?.port) {
    return { ...state, startedAt: new Date().toISOString() };
  }
  const created = {
    pairingCode: createPairingCode(),
    port: 43173 + Math.floor(Math.random() * 1000),
    startedAt: new Date().toISOString()
  };
  writeJson(STATE_PATH(), created);
  return created;
}

class AccessService {
  constructor(sendUpdate = () => {}) {
    this.sendUpdate = sendUpdate;
    this.state = loadAccessState();
    this.frame = Buffer.alloc(0);
    this.frameTimestamp = "";
    this.screenSize = { width: 0, height: 0 };
    this.captureTimer = null;
    this.heartbeatTimer = null;
    this.server = null;
    this.registry = null;
    this.registryError = "";
    this.remoteInteractionRequested = false;
  }

  async start() {
    this.loadRegistry();
    await this.captureFrame();
    this.captureTimer = setInterval(() => this.captureFrame(), 160);
    this.server = this.createServer();
    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.state.port, "0.0.0.0", resolve);
    });
    await this.heartbeat();
    this.heartbeatTimer = setInterval(() => this.heartbeat(), 5000);
    this.emit();
  }

  stop() {
    clearInterval(this.captureTimer);
    clearInterval(this.heartbeatTimer);
    this.server?.close();
  }

  loadRegistry() {
    try {
      this.registry = new FirebaseRegistry(loadFirebaseConfig());
      this.registryError = "";
    } catch (error) {
      this.registry = null;
      this.registryError = error.message;
    }
  }

  async captureFrame() {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 1280, height: 720 }
    });
    const source = sources[0];
    if (!source) {
      return;
    }
    const image = nativeImage.createFromDataURL(source.thumbnail.toDataURL());
    const size = image.getSize();
    this.screenSize = size;
    this.frame = image.toJPEG(65);
    this.frameTimestamp = new Date().toISOString();
  }

  createServer() {
    return http.createServer(async (request, response) => {
      if (request.url === "/status") {
        const body = JSON.stringify(this.metadata());
        response.writeHead(200, {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body)
        });
        response.end(body);
        return;
      }

      if (request.url === "/screen.mjpeg") {
        response.writeHead(200, {
          "Cache-Control": "no-cache, private",
          "Pragma": "no-cache",
          "Connection": "close",
          "Content-Type": "multipart/x-mixed-replace; boundary=frame"
        });
        let closed = false;
        request.on("close", () => {
          closed = true;
        });
        while (!closed) {
          if (this.frame.length) {
            response.write("--frame\r\n");
            response.write("Content-Type: image/jpeg\r\n");
            response.write(`Content-Length: ${this.frame.length}\r\n\r\n`);
            response.write(this.frame);
            response.write("\r\n");
          }
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
        return;
      }

      response.writeHead(404);
      response.end("Not found");
    });
  }

  metadata() {
    return {
      ...accessMetadata(this.state, this.screenSize, this.frameTimestamp, this.remoteInteractionRequested),
      frameAvailable: this.frame.length > 0
    };
  }

  async heartbeat() {
    if (!this.registry) {
      this.emit();
      return;
    }
    try {
      const remoteState = await this.registry.fetchPairing(this.state.pairingCode);
      const requested = Boolean(remoteState?.remoteInteractionRequested);
      this.setRemoteIndicator(requested);
      await this.registry.putPairing(this.state.pairingCode, this.metadata());
      this.registryError = "";
    } catch (error) {
      this.registryError = error.message;
    }
    this.emit();
  }

  setRemoteIndicator(requested) {
    if (requested === this.remoteInteractionRequested) {
      return;
    }
    this.remoteInteractionRequested = requested;
  }

  installStartupShortcut() {
    const startupPath = path.dirname(startupShortcutPath());
    fs.mkdirSync(startupPath, { recursive: true });
    const shortcutPath = startupShortcutPath();
    const shortcutTarget = accessExecutablePath();
    const shortcutArgs = app.isPackaged ? "" : `"${app.getAppPath()}" --access`;
    shell.writeShortcutLink(shortcutPath, "create", {
      target: shortcutTarget,
      args: shortcutArgs,
      workingDirectory: app.isPackaged ? path.dirname(shortcutTarget) : app.getAppPath(),
      description: "PcMonitor3 Access Agent"
    });
    app.setLoginItemSettings({
      openAtLogin: true,
      path: shortcutTarget,
      args: app.isPackaged ? [] : [app.getAppPath(), "--access"]
    });
    installCommandShim();
    return shortcutPath;
  }

  removeRegistration() {
    app.setLoginItemSettings({ openAtLogin: false, path: accessExecutablePath() });
    const shortcutPath = startupShortcutPath();
    if (fs.existsSync(shortcutPath)) {
      fs.unlinkSync(shortcutPath);
    }
    removeCommandShim();
  }

  emit() {
    this.sendUpdate({
      pairingCode: this.state.pairingCode,
      port: this.state.port,
      streamUrl: `http://localhost:${this.state.port}/screen.mjpeg`,
      statusUrl: `http://localhost:${this.state.port}/status`,
      registryError: this.registryError,
      remoteInteractionRequested: this.remoteInteractionRequested,
      frameAvailable: this.frame.length > 0
    });
  }
}

function commandShimPath() {
  return path.join(path.dirname(userFile("placeholder")), "bin", "access.cmd");
}

function installCommandShim() {
  ensureAppDir();
  loadAccessState();
  const binDir = path.dirname(commandShimPath());
  fs.mkdirSync(binDir, { recursive: true });
  const target = app.isPackaged ? accessExecutablePath() : process.execPath;
  const devArgs = app.isPackaged ? "" : ` "${app.getAppPath()}" --access`;
  const launch = `"${target}"${devArgs}`;
  const script = [
    "@echo off",
    "setlocal",
    "set COMMAND=%~1",
    "if \"%COMMAND%\"==\"\" set COMMAND=help",
    "if /I \"%COMMAND%\"==\"help\" goto help",
    "if /I \"%COMMAND%\"==\"-h\" goto help",
    "if /I \"%COMMAND%\"==\"--help\" goto help",
    "if /I \"%COMMAND%\"==\"code\" goto code",
    "if /I \"%COMMAND%\"==\"remove\" goto remove",
    "echo Unknown access command: %COMMAND%",
    "echo.",
    "goto help",
    ":help",
    "echo PcMonitor3 Access",
    "echo.",
    "echo Commands:",
    "echo   access help             Show this help text",
    "echo   access code             Print this PC's pairing code",
    "echo   access remove           Remove Startup registration and this command",
    "exit /b 0",
    ":code",
    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$p = Join-Path $env:APPDATA 'PcMonitor3\\access_state.json'; if (!(Test-Path -LiteralPath $p)) { Write-Error 'No access state found. Run access.exe once first.'; exit 1 }; (Get-Content -LiteralPath $p -Raw | ConvertFrom-Json).pairingCode\"",
    "exit /b %ERRORLEVEL%",
    ":remove",
    `start /wait "" ${launch} remove`,
    "echo Access Startup registration and command removed.",
    "exit /b 0"
  ].join("\r\n");
  fs.writeFileSync(commandShimPath(), `${script}\r\n`, "utf8");
  addDirectoryToUserPath(binDir);
  return commandShimPath();
}

function removeCommandShim() {
  const shimPath = commandShimPath();
  const binDir = path.dirname(shimPath);
  removeDirectoryFromUserPath(binDir);
  if (fs.existsSync(shimPath)) {
    fs.unlinkSync(shimPath);
  }
}

function addDirectoryToUserPath(directory) {
  const currentPath = process.env.Path || process.env.PATH || "";
  const parts = currentPath.split(";").filter(Boolean);
  if (parts.some((part) => part.toLowerCase() === directory.toLowerCase())) {
    return;
  }
  const nextPath = [...parts, directory].join(";");
  childProcess.execFileSync("reg", ["add", "HKCU\\Environment", "/v", "Path", "/t", "REG_EXPAND_SZ", "/d", nextPath, "/f"], {
    windowsHide: true
  });
  process.env.Path = nextPath;
}

function removeDirectoryFromUserPath(directory) {
  const currentPath = process.env.Path || process.env.PATH || "";
  const parts = currentPath.split(";").filter(Boolean);
  const nextParts = parts.filter((part) => part.toLowerCase() !== directory.toLowerCase());
  if (nextParts.length === parts.length) {
    return;
  }
  const nextPath = nextParts.join(";");
  childProcess.execFileSync("reg", ["add", "HKCU\\Environment", "/v", "Path", "/t", "REG_EXPAND_SZ", "/d", nextPath, "/f"], {
    windowsHide: true
  });
  process.env.Path = nextPath;
}

module.exports = {
  AccessService,
  installCommandShim,
  loadAccessState
};
