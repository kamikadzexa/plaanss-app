import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders login card", () => {
  render(<App />);
  const heading = screen.getByText(/plaanss calendar/i);
  expect(heading).toBeInTheDocument();
});
