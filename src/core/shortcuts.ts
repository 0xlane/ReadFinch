import { t } from "../shared/i18n";
import {
  normalizeShortcut,
  shortcutIdentity,
  type ShortcutBinding,
} from "../shared/shortcuts";

type ShortcutApi = {
  register(key: string, callback: () => void): boolean;
  unregister(key: string): void;
};
export class ShortcutRegistry {
  private registered = new Map<string, { key: string; callback: () => void }>();
  constructor(
    private api: ShortcutApi,
    private invoke: (id: string) => void,
    private platform: string,
  ) {}
  update(bindings: ShortcutBinding[]) {
    const desired = new Map(
      bindings.map((binding) => [binding.id, normalizeShortcut(binding.key)]),
    );
    for (const [id, value] of this.registered) {
      if (desired.get(id) !== value.key) {
        this.api.unregister(value.key);
        this.registered.delete(id);
      }
    }
    const seen = new Map<string, string>();
    const errors: string[] = [];
    for (const binding of bindings) {
      const key = desired.get(binding.id)!;
      const identity = shortcutIdentity(key, this.platform);
      if (seen.has(identity)) {
        errors.push(
          t("「{0}」与「{1}」的快捷键冲突", binding.label, seen.get(identity)),
        );
        continue;
      }
      seen.set(identity, binding.label);
      if (this.registered.has(binding.id)) continue;
      const callback = () => this.invoke(binding.id);
      try {
        if (!this.api.register(key, callback)) {
          errors.push(
            t("「{0}」{1} 注册失败或已被其他应用占用", binding.label, key),
          );
          continue;
        }
        this.registered.set(binding.id, { key, callback });
      } catch {
        errors.push(t("「{0}」{1} 无法在当前系统注册", binding.label, key));
      }
    }
    return errors;
  }
  // Used only by the development integration harness to exercise the very
  // callback installed with the OS, without claiming a physical key press.
  triggerForTest(id: string) {
    this.registered.get(id)?.callback();
  }
}
export class ShortcutRepeatGuard {
  private previous = "";
  private time = -Infinity;
  accept(id: string, now = Date.now()) {
    const repeat = id === this.previous && now - this.time < 900;
    this.previous = id;
    this.time = now;
    return !repeat;
  }
}
