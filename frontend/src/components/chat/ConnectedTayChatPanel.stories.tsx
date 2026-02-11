import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { expect, fn, waitFor } from "storybook/test";
import { TayChatPanel } from "./TayChatPanel";
import { useChatState } from "@/hooks/use-chat-state";
import { store, seedMixedBuckets } from "@/test/msw/fixtures";

// ---------------------------------------------------------------------------
// Wrapper: stateful panel with real chat hooks
// ---------------------------------------------------------------------------

function ConnectedTayChatPanelDemo() {
  const [isOpen, setIsOpen] = useState(true);
  const chat = useChatState();

  return (
    <TayChatPanel
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      messages={chat.messages}
      isLoading={chat.isLoading}
      onSend={chat.sendMessage}
      onAcceptSuggestion={chat.acceptSuggestion}
      onDismissSuggestion={chat.dismissSuggestion}
    />
  );
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta = {
  title: "Chat/ConnectedTayChatPanel",
  component: TayChatPanel,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  beforeEach: () => {
    seedMixedBuckets();
  },
} satisfies Meta<typeof TayChatPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const WAIT = { timeout: 10000 };

// ---------------------------------------------------------------------------
// GreetingFlow — send greeting, see Tay response
// ---------------------------------------------------------------------------

export const GreetingFlow: Story = {
  args: {
    isOpen: true,
    onClose: fn(),
    messages: [],
    isLoading: false,
    onSend: fn(),
    onAcceptSuggestion: fn(),
    onDismissSuggestion: fn(),
  },
  render: () => <ConnectedTayChatPanelDemo />,
  play: async ({ canvas, userEvent, step }) => {
    await step("Verify empty state shows welcome", async () => {
      await waitFor(() => {
        expect(canvas.getByRole("textbox")).toBeInTheDocument();
      }, WAIT);
    });

    await step("Type and send a greeting", async () => {
      const input = canvas.getByRole("textbox");
      await userEvent.click(input);
      await userEvent.type(input, "Hallo Tay!");
      await userEvent.keyboard("{Enter}");
    });

    await step("Verify user message appears", async () => {
      await waitFor(() => {
        expect(canvas.getByText("Hallo Tay!")).toBeInTheDocument();
      }, WAIT);
    });

    await step("Verify Tay responds with greeting", async () => {
      await waitFor(() => {
        expect(
          canvas.getByText(
            "Hallo! Ich bin Tay, dein Assistent. Wie kann ich dir helfen?",
          ),
        ).toBeInTheDocument();
      }, WAIT);
    });
  },
};

// ---------------------------------------------------------------------------
// BirthdaySuggestionAccept — full birthday scenario with acceptance
// ---------------------------------------------------------------------------

export const BirthdaySuggestionAccept: Story = {
  args: {
    isOpen: true,
    onClose: fn(),
    messages: [],
    isLoading: false,
    onSend: fn(),
    onAcceptSuggestion: fn(),
    onDismissSuggestion: fn(),
  },
  render: () => <ConnectedTayChatPanelDemo />,
  play: async ({ canvas, userEvent, step }) => {
    await step("Send birthday message", async () => {
      const input = canvas.getByRole("textbox");
      await userEvent.click(input);
      await userEvent.type(
        input,
        "Ich plane eine Geburtstagsfeier und brauche Hilfe",
      );
      await userEvent.keyboard("{Enter}");
    });

    await step("Verify suggestion card renders", async () => {
      await waitFor(() => {
        expect(canvas.getByText("Geburtstagsfeier planen")).toBeInTheDocument();
        expect(canvas.getByText("Gästeliste erstellen")).toBeInTheDocument();
        expect(canvas.getByText("Einladungsvorlage")).toBeInTheDocument();
      }, WAIT);
    });

    await step("Accept the suggestion", async () => {
      const acceptBtn = canvas.getByRole("button", {
        name: /Übernehmen/,
      });
      await userEvent.click(acceptBtn);
    });

    await step("Verify confirmation appears", async () => {
      await waitFor(() => {
        expect(canvas.getByText("Übernommen")).toBeInTheDocument();
        expect(canvas.getByText(/erstellt/)).toBeInTheDocument();
      }, WAIT);
    });

    await step("Verify items were created in MSW store", async () => {
      await waitFor(() => {
        const items = Array.from(store.items.values());
        const project = items.find(
          (r) =>
            (r.item as Record<string, unknown>)["@type"] === "Project" &&
            (r.item as Record<string, unknown>).name ===
              "Geburtstagsfeier planen",
        );
        expect(project).toBeDefined();
      }, WAIT);
    });
  },
};

// ---------------------------------------------------------------------------
// BirthdaySuggestionDismiss — suggestion rendered, user dismisses
// ---------------------------------------------------------------------------

export const BirthdaySuggestionDismiss: Story = {
  args: {
    isOpen: true,
    onClose: fn(),
    messages: [],
    isLoading: false,
    onSend: fn(),
    onAcceptSuggestion: fn(),
    onDismissSuggestion: fn(),
  },
  render: () => <ConnectedTayChatPanelDemo />,
  play: async ({ canvas, userEvent, step }) => {
    await step("Send birthday message", async () => {
      const input = canvas.getByRole("textbox");
      await userEvent.click(input);
      await userEvent.type(input, "Geburtstagsfeier organisieren");
      await userEvent.keyboard("{Enter}");
    });

    await step("Wait for suggestion card", async () => {
      await waitFor(() => {
        expect(
          canvas.getByRole("button", { name: /Übernehmen/ }),
        ).toBeInTheDocument();
      }, WAIT);
    });

    await step("Dismiss the suggestion", async () => {
      const dismissBtn = canvas.getByRole("button", {
        name: /Verwerfen/,
      });
      await userEvent.click(dismissBtn);
    });

    await step("Verify suggestion is dismissed", async () => {
      await waitFor(() => {
        expect(canvas.getByText("Vorschlag verworfen")).toBeInTheDocument();
      }, WAIT);

      expect(
        canvas.queryByRole("button", { name: /Übernehmen/ }),
      ).not.toBeInTheDocument();
    });
  },
};

// ---------------------------------------------------------------------------
// ApiError — chat API returns 500
// ---------------------------------------------------------------------------

export const ApiError: Story = {
  args: {
    isOpen: true,
    onClose: fn(),
    messages: [],
    isLoading: false,
    onSend: fn(),
    onAcceptSuggestion: fn(),
    onDismissSuggestion: fn(),
  },
  parameters: {
    msw: {
      handlers: [
        http.post("*/chat/completions", () => {
          return HttpResponse.json(
            { detail: "Internal server error" },
            { status: 500 },
          );
        }),
      ],
    },
  },
  render: () => <ConnectedTayChatPanelDemo />,
  play: async ({ canvas, userEvent, step }) => {
    await step("Send a message", async () => {
      const input = canvas.getByRole("textbox");
      await userEvent.click(input);
      await userEvent.type(input, "Erstelle etwas");
      await userEvent.keyboard("{Enter}");
    });

    await step("Verify error message appears", async () => {
      await waitFor(() => {
        expect(
          canvas.getByText(
            "Es ist ein Fehler aufgetreten. Bitte versuche es erneut.",
          ),
        ).toBeInTheDocument();
      }, WAIT);
    });
  },
};

// ---------------------------------------------------------------------------
// MultiTurnConversation — greeting then birthday, both visible
// ---------------------------------------------------------------------------

export const MultiTurnConversation: Story = {
  args: {
    isOpen: true,
    onClose: fn(),
    messages: [],
    isLoading: false,
    onSend: fn(),
    onAcceptSuggestion: fn(),
    onDismissSuggestion: fn(),
  },
  render: () => <ConnectedTayChatPanelDemo />,
  play: async ({ canvas, userEvent, step }) => {
    await step("Send greeting", async () => {
      const input = canvas.getByRole("textbox");
      await userEvent.click(input);
      await userEvent.type(input, "Hallo!");
      await userEvent.keyboard("{Enter}");
    });

    await step("Wait for greeting response", async () => {
      await waitFor(() => {
        expect(
          canvas.getByText(/Ich bin Tay, dein Assistent/),
        ).toBeInTheDocument();
      }, WAIT);
    });

    await step("Send birthday planning request", async () => {
      const input = canvas.getByRole("textbox");
      await userEvent.click(input);
      await userEvent.type(input, "Geburtstag planen");
      await userEvent.keyboard("{Enter}");
    });

    await step("Verify suggestion card appears", async () => {
      await waitFor(() => {
        expect(canvas.getByText("Geburtstagsfeier planen")).toBeInTheDocument();
      }, WAIT);
    });

    await step("Verify both turns are still visible", async () => {
      expect(canvas.getByText("Hallo!")).toBeInTheDocument();
      expect(canvas.getByText("Geburtstag planen")).toBeInTheDocument();
    });
  },
};
