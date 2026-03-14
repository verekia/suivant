import { describe, it, expect } from "vitest";
import {
  patternToRegex,
  matchRoute,
  bracketToColonPattern,
  fillParams,
  routeToChunkName,
  routeToDataPath,
} from "./routes.js";

describe("patternToRegex", () => {
  it("matches a static path", () => {
    const { regex, paramNames } = patternToRegex("/about");
    expect("/about".match(regex)).toBeTruthy();
    expect("/other".match(regex)).toBeNull();
    expect(paramNames).toEqual([]);
  });

  it("matches root path", () => {
    const { regex } = patternToRegex("/");
    expect("/".match(regex)).toBeTruthy();
    expect("/about".match(regex)).toBeNull();
  });

  it("matches a dynamic path and extracts params", () => {
    const { regex, paramNames } = patternToRegex("/users/:id");
    const match = "/users/123".match(regex);
    expect(match).toBeTruthy();
    expect(match![1]).toBe("123");
    expect(paramNames).toEqual(["id"]);
  });

  it("does not match partial paths", () => {
    const { regex } = patternToRegex("/about");
    expect("/about/extra".match(regex)).toBeNull();
    expect("/pre/about".match(regex)).toBeNull();
  });

  it("handles nested static paths", () => {
    const { regex } = patternToRegex("/blog/posts");
    expect("/blog/posts".match(regex)).toBeTruthy();
    expect("/blog".match(regex)).toBeNull();
  });

  it("handles nested dynamic paths", () => {
    const { regex, paramNames } = patternToRegex("/users/:userId/posts/:postId");
    const match = "/users/42/posts/99".match(regex);
    expect(match).toBeTruthy();
    expect(match![1]).toBe("42");
    expect(match![2]).toBe("99");
    expect(paramNames).toEqual(["userId", "postId"]);
  });
});

describe("matchRoute", () => {
  const patterns = ["/", "/about", "/users/:id", "/blog/posts"];

  it("matches root", () => {
    const result = matchRoute("/", patterns);
    expect(result).toEqual({ pattern: "/", params: {} });
  });

  it("matches static routes", () => {
    const result = matchRoute("/about", patterns);
    expect(result).toEqual({ pattern: "/about", params: {} });
  });

  it("matches dynamic routes with params", () => {
    const result = matchRoute("/users/456", patterns);
    expect(result).toEqual({ pattern: "/users/:id", params: { id: "456" } });
  });

  it("matches nested static routes", () => {
    const result = matchRoute("/blog/posts", patterns);
    expect(result).toEqual({ pattern: "/blog/posts", params: {} });
  });

  it("returns null for unmatched routes", () => {
    const result = matchRoute("/nonexistent", patterns);
    expect(result).toBeNull();
  });

  it("strips trailing slashes", () => {
    const result = matchRoute("/about/", patterns);
    expect(result).toEqual({ pattern: "/about", params: {} });
  });

  it("prefers static routes over dynamic ones (order-dependent)", () => {
    const orderedPatterns = ["/users/special", "/users/:id"];
    const result = matchRoute("/users/special", orderedPatterns);
    expect(result).toEqual({ pattern: "/users/special", params: {} });
  });
});

describe("bracketToColonPattern", () => {
  it("converts bracket params to colon params", () => {
    expect(bracketToColonPattern("/users/[id]")).toBe("/users/:id");
  });

  it("handles multiple params", () => {
    expect(bracketToColonPattern("/[org]/[repo]")).toBe("/:org/:repo");
  });

  it("leaves static routes unchanged", () => {
    expect(bracketToColonPattern("/about")).toBe("/about");
  });

  it("handles root", () => {
    expect(bracketToColonPattern("/")).toBe("/");
  });
});

describe("fillParams", () => {
  it("fills in param values", () => {
    expect(fillParams("/users/:id", { id: "123" })).toBe("/users/123");
  });

  it("fills multiple params", () => {
    expect(fillParams("/:org/:repo", { org: "acme", repo: "app" })).toBe(
      "/acme/app"
    );
  });

  it("throws on missing params", () => {
    expect(() => fillParams("/users/:id", {})).toThrow('Missing param "id"');
  });

  it("leaves static paths unchanged", () => {
    expect(fillParams("/about", {})).toBe("/about");
  });
});

describe("routeToChunkName", () => {
  it("converts root to page-index", () => {
    expect(routeToChunkName("/")).toBe("page-index");
  });

  it("converts static routes", () => {
    expect(routeToChunkName("/about")).toBe("page-about");
  });

  it("converts dynamic routes", () => {
    expect(routeToChunkName("/users/[id]")).toBe("page-users-id");
  });

  it("converts nested routes", () => {
    expect(routeToChunkName("/blog/posts")).toBe("page-blog-posts");
  });
});

describe("routeToDataPath", () => {
  it("returns index for root", () => {
    expect(routeToDataPath("/", {})).toBe("index");
  });

  it("returns path for static routes", () => {
    expect(routeToDataPath("/about", {})).toBe("about");
  });

  it("fills params for dynamic routes", () => {
    expect(routeToDataPath("/users/[id]", { id: "123" })).toBe("users/123");
  });
});
