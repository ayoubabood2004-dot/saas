import { useEffect, useState } from "react";
import { ShieldCheck, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isPlatformAdmin, platformContext, platformLeave, type PlatformContext } from "@/lib/platformAdmin";

/* ============================================================================
 * شريطُ «أنت داخل عيادة…» (0151).
 *
 * مشغّلُ المنصّة الداخلُ عيادةً يرى الواجهةَ كما يراها كادرُها تماماً — وهذا هو
 * الخطر: ينسى أين هو فيبيع أو يحذف بعيادةٍ غير المقصودة. فالشريطُ ثابتٌ فوق كل
 * شاشة ما دام داخلاً، يسمّي العيادةَ ويذكّر أن كلَّ حركةٍ تُسجَّل باسمه، وزرُّ
 * الخروج بجانبه. يُخفى لغير المشغّل ولمن لم يدخل.
 * ==========================================================================*/
export function PlatformBanner() {
  const { user } = useAuth();
  const admin = isPlatformAdmin(user?.email);
  const [ctx, setCtx] = useState<PlatformContext | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!admin) return;
    let alive = true;
    const load = () => platformContext().then((c) => { if (alive) setCtx(c); }).catch(() => { /* قبل الهجرة أو بلا شبكة — لا شريط */ });
    load();
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [admin]);

  if (!admin || !ctx?.acting) return null;

  const leave = async () => {
    setBusy(true);
    try {
      await platformLeave();
      // إعادةُ تحميلٍ كاملة: الجلسةُ والكاش كلُّها كانت باسم العيادة.
      window.location.assign("/platform");
    } catch { setBusy(false); }
  };

  return (
    <div className="no-print pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-3 pt-2" data-platform-banner>
      <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-warn-300 bg-warn-50 px-3 py-1.5 text-xs font-bold text-warn-800 shadow-raised dark:border-warn-500/40 dark:bg-warn-500/15 dark:text-warn-200">
        <ShieldCheck size={14} className="shrink-0" />
        <span className="truncate">أنت داخل عيادة «{ctx.clinicName ?? "بلا اسم"}» كمشغّل المنصّة — كل حركة تُسجَّل باسمك</span>
        <button type="button" onClick={() => void leave()} disabled={busy} data-platform-leave
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warn-600 px-2.5 py-1 text-white transition hover:bg-warn-700 disabled:opacity-60">
          <LogOut size={12} /> {busy ? "…" : "اخرج"}
        </button>
      </div>
    </div>
  );
}
