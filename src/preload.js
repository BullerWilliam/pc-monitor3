const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pcMonitor", {
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
