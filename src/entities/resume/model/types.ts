import type { DateRange } from '@/shared/lib/dates';
import type { TextSpan } from '@/shared/lib/text';

/**
 * The normalised resume.
 *
 * Every downstream rule reads this structure and nothing else, which is what
 * lets the analyzer treat a template-perfect PDF and a hand-rolled one-column
 * text file identically: only the extraction strategy differs, never the model.
 */

export type SourceFormat = 'pdf' | 'docx' | 'txt' | 'md';

export interface SourceFileMeta {
  name: string;
  sizeBytes: number;
  format: SourceFormat;
  pageCount: number;
}

/**
 * Physical facts about the document, collected during extraction.
 *
 * These drive the parseability dimension. They must be gathered while the
 * original file is open, because they are unrecoverable from plain text alone.
 */
export interface LayoutEvidence {
  /** False for image-only scans — the single most fatal ATS defect. */
  hasTextLayer: boolean;
  textCharCount: number;
  pageCount: number;
  /** Highest number of text columns detected on any page. */
  maxColumnsPerPage: number;
  /** Pages whose body text splits into more than one column. */
  multiColumnPages: number[];
  tableCount: number;
  imageCount: number;
  /** True when an image is large enough to plausibly be a portrait photo. */
  hasLikelyPhoto: boolean;
  /** Content repeated in the top or bottom margin across pages. */
  hasHeaderFooterContent: boolean;
  headerFooterSamples: string[];
  fontFamilies: string[];
  /** Fonts outside the set ATS parsers reliably handle. */
  nonStandardFonts: string[];
  /** Ligatures and private-use glyphs that garble copied text. */
  hasProblematicGlyphs: boolean;
  problematicGlyphSamples: string[];
  /** Hyperlink targets embedded as annotations rather than visible text. */
  embeddedLinks: string[];
  /** Text boxes and frames, which many parsers skip entirely. */
  textBoxCount: number;
}

export type SectionKind =
  | 'contacts'
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'certifications'
  | 'languages'
  | 'awards'
  | 'publications'
  | 'volunteering'
  | 'interests'
  | 'references'
  | 'unknown';

export type DetectionSource = 'heuristic' | 'llm' | 'fallback';

export interface ResumeSection {
  id: string;
  kind: SectionKind;
  /** The heading exactly as written, or null when the section was inferred. */
  rawHeading: string | null;
  /** Offsets into `ResumeDocument.plainText`, so findings can point at text. */
  span: TextSpan;
  text: string;
  /** 0-1. Low confidence is what triggers the LLM segmentation fallback. */
  confidence: number;
  detectedBy: DetectionSource;
  order: number;
}

export type LinkKind =
  | 'linkedin'
  | 'github'
  | 'gitlab'
  | 'portfolio'
  | 'telegram'
  | 'stackoverflow'
  | 'behance'
  | 'other';

export interface ResumeLink {
  kind: LinkKind;
  url: string;
  /** False for a bare handle or a broken URL, which recruiters cannot click. */
  isResolvable: boolean;
}

/**
 * Personal data fields that hurt a candidate on the international market, where
 * including them invites discrimination claims and gets resumes discarded.
 */
export type SensitiveField =
  | 'photo'
  | 'birthDate'
  | 'age'
  | 'maritalStatus'
  | 'gender'
  | 'nationality'
  | 'religion'
  | 'idNumber'
  | 'fullHomeAddress'
  | 'salaryExpectation';

export interface ContactBlock {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  /** City and country only; a full street address is flagged as sensitive. */
  location: string | null;
  headline: string | null;
  links: ResumeLink[];
  sensitiveFields: SensitiveField[];
}

export interface ExperienceBullet {
  id: string;
  text: string;
  span: TextSpan;
}

export interface ExperienceItem {
  id: string;
  company: string | null;
  title: string | null;
  location: string | null;
  period: DateRange | null;
  bullets: ExperienceBullet[];
  span: TextSpan;
  /** 0-1 confidence that company/title were split correctly. */
  confidence: number;
}

export interface EducationItem {
  id: string;
  institution: string | null;
  degree: string | null;
  field: string | null;
  period: DateRange | null;
  span: TextSpan;
}

export type SkillCategory =
  'language' | 'framework' | 'database' | 'cloud' | 'tooling' | 'practice' | 'soft' | 'other';

export interface SkillItem {
  /** As written in the resume. */
  raw: string;
  /** Canonical form used for job-description matching. */
  canonical: string;
  category: SkillCategory;
  span: TextSpan | null;
}

export interface ProjectItem {
  id: string;
  name: string | null;
  description: string | null;
  url: string | null;
  span: TextSpan;
}

export interface LanguageProficiency {
  language: string;
  /** CEFR level when stated, otherwise a free-form label such as "fluent". */
  level: string | null;
  span: TextSpan | null;
}

export interface ExtractionReport {
  strategy: SourceFormat;
  /** Non-fatal problems worth surfacing, e.g. a page that yielded no text. */
  warnings: string[];
  durationMs: number;
  /** True when heading detection fell back to the LLM segmenter. */
  usedLlmSegmentation: boolean;
}

export interface ResumeLanguageInfo {
  primary: 'en' | 'ru' | 'mixed' | 'unknown';
  /** Share of Latin characters among all letters, 0-1. */
  latinRatio: number;
  isMixed: boolean;
}

export interface ResumeDocument {
  id: string;
  file: SourceFileMeta;
  /** The single source of truth for every span in every finding. */
  plainText: string;
  layout: LayoutEvidence;
  language: ResumeLanguageInfo;
  sections: ResumeSection[];
  contacts: ContactBlock;
  experience: ExperienceItem[];
  education: EducationItem[];
  skills: SkillItem[];
  projects: ProjectItem[];
  certifications: string[];
  languages: LanguageProficiency[];
  extraction: ExtractionReport;
}
