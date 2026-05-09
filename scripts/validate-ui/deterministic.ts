// Pure-code axes: things we can verify without an LLM. These run BEFORE
// the judge sees the artefact so we never spend a Claude call on a
// scenario that already failed structurally.
//
// Each axis returns a single AxisResult; the caller aggregates them.

import type { AxisResult, ScenarioArtefact } from './types'

export const DETERMINISTIC_AXIS_IDS = [
  'no_session_failures',
  'no_structural_failures',
] as const

export function evaluateDeterministicAxes(artefact: ScenarioArtefact): AxisResult[] {
  return [evaluateSessionFailures(artefact), evaluateStructuralFailures(artefact)]
}

function evaluateSessionFailures(artefact: ScenarioArtefact): AxisResult {
  if (artefact.fatalError) {
    return {
      axisId: 'no_session_failures',
      label: 'Session ran to completion',
      pass: false,
      note: `fatal error: ${artefact.fatalError}`,
    }
  }
  return {
    axisId: 'no_session_failures',
    label: 'Session ran to completion',
    pass: true,
    note: `${artefact.turns.length} turns completed`,
  }
}

function evaluateStructuralFailures(artefact: ScenarioArtefact): AxisResult {
  const allFailures = artefact.turns.flatMap((t) =>
    t.failures.map((f) => `turn ${t.index} ${f.rule}: ${f.detail}`),
  )
  if (allFailures.length === 0) {
    return {
      axisId: 'no_structural_failures',
      label: 'A2UI surfaces structurally valid',
      pass: true,
      note: 'no assertions failed',
    }
  }
  return {
    axisId: 'no_structural_failures',
    label: 'A2UI surfaces structurally valid',
    pass: false,
    note: allFailures.slice(0, 5).join('; ') + (allFailures.length > 5 ? ` (+${allFailures.length - 5} more)` : ''),
  }
}
