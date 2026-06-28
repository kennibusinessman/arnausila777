/** Стабильный цвет категории расхода (по id) — пилюли, свотчи в таблице/форме. */
export interface CategoryColor {
  bg: string;
  text: string;
  border: string;
  dot: string;
  gradient: string;
}

const PALETTE: CategoryColor[] = [
  { bg: "bg-violet-500/15", text: "text-violet-700", border: "border-violet-500/30", dot: "bg-violet-500", gradient: "linear-gradient(140deg,#8d6bff,#b08bff)" },
  { bg: "bg-blue-500/15", text: "text-blue-700", border: "border-blue-500/30", dot: "bg-blue-500", gradient: "linear-gradient(140deg,#5b8def,#7aa6ff)" },
  { bg: "bg-teal-500/15", text: "text-teal-700", border: "border-teal-500/30", dot: "bg-teal-500", gradient: "linear-gradient(140deg,#3fc6c6,#5bd9c4)" },
  { bg: "bg-cyan-500/15", text: "text-cyan-700", border: "border-cyan-500/30", dot: "bg-cyan-500", gradient: "linear-gradient(140deg,#5bc0eb,#7ad3f0)" },
  { bg: "bg-amber-500/15", text: "text-amber-700", border: "border-amber-500/30", dot: "bg-amber-500", gradient: "linear-gradient(140deg,#f0a23c,#f5c06b)" },
  { bg: "bg-indigo-500/15", text: "text-indigo-700", border: "border-indigo-500/30", dot: "bg-indigo-500", gradient: "linear-gradient(140deg,#6366f1,#818cf8)" },
  { bg: "bg-pink-500/15", text: "text-pink-700", border: "border-pink-500/30", dot: "bg-pink-500", gradient: "linear-gradient(140deg,#f3a78b,#e87aa6)" },
  { bg: "bg-slate-500/15", text: "text-slate-600", border: "border-slate-500/25", dot: "bg-slate-500", gradient: "linear-gradient(140deg,#9aa0ae,#b7bcc6)" },
];

export function categoryColor(categoryId: string): CategoryColor {
  let hash = 0;
  for (let i = 0; i < categoryId.length; i++) hash = (hash * 31 + categoryId.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}
