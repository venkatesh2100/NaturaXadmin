process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgresql://naturax:naturax@localhost:5432/naturax_test";
process.env.WEB_ORIGIN ??= "http://localhost:3000";
process.env.SESSION_SECRET ??= "test-session-secret-value";
process.env.DEV_LOGIN_ENABLED ??= "false";
process.env.DISCORD_NOTIFICATIONS_ENABLED ??= "false";
process.env.OVERDUE_CHECK_INTERVAL_MS ??= "0";
