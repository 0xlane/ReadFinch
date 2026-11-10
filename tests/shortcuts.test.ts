import { legacyConfig } from "./legacy-config";
import test from "node:test";
import assert from "node:assert/strict";
import { defaultConfig, parseConfig } from "../src/shared/config";
import {
  normalizeShortcut,
  shortcutIdentity,
  shortcutFromEvent,
  shortcutBindings,
  shortcutConflict,
  formatShortcut,
} from "../src/shared/shortcuts";
import { ShortcutRegistry, ShortcutRepeatGuard } from "../src/core/shortcuts";
import { SelectionService } from "../src/main/native";
import type { Selection } from "../src/shared/api";

test("shortcut normalization validates combinations and compares actual platform keys", () => {
  assert.equal(normalizeShortcut("shift + ctrl + d"), "Control+Shift+D");
  assert.equal(normalizeShortcut("option + Esc"), "Alt+Escape");
  assert.equal(normalizeShortcut(""), "");
  for (const key of [
    "A",
    "Shift+A",
    "Alt",
    "Ctrl+Ctrl+A",
    "Ctrl+A+B",
    "Ctrl++",
    "Ctrl+F25",
  ])
    assert.throws(() => normalizeShortcut(key), key);
  assert.equal(
    shortcutIdentity("CmdOrCtrl+Shift+D", "win32"),
    shortcutIdentity("Shift+Ctrl+D", "win32"),
  );
  assert.equal(
    shortcutIdentity("Super+D", "darwin"),
    shortcutIdentity("Cmd+D", "darwin"),
  );
  assert.notEqual(
    shortcutIdentity("Ctrl+D", "darwin"),
    shortcutIdentity("Cmd+D", "darwin"),
  );
});
test("recorder uses physical letters for Option/Alt characters and rejects composition", () => {
  const event = {
    key: "∂",
    code: "KeyD",
    ctrlKey: false,
    altKey: true,
    shiftKey: true,
    metaKey: false,
  };
  assert.equal(shortcutFromEvent(event, "darwin"), "Alt+Shift+D");
  assert.equal(
    shortcutFromEvent(
      {
        ...event,
        key: "q",
        code: "KeyA",
        ctrlKey: true,
        altKey: false,
        shiftKey: false,
      },
      "win32",
    ),
    "Control+Q",
  );
  assert.equal(shortcutFromEvent({ ...event, isComposing: true }), null);
  assert.equal(
    shortcutFromEvent(
      { ...event, altKey: false, metaKey: true, shiftKey: false },
      "darwin",
    ),
    "Command+D",
  );
  assert.equal(
    shortcutFromEvent({
      ...event,
      key: "Shift",
      code: "ShiftLeft",
      altKey: false,
    }),
    null,
  );
});
function legacy() {
  const config = legacyConfig();
  config.schemaVersion = 1;
  config.actions.forEach((action: any) => delete action.shortcut);
  return config;
}
test("v1 upgrade preserves the old direct translation key, other preferences, and export round trips", () => {
  const old = legacy();
  old.shortcuts.selection = "Ctrl+Alt+F9";
  old.textProfiles[0].model = "personal-model";
  old.appearance.theme = "dark";
  const next = parseConfig(old);
  assert.equal(next.schemaVersion, 17);
  assert.equal(
    next.actions.find((a) => a.id === "translate")!.shortcut,
    "Ctrl+Alt+F9",
  );
  assert.equal(
    next.actions.find((a) => a.id === "dictionary")!.shortcut,
    "Alt+Shift+D",
  );
  assert.equal(next.shortcuts.selection, "");
  assert.equal(next.shortcuts.capture, old.shortcuts.capture);
  assert.equal(next.shortcuts.clipboard, old.shortcuts.clipboard);
  assert.equal(next.providers[0].model, old.textProfiles[0].model);
  assert.equal(next.providers[0].id, old.textProfiles[0].id);
  assert.deepEqual(next.appearance, old.appearance);
  assert.deepEqual(parseConfig(JSON.stringify(next)), next);
});
test("migration disables colliding new defaults even when legacy actions were reordered", () => {
  const old = legacy();
  old.shortcuts.selection = "shift+option+d";
  old.shortcuts.capture = "Alt+Shift+W";
  old.actions.reverse();
  const config = parseConfig(old);
  assert.equal(
    config.actions.find((a) => a.id === "translate")!.shortcut,
    "shift+option+d",
  );
  assert.equal(config.actions.find((a) => a.id === "dictionary")!.shortcut, "");
  assert.equal(config.actions.find((a) => a.id === "polish")!.shortcut, "");
});
test("conflicts include actions and entry points, with dormant and cleared bindings excluded", () => {
  const config = defaultConfig();
  config.actions[1].shortcut = "Shift+Control+D";
  config.shortcuts.capture = "Ctrl+Shift+D";
  assert.match(shortcutConflict(config), /词典.*框选|框选.*词典/);
  assert.throws(() => parseConfig(config), /快捷键冲突/);
  config.actions[1].enabled = false;
  assert.equal(shortcutConflict(config), "");
  config.actions[0].shortcut = "";
  config.shortcuts.selection = "";
  assert.ok(
    !shortcutBindings(parseConfig(config)).some((b) =>
      ["action:dictionary", "action:translate", "selection"].includes(b.id),
    ),
  );
});
test("registry preserves unchanged OS registrations, removes obsolete keys, and reports real failures", () => {
  const registered = new Map<string, () => void>();
  const invoked: string[] = [];
  let registrations = 0;
  const registry = new ShortcutRegistry(
    {
      register(key, callback) {
        registrations++;
        if (key === "Alt+F1") return false;
        registered.set(key, callback);
        return true;
      },
      unregister(key) {
        registered.delete(key);
      },
    },
    (id) => invoked.push(id),
    "win32",
  );
  const a = { id: "action:a", label: "指令 A", key: "Alt+T" };
  const b = { id: "action:b", label: "指令 B", key: "Alt+D" };
  assert.deepEqual(registry.update([a, b]), []);
  registry.update([a, b]);
  assert.equal(registrations, 2);
  registry.update([
    { ...a, key: b.key },
    { ...b, key: a.key },
  ]);
  registered.get("Alt+D")!();
  assert.deepEqual(invoked, [a.id]);
  const errors = registry.update([{ ...a, key: "Alt+F1" }]);
  assert.equal(registered.size, 0);
  assert.match(errors[0], /指令 A.*占用/);
  registry.triggerForTest(b.id);
  assert.deepEqual(invoked, [a.id]);
});
test("held shortcut keys are suppressed while switching actions is immediate", () => {
  const guard = new ShortcutRepeatGuard();
  assert.equal(guard.accept("translate", 0), true);
  for (let time = 100; time < 2000; time += 100)
    assert.equal(guard.accept("translate", time), false);
  assert.equal(guard.accept("dictionary", 2000), true);
  assert.equal(guard.accept("dictionary", 3000), true);
});
test(
  "native refresh matches response IDs and never returns an old cached selection",
  { skip: process.platform === "linux" },
  async () => {
    const native = new SelectionService("fixture");
    const cache: Selection = {
      token: "old",
      text: "STALE",
      app: "fixture",
      x: 0,
      y: 0,
      canReplace: false,
    };
    native.current = cache;
    const requests: any[] = [];
    (native as any).child = {
      killed: false,
      stdin: {
        writable: true,
        write: (line: string) => requests.push(JSON.parse(line)),
      },
      kill() {},
    };
    const pending = native.readCurrent();
    assert.equal(requests[0].op, "refresh");
    (native as any).receive({
      type: "selectionSnapshot",
      id: "unrelated",
      selection: cache,
    });
    const fresh = { ...cache, token: "new", text: "Keyboard-selected text" };
    (native as any).receive({
      type: "selectionSnapshot",
      id: requests[0].id,
      selection: fresh,
    });
    assert.deepEqual(await pending, fresh);
    let javaHint = false;
    const empty = native.readCurrent(() => {
      javaHint = true;
    });
    (native as any).receive({
      type: "selectionSnapshot",
      id: requests[1].id,
      selection: null,
      javaBridgeUnavailable: true,
    });
    assert.equal(await empty, undefined);
    assert.equal(javaHint, true);
    assert.equal(native.current, undefined);
    native.current = cache;
    const stopped = native.readCurrent();
    native.stop();
    assert.equal(await stopped, undefined);
  },
);

test("v15 adopts familiar input/selection/OCR defaults once and preserves custom or disabled keys", () => {
  const old: any = defaultConfig();
  old.schemaVersion = 15;
  delete old.shortcuts.input;
  old.shortcuts.capture = "CmdOrCtrl+Shift+2";
  old.actions.find((a: any) => a.id === "translate").shortcut = "Option+T";
  const next = parseConfig(old);
  assert.equal(next.shortcuts.input, "Alt+A");
  assert.equal(next.shortcuts.capture, "Alt+Shift+S");
  assert.equal(
    next.actions.find((a) => a.id === "translate")!.shortcut,
    "Alt+D",
  );
  next.shortcuts.input = "";
  assert.deepEqual(parseConfig(next), next);
  old.shortcuts.capture = "Ctrl+Alt+F7";
  old.actions[0].shortcut = "";
  const custom = parseConfig(old);
  assert.equal(custom.shortcuts.capture, "Ctrl+Alt+F7");
  assert.equal(custom.actions[0].shortcut, "");
});

test("shortcut migration never takes a custom action's key, including dormant actions", () => {
  const old: any = defaultConfig();
  old.schemaVersion = 15;
  delete old.shortcuts.input;
  old.shortcuts.selection = "Option+A";
  old.shortcuts.capture = "CommandOrControl+Shift+2";
  old.actions[0].shortcut = "Alt+T";
  old.actions[1].shortcut = "Option+D";
  old.actions[1].enabled = false;
  old.actions[2].shortcut = "Shift+Alt+S";
  const next = parseConfig(old);
  assert.equal(next.shortcuts.input, "");
  assert.equal(next.shortcuts.selection, "Option+A");
  assert.equal(next.shortcuts.capture, "CommandOrControl+Shift+2");
  assert.equal(next.actions[0].shortcut, "Alt+T");
});

test("Bob-style defaults use adjacent input/translation keys and a dedicated OCR combination", () => {
  const config = defaultConfig();
  assert.equal(config.shortcuts.input, "Alt+A");
  assert.equal(
    config.actions.find((a) => a.id === "translate")!.shortcut,
    "Alt+D",
  );
  assert.equal(config.shortcuts.capture, "Alt+Shift+S");
  assert.equal(formatShortcut(config.shortcuts.capture, "darwin"), "⌥ + ⇧ + S");
  assert.equal(
    formatShortcut(config.shortcuts.capture, "win32"),
    "Alt + Shift + S",
  );
  assert.equal(shortcutConflict(config), "");
});

test("v16 migrates old default shortcuts once, including normalized aliases", () => {
  const old: any = defaultConfig();
  old.schemaVersion = 16;
  old.shortcuts.capture = "Shift+CmdOrCtrl+2";
  old.actions.find((a: any) => a.id === "translate").shortcut = "Option+T";
  const original = structuredClone(old);
  const next = parseConfig(old);
  assert.equal(next.schemaVersion, 17);
  assert.equal(next.shortcuts.capture, "Alt+Shift+S");
  assert.equal(
    next.actions.find((a) => a.id === "translate")!.shortcut,
    "Alt+D",
  );
  assert.deepEqual(old, original, "Migration cannot mutate its input");
  next.shortcuts.capture = "";
  next.actions.find((a) => a.id === "translate")!.shortcut = "Alt+T";
  assert.deepEqual(
    parseConfig(JSON.stringify(next)),
    next,
    "User choices after migration stay intact",
  );
});

test("v16 preserves custom and cleared shortcuts and reserves dormant command keys", () => {
  const old: any = defaultConfig();
  old.schemaVersion = 16;
  const translate = old.actions.find((a: any) => a.id === "translate");
  translate.shortcut = "Alt+T";
  old.shortcuts.capture = "CmdOrCtrl+Shift+2";
  old.actions.push({
    ...old.actions[1],
    id: "custom-reserved",
    enabled: false,
    shortcut: "Option+D",
  });
  old.actions[1].enabled = false;
  old.actions[1].shortcut = "Shift+Option+S";
  const blocked = parseConfig(old);
  assert.equal(blocked.actions[0].shortcut, "Alt+T");
  assert.equal(blocked.shortcuts.capture, "CmdOrCtrl+Shift+2");
  for (const [translation, capture] of [
    ["Ctrl+Alt+F9", "Ctrl+Alt+F7"],
    ["", ""],
  ]) {
    translate.shortcut = translation;
    old.shortcuts.capture = capture;
    const preserved = parseConfig(old);
    assert.equal(preserved.actions[0].shortcut, translation);
    assert.equal(preserved.shortcuts.capture, capture);
  }
});
