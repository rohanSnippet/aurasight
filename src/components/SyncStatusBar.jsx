import { useEffect, useState } from "react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { getStats } from "@/lib/db";
import { tick } from "@/lib/syncManager";

const SyncStatusBar = () => {
  const [online, setOnline] = useState(navigator.onLine);
  const [stats, setStats] = useState({ pending: 0, inProgress: 0, synced: 0, total: 0 });
  const [busy, setBusy] = useState(false);

  const refresh = async () => setStats(await getStats());

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 1500);
    const onUp = () => setOnline(true);
    const onDown = () => setOnline(false);
    window.addEventListener("online", onUp);
    window.addEventListener("offline", onDown);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", onUp);
      window.removeEventListener("offline", onDown);
    };
  }, []);

  const forceSync = async () => {
    setBusy(true);
    try {
      await tick();
    } finally {
      setBusy(false);
      refresh();
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card/60 p-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-xl ${
            online ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
          }`}
        >
          {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
        </span>
        <div className="leading-tight">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {online ? "Online" : "Offline"}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground/80">
            {stats.synced}/{stats.total} synced · {stats.pending} pending · {stats.inProgress} locked
          </p>
        </div>
      </div>
      <button
        onClick={forceSync}
        disabled={busy || !online}
        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary/70 disabled:opacity-40"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
        Sync now
      </button>
    </div>
  );
};

export default SyncStatusBar;