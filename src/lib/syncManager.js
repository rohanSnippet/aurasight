/**
 * SyncManager — drains the offline queue with idempotent uploads.
 *
 * Architectural directives (#3):
 *   - Tri-state lock (PENDING → IN_PROGRESS → SYNCED, with rollback to PENDING).
 *   - UUID primary key sent as Idempotency-Key header AND in body so the
 *     backend can dedupe duplicate POSTs from network retries.
 *   - Per-tab mutex via the Web Locks API, so two foreground SyncManager
 *     instances (e.g. opened in two tabs) don't race on the same row.
 *
 * The endpoint is configurable; default '/api/scans' is a stub that will
 * 404 in the preview — that's expected. The state machine handles the
 * failure path (revert to PENDING, increment attempts) which is exactly
 * what we want to demo.
 */

import { claimPendingScans, markSynced, revertToPending } from "./db.js";

const ENDPOINT = "/api/scans";
const REQUEST_TIMEOUT_MS = 8000;
const BATCH = 8;

let _ticking = false;

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function uploadOne(row) {
  const res = await withTimeout(
    fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Backend MUST treat duplicate Idempotency-Keys as the same request.
        "Idempotency-Key": row.id,
      },
      body: JSON.stringify({
        id: row.id,
        label: row.label,
        confidence: row.confidence,
        image_b64: row.image_b64,
        width: row.width,
        height: row.height,
        created_at: row.created_at,
      }),
    }),
    REQUEST_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function tickInner(onProgress) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { attempted: 0, ok: 0, failed: 0, offline: true };
  }

  const claimed = await claimPendingScans(BATCH);
  let ok = 0;
  let failed = 0;
  for (const row of claimed) {
    try {
      await uploadOne(row);
      await markSynced(row.id);
      ok++;
    } catch (e) {
      await revertToPending(row.id, e?.message ?? String(e));
      failed++;
    }
    onProgress?.({ id: row.id, ok, failed, total: claimed.length });
  }
  return { attempted: claimed.length, ok, failed, offline: false };
}

/** Run one drain pass. Safe to call concurrently — guarded by Web Locks. */
export async function tick(onProgress) {
  if (_ticking) return { attempted: 0, ok: 0, failed: 0, skipped: true };
  _ticking = true;
  try {
    if (typeof navigator !== "undefined" && navigator.locks?.request) {
      return await navigator.locks.request("aurasight-sync", { ifAvailable: true }, async (lock) => {
        if (!lock) return { attempted: 0, ok: 0, failed: 0, skipped: true };
        return tickInner(onProgress);
      });
    }
    return await tickInner(onProgress);
  } finally {
    _ticking = false;
  }
}

/** Start a long-lived sync loop with online/offline awareness. */
export function startSyncLoop({ intervalMs = 6000, onTick } = {}) {
  let stopped = false;
  let timer = null;

  const run = async () => {
    if (stopped) return;
    try {
      const r = await tick();
      onTick?.(r);
    } catch (e) {
      onTick?.({ error: e?.message ?? String(e) });
    } finally {
      if (!stopped) timer = setTimeout(run, intervalMs);
    }
  };

  const onOnline = () => {
    if (timer) clearTimeout(timer);
    run();
  };
  window.addEventListener("online", onOnline);
  run();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    window.removeEventListener("online", onOnline);
  };
}