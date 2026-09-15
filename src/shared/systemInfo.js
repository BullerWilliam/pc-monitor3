const os = require("node:os");

function localIpAddress() {
  const networks = os.networkInterfaces();
  for (const addresses of Object.values(networks)) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) {
        return address.address;
      }
    }
  }
  return "127.0.0.1";
}

function uptimeSeconds() {
  return Math.max(0, Math.floor(os.uptime()));
}

function memoryPercent() {
  const total = os.totalmem();
  if (!total) {
    return 0;
  }
  return Math.round(((total - os.freemem()) / total) * 100);
}

function cpuLoadPercent() {
  const load = os.loadavg()[0] || 0;
  const cpuCount = Math.max(os.cpus().length, 1);
  return Math.min(100, Math.round((load / cpuCount) * 100));
}

function accessMetadata(state, screenSize, frameTimestamp, remoteInteractionRequested) {
  return {
    pairingCode: state.pairingCode,
    hostname: os.hostname(),
    username: os.userInfo().username,
    osVersion: `${os.type()} ${os.release()}`,
    processor: os.cpus()[0]?.model || "Unknown processor",
    cpuLoadPercent: cpuLoadPercent(),
    memoryPercent: memoryPercent(),
    uptimeSeconds: uptimeSeconds(),
    host: localIpAddress(),
    port: state.port,
    streamPath: "/screen.mjpeg",
    statusPath: "/status",
    screenWidth: screenSize.width,
    screenHeight: screenSize.height,
    frameTimestamp,
    lastSeen: new Date().toISOString(),
    startedAt: state.startedAt,
    remoteInteractionRequested,
    remoteInteractionMode: "consent-toggle-only"
  };
}

module.exports = {
  accessMetadata,
  localIpAddress
};
