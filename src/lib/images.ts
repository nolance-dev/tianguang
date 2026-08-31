/**
 * 自訂桌布與照片牆的圖檔。
 *
 * 圖走 IndexedDB，不走 chrome.storage —— sync 每項 8KB，local 也只有 10MB
 * 且沒有串流讀寫。代價是圖不跨裝置同步，這件事設定頁會直接寫明。
 *
 * 匯入時一律縮到 2048px 並轉 WebP：一張手機原圖動輒十幾 MB，原樣存進去
 * 幾張就把配額吃光。順手算平均亮度存起來，前景要用亮字還是暗字才不必
 * 每次開新分頁都重讀一次像素。
 */

const DB_NAME = "tianguang";
const STORE = "images";
const MAX_EDGE = 2048;

export interface StoredImage {
  id: string;
  blob: Blob;
  /** 0–1，決定壓在上面的文字要用亮字還是暗字 */
  luminance: number;
  width: number;
  height: number;
  addedAt: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = run(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

/** 縮到最長邊 2048，轉 WebP，順便量平均亮度。 */
async function process(file: File): Promise<Omit<StoredImage, "id" | "addedAt">> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.86 });

  // 縮到 32×32 再取樣就夠了。整張讀像素在 4K 圖上會卡一下，而我們只要一個平均值。
  const tiny = new OffscreenCanvas(32, 32);
  const tctx = tiny.getContext("2d")!;
  tctx.drawImage(bitmap, 0, 0, 32, 32);
  const { data } = tctx.getImageData(0, 0, 32, 32);
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    // 感知亮度的近似式，比單純平均 RGB 準
    sum += (0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!) / 255;
  }
  bitmap.close();

  return { blob, luminance: sum / (data.length / 4), width, height };
}

export async function addImage(file: File): Promise<StoredImage> {
  const processed = await process(file);
  const record: StoredImage = {
    id: crypto.randomUUID(),
    addedAt: Date.now(),
    ...processed,
  };
  await tx("readwrite", (s) => s.put(record) as IDBRequest<IDBValidKey>);
  return record;
}

export async function getImage(id: string): Promise<StoredImage | undefined> {
  return tx<StoredImage | undefined>("readonly", (s) => s.get(id));
}

export async function listImages(): Promise<StoredImage[]> {
  const all = await tx<StoredImage[]>("readonly", (s) => s.getAll());
  return all.sort((a, b) => b.addedAt - a.addedAt);
}

export async function deleteImage(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id) as unknown as IDBRequest<undefined>);
}

/**
 * blob 轉成可以塞進 CSS 的網址。
 * 呼叫端換圖或卸載時要記得 revoke，否則 blob 會一直留在記憶體裡。
 */
export function toUrl(image: StoredImage): string {
  return URL.createObjectURL(image.blob);
}
