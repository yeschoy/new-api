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
import { tk } from './i18n/i18n'
import { useBrandTab } from './lib/queries'
import { SecurityPage } from './pages/account/security-page'
import { ChannelsPage } from './pages/admin/channels/channels-page'
import { AdminModelsPage } from './pages/admin/models/models-page'
import { RedemptionsPage } from './pages/admin/redemptions/redemptions-page'
import { SystemSettingsPage } from './pages/admin/settings/settings-page'
import { SubscriptionsPage } from './pages/admin/subscriptions/subscriptions-page'
import { SystemInfoPage } from './pages/admin/system-info/system-info-page'
import { TaskPluginsPage } from './pages/admin/task-plugins/task-plugins-page'
import { UsersPage } from './pages/admin/users/users-page'
import { ForgotPasswordPage } from './pages/auth/forgot-password-page'
import { OAuthCallbackPage } from './pages/auth/oauth-callback-page'
import { ResetPasswordPage } from './pages/auth/reset-password-page'
import { SignInPage } from './pages/auth/sign-in-page'
import { SignUpPage } from './pages/auth/sign-up-page'
import { ChatPage } from './pages/chat/chat-page'
import { ClientPage } from './pages/client/client-page'
import { DesktopAuthorizePage } from './pages/client/desktop-authorize-page'
import { ActivityPage } from './pages/console/activity-page'
import { CreditsPage } from './pages/console/credits-page'
import { KeysPage } from './pages/console/keys-page'
import { ProfilePage } from './pages/console/profile-page'
import { ContentPage } from './pages/content-page'
import { FlowPage } from './pages/dashboard/flow-page'
import { OverviewPage } from './pages/dashboard/overview-page'
import { UsagePage } from './pages/dashboard/usage-page'
import { BeginnerGuidePage } from './pages/guide/beginner-guide-page'
import { GuidePage } from './pages/guide/guide-page'
import { DrawingPage } from './pages/logs/drawing-page'
import { TasksPage } from './pages/logs/tasks-page'
import { NotFoundPage } from './pages/not-found'
import { SetupPage } from './pages/setup-page'
import { RouterHome } from './sites/router/home/router-home'
import { RouterModelPage } from './sites/router/models/router-model-page'
import { RouterRankingsPage } from './sites/router/rankings/router-rankings-page'

function RootLayout() {
  const location = useLocation()
  useBrandTab()

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
      { path: '/pricing', element: <Moved to='/settings/credits' /> },
      { path: '/rankings', element: <RouterRankingsPage /> },
      { path: '/chat', element: <ChatPage /> },
      { path: '/playground', element: <Moved to='/chat' /> },
      { path: '/sign-in', element: <SignInPage /> },
      { path: '/login', element: <Moved to='/sign-in' /> },
      { path: '/sign-up', element: <SignUpPage /> },
      { path: '/register', element: <Moved to='/sign-up' /> },
      { path: '/settings/keys', element: <KeysPage /> },
      { path: '/keys', element: <Moved to='/settings/keys' /> },
      { path: '/settings/credits', element: <CreditsPage /> },
      { path: '/wallet', element: <Moved to='/settings/credits' /> },
      { path: '/activity', element: <ActivityPage /> },
      { path: '/usage-logs', element: <Moved to='/activity' /> },
      { path: '/settings/profile', element: <ProfilePage /> },
      { path: '/settings', element: <Moved to='/settings/keys' /> },
      { path: '/dashboard', element: <OverviewPage /> },
      { path: '/dashboard/overview', element: <Moved to='/dashboard' /> },
      { path: '/dashboard/usage', element: <UsagePage /> },
      { path: '/dashboard/models', element: <Moved to='/dashboard/usage' /> },
      { path: '/dashboard/flow', element: <FlowPage /> },
      { path: '/activity/tasks', element: <TasksPage /> },
      { path: '/activity/drawing', element: <DrawingPage /> },
      { path: '/usage-logs/common', element: <Moved to='/activity' /> },
      { path: '/usage-logs/task', element: <Moved to='/activity/tasks' /> },
      { path: '/usage-logs/drawing', element: <Moved to='/activity/drawing' /> },
      { path: '/settings/security', element: <SecurityPage /> },
      { path: '/profile', element: <Moved to='/settings/profile' /> },
      { path: '/admin/channels', element: <ChannelsPage /> },
      { path: '/channels', element: <Moved to='/admin/channels' /> },
      { path: '/admin/models', element: <AdminModelsPage /> },
      { path: '/models/metadata', element: <Moved to='/admin/models' /> },
      { path: '/models/deployments', element: <Moved to='/admin/models' /> },
      { path: '/admin/users', element: <UsersPage /> },
      { path: '/users', element: <Moved to='/admin/users' /> },
      { path: '/admin/redemption-codes', element: <RedemptionsPage /> },
      { path: '/redemption-codes', element: <Moved to='/admin/redemption-codes' /> },
      { path: '/admin/subscriptions', element: <SubscriptionsPage /> },
      { path: '/subscriptions', element: <Moved to='/admin/subscriptions' /> },
      { path: '/admin/settings', element: <SystemSettingsPage /> },
      { path: '/admin/settings/:section', element: <SystemSettingsPage /> },
      { path: '/system-settings/*', element: <Moved to='/admin/settings' /> },
      { path: '/admin/system-info', element: <SystemInfoPage /> },
      { path: '/system-info', element: <Moved to='/admin/system-info' /> },
      { path: '/admin/task-plugins', element: <TaskPluginsPage /> },
      { path: '/task-plugins', element: <Moved to='/admin/task-plugins' /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/user/reset', element: <ResetPasswordPage /> },
      { path: '/reset', element: <ResetPasswordPage /> },
      { path: '/oauth/:provider', element: <OAuthCallbackPage /> },
      { path: '/client', element: <ClientPage /> },
      { path: '/desktop-authorize', element: <DesktopAuthorizePage /> },
      { path: '/guide', element: <GuidePage /> },
      { path: '/guide/:slug', element: <GuidePage /> },
      { path: '/beginner-guide', element: <BeginnerGuidePage /> },
      { path: '/about', element: <ContentPage source='/api/about' title={tk('关于')} /> },
      { path: '/user-agreement', element: <ContentPage source='/api/user-agreement' title={tk('用户协议')} /> },
      { path: '/privacy-policy', element: <ContentPage source='/api/privacy-policy' title={tk('隐私政策')} /> },
      { path: '/setup', element: <SetupPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
