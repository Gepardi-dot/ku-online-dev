-- Seed edge-case dataset snapshot for KU-ONLINE marketplace (2025-10-15)

-- Clear existing data to keep seed idempotent
delete from public.favorites;
delete from public.users;
delete from public.products;

alter table public.products
    alter column price drop not null;

insert into public.products (id, title, price, condition, created_at) values
  ('b4fc7195-9e52-4666-8ac6-c6ee34cb42c0', 'iPhone 15 Pro', 999.00, 'New', '2025-01-05 15:45:00'),
  ('c17be09a-0409-4ca6-a90c-3375e8f0cead', 'Sony WH-1000XM5', 349.00, 'Refurbished', '2025-01-08 12:30:00'),
  ('5e545fb7-31f6-4e46-896b-914d8609de92', 'MacBook Pro 14″', 1999.00, 'Used - Excellent', '2025-01-10 09:00:00'),
  ('730213ee-6136-424a-843e-53e36a5c0e11', 'MacBook Pro 14″', 2050.00, 'Used - Excellent', '2025-02-01 10:00:00'),
  ('bd1c7a02-1950-44aa-8856-4c49b79a13ab', 'MacBook Pro 14″', 1999.00, 'Used - Good', '2025-02-01 12:00:00'),
  ('4aa754c0-56b2-4406-9958-287b985aef1d', 'Vintage Camera Collection (Lot of 5)', null, 'Collectible', '2025-02-02 09:30:00'),
  ('405ff628-5291-4575-a559-731e349dadd7', 'Diamond-Encrusted Luxury Watch “Aurora Royale”', 250000.00, 'New', '2025-02-03 18:45:00'),
  ('b97f47df-ab78-4f4a-9115-6b93904dfde4', 'Custom-Built Gaming PC - RTX 5090 “Dragon Slayer Edition”', 4999.00, 'New', '2025-02-04 14:15:00'),
  ('5495a188-67c2-49ef-96b4-b6e0cda316d7', 'Ultra HD 8K QLED TV - Limited Edition “Aurora✨”', 7999.99, 'New', '2025-02-05 21:05:00'),
  ('773fe064-314f-44b5-aca4-4a03f3965320', 'Handcrafted Artisan Table – Reclaimed Oak & Brass (2.4m)', 1899.50, 'Handmade', '2025-02-06 08:20:00'),
  ('db77adad-fb92-481f-9e34-9af8b5525edd', 'Noise-Cancelling Earbuds (Gen-Χ) – Midnight/Ωmega', 279.99, 'New', '2025-02-06 09:05:00');

insert into public.users (id, email, full_name, created_at) values
  ('145e3cc0-9bbd-4226-a7f2-482499d29387', 'ali@example.com', 'Ali Miro', '2025-10-15 12:56:22.477464'),
  ('2e396caf-f08b-4329-a8a1-8c25645cf8c0', 'sara@example.com', 'Sara Jalal', '2025-10-15 12:56:22.477464'),
  ('9e4bc215-6513-4446-b727-bcdfe087b5f1', 'omar@example.com', 'Omar Rahman', '2025-10-15 12:56:22.477464'),
  ('829fc4cb-ea3a-42b0-818b-cc9f15d6d74a', 'layla.aziz@example.com', 'Layla “Lulu” Aziz', '2025-10-15 13:11:51.303443'),
  ('47198338-6069-465b-9a7e-44cc7d9a994c', 'nihad@example.com', 'Dr. Nihad Farouq', '2025-10-15 13:11:51.303443'),
  ('0e8c61e8-966a-44cf-a095-eb34d58183fd', 'zara@example.com', 'Zara Al-Hassan', '2025-10-15 13:11:51.303443');

insert into public.favorites (id, user_id, product_id, created_at) values
  ('43c63504-63a5-4e9d-977e-6abbdbc3fd7d', '145e3cc0-9bbd-4226-a7f2-482499d29387', '5e545fb7-31f6-4e46-896b-914d8609de92', '2025-10-15 12:56:50.689442'),
  ('6bce0cdf-fa80-4759-8e0d-ecdfcd7e3f5c', '9e4bc215-6513-4446-b727-bcdfe087b5f1', 'c17be09a-0409-4ca6-a90c-3375e8f0cead', '2025-10-15 12:56:50.689442'),
  ('0251438f-4a79-4d2c-8055-60e1a4b85b87', '2e396caf-f08b-4329-a8a1-8c25645cf8c0', 'b4fc7195-9e52-4666-8ac6-c6ee34cb42c0', '2025-10-15 12:56:50.689442'),
  ('684b4606-1b96-4001-aa28-5f7909d5625f', '47198338-6069-465b-9a7e-44cc7d9a994c', '4aa754c0-56b2-4406-9958-287b985aef1d', '2025-10-15 13:12:20.743177'),
  ('b291d7dd-9cca-434e-b783-30b9b44edbec', '0e8c61e8-966a-44cf-a095-eb34d58183fd', 'b97f47df-ab78-4f4a-9115-6b93904dfde4', '2025-10-15 13:12:20.743177'),
  ('e36be685-6732-4301-91da-816757664bff', '829fc4cb-ea3a-42b0-818b-cc9f15d6d74a', '5495a188-67c2-49ef-96b4-b6e0cda316d7', '2025-10-15 13:12:20.743177');
