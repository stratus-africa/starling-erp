# Remix of NimbusERP

Build a modern, enterprise-grade, cloud-based Multi-Tenant SaaS ERP Platform similar to Zoho One, Zoho Books, Zoho Inventory, SAP Business One, Microsoft Business Central and Odoo.

Tech Stack

- React + TypeScript

- TailwindCSS

- shadcn/ui

- Supabase

- PostgreSQL

- Row Level Security (RLS)

- React Router

- TanStack Query

- Responsive Design

- Dark & Light Mode

====================================================================

SYSTEM ARCHITECTURE

====================================================================

The ERP must be fully Multi-Tenant.

There are two platform levels:

1. Super Admin

2. Tenant

Every tenant must have completely isolated data using Row Level Security.

Every business record must include:

- tenant_id

- created_by

- updated_by

- created_at

- updated_at

- deleted_at (Soft Delete)

Use UUIDs as primary keys.

Implement Role-Based Access Control (RBAC).

====================================================================

SUPER ADMIN

====================================================================

The Super Admin manages the SaaS platform.

Dashboard

Show

- Total Tenants

- Active Tenants

- Trial Tenants

- Expired Subscriptions

- Monthly Revenue

- Total Users

- Active Sessions

Manage

- Tenants

- Subscription Plans

- Users

- Audit Logs

- System Settings

- Notifications

- Backups

Tenant Management

CRUD

- Company

- Company Logo

- Country

- Currency

- Financial Year

- Time Zone

- Industry

Actions

- Activate

- Suspend

- Delete

- Reset Password

- View Usage

====================================================================

TENANT USERS

====================================================================

Roles

- Tenant Admin

- Sales Manager

- Sales Executive

- Procurement Manager

- Logistics Manager

- Production Manager

- Finance Manager

- Accountant

- Warehouse Manager

- Storekeeper

- Viewer

Allow custom roles and permissions.

Permissions

- Create

- Read

- Update

- Delete

- Approve

- Void

- Export

- Print

====================================================================

BUSINESS MODULES

====================================================================

1. CRM / Customers

Customers

CRUD

Store

- Customer Code

- Customer Name

- Company

- Phone

- Email

- PIN

- VAT Number

- Credit Limit

- Payment Terms

- Currency

- Billing Address

- Shipping Address

- Contacts

- Notes

- Attachments

====================================================================

SALES

====================================================================

Modules

- Customers

- Quotes

- Sales Orders

- Packages

- Shipments

- Invoices

- Payments Received

- Credit Notes

Quotes

CRUD

Status

- Draft

- Sent

- Accepted

- Rejected

- Expired

Quote can be converted into

- Sales Order

OR

- Invoice

Sales Orders

CRUD

Status

- Draft

- Confirmed

- Processing

- Packed

- Shipped

- Delivered

- Closed

Sales Order can generate

- Invoice

- Production Order

- Package

Packages

Generate packages from Sales Orders.

Support

- Multiple Packages

- Package Weight

- Dimensions

- Tracking Number

Shipments

Shipments are created from Packages.

Support

Multiple Packages

↓

One Shipment

Shipment fields

- Shipment Number

- Transporter

- Driver

- Vehicle

- Route

- Dispatch Date

- Delivery Date

- Status

- Notes

Invoices

CRUD

Support

- Taxes

- Discounts

- Multiple Payments

- Partial Payments

- PDF Generation

Payments Received

CRUD

Support

- Cash

- Bank

- Cheque

- Mobile Money

Credit Notes

CRUD

Apply against invoices.

Automatically update customer balance.

====================================================================

PURCHASING

====================================================================

Modules

- Suppliers

- Requisitions

- Purchase Orders

- Bills

- Expenses

- Supplier Credits

- Payments Made

Requisitions

Workflow

Draft

↓

Submitted

↓

Approved

↓

Purchase Order

Purchase Orders

CRUD

Convert to Bills.

Bills

CRUD

Supplier Credits

CRUD

Payments Made

CRUD

====================================================================

INVENTORY

====================================================================

Modules

- Items

- Warehouses

- Inventory Adjustments

- Stock Transfers

Items

Support

- Raw Materials

- Finished Goods

- Services

- Assemblies

Track

- SKU

- Barcode

- Batch Number

- Serial Number

- Reorder Level

Warehouses

Multiple Warehouses

Inventory Adjustment

Support

- Opening Balance

- Damage

- Stock Count

- Expired

- Loss

Stock Transfers

Warehouse to Warehouse

Inventory Ledger

FIFO

Weighted Average

====================================================================

MANUFACTURING

====================================================================

Modules

- Production Items

- Bill of Materials

- Production Orders

- Production Runs

Production Items

Finished Goods

Bill of Materials

Multiple Components

Labour Cost

Machine Cost

Overheads

Production Orders

Can be generated from Sales Orders.

Workflow

Confirmed Sales Order

↓

Production Order

↓

Production Run

↓

Finished Goods

Production

Automatically

Consume Raw Materials

Increase Finished Goods Inventory

Generate Accounting Entries

====================================================================

ACCOUNTING

====================================================================

Double Entry Accounting

Every transaction automatically posts Journal Entries.

Modules

- Chart of Accounts

- Banking

- Manual Journals

- Bank Reconciliation

Chart of Accounts

CRUD

Account Types

- Assets

- Liabilities

- Equity

- Income

- Expenses

- Cost of Sales

Banking

Support

- Deposits

- Withdrawals

- Transfers

Bank Reconciliation

Import Bank Statements

Automatically Match Transactions

Manual Journals

CRUD

Recurring Journals

Financial Years

Fiscal Period Locking

====================================================================

REPORTS

====================================================================

Sales Reports

Purchase Reports

Inventory Reports

Manufacturing Reports

Financial Reports

Include

- Trial Balance

- General Ledger

- Profit & Loss

- Balance Sheet

- Cash Flow

- Inventory Valuation

- Stock Movement

- Customer Statements

- Supplier Statements

- Production Cost Report

Export

- PDF

- Excel

- CSV

====================================================================

BUSINESS WORKFLOW

====================================================================

Sales Workflow

Quote

↓

Sales Order

↓

(Optional)

Production Order

↓

Production Run

↓

Package

↓

Shipment

↓

Invoice

↓

Payment

Purchasing Workflow

Requisition

↓

Purchase Order

↓

Bill

↓

Payment

Manufacturing Workflow

Production Order

↓

Production Run

↓

Finished Goods

↓

Inventory

↓

Accounting

All workflows must automatically update inventory and generate accounting entries.

====================================================================

DEPARTMENT DASHBOARDS

====================================================================

Each user sees a dashboard based on their role.

Logistics Manager Dashboard

Display

- Confirmed Sales Orders

- Packages Awaiting Shipment

- Packages Packed Today

- Shipments In Transit

- Delivered Shipments

Charts

- Shipment Status

- Delivery Performance

- Packages by Warehouse

Quick Actions

- Create Package

- Create Shipment

- Print Packing List

- Print Delivery Note

------------------------------------------------

Production Manager Dashboard

Display

- Confirmed Sales Orders Awaiting Production

- Production Orders

- Active Production Runs

- Completed Production Runs

- Raw Material Shortages

Charts

- Production Capacity

- Production Progress

- Material Consumption

Quick Actions

- Create Production Order

- Start Production Run

- Complete Production

------------------------------------------------

Procurement Manager Dashboard

Display

- Pending Requisitions

- Approved Requisitions

- Open Purchase Orders

- Supplier Deliveries

- Raw Material Inventory Status

- Low Stock Raw Materials

Charts

- Purchasing Trend

- Supplier Performance

- Raw Material Consumption

Quick Actions

- Create Requisition

- Create Purchase Order

- Approve Purchase Orders

------------------------------------------------

Sales Manager Dashboard

Display

- Quotes

- Sales Orders

- Invoices

- Collections

- Sales Revenue

- Outstanding Receivables

Charts

- Sales Trend

- Monthly Revenue

- Quote Conversion Rate

- Top Customers

- Top Selling Products

Quick Actions

- Create Quote

- Convert Quote

- Create Invoice

- Record Payment

====================================================================

SETTINGS

====================================================================

Company Profile

Taxes

Currencies

Warehouses

Units of Measure

Approval Workflows

Payment Terms

Document Numbering

Email Templates

Notifications

User Management

Roles

Permissions

API Keys

====================================================================

GLOBAL FEATURES

====================================================================

Implement

- Global Search

- Audit Trail

- Activity Timeline

- Soft Delete

- Restore Deleted Records

- File Attachments

- Notes

- Comments

- Tags

- Bulk Import

- Bulk Export

- PDF Printing

- Email Documents

- Dashboard Widgets

- Saved Filters

- Advanced Search

- Approval Workflows

- Notification Center

====================================================================

UI REQUIREMENTS

====================================================================

Design the application to look like a premium ERP system.

Include

- Left collapsible sidebar

- Top navigation

- Global search

- Notifications

- User profile menu

- Breadcrumbs

- Professional dashboards

- Modern data tables

- Filters

- Sorting

- Pagination

- Charts

- Responsive layouts

- Clean forms

- Loading states

- Empty states

- Confirmation dialogs

Use a consistent enterprise UI inspired by Zoho Books, Zoho Inventory, SAP Business One, and Microsoft Business Central.

The architecture must be modular so future modules such as CRM, POS, HR, Payroll, Projects, Assets, Fleet, Maintenance, Helpdesk, Customer Portal, Vendor Portal, and Mobile Apps can be added without changing the existing codebase.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://starling-erp.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f897cc37-557c-4c4d-bb81-7bf8b0cc56ee).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
