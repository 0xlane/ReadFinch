import "./build.mjs";
import { spawn } from "node:child_process";
import electron from "electron";
const runtimeEnv = { ...process.env };
delete runtimeEnv.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ["."], { stdio: "inherit", env: runtimeEnv });
child.on("exit", (code) => process.exit(code ?? 0));
