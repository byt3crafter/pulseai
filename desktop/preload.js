// Minimal, safe bridge. The renderer talks to the gateway with plain fetch();
// this just exposes app metadata and the platform.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("pulse", {
    version: require("./package.json").version,
    platform: process.platform,
});
