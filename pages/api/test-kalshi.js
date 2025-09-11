import axios from 'axios'

export default async function handler(req, res) {
  try {
    console.log('Testing Kalshi API connection...')
    console.log('API Key provided:', !!process.env.KALSHI_API_KEY)
    console.log('API Key length:', process.env.KALSHI_API_KEY?.length || 0)
    
    // Test basic connectivity first
    const testClient = axios.create({
      baseURL: 'https://api.elections.kalshi.com/trade-api/v2',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    })
    
    if (process.env.KALSHI_API_KEY) {
      testClient.defaults.headers.common['Authorization'] = `Bearer ${process.env.KALSHI_API_KEY}`
    }
    
    // Try to get markets list (basic API test)
    console.log('Making test request to /markets...')
    const response = await testClient.get('/markets', {
      params: {
        limit: 5,
        status: 'open'
      }
    })
    
    console.log('Kalshi API test successful!')
    
    res.status(200).json({
      success: true,
      message: 'Kalshi API connection successful',
      markets_found: response.data.markets?.length || 0,
      sample_market: response.data.markets?.[0] || null,
      api_key_provided: !!process.env.KALSHI_API_KEY
    })
    
  } catch (error) {
    console.error('Kalshi API test failed:', {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      url: error.config?.url
    })
    
    res.status(500).json({
      success: false,
      message: 'Kalshi API connection failed',
      error: error.message,
      code: error.code,
      status: error.response?.status,
      details: error.response?.data,
      api_key_provided: !!process.env.KALSHI_API_KEY
    })
  }
}