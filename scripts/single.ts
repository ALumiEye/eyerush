/** Folds the single-mode build into dist/eyerush.html: one file that opens by double-clicking. */
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = "dist-single";
const assets = readdirSync(join(SOURCE, "assets"));
const read = (extension: string) => {
  const name = assets.find((file) => file.endsWith(extension));
  return name ? readFileSync(join(SOURCE, "assets", name), "utf8") : null;
};

const bundle = read(".js");
if (!bundle) throw new Error("No script in the single build");
const script = bundle.replaceAll("</script", "<\\/script");
const style = read(".css") ?? "";

const html = readFileSync(join(SOURCE, "index.html"), "utf8")
  .replace(/<script[^>]*src=[^>]*><\/script>\s*/g, "")
  .replace(/<link[^>]*rel="stylesheet"[^>]*>\s*/g, "")
  .replace(/<link[^>]*rel="modulepreload"[^>]*>\s*/g, "")
  .replace("</head>", () => `<style>${style}</style></head>`)
  .replace("</body>", () => `<script>${script}</script></body>`);

writeFileSync("dist/eyerush.html", html);
rmSync(SOURCE, { recursive: true });
console.log(`dist/eyerush.html: ${(statSync("dist/eyerush.html").size / 1024 / 1024).toFixed(2)} MB`);
