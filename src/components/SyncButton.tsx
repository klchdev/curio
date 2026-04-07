import { useState } from "react";

export default function SyncButton() {
  const [state, setState] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [count, setCount] = useState(0);

  const sync = async () => {
    setState("syncing");
    try {
      const res = await fetch("/api/sync-library", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setCount(data.synced);
        setState("done");
        setTimeout(() => location.reload(), 1000);
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  };

  const label = {
    idle: "Синхронизировать библиотеку",
    syncing: "Синхронизация...",
    done: `Синхронизировано (${count} игр)`,
    error: "Ошибка!",
  }[state];

  return (
    <button
      onClick={sync}
      disabled={state === "syncing"}
      className="rounded-lg border border-gray-700 px-4 py-2 text-sm transition hover:bg-gray-800 disabled:opacity-50"
    >
      {label}
    </button>
  );
}
