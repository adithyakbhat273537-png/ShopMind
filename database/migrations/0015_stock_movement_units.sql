-- Keep each inventory audit event's unit stable when a product's unit changes later.
alter table public.stock_movements
  add column if not exists unit_of_measure text not null default 'piece';

alter table public.stock_movements
  drop constraint if exists stock_movements_unit_of_measure_check;

alter table public.stock_movements
  add constraint stock_movements_unit_of_measure_check
  check (unit_of_measure in (
    'piece','unit','pack','packet','box','pair','set','dozen','bundle',
    'kg','g','litre','ml','metre','m','cm','mm','inch','foot','yard','roll'
  ));
