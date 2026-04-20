import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { Camera, CameraOff, Zap, Loader2 } from "lucide-react";
import { preprocessFrame, frameToCompressedBase64 } from "@/lib/preprocess";
import { predict, getSession } from "@/lib/inference";
import { insertScan } from "@/lib/db";
import { tick } from "@/lib/syncManager";
import AuraLogo from "@/components/AuraLogo";
import SyncStatusBar from "@/components/SyncStatusBar";

const ScannerScreen = () => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [modelReady, setModelReady] = useState(false);

  useEffect(() => {
    // Warm the inference session on mount.
    getSession().then(() => setModelReady(true));
  }, []);

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStreaming(true);
    } catch (e) {
      setError(e?.message ?? "Camera unavailable");
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStreaming(false);
  };

  useEffect(() => () => stopCamera(), []);

  const capture = async () => {
    if (!videoRef.current || !streaming || busy) return;
    setBusy(true);
    try {
      // 1. Tensor preprocessing (explicit) — crop, resize, normalize.
      const tensor = preprocessFrame(videoRef.current);
      // 2. On-device inference.
      const pred = await predict(tensor);
      // 3. Compress frame to small base64 BEFORE persisting.
      const { dataUrl, width, height } = await frameToCompressedBase64(videoRef.current);
      // 4. Insert with UUID → durable, idempotent queue.
      const id = uuidv4();
      await insertScan({
        id,
        label: pred.label,
        confidence: pred.confidence,
        image_b64: dataUrl,
        width,
        height,
        created_at: Date.now(),
      });
      setLastResult({ id, ...pred, dataUrl });
      // 5. Best-effort drain (no-op if offline / lock held).
      tick();
    } catch (e) {
      setError(e?.message ?? "Capture failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-5 pb-28 pt-8">
      <header className="mb-6 flex items-center justify-between">
        <AuraLogo />
        <span className="rounded-full border border-border bg-secondary px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Scanner
        </span>
      </header>

      <h1 className="font-display text-3xl font-semibold tracking-tight">
        Live triage
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        224×224 ImageNet-normalized tensor → on-device classifier.
      </p>

      <div className="relative mt-5 aspect-square w-full overflow-hidden rounded-3xl border border-border bg-black shadow-elevated">
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-full w-full object-cover"
        />
        {!streaming && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-surface text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-aura shadow-glow">
              <Camera className="h-6 w-6 text-primary-foreground" />
            </div>
            <p className="font-display text-base font-medium">Camera idle</p>
            <p className="max-w-xs px-6 text-sm text-muted-foreground">
              Grant camera access to begin live inference. All processing is local.
            </p>
          </div>
        )}

        {streaming && (
          <>
            {/* targeting reticle */}
            <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-primary/70 shadow-glow" />
            {/* scanline */}
            <div className="pointer-events-none absolute inset-x-8 top-8 h-px overflow-hidden">
              <div className="h-px w-full animate-scan bg-primary shadow-glow" />
            </div>
            <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-primary backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              Live
            </div>
          </>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        {!streaming ? (
          <button
            onClick={startCamera}
            className="flex-1 rounded-2xl bg-gradient-aura px-4 py-3.5 font-display text-sm font-semibold text-primary-foreground shadow-glow transition-transform active:scale-[0.98]"
          >
            Start camera
          </button>
        ) : (
          <>
            <button
              onClick={capture}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-aura px-4 py-3.5 font-display text-sm font-semibold text-primary-foreground shadow-glow transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              {busy ? "Inferring…" : "Capture & classify"}
            </button>
            <button
              onClick={stopCamera}
              className="flex h-[50px] w-[50px] flex-none items-center justify-center rounded-2xl border border-border bg-card text-foreground transition-colors hover:bg-secondary"
              aria-label="Stop camera"
            >
              <CameraOff className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
        Model: {modelReady ? "ready" : "loading"} · Pipeline: 224×224 · NCHW · ImageNet norm
      </p>

      {error && (
        <div className="mt-4 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {lastResult && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-primary/30 bg-card p-3 shadow-elevated">
          <img
            src={lastResult.dataUrl}
            alt={lastResult.label}
            className="h-16 w-16 flex-none rounded-xl object-cover ring-1 ring-border"
          />
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-semibold">{lastResult.label}</p>
            <p className="font-mono text-[11px] text-muted-foreground">
              confidence {(lastResult.confidence * 100).toFixed(1)}%
            </p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/60">
              {lastResult.id}
            </p>
          </div>
        </div>
      )}

      <div className="mt-5">
        <SyncStatusBar />
      </div>
    </div>
  );
};

export default ScannerScreen;