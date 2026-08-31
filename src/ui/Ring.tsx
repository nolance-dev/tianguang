/**
 * 時辰徽章上的那一小圈。
 *
 * 十二根刻，亮的那根是當下的時辰，環上一點是此刻的連續位置。
 * P2 的全屏時辰盤會共用同一組角度慣例：0 度在正上方，順時針，
 * 子時中心對正上方 —— 所以這裡先把慣例定死，別到時候兩邊算法不一致。
 */

interface Props {
  /** 目前時辰，0 = 子 */
  index: number;
  /** 一天之內的連續位置，0–1，子夜為 0 */
  fraction: number;
  size?: number;
}

const R = 38;
const CENTER = 50;

function point(radius: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [CENTER + radius * Math.cos(rad), CENTER + radius * Math.sin(rad)];
}

export function Ring({ index, fraction, size = 100 }: Props) {
  const ticks = Array.from({ length: 12 }, (_, k) => {
    const on = k === index;
    const len = on ? 15 : 8;
    const [x1, y1] = point(R - len, k * 30);
    const [x2, y2] = point(R, k * 30);
    return (
      <line
        key={k}
        x1={x1.toFixed(2)}
        y1={y1.toFixed(2)}
        x2={x2.toFixed(2)}
        y2={y2.toFixed(2)}
        stroke="currentColor"
        stroke-opacity={on ? 1 : 0.35}
        stroke-width={on ? 3.2 : 1.5}
        stroke-linecap="round"
      />
    );
  });

  const [dx, dy] = point(R, fraction * 360);

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <circle
        cx={CENTER}
        cy={CENTER}
        r={R}
        fill="none"
        stroke="currentColor"
        stroke-opacity="0.28"
        stroke-width="1.4"
      />
      {ticks}
      <circle cx={dx.toFixed(2)} cy={dy.toFixed(2)} r="2.6" fill="currentColor" />
    </svg>
  );
}
