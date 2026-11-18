import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useApp } from './store/useApp'
import DashboardLayout from './components/layout/DashboardLayout'
import LoginPage from './components/LoginPage'
import GlobalModals from './components/Modals'
import LeaseDetailModal from './components/lease/LeaseDetail'
import { Loading } from './components/common/ui'
import Overview from './pages/landlord/Overview'
import Rooms from './pages/landlord/Rooms'
import Tenants from './pages/landlord/Tenants'
import Leases from './pages/landlord/Leases'
import Usage from './pages/landlord/Usage'
import Invoices from './pages/landlord/Invoices'
import CashFlow from './pages/landlord/CashFlow'
import Services from './pages/landlord/Services'
import FindRooms from './pages/tenant/FindRooms'
import MyLeases from './pages/tenant/MyLeases'
import MyInvoices from './pages/tenant/MyInvoices'

const CHAIN_POLL_MS = 2000
const NAMES_POLL_MS = 5000

export default function App() {
  const { token, user, loadMe, refreshChain, loadNames, connect } = useApp()

  useEffect(() => {
    loadMe()
  }, [token, loadMe])

  // Đọc blockchain & tên hiển thị định kỳ khi đã đăng nhập
  useEffect(() => {
    if (!user) return undefined
    refreshChain()
    loadNames()
    const a = setInterval(refreshChain, CHAIN_POLL_MS)
    const b = setInterval(loadNames, NAMES_POLL_MS)
    return () => {
      clearInterval(a)
      clearInterval(b)
    }
  }, [user, refreshChain, loadNames])

  // Đổi tài khoản trong MetaMask -> app tự theo ví mới; đổi mạng -> tải lại trang
  useEffect(() => {
    if (!window.ethereum) return undefined
    const onAccounts = (accounts) => (accounts.length ? connect() : useApp.getState().disconnect())
    const onChain = () => window.location.reload()
    window.ethereum.on('accountsChanged', onAccounts)
    window.ethereum.on('chainChanged', onChain)
    return () => {
      window.ethereum.removeListener('accountsChanged', onAccounts)
      window.ethereum.removeListener('chainChanged', onChain)
    }
  }, [connect])

  if (!token) return <LoginPage />
  if (!user) return <Loading text="Đang tải tài khoản…" />

  return (
    <>
      <Routes>
        <Route element={<DashboardLayout />}>
          <Route index element={<Navigate to="/tong-quan" replace />} />
          <Route path="tong-quan" element={<Overview />} />
          <Route path="phong" element={<Rooms />} />
          <Route path="khach-thue" element={<Tenants />} />
          <Route path="hop-dong" element={<Leases />} />
          <Route path="dien-nuoc" element={<Usage />} />
          <Route path="hoa-don" element={<Invoices />} />
          <Route path="thu-chi" element={<CashFlow />} />
          <Route path="dich-vu" element={<Services />} />
          <Route path="tim-phong" element={<FindRooms />} />
          <Route path="phong-cua-toi" element={<MyLeases />} />
          <Route path="hoa-don-cua-toi" element={<MyInvoices />} />
          <Route path="*" element={<Navigate to="/tong-quan" replace />} />
        </Route>
      </Routes>
      <LeaseDetailModal />
      <GlobalModals />
    </>
  )
}
