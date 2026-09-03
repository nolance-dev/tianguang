/**
 * 語錄。內建，不連網。
 *
 * 中英各六十句 —— 一甲子。兩邊不是互譯：中文走典籍，英文走它自己的傳統，
 * 跟外環（節氣／月名）同一個道理。
 */

export interface Quote {
  text: string;
  by: string;
}

const ZH: Quote[] = [
  { text: "為學日益，為道日損。", by: "老子" },
  { text: "知止而後有定，定而後能靜。", by: "大學" },
  { text: "不積跬步，無以至千里。", by: "荀子" },
  { text: "君子欲訥於言而敏於行。", by: "論語" },
  { text: "行到水窮處，坐看雲起時。", by: "王維" },
  { text: "天下難事，必作於易；天下大事，必作於細。", by: "老子" },
  { text: "工欲善其事，必先利其器。", by: "論語" },
  { text: "業精於勤，荒於嬉。", by: "韓愈" },
  { text: "路漫漫其修遠兮，吾將上下而求索。", by: "屈原" },
  { text: "水至清則無魚，人至察則無徒。", by: "漢書" },
  { text: "博學之，審問之，慎思之，明辨之，篤行之。", by: "中庸" },
  { text: "千里之行，始於足下。", by: "老子" },
  { text: "見賢思齊焉，見不賢而內自省也。", by: "論語" },
  { text: "靜以修身，儉以養德。", by: "諸葛亮" },
  { text: "山重水複疑無路，柳暗花明又一村。", by: "陸游" },
  { text: "凡事豫則立，不豫則廢。", by: "中庸" },
  { text: "紙上得來終覺淺，絕知此事要躬行。", by: "陸游" },
  { text: "大巧若拙，大辯若訥。", by: "老子" },
  { text: "學而不思則罔，思而不學則殆。", by: "論語" },
  { text: "落紅不是無情物，化作春泥更護花。", by: "龔自珍" },
  { text: "少年易老學難成，一寸光陰不可輕。", by: "朱熹" },
  { text: "夫學須靜也，才須學也。", by: "諸葛亮" },
  { text: "海納百川，有容乃大。", by: "林則徐" },
  { text: "石可破也，而不可奪堅。", by: "呂氏春秋" },
  { text: "學而時習之，不亦說乎。", by: "論語" },
  { text: "三人行，必有我師焉。", by: "論語" },
  { text: "己所不欲，勿施於人。", by: "論語" },
  { text: "知之為知之，不知為不知，是知也。", by: "論語" },
  { text: "敏而好學，不恥下問。", by: "論語" },
  { text: "逝者如斯夫，不舍晝夜。", by: "論語" },
  { text: "士不可以不弘毅，任重而道遠。", by: "論語" },
  { text: "歲寒，然後知松柏之後凋也。", by: "論語" },
  { text: "天行健，君子以自強不息。", by: "易經" },
  { text: "地勢坤，君子以厚德載物。", by: "易經" },
  { text: "窮則變，變則通，通則久。", by: "易經" },
  { text: "上善若水，水善利萬物而不爭。", by: "老子" },
  { text: "知人者智，自知者明。", by: "老子" },
  { text: "合抱之木，生於毫末。", by: "老子" },
  { text: "禍兮福之所倚，福兮禍之所伏。", by: "老子" },
  { text: "吾生也有涯，而知也無涯。", by: "莊子" },
  { text: "天將降大任於是人也，必先苦其心志。", by: "孟子" },
  { text: "窮則獨善其身，達則兼善天下。", by: "孟子" },
  { text: "鍥而不舍，金石可鏤。", by: "荀子" },
  { text: "青，取之於藍，而青於藍。", by: "荀子" },
  { text: "塞翁失馬，焉知非福。", by: "淮南子" },
  { text: "臨淵羨魚，不如退而結網。", by: "漢書" },
  { text: "玉不琢，不成器；人不學，不知道。", by: "禮記" },
  { text: "獨學而無友，則孤陋而寡聞。", by: "禮記" },
  { text: "學然後知不足，教然後知困。", by: "禮記" },
  { text: "精誠所至，金石為開。", by: "後漢書" },
  { text: "盛年不重來，一日難再晨。", by: "陶淵明" },
  { text: "窮且益堅，不墜青雲之志。", by: "王勃" },
  { text: "長風破浪會有時，直掛雲帆濟滄海。", by: "李白" },
  { text: "會當凌絕頂，一覽眾山小。", by: "杜甫" },
  { text: "欲窮千里目，更上一層樓。", by: "王之渙" },
  { text: "問渠那得清如許，為有源頭活水來。", by: "朱熹" },
  { text: "不以物喜，不以己悲。", by: "范仲淹" },
  { text: "博觀而約取，厚積而薄發。", by: "蘇軾" },
  { text: "千磨萬擊還堅勁，任爾東西南北風。", by: "鄭燮" },
  { text: "非淡泊無以明志，非寧靜無以致遠。", by: "諸葛亮" },
];

const EN: Quote[] = [
  { text: "Well begun is half done.", by: "Aristotle" },
  { text: "The obstacle is the way.", by: "Marcus Aurelius" },
  {
    text: "Simplicity is the ultimate sophistication.",
    by: "Leonardo da Vinci",
  },
  { text: "What we do now echoes in eternity.", by: "Marcus Aurelius" },
  {
    text: "It is not that we have a short time to live, but that we waste much of it.",
    by: "Seneca",
  },
  { text: "The best way out is always through.", by: "Robert Frost" },
  { text: "Slow is smooth, and smooth is fast.", by: "proverb" },
  {
    text: "A ship in harbour is safe, but that is not what ships are built for.",
    by: "John A. Shedd",
  },
  {
    text: "You can't cross the sea merely by standing and staring at the water.",
    by: "Rabindranath Tagore",
  },
  {
    text: "Nothing is less productive than to make more efficient what should not be done at all.",
    by: "Peter Drucker",
  },
  {
    text: "The scholar's greatest weakness: calling procrastination research.",
    by: "Stephen King",
  },
  {
    text: "Order and simplification are the first steps toward mastery.",
    by: "Thomas Mann",
  },
  {
    text: "It does not matter how slowly you go so long as you do not stop.",
    by: "Confucius",
  },
  { text: "We are what we repeatedly do.", by: "Will Durant" },
  { text: "The cure for boredom is curiosity.", by: "Dorothy Parker" },
  {
    text: "Everything should be made as simple as possible, but no simpler.",
    by: "Albert Einstein",
  },
  {
    text: "To pay attention, this is our endless and proper work.",
    by: "Mary Oliver",
  },
  {
    text: "Amateurs sit and wait for inspiration; the rest of us just get up and go to work.",
    by: "Chuck Close",
  },
  {
    text: "Tell me, what is it you plan to do with your one wild and precious life?",
    by: "Mary Oliver",
  },
  {
    text: "How we spend our days is, of course, how we spend our lives.",
    by: "Annie Dillard",
  },
  {
    text: "Perfection is attained not when there is nothing more to add, but when there is nothing left to take away.",
    by: "Antoine de Saint-Exupéry",
  },
  { text: "Beware the barrenness of a busy life.", by: "Socrates" },
  {
    text: "The way to get started is to quit talking and begin doing.",
    by: "Walt Disney",
  },
  { text: "The unexamined life is not worth living.", by: "Socrates" },
  {
    text: "Waste no more time arguing about what a good man should be. Be one.",
    by: "Marcus Aurelius",
  },
  {
    text: "You have power over your mind, not outside events.",
    by: "Marcus Aurelius",
  },
  {
    text: "Very little is needed to make a happy life.",
    by: "Marcus Aurelius",
  },
  {
    text: "We suffer more often in imagination than in reality.",
    by: "Seneca",
  },
  {
    text: "Difficulties strengthen the mind, as labor does the body.",
    by: "Seneca",
  },
  { text: "No man is free who is not master of himself.", by: "Epictetus" },
  {
    text: "First say to yourself what you would be, then do what you have to do.",
    by: "Epictetus",
  },
  { text: "Well done is better than well said.", by: "Benjamin Franklin" },
  { text: "Lost time is never found again.", by: "Benjamin Franklin" },
  { text: "Little strokes fell great oaks.", by: "Benjamin Franklin" },
  {
    text: "I have not failed. I've just found ten thousand ways that won't work.",
    by: "Thomas Edison",
  },
  {
    text: "If I have seen further, it is by standing on the shoulders of giants.",
    by: "Isaac Newton",
  },
  {
    text: "Nature does not hurry, yet everything is accomplished.",
    by: "Laozi",
  },
  { text: "Fall seven times, stand up eight.", by: "Japanese proverb" },
  {
    text: "The best time to plant a tree was twenty years ago. The second best time is now.",
    by: "proverb",
  },
  {
    text: "The only way to do great work is to love what you do.",
    by: "Steve Jobs",
  },
  { text: "Simple can be harder than complex.", by: "Steve Jobs" },
  {
    text: "Premature optimization is the root of all evil.",
    by: "Donald Knuth",
  },
  {
    text: "Programs must be written for people to read, and only incidentally for machines to execute.",
    by: "SICP",
  },
  {
    text: "The best way to predict the future is to invent it.",
    by: "Alan Kay",
  },
  {
    text: "Any sufficiently advanced technology is indistinguishable from magic.",
    by: "Arthur C. Clarke",
  },
  { text: "Rest is not idleness.", by: "John Lubbock" },
  {
    text: "Attention is the rarest and purest form of generosity.",
    by: "Simone Weil",
  },
  {
    text: "The most difficult thing is the decision to act; the rest is merely tenacity.",
    by: "Amelia Earhart",
  },
  {
    text: "Nothing in life is to be feared, it is only to be understood.",
    by: "Marie Curie",
  },
  { text: "No mud, no lotus.", by: "Thich Nhat Hanh" },
  {
    text: "He who has a why to live can bear almost any how.",
    by: "Friedrich Nietzsche",
  },
  {
    text: "Adopt the pace of nature: her secret is patience.",
    by: "Ralph Waldo Emerson",
  },
  {
    text: "Write it on your heart that every day is the best day in the year.",
    by: "Ralph Waldo Emerson",
  },
  {
    text: "Do what you can, with what you have, where you are.",
    by: "Theodore Roosevelt",
  },
  { text: "Not all those who wander are lost.", by: "J.R.R. Tolkien" },
  {
    text: "All we have to decide is what to do with the time that is given us.",
    by: "J.R.R. Tolkien",
  },
  {
    text: "The mind is not a vessel to be filled, but a fire to be kindled.",
    by: "Plutarch",
  },
  {
    text: "It is not enough to be busy; the question is what are we busy about.",
    by: "Henry David Thoreau",
  },
  {
    text: "Everyone thinks of changing the world, but no one thinks of changing himself.",
    by: "Leo Tolstoy",
  },
  {
    text: "Plans are worthless, but planning is everything.",
    by: "Dwight D. Eisenhower",
  },
];

/** 走到第幾句。放 localStorage：要在第一次算繪之前就讀得到，不能等非同步。 */
const CURSOR = "tg.quote";

/**
 * 這一個分頁抽到第幾號。
 *
 * 一個分頁只往前走一格 —— 這個 module 變數就是那個閘門。
 * 沒有它的時候實測游標每開一頁跳兩到三格：設定是非同步讀回來的，
 * 讀回來之前先用瀏覽器語言算繪過一次，之後語言、自訂語錄各再觸發一次重繪，
 * 每一次都往前推一格。結果是使用者只看得到大約每三句裡的一句 ——
 * 「六十句都出現過一次」就這樣被悄悄跳過去了。
 */
let slot: number | null = null;

/**
 * 每開一次新分頁往下走一句，走完六十句再從頭。
 *
 * 走過三代：
 *
 * 1. 依日期固定一天一句 —— 一天開二十次新分頁就看同一句話二十次，
 *    那句話會從「讀到的東西」變成「牆上的花紋」，眼睛直接跳過去。
 * 2. 每次隨機抽 —— 不重複是機率問題，不是保證。六十句裡連抽兩次抽到同一句
 *    的機會是 1/60，一天開二十次新分頁大概三天就會遇到一次；而且有些句子
 *    幾個月都輪不到。
 * 3. 現在這樣：照列表順序走，六十句每一句都出現過一次才會再有第二次。
 *
 * 中英各六十句，所以號碼兩邊通用 —— 換語言換的是同一號的另一種說法，
 * 不會因此多走一格。
 *
 * 游標存在 localStorage 而不是設定裡：它每開一個分頁就要 +1，
 * 寫進 chrome.storage.sync 會撞上每分鐘 120 次的節流，而且這種東西
 * 跨裝置同步沒有意義 —— 兩台機器各自讀到哪裡是兩件事。
 */
export function nextQuote(english: boolean): Quote {
  const list = english ? EN : ZH;
  if (slot === null) slot = take(list.length);
  return list[slot % list.length]!;
}

/** 讀游標、寫回下一格。存取不到就隨機挑一格（無痕視窗、關掉網站資料）。 */
function take(len: number): number {
  try {
    const raw = localStorage.getItem(CURSOR);
    const n = raw === null ? 0 : Number.parseInt(raw, 10);
    // 手改過的值不能讓它變成 undefined 那一格
    const at = Number.isFinite(n) && n >= 0 ? n % len : 0;
    localStorage.setItem(CURSOR, String((at + 1) % len));
    return at;
  } catch {
    // 記不住順序的時候，隨機比「每一個新分頁都是第一句」好
    return Math.floor(Math.random() * len);
  }
}

/** 只有測試需要：把「這個分頁抽過了」的閘門放掉。 */
export function resetQuoteSlot(): void {
  slot = null;
}
