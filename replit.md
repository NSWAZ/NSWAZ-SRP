# EVE Online SRP Management System

## Overview

This is a Ship Replacement Program (SRP) management system for the Nisuwa Cartel alliance in EVE Online. The application allows alliance members to submit SRP requests for ships lost during fleet operations, and enables administrators and fleet commanders to review, approve, or deny those requests.

The system features a dashboard with statistics, request submission forms, request tracking, administrative tools for managing ship types, and payment management for tracking approved payouts by main character.

## User Preferences

- Preferred communication style: Simple, everyday language.
- UI Language: Korean (한국어) - All user-facing text, labels, buttons, and messages are in Korean

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state caching and synchronization
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode support)
- **Form Handling**: React Hook Form with Zod validation
- **Design System**: Material Design + Linear-inspired dashboard aesthetics with Inter font

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **API Pattern**: RESTful JSON API with `/api` prefix
- **Build Tool**: Vite for frontend, esbuild for server bundling

### Data Storage
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with drizzle-zod for schema validation
- **Schema Location**: `shared/schema.ts` for shared types between client and server
- **Migrations**: Managed via `drizzle-kit push`

### Authentication
- **Provider**: EVE Online SSO (OAuth 2.0 Authorization Code flow)
- **Session Storage**: PostgreSQL-backed sessions via connect-pg-simple
- **Session Management**: Express-session with secure cookies and CSRF protection
- **User Data Storage**: Session-only (no user tables in DB) - SeAT API is the source of truth
- **User Identification**: seatUserId (integer) from SeAT API, stored in session
- **Token Refresh**: Automatic access token refresh using refresh tokens
- **Character Ownership**: Associated character IDs fetched from SeAT `/api/v2/users/{user_id}` endpoint and stored in session for killmail ownership validation
- **Login Requirement**: User must be registered in SeAT - unregistered characters are rejected with guidance to add to SeAT

### Key Database Tables
- `sessions` - Session storage for authentication (user data stored in session, not separate table)
- `user_roles` - Role assignments by seatUserId (member, fc, admin)
- `fleets` - Fleet operations created by FC/admin users (references createdBySeatUserId)
- `srp_requests` - SRP request submissions with status tracking (references seatUserId for ownership)
- `srp_process_log` - Audit log tracking all SRP request state changes with timestamps and actor names. Process types: created (pending), approve (approved), deny (denied), pay (paid). Status is derived from the latest process log entry.

### Role-Based Access Control
- **member**: Can submit requests and view their own requests
- **fc** (Fleet Commander): Extended permissions for fleet-related features
- **admin**: Full access including request approval/denial and ship type management

## External Dependencies

### Core Services
- **PostgreSQL Database**: Primary data store (provision via Replit Database)
- **EVE Online SSO**: Authentication provider using OAuth 2.0

### Third-Party APIs
- **EVE Online SSO**: Character authentication (https://login.eveonline.com)
- **zKillboard/EVE ESI**: Killmail URL validation for SRP requests
- **SeAT API**: Character synchronization (https://seat.nisuwaz.com/api/v2)

### Required Environment Variables
- `EVE_CLIENT_ID`: EVE Developer Portal application Client ID
- `EVE_CLIENT_SECRET`: EVE Developer Portal application Secret Key
- `SESSION_SECRET`: Session encryption secret
- `DATABASE_URL`: PostgreSQL connection string
- `SEAT_API_TOKEN`: SeAT API token for multi-character sync (optional but required for character ownership validation)

### Key npm Packages
- `drizzle-orm` / `drizzle-kit`: Database ORM and migration tools
- `express` / `express-session`: Web server and session management
- `connect-pg-simple`: PostgreSQL session storage
- `@tanstack/react-query`: Client-side data fetching and caching
- `zod`: Schema validation (shared between client and server)
- `@radix-ui/*`: Accessible UI component primitives
- `tailwindcss`: Utility-first CSS framework