'use client'

import { MainLayout } from '@/components/layout/main-layout'
import { AccessRequestsManager } from '@/components/admin/access-requests-manager'
import { UserManagementPanel } from '@/components/admin/user-management-panel'
import { InvitationsManager } from '@/components/admin/invitations-manager'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function UsersPage() {
  return (
    <MainLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">User Management</h1>
          <p className="text-muted-foreground">Manage users, roles, permissions, invitations, and access requests</p>
        </div>

        <Tabs defaultValue="users" className="space-y-4">
          <TabsList>
            <TabsTrigger value="users">Active Users</TabsTrigger>
            <TabsTrigger value="invitations">Invitations</TabsTrigger>
            <TabsTrigger value="requests">Access Requests</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-4">
            <UserManagementPanel />
          </TabsContent>

          <TabsContent value="invitations" className="space-y-4">
            <InvitationsManager />
          </TabsContent>

          <TabsContent value="requests" className="space-y-4">
            <AccessRequestsManager />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  )
}
