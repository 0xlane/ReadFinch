import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

const pid = Number(process.argv.find((a) => a.startsWith("--pid="))?.slice(6));
if (!Number.isSafeInteger(pid) || pid <= 0)
  throw Error("An explicit ReadFinch main PID is required");
const expectedExecutable = path.join(
  process.env.LOCALAPPDATA,
  "Programs/ReadFinch/ReadFinch.exe",
);
const owner = JSON.parse(
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' | Select-Object ExecutablePath,CommandLine | ConvertTo-Json -Compress`,
    ],
    { encoding: "utf8", windowsHide: true },
  ),
);
assert.equal(
  owner?.ExecutablePath?.toLowerCase(),
  expectedExecutable.toLowerCase(),
  "PID is no longer the installed ReadFinch executable",
);
assert(
  !/--type=/i.test(owner.CommandLine),
  "A renderer/helper cannot be instrumented as the app main process",
);
const duration = Math.min(
  600000,
  Number(
    process.argv.find((a) => a.startsWith("--duration="))?.slice(11) ?? 120000,
  ),
);
const directory = path.resolve(".local/live-toolbar-" + Date.now());
await mkdir(directory, { recursive: true });
const source = await readFile(".local/installed-main.cjs", "utf8");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let ws,
  sequence = 0;
const pending = new Map();
let currentInspector = false;
async function endpoint() {
  try {
    return (
      await (
        await fetch("http://127.0.0.1:9229/json/list", {
          signal: AbortSignal.timeout(300),
        })
      ).json()
    )[0];
  } catch {
    return undefined;
  }
}
function rpc(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Error("Debugger request timed out: " + method));
    }, 4000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await rpc("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails)
    throw Error(
      r.exceptionDetails.exception?.description ??
        "Live diagnostic expression failed",
    );
  return r.result?.value;
}
const breakpoints = [];
try {
  let entry = await endpoint();
  if (!entry) {
    process._debugProcess(pid);
    currentInspector = true;
    for (let i = 0; i < 30 && !entry; i++) {
      await pause(80);
      entry = await endpoint();
    }
  }
  if (!entry)
    throw Error("The running instance did not open a local inspector");
  ws = new WebSocket(entry.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data),
      p = pending.get(m.id);
    if (p) {
      clearTimeout(p.timer);
      pending.delete(m.id);
      m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result);
    }
  };
  assert.equal(
    await evaluate("process.pid"),
    pid,
    "The inspector belongs to another process; no instrumentation was installed",
  );
  assert.equal(
    (await evaluate("process.execPath")).toLowerCase(),
    expectedExecutable.toLowerCase(),
    "The live inspector is not the installed ReadFinch executable",
  );
  await evaluate(`(() => {
    const electron=process.mainModule.require("electron");
    const d=globalThis.__readfinchLiveDiagnostics={events:[],tokens:new Map(),listeners:[],windows:new Set(),started:Date.now()};
    d.token=value=>{if(!value)return null;if(!d.tokens.has(value))d.tokens.set(value,d.tokens.size+1);return d.tokens.get(value);};
    d.record=(kind,fields={})=>{if(d.events.length<2000)d.events.push({ms:Date.now()-d.started,kind,...fields});};
    const attach=win=>{
      if(d.windows.has(win.id))return;d.windows.add(win.id);
      const mode=new URL(win.webContents.getURL()).searchParams.get("mode");
      if(mode!=="pill"&&mode!=="toolbar-menu"&&mode!=="panel")return;
      const add=(target,event,handler)=>{target.on(event,handler);d.listeners.push(()=>target.removeListener(event,handler));};
      for(const kind of ["show","hide","focus","blur"])add(win,kind,()=>d.record(kind,{surface:mode,visible:win.isVisible(),focusable:win.isFocusable()}));
      add(win.webContents,"before-mouse-event",(_event,input)=>{if(input.type==="mouseDown"||input.type==="mouseUp")d.record(input.type,{surface:mode,focused:win.isFocused(),focusable:win.isFocusable()});});
      add(win.webContents,"console-message",event=>{if(event.message?.startsWith("READFINCH_LIVE_DIAG:")){try{d.record("DOM",{surface:mode,...JSON.parse(event.message.slice(20))});}catch{}}});
      const inject=()=>win.webContents.executeJavaScript(\`(() => {
        if(window.__readfinchLiveDOM)return;
        const handlers=[],state={present:false,ordinal:0,current:null};
        const emit=value=>console.debug("READFINCH_LIVE_DIAG:"+JSON.stringify(value));
        const off=window.readfinch.on("toolbarState",value=>{state.present=!!value;if(value?.token&&value.token!==state.current){state.current=value.token;state.ordinal++;}emit({type:"view",present:state.present,ordinal:state.ordinal});});
        for(const type of ["pointerdown","mousedown","pointerup","mouseup","click","pointercancel"]){const handler=event=>{const b=event.target.closest?.("button");const control=!b?"background":b.matches(".toolbar-more")?"more":b.matches(".toolbar-close")?"close":b.matches(".toolbar-command")?"menu-command":"command";emit({type,control,present:state.present,ordinal:state.ordinal,trusted:event.isTrusted});};document.addEventListener(type,handler,true);handlers.push([type,handler]);}
        window.__readfinchLiveDOM={stop(){off();for(const [type,handler]of handlers)document.removeEventListener(type,handler,true);delete window.__readfinchLiveDOM;}};
      })()\`).catch(()=>{});
      void inject();add(win.webContents,"did-finish-load",inject);
    };
    for(const win of electron.BrowserWindow.getAllWindows())attach(win);
    const created=(_event,win)=>win.webContents.once("did-finish-load",()=>attach(win));
    electron.app.on("browser-window-created",created);d.listeners.push(()=>electron.app.removeListener("browser-window-created",created));
    return {pid:process.pid,windows:electron.BrowserWindow.getAllWindows().length};
  })()`);
  await rpc("Debugger.enable");
  const line = (text) => {
    const at = source.indexOf(text);
    if (at < 0) throw Error("Missing live breakpoint location: " + text);
    return source.slice(0, at).split("\n").length - 1;
  };
  const log = (kind, fields) =>
    `(globalThis.__readfinchLiveDiagnostics.record(${JSON.stringify(kind)},${fields}),false)`;
  const locations = [
    [
      line('case "selectionOpen":') + 1,
      log(
        "selectionOpen",
        "{nativeToken:globalThis.__readfinchLiveDiagnostics.token(native.current?.token),argumentToken:globalThis.__readfinchLiveDiagnostics.token(arg?.token),matched:arg?.token===native.current?.token,visible:win.isVisible()}",
      ),
    ],
    [
      line('case "toolbar": {') + 1,
      log(
        "toolbar-command",
        "{command:arg?.type,nativeToken:globalThis.__readfinchLiveDiagnostics.token(native.current?.token),argumentToken:globalThis.__readfinchLiveDiagnostics.token(arg?.token),matched:arg?.token===native.current?.token,visible:win.isVisible()}",
      ),
    ],
    [
      line("function showPill(") + 1,
      log(
        "new-selection",
        "{nativeToken:globalThis.__readfinchLiveDiagnostics.token(native.current?.token),requested:toolbarRequested}",
      ),
    ],
    [
      line("function hideToolbar() {") + 1,
      log(
        "hide-toolbar",
        "{nativeToken:globalThis.__readfinchLiveDiagnostics.token(native.current?.token),requested:toolbarRequested}",
      ),
    ],
    [
      line('send(pill, "toolbarState", state);'),
      log(
        "send-bar",
        "{nativeToken:globalThis.__readfinchLiveDiagnostics.token(native.current?.token),viewToken:globalThis.__readfinchLiveDiagnostics.token(state.token),mode:state.mode}",
      ),
    ],
  ];
  for (const [lineNumber, condition] of locations) {
    const result = await rpc("Debugger.setBreakpointByUrl", {
      urlRegex: "[\\\\/]dist[\\\\/]main[\\\\/]main\\.cjs$",
      lineNumber,
      condition,
    });
    breakpoints.push(result.breakpointId);
  }
  const state = await evaluate(
    `({pid:process.pid,windows:process.mainModule.require("electron").BrowserWindow.getAllWindows().map(w=>({id:w.id,mode:new URL(w.webContents.getURL()).searchParams.get("mode"),visible:w.isVisible(),focusable:w.isFocusable()}))})`,
  );
  await writeFile(
    path.join(directory, "ready.json"),
    JSON.stringify(state, null, 2),
  );
  console.log(
    "Live recorder attached without restarting PID " +
      pid +
      ". Output: " +
      directory,
  );
  const end = Date.now() + duration;
  while (Date.now() < end && !existsSync(path.join(directory, "stop"))) {
    const events = await evaluate(
      "globalThis.__readfinchLiveDiagnostics.events",
    );
    await writeFile(
      path.join(directory, "events.json"),
      JSON.stringify(events, null, 2),
    );
    await pause(500);
  }
} finally {
  if (ws?.readyState === WebSocket.OPEN) {
    for (const breakpointId of breakpoints)
      await rpc("Debugger.removeBreakpoint", { breakpointId }).catch(() => {});
    await evaluate(
      `(async()=>{const d=globalThis.__readfinchLiveDiagnostics;if(!d)return;for(const off of d.listeners)off();for(const w of process.mainModule.require("electron").BrowserWindow.getAllWindows())await w.webContents.executeJavaScript("window.__readfinchLiveDOM?.stop()").catch(()=>{});delete globalThis.__readfinchLiveDiagnostics;})()`,
    ).catch(() => {});
    await rpc("Debugger.disable").catch(() => {});
    if (currentInspector)
      await evaluate(
        'setTimeout(()=>process.mainModule.require("node:inspector").close(),50);true',
      ).catch(() => {});
    ws.close();
  }
}
