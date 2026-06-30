/**
 * Печать этикеток продукции 75×125 мм. Открывает окно с одной этикеткой на страницу
 * и сам вызывает печать: в диалоге пользователь выбирает «Сохранить как PDF» или сразу
 * термопринтер этикеток. Кириллица берётся из системных шрифтов (поэтому окно печати,
 * а не jsPDF — там кириллица требует встраивания шрифтов).
 *
 * Разрыв страницы ставится ПЕРЕД каждой этикеткой, кроме первой (а не после) — иначе
 * после последней этикетки печаталась лишняя пустая страница, а переполнение вызывало
 * «подгонку под лист» и этикетка выходила чуть меньше 75×125.
 */
export interface ShiftLabel {
  /** Наименование продукции — печатается крупно, заглавными. */
  name: string;
  /** Вес в кг, как ввёл мастер (может отличаться для одного наименования). */
  weight: string;
  /** Дата производства, уже отформатированная (дд.мм.гггг). */
  productionDate: string;
  /** Ответственный — мастер смены. */
  responsible: string;
  /** Время печати, уже отформатированное (дд.мм.гггг чч:мм). */
  printTime: string;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/** Возвращает false, если окно печати заблокировано браузером (попап-блокер). */
export function printShiftLabels(labels: ShiftLabel[]): boolean {
  if (labels.length === 0) return false;
  const win = window.open("", "_blank", "width=420,height=680");
  if (!win) return false;

  const row = (k: string, v: string) =>
    `<div class="row"><span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(v) || "—"}</span></div>`;

  // join("") — без пробелов/переносов между этикетками, чтобы не появлялась лишняя страница.
  const body = labels
    .map(
      (l) =>
        `<div class="label"><div class="name">${escapeHtml(l.name)}</div><div class="rows">` +
        row("Вес", l.weight ? `${l.weight} кг` : "") +
        row("Дата производства", l.productionDate) +
        row("Ответственный", l.responsible) +
        row("Время печати", l.printTime) +
        `</div></div>`
    )
    .join("");

  win.document.write(
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Этикетки</title><style>
      @page { size: 75mm 125mm; margin: 0; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 75mm; background: #fff; }
      body { font-family: Arial, "Segoe UI", "Helvetica Neue", sans-serif; color: #000; }
      .label {
        width: 75mm; height: 125mm; padding: 6mm 5mm;
        display: flex; flex-direction: column; overflow: hidden;
        break-before: page; page-break-before: always;
      }
      .label:first-child { break-before: avoid; page-break-before: avoid; }
      .name {
        font-size: 30pt; font-weight: 800; line-height: 1.04;
        text-transform: uppercase; word-break: break-word;
        border-bottom: 2.5px solid #000; padding-bottom: 4mm; margin-bottom: 5mm;
      }
      .rows { display: flex; flex-direction: column; gap: 3.5mm; }
      .row { display: flex; flex-direction: column; }
      .k { font-size: 9pt; color: #444; text-transform: uppercase; letter-spacing: .04em; }
      .v { font-size: 16pt; font-weight: 700; line-height: 1.15; }
    </style><script>
      window.addEventListener("load", function () {
        setTimeout(function () { window.focus(); window.print(); }, 200);
        window.onafterprint = function () { window.close(); };
      });
    <\/script></head><body>${body}</body></html>`
  );
  win.document.close();
  return true;
}
