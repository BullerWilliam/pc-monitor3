const fs = require("node:fs");
const path = require("node:path");
const { appDataDir } = require("./paths");

function ensureAppDir() {
  fs.mkdirSync(appDataDir(), { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

function writeJson(filePath, value) {
  ensureAppDir();
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function snapshotsDir() {
  const dir = path.join(appDataDir(), "snapshots");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = {
  ensureAppDir,
  readJson,
  snapshotsDir,
  writeJson
};
