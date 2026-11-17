import { BrowserWindow, dialog, ipcMain, nativeTheme } from "electron";
import { channels, type Agent, type AgentSettings, type NewWorkspace, type Reply, type RunMode, type TermKind, type Theme } from "@shared/types";
import * as agents from "./agents";
import * as apps from "./apps";
import * as attachments from "./attachments";
import * as auth from "./auth";
import * as commands from "./commands";
import * as images from "./images";
import * as models from "./models";
import * as share from "./share";
import * as store from "./store";
import * as terminals from "./terminals";
import * as workspaces from "./workspaces";

const isAgent = (agent: unknown): agent is Agent => agent === "claude-code" || agent === "codex";

export function registerIpc() {
  ipcMain.handle(channels.state, () => store.get());
  ipcMain.handle(channels.auth, () => auth.get());
  ipcMain.handle(channels.login, () => auth.login());
  ipcMain.handle(channels.cancelLogin, () => auth.cancel());
  ipcMain.handle(channels.logout, () => auth.logout());

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
  ipcMain.handle(channels.retrySetup, (_event, id: string) => workspaces.retrySetup(id));
  ipcMain.handle(channels.changes, (_event, id: string) => workspaces.changes(id));
  ipcMain.handle(channels.pending, (_event, id: string) => workspaces.pending(id));

  ipcMain.handle(channels.file, (_event, id: string, path: string) => workspaces.file(id, path));
  ipcMain.handle(channels.files, (_event, id: string) => workspaces.files(id));
  ipcMain.handle(channels.readText, (_event, id: string, path: string) => workspaces.readText(id, path));
  ipcMain.handle(channels.writeText, (_event, id: string, path: string, text: string) => workspaces.writeText(id, path, text));
  ipcMain.handle(channels.openImage, (_event, path: string) => images.open(path));
  ipcMain.handle(channels.readImage, (_event, path: string) => images.read(path));
  ipcMain.handle(channels.copyImage, (_event, bytes: Uint8Array) => images.copy(bytes));
  ipcMain.handle(channels.saveImage, (event, suggested: string, bytes: Uint8Array) => images.save(BrowserWindow.fromWebContents(event.sender), suggested, bytes));
  ipcMain.handle(channels.saveAttachment, (_event, name: string, bytes: Uint8Array) => attachments.save(name, bytes));
  ipcMain.handle(channels.pickAttachments, (event) => attachments.pick(BrowserWindow.fromWebContents(event.sender)));
  ipcMain.handle(channels.repoFiles, (_event, repoId: string) => workspaces.repoFiles(repoId));
  ipcMain.handle(channels.commands, (_event, agent: Agent, repoId: string) => {
    const repo = store.get().repos.find((r) => r.id === repoId);
    return repo ? commands.commands(agent, repo.path) : [];
  });
  ipcMain.handle(channels.setTheme, async (_event, theme: Theme) => {
    if (!["system", "light", "dark"].includes(theme)) return;
    nativeTheme.themeSource = theme;
    await store.update((state) => ({ ...state, theme }));
  });
  ipcMain.handle(channels.setDefaultAgent, async (_event, agent: Agent) => {
    if (!isAgent(agent)) return;
    await store.update((state) => ({ ...state, agent }));
  });
  ipcMain.handle(channels.setAgentDefaults, async (_event, agent: Agent, settings: AgentSettings) => {
    if (!isAgent(agent)) return;
    const clean: AgentSettings = { model: settings.model || undefined, effort: settings.effort || undefined, mode: settings.mode || undefined };
    await store.update((state) => ({ ...state, defaults: { ...state.defaults, [agent]: clean } }));
  });
  ipcMain.handle(channels.models, () => models.catalog());
  ipcMain.handle(channels.configure, (_event, id: string, settings: AgentSettings) => agents.configure(id, settings));
  ipcMain.handle(channels.transcript, (_event, id: string) => agents.transcript(id));
  ipcMain.handle(channels.send, (_event, id: string, text: string) => {
    agents.send(id, text).catch(() => undefined);
  });
  ipcMain.handle(channels.stop, (_event, id: string) => agents.stop(id));
  ipcMain.handle(channels.unqueue, (_event, id: string, queuedId: string) => agents.unqueue(id, queuedId));
  ipcMain.handle(channels.sendNow, (_event, id: string, queuedId: string) => agents.sendNow(id, queuedId));
  ipcMain.handle(channels.respond, (_event, id: string, entryId: string, reply: Reply) => agents.respond(id, entryId, reply));

  ipcMain.handle(channels.openTerminal, (_event, id: string, kind: TermKind, cols: number, rows: number) => terminals.open(id, kind, cols, rows));
  ipcMain.on(channels.writeTerminal, (_event, id: string, kind: TermKind, data: string) => terminals.write(id, kind, data));
  ipcMain.on(channels.resizeTerminal, (_event, id: string, kind: TermKind, cols: number, rows: number) => terminals.resize(id, kind, cols, rows));
  ipcMain.handle(channels.startApp, (_event, id: string, mode?: RunMode) => apps.start(id, mode));
  ipcMain.handle(channels.stopApp, (_event, id: string) => apps.stop(id));
  ipcMain.handle(channels.runOptions, (_event, id: string) => apps.options(id));
  ipcMain.handle(channels.ports, (_event, id: string) => apps.ports(id));
  ipcMain.handle(channels.share, (_event, id: string, port?: number) => share.start(id, port));
  ipcMain.handle(channels.retarget, (_event, id: string, port: number | null) => share.retarget(id, port));
  ipcMain.handle(channels.unshare, (_event, id: string) => share.stop(id));

  store.subscribe((state) => {
    BrowserWindow.getAllWindows().forEach((window) => window.webContents.send(channels.stateChanged, state));
  });

  auth.subscribe((state) => {
    BrowserWindow.getAllWindows().forEach((window) => window.webContents.send(channels.authChanged, state));
  });

  terminals.onData((event) => {
    BrowserWindow.getAllWindows().forEach((window) => window.webContents.send(channels.terminalData, event));
  });

  agents.onEntry((event) => {
    BrowserWindow.getAllWindows().forEach((window) => window.webContents.send(channels.entry, event));
  });
}
