import type { NextConfig } from 'next'
import path from 'path'

// Turbopack on Windows balks at backslash paths in resolveAlias. Convert
// to POSIX-style forward slashes so it resolves on both platforms.
const emptyShim = path.resolve(__dirname, 'src/lib/empty-module.js').replace(/\\/g, '/')

const nextConfig: NextConfig = {
  // mapbox-gl-draw → jsonlint-lines / @mapbox/geojsonhint reference
  // `require('fs')` at the top of dead-code CLI paths. Turbopack still
  // resolves them statically and fails the browser bundle without a shim.
  // The { browser: ... } conditional keeps the real `fs` available to Next's
  // own server code while pointing the browser bundle at an empty stub.
  turbopack: {
    resolveAlias: {
      fs: { browser: emptyShim },
    },
  },
  // Legacy webpack fallback for any production passes that still use webpack.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        fs: false,
      }
    }
    return config
  },
}

export default nextConfig
