/**
 * GM Policy Enforcement
 *
 * Machine-checkable constraints for driving-safe gameplay.
 * All narration and choices must pass validation before delivery.
 */

import { CONSTANTS } from './events';

// ============================================================================
// Policy Rules (Decision-Locked)
// ============================================================================

export const DRIVING_MODE_RULES = {
  // Narration limits
  MAX_NARRATION_SECONDS: CONSTANTS.MAX_NARRATION_SECONDS,
  MAX_NARRATION_WORDS: CONSTANTS.MAX_NARRATION_WORDS,

  // Choice limits
  MAX_CHOICES: CONSTANTS.MAX_CHOICES,
  CHOICE_FORMAT: 'simple' as const,  // "this or that", not A/B/C

  // Forbidden content patterns
  FORBIDDEN_PATTERNS: [
    /spell.*these.*words/i,
    /choose.*from.*\d+.*options/i,
    /remember.*the.*sequence/i,
    /look.*at.*screen/i,
    /tap|swipe|touch|press.*button/i,
    /timer|countdown|hurry|quick/i,
    /say.*yes.*to.*confirm/i,
    /confirm.*by.*saying/i,
    /pick.*number.*\d/i,
    /option.*[3-9]/i,  // More than 2 numbered options
  ],

  // Memory/recall limits
  MAX_ITEMS_TO_REMEMBER: 0,
  MAX_SEQUENCE_LENGTH: 0,

  // Confirmation behavior
  REQUIRE_CONFIRMATION: false,

  // Fail-safe behavior
  ON_VIOLATION: 'rephrase' as const,
  MAX_REPHRASE_ATTEMPTS: 3,
} as const;

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationResult {
  ok: boolean;
  violations: Violation[];
}

export interface Violation {
  rule: string;
  message: string;
  severity: 'error' | 'warning';
}

// ============================================================================
// Narration Validation
// ============================================================================

export function validateNarration(text: string): ValidationResult {
  const violations: Violation[] = [];

  // Check word count
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
  if (wordCount > DRIVING_MODE_RULES.MAX_NARRATION_WORDS) {
    violations.push({
      rule: 'MAX_NARRATION_WORDS',
      message: `Narration has ${wordCount} words, max is ${DRIVING_MODE_RULES.MAX_NARRATION_WORDS}`,
      severity: 'error',
    });
  }

  // Estimate duration (rough: 150 words per minute = 2.5 words/second)
  const estimatedSeconds = wordCount / 2.5;
  if (estimatedSeconds > DRIVING_MODE_RULES.MAX_NARRATION_SECONDS) {
    violations.push({
      rule: 'MAX_NARRATION_SECONDS',
      message: `Narration estimated at ${estimatedSeconds.toFixed(1)}s, max is ${DRIVING_MODE_RULES.MAX_NARRATION_SECONDS}s`,
      severity: 'error',
    });
  }

  // Check forbidden patterns
  for (const pattern of DRIVING_MODE_RULES.FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) {
      violations.push({
        rule: 'FORBIDDEN_PATTERN',
        message: `Narration matches forbidden pattern: ${pattern.toString()}`,
        severity: 'error',
      });
    }
  }

  return {
    ok: violations.length === 0,
    violations,
  };
}

// ============================================================================
// Choice Validation
// ============================================================================

export function validateChoices(choices: string[]): ValidationResult {
  const violations: Violation[] = [];

  // Check choice count
  if (choices.length > DRIVING_MODE_RULES.MAX_CHOICES) {
    violations.push({
      rule: 'MAX_CHOICES',
      message: `${choices.length} choices provided, max is ${DRIVING_MODE_RULES.MAX_CHOICES}`,
      severity: 'error',
    });
  }

  // Check for numbered options (bad UX for voice)
  for (const choice of choices) {
    if (/^[0-9][\.\)\:]/.test(choice.trim())) {
      violations.push({
        rule: 'NUMBERED_CHOICE',
        message: `Choice "${choice}" uses numbered format; use natural language`,
        severity: 'warning',
      });
    }
  }

  return {
    ok: violations.filter(v => v.severity === 'error').length === 0,
    violations,
  };
}

// ============================================================================
// Full Response Validation
// ============================================================================

export interface GMResponse {
  narration: string;
  choices?: string[];
}

export function validateGMResponse(response: GMResponse): ValidationResult {
  const narrationResult = validateNarration(response.narration);
  const choiceResult = response.choices
    ? validateChoices(response.choices)
    : { ok: true, violations: [] };

  return {
    ok: narrationResult.ok && choiceResult.ok,
    violations: [...narrationResult.violations, ...choiceResult.violations],
  };
}

// ============================================================================
// Policy Repair Prompt
// ============================================================================

export const POLICY_REPAIR_PROMPT = `
Your previous response violated driving safety policy. Violations:
{violations}

Rewrite your response following these STRICT rules:
1. Maximum 60 words, 12 seconds when spoken
2. Maximum 2 choices, phrased as "X or Y?" (not numbered)
3. No memory puzzles, sequences, or multi-step recall
4. No confirmations ("say yes to confirm")
5. No time pressure ("hurry", "quick")
6. No screen/touch references

Provide a compliant response:
`;

export function buildRepairPrompt(violations: Violation[]): string {
  const violationList = violations
    .map(v => `- ${v.rule}: ${v.message}`)
    .join('\n');
  return POLICY_REPAIR_PROMPT.replace('{violations}', violationList);
}

// ============================================================================
// Fallback Response
// ============================================================================

export const FALLBACK_RESPONSES = [
  "The path ahead offers two ways. Which do you choose?",
  "A decision awaits. Do you proceed or wait?",
  "What would you like to do next?",
  "The moment calls for action. Fight or flee?",
] as const;

export function getFallbackResponse(): string {
  const index = Math.floor(Math.random() * FALLBACK_RESPONSES.length);
  return FALLBACK_RESPONSES[index];
}
