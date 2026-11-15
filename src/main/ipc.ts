import { BrowserWindow, dialog, ipcMain } from "electron";
import { channels, type AgentSettings, type NewWorkspace, type TermKind } from "@shared/types";
import * as agents from "./agents";
import * as apps from "./apps";
import * as models from "./models";
import * as pr from "./pr";
import * as store from "./store";
import * as terminals from "./terminals";
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

  ipcMain.handle(channels.file, (_event, id: string, path: string) => workspaces.file(id, path));
  ipcMain.handle(channels.models, () => models.catalog());
  ipcMain.handle(channels.configure, (_event, id: string, settings: AgentSettings) => agents.configure(id, settings));
  ipcMain.handle(channels.transcript, (_event, id: string) => agents.transcript(id));
  ipcMain.handle(channels.send, (_event, id: string, text: string) => {
    agents.send(id, text).catch(() => undefined);
  });
  ipcMain.handle(channels.stop, (_event, id: string) => agents.stop(id));

  ipcMain.handle(channels.openTerminal, (_event, id: string, kind: TermKind, cols: number, rows: number) => terminals.open(id, kind, cols, rows));
  ipcMain.on(channels.writeTerminal, (_event, id: string, kind: TermKind, data: string) => terminals.write(id, kind, data));
  ipcMain.on(channels.resizeTerminal, (_event, id: string, kind: TermKind, cols: number, rows: number) => terminals.resize(id, kind, cols, rows));
  ipcMain.handle(channels.startApp, (_event, id: string) => apps.start(id));
  ipcMain.handle(channels.stopApp, (_event, id: string) => apps.stop(id));

  ipcMain.handle(channels.createPr, async (_event, id: string) => {
    const hasPr = !!store.get().workspaces.find((w) => w.id === id)?.prUrl;
    try {
      return await pr.create(id);
    } catch (error) {
      dialog.showErrorBox(hasPr ? "Couldn't push to the pull request" : "Couldn't create the pull request", error instanceof Error ? error.message : String(error));
      return null;
    }
  });

  store.subscribe((state) => {
    BrowserWindow.getAllWindows().forEach((window) => window.webContents.send(channels.stateChanged, state));
  });

  terminals.onData((event) => {
    BrowserWindow.getAllWindows().forEach((window) => window.webContents.send(channels.terminalData, event));
  });

  agents.onEntry((event) => {
    BrowserWindow.getAllWindows().forEach((window) => window.webContents.send(channels.entry, event));
  });
}
