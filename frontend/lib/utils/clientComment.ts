/**
 * Комментарий задания без повтора имени клиента.
 *
 * В комментарий часто пишут клиента ещё раз: клиент «Ботагоз», комментарий
 * «Ботагоз Мегафарм» — в очереди получилось бы «Ботагоз — Ботагоз Мегафарм».
 * Убираем имя клиента как отдельное слово (без учёта регистра) и оставшиеся по
 * краям разделители. Если от комментария ничего не осталось — null.
 * Данные не меняются: чистим только при показе.
 */
export function clientComment(comment: string | null | undefined, client: string | null | undefined): string | null {
  const text = (comment ?? "").trim();
  if (!text) return null;
  const name = (client ?? "").trim();
  if (!name) return text;

  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  // Граница слова для кириллицы: \b в JS понимает только латиницу.
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu");
  const cleaned = text
    .replace(re, " ")
    .replace(/\(\s*\)|«\s*»|"\s*"/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:;,.|/]+|[\s\-–—:;,.|/]+$/g, "")
    .trim();
  return cleaned || null;
}
