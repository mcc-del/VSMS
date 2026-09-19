// Pure-function unit tests don't touch the database, but importing
// @workspace/db requires DATABASE_URL to be set (a Pool is created lazily and
// never connects unless a query runs). Provide harmless defaults for tests.
process.env.DATABASE_URL ||= "postgres://test:test@localhost:5432/test";
process.env.JWT_SECRET ||= "test-secret";
