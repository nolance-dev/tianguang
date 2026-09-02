import { useSignal } from "@preact/signals";
import { useLayoutEffect, useRef } from "preact/hooks";
import { t } from "../lib/i18n";
import {
  faviconUrl,
  initial,
  makeLink,
  reorder,
  type Link,
} from "../lib/links";
import { slide } from "../lib/flip";

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
  /*
   * 拖曳中的排法放在 live 裡，放手才回報出去。
   *
   * 每經過一格就 onChange 一次的話，每一步都會寫進 chrome.storage.sync ——
   * 那裡每分鐘只給 120 次。而且記的是 id 不是索引：磚塊在拖的過程中一直
   * 在換位置，索引每動一次就過期，id 不會。
   */
  const dragId = useSignal<string | null>(null);
  const live = useSignal<Link[] | null>(null);
  const cols = useSignal(0);
  /** 正在編輯的那一個的 id。右鍵按著不動放開就進這個狀態 */
  const editing = useSignal<string | null>(null);
  const rows = useSignal(0);
  const box = useRef<HTMLDivElement>(null);

  /*
   * 欄數要量出來，不能從卡片佔幾格去推。
   *
   * 同樣是「三欄寬」，在工作區（84rem 的格線）和主頁面（58rem）差了三分之一，
   * 推出來的欄數在其中一邊一定是錯的 —— 磚塊會滿出卡片外面。實際寬度只有
   * 版面算完才知道，所以量它，而且用 ResizeObserver 跟著變。
   */
  const list = live.value ?? links;
  const total = list.length + (list.length < max ? 1 : 0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver !== "function") return;
    const measure = () => {
      const rem =
        parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
      const fit = Math.max(
        1,
        Math.floor((el.clientWidth + gap) / (MIN_TILE * rem + gap)),
      );
      const need = Math.max(1, Math.ceil(total / fit));
      // 列數定了，欄數就是把總數平均分到每一列 —— 這一步才是「上下對齊」
      cols.value = Math.max(1, Math.ceil(total / need));
      // 排成一排的時候卡片要收起來，所以列數也要讓 CSS 看得到
      rows.value = need;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [total]);

  /** 放手的收尾：這時候才落盤 */
  function commit() {
    const final = live.peek();
    live.value = null;
    dragId.value = null;
    // drop 之後 dragend 還會再來一次，那時 final 已經是 null，不會重複寫
    if (final) onChange(final);
  }

  if (links.length === 0 && !adding.value) {
    return (
      <div class="links empty">
        <p class="msg">
          <b>{t("links_empty_title")}</b>
          {t("links_empty_body")}
        </p>
        <button
          type="button"
          class="tile add"
          onClick={() => (adding.value = true)}
        >
          ＋
        </button>
      </div>
    );
  }

  /*
   * 表單一開就整個蓋掉格線，不是插在磚塊之間。
   *
   * 它比一塊磚高一倍，插在格線裡會把那一列撐開；而這張卡的高度是鎖死的一格，
   * 撐開的結果就是下面的磚塊被裁掉一半。整片換成表單，卡片的高度就不必動。
   */
  const open = editing.value ? links.find((l) => l.id === editing.value) : null;
  if (open || adding.value) {
    return (
      <div ref={box} class="links editing">
        <LinkForm
          link={open ?? undefined}
          onSave={(next) => {
            if (open) onChange(links.map((l) => (l.id === open.id ? next : l)));
            else onChange([...links, next]);
            editing.value = null;
            adding.value = false;
          }}
          onCancel={() => {
            editing.value = null;
            adding.value = false;
          }}
        />
      </div>
    );
  }

  const slots = list.map((link, i) => (
    <div
      key={link.id}
      data-i={i}
      title={t("links_hint")}
      class={`slot${dragId.value === link.id ? " dragging" : ""}`}
      draggable
      onDragStart={() => {
        dragId.value = link.id;
        live.value = links;
      }}
      onDragEnd={commit}
      onDragOver={(e) => {
        // 不擋掉預設行為就收不到 drop，游標也會一直顯示禁止
        e.preventDefault();
        /*
         * 經過就換位置，不是放手才換。
         *
         * 原本只在這裡記一個「滑過第幾格」，畫一圈外框，放手才重排 ——
         * 那一刻整排磚塊同時跳到新位置，看不出來誰去了哪。改成邊拖邊讓路，
         * 空位就是答案，外框那圈提示反而不必要了。
         *
         * 換完之後游標底下就是被拖的那一塊自己，from === i 直接跳過，
         * 不會在原地來回抖。
         */
        const held = dragId.peek();
        if (held === null) return;
        const now = live.peek() ?? links;
        const from = now.findIndex((l) => l.id === held);
        if (from < 0 || from === i) return;
        slide(box.current, () => (live.value = reorder(now, from, i)), ".slot");
      }}
      onDrop={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <a class="tile" href={link.url} title={`${link.title}\n${link.url}`}>
        <Icon link={link} />
        <span class="cap">{link.title}</span>
      </a>
      {/*
       * 編輯走一顆按鈕，不走右鍵。
       *
       * 右鍵在 Edge 上叫得出瀏覽器自己的選單，加不加 Shift 都攔不乾淨 ——
       * 跟瀏覽器搶同一個手勢只會輸。一顆跟刪除並排的鈕沒有這個問題，
       * 而且看得見：右鍵是要人猜的，鈕不用。
       */}
      <button
        type="button"
        class="edit"
        aria-label={t("links_edit")}
        onClick={() => (editing.value = link.id)}
      >
        {/*
         * 畫的不是字。✎ 這個字在多數字型裡側邊留白不對稱，塞進圓鈕就是偏一邊，
         * 微調 padding 只是在補某一種字型。
         *
         * 那個 translate 也不是憑感覺調的：兩段路徑合起來的外框是
         * x 3.00、y 2.67、10.33 見方，中心落在 (8.16, 7.84)，離 viewBox 的中心
         * 差 (0.16, -0.16) —— 這裡把它補回去。筆是斜的，外框置中才是真的置中。
         */}
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <g transform="translate(-0.16 0.16)" fill="currentColor">
            <path d="M12.9 3.1a1.5 1.5 0 0 0-2.1 0L9.6 4.3l2.1 2.1 1.2-1.2a1.5 1.5 0 0 0 0-2.1Z" />
            <path d="M8.5 5.4 3 10.9V13h2.1l5.5-5.5-2.1-2.1Z" />
          </g>
        </svg>
      </button>
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
      <button
        key="add"
        type="button"
        class="tile add"
        aria-label={t("links_add")}
        onClick={() => (adding.value = true)}
      >
        ＋
      </button>
    ) : null;

  const cells = adder ? [...slots, adder] : slots;

  return (
    <div
      ref={box}
      /*
       * 拖曳中要把進場動畫關掉。
       *
       * Preact 換順序走的是 insertBefore，而 insertBefore 會讓 CSS 動畫
       * 從頭再播一次（量過：同一個節點收到兩次 animationstart）。不關的話
       * 每讓一次路，被移動的那幾塊就閃一下白 —— 而且正好跟 FLIP 的位移疊在
       * 一起，看起來像壞掉。讓路本來就有位移在講話了，不需要再閃。
       */
      class={`links${dragId.value !== null ? " sorting" : ""}`}
      data-rows={rows.value || undefined}
      style={cols.value ? `--cols: ${cols.value}` : undefined}
    >
      {cells}
    </div>
  );
}

function Icon({ link }: { link: Link }) {
  const src = faviconUrl(link.url);
  const failed = useSignal(false);
  if (!src || failed.value)
    return <span class="glyph">{initial(link.title)}</span>;
  return (
    <img
      class="fav"
      src={src}
      alt=""
      loading="lazy"
      onError={() => (failed.value = true)}
    />
  );
}

/**
 * 新增與編輯共用同一個表單。
 *
 * 編輯就是「同一個 id、換掉網址和名稱」，跟新增只差在起始值和保不保留 id ——
 * 分成兩份表單的話，驗證和快捷鍵遲早會各長各的。
 */
function LinkForm({
  link,
  onSave,
  onCancel,
}: {
  link?: Link;
  onSave: (l: Link) => void;
  onCancel: () => void;
}) {
  const url = useSignal(link?.url ?? "");
  const title = useSignal(link?.title ?? "");
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
        const made = makeLink(url.value, title.value);
        if (!made) {
          bad.value = true;
          first.current?.focus();
          return;
        }
        // 編輯時 id 不能換 —— 換了等於刪掉再新增，那一格會跳到最後面
        onSave(link ? { ...made, id: link.id } : made);
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
