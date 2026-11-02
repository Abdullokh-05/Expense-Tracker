-- Phantom expenses: something someone else paid for. It's recorded with who paid and no
-- account, and never counts toward balances. Existing rows are ordinary expenses.
alter table public.transactions
  add column if not exists is_phantom boolean not null default false,
  add column if not exists paid_by text;
