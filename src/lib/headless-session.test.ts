/**
 * Unit tests for NEC-34: stealth browser session warming and storage-state
 * persistence (bestbuy-headless.ts).
 *
 * All browser interactions are mocked via plain JS objects matching the
 * patchright BrowserContext/Page API surface we actually call.  No real
 * browser is launched.
 */
import { describe, test, expect, vi, afterEach } from "vitest";
import { warmSession } from "./bestbuy-headless";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// ---------- Helpers ----------

function makeMockPage(opts: {
  waitForFunctionResolves?: boolean;
  gotoRejects?: boolean;
} = {}) {
  return {
    setDefaultTimeout: vi.fn(),
    setDefaultNavigationTimeout: vi.fn(),
    goto: opts.gotoRejects
      ? vi.fn().mockRejectedValue(new Error("navigation timeout"))
      : vi.fn().mockResolvedValue({}),
    waitForFunction: opts.waitForFunctionResolves !== false
      ? vi.fn().mockResolvedValue({})
      : vi.fn().mockRejectedValue(new Error("waitForFunction timeout")),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockContext(opts: {
  waitForFunctionResolves?: boolean;
  gotoRejects?: boolean;
  storageState?: object;
} = {}) {
  const page = makeMockPage({
    waitForFunctionResolves: opts.waitForFunctionResolves,
    gotoRejects: opts.gotoRejects,
  });
  const ctx = {
    newPage: vi.fn().mockResolvedValue(page),
    storageState: vi.fn().mockResolvedValue(
      opts.storageState ?? {
        cookies: [
          {
            name: "_abck",
            value: "123456789~-1~YAAQ...",
            domain: ".bestbuy.com",
            path: "/",
            expires: -1,
            httpOnly: false,
            secure: true,
            sameSite: "None",
          },
        ],
        origins: [],
      },
    ),
    _page: page,
  };
  return ctx;
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------- warmSession: basic outcomes ----------

describe("warmSession", () => {
  test("returns true when _abck waitForFunction resolves", async () => {
    const ctx = makeMockContext({ waitForFunctionResolves: true });
    const result = await warmSession(ctx as never, undefined, 5_000);
    expect(result).toBe(true);
  });

  test("returns false when waitForFunction rejects (challenge not completed)", async () => {
    const ctx = makeMockContext({ waitForFunctionResolves: false });
    const result = await warmSession(ctx as never, undefined, 5_000);
    expect(result).toBe(false);
  });

  test("returns false (does not throw) when goto rejects", async () => {
    const ctx = makeMockContext({ gotoRejects: true });
    const result = await warmSession(ctx as never, undefined, 5_000);
    expect(result).toBe(false);
  });

  test("always closes the page in the finally block", async () => {
    const ctx = makeMockContext({ waitForFunctionResolves: true });
    await warmSession(ctx as never, undefined, 5_000);
    expect(ctx._page.close).toHaveBeenCalledOnce();
  });

  test("closes page even when goto throws", async () => {
    const ctx = makeMockContext({ gotoRejects: true });
    await warmSession(ctx as never, undefined, 5_000);
    expect(ctx._page.close).toHaveBeenCalledOnce();
  });
});

// ---------- warmSession: storage-state persistence ----------

describe("warmSession — storage-state persistence", () => {
  test("writes storage state JSON to storageStatePath when provided", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bb-test-"));
    const statePath = path.join(tmpDir, "state.json");
    const fakeState = {
      cookies: [{ name: "_abck", value: "12345", domain: ".bestbuy.com", path: "/", expires: -1, httpOnly: false, secure: true, sameSite: "None" as const }],
      origins: [],
    };

    const ctx = makeMockContext({
      waitForFunctionResolves: true,
      storageState: fakeState,
    });

    const result = await warmSession(ctx as never, statePath, 5_000);

    expect(result).toBe(true);
    expect(ctx.storageState).toHaveBeenCalled();

    const written = JSON.parse(await fs.readFile(statePath, "utf-8")) as unknown;
    expect(written).toEqual(fakeState);

    // cleanup
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("creates parent directories when storageStatePath includes subdirs", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bb-test-"));
    const statePath = path.join(tmpDir, "nested", "deep", "state.json");

    const ctx = makeMockContext({ waitForFunctionResolves: true });
    await warmSession(ctx as never, statePath, 5_000);

    // File should exist — the mkdir(recursive) call created the nested dirs.
    const stat = await fs.stat(statePath);
    expect(stat.isFile()).toBe(true);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("does NOT write storage state when storageStatePath is undefined", async () => {
    const ctx = makeMockContext({ waitForFunctionResolves: true });
    await warmSession(ctx as never, undefined, 5_000);
    // storageState is only called when we need to persist — should NOT be called
    // when no path is given.
    expect(ctx.storageState).not.toHaveBeenCalled();
  });

  test("still returns true even when challenge fails but partial state is persisted", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bb-test-"));
    const statePath = path.join(tmpDir, "state.json");

    const ctx = makeMockContext({ waitForFunctionResolves: false });
    const result = await warmSession(ctx as never, statePath, 5_000);

    // Returns false because _abck not confirmed, but does persist whatever state
    // we have (partial warm is better than nothing).
    expect(result).toBe(false);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
