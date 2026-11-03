import { contextBridge, ipcRenderer } from "electron";
import type { DesktopAPI } from "../shared/api";
const api: DesktopAPI = {
  async call(method, arg) {
    const result = await ipcRenderer.invoke("readfinch:call", method, arg);
    if (!result.ok) throw Error(result.error);
    return result.value;
  },
  on(event, listener) {
    const handler = (_event: unknown, value: any) => listener(value);
    ipcRenderer.on("readfinch:" + event, handler);
    return () => ipcRenderer.removeListener("readfinch:" + event, handler);
  },
};
contextBridge.exposeInMainWorld("readfinch", api);
