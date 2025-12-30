'use client';

import { useEffect, useState } from 'react';
import { Clock, Users, CheckCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { useSupabase } from '@/components/SupabaseProvider';
import { useParams } from 'next/navigation';
import { apiFetchJson } from '@/lib/api-client';
import type { CompanyData, NextStep } from '@/lib/companies/getCompanyDetails';

export default function TasksPage() {
  const params = useParams();
  const companyId = params.id as string;
  const supabase = useSupabase();
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [nextSteps, setNextSteps] = useState<NextStep[]>([]);
  const [activeExpanded, setActiveExpanded] = useState(true);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [updatingStepId, setUpdatingStepId] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!companyId) return;
      
      setLoading(true);
      try {
        const functionName = `get-company-page-details?company_id=${companyId}`;
        const { data, error } = await supabase.functions.invoke<CompanyData>(functionName, {
          method: 'GET',
        });

        if (error) {
          throw error;
        }

        setCompanyData(data);
        if (data?.next_steps) {
          setNextSteps(data.next_steps);
        }
      } catch (err) {
        console.error('Error fetching company data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [companyId, supabase]);

  const toggleNextStep = async (step: NextStep) => {
    setUpdatingStepId(step.id);
    try {
      const newStatus = step.status === 'done' ? 'todo' : 'done';
      
      const updated = await apiFetchJson<NextStep>(`/api/companies/${companyId}/next-steps/${step.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });
      
      setNextSteps(
        nextSteps.map(s => 
          s.id === step.id ? updated : s
        )
      );
    } catch (err) {
      console.error('Error updating next step:', err);
      setNextSteps(
        nextSteps.map(s => 
          s.id === step.id ? { ...s, status: step.status } : s
        )
      );
    } finally {
      setUpdatingStepId(null);
    }
  };

  if (loading || !companyData) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-gray-200 rounded-xl animate-pulse"></div>
        ))}
      </div>
    );
  }

  const activeSteps = nextSteps.filter(s => s.status !== 'done');
  const completedSteps = nextSteps.filter(s => s.status === 'done');

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-6">
          <Clock className="h-6 w-6 text-gray-600" />
          <h3 className="text-xl font-semibold text-gray-900">Next Steps</h3>
        </div>
        
        {/* Active Next Steps */}
        {activeSteps.length > 0 && (
          <div className="mb-6">
            <button
              onClick={() => setActiveExpanded(!activeExpanded)}
              className="flex items-center gap-2 mb-4 w-full text-left hover:text-gray-900 transition-colors"
            >
              <Users className="h-5 w-5 text-gray-600" />
              <h4 className="font-semibold text-gray-900">Active Next Steps</h4>
              <span className="ml-auto text-sm text-gray-600">
                ({activeSteps.length})
                {activeExpanded ? <ChevronDown className="w-4 h-4 inline ml-1" /> : <ChevronRight className="w-4 h-4 inline ml-1" />}
              </span>
            </button>
            
            {activeExpanded && (
              <ul className="space-y-3">
                {activeSteps.map((step) => (
                  <li key={step.id} className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                    <button
                      onClick={() => toggleNextStep(step)}
                      disabled={updatingStepId === step.id}
                      className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all mt-0.5 ${
                        step.status === 'done'
                          ? 'bg-blue-600 border-blue-600'
                          : 'border-gray-300 hover:border-blue-600'
                      } ${updatingStepId === step.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {step.status === 'done' && <CheckCircle className="w-4 h-4 text-white" />}
                    </button>
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 font-medium mb-2">{step.text}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {step.owner && (
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            Owner: {step.owner}
                          </span>
                        )}
                        {step.due_date && (
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                            Due: {new Date(step.due_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Completed Next Steps */}
        {completedSteps.length > 0 && (
          <div>
            <button
              onClick={() => setCompletedExpanded(!completedExpanded)}
              className="flex items-center gap-2 mb-4 w-full text-left hover:text-gray-900 transition-colors"
            >
              <Users className="h-5 w-5 text-gray-600" />
              <h4 className="font-semibold text-gray-900">Completed Next Steps</h4>
              <span className="ml-auto text-sm text-gray-600">
                ({completedSteps.length})
                {completedExpanded ? <ChevronDown className="w-4 h-4 inline ml-1" /> : <ChevronRight className="w-4 h-4 inline ml-1" />}
              </span>
            </button>
            
            {completedExpanded && (
              <div className="max-h-96 overflow-y-auto space-y-3">
                {completedSteps.map((step) => (
                  <div key={step.id} className="flex items-start gap-4 p-4 bg-green-50 rounded-lg opacity-75">
                    <button
                      onClick={() => toggleNextStep(step)}
                      disabled={updatingStepId === step.id}
                      className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all mt-0.5 ${
                        step.status === 'done'
                          ? 'bg-green-600 border-green-600'
                          : 'border-gray-300 hover:border-blue-600'
                      } ${updatingStepId === step.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {step.status === 'done' && <CheckCircle className="w-4 h-4 text-white" />}
                    </button>
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-700 line-through mb-2">{step.text}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {step.owner && (
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            Owner: {step.owner}
                          </span>
                        )}
                        {step.due_date && (
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                            Due: {new Date(step.due_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeSteps.length === 0 && completedSteps.length === 0 && (
          <p className="text-sm text-gray-500">No next steps found.</p>
        )}
      </div>
    </div>
  );
}

