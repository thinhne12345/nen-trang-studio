import { resolve } from "node:path";
import sharp from "sharp";
import { normalizeExteriorWhiteBackground } from "../app/white-background.ts";

const [, , inputArgument, outputArgument, sensitivityArgument = "36"] =
  process.argv;

if (!inputArgument || !outputArgument) {
  console.error(
    "Cách dùng: node scripts/process-image.mjs <ảnh vào> <ảnh PNG ra> [độ nhạy]",
  );
  process.exitCode = 1;
} else {
  const inputPath = resolve(inputArgument);
  const outputPath = resolve(outputArgument);
  const sensitivity = Number(sensitivityArgument);
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = new Uint8ClampedArray(
    data.buffer,
    data.byteOffset,
    data.byteLength,
  );
  const stats = normalizeExteriorWhiteBackground(
    pixels,
    info.width,
    info.height,
    sensitivity,
  );

  await sharp(Buffer.from(pixels), {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .flatten({ background: "#ffffff" })
    .png()
    .toFile(outputPath);

  const { data: outputData, info: outputInfo } = await sharp(outputPath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let borderPixels = 0;
  let pureWhiteBorderPixels = 0;
  const countBorderPixel = (x, y) => {
    const offset = (y * outputInfo.width + x) * outputInfo.channels;
    borderPixels++;
    if (
      outputData[offset] === 255 &&
      outputData[offset + 1] === 255 &&
      outputData[offset + 2] === 255
    ) {
      pureWhiteBorderPixels++;
    }
  };

  for (let x = 0; x < outputInfo.width; x++) {
    countBorderPixel(x, 0);
    if (outputInfo.height > 1) countBorderPixel(x, outputInfo.height - 1);
  }
  for (let y = 1; y < outputInfo.height - 1; y++) {
    countBorderPixel(0, y);
    if (outputInfo.width > 1) countBorderPixel(outputInfo.width - 1, y);
  }

  console.log(
    JSON.stringify(
      {
        input: inputPath,
        output: outputPath,
        width: outputInfo.width,
        height: outputInfo.height,
        channels: outputInfo.channels,
        sensitivity,
        ...stats,
        borderPixels,
        pureWhiteBorderPixels,
        pureWhiteBorderPercent: Number(
          ((pureWhiteBorderPixels / borderPixels) * 100).toFixed(3),
        ),
      },
      null,
      2,
    ),
  );
}
