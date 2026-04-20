/**
 * AuraSight — Offline durable queue (web equivalent of expo-sqlite).
 *
 * Architectural notes:
 *  • Primary key is a UUID generated on the client, NOT an autoincrement int.
 *    The backend MUST treat POST /scans as idempotent on `id` and ignore
 *    duplicates (HTTP 200 with the existing record). Without this, a network
 *    drop after server-write but before client-ack creates ghost records.
 *
 *  • sync_status is a tri-state lock, not a boolean:
 *       0 = pending (eligible for sync)
 *       2 = in-progress (claimed by a worker; do NOT re-pick)
 *       1 = synced (terminal)
 *    The 2-state prevents two concurrent SyncManager ticks (foreground tab +
 *    background sync event) from POSTing the same row twice.
 *
 *  • We never store raw frame pixels. Frames are JPEG-compressed to a
 *    Base64 string (target ~40-80 KB) before insert so the IndexedDB
 *    payload stays small and background sync memory pressure stays bounded.
 */

import Dexie from "dexie";

export const SYNC = Object.freeze({
  PENDING: 0,
  SYNCED: 1,
  IN_PROGRESS: 2,
});

export const db = new Dexie("aurasight");

db.version(1).stores({
  // id is a UUID string — used as the idempotency key on the server
  scans: "id, sync_status, created_at, [sync_status+created_at]",
});

/** Insert a freshly captured scan in PENDING state. */
export async function insertScan(scan) {
  await db.scans.add({
    id: scan.id,
    label: scan.label,
    confidence: scan.confidence,
    image_b64: scan.image_b64, // already compressed JPEG base64
    width: scan.width,
    height: scan.height,
    created_at: scan.created_at ?? Date.now(),
    sync_status: SYNC.PENDING,
    last_error: null,
    attempts: 0,
  });
}

/**
 * Atomically claim up to `limit` pending rows by flipping them to IN_PROGRESS.
 * Dexie transactions are serialized per-table, so the read+write pair is safe
 * against concurrent claimers in the same tab. Cross-tab safety relies on the
 * Web Locks API in SyncManager (see acquireSyncLock).
 */
export async function claimPendingScans(limit = 8) {
  return db.transaction("rw", db.scans, async () => {
    const candidates = await db.scans
      .where("sync_status")
      .equals(SYNC.PENDING)
      .limit(limit)
      .toArray();

    const ids = candidates.map((c) => c.id);
    if (ids.length) {
      await db.scans.where("id").anyOf(ids).modify({ sync_status: SYNC.IN_PROGRESS });
    }
    return candidates.map((c) => ({ ...c, sync_status: SYNC.IN_PROGRESS }));
  });
}

export async function markSynced(id) {
  await db.scans.update(id, { sync_status: SYNC.SYNCED, last_error: null });
}

export async function revertToPending(id, errorMsg) {
  await db.scans.where("id").equals(id).modify((row) => {
    row.sync_status = SYNC.PENDING;
    row.attempts = (row.attempts ?? 0) + 1;
    row.last_error = errorMsg ?? "unknown";
  });
}

export async function getAllScans() {
  return db.scans.orderBy("created_at").reverse().toArray();
}

export async function getStats() {
  const [pending, inProgress, synced, total] = await Promise.all([
    db.scans.where("sync_status").equals(SYNC.PENDING).count(),
    db.scans.where("sync_status").equals(SYNC.IN_PROGRESS).count(),
    db.scans.where("sync_status").equals(SYNC.SYNCED).count(),
    db.scans.count(),
  ]);
  return { pending, inProgress, synced, total };
}

/** Recovery: on app boot, any row stuck in IN_PROGRESS is from a crashed
 *  worker. Revert to PENDING so it can be retried. */
export async function recoverStaleInProgress() {
  const stuck = await db.scans.where("sync_status").equals(SYNC.IN_PROGRESS).toArray();
  if (stuck.length) {
    await db.scans.where("id").anyOf(stuck.map((s) => s.id)).modify({
      sync_status: SYNC.PENDING,
    });
  }
  return stuck.length;
}