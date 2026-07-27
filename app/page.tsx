"use client";

import { ChangeEvent, useRef, useState } from "react";

type Result = { src: string; name: string } | null;

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<Result>(null);
  const [threshold, setThreshold] = useState(34);
  const [busy, setBusy] = useState(false);

  const process = (file: File) => {
    setBusy(true);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const p = data.data, w = canvas.width, h = canvas.height;
      const seen = new Uint8Array(w * h), queue: number[] = [];
      for (let x = 0; x < w; x++) { queue.push(x, (h - 1) * w + x); }
      for (let y = 1; y < h - 1; y++) { queue.push(y * w, y * w + w - 1); }
      // Chỉ dò vùng sáng nối với bốn mép ảnh. Nhờ vậy các chi tiết trắng
      // nằm bên trong logo, áo và chủ thể không bị xóa.
      const backgroundScore = (i: number) => {
        const r = p[i * 4], g = p[i * 4 + 1], b = p[i * 4 + 2];
        const distanceToWhite = Math.sqrt((255-r)**2 + (255-g)**2 + (255-b)**2);
        const chroma = Math.max(r,g,b) - Math.min(r,g,b);
        return distanceToWhite + chroma * 0.72;
      };
      const floodLimit = threshold * 1.75 + 20;
      while (queue.length) {
        const i = queue.pop()!; if (seen[i] || backgroundScore(i) > floodLimit) continue;
        seen[i] = 1;
        const x = i % w, y = Math.floor(i / w);
        if (x) queue.push(i - 1); if (x < w - 1) queue.push(i + 1);
        if (y) queue.push(i - w); if (y < h - 1) queue.push(i + w);
      }
      // Làm mềm viền 1–2 px và khử quầng trắng quanh tóc/logo.
      const transparentAt = Math.max(8, threshold * .72);
      for (let i = 0; i < w * h; i++) {
        if (!seen[i]) continue;
        const score = backgroundScore(i);
        const alpha = Math.max(0, Math.min(1, (score - transparentAt) / 24));
        p[i * 4 + 3] = Math.round(alpha * 255);
        if (alpha > .04 && alpha < .98) {
          for (let channel = 0; channel < 3; channel++) {
            const cleaned = (p[i * 4 + channel] - (1-alpha) * 255) / alpha;
            p[i * 4 + channel] = Math.max(0, Math.min(255, Math.round(cleaned)));
          }
        }
      }
      ctx.putImageData(data, 0, 0);
      setResult({ src: canvas.toDataURL("image/png"), name: file.name.replace(/\.[^.]+$/, "") + "-transparent.png" });
      setBusy(false);
    };
    img.src = URL.createObjectURL(file);
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) process(f); };

  return (
    <main className="shell">
      <nav><div className="brand"><span className="brand-mark">◒</span> Nền Sạch</div><span className="privacy">● Ảnh được xử lý ngay trên thiết bị</span></nav>
      <section className="hero"><div className="eyebrow">XÓA NỀN TRẮNG • GIỮ NGUYÊN CHI TIẾT</div>
        <h1>Đổi nền trắng.<br /><em>Giữ trọn chủ thể.</em></h1>
        <p className="sub">Tách logo và ảnh người khỏi nền trắng trong vài giây — không làm mờ viền, không gửi ảnh lên đâu cả.</p>
      </section>
      <section className="workspace">
        <div className="drop-card" onClick={() => inputRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f=e.dataTransfer.files[0]; if(f) process(f); }}>
          <input ref={inputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} />
          <div className="upload-icon">↑</div><h2>{busy ? "Đang xử lý ảnh…" : "Kéo thả ảnh vào đây"}</h2><p>hoặc <button>chọn tệp từ máy</button></p><small>PNG, JPG hoặc WEBP · tối đa 20 MB</small>
        </div>
        <div className="tips"><div><b>01</b><span>Đưa ảnh logo, sản phẩm hoặc chân dung có nền trắng.</span></div><div><b>02</b><span>Nền trắng liền mạch sẽ tự động được làm trong suốt.</span></div><div><b>03</b><span>Tải PNG xuống để giữ nền trong suốt khi sử dụng.</span></div></div>
      </section>
      {result && <section className="result"><div className="result-head"><div><div className="eyebrow">ĐÃ XỬ LÝ XONG</div><h2>Xem trước kết quả</h2></div><a className="download" href={result.src} download={result.name}>Tải PNG xuống ↓</a></div><div className="preview"><img src={result.src} alt="Ảnh đã xóa nền" /></div><label>Độ nhạy nền trắng <input type="range" min="10" max="70" value={threshold} onChange={e => setThreshold(+e.target.value)} onMouseUp={() => { if (inputRef.current?.files?.[0]) process(inputRef.current.files[0]); }} /></label></section>}
      <footer>Nền Sạch <span>•</span> Miễn phí · riêng tư · không watermark</footer>
    </main>
  );
}
