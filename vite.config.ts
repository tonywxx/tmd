import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  clearScreen: false,

  // Tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },

  // Multi-entry: main app + hidden export (PDF) window
  build: {
    target: "es2022",
    // Split large vendors into their own chunks. This lets the browser
    // download + parse them in parallel and cache them independently of the
    // app code, and keeps the eagerly-loaded main chunk small. Mermaid is
    // loaded lazily (see src/lib/mermaid.ts), so its core + dagre/katex/
    // cytoscape land here as a separate async chunk that is never on the
    // startup path.
    rollupOptions: {
      input: {
        main: "index.html",
        export: "export.html",
      },
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          // mermaid + its deps are loaded via a dynamic import() in
          // src/lib/mermaid.ts, so we leave them out of every named chunk and
          // let Rollup keep them as their own async chunks. They are only
          // fetched when a document actually contains a ```mermaid block, never
          // on the startup path. Grouping them into a named chunk would force
          // Vite to eagerly preload them on every launch.
          if (
            id.includes("mermaid") ||
            id.includes("cytoscape") ||
            id.includes("katex") ||
            id.includes("dagre") ||
            id.includes("@mermaid-js")
          ) {
            return;
          }
          if (
            id.includes("@codemirror") ||
            id.includes("codemirror") ||
            id.includes("@lezer")
          ) {
            return "codemirror";
          }
          if (id.includes("react") || id.includes("scheduler")) return "react-vendor";
          return "vendor";
        },
      },
    },
  },
}));
