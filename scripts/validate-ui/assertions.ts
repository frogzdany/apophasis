// Structural A2UI assertions used by the UI-validation harness.
//
// The system prompt in src/gemini/liveSession.ts spells out the rules Lucy
// must follow when she emits render_surface / update_surface payloads. We
// encode them here so the harness can fail loudly when the model breaks
// any of them, even when the payload is otherwise schema-valid.

type Component = Record<string, unknown> & { id: string; component: string }

export interface AssertionFailure {
  rule: string
  detail: string
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asComponent(v: unknown): Component | null {
  if (!isRecord(v)) return null
  if (typeof v.id !== 'string' || typeof v.component !== 'string') return null
  return v as Component
}

// Enforces:
//   - exactly one component with id 'root'
//   - every Button references its label Text via `child` AND that label id
//     does NOT appear in the parent Column/Row children (the dup-render bug
//     the prompt explicitly warns against)
//   - every ChoicePicker option is { label, value }, never a bare string
//   - every Slider has numeric min/max
//   - every TextField + ChoicePicker + Slider has a value:{path:'/...'}
//   - at least one Button with an action exists somewhere on the surface
export function assertSurfaceStructure(
  components: unknown,
): AssertionFailure[] {
  const failures: AssertionFailure[] = []
  if (!Array.isArray(components)) {
    return [{ rule: 'components_array', detail: 'components is not an array' }]
  }

  const parsed: Component[] = []
  for (const c of components) {
    const comp = asComponent(c)
    if (!comp) {
      failures.push({
        rule: 'component_shape',
        detail: `component missing id/component: ${JSON.stringify(c)}`,
      })
      continue
    }
    parsed.push(comp)
  }

  const roots = parsed.filter((c) => c.id === 'root')
  if (roots.length === 0) {
    failures.push({ rule: 'one_root', detail: 'no component has id "root"' })
  } else if (roots.length > 1) {
    failures.push({
      rule: 'one_root',
      detail: `${roots.length} components share id "root"`,
    })
  }

  const byId = new Map(parsed.map((c) => [c.id, c]))

  // Collect every id listed in any parent's `children` (Column/Row) or
  // `child` (Card). We do NOT include Button's `child` here — that's the
  // owned label, not a sibling-positioned child.
  const childIdsInParents = new Set<string>()
  for (const c of parsed) {
    if (c.component === 'Column' || c.component === 'Row') {
      const ch = c.children
      if (Array.isArray(ch)) {
        for (const id of ch) {
          if (typeof id === 'string') childIdsInParents.add(id)
        }
      }
    }
    if (c.component === 'Card' && typeof c.child === 'string') {
      childIdsInParents.add(c.child)
    }
  }

  let actionableButtonFound = false
  for (const c of parsed) {
    if (c.component === 'Button') {
      const child = c.child
      if (typeof child !== 'string') {
        failures.push({
          rule: 'button_child',
          detail: `Button "${c.id}" has no string "child" id`,
        })
      } else {
        const label = byId.get(child)
        if (!label) {
          failures.push({
            rule: 'button_child',
            detail: `Button "${c.id}" references missing label id "${child}"`,
          })
        } else if (label.component !== 'Text') {
          failures.push({
            rule: 'button_child',
            detail: `Button "${c.id}" child "${child}" must be a Text, got "${label.component}"`,
          })
        }
        if (childIdsInParents.has(child)) {
          failures.push({
            rule: 'button_label_not_duplicated',
            detail: `Button "${c.id}"'s label "${child}" is also listed in a parent's children — it will render twice`,
          })
        }
      }
      const action = c.action
      if (isRecord(action)) {
        const event = action.event
        if (isRecord(event) && typeof event.name === 'string' && event.name.length > 0) {
          actionableButtonFound = true
        } else if (typeof action.name === 'string' && action.name.length > 0) {
          // The system prompt's older shorthand. Tolerated as actionable.
          actionableButtonFound = true
        }
      }
    }

    if (c.component === 'ChoicePicker') {
      const options = c.options
      if (!Array.isArray(options) || options.length === 0) {
        failures.push({
          rule: 'choicepicker_options',
          detail: `ChoicePicker "${c.id}" has no options`,
        })
      } else {
        for (const [i, opt] of options.entries()) {
          if (
            !isRecord(opt) ||
            typeof opt.label !== 'string' ||
            typeof opt.value !== 'string'
          ) {
            failures.push({
              rule: 'choicepicker_options',
              detail: `ChoicePicker "${c.id}" option[${i}] must be { label, value } strings, got ${JSON.stringify(opt)}`,
            })
          }
        }
      }
      if (!isRecord(c.value) || typeof c.value.path !== 'string') {
        failures.push({
          rule: 'value_path',
          detail: `ChoicePicker "${c.id}" missing value:{path:"/..."}`,
        })
      }
    }

    if (c.component === 'Slider') {
      if (typeof c.min !== 'number' || typeof c.max !== 'number') {
        failures.push({
          rule: 'slider_range',
          detail: `Slider "${c.id}" needs numeric min and max`,
        })
      }
      if (!isRecord(c.value) || typeof c.value.path !== 'string') {
        failures.push({
          rule: 'value_path',
          detail: `Slider "${c.id}" missing value:{path:"/..."}`,
        })
      }
    }

    if (c.component === 'TextField') {
      if (!isRecord(c.value) || typeof c.value.path !== 'string') {
        failures.push({
          rule: 'value_path',
          detail: `TextField "${c.id}" missing value:{path:"/..."}`,
        })
      }
    }
  }

  if (!actionableButtonFound) {
    failures.push({
      rule: 'submit_button',
      detail: 'no Button with an action — surface has no submit affordance',
    })
  }

  return failures
}

// Verifies that every JSON-Pointer path referenced by a `value:{path}` is
// initialised in the data model. Catches "Lucy renders a Slider bound to
// /mood but ships an empty data_model" failures.
export function assertDataModelKeys(
  components: unknown,
  dataModel: Record<string, unknown> | undefined,
): AssertionFailure[] {
  if (!Array.isArray(components)) return []
  const failures: AssertionFailure[] = []
  const dm = dataModel ?? {}
  for (const c of components) {
    if (!isRecord(c)) continue
    const value = (c as Record<string, unknown>).value
    if (!isRecord(value)) continue
    const path = value.path
    if (typeof path !== 'string' || !path.startsWith('/')) continue
    const key = path.slice(1)
    if (key.length === 0) continue
    if (!(key in dm)) {
      failures.push({
        rule: 'data_model_init',
        detail: `data_model missing initial value for path "${path}" (component "${(c as Component).id}")`,
      })
    }
  }
  return failures
}
