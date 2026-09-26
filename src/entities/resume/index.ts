/**
 * Public API of the `resume` entity.
 *
 * Everything above this layer imports from here and nowhere else, so the
 * internal split between extraction, segmentation and parsing stays free to
 * change without touching a single consumer.
 */

export type {
  ContactBlock,
  DetectionSource,
  EducationItem,
  ExperienceBullet,
  ExperienceItem,
  ExtractionReport,
  LanguageProficiency,
  LayoutEvidence,
  LinkKind,
  ProjectItem,
  ResumeDocument,
  ResumeLanguageInfo,
  ResumeLink,
  ResumeSection,
  SectionKind,
  SensitiveField,
  SkillCategory,
  SkillItem,
  SourceFileMeta,
  SourceFormat,
} from './model/types';

export { detectFormat, extractFromFile, extractFromText } from './lib/extract';
export type { ExtractFileInput, PositionedLine, RawExtraction } from './lib/extract';

export { buildResumeDocument } from './lib/build-document';
export type { BuildDocumentInput } from './lib/build-document';

export { LOW_CONFIDENCE_THRESHOLD, inferKind, segmentResume } from './lib/segment/segment';
export type { SegmentationResult } from './lib/segment/segment';

export { classifyHeading, knownHeadingsFor } from './lib/segment/headings';

export { assertRedacted, redactForLlm, restore } from './lib/redact';
export type { RedactedText, RedactionMap } from './lib/redact';
