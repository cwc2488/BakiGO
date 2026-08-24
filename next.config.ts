import type { NextConfig } from "next";

const radarLiveMigrationFiles = [
  "./supabase/migrations/014_radar_scoring_v1.sql",
  "./supabase/migrations/015_content_normalization_v1.sql",
  "./supabase/migrations/016_radar_daily_pipeline_v1.sql",
  "./supabase/migrations/017_radar_pipeline_p2.sql",
  "./supabase/migrations/018_radar_orchestrator_support.sql",
  "./supabase/migrations/019_radar_p3_p6.sql",
  "./supabase/migrations/020_radar_acquisition_v1.sql",
];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/radar/live/schema": radarLiveMigrationFiles,
  },
};

export default nextConfig;
