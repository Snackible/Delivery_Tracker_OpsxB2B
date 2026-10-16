// Local dev server. On Vercel the files in api/ run as serverless functions and public/ is
// served statically, so this file is only for `npm run dev`.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, extname, normalize } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const pub = join(root, "public");
const PORT = Number(process.env.PORT || 3000);

try {
  process.loadEnvFile?.(join(root, ".env"));
} catch {} // no .env: runs on demo data

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      const name = url.pathname.slice(5).replace(/[^a-z0-9-]/gi, "");
      const file = join(root, "api", `${name}.js`);
      try {
        await stat(file);
      } catch {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Not found" }));
      }
      req.body = req.method === "GET" ? {} : await readBody(req);
      req.query = Object.fromEntries(url.searchParams);
      // Fresh import each time so edits to api/ and lib/ show up without a restart.
      const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
      return mod.default(req, res);
    }

    let path = normalize(url.pathname).replace(/^(\.\.[\/\\])+/, "");
    if (path === "/" || path === "\\") path = "/index.html";
    const file = join(pub, path);
    if (!file.startsWith(pub)) {
      res.writeHead(403);
      return res.end();
    }
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  } catch (err) {
    if (err.code === "ENOENT") {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    console.error(err);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Server error");
  }
}).listen(PORT, () => {
  console.log(`Delivery Tracker on http://localhost:${PORT}`);
});
