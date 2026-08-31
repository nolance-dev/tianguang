import { render } from "preact";
import { App } from "./ui/App";
import { locale } from "./lib/i18n";
import "./styles.css";

// 語系寫上 <html lang>，CSS 才能靠 :root[lang^="en"] 把中英文的字體與字距分開。
// 這是天光與 Aubade 唯一需要在樣式層分岔的地方。
document.documentElement.lang = locale();

render(<App />, document.getElementById("app")!);
