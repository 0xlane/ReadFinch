import { useState } from "react";
import type { Snapshot, SettingsTab } from "../shared/api";
import { t } from "../shared/i18n";

export function PermissionNotice({
  snapshot,
  tab,
}: {
  snapshot: Snapshot;
  tab: SettingsTab;
}) {
  const [error, setError] = useState("");
  const permissions = snapshot.permissions;
  if (!permissions) return null;
  const missing = [
    ...(!permissions.accessibility ? ["accessibility" as const] : []),
    ...(permissions.screen !== "granted" && (tab === "general" || tab === "ocr")
      ? ["screen" as const]
      : []),
  ];
  if (!missing.length) return null;
  return (
    <section className="permission-notice alert" aria-label={t("系统权限")}>
      {missing.map((permission) => (
        <div className="permission-row" key={permission}>
          <div>
            <strong>
              {t(
                permission === "accessibility"
                  ? "需要辅助功能权限"
                  : "截图需要录屏权限",
              )}
            </strong>
            <p>
              {t(
                permission === "accessibility"
                  ? "允许 ReadFinch 读取其他应用中选中的文字，划词工具栏才能显示。开启后会自动连接。"
                  : "允许 ReadFinch 录制屏幕，才能框选文字。开启后返回重试；若系统要求重启，请按提示操作。",
              )}
            </p>
          </div>
          <button
            className="secondary"
            onClick={() => {
              setError("");
              void window.readfinch
                .call("openPermissionSettings", { permission })
                .catch((e) => setError(e.message));
            }}
          >
            {t(
              permission === "accessibility"
                ? "打开辅助功能设置"
                : "打开录屏设置",
            )}
          </button>
        </div>
      ))}
      <p className="helper">
        {t(
          "如果更新后开关已开启但仍提示缺少权限，请在系统设置中移除旧条目，重新添加当前 ReadFinch。",
        )}
      </p>
      {error && <p role="alert">{t(error)}</p>}
    </section>
  );
}
