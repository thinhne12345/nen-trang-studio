"use client";

import {
  ChangeEvent,
  DragEvent,
  KeyboardEvent,
  useRef,
  useState,
} from "react";
import { normalizeExteriorWhiteBackground } from "./white-background";

type Result = {
  src: string;
  name: string;
  width: number;
  height: number;
};

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_PIXEL_COUNT = 40_000_000;
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const jobRef = useRef(0);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [sensitivity, setSensitivity] = useState(36);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  const processFile = (file: File, nextSensitivity = sensitivity) => {
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
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    setBusy(true);
    setResult(null);

    image.onload = () => {
      try {
        const width = image.naturalWidth;
        const height = image.naturalHeight;
        if (!width || !height || width * height > MAX_PIXEL_COUNT) {
          throw new Error(
            "Ảnh quá lớn để xử lý an toàn. Kích thước tối đa là 40 triệu điểm ảnh.",
          );
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Trình duyệt không thể xử lý ảnh này.");

        context.drawImage(image, 0, 0);
        const imageData = context.getImageData(0, 0, width, height);
        normalizeExteriorWhiteBackground(
          imageData.data,
          width,
          height,
          nextSensitivity,
        );
        context.putImageData(imageData, 0, 0);

        const output = document.createElement("canvas");
        output.width = width;
        output.height = height;
        const outputContext = output.getContext("2d");
        if (!outputContext) throw new Error("Trình duyệt không thể xuất ảnh này.");

        outputContext.fillStyle = "#ffffff";
        outputContext.fillRect(0, 0, width, height);
        outputContext.drawImage(canvas, 0, 0);

        if (job === jobRef.current) {
          setResult({
            src: output.toDataURL("image/png"),
            name: file.name.replace(/\.[^.]+$/, "") + "-nen-trang.png",
            width,
            height,
          });
        }
      } catch (processingError) {
        if (job === jobRef.current) {
          setError(
            processingError instanceof Error
              ? processingError.message
              : "Không thể xử lý ảnh. Vui lòng thử lại.",
          );
        }
      } finally {
        URL.revokeObjectURL(objectUrl);
        if (job === jobRef.current) setBusy(false);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      if (job === jobRef.current) {
        setBusy(false);
        setError("Không thể đọc tệp ảnh này. Vui lòng chọn ảnh khác.");
      }
    };
    image.src = objectUrl;
  };

  const selectFile = (file: File) => {
    setSourceFile(file);
    processFile(file);
  };

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) selectFile(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) selectFile(file);
  };

  const openPickerFromKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  };

  const reprocess = () => {
    if (sourceFile) processFile(sourceFile, sensitivity);
  };

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
        <div className="eyebrow">NỀN TRẮNG TINH • GIỮ NGUYÊN CHỦ THỂ</div>
        <h1>
          Làm trắng nền.
          <br />
          <em>Giữ trọn chủ thể.</em>
        </h1>
        <p className="sub">
          Chuẩn hóa phần nền sáng xung quanh thành trắng tinh như ảnh mẫu.
          Không xóa nền, không làm trong suốt và không đổi kích thước ảnh.
        </p>
      </section>

      <section className="workspace">
        <div
          className={`drop-card${dragging ? " is-dragging" : ""}`}
          role="button"
          tabIndex={0}
          aria-label="Chọn ảnh cần làm nền trắng"
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
          <h2>{busy ? "Đang làm trắng nền…" : "Kéo thả ảnh vào đây"}</h2>
          <p>
            hoặc <span className="choose-file">chọn tệp từ máy</span>
          </p>
          <small>PNG, JPG hoặc WEBP · tối đa 20 MB</small>
        </div>

        <div className="tips">
          <div>
            <b>01</b>
            <span>Chọn ảnh chân dung, logo hoặc sản phẩm có nền trắng hay gần trắng.</span>
          </div>
          <div>
            <b>02</b>
            <span>Chỉ vùng nền sáng nối với mép ảnh được chuẩn hóa thành trắng tinh.</span>
          </div>
          <div>
            <b>03</b>
            <span>Tải PNG nền trắng liền mạch, giữ nguyên kích thước ảnh gốc.</span>
          </div>
        </div>
      </section>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {result && (
        <section className="result" aria-live="polite">
          <div className="result-head">
            <div>
              <div className="eyebrow">NỀN TRẮNG ĐÃ SẴN SÀNG</div>
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
              <img src={result.src} alt="Ảnh có nền trắng đã hoàn tất" />
            </div>
          </div>

          <div className="sensitivity">
            <label htmlFor="sensitivity">
              <span>
                <b>Mức làm trắng nền</b>
                <small>
                  Tăng nếu nền còn hơi xám, giảm nếu viền chủ thể quá sáng.
                </small>
              </span>
              <output>{sensitivity}</output>
            </label>
            <div className="range-row">
              <input
                id="sensitivity"
                type="range"
                min="10"
                max="70"
                value={sensitivity}
                onChange={(event) => setSensitivity(Number(event.target.value))}
                onPointerUp={reprocess}
                onKeyUp={reprocess}
              />
              <button type="button" onClick={reprocess}>
                Áp dụng lại
              </button>
            </div>
          </div>
        </section>
      )}

      <footer>
        Nền Trắng <span>•</span> Miễn phí · riêng tư · không watermark
      </footer>
    </main>
  );
}
