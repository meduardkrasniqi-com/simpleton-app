import { app, BrowserWindow, Menu } from "electron";
import { channels } from "@shared/types";
import * as updates from "./updates";

export function setMenu() {
  const isMac = process.platform === "darwin";
  const appMenu: Electron.MenuItemConstructorOptions = {
    label: app.name,
    submenu: [
      { role: "about" },
      { label: "Check for Updates…", click: () => updates.checkNow() },
      { type: "separator" },
      {
        label: "Settings…",
        accelerator: "CmdOrCtrl+,",
        click: (_item, window) => {
          if (window instanceof BrowserWindow) window.webContents.send(channels.openSettings);
        },
      },
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ],
  };
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [appMenu] : []),
    {
      label: "File",
      submenu: [
        {
          label: "Close Tab",
          accelerator: "CmdOrCtrl+W",
          click: (_item, window) => {
            if (window instanceof BrowserWindow) window.webContents.send(channels.closeTab);
          },
        },
        { label: "Close Window", accelerator: "Shift+CmdOrCtrl+W", role: "close" },
        ...(isMac ? [] : [{ type: "separator" as const }, { role: "quit" as const }]),
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
