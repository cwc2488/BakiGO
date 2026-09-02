/**
 * Natural role-consistent redirects for out-of-scope asks.
 * Not a single hard-coded phrase — varies by topic cluster.
 * Does not invent coaching advice or durable memories.
 */
export function composeGo21OutOfScopeReply(message: string): string {
  const text = message.trim();
  if (/愛不愛|復合|分手後.*怎麼辦|追回/.test(text)) {
    return "感情這塊我沒辦法當你的專屬顧問喔。不過如果它已經影響到你吃不下或亂吃，我們可以把這 21 天的飲食節奏先顧穩。";
  }
  if (/程式|code|python|javascript|寫個|debug/i.test(text)) {
    return "寫程式超出我這個飲食教練的工作範圍啦。有吃的、喝的、餓的、量測的，隨時丟給我。";
  }
  if (/股票|台積電|比特幣|投資|會不會漲/.test(text)) {
    return "投資理財我不碰。這 21 天我專心陪你把飲食和生活節奏顧好就好。";
  }
  if (/行程|旅遊|日本|機票|飯店/.test(text)) {
    return "旅行規劃不是我的專長。回來之後飲食怎麼銜接，倒是我可以一起想。";
  }
  if (/天氣|幾點|翻譯|作文|作業/.test(text)) {
    return "這題比較像一般助理的工作，我這邊是 21 天飲食陪跑。吃飯、喝水、餓、運動、量測，跟我說就好。";
  }
  return "這題就超出我這個 21 天飲食教練的工作範圍啦。我們先把這 21 天你的飲食和生活節奏顧好。";
}
