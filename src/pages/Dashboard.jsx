import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import AuraLogo from "@/components/AuraLogo";
import StatusPill from "@/components/StatusPill";
import SyncStatusBar from "@/components/SyncStatusBar";
import { Sparkles } from "lucide-react";

const Dashboard = () => {
  const scans = useLiveQuery(
    () => db.scans.orderBy("created_at").reverse().limit(50).toArray(),
    [],
    [],
  );

  return (
    <div className="mx-auto max-w-2xl px-5 pb-28 pt-8">
      <header className="mb-6 flex items-center justify-between">
        <AuraLogo />
        <span className="rounded-full border border-border bg-secondary px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Triage
        </span>
      </header>

      <h1 className="font-display text-3xl font-semibold tracking-tight">
        Field history
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        On-device inferences captured offline, synced opportunistically.
      </p>

      <div className="mt-5">
        <SyncStatusBar />
      </div>

      <section className="mt-6 space-y-2">
        {scans && scans.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-aura text-primary-foreground shadow-glow">
              <Sparkles className="h-5 w-5" />
            </div>
            <p className="font-display text-base font-medium">No scans yet</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Open the Scan tab and capture a frame. Inference runs on-device — no
              network required.
            </p>
          </div>
        )}

        {scans?.map((s) => (
          <article
            key={s.id}
            className="flex items-center gap-4 rounded-2xl border border-border bg-card p-3 shadow-elevated transition-colors hover:border-primary/40"
          >
            <img
              src={s.image_b64}
              alt={s.label}
              className="h-16 w-16 flex-none rounded-xl object-cover ring-1 ring-border"
              loading="lazy"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-display text-sm font-semibold">
                  {s.label}
                </p>
                <StatusPill status={s.sync_status} />
              </div>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                conf {(s.confidence * 100).toFixed(1)}% ·{" "}
                {new Date(s.created_at).toLocaleTimeString()}
              </p>
              <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/60">
                {s.id}
              </p>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
};

export default Dashboard;