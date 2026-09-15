const { app } = require("electron");
const path = require("node:path");

const APP_DIR_NAME = "PcMonitor3";

function appDataDir() {
  return path.join(app.getPath("appData"), APP_DIR_NAME);
}

function userFile(name) {
  return path.join(appDataDir(), name);
}

function bundledFile(name) {
  return path.join(app.getAppPath(), name);
}

module.exports = {
  APP_DIR_NAME,
  appDataDir,
  bundledFile,
  userFile
};
