-- 002_fare_and_state.sql
-- Phase 1: server-side fare engine data + ride state audit trail.
-- Idempotent: safe to run repeatedly.

-- fare_rules -------------------------------------------------------------------
-- Mauritania fare model (Nouakchott taxis):
--   base 100 MRU covers the first km; +100 MRU per additional km.
-- Formula: fare = base_fare_mru + per_km_mru * MAX(0, CEIL(distance_km) - 1)
--          floored at min_fare_mru.
CREATE TABLE IF NOT EXISTS fare_rules (
    id               SERIAL PRIMARY KEY,
    vehicle_type     VARCHAR(30) NOT NULL DEFAULT 'standard',
    base_fare_mru    INTEGER NOT NULL CHECK (base_fare_mru >= 0),
    per_km_mru       INTEGER NOT NULL CHECK (per_km_mru >= 0),
    min_fare_mru     INTEGER NOT NULL CHECK (min_fare_mru >= 0),
    active           BOOLEAN NOT NULL DEFAULT TRUE,
    effective_from   TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_to     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fare_rules_active ON fare_rules (active, effective_from);

-- Seed the production fare rule if none exists yet.
INSERT INTO fare_rules (vehicle_type, base_fare_mru, per_km_mru, min_fare_mru)
SELECT 'standard', 100, 100, 100
WHERE NOT EXISTS (SELECT 1 FROM fare_rules);

-- rides.distance_km ------------------------------------------------------------
ALTER TABLE rides ADD COLUMN IF NOT EXISTS distance_km DECIMAL(6, 2) NOT NULL DEFAULT 0;
ALTER TABLE rides ALTER COLUMN distance_km SET DEFAULT 0;

-- ride_status_history ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS ride_status_history (
    id          SERIAL PRIMARY KEY,
    ride_id     INTEGER NOT NULL REFERENCES rides (ride_id) ON DELETE CASCADE,
    status      VARCHAR(30) NOT NULL,
    changed_by  VARCHAR(100),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ride_status_history_ride ON ride_status_history (ride_id, created_at DESC);

-- Automatic audit trail: every status change appends a history row.
CREATE OR REPLACE FUNCTION log_ride_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO ride_status_history (ride_id, status, changed_by)
        VALUES (NEW.ride_id, NEW.status, NEW.user_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rides_status_history ON rides;
CREATE TRIGGER rides_status_history AFTER UPDATE OF status ON rides
    FOR EACH ROW EXECUTE FUNCTION log_ride_status_change();