// Broad site access is optional here, not granted at install.
//
// Resolving a site's real artwork means fetching that site: its /favicon.*, its HTML for the
// declared <link rel="icon">, and its web app manifest. That is genuinely "read every site you
// add", and asking for it up front makes Chrome show its most alarming install prompt — on a new
// tab page, before the user has added a single link, and for a feature they may never care about.
// The manifest therefore requests only bing.com, which the wallpaper needs to work out of the
// box, and leaves the rest to be granted from Settings when the user wants it.
//
// Nothing breaks without the grant. Icon resolution falls straight through to Chrome's own
// favicon store, which already holds an icon for every site the user has visited. Those are
// small, so tiles render them centred on the inset surface instead of full-bleed.
export const SITE_ORIGINS = ["http://*/*", "https://*/*"];

function permissions() {
  return globalThis.chrome?.permissions ?? null;
}

export async function hasSiteAccess() {
  try {
    return Boolean(await permissions()?.contains({ origins: SITE_ORIGINS }));
  } catch {
    return false;
  }
}

// Chrome only shows the prompt from a user gesture on an extension page, which is why this is
// wired to a button in Settings rather than being asked for on first render.
export async function requestSiteAccess() {
  try {
    return Boolean(await permissions()?.request({ origins: SITE_ORIGINS }));
  } catch {
    return false;
  }
}

export async function revokeSiteAccess() {
  try {
    return Boolean(await permissions()?.remove({ origins: SITE_ORIGINS }));
  } catch {
    return false;
  }
}
