-- The primary key already supports lookups by user and date, including reverse scans.
drop index if exists public.daily_ratings_user_date_idx;
