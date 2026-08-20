-- ALL-5470: correct the book citation's title text on the LIVE serving table.
--
-- The source CSV/GeoJSON (tools/strat-charts/data/strat_chart_localities.csv,
-- public/strat/chart_localities.geojson) were already corrected to sentence
-- case with an em dash. That fixes the standalone chart.html viewer, which
-- reads the static geojson directly. It does NOT fix the docked map panel or
-- the on-screen lightbox - both read source_title from the live warehouse
-- features service, which serves this table directly. This table is a plain
-- row-store table (relkind='r'), not a view, so this UPDATE is durable until
-- someone deliberately reingests the topic - at which point the corrected CSV
-- is what will load, so there's no future drift.
--
-- Run as schema_owner (or whatever role owns mapping.*) via the Cloud SQL
-- Auth Proxy:
--   cloud-sql-proxy ut-dnr-ugs-mappingdb-prod:us-west3:mapping-db --port "$(ws-port)"
--   psql "host=127.0.0.1 port=$(ws-port) dbname=seamlessgeolmap user=schema_owner" \
--     -v ON_ERROR_STOP=1 -f fix_source_title.sql

-- Verify before: expect 123 rows with the old title, 0 with the new one.
SELECT
    count(*) FILTER (WHERE source_title = 'Geologic History of Utah: A Field Guide to Utah''s Rocks') AS old_count,
    count(*) FILTER (WHERE source_title = 'Geologic history of Utah—A field guide to Utah''s rocks') AS new_count
FROM mapping.geolmap_strat_columns_geologic_history_book_current;

UPDATE mapping.geolmap_strat_columns_geologic_history_book_current
SET source_title = 'Geologic history of Utah—A field guide to Utah''s rocks'
WHERE source_title = 'Geologic History of Utah: A Field Guide to Utah''s Rocks';

-- Verify after: expect 0 old, 123 new.
SELECT
    count(*) FILTER (WHERE source_title = 'Geologic History of Utah: A Field Guide to Utah''s Rocks') AS old_count,
    count(*) FILTER (WHERE source_title = 'Geologic history of Utah—A field guide to Utah''s rocks') AS new_count
FROM mapping.geolmap_strat_columns_geologic_history_book_current;
