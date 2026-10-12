import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFakeS3, type FakeS3 } from "./fake-s3.js";
import { createLocalStore } from "./storage-local.js";
import { createS3Store } from "./storage-s3.js";
import type { FileStore } from "./storage-store.js";

/**
 * The two file stores behind lib/storage.ts (ADR 0053), run through ONE set of checks. Why one set: the app must not be able to tell the
 * disk from the object store, so anything the app relies on (a whole read, a byte range for video seeking, the size, a missing file) is
 * asserted on both. The s3 store talks to a fake S3 inside this process (lib/fake-s3.ts), so no network or account is needed.
 */

async function drain(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks).toString();
}

let fake: FakeS3;
let dir: string;

beforeAll(async () => {
  fake = await startFakeS3("flowdesk-files");
  dir = await mkdtemp(path.join(tmpdir(), "flowdesc-store-"));
});
afterAll(async () => {
  await fake.close();
  await rm(dir, { recursive: true, force: true });
});

const stores: [string, () => FileStore][] = [
  ["local", () => createLocalStore(() => dir)],
  [
    "s3",
    () =>
      createS3Store({
        endpoint: fake.endpoint,
        region: "eu-central-1",
        bucket: "flowdesk-files",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
      }),
  ],
];

describe.each(stores)("the %s file store", (_name, make) => {
  it("keeps a file and reads it back whole, with its size", async () => {
    // Why: this is every upload and download in the app.
    const store = make();
    await store.save("whole-file", Buffer.from("hello attachment"));
    expect(await drain(await store.read("whole-file"))).toBe("hello attachment");
    expect(await store.size("whole-file")).toBe(16);
  });

  it("reads only the bytes asked for when given a range (inclusive, like an HTTP byte range)", async () => {
    // Why: video seeking (ADR 0023) asks for part of a file; a store that ignored the range would send the whole file with a 206 header.
    const store = make();
    await store.save("ranged", Buffer.from("0123456789"));
    expect(await drain(await store.read("ranged", { start: 2, end: 5 }))).toBe("2345");
    expect(await drain(await store.read("ranged", { start: 8, end: 9 }))).toBe("89");
  });

  it("says a missing file is missing, for its size and for a read", async () => {
    // Why: the download route answers 404 from this; a store that returned an empty file for a missing key would serve blank attachments.
    const store = make();
    await expect(store.size("nope")).rejects.toThrow();
    await expect(store.read("nope")).rejects.toThrow();
  });

  it("deletes a file, and deleting one that was never there does not throw", async () => {
    // Why: a delete runs after the database row is gone; it must not fail the request, and a retry must be harmless.
    const store = make();
    await store.save("delete-me", Buffer.from("bye"));
    await store.remove("delete-me");
    await expect(store.size("delete-me")).rejects.toThrow();
    await expect(store.remove("never-existed")).resolves.toBeUndefined();
  });

  it("keeps a second save of the same key as the new content", async () => {
    // Why: a profile photo is saved under a new key each time, but an overwrite must still mean "the latest bytes", not an error.
    const store = make();
    await store.save("again", Buffer.from("first"));
    await store.save("again", Buffer.from("second"));
    expect(await drain(await store.read("again"))).toBe("second");
  });
});

describe("the s3 file store talks to the bucket the way Neon's docs require", () => {
  it("addresses the bucket in the path (path-style), signs every request, and asks for a byte range with a Range header", async () => {
    // Why: Neon supports path-style only and SigV4 only; a store that used bucket.host addressing or sent unsigned requests would work against
    // the fake of a lenient server and fail on the real one. The fake answers 403 to an unsigned request and 404 to a wrong bucket.
    // The endpoint is a NAME (localhost), not an IP address: the SDK only switches to bucket.host addressing for a name, so with
    // 127.0.0.1 a store that wrongly allowed virtual-hosted style would still pass.
    const before = fake.requests.length;
    const store = createS3Store({
      endpoint: fake.endpoint.replace("127.0.0.1", "localhost"),
      region: "eu-central-1",
      bucket: "flowdesk-files",
      accessKeyId: "k",
      secretAccessKey: "s",
    });
    await store.save("shape-check", Buffer.from("abcdef"));
    await drain(await store.read("shape-check", { start: 1, end: 3 }));
    const mine = fake.requests.slice(before);
    expect(mine.map((r) => `${r.method} ${r.path}`)).toEqual(["PUT /flowdesk-files/shape-check", "GET /flowdesk-files/shape-check"]);
    expect(mine.every((r) => r.signed)).toBe(true);
    expect(mine[1]?.range).toBe("bytes=1-3");
  });
});
