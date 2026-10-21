import type { Page } from "@playwright/test";

// The agenda card keeps only the essentials; the rest is in the pop-up that opens when the card is tapped.
export const openBarberCard = (page: Page, id = "appt-1") => page.getByTestId(`barber-appointment-card-${id}`).click();
export const openOwnerCard = (page: Page, id = "appt-1") => page.getByTestId(`owner-appointment-card-${id}`).click();
