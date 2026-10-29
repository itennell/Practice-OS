"use client";

// Scrolls its spot into view once, when it first shows: a side panel opened on one
// item from a document card in the chat (?focus=<id>). No motion if she prefers less.

import { useEffect, useRef } from "react";

export function ScrollIntoView() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ref.current?.parentElement?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  }, []);
  return <span ref={ref} hidden />;
}
