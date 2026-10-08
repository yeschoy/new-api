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
  Outlet,
  createBrowserRouter,
  useLocation,
  type RouteObject,
} from 'react-router'

import { Moved } from './components/moved'
import { Toaster } from './components/ui'
import { tk } from './i18n/i18n'
import { useBrandTab } from './lib/queries'
import { SignInPage } from './pages/auth/sign-in-page'
import { SignUpPage } from './pages/auth/sign-up-page'
import { ContentPage } from './pages/content-page'
import { NotFoundPage } from './pages/not-found'
import { RouterHome } from './sites/router/home/router-home'

function RootLayout() {
  const location = useLocation()
  useBrandTab()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <>
      <Outlet />
      <Toaster />
    </>
  )
}

/** A page whose code loads only when someone opens it, so the home page stays small. */
function onDemand<M>(load: () => Promise<M>, pick: (module: M) => React.ComponentType): Pick<RouteObject, 'lazy'> {
  return { lazy: async () => ({ Component: pick(await load()) }) }
}

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    HydrateFallback: () => null,
    children: [
      { path: '/', element: <RouterHome /> },
      { path: '/models/:name', ...onDemand(() => import('./sites/router/models/router-model-page'), (m) => m.RouterModelPage) },
      { path: '/pricing', element: <Moved to='/settings/credits' /> },
      { path: '/rankings', ...onDemand(() => import('./sites/router/rankings/router-rankings-page'), (m) => m.RouterRankingsPage) },
      { path: '/chat', ...onDemand(() => import('./pages/chat/chat-page'), (m) => m.ChatPage) },
      { path: '/playground', element: <Moved to='/chat' /> },
      { path: '/sign-in', element: <SignInPage /> },
      { path: '/login', element: <Moved to='/sign-in' /> },
      { path: '/sign-up', element: <SignUpPage /> },
      { path: '/register', element: <Moved to='/sign-up' /> },
      { path: '/settings/keys', ...onDemand(() => import('./pages/console/keys-page'), (m) => m.KeysPage) },
      { path: '/keys', element: <Moved to='/settings/keys' /> },
      { path: '/settings/credits', ...onDemand(() => import('./pages/console/credits-page'), (m) => m.CreditsPage) },
      { path: '/wallet', element: <Moved to='/settings/credits' /> },
      { path: '/activity', ...onDemand(() => import('./pages/console/activity-page'), (m) => m.ActivityPage) },
      { path: '/usage-logs', element: <Moved to='/activity' /> },
      { path: '/settings/profile', ...onDemand(() => import('./pages/console/profile-page'), (m) => m.ProfilePage) },
      { path: '/settings', element: <Moved to='/settings/keys' /> },
      { path: '/dashboard', ...onDemand(() => import('./pages/dashboard/overview-page'), (m) => m.OverviewPage) },
      { path: '/dashboard/overview', element: <Moved to='/dashboard' /> },
      { path: '/dashboard/usage', ...onDemand(() => import('./pages/dashboard/usage-page'), (m) => m.UsagePage) },
      { path: '/dashboard/models', element: <Moved to='/dashboard/usage' /> },
      { path: '/dashboard/flow', ...onDemand(() => import('./pages/dashboard/flow-page'), (m) => m.FlowPage) },
      { path: '/activity/tasks', ...onDemand(() => import('./pages/logs/tasks-page'), (m) => m.TasksPage) },
      { path: '/activity/drawing', ...onDemand(() => import('./pages/logs/drawing-page'), (m) => m.DrawingPage) },
      { path: '/usage-logs/common', element: <Moved to='/activity' /> },
      { path: '/usage-logs/task', element: <Moved to='/activity/tasks' /> },
      { path: '/usage-logs/drawing', element: <Moved to='/activity/drawing' /> },
      { path: '/settings/security', ...onDemand(() => import('./pages/account/security-page'), (m) => m.SecurityPage) },
      { path: '/profile', element: <Moved to='/settings/profile' /> },
      { path: '/admin/channels', ...onDemand(() => import('./pages/admin/channels/channels-page'), (m) => m.ChannelsPage) },
      { path: '/channels', element: <Moved to='/admin/channels' /> },
      { path: '/admin/models', ...onDemand(() => import('./pages/admin/models/models-page'), (m) => m.AdminModelsPage) },
      { path: '/models/metadata', element: <Moved to='/admin/models' /> },
      { path: '/models/deployments', element: <Moved to='/admin/models' /> },
      { path: '/admin/users', ...onDemand(() => import('./pages/admin/users/users-page'), (m) => m.UsersPage) },
      { path: '/users', element: <Moved to='/admin/users' /> },
      { path: '/admin/redemption-codes', ...onDemand(() => import('./pages/admin/redemptions/redemptions-page'), (m) => m.RedemptionsPage) },
      { path: '/redemption-codes', element: <Moved to='/admin/redemption-codes' /> },
      { path: '/admin/subscriptions', ...onDemand(() => import('./pages/admin/subscriptions/subscriptions-page'), (m) => m.SubscriptionsPage) },
      { path: '/subscriptions', element: <Moved to='/admin/subscriptions' /> },
      { path: '/admin/settings', ...onDemand(() => import('./pages/admin/settings/settings-page'), (m) => m.SystemSettingsPage) },
      { path: '/admin/settings/:section', ...onDemand(() => import('./pages/admin/settings/settings-page'), (m) => m.SystemSettingsPage) },
      { path: '/system-settings/*', element: <Moved to='/admin/settings' /> },
      { path: '/admin/system-info', ...onDemand(() => import('./pages/admin/system-info/system-info-page'), (m) => m.SystemInfoPage) },
      { path: '/system-info', element: <Moved to='/admin/system-info' /> },
      { path: '/admin/task-plugins', ...onDemand(() => import('./pages/admin/task-plugins/task-plugins-page'), (m) => m.TaskPluginsPage) },
      { path: '/task-plugins', element: <Moved to='/admin/task-plugins' /> },
      { path: '/forgot-password', ...onDemand(() => import('./pages/auth/forgot-password-page'), (m) => m.ForgotPasswordPage) },
      { path: '/user/reset', ...onDemand(() => import('./pages/auth/reset-password-page'), (m) => m.ResetPasswordPage) },
      { path: '/reset', ...onDemand(() => import('./pages/auth/reset-password-page'), (m) => m.ResetPasswordPage) },
      { path: '/oauth/:provider', ...onDemand(() => import('./pages/auth/oauth-callback-page'), (m) => m.OAuthCallbackPage) },
      { path: '/client', ...onDemand(() => import('./pages/client/client-page'), (m) => m.ClientPage) },
      { path: '/desktop-authorize', ...onDemand(() => import('./pages/client/desktop-authorize-page'), (m) => m.DesktopAuthorizePage) },
      { path: '/guide', ...onDemand(() => import('./pages/guide/guide-page'), (m) => m.GuidePage) },
      { path: '/guide/:slug', ...onDemand(() => import('./pages/guide/guide-page'), (m) => m.GuidePage) },
      { path: '/beginner-guide', ...onDemand(() => import('./pages/guide/beginner-guide-page'), (m) => m.BeginnerGuidePage) },
      { path: '/about', element: <ContentPage source='/api/about' title={tk('关于')} /> },
      { path: '/user-agreement', element: <ContentPage source='/api/user-agreement' title={tk('用户协议')} /> },
      { path: '/privacy-policy', element: <ContentPage source='/api/privacy-policy' title={tk('隐私政策')} /> },
      { path: '/setup', ...onDemand(() => import('./pages/setup-page'), (m) => m.SetupPage) },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
