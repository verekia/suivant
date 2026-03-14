import * as esbuild from "esbuild";
import { glob } from "glob";

const entryPoints = await glob("src/**/*.{ts,tsx}", {
  ignore: ["**/*.test.ts", "**/*.test.tsx"],
});

// Build ESM output
await esbuild.build({
  entryPoints,
  outdir: "dist",
  format: "esm",
  platform: "node",
  target: "node18",
  bundle: false,
  sourcemap: true,
  jsx: "automatic",
  outExtension: { ".js": ".js" },
});

console.log("Build complete.");
