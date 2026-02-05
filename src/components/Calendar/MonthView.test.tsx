import { fireEvent, render, screen } from "@testing-library/react";

import { MonthView } from "./MonthView";

describe("MonthView", () => {
  it("calls onSelectDate when a day is clicked", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-02-05T12:00:00"));

    const onSelectDate = jest.fn();

    render(<MonthView selectedDate="2026-02-05" onSelectDate={onSelectDate} />);

    fireEvent.click(screen.getByRole("button", { name: "2026-02-06" }));
    expect(onSelectDate).toHaveBeenCalledWith("2026-02-06");
  });
});
