const addForm = document.querySelector("#addForm");
const pairingInput = document.querySelector("#pairingInput");
const registryError = document.querySelector("#registryError");
const deviceList = document.querySelector("#deviceList");
const deviceTitle = document.querySelector("#deviceTitle");
const deviceSubtitle = document.querySelector("#deviceSubtitle");
const nicknameInput = document.querySelector("#nicknameInput");
const saveNickname = document.querySelector("#saveNickname");
const remoteToggle = document.querySelector("#remoteToggle");
const metadata = document.querySelector("#metadata");
const screenImage = document.querySelector("#screenImage");
const screenPlaceholder = document.querySelector("#screenPlaceholder");
const multiButton = document.querySelector("#multiButton");
const gridModal = document.querySelector("#gridModal");
const closeGrid = document.querySelector("#closeGrid");
const grid = document.querySelector("#grid");

let devices = [];
let selectedCode = "";

function titleFor(device) {
  return device.nickname || device.pairingCode;
}

function isRecent(timestamp) {
  if (!timestamp) {
    return false;
  }
  return Date.now() - Date.parse(timestamp) < 30000;
}

function elapsed(timestamp) {
  if (!timestamp) {
    return "unknown";
  }
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(timestamp)) / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  return `${Math.floor(minutes / 60)}h`;
}

function statusFor(device) {
  return isRecent(device.lastSeen) ? "Online" : `Offline ${elapsed(device.lastSeen)}`;
}

function selectedDevice() {
  return devices.find((device) => device.pairingCode === selectedCode);
}

function renderList() {
  deviceList.innerHTML = "";
  for (const device of devices) {
    const button = document.createElement("button");
    button.className = `device-row ${device.pairingCode === selectedCode ? "selected" : ""}`;
    button.innerHTML = `
      <span class="${isRecent(device.lastSeen) ? "dot online" : "dot"}"></span>
      <span><strong>${titleFor(device)}</strong><small>${statusFor(device)}</small></span>
    `;
    button.addEventListener("click", () => {
      selectedCode = device.pairingCode;
      render();
    });
    deviceList.appendChild(button);
  }
}

function metadataFor(device) {
  const info = device.lastInfo || {};
  return [
    `Pairing: ${device.pairingCode}`,
    `Nickname: ${device.nickname || "(none)"}`,
    `User: ${info.username || "Unknown"}`,
    `Host: ${info.hostname || "Unknown"} (${info.host || "No IP"}:${info.port || "-"})`,
    `OS: ${info.osVersion || "Unknown"}`,
    `CPU: ${info.processor || "Unknown"}`,
    `CPU load: ${info.cpuLoadPercent ?? "-"}%`,
    `Memory load: ${info.memoryPercent ?? "-"}%`,
    `Uptime: ${info.uptimeSeconds ? `${Math.floor(info.uptimeSeconds / 60)}m` : "Unknown"}`,
    `Screen: ${info.screenWidth || "-"}x${info.screenHeight || "-"}`,
    `Last seen: ${device.lastSeen ? `${elapsed(device.lastSeen)} ago` : "Never"}`,
    `Last frame: ${device.lastFrameTs ? `${elapsed(device.lastFrameTs)} ago` : "Unknown"}`,
    `Remote interaction requested: ${device.remoteInteractionRequested ? "Yes" : "No"}`,
    `Remote mode: ${info.remoteInteractionMode || "unknown"}`
  ].join("\n");
}

function streamUrl(device) {
  const info = device.lastInfo || {};
  if (!info.host || !info.port) {
    return "";
  }
  return `http://${info.host}:${info.port}${info.streamPath || "/screen.mjpeg"}`;
}

function renderDetails() {
  const device = selectedDevice();
  const hasDevice = Boolean(device);
  nicknameInput.disabled = !hasDevice;
  saveNickname.disabled = !hasDevice;
  remoteToggle.disabled = !hasDevice;

  if (!device) {
    deviceTitle.textContent = "No PC selected";
    deviceSubtitle.textContent = "Add or select a pairing code.";
    metadata.textContent = "Pair a PC to see status and system metadata.";
    screenImage.removeAttribute("src");
    screenPlaceholder.hidden = false;
    return;
  }

  deviceTitle.textContent = titleFor(device);
  deviceSubtitle.textContent = statusFor(device);
  nicknameInput.value = device.nickname || "";
  remoteToggle.checked = Boolean(device.remoteInteractionRequested);
  metadata.textContent = metadataFor(device);
  const url = streamUrl(device);
  if (url) {
    screenImage.src = `${url}?t=${Date.now()}`;
    screenPlaceholder.hidden = true;
  } else {
    screenImage.removeAttribute("src");
    screenPlaceholder.hidden = false;
  }
}

function renderGrid() {
  grid.innerHTML = "";
  for (const device of devices) {
    const card = document.createElement("article");
    card.className = "grid-card";
    const url = streamUrl(device);
    card.innerHTML = `
      <header><strong>${titleFor(device)}</strong><span>${statusFor(device)}</span></header>
      ${url ? `<img src="${url}?t=${Date.now()}" alt="${titleFor(device)} screen" />` : "<p>No stream yet</p>"}
    `;
    grid.appendChild(card);
  }
}

function render() {
  renderList();
  renderDetails();
  if (!gridModal.classList.contains("hidden")) {
    renderGrid();
  }
}

async function load() {
  const state = await window.pcMonitor.monitor.list();
  devices = state.devices || [];
  registryError.textContent = state.registryError || "";
  if (!selectedCode && devices[0]) {
    selectedCode = devices[0].pairingCode;
  }
  render();
}

async function refreshAll() {
  for (const device of devices) {
    try {
      const result = await window.pcMonitor.monitor.refreshDevice(device.pairingCode);
      Object.assign(device, result.device);
    } catch {
      // Keep the previous snapshot visible when a single device misses a poll.
    }
  }
  render();
}

addForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  devices = await window.pcMonitor.monitor.addDevice(pairingInput.value);
  selectedCode = pairingInput.value.trim().toUpperCase();
  pairingInput.value = "";
  render();
  refreshAll();
});

saveNickname.addEventListener("click", async () => {
  const device = selectedDevice();
  if (!device) {
    return;
  }
  Object.assign(device, await window.pcMonitor.monitor.saveNickname(device.pairingCode, nicknameInput.value));
  render();
});

remoteToggle.addEventListener("change", async () => {
  const device = selectedDevice();
  if (!device) {
    return;
  }
  try {
    Object.assign(device, await window.pcMonitor.monitor.setRemote(device.pairingCode, remoteToggle.checked));
  } catch (error) {
    remoteToggle.checked = !remoteToggle.checked;
    registryError.textContent = error.message;
  }
  render();
});

multiButton.addEventListener("click", () => {
  gridModal.classList.remove("hidden");
  renderGrid();
});

closeGrid.addEventListener("click", () => {
  gridModal.classList.add("hidden");
});

screenImage.addEventListener("load", () => {
  const device = selectedDevice();
  if (!device) {
    return;
  }
  const canvas = document.createElement("canvas");
  canvas.width = screenImage.naturalWidth;
  canvas.height = screenImage.naturalHeight;
  const context = canvas.getContext("2d");
  try {
    context.drawImage(screenImage, 0, 0);
    window.pcMonitor.monitor.saveSnapshot(device.pairingCode, canvas.toDataURL("image/jpeg", 0.7));
  } catch {
    // Cross-origin streams may refuse canvas reads; the live preview still works.
  }
});

load().then(refreshAll);
setInterval(refreshAll, 5000);
