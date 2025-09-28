'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// Health Score component with a visual bar
const HealthScore: React.FC<{ score: number }> = ({ score }) => {
  let barColorClass = 'bg-green-500'
  if (score < 70) barColorClass = 'bg-yellow-500'
  if (score < 50) barColorClass = 'bg-red-500'

  return (
    <div className="flex items-center space-x-2">
      <span className="font-medium text-gray-700">{score}%</span>
      <div className="w-20 h-2 bg-gray-200 rounded-full">
        <div className={`${barColorClass} h-2 rounded-full`} style={{ width: `${score}%` }}></div>
      </div>
    </div>
  )
}

// Status Badge component
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  let colorClasses = 'bg-green-100 text-green-800'
  if (status === 'Needs Attention') colorClasses = 'bg-yellow-100 text-yellow-800'
  if (status === 'At Risk') colorClasses = 'bg-red-100 text-red-800'

  return (
    <span className={`px-3 py-1 text-xs font-medium rounded-full ${colorClasses}`}>
      {status}
    </span>
  )
}

// Actions Dropdown component
const ActionsDropdown: React.FC<{ customerId: string }> = ({ customerId }) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="relative">
      <button onClick={() => setIsOpen(!isOpen)} className="p-2 rounded-full hover:bg-gray-100">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
          <circle cx="12" cy="12" r="1"></circle>
          <circle cx="12" cy="5" r="1"></circle>
          <circle cx="12" cy="19" r="1"></circle>
        </svg>
      </button>
      {isOpen && (
        <div className="absolute right-0 z-10 w-40 mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
          <ul className="py-1 text-sm text-gray-700">
            <li>
              <a href={`/customers/${customerId}/view`} className="block px-4 py-2 hover:bg-gray-100">View Account</a>
            </li>
            <li>
              <a href={`/customers/${customerId}/edit`} className="block px-4 py-2 hover:bg-gray-100">Edit Customer</a>
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}

// Customer type based on your database structure
type Customer = {
  id: string
  name: string
  company_name?: string
  contact_email: string
  health_score?: number
  status?: string
  mrr?: number
  renewal_date?: string
  last_interaction_at?: string
  created_at: string
}

// Main Customer Dashboard Component
const CustomersSection: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        setLoading(true)

        // Fetch via server API route to avoid client-side RLS pitfalls
        const resp = await fetch('/api/customers', { cache: 'no-store' })
        if (!resp.ok) {
          const msg = await resp.text()
          setError(msg || 'Failed to fetch customers')
          return
        }
        const json = await resp.json()
        setCustomers((json.customers as Customer[]) || [])
      } catch (err) {
        console.error('Error:', err)
        setError('An unexpected error occurred')
      } finally {
        setLoading(false)
      }
    }

    fetchCustomers()
  }, [supabase])

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      {/* Sidebar is handled by app layout in this project; keeping content area only */}
      <main className="flex-1 p-8 overflow-y-auto w-full">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Customers</h1>
            <p className="text-sm text-gray-500 mt-1">
              <a href="/dashboard" className="hover:underline">Dashboard</a> / <span className="font-medium">Customers</span>
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <input type="text" placeholder="Search customers..." className="px-4 py-2 border rounded-md text-sm" />
            <button className="px-5 py-2 text-sm font-semibold text-white bg-purple-600 rounded-md hover:bg-purple-700">
              + Add Customer
            </button>
          </div>
        </header>

        {/* Customer Table */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold text-gray-800">Customer Overview</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-600">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                <tr>
                  <th scope="col" className="p-4"><input type="checkbox" className="rounded" /></th>
                  <th scope="col" className="px-6 py-3">Customer Name</th>
                  <th scope="col" className="px-6 py-3">Health Score</th>
                  <th scope="col" className="px-6 py-3">Status</th>
                  <th scope="col" className="px-6 py-3">MRR</th>
                  <th scope="col" className="px-6 py-3">Renewal Date</th>
                  <th scope="col" className="px-6 py-3">Last Interaction</th>
                  <th scope="col" className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="text-center p-8">Loading customers...</td></tr>
                ) : error ? (
                  <tr><td colSpan={8} className="text-center p-8 text-red-500">{error}</td></tr>
                ) : customers.length === 0 ? (
                  <tr><td colSpan={8} className="text-center p-8 text-gray-500">No customers found. Add your first customer to get started.</td></tr>
                ) : (
                  customers.map((customer) => (
                    <tr key={customer.id} className="bg-white border-b hover:bg-gray-50">
                      <td className="p-4"><input type="checkbox" className="rounded" /></td>
                      <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                        <Link 
                          href={`/dashboard/customers/${customer.id}`} 
                          className="hover:text-purple-600 transition-colors"
                        >
                          {customer.company_name || customer.name}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        {customer.health_score ? (
                          <HealthScore score={customer.health_score} />
                        ) : (
                          <span className="text-gray-400">Not set</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {customer.status ? (
                          <StatusBadge status={customer.status} />
                        ) : (
                          <span className="text-gray-400">Not set</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {customer.mrr ? `$${customer.mrr.toLocaleString()}` : <span className="text-gray-400">Not set</span>}
                      </td>
                      <td className="px-6 py-4">
                        {customer.renewal_date || <span className="text-gray-400">Not set</span>}
                      </td>
                      <td className="px-6 py-4">
                        {customer.last_interaction_at ? (
                          new Date(customer.last_interaction_at).toLocaleDateString('en-CA')
                        ) : (
                          <span className="text-gray-400">Not set</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center"><ActionsDropdown customerId={customer.id} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}

export default CustomersSection



