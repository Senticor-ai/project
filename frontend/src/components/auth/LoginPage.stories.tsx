import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, expect } from "storybook/test";
import { LoginPage } from "./LoginPage";

const meta = {
  title: "Screens/Login",
  component: LoginPage,
  parameters: { layout: "fullscreen" },
  args: {
    onLogin: fn(),
    onRegister: fn(),
  },
} satisfies Meta<typeof LoginPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    // Left column: ontology narrative visible
    expect(canvas.getByText("Open ontology")).toBeInTheDocument();
    expect(canvas.getByText("Sovereign compute")).toBeInTheDocument();
    expect(canvas.getByText("Built-in legitimacy")).toBeInTheDocument();

    // No GTD branding anywhere
    expect(canvas.queryByText(/GTD/)).toBeNull();

    // Right column: system-first heading
    expect(
      canvas.getByRole("heading", { name: "Sign in to continue" }),
    ).toBeInTheDocument();

    // Login mode: neutral password placeholder
    const pw = canvas.getByLabelText("Password");
    expect(pw).toHaveAttribute("placeholder", "••••••••");

    // Keyboard hint visible
    expect(canvas.getByText("Enter")).toBeInTheDocument();
  },
};

export const RegisterMode: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText("Request access"));

    // No username field — derived from email
    expect(canvas.queryByLabelText("Username")).toBeNull();

    expect(
      canvas.getByRole("heading", { name: "Create account" }),
    ).toBeInTheDocument();

    // Register mode: password placeholder shows requirements
    const pw = canvas.getByLabelText("Password");
    expect(pw).toHaveAttribute("placeholder", "Min. 8 characters");
  },
};

export const ToggleModes: Story = {
  play: async ({ canvas, userEvent }) => {
    const pw = canvas.getByLabelText("Password");

    // Start in login mode
    expect(
      canvas.getByRole("heading", { name: "Sign in to continue" }),
    ).toBeInTheDocument();
    expect(pw).toHaveAttribute("placeholder", "••••••••");

    // Switch to register
    await userEvent.click(canvas.getByText("Request access"));
    expect(canvas.queryByLabelText("Username")).toBeNull();
    expect(pw).toHaveAttribute("placeholder", "Min. 8 characters");

    // Switch back to login
    await userEvent.click(canvas.getByRole("button", { name: "Sign in" }));
    expect(canvas.queryByLabelText("Username")).not.toBeInTheDocument();
    expect(pw).toHaveAttribute("placeholder", "••••••••");
  },
};

export const FillAndSubmitLogin: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.type(canvas.getByLabelText("Email"), "test@example.com");
    await userEvent.type(canvas.getByLabelText("Password"), "password123");
    await userEvent.click(canvas.getByRole("button", { name: /Sign in/ }));

    expect(args.onLogin).toHaveBeenCalledWith(
      "test@example.com",
      "password123",
    );
  },
};

export const FillAndSubmitRegister: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByText("Request access"));

    await userEvent.type(canvas.getByLabelText("Email"), "new@example.com");
    await userEvent.type(canvas.getByLabelText("Password"), "password123");
    await userEvent.click(
      canvas.getByRole("button", { name: "Create account" }),
    );

    expect(args.onRegister).toHaveBeenCalledWith(
      "new@example.com",
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
