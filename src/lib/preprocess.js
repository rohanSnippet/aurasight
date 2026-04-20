/**
 * Explicit tensor preprocessing for ResNet/ViT-style models.
 *
 * Architectural directive (#1): we do NOT pass raw camera pixel arrays to
 * the model. Camera frames are arbitrary aspect / arbitrary size and the
 * channel layout from a <video> element is RGBA uint8 in HWC order.
 * The model wants 1×3×224×224 Float32 in NCHW with ImageNet normalization.
 *
 * This module performs, in order:
 *   1. Center-crop the longest side to a square (preserve aspect)
 *   2. Resize to 224×224 via offscreen canvas (browser-accelerated bilinear)
 *   3. Drop the alpha channel, split RGB into planar layout
 *   4. Scale uint8 [0,255] → float [0,1]
 *   5. ImageNet normalize: (x - mean) / std per channel
 *
 * Output: { data: Float32Array(1*3*224*224), dims: [1,3,224,224] }
 * ready to feed onnxruntime-web (`new ort.Tensor('float32', data, dims)`).
 */

export const INPUT_SIZE = 224;

// ImageNet stats — standard for torchvision ResNet & most ViT exports.
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let _scratch = null;
function getScratchCanvas() {
  if (_scratch) return _scratch;
  _scratch = document.createElement("canvas");
  _scratch.width = INPUT_SIZE;
  _scratch.height = INPUT_SIZE;
  return _scratch;
}

/**
 * @param {HTMLVideoElement | HTMLCanvasElement | HTMLImageElement} source
 * @returns {{ data: Float32Array, dims: [1,3,224,224], previewCanvas: HTMLCanvasElement }}
 */
export function preprocessFrame(source) {
  const sw = source.videoWidth ?? source.width;
  const sh = source.videoHeight ?? source.height;
  if (!sw || !sh) throw new Error("preprocessFrame: source has no dimensions yet");

  // 1. center-crop square
  const side = Math.min(sw, sh);
  const sx = (sw - side) / 2;
  const sy = (sh - side) / 2;

  // 2. resize to 224×224
  const canvas = getScratchCanvas();
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, sx, sy, side, side, 0, 0, INPUT_SIZE, INPUT_SIZE);
  const { data: rgba } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);

  // 3-5. planar RGB + normalize, in a single pass
  const planeSize = INPUT_SIZE * INPUT_SIZE;
  const out = new Float32Array(3 * planeSize);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    out[p] = (rgba[i] / 255 - MEAN[0]) / STD[0]; // R plane
    out[p + planeSize] = (rgba[i + 1] / 255 - MEAN[1]) / STD[1]; // G plane
    out[p + 2 * planeSize] = (rgba[i + 2] / 255 - MEAN[2]) / STD[2]; // B plane
  }

  return { data: out, dims: [1, 3, INPUT_SIZE, INPUT_SIZE], previewCanvas: canvas };
}

/** Compress a video frame to a small JPEG base64 string for offline storage. */
export async function frameToCompressedBase64(videoEl, maxEdge = 480, quality = 0.6) {
  const sw = videoEl.videoWidth;
  const sh = videoEl.videoHeight;
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);

  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d").drawImage(videoEl, 0, 0, w, h);
  // dataURL is "data:image/jpeg;base64,...."; we keep the prefix for <img> reuse.
  return { dataUrl: c.toDataURL("image/jpeg", quality), width: w, height: h };
}