export type NormalizationStats = {
  backgroundPixels: number;
  changedPixels: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * Làm trắng vùng nền sáng nối liền với mép ảnh.
 *
 * Hàm cố ý không dò các vùng sáng bị bao kín bên trong ảnh, nhờ đó những chi
 * tiết trắng trên áo, logo và khuôn mặt không bị thay đổi. Dữ liệu điểm ảnh
 * được sửa trực tiếp để tránh tạo thêm một bản sao lớn cho ảnh độ phân giải cao.
 */
export function normalizeExteriorWhiteBackground(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  sensitivity = 36,
): NormalizationStats {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    pixels.length !== width * height * 4
  ) {
    throw new RangeError("Dữ liệu ảnh không hợp lệ.");
  }

  const safeSensitivity = clamp(sensitivity, 10, 70);
  const floodLimit = safeSensitivity * 1.75 + 20;
  const solidWhiteLimit = safeSensitivity * 0.9;
  const pixelCount = width * height;
  const queued = new Uint8Array(pixelCount);
  const background = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;

  const enqueue = (index: number) => {
    if (queued[index]) return;
    queued[index] = 1;
    queue[tail++] = index;
  };

  for (let x = 0; x < width; x++) {
    enqueue(x);
    if (height > 1) enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    enqueue(y * width);
    if (width > 1) enqueue(y * width + width - 1);
  }

  const scoreAt = (index: number) => {
    const offset = index * 4;
    const alpha = pixels[offset + 3] / 255;
    const r = pixels[offset] * alpha + 255 * (1 - alpha);
    const g = pixels[offset + 1] * alpha + 255 * (1 - alpha);
    const b = pixels[offset + 2] * alpha + 255 * (1 - alpha);
    const distanceToWhite = Math.hypot(255 - r, 255 - g, 255 - b);
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    return distanceToWhite + chroma * 0.72;
  };

  while (head < tail) {
    const index = queue[head++];
    if (scoreAt(index) > floodLimit) continue;

    background[index] = 1;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }

  let backgroundPixels = 0;
  let changedPixels = 0;

  for (let index = 0; index < pixelCount; index++) {
    if (!background[index]) continue;
    backgroundPixels++;

    // Pixel trong suốt và bán trong suốt sẽ được đặt lên lớp trắng ở bước xuất
    // ảnh. Không sửa RGB của chúng để giữ nguyên viền tóc/áo đã khử nền sẵn.
    const offset = index * 4;
    if (pixels[offset + 3] < 250) continue;

    const score = scoreAt(index);
    const range = Math.max(1, floodLimit - solidWhiteLimit);
    const position = clamp((score - solidWhiteLimit) / range, 0, 1);
    const smoothStep = position * position * (3 - 2 * position);
    const whitening = 1 - smoothStep;
    let changed = false;

    for (let channel = 0; channel < 3; channel++) {
      const current = pixels[offset + channel];
      const next = Math.round(current + (255 - current) * whitening);
      if (next !== current) changed = true;
      pixels[offset + channel] = next;
    }

    if (changed) changedPixels++;
  }

  return { backgroundPixels, changedPixels };
}
