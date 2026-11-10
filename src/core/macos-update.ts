import { spawn } from "node:child_process";
import { accessSync, constants, lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { UpdateFailure, type ReleaseFile } from "./update-manifest";

export const macInstallError =
  "无法自动替换应用，当前版本已保留。请重试，或前往发布页面下载安装包。";

export function macApplication(executable: string) {
  return path.posix.resolve(executable, "../../..");
}

export function canReplaceMacApplication(executable: string, helper: string) {
  try {
    const application = macApplication(executable);
    if (
      !application.endsWith(".app") ||
      application.includes("/AppTranslocation/") ||
      realpathSync(application) !== application ||
      !lstatSync(application).isDirectory() ||
      helper !==
        path.join(
          application,
          "Contents/Resources/native/bin/readfinch-updater",
        )
    )
      return false;
    accessSync(application, constants.W_OK);
    accessSync(path.dirname(application), constants.W_OK);
    accessSync(helper, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// The ready/commit handshake keeps the running application alive until hashing,
// mounting and staging have succeeded. EOF before commit cancels the operation.
export function prepareMacUpdate(
  options: {
    helper: string;
    application: string;
    downloaded: string;
    file: ReleaseFile;
    version: string;
    dataDirectory: string;
  },
  spawnHelper = spawn,
): Promise<() => Promise<void>> {
  return new Promise((resolve, reject) => {
    const child = spawnHelper(options.helper, [], {
      detached: true,
      stdio: ["pipe", "pipe", "ignore"],
    });
    let ready = false,
      committed = false,
      stopped = false,
      output = "";
    const release = () => {
      clearTimeout(timeout);
      child.stdin?.destroy();
      child.stdout?.destroy();
      child.unref();
    };
    const fail = () => {
      stopped = true;
      release();
      reject(new UpdateFailure(macInstallError));
    };
    // Native operations also have deadlines. Closing IPC lets them finish and
    // clean up their mount/staging directory; killing mid-copy would strand it.
    const timeout = setTimeout(fail, 5 * 60 * 1000);
    child.on("error", fail);
    child.on("exit", () => {
      if (!committed) fail();
    });
    child.stdin!.on("error", fail);
    child.stdout!.setEncoding("utf8");
    child.stdout!.on("data", (chunk: string) => {
      output += chunk;
      if (output.length > 4096 || output.includes("error:")) return fail();
      if (!ready && output.includes("ready\n")) {
        ready = true;
        resolve(
          () =>
            new Promise<void>((accept, decline) => {
              if (stopped || committed || child.exitCode !== null)
                return decline(new UpdateFailure(macInstallError));
              child.stdin!.write("commit\n", (error) => {
                if (error || stopped) {
                  fail();
                  decline(new UpdateFailure(macInstallError));
                  return;
                }
                committed = true;
                release();
                accept();
              });
            }),
        );
      }
    });
    child.stdin!.write(
      JSON.stringify({
        application: options.application,
        package: options.downloaded,
        version: options.version,
        size: options.file.size,
        sha512: options.file.sha512,
        dataDirectory: options.dataDirectory,
      }) + "\n",
    );
  });
}
