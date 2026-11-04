import { defineConfig } from "vite";

/**
 * `--mode single` builds one classic script with no module loading, because browsers refuse
 * ES modules on file:// pages. scripts/single.ts then folds it into dist/eyerush.html.
 */
export default defineConfig(({ mode }) => ({
  base: "./",
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1500,
    ...(mode === "single"
      ? {
          outDir: "dist-single",
          rollupOptions: { output: { format: "iife" as const, inlineDynamicImports: true } },
        }
      : {}),
  },
}));
