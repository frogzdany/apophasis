// Stable catalog identifier shared by the React-bound runtime catalog
// (src/a2ui/catalog/index.ts) and any headless consumer that wants to
// build its own Catalog without pulling React. Lives in its own file so
// importing the id never drags .tsx components into the module graph.
export const APOPHASIS_CATALOG_ID = 'https://apophasis.ai/catalogs/v1/basic-shadcn'
