// Single source of truth for the icon cache identity. The service worker writes these entries and
// the new-tab page reads them, so the two MUST agree — when these lived as separate constants in
// each file, bumping one and forgetting the other silently broke every icon: the worker resolved
// high-res art into the new cache while the page kept reading the old, empty one.
//
// Both names are derived from one generation for the same reason, and it is not hypothetical.
// The cache was renamed five times in an afternoon while the failure key sat untouched several
// generations behind. Renaming the cache forces every icon to be re-fetched, but the surviving
// failure list made the worker skip exactly the sites recorded in it, and a skipped site never
// gets the chance to succeed that would clear its own record. The grid came back as letter tiles
// with nothing logged as wrong. One constant makes that drift impossible.
const GENERATION = "v22";

export const ICON_CACHE_NAME = `lumatab-site-icons-${GENERATION}`;
// Prefix matters: pruneStaleStorageKeys deletes every key starting with
// "lumatab.site-icon-failures." that is not the current one, so bumping the generation clears
// the previous list on the next install or update.
export const ICON_FAILURE_KEY = `lumatab.site-icon-failures.${GENERATION}`;
