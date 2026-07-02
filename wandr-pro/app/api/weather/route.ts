import { NextRequest, NextResponse } from 'next/server';
import { getWeatherForecast } from '@/lib/weather';
import { createServiceClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get('lat') || '38.717');
  const lng = parseFloat(searchParams.get('lng') || '-9.139');
  const days = parseInt(searchParams.get('days') || '7');
  const userId = searchParams.get('userId');

  // Premium check for multi-day (>1 day) forecasts
  if (days > 1 && userId) {
    const supabase = createServiceClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_premium')
      .eq('id', userId)
      .single();

    if (!profile?.is_premium) {
      // Return only today's weather for free users
      const weather = await getWeatherForecast(lat, lng, 1);
      return NextResponse.json({
        weather,
        isPremiumRequired: true,
        message: 'Multi-day weather routing is a Premium feature.',
      });
    }
  }

  const weather = await getWeatherForecast(lat, lng, Math.min(days, 7));
  return NextResponse.json({ weather });
}
