'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { Doughnut } from 'react-chartjs-2'
import { apiFetchJson } from '@/lib/api-client'

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend)

export default function HealthDistributionChart() {
  const [healthData, setHealthData] = useState({
    'Healthy': 0,
    'Neutral': 0,
    'Negative': 0
  })
  const [totalCustomers, setTotalCustomers] = useState(0)
  const [loading, setLoading] = useState(true)

  // Fetch real health data from API
  useEffect(() => {
    const fetchHealthData = async () => {
      try {
        // Use the centralized API client for automatic 401 handling
        const data = await apiFetchJson<{ healthData: typeof healthData; totalCustomers: number }>('/api/analytics/health', { cache: 'no-store' })
        setHealthData(data.healthData)
        setTotalCustomers(data.totalCustomers)
      } catch (error) {
        console.error('Error fetching health data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchHealthData()
  }, [])

  // Use real health data from API
  const healthScoreData = {
    labels: ['Healthy', 'Neutral', 'Negative'],
    datasets: [{
      data: [healthData['Healthy'], healthData['Neutral'], healthData['Negative']],
      backgroundColor: [
        'hsl(153, 60%, 50%)', // Green
        'hsl(41, 95%, 55%)', // Amber
        'hsl(4, 85%, 60%)' // Red
      ],
      borderWidth: 0
    }]
  }

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          padding: 20,
          usePointStyle: true
        }
      }
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6 flex flex-col h-full">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Customer Health Distribution</h3>
        <p className="text-sm text-gray-600">Total companies: {totalCustomers}</p>
      </div>
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        ) : (
          <Doughnut data={healthScoreData} options={doughnutOptions} />
        )}
      </div>
    </div>
  )
}

