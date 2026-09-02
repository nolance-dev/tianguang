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
 * 四張各自獨立，貼畫面的四個角，不是貼盤的四個角 —— 盤是正方的，寬螢幕上
 * 畫面的角比盤的角空得多，靠過去就能畫得更大。尺寸交給 CSS 按畫面比例決定。
 *
 * 擺放依二十八宿本身的順序逆時針走（東、北、西、南），跟每一環轉的方向同一個手勢。
 * 顏色用各象自己的顏色：青龍青、玄武玄、白虎白、朱雀赤。
 */

/** 宿名離宿點多遠。方向是背離這一組自己的重心，所以名字一律落在圖形外面 */
const OUT = 9;

interface Sym {
  color: string;
  /** 七宿的相對位置，0 到 100 的方格 */
  pts: [number, number][];
}

const SYMS: Sym[] = [
  // 東方青龍：一條起伏的長身
  {
    color: "#7ba7bd",
    pts: [
      [4, 78],
      [21, 60],
      [38, 64],
      [52, 46],
      [68, 48],
      [82, 30],
      [95, 13],
    ],
  },
  // 北方玄武：龜蛇纏繞，收成一個盤起來的圈
  {
    color: "#7c88a0",
    pts: [
      [22, 20],
      [46, 12],
      [68, 24],
      [74, 47],
      [57, 66],
      [33, 63],
      [26, 43],
    ],
  },
  // 西方白虎：低伏的背脊，尾巴翹起
  {
    color: "#cfc9bb",
    pts: [
      [6, 42],
      [23, 31],
      [42, 35],
      [58, 24],
      [75, 33],
      [89, 52],
      [96, 76],
    ],
  },
  // 南方朱雀：張開的兩翼，中間是頭
  {
    color: "#c0705f",
    pts: [
      [5, 52],
      [26, 35],
      [46, 46],
      [50, 18],
      [55, 46],
      [76, 34],
      [96, 54],
    ],
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
    <>
      {SYMS.map((s, i) => {
        const label = t("sx_name_" + i) + t("sx_of") + t("sx_stars_" + i);
        const stars = t("sx_stars_" + i).split(" ");
        const cx = s.pts.reduce((a, p) => a + p[0], 0) / s.pts.length;
        const cy = s.pts.reduce((a, p) => a + p[1], 0) / s.pts.length;

        return (
          <svg
            key={i}
            class={`sx sx-${i}${i === live ? " on" : ""}`}
            viewBox="-12 -8 124 136"
            role="img"
            aria-label={label}
            aria-current={i === live ? "true" : undefined}
            style={`--sx: ${s.color}`}
          >
            <title>{label}</title>

            {/* 呼吸掛在這一層，外面那一層的 opacity 留給進場的淡入 */}
            <g class="sx-in">
              {/* pathLength 把折線長度正規化成 1，四隻獸的線長差很多，
                  dash 的值才能四張共用一組 */}
              <polyline
                class="sx-line"
                fill="none"
                pathLength={1}
                points={s.pts.map((p) => p.join(",")).join(" ")}
              />

              {s.pts.map(([x, y], k) => {
                const vx = x - cx;
                const vy = y - cy;
                const n = Math.hypot(vx, vy) || 1;
                return (
                  <g key={k}>
                    <circle
                      class="sx-dot"
                      cx={x}
                      cy={y}
                      r={k === 0 ? 2.6 : 1.8}
                    />
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

              <text class="sx-lab" x="50" y="120" text-anchor="middle">
                {t("sx_name_" + i)} · {t("sx_dir_" + i)} · {t("sx_season_" + i)}
              </text>
            </g>
          </svg>
        );
      })}
    </>
  );
}
