// Loaded in both the test process and Tesseract's Node worker threads.
const { appendFileSync, mkdirSync } = require("node:fs");
const { isMainThread, threadId } = require("node:worker_threads");
const block = () => {
  throw new Error("NETWORK_DISABLED_FOR_OCR_VERIFICATION");
};
global.fetch = block;
for (const name of ["node:http", "node:https"]) {
  const module = require(name);
  module.get = block;
  module.request = block;
}
const net = require("node:net");
net.connect = block;
net.createConnection = block;
net.Socket.prototype.connect = block;
const tls = require("node:tls");
tls.connect = block;
mkdirSync(".local", { recursive: true });
appendFileSync(
  ".local/ocr-network-block.ndjson",
  JSON.stringify({
    pid: process.pid,
    isMainThread,
    threadId,
    network: "disabled",
  }) + "\n",
);
