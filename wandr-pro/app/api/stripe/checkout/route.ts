import { NextRequest, NextResponse } from 'next/server';
import { stripe, PLANS, getOrCreateStripeCustomer } from '@/lib/stripe';
import { createServiceClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { plan, userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'Must be signed in' }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const customerId = await getOrCreateStripeCustomer(
      userId,
      profile.email,
      profile.full_name
    );

    const priceId = plan === 'yearly' ? PLANS.yearly.priceId : PLANS.monthly.priceId;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/dashboard?premium=success`,
      cancel_url: `${appUrl}/dashboard?premium=cancelled`,
      metadata: { userId, plan },
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { userId, plan },
        trial_period_days: 7, // 7-day free trial
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('Stripe checkout error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
