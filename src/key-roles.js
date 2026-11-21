import {
  parseTrigger,
  modifierOf,
  MODIFIERS,
  displayCode,
  equivalentTrigger,
  KeyboardEngine,
} from './keyboard-engine.js';
export const SUFFIX_ACTIONS = ['depth', 'suffix-slice'];
export const HOLD_ACTIONS = ['hold-slice', 'hold-wide', 'hold-reverse', 'hold-mode'];
const available = (action, size) =>
  !(
    (action.type === 'depth' ||
      (action.type === 'move' && ['slice', 'wide'].includes(action.kind))) &&
    action.depth > size
  );
export function keyRole(mode, code, size = 20) {
  const binding = mode.bindings.find((b) => equivalentTrigger(b.trigger, code));
  if (binding && !available(binding.action, size) && binding.action.type === 'depth') return 'move';
  if (mode.keyRoles?.[code]) return mode.keyRoles[code];
  if (SUFFIX_ACTIONS.includes(binding?.action.type)) return 'suffix';
  if (HOLD_ACTIONS.includes(binding?.action.type) || MODIFIERS.includes(modifierOf(code)))
    return 'modifier';
  return binding && binding.action.type !== 'move' && binding.action.type !== 'rotate'
    ? 'action'
    : 'move';
}
const matches = (token, code) => token === code || token === modifierOf(code);
export function keyRoleImpact(mode, code, size = 20, config) {
  const direct = [],
    dependent = [],
    unavailable = [];
  for (const binding of mode.bindings) {
    const steps = parseTrigger(binding.trigger);
    if (!steps.some((step) => step.some((token) => matches(token, code)))) continue;
    (!available(binding.action, size)
      ? unavailable
      : steps.length === 1 && steps[0].length === 1
        ? direct
        : dependent
    ).push(binding);
  }
  const transforms = direct.some((b) =>
      [...SUFFIX_ACTIONS, ...HOLD_ACTIONS].includes(b.action.type),
    ),
    implicit = [];
  if (transforms) {
    // Compare the real engine results, so unavailable suffixes and unchanged
    // moves never appear as fictitious dependencies.
    const context = { size },
      settings = { ...(config ?? { version: 1, modes: [mode] }), activeMode: mode.id };
    const base = new KeyboardEngine(settings),
      modified = new KeyboardEngine(settings);
    const press = (engine, trigger) => {
      let result;
      for (const step of parseTrigger(trigger))
        for (const token of step) result = engine.keyDown(token, { now: 1, size });
      return result;
    };
    for (const binding of mode.bindings.filter(
      (b) => b.action.type === 'move' && !dependent.includes(b) && available(b.action, size),
    )) {
      base.clear();
      modified.clear();
      press(modified, code);
      modified.activateSuffixes(1, true);
      const before = press(base, binding.trigger),
        after = press(modified, binding.trigger);
      if (after?.action?.type !== 'move') continue;
      const changed = modified.resolve(after.action, context),
        original = before?.action?.type === 'move' ? base.resolve(before.action, context) : null;
      if (changed.valid && (!original?.valid || changed.label !== original.label))
        implicit.push({ ...binding, modifiedLabel: changed.label });
    }
  }
  return { direct, dependent, implicit, unavailable };
}
export function changeKeyRole(mode, code, role, action, replacement, size = 20, config) {
  const impact = keyRoleImpact(mode, code, size, config),
    affected = [...impact.direct, ...impact.dependent, ...impact.unavailable];
  let replacementKeys;
  if (replacement) {
    const steps = parseTrigger(replacement);
    if (steps.length !== 1) throw Error('Record a single key or chord, not a sequence.');
    replacementKeys = steps[0];
    if (replacementKeys.some((token) => matches(token, code) || matches(code, token)))
      throw Error('Choose a replacement that does not use the original key.');
    const engine = new KeyboardEngine({
      ...(config ?? { version: 1, modes: [mode] }),
      activeMode: mode.id,
    });
    let result;
    for (const token of replacementKeys) result = engine.keyDown(token, { now: 1, size });
    if ((result?.binding && !result.unavailable) || result?.prefix)
      throw Error(
        'That replacement key or chord already has bindings. Choose an unassigned key or chord.',
      );
  }
  const oldRole = keyRole(mode, code, size),
    remaining = mode.bindings.filter((b) => !affected.includes(b));
  const relocated = replacementKeys
    ? [...impact.direct, ...impact.dependent].map((binding) => ({
        ...binding,
        trigger: parseTrigger(binding.trigger)
          .map((step) =>
            [
              ...new Set(
                step.flatMap((token) => (matches(token, code) ? replacementKeys : [token])),
              ),
            ]
              .map(displayCode)
              .join('+'),
          )
          .join(' '),
      }))
    : [];
  if (
    relocated.some((binding) =>
      remaining.some(
        (other) =>
          available(other.action, size) && equivalentTrigger(binding.trigger, other.trigger),
      ),
    )
  )
    throw Error('That replacement key or chord already has bindings. Choose another.');
  mode.bindings = [
    ...remaining.filter(
      (other) =>
        available(other.action, size) ||
        !relocated.some((binding) => equivalentTrigger(binding.trigger, other.trigger)),
    ),
    ...relocated,
  ];
  if (replacementKeys?.length === 1)
    mode.keyRoles = { ...mode.keyRoles, [replacementKeys[0]]: oldRole };
  mode.keyRoles = { ...mode.keyRoles, [code]: role };
  if (action) {
    let id = `role-${code}`;
    while (mode.bindings.some((b) => b.id === id)) id += '-new';
    mode.bindings.push({ id, trigger: displayCode(code), action: structuredClone(action) });
  }
  return impact;
}
