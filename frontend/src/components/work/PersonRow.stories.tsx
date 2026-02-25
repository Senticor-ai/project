import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PersonRow } from "./PersonRow";
import { createPersonItem, resetFactoryCounter } from "@/model/factories";

resetFactoryCounter();

const meta = {
  title: "Work/PersonRow",
  component: PersonRow,
  tags: ["autodocs"],
  args: {
    onArchive: fn(),
    onSelect: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PersonRow>;

export default meta;
type Story = StoryObj<typeof meta>;

const steuerberater = createPersonItem({
  name: "Steuerberater Schmidt",
  jobTitle: "Steuerberater",
  email: "schmidt@steuer.de",
  telephone: "+49 123 456789",
  orgRole: "accountant",
  orgRef: { id: "org-nueva", name: "Nueva Tierra DE" },
});

const founder = createPersonItem({
  name: "Wolfgang Ihloff",
  jobTitle: "Geschäftsführer",
  email: "w@neue-terra.de",
  orgRole: "founder",
  orgRef: { id: "org-nueva", name: "Nueva Tierra DE" },
});

const advisor = createPersonItem({
  name: "María García",
  jobTitle: "Legal Advisor",
  email: "maria@despacho.es",
  orgRole: "advisor",
  orgRef: { id: "org-autonomo", name: "Autónomo Wolfgang ES" },
});

const minimalPerson = createPersonItem({
  name: "Klaus Müller",
  orgRole: "member",
  orgRef: { id: "org-personal", name: "Persönlich" },
});

const noOrgPerson = createPersonItem({
  name: "Anna Beispiel",
  email: "anna@beispiel.de",
  telephone: "+49 800 1234567",
  orgRole: "interest",
});

export const Accountant: Story = {
  args: { item: steuerberater },
};

export const Founder: Story = {
  args: { item: founder },
};

export const Advisor: Story = {
  args: { item: advisor },
};

export const Minimal: Story = {
  args: { item: minimalPerson },
};

export const NoOrg: Story = {
  args: { item: noOrgPerson },
};

export const AllRoles: Story = {
  args: { item: steuerberater },
  render: (args) => (
    <div className="space-y-1">
      <PersonRow {...args} item={steuerberater} />
      <PersonRow {...args} item={founder} />
      <PersonRow {...args} item={advisor} />
      <PersonRow {...args} item={minimalPerson} />
      <PersonRow {...args} item={noOrgPerson} />
    </div>
  ),
};
