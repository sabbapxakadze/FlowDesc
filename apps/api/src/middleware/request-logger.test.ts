import { Writable } from "node:stream";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createLogger } from "../lib/logger.js";
import { createRequestLogger } from "./request-logger.js";

/** A logger that writes into a string, so a test can read exactly what would reach the log. */
function capture() {
  let text = "";
  const stream = new Writable({
    write(chunk, _enc, done) {
      text += chunk.toString();
      done();
    },
  });
  return { logger: createLogger(stream), output: () => text };
}

describe("request logging - secrets never reach the log (ADR 0050)", () => {
  it("does not print the login token, the cookies, or the Set-Cookie of a response, but still logs the request", async () => {
    // Why: request logging prints every header. A refresh token in a cookie or a Bearer token in the log would be a stolen session for anyone
    // who can read the log (on Render the log is kept and shown in a dashboard).
    const { logger, output } = capture();
    const app = express();
    app.use(createRequestLogger(logger));
    app.get("/ping", (_req, res) => {
      res.setHeader("Set-Cookie", "refreshToken=SECRET-REFRESH-COOKIE; HttpOnly");
      res.json({ ok: true });
    });

    await request(app)
      .get("/ping")
      .set("Authorization", "Bearer SECRET-ACCESS-TOKEN")
      .set("Cookie", "refreshToken=SECRET-REQUEST-COOKIE")
      .set("X-Forwarded-For", "203.0.113.7")
      .expect(200);

    const log = output();
    expect(log).not.toContain("SECRET-ACCESS-TOKEN");
    expect(log).not.toContain("SECRET-REQUEST-COOKIE");
    expect(log).not.toContain("SECRET-REFRESH-COOKIE");
    expect(log).toContain("[Redacted]");
    // The log is still useful: what happened, and the forwarded address that the rate limits depend on.
    expect(log).toContain("GET /ping 200");
    expect(log).toContain("203.0.113.7");
  });

  it("does not print a personal access token either (ADR 0070)", async () => {
    // Why: a token is a lasting credential, worse to leak than a 15-minute session token. It travels in the same header, so the same
    // redaction has to cover it; this pins that.
    const { logger, output } = capture();
    const app = express();
    app.use(createRequestLogger(logger));
    app.get("/ping", (_req, res) => res.json({ ok: true }));

    await request(app).get("/ping").set("Authorization", "Bearer fd_pat_SECRET-PERSONAL-TOKEN").expect(200);

    expect(output()).not.toContain("SECRET-PERSONAL-TOKEN");
    expect(output()).toContain("GET /ping 200");
  });
});
