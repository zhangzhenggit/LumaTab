import { useEffect, useState } from "react";

export function useNotice() {
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 2200);
    return () => clearTimeout(timeout);
  }, [notice]);

  return [notice, setNotice];
}
