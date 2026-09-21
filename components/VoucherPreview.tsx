
import React from 'react';
import { Reservation, TourLeg } from '../types';
import { Logo } from '../constants';
import { getGoogleMapsLink } from '../utils';

export type Language = 'es' | 'en';

interface VoucherPreviewProps {
  reservation: Reservation;
  pdfSingleTourIndex?: number | null; // null = show all, 0 = primary tour, 1+ = extra tours
  language?: Language;
  id?: string;
  className?: string;
}

const TRANSLATIONS = {
  es: {
    title: "Voucher de Confirmación",
    resNo: "Número de Reserva",
    leadName: "Pasajero Principal / Lead Name",
    service: "Servicio",
    subtype: "Sub-tipo",
    various: "Varios",
    pax: "Pasajeros (PAX)",
    arrivalLeg: "Tramo de Llegada",
    departureLeg: "Tramo de Salida",
    transferLeg: "Servicio de Traslado",
    tourLeg: "Información del Tour",
    name: "Nombre",
    meetingPoint: "Punto Encuentro",
    destination: "Hotel/Destino",
    date: "Fecha",
    timeEst: "Hora Est.",
    flight: "Vuelo/Aerolínea",
    pickup: "Recolección (Pick-up)",
    to: "Hacia",
    pickupHotel: "Pick-up Hotel",
    flightTime: "Hora de Vuelo",
    excursion: "Excursión",
    type: "Tipo",
    from: "Desde",
    until: "Hasta",
    startTime: "Hora Inicio",
    returnTime: "Hora Regreso",
    extraLeg: "Tramo Extra",
    balanceService: "Balance del Servicio",
    totalMXN: "Total MXN",
    totalUSD: "Total USD",
    deposit: "Depósito",
    toPay: "A Pagar",
    directPayment: "Pago Directo al Chofer",
    travelInstructions: "Instrucciones de Viaje",
    instructionArrival: "LLEGADAS: El chofer le espera afuera de la terminal con su nombre.",
    instructionPickup: "PICK-UPS: Estar listo 10 minutos antes en el lobby u origen.",
    instructionAssistance: "ASISTENCIA: +52 998 131 7824 (Atención 24/7).",
    generalNotes: "Notas Generales",
    tourNotes: "Notas Tour",
    tips: "La propina para el personal de servicio no está incluida y queda a su discreción.",
    room: "Habitación",
    support: "Soporte",
    system: "SISTEMA DE GESTIÓN V5.0",
    circuitoLeg: "Información del Circuito",
    unitType: "Tipo de Unidad",
    included: "Incluye",
    notIncluded: "No Incluye",
    day: "Día",
    placesToVisit: "Puntos a visitar",
    schedule: "Horario",
    entranceCosts: "Costo de Entradas (Aprox)",
    pricePerDay: "Precio por Día",
  },
  en: {
    title: "Confirmation Voucher",
    resNo: "Reservation Number",
    leadName: "Lead Passenger",
    service: "Service",
    subtype: "Subtype",
    various: "Various",
    pax: "Passengers (PAX)",
    arrivalLeg: "Arrival Leg",
    departureLeg: "Departure Leg",
    transferLeg: "Transfer Service",
    tourLeg: "Tour Information",
    name: "Name",
    meetingPoint: "Meeting Point",
    destination: "Hotel/Destination",
    date: "Date",
    timeEst: "Est. Time",
    flight: "Flight/Airline",
    pickup: "Pick-up Point",
    to: "To",
    pickupHotel: "Hotel Pick-up",
    flightTime: "Flight Time",
    excursion: "Excursion",
    type: "Type",
    from: "From",
    until: "To",
    startTime: "Start Time",
    returnTime: "Return Time",
    extraLeg: "Extra Leg",
    balanceService: "Service Balance",
    totalMXN: "Total MXN",
    totalUSD: "Total USD",
    deposit: "Deposit",
    toPay: "To Pay",
    directPayment: "Payment to Driver",
    travelInstructions: "Travel Instructions",
    instructionArrival: "ARRIVALS: Driver will meet you outside the terminal with a sign.",
    instructionPickup: "PICK-UPS: Please be ready 10 mins before at lobby/origin.",
    instructionAssistance: "ASSISTANCE: +52 998 131 7824 (24/7 Support).",
    generalNotes: "General Notes",
    tourNotes: "Tour Notes",
    tips: "Tips are not included and are at your discretion.",
    room: "Room Number",
    support: "Support",
    system: "MANAGEMENT SYSTEM V5.0",
    circuitoLeg: "Circuit Information",
    unitType: "Unit Type",
    included: "Included",
    notIncluded: "Not Included",
    day: "Day",
    placesToVisit: "Places to Visit",
    schedule: "Schedule",
    entranceCosts: "Entrance Costs (Approx)",
    pricePerDay: "Price per Day"
  }
};

const VALUE_MAP: Record<string, string> = {
  "Llegada y Salida": "Arrival & Departure",
  "Solo Llegada": "Arrival Only",
  "Solo Salida": "Departure Only",
  "Solo Traslado": "Transfer Only",
  "Tour o Excursión": "Tour or Excursion",
  "Circuito": "Circuit",
  "Traslado Sencillo": "One Way",
  "Traslado Redondo": "Round Trip",
  "Traslado Múltiple": "Multiple Legs",
  "Tour Compartido": "Shared Tour",
  "Tour Privado": "Private Tour"
};

const VoucherPreview: React.FC<VoucherPreviewProps> = ({ reservation, pdfSingleTourIndex = null, language = 'es', id = 'voucher-to-print', className = '' }) => {
  const isPdfMode = pdfSingleTourIndex !== null;
  const showArrival = !isPdfMode && (reservation.serviceType === "Llegada y Salida" || reservation.serviceType === "Solo Llegada");
  const showDeparture = !isPdfMode && (reservation.serviceType === "Llegada y Salida" || reservation.serviceType === "Solo Salida");
  const showTransfer = !isPdfMode && (reservation.serviceType === "Solo Traslado");
  const showTour = reservation.serviceType === "Tour o Excursión";
  const showCircuito = reservation.serviceType === "Circuito";
  
  const t = TRANSLATIONS[language];

  const tr = (val: string | undefined | null) => {
    if (!val) return '---';
    if (language === 'es') return val;
    return VALUE_MAP[val] || val;
  };

  const getDisplayTour = (index: number) => {
    if (index === 0) {
      return {
        name: reservation.tourName,
        type: reservation.tourType,
        origin: reservation.originDeparture,
        pax: reservation.peopleCountDeparture,
        time: reservation.departureTimeHotel,
        date: reservation.dateDeparture,
        obs: reservation.observations
      };
    } else {
      const leg = reservation.extraTours?.[index - 1];
      return {
        name: leg?.tourName,
        type: leg?.tourType,
        origin: leg?.originDeparture,
        pax: leg?.peopleCountDeparture,
        time: leg?.departureTimeHotel,
        date: leg?.dateDeparture,
        obs: leg?.observations
      };
    }
  };

  const toursToRender = isPdfMode 
    ? [getDisplayTour(pdfSingleTourIndex!)]
    : [getDisplayTour(0), ...(reservation.extraTours?.map((_, i) => getDisplayTour(i + 1)) || [])];

  return (
    <div className={`bg-white p-4 md:p-8 shadow-2xl border border-gray-200 max-w-[800px] mx-auto overflow-hidden relative print:shadow-none print:p-4 print:border-none print:max-w-full ${className}`} id={id}>
      {/* Brand Top Accent */}
      <div className="absolute top-0 left-0 w-full h-1 bg-[#0a305e]"></div>
      
      {/* Background Watermark */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.015] pointer-events-none select-none rotate-[-35deg] z-0">
        <div className="border-[15px] border-[#0a305e] text-[#0a305e] font-black text-[100px] p-16 rounded-[80px] uppercase tracking-tighter">
          QUICK TRAVEL
        </div>
      </div>

      {/* 1. Header Section */}
      <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100 relative z-10">
        <div className="flex items-center gap-4">
          <Logo height="h-10" />
          <div className="h-10 w-px bg-gray-200 mx-2"></div>
          <h1 className="text-xl font-black text-[#0a305e] uppercase tracking-tighter leading-none">{t.title}</h1>
        </div>
        <div className="text-right">
          <p className="text-[7px] text-gray-400 uppercase font-black tracking-widest leading-none mb-1">{t.resNo}</p>
          <p className="text-2xl font-mono font-black text-[#f05a28] tracking-tighter leading-none">
            {reservation.reservationNo}{isPdfMode ? `-${pdfSingleTourIndex! + 1}` : ''}
          </p>
        </div>
      </div>

      {/* 2. Main Content Grid */}
      <div className="grid grid-cols-12 gap-6 relative z-10">
        
        {/* LEFT COLUMN: Itinerary & Details */}
        <div className="col-span-12 md:col-span-7 space-y-4">
          
          {/* Lead Passenger Info */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-between items-center shadow-sm">
            <div className="flex-1">
              <DetailRow label={t.leadName} value={reservation.name} size="large" />
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge label={t.service} value={tr(reservation.serviceType)} color="blue" />
                {showTransfer && reservation.transferSubtype && <Badge label={t.subtype} value={tr(reservation.transferSubtype)} color="orange" />}
                {showTour && <Badge label={t.various} value={`${toursToRender.length} Tour(s)`} color="purple" />}
              </div>
            </div>
            <div className="text-right border-l border-slate-200 pl-4 ml-4 min-w-[80px] flex flex-col gap-1">
               <DetailRow label={t.pax} value={reservation.peopleCount} size="large" highlight />
               {reservation.roomNumber && (
                 <div className="pt-1 border-t border-slate-100">
                   <DetailRow label={t.room} value={reservation.roomNumber} highlight />
                 </div>
               )}
            </div>
          </div>

          {/* Service Sections */}
          <div className="space-y-4">
            {showArrival && (
              <div className="bg-white p-3 rounded-xl border border-green-50 shadow-sm">
                <SectionHeader label={t.arrivalLeg} icon="fa-plane-arrival" color="green" />
                <div className="grid grid-cols-2 gap-y-2 gap-x-4 mt-3">
                  <DetailRow label={t.name} value={reservation.arrivalName} className="col-span-2" highlight />
                  <DetailRow label={t.meetingPoint} value={reservation.origin} />
                  <DetailRow label={t.destination} value={reservation.arrivalDestination} isLink />
                  <DetailRow label={t.date} value={reservation.dateArrival} />
                  <DetailRow label={t.timeEst} value={reservation.arrivalTime} />
                  <DetailRow label={t.flight} value={`${reservation.airlineArrival} ${reservation.flightNoArrival}`} />
                  <DetailRow label={t.pax} value={reservation.peopleCountArrival} highlight />
                </div>
              </div>
            )}

            {showDeparture && (
              <div className="bg-white p-3 rounded-xl border border-orange-50 shadow-sm">
                <SectionHeader label={t.departureLeg} icon="fa-plane-departure" color="orange" />
                <div className="grid grid-cols-2 gap-y-2 gap-x-4 mt-3">
                  <DetailRow label={t.name} value={reservation.departureName || reservation.name} className="col-span-2" highlight />
                  <DetailRow label={t.pickup} value={reservation.originDeparture} isLink />
                  <DetailRow label={t.to} value={reservation.departureDestination} />
                  <DetailRow label={t.date} value={reservation.dateDeparture} />
                  <DetailRow label={t.pickupHotel} value={reservation.departureTimeHotel} className="text-[#f05a28]" highlight />
                  <DetailRow label={t.flightTime} value={reservation.departureTimeFlight} />
                  <DetailRow label={t.pax} value={reservation.peopleCountDeparture || reservation.peopleCount} highlight />
                </div>
              </div>
            )}

            {showTour && toursToRender.map((tour, idx) => (
              <div key={idx} className={`bg-white p-3 rounded-xl border border-purple-50 shadow-sm ${idx > 0 ? 'mt-3' : ''}`}>
                <SectionHeader label={toursToRender.length > 1 ? `Tour ${idx + 1}` : t.tourLeg} icon="fa-mountain" color="purple" />
                <div className="grid grid-cols-2 gap-y-2 gap-x-4 mt-3">
                  <DetailRow label={t.excursion} value={tour.name || '---'} highlight className="col-span-2" />
                  <DetailRow label={t.meetingPoint} value={tour.origin} isLink />
                  <DetailRow label={t.pickup} value={tour.time} className="text-purple-700 font-black" highlight />
                  <DetailRow label={t.date} value={tour.date} />
                  <DetailRow label={t.type} value={tr(tour.type)} />
                  <DetailRow label={t.pax} value={tour.pax || reservation.peopleCount} highlight />
                </div>
                {tour.obs && (
                   <div className="mt-2 bg-purple-50/20 p-2 rounded-lg border border-purple-100/50">
                      <span className="text-[6px] font-black uppercase text-purple-400">{t.tourNotes}:</span>
                      <p className="text-[8px] text-slate-600 leading-tight">{tour.obs}</p>
                   </div>
                )}
              </div>
            ))}

            {showTransfer && (
              <div className="bg-white p-3 rounded-xl border border-blue-50 shadow-sm">
                <SectionHeader label={t.transferLeg} icon="fa-exchange-alt" color="blue" />
                <div className="grid grid-cols-2 gap-y-2 gap-x-4 mt-3">
                  <DetailRow label={t.name} value={reservation.departureName || reservation.name} className="col-span-2" highlight />
                  <DetailRow label={t.from} value={reservation.originDeparture} isLink />
                  <DetailRow label={t.until} value={reservation.departureDestination} />
                  <DetailRow label={t.date} value={reservation.dateDeparture} />
                  <DetailRow label={t.startTime} value={reservation.departureTimeHotel} className="text-blue-700 font-black" highlight />
                  <DetailRow label={t.returnTime} value={reservation.departureTimeFlight} />
                  <DetailRow label={t.pax} value={reservation.peopleCountDeparture || reservation.peopleCount} highlight />
                </div>
                {reservation.transferSubtype === "Traslado Múltiple" && reservation.extraLegs && reservation.extraLegs.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                     {reservation.extraLegs.map((leg, i) => (
                       <div key={leg.id} className="grid grid-cols-2 gap-x-2 gap-y-1 text-[9px] bg-slate-50/50 p-2 rounded-lg">
                         <span className="font-bold uppercase text-gray-400 col-span-2 text-[7px]">{t.extraLeg} #{i+1}</span>
                         <DetailRow label={t.from} value={leg.origin} />
                         <DetailRow label={t.until} value={leg.destination} />
                         <DetailRow label={t.startTime} value={leg.startTime} />
                         <DetailRow label={t.pax} value={leg.pax} />
                       </div>
                     ))}
                  </div>
                )}
              </div>
            )}

            {showCircuito && (
              <div className="bg-white p-3 rounded-xl border border-green-50 shadow-sm">
                <SectionHeader label={t.circuitoLeg} icon="fa-route" color="green" />
                <div className="grid grid-cols-2 gap-y-2 gap-x-4 mt-3">
                  <DetailRow label={t.name} value={reservation.departureName || reservation.name} className="col-span-2" highlight />
                  <DetailRow label={t.unitType} value={reservation.unitType} />
                  <DetailRow label={t.pax} value={reservation.peopleCountDeparture || reservation.peopleCount} highlight />
                  <DetailRow label={t.date} value={reservation.dateDeparture} />
                </div>
                
                {(reservation.includedThings || reservation.notIncludedThings) && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {reservation.includedThings && (
                      <div className="bg-green-50/50 p-2 rounded-lg border border-green-100/50">
                        <span className="text-[6px] font-black uppercase text-green-600">{t.included}:</span>
                        <p className="text-[8px] text-slate-600 leading-tight whitespace-pre-wrap">{reservation.includedThings}</p>
                      </div>
                    )}
                    {reservation.notIncludedThings && (
                      <div className="bg-red-50/50 p-2 rounded-lg border border-red-100/50">
                        <span className="text-[6px] font-black uppercase text-red-600">{t.notIncluded}:</span>
                        <p className="text-[8px] text-slate-600 leading-tight whitespace-pre-wrap">{reservation.notIncludedThings}</p>
                      </div>
                    )}
                  </div>
                )}

                {reservation.circuitoLegs && reservation.circuitoLegs.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                     {reservation.circuitoLegs.map((leg, i) => (
                       <div key={leg.id} className="grid grid-cols-2 gap-x-2 gap-y-1 text-[9px] bg-slate-50/50 p-2 rounded-lg">
                         <span className="font-bold uppercase text-green-600 col-span-2 text-[7px]">{t.day} #{i+1}</span>
                         <DetailRow label={t.date} value={leg.date} />
                         <DetailRow label={t.schedule} value={leg.schedule} />
                         {leg.pricePerDay && <DetailRow label={t.pricePerDay} value={leg.pricePerDay} highlight className="col-span-2" />}
                         <DetailRow label={t.placesToVisit} value={leg.placesToVisit} className="col-span-2" />
                         <DetailRow label={t.entranceCosts} value={leg.entranceCosts} className="col-span-2" />
                         {leg.observations && (
                           <div className="col-span-2 bg-green-50/30 p-1.5 rounded border border-green-100/50 mt-1">
                             <span className="text-[6px] font-black uppercase text-green-600 block">Observaciones:</span>
                             <p className="text-[8px] text-slate-700 leading-tight italic">{leg.observations}</p>
                           </div>
                         )}
                       </div>
                     ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Financials & Instructions */}
        <div className="col-span-12 md:col-span-5 space-y-4">
          
          {/* Financial Summary */}
          <div className="bg-white rounded-xl border-2 border-slate-100 p-4 space-y-3 shadow-sm">
            <h4 className="text-[9px] font-black uppercase tracking-widest text-gray-800 border-b border-gray-50 pb-1.5 flex items-center gap-2">
              <i className="fas fa-wallet text-slate-400"></i> {t.balanceService}
            </h4>
            <div className="grid grid-cols-2 gap-4">
              {/* MXN Column */}
              <div className="space-y-2">
                <p className="text-[7px] font-black uppercase text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded inline-block">MXN</p>
                <div>
                  <span className="text-[7px] font-bold text-gray-400 uppercase block">{t.deposit}</span>
                  <span className="text-base font-black text-slate-800 tracking-tighter">${reservation.depositMxn}</span>
                </div>
                <div>
                  <span className="text-[7px] font-bold text-gray-400 uppercase block">{t.toPay}</span>
                  <span className="text-lg font-black text-[#f05a28] tracking-tighter">${reservation.toPayMxn}</span>
                </div>
              </div>
              
              {/* USD Column */}
              <div className="space-y-2 border-l border-gray-50 pl-4">
                <p className="text-[7px] font-black uppercase text-green-600 bg-green-50 px-1.5 py-0.5 rounded inline-block">USD</p>
                <div>
                  <span className="text-[7px] font-bold text-gray-400 uppercase block">{t.deposit}</span>
                  <span className="text-base font-black text-slate-800 tracking-tighter">${reservation.depositUsd}</span>
                </div>
                <div>
                  <span className="text-[7px] font-bold text-gray-400 uppercase block">{t.toPay}</span>
                  <span className="text-lg font-black text-[#f05a28] tracking-tighter">${reservation.toPayUsd}</span>
                </div>
              </div>
            </div>
            
            <div className="pt-1.5 border-t border-gray-50 flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse"></div>
              <span className="text-[8px] font-black text-orange-600 uppercase italic leading-none">{t.directPayment}</span>
            </div>
          </div>

          {/* Travel Instructions */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <h4 className="text-[9px] font-black uppercase text-[#0a305e] mb-2">{t.travelInstructions}</h4>
            <ul className="space-y-2 text-[8px] font-bold text-slate-600 leading-tight">
              <li className="flex gap-2">
                <i className="fas fa-info-circle text-[#0a305e] mt-0.5 shrink-0"></i>
                <span>{t.instructionArrival}</span>
              </li>
              <li className="flex gap-2">
                <i className="fas fa-clock text-[#0a305e] mt-0.5 shrink-0"></i>
                <span>{t.instructionPickup}</span>
              </li>
              <li className="flex gap-2">
                <i className="fas fa-user-friends text-[#0a305e] mt-0.5 shrink-0"></i>
                <span>{t.instructionAssistance}</span>
              </li>
            </ul>
          </div>

          {/* General Notes */}
          {reservation.observations && (
            <div className="bg-yellow-50/50 p-3 rounded-xl border border-yellow-100">
              <span className="block text-[7px] text-yellow-700 uppercase font-black mb-1">{t.generalNotes}</span>
              <p className="text-[8px] text-gray-700 font-medium italic leading-relaxed">"{reservation.observations}"</p>
            </div>
          )}

          {/* Tips Notice */}
          <div className="p-3 border-l-4 border-red-500 bg-red-50/30 rounded-r-lg">
             <p className="text-[7px] text-red-700 font-black uppercase leading-tight">
               {t.tips}
             </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 pt-3 border-t border-gray-100 flex justify-between items-center relative z-10">
        <div className="flex items-center gap-3 text-[7px] text-gray-400 font-black uppercase tracking-[0.15em]">
          <span>© Quick Travel Cancun</span>
          <span className="w-0.5 h-0.5 bg-gray-200 rounded-full"></span>
          <span>{t.support}: quicktravelincancun@gmail.com</span>
        </div>
        <div className="text-[7px] text-[#0a305e] font-black uppercase tracking-[0.15em]">
          {t.system}
        </div>
      </div>
    </div>
  );
};

const DetailRow: React.FC<{ label: string; value: string | number | undefined | null; isLink?: boolean; className?: string; size?: 'normal' | 'large'; highlight?: boolean }> = ({ label, value, isLink, className, size = 'normal', highlight = false }) => {
  const displayValue = (value !== undefined && value !== null && value !== '') ? value : '---';
  
  return (
    <div className={className}>
      <span className="block text-[6px] text-gray-400 uppercase font-black tracking-widest mb-0.5">{label}</span>
      {isLink && displayValue !== '---' ? (
        <a 
          href={getGoogleMapsLink(String(displayValue))} 
          target="_blank" 
          rel="noopener noreferrer"
          className={`text-blue-600 font-black hover:text-blue-800 transition-colors flex items-center gap-1 ${size === 'large' ? 'text-base' : 'text-[10px]'}`}
        >
          <span className="truncate">{displayValue}</span>
          <i className="fas fa-map-marker-alt text-[7px] opacity-40"></i>
        </a>
      ) : (
        <span className={`text-gray-900 font-black tracking-tight ${size === 'large' ? 'text-lg' : 'text-[10px]'} ${highlight ? 'text-[#f05a28]' : ''}`}>
          {displayValue}
        </span>
      )}
    </div>
  );
};

const SectionHeader: React.FC<{ label: string; icon: string; color: string }> = ({ label, icon, color }) => {
  const colorMap: Record<string, string> = {
    green: "bg-green-50 text-green-600 border-green-100",
    orange: "bg-orange-50 text-orange-600 border-orange-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    purple: "bg-purple-50 text-purple-700 border-purple-100"
  };
  return (
    <div className="flex items-center gap-2 border-b border-gray-50 pb-1.5">
      <div className={`w-6 h-6 ${colorMap[color]} border rounded-md flex items-center justify-center text-xs`}>
        <i className={`fas ${icon}`}></i>
      </div>
      <h3 className="text-[9px] font-black text-gray-800 uppercase tracking-widest">{label}</h3>
    </div>
  );
};

const Badge: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    orange: "bg-orange-50 text-orange-700 border-orange-100",
    purple: "bg-purple-50 text-purple-700 border-purple-100"
  };
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${colorMap[color]} shadow-sm`}>
      <span className="text-[6px] uppercase font-black opacity-50">{label}:</span>
      <span className="text-[8px] font-black uppercase whitespace-nowrap">{value}</span>
    </div>
  );
};

export default VoucherPreview;
