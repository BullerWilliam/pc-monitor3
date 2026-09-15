const fs = require("node:fs");
const { bundledFile, userFile } = require("./paths");

function loadFirebaseConfig() {
  const candidates = [userFile("firebase_config.json"), bundledFile("firebase_config.json")];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      const config = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (!config.database_url) {
        throw new Error(`${filePath} is missing database_url`);
      }
      return {
        databaseUrl: String(config.database_url).replace(/\/+$/, ""),
        authToken: config.auth_token ? String(config.auth_token) : ""
      };
    }
  }
  throw new Error(`Create firebase_config.json in the repo root or ${userFile("firebase_config.json")}`);
}

class FirebaseRegistry {
  constructor(config) {
    this.databaseUrl = config.databaseUrl;
    this.authToken = config.authToken;
  }

  url(path) {
    const auth = this.authToken ? `?auth=${encodeURIComponent(this.authToken)}` : "";
    return `${this.databaseUrl}/${path}.json${auth}`;
  }

  async fetchPairing(pairingCode) {
    const response = await fetch(this.url(`pairings/${encodeURIComponent(pairingCode)}`));
    if (!response.ok) {
      throw new Error(`Firebase read failed: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async putPairing(pairingCode, payload) {
    const response = await fetch(this.url(`pairings/${encodeURIComponent(pairingCode)}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`Firebase write failed: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async patchPairing(pairingCode, payload) {
    const response = await fetch(this.url(`pairings/${encodeURIComponent(pairingCode)}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`Firebase update failed: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }
}

module.exports = {
  FirebaseRegistry,
  loadFirebaseConfig
};
