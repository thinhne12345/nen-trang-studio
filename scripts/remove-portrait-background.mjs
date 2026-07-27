import { resolve } from "node:path";
import { pipeline } from "@huggingface/transformers";

const [, , inputArgument, outputArgument] = process.argv;

if (!inputArgument || !outputArgument) {
  console.error(
    "Cách dùng: node scripts/remove-portrait-background.mjs <ảnh vào> <ảnh PNG ra>",
  );
  process.exitCode = 1;
} else {
  const inputPath = resolve(inputArgument);
  const outputPath = resolve(outputArgument);
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
  await foreground
    .toSharp()
    .flatten({ background: "#ffffff" })
    .png()
    .toFile(outputPath);

  console.log(
    `\nĐã tạo ảnh nền trắng ${foreground.width}×${foreground.height}: ${outputPath}`,
  );
  await segmenter.dispose();
}
