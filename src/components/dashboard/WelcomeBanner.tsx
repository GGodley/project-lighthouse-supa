import { createClient } from '@/lib/supabase/server'

export default async function WelcomeBanner() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  let fullName = 'there'
  
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()
    
    if (profile?.full_name) {
      fullName = profile.full_name
    }
  }

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <div className="glass-card p-6 h-full flex flex-col justify-center">
      <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-1">
        {getGreeting()}, {fullName}
      </h2>
      <p className="text-gray-500 dark:text-gray-400">
        Welcome to your customer dashboard.
      </p>
    </div>
  )
}

