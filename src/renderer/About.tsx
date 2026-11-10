import { useState } from "react";
import {
  ArrowUpRight,
  ArrowDownToLine,
  Check,
  CircleAlert,
  Code2,
  Github,
  LoaderCircle,
  MessageSquare,
  RefreshCw,
  RotateCw,
} from "lucide-react";
import { t } from "../shared/i18n";
import { type ProjectLink, type UpdateState } from "../shared/updates";
import { Toggle } from "./ui";
import "./about.css";

function ProjectButton({
  link,
  children,
  className = "",
}: {
  link: ProjectLink;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      className={className}
      onClick={() => void window.readfinch.call("openProjectLink", { link })}
    >
      {children}
    </button>
  );
}
export function About({ state }: { state: UpdateState }) {
  return (
    <div className="page about-page">
      <header className="page-heading">
        <div>
          <h1>{t("关于伴读雀")}</h1>
        </div>
      </header>
      <section className="about-identity">
        <img
          className="about-icon"
          src="icon.png"
          width="72"
          height="72"
          alt=""
        />
        <div>
          <h2>
            {t("伴读雀")}
            {t("伴读雀") !== "ReadFinch" && <span>ReadFinch</span>}
          </h2>
          <p>{t("陪你读懂，也帮你写好。")}</p>
          <div className="about-version">
            <span>v{state.currentVersion}</span>
            <span>
              {state.platform === "win32"
                ? "Windows"
                : state.platform === "darwin"
                  ? "macOS"
                  : "Linux"}{" "}
              · {state.arch}
            </span>
            <ProjectButton link="releases">
              {t("版本记录")} <ArrowUpRight size={13} />
            </ProjectButton>
          </div>
        </div>
      </section>
      <UpdateSettings state={state} />
      <section className="about-links" aria-label={t("项目与支持")}>
        <ProjectButton link="repository" className="about-link">
          <Github size={21} />
          <span>
            <strong>{t("开源项目")}</strong>
            <small>github.com/0xlane/ReadFinch</small>
          </span>
          <ArrowUpRight size={17} />
        </ProjectButton>
        <ProjectButton link="issues" className="about-link">
          <MessageSquare size={21} />
          <span>
            <strong>{t("反馈与建议")}</strong>
            <small>{t("报告问题，或告诉我们你希望加入的功能。")}</small>
          </span>
          <ArrowUpRight size={17} />
        </ProjectButton>
      </section>
      <DiagnosticExport />
      <section className="about-open-source">
        <Code2 size={19} />
        <div>
          <h3>{t("开放源码，与你一起成长")}</h3>
          <p>
            {t(
              "伴读雀以 GPL-3.0 开源。感谢 Read Frog 及所有开源项目为阅读体验带来的启发与贡献。",
            )}
          </p>
          <div>
            <ProjectButton link="license">
              {t("开源许可")}
              <ArrowUpRight size={13} />
            </ProjectButton>
            <ProjectButton link="credits">
              {t("第三方致谢")}
              <ArrowUpRight size={13} />
            </ProjectButton>
          </div>
        </div>
      </section>
    </div>
  );
}
function DiagnosticExport() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"" | "success" | "error">("");
  async function exportLogs() {
    setBusy(true);
    setStatus("");
    try {
      if (await window.readfinch.call("exportDiagnostics"))
        setStatus("success");
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="about-diagnostics" aria-label={t("故障诊断")}>
      <div>
        <h3>{t("故障诊断")}</h3>
        <p>
          {t(
            "遇到划词异常时，可导出日志随问题反馈。记录相关应用名称和故障阶段，仅保存在本机，不包含选中文字、剪贴板内容或密钥。",
          )}
        </p>
        {status && (
          <p
            role="status"
            className={status === "error" ? "diagnostic-error" : ""}
          >
            {t(
              status === "success"
                ? "诊断日志已导出"
                : "诊断日志导出失败，请重试。",
            )}
          </p>
        )}
      </div>
      <button
        className="secondary"
        disabled={busy}
        onClick={() => void exportLogs()}
      >
        {busy ? (
          <LoaderCircle size={15} className="spin" />
        ) : (
          <ArrowDownToLine size={15} />
        )}
        {t("导出诊断日志")}
      </button>
    </section>
  );
}
const statusTitles: Record<UpdateState["status"], string> = {
  idle: "让伴读雀保持最新",
  checking: "正在检查更新…",
  latest: "已是最新版本",
  available: "发现新版本",
  downloading: "正在下载更新…",
  downloaded: "更新已准备就绪",
  installing: "正在准备安装…",
  error: "暂时无法完成更新",
};
const megabytes = (bytes: number) => (bytes / 1024 / 1024).toFixed(1) + " MB";
function UpdateSettings({ state }: { state: UpdateState }) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = ["checking", "downloading", "installing"].includes(state.status);
  async function run(
    method: "updateCheck" | "updateDownload" | "updateInstall",
  ) {
    setError("");
    try {
      await window.readfinch.call(method);
    } catch (error) {
      setError((error as Error).message);
    }
  }
  async function automatic(value: boolean) {
    setSaving(true);
    setError("");
    try {
      await window.readfinch.call("updatePreference", { automatic: value });
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const date = state.checkedAt
    ? new Date(state.checkedAt).toLocaleString(document.documentElement.lang, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  return (
    <section className="about-updates" aria-label={t("软件更新")}>
      <section className="update-card" aria-live="polite" aria-busy={busy}>
        <div className={"update-symbol " + state.status}>
          {busy ? (
            <LoaderCircle className="spin" size={25} />
          ) : state.status === "latest" || state.status === "downloaded" ? (
            <Check size={26} />
          ) : state.status === "error" ? (
            <CircleAlert size={25} />
          ) : (
            <ArrowDownToLine size={25} />
          )}
        </div>
        <div className="update-summary">
          <h2>{t(statusTitles[state.status])}</h2>
          <p>
            {state.availableVersion ? (
              <>
                {t(
                  "当前版本 {0} → 新版本 {1}",
                  "v" + state.currentVersion,
                  "v" + state.availableVersion,
                )}
              </>
            ) : (
              t("当前版本 {0}", "v" + state.currentVersion)
            )}
          </p>
          {state.status === "downloaded" && (
            <p className="update-ready-copy">
              {state.installMode === "automatic"
                ? state.automatic
                  ? t("退出应用时会自动安装，也可以现在重启更新。")
                  : t("自动更新已关闭。准备好后，点击下方按钮重启更新。")
                : state.installMode === "restart"
                  ? t("更新已下载并通过校验，重启后将自动完成安装。")
                  : t("安装包已下载并通过校验，请打开所在文件夹完成安装。")}
            </p>
          )}
        </div>
        <div className="update-action">
          {state.status === "downloaded" ? (
            <button
              className="primary"
              onClick={() => void run("updateInstall")}
            >
              <RotateCw size={15} />
              {state.installMode === "automatic" ||
              state.installMode === "restart"
                ? t("立即重启更新")
                : t("打开安装包位置")}
            </button>
          ) : state.status === "available" ? (
            <button
              className="primary"
              onClick={() => void run("updateDownload")}
            >
              <ArrowDownToLine size={15} />
              {t("下载更新")}
            </button>
          ) : (
            <button
              className="secondary"
              disabled={busy || state.installMode === "development"}
              onClick={() => void run("updateCheck")}
            >
              <RefreshCw
                size={15}
                className={state.status === "checking" ? "spin" : ""}
              />
              {t("检查更新")}
            </button>
          )}
        </div>
        {state.status === "downloading" && state.progress && (
          <div className="update-progress">
            <progress
              max={100}
              value={state.progress.percent}
              aria-label={t("更新下载进度")}
            />
            <div>
              <span>
                {megabytes(state.progress.transferred)} /{" "}
                {megabytes(state.progress.total)}
              </span>
              <span>
                {Math.floor(state.progress.percent)}%
                {state.progress.bytesPerSecond > 0
                  ? " · " + megabytes(state.progress.bytesPerSecond) + "/s"
                  : ""}
              </span>
            </div>
          </div>
        )}
        <div className="update-card-meta">
          <span>{date ? t("上次检查：{0}", date) : t("尚未检查更新")}</span>
        </div>
      </section>
      {(error || state.error) && (
        <div className="alert error" role="alert">
          {t(error || state.error!)}
          <ProjectButton link="releases">
            {t("查看发布页面")}
            <ArrowUpRight size={14} />
          </ProjectButton>
        </div>
      )}
      <section className="update-preferences">
        <div className="update-preference-row">
          <div>
            <h3>{t("自动更新")}</h3>
            <p>
              {state.installMode === "automatic"
                ? t("在后台检查并下载更新，退出应用时安装。")
                : state.installMode === "restart"
                  ? t("在后台检查并下载更新，准备好后可一键重启安装。")
                  : t("在后台检查并下载更新，安装时由你确认。")}
            </p>
          </div>
          <Toggle
            label={t("自动更新")}
            checked={state.automatic}
            disabled={saving}
            onChange={(value) => void automatic(value)}
          />
        </div>
      </section>
      {state.installMode === "manual" && (
        <p className="update-platform-note">
          {state.platform === "darwin"
            ? t(
                "请将伴读雀移到可写的应用程序目录后重启，以启用应用内安装更新。当前可下载后手动安装。",
              )
            : t(
                "当前安装方式需要手动安装。检查更新、加速回退和文件校验仍然可用。",
              )}
        </p>
      )}
      {state.installMode === "development" && (
        <p className="update-platform-note">
          {t("开发环境不会下载或安装更新。")}
        </p>
      )}
      {state.notes && (
        <details className="update-release-notes">
          <summary>{t("此版本更新内容")}</summary>
          <div>
            <ProjectButton link="releases">
              {t("完整版本记录")}
              <ArrowUpRight size={13} />
            </ProjectButton>
          </div>
          <p>{state.notes}</p>
        </details>
      )}
    </section>
  );
}
