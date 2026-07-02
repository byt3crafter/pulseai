// Pulse desktop — Electron main process.
// Creates the app window and loads the local renderer, which talks to the
// Pulse gateway App API (/api/app/*) over HTTP(S).
const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

function createWindow() {
    const win = new BrowserWindow({
        width: 1100,
        height: 760,
        minWidth: 380,
        minHeight: 560,
        backgroundColor: "#0a0a0b",
        title: "Pulse",
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    // Open external links in the OS browser, not inside the app.
    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: "deny" };
    });

    win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
    createWindow();
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
