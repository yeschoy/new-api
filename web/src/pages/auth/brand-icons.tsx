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
import { KeyRound, Link2, ShieldCheck } from 'lucide-react'

/**
 * Sign-in provider marks, drawn in the current text colour like the lucide
 * icons around them. LinuxDO keeps its own colours: it is a brand mark.
 */
type IconProps = { className?: string }

function Outline(props: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
      className={props.className}
      aria-hidden='true'
    >
      {props.children}
    </svg>
  )
}

export function GitHubIcon(props: IconProps) {
  return (
    <Outline className={props.className}>
      <path d='M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21' />
    </Outline>
  )
}

export function DiscordIcon(props: IconProps) {
  return (
    <Outline className={props.className}>
      <path d='M8 12a1 1 0 1 0 2 0 1 1 0 0 0-2 0M14 12a1 1 0 1 0 2 0 1 1 0 0 0-2 0' />
      <path d='M15.5 17c0 1 1.5 3 2 3 1.5 0 2.833-1.667 3.5-3 .667-1.667.5-5.833-1.5-11.5-1.457-1.015-3-1.34-4.5-1.5l-.972 1.923a11.9 11.9 0 0 0-4.053 0L9 4c-1.5.16-3.043.485-4.5 1.5-2 5.667-2.167 9.833-1.5 11.5.667 1.333 2 3 3.5 3 .5 0 2-2 2-3' />
      <path d='M7 16.5c3.5 1 6.5 1 10 0' />
    </Outline>
  )
}

export function TelegramIcon(props: IconProps) {
  return (
    <Outline className={props.className}>
      <path d='M15 10l-4 4 6 6 4-16-18 7 4 2 2 6 3-4' />
    </Outline>
  )
}

export function WeChatIcon(props: IconProps) {
  return (
    <svg viewBox='0 0 1024 1024' fill='currentColor' className={props.className} aria-hidden='true'>
      <path d='M690.1 377.4c5.9 0 11.8.2 17.6.5-24.4-128.7-158.3-227.1-319.9-227.1C209 150.8 64 271.4 64 420.2c0 81.1 43.6 154.2 111.9 203.6a17.5 17.5 0 0 1 7.9 23.5l-14.6 54.3c-.7 2.6-1.7 5.2-1.7 7.9 0 5.9 4.8 10.8 10.8 10.8 2.3 0 4.2-.9 6.2-2l70.9-40.9c5.3-3.1 11-5 17.2-5 3.2 0 6.4.5 9.5 1.4 33.1 9.5 68.8 14.8 105.7 14.8 6 0 11.9-.1 17.8-.4-7.1-21-10.9-43.1-10.9-66 0-135.8 132.2-245.8 295.3-245.8zm-194.3-86.5c23.8 0 43.2 19.3 43.2 43.1s-19.3 43.1-43.2 43.1c-23.8 0-43.2-19.3-43.2-43.1s19.4-43.1 43.2-43.1zm-215.9 86.2c-23.8 0-43.2-19.3-43.2-43.1s19.3-43.1 43.2-43.1 43.2 19.3 43.2 43.1-19.4 43.1-43.2 43.1z' />
      <path d='M866.7 792.7c56.9-41.2 93.2-102 93.2-169.7 0-124-120.8-224.5-269.9-224.5-149 0-269.9 100.5-269.9 224.5S540.9 847.5 690 847.5c30.8 0 60.6-4.4 88.1-12.3 2.6-.8 5.2-1.2 7.9-1.2 5.2 0 9.9 1.6 14.3 4.1l59.1 34c1.7 1 3.3 1.7 5.2 1.7a9 9 0 0 0 9-9c0-2.2-.9-4.4-1.4-6.6l-12.2-45.3c-.5-1.9-.9-3.8-.9-5.7.1-5.9 3.1-11.2 7.6-14.5zM600.2 587.2c-19.9 0-36-16.1-36-35.9s16.1-35.9 36-35.9 36 16.1 36 35.9-16.2 35.9-36 35.9zm179.9 0c-19.9 0-36-16.1-36-35.9s16.1-35.9 36-35.9 36 16.1 36 35.9c-.1 19.8-16.2 35.9-36 35.9z' />
    </svg>
  )
}

export function LinuxDoIcon(props: IconProps) {
  return (
    <svg viewBox='0 0 16 16' className={props.className} aria-hidden='true'>
      <circle cx='8' cy='8' r='7.5' fill='#efefef' />
      <path d='M1.27 11.33h13.45c-.94 1.89-2.51 3.21-4.51 3.88-1.99.59-3.96.37-5.8-.57-1.25-.7-2.67-1.9-3.14-3.31Z' fill='#feb005' />
      <path d='M12.54 1.99c.87.7 1.82 1.59 2.18 2.68H1.27c.87-1.74 2.33-3.13 4.2-3.78 2.44-.79 5-.47 7.07 1.1Z' fill='#1d1d1f' />
    </svg>
  )
}

/** The mark for a sign-in provider id; OIDC and custom providers get generic ones. */
export function ProviderMark(props: { id: string; className?: string }) {
  switch (props.id) {
    case 'github':
      return <GitHubIcon className={props.className} />
    case 'discord':
      return <DiscordIcon className={props.className} />
    case 'linuxdo':
      return <LinuxDoIcon className={props.className} />
    case 'telegram':
      return <TelegramIcon className={props.className} />
    case 'wechat':
      return <WeChatIcon className={props.className} />
    case 'oidc':
      return <ShieldCheck className={props.className} aria-hidden='true' />
    case 'passkey':
      return <KeyRound className={props.className} aria-hidden='true' />
    default:
      return <Link2 className={props.className} aria-hidden='true' />
  }
}
