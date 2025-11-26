'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, TrendingUp, Users, DollarSign, Percent } from 'lucide-react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import { apiFetchJson } from '@/lib/api-client';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement);

const AnalyticsTab = () => {
  const [healthData, setHealthData] = useState({
    'Healthy': 0,
    'Neutral': 0,
    'Negative': 0
  });
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [featureRequestsData, setFeatureRequestsData] = useState({
    labels: [],
    datasets: []
  });
  const [loading, setLoading] = useState(true);
  const [featureRequestsLoading, setFeatureRequestsLoading] = useState(true);

  // Fetch real health data from API
  useEffect(() => {
    const fetchHealthData = async () => {
      try {
        // Use the centralized API client for automatic 401 handling
        const data = await apiFetchJson<{ healthData: typeof healthData; totalCustomers: number }>('/api/analytics/health', { cache: 'no-store' });
        setHealthData(data.healthData);
        setTotalCustomers(data.totalCustomers);
      } catch (error) {
        console.error('Error fetching health data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHealthData();
  }, []);

  // Fetch real feature requests data from API
  useEffect(() => {
    const fetchFeatureRequestsData = async () => {
      try {
        setFeatureRequestsLoading(true);
        // Use the centralized API client for automatic 401 handling
        const data = await apiFetchJson<{ featureRequests: typeof featureRequestsData }>('/api/analytics/feature-requests', { cache: 'no-store' });
        console.log('Frontend received data:', data);
        console.log('Feature requests data:', data.featureRequests);
        setFeatureRequestsData(data.featureRequests);
      } catch (error) {
        console.error('Error fetching feature requests data:', error);
      } finally {
        setFeatureRequestsLoading(false);
      }
    };

    fetchFeatureRequestsData();
  }, []);

  const kpiCards = [{
    title: 'Total Revenue',
    value: '$1.2M',
    icon: DollarSign,
    color: 'text-green-600',
    change: '+12.5%'
  }, {
    title: 'Avg. Contract Value',
    value: '$24,800',
    icon: TrendingUp,
    color: 'text-blue-600',
    change: '+8.2%'
  }, {
    title: 'Active Customers',
    value: '156',
    icon: Users,
    color: 'text-blue-600',
    change: '+15'
  }, {
    title: 'Churn Rate',
    value: '2.8%',
    icon: Percent,
    color: 'text-yellow-600',
    change: '-0.5%'
  }];

  const revenueData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    datasets: [{
      label: 'Monthly Recurring Revenue',
      data: [85000, 89000, 92000, 88000, 94000, 98000, 102000, 105000, 108000, 112000, 115000, 118000],
      borderColor: 'hsl(244, 70%, 58%)',
      backgroundColor: 'hsl(244, 70%, 58%, 0.1)',
      borderWidth: 3,
      fill: true,
      tension: 0.4
    }]
  };

  // Use real health data from API
  const healthScoreData = {
    labels: ['Healthy', 'Neutral', 'Negative'],
    datasets: [{
      data: [healthData['Healthy'], healthData['Neutral'], healthData['Negative']],
      backgroundColor: ['hsl(153, 60%, 50%)', // Green
      'hsl(41, 95%, 55%)', // Amber
      'hsl(4, 85%, 60%)' // Red
      ],
      borderWidth: 0
    }]
  };

  // Use real feature requests data from API (already set in state)

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        }
      },
      y: {
        grid: {
          color: 'hsl(214, 31%, 91%)'
        },
        ticks: {
          callback: function (value: number | string) {
            return '$' + (Number(value) / 1000) + 'K';
          }
        }
      }
    }
  };

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
  };

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          padding: 20,
          usePointStyle: true
        }
      },
      title: {
        display: false
      }
    },
    scales: {
      x: {
        stacked: true,
        grid: {
          display: false
        },
        ticks: {
          maxRotation: 0,
          minRotation: 0,
          font: {
            size: 9
          },
          padding: 4,
          maxTicksLimit: 10 // Limit to 10 ticks maximum
        },
        categoryPercentage: 0.8, // Use 80% of available space for bars
        barPercentage: 0.9 // Use 90% of category space for individual bars
      },
      y: {
        stacked: true,
        grid: {
          color: 'hsl(214, 31%, 91%)'
        },
        beginAtZero: true,
        ticks: {
          stepSize: 1,
          font: {
            size: 10
          }
        }
      }
    }
  };

  const activities = [{
    id: 1,
    description: 'Customer health score report generated',
    time: '1 hour ago',
    type: 'system'
  }, {
    id: 2,
    description: 'Revenue milestone reached: $1.2M ARR',
    time: '3 hours ago',
    type: 'success'
  }, {
    id: 3,
    description: 'Churn alert: 3 customers at risk',
    time: '5 hours ago',
    type: 'warning'
  }, {
    id: 4,
    description: 'Monthly analytics dashboard updated',
    time: '8 hours ago',
    type: 'system'
  }, {
    id: 5,
    description: 'Customer satisfaction survey completed',
    time: '1 day ago',
    type: 'info'
  }, {
    id: 6,
    description: 'Quarterly business review scheduled',
    time: '2 days ago',
    type: 'info'
  }];

  return (
    <div className="min-h-screen glass-bg">
      <div className="max-w-7xl mx-auto p-6">
        <div className="space-y-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h1 className="text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-600" />
          <Badge variant="outline" className="text-gray-600">
            Last 12 months
          </Badge>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpiCards.map((kpi, index) => {
          const Icon = kpi.icon;
          return (
            <Card key={index} className="bg-white border-gray-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-zinc-700">{kpi.title}</p>
                  <Icon className={`h-5 w-5 ${kpi.color}`} />
                </div>
                <div className="flex items-end justify-between">
                  <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
                  <p className="text-xs text-green-600">{kpi.change}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="bg-white border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900">Revenue Growth (YTD)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <Line data={revenueData} options={chartOptions} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900">Customer Health Distribution</CardTitle>
            <p className="text-sm text-gray-600">Total customers: {totalCustomers}</p>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                </div>
              ) : (
                <Doughnut data={healthScoreData} options={doughnutOptions} />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Feature Requests Chart */}
      <Card className="bg-white border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-900">Feature Requests by Urgency</CardTitle>
          <p className="text-sm text-gray-600">Total requests across all customer accounts</p>
        </CardHeader>
        <CardContent>
          <div className="h-96">
            {featureRequestsLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              </div>
            ) : featureRequestsData.labels && featureRequestsData.labels.length > 0 ? (
              <Bar data={featureRequestsData} options={barChartOptions} />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-gray-500 text-lg mb-2">No Feature Requests Data</p>
                  <p className="text-gray-400 text-sm">The PostgreSQL function returned no data for your account.</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent Activities */}
      <Card className="bg-white border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-900">Recent Activities</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {activities.map(activity => (
              <div key={activity.id} className="flex items-start space-x-3 p-3 rounded-lg hover:bg-muted/50">
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                  activity.type === 'success' ? 'bg-success' : 
                  activity.type === 'warning' ? 'bg-warning' : 
                  activity.type === 'system' ? 'bg-primary' : 'bg-muted-foreground'
                }`}></div>
                <div className="flex-1">
                  <p className="text-sm text-gray-900">{activity.description}</p>
                  <p className="text-xs text-gray-600 mt-1">{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
        </div>
      </div>
    </div>
  );
};

export const dynamic = 'force-dynamic'

export default AnalyticsTab;