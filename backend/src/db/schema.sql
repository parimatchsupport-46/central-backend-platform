-- Central Backend Management Platform - PostgreSQL Schema
-- Step 2: Database Design with Strict Project Isolation

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Super Admins (Central Dashboard Users)
CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(120) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Projects (Multi-tenant isolation root)
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_code VARCHAR(32) UNIQUE NOT NULL, -- e.g. prj_8f3k9a2b
    name VARCHAR(150) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    storage_limit_bytes BIGINT NOT NULL DEFAULT 524288000, -- Default 500 MB
    api_rate_limit_per_min INTEGER NOT NULL DEFAULT 120,
    allowed_origins TEXT[] DEFAULT ARRAY['*'],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. API Keys (Per-project public keys)
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    public_key VARCHAR(128) UNIQUE NOT NULL, -- e.g. pk_live_...
    label VARCHAR(100) DEFAULT 'Default Public Key',
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    request_count BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Project Collections (Logical tables per project)
CREATE TABLE IF NOT EXISTS project_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    schema_hint JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (project_id, name)
);

-- 5. Project Records (Isolated JSONB data rows)
CREATE TABLE IF NOT EXISTS project_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    collection_id UUID NOT NULL REFERENCES project_collections(id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_records_project_collection
    ON project_records (project_id, collection_id);
CREATE INDEX IF NOT EXISTS idx_project_records_data_gin
    ON project_records USING GIN (data);

-- 6. Files (Logical file metadata per project)
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    original_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(120) NOT NULL,
    size_bytes BIGINT NOT NULL,
    storage_driver VARCHAR(20) NOT NULL DEFAULT 'local', -- 'local' or 's3'
    storage_path TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_files_project_id ON files (project_id);

-- 7. Backups (Full or project-wise backup history)
CREATE TABLE IF NOT EXISTS backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL, -- NULL = Full platform backup
    backup_type VARCHAR(20) NOT NULL CHECK (backup_type IN ('full', 'database', 'files', 'project')),
    file_path TEXT NOT NULL,
    size_bytes BIGINT DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'restored')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. API & Activity Logs
CREATE TABLE IF NOT EXISTS api_logs (
    id BIGSERIAL PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    method VARCHAR(10) NOT NULL,
    endpoint TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    ip_address VARCHAR(64),
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_logs_project_created
    ON api_logs (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS activity_logs (
    id BIGSERIAL PRIMARY KEY,
    admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    action VARCHAR(120) NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
