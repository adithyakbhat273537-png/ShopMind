-- Safe, additive invoice enhancements. Existing orders, invoices, and order item
-- snapshots are retained; missing invoice snapshots are backfilled from orders.
alter table public.orders
  add column if not exists discount_amount numeric(12,2) not null default 0,
  add column if not exists payment_method text not null default 'unspecified',
  add column if not exists request_id uuid;

alter table public.orders
  drop constraint if exists orders_discount_amount_check,
  add constraint orders_discount_amount_check check (discount_amount >= 0),
  drop constraint if exists orders_payment_method_check,
  add constraint orders_payment_method_check
    check (payment_method in ('cash', 'upi', 'card', 'bank_transfer', 'other', 'unspecified'));

alter table public.invoices
  add column if not exists customer_name text,
  add column if not exists customer_mobile text,
  add column if not exists customer_email text,
  add column if not exists subtotal numeric(12,2),
  add column if not exists tax_amount numeric(12,2),
  add column if not exists discount_amount numeric(12,2) not null default 0,
  add column if not exists total numeric(12,2),
  add column if not exists payment_method text not null default 'unspecified',
  add column if not exists payment_status text not null default 'unknown';

update public.invoices i
set customer_name = coalesce(i.customer_name, o.customer_name),
    customer_mobile = coalesce(i.customer_mobile, o.customer_mobile),
    customer_email = coalesce(i.customer_email, o.customer_email),
    subtotal = coalesce(i.subtotal, o.subtotal),
    tax_amount = coalesce(i.tax_amount, o.tax_amount),
    discount_amount = coalesce(i.discount_amount, o.discount_amount, 0),
    total = coalesce(i.total, o.total),
    payment_method = coalesce(nullif(i.payment_method, 'unspecified'), o.payment_method, 'unspecified'),
    payment_status = case when o.order_status = 'cancelled' then 'void' else 'unknown' end
from public.orders o
where o.order_id = i.order_id
  and i.customer_name is null;

alter table public.invoices
  alter column customer_name set not null,
  alter column customer_mobile set not null,
  alter column subtotal set not null,
  alter column tax_amount set not null,
  alter column total set not null,
  drop constraint if exists invoices_money_values_check,
  add constraint invoices_money_values_check
    check (subtotal >= 0 and tax_amount >= 0 and discount_amount >= 0 and total >= 0),
  drop constraint if exists invoices_payment_status_check,
  add constraint invoices_payment_status_check
    check (payment_status in ('paid', 'unpaid', 'partial', 'refunded', 'void', 'unknown')),
  drop constraint if exists invoices_payment_method_check,
  add constraint invoices_payment_method_check
    check (payment_method in ('cash', 'upi', 'card', 'bank_transfer', 'other', 'unspecified'));

create index if not exists invoices_issued_at_idx on public.invoices(issued_at desc, invoice_id desc);
create index if not exists invoices_payment_status_issued_idx on public.invoices(payment_status, issued_at desc);
create index if not exists invoices_number_idx on public.invoices(invoice_number);
create index if not exists orders_customer_name_lower_idx on public.orders(lower(customer_name));
create unique index if not exists orders_request_id_unique_idx
  on public.orders(request_id) where request_id is not null;
