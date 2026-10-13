import { z } from "zod";

/**
 * Personal access tokens (ADR 0070): what a person creates on their account to let an AI app (through the MCP server) read their
 * FlowDesc data. Only "read" can be created for now; "read_write" is added with the write tools.
 */
export const API_TOKEN_PREFIX = "fd_pat_";
export const API_TOKEN_MAX_ACTIVE = 20;
export const API_TOKEN_LIFETIMES_DAYS = [30, 90, 365] as const;

export const createApiTokenRequestSchema = z.object({
  name: z.string().trim().min(1, "Give the token a name.").max(80, "Use 80 characters or fewer."),
  scope: z.literal("read"),
  expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365)]),
});
export type CreateApiTokenRequest = z.infer<typeof createApiTokenRequestSchema>;

/** What the list shows. Never the token and never its hash. */
export const apiTokenSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  scope: z.enum(["read", "read_write"]),
  createdAt: z.string(),
  expiresAt: z.string(),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
});
export type ApiToken = z.infer<typeof apiTokenSchema>;

export const apiTokenListResponseSchema = z.object({ data: z.array(apiTokenSchema) });
export type ApiTokenListResponse = z.infer<typeof apiTokenListResponseSchema>;

/** `token` is the only time the secret is ever sent; the person must copy it now. */
export const createApiTokenResponseSchema = z.object({ token: z.string(), data: apiTokenSchema });
export type CreateApiTokenResponse = z.infer<typeof createApiTokenResponseSchema>;

/** Who a token acts as and in which organization: the first thing a client asks, since the organization id is in every address. */
export const tokenContextResponseSchema = z.object({
  data: z.object({
    user: z.object({ id: z.uuid(), name: z.string(), email: z.string() }),
    organization: z.object({ id: z.uuid(), name: z.string(), role: z.enum(["owner", "admin", "member", "viewer"]) }),
  }),
});
export type TokenContextResponse = z.infer<typeof tokenContextResponseSchema>;
