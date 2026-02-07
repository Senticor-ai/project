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
    // No tagline shown
    expect(canvas.queryByText("GTD-native task management")).toBeNull();

    // Login mode: password placeholder is neutral dots, not requirements hint
    const pw = canvas.getByLabelText("Password");
    expect(pw).toHaveAttribute("placeholder", "••••••••");
  },
};

export const RegisterMode: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText("Create one"));
    expect(canvas.getByLabelText("Username")).toBeInTheDocument();
    expect(
      canvas.getByRole("heading", { name: "Create account" }),
    ).toBeInTheDocument();

    // Register mode: password placeholder shows requirements hint
    const pw = canvas.getByLabelText("Password");
    expect(pw).toHaveAttribute("placeholder", "Min. 8 characters");
  },
};

export const ToggleModes: Story = {
  play: async ({ canvas, userEvent }) => {
    const pw = canvas.getByLabelText("Password");

    // Start in login mode — neutral placeholder
    expect(
      canvas.getByRole("heading", { name: "Sign in" }),
    ).toBeInTheDocument();
    expect(pw).toHaveAttribute("placeholder", "••••••••");

    // Switch to register — requirements placeholder
    await userEvent.click(canvas.getByText("Create one"));
    expect(canvas.getByLabelText("Username")).toBeInTheDocument();
    expect(pw).toHaveAttribute("placeholder", "Min. 8 characters");

    // Switch back to login — neutral placeholder again
    await userEvent.click(canvas.getByRole("button", { name: "Sign in" }));
    expect(canvas.queryByLabelText("Username")).not.toBeInTheDocument();
    expect(pw).toHaveAttribute("placeholder", "••••••••");
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
