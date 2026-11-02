// Development fixtures only. This server is not an AI model or a production WebDAV server.
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
const port = Number(process.env.TEXTHOP_FIXTURE_PORT ?? 9876);
const dir = path.resolve(".local/webdav-fixture");
await mkdir(dir, { recursive: true });
const file = path.join(dir, "config.json");
const hash = (data) =>
  '"' + createHash("sha256").update(data).digest("hex") + '"';
let queue = Promise.resolve();
const server = createServer(async (req, res) => {
  try {
    if (req.url === "/dav/TextHop/config.json") {
      if (
        req.headers.authorization !==
        "Basic " + Buffer.from("texthop:fixture").toString("base64")
      ) {
        res.writeHead(401, {
          "WWW-Authenticate": 'Basic realm="TextHop local fixture"',
        });
        res.end();
        return;
      }
      if (req.method === "GET" || req.method === "HEAD") {
        let data;
        try {
          data = await readFile(file);
        } catch {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, {
          "Content-Type": "application/json",
          ETag: hash(data),
        });
        res.end(req.method === "HEAD" ? undefined : data);
        return;
      }
      if (req.method === "PUT") {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 2_000_000) {
            res.writeHead(413);
            res.end();
            return;
          }
        }
        queue = queue
          .then(async () => {
            let current;
            try {
              current = await readFile(file);
            } catch {}
            if (
              (req.headers["if-none-match"] === "*" && current) ||
              (req.headers["if-match"] &&
                (!current || req.headers["if-match"] !== hash(current)))
            ) {
              res.writeHead(412);
              res.end();
              return;
            }
            if (!req.headers["if-match"] && !req.headers["if-none-match"]) {
              res.writeHead(428);
              res.end();
              return;
            }
            JSON.parse(body);
            await writeFile(file + ".tmp", body);
            await rename(file + ".tmp", file);
            res.writeHead(current ? 204 : 201, { ETag: hash(body) });
            res.end();
          })
          .catch(() => {
            res.writeHead(500);
            res.end();
          });
        return;
      }
      res.writeHead(405);
      res.end();
      return;
    }
    if (
      req.method === "POST" &&
      ["/v1/chat/completions", "/api/chat", "/api/show"].includes(req.url)
    ) {
      let raw = "";
      for await (const c of req) {
        raw += c;
        if (raw.length > 32_000_000) {
          res.writeHead(413);
          res.end();
          return;
        }
      }
      const input = JSON.parse(raw);
      if (req.url === "/api/show") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ capabilities: ["vision", "completion"] }));
        return;
      }
      const content = input.messages?.at(-1);
      const isImage =
        !!content?.images?.length || Array.isArray(content?.content);
      const text = isImage
        ? "TextHop OCR 123\n你好，世界！\n[固定测试响应；不代表真实视觉推理]"
        : "这是本机 fixture 的固定响应，用于验证调用、流式输出和界面。\n\n此服务不会运行真实 AI 模型。";
      if (req.url === "/api/chat") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ message: { content: text }, done: true }));
        return;
      }
      if (input.stream) {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        for (const part of text.match(/.{1,10}|\n/gs) ?? [])
          res.write(
            "data: " +
              JSON.stringify({ choices: [{ delta: { content: part } }] }) +
              "\n\n",
          );
        res.end("data: [DONE]\n\n");
      } else {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ choices: [{ message: { content: text } }] }));
      }
      return;
    }
    res.writeHead(404);
    res.end("TextHop development fixtures only");
  } catch {
    if (!res.headersSent) res.writeHead(400);
    res.end("Invalid fixture request");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `TextHop FIXTURE ONLY\nText API: http://127.0.0.1:${port}/v1 (any model ID, no API key)\nOllama protocol: http://127.0.0.1:${port}\nWebDAV: http://127.0.0.1:${port}/dav/ | texthop / fixture | TextHop/config.json\nAll model results are fixed test responses. Ctrl+C stops the server.`,
  ),
);
