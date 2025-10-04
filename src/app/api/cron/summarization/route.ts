import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    // Verify the request is authorized (optional security check)
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CRON_SECRET_TOKEN
    
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Call the Supabase Edge Function
    const response = await fetch('https://fdaqphksmlmupyrsatcz.supabase.co/functions/v1/process-summarization-queue', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Error calling process-summarization-queue:', errorText)
      return NextResponse.json(
        { error: 'Failed to process summarization queue', details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    console.log('Summarization queue processed:', data)
    
    return NextResponse.json({
      success: true,
      message: 'Summarization queue processed successfully',
      data
    })

  } catch (error) {
    console.error('Error in summarization cron endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Allow GET requests for health checks
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Summarization cron endpoint is active',
    timestamp: new Date().toISOString()
  })
}
