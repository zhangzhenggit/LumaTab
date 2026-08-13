import { useEffect, useState } from "react";
import { cycleBingBackground, loadBingBackground } from "../lib/background";

const FALLBACK_WALLPAPER = "/assets/wallpapers/fallback-alpine.webp";

export function useBingWallpaper(notify) {
  const [wallpaper, setWallpaper] = useState(FALLBACK_WALLPAPER);
  const [backgroundMeta, setBackgroundMeta] = useState(null);

  useEffect(() => {
    let disposed = false;
    void loadBingBackground().then((result) => {
      if (!disposed) { setWallpaper(result.url); setBackgroundMeta(result.meta); }
    });
    return () => { disposed = true; };
  }, []);

  async function changeBackground() {
    notify("正在更换 Bing 背景…");
    const result = await cycleBingBackground();
    setWallpaper((current) => {
      if (current.startsWith("blob:")) URL.revokeObjectURL(current);
      return result.url;
    });
    setBackgroundMeta(result.meta);
    notify(result.meta ? `已切换至近 7 日图片 ${result.meta.selectedIndex + 1}/${result.meta.imageCount}` : "暂时无法获取 Bing 背景");
  }

  return { wallpaper, backgroundMeta, changeBackground };
}
