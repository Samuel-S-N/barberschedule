import { expect, test } from "@playwright/test";

import { appointmentRow, isHistoryQuery, json, mockCustomerRest, signInAsCustomer } from "./customer-helpers";

test.describe("Portuguese device", () => {
  test.use({ locale: "pt-BR" });

  test("auth screens follow the device language", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Esqueci minha senha" })).toBeVisible();

    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(page.getByRole("heading", { name: "Criar conta" })).toBeVisible();
    await page.getByTestId("signup-name").fill("Ana Silva");
    await page.getByTestId("signup-email").fill("ana@example.test");
    await page.getByTestId("signup-password").fill("correct-password");
    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(page.getByText("Aceite os termos e a política de privacidade para continuar.")).toBeVisible();
  });

  test("the legal page is in Portuguese", async ({ page }) => {
    await page.goto("/legal");
    await expect(page.getByRole("heading", { name: "Termos e privacidade" })).toBeVisible();
    await expect(page.getByText("Seus direitos (LGPD)")).toBeVisible();
  });
});

test.describe("Spanish device", () => {
  test.use({ locale: "es-ES" });

  test("auth screens follow the device language", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await expect(page.getByRole("button", { name: "¿Olvidaste tu contraseña?" })).toBeVisible();
  });
});

async function mockAppointments(page: import("@playwright/test").Page) {
  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/appointments")) {
      await json(route, isHistoryQuery(url) ? [] : [appointmentRow()]);
      return true;
    }
  });
}

test.describe("Portuguese customer", () => {
  test.use({ locale: "pt-BR" });

  test("home, agenda and profile are in Portuguese", async ({ page }) => {
    await mockAppointments(page);

    await page.goto("/home");
    await expect(page.getByRole("heading", { name: "Olá, Browser" })).toBeVisible();
    await expect(page.getByText("Seu próximo agendamento")).toBeVisible();
    await expect(page.getByTestId("tab-appointments")).toHaveAttribute("aria-label", "Agenda");
    await expect(page.getByTestId("tab-book")).toHaveAttribute("aria-label", "Agendar");

    await page.getByTestId("tab-appointments").click();
    await expect(page.getByTestId("agenda-segment-upcoming")).toContainText("Próximos");
    await expect(page.getByTestId("agenda-segment-history")).toContainText("Histórico");
    await expect(page.getByTestId("appointment-card-appointment-upcoming").getByText("Agendado")).toBeVisible();

    await page.getByTestId("tab-profile").click();
    await expect(page.getByRole("heading", { name: "Perfil" })).toBeVisible();
    await expect(page.getByTestId("profile-save")).toContainText("Salvar alterações");
  });

  test("the calendar strip uses Portuguese weekday names", async ({ page }) => {
    await mockAppointments(page);

    await page.goto("/appointments");
    await expect(page.locator('[data-testid^="calendar-strip-day-"]').first()).toContainText(/seg|ter|qua|qui|sex|sáb|dom/i);
  });

  test("a booking error is translated", async ({ page }) => {
    await signInAsCustomer(page);
    await mockCustomerRest(page, async (route, url) => {
      if (url.pathname.endsWith("/barber_services")) {
        await json(route, [{ duration_override_minutes: null, id: "33333333-3333-4333-8333-333333333333", price_override_cents: null, service_id: "s", services: { duration_minutes: 30, name: "Corte", price_cents: 4000 } }]);
        return true;
      }
      if (url.pathname.endsWith("/rpc/get_available_slots")) {
        await json(route, [{ ends_at: "2099-01-01T12:30:00Z", local_date: "2099-01-01", local_time: "09:00:00", starts_at: "2099-01-01T12:00:00Z" }]);
        return true;
      }
      if (url.pathname.endsWith("/rpc/book_appointment")) {
        await json(route, { code: "23P01", message: "overlap" }, 409);
        return true;
      }
    });

    await page.goto("/book");
    await page.getByRole("button", { name: "Browser Barber" }).click();
    await page.getByRole("button", { name: "Corte" }).click();
    await page.getByRole("button", { name: "Continuar para a revisão" }).click();
    await page.getByRole("button", { name: "09:00" }).click();
    await page.getByRole("button", { name: "Confirmar agendamento" }).click();

    await expect(page.getByText("Esse horário não está mais disponível.")).toBeVisible();
  });
});

test.describe("Spanish customer", () => {
  test.use({ locale: "es-ES" });

  test("home and agenda are in Spanish", async ({ page }) => {
    await mockAppointments(page);

    await page.goto("/home");
    await expect(page.getByRole("heading", { name: "Hola, Browser" })).toBeVisible();
    await expect(page.getByTestId("tab-book")).toHaveAttribute("aria-label", "Reservar");

    await page.getByTestId("tab-appointments").click();
    await expect(page.getByTestId("agenda-segment-upcoming")).toContainText("Próximas");
    await expect(page.getByTestId("appointment-card-appointment-upcoming").getByText("Programada")).toBeVisible();
  });
});

test.describe("Unsupported device language", () => {
  test.use({ locale: "fr-FR" });

  test("falls back to English", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });
});
