const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // MVP: ship first
  typescript: { ignoreBuildErrors: true },

  // Force Webpack build (avoids Turbopack vs custom webpack conflict)

  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@react-native-async-storage/async-storage": path.resolve(
        __dirname,
        "lib/shims/asyncStorage.ts"
      ),
    };
    return config;
  },
};

module.exports = nextConfig;
