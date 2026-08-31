/**
 * 語錄。內建，不連網。
 *
 * 中英各二十四句，一個時辰一句的量。兩邊不是互譯 ——
 * 中文走典籍，英文走它自己的傳統，跟外環（節氣／月名）同一個道理。
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
];

const EN: Quote[] = [
  { text: "Well begun is half done.", by: "Aristotle" },
  { text: "The obstacle is the way.", by: "Marcus Aurelius" },
  { text: "Simplicity is the ultimate sophistication.", by: "Leonardo da Vinci" },
  { text: "What we do now echoes in eternity.", by: "Marcus Aurelius" },
  { text: "It is not that we have a short time to live, but that we waste much of it.", by: "Seneca" },
  { text: "Perfection is achieved when there is nothing left to take away.", by: "Antoine de Saint-Exupéry" },
  { text: "The best way out is always through.", by: "Robert Frost" },
  { text: "Slow is smooth, and smooth is fast.", by: "proverb" },
  { text: "A ship in harbour is safe, but that is not what ships are built for.", by: "John A. Shedd" },
  { text: "You can't cross the sea merely by standing and staring at the water.", by: "Rabindranath Tagore" },
  { text: "Nothing is less productive than to make more efficient what should not be done at all.", by: "Peter Drucker" },
  { text: "The scholar's greatest weakness: calling procrastination research.", by: "Stephen King" },
  { text: "Order and simplification are the first steps toward mastery.", by: "Thomas Mann" },
  { text: "It does not matter how slowly you go so long as you do not stop.", by: "Confucius" },
  { text: "We are what we repeatedly do.", by: "Will Durant" },
  { text: "The cure for boredom is curiosity.", by: "Dorothy Parker" },
  { text: "Everything should be made as simple as possible, but no simpler.", by: "Albert Einstein" },
  { text: "To pay attention, this is our endless and proper work.", by: "Mary Oliver" },
  { text: "Amateurs sit and wait for inspiration; the rest of us just get up and go to work.", by: "Chuck Close" },
  { text: "Tell me, what is it you plan to do with your one wild and precious life?", by: "Mary Oliver" },
  { text: "How we spend our days is, of course, how we spend our lives.", by: "Annie Dillard" },
  { text: "Perfection is attained not when there is nothing more to add, but when there is nothing left to take away.", by: "Antoine de Saint-Exupéry" },
  { text: "Beware the barrenness of a busy life.", by: "Socrates" },
  { text: "The way to get started is to quit talking and begin doing.", by: "Walt Disney" },
];

/**
 * 每開一次新分頁抽一句。
 *
 * 原本是依日期固定一天一句。改掉了 —— 一天開二十次新分頁就看同一句話二十次，
 * 那句話會從「讀到的東西」變成「牆上的花紋」，眼睛直接跳過去。
 */
export function randomQuote(english: boolean): Quote {
  const list = english ? EN : ZH;
  return list[Math.floor(Math.random() * list.length)]!;
}
