import { t } from "../lib/i18n";

/**
 * 四角的四象。
 *
 * 盤面到目前為止只有時間，沒有方位 —— 四象補的是那一維。二十八宿分四組，
 * 每組七宿，順序和歸屬是定的（角亢氐房心尾箕就是東方七宿），這裡照著排。
 *
 * **連線是示意，不是星圖。** 七個點的相對位置是畫出來像那隻獸的樣子，
 * 不是真的赤經赤緯 —— 真要照星表投影，這個尺寸下會縮成一團看不出形狀的點。
 * 所以標題寫「七宿」而不是「星圖」，宿名放在 title 裡（滑過去看得到、讀屏唸得出來），
 * 圖上不標 —— 這個大小標七個字就是七團噪點。
 *
 * 擺放依二十八宿本身的順序逆時針走（東、北、西、南），跟盤上每一環轉的方向同一個手勢。
 * 顏色用各象自己的顏色，壓到很暗：青龍青、朱雀赤、白虎白、玄武玄。
 */

interface Sym {
  /** 角落左上角在 620 座標系裡的位置 */
  at: [number, number];
  /** 七宿的相對位置，0 到 100 的方格 */
  pts: [number, number][];
  color: string;
}

const BOX = 100;

const SYMS: Sym[] = [
  // 東方青龍：一條起伏的長身
  {
    at: [10, 10],
    color: "#7ba7bd",
    pts: [[4, 78], [21, 60], [38, 64], [52, 46], [68, 48], [82, 30], [95, 13]],
  },
  // 北方玄武：龜蛇纏繞，收成一個盤起來的圈
  {
    at: [10, 510],
    color: "#7c88a0",
    pts: [[22, 20], [46, 12], [68, 24], [74, 47], [57, 66], [33, 63], [26, 43]],
  },
  // 西方白虎：低伏的背脊，尾巴翹起
  {
    at: [510, 510],
    color: "#cfc9bb",
    pts: [[6, 42], [23, 31], [42, 35], [58, 24], [75, 33], [89, 52], [96, 76]],
  },
  // 南方朱雀：張開的兩翼，中間是頭
  {
    at: [510, 10],
    color: "#c0705f",
    pts: [[5, 52], [26, 35], [46, 46], [50, 18], [55, 46], [76, 34], [96, 54]],
  },
];

export function FourSymbols() {
  return (
    <svg class="sx" viewBox="0 0 620 620" aria-label={t("sx_title")}>
      {SYMS.map((s, i) => {
        // role="img" 要掛在每一組上，不是掛在整張 svg 上：掛在外層的話裡面的
        // <title> 全部變成裝飾，讀屏只會唸一句「四象二十八宿」，七宿的名字沒了。
        const label = t("sx_name_" + i) + t("sx_of") + t("sx_stars_" + i);
        return (
        <g
          key={i}
          role="img"
          aria-label={label}
          transform={`translate(${s.at[0]} ${s.at[1]})`}
          style={`--sx: ${s.color}`}
        >
          <title>{label}</title>

          <polyline
            class="sx-line"
            fill="none"
            points={s.pts.map(([x, y]) => `${x},${y}`).join(" ")}
          />
          {s.pts.map(([x, y], k) => (
            <circle key={k} class="sx-dot" cx={x} cy={y} r={k === 0 ? 2.6 : 1.7} />
          ))}

          <text class="sx-lab" x={BOX / 2} y={BOX - 2} text-anchor="middle">
            {t("sx_name_" + i)}
          </text>
        </g>
        );
      })}
    </svg>
  );
}
