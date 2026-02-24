import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginPage } from "./LoginPage";

describe("LoginPage", () => {
  const defaultProps = {
    onLogin: vi.fn().mockResolvedValue(undefined),
    onRegister: vi.fn().mockResolvedValue(undefined),
  };

  it("renders the login form by default", () => {
    render(<LoginPage {...defaultProps} />);
    expect(screen.getByText("Sign in to continue")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign in/i }),
    ).toBeInTheDocument();
  });

  it("renders differentiators on the left column", () => {
    render(<LoginPage {...defaultProps} />);
    expect(screen.getByText("Open ontology")).toBeInTheDocument();
    expect(screen.getByText("Sovereign compute")).toBeInTheDocument();
    expect(screen.getByText(/Human.*AI/)).toBeInTheDocument();
    expect(screen.getByText("Built-in legitimacy")).toBeInTheDocument();
  });

  it("calls onLogin with email and password on submit", async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<LoginPage {...defaultProps} onLogin={onLogin} />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith("test@example.com", "secret123");
    });
  });

  it("switches to register mode and calls onRegister", async () => {
    const onRegister = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<LoginPage {...defaultProps} onRegister={onRegister} />);

    await user.click(screen.getByText("Request access"));
    expect(
      screen.getByRole("heading", { name: "Create account" }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(onRegister).toHaveBeenCalledWith("new@example.com", "password123");
    });
  });

  it("displays error when login fails", async () => {
    const onLogin = vi.fn().mockRejectedValue(new Error("Invalid credentials"));
    const user = userEvent.setup();
    render(<LoginPage {...defaultProps} onLogin={onLogin} />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "wrongpass");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
    });
  });

  it("displays initialError when provided", () => {
    render(<LoginPage {...defaultProps} initialError="Session expired" />);
    expect(screen.getByText("Session expired")).toBeInTheDocument();
  });

  it("can switch back from register to login mode", async () => {
    const user = userEvent.setup();
    render(<LoginPage {...defaultProps} />);

    await user.click(screen.getByText("Request access"));
    expect(
      screen.getByRole("heading", { name: "Create account" }),
    ).toBeInTheDocument();

    // The "Sign in" link (mode toggle) — not the submit button
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByText("Sign in to continue")).toBeInTheDocument();
  });

  describe("Disclaimer", () => {
    it("renders dev/demo disclaimer in login mode", () => {
      render(<LoginPage {...defaultProps} />);

      const disclaimer = screen.getByRole("status");
      expect(disclaimer).toBeInTheDocument();
      expect(disclaimer).toHaveTextContent(
        "Development/demo environment — not for production use",
      );
    });

    it("renders dev/demo disclaimer in register mode", async () => {
      const user = userEvent.setup();
      render(<LoginPage {...defaultProps} />);

      // Switch to register mode
      await user.click(screen.getByText("Request access"));

      const disclaimer = screen.getByRole("status");
      expect(disclaimer).toBeInTheDocument();
      expect(disclaimer).toHaveTextContent(
        "Development/demo environment — not for production use",
      );
    });

    it("applies correct warning styling to disclaimer", () => {
      render(<LoginPage {...defaultProps} />);

      const disclaimer = screen.getByRole("status");
      expect(disclaimer).toHaveClass("text-status-warning");
      expect(disclaimer).toHaveClass("bg-status-warning/10");
    });
  });
});
