# Wolthers Coffee Quality Control System

A comprehensive quality control system for coffee laboratories built with Next.js, TypeScript, and Supabase.

**Domain**: qc.wolthers.com

## Features

- **Three-column responsive layout** with collapsible sidebars
- **Role-based authentication** with Microsoft OAuth and email/password
- **Dark/Light theme toggle** with system preference detection
- **Interactive dashboard** with real-time sample tracking
- **Multi-lab support** for global operations (Santos HQ, Buenaventura, Guatemala, Peru)
- **Dynamic storage management** with lab-specific configurations
- **Quality specifications system** (recipe-based approach)
- **Finance dashboards** with per-lab breakdown and global overview
- **Real-time notifications** and activity tracking
- **Modern UI components** built with Shadcn/ui

## Tech Stack

- **Frontend**: Next.js 15+ with TypeScript
- **Styling**: Tailwind CSS with custom design tokens
- **UI Components**: Shadcn/ui
- **Charts**: Recharts for data visualizations
- **State Management**: Zustand (planned)
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **Authentication**: Supabase Auth with Microsoft OAuth
- **Real-time**: Supabase Realtime subscriptions
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm package manager
- Supabase account

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd WAQC
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   ```
   Fill in your Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   NEXT_PUBLIC_DOMAIN=qc.wolthers.com
   ```

4. Set up the database:
   - Run the SQL migration in `database/migrations/001_initial_schema.sql`
   - See `database/README.md` for detailed setup instructions

5. Start the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3001](http://localhost:3001) in your browser.

## Project Structure

```
src/
├── app/                    # Next.js app directory
│   ├── auth/              # Authentication routes
│   ├── globals.css        # Global styles with Wolthers theme
│   ├── layout.tsx         # Root layout with providers
│   └── page.tsx           # Main dashboard with auth
├── components/
│   ├── auth/              # Authentication components
│   ├── layout/            # Layout components (header, sidebars)
│   ├── providers/         # React providers (theme, auth)
│   └── ui/                # Reusable UI components (Shadcn/ui)
├── lib/
│   ├── auth.ts           # Authentication utilities
│   ├── supabase.ts       # Supabase client and types
│   └── utils.ts          # Utility functions
database/
├── migrations/           # SQL migration files
└── README.md            # Database setup instructions
```

## User Roles & Permissions

### Laboratory Roles
- **Lab Personnel**: Standard lab access
- **Lab Finance Manager**: Lab-specific finance access
- **Lab Quality Manager**: Lab-specific quality management

### Global Roles
- **Santos HQ Finance**: Automatic global finance access
- **Global Finance Admin**: Assignable global finance access
- **Global Quality Admin**: Cross-lab quality oversight
- **Global Admin**: Full system control

### External Roles
- **Client**: Sample tracking and certificate access
- **Supplier**: Performance metrics and dashboards
- **Buyer**: Supply chain visibility and Sankey charts

## Laboratory Network

### Current Labs
1. **Santos HQ** (Brazil) - Master lab with global oversight
2. **Buenaventura Lab** (Colombia) - Regional operations
3. **Guatemala City Lab** - Central America operations
4. **Peru Lab** - Third-party service provider

### Storage Management
Each lab has configurable storage with:
- Dynamic shelf/position configuration
- AI-powered storage analysis (planned)
- Visual storage interfaces
- Lab-specific naming patterns

## Quality Specifications System

The system uses a "recipe-based" approach:
- **Quality Templates**: Master recipes for different coffee types
- **Client Qualities**: Client-specific configurations based on templates
- **Parameter Inheritance**: Flexible customization per origin/client
- **Version Control**: Track changes to quality specifications

## Design System

Follows Wolthers brand guidelines:

### Colors
- **Dark Mode**: #2A2A2A background, rgba(255,255,255,0.04) cards
- **Light Mode**: #FFFFFF background, #F9F9FA cards
- **Chart Colors**: #ADADFB, #A0BCE8, #6BE6D3, #7DBBFF, #B899EB, #71DD8C

### Typography
- **Font**: Inter (imported from Google Fonts)
- **Sizes**: 14px base, 24px metrics, 12px labels
- **Weights**: 400 regular, 600 semibold

### Layout
- **Border Radius**: 20px for cards, 12px for navigation items
- **Spacing**: 24px padding for cards, consistent 8px grid system

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Adding Components

Use Shadcn/ui CLI to add new components:

```bash
npx shadcn@latest add [component-name]
```

## Implementation Status

✅ **Phase 1 - Foundation (COMPLETED)**
- [x] Next.js project initialization with TypeScript
- [x] Three-column responsive layout with collapsible sidebars
- [x] Dark/Light theme system with toggle
- [x] Authentication system (Supabase Auth + Microsoft OAuth)
- [x] Role-based permission system
- [x] Database schema design with RLS policies
- [x] User management and profiles
- [x] Laboratory configuration system
- [x] Quality specifications database structure

🚧 **Phase 2 - Core Features (IN PROGRESS)**
- [ ] Sample management forms and intake
- [ ] Quality assessment workflow
- [ ] Storage management interface
- [ ] Finance dashboards (Santos HQ + lab-specific)
- [ ] Quality template builder
- [ ] Client-specific quality configurations
- [ ] Certificate generation system

🔄 **Phase 3 - Advanced Features (PLANNED)**
- [ ] Real-time cupping sessions
- [ ] OCR integration for sample labels
- [ ] AI-powered storage optimization
- [ ] iPad application
- [ ] Advanced analytics and reporting
- [ ] API development for integrations

## Task Tracking

See `tasks.md` for detailed development tasks with numbered steps and completion status.

## Deployment

Configured for Vercel deployment on qc.wolthers.com:

1. Connect GitHub repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Set up custom domain (qc.wolthers.com)
4. Deploy automatically on every push to main branch

## Security

- **Row Level Security**: Database-level access control
- **Role-based permissions**: User role enforcement
- **Data isolation**: Lab-specific data access
- **Global admin controls**: Santos HQ and designated global access
- **Audit trails**: Complete activity logging

## License

Private - Wolthers Coffee Quality Control System
