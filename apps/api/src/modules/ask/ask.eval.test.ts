import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { resetDatabase } from "../../db/test-utils.js";
import { createDemoCopy } from "../../db/seed-demo.js";
import { users } from "../../db/schema/index.js";
import { retrieveSources } from "./ask.retrieval.js";

/**
 * How well retrieval FINDS the right issue (ADR 0077, decision 12f), measured on the seeded demo data and with no model involved: for each question,
 * is at least one of the issues that answers it among the sources? Phase B (embeddings) has to beat these numbers, so they are written down.
 *
 * Two groups, on purpose. "Keyword" questions share words with the issue they are about, the way most questions do. "Paraphrase" questions mean the same
 * thing in other words ("make the website load quicker" for an issue about a performance score), which word matching cannot find. That group is expected
 * to fail in phase A, and its score is the room phase B has to improve on. It is reported and pinned (so a change shows up), not hidden.
 */

type Case = { question: string; anyOf: string[] };

const KEYWORD: Case[] = [
  { question: "Who is building the login screen?", anyOf: ["Build the login screen"] },
  { question: "What is going on with the pricing page?", anyOf: ["Redesign the pricing page"] },
  { question: "Do we have a cookie banner?", anyOf: ["Add a cookie consent banner"] },
  { question: "Why do footer links break on mobile?", anyOf: ["Footer links open the wrong page on mobile"] },
  { question: "What is the plan for migrating blog posts?", anyOf: ["Migrate blog posts to the new CMS"] },
  { question: "Tell me about the CMS migration guide", anyOf: ["Write the migration guide for the new CMS"] },
  { question: "Is refresh token rotation done?", anyOf: ["Add refresh token rotation"] },
  { question: "Do we support dark mode?", anyOf: ["Add dark mode to the marketing site", "Dark mode follows the system setting"] },
  { question: "What crashes on Android?", anyOf: ["App crashes when opening the camera on Android 12"] },
  { question: "Is biometric login planned?", anyOf: ["Biometric login (Face ID and fingerprint)"] },
  { question: "Does the newsletter form validate emails?", anyOf: ["Newsletter signup form accepts invalid emails"] },
  { question: "What about the Spanish translations?", anyOf: ["Add Spanish and German translations", "Fix a typo in the Spanish translation of onboarding"] },
  { question: "What is the Lighthouse score target?", anyOf: ["Improve the Lighthouse performance score above 90"] },
  { question: "Are automatic builds set up?", anyOf: ["Set up automatic builds"] },
  { question: "Where are the TestFlight instructions?", anyOf: ["Write the TestFlight beta instructions"] },
  { question: "Is there OpenAPI documentation for issues?", anyOf: ["Write the OpenAPI description for issues"] },
  { question: "How do we return validation errors?", anyOf: ["Return field-level validation errors"] },
  { question: "Is the app available offline?", anyOf: ["Offline mode for the issue list"] },
  { question: "Was the accessibility of checkout reviewed?", anyOf: ["Accessibility audit of the checkout flow"] },
  { question: "What is happening with the contact form on Safari?", anyOf: ["Fix the contact form on Safari"] },
];

const PARAPHRASE: Case[] = [
  { question: "How quickly does it boot up?", anyOf: ["Reduce the app start time below two seconds"] },
  { question: "How fast do our pages open?", anyOf: ["Improve the Lighthouse performance score above 90", "Fix layout shift on the homepage hero image"] },
  { question: "How will search engines find our pages?", anyOf: ["Add sitemap and robots.txt"] },
  { question: "Can users sign in with a thumb touch?", anyOf: ["Biometric login (Face ID and fingerprint)"] },
  { question: "Is there a night theme?", anyOf: ["Add dark mode to the marketing site", "Dark mode follows the system setting"] },
  { question: "Do we ask visitors for permission to track them?", anyOf: ["Add a cookie consent banner"] },
  { question: "Can people use it without internet?", anyOf: ["Offline mode for the issue list"] },
];

let org: { organizationId: string; ownerId: string };

beforeAll(async () => {
  await resetDatabase();
  org = await createDemoCopy(new Date(Date.now() + 60 * 60 * 1000));
  // Sanity: the owner exists, so "me" questions would work too.
  expect(await db.select({ id: users.id }).from(users).where(eq(users.id, org.ownerId))).toHaveLength(1);
});

async function score(cases: Case[]) {
  const misses: string[] = [];
  for (const c of cases) {
    const found = (await retrieveSources({ organizationId: org.organizationId, userId: org.ownerId, question: c.question, today: new Date().toISOString().slice(0, 10) })).sources.map((s) => s.title);
    if (!c.anyOf.some((title) => found.includes(title))) misses.push(c.question);
  }
  return { recall: (cases.length - misses.length) / cases.length, misses };
}

describe("retrieval quality on the demo data (phase A baseline)", () => {
  it("finds the right issue for questions that share words with it", async () => {
    // Why: this is what phase A is for. A regression in the search query, the stemming or the ranking shows up here as a lower number and the questions it lost.
    const { recall, misses } = await score(KEYWORD);
    // Measured on 2026-11-04: 20 of 20. The floor allows one miss; the message names what was lost.
    expect(recall, `missed: ${misses.join(" | ")}`).toBeGreaterThanOrEqual(0.95);
  });

  it("is known not to find paraphrases, which is the room phase B (embeddings) has to improve on", async () => {
    // Why: pinning the weak spot keeps the claim honest. If this ever starts passing, phase A got better than expected and the number should be updated.
    const { recall, misses } = await score(PARAPHRASE);
    // Measured on 2026-11-04: 2 of 7 (about 29%), both found only through a stray shared word ("theme", "internet"). Phase B should clearly beat this.
    expect(recall, `found more than expected, so update the baseline in ADR 0077; missed: ${misses.join(" | ")}`).toBeLessThanOrEqual(0.4);
  });
});
