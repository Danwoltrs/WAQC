# Wolthers Coffee QC System - Development Tasks

**Domain:** qc.wolthers.com  
**Last Updated:** October 6, 2025

## Overview
Comprehensive task tracking for the Wolthers Coffee Quality Control System development. Tasks are organized by feature area with priority levels and completion status.

**Status Legend:**
- ✅ Complete
- 🔄 In Progress
- ⬜ Pending
- 🚫 Blocked

**Priority Levels:**
- P1: Critical for MVP
- P2: Important for full release
- P3: Nice to have

---

## 1.0 PROJECT FOUNDATION

### 1.1 Core Setup
- [x] 1.1.1 Next.js 14+ initialization with TypeScript
- [x] 1.1.2 Tailwind CSS configuration
- [x] 1.1.3 Shadcn/ui component library setup
- [x] 1.1.4 Basic Supabase configuration files
- [x] 1.1.5 Project structure organization
- [ ] 1.1.6 Environment variables configuration (.env.local)
- [ ] 1.1.7 Git repository initialization
- [ ] 1.1.8 Domain configuration (qc.wolthers.com)
- [ ] 1.1.9 Vercel deployment setup
- [ ] 1.1.10 SSL certificate configuration

### 1.2 Development Environment
- [x] 1.2.1 ESLint configuration
- [x] 1.2.2 TypeScript strict mode setup
- [ ] 1.2.3 Prettier configuration
- [ ] 1.2.4 Pre-commit hooks setup
- [ ] 1.2.5 VS Code workspace settings

---

## 2.0 DATABASE ARCHITECTURE

### 2.1 Quality Specifications Database (Recipe System) [P1]
- [ ] 2.1.1 Design quality_templates table (master recipes)
- [ ] 2.1.2 Create quality_parameters table (configurable fields)
- [ ] 2.1.3 Design client_qualities table (client-specific configs)
- [ ] 2.1.4 Implement quality_versions table (version control)
- [ ] 2.1.5 Create quality_inheritance system
- [ ] 2.1.6 Design parameter_definitions table:
  - [ ] Screen sizes (9-20 with percentages)
  - [ ] Defect categories and thresholds
  - [ ] Moisture requirements
  - [ ] Cupping minimums
  - [ ] Processing methods
- [ ] 2.1.7 Multi-origin support structure
- [ ] 2.1.8 Quality template cloning system

### 2.2 Laboratory Configuration [P1]
- [ ] 2.2.1 Create laboratories table
- [ ] 2.2.2 Design storage_configurations table
- [ ] 2.2.3 Implement shelf_positions table
- [ ] 2.2.4 Create lab_settings table
- [ ] 2.2.5 Design lab_capabilities table
- [ ] 2.2.6 Lab hierarchy structure (HQ vs regional)

### 2.3 Core Tables Setup [P1]
- [ ] 2.3.1 Create samples table
- [ ] 2.3.2 Design quality_assessments table
- [ ] 2.3.3 Create cupping_sessions table
- [ ] 2.3.4 Design cupping_scores table
- [ ] 2.3.5 Create users table with roles
- [ ] 2.3.6 Design clients table
- [ ] 2.3.7 Create certificates table
- [ ] 2.3.8 Design suppliers table
- [ ] 2.3.9 Integration with trips.wolthers.com database
- [ ] 2.3.10 Row-level security policies

---

## 3.0 AUTHENTICATION & ACCESS CONTROL

### 3.1 Role-Based Permissions [P1]
- [ ] 3.1.1 Define permission matrix
- [ ] 3.1.2 Create roles table structure:
  - [ ] Lab Personnel (standard)
  - [ ] Lab Finance Manager
  - [ ] Lab Quality Manager
  - [ ] Santos HQ Finance (global access)
  - [ ] Global Finance Admin (assignable)
  - [ ] Global Quality Admin
  - [ ] Global Admin (system control)
- [ ] 3.1.3 Implement permission inheritance
- [ ] 3.1.4 Santos HQ special permissions
- [ ] 3.1.5 Lab-level data isolation

### 3.2 Authentication Implementation [P1]
- [ ] 3.2.1 Supabase Auth setup
- [ ] 3.2.2 Email/Password authentication
- [ ] 3.2.3 Microsoft OAuth integration
- [ ] 3.2.4 Session management
- [ ] 3.2.5 Automatic timeout implementation
- [ ] 3.2.6 Password requirements
- [ ] 3.2.7 MFA for admin accounts

### 3.3 Permission Assignment System [P2]
- [ ] 3.3.1 Global Admin permission granting UI
- [ ] 3.3.2 Role assignment workflow
- [ ] 3.3.3 Permission audit logging
- [ ] 3.3.4 Access control matrix implementation
- [ ] 3.3.5 Permission change notifications

---

## 4.0 QUALITY SPECIFICATIONS SYSTEM (Recipe Management)

### 4.1 Quality Template Builder [P1]
- [ ] 4.1.1 Master quality definition interface
- [ ] 4.1.2 Parameter configuration forms:
  - [ ] Screen size range builder (9-20)
  - [ ] Defect category manager
  - [ ] Moisture content settings
  - [ ] Cupping score requirements
  - [ ] Processing method selector
- [ ] 4.1.3 Template cloning functionality
- [ ] 4.1.4 Template versioning system
- [ ] 4.1.5 Template preview interface

### 4.2 Client-Specific Qualities [P1]
- [ ] 4.2.1 Client quality library UI
- [ ] 4.2.2 Origin variation manager
- [ ] 4.2.3 Micro-lot specification forms
- [ ] 4.2.4 Estate/cooperative requirements
- [ ] 4.2.5 Quality inheritance selector
- [ ] 4.2.6 Bulk quality import/export

### 4.3 Quality Compliance Engine [P1]
- [ ] 4.3.1 Real-time validation system
- [ ] 4.3.2 Pass/fail logic implementation
- [ ] 4.3.3 Parameter-by-parameter checking
- [ ] 4.3.4 Override workflow with justification
- [ ] 4.3.5 Compliance history tracking
- [ ] 4.3.6 Alert system for non-compliance

---

## 5.0 STORAGE MANAGEMENT SYSTEM

### 5.1 Lab Configuration Module [P1]
- [ ] 5.1.1 Lab setup wizard UI
- [ ] 5.1.2 Shelf configuration interface
- [ ] 5.1.3 Column/row input system
- [ ] 5.1.4 Sample tin capacity settings
- [ ] 5.1.5 Naming convention builder
- [ ] 5.1.6 Storage template system

### 5.2 AI-Powered Storage Analysis [P2]
- [ ] 5.2.1 Photo upload interface
- [ ] 5.2.2 AI integration for shelf detection
- [ ] 5.2.3 Automatic configuration generator
- [ ] 5.2.4 Manual adjustment tools
- [ ] 5.2.5 Verification workflow
- [ ] 5.2.6 Configuration confidence scoring

### 5.3 Location-Specific Setups [P1]
- [ ] 5.3.1 Santos HQ storage configuration
- [ ] 5.3.2 Buenaventura storage setup
- [ ] 5.3.3 Guatemala City storage config
- [ ] 5.3.4 Peru lab storage setup
- [ ] 5.3.5 New lab template system
- [ ] 5.3.6 Storage migration tools

### 5.4 Visual Storage Interface [P1]
- [ ] 5.4.1 Interactive storage grid component
- [ ] 5.4.2 Real-time occupancy display
- [ ] 5.4.3 Search and filter system
- [ ] 5.4.4 Drag-drop sample placement
- [ ] 5.4.5 Visual availability heatmap
- [ ] 5.4.6 Storage history tracking

---

## 6.0 UI/UX IMPLEMENTATION

### 6.1 Layout Structure [P1]
- [ ] 6.1.1 Three-column layout component
- [ ] 6.1.2 Left sidebar navigation
- [ ] 6.1.3 Main content area
- [ ] 6.1.4 Right sidebar (notifications/activities)
- [ ] 6.1.5 Responsive breakpoints
- [ ] 6.1.6 Collapsible sidebar functionality

### 6.2 Theme System [P1]
- [ ] 6.2.1 Dark/Light theme toggle
- [ ] 6.2.2 Theme persistence
- [ ] 6.2.3 System preference detection
- [ ] 6.2.4 Custom CSS variables
- [ ] 6.2.5 Theme transition animations

### 6.3 Component Library [P1]
- [ ] 6.3.1 Button components
- [ ] 6.3.2 Form components
- [ ] 6.3.3 Card components
- [ ] 6.3.4 Table components
- [ ] 6.3.5 Chart components (Recharts)
- [ ] 6.3.6 Modal/Dialog components
- [ ] 6.3.7 Toast notifications

---

## 7.0 SAMPLE MANAGEMENT

### 7.1 Sample Intake [P1]
- [ ] 7.1.1 Manual entry form
- [ ] 7.1.2 Form validation
- [ ] 7.1.3 Client auto-detection logic
- [ ] 7.1.4 Tracking number generator
- [ ] 7.1.5 Barcode/QR code generation
- [ ] 7.1.6 Sample photo upload

### 7.2 OCR Integration [P2]
- [ ] 7.2.1 Camera capture interface
- [ ] 7.2.2 OCR processing integration
- [ ] 7.2.3 Data validation UI
- [ ] 7.2.4 Correction interface
- [ ] 7.2.5 Confidence scoring display
- [ ] 7.2.6 Manual fallback system

### 7.3 Sample Tracking [P1]
- [ ] 7.3.1 Status pipeline UI
- [ ] 7.3.2 Timeline visualization
- [ ] 7.3.3 Storage assignment
- [ ] 7.3.4 Transfer between labs
- [ ] 7.3.5 Sample history log
- [ ] 7.3.6 Sample search system

---

## 8.0 QUALITY ASSESSMENT PIPELINE

### 8.1 Green Bean Analysis [P1]
- [ ] 8.1.1 Defect classification interface
- [ ] 8.1.2 Screen size analysis form
- [ ] 8.1.3 Moisture recording
- [ ] 8.1.4 Color assessment tools
- [ ] 8.1.5 Compliance checking
- [ ] 8.1.6 Photo documentation

### 8.2 Roast Analysis [P1]
- [ ] 8.2.1 Roast profile form
- [ ] 8.2.2 Quaker counting interface
- [ ] 8.2.3 Time/temperature logging
- [ ] 8.2.4 Roast level assessment
- [ ] 8.2.5 Sample preparation tracking

### 8.3 Cupping Process [P1]
- [ ] 8.3.1 Digital cupping interface (web)
- [ ] 8.3.2 Sample tab navigation
- [ ] 8.3.3 Circular navigation (iPad design)
- [ ] 8.3.4 Intensity sliders
- [ ] 8.3.5 Real-time collaboration
- [ ] 8.3.6 Score synchronization
- [ ] 8.3.7 Handwritten card integration
- [ ] 8.3.8 SCA Q Grading support

### 8.4 Global Quality Overview [P2]
- [ ] 8.4.1 Cross-lab quality metrics
- [ ] 8.4.2 Comparative analysis dashboard
- [ ] 8.4.3 Standardization monitoring
- [ ] 8.4.4 Quality trend charts
- [ ] 8.4.5 Best practices identification

---

## 9.0 FINANCE & LAB MONITORING

### 9.1 Lab-Level Finance Dashboard [P1]
- [ ] 9.1.1 Individual lab revenue display
- [ ] 9.1.2 Sample volume metrics
- [ ] 9.1.3 Approval/rejection rates
- [ ] 9.1.4 Operating cost tracking
- [ ] 9.1.5 Local invoice management
- [ ] 9.1.6 Lab P&L statements

### 9.2 Santos HQ Finance Dashboard (Global) [P1]
- [ ] 9.2.1 All labs overview dashboard
- [ ] 9.2.2 Per-lab revenue breakdown
- [ ] 9.2.3 Own vs 3rd party analytics
- [ ] 9.2.4 Global P&L consolidation
- [ ] 9.2.5 Cost efficiency metrics
- [ ] 9.2.6 Multi-currency handling

### 9.3 Global Finance Admin Features [P2]
- [ ] 9.3.1 Strategic planning tools
- [ ] 9.3.2 Budget allocation interface
- [ ] 9.3.3 Investment ROI tracking
- [ ] 9.3.4 Expansion planning metrics
- [ ] 9.3.5 Financial forecasting

### 9.4 Finance Permission Controls [P1]
- [ ] 9.4.1 Santos HQ automatic access
- [ ] 9.4.2 Lab-level restrictions
- [ ] 9.4.3 Global permission granting
- [ ] 9.4.4 Access audit trail
- [ ] 9.4.5 Data export controls

---

## 10.0 DASHBOARD SYSTEMS

### 10.1 Client Dashboards [P1]
- [ ] 10.1.1 Sample tracking interface
- [ ] 10.1.2 Certificate download portal
- [ ] 10.1.3 Performance metrics display
- [ ] 10.1.4 Historical data access
- [ ] 10.1.5 Notification center

### 10.2 Supplier Dashboards [P2]
- [ ] 10.2.1 Quality performance metrics
- [ ] 10.2.2 Competitive benchmarks
- [ ] 10.2.3 Quarterly reports
- [ ] 10.2.4 Improvement recommendations
- [ ] 10.2.5 Sample submission portal

### 10.3 Laboratory Dashboards [P1]
- [ ] 10.3.1 Workflow management
- [ ] 10.3.2 Productivity metrics
- [ ] 10.3.3 Storage utilization
- [ ] 10.3.4 Daily task queues
- [ ] 10.3.5 Performance tracking

### 10.4 Administrative Dashboards [P1]
- [ ] 10.4.1 User management interface
- [ ] 10.4.2 System configuration
- [ ] 10.4.3 Permission management
- [ ] 10.4.4 Audit log viewer
- [ ] 10.4.5 System health monitoring

### 10.5 Final Buyer Dashboards [P2]
- [ ] 10.5.1 Supply chain visibility
- [ ] 10.5.2 Sankey chart implementation
- [ ] 10.5.3 Traceability views
- [ ] 10.5.4 Aggregate quality reports
- [ ] 10.5.5 Supplier performance

---

## 11.0 CERTIFICATE GENERATION

### 11.1 Certificate Engine [P1]
- [ ] 11.1.1 PDF generation system
- [ ] 11.1.2 Template management
- [ ] 11.1.3 Dynamic data injection
- [ ] 11.1.4 Multi-language support
- [ ] 11.1.5 Batch generation

### 11.2 Certificate Features [P1]
- [ ] 11.2.1 Digital signatures
- [ ] 11.2.2 QR code integration
- [ ] 11.2.3 Authentication codes
- [ ] 11.2.4 Watermarking
- [ ] 11.2.5 Version control

### 11.3 Distribution System [P1]
- [ ] 11.3.1 Email delivery service
- [ ] 11.3.2 Download portal
- [ ] 11.3.3 API endpoints
- [ ] 11.3.4 Delivery tracking
- [ ] 11.3.5 Retry logic

---

## 12.0 USER & PERMISSION MANAGEMENT

### 12.1 User Management [P1]
- [ ] 12.1.1 User creation workflow
- [ ] 12.1.2 Profile management
- [ ] 12.1.3 Lab assignment
- [ ] 12.1.4 Role assignment
- [ ] 12.1.5 Password reset flow

### 12.2 Global Admin Functions [P1]
- [ ] 12.2.1 Global Finance Overview granting
- [ ] 12.2.2 Global Quality Admin assignment
- [ ] 12.2.3 New lab creation
- [ ] 12.2.4 Global settings management
- [ ] 12.2.5 System-wide announcements

### 12.3 Audit & Compliance [P2]
- [ ] 12.3.1 Access logging system
- [ ] 12.3.2 Permission change tracking
- [ ] 12.3.3 Data access audit trail
- [ ] 12.3.4 Compliance reporting
- [ ] 12.3.5 Security event monitoring

---

## 13.0 TESTING & QUALITY ASSURANCE

### 13.1 Testing Setup [P2]
- [ ] 13.1.1 Jest configuration
- [ ] 13.1.2 React Testing Library setup
- [ ] 13.1.3 Cypress E2E setup
- [ ] 13.1.4 Test database configuration
- [ ] 13.1.5 CI/CD test integration

### 13.2 Test Coverage [P2]
- [ ] 13.2.1 Unit tests (components)
- [ ] 13.2.2 Integration tests (API)
- [ ] 13.2.3 E2E test scenarios
- [ ] 13.2.4 Performance testing
- [ ] 13.2.5 Security testing

---

## 14.0 ADVANCED FEATURES (Phase 3)

### 14.1 OCR & AI Features [P3]
- [ ] 14.1.1 Advanced OCR integration
- [ ] 14.1.2 Handwriting recognition
- [ ] 14.1.3 AI quality predictions
- [ ] 14.1.4 Pattern detection
- [ ] 14.1.5 Anomaly detection

### 14.2 Mobile Applications [P3]
- [ ] 14.2.1 iPad app development
- [ ] 14.2.2 Offline functionality
- [ ] 14.2.3 Background sync
- [ ] 14.2.4 Camera integration
- [ ] 14.2.5 AirPrint support

### 14.3 Advanced Analytics [P3]
- [ ] 14.3.1 Predictive analytics
- [ ] 14.3.2 Machine learning models
- [ ] 14.3.3 Advanced reporting
- [ ] 14.3.4 Data visualization tools
- [ ] 14.3.5 Export capabilities

---

## 15.0 DEPLOYMENT & OPERATIONS

### 15.1 Deployment Setup [P1]
- [ ] 15.1.1 Vercel configuration
- [ ] 15.1.2 Environment variables
- [ ] 15.1.3 Domain setup (qc.wolthers.com)
- [ ] 15.1.4 SSL certificates
- [ ] 15.1.5 CDN configuration

### 15.2 Operations [P2]
- [ ] 15.2.1 Monitoring setup
- [ ] 15.2.2 Error tracking
- [ ] 15.2.3 Performance monitoring
- [ ] 15.2.4 Backup strategies
- [ ] 15.2.5 Disaster recovery

### 15.3 Documentation [P2]
- [ ] 15.3.1 API documentation
- [ ] 15.3.2 User manuals
- [ ] 15.3.3 Admin guides
- [ ] 15.3.4 Video tutorials
- [ ] 15.3.5 FAQ system

---

## ✅ COMPLETED TODAY (October 6, 2025)

### 🚀 **Phase 1 MVP - Authentication & Foundation (COMPLETED)**

#### **1. Authentication System** ✅
- [x] Microsoft OAuth integration with Azure AD
- [x] Email/password authentication 
- [x] Existing user database integration (`wolthers-travels`)
- [x] Automatic profile creation for OAuth users
- [x] Role-based access control foundation
- [x] Profile fetching error resolution
- [x] QC access enablement system

#### **7. Global Admin Access Control System** ✅
- [x] Global admin privileges for daniel@wolthers.com, anderson@wolthers.com, edgar@wolthers.com
- [x] Automatic access request creation for @wolthers.com users
- [x] Access requests database table and triggers
- [x] Admin interface for managing access requests (approval/rejection workflow)
- [x] Role assignment system with laboratory selection
- [x] Access request status tracking and user notifications
- [x] Integration with main dashboard for anderson@wolthers.com
- [x] Complete access control workflow from request to approval

#### **2. Login Interface Design** ✅
- [x] Beautiful branded login form with Wolthers logo
- [x] Progressive email → password disclosure flow
- [x] CLAUDE.md color palette compliance
- [x] Off-white card design (#FAFAFA)
- [x] Microsoft OAuth button with authentic branding
- [x] Responsive, compact layout
- [x] Green accent colors (#2E5A47)

#### **3. Database Integration** ✅
- [x] Successful integration with existing Supabase project
- [x] Database migration scripts (001 & 002)
- [x] Row Level Security (RLS) policies
- [x] Helper functions with error handling
- [x] User role system (10-tier hierarchy)
- [x] Santos HQ laboratory setup

#### **4. Technical Infrastructure** ✅
- [x] Next.js 15+ with TypeScript configuration
- [x] Tailwind CSS + Shadcn/ui setup
- [x] Font system (Inter) with proper loading
- [x] Hydration error fixes
- [x] Build error resolution (autoprefixer)
- [x] Development server running (localhost:3002)
- [x] MCP integration (Supabase + Shadcn)

#### **5. User Experience Features** ✅
- [x] QC access messaging for non-enabled users
- [x] Error handling and user feedback
- [x] Loading states during authentication
- [x] Automatic profile creation workflow
- [x] SQL scripts for user enablement

#### **6. UI/UX Design System** ✅
- [x] Dark/Light mode theme system implementation
- [x] Clean modern lab interface color palette
- [x] Professional header design with green color scheme
- [x] Monochrome icon system (lab-appropriate styling)
- [x] Three-column layout structure (left sidebar, main content, right sidebar)
- [x] Sidebar height fixes for full-screen extension
- [x] White Wolthers logo integration
- [x] Language selector dropdown (EN | PT | ES)
- [x] Proper theme switching between light and dark modes
- [x] Header styling: Green (#bg-green-800) for light mode, Dark green (#08231B) for dark mode
- [x] QC branding integration with horizontal separator
- [x] Search box positioning and styling
- [x] Right-side action controls (language, theme toggle, notifications, user menu)

---

## 🎯 **READY FOR PHASE 2**

### **Current System Status:**
- ✅ **Authentication**: Fully functional (OAuth + email/password)
- ✅ **Database**: Integrated with existing project
- ✅ **UI Foundation**: Branded, responsive design
- ✅ **User Management**: Profile creation and role assignment
- ✅ **Development Environment**: Stable and optimized

---

## Current Sprint Focus (Phase 2 - Core Features)

**Sprint 2 (Next):**
1. **Main Dashboard Implementation**
   - Three-column layout structure
   - Navigation sidebar
   - User role-based dashboard content
   - Stats cards and metrics

2. **Sample Management Foundation**
   - Sample intake forms
   - Quality specification assignment
   - Basic tracking interface

3. **Quality Assessment Setup**
   - Green bean analysis forms
   - Basic cupping interface
   - Assessment workflow

**Sprint 3:**
1. Finance dashboards (Santos HQ)
2. Lab storage management
3. Quality specifications system
4. Permission controls

---

## 📊 **Development Progress Summary**

- **Total Tasks Planned**: ~500 items
- **Phase 1 Completed**: 25+ critical authentication & foundation tasks ✅
- **Current Completion**: ~15% of total project
- **Ready for**: Phase 2 core feature development
- **Next Priority**: Dashboard interface and sample management

---

## Notes

- Domain: qc.wolthers.com
- Primary development environment: Next.js 14+ with TypeScript
- Database: Supabase (existing infrastructure)
- Authentication: Supabase Auth with Microsoft OAuth
- Deployment: Vercel
- No mock data - use real database from start
- No emojis in UI
- Santos HQ has special global finance access
- Global Admin can grant global permissions to any user