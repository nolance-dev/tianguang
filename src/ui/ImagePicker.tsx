import { useEffect, useState } from "preact/hooks";
import { t } from "../lib/i18n";
import {
  addImage,
  deleteImage,
  listImages,
  toUrl,
  type StoredImage,
} from "../lib/images";

/**
 * 圖庫。
 *
 * 設定抽屜裡是一排小縮圖，第二屏的照片牆是同一個元件放大 —— 兩邊共用一份
 * 讀取、撤銷 blob 網址、上傳、刪除的邏輯。抄成兩份的話，遲早只有一邊會記得
 * revokeObjectURL，另一邊就開始漏記憶體。
 */

interface Props {
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** 照片牆版本：格子大、鋪滿整張卡 */
  wall?: boolean;
}

export function ImagePicker({ selected, onSelect, wall }: Props) {
  const [images, setImages] = useState<StoredImage[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const list = await listImages();
    setImages(list);
    setUrls((old) => {
      // 舊的縮圖網址要收掉，不然每次重整都漏一批 blob
      for (const url of Object.values(old)) URL.revokeObjectURL(url);
      return Object.fromEntries(list.map((img) => [img.id, toUrl(img)]));
    });
  }

  useEffect(() => {
    void refresh();
    return () => {
      for (const url of Object.values(urls)) URL.revokeObjectURL(url);
    };
  }, []);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      let last = "";
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        last = (await addImage(file)).id;
      }
      await refresh();
      if (last) onSelect(last);
    } catch {
      // 配額滿、檔案壞掉、或格式解不開都會走到這裡。講清楚發生什麼事就好。
      setError(t("s_bg_upload_failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class={wall ? "picker wall" : "picker"}>
      <label class="drop">
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => void onFiles(e.currentTarget.files)}
        />
        <span>{busy ? t("s_bg_working") : t("s_bg_pick")}</span>
      </label>

      {error && <p class="note err">{error}</p>}

      {images.length > 0 && (
        <div class="thumbs">
          {images.map((img) => (
            <div
              key={img.id}
              class={`thumb${img.id === selected ? " on" : ""}`}
            >
              <button
                type="button"
                style={{ backgroundImage: `url("${urls[img.id]}")` }}
                aria-pressed={img.id === selected}
                aria-label={t("s_bg_use")}
                onClick={() => onSelect(img.id)}
              />
              <button
                type="button"
                class="rm"
                aria-label={t("s_bg_remove")}
                onClick={async () => {
                  await deleteImage(img.id);
                  if (img.id === selected) onSelect(null);
                  await refresh();
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <p class="note">{t("s_bg_local_only")}</p>
    </div>
  );
}
