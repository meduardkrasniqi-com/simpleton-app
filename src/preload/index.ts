import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { channels, type Api, type AppState } from "@shared/types";

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
  reveal: (id) => ipcRenderer.invoke(channels.reveal, id),
};

contextBridge.exposeInMainWorld("simpleton", api);
