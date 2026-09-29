import type { TextSpan } from '@/shared/lib/text';

/**
 * A parsed job advert.
 *
 * Job ads are even less structured than resumes: half of them are a wall of
 * prose, the rest a bulleted list under headings that vary by company. The
 * parser extracts what matching actually needs and leaves the rest alone.
 */

export type Seniority = 'junior' | 'middle' | 'senior' | 'lead' | 'unknown';

export interface JobSkillRequirement {
  /** Canonical form when the taxonomy knows it, otherwise the raw phrase. */
  canonical: string;
  raw: string;
  /** True when the ad lists it under requirements rather than nice-to-have. */
  required: boolean;
  span: TextSpan | null;
}

export interface JobDescription {
  id: string;
  title: string | null;
  company: string | null;
  seniority: Seniority;
  skills: JobSkillRequirement[];
  /** Responsibility lines, used to explain which resume bullets are relevant. */
  responsibilities: string[];
  plainText: string;
}
