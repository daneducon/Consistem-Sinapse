import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import app from "./app.js";
import { config } from "./config.js";

if (process.env.NODE_ENV === "production") {
  const serverDir = path.dirname(fileURLToPath(import.meta.url));
  const distDir = path.resolve(serverDir, "../dist");
  app.use(express.static(distDir, { index: false }));
  app.get("*", (_req, res) => res.sendFile(path.join(distDir, "index.html")));
}

app.listen(config.port, "0.0.0.0", () => {
  console.log(`Server listening on port ${config.port}`);
});
