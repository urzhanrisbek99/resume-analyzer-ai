import type { Rule } from '@/entities/analysis/model/types';

import { contentRules } from './content';
import { internationalRules } from './international';
import { keywordRules } from './keywords';
import { languageRules } from './language';
import { narrativeRules } from './narrative';
import { parseabilityRules } from './parseability';
import { structureRules } from './structure';

/**
 * The rule registry.
 *
 * Adding a rule means adding one object to one array. Nothing else in the
 * system needs to change: the engine discovers rules from here, scoring adjusts
 * automatically, and the UI renders whatever findings come back.
 */
export const ALL_RULES: readonly Rule[] = [
  ...parseabilityRules,
  ...structureRules,
  ...contentRules,
  ...keywordRules,
  ...narrativeRules,
  ...languageRules,
  ...internationalRules,
];

/** Guards against a copy-pasted rule silently shadowing another. */
export function assertUniqueRuleIds(rules: readonly Rule[] = ALL_RULES): void {
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const rule of rules) {
    if (seen.has(rule.id)) duplicates.push(rule.id);
    seen.add(rule.id);
  }

  if (duplicates.length > 0) {
    throw new Error(`Duplicate rule ids: ${duplicates.join(', ')}`);
  }
}

export { contentRules } from './content';
export { internationalRules } from './international';
export { keywordRules } from './keywords';
export { languageRules } from './language';
export { narrativeRules } from './narrative';
export { parseabilityRules } from './parseability';
export { structureRules } from './structure';
