import type { Action, Config } from "./config";

export type ToolbarMenu = "none" | "more" | "disable";
export type ToolbarRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type ToolbarView = {
  token: string;
  app: string;
  mode: ToolbarMenu;
  bar: ToolbarRect;
  popup?: ToolbarRect;
};
export type ToolbarCommand = { token: string } & (
  | { type: "menu"; mode: ToolbarMenu; focus?: boolean }
  | { type: "drag"; active: boolean }
  | { type: "pin"; key: string; pinned: boolean }
  | { type: "move"; key: string; over: string }
  | { type: "disable"; scope: "hour" | "app" | "global" }
  | { type: "new-action" | "settings" }
);
export type ToolbarItem = {
  key: string;
  name: string;
  pinned: boolean;
  action?: Action;
};

export function toolbarItems(config: Config): ToolbarItem[] {
  const items: ToolbarItem[] = config.actions
    .filter((a) => a.enabled)
    .map((action) => ({
      key: "action:" + action.id,
      name: action.name,
      pinned: action.pinned,
      action,
    }));
  items.splice(config.selection.speechIndex, 0, {
    key: "speech",
    name: "朗读",
    pinned: config.selection.speechPinned,
  });
  return items;
}
export function editToolbar(
  config: Config,
  command: Extract<ToolbarCommand, { type: "pin" | "move" }>,
): Config {
  const items = toolbarItems(config);
  const index = items.findIndex((item) => item.key === command.key);
  if (index < 0) throw Error("此工具栏项目已停用或删除");
  if (command.type === "pin") {
    const action = items[index].action;
    if (!action)
      return {
        ...config,
        selection: { ...config.selection, speechPinned: command.pinned },
      };
    return {
      ...config,
      actions: config.actions.map((a) =>
        a.id === action.id ? { ...a, pinned: command.pinned } : a,
      ),
    };
  }
  const to = items.findIndex((item) => item.key === command.over);
  if (to < 0 || to === index) return config;
  items.splice(to, 0, ...items.splice(index, 1));
  const ordered = items.flatMap((item) => (item.action ? [item.action] : []));
  let i = 0;
  return {
    ...config,
    selection: {
      ...config.selection,
      speechIndex: items.findIndex((item) => !item.action),
    },
    actions: config.actions.map((a) => (a.enabled ? ordered[i++] : a)),
  };
}
export function toolbarEnabled(
  config: Config,
  app: string,
  pausedUntil: number,
  now = Date.now(),
) {
  const name = app.trim().toLowerCase();
  return (
    config.selection.automatic &&
    pausedUntil <= now &&
    !config.selection.excludedApps.some((excluded) =>
      name.includes(excluded.toLowerCase()),
    ) &&
    !config.selection.disabledToolbarApps.some(
      (excluded) => name === excluded.toLowerCase(),
    )
  );
}
