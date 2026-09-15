const pairingCode = document.querySelector("#pairingCode");
const statusUrl = document.querySelector("#statusUrl");
const streamUrl = document.querySelector("#streamUrl");
const remoteState = document.querySelector("#remoteState");
const firebaseState = document.querySelector("#firebaseState");
const preview = document.querySelector("#preview");
const startupButton = document.querySelector("#startupButton");
const uninstallButton = document.querySelector("#uninstallButton");

function render(state) {
  if (!state) {
    return;
  }
  pairingCode.textContent = state.pairingCode;
  statusUrl.textContent = state.statusUrl;
  streamUrl.textContent = state.streamUrl;
  remoteState.textContent = state.remoteInteractionRequested ? "On" : "Off";
  firebaseState.textContent = state.registryError || "Connected";
  firebaseState.classList.toggle("error", Boolean(state.registryError));
  if (preview.src !== state.streamUrl) {
    preview.src = state.streamUrl;
  }
}

window.pcMonitor.access.onUpdate(render);
window.pcMonitor.access.getState();

startupButton.addEventListener("click", async () => {
  const location = await window.pcMonitor.access.installStartup();
  startupButton.textContent = "Startup installed";
  startupButton.title = location;
});

uninstallButton.addEventListener("click", async () => {
  await window.pcMonitor.access.uninstall();
  uninstallButton.textContent = "Removed";
});
