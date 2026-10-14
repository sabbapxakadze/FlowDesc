import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { listNotificationsResponseSchema } from "@flowdesc/contracts";
import { app } from "../../app.js";
import { db } from "../../db/client.js";
import { resetDatabase } from "../../db/test-utils.js";
import { organizationMembers, users } from "../../db/schema/index.js";
import { signAccessToken } from "../auth/tokens.js";

/**
 * The notifications list over real HTTP. It exists because a change to the shared event schema (ADR 0074, "viaToken") made this very endpoint
 * answer 500 (the controller checks its own response against the contract) and nothing below the browser tests noticed.
 */
beforeEach(resetDatabase);

describe("GET /organizations/:id/notifications", () => {
  it("lists a comment by someone else, in the shape the contract promises", async () => {
    // Why: the bell and My work read this list. If the response and the contract drift apart, the endpoint fails for everyone, not for one test.
    await request(app).post("/api/v1/auth/register").send({ email: "owner@example.com", password: "password123", name: "Owner", organizationName: "Org A" }).expect(201);
    const login = await request(app).post("/api/v1/auth/login").send({ email: "owner@example.com", password: "password123" }).expect(200);
    const ownerAuth = { Authorization: `Bearer ${login.body.accessToken as string}` };
    const orgId = login.body.organization.id as string;
    const org = `/api/v1/organizations/${orgId}`;

    const project = await request(app).post(`${org}/projects`).set(ownerAuth).send({ name: "Website", key: "WEB" }).expect(201);
    const projectId = project.body.data.id as string;
    const issue = await request(app).post(`${org}/projects/${projectId}/issues`).set(ownerAuth).send({ title: "Footer" }).expect(201);
    const issueId = issue.body.data.id as string;

    const [other] = await db.insert(users).values({ email: "ada@example.com", passwordHash: "x", name: "Ada" }).returning();
    await db.insert(organizationMembers).values({ organizationId: orgId, userId: other!.id, role: "member" });
    await request(app)
      .post(`${org}/projects/${projectId}/issues/${issueId}/comments`)
      .set({ Authorization: `Bearer ${signAccessToken(other!.id)}` })
      .send({ body: "I can reproduce this" })
      .expect(201);

    const res = await request(app).get(`${org}/notifications`).set(ownerAuth).expect(200);
    const parsed = listNotificationsResponseSchema.parse(res.body);
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0]).toMatchObject({ issueTitle: "Footer", projectKey: "WEB", readAt: null, event: { type: "issue.commented", actorName: "Ada" } });
  });
});
