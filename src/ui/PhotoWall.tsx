import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { t } from "../lib/i18n";
import { getImage, listImages, toUrl } from "../lib/images";
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
 *
 * 輪播開著就依上傳時間輪過整個圖庫。同一時間只握著一個 blob 網址 ——
 * 一次把全部的圖都轉成網址，二十張 2048px 的 WebP 解開就是幾百 MB。
 */

/** 輪播間隔的選項，單位是秒。第一個 0 代表不輪播。 */
const EVERY = [0, 15, 60, 300, 1800];

function everyLabel(seconds: number): string {
  if (seconds === 0) return t("c_photos_rotate_off");
  const span =
    seconds < 60
      ? `${seconds}s`
      : seconds < 3600
        ? `${seconds / 60}m`
        : `${seconds / 3600}h`;
  return t("c_photos_every", span);
}

interface Photo {
  /** 牆上現在掛的那張。null 代表還沒挑過 */
  id: string | null;
  /** 輪播間隔（秒），0 是不輪播 */
  rotate: number;
}

interface Props {
  photo: Photo;
  onPhoto: (patch: Partial<Photo>) => void;
}

export function PhotoWall({ photo, onPhoto }: Props) {
  const editing = useSignal(false);
  const url = useSignal<string | null>(null);
  const ids = useSignal<string[]>([]);
  const step = useSignal(0);

  /** 圖庫的 id 清單。上傳或刪除之後要重讀，否則輪播會停在舊的一批上。 */
  async function reload() {
    ids.value = (await listImages()).map((img) => img.id);
  }

  useEffect(() => {
    void reload();
  }, []);

  const list = ids.value;
  const rotating = photo.rotate > 0 && list.length > 1;
  // 輪播時從 photoId 那張接著往下走，不是每次都跳回第一張
  const from = Math.max(0, photo.id ? list.indexOf(photo.id) : 0);
  const shown = rotating ? (list[(from + step.value) % list.length] ?? null) : photo.id;

  useEffect(() => {
    if (!rotating) return;
    const id = setInterval(() => (step.value = step.value + 1), photo.rotate * 1000);
    return () => clearInterval(id);
  }, [rotating, photo.rotate]);

  // 一次只留一個 blob 網址：換一張就把上一張撤掉
  useEffect(() => {
    let alive = true;
    const old = url.peek();
    if (old) URL.revokeObjectURL(old);
    url.value = null;
    if (!shown) return;

    void getImage(shown).then((img) => {
      if (!alive || !img) return;
      url.value = toUrl(img);
    });
    return () => {
      alive = false;
    };
  }, [shown]);

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
          <select
            aria-label={t("c_photos_rotate")}
            value={String(photo.rotate)}
            onChange={(e) => onPhoto({ rotate: Number(e.currentTarget.value) })}
          >
            {EVERY.map((s) => (
              <option key={s} value={String(s)}>
                {everyLabel(s)}
              </option>
            ))}
          </select>
          {url.value && (
            <button
              type="button"
              onClick={() => {
                editing.value = false;
                void reload();
              }}
            >
              {t("c_photos_done")}
            </button>
          )}
        </header>
        <ImagePicker
          wall
          selected={photo.id}
          onSelect={(id) => {
            onPhoto({ id });
            step.value = 0;
            void reload();
          }}
        />
      </>
    );
  }

  return (
    <div class="photoframe" data-grab>
      {/*
        key 一換，元素就換一個，淡入的動畫才會重跑 —— 同一個元素只是換底圖的話
        瀏覽器不會為背景圖做過場。不做交叉淡入是因為那要同時握著兩張的 blob
        網址，而這裡刻意一次只留一個；淡入的起點是卡片自己的底色。
      */}
      <div key={shown} class="photofade" style={{ backgroundImage: `url("${url.value}")` }} />
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
