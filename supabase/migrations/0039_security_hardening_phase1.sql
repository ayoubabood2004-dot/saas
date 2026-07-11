-- 0039 · Security hardening — Phase 1 (non-breaking; medical-media stays PUBLIC).
-- Closes the severe storage holes (cross-tenant write/delete/enumerate) without
-- touching how the app reads images. Phase 2 (app signed-URLs) + Phase 3
-- (privatise bucket) follow. Applied to prod via Supabase on 2026-07.

-- Access helper: can the caller see media for this pet? SECURITY DEFINER so it
-- reads all pets then applies its own auth check (same rule as media_items RLS).
create or replace function public.can_access_pet_media(p_folder text)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from pets p
    where p.id::text = p_folder
      and ( p.clinic_id = auth_clinic()
         or p.owner_id  = auth.uid()
         or (p.clinic_id is null and p.shared_with_clinic is true and is_clinic_staff()) )
  );
$$;
revoke execute on function public.can_access_pet_media(text) from anon;

-- Storage limits (bucket kept public this phase; privatised in 0041 once the app serves signed URLs).
update storage.buckets
set file_size_limit    = 15728640,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
where id = 'medical-media';

-- Replace the wide-open storage.objects policies with pet-scoped ones.
drop policy if exists medical_media_read   on storage.objects;
drop policy if exists medical_media_insert on storage.objects;
drop policy if exists medical_media_update on storage.objects;
drop policy if exists medical_media_delete on storage.objects;

create policy medical_media_read on storage.objects
  for select to authenticated
  using (bucket_id = 'medical-media' and public.can_access_pet_media((storage.foldername(name))[1]));

create policy medical_media_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'medical-media' and public.can_access_pet_media((storage.foldername(name))[1]));

create policy medical_media_update on storage.objects
  for update to authenticated
  using      (bucket_id = 'medical-media' and public.can_access_pet_media((storage.foldername(name))[1]))
  with check (bucket_id = 'medical-media' and public.can_access_pet_media((storage.foldername(name))[1]));

create policy medical_media_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'medical-media' and public.can_access_pet_media((storage.foldername(name))[1]));

-- Internal trigger functions are not meant to be callable as REST RPCs.
revoke execute on function public.audit_change()      from anon, authenticated;
revoke execute on function public.handle_new_user()   from anon, authenticated;
revoke execute on function public.on_invite_created() from anon, authenticated;
revoke execute on function public.on_invite_revoked() from anon, authenticated;
revoke execute on function public.rls_auto_enable()   from anon, authenticated;

-- delete_invoice: managers only (matches the app's "admins only" delete rule).
create or replace function public.delete_invoice(p_invoice uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_clinic uuid := auth_clinic();
  v_status text;
  r record;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if auth_role() <> 'manager' then raise exception 'forbidden: managers only'; end if;
  select status into v_status from invoices where id = p_invoice and clinic_id = v_clinic;
  if not found then raise exception 'invoice not found'; end if;

  if v_status is distinct from 'refunded' then
    for r in select product_id, qty, stock_qty from invoice_items where invoice_id = p_invoice and clinic_id = v_clinic loop
      if r.product_id is not null then
        update products set stock = stock + coalesce(r.stock_qty, r.qty) where id = r.product_id and clinic_id = v_clinic;
      end if;
    end loop;
  end if;

  delete from invoices where id = p_invoice and clinic_id = v_clinic;
end $function$;
