import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const [command, ...args] = process.argv.slice(2);
if (!command) throw Error("A command is required");
// Retain the runner's verified download caches between attempts. Retry only
// recognizable transport failures; compilation, test and signing failures exit.
for (let attempt = 1; attempt <= 4; attempt++) {
  let tail = "";
  const result = await new Promise((resolve) => {
    const child = spawn(command === "node" ? process.execPath : command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    for (const [stream, output] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
      stream.on("data", (data) => {
        output.write(data);
        tail = (tail + data.toString()).slice(-65536);
      });
    }
    child.on("error", (error) => { console.error(error.code ?? "Spawn failed"); resolve(1); });
    child.on("close", (code) => resolve(code ?? 1));
  });
  if (result === 0) process.exit(0);
  const transient = /(?:HTTP(?:Error)?[^\r\n]{0,100}|Response code\s+)(?:408|429|500|502|503|504)\b|\b(?:ETIMEDOUT|ECONNRESET|EAI_AGAIN)\b/i.test(tail);
  if (!transient || attempt === 4) process.exit(result);
  console.log(`Transient dependency download failure; retrying attempt ${attempt + 1}/4 in ${attempt * 10}s.`);
  await delay(attempt * 10000);
}
