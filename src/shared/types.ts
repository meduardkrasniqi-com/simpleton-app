export type Agent = "claude-code" | "codex";

export type Status = "idle" | "working" | "input" | "ready" | "merged";

export type Repo = {
  id: string;
  name: string;
  path: string;
};

export type Workspace = {
  id: string;
  repoId: string;
  task: string;
  agent: Agent;
  branch: string;
  base: string;
  path: string;
  status: Status;
  createdAt: number;
  sessionId?: string;
  model?: string;
  effort?: string;
  prUrl?: string;
};

export type PrResult = "created" | "opened" | "pushed";

export type ModelOption = {
  id: string;
  label: string;
  efforts: string[];
  defaultEffort?: string;
};

export type ModelCatalog = {
  models: Record<Agent, ModelOption[]>;
  defaults: Record<Agent, AgentSettings>;
};

export type AgentSettings = {
  model?: string;
  effort?: string;
};

export type DiffLine = {
  kind: "add" | "del" | "ctx" | "gap";
  text: string;
  n?: number;
};

export type FileView = {
  binary: boolean;
  truncated: boolean;
  lines: DiffLine[];
};

export type ToolState = "running" | "done" | "failed";

export type Entry =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string }
  | { id: string; kind: "tool"; verb: string; target: string; state: ToolState }
  | { id: string; kind: "error"; text: string }
  | { id: string; kind: "notice"; text: string };

export type EntryEvent = {
  workspaceId: string;
  entry: Entry;
};

export type FileChange = {
  path: string;
  added: number;
  removed: number;
};

export type TermKind = "shell" | "app";

export type TermData = {
  workspaceId: string;
  kind: TermKind;
  data: string;
  end: number;
};

export type TermSnapshot = {
  buffer: string;
  end: number;
};

export type Preview = {
  state: "starting" | "running" | "stopped" | "failed";
  port: number;
  url: string;
};

export type ShareStatus = "connecting" | "live" | "error";

export type Share = {
  name: string;
  url: string;
  status: ShareStatus;
  error?: string;
};

export type Theme = "system" | "light" | "dark";

export type AppState = {
  repos: Repo[];
  workspaces: Workspace[];
  previews: Record<string, Preview>;
  shares: Record<string, Share>;
  theme: Theme;
};

export type User = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

export type AuthStatus = "loading" | "signed-out" | "signing-in" | "signed-in";

export type Auth = {
  status: AuthStatus;
  user: User | null;
  error?: string;
};

export type NewWorkspace = {
  repoId: string;
  task: string;
  agent: Agent;
  model?: string;
  effort?: string;
};

export type Api = {
  state: () => Promise<AppState>;
  onState: (listener: (state: AppState) => void) => () => void;
  addRepo: () => Promise<Repo | null>;
  removeRepo: (id: string) => Promise<void>;
  createWorkspace: (input: NewWorkspace) => Promise<Workspace>;
  removeWorkspace: (id: string) => Promise<void>;
  changes: (id: string) => Promise<FileChange[]>;
  createPr: (id: string) => Promise<PrResult | null>;
  file: (id: string, path: string) => Promise<FileView>;
  files: (id: string) => Promise<string[]>;
  setTheme: (theme: Theme) => Promise<void>;
  models: () => Promise<ModelCatalog>;
  configure: (id: string, settings: AgentSettings) => Promise<void>;
  transcript: (id: string) => Promise<Entry[]>;
  onEntry: (listener: (event: EntryEvent) => void) => () => void;
  send: (id: string, text: string) => Promise<void>;
  stop: (id: string) => Promise<void>;
  openTerminal: (id: string, kind: TermKind, cols: number, rows: number) => Promise<TermSnapshot>;
  writeTerminal: (id: string, kind: TermKind, data: string) => void;
  resizeTerminal: (id: string, kind: TermKind, cols: number, rows: number) => void;
  onTerminal: (listener: (event: TermData) => void) => () => void;
  startApp: (id: string) => Promise<void>;
  stopApp: (id: string) => Promise<void>;
  share: (id: string) => Promise<void>;
  unshare: (id: string) => Promise<void>;
  onCloseTab: (listener: () => void) => () => void;
  auth: () => Promise<Auth>;
  onAuth: (listener: (auth: Auth) => void) => () => void;
  login: () => Promise<void>;
  cancelLogin: () => Promise<void>;
  logout: () => Promise<void>;
};

export const channels = {
  state: "state:get",
  stateChanged: "state:changed",
  addRepo: "repo:add",
  removeRepo: "repo:remove",
  createWorkspace: "workspace:create",
  removeWorkspace: "workspace:remove",
  changes: "workspace:changes",
  createPr: "workspace:pr",
  file: "workspace:file",
  files: "workspace:files",
  setTheme: "app:theme",
  models: "agent:models",
  configure: "agent:configure",
  transcript: "agent:transcript",
  entry: "agent:entry",
  send: "agent:send",
  stop: "agent:stop",
  openTerminal: "terminal:open",
  writeTerminal: "terminal:write",
  resizeTerminal: "terminal:resize",
  terminalData: "terminal:data",
  startApp: "app:start",
  stopApp: "app:stop",
  share: "share:start",
  unshare: "share:stop",
  closeTab: "window:close-tab",
  auth: "auth:get",
  authChanged: "auth:changed",
  login: "auth:login",
  cancelLogin: "auth:cancel",
  logout: "auth:logout",
} as const;
