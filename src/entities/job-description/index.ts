/** Public API of the `job-description` entity. */

export type { JobDescription, JobSkillRequirement, Seniority } from './model/types';

export { parseJobDescription, parseSkillList } from './lib/parse';
