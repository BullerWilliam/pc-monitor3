const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pcMonitor", {
  access: {
    onUpdate(callback) {
      ipcRenderer.on("access:update", (_event, state) => callback(state));
    },
    getState() {
      return ipcRenderer.invoke("access:get-state");
    },
    installStartup() {
      return ipcRenderer.invoke("access:install-startup");
    },
    uninstall() {
      return ipcRenderer.invoke("access:uninstall");
    }
  },
  monitor: {
    list() {
      return ipcRenderer.invoke("monitor:list");
    },
    addDevice(code) {
      return ipcRenderer.invoke("monitor:add-device", code);
    },
    saveNickname(pairingCode, nickname) {
      return ipcRenderer.invoke("monitor:save-nickname", pairingCode, nickname);
    },
    setRemote(pairingCode, requested) {
      return ipcRenderer.invoke("monitor:set-remote", pairingCode, requested);
    },
    refreshDevice(pairingCode) {
      return ipcRenderer.invoke("monitor:refresh-device", pairingCode);
    },
    saveSnapshot(pairingCode, dataUrl) {
      return ipcRenderer.invoke("monitor:save-snapshot", pairingCode, dataUrl);
    }
  }
});
