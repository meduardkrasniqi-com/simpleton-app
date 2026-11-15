import { app, BrowserWindow, dialog } from "electron";
import electronUpdater from "electron-updater";

const { autoUpdater } = electronUpdater;

const INTERVAL_MS = 4 * 60 * 60 * 1000;

let manual = false;
let prompted: string | null = null;
let ready: string | null = null;

function show(options: Electron.MessageBoxOptions) {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  return window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options);
}

async function promptRestart(version: string) {
  if (prompted === version) return;
  prompted = version;
  const { response } = await show({
    type: "info",
    message: `Simpleton ${version} is ready`,
    detail: "Restart now to update, or it will install the next time you quit.",
    buttons: ["Restart", "Later"],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) setImmediate(() => autoUpdater.quitAndInstall());
}

function check() {
  autoUpdater.checkForUpdates().catch(() => undefined);
}

export function init() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    if (!manual) return;
    manual = false;
    show({ type: "info", message: `Downloading Simpleton ${info.version}`, buttons: ["OK"] });
  });

  autoUpdater.on("update-not-available", () => {
    if (!manual) return;
    manual = false;
    show({ type: "info", message: "Simpleton is up to date", detail: `Version ${app.getVersion()}`, buttons: ["OK"] });
  });

  autoUpdater.on("update-downloaded", (info) => {
    ready = info.version;
    promptRestart(info.version);
  });

  autoUpdater.on("error", (error) => {
    if (!manual) return;
    manual = false;
    show({ type: "error", message: "Couldn't check for updates", detail: error.message, buttons: ["OK"] });
  });

  check();
  setInterval(check, INTERVAL_MS);
}

export function checkNow() {
  if (!app.isPackaged) {
    show({ type: "info", message: "Updates only work in the installed app", buttons: ["OK"] });
    return;
  }
  if (ready) {
    prompted = null;
    promptRestart(ready);
    return;
  }
  manual = true;
  check();
}
