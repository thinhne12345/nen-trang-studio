import {
  refinePortraitEdges,
  removeDetachedAlphaIslands,
} from "./foreground-cleanup";

export type ModelProgress = {
  percent: number;
  status: "loading" | "ready" | "processing";
};

export type ForegroundImage = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

type Segmenter = (
  image: Blob,
) => Promise<{
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  channels: number;
}>;

type ProgressEvent = {
  status?: string;
  progress?: number;
  file?: string;
};

let segmenterPromise: Promise<Segmenter> | null = null;

const getSegmenter = (
  onProgress?: (progress: ModelProgress) => void,
): Promise<Segmenter> => {
  if (!segmenterPromise) {
    segmenterPromise = import("@huggingface/transformers").then(
      async ({ pipeline }) => {
        const segmenter = await pipeline(
          "background-removal",
          "Xenova/modnet",
          {
            dtype: "fp32",
            progress_callback: (event: ProgressEvent) => {
              if (
                event.status === "progress" &&
                event.file?.toLowerCase().includes(".onnx")
              ) {
                onProgress?.({
                  percent: Math.max(
                    0,
                    Math.min(100, Math.round(event.progress ?? 0)),
                  ),
                  status: "loading",
                });
              }
            },
          },
        );
        onProgress?.({ percent: 100, status: "ready" });
        return segmenter as unknown as Segmenter;
      },
    );
    segmenterPromise = segmenterPromise.catch((error) => {
      segmenterPromise = null;
      throw error;
    });
  }

  return segmenterPromise;
};

export async function removePortraitBackground(
  file: File,
  onProgress?: (progress: ModelProgress) => void,
): Promise<ForegroundImage> {
  const segmenter = await getSegmenter(onProgress);
  onProgress?.({ percent: 100, status: "processing" });
  const foreground = await segmenter(file);

  if (
    foreground.channels !== 4 ||
    foreground.width <= 0 ||
    foreground.height <= 0
  ) {
    throw new Error("Mô hình không tạo được ảnh chủ thể hợp lệ.");
  }

  const data = new Uint8ClampedArray(foreground.data);
  removeDetachedAlphaIslands(data, foreground.width, foreground.height);
  refinePortraitEdges(data, foreground.width, foreground.height);

  return {
    data,
    width: foreground.width,
    height: foreground.height,
  };
}
