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
import { useQuery } from '@tanstack/react-query'
import { Check as CheckIcon, PlusCircle as PlusCircledIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { useDebounce } from '@/hooks'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { getUserTenantOptions } from '../api'
import {
  userTenantOptionsSchema,
  type ApiResponse,
  type GetUserTenantOptionsParams,
  type UserTenantOptions,
} from '../types'

/** Bounded option page; the server caps page_size at 100. */
export const USER_TENANT_OPTIONS_PAGE_SIZE = 20
const SEARCH_MAX_CODE_POINTS = 64

type UserTenantFilterProps = {
  /** Selected merchant ID as its exact decimal string. */
  value?: string
  onChange: (tenantId: string | undefined) => void
  /** Viewer identity + role; keeps cached options scoped to one session. */
  viewerKey: string
  /**
   * Options endpoint of the hosting page. Each administrator surface has its
   * own scoped entry returning the same safe projection; defaults to the
   * user-list entry.
   */
  fetchOptions?: (
    params: GetUserTenantOptionsParams
  ) => Promise<ApiResponse<UserTenantOptions>>
  /** Query-key scope; must differ per `fetchOptions` endpoint. */
  queryScope?: string
}

/**
 * Merchant filter chip for the administrator user list. Options are searched
 * and paged by the server, never filtered from a truncated first page.
 */
export function UserTenantFilter(props: UserTenantFilterProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  // Truncate by code points: the server accepts at most 64.
  const keyword = [...useDebounce(search.trim(), 300)]
    .slice(0, SEARCH_MAX_CODE_POINTS)
    .join('')
  const selectedId = props.value
  const fetchOptions = props.fetchOptions ?? getUserTenantOptions

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [
      props.queryScope ?? 'users',
      'tenant-options',
      props.viewerKey,
      keyword,
      page,
      selectedId ?? '',
    ],
    queryFn: async () => {
      const result = requireServerSuccess(
        await fetchOptions({
          q: keyword || undefined,
          p: page,
          page_size: USER_TENANT_OPTIONS_PAGE_SIZE,
          selected_id: selectedId,
        })
      )
      return userTenantOptionsSchema.parse(result.data)
    },
    enabled: open || Boolean(selectedId),
    staleTime: 60 * 1000,
    retry: false,
  })

  const items = data?.items ?? []
  const pageCount = data
    ? Math.max(1, Math.ceil(data.total / USER_TENANT_OPTIONS_PAGE_SIZE))
    : 1
  const describe = (id: string, name: string) =>
    name || t('Merchant #{{id}}', { id })
  // An unresolved selection (still loading, or `selected: null`) shows the
  // raw ID instead of a guessed name.
  const resolved =
    selectedId && data?.selected?.id === selectedId ? data.selected : null
  const selectedLabel = resolved
    ? describe(resolved.id, resolved.name)
    : selectedId

  let optionList: ReactNode
  if (isLoading) {
    optionList = (
      <div
        role='status'
        className='text-muted-foreground py-6 text-center text-sm'
      >
        {t('Loading...')}
      </div>
    )
  } else if (isError) {
    optionList = (
      <div
        role='alert'
        className='flex flex-col items-center gap-2 py-4 text-sm'
      >
        {t('Failed to load merchants')}
        <Button variant='outline' size='sm' onClick={() => refetch()}>
          {t('Retry')}
        </Button>
      </div>
    )
  } else if (items.length === 0) {
    optionList = (
      <div className='text-muted-foreground py-6 text-center text-sm'>
        {t('No merchants found')}
      </div>
    )
  } else {
    optionList = (
      <CommandGroup>
        {items.map((item) => {
          const isSelected = item.id === selectedId
          const label = describe(item.id, item.name)
          return (
            <CommandItem
              key={item.id}
              value={item.id}
              onSelect={() => {
                props.onChange(isSelected ? undefined : item.id)
                setOpen(false)
              }}
            >
              <div
                className={cn(
                  'border-primary flex size-4 items-center justify-center rounded-sm border',
                  isSelected
                    ? 'bg-primary text-primary-foreground'
                    : 'opacity-50 [&_svg]:invisible'
                )}
              >
                <CheckIcon className='text-background h-4 w-4' />
              </div>
              <span className='min-w-0 flex-1 truncate' title={label}>
                {label}
              </span>
            </CommandItem>
          )
        })}
      </CommandGroup>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant='outline' size='sm' className='h-8 border-dashed' />
        }
      >
        <PlusCircledIcon className='size-4' />
        {t('Owning merchant')}
        {selectedId && (
          <>
            <Separator orientation='vertical' className='mx-2 h-4' />
            <Badge
              variant='secondary'
              className='max-w-[160px] truncate rounded-sm px-1 font-normal'
              title={selectedLabel}
            >
              {selectedLabel}
            </Badge>
          </>
        )}
      </PopoverTrigger>
      <PopoverContent className='max-w-[360px] min-w-[240px] p-0' align='start'>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('Search merchants...')}
            value={search}
            onValueChange={(value) => {
              setSearch(value)
              setPage(1)
            }}
          />
          <CommandList>
            {optionList}
            {selectedId && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value='__clear__'
                    onSelect={() => {
                      props.onChange(undefined)
                      setOpen(false)
                    }}
                    className='justify-center text-center'
                  >
                    {t('Clear filters')}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
          {data && pageCount > 1 && (
            <div className='flex items-center justify-between gap-2 border-t p-1 text-xs'>
              <Button
                variant='ghost'
                size='sm'
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                {t('Previous page')}
              </Button>
              <span className='text-muted-foreground tabular-nums'>
                {t('Page {{page}} of {{pages}}', { page, pages: pageCount })}
              </span>
              <Button
                variant='ghost'
                size='sm'
                disabled={page >= pageCount}
                onClick={() => setPage((current) => current + 1)}
              >
                {t('Next page')}
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}
