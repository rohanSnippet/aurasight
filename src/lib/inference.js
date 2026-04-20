/**
 * onnxruntime-web inference wrapper.
 *
 * Web equivalent of `react-native-fast-tflite`. The model file is expected at
 * /models/classifier.onnx; if absent we fall back to a deterministic stub
 * classifier so the demo still runs end-to-end without a model artifact.
 * Replace by dropping any 1×3×224×224 → logits ONNX into public/models/.
 */

import * as ort from "onnxruntime-web";

// Configure the WASM binaries served by onnxruntime-web's CDN.
// (Avoids needing to copy them into /public manually.)
ort.env.wasm.wasmPaths =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/";
ort.env.wasm.numThreads = 1; // keep single-threaded; cross-origin isolation not guaranteed in iframe preview

const MODEL_URL = "/models/classifier.onnx";

// Lightweight ImageNet-ish demo labels for the stub path.
const DEMO_LABELS = [
  "benign-lesion",
  "suspicious-lesion",
  "inflammation",
  "normal-tissue",
  "artifact",
];

let _sessionPromise = null;

async function tryLoadSession() {
  try {
    const head = await fetch(MODEL_URL, { method: "HEAD" });
    if (!head.ok) return null;
    return await ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
  } catch {
    return null;
  }
}

export function getSession() {
  if (!_sessionPromise) _sessionPromise = tryLoadSession();
  return _sessionPromise;
}

function softmax(arr) {
  const max = Math.max(...arr);
  const exps = arr.map((x) => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/** Hash the tensor to a deterministic pseudo-prediction (stub fallback). */
function stubPredict(float32) {
  let h = 0;
  // sample every ~1k elements to keep it cheap
  for (let i = 0; i < float32.length; i += 1024) {
    h = (h * 31 + Math.round(float32[i] * 1000)) | 0;
  }
  const idx = Math.abs(h) % DEMO_LABELS.length;
  const conf = 0.62 + (Math.abs(h >> 7) % 35) / 100;
  return { label: DEMO_LABELS[idx], confidence: Number(conf.toFixed(3)) };
}

/**
 * @param {{ data: Float32Array, dims: number[] }} tensor
 * @returns {Promise<{ label: string, confidence: number }>}
 */
export async function predict(tensor) {
  const session = await getSession();
  if (!session) {
    return stubPredict(tensor.data);
  }
  const inputName = session.inputNames[0];
  const ortTensor = new ort.Tensor("float32", tensor.data, tensor.dims);
  const out = await session.run({ [inputName]: ortTensor });
  const logits = out[session.outputNames[0]].data;
  const probs = softmax(Array.from(logits));
  let best = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
  return {
    label: `class_${best}`,
    confidence: Number(probs[best].toFixed(3)),
  };
}