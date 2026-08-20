import { useCallback, useMemo, useRef, useState } from "react";
import {
  brightnessFrom,
  DEFAULT_BLUR,
  findGradient,
  gradientCss,
} from "../lib/background-cache-keys";
import { autoBrightnessFor, measureWallpaperLuminance } from "../lib/wallpaper-tone";
import {
  chooseGradient,
  chooseWallpaper,
  FALLBACK_WALLPAPER,
  followLatestWallpaper,
  loadBingBackground,
  loadWallpaperLibrary,
  storeAutoBrightness,
  tuneWallpaper,
} from "../lib/background";

export function useBingWallpaper(notify, initialWallpaper = null) {
  // Seeded from the pre-render cache read in main.jsx, so the very first frame is already the
  // real wallpaper rather than the bundled fallback.
  const [wallpaper, setWallpaper] = useState(() => ({
    url: initialWallpaper?.gradient ? null : initialWallpaper?.url ?? FALLBACK_WALLPAPER,
    gradient: initialWallpaper?.gradient ?? null,
    gradientColors: initialWallpaper?.gradientColors ?? null,
  }));
  const [backgroundMeta, setBackgroundMeta] = useState(initialWallpaper?.meta ?? null);
  const [tuning, setTuning] = useState(() => ({
    brightness: brightnessFrom(initialWallpaper?.meta),
    blur: initialWallpaper?.meta?.blur ?? DEFAULT_BLUR,
  }));
  // True until the brightness slider is touched. While it holds, each photo is measured and
  // toned down just enough to sit clear of the icon tiles' value band — the same gap the deep
  // gradients get for free, which is what makes the icons read as the foreground.
  const autoToneRef = useRef(initialWallpaper?.meta?.brightnessAuto !== false);
  const tonedRef = useRef(null);
  const [photoLuminance, setPhotoLuminance] = useState(null);
  const pendingTuning = useRef(null);
  const startedRef = useRef(false);

  const replaceWallpaper = useCallback((result) => {
    if (!result) return;
    setWallpaper((current) => {
      if (current.url && current.url !== result.url && current.url.startsWith("blob:")) {
        URL.revokeObjectURL(current.url);
      }
      return {
        url: result.gradient ? null : result.url,
        gradient: result.gradient ?? null,
        gradientColors: result.gradientColors ?? null,
      };
    });
    if (result.gradient) setPhotoLuminance(null);
    setBackgroundMeta(result.meta);
    if (result.meta) {
      if (result.meta.brightnessAuto !== undefined) autoToneRef.current = result.meta.brightnessAuto;
      setTuning({ brightness: brightnessFrom(result.meta), blur: result.meta.blur ?? DEFAULT_BLUR });
    }
    void matchTone(result);
  }, []);

  // Measures the photo and lowers brightness toward the target. Gradients skip this: their
  // luminance is known exactly and already chosen to clear the band.
  const matchTone = useCallback(async (result) => {
    if (!result?.url || result.gradient) return;
    if (tonedRef.current === result.url) return;
    tonedRef.current = result.url;
    const luminance = await measureWallpaperLuminance(result.url);
    if (luminance === null) return;
    setPhotoLuminance(luminance);
    if (!autoToneRef.current) return;
    const brightness = autoBrightnessFor(luminance);
    setTuning((current) => {
      if (current.brightness === brightness) return current;
      pendingTuning.current = { ...current, brightness };
      return pendingTuning.current;
    });
    void storeAutoBrightness(brightness);
  }, []);

  // Catching up with the worker is a background errand: when the pre-render read already produced
  // an image this only matters if Bing has rotated, and swapping to an identical image would just
  // make the page flicker for nothing. Guarded by a ref rather than useEffect deps so React's
  // double-invoked mount in StrictMode cannot fire it twice.
  if (!startedRef.current) {
    startedRef.current = true;
    void loadBingBackground().then((result) => {
      if (!result) return;
      const sameGradient = result.gradient && result.gradient === initialWallpaper?.gradient;
      const samePhoto = result.meta?.startDate
        && result.meta.startDate === initialWallpaper?.meta?.startDate;
      if (sameGradient || samePhoto) return;
      if (!initialWallpaper && result.url === FALLBACK_WALLPAPER) return;
      replaceWallpaper(result);
    });
    if (initialWallpaper) void matchTone(initialWallpaper);
  }

  const pinWallpaper = useCallback(async (key) => {
    const library = await chooseWallpaper(key);
    replaceWallpaper(await loadBingBackground());
    notify("已固定该壁纸");
    return library;
  }, [notify, replaceWallpaper]);

  const followLatest = useCallback(async () => {
    const library = await followLatestWallpaper();
    replaceWallpaper(await loadBingBackground());
    notify("已切换为每日自动更新");
    return library;
  }, [notify, replaceWallpaper]);

  // A gradient is pure CSS the page can derive from the key on its own, so it is applied
  // immediately and persisted afterwards. Waiting for the worker to echo the choice back made
  // the click depend on a round trip that has nothing to contribute — nothing needs downloading,
  // and if the reply were slow or dropped the click looked like it did nothing at all.
  const pickGradient = useCallback(async (gradientKey) => {
    const gradient = findGradient(gradientKey);
    if (gradient) {
      setWallpaper((current) => {
        if (current.url?.startsWith("blob:")) URL.revokeObjectURL(current.url);
        return { url: null, gradient: gradientCss(gradient.colors), gradientColors: gradient.colors };
      });
      setPhotoLuminance(null);
      setBackgroundMeta(null);
    }
    notify("已使用纯色背景");
    return await chooseGradient(gradientKey);
  }, [notify]);

  // Brightness and blur repaint the live page immediately and persist in the background, so
  // dragging a slider feels direct instead of waiting on a round trip per step. The write is
  // kept out of the state updater: React invokes updaters twice under StrictMode, and a
  // message send is not something that may run twice per change.
  const adjust = useCallback((next) => {
    // Touching the slider is a decision; automatic tone matching stops for good.
    if (next.brightness !== undefined) autoToneRef.current = false;
    setTuning((current) => {
      const merged = { ...current, ...next };
      pendingTuning.current = merged;
      return merged;
    });
  }, []);
  // Persisted when the drag ends rather than on every step, so one gesture is one write.
  const commitTuning = useCallback(() => {
    if (pendingTuning.current) void tuneWallpaper(pendingTuning.current);
  }, []);

  // Stable across renders so consumers can safely put it in a dependency array; rebuilding it
  // every render made SettingsPanel's effect re-run forever, refetching the library each time.
  return useMemo(() => ({
    wallpaper, backgroundMeta, tuning, photoLuminance,
    loadWallpaperLibrary, pinWallpaper, followLatest, pickGradient, adjust, commitTuning,
  }), [wallpaper, backgroundMeta, tuning, photoLuminance, pinWallpaper, followLatest, pickGradient, adjust, commitTuning]);
}
