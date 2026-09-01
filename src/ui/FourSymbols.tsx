import { seasonSymbol } from "../lib/almanac";
import { isEnglish, t } from "../lib/i18n";

/**
 * 四角的四象二十八宿。
 *
 * 七宿一組，點是宿、線是順序，旁邊寫宿名。**連線是示意不是星圖** —— 點的相對位置
 * 是排得像那隻獸，不是真的赤經赤緯；真照星表投影，這個尺寸下會縮成一團。
 * 宿名和歸屬倒是確定的：角亢氐房心尾箕就是東方七宿。
 *
 * 每一象標出它在盤上對應的那一份：方位和季節，當令的那一象整組亮起來。
 * 二十八宿分四象本來就是分四季的，盤上正走到哪一季，角上就該是誰。
 *
 * 擺放依二十八宿本身的順序逆時針走（東、北、西、南），跟每一環轉的方向同一個手勢。
 * 顏色用各象自己的顏色：青龍青、玄武玄、白虎白、朱雀赤。
 */

/** 盤心。宿名要往圓外推，得知道圓心在哪 */
const C = 310;

/**
 * 角落方塊的邊長，620 座標系。
 *
 * 118 是幾何算出來的上限。往內長會撞到半徑 278 上那圈分刻數字（白虎的奎宿是
 * 離盤心最近的那一點），往外長會把象名擠出畫面 —— 上下各留 22 給那一行字。
 * 這個數字是解出來的，不是調出來的：改動點的座標就得重解。
 */
const BOX = 118;

/** 宿名離宿點多遠。一律沿著背離盤心的方向推，永遠不會往盤裡擠 */
const OUT = 10;

interface Sym {
  /** 方塊左上角在 620 座標系裡的位置 */
  at: [number, number];
  color: string;
  /** 標籤寫在圖的哪一側：上面兩角在上、下面兩角在下，一律朝畫面外 */
  labelY: number;
  /** 七宿的相對位置，0 到 100 的方格 */
  pts: [number, number][];
}

const SYMS: Sym[] = [
  // 東方青龍：一條起伏的長身
  {
    at: [8, 22],
    color: "#7ba7bd",
    labelY: -8,
    pts: [[4, 78], [21, 60], [38, 64], [52, 46], [68, 48], [82, 30], [95, 13]],
  },
  // 北方玄武：龜蛇纏繞，收成一個盤起來的圈
  {
    at: [8, 480],
    color: "#7c88a0",
    labelY: BOX + 14,
    pts: [[22, 20], [46, 12], [68, 24], [74, 47], [57, 66], [33, 63], [26, 43]],
  },
  // 西方白虎：低伏的背脊，尾巴翹起
  {
    at: [494, 480],
    color: "#cfc9bb",
    labelY: BOX + 14,
    pts: [[6, 42], [23, 31], [42, 35], [58, 24], [75, 33], [89, 52], [96, 76]],
  },
  // 南方朱雀：張開的兩翼，中間是頭
  {
    at: [494, 22],
    color: "#c0705f",
    labelY: -8,
    pts: [[5, 52], [26, 35], [46, 46], [50, 18], [55, 46], [76, 34], [96, 54]],
  },
];

interface Props {
  now: Date;
}

export function FourSymbols({ now }: Props) {
  const live = seasonSymbol(now);
  // 英文版的宿名是整個詞（Winnowing Basket），標在點旁邊會把圖蓋掉，只留在標籤裡
  const named = !isEnglish();

  return (
    <svg class="sx" viewBox="0 0 620 620" aria-label={t("sx_title")}>
      {SYMS.map((s, i) => {
        // role="img" 要掛在每一組上，不是掛在整張 svg 上：掛在外層的話裡面的
        // <title> 全部變成裝飾，讀屏只會唸一句「四象二十八宿」，七宿的名字沒了。
        const label = t("sx_name_" + i) + t("sx_of") + t("sx_stars_" + i);
        const stars = t("sx_stars_" + i).split(" ");
        const at = s.pts.map(([px, py]) => [(px * BOX) / 100, (py * BOX) / 100] as const);

        return (
          <g
            key={i}
            role="img"
            aria-label={label}
            aria-current={i === live ? "true" : undefined}
            class={i === live ? "on" : undefined}
            transform={`translate(${s.at[0]} ${s.at[1]})`}
            style={`--sx: ${s.color}`}
          >
            <title>{label}</title>

            <polyline class="sx-line" fill="none" points={at.map((p) => p.join(",")).join(" ")} />

            {at.map(([x, y], k) => {
              const vx = s.at[0] + x - C;
              const vy = s.at[1] + y - C;
              const n = Math.hypot(vx, vy) || 1;
              return (
                <g key={k}>
                  <circle class="sx-dot" cx={x} cy={y} r={k === 0 ? 3.1 : 2.1} />
                  {named && (
                    <text
                      class="sx-star"
                      x={x + (vx / n) * OUT}
                      y={y + (vy / n) * OUT}
                      text-anchor="middle"
                      dominant-baseline="central"
                    >
                      {stars[k]}
                    </text>
                  )}
                </g>
              );
            })}

            <text class="sx-lab" x={BOX / 2} y={s.labelY} text-anchor="middle">
              {t("sx_name_" + i)} · {t("sx_dir_" + i)} · {t("sx_season_" + i)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
