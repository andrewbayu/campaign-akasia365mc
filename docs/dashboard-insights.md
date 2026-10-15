# Infinitilab client workspace

`/result` uses the supplied Infinitilab logo as the primary identity and identifies Akasia 365mc as the client on login and dashboard screens. Assets and styling are scoped to internal dashboard pages.

Authenticated `/api/results/analytics` returns aggregates only. Apply `database/analytics.sql` after the base schema (the hosted migration is `akasia_dashboard_private_analytics`). Only `service_role` can execute the SECURITY INVOKER function; existing session/proxy checks protect the endpoint. No new public database grants or tables are required.

Charts use the same date, environment, form, area, source, campaign, consent and contact-search filters as the table, but ignore pagination and sort order. Dates use Asia/Jakarta; the end date is exclusive at the next midnight. Trends use calendar days up to a 60-day span, weeks up to a year, and months for longer spans. Missing periods between the earliest and latest matching records are zero-filled. Weekly/monthly dates indicate period starts, and edge periods may be partial.

Follow-up counts explicit `true` consent. UTM coverage counts non-null `utm_source`; unknown values stay under Tanpa UTM. Area counts include every selected area, so their sum can exceed submissions. Forms show all categories; sources and areas show their largest categories plus Lainnya. Click a named bar to apply its filter; Lainnya is a non-interactive remainder. Expand the trend table for exact accessible values.

The UI clears stale charts during refresh, handles empty results and unavailable analytics, and keeps the lead table usable if only the aggregate request fails. Native DOM/SVG rendering needs no chart service, third-party data transfer, or inline scripts/styles. Public assets are deployed before switching backend HTML to avoid missing-asset errors during release.

Validation: `npm test`, plus `tests/analytics.sql` against PostgreSQL. That transaction verifies full-dataset totals, Jakarta midnight boundaries, multi-area counts, missing UTM, consent/search filters, environment isolation and zero-filled dates, then rolls back its synthetic records.
