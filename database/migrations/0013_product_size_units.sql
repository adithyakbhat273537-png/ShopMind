-- Add product specification and stock-count units without rewriting legacy rows.
alter table public.products
  add column if not exists size text,
  add column if not exists unit_of_measure text not null default 'piece';

update public.products
set unit_of_measure = 'piece'
where unit_of_measure is null or btrim(unit_of_measure) = '';

alter table public.products
  alter column unit_of_measure set default 'piece',
  alter column unit_of_measure set not null;

alter table public.products
  drop constraint if exists products_unit_of_measure_check;

alter table public.products
  add constraint products_unit_of_measure_check
  check (unit_of_measure in ('piece','unit','pack','box','pair','set','kg','g','litre','ml','metre','cm','inch','roll'));
