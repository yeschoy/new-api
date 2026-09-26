/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useEffect } from 'react'
import {
  Navigate,
  Outlet,
  createBrowserRouter,
  useLocation,
  type RouteObject,
} from 'react-router'

import { tk } from './i18n/i18n'
import { SignInPage } from './pages/auth/sign-in-page'
import { SignUpPage } from './pages/auth/sign-up-page'
import { ChatPage } from './pages/chat/chat-page'
import { ActivityPage } from './pages/console/activity-page'
import { CreditsPage } from './pages/console/credits-page'
import { KeysPage } from './pages/console/keys-page'
import { ProfilePage } from './pages/console/profile-page'
import { ContentPage } from './pages/content-page'
import { NotFoundPage } from './pages/not-found'
import { SetupPage } from './pages/setup-page'
import { RouterHome } from './sites/router/home/router-home'
import { RouterModelPage } from './sites/router/models/router-model-page'
import { RouterRankingsPage } from './sites/router/rankings/router-rankings-page'

function RootLayout() {
  const location = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return <Outlet />
}

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <RouterHome /> },
      { path: '/models/:name', element: <RouterModelPage /> },
      { path: '/pricing', element: <Navigate to='/settings/credits' replace /> },
      { path: '/rankings', element: <RouterRankingsPage /> },
      { path: '/chat', element: <ChatPage /> },
      { path: '/playground', element: <Navigate to='/chat' replace /> },
      { path: '/sign-in', element: <SignInPage /> },
      { path: '/login', element: <Navigate to='/sign-in' replace /> },
      { path: '/sign-up', element: <SignUpPage /> },
      { path: '/register', element: <Navigate to='/sign-up' replace /> },
      { path: '/settings/keys', element: <KeysPage /> },
      { path: '/keys', element: <Navigate to='/settings/keys' replace /> },
      { path: '/settings/credits', element: <CreditsPage /> },
      { path: '/wallet', element: <Navigate to='/settings/credits' replace /> },
      { path: '/activity', element: <ActivityPage /> },
      { path: '/usage-logs', element: <Navigate to='/activity' replace /> },
      { path: '/settings/profile', element: <ProfilePage /> },
      { path: '/settings', element: <Navigate to='/settings/keys' replace /> },
      { path: '/dashboard', element: <Navigate to='/settings/keys' replace /> },
      { path: '/about', element: <ContentPage source='/api/about' title={tk('关于')} /> },
      { path: '/user-agreement', element: <ContentPage source='/api/user-agreement' title={tk('用户协议')} /> },
      { path: '/privacy-policy', element: <ContentPage source='/api/privacy-policy' title={tk('隐私政策')} /> },
      { path: '/setup', element: <SetupPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
