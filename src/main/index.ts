import { join } from "node:path";
import { app, BrowserWindow, nativeTheme, shell } from "electron";
import * as agents from "./agents";
import * as auth from "./auth";
import { registerIpc } from "./ipc";
import { setMenu } from "./menu";
import * as share from "./share";
import * as terminals from "./terminals";
import * as store from "./store";
import * as updates from "./updates";

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
  return window;
}

function focusWindow() {
  const window = BrowserWindow.getAllWindows()[0] ?? createWindow();
  if (window.isMinimized()) window.restore();
  window.show();
  app.focus({ steal: true });
}

app.setName("Simpleton");
auth.registerScheme();

app.on("open-url", (event, url) => {
  event.preventDefault();
  app.whenReady().then(() => auth.handleUrl(url));
});

auth.subscribe((next, previous) => {
  if (previous.status === "signing-in" && (next.status === "signed-in" || next.error) && app.isReady()) focusWindow();
  if (next.status === "signed-in") share.resume();
  if (next.status === "signed-out") share.suspend();
});

app.whenReady().then(async () => {
  if (!app.isPackaged && process.platform === "darwin") {
    app.dock?.setIcon(join(__dirname, "../../build/icon.png"));
  }
  nativeTheme.themeSource = (await store.load()).theme;
  await agents.recover();
  registerIpc();
  setMenu();
  createWindow();
  updates.init();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  await auth.restore();
});

app.on("before-quit", () => {
  agents.shutdown();
  terminals.shutdown();
  share.shutdown();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
