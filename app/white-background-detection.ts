export type ExteriorAnalysis = {
  isWhiteBackground: boolean;
  cornerWhiteRatio: number;
  perimeterWhiteRatio: number;
};

const perceivedRgb = (data: Uint8ClampedArray, offset: number) => {
  const alpha = data[offset + 3] / 255;
  return [
    data[offset] * alpha + 255 * (1 - alpha),
    data[offset + 1] * alpha + 255 * (1 - alpha),
    data[offset + 2] * alpha + 255 * (1 - alpha),
  ];
};

const isWhiteLike = (data: Uint8ClampedArray, offset: number) => {
  const [r, g, b] = perceivedRgb(data, offset);
  return (
    Math.min(r, g, b) >= 244 &&
    Math.max(r, g, b) - Math.min(r, g, b) <= 14
  );
};

export function analyzeExteriorBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): ExteriorAnalysis {
  if (
    width <= 0 ||
    height <= 0 ||
    data.length !== width * height * 4
  ) {
    throw new RangeError("Dữ liệu ảnh không hợp lệ.");
  }

  const thickness = Math.max(2, Math.floor(Math.min(width, height) * 0.03));
  const cornerSize = Math.max(2, Math.floor(Math.min(width, height) * 0.08));
  let perimeterCount = 0;
  let perimeterWhite = 0;
  let cornerCount = 0;
  let cornerWhite = 0;

  const inspect = (x: number, y: number, isCorner: boolean) => {
    const offset = (y * width + x) * 4;
    const white = isWhiteLike(data, offset);
    perimeterCount++;
    if (white) perimeterWhite++;
    if (isCorner) {
      cornerCount++;
      if (white) cornerWhite++;
    }
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const onPerimeter =
        x < thickness ||
        x >= width - thickness ||
        y < thickness ||
        y >= height - thickness;
      if (!onPerimeter) continue;

      const inCorner =
        (x < cornerSize || x >= width - cornerSize) &&
        (y < cornerSize || y >= height - cornerSize);
      inspect(x, y, inCorner);
    }
  }

  const perimeterWhiteRatio = perimeterWhite / perimeterCount;
  const cornerWhiteRatio = cornerWhite / cornerCount;

  return {
    isWhiteBackground:
      cornerWhiteRatio >= 0.96 && perimeterWhiteRatio >= 0.78,
    cornerWhiteRatio,
    perimeterWhiteRatio,
  };
}
