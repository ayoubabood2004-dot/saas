import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, AlertTriangle, CheckCircle2, Maximize2, Minimize2, CircleDot, SkipForward } from "lucide-react";
import type { Pet, TreatmentEntry } from "@/types";
import { PetAvatar } from "@/components/PetAvatar";
import {
  taskStatus, minutesLate, lateLabel, compareTasks, hourSlot, HHMM,
  type TaskStatus,
} from "@/lib/treatmentSchedule";
import { TASK_META, typeOf, routeShort } from "@/lib/flowsheet";
import { formatNum, cn } from "@/lib/utils";
import { playDoseGiven, playTap } from "@/lib/sounds";

/** A clock slot as shown on the board. The app is Western-numeral throughout (see formatNum). */
const timeLabel = (hhmm: string) => (/^\d{1,2}:\d{2}$/.test(hhmm.trim()) ? hhmm.trim() : "بلا وقت");

const STATUS_META: Record<TaskStatus, { label: string; chip: string; card: string; dot: string }> = {
  overdue: {
    label: "متأخّرة",
    chip: "bg-danger-600 text-white",
    card: "border-danger-300 bg-danger-50 dark:border-danger-500/40 dark:bg-danger-500/10",
    dot: "bg-danger-500",
  },
  due: {
    label: "مستحقّة الآن",
    chip: "bg-warn-500 text-white",
    card: "border-warn-300 bg-warn-50 dark:border-warn-500/40 dark:bg-warn-500/10",
    dot: "bg-warn-500",
  },
  upcoming: {
    label: "جاي",
    chip: "bg-surface-2 text-ink-muted",
    card: "border-line bg-surface-1",
    dot: "bg-ink-subtle",
  },
  given: {
    label: "تمّت",
    chip: "bg-success-600 text-white",
    card: "border-success-200 bg-success-50/60 dark:border-success-500/25 dark:bg-success-500/5",
    dot: "bg-success-500",
  },
};

export interface BoardTask {
  tx: TreatmentEntry;
  pet: Pet | undefined;
  status: TaskStatus;
  late: number;
}

/**
 * One task, as a tappable card.
 *
 * ── لماذا لم تعد كل مهمّةٍ «جرعة» ────────────────────────────────────────
 * هذه اللوحة سبقت حقل `task_type`، فكانت تفترض أن كل صفٍّ دواء: أيقونة حبّة
 * لكل شيء، وزرّ «أعطيت» لكل شيء. وبعد أن صارت الورقة تسجّل الحرارة والسوائل
 * والتغذية، انقسم النظام على نفسه — الطبيب يقيس ٣٩٫٥ بالورقة، ثم يفتح اللوحة
 * فيرى **دواءً اسمه «الحرارة»** بلا رقمها.
 *
 * فصارت اللوحة تقرأ النوع من المصدر نفسه الذي تقرأه الورقة (`typeOf`)،
 * وتلبس رمزه (`glyph`) لا حبّةً لكل شيء. والأهمّ: المهمّة التي **لا تُنجَز
 * إلا بقيمة** (`needsValue`) ما عاد يصحّ أن تُختَم بضغطة «أعطيت» — فقياسٌ
 * بلا رقمٍ ليس قياساً، وختمُه يزيّف السجلّ. فتفتح حقلاً للرقم بدلها.
 */
function TaskCard({ task, onGive, onValue, wall }: {
  task: BoardTask;
  onGive?: (t: TreatmentEntry) => void;
  onValue?: (t: TreatmentEntry, value: string) => void;
  wall: boolean;
}) {
  const { t } = useTranslation();
  const { tx, pet, status, late } = task;
  const meta = STATUS_META[status];
  const done = status === "given";
  const type = typeOf(tx);
  const tm = TASK_META[type];
  /** القياس يحتاج رقماً، ولا نملك مَن يستقبله إلا إذا مُرِّر `onValue`. */
  const asksValue = tm.needsValue && !!onValue;
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);

  const submit = () => {
    const v = draft.trim();
    if (!v || !onValue) return;
    playDoseGiven();
    onValue(tx, v);
    setTyping(false);
    setDraft("");
  };

  return (
    <div className={cn("flex items-center gap-2.5 rounded-2xl border p-2.5 transition", meta.card, wall && "gap-4 p-4")}>
      {pet ? <PetAvatar pet={pet} size={wall ? 56 : 40} className="shrink-0 rounded-xl" />
        : <span className={cn("grid shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-subtle", wall ? "h-14 w-14 text-2xl" : "h-10 w-10")}>🐾</span>}

      <div className="min-w-0 flex-1">
        <div className={cn("truncate font-extrabold text-ink", wall ? "text-2xl" : "text-sm")}>{pet?.name ?? "—"}</div>
        <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5 text-ink-muted", wall ? "text-lg" : "text-2xs")}>
          <span className="inline-flex items-center gap-1 font-bold text-ink" data-tasktype={type}>
            {/* الرمز نفسه الذي يحمله صدر الصف بالورقة — لغة شكلٍ واحدة لا لغتان */}
            <span className={cn("shrink-0 font-black leading-none text-ink-muted", wall ? "text-xl" : "text-xs")} aria-label={tm.ar()}>{tm.glyph}</span>
            {tx.medication}
          </span>
          {tx.route && type === "drug" && (
            <span className="rounded bg-surface-2 px-1.5 py-px font-bold text-ink-muted">{routeShort(tx.route)}</span>
          )}
          {tx.amount?.trim() && <span className="font-semibold">{tx.amount}</span>}
          {tx.observations?.trim() && !wall && <span className="opacity-70">{tx.observations}</span>}
        </div>
        {status === "overdue" && (
          <div className={cn("mt-0.5 font-extrabold text-danger-600 dark:text-danger-300", wall ? "text-base" : "text-2xs")}>
            {lateLabel(late)}
          </div>
        )}
        {/* القيمة المقيسة — هي **حصيلة** المهمّة، فإخفاؤها يُفرغها من معناها */}
        {done && tx.result?.trim() && (
          <div className={cn("mt-0.5 font-black tabular-nums text-success-700 dark:text-success-300", wall ? "text-xl" : "text-xs")} data-taskresult>
            {tx.result}
          </div>
        )}
        {/* «فاتت ولها سبب» حالةٌ ثالثة: لا مُنجَزة ولا مُهمَلة — والسبب يُقرأ */}
        {!done && tx.missed_reason?.trim() && (
          <div className={cn("mt-0.5 inline-flex items-center gap-1 font-bold text-warn-700 dark:text-warn-300", wall ? "text-base" : "text-2xs")} data-taskmissed>
            <SkipForward size={wall ? 16 : 11} className="shrink-0" /> {tx.missed_reason}
          </div>
        )}
        {done && tx.administered_by && !wall && (
          <div className="mt-0.5 text-2xs font-semibold text-success-700 dark:text-success-300">أعطاها {tx.administered_by}</div>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className={cn("rounded-full px-2 py-0.5 font-extrabold", meta.chip, wall ? "text-base px-3 py-1" : "text-[10px]")}>
          {tx.time?.trim() ? timeLabel(tx.time) : meta.label}
        </span>

        {!done && asksValue && typing && (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setTyping(false); }}
              inputMode="decimal"
              placeholder={tm.valueHint?.()}
              data-taskvalueinput
              className={cn("rounded-xl border border-line bg-surface-1 px-2 text-center font-bold text-ink outline-none focus:border-brand-400",
                wall ? "h-11 w-28 text-lg" : "h-8 w-20 text-2xs")}
            />
            <button type="button" onClick={submit} disabled={!draft.trim()} data-tasksave
              className={cn("rounded-full bg-success-600 font-extrabold text-white shadow-soft transition hover:bg-success-700 active:scale-95 disabled:opacity-40",
                wall ? "px-4 py-2.5 text-lg" : "px-2.5 py-1.5 text-2xs")}>
              {t("board.saveValue", "حفظ")}
            </button>
          </div>
        )}

        {!done && asksValue && !typing && (
          <button type="button" onClick={() => { playTap(); setTyping(true); }} data-taskrecord
            className={cn("rounded-full bg-brand-600 font-extrabold text-white shadow-soft transition hover:bg-brand-700 active:scale-95",
              wall ? "px-5 py-2.5 text-lg" : "px-3 py-1.5 text-2xs")}>
            {t("board.recordValue", "سجّل القيمة")}
          </button>
        )}

        {!done && !asksValue && onGive && (
          <button
            type="button"
            onClick={() => { playDoseGiven(); onGive(tx); }}
            data-taskgive
            className={cn(
              "rounded-full bg-success-600 font-extrabold text-white shadow-soft transition hover:bg-success-700 active:scale-95",
              wall ? "px-5 py-2.5 text-lg" : "px-3 py-1.5 text-2xs",
            )}
          >
            {type === "drug" ? t("board.given", "أعطيت") : t("board.done", "تمّت")}
          </button>
        )}
        {done && <CheckCircle2 size={wall ? 28 : 18} className="text-success-600 dark:text-success-400" />}
      </div>
    </div>
  );
}

/**
 * TreatmentBoard — the hour-by-hour treatment whiteboard.
 *
 * The card view answers "who has doses today". This answers the question the
 * treatment room actually asks out loud: **what is due right now, and what did
 * we miss?** Every scheduled dose is its own task, across every in-patient,
 * ordered by lateness — with a wall mode for the screen on the treatment-room
 * wall.
 */
export function TreatmentBoard({
  treatments, pets, todayISO, onGive, onValue, wall, onToggleWall,
}: {
  treatments: TreatmentEntry[];
  pets: Record<string, Pet>;
  todayISO: string;
  onGive: (t: TreatmentEntry) => void;
  /** تسجيل مهمّةٍ بقيمة (حرارة، سوائل، تغذية). بدونه تُعرَض القيمة ولا تُدخَل. */
  onValue?: (t: TreatmentEntry, value: string) => void;
  wall: boolean;
  onToggleWall: () => void;
}) {
  const now = HHMM();

  const tasks = useMemo<BoardTask[]>(() => {
    // Today's doses plus anything still unadministered from earlier days — a dose
    // missed yesterday stays on the board until someone deals with it.
    const relevant = treatments.filter((t) => t.day === todayISO || (t.day < todayISO && !t.administered_at));
    return relevant
      .slice()
      .sort((a, b) => compareTasks(a, b, todayISO, now))
      .map((tx) => ({ tx, pet: pets[tx.pet_id], status: taskStatus(tx, todayISO, now), late: minutesLate(tx, todayISO, now) }));
  }, [treatments, pets, todayISO, now]);

  const overdue = tasks.filter((t) => t.status === "overdue");
  const due = tasks.filter((t) => t.status === "due");
  const upcoming = tasks.filter((t) => t.status === "upcoming");
  const given = tasks.filter((t) => t.status === "given");

  /** Upcoming doses grouped into their hour slots, so the day reads as a timeline. */
  const upcomingByHour = useMemo(() => {
    const m = new Map<string, BoardTask[]>();
    for (const t of upcoming) {
      const k = hourSlot(t.tx);
      const arr = m.get(k);
      if (arr) arr.push(t); else m.set(k, [t]);
    }
    return [...m.entries()].sort((a, b) => (a[0] || "99:99").localeCompare(b[0] || "99:99"));
  }, [upcoming]);

  const total = tasks.length;
  const doneCount = given.length;

  const Section = ({ title, icon: Icon, tone, items }: {
    title: string; icon: typeof Clock; tone: "danger" | "warn" | "muted" | "success"; items: BoardTask[];
  }) => {
    if (!items.length) return null;
    const toneClass = tone === "danger" ? "text-danger-600 dark:text-danger-300"
      : tone === "warn" ? "text-warn-600 dark:text-warn-300"
      : tone === "success" ? "text-success-600 dark:text-success-400"
      : "text-ink-muted";
    return (
      <section className="space-y-2">
        <div className={cn("flex items-center gap-1.5 font-extrabold", toneClass, wall ? "text-xl" : "text-2xs")}>
          <Icon size={wall ? 22 : 14} />
          {title}
          <span className={cn("rounded-full bg-surface-2 px-2 py-0.5 tabular-nums", wall ? "text-lg" : "text-[10px]")}>{formatNum(items.length)}</span>
        </div>
        <div className={cn("grid gap-2", wall ? "grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3" : "grid-cols-1 xl:grid-cols-2")}>
          {items.map((t) => <TaskCard key={t.tx.id} task={t} onGive={onGive} onValue={onValue} wall={wall} />)}
        </div>
      </section>
    );
  };

  const body = (
    <div className={cn("space-y-4", wall && "space-y-6")}>
      {/* Counters — the board's headline, readable across the room */}
      <div className={cn("grid gap-2", wall ? "grid-cols-3 gap-4" : "grid-cols-3")}>
        {[
          { label: "متأخّرة", n: overdue.length, cls: "border-danger-300 bg-danger-50 text-danger-700 dark:border-danger-500/40 dark:bg-danger-500/10 dark:text-danger-300" },
          { label: "مستحقّة الآن", n: due.length, cls: "border-warn-300 bg-warn-50 text-warn-700 dark:border-warn-500/40 dark:bg-warn-500/10 dark:text-warn-300" },
          { label: "تمّت اليوم", n: doneCount, cls: "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-300" },
        ].map((c) => (
          <div key={c.label} className={cn("rounded-2xl border p-3 text-center", c.cls, wall && "p-6")}>
            <div className={cn("font-black tabular-nums", wall ? "text-6xl" : "text-2xl")}>{formatNum(c.n)}</div>
            <div className={cn("font-extrabold", wall ? "text-xl" : "text-2xs")}>{c.label}</div>
          </div>
        ))}
      </div>

      {total === 0 ? (
        <div className={cn("rounded-2xl border border-line bg-surface-1 p-8 text-center text-ink-muted", wall && "p-16 text-2xl")}>
          <CheckCircle2 className="mx-auto mb-2 text-success-500" size={wall ? 64 : 32} />
          ما في جرعات مجدولة اليوم.
        </div>
      ) : (
        <>
          <Section title="متأخّرة — عالجها الآن" icon={AlertTriangle} tone="danger" items={overdue} />
          <Section title="مستحقّة الآن" icon={CircleDot} tone="warn" items={due} />
          {upcomingByHour.map(([slot, items]) => (
            <Section
              key={slot || "untimed"}
              title={slot ? `الساعة ${timeLabel(slot)}` : "بلا وقت محدّد"}
              icon={Clock}
              tone="muted"
              items={items}
            />
          ))}
          {!wall && <Section title="تمّت اليوم" icon={CheckCircle2} tone="success" items={given} />}
        </>
      )}
    </div>
  );

  if (!wall) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5 text-2xs font-extrabold text-ink-muted">
            <Clock size={14} /> لوحة العلاج — {formatNum(doneCount)}/{formatNum(total)} تمّت
          </div>
          <button type="button" onClick={onToggleWall}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-1 px-3 py-1.5 text-2xs font-bold text-ink transition hover:border-brand-300">
            <Maximize2 size={13} /> شاشة الغرفة
          </button>
        </div>
        {body}
      </div>
    );
  }

  // Wall mode — full-bleed, high contrast, for the treatment-room screen.
  return (
    // `bg-surface` is the page-canvas token (there is no surface-0) — without an
    // opaque fill the sidebar shows straight through the wall overlay.
    <div className="fixed inset-0 z-50 overflow-y-auto bg-surface p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-3xl font-black text-ink">لوحة العلاج</h1>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-surface-2 px-4 py-2 text-2xl font-black tabular-nums text-ink">{timeLabel(now)}</span>
          <button type="button" onClick={onToggleWall}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-1 px-4 py-2 text-base font-bold text-ink transition hover:border-brand-300">
            <Minimize2 size={18} /> خروج
          </button>
        </div>
      </div>
      {body}
    </div>
  );
}
