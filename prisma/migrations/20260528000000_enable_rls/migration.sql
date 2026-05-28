-- Enable Row Level Security on all public tables.
--
-- Prisma connects via the `postgres` role which has BYPASSRLS, so this has
-- no effect on application access. It closes the public PostgREST API
-- (anon/authenticated keys) and resolves the Supabase Security Advisor
-- "rls_disabled_in_public" alerts.
--
-- IMPORTANT: when adding new tables in future migrations, append an
-- `ALTER TABLE "NewTable" ENABLE ROW LEVEL SECURITY;` line so the new
-- table does not trigger the same advisor warning.

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MealLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MealItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DailyData" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiEvaluation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Integration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScrapingLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
