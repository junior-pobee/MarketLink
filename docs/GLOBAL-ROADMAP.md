# MarketLink Global Platform Roadmap

## Product direction

MarketLink is being developed from a browser-local marketplace prototype into a secure, server-backed, multi-country commerce platform. The existing MarketLink visual identity and useful working interface should be preserved while its local demonstration workflows are replaced with real shared services.

## Product owner's written plan

The following requirements are transcribed and organized from the MarketLink plan supplied by the product owner:

### Existing inclusives to preserve

1. Home dashboard
2. Market exploration
3. Categories
4. My wishlist
5. Shopping cart
6. Users' orders
7. Seller dashboard
8. Product inventory
9. Product addition
10. Sales and orders
11. Profile
12. Attachments
13. Notifications
14. Settings
15. GPS and Google Maps
16. Browser-based prototype
17. WhatsApp connection with sellers
18. WhatsApp connection with MarketLink (CEO)
19. Account creation and login

### Additional requirements

- Server-based global platform rather than browser-only storage.
- Built-in messaging space.
- Account authentication that works across devices.
- Video-enabled product advertisements.
- MarketLink administrators must have controlled moderation tools to review accounts, block or suspend abusive/illegal users, and remove prohibited listings. Administrative access must be protected, audited, and separated from ordinary user accounts.
- Sellers advertising products should pay a clearly disclosed recurring listing or storefront fee. Products requiring payment must remain unpublished or paused until payment is confirmed. The platform must provide receipts, renewal dates, grace periods, reminders, and a fair appeal process rather than silently deleting seller data.
- Weather conditions should be displayed as delivery-safety information where relevant. Weather must be advisory and must never replace carrier or local emergency guidance.
- Country-aware MarketLink availability and payment methods. Country branches or localized experiences must not imply that payments are supported until a suitable payment provider is integrated and verified for that country.
- Separate barcode scanning and barcode reading capabilities, linked to product listings, to identify or retrieve product details. Scanned data must be validated; barcode information alone is not proof of authenticity.
- A MarketLink verification badge for users who meet published, consistently applied eligibility criteria. Tenure alone must not guarantee verification; identity/business checks, account standing, and periodic review should be considered.
- WhatsApp contact options for sellers and a clearly governed official MarketLink contact channel.

## Global platform capabilities proposed

### Buyer experience

- Global product catalogue shared across devices and users.
- Search by product, category, brand, seller, location, price, condition, and availability.
- Filters, sorting, saved searches, wishlist, and product comparisons.
- Product pages with image/video galleries, seller information, shipping options, stock, and verified-purchase reviews.
- Multi-item cart, transparent checkout, order history, receipts, cancellations, refunds, and dispute support.
- Country, language, locale, and currency preferences with real exchange-rate conversion where enabled.

### Seller experience

- Public storefronts and seller profiles.
- Product creation, editing, media uploads, variations, SKU/barcode fields, and stock control.
- Orders, fulfilment, shipping, returns, customer conversations, and sales records.
- Analytics for views, conversion, sales, inventory, and customer demand.
- Promotions, coupons, paid advertisements, subscription/listing plans, invoices, and renewal management.
- Staff accounts and permission levels for eligible business accounts.

### Communication and community

- Private buyer-seller conversations with realtime delivery.
- Product sharing, image/document attachments, read state, and notifications.
- WhatsApp deep links as an optional external contact method, not as a substitute for in-app messaging.
- Reporting, blocking, moderation queues, and safety controls.

### Trust, safety, and administration

- Role-based access control for buyers, sellers, moderators, and administrators.
- Verified email and appropriate account/business verification.
- Product and account reports, moderation actions, audit trails, appeals, and anti-spam controls.
- Reviews limited to eligible purchases and safeguards against manipulation.
- Secure handling of personal data and payment-provider tokens.

### Logistics and internationalization

- Address book, delivery quotes, tracking, delivery updates, pickup options, and supported carrier integrations.
- Weather advisories for delivery planning in supported locations.
- Country-specific availability, legal requirements, taxes, payment methods, shipping rules, and customer support.
- Accessible, responsive design and low-bandwidth performance.

### AI and business intelligence

- Product discovery assistance and relevant recommendations.
- Seller insights for pricing, stock, and sales trends.
- Clear disclosure of AI-generated suggestions; sellers retain control over published prices and listings.

## Delivery sequence

### Stage 0 — Safe foundation
- Work on an isolated feature branch; do not change the production branch directly.
- Fix the current PWA icon/precache path mismatch.
- Establish automated checks and a documented deployment/release process.
- Confirm backend project ownership, region, credentials, and environment separation before connecting production data.

### Stage 1 — Server-backed identity and data
- Supabase Auth or another approved secure authentication provider.
- PostgreSQL data model for profiles, roles, storefronts, products, media, inventory, carts, wishlists, and orders.
- Row Level Security for every exposed table and private storage policies.
- Migrate local demo data only through an explicit, user-controlled migration flow.
- Never store plaintext passwords or privileged backend keys in the browser.

### Stage 2 — Shared marketplace
- Shared searchable catalogue and seller storefronts.
- Product media storage and inventory synchronization.
- Real cart persistence and server-side order creation.
- Atomic stock reservation/decrement to prevent overselling.

### Stage 3 — Payments and seller plans
- Choose payment providers by supported country and currency.
- Server-verified payment webhooks, idempotency, refunds, receipts, and reconciliation.
- Seller subscriptions/listing fees and paid advertising with clear pricing and billing controls.
- No order or listing is marked paid based only on a client-side success screen.

### Stage 4 — Messaging and notifications
- Realtime conversations and message persistence.
- Safe attachment uploads, access controls, abuse reporting, and blocking.
- In-app notifications and optional email/push notifications.

### Stage 5 — Fulfilment and international readiness
- Carrier integrations, delivery tracking, shipping quotes, and supported weather advisories.
- Localization, currency conversion, tax/shipping configuration, and country-by-country launch checks.

### Stage 6 — Trust, intelligence, and growth
- Moderation console, audit history, verification programme, reviews, and disputes.
- Video advertisements, barcode tools, seller analytics, AI discovery, and business intelligence.
- Load testing, security testing, accessibility review, backups, monitoring, and incident response.

## Technical guardrails

- Keep production secrets out of source control and client-side code.
- Use a publishable/anonymous client key only where the provider explicitly documents it as safe for browser use; never expose service-role or secret keys.
- Enforce authorization in backend policies and server-side operations, not only by hiding UI controls.
- Validate and rate-limit uploads, messages, searches, checkout, and account creation.
- Use payment-provider webhooks as the source of truth for payment status.
- Make critical order and inventory operations transactional and idempotent.
- Keep user data export and account deletion workflows.
- Do not launch a country, payment method, verification badge, or delivery promise until its operational and legal requirements are met.

## Current first implementation

The isolated branch `marketlink/global-foundation` fixes the PWA icon references so the HTML and service worker point to the root-level icon files that actually exist in the repository. The service-worker cache name is bumped so existing installations can refresh the corrected precache list.

The next implementation dependency is a confirmed backend project and environment configuration. No credentials should be committed to this repository.
