-- 003_phase0_fixes.sql
-- Phase 0 stabilization fixes.
-- Idempotent: safe to run repeatedly.

-- drivers table extensions ------------------------------------------------------
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS user_id VARCHAR(100) UNIQUE REFERENCES users(clerk_id);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS current_latitude DECIMAL(9, 6);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS current_longitude DECIMAL(9, 6);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(30) NOT NULL DEFAULT 'standard';
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_plate VARCHAR(20);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS documents_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Indexes for driver matching
CREATE INDEX IF NOT EXISTS idx_drivers_online_available ON drivers (is_online, is_available) WHERE is_online AND is_available;
CREATE INDEX IF NOT EXISTS idx_drivers_location ON drivers (current_latitude, current_longitude) WHERE is_online;
CREATE INDEX IF NOT EXISTS idx_drivers_user_id ON drivers (user_id);

-- users table: add phone column -------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_phone ON users (phone);

-- rides table: ensure FK is validated (clean up demo data first if needed) -------
-- ALTER TABLE rides VALIDATE CONSTRAINT rides_user_id_fkey;

-- ride_status_history: add changed_by_role for audit clarity --------------------
ALTER TABLE ride_status_history ADD COLUMN IF NOT EXISTS changed_by_role VARCHAR(20);

-- Add check constraint for changed_by_role
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ride_status_history_changed_by_role_check') THEN
        ALTER TABLE ride_status_history ADD CONSTRAINT ride_status_history_changed_by_role_check
            CHECK (changed_by_role IN ('customer', 'driver', 'system', 'admin'));
    END IF;
END $$;

-- rate_limit_buckets table for distributed rate limiting --------------------------
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
    bucket_key TEXT NOT NULL,
    window_id BIGINT NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    reset_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (bucket_key, window_id)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_reset ON rate_limit_buckets (reset_at);

-- Update existing seed drivers to have defaults
UPDATE drivers SET
    is_online = FALSE,
    is_available = FALSE,
    vehicle_type = 'standard',
    documents_verified = FALSE
WHERE is_online IS NULL;