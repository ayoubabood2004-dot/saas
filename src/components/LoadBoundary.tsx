import { Component, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * حارسُ قطعةٍ كسولة **داخل** شاشة (نافذةُ «خصم على الدين» بالفاتورة، 0241).
 *
 * `page()` يرمي فشلَ تحميل القطعة لأقرب حارس — و`ErrorBoundary` العامّ شاشةٌ كاملة («حدث خطأ ما /
 * إعادة التحميل») تُسقط الفاتورةَ المفتوحةَ كلَّها لأن زرّاً واحداً فيها لم يصل. هنا يبقى الفشلُ بمكانه:
 * سطرٌ يقوله وزرُّ «أعد المحاولة» يطلب من المستعمل قطعةً جديدة (`onRetry`) — `lazy()` يخبّئ الوعدَ
 * المرفوض للأبد، فالمحاولةُ بنفس القطعة لا تحاول شيئاً. النصوصُ حارّة (errors، common).
 */
export class LoadBoundary extends Component<{ children: ReactNode; onRetry: () => void; scope?: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    // eslint-disable-next-line no-console
    console.error(`[LoadBoundary${this.props.scope ? `:${this.props.scope}` : ""}]`, error);
  }

  private retry = () => {
    this.props.onRetry();
    this.setState({ failed: false });
  };

  render(): ReactNode {
    return this.state.failed ? <LoadFailed onRetry={this.retry} /> : this.props.children;
  }
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-danger-200 bg-danger-50 p-2.5 text-xs dark:border-danger-500/30 dark:bg-danger-500/10" data-load-failed>
      <AlertTriangle size={14} className="shrink-0 text-danger-600" />
      <span className="min-w-0 flex-1 font-semibold text-danger-700 dark:text-danger-300">{t("errors.network")}</span>
      <Button size="sm" variant="secondary" leftIcon={<RotateCcw size={13} />} onClick={onRetry}>{t("common.retry")}</Button>
    </div>
  );
}
