import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, expect } from "storybook/test";
import { LoginPage } from "./LoginPage";

const meta = {
  title: "Auth/LoginPage",
  component: LoginPage,
  parameters: { layout: "fullscreen" },
  args: {
    onLogin: fn(),
    onRegister: fn(),
  },
} satisfies Meta<typeof LoginPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const RegisterMode: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText("Create one"));
    expect(canvas.getByLabelText("Username")).toBeInTheDocument();
    expect(
      canvas.getByRole("heading", { name: "Create account" }),
    ).toBeInTheDocument();
  },
};

export const ToggleModes: Story = {
  play: async ({ canvas, userEvent }) => {
    // Start in login mode
    expect(
      canvas.getByRole("heading", { name: "Sign in" }),
    ).toBeInTheDocument();

    // Switch to register
    await userEvent.click(canvas.getByText("Create one"));
    expect(canvas.getByLabelText("Username")).toBeInTheDocument();

    // Switch back to login — click the "Sign in" link (not the heading)
    await userEvent.click(canvas.getByRole("button", { name: "Sign in" }));
    expect(canvas.queryByLabelText("Username")).not.toBeInTheDocument();
  },
};

export const FillAndSubmitLogin: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.type(canvas.getByLabelText("Email"), "test@example.com");
    await userEvent.type(canvas.getByLabelText("Password"), "password123");
    await userEvent.click(canvas.getByRole("button", { name: "Sign in" }));

    expect(args.onLogin).toHaveBeenCalledWith(
      "test@example.com",
      "password123",
    );
  },
};

export const FillAndSubmitRegister: Story = {
  play: async ({ canvas, userEvent, args }) => {
    // Switch to register mode
    await userEvent.click(canvas.getByText("Create one"));

    await userEvent.type(canvas.getByLabelText("Email"), "new@example.com");
    await userEvent.type(canvas.getByLabelText("Username"), "newuser");
    await userEvent.type(canvas.getByLabelText("Password"), "password123");
    await userEvent.click(
      canvas.getByRole("button", { name: "Create account" }),
    );

    expect(args.onRegister).toHaveBeenCalledWith(
      "new@example.com",
      "newuser",
      "password123",
    );
  },
};

export const ShowError: Story = {
  args: {
    initialError: "Invalid credentials",
  },
  play: async ({ canvas }) => {
    expect(canvas.getByText("Invalid credentials")).toBeInTheDocument();
  },
};
