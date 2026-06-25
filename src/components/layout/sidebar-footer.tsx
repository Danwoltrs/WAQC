'use client'

import { useState } from 'react'
import { Moon, Sun, Bell, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme } from '@/components/providers/theme-provider'
import { useAuth } from '@/components/providers/auth-provider'
import { cn } from '@/lib/utils'

interface SidebarFooterProps {
  isExpanded: boolean
  unreadNotifications: number
  onNotificationsToggle: () => void
}

function getInitials(name?: string) {
  if (!name) return 'U'
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

export function SidebarFooter({ isExpanded, unreadNotifications, onNotificationsToggle }: SidebarFooterProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const { user, profile, signOut } = useAuth()
  const [currentLanguage, setCurrentLanguage] = useState('EN')

  const toggleTheme = () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  const handleLanguageChange = (language: string) => {
    setCurrentLanguage(language)
    // TODO: wire real i18n (out of scope — relocated from the old header as-is)
  }

  const menuSide = isExpanded ? 'top' : 'right'

  return (
    <div
      className={cn(
        'border-t border-border p-1 flex gap-1',
        isExpanded ? 'flex-row items-center justify-between px-2' : 'flex-col items-center'
      )}
    >
      {/* Language */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-9 px-2 rounded-full text-muted-foreground hover:text-foreground flex items-center gap-1.5" aria-label="Language">
            <Globe className="h-4 w-4" />
            {isExpanded && <span className="text-xs font-medium">{currentLanguage}</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side={menuSide} align="start" className="min-w-[120px]">
          <DropdownMenuItem onClick={() => handleLanguageChange('EN')} className={currentLanguage === 'EN' ? 'bg-accent' : ''}>English (EN)</DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleLanguageChange('PT')} className={currentLanguage === 'PT' ? 'bg-accent' : ''}>Português (PT)</DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleLanguageChange('ES')} className={currentLanguage === 'ES' ? 'bg-accent' : ''}>Español (ES)</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Theme */}
      <Button variant="ghost" size="sm" onClick={toggleTheme} aria-label="Toggle theme" className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground">
        {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>

      {/* Notifications */}
      <Button variant="ghost" size="sm" onClick={onNotificationsToggle} aria-label="Notifications" className="h-9 w-9 rounded-full relative text-muted-foreground hover:text-foreground">
        <Bell className="h-4 w-4" />
        {unreadNotifications > 0 && (
          <span className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 bg-red-500 rounded-full text-[10px] font-semibold text-white flex items-center justify-center">
            {unreadNotifications > 99 ? '99+' : unreadNotifications}
          </span>
        )}
      </Button>

      {/* User */}
      {user && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0" aria-label="User menu">
              <Avatar className="h-9 w-9">
                <AvatarImage src={user.user_metadata?.avatar_url} alt={profile?.full_name || user.email || ''} />
                <AvatarFallback className="bg-green-600 dark:bg-neutral-600 text-white">{getInitials(profile?.full_name || user.email)}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={menuSide} align="end" className="w-56" forceMount>
            <div className="flex flex-col space-y-1 p-2">
              <p className="text-sm font-medium leading-none">{profile?.full_name || 'User'}</p>
              <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
              {profile?.qc_role && (
                <p className="text-xs leading-none text-muted-foreground capitalize">{profile.qc_role.replace(/_/g, ' ')}</p>
              )}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profile Settings</DropdownMenuItem>
            <DropdownMenuItem>Preferences</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()}>Sign Out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
