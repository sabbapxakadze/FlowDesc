import { API_TOKEN_MAX_ACTIVE, API_TOKEN_PREFIX, type ApiToken, type CreateApiTokenRequest } from "@flowdesc/contracts";
import { AppError } from "../../shared/errors.js";
import { generateOpaqueToken, hashToken } from "../auth/tokens.js";
import * as authRepository from "../auth/auth.repository.js";
import * as organizationsRepository from "../organizations/organizations.repository.js";
import * as repository from "./api-tokens.repository.js";

const DAY_MS = 24 * 60 * 60 * 1000;

type Row = Awaited<ReturnType<typeof repository.insert>>;

function toSummary(row: Row): ApiToken {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

/** The raw token is returned here and nowhere else; only its hash is stored. */
export async function create(userId: string, input: CreateApiTokenRequest) {
  const now = new Date();
  if ((await repository.countActiveForUser(userId, now)) >= API_TOKEN_MAX_ACTIVE) {
    throw new AppError(
      "too_many_tokens",
      409,
      `You can have ${API_TOKEN_MAX_ACTIVE} active tokens. Revoke one you no longer use first.`,
    );
  }
  const token = `${API_TOKEN_PREFIX}${generateOpaqueToken()}`;
  const row = await repository.insert({
    userId,
    name: input.name,
    tokenHash: hashToken(token),
    scope: input.scope,
    expiresAt: new Date(now.getTime() + input.expiresInDays * DAY_MS),
  });
  return { token, data: toSummary(row) };
}

export async function list(userId: string) {
  return (await repository.listForUser(userId)).map(toSummary);
}

export async function revoke(userId: string, tokenId: string) {
  if (!(await repository.revoke(userId, tokenId, new Date()))) {
    throw new AppError("token_not_found", 404, "That token was not found.");
  }
}

/**
 * Who a token acts as and in which organization. It exists because the organization id is in every address and a client holding
 * only a token has no login response to read it from.
 */
export async function context(userId: string) {
  const [user, organization] = await Promise.all([
    authRepository.findUserById(userId),
    organizationsRepository.findPrimaryOrganizationForUser(userId),
  ]);
  const membership = organization ? await organizationsRepository.findMembership(userId, organization.id) : undefined;
  if (!user || !organization || !membership) {
    throw new AppError("no_organization", 403, "You are not a member of any organization.");
  }
  return {
    user: { id: user.id, name: user.name, email: user.email },
    organization: { id: organization.id, name: organization.name, role: membership.role },
  };
}
