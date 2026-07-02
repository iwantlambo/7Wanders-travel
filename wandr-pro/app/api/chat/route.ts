import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createServiceClient } from '@/lib/supabase';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const FREE_DAILY_LIMIT = 10;

const SYSTEM_PROMPT = `You are Wandr, an expert AI travel assistant specialising in European travel.
Your personality is friendly, knowledgeable, and enthusiastic about hidden gems and authentic local experiences.

You help users:
- Plan day-by-day European itineraries based on budget, vibe, and travel style
- Discover hidden gems locals love
- Add specific stops to their existing itinerary
- Understand transport options and travel times between stops
- Plan routes considering indoor/outdoor activities and weather

Always:
- Keep responses concise (mobile-friendly, max 3 short paragraphs)
- Give specific, actionable recommendations with prices
- Mention whether venues are indoor or outdoor (important for weather planning)
- Ask one follow-up question to refine recommendations
- Focus on Europe — UK, Portugal, Spain, France, Italy, Greece, Netherlands, Germany`;

export async function POST(req: NextRequest) {
  try {
    const { messages, userId } = await req.json();

    // Check message limit for free users
    if (userId) {
      const supabase = createServiceClient();
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_premium, ai_messages_today, ai_messages_reset_date')
        .eq('id', userId)
        .single();

      if (profile && !profile.is_premium) {
        // Reset counter if new day
        const today = new Date().toISOString().split('T')[0];
        if (profile.ai_messages_reset_date !== today) {
          await supabase
            .from('profiles')
            .update({ ai_messages_today: 0, ai_messages_reset_date: today })
            .eq('id', userId);
          profile.ai_messages_today = 0;
        }

        if (profile.ai_messages_today >= FREE_DAILY_LIMIT) {
          return NextResponse.json(
            {
              error: 'daily_limit_reached',
              message: `You've used your ${FREE_DAILY_LIMIT} free AI messages for today. Upgrade to Premium for unlimited planning.`,
            },
            { status: 429 }
          );
        }

        // Increment counter
        await supabase
          .from('profiles')
          .update({ ai_messages_today: profile.ai_messages_today + 1 })
          .eq('id', userId);
      }
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 600,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages,
      ],
    });

    return NextResponse.json({
      reply: completion.choices[0]?.message?.content || 'Sorry, something went wrong.',
    });
  } catch (err: any) {
    console.error('Chat error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
