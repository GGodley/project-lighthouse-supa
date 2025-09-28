import DashboardLayout from '@/components/layout/DashboardLayout'

export const dynamic = 'force-dynamic'

export default function Layout({
  children,
}: {
  children: React.ReactNode
}) {
  return <DashboardLayout>{children}</DashboardLayout>
}
