const os = require("node:os");

let previousCpuTimes = null;

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
  const current = os.cpus().map((cpu) => cpu.times);
  if (!previousCpuTimes) {
    previousCpuTimes = current;
    return 0;
  }

  let idleDelta = 0;
  let totalDelta = 0;
  for (let index = 0; index < current.length; index += 1) {
    const now = current[index];
    const before = previousCpuTimes[index] || now;
    const nowTotal = now.user + now.nice + now.sys + now.idle + now.irq;
    const beforeTotal = before.user + before.nice + before.sys + before.idle + before.irq;
    idleDelta += Math.max(0, now.idle - before.idle);
    totalDelta += Math.max(0, nowTotal - beforeTotal);
  }
  previousCpuTimes = current;

  if (totalDelta <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100)));
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
