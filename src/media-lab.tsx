/**
 * 「正在播放」的尺寸實驗室。開發用，不進打包。
 *
 * 這張卡在工作區可以是 1–4 欄寬、1–3 列高，一共十二種。差異全寫在 CSS 的
 * .card[data-w][data-h] 選擇器裡，但要看到它們得先有東西在播 —— 而開發機上
 * 通常一個都沒有，就算有也湊不齊四種來源。
 *
 * 所以這頁餵假資料，把十二種一次排出來。畫的是 MediaPanel 本人（跟工作區
 * 同一個元件、同一份 styles.css），不是一份長得像它的複製品 —— 複製品會在
 * 第一次改動之後開始說謊。
 *
 * 開法：npm run lab，然後開 /media-lab.html
 */
import { render } from "preact";
import { useSignal } from "@preact/signals";
import { MediaPanel } from "./ui/MediaCard";
import type { Playing } from "./lib/media";
import { COLS, MAX_H } from "./lib/desk";
import "./styles.css";

/**
 * 假的分頁。
 *
 * 主機名挑 CONTROLLABLE 上真的有的那幾個，因為傳輸鍵長不長出來是照那份
 * 清單決定的 —— 隨便編一個網域，看到的會是一張沒有按鍵的卡，那就不是
 * 使用者會看到的樣子。標題長短刻意混著：截斷是這張卡最常見的狀態。
 */
const ROWS: Playing[] = [
  {
    id: 1,
    windowId: 1,
    title: "刀麻发鬓角 · 刀脚",
    host: "open.spotify.com",
    favicon: icon("#1db954", "♪"),
    muted: false,
    active: true,
    paused: false,
  },
  {
    id: 2,
    windowId: 1,
    title: "Lo-fi beats to relax and study to — 24/7 live radio stream",
    host: "youtube.com",
    favicon: icon("#ff0033", "▶"),
    muted: false,
    active: false,
    paused: true,
  },
  {
    id: 3,
    windowId: 1,
    title: "夜色钢琴曲",
    host: "bilibili.com",
    favicon: icon("#00a1d6", "B"),
    muted: true,
    active: false,
    paused: false,
  },
  {
    id: 4,
    windowId: 2,
    title: "Midnight Set",
    host: "soundcloud.com",
    favicon: icon("#ff5500", "≋"),
    muted: false,
    active: false,
    paused: true,
  },
  {
    id: 5,
    windowId: 2,
    title: "沒有圖示的那一種",
    host: "mixcloud.com",
    favicon: null,
    muted: false,
    active: false,
    paused: true,
  },
];

/** 一張現畫的圖示，省得為了看版面去連外部網站 */
function icon(bg: string, glyph: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" rx="7" fill="${bg}"/>` +
    `<text x="16" y="22" font-size="17" text-anchor="middle" fill="#fff">${glyph}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** 每一種尺寸旁邊那行說明：這個大小為什麼長這樣 */
const WHY_W: Record<number, string> = {
  1: "一行放不下文字加四顆鍵，所以鍵自己一行；上下首收起來",
  2: "參考稿那一行：文字在左，傳輸鍵在右",
  3: "同上再寬鬆些，靜音獨立成一組，中間一道分隔線",
  4: "夠寬了，傳輸鍵不再等滑過才亮；標題與圖示都放大",
};

const WHY_H: Record<number, string> = {
  1: "只看得到排最前面那一個，其餘寫在標題旁的膠囊裡",
  2: "一份會捲的清單",
  3: "第一列升格成主角：大圖示、大標題、鍵排在它下面",
};

function Cell({ w, h, rows }: { w: number; h: number; rows: Playing[] }) {
  const list = useSignal(rows);
  return (
    <figure class="lab-cell" style={{ "--cell-w": String(w) }}>
      <figcaption>
        <b>
          {w} × {h}
        </b>
        <span>{WHY_W[w]}</span>
        <span>{WHY_H[h]}</span>
      </figcaption>
      {/* .cards 和 .card 是真的那兩層，尺寸也照真的算 */}
      <div class="cards lab-grid">
        <section
          class="card card-media"
          data-id="media"
          data-w={w}
          data-h={h}
          style={{ "--w": String(w), "--h": String(h) }}
        >
          <MediaPanel
            rows={list.value}
            onOpen={() => {}}
            onCmd={(p, cmd) => {
              if (cmd !== "toggle") return;
              list.value = list.value.map((x) =>
                x.id === p.id ? { ...x, paused: !x.paused } : x,
              );
            }}
            onMute={(p) =>
              (list.value = list.value.map((x) =>
                x.id === p.id ? { ...x, muted: !x.muted } : x,
              ))
            }
          />
        </section>
      </div>
    </figure>
  );
}

function Lab() {
  const many = useSignal(true);
  const rows = many.value ? ROWS : ROWS.slice(0, 1);
  const sizes: Array<[number, number]> = [];
  for (let h = 1; h <= MAX_H; h++)
    for (let w = 1; w <= COLS; w++) sizes.push([w, h]);

  return (
    <div class="lab">
      <header class="lab-head">
        <h1>正在播放 · 十二種尺寸</h1>
        <p>
          工作區的卡片可以拉 1–4 欄寬、1–3 列高。以下是每一種的樣子，畫的是
          正式元件本人。播放鍵與靜音是活的，按得動。
        </p>
        <label>
          <input
            type="checkbox"
            checked={many.value}
            onChange={(e) => (many.value = e.currentTarget.checked)}
          />
          五個分頁在響（取消勾選只留一個）
        </label>
      </header>
      {sizes.map(([w, h]) => (
        <Cell key={`${w}x${h}`} w={w} h={h} rows={rows} />
      ))}
    </div>
  );
}

const root = document.getElementById("lab");
if (root) render(<Lab />, root);
