// Single source of truth for the icon cache identity. The service worker writes these entries
// and the new-tab page reads them, so the two MUST agree — when these lived as separate
// constants in each file, bumping one and forgetting the other silently broke every icon:
// the worker resolved high-res art into the new cache while the page kept reading the old,
// empty one and fell back to Chrome's low-res placeholder forever.
export const ICON_CACHE_NAME = "lumatab-site-icons-v18";
export const ICON_FAILURE_KEY = "lumatab.site-icon-failures.v16";
