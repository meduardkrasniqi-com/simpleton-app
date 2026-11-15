import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { channels, type NewWorkspace } from "@shared/types";
import * as store from "./store";
import * as workspaces from "./workspaces";

export function registerIpc() {
  ipcMain.handle(channels.state, () => store.get());

  ipcMain.handle(channels.addRepo, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = { title: "Add repository", properties: ["openDirectory" as const] };
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return null;
    try {
      return await workspaces.addRepo(result.filePaths[0]);
    } catch (error) {
      dialog.showErrorBox("Not a git repository", error instanceof Error ? error.message : String(error));
      return null;
    }
  });

  ipcMain.handle(channels.removeRepo, (_event, id: string) => workspaces.removeRepo(id));
  ipcMain.handle(channels.createWorkspace, (_event, input: NewWorkspace) => workspaces.createWorkspace(input));
  ipcMain.handle(channels.removeWorkspace, (_event, id: string) => workspaces.removeWorkspace(id));
  ipcMain.handle(channels.changes, (_event, id: string) => workspaces.changes(id));

  ipcMain.handle(channels.reveal, (_event, id: string) => {
    const workspace = workspaces.find(id);
    if (workspace) shell.showItemInFolder(workspace.path);
  });

  store.subscribe((state) => {
    BrowserWindow.getAllWindows().forEach((window) => window.webContents.send(channels.stateChanged, state));
  });
}
