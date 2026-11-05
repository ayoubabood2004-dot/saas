/* ============================================================================
 * راجيتةُ العيادة (0261) — حفظُ ما انطبع، ونوافذُ الطباعة: وحدةٌ صِرفة (بلا React ولا نصوص ولا repo) — rx-pad-test يفحصها
 * بسلوكها (نوافذُ ورسائلُ وإدخالٌ مزيَّف)، لا بنصّها. ثلاثُ جولاتِ تدقيقٍ عدائيّ أمسكت هنا عيباً كلَّ مرّة، فصار منطقُها وحدةً تُفحص.
 *
 *  • لقطةٌ واحدة لكلّ مسودّة (بصمتُها rxDraftKey) **بمعرّفٍ واحد** من أوّل طباعة: طباعتُها ثانيةً قبل أن تقرّر نافذتُها الأولى
 *    لا تختم معرّفاً ثانياً — كانت كلُّ ضغطةٍ لقطةً جديدة، فنافذتان لمسودّةٍ واحدة تكتبان سجلّين لا يُحذفان. وإدخالان بالمعرّف
 *    نفسِه يلتقيان عند 23505 فيُقرأ الأوّل (rxApi).
 *  • المحفوظُ **مجموعةُ بصمات** لا «آخرُ بصمة»: نافذةٌ قديمة تقرّر متأخّرةً لا تُرجع «انطبعت» عن مسودّةٍ حُفظت بعدها.
 *  • الطابورُ بالترتيب ويقف عند أوّل فشل (اللقطةُ تبقى لـ«احفظها بالسجل»)، ونداءٌ أثناء جولةٍ تلحقه الجولةُ نفسُها.
 *  • نافذةٌ تقرّر (المعاينةُ لم تقس هذا المستند): لا حفظَ حتى تقول «طبعتُ»، والنسخةُ الجديدة **ممسوكةٌ** من الضغطة حتى يستقرّ
 *    الحفظ، أو تقول «فائض»، أو تُغلق، أو السقف — تحميلٌ بنصّها (تبديلُ صفحةٍ ونسخةٌ تنتظر) كان يطبع الورقةَ بلا سجلٍّ ولا كلمة.
 *  • والنوافذُ على مستوى الوحدة لا المكوّن: حفظٌ ينتظر «طبعتُ» يكمل ولو أُغلقت الشاشة. ونافذةٌ رُئيت مغلقة تُمهَل قبل «ذهبت»:
 *    رسالتُها «طبعتُ» قد تكون بالطابور خلف حوار الطباعة.
 * ========================================================================= */

export interface RxSnap<I> { key: string; input: I }
export interface PrintHandlers { onPrint?: () => void; onOverflow: () => void; onGone?: () => void }

/** ما يلزم من النافذة الأمّ: رسائلُ ومؤقّت (بالمتصفّح `browserWatchEnv`، وبالفحص مزيَّف). */
export interface WatchEnv {
  listen(f: (source: unknown, data: unknown) => void): void;
  every(f: () => void, ms: number): unknown;
  stop(id: unknown): void;
}
export const browserWatchEnv = (): WatchEnv => ({
  listen: (f) => window.addEventListener("message", (e) => f(e.source, e.data)),
  every: (f, ms) => window.setInterval(f, ms),
  stop: (id) => window.clearInterval(id as number),
});

/** سجلُّ نوافذ الطباعة ورسائلها (PRINT_JS: «print» قبل الطباعة، «overflow» بدلها). مغلقةٌ بلا كلمة ⇒ `onGone` بعد مهلة. */
export function createPrintWatch(env: WatchEnv, tickMs = 1000, graceTicks = 2) {
  const watching = new Map<unknown, PrintHandlers>();
  let listening = false;
  return (w: { readonly closed: boolean }, h: PrintHandlers): void => {
    watching.set(w, h);
    if (!listening) {
      listening = true;
      env.listen((source, data) => {
        const kind = (data as { rx?: unknown } | null)?.rx;
        const got = source ? watching.get(source) : undefined;
        if (!got || (kind !== "print" && kind !== "overflow")) return;
        watching.delete(source);
        if (kind === "print") got.onPrint?.();
        else got.onOverflow();
      });
    }
    let closedTicks = 0;
    const iv = env.every(() => {
      if (watching.get(w) !== h) { env.stop(iv); return; }
      if (!w.closed || ++closedTicks <= graceTicks) return;
      watching.delete(w);
      env.stop(iv);
      h.onGone?.();
    }, tickMs);
  };
}

export interface RxSaverDeps<I, R> {
  add: (input: I) => Promise<R>;
  /** النسخةُ الجديدة لا تنزل (holdUpdates) — يرجع المُفلت. */
  hold: (ms: number) => () => void;
  onSaved: (snap: RxSnap<I>, rec: R) => void;
  onFail: (snap: RxSnap<I>, e: unknown) => void;
  onChange: () => void;
}
/** سقفُ إمساك نافذةٍ تقرّر: تقرّر خلال ١٥ ثانية (القسريُّ ٩ + مهلةُ التحميل ٣، وأمانُ ١٢)، والباقي للحفظ نفسِه. */
export const RX_WAIT_HOLD_MS = 45_000;

export interface RxSaver<I, R> {
  /** يحدّثها المكوّنُ كلَّ رسمة (الترجمةُ والتوستُ والقائمة)، والحفظُ الجاري يقرأ أحدثَها. */
  deps: RxSaverDeps<I, R>;
  /** لقطةُ هذه المسودّة: الموجودةُ إن طُبعت قبلُ (بمعرّفها)، وإلا جديدةٌ من `make`. */
  snapFor(key: string, make: () => I): RxSnap<I>;
  /** يحفظ اللقطةَ بدورها (ما لم تُحفظ أو تنتظر) — يرجع حين تستقرّ الجولة. */
  enqueue(snap: RxSnap<I>): Promise<void>;
  flush(): Promise<void>;
  /** معالجاتُ نافذةٍ تقرّر عن اللقطة (لـwatch): «طبعتُ» ⇒ تُحفظ، والإمساكُ من الآن حتى يستقرّ ما بعدها. */
  deferTo(snap: RxSnap<I>, onOverflow: () => void): PrintHandlers;
  isSaved(key: string): boolean;
  isPending(key: string): boolean;
  isWaiting(key: string): boolean;
  readonly pendingCount: number;
  readonly busy: boolean;
  /** آخرُ محاولةٍ فشلت (واللقطةُ أوّلُ الطابور). */
  readonly failed: boolean;
}

export function createRxSaver<I, R>(deps: RxSaverDeps<I, R>): RxSaver<I, R> {
  const snaps = new Map<string, RxSnap<I>>();
  const saved = new Set<string>();
  const waiting = new Map<string, number>();
  let pending: RxSnap<I>[] = [];
  let run: Promise<void> | null = null;
  let failed = false;
  const s: RxSaver<I, R> = {
    deps,
    snapFor(key, make) {
      let x = snaps.get(key);
      if (!x) { x = { key, input: make() }; snaps.set(key, x); }
      return x;
    },
    flush() {
      if (run) return run;
      if (!pending.length) return Promise.resolve();
      run = (async () => {
        /* يتنازل أوّلاً: الإسنادُ أعلاه يسبق كلَّ شيء، و`finally` بنفس لحظة آخر فحصٍ للطابور — لا لقطةَ تُضاف بينهما فتبقى. */
        await null;
        try {
          while (pending.length) {
            const snap = pending[0];
            let rec: R;
            try {
              rec = await s.deps.add(snap.input);
            } catch (e) {
              failed = true;
              s.deps.onChange();
              s.deps.onFail(snap, e);
              return;
            }
            pending = pending.filter((x) => x !== snap);
            saved.add(snap.key);
            failed = false;
            s.deps.onChange();
            s.deps.onSaved(snap, rec);
          }
        } finally {
          run = null;
          s.deps.onChange();
        }
      })();
      s.deps.onChange();
      return run;
    },
    enqueue(snap) {
      if (!saved.has(snap.key) && !pending.some((p) => p.key === snap.key)) {
        pending = [...pending, snap];
        s.deps.onChange();
      }
      return s.flush();
    },
    deferTo(snap, onOverflow) {
      const release = s.deps.hold(RX_WAIT_HOLD_MS);
      waiting.set(snap.key, (waiting.get(snap.key) ?? 0) + 1);
      s.deps.onChange();
      let open = true;
      const settle = () => {
        if (!open) return false;
        open = false;
        const n = (waiting.get(snap.key) ?? 1) - 1;
        if (n > 0) waiting.set(snap.key, n); else waiting.delete(snap.key);
        s.deps.onChange();
        return true;
      };
      return {
        onPrint: () => { if (settle()) void s.enqueue(snap).finally(release); },
        onOverflow: () => { if (settle()) { release(); onOverflow(); } },
        onGone: () => { if (settle()) release(); },
      };
    },
    isSaved: (key) => saved.has(key),
    isPending: (key) => pending.some((p) => p.key === key),
    isWaiting: (key) => waiting.has(key),
    get pendingCount() { return pending.length; },
    get busy() { return run !== null; },
    get failed() { return failed; },
  };
  return s;
}
