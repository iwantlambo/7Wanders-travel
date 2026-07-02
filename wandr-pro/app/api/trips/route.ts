import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

// GET /api/trips - get user's trips
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ trips: data });
}

// POST /api/trips - create or update trip
export async function POST(req: NextRequest) {
  const { trip, userId } = await req.json();
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 401 });

  const supabase = createServiceClient();

  if (trip.id && trip.id !== 'default') {
    // Update existing
    const { data, error } = await supabase
      .from('trips')
      .update({
        title: trip.title,
        city: trip.city,
        days: trip.days,
        updated_at: new Date().toISOString(),
      })
      .eq('id', trip.id)
      .eq('owner_id', userId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ trip: data });
  } else {
    // Create new
    const { data, error } = await supabase
      .from('trips')
      .insert({
        owner_id: userId,
        title: trip.title || 'My Trip',
        city: trip.city || 'Lisbon',
        country: trip.country || 'Portugal',
        days: trip.days || [],
        is_group: false,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ trip: data });
  }
}

// POST /api/trips/group - create a group trip
export async function groupCreate(req: NextRequest) {
  const { tripId, userId } = await req.json();
  const supabase = createServiceClient();

  // Generate 6-char code
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();

  const { data, error } = await supabase
    .from('trips')
    .update({ is_group: true, group_code: code })
    .eq('id', tripId)
    .eq('owner_id', userId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Add owner as member
  await supabase.from('group_members').upsert({
    trip_id: tripId,
    user_id: userId,
    role: 'owner',
  });

  return NextResponse.json({ trip: data, code });
}
