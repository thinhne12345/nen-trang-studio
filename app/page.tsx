"use client";

import {
  ChangeEvent,
  DragEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { downloadZip } from "client-zip";
import {
  ModelProgress,
  removePortraitBackground,
} from "./portrait-background";
import { analyzeExteriorBackground } from "./white-background-detection";

type Result = {
  src: string;
  name: string;
  width: number;
  height: number;
  format: string;
  preserved: boolean;
  blob: Blob;
};

type QueueItem = {
  id: string;
  file: File;
  status: "queued" | "processing" | "done" | "error";
  result?: Result;
  error?: string;
};

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_PIXEL_COUNT = 30_000_000;
const MAX_BATCH_SIZE = 20;
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const FORMAT_LABELS: Record<string, string> = {
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/webp": "WEBP",
};

const loadSourceCanvas = (file: File) =>
  new Promise<{
    canvas: HTMLCanvasElement;
    data: ImageData;
  }>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      try {
        if (
          !image.naturalWidth ||
          !image.naturalHeight ||
          image.naturalWidth * image.naturalHeight > MAX_PIXEL_COUNT
        ) {
          throw new Error(
            "Ảnh quá lớn để xử lý an toàn. Kích thước tối đa là 30 triệu điểm ảnh.",
          );
        }

        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Trình duyệt không thể đọc ảnh này.");
        context.drawImage(image, 0, 0);
        resolve({
          canvas,
          data: context.getImageData(0, 0, canvas.width, canvas.height),
        });
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Không thể đọc tệp ảnh này."));
    };
    image.src = objectUrl;
  });

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Trình duyệt không thể tạo tệp ảnh."));
      },
      type,
      quality,
    );
  });

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const makeUniqueArchiveName = (
  originalName: string,
  usedNames: Map<string, number>,
  fallbackIndex: number,
) => {
  const safeName =
    originalName
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
      .replace(/^\.+/, "")
      .trim() || `anh-${fallbackIndex + 1}.png`;
  const key = safeName.toLocaleLowerCase("vi");
  const duplicateIndex = usedNames.get(key) ?? 0;
  usedNames.set(key, duplicateIndex + 1);

  if (duplicateIndex === 0) return safeName;

  const extensionIndex = safeName.lastIndexOf(".");
  const hasExtension = extensionIndex > 0;
  const stem = hasExtension ? safeName.slice(0, extensionIndex) : safeName;
  const extension = hasExtension ? safeName.slice(extensionIndex) : "";
  return `${stem}-${duplicateIndex + 1}${extension}`;
};

async function createWhiteBackgroundResult(
  file: File,
  onProgress: (progress: ModelProgress) => void,
): Promise<Result> {
  const source = await loadSourceCanvas(file);
  const exterior = analyzeExteriorBackground(
    source.data.data,
    source.canvas.width,
    source.canvas.height,
  );

  const cutout = document.createElement("canvas");
  cutout.width = source.canvas.width;
  cutout.height = source.canvas.height;

  if (exterior.isWhiteBackground) {
    const context = cutout.getContext("2d");
    if (!context) throw new Error("Trình duyệt không thể giữ nguyên ảnh này.");
    // Ảnh đã nền trắng được giữ nguyên hoàn toàn, tránh tách AI lần hai làm
    // mất tóc, áo hoặc pixel màu sát mép và đáy.
    context.drawImage(source.canvas, 0, 0);
  } else {
    onProgress({ percent: 0, status: "loading" });
    const foreground = await removePortraitBackground(file, onProgress);
    cutout.width = foreground.width;
    cutout.height = foreground.height;
    const context = cutout.getContext("2d");
    if (!context) throw new Error("Trình duyệt không thể tách nền ảnh này.");
    context.putImageData(
      new ImageData(foreground.data, foreground.width, foreground.height),
      0,
      0,
    );
  }

  const output = document.createElement("canvas");
  output.width = cutout.width;
  output.height = cutout.height;
  const outputContext = output.getContext("2d");
  if (!outputContext) throw new Error("Trình duyệt không thể xuất ảnh này.");
  outputContext.fillStyle = "#ffffff";
  outputContext.fillRect(0, 0, output.width, output.height);
  outputContext.drawImage(cutout, 0, 0);

  const blob = await canvasToBlob(
    output,
    file.type,
    file.type === "image/png" ? undefined : 0.96,
  );

  return {
    src: URL.createObjectURL(blob),
    name: file.name,
    width: output.width,
    height: output.height,
    format: FORMAT_LABELS[file.type] ?? "Ảnh",
    preserved: exterior.isWhiteBackground,
    blob,
  };
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const resultUrlsRef = useRef<string[]>([]);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<ModelProgress | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentName, setCurrentName] = useState("");
  const [notice, setNotice] = useState("");
  const [zipBusy, setZipBusy] = useState(false);

  useEffect(
    () => () => {
      for (const url of resultUrlsRef.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const updateItem = (id: string, patch: Partial<QueueItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const processFiles = async (selectedFiles: File[]) => {
    if (busy || selectedFiles.length === 0) return;

    for (const url of resultUrlsRef.current) URL.revokeObjectURL(url);
    resultUrlsRef.current = [];

    const files = selectedFiles.slice(0, MAX_BATCH_SIZE);
    setNotice(
      selectedFiles.length > MAX_BATCH_SIZE
        ? `Chỉ xử lý ${MAX_BATCH_SIZE} ảnh đầu tiên trong lần này.`
        : "",
    );

    const queue: QueueItem[] = files.map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      file,
      status: "queued",
    }));
    setItems(queue);
    setBusy(true);
    setZipBusy(false);

    for (let index = 0; index < queue.length; index++) {
      const item = queue[index];
      setCurrentIndex(index + 1);
      setCurrentName(item.file.name);
      setProgress({ percent: 100, status: "processing" });
      updateItem(item.id, { status: "processing", error: undefined });
      await nextFrame();

      try {
        if (!ACCEPTED_TYPES.has(item.file.type)) {
          throw new Error("Chỉ hỗ trợ PNG, JPG hoặc WEBP.");
        }
        if (item.file.size > MAX_FILE_SIZE) {
          throw new Error("Ảnh vượt quá giới hạn 20 MB.");
        }

        const result = await createWhiteBackgroundResult(
          item.file,
          setProgress,
        );
        resultUrlsRef.current.push(result.src);
        updateItem(item.id, { status: "done", result });
      } catch (processingError) {
        updateItem(item.id, {
          status: "error",
          error:
            processingError instanceof Error
              ? processingError.message
              : "Không thể xử lý ảnh này.",
        });
      }

      await nextFrame();
    }

    setProgress(null);
    setCurrentName("");
    setBusy(false);
  };

  const downloadAllAsZip = async () => {
    const completed = items.filter(
      (item): item is QueueItem & { result: Result } =>
        item.status === "done" && Boolean(item.result),
    );
    if (zipBusy || completed.length === 0) return;

    setZipBusy(true);
    setNotice(`Đang đóng gói ${completed.length} ảnh vào file ZIP…`);

    try {
      const usedNames = new Map<string, number>();
      const archive = await downloadZip(
        completed.map((item, index) => ({
          name: makeUniqueArchiveName(item.result.name, usedNames, index),
          input: item.result.blob,
          lastModified: new Date(),
        })),
      ).blob();
      const archiveUrl = URL.createObjectURL(archive);
      const link = document.createElement("a");
      link.href = archiveUrl;
      link.download = `nen-trang-studio-${new Date().toISOString().slice(0, 10)}.zip`;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(archiveUrl), 60_000);
      setNotice(
        `Đã đóng gói ${completed.length} ảnh. File ZIP đang được tải xuống.`,
      );
    } catch {
      setNotice(
        "Không thể tạo file ZIP trên thiết bị này. Bạn vẫn có thể tải từng ảnh bên dưới.",
      );
    } finally {
      setZipBusy(false);
    }
  };

  const resetWorkspace = () => {
    if (busy || zipBusy) return;

    for (const url of resultUrlsRef.current) URL.revokeObjectURL(url);
    resultUrlsRef.current = [];
    if (inputRef.current) inputRef.current.value = "";
    setItems([]);
    setProgress(null);
    setCurrentIndex(0);
    setCurrentName("");
    setNotice("");
    setDragging(false);
    setZipBusy(false);
  };

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    void processFiles(Array.from(event.target.files ?? []));
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void processFiles(Array.from(event.dataTransfer.files));
  };

  const openPickerFromKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!busy && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      inputRef.current?.click();
    }
  };

  const finishedCount = items.filter(
    (item) => item.status === "done" || item.status === "error",
  ).length;
  const successfulCount = items.filter((item) => item.status === "done").length;
  const currentFraction =
    busy && progress?.status === "loading"
      ? progress.percent / 200
      : busy
        ? 0.72
        : 0;
  const overallPercent =
    items.length > 0
      ? Math.min(
          100,
          ((finishedCount + currentFraction) / items.length) * 100,
        )
      : 0;

  const busyText =
    progress?.status === "loading"
      ? `Đang tải mô hình AI… ${progress.percent}%`
      : `Đang xử lý ảnh ${currentIndex}/${items.length}`;

  return (
    <main className="shell">
      <nav>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ◒
          </span>
          Nền Trắng
        </div>
        <span className="privacy">● Ảnh chỉ được xử lý trên thiết bị</span>
      </nav>

      <section className="hero">
        <div className="eyebrow">TÁCH CHỦ THỂ • GHÉP NỀN TRẮNG</div>
        <h1>
          Xóa nền cũ.
          <br />
          <em>Thay bằng nền trắng.</em>
        </h1>
        <p className="sub">
          Tải nhiều ảnh cùng lúc. AI giữ lại người và loại bỏ toàn bộ nền phía
          sau, dù nền sáng, tối hay có nhiều chi tiết.
        </p>
      </section>

      <section className="workspace">
        <div
          className={`drop-card${dragging ? " is-dragging" : ""}${busy ? " is-busy" : ""}`}
          role="button"
          tabIndex={busy ? -1 : 0}
          aria-disabled={busy}
          aria-label="Chọn nhiều ảnh cần tách người và thay nền trắng"
          onClick={() => {
            if (!busy) inputRef.current?.click();
          }}
          onKeyDown={openPickerFromKeyboard}
          onDragEnter={() => {
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
        >
          <input
            ref={inputRef}
            hidden
            multiple
            disabled={busy}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onClick={(event) => {
              event.currentTarget.value = "";
            }}
            onChange={onFile}
          />
          <div className="upload-icon" aria-hidden="true">
            ↑
          </div>
          <h2>{busy ? busyText : "Kéo thả nhiều ảnh vào đây"}</h2>
          {busy ? (
            <>
              <p className="current-file" title={currentName}>
                {currentName}
              </p>
              <div className="model-progress" aria-label="Tiến trình xử lý">
                <span style={{ width: `${overallPercent}%` }} />
              </div>
            </>
          ) : (
            <p>
              hoặc <span className="choose-file">chọn nhiều tệp từ máy</span>
            </p>
          )}
          <small>
            {busy
              ? "Kết quả hiện ngay khi từng ảnh hoàn tất"
              : `PNG, JPG hoặc WEBP · tối đa ${MAX_BATCH_SIZE} ảnh/lần`}
          </small>
        </div>

        <div className="tips">
          <div>
            <b>01</b>
            <span>Chọn tối đa 20 ảnh chân dung trong một lần.</span>
          </div>
          <div>
            <b>02</b>
            <span>Ảnh được xử lý tuần tự để máy chạy ổn định và ít tốn RAM.</span>
          </div>
          <div>
            <b>03</b>
            <span>Giữ nguyên tên, định dạng và ảnh nền trắng đã có sẵn.</span>
          </div>
        </div>
      </section>

      <p className="model-note">
        Lần đầu có thể lâu hơn vài giây để tải mô hình AI. Ảnh đã nền trắng được
        bỏ qua AI để giữ nguyên màu ở viền và đáy.
      </p>

      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      {items.length > 0 && (
        <section className="result" aria-live="polite">
          <div className="result-head">
            <div>
              <div className="eyebrow">KẾT QUẢ XỬ LÝ HÀNG LOẠT</div>
              <h2>
                {busy
                  ? `Đã xong ${finishedCount}/${items.length} ảnh`
                  : `${successfulCount}/${items.length} ảnh hoàn tất`}
              </h2>
            </div>
            <div className="result-head-actions">
              <span className="batch-status">
                {busy ? "Đang xử lý tuần tự…" : "Sẵn sàng tải xuống"}
              </span>
              {!busy && (
                <div className="result-action-buttons">
                  {successfulCount > 0 && (
                    <button
                      className="download download-all"
                      type="button"
                      disabled={zipBusy}
                      onClick={() => void downloadAllAsZip()}
                    >
                      {zipBusy
                        ? "Đang tạo ZIP…"
                        : `Tải tất cả ${successfulCount} ảnh (.zip)`}
                    </button>
                  )}
                  <button
                    className="reset-button"
                    type="button"
                    disabled={zipBusy}
                    onClick={resetWorkspace}
                  >
                    ↻ Làm lại
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="overall-progress" aria-hidden="true">
            <span style={{ width: `${overallPercent}%` }} />
          </div>

          <div className="result-grid">
            {items.map((item) => (
              <article
                className={`result-card is-${item.status}`}
                key={item.id}
              >
                <div className="result-card-preview">
                  {item.result ? (
                    <>
                      {/* Ảnh là object URL tạo tại chỗ. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.result.src}
                        alt={`${item.file.name} đã ghép nền trắng`}
                      />
                    </>
                  ) : (
                    <div className="item-state">
                      {item.status === "processing" && (
                        <span className="spinner" aria-hidden="true" />
                      )}
                      {item.status === "queued" && "Đang chờ"}
                      {item.status === "processing" && "Đang xử lý"}
                      {item.status === "error" && "Không thể xử lý"}
                    </div>
                  )}
                </div>

                <div className="result-card-info">
                  <h3 title={item.file.name}>{item.file.name}</h3>
                  {item.result && (
                    <>
                      <p>
                        {item.result.width} × {item.result.height} px ·{" "}
                        {item.result.format}
                      </p>
                      {item.result.preserved && (
                        <small>Đã giữ nguyên ảnh nền trắng sẵn có</small>
                      )}
                      <a
                        className="download"
                        href={item.result.src}
                        download={item.result.name}
                      >
                        Tải xuống
                      </a>
                    </>
                  )}
                  {item.error && <p className="item-error">{item.error}</p>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <footer>
        Nền Trắng <span>•</span> Xử lý hàng loạt trên thiết bị · không watermark
      </footer>
    </main>
  );
}
