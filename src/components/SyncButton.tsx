import { useState } from "react";

export default function SyncButton() {
  const [state, setState] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [count, setCount] = useState(0);

  const sync = async () => {
    setState("syncing");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch("/api/sync-library", {
        method: "POST",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (res.ok) {
        setCount(data.synced);
        setState("done");
        setTimeout(() => location.reload(), 1000);
      } else {
        setState("error");
      }
    } catch {
      clearTimeout(timeout);
      setState("error");
    }
  };

  const label = {
    idle: "Синхронизировать",
    syncing: "Синхронизация...",
    done: `Готово: ${count} игр`,
    error: "Ошибка!",
  }[state];

  return (
    <button
      onClick={sync}
      disabled={state === "syncing"}
      className="whitespace-nowrap rounded-lg border border-gray-700 px-3 py-2 text-sm transition hover:bg-gray-800 disabled:opacity-50"
    >
      {label}
    </button>
  );
}
