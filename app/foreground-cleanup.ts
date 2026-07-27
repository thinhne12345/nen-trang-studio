export type ForegroundCleanupResult = {
  componentCount: number;
  removedPixelCount: number;
};

const MAX_GRID_CELLS = 1_000_000;
const MIN_CONNECTED_ALPHA = 8;

/**
 * Remove detached alpha islands produced by the portrait model.
 *
 * The mask is analysed on a bounded grid so even very large photos do not need
 * a second full-resolution label buffer. Only the dominant connected subject is
 * retained; one grid cell of padding preserves low-alpha hair and clothing
 * edges around it.
 */
export function removeDetachedAlphaIslands(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): ForegroundCleanupResult {
  if (
    width <= 0 ||
    height <= 0 ||
    pixels.length !== width * height * 4
  ) {
    throw new Error("Dữ liệu ảnh chủ thể không hợp lệ.");
  }

  const blockSize = Math.max(
    1,
    Math.ceil(Math.sqrt((width * height) / MAX_GRID_CELLS)),
  );
  const gridWidth = Math.ceil(width / blockSize);
  const gridHeight = Math.ceil(height / blockSize);
  const gridSize = gridWidth * gridHeight;
  const gridAlpha = new Uint8Array(gridSize);

  for (let y = 0; y < height; y++) {
    const gridY = Math.floor(y / blockSize) * gridWidth;
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const alpha = pixels[(rowOffset + x) * 4 + 3];
      const gridIndex = gridY + Math.floor(x / blockSize);
      if (alpha > gridAlpha[gridIndex]) gridAlpha[gridIndex] = alpha;
    }
  }

  const labels = new Uint32Array(gridSize);
  const queue = new Int32Array(gridSize);
  let componentCount = 0;
  let dominantLabel = 0;
  let dominantScore = 0;

  for (let start = 0; start < gridSize; start++) {
    if (
      gridAlpha[start] < MIN_CONNECTED_ALPHA ||
      labels[start] !== 0
    ) {
      continue;
    }

    componentCount++;
    const label = componentCount;
    let head = 0;
    let tail = 0;
    let score = 0;
    queue[tail++] = start;
    labels[start] = label;

    while (head < tail) {
      const index = queue[head++];
      const y = Math.floor(index / gridWidth);
      const x = index - y * gridWidth;
      score += gridAlpha[index];

      const minY = Math.max(0, y - 1);
      const maxY = Math.min(gridHeight - 1, y + 1);
      const minX = Math.max(0, x - 1);
      const maxX = Math.min(gridWidth - 1, x + 1);

      for (let nextY = minY; nextY <= maxY; nextY++) {
        const rowOffset = nextY * gridWidth;
        for (let nextX = minX; nextX <= maxX; nextX++) {
          const next = rowOffset + nextX;
          if (
            labels[next] === 0 &&
            gridAlpha[next] >= MIN_CONNECTED_ALPHA
          ) {
            labels[next] = label;
            queue[tail++] = next;
          }
        }
      }
    }

    if (score > dominantScore) {
      dominantScore = score;
      dominantLabel = label;
    }
  }

  if (componentCount <= 1 || dominantLabel === 0) {
    return { componentCount, removedPixelCount: 0 };
  }

  // Keep one cell around the subject to protect soft hair and clothing edges.
  const keep = new Uint8Array(gridSize);
  for (let index = 0; index < gridSize; index++) {
    if (labels[index] !== dominantLabel) continue;
    const y = Math.floor(index / gridWidth);
    const x = index - y * gridWidth;
    const minY = Math.max(0, y - 1);
    const maxY = Math.min(gridHeight - 1, y + 1);
    const minX = Math.max(0, x - 1);
    const maxX = Math.min(gridWidth - 1, x + 1);

    for (let nextY = minY; nextY <= maxY; nextY++) {
      const rowOffset = nextY * gridWidth;
      for (let nextX = minX; nextX <= maxX; nextX++) {
        keep[rowOffset + nextX] = 1;
      }
    }
  }

  let removedPixelCount = 0;
  for (let y = 0; y < height; y++) {
    const gridY = Math.floor(y / blockSize) * gridWidth;
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      if (keep[gridY + Math.floor(x / blockSize)] !== 0) continue;
      const alphaIndex = (rowOffset + x) * 4 + 3;
      if (pixels[alphaIndex] !== 0) {
        pixels[alphaIndex] = 0;
        removedPixelCount++;
      }
    }
  }

  return { componentCount, removedPixelCount };
}
