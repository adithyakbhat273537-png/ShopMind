-- Expand sale/stock-count units for measurable hardware inventory.
-- Electrical ratings (W, V, A) and multi-axis dimensions belong in products.size
-- as specifications; they are not inventory quantity units.
alter table public.products
  drop constraint if exists products_unit_of_measure_check;

alter table public.products
  add constraint products_unit_of_measure_check
  check (unit_of_measure in (
    'piece','unit','pack','packet','box','pair','set','dozen','bundle',
    'kg','g','litre','ml','metre','m','cm','mm','inch','foot','yard','roll'
  ));
