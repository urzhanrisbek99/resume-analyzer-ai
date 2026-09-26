import { stableId } from '@/shared/lib/id';
import { canonicalizeSkill, findSkillsInText } from '@/shared/lib/skill-taxonomy';
import { detectScript, findSpan, squish } from '@/shared/lib/text';

import type {
  ResumeDocument,
  ResumeLanguageInfo,
  ResumeSection,
  SectionKind,
  SkillItem,
  SourceFileMeta,
} from '@/entities/resume/model/types';

import type { RawExtraction } from './extract';
import { parseContacts } from './parse/contacts';
import { parseCertifications, parseEducation, parseLanguages } from './parse/education';
import { parseExperience } from './parse/experience';
import { segmentResume } from './segment/segment';

/**
 * Assemble the normalised document from a raw extraction.
 *
 * This is the seam the whole product is built on: everything above it -- every
 * rule, every score, the entire UI -- reads `ResumeDocument` and never touches a
 * file format. Adding a new input format means adding an extractor, nothing else.
 */

export interface BuildDocumentInput {
  extraction: RawExtraction;
  file: Omit<SourceFileMeta, 'pageCount' | 'format'>;
  /** Wall-clock cost of extraction, for the performance panel. */
  extractionMs: number;
}

export function buildResumeDocument(input: BuildDocumentInput): ResumeDocument {
  const { extraction, file, extractionMs } = input;
  const { plainText, layout, lines } = extraction;

  const segmentation = segmentResume(plainText, lines);
  const sections = segmentation.sections;

  const headerText = textOf(sections, 'contacts') || plainText.slice(0, 600);

  const contacts = parseContacts({
    headerText,
    plainText,
    embeddedLinks: layout.embeddedLinks,
    hasImageLikelyPhoto: layout.hasLikelyPhoto,
  });

  const experienceSections = sectionsOf(sections, 'experience');
  const experience = experienceSections.flatMap((section) =>
    parseExperience(section.text, bodyOffset(section, plainText)),
  );

  const educationSections = sectionsOf(sections, 'education');
  const education = educationSections.flatMap((section) =>
    parseEducation(section.text, bodyOffset(section, plainText)),
  );

  const languageSections = sectionsOf(sections, 'languages');
  const languages = languageSections.flatMap((section) =>
    parseLanguages(section.text, bodyOffset(section, plainText)),
  );

  const certifications = sectionsOf(sections, 'certifications').flatMap((section) =>
    parseCertifications(section.text),
  );

  const skills = collectSkills(sections, plainText);
  const projects = collectProjects(sections, plainText);

  const script = detectScript(plainText);
  const language: ResumeLanguageInfo = {
    primary:
      script.script === 'latin'
        ? 'en'
        : script.script === 'cyrillic'
          ? 'ru'
          : script.script === 'mixed'
            ? 'mixed'
            : 'unknown',
    latinRatio: script.latinRatio,
    isMixed: script.script === 'mixed',
  };

  return {
    id: stableId('doc', file.name, plainText.length),
    file: { ...file, format: extraction.format, pageCount: layout.pageCount },
    plainText,
    layout,
    language,
    sections,
    contacts,
    experience,
    education,
    skills,
    projects,
    certifications,
    languages,
    extraction: {
      strategy: extraction.format,
      warnings: [
        ...extraction.warnings,
        ...(segmentation.usedContentInference
          ? ['Часть разделов определена по содержимому, а не по заголовкам.']
          : []),
      ],
      durationMs: Math.round(extractionMs),
      usedLlmSegmentation: false,
    },
  };
}

function sectionsOf(sections: ResumeSection[], kind: SectionKind): ResumeSection[] {
  return sections.filter((section) => section.kind === kind);
}

function textOf(sections: ResumeSection[], kind: SectionKind): string {
  return sectionsOf(sections, kind)
    .map((section) => section.text)
    .join('\n');
}

/**
 * Offset of a section body inside the document.
 *
 * `section.span.start` points at the heading; the parsed text begins after it,
 * so spans built from `section.text` would otherwise be shifted by the heading
 * length and highlight the wrong characters in the preview.
 */
function bodyOffset(section: ResumeSection, plainText: string): number {
  const found = plainText.indexOf(section.text, section.span.start);
  return found === -1 ? section.span.start : found;
}

/**
 * Skills come from the skills section when there is one, and from the whole
 * document otherwise -- a resume with no skills section still demonstrates
 * technologies inside its job bullets, and keyword matching must see them.
 */
function collectSkills(sections: ResumeSection[], plainText: string): SkillItem[] {
  const skillSections = sectionsOf(sections, 'skills');
  const items = new Map<string, SkillItem>();

  const addFrom = (text: string, offset: number) => {
    for (const skill of findSkillsInText(text)) {
      if (items.has(skill.canonical)) continue;
      const local = findSpan(text.toLowerCase(), skill.canonical.toLowerCase());
      items.set(skill.canonical, {
        raw: skill.canonical,
        canonical: skill.canonical,
        category: skill.category,
        span: local ? { start: offset + local.start, end: offset + local.end } : null,
      });
    }
  };

  if (skillSections.length > 0) {
    for (const section of skillSections) {
      addFrom(section.text, bodyOffset(section, plainText));

      // Keep comma-separated entries the taxonomy does not know: a niche tool is
      // still a keyword a recruiter may search for.
      for (const raw of section.text.split(/[,;|•·\n]/u)) {
        const token = squish(raw.replace(/^[\s\-–—*]+/u, ''));
        if (token.length < 2 || token.length > 40) continue;
        if (canonicalizeSkill(token)) continue;
        if (!/[\p{L}]/u.test(token)) continue;
        if (items.has(token)) continue;

        items.set(token, { raw: token, canonical: token, category: 'other', span: null });
      }
    }
  }

  addFrom(plainText, 0);

  return [...items.values()];
}

const PROJECT_URL_RE = /(https?:\/\/[^\s)]+|(?:[\w-]+\.)+(?:com|io|dev|me|org|net)\/[^\s)]*)/i;

function collectProjects(sections: ResumeSection[], plainText: string) {
  return sectionsOf(sections, 'projects').flatMap((section) => {
    const offset = bodyOffset(section, plainText);
    let cursor = 0;

    return section.text
      .split(/\n{2,}/)
      .map((block, i) => {
        const text = squish(block);
        const start = offset + cursor;
        cursor += block.length + 2;
        if (text.length < 8) return null;

        const [firstLine = '', ...rest] = block
          .split('\n')
          .map(squish)
          .filter((line) => line.length > 0);

        return {
          id: stableId('prj', text, i),
          name: squish(firstLine.replace(/^[\s\-–—*•]+/u, '')).slice(0, 90) || null,
          description: rest.join(' ').slice(0, 400) || null,
          url: PROJECT_URL_RE.exec(text)?.[0] ?? null,
          span: { start, end: start + block.length },
        };
      })
      .filter((project): project is NonNullable<typeof project> => project !== null);
  });
}
