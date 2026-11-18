import { join } from "node:path";
import { app, BrowserWindow, nativeTheme, shell } from "electron";
import * as agents from "./agents";
import * as auth from "./auth";
import * as images from "./images";
import { registerIpc } from "./ipc";
import { setMenu } from "./menu";
import * as models from "./models";
import * as pr from "./pr";
import * as reports from "./reports";
import * as workspaces from "./workspaces";
import * as share from "./share";
import * as spotlight from "./spotlight";
import * as terminals from "./terminals";
import * as store from "./store";
import * as updates from "./updates";

const isMac = process.platform === "darwin";

const chrome = (): Electron.BrowserWindowConstructorOptions =>
  isMac
    ? { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 16, y: 16 }, vibrancy: "sidebar", visualEffectState: "followWindow", backgroundColor: "#00000000" }
    : { autoHideMenuBar: true, backgroundColor: nativeTheme.shouldUseDarkColors ? "#161616" : "#ffffff", ...(app.isPackaged ? {} : { icon: join(__dirname, "../../build/icon.png") }) };

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 860,
    minHeight: 560,
    show: false,
    title: "Simpleton",
    ...chrome(),
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

app.setName(app.isPackaged ? "Simpleton" : "Simpleton Dev");

if (!isMac && !app.requestSingleInstanceLock()) app.exit(0);

app.on("second-instance", (_event, argv) => {
  const url = auth.urlFrom(argv);
  app.whenReady().then(() => {
    if (url) auth.handleUrl(url);
    focusWindow();
  });
});

auth.registerScheme();
images.registerScheme();

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
  if (!app.isPackaged && isMac) {
    app.dock?.setIcon(join(__dirname, "../../build/icon.png"));
  }
  images.handle();
  nativeTheme.themeSource = (await store.load()).theme;
  await agents.recover();
  await workspaces.recoverSetups();
  workspaces.emptyTrash();
  registerIpc();
  pr.watch();
  reports.init().catch(() => undefined);
  models.catalog().catch(() => undefined);
  setMenu();
  createWindow();
  updates.init();
  spotlight.register().catch(() => undefined);

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
  if (!isMac) app.quit();
});
