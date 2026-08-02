# Cardverse Product Requirements Document

**Status:** Draft v0.1  
**Last updated:** July 31, 2026  
**Platform:** Responsive web application  
**Implementation:** Next.js and TypeScript  
**Primary data provider:** CardAPI  

## 1. Product summary

Cardverse is a visual browser for popular US consumer credit cards. It presents cards on a boundaryless, starfield-style canvas that users can pan in any direction. Selecting a card opens concise educational information without navigating to a separate detail page.

The product is for browsing and education. It does not collect financial information, create personalized recommendations, estimate approval odds, or require an account.

## 2. Problem

Credit-card information is commonly presented in dense tables, long articles, or conversion-focused comparison pages. These formats make casual exploration difficult and can blur the distinction between factual education and product promotion.

Cardverse should make it easy to:

- Discover widely used cards without completing a questionnaire.
- Understand the most important fees, rewards, and terms at a glance.
- Filter the field using simple predefined categories.
- Explore without feeling that one card is being recommended by default.
- Verify current terms before visiting an issuer.

## 3. Product principles

1. **Exploration before recommendation.** The interface should not imply that a card is best for the user.
2. **Facts before persuasion.** Fees, rewards, APRs, limitations, and data freshness must be easy to find.
3. **One spatial model.** Browsing, filtering, selection, and education should happen within the same canvas.
4. **Motion with purpose.** Movement should communicate depth and navigation, not delay access to information.
5. **No required personal data.** Users should be able to use the complete MVP anonymously.
6. **Friendly, concise language.** Copy should be conversational without becoming promotional.

## 4. Goals

### MVP goals

- Launch with a curated set of approximately 28 popular US consumer credit cards.
- Provide an infinite-feeling canvas that repeats seamlessly in every direction.
- Allow users to filter cards through predefined filters only.
- Show actual card artwork for every listed product.
- Open card education in a desktop sidebar or mobile bottom sheet.
- Let users rotate a selected card as a 3D object.
- Keep CardAPI-backed information current and visibly timestamped.
- Deliver an accessible reduced-motion and keyboard experience.

### Non-goals

- Personalized card recommendations or rankings based on user data.
- Accounts, saved cards, favorites, or application tracking.
- Credit-score collection, income collection, or prequalification.
- A conventional all-cards catalogue page.
- Separate card-detail pages in the MVP.
- A rewards calculator or spending-profile questionnaire.
- Credit-card applications inside Cardverse.
- Business cards, Canadian cards, debit cards, or prepaid cards.
- Issuing financial advice or guaranteeing approval.

## 5. Audience

Cardverse serves a broad US audience, including:

- People casually learning what popular cards offer.
- People comparing a small number of familiar cards.
- People exploring reward categories or annual-fee options.
- People who prefer visual discovery over dense comparison tables.

No prior knowledge of points, transfer partners, or card terminology should be assumed.

## 6. Core experience

### 6.1 Landing page

The landing page introduces Cardverse without featuring or recommending one card.

Required content:

- Cardverse identity.
- Short functional description: “Browse popular US credit cards and compare rewards, fees, and terms.”
- A zoomed-out field of small, irregularly positioned card artworks.
- A single primary action: **Explore cards**.
- Current number of included cards.

Interaction:

- Selecting **Explore cards** animates the camera toward the card field.
- The transition resolves into the interactive main canvas with one card near the viewport center.
- With reduced motion enabled, the transition becomes a short crossfade.

The landing page must not contain testimonials, feature lists, promotional claims, featured-card copy, or issuer calls to action.

### 6.2 Main canvas

The main canvas is a full-viewport starfield populated with actual card artwork.

Navigation methods:

- Mouse or pointer drag.
- Trackpad or mouse-wheel panning.
- Arrow keys.
- Single-finger drag on touch devices.

Behavior:

- The field has no visible boundary.
- Moving beyond the virtual field width or height wraps the camera position to the corresponding location.
- The repeat must be seamless in both axes and must not show an empty seam.
- Cards remain level; they are not randomly tilted.
- Cards vary in position and visual depth without becoming a rigid grid.
- Edge-cropped cards are intentional and signal that more content exists outside the viewport.
- A card near the viewport center receives stronger emphasis and a concise label.
- Panning remains available after filters are applied.

Desktop controls:

- Cardverse identity.
- Visible card count.
- Filter control.
- Subtle drag affordance.
- Seamless-field cue during initial onboarding.

Mobile controls:

- Compact Cardverse identity.
- Visible card count.
- Icon-based filter control with an accessible label.
- Touch drag affordance.

### 6.3 Predefined filters

Users do not enter personal information or custom criteria. Filters are predefined and may be combined only where the resulting behavior remains understandable.

Initial filter set:

- All cards
- Travel
- Cash back
- Dining
- Groceries
- Gas
- No annual fee
- No foreign transaction fee
- Intro APR

Filter requirements:

- The active filter is always visible.
- Applying a filter updates the card count and field contents.
- Cards animate to new positions without a full-page reload.
- The camera recenters only if the current focused card is removed by the filter.
- An empty result explains that no cards match and provides a one-click reset.
- Filter state is represented in the URL so refresh, back, and forward navigation behave predictably.

### 6.4 Card selection

Selecting a card must not navigate to a separate overview page.

Desktop:

- The selected card enlarges and shifts left.
- Nonselected cards dim but remain spatially visible.
- An educational sidebar opens from the right.

Mobile:

- The selected card remains visible near the top of the viewport.
- Nonselected cards dim.
- Information opens in a draggable bottom sheet.
- The sheet has collapsed and expanded states if all content does not fit.

Closing the panel returns the user to the same canvas position and filter state.

The selected card is represented in the URL, for example `/cards?card=chase-sapphire-preferred`, without creating a separate detail-page template.

### 6.5 Card education panel

The panel should answer “What is this card, what does it cost, and what should I know?” without overwhelming the user.

Required information hierarchy:

1. Issuer and card name.
2. Card category.
3. One-sentence plain-language summary.
4. Annual fee.
5. Current welcome offer and its spending requirement.
6. Highest-value reward categories and important caps.
7. Foreign transaction fee.
8. Purchase APR or APR range.
9. Key benefits or credits.
10. Important limitations or application rules when available.
11. Data verification date.
12. **Visit issuer** and **Rates & fees** actions.

Editorial summaries:

- May be manually authored for the curated launch set.
- Must be descriptive rather than personalized.
- Must not use language such as “best for you,” “you should apply,” or “guaranteed.”

Every panel must include a concise reminder that issuer terms can change and should be verified before applying.

### 6.6 3D card interaction

When a card is selected, users can rotate the card directly.

Requirements:

- Horizontal drag rotates the card around its vertical axis.
- Vertical drag provides limited pitch rather than unrestricted tumbling.
- Releasing the card applies subtle inertial movement and then settles.
- Double-clicking or double-tapping returns the card to its front face.
- Rotation never blocks access to the information panel.
- Keyboard controls rotate in fixed increments.
- Reduced-motion mode removes inertia and uses immediate state changes.
- A non-3D fallback displays front and back toggles.

The front must use the actual card artwork. A realistic card edge and back require approved assets or a clearly neutral, non-issuer-specific treatment. Card backs must not be fabricated to resemble issuer artwork without permission.

## 7. Data requirements

### 7.1 CardAPI integration

CardAPI is the system of record for structured card facts. The integration must run server-side so the API key is never exposed to the browser.

Relevant capabilities verified in the current documentation:

- List cards with country, issuer, and category filters.
- Retrieve full details for an individual card.
- Retrieve reward categories, perks, statement credits, transfers, and application rules.
- Read an `updated_at` timestamp.
- Receive data-change notifications through webhooks.
- Use the official TypeScript client, `@cardapi/client`.

Expected queries:

- `GET /v1/cards?country=US`
- `GET /v1/cards/:id`
- `GET /v1/categories`
- Optional perk, credit, transfer, rule, and change-history endpoints.

### 7.2 Eligibility rules

The launch dataset must include only records where:

- `country` is `US`.
- `is_business` is `false`.
- The product is currently available to new applicants.
- Required terms and artwork have passed editorial QA.

### 7.3 Popularity and curation

CardAPI provides card facts but should not be assumed to provide a consumer-popularity ranking.

Cardverse will maintain an internal editorial configuration containing:

- `cardId`
- `published`
- `displayRank`
- `featuredCategories`
- `editorialSummary`
- `artworkAsset`
- `issuerUrl`
- `ratesAndFeesUrl`

The initial set is approximately 28 cards and can be updated without a deployment if the configuration is moved to a CMS later.

### 7.4 Artwork

Actual card artwork is a launch requirement. The public CardAPI documentation does not clearly guarantee artwork URLs or artwork licensing.

Before launch, the team must:

- Confirm whether CardAPI supplies usable image assets and associated rights.
- Otherwise obtain issuer-provided or properly licensed artwork.
- Store optimized AVIF/WebP derivatives while retaining the approved source.
- Record attribution or usage restrictions per asset.
- Provide a neutral placeholder only when a card is unpublished from the consumer experience.

### 7.5 Freshness and caching

- Cache list responses for up to 24 hours.
- Cache card-detail responses and revalidate when a CardAPI webhook reports a change.
- Display the source update date in the education panel.
- Keep the most recent valid cached response during a temporary provider outage.
- Flag stale data internally after 48 hours without a successful refresh.
- Unpublish a card if critical fee or application-link data cannot be verified.

## 8. Functional requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-001 | The landing page presents Cardverse, its factual description, a zoomed-out card field, and an Explore cards action. | Must |
| FR-002 | Explore cards transitions to the main canvas. | Must |
| FR-003 | The main canvas pans through pointer, wheel/trackpad, keyboard, and touch input. | Must |
| FR-004 | The canvas wraps seamlessly on both axes. | Must |
| FR-005 | Cards use approved actual artwork and remain level. | Must |
| FR-006 | Users can apply predefined filters without entering personal information. | Must |
| FR-007 | Selecting a card opens a sidebar on desktop and bottom sheet on mobile. | Must |
| FR-008 | Closing a selection restores the exact prior canvas state. | Must |
| FR-009 | A selected card can be rotated in 3D with pointer, touch, and keyboard input. | Must |
| FR-010 | The education panel displays fees, rewards, offer details, limitations, and freshness. | Must |
| FR-011 | Issuer and rates-and-fees actions open the correct external pages. | Must |
| FR-012 | Filter and selected-card state survive refresh and browser navigation. | Should |
| FR-013 | The app remains usable with reduced motion or without WebGL. | Must |
| FR-014 | CardAPI failures fall back to recent valid cached data. | Must |
| FR-015 | The interface never exposes the CardAPI credential. | Must |

## 9. States and edge cases

### Loading

- Render the starfield and controls immediately.
- Reserve card-art dimensions to prevent layout shifts.
- Reveal cards progressively without moving already-rendered cards.

### Provider error

- Use recent cached data when available.
- If no usable data exists, show a calm retry state rather than an empty canvas.
- Do not display partially populated fee or offer information as complete.

### Missing artwork

- Exclude the affected card from the public canvas until approved artwork is available.
- Do not display generic artwork that could be mistaken for an issuer product.

### Changed or discontinued card

- Remove application actions immediately.
- Keep historical display out of the MVP.
- Replace the card in the curated field after editorial review.

### No filter matches

- Keep the starfield and controls visible.
- Display “No cards match this filter.”
- Provide a Reset filters action.

## 10. Accessibility

- Meet WCAG 2.2 AA for text, controls, focus states, and interaction alternatives.
- Provide a visible focus indicator for every actionable element.
- Treat each card as a semantic button with an accessible name containing issuer and product.
- Provide nonspatial next-card and previous-card keyboard commands.
- Announce selection, filter changes, result counts, and panel state through an ARIA live region.
- Trap focus inside the open sidebar or bottom sheet and return focus to the selected card on close.
- Support Escape to close the card panel.
- Support reduced motion, reduced transparency, and high-contrast preferences.
- Never encode fees, categories, or selection state through color alone.
- Decorative stars are hidden from assistive technology.
- Card artwork receives concise alt text and is not used as the only source of the card name.

## 11. Performance

Initial targets on a mid-range mobile device and typical 4G connection:

- Largest Contentful Paint under 2.5 seconds at the 75th percentile.
- Interaction to Next Paint under 200 milliseconds at the 75th percentile.
- Cumulative Layout Shift below 0.1.
- Canvas movement targets 60 frames per second and should remain above 45 frames per second during ordinary panning.
- Initial JavaScript should exclude card-detail and 3D code until it is needed.
- Prefetch details only for cards near the viewport center.
- Use responsive image sizes and modern formats.
- Limit the number of active DOM or WebGL objects through virtual tiling.

## 12. Technical approach

### Application structure

- Next.js App Router with TypeScript.
- `/` for the landing page.
- `/cards` for the interactive canvas.
- Query parameters for filters and selected-card state.
- Server-only CardAPI client and normalization layer.
- Cached normalized data returned to the client through server components or internal route handlers.

### Canvas model

- Use a deterministic base layout for the curated card set.
- Repeat the base layout as virtual tiles surrounding the viewport.
- Wrap the logical camera coordinate after it crosses a tile boundary.
- Keep logical positions separate from rendered positions to avoid floating-point drift.
- Render only the current tile and neighboring tiles needed to cover the viewport.
- Preserve the same layout seed across sessions so the field feels learnable.

### 3D implementation

Start with CSS 3D transforms if they satisfy visual quality, accessibility, and performance requirements. Use a small dedicated WebGL component only if realistic thickness, lighting, or front/back asset handling requires it. The canvas itself should not depend on WebGL.

### Data normalization

Normalize provider responses into a stable internal `Card` model so provider changes do not leak throughout the interface.

Minimum internal fields:

```ts
type Card = {
  id: string;
  name: string;
  issuer: string;
  network: string;
  country: "US";
  annualFee: number | null;
  foreignTransactionFee: number | null;
  purchaseApr: string | null;
  welcomeOffer: {
    amount: string;
    currency: string;
    spendRequirement: number | null;
    timePeriodMonths: number | null;
  } | null;
  rewardRates: RewardRate[];
  benefits: string[];
  applicationRules: string[];
  isBusiness: false;
  updatedAt: string;
  artworkUrl: string;
  issuerUrl: string;
  ratesAndFeesUrl: string;
  editorialSummary: string;
  filters: string[];
};
```

## 13. Privacy and security

- No account or user profile is created.
- Do not collect income, credit score, transaction history, or application data.
- Keep the CardAPI key and webhook secret in server-side environment variables.
- Validate webhook signatures if supported by the provider.
- Allowlist external issuer and rates-and-fees domains.
- Sanitize all provider-supplied text and URLs before rendering.
- Rate-limit public data endpoints to reduce abuse and provider-cost exposure.
- Use anonymous, consent-aware analytics without cross-site advertising identifiers.

## 14. Analytics

Recommended anonymous events:

- `landing_viewed`
- `explore_cards_clicked`
- `canvas_entered`
- `canvas_panned`
- `filter_opened`
- `filter_applied`
- `filter_reset`
- `card_selected`
- `card_rotated`
- `card_panel_expanded`
- `card_panel_closed`
- `issuer_clicked`
- `rates_fees_clicked`
- `data_error_shown`

Do not include personal financial data in analytics payloads.

## 15. Success metrics

Initial targets to validate after launch:

- At least 60% of landing-page visitors enter the card canvas.
- At least 45% of canvas visitors select one or more cards.
- Median engaged visitor opens at least two cards.
- At least 20% of card selectors use a predefined filter.
- Fewer than 1% of sessions encounter an unrecovered data or artwork error.
- At least 95% of card panels display data updated within the previous 48 hours.

These targets are hypotheses and should be revised after a baseline traffic period.

## 16. Acceptance criteria

### Landing page

- No card is visually dominant or described as recommended.
- The Cardverse identity, service description, card count, and Explore cards action are visible without scrolling on desktop and mobile.
- Explore cards reaches the interactive canvas through motion or a reduced-motion fallback.

### Main canvas

- A tester can pan continuously for at least three full virtual-field widths or heights without seeing a seam, blank region, or jump.
- Pointer, touch, wheel/trackpad, and keyboard navigation work.
- Every published card is reachable.
- Cards remain level at rest.

### Filters

- Every filter returns only eligible US consumer cards.
- Result count and URL update correctly.
- Reset returns the complete curated set.

### Card selection

- Correct card information opens without route-level navigation.
- The desktop sidebar and mobile bottom sheet meet the approved Paper designs.
- Closing returns the user to the same canvas position.
- Selected-card rotation works with pointer, touch, keyboard, and reduced-motion alternatives.

### Data

- All visible numerical values map to the normalized provider response or approved editorial configuration.
- Every card has approved artwork, issuer URL, and rates-and-fees URL.
- API credentials are absent from browser bundles and network requests.

## 17. Launch checklist

- Finalize the curated launch set and definition of “popular.”
- Select the required CardAPI tier and provision production credentials.
- Confirm API rate limits, webhook signing, and production service-level expectations.
- Secure artwork rights and card-back treatment.
- Editorially verify every fee, offer, reward cap, APR, URL, and summary.
- Complete accessibility testing with keyboard, screen reader, reduced motion, and touch input.
- Test canvas wrapping across supported viewport sizes and zoom levels.
- Validate analytics and consent behavior.
- Add financial-information and affiliate disclosures as applicable.
- Establish an incident process for stale or incorrect card data.

## 18. Open decisions

1. What objective source or editorial method defines “popular” for the initial 28 cards?
2. Will issuer links be direct or affiliate links?
3. Does the selected CardAPI plan include every endpoint and webhook required by the MVP?
4. Does CardAPI provide artwork with acceptable usage rights, or will artwork be managed separately?
5. What approved asset or treatment will be used for the back of a rotating card?
6. Should filter combinations be supported at launch or limited to one active filter?
7. Which browsers and device generations define the minimum supported performance baseline?

## 19. Design references

- [Cardverse landing page](design-exports/editorial-observatory-landing.png)
- [Desktop canvas](design-exports/main-canvas-browsing.png)
- [Desktop selected-card state](design-exports/main-canvas-card-selected.png)
- [Mobile canvas](design-exports/mobile-canvas-browsing.png)
- [Mobile selected-card state](design-exports/mobile-canvas-card-selected.png)
- [Paper design file](https://app.paper.design/file/01KYWPNNNRZ2Z7JAAWYVF990F4/1-0)

## 20. External references

- [CardAPI API reference](https://cardapi.dev/docs)
- [CardAPI product overview](https://cardapi.dev/)

