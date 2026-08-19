const CRAWLER_UA =
  /bot|crawl|spider|slurp|facebookexternalhit|facebot|facebookcatalog|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegrambot|pinterest|googlebot|bingbot|applebot|yandex|baiduspider|duckduckbot|ia_archiver|preview|embed|skypeuripreview|line-poker|line\/|kakaotalk/i;

export function isSocialCrawlerUserAgent(userAgent: string | null | undefined): boolean {
  const ua = String(userAgent ?? "").trim();
  if (!ua) return false;
  return CRAWLER_UA.test(ua);
}
