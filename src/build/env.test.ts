import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  parseEnvFile,
  loadEnvFiles,
  getPublicEnvDefines,
  SUIVANT_PUBLIC_PREFIX,
} from "./env.js";

describe("parseEnvFile", () => {
  it("parses simple key=value pairs", () => {
    const result = parseEnvFile("FOO=bar\nBAZ=qux");
    expect(result).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("handles double-quoted values", () => {
    const result = parseEnvFile('FOO="hello world"');
    expect(result).toEqual({ FOO: "hello world" });
  });

  it("handles single-quoted values", () => {
    const result = parseEnvFile("FOO='hello world'");
    expect(result).toEqual({ FOO: "hello world" });
  });

  it("skips comments and empty lines", () => {
    const result = parseEnvFile("# comment\n\nFOO=bar\n  # another comment");
    expect(result).toEqual({ FOO: "bar" });
  });

  it("strips inline comments from unquoted values", () => {
    const result = parseEnvFile("FOO=bar # this is a comment");
    expect(result).toEqual({ FOO: "bar" });
  });

  it("preserves inline # in quoted values", () => {
    const result = parseEnvFile('FOO="bar # not a comment"');
    expect(result).toEqual({ FOO: "bar # not a comment" });
  });

  it("handles empty values", () => {
    const result = parseEnvFile("FOO=");
    expect(result).toEqual({ FOO: "" });
  });

  it("handles values with = signs", () => {
    const result = parseEnvFile("FOO=bar=baz");
    expect(result).toEqual({ FOO: "bar=baz" });
  });

  it("skips lines without =", () => {
    const result = parseEnvFile("INVALID\nFOO=bar");
    expect(result).toEqual({ FOO: "bar" });
  });
});

describe("loadEnvFiles", () => {
  let tmpDir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "suivant-env-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Restore process.env
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  function saveEnvKey(key: string) {
    if (!(key in savedEnv)) {
      savedEnv[key] = process.env[key];
    }
  }

  it("loads .env file", () => {
    fs.writeFileSync(path.join(tmpDir, ".env"), "TEST_VAR_A=from_env");
    saveEnvKey("TEST_VAR_A");

    const result = loadEnvFiles(tmpDir, "production");
    expect(result.TEST_VAR_A).toBe("from_env");
    expect(process.env.TEST_VAR_A).toBe("from_env");
  });

  it("loads files in correct priority order", () => {
    fs.writeFileSync(path.join(tmpDir, ".env"), "MY_VAR=base");
    fs.writeFileSync(path.join(tmpDir, ".env.local"), "MY_VAR=local");
    fs.writeFileSync(path.join(tmpDir, ".env.production"), "MY_VAR=prod");
    fs.writeFileSync(
      path.join(tmpDir, ".env.production.local"),
      "MY_VAR=prod_local"
    );
    saveEnvKey("MY_VAR");

    const result = loadEnvFiles(tmpDir, "production");
    expect(result.MY_VAR).toBe("prod_local");
  });

  it("does not overwrite existing process.env vars", () => {
    saveEnvKey("EXISTING_VAR");
    process.env.EXISTING_VAR = "original";
    fs.writeFileSync(path.join(tmpDir, ".env"), "EXISTING_VAR=from_file");

    loadEnvFiles(tmpDir, "production");
    expect(process.env.EXISTING_VAR).toBe("original");
  });

  it("loads mode-specific files for development", () => {
    fs.writeFileSync(path.join(tmpDir, ".env"), "MODE_VAR=base");
    fs.writeFileSync(path.join(tmpDir, ".env.development"), "MODE_VAR=dev");
    saveEnvKey("MODE_VAR");

    const result = loadEnvFiles(tmpDir, "development");
    expect(result.MODE_VAR).toBe("dev");
  });

  it("returns empty object when no env files exist", () => {
    const result = loadEnvFiles(tmpDir, "production");
    expect(result).toEqual({});
  });
});

describe("getPublicEnvDefines", () => {
  it("only includes SUIVANT_PUBLIC_ prefixed vars", () => {
    const envVars = {
      SECRET_KEY: "secret",
      SUIVANT_PUBLIC_API_URL: "https://api.example.com",
      SUIVANT_PUBLIC_APP_NAME: "My App",
      DB_PASSWORD: "hunter2",
    };

    const defines = getPublicEnvDefines(envVars);
    expect(defines).toEqual({
      "process.env.SUIVANT_PUBLIC_API_URL": '"https://api.example.com"',
      "process.env.SUIVANT_PUBLIC_APP_NAME": '"My App"',
    });

    // Should not include non-public vars
    expect(defines).not.toHaveProperty("process.env.SECRET_KEY");
    expect(defines).not.toHaveProperty("process.env.DB_PASSWORD");
  });

  it("returns empty object when no public vars exist", () => {
    const defines = getPublicEnvDefines({ SECRET: "value" });
    expect(defines).toEqual({});
  });

  it("JSON-stringifies values", () => {
    const defines = getPublicEnvDefines({
      SUIVANT_PUBLIC_FOO: 'value with "quotes"',
    });
    expect(defines["process.env.SUIVANT_PUBLIC_FOO"]).toBe(
      '"value with \\"quotes\\""'
    );
  });
});

describe("SUIVANT_PUBLIC_PREFIX", () => {
  it("has the correct value", () => {
    expect(SUIVANT_PUBLIC_PREFIX).toBe("SUIVANT_PUBLIC_");
  });
});
