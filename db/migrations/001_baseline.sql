-- 001_baseline.sql
-- Phase 0 stabilization baseline.
-- Idempotent: safe to run on a fresh database OR on the tutorial's existing schema.
--
-- Money convention: all monetary values (fare_price) are INTEGER MRU (ouguiya).
-- Khoums are not used in this product; prices are displayed as whole ouguiya.
--
-- Ride lifecycle: `status` holds the ride state machine value (see audit §8).
-- `payment_status` tracks settlement of the fare, independently of `status`.

-- users -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    email       VARCHAR(100) UNIQUE NOT NULL,
    clerk_id    VARCHAR(100) UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- drivers ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drivers (
    id                SERIAL PRIMARY KEY,
    first_name        VARCHAR(50) NOT NULL,
    last_name         VARCHAR(50) NOT NULL,
    profile_image_url TEXT,
    car_image_url     TEXT,
    car_seats         INTEGER NOT NULL CHECK (car_seats > 0),
    rating            DECIMAL(3, 2) CHECK (rating >= 0 AND rating <= 5)
);

-- rides -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rides (
    ride_id               SERIAL PRIMARY KEY,
    origin_address        VARCHAR(255) NOT NULL,
    destination_address   VARCHAR(255) NOT NULL,
    origin_latitude       DECIMAL(9, 6) NOT NULL,
    origin_longitude      DECIMAL(9, 6) NOT NULL,
    destination_latitude  DECIMAL(9, 6) NOT NULL,
    destination_longitude DECIMAL(9, 6) NOT NULL,
    ride_time             INTEGER NOT NULL,
    fare_price            INTEGER NOT NULL DEFAULT 0 CHECK (fare_price >= 0),
    payment_status        VARCHAR(20) NOT NULL DEFAULT 'pending',
    driver_id             INTEGER REFERENCES drivers(id),
    user_id               VARCHAR(100) NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Normalize existing tutorial columns to the stabilized types -----------------
ALTER TABLE rides ALTER COLUMN fare_price TYPE INTEGER USING (fare_price::integer);

-- Ride state machine + audit columns ------------------------------------------
ALTER TABLE rides ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cash';
ALTER TABLE rides ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE rides ALTER COLUMN status SET DEFAULT 'REQUESTED';
UPDATE rides SET status = 'REQUESTED' WHERE status IS NULL;
ALTER TABLE rides ALTER COLUMN status SET NOT NULL;

-- Constraints (idempotent) -----------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rides_payment_status_check') THEN
        ALTER TABLE rides ADD CONSTRAINT rides_payment_status_check
            CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rides_status_check') THEN
        ALTER TABLE rides ADD CONSTRAINT rides_status_check
            CHECK (status IN (
                'REQUESTED',
                'SEARCHING_DRIVER',
                'DRIVER_ASSIGNED',
                'DRIVER_ARRIVING',
                'DRIVER_AT_PICKUP',
                'TRIP_STARTED',
                'TRIP_COMPLETED',
                'CUSTOMER_CANCELLED',
                'DRIVER_CANCELLED',
                'NO_DRIVER_FOUND',
                'PAYMENT_PENDING',
                'PAYMENT_FAILED',
                'DISPUTED',
                'RESOLVED'
            ));
    END IF;

    -- Referential integrity: rides.user_id references users.clerk_id.
    -- NOT VALID keeps pre-existing demo rows working; run
    --   ALTER TABLE rides VALIDATE CONSTRAINT rides_user_id_fkey;
    -- once demo data is cleaned up.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rides_user_id_fkey') THEN
        ALTER TABLE rides ADD CONSTRAINT rides_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users (clerk_id) NOT VALID;
    END IF;
END $$;

-- Indexes ----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_rides_user_id ON rides (user_id);
CREATE INDEX IF NOT EXISTS idx_rides_status ON rides (status);
CREATE INDEX IF NOT EXISTS idx_rides_created_at ON rides (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rides_driver_id ON rides (driver_id);

-- updated_at maintenance --------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS rides_set_updated_at ON rides;
CREATE TRIGGER rides_set_updated_at BEFORE UPDATE ON rides
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();