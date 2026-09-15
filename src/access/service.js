const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { BrowserWindow, app, desktopCapturer, nativeImage, shell } = require("electron");
const { FirebaseRegistry, loadFirebaseConfig } = require("../shared/firebase");
const { userFile } = require("../shared/paths");
const { ensureAppDir, readJson, writeJson } = require("../shared/storage");
const { accessMetadata } = require("../shared/systemInfo");

const STATE_PATH = () => userFile("access_state.json");

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
  constructor(sendUpdate) {
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
    this.overlay = null;
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
    this.overlay?.close();
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
    if (requested) {
      this.showOverlay();
    } else {
      this.overlay?.hide();
    }
  }

  showOverlay() {
    if (!this.overlay || this.overlay.isDestroyed()) {
      this.overlay = new BrowserWindow({
        width: 360,
        height: 110,
        x: 20,
        y: 20,
        frame: true,
        resizable: false,
        alwaysOnTop: true,
        title: "Remote session active",
        webPreferences: {
          sandbox: true
        }
      });
      this.overlay.loadFile(path.join(__dirname, "overlay.html"));
    }
    this.overlay.show();
  }

  installStartupShortcut() {
    const startupPath = path.join(
      app.getPath("appData"),
      "Microsoft",
      "Windows",
      "Start Menu",
      "Programs",
      "Startup"
    );
    fs.mkdirSync(startupPath, { recursive: true });
    const shortcutPath = path.join(startupPath, "PcMonitor3 Access.lnk");
    const shortcutTarget = app.isPackaged ? process.execPath : process.execPath;
    const shortcutArgs = app.isPackaged ? "--access" : `"${app.getAppPath()}" --access`;
    shell.writeShortcutLink(shortcutPath, "create", {
      target: shortcutTarget,
      args: shortcutArgs,
      workingDirectory: app.isPackaged ? path.dirname(process.execPath) : app.getAppPath(),
      description: "PcMonitor3 Access Agent"
    });
    app.setLoginItemSettings({
      openAtLogin: true,
      path: process.execPath,
      args: app.isPackaged ? ["--access"] : [app.getAppPath(), "--access"]
    });
    return shortcutPath;
  }

  uninstall() {
    app.setLoginItemSettings({ openAtLogin: false, path: process.execPath });
    if (fs.existsSync(STATE_PATH())) {
      fs.unlinkSync(STATE_PATH());
    }
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

module.exports = {
  AccessService
};
