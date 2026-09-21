# Vergil Calendar

**English** | [简体中文](README.zh-CN.md)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/linusxiong/vergil-cal-subs)

Turn your registered Columbia Vergil courses into a calendar subscription. Manually provide an **Access Token and Refresh Token** whenever you create or update a calendar. The service reads your courses and saves a snapshot; it **does not persist university tokens or refresh your schedule in the background**. Submit both tokens again to update the same subscription URL.

Live app: **https://vergilcal.xsy.app** · Source: **https://github.com/linusxiong/vergil-cal-subs** · MIT License

This is an independent open-source project, unaffiliated with Columbia University. The implementation is based on an authorized capture of the author's own login session and Vergil's public frontend code. **This Worker has not yet been validated end to end with real university tokens, and the university's Refresh Token grant has not been tested.** Local tests use synthetic data and mocked upstream responses; they do not imply university approval of third-party clients. See the [capture notes](docs/capture-2026-09-21.md) for evidence and limitations.

## Features and stack

- Stable HTTPS / webcal subscription URLs for Apple Calendar, Google Calendar, and Outlook.
- Course names, dates, times, rooms, and buildings from registered sections, excluding Planner and Waitlist entries.
- New York time zone and daylight saving time, multiple meeting patterns, overnight classes, and stable ICS event UIDs.
- Exclude dates without classes and manually update your calendar name and schedule without changing the subscription URL.
- Private management links for viewing, updating, and revoking calendars; failed updates preserve the previous snapshot.
- React + TypeScript + Vite + Bun, TanStack Router / Query, HeroUI 3 + Tailwind CSS 4.
- System fonts, restrained blue action buttons, mobile layouts, and system dark mode; no external fonts, analytics, or ads.
- English and Simplified Chinese interfaces, with English on first visit. The language switch in the top-right corner remembers your choice on this device. Dates, instructions, notices, and course warnings follow your language; original course names and subscription content are not rewritten.
- Cloudflare Workers serves both the API and static frontend; D1 stores course snapshots. No separate persistent server, queues, or scheduled jobs.
- English and Chinese page metadata, canonical and language alternate links, Open Graph / social cards, structured data, robots and sitemap routes, and app icons. Public page URLs use the deployed instance's own origin.

## Get your Access Token and Refresh Token

Use a desktop browser on **your own computer**. Mobile browsers lack desktop developer tools, so create the subscription on a computer first, then add its URL on your phone. This project does not collect your university password, Duo codes, or cookies.

### Option 1: Browser storage

1. Open [Vergil](https://vergil.columbia.edu/) in Chrome or Edge, complete university login and Duo verification, and confirm that your courses are visible.
2. Open Developer Tools: `⌥⌘I` on macOS, or `F12` / `Ctrl+Shift+I` on Windows and Linux.
3. Select **Application**. If the tab is hidden, look in the top toolbar's `»` menu.
4. Expand **Storage → Local Storage** and select **`https://vergil.columbia.edu`**.
5. Find `access_token` and copy the **complete, unmodified string** in its Value field. Copy `refresh_token` from the same login session as well.
6. Paste the values into this app's two corresponding fields. Do not include quotes, a `Bearer ` prefix, or field names. Do not substitute `id_token` for the Access Token.
7. Check your term and submit. Both fields clear on submission; you must paste both tokens again for another attempt, whether the previous attempt succeeded or failed.

Vergil's storage implementation may change. If these keys are absent, check Session Storage for the same site, or use the Network method below. You do not need to install an extension with access to all your browsing data.

### Option 2: The login Network response

1. Open Developer Tools on Vergil, select **Network**, and enable **Preserve log**.
2. Sign out and back in using the university's normal login flow. The browser can only record the response after the panel is open.
3. Filter requests by `token.oauth2` and find a successful POST to **`https://oauth.cc.columbia.edu/as/token.oauth2`**.
4. Open **Response** and copy the JSON values of `access_token` and `refresh_token` separately. Copy only each value, without JSON quotes or commas.
5. Return to this app and submit them. The captured session reported an `expires_in` value of `7199` seconds (about two hours); future sessions may differ. Use newly obtained tokens promptly.

**Protect university tokens like passwords.** The observed permissions included `create/read/update/delete`, exceeding the access needed for a read-only calendar. Only use an instance you trust or deploy yourself: tokens travel over HTTPS to that instance's Worker, which then calls Columbia. “Not stored” does not mean “never sent to a server.” Do not upload HAR files or screenshots containing credentials, paste a full token response into an issue, or paste code into the Console.

The university may rotate Refresh Tokens. After an Access Token is rejected with HTTP 401, this project attempts at most one refresh and discards any returned tokens when the operation finishes. **Obtain both tokens again** from Vergil before your next update; sign in again if necessary. The project does not write rotated tokens back into Vergil's browser storage or guarantee that an old Refresh Token can be reused.

## Create, subscribe, and update

1. Choose your term, such as **Fall 2026**. The default is inferred from the current month in New York; verify that it matches your schedule. The dropdown includes spring, summer, and fall for the current year and the two years on either side. An older calendar's original term remains available when managing it. The API uses a year plus season number, such as `20263`.
2. Optionally name your calendar. To exclude dates without classes, expand the options and enter one `YYYY-MM-DD` date per line, up to 366 dates. Exclusions apply to every course in this subscription.
3. Paste both university tokens and create your calendar. Immediately save the **management link** and **subscription link** privately.
4. Subscribe in your calendar client instead of downloading and importing the ICS file once:
   - **Apple Calendar:** click “Open in Calendar app,” or choose “File → New Calendar Subscription” in Calendar on a Mac and paste the URL.
   - **Google Calendar:** on the website, click `+` next to “Other calendars,” select “From URL,” and paste the HTTPS subscription URL.
   - **Outlook:** choose “Add calendar → Subscribe from web” and paste the HTTPS URL.
5. After adding or dropping courses, room changes, or changes to excluded dates, open your management link, provide both fresh tokens, and update. You do not need to add the subscription URL again.

Calendar clients control their own fetch intervals; updating the server does not instantly update every client. This project has no background university sync or push notifications. Unscheduled meetings produce a notice, and missing rooms leave the location blank. Locations use API room and building names and may not include street addresses. Because closure rules vary by school and course, university holidays are not automatically excluded.

### The two types of links

| Link | Permissions | How to keep it |
| --- | --- | --- |
| `/calendar/<random-ID>.ics` | Read the course calendar; anyone with the URL can view it | Share only with calendar clients that need your schedule |
| `/manage/<random-ID>#<management-key>` | View, update, and delete; updates also require fresh tokens for the original student | Save the complete link privately, including everything after `#` |

The management key is separate from your university tokens. Its plaintext is returned only when you create the calendar; the database stores only its hash. The URL fragment is not sent with the page request. The frontend includes the key in the Authorization header when calling management APIs. Browser history and bookmarks may still retain the full link, so use your own device.

Lost management links cannot be recovered with university tokens. Create a new subscription and remove the old one from your calendar client; this does not automatically delete the old snapshot. If a subscription or management link leaks and you still have the management link, revoke the calendar from its management page. Revocation deletes the snapshot from the active database and invalidates the old links, but cannot remove calendar-client caches or backups already held by service providers.

## Run locally

Use Bun 1.3.14 or a compatible version, plus Node.js 22.12+ (or 24 LTS) to run Vite 8 / Wrangler. Use Bun for package management.

```sh
git clone https://github.com/linusxiong/vergil-cal-subs.git
cd vergil-cal-subs
bun install --frozen-lockfile
bun run db:migrate
bun run dev
```

Open the local URL printed in the terminal, usually `http://127.0.0.1:5173`. Vite's Cloudflare plugin runs the Worker with local D1 state under `.wrangler/state`. Apply migrations before your first run. Local and production databases are separate. Local development can use the all-zero database ID in the configuration; production must replace it.

To change the source-code link in the interface, copy `.env.example` to `.env`, set `VITE_GITHUB_URL`, and rebuild. This is a public build variable: **every `VITE_*` variable is exposed to the frontend; never put tokens there**. University tokens do not belong in any environment file and are not needed to start the app.

```sh
bun run check      # Type checking, synthetic-data tests, production build
bun run preview    # Preview the production version locally after building
```

Tests cover registered-course filtering, DST, overnight classes, excluded dates, stable UIDs, UTF-8 ICS line folding, management permissions, student identity checks, a single refresh attempt, pagination boundaries, concurrent writes, and snapshot preservation after failure. University responses are mocked; tests need no university account and do not call university APIs. Backend tests execute the real migration SQL with Bun SQLite while emulating D1's calling interface.

## Deploy to Cloudflare Workers

Use the **Deploy to Cloudflare** button above to create your own instance with a Cloudflare account. Cloudflare provisions the D1 binding and uses the repository's build and deploy scripts; deployment applies database migrations before publishing. The shared configuration is a portable template with no owner-specific account, database, or domain settings.

For a manual deployment:

```sh
bunx wrangler login
bunx wrangler d1 create vergil-cal-subs
```

Replace the all-zero `d1_databases[0].database_id` in `wrangler.jsonc` with the returned `database_id`. Keep the binding name **`DB`**; migration scripts resolve the database through that binding, so the database name can differ.

```sh
bun run deploy
```

The deploy command builds with Vite, applies remote D1 migrations, then publishes the Worker and static assets using the configuration generated by the Cloudflare plugin. `bun run db:migrate:remote` is also available for applying migrations separately. Use the returned HTTPS URL, or add a custom domain to the Worker in Cloudflare. Choose your domain before sharing subscription links; changing the domain affects existing subscription URLs.

You can set `vars.PUBLIC_APP_URL` in `wrangler.jsonc` to a fixed site origin, such as `https://calendar.example.com`. Once set, use the app only at that origin; writes from other origins are rejected. Without it, the app uses the current request's origin.

To keep deployment settings outside the shared template, copy the configuration into the git-ignored `wrangler.deploy.json`, set your `account_id`, database ID, and optional custom-domain `routes`, then run `CLOUDFLARE_CONFIG=wrangler.deploy.json bun run deploy`. Both the build and remote migration use that configuration. An explicit account ID is needed if your Cloudflare login has access to multiple accounts.

All requests run through the Worker before static assets so public HTML receives metadata for its route, while API and ICS requests do not fall back to SPA HTML. English pages are available at `/` and `/guide`; add `?lang=zh-CN` for Chinese. Canonical links and `/sitemap.xml` use your configured public origin or the request origin, so self-hosted instances do not point to someone else's domain. Private management pages and calendar/API responses are excluded from search indexing. Static-response security headers live in `public/_headers`; the Worker sets API headers. Workers observability is disabled by default, and the app does not write request logs. Avoid adding request-body or Authorization capture, third-party error tracking, or public request logs: subscription paths are themselves access credentials.

This version is intended for personal use or small self-hosted groups. It has no public-registration quota or abuse-prevention system. Before opening it to a large audience, configure rate limits, capacity, and cost monitoring appropriate to your Cloudflare plan and the university's API policy, and complete validation with a real account. In-memory counters are not global rate limiting.

## Data flow and retention

```text
Browser: user submits both tokens for this request only
    ↓ HTTPS POST
Worker: userinfo → current student's person ID → registered courses → details → ICS
    ↓ Atomic write; any failure preserves the previous snapshot
D1: course snapshot, ICS, random subscription ID, management-key hash, student hash, version
    ↑ GET /calendar/<id>.ics (no university tokens required)
Apple / Google / Outlook: fetch according to each client's policy
```

The app does not store university Access / Refresh / ID Tokens, passwords, cookies, raw upstream responses, or browser sessions. It does not persist university tokens in Local Storage / Session Storage or put them into TanStack Query's request cache. Tokens exist in browser and Worker memory during request processing; JavaScript cannot guarantee cryptographic memory erasure.

D1 stores normalized courses, excluded dates, the last update time, ICS, ETag, version, and hashes of the student identity and management key. The identity hash restricts updates to the original student. It is a linkable pseudonymous identifier, **not a promise of anonymization**. Data does not expire automatically; it remains until the user revokes the calendar or the operator deletes it. Google, Apple, or Microsoft may also receive and cache course data when you subscribe.

The API contacts only fixed Columbia hosts and rejects cross-origin redirects and pagination across students. Each sync attempts at most one token refresh; it neither broadens scopes nor performs registration writes. Updates use version-conditional writes to avoid concurrent overwrites. ICS responses support ETag / 304 and require cache revalidation.

## API and project structure

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/calendars` | Create; JSON contains both tokens, term, optional name, and excluded dates |
| GET | `/api/calendars/:id` | View a snapshot; management Bearer required |
| POST | `/api/calendars/:id/sync` | Update; management Bearer plus both fresh university tokens |
| DELETE | `/api/calendars/:id` | Revoke; management Bearer required |
| GET / HEAD | `/calendar/:id.ics` | Subscribe; the random URL grants read access |

See `src/shared.ts` for request and response types. Do not put university tokens in URLs, command-line arguments, or issues, or print complete requests when debugging.

- `src/App.tsx`, `src/styles.css`: creation, management, and guide interface.
- `src/server/index.ts`: Worker routes, input validation, D1, and authorization.
- `src/server/vergil.ts`: Columbia identity, token refresh, and course reads.
- `src/server/calendar.ts`: course normalization and ICS generation.
- `migrations/`: D1 schema; `tests/`: synthetic tests.
- `docs/capture-2026-09-21.md`, `docs/capture-summary.json`: sanitized evidence summaries suitable for publication.

## Limitations and troubleshooting

- **Authentication failed:** sign in to Vergil again and copy both tokens from the same account and session. Do not use an ID Token. Management operations also need the complete management link.
- **Another account cannot update an existing calendar:** calendars are bound to their original student; another student should create their own subscription.
- **Unsupported upstream format or no courses:** check the term and your registered courses. Changes to university fields may require adapter updates. Report only sanitized field structures, never real responses or credentials.
- **Missing location:** the university may not have assigned a classroom, or the available field may contain only a building rather than a complete address.
- **Calendar did not change immediately:** check the last update time on the management page, then wait for the calendar client to fetch again. The website cannot force third-party clients to refresh.
- **Local `no such table: calendars`:** run `bun run db:migrate`; for production, run the remote migration.
- **Lost management link:** there is no recovery flow; create a new subscription and remove the old one from your client.

Opening the Vergil login page does not automatically authorize another website or mobile app to use its tokens. Browser-to-app OAuth callbacks still require university registration and permission. This project implements an explicit manual-token workflow. A formal third-party OAuth client, read-only scopes, and university-approved background refresh still require separate confirmation with CUIT.

Development references: [HeroUI](https://heroui.com/en/docs/react/getting-started/quick-start), [Cloudflare Vite Plugin](https://developers.cloudflare.com/workers/vite-plugin/tutorial/), [Workers static-response headers](https://developers.cloudflare.com/workers/static-assets/headers/), [TanStack Router](https://tanstack.com/router/latest/docs/framework/react/overview).
