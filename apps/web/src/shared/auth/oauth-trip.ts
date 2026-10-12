/**
 * A provider sign-in (Google, GitHub) leaves the site and comes back as a full page load, so the page is blank until the silent refresh
 * signs the person in. The button notes the trip here just before it leaves, and `AuthContext` fades the app in when it finds the note on
 * return (a plain reload has no note, so it does not fade). `sessionStorage` is per tab and survives the round trip; where the browser
 * blocks it, there is simply no fade.
 */
const KEY = "flowdesc_oauth_trip";

export function markOAuthTrip(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    // Storage blocked: the sign-in still works, it just cuts instead of fading.
  }
}

let cameBack: boolean | undefined;

/**
 * True once per page load if this load is the return from a provider. The answer is kept for the rest of the page load, because in
 * development React runs the sign-in effect twice and both runs must agree.
 */
export function returnedFromOAuth(): boolean {
  if (cameBack === undefined) {
    try {
      cameBack = sessionStorage.getItem(KEY) !== null;
      sessionStorage.removeItem(KEY);
    } catch {
      cameBack = false;
    }
  }
  return cameBack;
}
