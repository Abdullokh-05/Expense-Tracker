-- Xarajat: the tables the app syncs to. Columns mirror the app's records in snake_case
-- (amountInBaseCurrency → amount_in_base_currency). Money is stored as ordinary amounts with
-- two decimals, as the app sends it. Ids are the app's own; built-in categories share ids
-- across users (cat-food), so every key is (user_id, id). Row level security lets each
-- signed-in user read and write only their own rows.

create table if not exists public.accounts (
  user_id text not null default (auth.uid())::text,
  id text not null,
  name text not null,
  type text not null,
  currency text not null,
  starting_balance numeric(16, 2) not null default 0,
  include_in_total boolean not null default true,
  is_wishlist_fund boolean not null default false,
  color text,
  is_default boolean,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.categories (
  user_id text not null default (auth.uid())::text,
  id text not null,
  name text not null,
  icon text not null,
  color text not null,
  kind text,
  is_archived boolean not null default false,
  is_default boolean,
  sort_order integer,
  parent_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.transactions (
  user_id text not null default (auth.uid())::text,
  id text not null,
  type text not null,
  status text not null,
  amount numeric(16, 2) not null,
  currency text not null,
  amount_in_base_currency numeric(16, 2) not null,
  exchange_rate double precision not null default 1,
  category_id text,
  subcategory_id text,
  account_id text,
  to_account_id text,
  to_amount numeric(16, 2),
  date date not null,
  note text,
  note_original text,
  note_language text,
  translation_confidence double precision,
  payment_method text,
  recurring_transaction_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists transactions_user_date on public.transactions (user_id, date desc);

create table if not exists public.budgets (
  user_id text not null default (auth.uid())::text,
  id text not null,
  category_id text not null,
  monthly_limit numeric(16, 2) not null,
  period text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Planned payments
create table if not exists public.recurring_transactions (
  user_id text not null default (auth.uid())::text,
  id text not null,
  type text not null,
  amount numeric(16, 2) not null,
  currency text not null,
  category_id text,
  subcategory_id text,
  account_id text,
  note text,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  next_run_date date not null,
  auto_create boolean not null default true,
  remind_days_before integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists recurring_due on public.recurring_transactions (next_run_date) where is_active;

create table if not exists public.wishlist_items (
  user_id text not null default (auth.uid())::text,
  id text not null,
  name text not null,
  price numeric(16, 2) not null,
  currency text not null,
  importance text not null,
  link text,
  status text not null,
  bought_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.templates (
  user_id text not null default (auth.uid())::text,
  id text not null,
  type text not null,
  amount numeric(16, 2) not null,
  category_id text not null,
  subcategory_id text,
  account_id text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Each signed-in user sees and changes only their own rows
do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'categories', 'transactions', 'budgets', 'recurring_transactions', 'wishlist_items', 'templates']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated using (user_id = (auth.uid())::text) with check (user_id = (auth.uid())::text)',
      t
    );
  end loop;
end $$;
