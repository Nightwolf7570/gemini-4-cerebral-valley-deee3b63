import express from "express";
import { GoogleGenAI } from "@google/genai";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MODEL = process.env.GEMINI_MODEL || "gemini-4-argon";
const PORT = process.env.PORT || 5178;
const CACHE_DIR = "cache";
fs.mkdirSync(CACHE_DIR, { recursive: true });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM = fs
  .readFileSync("prompt/system.md", "utf8")
  .replace("{{EXAMPLE}}", fs.readFileSync("prompt/example-scene.js", "utf8"));

function loadExamples() {
  return JSON.parse(fs.readFileSync("examples/examples.json", "utf8")).map((ex) => ({
    ...ex,
    image: ex.image ? `data:image/png;base64,${fs.readFileSync(path.join("examples", ex.image)).toString("base64")}` : null,
  }));
}

const app = express();
app.use(express.json({ limit: "25mb" }));
app.use((_req, res, next) => { res.set("Access-Control-Allow-Origin", "*"); next(); });
app.use(express.static("public"));
app.use("/vendor/three", express.static("node_modules/three"));
app.use("/vendor/katex", express.static("node_modules/katex/dist"));

app.get("/api/examples", (_req, res) => res.json(loadExamples()));
app.get("/api/meta", (_req, res) => res.json({ model: MODEL }));

app.post("/api/sim", async (req, res) => {
  const { image, text, scene, chat = [], message } = req.body || {};
  const parts = [];
  if (image) {
    const m = /^data:(.+?);base64,(.+)$/.exec(image);
    if (!m) return res.status(400).send("bad image");
    parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
  }
  if (message) {
    const log = chat.map((c) => `${c.role === "user" ? "Student" : "You"}: ${c.text}`).join("\n");
    parts.push({
      text: `Original problem text: ${text || "(see photo)"}\n\nConversation so far:\n${log}\n\nCurrent scene:\n${scene || "(none)"}\n\nStudent's new message: ${message}`,
    });
  } else if (text) {
    parts.push({ text });
  }
  if (!parts.length) return res.status(400).send("no input");

  const key = createHash("sha256").update(JSON.stringify([MODEL, SYSTEM, parts])).digest("hex").slice(0, 24);
  const file = path.join(CACHE_DIR, key + ".txt");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("X-Cache", fs.existsSync(file) ? "hit" : "miss");

  if (fs.existsSync(file)) {
    // Replay at speed so the UI still shows the stream.
    const body = fs.readFileSync(file, "utf8");
    for (let i = 0; i < body.length; i += 600) {
      res.write(body.slice(i, i + 600));
      await new Promise((r) => setTimeout(r, 12));
    }
    return res.end();
  }

  const t0 = Date.now();
  let out = "";
  try {
    const stream = await ai.models.generateContentStream({
      model: MODEL,
      contents: [{ role: "user", parts }],
      config: { systemInstruction: SYSTEM },
    });
    for await (const chunk of stream) {
      if (chunk.text) { out += chunk.text; res.write(chunk.text); }
    }
    fs.writeFileSync(file, out);
    console.log(`${message ? "edit" : "build"} ${key} in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${out.length} chars`);
  } catch (err) {
    console.error(err);
    res.write(`\n<!--ERROR ${String(err.message || err)}-->`);
  }
  res.end();
});

app.listen(PORT, () => console.log(`snap-sim on http://localhost:${PORT} (model ${MODEL})`));
