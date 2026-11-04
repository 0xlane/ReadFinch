import type { SpeechConfig, VoiceChoice } from "./tts";
import type { ThinkingSnapshot } from "./completion";
import type { UpdateState, ProjectLink } from "./updates";
import type {
  LocalNote,
  NoteInput,
  NotePage,
  NoteQuery,
  SuggestionCardData,
} from "./notes";
import type { Config } from "./config";
import type { DirectoryData } from "./model-directory";
import type { ToolbarCommand, ToolbarView } from "./toolbar";
export type Selection = {
  token: string;
  text: string;
  app: string;
  x: number;
  y: number;
  canReplace: boolean;
};
export type JobEvent = {
  id: string;
  kind: "text" | "ocr";
  status: "streaming" | "done" | "error" | "cancelled" | "progress";
  text?: string;
  thinking?: ThinkingSnapshot;
  message?: string;
  progress?: number;
  confidence?: number;
};
export type Snapshot = {
  permissions: MacPermissions | null;
  interfaceLocale: "zh-CN" | "en";
  toolbarPausedUntil: number;
  version: string;
  updates: UpdateState;
  config: Config;
  revision: string;
  credentialIds: string[];
  ocrReady: boolean;
  platform: string;
  nativeStatus: string;
  nativeState: "starting" | "ready" | "limited" | "error";
  effectiveTheme: "light" | "dark";
  shortcutErrors: string[];
  sync: {
    enabled: boolean;
    url: string;
    username: string;
    remotePath: string;
    lastSync?: string;
    hasPassword: boolean;
  };
  recovery?: string;
};
export type MacPermissions = {
  accessibility: boolean;
  screen: "not-determined" | "granted" | "denied" | "restricted" | "unknown";
};
export type Capture = { dataUrl: string; width: number; height: number };
export type SettingsTab =
  | "general"
  | "text"
  | "tts"
  | "ocr"
  | "actions"
  | "shortcuts"
  | "config"
  | "notes"
  | "about";
export type SettingsLocation = {
  tab: SettingsTab;
  request: number;
  actionId?: string;
  noteId?: string;
  target?: "new-action" | "toolbar-settings";
};
export type Interaction = {
  id: string;
  source:
    | "selection"
    | "selection-unavailable"
    | "clipboard"
    | "capture"
    | "image"
    | "action-test"
    | "empty";
  text: string;
  selection?: Selection;
  capture?: Capture;
  actionId?: string;
  error?: string;
  pinned?: boolean;
};
export type ImportPreview = {
  token: string;
  config: Config;
  shortcuts: { name: string; key: string }[];
  missing: string[];
};
export type SyncResult = {
  status: "synced" | "conflict" | "limited";
  message: string;
  token?: string;
  local?: Config;
  remote?: Config;
  remoteDeleted?: boolean;
};
export type CallMap = {
  snapshot: { arg: void; result: Snapshot };
  updateCheck: { arg: void; result: UpdateState };
  updateDownload: { arg: void; result: UpdateState };
  updateInstall: { arg: void; result: UpdateState };
  updatePreference: { arg: { automatic: boolean }; result: UpdateState };
  openProjectLink: { arg: { link: ProjectLink }; result: void };
  saveNote: { arg: { note: NoteInput; create?: boolean }; result: string };
  saveSuggestions: {
    arg: { id: string; indexes: number[]; create?: boolean };
    result: string[];
  };
  disableNoteSuggestions: { arg: void; result: void };
  notesList: { arg: NoteQuery; result: NotePage };
  noteGet: { arg: { id: string }; result: LocalNote | null };
  noteDelete: { arg: { id: string }; result: void };
  clearCache: { arg: void; result: void };
  setTheme: { arg: { theme: "light" | "dark" | "system" }; result: Snapshot };
  settingsOpen: {
    arg: { tab: SettingsTab; noteId?: string; actionId?: string };
    result: void;
  };
  settingsTab: { arg: void; result: SettingsTab };
  settingsLocation: { arg: void; result: SettingsLocation };
  toolbarState: { arg: void; result: ToolbarView | null };
  toolbar: { arg: ToolbarCommand; result: void };
  resumeToolbar: { arg: void; result: Snapshot };
  interactionGet: { arg: void; result: Interaction | null };
  panelOpen: {
    arg: { source: "clipboard" | "empty" | "action-test"; actionId?: string };
    result: void;
  };
  panelResize: { arg: { height: number }; result: void };
  shortcutRecording: { arg: { id: string; active: boolean }; result: void };
  setTranslationPreference: {
    arg:
      | { sourceLanguage: string }
      | { targetLanguage: string }
      | { providerId: string };
    result: void;
  };
  saveConfig: { arg: { config: Config; revision: string }; result: Snapshot };
  duplicateProvider: {
    arg: { id: string; revision: string };
    result: { id: string; snapshot: Snapshot };
  };
  providerHeaders: {
    arg: { id: string; endpoint: string; value?: string };
    result: string;
  };
  saveCredential: {
    arg: { id: string; value: string; expectedScope?: string };
    result: Snapshot;
  };
  getCredential: {
    arg: { id: string; expectedScope: string };
    result: string;
  };
  runAction: {
    arg: {
      id: string;
      actionId: string;
      text: string;
      context: string;
      sourceLanguage: string;
      targetLanguage: string;
      providerId?: string;
      refresh?: boolean;
    };
    result: void;
  };
  cancel: { arg: { id: string }; result: void };
  speechBegin: {
    arg: { id: string };
    result: SpeechConfig & { onlineVoices: VoiceChoice[] };
  };
  speechAudio: {
    arg: {
      id: string;
      providerId: string;
      voice: string;
      text: string;
      speed: number;
    };
    result: { bytes: Uint8Array; mime: string };
  };
  speechEnd: { arg: { id: string }; result: void };
  detectLanguage: {
    arg: { text: string; localOnly?: boolean };
    result: string;
  };
  // null means this connection has no saved list. An empty array is a saved result.
  cachedModels: { arg: { scope: string }; result: string[] | null };
  listModels: {
    arg: { profileId: string; expectedScope?: string };
    result: string[];
  };
  modelDirectory: { arg: { refresh: boolean }; result: DirectoryData };
  testText: { arg: { profileId: string }; result: { durationMs: number } };
  recognize: {
    arg: { id: string; profileId: string; dataUrl: string; refresh?: boolean };
    result: void;
  };
  testVision: { arg: { id: string; profileId: string }; result: void };
  capture: { arg: void; result: void };
  captureData: { arg: void; result: Capture | null };
  captureReady: { arg: void; result: void };
  crop: {
    arg: {
      x: number;
      y: number;
      width: number;
      height: number;
      viewportWidth: number;
      viewportHeight: number;
    };
    result: void;
  };
  imageImport: { arg: void; result: void };
  clipboardRead: { arg: void; result: string };
  clipboardWrite: { arg: { text: string }; result: void };
  replace: { arg: { token: string; text: string }; result: void };
  selectionOpen: {
    arg: { actionId?: string; token?: string } | void;
    result: void;
  };
  selectionGet: { arg: void; result: Selection | null };
  exportConfig: { arg: void; result: string | null };
  previewImport: { arg: void; result: ImportPreview | null };
  applyImport: {
    arg: { token: string; mode: "merge" | "replace"; revision: string };
    result: Snapshot;
  };
  saveSync: {
    arg: {
      enabled: boolean;
      url: string;
      username: string;
      remotePath: string;
      password?: string;
    };
    result: Snapshot;
  };
  testSync: { arg: void; result: string };
  sync: {
    arg: { resolution?: "local" | "remote"; token?: string };
    result: SyncResult;
  };
  window: {
    arg: { command: "minimize" | "close" | "pin" | "dismiss"; value?: boolean };
    result: void;
  };
  openData: { arg: void; result: void };
  openPermissionSettings: {
    arg: { permission: "accessibility" | "screen" };
    result: void;
  };
};
export type EventMap = {
  permissions: MacPermissions | null;
  update: UpdateState;
  noteSuggestions: SuggestionCardData;
  notesChanged: void;
  actionShortcut: { actionId: string };
  theme: {
    preference: "light" | "dark" | "system";
    effective: "light" | "dark";
  };
  interaction: Interaction;
  hidden: void;
  speechStop: string;
  nativeStatus: { message: string; state: Snapshot["nativeState"] };
  settings: SettingsLocation;
  toolbarState: ToolbarView | null;
  job: JobEvent;
  selection: Selection;
  selectionInvalid: void;
  capture: Capture;
  config: Snapshot;
  clipboard: string;
};
export interface DesktopAPI {
  call<K extends keyof CallMap>(
    method: K,
    arg?: CallMap[K]["arg"],
  ): Promise<CallMap[K]["result"]>;
  on<K extends keyof EventMap>(
    event: K,
    listener: (value: EventMap[K]) => void,
  ): () => void;
}
declare global {
  interface Window {
    readfinch: DesktopAPI;
  }
}
