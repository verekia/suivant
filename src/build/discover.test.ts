import { describe, it, expect } from "vitest";
import { fileToRoute } from "./discover.js";

describe("fileToRoute", () => {
  it("converts index.tsx to /", () => {
    const route = fileToRoute("index.tsx");
    expect(route.routePattern).toBe("/");
    expect(route.urlPattern).toBe("/");
    expect(route.paramNames).toEqual([]);
  });

  it("converts about.tsx to /about", () => {
    const route = fileToRoute("about.tsx");
    expect(route.routePattern).toBe("/about");
    expect(route.urlPattern).toBe("/about");
    expect(route.paramNames).toEqual([]);
  });

  it("converts [id].tsx to /[id]", () => {
    const route = fileToRoute("[id].tsx");
    expect(route.routePattern).toBe("/[id]");
    expect(route.urlPattern).toBe("/:id");
    expect(route.paramNames).toEqual(["id"]);
  });

  it("converts users/index.tsx to /users", () => {
    const route = fileToRoute("users/index.tsx");
    expect(route.routePattern).toBe("/users");
    expect(route.urlPattern).toBe("/users");
    expect(route.paramNames).toEqual([]);
  });

  it("converts users/[id].tsx to /users/[id]", () => {
    const route = fileToRoute("users/[id].tsx");
    expect(route.routePattern).toBe("/users/[id]");
    expect(route.urlPattern).toBe("/users/:id");
    expect(route.paramNames).toEqual(["id"]);
  });

  it("converts blog/posts.tsx to /blog/posts", () => {
    const route = fileToRoute("blog/posts.tsx");
    expect(route.routePattern).toBe("/blog/posts");
    expect(route.urlPattern).toBe("/blog/posts");
    expect(route.paramNames).toEqual([]);
  });

  it("handles .js extension", () => {
    const route = fileToRoute("about.js");
    expect(route.routePattern).toBe("/about");
  });

  it("handles .jsx extension", () => {
    const route = fileToRoute("about.jsx");
    expect(route.routePattern).toBe("/about");
  });

  it("handles .ts extension", () => {
    const route = fileToRoute("about.ts");
    expect(route.routePattern).toBe("/about");
  });
});
