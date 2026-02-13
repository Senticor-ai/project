import type { Meta, StoryObj } from "@storybook/react-vite";
import { MarkdownViewer } from "./MarkdownViewer";

const meta = {
  title: "UI/MarkdownViewer",
  component: MarkdownViewer,
  parameters: { layout: "padded" },
} satisfies Meta<typeof MarkdownViewer>;
export default meta;
type Story = StoryObj<typeof meta>;

export const BasicText: Story = {
  args: { content: "Hello, this is a simple paragraph of text." },
};

export const Headings: Story = {
  args: {
    content: `# Heading 1
## Heading 2
### Heading 3

Some paragraph text below the headings.`,
  },
};

export const RichFormatting: Story = {
  args: {
    content: `This is **bold**, *italic*, and \`inline code\`.

> This is a blockquote with some wisdom.

---

A [link to example](https://example.com) and a horizontal rule above.`,
  },
};

export const Lists: Story = {
  args: {
    content: `## Shopping List

- Milk
- Eggs
- Bread

## Steps

1. Preheat the oven
2. Mix ingredients
3. Bake for 30 minutes`,
  },
};

export const Table: Story = {
  args: {
    content: `| Name | Role | Location |
|------|------|----------|
| Alice | Developer | Berlin |
| Bob | Product Manager | Hamburg |
| Charlie | Designer | München |`,
  },
};

export const CvSample: Story = {
  args: {
    content: `# Wolfgang Ihloff

**Product Leader | Digital Transformation | AI-Assisted Workflows**

## Berufserfahrung

### Senior Product Manager — Adobe (2018–2022)
- Led cross-functional team of 12 building enterprise document workflows
- Shipped PDF accessibility features used by 2M+ monthly active users
- Drove 40% reduction in document processing time through AI integration

### Product Manager — Startup GmbH (2015–2018)
- Built MVP for task management SaaS from 0 to 5,000 paying users
- Defined product roadmap aligned with GTD methodology

## Ausbildung

| Abschluss | Institution | Jahr |
|-----------|------------|------|
| M.Sc. Informatik | TU München | 2015 |
| B.Sc. Informatik | Uni Hamburg | 2013 |

## Fähigkeiten

- **Product**: Roadmapping, User Research, A/B Testing, OKRs
- **Technical**: Python, TypeScript, React, PostgreSQL
- **Languages**: Deutsch (Muttersprache), English (Fluent)`,
  },
};
