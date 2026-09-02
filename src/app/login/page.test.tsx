import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LoginPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  getAuth: vi.fn(() => ({})),
}));

vi.mock("firebase/app", async () => {
  const actual = await vi.importActual<typeof import("firebase/app")>(
    "firebase/app",
  );
  return {
    ...actual,
    getApps: vi.fn(() => []),
    initializeApp: vi.fn(() => ({})),
  };
});

describe("LoginPage", () => {
  it("renders the email/password sign-in form", () => {
    render(<LoginPage />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^sign in$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /show password/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /sign in with google/i }),
    ).not.toBeInTheDocument();
  });
});
