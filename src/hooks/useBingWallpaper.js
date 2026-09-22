import { useCallback, useMemo, useRef, useState } from "react";
import {
  brightnessFrom,
  findGradient,
  gradientCss,
} from "../lib/background-cache-keys";
import { autoBrightnessFor, measureWallpaperTone } from "../lib/wallpaper-tone";
import {
  chooseGradient,
  chooseWallpaper,
  FALLBACK_WALLPAPER,
  followLatestWallpaper,
  loadBingBackground,
  loadWallpaperLibrary,
  storeAutoBrightness,
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
  // One number, and nothing sets it by hand any more. Brightness used to be a slider beside a
  // blur slider; both are gone, because `.frost` solves for the whole page what they were being
  // asked to solve per photograph, and a measurement is a better answer than a control the user
  // has to discover and then get right.
  const [tuning, setTuning] = useState(() => ({ brightness: brightnessFrom(initialWallpaper?.meta) }));
  // Tone matching is unconditional now. It used to hold only until the brightness slider was
  // touched, because a measurement must never override a decision — but there is no longer a
  // decision to override, so the `brightnessAuto` flag in storage is vestigial and deliberately
  // not read. An install whose slider had been dragged before would otherwise stay stuck at
  // whatever it was left at, with nothing anywhere to change it back.
  const tonedRef = useRef(null);
  const [photoLuminance, setPhotoLuminance] = useState(null);
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
      setTuning({ brightness: brightnessFrom(result.meta) });
    }
    void matchTone(result);
  }, []);

  // Measures the photo and lowers brightness toward the target. Gradients skip this: their
  // luminance is known exactly and already chosen to clear the band.
  const matchTone = useCallback(async (result) => {
    if (!result?.url || result.gradient) return;
    if (tonedRef.current === result.url) return;
    tonedRef.current = result.url;
    const tone = await measureWallpaperTone(result.url);
    if (tone === null) return;
    // The ink decision gets the caption band; auto-brightness gets the whole frame. Handing the
    // mean to both is what left white captions on wallpapers that were bright exactly where the
    // captions sit — see the comment at the top of wallpaper-tone.js.
    setPhotoLuminance(tone.captionBand);
    const brightness = autoBrightnessFor(tone.mean);
    setTuning((current) => (current.brightness === brightness ? current : { brightness }));
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

  // Stable across renders so consumers can safely put it in a dependency array; rebuilding it
  // every render made SettingsPanel's effect re-run forever, refetching the library each time.
  return useMemo(() => ({
    wallpaper, backgroundMeta, tuning, photoLuminance,
    loadWallpaperLibrary, pinWallpaper, followLatest, pickGradient,
  }), [wallpaper, backgroundMeta, tuning, photoLuminance, pinWallpaper, followLatest, pickGradient]);
}
