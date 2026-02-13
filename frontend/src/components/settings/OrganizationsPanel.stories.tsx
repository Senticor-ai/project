import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import { OrganizationsPanel } from "./OrganizationsPanel";
import type { OrgResponse } from "@/lib/api-client";

const sampleOrgs: OrgResponse[] = [
  {
    id: "org-1",
    name: "Nueva Tierra",
    role: "owner",
    created_at: "2025-01-15T10:00:00Z",
  },
  {
    id: "org-2",
    name: "Autonomo Wolfgang Ihloff",
    role: "owner",
    created_at: "2025-03-20T10:00:00Z",
  },
  {
    id: "org-3",
    name: "Personal",
    role: "member",
    created_at: "2024-12-01T10:00:00Z",
  },
];

const meta = {
  title: "Settings/OrganizationsPanel",
  component: OrganizationsPanel,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="max-w-lg p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OrganizationsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    organizations: [],
    onCreateOrg: fn(),
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
  },
};

export const WithOrganizations: Story = {
  args: {
    organizations: sampleOrgs,
    onCreateOrg: fn(),
  },
};

export const ReadOnly: Story = {
  args: {
    organizations: sampleOrgs,
  },
};

export const CreateOrganization: Story = {
  args: {
    organizations: sampleOrgs,
    onCreateOrg: fn(),
  },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByText("Add organization"));
    await expect(
      canvas.getByLabelText("Organization name"),
    ).toBeInTheDocument();

    await userEvent.type(
      canvas.getByLabelText("Organization name"),
      "Steuerberater GmbH{Enter}",
    );
    await expect(args.onCreateOrg).toHaveBeenCalledWith("Steuerberater GmbH");
  },
};
