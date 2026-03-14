import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

/**
 * Detect the user's main CSS file by scanning _app imports.
 * Looks for CSS imports in _app.tsx/.jsx/.ts/.js
 */
export function detectCssFile(
  appFilePath: string | null,
  pagesDir: string
): string | null {
  if (!appFilePath) return null;

  const content = fs.readFileSync(appFilePath, "utf-8");

  // Match import "./globals.css" or import "../styles/globals.css" etc.
  const cssImportRe = /import\s+["'](.+\.css)["']/g;
  let match: RegExpExecArray | null;

  while ((match = cssImportRe.exec(content)) !== null) {
    const importPath = match[1];
    const resolved = path.resolve(path.dirname(appFilePath), importPath);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }

  return null;
}

/**
 * Build CSS using Tailwind v4 CLI.
 * Falls back to just copying the CSS file if Tailwind isn't being used.
 */
export async function buildCss(
  cssInputPath: string,
  outDir: string,
  projectRoot: string
): Promise<string> {
  const outputPath = path.join(outDir, "styles.css");

  // Check if the CSS file uses Tailwind
  const cssContent = fs.readFileSync(cssInputPath, "utf-8");
  const usesTailwind = cssContent.includes("@import") && cssContent.includes("tailwindcss");

  if (usesTailwind) {
    // Use Tailwind CLI
    const tailwindBin = path.join(
      projectRoot,
      "node_modules",
      ".bin",
      "tailwindcss"
    );

    try {
      execSync(
        `"${tailwindBin}" -i "${cssInputPath}" -o "${outputPath}" --minify`,
        {
          cwd: projectRoot,
          stdio: "pipe",
        }
      );
    } catch {
      // Fallback: just copy the file
      fs.copyFileSync(cssInputPath, outputPath);
    }
  } else {
    // No Tailwind, just copy the CSS
    fs.copyFileSync(cssInputPath, outputPath);
  }

  return "/styles.css";
}
