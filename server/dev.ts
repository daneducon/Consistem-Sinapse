import { createServer, loadEnv } from "vite";

Object.assign(process.env, loadEnv("development", process.cwd(), ""));

await import("./index.js");

const vite = await createServer({
  server: { host: "0.0.0.0", port: 3000 },
});
await vite.listen();
vite.printUrls();
