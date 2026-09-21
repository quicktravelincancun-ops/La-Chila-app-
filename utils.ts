
import { Reservation } from './types';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export const getWhatsAppLink = (number: string, message: string) => {
  const numberClean = number.replace(/\D/g, '');
  return `https://wa.me/${numberClean}?text=${encodeURIComponent(message)}`;
};

export const getGoogleMapsLink = (query: string) => {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
};

export const generateWhatsAppMessage = (res: Reservation) => {
  const showArrival = res.serviceType === "Llegada y Salida" || res.serviceType === "Solo Llegada";
  const showDeparture = res.serviceType === "Llegada y Salida" || res.serviceType === "Solo Salida";
  const showTransfer = res.serviceType === "Solo Traslado";
  const showTour = res.serviceType === "Tour o Excursión";
  const showCircuito = res.serviceType === "Circuito";

  let msg = `*QUICK TRAVEL CANCUN - VOUCHER OFICIAL*\n`;
  msg += `*Servicio:* ${res.serviceType}${res.transferSubtype ? ` (${res.transferSubtype})` : ''}\n`;
  msg += `----------------------------------\n`;
  msg += `*Reserva:* ${res.reservationNo}\n`;
  msg += `*Titular:* ${res.name}\n\n`;

  if (showArrival) {
    msg += `*LLEGADA:*\n`;
    msg += `📍 Origen: ${res.origin}\n`;
    msg += `🏨 Destino: ${res.arrivalDestination}\n`;
    msg += `📅 Fecha: ${res.dateArrival}\n`;
    msg += `✈️ Vuelo: ${res.flightNoArrival}\n`;
    msg += `🕒 Hora: ${res.arrivalTime}\n`;
    msg += `👤 Pax: ${res.peopleCountArrival}\n\n`;
  }

  if (showDeparture) {
    msg += `*SALIDA:*\n`;
    msg += `📍 Origen: ${res.originDeparture}\n`;
    msg += `🏨 Destino: ${res.departureDestination}\n`;
    msg += `📅 Fecha: ${res.dateDeparture}\n`;
    msg += `🚐 *Pick-up:* ${res.departureTimeHotel}\n`;
    msg += `✈️ Vuelo: ${res.departureTimeFlight}\n`;
    msg += `👤 Pax: ${res.peopleCountDeparture}\n\n`;
  }

  if (showTransfer) {
    msg += `*TRASLADO:*\n`;
    msg += `📍 Origen: ${res.originDeparture}\n`;
    msg += `🏨 Destino: ${res.departureDestination}\n`;
    msg += `📅 Fecha: ${res.dateDeparture}\n`;
    msg += `🕒 *Hora Inicio:* ${res.departureTimeHotel}\n`;
    msg += `🕒 *Hora Regreso:* ${res.departureTimeFlight}\n`;
    msg += `👤 Pax: ${res.peopleCountDeparture}\n\n`;

    if (res.transferSubtype === "Traslado Múltiple" && res.extraLegs && res.extraLegs.length > 0) {
      msg += `*TRAMOS ADICIONALES:*\n`;
      res.extraLegs.forEach((leg, i) => {
        msg += `[${i+1}] 📍 ${leg.origin} -> 🏨 ${leg.destination}\n`;
        msg += `📅 ${leg.date} | 🕒 ${leg.startTime} - ${leg.returnTime} | 👤 Pax: ${leg.pax}\n\n`;
      });
    }
  }

  if (showTour) {
    msg += `*TOUR / EXCURSIÓN 1:*\n`;
    msg += `🌟 *Tour:* ${res.tourName || '---'}\n`;
    msg += `📋 Tipo: ${res.tourType || '---'}\n`;
    msg += `📍 Hotel/Punto: ${res.originDeparture}\n`;
    msg += `📅 Fecha: ${res.dateDeparture}\n`;
    msg += `🚐 *Pick-up:* ${res.departureTimeHotel}\n`;
    msg += `👤 Pax: ${res.peopleCountDeparture}\n\n`;

    if (res.extraTours && res.extraTours.length > 0) {
      res.extraTours.forEach((tour, i) => {
        msg += `*TOUR / EXCURSIÓN ${i + 2}:*\n`;
        msg += `🌟 *Tour:* ${tour.tourName || '---'}\n`;
        msg += `📋 Tipo: ${tour.tourType || '---'}\n`;
        msg += `📍 Hotel/Punto: ${tour.originDeparture}\n`;
        msg += `📅 Fecha: ${tour.dateDeparture}\n`;
        msg += `🚐 *Pick-up:* ${tour.departureTimeHotel}\n`;
        msg += `👤 Pax: ${tour.peopleCountDeparture}\n`;
        if (tour.observations) {
          msg += `📝 Observaciones: ${tour.observations}\n`;
        }
        msg += `\n`;
      });
    }
  }

  if (showCircuito) {
    msg += `*CIRCUITO:*\n`;
    msg += `🚐 Tipo de Unidad: ${res.unitType || '---'}\n`;
    msg += `👤 Pax: ${res.peopleCountDeparture}\n`;
    msg += `📅 Fecha Inicio: ${res.dateDeparture}\n\n`;

    if (res.includedThings) {
      msg += `✅ *Incluye:*\n${res.includedThings}\n\n`;
    }
    if (res.notIncludedThings) {
      msg += `❌ *No Incluye:*\n${res.notIncludedThings}\n\n`;
    }

    if (res.circuitoLegs && res.circuitoLegs.length > 0) {
      msg += `*ITINERARIO:*\n`;
      res.circuitoLegs.forEach((leg, i) => {
        msg += `*Día ${i + 1} - ${leg.date}*\n`;
        msg += `🕒 Horario: ${leg.schedule}\n`;
        if (leg.pricePerDay) {
          msg += `💵 Precio: ${leg.pricePerDay}\n`;
        }
        msg += `📍 Puntos a visitar: ${leg.placesToVisit}\n`;
        msg += `🎟️ Entradas: ${leg.entranceCosts}\n`;
        if (leg.observations) {
          msg += `📝 Observaciones: ${leg.observations}\n`;
        }
        msg += `\n`;
      });
    }
  }

  if (res.observations) {
    msg += `📝 Notas: ${res.observations}\n\n`;
  }

  msg += `*SALDOS MXN:*\n`;
  msg += `💰 Depósito: $${res.depositMxn}\n`;
  msg += `💵 A Pagar: $${res.toPayMxn}\n\n`;

  msg += `*SALDOS USD:*\n`;
  msg += `💰 Deposit: $${res.depositUsd}\n`;
  msg += `💵 To Pay: $${res.toPayUsd}\n\n`;

  msg += `_Propina no incluida. ¡Buen viaje!_`;

  return msg.trim();
};

export const downloadAsDataUriPDF = async (
  elementIdOrElement: string | HTMLElement, 
  filename: string
): Promise<boolean> => {
  const element = typeof elementIdOrElement === 'string' 
    ? document.getElementById(elementIdOrElement) 
    : elementIdOrElement;

  if (!element) {
    console.error('downloadAsDataUriPDF: Elemento no encontrado:', elementIdOrElement);
    return false;
  }
  
  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: 0,
      windowWidth: document.documentElement.offsetWidth,
      onclone: (_clonedDoc, clonedEl) => {
        clonedEl.style.maxHeight = 'none';
        clonedEl.style.overflow = 'visible';
        clonedEl.style.height = 'auto';
        clonedEl.style.transform = 'none';
      }
    });
    
    const imgData = canvas.toDataURL('image/png', 1.0);
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const maxLineWidth = pdfWidth - (margin * 2);
    const maxHeight = pdfHeight - (margin * 2);
    
    const imgProps = pdf.getImageProperties(imgData);
    const ratio = imgProps.width / imgProps.height;
    
    let displayWidth = maxLineWidth;
    let displayHeight = displayWidth / ratio;
    
    if (displayHeight > maxHeight) {
      displayHeight = maxHeight;
      displayWidth = displayHeight * ratio;
    }
    
    const xOffset = (pdfWidth - displayWidth) / 2;
    const yOffset = margin;
    
    pdf.addImage(imgData, 'PNG', xOffset, yOffset, displayWidth, displayHeight);

    // Convertir estrictamente a Data URI application/pdf
    const rawDataUri = pdf.output('datauristring');
    const cleanDataUri = rawDataUri.startsWith('data:application/pdf')
      ? rawDataUri
      : 'data:application/pdf;base64,' + rawDataUri.split(',')[1];

    const safeFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;

    const a = document.createElement('a');
    a.href = cleanDataUri;
    a.download = safeFilename;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (document.body.contains(a)) {
        document.body.removeChild(a);
      }
    }, 1500);

    return true;
  } catch (error) {
    console.error('Error al generar PDF vía Data URI:', error);
    return false;
  }
};

// Alias compatible para llamadas existentes
export const downloadAsPDF = downloadAsDataUriPDF;

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
    printSaveBtn: "Imprimir / Guardar como PDF",
    downloadPdfBtn: "Descargar PDF (.pdf)",
    closeBtn: "Cerrar"
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
    pricePerDay: "Price per Day",
    printSaveBtn: "Print / Save as PDF",
    downloadPdfBtn: "Download PDF (.pdf)",
    closeBtn: "Close"
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

/**
 * Genera el documento HTML puro completo y estilizado para el Voucher
 * con barra de herramientas interactiva (window.print() y Data URI Download)
 */
export const generateVoucherHTML = (
  reservation: Reservation,
  language: 'es' | 'en' = 'es',
  pdfSingleTourIndex: number | null = null
): string => {
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

  const esc = (val: any): string => {
    if (val === undefined || val === null || val === '') return '---';
    const s = String(val);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

  const renderDetailRow = (
    label: string, 
    value: string | number | undefined | null, 
    isLink = false, 
    highlight = false, 
    size: 'normal' | 'large' = 'normal', 
    colSpan = 1
  ) => {
    const displayVal = esc(value);
    const linkUrl = isLink && displayVal !== '---' ? getGoogleMapsLink(String(value)) : null;
    return `
      <div class="${colSpan > 1 ? `col-span-${colSpan}` : ''}">
        <span class="block text-[6px] text-gray-400 uppercase font-black tracking-widest mb-0.5">${label}</span>
        ${linkUrl ? `
          <a href="${linkUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-600 font-black hover:text-blue-800 transition-colors flex items-center gap-1 ${size === 'large' ? 'text-base' : 'text-[10px]'}">
            <span class="truncate">${displayVal}</span>
            <i class="fas fa-map-marker-alt text-[7px] opacity-40"></i>
          </a>
        ` : `
          <span class="text-gray-900 font-black tracking-tight ${size === 'large' ? 'text-lg' : 'text-[10px]'} ${highlight ? 'text-[#f05a28]' : ''}">
            ${displayVal}
          </span>
        `}
      </div>
    `;
  };

  const filename = `Voucher_${reservation.reservationNo}${isPdfMode ? `_Tour_${pdfSingleTourIndex! + 1}` : ''}${language === 'en' ? '_EN' : ''}.pdf`;

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Voucher_${esc(reservation.reservationNo)}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm 6mm;
    }
    @media print {
      .no-print { display: none !important; }
      body { background: white !important; margin: 0 !important; padding: 0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      #voucher-card { box-shadow: none !important; border: 1px solid #e2e8f0 !important; width: 100% !important; max-width: 100% !important; margin: 0 !important; }
    }
    body {
      background-color: #f8fafc;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
  </style>
</head>
<body class="min-h-screen text-slate-800 antialiased p-0 m-0">

  <!-- BARRA DE HERRAMIENTAS DESTACADA (OCULTA AL IMPRIMIR) -->
  <header class="no-print sticky top-0 z-50 bg-[#0a305e] text-white px-4 py-3 shadow-xl border-b border-blue-900 flex flex-wrap items-center justify-between gap-3">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-white shadow-inner">
        <i class="fas fa-file-invoice text-lg text-amber-400"></i>
      </div>
      <div>
        <h2 class="text-sm font-black uppercase tracking-tight text-white flex items-center gap-2">
          Voucher <span class="text-[#f05a28] font-mono">${esc(reservation.reservationNo)}${isPdfMode ? `-${pdfSingleTourIndex! + 1}` : ''}</span>
        </h2>
        <p class="text-[10px] text-blue-200 font-bold">${language === 'es' ? 'Quick Travel Cancún - Documento Oficial' : 'Quick Travel Cancun - Official Document'}</p>
      </div>
    </div>

    <!-- BOTONES DE ACCIÓN PRINCIPALES -->
    <div class="flex items-center gap-2.5 flex-wrap">
      <!-- 1. BOTÓN DESTACADO WINDOW.PRINT() -->
      <button 
        onclick="window.print()" 
        class="px-5 py-2.5 bg-[#f05a28] hover:bg-[#d94a1c] active:scale-95 text-white font-black text-xs uppercase rounded-xl shadow-lg shadow-orange-500/30 flex items-center gap-2 transition-all cursor-pointer"
        title="Abre el diálogo nativo para imprimir o guardar como PDF"
      >
        <i class="fas fa-print text-sm"></i>
        <span>${t.printSaveBtn}</span>
      </button>

      <!-- 2. BOTÓN DE DESCARGA DIRECTA VÍA DATA URI -->
      <button 
        id="btn-download-pdf" 
        onclick="generateAndDownloadPDF()" 
        class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs uppercase rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition-all cursor-pointer"
        title="Genera y descarga el archivo PDF en base64 Data URI"
      >
        <i class="fas fa-download text-sm"></i>
        <span id="btn-download-text">${t.downloadPdfBtn}</span>
      </button>

      <!-- BOTÓN CERRAR -->
      <button 
        onclick="window.close()" 
        class="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase rounded-xl transition-all cursor-pointer"
      >
        <i class="fas fa-times"></i> ${t.closeBtn}
      </button>
    </div>
  </header>

  <!-- CONTENEDOR PRINCIPAL DEL VOUCHER -->
  <main class="p-4 md:p-8 flex justify-center items-start">
    <div id="voucher-card" class="bg-white p-4 md:p-8 shadow-2xl border border-gray-200 max-w-[800px] w-full mx-auto overflow-hidden relative">
      <!-- Brand Top Accent -->
      <div class="absolute top-0 left-0 w-full h-1.5 bg-[#0a305e]"></div>
      
      <!-- Background Watermark -->
      <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.018] pointer-events-none select-none rotate-[-35deg] z-0">
        <div class="border-[15px] border-[#0a305e] text-[#0a305e] font-black text-[100px] p-16 rounded-[80px] uppercase tracking-tighter">
          QUICK TRAVEL
        </div>
      </div>

      <!-- 1. Header Section -->
      <div class="flex justify-between items-center mb-4 pb-3 border-b border-gray-100 relative z-10">
        <div class="flex items-center gap-4">
          <div class="flex items-center">
            <img 
              src="/input_file_3.png" 
              alt="Quick Travel Cancun Logo" 
              class="h-10 w-auto object-contain"
              onerror="this.onerror=null;this.parentElement.innerHTML='<span class=\\'font-black text-[#0a305e] text-xl uppercase tracking-tighter\\'>QUICK TRAVEL CANCUN</span>';"
            />
          </div>
          <div class="h-10 w-px bg-gray-200 mx-2"></div>
          <h1 class="text-xl font-black text-[#0a305e] uppercase tracking-tighter leading-none">${t.title}</h1>
        </div>
        <div class="text-right">
          <p class="text-[7px] text-gray-400 uppercase font-black tracking-widest leading-none mb-1">${t.resNo}</p>
          <p class="text-2xl font-mono font-black text-[#f05a28] tracking-tighter leading-none">
            ${esc(reservation.reservationNo)}${isPdfMode ? `-${pdfSingleTourIndex! + 1}` : ''}
          </p>
        </div>
      </div>

      <!-- 2. Main Content Grid -->
      <div class="grid grid-cols-12 gap-6 relative z-10">
        
        <!-- LEFT COLUMN: Itinerary & Details -->
        <div class="col-span-12 md:col-span-7 space-y-4">
          
          <!-- Lead Passenger Info -->
          <div class="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-between items-center shadow-sm">
            <div class="flex-1">
              ${renderDetailRow(t.leadName, reservation.name, false, false, 'large')}
              <div class="mt-2 flex flex-wrap gap-1.5">
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-100 shadow-sm">
                  <span class="text-[6px] uppercase font-black opacity-50">${t.service}:</span>
                  <span class="text-[8px] font-black uppercase whitespace-nowrap">${esc(tr(reservation.serviceType))}</span>
                </span>
                ${showTransfer && reservation.transferSubtype ? `
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-orange-50 text-orange-700 border-orange-100 shadow-sm">
                    <span class="text-[6px] uppercase font-black opacity-50">${t.subtype}:</span>
                    <span class="text-[8px] font-black uppercase whitespace-nowrap">${esc(tr(reservation.transferSubtype))}</span>
                  </span>
                ` : ''}
                ${showTour ? `
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-purple-50 text-purple-700 border-purple-100 shadow-sm">
                    <span class="text-[6px] uppercase font-black opacity-50">${t.various}:</span>
                    <span class="text-[8px] font-black uppercase whitespace-nowrap">${toursToRender.length} Tour(s)</span>
                  </span>
                ` : ''}
              </div>
            </div>
            <div class="text-right border-l border-slate-200 pl-4 ml-4 min-w-[80px] flex flex-col gap-1">
              ${renderDetailRow(t.pax, reservation.peopleCount, false, true, 'large')}
              ${reservation.roomNumber ? `
                <div class="pt-1 border-t border-slate-100">
                  ${renderDetailRow(t.room, reservation.roomNumber, false, true)}
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Service Sections -->
          <div class="space-y-4">
            ${showArrival ? `
              <div class="bg-white p-3 rounded-xl border border-green-50 shadow-sm">
                <div class="flex items-center gap-2 border-b border-gray-50 pb-1.5">
                  <div class="w-6 h-6 bg-green-50 text-green-600 border border-green-100 rounded-md flex items-center justify-center text-xs">
                    <i class="fas fa-plane-arrival"></i>
                  </div>
                  <h3 class="text-[9px] font-black text-gray-800 uppercase tracking-widest">${t.arrivalLeg}</h3>
                </div>
                <div class="grid grid-cols-2 gap-y-2 gap-x-4 mt-3">
                  ${renderDetailRow(t.name, reservation.arrivalName, false, true, 'normal', 2)}
                  ${renderDetailRow(t.meetingPoint, reservation.origin)}
                  ${renderDetailRow(t.destination, reservation.arrivalDestination, true)}
                  ${renderDetailRow(t.date, reservation.dateArrival)}
                  ${renderDetailRow(t.timeEst, reservation.arrivalTime)}
                  ${renderDetailRow(t.flight, `${reservation.airlineArrival || ''} ${reservation.flightNoArrival || ''}`.trim())}
                  ${renderDetailRow(t.pax, reservation.peopleCountArrival, false, true)}
                </div>
              </div>
            ` : ''}

            ${showDeparture ? `
              <div class="bg-white p-3 rounded-xl border border-orange-50 shadow-sm">
                <div class="flex items-center gap-2 border-b border-gray-50 pb-1.5">
                  <div class="w-6 h-6 bg-orange-50 text-orange-600 border border-orange-100 rounded-md flex items-center justify-center text-xs">
                    <i class="fas fa-plane-departure"></i>
                  </div>
                  <h3 class="text-[9px] font-black text-gray-800 uppercase tracking-widest">${t.departureLeg}</h3>
                </div>
                <div class="grid grid-cols-2 gap-y-2 gap-x-4 mt-3">
                  ${renderDetailRow(t.name, reservation.departureName || reservation.name, false, true, 'normal', 2)}
                  ${renderDetailRow(t.pickup, reservation.originDeparture, true)}
                  ${renderDetailRow(t.to, reservation.departureDestination)}
                  ${renderDetailRow(t.date, reservation.dateDeparture)}
                  ${renderDetailRow(t.pickupHotel, reservation.departureTimeHotel, false, true)}
                  ${renderDetailRow(t.flightTime, reservation.departureTimeFlight)}
                  ${renderDetailRow(t.pax, reservation.peopleCountDeparture || reservation.peopleCount, false, true)}
                </div>
              </div>
            ` : ''}

            ${showTour ? toursToRender.map((tour, idx) => `
              <div class="bg-white p-3 rounded-xl border border-purple-50 shadow-sm ${idx > 0 ? 'mt-3' : ''}">
                <div class="flex items-center gap-2 border-b border-gray-50 pb-1.5">
                  <div class="w-6 h-6 bg-purple-50 text-purple-700 border border-purple-100 rounded-md flex items-center justify-center text-xs">
                    <i class="fas fa-mountain"></i>
                  </div>
                  <h3 class="text-[9px] font-black text-gray-800 uppercase tracking-widest">${toursToRender.length > 1 ? `Tour ${idx + 1}` : t.tourLeg}</h3>
                </div>
                <div class="grid grid-cols-2 gap-y-2 gap-x-4 mt-3">
                  ${renderDetailRow(t.excursion, tour.name, false, true, 'normal', 2)}
                  ${renderDetailRow(t.meetingPoint, tour.origin, true)}
                  ${renderDetailRow(t.pickup, tour.time, false, true)}
                  ${renderDetailRow(t.date, tour.date)}
                  ${renderDetailRow(t.type, tr(tour.type))}
                  ${renderDetailRow(t.pax, tour.pax || reservation.peopleCount, false, true)}
                </div>
                ${tour.obs ? `
                  <div class="mt-2 bg-purple-50/20 p-2 rounded-lg border border-purple-100/50">
                    <span class="text-[6px] font-black uppercase text-purple-400">${t.tourNotes}:</span>
                    <p class="text-[8px] text-slate-600 leading-tight">${esc(tour.obs)}</p>
                  </div>
                ` : ''}
              </div>
            `).join('') : ''}

            ${showTransfer ? `
              <div class="bg-white p-3 rounded-xl border border-blue-50 shadow-sm">
                <div class="flex items-center gap-2 border-b border-gray-50 pb-1.5">
                  <div class="w-6 h-6 bg-blue-50 text-blue-700 border border-blue-100 rounded-md flex items-center justify-center text-xs">
                    <i class="fas fa-exchange-alt"></i>
                  </div>
                  <h3 class="text-[9px] font-black text-gray-800 uppercase tracking-widest">${t.transferLeg}</h3>
                </div>
                <div class="grid grid-cols-2 gap-y-2 gap-x-4 mt-3">
                  ${renderDetailRow(t.name, reservation.departureName || reservation.name, false, true, 'normal', 2)}
                  ${renderDetailRow(t.from, reservation.originDeparture, true)}
                  ${renderDetailRow(t.until, reservation.departureDestination)}
                  ${renderDetailRow(t.date, reservation.dateDeparture)}
                  ${renderDetailRow(t.startTime, reservation.departureTimeHotel, false, true)}
                  ${renderDetailRow(t.returnTime, reservation.departureTimeFlight)}
                  ${renderDetailRow(t.pax, reservation.peopleCountDeparture || reservation.peopleCount, false, true)}
                </div>
                ${reservation.transferSubtype === "Traslado Múltiple" && reservation.extraLegs && reservation.extraLegs.length > 0 ? `
                  <div class="mt-3 pt-3 border-t border-gray-100 space-y-2">
                    ${reservation.extraLegs.map((leg, i) => `
                      <div class="grid grid-cols-2 gap-x-2 gap-y-1 text-[9px] bg-slate-50/50 p-2 rounded-lg">
                        <span class="font-bold uppercase text-gray-400 col-span-2 text-[7px]">${t.extraLeg} #${i+1}</span>
                        ${renderDetailRow(t.from, leg.origin)}
                        ${renderDetailRow(t.until, leg.destination)}
                        ${renderDetailRow(t.startTime, leg.startTime)}
                        ${renderDetailRow(t.pax, leg.pax)}
                      </div>
                    `).join('')}
                  </div>
                ` : ''}
              </div>
            ` : ''}

            ${showCircuito ? `
              <div class="bg-white p-3 rounded-xl border border-green-50 shadow-sm">
                <div class="flex items-center gap-2 border-b border-gray-50 pb-1.5">
                  <div class="w-6 h-6 bg-green-50 text-green-600 border border-green-100 rounded-md flex items-center justify-center text-xs">
                    <i class="fas fa-route"></i>
                  </div>
                  <h3 class="text-[9px] font-black text-gray-800 uppercase tracking-widest">${t.circuitoLeg}</h3>
                </div>
                <div class="grid grid-cols-2 gap-y-2 gap-x-4 mt-3">
                  ${renderDetailRow(t.name, reservation.departureName || reservation.name, false, true, 'normal', 2)}
                  ${renderDetailRow(t.unitType, reservation.unitType)}
                  ${renderDetailRow(t.pax, reservation.peopleCountDeparture || reservation.peopleCount, false, true)}
                  ${renderDetailRow(t.date, reservation.dateDeparture)}
                </div>
                
                ${(reservation.includedThings || reservation.notIncludedThings) ? `
                  <div class="mt-3 grid grid-cols-2 gap-2">
                    ${reservation.includedThings ? `
                      <div class="bg-green-50/50 p-2 rounded-lg border border-green-100/50">
                        <span class="text-[6px] font-black uppercase text-green-600">${t.included}:</span>
                        <p class="text-[8px] text-slate-600 leading-tight whitespace-pre-wrap">${esc(reservation.includedThings)}</p>
                      </div>
                    ` : ''}
                    ${reservation.notIncludedThings ? `
                      <div class="bg-red-50/50 p-2 rounded-lg border border-red-100/50">
                        <span class="text-[6px] font-black uppercase text-red-600">${t.notIncluded}:</span>
                        <p class="text-[8px] text-slate-600 leading-tight whitespace-pre-wrap">${esc(reservation.notIncludedThings)}</p>
                      </div>
                    ` : ''}
                  </div>
                ` : ''}

                ${reservation.circuitoLegs && reservation.circuitoLegs.length > 0 ? `
                  <div class="mt-3 pt-3 border-t border-gray-100 space-y-2">
                    ${reservation.circuitoLegs.map((leg, i) => `
                      <div class="grid grid-cols-2 gap-x-2 gap-y-1 text-[9px] bg-slate-50/50 p-2 rounded-lg">
                        <span class="font-bold uppercase text-green-600 col-span-2 text-[7px]">${t.day} #${i+1}</span>
                        ${renderDetailRow(t.date, leg.date)}
                        ${renderDetailRow(t.schedule, leg.schedule)}
                        ${leg.pricePerDay ? renderDetailRow(t.pricePerDay, leg.pricePerDay, false, true, 'normal', 2) : ''}
                        ${renderDetailRow(t.placesToVisit, leg.placesToVisit, false, false, 'normal', 2)}
                        ${renderDetailRow(t.entranceCosts, leg.entranceCosts, false, false, 'normal', 2)}
                        ${leg.observations ? `
                          <div class="col-span-2 bg-green-50/30 p-1.5 rounded border border-green-100/50 mt-1">
                            <span class="text-[6px] font-black uppercase text-green-600 block">Observaciones:</span>
                            <p class="text-[8px] text-slate-700 leading-tight italic">${esc(leg.observations)}</p>
                          </div>
                        ` : ''}
                      </div>
                    `).join('')}
                  </div>
                ` : ''}
              </div>
            ` : ''}
          </div>
        </div>

        <!-- RIGHT COLUMN: Financials & Instructions -->
        <div class="col-span-12 md:col-span-5 space-y-4">
          
          <!-- Financial Summary -->
          <div class="bg-white rounded-xl border-2 border-slate-100 p-4 space-y-3 shadow-sm">
            <h4 class="text-[9px] font-black uppercase tracking-widest text-gray-800 border-b border-gray-50 pb-1.5 flex items-center gap-2">
              <i class="fas fa-wallet text-slate-400"></i> ${t.balanceService}
            </h4>
            <div class="grid grid-cols-2 gap-4">
              <!-- MXN Column -->
              <div class="space-y-2">
                <p class="text-[7px] font-black uppercase text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded inline-block">MXN</p>
                <div>
                  <span class="text-[7px] font-bold text-gray-400 uppercase block">${t.deposit}</span>
                  <span class="text-base font-black text-slate-800 tracking-tighter">$${esc(reservation.depositMxn)}</span>
                </div>
                <div>
                  <span class="text-[7px] font-bold text-gray-400 uppercase block">${t.toPay}</span>
                  <span class="text-lg font-black text-[#f05a28] tracking-tighter">$${esc(reservation.toPayMxn)}</span>
                </div>
              </div>
              
              <!-- USD Column -->
              <div class="space-y-2 border-l border-gray-50 pl-4">
                <p class="text-[7px] font-black uppercase text-green-600 bg-green-50 px-1.5 py-0.5 rounded inline-block">USD</p>
                <div>
                  <span class="text-[7px] font-bold text-gray-400 uppercase block">${t.deposit}</span>
                  <span class="text-base font-black text-slate-800 tracking-tighter">$${esc(reservation.depositUsd)}</span>
                </div>
                <div>
                  <span class="text-[7px] font-bold text-gray-400 uppercase block">${t.toPay}</span>
                  <span class="text-lg font-black text-[#f05a28] tracking-tighter">$${esc(reservation.toPayUsd)}</span>
                </div>
              </div>
            </div>
            
            <div class="pt-1.5 border-t border-gray-50 flex items-center gap-2">
              <div class="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse"></div>
              <span class="text-[8px] font-black text-orange-600 uppercase italic leading-none">${t.directPayment}</span>
            </div>
          </div>

          <!-- Travel Instructions -->
          <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <h4 class="text-[9px] font-black uppercase text-[#0a305e] mb-2">${t.travelInstructions}</h4>
            <ul class="space-y-2 text-[8px] font-bold text-slate-600 leading-tight">
              <li class="flex gap-2">
                <i class="fas fa-info-circle text-[#0a305e] mt-0.5 shrink-0"></i>
                <span>${t.instructionArrival}</span>
              </li>
              <li class="flex gap-2">
                <i class="fas fa-clock text-[#0a305e] mt-0.5 shrink-0"></i>
                <span>${t.instructionPickup}</span>
              </li>
              <li class="flex gap-2">
                <i class="fas fa-user-friends text-[#0a305e] mt-0.5 shrink-0"></i>
                <span>${t.instructionAssistance}</span>
              </li>
            </ul>
          </div>

          <!-- General Notes -->
          ${reservation.observations ? `
            <div class="bg-yellow-50/50 p-3 rounded-xl border border-yellow-100">
              <span class="block text-[7px] text-yellow-700 uppercase font-black mb-1">${t.generalNotes}</span>
              <p class="text-[8px] text-gray-700 font-medium italic leading-relaxed">"${esc(reservation.observations)}"</p>
            </div>
          ` : ''}

          <!-- Tips Notice -->
          <div class="p-3 border-l-4 border-red-500 bg-red-50/30 rounded-r-lg">
             <p class="text-[7px] text-red-700 font-black uppercase leading-tight">
               ${t.tips}
             </p>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="mt-6 pt-3 border-t border-gray-100 flex justify-between items-center relative z-10">
        <div class="flex items-center gap-3 text-[7px] text-gray-400 font-black uppercase tracking-[0.15em]">
          <span>© Quick Travel Cancun</span>
          <span class="w-0.5 h-0.5 bg-gray-200 rounded-full"></span>
          <span>${t.support}: quicktravelincancun@gmail.com</span>
        </div>
        <div class="text-[7px] text-[#0a305e] font-black uppercase tracking-[0.15em]">
          ${t.system}
        </div>
      </div>
    </div>
  </main>

  <!-- SCRIPT DE DESCARGA DIRECTA VÍA DATA URI -->
  <script>
    async function generateAndDownloadPDF() {
      const btn = document.getElementById('btn-download-pdf');
      const textSpan = document.getElementById('btn-download-text');
      const origText = textSpan ? textSpan.innerText : 'Descargar';
      
      btn.disabled = true;
      if (textSpan) textSpan.innerText = 'Generando...';
      
      try {
        const card = document.getElementById('voucher-card');
        const canvas = await html2canvas(card, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: '#ffffff',
          scrollX: 0,
          scrollY: 0
        });

        const imgData = canvas.toDataURL('image/png', 1.0);
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4'
        });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const margin = 8;
        const maxLineWidth = pdfWidth - (margin * 2);
        const maxHeight = pdfHeight - (margin * 2);

        const imgProps = pdf.getImageProperties(imgData);
        const ratio = imgProps.width / imgProps.height;

        let displayWidth = maxLineWidth;
        let displayHeight = displayWidth / ratio;

        if (displayHeight > maxHeight) {
          displayHeight = maxHeight;
          displayWidth = displayHeight * ratio;
        }

        const xOffset = (pdfWidth - displayWidth) / 2;
        const yOffset = margin;

        pdf.addImage(imgData, 'PNG', xOffset, yOffset, displayWidth, displayHeight);

        // Convertir a Data URI estricto application/pdf
        const rawDataUri = pdf.output('datauristring');
        const cleanDataUri = rawDataUri.startsWith('data:application/pdf') 
          ? rawDataUri 
          : 'data:application/pdf;base64,' + rawDataUri.split(',')[1];

        const dlLink = document.createElement('a');
        dlLink.href = cleanDataUri;
        dlLink.download = '${filename}';
        dlLink.target = '_blank';
        dlLink.rel = 'noopener noreferrer';
        document.body.appendChild(dlLink);
        dlLink.click();
        setTimeout(() => {
          if (document.body.contains(dlLink)) document.body.removeChild(dlLink);
        }, 2000);
      } catch (err) {
        console.error('Error generando PDF vía Data URI:', err);
        // Fallback nativo: ejecutar impresión directa
        window.print();
      } finally {
        btn.disabled = false;
        if (textSpan) textSpan.innerText = origText;
      }
    }
  </script>
</body>
</html>`;
};

/**
 * Abre el voucher en una ventana limpia con blob HTML puro
 */
export const openVoucherCleanWindow = (
  reservation: Reservation,
  language: 'es' | 'en' = 'es',
  pdfSingleTourIndex: number | null = null
): void => {
  const html = generateVoucherHTML(reservation, language, pdfSingleTourIndex);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);

  const win = window.open(blobUrl, '_blank', 'noopener,noreferrer');
  if (!win) {
    // Si el navegador bloqueó window.open, forzamos mediante click en anchor _blank
    const a = document.createElement('a');
    a.href = blobUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (document.body.contains(a)) document.body.removeChild(a);
    }, 2500);
  }
};
