export interface Stop {
  id: string;
  time: string;
  eta?: string;
  name: string;
  sub: string;
  desc: string;
  tags: { l: string; c: string }[];
  tips: string[];
  lat: number;
  lng: number;
  indoor: boolean;
  type: 'transport' | 'sightseeing' | 'dining' | 'outdoor' | 'accommodation';
  isPersonal?: boolean; // true = private addition to group trip
}

export interface Trip {
  id: string;
  title: string;
  city: string;
  country: string;
  days: Stop[][];
  isGroup: boolean;
  groupCode?: string;
}

export interface GroupMember {
  userId: string;
  name: string;
  avatarUrl?: string;
  role: 'owner' | 'member';
}

export const CITY_COORDS: Record<string, { lat: number; lng: number; zoom: number }> = {
  lisbon:    { lat: 38.717, lng: -9.139, zoom: 14 },
  london:    { lat: 51.505, lng: -0.118, zoom: 13 },
  paris:     { lat: 48.856, lng:  2.352, zoom: 13 },
  barcelona: { lat: 41.386, lng:  2.170, zoom: 13 },
  amsterdam: { lat: 52.372, lng:  4.896, zoom: 13 },
};

export const DEFAULT_LISBON_TRIP: Trip = {
  id: 'default',
  title: 'Lisbon Trip',
  city: 'Lisbon',
  country: 'Portugal',
  isGroup: false,
  days: [
    [
      { id:'l1', time:'09:00', name:'Humberto Delgado Airport', sub:'Arrival · Metro Line 1', desc:'Take Metro Line 1 to city centre — €1.50/person, 35 mins.', tags:[{l:'🚇 Metro',c:'tag-sight'},{l:'€1.50',c:'tag-price'}], tips:['Buy 24hr Viva Viagem card','Avoid airport taxis'], lat:38.7742, lng:-9.1342, indoor:true, type:'transport' },
      { id:'l2', time:'15:30', name:'Miradouro da Graça', sub:"Graça · Locals' secret viewpoint", desc:'Best sunset in Lisbon. Far less crowded than São Jorge.', tags:[{l:'🌅 Sunset',c:'tag-food'},{l:'Free',c:'tag-price'},{l:'Hidden gem',c:'tag-gem'},{l:'🌤️ Outdoor',c:'tag-outdoor'}], tips:['Walk downhill through Alfama after'], lat:38.7157, lng:-9.1272, indoor:false, type:'outdoor' },
      { id:'l3', time:'19:30', name:'Tasca do Chico', sub:'Alfama · Traditional fado dinner', desc:'Family-run tasca with live fado Tue/Wed.', tags:[{l:'🍽️ Dinner',c:'tag-food'},{l:'~€25/person',c:'tag-price'},{l:'🎵 Fado',c:'tag-sight'},{l:'🏠 Indoor',c:'tag-indoor'}], tips:['Reserve corner table','Try bacalhau com broa'], lat:38.7107, lng:-9.1321, indoor:true, type:'dining' }
    ],
    [
      { id:'l4', time:'09:00', name:"Pastéis de Belém", sub:'Belém · Original pastel de nata', desc:'Queue moves fast. Cinnamon-dusted custard tarts.', tags:[{l:'🥐 Breakfast',c:'tag-food'},{l:'€1.30 each',c:'tag-price'},{l:'🏠 Indoor',c:'tag-indoor'}], tips:['Sit inside — 18th century tiled walls'], lat:38.6972, lng:-9.2035, indoor:true, type:'dining' },
      { id:'l5', time:'11:00', name:'Jerónimos Monastery', sub:'Belém · UNESCO Manueline', desc:'One of the most beautiful buildings in Portugal.', tags:[{l:'🏛️ UNESCO',c:'tag-sight'},{l:'€10 / Free Sun',c:'tag-price'},{l:'🌤️ Outdoor',c:'tag-outdoor'}], tips:['Free Sunday before 2pm','Go early'], lat:38.6979, lng:-9.2046, indoor:false, type:'sightseeing' },
      { id:'l6', time:'14:00', name:'LX Factory Market', sub:'Alcântara · Hidden gem', desc:"Converted 19th-century industrial complex.", tags:[{l:'🛍️ Shopping',c:'tag-sight'},{l:'Hidden gem',c:'tag-gem'},{l:'🌤️ Outdoor',c:'tag-outdoor'}], tips:['Bookshop on 2nd floor','Sunday only'], lat:38.7031, lng:-9.1786, indoor:false, type:'outdoor' }
    ],
    [
      { id:'l7', time:'09:30', name:'Train to Sintra', sub:'Rossio → Sintra · 40 min', desc:'Scenic train to the fairy-tale mountain town.', tags:[{l:'🚂 Train',c:'tag-sight'},{l:'€2.25',c:'tag-price'}], tips:['Buy combo ticket online'], lat:38.7978, lng:-9.3897, indoor:true, type:'transport' },
      { id:'l8', time:'11:00', name:'Pena Palace', sub:'Sintra · Hilltop palace', desc:'Most photogenic palace in Portugal.', tags:[{l:'🏰 UNESCO',c:'tag-sight'},{l:'€14',c:'tag-price'},{l:'🌤️ Outdoor',c:'tag-outdoor'}], tips:['Book online — sells out in summer'], lat:38.7876, lng:-9.3902, indoor:false, type:'sightseeing' }
    ],
    [
      { id:'l9', time:'08:30', name:'Linha do Douro Train', sub:'Porto → Régua · Scenic', desc:"One of Europe's most beautiful rail journeys.", tags:[{l:'🚂 Scenic',c:'tag-sight'},{l:'€12',c:'tag-price'}], tips:['Sit on right — river views'], lat:41.1579, lng:-8.2975, indoor:true, type:'transport' },
      { id:'l10', time:'13:00', name:'Quinta do Crasto', sub:'Douro Valley · Wine tasting', desc:'Award-winning quinta. 4 wines with charcuterie.', tags:[{l:'🍷 Wine',c:'tag-food'},{l:'€25/person',c:'tag-price'}], tips:['Try Touriga Nacional'], lat:41.1300, lng:-7.5800, indoor:true, type:'dining' }
    ],
    [
      { id:'l11', time:'11:00', name:'Mercado da Ribeira', sub:"Cais do Sodré · Food market", desc:"Lisbon's famous food hall.", tags:[{l:'🥘 Market',c:'tag-food'},{l:'€5–15',c:'tag-price'},{l:'🏠 Indoor',c:'tag-indoor'}], tips:['Go Tuesday morning'], lat:38.7065, lng:-9.1453, indoor:true, type:'dining' },
      { id:'l12', time:'14:00', name:'Bairro Alto', sub:'Bairro Alto · Culture + nightlife', desc:'Vintage shops, concept stores, galleries.', tags:[{l:'🎭 Culture',c:'tag-sight'},{l:'🌤️ Outdoor',c:'tag-outdoor'}], tips:['Embaixada — palace concept store'], lat:38.7130, lng:-9.1465, indoor:false, type:'outdoor' }
    ]
  ]
};
