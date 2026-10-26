-- ============================================================================
-- ٠٢٥١ — برهانُ 0128 يرجع صفراً: أربعُ سياساتٍ غُيّرت قصداً قبل وجود الدفتر
--
-- `verify_rls_equivalence()` تقارن كلَّ سياسةٍ حيّة بنسختها يومَ لفِّ 0128
-- (`rls_policy_backup`)، وتستثني ما دُوِّن بـ`rls_policy_superseded` (0249) وحده.
-- قيست على الإنتاج بعد 0249 (٢٦/١٠): ١٠٩ سياسة، **ضاعت ٢ وتغيّر شرطُ ٢** —
-- وكلُّها تصليحاتٌ مقصودة من هجراتٍ سبقت الدفتر فلم تجد أين تدوّن:
--
--   delivery_orders.delivery_orders_write  (0069، for all) ضاعت بـ0157:
--     فُكّت إلى إدراجٍ وحذفٍ وتعديل، والتعديلُ يجمّد ختمَ «محصَّل» والحاملَ على طلب
--     الشركة لغير المدير — كان أيُّ موظّفٍ يمحو ذمّةَ شركةٍ بطلبٍ واحد.
--   clinic_prefs.clinic_prefs_clinic_all   (for all) ضاعت بـ0161:
--     فُكّت إلى أربعٍ بنفس المدى، ومفتاحُ مشاركة الكتالوج للمدير وحده.
--   invoices.invoices_update               (0051) تغيّر شرطُها بـ0162:
--   profiles.profiles_self_update          (0049) تغيّر شرطُها بـ0162:
--     `with check` يقرأ جدولَه فيرفضه بوستغريس عند إعادة الكتابة (42P17) — كلُّ
--     تعديلِ فاتورةٍ أو ملفٍّ كان 500. صارتا شرطَ ملكيّةٍ وحده، والتجميدُ بمحفّز.
--
-- وبرهانٌ لا يرجع صفراً ليس برهاناً: أربعةٌ ثابتةٌ «مفسَّرةٌ بالكلام» تُخفي الخامسةَ
-- يومَ تقع، لأن أحداً لن يفرّق ٤ من ٥. فتُدوَّن الأربعُ بالدفتر كما دوّنت 0249 ما
-- غيّرته: نصُّها قبل التغيير منقولٌ من نسخة 0128 نفسها (لا يُكتب بيد)، والهجرةُ التي
-- غيّرتها، وسببُها.
--
-- وتُدوَّن **ما دام تختلف فعلاً** (ضاعت، أو تغيّر شرطُها أو دورُها عن النسخة) — فإن
-- أُعيدت سياسةٌ يوماً كما كانت لا يُستثنى شيءٌ بلا داعٍ. ولا تُمسّ سياسةٌ ولا نسخةُ
-- الأمان. قاعدةٌ بلا نسخة 0128 لهذه الأسماء (قالبُ الحزمة) لا يُدوَّن فيها شيء.
-- تُعاد بلا أثرٍ ثانٍ (on conflict do nothing). تراجع:
--   delete from public.rls_policy_superseded
--    where policyname in ('delivery_orders_write','clinic_prefs_clinic_all','invoices_update','profiles_self_update')
--      and migration in ('0157','0161','0162');
-- ============================================================================

do $$
declare r record;
begin
  for r in
    select * from (values
      ('delivery_orders', 'delivery_orders_write', '0157',
       'فُكّت إلى delivery_orders_insert/_delete/_update؛ التعديلُ يجمّد collected_at وcourier_id على طلب الشركة لغير المدير (كان أيُّ موظّفٍ يمحو ذمّةَ شركة). دُوِّنت بـ0251'),
      ('clinic_prefs', 'clinic_prefs_clinic_all', '0161',
       'فُكّت إلى clinic_prefs_select/_insert/_update/_delete بنفس المدى، ومفتاحُ catalog_share للمدير وحده. دُوِّنت بـ0251'),
      ('invoices', 'invoices_update', '0162',
       'with check كان يقرأ جدولَه (42P17 ⇒ كلُّ تعديلِ فاتورةٍ 500)؛ صارت شرطَ ملكيّةٍ وحده وتجميدُ المال بمحفّز invoices_guard_money. دُوِّنت بـ0251'),
      ('profiles', 'profiles_self_update', '0162',
       'with check كان يقرأ جدولَه (42P17 ⇒ تعديلُ الملفّ الشخصيّ يفشل)؛ صارت شرطَ ملكيّةٍ وحده وتجميدُ الهويّة بمحفّز profiles_guard_identity. دُوِّنت بـ0251')
    ) as v(tablename, policyname, migration, why)
  loop
    insert into public.rls_policy_superseded (tablename, policyname, migration, why, cmd, qual, with_check)
    select b.tablename, b.policyname, r.migration, r.why, b.cmd, b.qual, b.with_check
      from public.rls_policy_backup b
     where b.migration = '0128' and b.schemaname = 'public'
       and b.tablename = r.tablename and b.policyname = r.policyname
       -- تختلف اليوم فعلاً — بنفس موازين verify_rls_equivalence (اللفُّ لا يُحسب تغييراً).
       and not exists (
         select 1 from pg_policies p
          where p.schemaname = 'public' and p.tablename = r.tablename and p.policyname = r.policyname
            and public._wrap_auth_calls(b.qual)       is not distinct from public._wrap_auth_calls(p.qual)
            and public._wrap_auth_calls(b.with_check) is not distinct from public._wrap_auth_calls(p.with_check)
            and p.cmd           is not distinct from b.cmd
            and p.roles::text   is not distinct from b.roles::text
            and p.permissive    is not distinct from b.permissive)
     order by b.taken_at asc
     limit 1
    on conflict (schemaname, tablename, policyname) do nothing;
  end loop;
end $$;
