const path = require("node:path");
const { userFile } = require("../shared/paths");
const { readJson, snapshotsDir, writeJson } = require("../shared/storage");

const STATE_PATH = () => userFile("monitor_state.json");

function loadMonitorState() {
  return readJson(STATE_PATH(), { devices: [] });
}

function saveMonitorState(state) {
  writeJson(STATE_PATH(), state);
}

function normalizeCode(code) {
  return String(code || "").trim().toUpperCase();
}

function snapshotPath(pairingCode) {
  return path.join(snapshotsDir(), `${pairingCode}.jpg`);
}

module.exports = {
  loadMonitorState,
  normalizeCode,
  saveMonitorState,
  snapshotPath
};
