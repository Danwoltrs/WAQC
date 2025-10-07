# **Wolthers Coffee Quality Control System \- Development Instructions**

## **Project Overview**

This document provides instructions for developing a comprehensive coffee quality control system. The system will consist of a web application and a native iPad application for Wolthers' global laboratory network. It aims to digitize and streamline all coffee quality control processes, offering real-time quality assessment, collaborative cupping sessions, dynamic client dashboards, and automated certification.

The primary goal is to build a robust, intuitive, and aesthetically pleasing application based on the detailed specifications and design guidelines provided herein.

### **Key Components**

* **Web Application**: A modern, responsive web app for desktop/tablet use, built with Next.js.  
* **iPad Application**: A native iOS app (Swift/SwiftUI) with full offline functionality and OCR processing.  
* **Database**: Utilizes an existing Supabase infrastructure, integrating with data from trips.wolthers.com.  
* **Multi-lab Network**: Must support the Santos HQ, Buenaventura, Guatemala City, and Peru labs, with the ability to scale to more locations.

## **Technology Stack**

### **Frontend (Web App)**

* **Framework**: Next.js 14+ with TypeScript  
* **Styling**: Tailwind CSS  
* **UI Components**: Shadcn/ui for the component library (e.g., Buttons, Cards, Dialogs, Inputs).  
* **Charts/Visualizations**: Recharts for creating the dashboard graphs and charts (including line, bar, donut, and Sankey charts).  
* **State Management**: Zustand or React Query.  
* **Real-time**: Supabase Realtime subscriptions.

### **Backend & Database**

* **Platform**: Supabase (utilizing the existing infrastructure).  
* **Authentication**: Supabase Auth (Email/Password and Microsoft OAuth).  
* **File Storage**: Supabase Storage for documents and images.  
* **Serverless Logic**: Supabase Edge Functions.

### **Mobile (iPad)**

* **Platform**: Native iOS using Swift/SwiftUI.

## **UI/UX and Design Guidelines**

**The visual design of the web application MUST closely follow the aesthetics of the provided Figma layout.** The goal is to create a clean, modern, and professional lab dashboard that is both beautiful and highly functional. Refer to the provided CSS files for specific styling attributes like colors, fonts, and spacing.

### **1\. Overall Layout & Theming**

* **Structure**: Implement a three-column layout:  
  * **Left Sidebar**: Collapsible navigation menu.  
  * **Main Content Area**: The central dashboard for charts, tables, and forms.  
  * **Right Sidebar**: A fixed sidebar for notifications, activities, and quick contacts.  
* **Theme**: The application must support both **Light Mode** and **Dark Mode**. A theme toggle should be present in the main header.  
* **Spacing**: Use a generous and consistent spacing system (e.g., multiples of 4px or 8px) as seen in the design to create a clean, uncluttered interface.  
* **Borders**: Use subtle borders (0.5px solid) to separate layout sections as shown in the design files.

### **2\. Color Palette**

* **Dark Mode**:  
  * **Background**: \#2A2A2A  
  * **Card/Block Background**: rgba(255, 255, 255, 0.04)  
  * **Primary Text**: \#FFFFFF  
  * **Secondary/Muted Text**: rgba(255, 255, 255, 0.4)  
  * **Borders**: rgba(255, 255, 255, 0.15)  
* **Light Mode**:  
  * **Background**: \#FFFFFF  
  * **Card/Block Background**: \#F9F9FA  
  * **Primary Text**: \#000000  
  * **Secondary/Muted Text**: rgba(0, 0, 0, 0.4)  
  * **Borders**: rgba(0, 0, 0, 0.1)  
* **Accent & Chart Colors**: Use the following palette for charts, graphs, and status indicators: \#ADADFB, \#A0BCE8, \#6BE6D3, \#7DBBFF, \#B899EB, \#71DD8C.

### **3\. Typography**

* **Font Family**: Use the **'Inter'** font throughout the application.  
* **Font Sizes & Weights**:  
  * **Page Titles/Headers**: font-size: 14px, font-weight: 600\.  
  * **Card Titles**: font-size: 14px, font-weight: 600\.  
  * **Large Metric Numbers**: font-size: 24px, font-weight: 600\.  
  * **Body/Paragraph Text**: font-size: 14px, font-weight: 400\.  
  * **Labels/Small Text**: font-size: 12px, font-weight: 400\.

### **4\. Component Styling**

* **Cards & Blocks**: All data containers, charts, and info boxes should be styled as cards.  
  * border-radius: 20px  
  * padding: 24px  
  * Subtle background color to distinguish from the main background.  
* **Charts (Recharts)**:  
  * Replicate the line, bar, and donut charts from the Figma design.  
  * The design is minimalist. Use minimal grid lines and clear, legible labels.  
  * Line charts should have smooth curves and optional gradient fills underneath.  
  * Bar charts should have rounded tops (border-radius: 8px).  
* **Navigation (Sidebars)**:  
  * **Left Sidebar**: Navigation items should consist of an icon and a text label. The active item should have a highlighted background (rgba(255, 255, 255, 0.1) in dark mode, rgba(0, 0, 0, 0.04) in light mode) with border-radius: 12px.  
  * **Right Sidebar**: Use lists to display notifications and activities. Each item should have an icon/avatar and text content, similar to the Figma layout.  
* **Header**:  
  * The header should be separated by a bottom border.  
  * Include breadcrumbs for navigation.  
  * The search bar should be styled with a rounded shape (border-radius: 16px) and contain a search icon.  
  * Action buttons (theme toggle, notifications) should be icon-only buttons with a circular or rounded shape.

## **Key Features Implementation**

### **User Management & Authentication**

* Role-based access control (Lab Personnel, Clients, Suppliers, Buyers).  
* Multi-lab access permissions.  
* Microsoft OAuth and Email/Password authentication.  
* Session management with automatic timeout.

### **Sample Management**

* Manual entry forms with client auto-detection.  
* OCR processing for sample sleeve labels (95%+ accuracy requirement).  
* Quality specification auto-assignment.  
* Sample tracking number generation.  
* Storage management system with 1,764+ positions.

### **Quality Assessment Pipeline**

* Green bean analysis (defect classification, screen size, physical properties).  
* Roast analysis with quaker counting.  
* Multi-method cupping interface:  
  * Digital cupping (iPad optimized circular navigation).  
  * iPhone hierarchical dropdown navigation.  
  * Handwritten cards with QR code integration.  
  * SCA Q Grading compatibility.

### **Real-time Cupping Sessions**

* Multi-cupper collaboration (minimum 2 cuppers).  
* Live score synchronization with privacy toggles.  
* Discrepancy detection and flagging.  
* Touch-optimized interfaces for tablets.

### **Dashboard Systems**

* Client dashboards (sample tracking, certificates, analytics).  
* Supplier dashboards (performance metrics, competitive analysis).  
* Laboratory dashboards (workflow management, productivity, Sankey charts to visualize the flow of coffee from Exporter to Importer and then to the Roaster.).  
* Finance dashboards (invoicing, revenue tracking). This must include a view showing a per-lab breakdown of total samples, approvals, and rejections.  
* Administrative dashboards (multi-lab coordination).  
* **Final Buyer Dashboards**: To provide supply chain visibility. This must include Sankey charts to visualize the flow of coffee from Exporter to Importer and then to the Roaster.

### **Certificate Generation**

* Automated PDF generation with complete traceability.  
* Multi-format export (PDF, Excel).  
* Email delivery with tracking.  
* API integration capabilities.  
* Digital signatures and authentication codes.

## **Database Schema Considerations**

### **Core Tables**

* samples \- Sample information and tracking  
* quality\_assessments \- Green bean and roast analysis data  
* cupping\_sessions \- Cupping session management  
* cupping\_scores \- Individual cupper scores and notes  
* quality\_specifications \- Client specification requirements  
* certificates \- Generated certificate records  
* users \- User management with role assignments  
* clients \- Client information and settings  
* laboratories \- Lab configuration and settings

### **Integration Points**

* Connect to existing trips.wolthers.com supplier database.  
* Maintain data relationships with legacy systems.  
* Row-level security implementation.  
* Real-time subscriptions for live updates.

## **Security & Compliance**

* AES-256 encryption for data at rest and TLS 1.3 for data in transit.  
* Role-based permissions with the principle of least privilege.  
* Complete audit trail for all system actions.  
* GDPR compliance with data privacy controls.  
* 99.5% uptime requirement with sub-5 second response times.

## **Development Priorities**

### **Phase 1: Foundation (MVP)**

1. User authentication and role management with both Microsoft OAuth and e-mail \+ password.  
2. Sample intake (manual entry first).  
3. Basic quality assessment workflow.  
4. Simple certificate generation.  
5. Client dashboard (basic).  
6. Do not use Mock data.  
7. Do not use any emojis in the UI.

### **Phase 2: Core Features**

* Advanced quality assessment tools.  
* Real-time cupping collaboration.  
* Client specification management.  
* Implementation of all dashboards.

### **Phase 3: Advanced Features**

* OCR integration and optimization.  
* Calibration session management.  
* iPad application development.  
* Advanced analytics and reporting.

## **Testing Strategy**

* Unit tests for all utility functions and components.  
* Integration tests for API endpoints and database operations.  
* E2E tests for critical user flows (sample intake → assessment → certificate).  
* OCR accuracy testing with real sample sleeve images.  
* Load testing for real-time cupping sessions.  
* Cross-browser compatibility testing.

## Task Master AI Instructions
**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md
