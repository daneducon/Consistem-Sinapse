import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/motion")) return "motion";
            if (id.includes("node_modules/lucide-react")) return "icons";
            if (id.includes("node_modules/react")) return "react";
          },
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== "true",
      watch: process.env.DISABLE_HMR === "true" ? null : {},
      proxy: {
        "/api": {
          target: process.env.API_PROXY_TARGET || "http://localhost:8080",
          changeOrigin: false,
        },
      },
    },
  };
});
