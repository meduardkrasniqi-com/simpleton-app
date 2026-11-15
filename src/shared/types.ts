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
};

export type FileChange = {
  path: string;
  added: number;
  removed: number;
};

export type AppState = {
  repos: Repo[];
  workspaces: Workspace[];
};

export type NewWorkspace = {
  repoId: string;
  task: string;
  agent: Agent;
};

export type Api = {
  state: () => Promise<AppState>;
  onState: (listener: (state: AppState) => void) => () => void;
  addRepo: () => Promise<Repo | null>;
  removeRepo: (id: string) => Promise<void>;
  createWorkspace: (input: NewWorkspace) => Promise<Workspace>;
  removeWorkspace: (id: string) => Promise<void>;
  changes: (id: string) => Promise<FileChange[]>;
  reveal: (id: string) => Promise<void>;
};

export const channels = {
  state: "state:get",
  stateChanged: "state:changed",
  addRepo: "repo:add",
  removeRepo: "repo:remove",
  createWorkspace: "workspace:create",
  removeWorkspace: "workspace:remove",
  changes: "workspace:changes",
  reveal: "workspace:reveal",
} as const;
