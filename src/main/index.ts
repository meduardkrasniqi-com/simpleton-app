import { join } from "node:path";
import { app, BrowserWindow, nativeTheme, shell } from "electron";
import * as agents from "./agents";
import { registerIpc } from "./ipc";
import * as terminals from "./terminals";
import * as store from "./store";

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 860,
    minHeight: 560,
    show: false,
    title: "Simpleton",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    vibrancy: "sidebar",
    visualEffectState: "followWindow",
    backgroundColor: "#00000000",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
    },
  });

  window.once("ready-to-show", () => window.show());

  window.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin === new URL(window.webContents.getURL()).origin) return;
    event.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.setName("Simpleton");

app.whenReady().then(async () => {
  if (!app.isPackaged && process.platform === "darwin") {
    app.dock?.setIcon(join(__dirname, "../../build/icon.png"));
  }
  nativeTheme.themeSource = "light";
  await store.load();
  await agents.recover();
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  agents.shutdown();
  terminals.shutdown();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
