# EVE Online SRP Management System - Design Guidelines

## Design Approach
**System Selected:** Material Design + Linear-inspired Dashboard Aesthetics
**Rationale:** Data-heavy administrative interface requiring efficiency, clarity, and professional presentation for managing SRP requests and approvals.

## Core Design Elements

### Typography
- **Primary Font:** Inter (Google Fonts) - clean, modern, excellent for data display
- **Hierarchy:**
  - H1: text-3xl font-bold (page titles)
  - H2: text-xl font-semibold (section headers)
  - H3: text-lg font-medium (card titles)
  - Body: text-base (standard content)
  - Small: text-sm (metadata, timestamps)
  - Mono: font-mono text-sm (ISK values, ship names, IDs)

### Layout System
**Spacing Primitives:** Tailwind units of 2, 4, 6, and 8
- Component padding: p-4 to p-6
- Section spacing: gap-6 to gap-8
- Page margins: mx-8, my-6

**Container Structure:**
- Sidebar: w-64 fixed
- Main content: max-w-7xl with responsive padding
- Cards: rounded-lg with defined boundaries

### Component Library

**Navigation:**
- Fixed sidebar (left) with alliance branding at top
- Main sections: Dashboard, New Request, My Requests, All Requests (admin), Approve/Deny (admin), Settings
- User profile dropdown in top-right corner
- Logout and role indicator

**Dashboard Cards:**
- Stat cards: Grid layout showing pending requests, approved today, total ISK paid out, average processing time
- Recent activity feed
- Quick action buttons (Submit SRP, View Queue)

**Request Forms:**
- Clean vertical forms with clear labels above inputs
- Required field indicators (asterisk)
- Killmail URL input with validation
- Ship type dropdown with search
- ISK amount field with formatting
- Evidence upload area (drag-and-drop zone)
- Loss description textarea
- Submit/Cancel buttons (primary/secondary)

**Request Tables:**
- Sortable columns: Date, Pilot Name, Ship Type, ISK Amount, Status
- Status badges: Pending (neutral), Approved (success), Denied (danger), Processing (info)
- Row hover states for interactivity
- Action buttons per row (View Details, Approve/Deny for admins)
- Pagination controls at bottom

**Request Detail View:**
- Two-column layout: Left (request info), Right (admin actions/notes)
- Killmail embed or link preview
- Pilot information card
- Loss details section
- Admin notes/comments area
- Approval/denial form (admin only)
- Status timeline showing request lifecycle

**Modals:**
- Confirmation dialogs for approve/deny actions
- Backdrop with subtle blur
- Centered, max-w-lg containers
- Clear primary/secondary action buttons

### Icons
**Library:** Heroicons (via CDN)
- Consistent outline style throughout
- Size: h-5 w-5 for inline, h-6 w-6 for buttons
- Usage: status indicators, navigation items, action buttons

### Animations
**Minimal approach:**
- Subtle fade-in for page transitions
- Smooth hover states on interactive elements
- Loading spinners for async operations
- No elaborate scroll or decorative animations

### Forms & Inputs
- Consistent border styling with focus states
- Clear error messaging below fields
- Disabled states visually distinct
- Autocomplete for pilot names (if applicable)
- Number formatting for ISK values (commas)

### Data Display
- Consistent table styling across all views
- Responsive breakpoints: stack table on mobile
- Clear visual hierarchy in status badges
- Monospace font for numeric ISK values
- Timestamp formatting: relative time ("2 hours ago") with tooltip showing exact datetime

### Security Indicators
- Role badges visible in header (Admin, FC, Member)
- Session timeout warnings
- Secure connection indicator
- Activity logs visible to admins

### Images
**No hero images needed** - this is a dashboard application focused on data and functionality. All visual elements should serve utility purposes (icons, status indicators, alliance logo in sidebar).

---

**Design Principle:** Prioritize clarity, speed, and trustworthiness. Every element should facilitate efficient SRP request management with minimal cognitive load. Clean, professional aesthetic that reflects the seriousness of managing alliance resources.