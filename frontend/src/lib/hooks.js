import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../store/useApp'

/** Giờ của blockchain (giây), tự tăng mỗi giây. Khi demo tua thời gian, chain chạy trước giờ máy. */
export function useNow() {
  const offset = useApp((s) => s.chainOffset)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(id)
  }, [])
  return now + offset
}

/** Gọi API lấy dữ liệu, tự tải lại theo chu kỳ `pollMs` (nếu có). Trả về { data, error, loading, reload }. */
export function useFetch(fetcher, deps = [], pollMs = 0) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(fetcher, deps)
  const reload = useCallback(async () => {
    try {
      const data = await load()
      setState({ data, error: null, loading: false })
      return data
    } catch (err) {
      setState((s) => ({ ...s, error: err.message, loading: false }))
      return null
    }
  }, [load])
  useEffect(() => {
    setState((s) => ({ ...s, loading: true }))
    reload()
    if (!pollMs) return undefined
    const id = setInterval(reload, pollMs)
    return () => clearInterval(id)
  }, [reload, pollMs])
  return { ...state, reload }
}

/** Tháng hiện tại dạng YYYY-MM. */
export function currentMonth(offsetMonths = 0) {
  const d = new Date()
  const m = new Date(d.getFullYear(), d.getMonth() + offsetMonths, 1)
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`
}
