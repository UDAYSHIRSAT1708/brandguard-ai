# BrandGuard AI — Design System & UI/UX Specification

## 1. Aesthetic Direction: Premium Editorial Brand Governance

BrandGuard AI rejects generic blue SaaS gradients and cookie-cutter dashboards in favor of an authoritative, calm, editorial workspace. The visual tone evokes high-end publishing houses, institutional brand guidelines, and legal typography.

### Core Visual Principles
1. **Calm, High-Contrast Surfaces**: Warm ivory (`#FAF8F5`) backgrounds paired with pure white (`#FFFFFF`) card surfaces and deep charcoal (`#1C1917`) ink typography.
2. **Intentional Accents**: Deep forest green (`#2D6A4F`) communicates authority and approval; burnt orange (`#C2410C`) signals high-visibility alerts without inducing panic.
3. **Structured Editorial Hierarchy**: Clear section dividers, crisp 1px borders (`#E7E5E4`), monospace metadata tags, and deliberate typographical hierarchy.
4. **Actionable Findings**: Finding cards feature a distinct left-severity border, exact citation chips, and side-by-side suggested fixes with clear accept/reject controls.

---

## 2. Color Palette Tokens

| Semantic Token | Hex Code | Tailwind / CSS Variable | Description |
|----------------|----------|-------------------------|-------------|
| `bg-canvas` | `#FAF8F5` | `bg-[var(--bg-canvas)]` | Main page background (warm ivory) |
| `bg-surface` | `#FFFFFF` | `bg-[var(--bg-surface)]` | Elevated cards and modals |
| `bg-sidebar` | `#1C1917` | `bg-[var(--bg-sidebar)]` | Distinct dark sidebar (charcoal ink) |
| `text-primary` | `#1C1917` | `text-[var(--text-primary)]`| Headlines, body titles, active text |
| `text-secondary`| `#57534E`| `text-[var(--text-secondary)]`| Subtitles, labels, descriptions |
| `text-muted` | `#A8A29E` | `text-[var(--text-muted)]` | Timestamps, placeholders, inactive |
| `accent-forest`| `#2D6A4F` | `bg-emerald-800 / #2D6A4F`| Primary CTA, approved state, active nav |
| `accent-forest-hover`| `#24563F`| `#24563F` | Hover state for primary buttons |
| `accent-amber` | `#C2410C` | `bg-amber-700 / #C2410C` | Highlights, warnings, secondary action |
| `border-subtle`| `#E7E5E4` | `border-stone-200` | Card borders, table dividers |
| `border-focus` | `#2D6A4F` | `ring-[#2D6A4F]` | Keyboard focus rings |

### Finding Severity Matrix
- **Critical (Red)**: Border `#DC2626`, Background `#FEF2F2`, Text `#991B1B` (Prohibited phrases, major legal violations)
- **High (Burnt Orange)**: Border `#EA580C`, Background `#FFF7ED`, Text `#9A3412` (Unsupported statistics & performance claims)
- **Medium (Amber)**: Border `#D97706`, Background `#FFFBEB`, Text `#92400E` (Tone discrepancy, unauthorized promises)
- **Low / Info (Blue / Slate)**: Border `#2563EB`, Background `#EFF6FF`, Text `#1E40AF` (Terminology, stylistic enhancements)

---

## 3. Typography & Spacing System

- **Primary Font**: `Inter`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `sans-serif`
- **Monospace Font**: `ui-monospace`, `SFMono-Regular`, `Menlo`, `Monaco`, `Consolas`, monospace (used for source IDs, rule codes, exact flagged snippets)
- **Scale**:
  - `text-xs`: 12px (labels, badges, metadata chips)
  - `text-sm`: 14px (standard interface text, tables, inputs)
  - `text-base`: 16px (reading content, review text)
  - `text-lg`: 18px (card titles, modal headers)
  - `text-xl`: 20px (section headers)
  - `text-2xl`: 24px (page titles)
  - `text-3xl`: 30px (dashboard KPIs)

---

## 4. Screen Layout & Component Patterns

### App Shell
- **Fixed Sidebar**: 240px wide, deep charcoal background (`#1C1917`), featuring BrandGuard AI insignia, organization badge, navigation menu, and user role switcher.
- **Top Bar**: Breadcrumbs, environment / mode indicator (Live AI vs Demo Mode banner), provider status pulse, and user profile.
- **Main Canvas**: Warm ivory background with max-width content container (1400px), responsive padding.

### Core Screens
1. **Dashboard (`/`)**: High-level governance posture, active review queue, severity distribution, recent audit log entries.
2. **Review Workspace (`/reviews/new` & `/reviews/:id`)**: Split-pane interface. Left pane: rich content editor with content type selector (Website, Social, Email, Press Release). Right pane: live review triggers, findings panel, evidence drawer, and revision history.
3. **Findings View**: Grouped by severity with instant "Accept Suggestion" / "Resolve" buttons.
4. **Brand Knowledge Centre (`/knowledge`)**: Filterable repository of Guidelines, Facts, Terminology, and Claims with approval status badges (`Approved`, `Draft`, `Archived`).
5. **Approval Queue (`/approvals`)**: Dedicated reviewer portal with version diffs and one-click Approval / Rejection with mandatory justification.
6. **Audit & Analytics (`/analytics` & `/audit`)**: Real database-driven metrics, compliance rate trends, and immutable security audit log.
7. **System & Provider Health (`/settings`)**: Live health status for Gemini, OpenAI fallback, and MongoDB connectivity.
