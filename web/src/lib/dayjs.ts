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
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

/** Admin UI timestamps always render in China Standard Time. */
export const DISPLAY_TIMEZONE = 'Asia/Shanghai'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(relativeTime)
dayjs.tz.setDefault(DISPLAY_TIMEZONE)

function inDisplayTz(value: dayjs.Dayjs): dayjs.Dayjs {
  return value.tz(DISPLAY_TIMEZONE)
}

const createDisplayDayjs = ((
  date?: dayjs.ConfigType,
  format?: dayjs.OptionType,
  locale?: string,
  strict?: boolean
) => {
  if (date === undefined && format === undefined) {
    return inDisplayTz(dayjs())
  }
  return inDisplayTz(dayjs(date, format, locale, strict))
}) as typeof dayjs

const displayDayjs = Object.assign(createDisplayDayjs, dayjs, {
  unix: (timestamp: number) => inDisplayTz(dayjs.unix(timestamp)),
}) as typeof dayjs

export default displayDayjs
