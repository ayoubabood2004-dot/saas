-- ============================================================================
-- ٠٢٣٦ — صورُ المنتجات لا تُحذف ولا يُكتب فوقها (O4، ١٢/١٠) — سدُّ الخادم
--
-- ── الجذر ────────────────────────────────────────────────────────────────
-- قرارُ المالك: «خلّي الصور مثل ما هي — لا تشيل ولا تحذف صورة». والواجهةُ كانت تحذف من
-- ثلاثة أبواب: استبدالُ صورة المنتج يحذف القديمةَ حين لا يشير إليها صفّ (deleteProductImage)،
-- واستبدالُ الشعار يحذف القديم (deleteClinicLogo)، وحذفُ صورة المكتبة يحذف ملفَّها. والحكمُ
-- «لا يشير إليها صفّ» يُسأل لحظةً واحدة — صورةٌ بسلّة المحذوفات أو بنسخةٍ قديمةٍ من الواجهة
-- تُكسر بلا كلمة. الأبوابُ الثلاثةُ أُزيلت من الشِفرة، وهذه الهجرةُ السدُّ إن بقي بابٌ
-- بنسخةٍ قديمةٍ مخبَّأةٍ بجهاز: سياستان **مقيِّدتان** على الدلو كلّه (المكتبةُ ضمناً)
-- تمنعان الحذفَ والكتابةَ فوق ملفّ. الرفعُ بمسارٍ جديدٍ فريد (upsert:false) لا يمسّه هذا.
--
-- ── الأثر ────────────────────────────────────────────────────────────────
-- نداءُ حذفٍ من نسخةٍ قديمة يصير لا شيئاً (سياسةٌ ترفض بصمت عند خدمة الملفّات)، والمساحةُ
-- تكبر ولا تنقص (٤٩ ملفّاً، ٥٫٧ ميغا اليوم). لا ملفَّ يُعاد ترميزه ولا يُنقل.
--
-- **بلا هدم**: تُنشئ ما ينقص فقط (أدواتُ النشر تحبس جملَ الهدم). والحزمةُ بلا مخطّط storage،
-- فالتحقّقُ بعد النشر قراءةٌ من pg_policies + **رفعُ صورةٍ واحدة يجريه المالك** بعيادته.
-- إن فشل الرفعُ: drop policy product_images_no_overwrite on storage.objects; وأبلِغ.
-- تراجع: drop policy product_images_keep_forever on storage.objects; وكذلك الثانية.
-- تُطبَّق بعد 0235. وتُعاد بلا أثرٍ ثانٍ.
-- ============================================================================

do $$
begin
  if to_regclass('storage.objects') is not null then
    if not exists (select 1 from pg_policies f
                    where f.schemaname = 'storage' and f.tablename = 'objects' and f.policyname = 'product_images_keep_forever') then
      create policy product_images_keep_forever on storage.objects as restrictive for delete to authenticated
        using (bucket_id <> 'product-images');
    end if;
    if not exists (select 1 from pg_policies f
                    where f.schemaname = 'storage' and f.tablename = 'objects' and f.policyname = 'product_images_no_overwrite') then
      create policy product_images_no_overwrite on storage.objects as restrictive for update to authenticated
        using (bucket_id <> 'product-images')
        with check (bucket_id <> 'product-images');
    end if;
  end if;
end $$;
