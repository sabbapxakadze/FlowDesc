import { asRecord, exchangeFailed, providerFetch } from "./http.js";
import type { OAuthProvider } from "./types.js";

/**
 * GitHub's own OAuth flow. The `/user` email can be missing or unverified, so the address comes from `/user/emails`:
 * the primary one, and only if GitHub says it is verified. PKCE parameters are sent too; whether GitHub enforces them
 * is not something this code relies on (the `state` check is the CSRF guard either way).
 */
export function githubProvider(clientId: string, clientSecret: string): OAuthProvider {
  const api = (token: string): RequestInit => ({
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "FlowDesc" },
  });
  return {
    name: "github",
    authorizeUrl({ state, codeChallenge, redirectUri }) {
      const url = new URL("https://github.com/login/oauth/authorize");
      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: "read:user user:email",
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      }).toString();
      return url.toString();
    },
    async exchange({ code, codeVerifier, redirectUri }) {
      const token = asRecord(
        await providerFetch("https://github.com/login/oauth/access_token", {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
          }),
        }),
      );
      if (typeof token.access_token !== "string") throw exchangeFailed("github sent no access token");

      const user = asRecord(await providerFetch("https://api.github.com/user", api(token.access_token)));
      const emails = await providerFetch("https://api.github.com/user/emails", api(token.access_token));
      if (typeof user.id !== "number" || !Array.isArray(emails)) throw exchangeFailed("github sent no id or emails");

      const primary = emails.map(asRecord).find((e) => e.primary === true);
      if (!primary || typeof primary.email !== "string") throw exchangeFailed("github sent no primary email");
      const login = typeof user.login === "string" ? user.login : primary.email.split("@")[0]!;
      return {
        providerUserId: String(user.id),
        email: primary.email.toLowerCase().trim(),
        emailVerified: primary.verified === true,
        name: typeof user.name === "string" && user.name.trim() ? user.name.trim() : login,
      };
    },
  };
}
