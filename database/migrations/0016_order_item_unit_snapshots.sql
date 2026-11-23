-- Preserve the unit as it was billed, even if the product's stock unit is later changed.
alter table public.order_items
  add column if not exists unit_of_measure text not null default 'piece';

alter table public.order_items
  drop constraint if exists order_items_unit_of_measure_check;

alter table public.order_items
  add constraint order_items_unit_of_measure_check
  check (unit_of_measure in (
    'piece','unit','pack','packet','box','pair','set','dozen','bundle',
    'kg','g','litre','ml','metre','m','cm','mm','inch','foot','yard','roll'
  ));
