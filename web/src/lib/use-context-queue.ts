import { useEffect, useRef } from "react";
import { pushContext, removeContext } from "./context-queue";

export function useContextQueue(key: string, text: string | (() => string)): void {
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    const resolvedText = typeof text === "function" ? text() : text;
    pushContext(keyRef.current, resolvedText);

    return () => {
      removeContext(keyRef.current);
    };
  }, [key, typeof text === "function" ? undefined : text]);
}
