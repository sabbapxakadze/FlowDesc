/**
 * What kind of picture a file really is, from its first bytes (ADR 0075). The type a browser sends with an upload, and the file's name, are
 * whatever the sender wrote, so neither decides whether a file goes into the owner's inbox. Only PNG, JPEG and WebP are recognised; anything
 * else, including an empty or too-short file, is `undefined`.
 */
export function imageKind(bytes: Buffer): { extension: "png" | "jpg" | "webp"; mimeType: string } | undefined {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: "png", mimeType: "image/png" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: "jpg", mimeType: "image/jpeg" };
  }
  // WebP is a RIFF container: "RIFF", four size bytes, then "WEBP".
  if (bytes.length >= 12 && bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") {
    return { extension: "webp", mimeType: "image/webp" };
  }
  return undefined;
}
