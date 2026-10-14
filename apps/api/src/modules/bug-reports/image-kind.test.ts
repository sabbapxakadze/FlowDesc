import { describe, expect, it } from "vitest";
import { imageKind } from "./image-kind.js";

describe("what kind of picture a file really is (ADR 0075)", () => {
  it("recognises PNG, JPEG and WebP by their first bytes", () => {
    // Why: these three are the only pictures a bug report may carry, and the bytes are the only thing that cannot be faked by a file name.
    expect(imageKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.extension).toBe("png");
    expect(imageKind(Buffer.from([0xff, 0xd8, 0xff, 0xdb]))?.mimeType).toBe("image/jpeg");
    expect(imageKind(Buffer.concat([Buffer.from("RIFF"), Buffer.from([1, 2, 3, 4]), Buffer.from("WEBPVP8 ")]))?.extension).toBe("webp");
  });

  it("refuses everything else, including look-alikes and files too short to tell", () => {
    // Why: a RIFF file that is not WebP (a WAV sound), an HTML page, a GIF, an empty file and a truncated header must all be turned away.
    expect(imageKind(Buffer.concat([Buffer.from("RIFF"), Buffer.from([1, 2, 3, 4]), Buffer.from("WAVEfmt ")]))).toBeUndefined();
    expect(imageKind(Buffer.from("<html><script>alert(1)</script>"))).toBeUndefined();
    expect(imageKind(Buffer.from("GIF89a....."))).toBeUndefined();
    expect(imageKind(Buffer.alloc(0))).toBeUndefined();
    expect(imageKind(Buffer.from([0x89, 0x50, 0x4e]))).toBeUndefined();
  });
});
