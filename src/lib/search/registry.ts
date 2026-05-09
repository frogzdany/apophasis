import { booksProvider } from './providers/books'
import { musicProvider } from './providers/music'
import { placeDetailsProvider } from './providers/placeDetails'
import { placesProvider } from './providers/places'
import { placesGoogleProvider } from './providers/placesGoogle'
import { placesNearbyProvider } from './providers/placesNearby'
import { productsProvider } from './providers/products'
import { webProvider } from './providers/web'
import { youtubeProvider } from './providers/youtube'
import type { SearchProvider } from './types'

// Add new providers here. Each one contributes:
//  - a function declaration that becomes part of Gemini's tool list
//  - a handler that turns Gemini's args into SearchResult[]
//  - a `kind` that the gallery uses to pick a renderer
//
// Adding a new domain (Spotify, Goodreads, etc.) is a matter of dropping a
// file under ./providers/ and appending it to this array.
export const SEARCH_PROVIDERS: SearchProvider[] = [
  musicProvider,
  youtubeProvider,
  booksProvider,
  placesProvider,
  placesGoogleProvider,
  placesNearbyProvider,
  placeDetailsProvider,
  productsProvider,
  webProvider,
]

export const PROVIDERS_BY_NAME: Record<string, SearchProvider> = Object.fromEntries(
  SEARCH_PROVIDERS.map((p) => [p.name, p]),
)
