import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createServiceClient } from '@/lib/supabase';
import Stripe from 'stripe';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook error: ${err.message}` }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Idempotency — don't process same event twice
  const { data: existing } = await supabase
    .from('stripe_events')
    .select('id')
    .eq('id', event.id)
    .single();
  if (existing) return NextResponse.json({ received: true });
  await supabase.from('stripe_events').insert({ id: event.id });

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata.userId;
      if (!userId) break;

      const isActive = sub.status === 'active' || sub.status === 'trialing';
      const plan = sub.metadata.plan || 'monthly';
      const premiumUntil = new Date(sub.current_period_end * 1000).toISOString();

      await supabase.from('profiles').update({
        is_premium: isActive,
        premium_until: isActive ? premiumUntil : null,
        stripe_subscription_id: sub.id,
        subscription_plan: isActive ? plan : null,
      }).eq('id', userId);

      console.log(`✓ User ${userId} premium: ${isActive} until ${premiumUntil}`);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata.userId;
      if (!userId) break;

      await supabase.from('profiles').update({
        is_premium: false,
        premium_until: null,
        stripe_subscription_id: null,
        subscription_plan: null,
      }).eq('id', userId);

      console.log(`✓ User ${userId} premium cancelled`);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .single();

      if (profile) {
        // Grace period — keep premium for now, Stripe will retry
        console.log(`⚠️ Payment failed for user ${profile.id}`);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}

// Stripe needs raw body for webhook signature verification
export const config = { api: { bodyParser: false } };
