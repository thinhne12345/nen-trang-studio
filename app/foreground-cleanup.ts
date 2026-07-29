export type ForegroundCleanupResult = {
  componentCount: number;
  removedPixelCount: number;
};

export type ForegroundEdgeRefinementResult = {
  removedPixelCount: number;
  decontaminatedPixelCount: number;
};

const MAX_GRID_CELLS = 1_000_000;
const MIN_CONNECTED_ALPHA = 8;
const ALPHA_BLACK_POINT = 12;
const LOW_ALPHA_DUST_LIMIT = 56;
const LOW_ALPHA_SUPPORT = 112;
const SUPPORT_RADIUS = 2;

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

/**
 * Tighten and decontaminate the soft portrait edge after the dominant subject
 * has been selected.
 *
 * Very small unsupported mask particles are removed, while low-alpha pixels
 * connected to a stronger local edge (hair, fingers and clothing) survive.
 * Neutral light RGB values in the feathered edge are then un-matted from white
 * to avoid a pale halo when the portrait is placed on a clean white canvas.
 */
export function refinePortraitEdges(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): ForegroundEdgeRefinementResult {
  if (
    width <= 0 ||
    height <= 0 ||
    pixels.length !== width * height * 4
  ) {
    throw new Error("Dữ liệu ảnh chủ thể không hợp lệ.");
  }

  const pixelCount = width * height;
  const alpha = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index++) {
    alpha[index] = pixels[index * 4 + 3];
  }

  let removedPixelCount = 0;
  let decontaminatedPixelCount = 0;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;

    for (let x = 0; x < width; x++) {
      const index = rowOffset + x;
      const originalAlpha = alpha[index];
      if (originalAlpha === 0) continue;
      if (originalAlpha >= 250) continue;

      let removePixel = originalAlpha <= ALPHA_BLACK_POINT;

      if (!removePixel && originalAlpha <= LOW_ALPHA_DUST_LIMIT) {
        const minY = Math.max(0, y - SUPPORT_RADIUS);
        const maxY = Math.min(height - 1, y + SUPPORT_RADIUS);
        const minX = Math.max(0, x - SUPPORT_RADIUS);
        const maxX = Math.min(width - 1, x + SUPPORT_RADIUS);
        let strongestNeighbour = 0;
        let visibleNeighbourCount = 0;

        for (let nextY = minY; nextY <= maxY; nextY++) {
          const nextRowOffset = nextY * width;
          for (let nextX = minX; nextX <= maxX; nextX++) {
            const nextIndex = nextRowOffset + nextX;
            if (nextIndex === index) continue;
            const nextAlpha = alpha[nextIndex];
            if (nextAlpha > 0) visibleNeighbourCount++;
            if (nextAlpha > strongestNeighbour) {
              strongestNeighbour = nextAlpha;
            }
          }
        }

        // Low-opacity pixels require local support from the portrait edge, so
        // detached dust disappears without scanning fully opaque interiors.
        removePixel =
          visibleNeighbourCount <= 1 ||
          strongestNeighbour < LOW_ALPHA_SUPPORT;
      }

      const alphaOffset = index * 4 + 3;
      if (removePixel) {
        pixels[alphaOffset] = 0;
        removedPixelCount++;
        continue;
      }

      const refinedAlpha = Math.min(
        255,
        Math.round(
          ((originalAlpha - ALPHA_BLACK_POINT) * 255) /
            (255 - ALPHA_BLACK_POINT),
        ),
      );
      pixels[alphaOffset] = refinedAlpha;

      const colorOffset = index * 4;
      const red = pixels[colorOffset];
      const green = pixels[colorOffset + 1];
      const blue = pixels[colorOffset + 2];
      const minimum = Math.min(red, green, blue);
      const maximum = Math.max(red, green, blue);

      // Only neutral light pixels can be a white-background halo. This leaves
      // skin tones, saturated clothing and coloured hair edges untouched.
      if (minimum < 170 || maximum - minimum > 20) continue;

      const coverage = Math.max(originalAlpha / 255, 0.22);
      pixels[colorOffset] = Math.max(
        0,
        Math.min(255, Math.round(255 + (red - 255) / coverage)),
      );
      pixels[colorOffset + 1] = Math.max(
        0,
        Math.min(255, Math.round(255 + (green - 255) / coverage)),
      );
      pixels[colorOffset + 2] = Math.max(
        0,
        Math.min(255, Math.round(255 + (blue - 255) / coverage)),
      );
      decontaminatedPixelCount++;
    }
  }

  return { removedPixelCount, decontaminatedPixelCount };
}
