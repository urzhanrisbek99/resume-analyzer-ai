export { SuggestionPanel } from './ui/suggestion-panel';
export type { SuggestionPanelProps } from './ui/suggestion-panel';

export { useEnhancementAvailability } from './model/use-availability';

export { canEnhance, excerptsFor, isEnhancementAvailable, requestSuggestions } from './api/enhance';
export type { EnhanceOutcome, RequestSuggestionsInput } from './api/enhance';
