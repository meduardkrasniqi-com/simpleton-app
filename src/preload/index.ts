import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { channels, type Api, type AppState, type EntryEvent, type TermData } from "@shared/types";

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
  changes: (id) => ipcRenderer.invoke(channels.changes, id),
  createPr: (id) => ipcRenderer.invoke(channels.createPr, id),
  file: (id, path) => ipcRenderer.invoke(channels.file, id, path),
  models: () => ipcRenderer.invoke(channels.models),
  configure: (id, settings) => ipcRenderer.invoke(channels.configure, id, settings),
  transcript: (id) => ipcRenderer.invoke(channels.transcript, id),
  onEntry: (listener) => {
    const handler = (_event: IpcRendererEvent, event: EntryEvent) => listener(event);
    ipcRenderer.on(channels.entry, handler);
    return () => ipcRenderer.removeListener(channels.entry, handler);
  },
  send: (id, text) => ipcRenderer.invoke(channels.send, id, text),
  stop: (id) => ipcRenderer.invoke(channels.stop, id),
  openTerminal: (id, kind, cols, rows) => ipcRenderer.invoke(channels.openTerminal, id, kind, cols, rows),
  writeTerminal: (id, kind, data) => ipcRenderer.send(channels.writeTerminal, id, kind, data),
  resizeTerminal: (id, kind, cols, rows) => ipcRenderer.send(channels.resizeTerminal, id, kind, cols, rows),
  onTerminal: (listener) => {
    const handler = (_event: IpcRendererEvent, event: TermData) => listener(event);
    ipcRenderer.on(channels.terminalData, handler);
    return () => ipcRenderer.removeListener(channels.terminalData, handler);
  },
  startApp: (id) => ipcRenderer.invoke(channels.startApp, id),
  stopApp: (id) => ipcRenderer.invoke(channels.stopApp, id),
};

contextBridge.exposeInMainWorld("simpleton", api);
