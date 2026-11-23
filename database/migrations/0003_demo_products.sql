-- Optional demonstration catalogue. Safe to run more than once (SKU is unique).
insert into public.categories (category_name, description) values
  ('Power Tools', 'Drills, drivers, grinders, and workshop tools'),
  ('Electrical', 'Lighting, switches, cables, and accessories'),
  ('Plumbing', 'Pipes, fittings, valves, and repair essentials'),
  ('Hand Tools', 'Everyday tools for repairs and projects')
on conflict (category_name) do nothing;

insert into public.products
  (product_name, sku, category_id, brand, description, price, stock_quantity, reorder_level, rack_number, shelf_number, image_url)
select v.product_name, v.sku, c.category_id, v.brand, v.description, v.price, v.stock,
       v.reorder, v.rack, v.shelf, null
from (values
  ('Compact Impact Driver', 'DEMO-PT-001', 'Power Tools', 'BuildPro', 'Cordless impact driver for everyday fastening jobs.', 2499.00::numeric, 12, 4, 'R04', 'B2'),
  ('LED Bulb 9W Warm White', 'DEMO-EL-001', 'Electrical', 'Luma', 'Energy-saving warm white bulb with standard base.', 149.00, 36, 10, 'R02', 'A1'),
  ('PVC Pipe 1 Inch (1m)', 'DEMO-PL-001', 'Plumbing', 'Flowline', 'One metre PVC pipe for household plumbing projects.', 180.00, 50, 12, 'R07', 'C1'),
  ('Adjustable Wrench 10 Inch', 'DEMO-HT-001', 'Hand Tools', 'Ironleaf', 'Adjustable steel wrench for common repair work.', 499.00, 8, 3, 'R01', 'D3'),
  ('Modular Switch 6A', 'DEMO-EL-002', 'Electrical', 'Luma', 'Single pole 6 amp modular wall switch.', 89.00, 24, 8, 'R03', 'A4'),
  ('PVC Elbow 1 Inch', 'DEMO-PL-002', 'Plumbing', 'Flowline', '90 degree PVC elbow fitting for one inch pipe.', 35.00, 3, 10, 'R07', 'C2')
) as v(product_name, sku, category_name, brand, description, price, stock, reorder, rack, shelf)
join public.categories c on c.category_name = v.category_name
on conflict (sku) do nothing;
