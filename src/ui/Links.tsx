import { useSignal } from "@preact/signals";
import { useLayoutEffect, useRef } from "preact/hooks";
import { t } from "../lib/i18n";
import { faviconUrl, initial, makeLink, reorder, type Link } from "../lib/links";

/**
 * 快速連結。
 *
 * 圖示走瀏覽器內建的 favicon 快取（_favicon/），不對外抓圖 —— 離線也有圖示，
 * 也不會把使用者開過哪些站洩漏給第三方。開發模式沒有那個協定，退回字母磚。
 *
 * 排法只有一種：格線排開，而且**每一列補齊**。
 *
 * 列數由「這個寬度塞得下幾個」決定，欄數再由 ceil(數量 / 列數) 回推 ——
 * 十六個排兩列就是八八，十五個是八七，不是塞滿一列剩下的掉到第二列去。
 * 曾經有過九個一組的九宮格，拿掉了：卡片本來就有大小，塊再切一次是第二套
 * 尺寸規則，兩套會打架。
 */

/** 一個磚塊至少要多寬才算放得下。比這個窄就換行，不是把圖示壓成一條 */
const MIN_TILE = 3.4;

interface Props {
  links: Link[];
  onChange: (links: Link[]) => void;
  /**
   * 這一張還能再放幾個之前就不給加號了。
   *
   * 上限是「這一張」的，不是全部的 —— 一張裝滿十六個之後，加號要出現在
   * 下一張，不是在這一張變灰。全域上限由呼叫端把這個值調成目前的數量來擋。
   */
  max: number;
}

export function Links({ links, onChange, max }: Props) {
  const adding = useSignal(false);
  const dragging = useSignal<number | null>(null);
  const over = useSignal<number | null>(null);
  const cols = useSignal(0);
  const box = useRef<HTMLDivElement>(null);

  /*
   * 欄數要量出來，不能從卡片佔幾格去推。
   *
   * 同樣是「三欄寬」，在工作區（84rem 的格線）和主頁面（58rem）差了三分之一，
   * 推出來的欄數在其中一邊一定是錯的 —— 磚塊會滿出卡片外面。實際寬度只有
   * 版面算完才知道，所以量它，而且用 ResizeObserver 跟著變。
   */
  const total = links.length + (links.length < max ? 1 : 0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver !== "function") return;
    const measure = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
      const fit = Math.max(1, Math.floor((el.clientWidth + gap) / (MIN_TILE * rem + gap)));
      const rows = Math.max(1, Math.ceil(total / fit));
      // 列數定了，欄數就是把總數平均分到每一列 —— 這一步才是「上下對齊」
      cols.value = Math.max(1, Math.ceil(total / rows));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [total]);

  if (links.length === 0 && !adding.value) {
    return (
      <div class="links empty">
        <p class="msg">
          <b>{t("links_empty_title")}</b>
          {t("links_empty_body")}
        </p>
        <button type="button" class="tile add" onClick={() => (adding.value = true)}>
          ＋
        </button>
      </div>
    );
  }

  const slots = links.map((link, i) => (
        <div
          key={link.id}
          class={`slot${dragging.value === i ? " dragging" : ""}${over.value === i ? " over" : ""}`}
          draggable
          onDragStart={() => (dragging.value = i)}
          onDragEnd={() => {
            dragging.value = null;
            over.value = null;
          }}
          onDragOver={(e) => {
            e.preventDefault();
            over.value = i;
          }}
          onDrop={(e) => {
            e.preventDefault();
            const from = dragging.value;
            if (from !== null) onChange(reorder(links, from, i));
            dragging.value = null;
            over.value = null;
          }}
        >
          <a class="tile" href={link.url} title={`${link.title}\n${link.url}`}>
            <Icon link={link} />
            <span class="cap">{link.title}</span>
          </a>
          <button
            type="button"
            class="rm"
            aria-label={t("links_remove")}
            onClick={() => onChange(links.filter((l) => l.id !== link.id))}
          >
            ✕
          </button>
        </div>
  ));

  const adder =
    links.length < max ? (
      adding.value ? (
        <AddForm
          key="add"
          onCancel={() => (adding.value = false)}
          onAdd={(link) => {
            onChange([...links, link]);
            adding.value = false;
          }}
        />
      ) : (
        <button
          key="add"
          type="button"
          class="tile add"
          aria-label={t("links_add")}
          onClick={() => (adding.value = true)}
        >
          ＋
        </button>
      )
    ) : null;

  const cells = adder ? [...slots, adder] : slots;

  return (
    <div ref={box} class="links" style={cols.value ? `--cols: ${cols.value}` : undefined}>
      {cells}
    </div>
  );
}

function Icon({ link }: { link: Link }) {
  const src = faviconUrl(link.url);
  const failed = useSignal(false);
  if (!src || failed.value) return <span class="glyph">{initial(link.title)}</span>;
  return <img class="fav" src={src} alt="" loading="lazy" onError={() => (failed.value = true)} />;
}

function AddForm({ onAdd, onCancel }: { onAdd: (l: Link) => void; onCancel: () => void }) {
  const url = useSignal("");
  const title = useSignal("");
  const bad = useSignal(false);
  const first = useRef<HTMLInputElement>(null);

  // 只在表單掛上時聚焦一次。
  // 原本寫在 ref callback 裡 —— 那個 callback 每次 render 都會跑，而整個畫面
  // 每秒重繪一次（時鐘在走），所以游標每秒被搶回網址欄，名稱根本打不完。
  // 它連帶會搶走設定面板裡正在輸入的欄位，因為 focus() 是全域的。
  useLayoutEffect(() => first.current?.focus(), []);

  return (
    <form
      class="tile addform"
      onSubmit={(e) => {
        e.preventDefault();
        const link = makeLink(url.value, title.value);
        if (!link) {
          bad.value = true;
          first.current?.focus();
          return;
        }
        onAdd(link);
      }}
    >
      <input
        ref={first}
        type="text"
        class={bad.value ? "bad" : undefined}
        value={url.value}
        placeholder={t("links_add_url")}
        aria-label={t("links_add_url")}
        onInput={(e) => {
          url.value = e.currentTarget.value;
          bad.value = false;
        }}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
      />
      <input
        type="text"
        value={title.value}
        placeholder={t("links_add_title")}
        aria-label={t("links_add_title")}
        onInput={(e) => (title.value = e.currentTarget.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
      />
      <div class="acts">
        <button type="submit">{t("links_save")}</button>
        <button type="button" onClick={onCancel}>
          {t("links_cancel")}
        </button>
      </div>
    </form>
  );
}
