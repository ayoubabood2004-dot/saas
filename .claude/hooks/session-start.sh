#!/bin/bash
# ============================================================================
# تهيئة الجلسة — doctorVet
#
# الحاويةُ تُمسح بين الجلسات، فكلُّ ما لا يعيش بالمستودع يضيع: حزمُ npm،
# والأدواتُ المنزَّلة، والمهاراتُ المسجَّلة. وهذا السكربت يعيد بناءها في كل
# جلسةٍ جديدة، فيصير المستودعُ وحدَه مصدرَ الحقيقة.
#
# للتجربة يدوياً:  CLAUDE_CODE_REMOTE=true ./.claude/hooks/session-start.sh
# ============================================================================
set -uo pipefail

# محلياً الأدواتُ منصَّبةٌ أصلاً بجهاز المطوّر؛ هذا للجلسات البعيدة وحدها.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0

# ── ١) حزم المشروع — بدونها لا فحصٌ ولا بناء ─────────────────────────────
# install لا ci: الحاوية تُخزَّن بعد نجاح السكربت، وinstall يستفيد من الموجود.
if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then
  echo "[hook] npm install…"
  npm install --no-audit --no-fund || echo "[hook] تحذير: فشل npm install"
else
  echo "[hook] node_modules حاضرة — تخطّي"
fi

# ── ٢) graphify: خريطة معرفةٍ للمشروع ────────────────────────────────────
# النسخةُ مثبَّتة عن قصد: التثبيت يعني أن ما يُنزَّل بالجلسة الجاية هو نفسُ
# ما رُوجع اليوم. رفعُها قرارٌ يُتَّخذ بعد مراجعة، لا شيءٌ يجري من تلقائه.
GRAPHIFY_VERSION="0.9.53"
export PATH="$HOME/.local/bin:$PATH"

if command -v uv >/dev/null 2>&1; then
  if ! command -v graphify >/dev/null 2>&1; then
    echo "[hook] تنزيل graphify ${GRAPHIFY_VERSION}…"
    uv tool install "graphifyy[sql]==${GRAPHIFY_VERSION}" >/dev/null 2>&1 \
      || echo "[hook] تحذير: فشل تنزيل graphify"
  fi
  # التسجيل بمكان المستخدم لا بالمستودع: المستودع **عام**، ولا نضيف له
  # تعليماتِ طرفٍ ثالث. والتسجيل رخيصٌ فيُعاد بلا شرط.
  if command -v graphify >/dev/null 2>&1; then
    graphify install --platform claude >/dev/null 2>&1 \
      && echo "[hook] مهارة graphify مسجَّلة" \
      || echo "[hook] تحذير: فشل تسجيل مهارة graphify"
  fi
else
  echo "[hook] ماكو uv — تخطّي graphify"
fi

echo "[hook] تمّت التهيئة"
