import fs from "node:fs";
import path from "node:path";

export const SUIVANT_PUBLIC_PREFIX = "SUIVANT_PUBLIC_";

/**
 * Parse a .env file into a key-value map.
 * Supports:
 * - KEY=value
 * - KEY="quoted value"
 * - KEY='single quoted value'
 * - Comments (#)
 * - Empty lines
 * - Inline comments after unquoted values
 */
export function parseEnvFile(contents: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of contents.split("\n")) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Handle quoted values
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      // Remove inline comments for unquoted values
      const commentIndex = value.indexOf(" #");
      if (commentIndex !== -1) {
        value = value.slice(0, commentIndex).trim();
      }
    }

    if (key) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Load environment files following Next.js conventions.
 *
 * Loading order (later files take priority):
 * 1. .env
 * 2. .env.local
 * 3. .env.{mode}
 * 4. .env.{mode}.local
 *
 * The mode is "development" for `suivant dev` and "production" for `suivant build`.
 *
 * Variables already set in `process.env` are NOT overwritten (real env vars take precedence).
 */
export function loadEnvFiles(
  projectRoot: string,
  mode: "development" | "production" | "test"
): Record<string, string> {
  // Files in priority order (lowest to highest)
  const envFiles = [
    ".env",
    ".env.local",
    `.env.${mode}`,
    `.env.${mode}.local`,
  ];

  const combined: Record<string, string> = {};

  for (const file of envFiles) {
    const filePath = path.join(projectRoot, file);
    if (fs.existsSync(filePath)) {
      const contents = fs.readFileSync(filePath, "utf-8");
      const parsed = parseEnvFile(contents);
      Object.assign(combined, parsed);
    }
  }

  // Apply to process.env (don't overwrite existing env vars)
  for (const [key, value] of Object.entries(combined)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return combined;
}

/**
 * Get the esbuild `define` entries for public env vars (SUIVANT_PUBLIC_*).
 * These are injected into client-side bundles as string replacements.
 */
export function getPublicEnvDefines(
  envVars: Record<string, string>
): Record<string, string> {
  const defines: Record<string, string> = {};

  for (const [key, value] of Object.entries(envVars)) {
    if (key.startsWith(SUIVANT_PUBLIC_PREFIX)) {
      defines[`process.env.${key}`] = JSON.stringify(value);
    }
  }

  // Also check process.env for SUIVANT_PUBLIC_ vars set externally
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(SUIVANT_PUBLIC_PREFIX) && value !== undefined) {
      defines[`process.env.${key}`] = JSON.stringify(value);
    }
  }

  return defines;
}
