import { Catalog } from '@a2ui/web_core/v0_9'
import { BASIC_FUNCTIONS } from '@a2ui/web_core/v0_9/basic_catalog'
import { APOPHASIS_CATALOG_ID } from '../catalogId'
import { Button } from './Button'
import { Card } from './Card'
import { CheckBox } from './CheckBox'
import { ChoicePicker } from './ChoicePicker'
import { Column } from './Column'
import { Divider } from './Divider'
import { Row } from './Row'
import { Slider } from './Slider'
import { Text } from './Text'
import { TextField } from './TextField'

export { APOPHASIS_CATALOG_ID }

export const APOPHASIS_CATALOG_COMPONENTS = [
  Text,
  Button,
  TextField,
  CheckBox,
  Slider,
  ChoicePicker,
  Card,
  Divider,
  Row,
  Column,
] as const

// shadcn-bound catalog. Same component-name surface as A2UI's basicCatalog
// (Text/Button/TextField/CheckBox/Slider/ChoicePicker/Card/Divider/Row/Column)
// so any v0.9 document that targets the basic primitives renders against
// shadcn-styled implementations instead of the package's stock plain HTML.
export const apophasisCatalog = new Catalog(
  APOPHASIS_CATALOG_ID,
  // biome-ignore lint/suspicious/noExplicitAny: Catalog expects ReactComponentImplementation<T> with a shared T
  APOPHASIS_CATALOG_COMPONENTS as any,
  BASIC_FUNCTIONS,
)
