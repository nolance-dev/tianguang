import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { t } from "../lib/i18n";
import { getImage, toUrl } from "../lib/images";
import { ImagePicker } from "./ImagePicker";

/**
 * 照片牆。
 *
 * 跟背景桌布是兩回事：桌布是整頁的底，這張卡是牆上的一張照片。
 * 兩邊各記各的 id，換了一邊不會動到另一邊 —— 之前把它們接在一起，
 * 換一張照片整個頁面的底色跟著翻掉，那不是「牆」，那是遙控器。
 *
 * 平常整張卡就是那張照片，沒有標題列也沒有邊框。要換照片才進編輯模式，
 * 那時候才長出上傳區和縮圖。一張照片不需要一個標題告訴你它是照片。
 */

interface Props {
  /** 牆上現在掛的那張。null 代表還沒挑過 */
  photoId: string | null;
  onPhoto: (id: string | null) => void;
}

export function PhotoWall({ photoId, onPhoto }: Props) {
  const editing = useSignal(false);
  const url = useSignal<string | null>(null);

  // blob 網址一換就要撤掉舊的，否則每換一張就漏一張在記憶體裡
  useEffect(() => {
    let alive = true;
    const old = url.peek();
    if (old) URL.revokeObjectURL(old);
    url.value = null;
    if (!photoId) return;

    void getImage(photoId).then((img) => {
      if (!alive || !img) return;
      url.value = toUrl(img);
    });
    return () => {
      alive = false;
    };
  }, [photoId]);

  // 卡片收起來或整頁關掉時也要收
  useEffect(() => {
    return () => {
      const last = url.peek();
      if (last) URL.revokeObjectURL(last);
    };
  }, []);

  // 還沒有照片就直接進編輯 —— 空白的牆給一個空白的框沒有意義
  if (editing.value || !url.value) {
    return (
      <>
        <header>
          <b>{t("c_photos")}</b>
          {url.value && (
            <button type="button" onClick={() => (editing.value = false)}>
              {t("c_photos_done")}
            </button>
          )}
        </header>
        <ImagePicker wall selected={photoId} onSelect={onPhoto} />
      </>
    );
  }

  return (
    <div class="photoframe" style={{ backgroundImage: `url("${url.value}")` }}>
      <button
        type="button"
        class="photoedit"
        aria-label={t("c_photos_edit")}
        onClick={() => (editing.value = true)}
      >
        ✎
      </button>
    </div>
  );
}
