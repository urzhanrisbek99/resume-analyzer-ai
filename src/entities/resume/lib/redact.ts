import type { ResumeDocument } from '@/entities/resume/model/types';

/**
 * PII redaction.
 *
 * Nothing leaves the device except when the user explicitly asks for AI
 * suggestions, and even then the model sees the writing, not the person. Names,
 * contact details and links are replaced with stable placeholders before the
 * text crosses the network boundary, and restored on the way back so the
 * suggestion still reads naturally.
 *
 * This is a product guarantee, not a nicety: a resume is one of the most
 * sensitive documents a person owns, and "we only send it to the model" is the
 * kind of sentence that loses a user's trust the moment they think about it.
 */

export interface RedactionMap {
  /** placeholder -> original value. */
  entries: Record<string, string>;
}

export interface RedactedText {
  text: string;
  map: RedactionMap;
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]*\w/g;
const PHONE_RE = /(?:\+\d{1,3}[\s(-]?)?(?:\d[\s()-]?){9,14}\d/g;
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>",;)\]]+/gi;

/**
 * Redact a document into text safe to send to a model.
 *
 * Longer values are replaced first so that a name appearing inside an email
 * address does not leave a fragment behind.
 */
export function redactForLlm(document: ResumeDocument, text?: string): RedactedText {
  const source = text ?? document.plainText;
  const entries: Record<string, string> = {};

  const values: string[] = [];
  if (document.contacts.fullName) values.push(document.contacts.fullName);
  if (document.contacts.email) values.push(document.contacts.email);
  if (document.contacts.phone) values.push(document.contacts.phone);
  if (document.contacts.location) values.push(document.contacts.location);
  for (const link of document.contacts.links) values.push(link.url);

  let redacted = source;
  let counter = 0;

  for (const value of [...new Set(values)].sort((a, b) => b.length - a.length)) {
    if (value.trim().length < 3) continue;
    const placeholder = `[[PII_${counter++}]]`;
    const replaced = redacted.split(value).join(placeholder);
    if (replaced !== redacted) {
      entries[placeholder] = value;
      redacted = replaced;
    }
  }

  // Catch-all for contact data the parser missed. Order matters: an email
  // contains no phone, but a URL can contain digits that look like one.
  redacted = redacted.replace(EMAIL_RE, () => register('EMAIL'));
  redacted = redacted.replace(URL_RE, () => register('URL'));
  redacted = redacted.replace(PHONE_RE, (match) =>
    match.replace(/\D/g, '').length >= 10 ? register('PHONE') : match,
  );

  function register(kind: string): string {
    const placeholder = `[[${kind}_${counter++}]]`;
    entries[placeholder] = '';
    return placeholder;
  }

  return { text: redacted, map: { entries } };
}

/** Put the real values back into a model response. */
export function restore(text: string, map: RedactionMap): string {
  let restored = text;
  for (const [placeholder, original] of Object.entries(map.entries)) {
    if (original.length === 0) continue;
    restored = restored.split(placeholder).join(original);
  }
  return restored;
}

/**
 * Assert that redacted text carries none of the known personal values.
 *
 * Called before every outbound request. A redaction bug must fail loudly rather
 * than quietly leak, so this throws instead of returning a boolean.
 */
export function assertRedacted(redacted: string, document: ResumeDocument): void {
  const leaked: string[] = [];
  const check = (value: string | null, label: string) => {
    if (value && value.trim().length >= 3 && redacted.includes(value)) leaked.push(label);
  };

  check(document.contacts.fullName, 'name');
  check(document.contacts.email, 'email');
  check(document.contacts.phone, 'phone');
  for (const link of document.contacts.links) check(link.url, 'link');

  if (leaked.length > 0) {
    throw new Error(`Redaction failed, refusing to send: ${[...new Set(leaked)].join(', ')}`);
  }
}
