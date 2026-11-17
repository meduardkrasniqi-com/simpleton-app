export type Agent = "claude-code" | "codex";

export type Status = "setup" | "idle" | "working" | "input" | "ready" | "merged";

export type SetupStep = "fetch" | "worktree" | "env" | "agent";

export type Setup = { step: SetupStep; error?: string };

export type Repo = {
  id: string;
  name: string;
  path: string;
};

export type Workspace = {
  id: string;
  repoId: string;
  task: string;
  title?: string;
  summary?: string;
  agent: Agent;
  branch: string;
  base: string;
  path: string;
  status: Status;
  createdAt: number;
  sessionId?: string;
  model?: string;
  effort?: string;
  mode?: string;
  allow?: string[];
  prUrl?: string;
  prState?: PrState;
  setup?: Setup;
  queue?: Queued[];
  run?: RunMode;
};

export type Queued = { id: string; text: string };

export type PrState = "open" | "merged" | "closed";

export type ModelOption = {
  id: string;
  label: string;
  efforts: string[];
  defaultEffort?: string;
};

export type ModelCatalog = {
  models: Record<Agent, ModelOption[]>;
  defaults: Record<Agent, AgentSettings>;
  versions: Partial<Record<Agent, string>>;
};

export type AgentSettings = {
  model?: string;
  effort?: string;
  mode?: string;
};

export type ModeOption = {
  id: string;
  label: string;
};

export const modes: Record<Agent, ModeOption[]> = {
  "claude-code": [
    { id: "default", label: "Ask first" },
    { id: "acceptEdits", label: "Accept edits" },
    { id: "plan", label: "Plan" },
    { id: "auto", label: "Auto" },
    { id: "bypassPermissions", label: "Bypass" },
  ],
  codex: [
    { id: "read-only", label: "Read only" },
    { id: "workspace-write", label: "Auto" },
    { id: "danger-full-access", label: "Full access" },
  ],
};

export const defaultModes: Record<Agent, string> = { "claude-code": "auto", codex: "workspace-write" };

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

export type Detail = { kind: "command"; text: string } | { kind: "diff"; lines: DiffLine[] } | { kind: "text"; text: string };

export type Approval = {
  detail?: Detail;
  reason?: string;
  always?: string;
  state: "pending" | "allowed" | "always" | "denied" | "cancelled";
};

export type Choice = {
  label: string;
  description?: string;
};

export type Question = {
  question: string;
  header?: string;
  options: Choice[];
  multiSelect: boolean;
};

export type Reply = { kind: "allow"; always?: boolean } | { kind: "deny"; message?: string } | { kind: "answer"; answers: Record<string, string> } | { kind: "plan"; mode: string };

export type Entry =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string; parent?: string }
  | { id: string; kind: "thinking"; text: string; parent?: string }
  | { id: string; kind: "tool"; verb: string; target: string; label?: string; state: ToolState; approval?: Approval; command?: string; output?: string; parent?: string; agent?: string; background?: boolean }
  | { id: string; kind: "question"; questions: Question[]; answers?: Record<string, string>; state: "pending" | "answered" | "declined" | "cancelled" }
  | { id: string; kind: "plan"; plan: string; mode?: string; state: "pending" | "approved" | "rejected" | "cancelled" }
  | { id: string; kind: "error"; text: string }
  | { id: string; kind: "notice"; text: string }
  | { id: string; kind: "turn"; ms: number; files: FileChange[] };

export type EntryEvent = {
  workspaceId: string;
  entry: Entry;
};

export type ChangeStatus = "added" | "modified" | "deleted" | "untracked";

export type Pending = { dirty: boolean; ahead: number };

export type FileChange = {
  path: string;
  added: number;
  removed: number;
  status?: ChangeStatus;
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

export type RunMode = "dev" | "build";

export type RunOption = { mode: RunMode; command: string };

export type OpenPort = { port: number; name: string };

export type Preview = {
  state: "installing" | "starting" | "running" | "stopped" | "failed";
  port: number;
  url: string;
  mode?: RunMode;
};

export type ShareStatus = "connecting" | "live" | "error";

export type Share = {
  name: string;
  url: string;
  status: ShareStatus;
  error?: string;
  port?: number;
};

export type Theme = "system" | "light" | "dark";

export type AppState = {
  repos: Repo[];
  workspaces: Workspace[];
  previews: Record<string, Preview>;
  shares: Record<string, Share>;
  theme: Theme;
  agent: Agent;
  defaults: Record<Agent, AgentSettings>;
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

export type Command = {
  name: string;
  description: string;
  hint: string;
  origin: "project" | "user" | "plugin" | "builtin";
};

export type NewWorkspace = {
  repoId: string;
  task: string;
  agent: Agent;
  model?: string;
  effort?: string;
  mode?: string;
};

export type Api = {
  state: () => Promise<AppState>;
  onState: (listener: (state: AppState) => void) => () => void;
  addRepo: () => Promise<Repo | null>;
  removeRepo: (id: string) => Promise<void>;
  createWorkspace: (input: NewWorkspace) => Promise<Workspace>;
  removeWorkspace: (id: string) => Promise<void>;
  retrySetup: (id: string) => Promise<void>;
  changes: (id: string) => Promise<FileChange[]>;
  pending: (id: string) => Promise<Pending>;
  file: (id: string, path: string) => Promise<FileView>;
  files: (id: string) => Promise<string[]>;
  readText: (id: string, path: string) => Promise<string>;
  writeText: (id: string, path: string, text: string) => Promise<void>;
  repoFiles: (repoId: string) => Promise<string[]>;
  openImage: (path: string) => Promise<void>;
  readImage: (path: string) => Promise<Uint8Array>;
  copyImage: (bytes: Uint8Array) => Promise<void>;
  saveImage: (suggested: string, bytes: Uint8Array) => Promise<string | null>;
  saveAttachment: (name: string, bytes: Uint8Array) => Promise<string>;
  pickAttachments: () => Promise<string[]>;
  pathForFile: (file: File) => string;
  commands: (agent: Agent, repoId: string) => Promise<Command[]>;
  setTheme: (theme: Theme) => Promise<void>;
  setDefaultAgent: (agent: Agent) => Promise<void>;
  setAgentDefaults: (agent: Agent, settings: AgentSettings) => Promise<void>;
  models: () => Promise<ModelCatalog>;
  configure: (id: string, settings: AgentSettings) => Promise<void>;
  transcript: (id: string) => Promise<Entry[]>;
  onEntry: (listener: (event: EntryEvent) => void) => () => void;
  send: (id: string, text: string) => Promise<void>;
  unqueue: (id: string, queuedId: string) => Promise<void>;
  sendNow: (id: string, queuedId: string) => Promise<void>;
  stop: (id: string) => Promise<void>;
  respond: (id: string, entryId: string, reply: Reply) => Promise<void>;
  openTerminal: (id: string, kind: TermKind, cols: number, rows: number) => Promise<TermSnapshot>;
  writeTerminal: (id: string, kind: TermKind, data: string) => void;
  resizeTerminal: (id: string, kind: TermKind, cols: number, rows: number) => void;
  onTerminal: (listener: (event: TermData) => void) => () => void;
  startApp: (id: string, mode?: RunMode) => Promise<void>;
  stopApp: (id: string) => Promise<void>;
  runOptions: (id: string) => Promise<RunOption[]>;
  ports: (id: string) => Promise<OpenPort[]>;
  share: (id: string, port?: number) => Promise<void>;
  retarget: (id: string, port: number | null) => Promise<void>;
  unshare: (id: string) => Promise<void>;
  onCloseTab: (listener: () => void) => () => void;
  onOpenSettings: (listener: () => void) => () => void;
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
  retrySetup: "workspace:retry-setup",
  changes: "workspace:changes",
  pending: "workspace:pending",
  file: "workspace:file",
  files: "workspace:files",
  readText: "workspace:read-text",
  writeText: "workspace:write-text",
  repoFiles: "repo:files",
  openImage: "image:open",
  readImage: "image:read",
  copyImage: "image:copy",
  saveImage: "image:save",
  saveAttachment: "attachment:save",
  pickAttachments: "attachment:pick",
  commands: "agent:commands",
  setTheme: "app:theme",
  setDefaultAgent: "settings:agent",
  setAgentDefaults: "settings:agent-defaults",
  models: "agent:models",
  configure: "agent:configure",
  transcript: "agent:transcript",
  entry: "agent:entry",
  send: "agent:send",
  unqueue: "agent:unqueue",
  sendNow: "agent:send-now",
  stop: "agent:stop",
  respond: "agent:respond",
  openTerminal: "terminal:open",
  writeTerminal: "terminal:write",
  resizeTerminal: "terminal:resize",
  terminalData: "terminal:data",
  startApp: "app:start",
  stopApp: "app:stop",
  runOptions: "app:run-options",
  ports: "app:ports",
  share: "share:start",
  retarget: "share:retarget",
  unshare: "share:stop",
  closeTab: "window:close-tab",
  openSettings: "window:open-settings",
  auth: "auth:get",
  authChanged: "auth:changed",
  login: "auth:login",
  cancelLogin: "auth:cancel",
  logout: "auth:logout",
} as const;
