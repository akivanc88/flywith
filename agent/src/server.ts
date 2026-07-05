import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runOrchestrator } from "./orchestrator.js";

const PORT = Number(process.env.PORT ?? 8787);
const here = path.dirname(fileURLToPath(import.meta.url));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (url.pathname === "/") {
    // demo.html lives next to src/ in the package root
    const html = readFileSync(path.join(here, "..", "demo.html"), "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (url.pathname === "/api/plan") {
    const prompt = url.searchParams.get("prompt");
    if (!prompt) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing ?prompt=" }));
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    const send = (event: unknown) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const heartbeat = setInterval(() => res.write(": ping\n\n"), 15000);

    try {
      await runOrchestrator(prompt, send);
    } catch (err) {
      send({ type: "run.error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set — the agent cannot run without it.");
  process.exit(1);
}

server.listen(PORT, () => {
  console.log(`FlyWith agent server: http://localhost:${PORT}`);
  console.log(`Try: http://localhost:${PORT}/ (demo UI)`);
});
