/**
 * Cross-import surface for the `analysis` entity (FSD 2.1 `@x` notation).
 *
 * The rule engine is defined in terms of a parsed resume, so it needs these
 * types. Exposing them here rather than through the public API keeps the
 * dependency explicit and one-directional: `analysis` may read `resume`, and
 * the linter enforces that nothing flows the other way.
 */

export type {
  ContactBlock,
  EducationItem,
  ExperienceBullet,
  ExperienceItem,
  LanguageProficiency,
  LayoutEvidence,
  ProjectItem,
  ResumeDocument,
  ResumeLink,
  ResumeSection,
  SectionKind,
  SensitiveField,
  SkillCategory,
  SkillItem,
} from '../model/types';
