// Empty stub used by next.config.ts to shim Node-only modules out of the
// browser bundle. mapbox-gl-draw's transitive deps (jsonlint-lines,
// @mapbox/geojsonhint) reference `require('fs')` in dead-code CLI paths —
// gated by `if (require.main === module)`, never executed in the browser,
// but Turbopack still tries to resolve every import statically.
module.exports = {}
