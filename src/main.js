const path = require("node:path");
const fs = require("node:fs");
const { BrowserWindow, app, ipcMain } = require("electron");
const { AccessService } = require("./access/service");
const { FirebaseRegistry, loadFirebaseConfig } = require("./shared/firebase");
const { ensureAppDir } = require("./shared/storage");
const { loadMonitorState, normalizeCode, saveMonitorState, snapshotPath } = require("./monitor/store");

let mainWindow;
let accessService;
let monitorRegistry = null;
let monitorRegistryError = "";
let monitorState = { devices: [] };

function modeFromArgs() {
  const args = process.argv.map((arg) => arg.toLowerCase());
  const executable = path.basename(process.execPath).toLowerCase();
  const packageName = app.getName().toLowerCase();
  if (args.includes("--access") || executable.includes("access") || packageName.includes("access")) {
    return "access";
  }
  if (args.includes("--monitor") || executable.includes("monitor") || packageName.includes("monitor")) {
    return "monitor";
  }
  return "monitor";
}

function createWindow(mode) {
  mainWindow = new BrowserWindow({
    width: mode === "access" ? 680 : 1320,
    height: mode === "access" ? 520 : 860,
    minWidth: mode === "access" ? 560 : 1040,
    minHeight: mode === "access" ? 420 : 680,
    title: mode === "access" ? "PcMonitor3 Access" : "PcMonitor3 Monitor",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, mode, "index.html"));
}

function loadMonitorRegistry() {
  try {
    monitorRegistry = new FirebaseRegistry(loadFirebaseConfig());
    monitorRegistryError = "";
  } catch (error) {
    monitorRegistry = null;
    monitorRegistryError = error.message;
  }
}

function findDevice(code) {
  return monitorState.devices.find((device) => device.pairingCode === code);
}

function registerAccessIpc() {
  ipcMain.handle("access:get-state", () => accessService ? accessService.emit() : null);
  ipcMain.handle("access:install-startup", () => accessService.installStartupShortcut());
  ipcMain.handle("access:uninstall", () => {
    accessService.uninstall();
    return true;
  });
}

function registerMonitorIpc() {
  ipcMain.handle("monitor:list", () => ({
    devices: monitorState.devices,
    registryError: monitorRegistryError
  }));

  ipcMain.handle("monitor:add-device", (_event, code) => {
    const pairingCode = normalizeCode(code);
    if (!pairingCode) {
      throw new Error("Pairing code is required");
    }
    if (!findDevice(pairingCode)) {
      monitorState.devices.push({
        pairingCode,
        nickname: "",
        lastInfo: null,
        lastSeen: "",
        lastSnapshot: "",
        remoteInteractionRequested: false
      });
      saveMonitorState(monitorState);
    }
    return monitorState.devices;
  });

  ipcMain.handle("monitor:save-nickname", (_event, pairingCode, nickname) => {
    const device = findDevice(normalizeCode(pairingCode));
    if (!device) {
      throw new Error("Device not found");
    }
    device.nickname = String(nickname || "").trim();
    saveMonitorState(monitorState);
    return device;
  });

  ipcMain.handle("monitor:set-remote", async (_event, pairingCode, requested) => {
    const device = findDevice(normalizeCode(pairingCode));
    if (!device) {
      throw new Error("Device not found");
    }
    device.remoteInteractionRequested = Boolean(requested);
    saveMonitorState(monitorState);
    if (!monitorRegistry) {
      throw new Error(monitorRegistryError || "Firebase is not configured");
    }
    await monitorRegistry.patchPairing(device.pairingCode, {
      remoteInteractionRequested: device.remoteInteractionRequested
    });
    return device;
  });

  ipcMain.handle("monitor:refresh-device", async (_event, pairingCode) => {
    const device = findDevice(normalizeCode(pairingCode));
    if (!device) {
      throw new Error("Device not found");
    }
    if (!monitorRegistry) {
      return { device, registryError: monitorRegistryError };
    }
    const pairing = await monitorRegistry.fetchPairing(device.pairingCode);
    if (pairing) {
      device.lastInfo = pairing;
      device.lastSeen = pairing.lastSeen || device.lastSeen;
      device.remoteInteractionRequested = Boolean(pairing.remoteInteractionRequested);
      saveMonitorState(monitorState);
    }
    return { device, registryError: "" };
  });

  ipcMain.handle("monitor:save-snapshot", (_event, pairingCode, dataUrl) => {
    const device = findDevice(normalizeCode(pairingCode));
    if (!device || !dataUrl?.startsWith("data:image/jpeg;base64,")) {
      return null;
    }
    const filePath = snapshotPath(device.pairingCode);
    const base64 = dataUrl.replace("data:image/jpeg;base64,", "");
    fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
    device.lastSnapshot = filePath;
    device.lastFrameTs = new Date().toISOString();
    saveMonitorState(monitorState);
    return filePath;
  });
}

app.whenReady().then(async () => {
  ensureAppDir();
  const mode = modeFromArgs();
  createWindow(mode);

  if (mode === "access") {
    registerAccessIpc();
    accessService = new AccessService((state) => {
      mainWindow?.webContents.send("access:update", state);
    });
    await accessService.start();
  } else {
    monitorState = loadMonitorState();
    loadMonitorRegistry();
    registerMonitorIpc();
  }
});

app.on("window-all-closed", () => {
  accessService?.stop();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
