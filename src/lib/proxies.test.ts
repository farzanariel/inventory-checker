import { describe, expect, test } from "vitest";

import {
  formatBrowserProxy,
  formatCurlProxy,
  formatProxyLine,
  parseProxyLine,
  parseProxyLines,
} from "./proxies";

describe("proxy parsing", () => {
  test("parses host:port", () => {
    expect(parseProxyLine("proxy.example.com:8080")).toEqual({
      host: "proxy.example.com",
      port: 8080,
      username: null,
      password: null,
    });
  });

  test("parses host:port:user:pass", () => {
    expect(parseProxyLine("proxy.example.com:8080:alice:secret")).toEqual({
      host: "proxy.example.com",
      port: 8080,
      username: "alice",
      password: "secret",
    });
  });

  test("parses user:pass@host:port", () => {
    expect(parseProxyLine("alice:secret@proxy.example.com:8080")).toEqual({
      host: "proxy.example.com",
      port: 8080,
      username: "alice",
      password: "secret",
    });
  });

  test("strips http protocol before parsing", () => {
    expect(parseProxyLine("http://proxy.example.com:8080")).toEqual({
      host: "proxy.example.com",
      port: 8080,
      username: null,
      password: null,
    });
  });

  test("adds line number to bulk parse errors", () => {
    expect(() =>
      parseProxyLines("proxy.example.com:8080\nbad-line"),
    ).toThrow("Line 2");
  });
});

describe("proxy formatting", () => {
  const authed = {
    host: "proxy.example.com",
    port: 8080,
    username: "alice",
    password: "secret",
  };

  test("formats browser proxy lines", () => {
    expect(formatBrowserProxy(authed)).toBe("proxy.example.com:8080:alice:secret");
  });

  test("formats curl proxy args", () => {
    expect(formatCurlProxy(authed)).toEqual([
      "--proxy",
      "http://proxy.example.com:8080",
      "--proxy-user",
      "alice:secret",
    ]);
  });

  test("formats stored lines for copy", () => {
    expect(formatProxyLine({ ...authed, password: "" })).toBe(
      "proxy.example.com:8080:alice:",
    );
  });
});
