-- Create the application role for RLS
CREATE ROLE secureops_app;
GRANT CONNECT ON DATABASE secureops TO secureops_app;

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
