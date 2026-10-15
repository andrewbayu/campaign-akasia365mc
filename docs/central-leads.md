# Centralized campaign and lead-magnet submissions

The campaign dashboard remains at `/result`, under its existing password. Keep common contact, source form, selected areas, capture time, consent and six UTM fields in the shared lead table. Preserve versioned quiz answers, server-computed result, optional marketing consent, contact preference and legacy CRM fields in private JSON details. Multiple selected areas remain filterable individually.

The quiz at `quiz.365mcindonesia.com` sends its validated envelope from the server to a dedicated ingestion-only endpoint. Its random key is separate from the campaign hosting proxy key and cannot authenticate dashboard reads. Google Sheets delivery remains as a secondary copy when configured. A successful central save controls form success; an unavailable secondary destination must not discard a lead already saved centrally.

Import existing valid UUID submissions idempotently. Preserve original capture times; never invent historic UTM values. Keep malformed legacy contacts visible with a review flag and no WhatsApp link. Match legacy Admin CRM rows by contact/name and timestamp rather than row position; do not guess ambiguous matches. Keep the source workbook unchanged.

Live attribution is captured on arrival and retained within the tab, replaced on a new tagged visit. Do not store contact data in browser storage. Keep retries on the same idempotency key. Tests cover central persistence, consent, auth boundaries, area/form filters, attribution, email preservation and failure handling. Preview/live synthetic records must be identified and removed after verification.
