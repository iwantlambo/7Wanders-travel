// Uses Open-Meteo (free, no API key needed)
// Returns weather for up to 7 days ahead

export interface DayWeather {
  date: string;
  weatherCode: number;
  maxTemp: number;
  minTemp: number;
  precipitationProbability: number; // 0-100
  isRainy: boolean;
  isSunny: boolean;
  emoji: string;
  label: string;
  recommendation: string;
}

const WMO_CODES: Record<number, { emoji: string; label: string }> = {
  0:  { emoji: '☀️',  label: 'Clear sky' },
  1:  { emoji: '🌤️', label: 'Mainly clear' },
  2:  { emoji: '⛅',  label: 'Partly cloudy' },
  3:  { emoji: '☁️',  label: 'Overcast' },
  45: { emoji: '🌫️', label: 'Foggy' },
  48: { emoji: '🌫️', label: 'Icy fog' },
  51: { emoji: '🌦️', label: 'Light drizzle' },
  53: { emoji: '🌦️', label: 'Drizzle' },
  55: { emoji: '🌦️', label: 'Heavy drizzle' },
  61: { emoji: '🌧️', label: 'Light rain' },
  63: { emoji: '🌧️', label: 'Rain' },
  65: { emoji: '🌧️', label: 'Heavy rain' },
  71: { emoji: '🌨️', label: 'Light snow' },
  73: { emoji: '❄️',  label: 'Snow' },
  80: { emoji: '🌦️', label: 'Rain showers' },
  95: { emoji: '⛈️', label: 'Thunderstorm' },
};

export async function getWeatherForecast(
  lat: number,
  lng: number,
  days: number = 7
): Promise<DayWeather[]> {
  const url = `https://api.open-meteo.com/v1/forecast?` +
    `latitude=${lat}&longitude=${lng}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&forecast_days=${days}` +
    `&timezone=auto`;

  const res = await fetch(url, { next: { revalidate: 3600 } }); // cache 1 hour
  if (!res.ok) throw new Error('Weather fetch failed');

  const data = await res.json();
  const daily = data.daily;

  return daily.time.map((date: string, i: number) => {
    const code = daily.weather_code[i];
    const precipProb = daily.precipitation_probability_max[i];
    const isRainy = precipProb > 50 || (code >= 51 && code <= 99);
    const isSunny = code <= 2 && precipProb < 20;
    const wmo = WMO_CODES[code] || { emoji: '🌡️', label: 'Variable' };

    let recommendation = '';
    if (isRainy) {
      recommendation = 'Rain likely — prioritise indoor spots. Move outdoor activities to morning if possible.';
    } else if (isSunny) {
      recommendation = 'Great weather! Perfect for outdoor spots and viewpoints in the morning.';
    } else {
      recommendation = 'Mixed conditions — outdoor spots fine, have a backup plan.';
    }

    return {
      date,
      weatherCode: code,
      maxTemp: Math.round(daily.temperature_2m_max[i]),
      minTemp: Math.round(daily.temperature_2m_min[i]),
      precipitationProbability: precipProb,
      isRainy,
      isSunny,
      emoji: wmo.emoji,
      label: wmo.label,
      recommendation,
    };
  });
}

// Smart route optimiser based on weather
export function optimiseForWeather(
  stops: any[],
  weather: DayWeather
): { stops: any[]; changes: string[] } {
  const changes: string[] = [];
  let reordered = [...stops];

  if (weather.isRainy) {
    // Sort: indoor stops first, outdoor last
    reordered = [
      ...stops.filter(s => s.indoor),
      ...stops.filter(s => !s.indoor),
    ];
    const movedOutdoor = stops.filter(s => !s.indoor).map(s => s.name);
    if (movedOutdoor.length) {
      changes.push(`🌧️ Rain forecast (${weather.precipitationProbability}% chance) — moved ${movedOutdoor.join(', ')} to afternoon`);
    }
    changes.push(`💡 Tip: ${weather.recommendation}`);
  } else if (weather.isSunny) {
    // Outdoor spots first for golden hour
    reordered = [
      ...stops.filter(s => !s.indoor),
      ...stops.filter(s => s.indoor),
    ];
    const outdoorFirst = stops.filter(s => !s.indoor).map(s => s.name);
    if (outdoorFirst.length) {
      changes.push(`☀️ Clear skies — moved ${outdoorFirst.join(', ')} to morning for best light`);
    }
  } else {
    changes.push(`⛅ ${weather.label} — keeping original order, outdoor spots should be fine`);
  }

  // Re-assign times sequentially
  const startHour = 9;
  reordered = reordered.map((stop, i) => ({
    ...stop,
    time: `${String(startHour + i * 2).padStart(2, '0')}:00`,
  }));

  return { stops: reordered, changes };
}
