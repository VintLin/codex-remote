export interface RawThreadListFixture {
  projectCwd: string;
  capturedAt: string;
  pages: RawThreadListPage[];
}

export interface RawSidebarProjectStateFixture {
  projectOrder: string[];
  savedWorkspaceRoots: string[];
  activeWorkspaceRoots: string[];
  pinnedProjectIds: string[];
  collapsedGroups: Record<string, boolean>;
  labels: Record<string, string>;
  projectlessThreadIds: string[];
  threadWorkspaceRootHints: Record<string, string>;
  threadProjectlessOutputDirectories: Record<string, string>;
}

export interface RawThreadListPage {
  data?: RawCodexThread[];
  threads?: RawCodexThread[];
  items?: RawCodexThread[];
  cursor?: string | null;
  nextCursor?: string | null;
}

export interface RawThreadReadFixture {
  projectCwd: string;
  capturedAt: string;
  threads: Record<string, RawThreadReadResult>;
}

export interface RawThreadReadResult {
  thread?: RawCodexThread;
  error?: unknown;
}

export interface RawCodexThread {
  id?: string;
  sessionId?: string;
  forkedFromId?: string | null;
  parentThreadId?: string | null;
  preview?: string;
  modelProvider?: string;
  createdAt?: number;
  updatedAt?: number;
  status?: string | { type?: string; activeFlags?: string[] };
  cwd?: string;
  name?: string | null;
  turns?: RawCodexTurn[];
}

export interface RawCodexTurn {
  id?: string;
  status?: string;
  itemsView?: unknown;
  error?: unknown;
  startedAt?: number | null;
  completedAt?: number | null;
  durationMs?: number | null;
  items?: RawCodexItem[];
}

export interface RawCodexItem {
  id?: string;
  type?: string;
  role?: string;
  text?: string;
  content?: unknown;
  title?: string;
  status?: string;
  command?: string | string[];
  name?: string;
  arguments?: unknown;
  output?: unknown;
  clientId?: string | null;
  server?: string;
  tool?: string;
  pluginId?: string | null;
  result?: unknown;
  error?: unknown;
  durationMs?: number | null;
  query?: string;
  action?: unknown;
  changes?: RawCodexFileChange[];
}

export interface RawCodexFileChange {
  path?: string;
  kind?: RawCodexFileChangeKind;
  diff?: string;
}

export type RawCodexFileChangeKind =
  | string
  | {
      type?: string;
    };
