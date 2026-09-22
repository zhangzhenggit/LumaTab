import { useEffect, useState } from "react";

// The page's focal point, and the thing it had none of.
//
// Every new tab page that reads as designed has one large element holding the composition
// together — Bonjourr, Momentum, iTab and WeTab all do, and measuring Bonjourr (the highest-rated
// of them) gives the proportions this follows: the time at 84px in a light weight, the date a
// quarter of that underneath, both centred on the page's own axis. LumaTab's largest type was a
// 15px section heading, which is why a screenshot of it read as a sheet of stickers rather than
// as a page: nothing on it was big enough to look at first.
//
// It updates on the minute, never on the second. A seconds display is a different product — it
// asks to be watched, and this is a page people look at for two seconds on the way somewhere
// else — and it would also cost a render every second for the entire life of the tab.
//
// The timer is scheduled to the next minute boundary rather than on a 60s interval, because an
// interval drifts: it fires 60s after the last render, so a tab opened at :30 shows every minute
// half a minute late, forever. `visibilitychange` re-reads on return, because a background tab's
// timers are throttled to whole minutes at best and may be coalesced away entirely — unlike the
// wallpaper drift, though, nothing here accumulates, so coming back late costs a stale minute for
// one frame rather than a visible jump.
function useNow() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer = 0;
    const tick = () => {
      const current = new Date();
      setNow(current);
      const untilNextMinute = 60_000 - (current.getSeconds() * 1000 + current.getMilliseconds());
      timer = setTimeout(tick, untilNextMinute + 20);
    };
    tick();
    const resync = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      tick();
    };
    document.addEventListener("visibilitychange", resync);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resync);
    };
  }, []);

  return now;
}

const DAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

export function Clock() {
  const now = useNow();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  // The separator is its own element so it can hold a fixed width. Tabular figures keep the
  // digits from shifting as they change, but a colon is narrow in every typeface, so without
  // this the whole clock slides left and right by a couple of pixels on the hour.
  return (
    <div className="clock">
      <div className="clock__time">
        <span>{hours}</span><span className="clock__colon">:</span><span>{minutes}</span>
      </div>
      <div className="clock__date">
        {now.getMonth() + 1} 月 {now.getDate()} 日 {DAYS[now.getDay()]}
      </div>
    </div>
  );
}
