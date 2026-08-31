-- ============================================================================
-- doctorVet — 0139: المُدقِّق يكتب ما تغيّر، لا صورةً عن الصفّ كلّه
--
-- ── المشكلة بجملة ────────────────────────────────────────────────────────
-- كل حدث بالعيادة يُخزَّن اليوم **لقطةً كاملة** للصفّ: بيعةٌ واحدة تكتب لقطة
-- للفاتورة، ولقطة لكل بند، ولقطة لكل منتجٍ نقص مخزونه. اثنان وعشرون حقلاً
-- بالسطر الواحد، ومعدّلُه ١٠١١ بايت. والنتيجة ٩٦٣ سطراً باليوم من ٢٩ عيادة،
-- أي نحو ٢٧٣ ميغا عند الاستقرار — من باقةٍ سقفُها ٥٠٠.
--
-- وأكثرُ ذلك تكرارٌ محض: سطرٌ يقول «انضافت فاتورة» بينما الفاتورة نفسها
-- محفوظة بجدولها للأبد بتاريخها ومَن أنشأها.
--
-- ── ولماذا لا نكتفي بحذف الإضافات ────────────────────────────────────────
-- كان هذا أوّل ما خطر، وهو خطأ. المُدقِّق يحفظ عند التعديل **القيمة الجديدة**
-- لا القديمة (`to_jsonb(NEW)`). فمعرفةُ «كم كانت الفاتورة قبل التعديل» تأتي
-- من اللقطة **السابقة** — لقطةِ الإضافة. فحذفُ الإضافات يترك سطراً يقول
-- «انعدّلت» بقيمتها الحالية، ولا يقول من أي شيء. سطرٌ بلا فائدة.
--
-- فالعلاج ليس حذفَ نصف السلسلة، بل جعلَ سطر التعديل **مكتفياً بنفسه**.
--
-- ── ولماذا لا نكتفي بالفرق وحده ──────────────────────────────────────────
-- وهذا ثاني ما خطر، وهو خطأ كذلك. صفحةُ «سجل الحركات» تبني جملتها من حقولٍ
-- بعينها: اسمُ المنتج، ومجموعُ الفاتورة واسمُ زبونها، ودواءُ الجرعة، وحيوانُ
-- الحالة. وتغييرُ مخزونٍ فرقُه `{stock: [5,3]}` وحده — بلا اسم — يعطي
-- «عدّل المنتج ...» بفراغ. فالفرق يقول **ما جرى**، ولا يقول **على مَن**.
--
-- ── فالتصميم: تعريفٌ + فرق ───────────────────────────────────────────────
--   * حقولٌ تعريفية (KEEP): ما تقرأه الشاشة لتسمّي الحدث. قائمةٌ مشتقّة من
--     الشاشة نفسها لا من التخمين.
--   * و`__changed`: كل حقلٍ تغيّر فعلاً، بصيغة `[كان, صار]` — **ولو لم يكن
--     بالقائمة**. فالقائمة تحكم السياق وحده، والفرق يحكم الجوهر: ما من
--     تغييرٍ يمرّ بلا تسجيل.
--   * والحذف يبقى لقطةً كاملة: الصفّ اختفى من جدوله، فهذه نسختُه الوحيدة.
--
-- ── وثغرةٌ قائمة تُسدّ معها ───────────────────────────────────────────────
-- هجرة 0097 كانت تستبدل أي قيمةٍ تتجاوز ٢٠٤٨ حرفاً بعلامةٍ مختصرة، كي لا
-- ينسخ شعارُ عيادةٍ بصيغة data-URL نفسه بكل سطر تدقيق. وقراءةُ الدالّة الحيّة
-- من الإنتاج تُظهر أنها نسخةُ 0018 بلا ذلك التقليم — أي أن 0097 لم تنزل قطّ.
-- فنعيده هنا.
--
-- ── وفخٌّ بالتقليم انتبهنا له قبل الكتابة ─────────────────────────────────
-- لو قلّمنا القيم **قبل** المقارنة، لصار شعاران مختلفان بنفس الطول علامةً
-- واحدة (`[large:5000]`)، فيبدوان غيرَ متغيّرين ولا يُسجَّل تغييرُهما أبداً —
-- وهو بالضبط نوعُ الصمت الذي نحاربه. فالمقارنة على **الأصل**، والتخزين من
-- **المقلَّم**. ولهذا نحتفظ بالنسختين داخل الدالّة.
--
-- ── وما لا يتغيّر ────────────────────────────────────────────────────────
-- الأسطر القائمة **لا تُمَسّ**: تبقى لقطاتٍ كاملة كما هي، والشاشة تقرأ منها
-- نفس الحقول فتعرضها كما تعرضها اليوم. الشكل الجديد يبدأ من لحظة النزول.
-- ولا صفَّ يُحذف ولا جدولَ يُعاد بناؤه.
--
-- والدالّة تبقى «لا تُفشل العملية أبداً»: كل شيءٍ داخل كتلةٍ تبلع أي خطأ —
-- تدقيقٌ يتعطّل يجب ألّا يمنع بيعةً.
--
-- تراجع: أعد تعريف audit_change من 0018 (أو 0097).
-- ============================================================================

create or replace function audit_change() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_new_raw jsonb;   -- كما هي — عليها تقع المقارنة
  v_old_raw jsonb;
  v_new     jsonb;   -- مقلَّمة — منها يقع التخزين
  v_old     jsonb;
  v_src     jsonb;
  v_out     jsonb;
  v_chg     jsonb;
  -- الحقول التي تسمّي الحدث بالشاشة. مشتقّةٌ من `render()` بـActivityLog.tsx
  -- ومن `actorOf()` — لا من التخمين. زيادتُها رخيصة، ونقصُها يُفرِغ جملة.
  keep constant text[] := array[
    'name','pet_name','pet_id','kind','outcome','status','medication','amount',
    'administered_at','vaccine','doctor_name','doctor','weight_kg','total',
    'customer_name','stock','qty','line_total','title','text','owner_name',
    'reminder_type','label','staff_id'
  ];
begin
  begin
    v_new_raw := case when TG_OP = 'DELETE' then null else to_jsonb(NEW) end;
    v_old_raw := case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end;

    -- التقليم: قيمةٌ ضخمة تُستبدل بعلامةٍ تقول «تغيّر عمودٌ كبير» بلا حمله.
    -- والعلامة محايدة اللغة: قيمةٌ مخزّنة لا جملةٌ تُقرأ.
    if v_new_raw is not null then
      select coalesce(jsonb_object_agg(e.key,
               case when length(e.value::text) > 2048
                    then to_jsonb('[large:' || length(e.value::text) || ']')
                    else e.value end), '{}'::jsonb)
        into v_new from jsonb_each(v_new_raw) as e(key, value);
    end if;
    if v_old_raw is not null then
      select coalesce(jsonb_object_agg(e.key,
               case when length(e.value::text) > 2048
                    then to_jsonb('[large:' || length(e.value::text) || ']')
                    else e.value end), '{}'::jsonb)
        into v_old from jsonb_each(v_old_raw) as e(key, value);
    end if;

    v_src := coalesce(v_new, v_old);

    if TG_OP = 'DELETE' then
      -- الصفّ اختفى من جدوله — نحتفظ به كاملاً (مقلَّماً).
      v_out := v_old;
    else
      -- إضافةٌ أو تعديل: السياق وحده. الصفّ نفسه بجدوله.
      select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
        into v_out
        from jsonb_each(v_src) as e(key, value)
       where e.key = any (keep) and e.value <> 'null'::jsonb;
    end if;

    if TG_OP = 'UPDATE' then
      -- الجوهر: كل حقلٍ تغيّر، ولو لم يكن بالقائمة. `[كان, صار]`.
      -- والمقارنة على الأصل (‎_raw‎) كي لا يخفي التقليمُ تغييراً.
      select jsonb_object_agg(k, jsonb_build_array(v_old -> k, v_new -> k))
        into v_chg
        from jsonb_object_keys(v_new_raw) as k
       where (v_new_raw -> k) is distinct from (v_old_raw -> k);
      if v_chg is not null then
        v_out := v_out || jsonb_build_object('__changed', v_chg);
      end if;
    end if;

    insert into audit_log (clinic_id, actor, action, entity, entity_id, details)
    values (
      coalesce(nullif(v_src->>'clinic_id','')::uuid, auth_clinic()),
      auth.uid(), TG_OP, TG_TABLE_NAME, (v_src->>'id'), v_out
    );
  exception when others then
    null; -- التدقيق لا يجوز أن يمنع العملية الأصلية أبداً
  end;
  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end $function$;

revoke execute on function public.audit_change() from anon, authenticated;
