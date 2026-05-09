import type { A2uiMessage } from '@a2ui/web_core/v0_9'
import { APOPHASIS_CATALOG_ID, getProcessor } from './processor'

export type DemoPreset = 'basic' | 'music' | 'gallery' | 'mood'

export const DEMO_PRESETS: DemoPreset[] = ['basic', 'music', 'gallery', 'mood']

export const DEMO_LABELS: Record<DemoPreset, string> = {
  basic: 'Basic',
  music: 'Music search',
  gallery: 'All primitives',
  mood: 'Mood + chips',
}

interface BuildOptions {
  surfaceId: string
}

type Component = Record<string, unknown>

// Helper: a Button + its label Text, since v0.9 Button takes a `child` id.
function buttonPair(
  id: string,
  text: string,
  actionName: string,
  variant: 'primary' | 'default' | 'borderless' = 'primary',
): [Component, Component] {
  const labelId = `${id}_label`
  return [
    {
      id,
      component: 'Button',
      child: labelId,
      variant,
      action: { event: { name: actionName } },
    },
    { id: labelId, component: 'Text', text, variant: 'body' },
  ]
}

function options(items: string[]): { label: string; value: string }[] {
  return items.map((v) => ({ label: v, value: v }))
}

function buildBasic(opts: BuildOptions): A2uiMessage[] {
  const { surfaceId } = opts
  const [submitBtn, submitLabel] = buttonPair('submit', 'Submit', 'submit_demo')
  const components: Component[] = [
    {
      id: 'root',
      component: 'Column',
      children: ['title', 'subtitle', 'name_field', 'submit'],
    },
    { id: 'title', component: 'Text', text: 'Quick test surface', variant: 'h3' },
    {
      id: 'subtitle',
      component: 'Text',
      text: 'A minimal form to verify the renderer.',
      variant: 'body',
    },
    {
      id: 'name_field',
      component: 'TextField',
      label: 'Title or fragment',
      variant: 'shortText',
      value: { path: '/title' },
    },
    submitBtn,
    submitLabel,
  ]
  return wrap(surfaceId, components, { title: '' })
}

function buildMusic(opts: BuildOptions): A2uiMessage[] {
  const { surfaceId } = opts
  const [submitBtn, submitLabel] = buttonPair('submit', 'Search', 'search_music')
  const components: Component[] = [
    {
      id: 'root',
      component: 'Column',
      children: ['title', 'fragment', 'mood', 'tempo', 'instruments', 'era', 'submit'],
    },
    {
      id: 'title',
      component: 'Text',
      text: 'Help me find that song',
      variant: 'h3',
    },
    {
      id: 'fragment',
      component: 'TextField',
      label: 'Any fragment of a lyric, title, or artist',
      variant: 'longText',
      value: { path: '/fragment' },
    },
    {
      id: 'mood',
      component: 'Slider',
      label: 'Melancholy ↔ Triumphant',
      min: -1,
      max: 1,
      step: 0.05,
      value: { path: '/mood' },
    },
    {
      id: 'tempo',
      component: 'Slider',
      label: 'Tempo (bpm)',
      min: 40,
      max: 200,
      step: 1,
      value: { path: '/bpm' },
    },
    {
      id: 'instruments',
      component: 'ChoicePicker',
      label: 'Stand-out instrument',
      variant: 'mutuallyExclusive',
      options: options(['Piano', 'Guitar', 'Saxophone', 'Synth', 'Strings', 'Voice']),
      value: { path: '/instrument' },
    },
    {
      id: 'era',
      component: 'ChoicePicker',
      label: 'Era',
      variant: 'mutuallyExclusive',
      options: options(['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s']),
      value: { path: '/era' },
    },
    submitBtn,
    submitLabel,
  ]
  return wrap(surfaceId, components, {
    fragment: '',
    mood: 0,
    bpm: 110,
    instrument: ['Saxophone'],
    era: ['1990s'],
  })
}

function buildGallery(opts: BuildOptions): A2uiMessage[] {
  const { surfaceId } = opts
  const [cancelBtn, cancelLabel] = buttonPair('cancel', 'Cancel', 'cancel', 'borderless')
  const [submitBtn, submitLabel] = buttonPair('submit', 'Submit', 'submit')
  const components: Component[] = [
    {
      id: 'root',
      component: 'Column',
      children: ['h', 'short', 'long', 'num', 'check', 'slider', 'pick', 'sep', 'btn_row'],
    },
    { id: 'h', component: 'Text', text: 'Primitive gallery', variant: 'h3' },
    {
      id: 'short',
      component: 'TextField',
      label: 'Short text',
      variant: 'shortText',
      value: { path: '/short' },
    },
    {
      id: 'long',
      component: 'TextField',
      label: 'Long text',
      variant: 'longText',
      value: { path: '/long' },
    },
    {
      id: 'num',
      component: 'TextField',
      label: 'Number',
      variant: 'number',
      value: { path: '/num' },
    },
    {
      id: 'check',
      component: 'CheckBox',
      label: 'Toggle me',
      value: { path: '/check' },
    },
    {
      id: 'slider',
      component: 'Slider',
      label: 'Slider 0–100',
      min: 0,
      max: 100,
      step: 1,
      value: { path: '/slider' },
    },
    {
      id: 'pick',
      component: 'ChoicePicker',
      label: 'Single choice',
      variant: 'mutuallyExclusive',
      options: options(['Red', 'Green', 'Blue']),
      value: { path: '/pick' },
    },
    { id: 'sep', component: 'Divider' },
    {
      id: 'btn_row',
      component: 'Row',
      children: ['cancel', 'submit'],
    },
    cancelBtn,
    cancelLabel,
    submitBtn,
    submitLabel,
  ]
  return wrap(surfaceId, components, {
    short: '',
    long: '',
    num: 0,
    check: false,
    slider: 50,
    pick: ['Green'],
  })
}

function buildMood(opts: BuildOptions): A2uiMessage[] {
  const { surfaceId } = opts
  const [submitBtn, submitLabel] = buttonPair('submit', 'Try this combination', 'try_mood')
  const components: Component[] = [
    {
      id: 'root',
      component: 'Column',
      children: [
        'title',
        'energy',
        'warmth',
        'tags_label',
        'tag_smoky',
        'tag_dreamy',
        'tag_nostalgic',
        'tag_gritty',
        'submit',
      ],
    },
    { id: 'title', component: 'Text', text: 'Describe the vibe', variant: 'h3' },
    {
      id: 'energy',
      component: 'Slider',
      label: 'Energy: low ↔ high',
      min: 0,
      max: 1,
      step: 0.05,
      value: { path: '/energy' },
    },
    {
      id: 'warmth',
      component: 'Slider',
      label: 'Warmth: cold ↔ warm',
      min: 0,
      max: 1,
      step: 0.05,
      value: { path: '/warmth' },
    },
    {
      id: 'tags_label',
      component: 'Text',
      text: 'Pick any descriptors that fit',
      variant: 'caption',
    },
    {
      id: 'tag_smoky',
      component: 'CheckBox',
      label: 'smoky',
      value: { path: '/tags/smoky' },
    },
    {
      id: 'tag_dreamy',
      component: 'CheckBox',
      label: 'dreamy',
      value: { path: '/tags/dreamy' },
    },
    {
      id: 'tag_nostalgic',
      component: 'CheckBox',
      label: 'nostalgic',
      value: { path: '/tags/nostalgic' },
    },
    {
      id: 'tag_gritty',
      component: 'CheckBox',
      label: 'gritty',
      value: { path: '/tags/gritty' },
    },
    submitBtn,
    submitLabel,
  ]
  return wrap(surfaceId, components, {
    energy: 0.5,
    warmth: 0.5,
    tags: { smoky: false, dreamy: false, nostalgic: false, gritty: false },
  })
}

function wrap(
  surfaceId: string,
  components: Component[],
  dataModel: Record<string, unknown>,
): A2uiMessage[] {
  return [
    {
      version: 'v0.9',
      createSurface: { surfaceId, catalogId: APOPHASIS_CATALOG_ID, sendDataModel: true },
    },
    { version: 'v0.9', updateComponents: { surfaceId, components } },
    { version: 'v0.9', updateDataModel: { surfaceId, path: '/', value: dataModel } },
  ] as unknown as A2uiMessage[]
}

const BUILDERS: Record<DemoPreset, (opts: BuildOptions) => A2uiMessage[]> = {
  basic: buildBasic,
  music: buildMusic,
  gallery: buildGallery,
  mood: buildMood,
}

export function dispatchDemoSurface(preset: DemoPreset = 'basic', surfaceId?: string): string {
  const id = surfaceId ?? `demo_${preset}`
  const processor = getProcessor()
  try {
    processor.processMessages([
      { version: 'v0.9', deleteSurface: { surfaceId: id } },
    ] as unknown as A2uiMessage[])
  } catch {
    /* noop — first run, nothing to delete */
  }
  processor.processMessages(BUILDERS[preset]({ surfaceId: id }))
  return id
}
