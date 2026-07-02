'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { DEFAULT_LISBON_TRIP, type Stop, type Trip } from '@/lib/data';
import { optimiseForWeather, type DayWeather } from '@/lib/weather';
import styles from './dashboard.module.css';

export default function DashboardPage() {
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [trip, setTrip] = useState<Trip>(DEFAULT_LISBON_TRIP);
  const [activeDay, setActiveDay] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'itin' | 'chat'>('itin');
  const [weather, setWeather] = useState<DayWeather[]>([]);
  const [messages, setMessages] = useState<{role:string;content:string}[]>([
    { role: 'assistant', content: "Hey! I'm your Wandr AI 🌍\nTell me where in Europe you're heading — I'll build your itinerary or add stops to your plan." }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [showPremium, setShowPremium] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const [weatherChanges, setWeatherChanges] = useState<string[]>([]);
  const [pendingSugs, setPendingSugs] = useState<Record<string,Stop>>({});
  const mapRef = useRef<any>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const directionsRendererRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const msgsEndRef = useRef<HTMLDivElement>(null);

  const isPremium = profile?.is_premium || false;
  const dayStops = trip.days[activeDay] || [];

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) {
        supabase.from('profiles').select('*').eq('id', data.user.id).single()
          .then(({ data: p }) => setProfile(p));
        loadTrips(data.user.id);
      }
    });
  }, []);

  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (mapRef.current) renderDay(activeDay);
  }, [activeDay, trip]);

  async function loadTrips(userId: string) {
    const res = await fetch(`/api/trips?userId=${userId}`);
    const data = await res.json();
    if (data.trips && data.trips.length > 0) {
      setTrip({ ...data.trips[0], days: data.trips[0].days });
    }
  }

  async function saveTrip() {
    if (!user) return;
    await fetch('/api/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trip, userId: user.id }),
    });
  }

  function initMap(google: any) {
    const map = new google.maps.Map(mapDivRef.current!, {
      center: { lat: 38.717, lng: -9.139 },
      zoom: 14,
      disableDefaultUI: true,
      gestureHandling: 'greedy',
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#1a2535' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#9ba3c0' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2e4a62' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#1e3a5f' }] },
        { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1e3d28' }] },
        { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#1a2535' }] },
      ],
    });
    mapRef.current = map;
    const dr = new google.maps.DirectionsRenderer({
      suppressMarkers: true,
      polylineOptions: { strokeColor: '#e8547a', strokeWeight: 4, strokeOpacity: 0.8 },
    });
    dr.setMap(map);
    directionsRendererRef.current = dr;
    fetchWeatherData();
    renderDay(0);
  }

  async function fetchWeatherData() {
    const res = await fetch(`/api/weather?lat=38.717&lng=-9.139&days=7&userId=${user?.id || ''}`);
    const data = await res.json();
    setWeather(data.weather || []);
  }

  function renderDay(dayIdx: number) {
    const google = (window as any).google;
    if (!google || !mapRef.current) return;
    const stops = trip.days[dayIdx] || [];

    // Clear markers
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    directionsRendererRef.current?.setDirections({ routes: [] });

    stops.forEach((stop, i) => {
      const el = document.createElement('div');
      el.style.cssText = `width:28px;height:28px;border-radius:50%;background:${stop.indoor?'#60a5fa':'#e8547a'};border:2.5px solid #fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;box-shadow:0 2px 12px rgba(0,0,0,.4);cursor:pointer`;
      el.textContent = String(i + 1);

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map: mapRef.current, position: { lat: stop.lat, lng: stop.lng },
        title: stop.name, content: el,
      });
      markersRef.current.push(marker);
    });

    if (stops.length > 1) {
      const ds = new google.maps.DirectionsService();
      ds.route({
        origin: { lat: stops[0].lat, lng: stops[0].lng },
        destination: { lat: stops[stops.length-1].lat, lng: stops[stops.length-1].lng },
        waypoints: stops.slice(1,-1).map(s => ({ location: { lat: s.lat, lng: s.lng }, stopover: true })),
        travelMode: google.maps.TravelMode.TRANSIT,
      }, (result: any, status: string) => {
        if (status === 'OK') {
          directionsRendererRef.current?.setDirections(result);
        }
        const bounds = new google.maps.LatLngBounds();
        stops.forEach(s => bounds.extend({ lat: s.lat, lng: s.lng }));
        mapRef.current.fitBounds(bounds, { top: 180, right: 20, bottom: 140, left: 20 });
      });
    } else if (stops.length === 1) {
      mapRef.current.setCenter({ lat: stops[0].lat, lng: stops[0].lng });
      mapRef.current.setZoom(15);
    }
  }

  function deleteStop(stopId: string) {
    setTrip(prev => ({
      ...prev,
      days: prev.days.map((d, i) =>
        i === activeDay ? d.filter(s => s.id !== stopId) : d
      )
    }));
  }

  function addStop(stop: Stop) {
    setTrip(prev => ({
      ...prev,
      days: prev.days.map((d, i) =>
        i === activeDay ? [...d, { ...stop, id: 'ai_' + Date.now(), isPersonal: false }] : d
      )
    }));
  }

  function optimiseRoute() {
    const stops = [...dayStops];
    const first = stops[0];
    const rest = stops.slice(1).sort((a, b) => a.lng - b.lng);
    setTrip(prev => ({
      ...prev,
      days: prev.days.map((d, i) => i === activeDay ? [first, ...rest] : d)
    }));
    showToast('✓ Route optimised — shortest path');
  }

  function weatherOptimise() {
    if (!isPremium) { setShowPremium(true); return; }
    const dayWeather = weather[activeDay];
    if (!dayWeather) { showToast('Weather data not available yet'); return; }
    const { stops: reordered, changes } = optimiseForWeather(dayStops, dayWeather);
    setTrip(prev => ({
      ...prev,
      days: prev.days.map((d, i) => i === activeDay ? reordered : d)
    }));
    setWeatherChanges(changes);
    setTimeout(() => setWeatherChanges([]), 8000);
  }

  async function downloadPDF() {
    if (!isPremium) { setShowPremium(true); return; }
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(trip.title, 20, 20);
    doc.setFontSize(12);
    doc.text(`${trip.city}, ${trip.country}`, 20, 30);

    let y = 50;
    trip.days.forEach((day, di) => {
      doc.setFontSize(14);
      doc.text(`Day ${di + 1}`, 20, y); y += 10;
      day.forEach(stop => {
        doc.setFontSize(11);
        doc.text(`${stop.time}  ${stop.name}`, 25, y); y += 7;
        doc.setFontSize(9);
        doc.text(stop.sub, 30, y); y += 6;
        if (stop.desc) { doc.text(stop.desc.substring(0, 80), 30, y); y += 6; }
        y += 3;
        if (y > 270) { doc.addPage(); y = 20; }
      });
      y += 5;
    });
    doc.save(`${trip.title.replace(/\s/g, '_')}.pdf`);
  }

  async function sendChat() {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatInput('');
    setChatLoading(true);
    const newMessages = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          userId: user?.id,
        }),
      });
      const data = await res.json();

      if (data.error === 'daily_limit_reached') {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `⚡ ${data.message}`,
        }]);
        setShowPremium(true);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
    }
    setChatLoading(false);
  }

  async function startPremiumCheckout(plan: 'monthly' | 'yearly') {
    if (!user) { window.location.href = '/login'; return; }
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, userId: user.id }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  }

  function showToast(msg: string) {
    const t = document.getElementById('toast');
    if (t) { t.textContent = msg; t.classList.add(styles.toastShow); setTimeout(() => t.classList.remove(styles.toastShow), 2800); }
  }

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    if (!key) return;
    if ((window as any).google?.maps) { initMap((window as any).google); return; }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=marker&loading=async`;
    script.onload = () => initMap((window as any).google);
    document.head.appendChild(script);
  }, []);

  const currentWeather = weather[activeDay];

  return (
    <div className={styles.app}>
      <div ref={mapDivRef} className={styles.map} />

      {/* TOP BAR */}
      <div className={styles.topbar}>
        <div className={styles.tripPill}>
          <div className={styles.tripName}>🌍 {trip.title}</div>
          <div className={styles.tripMeta}>{trip.city} · Day {activeDay + 1} of {trip.days.length}</div>
        </div>
        <div className={styles.topRight}>
          {user ? (
            <img src={user.user_metadata?.avatar_url} className={styles.avatar} alt="Profile"
              onClick={() => window.location.href = '/login'} />
          ) : (
            <button className={styles.signInBtn} onClick={() => window.location.href = '/login'}>Sign in</button>
          )}
          <button className={styles.iconBtn} onClick={() => setShowGroup(true)}>☰</button>
        </div>
      </div>

      {/* WEATHER BADGE */}
      {currentWeather && (
        <div className={styles.weatherBadge}>
          <span>{currentWeather.emoji}</span>
          <span>{currentWeather.label} · {currentWeather.maxTemp}°C</span>
          {currentWeather.isRainy && <span className={styles.rainWarn}>☔ Rain {currentWeather.precipitationProbability}%</span>}
        </div>
      )}

      {/* DAY PILLS */}
      <div className={`${styles.daysRow} no-scrollbar`}>
        {trip.days.map((_, i) => {
          const emojis = ['✈️','🏛️','⛵','🍷','🎭','🌅','🎪'];
          const w = weather[i];
          return (
            <div key={i} className={`${styles.dayPill} ${i === activeDay ? styles.dayPillOn : ''}`}
              onClick={() => { setActiveDay(i); setPanelOpen(true); setActiveTab('itin'); }}>
              <span>{w ? w.emoji : emojis[i]}</span>
              <small>Day {i + 1}</small>
            </div>
          );
        })}
      </div>

      {/* WEATHER CHANGE NOTIFICATION */}
      {weatherChanges.length > 0 && (
        <div className={styles.weatherNotif}>
          {weatherChanges.map((c, i) => <div key={i}>{c}</div>)}
        </div>
      )}

      {/* TOAST */}
      <div id="toast" className={styles.toast} />

      {/* BOTTOM PANEL */}
      <div className={`${styles.panel} ${!panelOpen ? styles.panelShut : ''}`}>
        <div className={styles.chatbar}>
          <div className={styles.chatbarInner}>
            <input className={styles.chatInput} value={chatInput} onChange={e => setChatInput(e.target.value)}
              placeholder="Open itinerary or ask AI..." onFocus={() => { setPanelOpen(true); setActiveTab('chat'); }}
              onKeyDown={e => e.key === 'Enter' && sendChat()} />
            <button className={`${styles.ciBtn} ${styles.ciBtnItin} ${activeTab==='itin'&&panelOpen?styles.ciBtnOn:''}`}
              onClick={() => { if (!panelOpen){setPanelOpen(true);setActiveTab('itin');}else if(activeTab==='itin'){setPanelOpen(false);}else setActiveTab('itin'); }}>
              📋
            </button>
            <button className={`${styles.ciBtn} ${styles.ciBtnSend}`} onClick={sendChat}>↑</button>
          </div>
        </div>

        <div className={styles.panelBody}>
          <div className={styles.panelTabs}>
            <button className={`${styles.ptab} ${activeTab==='itin'?styles.ptabOn:''}`} onClick={() => setActiveTab('itin')}>📋 Itinerary</button>
            <button className={`${styles.ptab} ${activeTab==='chat'?styles.ptabOn:''}`} onClick={() => setActiveTab('chat')}>✨ Ask AI</button>
          </div>

          {activeTab === 'itin' ? (
            <div className={`${styles.itinPane} no-scrollbar`}>
              {/* OPTIMISE BUTTONS */}
              <div className={styles.optimiseBar}>
                <button className={styles.optFree} onClick={optimiseRoute}>⚡ Optimise route</button>
                <button className={styles.optPremium} onClick={weatherOptimise}>
                  🌦️ Weather optimise {!isPremium && <span className={styles.proBadge}>PRO</span>}
                </button>
                <button className={styles.optFree} onClick={downloadPDF}>
                  📄 Download PDF {!isPremium && <span className={styles.proBadge}>PRO</span>}
                </button>
                {user && <button className={styles.optFree} onClick={saveTrip}>💾 Save trip</button>}
              </div>

              {/* WEATHER FORECAST FOR THIS DAY */}
              {currentWeather && isPremium && (
                <div className={styles.dayWeather}>
                  <span>{currentWeather.emoji} Day {activeDay+1} forecast: {currentWeather.label} · {currentWeather.maxTemp}°C high</span>
                  <span className={styles.precipProb}>☔ {currentWeather.precipitationProbability}% rain</span>
                </div>
              )}

              {/* STOPS */}
              {dayStops.map((stop, i) => (
                <div key={stop.id} className={`${styles.stopCard} ${i===0?styles.stopHighlighted:''} ${stop.isPersonal?styles.stopPersonal:''}`}>
                  <button className={styles.stopDelete} onClick={() => deleteStop(stop.id)}>✕</button>
                  <div className={styles.stopTop}>
                    <span className={styles.stopNum}>{i+1}</span>
                    <span className={styles.stopTime}>{stop.time}</span>
                    {stop.isPersonal && <span className={styles.personalBadge}>👤 Your stop</span>}
                  </div>
                  <div className={styles.stopName}>{stop.name}</div>
                  <div className={styles.stopSub}>{stop.sub}</div>
                  <div className={styles.stopDesc}>{stop.desc}</div>
                  <div className={styles.tags}>
                    {stop.tags.map((t, ti) => <span key={ti} className={`${styles.tag} ${styles[t.c]||''}`}>{t.l}</span>)}
                  </div>
                  <div className={styles.stopActions}>
                    <button className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                      onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${stop.lat},${stop.lng}`, '_blank')}>
                      🗺️ Navigate
                    </button>
                    <button className={styles.actionBtn}>🍴 Nearby food</button>
                    <button className={styles.actionBtn}>📍 More spots</button>
                  </div>
                </div>
              ))}

              <button className={styles.addStopBtn} onClick={() => setActiveTab('chat')}>
                ＋ Add new stop with AI
              </button>
            </div>
          ) : (
            <div className={styles.chatPane}>
              <div className={`${styles.chatMsgs} no-scrollbar`}>
                {messages.map((m, i) => (
                  <div key={i} className={`${styles.msg} ${m.role==='user'?styles.msgUser:styles.msgAi}`}>
                    {m.content.split('\n').map((line, li) => <div key={li}>{line}</div>)}
                  </div>
                ))}
                {chatLoading && (
                  <div className={`${styles.msg} ${styles.msgAi}`}>
                    <span className={styles.dot}/><span className={styles.dot}/><span className={styles.dot}/>
                  </div>
                )}
                <div ref={msgsEndRef} />
              </div>
              <div className={`${styles.chatSugs} no-scrollbar`}>
                {['Plan London weekend','Paris hidden gems','Add a rooftop bar','Optimise my route','What\'s the weather like?'].map(s => (
                  <button key={s} className={styles.sugChip} onClick={() => { setChatInput(s); }}>{s}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PREMIUM MODAL */}
      {showPremium && (
        <div className={styles.modalOverlay} onClick={() => setShowPremium(false)}>
          <div className={styles.premiumCard} onClick={e => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={() => setShowPremium(false)}>✕</button>
            <div className={styles.premiumEmoji}>🌟</div>
            <h2 className={styles.premiumTitle}>Wandr Premium</h2>
            <p className={styles.premiumSub}>Unlock smart routing, unlimited AI, group trips, and more</p>
            <div className={styles.premiumFeatures}>
              {['🌦️ Weather-smart routing for every day of your trip','💬 Unlimited AI chat — no daily limits','👥 Group trip sharing with personal branches','🔄 Itinerary sync across all your devices','📄 Offline PDF itinerary download','🔔 Live trip alerts while travelling'].map(f => (
                <div key={f} className={styles.premiumFeature}>{f}</div>
              ))}
            </div>
            <div className={styles.pricingGrid}>
              <div className={styles.pricingCard} onClick={() => startPremiumCheckout('monthly')}>
                <div className={styles.pricingAmount}>£2.99</div>
                <div className={styles.pricingLabel}>per month</div>
                <div className={styles.pricingTrial}>7-day free trial</div>
              </div>
              <div className={`${styles.pricingCard} ${styles.pricingCardBest}`} onClick={() => startPremiumCheckout('yearly')}>
                <div className={styles.pricingSave}>SAVE 30%</div>
                <div className={styles.pricingAmount}>£24.99</div>
                <div className={styles.pricingLabel}>per year</div>
                <div className={styles.pricingTrial}>7-day free trial</div>
              </div>
            </div>
            <p className={styles.premiumCancel}>Cancel anytime · No commitment</p>
          </div>
        </div>
      )}

      {/* GROUP TRIP MODAL / MENU */}
      {showGroup && (
        <div className={styles.modalOverlay} onClick={() => setShowGroup(false)}>
          <div className={styles.menuPanel} onClick={e => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={() => setShowGroup(false)}>✕</button>
            <div className={styles.menuHead}>
              <div className={styles.menuTitle}>🌍 Wandr</div>
              {user ? (
                <div className={styles.menuUser}>
                  <img src={user.user_metadata?.avatar_url} className={styles.menuAvatar} alt="" />
                  <span>{user.user_metadata?.full_name}</span>
                  {isPremium && <span className={styles.premiumTag}>✦ Premium</span>}
                </div>
              ) : (
                <button className={styles.menuSignIn} onClick={() => window.location.href='/login'}>Sign in for sync & more</button>
              )}
            </div>
            <div className={styles.menuItems}>
              <div className={styles.menuItem} onClick={() => { setShowGroup(false); setShowPremium(true); }}>
                🌟 {isPremium ? 'Manage subscription' : 'Upgrade to Premium'}
              </div>
              <div className={styles.menuItem} onClick={() => { setShowGroup(false); /* group trip UI */ }}>
                👥 Group trip sharing {!isPremium && <span className={styles.proBadge}>PRO</span>}
              </div>
              <div className={styles.menuItem} onClick={downloadPDF}>
                📄 Download itinerary PDF {!isPremium && <span className={styles.proBadge}>PRO</span>}
              </div>
              <div className={styles.menuItem} onClick={saveTrip}>
                💾 Save trip {!user && <span className={styles.proBadge}>Sign in</span>}
              </div>
              {user && (
                <div className={styles.menuItem} onClick={() => supabase.auth.signOut().then(() => window.location.href='/login')}>
                  🚪 Sign out
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
