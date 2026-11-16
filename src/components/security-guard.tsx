"use client";

import { useEffect } from "react";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, [contenteditable='true']"));
}

export function SecurityGuard() {
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (e.key === "F12") e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && ["I", "i", "J", "j", "C", "c"].includes(e.key)) e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && (e.key === "U" || e.key === "u")) e.preventDefault();
    };
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
  return null;
}
