/**
 * 一份完整的快照：設定、版面、工作區。
 *
 * 存在的理由是「換一台電腦」。這個檔案就是那件事的貨物 —— 不論之後走
 * 匯出成檔案、走瀏覽器的 sync、還是登入 Google 存到雲端硬碟，搬的都是同一包東西。
 * 先把包裝定下來，運送方式之後再接。
 *
 * **照片不在裡面。** 它們在 IndexedDB，一張動輒好幾 MB；塞進 JSON 會讓
 * 這個檔案從幾十 KB 變成幾十 MB，而 sync 的上限是 100KB。要搬照片是另一件事，
 * 不該綁在這一件上。這件事在介面上寫明，不能讓人以為備份包含了照片。
 */

import { migrate as migrateSettings, type Settings } from "./settings";
import { migrate as migrateWorkspace, type Workspace } from "./workspace";

export const SNAPSHOT_VERSION = 1;

export interface Snapshot {
  /** 認得出是誰的檔案。匯入時第一關就看它 */
  app: "tianguang";
  version: number;
  /** 產生的時刻，ISO 字串。還原時顯示「這份是什麼時候的」 */
  at: string;
  settings: Settings;
  workspace: Workspace;
}

export function pack(settings: Settings, workspace: Workspace, at = new Date()): Snapshot {
  return {
    app: "tianguang",
    version: SNAPSHOT_VERSION,
    at: at.toISOString(),
    settings,
    workspace,
  };
}

/**
 * 把讀進來的東西還原成設定與工作區。
 *
 * 一律過各自的 migrate()：那兩個函式本來就在處理「舊版本、缺欄位、型別不對」，
 * 匯入的檔案跟從儲存空間讀回來的東西面對的是同一種問題。不另外寫一套驗證，
 * 兩套遲早會不一致。
 *
 * 認不出來就回 null，不猜。
 */
export function unpack(raw: unknown): { settings: Settings; workspace: Workspace } | null {
  if (!raw || typeof raw !== "object") return null;
  const snap = raw as Partial<Snapshot>;
  if (snap.app !== "tianguang") return null;
  if (typeof snap.version !== "number" || snap.version > SNAPSHOT_VERSION) return null;

  const settings = snap.settings as Record<string, unknown> | undefined;
  const workspace = snap.workspace as Record<string, unknown> | undefined;
  if (!settings && !workspace) return null;

  return {
    settings: migrateSettings(settings ?? {}),
    workspace: migrateWorkspace(workspace ?? {}),
  };
}

/** 檔名帶日期。一個資料夾裡躺著三份備份時，這是唯一分得出來的線索 */
export function fileName(at = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `tianguang-${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}.json`;
}
