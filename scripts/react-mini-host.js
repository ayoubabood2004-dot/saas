/* ============================================================================
 * مُرسِمٌ صغيرٌ بلا متصفّح — لفحص **سلوك** المكوّنات لا نصِّها.
 *
 * فحوصُ النصّ (regex على المصدر) تمرّ ولو كُسرت القاعدةُ داخل المكوّن: «تغييرُ الشكل يمسح الرقم»
 * كُسر بأربع طفراتٍ بـDosePicker وDrugCard وFlowsheet والفحوصُ خضراء. فهنا يُرسم المكوّنُ الحقيقيّ
 * بـreact-reconciler (موجودٌ بالاعتماديات) على شجرةٍ من كائنات {type, props, children}: الضغطةُ نداءُ
 * `props.onClick()` نفسِه، والحالُ يتغيّر كما بالمتصفّح (الجذرُ legacy ⇒ تحديثٌ متزامن).
 * يُحزَم مع المكوّن بـesbuild (`react-mini.mjs`) فيتشاركان نسخةَ React نفسها.
 * ==========================================================================*/
import Reconciler from "react-reconciler";
import { DefaultEventPriority } from "react-reconciler/constants.js";

const detach = (p, c) => { const i = p.children.indexOf(c); if (i >= 0) p.children.splice(i, 1); };
const host = {
  supportsMutation: true, supportsPersistence: false, supportsHydration: false, isPrimaryRenderer: true,
  createInstance: (type, props) => ({ type, props, children: [], parent: null }),
  createTextInstance: (text) => ({ type: "#text", text, props: {}, children: [], parent: null }),
  appendInitialChild: (p, c) => { c.parent = p; p.children.push(c); },
  appendChild: (p, c) => { detach(p, c); c.parent = p; p.children.push(c); },
  appendChildToContainer: (p, c) => { detach(p, c); c.parent = p; p.children.push(c); },
  insertBefore: (p, c, b) => { detach(p, c); c.parent = p; p.children.splice(Math.max(0, p.children.indexOf(b)), 0, c); },
  insertInContainerBefore: (p, c, b) => { detach(p, c); c.parent = p; p.children.splice(Math.max(0, p.children.indexOf(b)), 0, c); },
  removeChild: (p, c) => detach(p, c),
  removeChildFromContainer: (p, c) => detach(p, c),
  finalizeInitialChildren: () => false,
  prepareUpdate: () => true,
  commitUpdate: (inst, _payload, _type, _old, next) => { inst.props = next; },
  commitTextUpdate: (inst, _old, next) => { inst.text = next; },
  commitMount: () => {},
  resetTextContent: () => {},
  shouldSetTextContent: () => false,
  getRootHostContext: () => ({}),
  getChildHostContext: (c) => c,
  getPublicInstance: (i) => i,
  prepareForCommit: () => null,
  resetAfterCommit: () => {},
  preparePortalMount: () => {},
  scheduleTimeout: setTimeout, cancelTimeout: clearTimeout, noTimeout: -1,
  supportsMicrotasks: true, scheduleMicrotask: queueMicrotask,
  getCurrentEventPriority: () => DefaultEventPriority,
  getInstanceFromNode: () => null, beforeActiveInstanceBlur: () => {}, afterActiveInstanceBlur: () => {},
  prepareScopeUpdate: () => {}, getInstanceFromScope: () => null, detachDeletedInstance: () => {},
  clearContainer: (c) => { c.children = []; },
  hideInstance: () => {}, hideTextInstance: () => {}, unhideInstance: () => {}, unhideTextInstance: () => {},
};

const R = Reconciler(host);

/** يرسم العنصر ويرجع أدواتِ القراءة والضغط. */
export function mount(element) {
  const container = { type: "#root", props: {}, children: [], parent: null };
  const errors = [];
  const root = R.createContainer(container, 0, null, false, null, "", (e) => errors.push(e), null);
  R.updateContainer(element, root, null, null);
  const all = () => { const out = []; const walk = (n) => { out.push(n); n.children.forEach(walk); }; container.children.forEach(walk); return out; };
  const text = (n = container) => (n.type === "#text" ? n.text : n.children.map((c) => text(c)).join(""));
  /** عقدةٌ بخاصّية data-… (القيمةُ اختيارية). */
  const find = (attr, value) => all().find((n) => n.props && attr in n.props && (value === undefined || String(n.props[attr]) === String(value))) ?? null;
  const findAll = (attr) => all().filter((n) => n.props && attr in n.props);
  const click = (n) => { if (!n) throw new Error("click: لا عقدة"); if (n.props.disabled) throw new Error("click: الزرّ مقفول"); n.props.onClick?.({ preventDefault() {}, stopPropagation() {} }); };
  /** الأثرُ المؤجَّل (useEffect) ونتائجُ الوعود. */
  const settle = async () => { for (let i = 0; i < 5; i++) { R.flushPassiveEffects(); await new Promise((r) => setTimeout(r, 0)); } R.flushPassiveEffects(); };
  return { container, all, text, find, findAll, click, settle, errors, unmount: () => R.updateContainer(null, root, null, null) };
}
