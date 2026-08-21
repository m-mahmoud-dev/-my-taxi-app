-- 004_phase1_core.sql
-- Phase 1: Core architecture - PostGIS, driver_profiles, webhooks, real-time
-- Idempotent: safe to run repeatedly.

-- Enable PostGIS extension ------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- driver_profiles table ---------------------------------------------------------
-- Links Clerk user to driver record with full profile info
CREATE TABLE IF NOT EXISTS driver_profiles (
    id              SERIAL PRIMARY KEY,
    user_id         VARCHAR(100) NOT NULL UNIQUE REFERENCES users(clerk_id),
    driver_id       INTEGER UNIQUE REFERENCES drivers(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
    license_number  VARCHAR(50),
    license_expiry  DATE,
    license_image_url TEXT,
    id_document_url TEXT,
    selfie_url      TEXT,
    vehicle_type    VARCHAR(30) NOT NULL DEFAULT 'standard',
    vehicle_make    VARCHAR(50),
    vehicle_model   VARCHAR(50),
    vehicle_year    INTEGER,
    vehicle_color   VARCHAR(30),
    license_plate   VARCHAR(20),
    vehicle_image_url TEXT,
    insurance_expiry DATE,
    insurance_image_url TEXT,
    background_check_status VARCHAR(20) DEFAULT 'pending' CHECK (background_check_status IN ('pending', 'passed', 'failed')),
    background_check_at TIMESTAMPTZ,
    approved_by     VARCHAR(100) REFERENCES users(clerk_id),
    approved_at     TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_profiles_user_id ON driver_profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_driver_profiles_driver_id ON driver_profiles (driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_profiles_status ON driver_profiles (status);

-- Add geometry column to drivers for PostGIS spatial queries --------------------
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS location GEOGRAPHY(POINT, 4326);

-- Update location from lat/lng columns
UPDATE drivers
SET location = ST_SetSRID(ST_MakePoint(current_longitude, current_latitude), 4326)::geography
WHERE current_latitude IS NOT NULL AND current_longitude IS NOT NULL AND location IS NULL;

-- Spatial index for radius queries
CREATE INDEX IF NOT EXISTS idx_drivers_location_gist ON drivers USING GIST (location);

-- webhook_events table for idempotent Clerk webhook processing ------------------
CREATE TABLE IF NOT EXISTS webhook_events (
    id              BIGSERIAL PRIMARY KEY,
    clerk_event_id  VARCHAR(100) NOT NULL UNIQUE,
    event_type      VARCHAR(50) NOT NULL,
    payload         JSONB NOT NULL,
    processed       BOOLEAN NOT NULL DEFAULT FALSE,
    processed_at    TIMESTAMPTZ,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events (processed) WHERE NOT processed;
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events (event_type);

-- ride_subscriptions table for WebSocket connection tracking --------------------
CREATE TABLE IF NOT EXISTS ride_subscriptions (
    id              BIGSERIAL PRIMARY KEY,
    ride_id         INTEGER NOT NULL REFERENCES rides(ride_id) ON DELETE CASCADE,
    user_id         VARCHAR(100) NOT NULL REFERENCES users(clerk_id),
    connection_id   VARCHAR(100) NOT NULL,
    subscribed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_ping       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ride_subscriptions_ride ON ride_subscriptions (ride_id);
CREATE INDEX IF NOT EXISTS idx_ride_subscriptions_user ON ride_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_ride_subscriptions_connection ON ride_subscriptions (connection_id);

-- driver_sessions table for WebSocket connection tracking -----------------------
CREATE TABLE IF NOT EXISTS driver_sessions (
    id              BIGSERIAL PRIMARY KEY,
    driver_id       INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    user_id         VARCHAR(100) NOT NULL REFERENCES users(clerk_id),
    connection_id   VARCHAR(100) NOT NULL,
    is_online       BOOLEAN NOT NULL DEFAULT TRUE,
    last_heartbeat  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_sessions_driver ON driver_sessions (driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_sessions_user ON driver_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_driver_sessions_connection ON driver_sessions (connection_id);
CREATE INDEX IF NOT EXISTS idx_driver_sessions_online ON driver_sessions (is_online) WHERE is_online;

-- updated_at triggers for new tables
CREATE TRIGGER driver_profiles_set_updated_at BEFORE UPDATE ON driver_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Migrate existing drivers to driver_profiles if linked
INSERT INTO driver_profiles (user_id, driver_id, status, vehicle_type, license_plate)
SELECT d.user_id, d.id, 
    CASE WHEN d.documents_verified THEN 'approved' ELSE 'pending' END,
    d.vehicle_type, d.license_plate
FROM drivers d
WHERE d.user_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- Update drivers table to link back
UPDATE drivers d
SET user_id = dp.user_id
FROM driver_profiles dp
WHERE dp.driver_id = d.id AND d.user_id IS NULL;