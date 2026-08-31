import { useSignal } from "@preact/signals";
import { useLayoutEffect, useRef } from "preact/hooks";
import { t } from "../lib/i18n";
import { faviconUrl, initial, makeLink, MAX_LINKS, reorder, type Link } from "../lib/links";

/**
 * 快速連結。
 *
 * 圖示走瀏覽器內建的 favicon 快取（_favicon/），不對外抓圖 —— 離線也有圖示，
 * 也不會把使用者開過哪些站洩漏給第三方。開發模式沒有那個協定，退回字母磚。
 *
 * 兩種排法：九個一組的九宮格，或一個一個排開。九宮格是把格子切成
 * 一眼數得完的塊 —— 十幾個圖示排成一長條，找東西時得從頭掃到尾。
 */

/** 九宮格一組九格。加號也佔一格，所以滿了會自己開下一塊。 */
const PER_BLOCK = 9;

function blocks<T>(cells: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < cells.length; i += PER_BLOCK) out.push(cells.slice(i, i + PER_BLOCK));
  return out.length ? out : [[]];
}

interface Props {
  links: Link[];
  onChange: (links: Link[]) => void;
  /** 九宮格排法。false 是一個一個排開 */
  grid?: boolean;
}

export function Links({ links, onChange, grid }: Props) {
  const adding = useSignal(false);
  const dragging = useSignal<number | null>(null);
  const over = useSignal<number | null>(null);

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
    links.length < MAX_LINKS ? (
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

  // 九宮格是把 cells 切塊，不是換一套 DOM —— 拖曳換位那段兩種排法共用
  if (grid) {
    return (
      <div class="links nine">
        {blocks(cells).map((block, i) => (
          <div class="block" key={i}>
            {block}
          </div>
        ))}
      </div>
    );
  }

  return <div class="links">{cells}</div>;
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
