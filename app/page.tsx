"use client";

import {
  ChangeEvent,
  DragEvent,
  KeyboardEvent,
  useRef,
  useState,
} from "react";
import {
  ModelProgress,
  removePortraitBackground,
} from "./portrait-background";

type Result = {
  src: string;
  name: string;
  width: number;
  height: number;
};

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const jobRef = useRef(0);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<ModelProgress | null>(null);

  const processFile = async (file: File) => {
    setError("");

    if (!ACCEPTED_TYPES.has(file.type)) {
      setError("Vui lòng chọn ảnh PNG, JPG hoặc WEBP.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("Ảnh vượt quá 20 MB. Hãy chọn ảnh nhỏ hơn.");
      return;
    }

    const job = ++jobRef.current;
    setBusy(true);
    setResult(null);
    setProgress({ percent: 0, status: "loading" });

    try {
      const foreground = await removePortraitBackground(file, (nextProgress) => {
        if (job === jobRef.current) setProgress(nextProgress);
      });
      if (job !== jobRef.current) return;

      const cutout = document.createElement("canvas");
      cutout.width = foreground.width;
      cutout.height = foreground.height;
      const cutoutContext = cutout.getContext("2d");
      if (!cutoutContext) throw new Error("Trình duyệt không thể xử lý ảnh này.");
      cutoutContext.putImageData(
        new ImageData(foreground.data, foreground.width, foreground.height),
        0,
        0,
      );

      const output = document.createElement("canvas");
      output.width = foreground.width;
      output.height = foreground.height;
      const outputContext = output.getContext("2d");
      if (!outputContext) throw new Error("Trình duyệt không thể xuất ảnh này.");
      outputContext.fillStyle = "#ffffff";
      outputContext.fillRect(0, 0, foreground.width, foreground.height);
      outputContext.drawImage(cutout, 0, 0);

      setResult({
        src: output.toDataURL("image/png"),
        name: file.name.replace(/\.[^.]+$/, "") + "-nen-trang.png",
        width: foreground.width,
        height: foreground.height,
      });
      setProgress(null);
    } catch (processingError) {
      if (job === jobRef.current) {
        setProgress(null);
        setError(
          processingError instanceof Error
            ? `Không thể tách nền: ${processingError.message}`
            : "Không thể tách nền ảnh. Vui lòng thử lại.",
        );
      }
    } finally {
      if (job === jobRef.current) setBusy(false);
    }
  };

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void processFile(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void processFile(file);
  };

  const openPickerFromKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  };

  const busyText =
    progress?.status === "processing"
      ? "Đang tách người khỏi nền…"
      : progress?.status === "loading"
        ? `Đang tải mô hình AI… ${progress.percent}%`
        : "Đang xử lý ảnh…";

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
          AI tự động giữ lại người và loại bỏ toàn bộ nền phía sau, dù nền sáng,
          tối hay có nhiều chi tiết. Ảnh xuất luôn có nền trắng liền mạch.
        </p>
      </section>

      <section className="workspace">
        <div
          className={`drop-card${dragging ? " is-dragging" : ""}`}
          role="button"
          tabIndex={0}
          aria-label="Chọn ảnh cần tách người và thay nền trắng"
          onClick={() => inputRef.current?.click()}
          onKeyDown={openPickerFromKeyboard}
          onDragEnter={() => setDragging(true)}
          onDragLeave={() => setDragging(false)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
        >
          <input
            ref={inputRef}
            hidden
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
          <h2>{busy ? busyText : "Kéo thả ảnh vào đây"}</h2>
          {busy && progress?.status === "loading" ? (
            <div className="model-progress" aria-label="Tiến trình tải mô hình">
              <span style={{ width: `${progress.percent}%` }} />
            </div>
          ) : (
            <p>
              hoặc <span className="choose-file">chọn tệp từ máy</span>
            </p>
          )}
          <small>
            {busy
              ? "Giữ trang mở trong lúc xử lý"
              : "PNG, JPG hoặc WEBP · tối đa 20 MB"}
          </small>
        </div>

        <div className="tips">
          <div>
            <b>01</b>
            <span>Chọn ảnh chân dung có bất kỳ nền sáng, tối hoặc phức tạp.</span>
          </div>
          <div>
            <b>02</b>
            <span>AI tách người, tóc, áo và cánh tay khỏi toàn bộ cảnh phía sau.</span>
          </div>
          <div>
            <b>03</b>
            <span>Ảnh PNG được ghép nền trắng và giữ nguyên độ phân giải.</span>
          </div>
        </div>
      </section>

      <p className="model-note">
        Lần xử lý đầu tiên có thể lâu hơn vài giây để tải mô hình AI. Những lần
        sau mô hình được dùng lại ngay trên thiết bị.
      </p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {result && (
        <section className="result" aria-live="polite">
          <div className="result-head">
            <div>
              <div className="eyebrow">ĐÃ TÁCH NỀN VÀ GHÉP TRẮNG</div>
              <h2>Xem trước kết quả</h2>
              <p className="result-meta">
                {result.width} × {result.height} px · PNG nền trắng
              </p>
            </div>
            <a className="download" href={result.src} download={result.name}>
              Tải ảnh nền trắng ↓
            </a>
          </div>

          <div className="preview-frame">
            <div className="preview">
              {/* Ảnh là data URL tạo tại chỗ nên không thể đi qua bộ tối ưu ảnh. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.src} alt="Chủ thể đã được tách và ghép nền trắng" />
            </div>
          </div>
        </section>
      )}

      <footer>
        Nền Trắng <span>•</span> Tách nền trên thiết bị · không watermark
      </footer>
    </main>
  );
}
