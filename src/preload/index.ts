import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from "electron";
import { channels, type Api, type AppState, type Auth, type EntryEvent, type TermData } from "@shared/types";

const api: Api = {
  state: () => ipcRenderer.invoke(channels.state),
  onState: (listener) => {
    const handler = (_event: IpcRendererEvent, state: AppState) => listener(state);
    ipcRenderer.on(channels.stateChanged, handler);
    return () => ipcRenderer.removeListener(channels.stateChanged, handler);
  },
  addRepo: () => ipcRenderer.invoke(channels.addRepo),
  removeRepo: (id) => ipcRenderer.invoke(channels.removeRepo, id),
  createWorkspace: (input) => ipcRenderer.invoke(channels.createWorkspace, input),
  removeWorkspace: (id) => ipcRenderer.invoke(channels.removeWorkspace, id),
  retrySetup: (id) => ipcRenderer.invoke(channels.retrySetup, id),
  changes: (id) => ipcRenderer.invoke(channels.changes, id),
  pending: (id) => ipcRenderer.invoke(channels.pending, id),
  file: (id, path) => ipcRenderer.invoke(channels.file, id, path),
  files: (id) => ipcRenderer.invoke(channels.files, id),
  readText: (id, path) => ipcRenderer.invoke(channels.readText, id, path),
  writeText: (id, path, text) => ipcRenderer.invoke(channels.writeText, id, path, text),
  repoFiles: (repoId) => ipcRenderer.invoke(channels.repoFiles, repoId),
  openImage: (path) => ipcRenderer.invoke(channels.openImage, path),
  readImage: (path) => ipcRenderer.invoke(channels.readImage, path),
  copyImage: (bytes) => ipcRenderer.invoke(channels.copyImage, bytes),
  saveImage: (suggested, bytes) => ipcRenderer.invoke(channels.saveImage, suggested, bytes),
  saveAttachment: (name, bytes) => ipcRenderer.invoke(channels.saveAttachment, name, bytes),
  pickAttachments: () => ipcRenderer.invoke(channels.pickAttachments),
  pathForFile: (file) => webUtils.getPathForFile(file),
  commands: (agent, repoId) => ipcRenderer.invoke(channels.commands, agent, repoId),
  setTheme: (theme) => ipcRenderer.invoke(channels.setTheme, theme),
  setDefaultAgent: (agent) => ipcRenderer.invoke(channels.setDefaultAgent, agent),
  setAgentDefaults: (agent, settings) => ipcRenderer.invoke(channels.setAgentDefaults, agent, settings),
  models: () => ipcRenderer.invoke(channels.models),
  configure: (id, settings) => ipcRenderer.invoke(channels.configure, id, settings),
  transcript: (id) => ipcRenderer.invoke(channels.transcript, id),
  onEntry: (listener) => {
    const handler = (_event: IpcRendererEvent, event: EntryEvent) => listener(event);
    ipcRenderer.on(channels.entry, handler);
    return () => ipcRenderer.removeListener(channels.entry, handler);
  },
  send: (id, text) => ipcRenderer.invoke(channels.send, id, text),
  unqueue: (id, queuedId) => ipcRenderer.invoke(channels.unqueue, id, queuedId),
  sendNow: (id, queuedId) => ipcRenderer.invoke(channels.sendNow, id, queuedId),
  stop: (id) => ipcRenderer.invoke(channels.stop, id),
  respond: (id, entryId, reply) => ipcRenderer.invoke(channels.respond, id, entryId, reply),
  openTerminal: (id, kind, cols, rows) => ipcRenderer.invoke(channels.openTerminal, id, kind, cols, rows),
  writeTerminal: (id, kind, data) => ipcRenderer.send(channels.writeTerminal, id, kind, data),
  resizeTerminal: (id, kind, cols, rows) => ipcRenderer.send(channels.resizeTerminal, id, kind, cols, rows),
  onTerminal: (listener) => {
    const handler = (_event: IpcRendererEvent, event: TermData) => listener(event);
    ipcRenderer.on(channels.terminalData, handler);
    return () => ipcRenderer.removeListener(channels.terminalData, handler);
  },
  startApp: (id, mode) => ipcRenderer.invoke(channels.startApp, id, mode),
  stopApp: (id) => ipcRenderer.invoke(channels.stopApp, id),
  runOptions: (id) => ipcRenderer.invoke(channels.runOptions, id),
  ports: (id) => ipcRenderer.invoke(channels.ports, id),
  share: (id, port) => ipcRenderer.invoke(channels.share, id, port),
  retarget: (id, port) => ipcRenderer.invoke(channels.retarget, id, port),
  unshare: (id) => ipcRenderer.invoke(channels.unshare, id),
  onCloseTab: (listener) => {
    const handler = () => listener();
    ipcRenderer.on(channels.closeTab, handler);
    return () => ipcRenderer.removeListener(channels.closeTab, handler);
  },
  onOpenSettings: (listener) => {
    const handler = () => listener();
    ipcRenderer.on(channels.openSettings, handler);
    return () => ipcRenderer.removeListener(channels.openSettings, handler);
  },
  auth: () => ipcRenderer.invoke(channels.auth),
  onAuth: (listener) => {
    const handler = (_event: IpcRendererEvent, auth: Auth) => listener(auth);
    ipcRenderer.on(channels.authChanged, handler);
    return () => ipcRenderer.removeListener(channels.authChanged, handler);
  },
  login: () => ipcRenderer.invoke(channels.login),
  cancelLogin: () => ipcRenderer.invoke(channels.cancelLogin),
  logout: () => ipcRenderer.invoke(channels.logout),
};

contextBridge.exposeInMainWorld("simpleton", api);
