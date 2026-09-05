import { describe, expect, it } from "vitest";
import {
  baseTile,
  cover,
  echoLayer,
  radarTile,
  RADAR_MAX_Z,
  TILE,
  tileAt,
} from "../src/lib/radar";

describe("圖磚座標", () => {
  it("台北在 z6 落在 x53 y27 —— 這組數字是拿真的圖磚驗過的", () => {
    const { x, y } = tileAt(25.033, 121.565, 6);
    expect(Math.floor(x)).toBe(53);
    expect(Math.floor(y)).toBe(27);
  });

  it("經度零度、緯度零度在正中間", () => {
    const { x, y } = tileAt(0, 0, 1);
    expect(x).toBeCloseTo(1, 6);
    expect(y).toBeCloseTo(1, 6);
  });

  it("帶小數 —— 只取整數格的話城市會歪到格子邊上", () => {
    const { x } = tileAt(0, 1, 8);
    expect(x % 1).not.toBe(0);
  });

  it("超過麥卡托的緯度上限就夾住，不會算出 NaN 或無限大", () => {
    for (const lat of [90, -90, 89.9, -89.9]) {
      const { y } = tileAt(lat, 0, 5);
      expect(Number.isFinite(y)).toBe(true);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(2 ** 5);
    }
  });
});

describe("鋪滿一塊區域", () => {
  it("目標剛好落在正中央", () => {
    const z = 7;
    const [lat, lon] = [25.033, 121.565];
    const [w, h] = [600, 400];
    const cells = cover(lat, lon, z, w, h);
    const f = tileAt(lat, lon, z);

    // 中心點落在哪一格、格子裡的哪個位置
    const host = cells.find(
      (c) => c.x === Math.floor(f.x) && c.y === Math.floor(f.y),
    )!;
    expect(host, "包含目標的那一格一定要在裡面").toBeTruthy();
    const px = host.left + (f.x % 1) * TILE;
    const py = host.top + (f.y % 1) * TILE;
    expect(px).toBeCloseTo(w / 2, 0);
    expect(py).toBeCloseTo(h / 2, 0);
  });

  it("蓋滿整塊，四個角都有東西", () => {
    const cells = cover(25.033, 121.565, 7, 600, 400);
    expect(Math.min(...cells.map((c) => c.left))).toBeLessThanOrEqual(0);
    expect(Math.max(...cells.map((c) => c.left + TILE))).toBeGreaterThanOrEqual(
      600,
    );
    expect(Math.min(...cells.map((c) => c.top))).toBeLessThanOrEqual(0);
    expect(Math.max(...cells.map((c) => c.top + TILE))).toBeGreaterThanOrEqual(
      400,
    );
  });

  it("經度繞一圈，緯度不繞 —— 硬繞會把北極的圖磚畫到南極去", () => {
    const n = 2 ** 4;
    for (const c of cover(0, 179.9, 4, 800, 300)) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThan(n);
    }
    for (const c of cover(84, 0, 4, 300, 800)) {
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThan(n);
    }
  });
});

describe("圖磚網址", () => {
  it("雷達是 {base}/{size}/{z}/{x}/{y}/{色階}/{平滑}_{雪}.png，平滑要關", () => {
    const url = radarTile(
      { base: "https://tilecache.rainviewer.com/v2/radar/abc", time: 1 },
      6,
      53,
      27,
    );
    // 結尾的 0 是平滑關閉。開著的話每張圖磚自己平滑自己，接縫會變成一條直線
    expect(url).toBe(
      "https://tilecache.rainviewer.com/v2/radar/abc/256/6/53/27/4/0_1.png",
    );
  });

  it("底圖跟著亮暗換，而且是 /tile/{z}/{y}/{x} —— 列在前，跟 XYZ 相反", () => {
    expect(baseTile(true, 6, 53, 27)).toContain(
      "World_Dark_Gray_Base/MapServer/tile/6/27/53",
    );
    expect(baseTile(false, 6, 53, 27)).toContain(
      "World_Light_Gray_Base/MapServer/tile/6/27/53",
    );
  });
});

describe("回波那一層", () => {
  it("在上限以內就跟底圖同一組圖磚", () => {
    const z = RADAR_MAX_Z;
    const e = echoLayer(25.033, 121.565, z, 600, 400);
    expect(e.z).toBe(z);
    expect(e.scale).toBe(1);
    expect(e.cells).toEqual(cover(25.033, 121.565, z, 600, 400));
  });

  it("超過上限就抓粗一級的再放大 —— 硬要 z9 會拿到一張「不支援」的灰卡", () => {
    const e = echoLayer(25.033, 121.565, RADAR_MAX_Z + 2, 600, 400);
    expect(e.z, "不會去要 RainViewer 沒有的縮放").toBe(RADAR_MAX_Z);
    expect(e.scale).toBe(4);
  });

  it("放大之後城市還是在正中央", () => {
    const [lat, lon] = [25.033, 121.565];
    const [w, h] = [600, 400];
    const z = RADAR_MAX_Z + 2;
    const e = echoLayer(lat, lon, z, w, h);
    const f = tileAt(lat, lon, e.z);

    const host = e.cells.find(
      (c) => c.x === Math.floor(f.x) && c.y === Math.floor(f.y),
    )!;
    expect(host).toBeTruthy();
    const size = TILE * e.scale;
    expect(host.left + (f.x % 1) * size).toBeCloseTo(w / 2, 0);
    expect(host.top + (f.y % 1) * size).toBeCloseTo(h / 2, 0);
  });

  it("放大之後仍然蓋滿整塊", () => {
    const e = echoLayer(25.033, 121.565, RADAR_MAX_Z + 3, 600, 400);
    const size = TILE * e.scale;
    expect(Math.min(...e.cells.map((c) => c.left))).toBeLessThanOrEqual(0);
    expect(
      Math.max(...e.cells.map((c) => c.left + size)),
    ).toBeGreaterThanOrEqual(600);
    expect(Math.min(...e.cells.map((c) => c.top))).toBeLessThanOrEqual(0);
    expect(
      Math.max(...e.cells.map((c) => c.top + size)),
    ).toBeGreaterThanOrEqual(400);
  });
});
