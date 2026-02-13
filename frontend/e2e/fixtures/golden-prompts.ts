/**
 * Golden dataset for Tay chat evaluation.
 *
 * Single source of truth for known prompt-response scenarios used by:
 * - `tay-chat-mocked.spec.ts` (integration): deterministic tests with canned responses
 * - `tay-chat-llm.spec.ts` (E2E): real LLM tests with structural assertions
 *
 * Adding a new scenario here automatically creates tests in both layers.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Post-accept workspace assertion: navigate to a bucket and verify items. */
export interface BucketAssertion {
  /** Bucket nav label as shown in the sidebar (e.g. "Projects", "Next", "Reference"). */
  bucket: string;
  /**
   * Expected item names in this bucket.
   * - Integration tests: exact text match for all names.
   * - E2E tests: depends on `structural` flag.
   */
  itemNames: string[];
  /**
   * When true, E2E tests only assert the bucket is non-empty (the LLM picks
   * its own names). When false/omitted, E2E tests also match exact item names.
   */
  structural?: boolean;
}

/** A single golden prompt-response scenario for Tay chat. */
export interface GoldenScenario {
  /** Unique slug identifier (e.g. "birthday-planning"). */
  id: string;
  /** Human-readable description for test titles. */
  description: string;
  /** German user message sent to Tay. */
  prompt: string;
  /** Which tool the LLM should call (e.g. "create_project_with_actions"). */
  expectedToolCall: string;
  /**
   * Canned response for integration tests — the exact JSON that
   * `page.route()` returns for `*/chat/completions`.
   * Shape matches the backend's `ChatCompletionResponse`.
   */
  cannedResponse: {
    text: string;
    toolCalls: Array<{
      name: string;
      arguments: Record<string, unknown>;
    }>;
  };
  /** What to verify in the workspace after accepting the suggestion. */
  assertions: BucketAssertion[];
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

export const GOLDEN_SCENARIOS: GoldenScenario[] = [
  {
    id: "birthday-planning",
    description: "Geburtstagsfeier planen",
    prompt: "Ich plane eine Geburtstagsfeier und brauche Hilfe",
    expectedToolCall: "create_project_with_actions",
    cannedResponse: {
      text: "Klingt nach einem Projekt! Hier ist mein Vorschlag:",
      toolCalls: [
        {
          name: "create_project_with_actions",
          arguments: {
            type: "create_project_with_actions",
            project: {
              name: "Geburtstagsfeier planen",
              desiredOutcome: "Erfolgreiche Geburtstagsfeier",
            },
            actions: [
              { name: "Gästeliste erstellen", bucket: "next" },
              { name: "Einladungen versenden", bucket: "next" },
              { name: "Location buchen", bucket: "next" },
            ],
            documents: [{ name: "Einladungsvorlage" }],
          },
        },
      ],
    },
    assertions: [
      {
        bucket: "Projects",
        itemNames: ["Geburtstagsfeier planen"],
        structural: true, // E2E: LLM picks its own project name
      },
      {
        bucket: "Next",
        itemNames: [
          "Gästeliste erstellen",
          "Einladungen versenden",
          "Location buchen",
        ],
        structural: true, // E2E: LLM picks its own action names
      },
      // Reference is NOT asserted in E2E — the LLM may not create documents
      // for this vague prompt. The mocked test verifies document rendering
      // via suggestion card content check (step 3) + execute-tool (step 4).
    ],
  },
  {
    id: "umzug-planen",
    description: "Umzug planen",
    prompt:
      "Erstelle mir bitte ein Projekt 'Umzug planen' " +
      "mit dem gewünschten Ergebnis 'Erfolgreicher Umzug in die neue Wohnung' " +
      "und 3 konkreten Aktionen für den Bucket 'next'.",
    expectedToolCall: "create_project_with_actions",
    cannedResponse: {
      text: "Hier ist mein Vorschlag für deinen Umzug:",
      toolCalls: [
        {
          name: "create_project_with_actions",
          arguments: {
            type: "create_project_with_actions",
            project: {
              name: "Umzug planen",
              desiredOutcome: "Erfolgreicher Umzug in die neue Wohnung",
            },
            actions: [
              { name: "Umzugskartons besorgen", bucket: "next" },
              { name: "Angebote von Umzugsunternehmen einholen", bucket: "next" },
              { name: "Umzugstermin mit Vermieter abstimmen", bucket: "next" },
            ],
          },
        },
      ],
    },
    assertions: [
      {
        bucket: "Projects",
        itemNames: ["Umzug planen"],
      },
      {
        bucket: "Next",
        itemNames: [
          "Umzugskartons besorgen",
          "Angebote von Umzugsunternehmen einholen",
          "Umzugstermin mit Vermieter abstimmen",
        ],
        structural: true, // E2E: LLM chooses its own action names
      },
    ],
  },
];
