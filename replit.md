# EVE Online SRP Management System

## Overview

This is a Ship Replacement Program (SRP) management system for the Nisuwa Cartel alliance in EVE Online. The application allows alliance members to submit SRP requests for ships lost during fleet operations, and enables administrators and fleet commanders to review, approve, or deny those requests.

The system features a dashboard with statistics, request submission forms, request tracking, and administrative tools for managing ship types and processing reimbursements.

## User Preferences

Preferred communication style: Simple, everyday language.

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
- **Provider**: Replit Auth (OpenID Connect)
- **Session Storage**: PostgreSQL-backed sessions via connect-pg-simple
- **Session Management**: Express-session with secure cookies

### Key Database Tables
- `users` - User accounts (managed by Replit Auth)
- `sessions` - Session storage for authentication
- `user_roles` - Role assignments (member, fc, admin)
- `ship_types` - Ship definitions with categories and base ISK values
- `srp_requests` - SRP request submissions with status tracking

### Role-Based Access Control
- **member**: Can submit requests and view their own requests
- **fc** (Fleet Commander): Extended permissions for fleet-related features
- **admin**: Full access including request approval/denial and ship type management

## External Dependencies

### Core Services
- **PostgreSQL Database**: Primary data store (provision via Replit Database)
- **Replit Auth**: Authentication provider using OpenID Connect

### Third-Party APIs
- **zKillboard/EVE ESI**: Killmail URL validation for SRP requests

### Key npm Packages
- `drizzle-orm` / `drizzle-kit`: Database ORM and migration tools
- `express` / `express-session`: Web server and session management
- `passport` / `openid-client`: Authentication handling
- `@tanstack/react-query`: Client-side data fetching and caching
- `zod`: Schema validation (shared between client and server)
- `@radix-ui/*`: Accessible UI component primitives
- `tailwindcss`: Utility-first CSS framework