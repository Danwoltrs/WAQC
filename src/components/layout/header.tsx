'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Search, Moon, Sun, Bell, Menu, X, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useTheme } from '@/components/providers/theme-provider'
import { useAuth } from '@/components/providers/auth-provider'

interface HeaderProps {
  onMenuToggle?: () => void
  isMenuOpen?: boolean
}

export function Header({ onMenuToggle, isMenuOpen }: HeaderProps) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const { user, profile, signOut } = useAuth()
  const [currentLanguage, setCurrentLanguage] = useState('EN')

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }

  const handleLanguageChange = (language: string) => {
    setCurrentLanguage(language)
    // TODO: Implement actual language switching logic
    console.log(`Language changed to: ${language}`)
  }

  const getInitials = (name?: string) => {
    if (!name) return 'U'
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <header className="border-b border-border bg-green-800 dark:bg-[#08231B] backdrop-blur supports-[backdrop-filter]:bg-green-800/95 dark:supports-[backdrop-filter]:bg-[#08231B]/95">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center">
          {/* Mobile menu toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="mr-4 lg:hidden text-white dark:text-white hover:bg-green-700 dark:hover:bg-neutral-700"
            onClick={onMenuToggle}
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>

          {/* Logo and Search together */}
          <div className="flex items-center space-x-6">
            <Link href="/" className="flex items-center space-x-4 hover:opacity-80 transition-opacity cursor-pointer">
              <img
                src="/images/logos/wolthers-logo-off-white.svg"
                alt="Wolthers Logo"
                className="h-8 w-auto"
              />
              {/* Horizontal separator */}
              <div className="h-6 w-px bg-white/30 dark:bg-white/30"></div>
              {/* QC Text */}
              <span className="text-2xl font-bold text-white dark:text-white">QC</span>
            </Link>
            
            {/* Search - Right next to logo section */}
            <div className="w-96">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/60 dark:text-white/60" />
                <Input
                  placeholder="Search samples, clients, suppliers..."
                  className="pl-10 bg-green-900/50 dark:bg-neutral-800/70 border-green-700 dark:border-neutral-600 rounded-2xl text-white dark:text-white placeholder:text-white/60 dark:placeholder:text-white/60 focus:border-green-600 dark:focus:border-neutral-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right side actions */}
        <div className="flex items-center space-x-2">
          {/* Language selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-3 rounded-full text-white dark:text-white hover:bg-green-700 dark:hover:bg-neutral-700 flex items-center gap-2"
              >
                <Globe className="h-4 w-4" />
                <span className="text-sm font-medium">{currentLanguage}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[100px]">
              <DropdownMenuItem 
                onClick={() => handleLanguageChange('EN')}
                className={currentLanguage === 'EN' ? 'bg-accent' : ''}
              >
                English (EN)
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleLanguageChange('PT')}
                className={currentLanguage === 'PT' ? 'bg-accent' : ''}
              >
                Português (PT)
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleLanguageChange('ES')}
                className={currentLanguage === 'ES' ? 'bg-accent' : ''}
              >
                Español (ES)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Separator */}
          <div className="h-4 w-px bg-white/30 dark:bg-white/30"></div>

          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            className="h-9 w-9 rounded-full text-white dark:text-white hover:bg-green-700 dark:hover:bg-neutral-700"
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>

          {/* Notifications */}
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 rounded-full relative text-white dark:text-white hover:bg-green-700 dark:hover:bg-neutral-700"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full text-xs"></span>
          </Button>

          {/* User menu */}
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full hover:bg-green-700 dark:hover:bg-neutral-700">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={user.user_metadata?.avatar_url} alt={profile?.full_name || user.email || ''} />
                    <AvatarFallback className="bg-green-600 dark:bg-neutral-600 text-white">{getInitials(profile?.full_name || user.email)}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <div className="flex flex-col space-y-1 p-2">
                  <p className="text-sm font-medium leading-none">{profile?.full_name || 'User'}</p>
                  <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                  {profile?.qc_role && (
                    <p className="text-xs leading-none text-muted-foreground capitalize">
                      {profile.qc_role.replace(/_/g, ' ')}
                    </p>
                  )}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Profile Settings</DropdownMenuItem>
                <DropdownMenuItem>Preferences</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()}>
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  )
}