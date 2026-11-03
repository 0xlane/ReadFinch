import http from "node:http";
import https from "node:https";
import net from "node:net";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash, X509Certificate } from "node:crypto";
import { once } from "node:events";
import path from "node:path";

export async function proxyFixtures(dir) {
  await mkdir(dir, { recursive: true });
  // Disposable TLS material for loopback tests only. It is never added to the OS trust store.
  const openssl =
    process.platform === "win32"
      ? [
          path.join(
            process.env.USERPROFILE,
            "scoop/apps/git/current/usr/bin/openssl.exe",
          ),
          path.join(process.env.ProgramFiles, "Git/usr/bin/openssl.exe"),
        ].find(existsSync) || "openssl"
      : "openssl";
  execFileSync(
    openssl,
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      path.join(dir, "key.pem"),
      "-out",
      path.join(dir, "cert.pem"),
      "-days",
      "2",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1",
    ],
    { stdio: "ignore" },
  );
  const key = await readFile(path.join(dir, "key.pem"));
  const cert = await readFile(path.join(dir, "cert.pem"));
  const spki = createHash("sha256")
    .update(
      new X509Certificate(cert).publicKey.export({
        type: "spki",
        format: "der",
      }),
    )
    .digest("base64");
  const servers = [],
    sockets = new Set(),
    originRequests = [],
    proxyRequests = [];
  async function listen(server, scheme) {
    server.on("connection", (s) => {
      sockets.add(s);
      s.on("close", () => sockets.delete(s));
    });
    servers.push(server);
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    return `${scheme}://127.0.0.1:${server.address().port}`;
  }
  async function origin(req, res) {
    let raw = "";
    for await (const c of req) raw += c;
    const body = raw ? JSON.parse(raw) : {};
    const route = req.headers["x-fixture-route"] ?? "direct-or-tunnel";
    originRequests.push({
      path: req.url,
      route,
      body,
      auth: req.headers.authorization,
    });
    res.setHeader("Content-Type", "application/json");
    if (req.url.endsWith("/models"))
      return res.end(JSON.stringify({ data: [{ id: "fixture-model" }] }));
    if (req.url.endsWith("/audio/speech")) {
      res.setHeader("Content-Type", "audio/mpeg");
      return res.end(Buffer.from("ID3 fixture audio transport"));
    }
    const image = Array.isArray(body.messages?.[0]?.content);
    const answer = body.messages?.[0]?.content?.includes?.("BCP 47")
      ? "fr"
      : image
        ? "ReadFinch OCR 123 你好"
        : "proxy result";
    if (!body.stream)
      return res.end(
        JSON.stringify({ choices: [{ message: { content: answer } }] }),
      );
    res.setHeader("Content-Type", "text/event-stream");
    const send = (text) =>
      res.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      );
    send(answer.slice(0, 5));
    const delay = raw.includes("hold-proxy") ? 900 : 35;
    const timer = setTimeout(() => {
      send(answer.slice(5));
      res.end("data: [DONE]\n\n");
    }, delay);
    res.on("close", () => clearTimeout(timer));
  }
  const httpOrigin = await listen(http.createServer(origin), "http");
  const httpsOrigin = await listen(
    https.createServer({ key, cert }, origin),
    "https",
  );
  async function forward(name, tls = false) {
    const handler = (req, res) => {
      const target = new URL(req.url);
      proxyRequests.push({ name, method: req.method, target: req.url });
      const upstream = http.request(
        target,
        {
          method: req.method,
          headers: {
            ...req.headers,
            host: target.host,
            "x-fixture-route": name,
          },
        },
        (reply) => {
          res.writeHead(reply.statusCode, reply.headers);
          reply.pipe(res);
        },
      );
      upstream.on("error", () => {
        res.writeHead(502);
        res.end();
      });
      req.pipe(upstream);
      res.on("close", () => upstream.destroy());
    };
    const server = tls
      ? https.createServer({ key, cert }, handler)
      : http.createServer(handler);
    server.on("connect", (req, client, head) => {
      proxyRequests.push({ name, method: "CONNECT", target: req.url });
      const target = new URL("http://" + req.url);
      const upstream = net.connect(Number(target.port), target.hostname, () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        client.pipe(upstream).pipe(client);
      });
      sockets.add(upstream);
      upstream.on("close", () => sockets.delete(upstream));
      upstream.on("error", () => client.destroy());
      client.on("close", () => upstream.destroy());
    });
    return listen(server, tls ? "https" : "http");
  }
  const proxyA = await forward("A"),
    proxyB = await forward("B"),
    httpsProxy = await forward("TLS", true);
  function read(socket, n) {
    const part = socket.read(n);
    if (part) return Promise.resolve(part);
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        socket.off("readable", ready);
        socket.off("error", fail);
        socket.off("end", ended);
      };
      const fail = (e) => {
        cleanup();
        reject(e);
      };
      const ended = () => fail(Error("SOCKS handshake ended"));
      const ready = () => {
        const chunk = socket.read(n);
        if (chunk) {
          cleanup();
          resolve(chunk);
        }
      };
      socket.on("readable", ready);
      socket.on("error", fail);
      socket.on("end", ended);
    });
  }
  async function zeroString(socket) {
    const chars = [];
    while (chars.length < 1024) {
      const b = (await read(socket, 1))[0];
      if (!b) return Buffer.from(chars).toString();
      chars.push(b);
    }
    throw Error("SOCKS string too long");
  }
  const socks = net.createServer((socket) => {
    void (async () => {
      const version = (await read(socket, 1))[0];
      let host, port;
      if (version === 5) {
        const n = (await read(socket, 1))[0];
        await read(socket, n);
        socket.write(Buffer.from([5, 0]));
        const head = await read(socket, 4);
        assertConnect(head[1]);
        if (head[3] === 1) host = [...(await read(socket, 4))].join(".");
        else if (head[3] === 3)
          host = (await read(socket, (await read(socket, 1))[0])).toString();
        else throw Error("Unexpected test SOCKS address");
        port = (await read(socket, 2)).readUInt16BE();
      } else if (version === 4) {
        const head = await read(socket, 7);
        assertConnect(head[0]);
        port = head.readUInt16BE(1);
        host = [...head.subarray(3)].join(".");
        await zeroString(socket);
        if (host === "0.0.0.1") host = await zeroString(socket);
      } else throw Error("Unknown SOCKS version");
      proxyRequests.push({
        name: "SOCKS" + version,
        method: "CONNECT",
        target: host + ":" + port,
      });
      const upstream = net.connect(port, host);
      sockets.add(upstream);
      upstream.on("close", () => sockets.delete(upstream));
      upstream.on("error", () => socket.destroy());
      await once(upstream, "connect");
      socket.write(
        Buffer.from(
          version === 5
            ? [5, 0, 0, 1, 127, 0, 0, 1, 0, 0]
            : [0, 90, 0, 0, 127, 0, 0, 1],
        ),
      );
      socket.pipe(upstream).pipe(socket);
      socket.on("close", () => upstream.destroy());
    })().catch(() => socket.destroy());
  });
  function assertConnect(command) {
    if (command !== 1) throw Error("Only CONNECT is supported by the fixture");
  }
  const socksAddress = await listen(socks, "socks5");
  return {
    spki,
    httpOrigin,
    httpsOrigin,
    proxyA,
    proxyB,
    httpsProxy,
    socksAddress,
    originRequests,
    proxyRequests,
    async close() {
      for (const socket of sockets) socket.destroy();
      await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
    },
  };
}
