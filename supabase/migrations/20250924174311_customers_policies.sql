-- Enable RLS and add permissive SELECT for authenticated users on public.customers
alter table if exists public.customers enable row level security;

drop policy if exists "Customers select for authenticated" on public.customers;
create policy "Customers select for authenticated" on public.customers
for select using ( auth.role() = 'authenticated' );


