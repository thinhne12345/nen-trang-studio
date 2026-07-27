import { resolve } from "node:path";
import { pipeline } from "@huggingface/transformers";
import sharp from "sharp";
import { removeDetachedAlphaIslands } from "../app/foreground-cleanup.ts";
import { analyzeExteriorBackground } from "../app/white-background-detection.ts";

const [, , inputArgument, outputArgument] = process.argv;

if (!inputArgument || !outputArgument) {
  console.error(
    "Cách dùng: node scripts/remove-portrait-background.mjs <ảnh vào> <ảnh PNG ra>",
  );
  process.exitCode = 1;
} else {
  const inputPath = resolve(inputArgument);
  const outputPath = resolve(outputArgument);
  const source = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sourcePixels = new Uint8ClampedArray(
    source.data.buffer,
    source.data.byteOffset,
    source.data.byteLength,
  );
  const exterior = analyzeExteriorBackground(
    sourcePixels,
    source.info.width,
    source.info.height,
  );

  if (exterior.isWhiteBackground) {
    await sharp(inputPath)
      .flatten({ background: "#ffffff" })
      .png()
      .toFile(outputPath);
    console.log(
      `Ảnh đã có nền trắng, giữ nguyên ${source.info.width}×${source.info.height}: ${outputPath}`,
    );
  } else {
    let lastPercent = -1;
    const segmenter = await pipeline("background-removal", "Xenova/modnet", {
      dtype: "fp32",
      progress_callback: (progress) => {
        if (
          progress.status === "progress" &&
          progress.file?.toLowerCase().includes(".onnx")
        ) {
          const percent = Math.round(progress.progress ?? 0);
          if (percent !== lastPercent) {
            lastPercent = percent;
            process.stdout.write(`\rĐang tải mô hình: ${percent}%`);
          }
        }
      },
    });

    const foreground = await segmenter(inputPath);
    const foregroundPixels = new Uint8ClampedArray(foreground.data);
    const cleanup = removeDetachedAlphaIslands(
      foregroundPixels,
      foreground.width,
      foreground.height,
    );
    await sharp(foregroundPixels, {
      raw: {
        width: foreground.width,
        height: foreground.height,
        channels: 4,
      },
    })
      .flatten({ background: "#ffffff" })
      .png()
      .toFile(outputPath);

    console.log(
      `\nĐã tạo ảnh nền trắng ${foreground.width}×${foreground.height}; đã xóa ${cleanup.removedPixelCount} pixel nền rời: ${outputPath}`,
    );
    await segmenter.dispose();
  }
}
