# Barber WhatsApp Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline).

**Goal:** Customers without an account never get push, so the barber can send a reminder from the agenda card with one tap (WhatsApp deep link with a prefilled message).

**Architecture:** `list_my_barber_agenda` also returns `customer_phone`, only for customers without an account (accounts already get push via `dispatch-notifications`). `whatsappUrl(phone, text?)` builds the link. The agenda card shows **Remind** on open, upcoming appointments that have a phone.

**Decision (recommended/safe):** manual WhatsApp link, not automated email/WhatsApp API: no new provider, no credentials, no cost, no consent flow; automated sending can come later behind a provider decision.

**Tech Stack:** Postgres/pgTAP, Jest, Playwright (mocked REST).

## Global Constraints
- Strict TDD; commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; `npx eslint app src tests`; i18n in en/es/pt.

### Task 1: customer_phone in the agenda RPC (migration 0042 + pgTAP 026)
- [ ] pgTAP: account-less customer with phone → `customer_phone` set; customer with account → null.
- [ ] Migration: drop and recreate `list_my_barber_agenda` (copy of 0026 + `customer_phone text` = `case when customers.user_id is null then customers.phone end`), same grants.
- [ ] Commit.

### Task 2: URL + mapping (Jest)
- [ ] `whatsappUrl(phone, text?)` appends `?text=<encoded>`; `listMyBarberAgenda` maps `customerPhone`.
- [ ] Commit.

### Task 3: Remind button (e2e)
- [ ] e2e: open upcoming appointment with `customer_phone` shows `barber-remind-<id>`; click opens a popup to `https://wa.me/55...?text=` containing the customer's name; no button without phone.
- [ ] Implement in `my-agenda.tsx` with `Linking.openURL`; keys `barber.agenda.{remind,remindMessage}`.
- [ ] Commit, verify, PR.
